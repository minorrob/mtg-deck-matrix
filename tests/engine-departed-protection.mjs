/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {play, at, drive} from "./helpers/x11-keywords.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {damageQuestion} from "../game/engine/script/effects/resources.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";

let checks = 0;
const source = "Departing red source";
function position() {
  const state = play([at(0, "battlefield", source), at(1, "battlefield", "Silver Knight", "Bear")], [], {},
    {[source]: {types: ["Creature"], subtypes: ["Human"], colors: ["R"], power: 3, toughness: 3}});
  const id = state.zones.battlefield.find(id => state.objects[id].card === source);
  const knight = state.zones.battlefield.find(id => state.objects[id].card === "Silver Knight");
  const was = lastKnown(state, id);
  runEffect(state, {effect: "moveZone", targets: [id], to: "graveyard"}, {controller: 0, source: null});
  return {state, id, knight, was};
}
{
  const {state, id, knight, was} = position();
  const events = runEffect(state, {effect: "dealDamage", targets: [knight], amount: 3}, {controller: 0, source: id, lastKnown: was});
  assert.equal(state.objects[knight].damage, 0, "protection prevents damage from the source as it last existed"); checks++;
  assert.equal(events.filter(e => e.kind === "GameEventCardDamaged").length, 0); checks++;
  assert.equal(state.objects[id], undefined, "the source is never resurrected to read its qualities"); checks++;
}
{
  const {state, id, knight, was} = position();
  runEffect(state, {effect: "dealDamage", targets: [knight], amount: 3}, {controller: 0, source: id, lastKnown: {...was, colors: ["G"]}});
  assert.equal(state.objects[knight].damage, 3, "a departed source without the protected quality still deals damage"); checks++;
}
{
  const {state, id, knight, was} = position();
  runEffect(state, {effect: "dealDamage", targets: [knight], amount: 3}, {controller: 0, source: id + 10000, lastKnown: was});
  assert.equal(state.objects[knight].damage, 3, "an unrelated snapshot cannot lend its color to a source"); checks++;
}
{
  let state = play([at(0, "battlefield", "Pyrohemia", "Mountain"), at(1, "battlefield", "Silver Knight", "Bear")],
    [{tap: "Mountain"}, {activate: "Pyrohemia"}]);
  const id = state.zones.battlefield.find(id => state.objects[id].card === "Pyrohemia");
  const knight = state.zones.battlefield.find(id => state.objects[id].card === "Silver Knight");
  const bear = state.zones.battlefield.find(id => state.objects[id].card === "Bear");
  assert.equal(state.stack.length, 1); checks++;
  runEffect(state, {effect: "moveZone", targets: [id], to: "graveyard"}, {controller: 0, source: null});
  state = JSON.parse(JSON.stringify(state));
  drive(state, s => s.stack.length === 0 && !s.resolving && !s.awaiting);
  assert.deepEqual([state.objects[knight].damage, state.objects[bear].damage], [0, 1],
    "actual departed Pyrohemia still damages unprotected creatures but cannot damage Silver Knight"); checks++;
  assert.deepEqual(state.players.map(p => p.life), [39, 39], "the unprotected players take the real ability's damage"); checks++;
  assert.equal(state.objects[id], undefined); checks++;
}
for (const [from, colors, prevented] of [
  [{colors: ["R"]}, ["R"], true], [{colors: ["G"]}, ["R"], false],
  [{types: ["Creature"]}, ["R"], true], [{types: ["Enchantment"]}, ["R"], false],
  [{subtypes: ["Human"]}, ["R"], true], [{subtypes: ["Dragon"]}, ["R"], false],
  ["everything", ["R"], true], [{multicolored: true}, ["R", "G"], true], [{multicolored: true}, ["R"], false],
]) {
  const {state, id, was} = position();
  (state.effects ??= []).push({id: "player-protection", rule: "protection", players: [1], from});
  runEffect(state, {effect: "dealDamage", who: [1], amount: 3}, {controller: 0, source: id, lastKnown: {...was, colors}});
  assert.equal(state.players[1].life, prevented ? 40 : 37, `departed source and player protection ${JSON.stringify(from)}`); checks++;
}
{
  const {state, id, knight, was} = position();
  runEffect(state, {effect: "dealDamage", targets: [knight], divided: 0},
    {controller: 0, source: id, lastKnown: was, division: {0: {[knight]: 3}}});
  assert.equal(state.objects[knight].damage, 0, "divided damage carries the same last known qualities"); checks++;
}
{
  const {state, id, knight, was} = position();
  runEffect(state, {effect: "dealDamage", from: [id], targets: [knight], amount: 3},
    {controller: 0, source: null, about: {lastKnown: was}});
  assert.equal(state.objects[knight].damage, 0, "a trigger's named departed subject carries its own snapshot"); checks++;
}
{
  const {state, id, was} = position();
  const bear = state.zones.battlefield.find(id => state.objects[id].card === "Bear");
  (state.effects ??= []).push({id: "lasting-protection", rule: "protection", affects: {ids: [bear]}, from: {colors: ["R"]}});
  runEffect(state, {effect: "dealDamage", targets: [bear], amount: 3}, {controller: 0, source: id, lastKnown: was});
  assert.equal(state.objects[bear].damage, 0, "lasting protection over a named permanent reads the snapshot"); checks++;
}
{
  const {state, knight, was} = position();
  const live = addObject(state, {card: "Live green source", owner: 0, controller: 0, types: ["Creature"], colors: ["G"], power: 3, toughness: 3}, "battlefield");
  assert.equal(protectedFrom(state, {card: knight}, live, {...was, cardId: live}), false,
    "a supplied snapshot cannot override a live source's current color"); checks++;
  runEffect(state, {effect: "dealDamage", targets: [knight], amount: 3}, {controller: 0, source: live, lastKnown: {...was, cardId: live}});
  assert.equal(state.objects[knight].damage, 3, "live characteristics take precedence over an older red snapshot"); checks++;
}
{
  const {state, id, knight, was} = position();
  for (const [name, change] of [["Double damage", {multiply: 2}], ["Add damage", {add: 2}]])
    addObject(state, {card: name, owner: 0, controller: 0, types: ["Enchantment"], abilities: [
      {id: name, kind: "replacement", watches: {event: "damage"}, change, text: name}]}, "battlefield");
  const effect = {effect: "dealDamage", targets: [knight], amount: 3};
  assert.equal(damageQuestion(state, effect, {controller: 0, source: id, lastKnown: {...was, colors: ["G"]}})?.player, 1,
    "the unprotected control really has two competing damage replacements"); checks++;
  assert.equal(damageQuestion(state, effect, {controller: 0, source: id, lastKnown: was}), null,
    "fully protected damage never asks an irrelevant replacement order"); checks++;
  assert.equal(state.objects[knight].damage, 0, "dry replacement inspection deals no damage"); checks++;
}
console.log(`engine-departed-protection: ${checks} checks passed`);
