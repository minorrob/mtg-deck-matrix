/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE ETERNAL WANDERER'S PIECES: no more than one creature attacking it, a return at its owner's next end step, and a
 * creature chosen for each player.
 *
 * "No more than one creature can attack The Eternal Wanderer each combat" (CR 508.1c): the static `attackers-at-most`
 * (rules/statics.mjs, attackerCaps). The declaration's record says it (`capped`, rules/combat.mjs), the controller holds
 * every answerer to it with words that say what to do instead (controller.mjs), and both pilots keep to it.
 * "Return that card to the battlefield under its owner's control at the beginning of that player's next end step" (CR
 * 603.7): `andReturn: "owner's end step"` (script/effects/zones.mjs), a delayed trigger of that player's turn only
 * (`player`, rules/trigger.mjs). "For each player, choose a creature that player controls. Each player sacrifices all
 * creatures they control not chosen this way": a chooseCard for each player, its controller choosing, each remembered beside
 * the last (`remember: "add"`, script/resolution.mjs), and sacrificeAll `except` them. The card's scenarios play two seats;
 * this suite holds four, the refusals, the pilots and the edges.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createController} from "../game/engine/controller.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {attackerCaps} from "../game/engine/rules/statics.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {hashState} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const WAND = "The Eternal Wanderer";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (name, more = {}) => ({types: ["Creature"], subtypes: [name], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...more});
const FIX = {Bear: creature("Bear"), Ogre: creature("Ogre", {power: 3, toughness: 3}), Elf: creature("Elf", {power: 1, toughness: 1}),
  Sprite: creature("Faerie", {power: 1, toughness: 1, keywords: ["Hexproof"]})};
const play = (setup, steps, more = {}) => runScenario({name: "wanderer", setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone) => Object.values(s.objects).filter((o) => o.card === card && (zone === undefined || o.zone === zone));
/* From a main phase to this turn's declare-attackers question, everyone passing. */
function toDeclaration(s) {
  const turn = s.turn;
  for (let n = 0; n < 60 && s.awaiting?.kind !== "declare-attackers" && s.turn === turn && s.phase !== "MAIN2"; n += 1) {
    if (s.awaiting) throw new Error(`asked ${s.awaiting.kind} before the declaration`);
    if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  return s.awaiting?.kind === "declare-attackers" ? awaitingChoice(s) : null;
}
const at_ = (choice, card, pw) => choice.options.find((o) => o.cardId === card && o.planeswalkerId === pw)?.index;
const toPlayer = (choice, card, player) => choice.options.find((o) => o.cardId === card && o.defenderId === player && o.planeswalkerId === undefined)?.index;
const UUID = "00000000-0000-4000-8000-000000000001";

/* ---- no more than one creature attacks it (CR 508.1c) ---- */
{
  const s = play([at(0, "battlefield", WAND), at(1, "battlefield", "Bear", "Ogre", "Elf")], [{to: {turn: 2, phase: "MAIN1"}}]);
  const [wanderer] = named(s, WAND, "battlefield");
  const [bear] = named(s, "Bear"), [ogre] = named(s, "Ogre"), [elf] = named(s, "Elf");
  eq(attackerCaps(s), {[wanderer.id]: 1}, "the Wanderer allows one attacker");
  const choice = toDeclaration(s);
  eq([choice.capped.by, choice.capped.most], ["planeswalkerId", {[wanderer.id]: 1}], "the declaration's record says so: at most one option naming it");
  const words = choice.capped.why[wanderer.id];
  ok(/^No more than one creature can attack The Eternal Wanderer each combat\. Declare one creature at The Eternal Wanderer, and send the rest at a player or another planeswalker, or keep them home\.$/.test(words),
    `and what to do instead, naming it: ${words}`);
  /* The controller holds a board or an API pilot to it, with those words. */
  const controller = createController();
  controller.offer(choice);
  assert.throws(() => controller.answer({actionId: UUID, revision: controller.revision, kind: "answer", choiceId: choice.id, indices: [at_(choice, bear.id, wanderer.id), at_(choice, ogre.id, wanderer.id)]}),
    (error) => error.message === words, "two at the Wanderer: refused by the controller, saying what to do");
  checks += 1;
  ok(controller.answer({actionId: UUID, revision: controller.revision, kind: "answer", choiceId: choice.id,
    indices: [at_(choice, bear.id, wanderer.id), toPlayer(choice, ogre.id, 0), toPlayer(choice, elf.id, 0)]}).accepted, "one at it and two at Rob: accepted");
  /* And the rules hold it too, the state untouched by the refusal. */
  const before = hashState(s);
  assert.throws(() => resolveAwaiting(s, [at_(choice, bear.id, wanderer.id), at_(choice, elf.id, wanderer.id)]), (error) => error.message === words, "the rules refuse it the same way");
  checks += 1;
  eq([hashState(s), s.awaiting?.kind], [before, "declare-attackers"], "and nothing changed: the declaration is still asked");
  resolveAwaiting(s, [at_(choice, ogre.id, wanderer.id), toPlayer(choice, bear.id, 0)]);
  eq(s.combat.attacks.map((a) => [a.attacker, a.planeswalker ?? null]).sort(), [[bear.id, null], [ogre.id, wanderer.id]].sort(), "the Ogre attacks the Wanderer, the Bear attacks Rob");
}
{
  /* The random pilot keeps to it, whatever it draws. */
  const s = play([at(0, "battlefield", WAND), at(1, "battlefield", "Bear", "Ogre", "Elf")], [{to: {turn: 2, phase: "MAIN1"}}]);
  const choice = toDeclaration(s), [wanderer] = named(s, WAND, "battlefield");
  const pilot = randomLegalPilot(createRng("wanderer"));
  let most = 0, atIt = 0;
  for (let n = 0; n < 300; n += 1) {
    const {indices} = pilot.answer(choice);
    const here = indices.filter((i) => choice.options[i].planeswalkerId === wanderer.id).length;
    most = Math.max(most, here); atIt += here ? 1 : 0;
  }
  eq(most, 1, "300 random declarations: never more than one at the Wanderer");
  ok(atIt > 0, "and some do attack it");
}

{
  /* Rob's own declaration: his creatures can't attack his Wanderer, so his record carries no cap. */
  const s = play([at(0, "battlefield", WAND, "Bear"), at(1, "battlefield", "Elf")], [{to: {turn: 3, phase: "MAIN1"}}]);
  const choice = toDeclaration(s);
  eq([choice.options.length > 0, choice.capped], [true, undefined], "Rob attacking Maya: his own Wanderer is no defender, and his record says no cap");
  /* Two such abilities on one permanent: the lesser holds; one that says no number allows one. */
  const pw = addObject(s, {card: "Probe Walker", types: ["Planeswalker"], owner: 1, controller: 1, abilities: [
    {id: "a0", kind: "static", text: "No more than two creatures can attack this each combat.", rule: "attackers-at-most", count: 2, affects: {self: true}},
    {id: "a1", kind: "static", text: "No more than one creature can attack this each combat.", rule: "attackers-at-most", affects: {self: true}}]}, "battlefield");
  eq(attackerCaps(s)[pw], 1, "a cap of two and a cap with no number: one");
}

/* ---- four players: two Wanderers, each its own cap ---- */
{
  const s = play([at(0, "battlefield", WAND), at(2, "battlefield", WAND), at(1, "battlefield", "Bear", "Ogre", "Elf")], [{to: {turn: 2, phase: "MAIN1"}}], {seats: 4});
  const robs = named(s, WAND).find((o) => o.controller === 0), treys = named(s, WAND).find((o) => o.controller === 2);
  const [bear] = named(s, "Bear"), [ogre] = named(s, "Ogre"), [elf] = named(s, "Elf");
  const choice = toDeclaration(s);
  eq(choice.capped.most, {[robs.id]: 1, [treys.id]: 1}, "Rob's and Trey's Wanderers, one attacker each");
  resolveAwaiting(s, [at_(choice, bear.id, robs.id), at_(choice, ogre.id, treys.id), toPlayer(choice, elf.id, 3)]);
  eq(s.combat.attacks.length, 3, "one at each Wanderer and the Elf at Sam: declared");
}

/* ---- +1: back at the beginning of its OWNER's next end step (CR 603.7) ---- */
{
  /* Four seats: Rob exiles Trey's Ogre on his turn; Maya's end step passes, Trey's returns it to Trey. */
  const s = play([at(0, "battlefield", WAND), at(2, "battlefield", "Ogre")],
    [{activate: WAND, ability: "a1", targets: [[{card: "Ogre"}]]}, {resolve: true}, {to: {turn: 2, phase: "END_OF_TURN"}}], {seats: 4});
  eq([s.stack.length, named(s, "Ogre", "exile").length], [0, 1], "Rob's end step, then Maya's: nothing returns; the Ogre waits in exile");
  for (let n = 0; n < 200 && !(s.turn === 3 && s.phase === "END_OF_TURN" && s.stack.length); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []);
    else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  eq([s.turn, s.activePlayer, s.stack.length], [3, 2, 1], "at the beginning of Trey's end step, the return triggers");
  passPriority(s); passPriority(s); passPriority(s); passPriority(s);
  const [ogre] = named(s, "Ogre", "battlefield");
  eq([Boolean(ogre), ogre?.controller, ogre?.owner], [true, 2, 2], "and the Ogre is back, under Trey's control");
}
{
  /* Owner, not controller: Rob controls Maya's Bear, exiles it, and it returns at Maya's end step, to Maya. */
  const s = play([at(0, "battlefield", WAND)], [], {seats: 3});
  const bear = addObject(s, {...FIX.Bear, card: "Bear", owner: 1, controller: 0}, "battlefield");
  beginResolution(s, [{effect: "moveZone", targets: [bear], to: "exile", andReturn: "owner's end step"}], {controller: 0});
  const [trigger] = s.delayedTriggers;
  eq([trigger.at, trigger.player, trigger.controller], ["end step", 1, 0], "a card Rob controls but Maya owns returns at Maya's end step, Rob's delayed trigger");
  for (let n = 0; n < 200 && !(s.turn === 2 && s.phase === "END_OF_TURN" && s.stack.length); n += 1) {
    if (s.awaiting) resolveAwaiting(s, []);
    else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  passPriority(s); passPriority(s); passPriority(s);
  const [back] = named(s, "Bear", "battlefield");
  eq([s.turn, back?.controller], [2, 1], "at Maya's end step it returns, under her control");
  /* A token exiled ceases to exist (CR 704.5d): nothing to return. */
  const t = play([at(0, "battlefield", WAND)], [{activate: WAND, ability: "a2"}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}, {to: {turn: 3, phase: "MAIN1"}},
    {activate: WAND, ability: "a1", targets: [[{card: "Samurai"}]]}, {resolve: true}, {to: {turn: 3, phase: "MAIN2"}}]);
  eq(named(t, "Samurai").length, 0, "a Samurai token exiled is gone, and nothing comes back");
}

/* ---- -4: Rob chooses for each player, in turn order; the rest are sacrificed ---- */
{
  const s = play([at(0, "battlefield", WAND, "Elf"), at(1, "battlefield", "Bear", "Sprite"), at(2, "battlefield", "Ogre"), at(3, "battlefield")],
    [{activate: WAND, ability: "a3"}, {resolve: true}], {seats: 4});
  const asked = [];
  for (let n = 0; n < 6 && s.awaiting; n += 1) {
    const choice = awaitingChoice(s);
    asked.push([s.awaiting.player, choice.options.map((o) => o.label)]);
    resolveAwaiting(s, [choice.options.length - 1]);
  }
  eq(asked, [[0, ["Elf"]], [0, ["Bear", "Sprite"]], [0, ["Ogre"]]], "Rob is asked for each player with a creature, Rob first: Sam, with none, is not asked about");
  eq(Object.values(s.objects).filter((o) => o.zone === "battlefield" && (o.types ?? []).includes("Creature")).map((o) => o.card).sort(), ["Elf", "Ogre", "Sprite"],
    "the chosen stay -- the hexproof Sprite among them, chosen and never targeted -- and Maya's Bear is sacrificed");
  eq(named(s, "Bear", "graveyard").length, 1, "into Maya's graveyard");
}
{
  /* What a sacrifice of all spares: the creatures remembered, from the effect before it. */
  const s = play([at(0, "battlefield", "Bear", "Ogre"), at(1, "battlefield", "Elf")], []);
  const [ogre] = named(s, "Ogre");
  runEffects(s, [{effect: "sacrificeAll", who: "each", selector: {types: ["Creature"]}, except: "remembered"}], {controller: 0, remembered: [ogre.id]});
  eq(Object.values(s.objects).filter((o) => o.zone === "battlefield").map((o) => o.card), ["Ogre"], "sacrificeAll except the remembered: only the Ogre stays");
}

console.log(`engine-wanderer: ${checks} checks passed -- no more than one attacker at The Eternal Wanderer (refused with what to do, kept by the pilots, four players); the return at its owner's next end step; a creature chosen for each player, the rest sacrificed.`);
