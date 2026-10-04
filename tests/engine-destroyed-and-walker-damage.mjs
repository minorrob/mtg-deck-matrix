/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "YOU GAIN 1 LIFE FOR EACH CREATURE DESTROYED THIS WAY" (Ob Nixilis, the Ascended), AND "WHENEVER THIS CREATURE DEALS COMBAT
 * DAMAGE TO A PLAYER OR PLANESWALKER" (Grateful Apparition) -- the live game's fourth wave, 2026-10-04.
 *
 * A board wipe remembers what it destroyed (`destroyAll` with `remember`, script/effects/zones.mjs), never what was
 * indestructible, for the effects after it ({rememberedCount: true}). A combat damage trigger
 * about a player may watch planeswalkers as well (`planeswalkers`, rules/trigger.mjs): combat damage dealt to one counts,
 * about its controller; noncombat damage to it does not, nor combat damage to a creature. Damage dealt to a permanent now
 * says whether it was combat damage, as damage dealt to a player always has.
 *
 * The card scenarios play the cards. This suite holds the edges.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (p, t, keywords = []) => ({types: ["Creature"], manaCost: "{2}", colors: ["G"], power: p, toughness: t, keywords});
const FIX = {Bear: creature(2, 2), Ogre: creature(3, 3), Wall: creature(0, 4, ["Indestructible"]), Mule: creature(1, 1), Spider: creature(1, 4, ["Reach"])};
const play = (scenario) => runScenario({name: "edges", ...scenario}, index.definition, FIX).state;
const names = (s, seat, zone) => s.zones[zone === "battlefield" ? "battlefield" : zone]
  .filter((id) => zone !== "battlefield" || s.objects[id].controller === seat).map((id) => s.objects[id].card).sort();

/* ---- what a wipe destroyed, remembered ---- */
{
  /* Maya's Bear, Wall (indestructible) and Mule attack Rob on turn 2, and stay tapped into Rob's turn 3; their Ogre stays
     home. Ob Nixilis's wipe matches the three attackers and destroys two. */
  const OB = "Ob Nixilis, the Ascended";
  const s = play({at: {turn: 2, phase: "MAIN1"}, setup: [at(0, "battlefield", "Plains", "Plains", ...Array(5).fill("Wastes")), at(0, "hand", OB),
    at(1, "battlefield", "Bear", "Ogre", "Wall", "Mule")],
  steps: [{attack: ["Bear", "Wall", "Mule"]}, {to: {turn: 3, phase: "MAIN1"}}, {tap: "Plains"}, {tap: "Plains"}, ...Array(5).fill({tap: "Wastes"}),
    {cast: OB}, {resolve: true}, {resolve: true}]});
  eq(names(s, 1, "battlefield"), ["Ogre", "Wall"], "the tapped Bear and Mule destroyed; the untapped Ogre and the indestructible Wall stay");
  eq(s.players[0].life, 37 + 2, "Rob, dealt 3 by the attack, gains 2: the two destroyed, not the Wall the wipe matched and could not destroy");
  const t = play({setup: [at(0, "battlefield", "Plains", "Plains", ...Array(5).fill("Wastes")), at(0, "hand", OB), at(1, "battlefield", "Ogre")],
    steps: [{tap: "Plains"}, {tap: "Plains"}, ...Array(5).fill({tap: "Wastes"}), {cast: OB}, {resolve: true}, {resolve: true}]});
  eq([t.players[0].life, names(t, 1, "battlefield")], [40, ["Ogre"]], "nothing tapped: nothing destroyed, no life");
}

/* ---- combat damage to a player or planeswalker ---- */
const APPARITION = "Grateful Apparition", WALKER = "Elspeth, Sun's Champion";
const triggered = (s) => s.stack.filter((e) => e.kind === "trigger").map((e) => e.text);
{
  const s = play({setup: [at(0, "battlefield", APPARITION)], steps: [{attack: [APPARITION], at: "Maya"}, {to: {turn: 1, phase: "COMBAT_DAMAGE"}}]});
  eq([s.players[1].life, triggered(s).length], [39, 1], "combat damage to Maya: it triggers");
  const t = play({setup: [at(0, "battlefield", APPARITION), at(1, "battlefield", WALKER)],
    steps: [{attack: [APPARITION], at: `${WALKER} (Maya)`}, {to: {turn: 1, phase: "COMBAT_DAMAGE"}}]});
  eq([t.players[1].life, triggered(t).length], [40, 1], "combat damage to Maya's Elspeth: it triggers, and Maya is dealt none");
  const u = play({setup: [at(0, "battlefield", APPARITION)], at: {turn: 2, phase: "MAIN1"},
    steps: [{to: {turn: 3, phase: "MAIN1"}}, {attack: [APPARITION], at: "Maya"}, {to: {turn: 3, phase: "COMBAT_DAMAGE"}}]});
  eq(triggered(u).length, 1, "and again on a later turn");
}
{
  /* Blocked by Maya's Spider (reach): combat damage to a creature is neither a player nor a planeswalker. */
  const s = play({setup: [at(0, "battlefield", APPARITION), at(1, "battlefield", "Spider")], steps: [{attack: [APPARITION], at: "Maya"}]});
  for (let n = 0; n < 50 && s.awaiting?.kind !== "declare-blockers"; n += 1) {
    if (s.priorityPlayer === null || passPriority(s, null).outcome === "step-ends") advance(s);
  }
  const choice = awaitingChoice(s);
  resolveAwaiting(s, [choice.options.find((o) => o.label.startsWith("Spider")).index]);
  for (let n = 0; n < 50 && !(s.phase === "COMBAT_DAMAGE" && s.priorityPlayer !== null); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []);
    else if (s.priorityPlayer === null || passPriority(s, null).outcome === "step-ends") advance(s);
  }
  eq([s.phase, s.players[1].life, triggered(s).length], ["COMBAT_DAMAGE", 40, 0], "blocked by the Spider: its damage is to a creature, and nothing triggers");
}
{
  /* Noncombat damage to a planeswalker by the Apparition itself: Compel Brutality's first mode has it deal damage equal to
     its power to Maya's Elspeth. The trigger asks combat damage, and this is not. */
  const s = play({setup: [at(0, "battlefield", APPARITION, "Forest", "Wastes"), at(0, "hand", "Compel Brutality"), at(1, "battlefield", WALKER)],
    steps: [{tap: "Forest"}, {tap: "Wastes"}, {cast: "Compel Brutality", modes: [0], targets: [{card: APPARITION}, {card: WALKER, seat: 1}]}, {resolve: true}]});
  eq([s.stack.length, s.objects[s.zones.battlefield.find((x) => s.objects[x].card === WALKER)].counters.loyalty], [0, 3],
    "the Apparition's 1 noncombat damage to Maya's Elspeth: 3 loyalty, and nothing triggers");
}
for (const name of ["Ob Nixilis, the Ascended", APPARITION]) eq(index.resolve(name)?.playable, true, `${name} is defined and playable`);

console.log(`engine-destroyed-and-walker-damage: ${checks} checks passed -- a wipe remembers what it destroyed, not what survived it; combat damage to a planeswalker triggers "to a player or planeswalker", noncombat damage and damage to a creature do not.`);
