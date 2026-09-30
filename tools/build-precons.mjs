#!/usr/bin/env node
/* data/precons.json — every Commander precon's hundred, for "Start from a precon" (R3.10b; INTAKE row R3.10, decision
 * M1 · 4: precons from a committed list, refreshed with the card data).
 *
 * The source is MTGJSON, which publishes Wizards' own decklists: DeckList.json names every deck product, and
 * decks/<fileName>.json holds one deck's cards. Only the "Commander Deck" type is kept, and of each deck only what
 * starting from it needs: its name, set and release date, its commander(s) with their color identity, and the other
 * ninety-some cards by name and count. Everything else MTGJSON carries (printings, prices, rulings, art) stays there.
 *
 *   node tools/build-precons.mjs             fetch MTGJSON and write both files (a few minutes; the refresh runs it)
 *   node tools/build-precons.mjs --latest    rewrite data/precons-latest.json from the committed list (SetList.json only)
 *   node tools/build-precons.mjs --check     read the committed files and hold them to their promises, offline
 *
 * data/precons-latest.json is the newest release's decks alone -- the ones sharing the latest release date, with
 * their set's name -- a few kilobytes the home screens read to offer "New from Wizards" without the 400 KB list
 * (Rob, 2026-09-30: the Reality Fracture precons, to add from the home screen). The full list is fetched only
 * when one is chosen.
 *
 * The check needs no network, so it runs in every suite: each deck is a hundred cards, one or two commanders, ids
 * unique, newest first; every name is a card the committed Commander universe knows, or is listed on its deck as
 * `notInUniverse` (a card banned since it was printed, say), and that list is exactly what the universe says today;
 * and the latest file is exactly the full list's newest release. Deterministic apart from the stamp: decks newest
 * first then by name, cards by name. */
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {stamp} from "./lib/envelope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "precons.json");
const LATEST = path.join(ROOT, "data", "precons-latest.json");
const BASE = "https://mtgjson.com/api/v5";
const check = process.argv.includes("--check"), latestOnly = process.argv.includes("--latest");
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

/* THE NEWEST RELEASE: every deck that shares the latest release date (a set and its Commander decks release
   together), with the set's name from MTGJSON's SetList when it is known. The full row's cards are left out. */
export function latestOf(body, setNames = new Map()) {
  const newest = body.decks.length ? body.decks[0].releaseDate : null;
  const decks = body.decks.filter((d) => d.releaseDate === newest).map(({id, code, name, releaseDate, commander, total, notInUniverse}) =>
    ({id, code, setName: setNames.get(code) || code, name, releaseDate, commander, total, ...(notInUniverse ? {notInUniverse} : {})}));
  return stamp("precons-latest@1", "tools/build-precons.mjs", {source: "the newest release date in data/precons.json; set names from MTGJSON SetList.json", releaseDate: newest, decks}, {count: decks.length});
}
function verifyLatest(latest, body) {
  const problems = [];
  if (!latest || latest.schema !== "precons-latest@1" || latest.generator !== "tools/build-precons.mjs") return ["the envelope is not precons-latest@1 from tools/build-precons.mjs"];
  const want = latestOf(body);
  if (latest.releaseDate !== want.releaseDate) problems.push(`its release date is ${latest.releaseDate}, and the full list's newest is ${want.releaseDate}`);
  if (latest.count !== latest.decks.length) problems.push(`count says ${latest.count} but there are ${latest.decks.length} decks`);
  if (JSON.stringify(latest.decks.map((d) => d.id)) !== JSON.stringify(want.decks.map((d) => d.id))) problems.push(`its decks are ${JSON.stringify(latest.decks.map((d) => d.id))}, and the full list's newest are ${JSON.stringify(want.decks.map((d) => d.id))}`);
  latest.decks.forEach((d, i) => {
    const full = want.decks[i];
    if (!full) return;
    if (d.name !== full.name || JSON.stringify(d.commander) !== JSON.stringify(full.commander) || d.total !== full.total || JSON.stringify(d.notInUniverse || []) !== JSON.stringify(full.notInUniverse || [])) problems.push(`${d.name}: not what the full list says of it`);
    if (!d.setName) problems.push(`${d.name}: no set name`);
  });
  return problems;
}
async function setNames() {
  const sets = (await getJson(`${BASE}/SetList.json`)).data;
  return new Map(sets.map((s) => [s.code, s.name]));
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
  if (!existsSync(LATEST)) { console.error("precons: data/precons-latest.json is missing; run node tools/build-precons.mjs --latest"); process.exit(1); }
  const latest = JSON.parse(readFileSync(LATEST, "utf8")), late = verifyLatest(latest, body);
  if (late.length) { console.error(`precons: data/precons-latest.json fails its promises:\n  ${late.slice(0, 12).join("\n  ")}`); process.exit(1); }
  console.log(`precons: ${body.decks.length} Commander precons, each a hundred cards, every name known to the universe or listed — matches its promises; the newest release (${latest.releaseDate}) is ${latest.decks.length} of them`);
} else if (latestOnly) {
  const body = JSON.parse(readFileSync(OUT, "utf8")), latest = latestOf(body, await setNames());
  writeFileSync(LATEST, JSON.stringify(latest, null, 1) + "\n");
  console.log(`wrote data/precons-latest.json: ${latest.decks.length} precons of ${latest.releaseDate} (${[...new Set(latest.decks.map((d) => d.setName))].join(", ")})`);
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
  const latest = latestOf(body, await setNames());
  writeFileSync(LATEST, JSON.stringify(latest, null, 1) + "\n");
  console.log(`wrote data/precons.json: ${rows.length} Commander precons (${skipped.length} left out, not a hundred cards: ${skipped.map((s) => `${s.name} ${s.total}`).join(", ") || "none"}); data/precons-latest.json: ${latest.decks.length} of ${latest.releaseDate}`);
}
