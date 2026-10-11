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
import {staticAffects, powerOf, toughnessOf, abilitiesOf, controllerOf} from "./layers.mjs";
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
      counters are put on that creature instead" (Branching Evolution): `affects` the permanent, `counter` the kind, `times`;
      "that many plus one" (Hardened Scales) `plus`; "half that many, rounded down" (Vorinclex) `half`; `putBy` "you" or
      "opponent"; `players`. Read wherever counters are put on a permanent, as it enters too (placeCounters, below). */
  "more-counters": "rules/statics.mjs",
  /** CR 103.6b: "You may reveal this card from your opening hand. If you do, at the beginning of the first upkeep, ..."
      (Chancellor of the Forge): `effects`, what revealing it does, asked once the mulligans are done. rules/mulligan.mjs. */
  "opening-hand": "rules/mulligan.mjs",
  /** CR 104.3: "You can't lose the game" (Darksteel Angel): its controller loses to no state-based action. rules/sba.mjs. */
  "cant-lose": "rules/sba.mjs",
  /** CR 104.2b: "Your opponents can't win the game" (Darksteel Angel): an effect that says they win does not. effects/resources.mjs, winGame. */
  "opponents-cant-win": "script/effects/resources.mjs",
  /** CR 903.3a: "Freyalise, Llanowar's Fury can be your commander" -- a rule of the deck, not of the game: the card's
      definition says `canBeCommander` (cards/index.mjs), and the table holds a deck's commander to it (room/table.mjs,
      commanderLegal). */
  "can-be-commander": "cards/index.mjs",
  /** CR 100.2a, 903.5b's exception: "A deck can have any number of cards named Sphinx's Approach" -- a rule of the deck, not
      of the game, which nothing in a game reads: the compiler holds it to the card's own name (cards/index.mjs), and it stays
      among the definition's abilities for a deck held to the rule that every card but a basic land has a different name. */
  "any-number-in-deck": "cards/index.mjs",
  /** CR 510.1a's exception: assigns combat damage equal to its toughness rather than its power. combat.mjs. */
  "combat-damage-by-toughness": "rules/combat.mjs",
  /** CR 510.1a's other exception: "If Loot's power is negative, he assigns combat damage as though his power were positive"
      (Loot, the Anomaly): `affects` the creature, its power's size assigned when it is below zero. combatDamageOf, below. */
  "negative-power-as-positive": "rules/combat.mjs",
  /** CR 402.2's exception: "You have no maximum hand size" (Reliquary Tower, Thought Vessel). turn.mjs, at cleanup. */
  "no-maximum-hand-size": "rules/turn.mjs",
  /** CR 601.2f: "Artifact spells you cast cost {1} less to cast" (the Medallions, Foundry Inspector). actions.mjs. */
  "spells-cost-less": "rules/actions.mjs",
  /** CR 601.2f: "Noncreature spells cost {1} more to cast" (Thalia), "spells your opponents cast cost {2} more" (God-
      Pharaoh's Statue): `caster` any (the default), you or opponent; `affects` the spell; `amount`. actions.mjs, castCost.
      "Spells that target this creature cost more" is not built: a spell's own reduction reads its chosen targets
      (costReduction's `targets`), and costIncrease reads none yet. "During your turn, spells
      your opponents cast cost {1} more" (Tithe Taker): its `condition`, asked at each cast. */
  "spells-cost-more": "rules/actions.mjs",
  /** CR 602.2b, 601.2f: "During your turn, ... abilities your opponents activate cost {1} more to activate unless they're
      mana abilities" (Tithe Taker): `affects` the players whose activations cost more (a player selector, "you" its
      controller), `amount` generic mana, `condition`. A mana ability is never made to cost more by it (CR 605). Read as an
      activated ability's cost is, on the battlefield, in a hand or in a graveyard: actions.mjs, costPayment. */
  "abilities-cost-more": "rules/actions.mjs",
  /** CR 601.2f, the card's own: "This spell costs {1} less to cast for each creature on the battlefield" (Vanquish the
      Horde), "{X} less, where X is the total power of creatures you control" (Ghalta). Read from the card wherever it
      is cast from, by actions.mjs through costReduction; its `amount` may be counted (script/amount.mjs). "If it targets
      a tapped creature" (Magnificent End): `targeting`, a selector one of its chosen targets must fit -- its targets are
      chosen before its total cost is determined (CR 601.2c, 601.2f), so each way to choose them is costed on its own. */
  "this-costs-less": "rules/actions.mjs",
  /** CR 602.2b, 601.2f: "Equip abilities you activate that target this creature cost {2} less to activate" (Dwarven
      Mauler): `affects`, what one of the ability's chosen targets must be ("this creature", `self`), `amount` generic mana,
      for its controller's equip abilities (CR 702.6a). actions.mjs, as each way to choose an equip ability's target is costed
      (equipCostReduction, below). */
  "equip-costs-less": "rules/actions.mjs",
  /** CR 509.1b: "Target creature can't be blocked this turn" (Rogue's Passage), "creatures with power 2 or less can't be
      blocked". keywords/combat.mjs, as each blocker is checked. */
  "cant-be-blocked": "keywords/combat.mjs",
  /** "You may play lands from your graveyard" (Crucible of Worlds), "you may cast Dragon spells from the top of your
      library" (Korlessa): `zone` "graveyard" or "library-top"; "once during each of your turns" (Kess) `yourTurn` and
      `limit`; "if a spell cast this way would be put into your graveyard, exile it instead" `graveyardToExile`; `lands`
      and `spells` (a selector of the spells, or true for any). "If you do, it gains '...'" (Serra Paragon) `grants`, the
      abilities the permanent then has; "pay life equal to its mana value rather than pay its mana cost" (Bolas's Citadel)
      `payLife: "manaValue"`. For the static's controller; rules/actions.mjs offers them, each that does something
      different its own offer (`via`). */
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
  /** "If you would gain life, you gain twice that much life instead" (Rhox Faithmender; CR 614.1a): `affects` the players,
      from its controller's side, `times`. lifeGained, read wherever life is gained: changeLife (script/effects/resources.mjs)
      and lifelink in combat (rules/combat.mjs). */
  "more-life": "script/effects/resources.mjs",
  /** "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead"
      (Anointed Procession; CR 614.1a): `times`. tokensCreated, read where tokens are made (script/effects/permanents.mjs). */
  "more-tokens": "script/effects/permanents.mjs",
  /** "If an opponent would draw two or more cards, instead you and that player each draw a card" (Alms Collector; CR
      614.1a): `affects` the players whose draws it replaces, from its controller's side. drawsInstead, read by the draw
      effect (script/effects/zones.mjs). */
  "draws-instead": "script/effects/zones.mjs",
  /** "Alexios ... can't be sacrificed" (Alexios, Deimos of Kosmos; CR 701.21a): `affects` what can't. cantBeSacrificed, read
      where a permanent would be sacrificed (script/effects/zones.mjs, sacrificeOne) and where one is chosen to be: the
      sacrifice effect and an "unless" cost (script/effects/asking.mjs), a cost (rules/actions.mjs). */
  "cant-be-sacrificed": "script/effects/zones.mjs",
  /** "If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with
      flying are created instead" (Draconic Visitor): `affects` the tokens it replaces, `token` what is made instead.
      tokensCreated (script/effects/permanents.mjs). */
  "tokens-instead": "script/effects/permanents.mjs",
  /** "Your opponents can't cast spells from anywhere other than their hands", "during your turn", "more than one spell each
      turn" (CantBeCast): castForbidden, read where a cast is offered. rules/actions.mjs. And for a while, by an effect
      (effectUntil): "can't cast spells with the same name as that creature until your next turn" (Reflector Mage). */
  "cant-cast": "rules/actions.mjs",
  /** CR 602.5: "During combat, players can't ... activate abilities that aren't mana abilities" (Yuriko, Blade of the
      Mighty): `affects` the players it binds (a player selector), `duringCombat` -- the only form built -- and never a mana
      ability (CR 605). activationForbidden, read where an activation is offered. rules/actions.mjs. */
  "cant-activate": "rules/actions.mjs",
  /** "Creatures can't attack you unless their controller pays {2} for each" (CantAttackUnless): attackTax, paid as attackers
      are declared. rules/combat.mjs. */
  "attack-tax": "rules/combat.mjs",
  /** "This artifact doesn't untap during your untap step", "creatures with power 3 or greater don't untap during their
      controllers' untap steps": `affects` what stays tapped, read in the untap step (ruleChanged). rules/turn.mjs. */
  "doesnt-untap": "rules/turn.mjs",
  /** "Lands you control enter untapped" (Horizon Explorer): entersUntapped, as a land arrives. effects/zones.mjs. */
  "lands-enter-untapped": "script/effects/zones.mjs",
  /** "Threshold -- You can't cast this spell unless there are seven or more cards in your graveyard" (Proft, Sinister
      Mastermind; CR 601.2): the card's own restriction, `unless` the condition that lets it be cast, asked of its caster
      wherever the card would be cast from -- a hand, the command zone, a graveyard. castForbidden, below. */
  "cant-cast-self": "rules/actions.mjs",
  /** "You may cast this card from your graveyard or from exile" (Squee): the card's own, read where it is. rules/actions.mjs. */
  "cast-self-from": "rules/actions.mjs",
  /** "You have hexproof" (Crystal Barricade; CR 702.11c): its controller can't be the target of spells or abilities their
      opponents control. script/filter.mjs, as a player is targeted. */
  "player-hexproof": "script/filter.mjs",
  /** A restriction on attacking (CR 508.1c): `affects`, `defender`, `unless` (cantAttack, below). rules/combat.mjs. */
  "cant-attack": "rules/combat.mjs",
  /** A restriction on how many attack it (CR 508.1c): "No more than one creature can attack The Eternal Wanderer each
      combat" -- the permanent's own (`affects` itself), `count` the most declared attacking it (attackerCaps, below).
      rules/combat.mjs, as attackers are declared. */
  "attackers-at-most": "rules/combat.mjs",
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
  /** Suspend N--[cost] (CR 702.62a): the keyword kept as this static (cards/index.mjs), read in its owner's hand: the
      special action that exiles it with N time counters for its cost, offered where it could be cast (rules/actions.mjs). */
  "suspend": "rules/actions.mjs",
  /** Disguise [cost] (CR 702.168a): the keyword kept as this static (cards/index.mjs), read where the card could be cast --
      cast face down for {3} -- and on the face-down permanent, turned face up for its cost (rules/actions.mjs). */
  "disguise": "rules/actions.mjs",
  /** Paradigm (CR 702.192a): the keyword kept as this static (cards/index.mjs), read as the spell resolves -- the delayed
      trigger made the first time a spell of its name resolves for its controller, and the spell exiled. rules/stack.mjs. */
  "paradigm": "rules/stack.mjs",
  /** "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability
      triggers an additional time" (Panharmonicon, CR 603.2d): `affects` whose abilities, `cause` {event: enters, dies or
      attacks, filter} what caused it, if the card says. rules/trigger.mjs, as triggers are collected. */
  "triggers-again": "rules/trigger.mjs",
  /** CR 118.9, the card's own: "you may pay 1 life and exile a blue card from your hand rather than pay this spell's mana
      cost" -- `condition` ("if you control a commander"), `cost` atoms (mana or none, payLife, exileFromHand, sacrifice).
      rules/actions.mjs offers it beside the paid cast. */
  "alternative-cost": "rules/actions.mjs",
  /** "Target creature with defender can attack this turn as though it didn't have defender" (Assault Formation, Walking
      Bulwark; CR 702.3b): combat.mjs, as attackers are offered. And as a permanent's static: "creatures you control can
      attack as though they didn't have defender" (Felothar the Steadfast), "this creature can attack players who attacked
      you during their last turn as though it didn't have defender" (Weathered Sentinels: `against: "attackedYouLastTurn"`,
      those players only, never a planeswalker). defenderLifted, below. */
  "attacks-despite-defender": "rules/combat.mjs",
  /** Umbra armor (CR 702.89a): the keyword kept as this static on its Aura (cards/index.mjs), read wherever the permanent it
      enchants would be destroyed -- the damage removed and the Aura destroyed instead (script/effects/zones.mjs,
      destructionReplaced). */
  "umbra-armor": "script/effects/zones.mjs",
  /** "Prevent all damage that would be dealt to [them] this turn": an effect with a duration only (effectUntil), with
      `apply` {to, by, combat}; rules/replacement.mjs. */
  "prevent-damage": "rules/replacement.mjs",
  /** "If that creature would die this turn, exile it instead" (Essence Burn, Combustion Technique): an effect with a
      duration only (effectUntil), about its `targets`; rules/replacement.mjs, applicable. */
  "exile-if-dies": "rules/replacement.mjs",
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
  /** CR 614.1a, 701.34: "If you would proliferate, proliferate twice instead" (Tekuthal, Inquiry Dominus): `affects` the
      players whose proliferating it replaces (a player selector, "you" its controller). script/resolution.mjs, as a
      proliferate reaches the head of a resolution (proliferateTimes). */
  "proliferate-twice": "script/resolution.mjs",
  /** CR 702.10c by permission: "You may activate abilities of creatures you control as though those creatures had haste"
      (Thousand-Year Elixir): `affects` the creatures, "you" its controller. Their {T} abilities are not held back by CR
      302.6; their attack still is. keywords/timing.mjs, sickForAbilities. */
  "activate-as-though-haste": "keywords/timing.mjs",
  /** A requirement on attacking (CR 508.1d): "Other Goblin creatures you control attack each combat if able" (Goblin
      Rabblemaster): `affects` the creatures, "you" its controller. Required of each that can attack someone with no cost to
      pay; a declaration leaving out one it could have is refused, saying which (attacksEachCombat, below; rules/combat.mjs). */
  "attacks-each-combat": "rules/combat.mjs",
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
 * (Drannith Magistrate), `duringYourTurn` -- its controller's turn (Conqueror's Flail) -- `duringCombat` (Yuriko, Blade of
 * the Mighty: the combat phase, CR 506.1), or `moreThan` N spells each turn,
 * those fitting `filter` (Deafening Silence: noncreature; Archon of Emeria: any), counted from what the player has cast this
 * turn. Read where a cast is offered (rules/actions.mjs), a free cast as an effect resolves among them.
 */
export function castForbidden(state, player, cardId) {
  const object = state.objects[cardId];
  if (!object) return false;
  /* THE CARD'S OWN (cant-cast-self): "you can't cast this spell unless there are seven or more cards in your graveyard". */
  for (const own of object.abilities ?? [])
    if (own.kind === "static" && own.rule === "cant-cast-self" && !conditionHolds(state, own.unless, {controller: player, source: cardId})) return true;
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
      if (ability.duringCombat && duringCombat(state)) return true;
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

/* THE COMBAT PHASE (CR 506.1): its steps, from the beginning of combat to the end of combat (rules/turn.mjs). */
const duringCombat = (state) => typeof state.phase === "string" && state.phase.startsWith("COMBAT_");

/**
 * "CAN'T ACTIVATE" (CR 602.5): whether a static ability on the battlefield forbids this player activating abilities now --
 * `rule: "cant-activate"`, its `affects` the players it binds (a player selector), its `condition` its own, and when:
 * `duringCombat` (Yuriko, Blade of the Mighty: "during combat, players can't ... activate abilities that aren't mana
 * abilities"). Never a mana ability (CR 605): those are offered apart and nothing here reads them. Read where an
 * activation is offered (rules/actions.mjs).
 */
export function activationForbidden(state, player) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "cant-activate") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;
      if (!conditionHolds(state, ability.condition, context)) continue;
      if (ability.duringCombat && duringCombat(state)) return true;
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
 * WHAT TOKENS AN EFFECT CREATES (CR 614.1a, 111.1): `count` tokens like `values` -- a token's spec, or the copiable values
 * of a copy -- about to be created under `controller`'s control, after
 *   `tokens-instead`  "if one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature
 *                     tokens with flying are created instead" (Draconic Visitor): its controller's; `affects` the tokens it
 *                     replaces, by their card types, read as a description of what is not yet there (script/filter.mjs,
 *                     matchesLastKnown); `token` what is made instead, as many;
 *   `more-tokens`     "if an effect would create one or more tokens under your control, it creates twice that many of
 *                     those tokens instead" (Anointed Procession): `affects` the player creating them, "you" its
 *                     controller; `times`.
 * Each applies once (CR 614.5). Every Draconic Visitor makes the same Dragons, and doubling and making Dragons instead end
 * the same in either order, so nobody is asked (CR 616.1).
 *
 * @returns {{count: number, instead: ?object}} how many, and the spec made instead when one is
 */
export function tokensCreated(state, controller, count, values) {
  let n = count, instead = null;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static") continue;
      if (ability.rule === "tokens-instead" && holder.controller === controller && matchesLastKnown(ability.affects, values)) instead = ability.token;
      if (ability.rule === "more-tokens" && compileSelector({what: "player", ...ability.affects})(state, controller, {controller: holder.controller, source: holderId})) n *= ability.times;
    }
  }
  return {count: n, instead};
}

/**
 * WHETHER A PERMANENT CAN'T BE SACRIFICED (CR 701.21a, 101.2): a `cant-be-sacrificed` static's `affects` names it ("Alexios ...
 * can't be sacrificed", itself). An effect told to sacrifice it does nothing to it; a player told to sacrifice a creature,
 * or paying a cost that sacrifices one, can't choose it -- "can't" beats "must" and "may" alike (CR 101.2).
 */
export function cantBeSacrificed(state, id) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? [])
      if (ability.kind === "static" && ability.rule === "cant-be-sacrificed"
        && matchesSelector({what: "permanent", ...ability.affects}, state, id, {controller: holder.controller, source: holderId})) return true;
  }
  return false;
}

/**
 * WHO DRAWS INSTEAD (CR 614.1a): "if an opponent would draw two or more cards, instead you and that player each draw a card"
 * (Alms Collector) -- the controllers of the `draws-instead` statics whose `affects` names `player`, each once, in turn order
 * from the player after `player`. Two of one controller's end the same; two of different controllers do not, and which
 * applies is the drawing player's to choose (CR 616.1; effects/asking.mjs, orderDraws). Only for two or more: one card is no
 * draw it replaces, so the draws made instead are not replaced again.
 */
export function drawsInstead(state, player, count) {
  if (count < 2) return [];
  const seats = state.players.length, order = (p) => (p - player - 1 + seats) % seats;
  const found = new Set();
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? [])
      if (ability.kind === "static" && ability.rule === "draws-instead" && compileSelector({what: "player", ...ability.affects})(state, player, {controller: holder.controller, source: holderId}))
        found.add(holder.controller);
  }
  return [...found].sort((a, b) => order(a) - order(b));
}

/**
 * HOW MUCH LIFE IS GAINED (CR 614.1a, 119.3): "if you would gain life, you gain twice that much life instead" (Rhox
 * Faithmender) -- each `more-life` static whose `affects` names the player, "you" its controller, multiplies the gain by its
 * `times`. Only multiplying is built, so their order never changes how much and nobody is asked (CR 616.1); two
 * Faithmenders are four times. A gain the player can't have is no gain to double (cantGainLife, asked first).
 */
export function lifeGained(state, player, amount) {
  let n = amount;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "more-life") continue;
      if (compileSelector({what: "player", ...ability.affects})(state, player, {controller: holder.controller, source: holderId})) n *= ability.times;
    }
  }
  return n;
}

/**
 * HOW MANY COUNTERS ARE PUT ON (`more-counters`; CR 614.1a, 122.6). Each such static is a replacement effect over the
 * permanents it `affects` -- and, `players: true`, the players -- and the kind it names (`counter`; any, unsaid):
 *   `times`  "twice that many ... instead" (Branching Evolution, Innkeeper's Talent, Vorinclex, Monstrous Raider's for you);
 *            0, "can't have -1/-1 counters put on them" (Darksteel Angel); 2 when it says none of these three;
 *   `plus`   "that many plus one" (Hardened Scales, Yoshimaru, Beloved Companion), -1 "that many minus one";
 *   `half`   "half that many ..., rounded down" (Vorinclex's for its opponents).
 * `putBy` the player who must be putting them: "you" its controller, "opponent" one of its opponents. `by` is that player --
 * an effect's controller, a cost's payer, an infect source's controller, and for a permanent entering with counters its
 * controller (CR 122.6a). A condition is read now: Innkeeper's Talent's while it is level 3 or more (CR 716.2a). A
 * permanent entering with counters is read as it has entered.
 *
 * EACH APPLIES ONCE, AND ONLY TO ONE OR MORE (CR 614.5): one that leaves none ends the event, and nothing after it applies --
 * half of one counter is none, and Hardened Scales then has nothing to add one to.
 *
 * THE ORDER IS THE AFFECTED PLAYER'S (CR 616.1): the permanent's controller, or the player the counters go on. Two doublers
 * are four times in either order, and nobody is asked; but Hardened Scales and a doubler make one counter 4 or 3, and
 * Vorinclex's half beside a doubler make three counters 3 or 2. A resolution's putCounter and putCounterAll ask before any
 * is put (effects/asking.mjs, orderCounters), each answer kept by its placement and replayed here through `orders`.
 * Counters put where nothing can stop to ask -- as a permanent enters, as a cost, by infect, by proliferate -- take the
 * order that leaves the most when the affected player is the one putting them and the fewest when another player is: the
 * order that player chooses on all but rare boards, as damage takes the least where it cannot ask (rules/replacement.mjs).
 */
const putterFits = (putBy, by, you) => putBy === undefined || (putBy === "you" ? by === you : putBy === "opponent" && by !== null && by !== undefined && by !== you);
const changesCounters = (state, ability, holder, holderId, kind, by) => ability.kind === "static" && ability.rule === "more-counters"
  && (!ability.counter || ability.counter === kind) && putterFits(ability.putBy, by, holder.controller)
  && conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId});
/* "Can't have -1/-1 counters put on them" (Darksteel Angel): `times` 0, none at all. */
const timesOf = (ability) => (Number.isInteger(ability.times) && ability.times >= 0 ? ability.times : 2);
/* What one of them makes of n counters, n one or more. */
function counterChange(ability, n) {
  if (ability.half === true) return Math.floor(n / 2);
  if (Number.isInteger(ability.plus)) return n + ability.plus;
  return n * timesOf(ability);
}
/* Every number they can end at, over every order of them (CR 616.1), each applying while there is one or more. */
function counterEnds(candidates, n, out = new Set()) {
  if (n <= 0 || !candidates.length) { out.add(Math.max(0, n)); return out; }
  for (const c of candidates) counterEnds(candidates.filter((o) => o !== c), counterChange(c.ability, n), out);
  return out;
}
/* The effects that would change counters of this kind put on this permanent (`id`) or player (`player`) by `by`. */
function counterCandidates(state, {id = null, player = null}, kind, by) {
  const found = [];
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (!changesCounters(state, ability, holder, holderId, kind, by)) continue;
      if (player !== null ? ability.players !== true
        : !matchesSelector({what: "permanent", ...ability.affects}, state, id, {controller: holder.controller, source: holderId})) continue;
      found.push({holderId, ability});
    }
  }
  return found;
}
/** Which effect an answer names: its holder and ability (CR 614.5 is per effect). */
export const counterEffectKey = ({holderId, ability}) => `${holderId}:${ability.id}`;

/**
 * How many counters of `kind` are put on a permanent (`id`) or a player (`player`) when `count` would be, by `by`.
 * `orders`: the affected player's answers so far, each the effect they chose to apply next (counterEffectKey); `askable`
 * when the caller can stop to ask, and the next unanswered choice then comes back as `question`, nothing applied past it.
 *
 * @returns {{count: number, question?: {player: number, options: string[], count: number}}}
 */
export function placeCounters(state, {id = null, player = null}, kind, count, by = null, {orders = [], askable = false} = {}) {
  if (!(count > 0) || (player !== null ? !state.players[player] : !state.objects[id])) return {count};
  const affected = player !== null ? player : controllerOf(state, id);
  let rest = counterCandidates(state, {id, player}, kind, by), n = count, used = 0;
  while (rest.length && n > 0) {
    let next = rest[0];
    if (rest.length > 1 && counterEnds(rest, n).size > 1) {
      const answered = orders[used] === undefined ? undefined : rest.find((c) => counterEffectKey(c) === orders[used]);
      if (answered) { used += 1; next = answered; }
      else if (askable) return {count: n, question: {player: affected, options: rest.map(counterEffectKey), count: n}};
      else {
        /* Nobody can be asked here: the most for the player putting them on their own, the fewest put by another. */
        const most = by === affected;
        const best = (c) => { const ends = [...counterEnds(rest.filter((o) => o !== c), counterChange(c.ability, n))]; return most ? Math.max(...ends) : -Math.min(...ends); };
        next = rest.reduce((top, c) => (best(c) > best(top) ? c : top), rest[0]);
      }
    }
    n = counterChange(next.ability, n);
    rest = rest.filter((c) => c !== next);
  }
  return {count: Math.max(0, n)};
}
export const countersPlaced = (state, id, kind, count, by = null, orders = []) => placeCounters(state, {id}, kind, count, by, {orders}).count;
/** The same for counters put on a player (CR 122.1: poison and the rest): only a static that says `players: true`. */
export const playerCountersPlaced = (state, player, kind, count, by = null) => placeCounters(state, {player}, kind, count, by).count;

/**
 * The choice for CR 616.1 over counters: which of the effects that would change them applies first, asked of the
 * permanent's controller. `awaiting` carries the placement (`id`, `counter` its kind, `count` as it now is, `by`) and the candidates
 * (`options`, counterEffectKey). Each option says where it leads -- "Hardened Scales first: 4 counters" -- with `puts`, the
 * most it can end at, and `least`, the fewest, for a pilot.
 */
export function counterOrderChoice(state, awaiting) {
  const {id, counter: kind, count, by} = awaiting;
  const candidates = counterCandidates(state, {id}, kind, by);
  const byKey = new Map(candidates.map((c) => [counterEffectKey(c), c]));
  const range = (list) => { const lo = Math.min(...list), hi = Math.max(...list); return lo === hi ? `${lo}` : `${lo} to ${hi}`; };
  /* Two of one name (Rob's Vorinclex and Maya's) are told apart by whose they are. */
  const names = awaiting.options.map((key) => state.objects[byKey.get(key)?.holderId]?.card);
  const nameOf = (candidate) => {
    const card = state.objects[candidate.holderId].card;
    return names.filter((n) => n === card).length > 1 ? `${state.players[state.objects[candidate.holderId].controller].name}'s ${card}` : card;
  };
  const options = awaiting.options.map((key, index) => {
    const candidate = byKey.get(key);
    if (!candidate) return {index, label: "An effect no longer there", puts: count, least: count};
    const rest = candidates.filter((c) => c !== candidate && awaiting.options.includes(counterEffectKey(c)));
    const ends = [...counterEnds(rest, counterChange(candidate.ability, count))];
    return {index, label: `${nameOf(candidate)} first: ${range(ends)} counter${ends.length === 1 && ends[0] === 1 ? "" : "s"}`,
      cardId: candidate.holderId, puts: Math.max(...ends), least: Math.min(...ends)};
  });
  /* Two that would read alike (two permanents of one name) are numbered, so no two options read the same. */
  for (const option of options) {
    const alike = options.filter((o) => o.label === option.label);
    if (alike.length > 1) alike.forEach((o, n) => { o.label = `${o.label} (${n + 1})`; });
  }
  return {id: `order-counters:${state.turn}:${id}:${kind}:${awaiting.answered ?? 0}`,
    title: `${count} ${kind} counter${count === 1 ? "" : "s"} on ${state.objects[id].card}: which applies first?`, mode: "one", min: 1, max: 1, options};
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
    /* "For as long as it has a vow counter on it" (Promise of Loyalty; CR 611.2b): over for a creature without one. Only
       that effect puts vow counters on, and it makes an effect of its own each time, so one that lost its counter and
       somehow gained another is not a case the game can reach. */
    if (effect.whileCounter && !((state.objects[attacker]?.counters?.[effect.whileCounter] ?? 0) > 0)) continue;
    /* "Can't attack you or planeswalkers you control": the effect's controller, or a planeswalker they control (CR 506.3) --
       anyone else it may attack. */
    if (effect.defender === "you" && (defender !== effect.sourceController || (planeswalker !== null && effect.planeswalkers !== true))) continue;
    return true;
  }
  return false;
}
/**
 * "NO MORE THAN ONE CREATURE CAN ATTACK THE ETERNAL WANDERER EACH COMBAT" (CR 508.1c): for each permanent with the static
 * `attackers-at-most`, the most creatures that may be declared attacking it -- by id; the least of two such abilities.
 * Only a declaration is restricted: a creature put onto the battlefield attacking it was never declared (CR 508.4).
 */
export function attackerCaps(state) {
  const caps = {};
  for (const id of state.zones.battlefield) for (const ability of abilitiesOf(state, id)) {
    if (ability.kind !== "static" || ability.rule !== "attackers-at-most") continue;
    caps[id] = Math.min(caps[id] ?? Infinity, Number.isInteger(ability.count) ? ability.count : 1);
  }
  return caps;
}

/** Whom a static `attacks-despite-defender` may limit its permission to (`against`): the players who attacked its
 *  controller during their last turn (Weathered Sentinels). */
export const DEFENDER_LIFTED_AGAINST = Object.freeze(["attackedYouLastTurn"]);
/* "PLAYERS WHO ATTACKED YOU DURING THEIR LAST TURN": a player is one when, in their most recent turn, a creature of theirs
   was declared attacking you -- you, not a planeswalker of yours (CR 506.3: attacking one is not attacking its controller).
   Kept on each player as they declare attackers, from none as each of their turns begins (rules/combat.mjs, turn.mjs). */
const attackedYouLastTurn = (state, player, you) => (state.players[player]?.attackedPlayers ?? []).includes(you);

/**
 * WHETHER DEFENDER IS LIFTED (CR 702.3b): a creature with defender can't attack, unless something lets it attack as though
 * it didn't have defender. `defender` the player it would attack, `planeswalker` the planeswalker of theirs, or both
 * undefined for "anyone at all" -- the question whether it may attack at all (rules/combat.mjs, canAttack). A static of a
 * permanent's whose `affects` takes this creature in, with its condition holding, lifts it toward anyone, or -- `against`
 * -- only toward the players it names, and never toward a planeswalker; an effect for a while lifts it toward anyone.
 */
export function defenderLifted(state, id, defender = undefined, planeswalker = null) {
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "attacks-despite-defender") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!conditionHolds(state, ability.condition, context) || !matchesSelector(chosenFor(ability, holder).affects, state, id, context)) continue;
      if (ability.against === undefined) return true;
      if (ability.against !== "attackedYouLastTurn" || planeswalker !== null) continue;
      const toward = defender === undefined ? state.players.filter((p) => !p.lost && p.id !== holder.controller).map((p) => p.id) : [defender];
      if (toward.some((player) => attackedYouLastTurn(state, player, holder.controller))) return true;
    }
  }
  return (state.effects ?? []).some((effect) => effect.rule === "attacks-despite-defender" && staticAffects(state, effect, id, effect.sourceController));
}

/**
 * "ATTACKS EACH COMBAT IF ABLE" (CR 508.1d): the permanents whose static `attacks-each-combat` takes this creature in, as
 * it is now, with its condition holding -- each a requirement on it, said by name when a declaration breaks it. Empty, and
 * nothing is required of it by a static.
 */
export function attacksEachCombat(state, id) {
  const sources = [];
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "attacks-each-combat") continue;
      const context = {controller: holder.controller, source: holderId};
      if (conditionHolds(state, ability.condition, context) && matchesSelector(chosenFor(ability, holder).affects, state, id, context)) sources.push(holderId);
    }
  }
  /* And "attacks this combat if able" (Legion Warboss's token; effects/permanents.mjs, afterwards): an effect on the very
     creature, for the one combat phase it names -- its source named, as a static's holder is, gone or not. */
  for (const effect of state.effects ?? [])
    if (effect.rule === "attacks-each-combat" && effect.combat === (state.combatsThisTurn ?? 0) && effect.affects.ids.includes(id)) sources.push(effect.sourceId);
  return sources;
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
  /* And an effect for a while (effectUntil's `rule: "cant-be-blocked-by"`): "it can't be blocked by creatures of that color
     this turn" (Skrelv, Defector Mite) -- the attackers it names, the blockers its `by` describes, "you" its controller. */
  for (const effect of state.effects ?? []) {
    if (effect.rule !== "cant-be-blocked-by" || !(effect.affects?.ids ?? []).includes(attackerId)) continue;
    if (matchesSelector({what: "permanent", ...(effect.by ?? {})}, state, blockerId, {controller: effect.sourceController})) return true;
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
 * spell" finds the red card in a hand or a command zone. `targets`: the spell's chosen targets, for its own reduction that
 * reads them ("if it targets an attacking creature"); none chosen, and that reduction takes nothing off.
 */
/* Whether one of the chosen targets is an object the selector describes, read from the side of `context` (CR 601.2c: the
   targets are chosen before the total cost is determined, 601.2f). A player target is never one. */
const targetsFit = (state, selector, targets, context) => (targets ?? []).some((t) => t?.kind === "object" && state.objects[t.id]
  && matchesSelector(selector, state, t.id, context));
export function costReduction(state, player, cardId, targets = null) {
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
      /* "Spells you cast from anywhere other than your hand cost {2} less to cast" (Advanced Reconstruction, level 3): where
         the card is cast from (CR 601.2a, 601.2f) -- a graveyard, exile, a library, the command zone -- never a hand. */
      if (ability.fromAnywhereButHand === true && object.zone === "hand") continue;
      /* "During your turn, spells you cast cost {1} less for each creature you control with power 4 or greater" (Temur
         Battlecrier): its condition, and its amount counted now. */
      if (!conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId})) continue;
      total += amountOf(state, ability.amount ?? 1, {controller: holder.controller, source: holderId});
    }
  }
  for (const ability of object.abilities ?? []) {
    if (ability.kind !== "static" || ability.rule !== "this-costs-less") continue;
    /* "This spell costs {3} less to cast if it targets a tapped creature" (Magnificent End): only for targets that fit. */
    if (ability.targeting && !targetsFit(state, ability.targeting, targets, {controller: player, source: cardId})) continue;
    total += amountOf(state, ability.amount ?? 1, {controller: player, source: cardId});
  }
  return total;
}

/**
 * HOW MUCH LESS AN EQUIP ABILITY COSTS FOR THE TARGETS CHOSEN (CR 702.6a; 602.2b, 601.2f): every `equip-costs-less` static of
 * a permanent the activating player controls -- "equip abilities you activate that target this creature cost {2} less to
 * activate" (Dwarven Mauler) -- whose `affects` one of the chosen targets fits, read from that permanent's side ("this
 * creature" its `self`). Generic mana, summed; actions.mjs reads it for an equip ability only.
 */
export function equipCostReduction(state, player, targets) {
  let total = 0;
  for (const holderId of state.zones.battlefield) {
    if (controllerOf(state, holderId) !== player) continue;
    for (const ability of abilitiesOf(state, holderId)) {
      if (ability.kind !== "static" || ability.rule !== "equip-costs-less") continue;
      const context = {controller: player, source: holderId};
      if (targetsFit(state, ability.affects, targets, context)) total += amountOf(state, ability.amount ?? 0, context);
    }
  }
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
      /* "During your turn" (Tithe Taker): only while its condition holds, asked at each cast. */
      if (!conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId})) continue;
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
 * HOW MANY TIMES A PLAYER PROLIFERATES WHEN THEY WOULD ONCE (CR 701.34, 614.1a): each `proliferate-twice` static whose
 * `affects` takes them in doubles it -- two Tekuthals, four times: each replacement applies once, to the event as the one
 * before left it (CR 614.5), and each proliferate it made is one it may replace. The order they apply in changes nothing,
 * so nobody is asked (CR 616.1 asks only when it would).
 */
export function proliferateTimes(state, player) {
  let times = 1;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "proliferate-twice") continue;
      if (compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, {controller: holder.controller, source: holderId})) times *= 2;
    }
  }
  return times;
}

/**
 * HOW MUCH MORE AN ACTIVATED ABILITY COSTS (CR 602.2b, which determines its total cost as CR 601.2f does a spell's): every
 * `abilities-cost-more` static on the battlefield whose `affects` -- a player selector, "you" its controller -- takes in
 * the player activating it, while its condition holds. "Abilities your opponents activate cost {1} more to activate unless
 * they're mana abilities" (Tithe Taker): generic mana, summed. Mana abilities never ask (rules/actions.mjs reads this for
 * the others only), so "unless they're mana abilities" needs no word of its own.
 */
export function abilityCostIncrease(state, player) {
  let total = 0;
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== "abilities-cost-more") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;
      if (!conditionHolds(state, ability.condition, context)) continue;
      total += amountOf(state, ability.amount ?? 1, context);
    }
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
export const combatDamageOf = (state, id) => {
  if (ruleChanged(state, "combat-damage-by-toughness", id)) return toughnessOf(state, id);
  const power = powerOf(state, id);
  /* "As though his power were positive" (Loot, the Anomaly): a power of -2 assigns 2 -- where CR 510.1a would assign none. */
  return power < 0 && ruleChanged(state, "negative-power-as-positive", id) ? -power : power;
};
