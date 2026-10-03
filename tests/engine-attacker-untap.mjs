/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 75 (TWO ITEMS OF THEIR OWN): A PLAYER REFERENCE TO AN ATTACKING CREATURE'S CONTROLLER, AND THE COST
 * "UNTAP A TAPPED CREATURE YOU CONTROL".
 *
 * "Whenever a goaded creature attacks, it deals 1 damage to its controller" (Vengeful Ancestor): `"that card's
 * controller"`, the controller of what the trigger is about -- now, while it is on the battlefield (a creature stolen
 * since is its new controller's); gone, the one it last had (CR 608.2h), the player who attacked with it (CR 508.1a).
 * "Untap a tapped creature you control", "untap two", "untap fifteen" (Halo Fountain): the `untapCreature` cost atom --
 * which ones, chosen as it is activated, one offer per set (no more than the crew cap), and only tapped creatures their
 * activator controls: not an opponent's, not a tapped land's, but a creature that came under his control this turn,
 * since untapping it is not its own {T} (CR 302.6).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {advance, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction, costAtomBuilt} from "../game/engine/rules/actions.mjs";
import {bindEffect, rememberNow} from "../game/engine/script/bind.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const creature = (cost, power, more = {}) => ({types: ["Creature"], manaCost: cost, colors: ["G"], power, toughness: power, ...more});
const FIX = {Bear: creature("{1}{G}", 2), Ogre: creature("{2}{R}", 3), Elf: creature("{G}", 1)};
const play = (setup, seats = 3) => runScenario({name: "batch 75", seats, setup, steps: [], expect: []}, cards.definition, FIX).state;
const named = (s, name, seat) => s.zones.battlefield.filter((id) => s.objects[id].card === name && (seat === undefined || s.objects[id].controller === seat));
const life = (s) => s.players.map((p) => p.life);
/* On to that player's turn, its first priority, every question answered with nothing. */
const turnOf = (s, player) => { for (let n = 0; n < 300 && !(s.activePlayer === player && s.priorityPlayer !== null); n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); } };
const goad = (s, by, ids) => runEffects(s, [{effect: "goad", targets: ids}], {controller: by, source: null});

/* ---- the cost atom ---- */
{
  eq([{atom: "untapCreature", count: 1}, {atom: "untapCreature", count: 15}].map(costAtomBuilt), [true, true], "untap one, or fifteen: built");
  eq([{atom: "untapCreature"}, {atom: "untapCreature", count: 0}, {atom: "untapCreature", count: -1}, {atom: "untapCreature", count: 1.5}, {atom: "untapCreature", count: "2"}].map(costAtomBuilt),
    [false, false, false, false, false], "how many unsaid, none, fewer than none, half of one, or a word: not a cost the engine pays");
}

/* ---- which creatures it untaps, offered ---- */
const fountainOffers = (s, ability) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Halo Fountain" && a.abilityId === ability);
const tap = (s, ...ids) => { for (const id of ids) s.objects[id].tapped = true; };
{
  /* Rob's three tapped Bears, his tapped Plains, his untapped Ogre, Maya's tapped Elf: the Bears only. */
  const s = play([at(0, "battlefield", "Halo Fountain", "Bear", "Bear", "Bear", "Plains", "Ogre"), at(1, "battlefield", "Elf")]);
  tap(s, ...named(s, "Bear"), ...named(s, "Plains"), ...named(s, "Elf"));
  s.players[0].manaPool.W = 5;
  const bears = named(s, "Bear");
  eq(fountainOffers(s, "a0").map((a) => a.costChoice.untap), bears.map((id) => [id]), "untap one: one offer per tapped creature he controls");
  eq(fountainOffers(s, "a0").map((a) => a.costNames), [["Bear"], ["Bear"], ["Bear"]], "each names what it untaps");
  eq(fountainOffers(s, "a1").map((a) => a.costChoice.untap), [[bears[0], bears[1]], [bears[0], bears[2]], [bears[1], bears[2]]], "untap two: each pair");
  eq(fountainOffers(s, "a2").length, 0, "untap fifteen, with three: not offered");
  /* Paying: the chosen two untapped, each with its event (for "whenever a creature becomes untapped" and the log), the
     third still tapped, the Fountain tapped. */
  const events = applyAction(s, 0, fountainOffers(s, "a1")[1]);
  eq([bears.map((id) => s.objects[id].tapped), s.objects[named(s, "Halo Fountain")[0]].tapped], [[false, true, false], true], "the two chosen untapped; the Fountain tapped");
  eq(events.filter((e) => e.kind === "GameEventCardTapped" && e.data.fields.tapped === false).map((e) => e.data.fields.card.cardId), [bears[0], bears[2]], "an untap event each");
}
{
  /* An offer gone stale -- the creature it would untap is untapped already -- is refused. */
  const s = play([at(0, "battlefield", "Halo Fountain", "Bear")]);
  tap(s, ...named(s, "Bear"));
  s.players[0].manaPool.W = 1;
  const [offer] = fountainOffers(s, "a0");
  s.objects[named(s, "Bear")[0]].tapped = false;
  assert.throws(() => applyAction(s, 0, offer), /not a legal action/);
  checks += 1;
}
{
  /* A creature that came under his control this turn: untapping it is not its own {T}, so it may be untapped. */
  const s = play([at(0, "battlefield", "Halo Fountain"), {...at(0, "battlefield", "Bear"), sick: true}]);
  tap(s, ...named(s, "Bear"));
  s.players[0].manaPool.W = 1;
  eq(fountainOffers(s, "a0").length, 1, "a summoning-sick tapped creature: offered");
}
{
  /* Sixteen tapped creatures: sixteen ways to untap fifteen. Twenty (15,504 ways): the crew cap of sets, found at once. */
  const s = play([at(0, "battlefield", "Halo Fountain", ...Array(16).fill("Elf"))]);
  tap(s, ...named(s, "Elf"));
  s.players[0].manaPool.W = 5;
  eq(fountainOffers(s, "a2").length, 16, "sixteen tapped: sixteen sets of fifteen");
  const t = play([at(0, "battlefield", "Halo Fountain", ...Array(20).fill("Elf"))]);
  tap(t, ...named(t, "Elf"));
  t.players[0].manaPool.W = 5;
  const started = Date.now(), offers = fountainOffers(t, "a2");
  eq([offers.length, offers.every((a) => a.costChoice.untap.length === 15), Date.now() - started < 2000], [64, true, true], "twenty tapped: 64 sets, each fifteen, quickly");
}

/* ---- "its controller" ---- */
{
  const s = play([at(1, "battlefield", "Bear")]);
  const [bear] = named(s, "Bear");
  const who = (context) => bindEffect({effect: "dealDamage", who: "that card's controller", amount: 1}, context, s).who;
  eq(who({controller: 0, about: {card: bear, player: 0, controller: 1}}), [1], "on the battlefield: its controller");
  runEffects(s, [{effect: "gainControl", targets: [bear]}], {controller: 2, source: null});
  eq(who({controller: 0, about: {card: bear, player: 0, controller: 1}}), [2], "stolen since it attacked: its controller now (CR 608.2h)");
  eq(who({controller: 0, about: {card: 9999, player: 0, controller: 1}}), [1], "gone: the controller it last had, as it attacked");
  eq([who({controller: 0}), who({controller: 0, about: {card: 9999, player: 0}})], [[], []], "nothing it is about, or gone with no controller known: no one");
  eq(bindEffect({effect: "dealDamage", who: "that card's controller", amount: 1}, {controller: 0, about: {card: bear, controller: 1}}).who, [1],
    "bound with no state to read: the controller it attacked with");
  /* A delayed trigger that waits for an event keeps it for THAT event. */
  eq(rememberNow([{effect: "dealDamage", who: "that card's controller", amount: 1}], {controller: 0, about: {card: bear, controller: 1}}, {keepThat: true})[0].who,
    "that card's controller", "kept for the event a delayed trigger waits for");
}
{
  /* Maya's goaded Bear attacks; with the trigger on the stack, Trey takes the Bear: as it resolves, "its controller" is
     Trey (CR 608.2h -- it is still on the battlefield, so its current controller). */
  const s = play([at(0, "battlefield", "Vengeful Ancestor"), at(1, "battlefield", "Bear")]);
  const [bear] = named(s, "Bear");
  goad(s, 0, [bear]);
  for (let n = 0; n < 300 && !(s.activePlayer === 1 && s.stack.length); n += 1) { if (s.awaiting) resolveAwaiting(s, []); else if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s); }
  runEffects(s, [{effect: "gainControl", targets: [bear]}], {controller: 2, source: null});
  while (s.stack.length) passPriority(s);
  eq(life(s), [40, 40, 39], "stolen in response: Trey, its controller now, takes the 1");
}
{
  /* Three players. Rob's Ancestor goads Maya's Bear and Trey's Ogre. On her turn the Bear attacks Trey and deals her 1;
     on his, the Ogre attacks Maya (not its goader) and deals him 1. Rob's own creatures attack ungoaded: nothing. */
  const s = play([at(0, "battlefield", "Vengeful Ancestor"), at(1, "battlefield", "Bear"), at(2, "battlefield", "Ogre")]);
  goad(s, 0, [...named(s, "Bear"), ...named(s, "Ogre")]);
  turnOf(s, 2);
  eq(life(s), [40, 39, 38], "Maya's turn: the Bear hits Trey for 2 and deals her 1");
  turnOf(s, 0);
  eq(life(s), [40, 39 - 3, 38 - 1], "Trey's turn: the Ogre hits Maya for 3 and deals him 1");
}

console.log(`engine-attacker-untap: ${checks} checks passed`);
