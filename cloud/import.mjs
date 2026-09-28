/* A DECK BY ITS LINK (R3.10a; INTAKE row R3.10, decision M1 · 4). Archidekt serves any public deck as JSON at
 * https://archidekt.com/api/decks/<id>/, and the page's security policy lets the browser reach Scryfall and nothing
 * else -- so the Worker fetches it, on the reader's behalf, and hands back only what the app's importer reads.
 *
 *   GET /api/import/archidekt?id=<digits>   -> 200 {deck}  (the trimmed deck; see trim below)
 *                                            -> 400 not a deck number · 404 no such public deck · 413 too large
 *                                            -> 502 Archidekt answered something else · 504 Archidekt did not answer
 *
 * WHAT IT PROMISES:
 *   - Nothing is stored. The deck passes through and is gone; no cache, no database, no log of what was asked.
 *   - Only a deck number goes out: the Worker builds the URL itself, so the route cannot be pointed anywhere else.
 *   - A size limit on the way in (DECK_BYTES) and a row limit on the way out, so a huge or hostile answer is refused,
 *     not relayed. A time limit, so a slow answer costs the reader ten seconds, not a hung request.
 *   - No sign-in needed: a first visit can import a deck (the landing page offers it). The per-network rate limit
 *     applies, and it answers only the app itself (the same guard the library's writes use).
 */
export const DECK_BYTES = 2 * 1024 * 1024, DECK_ROWS = 400, TIMEOUT_MS = 10000;
const ID = /^\d{1,10}$/;

export class ImportError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* Read a body, refusing it as soon as it passes the limit rather than after it has all arrived. */
async function readCapped(response, limit) {
  const said = Number(response.headers.get("content-length"));
  if (Number.isFinite(said) && said > limit) throw new ImportError(413, "That deck is larger than CrankMagic imports.");
  if (!response.body || !response.body.getReader) {
    const text = await response.text();
    if (text.length > limit) throw new ImportError(413, "That deck is larger than CrankMagic imports.");
    return text;
  }
  const reader = response.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { try { await reader.cancel(); } catch { /* already gone */ } throw new ImportError(413, "That deck is larger than CrankMagic imports."); }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}

/* Only what deck-sources.js fromArchidekt reads: the deck's name and owner's username, which categories count, and
   for each row its quantity, categories, label, the card's rules facts and its TCGplayer and Card Kingdom prices.
   Everything else Archidekt sends (ids, edition data, images, the owner's profile) stays behind. */
const str = (v, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v, n = 20, max = 60) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => x.slice(0, max)) : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export function trim(json) {
  const cards = Array.isArray(json && json.cards) ? json.cards : [];
  if (cards.length > DECK_ROWS) throw new ImportError(413, `That deck has ${cards.length} rows; CrankMagic imports up to ${DECK_ROWS}.`);
  return {
    name: str(json.name, 200) || "Archidekt deck",
    owner: {username: str(json.owner && json.owner.username, 80)},
    categories: (Array.isArray(json.categories) ? json.categories : []).slice(0, 60).map((c) => ({name: str(c && c.name, 60), includedInDeck: !(c && c.includedInDeck === false)})),
    cards: cards.map((row) => {
      const card = (row && row.card) || {}, o = card.oracleCard || {}, p = card.prices || {};
      return {
        quantity: Math.max(1, Math.min(99, Math.round(num(row.quantity) || 1))),
        categories: strs(row.categories),
        label: str(row.label, 60),
        card: {
          oracleCard: {name: str(o.name, 200), manaCost: str(o.manaCost, 60), text: str(o.text, 2000), keywords: strs(o.keywords, 20, 40), colorIdentity: strs(o.colorIdentity, 5, 10),
            cmc: num(o.cmc), types: strs(o.types, 8, 30), subTypes: strs(o.subTypes, 12, 30), superTypes: strs(o.superTypes, 6, 30), gameChanger: Boolean(o.gameChanger)},
          prices: {tcg: num(p.tcg), ck: num(p.ck)},
        },
      };
    }).filter((row) => row.card.oracleCard.name),
  };
}

/* The deck, by number, through Archidekt's public API. */
export async function archidekt(id, {fetchImpl = fetch, timeoutMs = TIMEOUT_MS} = {}) {
  if (!ID.test(String(id || ""))) throw new ImportError(400, "That is not an Archidekt deck number. Paste the deck's link, archidekt.com/decks/<number>.");
  let response;
  try {
    response = await fetchImpl(`https://archidekt.com/api/decks/${id}/`, {headers: {accept: "application/json", "user-agent": "CrankMagic deck import (crankmagic.com)"}, redirect: "error", signal: AbortSignal.timeout(timeoutMs)});
  } catch (error) {
    if (error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new ImportError(504, "Archidekt did not answer in time. Try again, or export the list from Archidekt and paste it.");
    throw new ImportError(502, "Archidekt could not be reached. Try again, or export the list from Archidekt and paste it.");
  }
  if (response.status === 404 || response.status === 403) throw new ImportError(404, `Archidekt has no public deck ${id}. A private deck cannot be read by link; export its list and paste it.`);
  if (!response.ok) throw new ImportError(502, `Archidekt answered ${response.status}. Try again, or export the list from Archidekt and paste it.`);
  let json;
  try { json = JSON.parse(await readCapped(response, DECK_BYTES)); }
  catch (error) { if (error instanceof ImportError) throw error; throw new ImportError(502, "Archidekt sent something that is not a deck. Export the list from Archidekt and paste it."); }
  return trim(json);
}
