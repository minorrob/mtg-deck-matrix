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
 *
 * The keys are closed, like every other grammar here: an unknown one is refused at the schema rather than read as true.
 */

import {cardsIn} from "../state/index.mjs";
import {matchesSelector, compileSelector} from "./filter.mjs";

const CONDITION_KEYS = ["present", "atLeast", "handEmpty"];

/** Whether a condition holds now, for an ability controlled by `controller` on object `source`. No condition holds. */
export function conditionHolds(state, condition, {controller, source = null} = {}) {
  if (!condition) return true;
  if (condition.handEmpty === true && cardsIn(state, "hand", controller).length > 0) return false;
  if (condition.handEmpty === false && cardsIn(state, "hand", controller).length === 0) return false;
  if (condition.present) {
    const n = state.zones.battlefield.filter((id) => matchesSelector(condition.present, state, id, {controller, source})).length;
    if (n < (condition.atLeast ?? 1)) return false;
  }
  return true;
}

/** Every problem with a condition, for the schema (script/schema.mjs). */
export function conditionProblems(condition) {
  if (condition === undefined) return [];
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return ["A condition is an object: {present: selector} or {handEmpty: true}"];
  const problems = [];
  for (const key of Object.keys(condition)) if (!CONDITION_KEYS.includes(key)) problems.push(`A condition has no key ${JSON.stringify(key)}; it has ${CONDITION_KEYS.join(", ")}`);
  if ("atLeast" in condition && !(Number.isInteger(condition.atLeast) && condition.atLeast >= 1)) problems.push("A condition's atLeast is a whole number, 1 or more");
  if ("handEmpty" in condition && typeof condition.handEmpty !== "boolean") problems.push("handEmpty is true or false");
  if ("present" in condition) {
    const {anyOf, ...shared} = condition.present ?? {};
    try { for (const one of Array.isArray(anyOf) ? anyOf.map((a) => ({...shared, ...a})) : [condition.present]) compileSelector(one); }
    catch (error) { problems.push(`What a condition looks for: ${error.message}`); }
  }
  return problems;
}
