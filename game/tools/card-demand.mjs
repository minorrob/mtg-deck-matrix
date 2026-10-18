/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE NEXT WAVE, THE MOST WANTED FIRST (card load step 1; Linear ROB-86; docs/engine/plan-card-load-program.md).
 *
 * The Worker counts every card a table names as one it cannot play (cloud/card-demand.mjs, D1 `card_demand`): how
 * many times, in how many different decks. This tool ranks those counts for the wave tooling: the cards the most
 * decks asked for first, then the most asked, then the most recently. A card the engine can already play is dropped.
 * The wave list (`docs/handoff-2026-10-12/topneeds.mjs`, given the rows) puts these ahead of the most-played cards.
 *
 * The rows come from the database as wrangler prints them, from a release checkout (its wrangler config names it):
 *
 *   npx wrangler d1 execute crankmagic-staging --remote --json \
 *     --command "SELECT name, asked, decks, first_seen, last_seen FROM card_demand" > demand-rows.json
 *   node game/tools/card-demand.mjs demand-rows.json [--top <topneeds out.json>] [--out <file>]
 */
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";

export const SCHEMA = "CrankCardDemand@1";

/** The rows, from wrangler's `--json` (a list of results), one result, or a plain list. */
export function readRows(value) {
  const list = Array.isArray(value) && value.length && value.every((r) => r && Array.isArray(r.results)) ? value.flatMap((r) => r.results)
    : value && Array.isArray(value.results) ? value.results : Array.isArray(value) ? value : null;
  if (!list) throw new Error("Expected card_demand rows: wrangler's --json output, or a list of rows.");
  return list.filter((r) => r && typeof r.name === "string" && r.name.trim());
}

/** The demand, ranked: decks, then times asked, then the most recent; cards the engine plays already dropped. */
export function rankDemand(rows, {playable = () => false} = {}) {
  return rows
    .filter((r) => !playable(r.name))
    .map((r) => ({name: r.name, decks: Number(r.decks) || 0, asked: Number(r.asked) || 0, firstSeen: r.first_seen ?? r.firstSeen ?? null, lastSeen: r.last_seen ?? r.lastSeen ?? null}))
    .sort((a, b) => b.decks - a.decks || b.asked - a.asked || String(b.lastSeen).localeCompare(String(a.lastSeen)) || a.name.localeCompare(b.name, "en-US"));
}

/**
 * A wave's order: the demanded cards first, in demand's order, then the rest of `top` (the most-played undefined cards,
 * as topneeds.mjs lists them) in its own. Each name once; a demanded card keeps its `top` row's fields and gains `demand`.
 */
export function waveOrder(demand, top = [], {extra = () => ({})} = {}) {
  const byName = new Map(top.map((r) => [r.name.toLowerCase(), r]));
  const first = demand.map((d) => ({...(byName.get(d.name.toLowerCase()) || {rank: null, name: d.name, ...extra(d.name)}), demand: {decks: d.decks, asked: d.asked}}));
  const taken = new Set(first.map((r) => r.name.toLowerCase()));
  return [...first, ...top.filter((r) => !taken.has(r.name.toLowerCase()))];
}

async function main(args) {
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const values = new Set([flag("--top"), flag("--out")]), file = args.find((a) => !a.startsWith("--") && !values.has(a));
  if (!file) {console.error("Usage: node game/tools/card-demand.mjs <rows.json> [--top <topneeds out.json>] [--out <file>]"); process.exit(2);}
  const {tableCards} = await import("../../cloud/game-room.mjs");
  const demand = rankDemand(readRows(JSON.parse(readFileSync(file, "utf8"))), {playable: (name) => Boolean(tableCards(name))});
  const top = flag("--top") ? JSON.parse(readFileSync(flag("--top"), "utf8")) : [];
  const order = waveOrder(demand, top);
  if (flag("--out")) writeFileSync(flag("--out"), JSON.stringify({schema: SCHEMA, demanded: demand.length, cards: order}, null, 1));
  console.log(`demanded and not yet playable: ${demand.length}${top.length ? `; the wave list, demand first: ${order.length}` : ""}`);
  for (const r of order.slice(0, 30)) console.log(r.demand ? `${r.demand.decks} decks, asked ${r.demand.asked}` : `rank ${r.rank}`, "|", r.name);
}

if (import.meta.url === new URL(`file:///${path.resolve(process.argv[1] ?? "").replace(/\\/g, "/")}`).href) await main(process.argv.slice(2));
