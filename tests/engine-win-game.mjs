/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 68 (THE CATALOG'S ORDER): "YOU WIN THE GAME" (Forge's WinsGame, CR 104.2b), "THAT MUCH LIFE" (Forge's
 * LifeAmount), AND THE ENDURING CYCLE'S RETURN AS AN ENCHANTMENT THAT ISN'T A CREATURE.
 *
 * A player an effect says wins: the game over at once, that player the winner -- three at the table too -- and a player
 * no longer in the game wins nothing. "At the beginning of your upkeep, if you control twenty or more artifacts" asked as
 * it triggers and again as it resolves (CR 603.4); "if you have 40 or more life". "Loses that much life": the life the
 * trigger is about. An Enduring card that dies a creature returns an enchantment and nothing else, keeps what it does,
 * and dying again as an enchantment it is not a creature dying: it stays in the graveyard.
 */
import assert from "node:assert/strict";
import {moveObject} from "../game/engine/state/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {gameOver} from "../game/engine/rules/sba.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const later = (seat, zone, ...names) => ({...at(seat, zone, ...names), sick: true});
const spell = (text, effects, targets) => ({types: ["Instant"], manaCost: "{B}", colors: ["B"], spell: {id: "s", text, ...(targets ? {targets} : {}), effects}});
const FIX = {Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
  Balm: {...spell("You gain 3 life.", [{effect: "gainLife", amount: 3}]), manaCost: "{W}", colors: ["W"]},
  Slay: spell("Destroy target creature.", [{effect: "destroy", targets: {target: 0}}], [{what: "permanent", types: ["Creature"]}]),
  Unmake: spell("Destroy target enchantment.", [{effect: "destroy", targets: {target: 0}}], [{what: "permanent", types: ["Enchantment"]}])};
const play = (setup, steps, seats = 2) => runScenario({name: "win", seats, setup, steps, expect: []}, cards.definition, FIX).state;
const named = (s, name) => s.zones.battlefield.filter((id) => s.objects[id].card === name);
/* Everyone passes until the stack is empty. */
const settle = (s) => { for (let n = 0; n < 40 && s.stack.length; n += 1) if (passPriority(s).outcome === "step-ends") advance(s); };

{
  /* Three at the table: Rob wins, and that is the game -- nobody had to lose it first. */
  const s = play([], [], 3);
  runEffects(s, [{effect: "winGame"}], {controller: 0, source: null});
  eq([gameOver(s), s.players.map((p) => p.lost)], [{winner: 0, reason: "won by an effect"}, [false, false, false]], "over at once, Rob the winner");
  /* A player who has left the game wins nothing. */
  const t = play([], [], 3);
  t.players[1].lost = true;
  runEffects(t, [{effect: "winGame", who: [1]}], {controller: 0, source: null});
  eq(gameOver(t), null, "Maya has left: no winner, the game goes on");
}
{
  /* Nineteen artifacts at his upkeep: Hellkite Tyrant does not trigger; twenty: it does. */
  const upkeep = (n) => play([at(0, "battlefield", "Hellkite Tyrant"), later(0, "battlefield", ...Array(n).fill("Relic"))], [{to: {turn: 3, phase: "UPKEEP"}}]);
  eq([upkeep(19).stack.length, upkeep(20).stack.length], [0, 1], "an intervening if, asked as it triggers");
  /* And as it resolves: one of the twenty gone by then, and he does not win. */
  const s = upkeep(20);
  moveObject(s, named(s, "Relic")[0], "graveyard", 0);
  settle(s);
  eq([s.stack.length, gameOver(s)], [0, null], "nineteen when it resolves: nothing");
}
{
  /* "If you have 40 or more life"; "that much life". */
  const s = play([], []);
  const forty = () => conditionHolds(s, {lifeAtLeast: 40}, {controller: 0});
  const at40 = forty();
  s.players[0].life = 39;
  eq([at40, forty(), amountOf(s, {lifeGained: true}, {controller: 0, about: {player: 0, amount: 5}})], [true, false, 5], "40 holds, 39 does not; five gained is five");
}
{
  /* Enduring Tenacity dies a creature and returns an enchantment and nothing else -- still making Maya lose what he gains. */
  const s = play([at(0, "battlefield", "Enduring Tenacity", "Swamp", "Plains"), at(0, "hand", "Slay", "Balm")],
    [{tap: "Swamp"}, {cast: "Slay", targets: [{card: "Enduring Tenacity"}]}, {resolve: true}, {resolve: true},
     {tap: "Plains"}, {cast: "Balm"}, {resolve: true}, {choose: ["Maya"]}, {resolve: true}]);
  const back = named(s, "Enduring Tenacity")[0];
  eq([characteristicsOf(s, back).types, s.objects[back].controller, s.players[1].life], [["Enchantment"], 0, 37], "an enchantment, his, and it still drains");
  /* Destroyed again as an enchantment: not a creature dying, so it stays in the graveyard. */
  const t = play([at(0, "battlefield", "Enduring Tenacity", "Swamp", "Swamp"), at(0, "hand", "Slay", "Unmake")],
    [{tap: "Swamp"}, {cast: "Slay", targets: [{card: "Enduring Tenacity"}]}, {resolve: true}, {resolve: true},
     {tap: "Swamp"}, {cast: "Unmake", targets: [{card: "Enduring Tenacity"}]}, {resolve: true}]);
  eq([named(t, "Enduring Tenacity").length, t.stack.length], [0, 0], "in the graveyard, nothing waiting to return it");
}
{
  eq([missingFor({apis: ["WinsGame"]}), missingFor({options: ["Count"], counts: ["LifeAmount"]})], [[], []], "the catalog credits WinsGame and LifeAmount");
}

console.log(`engine-win-game: ${checks} checks passed — "you win the game" over at once, three at the table too, never for a player who has left; an upkeep's "if" asked as it triggers and as it resolves; 40 or more life; that much life; an Enduring card back as an enchantment alone, still working, and not back again.`);
