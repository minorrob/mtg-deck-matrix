/* THE CARD STATUS: USE, OWNERSHIP, PLAY (docs/card-states.md; Rob, 2026-10-18, replacing the taxonomy of
 * 2026-09-26). One definition, in the model's cardState: what the copy is for (Final, Substitute, Reserved,
 * Upgrade; Bench, Sell, Trade, Unowned), where it is in the buying cycle (Watch, To buy, Ordered, Own, To sell,
 * Trade), and the system's reading of play (playable, loading, to load). This suite pins:
 *
 *   1. every branch of the definition, on records built for the purpose, with the pill word and the note;
 *   2. the rules that make it one definition, on every one of Rob's records -- an ownership the use admits,
 *      a deck exactly for the four deck uses, in the box exactly for Final and Substitute, a word from the
 *      vocabulary and nowhere else;
 *   3. Rob's library as committed, counted;
 *   4. his worked example: 90 Final, 10 Substitute, 10 Reserved, 4 Upgrade -- a Deck total of 100 and a
 *      Group total of 114;
 *   5. a deck's totals agree with the deck tiles' readiness, deck by deck;
 *   6. a copy in one box claimed by another deck: a Substitute where it sits, the claiming deck's Reserved;
 *   7. the workbook's State column and the Table view's piles speak the same words.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require = createRequire(import.meta.url), M = require("../collection-model.js");

let checks = 0;
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const ok = (c, msg) => { checks++; assert.ok(c, msg); };

/* 1. The branches. A small library: d1's list is cards A to F with two options (an Upgrade for A, and a committed
   one for B); d2's list is G; d1's group is g1. */
const slot = (id, cardId, x = {}) => ({id, cardId, quantity: 1, purpose: "main", committed: true, replaces: "", ...x});
const lib = {
  decks: [
    {id: "d1", name: "D1", status: "final", groupId: "g1", slots: [slot("a", "A"), slot("b", "B"), slot("c", "C"), slot("d", "D"), slot("e", "E"), slot("f", "F"),
      slot("u1", "U", {purpose: "upgrade", committed: false, replaces: "a"}), slot("u2", "V", {purpose: "upgrade", committed: true, replaces: "b"})]},
    {id: "d2", name: "D2", status: "final", groupId: "g2", slots: [slot("g", "G")]}],
  lots: [],
};
const lot = (x) => ({kind: "lot", quantity: 1, source: "owned", location: {kind: "bench", box: ""}, allocation: null, offer: "none", groupIds: [], ...x});
const inBox = (deckId) => ({kind: "deck", deckId, box: ""});
const L = {
  final: lot({cardId: "A", location: inBox("d1"), allocation: {deckId: "d1", slotId: "a"}}),
  sub: lot({cardId: "X", location: inBox("d1"), standInFor: "b"}),
  loading: lot({cardId: "C", allocation: {deckId: "d1", slotId: "c"}}),
  claimed: lot({cardId: "D", location: inBox("d2"), allocation: {deckId: "d1", slotId: "d"}}),
  ordered: lot({cardId: "F", source: "ordered", location: null, allocation: {deckId: "d1", slotId: "f"}}),
  bench: lot({cardId: "H"}),
  trade: lot({cardId: "H", offer: "available"}),
  sell: lot({cardId: "H", offer: "available", offerKind: "sell"}),
  held: lot({cardId: "H", offer: "held", offerKind: "sell"}),
  watch: lot({cardId: "W", source: "watching", location: null}),
  orderedFree: lot({cardId: "W", source: "ordered", location: null}),
  considered: lot({cardId: "K", groupIds: ["g1"]}),
  free: lot({cardId: "U"}),
};
lib.lots = Object.values(L);
const ctx = M.seats(lib);
const pick = (st) => Object.fromEntries(Object.entries(st).filter(([, v]) => v !== "" && v !== false));
const names = {A: "Alpha", B: "Bravo", X: "Xray", C: "Charlie", D: "Delta", F: "Foxtrot"}, name = (id) => names[id] || id, deckName = (id) => id.toUpperCase();
const table = [
  ["the list's card in its box", L.final, {use: "final", ownership: "own", play: "playable", deckId: "d1", slotId: "a", inBox: true}, "Final", ""],
  ["a substitute holding B's seat", L.sub, {use: "substitute", ownership: "own", play: "playable", deckId: "d1", holds: "B", inBox: true}, "Substitute", "holds the seat for Bravo"],
  ["the deck's own card, owned, not put in yet", L.loading, {use: "final", ownership: "own", play: "loading", deckId: "d1", slotId: "c"}, "Loading", "put it in the box"],
  ["a copy in D2's box claimed by D1, read from anywhere", L.claimed, {use: "substitute", ownership: "own", play: "playable", deckId: "d2", claimedBy: "d1", inBox: true}, "Substitute", "reserved for D1"],
  ["an ordered copy for a seat", L.ordered, {use: "reserved", ownership: "ordered", play: "toload", deckId: "d1", slotId: "f"}, "Reserved", "Ordered · empty seat"],
  ["a seat to buy, a substitute in it", {kind: "need", deckId: "d1", slotId: "b", purpose: "main"}, {use: "reserved", ownership: "buy", play: "toload", deckId: "d1", slotId: "b", replaces: "X"}, "Reserved", "To buy · replaces Xray"],
  ["a seat to buy, nothing in it", {kind: "need", deckId: "d1", slotId: "e", purpose: "main"}, {use: "reserved", ownership: "buy", play: "toload", deckId: "d1", slotId: "e"}, "Reserved", "To buy · empty seat"],
  ["a committed upgrade option, to buy", {kind: "need", deckId: "d1", slotId: "u2", purpose: "upgrade"}, {use: "upgrade", ownership: "buy", deckId: "d1", slotId: "u2", replaces: "B"}, "Upgrade", "To buy · would replace Bravo"],
  ["an upgrade option, a free copy owned", {kind: "option", deckId: "d1", slotId: "u1", cardId: "U"}, {use: "upgrade", ownership: "own", deckId: "d1", slotId: "u1", replaces: "A"}, "Upgrade", "Own · would replace Alpha"],
  ["an upgrade option, none owned", {kind: "option", deckId: "d1", slotId: "u1", cardId: "Z"}, {use: "upgrade", ownership: "watch", deckId: "d1", slotId: "u1", replaces: "A"}, "Upgrade", "Watch · would replace Alpha"],
  ["a candidate filed in the deck's group", {kind: "entry", groupId: "g1"}, {use: "upgrade", ownership: "watch", deckId: "d1"}, "Upgrade", "Watch · choose what it replaces"],
  ["an owned Bench copy filed in the deck's group", L.considered, {use: "upgrade", ownership: "own", deckId: "d1"}, "Upgrade", "Own · choose what it replaces"],
  ["the To Buy list", {kind: "entry", groupId: M.WANT_LIST}, {use: "unowned", ownership: "buy"}, "To buy", ""],
  ["a planned entry in another group", {kind: "entry", groupId: "group:lists"}, {use: "unowned", ownership: "watch"}, "Watch", ""],
  ["a watched copy", L.watch, {use: "unowned", ownership: "watch"}, "Watch", ""],
  ["an ordered copy for no deck", L.orderedFree, {use: "unowned", ownership: "ordered"}, "Ordered", ""],
  ["a Bench copy", L.bench, {use: "bench", ownership: "own"}, "Bench", ""],
  ["offered, not said which (as before October 18)", L.trade, {use: "trade", ownership: "trade"}, "Trade", ""],
  ["offered for sale", L.sell, {use: "sell", ownership: "sell"}, "Sell", ""],
  ["held for a pending sale", L.held, {use: "sell", ownership: "sell"}, "Sell", ""],
];
for (const [what, rec, want, label, note] of table) {
  const st = M.cardState(rec, ctx);
  eq(pick(st), want, `${what}: ${JSON.stringify(want)}`);
  eq(M.stateLabel(st), label, `${what} wears "${label}"`);
  eq(M.stateNote(st, name, deckName), note, `${what} says "${note}" beside it`);
}
assert.throws(() => M.cardState({kind: "fold"}), /not fold/); checks++;
eq(pick(M.cardState(L.claimed, ctx, "d1")), {use: "reserved", ownership: "own", play: "toload", deckId: "d1", slotId: "d", from: "d2"}, "read from D1, the copy in D2's box is D1's Reserved card, in D2");
eq(M.stateNote(M.cardState(L.claimed, ctx, "d1"), name, deckName), "in D2 · empty seat", "and says where it is");
eq(pick(M.cardState(L.claimed, ctx, "d2")), {use: "substitute", ownership: "own", play: "playable", deckId: "d2", claimedBy: "d1", inBox: true}, "read from D2 it is D2's substitute");
eq(M.USES.map((x) => x.label), ["Final", "Substitute", "Reserved", "Upgrade", "Bench", "Sell", "Trade", "Unowned"], "the uses");
eq(M.USES.filter((x) => x.inDeck).map((x) => x.id), ["final", "substitute"], "only Final and Substitute put a card in the deck");
eq(M.OWNERSHIP.map((x) => x.label), ["Watch", "To buy", "Ordered", "Own", "To sell", "Trade"], "the ownership statuses, with no Canceled");
eq(M.PLAY.map((x) => x.label), ["Playable", "Loading", "To load"], "the play statuses");
eq(M.USE_OWNERSHIP.reserved, ["buy", "ordered", "own"], "Reserved is to buy, ordered, or owned in another deck's box -- never only watched");
eq(M.USE_OWNERSHIP.upgrade, ["watch", "buy", "ordered", "own"], "an Upgrade may be anywhere in the buying cycle");

/* 2 and 3. Rob's library as committed (rebuilt from "MtG - Master - 9.30", 2026-09-30). */
const live = M.migrate(JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8")).payload.state);
const records = M.records(live), read = M.stateReader(live), labels = new Set(M.STATE_LABELS);
const DECK_USES = new Set(["final", "substitute", "reserved", "upgrade"]);
const bad = [];
for (const r of records) {
  const st = read(r);
  const why = !M.USES.some((x) => x.id === st.use) ? "use" : !M.USE_OWNERSHIP[st.use].includes(st.ownership) ? `ownership ${st.ownership} with ${st.use}`
    : DECK_USES.has(st.use) !== !!st.deckId ? "a deck exactly for the deck uses" : st.inBox !== (st.use === "final" && st.play === "playable" || st.use === "substitute") ? "in the box exactly for Final and Substitute"
    : (st.use === "upgrade" || !st.deckId) !== !st.play ? "play only for a deck's card" : !labels.has(M.stateLabel(st)) ? "label" : "";
  if (why) bad.push([why, r.kind, r.recordId]);
}
eq(bad.slice(0, 5), [], `every one of Rob's ${records.length} records keeps the rules`);
const copies = (f) => records.filter((r) => f(read(r), r)).reduce((n, r) => n + (r.quantity || 1), 0);
eq(copies((s) => s.use === "final" && s.inBox), 577, "577 Final, in their deck's box");
eq(copies((s) => s.use === "final" && s.play === "loading"), 9, "9 Loading: owned, the deck's own card, waiting on the Bench (what Ready to add lists)");
eq(copies((s) => s.use === "substitute"), 123, "123 Substitutes");
eq(copies((s) => s.use === "bench"), 888, "888 on the Bench");
eq(copies((s) => s.use === "reserved"), 107, "107 Reserved, every one to buy");
eq(copies((s) => s.use === "reserved" && !!s.replaces), 106, "106 of them replace the substitute holding their seat");
eq(copies((s) => s.use === "upgrade"), 14, "14 Upgrades: the 13 candidates in D4's and D6's groups and one owned copy filed in D4's");
eq(copies((s) => s.use === "upgrade" && !s.replaces), 14, "none of them names the card it would replace yet: each asks");
eq(copies((s) => s.ownership === "own"), 1598, "every owned copy counted once: 577 + 9 + 123 + 888 + 1 = 1,598");
eq(copies((s) => s.ownership === "ordered"), 0, "nothing ordered");

/* 4. Rob's example (2026-10-18): a hundred with 90 of the list in the box, 10 substitutes each holding a seat whose
   card is to buy, and 4 cards watched as upgrades, each naming the card it would replace. */
{
  const s = M.empty();
  for (let i = 0; i < 114; i++) s.cards["card:x" + i] = {id: "card:x" + i, name: "Card " + i, typeLine: "Creature", manaCost: "{1}", manaValue: 1, colorIdentity: [], oracleText: "", mechanics: [], keywords: []};
  const slots = [];
  for (let i = 0; i < 100; i++) slots.push(slot("s" + i, "card:x" + i));
  for (let i = 0; i < 4; i++) slots.push(slot("u" + i, "card:x" + (110 + i), {purpose: "upgrade", committed: false, replaces: "s" + i}));
  const d = {id: "deck:ex", name: "D1 Example", status: "final", archived: false, commanders: ["card:x0"], slots, groupId: null};
  s.decks.push(d);
  for (let i = 0; i < 90; i++) s.lots.push({...lot({cardId: "card:x" + i, location: inBox(d.id), allocation: {deckId: d.id, slotId: "s" + i}}), id: "lot:" + i, printing: {}});
  for (let i = 0; i < 10; i++) s.lots.push({...lot({cardId: "card:x" + (100 + i), location: inBox(d.id), standInFor: "s" + (90 + i)}), id: "lot:sub" + i, printing: {}});
  const x = M.deckStatus(s, d);
  eq([x.final, x.substitute, x.reserved.total, x.upgrade], [90, 10, 10, 4], "90 Final, 10 Substitute, 10 Reserved, 4 Upgrade");
  eq([x.deckTotal, x.groupTotal, x.play, x.complete], [100, 114, "playable", false], "a Deck total of 100 (only Final and Substitute), a Group total of 114, Playable, not complete");
  ok(x.rows.filter((y) => y.st.use === "reserved").every((y) => y.st.replaces && y.st.ownership === "buy"), "each Reserved card is to buy and names the substitute it replaces");
  ok(x.rows.filter((y) => y.st.use === "upgrade").every((y) => y.st.replaces), "each Upgrade names the card it would replace");
  eq(x.rows.filter((y) => y.st.use === "final").every((y) => y.st.inBox), true, "and the cards an Upgrade names stay Final: an Upgrade changes nothing in the box");
}

/* 5. A deck's totals and the deck tiles' readiness agree, deck by deck. */
const fromOther = {};
for (const d of live.decks.filter((x) => !x.archived)) {
  const x = M.deckStatus(live, d, records), rd = M.readiness(live, d);
  eq(x.deckTotal, rd.sleeved, `${d.name}: the Deck total is what readiness counts in the box`);
  eq(x.play === "playable", rd.playable, `${d.name}: Playable exactly when readiness says so`);
  eq(x.groupTotal, x.rows.reduce((n, y) => n + (y.r.quantity || 1), 0), `${d.name}: the Group total is every record its view lists`);
  eq(x.final + x.loading + x.reserved.total, x.list, `${d.name}: the list is Final + Loading + Reserved`);
  fromOther[d.id.slice(-2)] = x.reserved.from;
}
eq(fromOther, {D1: 1, D2: 1, D3: 0, D4: 0, D5: 0, D6: 0, D7: 5}, "7 copies sit in one deck's box and are claimed by another: D7's five are in D2's and D4's");
eq(M.deckStatus(live, live.decks.find((d) => d.id === "deck:live:D7"), records).reserved.empty, 1, "D7 has one empty seat (Peppersmoke: the 9.30 sheet names no substitute for it)");

/* 6. Read unscoped, the seven claimed copies are Substitutes where they sit, each saying which deck claims it. */
const claimed = records.filter((r) => r.kind === "lot" && r.source === "owned" && r.allocation && r.location?.kind === "deck" && r.location.deckId !== r.allocation.deckId);
eq(claimed.length, 7, "seven claimed copies");
ok(claimed.every((r) => { const st = read(r); return st.use === "substitute" && st.deckId === r.location.deckId && st.claimedBy === r.allocation.deckId; }), "each a Substitute in the box it sits in, claimed by the other deck");
ok(claimed.every((r) => { const st = M.stateReader(live, r.allocation.deckId)(r); return st.use === "reserved" && st.from === r.location.deckId && st.deckId === r.allocation.deckId; }), "and, read from the deck that claims it, that deck's Reserved card in the other box");

/* 7. The workbook's State column and the Table view's piles. */
{
  const E = require("../collection-exchange.js"), book = E.workbook(live), sheet = book.sheets.find((x) => x.name === "Library");
  ok(sheet.columns.some((c) => c.key === "state" && c.label === "State"), "the Library sheet has a State column");
  const q = (f) => sheet.rows.filter(f).reduce((n, r) => n + r.quantity, 0);
  eq([q((r) => r.state === "Final"), q((r) => r.state === "Loading"), q((r) => r.state === "Substitute"), q((r) => r.state === "Bench"), q((r) => r.state === "Upgrade · Own")], [577, 9, 123, 888, 1], "it counts 577 Final, 9 Loading, 123 Substitute, 888 Bench and 1 Upgrade, as the Library does");
  ok(["Allocations", "Acquisition queue"].every((n) => book.sheets.find((x) => x.name === n).columns.some((c) => c.key === "state")), "Allocations and the Acquisition queue carry it too");
  const T = require("../crankmagic-tabletop.js"), pile = (label) => ({kind: "status", label});
  const benchCopy = {kind: "lot", source: "owned", location: {kind: "bench"}, allocation: null, quantity: 1};
  const reserved = {kind: "lot", source: "owned", location: {kind: "bench"}, allocation: {deckId: "d1", slotId: "s"}, quantity: 1};
  const watched = {kind: "lot", source: "watching", location: null, allocation: null, quantity: 1};
  eq(T.accepts(pile("Final"), [benchCopy]).action, "place", "a Bench copy dropped on Final goes into a deck's box");
  eq(T.accepts(pile("Loading"), [benchCopy]).action, "reserve", "dropped on Loading it is claimed for a deck's seat, to be put in");
  eq(T.accepts(pile("Watch"), [benchCopy]).action, "source:watching", "dropped on Watch it becomes a watched card");
  eq(T.accepts(pile("To buy"), [reserved]).action, "release", "a claimed copy dropped on To buy is released, so its deck's seat is to buy again");
  eq(T.accepts(pile("To buy"), [watched]).action, "wanted:plan", "a watched copy dropped on To buy joins the To Buy list");
  eq(T.accepts(pile("Upgrade"), [benchCopy]).ok, false, "Upgrade is a use, not a place: nothing is dropped on it");
  const places = new Set(["Final", "Loading", "Substitute", "Bench", "Ordered", "To buy", "Watch"]);
  ok(records.every((r) => places.has(M.placeLabel(read(r)))), "every record sits on one of the Table view's seven piles");
}
/* 8. Rob's rules for the two ways a card replaces another (2026-10-18), through the model's own commands: a Reserved
   card turns the card it replaces into a Substitute holding its seat; an Upgrade names the card it would replace and
   changes nothing until it is reserved; and an offer is Sell or Trade. */
{
  let s = M.empty(), n = 0;
  const run = (type, a) => { s = M.apply(s, {type, id: "r" + (++n), at: "2026-10-18T00:00:00Z", confirmed: true, ...a}).state; };
  const card = (id, name) => ({id, name, typeLine: "Creature", manaCost: "{1}", manaValue: 1, colorIdentity: [], oracleText: "", mechanics: [], keywords: [], verified: true, legalities: {commander: "legal"}});
  run("createDeck", {deckId: "d1", name: "D1 Rules", slots: [{cardId: "Y", quantity: 1}, {cardId: "Q", quantity: 1}], cards: [card("Y", "Yarrow"), card("Q", "Quill")]});
  const seatOf = (cid) => s.decks[0].slots.find((r) => r.cardId === cid && r.purpose === "main").id;
  for (const cid of ["Y", "Q"]) { run("acquire", {lot: {id: "l" + cid, cardId: cid, quantity: 1}}); run("place", {lotId: "l" + cid, deckId: "d1", quantity: 1}); }
  const now = () => { const read = M.stateReader(s), recs = M.records(s); return (pred) => recs.filter(pred).map(read); };
  eq(now()((r) => r.kind === "lot").map((x) => x.use), ["final", "final"], "Yarrow and Quill are Final in D1's box");
  const ySeat = seatOf("Y");
  run("swap", {deckId: "d1", slotId: ySeat, cardId: "X", cards: [card("X", "Xenon")], substitute: true});
  eq(pick(now()((r) => r.kind === "lot" && r.cardId === "Y")[0]), {use: "substitute", ownership: "own", play: "playable", deckId: "d1", holds: "X", inBox: true}, "Reserving Xenon in place of Yarrow makes Yarrow the Substitute holding Xenon's seat");
  eq(pick(now()((r) => r.kind === "need" && r.cardId === "X")[0]), {use: "reserved", ownership: "buy", play: "toload", deckId: "d1", slotId: ySeat, replaces: "Y"}, "and Xenon is Reserved, to buy, replacing Yarrow");
  eq(M.deckStatus(s, s.decks[0]).deckTotal, 2, "the box still holds two");
  const qSeat = seatOf("Q");
  run("option", {deckId: "d1", replaces: qSeat, cards: [card("W", "Wisp")], option: {cardId: "W", quantity: 1, purpose: "upgrade"}});
  eq(pick(now()((r) => r.kind === "option")[0]), {use: "upgrade", ownership: "watch", deckId: "d1", slotId: s.decks[0].slots.find((r) => r.cardId === "W").id, replaces: "Q"}, "Wisp is an Upgrade that would replace Quill");
  eq(now()((r) => r.kind === "lot" && r.cardId === "Q")[0].use, "final", "and Quill stays Final: an Upgrade changes nothing in the box");
  run("acceptOption", {deckId: "d1", slotId: s.decks[0].slots.find((r) => r.cardId === "W").id, substitute: true});
  eq(now()((r) => r.kind === "lot" && r.cardId === "Q")[0].holds, "W", "reserving the Upgrade makes Quill the Substitute holding Wisp's seat");
  eq(pick(now()((r) => r.kind === "need" && r.cardId === "W")[0]).replaces, "Q", "and Wisp, Reserved, replaces Quill");
  run("acquire", {lot: {id: "lH", cardId: "Y", quantity: 1}});
  run("offer", {lotId: "lH", offer: "available", offerKind: "sell", quantity: 1});
  eq([now()((r) => r.recordId === "lH")[0].use, s.lots.find((l) => l.id === "lH").offerKind], ["sell", "sell"], "an offer for sale reads Sell");
  run("offer", {lotId: "lH", offer: "none", quantity: 1});
  eq([now()((r) => r.recordId === "lH")[0].use, "offerKind" in s.lots.find((l) => l.id === "lH")], ["bench", false], "taken off, it is back on the Bench and says neither");
  M.validate(s); checks++;
}
console.log(`card-states: ${checks} checks passed — use, ownership and play, one function; Rob's example 100 in the deck, 114 in the group.`);
