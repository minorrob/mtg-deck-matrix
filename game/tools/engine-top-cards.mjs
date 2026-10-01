/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARDS MOST DECKS ARE MADE OF: THE ONES TO HAVE LOADED BEFORE ANY TABLE ASKS.
 *
 * Rob, 2026-10-01: "I want you to identify the cards used in 80% of decks; not special prints, just the standard
 * version of each card ... I want all of the 80% most frequently used cards to be pre-loaded so that very few will
 * actually need loading at Play time and few will need to use my AI API." Play does not require the print a player
 * owns -- it plays the card loaded -- so a card is its oracle identity here, never a print.
 *
 * WHAT "80% OF DECKS" IS MEASURED AS. `data/graph-played.json` holds EDHREC's co-play for every legal commander: for
 * each commander, each card its decks play, and in how many of them. Summed over every commander, that is how many
 * Commander decks each card appears in; each commander also appears in every deck it leads (its deck count, read off
 * its own rows as count over inclusion). The list is the smallest set of cards, most-played first, whose appearances
 * add up to 80% of all appearances: a deck drawn at random is, card for card, 80% made of them. Copies are not
 * counted -- a deck with thirty Islands counts Island once -- which is what "used in a deck" means.
 *
 * It writes `data/engine/top-cards.json`; `--check` re-derives it and changes nothing (tests/generators.mjs), and
 * `--share 0.9` measures another threshold without writing.
 *
 *   node game/tools/engine-top-cards.mjs            write data/engine/top-cards.json
 *   node game/tools/engine-top-cards.mjs --check    fail if the committed list is not what the data says now
 */

import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(REPO, "data", "engine", "top-cards.json");
export const SCHEMA = "CrankTopCards@1";
export const SHARE = 0.8;
/* Below this inclusion a commander's row is too thin to read its deck count from (count over inclusion). */
const DECK_COUNT_FLOOR = 0.05;

/**
 * The most-played cards that together make up `share` of every card appearance in Commander decks.
 *
 * @returns {{total: number, decks: number, cards: Array<{name, oracleId, appearances, cumulative, commander, land}>}}
 */
export function topCards({graph, played, share = SHARE}) {
  const cards = graph.cards;
  const appearances = new Map(), decksLed = new Map();
  for (const [commander, card, inclusion, , count] of played.played) {
    appearances.set(card, (appearances.get(card) ?? 0) + count);
    if (inclusion > DECK_COUNT_FLOOR) decksLed.set(commander, Math.max(decksLed.get(commander) ?? 0, count / inclusion));
  }
  let decks = 0;
  for (const [commander, led] of decksLed) {
    const n = Math.round(led);
    appearances.set(commander, (appearances.get(commander) ?? 0) + n);
    decks += n;
  }
  const total = [...appearances.values()].reduce((a, b) => a + b, 0);
  /* Most-played first; a tie broken by name, so the list is the same on every machine. */
  const ranked = [...appearances].sort((a, b) => b[1] - a[1] || cards[a[0]].name.localeCompare(cards[b[0]].name));
  const out = [];
  let running = 0;
  for (const [index, count] of ranked) {
    running += count;
    const card = cards[index];
    out.push({name: card.name, oracleId: card.id, appearances: count, cumulative: Number((running / total).toFixed(6)),
      ...(decksLed.has(index) ? {commander: true} : {}), ...(card.isLand ? {land: true} : {})});
    if (running >= share * total) break;
  }
  return {total, decks, cards: out};
}

function main(args) {
  const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? ""; };
  const share = flag("--share") === null ? SHARE : Number(flag("--share"));
  const graph = JSON.parse(readFileSync(path.join(REPO, "data", "graph.json"), "utf8"));
  const played = JSON.parse(readFileSync(path.join(REPO, "data", "graph-played.json"), "utf8"));
  const {total, decks, cards} = topCards({graph, played, share});
  const doc = {
    schema: SCHEMA, generator: "game/tools/engine-top-cards.mjs", source: "data/graph-played.json (EDHREC co-play, every legal commander)",
    sourceGeneratedAt: graph.generatedAt ?? null, share, appearances: total, decks, count: cards.length, cards,
  };
  /* One card a line: the list reads, and diffs, a card at a time. */
  const {cards: list, ...head} = doc;
  const text = JSON.stringify(head, null, 1).replace(/\n}$/, ",\n \"cards\": [\n")
    + list.map((c) => "  " + JSON.stringify(c)).join(",\n") + "\n ]\n}\n";
  const summary = `engine-top-cards: ${cards.length} cards make up ${(share * 100).toFixed(0)}% of ${total.toLocaleString("en-US")} card appearances in ${decks.toLocaleString("en-US")} decks`
    + ` (${cards.filter((c) => c.commander).length} commanders, ${cards.filter((c) => c.land).length} lands).`;
  if (args.includes("--check")) {
    let committed = "";
    try { committed = readFileSync(OUT, "utf8"); } catch {}
    if (committed !== text) { console.error("engine-top-cards: data/engine/top-cards.json is not what the data says now; run node game/tools/engine-top-cards.mjs"); process.exit(1); }
    console.log(summary);
    return;
  }
  if (share !== SHARE) { console.log(summary + " (not written: the committed list is the 80% one)"); return; }
  writeFileSync(OUT, text);
  console.log(summary + " Wrote data/engine/top-cards.json.");
}

if (import.meta.url === new URL(`file:///${path.resolve(process.argv[1] ?? "").replace(/\\/g, "/")}`).href) main(process.argv.slice(2));
