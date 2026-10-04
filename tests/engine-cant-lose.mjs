/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AND AJANI RESOLUTE'S EMBLEM -- "You get an emblem with 'Creatures you control get +2/+2'" (CR 114): an effect with no source
 * permanent and no end (effectUntil, `until: "ever"`), over the creatures its owner controls as they are, one made later
 * included; and its Pridemate, a token with a triggered ability of its own.
 *
 * "YOU CAN'T LOSE THE GAME AND YOUR OPPONENTS CAN'T WIN THE GAME. CREATURES YOU CONTROL CAN'T HAVE -1/-1 COUNTERS PUT ON THEM"
 * (Darksteel Angel; the live-game plan of 2026-10-04, lane W6).
 *
 * `cant-lose` (rules/sba.mjs, CR 104.3): no state-based action takes the game from its controller -- 0 life, ten poison,
 * an empty library drawn from -- while conceding still does (104.3a). `opponents-cant-win` (effects/resources.mjs winGame,
 * CR 104.2b): "you win the game" does nothing for an opponent of its controller. And `more-counters` with `times: 0`
 * (rules/statics.mjs): no -1/-1 counter is put on its controller's creatures.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {checkStateBasedActions, gameOver, concede} from "../game/engine/rules/sba.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const DA = "Darksteel Angel";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const play = (setup) => runScenario({name: "cant lose", setup}, index.definition, FIX).state;
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);

{
  const s = play([at(0, "battlefield", DA), at(1, "battlefield", "Bear")]);
  s.players[0].life = 0; s.players[1].life = 0;
  checkStateBasedActions(s);
  eq([s.players[0].lost ?? false, s.players[1].lost ?? false], [false, true], "both at 0 life: Rob, with the Angel, stays; Maya loses");
  const t = play([at(0, "battlefield", DA)]);
  t.players[0].poison = 10; t.players[0].drewFromEmpty = true;
  checkStateBasedActions(t);
  eq(t.players[0].lost ?? false, false, "ten poison counters, and a draw from an empty library: still in the game");
  runEffect(t, {effect: "moveZone", targets: [idOf(t, DA, 0)], to: "graveyard"}, {controller: 1, source: null});
  checkStateBasedActions(t);
  eq(t.players[0].lost, true, "the Angel gone: Rob loses at the next check");
  const u = play([at(0, "battlefield", DA)]);
  concede(u, 0);
  checkStateBasedActions(u);
  eq(u.players[0].lost, true, "conceding still ends it (CR 104.3a)");
}
{
  const s = play([at(0, "battlefield", DA)]);
  runEffect(s, {effect: "winGame", who: "you"}, {controller: 1});
  eq([s.players[1].won ?? false, gameOver(s)], [false, null], "Maya's \"you win the game\": nothing");
  runEffect(s, {effect: "winGame", who: "you"}, {controller: 0});
  eq(s.players[0].won, true, "Rob's own: Rob wins");
}
{
  const s = play([at(0, "battlefield", DA, "Bear"), at(1, "battlefield", "Bear")]);
  for (const seat of [0, 1]) runEffect(s, {effect: "putCounter", targets: [idOf(s, "Bear", seat)], counter: "-1/-1", count: 2}, {controller: 1});
  runEffect(s, {effect: "putCounter", targets: [idOf(s, "Bear", 0)], counter: "+1/+1", count: 1}, {controller: 0});
  eq([s.objects[idOf(s, "Bear", 0)].counters, s.objects[idOf(s, "Bear", 1)]?.counters["-1/-1"] ?? "dead"], [{"+1/+1": 1}, 2],
    "-1/-1 counters: none on Rob's Bear, two on Maya's; a +1/+1 counter still on Rob's");
}

{
  const {legalActions, applyAction} = await import("../game/engine/rules/actions.mjs");
  const {passPriority} = await import("../game/engine/rules/priority.mjs");
  const {addObject} = await import("../game/engine/state/index.mjs");
  const AR = "Ajani Resolute";
  const s = play([at(0, "battlefield", AR, "Bear"), at(1, "battlefield", "Bear")]);
  const ajani = idOf(s, AR, 0);
  s.objects[ajani].counters.loyalty = 10;
  applyAction(s, 0, legalActions(s, 0).find((a) => a.objectId === ajani && a.loyalty === -10));
  for (let n = 0; n < 10 && s.stack.length; n += 1) passPriority(s, null);
  const later = addObject(s, {...FIX.Bear, card: "Late Bear", owner: 0, controller: 0}, "battlefield", null);
  const {powerOf} = await import("../game/engine/rules/layers.mjs");
  eq([powerOf(s, idOf(s, "Bear", 0)), powerOf(s, later), powerOf(s, idOf(s, "Bear", 1))], [4, 4, 2], "the emblem: Rob's Bear and a creature Rob gets later +2/+2; Maya's not");
  eq(s.zones.battlefield.includes(ajani), false, "and Ajani, at 0 loyalty, gone -- the emblem stays");
  const t = play([at(0, "battlefield", AR)]);
  const a2 = idOf(t, AR, 0);
  t.objects[a2].counters.loyalty = 5;
  applyAction(t, 0, legalActions(t, 0).find((a) => a.objectId === a2 && a.loyalty === -4));
  for (let n = 0; n < 10 && t.stack.length; n += 1) passPriority(t, null);
  const mate = idOf(t, "Ajani's Pridemate", 0);
  eq([mate !== undefined, t.objects[mate].power, t.objects[mate].toughness, t.objects[mate].token], [true, 2, 2, true], "-4: Ajani's Pridemate, a 2/2 token");
  const {collectTriggers, openTriggers} = await import("../game/engine/rules/trigger.mjs");
  collectTriggers(t, runEffect(t, {effect: "gainLife", amount: 1, who: [0]}, {controller: 0}));
  openTriggers(t);
  if (t.awaiting?.kind === "order-triggers") (await import("../game/engine/rules/turn.mjs")).resolveAwaiting(t, [0, 1]);
  for (let n = 0; n < 10 && t.stack.length; n += 1) passPriority(t, null);
  eq([t.objects[mate].counters["+1/+1"] ?? 0, t.objects[a2]?.counters.loyalty ?? "gone"], [1, 2], "Rob gains 1 life: a +1/+1 counter on the Pridemate, a loyalty counter on Ajani (1 to 2)");
}

console.log(`engine-cant-lose: ${checks} checks passed -- can't lose to life, poison or an empty library, conceding aside; opponents can't win by an effect; no -1/-1 counters on its controller's creatures.`);
