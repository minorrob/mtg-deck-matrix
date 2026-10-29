/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Real held-out translations must preserve the count's noun, the effect's noun after its cost, and an implicit
   multiplier of one. The source cards remain unchanged; their played scenarios decide whether a translation works. */
import assert from "node:assert/strict";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";
import {createLibrary, translate, templateOf, abstractBody, fillBody} from "../game/engine/cards/sentences.mjs";
import {calibrate} from "../game/tools/sentence-library.mjs";

let checks = 0;
const failures = [];
const eq = (actual, expected, message) => {
  checks += 1;
  try { assert.deepEqual(actual, expected, message); }
  catch (error) { failures.push(message); console.error(error.message); }
};
const scripts = loadCardScripts().map((file) => file.script);
const library = createLibrary(scripts);
const names = ["Blackblade Reforged", "Goblin Piledriver", "Wayfarer's Bauble", "Contagion Clasp"];
const heldOut = (name) => {
  const result = translate(scripts.find((script) => script.identity.name === name), library, {except: name});
  eq(result.ok, true, `${name} is translated from other cards`);
  return result.script;
};

/* V8's independent counterexample: the counted noun between two targets must not consume the second target's noun. */
{
  const text = "Target creature gets +1/+1 for each creature you control. Destroy target creature.";
  const teacher = {kind: "spell", text, targets: [{what: "permanent", types: ["Creature"]}, {what: "permanent", types: ["Creature"]}],
    effects: [{effect: "pump", targets: {target: 0}, power: {count: {types: ["Creature"], controller: "you"}},
      toughness: {count: {types: ["Creature"], controller: "you"}}}, {effect: "destroy", targets: {target: 1}}]};
  const body = abstractBody(teacher, templateOf(text, "Smoke", 2).slots, "Smoke", 2);
  const filled = fillBody(body, templateOf(text.replace("Destroy target creature", "Destroy target artifact"), "Smoke", 2).slots);
  eq(filled.targets.map((target) => target.types), [["Creature"], ["Artifact"]], "V8: each target binds its own printed noun");
  eq([filled.effects[0].power.count.types, filled.effects[0].toughness.count.types], [["Creature"], ["Creature"]],
    "V8: the intervening counted creatures remain creatures");
}

const blade = heldOut(names[0]);
const boost = blade.abilities.find((ability) => ability.kind === "static").apply;
eq([boost.power.count.types, boost.toughness.count.types], [["Land"], ["Land"]],
  "the counted lands are the noun after 'for each', distinct from the equipped creature");
const piledriver = heldOut(names[1]);
eq(piledriver.abilities.find((ability) => ability.kind === "triggered").effects[0].power.times, 2,
  "the teacher's implicit +1 multiplier is translated into the printed +2 per attacking Goblin");
const bauble = heldOut(names[2]);
eq(bauble.abilities[0].effects[0].selector.types, ["Land"],
  "the land selected by the effect is distinct from the artifact sacrificed in the cost");
const clasp = heldOut(names[3]);
eq(clasp.abilities.find((ability) => ability.kind === "triggered").targets[0].types, ["Creature"],
  "the target creature is distinct from the artifact entering the battlefield");

const calibration = calibrate({scripts, library, only: names});
for (const result of calibration.results)
  eq(result.status, "passed", `${result.card}: all its original scenarios pass held out (${result.why ?? "played"})`);
assert.deepEqual(failures, [], "every held-out regression must pass");
console.log(`sentence-load100-w0: ${checks} checks passed; four held-out cards played through their original scenarios.`);
