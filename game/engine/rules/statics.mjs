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
import {compileSelector, matchesSelector, matchesLastKnown} from "../script/filter.mjs";
import {amountOf} from "../script/amount.mjs";
import {usesThisTurn} from "../state/index.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {parseManaCost, manaValue} from "./mana.mjs";

/** Every rule a static ability may change, with the module that reads it. */
export const STATIC_RULES = Object.freeze({
  /** CR 702.16: "you and creatures you control have protection from the chosen card type" (Serra's Emissary): `affects`,
      `players`, `from`. rules/protection.mjs. */
  "protection": "rules/protection.mjs",
  /** CR 614.1a, 122.6: "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1
      counters are put on that creature instead" (Branching Evolution): `affects` the permanent, `counter` the kind, `times`.
      Read wherever counters are put on a permanent, as it enters too (countersPlaced, below). */
  "more-counters": "rules/statics.mjs",
  /** CR 104.3: "You can't lose the game" (Darksteel Angel): its controller loses to no state-based action. rules/sba.mjs. */
  "cant-lose": "rules/sba.mjs",
  /** CR 104.2b: "Your opponents can't win the game" (Darksteel Angel): an effect that says they win does not. effects/resources.mjs, winGame. */
  "opponents-cant-win": "script/effects/resources.mjs",
  /** CR 903.3a: "Freyalise, Llanowar's Fury can be your commander" -- a rule of the deck, not of the game: the card's
      definition says `canBeCommander` (cards/index.mjs), and the table holds a deck's commander to it (room/table.mjs,
      commanderLegal). */
  "can-be-commander": "cards/index.mjs",
  /** CR 510.1a's exception: assigns combat damage equal to its toughness rather than its power. combat.mjs. */
  "combat-damage-by-toughness": "rules/combat.mjs",
  /** CR 402.2's exception: "You have no maximum hand size" (Reliquary Tower, Thought Vessel). turn.mjs, at cleanup. */
  "no-maximum-hand-size": "rules/turn.mjs",
  /** CR 601.2f: "Artifact spells you cast cost {1} less to cast" (the Medallions, Foundry Inspector). actions.mjs. */
  "spells-cost-less": "rules/actions.mjs",
  /** CR 601.2f: "Noncreature spells cost {1} more to cast" (Thalia), "spells your opponents cast cost {2} more" (God-
      Pharaoh's Statue): `caster` any (the default), you or opponent; `affects` the spell; `amount`. actions.mjs, castCost.
      "Spells that target this creature cost more" waits for a cost read with the targets chosen. */
  "spells-cost-more": "rules/actions.mjs",
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
  /** "This token crews Vehicles as though its power were 2 greater" (Shorikai's Pilot): `amount` added as it crews.
      rules/actions.mjs, crewChoices. */
  "crews-with-more": "rules/actions.mjs",
  /** Toxic N (CR 702.164a, batch 77): "players dealt combat damage by this creature also get N poison counters" -- the
      keyword compiled to this static with its number (cards/index.mjs), instances added together (702.164b). */
  "toxic": "rules/combat.mjs",
  /** "Untap all permanents you control during each other player's untap step" (Seedborn Muse), "all artifacts" (Unwinding
      Clock), "this artifact" (Bender's Waterskin): `affects` what it untaps, its controller's. rules/turn.mjs, untap. */
  "untap-during-others": "rules/turn.mjs",
  /** "You may look at the top card of your library any time": its owner sees it (projection.mjs). */
  "look-at-top": "projection.mjs",
  /** "Play with the top card of your library revealed": everyone sees it (projection.mjs). */
  "top-revealed": "projection.mjs",
  /** "You may play an additional land on each of your turns" (CR 305.2): one more land drop. rules/actions.mjs. */
  "extra-land-drop": "rules/actions.mjs",
  /** "Your opponents can't gain life" (Archfiend of Despair), "players can't gain life" (Rampaging Ferocidon; CR 119.7):
      the players `affects` names, from its controller's side. cantGainLife, read wherever life is gained: an effect's gain
      (script/effects/resources.mjs, changeLife) and lifelink in combat (rules/combat.mjs). */
  "cant-gain-life": "script/effects/resources.mjs",
  /** "Your opponents can't cast spells from anywhere other than their hands", "during your turn", "more than one spell each
      turn" (CantBeCast): castForbidden, read where a cast is offered. rules/actions.mjs. And for a while, by an effect
      (effectUntil): "can't cast spells with the same name as that creature until your next turn" (Reflector Mage). */
  "cant-cast": "rules/actions.mjs",
  /** "Creatures can't attack you unless their controller pays {2} for each" (CantAttackUnless): attackTax, paid as attackers
      are declared. rules/combat.mjs. */
  "attack-tax": "rules/combat.mjs",
  /** "This artifact doesn't untap during your untap step", "creatures with power 3 or greater don't untap during their
      controllers' untap steps": `affects` what stays tapped, read in the untap step (ruleChanged). rules/turn.mjs. */
  "doesnt-untap": "rules/turn.mjs",
  /** "Lands you control enter untapped" (Horizon Explorer): entersUntapped, as a land arrives. effects/zones.mjs. */
  "lands-enter-untapped": "script/effects/zones.mjs",
  /** "You may cast this card from your graveyard or from exile" (Squee): the card's own, read where it is. rules/actions.mjs. */
  "cast-self-from": "rules/actions.mjs",
  /** "You have hexproof" (Crystal Barricade; CR 702.11c): its controller can't be the target of spells or abilities their
      opponents control. script/filter.mjs, as a player is targeted. */
  "player-hexproof": "script/filter.mjs",
  /** A restriction on attacking (CR 508.1c): `affects`, `defender`, `unless` (cantAttack, below). rules/combat.mjs. */
  "cant-attack": "rules/combat.mjs",
  /** A restriction on blocking (CR 509.1b): "This token can't block" (White Sun's Twilight's Mites), "target creature
      can't block this turn" given until end of turn: `affects` what can't. rules/combat.mjs, canBlock. */
  "cant-block": "rules/combat.mjs",
  /** Flashback (CR 702.34a): the card's own, from its keyword and cost (cards/index.mjs), or given until end of turn
      (Past in Flames: effectUntil, its cards fixed as it resolves, their mana costs the cost). rules/actions.mjs offers
      the cast from its owner's graveyard; rules/stack.mjs and effects/zones.mjs exile it as it leaves the stack. */
  "flashback": "rules/actions.mjs",
  /** Escape (CR 702.138a): the card's own, from its keyword and cost (cards/index.mjs), or given by a permanent ("each
      nonland card in your graveyard has escape", Underworld Breach: `affects` which cards, `cost` the cards to exile, the
      mana each card's own mana cost). rules/actions.mjs offers the cast from its owner's graveyard and asks which cards to
      exile; rules/stack.mjs marks what escaped (702.138b). */
  "escape": "rules/actions.mjs",
  /** Storm (CR 702.40a): the keyword kept as this static, read as the spell is cast (cards/index.mjs; batch 77 names it
      here, where every rule a definition carries is named). */
  "storm": "rules/actions.mjs",
  /** Rebound (CR 702.88a): the keyword kept as this static (cards/index.mjs), read as the spell leaves the stack: cast from
      its owner's hand and resolved, it is exiled and may be cast free at its caster's next upkeep (Ephemerate). */
  "rebound": "rules/stack.mjs",
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
      `manaValueAtMost` a counted cap (As Foretold's time counters), and `condition` its own ("once during each of your
      turns", Zaffai and the Tempests: yourTurn, with a limit of one). rules/actions.mjs. */
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
      if (!conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId})) continue;
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

/**
 * "CAN'T CAST" (Forge's CantBeCast): whether a static ability on the battlefield forbids this player casting this card now.
 * `rule: "cant-cast"`, its `affects` the players it binds (a player selector: "your opponents", "each player"), its
 * `condition` its own ("as long as this Equipment is attached to a creature"), and what it forbids: `fromAnywhereButHand`
 * (Drannith Magistrate), `duringYourTurn` -- its controller's turn (Conqueror's Flail) -- or `moreThan` N spells each turn,
 * those fitting `filter` (Deafening Silence: noncreature; Archon of Emeria: any), counted from what the player has cast this
 * turn. Read where a cast is offered (rules/actions.mjs), a free cast as an effect resolves among them.
 */
export function castForbidden(state, player, cardId) {
  const object = state.objects[cardId];
  if (!object) return false;
  /* AN EFFECT WITH A DURATION (effects/permanents.mjs, effectUntil's `rule: "cant-cast"`): "that creature's owner can't cast
     spells with the same name as that creature until your next turn" (Reflector Mage) -- the players it names, and the
     spells `spells` describes (a name, CR 201.2a), from any zone they would be cast from. */
  for (const effect of state.effects ?? []) {
    if (effect.rule !== "cant-cast" || !(effect.players ?? []).includes(player)) continue;
    if (compileSelector({...(effect.spells ?? {}), what: "card", zone: object.zone})(state, cardId, {controller: effect.sourceController})) return true;
  }
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "cant-cast") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;
      if (!conditionHolds(state, ability.condition, context)) continue;
      if (ability.fromAnywhereButHand && object.zone !== "hand") return true;
      /* "Your opponents can't cast spells with even mana values" (Void Winnower): spells of a kind. */
      if (ability.spells && compileSelector({...ability.spells, what: "card", zone: object.zone})(state, cardId, context)) return true;
      if (ability.duringYourTurn && state.activePlayer === holder.controller) return true;
      if (Number.isInteger(ability.moreThan)) {
        const {what: _ignored, ...shape} = ability.filter ?? {};
        const fits = (cast) => matchesLastKnown(shape, {...cast, controller: player}, {controller: player});
        const already = (state.players[player].castThisTurn ?? []).filter(fits).length;
        if (already >= ability.moreThan && fits({types: object.types ?? [], colors: object.colors ?? []})) return true;
      }
    }
  }
  return false;
}

/**
 * WHETHER A PLAYER CAN'T GAIN LIFE (CR 119.7): a permanent's "your opponents can't gain life" or "players can't gain life",
 * whose `affects` names this player from its controller's side. Effects that would have them gain life don't, lifelink
 * gains them nothing (702.15b), and no life is gained to be seen ("whenever you gain life").
 */
export function cantGainLife(state, player) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "cant-gain-life") continue;
      const context = {controller: holder.controller, source: holderId};
      if (compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context) && conditionHolds(state, ability.condition, context)) return true;
    }
  }
  return false;
}

/**
 * HOW MANY COUNTERS ARE PUT ON, after "twice that many ... instead" (`more-counters`; CR 614.1a): each such static over
 * this permanent and this kind multiplies them. Only multiplying is built, so their order does not change the result
 * and nobody need be asked (CR 616.1 asks when it would). A permanent entering with counters is read as it has entered.
 */
export function countersPlaced(state, id, kind, count) {
  if (!(count > 0) || !state.objects[id]) return count;
  let n = count;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "more-counters" || (ability.counter && ability.counter !== kind)) continue;
      if (!matchesSelector({what: "permanent", ...ability.affects}, state, id, {controller: holder.controller, source: holderId})) continue;
      /* "Can't have -1/-1 counters put on them" (Darksteel Angel): `times` 0, none at all. */
      n *= Number.isInteger(ability.times) && ability.times >= 0 ? ability.times : 2;
    }
  }
  return n;
}

/** Who has goaded this creature (CR 701.15; effects/permanents.mjs goad), each until their next turn. */
/**
 * A RESTRICTION ON ATTACKING (CR 508.1c; Forge's CantAttack): "Inklings can't attack you or planeswalkers you control"
 * (Combat Calligrapher), "creatures with flying can't attack you" (Sandwurm Convergence), "this creature can't attack a
 * player it has already attacked this turn" (Port Razer). A static `cant-attack` on a permanent: `affects` the creatures,
 * read as they are now, "you" its controller; `defender` whom they can't attack -- "you" (its controller), "owner" (the
 * attacker's owner), "attacked" (a player that creature has already attacked this turn) -- or no one at all, unsaid;
 * `unless` a condition under which it does not apply ("unless you control seven or more lands"), "you" its controller.
 * `planeswalker`: the one attacked, when it is one `defender` controls (CR 506.3) -- attacking it is not attacking that
 * player, so only a restriction on attacking anyone, or one that says "or planeswalkers you control" (`planeswalkers`),
 * keeps a creature from it.
 */
export function cantAttack(state, attacker, defender, planeswalker = null) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "cant-attack") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!matchesSelector({what: "permanent", ...ability.affects}, state, attacker, context)) continue;
      if (planeswalker !== null && ability.defender !== undefined && !(ability.defender === "you" && ability.planeswalkers === true)) continue;
      if (ability.defender === "you" && defender !== holder.controller) continue;
      if (ability.defender === "owner" && defender !== state.objects[attacker]?.owner) continue;
      if (ability.defender === "attacked" && usesThisTurn(state, attacker, `attacked:${defender}`) === 0) continue;
      if (ability.unless && conditionHolds(state, ability.unless, context)) continue;
      return true;
    }
  }
  /* "Target creature can't attack or block this turn" (Endbringer): a restriction an effect left until it ends
     (effectUntil's `rule: "cant-attack"`), on the creatures fixed as it resolved -- attacking anyone. */
  for (const effect of state.effects ?? []) {
    if (effect.rule !== "cant-attack" || !staticAffects(state, effect, attacker, effect.sourceController)) continue;
    /* "Can't attack Jaces you control" (`toward`): only a planeswalker it describes, "you" the effect's controller -- never
       a player (no planeswalker, and no match). */
    if (effect.toward && !(matchesSelector({what: "permanent", ...effect.toward}, state, planeswalker, {controller: effect.sourceController}))) continue;
    return true;
  }
  return false;
}
/** The words `defender` may say on a `cant-attack` static. */
export const CANT_ATTACK_DEFENDERS = Object.freeze(["you", "owner", "attacked"]);

/** "Attacks that opponent this turn if able" (encore, CR 702.141a; effects/permanents.mjs): the players this creature is
 * required to attack this turn (CR 508.1d). rules/combat.mjs asks only those it could attack now. */
export function mustAttackOf(state, id) {
  return [...new Set((state.effects ?? []).filter((e) => e.rule === "must-attack" && e.affects?.ids?.includes(id)).map((e) => e.defender))];
}

export function goadersOf(state, id) {
  return [...new Set((state.effects ?? []).filter((e) => e.rule === "goaded" && e.affects.ids.includes(id)).map((e) => e.sourceController))];
}

/**
 * "CREATURES CAN'T ATTACK YOU UNLESS THEIR CONTROLLER PAYS {2} FOR EACH" (Propaganda; Forge's CantAttackUnless; CR 508.1g):
 * what these attackers cost their controller, from each defending player's `attack-tax` statics -- `amount` for each
 * creature attacking that player ("{X} ... where X is the number of enchantments you control": an amount, counted now).
 * One attacking a planeswalker of theirs is not attacking them: only "you or planeswalkers you control" (`planeswalkers`,
 * Baird) taxes it.
 */
export function attackTax(state, picked) {
  let total = 0;
  for (const {defenderId, planeswalkerId} of picked) for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    if (holder.controller !== defenderId) continue;
    for (const ability of holder.abilities ?? []) if (ability.kind === "static" && ability.rule === "attack-tax" && (planeswalkerId === undefined || ability.planeswalkers === true)
      /* "As long as you have an enduring story, creatures can't attack you unless ..." (Dain): only while it holds. */
      && conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId}))
      total += amountOf(state, ability.amount ?? 0, {controller: holder.controller, source: holderId});
  }
  return total;
}

/** "Lands you control enter untapped" (Horizon Explorer; `rule: "lands-enter-untapped"`): this land, its controller's. */
export const entersUntapped = (state, id) => (state.objects[id]?.types ?? []).includes("Land") && playerStatics(state, "lands-enter-untapped", state.objects[id].controller).length > 0;

/** Whether this spell can't be countered: its own "this spell can't be countered", or a permanent's static ability over it. */
export function cantBeCountered(state, spellId) {
  const spell = state.objects[spellId];
  if (!spell) return false;
  /* "And that spell can't be countered" (Cavern of Souls): paid with mana that said so (rules/restricted-mana.mjs). */
  if (state.stack.some((entry) => entry.objectId === spellId && entry.uncounterable === true)) return true;
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

/** Whether a permanent untaps in another player's untap step: a static of its controller's says so (`untap-during-others`). */
export function untapsDuringOthers(state, id) {
  const object = state.objects[id];
  if (!object || object.controller === state.activePlayer) return false;
  return playerStatics(state, "untap-during-others", object.controller)
    .some(({ability, source}) => matchesSelector({what: "permanent", ...(ability.affects ?? {}), controller: "you"}, state, id, {controller: object.controller, source}));
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
    for (const ability of holder.abilities ?? []) if (ability.kind === "static" && ability.rule === rule) found.push({ability: chosenFor(ability, holder), source: holderId});
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
  /* EMINENCE (The Ur-Sphinx): "as long as this is in the command zone or on the battlefield" -- an ability that works from
     its owner's command zone too (`eminence`, CR 113.6), its controller there its owner. */
  const commanding = (state.zones.command ?? []).flat().filter((id) => (state.objects[id]?.abilities ?? []).some((a) => a.eminence === true));
  for (const holderId of [...state.zones.battlefield, ...commanding]) {
    const holder = state.objects[holderId];
    const fromCommand = holder.zone === "command";
    for (const own of holder.abilities ?? []) {
      if (own.kind !== "static" || own.rule !== "spells-cost-less") continue;
      if (fromCommand && own.eminence !== true) continue;
      /* "Creature spells of the chosen type cost {2} less" (Urza's Incubator): its own choice. */
      const ability = chosenFor(own, holder);
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

/** HOW MUCH MORE A SPELL COSTS (CR 601.2f): every `spells-cost-more` static on the battlefield whose spell selector fits
 *  this card, cast by whom it says -- anyone, unless it says you or an opponent. Generic mana, summed. */
export function costIncrease(state, player, cardId) {
  const object = state.objects[cardId];
  if (!object) return 0;
  let total = 0;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const own of holder.abilities ?? []) {
      if (own.kind !== "static" || own.rule !== "spells-cost-more") continue;
      const ability = chosenFor(own, holder);
      const caster = ability.caster ?? "any";
      if (caster === "you" && player !== holder.controller) continue;
      if (caster === "opponent" && player === holder.controller) continue;
      if (!matchesSelector({...(ability.affects ?? {}), what: "card", zone: object.zone}, state, cardId, {controller: holder.controller, source: holderId})) continue;
      total += amountOf(state, ability.amount ?? 1, {controller: holder.controller, source: holderId});
    }
  }
  /* And for a while (effects/permanents.mjs, effectUntil): "noncreature spells your opponents cast cost {2} more to cast
     until your next turn" (Elspeth Conquers Death, batch 79) -- the caster and the amount in what it applies, whose
     "you" is the effect's controller. It changes a rule, not a characteristic, so a spell cast after it resolved is
     under it too (CR 611.2c): its spell selector is read at each cast, never fixed. */
  for (const effect of state.effects ?? []) {
    if (effect.rule !== "spells-cost-more") continue;
    const caster = effect.apply?.caster ?? "any";
    if (caster === "you" && player !== effect.sourceController) continue;
    if (caster === "opponent" && player === effect.sourceController) continue;
    if (!matchesSelector({...(effect.affects ?? {}), what: "card", zone: object.zone}, state, cardId, {controller: effect.sourceController, source: null})) continue;
    total += effect.apply?.amount ?? 1;
  }
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
      /* "Unless you have an enduring story" (Bombur): a rule changed only while its condition holds. */
      if (!conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId})) continue;
      /* The whole selector grammar ("creatures you control with power 2 or less"): a rule changes nothing a layer
         derives, so reading it through the layers cannot loop, as the layers' own narrower matcher has to avoid. */
      if (matchesSelector(chosenFor(ability, holder).affects, state, id, {controller: holder.controller, source: holderId})) return true;
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
