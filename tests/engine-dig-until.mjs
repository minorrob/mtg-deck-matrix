/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 62 (THE CATALOG'S ORDER): "REVEAL CARDS FROM THE TOP OF YOUR LIBRARY UNTIL ..." (Forge's DigUntil).
 *
 * For each player it names, cards from the top until one fits -- or until those taken total a mana value -- revealed or
 * exiled as they are taken; the one that fits to where it says (tapped, or remembered for what comes after), the rest to
 * a graveyard, the bottom of the library (in the order taken: no random stream reaches a plain effect yet) or exile; a
 * library that runs out stops it. And "whenever you cast a legendary spell from your hand" knows where it was cast from.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name, more = {}) => ({card: name, types: ["Creature"], manaCost: "{2}", power: 2, toughness: 2, ...more});
const LAND = (name, more = {}) => ({card: name, types: ["Land"], ...more});
function table(seats = 2, top = []) {
  const s = createState({matchId: "m", seed: "dig", players: Array.from({length: seats}, (_, i) => ({name: `P${i}`}))});
  for (let seat = 0; seat < seats; seat += 1) {
    for (const o of top) addObject(s, {...o, owner: seat, controller: seat}, "library", seat);
    for (let i = 0; i < 3; i += 1) addObject(s, {...LAND("Wastes", {supertypes: ["Basic"]}), owner: seat, controller: seat}, "library", seat);
  }
  return s;
}
const names = (s, zone, seat) => cardsIn(s, zone, seat).map((id) => s.objects[id].card);
/* Exile is one zone: a player's cards in it, by owner. */
const exiled = (s, seat) => s.zones.exile.filter((id) => s.objects[id].owner === seat).map((id) => s.objects[id].card);
const dig = (s, params, controller = 0) => { const context = {controller, source: null}; const events = runEffects(s, [{effect: "digUntil", ...params}], context); return {events, context}; };

{
  /* Until a basic land: the Forest to his hand, the two before it to his graveyard, each revealed. */
  const s = table(2, [card("Bear"), LAND("Grove"), LAND("Forest", {supertypes: ["Basic"]})]);
  const {events} = dig(s, {selector: {types: ["Land"], supertypes: ["Basic"]}, found: {to: "hand"}, rest: "graveyard"});
  eq([names(s, "hand", 0), names(s, "graveyard", 0), events.filter((e) => e.kind === "GameEventCardRevealed").length], [["Forest"], ["Bear", "Grove"], 3],
    "the Forest to his hand; the Bear and the nonbasic Grove to his graveyard; three revealed");
}
{
  /* Until a land: onto the battlefield tapped, the rest to the bottom in the order taken. */
  const s = table(2, [card("Bear"), card("Ogre"), LAND("Forest")]);
  dig(s, {selector: {types: ["Land"]}, found: {to: "battlefield", tapped: true}, rest: "bottom"});
  const forest = s.zones.battlefield.find((id) => s.objects[id].card === "Forest");
  eq([s.objects[forest]?.tapped, names(s, "library", 0)], [true, ["Wastes", "Wastes", "Wastes", "Bear", "Ogre"]], "the Forest tapped; the Bear and the Ogre at the bottom, in that order");
}
{
  /* Exiled until they total 20 or more, each opponent's -- in a three-player game, not his own. */
  const s = table(3, [card("Titan", {manaCost: "{6}"}), card("Titan", {manaCost: "{6}"}), card("Titan", {manaCost: "{6}"}), card("Titan", {manaCost: "{6}"}), card("Titan", {manaCost: "{6}"})]);
  dig(s, {who: "opponent", exile: true, totalManaValue: 20, rest: "exile"});
  eq([exiled(s, 1).length, exiled(s, 2).length, exiled(s, 0).length, names(s, "library", 1).length], [4, 4, 0, 4], "four Titans (24) from each opponent, none from him; one Titan and the Wastes left");
  /* A library that runs out stops it: nothing found, everything taken. */
  const t = table(2, [card("Bear")]);
  const {context} = dig(t, {selector: {types: ["Artifact"]}, found: {to: "hand"}, rest: "graveyard", remember: true});
  eq([names(t, "graveyard", 0).length, names(t, "library", 0).length, context.remembered], [4, 0, []], "no artifact: all four to the graveyard, nothing remembered");
}
{
  /* "Of lesser mana value" (Jodah): exiled until a legendary nonland card with mana value less than 3 -- the legendary 4 and
     the Bear passed -- and remembered; the rest to the bottom. */
  const s = table(2, [card("Old King", {manaCost: "{4}", supertypes: ["Legendary"]}), card("Bear"), card("Sage", {manaCost: "{1}{U}", supertypes: ["Legendary"]})]);
  const {context} = dig(s, {exile: true, selector: {supertypes: ["Legendary"], nonTypes: ["Land"]}, manaValueBelow: 3, remember: true, rest: "bottom"});
  eq([context.remembered.map((id) => s.objects[id].card), exiled(s, 0), names(s, "library", 0).slice(-2)], [["Sage"], ["Sage"], ["Old King", "Bear"]],
    "the Sage remembered, in exile; the Old King and the Bear on the bottom");
}
{
  /* "From your hand": Jodah does not see his legendary commander cast from the command zone. */
  const fix = {Hero: {types: ["Creature"], manaCost: "{2}{W}", colors: ["W"], supertypes: ["Legendary"], power: 2, toughness: 2}};
  const {state: s} = runScenario({name: "jodah", setup: [{seat: 0, zone: "battlefield", cards: ["Jodah, the Unifier", "Plains", "Wastes", "Wastes"]}, {seat: 0, zone: "command", cards: ["Hero"]}],
    steps: [{tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Hero"}], expect: []}, cards.definition, fix);
  eq([s.stack.map((e) => e.kind), (s.pendingTriggers ?? []).length], [["spell"], 0], "cast from the command zone: no trigger");
  eq(missingFor({apis: ["DigUntil"]}), [], "the catalog credits DigUntil");
}

console.log(`engine-dig-until: ${checks} checks passed — from the top until one fits or the total is reached, revealed or exiled; the one found where it says, the rest to a graveyard, the bottom or exile; a library that runs out; cast from your hand.`);
