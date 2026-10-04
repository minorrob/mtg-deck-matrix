/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THE 'LEGEND RULE' DOESN'T APPLY TO PERMANENTS YOU CONTROL THIS TURN" (Hall of Echoes; the live-game plan of 2026-10-04,
 * lane W6): an effect of its controller's (effectUntil's `rule: "no-legend-rule"`), which the legend rule's check skips
 * for that player (rules/sba.mjs, CR 704.5j) until the turn ends -- another player's legends still answer to it.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const LEGEND = {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const FIX = {"Legend Bear": LEGEND};
const play = (steps = []) => runScenario({name: "no legend rule", setup: [], steps}, index.definition, FIX).state;

const {addObject} = await import("../game/engine/state/index.mjs");
const two = (s, seat) => { for (let i = 0; i < 2; i += 1) addObject(s, {...LEGEND, card: "Legend Bear", owner: seat, controller: seat}, "battlefield", null); };
{
  const s = play();
  runEffect(s, {effect: "effectUntil", rule: "no-legend-rule"}, {controller: 0});
  two(s, 0);
  checkStateBasedActions(s);
  eq(s.awaiting?.kind ?? null, null, "Rob's two Legend Bears, the effect Rob's: nobody is asked");
  two(s, 1);
  checkStateBasedActions(s);
  eq([s.awaiting?.kind, s.awaiting?.player], ["legend-rule", 1], "Maya's two: Maya is asked");
}
{
  const t = play();
  runEffect(t, {effect: "effectUntil", rule: "no-legend-rule"}, {controller: 0});
  const {advance} = await import("../game/engine/rules/turn.mjs");
  const {passPriority} = await import("../game/engine/rules/priority.mjs");
  for (let n = 0; n < 200 && t.turn < 2; n += 1) { if (t.awaiting) break; if (t.priorityPlayer === null) advance(t); else if (passPriority(t, null).outcome === "step-ends") advance(t); }
  eq((t.effects ?? []).some((e) => e.rule === "no-legend-rule"), false, "the turn over, it is gone");
}

console.log(`engine-no-legend-rule: ${checks} checks passed -- the legend rule off for one player's permanents, for the turn; another player's still under it.`);
