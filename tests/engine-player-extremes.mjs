/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVERY PLAYER'S, COMPARED (Train C phase 2, w2a-selectors): "if a player has one or fewer cards in hand" (Naktamun
 * Lorespinner), "if that opponent has more life than another of your opponents ... that attacking player draws a card"
 * (Breena, the Demagogue), "+2/+0 for each graveyard with seven or more cards in it" (Master's Councillors).
 *
 *   {fewestAmongPlayers: selector}             script/amount.mjs: the fewest the selector counts as any player still in the
 *                                              game sees it, "you" that player (CR 800.4a)
 *   {graveyardsWithAtLeast: n}                 script/amount.mjs: the graveyards, of players still in the game, holding n
 *                                              or more cards (CR 404.1)
 *   {lifeAboveAnotherOpponent: "that player"}  script/condition.mjs: the player a trigger is about has more life than
 *                                              another opponent of its controller still in the game (CR 119.1)
 *   who: "attacking player"                    script/bind.mjs: the player whose attack the trigger is about
 *
 * The cards' scenarios play the three cards; this suite holds four seats, a player who has left, ties, the controller's own
 * life, two defenders at once, a count that moves with the graveyards, and the grammar.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const fresh = () => createState({matchId: "m", seed: "extremes", players: ["Rob", "Maya", "Trey", "Sam"].map((name) => ({name}))});
const cards = (s, seat, zone, n) => { for (let i = 0; i < n; i += 1) addObject(s, {card: "Wastes", types: ["Land"], owner: seat, controller: seat}, zone, seat); };

/* ---- the fewest cards in hand among all players ---- */
{
  const s = fresh();
  [3, 4, 2, 5].forEach((n, seat) => cards(s, seat, "hand", n));
  const HAND = {fewestAmongPlayers: {what: "card", zone: "hand", controller: "you"}};
  eq(amountOf(s, HAND, {controller: 0}), 2, "Trey's two are the fewest, whoever asks");
  eq(amountOf(s, HAND, {controller: 3}), 2, "Sam asking: the same");
  s.players[2].lost = true;
  eq(amountOf(s, HAND, {controller: 0}), 3, "Trey gone: Rob's three are the fewest of those still in the game");
  const fewer = {compare: {count: HAND, atMost: 1}};
  ok(!conditionHolds(s, fewer, {controller: 0}), "nobody still in has one or fewer");
  s.zones.hand[1] = s.zones.hand[1].slice(0, 1);
  ok(conditionHolds(s, fewer, {controller: 0}), "Maya down to one: a player has one or fewer");
  eq(amountProblems({fewestAmongPlayers: {what: "card", zone: "hand", handful: true}}).length, 1, "what it counts is held to the selector grammar");
}

/* ---- the graveyards with seven or more cards ---- */
{
  const s = fresh();
  [7, 6, 9, 8].forEach((n, seat) => cards(s, seat, "graveyard", n));
  eq(amountOf(s, {graveyardsWithAtLeast: 7}, {controller: 0}), 3, "seven, nine and eight: three graveyards; Maya's six is not one");
  eq(amountOf(s, {graveyardsWithAtLeast: 7, times: 2}, {controller: 1}), 6, "twice that, whoever asks");
  s.players[3].lost = true;
  eq(amountOf(s, {graveyardsWithAtLeast: 7}, {controller: 0}), 2, "Sam has left the game: his is no graveyard in it");
  for (const bad of [0, 2.5, "seven"]) ok(amountProblems({graveyardsWithAtLeast: bad}).length > 0, `graveyardsWithAtLeast ${JSON.stringify(bad)} is refused`);
}
{
  /* Master's Councillors counts continuously, as every static's amount is (CR 611.3a; rules/layers.mjs): a graveyard that
     reaches seven makes it bigger at once. */
  const {state: s} = runScenario({name: "councillors", seats: 3, setup: [{seat: 0, zone: "battlefield", cards: ["Master's Councillors"]}, {seat: 2, zone: "graveyard", cards: Array(6).fill("Wastes")}]}, index.definition, {});
  const id = s.zones.battlefield.find((x) => s.objects[x].card === "Master's Councillors");
  eq(characteristicsOf(s, id).power, 1, "no graveyard of seven: a 1/3");
  cards(s, 2, "graveyard", 1);
  eq(characteristicsOf(s, id).power, 3, "Trey's reaches seven: a 3/3 at once");
  cards(s, 1, "graveyard", 7);
  eq([characteristicsOf(s, id).power, characteristicsOf(s, id).toughness], [5, 3], "and Maya's: a 5/3");
}

/* ---- more life than another of your opponents ---- */
{
  const s = fresh();
  const above = (player, controller = 0) => conditionHolds(s, {lifeAboveAnotherOpponent: "that player"}, {controller, about: {player}});
  Object.assign(s.players[1], {life: 30}); Object.assign(s.players[2], {life: 30}); Object.assign(s.players[3], {life: 40});
  ok(above(3), "Sam at 40, Maya at 30: Sam has more life than another of Rob's opponents");
  ok(!above(1), "Maya at 30, Trey at 30, Sam at 40: a tie is not more");
  s.players[0].life = 10;
  ok(!above(1), "Rob at 10 is not one of his own opponents");
  ok(above(1, 2), "but from Trey's side, Rob is: Maya has more life than Rob");
  Object.assign(s.players[1], {life: 40}); Object.assign(s.players[2], {life: 10, lost: true});
  ok(!above(1), "Maya and Sam at 40, Trey at 10 but gone from the game: he is no opponent to be compared");
  s.players[1].life = 20;
  ok(above(3), "Sam at 40, Maya at 20");
  s.players[1].lost = true;
  ok(!above(3), "Sam the only opponent still in: no other to have more life than");
  ok(!above(undefined), "no player the trigger is about: it does not hold");
  eq(conditionProblems({lifeAboveAnotherOpponent: "you"}).length, 1, "it is about \"that player\" only");
}

/* ---- "that attacking player" ---- */
{
  eq(bindEffect({effect: "draw", who: "attacking player", count: 1}, {controller: 0, about: {player: 2, attacker: 1}}).who, [1], "the player whose attack it is about");
  eq(bindEffect({effect: "draw", who: "attacking player", count: 1}, {controller: 0, about: {player: 2}}).who, [], "no attack: nobody");
}

/* ---- Breena at a table of four: Rob attacks two opponents at once, each its own trigger ---- */
{
  const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}", colors: ["G"], power: 2, toughness: 2}};
  const {state: s} = runScenario({name: "breena", seats: 4, setup: [{seat: 0, zone: "battlefield", cards: ["Breena, the Demagogue", "Bear", "Bear"]}]}, index.definition, FIX);
  s.players[2].life = 20; s.players[3].life = 30;
  for (let n = 0; n < 50 && s.awaiting?.kind !== "declare-attackers"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  const options = awaitingChoice(s).options, bears = [...new Set(options.filter((o) => s.objects[o.cardId].card === "Bear").map((o) => o.cardId))];
  /* One Bear at Maya (40), one at Trey (20): Maya has more life than Trey and Sam, Trey than none of them. */
  resolveAwaiting(s, [options.find((o) => o.cardId === bears[0] && o.defenderId === 1).index, options.find((o) => o.cardId === bears[1] && o.defenderId === 2).index]);
  const pending = [...(s.pendingTriggers ?? []), ...s.stack.filter((e) => e.kind === "trigger")];
  eq(pending.map((t) => t.about?.player), [1], "one trigger: for Maya, not for Trey, who has less life than every other opponent");
  const hand = s.zones.hand[0].length;
  for (let n = 0; n < 30 && (s.awaiting || s.stack.length || (s.pendingTriggers ?? []).length); n += 1) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.options.slice(0, Math.max(1, c.min ?? 0)).map((o) => o.index)); continue; }
    passPriority(s);
  }
  eq(s.zones.hand[0].length, hand + 1, "Rob, the attacking player, draws one card");
}
{
  const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}", colors: ["G"], power: 2, toughness: 2}};
  const {state: s} = runScenario({name: "breena-if", seats: 3, setup: [{seat: 0, zone: "battlefield", cards: ["Breena, the Demagogue", "Bear"]}]}, index.definition, FIX);
  s.players[2].life = 20;
  for (let n = 0; n < 50 && s.awaiting?.kind !== "declare-attackers"; n += 1) { if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, [options.find((o) => s.objects[o.cardId].card === "Bear" && o.defenderId === 1).index]);
  for (let n = 0; n < 5 && !s.stack.length; n += 1) if (s.awaiting) resolveAwaiting(s, [0]); else break;
  eq(s.stack.filter((e) => e.kind === "trigger").length, 1, "Rob attacks Maya at 40 with Trey at 20: it triggers");
  s.players[1].life = 20;
  const hand = s.zones.hand[0].length;
  for (let n = 0; n < 30 && (s.awaiting || s.stack.length); n += 1) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.options.slice(0, Math.max(1, c.min ?? 0)).map((o) => o.index)); continue; }
    passPriority(s);
  }
  eq(s.zones.hand[0].length, hand, "Maya at 20 by the time it resolves -- no more than Trey: it does nothing (CR 603.4)");
}

console.log(`engine-player-extremes: ${checks} checks passed`);
