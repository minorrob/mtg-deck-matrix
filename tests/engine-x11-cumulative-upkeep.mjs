/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CUMULATIVE UPKEEP (CR 702.24; Mystic Remora, Train B X11).
 *
 * The keyword is a triggered ability (cards/index.mjs): at the beginning of your upkeep, if this permanent is on the
 * battlefield (an intervening "if", CR 603.4), put an age counter on it, then you may pay its cost for each age counter on
 * it; if you don't, sacrifice it. The cost is counted as it is asked -- every age counter on the permanent then, whichever
 * instance put it there (702.24b) -- and paid whole or not at all: generic mana as one amount, a cost with colored symbols
 * once for each counter (effects/asking.mjs, unlessPays). Its controller is asked; both pilots can answer.
 */
import {play, drive, happen, labels, choose, at, later, idOf, compiled, missing, keywordBuilt, index, checks, pilotsAnswer} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-cumulative-upkeep");
const MR = "Mystic Remora";
const ages = (s, id) => s.objects[id]?.counters?.age ?? 0;
const upkeeper = (name, costs) => ({...compiled(costs.map((cost) => ({kind: "keyword", text: `Cumulative upkeep ${cost}`, keyword: "cumulative upkeep", cost: [{atom: "mana", cost}]})),
  {name, types: ["Enchantment"], power: null, toughness: null}).definition, card: name});
const FIX = {Glacier: upkeeper("Glacier", ["{G}"]), Twice: upkeeper("Twice", ["{1}", "{1}"]), Pricey: upkeeper("Pricey", ["{2}"])};
const UPKEEP = (turn) => ({to: {turn, phase: "UPKEEP"}});

{
  /* Rob's next upkeep: one age counter, {1}; he pays, from an untapped land. */
  const s = play([later(0, "battlefield", MR, "Wastes")], [UPKEEP(3), {resolve: true}]);
  const remora = idOf(s, MR);
  eq([ages(s, remora), s.awaiting?.player, labels(s)], [1, 0, ["Pay {1}", "Don't pay"]], "an age counter, then {1} for it, asked of Rob");
  ok(pilotsAnswer(s).every((after) => after.awaiting === null), "both pilots answer it");
  choose(s, "Pay {1}");
  ok(s.zones.battlefield.includes(remora) && s.objects[idOf(s, "Wastes")].tapped === true, "paid: the Remora stays, the Wastes tapped for it");
  /* Two upkeeps later: two counters, {2}, and one land -- he can't, and it is sacrificed. */
  drive(s, (st) => st.turn === 5 && st.phase === "UPKEEP" && st.stack.length === 1);
  drive(s, (st) => st.awaiting !== null);
  eq([ages(s, remora), labels(s)], [2, ["Don't pay"]], "two age counters: {2}, and with one land he cannot pay it");
  choose(s, "Don't pay");
  ok(s.zones.graveyard[0].some((id) => s.objects[id].card === MR), "not paid: sacrificed");
}
{
  /* A colored cost, {G} for each counter: {G}{G} at two. */
  const s = play([later(0, "battlefield", "Glacier", "Forest", "Forest")], [UPKEEP(3), {resolve: true}], {}, FIX);
  choose(s, labels(s)[0]);
  drive(s, (st) => st.turn === 5 && st.phase === "UPKEEP" && st.stack.length === 1);
  drive(s, (st) => st.awaiting !== null);
  eq([ages(s, idOf(s, "Glacier")), labels(s)[0]], [2, "Pay {G}{G}"], "two age counters on a {G} cumulative upkeep: {G}{G}");
}
{
  /* A generic cost of {2}: {2} for one counter. */
  const s = play([later(0, "battlefield", "Pricey", "Wastes", "Wastes")], [UPKEEP(3), {resolve: true}], {}, FIX);
  eq(labels(s)[0], "Pay {2}", "one age counter on a {2} cumulative upkeep: {2}");
}
{
  /* Two instances: each triggers; each counts every age counter as it resolves (702.24b) -- {1}, then {2}. */
  const s = play([later(0, "battlefield", "Twice", "Wastes", "Wastes", "Wastes")], [UPKEEP(3)], {}, FIX);
  drive(s, (st) => st.awaiting !== null && st.awaiting.kind !== "order-triggers");
  eq(labels(s)[0], "Pay {1}", "the first: one age counter, {1}");
  choose(s, "Pay {1}");
  drive(s, (st) => st.awaiting !== null);
  eq([ages(s, idOf(s, "Twice")), labels(s)[0]], [2, "Pay {2}"], "the second: two age counters, {2}");
}
{
  /* Gone before it resolves (the intervening "if"): nothing is counted and nothing asked. */
  const s = play([later(0, "battlefield", MR, "Wastes")], [UPKEEP(3)]);
  const remora = idOf(s, MR);
  happen(s, {effect: "moveZone", targets: [remora], to: "hand"}, {controller: 1, source: null});
  drive(s, (st) => st.stack.length === 0 && st.phase === "UPKEEP" && st.priorityPlayer !== null);
  eq(s.awaiting, null, "returned to Rob's hand before it resolves: no question");
}
{
  /* Only its controller's upkeep: Maya's turn passes without it. */
  const s = play([later(0, "battlefield", MR)], [{to: {turn: 2, phase: "UPKEEP"}}]);
  eq([s.stack.length, ages(s, idOf(s, MR))], [0, 0], "Maya's upkeep: no trigger");
}
ok(compiled([{kind: "keyword", text: "Cumulative upkeep--Pay 1 life", keyword: "cumulative upkeep", cost: [{atom: "payLife", amount: 1}]}]).problems
  .some((p) => p.includes("a cumulative upkeep cost of mana")), "a life cost is not built yet, and refused");
ok(compiled([{kind: "keyword", text: "Cumulative upkeep {X}", keyword: "cumulative upkeep", cost: [{atom: "mana", cost: "{X}"}]}]).problems
  .some((p) => p.includes("a cumulative upkeep cost of mana")), "nor an X");
ok(compiled([{kind: "keyword", text: "Cumulative upkeep", keyword: "cumulative upkeep", cost: [{atom: "mana", cost: ""}]}]).problems
  .some((p) => p.includes("a cumulative upkeep cost of mana")), "nor a cost of no mana at all");
eq(index.definition(MR).keywords, ["Cumulative upkeep"], "the Remora's keyword");
ok(keywordBuilt("Cumulative upkeep"), "Cumulative upkeep is built (engine-constructs: its primitive unlessPays)");
eq(missing(MR), [], `${MR} needs nothing the engine lacks`);
ok(index.resolve(MR)?.playable === true, `${MR} is defined and playable`);

done("an age counter at each of its controller's upkeeps, the cost counted on every counter as asked, generic or colored, paid whole or the permanent sacrificed.");
