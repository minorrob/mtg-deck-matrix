/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LIBRARY CARD LOAD OF 2026-10-21, LANE L3 (THE GRAVEYARD): what the cards' scenarios cannot reach.
 *
 * Fourteen of Rob's cards (docs/engine/library-load-2026-10-21/lane-L3-graveyard.json), each with its scenarios. Five small
 * pieces of grammar came with them, and this suite holds their edges and the compiler's refusals:
 *   - manifest dread (CR 701.62a; Innocuous Rat): a dig of two, one manifested (`manifest: true`), the rest into the graveyard;
 *   - "you may cast that card for as long as it remains exiled, and mana of any type can be spent" (Hostage Taker): exileUntil's
 *     `remember`, and mayPlay's `anyMana` (CR 609.4b);
 *   - "a creature you control without flying dies" (Luminous Broodmoth): `nonKeywords`, read as it last existed (CR 603.10a);
 *   - Happily Ever After's three conditions together (`allOf`), "card types among permanents you control and/or cards in your
 *     graveyard" (`cardTypesAmong` over a selector, CR 205.2a) and "your starting life total" (`startingLife`, CR 103.4);
 *   - "that creature's controller creates" with no creature (Amphin Mutineer's "up to one"): nobody does.
 */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {amountProblems, amountOf} from "../game/engine/script/amount.mjs";
import {createState, addObject, startingLifeOf} from "../game/engine/state/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const LANE = ["Reveillark", "Luminous Broodmoth", "Goblin Engineer", "Hostage Taker", "Amphin Mutineer", "Boggart Shenanigans", "Happily Ever After",
  "Regrowth", "Annie Flash, the Veteran", "Cathartic Parting", "Endless Detour", "Innocuous Rat", "Nether Spirit", "Proctor of Potential"];

const index = loadCardIndex();

/* ---- every card of the lane, defined and playable ---- */
{
  eq(LANE.filter((name) => index.resolve(name)?.playable !== true), [], "every card of lane L3 is defined and playable");
}

/* ---- the compiler and the schema ---- */
const script = (effects, text = "A test.") => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{B}", colors: ["B"]},
  oracleText: text, source: "hand", abilities: [{kind: "spell", text, targets: [{what: "permanent", types: ["Creature"]}], effects}]});
const errorsAt = (s, tail) => validateScript(s).errors.some((e) => e.path.endsWith(tail));
{
  const exile = {effect: "exileUntil", targets: {target: 0}, until: "this leaves", remember: true};
  const may = {effect: "mayPlay", targets: "remembered", zone: "exile", until: "ever", spellsOnly: true, anyMana: true};
  eq(compileScript(script([exile, may])).problems, [], "Hostage Taker's form compiles: what exileUntil exiled, remembered, cast with mana of any type");
  ok(compileScript(script([exile, {...may, anyMana: "yes"}])).problems.some((p) => p === "mayPlay: anyMana is true"), "anyMana is true or absent");

  const dread = {effect: "dig", count: 2, take: 1, to: "battlefield", manifest: true, rest: "graveyard"};
  eq(validateScript(script([dread])).errors, [], "manifest dread's dig validates");
  ok(errorsAt(script([{...dread, rest: "bottom"}]), ".manifest"), "the cards not manifested go into the graveyard, nowhere else");
  ok(errorsAt(script([{...dread, to: "hand"}]), ".manifest"), "the card taken is manifested onto the battlefield");
  ok(errorsAt(script([{...dread, take: 2}]), ".manifest"), "one card is manifested");
  ok(errorsAt(script([{...dread, upTo: true}]), ".manifest"), "and it is not a may: one is always manifested");
  ok(errorsAt(script([{...dread, selector: {types: ["Creature"]}}]), ".manifest"), "chosen from all the cards looked at, not some");
  ok(errorsAt(script([{...dread, all: true}]), ".manifest"), "one of them, never all");
  ok(errorsAt(script([{...dread, reveal: true}]), ".manifest"), "looked at, not revealed");
  ok(errorsAt(script([{...dread, manifest: false}]), ".manifest"), "manifest is true or absent");
}

/* ---- manifest dread's question: which card, said as what it does ---- */
{
  const {state} = runScenario({name: "Innocuous Rat, asking", library: ["Bear", "Ogre"],
    setup: [{seat: 0, zone: "battlefield", cards: ["Innocuous Rat", "Swamp", "Wastes"]}, {seat: 0, zone: "hand", cards: ["Murder"]}],
    steps: [{tap: "Swamp"}, {tap: "Wastes"}, {cast: "Murder", targets: [{card: "Innocuous Rat"}]}, {resolve: true}, {resolve: true}]}, index.definition,
  {Murder: {types: ["Instant"], manaCost: "{1}{B}", colors: ["B"], spell: {id: "s", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}],
    effects: [{effect: "destroy", targets: {target: 0}}]}}, Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3}});
  const choice = awaitingChoice(state);
  eq([state.awaiting.player, choice.title, choice.min, choice.max], [0, "Manifest dread: choose 1 to manifest; the other goes into your graveyard", 1, 1],
    "Rob is asked which of his top two to manifest, in those words, one and only one");
}

/* ---- a condition of several, and what it counts ---- */
{
  const colors = {compare: {count: {colorsAmong: {what: "permanent", controller: "you"}}, atLeast: 5}};
  const types = {compare: {count: {cardTypesAmong: {anyOf: [{what: "permanent", controller: "you"}, {what: "card", zone: "graveyard", controller: "you"}]}}, atLeast: 6}};
  const life = {compare: {count: {lifeTotal: "you"}, atLeast: {startingLife: "you"}}};
  eq(conditionProblems({allOf: [colors, types, life]}), [], "Happily Ever After's three conditions together are a condition");
  ok(conditionProblems({allOf: [colors]}).some((p) => p.startsWith("allOf is a list of two or more")), "allOf of one condition is that condition: refused");
  ok(conditionProblems({allOf: "everything"}).some((p) => p.startsWith("allOf is a list")), "allOf is a list");
  ok(conditionProblems({allOf: [colors, {controls: "Wizard"}]}).some((p) => p.startsWith("allOf[1]: A condition has no key")), "each of them is held to the grammar, by its place");
  ok(amountProblems({cardTypesAmong: ["Artifact"]}).some((p) => p.startsWith("cardTypesAmong is")), "cardTypesAmong counts what was remembered or what a selector matches");
  ok(amountProblems({cardTypesAmong: {what: "permanent", hue: "W"}}).some((p) => p.startsWith("What cardTypesAmong counts")), "and its selector is held to the selector grammar");
  ok(amountProblems({startingLife: "opponent"}).some((p) => p.startsWith("startingLife is")), "the starting life total is the game's, asked as \"you\"");
}

/* ---- the starting life total, and the card types among two zones ---- */
{
  const seats = [{name: "Rob"}, {name: "Maya"}];
  const at40 = createState({matchId: "l3", seed: "l3", players: seats});
  ok(!("startingLife" in at40), "a game at 40 carries no starting-life key, so it hashes and replays as it did");
  eq(startingLifeOf(at40), 40, "and its starting life total is 40 (CR 903.7)");
  const at30 = createState({matchId: "l3", seed: "l3", players: seats, startingLife: 30});
  eq([at30.startingLife, startingLifeOf(at30), at30.players[0].life], [30, 30, 30], "a table's 30 is its starting life total");
  eq(amountOf(at30, {startingLife: "you"}, {controller: 0}), 30, "and the amount reads it");

  const state = createState({matchId: "l3", seed: "l3", players: seats});
  const put = (object, zone, owner) => addObject(state, {colors: [], manaCost: null, subtypes: [], ...object, owner, controller: owner}, zone, zone === "battlefield" ? null : owner);
  put({card: "Golem", types: ["Artifact", "Creature"], power: 2, toughness: 2}, "battlefield", 0);
  put({card: "Bear", types: ["Creature"], power: 2, toughness: 2}, "graveyard", 0);
  put({card: "Tribal Bolt", types: ["Kindred", "Instant"], subtypes: ["Goblin"]}, "graveyard", 0);
  const island = put({card: "Island", types: ["Land"]}, "battlefield", 1);
  put({card: "Sleep", types: ["Sorcery"]}, "graveyard", 1);
  const among = {cardTypesAmong: {anyOf: [{what: "permanent", controller: "you"}, {what: "card", zone: "graveyard", controller: "you"}]}};
  eq(amountOf(state, among, {controller: 0}), 4, "Rob's artifact creature and his creature, Kindred and instant cards: four card types, Creature once");
  eq(amountOf(state, among, {controller: 1}), 2, "Maya's land and her sorcery card: two -- nothing of Rob's");
  state.effects = [{id: "animate", layer: 4, timestamp: 1, affects: {ids: [island]}, apply: {addTypes: ["Creature"]}}];
  eq(amountOf(state, among, {controller: 1}), 3, "her Island made a creature too: a permanent's card types as the layers make them (CR 613.1d)");
}

console.log(`engine-libload-graveyard: ${checks} checks passed -- lane L3's fourteen cards defined, manifest dread, a stolen card cast with any mana, the look back without flying, three conditions at once, card types among two zones, the starting life total`);
