/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE KEYWORDS THAT CHANGE WHEN.
 *
 * `docs/engine/PLAN.md` §3.1 (`keywords/`, one module per family) and §6's phase 2.3. After evasion and combat
 * (`combat.mjs`), the inventory's next most-used words across Rob's seven decks are FLASH (15 cards) and HASTE (6):
 * the two keywords that bend a timing rule rather than a combat one.
 *
 * FLASH IS PERMISSION, NOT A TYPE (CR 702.8a). A creature with flash is still a creature: it is cast any time its
 * controller could cast an instant, and it is still a permanent spell that resolves onto the battlefield. So the
 * sorcery-speed test asks one more question rather than the card changing what it is.
 *
 * SUMMONING SICKNESS IS ABOUT THE CONTROLLER'S TURN, NOT THE GAME'S (CR 302.6). A creature's {T} abilities, and its
 * attack, need it to have been under its controller's control continuously since THAT PLAYER'S most recent turn
 * began. On your own turn that is the turn now; on anyone else's it is your last one. Comparing with the game's
 * turn number instead is right for attacking (you only attack on your own turn) and wrong for every {T} ability used
 * on someone else's turn: a mana creature that entered during an opponent's turn would tap at once. Until this file
 * the engine offered a creature's {T} mana ability the turn it arrived, on any turn: a Llanowar Elves cast in main
 * one tapped for mana in main one.
 *
 * HASTE LIFTS BOTH HALVES OF IT (CR 702.10b): the attack and the {T} abilities. It does not untap anything and it
 * does nothing for a creature that is not sick.
 *
 * Both read the creature AS IT CURRENTLY IS (layers.mjs): a land animated this turn is a sick creature, and a
 * creature granted haste is a hasty one.
 */

import {keywordsOf, typesOf, controllerOf} from "../rules/layers.mjs";
import {ruleChanged} from "../rules/statics.mjs";

/** The family of §3.1, so `engine-coverage` counts these as behavior and not as words. */
export const KEYWORD_FAMILIES = Object.freeze({
  /** When a spell may be cast, and when a permanent may act. Split second (CR 702.61a; Siege Smash): while a spell with it
      is on the stack, no other spell is cast and no ability but a mana ability is activated (splitSecondOnStack). */
  timing: Object.freeze(["Flash", "Haste", "Split Second"]),
  /** Where a spell may be cast from: Flashback (CR 702.34a), from its owner's graveyard for its flashback cost, then
      exiled. rules/actions.mjs offers the cast, rules/stack.mjs and effects/zones.mjs exile it. Escape (CR 702.138a), from
      its owner's graveyard for its escape cost, mana and "exile N other cards from your graveyard" picked as the cast is
      taken; what escaped is marked so (702.138b) and enters with what it "escapes with" (702.138c, rules/replacement.mjs).
      Rebound (CR 702.88a), from exile at its caster's next upkeep: cast from its owner's hand and resolved, exiled instead
      of going to the graveyard (rules/stack.mjs), then cast free if they choose (effects/asking.mjs, `play`). */
  /** Unearth (CR 702.84a), an activated ability of the card in its owner's graveyard at sorcery speed: returned with haste,
      exiled at the next end step, and exiled instead should it leave the battlefield any other way (cards/index.mjs;
      effects/permanents.mjs, afterwards; rules/replacement.mjs). */
  /** Suspend (CR 702.62a), from its owner's hand: a special action exiling it with its time counters for its suspend cost,
      at the timing it could be cast (rules/actions.mjs); then one removed each upkeep, and the free cast (rules/trigger.mjs). */
  zones: Object.freeze(["Flashback", "Escape", "Rebound", "Unearth", "Suspend"]),
  /** What happens as a spell is cast: Storm (CR 702.40a), "when you cast this spell, copy it for each spell cast before
      it this turn" -- a triggered ability of the spell (rules/actions.mjs). */
  cast: Object.freeze(["Storm"]),
  /** How a spell may be paid for: Convoke (CR 702.51a), each creature its caster taps paying {1} or one mana of its color --
      offered beside the cast the pool pays, the creatures picked once it is taken (rules/actions.mjs, rules/mana.mjs).
      Evoke (CR 702.74a), its evoke cost rather than its mana cost -- an alternative cost (rules/actions.mjs) -- and, if it
      was paid, the permanent sacrificed as it enters (cards/index.mjs compiles both abilities). */
  /** Prowl (CR 702.76a), an alternative cost offered once a player was dealt combat damage this turn by a source of its
      caster's with one of its creature types (rules/combat.mjs keeps them; script/condition.mjs), the permanent marked as
      cast for it (rules/stack.mjs). Escalate (CR 702.120a), an additional cost for each mode chosen beyond the first, paid with
      the rest of the cost (rules/actions.mjs). Overload (CR 702.96a-b), an alternative cost whose cast carries the spell's
      "each" effects, written out by the card, and no targets (cards/index.mjs, rules/actions.mjs, rules/stack.mjs): built
      for Winds of Abandon, credited with Mizzium Mortars and Vandalblast. */
  /** Surge (CR 702.117a) and freerunning (CR 702.173a), alternative costs offered once its caster has cast another spell
      this turn, or one of their Assassins or commanders dealt a player combat damage (script/condition.mjs; rules/combat.mjs
      keeps the damage), what each casts marked as cast for it (`paidFor`; rules/actions.mjs, rules/stack.mjs). */
  /** Tiered (CR 702.183a): one mode chosen as it is cast, and that mode's cost paid besides (cards/index.mjs puts the costs
      among the spell's additional costs; rules/actions.mjs makes each mode its own cast). */
  pay: Object.freeze(["Convoke", "Evoke", "Prowl", "Escalate", "Overload", "Surge", "Freerunning", "Tiered"]),
  /** How a permanent enters: Riot (CR 702.136a), with a +1/+1 counter or with haste, its controller's choice as it arrives --
      a replacement on its own entering (cards/index.mjs, rules/replacement.mjs), asked once it is there (rules/entering.mjs).
      Compleated (CR 702.150a): two fewer loyalty counters for each Phyrexian symbol of its cost its caster paid with life
      (rules/replacement.mjs, enteringModifications). */
  enter: Object.freeze(["Riot", "Compleated"]),
});

/**
 * CR 302.6: a creature that has not been under its controller's control continuously since their most recent turn
 * began, and has no haste. Not a creature, never sick.
 */
export function summoningSick(state, id) {
  const object = state.objects[id];
  if (!object || !typesOf(state, id).includes("Creature")) return false;
  if (keywordsOf(state, id).includes("Haste")) return false;
  const turnBegan = state.players[controllerOf(state, id)]?.turnBegan ?? 0;
  return object.controlledSinceTurn >= turnBegan;
}

/**
 * CR 302.6 for a creature's {T} abilities alone: sick as above, unless a static ability lets its controller "activate
 * abilities of creatures you control as though those creatures had haste" (Thousand-Year Elixir; `rule:
 * "activate-as-though-haste"`, rules/statics.mjs) -- haste's second half (CR 702.10c) and not its first: it still can't
 * attack (702.10b is not given). Read wherever a {T} ability is offered or paid: an activated ability's cost, a mana
 * ability, a source tapped to pay an "unless" cost.
 */
export function sickForAbilities(state, id) {
  return summoningSick(state, id) && !ruleChanged(state, "activate-as-though-haste", id);
}

/**
 * SPLIT SECOND (CR 702.61a; Siege Smash): whether a spell with it is on the stack -- as it is there, its keywords derived.
 * While one is, no player may cast another spell or activate an ability that is not a mana ability: rules/actions.mjs offers
 * nothing else, and casts nothing as an effect resolves. Mana abilities and special actions (a face-down permanent turned
 * face up) stay open, and triggered abilities trigger and go on the stack as ever (702.61b). Copied, a copy has it too
 * (CR 707.2). Instances are redundant (702.61c).
 */
/* An ability on the stack has no object of its own (rules/stack.mjs, pushAbility): only a spell, or a copy of one, has it. */
export const splitSecondOnStack = (state) => state.stack.some((entry) => state.objects[entry.objectId] !== undefined
  && keywordsOf(state, entry.objectId).includes("Split Second"));

/** CR 702.8a: this card may be cast any time its controller could cast an instant. */
export const hasFlash = (state, id) => keywordsOf(state, id).includes("Flash");
