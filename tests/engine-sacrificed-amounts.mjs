/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 608.2h: sacrifice costs preserve derived power/toughness through stack and resolution. */
import assert from "node:assert/strict";
import {table, on, bear} from "./helpers/b4-table.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
{
  const s = table();
  const source = on(s, {card: "Sacrifice engine", types: ["Artifact"], abilities: [{id: "a0", kind: "activated", cost: [{atom: "sacrifice", selector: {types: ["Creature"]}}], effects: [{effect: "draw", count: {toughnessOf: "sacrificed"}}, {effect: "discard", count: {powerOf: "sacrificed"}}]}]});
  const food = on(s, bear); s.objects[food].counters = {"+1/+1": 2};
  const start = s.zones.hand[0].length;
  applyAction(s, 0, legalActions(s, 0).find((a) => a.objectId === source && a.kind === "activate"));
  const dead = Object.values(s.objects).find((o) => o.card === "Bear" && o.zone === "graveyard");
  eq([dead.zone, s.stack[0].sacrificed?.map((o) => [o.power, o.toughness])], ["graveyard", [[4, 5]]], "paying records the sacrificed creature after counters, before its zone change");
  dead.power = 99; dead.toughness = 99;
  resolveTop(s);
  eq(s.zones.hand[0].length, start + 5, "resolution draws its last toughness, not its new graveyard values");
  const choice = awaitingChoice(s);
  eq([choice.min, choice.max], [4, 4], "the later discard reads the same remembered power after resolution paused");
  resolveAwaiting(s, choice.options.slice(0, 4).map((o) => o.index));
  eq(s.zones.hand[0].length, start + 1, "the full ability draws five and discards four");
  eq(amountOf(s, {powerOf: "sacrificed"}), 0, "without a sacrificed object the amount is zero");
}
console.log(`engine-sacrificed-amounts: ${checks} checks passed`);
