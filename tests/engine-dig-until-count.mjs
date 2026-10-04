/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "REVEAL CARDS ... UNTIL YOU REVEAL THAT MANY CREATURE CARDS" (Rob's Priority Batch 10.3, its thirty-first slice: Mass
 * Polymorph, the 87th card of Rob's list, and Synthetic Destiny, the 110th).
 *
 * digUntil (script/effects/zones.mjs) took cards from the top until one fit. Now `count` says how many to find -- each put
 * where `found` says, "put all creature cards revealed this way onto the battlefield" -- and 0 reveals nothing. `rest:
 * "shuffle"` is "then shuffle the rest of the revealed cards into your library": they never left it, so it is shuffled, if
 * anything was revealed. A library that runs out first stops it with what it found.
 *
 * "That many" is the effect before it: the creatures exiled (moveZoneAll's `remember`, counted by `rememberedCount`).
 * Synthetic Destiny waits for the end step, when that resolution is long over, so a delayed trigger counts its "this
 * way" amounts as it is made (script/bind.mjs, rememberNow) -- `rememberedCount` and `lifeLostThisWay` -- as it already
 * bound its targets.
 *
 * The card scenarios play the cards: two creatures exiled and two found, none exiled and nothing revealed, and the end
 * step's reveal with a creature cast meanwhile. This suite holds the count and its edges, the shuffle, and the binding.
 */
import assert from "node:assert/strict";
import {createState, addObject, cardsIn} from "../game/engine/state/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {rememberNow} from "../game/engine/script/bind.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const card = (name, more = {}) => ({card: name, types: ["Creature"], manaCost: "{2}", power: 2, toughness: 2, ...more});
const LAND = (name) => ({card: name, types: ["Land"]});
function table(top = []) {
  const s = createState({matchId: "m", seed: "dig-count", players: [{name: "Rob"}, {name: "Maya"}]});
  for (const o of top) addObject(s, {...o, owner: 0, controller: 0}, "library", 0);
  return s;
}
const names = (s, zone, seat = 0) => cardsIn(s, zone, seat).map((id) => s.objects[id].card);
const battlefield = (s) => s.zones.battlefield.map((id) => s.objects[id].card);
const dig = (s, params) => runEffects(s, [{effect: "digUntil", who: "you", selector: {types: ["Creature"]}, found: {to: "battlefield"}, ...params}],
  {controller: 0, source: null}, createRng("dig-count"));
const kinds = (events, kind) => events.filter((e) => e.kind === kind).length;

/* ---- how many ---- */
{
  const s = table([LAND("Island"), card("Giant"), LAND("Forest"), card("Wolf"), card("Bear"), LAND("Plains")]);
  const events = dig(s, {count: 2, rest: "shuffle"});
  eq([battlefield(s).sort(), kinds(events, "GameEventCardRevealed"), kinds(events, "GameEventShuffle")], [["Giant", "Wolf"], 4, 1],
    "two creature cards wanted: four revealed -- Island, Giant, Forest, Wolf -- the two creatures onto the battlefield, the library shuffled");
  eq(names(s, "library").sort(), ["Bear", "Forest", "Island", "Plains"], "the rest are still in the library, the Bear never revealed");
}
{
  const s = table([card("Giant"), LAND("Forest")]);
  const events = dig(s, {count: 0, rest: "shuffle"});
  eq([battlefield(s), kinds(events, "GameEventCardRevealed"), kinds(events, "GameEventShuffle")], [[], 0, 0], "none wanted: nothing revealed, nothing shuffled");
}
{
  const s = table([LAND("Island"), card("Giant"), LAND("Forest")]);
  const events = dig(s, {count: 3, rest: "shuffle"});
  eq([battlefield(s), kinds(events, "GameEventCardRevealed"), names(s, "library").sort()], [["Giant"], 3, ["Forest", "Island"]],
    "three wanted, one in the library: all three revealed, the one creature found, the library run out");
}
{
  /* One, as it was: the first that fits, the rest where `rest` says. */
  const s = table([LAND("Island"), card("Giant"), card("Wolf")]);
  dig(s, {rest: "bottom"});
  eq([battlefield(s), names(s, "library")], [["Giant"], ["Wolf", "Island"]], "no count: one creature, the Island to the bottom");
}

/* ---- "that many", bound as a delayed trigger is made ---- */
{
  const context = {controller: 0, source: null, remembered: [11, 12], lifeLost: 3};
  const [bound, life] = rememberNow([{effect: "digUntil", who: "you", count: {rememberedCount: true}, rest: "shuffle"}, {effect: "gainLife", amount: {lifeLostThisWay: true, times: 2}}], context);
  eq([bound.count, life.amount], [2, 6], "the delayed trigger's \"that many\" is the two remembered now; the life lost this way, 3, twice");
  const [left] = rememberNow([{effect: "draw", count: {count: {what: "permanent", types: ["Creature"], controller: "you"}}}], context);
  ok(typeof left.count === "object", "a count of the board is not this resolution's: it is counted when the trigger resolves");
}

for (const name of ["Mass Polymorph", "Synthetic Destiny"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-dig-until-count: ${checks} checks passed -- cards from the top until that many fit, all of them found; none wanted, none revealed; a library run out; the rest shuffled in; "that many" bound as a delayed trigger is made.`);
