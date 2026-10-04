/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* LINKED ABILITIES (CR 607.2a): "When this enchantment enters, exile another target nonland permanent. When this enchantment
 * leaves the battlefield, return the exiled card to the battlefield under its owner's control" (Oblivion Ring; the live-game
 * plan of 2026-10-04, lane W6). Two triggers, each on the stack -- not Banishing Light's single "until" (CR 610.3).
 *
 * moveZone's `link` keeps what it exiled against its source (script/effects/zones.mjs, `state.links`); `linked` returns it,
 * read against the source as it last was when the source has left (the leaves trigger's), while it is still that card in
 * exile (CR 400.7). Used once, the link is spent. And a trigger's "another target" asked again as it resolves, with its
 * source gone, is another than that source as it last existed (rules/stack.mjs).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const OR = "Oblivion Ring";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Big Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{3}{G}{G}", colors: ["G"], power: 5, toughness: 5}};
const LANDS = ["Plains", "Wastes", "Wastes"];
const ring = (target, more = []) => [...LANDS.map((l) => ({tap: l})), {cast: OR}, {resolve: true}, {choose: [target]}, {resolve: true}, ...more];
const play = (setup, steps) => runScenario({name: "linked exile", setup, steps}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);
const exiled = (s, card) => s.zones.exile.find((id) => s.objects[id].card === card);
/* It leaves as an effect moves it, and what triggers on that goes on the stack the next time a player would get priority. */
const move = (s, id) => collectTriggers(s, runEffect(s, {effect: "moveZone", targets: [id], to: "graveyard"}, {controller: 1, source: null}));
const leave = (s, card) => move(s, idOf(s, card));
const settle = (s) => { openTriggers(s); for (let n = 0; n < 20 && s.stack.length; n += 1) passPriority(s, null); };

{
  const s = play([at(0, "battlefield", ...LANDS), at(0, "hand", OR), at(1, "battlefield", "Bear")], ring("Bear"));
  const ringId = idOf(s, OR);
  eq(s.links?.[ringId], [exiled(s, "Bear")], "the exile kept against this Oblivion Ring: the Bear as it is in exile");
  leave(s, OR);
  settle(s);
  eq([idOf(s, "Bear") !== undefined, s.objects[idOf(s, "Bear")]?.controller, s.links?.[ringId]], [true, 1, undefined], "the Ring gone: the Bear back, Maya's, and the link spent");
}
{
  const s = play([at(0, "battlefield", ...LANDS), at(0, "hand", OR), at(1, "battlefield", "Bear")], ring("Bear"));
  runEffect(s, {effect: "moveZone", targets: [exiled(s, "Bear")], to: "graveyard"}, {controller: 1, source: null});
  leave(s, OR);
  settle(s);
  eq([idOf(s, "Bear"), s.zones.graveyard[1].map((id) => s.objects[id].card).includes("Bear")], [undefined, true], "the Bear left exile first: a new object, and nothing returns (CR 400.7)");
}
{
  const s = play([at(0, "battlefield", ...LANDS, ...LANDS), at(0, "hand", OR, OR), at(1, "battlefield", "Bear", "Big Bear")], [...ring("Bear"), ...ring("Big Bear")]);
  const rings = s.zones.battlefield.filter((id) => s.objects[id].card === OR);
  eq(rings.map((id) => s.objects[s.links[id][0]].card).sort(), ["Big Bear", "Bear"].sort(), "two Rings, two links, each its own");
  move(s, rings.find((id) => s.objects[s.links[id][0]].card === "Big Bear"));
  settle(s);
  eq([idOf(s, "Big Bear") !== undefined, idOf(s, "Bear")], [true, undefined], "the second Ring gone: the Big Bear back, the Bear still exiled");
}

console.log(`engine-linked-exile: ${checks} checks passed -- the card an Oblivion Ring exiled, returned by its own leaves trigger, under its owner, once; nothing once it has left exile.`);
