/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {parseCardCheckArgs, abilityLedgerProblems, cardInputHashes} from "../game/tools/card-check-policy.mjs";
import {cardCheckExit} from "../game/tools/batch/check-cards.mjs";
import {exerciseSummary} from "../game/tools/ability-evidence.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), temporary = realpathSync(tmpdir());
const root = mkdtempSync(path.join(temporary, "crank-check-policy-test-")), cleanup = new Set([root]);
let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (a, message) => {assert.ok(a, message); checks++;};
const script = JSON.parse(readFileSync(path.join(repo, "game/engine/cards/g/glorious-anthem.json"), "utf8"));
const file = {card: "Glorious Anthem", fixtures: {Bear: {types: ["Creature"], colors: ["G"], power: 2, toughness: 2}},
  scenarios: [{name: "Anthem changes the other creature", setup: [{seat: 0, zone: "battlefield", cards: ["Glorious Anthem", "Bear"]}],
    expect: [{seat: 0, stats: {card: "Bear", power: 3, toughness: 3}}]}]};
const write = (dir, value = file) => {
  mkdirSync(path.join(dir, "g"), {recursive: true});
  writeFileSync(path.join(dir, "g/anthem.json"), JSON.stringify(script));
  writeFileSync(path.join(dir, "g/anthem.scenarios.json"), JSON.stringify(value));
};
const run = args => {
  const result = spawnSync(process.execPath, ["--stack-size=4000", "game/tools/batch/check-cards.mjs", ...args], {cwd: repo, encoding: "utf8", timeout: 60000});
  assert.ifError(result.error);
  const ledgerPath = /^ability ledger: (.+)$/m.exec(result.stdout)?.[1]?.trim();
  if (ledgerPath && path.dirname(ledgerPath) !== root && path.dirname(path.dirname(ledgerPath)) === temporary
    && path.basename(path.dirname(ledgerPath)).startsWith("crank-card-check-")) cleanup.add(path.dirname(ledgerPath));
  return {...result, ledger: ledgerPath ? JSON.parse(readFileSync(ledgerPath, "utf8")) : null};
};
try {
  eq(cardCheckExit({}), 1, "no ledger cannot claim a passing ability check");
  for (const argv of [["--unknown"], ["--scenario-only"], ["--no-counterfactual"], ["--cards"], ["--cards", "A||B"],
    ["--cards", "A|A"], ["--ability-ledger", "--cards"], ["--counterfactual", "--counterfactual"], ["--help", "--counterfactual"]]) {
    assert.throws(() => parseCardCheckArgs(argv)); checks++;
  }
  const rejected = run(["--counterfactual", "--counterfactul"]);
  eq(rejected.status, 1, "the actual executable rejects unknown flags");
  ok(rejected.stderr.includes("Unknown card-check option"));
  const good = path.join(root, "good"); write(good);
  const proved = run(["--card-root", good]);
  eq(proved.status, 0, "default probes prove the actual static effect without either legacy opt-in flag");
  eq([proved.ledger.measurement.complete, proved.ledger.measurement.counterfactual, proved.ledger.summary.scenarioReached], [true, true, 1]);
  ok(proved.stdout.includes("diagnostic scope only") && !proved.ledger.scope.canonical, "custom directory is explicitly not the canonical gate");
  const wrongDefenseRoot = path.join(root, "wrong-defense"); write(wrongDefenseRoot);
  writeFileSync(path.join(wrongDefenseRoot, "g/anthem.json"), JSON.stringify({...script, identity: {...script.identity, defense: 7}}));
  const wrongDefense = run(["--card-root", wrongDefenseRoot]);
  eq(wrongDefense.status, 1, "an Oracle identity error fails even when the schema and real ability witness pass");
  eq([wrongDefense.ledger.measurement.problems, wrongDefense.ledger.measurement.failed, wrongDefense.ledger.summary.scenarioReached], [1, 0, 1], "wrong printed data cannot hide behind a passing static behavior proof");
  ok(wrongDefense.stdout.includes("IDENTITY Glorious Anthem") && wrongDefense.stdout.includes("defense 7 is not Oracle absent"), "the executable identifies the actual identity mismatch");
  const explicit = run(["--card-root", good, "--ability-ledger", path.join(root, "explicit.json")]);
  eq(explicit.status, 0, "choosing an output path does not disable runtime removal");
  const verified = spawnSync(process.execPath, ["game/tools/batch/verify-card-ledger.mjs", path.join(root, "explicit.json")], {cwd: repo, encoding: "utf8", timeout: 60000});
  assert.ifError(verified.error);
  eq(verified.status, 1, "the actual verifier executable rejects a successful custom-directory diagnostic");
  ok(verified.stderr.includes("canonical directory gate") && verified.stderr.includes("exact card inventory"));
  const compatible = run(["--card-root", good, "--counterfactual"]);
  eq(compatible.status, 0, "the historical counterfactual spelling works with automatic output");
  const bad = path.join(root, "presence");
  const presenceFile = {...file, scenarios: [{name: "Presence alone", setup: [{seat: 0, zone: "battlefield", cards: ["Glorious Anthem"]}], expect: [{seat: 0, zone: "battlefield", count: 1}]}]};
  write(bad, presenceFile);
  const unreached = run(["--card-root", bad]);
  eq(unreached.status, 1, "the formerly green no-flag path now fails an unproved ability");
  eq([unreached.ledger.measurement.failed, unreached.ledger.summary.scenarioReached], [0, 0], "passing presence scenarios do not mask missing behavior proof");
  const empty = path.join(root, "empty"); mkdirSync(empty);
  const old = path.join(root, "old.json"); writeFileSync(old, JSON.stringify(proved.ledger));
  const interrupted = run(["--card-root", empty, "--ability-ledger", old]);
  eq(interrupted.status, 1, "an empty directory cannot pass");
  eq(interrupted.ledger.measurement.complete, false, "failed loading overwrites any prior completed ledger with an incomplete marker");
  const malformed = path.join(root, "malformed"); write(malformed, {...file, scenarios: "not an array"});
  const invalid = run(["--card-root", malformed]);
  eq(invalid.status, 1, "malformed scenario collections fail before evidence can be certified");
  eq(invalid.ledger.measurement.complete, false);
  const noScenarios = path.join(root, "vanilla"); mkdirSync(path.join(noScenarios, "r"), {recursive: true});
  writeFileSync(path.join(noScenarios, "r/bear.json"), readFileSync(path.join(repo, "game/engine/cards/o/ordinary-bear.json")));
  const missing = run(["--card-root", noScenarios]);
  eq(missing.status, 1, "a definition without its saved scenario cannot pass through a zero-ability denominator");
  ok(missing.stdout.includes("MISSING SCENARIOS"));
  const source = {...proved.ledger.source, dirty: false};
  const valid = structuredClone(proved.ledger); valid.scope.canonical = true; valid.scope.cardDirectory = "game/engine/cards"; valid.source.dirty = false;
  const expected = {scripts: [script], files: [file], cardRoot: good, source};
  eq(abilityLedgerProblems(valid, expected), [], "an actual passing removal proof validates against its exact synthetic directory/source context");
  const portable = structuredClone(valid); portable.scope.cardRoot = path.join(temporary, "another-checkout/game/engine/cards");
  eq(abilityLedgerProblems(portable, expected), [], "identical canonical inputs and source remain verifiable in another checkout");
  const legacyFile = {...file, scenarios: file.scenarios.map(scenario => ({...scenario, sourceChoices: false}))};
  const legacy = structuredClone(valid); legacy.source.inputs = cardInputHashes([script], [legacyFile]);
  ok(abilityLedgerProblems(legacy, {...expected, files: [legacyFile]}).some(p => p.includes("Legacy source-choice")), "historical replay flags cannot exempt current canonical scenarios from player choices");
  const incomplete = structuredClone(unreached.ledger); incomplete.scope.canonical = true; incomplete.scope.cardDirectory = "game/engine/cards"; incomplete.source.dirty = false;
  ok(abilityLedgerProblems(incomplete, {...expected, files: [presenceFile], cardRoot: bad}).some(p => p.includes("no passing-scenario behavior proof")), "even an honest matching summary must fail unreached behavior");
  const omitted = structuredClone(valid); omitted.cards["Glorious Anthem"].abilities = []; omitted.summary = exerciseSummary(omitted);
  ok(abilityLedgerProblems(omitted, expected).some(p => p.includes("inventory differs")), "reducing the denominator and recomputing totals cannot hide an ability");
  const variants = [
    l => {l.scope.selected = ["Glorious Anthem"];}, l => {l.scope.canonical = false;}, l => {l.measurement.complete = false;},
    l => {l.measurement.counterfactual = false;}, l => {delete l.measurement.choicePolicy;}, l => {l.measurement.failed = 1;}, l => {l.measurement.problems = 1;},
    l => {l.measurement.scenarios = 0;}, l => {l.measurement.definitions = 0;}, l => {delete l.cards["Glorious Anthem"];},
    l => {l.cards["Glorious Anthem"] = null;},
    l => {l.cards["Glorious Anthem"].abilities = [];}, l => {l.cards["Glorious Anthem"].abilities[0].path = "different";},
    l => {delete l.cards["Glorious Anthem"].abilities[0].counterfactual;}, l => {l.summary.scenarioReached = 999;},
    l => {l.source.inputs.scripts = "stale";}, l => {l.source.inputs.scenarios = "stale";}, l => {l.source.revision = "stale";},
    l => {l.source.dirty = true;}, l => {l.scope.cardDirectory = "other";},
  ];
  for (const mutate of variants) {const changed = structuredClone(valid); mutate(changed); ok(abilityLedgerProblems(changed, expected).length > 0, "forged, partial or stale proof cannot pass");}
  ok(abilityLedgerProblems(valid, {...expected, source: {...source, dirty: true}}).length > 0, "changed working source invalidates old evidence");
  const workflow = readFileSync(path.join(repo, ".github/workflows/tests.yml"), "utf8");
  const step = workflow.split("      - name: Prove every final card ability\n")[1]?.split(/\n      (?:- |#)/)[0] ?? "";
  ok(/^        if: steps.repeat.outputs.skip != 'true'$/m.test(step) && !step.includes("continue-on-error"), "the ability step is mandatory on each unskipped run");
  ok(/^          node --stack-size=4000 game\/tools\/batch\/check-cards.mjs --ability-ledger /m.test(step)
    && /^          node game\/tools\/batch\/verify-card-ledger.mjs /m.test(step), "the executable run block checks and independently verifies the canonical ledger");
  ok(workflow.indexOf("- name: Prove every final card ability") < workflow.indexOf("- name: Run every suite"), "missing ability proof fails before the expensive full suite");
  const fallback = readFileSync(path.join(repo, "tools/local-ci.sh"), "utf8");
  ok(fallback.includes('node game/tools/batch/verify-card-ledger.mjs "$WORK.ability$i.json" )') && fallback.includes('fail "strict ability coverage'), "the full local fallback retains the same fatal ability gate");
  console.log(`card-check-cli: ${checks} checks; strict default execution, actual behavior proof, canonical inventory/source validation and CI wiring`);
} finally {
  for (const dir of cleanup) {
    const resolved = realpathSync(dir);
    assert.equal(path.dirname(resolved), temporary);
    assert.ok(path.basename(resolved).startsWith("crank-"));
    rmSync(resolved, {recursive: true, force: true});
  }
}
