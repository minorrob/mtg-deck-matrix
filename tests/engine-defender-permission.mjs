/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 702.3b, 506.3: defender permission is directional; attacking a planeswalker is not attacking its controller. */
import assert from "node:assert/strict";
import {table, on, ready, card, bear} from "./helpers/b4-table.mjs";
import {attackers, canAttack} from "../game/engine/rules/combat.mjs";
import {defenderLifted} from "../game/engine/rules/statics.mjs";
import {advance, PHASE_NAMES} from "../game/engine/rules/turn.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
{
  const s = table(); const wall = ready(s, on(s, {...bear, keywords: ["Defender"]}));
  eq(canAttack(s, wall, 0), false, "defender blocks attacking without permission");
  on(s, card("Felothar the Steadfast"));
  eq(canAttack(s, wall, 0), true, "Felothar lets another controlled defender attack");
  const theirs = ready(s, on(s, {...bear, keywords: ["Defender"]}, 1));
  eq(defenderLifted(s, theirs), false, "Felothar does not grant the permission to an opponent's defender");
}
{
  const s = table(); const sentry = ready(s, on(s, card("Weathered Sentinels"))); const pw = on(s, card("The Eternal Wanderer"), 1);
  eq(canAttack(s, sentry, 0), false, "no player attacked us last turn, so Sentinels cannot attack");
  s.players[1].attackedPlayers = [0]; s.players[2].attackedPlayers = [1];
  const choice = attackers.choice(s, {player: 0});
  eq(choice.options.filter((o) => o.cardId === sentry).map((o) => [o.defenderId, o.planeswalkerId ?? null]), [[1, null]], "only the player who attacked us is offered, not their planeswalker or another opponent");
  eq(defenderLifted(s, sentry, 1, pw), false, "directional permission never includes a planeswalker");
  s.players[1].lost = true;
  eq(defenderLifted(s, sentry), false, "a player who left the game cannot make the creature able to attack");
}
{
  const s = table(); const wall = ready(s, on(s, {...bear, keywords: ["Defender"]}));
  on(s, {card: "Conditional permission", types: ["Enchantment"], abilities: [{kind: "static", rule: "attacks-despite-defender", affects: {types: ["Creature"], controller: "you"}, condition: {present: {types: ["Land"], controller: "you"}, atLeast: 1}}]});
  eq(defenderLifted(s, wall), false, "a conditional defender permission waits for its condition");
  on(s, {card: "Forest", types: ["Land"]});
  eq(defenderLifted(s, wall), true, "the permission applies when its condition is met");
}
{
  const s = table(); const attacker = ready(s, on(s, bear)); const pw = on(s, card("The Eternal Wanderer"), 1);
  attackers.payAndAttack(s, {player: 0}, [{cardId: attacker, defenderId: 1, planeswalkerId: pw}], []);
  eq(s.players[0].attackedPlayers ?? [], [], "attacking a planeswalker does not record attacking its controller");
  attackers.payAndAttack(s, {player: 0}, [{cardId: attacker, defenderId: 2}], []);
  eq(s.players[0].attackedPlayers, [2], "a player attack is recorded on the attacking player");
  s.players[1].attackedPlayers = [0]; s.phase = "CLEANUP"; s.stepIndex = PHASE_NAMES.indexOf("CLEANUP"); s.awaiting = null; s.priorityPlayer = null; s.stack = []; s.pendingTriggers = [];
  advance(s);
  eq([s.activePlayer, s.players[1].attackedPlayers, s.players[0].attackedPlayers], [1, [], [2]], "a turn clears only the active player's previous attack record");
}
eq(missingFor({statics: ["CanAttackDefender"]}), [], "the catalog credits defender permission");
console.log(`engine-defender-permission: ${checks} checks passed`);
