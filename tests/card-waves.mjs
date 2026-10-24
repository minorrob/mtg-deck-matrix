/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WAVES REVIEW THE CANDIDATES, DEMAND FIRST (card load step 6; Linear ROB-92; game/tools/card-waves.mjs).
 *
 *   1. The order: the most-wanted first (by decks, then times asked, either shape card-demand.mjs writes), then the best
 *      evidenced, then by name.
 *   2. The drafted scenario: a candidate's smoke game with what it showed as the expectations -- life, every zone each
 *      seat sees, its keywords -- which the card passes, and which a card that plays differently fails. No draft for a
 *      card whose smoke game breaks.
 *   3. The review sheet: the oracle text, every ability, the templates and the cards that taught them, what the game
 *      showed.
 *   4. Promotion: the card and its scenario written into a directory, `source: "hand"`, where it compiles and its scenario
 *      passes; never a card without a draft, never over a file that exists.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {rankCandidates, draftScenarios, reviewSheet, waveEntries, promote, slugOf} from "../game/tools/card-waves.mjs";
import {scriptOf, compileCard} from "../game/tools/card-compiler.mjs";
import {loadCardScripts, loadCardScenarios, loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createCardIndex} from "../game/engine/cards/index.mjs";
import {createLibrary} from "../game/engine/cards/sentences.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const file = JSON.parse(readFileSync(new URL("../data/engine/candidates.json", import.meta.url), "utf8"));
const oracle = JSON.parse(readFileSync(new URL("../data/engine/oracle.json", import.meta.url), "utf8"));
const byName = new Map(oracle.cards.map((c) => [c.name, c]));
const {definition} = loadCardIndex();
const library = createLibrary(loadCardScripts().map((f) => f.script));

/* ---- 1. the order ---- */
{
  const c = (name, fewestCards) => ({name, confidence: {fewestCards}});
  const cards = [c("Alpha", 5), c("Beta", 50), c("Gamma", 50), c("Delta", 60)];
  eq(rankCandidates(cards).map((x) => x.name), ["Delta", "Beta", "Gamma", "Alpha"], "with no demand: the best evidenced first, then by name");
  const ranked = rankCandidates(cards, [{name: "Delta", decks: 3, asked: 1}, {name: "Alpha", demand: {decks: 3, asked: 9}}, {name: "Gamma", decks: 1, asked: 40}]);
  eq(ranked.map((x) => [x.name, x.demand]), [["Alpha", 3], ["Delta", 3], ["Gamma", 1], ["Beta", 0]],
    "with demand: by decks, then times asked, from either shape card-demand.mjs writes; the unwanted after");
}

/* ---- 2. the drafted scenario ---- */
/* Candidates as the compiler makes them. The store drains as waves promote it (2,731 to 23 in the load of 2026-10-24), so
   when it holds no card of a kind, one is compiled here from a defined card of that kind, through the compiler's own
   compileCard with every template trusted: the same shape a stored candidate has. */
const trustAll = () => ({ok: true, cards: 99, band: {band: "50+", rate: 1, low: 0.99}});
const compiled = loadCardScripts().map((f) => f.script).filter((s) => byName.has(s.identity.name)).sort((a, b) => (a.identity.name < b.identity.name ? -1 : 1));
const pick = (test) => {
  const stored = file.cards.find((c) => byName.has(c.name) && test(c));
  if (stored) return stored;
  for (const s of compiled) {
    const c = compileCard(byName.get(s.identity.name), {library, trust: trustAll, definition});
    if (c.status === "candidate" && test(c)) return c;
  }
};
const flier = pick((c) => c.abilities.length === 1 && c.abilities[0].keyword === "flying" && /Creature/.test(byName.get(c.name).type));
const lifer = pick((c) => c.abilities.some((a) => a.kind === "triggered" && JSON.stringify(a.effects).includes("\"gainLife\"")) && /Creature/.test(byName.get(c.name).type));
{
  const draft = draftScenarios(scriptOf(flier, byName.get(flier.name)), definition);
  const expect = draft.scenarios[0].expect;
  eq([draft.schema, draft.card, draft.scenarios.length], ["CrankCardScenarios@1", flier.name, 1], `${flier.name}: one drafted scenario`);
  ok(expect.filter((x) => x.life !== undefined).length === 2 && expect.filter((x) => x.zone).length === 8, "its expectations: each seat's life and four zones each");
  ok(expect.some((x) => x.zone === "battlefield" && x.seat === 0 && x.cards.includes(flier.name)), "the card on its controller's battlefield");
  eq(expect.find((x) => x.keywords), {seat: 0, keywords: {card: flier.name, has: ["Flying"]}}, "with its keywords");
  const own = createCardIndex([{script: {...scriptOf(flier, byName.get(flier.name)), source: "hand"}}]).definition(flier.name);
  const cards = (n) => (n === flier.name ? structuredClone(own) : draft.fixtures[n] ?? definition(n));
  ok(runScenario(draft.scenarios[0], cards, draft.fixtures).passed.length >= 10, "the card passes its drafted scenario");
  const grounded = (n) => (n === flier.name ? {...structuredClone(own), keywords: []} : cards(n));
  assert.throws(() => runScenario(draft.scenarios[0], grounded, draft.fixtures), /lacks Flying/); checks += 1;
  const lifeDraft = draftScenarios(scriptOf(lifer, byName.get(lifer.name)), definition);
  ok(lifeDraft.scenarios[0].expect.some((x) => x.seat === 0 && x.life > 40), `${lifer.name}: its life gain is in what the game showed`);
  const lifeOwn = createCardIndex([{script: {...scriptOf(lifer, byName.get(lifer.name)), source: "hand"}}]).definition(lifer.name);
  const more = structuredClone(lifeOwn);
  more.abilities = JSON.parse(JSON.stringify(more.abilities).replace(/"amount":(\d+)/g, (_, n) => `"amount":${Number(n) + 2}`));
  assert.throws(() => runScenario(lifeDraft.scenarios[0], (n) => (n === lifer.name ? structuredClone(more) : lifeDraft.fixtures[n] ?? definition(n)), lifeDraft.fixtures), /life/);
  checks += 1;
  eq(draftScenarios(scriptOf(flier, byName.get(flier.name)), () => { throw new Error("no lands today"); }), null, "a card whose smoke game breaks has no draft");
}

/* ---- 3. the review sheet ---- */
const entries = waveEntries(rankCandidates([flier, lifer], [{name: lifer.name, decks: 2, asked: 2}]), {oracle, library, definition});
{
  const sheet = reviewSheet(entries, {date: "2026-10-19"});
  ok(sheet.indexOf(`## ${lifer.name} (in 2 decks the table could not seat)`) < sheet.indexOf(`## ${flier.name}`), "the most-wanted first, with its demand");
  ok(sheet.includes(String(byName.get(lifer.name).text).split("\n")[0]) && lifer.abilities.every((a) => sheet.includes(JSON.stringify(a.text).slice(1, -1).slice(0, 30))),
    "its oracle text and every ability's sentence");
  const teacher = library.templates.get(lifer.templates[0]).examples[0].card;
  ok(lifer.templates.every((id) => sheet.includes(`\`${id}\``)) && sheet.includes(`\`${lifer.templates[0]}\` (${teacher}`), `its templates, each with cards that taught it (${teacher})`);
  ok(sheet.includes("**What the game showed**") && sheet.includes(`${flier.name} has Flying`), "and what the game showed");
}

/* ---- 4. promotion ---- */
{
  const root = mkdtempSync(path.join(tmpdir(), "waves-"));
  try {
    const files = promote(entries, {root});
    /* Where each file landed, in "/" whatever the system's own separator (Windows reports "\"). */
    eq(files.map((f) => path.relative(root, f).split(path.sep).join("/")).sort(), entries.flatMap((e) => [`${slugOf(e.name)[0].match(/[a-z]/) ? slugOf(e.name).match(/[a-z]/)[0] : "z"}/${slugOf(e.name)}.json`,
      `${slugOf(e.name).match(/[a-z]/)[0]}/${slugOf(e.name)}.scenarios.json`]).sort(), "each card and its scenarios, under its letter");
    const scripts = loadCardScripts(root), index = createCardIndex(scripts);
    eq(scripts.map((s) => s.script.source), ["hand", "hand"], "written as hand-authored, now that a reviewer has read them");
    eq(entries.map((e) => index.resolve(e.name)?.playable), [true, true], "each compiles in a directory");
    const lookup = (n) => index.definition(n) ?? definition(n);
    for (const {scenarios: s} of loadCardScenarios(root)) runScenario(s.scenarios[0], (n) => s.fixtures[n] ?? lookup(n), s.fixtures);
    checks += 1;
    assert.throws(() => promote(entries.slice(0, 1), {root}), /already exists/); checks += 1;
    assert.throws(() => promote([{...entries[0], draft: null}], {root: path.join(root, "other")}), /no drafted scenario/); checks += 1;
  } finally { rmSync(root, {recursive: true, force: true}); }
  const directory = loadCardScripts().filter((f) => /^[a-z]\/[a-z0-9-]+\.json$/.test(f.path));
  const off = directory.filter((f) => !f.script.identity.name.includes(" // ") && f.path.split("/")[1] !== `${slugOf(f.script.identity.name)}.json`).map((f) => f.path);
  eq(off, [], `file names as all ${directory.length} of the directory's own: accents and apostrophes dropped, the rest hyphens (Dáin, Glóin, Óin)`);
}

console.log(`card-waves: ${checks} checks passed — candidates ranked demand first; each drafted scenario holds for the card and fails one that plays differently; a review sheet; promotion into the directory.`);
