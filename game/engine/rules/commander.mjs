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
 * THE COMMAND-ZONE REPLACEMENT IS A CHOICE, AND IT IS THE OWNER'S (CR 903.9a). "May" means the
 * engine asks. An engine that always returns a commander takes away a real decision: leaving it in
 * a graveyard is where a reanimation starts, and paying the tax again is not always what a player
 * wants. It is the OWNER who chooses, not whoever controlled it — a borrowed commander goes home.
 *
 * WHAT IS DEFERRED AND NAMED: partner and background (CR 702.124, 702.153) need the card script to
 * declare them, and the two-commander color identity is the union of both, which this file's
 * `colorIdentity` already composes correctly once there are two cards to hand it.
 */

import {COLORS} from "./mana.mjs";

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

/**
 * The extra generic mana this commander costs right now (CR 903.8).
 *
 * Two for each previous time it was cast FROM THE COMMAND ZONE — not for each time it was cast.
 */
export function commanderTax(state, player, objectId) {
  const casts = state.players[player].commanderCasts?.[objectId] ?? 0;
  return casts * TAX_PER_CAST;
}

/** Record a cast from the command zone, so the next one costs more. */
export function recordCommanderCast(state, player, objectId) {
  if (!state.players[player].commanderCasts) state.players[player].commanderCasts = {};
  const casts = state.players[player].commanderCasts;
  casts[objectId] = (casts[objectId] ?? 0) + 1;
}

/* ---- CR 903.9a, the command-zone replacement ---- */

/** The zones a commander may be pulled back from (CR 903.9a). */
const RECOVERABLE = ["graveyard", "exile", "hand", "library"];

/**
 * Whether this move is one the owner may redirect to the command zone.
 *
 * Asked BEFORE the move, like any replacement (CR 614.1): the commander never reaches the graveyard
 * at all, so nothing that watches graveyards sees it arrive and then leave.
 */
export function offersCommandZone(state, objectId, to) {
  const object = state.objects[objectId];
  return object?.commander === true && RECOVERABLE.includes(to);
}

/** The choice (§12.1). A yes or no, asked of the OWNER. */
export function commanderChoice(state, awaiting) {
  const name = awaiting.name ?? "your commander";
  return {
    id: `commander-zone:${state.turn}:${awaiting.objectId}`,
    title: `Put ${name} into the command zone instead?`,
    mode: "boolean",
    min: 1,
    max: 1,
    options: [
      {index: 0, label: "Put it into the command zone"},
      {index: 1, label: `Let it go to your ${awaiting.to}`},
    ],
  };
}

/**
 * Apply the answer. Returns the zone the card should actually go to.
 *
 * The caller does the moving, because the caller is the one that knows what event to report — this
 * module decides only where.
 */
export function resolveCommanderChoice(state, awaiting, indices) {
  if (!Array.isArray(indices) || indices.length !== 1) throw new Error("Answer yes or no");
  const toCommandZone = indices[0] === 0;
  state.awaiting = null;
  return toCommandZone ? "command" : awaiting.to;
}
