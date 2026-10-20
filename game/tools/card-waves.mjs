/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVES REVIEW THE CANDIDATES, DEMAND FIRST (card load step 6; Linear ROB-92; docs/engine/plan-card-load-program.md).
 *
 * The card compiler's candidates (data/engine/candidates.json) play at playtest tables, labeled; a wave reviews them and
 * promotes the right ones into the card directory, where they are final cards and teach the sentence library more.
 * This tool makes the review cheap and the promotion mechanical:
 *
 *   --review   ranks the candidates (the most-wanted first: a demand file, as `game/tools/card-demand.mjs --out` writes
 *              from staging's `card_demand`, then the best evidenced), plays each one's smoke game, and writes a review sheet: the oracle text beside
 *              every ability, the templates each came from and the cards that taught them, and what the game showed --
 *              each seat's life and every card in each zone, after the card was cast and each ability used. That last
 *              part is a drafted scenario: approved, it is the card's own, held by tests/engine-cards.mjs ever after.
 *   --promote  writes the approved candidates into the directory, each with its drafted scenario, `source: "hand"` now
 *              that a reviewer has read it. Then regenerate what is built from the directory (the command says what).
 *
 * Nothing here calls a model or the network. A reviewer is a person or a wave's session; the optional second opinion is
 * the backstop's read-back (game/tools/engine-compile.mjs), asked for separately.
 *
 *   node game/tools/card-waves.mjs --review [--demand demand.json] [--cards "A,B"] [--top 25] [--out docs/engine/waves/<date>.md]
 *   node game/tools/card-waves.mjs --promote "A,B"
 */

import {readFileSync, writeFileSync, mkdirSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {smokeScenario} from "../engine/cards/compile.mjs";
import {compileScript} from "../engine/cards/index.mjs";
import {runScenario} from "../engine/cards/scenario.mjs";
import {projectFor} from "../engine/projection.mjs";
import {createLibrary} from "../engine/cards/sentences.mjs";
import {loadCardScripts, loadCardIndex, CARDS_DIR} from "./engine-cards.mjs";
import {CANDIDATES_FILE, scriptOf} from "./card-compiler.mjs";

const ORACLE_FILE = path.join(path.dirname(CANDIDATES_FILE), "oracle.json");
const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const ZONES = [["hand", "Hand"], ["battlefield", "Battlefield"], ["graveyard", "Graveyard"], ["exile", "Exile"]];

/** The candidates in the order a wave takes them: the most-wanted first, then the best evidenced, then by name. */
export function rankCandidates(cards, demand = []) {
  /* A demand row as card-demand.mjs writes it ({name, demand: {decks, asked}}) or ranks it ({name, decks, asked}). */
  const wanted = new Map(demand.map((d) => [d.name, {decks: d.demand?.decks ?? d.decks ?? 0, asked: d.demand?.asked ?? d.asked ?? 0}]));
  const of = (c) => wanted.get(c.name) ?? {decks: 0, asked: 0};
  return [...cards].sort((a, b) => of(b).decks - of(a).decks || of(b).asked - of(a).asked
    || b.confidence.fewestCards - a.confidence.fewestCards || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((c) => ({...c, demand: of(c).decks}));
}

/**
 * A candidate's drafted scenario: its smoke game, with what the game showed as the expectations -- each seat's life and
 * the cards in each zone it can see, as that seat sees them. Null when the smoke game does not play.
 */
export function draftScenarios(script, definition) {
  const name = script.identity.name;
  const {definition: own, problems} = compileScript(script);
  if (problems.length) return null;
  const {fixtures, scenario} = smokeScenario(script);
  const cards = (n) => (n === name ? structuredClone(own) : fixtures[n] ? structuredClone(fixtures[n]) : definition(n));
  let state;
  try { ({state} = runScenario(scenario, cards, fixtures)); } catch { return null; }
  const expect = [];
  for (const seat of [0, 1]) {
    const view = projectFor(state, seat);
    expect.push({seat, life: view.players[seat].life});
    for (const [zone, key] of ZONES) expect.push({seat, zone, cards: view.players[seat].zones[key].cards.map((c) => c.name).sort()});
  }
  /* And its keywords, where it stands on its controller's battlefield. */
  const standing = projectFor(state, 0).players[0].zones.Battlefield.cards.find((c) => c.name === name);
  if (standing?.keywords.length) expect.push({seat: 0, keywords: {card: name, has: [...standing.keywords]}});
  const used = Object.fromEntries(Object.entries(fixtures).filter(([n]) => JSON.stringify(scenario).includes(JSON.stringify(n))));
  const drafted = {...scenario, name: `${name} cast, and each ability used once (drafted by game/tools/card-waves.mjs, approved in review)`, expect};
  return {schema: "CrankCardScenarios@1", card: name, fixtures: used, scenarios: [drafted]};
}

/** A reviewer's page for one candidate. */
function entryMarkdown(e) {
  const lines = [`## ${e.name}${e.demand ? ` (in ${e.demand} deck${e.demand === 1 ? "" : "s"} the table could not seat)` : ""}`, "",
    `**Oracle text:** ${String(e.record.text ?? "").replace(/\n/g, " / ")}`, "",
    `**Weakest template:** seen on ${e.confidence.fewestCards} card(s), band ${e.confidence.band} (${(100 * e.confidence.bandRate).toFixed(1)}% in calibration).`, "",
    `**Templates, and cards that taught them:** ${e.taught.join("; ")}`, "",
    "| Sentence | Ability |", "| --- | --- |"];
  for (const {text, ...rest} of e.abilities) lines.push(`| ${String(text).replace(/\|/g, "\\|")} | \`${JSON.stringify(rest).replace(/\|/g, "\\|")}\` |`);
  lines.push("", e.draft ? "**What the game showed** (the drafted scenario's expectations):" : "**The smoke game did not play: not promotable as drafted.**", "");
  if (e.draft) for (const x of e.draft.scenarios[0].expect) {
    lines.push(x.life !== undefined ? `- seat ${x.seat} at ${x.life} life` : x.keywords ? `- ${x.keywords.card} has ${x.keywords.has.join(", ")}` : `- seat ${x.seat} ${x.zone}: ${x.cards.join(", ") || "empty"}`);
  }
  return lines.join("\n");
}

/** The review sheet for a wave: every entry, and how to promote the ones approved. */
export function reviewSheet(entries, {date}) {
  return [`# Candidate review, ${date} (card load step 6)`,
    `${entries.length} candidates, the most-wanted first. For each: is every ability its sentence, and is what the game showed what the card does? `
    + "Promote the approved ones with `node game/tools/card-waves.mjs --promote \"A,B\"`.",
    ...entries.map(entryMarkdown)].join("\n\n") + "\n";
}

/** The wave's entries: each candidate put back together, its templates' teachers, and its drafted scenario. */
export function waveEntries(ranked, {oracle, library, definition}) {
  const byName = new Map(oracle.cards.map((c) => [c.name, c]));
  return ranked.filter((c) => byName.has(c.name)).map((c) => {
    const record = byName.get(c.name), script = scriptOf(c, record);
    const teachers = (id) => [...new Set((library.templates.get(id)?.examples ?? []).map((x) => x.card))].slice(0, 3).join(", ");
    const taught = c.templates.map((id) => `\`${id}\` (${teachers(id)})`);
    return {...c, record, script, taught, draft: draftScenarios(script, definition)};
  });
}

/** A card's file name in the directory: its name in lower case, accents and apostrophes dropped, anything else a hyphen. */
export const slugOf = (name) => String(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const letterOf = (slug) => (slug.match(/[a-z]/) ?? ["z"])[0];

/** Promote approved entries: each written into the directory with its drafted scenario. Returns the files written. */
export function promote(entries, {root = CARDS_DIR, write = (file, text) => { mkdirSync(path.dirname(file), {recursive: true}); writeFileSync(file, text); }} = {}) {
  const files = [];
  for (const e of entries) {
    if (!e.draft) throw new Error(`${e.name}: its smoke game did not play, so it has no drafted scenario to promote with`);
    const slug = slugOf(e.name), dir = path.join(root, letterOf(slug));
    const card = path.join(dir, `${slug}.json`), scenarios = path.join(dir, `${slug}.scenarios.json`);
    if (existsSync(card)) throw new Error(`${e.name}: ${path.relative(root, card)} already exists`);
    write(card, JSON.stringify({...e.script, source: "hand"}, null, 2) + "\n");
    write(scenarios, JSON.stringify(e.draft, null, 2) + "\n");
    files.push(card, scenarios);
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1] ?? ""; };
  const file = read(CANDIDATES_FILE), oracle = read(ORACLE_FILE);
  const scripts = loadCardScripts().map((f) => f.script), library = createLibrary(scripts), {definition} = loadCardIndex();
  const named = (list) => list.split(",").map((s) => s.trim()).filter(Boolean);
  if (flag("--promote") !== null) {
    const want = new Set(named(flag("--promote")));
    const entries = waveEntries(file.cards.filter((c) => want.has(c.name)), {oracle, library, definition});
    const missing = [...want].filter((n) => !entries.some((e) => e.name === n));
    if (missing.length) { console.error(`card-waves: not candidates: ${missing.join(", ")}`); process.exit(1); }
    const files = promote(entries);
    console.log(`card-waves: promoted ${entries.length} card(s), ${files.length} files. Now regenerate what is built from the directory:`);
    console.log("  node game/tools/engine-definitions.mjs --write && node game/tools/card-compiler.mjs --write && node game/tools/engine-candidates.mjs --write");
  } else if (args.includes("--review")) {
    const demand = flag("--demand") !== null ? read(flag("--demand")) : [];
    const pool = flag("--cards") !== null ? file.cards.filter((c) => named(flag("--cards")).includes(c.name)) : file.cards;
    const entries = waveEntries(rankCandidates(pool, Array.isArray(demand) ? demand : demand.cards ?? []).slice(0, Number(flag("--top") ?? 25)), {oracle, library, definition});
    const date = new Date().toISOString().slice(0, 10), out = flag("--out");
    const sheet = reviewSheet(entries, {date});
    if (out) { mkdirSync(path.dirname(out), {recursive: true}); writeFileSync(out, sheet); console.log(`card-waves: wrote ${out} (${entries.length} candidates, ${entries.filter((e) => e.draft).length} with a drafted scenario)`); }
    else process.stdout.write(sheet);
  } else {
    console.log("card-waves: --review [--demand file] [--cards \"A,B\"] [--top 25] [--out file], or --promote \"A,B\"");
  }
}
