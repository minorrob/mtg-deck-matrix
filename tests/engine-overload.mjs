/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* OVERLOAD (CR 702.96), AND A REPETITION THAT ASKS (Winds of Abandon; the live-game plan of 2026-10-04, lane W6).
 *
 * Overload (cards/index.mjs): an alternative cost whose cast carries the spell's "each" effects, with no targets, onto the
 * stack in place of its own (rules/actions.mjs, rules/stack.mjs). `repeatFor` whose effects ask is spliced into the
 * resolution for each player in turn order (script/resolution.mjs), "that player" each in turn and the resolution's own
 * subject back after. And "for each creature exiled this way, its controller": what was remembered, by who controlled it as
 * it left the battlefield (script/effects/zones.mjs `rememberedControllers`; script/amount.mjs `controlledBy`).
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const WA = "Winds of Abandon";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const SIX = ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes"];
const play = (setup, steps = [], more = {}) => runScenario({name: "overload", setup, steps, ...more}, index.definition, FIX).state;
const casts = (s) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === WA);

{
  const s = play([at(0, "battlefield", ...SIX), at(0, "hand", WA), at(1, "battlefield", "Bear")], SIX.map((l) => ({tap: l})));
  /* The mana cost too: {1}{W} from {W}{W}{C}{C}{C}{C} is paid more than one way, and was not offered until the way could be
     asked (X8b, tests/engine-pay-choice.mjs). */
  eq(casts(s).map((a) => [a.alternative, a.targets?.length ?? 0, a.payWays ?? false]), [[undefined, 1, true], [0, 0, false]],
    "{4}{W}{W} in the pool: for its mana cost at the Bear, the way to pay to be asked, or overloaded, with no target");
  const two = play([at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", WA), at(1, "battlefield", "Bear")], [{tap: "Plains"}, {tap: "Wastes"}]);
  eq(casts(two).map((a) => [a.alternative ?? "mana cost", a.targets?.length ?? 0]), [["mana cost", 1]], "{1}{W}: for its mana cost, at Maya's Bear");
  const t = play([at(0, "battlefield", ...SIX), at(0, "hand", WA)], SIX.map((l) => ({tap: l})));
  eq(casts(t).map((a) => a.alternative), [0], "no creature to target: overloaded alone");
}
{
  /* A stolen creature: Maya's Bear, controlled by Trey -- Trey searches. */
  const s = play([at(1, "battlefield", "Bear")], [], {seats: 3});
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  runEffect(s, {effect: "gainControl", targets: [bear], toPlayer: 2}, {controller: 2});
  const context = {controller: 0, source: null};
  runEffect(s, {effect: "moveZoneAll", selector: {what: "permanent", types: ["Creature"], controller: "opponent"}, to: "exile", remember: true}, context);
  const count = (player) => amountOf(s, {rememberedCount: true, controlledBy: "that player"}, {...context, about: {player}});
  eq([count(1), count(2), amountOf(s, {rememberedCount: true}, context)], [0, 1, 1], "its controller as it left, Trey, not its owner, Maya");
}
{
  const s = play([at(0, "battlefield", ...SIX), at(0, "hand", WA), at(1, "battlefield", "Bear"), at(2, "battlefield", "Bear")],
    [...SIX.map((l) => ({tap: l})), {cast: WA, alternative: 0}, {resolve: true}], {seats: 3});
  eq(s.awaiting?.player, 1, "each player in turn order from Rob: Maya first");
  ok(s.resolving?.context?.about?.player === 1, "Maya is \"that player\" while Maya searches");
}
{
  const bad = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
    oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "repeatFor", each: "player", effects: [{effect: "addTurn"}]}]}]});
  ok(bad.problems.some((p) => p.includes("repeatFor: addTurn is not something that repeats")), "what repeats is built, or it is refused");
  const odd = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
    oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "draw", count: {rememberedCount: true, controlledBy: "you"}}]}]});
  ok(odd.problems.some((p) => p.includes('controlledBy is "that player"')), "controlledBy is \"that player\"");
}
ok(index.resolve(WA)?.playable === true, `${WA} is defined and playable`);

console.log(`engine-overload: ${checks} checks passed -- overload offered beside the mana cost, with no target; a repetition that asks, each player in turn; each search by the creature's controller as it left.`);
