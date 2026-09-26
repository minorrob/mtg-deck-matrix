#!/usr/bin/env node
/* data/precons.json — every Commander precon's hundred, for "Start from a precon" (R3.10b; INTAKE row R3.10, decision
 * M1 · 4: precons from a committed list, refreshed with the card data).
 *
 * The source is MTGJSON, which publishes Wizards' own decklists: DeckList.json names every deck product, and
 * decks/<fileName>.json holds one deck's cards. Only the "Commander Deck" type is kept, and of each deck only what
 * starting from it needs: its name, set and release date, its commander(s) with their color identity, and the other
 * ninety-some cards by name and count. Everything else MTGJSON carries (printings, prices, rulings, art) stays there.
 *
 *   node tools/build-precons.mjs             fetch MTGJSON and write the file (a few minutes; the refresh runs it)
 *   node tools/build-precons.mjs --check     read the committed file and hold it to its promises, offline
 *
 * The check needs no network, so it runs in every suite: each deck is a hundred cards, one or two commanders, ids
 * unique, newest first; every name is a card the committed Commander universe knows, or is listed on its deck as
 * `notInUniverse` (a card banned since it was printed, say), and that list is exactly what the universe says today.
 * Deterministic apart from the stamp: decks newest first then by name, cards by name. */
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {stamp} from "./lib/envelope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "precons.json");
const BASE = "https://mtgjson.com/api/v5";
const check = process.argv.includes("--check");
const fold = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").trim();

/* The universe by folded name; a double-faced card is known by its whole name and by its front. */
function universe() {
  const u = JSON.parse(readFileSync(path.join(ROOT, "data", "commander-universe.json"), "utf8"));
  const names = new Set();
  for (const [name] of u.cards) { names.add(fold(name)); if (name.includes(" // ")) names.add(fold(name.split(" // ")[0])); }
  return names;
}
const outside = (deck, known) => [...deck.commander.map((c) => c.name), ...deck.cards.map(([n]) => n)].filter((n) => !known.has(fold(n)) && !known.has(fold(n.split(" // ")[0]))).sort();
const byNewest = (a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name, "en-US") || a.id.localeCompare(b.id);

async function getJson(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, {headers: {accept: "application/json", "user-agent": "CrankMagic precons (github.com/minorrob/mtg-deck-matrix)"}});
      if (!r.ok) throw Error(`${url} answered ${r.status}`);
      return await r.json();
    } catch (error) {
      if (i >= tries) throw error;
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** i));
    }
  }
}

/* One deck file -> the row this file keeps. */
export function rowOf(entry, deck) {
  const commander = (deck.commander || []).map((c) => ({name: c.name, colorIdentity: [...(c.colorIdentity || [])].sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b))}));
  const counts = new Map();
  for (const c of deck.mainBoard || []) counts.set(c.name, (counts.get(c.name) || 0) + Number(c.count || 1));
  const cards = [...counts].sort(([a], [b]) => a.localeCompare(b, "en-US"));
  return {id: entry.fileName, code: entry.code, name: entry.name, releaseDate: entry.releaseDate, commander, cards,
    total: commander.length + cards.reduce((n, [, q]) => n + q, 0)};
}

function verify(body, known) {
  const problems = [];
  if (body.schema !== "precons@1" || body.generator !== "tools/build-precons.mjs") problems.push("the envelope is not precons@1 from tools/build-precons.mjs");
  if (body.count !== body.decks.length) problems.push(`count says ${body.count} but there are ${body.decks.length} decks`);
  if (body.decks.length < 100) problems.push(`only ${body.decks.length} decks; MTGJSON lists about two hundred`);
  const ids = new Set();
  body.decks.forEach((d, i) => {
    if (ids.has(d.id)) problems.push(`${d.id} is listed twice`); ids.add(d.id);
    if (!(d.commander.length >= 1 && d.commander.length <= 2)) problems.push(`${d.name}: ${d.commander.length} commanders`);
    const total = d.commander.length + d.cards.reduce((n, [, q]) => n + q, 0);
    if (total !== 100 || d.total !== 100) problems.push(`${d.name}: ${total} cards, not 100`);
    if (i && byNewest(body.decks[i - 1], d) > 0) problems.push(`${d.name} is out of order`);
    const want = outside(d, known);
    if (JSON.stringify(want) !== JSON.stringify(d.notInUniverse || [])) problems.push(`${d.name}: its cards outside the universe are ${JSON.stringify(want)}, not ${JSON.stringify(d.notInUniverse || [])}`);
  });
  return problems;
}

if (check) {
  if (!existsSync(OUT)) { console.error("precons: data/precons.json is missing; run node tools/build-precons.mjs"); process.exit(1); }
  const body = JSON.parse(readFileSync(OUT, "utf8"));
  const problems = verify(body, universe());
  if (problems.length) { console.error(`precons: data/precons.json fails its promises:\n  ${problems.slice(0, 12).join("\n  ")}`); process.exit(1); }
  console.log(`precons: ${body.decks.length} Commander precons, each a hundred cards, every name known to the universe or listed — matches its promises`);
} else if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const list = (await getJson(`${BASE}/DeckList.json`)).data.filter((d) => d.type === "Commander Deck");
  const known = universe(), rows = [], skipped = [];
  for (let i = 0; i < list.length; i += 6) {
    const batch = await Promise.all(list.slice(i, i + 6).map(async (e) => rowOf(e, (await getJson(`${BASE}/decks/${e.fileName}.json`)).data)));
    for (const r of batch) (r.total === 100 && r.commander.length >= 1 && r.commander.length <= 2 ? rows : skipped).push(r);
  }
  for (const r of rows) { const o = outside(r, known); if (o.length) r.notInUniverse = o; }
  rows.sort(byNewest);
  const body = stamp("precons@1", "tools/build-precons.mjs", {source: "MTGJSON DeckList.json and decks/<fileName>.json (Wizards' published decklists), type \"Commander Deck\"", decks: rows}, {count: rows.length});
  const problems = verify(body, known);
  if (problems.length) { console.error(`precons: the build fails its own promises:\n  ${problems.slice(0, 12).join("\n  ")}`); process.exit(1); }
  writeFileSync(OUT, JSON.stringify(body) + "\n");
  console.log(`wrote data/precons.json: ${rows.length} Commander precons (${skipped.length} left out, not a hundred cards: ${skipped.map((s) => `${s.name} ${s.total}`).join(", ") || "none"})`);
}
