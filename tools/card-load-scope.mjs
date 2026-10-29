/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Rob's October 28 cutoff: the smallest most-played set covering 95% of deck appearances.
   This freezes scope, not verification credit. Existing final cards keep their full checks.
   node tools/card-load-scope.mjs --write | --check | --gate
   --gate also requires every included, non-exempt name to be a playable final definition. */
import {readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {topCards} from "../game/tools/engine-top-cards.mjs";
import {deckCard} from "../game/tools/card-compiler.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCOPE_FILE = "docs/engine/card-load-100-2026-10-28/scope-95.json";
const WISHES = new Set(["Cunning Wish", "Extrapolate the Impossible"]);

export function loadScope({graph, played, oracle, banned, hashes = {}}) {
  const ranked = topCards({graph, played, share: 0.95});
  if (!(ranked.total > 0) || !ranked.cards.length) throw new Error("No measured appearances for load scope");
  const byId = new Map(oracle.cards.map((c) => [c.id, c]));
  const byName = new Map(oracle.cards.map((c) => [c.name, c]));
  const names = new Set();
  let covered = 0;
  const cards = ranked.cards.map((row) => {
    const card = byId.get(row.oracleId) ?? byName.get(row.name);
    if (!card) throw new Error(`Scope card missing from Oracle: ${row.name}`);
    if (banned.has(card.name) || (!deckCard(card) && !/^Basic Land\b/.test(card.type)))
      throw new Error(`Scope card is outside the legal deck universe: ${card.name}`);
    if (names.has(card.name)) throw new Error(`Duplicate scope identity: ${card.name}`);
    names.add(card.name);
    covered += row.appearances;
    return {...row, name: card.name, ...(WISHES.has(card.name) ? {exempt: "ROB-198: illegal in Play until wishboard support"} : {})};
  });
  if (covered < ranked.total * 0.95 || covered - cards.at(-1).appearances >= ranked.total * 0.95)
    throw new Error("Scope must stop at the first card reaching 95% of appearances");
  return {schema: "CrankCardLoadScope@1", generator: "tools/card-load-scope.mjs", share: 0.95,
    basis: "Cumulative Commander deck appearances, most-played first; not 95% of distinct names",
    sources: {graphGeneratedAt: graph.generatedAt ?? null, playedGeneratedAt: played.generatedAt ?? null,
      oracleGeneratedAt: oracle.generatedAt ?? null, sha256: hashes},
    appearances: ranked.total, coveredAppearances: covered, decks: ranked.decks, count: cards.length,
    gates: "G-1 through G-8 apply without reduced accuracy or evidence requirements; least-played remaining appearances are outside the loading target",
    cards};
}

export function scopeStatus(scope, definition, table = definition) {
  const required = scope.cards.filter((c) => !c.exempt);
  const missing = required.filter((c) => !definition(c.name) || !table(c.name)).map((c) => c.name);
  return {included: scope.cards.length, required: required.length, exempt: scope.cards.length - required.length,
    final: required.length - missing.length, missing};
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.length > 1 || flags.some((a) => !["--write", "--check", "--gate"].includes(a)))
    throw new Error("Use at most one of --write, --check, or --gate");
  const hashes = {};
  const read = (rel) => {
    const raw = readFileSync(path.join(ROOT, rel));
    hashes[rel] = createHash("sha256").update(raw).digest("hex");
    return JSON.parse(raw);
  };
  const graph = read("data/graph.json"), played = read("data/graph-played.json"), oracle = read("data/engine/oracle.json");
  const banned = new Set(read("data/commander-banned.json").cards);
  const scope = loadScope({graph, played, oracle, banned, hashes});
  const {cards, ...head} = scope;
  const text = JSON.stringify(head, null, 2).replace(/\n}$/, ',\n  "cards": [\n')
    + cards.map((c) => "    " + JSON.stringify(c)).join(",\n") + "\n  ]\n}\n";
  const output = path.join(ROOT, SCOPE_FILE);
  if (process.argv.includes("--write")) writeFileSync(output, text);
  if (process.argv.includes("--check") || process.argv.includes("--gate")) {
    if (readFileSync(output, "utf8") !== text) throw new Error("Scope differs from its frozen sources; review the changed ranking before rewriting it");
  }
  const {loadCardIndex} = await import("../game/tools/engine-cards.mjs");
  const {tableDefinition} = await import("../game/engine/cards/definitions.mjs");
  const index = loadCardIndex();
  const status = scopeStatus(scope, (name) => index.resolve(name)?.playable === true, (name) => Boolean(tableDefinition(name)));
  console.log(`card-load-scope: ${status.included} names cover ${scope.coveredAppearances}/${scope.appearances} appearances; ${status.final}/${status.required} final, ${status.exempt} exempt, ${status.missing.length} undefined`);
  if (process.argv.includes("--gate") && status.missing.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
