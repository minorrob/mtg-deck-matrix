/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVOLVE (CR 702.100), AND A COUNTER PUT ON AS A PERMANENT ENTERS (CR 122.6; Fathom Mage, Train B X11).
 *
 * Evolve is a triggered ability (cards/index.mjs): whenever a creature you control enters, if its power is greater than
 * this creature's power and/or its toughness is greater than this creature's toughness, a +1/+1 counter on this creature --
 * an intervening "if" (CR 603.4; script/condition.mjs, `evolves`) asked as it triggers and again as it resolves, the
 * arrival as it last was should it be gone (CR 608.2h; rules/trigger.mjs), and nothing greater than a creature that is no
 * longer one (702.100c). Each instance triggers on its own (702.100d). "Whenever a +1/+1 counter is put on this creature"
 * triggers once for each counter (`each`), and counters a permanent enters with were put on it (CR 122.6; rules/entering.mjs,
 * enteredWith), so "one or more" sees them once.
 */
import {powerOf, toughnessOf} from "../game/engine/rules/layers.mjs";
import {play, drive, happen, at, idOf, compiled, missing, keywordBuilt, index, checks} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-evolve");
const MAGE = "Fathom Mage";
const ctx = {controller: 0, source: null};
const counters = (s, id) => s.objects[id]?.counters?.["+1/+1"] ?? 0;
const settled = (st) => st.stack.length === 0 && !(st.pendingTriggers ?? []).length && st.priorityPlayer !== null;
/* An evolve creature with no other ability, of a given size, and one with evolve twice. */
const evolver = (name, power, toughness, times = 1) => ({...compiled(Array.from({length: times}, () => ({kind: "keyword", text: "Evolve", keyword: "evolve"})),
  {name, power, toughness}).definition, card: name});
const FIX = {Lizard: evolver("Lizard", 2, 2), Twin: evolver("Twin", 1, 1, 2), Tall: {types: ["Creature"], subtypes: ["Wall"], manaCost: "{1}", colors: ["G"], power: 1, toughness: 3},
  Brute: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{1}", colors: ["G"], power: 3, toughness: 1},
  Nursery: {types: ["Enchantment"], manaCost: "{1}", colors: ["G"], abilities: [{id: "a0", kind: "replacement", text: "Each creature you control enters with two additional +1/+1 counters on it.",
    watches: {event: "enters", filter: {types: ["Creature"], controller: "you"}}, change: {entersWithCounters: {counter: "+1/+1", count: 2}}}]},
  Hoarder: {...compiled([{kind: "triggered", text: "Whenever one or more +1/+1 counters are put on this creature, you gain 1 life.",
    trigger: {on: "counter added", counter: "+1/+1"}, effects: [{effect: "gainLife", amount: 1}]}], {name: "Hoarder", power: 1, toughness: 1}).definition, card: "Hoarder"}};
/* `who` enters under Rob's control, put onto the battlefield by an effect from his hand, and the game goes on to the trigger. */
function arrive(setup, who) {
  const s = play(setup, [], {}, FIX);
  const card = s.zones.hand[0].find((id) => s.objects[id].card === who);
  happen(s, {effect: "moveZone", targets: [card], to: "battlefield"}, ctx);
  return s;
}

{
  /* Power greater only, toughness greater only, both: each evolves; neither, nothing. */
  for (const [who, grows, what] of [["Brute", 1, "a 3/1 against a 2/2: power greater"], ["Tall", 1, "a 1/3 against a 2/2: toughness greater"], ["Bear", 0, "a 2/2 against a 2/2: neither greater"], ["Big Bear", 1, "a 5/5: both"]]) {
    const s = arrive([at(0, "battlefield", "Lizard"), at(0, "hand", who)], who);
    drive(s, settled);
    eq(counters(s, idOf(s, "Lizard")), grows, what);
  }
  const t = arrive([at(0, "battlefield", "Twin"), at(0, "hand", "Bear")], "Bear");
  drive(t, settled);
  eq(counters(t, idOf(t, "Twin")), 1, "a 2/2 against a 1/1 with evolve twice: both trigger, the first evolves it to 2/2, and the second, asked again as it resolves, does not (702.100d, 603.4)");
}
{
  /* Asked again as it resolves: the Lizard pumped to 6/6 before its trigger resolves -- the 5/5 Big Bear is no longer greater. */
  const s = arrive([at(0, "battlefield", "Lizard"), at(0, "hand", "Big Bear")], "Big Bear");
  drive(s, (st) => st.stack.length === 1);
  happen(s, {effect: "pump", targets: [idOf(s, "Lizard")], power: 4, toughness: 4}, ctx);
  drive(s, settled);
  eq(counters(s, idOf(s, "Lizard")), 0, "the Lizard is 6/6 by the time it resolves: the Big Bear is not greater, and no counter");
}
{
  /* The arrival gone before it resolves: compared as it last was -- a 5/5, greater. */
  const s = arrive([at(0, "battlefield", "Lizard"), at(0, "hand", "Big Bear")], "Big Bear");
  drive(s, (st) => st.stack.length === 1);
  happen(s, {effect: "destroy", targets: [idOf(s, "Big Bear")]}, ctx);
  drive(s, settled);
  eq(counters(s, idOf(s, "Lizard")), 1, "the Big Bear destroyed in response: as it last was, a 5/5, and the Lizard evolves");
}
{
  /* No longer a creature: the evolving one, or the arrival (702.100c). */
  const s = arrive([at(0, "battlefield", "Lizard"), at(0, "hand", "Big Bear")], "Big Bear");
  drive(s, (st) => st.stack.length === 1);
  const lizard = idOf(s, "Lizard");
  s.effects = [...(s.effects ?? []), {id: "statue", layer: 4, affects: {ids: [lizard]}, apply: {removeTypes: ["Creature"]}, until: null, sourceController: 1}];
  drive(s, settled);
  eq(counters(s, lizard), 0, "the Lizard is no longer a creature as it resolves: nothing is greater than it, no counter");
  const t = arrive([at(0, "battlefield", "Lizard"), at(0, "hand", "Big Bear")], "Big Bear");
  drive(t, (st) => st.stack.length === 1);
  const bear = idOf(t, "Big Bear");
  t.effects = [...(t.effects ?? []), {id: "statue", layer: 4, affects: {ids: [bear]}, apply: {removeTypes: ["Creature"]}, until: null, sourceController: 1}];
  drive(t, settled);
  eq(counters(t, idOf(t, "Lizard")), 0, "the Big Bear no longer a creature as it resolves: no counter");
  const u = arrive([at(0, "battlefield", "Lizard"), at(0, "hand", "Big Bear")], "Big Bear");
  drive(u, (st) => st.stack.length === 1);
  happen(u, {effect: "destroy", targets: [idOf(u, "Lizard")]}, ctx);
  drive(u, settled);
  ok(settled(u) && u.zones.graveyard[0].some((id) => u.objects[id].card === "Lizard"), "the Lizard gone before it resolves: its trigger leaves the stack doing nothing");
}
{
  /* Fathom Mage: two counters at once, two triggers -- Rob may draw twice. */
  const s = play([at(0, "battlefield", MAGE)], [], {}, FIX);
  const mage = idOf(s, MAGE);
  happen(s, {effect: "putCounter", targets: [mage], counter: "+1/+1", count: 2}, ctx);
  drive(s, (st) => st.awaiting?.kind === "effect-choice");
  eq(s.stack.length, 2, "two +1/+1 counters put on it at once: the trigger twice");
}
{
  /* Fathom Mage entering with two counters (CR 122.6): its trigger, twice. And "one or more", once. */
  const s = play([at(0, "battlefield", "Nursery", "Forest", "Island", "Wastes", "Wastes"), at(0, "hand", MAGE)],
    [{tap: "Forest"}, {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: MAGE}, {resolve: true}], {}, FIX);
  const mage = idOf(s, MAGE);
  eq([counters(s, mage), powerOf(s, mage), toughnessOf(s, mage)], [2, 3, 3], "it entered with two +1/+1 counters");
  eq([(s.pendingTriggers ?? []).filter((p) => p.source?.cardId === mage).length, s.awaiting?.kind], [2, "order-triggers"],
    "the counters it entered with were put on it: its trigger, once for each, and Rob orders the two");
  const h = play([at(0, "battlefield", "Nursery"), at(0, "hand", "Hoarder")], [], {}, FIX);
  happen(h, {effect: "moveZone", targets: [h.zones.hand[0].find((id) => h.objects[id].card === "Hoarder")], to: "battlefield"}, ctx);
  drive(h, settled);
  eq(h.players[0].life, 41, "a creature entering with two counters, its \"one or more\" trigger: once");
}
{
  /* A creature Maya controls enters: not "a creature you control" for Rob's Lizard. */
  const s = play([at(0, "battlefield", "Lizard"), at(1, "hand", "Big Bear")], [], {}, FIX);
  happen(s, {effect: "moveZone", targets: [s.zones.hand[1].find((id) => s.objects[id].card === "Big Bear")], to: "battlefield"}, {controller: 1, source: null});
  drive(s, settled);
  eq(counters(s, idOf(s, "Lizard")), 0, "Maya's Big Bear enters under her control: Rob's Lizard does not evolve");
}
ok(compiled([{kind: "triggered", text: "x", trigger: {on: "enters", who: "any"}, condition: {evolves: false}, effects: [{effect: "draw", count: 1}]}]).problems
  .some((p) => p.includes("evolves is true")), "the condition evolves is true or absent");
eq(compiled([{kind: "triggered", text: "x", trigger: {on: "enters", who: "any"}, condition: {evolves: true}, effects: [{effect: "draw", count: 1}]}]).problems, [],
  "a script may say it: evolves is one of the condition grammar's closed keys");
eq(index.definition(MAGE).keywords, ["Evolve"], "Fathom Mage's keyword");
ok(compiled([{kind: "keyword", text: "Evolve", keyword: "evolve"}]).problems.length === 0, "evolve compiles on any creature");
ok(keywordBuilt("Evolve"), "Evolve is built (engine-constructs: its primitive putCounter)");
eq(missing(MAGE), [], `${MAGE} needs nothing the engine lacks`);
ok(index.resolve(MAGE)?.playable === true, `${MAGE} is defined and playable`);

done("evolve's comparison as it triggers and as it resolves, the arrival as it last was, each instance on its own; a trigger for each counter, counters entered with among them.");
