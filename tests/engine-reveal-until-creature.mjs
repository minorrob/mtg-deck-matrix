/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "REVEAL CARDS FROM THE TOP OF YOUR LIBRARY UNTIL YOU REVEAL A CREATURE OR PLANESWALKER CARD. PUT THAT CARD ONTO THE
 * BATTLEFIELD AND THE REST ON THE BOTTOM OF YOUR LIBRARY IN A RANDOM ORDER" (Jace, Multiverse Architect's -3; the live-game
 * plan of 2026-10-04, its piece P3).
 *
 * Built already: `digUntil` (batch 62, script/effects/zones.mjs) with a choice of selectors (`anyOf`, script/filter.mjs)
 * and the rest put under in the game's random order (batch 80). No new engine code; this suite proves the form the new
 * cards use. A planeswalker put onto the battlefield enters with its printed loyalty (CR 306.5b); a library with neither
 * is revealed to the end and put back under (CR 701.20a is the reveal); the target gone, the ability does nothing at all
 * (CR 608.2b).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const JACE = "Jace, Multiverse Architect";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Big Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{3}{G}{G}", colors: ["G"], power: 5, toughness: 5},
  "Walker Card": {types: ["Planeswalker"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], loyalty: 5},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
};
const play = (library, setup, steps = []) => runScenario({name: "reveal until", library, setup, steps}, index.definition, FIX).state;
const names = (s, ids) => ids.map((id) => s.objects[id].card);
const library = (s, seat = 0) => names(s, s.zones.library[seat]);
const MINUS = [{activate: JACE, targets: [{card: "Bear"}]}, {resolve: true}];

/* ---- the card found onto the battlefield; the rest under what was not revealed ---- */
{
  const s = play(["Island", "Rock", "Big Bear", "Forest"], [at(0, "battlefield", JACE, "Bear")], MINUS);
  const lib = library(s);
  ok(s.zones.battlefield.some((id) => s.objects[id].card === "Big Bear"), "the Big Bear is on the battlefield");
  eq(lib[0], "Forest", "the card under the Big Bear is the top card now: it was never revealed");
  eq(lib.slice(-2).sort(), ["Island", "Rock"], "the two revealed before it are at the very bottom");
  eq(lib.length, 19, "and nothing else left the library");
}
/* ---- a planeswalker card enters with its loyalty; a creature card is no more preferred than it ---- */
{
  const s = play(["Rock", "Walker Card", "Big Bear"], [at(0, "battlefield", JACE, "Bear")], MINUS);
  const walker = s.zones.battlefield.find((id) => s.objects[id].card === "Walker Card");
  eq(walker !== undefined && s.objects[walker].counters.loyalty, 5, "the first that fits is a planeswalker card: it enters with 5 loyalty");
  eq(library(s)[0], "Big Bear", "the creature card after it is not revealed");
}
/* ---- neither in the library: every card revealed and put back under ---- */
{
  const s = play(["Island"], [at(0, "battlefield", JACE, "Bear")], MINUS);
  eq([library(s).length, s.zones.battlefield.filter((id) => s.objects[id].owner === 0).length], [20, 1], "a library of lands: all twenty back, nothing onto the battlefield but Jace");
}
/* ---- in a random order: the game's random stream, not the order revealed ---- */
{
  const s = play([], [at(0, "battlefield", "Bear")]);
  const orders = new Set();
  for (const seed of ["a", "b", "c", "d", "e", "f"]) {
    const t = structuredClone(s);
    const top = t.zones.library[0].slice(0, 6);
    for (const [i, id] of top.entries()) t.objects[id].card = `Land ${i}`;
    runEffect(t, {effect: "digUntil", selector: {anyOf: [{types: ["Creature"]}, {types: ["Planeswalker"]}]}, count: 1, found: {to: "battlefield"}, rest: "bottom"}, {controller: 0, source: null}, createRng(seed));
    orders.add(library(t).slice(-6).filter((n) => n.startsWith("Land")).join(","));
  }
  ok(orders.size > 1, "six seeds, more than one order at the bottom");
}
/* ---- the target gone before it resolves: the ability does nothing, and nothing is revealed (CR 608.2b) ---- */
{
  const s = play(["Island", "Big Bear"], [at(0, "battlefield", JACE, "Bear")], [{activate: JACE, targets: [{card: "Bear"}]}]);
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  runEffect(s, {effect: "moveZone", targets: [bear], to: "graveyard"}, {controller: 1, source: null});
  for (let n = 0; n < 20 && s.stack.length; n += 1) passPriority(s, null);
  eq([s.stack.length, library(s).slice(0, 2), s.zones.battlefield.some((id) => s.objects[id].card === "Big Bear")], [0, ["Island", "Big Bear"], false],
    "the Bear gone: the -3 left the stack, the library untouched, no Big Bear");
}
ok(index.resolve(JACE)?.playable === true, `${JACE} is defined and playable`);

console.log(`engine-reveal-until-creature: ${checks} checks passed -- reveal until a creature or planeswalker card, onto the battlefield with its loyalty, the rest under in a random order.`);
