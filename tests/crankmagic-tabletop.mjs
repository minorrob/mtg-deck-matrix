/* THE TABLETOP'S PILES (docs/crankmagic-tabletop-plan.md TB1), on the committed live library.
 * Every pile is a query the model already answers, so the table is held to the list: the
 * status piles are M.STATUS in its order and their counts are the status column's tallies,
 * the Bench rail is the rows whose status is Bench, no row is on two piles, and a grouping's
 * piles cover the same rows in the order a reader expects. The renderer is DOM and is walked
 * in the browser; nothing here draws. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "collection-model.js"));
const R = require(path.join(ROOT, "crankmagic-rules.js")); globalThis.CrankRules = R;
const G = require(path.join(ROOT, "crankmagic-groupings.js")); globalThis.CrankGroupings = G;
const CL = require(path.join(ROOT, "card-classify.js")); globalThis.MtgCardClassify = CL;
const Catalog = require(path.join(ROOT, "card-catalog.js"));
const T = require(path.join(ROOT, "crankmagic-tabletop.js"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8"));
const state = M.migrate(live.payload.state || live.payload);
const records = new Map(JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")).cards.map((c) => [Catalog.folded(c.name), c]));
M.setRecordSource((id) => { const ref = state.cards[id]; const rec = ref && records.get(Catalog.folded(ref.name)); return rec ? {...rec, id} : null; });
/* The rows the Cards page builds: the projection, the draft plans, the group entries. */
const rows = M.projection(state).map((r) => ({...r, status: M.statusOf(r)}));
const cardOf = (id) => { const ref = state.cards[id]; const rec = ref && records.get(Catalog.folded(ref.name)); return rec ? {...rec, ...ref, id} : ref; };
for (const g of state.groups) for (const r of g.entries) rows.push({recordId: "entry:" + g.id + ":" + r.id, kind: "entry", card: cardOf(r.cardId), cardId: r.cardId, quantity: r.quantity, status: "Planned"});
const value = (r, k) => { const c = r.card || {}; return k === "type" ? String(c.typeLine || "").split("—")[0].trim() : k === "deck" ? (r.deckId ? (state.decks.find((d) => d.id === r.deckId) || {}).name || "" : "") : k === "groups" ? (r.groupIds || []).map((id) => (state.groups.find((g) => g.id === id) || {}).name).filter(Boolean).join(", ") : c[k]; };
const opts = {statuses: M.STATUS, statusOrder: M.statusOrder, value};

/* The status piles and the rail. */
const t = T.table(rows, {...opts, groupBy: "type"});
const sum = (list) => list.reduce((n, r) => n + r.quantity, 0);
eq(t.total, sum(rows), "the table holds every copy the rows hold");
eq(t.statusPiles.map((p) => p.label), M.STATUS.map((s) => s.label).filter((l) => l !== "Bench"), "the status piles are the model's vocabulary in its order, the Bench aside");
eq(t.bench.count, sum(rows.filter((r) => r.status === "Bench")), "the rail is the Bench rows");
ok(t.bench.count > 100, `the live library has a bench (${t.bench.count} copies)`);
for (const p of t.statusPiles) eq(p.count, sum(rows.filter((r) => r.status === p.label)), `${p.label}: the placard is the status column's tally`);
eq(t.statusPiles.reduce((n, p) => n + p.count, 0) + t.bench.count, t.total, "no copy is on two piles and none is missing");
ok(t.statusPiles.find((p) => p.label === "Physical deck").count > 400, "the six decks' boxes are on the Physical deck pile");
ok(t.statusPiles.find((p) => p.label === "To buy").ghost && t.statusPiles.find((p) => p.label === "Ordered").ghost && !t.statusPiles.find((p) => p.label === "Physical deck").ghost, "to-buy and ordered piles are ghosts; a box is not");
eq(t.ghosts, rows.filter((r) => T.isGhost(r)).length, "ghost rows are counted once");
/* TB5: the piles a card can be dropped on are marked; the rest are readings of a plan. */
eq(t.statusPiles.filter((p) => p.target).map((p) => p.label).join(","), "Physical deck,Substitute,Reserved,Ordered,Watched,To buy", "six status piles take a drop, in workflow order");
ok(t.statusPiles.filter((p) => p.target === false).every((p) => /^(Draft list|Suggestion|Planned|Unassigned)$/.test(p.label)), "the readings are Draft list, Suggestion, Planned and Unassigned");
eq(T.TARGET.size, 6); eq(T.STAGE.full.w, 488); eq(T.STAGE.full.h, 680, "the stage's full size is Scryfall's normal print");
ok(t.statusPiles.every((p) => !p.count || (p.top && p.top.card)), "a pile with cards has a top card to show");
ok(t.statusPiles.every((p) => p.rows.every((r, i, a) => i === 0 || String(a[i - 1].card.name).localeCompare(String(r.card.name)) <= 0)), "a pile's rows are by name");

/* The group piles under each grouping cover the rows, in the reader's order. */
for (const [key] of T.GROUPINGS) {
  const g = T.table(rows, {...opts, groupBy: key});
  eq(g.groupPiles.reduce((n, p) => n + p.count, 0), g.total, `${key}: the group piles cover every copy`);
  ok(g.groupPiles.every((p) => p.count > 0 && p.label), `${key}: no empty or unlabelled pile`);
  ok(g.groupPiles.every((p, i, a) => i === 0 || a[i - 1].order.localeCompare(p.order) <= 0 || (a[i - 1].order === p.order && a[i - 1].label.localeCompare(p.label) <= 0)), `${key}: piles in order`);
}
const color = T.table(rows, {...opts, groupBy: "color"});
ok(color.groupPiles.map((p) => p.label).every((l) => G.COLOR_PILE.includes(l)), "colour piles are the list's seven words");
ok(color.groupPiles.findIndex((p) => p.label === "White") < color.groupPiles.findIndex((p) => p.label === "Green"), "in WUBRG order");
const mv = T.table(rows, {...opts, groupBy: "mv"});
ok(mv.groupPiles.map((p) => p.label).join(",").startsWith("0,1,2") && mv.groupPiles.some((p) => p.label === "7+"), `mana value piles count up (${mv.groupPiles.map((p) => p.label).join(", ")})`);
const price = T.table(rows, {...opts, groupBy: "price"});
eq(price.groupPiles.map((p) => p.label).filter((l) => l !== "Unpriced"), R.BANDS.map((b) => b[1]).filter((l) => price.groupPiles.some((p) => p.label === l)), "price piles are the house bands, cheapest first");
const purpose = T.table(rows, {...opts, groupBy: "purpose"});
ok(purpose.groupPiles.some((p) => p.label === "Ramp") && purpose.groupPiles.some((p) => p.label === "Removal"), "Primary Purpose piles read the classifier's ladder");
ok(purpose.groupPiles[purpose.groupPiles.length - 1].label === "No purpose read" || !purpose.groupPiles.some((p) => p.label === "No purpose read"), "'No purpose read' goes last");
eq(T.table(rows, {...opts, groupBy: "nonsense"}).groupBy, "type", "an unknown grouping falls back to card type");

/* Filters: the caller narrows the rows and every pile follows. */
const red = rows.filter((r) => (r.card.colorIdentity || []).join("") === "R");
const narrowed = T.table(red, {...opts, groupBy: "type"});
eq(narrowed.total, sum(red)); ok(narrowed.statusPiles.some((p) => p.count === 0), "a filtered table leaves some status piles empty, and they still exist (the slot stays)");
eq(T.table([], opts).statusPiles.length, M.STATUS.length - 1, "an empty library still has every status slot");
eq(JSON.stringify(T.table(rows, {...opts, groupBy: "deck"})), JSON.stringify(T.table(rows, {...opts, groupBy: "deck"})), "deterministic");
/* Card type is the eight primary types; an Artifact Creature is a Creature, a Legendary Land a Land. */
const type = T.table(rows, {...opts, groupBy: "type"});
ok(type.groupPiles.every((p) => T.TYPE_ORDER.includes(p.label)), `card type piles are primary types (${type.groupPiles.map((p) => p.label).join(", ")})`);
ok(type.groupPiles.length <= 8 && type.groupPiles.length >= 6, `${type.groupPiles.length} type piles on the live library`);
eq(type.groupPiles[0].label, "Creature"); eq(type.groupPiles[type.groupPiles.length - 1].label, "Land");
eq(T.primaryType("Legendary Artifact Creature — Golem"), "Creature"); eq(T.primaryType("Basic Snow Land — Island"), "Land"); eq(T.primaryType("Kindred Instant — Goblin"), "Instant"); eq(T.primaryType("Legendary Enchantment"), "Enchantment"); eq(T.primaryType(""), "No card type");
eq(type.groupPiles.find((p) => p.label === "Creature").count, sum(rows.filter((r) => /\bCreature\b/.test(String(r.card.typeLine).split("—")[0]))), "every creature, artifact or enchantment or legendary, is on the Creature pile");
/* Past the cap the smallest bands fold into one Other pile that says what it holds. */
const mechAll = T.table(rows, {...opts, groupBy: "mechanic"}), mech = T.table(rows, {...opts, groupBy: "mechanic", maxGroupPiles: 6});
ok(mechAll.groupPiles.length > 6, `uncapped, every mechanic is a pile (${mechAll.groupPiles.length})`);
eq(mech.groupPiles.length, 6, "capped at six piles");
const other = mech.groupPiles[mech.groupPiles.length - 1];
eq(other.label, "Other"); eq(other.folded, mechAll.groupPiles.length - 5); eq(other.bands.length, other.folded);
eq(mech.groupPiles.reduce((n, p) => n + p.count, 0), mech.total, "the folded table still covers every copy");
ok(mech.groupPiles.slice(0, 5).every((p) => p.count >= Math.max(...other.bands.map((b) => mechAll.groupPiles.find((q) => q.label === b).count))), "the kept piles are the biggest");
ok(mech.groupPiles.slice(0, 5).every((p, i, a) => i === 0 || a[i - 1].order.localeCompare(p.order) <= 0 || (a[i - 1].order === p.order && a[i - 1].label.localeCompare(p.label) <= 0)), "the kept piles keep the reader's order");
eq(T.table(rows, {...opts, groupBy: "type", maxGroupPiles: 16}).groupPiles.some((p) => p.label === "Other"), false, "no Other pile under the cap");
/* The arches: sizes sum to the pile count, no pile on two arches, each inner arch narrower. */
eq(T.arcsOf(7, 12), [7]); eq(T.arcsOf(16, 12), [12, 4]); eq(T.arcsOf(30, 12), [12, 10, 8]); eq(T.arcsOf(0, 12), []); eq(T.arcsOf(5, 3), [3, 2]);
for (const n of [1, 9, 16, 25, 40]) { const s = T.arcsOf(n, 11); eq(s.reduce((a, b) => a + b, 0), n, `${n} piles land on the arches once`); ok(s.every((x, i) => i === 0 || x <= s[i - 1]), "inner arches are no wider"); }
/* TB2: a pile's natural order and its pages. */
const mk = (name, mv, extra = {}) => ({recordId: "r:" + name, quantity: 1, card: {name, manaValue: mv, typeLine: "Creature"}, ...extra});
eq(T.pileOrder({kind: "group", label: "Creature", rows: [mk("Zed", 3), mk("Abe", 3), mk("Cat", 1), mk("Nix", null)]}).map((r) => r.card.name), ["Cat", "Abe", "Zed", "Nix"], "mana value then name, no cost last");
eq(T.pileOrder({kind: "bench", label: "Bench", rows: [mk("Zed", 1), mk("Abe", 5)]}).map((r) => r.card.name), ["Abe", "Zed"], "the Bench by name");
eq(T.pileOrder({kind: "status", label: "Ordered", rows: [mk("Late", 1, {order: {placed: "2026-09-10"}}), mk("Early", 9, {order: {placed: "2026-08-01"}})]}).map((r) => r.card.name), ["Early", "Late"], "Ordered by order date");
const hundred = {kind: "status", label: "Physical deck", rows: Array.from({length: 100}, (_, i) => mk("Card " + String(i).padStart(3, "0"), i % 8))};
let l = T.layout(hundred, {width: 960, size: "M", page: 0, rowsFit: 3});
eq([l.cols, l.perPage, l.pages, l.from, l.to, l.cards.length, l.label], [8, 24, 5, 0, 24, 24, "1\u201324 of 100"], "eight across at M on 960, three rows to a page");
l = T.layout(hundred, {width: 960, size: "M", page: 99, rowsFit: 3});
eq([l.page, l.from, l.to, l.cards.length, l.label, l.lines], [4, 96, 100, 4, "97\u2013100 of 100", 1], "a page past the end clamps to the last");
eq(T.layout(hundred, {width: 390, size: "M", rowsFit: 4}).cols, 3, "three across on a phone at M");
eq(T.layout(hundred, {width: 1400, size: "L", rowsFit: 2}).cols, 8, "eight across at L on 1400");
eq(T.layout(hundred, {width: 1400, size: "S", rowsFit: 2}).cols, 18, "eighteen across at S on 1400");
eq(T.layout({kind: "status", label: "Watched", rows: []}, {width: 960}).label, "Nothing on this pile");
eq(T.layout({kind: "status", label: "Physical deck", count: 12, rows: [mk("A", 1, {quantity: 10}), mk("B", 2, {quantity: 2})]}, {width: 960}).label, "1–2 of 2 · 12 copies", "the strip counts rows, and copies when they differ");
ok(T.layout(hundred, {width: 960, size: "M", rowsFit: 3}).cards.every((c, i, a) => i === 0 || a[i - 1].index + 1 === c.index), "cards carry their index in the pile");
eq(T.layout(hundred, {width: 960, size: "M", rowsFit: 3}).cards[9].x, 16 + 1 * (96 + 12), "the tenth card starts the second column of the second row");
eq(T.layout(hundred, {width: 960, size: "M", rowsFit: 3}).cards[9].y, 134 + T.SIZES.M.cap + 12, "the second row starts under the first row's caption");
eq(T.layout(hundred, {width: 960, size: "M", rowsFit: 3}).height, 3 * (134 + T.SIZES.M.cap + 12) - 12, "the page's height counts the captions");
ok(T.SIZES.S.cap < T.SIZES.M.cap && T.SIZES.M.cap < T.SIZES.L.cap, "a bigger card carries a bigger caption");
eq(T.layout(hundred, {width: 960, size: "nonsense"}).size, "M", "an unknown size is M");
eq(T.findPile(t, "bench").label, "Bench"); eq(T.findPile(t, t.statusPiles[0].id).label, t.statusPiles[0].label); eq(T.findPile(t, "nope"), null);
/* TB3: the drop-target contract, on the live library's rows. */
const pileBy = (label, key) => (key ? T.table(rows, {...opts, groupBy: key}).groupPiles.find((p) => p.label === label) : t.statusPiles.find((p) => p.label === label));
const ownedBench = rows.filter((r) => r.kind === "lot" && r.source === "owned" && !r.allocation && r.location?.kind !== "deck");
const boxed = rows.filter((r) => r.kind === "lot" && r.source === "owned" && r.location?.kind === "deck");
const needs = rows.filter((r) => r.kind === "need"), ordered = rows.filter((r) => r.kind === "lot" && r.source === "ordered");
const planned = rows.filter((r) => r.kind === "entry" || r.kind === "option");
ok(ownedBench.length > 5 && boxed.length > 5 && needs.length > 5 && ordered.length > 0 && planned.length > 0, "the live library has every kind of row the contract reads");
eq(T.accepts(pileBy("Physical deck"), ownedBench.slice(0, 2)).action, "place", "an owned bench copy goes into a physical deck");
eq(T.accepts(pileBy("Physical deck"), needs.slice(0, 1)).ok, false, "a To buy requirement does not go straight into a box");
eq(T.accepts(t.bench, boxed.slice(0, 1)), {ok: true, action: "bench", label: "Move physically to the Bench", why: "Takes a copy out of its physical deck; asks first."}, "a boxed copy to the Bench asks");
eq(T.accepts(t.bench, needs.slice(0, 2)).action, "source:owned", "a ghost on the Bench becomes an owned copy");
eq(T.accepts(t.bench, ordered.slice(0, 1)).action, "source:owned");
eq(T.accepts(pileBy("Ordered"), needs.slice(0, 1)).action, "source:ordered", "a ghost on Ordered becomes an ordered copy");
ok(/asks first/.test(T.accepts(pileBy("Ordered"), boxed.slice(0, 1)).why), "an owned boxed copy marked Ordered says it loses its place");
eq(T.accepts(pileBy("Watched"), needs.slice(0, 1)).ok, false, "a requirement cannot be Watched");
eq(T.accepts(pileBy("To buy"), ownedBench.slice(0, 1)).ok, false, "an unreserved copy has nothing to release");
eq(T.accepts(pileBy("To buy"), boxed.filter((r) => r.allocation).slice(0, 1)).action, "release", "a reserved copy releases to To buy");
eq(T.accepts(pileBy("Reserved"), ownedBench.slice(0, 1)).action, "reserve");
eq(T.accepts(pileBy("Substitute"), ownedBench.slice(0, 1)).action, "standin");
eq(T.accepts(pileBy("Suggestion"), ownedBench.slice(0, 1)).ok, false, "a plan pile is not a target");
for (const label of ["Physical deck", "Ordered", "Bench"]) eq(T.accepts(label === "Bench" ? t.bench : pileBy(label), planned.slice(0, 1)).ok, false, `${label}: a planned card is not a copy`);
eq(T.accepts(pileBy("Creature", "type"), ownedBench.slice(0, 1)).ok, false, "a type pile refuses"); ok(/reading of the card/.test(T.accepts(pileBy("Creature", "type"), ownedBench.slice(0, 1)).why));
const groupPile = T.table(rows, {...opts, groupBy: "groups"}).groupPiles.find((p) => !/^No /.test(p.label) && !p.folded);
if (groupPile) { eq(T.accepts(groupPile, ownedBench.slice(0, 1)).action, "group"); eq(T.accepts(groupPile, needs.slice(0, 1)).ok, false, "a plan is not filed in a group"); }
const deckPile = T.table(rows, {...opts, groupBy: "deck"}).groupPiles.find((p) => !/^No /.test(p.label));
eq(T.accepts(deckPile, ownedBench.slice(0, 1)).action, "reserve"); eq(T.accepts(deckPile, ownedBench.slice(0, 1)).label, `Reserve for ${deckPile.label}`);
eq(T.accepts(pileBy("Physical deck"), []).ok, false); eq(T.accepts(null, ownedBench).ok, false);
ok([t.bench, ...t.statusPiles].every((p) => { const a = T.accepts(p, ownedBench.slice(0, 1)); return typeof a.ok === "boolean" && (a.ok ? a.action && a.label : a.why); }), "every pile answers with an action or a reason");
/* TB4: the status pile order as a preference, and a pile on paper. */
const byCount = T.table(rows, {...opts, groupBy: "type", statusSort: "count"});
ok(byCount.statusPiles.every((p, i, a) => i === 0 || a[i - 1].count >= p.count), "fullest first"); eq(byCount.statusSort, "count");
eq(byCount.statusPiles.map((p) => p.label).sort(), t.statusPiles.map((p) => p.label).sort(), "the same piles, reordered"); eq(t.statusSort, "workflow");
eq(T.table(rows, {...opts, groupBy: "type", statusSort: "nonsense"}).statusPiles.map((p) => p.label), t.statusPiles.map((p) => p.label), "an unknown order is the workflow order");
const sheet = T.printSheet(t.statusPiles.find((p) => p.label === "Physical deck"), {describe: (r) => ({status: r.status, price: "$1.00", deck: "D"}), now: new Date("2026-09-14T12:00:00Z"), library: "Test <lib>"});
ok(/<h1>Physical deck<\/h1>/.test(sheet) && /2026-09-14/.test(sheet) && /Test &lt;lib&gt;/.test(sheet), "the sheet names the pile, the day and the library, escaped");
eq((sheet.match(/<tr><td>\d+<\/td>/g) || []).length, t.statusPiles.find((p) => p.label === "Physical deck").rows.length, "one row per card on the pile, the whole pile and not a page");
ok(/<td>Physical deck<\/td><td>\$1\.00<\/td><td>D<\/td>/.test(sheet), "status, price and deck come from the caller");
ok(/<td>1<\/td><td>/.test(sheet) && / cards · [\d,]+ copies · Test/.test(sheet), "numbered, with the count and the copies");
eq(T.printSheet({kind: "status", label: "Watched", rows: []}).includes("0 cards · 0 copies"), true, "an empty pile prints an empty sheet");
/* THE SHELVES (Rob, 14 September; the play-space plan §2.5): the group piles stand in columns
   down both sides of the play space, filled a column at a time and alternating sides, and the
   sides grow by the columns they need — never so many that the middle stops being a table. */
{
  const seatsOf = (n, o) => T.shelfSeats(n, o).seats.map((x) => (x ? x.side[0] + x.column + ":" + x.row : "fold"));
  /* The order: left column, right column, left column again. Four piles stand two and two. */
  eq(seatsOf(4, {width: 1400, height: 560}), ["l0:0", "l0:1", "l0:2", "r0:0"], "a column fills before the other side starts");
  eq(T.shelfSeats(8, {width: 1400, height: 560}).seats.map((x) => x.side), ["left", "left", "left", "right", "right", "right", "left", "left"], "and the third column goes back to the left");
  /* Growing by the columns they need: one column a side until the count asks for more. */
  eq(T.shelfShape(3, {width: 1400, height: 560}).columns, 1, "three piles need one column");
  eq(T.shelfShape(6, {width: 1400, height: 560}).columns, 2, "six need two, one a side");
  eq(T.shelfShape(16, {width: 1400, height: 560}).columns, 6, "sixteen need six");
  /* The width caps it: the middle never drops below the play space's own minimum. */
  for (const width of [860, 1000, 1100, 1280, 1400, 1800]) {
    const shape = T.shelfShape(24, {width, height: 620});
    ok(shape.columnsPerSide >= 1 && shape.columnsPerSide <= T.SHELF.maxColumns, `${width}px: between one and three columns a side`);
    ok(width - 2 * shape.columnsPerSide * (T.SHELF.pileW + T.SHELF.gutter) >= T.SHELF.minMiddle, `${width}px: the middle keeps ${T.SHELF.minMiddle}px`);
  }
  /* The height caps the rows, and four is the most a side stands. */
  eq(T.shelfShape(24, {width: 1400, height: 300}).perColumn, 2, "a short table stands two to a column");
  eq(T.shelfShape(24, {width: 1400, height: 2000}).perColumn, T.SHELF.maxRows, "a tall one stops at four");
  /* More piles than the shelves hold: the tail has no seat, and the caller folds it. */
  const many = T.shelfSeats(30, {width: 900, height: 560});
  eq(many.seats.filter(Boolean).length, many.shape.holds, "every seat the shelves hold is used");
  ok(many.seats.slice(many.shape.holds).every((x) => x === null), "and the tail beyond them has no seat");
  /* Pure: the same question twice is the same answer, and nothing is shared between calls. */
  eq(JSON.stringify(T.shelfSeats(7, {width: 1400})), JSON.stringify(T.shelfSeats(7, {width: 1400})), "the placement is the same twice");
  eq(T.shelfSeats(0, {width: 1400}).seats, [], "no piles, no seats");
}
M.setRecordSource(null);
console.log(`crankmagic-tabletop: ${checks} checks passed — ${t.total} copies on the table, bench ${t.bench.count}, ${t.statusPiles.length} status piles, ${T.GROUPINGS.length} groupings.`);
