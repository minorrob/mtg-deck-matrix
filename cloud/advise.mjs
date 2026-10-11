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
 *     person's own cards and lists (the bench, To buy, Watching, on order). Cards the person does not own are not
 *     offered: whether they may be is the person's setting (AI-6), off until it is built.
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

/** A library card joined to its catalog facts, as the app's C.card joins them; a card the catalog lacks has no roles. */
export function cardOfFor(state) {
  return (id) => {
    const ref = state.cards?.[id];
    if (!ref) return null;
    const row = ADVISE_CARDS[fold(ref.name)];
    if (!row) return {...ref, id, roles: []};
    const facts = Object.fromEntries(ADVISE_FIELDS.map((k, i) => [k, row[i]]));
    return {...facts, colorIdentity: [...(facts.colorIdentity || "")], gameChanger: facts.gameChanger === 1, ...ref, id, oracleId: ref.oracleId || facts.oracleId};
  };
}

/** The brief for one of the person's decks, from their library's state. */
export function adviseBrief(state, deckId, ask) {
  if (!(state.decks || []).some((d) => d.id === deckId && !d.archived)) {
    throw new Closed("That deck is not in your library in the cloud yet. Let this device finish saving, then ask again.", 409);
  }
  return buildBrief({state, deckId, cardOf: cardOfFor(state), ask, allowUnowned: false, basis: "list"});
}
