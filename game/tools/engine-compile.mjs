/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AI-3'S FIRST BATCH: THE CARD LOADER, RUN OFFLINE BY ROB.
 *
 * `docs/plan-to-done-2026-09-30.md` AI-3 -- "the first batch is Rob's whole library ... learned as an offline job run
 * by Rob, so that everything he owns is playable before any table needs it" -- and `docs/engine/PLAN.md` §3.4's model
 * compiler. For each card: the writer (Claude Sonnet 5.5, medium effort) writes its abilities from the oracle text;
 * the four checks in `game/engine/cards/compile.mjs` decide whether it is the card (schema, fidelity by code and by a
 * Claude Haiku 5.5 read-back, a smoke game, rules flagged for a ruling); what passes is written to
 * `data/engine/scripts/<oracle-id prefix>/<oracle-id>.json`, and every card's outcome to the ledger,
 * `data/engine/onboarding-ledger.json`, which is read before a single token is spent.
 *
 * IT SPENDS, SO IT RUNS ONLY WHEN ASKED. Without `--yes` it calls nothing; `--plan` says what a run would learn and
 * from what, for free. The key is Rob's: ANTHROPIC_API_KEY, or the Windows Credential Manager entry
 * `crankmagic_anthropic_api` (Rob confirmed the name, 2026-09-23), never a file, a page, a URL or a log. A run stops
 * at `--max-cost` (US dollars, default 5) at list prices, and `--sample N` takes the first N cards still to learn --
 * PLAN §3.4 asks for a 200-card sample, its pass rate and cost reported to Rob, before the whole library.
 *
 * WHAT IT NEVER DOES: overwrite a hand-authored definition (`game/engine/cards`, which wins wherever it exists); learn
 * a card twice for the same oracle text (the ledger keys on the oracle id and the text's hash); send anything but
 * the card's public text and the engine's own vocabulary.
 *
 * CARD LOAD STEP 4, THE BACKSTOP (docs/engine/plan-card-load-program.md; Linear ROB-90). A card the card compiler made a
 * candidate (`data/engine/candidates.json`) costs nothing and is skipped. Any other card is handed to the writer with what
 * the sentence library already wrote of it (card-compiler.mjs `assistOf`: its trusted sentences, written), so the writer
 * writes only the sentences left; the card is then checked whole, as before. `--whole` asks for the whole card instead.
 * `--held-out N` is the plan's sample: N defined cards, each held out of the library, finished by the writer and played
 * through its own scenarios, for the pass rate and the cost per card. It spends too, so it also needs `--yes`.
 *
 *   node game/tools/engine-compile.mjs --plan [--library | --decks | --cards "A,B" | --demand demand.json] [--sample 200]
 *   node game/tools/engine-compile.mjs --yes  [--library | --decks | --cards "A,B" | --demand demand.json] [--sample 200] [--max-cost 5] [--whole]
 *   node game/tools/engine-compile.mjs --yes --held-out 200 [--max-cost 5]
 */

import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {
  COMPILED_SCHEMA, oracleHash, checkAnswer, checkReadBack, smokeTest, writerSystem, writerRequest, WRITER_SCHEMA, ADVENTURE_BY_HAND,
  READBACK_SYSTEM, READBACK_SCHEMA, readBackRequest,
} from "../engine/cards/compile.mjs";
import {loadCardScripts, loadCardIndex, loadCardScenarios} from "./engine-cards.mjs";
import {compileScript} from "../engine/cards/index.mjs";
import {runScenario} from "../engine/cards/scenario.mjs";
import {createLibrary, isSimple} from "../engine/cards/sentences.mjs";
import {calibrate} from "./sentence-library.mjs";
import {assistOf, trustOf, CANDIDATES_FILE} from "./card-compiler.mjs";
import {readWindowsGenericCredential} from "./windows-credential.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

export const WRITER_MODEL = "claude-sonnet-5-5";
export const READER_MODEL = "claude-haiku-5-5";
/* List prices, US dollars per million tokens [input, output]; a cache read is a tenth of input. */
export const PRICES = Object.freeze({"claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5]});
export const CREDENTIAL = "crankmagic_anthropic_api";
const LEARNED = ["provisional", "blocked", "confirmed"];

/** What a call cost at list prices. */
export function costOf(model, usage = {}) {
  const [input, output] = PRICES[model] ?? [10, 50];
  return ((usage.input_tokens ?? 0) * input + (usage.cache_creation_input_tokens ?? 0) * input * 1.25
    + (usage.cache_read_input_tokens ?? 0) * input * 0.1 + (usage.output_tokens ?? 0) * output) / 1e6;
}

/** The Messages API, over fetch. `send` is injected in tests; nothing else in this file touches the network. */
export function messagesTransport(key, send = fetch) {
  return async (body) => {
    const res = await send("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: {"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"}, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`the API refused the call: ${json?.error?.message ?? res.status}`);
    const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    let answer = null;
    try { answer = JSON.parse(text); } catch { answer = null; }
    return {answer, usage: json.usage ?? {}};
  };
}

/* The writer's examples: finished definitions from the hand-authored directory, one of each kind the vocabulary has. */
function examplesFrom(scripts) {
  const want = ["Lightning Bolt", "Wall of Omens", "Mind Stone", "Sunpetal Grove", "Mystic Snake", "Command Tower"];
  return want.map((name) => scripts.find((s) => s.identity.name === name)).filter(Boolean);
}

/**
 * Learn a list of cards.
 *
 * @param {{names: string[], oracle: Map<string, object>, hand: Set<string>, cards: Function, ledger: object, call: Function,
 *   examples: object[], maxCost?: number, sample?: number, retries?: number, write?: Function, now?: Function,
 *   assist?: (card: object) => ?{known: object[], write: object[]}}} job  `assist`: what the sentence library already wrote of
 *   a card (card load step 4; card-compiler.mjs `assistOf`), so the writer writes only the rest
 * @returns {Promise<{results: object[], cost: number, stopped: ?string}>}
 */
export async function compileCards(job) {
  const {names, oracle, hand, cards, ledger, call, examples} = job;
  const maxCost = job.maxCost ?? 5, retries = job.retries ?? 2, write = job.write ?? (() => {}), now = job.now ?? (() => new Date().toISOString());
  const system = writerSystem(examples);
  const results = [];
  let cost = 0, stopped = null, taken = 0;
  for (const name of names) {
    const card = oracle.get(name);
    if (!card) { results.push({name, outcome: "no oracle card"}); continue; }
    if (hand.has(name)) { results.push({name, outcome: "hand-authored"}); continue; }
    /* The card compiler's candidates cost nothing (card load step 3): the writer is never asked for one. */
    if (job.candidates?.has(name)) { results.push({name, outcome: "a candidate"}); continue; }
    /* An adventurer card is not asked of the writer at all (CR 715.2; cards/compile.mjs checkAnswer): nothing spent on it. */
    if (card.layout === "adventure") { results.push({name, outcome: "refused", problems: [ADVENTURE_BY_HAND]}); continue; }
    const hash = oracleHash(card), prior = ledger.cards[card.id];
    if (prior && prior.oracleHash === hash && LEARNED.includes(prior.status)) { results.push({name, outcome: "already learned", status: prior.status}); continue; }
    if (job.sample !== undefined && taken >= job.sample) break;
    if (cost >= maxCost) { stopped = `the run reached its $${maxCost.toFixed(2)} cap`; break; }
    taken += 1;

    const usage = {writer: {input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0}, reader: {input_tokens: 0, output_tokens: 0}};
    const add = (into, u) => { for (const k of Object.keys(into)) into[k] += u?.[k] ?? 0; };
    let checked = null, answer = null, errors = null, attempts = 0;
    const assist = job.assist ? job.assist(card) : null;
    /* The writer, retried against everything the checks found wrong (schema.mjs returns every error at once). */
    while (attempts <= retries) {
      attempts += 1;
      const reply = await call({
        model: WRITER_MODEL, max_tokens: 8000,
        system: [{type: "text", text: system, cache_control: {type: "ephemeral"}}],
        messages: [{role: "user", content: writerRequest(card, errors, assist)}],
        output_config: {effort: "medium", format: {type: "json_schema", schema: WRITER_SCHEMA}},
      });
      add(usage.writer, reply.usage);
      answer = reply.answer;
      checked = checkAnswer(card, answer ?? {}, WRITER_MODEL, assist?.known ?? null);
      if (!checked.stage) break;
      errors = checked.problems;
    }
    const spent = () => costOf(WRITER_MODEL, usage.writer) + costOf(READER_MODEL, usage.reader);
    const row = (status, extra = {}) => {
      const c = spent();
      cost += c;
      ledger.cards[card.id] = {name, status, oracleHash: hash, attempts, model: WRITER_MODEL, readBackModel: READER_MODEL,
        ...(assist ? {assisted: {known: assist.known.length, written: assist.write.length}} : {}),
        inputTokens: usage.writer.input_tokens + usage.reader.input_tokens, outputTokens: usage.writer.output_tokens + usage.reader.output_tokens,
        cost: Number(c.toFixed(6)), at: now(), ...extra};
      results.push({name, outcome: status, ...extra, cost: c});
    };
    if (checked.stage) { row("failed", {stage: checked.stage, problems: checked.problems}); continue; }

    /* The read-back: a second model's checklist against the oracle text. A mismatch is a refusal to store. Thinking
       off, as Haiku 4.5 read it (Rob, 2026-10-25, "switch the compiler's check step to Haiku 5.5"): Haiku 5.5 thinks by
       default, and its thinking would spend the 2000 tokens the checklist is given. */
    const reading = await call({
      model: READER_MODEL, max_tokens: 2000, system: READBACK_SYSTEM, thinking: {type: "disabled"},
      messages: [{role: "user", content: readBackRequest(card, checked.script)}],
      output_config: {format: {type: "json_schema", schema: READBACK_SCHEMA}},
    });
    add(usage.reader, reading.usage);
    const readBack = checkReadBack(reading.answer);
    if (!readBack.ok) { row("failed", {stage: "read-back", problems: [...readBack.failed.map((k) => `${k}: no`), ...readBack.problems]}); continue; }

    const smoke = smokeTest(checked.script, cards);
    if (!smoke.ok && !smoke.blocked) { row("failed", {stage: "smoke", problems: smoke.problems}); continue; }

    /* Stored provisional until a playtest or Rob confirms it (AI-3, check 5); blocked when it waits on the engine. */
    const status = smoke.blocked ? "blocked" : "provisional";
    const crFlags = Array.isArray(answer?.crFlags) ? answer.crFlags.map(String) : [];
    write(card.id, {
      schema: COMPILED_SCHEMA, name, oracleId: card.id, oracleHash: hash, status, script: checked.script,
      checks: {schema: "pass", fidelity: "pass", readBack: "pass", smoke: smoke.blocked ? {blocked: smoke.problems} : {played: smoke.played, resolutions: smoke.resolved}},
      crFlags, notes: String(answer?.notes ?? ""), models: {writer: WRITER_MODEL, readBack: READER_MODEL}, attempts, compiledAt: now(),
    });
    row(status, {...(smoke.blocked ? {problems: smoke.problems} : {}), ...(crFlags.length ? {crFlags} : {})});
  }
  return {results, cost, stopped};
}

/**
 * THE BACKSTOP'S SAMPLE (card load step 4): defined cards the library knows only in part with themselves held out, each
 * finished by the writer from what the library wrote, checked as any card is, and played through its own scenarios.
 * Nothing is written: the cards are defined already, and the sample measures the writer, not the directory.
 *
 * @param {{scripts: object[], scenarios: Map, definition: Function, oracle: Map, library, trust: Function, call: Function,
 *   examples: object[], n: number, maxCost?: number}} job
 * @returns {Promise<{results: {name, outcome, why?, cost, written}[], tried: number, passed: number, cost: number, stopped: ?string}>}
 */
export async function heldOutSample(job) {
  const {scripts, scenarios, definition, oracle, library, trust, call, examples, n} = job;
  const maxCost = job.maxCost ?? 5, system = writerSystem(examples);
  const pool = scripts.filter((s) => isSimple(s) && scenarios.get(s.identity.name)?.scenarios?.length && oracle.has(s.identity.name))
    .map((s) => ({script: s, record: oracle.get(s.identity.name)}))
    .map((x) => ({...x, assist: assistOf(x.record, {library, trust, except: x.script.identity.name})}))
    .filter((x) => x.assist)
    .sort((a, b) => (a.script.identity.name < b.script.identity.name ? -1 : 1));
  const step = Math.max(1, Math.floor(pool.length / Math.max(1, n)));
  const chosen = pool.filter((_, i) => i % step === 0).slice(0, n);
  const results = [];
  let cost = 0, stopped = null;
  for (const {script, record, assist} of chosen) {
    if (cost >= maxCost) { stopped = `the sample reached its $${maxCost.toFixed(2)} cap`; break; }
    const name = script.identity.name;
    const reply = await call({
      model: WRITER_MODEL, max_tokens: 8000,
      system: [{type: "text", text: system, cache_control: {type: "ephemeral"}}],
      messages: [{role: "user", content: writerRequest(record, null, assist)}],
      output_config: {effort: "medium", format: {type: "json_schema", schema: WRITER_SCHEMA}},
    });
    const spent = costOf(WRITER_MODEL, reply.usage);
    cost += spent;
    const row = (outcome, why) => results.push({name, outcome, ...(why ? {why} : {}), cost: spent, written: assist.write.length, known: assist.known.length});
    const checked = checkAnswer(record, reply.answer ?? {}, WRITER_MODEL, assist.known);
    if (checked.stage) { row("failed", `${checked.stage}: ${checked.problems[0]}`); continue; }
    const {definition: own, problems} = compileScript(checked.script);
    if (problems.length) { row("failed", `compiles: ${problems[0]}`); continue; }
    const file = scenarios.get(name);
    const cards = (other) => (other === name ? structuredClone(own) : definition(other));
    try { for (const scenario of file.scenarios) runScenario(scenario, cards, file.fixtures ?? {}); }
    catch (error) { row("failed", `plays: ${String(error.message).split("\n")[0]}`); continue; }
    row("passed");
  }
  const passed = results.filter((r) => r.outcome === "passed").length;
  return {results, tried: results.length, passed, cost, stopped};
}

/* ---- the command line ---- */

const scriptPath = (oracleId) => path.join(REPO, "data", "engine", "scripts", oracleId.slice(0, 2), `${oracleId}.json`);
const LEDGER = path.join(REPO, "data", "engine", "onboarding-ledger.json");

/** The cards a run may learn: Rob's library (the Master sheet's every card), his seven decks, named ones, or the cards
    players asked for that no table could seat (`--demand`, the file game/tools/card-demand.mjs writes from staging's
    `card_demand`, in its order: card load step 5, the cards wanted loaded first). */
export function cardList(args) {
  const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? ""; };
  if (flag("--cards") !== null) return flag("--cards").split(",").map((s) => s.trim()).filter(Boolean);
  if (flag("--demand") !== null) {
    const asked = JSON.parse(readFileSync(path.resolve(flag("--demand")), "utf8"));
    return [...new Set((Array.isArray(asked) ? asked : asked.cards ?? []).map((r) => (typeof r === "string" ? r : r?.name)).filter(Boolean))];
  }
  const live = JSON.parse(readFileSync(path.join(REPO, "data", "live-load.json"), "utf8"));
  if (args.includes("--decks")) return [...new Set(live.decks.flatMap((d) => d.cards.map(([n]) => n)))].sort();
  return Object.keys(live.metadata ?? {}).sort();
}

async function main(args) {
  const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? ""; };
  const oracle = new Map(JSON.parse(readFileSync(path.join(REPO, "data", "engine", "oracle.json"), "utf8")).cards.map((c) => [c.name, c]));
  const scripts = loadCardScripts().map((e) => e.script);
  const hand = new Set(scripts.map((s) => s.identity.name));
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {schema: "CrankOnboardingLedger@1", cards: {}};
  const names = cardList(args);
  const sample = flag("--sample") === null ? undefined : Number(flag("--sample"));
  const todo = names.filter((n) => oracle.has(n) && !hand.has(n)).filter((n) => {
    const c = oracle.get(n), prior = ledger.cards[c.id];
    return !(prior && prior.oracleHash === oracleHash(c) && LEARNED.includes(prior.status));
  });

  const directory = loadCardIndex();
  /* What the sentence library knows, and which of its templates the calibration trusts (card load steps 2 and 3). */
  const library = createLibrary(scripts), scenarios = new Map(loadCardScenarios().map((f) => [f.scenarios.card, f.scenarios]));
  const trust = trustOf(library, calibrate({scripts, library, scenarios, definition: directory.definition}));
  const candidates = new Set(JSON.parse(readFileSync(CANDIDATES_FILE, "utf8")).cards.map((c) => c.name));
  const asked = todo.filter((n) => !candidates.has(n)), assisted = asked.filter((n) => assistOf(oracle.get(n), {library, trust})?.known.length);

  if (!args.includes("--yes")) {
    console.log(`engine-compile: ${names.length} cards asked for; ${names.filter((n) => hand.has(n)).length} hand-authored, ${names.filter((n) => !oracle.has(n)).length} not in the oracle data, ${todo.length} still to learn${sample !== undefined ? ` (a run with --sample ${sample} would take ${Math.min(sample, todo.length)})` : ""}.`);
    console.log(`Of those, ${todo.length - asked.length} are the card compiler's candidates and cost nothing; ${assisted.length} of the other ${asked.length} would be finished from what the sentence library already wrote${args.includes("--whole") ? " (but --whole asks for every card whole)" : ""}.`);
    console.log("This spends money at list prices. Run it with --yes and Rob's key (ANTHROPIC_API_KEY, or the Windows Credential Manager entry crankmagic_anthropic_api).");
    process.exit(args.includes("--plan") ? 0 : 2);
  }
  const key = process.env.ANTHROPIC_API_KEY || readWindowsGenericCredential(CREDENTIAL);
  if (!key) { console.error("engine-compile: no key -- set ANTHROPIC_API_KEY or store it as crankmagic_anthropic_api in Windows Credential Manager."); process.exit(2); }

  if (flag("--held-out") !== null) {
    const run = await heldOutSample({scripts, scenarios, definition: directory.definition, oracle, library, trust, call: messagesTransport(key),
      examples: examplesFrom(scripts), n: Number(flag("--held-out")), maxCost: Number(flag("--max-cost") ?? 5)});
    console.log(`engine-compile: held-out sample -- ${run.passed} of ${run.tried} passed their own scenarios (${run.tried ? (100 * run.passed / run.tried).toFixed(1) : "0"}%), $${run.cost.toFixed(2)} at list prices, $${run.tried ? (run.cost / run.tried).toFixed(4) : "0"} a card.${run.stopped ? ` Stopped: ${run.stopped}.` : ""}`);
    for (const r of run.results.filter((x) => x.outcome === "failed")) console.log(`  failed ${r.name}: ${r.why}`);
    return;
  }
  const {results, cost, stopped} = await compileCards({
    names, oracle, hand, cards: directory.definition, ledger, call: messagesTransport(key), examples: examplesFrom(scripts),
    maxCost: Number(flag("--max-cost") ?? 5), sample, retries: 2, candidates,
    ...(args.includes("--whole") ? {} : {assist: (card) => assistOf(card, {library, trust})}),
    write: (oracleId, compiled) => { mkdirSync(path.dirname(scriptPath(oracleId)), {recursive: true}); writeFileSync(scriptPath(oracleId), JSON.stringify(compiled, null, 2) + "\n"); },
  }).catch((error) => { writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n"); throw error; });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  const count = (outcome) => results.filter((r) => r.outcome === outcome).length;
  const tried = count("provisional") + count("blocked") + count("failed");
  console.log(`engine-compile: ${tried} cards tried -- ${count("provisional")} provisional, ${count("blocked")} blocked on the engine, ${count("failed")} refused`
    + ` (pass rate ${tried ? ((100 * (count("provisional") + count("blocked"))) / tried).toFixed(1) : "0"}%), $${cost.toFixed(2)} at list prices.${stopped ? ` Stopped: ${stopped}.` : ""}`);
  for (const r of results.filter((x) => x.outcome === "failed")) console.log(`  refused ${r.name} at ${r.stage}: ${(r.problems ?? []).slice(0, 2).join("; ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main(process.argv.slice(2));
export {examplesFrom};
