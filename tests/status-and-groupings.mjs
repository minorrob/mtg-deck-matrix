/* ONE VOCABULARY, ONE GROUPING, ONE PROJECTION. Recommendations 7, 8, 9 and 11 of the data-model
 * report: the status words live in the model (M.STATUS) and every module reads them; grouping
 * lives in crankmagic-groupings.js; the deck-page and graph literals live in crankmagic-rules.js;
 * and the projection is computed once per state revision. This suite pins each, and pins that
 * no module spells the status list again. */
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "collection-model.js"));
const G = require(path.join(ROOT, "crankmagic-groupings.js"));
const R = require(path.join(ROOT, "crankmagic-rules.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

/* The vocabulary. */
const labels = M.STATUS.map((s) => s.label);
eq(new Set(labels).size, labels.length, "every status label is unique");
eq(M.STATUS.map((s) => s.order), M.STATUS.map((_, i) => i), "the orders are the positions, in the order the work happens");
ok(labels[0] === "Physical deck" && labels.includes("To buy") && labels.includes("Draft list"), "the words the pages use are in it");
eq(M.statusOf({kind: "need"}), "To buy"); eq(M.statusOf({kind: "draft"}), "Draft list"); eq(M.statusOf({kind: "option"}), "Suggestion"); eq(M.statusOf({kind: "entry"}), "Planned");
eq(M.statusOf({kind: "lot", source: "watching", placement: "Bench"}), "Watched"); eq(M.statusOf({kind: "lot", source: "ordered", placement: "Reserved"}), "Ordered"); eq(M.statusOf({kind: "lot", source: "owned", placement: "Physical deck"}), "Physical deck");
eq(M.statusTone("Reserved"), "reserved", "a reserved copy's pill is reserved, not watch (the deck page used to say watch)");
eq(M.statusTone("nothing"), "draft", "an unknown label gets the quiet tone"); eq(M.statusOrder("nothing"), M.STATUS.length, "and sorts last");
/* No module spells the list again. */
for (const f of readdirSync(ROOT).filter((f) => /^crankmagic-.*\.js$/.test(f))) {
  const text = readFileSync(path.join(ROOT, f), "utf8");
  ok(!/\['Physical deck','Substitute','Reserved'/.test(text), `${f} does not carry its own copy of the status order`);
}

/* The groupings. */
const value = (r, key) => ({status: r.status, deck: r.deck, type: r.type})[key];
eq(G.CHOICES.map((c) => c[0]), ["", "deck", "status", "vendor", "type", "color", "groups"], "the seven choices");
eq(G.label({card: {colorIdentity: ["W", "U"]}}, "color", value), "Multiple"); eq(G.label({card: {colorIdentity: []}}, "color", value), "Colorless"); eq(G.label({card: {colorIdentity: ["G"]}}, "color", value), "Green");
eq(G.label({status: "To buy"}, "status", value), "To buy", "any other key reads the caller's column");
ok(G.order({card: {colorIdentity: ["W"]}}, "color", value) < G.order({card: {colorIdentity: ["W", "B"]}}, "color", value) && G.order({card: {colorIdentity: ["W", "B"]}}, "color", value) < G.order({card: {colorIdentity: []}}, "color", value), "colours sort the five, then gold, then colourless");
ok(G.order({status: "Physical deck"}, "status", value, M.statusOrder) < G.order({status: "To buy"}, "status", value, M.statusOrder), "statuses sort in the vocabulary's order");
eq(G.order({deck: ""}, "deck", value), "￿", "a row with no value goes last");

/* The rules. */
ok(R.GC_LIMIT >= 1 && R.UPGRADE_CHEAP_LINE > 0 && R.LOOP_MAX_LEN >= 2, "the literals are numbers with a floor");
eq(R.TYPE_ORDER[0], "Commander"); eq(R.TYPE_ORDER[R.TYPE_ORDER.length - 1], "Other");
eq(R.deckArt("Krenko, Mob Boss"), "assets/crankmagic/commander-krenko.webp?v=1"); eq(R.deckArt("Nobody"), "", "a commander without art shows nothing from here");
for (const f of ["crankmagic-decks.js", "crankmagic-loops.js"]) {
  const text = readFileSync(path.join(ROOT, f), "utf8");
  ok(!/const GC_LIMIT=2;|\/\^D\[56\]|'atraxa','krenko'/.test(text), `${f} no longer carries the literal`);
}

/* The projection: one computation per revision, fresh rows every call. */
let n = 0;
const run = (state, type, args = {}) => M.apply(state, {type, id: "pj" + (++n), ...args}).state;
const card = {id: "card:c29sIHJpbmc", name: "Sol Ring", oracleId: "6ad8011d-3471-4369-9d68-b264cc027487", typeLine: "Artifact", oracleText: "{T}: Add {C}{C}.", manaCost: "{1}", colorIdentity: [], legalities: {commander: "legal"}, price: 1.5};
let s = run(M.empty(), "cards", {cards: [card]});
s = run(s, "acquire", {cards: [card], lot: {cardId: card.id, quantity: 2, source: "owned", printing: {}, location: {kind: "bench"}, allocation: null, offer: "none", groupIds: [], notes: "", paid: null}});
const a = M.projection(s), b = M.projection(s);
eq(a, b, "two calls on one state agree");
ok(a !== b && a[0] !== b[0], "and hand back fresh arrays and rows");
a[0].status = "scribbled";
ok(M.projection(s)[0].status !== "scribbled", "a caller's annotation does not leak into the next call");
const s2 = run(s, "acquire", {cards: [card], lot: {cardId: card.id, quantity: 1, source: "watching", printing: {}, location: {kind: "bench"}, allocation: null, offer: "none", groupIds: [], notes: "", paid: null}});
ok(M.projection(s2).length > a.length, "a new revision is recomputed");

console.log(`status-and-groupings: ${checks} checks passed — ${M.STATUS.length} statuses in one list, ${G.CHOICES.length} grouping choices in one module, the literals in the rules, the projection memoised per revision.`);
