/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 701.23: remembered public choices cannot fail to find; searched means a search, even finding nothing. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {beginResolution, answerResolution} from "../game/engine/script/resolution.mjs";
import {chooseCard} from "../game/engine/script/effects/asking.mjs";
const s = table(), first = put(s, creature("First"), "graveyard"), second = put(s, creature("Second"), "graveyard"), unrelated = put(s, creature("Unrelated"), "graveyard");
beginResolution(s, [{effect: "chooseCard", zone: "graveyard", among: "those cards", to: "exile", remember: true}], {controller: 0, about: {cards: [first, second]}});
assert.deepEqual(s.awaiting.cards, [first, second]);
assert.equal(s.awaiting.min, 1);
answerResolution(s, [1]);
assert.equal(s.objects[unrelated].zone, "graveyard");
assert.equal(s.zones.exile.map((id) => s.objects[id].card).includes("Second"), true);
const ctx = {controller: 0}, picks = [];
const rng = {pick: (cards) => { picks.push([...cards]); return cards.at(-1); }};
const result = chooseCard.open(s, {zone: "graveyard", to: "exile", random: true, count: 2, remember: true}, ctx, rng);
assert.equal(s.awaiting, null);
assert.equal(result.events.length > 0, true);
assert.deepEqual(picks.map((cards) => cards.length), [2, 1], "random choices are without replacement");
assert.equal(ctx.remembered.length, 2);
assert.throws(() => chooseCard.open(s, {zone: "graveyard", random: true}, ctx), /random stream/);
const exiledOther = put(s, creature("Opponent's card"), "exile", 1);
chooseCard.open(s, {zone: "exile", to: "hand"}, ctx);
assert.equal(s.awaiting.cards.includes(exiledOther), true, "exile is shared, not the chooser's private zone");
assert.equal(s.awaiting.min, 1, "public exile has no fail-to-find option");
s.awaiting = null;
const life = s.players[0].life;
beginResolution(s, [{effect: "chooseCard", zone: "library", selector: {types: ["Creature"]}},
  {effect: "gainLife", amount: 2, who: "you", condition: {searched: true}},
  {effect: "branch", if: {searched: true}, then: [{effect: "gainLife", amount: 3, who: "you"}]}], ctx);
answerResolution(s, []);
assert.equal(s.players[0].life - life, 5, "an empty search still marks searched for effects and branches");
beginResolution(s, [{effect: "gainLife", amount: 9, who: "you", condition: {searched: true}}], ctx);
assert.equal(s.players[0].life - life, 5, "search memory does not escape its resolution");
console.log("engine-card-choice-memory: 13 checks passed -- batch choices, random draws, shared exile, searched conditions.");
