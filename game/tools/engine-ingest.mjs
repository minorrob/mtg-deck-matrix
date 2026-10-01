/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* DEFINITIONS WRITTEN IN A CLAUDE CODE SESSION, CHECKED AND STORED AS THE LOADER STORES ITS OWN.
 *
 * Rob, 2026-10-01: "I want all of the 80% most frequently used cards to be pre-loaded so that very few will actually
 * need loading at Play time and few will need to use my AI API." The card loader (engine-compile.mjs, AI-3) writes a
 * card's abilities with Rob's API key; this takes abilities written in a session instead -- at no cost to that key --
 * and holds them to the same checks before anything is stored:
 *
 *   schema     validateScript, every error at once (script/schema.mjs)
 *   fidelity   each ability a sentence of the card, every clause claimed (compile.mjs checkFidelity)
 *   smoke      played through a scratch game; blocked, not refused, when it needs something the engine has not built
 *
 * The loader's fourth check, a second model reading the definition back against the card, is not run here and the
 * stored record says so (`readBack: "not run"`): a definition written in a session is PROVISIONAL, playable and
 * marked as unconfirmed, until a playtest or Rob confirms it -- the same status the loader gives its own. What passes
 * is written to data/engine/scripts/<oracle-id prefix>/<oracle-id>.json and the ledger, exactly as the loader writes,
 * so the card directory reads both alike; a hand-authored definition (game/engine/cards) still wins wherever one exists.
 *
 *   node game/tools/engine-ingest.mjs <session-file.json> [--dry-run]
 *
 * The session file: {"schema": "CrankSessionScripts@1", "writer": "<who wrote it>", "cards": [{"name", "abilities",
 * "notes"?, "crFlags"?}]}.
 */

import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {COMPILED_SCHEMA, oracleHash, checkAnswer, smokeTest} from "../engine/cards/compile.mjs";
import {loadCardScripts, loadCardIndex} from "./engine-cards.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SESSION_SCHEMA = "CrankSessionScripts@1";
const LEARNED = ["provisional", "blocked", "confirmed"];

/**
 * Check and store one session file's cards.
 *
 * @param {{cards: object[], writer: string, oracle: Map<string, object>, hand: Set<string>, index: Function, ledger: object,
 *   write?: Function, now?: Function}} job
 * @returns {object[]} each card's outcome
 */
export function ingestCards(job) {
  const {cards, writer, oracle, hand, index, ledger} = job;
  const write = job.write ?? (() => {}), now = job.now ?? (() => new Date().toISOString());
  const results = [];
  for (const entry of cards) {
    const name = String(entry?.name ?? "");
    const card = oracle.get(name);
    if (!card) { results.push({name, outcome: "no oracle card"}); continue; }
    if (hand.has(name)) { results.push({name, outcome: "hand-authored"}); continue; }
    const hash = oracleHash(card), prior = ledger.cards[card.id];
    if (prior && prior.oracleHash === hash && LEARNED.includes(prior.status)) { results.push({name, outcome: "already learned", status: prior.status}); continue; }
    const row = (status, extra = {}) => {
      ledger.cards[card.id] = {name, status, oracleHash: hash, attempts: 1, model: writer, readBackModel: null, inputTokens: 0, outputTokens: 0, cost: 0, at: now(), ...extra};
      results.push({name, outcome: status, ...extra});
    };
    const checked = checkAnswer(card, {abilities: entry.abilities}, writer);
    if (checked.stage) { row("failed", {stage: checked.stage, problems: checked.problems}); continue; }
    const smoke = smokeTest(checked.script, index);
    if (!smoke.ok && !smoke.blocked) { row("failed", {stage: "smoke", problems: smoke.problems}); continue; }
    const status = smoke.blocked ? "blocked" : "provisional";
    const crFlags = Array.isArray(entry.crFlags) ? entry.crFlags.map(String) : [];
    write(card.id, {
      schema: COMPILED_SCHEMA, name, oracleId: card.id, oracleHash: hash, status, script: checked.script,
      checks: {schema: "pass", fidelity: "pass", readBack: "not run", smoke: smoke.blocked ? {blocked: smoke.problems} : {played: smoke.played, resolutions: smoke.resolved}},
      crFlags, notes: String(entry.notes ?? ""), models: {writer, readBack: null}, attempts: 1, compiledAt: now(),
    });
    row(status, {...(smoke.blocked ? {problems: smoke.problems} : {}), ...(crFlags.length ? {crFlags} : {})});
  }
  return results;
}

/* ---- the command line ---- */

const scriptPath = (oracleId) => path.join(REPO, "data", "engine", "scripts", oracleId.slice(0, 2), `${oracleId}.json`);
const LEDGER = path.join(REPO, "data", "engine", "onboarding-ledger.json");

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node game/tools/engine-ingest.mjs <session-file.json> [--dry-run]"); process.exit(2); }
  const session = JSON.parse(readFileSync(file, "utf8"));
  if (session.schema !== SESSION_SCHEMA) { console.error(`engine-ingest: ${file} is not ${SESSION_SCHEMA}`); process.exit(2); }
  const dry = process.argv.includes("--dry-run");
  const oracle = new Map(JSON.parse(readFileSync(path.join(REPO, "data", "engine", "oracle.json"), "utf8")).cards.map((c) => [c.name, c]));
  const hand = new Set(loadCardScripts().map((e) => e.script.identity.name));
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {schema: "CrankOnboardingLedger@1", cards: {}};
  const index = loadCardIndex().definition;
  const results = ingestCards({cards: session.cards ?? [], writer: String(session.writer ?? "claude-code-session"), oracle, hand, index, ledger,
    write: dry ? () => {} : (id, record) => { mkdirSync(path.dirname(scriptPath(id)), {recursive: true}); writeFileSync(scriptPath(id), JSON.stringify(record, null, 1) + "\n"); }});
  if (!dry) writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + "\n");
  const by = (o) => results.filter((r) => r.outcome === o);
  console.log(`engine-ingest: ${results.length} cards -- provisional ${by("provisional").length}, blocked ${by("blocked").length}, failed ${by("failed").length}, skipped ${results.length - by("provisional").length - by("blocked").length - by("failed").length}${dry ? " (dry run: nothing written)" : ""}`);
  for (const r of by("failed")) console.log(`  failed  ${r.name} at ${r.stage}: ${(r.problems ?? []).join("; ").slice(0, 240)}`);
  for (const r of by("blocked")) console.log(`  blocked ${r.name}: ${(r.problems ?? []).join("; ").slice(0, 160)}`);
}
