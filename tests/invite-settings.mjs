/* THE SHARING SERVICE'S INVITATIONS (ROB-320; docs/program/rob-320-invitations-contract.md §3, §7), the server half of the Settings
 * window and of Create game: who may invite, the group, the cap, the record, the email, and the game's email with the lobby link.
 * Real SQLite with the real migrations; a faked Cloudflare Access and a faked Resend. Nothing here has touched either.
 *
 *   anyone signed in may invite (the cap is the limit), as General; only the owner may choose Game Theory Insider
 *   a send answers {status: "sent", group}; the older gate (a service principal is no one) holds
 *   a game's invitation emails the lobby link and the invitee's name, once, however many times it is sent again
 */
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {sharing, ShareError} from "../cloud/sharing.mjs";
import {createLibrary} from "../cloud/library.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const rejects = async (fn, status, re, m) => {await assert.rejects(fn, (e) => e instanceof ShareError && e.status === status && re.test(e.message), m); checks += 1;};

const raw = new DatabaseSync(":memory:");
raw.exec("PRAGMA foreign_keys = ON");
for (const f of ["0001_accounts", "0002_ai", "0003_sharing", "0004_mail_retries", "0005_access_invites", "0011_invitations"])
  raw.exec(readFileSync(new URL(`../cloud/migrations/${f}.sql`, import.meta.url), "utf8"));
const stmt = (sql, args = []) => ({
  bind: (...v) => stmt(sql, v),
  first: async () => raw.prepare(sql).get(...args) ?? null,
  all: async () => ({results: raw.prepare(sql).all(...args)}),
  run: async () => ({meta: {changes: Number(raw.prepare(sql).run(...args).changes)}}),
  sync: () => ({meta: {changes: Number(raw.prepare(sql).run(...args).changes)}}),
});
const db = {prepare: (s) => stmt(s), batch: async (list) => list.map((x) => x.sync())};
const lib = createLibrary(db);
const owner = await lib.user("rob@example.com"), maya = await lib.user("maya@example.com"), sam = await lib.user("sam@example.com");

const APP = "aaaaaaaa-0000-0000-0000-000000000001", GEN = "cccccccc-0000-0000-0000-000000000001", INS = "dddddddd-0000-0000-0000-000000000001";
const env = {INVITE_ADMIN_ID: String(owner.id), OWNER_EMAIL: "rob@example.com", RESEND_API_KEY: "test-only", SHARING_ENABLED: "on", ACCESS_INVITE_TOKEN: "test-only",
  CLOUDFLARE_ACCOUNT_ID: "0".repeat(32), ACCESS_INVITE_APP_IDS: APP, ACCESS_INVITE_POLICY_ID_GENERAL: GEN, ACCESS_INVITE_POLICY_ID_INSIDER: INS,
  INVITE_LINK_ORIGIN: "https://crankmagic.com"};
const policies = new Map([GEN, INS].map((id) => [id, {id, reusable: true, app_count: 1, decision: "allow", name: id, include: []}]));
const mail = []; let failMail = false, failAccess = false;
const fetchImpl = async (url, args) => {
  if (url === "https://api.resend.com/emails") {
    if (failMail) return Response.json({}, {status: 500});
    const body = JSON.parse(args.body); mail.push({...body, key: args.headers["Idempotency-Key"]}); return Response.json({id: crypto.randomUUID()});
  }
  if (url.endsWith(`/apps/${APP}`)) return Response.json({success: true, result: {name: "CrankMagic", domain: "crankmagic.com", policies: [{id: GEN}, {id: INS}]}});
  const id = [GEN, INS].find((p) => url.endsWith(`/policies/${p}`));
  if (args.method === "PUT") {if (failAccess) return Response.json({success: false}, {status: 403}); policies.set(id, {...policies.get(id), ...JSON.parse(args.body)});}
  return Response.json({success: true, result: policies.get(id)});
};
let clock = Date.parse("2026-10-31T12:00:00Z");
const svc = sharing(db, env, {now: () => new Date(clock += 1000).toISOString(), fetchImpl, cacheProjections: false});
const on = (id) => policies.get(id).include.filter((r) => r.email).map((r) => r.email.email);
const rowOf = (to) => ({...raw.prepare("SELECT inviter_email AS by, grp, source, status, table_id AS tableId FROM invitations WHERE invitee_email = ?").get(to)});

/* 1. Who may invite, and as what. */
eq([(await svc.profile(maya)).canInvite, (await svc.profile(maya)).isAdmin, (await svc.profile(owner)).canInvite, (await svc.profile(owner)).isAdmin], [true, false, true, true], "anyone signed in may invite; only the administrator is the administrator");
let r = await svc.invite(maya, {name: "Bob Lee", email: "bob@example.com"}, "https://staging.example");
eq([r.status, r.group, on(GEN), on(INS), rowOf("bob@example.com")], ["sent", "general", ["bob@example.com"], [], {by: "maya@example.com", grp: "general", source: "settings", status: "admitted", tableId: null}], "a non-owner's invitation is General: sent, on the General policy, recorded");
await rejects(() => svc.invite(maya, {name: "Dan", email: "dan@example.com", group: "insider"}, "https://staging.example"), 403, /Only the CrankMagic owner can give .*AI/, "a non-owner cannot grant AI, the server says so");
eq([mail.length, raw.prepare("SELECT count(*) AS n FROM invitations WHERE invitee_email = 'dan@example.com'").get().n], [1, 0], "and nothing was sent or recorded for it");
r = await svc.invite(owner, {name: "Ann Fox", email: "ann@example.com"}, "https://staging.example");
eq([r.group, on(INS), raw.prepare("SELECT email FROM ai_allowlist").all().map((x) => x.email)], ["insider", ["ann@example.com"], ["ann@example.com"]], "the owner's invitation is Game Theory Insider by default, with the AI roster row");
r = await svc.invite(owner, {name: "Cy Hall", email: "cy@example.com", group: "general"}, "https://staging.example");
eq([r.group, on(GEN).includes("cy@example.com"), on(INS).includes("cy@example.com")], ["general", true, false], "and the owner may choose General");
eq(mail.at(-1).html.includes("Hi Cy Hall,"), true, "the settings email is the invitation, as before");
for (const person of [{...owner, email: "service:x"}, {...owner, service: true}])
  await rejects(() => svc.invite(person, {name: "X", email: "x@example.com"}, "https://staging.example"), 403, /person/i, "a service principal is no one, even with the owner's id");
checks += 0;

/* 2. A sixth invitation. */
for (const n of ["p1", "p2", "p3", "p4"]) await svc.invite(maya, {name: n, email: `${n}@example.com`}, "https://staging.example");
const sentBefore = mail.length;
await rejects(() => svc.invite(maya, {name: "Six", email: "six@example.com"}, "https://staging.example"), 409, /already invited 5 people.*nothing was sent/s, "a sixth is refused with the cap");
eq([mail.length, on(GEN).includes("six@example.com")], [sentBefore, false], "no email, no admission");
eq((await svc.invite(maya, {name: "Bob Lee", email: "bob@example.com"}, "https://staging.example")).status, "sent", "sending to someone already invited again is allowed and is no sixth");

/* 3. Admission failing: nothing is sent, the row waits, the same send finishes it. */
failAccess = true;
await rejects(() => svc.invite(owner, {name: "Eve", email: "eve@example.com"}, "https://staging.example"), 502, /send the same invitation again/, "admission failing says to send it again");
failAccess = false;
const sent = mail.length;
eq([rowOf("eve@example.com").status, mail.length], ["pending", sent], "the row waits and no email went");
r = await svc.invite(owner, {name: "Eve", email: "eve@example.com"}, "https://staging.example");
eq([r.status, rowOf("eve@example.com").status, mail.length], ["sent", "admitted", sent + 1], "and the same send finishes it");

/* 4. A game's invitation: the lobby link and the invitee's name, once. */
const lobby = "https://crankmagic.com/api/join/tablealpha1";
const game = (who, to, extra = {}) => svc.inviteToGame(who, {to, name: "Gil Moss", hostName: "Maya", tableId: "tablealpha1", ...extra}, "https://staging.example");
mail.length = 0;
const g1 = await game(owner, "gil@example.com");
const gm = mail[0];
eq([g1.status, g1.group, rowOf("gil@example.com")], ["sent", "insider", {by: "rob@example.com", grp: "insider", source: "game", status: "admitted", tableId: "tablealpha1"}], "a game's guest of the owner is recorded with the game, and is an Insider");
ok(gm.to[0] === "gil@example.com" && /Maya/.test(gm.subject) && gm.text.startsWith("Hi Gil Moss,") && gm.text.endsWith(`\n\n${lobby}`), "the text names the invitee and ends on the lobby link");
ok(gm.html.includes("Hi Gil Moss,") && gm.html.includes(`href="${lobby}"`) && gm.html.includes("Maya") && !/\{\{\w+\}\}/.test(gm.html), "the HTML does too, every token filled");
ok(!gm.text.includes("api/auth/login") && !gm.html.includes("api/auth/login"), "and it is not the plain sign-in link");
await game(owner, "gil@example.com");
eq(mail.length, 1, "inviting him to the same game again does not send it twice");
eq(mail[0].key.startsWith("crankmagic-mail/game:tablealpha1:"), true, "(one provider idempotency key per table and person)");
failMail = true;
const g2 = await game(sam, "hal@example.com", {name: "Hal <b>Ng</b>"});
failMail = false;
eq([g2.status, g2.group, mail.length], ["failed", "general", 1], "an email that fails is reported, and the invitation stands");
const g3 = await game(sam, "hal@example.com", {name: "Hal <b>Ng</b>"});
eq([g3.status, mail.length, mail[1].to[0]], ["sent", 2, "hal@example.com"], "sending it again delivers it once");
ok(mail[1].html.includes("Hi Hal &lt;b&gt;Ng&lt;/b&gt;,") && !mail[1].html.includes("<b>Ng</b>"), "the name is escaped in the HTML");
const registeredGuest = await game(owner, "maya@example.com", {name: "Maya"});
eq([registeredGuest.status, registeredGuest.group, raw.prepare("SELECT count(*) AS n FROM invitations WHERE invitee_email = 'maya@example.com'").get().n, mail.at(-1).to[0]], ["sent", "general", 0, "maya@example.com"], "someone with an account is emailed the link, stays General, and has no row");

console.log(`invite-settings: ${checks} checks passed`);
