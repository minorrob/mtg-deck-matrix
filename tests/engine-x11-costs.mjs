/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PLAN'S X11, TRAIN B: COSTS THE PLAYER CHOOSES, AND WHAT THEIR CARDS' SCENARIOS CANNOT REACH.
 *
 * Four costs, each paid with something the player picks (AGENTS.md: the players decide; CR 601.2h, 602.2b):
 *   - "As an additional cost to cast this spell, tap any number of untapped creatures you control" (Burn at the Stake):
 *     one offer, the creatures asked once it is taken (choose-cost "tapAny", none up to all), counted as it resolves
 *     (`tappedThisWay`). Never tapped for or convoked: those tap creatures too.
 *   - "Discard two cards" as an additional cost (Cathartic Reunion): one offer per pair.
 *   - "{T}, Tap an untapped creature you control: Add one mana of any color" (Jaspera Sentinel, Saruli Caretaker): one
 *     offer per creature, and nothing that pays for a player -- a cast's own tapping, an "unless" payment -- ever uses it.
 *   - "Exile a card from your graveyard" (Lorehold Excavation's ability; Rubble Rouser's mana ability, with its "when you
 *     do", CR 603.12): one offer per card, the same guard on the payers.
 * Here: four players, the questions' shapes and both pilots' answers, the refusals, the payers' guards, the compiler.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";
import {smokeTest} from "../game/engine/cards/compile.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {legalActions, applyAction, tapUnits} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {canPayGeneric, paymentUnits} from "../game/engine/rules/mana.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("x11-costs");
const BURN = "Burn at the Stake", REUNION = "Cathartic Reunion", JASPERA = "Jaspera Sentinel", SARULI = "Saruli Caretaker";
const LOREHOLD = "Lorehold Excavation", ROUSER = "Rubble Rouser";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1, abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {G: 1}}]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "x11-costs", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0, zone = "battlefield") => (zone === "battlefield" || zone === "exile" ? cardsIn(s, zone) : cardsIn(s, zone, seat))
  .find((id) => s.objects[id].card === card && s.objects[id].owner === seat);
const offersOf = (s, kind, card, seat = 0) => legalActions(s, seat).filter((a) => a.kind === kind && a.label === card);
/* Tap these for mana, each its first offer (a basic land, an Elf). */
function tapFor(s, names, seat = 0) {
  for (const name of names) {
    const offer = legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === name && !s.objects[a.objectId].tapped);
    applyAction(s, seat, offer);
  }
}
/* Everyone passes until the stack is empty, nobody being asked. */
function resolveAll(s) {
  for (let n = 0; n < 200 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng);
}
const LANDS = ["Mountain", "Mountain", "Mountain", "Wastes", "Wastes"];
const lifeOf = (s) => s.players.map((p) => p.life);

/* ---- Burn at the Stake: four players, the question, the pilots ---- */
{
  const s = table([at(0, "hand", BURN), at(0, "battlefield", ...LANDS, "Bear", "Ogre", "Elf"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear"), at(3, "battlefield", "Ogre")], 4);
  /* Its creatures are tapped as its cost: it is never offered tapping lands for itself, even with every land untapped. */
  eq(offersOf(s, "cast", BURN).length, 0, "with an empty pool it is not offered: a cast that taps for itself would ask about the same creatures");
  tapFor(s, ["Elf", ...LANDS.slice(0, 4)]);
  const casts = offersOf(s, "cast", BURN);
  ok(casts.length > 0 && casts.every((a) => a.tapAny === true && a.autoTap === undefined && a.convoke === undefined), "with the mana in the pool: offered, each offer the tapAny cast");
  const atSam = casts.find((a) => a.targets[0].kind === "player" && a.targets[0].id === 3);
  applyAction(s, 0, atSam);
  const q = awaitingChoice(s);
  eq([s.awaiting.kind, q.cost, q.mode, q.min, q.max, q.options.map((o) => o.label)], ["choose-cost", "tapAny", "many", 0, 2, ["Bear", "Ogre"]],
    "asked of Rob: any number of his untapped creatures -- not the Elf he tapped, not the others' creatures");
  eq(s.stack.length, 0, "nothing is cast or paid before he answers");
  /* The pilots answer within its bounds: the house pilot every creature, the random one any number of distinct ones. */
  eq(housePilot({seat: 0}).answer(projectFor(s, 0), q).indices, [0, 1], "the house pilot taps every creature it is offered");
  for (let k = 0; k < 12; k += 1) {
    const {indices} = randomLegalPilot(createRng(`burn-${k}`)).answer(q);
    ok(indices.length <= 2 && new Set(indices).size === indices.length && indices.every((i) => q.options[i]), `the random pilot's answer ${JSON.stringify(indices)} is within it`);
  }
  throws(() => resolveAwaiting(s, [0, 5]), /Invalid selection/, "an option it was not offered is refused");
  resolveAwaiting(s, [0, 1]);
  const bear = idOf(s, "Bear", 0), ogre = idOf(s, "Ogre", 0);
  eq([s.stack.length, s.objects[bear].tapped, s.objects[ogre].tapped, s.stack[0].cast?.tapped], [1, true, true, 2], "cast: both tapped as its cost, the count kept on the spell");
  resolveAll(s);
  eq(lifeOf(s), [40, 40, 40, 34], "three times the two tapped: six to Sam, no one else");
}
/* Refused before anything moves: a creature not the caster's, or one twice. */
{
  const s = table([at(0, "hand", BURN), at(0, "battlefield", ...LANDS, "Bear"), at(1, "battlefield", "Ogre")]);
  tapFor(s, LANDS);
  const cast = offersOf(s, "cast", BURN).find((a) => a.targets[0].kind === "player" && a.targets[0].id === 1);
  const pool = {...s.players[0].manaPool};
  throws(() => applyAction(s, 0, {...cast, tapChosen: [idOf(s, "Ogre", 1)]}), /not untapped creatures you control: pick the creatures to tap for Burn at the Stake again/, "Maya's Ogre is refused, saying what to do");
  throws(() => applyAction(s, 0, {...cast, tapChosen: [idOf(s, "Bear"), idOf(s, "Bear")]}), /not untapped creatures you control/, "and the same creature twice");
  eq([s.stack.length, s.players[0].manaPool, s.objects[idOf(s, "Bear")].tapped], [0, pool, false], "and nothing was paid or tapped");
}
/* Which mana pays is asked first when the pool pays it more than one way (X8b), then the creatures. */
{
  const s = table([at(0, "hand", BURN), at(0, "battlefield", "Bear")]);
  s.players[0].manaPool = {...s.players[0].manaPool, R: 4, G: 1, U: 1};
  const cast = offersOf(s, "cast", BURN).find((a) => a.targets[0].kind === "player" && a.targets[0].id === 1);
  eq([cast.payWays, cast.tapAny], [true, true], "six mana for five: paid more than one way, and creatures to tap");
  applyAction(s, 0, cast);
  eq(awaitingChoice(s).cost, "pool", "first, which mana pays");
  resolveAwaiting(s, [0]);
  eq(awaitingChoice(s).cost, "tapAny", "then the creatures");
  resolveAwaiting(s, [0]);
  resolveAll(s);
  eq([s.players[1].life, Object.values(s.players[0].manaPool).reduce((n, v) => n + v, 0)], [37, 1], "one tapped, three damage; one mana left");
}
/* The compiler and the amount. */
const spell = (additionalCost, effects = [{effect: "draw", count: 1}]) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Pyre", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"]},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", additionalCost, targets: [], effects}]}).problems;
eq(spell([{atom: "tapCreature", count: "any", selector: {types: ["Creature"]}}]), [], "tapping any number of creatures compiles");
for (const bad of [{atom: "tapCreature", count: 2, selector: {types: ["Creature"]}}, {atom: "tapCreature", count: "any"}, {atom: "tapCreature", count: "any", selector: {shade: "R"}}])
  ok(spell([bad]).some((p) => p.includes("tapCreature: an additional cost taps any number")), `and refuses ${JSON.stringify(bad)}`);
eq(amountProblems({tappedThisWay: true, times: 3}), [], "three times the creatures tapped this way");
ok(amountProblems({tappedThisWay: 2}).some((p) => p.includes("tappedThisWay is true")), "and the amount says only that");

/* ---- Cathartic Reunion: two cards discarded, one offer per pair ---- */
{
  const s = table([at(0, "hand", REUNION, "Plains", "Island", "Swamp", "Forest"), at(0, "battlefield", "Mountain", "Wastes")]);
  tapFor(s, ["Mountain", "Wastes"]);
  const casts = offersOf(s, "cast", REUNION);
  eq(casts.length, 6, "four other cards: six pairs, six offers");
  ok(casts.every((a) => Array.isArray(a.costChoice.discard) && a.costChoice.discard.length === 2 && new Set(a.costChoice.discard).size === 2 && a.costNames.length === 2),
    "each offer names two different cards");
  ok(casts.every((a) => !a.costChoice.discard.includes(a.objectId)), "never the spell itself");
  const events = applyAction(s, 0, casts.find((a) => a.costNames.join() === "Island,Forest"));
  eq(events.filter((e) => e.kind === "GameEventCardChangeZone" && e.data.fields.discarded === true).map((e) => e.data.fields.card.name).sort(), ["Forest", "Island"],
    "each card a discard of its own, as the cost is paid");
  resolveAll(s);
  eq(cardsIn(s, "hand", 0).length, 5, "two left in hand, and three drawn");
}
/* Its smoke game is dealt two cards to discard beside it, so it is cast there (cards/compile.mjs). */
ok(smokeTest(loadCardScripts().find(({script}) => script.identity.name === REUNION).script, index.definition).played, "its smoke game casts it, two cards there to discard");
ok(spell([{atom: "discard", count: 0}]).some((p) => p.includes("discard: an additional cost of 1 or more cards")), "a discard of no cards is refused");
eq(spell([{atom: "discard", count: 2}]), [], "and two compiles");

/* ---- Jaspera Sentinel, Saruli Caretaker: four players, and no payer uses them ---- */
{
  const s = table([at(0, "battlefield", JASPERA, SARULI, "Bear"), at(1, "battlefield", "Ogre"), at(2, "battlefield", "Elf"), at(3, "battlefield", "Bear")], 4);
  const j = offersOf(s, "activate-mana", JASPERA), sar = offersOf(s, "activate-mana", SARULI);
  eq([j.length, [...new Set(j.map((a) => a.costNames[0]))].sort(), sar.length, [...new Set(sar.map((a) => a.costNames[0]))].sort()],
    [10, ["Bear", SARULI], 10, ["Bear", JASPERA]], "each taps one of Rob's other creatures (the other one among them), five colors each -- never another player's");
  /* Paying for a player, nothing picks the creature: not the units an "unless" payment taps, not what a cast taps for itself. */
  eq([canPayGeneric(s, 0, 1), paymentUnits(s, 0).length, tapUnits(s, 0).length], [false, 0, 0], "no payer counts them: which creature is Rob's to choose");
  const events = applyAction(s, 0, j.find((a) => a.costNames[0] === SARULI && a.mana.G === 1));
  const tapped = events.filter((e) => e.kind === "GameEventCardTapped").map((e) => e.data.fields.card.name);
  eq([tapped, s.players[0].manaPool.G, offersOf(s, "activate-mana", SARULI).length], [[JASPERA, SARULI], 1, 0],
    "Jaspera and Saruli tapped, {G} added; Saruli, tapped, can no longer add mana");
  const pool = events.find((e) => e.kind === "GameEventManaPool");
  eq([pool.data.fields.source.name, pool.data.fields.tapped], [JASPERA, true], "the mana is Jaspera's, tapped for mana; the creature its cost tapped is not");
}
{
  const s = table([at(0, "battlefield", "Forest", JASPERA, "Bear")]);
  eq([paymentUnits(s, 0).map((u) => u.label), canPayGeneric(s, 0, 2)], [["Tap Forest"], false], "beside a Forest: the Forest pays, Jaspera does not");
}
const manaCard = (cost) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Sentinel", oracleId: "x", types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
  oracleText: "x", source: "hand", abilities: [{kind: "activated", text: "x", mana: true, cost, effects: [{effect: "addMana", anyColor: true}]}]});
{
  const fine = manaCard([{atom: "{T}"}, {atom: "tapCreature", selector: {types: ["Creature"]}}]);
  eq([fine.problems, fine.definition.abilities[0].kind, fine.definition.abilities[0].tapCreature], [[], "mana", {types: ["Creature"]}], "{T} and another creature: a mana ability");
  for (const bad of [[{atom: "tapCreature", selector: {types: ["Creature"]}}], [{atom: "{T}"}, {atom: "tapCreature", count: 2, selector: {types: ["Creature"]}}], [{atom: "{T}"}, {atom: "tapCreature"}]])
    ok(manaCard(bad).problems.length > 0, `refused: ${JSON.stringify(bad)} (no {T} of its own, two creatures, no selector)`);
}

/* ---- Lorehold Excavation, Rubble Rouser: a card of the graveyard as a cost ---- */
{
  const s = table([at(0, "battlefield", ROUSER), at(0, "graveyard", "Plains", "Bear"), at(1, "graveyard", "Ogre"), at(2, "graveyard", "Elf"), at(3, "graveyard", "Bear")], 4);
  const offers = offersOf(s, "activate-mana", ROUSER);
  eq(offers.map((a) => a.costNames[0]).sort(), ["Bear", "Plains"], "one offer per card in Rob's graveyard -- no one else's");
  eq([canPayGeneric(s, 0, 1), paymentUnits(s, 0).length, tapUnits(s, 0).length], [false, 0, 0], "and no payer counts it: which card is Rob's to choose");
  applyAction(s, 0, offers.find((a) => a.costNames[0] === "Plains"));
  eq([s.players[0].manaPool.R, s.objects[idOf(s, "Plains", 0, "exile")]?.zone, s.stack.length], [1, "exile", 1],
    "{R} at once, the Plains exiled as its cost, and its \"when you do\" on the stack (CR 603.12)");
  resolveAll(s);
  eq(lifeOf(s), [40, 39, 39, 39], "1 damage to each opponent");
}
{
  const s = table([at(0, "battlefield", LOREHOLD, ...Array(5).fill("Wastes")), at(0, "graveyard", "Bear", "Plains"), at(1, "graveyard", "Ogre"), at(2, "graveyard", "Elf")], 3);
  tapFor(s, Array(5).fill("Wastes"));
  const offers = offersOf(s, "activate", LOREHOLD);
  eq(offers.map((a) => a.costNames), [["Bear"]], "a creature card of Rob's own graveyard: his Bear, not his Plains, not the others' creatures");
  applyAction(s, 0, offers[0]);
  eq([s.stack.length, s.objects[idOf(s, "Bear", 0, "exile")]?.zone], [1, "exile"], "the Bear exiled as the ability goes on the stack (CR 602.2b)");
  resolveAll(s);
  const spirit = s.zones.battlefield.find((id) => s.objects[id].card === "Spirit");
  eq([s.objects[spirit]?.tapped, s.objects[spirit]?.power, s.objects[spirit]?.toughness, s.objects[spirit]?.controller], [true, 3, 2, 0], "a tapped 3/2 Spirit, Rob's");
}
ok(manaCard([{atom: "{T}"}, {atom: "exileFromGraveyard", count: 2, selector: {}}]).problems.length > 0, "a mana ability exiling two cards is refused");
eq(manaCard([{atom: "{T}"}, {atom: "exileFromGraveyard", selector: {}}]).definition.abilities[0].exileFromGraveyard, {}, "and one card of any kind compiles");
{
  const activated = (cost) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Dig", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"]},
    oracleText: "x", source: "hand", abilities: [{kind: "activated", text: "x", cost, effects: [{effect: "draw", count: 1}]}]}).problems;
  eq(activated([{atom: "mana", cost: "{5}"}, {atom: "exileFromGraveyard", selector: {types: ["Creature"]}}]), [], "an ability exiling a creature card compiles");
  ok(activated([{atom: "exileFromGraveyard", count: 2, selector: {types: ["Creature"]}}]).length > 0, "and one exiling two is refused");
}

console.log(`engine-x11-costs: ${checks} checks passed`);
