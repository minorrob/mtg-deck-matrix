/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CONVOKE (CR 702.51), FOR ROB'S PRIORITY LIST: WHAT THE CARDS' SCENARIOS CANNOT REACH.
 *
 * "Each creature you tap while casting this spell pays for {1} or one mana of that creature's color." Not an additional or
 * alternative cost (CR 702.51b): it pays part of the total cost -- a commander's tax among it -- and the pool pays the
 * rest. A convoke spell is offered, beside the cast the pool pays alone, when the pool and its caster's untapped creatures
 * could pay it together (rules/actions.mjs); once that offer is taken, the caster picks the creatures (`choose-cost`), a
 * summoning-sick one among them, since tapping it is not its own {T} (CR 302.6). Picks that cannot pay, or that leave the
 * pool more than one way to pay the rest, are refused with what to do instead, and nothing is tapped or moved: which
 * mana stays in the pool is the caster's to decide (the plan's X8b, the payment question), never the engine's. A spell
 * with {X} is not convoked (named).
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {recordCommanderCast} from "../game/engine/rules/commander.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const sick = (seat, zone, ...cards) => ({seat, zone, cards, sick: true});
const creature = (subtype, colors, more = {}) => ({types: ["Creature"], subtypes: [subtype], manaCost: "{1}", colors, power: 2, toughness: 2, ...more});
const FIX = {"White Pal": creature("Human", ["W"]), Bear: creature("Bear", ["G"]), Wolf: creature("Wolf", ["G"]), Elk: creature("Elk", ["G"]), Cat: creature("Cat", ["G"]),
  Lynx: creature("Cat", ["G"]),
  /* A legendary creature with convoke, to be a commander, and a sorcery with {X} and convoke. */
  "Convoke Lord": {types: ["Creature"], subtypes: ["Elf"], supertypes: ["Legendary"], manaCost: "{3}{G}", colors: ["G"], power: 3, toughness: 3, keywords: ["Convoke"]},
  "X Convoke": {types: ["Sorcery"], manaCost: "{X}{G}", colors: ["G"], keywords: ["Convoke"], spell: {id: "s", text: "Draw X cards.", targets: [], effects: [{effect: "draw", count: "X"}]}}};
const play = (name, setup, steps = []) => runScenario({name, setup, steps}, index.definition, FIX).state;
const named = (s, card) => Object.values(s.objects).filter((o) => o.card === card && o.zone === "battlefield").map((o) => o.id);
const offers = (s, card) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId]?.card === card);
const convokeOffer = (s, card) => offers(s, card).find((a) => a.convoke === true);
const pick = (s, labels) => { const c = awaitingChoice(s); return labels.map((l) => c.options.find((o) => o.label === l).index); };
const tapped = (s, card) => s.objects[named(s, card)[0]].tapped === true;

/* ---- the question ---- */
{
  /* Sun-Dappled Celebrant ({4}{W}{W}) with two Plains tapped: Rob's untapped creatures, the sick one too, and not the tapped
     Elk or Maya's Lynx -- at least one, since the pool cannot pay it all, and at most all four. */
  const s = play("the question", [at(0, "battlefield", "Plains", "Plains", "Bear", "Wolf", "Cat", "Elk"), sick(0, "battlefield", "White Pal"), at(0, "hand", "Sun-Dappled Celebrant"),
    at(1, "battlefield", "Lynx")], [{tap: "Plains"}, {tap: "Plains"}]);
  s.objects[named(s, "Elk")[0]].tapped = true;
  const offer = convokeOffer(s, "Sun-Dappled Celebrant");
  ok(offer && offers(s, "Sun-Dappled Celebrant").length === 1, "with two Plains, only the convoke offer: the pool alone cannot pay it");
  applyAction(s, 0, offer);
  const choice = awaitingChoice(s);
  eq([s.awaiting.kind, choice.cost, choice.options.map((o) => o.label).sort(), choice.min, choice.max], ["choose-cost", "convoke", ["Bear", "Cat", "White Pal", "Wolf"], 1, 4],
    "Rob picks among Rob's untapped creatures, summoning-sick or not: one to four of them");
  eq([Object.values(s.objects).some((o) => o.card === "Sun-Dappled Celebrant" && o.zone === "hand"), s.stack.length, s.players[0].manaPool.W], [true, 0, 2],
    "and nothing has moved or been paid while it asks");
}
{
  /* With the pool able to pay all of it, the convoke offer asks for none at least. */
  const s = play("none needed", [at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Bear"), at(0, "hand", "Sun-Dappled Celebrant")],
    [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}]);
  eq(offers(s, "Sun-Dappled Celebrant").length, 2, "both offers: the pool alone, and convoked");
  /* The table says which is which (room/room.mjs). */
  const words = offerDetails(s, 0, offers(s, "Sun-Dappled Celebrant"));
  eq(words.map((w) => w.includes("convoking, tapping creatures you choose")), [false, true], "the table words the convoke offer, and only it");
  applyAction(s, 0, convokeOffer(s, "Sun-Dappled Celebrant"));
  eq([awaitingChoice(s).min, awaitingChoice(s).max], [0, 1], "convoked, it may tap none");
  resolveAwaiting(s, pick(s, ["Bear"]));
  eq([s.stack.length, tapped(s, "Bear"), s.players[0].manaPool.C], [1, true, 1], "the Bear paid {1}: one Wastes' {C} stays in the pool");
}

/* ---- refused, with what to do instead; nothing tapped or moved ---- */
{
  /* Appeal to Eirdu ({3}{W}) with the Plains' {W}: two creatures leave {1} unpaid. */
  const s = play("too few", [at(0, "battlefield", "Plains", "Bear", "Wolf", "Elk"), at(0, "hand", "Appeal to Eirdu")], [{tap: "Plains"}]);
  const offer = convokeOffer(s, "Appeal to Eirdu");
  applyAction(s, 0, {...offer, targets: [[{kind: "object", id: named(s, "Bear")[0]}]]});
  assert.throws(() => resolveAwaiting(s, pick(s, ["Bear", "Wolf"])), /cannot pay for Appeal to Eirdu: each creature pays \{1\} or one mana of its color/); checks += 1;
  eq([tapped(s, "Bear"), tapped(s, "Wolf"), s.stack.length, s.players[0].manaPool.W, s.awaiting, s.priorityPlayer], [false, false, 0, 1, null, 0],
    "nothing tapped, nothing cast, the {W} still in the pool, and Rob holds priority again");
}
{
  /* {W} and {U} in the pool and the white creature among three: it could pay the {W} (and the pool {1} with either) or {1}
     (and the pool the {W}) -- which mana stays is Rob's to say, which the engine does not ask yet, so it is refused. */
  const s = play("ambiguous", [at(0, "battlefield", "Plains", "Island", "White Pal", "Bear", "Wolf"), at(0, "hand", "Appeal to Eirdu")], [{tap: "Plains"}, {tap: "Island"}]);
  applyAction(s, 0, {...convokeOffer(s, "Appeal to Eirdu"), targets: [[{kind: "object", id: named(s, "Bear")[0]}]]});
  assert.throws(() => resolveAwaiting(s, pick(s, ["White Pal", "Bear", "Wolf"])), /could pay the rest of Appeal to Eirdu more than one way/); checks += 1;
  eq([tapped(s, "White Pal"), s.stack.length], [false, 0], "refused before anything is tapped");
}
{
  /* A creature pays {1} or one mana of its OWN color: Sun-Dappled Celebrant ({4}{W}{W}) is offered -- the white creature and
     the Plains' {W} could pay {W}{W} -- but five green creatures with the {W} cannot: the fifth has nothing left it may pay. */
  const s = play("colors", [at(0, "battlefield", "Plains", "White Pal", "Bear", "Wolf", "Elk", "Cat", "Lynx"), at(0, "hand", "Sun-Dappled Celebrant")], [{tap: "Plains"}]);
  applyAction(s, 0, convokeOffer(s, "Sun-Dappled Celebrant"));
  assert.throws(() => resolveAwaiting(s, pick(s, ["Bear", "Wolf", "Elk", "Cat", "Lynx"])), /cannot pay for Sun-Dappled Celebrant/); checks += 1;
  applyAction(s, 0, convokeOffer(s, "Sun-Dappled Celebrant"));
  resolveAwaiting(s, pick(s, ["White Pal", "Bear", "Wolf", "Elk", "Cat"]));
  eq([s.stack.length, s.players[0].manaPool.W, tapped(s, "Lynx")], [1, 0, false], "with the white one among them it is cast, and the Lynx stays untapped");
}
{
  /* Named outright, a creature Rob does not control is refused too. */
  const s = play("not Rob's", [at(0, "battlefield", "Plains", "Bear", "Wolf", "Elk"), at(0, "hand", "Appeal to Eirdu"), at(1, "battlefield", "Wolf")], [{tap: "Plains"}]);
  const offer = {...convokeOffer(s, "Appeal to Eirdu"), targets: [[{kind: "object", id: named(s, "Bear")[0]}]]};
  const mayas = Object.values(s.objects).find((o) => o.card === "Wolf" && o.controller === 1).id;
  assert.throws(() => applyAction(s, 0, {...offer, convokeTap: [named(s, "Bear")[0], named(s, "Elk")[0], mayas]}), /not untapped creatures you control/); checks += 1;
}

/* ---- a commander's tax is part of the total cost ---- */
{
  /* Convoke Lord ({3}{G}) from the command zone, cast once before: {2} more. A Forest and five creatures pay {5}{G}. */
  const s = play("tax", [at(0, "command", "Convoke Lord"), at(0, "battlefield", "Forest", "Bear", "Wolf", "Elk", "White Pal"), sick(0, "battlefield", "Bear")], [{tap: "Forest"}]);
  const lord = Object.values(s.objects).find((o) => o.card === "Convoke Lord").id;
  recordCommanderCast(s, 0, lord);
  const offer = convokeOffer(s, "Convoke Lord");
  ok(offer, "with its tax of {2}, the Forest and five creatures can pay it");
  applyAction(s, 0, offer);
  eq(awaitingChoice(s).max, 5, "five creatures may help: {3} and its {2} of tax");
  const all = awaitingChoice(s).options.map((o) => o.index);
  resolveAwaiting(s, all);
  eq([s.stack.length, s.objects[s.stack[0].objectId].card], [1, "Convoke Lord"], "cast, its tax paid by creatures");
}

/* ---- the house pilot never convokes ---- */
{
  /* Only the convoke offer casts Sun-Dappled Celebrant here: the pilot leaves it, as it plays what the pool or its lands pay. */
  const s = play("pilot", [at(0, "battlefield", "Plains", "Plains", "Bear", "Wolf", "Cat", "Elk"), at(0, "hand", "Sun-Dappled Celebrant")], [{tap: "Plains"}, {tap: "Plains"}]);
  const actions = legalActions(s, 0);
  ok(actions.some((a) => a.convoke === true), "the convoke offer is there");
  const chosen = housePilot({seat: 0, cards: (name) => (name === "Sun-Dappled Celebrant" ? {manaValue: 6, types: ["Creature"], power: 5, toughness: 6} : null)}).choose(projectFor(s, 0), actions);
  ok(!(chosen.kind === "cast" && chosen.convoke === true), "and the house pilot does not take it");
}

/* ---- named: {X} is not convoked ---- */
{
  const s = play("x", [at(0, "battlefield", "Forest", "Bear", "Wolf"), at(0, "hand", "X Convoke")], [{tap: "Forest"}]);
  eq([offers(s, "X Convoke").length > 0, offers(s, "X Convoke").some((a) => a.convoke === true)], [true, false], "a spell with {X} is cast from the pool, never convoked");
}

console.log(`engine-convoke: ${checks} checks passed -- convoke (CR 702.51): offered beside the pool's cast, the creatures picked, summoning-sick ones too, a commander's tax among what they pay, and a pick that cannot pay or leaves more than one way refused before anything moves.`);
