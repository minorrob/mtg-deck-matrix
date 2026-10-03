/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 65 (THE CATALOG'S ORDER): EARTHBEND (Forge's Earthbend) AND CHANGING A SPELL'S TARGET (Forge's
 * ChangeTargets, CR 115.7).
 *
 * Earthbend N: the land a 0/0 creature with haste, still a land, for good, with N +1/+1 counters; when it dies or is exiled,
 * back onto the battlefield tapped -- a land again. Changing the target: another target the spell could have, by its own
 * requirements, never itself; none, and nobody is asked. "Target spell with a single target"; counters among permanents.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {characteristicsOf, keywordsOf} from "../game/engine/rules/layers.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const table = () => createState({matchId: "m", seed: "earth", players: [{name: "Rob"}, {name: "Maya"}]});
const put = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "stack", "exile"].includes(zone) ? null : seat);
const BOLT = {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Bolt deals 3 damage to any target.", targets: [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}],
  effects: [{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}]}};
const BEAR = {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};

{
  /* Earthbend 2: a 2/2 creature with haste that is still a land -- and still one next turn. */
  const s = table();
  const land = put(s, {card: "Wastes", types: ["Land"], supertypes: ["Basic"]}, 0);
  runEffects(s, [{effect: "earthbend", targets: [land], count: 2}], {controller: 0, source: null});
  const c = characteristicsOf(s, land);
  eq([c.types.sort(), c.power, c.toughness, keywordsOf(s, land).includes("Haste")], [["Creature", "Land"], 2, 2, true], "a 2/2 land creature with haste");
  eq((s.effects ?? []).filter((e) => e.affects?.ids?.includes(land)).every((e) => e.until === null), true, "for good, not until end of turn");
  eq((s.delayedTriggers ?? []).filter((d) => d.watch === land).map((d) => d.on.to).sort(), ["Exile", "Graveyard"], "waiting on it dying or being exiled");
  /* Not a permanent any more: nothing. */
  const gone = put(s, {card: "Grove", types: ["Land"]}, 0, "graveyard");
  eq(runEffects(s, [{effect: "earthbend", targets: [gone], count: 1}], {controller: 0, source: null}).length, 0, "a land card in a graveyard: nothing");
}
{
  /* It dies -- Maya's Bolt -- and returns to the battlefield tapped, a land, its counters gone. */
  const {state: s} = runScenario({name: "bend", setup: [at(0, "battlefield", "Ba Sing Se", "Forest", "Wastes", "Wastes", "Plains"), at(1, "battlefield", "Mountain"), at(1, "hand", "Bolt")],
    steps: [{tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Ba Sing Se", targets: [{card: "Plains"}]}, {resolve: true},
      {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Bolt", seat: 1, targets: [{card: "Plains", seat: 0}]}, {resolve: true}, {settle: true}], expect: []}, cards.definition, {Bolt: BOLT});
  const plains = s.zones.battlefield.find((id) => s.objects[id].card === "Plains");
  eq([plains !== undefined, s.objects[plains]?.tapped, characteristicsOf(s, plains).types, s.objects[plains]?.counters["+1/+1"] ?? 0], [true, true, ["Land"], 0], "back tapped: a land, no counters");
}
{
  /* Changing the target: Maya's Bolt at Rob -- offered his Bear and her own Bear, not Rob again, never the Bolt itself. */
  const fix = {Bolt: BOLT, Bear: BEAR};
  const {state: s} = runScenario({name: "mischief", setup: [at(0, "battlefield", "Swamp", "Wastes", "Bear"), at(0, "hand", "Imp's Mischief"), at(1, "battlefield", "Mountain", "Bear"), at(1, "hand", "Bolt")],
    steps: [{pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Bolt", seat: 1, targets: [{player: 0}]}, {pass: 1}, {tap: "Swamp", seat: 0}, {tap: "Wastes", seat: 0}, {cast: "Imp's Mischief", seat: 0, targets: [{card: "Bolt", seat: 1}]}, {resolve: true}],
    expect: []}, cards.definition, fix);
  eq([s.awaiting?.effect, awaitingChoice(s).options.map((o) => o.label).sort()], ["changeTargets", ["Bear", "Bear", "Maya"]], "his Bear, her Bear, or Maya herself; not Rob, not the Bolt");
  /* A spell with no other target it could have: nobody asked. */
  const {state: t} = runScenario({name: "only", setup: [at(0, "battlefield", "Swamp", "Wastes"), at(0, "hand", "Imp's Mischief"), at(1, "battlefield", "Mountain"), at(1, "hand", "Hush")],
    steps: [{pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Hush", seat: 1, targets: [{player: 0}]}, {pass: 1}, {tap: "Swamp", seat: 0}, {tap: "Wastes", seat: 0}, {cast: "Imp's Mischief", seat: 0, targets: [{card: "Hush", seat: 1}]}, {resolve: true}],
    expect: []}, cards.definition, {Hush: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Target opponent loses 1 life.", targets: [{what: "player", who: "opponent"}], effects: [{effect: "loseLife", amount: 1, who: {target: 0}}]}}});
  eq([t.awaiting ?? null, t.stack.find((e) => e.name === "Hush")?.targets?.[0]?.id], [null, 0], "Hush has only Rob to aim at: unchanged, nothing asked");
}
{
  /* "Target spell with a single target"; counters among his lands. */
  const s = table();
  const one = put(s, {card: "One", types: ["Instant"]}, 1, "stack"), two = put(s, {card: "Two", types: ["Instant"]}, 1, "stack");
  s.stack.push({stackId: 1, objectId: one, kind: "spell", targets: [{kind: "player", id: 0}], playerId: 1}, {stackId: 2, objectId: two, kind: "spell", targets: [{kind: "player", id: 0}, {kind: "player", id: 1}], playerId: 1});
  const single = compileSelector({what: "spell", singleTarget: true});
  eq([single(s, one, {controller: 0}), single(s, two, {controller: 0})], [true, false], "one target: yes; two: no");
  const a = put(s, {card: "Plains", types: ["Land"]}, 0), b = put(s, {card: "Forest", types: ["Land"]}, 0), c = put(s, {card: "Grove", types: ["Land"]}, 1);
  s.objects[a].counters = {"+1/+1": 2}; s.objects[b].counters = {"+1/+1": 1}; s.objects[c].counters = {"+1/+1": 5};
  eq(amountOf(s, {countersAmong: {what: "permanent", types: ["Land"], controller: "you"}, counter: "+1/+1"}, {controller: 0, source: null}), 3, "three on his lands, not Maya's five");
  eq([missingFor({apis: ["Earthbend"]}), missingFor({apis: ["ChangeTargets"]}).length], [[], 1], "Earthbend credited; ChangeTargets not -- an ability on the stack is no target yet");
}

console.log(`engine-earthbend: ${checks} checks passed — a land a creature with haste for good, its counters, back tapped when it dies; another target a spell could have, never itself, none and nothing asked; a single target; counters among permanents.`);
