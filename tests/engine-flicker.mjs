/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 15: "CAN'T BE BLOCKED THIS TURN" (CR 509.1b), EXILE AND RETURN (CR 400.7), AND WHAT A CARD PUT ONTO
 * THE BATTLEFIELD GAINS.
 *
 * "Can't be blocked" is a rule a static ability or an effect with a duration changes for a creature; a blocker is never
 * offered against it. A card exiled and returned is a new object -- no counters, no damage, no effects -- under its
 * owner's control unless the card says yours, now or at the beginning of the next end step. A card put onto the
 * battlefield by a search or a mass return gains what the card says, and may be sacrificed at the next end step.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {keywordsOf, characteristicsOf} from "../game/engine/rules/layers.mjs";
import {canBlockAttacker, whyBlockersAreIllegal} from "../game/engine/keywords/combat.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
const creature = (name, power = 2, extra = {}) => ({card: name, types: ["Creature"], manaCost: "{1}", power, toughness: power, ...extra});
const pod = {matchId: "m", seed: "flicker", players: [{name: "Rob"}, {name: "Maya"}]};
function table() {
  const s = createState(pod);
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "exile"].includes(zone) ? null : seat);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
function run(s, until) {
  for (let n = 0; n < 400 && !until(s); n += 1) {
    if (s.awaiting) {
      const kind = s.awaiting.kind;
      if (kind === "declare-attackers" || kind === "declare-blockers") resolveAwaiting(s, []);
      else if (kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
      else break;
      continue;
    }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
}
const ctx = (controller = 0, source = null) => ({controller, source});
const named = (s, name, zone = "battlefield") => Object.keys(s.objects).map(Number).filter((id) => s.objects[id].card === name && s.objects[id].zone === zone);

/* ---- can't be blocked (CR 509.1b) ---- */
{
  const s = table();
  const bear = on(s, creature("Bear"), 0), other = on(s, creature("Other"), 0);
  const wall = on(s, creature("Wall", 0, {toughness: 4}), 1), bird = on(s, creature("Bird", 1, {keywords: ["Flying"]}), 1);
  main(s);
  beginResolution(s, [{effect: "effectUntil", targets: [bear], rule: "cant-be-blocked", until: "end-of-turn"}], ctx());
  eq([canBlockAttacker(s, wall, bear), canBlockAttacker(s, bird, bear), canBlockAttacker(s, wall, other)], [false, false, true],
    "the Bear can't be blocked this turn -- by the Wall or by a flyer -- while another creature still can be");
  ok(/can't block Bear/.test(whyBlockersAreIllegal(s, bear, [wall]) ?? ""), "and a block of it is refused, saying why");
}
{
  /* As long as a static ability says: "creatures you control with power 2 or less can't be blocked". */
  const s = table();
  const small = on(s, creature("Small", 2), 0), big = on(s, creature("Big", 5), 0);
  on(s, {card: "Edict", types: ["Enchantment"], abilities: [{id: "a0", kind: "static", text: "x", rule: "cant-be-blocked", affects: {what: "permanent", types: ["Creature"], controller: "you", power: {max: 2}}}]}, 0);
  const wall = on(s, creature("Wall", 0, {toughness: 4}), 1);
  main(s);
  eq([canBlockAttacker(s, wall, small), canBlockAttacker(s, wall, big)], [false, true], "a static ability's rule, read through its selector: the 2/2 can't be blocked, the 5/5 can");
}

/* ---- exile and return (CR 400.7) ---- */
{
  const s = table();
  const bear = on(s, creature("Bear"), 1);
  main(s);
  s.objects[bear].counters["+1/+1"] = 2; s.objects[bear].damage = 1; s.objects[bear].controller = 0;   /* stolen by Rob, hurt, grown */
  beginResolution(s, [{effect: "pump", targets: [bear], power: 3, toughness: 3}], ctx());
  beginResolution(s, [{effect: "moveZone", targets: [bear], to: "exile", andReturn: "now"}], ctx());
  const [back] = named(s, "Bear");
  const c = characteristicsOf(s, back);
  eq([back !== bear, c.power, s.objects[back].damage, s.objects[back].controller], [true, 2, 0, 1],
    "flickered: a new object (CR 400.7) -- no counters, no damage, not the +3/+3 -- and under its owner's control, Maya's");
}
{
  /* "Under your control" (Conjurer's Closet). */
  const s = table();
  const bear = on(s, creature("Bear"), 1);
  main(s);
  s.objects[bear].controller = 0;
  beginResolution(s, [{effect: "moveZone", targets: [bear], to: "exile", andReturn: "now", under: "you"}], ctx());
  eq(s.objects[named(s, "Bear")[0]].controller, 0, "\"return that card to the battlefield under your control\": Rob's");
}
{
  /* At the beginning of the next end step, with a counter if it is a creature (Teferi's Time Twist). */
  const s = table();
  const bear = on(s, creature("Bear"), 0), rock = on(s, {card: "Rock", types: ["Artifact"]}, 0);
  main(s);
  beginResolution(s, [{effect: "moveZone", targets: [bear, rock], to: "exile", andReturn: "end step", returnWithCounter: "+1/+1"}], ctx());
  eq([named(s, "Bear", "exile").length, named(s, "Rock", "exile").length], [1, 1], "both exiled until the end step");
  run(s, (x) => x.turn === 2);
  const [newBear] = named(s, "Bear"), [newRock] = named(s, "Rock");
  eq([s.objects[newBear].counters["+1/+1"] ?? 0, s.objects[newRock].counters["+1/+1"] ?? 0], [1, 0], "back at the end step; the creature with its +1/+1 counter, the artifact without");
}

/* ---- what a card put onto the battlefield gains ---- */
{
  const s = table();
  on(s, creature("Big Beast", 5), 0, "hand");
  main(s);
  beginResolution(s, [{effect: "chooseCard", zone: "hand", selector: {types: ["Creature"]}, upTo: true, to: "battlefield", gains: ["Haste"], atEndStep: "sacrifice"}], ctx());
  const choice = awaitingChoice(s);
  eq(choice.min, 0, "\"you may put a creature card\": none is allowed");
  resolveAwaiting(s, [0]);
  const [beast] = named(s, "Big Beast");
  ok(keywordsOf(s, beast).includes("Haste"), "the creature put onto the battlefield gains haste");
  run(s, (x) => x.turn === 2);
  eq(named(s, "Big Beast", "graveyard").length, 1, "and is sacrificed at the beginning of the next end step");
}
{
  const s = table();
  on(s, {card: "Sculpture", types: ["Artifact", "Creature"], power: 2, toughness: 2}, 0, "graveyard");
  on(s, {card: "Rock", types: ["Artifact"]}, 0, "graveyard");
  on(s, creature("Bear"), 0, "graveyard");
  main(s);
  beginResolution(s, [{effect: "moveZoneAll", selector: {what: "card", zone: "graveyard", types: ["Artifact"], controller: "you"}, to: "battlefield", gainsUntilEndOfTurn: ["Haste"]}], ctx());
  eq([named(s, "Sculpture").length, named(s, "Rock").length, named(s, "Bear").length], [1, 1, 0], "every artifact card back, the creature card that is not an artifact left behind");
  ok(keywordsOf(s, named(s, "Sculpture")[0]).includes("Haste"), "and they have haste this turn");
}

console.log(`engine-flicker: ${checks} checks passed — "can't be blocked" as a rule a blocker is checked against; a flickered card a new object under its owner (or yours); what a card put onto the battlefield gains.`);
