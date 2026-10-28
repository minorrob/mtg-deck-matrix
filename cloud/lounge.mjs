/* THE LOUNGE'S SERVER SIDE (docs/ui-lane/lounge-contract.md): the registry of live tables, the people a host may invite, the
 * results the leaderboard reads, and the leaderboard. Like cloud/tables.mjs it imports nothing from game/, so the Worker that
 * ships today does not carry the engine: the table (game/room/lounge.mjs) hands the registry a summary, and this file keeps and
 * serves it.
 *
 * THE REGISTRY is one more object of the TABLES binding, named so that no table's id can be it (a hyphen, as `cards-known`):
 * the same Durable Object class answers `/lounge/*` when it is that object (cloud/game-room.mjs), so a release needs no new
 * binding or class migration. Each table reports its summary there on every change; an entry that has not been reported for a
 * day is dropped when it is next read; a table that is over reports itself unlisted.
 *
 * ADDRESSES stay in the Worker. A summary arrives with `members`, the addresses of its seats and organizer, which the registry
 * matches the caller against (private tables are the seats', the organizer's and the admin's) and never returns.
 */

/* The levels a table may seat now, as `GET /api/ai-seat` says them: the roster's available ones other than the AI on Claude, which is
   `open`'s. A copy of game/engine/pilots/roster.mjs's answer, since this file imports nothing from game/; tests/lounge-registry.mjs
   proves the two agree. */
export const SEATABLE_LEVELS = Object.freeze(["easy", "normal", "hard"]);

export const REGISTRY = "lounge-registry";
export const ENTRY_TTL = 24 * 3600 * 1000;
const PHASES = ["selecting", "countdown", "starting", "playing"];
const TABLE_ID = /^[a-z0-9]{8,40}$/;

export class Registry {
  /** @param {{get: Function, put: Function, delete: Function, list: Function}} storage  a Durable Object's own */
  constructor(storage) {this.storage = storage;}

  async report(entry, now) {
    if (!entry || typeof entry !== "object" || !TABLE_ID.test(String(entry.tableId))) return {ok: false};
    const key = `t/${entry.tableId}`;
    if (entry.listed === false) {await this.storage.delete(key); return {ok: true, listed: false};}
    await this.storage.put(key, JSON.stringify({...entry, at: now}));
    return {ok: true, listed: true};
  }

  /** Every entry still fresh, expired ones dropped as they are met. */
  async entries(now) {
    const found = [], listed = await this.storage.list({prefix: "t/"});
    for (const [key, text] of listed) {
      let entry = null;
      try {entry = JSON.parse(text);} catch {/* a damaged entry is dropped below */}
      if (!entry || !Number.isFinite(entry.at) || now - entry.at > ENTRY_TTL) {await this.storage.delete(key); continue;}
      found.push(entry);
    }
    return found.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  /** The lounge's Live games: public tables in the lobby or being played, private ones to the caller who sits or organizes
      them, every one to the admin. */
  async live({email, admin = false, now}) {
    const games = [];
    for (const e of await this.entries(now)) {
      if (!PHASES.includes(e.phase)) continue;
      const mine = Array.isArray(e.members) && e.members.includes(email);
      if (e.privacy !== "public" && !mine && !admin) continue;
      games.push({tableId: e.tableId, location: e.location, organizer: e.organizer, commander: e.commander ?? null, mechanic: e.mechanic ?? "",
        privacy: e.privacy, ai: e.ai, human: e.human, open: e.open, startedAt: e.startedAt ?? null,
        roster: (e.roster || []).map(({name, ai, commander, mechanic}) => ({name, ai, commander: commander ?? null, mechanic: mechanic ?? ""})), mine});
    }
    return {games};
  }

  /** The caller's own unfinished tables, newest first: Resume game, on any device. */
  async mine({email, now}) {
    const tables = [];
    for (const e of await this.entries(now)) {
      if (!PHASES.includes(e.phase) || !(Array.isArray(e.members) && e.members.includes(email))) continue;
      tables.push({tableId: e.tableId, phase: e.phase, organizer: e.organizer, summary: e.summary, ...(Number.isInteger(e.turn) ? {turn: e.turn} : {})});
    }
    return {tables};
  }
}

/* ---- the people a host may invite (contract §2) ---- */

const titled = (text) => text.replace(/[._+-]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** A person's display name as the cloud has it (a profile's, else the one the person was invited under), or "". Best effort:
    a database without the sharing tables answers "". */
export async function nameOf(db, email) {
  if (!db || !email || email.startsWith("service:")) return "";
  try {
    const profile = await db.prepare("SELECT p.name AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.email = ?").bind(email).first();
    if (profile && profile.name) return String(profile.name).trim().slice(0, 60);
  } catch {/* no profiles table yet */}
  try {
    const invited = await db.prepare("SELECT name FROM account_invitations WHERE email = ?").bind(email).first();
    if (invited && invited.name) return String(invited.name).trim().slice(0, 60);
  } catch {/* no invitations table yet */}
  return "";
}

/** CrankMagic's people matched on a display name or the start of the part of the address before the @: at most 8, never the
    caller, never an address. `handle` is a slug of the name, no part of the address. */
export async function searchUsers(db, email, query) {
  const q = String(query ?? "").trim().toLowerCase().slice(0, 60);
  if (q.length < 2 || !db) return {users: []};
  const like = q.replace(/[\\%_]/g, "\\$&");
  let rows = [];
  try {
    rows = (await db.prepare(`SELECT u.email AS email, COALESCE(NULLIF(p.name, ''), a.name, '') AS name
      FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN account_invitations a ON a.email = u.email
      WHERE u.email NOT LIKE 'service:%' AND u.email <> ?1 AND (lower(COALESCE(NULLIF(p.name, ''), a.name, '')) LIKE ?2 ESCAPE '\\' OR u.email LIKE ?3 ESCAPE '\\')
      ORDER BY 2, 1 LIMIT 40`).bind(email, `%${like}%`, `${like}%`).all()).results || [];
  } catch {
    try {
      rows = (await db.prepare("SELECT email, '' AS name FROM users WHERE email NOT LIKE 'service:%' AND email <> ?1 AND email LIKE ?2 ESCAPE '\\' ORDER BY 1 LIMIT 40")
        .bind(email, `${like}%`).all()).results || [];
    } catch {rows = [];}
  }
  const seen = new Set(), users = [];
  for (const row of rows) {
    const name = String(row.name || "").trim() || titled(String(row.email).split("@")[0]);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    users.push({name: name.slice(0, 60), handle: slug(name) || "player"});
    if (users.length === 8) break;
  }
  return {users};
}

/* ---- results and the leaderboard (contract §1, §6; migration 0010_match_results.sql) ---- */

/** A finished game's rows, once: one per person's seat, never an AI seat. Keyed by (match, seat), so a retry writes nothing twice. */
export async function recordResults(db, rows, {matchId, now}) {
  const at = new Date(now).toISOString();
  for (const r of rows) {
    await db.prepare(`INSERT OR IGNORE INTO match_results (match_id, seat_id, email, name, outcome, humans, ai, turns, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(matchId, r.seatId, r.email, String(r.name || "A player").slice(0, 60), r.outcome, r.humans ?? 1, r.ai ?? 0, r.turns ?? null, at).run();
  }
}

/** The leaderboard: per person, from the games the server finished. `{rows: []}` until the table exists. */
export async function leaderboard(db, email) {
  if (!db) return {rows: []};
  let found;
  try {
    found = (await db.prepare(`SELECT r.email AS email, SUM(r.outcome = 'win') AS wins, SUM(r.outcome = 'loss') AS losses, SUM(r.outcome = 'tie') AS ties,
        SUM(r.outcome = 'unfinished') AS unfinished,
        (SELECT n.name FROM match_results n WHERE n.email = r.email ORDER BY n.ended_at DESC LIMIT 1) AS name
      FROM match_results r GROUP BY r.email ORDER BY wins DESC, losses ASC, name ASC LIMIT 100`).all()).results || [];
  } catch {return {rows: []};}
  return {rows: found.map((r) => ({name: String(r.name || "A player"), wins: Number(r.wins) || 0, losses: Number(r.losses) || 0, ties: Number(r.ties) || 0,
    unfinished: Number(r.unfinished) || 0, you: r.email === email}))};
}
