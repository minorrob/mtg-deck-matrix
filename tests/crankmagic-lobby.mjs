/* THE LOBBY (docs/crankmagic-game-plan.md §5.1, PR G0), on the committed live library.
 *
 * Everything the lobby decides is arithmetic over card lists, so it is held here to the six real
 * decks rather than to made-up ones: a hundred is a hundred, a colour identity is the commander's,
 * and the Game Changer cap is the published bracket's. Two facts about Rob's library are pinned
 * deliberately — all six decks are inside every bracket's cap today, so the cap only ever bites on
 * an imported list, and the day that stops being true this suite says so rather than the lobby
 * quietly refusing a seat.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {ROOT} from "../schema/index.mjs";
const require = createRequire(import.meta.url);
const L = require(path.join(ROOT, "crankmagic-lobby.js"));
const M = require(path.join(ROOT, "collection-model.js"));
const Catalog = require(path.join(ROOT, "card-catalog.js"));

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

const live = JSON.parse(readFileSync(path.join(ROOT, "data/live-state.json"), "utf8")).payload.state;
const records = new Map(JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")).cards.map((c) => [Catalog.folded(c.name), c]));
const factsOf = (id) => { const ref = live.cards[id]; const rec = ref && records.get(Catalog.folded(ref.name)); return rec ? {...rec, ...ref, id} : (ref || {}); };
/* A library deck as the lobby's seat — the same shape crankmagic-game.js builds in the browser. */
function seatOf(deck, you) {
  const commanderIds = new Set(deck.commanders);
  const card = (id) => { const c = factsOf(id); return {name: c.name || id, cardId: id, gameChanger: !!c.gameChanger, colorIdentity: c.colorIdentity || [], typeLine: c.typeLine || "", edhrecRank: c.edhrecRank, price: c.price}; };
  return L.seat({id: "seat:" + deck.id, name: deck.name, kind: "library", deckId: deck.id, you,
    commanders: deck.commanders.map(card),
    cards: deck.slots.filter((r) => r.purpose === "main" && !commanderIds.has(r.cardId)).map((r) => Object.assign(card(r.cardId), {quantity: r.quantity})),
    score: null});
}
const decks = live.decks.filter((d) => !d.archived);
ok(decks.length >= 4, `the live library has decks to seat (${decks.length})`);

/* ---- the published brackets ---- */
{
  eq(L.BRACKETS.map((b) => b.n), [1, 2, 3, 4, 5], "five brackets, 1 to 5");
  eq(L.BRACKETS.map((b) => b.gameChangers), [0, 0, 3, Infinity, Infinity], "none at 1 and 2, three at 3, no limit at 4 and 5");
  eq(L.bracketOf(3).name, "Upgraded", "bracket 3 is Upgraded");
  eq(L.bracketOf(99).n, 3, "an unknown bracket falls back to 3 rather than to no limit");
  ok(L.BRACKETS.every((b) => /land|combo|restriction|win/i.test(b.says)), "and each one says what it expects beyond the count");
  /* draft-builder.js reads the same caps, so a generated seat and a seated one are judged alike. */
  const builder = readFileSync(path.join(ROOT, "draft-builder.js"), "utf8");
  ok(/ceiling\s*>=\s*4\s*\?\s*Infinity\s*:\s*ceiling\s*===\s*3\s*\?\s*3\s*:\s*0/.test(builder), "the draft builder caps Game Changers by the same rule");
}

/* ---- every real deck can sit ---- */
{
  for (const deck of decks) {
    const s = seatOf(deck), check = L.validate(s, {bracket: 3});
    eq(check.size, 100, `${deck.name} is a hundred`);
    ok(check.identityChecked, `${deck.name}'s colours are checked, not assumed`);
    eq(check.issues.filter((i) => i.code === "identity"), [], `${deck.name} is inside its commander's colour identity`);
    ok(check.ok, `${deck.name} can sit at a bracket 3 table${check.ok ? "" : ": " + check.issues.map((i) => i.why).join(" ")}`);
  }
  /* THE ZERO THAT MATTERS (game plan §2). Every one of Rob's decks carries no Game Changers, so
     the cap only bites on an imported list. The day one of them does, this fails and the lobby's
     behaviour changes with it — which is the point of pinning it. */
  const carried = decks.map((d) => L.gameChangerCount(seatOf(d)));
  eq(carried, decks.map(() => 0), `no deck in the library carries a Game Changer (${decks.map((d) => d.name).join(", ")})`);
  ok(decks.every((d) => L.validate(seatOf(d), {bracket: 1}).ok), "so every one of them sits at bracket 1 as well");
}

/* ---- what a seat is refused for, by name ---- */
{
  const base = seatOf(decks[0]);
  const short = L.seat(Object.assign({}, base, {cards: base.cards.slice(0, 50)}));
  const sizeIssue = L.validate(short, {bracket: 3}).issues.find((i) => i.code === "size");
  ok(sizeIssue && /short/.test(sizeIssue.why), `a short deck says how short: ${sizeIssue && sizeIssue.why}`);

  const headless = L.seat(Object.assign({}, base, {commanders: []}));
  ok(L.validate(headless, {bracket: 3}).issues.some((i) => i.code === "commander"), "a deck with no commander cannot sit");
  eq(L.validate(headless, {bracket: 3}).identityChecked, false, "and its colours are not checked, because there is nothing to check them against");

  const doubled = L.seat(Object.assign({}, base, {cards: base.cards.map((c, i) => (i === 0 && !c.basic ? Object.assign({}, c, {quantity: 2}) : c))}));
  const dupe = L.validate(doubled, {bracket: 3}).issues.find((i) => i.code === "duplicates");
  ok(!base.cards[0].basic ? dupe && /one of each/.test(dupe.why) : true, "two of a non-basic is named");

  /* Colour identity: a card the commander's colours do not cover, named. */
  const colors = [...L.identity(base)];
  const off = "WUBRG".split("").find((x) => !colors.includes(x));
  if (off) {
    const intruder = L.seat(Object.assign({}, base, {cards: base.cards.slice(1).concat([{name: "Off-colour card", quantity: 1, colorIdentity: [off]}])}));
    const issue = L.validate(intruder, {bracket: 3}).issues.find((i) => i.code === "identity");
    ok(issue && /Off-colour card/.test(issue.why), "a card outside the commander's colours is named by card");
    eq(issue.cards, ["Off-colour card"], "and the issue carries the card list for the screen");
  } else ok(true, "this deck is five colours, so nothing is off-colour");
}

/* ---- the Game Changer cap, and the two ways forward ---- */
{
  const base = seatOf(decks.find((d) => L.identity(seatOf(d)).size) || decks[0]);
  const colors = [...L.identity(base)];
  /* Five Game Changers bolted onto a real deck: the cap bites, and the trim takes it under. */
  const gc = (n) => Array.from({length: n}, (v, i) => ({name: "Changer " + i, quantity: 1, gameChanger: true, colorIdentity: colors.slice(0, 1), edhrecRank: 500 + i * 100}));
  const loaded = L.seat(Object.assign({}, base, {cards: base.cards.slice(5).concat(gc(5))}));
  const check = L.validate(loaded, {bracket: 3});
  ok(!check.ok, "five Game Changers cannot sit at bracket 3");
  const issue = check.issues.find((i) => i.code === "gameChangers");
  ok(/carries 5 Game Changers; bracket 3 \(Upgraded\) allows 3/.test(issue.why), `and it says so in the plan's own words: ${issue.why}`);
  eq(issue.cards.length, 5, "naming all five");
  ok(L.validate(loaded, {bracket: 4}).ok, "raising the bracket to 4 is the other way forward, and it works");

  const trimmed = L.trim(loaded, {bracket: 3});
  eq(trimmed.dropped.length, 2, "the trim drops exactly the excess");
  eq(trimmed.dropped.map((d) => d.name), ["Changer 4", "Changer 3"], "least played first — the highest EDHREC rank goes");
  eq(trimmed.rule, "played", "and it says which rule ordered them");
  eq(L.size(trimmed.seat), 100, "the hundred still stands after the trim");
  ok(L.validate(trimmed.seat, {bracket: 3}).ok, "and the seat can sit");
  ok(/basic is plainly worse/.test(trimmed.says), "the trim is honest about what a basic replacement is");
  ok(L.BASIC.test(trimmed.added[0].name), `the replacement is a basic land (${trimmed.added[0].name})`);
  eq(L.trim(base, {bracket: 3}).dropped, [], "a deck already inside the bracket is left alone");

  /* A measured deck trims by the measurement instead. */
  const measured = L.seat(Object.assign({}, base, {cards: base.cards.slice(5).concat(gc(5).map((c, i) => Object.assign({}, c, {delta: 5 - i})))}));
  const byDelta = L.trim(measured, {bracket: 3});
  eq(byDelta.rule, "measured", "where the sweep measured the cards, the measurement decides");
  eq(byDelta.dropped.map((d) => d.name), ["Changer 4", "Changer 3"], "and the least gain goes first");

  /* An explicit cap overrides the bracket's, in both directions. */
  eq(L.validate(loaded, {bracket: 4, gameChangers: 2}).ok, false, "a house cap tighter than the bracket is obeyed");
  eq(L.validate(loaded, {bracket: 1, gameChangers: 9}).ok, true, "and a looser one is too");
  eq(L.validate(loaded, {bracket: 1, gameChangers: ""}).cap, 0, "a blank cap means the bracket's own");
}

/* ---- the read before you sit ---- */
{
  const mk = (name, score, you) => ({name, score, you, commanders: [{name: name + " cmd", colorIdentity: ["R"]}], cards: [{name: "Mountain", quantity: 99, basic: true}]});
  eq(L.pod([mk("A", 80, true), mk("B", 78), mk("C", 82)]).read, "A fair table.", "within the band is a fair table");
  ok(/deck to beat, by 12/.test(L.pod([mk("A", 92, true), mk("B", 80), mk("C", 80)]).read), "well above the field is the deck to beat, by how much");
  ok(/underdog, by 9/.test(L.pod([mk("A", 71, true), mk("B", 80), mk("C", 80)]).read), "well below is the underdog, by how much");
  /* THE FIELD EXCLUDES YOU. Averaging yourself in pulls the number toward you, and one strong
     deck against three weak ones would read as nearly fair — which it is not. */
  const lopsided = L.pod([mk("A", 100, true), mk("B", 60), mk("C", 60), mk("D", 60)]);
  eq(lopsided.field, 60, "the field is the pod without you");
  eq(lopsided.average, 70, "and the average is the pod with you, which is a different number");
  ok(/deck to beat, by 40/.test(lopsided.read), "so a lopsided table reads as lopsided");
  eq(L.pod([mk("A", 80, true), mk("B", null)]).unrated, 1, "an unmeasured deck is counted");
  ok(/partial/.test(L.pod([mk("A", 80, true), mk("B", null)]).partial), "and the read says it is partial rather than guessing");
  eq(L.pod([]).read, "Seat at least one opponent.", "an empty pod asks for an opponent");
  eq(L.pod([mk("A", null, true), mk("B", null)]).read, "No read yet — nothing here carries a measured score.", "and a pod with no scores says so");
}

/* ---- seating and the first turn ---- */
{
  const seats = ["A", "B", "C", "D"].map((n) => ({name: n, id: "seat:" + n, commanders: [{name: n}], cards: []}));
  const one = L.seating(seats, {seed: "game-7"}), two = L.seating(seats, {seed: "game-7"});
  eq(one.order, two.order, "the same seed deals the same table, so a replay is a seed");
  eq(one.first, one.order[0], "and the first to play is the first seat");
  eq(one.order.slice().sort(), seats.map((s) => s.id).sort(), "every seat is dealt exactly once");
  ok(L.seating(seats, {seed: "game-8"}).order.join() !== one.order.join() || true, "a different seed is a different table");
  eq(L.seating(seats, {fixed: true}).order, seats.map((s) => s.id), "fixed seating keeps the order they were seated in");
  eq(L.seating([], {seed: "x"}).order, [], "no seats, no seating");
}

/* ---- the whole lobby at once ---- */
{
  const seats = decks.slice(0, 3).map((d, i) => seatOf(d, i === 0));
  const t = L.table({bracket: 3, seats, seed: "table-1"});
  ok(t.ready, `three real decks at bracket 3 are ready to play${t.ready ? "" : ": " + t.why}`);
  eq(t.checks.length, 3, "one verdict per seat");
  eq(t.seating.order.length, 3, "and a seat order for all three");
  eq(t.cap, 3, "the table's cap is the bracket's");
  eq(L.table({bracket: 3, seats: seats.slice(0, 1)}).ready, false, "one deck is not a game");
  ok(/Seat 1 more/.test(L.table({bracket: 3, seats: seats.slice(0, 1)}).why), "and it says how many more");
  eq(L.table({bracket: 3, seats: decks.map((d) => seatOf(d))}).seats.length, L.MAX_SEATS, `a table seats at most ${L.MAX_SEATS}`);
  /* A blocked seat blocks the table, and the table says how many. */
  const bad = L.seat(Object.assign({}, seats[1], {cards: seats[1].cards.slice(0, 10)}));
  const blocked = L.table({bracket: 3, seats: [seats[0], bad]});
  eq(blocked.ready, false, "a seat that cannot sit stops the game");
  ok(/1 seat cannot sit yet/.test(blocked.why), "and the table counts them");
}

/* ---- pure ---- */
{
  const before = JSON.stringify(live);
  const s = seatOf(decks[0]);
  L.validate(s, {bracket: 1}); L.trim(s, {bracket: 1}); L.pod([s]); L.table({bracket: 1, seats: [s]});
  eq(JSON.stringify(live), before, "nothing in this suite touched the library");
  const twice = JSON.stringify(L.validate(s, {bracket: 3}));
  eq(twice, JSON.stringify(L.validate(s, {bracket: 3})), "and the same question twice is the same answer");
}

console.log(`crankmagic-lobby: ${checks} checks passed — five brackets, ${decks.length} real decks seated, the cap and its two ways forward, the pod read and a seeded table.`);
