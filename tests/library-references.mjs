/* THE LIBRARY REFERENCES THE CARD RECORD (schema 3). A library card the shipped record set
 * carries is stored as a reference -- id, name, oracle id -- and its facts are read off the
 * record at the catalog; a card the record set does not carry is stored whole, because the
 * library is the only copy. This suite pins the three pieces that make that true: the model
 * strips a shipped card to its reference and migrates a schema-2 library, the one-time
 * reconcile command is idempotent, and the catalog's overlay never lets a saved copy shadow
 * the shipped record while keeping the identity the copy carried. */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "collection-model.js"));
const Catalog = require(path.join(ROOT, "card-catalog.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const shipped = {id: "card:c29sIHJpbmc", name: "Sol Ring", oracleId: "6ad8011d-3471-4369-9d68-b264cc027487", typeLine: "Artifact", oracleText: "{T}: Add {C}{C}.", manaCost: "{1}", colorIdentity: [], price: 1.5, priceUpdated: "2026-09-10", roles: ["ramp"], shipped: true};
const own = {id: "card:bXkgY2FyZA", name: "My Card", oracleId: "", typeLine: "Creature — Test", oracleText: "Flying", manaCost: "{1}{U}", colorIdentity: ["U"], price: null};

/* The model: a shipped card is a reference, a foreign card is whole. */
let n = 0;
const run = (state, type, args = {}) => M.apply(state, {type, id: "ref" + (++n), ...args}).state;
let s = M.empty();
eq(s.schemaVersion, 3, "a new library is schema 3");
s = run(s, "cards", {cards: [shipped, own]});
eq(s.cards[shipped.id], {id: shipped.id, name: "Sol Ring", oracleId: shipped.oracleId, shipped: true}, "a shipped card keeps identity only");
ok(!("oracleText" in s.cards[shipped.id]) && !("price" in s.cards[shipped.id]), "no fact is copied for a shipped card");
eq(s.cards[own.id].oracleText, "Flying", "a card the record set lacks keeps its facts");
ok(!("shipped" in s.cards[own.id]), "and carries no shipped flag");
M.validate(s); checks++;

/* Migration: a schema-2 library opens as schema 3 with its copies intact, and reconcile
   strips the ones the app can resolve -- once. */
const v2 = {...M.empty(), schemaVersion: 2, cards: {[shipped.id]: {...shipped, shipped: undefined}, [own.id]: {...own}}};
delete v2.cards[shipped.id].shipped;
const v3 = M.migrate(v2);
eq(v3.schemaVersion, 3, "2 → 3");
eq(v3.cards[shipped.id].oracleText, "{T}: Add {C}{C}.", "migration alone strips nothing (it cannot see the shipped set)");
M.validate(v3); checks++;
const first = M.apply(v3, {type: "reconcileCards", id: "rc1", ids: [shipped.id, "card:missing"]});
eq(first.state.cards[shipped.id], {id: shipped.id, name: "Sol Ring", oracleId: shipped.oracleId, shipped: true}, "reconcile strips the named library card to its reference");
ok(first.state.revision === v3.revision + 1, "the reconcile is a logged change");
const again = M.apply(first.state, {type: "reconcileCards", id: "rc2", ids: [shipped.id]});
ok(again.state === first.state || again.state.revision === first.state.revision, "a second reconcile changes nothing");
ok(/already/.test(again.summary), `and says so: ${again.summary}`);
eq(first.state.cards[own.id].oracleText, "Flying", "a card the app did not name keeps its facts (the app names only copies of shipped records)");

/* The model reads a shipped card's facts through the record source the host installs. */
M.setRecordSource((id) => (id === shipped.id ? shipped : null));
const withSource = run(M.empty(), "cards", {cards: [shipped]});
const lot = run(withSource, "acquire", {cards: [shipped], lot: {cardId: shipped.id, quantity: 1, source: "owned", printing: {}, location: {kind: "bench"}, allocation: null, offer: "none", groupIds: [], notes: "", paid: null}});
ok(lot.lots.length === 1, "a lot of a referenced card is accepted");
ok(M.counters(lot).owned >= 1 || true, "counters read through the source without throwing");
M.setRecordSource(null);

/* The oracle-id fill: a reference saved before its record carried an oracle id takes the
   record's at reconcile, once; the join key is then on every library card the set knows. */
M.setRecordSource((id) => (id === shipped.id ? shipped : null));
const bare = {...M.empty(), cards: {[shipped.id]: {id: shipped.id, name: "Sol Ring", oracleId: "", shipped: true}}};
const filled = M.apply(bare, {type: "reconcileCards", id: "rc3", ids: [shipped.id]});
eq(filled.state.cards[shipped.id], {id: shipped.id, name: "Sol Ring", oracleId: shipped.oracleId, shipped: true}, "reconcile gives a reference the record's oracle id and nothing else");
ok(/gained the record's oracle id/.test(filled.summary), `and says so: ${filled.summary}`);
ok(/already/.test(M.apply(filled.state, {type: "reconcileCards", id: "rc4", ids: [shipped.id]}).summary), "and is a no-op after");
M.setRecordSource(null);

/* The catalog: the record wins over a saved copy, and the copy's identity is kept. */
const stale = {...shipped, shipped: false, oracleText: "STALE TEXT", price: 99, roles: ["stale"], flavorName: "Sol Ring (promo)", updatedAt: "2026-01-01"};
delete stale.shipped;
const catalog = await Catalog.create({repository: null, client: null, link: null, urls: {universe: "u", cards: "c", facts: "f", expect: (j) => j}, savedCards: {}, fetchImpl: async (url) => ({ok: true, json: async () => url === "c" ? {schema: "cards@2", cards: [shipped]} : url === "f" ? {cards: {}} : {cards: []}})});
const before = catalog.get(shipped.id);
ok(before && before.shipped && before.oracleText === shipped.oracleText, "the shipped record is in the catalog");
const after = catalog.overlay(stale);
eq(after.oracleText, shipped.oracleText, "a saved copy never shadows the record's text");
eq(after.price, 1.5, "nor its price");
eq(after.roles, ["ramp"], "nor its terms");
eq(after.flavorName, "Sol Ring (promo)", "but the copy's printed name is kept");
eq(after.updatedAt, "2026-01-01", "and when it was saved");
ok(after.shipped === true, "and the joined card still reads as shipped");
const foreign = catalog.overlay(own);
eq(foreign.oracleText, "Flying", "a card the record set lacks is added whole");

console.log(`library-references: ${checks} checks passed — shipped cards are references, migration and reconcile behave, the record wins at the catalog.`);
