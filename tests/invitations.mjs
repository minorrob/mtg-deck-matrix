/* INVITING A PERSON (ROB-320; docs/program/rob-320-invitations-contract.md §3-§5): the one place an address is admitted, for
 * Settings and for Create game alike. Real SQLite with the real migrations, a faked Cloudflare Access and a faked clock.
 * Nothing here has touched real Cloudflare.
 *
 *   group     the owner's invitation is Game Theory Insider unless they choose General; anyone else's is General, and a
 *             non-owner who asks for Insider is refused (403) with the way out
 *   policy    each group is written to its own policy; Insider also gets an ai_allowlist row (the Worker's AI gate)
 *   record    a row (who, whom, when, group) is written BEFORE the admission; no admission without a row
 *   retry     admission failing after the row leaves it 'pending', sends nothing, and the same invitation again finishes it
 *             with no second slot
 *   cap       five invitees per user, the owner too; only a new account costs a slot; the refusal names the cap and the way out
 */
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {inviteAddress, vetInvitees, INVITE_CAP, capOf} from "../cloud/invitations.mjs";
import {groupOf} from "../cloud/access.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const refuses = async (p, status, re, m) => {await assert.rejects(p, (e) => e.status === status && re.test(e.message), m); checks += 1;};

const raw = new DatabaseSync(":memory:");
raw.exec("PRAGMA foreign_keys = ON");
for (const f of ["0001_accounts", "0002_ai", "0003_sharing", "0005_access_invites", "0011_invitations"])
  raw.exec(readFileSync(new URL(`../cloud/migrations/${f}.sql`, import.meta.url), "utf8"));
const stmt = (sql, args = []) => ({
  bind: (...v) => stmt(sql, v),
  first: async () => raw.prepare(sql).get(...args) ?? null,
  all: async () => ({results: raw.prepare(sql).all(...args)}),
  run: async () => ({meta: {changes: Number(raw.prepare(sql).run(...args).changes)}}),
});
const db = {prepare: (s) => stmt(s)};
const user = (email) => {raw.prepare("INSERT INTO users (email, created_at, seen_at) VALUES (?, 't', 't')").run(email); return {id: raw.prepare("SELECT id FROM users WHERE email = ?").get(email).id, email};};
const OWNER = user("rob@example.com"), MAYA = user("maya@example.com"), SAM = user("sam@example.com");

const APP = "aaaaaaaa-0000-0000-0000-000000000001", GEN = "cccccccc-0000-0000-0000-000000000001", INS = "dddddddd-0000-0000-0000-000000000001";
const env = {OWNER_EMAIL: "rob@example.com", ACCESS_INVITE_TOKEN: "test-only", CLOUDFLARE_ACCOUNT_ID: "0".repeat(32), ACCESS_INVITE_APP_IDS: APP,
  ACCESS_INVITE_POLICY_ID_GENERAL: GEN, ACCESS_INVITE_POLICY_ID_INSIDER: INS};
const policies = new Map([GEN, INS].map((id) => [id, {id, reusable: true, app_count: 1, decision: "allow", name: id, include: [{email: {email: "owner-seed@example.com"}}]}]));
let failWrites = false, calls = [];
const fetchImpl = async (url, args) => {
  calls.push(`${args.method} ${url.split("/access/")[1]}`);
  if (url.endsWith(`/apps/${APP}`)) return Response.json({success: true, result: {name: "CrankMagic", domain: "crankmagic.com", policies: [{id: GEN}, {id: INS}]}});
  const id = [GEN, INS].find((p) => url.endsWith(`/policies/${p}`));
  assert.ok(id, "only the two group policies are called");
  if (args.method === "PUT") {
    if (failWrites) return Response.json({success: false}, {status: 403});
    policies.set(id, {...policies.get(id), ...JSON.parse(args.body)});
  }
  return Response.json({success: true, result: policies.get(id)});
};
const onPolicy = (id) => policies.get(id).include.filter((r) => r.email).map((r) => r.email.email);
const fail = (message, status = 400) => {const e = new Error(message); e.status = status; throw e;};
let clock = Date.parse("2026-10-31T12:00:00Z");
const now = () => new Date(clock += 1000).toISOString();
const invite = (inviter, to, extra = {}) => inviteAddress(db, env, {inviter, to, name: extra.name ?? to.split("@")[0], source: "settings", now, fetchImpl, fail, ...extra});
const rows = () => raw.prepare("SELECT invitee_email AS to_, inviter_email AS by, grp, source, status, table_id AS tableId FROM invitations ORDER BY created_at").all();
const insiders = () => raw.prepare("SELECT email FROM ai_allowlist ORDER BY email").all().map((r) => r.email);

/* 1. The default group is the inviter's: the owner's guests are Insiders, everyone else's are General. */
eq([capOf({}), capOf({INVITE_CAP: "8"}), capOf({INVITE_CAP: "0"}), capOf({INVITE_CAP: "x"}), INVITE_CAP], [5, 8, 5, 5, 5], "the cap is 5, and INVITE_CAP overrides it with a positive integer only");
const a = await invite(OWNER, "ann@example.com");
eq([a.group, a.created, a.access.map((x) => x.added)], ["insider", true, [true]], "the owner's invitation defaults to Game Theory Insider");
eq([onPolicy(INS).includes("ann@example.com"), onPolicy(GEN).includes("ann@example.com"), insiders()], [true, false, ["ann@example.com"]], "on the Insider policy only, and in the AI roster");
eq(await groupOf("ann@example.com", env, db), "insider", "so the Worker's own gate reads her as an Insider");
const b = await invite(MAYA, "bob@example.com");
eq([b.group, onPolicy(GEN).includes("bob@example.com"), onPolicy(INS).includes("bob@example.com"), insiders()], ["general", true, false, ["ann@example.com"]], "anyone else's is General: the General policy, no AI roster row");
eq(await groupOf("bob@example.com", env, db), "general", "and the Worker reads him as General");
const c = await invite(OWNER, "cy@example.com", {group: "general"});
eq([c.group, onPolicy(GEN).includes("cy@example.com"), insiders().includes("cy@example.com")], ["general", true, false], "the owner may choose General");

/* 2. Only the owner may grant AI. */
await refuses(invite(MAYA, "dan@example.com", {group: "insider"}), 403, /Only the CrankMagic owner can give .*AI.*Invite them as General/, "a non-owner cannot grant AI, and is told what to do");
eq([rows().some((r) => r.to_ === "dan@example.com"), onPolicy(INS).includes("dan@example.com"), onPolicy(GEN).includes("dan@example.com")], [false, false, false], "and nothing was recorded or admitted");
await refuses(invite(OWNER, "x@example.com", {group: "admin"}), 400, /Game Theory Insider or General/, "an unknown group is refused");

/* 3. The record. */
eq(rows().map((r) => [r.to_, r.by, r.grp, r.source, r.status]), [["ann@example.com", "rob@example.com", "insider", "settings", "admitted"],
  ["bob@example.com", "maya@example.com", "general", "settings", "admitted"], ["cy@example.com", "rob@example.com", "general", "settings", "admitted"]], "every invitation is a row: whom, by whom, group, where from, admitted");
const when = raw.prepare("SELECT created_at, admitted_at FROM invitations WHERE invitee_email = 'ann@example.com'").get();
ok(when.created_at < when.admitted_at, "the row was written before the admission and stamped after it");
const g = await invite(MAYA, "gil@example.com", {source: "game", tableId: "tablealpha1"});
eq(rows().find((r) => r.to_ === "gil@example.com").tableId, "tablealpha1", "a game's invitation records the game");
eq({...raw.prepare("SELECT status, invited_by FROM account_invitations WHERE email = 'gil@example.com'").get()}, {status: "admitted", invited_by: MAYA.id}, "and the older invitation list (names, Admin) is kept alongside");

/* 4. Idempotence: the same person again spends nothing and writes nothing. */
calls = [];
const again = await invite(MAYA, "bob@example.com");
eq([again.already, again.created, calls], [true, false, []], "inviting an admitted person again reads nothing and writes nothing");
const other = await invite(SAM, "bob@example.com");
eq([other.already, rows().filter((r) => r.to_ === "bob@example.com").length, raw.prepare("SELECT count(*) AS n FROM invitations WHERE inviter_id = ?").get(SAM.id).n], [true, 1, 0], "a second inviter spends no slot on someone already invited");
const reg = await invite(MAYA, "sam@example.com");
eq([reg.already, rows().some((r) => r.to_ === "sam@example.com")], [true, false], "someone who already has an account is not admitted again and gets no row");

/* 5. Upgrade: the owner choosing Insider for someone already General. Only by choosing: the owner's default is for a new account. */
const kept = await invite(OWNER, "bob@example.com");
eq([kept.already, kept.group, onPolicy(INS).includes("bob@example.com")], [true, "general", false], "the owner inviting an existing General person without choosing leaves them General");
const up = await invite(OWNER, "bob@example.com", {group: "insider"});
eq([up.group, up.already, onPolicy(INS).includes("bob@example.com"), insiders().includes("bob@example.com"), rows().find((r) => r.to_ === "bob@example.com").grp], ["insider", false, true, true, "insider"], "the owner upgrades a General invitee to Insider");
eq((await invite(MAYA, "bob@example.com")).group, "insider", "and nobody downgrades them by inviting again");
const upReg = await invite(OWNER, "sam@example.com", {group: "insider"});
eq([upReg.group, insiders().includes("sam@example.com"), rows().find((r) => r.to_ === "sam@example.com")?.grp], ["insider", true, "insider"], "and an existing account can be made an Insider");

/* 6. Admission failing after the row: pending, no AI, the same invitation again finishes it, one slot. */
failWrites = true;
const before = raw.prepare("SELECT count(*) AS n FROM invitations WHERE inviter_id = ?").get(OWNER.id).n;
await refuses(invite(OWNER, "eve@example.com"), 502, /did not admit.*Your invitation is saved.*send the same invitation again/s, "admission failing says the invitation is saved and to send it again");
failWrites = false;
eq(rows().find((r) => r.to_ === "eve@example.com").status, "pending", "the row stays pending");
eq([insiders().includes("eve@example.com"), onPolicy(INS).includes("eve@example.com"), await groupOf("eve@example.com", env, db)], [false, false, "general"], "and she has no AI and is on no policy");
const resumed = await invite(OWNER, "eve@example.com");
eq([resumed.created, resumed.group, rows().find((r) => r.to_ === "eve@example.com").status, insiders().includes("eve@example.com")], [false, "insider", "admitted", true], "sending it again finishes it as the same row, still an Insider");
eq(raw.prepare("SELECT count(*) AS n FROM invitations WHERE inviter_id = ?").get(OWNER.id).n, before + 1, "and the retry used no second slot");
failWrites = true;
await invite(MAYA, "flo@example.com").catch(() => null);
failWrites = false;
const resumedByOther = await invite(SAM, "flo@example.com");
eq([resumedByOther.group, rows().find((r) => r.to_ === "flo@example.com").by, rows().find((r) => r.to_ === "flo@example.com").status], ["general", "maya@example.com", "admitted"], "someone else's pending invitation is finished under its first inviter and group");

/* 7. The cap: five per user, the owner too; only a new account costs a slot. */
const count = (who) => raw.prepare("SELECT count(*) AS n FROM invitations WHERE inviter_id = ?").get(who.id).n;
for (let i = count(SAM); i < 5; i += 1) await invite(SAM, `s${i}@example.com`);
eq(count(SAM), 5, "Sam has invited five new people");
await refuses(invite(SAM, "sixth@example.com"), 409, /already invited 5 people, the most one person can invite.*nothing was sent.*dropdown.*ask the owner/s, "a sixth is refused with the cap and what to do instead");
eq([count(SAM), rows().some((r) => r.to_ === "sixth@example.com"), onPolicy(GEN).includes("sixth@example.com")], [5, false, false], "and it is neither recorded nor admitted");
eq((await invite(SAM, "s0@example.com")).already, true, "inviting someone already invited is not a sixth");
eq((await invite(SAM, "maya@example.com")).already, true, "nor is inviting someone who already has an account");
for (let i = count(OWNER); i < 5; i += 1) await invite(OWNER, `o${i}@example.com`);
await refuses(invite(OWNER, "sixth@example.com"), 409, /already invited 5 people/, "the owner is held to it too");
env.INVITE_CAP = "6";
eq((await invite(OWNER, "sixth@example.com")).created, true, "INVITE_CAP raises it");
delete env.INVITE_CAP;

/* 8. A game's guests are vetted whole, before anything exists: the plan costs nothing and refuses nothing half. */
const vet = (inviter, people) => vetInvitees(db, env, {inviter, people, fail});
const GUY = user("guy@example.com");
const planned = await vet(GUY, [{to: "maya@example.com"}, {to: "new1@example.com"}, {to: "bob@example.com"}, {to: "new2@example.com", group: "general"}]);
eq(planned.map((p) => [p.to, p.group, p.isNew]), [["maya@example.com", "general", false], ["new1@example.com", "general", true], ["bob@example.com", "insider", false], ["new2@example.com", "general", true]], "the plan says who is a new account, and the group each is in or would get (Bob was made an Insider above)");
eq([rows().some((r) => r.to_ === "new1@example.com"), onPolicy(GEN).includes("new1@example.com")], [false, false], "and it recorded and admitted no one");
for (let i = 0; i < 4; i += 1) await invite(GUY, `g${i}@example.com`);
await refuses(vet(GUY, [{to: "h1@example.com"}, {to: "h2@example.com"}]), 409, /would bring you to 6.*most one person can invite.*only 1 more/s, "two new accounts when one slot is left refuses the whole plan, saying how many are left");
eq((await vet(GUY, [{to: "h1@example.com"}, {to: "maya@example.com"}])).length, 2, "one new account and an existing one fit");
await refuses(vet(GUY, [{to: "h1@example.com", group: "insider"}]), 403, /Only the CrankMagic owner/, "a non-owner's plan with Insider is refused");
await refuses(vet(GUY, [{to: "dup@example.com"}, {to: "DUP@example.com"}]), 400, /on two seats.*different person/, "the same person twice is refused");
await refuses(vet(GUY, [{to: "guy@example.com"}]), 400, /your own address/, "so is the inviter's own address");
await refuses(vet(GUY, [{to: "nonsense"}]), 400, /valid email/, "and a malformed address");

/* 9. A copy that cannot admit anyone fills nothing: the configuration is checked before a row is written. */
const unconfigured = {...env, ACCESS_INVITE_POLICY_ID_INSIDER: "nonsense", INVITE_CAP: "99"};
await refuses(inviteAddress(db, unconfigured, {inviter: OWNER, to: "nocfg@example.com", name: "No Cfg", source: "settings", now, fetchImpl, fail}), 503, /Access invitation permissions.*Nothing was sent/s, "an Insider invitation with no usable Insider policy is refused before any row");
eq(rows().some((r) => r.to_ === "nocfg@example.com"), false, "and no row was written");

console.log(`invitations: ${checks} checks passed`);
