#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE SEVEN DECKS, READY TO PASTE (M8, Part 7's G-D). Each agent that plays staging signs in as an identity of its own
 * with an empty library (docs/playtest-harness.md), so it brings Rob's seven decks the way a person brings a list: New
 * deck, Upload or paste a decklist. These are those lists, written from the committed library (data/live-state.json):
 * every card of the seven is defined at the table, so a game with them tests the rules, not a basic-lands deck.
 *
 *   node tools/playtest-decks.mjs --write    write docs/uat/decks/<deck>.txt
 *   node tools/playtest-decks.mjs --check    fail if a list has drifted from the library, or the app's own paste
 *                                            reader (deck-import.js) does not read it back as its commander and 99
 */
import {readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {decksFromBackup} from "./fuzz-live.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "uat", "decks");
const require = createRequire(import.meta.url);

/** The seven decks' lists, by file name: the commander section, then the 99, one line per card name with its count. */
export function lists(backup) {
  const named = backup.payload.state.decks.filter((d) => /^deck:live:D[1-7]$/.test(d.id) && !d.archived).sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.name);
  return Object.fromEntries(decksFromBackup(backup, named).map((deck) => {
    const counts = new Map();
    for (const name of deck.cards) counts.set(name, (counts.get(name) || 0) + 1);
    const lines = ["Commander", ...deck.commander.map((n) => `1 ${n}`), "", "Deck", ...[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([n, k]) => `${k} ${n}`)];
    return [`${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.txt`, {deck, text: lines.join("\n") + "\n"}];
  }));
}

/** What is wrong with the lists on disk: drifted, missing, extra, or not read back by the app's paste reader. */
export function problems(backup, dir = OUT) {
  const want = lists(backup), found = [], {parseDecklist} = require("../deck-import.js");
  const have = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".txt")) : [];
  for (const f of have) if (!want[f]) found.push(`${f} is no deck of the seven`);
  for (const [f, {deck, text}] of Object.entries(want)) {
    const at = path.join(dir, f);
    if (!existsSync(at)) {found.push(`${f} is missing`); continue;}
    if (readFileSync(at, "utf8") !== text) found.push(`${f} has drifted from the library (node tools/playtest-decks.mjs --write)`);
    const read = parseDecklist(text), commander = read.commander, others = read.rows.filter((r) => r.section !== "commander").reduce((n, r) => n + r.quantity, 0);
    if (JSON.stringify(commander) !== JSON.stringify(deck.commander) || others !== deck.cards.length || commander.length + others !== 100)
      found.push(`${f}: the paste reader reads ${commander.join(" + ") || "no commander"} and ${others} cards, not ${deck.commander.join(" + ")} and ${deck.cards.length}`);
  }
  return found;
}

function main(argv) {
  const backup = JSON.parse(readFileSync(path.join(ROOT, "data", "live-state.json"), "utf8"));
  if (argv.includes("--write")) {
    mkdirSync(OUT, {recursive: true});
    for (const [f, {text}] of Object.entries(lists(backup))) writeFileSync(path.join(OUT, f), text);
  }
  const found = problems(backup);
  for (const p of found) console.log(`  problem: ${p}`);
  console.log(found.length ? `playtest-decks: ${found.length} problem${found.length === 1 ? "" : "s"}` : `playtest-decks: the seven decks' lists match the library and read back as each commander and its 99 (${path.relative(ROOT, OUT)})`);
  return found.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
