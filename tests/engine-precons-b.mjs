/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PRECON LOAD'S LANE B (Keen Engineering, 2026-10-25): what its cards' scenarios cannot reach.
 *
 * The rules the lane built, each played at the table by its cards' scenarios -- Duplicant (imprint: the power, toughness and
 * creature types of the last creature card exiled with it, rules/layers.mjs linkedCreatureGrant), Misleading Signpost (what an
 * attacking creature attacks, reselected, CR 508.7: effects/asking.mjs reselectAttack; "during the declare attackers step", the
 * `duringStep` condition), Steel Hellkite (the players a creature dealt combat damage to this turn, rules/combat.mjs, and the
 * `controllerDealtCombatDamageBy` selector key), Fall from Favor ("unless that player is the monarch", the `monarch` selector
 * key). Here: every scenario of the lane's cards, run on its own so a break of these rules is caught in seconds; the grammar refusing what it does not mean, the reselection asked about a creature no longer attacking, and the
 * vocabulary.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {readFileSync} from "node:fs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {ASKING} from "../game/engine/script/effects/asking.mjs";
import {NEEDS_A_DECISION} from "../game/engine/script/effects/index.mjs";
import {isPrimitive} from "../game/engine/vocabulary.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const refused = (fn) => { try { fn(); return false; } catch { return true; } };

const index = loadCardIndex();

/* ---- the lane's cards, every scenario (docs/engine/card-load-precons-2026-10-25/lane-B-engineering.json) ---- */
const lane = JSON.parse(readFileSync(new URL("../docs/engine/card-load-precons-2026-10-25/lane-B-engineering.json", import.meta.url), "utf8"));
const names = new Set(lane.cards.map((c) => c.name));
const files = loadCardScenarios().map((f) => f.scenarios).filter((f) => names.has(f.card));
ok(files.length === names.size, `every card of the lane has its scenarios (${files.length} of ${names.size})`);
for (const file of files) {
  ok(index.resolve(file.card)?.playable === true, `${file.card} is playable`);
  for (const scenario of file.scenarios) {
    runScenario(scenario, index.definition, file.fixtures ?? {});
    checks += 1;
  }
}

/* ---- the selector keys ---- */
{
  ok(!refused(() => compileSelector({what: "permanent", monarch: false})), "monarch: false compiles");
  ok(refused(() => compileSelector({what: "permanent", monarch: "you"})), "monarch is true or false, nothing else");
  ok(!refused(() => compileSelector({what: "permanent", controllerDealtCombatDamageBy: "self"})), "controllerDealtCombatDamageBy: \"self\" compiles");
  ok(refused(() => compileSelector({what: "permanent", controllerDealtCombatDamageBy: true})), "controllerDealtCombatDamageBy is \"self\", nothing else");
}

/* ---- the condition ---- */
{
  eq(conditionProblems({duringStep: "COMBAT_DECLARE_ATTACKERS"}), [], "duringStep, the declare attackers step: no problem");
  ok(conditionProblems({duringStep: "MAIN1"}).some((p) => p.includes("duringStep")), "any other step: refused");
}

/* ---- linkedCreature, compiled ---- */
const compiled = (apply, layer, sublayer, affects = {self: true}) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Shifter", oracleId: "x", types: ["Artifact", "Creature"], subtypes: ["Shapeshifter"], manaCost: "{6}", colors: [], colorIdentity: [], power: 2, toughness: 4},
  oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", layer, ...(sublayer ? {sublayer} : {}), affects, apply}]}).problems;
{
  eq(compiled({linkedCreature: "creature types", plusCreatureTypes: ["Shapeshifter"]}, 4), [], "creature types in layer 4, with the types it keeps: compiles");
  eq(compiled({linkedCreature: "power and toughness"}, 7, "b"), [], "power and toughness in layer 7b: compiles");
  ok(compiled({linkedCreature: "creature types"}, 7, "b").some((p) => p.includes("linkedCreature")), "creature types in another layer: refused");
  ok(compiled({linkedCreature: "power and toughness"}, 7, "c").some((p) => p.includes("linkedCreature")), "power and toughness in 7c: refused");
  ok(compiled({linkedCreature: "power and toughness", plusCreatureTypes: ["Shapeshifter"]}, 7, "b").some((p) => p.includes("linkedCreature")), "types kept beside power and toughness: refused");
  ok(compiled({linkedCreature: "creature types", plusCreatureTypes: "Shapeshifter"}, 4).some((p) => p.includes("linkedCreature")), "the types it keeps are a list");
  ok(compiled({linkedCreature: "creature types", setPower: 1}, 4).some((p) => p.includes("linkedCreature")), "anything beside it: refused");
  ok(compiled({linkedCreature: "creature types"}, 4, undefined, {what: "permanent", types: ["Creature"]}).some((p) => p.includes("linkedCreature")), "of anything but the source itself: refused");
  ok(compiled({linkedCreature: "colors"}, 4).some((p) => p.includes("linkedCreature")), "anything else read from the card: refused");
}

/* ---- reselectAttack, asked about a creature that is not attacking ---- */
{
  const s = runScenario({name: "reselect", seats: 3, setup: [{seat: 1, zone: "battlefield", cards: ["Steel Hellkite"]}], steps: []}, index.definition, {}).state;
  const id = s.zones.battlefield.find((x) => s.objects[x].card === "Steel Hellkite");
  const outcome = beginResolution(s, [{effect: "reselectAttack", targets: [id]}], {controller: 0, source: null});
  eq([outcome.status, s.awaiting], ["done", null], "no combat, nothing attacking: nothing to reselect, and nobody is asked");
  eq(ASKING.reselectAttack.left(), [], "its chooser gone from the game: nothing reselected (CR 800.4a)");
  ok(isPrimitive("reselectAttack") && NEEDS_A_DECISION.includes("reselectAttack") && typeof ASKING.reselectAttack?.open === "function", "reselectAttack is a declared primitive that asks");
}

console.log(`engine-precons-b: ${checks} checks passed -- lane B's grammar (monarch, controllerDealtCombatDamageBy, duringStep, linkedCreature) refuses what it does not mean; a reselection with nothing attacking asks nobody; the vocabulary.`);
