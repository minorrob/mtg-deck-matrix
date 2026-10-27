/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CARD DEMAND: THE CARDS A TABLE CANNOT PLAY YET, COUNTED (card load step 1; Linear ROB-86;
 * docs/engine/plan-card-load-program.md; cloud/card-demand.mjs, cloud/tables.mjs, migration 0006).
 *
 * The Worker and a real table behind it, and D1 as Node's own SQLite with every migration applied in order:
 *   1. The schema: card names and counts only, and the deck lists only as digests. No column for a person, a deck, its
 *      id or name, or a table.
 *   2. "Which of these can't a table play" (POST /api/tables/known): each name it cannot play counted as asked; the
 *      answer carries `listed`, the names now on the list for the next wave. Names asked together count in no deck.
 *   3. Decks asked as decks: the same deck asked twice counts once, another deck once more; a name in any case is one row.
 *   4. A seat's deck refused for its cards counts, and as the same deck it was asked as.
 *   5. Never the person, the table or the deck: after every question, no stored value is an address, a table id, a deck
 *      name, or a name that could be an address.
 *   6. The answer never depends on the record: no database, or one without the table, answers as before, with no `listed`.
 *   7. D1's limits: 2000 names in one question, no statement binding more than 100 values.
 *   8. The wave's order: the most decks first, then the most asked; cards the engine plays dropped; demand ahead of the
 *      most-played list, each card once.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";
import {recordDemand, deckDigest, demandName} from "../cloud/card-demand.mjs";
import {readRows, rankDemand, waveOrder} from "../game/tools/card-demand.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* D1 as far as the recorder uses it, with D1's own limit: at most 100 values bound to a statement. */
const MIGRATIONS = readdirSync(new URL("../cloud/migrations/", import.meta.url)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
let widest = 0;
function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of MIGRATIONS) db.exec(readFileSync(new URL(`../cloud/migrations/${f}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...values) => {widest = Math.max(widest, values.length); assert.ok(values.length <= 100, `D1 binds at most 100 values; this statement bound ${values.length}`); return statement(sql, values);},
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}),
    run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
    now: () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {raw: db, prepare: (sql) => statement(sql), batch: async (list) => {
    db.exec("BEGIN");
    try {const out = list.map((s) => s.now()); db.exec("COMMIT"); return out;} catch (error) {db.exec("ROLLBACK"); throw error;}
  }};
}
const rows = (DB) => DB.raw.prepare("SELECT name, asked, decks FROM card_demand ORDER BY name").all().map((r) => [r.name, r.asked, r.decks]);
const quiet = {warn: () => {}};

/* ---- 1. The schema ---- */
{
  eq(MIGRATIONS.filter((f) => f.startsWith("0006")), ["0006_card_demand.sql"], "1. migration 0006 is card demand's (0009 is the feedback loop's; 0007 and 0008 are reserved, docs/ACTIVE.md)");
  const DB = d1();
  const columns = (t) => DB.raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const made = readFileSync(new URL("../cloud/migrations/0006_card_demand.sql", import.meta.url), "utf8").match(/CREATE TABLE (\w+)/g).map((m) => m.split(" ")[2]);
  eq(made, ["card_demand", "card_demand_lists"], "it makes two tables");
  eq(columns("card_demand"), ["name", "asked", "decks", "first_seen", "last_seen"], "card_demand: a card name and its counts, nothing else");
  eq(columns("card_demand_lists"), ["digest", "seen"], "card_demand_lists: a digest and a date, nothing else");
  for (const t of made) ok(!columns(t).some((c) => /email|user|person|owner|who|deck_?id|deck_?name|table|seat/i.test(c)), `${t} has no column for a person, a deck or a table`);
}

/* The Worker, Access, and a real table behind them. */
const TEAM = "crankmagic-test.cloudflareaccess.com", AUD = "aud-library", ROB = "rob@example.com";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
const token = async (email) => {
  const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
  const p = b64url(JSON.stringify({aud: [AUD], iss: `https://${TEAM}`, email, exp: Date.now() / 1000 + 3600, iat: Date.now() / 1000}));
  return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
};
const fetchImpl = async () => new Response(JSON.stringify({keys: [jwk]}));
const KNOWN = new Map([["General Rob", {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"}]]);
const cards = (name) => KNOWN.get(name) ?? basicCards(name);
function objectCtx() {
  const map = new Map();
  return {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: () => {}, getWebSockets: () => [], getTags: () => []};
}
let seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 31 + i * 7) % 256);};
const objects = new Map();
const TABLES = {idFromName: (name) => name, get: (id) => {if (!objects.has(id)) objects.set(id, new GameTable(objectCtx(), {}, {cards, random, now: () => Date.parse("2026-10-18T12:00:00Z")})); return objects.get(id);}};
forgetKeys();
const call = async (method, path, {body, env} = {}) => {
  const init = {method, headers: {"cf-access-jwt-assertion": await token(ROB), ...(body !== undefined ? {"content-type": "application/json", "x-crankmagic": "play"} : {})}};
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await handle(new Request(`https://crankmagic.test${path}`, init), {ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, TABLES, ...env}, {fetchImpl});
  return {status: r.status, json: await r.json().catch(() => null)};
};
const warned = [];
const realWarn = console.warn;
console.warn = (...a) => warned.push(a.join(" "));

/* ---- 2. Names asked together ---- */
const DB = d1();
{
  const r = await call("POST", "/api/tables/known", {body: {names: ["Mountain", "Rhystic Study", "Smothering Tithe", "Rhystic Study"]}, env: {DB}});
  eq([r.status, r.json.unknown, r.json.listed], [200, ["Rhystic Study", "Smothering Tithe"], ["Rhystic Study", "Smothering Tithe"]],
    "2. the table names the two it cannot play, and the answer says both are now on the list");
  eq(rows(DB), [["Rhystic Study", 1, 0], ["Smothering Tithe", 1, 0]], "each counted as asked once, in no deck: names asked together are no deck");
  const known = await call("POST", "/api/tables/known", {body: {names: ["Mountain", "Forest"]}, env: {DB}});
  eq([known.json.unknown, "listed" in known.json], [[], false], "a question about cards it can play lists nothing");
  await call("POST", "/api/tables/known", {body: {names: ["Rhystic Study"]}, env: {DB}});
  eq(rows(DB)[0], ["Rhystic Study", 2, 0], "asked again: twice");
}

/* ---- 3. Decks asked as decks ---- */
const robsDeck = ["General Rob", "Mountain", "Rhystic Study", "Cyclonic Rift"];
{
  const r = await call("POST", "/api/tables/known", {body: {decks: [robsDeck, ["Forest", "Cyclonic Rift", "Dockside Extortionist"]]}, env: {DB}});
  eq([r.status, r.json.unknown, r.json.listed], [200, ["Cyclonic Rift", "Dockside Extortionist", "Rhystic Study"], ["Cyclonic Rift", "Dockside Extortionist", "Rhystic Study"]],
    "3. two decks in one question: one answer for both");
  eq(rows(DB), [["Cyclonic Rift", 1, 2], ["Dockside Extortionist", 1, 1], ["Rhystic Study", 3, 1], ["Smothering Tithe", 1, 0]],
    "Cyclonic Rift is in both decks, so two decks; asked once, by one question");
  await call("POST", "/api/tables/known", {body: {decks: [robsDeck]}, env: {DB}});
  await call("POST", "/api/tables/known", {body: {decks: [[...robsDeck, "Mountain"].reverse().map((n) => ` ${n} `)]}, env: {DB}});
  eq(rows(DB).filter(([n]) => n !== "Smothering Tithe" && n !== "Dockside Extortionist"), [["Cyclonic Rift", 3, 2], ["Rhystic Study", 5, 1]],
    "the same deck asked twice more, once reordered, padded and with a repeat: asked counted, the deck not again");
  await call("POST", "/api/tables/known", {body: {names: ["rhystic study"]}, env: {DB}});
  eq(rows(DB).filter(([n]) => /rhystic/i.test(n)), [["Rhystic Study", 6, 1]], "a name in any case is the same card's row, kept as first asked");
  eq((await call("POST", "/api/tables/known", {body: {decks: ["Rhystic Study"]}, env: {DB}})).status, 400, "a deck that is not a list of names is refused");
}

/* ---- 4. A seat's deck refused for its cards ---- */
{
  const made = await call("POST", "/api/tables", {body: {hostName: "Rob", seats: [{kind: "ai"}]}, env: {DB}});
  const id = made.json.table.tableId;
  const deck = {name: "Rob's Secret Brew", commander: ["General Rob"], cards: ["Mountain", "Rhystic Study", "Cyclonic Rift"]};
  const refused = await call("POST", `/api/tables/${id}/deck`, {body: {seatId: 0, deck}, env: {DB}});
  eq([refused.status, refused.json.unsupported, refused.json.listed], [422, ["Cyclonic Rift", "Rhystic Study"], ["Cyclonic Rift", "Rhystic Study"]],
    "4. the table refuses the deck by name, and the refusal says those cards are on the list");
  ok(/cannot play/.test(refused.json.error), "with the table's own words");
  eq(rows(DB).filter(([n]) => n === "Cyclonic Rift" || n === "Rhystic Study"), [["Cyclonic Rift", 4, 2], ["Rhystic Study", 7, 1]],
    "the same deck as was asked about before: counted as asked, not as another deck");
  await call("POST", `/api/tables/${id}/deck`, {body: {seatId: 0, deck: {...deck, cards: [...deck.cards, "Mana Crypt"]}}, env: {DB}});
  eq(rows(DB).filter(([n]) => n === "Mana Crypt" || n === "Rhystic Study"), [["Mana Crypt", 1, 1], ["Rhystic Study", 8, 2]], "edited, it is another deck list, and counts once more");
  const fine = await call("POST", `/api/tables/${id}/deck`, {body: {seatId: 0, deck: {name: "Lands", commander: ["General Rob"], cards: ["Mountain"]}}, env: {DB}});
  eq([fine.status, "listed" in fine.json.table, "listed" in fine.json], [200, false, false], "a deck the table can play is seated, and nothing is counted");
  const ready = await call("POST", `/api/tables/${id}/ready`, {body: {seatId: 0, ready: true}, env: {DB}});
  ok(!("listed" in (ready.json || {})), "nor on any other action");

  /* ---- 5. Never the person, the table or the deck ---- */
  await call("POST", "/api/tables/known", {body: {names: ["rob@example.com", "https://evil.example/x", "x".repeat(151), "Real\u0000Card", "Sol Ring "]}, env: {DB}});
  const stored = new Set();
  for (const t of ["card_demand", "card_demand_lists"]) for (const row of DB.raw.prepare(`SELECT * FROM ${t}`).all()) for (const v of Object.values(row)) stored.add(String(v));
  ok(![...stored].some((v) => v.includes("@") || v.includes("://") || v.length > 150), "5. no stored value is an address, a link or a name longer than any card's");
  ok(![...stored].some((v) => v.includes(id) || /secret brew|lands|rob\b/i.test(v)), "nor the table's id, the deck's name or the host's");
  ok(stored.has("Sol Ring") && !stored.has("Sol Ring "), "a name is kept trimmed");
  ok([...DB.raw.prepare("SELECT digest FROM card_demand_lists").all()].every((r) => /^[0-9a-f]{64}$/.test(r.digest)), "each deck list only as a 64-hex digest");
  eq(DB.raw.prepare("SELECT COUNT(*) AS n FROM card_demand_lists").get().n, 3, "three different deck lists, of all the questions");
  eq(await deckDigest(["Sol Ring", "Mountain"]), await deckDigest([" mountain", "SOL RING", "Mountain"]), "a list's digest does not depend on order, case or repeats");
  eq([demandName("a@b"), demandName("Sol  Ring"), demandName(7)], [null, "Sol Ring", null], "a name to keep, or none");
}

/* ---- 6. The answer never depends on the record ---- */
{
  const bare = await call("POST", "/api/tables/known", {body: {names: ["Rhystic Study"]}});
  eq([bare.status, bare.json], [200, {unknown: ["Rhystic Study"]}], "6. no database: the answer as before, with no listed");
  const before = warned.length;
  const empty = new DatabaseSync(":memory:");
  const unmigrated = {prepare: (sql) => {const s = (args = []) => ({bind: (...v) => s(v), all: async () => ({results: empty.prepare(sql).all(...args)}), run: async () => ({meta: {}}), now: () => empty.prepare(sql).run(...args)}); return s();}, batch: async (l) => l.map((s) => s.now())};
  const missing = await call("POST", "/api/tables/known", {body: {decks: [["Rhystic Study"]]}, env: {DB: unmigrated}});
  eq([missing.status, missing.json], [200, {unknown: ["Rhystic Study"]}], "a database without migration 0006: the answer as before");
  ok(warned.length === before + 1 && /Card demand not recorded: no such table/.test(warned.at(-1)), "and the failure said once in the log");
  ok(!warned.some((w) => w.includes(ROB)), "never with who asked");
  const made = await call("POST", "/api/tables", {body: {hostName: "Rob", seats: [{kind: "ai"}]}, env: {DB: unmigrated}});
  const refused = await call("POST", `/api/tables/${made.json.table.tableId}/deck`, {body: {seatId: 0, deck: {commander: ["General Rob"], cards: ["Mana Crypt"]}}, env: {DB: unmigrated}});
  eq([refused.status, refused.json.unsupported, "listed" in refused.json], [422, ["Mana Crypt"], false], "the table's refusal as before too");
}

/* ---- 7. D1's limits ---- */
{
  const big = d1();
  widest = 0;
  const names = Array.from({length: 2000}, (_, i) => `Unloaded Card ${i}`);
  const r = await call("POST", "/api/tables/known", {body: {decks: [names.slice(0, 1000), names.slice(1000)]}, env: {DB: big}});
  eq([r.status, r.json.listed.length], [200, 2000], "7. two thousand names in one question, all listed");
  eq([big.raw.prepare("SELECT COUNT(*) AS n, SUM(decks) AS d, SUM(asked) AS a FROM card_demand").get()].map((x) => [x.n, x.d, x.a]), [[2000, 2000, 2000]], "every one counted, each in its one deck");
  ok(widest <= 100 && widest >= 90, `no statement bound more than D1's 100 values (the widest bound ${widest})`);
  /* Two questions about one new deck at the same moment: the second finds the first's digest and counts no new deck. */
  const race = d1(), prepare = race.prepare;
  /* Both questions read before either writes: each SELECT waits until both have been asked. */
  let open, reads = 0;
  const gate = new Promise((resolve) => {open = resolve;});
  race.prepare = (sql) => {
    const s = prepare(sql);
    if (!/^SELECT/.test(sql)) return s;
    return {bind: (...v) => {const b = s.bind(...v); return {...b, all: async () => {reads += 1; if (reads === 2) open(); await gate; return b.all();}};}};
  };
  await Promise.all([recordDemand(race, [{deck: ["A Card"], unknown: ["A Card"]}], {log: quiet}), recordDemand(race, [{deck: ["A Card"], unknown: ["A Card"]}], {log: quiet})]);
  eq(rows(race), [["A Card", 2, 1]], "two questions at once about one new deck: asked twice, one deck");
  ok(reads >= 3, "the second read the list again after its first write was refused");
}

/* ---- 8. The wave's order ---- */
{
  const wrangler = [{results: [
    {name: "Rhystic Study", asked: 9, decks: 1, first_seen: "2026-10-18T12:00:00Z", last_seen: "2026-10-18T12:00:00Z"},
    {name: "Cyclonic Rift", asked: 4, decks: 2, first_seen: "2026-10-18T12:00:00Z", last_seen: "2026-10-18T12:00:00Z"},
    {name: "Mana Crypt", asked: 4, decks: 2, first_seen: "2026-10-18T12:00:00Z", last_seen: "2026-10-18T13:00:00Z"},
    {name: "Mountain", asked: 50, decks: 9, first_seen: "2026-10-18T12:00:00Z", last_seen: "2026-10-18T12:00:00Z"},
  ], success: true}];
  const demand = rankDemand(readRows(wrangler), {playable: (n) => Boolean(basicCards(n))});
  eq(demand.map((d) => d.name), ["Mana Crypt", "Cyclonic Rift", "Rhystic Study"], "8. the most decks first, then the most asked, then the most recent; a card the engine plays dropped");
  const top = [{rank: 724, name: "Sylvan Library", missing: []}, {rank: 730, name: "Rhystic Study", missing: ["x:y"]}, {rank: 731, name: "Esper Sentinel", missing: []}];
  const order = waveOrder(demand, top, {extra: () => ({missing: ["(not in inventory)"]})});
  eq(order.map((r) => [r.name, r.rank, r.demand ? r.demand.decks : null]), [["Mana Crypt", null, 2], ["Cyclonic Rift", null, 2], ["Rhystic Study", 730, 1], ["Sylvan Library", 724, null], ["Esper Sentinel", 731, null]],
    "the wave list: the demanded cards first, each once, then the most-played in their own order");
  eq(order[2].missing, ["x:y"], "a demanded card keeps what the most-played list says it needs");
  eq(readRows([{name: "Sol Ring", asked: 1, decks: 0}]).length, 1, "a plain list of rows is read too");
  assert.throws(() => readRows({nothing: true}), /card_demand rows/); checks += 1;
}

console.warn = realWarn;
console.log(`card-demand: ${checks} checks passed — the cards a table cannot play counted at the table's own answer, by name and count only, each deck once; the answer the same with or without the record; the wave list demand first.`);
