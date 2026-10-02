/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A CONDITION ON AN ABILITY (M4 phase 3, batch 11: the catalog's next missing option, "a permanent present").
 *
 * Two rules use the same words and differ in when they are asked:
 *
 *   "ACTIVATE ONLY IF you control a Swamp" (CR 602.5b): a restriction on activating -- asked as the ability would be
 *   offered, so an ability whose condition is false is simply not among the things its controller may do.
 *
 *   "When this enters, IF you control a creature with power 4 or greater, draw a card" -- an intervening "if" (CR
 *   603.4): asked as the event happens (false, and the ability does not trigger at all) AND again as it resolves (false
 *   then, and it does nothing). Asking only once is the usual mistake: a Colossal Majesty whose big creature died in
 *   response still drew.
 *
 * A condition is data, one of:
 *   {present: selector, atLeast?: n}   at least n permanents (1 if unsaid) match the selector -- "you control a Swamp",
 *                                      "a creature with power 4 or greater", "this artifact is untapped"
 *                                      ({self: true, tapped: false}); a choice of selectors with `anyOf`
 *   {handEmpty: true|false}            its controller's hand is empty, or is not
 *   {notTheirTurn: true}               "if it isn't that player's turn": the player the trigger is about is not the
 *                                      active player (Tataru Taru)
 *
 * The keys are closed, like every other grammar here: an unknown one is refused at the schema rather than read as true.
 */

import {cardsIn} from "../state/index.mjs";
import {matchesSelector, compileSelector} from "./filter.mjs";

const CONDITION_KEYS = ["present", "atLeast", "atMost", "handEmpty", "notTheirTurn", "firstCombat", "graveyardTypes"];

/** Whether a condition holds now, for an ability controlled by `controller` on object `source`. No condition holds. */
export function conditionHolds(state, condition, {controller, source = null, about = undefined} = {}) {
  if (!condition) return true;
  if (condition.notTheirTurn === true && (about?.player === undefined || about.player === state.activePlayer)) return false;
  if (condition.handEmpty === true && cardsIn(state, "hand", controller).length > 0) return false;
  if (condition.handEmpty === false && cardsIn(state, "hand", controller).length === 0) return false;
  /* How many permanents the selector finds now (Forge's PresentCompare): at least `atLeast` ("five or more lands", one
     when it says nothing), at most `atMost` ("if you control no Snakes": none). */
  if (condition.present) {
    const n = state.zones.battlefield.filter((id) => matchesSelector(condition.present, state, id, {controller, source})).length;
    if (n < (condition.atLeast ?? (condition.atMost !== undefined ? 0 : 1))) return false;
    if (condition.atMost !== undefined && n > condition.atMost) return false;
  }
  /* "If it's the first combat phase of the turn" (Genji Glove; rules/turn.mjs counts them). */
  if (condition.firstCombat === true && (state.combatsThisTurn ?? 0) > 1) return false;
  /* Delirium: "if there are four or more card types among cards in your graveyard" (CR 205.2a). */
  if (Number.isInteger(condition.graveyardTypes)) {
    const types = new Set(cardsIn(state, "graveyard", controller).flatMap((id) => (state.objects[id].types ?? []).filter((t) => CARD_TYPES.includes(t))));
    if (types.size < condition.graveyardTypes) return false;
  }
  return true;
}
/* The card types (CR 205.2a): what delirium counts. */
const CARD_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Instant", "Kindred", "Land", "Planeswalker", "Sorcery"];

/** Every problem with a condition, for the schema (script/schema.mjs). */
export function conditionProblems(condition) {
  if (condition === undefined) return [];
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return ["A condition is an object: {present: selector} or {handEmpty: true}"];
  const problems = [];
  for (const key of Object.keys(condition)) if (!CONDITION_KEYS.includes(key)) problems.push(`A condition has no key ${JSON.stringify(key)}; it has ${CONDITION_KEYS.join(", ")}`);
  if ("atLeast" in condition && !(Number.isInteger(condition.atLeast) && condition.atLeast >= 1)) problems.push("A condition's atLeast is a whole number, 1 or more");
  if ("atMost" in condition && !(Number.isInteger(condition.atMost) && condition.atMost >= 0)) problems.push("A condition's atMost is a whole number, 0 or more");
  if (("atLeast" in condition || "atMost" in condition) && !("present" in condition)) problems.push("atLeast and atMost count what `present` describes");
  if ("handEmpty" in condition && typeof condition.handEmpty !== "boolean") problems.push("handEmpty is true or false");
  if ("notTheirTurn" in condition && condition.notTheirTurn !== true) problems.push("notTheirTurn is true");
  if ("firstCombat" in condition && condition.firstCombat !== true) problems.push("firstCombat is true");
  if ("graveyardTypes" in condition && !(Number.isInteger(condition.graveyardTypes) && condition.graveyardTypes >= 1)) problems.push("graveyardTypes is a whole number of card types, 1 or more");
  if ("present" in condition) {
    const {anyOf, ...shared} = condition.present ?? {};
    try { for (const one of Array.isArray(anyOf) ? anyOf.map((a) => ({...shared, ...a})) : [condition.present]) compileSelector(one); }
    catch (error) { problems.push(`What a condition looks for: ${error.message}`); }
  }
  return problems;
}
