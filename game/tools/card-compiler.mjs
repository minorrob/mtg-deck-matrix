/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD COMPILER: EVERY UNDEFINED COMMANDER CARD, SCORED, AND THE ONES THE SENTENCE LIBRARY TRANSLATES WHOLE STORED AS
 * CANDIDATES (card load step 3; Linear ROB-88; docs/engine/plan-card-load-program.md).
 *
 * The library (game/engine/cards/sentences.mjs) is built from the card directory and calibrated (game/tools/
 * sentence-library.mjs): each defined card held out, translated from the rest, and played through its own scenarios.
 * This tool turns it on every card the directory does not define. Each is classified, cheapest check first:
 *
 *   structure  a second face, an Adventure, a meld or another layout the library does not template
 *   unknown    a sentence no defined card writes: the card waits for a wave (its missing sentences are counted, so the
 *              report can name the sentences that would complete the most cards)
 *   vetoed     every sentence is known, but one comes from a template whose calibration recorded a failure, or from a
 *              band below the minimum count
 *   blocked    translated, but it needs something the engine has not built (compileScript's problems)
 *   refused    translated and compiled, but it is not its oracle text (checkFidelity) or its smoke game breaks (smokeTest)
 *   candidate  translated, compiled, its text, and its smoke game played: stored, with the templates it used and the
 *              calibrated rate of the weakest one
 *
 * A candidate is not a final card. It plays only where Rob's decision 2 allows (playtest tables, labeled; step 5), and a
 * wave reviews it before it joins the directory (step 6). "Fully accurate" is still proved by scenarios and play.
 *
 * Deterministic: the same directory, oracle data and calibration give the same file (no clock; cards in name order).
 *
 *   node game/tools/card-compiler.mjs                  the summary
 *   node game/tools/card-compiler.mjs --write          also writes data/engine/candidates.json
 *   node game/tools/card-compiler.mjs --report <dir> --date <yyyy-mm-dd>   and the report <dir>/card-compiler-<date>.md
 */
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {loadCardScripts, loadCardScenarios, loadCardIndex} from "./engine-cards.mjs";
import {compileScript} from "../engine/cards/index.mjs";
import {identityOf, oracleHash, checkFidelity, smokeTest} from "../engine/cards/compile.mjs";
import {createLibrary, translate, segment, templateWithout, isSimple, partialTranslate} from "../engine/cards/sentences.mjs";
import {calibrate, BANDS} from "./sentence-library.mjs";

export const CANDIDATES_SCHEMA = "CrankCardCandidates@1";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CANDIDATES_FILE = path.join(ROOT, "data", "engine", "candidates.json");
const read = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

/* Not cards a Commander deck plays: basic lands and tokens, and the non-game types (as the coverage measure counts them,
   docs/handoff-2026-10-12/sentence-reuse.mjs). */
const NOT_A_DECK_CARD = /Conspiracy|Scheme|Plane |Phenomenon|Vanguard|Dungeon|Attraction|Contraption|Stickers/;
export const deckCard = (card) => !/^(Basic Land|Token)/.test(card.type || "") && !NOT_A_DECK_CARD.test(card.type || "");

const bandOf = (k) => BANDS.findIndex(([a, b]) => k >= a && k <= b);

/** The oracle record as a card the library can translate: its printed facts, its text. */
export const asCard = (record) => ({identity: identityOf(record), oracleText: record.text ?? ""});
/** A candidate put back together with its oracle record: the script it was compiled from (the store keeps only its abilities). */
export const scriptOf = (candidate, record) => ({schema: "CrankCardScript@1", ...asCard(record), source: "compiler", abilities: candidate.abilities});

/**
 * One card, through every check.
 *
 * @param {object} record  the card's oracle record
 * @param {{library, trust: (id: string) => {ok: boolean, why?: string, band?: object}, definition}} given
 */
export function compileCard(record, {library, trust, definition}) {
  const base = {name: record.name, oracleId: record.id};
  if (record.layout !== "normal" || (record.faces && record.faces !== "None")) return {...base, status: "structure", layout: record.layout};
  const card = asCard(record);
  const tr = translate(card, library);
  if (!tr.ok) return {...base, status: "unknown", gaps: tr.gaps};
  const verdicts = tr.templates.map((id) => ({id, ...trust(id)}));
  const distrusted = verdicts.filter((v) => !v.ok);
  if (distrusted.length) return {...base, status: "vetoed", why: distrusted.map((v) => `${v.id}: ${v.why}`)};
  const {problems} = compileScript(tr.script);
  if (problems.length) return {...base, status: "blocked", why: problems};
  const fidelity = checkFidelity(tr.script);
  if (!fidelity.ok) return {...base, status: "refused", why: [`fidelity: ${[...fidelity.invented, ...fidelity.unclaimed][0]}`]};
  const smoke = smokeTest(tr.script, definition);
  if (!smoke.ok) return {...base, status: "refused", why: [`smoke: ${smoke.error ?? smoke.problems[0]}`]};
  /* A smoke fixture may finish without being able to cast its card. That is not played evidence for a candidate. */
  if (smoke.played !== true) return {...base, status: "refused", why: ["smoke: candidate was not played"]};
  const weakest = verdicts.reduce((w, v) => (!w || v.cards < w.cards ? v : w), null);
  return {...base, status: "candidate", oracleHash: oracleHash(record), templates: tr.templates,
    confidence: {fewestCards: weakest.cards, band: weakest.band.band, bandRate: weakest.band.rate, bandLow: weakest.band.low},
    smoke: {played: smoke.played, resolved: smoke.resolved ?? 0}, abilities: tr.script.abilities};
}

/* A template is trusted when it is in a band from the minimum count up and no card it translated failed. */
export function trustOf(library, calibration) {
  const minimum = calibration.minimumCount;
  return (id) => {
    const t = templateWithout(library, id, null);
    const band = calibration.pooled[bandOf(t.cards)];
    const rate = calibration.rates.get(id);
    if (minimum === null) return {ok: false, why: "no minimum count: the calibration set none", cards: t.cards, band};
    if (t.cards < minimum) return {ok: false, why: `seen on ${t.cards} card(s), under the minimum count ${minimum}`, cards: t.cards, band};
    if (rate && rate.passed < rate.tried) return {ok: false, why: `failed ${rate.tried - rate.passed} of ${rate.tried} in calibration`, cards: t.cards, band};
    return {ok: true, cards: t.cards, band};
  };
}

/**
 * What the writer is handed for a card the library knows only in part (card load step 4, the backstop): the abilities of
 * its trusted spans, already written, and the sentences left to write -- or null for another layout, or a card with
 * nothing left (the compiler's own). `except` holds a defined card out, for the backstop's held-out sample.
 */
export function assistOf(record, {library, trust, except = null}) {
  if (record.layout !== "normal" || (record.faces && record.faces !== "None")) return null;
  const partial = partialTranslate(asCard(record), library, {except, keep: (id) => trust(id).ok});
  return partial.write.length ? partial : null;
}

/**
 * The whole compile.
 *
 * @param {{oracle?, banned?, scripts?, index?, calibration?}} [given]  the repository's by default
 */
export function compileAll(given = {}) {
  const oracle = given.oracle ?? read("data/engine/oracle.json");
  const banned = new Set(given.banned ?? read("data/commander-banned.json").cards);
  const scripts = given.scripts ?? loadCardScripts().map((f) => f.script);
  const index = given.index ?? loadCardIndex();
  const library = createLibrary(scripts);
  const calibration = given.calibration ?? calibrate({scripts, library,
    scenarios: new Map(loadCardScenarios().map((f) => [f.scenarios.card, f.scenarios])), definition: index.definition});
  const trust = trustOf(library, calibration);
  const results = [];
  const records = oracle.cards.filter((c) => deckCard(c) && !banned.has(c.name) && !index.resolve(c.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const record of records) results.push(compileCard(record, {library, trust, definition: index.definition}));
  return {results, library, calibration, oracle};
}

/** The missing sentences that would complete the most cards: each one-gap card's gap, by how many cards it would finish. */
export function nextSentences(results, limit = 40) {
  const counts = new Map();
  for (const r of results) {
    if (r.status !== "unknown" || r.gaps.length !== 1) continue;
    const key = r.gaps[0].replace(/\s+/g, " ").trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([sentence, cards]) => ({sentence, cards}));
}

const count = (results, status) => results.filter((r) => r.status === status).length;
export function summaryOf(results) {
  return {pool: results.length, candidate: count(results, "candidate"), refused: count(results, "refused"), blocked: count(results, "blocked"),
    vetoed: count(results, "vetoed"), unknown: count(results, "unknown"), structure: count(results, "structure"),
    oneSentenceShort: results.filter((r) => r.status === "unknown" && r.gaps.length === 1).length};
}

/** The candidates file: the cards, their abilities, and what each rests on. The printed facts stay in the oracle data. */
export function candidatesFile({results, library, calibration, oracle}) {
  return {schema: CANDIDATES_SCHEMA, oracle: oracle.generatedAt ?? null, library: {templates: library.templates.size, cards: library.cards,
    minimumCount: calibration.minimumCount, calibrated: {translated: calibration.summary.translated, passed: calibration.summary.passed}},
    summary: summaryOf(results),
    cards: results.filter((r) => r.status === "candidate").map(({status, ...c}) => c)};
}

const pct = (x) => (x === null || x === undefined ? "—" : `${(100 * x).toFixed(1)}%`);
export function reportMarkdown({results, library, calibration}, {date}) {
  const s = summaryOf(results);
  const why = (status) => results.filter((r) => r.status === status);
  /* A vetoed card's reason is its template ("<level>:<template>: failed ..."); the others', the reason's first clause. */
  const firstWord = (r) => { const w = String(r.why?.[0] ?? ""); return r.status === "vetoed" ? w.slice(0, w.lastIndexOf(": ")) : w.split(":")[0]; };
  const reasons = (status) => [...why(status).reduce((m, r) => m.set(firstWord(r), (m.get(firstWord(r)) ?? 0) + 1), new Map())]
    .sort((a, b) => b[1] - a[1]).slice(0, 12);
  const next = nextSentences(results);
  return [
    `# The card compiler, ${date} (card load step 3; Linear ROB-88)`,
    "",
    "Generated by `node game/tools/card-compiler.mjs --write --report docs/engine --date " + date + "`. Every Commander card the",
    "directory does not define, through the sentence library: translated from the defined cards' templates, compiled, held",
    "to its oracle text and played in the loader's smoke game. The candidates are in `data/engine/candidates.json`.",
    "",
    "## What a candidate is, and is not",
    "",
    "- **Every sentence comes from a calibrated template.** With each defined card held out, the library's translations passed",
    `  their own scenarios ${calibration.summary.passed} of ${calibration.summary.translated} times (docs/engine/sentence-calibration-2026-10-19.md).`,
    "  A template that failed there vetoes every card that uses it.",
    "- **It compiled, its abilities are its oracle text, and its smoke game played** without breaking the game.",
    "- **It has no scenarios of its own yet.** It is a candidate: it plays only at playtest tables, labeled (Rob's decision 2,",
    "  step 5), and a wave reviews it before it joins the directory (step 6).",
    "",
    "## The cards",
    "",
    "| Undefined Commander cards | Candidates | Refused | Blocked (a rule not built) | Vetoed | A sentence unknown | One sentence short | Another layout |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${s.pool} | **${s.candidate}** | ${s.refused} | ${s.blocked} | ${s.vetoed} | ${s.unknown} | ${s.oneSentenceShort} | ${s.structure} |`,
    "",
    `The library: ${library.templates.size} templates from ${library.cards} defined cards; minimum count ${calibration.minimumCount}.`,
    "",
    "## Blocked, refused and vetoed",
    "",
    "| Status | Why | Cards |",
    "| --- | --- | ---: |",
    ...["blocked", "refused", "vetoed"].flatMap((status) => reasons(status).map(([w, n]) => `| ${status} | ${w.replace(/\|/g, "\\|").slice(0, 120)} | ${n} |`)),
    "",
    `## The next sentences to teach (${next.length} shown)`,
    "",
    "Cards one sentence short of translating, by the sentence they lack. Defining one card that writes the sentence makes",
    "it a template, and the compiler can then take every card below it. These are the cheapest cards for the next wave.",
    "",
    "| Sentence | Cards it would complete |",
    "| --- | ---: |",
    ...next.map(({sentence, cards}) => `| ${sentence.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160)} | ${cards} |`),
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  const compiled = compileAll();
  const s = summaryOf(compiled.results);
  console.log(`card-compiler: ${s.pool} undefined Commander cards; ${s.candidate} candidates, ${s.refused} refused, ${s.blocked} blocked, ` +
    `${s.vetoed} vetoed, ${s.unknown} with an unknown sentence (${s.oneSentenceShort} one short), ${s.structure} another layout ` +
    `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (process.argv.includes("--write")) {
    writeFileSync(CANDIDATES_FILE, JSON.stringify(candidatesFile(compiled)) + "\n");
    console.log(`  wrote ${path.relative(ROOT, CANDIDATES_FILE)}`);
  }
  const dir = arg("--report");
  if (dir) {
    const date = arg("--date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("--report needs --date yyyy-mm-dd");
    writeFileSync(path.join(dir, `card-compiler-${date}.md`), reportMarkdown(compiled, {date}));
    console.log(`  wrote ${path.join(dir, `card-compiler-${date}.md`)}`);
  }
}
