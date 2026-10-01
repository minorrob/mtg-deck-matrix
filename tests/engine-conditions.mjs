/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 11 (THE CATALOG'S ORDER): A CONDITION ON AN ABILITY (game/engine/script/condition.mjs).
 *
 * "Activate only if you control a Swamp" (CR 602.5b) is asked as the ability would be offered, and not again. An
 * intervening "if" (CR 603.4) is asked as the event happens -- false, and nothing triggers -- and again as the ability
 * resolves -- false then, and it does nothing (it is not countered). The beginning of any step can trigger, and is about
 * the player whose turn it is ("that player draws an additional card"). The grammar is closed at the schema.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color, extra = {}) => ({card: name, types: ["Land"], supertypes: ["Basic"], subtypes: color === "C" ? [] : [name], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}], ...extra});
const WASTES = land("Wastes", "C"), SWAMP = land("Swamp", "B");
const creature = (name, power, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});

const pod = {matchId: "m", seed: "conditions", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const manaOffers = (s, name) => legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === name).map((a) => a.mana);
const hand = (s, seat = 0) => projectFor(s, seat).players[seat].zones.Hand.count;
const resolve = (s) => { passPriority(s); return passPriority(s); };
const ctx = (controller = 0, source = null) => ({controller, source});
/* On until `until` holds: passing, moving on, and answering the routine questions (nobody attacks or blocks). */
function run(s, until) {
  for (let n = 0; n < 300 && !until(s); n += 1) {
    if (s.awaiting) {
      const kind = s.awaiting.kind;
      if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else if (kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else break;
      continue;
    }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
}

/* ---- the grammar ---- */
{
  const s = table();
  const mine = on(s, creature("Bear", 2), 0);
  on(s, creature("Big", 5), 1);
  main(s);
  eq([conditionHolds(s, {present: {types: ["Creature"], controller: "you", power: {min: 4}}}, ctx()), conditionHolds(s, {present: {types: ["Creature"], controller: "opponent", power: {min: 4}}}, ctx())],
    [false, true], "\"you control a creature with power 4 or greater\": not Rob, who has a 2/2; Maya, who has a 5/5");
  eq([conditionHolds(s, {present: {types: ["Creature"]}, atLeast: 2}, ctx()), conditionHolds(s, {present: {types: ["Creature"]}, atLeast: 3}, ctx())], [true, false], "atLeast counts what matches");
  eq(conditionHolds(s, {present: {controller: "you", anyOf: [{types: ["Artifact"]}, {types: ["Creature"]}]}}, ctx()), true, "a choice of selectors: an artifact or a creature");
  s.objects[mine].tapped = true;
  eq([conditionHolds(s, {present: {self: true, tapped: false}}, ctx(0, mine)), conditionHolds(s, {present: {self: true, tapped: true}}, ctx(0, mine))], [false, true], "\"if this is untapped\": the source itself");
  eq(conditionHolds(s, undefined, ctx()), true, "no condition holds");
  ok(conditionProblems({present: {types: ["Creature"]}, perhaps: true}).some((p) => /no key "perhaps"/.test(p)), "an unknown key is refused");
  ok(conditionProblems({present: {kinds: ["Creature"]}}).some((p) => /selector grammar has no key "kinds"/.test(p)), "what it looks for is held to the selector grammar");
  ok(conditionProblems({present: {}, atLeast: 0}).some((p) => /atLeast/.test(p)), "atLeast is 1 or more");
  const script = {schema: "CrankCardScript@1", identity: {name: "T", oracleId: "t", types: ["Land"]},
    abilities: [{kind: "activated", text: "{T}: Draw.", cost: [{atom: "{T}"}], effects: [{effect: "draw", count: 1}], condition: {presnt: {}}}]};
  ok(!validateScript(script).valid, "and the schema refuses a card that misspells one");
}

/* ---- "activate only if" (CR 602.5b) ---- */
{
  const s = table();
  on(s, card("Tainted Wood"), 0);
  main(s);
  eq(manaOffers(s, "Tainted Wood"), [{C: 1}], "Tainted Wood without a Swamp: {C} only");
  on(s, SWAMP, 0);
  eq(manaOffers(s, "Tainted Wood"), [{C: 1}, {B: 1}, {G: 1}], "with a Swamp: {B} or {G} as well");
}
{
  /* Asked as it is activated, and not again: the big creature gone in response, Bonders' Enclave still draws. */
  const s = table();
  on(s, card("Bonders' Enclave"), 0);
  for (let i = 0; i < 3; i += 1) on(s, WASTES, 0);
  const big = on(s, creature("Big", 5), 0);
  main(s);
  for (let i = 0; i < 3; i += 1) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === "Wastes"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Bonders' Enclave"));
  s.objects[big].power = 1; s.objects[big].toughness = 1;
  resolve(s);
  eq(hand(s), 1, "\"activate only if\" is a restriction on activating (CR 602.5b): once activated, it resolves whatever happens");
}

/* ---- the intervening "if" (CR 603.4) ---- */
{
  /* False as the event happens: nothing triggers. */
  const s = table();
  on(s, card("Colossal Majesty"), 0);
  on(s, creature("Bear", 2), 0);
  main(s);
  run(s, (s) => s.turn === 3 && s.phase === "UPKEEP");
  eq([s.stack.length, (s.pendingTriggers ?? []).length], [0, 0], "Colossal Majesty with only a 2/2: at the beginning of Rob's upkeep it does not trigger at all");
}
{
  /* True as it triggers, false as it resolves: it does nothing, and is not countered. */
  const s = table();
  const majesty = on(s, card("Colossal Majesty"), 0);
  const big = on(s, creature("Big", 5), 0);
  main(s);
  run(s, (s) => s.turn === 3 && s.phase === "UPKEEP" && s.stack.length);
  eq(s.stack.map((e) => e.name), ["Colossal Majesty"], "with a 5/5 it triggers");
  const before = hand(s);
  s.objects[big].power = 3;
  const events = [...passPriority(s).events, ...passPriority(s).events];
  eq([hand(s), s.stack.length], [before, 0], "the 5/5 shrunk to 3 power before it resolves: asked again, false, and it draws nothing");
  ok(events.some((e) => e.kind === "GameEventSpellResolved" && e.data.fields.hasFizzled === false && e.data.fields.card?.cardId === majesty),
    "it leaves the stack resolving -- doing nothing -- not countered for want of a target");
}
{
  /* A step's beginning is about the player whose turn it is: Howling Mine draws for Maya in her draw step. */
  const s = table();
  const mine = on(s, card("Howling Mine"), 0);
  main(s);
  const before = hand(s, 1);
  run(s, (s) => s.turn === 2 && s.phase === "MAIN1" && s.priorityPlayer !== null && !s.stack.length);
  eq(hand(s, 1) - before, 2, "Maya's draw step: her draw, and the Mine's extra card -- for her, not for Rob, who controls it");
  void mine;
}
{
  const s = table();
  const mine = on(s, card("Howling Mine"), 0);
  main(s);
  s.objects[mine].tapped = true;
  const before = hand(s, 1);
  run(s, (s) => s.turn === 2 && s.phase === "MAIN1" && s.priorityPlayer !== null && !s.stack.length);
  eq(hand(s, 1) - before, 1, "tapped (\"if this artifact is untapped\"), it does not trigger: Maya draws her one card");
}
{
  /* "Whenever an opponent draws a card, if you control a red permanent": Rob's own permanents, read as it happens. */
  const s = table();
  const parasite = on(s, card("Kederekt Parasite"), 0);
  main(s);
  collectTriggers(s, [{kind: "GameEventCardChangeZone", data: {turn: 1, phase: "MAIN1", fields: {card: {cardId: 999, name: "X"}, from: {zoneType: "Library"}, to: {zoneType: "Hand", player: {playerId: 1}}, drawn: true}}}]);
  eq((s.pendingTriggers ?? []).length, 0, "no red permanent of Rob's: Maya's draw triggers nothing");
  on(s, {card: "Red Rock", types: ["Artifact"], colors: ["R"]}, 0);
  collectTriggers(s, [{kind: "GameEventCardChangeZone", data: {turn: 1, phase: "MAIN1", fields: {card: {cardId: 999, name: "X"}, from: {zoneType: "Library"}, to: {zoneType: "Hand", player: {playerId: 1}}, drawn: true}}}]);
  eq((s.pendingTriggers ?? []).map((t) => t.about?.player), [1], "with one, it triggers, about the player who drew");
  void parasite; void openTriggers;
}

/* ---- the keyword selector, and a cost capped ---- */
{
  const words = (creatures, lands) => {
    const s = table();
    on(s, card("Winged Words"), 0, "hand");
    for (const l of lands) on(s, l, 0);
    for (const c of creatures) on(s, c, 0);
    main(s);
    for (const l of lands) applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === l.card));
    return legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Winged Words").length;
  };
  const bird = creature("Bird", 1, {keywords: ["Flying"]}), bat = creature("Bat", 1, {keywords: ["Flying"]}), bear = creature("Bear", 2);
  eq(words([bird, bat], [land("Island", "U"), WASTES]), 1, "with a flyer it costs {1}{U}: two mana cast it");
  eq(words([bird, bat], [land("Island", "U")]), 0, "two flyers make it {1} less, not {2}: one mana does not");
  eq(words([bear], [land("Island", "U"), WASTES]), 0, "a creature without flying is no help (\"a creature with flying\", keywords through the layers)");
}
{
  /* "If you have no cards in hand" -- the older condition, the same rule. */
  const s = table();
  main(s);
  eq([conditionHolds(s, {handEmpty: true}, ctx()), conditionHolds(s, {handEmpty: false}, ctx())], [true, false], "an empty hand: handEmpty holds");
  on(s, creature("Bear", 2), 0, "hand");
  eq([conditionHolds(s, {handEmpty: true}, ctx()), conditionHolds(s, {handEmpty: false}, ctx())], [false, true], "a card in it: it does not");
}

/* ---- the beginning of any step ---- */
{
  const s = table();
  const script = {schema: "CrankCardScript@1", identity: {name: "Bugle", oracleId: "b", types: ["Artifact"], manaCost: "{1}"},
    abilities: [{kind: "triggered", text: "At the beginning of combat on your turn, you gain 1 life.", trigger: {on: "step", step: "COMBAT_BEGIN"}, effects: [{effect: "gainLife", amount: 1}]}]};
  ok(validateScript(script).valid, "\"at the beginning of combat on your turn\" is a step trigger the schema accepts");
  on(s, {card: "Bugle", types: ["Artifact"], abilities: [{id: "a0", kind: "triggered", text: "x", trigger: {on: "GameEventTurnPhase", phase: "COMBAT_BEGIN", yourTurn: true}, effects: [{effect: "gainLife", amount: 1}]}]}, 0);
  main(s);
  run(s, (s) => s.phase === "COMBAT_BEGIN" && s.stack.length);
  eq(s.stack.map((e) => e.name), ["Bugle"], "and it triggers as combat begins");
}

console.log(`engine-conditions: ${checks} checks passed — "activate only if" asked as offered and not again; an intervening "if" asked as it triggers and as it resolves; the beginning of any step, about whose turn it is.`);
