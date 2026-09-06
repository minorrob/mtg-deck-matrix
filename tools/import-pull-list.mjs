/**
 * Turns the card pull list Rob takes to a shop into data/pull-list.json.
 *
 * WHY THIS IS NOT DERIVED. Every other number in the Shop falls out of one subtraction:
 * what the decks want, minus what the ledger says you own. This list does not. Forty-nine
 * of its sixty-eight cards are not referenced by any of the six picked decks -- they are
 * cards Rob has decided to buy, for builds the app is not tracking yet -- so no amount of
 * arithmetic over the current selections produces them. Pretending otherwise would mean
 * inventing deck demand to justify a row, which is how a shopping list starts lying about
 * why a card is on it.
 *
 * So it is carried as what it is: a list somebody wrote, with a per-copy price ceiling
 * they are willing to pay, merged into the Shop beside the derived rows and labelled.
 *
 * WHAT SCRYFALL ADDS. The document gives a name, a count, a rough type and a price
 * ceiling -- enough to shop from, not enough to render. Fifty-five of these cards are in
 * no deck the app tracks, so nothing in the catalog knows their art, set, rarity or color
 * identity, and without those the Gallery would show fifty-five grey rectangles and every
 * color and rarity filter would call them colorless commons. So each name is looked up
 * once, at import, and the facts are written into the file beside the price. Offline, or
 * if Scryfall is unreachable, whatever the last run wrote is kept rather than blanked.
 *
 * Run: node tools/import-pull-list.mjs [--dry] [--offline]
 */
import fs from "node:fs";
import zlib from "node:zlib";

const SOURCE = new URL("../data/source/CardPullList-2026-09-06-rev2.docx", import.meta.url);
const LEDGER = new URL("../data/active-state.json", import.meta.url);
const OUT = new URL("../data/pull-list.json", import.meta.url);
const DRY = process.argv.includes("--dry");
const OFFLINE = process.argv.includes("--offline");

/* A .docx is a ZIP holding word/document.xml. Walking the central directory and inflating
   the one entry is a few lines and keeps this repository's promise of no dependencies --
   the same thing xlsx-reader.js does in the browser, in Node's terms. */
function unzipEntry(buf, wanted) {
  // End of central directory, then each entry's local header.
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip file");
  let at = buf.readUInt32LE(end + 16);
  const count = buf.readUInt16LE(end + 10);
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localAt + 26);
      const lExtraLen = buf.readUInt16LE(localAt + 28);
      const from = localAt + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(from, from + compressed);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} is not in this file`);
}

const xml = unzipEntry(fs.readFileSync(SOURCE), "word/document.xml").toString("utf8");
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
const cellText = (tc) => strip((tc.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || []).join(""));

const cards = [];
for (const row of xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) {
  const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(cellText);
  if (cells.length < 5) continue;
  const name = cells[1];
  if (!name || /^(card|total)$/i.test(name)) continue;
  const quantity = Math.max(1, Number(cells[2]) || 1);
  const ceiling = Number(String(cells[4]).replace(/[^0-9.]/g, ""));
  cards.push({name, quantity, type: cells[3], ceiling: Number.isFinite(ceiling) && ceiling > 0 ? ceiling : null});
}
cards.sort((a, b) => a.name.localeCompare(b.name));

/* ---------------- the facts the document does not carry ---------------- */

/* What a previous run already learned. Read before the lookup, not after: a card that
   drops out of Scryfall's index, or a run made on a train, keeps the art it had rather
   than reverting to a grey rectangle. */
const before = new Map();
try {
  for (const card of JSON.parse(fs.readFileSync(OUT, "utf8")).cards || []) {
    if (card && card.name && card.image) before.set(card.name, card);
  }
} catch { /* first run, or the file is not there yet */ }

/* The front face is the one you look for in a box, so a two-faced card is described by
   its front: Scryfall puts the art under card_faces[0] and leaves image_uris off the
   card itself, and reading only the top level would blank exactly those. */
function factsOf(card) {
  const face = (card.image_uris ? card : (card.card_faces || [])[0]) || {};
  return {
    typeLine: card.type_line || face.type_line || "",
    manaCost: card.mana_cost || face.mana_cost || "",
    colorIdentity: card.color_identity || [],
    rarity: card.rarity || "",
    /* No set name on purpose. The list says "any printing", so filing these by set would
       send you to a box the card need not be in -- and a name lookup answers with the
       newest printing, which for a staple like Skullclamp is a premium set nobody's
       singles box is organized around. The art is still the newest printing's, which is
       only ever used to recognize the card. */
    image: (face.image_uris || {}).normal || "",
    oracleText: card.oracle_text || face.oracle_text || "",
    scryfallId: card.id || ""
  };
}

/* Scryfall takes 75 identifiers a request, which is one request for this list. */
async function lookUp(names) {
  const found = new Map();
  for (let at = 0; at < names.length; at += 75) {
    const batch = names.slice(at, at + 75);
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      /* Scryfall asks every client to name itself and to say what it will accept, and
         answers 400 to anything that does not. */
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "mtg-deck-matrix/1.0 (pull-list import)"
      },
      body: JSON.stringify({identifiers: batch.map((name) => ({name}))})
    });
    if (!response.ok) throw new Error(`Scryfall answered ${response.status}`);
    const body = await response.json();
    (body.data || []).forEach((card) => found.set(card.name, factsOf(card)));
    /* The names Scryfall matched are not always the names asked for -- a request for
       "Fblthp, the Lost" comes back under whatever the card is actually called -- so the
       asked-for name is mapped onto the answer in order for anything still missing. */
    batch.forEach((name) => {
      if (found.has(name)) return;
      const hit = (body.data || []).find((c) => c.name.toLowerCase().startsWith(name.toLowerCase().split(",")[0]));
      if (hit) found.set(name, factsOf(hit));
    });
    if (at + 75 < names.length) await new Promise((done) => setTimeout(done, 120));
  }
  return found;
}

let facts = new Map();
let lookupNote = "used the previous run's card facts";
if (!OFFLINE) {
  try {
    facts = await lookUp(cards.map((c) => c.name));
    lookupNote = `Scryfall matched ${facts.size} of ${cards.length}`;
  } catch (error) {
    lookupNote = `Scryfall lookup failed (${error.message}); kept the previous run's card facts`;
  }
}
const blank = [];
cards.forEach((card) => {
  const fact = facts.get(card.name) || before.get(card.name);
  if (fact) {
    card.typeLine = fact.typeLine; card.manaCost = fact.manaCost;
    card.colorIdentity = fact.colorIdentity; card.rarity = fact.rarity;
    card.image = fact.image;
    card.oracleText = fact.oracleText; card.scryfallId = fact.scryfallId;
  } else blank.push(card.name);
});

/* WHAT WAS ALREADY IN THE BOX WHEN THE LIST WAS WRITTEN.
 *
 * "Buy one Exotic Orchard" is written by somebody who already owns one -- it is a second
 * copy, for a seventh deck -- and four of these cards are like that. Without the count
 * they were written against, the Shop cannot tell "still to buy" from "bought last week":
 * a list saying 1 and a ledger saying 1 reads as done on the first reading and as owed on
 * the second, depending which way you resolve it, and buying the card would never clear
 * the row. So the ledger is read once here, at import, and the copies already held are
 * recorded beside the count. The Shop then owes `held + quantity` in total, which is the
 * document's own arithmetic on the day it was written, and goes down as copies arrive.
 */
let held = {};
try {
  held = JSON.parse(fs.readFileSync(LEDGER, "utf8")).state.owned || {};
} catch { /* no committed state; every card is treated as one nobody owns yet */ }
const ownedKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
let alreadyHeld = 0;
cards.forEach((card) => {
  const rec = held[ownedKey(card.name)] || {};
  const have = (Number(rec.inHand) || 0) + (Number(rec.ordered) || 0);
  if (have > 0) { card.held = have; alreadyHeld += 1; }
});

const copies = cards.reduce((n, c) => n + c.quantity, 0);
const budget = cards.reduce((n, c) => n + (c.ceiling || 0) * c.quantity, 0);
const note = strip((xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
  .map(strip).find((t) => /Max \$/.test(t)) || "");

const doc = {
  source: "data/source/CardPullList-2026-09-06-rev2.docx",
  generatedBy: "tools/import-pull-list.mjs",
  dated: "2026-09-06", revision: 2,
  note, cards, totals: {cards: cards.length, copies, budget: Math.round(budget * 100) / 100}
};
if (!DRY) fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + "\n");
console.log(`${cards.length} cards · ${copies} copies · $${doc.totals.budget.toFixed(2)} at the listed ceilings`);
console.log(`multiples: ${cards.filter((c) => c.quantity > 1).map((c) => `${c.name} x${c.quantity}`).join(", ") || "none"}`);
console.log(`unpriced: ${cards.filter((c) => c.ceiling == null).length}`);
console.log(`already held when written: ${alreadyHeld} card${alreadyHeld === 1 ? "" : "s"} · ${
  cards.filter((c) => c.held).map((c) => `${c.name} x${c.held}`).join(", ") || "none"}`);
console.log(`card facts: ${lookupNote}${blank.length ? ` · no facts for ${blank.join(", ")}` : ""}`);
console.log(DRY ? "--dry: nothing written" : `wrote ${OUT.pathname}`);
