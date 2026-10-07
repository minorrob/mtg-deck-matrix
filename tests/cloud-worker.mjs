/* THE ACCOUNT CLOUD'S DOOR, held to what it promises (cloud/worker.mjs, access.mjs, library.mjs).
 *
 * No Cloudflare here: the real migration runs in Node's own SQLite behind a small D1 stand-in, and the
 * Access tokens are real RS256 tokens signed with a key generated for the run and published the way
 * Access publishes its keys. So the SQL, the compare-and-swap, the signature check and the routes are the
 * code that ships; only the network is a stand-in.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";
import {LIMITS} from "../cloud/library.mjs";

let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++;};
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};

/* D1, as far as the Worker uses it: prepare/bind/first/all/run, and batch as one transaction. */
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("../cloud/migrations/0001_accounts.sql", import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}),
    run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
    now: () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {
    raw: db,
    prepare: (sql) => statement(sql),
    batch: async (list) => {
      db.exec("BEGIN");
      try {const out = list.map((s) => s.now()); db.exec("COMMIT"); return out;}
      catch (error) {db.exec("ROLLBACK"); throw error;}
    },
  };
}

/* Access, as far as the Worker sees it: a team's published keys, and tokens signed with them. */
const TEAM = "crankmagic-test.cloudflareaccess.com", AUD = "aud-crankmagic-test";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
async function keypair(kid) {
  const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
  return {kid, privateKey, jwk: {...await crypto.subtle.exportKey("jwk", publicKey), kid}};
}
const signing = await keypair("key-1"), stranger = await keypair("key-1"), rotated = await keypair("key-2");
let published = [signing.jwk], keyFetches = 0;
const fetchImpl = async (url) => {
  keyFetches++;
  return url === `https://${TEAM}/cdn-cgi/access/certs` ? new Response(JSON.stringify({keys: published})) : new Response("no", {status: 404});
};
const NOW = Date.parse("2026-09-24T20:00:00Z");
let clock = NOW;
async function token(claims = {}, {key = signing, header = {}} = {}) {
  const h = b64url(JSON.stringify({alg: "RS256", kid: key.kid, typ: "JWT", ...header}));
  const p = b64url(JSON.stringify({aud: [AUD], iss: `https://${TEAM}`, email: "Rob@Example.com", exp: clock / 1000 + 3600, iat: clock / 1000, ...claims}));
  const s = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${s}`;
}

const DB = d1();
const env = {DB, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD};
async function call(method, path, {as = "rob@example.com", jwt, body, headers = {}} = {}) {
  const auth = jwt !== undefined ? jwt : await token({email: as});
  const init = {method, headers: {...(auth ? {"cf-access-jwt-assertion": auth} : {}), ...(body !== undefined ? {"content-type": "application/json", "x-crankmagic": "sync"} : {}), ...headers}};
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await handle(new Request(`https://crankmagic.test${path}`, init), env, {fetchImpl, now: clock});
  const text = await response.text();
  return {status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null};
}
const library = (n) => {
  const backup = {format: "crankmagic-backup", version: 1, payload: {state: {revision: n, decks: [`deck ${n}`]}, history: []}};
  return {body: gzipSync(JSON.stringify(backup)).toString("base64"), checksum: createHash("sha256").update(`library ${n}`).digest("hex"), revision: n, device: "Chrome on Windows"};
};

/* WHO IS ASKING -- anything short of a valid token for this application naming a person is a 401. */
forgetKeys();
eq((await call("GET", "/api/me", {jwt: null})).status, 401, "no token: 401");
eq((await call("GET", "/api/me", {jwt: "not.a-token"})).status, 401, "a malformed token: 401");
eq((await call("GET", "/api/me", {jwt: await token({}, {key: stranger})})).status, 401, "a token signed by some other key under the same id: 401");
eq((await call("GET", "/api/me", {jwt: await token({aud: ["another-app"]})})).status, 401, "a token for another Access application: 401");
eq((await call("GET", "/api/me", {jwt: await token({iss: "https://elsewhere.cloudflareaccess.com"})})).status, 401, "a token from another team: 401");
eq((await call("GET", "/api/me", {jwt: await token({exp: NOW / 1000 - 120})})).status, 401, "an expired token: 401");
eq((await call("GET", "/api/me", {jwt: await token({email: undefined, common_name: "service-token-id"})})).status, 401, "a service token, which names no person: 401");
/* WHERE A RELEASE SEATS A SERVICE TOKEN (SERVICE_SEATS, staging only; the review response's L6): the session's checks,
   one identity no person can be -- and still only a token Access signed for this application. */
{
  const seated = async (jwt) => {
    const response = await handle(new Request("https://crankmagic.test/api/me", {headers: {"cf-access-jwt-assertion": jwt}}), {...env, SERVICE_SEATS: "on"}, {fetchImpl, now: clock});
    const text = await response.text();
    return {status: response.status, json: text ? JSON.parse(text) : null};
  };
  const me = await seated(await token({email: undefined, common_name: "service-token-id"}));
  eq([me.status, me.json?.email], [200, "service:session-checks"], "seated: a service token Access admitted is the session's checks, named as no person's address");
  eq((await seated(await token({email: undefined}))).status, 401, "a token naming neither a person nor a service token: still 401");
  eq((await seated(await token({email: undefined, common_name: "service-token-id", aud: ["another-app"]}))).status, 401, "a service token for another Access application: still 401");
  eq((await seated(await token({}))).json?.email, "rob@example.com", "and a person is still themself");
}
eq((await call("GET", "/api/me", {jwt: await token({}, {header: {alg: "HS256"}})})).status, 401, "a token claiming another algorithm: 401");
keyFetches = 0;
eq((await call("GET", "/api/me", {jwt: await token({}, {key: rotated})})).status, 401, "a key the team never published: 401");
eq(keyFetches, 1, "and the keys were fetched again once, which is how a rotation is noticed");
published = [signing.jwk, rotated.jwk];
eq((await call("GET", "/api/me", {jwt: await token({}, {key: rotated})})).status, 200, "after the team publishes the rotated key, its tokens are accepted without a restart");
const me = await call("GET", "/api/me");
eq([me.status, me.json.email, me.json.head], [200, "rob@example.com", null], "a valid token: the person, lower-cased, with no library saved yet");
await assert.rejects(handle(new Request("https://crankmagic.test/api/me"), {DB}, {fetchImpl}), /ACCESS_TEAM_DOMAIN and ACCESS_AUD/, "a Worker deployed without its Access settings refuses everything"); checks++;

/* ACCESS_JWKS: the keys given directly, for the local end-to-end run -- and only those keys. */
{
  const local = await keypair("local-1");
  const localEnv = {...env, ACCESS_JWKS: JSON.stringify({keys: [local.jwk]})};
  const ask = async (key) => (await handle(new Request("https://crankmagic.test/api/me", {headers: {"cf-access-jwt-assertion": await token({}, {key})}}), localEnv, {fetchImpl: () => {throw Error("fetched");}, now: clock})).status;
  eq(await ask(local), 200, "with ACCESS_JWKS set, a token signed by a key in it is accepted, and nothing is fetched");
  eq(await ask(signing), 401, "and a token signed by the team's real key is not -- the given keys are the only ones trusted");
}

/* WRITES COME FROM THE APP. */
const first = library(1);
eq((await call("PUT", "/api/library", {body: first, headers: {"x-crankmagic": ""}})).status, 403, "a write without the app's header: 403");
eq((await call("PUT", "/api/library", {body: first, headers: {origin: "https://evil.example"}})).status, 403, "a write from another site's page: 403");
eq((await call("PUT", "/api/library", {body: first, headers: {"content-type": "text/plain"}})).status, 403, "a write that is not JSON: 403");

/* THE HEAD MOVES ONLY FROM WHERE THE DEVICE LEFT IT. */
const saved1 = await call("PUT", "/api/library", {body: {...first, parent: null}});
eq(saved1.status, 200, "a first save");
ok(saved1.json.head.id && saved1.json.head.kind === "sync" && saved1.json.head.parent === null, "becomes the head, with no parent");
const saved2 = await call("PUT", "/api/library", {body: {...library(2), parent: saved1.json.head.id}});
eq([saved2.status, saved2.json.head.parent, saved2.json.head.revision], [200, saved1.json.head.id, 2], "a save from the head moves it on");
const before = (await call("GET", "/api/library/history")).json.versions.length;
const stale = await call("PUT", "/api/library", {body: {...library(3), parent: saved1.json.head.id}});
eq([stale.status, stale.json.head.id], [409, saved2.json.head.id], "a save from a version the head has moved past: 409, with the head the device must reconcile with");
eq((await call("GET", "/api/library/history")).json.versions.length, before, "and the refused version is not left behind");
eq((await call("PUT", "/api/library", {body: {...library(3), parent: null}})).status, 409, "a second 'first save' does not overwrite a library that exists");

/* A PERSON'S CHOICE, AND WHAT IT KEEPS. */
const forced = await call("PUT", "/api/library", {body: {...library(4), parent: saved1.json.head.id, force: true}});
eq(forced.status, 200, "keep this device's version: a forced save moves the head wherever it was");
const afterForce = (await call("GET", "/api/library/history")).json.versions;
eq(afterForce.find((v) => v.id === saved2.json.head.id)?.kind, "displaced", "and the version it replaced is kept, marked displaced");
const kept = await call("POST", "/api/library/kept", {body: {...library(5), parent: forced.json.head.id}});
eq([kept.status, kept.json.kept.kind], [201, "kept"], "use the cloud's copy: this device's version is filed as kept");
eq((await call("GET", "/api/library")).json.head.id, forced.json.head.id, "without moving the head");

/* WHAT GOES IN COMES BACK, AND ONLY TO ITS OWNER. */
const got = await call("GET", `/api/library/versions/${forced.json.head.id}`);
eq([got.status, got.json.version.body, got.json.version.checksum], [200, library(4).body, library(4).checksum], "a version comes back exactly as it was saved");
eq((await call("GET", `/api/library/versions/${forced.json.head.id}`, {as: "trey@example.com"})).status, 404, "another person asking for it gets nothing");
eq((await call("GET", "/api/library", {as: "trey@example.com"})).json.head, null, "and has a library of their own, empty");
eq((await call("GET", "/api/library/versions/not-an-id")).status, 404, "a malformed version id: 404");

/* WHAT THE CLOUD REFUSES. */
eq((await call("PUT", "/api/library", {body: {...library(6), body: "eyJub3QiOiJnemlwIn0=", parent: forced.json.head.id}})).status, 400, "a library that is not gzipped: 400");
eq((await call("PUT", "/api/library", {body: {...library(6), checksum: "abc", parent: forced.json.head.id}})).status, 400, "a library without its checksum: 400");
eq((await call("PUT", "/api/library", {body: {...library(6), parent: "../../etc"}})).status, 400, "a parent the cloud never issued: 400");
eq((await call("PUT", "/api/library", {body: {...library(6), body: "H4sI" + "A".repeat(LIMITS.body), parent: forced.json.head.id}})).status, 400, "a library larger than one D1 row: 400");

/* THE NEWEST TWENTY STAY. */
let parent = forced.json.head.id;
for (let n = 10; n < 40; n++) parent = (await call("PUT", "/api/library", {body: {...library(n), parent}})).json.head.id;
const held = (await call("GET", "/api/library/history?limit=100")).json.versions;
eq(held.filter((v) => v.kind === "sync").length, LIMITS.keepSync, "after thirty more saves, the newest twenty everyday versions are held");
ok(held.some((v) => v.kind === "displaced") && held.some((v) => v.kind === "kept"), "and the displaced and kept ones are still there, inside their thirty days");
clock = NOW + 31 * 86_400_000;
parent = (await call("PUT", "/api/library", {body: {...library(99), parent}})).json.head.id;
const later = (await call("GET", "/api/library/history?limit=100")).json.versions;
ok(!later.some((v) => v.kind === "displaced" || v.kind === "kept"), "thirty-one days on, they are gone");
eq(later[0].id, parent, "and the head is always held");
clock = NOW;

/* THE WAY BACK FROM SIGN-IN stays on this site. */
const back = await call("GET", "/api/auth/login?to=%23decks%3Fdeck%3Dabc");
eq([back.status, back.headers.get("location")], [302, "https://crankmagic.test/#decks?deck=abc"], "after sign-in, back to where the person was");
eq((await call("GET", "/api/auth/login?to=https://evil.example/")).headers.get("location"), "https://crankmagic.test/", "and never to another site");

/* AN INVITATION'S LINK comes back to the app with its code, once Access has let the person in -- a path, which Access's
   sign-in keeps, where it drops a fragment. Anything but an invitation's shape is not a link. */
{
  const code = "AbC_dEf-0123456789xyzXYZ0123456789abcdEFGH0";
  const joined = await call("GET", `/api/join/table0123abcd/${code}`);
  eq([joined.status, joined.headers.get("location"), joined.headers.get("cache-control")], [302, `https://crankmagic.test/#table/table0123abcd/${code}`, "no-store"], "an invitation's link, opened signed in, comes back to the app at the seat's fragment, never cached");
  eq((await call("GET", "/api/join/table0123abcd/short")).status, 404, "a code of the wrong shape is no link");
  eq((await call("GET", `/api/join/Table_0123/${code}`)).status, 404, "nor a table id of the wrong shape");
  eq((await call("GET", `/api/join/table0123abcd/${code}/../../evil`)).status, 404, "nor anything after the code");
  const posted = await call("POST", `/api/join/table0123abcd/${code}`);
  eq([posted.status, posted.headers.get("location")], [403, null], "and only a GET is a link: a POST from elsewhere is refused before it");
}
eq((await call("GET", "/api/nothing")).status, 404, "an unknown endpoint: 404");
eq(me.headers.get("x-content-type-options") + " " + me.headers.get("cache-control"), "nosniff no-store", "answers are never sniffed or cached");

/* The standby release closes new Play requests without dropping the table class or
   changing the library. A bound table would answer 200 if the gate were missing. */
{
  const prior = (await call("GET", "/api/library")).json;
  let forwarded=0;
  env.TABLES={idFromName:id=>id,get:()=>({fetch:async()=>{forwarded++;return new Response('{}',{status:200});}})};
  env.PLAY_TABLES_CLOSED="on";
  for(const [method,path,headers] of [
    ["POST","/api/tables",{"x-crankmagic":"play"}],
    ["GET","/api/tables/table0123abcd",{}],
    ["GET","/api/tables/table0123abcd/connect",{upgrade:"websocket",origin:"https://crankmagic.test"}],
    ["GET","/api/join/table0123abcd/AbC_dEf-0123456789xyzXYZ0123456789abcdEFGH0",{}],
  ]) eq((await call(method,path,{headers})).status,503,`standby refuses ${method} ${path}`);
  eq(forwarded,0,"standby never calls a table or changes its state");
  eq((await call("GET","/api/tables/table0123abcd",{jwt:""})).status,401,"standby still requires Access");
  eq((await call("GET","/api/library")).json,prior,"cloud library stays available and unchanged");
  delete env.PLAY_TABLES_CLOSED;
  eq((await call("GET","/api/tables/table0123abcd")).status,200,"reopening reaches the retained table binding");
  delete env.TABLES;
}

/* RATE LIMITS (M3): per IP before anything else, per person once Access has said who. The bindings are
   Cloudflare's; here each is a counter with the same `limit({key}) -> {success}` shape. */
{
  const counter = (allowed) => { const seen = new Map(); return {seen, limit: async ({key}) => { seen.set(key, (seen.get(key) ?? 0) + 1); return {success: seen.get(key) <= allowed}; }}; };
  const limitedEnv = {...env, LIMIT_IP: counter(3), LIMIT_PERSON: counter(2)};
  const ask = async (path, {ip = "198.51.100.7", as = "rob@example.com", method = "GET", body, jwt} = {}) => {
    const headers = {"cf-connecting-ip": ip, "cf-access-jwt-assertion": jwt ?? await token({email: as})};
    if (body) Object.assign(headers, {"content-type": "application/json", "x-crankmagic": "sync"});
    const response = await handle(new Request(`https://crankmagic.test${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined}), limitedEnv, {fetchImpl, now: clock});
    return {status: response.status, retry: response.headers.get("retry-after"), json: await response.json()};
  };
  eq([(await ask("/api/me")).status, (await ask("/api/me")).status], [200, 200], "a person's first requests go through");
  const third = await ask("/api/me");
  eq([third.status, third.retry], [429, "60"], "past the per-person limit: 429, with Retry-After");
  ok(/Too many requests from your account\. Nothing was changed\. Wait a minute, then try again\./.test(third.json.error), "and a refusal that says what happened and what to do");
  eq((await ask("/api/me", {ip: "203.0.113.9"})).status, 429, "the person's limit follows them to another network");
  eq((await ask("/api/me", {ip: "203.0.113.9", as: "trey@example.com"})).status, 200, "and never spends someone else's");
  const head = (await call("GET", "/api/library")).json.head;
  const refused = await ask("/api/library", {method: "PUT", as: "rob@example.com", ip: "203.0.113.10", body: {...library(200), parent: head?.id ?? null}});
  eq(refused.status, 429, "a save past the limit is refused");
  eq((await call("GET", "/api/library")).json.head, head, "and changes nothing");
  keyFetches = 0;
  for (let i = 0; i < 3; i += 1) await ask("/api/me", {ip: "192.0.2.1", as: `person${i}@example.com`});
  forgetKeys();
  const flood = await ask("/api/me", {ip: "192.0.2.1", as: "person9@example.com", jwt: "not.checked.yet"});
  eq([flood.status, flood.retry], [429, "60"], "past the per-IP limit: 429, whoever is asking");
  ok(/Too many requests from this network/.test(flood.json.error), "naming the network, not an account");
  eq(keyFetches, 0, "and turned away before the token is even checked, so a flood costs no work");
}

/* DELETE ACCOUNT (R3.3b): all of one person's cloud, and nothing of anyone else's. */
{
  const rows = (email) => {
    const u = DB.raw.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!u) return {user: 0, versions: 0, head: 0};
    return {user: 1, versions: Number(DB.raw.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE user_id = ?").get(u.id).n), head: Number(DB.raw.prepare("SELECT COUNT(*) AS n FROM heads WHERE user_id = ?").get(u.id).n)};
  };
  clock += 120_000;
  const other = await call("PUT", "/api/library", {as: "someone@example.com", body: {...library(7), parent: null}});
  eq(other.status, 200, "another person has a library of their own");
  const robHead = (await call("GET", "/api/library")).json.head;
  const before = rows("rob@example.com");
  ok(before.user === 1 && before.versions > 1 && before.head === 1, `rob has an account, versions and a head to delete: ${JSON.stringify(before)}`);

  eq((await call("DELETE", "/api/account", {body: {confirm: "rob@example.com"}, headers: {"x-crankmagic": ""}})).status, 403, "a delete without the app's header: 403");
  eq((await call("DELETE", "/api/account", {body: {confirm: "rob@example.com"}, headers: {origin: "https://evil.example"}})).status, 403, "a delete from another site's page: 403");
  const wrong = await call("DELETE", "/api/account", {body: {confirm: "someone@example.com"}});
  eq([wrong.status, /Nothing was deleted/.test(wrong.json.error)], [400, true], "a delete that names another address: 400, and it says nothing was deleted");
  eq((await call("DELETE", "/api/account", {body: {}})).status, 400, "and one that names no address: 400");
  eq(rows("rob@example.com"), before, "after those refusals, every row is still there");

  const gone = await call("DELETE", "/api/account", {body: {confirm: "  ROB@Example.com "}});
  eq([gone.status, gone.json.deleted], [200, {email: "rob@example.com", versions: before.versions}], "the address typed in any case deletes the account, and says how many versions went");
  eq(rows("rob@example.com"), {user: 0, versions: 0, head: 0}, "the user row, the head and every version are gone from the database");
  eq((await call("GET", `/api/library/versions/${robHead.id}`, {as: "someone@example.com"})).status, 404, "an old version is not reachable by anyone");
  const theirs = await call("GET", "/api/library", {as: "someone@example.com"});
  eq([theirs.status, theirs.json.head.id], [200, other.json.head.id], "the other person's library is untouched");
  eq(rows("someone@example.com").versions, 1, "down to its last version");
  const again = await call("GET", "/api/library");
  eq([again.status, again.json.head], [200, null], "signed in again, rob starts an empty account: the sign-in is Access's to remove");
}

/* A path that is not the API goes back to the files: an honest 404 for a mistyped address, never "sign in". */
{
  const {default: worker} = await import("../cloud/worker.mjs");
  const assets = {fetch: (r) => new Response(`asset ${new URL(r.url).pathname}`, {status: 404})};
  const miss = await worker.fetch(new Request("https://crankmagic.test/cloud/worker.mjs"), {...env, ASSETS: assets});
  eq([miss.status, await miss.text()], [404, "asset /cloud/worker.mjs"], "a missing file is the assets' 404, not the API's 401");
  const api = await worker.fetch(new Request("https://crankmagic.test/api/me"), {...env, ASSETS: assets});
  eq(api.status, 401, "and /api/* is still the API's, which wants a signed-in person");
}

/* IMPORT BY LINK (R3.10a): a public Archidekt deck, fetched by the Worker and trimmed, with no sign-in, nothing
   stored, and only the app able to ask. The network is a stand-in that records what was asked of it. */
{
  const {DECK_BYTES, DECK_ROWS} = await import("../cloud/import.mjs");
  const Sources = (await import("../deck-sources.js")).default;
  const raw = {id: 123, name: "Krenko's Mob", owner: {username: "someone", id: 9, email: "someone@example.com", avatar: "x"}, private: false,
    categories: [{name: "Commander", includedInDeck: true}, {name: "Maybeboard", includedInDeck: false}],
    cards: [
      {quantity: 1, categories: ["Commander"], label: "", card: {id: 1, edition: {editioncode: "ddt"}, uid: "u1", prices: {tcg: 1.5, ck: 2, cm: 9}, oracleCard: {name: "Krenko, Mob Boss", manaCost: "{2}{R}{R}", text: "{T}: Create X 1/1 red Goblin creature tokens.", keywords: [], colorIdentity: ["Red"], cmc: 4, types: ["Creature"], subTypes: ["Goblin", "Warrior"], superTypes: ["Legendary"], gameChanger: false, uid: "o1"}}},
      {quantity: 30, categories: ["Land"], label: "", card: {prices: {tcg: 0.1}, oracleCard: {name: "Mountain", manaCost: "", text: "", colorIdentity: [], cmc: 0, types: ["Land"], subTypes: ["Mountain"], superTypes: ["Basic"]}}},
      {quantity: 1, categories: ["Maybeboard"], label: "", card: {oracleCard: {name: "Goblin Matron", types: ["Creature"], colorIdentity: ["Red"]}}},
    ]};
  const asked = [];
  const upstream = (make) => async (url, init) => { asked.push({url, init}); return make(url, init); };
  const nothingStored = new Proxy({}, {get() { throw Error("the import touched the database"); }});
  const importEnv = {DB: nothingStored};  /* no Access settings either: the route must not need them */
  const imp = async (query, {headers = {"x-crankmagic": "import"}, method = "GET", fetch = upstream(() => new Response(JSON.stringify(raw), {headers: {"content-type": "application/json"}})), envFor = importEnv} = {}) => {
    const response = await handle(new Request(`https://crankmagic.test/api/import/archidekt${query}`, {method, headers}), envFor, {fetchImpl: fetch, now: clock});
    return {status: response.status, cache: response.headers.get("cache-control"), json: await response.json()};
  };
  const good = await imp("?id=123");
  eq(good.status, 200, "a public deck by its number: 200, with no sign-in and no Access settings");
  eq([asked.at(-1).url, asked.at(-1).init.redirect], ["https://archidekt.com/api/decks/123/", "error"], "the Worker builds the address itself, Archidekt's API and nothing else, and follows no redirect");
  eq(good.cache, "no-store", "and the answer is not cached");
  const deck = good.json.deck;
  ok(!JSON.stringify(deck).includes("someone@example.com") && deck.owner.id === undefined && deck.cards[0].card.edition === undefined && deck.cards[0].card.prices.cm === undefined, "only what the importer reads comes back: no owner's email or id, no edition, no other vendors' prices");
  const fromRaw = Sources.fromArchidekt(raw, {url: "u"}), fromTrim = Sources.fromArchidekt(deck, {url: "u"});
  eq([fromTrim.name, fromTrim.commander, fromTrim.total, fromTrim.cards.map((c) => [c.name, c.quantity, c.card.typeLine, c.card.colorIdentity.join(""), c.card.price])],
    [fromRaw.name, fromRaw.commander, fromRaw.total, fromRaw.cards.map((c) => [c.name, c.quantity, c.card.typeLine, c.card.colorIdentity.join(""), c.card.price])],
    "and the app's importer reads the trimmed deck exactly as it reads Archidekt's own: the commander, the counts, the types, the prices, the maybeboard left out");
  eq((await imp("?id=123", {headers: {}})).status, 403, "without the app's header: 403, so a page elsewhere cannot use the Worker as its fetcher");
  eq((await imp("?id=123", {headers: {"x-crankmagic": "import", origin: "https://evil.example"}})).status, 403, "from another site's origin: 403");
  eq((await imp("?id=123", {method: "POST"})).status, 405, "anything but GET: 405");
  for (const q of ["", "?id=abc", "?id=1/../../users", "?id=12345678901", "?id=-4"]) eq((await imp(q)).status, 400, `not a deck number (${q || "none"}): 400, and nothing is asked of Archidekt`);
  const n = asked.length;
  eq((await imp("?id=9", {fetch: upstream(() => new Response("nope", {status: 404}))})).json.error, "Archidekt has no public deck 9. A private deck cannot be read by link; export its list and paste it.", "no such public deck: says so, and what to do instead");
  eq(asked.length, n + 1, "and exactly one request went out");
  eq((await imp("?id=9", {fetch: upstream(() => new Response("{}", {status: 500}))})).status, 502, "Archidekt failing: 502");
  eq((await imp("?id=9", {fetch: upstream(() => { const e = Error("slow"); e.name = "TimeoutError"; throw e; })})).status, 504, "Archidekt too slow: 504");
  eq((await imp("?id=9", {fetch: upstream(() => new Response("<html>", {status: 200}))})).status, 502, "an answer that is not a deck: 502");
  eq((await imp("?id=9", {fetch: upstream(() => new Response("{}", {headers: {"content-length": String(DECK_BYTES + 1)}}))})).status, 413, "a body that says it is too large: refused before it is read");
  const flood = new ReadableStream({pull(c) { c.enqueue(new Uint8Array(256 * 1024).fill(32)); }});
  eq((await imp("?id=9", {fetch: upstream(() => new Response(flood))})).status, 413, "a body that never says its size is cut off at the limit, not read to the end");
  eq((await imp("?id=9", {fetch: upstream(() => new Response(JSON.stringify({cards: Array.from({length: DECK_ROWS + 1}, () => ({quantity: 1, card: {oracleCard: {name: "X"}}}))})))})).status, 413, `more than ${DECK_ROWS} rows: 413`);
  const counter = (allowed) => { const seen = new Map(); return {limit: async ({key}) => { seen.set(key, (seen.get(key) ?? 0) + 1); return {success: seen.get(key) <= allowed}; }}; };
  const limited = {...importEnv, LIMIT_IP: counter(1)};
  const once = await handle(new Request("https://crankmagic.test/api/import/archidekt?id=123", {headers: {"x-crankmagic": "import", "cf-connecting-ip": "203.0.113.5"}}), limited, {fetchImpl: upstream(() => new Response(JSON.stringify(raw))), now: clock});
  const twice = await handle(new Request("https://crankmagic.test/api/import/archidekt?id=123", {headers: {"x-crankmagic": "import", "cf-connecting-ip": "203.0.113.5"}}), limited, {fetchImpl: upstream(() => new Response(JSON.stringify(raw))), now: clock});
  eq([once.status, twice.status], [200, 429], "and the per-network rate limit holds it like every other request");
}

console.log(`cloud-worker: ${checks} checks passed — Access tokens verified, writes from the app only, the head moves only from where a device left it, nothing crosses between people.`);
