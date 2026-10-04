/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* STUN COUNTERS, AND "TAP THREE UNTAPPED CREATURES YOU CONTROL" (Rob's Priority Batch 10.3, its forty-fourth slice: Rime
 * Chill, the 190th card of Rob's list, and Kithkeeper, the 201st).
 *
 * A stun counter (CR 122.1d, script/effects/resources.mjs untapOne): a permanent with one that would become untapped has one
 * removed instead and stays tapped -- in its controller's untap step (rules/turn.mjs) and by an untap effect alike; one
 * that would not untap ("doesn't untap") keeps its counter. And a `tapCreature` cost with a `count` (rules/actions.mjs):
 * each set of that many untapped creatures its controller controls, the source among them -- the cost says no "other" --
 * summoning-sick or not (CR 302.6), at most CREW_OFFERS_MAX sets, each its own offer; the room says which it taps. The
 * room also says what a blight and a counter removal take, which it read as a sacrifice before.
 *
 * The card scenarios play the cards. This suite holds the edges.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction, costAtomBuilt} from "../game/engine/rules/actions.mjs";
import {untapOne, untap} from "../game/engine/script/effects/resources.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (subtype, color) => ({types: ["Creature"], subtypes: [subtype], manaCost: "{1}", colors: [color], power: 1, toughness: 1});
const FIX = {Bear: creature("Bear", "G"), Elf: creature("Elf", "G"), Imp: creature("Imp", "B")};
const play = (setup, steps = [], more = {}) => runScenario({name: "stun and tap three", setup, steps, ...more}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);
/* On to a step, nobody doing anything: no attackers, no blockers, triggers in the order offered. */
function goTo(s, turn, phase) {
  for (let n = 0; n < 2000 && !(s.turn === turn && s.phase === phase && s.priorityPlayer !== null && !s.awaiting); n += 1) {
    if (s.awaiting) {
      const kind = s.awaiting.kind;
      if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else if (kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else throw new Error(`goTo: asked ${kind}`);
      continue;
    }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  assert.equal(`${s.turn} ${s.phase}`, `${turn} ${phase}`, "reached the step");
}

/* ---- a stun counter ---- */
{
  const s = play([at(0, "battlefield", "Bear", "Elf")]);
  const bear = idOf(s, "Bear"), elf = idOf(s, "Elf");
  for (const id of [bear, elf]) s.objects[id].tapped = true;
  s.objects[bear].counters.stun = 2;
  const events = [];
  const untapped = [untapOne(s, bear, events), untapOne(s, bear, events), untapOne(s, bear, events)];
  eq([untapped, s.objects[bear].tapped, s.objects[bear].counters.stun], [[false, false, true], false, 0], "two stun counters: two untaps replaced, one removed each, and the third untaps it");
  eq(events.map((e) => e.kind === "GameEventCardCounters" ? `${e.data.fields.type} ${e.data.fields.oldValue}>${e.data.fields.newValue}` : `untapped ${e.data.fields.tapped === false}`),
    ["stun 2>1", "stun 1>0", "untapped true"], "each replaced untap says the counter it removed; the untap says it untapped");
  eq([untapOne(s, elf, []), s.objects[elf].tapped], [true, false], "with no stun counter, it untaps");
  s.objects[elf].tapped = true; s.objects[elf].counters.stun = 1;
  untap(s, {targets: [elf]}, {controller: 0});
  eq([s.objects[elf].tapped, s.objects[elf].counters.stun], [true, 0], "an untap effect is replaced the same way");
}
{
  const s = play([at(0, "battlefield", "Bear")]);
  const bear = idOf(s, "Bear");
  s.objects[bear].tapped = true; s.objects[bear].counters.stun = 1;
  const seen = [];
  for (const turn of [2, 3, 5]) { goTo(s, turn, "UPKEEP"); seen.push([turn, s.objects[bear].tapped, s.objects[bear].counters.stun]); }
  eq(seen, [[2, true, 1], [3, true, 0], [5, false, 0]], "the untap step: Maya's leaves Rob's Bear and its counter; Rob's next removes the counter instead; the one after untaps it");
}

/* ---- tap three untapped creatures you control ---- */
const keeper = (others, more = []) => play([at(0, "battlefield", "Kithkeeper", ...others), ...more]);
const taps = (s) => legalActions(s, 0).filter((a) => a.kind === "activate" && s.objects[a.objectId].card === "Kithkeeper");
{
  const s = keeper(["Bear", "Elf", "Imp"]);
  eq(taps(s).map((a) => a.costNames.join(" + ")), ["Kithkeeper + Bear + Elf", "Kithkeeper + Bear + Imp", "Kithkeeper + Elf + Imp", "Bear + Elf + Imp"],
    "four untapped creatures: each set of three, one offer each, the Kithkeeper itself among them");
  s.objects[idOf(s, "Imp")].tapped = true;
  eq(taps(s).map((a) => a.costNames.join(" + ")), ["Kithkeeper + Bear + Elf"], "a tapped creature taps for nothing: one set left");
  s.objects[idOf(s, "Elf")].tapped = true;
  eq(taps(s).length, 0, "two untapped creatures are not three");
  const t = keeper(["Bear", "Elf", "Imp"]);
  applyAction(t, 0, taps(t).find((a) => a.costNames.join(" + ") === "Kithkeeper + Bear + Imp"));
  eq([["Kithkeeper", "Bear", "Elf", "Imp"].map((c) => t.objects[idOf(t, c)].tapped), t.stack.length], [[true, true, false, true], 1],
    "activated: each of the three chosen tapped, the one left out untapped, and the ability on the stack");
}
{
  const s = keeper(Array.from({length: 9}, () => "Bear"));
  eq(taps(s).length, 64, "ten creatures make a hundred and twenty sets: at most sixty-four offered, as crew's are");
}
eq([costAtomBuilt({atom: "tapCreature", selector: {types: ["Creature"]}, count: 3}), costAtomBuilt({atom: "tapCreature", selector: {types: ["Creature"]}, count: 0}),
  costAtomBuilt({atom: "tapCreature", selector: {types: ["Creature"]}, count: 1.5}), costAtomBuilt({atom: "tapCreature", count: 3})],
  [true, false, false, false], "the compiler: a whole count of one or more, and a selector");

/* ---- the room says what each cost takes ---- */
{
  const s = keeper(["Bear", "Elf"]);
  const [offer] = taps(s);
  ok(offerDetails(s, 0, [offer])[0].includes("tapping Kithkeeper and Bear and Elf"), "a set tapped: \"tapping\" each of them");
  const bear = idOf(s, "Bear"), self = idOf(s, "Kithkeeper");
  const said = offerDetails(s, 0, [{kind: "activate", objectId: self, abilityId: "x", costChoice: {blight: bear}}, {kind: "activate", objectId: self, abilityId: "x", costChoice: {counter: "+1/+1"}}]);
  eq([said[0].includes("blighting Bear"), said[1].includes("removing a +1/+1 counter"), said.some((w) => w.includes("sacrificing"))], [true, true, false],
    "a blight and a counter removal are said as what they are, not as a sacrifice");
}
for (const name of ["Rime Chill", "Kithkeeper"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-stun-and-tap-three: ${checks} checks passed -- a stun counter removed instead of an untap, by the untap step or an effect; each set of three untapped creatures, the source among them, at most sixty-four; the room's words for each cost.`);
