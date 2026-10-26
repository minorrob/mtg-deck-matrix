/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE FEEDBACK STORE (the feedback loop, PR 1; docs/feedback-loop/PLAN-2026-10-26.html, section 2; migration 0009).
 *
 * A report lands here as a row before anything else sees it, and every later step of the loop writes its state back to
 * the row: new -> triaged (the Linear issue) -> approved (Rob's label) -> in-progress (a branch) -> released (the commit
 * of main that shipped it) -> notified (the thank-you email's message id). Each move is to the next state and no other,
 * and carries what that state needs (feedback-schema.js, REQUIRES).
 *
 * Who may do what (cloud/worker.mjs holds the routes):
 *   POST  /api/feedback                 any signed-in person, 10 reports an hour each, counted here in the rows
 *   GET   /api/admin/feedback           the owner, and the triage agent's service token
 *   PATCH /api/admin/feedback/:id       the same two
 *
 * The reporter is the person the Access token names, never anything the sheet sent. A screenshot is not kept until R2
 * is on (Rob's call D4, on the plan's default): a report that carried one says so in `screenshot: "dropped"`, and the
 * bytes are not written anywhere.
 */
import schema from "../feedback-schema.js";

const {readReport, readPatch, mayMove, nextState, STATES, GROUPS} = schema;
export const {FeedbackInvalid} = schema;

/** Reports one person may file in a rolling hour (the plan, section 2). */
export const HOURLY_LIMIT = 10;
const HOUR = 3_600_000;
/** The most rows one admin page lists. */
export const PAGE = 200;

/** A refusal with the status it is answered with, and what to do. */
export class FeedbackRefused extends Error {
  constructor(status, message, extra = {}) {super(message); this.name = "FeedbackRefused"; this.status = status; Object.assign(this, extra);}
}

/** The CrankMagic owner: the address OWNER_EMAIL names (the access groups of the AI players plan, cloud/access.mjs's
    groupOf once it is on main), in any letter case; until Rob sets it, the administrator the release names
    (INVITE_ADMIN_ID, cloud/sharing.mjs's "Only the CrankMagic administrator can invite new accounts") stands in. */
export const isOwner = (env, person) => !!person && (
  (String(env.OWNER_EMAIL || "").trim() !== "" && String(person.email || "").toLowerCase() === String(env.OWNER_EMAIL).trim().toLowerCase()) ||
  (String(env.INVITE_ADMIN_ID || "") !== "" && String(person.id) === String(env.INVITE_ADMIN_ID)));
/** The reporter's group as this store writes it: owner, else general (insiders come with the access groups). */
export const feedbackGroup = (env, person) => (isOwner(env, person) ? "owner" : "general");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COLUMNS = "id, reporter, reporter_group, kind, state, route, build_commit, build_profile, report, screenshot, issue, pr, release_commit, message_id, created_at, updated_at";

/** A row as the admin routes answer it: the report's fields, and the loop's. */
export function describe(row) {
  if (!row) return null;
  let report;
  try {report = JSON.parse(row.report);} catch {report = {};}
  return {
    id: row.id, state: row.state, reporter: row.reporter, group: row.reporter_group,
    ...report,
    screenshot: row.screenshot ?? null,
    issue: row.issue ?? null, pr: row.pr ?? null, release: row.release_commit ?? null, messageId: row.message_id ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function createFeedback(db, {now = () => new Date().toISOString(), newId = () => crypto.randomUUID()} = {}) {
  const one = (id) => db.prepare(`SELECT ${COLUMNS} FROM feedback WHERE id = ?1`).bind(id).first();

  return {
    /**
     * File a report for `person` ({email, group}). The reporter is the person, whatever the report says.
     * @throws {FeedbackInvalid} over a bound or short a field; {FeedbackRefused} 429 at the hourly limit
     */
    async file(person, input) {
      const report = readReport(input);
      const at = now(), since = new Date(Date.parse(at) - HOUR).toISOString();
      const recent = await db.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM feedback WHERE reporter = ?1 AND created_at > ?2").bind(person.email, since).first();
      if (Number(recent.n) >= HOURLY_LIMIT) {
        const retryAfterSeconds = Math.max(1, Math.ceil((Date.parse(recent.oldest) + HOUR - Date.parse(at)) / 1000));
        throw new FeedbackRefused(429, `You have sent ${HOURLY_LIMIT} reports in the last hour, the most CrankMagic takes from one person. Nothing was saved. Wait ${Math.ceil(retryAfterSeconds / 60)} minute${retryAfterSeconds > 60 ? "s" : ""}, then send it again.`, {retryAfterSeconds});
      }
      const {screenshot, ...kept} = report;
      const id = newId(), group = GROUPS.includes(person.group) ? person.group : "general";
      await db.prepare(`INSERT INTO feedback (${COLUMNS}) VALUES (?1, ?2, ?3, ?4, 'new', ?5, ?6, ?7, ?8, ?9, NULL, NULL, NULL, NULL, ?10, ?10)`)
        .bind(id, person.email, group, kept.kind, kept.page.route, kept.build.commit, kept.build.profile, JSON.stringify(kept), screenshot ? "dropped" : null, at).run();
      return describe(await one(id));
    },

    /** The rows, oldest first: those created after `since`, in `state`, at most `limit` (PAGE at most). */
    async list({since, state, limit} = {}) {
      const where = [], args = [];
      if (since) {
        const t = Date.parse(String(since));
        if (!Number.isFinite(t)) throw new FeedbackRefused(400, "since is not a date.");
        where.push(`created_at > ?${args.push(new Date(t).toISOString())}`);
      }
      if (state) {
        if (!STATES.includes(state)) throw new FeedbackRefused(400, `state must be one of ${STATES.join(", ")}.`);
        where.push(`state = ?${args.push(state)}`);
      }
      const n = Math.min(PAGE, Math.max(1, Number(limit) || PAGE));
      const rows = await db.prepare(`SELECT ${COLUMNS} FROM feedback${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at, id LIMIT ${n}`).bind(...args).all();
      return (rows.results || []).map(describe);
    },

    /** One row, or null. */
    async get(id) {return UUID.test(String(id)) ? describe(await one(id)) : null;},

    /**
     * Move a row, or attach facts to it: `state` must be the row's next state; `issue`, `pr`, `release` and
     * `messageId` are written as given.
     * @throws {FeedbackInvalid} a bad field; {FeedbackRefused} 404 no such row, 409 a move that is not the next
     */
    async patch(id, input) {
      const change = readPatch(input);
      const row = UUID.test(String(id)) ? await one(id) : null;
      if (!row) throw new FeedbackRefused(404, "No such feedback.");
      if (change.state !== undefined && !mayMove(row.state, change.state)) {
        const next = nextState(row.state);
        throw new FeedbackRefused(409, `This feedback is ${row.state}${next ? `; the only move from there is to ${next}` : ", the end of the loop"}. Nothing was changed.`, {state: row.state});
      }
      const sets = ["updated_at = ?2"], args = [id, now()];
      if (change.state !== undefined) sets.push(`state = ?${args.push(change.state)}`);
      if (change.issue !== undefined) sets.push(`issue = ?${args.push(change.issue)}`);
      if (change.pr !== undefined) sets.push(`pr = ?${args.push(change.pr)}`);
      if (change.release !== undefined) sets.push(`release_commit = ?${args.push(change.release)}`);
      if (change.messageId !== undefined) sets.push(`message_id = ?${args.push(change.messageId)}`);
      await db.prepare(`UPDATE feedback SET ${sets.join(", ")} WHERE id = ?1`).bind(...args).run();
      return describe(await one(id));
    },
  };
}
