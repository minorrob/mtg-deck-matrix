/* CREATE GAME SENDS THE INVITATIONS (ROB-320; docs/program/rob-320-invitations-contract.md §2, §3), through the Worker's front door.
 *
 * Rob, 2026-10-29: "Create a new game > choose 2 or more human players, select their names from the dropdown if a crankmagic user OR
 * put in their name and email > create game. This triggers our email template to populate with the game lobby link and the
 * invitee's name and sends the email ... The organizer, then in the lobby does not have to take any action."
 *
 *   plan     a refusal (cap, unknown name, a non-owner asking for AI, a duplicate) happens BEFORE any table, mail or admission exists
 *   create   the table holds a seat for each guest; each guest is admitted, recorded and emailed the lobby link and their name
 *   guests   the invitee arrives and is seated with no answer from the host
 *   retry    a guest whose invitation failed keeps their seat; the host's reinvite finishes it once, never twice
 *
 * Faked Cloudflare Access and Resend; nothing here has touched either.
 */
import {ROB, MAYA, SAM, EVE, ok, eq, count, world, everyString} from "./helpers/lounge-harness.mjs";

const APP = "aaaaaaaa-0000-0000-0000-000000000001", GEN = "cccccccc-0000-0000-0000-000000000001", INS = "dddddddd-0000-0000-0000-000000000001";
const policies = new Map([GEN, INS].map((id) => [id, {id, reusable: true, app_count: 1, decision: "allow", name: id, include: []}]));
const mail = []; let failAccess = false;
const fetchStandIn = async (url, args) => {
  if (url === "https://api.resend.com/emails") {mail.push(JSON.parse(args.body)); return Response.json({id: crypto.randomUUID()});}
  if (url.endsWith(`/apps/${APP}`)) return Response.json({success: true, result: {name: "CrankMagic", domain: "crankmagic.com", policies: [{id: GEN}, {id: INS}]}});
  const id = [GEN, INS].find((p) => url.endsWith(`/policies/${p}`));
  if (!id) throw Error(`unexpected call ${url}`);
  if (args.method === "PUT") {if (failAccess) return Response.json({success: false}, {status: 403}); policies.set(id, {...policies.get(id), ...JSON.parse(args.body)});}
  return Response.json({success: true, result: policies.get(id)});
};
const sharingEnv = {SHARING_ENABLED: "on", RESEND_API_KEY: "test-only", ACCESS_INVITE_TOKEN: "test-only", CLOUDFLARE_ACCOUNT_ID: "0".repeat(32), ACCESS_INVITE_APP_IDS: APP,
  ACCESS_INVITE_POLICY_ID_GENERAL: GEN, ACCESS_INVITE_POLICY_ID_INSIDER: INS, INVITE_LINK_ORIGIN: "https://crankmagic.com"};
const w = await world({db: true, envExtra: sharingEnv, fetch: fetchStandIn,
  migrations: ["0001_accounts.sql", "0002_ai.sql", "0003_sharing.sql", "0004_mail_retries.sql", "0005_access_invites.sql", "0010_match_results.sql", "0011_invitations.sql"]});
const sql = (q, ...a) => w.db.raw.prepare(q).all(...a).map((r) => ({...r}));
const user = (email, name) => {
  w.db.raw.prepare("INSERT INTO users (email, created_at, seen_at) VALUES (?, 't', 't')").run(email);
  const id = w.db.raw.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
  if (name) w.db.raw.prepare("INSERT INTO profiles (user_id, name, avatar, updated_at) VALUES (?, ?, '', 't')").run(id, name);
};
user(SAM, "Sam Rivera"); user(EVE, "Eve Adams");
const on = (id) => policies.get(id).include.filter((r) => r.email).map((r) => r.email.email);
const T = (id, path = "") => `/api/tables/${id}${path}`;
const tablesMade = () => [...w.objects.keys()].filter((k) => !k.includes("-")).length;

/* 1. Create game: a CrankMagic user by name and a new person by name and email. */
const made = await w.call("POST", "/api/tables", {as: MAYA, body: {hostName: "Maya", privacy: "private", seats: [
  {kind: "human", name: "Sam Rivera", user: "Sam Rivera"}, {kind: "human", name: "Nia Park", email: "nia@example.com"}, {kind: "ai", name: "Ember"}]}});
const id = made.json.table.tableId;
eq(made.status, 201, "the table is made");
eq(made.json.invitations.map((i) => [i.seatId, i.name, i.status]), [[1, "Sam Rivera", "sent"], [2, "Nia Park", "sent"]], "each guest is invited, in their seat's order, and the answer says so");
ok(![...everyString(made.json)].some((s) => /[\w.+-]+@[\w-]+\.\w+/.test(s)), "and no address is in anything the page is told");
eq(mail.map((m) => m.to[0]), ["sam@example.com", "nia@example.com"], "each guest was emailed, the dropdown pick at the address the server holds for them");
for (const m of mail) ok(m.text.endsWith(`\n\nhttps://crankmagic.com/api/join/${id}`) && m.html.includes(`href="https://crankmagic.com/api/join/${id}"`) && /Maya/.test(m.subject), `the email carries the lobby link and the host (${m.to[0]})`);
ok(mail[0].text.startsWith("Hi Sam Rivera,") && mail[1].text.startsWith("Hi Nia Park,"), "and each guest's name");
eq([on(GEN), on(INS)], [["nia@example.com"], []], "the new person is on the General policy (Maya is not the owner); the existing user was not touched");
eq(sql("SELECT invitee_email AS to_, inviter_email AS by, grp, source, status, table_id AS tableId FROM invitations"), [{to_: "nia@example.com", by: "maya@example.com", grp: "general", source: "game", status: "admitted", tableId: id}], "one row: who invited whom, from which game, in which group; the person who already had an account costs no slot");
const lobby = (await w.call("GET", T(id), {as: MAYA})).json.table;
eq(lobby.seats.map((s) => [s.occupied, s.invited]), [[true, false], [false, true], [false, true], [true, false]], "the host's lobby shows both seats as invited, waiting");
eq((await w.call("POST", T(id, "/join"), {as: SAM, body: {}})).json.table.yourSeat, 1, "Sam follows the link and is in his seat");
eq((await w.call("POST", T(id, "/join"), {as: "nia@example.com", body: {}})).json.table.yourSeat, 2, "Nia, new to CrankMagic, is in hers");
eq((await w.call("GET", T(id), {as: MAYA})).json.table.seats.map((s) => s.occupied), [true, true, true, true], "the host did nothing and sees everyone seated");

/* 2. The owner's guests are Insiders; a non-owner cannot ask for it. */
const owner = await w.call("POST", "/api/tables", {as: ROB, body: {hostName: "Rob", privacy: "private", seats: [{kind: "human", name: "Ola", email: "ola@example.com"}, {kind: "human", name: "Pat", email: "pat@example.com", group: "general"}]}});
eq(owner.json.invitations.map((i) => i.status), ["sent", "sent"], "the owner's table sends");
eq([on(INS), on(GEN).includes("pat@example.com"), sql("SELECT email FROM ai_allowlist").map((r) => r.email)], [["ola@example.com"], true, ["ola@example.com"]], "Ola, a new typed guest, is a Game Theory Insider; Pat, chosen as General, is not");
const before = {tables: tablesMade(), mail: mail.length, gen: on(GEN).length};
const asks = await w.call("POST", "/api/tables", {as: MAYA, body: {hostName: "Maya", seats: [{kind: "human", name: "Quin", email: "quin@example.com", group: "insider"}, {kind: "ai", name: "Ember"}]}});
eq([asks.status, /Only the CrankMagic owner can give .*AI/.test(asks.json.error)], [403, true], "a non-owner asking for an Insider seat is refused, with the way out");
eq([tablesMade(), mail.length, on(GEN).length], [before.tables, before.mail, before.gen], "and nothing was made, sent or admitted");

/* 3. The cap refuses the whole create, before anything exists. */
for (const n of ["c1", "c2", "c3"]) await w.call("POST", "/api/social/invite", {as: MAYA, headers: {"x-crankmagic": "sync"}, body: {name: n, email: `${n}@example.com`}});
eq(sql("SELECT count(*) AS n FROM invitations WHERE inviter_email = 'maya@example.com'")[0].n, 4, "Maya has invited four people (Nia and three more)");
const mark = {tables: tablesMade(), mail: mail.length, gen: on(GEN).length};
const over = await w.call("POST", "/api/tables", {as: MAYA, body: {hostName: "Maya", seats: [{kind: "human", name: "D1", email: "d1@example.com"}, {kind: "human", name: "D2", email: "d2@example.com"}]}});
eq([over.status, /would bring you to 6.*only 1 more.*Nothing was sent/s.test(over.json.error)], [409, true], "two new people when one slot is left refuses the create, saying how many are left");
eq([tablesMade(), mail.length, on(GEN).length], [mark.tables, mark.mail, mark.gen], "no table, no email, no admission");
const fits = await w.call("POST", "/api/tables", {as: MAYA, body: {hostName: "Maya", seats: [{kind: "human", name: "Eve", user: "eve adams"}, {kind: "human", name: "D1", email: "d1@example.com"}]}});
eq([fits.status, fits.json.invitations.map((i) => i.status)], [201, ["sent", "sent"]], "an existing user (by the name the dropdown gave) and one new person fit in the last slot");
const full = await w.call("POST", "/api/tables", {as: MAYA, body: {hostName: "Maya", seats: [{kind: "human", name: "D2", email: "d2@example.com"}, {kind: "ai", name: "Ember"}]}});
eq([full.status, /already invited 5 people/.test(full.json.error), /dropdown/.test(full.json.error)], [409, true, true], "the sixth is refused, with the cap and what to do instead");

/* 4. Other refusals before anything exists. */
const unknown = await w.call("POST", "/api/tables", {as: MAYA, body: {hostName: "Maya", seats: [{kind: "human", name: "Zed", user: "Zed Nobody"}, {kind: "ai", name: "Ember"}]}});
eq([unknown.status, /No CrankMagic user is named .Zed Nobody./.test(unknown.json.error), /name and email/.test(unknown.json.error)], [422, true, true], "a dropdown name nobody has is refused, saying to type their name and email");
const twice = await w.call("POST", "/api/tables", {as: ROB, body: {hostName: "Rob", seats: [{kind: "human", name: "A", email: "twin@example.com"}, {kind: "human", name: "B", email: "TWIN@example.com"}]}});
eq([twice.status, /two seats/.test(twice.json.error)], [400, true], "the same person on two seats is refused");
const self = await w.call("POST", "/api/tables", {as: ROB, body: {hostName: "Rob", seats: [{kind: "human", name: "Me", email: "rob@example.com"}, {kind: "ai", name: "Ember"}]}});
eq([self.status, /your own address/.test(self.json.error)], [400, true], "and so is the host's own address");

/* 5. A guest whose invitation fails keeps their seat; the host's retry finishes it once. */
mail.length = 0; failAccess = true;
const rough = await w.call("POST", "/api/tables", {as: ROB, body: {hostName: "Rob", privacy: "private", seats: [{kind: "human", name: "Sam Rivera", user: "Sam Rivera"}, {kind: "human", name: "Rae Cole", email: "rae@example.com"}]}});
const rid = rough.json.table.tableId;
failAccess = false;
eq(rough.status, 201, "the table is made even though a guest could not be admitted");
eq(rough.json.invitations.map((i) => [i.name, i.status]), [["Sam Rivera", "sent"], ["Rae Cole", "failed"]], "Sam (already admitted) is sent; Rae failed");
ok(/send the same invitation again/.test(rough.json.invitations[1].error) && !/[\w.+-]+@[\w-]+\.\w+/.test(rough.json.invitations[1].error), "her failure says what to do and shows no address");
eq([mail.length, sql("SELECT status FROM invitations WHERE invitee_email = 'rae@example.com'")[0].status], [1, "pending"], "no email went to her, and her row waits");
eq((await w.call("POST", T(rid, "/reinvite"), {as: SAM, body: {seatId: 2}})).status, 403, "only the host retries");
eq((await w.call("POST", T(rid, "/reinvite"), {as: ROB, body: {seatId: 0}})).status, 409, "a seat that is no one's guest is not retried");
const retry = await w.call("POST", T(rid, "/reinvite"), {as: ROB, body: {seatId: 2}});
eq([retry.status, retry.json.invitation.status, mail.length, mail.at(-1).to[0]], [200, "sent", 2, "rae@example.com"], "the retry finishes it: admitted and emailed");
eq(sql("SELECT status, grp FROM invitations WHERE invitee_email = 'rae@example.com'"), [{status: "admitted", grp: "insider"}], "as the same row, still the owner's Insider");
await w.call("POST", T(rid, "/reinvite"), {as: ROB, body: {seatId: 2}});
eq(mail.length, 2, "and doing it again sends nothing more");

/* 6. A copy with no invitation service behaves as before: the seat is held, nothing is sent. */
const bare = await world({db: true});
const plain = await bare.call("POST", "/api/tables", {as: MAYA, body: {hostName: "Maya", seats: [{kind: "human", name: "Sam", email: SAM}]}});
eq([plain.status, plain.json.invitations], [201, undefined], "without the sharing service Create game holds the seat and says nothing of invitations");
eq((await bare.call("POST", T(plain.json.table.tableId, "/join"), {as: SAM, body: {}})).json.table.yourSeat, 1, "and the guest can still take it");

console.log(`tables-invites: ${count()} checks passed`);
