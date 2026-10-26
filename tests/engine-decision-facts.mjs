/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CH-56: real target groups, optional effects, and identities the seat already knows. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {countedChoice} from "../game/engine/script/bind.mjs";
import {describeDecision} from "../game/room/decision.mjs";
import {effectForTarget, targetFacts} from "../game/engine/script/decision.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";
let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (a, message) => {assert.ok(a, message); checks++;};
const state = createState({matchId: "decision-facts", seed: "decision-facts", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
const on = (name, controller) => addObject(state, {card: name, owner: controller, controller, types: ["Creature"], power: 2, toughness: 2}, "battlefield");
const ids = Array.from({length: 5}, (_, i) => on(`Bear ${i}`, i % 3));
const effects = [{effect: "destroy", targets: {target: 0}}, {effect: "moveZone", to: "exile", targets: {target: 1}}, {effect: "tap", targets: {target: 2}}];
const source = addObject(state, {card: "Three tasks", owner: 0, controller: 0, types: ["Sorcery"], spell: {effects}}, "hand", 0);
const rawTargets = [ids.map(id => ({kind: "object", id})), {kind: "object", id: ids[1]}, {kind: "object", id: ids[2]}];
const choice = {id: "priority:test", mode: "one", min: 1, max: 1, options: [{index: 0, label: "Three tasks", cardId: source}]};
const before = JSON.stringify(state), original = structuredClone(choice);
const described = describeDecision(state, choice, [{kind: "cast", objectId: source, targets: rawTargets}]);
eq(described.options[0].targetGroups.map(g => [g.index, g.effect, g.targets.length]), [[0, "Destroy", 5], [1, "Exile", 1], [2, "Tap", 1]], "three different effect groups, five targets kept in one group");
eq(described.options[0].targetGroups[0].targets.map(t => t.controllerId), [0, 1, 2, 0, 1], "every target carries its controller, including seat zero");
eq(described.options[0].targetGroups[0].targets.map(t => t.affected), ids, "the affected objects are actual target ids");
eq(choice, original, "describing a view does not mutate the original choice");
eq(JSON.stringify(state), before, "describing a view does not mutate the engine");
eq(described.options[0].index, 0, "the legal answer's index stays the same");
const single = describeDecision(state, choice, [{kind: "cast", objectId: source, targets: [{kind: "object", id: ids[1]}]}]).options[0];
eq([single.effect, single.affected, single.controllerId], ["Destroy", ids[1], 1], "the one-target question names the target, not the acting card");
const counted = countedChoice(state, {what: "permanent", types: ["Creature"], count: {min: 0, max: 5}}, {controller: 0, source}, {id: "targets", name: "Three tasks", effects, targetIndex: 1});
eq(counted.options.map(o => o.controllerId), [0, 1, 2, 0, 1], "ordinary counted targets carry controllers without a different-controller restriction");
ok(counted.options.every(o => o.effect === "Exile" && o.affected === o.cardId), "counted targets carry their own indexed effect and affected card");
const people = countedChoice(state, {what: "player", count: {min: 1, max: 1}}, {controller: 0, source}, {id: "players", name: "Choose", effects});
eq(people.options.map(o => o.controllerId), [0, 1, 2], "player targets use that player's seat id");
ok(people.options.every(o => o.affected === undefined), "a player is never presented as an affected card");
state.awaiting = {kind: "effect-choice", effect: "modal", player: 0, choose: 1, modes: [{text: "Draw", effects: [{effect: "draw"}]}, {text: "Don't draw", effects: []}]};
const mayChoice = {id: "may", options: [{index: 0, label: "Draw"}, {index: 1, label: "Don't draw"}]};
const may = describeDecision(state, mayChoice);
eq([may.optional, may.options[0].effect, may.options[0].optional, may.options[1].decline], [true, "Draw", true, true], "an existing may choice advertises its legal decline");
eq(may.options.length, 2, "metadata adds no option");
state.awaiting.modes[1].effects = [{effect: "gainLife", amount: 2}];
const mandatory = describeDecision(state, mayChoice);
ok(!mandatory.optional && !mandatory.options.some(o => o.optional || o.decline), "two mandatory modes never acquire a decline");
state.awaiting = {kind: "choose-targets", action: {kind: "cast", objectId: source}, index: 2, player: 0};
const third = describeDecision(state, {id: "third", options: [{index: 0, cardId: ids[2], targets: [{kind: "object", id: ids[2]}]}]});
eq([third.options[0].targetGroups[0].index, third.options[0].targetGroups[0].effect, third.options[0].targetGroups[0].targets[0].effect], [2, "Tap", "Tap"], "a later counted-target question keeps its original target index");
state.objects[ids[1]].faceDown = true;
state.objects[ids[1]].faceDownCard = {card: "Hidden secret"};
const facts = targetFacts(state, {kind: "object", id: ids[1]}, "Tap");
ok(!JSON.stringify(facts).includes("Hidden secret") && !Object.hasOwn(facts, "name"), "descriptions never disclose a hidden card's name");
eq(effectForTarget([{effect: "newUnknownEffect", targets: {target: 0}}], 0), null, "an unknown effect is not guessed");
{
  const cards = name => name === "Bolt" ? {types: ["Instant"], manaCost: "{R}", spell: {effects: [{effect: "dealDamage", amount: 3, who: {target: 0}}], targets: [{what: "player"}]}}
    : name === "Commander" ? {types: ["Creature"], manaCost: "{9}", power: 1, toughness: 1} : basicCards(name);
  const room = await startRoom({storage: memoryStorage(), matchId: "decision-facts-room", cards, seed: "facts", pod: {seats: ["rob", "maya"].map(seatId => ({seatId, name: seatId, pilot: "human", commander: ["Commander"], cards: Array.from({length: 99}, (_, i) => i % 2 ? "Mountain" : "Bolt")}))}});
  let cast;
  for (let n = 0; n < 80; n++) {
    const view = room.view(room.waitingOn);
    cast = view.decision?.options.find(o => o.act === "cast");
    if (cast) {
      eq([cast.effect, cast.controllerId, cast.targetGroups[0].targets[0].kind], ["Deal damage to", cast.targetGroups[0].targets[0].id, "player"], "the actual room boundary carries target facts");
      const other = view.seatId === "rob" ? "maya" : "rob";
      eq(room.view(other).decision, null, "the other seat still cannot see the pending choice or its metadata");
      break;
    }
    const options = view.decision.options;
    const index = options.find(o => o.act === "play-land")?.index ?? options.find(o => o.act === "activate-mana")?.index ?? options.find(o => o.act === "pass")?.index ?? 0;
    await room.act(view.seatId, {kind: "answer", actionId: randomUUID(), revision: view.revision, choiceId: view.decision.id, indices: [index]});
  }
  ok(cast, "a real cast was offered through the room");
}
console.log(`engine-decision-facts: ${checks} checks passed`);
