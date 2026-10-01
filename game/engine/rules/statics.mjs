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
import {compileSelector, matchesSelector} from "../script/filter.mjs";
import {amountOf} from "../script/amount.mjs";

/** Every rule a static ability may change, with the module that reads it. */
export const STATIC_RULES = Object.freeze({
  /** CR 510.1a's exception: assigns combat damage equal to its toughness rather than its power. combat.mjs. */
  "combat-damage-by-toughness": "rules/combat.mjs",
  /** CR 402.2's exception: "You have no maximum hand size" (Reliquary Tower, Thought Vessel). turn.mjs, at cleanup. */
  "no-maximum-hand-size": "rules/turn.mjs",
  /** CR 601.2f: "Artifact spells you cast cost {1} less to cast" (the Medallions, Foundry Inspector). actions.mjs. */
  "spells-cost-less": "rules/actions.mjs",
  /** CR 601.2f, the card's own: "This spell costs {1} less to cast for each creature on the battlefield" (Vanquish the
      Horde), "{X} less, where X is the total power of creatures you control" (Ghalta). Read from the card wherever it
      is cast from, by actions.mjs through costReduction; its `amount` may be counted (script/amount.mjs). */
  "this-costs-less": "rules/actions.mjs",
  /** CR 509.1b: "Target creature can't be blocked this turn" (Rogue's Passage), "creatures with power 2 or less can't be
      blocked". keywords/combat.mjs, as each blocker is checked. */
  "cant-be-blocked": "keywords/combat.mjs",
  /** "You may play lands from your graveyard" (Crucible of Worlds), "you may cast Dragon spells from the top of your
      library" (Korlessa): `zone` "graveyard" or "library-top", `lands` and `spells` (a selector of the spells, or
      true for any). For the static's controller; rules/actions.mjs offers them. */
  "play-from": "rules/actions.mjs",
  /** "You may look at the top card of your library any time": its owner sees it (projection.mjs). */
  "look-at-top": "projection.mjs",
  /** "Play with the top card of your library revealed": everyone sees it (projection.mjs). */
  "top-revealed": "projection.mjs",
  /** "You may play an additional land on each of your turns" (CR 305.2): one more land drop. rules/actions.mjs. */
  "extra-land-drop": "rules/actions.mjs",
  /** "You may cast this card from your graveyard or from exile" (Squee): the card's own, read where it is. rules/actions.mjs. */
  "cast-self-from": "rules/actions.mjs",
  /** "Target creature with defender can attack this turn as though it didn't have defender" (Assault Formation, Walking
      Bulwark; CR 702.3b): combat.mjs, as attackers are offered. */
  "attacks-despite-defender": "rules/combat.mjs",
  /** "Prevent all damage that would be dealt to [them] this turn": an effect with a duration only (effectUntil), with
      `apply` {to, by, combat}; rules/replacement.mjs. */
  "prevent-damage": "rules/replacement.mjs",
});

/** The "play-from" and similar static abilities a player's permanents give them: each such ability, with its source. */
export function playerStatics(state, rule, player) {
  const found = [];
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    if (holder.controller !== player) continue;
    for (const ability of holder.abilities ?? []) if (ability.kind === "static" && ability.rule === rule) found.push({ability, source: holderId});
  }
  return found;
}

/**
 * HOW MUCH LESS A SPELL COSTS (CR 601.2f). Every "spells cost {N} less" static ability on the battlefield whose spell
 * selector (`affects`) fits this card, cast by whom it says (`caster`: you, the default, opponent, or any): the
 * generic mana it takes off, summed. The selector is read against the card where it is being cast from, so "a red
 * spell" finds the red card in a hand or a command zone.
 */
export function costReduction(state, player, cardId) {
  const object = state.objects[cardId];
  if (!object) return 0;
  let total = 0;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "spells-cost-less") continue;
      const caster = ability.caster ?? "you";
      if (caster === "you" && player !== holder.controller) continue;
      if (caster === "opponent" && player === holder.controller) continue;
      const selector = {...(ability.affects ?? {}), what: "card", zone: object.zone};
      if (!matchesSelector(selector, state, cardId, {controller: holder.controller, source: holderId})) continue;
      total += ability.amount ?? 1;
    }
  }
  for (const ability of object.abilities ?? [])
    if (ability.kind === "static" && ability.rule === "this-costs-less") total += amountOf(state, ability.amount ?? 1, {controller: player, source: cardId});
  return total;
}

/**
 * Whether any static ability on the battlefield changes `rule` for this PLAYER: one whose `affects` is a player
 * selector, "you" being the ability's controller.
 */
export function playerRuleChanged(state, rule, player) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== rule || ability.affects?.what !== "player") continue;
      if (compileSelector(ability.affects)(state, player, {controller: holder.controller, source: holderId})) return true;
    }
  }
  return false;
}

/** Whether any static ability on the battlefield -- or an effect with a duration ("can't be blocked this turn") -- changes `rule` for this object. */
export function ruleChanged(state, rule, id) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== rule) continue;
      /* The whole selector grammar ("creatures you control with power 2 or less"): a rule changes nothing a layer
         derives, so reading it through the layers cannot loop, as the layers' own narrower matcher has to avoid. */
      if (matchesSelector(ability.affects, state, id, {controller: holder.controller, source: holderId})) return true;
    }
  }
  for (const effect of state.effects ?? []) {
    if (effect.rule === rule && staticAffects(state, effect, id, effect.sourceController)) return true;
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
