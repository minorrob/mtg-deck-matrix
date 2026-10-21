/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE SENTENCE LIBRARY'S CALIBRATION: EACH TEMPLATE'S MEASURED PASS RATE (card load step 2; Linear ROB-87;
 * docs/engine/plan-card-load-program.md, "What 99% confidence means").
 *
 * Every defined card is held out of the library in turn, translated from the other cards' templates alone
 * (game/engine/cards/sentences.mjs), compiled, held to its oracle text, and played through its own scenarios. A template's
 * pass rate is the share of the cards it translated that then passed every scenario. A failure counts against every
 * template the card used, so a rate is a floor. The pooled rate of the templates seen on k other cards is what says how
 * many cards a template must be seen on before a card it translates can be trusted at 99%: that is the minimum count.
 *
 * Deterministic: the same directory gives the same rates (no clock, no randomness; each scenario seeds itself by name).
 *
 *   node game/tools/sentence-library.mjs                       the summary
 *   node game/tools/sentence-library.mjs --report <dir> --date <yyyy-mm-dd>
 *                                                              also writes <dir>/sentence-calibration-<date>.{json,md}
 */
import {writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {loadCardScripts, loadCardScenarios, loadCardIndex} from "./engine-cards.mjs";
import {compileScript} from "../engine/cards/index.mjs";
import {runScenario} from "../engine/cards/scenario.mjs";
import {checkFidelity} from "../engine/cards/compile.mjs";
import {createLibrary, translate, templateWithout, isSimple} from "../engine/cards/sentences.mjs";

export const CALIBRATION_SCHEMA = "CrankSentenceCalibration@1";
/* How many other cards wrote a template, in the bands the pooled rates are read in. */
export const BANDS = Object.freeze([[1, 1], [2, 4], [5, 9], [10, 19], [20, 49], [50, Infinity]]);
const bandOf = (k) => BANDS.find(([a, b]) => k >= a && k <= b);
const bandName = ([a, b]) => (a === b ? `${a}` : b === Infinity ? `${a}+` : `${a}-${b}`);

/** The lower end of the 95% Wilson interval for `passed` of `tried`: what a rate can be trusted to be at least. */
export function wilsonLow(passed, tried, z = 1.96) {
  if (!tried) return 0;
  const p = passed / tried, d = 1 + z * z / tried;
  return Math.max(0, (p + z * z / (2 * tried) - z * Math.sqrt(p * (1 - p) / tried + z * z / (4 * tried * tried))) / d);
}

/**
 * The minimum count, from the pooled bands (one per `BANDS`, in order): the smallest k from which every band up passed at
 * least 99%, and the templates seen on k or more other cards, together, have a 95% lower bound of at least 99%. A rate
 * measured on few uses cannot set it.
 *
 * @param {{tried: number, passed: number, rate: ?number}[]} pooled
 * @returns {{atLeast: {from, tried, passed, rate, low}[], minimumCount: ?number}}
 */
export function minimumCountOf(pooled) {
  /* Every band from each one up, together: the templates seen on k or more other cards. */
  const atLeast = BANDS.map(([k], i) => {
    const from = pooled.slice(i), tried = from.reduce((n, b) => n + b.tried, 0), passed = from.reduce((n, b) => n + b.passed, 0);
    return {from: k, tried, passed, rate: tried ? passed / tried : null, low: wilsonLow(passed, tried)};
  });
  let minimumCount = null;
  for (let i = pooled.length - 1; i >= 0; i--) {
    if (!pooled[i].tried) continue;
    if (pooled[i].rate < 0.99) break;
    if (atLeast[i].low >= 0.99) minimumCount = BANDS[i][0];
  }
  return {atLeast, minimumCount};
}

/**
 * One card held out, translated and played.
 *
 * @returns {{card, status: "passed"|"failed"|"unknown"|"structure", why?, templates?: {id, cards}[], gaps?}}
 */
export function calibrateCard(script, {library, scenarios, definition}) {
  const card = script.identity.name;
  if (!isSimple(script)) return {card, status: "structure"};
  const tr = translate(script, library, {except: card});
  if (!tr.ok) return {card, status: "unknown", gaps: tr.gaps};
  const templates = tr.templates.map((id) => ({id, cards: templateWithout(library, id, card).cards}));
  const fail = (why) => ({card, status: "failed", why, templates});
  const {definition: own, problems} = compileScript(tr.script);
  if (problems?.length) return fail(`compiles: ${problems[0]}`);
  const fidelity = checkFidelity(tr.script);
  if (!fidelity.ok) return fail(`fidelity: ${[...fidelity.invented, ...fidelity.unclaimed][0]}`);
  const file = scenarios.get(card);
  if (!file?.scenarios?.length) return fail("no scenarios to play");
  const cards = (name) => (name === card ? structuredClone(own) : definition(name));
  try { for (const scenario of file.scenarios) runScenario(scenario, cards, file.fixtures ?? {}); }
  catch (error) { return fail(`plays: ${String(error.message).split("\n")[0]}`); }
  return {card, status: "passed", templates};
}

/**
 * The whole calibration.
 *
 * @param {{scripts?, scenarios?, definition?, library?, only?: string[]}} [given]  the directory's by default; `only`
 *   names the cards to hold out (all of them by default)
 */
export function calibrate(given = {}) {
  const scripts = given.scripts ?? loadCardScripts().map((f) => f.script);
  const scenarios = given.scenarios ?? new Map(loadCardScenarios().map((f) => [f.scenarios.card, f.scenarios]));
  const definition = given.definition ?? loadCardIndex().definition;
  const library = given.library ?? createLibrary(scripts);
  const only = given.only ? new Set(given.only) : null;
  const results = [];
  for (const script of [...scripts].sort((a, b) => (a.identity.name < b.identity.name ? -1 : 1))) {
    if (only && !only.has(script.identity.name)) continue;
    results.push(calibrateCard(script, {library, scenarios, definition}));
  }
  const rates = new Map();
  const bands = new Map(BANDS.map((b) => [bandName(b), {band: bandName(b), templates: new Set(), tried: 0, passed: 0}]));
  for (const r of results) {
    if (!r.templates) continue;
    for (const t of r.templates) {
      const rate = rates.get(t.id) ?? {tried: 0, passed: 0};
      rate.tried += 1;
      if (r.status === "passed") rate.passed += 1;
      rates.set(t.id, rate);
      const band = bands.get(bandName(bandOf(t.cards)));
      band.templates.add(t.id);
      band.tried += 1;
      if (r.status === "passed") band.passed += 1;
    }
  }
  const count = (status) => results.filter((r) => r.status === status).length;
  const pooled = [...bands.values()].map((b) => ({band: b.band, templates: b.templates.size, tried: b.tried, passed: b.passed,
    rate: b.tried ? b.passed / b.tried : null, low: wilsonLow(b.passed, b.tried)}));
  const {atLeast, minimumCount} = minimumCountOf(pooled);
  const translated = results.filter((r) => r.status === "passed" || r.status === "failed").length;
  const cardLow = wilsonLow(results.filter((r) => r.status === "passed").length, translated);
  return {library, results, rates, pooled, atLeast, minimumCount,
    summary: {cards: results.length, structure: count("structure"), unknown: count("unknown"), translated,
      passed: count("passed"), failed: count("failed"), low: Number(cardLow.toFixed(4))}};
}

/** The report: every template with how many cards write it, and where it was tried, its rate. */
export function report(calibration, {date}) {
  const {library, results, rates, pooled, atLeast, minimumCount, summary} = calibration;
  const templates = [...library.templates.values()].map((t) => {
    const all = templateWithout(library, t.id);
    const rate = rates.get(t.id);
    return [t.id, all.cards, Number(all.agreement.toFixed(3)), rate?.tried ?? 0, rate?.passed ?? 0];
  }).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const round = (b) => ({...b, rate: b.rate === null ? null : Number(b.rate.toFixed(4)), low: Number(b.low.toFixed(4))});
  return {schema: CALIBRATION_SCHEMA, date, summary, minimumCount, pooled: pooled.map(round), atLeast: atLeast.map(round),
    failures: results.filter((r) => r.status === "failed").map((r) => ({card: r.card, why: r.why, templates: r.templates.map((t) => t.id)})),
    columns: ["template", "cards", "agreement", "tried", "passed"], templates};
}

const pct = (x) => (x === null ? "—" : `${(100 * x).toFixed(1)}%`);
export function reportMarkdown(r) {
  const s = r.summary;
  const lines = [
    `# The sentence library's calibration, ${r.date} (card load step 2; Linear ROB-87)`,
    "",
    "Generated by `node game/tools/sentence-library.mjs --report docs/engine --date " + r.date + "`; the method is in that file and in",
    "`game/engine/cards/sentences.mjs`. Every defined card held out of the library in turn, translated from the other cards'",
    "templates alone, compiled, held to its oracle text and played through its own scenarios.",
    "",
    "## What this measures, and what it does not",
    "",
    "- **Whether a template generalizes:** a card translated from the other cards' templates plays its own scenarios as its",
    "  hand-written definition does. It does not check the definitions themselves; their scenarios do (`tests/engine-cards.mjs`).",
    "- **Only the cards the library covers whole.** A card with any sentence no other card writes is not translated, so the",
    "  rate is for the cards a compiler built on this library would take, which are the simpler ones.",
    "- **A floor per template:** a card's failure counts against every template it used.",
    "- **Not yet out of sample:** the library's rules were refined against these same cards. The first wave's cards, each",
    "  translated before it is written, are the first independent measure.",
    "",
    "## The cards",
    "",
    "| Defined cards | Not templated (a second face or spell) | Not fully covered by the others' templates | Translated | Passed every scenario | Low | Failed |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${s.cards} | ${s.structure} | ${s.unknown} | ${s.translated} | ${s.passed} (${pct(s.translated ? s.passed / s.translated : null)}) | ${pct(s.low)} | ${s.failed} |`,
    "",
    "## Pooled pass rate by how many other cards wrote the template",
    "",
    "A card's failure counts against every template it used, so each rate is a floor. Low is the 95% Wilson lower bound.",
    "",
    "| Other cards | Templates tried | Uses | Passed | Rate | Low |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...r.pooled.map((b) => `| ${b.band} | ${b.templates} | ${b.tried} | ${b.passed} | ${pct(b.rate)} | ${pct(b.tried ? b.low : null)} |`),
    "",
    "And together, the templates seen on k or more other cards:",
    "",
    "| k or more | Uses | Passed | Rate | Low |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...r.atLeast.map((b) => `| ${b.from} | ${b.tried} | ${b.passed} | ${pct(b.rate)} | ${pct(b.tried ? b.low : null)} |`),
    "",
    `**The minimum count:** ${r.minimumCount === null ? "none yet: no k has every band from it at 99% and a 95% lower bound of 99% together" : `${r.minimumCount}: every band from ${r.minimumCount} other card${r.minimumCount === 1 ? "" : "s"} up passed 99% or more, and together their 95% lower bound is 99% or more`}.`,
    "",
    `## The failures (${r.failures.length})`,
    "",
    "| Card | Why | Templates |",
    "| --- | --- | --- |",
    ...r.failures.map((f) => `| ${f.card} | ${f.why.replace(/\|/g, "\\|").slice(0, 160)} | ${f.templates.map((t) => `\`${t.replace(/\|/g, "\\|")}\``).join("<br>")} |`),
    "",
    `## The templates (${r.templates.length})`,
    "",
    `Every template, with its rate where it was tried, is in \`sentence-calibration-${r.date}.json\` (\`columns\`, \`templates\`).`,
    "The twenty written by the most cards:",
    "",
    "| Template | Cards | Agreement | Tried | Passed |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...r.templates.slice(0, 20).map(([id, cards, agree, tried, passed]) => `| \`${id.replace(/\|/g, "\\|")}\` | ${cards} | ${pct(agree)} | ${tried} | ${passed} |`),
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (flag) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };
  const calibration = calibrate();
  const s = calibration.summary;
  console.log(`sentence-library: ${calibration.library.templates.size} templates from ${calibration.library.cards} cards; ` +
    `${s.translated} of ${s.cards} translated with themselves held out, ${s.passed} passed (${pct(s.translated ? s.passed / s.translated : null)}); ` +
    `minimum count ${calibration.minimumCount ?? "none"}`);
  for (const b of calibration.pooled) console.log(`  ${b.band.padEnd(6)} ${String(b.tried).padStart(5)} uses  ${pct(b.rate).padStart(6)}  low ${pct(b.tried ? b.low : null)}`);
  const dir = arg("--report");
  if (dir) {
    const date = arg("--date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("--report needs --date yyyy-mm-dd");
    const r = report(calibration, {date});
    writeFileSync(path.join(dir, `sentence-calibration-${date}.json`), JSON.stringify(r) + "\n");
    writeFileSync(path.join(dir, `sentence-calibration-${date}.md`), reportMarkdown(r));
    console.log(`  wrote ${path.join(dir, `sentence-calibration-${date}.{json,md}`)}`);
  }
}
