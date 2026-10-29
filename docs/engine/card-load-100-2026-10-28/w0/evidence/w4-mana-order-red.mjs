/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Deliberately RED reproduction of the still-open outside-resolution damage-order debt.
 * Run from the worktree root. This is diagnostic evidence, not a completed regression or gate credit. */
import assert from "node:assert/strict";
import {createState, addObject} from "../../../../../game/engine/state/index.mjs";
import {loadCardIndex} from "../../../../../game/tools/engine-cards.mjs";
import {legalActions, applyAction} from "../../../../../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../../../../../game/engine/rules/turn.mjs";

const cards = loadCardIndex();
const on = (state, object, seat) => addObject(state, {...object, owner: seat, controller: seat}, "battlefield", null);
const card = name => ({...cards.definition(name), card: name});
for (const [first, damage] of [["Smoke add two", 9], ["Fiery Emancipation", 5]]) {
  let state = createState({matchId: "mana-damage", seed: "mana-damage", players: ["Rob", "Maya", "Trey", "Lee"].map(name => ({name}))});
  state.turn = 1; state.activePlayer = 0; state.priorityPlayer = 0; state.phase = "MAIN1";
  const reef = on(state, card("Shivan Reef"), 0);
  on(state, card("Fiery Emancipation"), 0);
  on(state, {card: "Smoke add two", types: ["Enchantment"], abilities: [{id: "add-two", kind: "replacement", text: "Damage to you is increased by two.",
    watches: {event: "damage", toPlayer: "controller"}, change: {add: 2}}]}, 0);
  const action = legalActions(state, 0).find(action => action.kind === "activate-mana" && action.objectId === reef && action.mana?.R === 1);
  assert.ok(action, "Shivan Reef's actual red mana ability is offered");
  const events = applyAction(state, 0, action);
  const actual = [state.awaiting?.kind ?? null, state.awaiting?.player ?? null, state.players[0].life, state.players[0].manaPool.R, state.objects[reef].tapped];
  console.log(JSON.stringify({first, actual, expected: ["rule-operation", 0, 40, 1, true]}));
  assert.deepEqual(actual, ["rule-operation", 0, 40, 1, true], "commit tap/mana once, ask the affected player before damage");
  state = JSON.parse(JSON.stringify(state));
  const choice = awaitingChoice(state);
  assert.deepEqual(choice.options.map(option => option.label.split(" first:")[0]).sort(), ["Fiery Emancipation", "Smoke add two"]);
  events.push(...resolveAwaiting(state, [choice.options.findIndex(option => option.label.startsWith(first))]));
  assert.deepEqual([state.awaiting, state.players[0].life, state.players[0].manaPool.R, state.objects[reef].tapped, state.stack.length],
    [null, 40 - damage, 1, true, 0], "chosen damage completes off the stack, with one mana produced");
  assert.deepEqual(events.filter(event => event.kind === "GameEventPlayerDamaged").map(event => event.data.fields.amount), [damage], "deal damage exactly once");
  assert.equal(events.filter(event => event.kind === "GameEventManaPool").length, 1, "never produce the mana again after reload");
}
