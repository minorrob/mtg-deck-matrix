/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CR 702.19b: a trampler's controller may assign excess to the blocker, including a single blocker. */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {combatDamage} from "../game/engine/rules/combat.mjs";

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
function combat({power = 5, toughness = 2, keywords = ["Trample"], damage = 0, walker = false} = {}) {
  const state = createState({matchId: "load100-combat", seed: "combat", players: ["Rob", "Maya", "Trey", "Lee"].map((name) => ({name}))});
  state.turn = 1; state.activePlayer = 0; state.phase = "COMBAT_DAMAGE";
  const attacker = addObject(state, {card: "Smoke trampler", owner: 0, controller: 0, types: ["Creature"], power, toughness: 8, keywords}, "battlefield");
  const blocker = addObject(state, {card: "Smoke blocker", owner: 1, controller: 1, types: ["Creature"], power: 0, toughness, damage}, "battlefield");
  const planeswalker = walker ? addObject(state, {card: "Smoke planeswalker", owner: 1, controller: 1, types: ["Planeswalker"], counters: {loyalty: 4}}, "battlefield") : undefined;
  state.objects[blocker].damage = damage;
  if (walker) state.objects[planeswalker].counters.loyalty = 4;
  state.combat = {attackingPlayerId: 0, defenders: [1], attacks: [{attacker, defender: 1, blocked: true, blockers: [blocker], ...(walker ? {planeswalker} : {})}]};
  return {state, attacker, blocker, planeswalker};
}
const assign = (state, amounts) => {
  combatDamage.resolve(state, state.awaiting, amounts);
  return combatDamage.deal(state);
};

{
  const {state, blocker} = combat();
  eq(combatDamage.open(state), true, "a single blocker does not take away the attacker's choice");
  eq(state.awaiting.player, 0, "the attacking creature's controller assigns it");
  eq(combatDamage.choice(state, state.awaiting).options.map((option) => [option.cardId ?? null, option.defender, option.lethal]),
    [[blocker, false, 2], [null, true, 0]], "both the blocker and defending player are offered");
  assign(state, [5, 0]);
  eq([state.objects[blocker].damage, state.players[1].life], [5, 40], "all five may be assigned to the blocker");
}
{
  const {state, blocker} = combat();
  combatDamage.open(state);
  assert.throws(() => combatDamage.resolve(state, state.awaiting, [1, 4]), /lethal/); checks += 1;
  assign(state, [2, 3]);
  eq([state.objects[blocker].damage, state.players[1].life], [2, 37], "or lethal to the blocker and three to the defender");
}
{
  const {state, blocker} = combat({keywords: ["Trample", "Deathtouch"], toughness: 7});
  combatDamage.open(state);
  eq(combatDamage.choice(state, state.awaiting).options[0].lethal, 1, "deathtouch changes the lethal threshold");
  assign(state, [1, 4]);
  eq([state.objects[blocker].damage, state.players[1].life], [1, 36], "the chosen deathtouch division is dealt");
}
{
  const {state} = combat({power: 2, toughness: 5});
  eq(combatDamage.open(state), false, "without excess there is only one legal assignment");
}
{
  const {state, blocker} = combat({keywords: []});
  eq(combatDamage.open(state), false, "one blocker without trample has no division choice");
  combatDamage.deal(state);
  eq([state.objects[blocker].damage, state.players[1].life], [5, 40], "all damage goes to that blocker");
}
{
  const {state, planeswalker} = combat({walker: true});
  combatDamage.open(state);
  eq(combatDamage.choice(state, state.awaiting).options[1].planeswalkerId, planeswalker,
    "ordinary trample reaches the attacked planeswalker");
  assign(state, [2, 3]);
  eq([state.objects[planeswalker].counters.loyalty, state.players[1].life], [1, 40],
    "ordinary trample does not reach the planeswalker's controller");
}
{
  const {state, blocker, planeswalker} = combat({walker: true});
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== planeswalker);
  delete state.objects[planeswalker];
  eq(combatDamage.open(state), false, "a departed planeswalker is not a damage recipient");
  combatDamage.deal(state);
  eq([state.objects[blocker].damage, state.players[1].life], [5, 40], "the blocker receives all assigned damage");
}
{
  const {state, blocker} = combat({keywords: ["Trample", "Double Strike"], toughness: 8, damage: 4});
  state.phase = "COMBAT_FIRST_STRIKE_DAMAGE";
  combatDamage.open(state, "first");
  eq(combatDamage.choice(state, state.awaiting).options[0].lethal, 4, "already marked damage counts toward lethal");
  combatDamage.resolve(state, state.awaiting, [5, 0]);
  state.objects[blocker].damage = 5;
  state.phase = "COMBAT_DAMAGE";
  eq(combatDamage.open(state, "regular"), true, "a surviving blocker permits a fresh division in the regular step");
}

console.log(`engine-load100-w0-combat: ${checks} checks passed; a trampler's damage is the player's assignment.`);
