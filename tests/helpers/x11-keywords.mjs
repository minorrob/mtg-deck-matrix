/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* What the Train B keyword suites (tests/engine-x11-*.mjs) share: a scenario's position played through the rules, the game
   driven on to the next question as the room drives it, the cards those suites' fixtures are, and the checks counted. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runScenario} from "../../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../../game/tools/engine-cards.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../../game/engine/rules/turn.mjs";
import {passPriority} from "../../game/engine/rules/priority.mjs";
import {createRng} from "../../game/engine/rng.mjs";
import {compileScript} from "../../game/engine/cards/index.mjs";
import {missingFor, keywordBuilt} from "../../game/tools/engine-constructs.mjs";
import {housePilot, meetRequirements} from "../../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../../game/engine/projection.mjs";
import {runEffect} from "../../game/engine/script/effects/index.mjs";
import {collectTriggers} from "../../game/engine/rules/trigger.mjs";

export {assert};
export const index = loadCardIndex();
export const at = (seat, zone, ...cards) => ({seat, zone, cards});
/* Put there once the scenario starts (after the first upkeep). */
export const later = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
export const creature = (subtypes, power, toughness, more = {}) => ({types: ["Creature"], subtypes, manaCost: "{2}", colors: ["G"], power, toughness, ...more});
export const FIXTURES = {
  Bear: creature(["Bear"], 2, 2), "Big Bear": creature(["Bear"], 5, 5, {manaCost: "{3}{G}{G}"}), Squirrel: creature(["Squirrel"], 1, 1),
  Spider: creature(["Spider"], 1, 3, {keywords: ["Reach"]}),
  Relic: {types: ["Artifact"], manaCost: "{1}", colors: []},
  "Charm Ward": {types: ["Enchantment"], manaCost: "{1}{W}", colors: ["W"]},
};

/** A scenario's position and steps played through the rules (cards/scenario.mjs): the state it ends in. */
export function play(setup, steps = [], more = {}, fixtures = {}) {
  return runScenario({name: more.name ?? "x11", setup, steps, ...more}, index.definition, {...FIXTURES, ...fixtures}).state;
}

/** The game moved on as the room moves it -- priority passed, steps advanced -- until `until` holds; a question on the way
    that `answer` does not answer stops it, but the routine ones the scenarios answer too (cards/scenario.mjs): the order of
    triggers put on the stack at once as offered, nobody attacking but whom the rules make, and nobody blocking. */
export function drive(state, until, {answer = () => null, rng = createRng("x11")} = {}) {
  for (let n = 0; n < 3000; n += 1) {
    if (until(state)) return state;
    if (state.awaiting) {
      const choice = awaitingChoice(state);
      const routine = {"order-triggers": () => choice.options.map((o) => o.index), "declare-attackers": () => meetRequirements(choice, []), "declare-blockers": () => []};
      const indices = answer(state, choice) ?? routine[state.awaiting.kind]?.() ?? null;
      if (indices === null) throw new Error(`asked ${state.awaiting.kind} on the way`);
      resolveAwaiting(state, indices, null, rng);
      continue;
    }
    if (state.priorityPlayer === null) { advance(state); continue; }
    const outcome = passPriority(state, null, rng);
    if (outcome.outcome === "step-ends") advance(state);
  }
  throw new Error("never got there");
}
export const asked = (kind) => (state) => state.awaiting?.kind === kind;
/** An effect done as a resolving spell would do it, its events read for triggers as the rules read an action's
    (rules/trigger.mjs): what triggers on it waits for the next priority. */
export function happen(state, effect, context = {controller: 0, source: null}) {
  const events = runEffect(state, effect, context, createRng("x11"));
  collectTriggers(state, events);
  return events;
}
/** The labels of what is being asked. */
export const labels = (state) => awaitingChoice(state).options.map((o) => o.label);
/** An answer by label. */
export const choose = (state, ...wanted) => resolveAwaiting(state, wanted.map((w) => {
  const option = awaitingChoice(state).options.find((o) => o.label === w);
  if (!option) throw new Error(`no option ${w}: ${labels(state).join(", ")}`);
  return option.index;
}), null, createRng("x11"));
/** Both pilots the room seats (the house pilot, and random-legal) answer the question being asked, and the rules take each
    answer: the state each leaves, played on a copy. */
export function pilotsAnswer(state) {
  const choice = awaitingChoice(state), seat = state.awaiting.player;
  return [housePilot({seat}).answer(projectFor(state, seat), choice), randomLegalPilot(createRng("x11-pilot")).answer(choice)].map((answer) => {
    const copy = structuredClone(state);
    resolveAwaiting(copy, answer.indices ?? [], answer.amounts ?? null, createRng("x11"));
    return copy;
  });
}
export const idOf = (state, name, seat = undefined) => Object.keys(state.objects).map(Number)
  .find((id) => state.objects[id].card === name && state.objects[id].zone === "battlefield" && (seat === undefined || state.objects[id].controller === seat));

/** A script compiled from these abilities, on a card of this identity. */
export function compiled(abilities, identity = {}) {
  return compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "odd", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: ["G"],
    colorIdentity: ["G"], power: 1, toughness: 1, ...identity}, oracleText: "x", source: "hand", abilities});
}

/** A card of Rob's decks as the inventory measured it, and whether the engine has every rule it needs. */
const inventory = JSON.parse(readFileSync(new URL("../../game/docs/engine-inventory.json", import.meta.url), "utf8"));
export const missing = (name) => missingFor(inventory.deck.perCard[name] ?? {}).map((m) => `${m.kind}:${m.name}`);
export {keywordBuilt};

export function checks(name) {
  let count = 0;
  return {
    eq(a, b, m) { assert.deepEqual(a, b, m); count += 1; },
    ok(a, m) { assert.ok(a, m); count += 1; },
    throws(f, re, m) { assert.throws(f, re, m); count += 1; },
    done(what) { console.log(`${name}: ${count} checks passed -- ${what}`); },
  };
}
