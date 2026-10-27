/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ITS OWN CHAINS: PLAYING TOWARD THE DECK'S ENGINE (docs/ai-players/PLAN-2026-10-26.html §5; Rob's "the deck's formulas", L2 lite).
 *
 * Rob, 2026-10-26: Hard "know[s] the chains that exist within their deck and seek[s] to play towards the higher compounding,
 * faster resolution options than easy or normal. Easy focuses more on the turn at hand versus the game at large. Normal
 * thinks about the game at large and about its engine ... but it weights them much lower than on hard."
 *
 * A seat knows its own deck list (its player does). Its engine links are the cards in it whose role flags (roles.mjs) are a doubler,
 * draw, token, untap, recursion or copy engine. A cast that is a link is worth more than the mana it spends: `bonus` below,
 *
 *   CHAIN[setting] x (1 + LINK_BOARD x links already on my board) x min(1, links in my deck / DENSE)
 *
 * -- the chain pays more with a link already down, and more when the deck is built round them. Easy reads none. Normal credits a
 * chain only once a link is on the board, and lightly; Hard from the first card, and heavily. At Hard a hand with a link and
 * two lands keeps at lower odds (`KEEP_EDGE`): the engine is the reason to keep it.
 */
import {isLink} from "./roles.mjs";

export const CHAIN = Object.freeze({easy: 0, normal: 0.5, hard: 1.5});
export const LINK_BOARD = 0.5;
export const DENSE = 6;
export const KEEP_EDGE = 0.15;

/** How many cards of this deck list are engine links. */
export const linksIn = (names, facts) => names.reduce((n, name) => n + (isLink(facts(name)?.flags) ? 1 : 0), 0);

/** The extra a cast of `flags` is worth beyond its mana: 0 for a card that is no link. */
export function bonus({setting, flags, boardLinks, deckLinks}) {
  const weight = CHAIN[setting] ?? 0;
  if (!weight || !isLink(flags)) return 0;
  if (setting === "normal" && boardLinks < 1) return 0;     // Normal credits a chain only once a link is down
  return weight * (1 + LINK_BOARD * boardLinks) * Math.min(1, deckLinks / DENSE);
}

/** How much lower the keep threshold is for a hand that holds a link, at Hard. */
export const keepEdge = ({setting, handFlags, lands}) => (setting === "hard" && lands >= 2 && handFlags.some(isLink) ? KEEP_EDGE : 0);
