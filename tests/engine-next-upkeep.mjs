/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "EXILE THOSE CREATURES AT THE BEGINNING OF YOUR NEXT UPKEEP" AND "MANA VALUE X OR LESS" (Rally the Ancestors; AI 3's Teysa
 * deck).
 *
 * A delayed trigger may wait for "your upkeep" (cards/index.mjs, DELAYED_MOMENTS): the next upkeep of a turn that is its
 * controller's (rules/trigger.mjs) -- every other player's passes it by -- and one made during its controller's own upkeep
 * waits for the next (CR 603.7). What it exiles was remembered as it was made (CR 603.7c), and a creature that has left
 * since is a new object it does not touch (CR 400.7). A selector's mana value may be at most X (script/filter.mjs), the X
 * paid. The card scenarios play the card in two players; this suite holds four, a Rally cast on another's turn and in an
 * upkeep, the selector and the compile.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const N = "Rally the Ancestors";
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Elf: {types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], power: 1, toughness: 1}};
const at = (seat, zone, ...list) => ({seat, zone, cards: list});
const where = (state, name) => Object.values(state.objects).filter((o) => o.card === name).map((o) => o.zone).sort();
const pay = (seat) => [{tap: "Plains", seat}, {tap: "Plains", seat}, {tap: "Wastes", seat}, {tap: "Wastes", seat}];
const play = (scenario, cut = Infinity) => runScenario({...scenario, steps: scenario.steps.slice(0, cut)}, cards.definition, FIX).state;

/* ---- four players: Rob's next upkeep is the fifth turn's ---- */
{
  const base = {name: "rally four", seats: 4, setup: [at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes"), at(0, "hand", N), at(0, "graveyard", "Bear", "Elf")],
    steps: [...pay(0), {cast: N, x: 2}, {resolve: true}]};
  for (const turn of [2, 3, 4]) {
    const s = play({...base, steps: [...base.steps, {to: {turn, phase: "MAIN1"}}]});
    eq(where(s, "Bear"), ["battlefield"], `turn ${turn}, another player's: the Bear is still on the battlefield`);
  }
  const s = play({...base, steps: [...base.steps, {to: {turn: 5, phase: "MAIN1"}}]});
  eq([where(s, "Bear"), where(s, "Elf"), (s.delayedTriggers ?? []).length], [["exile"], ["exile"], 0], "turn 5, Rob's upkeep: both exiled, and the trigger is spent");
}

/* ---- cast by Maya on Rob's turn: her next upkeep is the very next turn ---- */
{
  const s = play({name: "rally maya", setup: [at(1, "battlefield", "Plains", "Plains", "Wastes", "Wastes"), at(1, "hand", N), at(1, "graveyard", "Elf")],
    steps: [{pass: 1}, ...pay(1), {cast: N, x: 1, seat: 1}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}]});
  eq(where(s, "Elf"), ["exile"], "Maya's Rally, cast on Rob's turn: her Elf exiled at her upkeep, on turn 2");
}

/* ---- made during Rob's own upkeep: it waits for his next one ---- */
{
  const base = {name: "rally upkeep", at: {turn: 3, phase: "UPKEEP"}, setup: [at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes"), at(0, "hand", N), at(0, "graveyard", "Elf")],
    steps: [...pay(0), {cast: N, x: 1}, {resolve: true}]};
  eq(where(play({...base, steps: [...base.steps, {to: {turn: 4, phase: "MAIN1"}}]}), "Elf"), ["battlefield"], "cast in his upkeep on turn 3: still there on turn 4");
  eq(where(play({...base, steps: [...base.steps, {to: {turn: 5, phase: "MAIN1"}}]}), "Elf"), ["exile"], "and exiled at turn 5's upkeep");
}

/* ---- "mana value X or less" ---- */
{
  const s = createState({matchId: "m", seed: "rally", players: [{name: "Rob"}, {name: "Maya"}]});
  const bear = addObject(s, {card: "Bear", types: ["Creature"], manaCost: "{1}{G}", owner: 0, controller: 0}, "graveyard", 0);
  const ogre = addObject(s, {card: "Ogre", types: ["Creature"], manaCost: "{2}{R}", owner: 0, controller: 0}, "graveyard", 0);
  const atMostX = compileSelector({what: "card", zone: "graveyard", manaValue: {max: "X"}});
  eq([atMostX(s, bear, {controller: 0, x: 2}), atMostX(s, ogre, {controller: 0, x: 2}), atMostX(s, bear, {controller: 0})], [true, false, false], "X 2: the Bear's 2, not the Ogre's 3; no X, and it is 0");
}

/* ---- the compile: "your upkeep" waits; no other moment ---- */
{
  ok(cards.resolve(N).playable, "Rally the Ancestors is playable");
  const odd = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
    oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "delayedTrigger", at: "their upkeep", effects: [{effect: "gainLife", amount: 1}]}]}]});
  ok(odd.problems.some((p) => p.includes("their upkeep")), "a moment no delayed trigger waits for is refused by name");
}

console.log(`engine-next-upkeep: ${checks} checks passed -- "your next upkeep" waits for its controller's own, past every other player's, and "mana value X or less" reads the X paid.`);
