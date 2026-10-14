/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, PHASE 2 (w2c-hands-triggers): A DELAYED TRIGGERED MANA ABILITY (CR 603.7, 605.1b).
 *
 * Molten Tide (Pyre Rhymer's prepared spell): "until end of turn, whenever you tap a Mountain for mana, add an additional
 * {R}". A delayed trigger that waits on a mana ability and adds a fixed mana, with no target, is a mana ability itself
 * (cards/index.mjs marks it `manaAbility`): what it adds is added with the mana ability that triggered it, never put on the
 * stack (rules/trigger.mjs, manaTriggered), for as long as it lasts. What the scenarios cannot reach: the compiled mark and
 * when it is not one, nothing on the stack, a Forest, two of them, whose mana, and its end.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const RHYMER = "Pyre Rhymer // Molten Tide";
const basic = (name, color) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes: [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const MOUNTAIN = basic("Mountain", "R"), FOREST = basic("Forest", "G");
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
function table() {
  const s = createState({matchId: "m", seed: "delayed-mana", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
/* Molten Tide's effect, made as it would be as the spell resolves, and read past (CR 603.7a). */
const tide = cards.definition(RHYMER).preparation.spell.effects[0];
function resolveTide(s, controller = 0) {
  collectTriggers(s, runEffects(s, [tide], {controller, source: null}));
}
const tap = (s, seat, id) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.objectId === id));

{
  /* Compiled: the delayed trigger is a mana ability -- {R}, on a Mountain you tap. */
  eq([tide.effect, tide.on?.on, tide.on?.tapper, tide.on?.manaAbility], ["delayedTrigger", "GameEventManaPool", "you", {mana: {R: 1}}], "Molten Tide's: a delayed triggered mana ability");
  /* Not one: "until end of turn, whenever you tap a land for mana, you lose 1 life" waits like any delayed trigger. */
  const script = {schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"]},
    oracleText: "Odd.", abilities: [{kind: "spell", text: "Odd.", targets: [], effects: [{effect: "delayedTrigger", when: {on: "tapped for mana", tapper: "you", filter: {types: ["Land"]}}, thisTurn: true,
      text: "Odd.", effects: [{effect: "loseLife", amount: 1}]}]}]};
  eq(compileScript(script).definition.spell.effects[0].on.manaAbility, undefined, "losing life is no mana ability");
  /* Nor -- for this engine, which adds only a fixed mana at once -- one of any color, one counted, one that does more, or one
     that waits on anything but a mana ability: each waits like any delayed trigger. */
  const marked = (when, effects) => compileScript({...script, abilities: [{...script.abilities[0], effects: [{effect: "delayedTrigger", when, thisTurn: true, text: "Odd.", effects}]}]})
    .definition.spell.effects[0].on.manaAbility;
  const TAP = {on: "tapped for mana", tapper: "you", filter: {types: ["Land"]}};
  eq([marked(TAP, [{effect: "addMana", anyColor: true}]), marked(TAP, [{effect: "addMana", mana: {R: {count: {what: "permanent", types: ["Land"], controller: "you"}}}}]),
    marked(TAP, [{effect: "addMana", mana: {R: 1}}, {effect: "loseLife", amount: 1}]), marked({on: "dies", who: "any"}, [{effect: "addMana", mana: {R: 1}}]), marked(TAP, [{effect: "addMana", mana: {}}]),
    marked(TAP, [{effect: "addMana", mana: {R: 1}}])],
  [undefined, undefined, undefined, undefined, undefined, {mana: {R: 1}}], "only a fixed mana, alone, on a mana ability");
}
{
  /* "Until end of turn, whenever an opponent taps a land for mana, add {C}": the mana its controller's, not the tapper's. */
  const s = table();
  const hers = on(s, MOUNTAIN, 1);
  collectTriggers(s, runEffects(s, [{effect: "delayedTrigger", on: {on: "GameEventManaPool", tapper: "opponent", filter: {types: ["Land"]}, manaAbility: {mana: {C: 1}}}, thisTurn: true, text: "Odd.",
    effects: [{effect: "addMana", mana: {C: 1}}]}], {controller: 0, source: null}));
  s.priorityPlayer = 1;
  tap(s, 1, hers);
  eq([s.players[1].manaPool.R, s.players[1].manaPool.C ?? 0, s.players[0].manaPool.C], [1, 0, 1], "Maya taps: her red; Rob, its controller, the {C}");
}
{
  /* Rob's Mountain: {R}{R} at once, nothing on the stack and nothing waiting; his Forest, {G} alone. */
  const s = table();
  const mountain = on(s, MOUNTAIN, 0), forest = on(s, FOREST, 0);
  resolveTide(s);
  tap(s, 0, mountain);
  eq([s.players[0].manaPool.R, s.stack.length, (s.pendingTriggers ?? []).length], [2, 0, 0], "a Mountain: two red, off the stack");
  tap(s, 0, forest);
  eq(s.players[0].manaPool.G, 1, "a Forest: no more than its own");
}
{
  /* Maya's Mountain: not his to tap -- her {R} alone; and two Tides of his, {R}{R}{R}. */
  const s = table();
  const mine = on(s, MOUNTAIN, 0), hers = on(s, MOUNTAIN, 1);
  resolveTide(s); resolveTide(s);
  s.priorityPlayer = 1;
  tap(s, 1, hers);
  s.priorityPlayer = 0;
  eq([s.players[1].manaPool.R, s.players[0].manaPool.R], [1, 0], "hers: her one red, none of it his");
  tap(s, 0, mine);
  eq(s.players[0].manaPool.R, 3, "two Tides: two more");
}
{
  /* Maya's own Tide: for her Mountains, and the mana hers. */
  const s = table();
  const hers = on(s, MOUNTAIN, 1);
  resolveTide(s, 1);
  s.priorityPlayer = 1;
  tap(s, 1, hers);
  eq([s.players[1].manaPool.R, s.players[0].manaPool.R], [2, 0], "her Tide, her Mountain: two red, hers");
}
{
  /* Until end of turn: gone at the cleanup, and the next turn's Mountain adds its one. */
  const s = table();
  on(s, MOUNTAIN, 0);
  resolveTide(s);
  for (let n = 0; n < 400 && s.turn < 3; n += 1) advance(s);
  eq((s.delayedTriggers ?? []).length, 0, "the turn over: no Tide left");
}

console.log(`engine-delayed-mana: ${checks} checks passed -- a delayed trigger that waits on a mana ability and adds mana is a mana ability, added at once and never on the stack, for its controller's taps of what it names, until it ends.`);
