/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MANA THAT DOES SOMETHING WHEN IT IS SPENT (CR 106.6; Path of Ancestry, Study Hall; AI 3's Teysa deck and AI 2's Kiora deck).
 *
 * rules/restricted-mana.mjs: the mana is in the pool and pays for anything; `manaRiders` remembers which of it came with a
 * rider, and spent on a spell its rider describes it makes a delayed triggered ability (CR 603.7), on the stack once the cast
 * is done. Which mana pays is the player's: rules/actions.mjs offers a cast that could spend rider mana on a spell it
 * triggers for both ways (`riders`, riderChoices); anywhere else the plain mana goes first, unless there is not enough, and
 * then which rider goes is theirs as well. A cast that taps for itself never taps such a source. "Shares a creature type with
 * your commander" (script/filter.mjs) is read off a commander of the chooser's wherever it is; "the number of times it's
 * been cast from the command zone this game" (script/amount.mjs, commanderCasts) off the key its casts are kept under. The
 * card scenarios play both lands; this suite holds the choices, the refusals, the pool emptying, an ability paid with it,
 * partners and changelings, and the compile.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions, applyAction, tapUnits} from "../game/engine/rules/actions.mjs";
import {riderChoices, spendFor, ridersOf} from "../game/engine/rules/restricted-mana.mjs";
import {spend} from "../game/engine/rules/mana.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance} from "../game/engine/rules/turn.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (fn, pattern, m) => { assert.throws(fn, pattern, m); checks += 1; };

const cards = loadCardIndex();
const PATH = "Path of Ancestry", HALL = "Study Hall";
const C = (subtypes, manaCost = "{1}{G}") => ({types: ["Creature"], subtypes, manaCost, colors: ["G"], power: 2, toughness: 2});
const FIX = {Elder: {...C(["Elf", "Druid"], "{G}{W}"), supertypes: ["Legendary"], colors: ["G", "W"]}, "Elf Warrior": C(["Elf", "Warrior"]), Bear: C(["Bear"]),
  Grove: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "g", kind: "activated", text: "{G}: You gain 1 life.", cost: [{atom: "mana", cost: "{G}"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]},
  /* A card's ability in a hand (cycling) and in a graveyard, each paid with {G}. */
  Seed: {...C(["Plant"]), abilities: [{id: "cy", kind: "activated", zone: "hand", cycling: true, text: "Cycling {G}", cost: [{atom: "mana", cost: "{G}"}, {atom: "discard", self: true}], targets: [], effects: [{effect: "draw", count: 1}]}]},
  Ember: {...C(["Elemental"], "{2}{G}"), abilities: [{id: "e", kind: "activated", zone: "graveyard", text: "{G}, Exile this card from your graveyard: You gain 1 life.",
    cost: [{atom: "mana", cost: "{G}"}, {atom: "exileFromGraveyard", self: true}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]}};
const at = (seat, zone, ...list) => ({seat, zone, cards: list});
const play = (setup, steps = []) => runScenario({name: "riders", setup, steps}, cards.definition, FIX).state;
const named = (s, name) => Object.values(s.objects).find((o) => o.card === name && o.zone === "hand")?.id ?? s.zones.battlefield.find((id) => s.objects[id].card === name);
const casts = (s, name) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === name);
const BOARD = [at(0, "command", "Elder"), at(0, "battlefield", PATH, HALL, "Forest", "Forest", "Wastes", "Grove"), at(0, "hand", "Elf Warrior", "Bear")];

/* ---- the choices: with it and without it when it would trigger; plain first when it would not; which, when it must ---- */
{
  const s = play(BOARD, [{tap: PATH, mana: {G: 1}}, {tap: "Forest"}]);
  const [rider] = ridersOf(s, 0);
  eq(riderChoices(s, 0, {spell: named(s, "Elf Warrior")}, {G: 2}), [[rider.id]], "{G}{G} needed of one plain and Path's: it must pay, and so it triggers");
  eq(casts(s, "Elf Warrior").map((a) => a.riderNames), [[PATH]], "one offer, saying it spends Path's mana");
  const t = play(BOARD, [{tap: PATH, mana: {G: 1}}, {tap: "Forest"}, {tap: "Forest"}]);
  const [r] = ridersOf(t, 0);
  eq(riderChoices(t, 0, {spell: named(t, "Elf Warrior")}, {G: 2}), [[], [r.id]], "two plain and Path's: an Elf (it shares a type with the Elder) with it or without it");
  eq(riderChoices(t, 0, {spell: named(t, "Bear")}, {G: 2}), [[]], "a Bear (it shares none): the plain mana, and Path's kept -- the same payment, less kept, is no choice");
  eq(riderChoices(t, 0, {ability: named(t, "Grove")}, {G: 1}), [[]], "an ability: plain first too");
}
{
  /* Path's {G} and Study Hall's {G} and one plain: a Bear's {1}{G} must spend one of the two -- which is his. */
  const s = play(BOARD, [{tap: "Wastes"}, {tap: HALL, mana: {G: 1}}, {tap: PATH, mana: {G: 1}}, {tap: "Forest"}]);
  const [hall, path] = ridersOf(s, 0);
  eq([hall.source, path.source].map((id) => s.objects[id].card), [HALL, PATH], "two riders, one from each land");
  eq(riderChoices(s, 0, {spell: named(s, "Bear")}, {G: 2}).sort(), [[path.id], [hall.id]].sort(), "the Bear spends one of them: either, his choice");
  eq(casts(s, "Bear").map((a) => a.riderNames[0]).sort(), [PATH, HALL].sort(), "offered both ways");
  throws(() => spendFor(s, 0, {spell: named(s, "Bear")}, {G: 2}, [9999]), /no longer in the pool/, "a rider not there is refused");
  throws(() => spendFor(s, 0, {spell: named(s, "Bear")}, {G: 1}, [path.id, hall.id]), /More of that mana/, "two riders for one {G} is refused");
  throws(() => spendFor(s, 0, {spell: named(s, "Bear")}, {G: 3}, [path.id]), /Not enough of that mana/, "and naming too few, when the rest must come from riders");
}

/* ---- an ability's {G} of Path's or Study Hall's, with no plain mana: which is his, wherever the ability is ---- */
{
  const s = play([at(0, "command", "Elder"), at(0, "battlefield", PATH, HALL, "Wastes", "Grove"), at(0, "hand", "Seed"), at(0, "graveyard", "Ember")],
    [{tap: "Wastes"}, {tap: HALL, mana: {G: 1}}, {tap: PATH, mana: {G: 1}}]);
  const ways = (label) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === label).map((a) => a.riderNames[0]).sort();
  eq([ways("Grove"), ways("Seed"), ways("Ember")], [[PATH, HALL].sort(), [PATH, HALL].sort(), [PATH, HALL].sort()], "a permanent's, a hand's and a graveyard's ability: either rider, his choice");
  const offer = legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Grove");
  throws(() => applyAction(s, 0, {...offer, riders: [9999]}), /not a legal action/, "an offer whose riders were changed is refused");
  const [, path] = ridersOf(s, 0);
  const t = structuredClone(s);
  applyAction(t, 0, legalActions(t, 0).find((a) => a.kind === "activate" && a.label === "Grove" && a.riderNames[0] === PATH));
  eq(ridersOf(t, 0).map((r) => t.objects[r.source].card), [HALL], "the Grove's {G} paid with Path's, as he chose: Study Hall's is left");
  spendFor(s, 0, {ability: named(s, "Grove")}, {G: 1});
  eq(ridersOf(s, 0).map((r) => r.id), [path.id], "spent without saying which, by what the offers never do (a convoke): the oldest rider goes");
}

/* ---- the trigger, on a spell and never on an ability; spent elsewhere; the pool emptied ---- */
{
  const s = play(BOARD, [{tap: PATH, mana: {G: 1}}]);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Grove"));
  eq([s.stack.length, s.stack[0].kind, ridersOf(s, 0).length], [1, "ability", 0], "Path's {G} on the Grove's ability: spent, and nothing triggers");
  const t = play(BOARD, [{tap: PATH, mana: {G: 1}}]);
  spend(t.players[0].manaPool, {G: 1});
  eq(ridersOf(t, 0), [], "spent by something that does not say (an \"unless that player pays\"): its rider goes with it");
  const u = play(BOARD, [{tap: PATH, mana: {G: 1}}]);
  for (let n = 0; n < 4 && u.phase === "MAIN1"; n += 1) { const out = passPriority(u, null, null); if (out.outcome === "step-ends") advance(u); }
  eq([u.phase !== "MAIN1", u.players[0].manaPool.G, u.players[0].manaRiders ?? []], [true, 0, []], "the step over: the pool empties, and its riders with it (CR 500.4)");
  ok(!tapUnits(play(BOARD), 0).some((unit) => unit.id === named(play(BOARD), PATH)), "a cast that taps for itself never taps Path: which mana pays is a choice of its own");
}

/* ---- "shares a creature type with your commander" and "the times it's been cast from the command zone" ---- */
{
  const s = createState({matchId: "m", seed: "riders", players: [{name: "Rob"}, {name: "Maya"}]});
  const add = (o, zone, owner = 0) => addObject(s, {owner, controller: owner, ...o}, zone, ["battlefield", "exile"].includes(zone) ? null : owner);
  const shares = compileSelector({what: "card", zone: "hand", types: ["Creature"], sharesCreatureTypeWithCommander: true});
  const human = add({card: "Human", types: ["Creature"], subtypes: ["Human", "Soldier"]}, "hand");
  const shape = add({card: "Shape", types: ["Creature"], subtypes: ["Shapeshifter"], keywords: ["Changeling"]}, "hand");
  eq([shares(s, human, {controller: 0}), shares(s, shape, {controller: 0})], [false, false], "no commander: nothing shares a type with one");
  add({card: "Elf Lord", types: ["Creature"], subtypes: ["Elf"], commander: true}, "command");
  eq([shares(s, human, {controller: 0}), shares(s, shape, {controller: 0})], [false, true], "an Elf commander: not the Human; the changeling, every type (CR 702.73a)");
  add({card: "Partner", types: ["Creature"], subtypes: ["Human", "Wizard"], commander: true}, "battlefield");
  eq(shares(s, human, {controller: 0}), true, "and a Human partner on the battlefield: the Human shares with it");
  add({card: "Her Elf", types: ["Creature"], subtypes: ["Elf"], commander: true}, "command", 1);
  eq(shares(s, human, {controller: 1}), false, "for Maya, her own commander only");
  const t = createState({matchId: "m", seed: "riders-2", players: [{name: "Rob"}, {name: "Maya"}]});
  const walker = addObject(t, {card: "Walker", types: ["Planeswalker"], subtypes: ["Elf"], commander: true, owner: 0, controller: 0}, "command", 0);
  const elf = addObject(t, {card: "Elf", types: ["Creature"], subtypes: ["Elf"], owner: 0, controller: 0}, "hand", 0);
  eq(shares(t, elf, {controller: 0}), false, "a planeswalker commander has no creature types (CR 205.3m)");
  t.players[0].commanderCasts = {[`0:${walker}`]: 2};
  eq([amountOf(t, {commanderCasts: "that card"}, {controller: 0, about: {card: walker}}), amountOf(t, {commanderCasts: "that card"}, {controller: 0, about: {card: 9999, commanderKey: `0:${walker}`, player: 0}}),
    amountOf(t, {commanderCasts: "that card"}, {controller: 0, about: {card: elf}})], [2, 2, 0], "cast twice from the command zone: 2, by the object or by the key it was taken under; a card no commander, 0");
}

/* ---- the compile ---- */
{
  const land = (addMana) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Land"], subtypes: [], manaCost: "", colors: [], colorIdentity: []},
    oracleText: "x", source: "hand", abilities: [{kind: "activated", text: "x", cost: [{atom: "{T}"}], effects: [{effect: "addMana", mana: {C: 1}, ...addMana}]}]});
  ok(land({whenSpent: {spell: {types: ["Creature"]}, effects: [{effect: "scry", count: 1}]}}).problems.some((p) => p.includes("{spell, effects, text}")), "a rider says what it does in words too");
  ok(land({whenSpent: {spell: {types: ["Creature"]}, effects: [{effect: "scry", count: 1}], text: "x"}, spendOnly: {spell: {types: ["Creature"]}}}).problems.some((p) => p.includes("restricted and does something")),
    "restricted mana with a rider is not built, and says so");
  eq(land({whenSpent: {spell: {types: ["Creature"]}, effects: [{effect: "scry", count: 1}], text: "x"}}).problems, [], "a rider of a spell selector, effects and words: built");
  ok(cards.definition(PATH).abilities.find((a) => a.kind === "mana").whenSpent.spell.sharesCreatureTypeWithCommander === true, "Path's mana ability carries its rider");
}

console.log(`engine-mana-riders: ${checks} checks passed -- mana that triggers when spent on what it names, paid with or without as the player chooses, plain mana first where it does nothing, gone with its pool.`);
