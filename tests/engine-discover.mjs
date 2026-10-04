/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* DISCOVER, AND "ADD {R} FOR EACH CARD EXILED THIS WAY" (Quintorius Kand; the live-game plan of 2026-10-04, lane W6).
 *
 * Discover N (CR 701.57a) is written with what was built: cards exiled from the top until a nonland card of mana value N
 * or less (digUntil, `exile`), the rest put under in a random order; that card cast without paying its mana cost, or not
 * (play, `free`); not cast, into its owner's hand. addMana's `count` (script/effects/resources.mjs): that much of the mana,
 * counted as it resolves.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const QK = "Quintorius Kand";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Big Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{3}{G}{G}", colors: ["G"], power: 5, toughness: 5}};
const play = (setup, steps = [], more = {}) => runScenario({name: "discover", setup, steps, ...more}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);

{
  const s = play([at(0, "battlefield", QK)], [{activate: QK, ability: "a2"}, {resolve: true}], {library: ["Big Bear", "Island", "Bear"]});
  eq(s.awaiting?.choices?.map((c) => s.objects[c.objectId].card), ["Bear"], "discover 4: past the Big Bear (mana value 5) and the Island, to the Bear");
  const under = s.zones.library[0].slice(-2).map((id) => s.objects[id].card).sort();
  eq(under, ["Big Bear", "Island"], "the two passed over, at the bottom");
}
{
  const s = play([at(0, "battlefield", QK)], [{activate: QK, ability: "a2"}, {resolve: true}, {answer: [0]}], {library: ["Island", "Bear"], seats: 4});
  for (let n = 0; n < 20 && s.stack.length; n += 1) passPriority(s, null);
  eq(s.players.map((p) => p.life), [42, 38, 38, 38], "cast from exile: 2 damage to each opponent, 2 life for Rob");
}
{
  const s = play([at(0, "battlefield", QK), at(0, "graveyard", "Bear", "Island", "Big Bear")]);
  const kand = idOf(s, QK);
  s.objects[kand].counters.loyalty = 7;
  const offer = legalActions(s, 0).find((a) => a.objectId === kand && a.loyalty === -6 && a.targets?.length === 1);
  applyAction(s, 0, offer);
  if (s.awaiting?.kind === "choose-targets") {
    const {awaitingChoice, resolveAwaiting} = await import("../game/engine/rules/turn.mjs");
    const choice = awaitingChoice(s);
    resolveAwaiting(s, choice.options.filter((o) => ["Bear", "Island"].includes(o.label)).map((o) => o.index));
  }
  for (let n = 0; n < 20 && s.stack.length; n += 1) passPriority(s, null);
  eq([s.players[0].manaPool.R, s.zones.exile.length, s.zones.graveyard[0].map((id) => s.objects[id].card)], [2, 2, ["Big Bear"]], "-6 on two cards: exiled, {R}{R}, the third left");
  runEffect(s, {effect: "addMana", mana: {G: 1}}, {controller: 0});
  eq(legalActions(s, 0).filter((a) => ["cast", "play-land"].includes(a.kind) && s.objects[a.objectId].zone === "exile").map((a) => s.objects[a.objectId].card).sort(), ["Bear", "Island"],
    "and both may be played from exile this turn (a {G} added, the Bear's {1}{G} paid with an {R})");
}
{
  const s = play([]);
  runEffect(s, {effect: "addMana", mana: {R: 1}, count: 3}, {controller: 0});
  runEffect(s, {effect: "addMana", mana: {G: 1}, count: 0}, {controller: 0});
  eq([s.players[0].manaPool.R, s.players[0].manaPool.G ?? 0], [3, 0], "addMana's count: three of it; none of it");
}

console.log(`engine-discover: ${checks} checks passed -- discover past what doesn't fit, the rest under; cast from exile, each opponent dealt 2; mana for each card exiled, and those cards played this turn.`);
