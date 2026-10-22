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
 *
 * A PERMANENT'S RULES COME FROM ITS ABILITIES AS THEY ARE AFTER LAYER 6 (CR 613.1f, 604.1): each reader here asks
 * `staticAbilities` for them, never the printed list, so a permanent that has lost all its abilities changes no rule --
 * Marauding Raptor under Song of the Dryads makes no creature spell cheaper, an Elk Oko made of Thalia taxes nothing. A
 * card's own rule read where it is not a permanent (in a hand, on the stack) is its own.
 */

import {conditionHolds} from "../script/condition.mjs";
import {staticAffects, powerOf, toughnessOf, abilitiesOf, controllerOf, staticAbilities} from "./layers.mjs";
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
  /** CR 500.4 replaced (CR 614.1a, 106.4): "If you would lose unspent mana, that mana becomes colorless instead" (Omnath, Locus
      of the Void): `affects` the players whose pools it keeps (a player selector, "you" its controller). turn.mjs, as each
      step and phase ends (emptyManaPools). */
  "mana-becomes-colorless": "rules/turn.mjs",
  /** CR 601.2f: "Artifact spells you cast cost {1} less to cast" (the Medallions, Foundry Inspector). actions.mjs. */
  "spells-cost-less": "rules/actions.mjs",
  /** CR 601.2f: "Noncreature spells cost {1} more to cast" (Thalia), "spells your opponents cast cost {2} more" (God-
      Pharaoh's Statue): `caster` any (the default), you or opponent; `affects` the spell; `amount`. actions.mjs, castCost.
      "Spells your opponents cast that target this creature cost an additional 3 life to cast" (Terror of the Peaks, wave
      4b): `targeting`, a selector one of the spell's chosen targets must fit, and `life` in place of mana (lifeIncrease).
      "During your turn, spells your opponents cast cost {1} more" (Tithe Taker): its `condition`, asked at each cast. */
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
  /** CR 509.1b, a restriction on the whole declaration, as menace's is: "This creature can't be blocked by more than one
      creature" (Safewright Cavalry): `affects` the attacker. keywords/combat.mjs, blockersAreLegal; rules/combat.mjs says it
      in the blockers record (`capped`). */
  "blocked-by-one-at-most": "keywords/combat.mjs",
  /** CR 509.1c, a requirement: "This creature must be blocked if able" (Vinebred Brawler): `affects` the attacker. Its
      defending player blocks as many such attackers as can be blocked at once. rules/combat.mjs, blockRequirements. */
  "must-be-blocked": "rules/combat.mjs",
  /** CR 702.171b: a Mount saddled until end of turn (Bounding Felidar's saddle) -- an effect on it, never a printed static.
      keywords/designations.mjs, isSaddled. */
  "saddled": "keywords/designations.mjs",
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
  /** "You may cast this spell as though it had flash if it targets a commander" (Timely Ward; library load L2): the card's own,
      `targeting` what one of its targets must be, its targets then chosen as it is offered. rules/actions.mjs, flashAims. */
  "flash-if-targets": "rules/actions.mjs",
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
      (Anointed Procession; CR 614.1a): `affects` the player whose tokens they are -- "you", or anyone's (Primal Vigor) --
      `times`. tokensCreated, read where tokens are made (script/effects/permanents.mjs). */
  "more-tokens": "script/effects/permanents.mjs",
  /** "If an opponent would draw two or more cards, instead you and that player each draw a card" (Alms Collector; CR
      614.1a): `affects` the players whose draws it replaces, from its controller's side. drawsInstead, read by the draw
      effect (script/effects/zones.mjs). */
  "draws-instead": "script/effects/zones.mjs",
  /** "Each opponent can't draw more than one card each turn" (Narset, Parter of Veils; CR 121.2b): `affects` the players it
      binds, from its controller's side. drawForbidden, read where a card is drawn -- the draw step's (rules/turn.mjs), an
      effect's (script/effects/zones.mjs) -- and where a "you may draw" is offered (script/effects/asking.mjs, modal). */
  "cant-draw-more-than-one": "script/effects/zones.mjs",
  /** "If you would draw a card while your library has no cards in it, you win the game instead" (Laboratory Maniac; CR 614.11,
      121.6a, 104.2b): `affects` the players whose draws it replaces, from its controller's side. emptyDrawWins, read where a
      card is drawn -- the draw step's (rules/turn.mjs), an effect's (script/effects/zones.mjs). */
  "empty-draw-wins": "script/effects/zones.mjs",
  /** "If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead" (Teferi's
      Ageless Insight; CR 614.11, 614.11a, 614.5): `affects` the players, from its controller's side, `count` the cards drawn
      instead, `exceptFirstInDrawStep`. drawsMore, read where an effect's card is drawn (script/effects/zones.mjs); the draw
      step's own draw is always the first of that step (CR 504.1, 504.2), so rules/turn.mjs never asks. */
  "draws-more": "script/effects/zones.mjs",
  /** "Alexios ... can't be sacrificed" (Alexios, Deimos of Kosmos; CR 701.21a): `affects` what can't. cantBeSacrificed, read
      where a permanent would be sacrificed (script/effects/zones.mjs, sacrificeOne) and where one is chosen to be: the
      sacrifice effect and an "unless" cost (script/effects/asking.mjs), a cost (rules/actions.mjs). */
  "cant-be-sacrificed": "script/effects/zones.mjs",
  /** "If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with
      flying are created instead" (Draconic Visitor): `affects` the tokens it replaces, `token` what is made instead.
      tokensCreated (script/effects/permanents.mjs). */
  "tokens-instead": "script/effects/permanents.mjs",
  /** "If one or more creature tokens would be created under your control, those tokens plus a 1/1 white Soldier creature
      token are created instead" (Queen Allenal of Ruadach; CR 614.1a): `affects` the tokens it adds to, by their card
      types and subtypes (any token, unsaid: Peregrin Took), `token` the one it adds. tokensCreated (script/effects/permanents.mjs). */
  "tokens-plus": "script/effects/permanents.mjs",
  /** "If you would create a Clue, Food, or Treasure token, instead create one of each" (Academy Manufactor; CR 614.1a):
      `each`, the tokens it names, each a predefined token (CR 111.10). tokensCreated (script/effects/permanents.mjs). */
  "tokens-each": "script/effects/permanents.mjs",
  /** "Your opponents can't cast spells from anywhere other than their hands", "during your turn", "more than one spell each
      turn" (CantBeCast): castForbidden, read where a cast is offered. rules/actions.mjs. And for a while, by an effect
      (effectUntil): "can't cast spells with the same name as that creature until your next turn" (Reflector Mage). */
  "cant-cast": "rules/actions.mjs",
  /** CR 602.5: "During combat, players can't ... activate abilities that aren't mana abilities" (Yuriko, Blade of the
      Mighty): `affects` the players it binds (a player selector), `duringCombat`, and never a mana ability (CR 605).
      activationForbidden, read where an activation is offered. rules/actions.mjs. Or of some permanents' abilities, their
      mana abilities too: "during your turn, your opponents can't ... activate abilities of artifacts, creatures, or
      enchantments" (Grand Abolisher, wave 4b) -- `of` a selector of the permanents, `duringYourTurn` or always.
      permanentActivationForbidden, read wherever a permanent's ability is offered or tapped to pay. */
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
  /** Dredge N (CR 702.52a; Life from the Loam, wave 4c k2): the keyword kept as this static, with its N (`amount`), read in its
      owner's graveyard wherever that player would draw a card -- the draw step (rules/turn.mjs) and a draw effect
      (script/resolution.mjs) -- a replacement its player may choose (script/effects/zones.mjs, dredgers). */
  "dredge": "script/effects/zones.mjs",
  /** Rebound (CR 702.88a): the keyword kept as this static (cards/index.mjs), read as the spell leaves the stack: cast from
      its owner's hand and resolved, it is exiled and may be cast free at its caster's next upkeep (Ephemerate). */
  "rebound": "rules/stack.mjs",
  /** Suspend N--[cost] (CR 702.62a): the keyword kept as this static (cards/index.mjs), read in its owner's hand: the
      special action that exiles it with N time counters for its cost, offered where it could be cast (rules/actions.mjs). */
  "suspend": "rules/actions.mjs",
  /** Plot [cost] (CR 702.170a; library load L5): the keyword kept as this static (cards/index.mjs), read in its owner's hand:
      the special action that exiles it for its cost, and the cast on a later turn it allows (rules/actions.mjs). */
  "plot": "rules/actions.mjs",
  /** Disguise [cost] (CR 702.168a): the keyword kept as this static (cards/index.mjs), read where the card could be cast --
      cast face down for {3} -- and on the face-down permanent, turned face up for its cost (rules/actions.mjs). */
  "disguise": "rules/actions.mjs",
  /** Morph [cost] (CR 702.37a): the keyword kept as this static (cards/index.mjs), read as disguise's is -- cast face down for
      {3}, a 2/2 with no text, and on the face-down permanent turned face up for its morph cost (rules/actions.mjs). */
  "morph": "rules/actions.mjs",
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
  /** CR 509.1b: "This token can block only creatures with flying" (Pinnacle Emissary's Drones): `affects` the blockers, and
      `attackers` the only ones each may block, a selector. keywords/combat.mjs, as each blocker is checked (blocksOnlyOthers). */
  "can-block-only": "keywords/combat.mjs",
  /** CR 613.1b: "You control enchanted permanent" (Tractor Beam): an Aura's, `affects` what it is attached to. Made a control
      change of the Aura's own as the game is checked (rules/sba.mjs; script/effects/permanents.mjs, controlByAuras). */
  "control-enchanted": "script/effects/permanents.mjs",
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
  /** CR 606.3's timing lifted by permission: "Until end of turn, you may activate loyalty abilities of Jace planeswalkers you
      control on any player's turn any time you could cast an instant" (Jace's Machinations): `affects` the planeswalkers,
      "you" its controller. Only the timing: one loyalty ability of a permanent each turn still holds (606.3). rules/actions.mjs. */
  "loyalty-at-instant-speed": "rules/actions.mjs",
  /** CR 606.3 changed: "You may activate the loyalty abilities of planeswalkers you control twice each turn rather than only
      once" (Oath of Teferi): `affects` the planeswalkers, "you" its controller. Twice, however many say so. rules/actions.mjs. */
  "loyalty-twice": "rules/actions.mjs",
  /** CR 606.4's cost modified: "Planeswalkers' loyalty abilities you activate cost an additional [+1] to activate" (Carth the
      Lion): `affects` the players, "you" its controller, `amount` the loyalty counters added. loyaltyCostIncrease, below. */
  "loyalty-costs-more": "rules/actions.mjs",
  /** CR 307.5 imposed: "Each opponent can cast spells only any time they could cast a sorcery" (Teferi, Time Raveler):
      `affects` the players, a player selector, "you" its controller. castForbidden, below. */
  "cast-as-sorcery": "rules/statics.mjs",
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    if (holder.controller !== player) continue;
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "cast-without-paying") continue;
      if (ability.zones && !ability.zones.includes(object.zone)) continue;
      if (!conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId})) continue;
      if (!matchesSelector({...(ability.affects ?? {}), what: "card", zone: object.zone}, state, cardId, {controller: holder.controller, source: holderId})) continue;
      if (ability.manaValueAtMost !== undefined) {
        const cap = amountOf(state, ability.manaValueAtMost, {controller: holder.controller, source: holderId});
        if (manaValue(parseManaCost(object.manaCost ?? "")) > cap) continue;
      }
      if (ability.limit && usesThisTurn(state, holderId, `free:${ability.id}`) >= ability.limit) continue;
      /* "By paying life equal to its mana value rather than paying its mana cost" (Demon of Fate's Design; CR 118.9): the
         alternative cost is that life, not nothing (`payLife`, rules/actions.mjs). */
      return {source: holderId, abilityId: ability.id, limited: Boolean(ability.limit), ...(ability.payLife ? {payLife: ability.payLife} : {})};
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
  /* "Each opponent can cast spells only any time they could cast a sorcery" (Teferi, Time Raveler; sorceryTimeOnly). */
  if (sorceryTimeOnly(state, player) !== null && !sorceryTimeFor(state, player)) return true;
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
/* CR 307.5: "any time they could cast a sorcery" -- with priority, in a main phase of their own turn, the stack empty. Never
   as an effect resolves, the resolving spell or ability still on the stack (CR 608.2n). */
const sorceryTimeFor = (state, player) => player === state.activePlayer && ["MAIN1", "MAIN2"].includes(state.phase) && state.stack.length === 0;

/**
 * WHAT HOLDS A PLAYER TO CASTING SPELLS ONLY AS A SORCERY (`cast-as-sorcery`, no condition read: cards/index.mjs refuses one): "Each opponent can cast spells only any time
 * they could cast a sorcery" (Teferi, Time Raveler; CR 307.5) -- `affects`, a player selector, "you" its controller. A spell
 * with flash, a permission to cast as though it had flash, and an effect's "you may cast it" as it resolves (a cascade's)
 * are all refused outside that time (castForbidden). The name of the first permanent that says so, for the refusal's words
 * (rules/actions.mjs, whyNot), or null.
 */
export function sorceryTimeOnly(state, player) {
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "cast-as-sorcery") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;
      return holder.card;
    }
  }
  return null;
}

const duringCombat = (state) => typeof state.phase === "string" && state.phase.startsWith("COMBAT_");

/**
 * "CAN'T ACTIVATE" (CR 602.5): whether a static ability on the battlefield forbids this player activating abilities now --
 * `rule: "cant-activate"`, its `affects` the players it binds (a player selector), its `condition` its own, and when:
 * `duringCombat` (Yuriko, Blade of the Mighty: "during combat, players can't ... activate abilities that aren't mana
 * abilities"). Never a mana ability (CR 605): those are offered apart and nothing here reads them. Read where an
 * activation is offered (rules/actions.mjs).
 */
export function activationForbidden(state, player) {
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
 * "DURING YOUR TURN, YOUR OPPONENTS CAN'T ... ACTIVATE ABILITIES OF ARTIFACTS, CREATURES, OR ENCHANTMENTS" (Grand Abolisher,
 * wave 4b; CR 602.5): whether a static ability forbids this permanent's controller activating its abilities now -- a
 * `cant-activate` static with `of`, a selector of the permanents whose abilities it is about (read from the static's
 * controller's side), its `affects` the players it binds, `duringYourTurn` its controller's turn, and its `condition`. Its
 * mana abilities too (CR 605.1a: a mana ability is an activated ability; the card says nothing to spare them). On the
 * battlefield only: a card's abilities in a hand or a graveyard (cycling) are no permanent's (the card's ruling), so it is
 * read wherever a permanent's activated or mana ability is offered, or tapped to pay (rules/actions.mjs, rules/mana.mjs).
 */
export function permanentActivationForbidden(state, id) {
  const player = controllerOf(state, id);
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "cant-activate" || ability.of === undefined) continue;
      const context = {controller: holder.controller, source: holderId};
      if (ability.duringYourTurn && state.activePlayer !== holder.controller) continue;
      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;
      if (!conditionHolds(state, ability.condition, context)) continue;
      if (compileSelector({...ability.of, what: "permanent"})(state, id, context)) return true;
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "cant-gain-life") continue;
      const context = {controller: holder.controller, source: holderId};
      if (compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context) && conditionHolds(state, ability.condition, context)) return true;
    }
  }
  return false;
}

/**
 * WHAT TOKENS AN EFFECT CREATES (CR 614.1a, 111.1): `count` tokens like `values` -- a token's spec, or the copiable values
 * of a copy -- about to be created under `controller`'s control. The event is the tokens it would make, in groups, each one
 * token's values and how many of it, the effect's own first (`own`: made as the effect makes them, so a copy is a copy).
 * Each replacement effect rewrites the event as it then stands (CR 614.6):
 *   `more-tokens`     "it creates twice that many of those tokens instead" (Anointed Procession, Parallel Lives, Doubling
 *                     Season; Primal Vigor's for every player): `affects` the player creating them, "you" its controller;
 *                     every group `times` as many;
 *   `tokens-instead`  "that many 4/4 white Angel creature tokens with flying and vigilance are created instead" of creature
 *                     tokens (Divine Visitation; Draconic Visitor's Dragons of artifact ones): its controller's; each group
 *                     `affects` describes, by card types, made as `token` instead, as many;
 *   `tokens-plus`     "those tokens plus a 1/1 white Soldier creature token" of creature tokens (Queen Allenal of Ruadach),
 *                     "plus an additional Treasure token" of Treasure tokens (Xorn), "plus an additional Food token" of any
 *                     (Peregrin Took): its controller's; one `token` more, while a group `affects` describes -- by card
 *                     types and subtypes, any token unsaid -- is made;
 *   `tokens-each`     "if you would create a Clue, Food, or Treasure token, instead create one of each" (Academy
 *                     Manufactor): its controller's; each group of a kind `each` names -- a token with that kind's subtype --
 *                     joined by as many of each other kind (its rulings: that many of each; three times that many with two).
 * What is not yet there is read as a description (script/filter.mjs, matchesLastKnown): a Treasure is an artifact token
 * before it is made. Every token in the event is made as the effect says its tokens are -- tapped, attacking, gaining haste,
 * with counters (effects/permanents.mjs) -- but none has the abilities the effect's own were created with: a replacement
 * says what its tokens are (the rulings of Queen Allenal, Divine Visitation, Doubling Season and Mondrak, Glory Dominus).
 *
 * Each applies once (CR 614.5), and only while it applies to the event as it now stands (CR 616.1e-f): an adder of creature
 * tokens adds to a Treasure only once something has made it one. Their order is the affected player's -- the tokens'
 * controller (CR 616.1) -- whenever two orders end differently: a doubler and an adder, Dragons and an adder of artifact
 * tokens, Angels and the Queen's Soldier (Angels and a Soldier, or Angels only). Doublers alone, adders alone, or the same
 * Dragons twice end the same in any order, and nobody is asked. A resolution asks before any is made (effects/asking.mjs,
 * orderTokens), each answer kept with the effect and replayed here through `orders`; `askable` when the caller can stop to
 * ask, the next unanswered choice coming back as `question`. Where nothing can stop to ask, the order that makes the most.
 *
 * @returns {{groups: Array<{token: object, count: number, own?: true}>, question?: object}} what is made, the effect's own
 *   first; where it stopped to ask, the event as it then stood
 */
export function tokensCreated(state, controller, count, values, {orders = [], askable = false} = {}) {
  const {event, question} = tokenEvent(state, controller, count, values, orders, askable);
  return question ? {groups: event, question} : {groups: event};
}
/* The event as `orders` leave it: done, or stopped at the next question, with the effects not yet applied (`rest`). */
function tokenEvent(state, controller, count, values, orders, askable) {
  let event = [{token: values, count, own: true}], rest = tokenChangers(state, controller), used = 0;
  for (let now = applying(rest, event); now.length; now = applying(rest, event)) {
    let next = now[0];
    if (now.length > 1 && tokenEnds(rest, event).size > 1) {
      const answered = orders[used] === undefined ? undefined : now.find((c) => tokenEffectKey(c) === orders[used]);
      if (answered) { used += 1; next = answered; }
      else if (askable) return {event, rest, question: {player: controller, options: now.map(tokenEffectKey)}};
      else next = now.reduce((top, c) => (mostAfter(rest, c, event) > mostAfter(rest, top, event) ? c : top), now[0]);
    }
    event = tokenChange(next.ability, event);
    rest = rest.filter((c) => c !== next);
  }
  return {event, rest};
}
/* The effects that would change tokens made under `controller`'s control: a doubler of the player its `affects` names, the
   rest of their own controller's. */
const TOKENS_CHANGED = ["tokens-instead", "tokens-plus", "tokens-each"];
function tokenChangers(state, controller) {
  const changers = [];
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static") continue;
      if (ability.rule === "more-tokens" && compileSelector({what: "player", ...ability.affects})(state, controller, {controller: holder.controller, source: holderId})) changers.push({holderId, ability});
      if (!TOKENS_CHANGED.includes(ability.rule) || holder.controller !== controller) continue;
      /* A predefined token is given its definition as the card is compiled (cards/index.mjs, predefinedIn); one that was not
         would be made as a nameless creature. */
      if ([ability.token, ...(ability.each ?? [])].some((token) => token?.predefined)) throw new Error(`${ability.text ?? ability.rule}: a predefined token not compiled into its definition`);
      changers.push({holderId, ability});
    }
  }
  return changers;
}
const live = (event) => event.filter((g) => g.count > 0);
/* Whether `affects` describes a token not yet made: by card types and subtypes; any token, unsaid. */
const describes = (affects, token) => matchesLastKnown(affects ?? {}, token);
/* Which of `each` a token is (tokens-each): the one whose subtype it has -- a Food Golem is a Food. */
const kindOf = (ability, token) => (ability.each ?? []).find((kind) => (kind.subtypes ?? []).some((t) => (token.subtypes ?? []).includes(t)));
/* Which of them apply to the event as it now stands (CR 616.1f): a doubler to any tokens; the rest while a token they
   describe is made. */
const applying = (rest, event) => rest.filter(({ability}) => live(event).some((g) => (ability.rule === "more-tokens" ? true
  : ability.rule === "tokens-each" ? Boolean(kindOf(ability, g.token)) : describes(ability.affects, g.token))));
/* What one of them makes of the event. */
function tokenChange(ability, event) {
  if (ability.rule === "more-tokens") return event.map((g) => ({...g, count: g.count * ability.times}));
  /* Made as its token instead: no longer the effect's own (a copy is not made a copy). */
  if (ability.rule === "tokens-instead") return event.map((g) => (g.count > 0 && describes(ability.affects, g.token) ? {token: ability.token, count: g.count} : g));
  if (ability.rule === "tokens-each") return event.flatMap((g) => {
    const kind = g.count > 0 ? kindOf(ability, g.token) : undefined;
    return kind ? [g, ...ability.each.filter((k) => k !== kind).map((k) => ({token: k, count: g.count}))] : [g];
  });
  return [...event, {token: ability.token, count: 1}];
}
const tokensIn = (event) => event.reduce((n, g) => n + g.count, 0);
const nameOf = (token) => token?.name ?? token?.card ?? null;
/* What the event makes, by name: "1 Angel, 1 Soldier". */
function makes(event) {
  const by = new Map();
  for (const g of live(event)) by.set(nameOf(g.token) ?? "token", (by.get(nameOf(g.token) ?? "token") ?? 0) + g.count);
  return [...by].map(([name, n]) => `${n} ${name}`).sort().join(", ");
}
/* Every way the event can end, over every order of them (CR 616.1) -- each end what it makes, and how many -- and the most
   tokens any order after `first` makes. An order already followed from the same point is not followed again. */
function tokenEnds(rest, event, out = new Map(), seen = new Set()) {
  const key = `${rest.map(tokenEffectKey).sort().join(" ")}|${makes(event)}`;
  if (seen.has(key)) return out;
  seen.add(key);
  const now = applying(rest, event);
  if (!now.length) { out.set(makes(event), tokensIn(event)); return out; }
  for (const c of now) tokenEnds(rest.filter((o) => o !== c), tokenChange(c.ability, event), out, seen);
  return out;
}
const mostAfter = (rest, first, event) => Math.max(...tokenEnds(rest.filter((o) => o !== first), tokenChange(first.ability, event)).values());
/** Which effect an answer names: its holder and ability (CR 614.5 is per effect). */
export const tokenEffectKey = ({holderId, ability}) => `${holderId}:${ability.id}`;

/**
 * The choice for CR 616.1 over tokens: which of the effects that would change them applies next, asked of their controller.
 * `awaiting` carries the event (`controller`, `count` and `values` as the effect would make them, the answers so far) and
 * the candidates (`options`, tokenEffectKey). Each option says where it leads -- "Anointed Procession first: 4 tokens" --
 * with `makes`, the most it can end at, for a pilot; two that would read alike but end differently (Angels and a Soldier,
 * or two Angels) say what each makes.
 */
export function tokenOrderChoice(state, awaiting) {
  const {event, rest} = tokenEvent(state, awaiting.controller, awaiting.count, awaiting.values, awaiting.answered ?? [], true);
  const byKey = new Map(rest.map((c) => [tokenEffectKey(c), c]));
  const names = awaiting.options.map((key) => state.objects[byKey.get(key)?.holderId]?.card);
  const nameOfHolder = (c) => { const card = state.objects[c.holderId].card; return names.filter((n) => n === card).length > 1 ? `${state.players[state.objects[c.holderId].controller].name}'s ${card}` : card; };
  const ends = new Map(), ranges = new Map();
  const options = awaiting.options.map((key, index) => {
    const c = byKey.get(key);
    if (!c) return {index, label: "An effect no longer there", makes: tokensIn(event)};
    const after = tokenEnds(rest.filter((o) => o !== c), tokenChange(c.ability, event));
    const counts = [...after.values()], lo = Math.min(...counts), hi = Math.max(...counts);
    ends.set(index, [...after.keys()].sort().join(" or "));
    ranges.set(index, lo === hi ? `${lo}` : `${lo} to ${hi}`);
    return {index, label: `${nameOfHolder(c)} first: ${ranges.get(index)} token${hi === 1 ? "" : "s"}`, cardId: c.holderId, makes: hi};
  });
  /* Two that make as many tokens but different ones say what each makes -- Divine Visitation first, an Angel and a Soldier;
     the Queen first, two Angels. Two that are the same (two permanents of one name) are numbered, so no two read the same. */
  const telling = options.filter((o) => ends.has(o.index) && options.some((other) => ends.has(other.index)
    && ranges.get(other.index) === ranges.get(o.index) && ends.get(other.index) !== ends.get(o.index)));
  for (const option of telling) option.label = `${option.label} (${ends.get(option.index)})`;
  for (const option of options) {
    const alike = options.filter((o) => o.label === option.label);
    if (alike.length > 1) alike.forEach((o, n) => { o.label = `${o.label} (${n + 1})`; });
  }
  const kinds = new Set(live(event).map((g) => nameOf(g.token)));
  const name = kinds.size === 1 && [...kinds][0] ? `${[...kinds][0]} ` : "";
  return {id: `order-tokens:${state.turn}:${awaiting.key}:${(awaiting.answered ?? []).length}`,
    title: `${tokensIn(event)} ${name}token${tokensIn(event) === 1 ? "" : "s"}: which applies first?`, mode: "one", min: 1, max: 1, options};
}

/**
 * WHETHER A PERMANENT CAN'T BE SACRIFICED (CR 701.21a, 101.2): a `cant-be-sacrificed` static's `affects` names it ("Alexios ...
 * can't be sacrificed", itself). An effect told to sacrifice it does nothing to it; a player told to sacrifice a creature,
 * or paying a cost that sacrifices one, can't choose it -- "can't" beats "must" and "may" alike (CR 101.2).
 */
export function cantBeSacrificed(state, id) {
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId))
      if (ability.kind === "static" && ability.rule === "cant-be-sacrificed"
        && matchesSelector({what: "permanent", ...ability.affects}, state, id, {controller: holder.controller, source: holderId})) return true;
  }
  return false;
}

/**
 * "EACH OPPONENT CAN'T DRAW MORE THAN ONE CARD EACH TURN" (Narset, Parter of Veils; CR 121.2b, 101.2): whether `player` may not
 * draw `count` more cards now -- a `cant-draw-more-than-one` static's `affects` names them, from its controller's side, and
 * this turn's draws (state/index.mjs, recordDraw: those before the static was there among them, its ruling) and these would
 * be more than one. Each card of a draw is its own (CR 121.2): the draw of two is carried out as far as it may be, and a
 * choice to draw two is no choice the player may take (121.2b). A draw replaced was never made (CR 614.6), so is not counted.
 */
export function drawForbidden(state, player, count = 1) {
  if ((state.players[player]?.drawnThisTurn ?? 0) + count <= 1) return false;
  return playerRuleChanged(state, "cant-draw-more-than-one", player);
}

/**
 * "IF YOU WOULD DRAW A CARD WHILE YOUR LIBRARY HAS NO CARDS IN IT, YOU WIN THE GAME INSTEAD" (Laboratory Maniac; CR 614.11,
 * 121.6a): whether an `empty-draw-wins` static names `player`, who would now draw from an empty library. Asked only once the
 * draw is one the player may make (drawForbidden first: a draw that can't happen is no event to replace, CR 101.2).
 */
export function emptyDrawWins(state, player) {
  return playerRuleChanged(state, "empty-draw-wins", player);
}

/**
 * "IF YOU WOULD DRAW A CARD EXCEPT THE FIRST ONE YOU DRAW IN EACH OF YOUR DRAW STEPS, DRAW TWO CARDS INSTEAD" (Teferi's Ageless
 * Insight; CR 614.11, 614.11a): the `draws-more` statics whose `affects` names `player` for the card they would draw now, each
 * `{key, count}` -- its holder and ability, so each applies once to a draw and to the draws it became (CR 614.5), and
 * another's still may: two of them make four. `exceptFirstInDrawStep`: not the first card the player would draw in their own
 * draw step -- none drawn there yet this turn (state/index.mjs, recordDrawStepDraw), the step's own draw or, it skipped, an
 * effect's. Only multiplying draws is built, so their order never changes the outcome and nobody is asked (CR 616.1).
 */
export function drawsMore(state, player) {
  const steps = state.players[player]?.drawStepDraws;
  const first = state.phase === "DRAW" && state.activePlayer === player && !(steps?.turn === state.turn && steps.count > 0);
  const found = [];
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "draws-more") continue;
      if (ability.exceptFirstInDrawStep === true && first) continue;
      if (compileSelector({what: "player", ...ability.affects})(state, player, {controller: holder.controller, source: holderId}))
        found.push({key: `${holderId}:${ability.id}`, count: ability.count});
    }
  }
  return found;
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId))
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "more-life") continue;
      if (compileSelector({what: "player", ...ability.affects})(state, player, {controller: holder.controller, source: holderId})) n *= ability.times;
    }
  }
  return n;
}

/**
 * HOW MANY COUNTERS ARE PUT ON (`more-counters`; CR 614.1a, 122.6). Each such static is a replacement effect over the
 * permanents it `affects` -- and, `players`, the players: `true` any ("on a permanent or player", Vorinclex), "you" its
 * controller ("or on yourself", Lae'zel, Vlaakith's Champion); with `affects: {what: "player"}`, players' alone ("if you
 * would get one or more counters", Winding Constrictor) -- and the kind it names (`counter`; any, unsaid):
 *   `times`  "twice that many ... instead" (Branching Evolution, Innkeeper's Talent, Vorinclex, Monstrous Raider's for you);
 *            0, "can't have -1/-1 counters put on them" (Darksteel Angel); 2 when it says none of these three;
 *   `plus`   "that many plus one" (Hardened Scales, Yoshimaru, Beloved Companion), -1 "that many minus one";
 *   `half`   "half that many ..., rounded down" (Vorinclex's for its opponents).
 * `putBy` the player who must be putting them: "you" its controller, "opponent" one of its opponents. `by` is that player --
 * an effect's controller, a cost's payer, an infect source's controller, and for a permanent entering with counters its
 * controller (CR 122.6a). `byEffect`, "if an effect would put" (Doubling Season): not counters put as a cost -- a loyalty
 * ability's +1 is not doubled (its ruling; CR 118.1, 602.2b), a planeswalker's loyalty as it enters is (CR 122.6). A
 * condition is read now: Innkeeper's Talent's while it is level 3 or more (CR 716.2a). A permanent entering with counters is
 * read as it has entered -- and its own effect over a set of permanents including it does not yet apply to it (CR 614.12;
 * the rulings of Kami of Whispered Hopes, Ozolith and Winding Constrictor): `entering`.
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
const changesCounters = (state, ability, holder, holderId, kind, by, cost) => ability.kind === "static" && ability.rule === "more-counters"
  && (!ability.counter || ability.counter === kind) && putterFits(ability.putBy, by, holder.controller)
  && !(cost && ability.byEffect === true)
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
/* The effects that would change counters of this kind put on this permanent (`id`) or player (`player`) by `by` -- as a cost
   (`cost`), or as the permanent enters (`entering`). */
function counterCandidates(state, {id = null, player = null}, kind, by, {cost = false, entering = false} = {}) {
  const found = [];
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (!changesCounters(state, ability, holder, holderId, kind, by, cost)) continue;
      if (player !== null ? !(ability.players === true || (ability.players === "you" && player === holder.controller))
        : ability.affects?.what === "player" || !matchesSelector({what: "permanent", ...ability.affects}, state, id, {controller: holder.controller, source: holderId})) continue;
      /* Entering, it applies to itself only an effect of its own alone ("this creature enters with ..."; CR 614.12). */
      if (entering && holderId === id && ability.affects?.self !== true) continue;
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
 * `cost`: put as a cost is paid (rules/actions.mjs); `entering`: put on the permanent as it enters (CR 122.6).
 *
 * @returns {{count: number, question?: {player: number, options: string[], count: number}}}
 */
export function placeCounters(state, {id = null, player = null}, kind, count, by = null, {orders = [], askable = false, cost = false, entering = false} = {}) {
  if (!(count > 0) || (player !== null ? !state.players[player] : !state.objects[id])) return {count};
  const affected = player !== null ? player : controllerOf(state, id);
  let rest = counterCandidates(state, {id, player}, kind, by, {cost, entering}), n = count, used = 0;
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
/** The counters a permanent enters with (CR 122.6), put on as it enters by `by` -- its controller, unless an effect says
    (122.6a): not by its own effect over a set of permanents (CR 614.12). */
export const enteringCountersPlaced = (state, id, kind, count, by = null) => placeCounters(state, {id}, kind, count, by, {entering: true}).count;
/** The same for counters put on a player (CR 122.1: poison and the rest): only a static that says `players`. */
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "attacks-each-combat") continue;
      const context = {controller: holder.controller, source: holderId};
      if (conditionHolds(state, ability.condition, context) && matchesSelector(chosenFor(ability, holder).affects, state, id, context)) sources.push(holderId);
    }
  }
  /* And "attacks this combat if able" (Legion Warboss's token; effects/permanents.mjs, afterwards): an effect on the very
     creature, for the one combat phase it names -- its source named, as a static's holder is, gone or not. */
  for (const effect of state.effects ?? [])
    if (effect.rule === "attacks-each-combat" && effect.combat === (state.combatsThisTurn ?? 0) && effect.affects.ids.includes(id)) sources.push(effect.sourceId);
  /* And "creatures your opponents control attack this turn if able" (Bident of Thassa; effectUntil's `rule:
     "attacks-each-combat"` with `affects`): a rule changed for every combat of the turn, not a characteristic, so it takes in
     each creature as it now is -- one that entered or changed control after it resolved too (CR 611.2c) -- the opponents of
     its controller as it resolved. */
  for (const effect of state.effects ?? [])
    if (effect.rule === "attacks-each-combat" && effect.combat === undefined && staticAffects(state, effect, id, effect.sourceController)) sources.push(effect.sourceId);
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
  const held = staticAbilities(state);
  for (const {defenderId, planeswalkerId} of picked) for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    if (holder.controller !== defenderId) continue;
    for (const ability of held(holderId)) if (ability.kind === "static" && ability.rule === "attack-tax" && (planeswalkerId === undefined || ability.planeswalkers === true)
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
  /* "Spells you control can't be countered this turn" (Veil of Summer): an effect for a while (effectUntil's `rule:
     "cant-be-countered"`) over the spells its `affects` describes, "you" its controller -- a rule changed, not a
     characteristic, so a spell cast after it resolves is reached too (CR 611.2c is about characteristics). */
  if ((state.effects ?? []).some((e) => e.rule === "cant-be-countered" && matchesSelector(e.affects, state, spellId, {controller: e.sourceController}))) return true;
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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

/**
 * Whether a static ability says this blocker can block only attackers of a kind, and this attacker is not one (CR 509.1b,
 * "can-block-only"): "This token can block only creatures with flying" (Pinnacle Emissary's Drones) -- the blocker one the
 * ability affects, the attacker one its `attackers` does not describe. "You" is the ability's controller.
 */
export function blocksOnlyOthers(state, blockerId, attackerId) {
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "can-block-only") continue;
      const context = {controller: holder.controller, source: holderId};
      if (matchesSelector(ability.affects, state, blockerId, context) && !matchesSelector({what: "permanent", ...(ability.attackers ?? {})}, state, attackerId, context)) return true;
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
  /* Or an effect with a duration, for the players it names: "Until your next turn, you may cast sorcery spells as though they
     had flash" (Teferi, Time Raveler's +1; effects/permanents.mjs, effectUntil's `players`). */
  if ((state.effects ?? []).some((effect) => effect.rule === "cast-as-though-flash" && (effect.players ?? []).includes(player)
    && (effect.spells === true || (effect.spells && typeof effect.spells === "object" && matchesSelector({...effect.spells, what: "card", zone: object.zone}, state, id, {controller: player})))))
    return true;
  return playerStatics(state, "cast-as-though-flash", player).some(({ability, source}) => ability.spells === true
    || (ability.spells && typeof ability.spells === "object" && matchesSelector({...ability.spells, what: "card", zone: object.zone}, state, id, {controller: player, source})));
}

/** The "play-from" and similar static abilities a player's permanents give them: each such ability, with its source. */
export function playerStatics(state, rule, player) {
  const found = [];
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    if (holder.controller !== player) continue;
    for (const ability of held(holderId)) if (ability.kind === "static" && ability.rule === rule) found.push({ability: chosenFor(ability, holder), source: holderId});
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
  const held = staticAbilities(state);
  for (const holderId of [...state.zones.battlefield, ...commanding]) {
    const holder = state.objects[holderId];
    const fromCommand = holder.zone === "command";
    for (const own of held(holderId)) {
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

/* Every `spells-cost-more` static on the battlefield that makes this card cost more as this player casts it: its caster
   (anyone, unless it says you or an opponent), its spell selector, its condition -- and, for "spells your opponents cast that
   target this creature" (Terror of the Peaks, wave 4b; CR 601.2c, then 601.2f), `targeting`, a selector one of the spell's
   chosen targets must fit, read from the static's side (a counted target's choices among them). With no targets known yet,
   none fits it. */
function increasesOn(state, player, cardId, targets) {
  const object = state.objects[cardId];
  const found = [];
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const own of held(holderId)) {
      if (own.kind !== "static" || own.rule !== "spells-cost-more") continue;
      const ability = chosenFor(own, holder);
      const caster = ability.caster ?? "any";
      if (caster === "you" && player !== holder.controller) continue;
      if (caster === "opponent" && player === holder.controller) continue;
      const context = {controller: holder.controller, source: holderId};
      if (!matchesSelector({...(ability.affects ?? {}), what: "card", zone: object.zone}, state, cardId, context)) continue;
      /* "During your turn" (Tithe Taker): only while its condition holds, asked at each cast. */
      if (!conditionHolds(state, ability.condition, context)) continue;
      if (ability.targeting !== undefined && !targetsFit(state, ability.targeting, (targets ?? []).flat(), context)) continue;
      found.push({ability, holderId, holder});
    }
  }
  return found;
}

/** Whether a cost a static on the battlefield adds reads the spell's chosen targets (`targeting`): the caster's ways to
 *  choose them are then each costed (rules/actions.mjs, aimsFor). */
export const costsReadTargets = (state) => {
  const held = staticAbilities(state);
  return state.zones.battlefield.some((holderId) => held(holderId).some((a) => a.kind === "static" && a.rule === "spells-cost-more" && a.targeting !== undefined));
};

/** HOW MUCH LIFE MORE A SPELL COSTS (CR 601.2f, 119.4): "spells your opponents cast that target this creature cost an
 *  additional 3 life to cast" (Terror of the Peaks, wave 4b) -- each `spells-cost-more` static with `life` that applies
 *  (increasesOn), summed. A cast without paying its mana cost still pays it (CR 118.9d). */
export function lifeIncrease(state, player, cardId, targets = null) {
  /* One in mana adds no life (`life` absent). */
  return increasesOn(state, player, cardId, targets).reduce((n, {ability, holderId, holder}) => n + amountOf(state, ability.life ?? 0, {controller: holder.controller, source: holderId}), 0);
}

/** HOW MUCH MORE A SPELL COSTS (CR 601.2f): every `spells-cost-more` static on the battlefield whose spell selector fits
 *  this card, cast by whom it says -- anyone, unless it says you or an opponent (increasesOn). Generic mana, summed. */
export function costIncrease(state, player, cardId, targets = null) {
  const object = state.objects[cardId];
  if (!object) return 0;
  let total = 0;
  for (const {ability, holderId, holder} of increasesOn(state, player, cardId, targets)) {
    /* One in life is paid in life (lifeIncrease, below), not in mana. */
    if (ability.life !== undefined) continue;
    total += amountOf(state, ability.amount ?? 1, {controller: holder.controller, source: holderId});
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
/**
 * HOW MUCH A LOYALTY ABILITY'S COST GOES UP (CR 606.4): every `loyalty-costs-more` static on the battlefield whose `affects`
 * -- a player selector, "you" its controller -- takes in the player activating it. "Planeswalkers'
 * loyalty abilities you activate cost an additional [+1] to activate" (Carth the Lion): loyalty counters put on, summed
 * (`amount`, 1 unless it says). No condition is read (cards/index.mjs refuses one). rules/actions.mjs, costOf.
 */
export function loyaltyCostIncrease(state, player) {
  let total = 0;
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== "loyalty-costs-more") continue;
      const context = {controller: holder.controller, source: holderId};
      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;
      total += amountOf(state, ability.amount ?? 1, context);
    }
  }
  return total;
}

export function abilityCostIncrease(state, player) {
  let total = 0;
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
      if (ability.kind !== "static" || ability.rule !== rule || ability.affects?.what !== "player") continue;
      if (compileSelector(ability.affects)(state, player, {controller: holder.controller, source: holderId})) return true;
    }
  }
  /* Or an emblem's, from the command zone, where its abilities function (CR 114.4): "you have no maximum hand size"
     (Mordenkainen's), "you" the player who got it. */
  for (const id of (state.zones.command ?? []).flat()) {
    const holder = state.objects[id];
    if (holder?.emblem !== true) continue;
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static" || ability.rule !== rule || ability.affects?.what !== "player") continue;
      if (compileSelector(ability.affects)(state, player, {controller: holder.controller, source: id})) return true;
    }
  }
  /* Or an effect a spell made, for the players it names, for as long as it lasts: "you have no maximum hand size for the
     rest of the game" (Wisdom of Ages; CR 402.2, 611.2a; effects/permanents.mjs, effectUntil's `players`). */
  return (state.effects ?? []).some((effect) => effect.rule === rule && (effect.players ?? []).includes(player));
}

/** Whether any static ability on the battlefield -- or an effect with a duration ("can't be blocked this turn") -- changes `rule` for this object. */
export function ruleChanged(state, rule, id) {
  const held = staticAbilities(state);
  for (const holderId of state.zones.battlefield) {
    const holder = state.objects[holderId];
    for (const ability of held(holderId)) {
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
