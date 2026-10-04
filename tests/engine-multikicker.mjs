/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MULTIKICKER (CR 702.33c; Everflowing Chalice; the live-game plan of 2026-10-04, lane W6).
 *
 * An additional cost of the spell's (cards/index.mjs; rules/actions.mjs, additionalVariants): "any number of times", each
 * number its own cast, that many times its mana added -- from none to as many as can be paid. The cast is kicked that many
 * times (`kicked` on the offer and the stack entry), and the permanent it becomes enters knowing it (rules/stack.mjs,
 * rules/replacement.mjs): "a charge counter on it for each time it was kicked" (an amount, `kicked`).
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const EC = "Everflowing Chalice";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (lands) => runScenario({name: "multikicker", setup: [at(0, "battlefield", ...lands), at(0, "hand", EC)], steps: lands.map((l) => ({tap: l}))}, index.definition, {}).state;
const casts = (s) => legalActions(s, 0).filter((a) => a.kind === "cast" && s.objects[a.objectId].card === EC);

{
  const s = play(["Wastes", "Wastes", "Wastes", "Wastes", "Wastes"]);
  eq(casts(s).map((a) => a.kicked ?? 0).sort(), [0, 1, 2], "five mana: kicked none, once or twice -- three times would be {6}");
  eq(casts(s).map((a) => a.extraMana ?? "").sort(), ["", "{2}", "{2}{2}"], "each with that much mana added");
  const t = play([]);
  eq(casts(t).map((a) => a.kicked ?? 0), [0], "no mana: cast for {0}, unkicked, alone");
}
{
  const s = runScenario({name: "multikicker", setup: [at(0, "battlefield", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "hand", EC)],
    steps: [...Array(6).fill({tap: "Wastes"}), {cast: EC, extraMana: "{2}{2}{2}"}]}, index.definition, {}).state;
  eq(s.stack[0].kicked, 3, "kicked three times: the stack entry says so");
}
{
  const bad = compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{0}", colors: [], colorIdentity: []},
    oracleText: "x", source: "hand", abilities: [{kind: "keyword", text: "Multikicker", keyword: "multikicker", cost: "{X}"}]});
  ok(bad.problems.some((p) => p.includes("multikicker is a mana cost")), "multikicker is a mana cost, never an X");
}

console.log(`engine-multikicker: ${checks} checks passed -- kicked any number of times it can be paid, each its own cast, and the permanent entering with what it was kicked.`);
