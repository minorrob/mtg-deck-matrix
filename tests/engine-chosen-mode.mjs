/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (p1-bugs): A SIEGE'S CHOSEN MODE IS ASKED AS ITS ABILITY TRIGGERS, NOT AS IT RESOLVES.
 *
 * "As this enchantment enters, choose Khans or Dragons. * Khans -- ... * Dragons -- ..." (the Sieges): the mode says
 * which of the two abilities the permanent has. It was carried to the stack as part of the trigger's condition and asked
 * again as the trigger resolved, as if it were an intervening "if" (CR 603.4), read off a source that may have left --
 * so a Siege destroyed in response stopped its own trigger. Once triggered, an ability resolves without its source
 * (CR 113.7a): the mode is asked as it triggers -- for a Siege leaving with the creatures its Dragons watches, as it
 * last was (CR 603.10a) -- and only the rest of a condition goes to the stack (rules/trigger.mjs; script/condition.mjs).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const BEAR = {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const instant = (text, targets, effects) => ({types: ["Instant"], manaCost: "{C}", colors: ["R"], spell: {id: "s", text, targets, effects}});
const BOLT = instant("Bolt deals 3 damage to target creature.", [{what: "permanent", types: ["Creature"]}], [{effect: "dealDamage", amount: 3, targets: {target: 0}}]);
const SHATTER = instant("Destroy target enchantment.", [{what: "permanent", types: ["Enchantment"]}], [{effect: "destroy", targets: {target: 0}}]);
const PRICK = instant("You lose 1 life.", [], [{effect: "loseLife", amount: 1}]);
const WIPE = {types: ["Sorcery"], manaCost: "{C}", colors: ["W"], spell: {id: "s", text: "Destroy all creatures and enchantments.",
  effects: [{effect: "destroyAll", selector: {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "permanent", types: ["Enchantment"]}]}}]}};
/* A Siege of the engine's own, its Khans with an intervening "if" beside the mode: "if you have 40 or more life". */
const WATCH = {types: ["Enchantment"], manaCost: "{C}", colors: [], abilities: [
  {id: "r", kind: "replacement", text: "As this enchantment enters, choose Khans or Dragons.", watches: {event: "enters", who: "self"}, change: {choose: ["Khans", "Dragons"]}},
  {id: "k", kind: "triggered", text: "Khans -- At the beginning of your upkeep, if you have 40 or more life, you gain 3 life.", trigger: {on: "GameEventTurnPhase", phase: "UPKEEP", yourTurn: true},
    condition: {chosen: "Khans", lifeAtLeast: 40}, effects: [{effect: "gainLife", amount: 3}]}]};
const FIXTURES = {Bear: BEAR, Bolt: BOLT, Shatter: SHATTER, Prick: PRICK, Wipe: WIPE, Watch: WATCH};
const play = (scenario) => runScenario({setup: [], ...scenario}, cards.definition, FIXTURES);
const SIEGE_PAY = ["Mountain", "Wastes", "Wastes", "Wastes"];
const siege = (mode) => [...SIEGE_PAY.map((tap) => ({tap})), {cast: "Outpost Siege"}, {resolve: true}, {choose: [mode]}];

{
  /* The condition: the permanent's own choice; gone, as it last was; a permanent there reads itself, never a memory. */
  const s = createState({matchId: "m", seed: "mode", players: [{name: "Rob"}, {name: "Maya"}]});
  const id = addObject(s, {card: "Siege", types: ["Enchantment"], owner: 0, controller: 0}, "battlefield", null);
  s.objects[id].chosen = "Khans";
  eq([conditionHolds(s, {chosen: "Khans"}, {controller: 0, source: id}), conditionHolds(s, {chosen: "Dragons"}, {controller: 0, source: id})], [true, false], "there: Khans holds, Dragons does not");
  eq(conditionHolds(s, {chosen: "Dragons"}, {controller: 0, source: id, lastKnown: {chosen: "Dragons"}}), false, "a permanent there reads its own choice, not a last known one");
  eq([conditionHolds(s, {chosen: "Dragons"}, {controller: 0, source: "gone", lastKnown: {chosen: "Dragons"}}), conditionHolds(s, {chosen: "Dragons"}, {controller: 0, source: "gone"})],
    [true, false], "gone: as it last was, Dragons; with nothing known of it, nothing chosen");
}
{
  /* On the stack, Outpost Siege's Dragons trigger carries no condition at all: its mode stayed behind. */
  const {state} = play({name: "carried", setup: [at(0, "hand", "Outpost Siege", "Bolt"), at(0, "battlefield", ...SIEGE_PAY, "Wastes", "Bear")],
    steps: [...siege("Dragons"), {tap: "Wastes"}, {cast: "Bolt", targets: [{card: "Bear"}]}, {resolve: true}, {choose: ["Maya"]}], expect: [{stack: 1}]});
  eq([state.stack[0].kind, state.stack[0].script.condition], ["trigger", undefined], "the Dragons trigger: no condition goes with it");
}
{
  /* The rest of a condition does go with it, and is asked again as it resolves (CR 603.4): the Watch's Khans triggers at
     40 life, Rob loses 1 in response, and it does nothing. With the Watch destroyed instead, it gains him 3 (CR 113.7a). */
  const upkeep = (respond, expect) => play({name: "watch", setup: [at(0, "battlefield", "Wastes", "Wastes"), at(0, "hand", "Watch", respond)],
    steps: [{tap: "Wastes"}, {cast: "Watch"}, {resolve: true}, {choose: ["Khans"]}, {to: {turn: 3, phase: "UPKEEP"}}, {expect: [{stack: 1}]},
      {tap: "Wastes"}, {cast: respond, targets: respond === "Shatter" ? [{card: "Watch"}] : []}, {resolve: true}, {expect: [{stack: 1}]}, {resolve: true}], expect});
  const pricked = upkeep("Prick", [{seat: 0, life: 39}, {stack: 0}]);
  eq(pricked.state.players[0].life, 39, "at 39 as it resolves: its intervening if is false, and no life gained");
  const shattered = upkeep("Shatter", [{seat: 0, life: 43}, {seat: 0, zone: "graveyard", cards: ["Watch", "Shatter"]}]);
  eq(shattered.state.players[0].life, 43, "the Watch destroyed: still 40 or more, so 3 gained without it");
  const {state} = play({name: "watch carried", setup: [at(0, "battlefield", "Wastes"), at(0, "hand", "Watch")],
    steps: [{tap: "Wastes"}, {cast: "Watch"}, {resolve: true}, {choose: ["Khans"]}, {to: {turn: 3, phase: "UPKEEP"}}], expect: [{stack: 1}]});
  eq(state.stack[0].script.condition, {lifeAtLeast: 40}, "the Watch's Khans on the stack: its intervening if, and not its mode");
}
{
  /* Outpost Siege's Dragons, three players: the Siege and Rob's Bear go in one wipe with Maya's Bear and Trey's -- the
     Siege sees Rob's own Bear leave as it leaves itself (CR 603.10a), and that alone: one trigger, 1 damage to Trey. */
  const {state} = play({name: "wipe", seats: 3, setup: [at(0, "hand", "Outpost Siege", "Wipe"), at(0, "battlefield", ...SIEGE_PAY, "Wastes", "Bear"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear")],
    steps: [...siege("Dragons"), {tap: "Wastes"}, {cast: "Wipe"}, {resolve: true}, {expect: [{asks: {seat: 0}}]}, {choose: ["Trey"]}, {expect: [{stack: 1}]}, {resolve: true}],
    expect: [{seat: 2, life: 39}, {seat: 1, life: 40}, {seat: 0, zone: "graveyard", cards: ["Outpost Siege", "Bear", "Wipe"]}]});
  eq(state.stack.length, 0, "one trigger, resolved");
  /* Khans chosen, the same wipe triggers nothing: the mode as it last was is Khans. */
  const khans = play({name: "wipe khans", seats: 3, setup: [at(0, "hand", "Outpost Siege", "Wipe"), at(0, "battlefield", ...SIEGE_PAY, "Wastes", "Bear"), at(1, "battlefield", "Bear")],
    steps: [...siege("Khans"), {tap: "Wastes"}, {cast: "Wipe"}, {resolve: true}], expect: [{stack: 0}]});
  eq(khans.state.awaiting ?? null, null, "Khans: nothing asked");
}
{
  /* Four players, the Siege destroyed while its Dragons trigger waits: it resolves, 1 damage to Sam, whom it aimed at. */
  const {state} = play({name: "response", seats: 4, setup: [at(0, "hand", "Outpost Siege", "Bolt", "Shatter"), at(0, "battlefield", ...SIEGE_PAY, "Wastes", "Wastes", "Bear")],
    steps: [...siege("Dragons"), {tap: "Wastes"}, {cast: "Bolt", targets: [{card: "Bear"}]}, {resolve: true}, {choose: ["Sam"]},
      {tap: "Wastes"}, {cast: "Shatter", targets: [{card: "Outpost Siege"}]}, {resolve: true}, {expect: [{stack: 1}]}, {resolve: true}],
    expect: [{seat: 3, life: 39}, {stack: 0}]});
  eq(state.players.map((p) => p.life), [40, 40, 40, 39], "Sam at 39, nobody else touched");
}

console.log(`engine-chosen-mode: ${checks} checks passed -- a Siege's mode is asked as its ability triggers (as the Siege last was, for one that left with the creatures), never again as it resolves; the rest of a condition still is.`);
