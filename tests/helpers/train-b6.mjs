/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../../game/engine/state/index.mjs";
import {runScenario} from "../../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../../game/tools/engine-cards.mjs";
export {assert};
export const table = () => createState({matchId: "b6", seed: "b6", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
export const creature = (card, power = 2, toughness = power, more = {}) => ({card, types: ["Creature"], manaCost: "{2}", power, toughness, ...more});
export const on = (s, object, seat = 0, zone = "battlefield") => addObject(s, {...object, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
export const context = {controller: 0, source: null};
export function checks(name) {
  let count = 0;
  return {eq(a, b, m) {assert.deepEqual(a, b, m); count++;}, ok(a, m) {assert.ok(a, m); count++;},
    throws(f, re, m) {assert.throws(f, re, m); count++;}, done() {console.log(`${name}: ${count} checks passed`);}};
}
export function scenarios(path) {
  const data = JSON.parse(readFileSync(new URL(`../../game/engine/cards/${path}.scenarios.json`, import.meta.url), "utf8"));
  const index = loadCardIndex();
  for (const scenario of data.scenarios) runScenario(scenario, index.definition, data.fixtures ?? {});
  return data.scenarios.length;
}
