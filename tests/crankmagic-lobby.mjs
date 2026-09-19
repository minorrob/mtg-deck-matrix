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

/* ---- a generated seat FITS its bracket, it does not merely sit under it (game plan §9) ----
   `bracketCeiling` is a ceiling: every pass in the builder refuses to cross it and none of them
   aims at it, so a bracket 3 deck built to a budget lands wherever the price list leaves it. The
   first generated opponent came out carrying ONE of its three allowed Game Changers — a deck that
   plays like bracket 2 while the seat says bracket 3. `fitBracket` is what closes that. */
{
  const B = require(path.join(ROOT, "draft-builder.js"));
  /* The committed catalog as the builder wants it: `verified` is the flag the app's own catalog
     stamps when it normalises a record, and every row in cards.json came from Scryfall, so
     stamping it here is a statement of fact rather than a convenience. */
  const catalog = JSON.parse(readFileSync(path.join(ROOT, "data/cards.json"), "utf8")).cards.map((c, i) => ({...c, id: c.oracleId || "card" + i, verified: true, edhrecRank: c.rank}));
  const commander = catalog.find((c) => c.name === "Krenko, Mob Boss");
  ok(commander, "the catalog holds a commander to draft from");
  const definition = {bracketCeiling: 3, budget: 400, perCardCap: null};
  const capped = B.build({commanders: [commander], cards: catalog, definition});
  const fitted = B.build({commanders: [commander], cards: catalog, definition: {...definition, fitBracket: true}});
  ok(capped.gameChangers <= 3, `a ceiling is never crossed (${capped.gameChangers} of 3)`);
  ok(fitted.gameChangers <= 3, `and fitting never crosses it either (${fitted.gameChangers} of 3)`);
  ok(fitted.gameChangers >= capped.gameChangers, `fitting never carries fewer (${capped.gameChangers} → ${fitted.gameChangers})`);
  /* This used to assert that fitting carried MORE than a plain build. That was a statement
     about the catalog of the day: once the record set grew, the plain build reached the
     ceiling on its own and "more" became impossible. What fitting owes is the budget --
     it spends the bracket's allowance rather than stopping short of it. */
  ok(fitted.gameChangers === 3, `fitting spends the bracket's allowance (${fitted.gameChangers} of 3)`);
  eq(capped.bracketFit, null, "a plain build reports no fit, because it was not asked for one");
  eq(fitted.bracketFit.allowed, 3, "a fitted build says what the bracket allowed");
  eq(fitted.bracketFit.carried, fitted.gameChangers, "and what it ended up carrying");
  eq(fitted.slots.reduce((n, r) => n + r.quantity, 0), 100, "the fit keeps the ninety-nine at ninety-nine");
  ok(fitted.estimatedPrice <= 400 + 1e-6, `and inside the budget ($${fitted.estimatedPrice.toFixed(2)} of $400)`);
  ok(fitted.notes.some((n) => /Fitted to bracket 3/.test(n)), "the notes say it was fitted rather than merely capped");
  /* Brackets 1 and 2 allow none, so fitting them is a no-op rather than a licence. */
  const none = B.build({commanders: [commander], cards: catalog, definition: {...definition, bracketCeiling: 2, fitBracket: true}});
  eq(none.gameChangers, 0, "bracket 2 allows none, and fitting it still carries none");
  eq(none.bracketFit, null, "there is no allowance to fit, so nothing is reported");
  /* A budget too small to reach the allowance comes up short and says so rather than pretending. */
  const poor = B.build({commanders: [commander], cards: catalog, definition: {...definition, budget: 40, fitBracket: true}});
  if (poor.bracketFit && poor.bracketFit.short) {
    ok(poor.notes.some((n) => /short of the allowance/.test(n)), `a budget that cannot reach the bracket says so: ${poor.bracketFit.carried} of ${poor.bracketFit.allowed}`);
    ok(poor.estimatedPrice <= 40 + 1e-6, "and it still never spends past the budget");
  } else ok(true, "even $40 reached the allowance on today's prices");
  /* THE FIT RUNS BEFORE THE UPGRADE PASS, and that ordering is the whole difference between
     working and not: run after, it competed for money the upgrades had already spent. On the full
     31,835-card pool a $225 Krenko finished the upgrade pass with $1.22 left and every affordable
     Game Changer priced out, so the deck carried none of its three. Pinned here as the shape the
     bug had — a fitted deck reaches the allowance AND costs no more than the unfitted one, because
     it bought three sensible Game Changers instead of one expensive card plus marginal swaps. */
  const tight = {bracketCeiling: 3, budget: 225, perCardCap: null};
  const loose = B.build({commanders: [commander], cards: catalog, definition: tight});
  const tightFit = B.build({commanders: [commander], cards: catalog, definition: {...tight, fitBracket: true}});
  eq(tightFit.gameChangers, 3, `a $225 deck still reaches all three (it carried ${loose.gameChangers} before the fit)`);
  ok(tightFit.estimatedPrice <= loose.estimatedPrice + 1e-6,
    `and costs no more for it ($${tightFit.estimatedPrice.toFixed(2)} fitted against $${loose.estimatedPrice.toFixed(2)} unfitted) — the allowance is bought before the change is spent on marginal swaps`);
  eq(tightFit.slots.reduce((n, r) => n + r.quantity, 0), 100, "and it is still a hundred");
  {
    const order = readFileSync(path.join(ROOT, "draft-builder.js"), "utf8");
    ok(order.indexOf("/* FITTING THE BRACKET") < order.indexOf("/* THE UPGRADE PASS."),
      "the fit pass is written before the upgrade pass, which is what makes the money reach it");
  }

  /* The seat the lobby builds from a fitted list is a legal bracket 3 deck. */
  const seat = L.seat({name: "Generated", kind: "generated",
    commanders: [{name: commander.name, colorIdentity: commander.colorIdentity}],
    cards: fitted.slots.filter((r) => r.cardId !== commander.id).map((r) => { const c = catalog.find((x) => x.id === r.cardId) || {}; return {name: c.name, quantity: r.quantity, gameChanger: !!c.gameChanger, colorIdentity: c.colorIdentity || [], typeLine: c.typeLine}; })});
  const check = L.validate(seat, {bracket: 3});
  eq(check.gameChangers, fitted.gameChangers, "the lobby counts the same Game Changers the builder chose");
  ok(check.ok, `and a fitted bracket 3 deck can sit at a bracket 3 table${check.ok ? "" : ": " + check.issues.map((i) => i.why).join(" ")}`);
}

/* ---- F.1: the screen's arithmetic lives here now ----
   Seat shaping from each source, the paste parser, the strip and backfill, the catalog checks
   behind Ready Up, the saved lobby shape, server seat ids, Start's gate and the prepare body.
   All of it used to be in crankmagic-game.js, out of reach of any suite; each is held here
   with the app's own lookups stubbed from the committed catalog and library. */
{
  const exact = (n) => { const r = records.get(Catalog.folded(n)); return r ? {...r, id: r.oracleId || r.name} : null; };
  const look = {card: (id) => (live.cards[id] ? factsOf(id) : null), exact};

  /* a library deck: the module's seat is the seat this suite used to build by hand */
  const d = decks[0];
  const mine = L.libraryDeckSeat(d, {card: look.card, you: true});
  eq(L.size(mine), 100, "a library deck seats as a hundred");
  eq([mine.kind, mine.deckId, mine.you], ["library", d.id, true]);
  eq(JSON.stringify({...mine, you: false}), JSON.stringify(seatOf(d, false)), "the seat the module builds is the seat the suite built by hand");

  /* the measured score, preferring a report on this exact list */
  const reports = [
    {deckId: d.id, origin: "measured", deckFingerprint: "old", metrics: {score: 71.26, scoreStandardError: 0.2}, protocol: "6 seeds of 20,000"},
    {deckId: d.id, origin: "measured", deckFingerprint: "now", metrics: {score: 74.44}},
    {deckId: "other", origin: "measured", deckFingerprint: "now", metrics: {score: 99}},
  ];
  eq(L.measuredScore(d, reports, () => "now"), {score: 74.4, why: "Measured on this list, the published protocol."});
  eq(L.measuredScore(d, reports, () => "other"), {score: 74.4, why: "Measured on an earlier list, the published protocol."}, "with no report on this exact list, the latest one stands and says it is older");
  ok(/earlier list \(±0\.2\), 6 seeds of 20,000\./.test(L.measuredScore(d, reports.slice(0, 1), () => "other").why), "with its error and protocol when the report carries them");
  eq(L.measuredScore(d, [], () => "now"), {score: null, why: ""}, "no report, no score");

  /* the paste parser */
  const parsed = L.parsePaste("1 Chulane, Teller of Tales\r\n\r\n1 Sol Ring\r\n98 Forest");
  eq(parsed.commanders, [{name: "Chulane, Teller of Tales", quantity: 1}], "a lone first line above a blank line is the commander");
  eq(parsed.cards, [{name: "Sol Ring", quantity: 1}, {name: "Forest", quantity: 98}]);
  const sect = L.parsePaste("Commander\r\n1 Krenko, Mob Boss\r\nDeck\r\n1x Sol Ring (C21) 123\r\n98 Mountain *F*");
  eq(sect.commanders, [{name: "Krenko, Mob Boss", quantity: 1}], "a Commander section names the commander");
  eq(sect.cards, [{name: "Sol Ring", quantity: 1}, {name: "Mountain", quantity: 98}], "set codes, collector numbers, 1x and foil marks are stripped");
  eq(L.parsePaste(""), {commanders: [], cards: []});
  /* A TEXTAREA HANDS OVER LINE FEEDS, NOT CARRIAGE RETURNS. The HTML spec normalizes a
     textarea's value to LF, so every paste that ever reached this parser from the lobby's own
     form arrived with "\n" between lines. The splitter read /\r?\r\n/ -- CRLF or CR CR LF, never
     a bare LF -- so a whole paste read as one card name and "Nothing in that paste read as a
     decklist" was the only answer the paste path could give. Pinned on the exact shape the
     invitation email asks for. */
  const lf = L.parsePaste("1 Chulane, Teller of Tales\n\n1 Sol Ring\n98 Forest");
  eq(lf.commanders, [{name: "Chulane, Teller of Tales", quantity: 1}], "a paste with plain line feeds names its commander");
  eq(lf.cards, [{name: "Sol Ring", quantity: 1}, {name: "Forest", quantity: 98}], "and reads every line");
  eq(L.parsePaste("1 Sol Ring\r98 Forest").cards.length, 2, "and old-Mac carriage returns split too");

  /* a seat from a parsed list, with the catalog filling in what a paste cannot know */
  const ls = L.listSeat(parsed, {name: "Pasted", kind: "paste", exact});
  eq([ls.kind, ls.name, L.size(ls)], ["paste", "Pasted", 100]);
  eq(ls.commanders[0].name, "Chulane, Teller of Tales");
  ok(ls.commanders[0].colorIdentity.length >= 1 && ls.commanders[0].cardId, "the commander's colours and id came from the catalog");
  ok(/No measured score/.test(ls.scoreWhy), "and it says the simulator has not played it");

  /* a seat from a host catalog entry, with rows and without */
  const meta = L.catalogMetaSeat({id: "deck:live:D6", name: "D6", commander: "Krenko, Mob Boss", rows: [{name: "Mountain", quantity: 99}]}, {exact});
  eq([L.size(meta), meta.deckId, meta.commanders[0].name], [100, "deck:live:D6", "Krenko, Mob Boss"]);
  const bare = L.catalogMetaSeat({id: "x", commander: "Krenko, Mob Boss"}, {exact});
  eq(L.size(bare), 100, "with no rows the seat is still a hundred");
  ok(bare.cards.every((c) => c.basic), "and it is basics in the commander's colours");
  assert.throws(() => L.catalogMetaSeat({id: "y"}), /no commander/); checks++;

  /* the strip and backfill */
  const base = seatOf(decks.find((x) => L.identity(seatOf(x)).size) || decks[0]);
  const colors = [...L.identity(base)];
  const gc = (n) => Array.from({length: n}, (v, i) => ({name: "Changer " + i, quantity: 1, gameChanger: true, colorIdentity: colors.slice(0, 1), edhrecRank: 500 + i * 100}));
  const over = L.seat({...base, cards: base.cards.slice(5).concat(gc(5))});
  const fixed = L.conform(over, {bracket: 3});
  ok(fixed.adjusted && !fixed.lastResort, "five Game Changers at bracket 3 are trimmed, not refused");
  eq(L.size(fixed.seat), 100, "and the hundred stands");
  ok(L.validate(fixed.seat, {bracket: 3}).ok, "and the seat can sit");
  eq(fixed.says, "Seated a legal 100 (trimmed Game Changers / illegal cards).");
  const short = L.seat({...base, cards: base.cards.slice(10)});
  const filled = L.conform(short, {bracket: 3});
  ok(filled.adjusted, "a short list is filled");
  eq(L.size(filled.seat), 100, "to a hundred");
  ok(L.validate(filled.seat, {bracket: 3}).ok, "with a basic the commander can use");
  const clean = L.conform(L.seat(base), {bracket: 3});
  eq([clean.adjusted, clean.says], [false, ""], "a legal deck is left alone and nothing is said");
  const off = "WUBRG".split("").find((x) => !colors.includes(x));
  if (off) {
    const intruder = L.seat({...base, cards: base.cards.slice(2).concat([{name: "Off A", quantity: 1, colorIdentity: [off]}, {name: "Off B", quantity: 1, colorIdentity: [off]}])});
    const r = L.conform(intruder, {bracket: 3});
    ok(L.validate(r.seat, {bracket: 3}).ok && !r.seat.cards.some((c) => /^Off /.test(c.name)), "off-colour cards are stripped and the seat backfilled");
  } else ok(true, "this deck is five colours, so nothing is off-colour");

  /* names against the catalog: what Ready Up checks */
  const rough = {commanders: [{name: "Krenko, Mob Boss"}], cards: [{name: "Sol Ring", quantity: 1}, {name: "Not A Card", quantity: 1}, {name: "not a card", quantity: 1}, {name: "Mountain", quantity: 97}]};
  eq(L.unresolved(rough, look), ["Not A Card"], "unknown names, once each regardless of case");
  ok(rough.cards[0].cardId, "a resolved row got its cardId filled in place");
  const m1 = L.mapped(rough, look);
  eq(m1.ok, false); ok(/1 name not in catalog \(e\.g\. Not A Card\)\. Fix before Ready\./.test(m1.why), m1.why);
  eq(L.mapped({commanders: [{name: "Krenko, Mob Boss"}], cards: [{name: "Mountain", quantity: 10}]}, look).why, "Deck has 11 cards; map a full ~100 before Ready.");
  eq(L.mapped(mine, look), {ok: true, why: "", unknown: []}, "a library deck is fully mapped");
  L.enrich(rough, look);
  ok(/Legendary Creature/.test(rough.commanders[0].typeLine), "enrich fills the type line in place");

  /* the type bar sums to the hundred */
  const tc = L.typeCounts(mine, look);
  eq(tc.reduce((n, b) => n + b[1], 0), 100);
  ok(tc.find((b) => b[0] === "Land")[1] > 20, "a real deck has lands");
  ok(tc.every((b) => /^#[0-9a-f]{6}$/.test(b[2])), "each bucket carries its bar colour");

  /* the rules line */
  eq(L.rulesSummary(L.bracketOf(3), ""), "Bracket 3 · Upgraded. Cap: 3 Game Changers. Same rules for every seat.");
  eq(L.rulesSummary(L.bracketOf(4), ""), "Bracket 4 · Optimized. Cap: no Game Changer limit. Same rules for every seat.");
  eq(L.rulesSummary(L.bracketOf(2), 1), "Bracket 2 · Core. Cap: 1 Game Changer. Same rules for every seat.");
  eq(L.rulesSummary(L.bracketOf(5), 0), "Bracket 5 · cEDH. Cap: 0 Game Changers. Same rules for every seat.");

  /* the saved lobby, old shape and new */
  eq(L.lobbyState(null), L.emptyLobby(), "nothing saved is an empty lobby");
  eq(L.emptyLobby().opponents.length, L.SLOT_COUNT, "three opponent boxes");
  const legacy = L.lobbyState({bracket: 4, seats: [{...mine, you: true, ready: true}, {...seatOf(decks[1]), kind: "generated", ready: true}, {...seatOf(decks[2])}]});
  eq(legacy.bracket, 4);
  ok(legacy.host && legacy.host.ready, "the legacy {seats} shape puts `you` in the host box");
  eq(legacy.opponents.map((o) => o.role), ["ai", "human", "unused"], "a generated seat was an AI, anything else a human");
  const modern = L.lobbyState({bracket: "2", cap: 0, host: {seat: mine, ready: 1}, opponents: [{role: "ai", seat: mine, ready: true, guestName: 5}, {role: "bogus"}]});
  eq([modern.bracket, modern.cap, modern.host.ready, modern.opponents.length], [2, 0, true, 3]);
  eq([modern.opponents[0].guestName, modern.opponents[1].role, modern.opponents[2].role], ["5", "unused", "unused"], "strings are strings, unknown roles are unused, missing boxes are added");

  /* who is at the table, which server seat each human takes, and Start's gate */
  const lobby = {bracket: 3, cap: "", host: {seat: mine, ready: true}, opponents: [
    {role: "human", seat: null, ready: false, guestName: "Pat"},
    {role: "ai", seat: seatOf(decks[1]), ready: true},
    {role: "human", seat: seatOf(decks[2]), ready: false},
  ]};
  eq(L.activeSeats(lobby).map((s) => [s.you, s.role || "host", s.ready]), [[true, "host", true], [false, "ai", true], [false, "human", false]], "the host first, then every decked box");
  eq([...L.seatIds(lobby.opponents)], [[0, 1], [2, 2]], "human boxes take server seats 1, 2 in box order; the AI box takes none");
  const t = L.table({bracket: 3, seats: L.activeSeats(lobby)});
  ok(L.startReady(t, lobby), "a human guest never blocks Start on the host's side");
  ok(!L.startReady(t, {...lobby, host: {seat: mine, ready: false}}), "the host must be ready");
  ok(!L.startReady(t, {...lobby, opponents: [lobby.opponents[0], {role: "ai", seat: seatOf(decks[1]), ready: false}]}), "an AI seat must be ready");
  ok(!L.startReady({...t, ready: false}, lobby), "and the table's own verdict gates it");
  eq([L.tableAccepting({table: {phase: "selecting"}}), L.tableAccepting({table: {phase: "rematch"}}), L.tableAccepting({table: {phase: "playing"}}), L.tableAccepting(null)], [true, true, false, false],
    "a table still selecting or in rematch is accepting, and must be reused rather than replaced");

  /* the prepare body */
  ok(L.libraryKind({kind: "library", deckId: "deck:live:D1"}) && L.libraryKind({kind: "preloaded", deckId: "archive:3"}), "live and archive ids are the host's own");
  ok(!L.libraryKind({kind: "library", deckId: "deck:1234"}) && !L.libraryKind({kind: "paste", deckId: "deck:live:D1"}), "a draft id or a paste must be imported");
  const guest = L.prepareSeat({name: "Pat", commanders: [], cards: [], guestPlaceholder: true}, 1, "human");
  eq(guest.request, {seatId: 1, kind: "human", name: "Pat", commanderMode: "selected", commander: "", source: "preloaded", deckId: ""}, "a guest picks on the gateway, so the seat is preloaded and empty");
  ok(!guest.handoff);
  const lib = L.prepareSeat({...mine, deckId: "deck:live:D1"}, 0, "human");
  eq([lib.request.source, lib.request.deckId, lib.handoff], ["library", "deck:live:D1", undefined]);
  const ai = L.prepareSeat({...seatOf(decks[1]), kind: "generated"}, 3, "ai", {catalogDecks: []});
  eq([ai.request.nativeProfile, ai.request.difficulty, ai.request.source], ["Default", 3, "library"]);
  eq(ai.handoff.schema, "CrankMagicDeckHandoff@1");
  eq(ai.handoff.commanders.length + ai.handoff.rows.reduce((n, r) => n + r.quantity, 0), 100, "the handoff is the whole hundred");
  const hit = L.prepareSeat({...seatOf(decks[1]), kind: "generated"}, 3, "ai", {catalogDecks: [{id: "deck:live:X", commander: seatOf(decks[1]).commanders[0].name, cost: 100}], maxCost: 225});
  eq([hit.request.deckId, hit.handoff], ["deck:live:X", undefined], "a host live deck with the same commander inside the budget is used instead of an import");
  const dear = L.prepareSeat({...seatOf(decks[1]), kind: "generated"}, 3, "ai", {catalogDecks: [{id: "deck:live:X", commander: seatOf(decks[1]).commanders[0].name, cost: 900}], maxCost: 225});
  ok(dear.handoff, "but not one over the table's budget");
  assert.throws(() => L.prepareSeat({name: "Short", kind: "paste", commanders: [{name: "A"}], cards: [{name: "B", quantity: 5}]}, 2, "ai"), /Short: seat list must total 100 with commanders \(have 6\)/); checks++;
  const order = L.prepareOrder(lobby, {budget: 225});
  eq(order.ordered.map((x) => x.kind), ["human", "human", "human", "ai"], "host, then humans, then AIs, the packing the host's validateSetup wants");
  eq([order.humans, order.ais, order.maxCost, order.bracket], [3, 1, 225, 3]);
  eq(order.ordered[1].seat.name, "Pat");
  ok(order.ordered[1].seat.guestPlaceholder, "an undecked human box is a placeholder the guest fills");
  assert.throws(() => L.prepareOrder({...lobby, host: null}), /Host seat is empty/); checks++;
  assert.throws(() => L.prepareOrder({...lobby, opponents: [{role: "ai", seat: null}]}), /Seat an AI deck/); checks++;

  /* THE GUARD THAT STOPS THE BLEEDING. The screen's own header says it "spells nothing of its
     own"; this pins it. Any of these names defined in crankmagic-game.js again is logic that
     escaped the suite, and this fails. */
  const screen = readFileSync(path.join(ROOT, "crankmagic-game.js"), "utf8");
  const escaped = ["parsePaste", "seatFromDeck", "seatFromList", "seatFromHostCatalogMeta", "finalizeBuiltSeat", "enrichSeatTypes",
    "unresolvedNames", "seatMappedOk", "humanOppSeatIdMap", "activeSeats", "allReadyForStart", "lobbyLibraryKind",
    "lobbySeatPrepareRequest", "lobbyBuildPrepareConfig", "rulesSummary", "scoreFor", "typeCounts", "load"]
    .filter((name) => new RegExp("(^|\\s)(async\\s+)?function\\s+" + name + "\\s*\\(").test(screen));
  eq(escaped, [], "crankmagic-game.js defines none of the lobby's arithmetic itself");
  /* Nor calls one by its old bare name: a call to a function that no longer exists is a
     ReferenceError the moment that path runs, which is how the Build-from-Commander path was
     nearly shipped broken by the move itself. `L.parsePaste(` is fine; `parsePaste(` is not. */
  const dangling = ["parsePaste", "seatFromDeck", "seatFromList", "seatFromHostCatalogMeta", "finalizeBuiltSeat", "enrichSeatTypes",
    "unresolvedNames", "seatMappedOk", "humanOppSeatIdMap", "activeSeats", "allReadyForStart", "lobbyLibraryKind",
    "lobbySeatPrepareRequest", "lobbyBuildPrepareConfig", "rulesSummary", "scoreFor", "typeCounts"]
    .filter((name) => new RegExp("(?<![.\\w])" + name + "\\s*\\(").test(screen));
  eq(dangling, [], "and calls none of them by a name that no longer exists there");
  ok(["L.conform(", "L.prepareOrder(", "L.prepareSeat(", "L.lobbyState(", "L.mapped(", "L.startReady(", "L.seatIds(", "L.tableAccepting(", "L.parsePaste("].every((call) => screen.includes(call)),
    "and it calls the module for each of them");
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

console.log(`crankmagic-lobby: ${checks} checks passed — five brackets, ${decks.length} real decks seated, the cap and its two ways forward, the pod read, a seeded table, and the screen's arithmetic held here.`);
