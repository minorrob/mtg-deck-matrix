/* ACCESS ADMISSION BY GROUP (ROB-320; docs/program/rob-320-invitations-contract.md §6). An address is admitted through the
 * Access policy of the group it is invited into: ACCESS_INVITE_POLICY_ID_GENERAL or ACCESS_INVITE_POLICY_ID_INSIDER, each the
 * same length as ACCESS_INVITE_APP_IDS. Neither set: today's ACCESS_INVITE_POLICY_ID, for both groups. A group list that is set
 * but malformed refuses (never falls back, so an Insider cannot silently land on the General policy).
 *
 * Everything here is a faked fetch. Nothing has been checked against real Cloudflare; the real policy ids are Rob's to supply.
 */
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {inviteTargets, admitAddress} from "../cloud/access-invites.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

const APP = "aaaaaaaa-0000-0000-0000-000000000001", APP2 = "aaaaaaaa-0000-0000-0000-000000000002";
const ONE = "bbbbbbbb-0000-0000-0000-000000000001", GEN = "cccccccc-0000-0000-0000-000000000001", INS = "dddddddd-0000-0000-0000-000000000001";
const GEN2 = "cccccccc-0000-0000-0000-000000000002", INS2 = "dddddddd-0000-0000-0000-000000000002";

/* 1. Which policies a group is written to. */
const base = {ACCESS_INVITE_APP_IDS: APP, ACCESS_INVITE_POLICY_ID: ONE};
eq(inviteTargets(base), [{app: APP, policy: ONE}], "with no group, today's single policy");
eq(inviteTargets(base, "general"), [{app: APP, policy: ONE}], "no per-group policy set: General falls back to the single policy");
eq(inviteTargets(base, "insider"), [{app: APP, policy: ONE}], "and so does Insider");
const split = {...base, ACCESS_INVITE_POLICY_ID_GENERAL: GEN, ACCESS_INVITE_POLICY_ID_INSIDER: INS};
eq(inviteTargets(split, "general"), [{app: APP, policy: GEN}], "General uses its own policy");
eq(inviteTargets(split, "insider"), [{app: APP, policy: INS}], "Insider uses its own policy");
eq(inviteTargets(split), [{app: APP, policy: ONE}], "no group asked: the single policy still answers (sharing's email-change admission)");
eq(inviteTargets({...base, ACCESS_INVITE_POLICY_ID_INSIDER: INS}, "general"), [{app: APP, policy: ONE}], "only Insider set: General still falls back");
eq(inviteTargets({...base, ACCESS_INVITE_POLICY_ID_INSIDER: INS}, "insider"), [{app: APP, policy: INS}], "and Insider uses its own");
const two = {ACCESS_INVITE_APP_IDS: `${APP}, ${APP2}`, ACCESS_INVITE_POLICY_ID_GENERAL: `${GEN},${GEN2}`, ACCESS_INVITE_POLICY_ID_INSIDER: `${INS},${INS2}`};
eq(inviteTargets(two, "insider"), [{app: APP, policy: INS}, {app: APP2, policy: INS2}], "lists are read in pairs, per group");
eq(inviteTargets({...two, ACCESS_INVITE_POLICY_ID_INSIDER: INS}, "insider"), [], "an Insider list of the wrong length configures nothing");
eq(inviteTargets({...base, ACCESS_INVITE_POLICY_ID_INSIDER: "not-a-uuid"}, "insider"), [], "a malformed Insider id configures nothing, and does NOT fall back to the single policy");
eq(inviteTargets({...base, ACCESS_INVITE_POLICY_ID_INSIDER: "not-a-uuid"}, "general"), [{app: APP, policy: ONE}], "the other group is unaffected by it");
eq(inviteTargets({ACCESS_INVITE_APP_IDS: APP}, "insider"), [], "nothing set at all configures nothing");

/* 2. The write goes to the group's policy and to no other. */
const raw = new DatabaseSync(":memory:");
raw.exec(readFileSync(new URL("../cloud/migrations/0005_access_invites.sql", import.meta.url), "utf8"));
const stmt = (sql, args = []) => ({bind: (...v) => stmt(sql, v), first: async () => raw.prepare(sql).get(...args) ?? null, run: async () => ({meta: {changes: Number(raw.prepare(sql).run(...args).changes)}})});
const db = {prepare: (s) => stmt(s)};
const policies = new Map([GEN, INS, ONE].map((id) => [id, {id, reusable: true, app_count: 1, decision: "allow", name: id, include: [{email: {email: "rob@example.com"}}]}]));
const writes = [];
const fetchImpl = async (url, args) => {
  if (url.endsWith(`/apps/${APP}`)) return Response.json({success: true, result: {name: "CrankMagic", domain: "crankmagic.com", policies: [...policies.keys()].map((id) => ({id}))}});
  const id = [...policies.keys()].find((p) => url.endsWith(`/policies/${p}`));
  assert.ok(id, "only a configured policy is called");
  if (args.method === "PUT") {writes.push(id); policies.set(id, {...policies.get(id), ...JSON.parse(args.body)});}
  return Response.json({success: true, result: policies.get(id)});
};
const fail = (message, status) => {const e = new Error(message); e.status = status; throw e;};
const env = {...split, ACCESS_INVITE_TOKEN: "test-only", CLOUDFLARE_ACCOUNT_ID: "0".repeat(32)};
const deps = (group) => ({now: () => "2026-10-31T12:00:00.000Z", fetchImpl, fail, ...(group ? {group} : {})});
const emailsOn = (id) => policies.get(id).include.filter((r) => r.email).map((r) => r.email.email);

await admitAddress(db, env, "gen@example.com", deps("general"));
eq([emailsOn(GEN), emailsOn(INS), emailsOn(ONE)], [["rob@example.com", "gen@example.com"], ["rob@example.com"], ["rob@example.com"]], "a General invitee is on the General policy only");
await admitAddress(db, env, "ins@example.com", deps("insider"));
eq([emailsOn(GEN), emailsOn(INS)], [["rob@example.com", "gen@example.com"], ["rob@example.com", "ins@example.com"]], "an Insider invitee is on the Insider policy only");
await admitAddress(db, env, "ins@example.com", deps("insider"));
eq(writes, [GEN, INS], "admitting again reads and writes nothing (idempotent)");
await admitAddress(db, env, "old@example.com", deps());
eq(emailsOn(ONE), ["rob@example.com", "old@example.com"], "no group: the single policy, as before");

/* 3. A group whose policy is malformed refuses, naming what to do, and writes nothing. */
const bad = {...env, ACCESS_INVITE_POLICY_ID_INSIDER: "nonsense"};
await assert.rejects(() => admitAddress(db, bad, "late@example.com", deps("insider")), (e) => e.status === 503 && /not configured/.test(e.message));
checks += 1;
eq(writes.length, 3, "and nothing was written for it");
ok(raw.prepare("SELECT count(*) AS n FROM access_invite_locks").get().n === 0, "no lock is left behind");
console.log(`access-invite-groups: ${checks} checks passed`);
