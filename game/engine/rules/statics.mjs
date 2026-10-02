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

import {conditionHolds} from "../script/condition.mjs";
import {staticAffects, powerOf, toughnessOf} from "./layers.mjs";
import {compileSelector, matchesSelector} from "../script/filter.mjs";
import {amountOf} from "../script/amount.mjs";
import {usesThisTurn} from "../state/index.mjs";
import {parseManaCost, manaValue} from "./mana.mjs";

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
      library" (Korlessa): `zone` "graveyard" or "library-top"; "once during each of your turns" (Kess) `yourTurn` and
      `limit`; "if a spell cast this way would be put into your graveyard, exile it instead" `graveyardToExile`; `lands`
      and `spells` (a selector of the spells, or true for any). For the static's controller; rules/actions.mjs offers
      them. */
  "play-from": "rules/actions.mjs",
  /** "You may cast spells as though they had flash" (Vedalken Orrery), "artifact spells" (Shimmer Myr), "Aura and
      Equipment spells" (Sigarda's Aid): `spells` true or a selector of the spell, for the static's controller (CR 702.8a
      by permission). rules/actions.mjs, flashGranted. */
  "cast-as-though-flash": "rules/actions.mjs",
  /** "You may look at the top card of your library any time": its owner sees it (projection.mjs). */
  "look-at-top": "projection.mjs",
  /** "Play with the top card of your library revealed": everyone sees it (projection.mjs). */
  "top-revealed": "projection.mjs",
  /** "You may play an additional land on each of your turns" (CR 305.2): one more land drop. rules/actions.mjs. */
  "extra-land-drop": "rules/actions.mjs",
  /** "You may cast this card from your graveyard or from exile" (Squee): the card's own, read where it is. rules/actions.mjs. */
  "cast-self-from": "rules/actions.mjs",
  /** Flashback (CR 702.34a): the card's own, from its keyword and cost (cards/index.mjs), or given until end of turn
      (Past in Flames: effectUntil, its cards fixed as it resolves, their mana costs the cost). rules/actions.mjs offers
      the cast from its owner's graveyard; rules/stack.mjs and effects/zones.mjs exile it as it leaves the stack. */
  "flashback": "rules/actions.mjs",
  /** "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability
      triggers an additional time" (Panharmonicon, CR 603.2d): `affects` whose abilities, `cause` {event: enters, dies or
      attacks, filter} what caused it, if the card says. rules/trigger.mjs, as triggers are collected. */
  "triggers-again": "rules/trigger.mjs",
  /** CR 118.9, the card's own: "you may pay 1 life and exile a blue card from your hand rather than pay this spell's mana
      cost" -- `condition` ("if you control a commander"), `cost` atoms (mana or none, payLife, exileFromHand, sacrifice).
      rules/actions.mjs offers it beside the paid cast. */
  "alternative-cost": "rules/actions.mjs",
  /** "Target creature with defender can attack this turn as though it didn't have defender" (Assault Formation, Walking
      Bulwark; CR 702.3b): combat.mjs, as attackers are offered. */
  "attacks-despite-defender": "rules/combat.mjs",
  /** "Prevent all damage that would be dealt to [them] this turn": an effect with a duration only (effectUntil), with
      `apply` {to, by, combat}; rules/replacement.mjs. */
  "prevent-damage": "rules/replacement.mjs",
  /** CR 509.1b: "Slivers can't be blocked except by Slivers", "can't be blocked by creatures with power 2 or less" (`by`, the
      blockers it can't be blocked by), "creatures with power less than this creature's power can't block creatures you
      control" (`byPowerBelowSource`). keywords/combat.mjs, as each blocker is checked. */
  "cant-be-blocked-by": "keywords/combat.mjs",
  /** "This spell can't be countered" (the spell's own, read while it is on the stack, `affects: {what: "spell", self: true}`)
      and "creature spells you control can't be countered" (a permanent's, over spells): a counter effect does nothing to
      such a spell (CR 101.2: "can't" beats "can"). script/effects/zones.mjs, counterSpell. */
  "cant-be-countered": "script/effects/zones.mjs",
  /** "You may cast spells from your hand without paying their mana costs" (Omniscience), "Dragon spells" (Dracogenesis),
      "once each turn, you may pay {0} rather than pay the mana cost for a colorless spell you cast from your hand"
      (Darksteel Monolith): an alternative cost of nothing (CR 118.9; additional costs, the commander tax included, are
      still paid). `affects` the spells, `zones` where they are cast from, `limit` how often each turn, and
      `manaValueAtMost` a counted cap (As Foretold's time counters). rules/actions.mjs. */
  "cast-without-paying": "rules/actions.mjs",
});

/**
 * The static ability that lets this player cast this card without paying its mana cost now, if any: `{source,
 * abilityId, limited}` -- `limited` when it may be used only so often each turn (its uses counted on its source,
 * state/index.mjs). The first that applies; null when none does.
 */
export function freeCast(state, player, cardId) {
  const object = state.objects[cardId];
  if (!object) return null;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    if (holder.controller !== player) continue;
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "cast-without-paying") continue;
      if (ability.zones && !ability.zones.includes(object.zone)) continue;
      if (!matchesSelector({...(ability.affects ?? {}), what: "card", zone: object.zone}, state, cardId, {controller: holder.controller, source: holderId})) continue;
      if (ability.manaValueAtMost !== undefined) {
        const cap = amountOf(state, ability.manaValueAtMost, {controller: holder.controller, source: holderId});
        if (manaValue(parseManaCost(object.manaCost ?? "")) > cap) continue;
      }
      if (ability.limit && usesThisTurn(state, holderId, `free:${ability.id}`) >= ability.limit) continue;
      return {source: holderId, abilityId: ability.id, limited: Boolean(ability.limit)};
    }
  }
  return null;
}

/** Whether this spell can't be countered: its own "this spell can't be countered", or a permanent's static ability over it. */
export function cantBeCountered(state, spellId) {
  const spell = state.objects[spellId];
  if (!spell) return false;
  for (const ability of spell.abilities ?? []) {
    if (ability.kind === "static" && ability.rule === "cant-be-countered" && ability.affects?.self === true) return true;
  }
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "cant-be-countered") continue;
      if (matchesSelector(ability.affects, state, spellId, {controller: holder.controller, source: holderId})) return true;
    }
  }
  return false;
}

/**
 * Whether this blocker is one a static ability says can't block this attacker (CR 509.1b, "cant-be-blocked-by"): the
 * attacker is one the ability affects, and the blocker is one its `by` describes -- or, for `byPowerBelowSource`, has
 * less power than the ability's source. "You" is the ability's controller throughout.
 */
export function cantBeBlockedBy(state, attackerId, blockerId) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "cant-be-blocked-by") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!matchesSelector(ability.affects, state, attackerId, context)) continue;
      if (ability.by && matchesSelector(ability.by, state, blockerId, context)) return true;
      if (ability.byPowerBelowSource === true && powerOf(state, blockerId) < powerOf(state, holderId)) return true;
    }
  }
  return false;
}

/** Whether a permanent of this player's lets them cast this card as though it had flash (`cast-as-though-flash`). */
export function flashGranted(state, player, id) {
  const object = state.objects[id];
  if (!object) return false;
  return playerStatics(state, "cast-as-though-flash", player).some(({ability, source}) => ability.spells === true
    || (ability.spells && typeof ability.spells === "object" && matchesSelector({...ability.spells, what: "card", zone: object.zone}, state, id, {controller: player, source})));
}

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
      /* "During your turn, spells you cast cost {1} less for each creature you control with power 4 or greater" (Temur
         Battlecrier): its condition, and its amount counted now. */
      if (!conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId})) continue;
      total += amountOf(state, ability.amount ?? 1, {controller: holder.controller, source: holderId});
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
