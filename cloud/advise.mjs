/* THE DECK ADVISOR'S BRIEF, BUILT BY THE WORKER (AI-4, docs/plan-to-done-2026-09-30.md).
 *
 * "The browser sends nothing but the deck's id and the person's question or goal; the Worker reads the library it
 * already holds for that person and builds the brief itself." So nothing a page could forge reaches the model: the
 * brief is cloud/advise-brief.mjs's, from the person's latest version in the cloud (cloud/library.mjs), with each card's
 * facts from the catalog (cloud/advise-cards.mjs, generated from data/cards.json).
 *
 *   - THE LIBRARY: the head version's backup, as the app wrote it (gzip, then base64); opened here, at the library
 *     model's own version (MODEL_VERSION), never written. A deck not in it -- a change on this device not yet synced --
 *     is refused, saying so.
 *   - THE BRIEF: the list reading (the deck's own list, each card's state), the candidates the code finds among the
 *     person's own cards and lists (the bench, To buy, Watching, on order), read as the person's AI Coach settings say
 *     (AI-6, `preferences.aiCoach`, synced with the library): cards they do not own only when they ask for them (then
 *     from the catalog, Commander-legal), their own first unless they say otherwise, the bracket's game-changer cap
 *     unless they lift it, and the advice short or detailed.
 *   - WHAT IS NEVER IN IT: cloud/advise-brief.mjs says so -- no price paid, no address, no other person's library.
 */
import {buildBrief} from "./advise-brief.mjs";
import {ADVISE_CARDS, ADVISE_FIELDS, fold} from "./advise-cards.mjs";
import {Closed} from "./ai.mjs";

/* The library model's version (collection-model.js VERSION) the brief is written for. The app brings a library to it as
   it loads one, before it saves, so a version in the cloud is at it; one that is not is refused rather than misread.
   tests/advisor.mjs holds the two together, so a change to the model is a change here too. */
export const MODEL_VERSION = 4;

const ASK_MAX = 300;
const DECK_ID = /^deck:[\w:.-]{1,120}$/;

/** What is asked: which deck, and the person's goal (optional, at most 300 characters). */
export function readAsk(input) {
  const deckId = typeof input?.deckId === "string" ? input.deckId : "";
  if (!DECK_ID.test(deckId)) throw new Closed("Ask the advisor from a deck's page.", 400);
  const ask = typeof input?.ask === "string" ? input.ask.trim() : "";
  if (ask.length > ASK_MAX) throw new Closed(`A goal for the advisor is at most ${ASK_MAX} characters.`, 400);
  return {deckId, ask};
}

/** A version's body -- base64 of the gzipped backup -- as the library's state. */
export async function openVersion(body) {
  let text;
  try {
    const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  } catch {throw new Closed("Your library in the cloud could not be opened. Save it again from this device and try again.", 502);}
  let backup;
  try {backup = JSON.parse(text);} catch {throw new Closed("Your library in the cloud could not be read. Save it again from this device and try again.", 502);}
  const state = backup?.payload?.state || backup?.payload;
  if (!state || !Array.isArray(state.decks)) throw new Closed("Your library in the cloud could not be read. Save it again from this device and try again.", 502);
  if (state.schemaVersion !== MODEL_VERSION) throw new Closed("Your library in the cloud was saved by another version of CrankMagic. Open CrankMagic on this device so it saves your library again, then ask.", 409);
  return state;
}

/* The catalog's facts of a name, as the brief reads a card. */
let byFold = null;
const factsOf = (name) => {
  byFold ||= new Map(Object.keys(ADVISE_CARDS).map((n) => [fold(n), n]));
  const printed = byFold.get(fold(name)), row = printed && ADVISE_CARDS[printed];
  return row ? factsOfRow(printed, row) : null;
};
const factsOfRow = (printed, row) => {
  const facts = Object.fromEntries(ADVISE_FIELDS.map((k, i) => [k, row[i]]));
  return {...facts, name: printed, colorIdentity: [...(facts.colorIdentity || "")], gameChanger: facts.gameChanger === 1, legal: facts.legal === 1};
};

/** A library card joined to its catalog facts, as the app's C.card joins them; a card the catalog lacks has no roles. */
export function cardOfFor(state) {
  return (id) => {
    const ref = state.cards?.[id];
    if (!ref) return null;
    const facts = factsOf(ref.name);
    if (!facts) return {...ref, id, roles: []};
    const {legal: _legal, ...rest} = facts;
    return {...rest, ...ref, id, oracleId: ref.oracleId || facts.oracleId};
  };
}

/** The person's AI Coach settings (AI-6), with their defaults: what the settings panel shows when nothing is saved. */
export function aiSettingsOf(state) {
  const p = state.preferences?.aiCoach || {};
  return {suggestUnowned: p.suggestUnowned === true, preferOwned: p.preferOwned !== false, inBracket: p.inBracket !== false,
    length: p.length === "detailed" ? "detailed" : "short", coachSees: p.coachSees === "board" ? "board" : "hand"};
}

/** The catalog's Commander-legal cards that are not in the person's library: the cards not owned, when they ask for them. */
export function unownedPool(state, table = ADVISE_CARDS) {
  const held = new Set(Object.values(state.cards || {}).map((c) => fold(c.name)));
  const pool = [];
  for (const [name, row] of Object.entries(table)) {
    if (held.has(fold(name))) continue;
    const facts = factsOfRow(name, row);
    if (facts.legal) {const {legal: _legal, ...card} = facts; pool.push({...card, id: `catalog:${facts.oracleId || name}`});}
  }
  return pool;
}

/** The brief for one of the person's decks, from their library's state. */
export function adviseBrief(state, deckId, ask) {
  if (!(state.decks || []).some((d) => d.id === deckId && !d.archived)) {
    throw new Closed("That deck is not in your library in the cloud yet. Let this device finish saving, then ask again.", 409);
  }
  const s = aiSettingsOf(state);
  return buildBrief({state, deckId, cardOf: cardOfFor(state), ask, allowUnowned: s.suggestUnowned, unownedPool: s.suggestUnowned ? unownedPool(state) : null,
    preferOwned: s.preferOwned, inBracket: s.inBracket, length: s.length, basis: "list"});
}
