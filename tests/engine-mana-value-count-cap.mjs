/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Betor: target legality reads the life lost this turn when choosing and again on resolution. */
import {table, on, creature, context, checks} from "./helpers/train-b6.mjs";
import {compileSelector, selectMatching} from "../game/engine/script/filter.mjs";
import {recheckTargets} from "../game/engine/script/bind.mjs";
const t = checks("engine-mana-value-count-cap");
const s = table(), a = on(s, creature("Two", 2, 2, {manaCost: "{1}{G}"}), 0, "graveyard"), b = on(s, creature("Three", 3, 3, {manaCost: "{2}{G}"}), 0, "graveyard");
const spec = {what: "card", zone: "graveyard", controller: "you", types: ["Creature"], manaValue: {max: {lifeLostThisTurn: "you"}}};
s.players[0].lostThisTurn = 2;
t.eq(selectMatching(s, spec, context), [a], "the dynamic cap includes its exact boundary and excludes the next mana value");
s.players[0].lostThisTurn = 3;
t.eq(selectMatching(s, spec, context), [a, b], "the cap is recomputed when the player's life-loss count changes");
s.players[0].lostThisTurn = 1;
t.eq(recheckTargets(s, [spec], [{kind: "object", id: a}], context).fizzles, true, "resolution checks the dynamic cap again");
t.throws(() => compileSelector({...spec, manaValue: {max: {notAnAmount: true}}}), /manaValue.max/, "unknown amount grammar is refused instead of matching everything");
t.done();
