/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {CARDS_DIR, loadCardScripts, loadCardScenarios} from "../engine-cards.mjs";
import {cardCheckSource, abilityLedgerProblems} from "../card-check-policy.mjs";
import {exerciseSummary} from "../ability-evidence.mjs";

if (process.argv.length !== 3 || process.argv[2].startsWith("--")) throw new Error("verify-card-ledger takes one completed canonical ledger path");
const raw = readFileSync(process.argv[2]), ledger = JSON.parse(raw);
const problems = abilityLedgerProblems(ledger, {scripts: loadCardScripts().map(entry => entry.script),
  files: loadCardScenarios().map(entry => entry.scenarios), cardRoot: CARDS_DIR,
  source: cardCheckSource(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."))});
for (const problem of problems) console.error(`ability ledger: ${problem}`);
if (problems.length) process.exitCode = 1;
else {
  const summary = exerciseSummary(ledger);
  console.log(`ability ledger: VERIFIED ${summary.final} definitions, ${ledger.measurement.scenarios} scenarios, ${summary.scenarioReached}/${summary.abilities} abilities; source ${ledger.source.revision}; SHA-256 ${createHash("sha256").update(raw).digest("hex")}`);
}
