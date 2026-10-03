/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 9 (THE CATALOG'S ORDER): COST REDUCTION, CYCLING, AND SACRIFICE AS AN EFFECT.
 *
 * Cost reduction (CR 601.2f): "spells cost {1} less" takes generic mana off the total cost -- the printed generic first,
 * then the commander tax -- and never colored mana or below nothing; the offer, the payment and "nothing to do" read
 * the same total. Cycling (CR 702.29a): "{N}, discard this card: draw a card", activated from its owner's hand at
 * instant speed. Sacrifice as an effect (CR 701.21a, 101.4): each player named chooses which of their own permanents,
 * the active player first; nobody sacrifices what they do not control.
 */
import assert from "node:assert/strict";
import {createState, addObject, commanderKeyOf} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction, nothingToDo} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {costReduction} from "../game/engine/rules/statics.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {offerDetails} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const land = (name, color) => ({card: name, types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});
const WASTES = land("Wastes", "C"), ISLAND = land("Island", "U");
const bolt = (name, cost, colors) => ({card: name, types: ["Instant"], manaCost: cost, colors, spell: {id: "s", text: name, targets: [], effects: [{effect: "gainLife", amount: 1}]}});

const pod = {matchId: "m", seed: "costs", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 10; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const tap = (s, name, seat = 0) => applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === name));
const casts = (s, name, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "cast" && a.label === name);
const resolve = (s) => { passPriority(s); return passPriority(s); };

/* ---- cost reduction ---- */
{
  const s = table();
  on(s, card("Sapphire Medallion"), 0);
  const twoU = on(s, bolt("Two Blue", "{2}{U}", ["U"]), 0, "hand");
  const pureU = on(s, bolt("Pure Blue", "{U}", ["U"]), 0, "hand");
  const red = on(s, bolt("Red One", "{1}{R}", ["R"]), 0, "hand");
  main(s);
  eq([costReduction(s, 0, twoU), costReduction(s, 0, pureU), costReduction(s, 0, red)], [1, 1, 0], "Sapphire Medallion takes one off a blue spell, not a red one");
  eq(casts(s, "Pure Blue").length, 0, "a spell of only colored mana costs what it costs: no lands, no cast -- a reduction takes generic mana only");
  on(s, ISLAND, 0); on(s, ISLAND, 0);
  tap(s, "Island"); tap(s, "Island");
  ok(casts(s, "Two Blue").length === 1, "{2}{U} for two mana with the Medallion");
  applyAction(s, 0, casts(s, "Two Blue")[0]);
  eq([s.stack.length, s.players[0].manaPool.U ?? 0], [1, 0], "and the payment takes exactly the two the offer counted");
}
{
  /* Two reductions stack; neither goes below nothing. */
  const s = table();
  on(s, card("Sapphire Medallion"), 0); on(s, card("Helm of Awakening"), 0);
  const twoU = on(s, bolt("Two Blue", "{2}{U}", ["U"]), 0, "hand");
  const oneU = on(s, bolt("One Blue", "{1}{U}", ["U"]), 0, "hand");
  on(s, ISLAND, 0);
  main(s);
  tap(s, "Island");
  eq([costReduction(s, 0, twoU), casts(s, "Two Blue").length, casts(s, "One Blue").length], [2, 1, 1], "Medallion and Helm together: {2}{U} and {1}{U} both cost {U}");
}
{
  /* "Spells cost {1} less": everyone's. "Blue spells you cast": its controller's only. */
  const s = table();
  on(s, card("Helm of Awakening"), 0); on(s, card("Sapphire Medallion"), 0);
  const theirs = on(s, bolt("Their Blue", "{1}{U}", ["U"]), 1, "hand");
  main(s);
  eq(costReduction(s, 1, theirs), 1, "an opponent's blue spell: the Helm's {1}, not the Medallion's");
}
{
  /* The commander tax is generic, and a reduction takes it once the printed generic is gone. */
  const s = table();
  on(s, card("Sapphire Medallion"), 0);
  const commander = on(s, {card: "Blue General", types: ["Creature"], supertypes: ["Legendary"], manaCost: "{U}", colors: ["U"], power: 1, toughness: 1, commander: true}, 0, "command");
  s.players[0].commanderCasts = {...(s.players[0].commanderCasts ?? {}), [commanderKeyOf(s.objects[commander])]: 1};
  on(s, ISLAND, 0); on(s, ISLAND, 0);
  main(s);
  tap(s, "Island"); tap(s, "Island");
  const offered = casts(s, "Blue General");
  ok(offered.length === 1 && offered[0].tax === 2, `with one cast already (tax {2}), {U} plus the tax less the Medallion's {1} is {1}{U}: two Islands cast it (tax ${offered[0]?.tax})`);
}
{
  /* Nothing to do counts what a spell costs NOW: a Medallion that makes it castable is something to do. */
  const s = table();
  on(s, card("Sapphire Medallion"), 0);
  on(s, bolt("Two Blue", "{1}{U}", ["U"]), 0, "hand");
  on(s, ISLAND, 0);
  main(s);
  eq(nothingToDo(s, 0), false, "{1}{U} with one Island and the Medallion is castable, so the step does not pass itself");
}

/* ---- cycling ---- */
{
  const s = table();
  on(s, card("Fetid Pools"), 0, "hand");
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  tap(s, "Wastes");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Fetid Pools").length, 0, "Cycling {2} with one mana: not offered");
  tap(s, "Wastes");
  const cycle = legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Fetid Pools");
  ok(cycle, "with two, it is: an ability of a card in its owner's hand (CR 702.29a)");
  const events = applyAction(s, 0, cycle);
  ok(events.some((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.discarded === true && e.data.fields.card?.name === "Fetid Pools"), "the card is discarded as the cost, a discard");
  eq(s.stack.length, 1, "the draw on the stack");
  resolve(s);
  eq(projectFor(s, 0).players[0].zones.Hand.count, 1, "and a card drawn");
}
{
  const s = table();
  on(s, card("Fetid Pools"), 0);
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  tap(s, "Wastes"); tap(s, "Wastes");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Fetid Pools").length, 0, "on the battlefield, Fetid Pools has no cycling to offer: it works from the hand");
}
{
  /* And the other way round: a permanent's ability is not offered while the card is in a hand. */
  const s = table();
  on(s, card("Viscera Seer"), 0, "hand");
  on(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 0);
  main(s);
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Viscera Seer").length, 0, "Viscera Seer in hand offers no \"Sacrifice a creature: scry 1\": that ability works on the battlefield");
}
{
  /* Instant speed: in an opponent's turn. */
  const s = table();
  on(s, card("Canyon Slough"), 0, "hand");
  on(s, WASTES, 0); on(s, WASTES, 0);
  main(s);
  for (let n = 0; n < 60 && !(s.turn === 2 && s.priorityPlayer === 0); n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else passPriority(s).outcome === "step-ends" && advance(s); }
  tap(s, "Wastes"); tap(s, "Wastes");
  ok(legalActions(s, 0).some((a) => a.kind === "activate" && a.label === "Canyon Slough"), "cycling is offered in an opponent's turn: it is an activated ability, at instant speed");
}

/* ---- sacrifice as an effect ---- */
{
  const s = table();
  const mine = on(s, {card: "My Bear", types: ["Creature"], manaCost: "{1}{G}", power: 2, toughness: 2}, 0);
  const big = on(s, {card: "Their Big", types: ["Creature"], manaCost: "{4}", power: 4, toughness: 4}, 1);
  const spirit = on(s, {card: "Their Spirit", types: ["Creature"], power: 1, toughness: 1, token: true}, 1);
  main(s);
  beginResolution(s, [{effect: "sacrifice", who: "opponent", count: 1, selector: {types: ["Creature"]}}], {controller: 0, source: null});
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.options.map((o) => o.label).sort()], [1, ["Their Big", "Their Spirit"]], "each opponent chooses, from their own creatures only (CR 701.21a)");
  eq(housePilot({seat: 1}).answer(projectFor(s, 1), choice).indices.map((i) => choice.options[i].label), ["Their Spirit"], "the house pilot gives up its token first");
  resolveAwaiting(s, [choice.options.findIndex((o) => o.label === "Their Big")]);
  eq([s.objects[big]?.zone, s.objects[spirit]?.zone, s.objects[mine]?.zone], [undefined, "battlefield", "battlefield"], "the chosen one is gone; the rest, and its caster's, stay");
}
{
  /* Each player: the active player first (CR 101.4); a player with nothing to sacrifice is not asked. */
  const s = table();
  on(s, {card: "Their Bear", types: ["Creature"], power: 2, toughness: 2}, 1);
  on(s, {card: "My Bear", types: ["Creature"], power: 2, toughness: 2}, 0);
  main(s);
  s.activePlayer = 1;   /* Maya's turn, so turn order and seat order differ */
  beginResolution(s, [{effect: "sacrifice", who: "each", count: 1, selector: {types: ["Creature"]}}], {controller: 0, source: null});
  eq(s.awaiting.player, 1, "each player sacrifices: the active player (Maya) chooses first, whoever controls the effect");
  resolveAwaiting(s, [0]);
  eq(s.awaiting.player, 0, "then the next in turn order");
  const empty = table(); main(empty);
  beginResolution(empty, [{effect: "sacrifice", who: "each", count: 1, selector: {types: ["Creature"]}}], {controller: 0, source: null});
  eq(empty.awaiting, null, "with no creature anywhere, nobody is asked");
}

{
  /* And then at the same time (CR 101.4; the plan review's P8b): each player chooses in turn, and only when the last has
     chosen does anything move -- before, the active player's creature was already in the graveyard while the next chose,
     which changes what "whenever one or more creatures die" sees and what a lord was still pumping. */
  const s = table();
  const theirs = on(s, {card: "Their Bear", types: ["Creature"], power: 2, toughness: 2}, 1);
  const mine = on(s, {card: "My Bear", types: ["Creature"], power: 2, toughness: 2}, 0);
  main(s);
  beginResolution(s, [{effect: "sacrifice", who: "each", count: 1, selector: {types: ["Creature"]}}], {controller: 0, source: null});
  resolveAwaiting(s, [0]);
  eq([s.awaiting?.player, s.objects[mine]?.zone, s.zones.graveyard[0].length], [1, "battlefield", 0],
    "seat 0 has chosen its Bear, and the Bear is still on the battlefield while seat 1 chooses");
  resolveAwaiting(s, [0]);
  eq([s.objects[mine], s.objects[theirs], s.zones.graveyard[0].length, s.zones.graveyard[1].length], [undefined, undefined, 1, 1],
    "then both are sacrificed together");
}
{
  /* The same for "each player discards a card": chosen in turn order from the active player, then discarded together. */
  const s = table();
  const mine = on(s, {card: "My Card", types: ["Creature"], power: 1, toughness: 1}, 0, "hand");
  on(s, {card: "Their Card", types: ["Creature"], power: 1, toughness: 1}, 1, "hand");
  main(s);
  s.activePlayer = 1;
  beginResolution(s, [{effect: "discard", who: "each", count: 1}], {controller: 0, source: null});
  eq(s.awaiting?.player, 1, "each player discards: the active player (Maya) chooses first, whoever controls the effect (CR 101.4)");
  resolveAwaiting(s, [0]);
  eq([s.awaiting?.player, s.zones.graveyard[1].length], [0, 0], "Maya has chosen, and her card is still in her hand while Rob chooses");
  resolveAwaiting(s, [s.zones.hand[0].indexOf(mine)]);
  eq([s.zones.graveyard[0].length, s.zones.graveyard[1].length, s.awaiting], [1, 1, null], "then both are discarded together");
}

/* ---- "Sacrifice two other creatures" (X5b): a cost of a set, each set its own offer, the source never in it ---- */
{
  const FIX = {Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
    Wolf: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
    Elf: {types: ["Creature"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1}};
  const at = (seat, zone, ...names) => ({seat, zone, cards: names});
  const {state: s} = runScenario({name: "Priest's sets", setup: [at(0, "battlefield", "Priest of Forgotten Gods", "Bear", "Wolf", "Elf")], steps: []}, cards.definition, FIX);
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Priest of Forgotten Gods");
  eq(offers.map((a) => a.costNames.join(" + ")).sort(), ["Bear + Elf", "Bear + Wolf", "Wolf + Elf"],
    "Priest of Forgotten Gods: one offer for each two of the three other creatures, the Priest itself never one of them");
  eq(offerDetails(s, 0, offers).map((d) => d.replace(/ \d+\/\d+/g, "")).sort(), ["→ any number of targets · sacrificing Bear and Elf", "→ any number of targets · sacrificing Bear and Wolf", "→ any number of targets · sacrificing Wolf and Elf"],
    "the room says which two each offer sacrifices, for the board's pop-up");
  const two = offers.find((a) => a.costNames.join(" + ") === "Bear + Wolf");
  applyAction(s, 0, two);
  resolveAwaiting(s, [1]);
  const graveyard = s.zones.graveyard[0].map((id) => s.objects[id].card).sort();
  eq([graveyard, s.stack.length, s.stack[0]?.kind, (s.stack[0]?.targets ?? [])[0]?.map?.((t) => t.id)], [["Bear", "Wolf"], 1, "ability", [1]],
    "activated at Maya: both sacrificed as the cost is paid, and -- targeting, so not a mana ability though it adds mana (CR 605.1a) -- it is on the stack");
  for (let n = 0; n < 20 && s.stack.length; n += 1) passPriority(s);
  eq([s.players[1].life, s.players[0].manaPool.B ?? 0], [38, 2], "it resolves: Maya loses 2, and the {B}{B} is added as it resolves");
}
{
  /* The room's words for a set of discards, a blank before (game/room/room.mjs). */
  const s = createState({matchId: "m", seed: "discards", players: [{name: "Rob"}, {name: "Maya"}]});
  const ponder = addObject(s, {card: "Ponder", types: ["Sorcery"], owner: 0, controller: 0}, "hand", 0);
  const opt = addObject(s, {card: "Opt", types: ["Instant"], owner: 0, controller: 0}, "hand", 0);
  eq(offerDetails(s, 0, [{kind: "activate", objectId: ponder, label: "Test", costChoice: {discard: [ponder, opt]}}]), ["discarding Ponder and Opt"], "a cost that discards two says both");
}

console.log(`engine-costs: ${checks} checks passed — spells cost less by generic mana only, the tax included and never below nothing; cycling from the hand at instant speed; each player sacrifices their own, the active player first; a cost of two sacrifices offered once per two, the source never one of them.`);
