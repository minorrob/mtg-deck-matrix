/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* UMBRA ARMOR (CR 702.89), AND WHICH EFFECT REPLACES A DESTRUCTION (CR 616.1; Treefolk Umbra, Train B X11).
 *
 * "If enchanted permanent would be destroyed, instead remove all damage marked on it and destroy this Aura": the static
 * `umbra-armor` on the Aura, read wherever a permanent would be destroyed (script/effects/zones.mjs, destructionReplaced)
 * -- a destroy effect, a board wipe, lethal damage and deathtouch (rules/sba.mjs) -- and never where it is put into a
 * graveyard otherwise (toughness 0, CR 704.5f). It is not regeneration: "can't be regenerated" does not stop it, and the
 * creature is neither tapped nor removed from combat. When two effects would replace one destruction (two such Auras, or
 * one and a regeneration shield), its controller chooses which (CR 616.1): asked before anything is destroyed, of the first
 * player in APNAP order when several have to choose, as the state-based actions are checked or a destroy resolves.
 */
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {attachTo} from "../game/engine/script/effects/permanents.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginResolution, runResolution} from "../game/engine/script/resolution.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {play, labels, choose, at, compiled, missing, keywordBuilt, index, checks, pilotsAnswer} from "./helpers/x11-keywords.mjs";

const {eq, ok, done} = checks("engine-x11-umbra-armor");
const UMBRA = "Treefolk Umbra";
const on = (s, name, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const inGraveyard = (s, seat) => s.zones.graveyard[seat].map((id) => s.objects[id].card).sort();
/* A position: each seat's battlefield, then an Umbra of its controller's attached to each Bear named, in turn (an Aura set
   on the battlefield attached to nothing would go to the graveyard at the first check, CR 704.5m). */
function board(seats, umbrasOn = []) {
  const s = play(seats.map(([seat, ...cards]) => at(seat, "battlefield", ...cards.filter((c) => c !== UMBRA))), [], {seats: Math.max(2, ...seats.map(([seat]) => seat + 1))});
  for (const host of umbrasOn) {
    const bear = host(s), seat = s.objects[bear].controller;
    attachTo(s, addObject(s, {...index.definition(UMBRA), card: UMBRA, owner: seat, controller: seat}, "battlefield"), bear);
  }
  return s;
}
const bearOf = (seat) => (s) => on(s, "Bear", seat)[0];
const ctx = {controller: 0, source: null};

{
  /* "Destroy target creature": the Umbra instead, the Bear's damage removed. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s);
  s.objects[bear].damage = 1;
  runEffect(s, {effect: "destroy", targets: [bear]}, ctx);
  ok(s.zones.battlefield.includes(bear) && s.objects[bear].damage === 0, "destroyed by an effect: the Bear stays, its damage removed");
  eq(inGraveyard(s, 0), [UMBRA], "and the Umbra is destroyed instead");
  ok(s.objects[bear].tapped !== true, "not regeneration: the Bear is not tapped");
}
{
  /* "It can't be regenerated" does not stop umbra armor -- it is not regeneration. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s);
  runEffect(s, {effect: "destroy", targets: [bear], noRegenerate: true}, ctx);
  ok(s.zones.battlefield.includes(bear) && inGraveyard(s, 0).includes(UMBRA), "\"can't be regenerated\": the Umbra still saves it");
}
{
  /* Deathtouch's damage destroys (CR 704.5h): replaced, and deathtouch's mark goes with the damage -- the next check leaves it. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s);
  Object.assign(s.objects[bear], {damage: 1, deathtouched: true});
  checkStateBasedActions(s);
  checkStateBasedActions(s);
  ok(s.zones.battlefield.includes(bear) && s.objects[bear].deathtouched === false && s.objects[bear].damage === 0, "deathtouch damage: saved, and not destroyed by the next check");
}
{
  /* Toughness 0 or less is not destruction (CR 704.5f): nothing replaces it, and the Umbra, enchanting nothing, follows. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s);
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: -4}, ctx);
  checkStateBasedActions(s);
  eq(inGraveyard(s, 0), ["Bear", UMBRA], "toughness 0: the Bear is put into the graveyard, and the Umbra after it");
}
{
  /* Indestructible: not destroyed, so nothing replaces anything -- the Umbra stays. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s);
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: 0, keywords: ["Indestructible"]}, ctx);
  s.objects[bear].damage = 9;
  checkStateBasedActions(s);
  eq([s.zones.battlefield.includes(bear), inGraveyard(s, 0)], [true, []], "an indestructible Bear with lethal damage: no destruction, and the Umbra stays");
}
{
  /* An indestructible Umbra: the Bear is saved all the same, and the Umbra stays. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s), umbra = on(s, UMBRA, 0)[0];
  runEffect(s, {effect: "pump", targets: [umbra], power: 0, toughness: 0, keywords: ["Indestructible"]}, ctx);
  runEffect(s, {effect: "destroy", targets: [bear]}, ctx);
  ok(s.zones.battlefield.includes(bear) && s.zones.battlefield.includes(umbra), "an indestructible Umbra: it is not destroyed, and the Bear is saved");
}
{
  /* A board wipe that takes the creature and the Aura together: the Umbra still saves it, and the wipe takes the Umbra. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s);
  /* The Umbra first on the battlefield, so a wipe taking the board in its order would destroy it before the Bear. */
  s.zones.battlefield = [...on(s, UMBRA, 0), ...s.zones.battlefield.filter((id) => s.objects[id].card !== UMBRA)];
  runEffect(s, {effect: "destroyAll", selector: {what: "permanent", anyOf: [{types: ["Creature"]}, {types: ["Enchantment"]}]}}, ctx);
  eq([s.zones.battlefield.includes(bear), inGraveyard(s, 0)], [true, [UMBRA]], "destroy all creatures and enchantments: the Bear survives, the Umbra is destroyed");
}

/* CR 616.1: two Umbras on one Bear, lethal damage -- Rob chooses which is destroyed. */
{
  const s = board([[0, "Bear", UMBRA, UMBRA]], [bearOf(0), bearOf(0)]);
  const bear = bearOf(0)(s), [first, second] = on(s, UMBRA, 0);
  s.objects[bear].damage = 6;
  checkStateBasedActions(s);
  eq([s.awaiting?.kind, s.awaiting?.player], ["destruction-replacement", 0], "two Umbras would replace it: its controller is asked");
  eq(labels(s), [`${UMBRA}'s umbra armor: remove all damage from Bear and destroy ${UMBRA}`, `${UMBRA}'s umbra armor: remove all damage from Bear and destroy ${UMBRA}`],
    "each Aura its own way out, said as what it does");
  const pilots = pilotsAnswer(s);
  ok(pilots.every((after) => after.awaiting === null && after.zones.battlefield.includes(bear) && after.zones.graveyard[0].length === 1), "both pilots answer it, and one Umbra goes for each answer");
  resolveAwaiting(s, [1]);
  ok(s.zones.battlefield.includes(first) && !s.zones.battlefield.includes(second) && s.zones.battlefield.includes(bear), "the second, as chosen, is destroyed; the first stays");
  ok(s.destructionAnswers === undefined && s.objects[bear].damage === 0, "the answer is used up, the damage removed");
  /* The destroyed one is still listed on the Bear until something unattaches it: the other Umbra saves it again, and then
     nothing does. */
  runEffect(s, {effect: "destroy", targets: [bear]}, ctx);
  ok(s.zones.battlefield.includes(bear) && !s.zones.battlefield.includes(first), "destroyed again: the first Umbra goes this time");
  runEffect(s, {effect: "destroy", targets: [bear]}, ctx);
  ok(!s.zones.battlefield.includes(bear), "and the third time, with no Umbra left, the Bear is destroyed");
}
{
  /* An Umbra and a regeneration shield: regenerating taps it and removes it from combat; the Umbra stays. */
  const s = board([[0, "Bear", UMBRA]], [bearOf(0)]);
  const bear = bearOf(0)(s);
  runEffect(s, {effect: "regenerate", targets: [bear]}, ctx);
  s.objects[bear].damage = 4;
  checkStateBasedActions(s);
  eq(labels(s), ["Regenerate Bear: remove all damage from it, tap it, and remove it from combat", `${UMBRA}'s umbra armor: remove all damage from Bear and destroy ${UMBRA}`],
    "a shield and an Umbra: both are offered");
  choose(s, "Regenerate Bear: remove all damage from it, tap it, and remove it from combat");
  ok(s.objects[bear].tapped === true && s.zones.battlefield.includes(on(s, UMBRA, 0)[0]) && !(s.effects ?? []).some((e) => e.rule === "regeneration"), "regenerated: tapped, the shield used, the Umbra kept");
}
{
  /* APNAP (CR 616.1): Maya's and Trey's Bears, each with two Umbras, dealt lethal damage at once on Rob's turn -- Maya first,
     though Trey's Bear is first on the battlefield. */
  const s = board([[0, "Wastes"], [2, "Bear"], [1, "Bear"]], [bearOf(1), bearOf(1), bearOf(2), bearOf(2)]);
  ok(s.objects[s.zones.battlefield.find((id) => s.objects[id].card === "Bear")].controller === 2, "Trey's Bear is the first on the battlefield");
  s.objects[bearOf(1)(s)].damage = 6;
  s.objects[bearOf(2)(s)].damage = 6;
  checkStateBasedActions(s);
  eq(s.awaiting?.player, 1, "Maya, first after Rob in turn order, is asked first");
  resolveAwaiting(s, [0]);
  eq(s.awaiting?.player, 2, "then Trey");
  resolveAwaiting(s, [0]);
  eq([s.awaiting, on(s, UMBRA, 1).length, on(s, UMBRA, 2).length, on(s, "Bear", 1).length, on(s, "Bear", 2).length], [null, 1, 1, 1, 1],
    "both Bears saved, one Umbra each gone");
}
{
  /* A destroy resolving: Rob's spell destroys Maya's doubly armored Bear -- Maya, its controller, chooses (CR 616.1). */
  const s = board([[0, "Wastes"], [1, "Bear", UMBRA, UMBRA]], [bearOf(1), bearOf(1)]);
  const bear = bearOf(1)(s), [, second] = on(s, UMBRA, 1);
  beginResolution(s, [{effect: "destroy", targets: [bear]}], {controller: 0, source: null});
  runResolution(s, createRng("x11"));
  eq([s.awaiting?.kind, s.awaiting?.effect, s.awaiting?.player], ["effect-choice", "orderDestruction", 1], "the destruction's question, Maya's");
  ok(pilotsAnswer(s).every((after) => after.awaiting === null), "both pilots answer it");
  resolveAwaiting(s, [1], null, createRng("x11"));
  ok(s.zones.battlefield.includes(bear) && !s.zones.battlefield.includes(second) && on(s, UMBRA, 1).length === 1, "her second Umbra destroyed, as she chose");
}

{
  /* A regeneration shield alone, and "it can't be regenerated": destroyed. */
  const s = board([[0, "Bear"]]);
  const bear = bearOf(0)(s);
  runEffect(s, {effect: "regenerate", targets: [bear]}, ctx);
  runEffect(s, {effect: "destroy", targets: [bear], noRegenerate: true}, ctx);
  eq(inGraveyard(s, 0), ["Bear"], "a shield, and \"can't be regenerated\": the Bear is destroyed");
}
{
  /* An Umbra that has lost its abilities (layer 6) is no shield. */
  const s = board([[0, "Bear"]], [bearOf(0)]);
  const bear = bearOf(0)(s), umbra = on(s, UMBRA, 0)[0];
  s.effects = [...(s.effects ?? []), {id: "blank", layer: 6, affects: {ids: [umbra]}, apply: {removeAllAbilities: true}, until: null, sourceController: 1}];
  runEffect(s, {effect: "destroy", targets: [bear]}, ctx);
  ok(!s.zones.battlefield.includes(bear) && s.zones.battlefield.includes(umbra), "the Umbra without its abilities: the Bear is destroyed, the Umbra not");
}
{
  /* An indestructible Bear with two Umbras and lethal damage: not destroyed, so nobody is asked. And a destroy aimed at it. */
  const s = board([[0, "Bear"]], [bearOf(0), bearOf(0)]);
  const bear = bearOf(0)(s);
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: 0, keywords: ["Indestructible"]}, ctx);
  s.objects[bear].damage = 9;
  checkStateBasedActions(s);
  eq(s.awaiting, null, "indestructible: no destruction, no question");
  beginResolution(s, [{effect: "destroy", targets: [bear]}], {controller: 1, source: null});
  runResolution(s, createRng("x11"));
  eq([s.awaiting, on(s, UMBRA, 0).length], [null, 2], "a resolving destroy of it asks nothing and takes neither Umbra");
}
{
  /* The Umbra's own regeneration shield replaces the Umbra's destruction in turn: it is tapped and stays. */
  const s = board([[0, "Bear"]], [bearOf(0)]);
  const bear = bearOf(0)(s), umbra = on(s, UMBRA, 0)[0];
  runEffect(s, {effect: "regenerate", targets: [umbra]}, ctx);
  runEffect(s, {effect: "destroy", targets: [bear]}, ctx);
  ok(s.zones.battlefield.includes(bear) && s.zones.battlefield.includes(umbra) && s.objects[umbra].tapped === true, "the Umbra, shielded, is regenerated instead: both stay");
}
{
  /* A refused answer, and a check made while another question is open: the choice is not made for Rob. */
  const s = board([[0, "Bear"]], [bearOf(0), bearOf(0)]);
  const bear = bearOf(0)(s);
  s.objects[bear].damage = 6;
  checkStateBasedActions(s);
  let refused = false;
  try { resolveAwaiting(s, [0, 1]); } catch (error) { refused = /Choose the one effect/.test(error.message); }
  ok(refused && s.awaiting?.kind === "destruction-replacement", "two answers to a one-answer question are refused, and the question stays");
  const open = {kind: "declare-blockers", player: 1};
  s.awaiting = open;
  checkStateBasedActions(s);
  ok(s.awaiting === open && s.zones.battlefield.includes(bear) && on(s, UMBRA, 0).length === 2, "another question open: the Bear waits, both Umbras on it, and nothing chooses for Rob");
  s.awaiting = null;
  checkStateBasedActions(s);
  eq(s.awaiting?.kind, "destruction-replacement", "the next check asks him");
}
ok(compiled([{kind: "static", text: "Umbra armor", rule: "umbra-armor", affects: {what: "permanent", self: true}}], {types: ["Enchantment"], subtypes: ["Aura"]}).problems.length === 0,
  "the static rule umbra-armor is one a script may name (rules/statics.mjs)");

/* The card and its compiler. */
const notAura = compiled([{kind: "keyword", text: "Umbra armor", keyword: "umbra armor"}]);
ok(notAura.problems.some((p) => p.includes("umbra armor on a card that is not an Aura")), "umbra armor on a creature is refused");
eq(index.definition(UMBRA).keywords, ["Umbra armor"], "the Aura's keyword");
ok(keywordBuilt("Umbra armor"), "Umbra armor is built (keywords/combat.mjs, the protective family)");
eq(missing(UMBRA), [], `${UMBRA} needs nothing the engine lacks`);
ok(index.resolve(UMBRA)?.playable === true, `${UMBRA} is defined and playable`);

done("umbra armor wherever a permanent would be destroyed, and not otherwise; the choice between two ways out, its controller's, in APNAP order, answered by both pilots.");
