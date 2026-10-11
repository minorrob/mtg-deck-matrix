/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* RIOT (CR 702.136; Ghor-Clan Wrecker, Train C phase 2).
 *
 * "You may have this permanent enter with an additional +1/+1 counter on it. If you don't, it gains haste" (702.136a): a
 * replacement on its own entering (cards/index.mjs, rules/replacement.mjs), however it enters -- cast, or put there by an
 * effect -- its controller asked once it is there, before anyone has priority or any trigger goes on the stack
 * (rules/entering.mjs). The counter is put on by its controller (CR 122.6a: "twice that many" sees it) and said, as an
 * entering counter is; haste is the permanent's for as long as it is that permanent (CR 400.7). Each instance works
 * separately (702.136b).
 */
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {keywordsOf, powerOf} from "../game/engine/rules/layers.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {play, drive, happen, at, idOf, compiled, choose, labels, pilotsAnswer, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-riot");
const GW = "Ghor-Clan Wrecker";
const ASK = [`${GW} enters with a +1/+1 counter`, `${GW} gains haste`];
const twice = compiled([{kind: "keyword", text: "Riot", keyword: "riot"}, {kind: "keyword", text: "Riot", keyword: "riot"}],
  {name: "Twin Rioter", types: ["Creature"], subtypes: ["Goblin"], manaCost: "{R}", colors: ["R"], power: 1, toughness: 1});
const FIX = {"Twin Rioter": {...twice.definition, card: "Twin Rioter"}};
const PAY = [{tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}];
const cast = (more = [], setup = []) => play([at(0, "hand", GW), at(0, "battlefield", "Mountain", "Wastes", "Wastes", "Wastes"), ...setup], [...PAY, {cast: GW}, {resolve: true}, ...more], {}, FIX);

{
  const s = cast();
  eq([s.awaiting?.kind, s.awaiting?.player, labels(s)], ["entering-choice", 0, ASK], "it resolved and entered: Rob is asked, a counter or haste");
  eq([s.priorityPlayer, s.stack.length], [null, 0], "nobody holds priority while he decides");
  const id = idOf(s, GW);
  eq([s.objects[id].counters["+1/+1"] ?? 0, keywordsOf(s, id).includes("Haste")], [0, false], "neither yet");
}
{
  /* The counter: said as a counter put on it, from none -- what "whenever a +1/+1 counter is put on" reads. */
  const run = runScenario({name: "riot", setup: [at(0, "hand", GW), at(0, "battlefield", "Mountain", "Wastes", "Wastes", "Wastes")],
    steps: [...PAY, {cast: GW}, {resolve: true}, {choose: [ASK[0]]}]}, index.definition, FIX);
  const id = idOf(run.state, GW);
  eq([run.state.objects[id].counters["+1/+1"], powerOf(run.state, id), keywordsOf(run.state, id).includes("Haste")], [1, 3, false], "the counter: a 3/3, without haste");
  ok(run.events.some((e) => e.kind === "GameEventCardCounters" && e.data.fields.card?.cardId === id && e.data.fields.type === "+1/+1" && e.data.fields.oldValue === 0 && e.data.fields.newValue === 1),
    "a counter event for it, from none to one");
}
{
  /* Haste: it may attack the turn it came; and gone and back, a new object, it is asked again (CR 400.7). */
  const s = cast([{choose: [ASK[1]]}]);
  const id = idOf(s, GW);
  ok(keywordsOf(s, id).includes("Haste"), "haste chosen: it has haste");
  const t = cast([{choose: [ASK[1]]}, {attack: [GW]}, {to: {turn: 1, phase: "MAIN2"}}]);
  eq(t.players[1].life, 38, "and attacks at once: Maya at 38");
  happen(s, {effect: "moveZone", targets: [id], to: "hand"}, {controller: 0, source: null});
  happen(s, {effect: "moveZone", targets: [s.zones.hand[0].find((h) => s.objects[h].card === GW)], to: "battlefield"}, {controller: 0, source: null});
  drive(s, (st) => st.awaiting?.kind === "entering-choice");
  const again = idOf(s, GW);
  ok(again !== id && !keywordsOf(s, again).includes("Haste"), "returned to the hand and put back by an effect: a new object, without the old haste");
  eq(labels(s), ASK, "and riot asks again: it applies however it enters");
}
{
  /* "Twice that many +1/+1 counters" (Branching Evolution) sees the counter its controller puts on. */
  const s = cast([{choose: [ASK[0]]}], [at(0, "battlefield", "Branching Evolution")]);
  eq(s.objects[idOf(s, GW)].counters["+1/+1"], 2, "with Branching Evolution: two counters");
}
{
  /* Two instances work separately (702.136b): two questions; a counter from one and haste from the other. */
  eq(twice.problems, [], "a creature with riot twice compiles");
  const s = play([at(0, "hand", "Twin Rioter"), at(0, "battlefield", "Mountain")], [{tap: "Mountain"}, {cast: "Twin Rioter"}, {resolve: true}], {}, FIX);
  const id = idOf(s, "Twin Rioter");
  choose(s, "Twin Rioter enters with a +1/+1 counter");
  eq(s.awaiting?.kind, "entering-choice", "the second instance asks too");
  choose(s, "Twin Rioter gains haste");
  eq([s.objects[id].counters["+1/+1"], keywordsOf(s, id).includes("Haste"), s.awaiting], [1, true, null], "one counter and haste, each instance its own");
}
{
  /* Both house pilots answer the question, and the rules take each answer. */
  const s = cast();
  const [house, random] = pilotsAnswer(s);
  for (const [who, after] of [["house", house], ["random-legal", random]]) {
    const id = idOf(after, GW);
    ok(after.awaiting === null && ((after.objects[id].counters["+1/+1"] ?? 0) === 1) !== keywordsOf(after, id).includes("Haste"), `the ${who} pilot chose one of them`);
  }
  eq(awaitingChoice(s).options.map((o) => o.riot), ["counter", "haste"], "the options say which");
}
ok(compiled([{kind: "keyword", text: "Riot", keyword: "riot"}], {types: ["Instant"], power: null, toughness: null}).problems.some((p) => p.includes("never enters the battlefield")),
  "riot on an instant is refused");
eq(index.definition(GW).keywords, ["Riot", "Menace"], `${GW}'s keywords`);
ok(keywordBuilt("Riot"), "Riot is built (keywords/timing.mjs, the enter family)");
ok(index.resolve(GW)?.playable === true, `${GW} is defined and playable`);

done("riot: a +1/+1 counter or haste, its controller's choice as it enters however it enters, each instance its own.");
