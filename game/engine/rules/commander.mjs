/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE COMMANDER RULES: CR 903.
 *
 * `docs/engine/PLAN.md` §3.3, twelfth row. The 21-combat-damage rule landed with state-based
 * actions in 1.5; this is the command zone, the tax, color identity and the command-zone
 * replacement.
 *
 * COLOR IDENTITY IS NOT COLOR (CR 903.4). It is a card's colors plus EVERY mana symbol in its rules
 * text, ignoring reminder text. A colorless artifact whose ability costs {B} has a black color
 * identity and cannot go in a mono-white deck. Reading the mana cost alone is the standard mistake,
 * and it is the rule the entire deck-building half of CrankMagic rests on — `card-catalog.js` and
 * the Lab both ask this question of every card.
 *
 * COMMANDER TAX COUNTS CASTS FROM THE COMMAND ZONE, NOT CASTS (CR 903.8). A commander that was
 * cast, died, was recast from the command zone and then bounced to hand costs its printed price
 * from hand: the tax follows the times it left the command zone, nothing else. And it is part of
 * the cost, so a taxed commander a player cannot afford is simply not offered — never offered and
 * then refused at payment.
 *
 * THE TAX AND THE DAMAGE BELONG TO THE COMMANDER, NOT TO AN OBJECT. Every zone change makes a new
 * object (CR 400.7), and a commander changes zones every time it is cast, dies or is exiled. Both are
 * kept under its `commanderKey` (state/index.mjs), which every move carries: the second cast from
 * the command zone costs {2} more, and 11 combat damage before a death and 11 after are 22 from the
 * same commander (CR 903.10a).
 *
 * RETURNING TO THE COMMAND ZONE IS A CHOICE, AND IT IS THE OWNER'S (CR 903.9a). "May" means the
 * engine asks. An engine that always returns a commander takes away a real decision: leaving it in
 * a graveyard is where a reanimation starts, and paying the tax again is not always what a player
 * wants. It is the OWNER who chooses, not whoever controlled it — a borrowed commander goes home.
 *
 * IT IS A STATE-BASED ACTION, NOT A REPLACEMENT (CR 903.9a, 704.6d). The commander goes to the
 * graveyard or to exile first -- it dies, and "whenever a creature dies" sees it die -- and the
 * next time state-based actions are checked its owner is asked whether to move it. However it got
 * there: destroyed, exiled, sacrificed, countered, discarded. Once asked about, it is not asked
 * again while it stays (704.6d asks only of one put there since the last check); a move makes a
 * new object, and that one is asked.
 *
 * GOING TO A HAND OR A LIBRARY IS A REPLACEMENT (CR 903.9b): the owner is asked BEFORE the move,
 * so the card is never seen in the hand. Built where an effect moves it (a bounce, a tuck: the
 * resolution asks ahead of the moveZone, script/effects/asking.mjs `commanderHome`).
 *
 * WHAT IS DEFERRED AND NAMED: 903.9b for a move that is not an effect's moveZone -- a cost that
 * returns a permanent to its owner's hand, a card put into a hand from the top of a library.
 * Partner and background (CR 702.124) are a deck rule, held at the table (room/table.mjs); the
 * two-commander color identity is the union of both, which `colorIdentity` composes.
 */

import {COLORS} from "./mana.mjs";
import {commanderKeyOf, cardsIn} from "../state/index.mjs";

/** What the tax adds per previous cast from the command zone (CR 903.8). */
const TAX_PER_CAST = 2;

/* Every mana symbol in a piece of text, with reminder text removed first.
 *
 * CR 903.4c: reminder text is not rules text for this purpose. Without that line a card whose
 * reminder explains what a symbol means would take on that color, and a surprising fraction of the
 * pool would come out five-colored. */
function symbolsIn(text) {
  const withoutReminders = String(text ?? "").replace(/\([^)]*\)/g, " ");
  return [...withoutReminders.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

/** The colors a single symbol contributes. Colorless and generic contribute none. */
function colorsOfSymbol(symbol) {
  const found = new Set();
  /* A hybrid is both of its colors, a Phyrexian symbol is its color, and {C} and a number are
     neither — colorless is not a color (CR 105.1). */
  for (const part of symbol.split("/")) {
    if (COLORS.includes(part)) found.add(part);
  }
  return [...found];
}

/**
 * A card's color identity (CR 903.4): its colors, plus every mana symbol in its rules text.
 *
 * @param {{manaCost?: string, text?: string, colorIndicator?: Array<string>}} card
 * @returns {Array<string>} in WUBRG-stable order, so two identities compare by value
 */
export function colorIdentity(card) {
  const found = new Set(card?.colorIndicator ?? []);
  for (const symbol of symbolsIn(card?.manaCost)) for (const color of colorsOfSymbol(symbol)) found.add(color);
  for (const symbol of symbolsIn(card?.text)) for (const color of colorsOfSymbol(symbol)) found.add(color);
  /* A stable order, so `["U","W"]` is always `["U","W"]` and a caller can compare without sorting. */
  return COLORS.filter((color) => found.has(color));
}

/** Whether a card may go in a deck with this identity (CR 903.4). */
export function withinIdentity(card, identity) {
  return colorIdentity(card).every((color) => identity.includes(color));
}

/* The key a commander's tax and damage are kept under: the commander's own, or -- for an id that names nothing now --
   the id itself, which matches nothing and so counts nothing. */
const keyFor = (state, objectId) => (state.objects[objectId] ? commanderKeyOf(state.objects[objectId]) : String(objectId));

/**
 * The extra generic mana this commander costs right now (CR 903.8).
 *
 * Two for each previous time it was cast FROM THE COMMAND ZONE — not for each time it was cast.
 */
export function commanderTax(state, player, objectId) {
  const casts = state.players[player].commanderCasts?.[keyFor(state, objectId)] ?? 0;
  return casts * TAX_PER_CAST;
}

/** Record a cast from the command zone, so the next one costs more. */
export function recordCommanderCast(state, player, objectId) {
  if (!state.players[player].commanderCasts) state.players[player].commanderCasts = {};
  const casts = state.players[player].commanderCasts;
  const key = keyFor(state, objectId);
  casts[key] = (casts[key] ?? 0) + 1;
}

/**
 * Keep the tally of combat damage a commander has dealt a player (CR 903.10a).
 *
 * The caller says the damage was combat damage, and the source is still the object that dealt it. Nothing from an
 * object that is not a commander is counted, however much it is.
 */
export function recordCommanderDamage(state, player, sourceId, amount) {
  const source = state.objects[sourceId];
  if (source?.commander !== true || !(amount > 0)) return;
  const tally = state.players[player].commanderDamage;
  const key = commanderKeyOf(source);
  tally[key] = (tally[key] ?? 0) + amount;
}

/* ---- CR 903.9a, back to the command zone ---- */

/** The zones a commander may be moved back from as a state-based action (CR 903.9a). */
const RECOVERABLE = ["graveyard", "exile"];

/**
 * The commander whose owner is to be asked now, or null: one in a graveyard or in exile that nobody has asked about
 * since it got there, owned by a player still in the game. Several at once (a wrath) are asked in turn order from the
 * active player, the order CR 101.4 gives simultaneous choices.
 */
export function commanderToAsk(state) {
  const count = state.players.length;
  for (let step = 0; step < count; step += 1) {
    const owner = ((state.activePlayer ?? 0) + step) % count;
    if (state.players[owner].lost) continue;
    for (const zone of RECOVERABLE) {
      const ids = zone === "exile" ? state.zones.exile.filter((id) => state.objects[id].owner === owner) : cardsIn(state, zone, owner);
      const id = ids.find((at) => state.objects[at].commander === true && state.objects[at].commanderAsked !== true);
      if (id !== undefined) return {kind: "commander-replacement", player: owner, objectId: id, name: state.objects[id].card, from: zone};
    }
  }
  return null;
}

/** The choice (§12.1). A yes or no, asked of the OWNER. */
export function commanderChoice(state, awaiting) {
  const name = awaiting.name ?? "your commander";
  return {
    id: `commander-zone:${state.turn}:${awaiting.objectId}`,
    title: `Put ${name} into the command zone?`,
    mode: "boolean",
    min: 1,
    max: 1,
    options: [
      {index: 0, label: "Put it into the command zone"},
      {index: 1, label: awaiting.from === "exile" ? "Leave it in exile" : "Leave it in your graveyard"},
    ],
  };
}

/**
 * Apply the answer: true when the commander is to go to the command zone. A no is remembered on the object, so its
 * owner is not asked again while it stays where it is.
 *
 * The caller does the moving, because the caller is the one that knows what event to report — this
 * module decides only whether.
 */
export function resolveCommanderChoice(state, awaiting, indices) {
  if (!Array.isArray(indices) || indices.length !== 1) throw new Error("Answer yes or no");
  const toCommandZone = indices[0] === 0;
  state.awaiting = null;
  if (!toCommandZone && state.objects[awaiting.objectId]) state.objects[awaiting.objectId].commanderAsked = true;
  return toCommandZone;
}
