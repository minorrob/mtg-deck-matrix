/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* STATIC ABILITIES THAT CHANGE A RULE, NOT A CHARACTERISTIC.
 *
 * `docs/engine/PLAN.md` §3.1 and §6's phase 2. Most static abilities are continuous effects that change what an
 * object IS -- its power, its types, its abilities -- and `layers.mjs` applies them in the order CR 613 gives. Some
 * change what a RULE does instead: "each creature assigns combat damage equal to its toughness rather than its
 * power" (Doran, the Siege Tower) leaves every creature exactly as it was and changes CR 510.1a. No layer orders
 * that, so a script states it as a `rule` from the closed list below rather than a `layer`, and the module that owns
 * the rule asks here whether it is changed for an object.
 *
 * THE LIST IS CLOSED, like the primitives (`script/schema.mjs` refuses any other name): a rule nothing reads would
 * be a card that validates and then does nothing. Each entry names the module that consults it.
 *
 * "WHAT IT AFFECTS" IS THE SAME SHAPE AS A CONTINUOUS EFFECT'S (`affects`), read through `layers.mjs` against the
 * object as it currently is, with "you" meaning the static ability's controller.
 */

import {staticAffects, powerOf, toughnessOf} from "./layers.mjs";

/** Every rule a static ability may change, with the module that reads it. */
export const STATIC_RULES = Object.freeze({
  /** CR 510.1a's exception: assigns combat damage equal to its toughness rather than its power. combat.mjs. */
  "combat-damage-by-toughness": "rules/combat.mjs",
});

/** Whether any static ability on the battlefield changes `rule` for this object. */
export function ruleChanged(state, rule, id) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== rule) continue;
      if (staticAffects(state, ability, id, holder.controller)) return true;
    }
  }
  return false;
}

/**
 * How much combat damage this creature assigns (CR 510.1a): its power, or its toughness when a static ability says
 * so. Every place combat reads an amount -- the unblocked hit, the blocker's, the assignment total, trample's
 * excess -- reads it here, so the four cannot disagree.
 */
export const combatDamageOf = (state, id) =>
  (ruleChanged(state, "combat-damage-by-toughness", id) ? toughnessOf(state, id) : powerOf(state, id));
