#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* REASONABLENESS, MEASURED (Linear ROB-112). For a fixed set of criteria, the deck the app builds from them
 * (deck-criteria.js) against reference decks for the same commander: what EDHREC says people play (the top ninety-nine
 * by inclusion, tests/fixtures/edhrec-reference.json, dated), the precons that ship with that commander or in its
 * colors (data/precons.json), and Rob's own deck when he has one (data/live-state.json). Four distances per pair:
 *
 *   composition   the role counts (deck-composition.js) as a distance: the sum over roles of |generated - reference|,
 *                 divided by the number of roles; lands counted beside them
 *   overlap       the share of the reference's nonland cards the generated deck also carries, and the share of the
 *                 generated deck's nonland cards EDHREC lists for the commander at all (its "played" rate)
 *   score         the simulator's score for both (deck-measure.js), on one protocol, with its standard error
 *   cost          the recorded price of each hundred
 *
 * A generator is reasonable when its decks sit near the references on these four, and the report says how near,
 * per criteria set, with the date of every input. The suite (tests/reasonableness.mjs) holds a tolerance on the cached
 * data; a deliberately worse generator moves the distance past it and fails. docs/program/reports/ keeps the dated
 * reports, one per generator version, so a change to the builder is measured, not asserted.
 *
 *   node tools/sim/reasonableness.mjs --write          # measure on the published protocol and write the report
 *   node tools/sim/reasonableness.mjs                   # measure on the quick protocol and print the summary
 *
 * The references are what they are: EDHREC's top ninety-nine is a popularity list, not a tuned deck; a precon is a
 * product; Rob's deck is one person's. "Near the references" is a sanity check on the builder, not a judgment of any
 * deck, and the report says so.
 */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {catalogRows} from "../../tests/helpers/catalog-rows.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim().toLowerCase();
const round = (x, places = 2) => Math.round(Number(x || 0) * 10 ** places) / 10 ** places;

export const VERSION = "2026-10-18";          // the generator version this report describes; moves with deck-criteria.js
export const QUICK = {seedCount: 3, games: 2000, protocol: "refine-lite"};
export const PUBLISHED = {seedCount: 6, games: 20000, protocol: "published"};

/* The modules, loaded the way the suites load them. */
function modules() {
  const Criteria = require(path.join(ROOT, "deck-criteria.js"));
  const Composition = require(path.join(ROOT, "deck-composition.js"));
  const Measure = require(path.join(ROOT, "deck-measure.js"));
  const S = require(path.join(ROOT, "crankmagic-strategies.js"));
  const Classify = require(path.join(ROOT, "card-classify.js"));
  const sandbox = {CrankRules: require(path.join(ROOT, "crankmagic-rules.js")), CrankLoops: require(path.join(ROOT, "crankmagic-loops.js")), CrankStrategies: S};
  new Function("globalThis", "window", readFileSync(path.join(ROOT, "crankmagic-graph.js"), "utf8"))(sandbox, sandbox);
  const T = require(path.join(ROOT, "crankmagic-trace.js"));
  return {Criteria, Composition, Measure, S, Classify, relate: sandbox.CrankGraph.relate, T};
}

/** The references for one commander: EDHREC's top ninety-nine, the precons, Rob's deck. Each as rows of the catalog. */
export function referencesFor(commanderName, identity, {edhrec, precons, live, rowByName}) {
  const out = [];
  const rowsOf = (names) => names.map((n) => rowByName.get(fold(n))).filter(Boolean);
  const e = edhrec.commanders[commanderName];
  if (e && e.top && e.top.length) out.push({kind: "edhrec", label: `EDHREC top 99 for ${commanderName} (${e.decks ? e.decks.toLocaleString("en-US") + " decks, " : ""}${String(edhrec.generatedAt).slice(0, 10)})`, cards: rowsOf(e.top), played: new Set(e.rows.map((r) => fold(r.name)))});
  const id = identity.slice().sort().join("");
  const same = precons.decks.filter((d) => d.commander.some((c) => c.name === commanderName));
  const inColors = same.length ? [] : precons.decks.filter((d) => [...new Set(d.commander.flatMap((c) => c.colorIdentity))].sort().join("") === id).slice(-2);
  for (const d of same.concat(inColors)) {
    const cards = [];
    for (const [name, q] of d.cards) { const r = rowByName.get(fold(name)); if (r) cards.push({...r, quantity: q}); }
    out.push({kind: "precon", label: `${d.name} (${d.code}${same.length ? "" : ", same colors"})`, cards});
  }
  const own = live.decks.filter((d) => !d.archived && d.commanders.some((cid) => live.cards[cid] && live.cards[cid].name === commanderName));
  for (const d of own) {
    const counts = new Map();
    for (const s of d.slots.filter((s) => s.purpose === "main")) { const n = live.cards[s.cardId].name; counts.set(n, (counts.get(n) || 0) + s.quantity); }
    const cards = [];
    for (const [name, q] of counts) { const r = rowByName.get(fold(name)); if (r && name !== commanderName) cards.push({...r, quantity: q}); }
    out.push({kind: "own", label: `Rob's ${d.name}`, cards});
  }
  return out;
}

const isLand = (c) => /\bLand\b/.test(c.typeLine || "");
const nonlandNames = (cards) => new Set(cards.filter((c) => !isLand(c)).map((c) => fold(c.name)));

/** Compare one generated hundred with one reference. */
export function distance(generated, reference, {Composition, S, Classify, targets, commanders, bracket, playStyle, edhrecPlayed}) {
  const opts = {bracket, playStyle, commanders, strategies: S, classify: Classify.classify, targets};
  const g = Composition.compose(generated, opts), r = Composition.compose(reference.cards, opts);
  const roles = Object.keys(g.roles);
  const byRole = {};
  let sum = 0;
  for (const role of roles) { const d = g.roles[role].count - (r.roles[role] ? r.roles[role].count : 0); byRole[role] = d; sum += Math.abs(d); }
  const lands = g.lands.count - r.lands.count;
  const gNames = nonlandNames(generated), rNames = nonlandNames(reference.cards);
  const shared = [...rNames].filter((n) => gNames.has(n)).length;
  const played = edhrecPlayed ? [...gNames].filter((n) => edhrecPlayed.has(n)).length / Math.max(1, gNames.size) : null;
  return {composition: round(sum / roles.length), byRole, lands, overlap: round(shared / Math.max(1, rNames.size), 3), shared, referenceSize: rNames.size, played: played === null ? null : round(played, 3)};
}

/** Build every criteria set, compare with its references, measure both. */
export async function compare(options = {}) {
  const protocol = options.protocol || QUICK;
  const m = modules();
  const {rows, owned} = await catalogRows();
  const rowByName = new Map(rows.map((r) => [fold(r.name), r]));
  const sets = read("tests/fixtures/criteria-sets.json").sets;
  const edhrec = read("tests/fixtures/edhrec-reference.json");
  const precons = read("data/precons.json");
  const live = read("data/live-state.json").payload.state;
  const config = read("sim/config.json"), opponents = read("sim/opponents.json");
  const targets = read("data/composition-targets.json");
  const seats = m.Measure.buildSeats(opponents, config.table);
  const measure = (cards, commander) => {
    const list = [{name: commander.name, quantity: 1, isCommander: true, card: commander}].concat(cards.map((c) => ({name: c.name, quantity: c.quantity || 1, isCommander: false, card: c})));
    const r = m.Measure.measure(m.Measure.hydrate(list), {config, seats, seedCount: protocol.seedCount, games: protocol.games});
    return {score: r.score, se: r.se, games: r.games};
  };
  const price = (cards) => round(cards.reduce((n, c) => n + (Number.isFinite(c.price) ? c.price * (c.quantity || 1) : 0), 0));
  const results = [];
  for (const set of sets) {
    const built = (options.build || m.Criteria.buildFromCriteria)(set.criteria, rows, set.library ? owned : null, {trace: m.T, relate: m.relate});
    if (!built.available) { results.push({id: set.id, error: built.error}); continue; }
    const commander = built.commander.card;
    const generated = built.cards.filter((c) => !c.isCommander).map((c) => ({...c.card, quantity: c.quantity}));
    const refs = referencesFor(commander.name, built.commander.identity, {edhrec, precons, live, rowByName});
    const edh = refs.find((r) => r.kind === "edhrec");
    const own = measure(generated, commander);
    const comparisons = refs.map((ref) => {
      const d = distance(generated, ref, {Composition: m.Composition, S: m.S, Classify: m.Classify, targets, commanders: [commander], bracket: set.criteria.bracket, playStyle: set.criteria.playstyle, edhrecPlayed: edh ? edh.played : null});
      const score = ref.cards.reduce((n, c) => n + (c.quantity || 1), 0) >= 90 ? measure(ref.cards, commander) : null;
      return {kind: ref.kind, label: ref.label, cards: ref.cards.reduce((n, c) => n + (c.quantity || 1), 0), ...d, score, cost: price(ref.cards)};
    });
    results.push({id: set.id, says: set.says, criteria: set.criteria, commander: commander.name, how: built.commander.how, generated: {cards: generated.reduce((n, c) => n + c.quantity, 0), score: own, cost: price(generated), spent: built.budget.spent, cap: built.budget.cap}, comparisons, ms: built.ms});
  }
  return {version: VERSION, at: new Date().toISOString(), protocol: protocol.protocol, inputs: {edhrec: edhrec.generatedAt, precons: precons.generatedAt, live: live.savedAt || live.updatedAt || null, criteria: "tests/fixtures/criteria-sets.json"}, results};
}

/** The markdown a reader opens. */
export function render(report) {
  const lines = [`# Reasonableness report, generator ${report.version}`, "", `*Measured ${report.at.slice(0, 16).replace("T", " ")} UTC on the ${report.protocol} protocol. Inputs: EDHREC reference ${String(report.inputs.edhrec).slice(0, 10)}, precons ${String(report.inputs.precons).slice(0, 10)}, Rob's library ${String(report.inputs.live || "").slice(0, 10) || "as committed"}. tools/sim/reasonableness.mjs; Linear ROB-112.*`, "",
    "A deck the app builds from criteria, beside what people play for the same commander (EDHREC's top ninety-nine by inclusion), the precons, and Rob's own deck where he has one. Composition is the mean absolute difference in role counts (deck-composition.js); overlap is the share of the reference's nonland cards the built deck carries; played is the share of the built deck's nonland cards EDHREC lists for the commander at all; the score is the simulator's, with its standard error, on one protocol for both. Near is good; identical would mean the builder copied, which it does not. EDHREC's list is popularity, not a deck; a precon is a product; Rob's deck is one person's. This is a sanity check on the builder, not a judgment of any deck.", ""];
  for (const r of report.results) {
    if (r.error) { lines.push(`## ${r.id}`, "", `Not built: ${r.error}`, ""); continue; }
    lines.push(`## ${r.id}: ${r.says}`, "", `Built: ${r.commander} (${r.how}), ${r.generated.cards} cards, score ${r.generated.score.score} ± ${r.generated.score.se}, ${r.generated.cost ? "$" + r.generated.cost.toFixed(2) : "no price"}${r.generated.cap ? ` (cap $${r.generated.cap})` : ""}, built in ${r.ms} ms.`, "",
      "| Reference | Cards | Composition distance | Overlap | Played | Score | Cost |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const c of r.comparisons) lines.push(`| ${c.label} | ${c.cards} | ${c.composition} (lands ${c.lands > 0 ? "+" : ""}${c.lands}) | ${Math.round(c.overlap * 100)}% (${c.shared} of ${c.referenceSize}) | ${c.played === null ? "–" : Math.round(c.played * 100) + "%"} | ${c.score ? `${c.score.score} ± ${c.score.se}` : "–"} | ${c.cost ? "$" + c.cost.toFixed(2) : "–"} |`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const write = process.argv.includes("--write");
  const report = await compare({protocol: write ? PUBLISHED : QUICK});
  for (const r of report.results) {
    if (r.error) { console.log(`${r.id}: ${r.error}`); continue; }
    console.log(`${r.id}: ${r.commander} (${r.how}) score ${r.generated.score.score} ± ${r.generated.score.se}, $${r.generated.cost}; ` + r.comparisons.map((c) => `${c.kind} comp ${c.composition} overlap ${Math.round(c.overlap * 100)}% played ${c.played === null ? "–" : Math.round(c.played * 100) + "%"} score ${c.score ? c.score.score : "–"}`).join(" | "));
  }
  if (write) {
    const dir = path.join(ROOT, "docs", "program", "reports");
    if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
    const base = path.join(dir, `reasonableness-${VERSION}`);
    writeFileSync(`${base}.json`, JSON.stringify(report, null, 1) + "\n");
    writeFileSync(`${base}.md`, render(report));
    console.log(`wrote ${path.relative(ROOT, base)}.md and .json`);
  }
}
