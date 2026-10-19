/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CARD DEMAND: WHICH CARDS PLAYERS WANT THAT A TABLE CANNOT PLAY YET (card load step 1; Linear ROB-86;
 * docs/engine/plan-card-load-program.md).
 *
 * Written at the one point where the table names what it cannot play (cloud/tables.mjs): the answer to "which of
 * these names can't a table play" (POST /api/tables/known) and a seat's deck refused for its cards. The wave tooling
 * reads the ranking, the most wanted first (game/tools/card-demand.mjs), and the deck page says such a card "is on
 * the list for the next wave" (Rob's decision 5) from the `listed` the answer carries.
 *
 * WHAT IS KEPT (migration 0006): per card name, how many times a table named it, in how many different deck lists,
 * and when first and last. Never the deck, its id or name, the table, or the person: a deck list is kept only as a
 * one-way digest of its card names, so the same list asked again is not counted as another deck. A list edited is a
 * different list, and counts once more. A name that could be an address (an "@", a "://") or is longer than any card's
 * is not kept: whatever was typed into a deck list is not the card name it was meant to be.
 *
 * Nothing here may break the answer: a database that is missing, or refuses (a migration not yet applied), records
 * nothing, and the answer goes out as it would have, without `listed`.
 */

/* D1 binds at most 100 parameters to one statement: the clock, then up to 99 names or digests. */
const CHUNK = 99;
/* The longest card name in print is 141 characters. */
export const NAME_LIMIT = 150;

/** A card name as it is kept, or null when it is not one to keep. */
export function demandName(name) {
  if (typeof name !== "string") return null;
  const n = name.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!n || n.length > NAME_LIMIT || /@|:\/\/|[\u0000-\u001f\u007f]/.test(n)) return null;
  return n;
}

/** The digest a deck list is kept as: its distinct card names, in no case and in order, hashed. */
export async function deckDigest(names) {
  const list = [...new Set((names || []).map(demandName).filter(Boolean).map((n) => n.toLowerCase()))].sort();
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`card-demand:v1\n${list.join("\n")}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const chunks = (list) => Array.from({length: Math.ceil(list.length / CHUNK)}, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));
const slots = (n, row) => Array.from({length: n}, (_, i) => row(i + 2)).join(", ");

/**
 * Count one question the table answered.
 *
 * @param db D1, or nothing
 * @param asks [{unknown: names the table cannot play, deck?: every name in the deck they were asked for}]; an ask
 *   without `deck` is counted as asked and in no deck (names asked together, with no deck to tell them apart)
 * @returns {Promise<string[]>} the names now on the list, sorted; none when nothing could be recorded
 */
export async function recordDemand(db, asks, {now = new Date().toISOString(), log = console} = {}) {
  if (!db || !Array.isArray(asks)) return [];
  try {
    /* Each name once, as first given in this question; and each deck by its digest. */
    const names = new Map(), decks = [];
    for (const ask of asks) {
      const unknown = [...new Set((ask && Array.isArray(ask.unknown) ? ask.unknown : []).map(demandName).filter(Boolean))];
      if (!unknown.length) continue;
      for (const n of unknown) if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), n);
      if (Array.isArray(ask.deck)) decks.push({digest: await deckDigest(ask.deck), unknown: unknown.map((n) => n.toLowerCase())});
    }
    if (!names.size) return [];
    for (let attempt = 0; ; attempt += 1) {
      try {
        await write(db, names, decks, now);
        break;
      } catch (error) {
        /* Two questions about one new deck at once: the second's digest is refused, its whole write undone, and it is
           counted again as a deck already seen. */
        if (attempt === 0 && decks.length && /UNIQUE|constraint/i.test(String(error && error.message))) continue;
        throw error;
      }
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, "en-US"));
  } catch (error) {
    log.warn(`Card demand not recorded: ${error && error.message ? error.message : error}`);
    return [];
  }
}

/* One transaction: the decks not seen before kept by digest, and each name asked once more, in as many more decks as
   new decks held it. */
async function write(db, names, decks, now) {
  const digests = [...new Set(decks.map((d) => d.digest))], seen = new Set();
  for (const part of chunks(digests)) {
    const rows = await db.prepare(`SELECT digest FROM card_demand_lists WHERE digest IN (${part.map((_, i) => `?${i + 1}`).join(", ")})`).bind(...part).all();
    for (const row of rows.results || []) seen.add(row.digest);
  }
  const fresh = digests.filter((d) => !seen.has(d)), counted = new Set();
  const more = new Map();   /* a name (lower case) -> how many new decks held it */
  for (const d of decks) {
    if (seen.has(d.digest) || counted.has(d.digest)) continue;
    counted.add(d.digest);
    for (const n of d.unknown) more.set(n, (more.get(n) || 0) + 1);
  }
  const statements = [];
  for (const part of chunks(fresh))
    statements.push(db.prepare(`INSERT INTO card_demand_lists (digest, seen) VALUES ${slots(part.length, (p) => `(?${p}, ?1)`)}`).bind(now, ...part));
  /* Grouped by how many decks each adds, so that count is written into the statement as a number, never bound. */
  const byDecks = new Map();
  for (const [key, name] of names) {
    const d = more.get(key) || 0;
    if (!byDecks.has(d)) byDecks.set(d, []);
    byDecks.get(d).push(name);
  }
  for (const [d, list] of byDecks)
    for (const part of chunks(list))
      statements.push(db.prepare(`INSERT INTO card_demand (name, asked, decks, first_seen, last_seen) VALUES ${slots(part.length, (p) => `(?${p}, 1, ${Number(d)}, ?1, ?1)`)} ` +
        "ON CONFLICT(name) DO UPDATE SET asked = asked + 1, decks = decks + excluded.decks, last_seen = excluded.last_seen").bind(now, ...part));
  await db.batch(statements);
}
