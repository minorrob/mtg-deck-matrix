/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE KEYWORDS THAT SAY WHAT AN OBJECT IS (M4 phase 3, batch 74).
 *
 * CHANGELING (CR 702.73a): "this object is every creature type" -- a characteristic-defining ability that works everywhere
 * (CR 604.3): a changeling card in a hand is an Elf card, a changeling creature is a Goblin a lord pumps and a Merfolk a
 * "Merfolk you control" counts. Every creature type, and only those (keywords/creature-types.mjs, read from the oracle
 * data): never a Forest, an Equipment or an Aura. Read wherever a subtype is asked for -- a selector's subtypes and
 * nonSubtypes and their last-known form (script/filter.mjs), a lord's `affects` (rules/layers.mjs), "shares a creature
 * type" -- through `everyCreatureType` as the layers derive it: the printed keyword, or an effect that gives "all creature
 * types" (Mirror Entity), a type change in layer 4 (CR 613.1d) that a lord in layer 7 then sees.
 *
 * DEVOID (CR 702.114a, batch 77): "this object is colorless" -- a characteristic-defining ability in every zone. The card's
 * colors are none, as its identity says (the oracle data agrees, and the card compiler holds a devoid card to it), so
 * every reader of colors -- a selector's `colors` and `colorless`, the layers' color changes after it -- sees none.
 */
import {CREATURE_TYPES} from "./creature-types.mjs";

/** The family of §3.1, so `engine-coverage` counts these as behavior and not as words. */
export const KEYWORD_FAMILIES = Object.freeze({
  /** What it is: every creature type. */
  types: Object.freeze(["Changeling"]),
  /** What color it is: none. */
  colors: Object.freeze(["Devoid"]),
});

const TYPES = new Set(CREATURE_TYPES);
/** Whether a subtype is a creature type. */
export const isCreatureType = (subtype) => TYPES.has(subtype);
/** Whether printed keywords make an object every creature type (rules/layers.mjs starts from this). */
export const everyCreatureType = (keywords) => (keywords ?? []).includes("Changeling");
/** Whether an object with these subtypes -- every creature type, or not -- has `subtype`. */
export const hasSubtype = (subtypes, every, subtype) => subtypes.includes(subtype) || (every === true && isCreatureType(subtype));
