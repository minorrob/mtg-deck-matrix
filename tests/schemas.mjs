/* EVERY DATA FILE SAYS WHAT IT IS, AND IS IT.
 *
 * schema/index.mjs registers each generated or hand-maintained data file with the schema id
 * it must open with, its producer, the tool whose --check vouches for it and the collection
 * its count counts. This suite reads each file and checks the four envelope facts and the
 * body against schema/<name>.json -- so a producer that changes shape, a hand edit that
 * drops a field, or a stamp that stops being a date fails here, on the commit, with the
 * path that is wrong. It also keeps the registry, the schema files and the served asset
 * map's own schema list agreeing with one another. */
import assert from "node:assert/strict";
import {readdirSync, existsSync} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {REGISTRY, ROOT, HAND, check, loadSchema, readData, byFile} from "../schema/index.mjs";
import {validate} from "../schema/validate.mjs";

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };

for (const entry of REGISTRY) {
  ok(existsSync(path.join(ROOT, entry.file)), `${entry.file} is registered but not in the tree`);
  const problems = check(entry.file);
  ok(problems.length === 0, `${entry.file}:\n  - ${problems.join("\n  - ")}`);
  ok(entry.generator === HAND || existsSync(path.join(ROOT, entry.generator)), `${entry.file} names generator ${entry.generator}, which is not in the tree`);
  ok(existsSync(path.join(ROOT, entry.checkedBy)), `${entry.file} is checked by ${entry.checkedBy}, which is not in the tree`);
}

/* Every schema file is registered, and every registered id has a file. */
const files = readdirSync(path.join(ROOT, "schema")).filter((f) => f.endsWith(".json")).sort();
const ids = REGISTRY.map((r) => r.id.split("@")[0] + ".json").sort();
assert.deepEqual(files, [...new Set(ids)].sort(), "schema/*.json and the registry name the same files"); checks++;

/* The validator says no to a wrong shape, so a green run above means something. */
const bad = validate(loadSchema("commander-ranks@1"), {...readData("data/commander-ranks.json"), cards: [{name: "", rank: 0}]});
ok(bad.some((e) => /rank/.test(e)) && bad.some((e) => /name/.test(e)), "the validator rejects a rank of 0 and an empty name");
ok(validate({type: "object", nonsense: true}, {}).length === 1, "an unknown schema keyword is reported, not ignored");

/* The served asset map's schema list agrees with the registry for every key it has. */
const CrankAssets = createRequire(import.meta.url)(path.join(ROOT, "crankmagic-assets.js"));
for (const [key, id] of Object.entries(CrankAssets.schemas)) {
  const file = String(CrankAssets[key]).split("?")[0];
  const entry = byFile(file);
  ok(entry && entry.id === id, `crankmagic-assets.js says ${key} (${file}) is ${id}; the registry says ${entry ? entry.id : "nothing"}`);
}
assert.throws(() => CrankAssets.expect({schema: "cards@0"}, "cards"), /this build reads cards@1/); checks++;
assert.equal(CrankAssets.expect({schema: "cards@1"}, "cards").schema, "cards@1"); checks++;

console.log(`schemas: ${checks} checks passed — ${REGISTRY.length} data files carry their envelope and match schema/*.json; the asset map names ${Object.keys(CrankAssets.schemas).length} of them.`);
