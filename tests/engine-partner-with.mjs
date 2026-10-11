/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PARTNER WITH [NAME] (CR 702.124j; built for Pir, Imaginative Rascal, Train C phase 2).
 *
 * Two abilities. A deck rule: two legendary cards may be one's commanders when each says "Partner with" the other
 * (room/table.mjs, from the definition's `partners`, read off the card's own words). And a triggered ability: "When this
 * permanent enters, target player may search their library for a card named [name], reveal it, put it into their hand,
 * then shuffle" (cards/index.mjs compiles the keyword to it): the target player's "may" theirs (CR 603.5), the search theirs
 * (CR 701.23), the card revealed, and their library shuffled whether or not the card is found.
 */
import {compileScript} from "../game/engine/cards/index.mjs";
import {partnered} from "../game/room/table.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {play, drive, at, choose, labels, pilotsAnswer, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-partner-with");
const twin = (name, other, more = {}) => compileScript({schema: "CrankCardScript@1", source: "hand",
  identity: {name, oracleId: name, supertypes: ["Legendary"], types: ["Creature"], subtypes: ["Human"], manaCost: "{1}{G}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
  oracleText: `Partner with ${other} (When this creature enters, target player may put ${other} into their hand from their library, then shuffle.)`,
  abilities: [{kind: "keyword", text: `Partner with ${other}`, keyword: "partner with", name: other, ...more}]});
const A = twin("Alpha, the Twin", "Beta, the Twin"), B = twin("Beta, the Twin", "Alpha, the Twin");
const FIX = {"Alpha, the Twin": {...A.definition, card: "Alpha, the Twin"}, "Beta, the Twin": {...B.definition, card: "Beta, the Twin"}};
const SEARCH = "Search", NO = "Don't search";
const library = (s, seat) => s.zones.library[seat].map((id) => s.objects[id].card);
/* Alpha cast on Rob's turn 1; its trigger aimed at `whom`. */
const entered = (libraries = {}) => play([at(0, "hand", "Alpha, the Twin"), at(0, "battlefield", "Forest", "Wastes")], [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Alpha, the Twin"}, {resolve: true}],
  {library: libraries.rob ?? ["Wastes", "Wastes", "Beta, the Twin"]}, FIX);

eq([A.problems, B.problems], [[], []], "the twins compile");
eq([A.definition.keywords, A.definition.partners], [["Partner with"], [{kind: "with", name: "Beta, the Twin"}]], "the keyword, and the deck rule read off its words");
{
  /* The deck rule (702.124j): each names the other. */
  const gamma = twin("Gamma, the Third", "Beta, the Twin");
  eq([partnered(["Alpha, the Twin", "Beta, the Twin"], [A.definition, B.definition]), partnered(["Gamma, the Third", "Beta, the Twin"], [gamma.definition, B.definition])], [true, false],
    "Alpha and Beta may be one's two commanders; Gamma, naming Beta whom Beta does not name, may not be Beta's");
}
{
  /* Enters: its trigger aimed at a player -- Rob or Maya, his to choose. */
  const s = entered();
  eq([s.awaiting?.kind, labels(s).sort()], ["trigger-targets", ["Maya", "Rob"]], "its trigger: target player, Rob or Maya");
  choose(s, "Rob");
  drive(s, (st) => Boolean(st.awaiting));
  eq([s.awaiting.player, labels(s)], [0, [SEARCH, NO]], "resolving: Rob, the target, may search");
  choose(s, SEARCH);
  eq(labels(s), ["Beta, the Twin"], "a card named Beta, the Twin -- nothing else in his library");
  const events = choose(s, "Beta, the Twin");
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null && !st.awaiting);
  eq([s.zones.hand[0].map((id) => s.objects[id].card), library(s, 0).includes("Beta, the Twin"), library(s, 0).length], [["Beta, the Twin"], false, 19],
    "found: Beta in Rob's hand, out of his library");
  eq([events.filter((e) => e.kind === "GameEventCardRevealed").map((e) => e.data.fields.card.name), events.filter((e) => e.kind === "GameEventShuffle").length],
    [["Beta, the Twin"], 1], "revealed, and his library shuffled");
}
{
  /* Aimed at Maya: hers to choose, from her library. */
  const run = runScenario({name: "partner with", setup: [at(0, "hand", "Alpha, the Twin"), at(0, "battlefield", "Forest", "Wastes")],
    library: ["Beta, the Twin"], steps: [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Alpha, the Twin"}, {resolve: true}, {choose: ["Maya"]}, {resolve: true}]}, index.definition, FIX);
  const s = run.state;
  eq([s.awaiting?.player, labels(s)], [1, [SEARCH, NO]], "Maya, the target, decides");
  choose(s, SEARCH);
  choose(s, "Beta, the Twin");
  eq([s.zones.hand[1].map((id) => s.objects[id].card), s.zones.hand[0].length], [["Beta, the Twin"], 0], "Beta from her library to her hand; Rob's untouched");
}
{
  /* "Don't search": nothing moves. A library without it: the search finds nothing (CR 701.23b). */
  const s = entered();
  choose(s, "Rob");
  drive(s, (st) => Boolean(st.awaiting));
  const before = library(s, 0);
  choose(s, NO);
  drive(s, (st) => st.stack.length === 0 && st.priorityPlayer !== null && !st.awaiting);
  eq([s.zones.hand[0].length, library(s, 0)], [0, before], "not searched: no card, the library as it was");
  const t = entered({rob: ["Wastes"]});
  choose(t, "Rob");
  drive(t, (st) => Boolean(st.awaiting));
  choose(t, SEARCH);
  eq(labels(t), [], "searched for a card the library has not: nothing to choose (CR 701.23b)");
  const none = choose(t);
  eq([t.zones.hand[0].length, none.filter((e) => e.kind === "GameEventShuffle").length], [0, 1], "nothing found, and the library still shuffled");
}
{
  /* The pilots answer the target, the "may" and the search. */
  const s = entered();
  for (const after of pilotsAnswer(s)) ok(after.stack.some((e) => e.kind === "trigger" && e.targets?.[0]?.kind === "player"), "each pilot aims the trigger at a player");
  choose(s, "Rob");
  drive(s, (st) => Boolean(st.awaiting));
  for (const after of pilotsAnswer(s)) ok(Boolean(after.awaiting) || after.stack.length === 0, "and each answers the \"may\"");
}
ok(twin("Odd", "Somebody Else", {name: "Nobody"}).problems.some((p) => p.includes("Partner with names the card")), "a name the card's words do not give is refused");
ok(twin("Odd", "Somebody", {name: undefined}).problems.some((p) => p.includes("Partner with names the card")), "and no name at all");
ok(keywordBuilt("Partner with"), "Partner with is built (engine-constructs: a deck rule, and its trigger)");

done("partner with: the two commanders that name each other, and the trigger as it enters -- its target player may search for the one it names.");
