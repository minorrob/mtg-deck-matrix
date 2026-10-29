/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 120.3h, 120.10, 310.7-.11, 704.5v-y: Battle damage and state-based actions, without final card definitions. */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {concede} from "../game/engine/rules/sba.mjs";

let checks = 0;
const failures = [];
const eq = (a,b,why) => {assert.deepEqual(a,b,why); checks++;};
const run = (name, fn) => {try {fn();} catch(error) {failures.push(`${name}: ${error.message}`);}};
const make = ({types = ["Battle"], defense = 4, siege = true, etb = false, seats = 3, sourceKeywords = []} = {}) => {
  const name = "Smoke Damage Battle";
  const script = {schema: "CrankCardScript@1", source: "hand", identity: {name, oracleId: "smoke-battle-damage", types,
    subtypes: siege ? ["Siege"] : [], defense, manaCost: "{0}", colors: [], colorIdentity: [],
    ...(types.includes("Planeswalker") ? {loyalty: 6} : {}), ...(types.includes("Creature") ? {power: 8, toughness: 8} : {})},
    oracleText: etb ? "When this permanent enters, you gain 1 life." : "", abilities: etb ? [{kind: "triggered", text: "When this permanent enters, you gain 1 life.", trigger: {on: "enters", who: "self"}, effects: [{effect: "gainLife", amount: 1}]}] : []};
  const compiled = compileScript(script); eq(compiled.problems, [], "the generic Battle fixture compiles");
  const {state} = runScenario({name: "Native Battle damage/SBA", seats, setup: [{seat: 0, zone: "hand", cards: [name]}, {seat: 0, zone: "battlefield", cards: ["Smoke Damage Source"]}], steps: [{cast: name}], expect: []}, card => card === name ? compiled.definition : null,
    {"Smoke Damage Source": {types: ["Creature"], power: 2, toughness: 2, colors: ["R"], keywords: sourceKeywords}});
  const castEvents = resolveTop(state);
  if (siege) castEvents.push(...resolveAwaiting(state, [awaitingChoice(state).options.findIndex(option => option.playerId === 1)]));
  else afterResolving(state, castEvents);
  return {state, name, castEvents, battle: state.zones.battlefield.find(id => state.objects[id].card === name), source: state.zones.battlefield.find(id => state.objects[id].card === "Smoke Damage Source")};
};
for (const types of [["Battle"], ["Battle","Creature"], ["Battle","Planeswalker"], ["Battle","Planeswalker","Creature"]]) run(`native damage ${types}`, () => {
  const {state,battle,source} = make({types});
  const outcome = beginResolution(state, [{effect: "dealDamage", targets: [battle], amount: 2}], {controller: 0, source});
  eq(outcome.status, "done", "ordinary Battle damage uses the existing native damage continuation");
  eq([state.objects[battle].counters.defense, state.objects[battle].counters.loyalty, state.objects[battle].damage],
    [2, types.includes("Planeswalker") ? 4 : undefined, types.includes("Creature") ? 2 : 0], "every applicable permanent type receives its own proper damage result");
  eq(state.players.map(player => player.life), [40,40,40], "no Battle damage is redirected to its protector or controller");
});
for (const types of [["Battle"], ["Battle","Planeswalker","Creature"]]) run(`native excess ${types}`, () => {
  const {state,battle,source} = make({types});
  beginResolution(state, [{effect: "dealDamage", targets: [battle], amount: 7}, {effect: "gainLife", who: [0], amount: {excessDamage: true}}], {controller: 0, source});
  eq(state.players[0].life, 43, "Battle excess uses its current defense and the greatest result among all applicable types");
});
run("zero non-Siege", () => {
  const {state,name} = make({defense: 0, siege: false});
  eq(state.zones.graveyard[0].map(id => state.objects[id].card), [name], "a zero-defense non-Siege is put into its owner's graveyard by the actual SBA");
});
run("zero Siege pending source trigger", () => {
  const {state,battle,name} = make({defense: 0, etb: true});
  eq([!!state.objects[battle], state.stack[0]?.cardId], [true,battle], "a Siege waits while its own actual printed ETB trigger has not left the stack");
  afterResolving(state, resolveTop(state));
  eq([state.zones.graveyard[0].map(id => state.objects[id].card), state.players[0].life], [[name],41], "after that exact trigger leaves the stack, the zero-defense Siege is put into its owner's graveyard");
});
run("protector departure", () => {
  let {state,battle} = make({seats: 4});
  concede(state,1);
  eq([state.awaiting?.kind, state.awaiting?.player], ["rule-operation",0], "the current controller receives a saved mandatory protector repair operation");
  eq(awaitingChoice(state).options.map(option => option.playerId), [2,3], "every remaining eligible opponent is offered");
  const old = awaitingChoice(state).id;
  state = JSON.parse(JSON.stringify(state));
  concede(state,3);
  eq([awaitingChoice(state).options.map(option => option.playerId), awaitingChoice(state).id !== old], [[2],true], "another departure refreshes the exact eligible question after reload");
  const before = JSON.stringify(state);
  assert.throws(() => resolveAwaiting(state,[1]), /Invalid selection/); checks++;
  eq(JSON.stringify(state), before, "a stale invalid option leaves the entire saved operation unchanged");
  resolveAwaiting(state,[0]);
  eq([state.objects[battle].protector, state.ruleOperation, state.awaiting], [2,undefined,null], "the explicit answer repairs the same actual Battle once");
});
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`engine-battle-damage-sba: ${checks} checks; native Battle damage and mandatory state-based actions`);
