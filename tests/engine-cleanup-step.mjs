/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CLEANUP STEP IN ITS ORDER (CR 514), AND WHAT HAPPENS IN IT (514.3a).
 *
 * First the active player discards down to their maximum hand size (514.1); then all damage wears off and every "until
 * end of turn" and "this turn" effect ends (514.2) -- so a "this turn" ability still sees the discard, which triggers as
 * it happens (CR 603.2), and the discard names the card it became (rules/turn.mjs), as every discard does. Normally no
 * player receives priority in the step; but when a state-based action is performed or an ability triggered, the triggers
 * go on the stack and the active player gets priority, and once the stack is empty and all pass, another cleanup step
 * begins (514.3a) -- which ends again what was made "until end of turn" in between.
 *
 * Found by Rob's Priority Batch 10.3's thirty-fifth slice: nothing collected what a discard to hand size triggered.
 */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance} from "../game/engine/rules/turn.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const compiled = (name, identity, abilities) => {
  const {definition, problems} = compileScript({schema: "CrankCardScript@1", identity: {name, oracleId: "00000000-0000-4000-8000-000000000000", ...identity},
    oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities});
  assert.deepEqual(problems, [], `${name} compiles`);
  return definition;
};
const watcher = (name, trigger) => compiled(name, {types: ["Enchantment"], manaCost: "{1}", colors: []},
  [{kind: "triggered", text: `${name}: you gain 1 life.`, trigger, effects: [{effect: "gainLife", amount: 1}]}]);
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* "Whenever you discard a land card", "whenever you discard a card". */
  "Land Discarder": watcher("Land Discarder", {on: "discarded", discarder: "you", filter: {types: ["Land"]}}),
  "Discard Watcher": watcher("Discard Watcher", {on: "discarded", discarder: "you"}),
  Growth: {types: ["Instant"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "Target creature gets +2/+2 until end of turn.",
    targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "pump", targets: {target: 0}, power: 2, toughness: 2}]}},
  /* "Whenever you discard a card this turn, you gain 1 life": a delayed trigger that lasts the turn (CR 603.7b). */
  Omen: compiled("Omen", {types: ["Sorcery"], manaCost: "{B}", colors: ["B"]}, [{kind: "spell", text: "Whenever you discard a card this turn, you gain 1 life.", targets: [],
    effects: [{effect: "delayedTrigger", when: {on: "discarded", discarder: "you"}, thisTurn: true, effects: [{effect: "gainLife", amount: 1}]}]}]),
};
const run = (setup, steps, more = {}) => runScenario({name: "cleanup", setup, steps, ...more}, index.definition, FIX);
const cleanups = (events, turn) => events.filter((e) => e.kind === "GameEventTurnPhase" && e.data?.fields?.phase === "CLEANUP" && e.data?.turn === turn).length;
const life = (s) => s.players.map((p) => p.life);
const SEVEN = ["Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
const stats = (s, card) => { const id = s.zones.battlefield.find((x) => s.objects[x].card === card); return s.objects[id]; };

/* ---- nothing happens: no priority, one cleanup step ---- */
{
  const {state, events} = run([at(0, "battlefield", "Land Discarder")], [{to: {turn: 2, phase: "UPKEEP"}}]);
  eq([cleanups(events, 1), life(state)], [1, [40, 40]], "nothing discarded, nothing triggered: one cleanup step, and the turn passes");
}

/* ---- a discard that triggers ---- */
{
  const setup = [at(0, "battlefield", "Land Discarder"), at(0, "hand", "Forest", ...SEVEN)];
  const {state} = run(setup, [{to: {turn: 1, phase: "CLEANUP"}}, {choose: ["Forest"]}]);
  eq([state.phase, state.stack.map((e) => e.name), state.priorityPlayer], ["CLEANUP", ["Land Discarder"], 0],
    "the Forest discarded to hand size: its trigger on the stack, and Rob holds priority in the cleanup step");
  const after = run(setup, [{to: {turn: 1, phase: "CLEANUP"}}, {choose: ["Forest"]}, {resolve: true}, {to: {turn: 2, phase: "UPKEEP"}}]);
  eq([life(after.state), cleanups(after.events, 1)], [[41, 40], 2], "it resolves -- the discard was a land card's -- and then another cleanup step, and Maya's turn");
}
{
  /* Two triggers: Rob orders them, then both resolve. */
  const setup = [at(0, "battlefield", "Land Discarder", "Discard Watcher"), at(0, "hand", "Forest", ...SEVEN)];
  const {state} = run(setup, [{to: {turn: 1, phase: "CLEANUP"}}, {choose: ["Forest"]}]);
  eq(state.awaiting?.kind, "order-triggers", "two triggers of Rob's: Rob orders them first");
  const after = run(setup, [{to: {turn: 1, phase: "CLEANUP"}}, {choose: ["Forest"]}, {answer: [0, 1]}, {resolve: true}, {resolve: true}, {to: {turn: 2, phase: "UPKEEP"}}]);
  eq(life(after.state), [42, 40], "both resolve in the cleanup step");
}

/* ---- in between, an instant; its "until end of turn" ends in the next cleanup step ---- */
{
  const setup = [at(0, "battlefield", "Land Discarder", "Forest", "Bear"), at(0, "hand", "Growth", ...SEVEN)];
  const steps = [{to: {turn: 1, phase: "CLEANUP"}}, {choose: ["Wastes"]}, {resolve: true}, {tap: "Forest"}, {cast: "Growth", targets: [{card: "Bear"}]}, {resolve: true}];
  const {state} = run(setup, steps);
  eq([state.phase, stats(state, "Bear").damage, life(state)[0]], ["CLEANUP", 0, 41], "Rob, with priority in the cleanup step, casts Growth on the Bear");
  const after = run(setup, [...steps, {expect: [{seat: 0, stats: {card: "Bear", power: 4, toughness: 4}}]}, {to: {turn: 2, phase: "UPKEEP"}},
    {expect: [{seat: 0, stats: {card: "Bear", power: 2, toughness: 2}}]}]);
  eq(cleanups(after.events, 1), 2, "then, the stack empty and all passed, another cleanup step: the +2/+2 made in between ended in it");
}

/* ---- a trigger nobody can put on the stack ---- */
{
  /* Maya has left the game with one of Maya's triggers still waiting: it never goes on the stack (CR 800.4a), so it is no
     reason for priority in Rob's cleanup step -- counted, the step repeated for ever (found in the room's seeded games). */
  const {state} = run([at(0, "battlefield", "Land Discarder")], [{to: {turn: 1, phase: "END_OF_TURN"}}], {seats: 3});
  state.players[1].lost = true;
  state.pendingTriggers = [{abilityId: "gone", text: "A trigger of Maya's", controller: 1, source: {cardId: null, name: "Gone"}, cause: null, optional: false,
    script: {targets: [], effects: []}}];
  for (let n = 0; n < 6 && state.phase === "END_OF_TURN"; n += 1) if (passPriority(state, null, null).outcome === "step-ends") advance(state);
  eq([state.phase, state.priorityPlayer, state.cleanupAgain === true], ["CLEANUP", null, false], "Rob's cleanup step: nobody gets priority for Maya's trigger");
  advance(state);
  eq([state.turn, state.activePlayer], [2, 2], "and the turn passes to Trey");
}

/* ---- the discard before "this turn" ends ---- */
{
  const setup = [at(0, "battlefield", "Swamp"), at(0, "hand", "Omen", "Forest", ...SEVEN)];
  const {state} = run(setup, [{tap: "Swamp"}, {cast: "Omen"}, {resolve: true}, {to: {turn: 1, phase: "CLEANUP"}}, {choose: ["Forest"]}, {resolve: true}, {to: {turn: 2, phase: "UPKEEP"}}]);
  eq([life(state), (state.delayedTriggers ?? []).length], [[41, 40], 0], "\"whenever you discard a card this turn\" sees the discard to hand size (CR 514.1), then ends with the turn (514.2)");
}

console.log(`engine-cleanup-step: ${checks} checks passed -- the discard to hand size first, "this turn" after it; what it triggers on the stack and the active player with priority; another cleanup step after, which ends what was made in between.`);
