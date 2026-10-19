/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD COMPILER AND ITS CANDIDATES (card load step 3; Linear ROB-88; docs/engine/plan-card-load-program.md;
 * game/tools/card-compiler.mjs, data/engine/candidates.json).
 *
 *   1. The candidates file: its shape and summary; no candidate banned, defined by hand, or written for other oracle
 *      text than today's (each says to run the compiler again).
 *   2. Every candidate, put back together with its oracle record, compiles with nothing missing and is its oracle text;
 *      a sample plays its smoke game.
 *   3. Reproducible: the compiler over a slice of the oracle data gives the same cards, the same abilities, and leaves out
 *      the banned, the defined and the other layouts.
 *   4. Each status, from its cause: another layout, an unknown sentence, a distrusted template (and no minimum count at
 *      all), a rule not built, a smoke game that breaks.
 *   5. The next sentences to teach: one-gap cards counted by the sentence they lack.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCardScripts, loadCardScenarios, loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {identityOf, oracleHash, checkFidelity, smokeTest} from "../game/engine/cards/compile.mjs";
import {createLibrary} from "../game/engine/cards/sentences.mjs";
import {calibrate} from "../game/tools/sentence-library.mjs";
import {compileAll, compileCard, candidatesFile, nextSentences, summaryOf, deckCard, CANDIDATES_SCHEMA} from "../game/tools/card-compiler.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const file = JSON.parse(readFileSync(new URL("../data/engine/candidates.json", import.meta.url), "utf8"));
const oracle = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8"));
const banned = new Set(JSON.parse(readFileSync(new URL("../data/commander-banned.json", import.meta.url), "utf8")).cards);
const byName = new Map(oracle.cards.map((c) => [c.name, c]));
const AGAIN = "run `node game/tools/card-compiler.mjs --write` again";
const scriptOf = (c) => ({schema: "CrankCardScript@1", identity: identityOf(byName.get(c.name)), oracleText: byName.get(c.name).text ?? "",
  source: "compiler", abilities: c.abilities});

/* ---- 1. the file ---- */
const index = loadCardIndex();
{
  eq(file.schema, CANDIDATES_SCHEMA, "the candidates file's schema");
  eq(file.summary.candidate, file.cards.length, `${file.cards.length} candidates, as the summary says`);
  const s = file.summary;
  eq(s.candidate + s.refused + s.blocked + s.vetoed + s.unknown + s.structure, s.pool, "every undefined card counted once");
  ok(file.cards.length >= 2000, "two thousand or more candidates");
  const names = file.cards.map((c) => c.name);
  eq(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), "in name order");
  eq(new Set(names).size, names.length, "each once");
  eq(names.filter((n) => banned.has(n)), [], "none banned in Commander");
  eq(names.filter((n) => index.resolve(n)?.source === "hand"), [], `none the directory defines by hand (if one is now, ${AGAIN})`);
  eq(file.cards.filter((c) => !byName.has(c.name) || oracleHash(byName.get(c.name)) !== c.oracleHash).map((c) => c.name), [],
    `each written for its oracle text as it stands (if the oracle data changed, ${AGAIN})`);
  ok(file.cards.every((c) => c.templates.length && c.confidence && c.confidence.fewestCards >= file.library.minimumCount && c.confidence.bandRate >= 0.99),
    "each names its templates, and its weakest template's band passed 99% or more from the minimum count up");
}

/* ---- 2. every candidate compiles and is its text; a sample plays ---- */
{
  const broken = [], unfaithful = [];
  for (const c of file.cards) {
    const script = scriptOf(c);
    if (compileScript(script).problems.length) broken.push(c.name);
    if (!checkFidelity(script).ok) unfaithful.push(c.name);
  }
  eq(broken, [], `all ${file.cards.length} compile with nothing the engine lacks`);
  eq(unfaithful, [], "and every ability is a sentence of the card, every sentence claimed");
  const sample = file.cards.filter((_, i) => i % 97 === 0);
  const failed = sample.filter((c) => !smokeTest(scriptOf(c), index.definition).ok).map((c) => c.name);
  eq(failed, [], `${sample.length} of them, one in 97, play their smoke game`);
}

/* ---- 3. reproducible, over a slice ---- */
const scripts = loadCardScripts().map((f) => f.script);
const library = createLibrary(scripts);
const calibration = calibrate({scripts, library, scenarios: new Map(loadCardScenarios().map((f) => [f.scenarios.card, f.scenarios])),
  definition: index.definition});
{
  const some = file.cards.filter((_, i) => i % 40 === 0).map((c) => byName.get(c.name));
  const bannedRecords = oracle.cards.filter((c) => banned.has(c.name) && deckCard(c)).slice(0, 10);
  const defined = oracle.cards.filter((c) => index.resolve(c.name)?.source === "hand").slice(0, 10);
  const twoFaced = oracle.cards.filter((c) => c.layout !== "normal" && deckCard(c) && !index.resolve(c.name) && !banned.has(c.name)).slice(0, 5);
  const tokens = oracle.cards.filter((c) => /^Token/.test(c.type || "")).slice(0, 3);
  const slice = {...oracle, cards: [...some, ...bannedRecords, ...defined, ...twoFaced, ...tokens]};
  const run = compileAll({oracle: slice, banned: [...banned], scripts, index, calibration});
  const got = new Map(run.results.map((r) => [r.name, r]));
  eq(some.map((c) => got.get(c.name)?.status), some.map(() => "candidate"), `the ${some.length} sampled candidates are candidates again`);
  eq(some.map((c) => JSON.stringify(got.get(c.name).abilities)), some.map((c) => JSON.stringify(file.cards.find((x) => x.name === c.name).abilities)),
    "with the same abilities, byte for byte");
  eq([...bannedRecords, ...defined, ...tokens].filter((c) => got.has(c.name)).map((c) => c.name), [], "the banned, the defined and the tokens are not in the pool");
  ok(twoFaced.length > 0 && twoFaced.every((c) => got.get(c.name)?.status === "structure"), "another layout is set aside as structure");
  const fromSlice = candidatesFile(run);
  eq([fromSlice.schema, fromSlice.cards.length], [CANDIDATES_SCHEMA, some.length], "and the file built from the slice holds just those");
}

/* ---- 4. each status from its cause ---- */
const trustAll = (cards = 99) => () => ({ok: true, cards, band: {band: "50+", rate: 1, low: 0.99}});
const recordLike = (name, text, extra = {}) => ({id: `test-${name}`, name, mana: "{1}{G}", type: "Creature — Bear", text, power: "2", toughness: "2",
  ci: ["G"], colors: ["G"], layout: "normal", faces: "None", ...extra});
{
  const definition = index.definition;
  eq(compileCard(recordLike("Test Bear", "Trample"), {library, trust: trustAll(), definition}).status, "candidate", "a vanilla-plus bear is a candidate");
  eq(compileCard(recordLike("Test Bear", "Trample", {layout: "transform"}), {library, trust: trustAll(), definition}).status, "structure",
    "a transforming card is structure");
  const unknown = compileCard(recordLike("Test Bear", "Trample\nWhen this creature enters, every player shouts its name."), {library, trust: trustAll(), definition});
  eq([unknown.status, unknown.gaps], ["unknown", ["When this creature enters, every player shouts its name."]], "a sentence nobody writes is unknown, and named");
  const distrust = () => ({ok: false, why: "failed 1 of 1 in calibration", cards: 1});
  eq(compileCard(recordLike("Test Bear", "Trample"), {library, trust: distrust, definition}).status, "vetoed", "a distrusted template vetoes the card");
  const kavu = compileCard(byName.get("Chomping Kavu"), {library, trust: trustAll(), definition});
  eq(kavu.status, "blocked", "Chomping Kavu needs Backup's granted abilities, which the engine has not built: blocked");
  const noLands = () => { throw new Error("no lands today"); };
  const refused = compileCard(recordLike("Test Bear", "Trample"), {library, trust: trustAll(), definition: noLands});
  ok(refused.status === "refused" && /^smoke: /.test(refused.why[0]), `a smoke game that breaks refuses the card: "${refused.why[0]}"`);
  const none = compileAll({oracle: {...oracle, cards: [byName.get(file.cards[0].name)]}, banned: [...banned], scripts, index,
    calibration: {...calibration, minimumCount: null}});
  eq(none.results.map((r) => r.status), ["vetoed"], "with no minimum count, nothing is trusted");
  /* The oracle data leaves banned cards and tokens out already; the compiler keeps them out if it ever carries them. */
  const bannedName = [...banned][0];
  const guarded = compileAll({oracle: {...oracle, cards: [recordLike(bannedName, "Trample"), recordLike("Test Token", "Trample", {type: "Token Creature — Bear"}),
    recordLike("Test Bear", "Trample")]}, banned: [...banned], scripts, index, calibration});
  eq(guarded.results.map((r) => [r.name, r.status]), [["Test Bear", "candidate"]], `a card banned in Commander (${bannedName}) and a token stay out of the pool`);
  const veteran = compileAll({oracle: {...oracle, cards: [byName.get("Black Knight")]}, banned: [...banned], scripts, index, calibration});
  ok(veteran.results[0].status === "vetoed" && /failed \d+ of \d+ in calibration/.test(veteran.results[0].why[0]),
    "a template that failed in calibration (Goblin Piledriver's \"protection from COLOR\") vetoes Black Knight");
}

/* ---- 5. the next sentences ---- */
{
  const results = [
    {status: "unknown", gaps: ["Draw a card."]}, {status: "unknown", gaps: ["Draw a card."]}, {status: "unknown", gaps: ["Scry 1."]},
    {status: "unknown", gaps: ["Scry 1.", "Draw a card."]}, {status: "candidate"},
  ];
  eq(nextSentences(results), [{sentence: "Draw a card.", cards: 2}, {sentence: "Scry 1.", cards: 1}], "one-gap cards, counted by the sentence they lack");
  eq(summaryOf(results).oneSentenceShort, 3, "and counted as one sentence short");
}

console.log(`card-compiler: ${checks} checks passed — ${file.cards.length} candidates, each compiled, its oracle text, its weakest template calibrated; reproducible over a slice; every status from its cause.`);
