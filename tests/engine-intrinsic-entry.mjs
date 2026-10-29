/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 306.5b, 614.12: intrinsic entry counters depend on the entrant's prospective abilities. */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {enteringModifications, ownEntering} from "../game/engine/rules/replacement.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";
import {concede} from "../game/engine/rules/sba.mjs";

let checks = 0;
const failures = [];
const eq = (actual, expected, message) => {assert.deepEqual(actual, expected, message); checks++;};
const run = (name, action) => {try {action();} catch (error) {failures.push(`${name}: ${error.message}`);}};
const script = {schema: "CrankCardScript@1", source: "hand", identity: {name: "Smoke Creature Walker", oracleId: "smoke-intrinsic-walker",
  types: ["Creature", "Planeswalker"], manaCost: "{0}", colors: [], colorIdentity: [], power: 1, toughness: 1, loyalty: 3}, oracleText: "", abilities: []};
const result = compileScript(script);
eq(result.problems, [], "the generic creature-planeswalker fixture compiles");
const mute = {types: ["Enchantment"], abilities: [{id: "mute", kind: "static", layer: 6, affects: {types: ["Creature"]}, apply: {removeAllAbilities: true}}]};
const loseCompleated = {types: ["Enchantment"], abilities: [{id: "uncomplete", kind: "static", layer: 6, affects: {types: ["Planeswalker"]}, apply: {removeKeywords: ["Compleated"]}}]};
const completed = compileScript({...script, identity: {...script.identity, manaCost: "{G/P}"}, oracleText: "Compleated", abilities: [{kind: "keyword", keyword: "compleated", text: "Compleated"}]});
eq(completed.problems, [], "the generic compleated creature-planeswalker fixture compiles");
const cards = loadCardIndex();
const bonus = {types: ["Enchantment"], abilities: [{id: "bonus", kind: "replacement", watches: {event: "enters", filter: {types: ["Creature"]}}, change: {entersWithCounters: {counter: "loyalty", count: 2}}}]};
const legacyState = (definition, effect = null) => {
  const state = createState({players: [{name: "A"}, {name: "B"}, {name: "C"}]});
  if (effect) addObject(state, {...effect, card: "Smoke Static", owner: 1, controller: 1}, "battlefield");
  const objectId = addObject(state, {...definition, card: script.identity.name, owner: 0, controller: 0}, "graveyard", 0);
  return {state, objectId};
};
run("native unmodified control", () => {
  const {state} = runScenario({name: "An ordinary creature planeswalker keeps printed loyalty", seats: 3,
    setup: [{seat: 0, zone: "hand", cards: [script.identity.name]}], steps: [{cast: script.identity.name}, {settle: true}], expect: []},
  name => name === script.identity.name ? result.definition : null);
  const walker = state.zones.battlefield.find(id => state.objects[id].card === script.identity.name);
  eq(state.objects[walker].counters.loyalty, 3, "an unmodified native entry still receives its printed loyalty");
});
run("native public cast", () => {
  const {state} = runScenario({name: "A muted creature planeswalker enters without intrinsic loyalty", seats: 3,
    setup: [{seat: 1, zone: "battlefield", cards: ["Smoke Mute"]}, {seat: 0, zone: "hand", cards: [script.identity.name]}],
    steps: [{cast: script.identity.name}, {settle: true}], expect: []}, name => name === script.identity.name ? result.definition : null, {"Smoke Mute": mute});
  eq(state.zones.battlefield.filter(id => state.objects[id].card === script.identity.name).length, 0,
    "the lost intrinsic ability supplies no loyalty; the actual zero-loyalty planeswalker goes to its graveyard");
  eq(state.zones.graveyard[0].map(id => state.objects[id].card), [script.identity.name], "the public cast ends in the owner's graveyard by the actual SBA");
});
for (const [name, entering] of [["legacy entry", enteringModifications], ["copied legacy entry", ownEntering]]) run(name, () => {
  const {state, objectId} = legacyState(result.definition, mute);
  const before = JSON.stringify(state);
  const entry = entering(state, {objectId, player: 0, types: result.definition.types, abilities: result.definition.abilities});
  eq(entry.counters.loyalty ?? 0, 0, "the same prospective ability loss suppresses the printed intrinsic counters");
  eq(JSON.stringify(state), before, "checking the entrant in its prospective zone changes no actual card or battlefield state");
});
for (const [name, entering] of [["legacy unmodified", enteringModifications], ["copied legacy unmodified", ownEntering]]) run(name, () => {
  const {state, objectId} = legacyState(result.definition);
  eq(entering(state, {objectId, player: 0, types: result.definition.types, abilities: result.definition.abilities}).counters.loyalty, 3,
    "unmodified legacy entry retains the ordinary intrinsic counters");
});
for (const removed of [false, true]) run(`native compleated ${removed ? "lost" : "present"}`, () => {
  const setup = [{seat: 0, zone: "hand", cards: [script.identity.name]}, ...(removed ? [{seat: 1, zone: "battlefield", cards: ["Smoke Keyword Loss"]}] : [])];
  const {state} = runScenario({name: `Compleated prospective keyword ${removed}`, seats: 3, setup, steps: [{cast: script.identity.name}, {settle: true}], expect: []},
    name => name === script.identity.name ? completed.definition : null, {"Smoke Keyword Loss": loseCompleated});
  const walker = state.zones.battlefield.find(id => state.objects[id].card === script.identity.name);
  eq(state.players[0].life, 38, "the native cast actually pays the Phyrexian symbol with two life");
  eq(state.objects[walker].counters.loyalty, removed ? 3 : 1, "only a prospective Compleated ability reduces the entry counters for that paid life");
});
for (const removed of [false, true]) run(`legacy compleated ${removed ? "lost" : "present"}`, () => {
  const {state, objectId} = legacyState(completed.definition, removed ? loseCompleated : null);
  const entry = enteringModifications(state, {objectId, player: 0, types: completed.definition.types, abilities: completed.definition.abilities, phyrexianLife: 1});
  eq(entry.counters.loyalty, removed ? 3 : 1, "legacy entry uses the same prospective keyword rather than a removed printed keyword");
});
for (const entering of [enteringModifications, ownEntering]) {
  run(`legacy type removal ${entering.name}`, () => {
    const {state, objectId} = legacyState(result.definition, {types: ["Enchantment"], abilities: [{id: "unwalk", kind: "static", layer: 4, affects: {types: ["Creature"]}, apply: {removeTypes: ["Planeswalker"]}}]});
    eq(entering(state, {objectId, player: 0, types: result.definition.types, abilities: []}).counters, {}, "a prospective nonplaneswalker has no intrinsic loyalty ability");
  });
  run(`legacy own static ${entering.name}`, () => {
    const abilities = [{id: "self-mute", kind: "static", layer: 6, affects: {self: true}, apply: {removeAllAbilities: true}}];
    const {state, objectId} = legacyState({...result.definition, abilities});
    const before = JSON.stringify(state);
    eq(entering(state, {objectId, player: 0, types: result.definition.types, abilities}).counters, {}, "the entrant's own prospective continuous effect can remove its intrinsic ability");
    eq(JSON.stringify(state), before, "deriving the own static effect does not alter saved abilities or effects");
  });
}
run("independent entry counters", () => {
  const {state} = runScenario({name: "An independent replacement grants loyalty despite intrinsic ability loss", seats: 3,
    setup: [{seat: 1, zone: "battlefield", cards: ["Smoke Mute", "Smoke Bonus"]}, {seat: 0, zone: "hand", cards: [script.identity.name]}],
    steps: [{cast: script.identity.name}, {settle: true}], expect: []}, name => name === script.identity.name ? result.definition : null, {"Smoke Mute": mute, "Smoke Bonus": bonus});
  const walker = state.zones.battlefield.find(id => state.objects[id].card === script.identity.name);
  eq(state.objects[walker].counters.loyalty, 2, "removing the entrant's intrinsic ability leaves an external entry counter grant intact");
});
for (const leaves of [false, true]) run(`native reload/departure ${leaves}`, () => {
  const cast = runScenario({name: "Prospective entry is rederived after reload and source departure", seats: 3,
    setup: [{seat: 1, zone: "battlefield", cards: ["Smoke Mute"]}, {seat: 0, zone: "hand", cards: [script.identity.name]}],
    steps: [{cast: script.identity.name}], expect: []}, name => name === script.identity.name ? result.definition : null, {"Smoke Mute": mute});
  const state = JSON.parse(JSON.stringify(cast.state)), stackId = state.stack[0].objectId;
  eq(state.objects[stackId].zone, "stack", "JSON preserves the original spell identity before entry");
  if (leaves) concede(state, 1);
  afterResolving(state, resolveTop(state));
  const walker = state.zones.battlefield.find(id => state.objects[id].card === script.identity.name);
  eq(walker ? state.objects[walker].counters.loyalty : 0, leaves ? 3 : 0, "entry uses the current continuous sources after reload or their owner's actual departure");
  eq(state.stack.length, 0, "the native spell finishes exactly once after reload");
});
for (const loss of ["keyword", "all"]) run(`actual doubler with lost ${loss}`, () => {
  const {state} = runScenario({name: `Actual Doubling Season respects prospective ability loss ${loss}`, seats: 3,
    setup: [{seat: 0, zone: "battlefield", cards: ["Doubling Season"]}, {seat: 1, zone: "battlefield", cards: ["Smoke Loss"]}, {seat: 0, zone: "hand", cards: [script.identity.name]}],
    steps: [{cast: script.identity.name}, {settle: true}], expect: []}, name => name === script.identity.name ? completed.definition : cards.definition(name), {"Smoke Loss": loss === "keyword" ? loseCompleated : mute});
  const walker = state.zones.battlefield.find(id => state.objects[id].card === script.identity.name);
  eq(state.players[0].life, 38, "the actual doubled entry follows a life-funded cast");
  eq(walker ? state.objects[walker].counters.loyalty : 0, loss === "keyword" ? 6 : 0, "the existing doubler doubles remaining intrinsic counters; it cannot restore an ability removed before entry");
});
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`engine-intrinsic-entry: ${checks} checks; native and legacy intrinsic counters respect prospective ability loss`);
