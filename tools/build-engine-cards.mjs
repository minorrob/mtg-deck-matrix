/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD DATA THE ENGINE IS ALLOWED TO READ.
 *
 * docs/engine/PLAN.md §6 phase 0.3, and the clean-room rule in docs/engine/ADR-001-own-engine.md:
 * card data comes from SCRYFALL and from nowhere else. Not from Forge, and not from the app's own
 * card catalog either — that is Rob's 2,367-card library rather than the Commander-legal pool, and
 * it carries prices and roles the engine has no business reading.
 *
 * (No path here contains the app catalog's filename, on purpose. tools/data-inventory.mjs pairs a
 * data file with a tool by scanning the tool's text for the path, so even the cache filename is
 * spelled to avoid it — otherwise this file is listed as a generator of a catalog it never writes.)
 *
 * It writes three files into `data/engine/`:
 *
 *   oracle.json   one entry per Commander-legal card: the fields a rules engine needs and nothing
 *                 else. No prices, no images, no rankings, no set data.
 *   tokens.json   the token and emblem entries, kept apart because they are created rather than
 *                 drawn and a deck may never contain one.
 *   support.json  the ledger. Every card starts `unsupported`, which is the honest state on the
 *                 day the engine plays nothing, and each row gains the constructs it needs as the
 *                 compiler and the hand-authored definitions land (§3.2.6 — unsupported is loud,
 *                 never a no-op).
 *
 * THIS FIXES THE POOL COUNT, which §6 phase 0.3 asks it to: everything downstream — the go-live
 * vocabulary, the verified share Rob accepts at G4 — is a fraction of the number this writes.
 *
 *   node tools/build-engine-cards.mjs [--out data/engine] [--keep-cache]
 *
 * Network, and slow: about 24 MB compressed from Scryfall, ~140 MB expanded, streamed rather than
 * held. Run it when a set is released; the output is committed so no suite and no game needs the
 * network.
 */
import {createWriteStream, createReadStream, existsSync, mkdirSync, writeFileSync, statSync, rmSync} from "node:fs";
import {createGunzip} from "node:zlib";
import {pipeline} from "node:stream/promises";
import {createInterface} from "node:readline";
import {resolve, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = resolve(ROOT, arg("--out", "data/engine"));
const CACHE = join(tmpdir(), "crankmagic-oracle-bulk.jsonl.gz");
const UA = {"User-Agent": "CrankMagic/1.0 (personal Commander workshop)", Accept: "application/json"};

/* Scryfall's bulk manifest moved from `download_uri`/`size` to `jsonl_download_uri`/`compressed_size`.
   Both are read so a manifest of either shape works, rather than failing on a field rename. */
async function bulkEntry(type) {
  const manifest = await fetch("https://api.scryfall.com/bulk-data", {headers: UA}).then((r) => r.json());
  const entry = manifest.data.find((b) => b.type === type);
  if (!entry) throw new Error(`Scryfall has no bulk set called ${type}`);
  const uri = entry.jsonl_download_uri || entry.download_uri;
  if (!uri) throw new Error(`Scryfall's ${type} entry carries no download link; the manifest shape has changed again`);
  return {uri, jsonl: !!entry.jsonl_download_uri, bytes: entry.compressed_size || entry.size || 0};
}

/* THE ENGINE'S VIEW OF A CARD. Deliberately narrow: if a field is not needed to decide what a card
   does, it is not copied, because every field carried is a field that has to be kept current. */
const trim = (c) => ({
  id: c.oracle_id,
  name: c.name,
  mana: c.mana_cost ?? null,
  mv: c.cmc ?? 0,
  type: c.type_line ?? "",
  text: c.oracle_text ?? "",
  power: c.power ?? null,
  toughness: c.toughness ?? null,
  loyalty: c.loyalty ?? null,
  defense: c.defense ?? null,
  ci: c.color_identity ?? [],
  colors: c.colors ?? null,
  keywords: c.keywords ?? [],
  layout: c.layout ?? "normal",
  /* A double-faced card is two rules objects sharing one entry; the engine needs both halves. */
  faces: Array.isArray(c.card_faces) && c.card_faces.length
    ? c.card_faces.map((f) => ({
        name: f.name, mana: f.mana_cost ?? null, type: f.type_line ?? "", text: f.oracle_text ?? "",
        power: f.power ?? null, toughness: f.toughness ?? null, loyalty: f.loyalty ?? null,
        colors: f.colors ?? null, defense: f.defense ?? null,
      }))
    : null,
});

const isToken = (c) => c.layout === "token" || c.layout === "double_faced_token" || c.type_line?.startsWith("Emblem");

async function main() {
  mkdirSync(OUT, {recursive: true});
  const {uri, bytes} = await bulkEntry("oracle_cards");

  if (!existsSync(CACHE) || statSync(CACHE).size < 1000) {
    process.stderr.write(`downloading ${(bytes / 1048576).toFixed(0)} MB from Scryfall…\n`);
    const res = await fetch(uri, {headers: UA});
    if (!res.ok) throw new Error(`Scryfall returned ${res.status} for the bulk file`);
    await pipeline(res.body, createWriteStream(CACHE));
  } else {
    process.stderr.write("using the cached bulk file\n");
  }

  const cards = [], tokens = [];
  let seen = 0, notLegal = 0;
  const lines = createInterface({input: createReadStream(CACHE).pipe(createGunzip()), crlfDelay: Infinity});
  for await (const line of lines) {
    const text = line.trim();
    if (!text || text === "[" || text === "]") continue;
    let card;
    try { card = JSON.parse(text.replace(/,$/, "")); } catch { continue; }
    if (!card || !card.oracle_id) continue;
    seen += 1;
    if (isToken(card)) { tokens.push(trim(card)); continue; }
    /* Commander legality is the pool. `restricted` is not a Commander status; banned and
       not_legal are both out, and a card missing the field is out rather than assumed in. */
    if (card.legalities?.commander !== "legal") { notLegal += 1; continue; }
    cards.push(trim(card));
  }

  cards.sort((a, b) => a.name.localeCompare(b.name));
  tokens.sort((a, b) => a.name.localeCompare(b.name));

  /* The registry envelope (schema/index.mjs): the schema id, the generator that wrote it, a
     dated stamp from STAMPS, and a count matching the collection it counts. */
  const generatedAt = new Date().toISOString();
  const generator = "tools/build-engine-cards.mjs";
  const write = (file, value) => {
    const path = join(OUT, file);
    writeFileSync(path, JSON.stringify(value));
    return statSync(path).size;
  };

  const oracleBytes = write("oracle.json", {schema: "engine-oracle@1", generatedAt, generator, source: uri, count: cards.length, cards});
  const tokenBytes = write("tokens.json", {schema: "engine-tokens@1", generatedAt, generator, count: tokens.length, tokens});

  /* THE LEDGER. One row per card, every one `unsupported` on the day it is written, because that
     is true: the engine plays nothing yet. `needs` fills in as definitions land, so prepare can
     name the construct a card is waiting on rather than saying no without a reason. */
  const supportBytes = write("support.json", {
    schema: "engine-support@1", generatedAt, generator, count: cards.length,
    legend: {unsupported: "no definition, or a definition naming a construct the engine lacks",
      compiled: "definition produced by the compiler, not yet proven against a scenario",
      verified: "definition with a passing scenario test"},
    cards: cards.map((c) => ({id: c.id, name: c.name, status: "unsupported", needs: []})),
  });

  if (process.argv.indexOf("--keep-cache") < 0) rmSync(CACHE, {force: true});

  const mb = (n) => (n / 1048576).toFixed(1) + " MB";
  process.stdout.write(
    `\nengine card data written to ${OUT}\n`
    + `  oracle.json   ${String(cards.length).padStart(6)} Commander-legal cards   ${mb(oracleBytes)}\n`
    + `  tokens.json   ${String(tokens.length).padStart(6)} tokens and emblems      ${mb(tokenBytes)}\n`
    + `  support.json  ${String(cards.length).padStart(6)} rows, all unsupported    ${mb(supportBytes)}\n`
    + `  read ${seen} oracle entries; ${notLegal} are not Commander-legal\n`);
}

await main();
