/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A MODAL TRIGGERED ABILITY, ITS MODES CHOSEN AS IT IS PUT ON THE STACK (the plan's X5, D5 Shadrix Aristocrats: its
 * commander, Shadrix Silverquill; X5j).
 *
 * "At the beginning of combat on your turn, you may choose two. Each mode must target a different player." A triggered
 * ability's modes are announced as it is put on the stack (CR 603.3c, 700.2b), with their targets; a mode with no legal
 * target can't be chosen, none twice (700.2d), and if none is chosen the ability is removed from the stack. Until now a
 * modal effect in a trigger was asked as it resolved, and a mode's targets had nowhere to go. A trigger whose one effect
 * is a modal with targets in its modes now carries them to the stack (cards/index.mjs, rules/stack.mjs), and its
 * controller picks one way -- modes and targets together, "Inkling → Maya; draws a card → Rob" -- or none
 * (rules/trigger.mjs). What resolves is the chosen modes' script, its targets checked again (CR 608.2b).
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, {}).state;
const SH = "Shadrix Silverquill";
const INK = "Target player creates a 2/1 white and black Inkling creature token with flying.";
const DRAW = "Target player draws a card and loses 1 life.";

{
  /* Two seats: three pairs of modes, each with two ways to give them to two different players; and none. */
  const s = play("two seats", [at(0, "battlefield", SH)], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}]);
  const q = awaitingChoice(s);
  eq([q.id.startsWith("trigger-targets:"), q.mode, q.options.length], [true, "one", 7], "as it goes on the stack: 3 pairs of modes x 2 ways to aim them, and \"Choose none\"");
  ok(q.options.filter((o) => !o.none).every((o) => new Set(o.targets.map((t) => t.id)).size === o.targets.length), "each mode targets a different player: never one twice");
  ok(q.options.some((o) => o.label === `${INK} → Maya; ${DRAW} → Rob`), "said in the card's words, each mode with its target");
  eq(q.options.at(-1).label, "Choose none", "and he may choose none");
  eq([s.stack.length, s.stack[0]?.stage], [1, "targeting"], "the trigger is on the stack, waiting for its modes");
}
{
  const s = play("three seats", [at(0, "battlefield", SH)], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}], {seats: 3});
  eq(awaitingChoice(s).options.length, 3 * 6 + 1, "three seats: 3 pairs x 6 ways to give two different players, and none");
}
{
  /* A mode with no legal target can't be chosen (CR 603.3c): Maya has hexproof (Crystal Barricade). With three seats the
     pairs go to Rob and Trey; with two there is no way to give two modes different players, so none is chosen and the
     ability is removed from the stack, nothing asked. */
  const three = play("hexproof, three seats", [at(0, "battlefield", SH), at(1, "battlefield", "Crystal Barricade")], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}], {seats: 3});
  const q = awaitingChoice(three);
  eq([q.options.length, q.options.some((o) => (o.targets ?? []).some((t) => t.id === 1))], [3 * 2 + 1, false], "Maya can't be a mode's target: Rob and Trey's 3 pairs x 2, and none");
  const two = play("hexproof, two seats", [at(0, "battlefield", SH), at(1, "battlefield", "Crystal Barricade")], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}]);
  eq([two.awaiting, two.stack.length], [null, 0], "two seats: no two different players to aim at, so it is removed, nothing asked");
}
{
  const s = play("Maya's turn", [{...at(0, "battlefield", SH), sick: true}], [{to: {turn: 2, phase: "COMBAT_BEGIN"}}], {at: {turn: 2, phase: "UPKEEP"}});
  eq([s.awaiting?.kind ?? null, s.stack.length], [null, 0], "\"on your turn\": at Maya's combat it does not trigger");
}
{
  const s = play("none", [at(0, "battlefield", SH)], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Choose none"]}]);
  eq([s.stack.length, s.awaiting], [0, null], "none chosen: it is removed from the stack (CR 603.3c)");
}
{
  /* The chosen modes resolve with their targets checked again: Trey leaves the game before it resolves, so his mode does
     nothing (CR 608.2b), and Rob's still happens. */
  const s = play("a target gone", [at(0, "battlefield", SH)], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: [`${INK} → Trey; ${DRAW} → Rob`]}], {seats: 3});
  eq([s.stack[0]?.modes, s.stack[0]?.targets?.map((t) => t.id)], [[0, 1], [2, 0]], "the modes and targets chosen are the stack entry's");
  concede(s, 2);
  for (let n = 0; n < 6 && s.stack.length; n += 1) passPriority(s);
  eq([s.players[0].life, Object.values(s.objects).filter((o) => o.card === "Inkling").length], [39, 0], "Trey gone: no Inkling; Rob draws and loses 1 life");
}
{
  /* The house pilot answers with a legal way. */
  const s = play("the pilot", [at(0, "battlefield", SH)], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}]);
  const q = awaitingChoice(s);
  const answer = housePilot({seat: 0, cards: (name) => index.definition(name)}).answer(projectFor(s, 0), q);
  ok(answer.indices.length === 1 && q.options[answer.indices[0]] !== undefined, "the house pilot picks one of the ways");
  resolveAwaiting(s, answer.indices);
  ok(s.awaiting === null, "and the trigger is aimed");
}
{
  const script = (effect, more = {}) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Creature"], manaCost: "{W}", power: 1, toughness: 1},
    oracleText: "At the beginning of your upkeep, choose one.", source: "hand", abilities: [{kind: "triggered", text: "At the beginning of your upkeep, choose one.", trigger: {on: "upkeep"}, effects: [effect], ...more}]});
  const MODES = [{text: "Target player draws a card.", targets: [{what: "player"}], effects: [{effect: "draw", count: 1, who: {target: 0}}]}, {text: "You gain 2 life.", targets: [], effects: [{effect: "gainLife", amount: 2}]}];
  const compiled = compileScript(script({effect: "modal", choose: 1, modes: MODES}));
  eq([compiled.problems, Boolean(compiled.definition.abilities[0].modal), compiled.definition.abilities[0].effects], [[], true, []], "a trigger whose one effect is a modal with a targeted mode carries its modes");
  ok(compileScript(script({effect: "modal", choose: 1, modes: MODES}, {optional: true})).problems.length > 0, "\"you may\" on it is mayChooseNone, refused as optional");
  ok(compileScript(script({effect: "modal", choose: 1, modes: [{...MODES[0], targets: [{what: "player", count: {max: 2}}]}, MODES[1]]})).problems.length > 0, "a counted target in a mode is not built, and refused");
}
ok(index.resolve(SH)?.playable === true, `${SH} is defined and playable`);

console.log(`engine-modal-triggers: ${checks} checks passed -- a modal trigger's modes and their targets chosen as it goes on the stack, a different player for each, none twice, or none and it is gone; what resolves is the chosen modes', their targets checked again.`);
