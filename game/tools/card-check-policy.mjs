/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {EXERCISED_SCHEMA, abilityInventory, exerciseSummary} from "./ability-evidence.mjs";

export function parseCardCheckArgs(argv) {
  const options = {ledgerPath: null, selected: null, cardRoot: null, help: false};
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!["--ability-ledger", "--cards", "--card-root", "--counterfactual", "--help"].includes(flag)) throw new Error(`Unknown card-check option: ${flag}`);
    if (seen.has(flag)) throw new Error(`Duplicate card-check option: ${flag}`);
    seen.add(flag);
    if (flag === "--counterfactual") continue; // Compatibility spelling: runtime-removal proof is always enabled.
    if (flag === "--help") {options.help = true; continue;}
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    if (flag === "--ability-ledger") options.ledgerPath = value;
    if (flag === "--card-root") options.cardRoot = value;
    if (flag === "--cards") {
      options.selected = value.split("|");
      if (options.selected.some(name => !name.trim()) || new Set(options.selected).size !== options.selected.length)
        throw new Error("--cards takes distinct exact names separated by |.");
    }
  }
  if (options.help && argv.length !== 1) throw new Error("--help cannot be combined with a card check");
  return options;
}

export function cardInputHashes(scripts, files) {
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return {scripts: hash(scripts), scenarios: hash(files)};
}

export function cardCheckSource(root) {
  const git = args => execFileSync("git", args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
  return {revision: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]),
    dirty: git(["status", "--porcelain", "--untracked-files=normal"]) !== ""};
}

/** Independently check a completed canonical ledger against the current on-disk inventory, never its claimed totals. */
export function abilityLedgerProblems(ledger, {scripts, files, source}) {
  const problems = [];
  if (ledger?.schema !== EXERCISED_SCHEMA) return ["Missing or unknown ability-ledger schema"];
  if (!Array.isArray(scripts) || !scripts.length || !Array.isArray(files) || !files.length
    || files.some(file => !Array.isArray(file.scenarios))) return ["The expected card directory is empty or malformed"];
  if (ledger.scope?.directory !== true || ledger.scope?.canonical !== true || ledger.scope?.selected)
    problems.push("A selection or custom directory cannot pass the canonical directory gate");
  if (typeof ledger.scope?.cardRoot !== "string" || !ledger.scope.cardRoot || ledger.scope?.cardDirectory !== "game/engine/cards")
    problems.push("Ability ledger names a different card directory");
  const count = files.reduce((n, file) => n + file.scenarios.length, 0), measurement = ledger.measurement;
  if (files.some(file => file.scenarios.some(scenario => scenario.sourceChoices === false)))
    problems.push("Legacy source-choice scenarios cannot supply the current canonical gate");
  if (measurement?.complete !== true || measurement?.counterfactual !== true) problems.push("Ability measurement is incomplete or omitted runtime-removal probes");
  if (measurement?.definitions !== scripts.length || measurement?.scenarios !== count || count === 0)
    problems.push("Ability measurement does not cover the expected definitions and scenarios");
  if (measurement?.problems !== 0 || measurement?.failed !== 0) problems.push("Definition, fidelity, smoke or scenario checks failed");
  const hashes = cardInputHashes(scripts, files);
  if (ledger.source?.inputs?.scripts !== hashes.scripts || ledger.source?.inputs?.scenarios !== hashes.scenarios)
    problems.push("Card or scenario inputs changed after this measurement");
  if (!source || source.dirty || ledger.source?.dirty !== false || ledger.source?.revision !== source.revision || ledger.source?.tree !== source.tree)
    problems.push("Ability evidence is dirty or belongs to a different source revision");
  const names = scripts.map(script => script.identity.name);
  if (!ledger.cards || Array.isArray(ledger.cards) || JSON.stringify(Object.keys(ledger.cards).sort()) !== JSON.stringify([...names].sort()))
    return [...problems, "Ability ledger does not contain the exact card inventory"];
  for (const script of scripts) {
    const name = script.identity.name, actual = ledger.cards[name]?.abilities, expected = abilityInventory(script);
    if (!Array.isArray(actual) || actual.length !== expected.length || expected.some((ability, i) =>
      ["path", "runtimeId", "face", "kind", "keyword", "text", "mana"].some(key => actual[i]?.[key] !== ability[key])))
      problems.push(`Ability inventory differs for ${name}`);
    if (!files.some(file => file.card === name && file.scenarios.length)) problems.push(`No saved scenario for ${name}`);
  }
  if (problems.some(p => p.startsWith("Ability inventory differs"))) return problems;
  try {
    const summary = exerciseSummary(ledger);
    for (const key of ["final", "abilities", "scenarioReached", "counterfactualReached", "scenarioComplete"])
      if (ledger.summary?.[key] !== summary[key]) problems.push(`Ability summary disagrees with raw evidence: ${key}`);
    if (!summary.scenarioComplete) problems.push(`${summary.abilities - summary.scenarioReached} abilities have no passing-scenario behavior proof`);
  } catch {
    problems.push("Malformed raw ability evidence");
  }
  return problems;
}
