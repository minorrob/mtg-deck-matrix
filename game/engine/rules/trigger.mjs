/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRIGGERED ABILITIES: CR 603.
 *
 * `docs/engine/PLAN.md` §3.3, seventh row: "leaves-the-battlefield look-back (603.10), intervening
 * if".
 *
 * A TRIGGER DOES NOT RESOLVE WHERE IT HAPPENED (CR 603.3). It triggers, waits, and is put on the
 * stack the next time a player would receive priority. Running the effect at the moment of the
 * event is the tempting shortcut and it gets the whole game wrong quietly: the trigger cannot be
 * responded to, it happens before state-based actions rather than after, and two triggers from one
 * event resolve in the order the code noticed them rather than the order their controllers chose.
 *
 * APNAP (CR 603.3b). The ACTIVE player's triggers go on the stack first, then each other player's
 * in turn order. Because the stack is last-on-first-off, the active player's therefore resolve
 * LAST. That inversion is the classic error and it stays invisible until two triggers fight over
 * the same permanent.
 *
 * A PLAYER ORDERS THEIR OWN. Two of your triggers at once is a decision and it is yours, not a
 * timestamp the engine picks (CR 603.3b again).
 *
 * THE LOOK-BACK IS NOT SPECIAL MACHINERY (CR 603.10a, 603.6e). "Whenever this creature dies" has to
 * see the creature, and by the time the trigger is collected the creature is gone — a zone change
 * makes a new object, so it is not even the same object any more. Every rules module here takes its
 * `card` snapshot BEFORE applying a move, so the event already carries the object as it was. The
 * look-back falls out of the event envelope rather than needing a shadow copy of the board.
 *
 * WHAT A TRIGGER WATCHES IS THE ENGINE'S OWN EVENTS. A trigger condition is data over the same
 * `CommanderProbeEvent@1` records the journal writes, so phase 2's card script compiles to this
 * rather than to a private vocabulary that would need translating.
 *
 * A TRIGGER'S TARGETS ARE CHOSEN AS IT GOES ON THE STACK (CR 603.3d), by its controller, before anyone receives
 * priority (engine 2.4c). One with no legal target is removed from the stack, never put there to fizzle later. The
 * question is `trigger-targets`, one per trigger, lowest on the stack first, offering each legal way to aim it --
 * the same enumeration a cast is offered by (script/bind.mjs).
 *
 * "WHENEVER ANOTHER CREATURE ENTERS" (2.4c): `who: "another"` is any arrival but this permanent's own, `who: "any"`
 * any at all, and `filter` the selector the arrival must match ("a creature you control"), "you" being the
 * trigger's controller.
 *
 * DELAYED TRIGGERS (CR 603.7), created by a resolving effect: "at the beginning of the next end step" (M4 phase 3,
 * batch 13), "at the beginning of the next turn's upkeep", and on an event -- "when that creature dies this turn",
 * "whenever a creature dies this turn" (batch 17). Other moments ("when you next cast a creature spell") are not yet. WHAT IS DEFERRED AND NAMED: state triggers (CR 603.8), which trigger
 * while a condition holds rather than on an event.
 */

import {conditionHolds} from "../script/condition.mjs";
import {pushAbility, becameTarget} from "./stack.mjs";
import {cardsIn, usesThisTurn, recordUse} from "../state/index.mjs";
import {playerStatics} from "./statics.mjs";
import {matchesSelector, matchesLastKnown} from "../script/filter.mjs";
import {abilitiesOf, characteristicsOf} from "./layers.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {targetChoices, targetName, isHostile, isChoosing, targetCandidates, countedChoice, modalScript} from "../script/bind.mjs";

/* An ability lives where its card is (CR 113.6). A triggered ability of a permanent watches the
   game only while that permanent is on the battlefield, so an ability on a card in a graveyard is
   not watching anything — which is why a dead creature's "whenever a creature enters" stays quiet. */
const WATCHING_ZONES = ["battlefield"];

/* Whether a player is the one a trigger asks about: "you" its controller, "opponent" anyone else, "any" anyone. */
const whoseIs = (rule, player, controller) => (rule === "you" ? player === controller : rule === "opponent" ? player !== controller : true);
/* Whether an object fits a "this" / "another" / "any" rule and a filter, read where it is now. */
function fits(state, id, condition, sourceId, controller) {
  if (id === null || id === undefined) return false;
  if (condition.who === "self" && id !== sourceId) return false;
  if (condition.who === "another" && id === sourceId) return false;
  if (condition.filter && !(state.objects[id] && matchesSelector(condition.filter, state, id, {controller, source: sourceId}))) return false;
  return true;
}

/* "If that spell is a Lesson" (Toph), "if it's a permanent spell" (Nalfeshnee): the spell as it is now, kept with the
   trigger, so a condition about it can still be answered once it has left the stack -- countered in response -- as it
   last existed there (CR 608.2h; script/condition.mjs reads `was`). */
function spellWas(state, spell) {
  const object = state.objects[spell];
  if (!object) return {};
  return {was: {cardId: spell, types: [...(object.types ?? [])], subtypes: [...(object.subtypes ?? [])], supertypes: [...(object.supertypes ?? [])],
    controller: object.controller, token: object.token === true}};
}

/**
 * WHAT ENTERED THE BATTLEFIELD THIS TURN, AND UNDER WHOSE CONTROL: "the number of creatures that entered the battlefield
 * under your control this turn" (Kinbinding), "if another creature entered the battlefield under your control this turn"
 * (Wary Farmer). Each arrival is kept as its events are read for triggers -- once, as "whenever a creature you control
 * enters" reads it, and as it then is: under the control an effect put it under ("onto the battlefield under your
 * control"), an arrival still asking what it copies kept once it is told. Kept for its controller as what it was
 * (`matchesLastKnown` reads it), so one that has since left still counts; cleared as a turn begins (rules/turn.mjs).
 */
function recordArrivals(state, events) {
  for (const event of events ?? []) {
    const fields = event.data?.fields ?? {};
    if (event.kind !== "GameEventCardChangeZone" || fields.to?.zoneType !== "Battlefield" || fields.awaitingCopy === true) continue;
    const id = fields.enteredAs ?? fields.becomes ?? fields.card?.cardId;
    const object = state.objects[id];
    if (object?.zone !== "battlefield") continue;
    const now = characteristicsOf(state, id);
    if (!state.players[now.controller]) continue;
    (state.players[now.controller].enteredThisTurn ??= []).push({cardId: id, controller: now.controller, types: [...now.types],
      subtypes: [...(object.subtypes ?? [])], supertypes: [...(object.supertypes ?? [])], everyCreatureType: now.everyCreatureType === true, token: object.token === true});
  }
}

/**
 * WHAT A TRIGGER IS ABOUT, ONE ENTRY PER TRIGGERING (CR 603.2c). "Whenever a creature you control attacks" triggers once
 * for each creature that attacks, so an event can answer more than once; each answer says what it was about -- the spell
 * cast and its caster, the attacking creature and the player it attacks, the creature that dealt damage and the player
 * it was dealt to, the player who drew -- for "that player" and "that card" in what the ability does.
 */
function subjects(state, event, condition, sourceId, controller) {
  /* "Deals combat damage to a player or planeswalker" (Grateful Apparition): damage dealt to a permanent is watched too. */
  const toPermanent = condition.planeswalkers === true && condition.on === "GameEventPlayerDamaged" && event.kind === "GameEventCardDamaged";
  if (event.kind !== condition.on && !toPermanent) return [];
  const fields = event.data?.fields ?? {};
  /* "Whenever you cast a noncreature spell" (CR 601.2i): the spell on the stack, and who cast it. */
  /* "Whenever you scry or surveil" (CR 701.22a, 701.25a): who did it. */
  if (condition.on === "GameEventScried") {
    const scrier = fields.player?.playerId;
    return whoseIs(condition.scrier ?? "you", scrier, controller) ? [{player: scrier}] : [];
  }
  /* "Whenever you activate a loyalty ability" (CR 606): an ability, not a spell, with a loyalty cost, by `activator`; the
     counters its cost removed at least `removedAtLeast`. */
  if (condition.on === "GameEventSpellAbilityCast" && condition.loyaltyActivated) {
    if (fields.sa?.isSpell !== false || !Number.isInteger(fields.sa?.loyalty)) return [];
    const activator = fields.si?.actor?.playerId;
    if (!whoseIs(condition.activator ?? "you", activator, controller)) return [];
    if (condition.removedAtLeast && -fields.sa.loyalty < condition.removedAtLeast) return [];
    return [{card: fields.card?.cardId, player: activator}];
  }
  if (condition.on === "GameEventSpellAbilityCast") {
    if (!fields.sa?.isSpell) return [];
    /* The spell is the stack entry's object: the card in hand became a new object as it moved to the stack (CR 400.7). */
    const caster = fields.si?.actor?.playerId;
    const spell = state.stack.find((e) => e.stackId === fields.sa?.stackId)?.objectId ?? fields.card?.cardId;
    if (!whoseIs(condition.caster ?? "you", caster, controller)) return [];
    if (condition.castFrom && fields.castFrom !== condition.castFrom) return [];
    if (condition.filter && !(state.objects[spell] && matchesSelector({...condition.filter, what: "spell"}, state, spell, {controller, source: sourceId}))) return [];
    /* "An instant or sorcery spell that targets a creature" (Rehearsed Debater): one of what it targets, chosen as it was
       cast (CR 601.2c) and so before it became cast (601.2i), fits `targets`. A player it targets fits no such selector. */
    if (condition.targets) {
      const aimed = (state.stack.find((e) => e.stackId === fields.sa?.stackId)?.targets ?? []).flat();
      if (!aimed.some((t) => t?.kind === "object" && state.objects[t.id] && matchesSelector(condition.targets, state, t.id, {controller, source: sourceId}))) return [];
    }
    /* "Their first noncreature spell each turn": this is the first of the caster's spells this turn the filter fits. And
       "copy it for each other instant and sorcery spell you've cast before it this turn" (Thousand-Year Storm): how many
       of them came before this one, counted now, as it triggers -- a spell cast later, in response, did not. */
    /* "Whenever an opponent casts their second spell each turn" (Monologue Tax): the Nth, `nthThisTurn`. */
    if (condition.firstThisTurn || condition.nthThisTurn || condition.countBefore) {
      const {what: _ignored, ...shape} = condition.filter ?? {};
      const fitted = (state.players[caster]?.castThisTurn ?? []).filter((cast) => matchesLastKnown(shape, {...cast, controller: caster}, {controller}));
      if (condition.firstThisTurn && fitted.length !== 1) return [];
      if (condition.nthThisTurn && fitted.length !== condition.nthThisTurn) return [];
      if (condition.countBefore) return [{card: spell, player: caster, castBefore: Math.max(0, fitted.length - 1), ...spellWas(state, spell)}];
    }
    return [{card: spell, player: caster, ...spellWas(state, spell)}];
  }
  /* "Whenever this creature attacks", "whenever a creature you control attacks" (CR 508.1m): each attacker, and the
     player it attacks. */
  /* "Whenever you attack" ("attackers declared"): the attack as a whole, by whom, with how many, at whom. */
  if (condition.on === "GameEventAttackersDeclared" && condition.declared) {
    const attacker = fields.player?.playerId, attacks = fields.attackers ?? [];
    if (!attacks.length || !whoseIs(condition.attacker ?? "you", attacker, controller)) return [];
    if (condition.atLeast && attacks.length < condition.atLeast) return [];
    /* "Whenever you attack with one or more non-Gnome creatures" (Anim Pakal): an attacker the filter fits. */
    if (condition.filter && !attacks.some((a) => fits(state, a.card?.cardId, {filter: condition.filter}, sourceId, controller))) return [];
    /* Attacking a planeswalker of a player's is not attacking that player (CR 506.3): not "attacking you", and no player
       attacked for "that player". */
    if (condition.notAttacking === "you" && attacks.some((a) => a.defender?.playerId === controller && !a.defender.planeswalker)) return [];
    /* Each player attacked, "that player"; the attacking player is `attacker` ("that attacking player creates ..."). One of
       this ability's controller's opponents only, when it says so (CR 508.3e). */
    if (condition.eachDefender) return [...new Set(attacks.filter((a) => !a.defender?.planeswalker).map((a) => a.defender?.playerId))]
      .filter((player) => condition.defender !== "opponent" || player !== controller).map((player) => ({player, attacker}));
    return [{player: attacker}];
  }
  if (condition.on === "GameEventAttackersDeclared") {
    const matched = (fields.attackers ?? []).filter((a) => fits(state, a.card?.cardId, condition, sourceId, controller))
      /* "Attacks for the first time each turn": its first attack this turn is this one (rules/combat.mjs counts them). */
      .filter((a) => !condition.firstTime || usesThisTurn(state, a.card?.cardId, "attacked") === 1)
      /* "Attack one of your opponents": the player attacked is not this ability's controller. A planeswalker of theirs only
         when it says "or a planeswalker they control" (`planeswalkers`, Frontier Warmonger; CR 506.3). */
      .filter((a) => condition.defender !== "opponent" || (a.defender?.playerId !== undefined && a.defender.playerId !== controller
        && (!a.defender.planeswalker || condition.planeswalkers === true)))
      /* "Whenever a creature attacks you or a planeswalker you control" (Jace, Reality Sculptor): `defender` "you". */
      .filter((a) => condition.defender !== "you" || (a.defender?.playerId === controller && (!a.defender.planeswalker || condition.planeswalkers === true)));
    /* "Whenever a player attacks with three or more creatures" (Aurelia): the attack as a whole, counted -- one event
       declares every attacker (CR 508.1). */
    if (condition.atLeast && matched.length < condition.atLeast) return [];
    /* And its controller -- the attacking player (CR 508.1a): "it deals 1 damage to its controller" (Vengeful Ancestor), as
       it last was should it leave before the trigger resolves (CR 608.2h). */
    return matched.map((a) => ({card: a.card.cardId, player: a.defender?.playerId, controller: fields.player?.playerId}));
  }
  /* "Whenever this deals combat damage to a player", "whenever a creature you control deals combat damage to an
     opponent" (CR 510.2, 120.3): the source, and the player dealt the damage. */
  if (condition.on === "GameEventPlayerDamaged") {
    if (condition.combat && fields.combat !== true) return [];
    /* "Whenever a source you control deals noncombat damage to an opponent" (Niv-Mizzet, Visionary). */
    if (condition.noncombat && fields.combat === true) return [];
    /* "A source you control" -- a permanent or a spell: its controller as the damage was dealt. */
    if (condition.sourceYours && fields.source?.controller !== controller) return [];
    /* A planeswalker dealt it, still there as triggers are collected (before state-based actions): about its controller. */
    const damaged = toPermanent ? fields.card?.cardId : undefined;
    if (toPermanent && !(state.objects[damaged] && characteristicsOf(state, damaged).types.includes("Planeswalker"))) return [];
    const to = toPermanent ? state.objects[damaged].controller : fields.target?.playerId, source = fields.source?.cardId;
    if (condition.to === "opponent" && to === controller) return [];
    if (!fits(state, source, condition, sourceId, controller)) return [];
    /* "Create that many Treasure tokens": the damage dealt (CR 120.3), with who dealt it and to whom. */
    return [{card: source, player: to, amount: fields.amount ?? 0}];
  }
  /* "Whenever a source deals damage to this creature" (Phyrexian Obliterator): about the source, its controller -- "that
     source's controller" -- and how much. */
  if (condition.on === "GameEventCardDamaged") {
    if (condition.to === "self" && fields.card?.cardId !== sourceId) return [];
    if (condition.combat && fields.combat !== true) return [];
    /* "Whenever a Dragon you control is dealt damage, it deals that much damage" (Wrathful Red Dragon), "this enchantment
       deals that much damage to that creature's controller" (Repercussion): about the creature dealt the damage, read as
       the damage is dealt (triggers are collected before state-based actions, so a creature dealt lethal damage is still
       there). */
    if (condition.to === "creature" || condition.to === "enchanted") {
      const damaged = fields.card?.cardId;
      if (!state.objects[damaged]) return [];
      if (condition.to === "enchanted" && state.objects[sourceId]?.attachedTo !== damaged) return [];
      if (condition.filter && !matchesSelector({what: "permanent", ...condition.filter}, state, damaged, {controller, source: sourceId})) return [];
      return [{card: damaged, player: state.objects[damaged].controller, amount: fields.amount ?? 0}];
    }
    return [{card: fields.source?.cardId, player: fields.source?.controller, amount: fields.amount ?? 0}];
  }
  /* "Whenever you sacrifice a permanent": the card it became, and who sacrificed it. */
  if (condition.on === "GameEventCardChangeZone" && condition.sacrificed) return matches(state, event, condition, sourceId, controller) ? [{card: fields.becomes, player: fields.sacrificer}] : [];
  /* "Whenever you cycle a card" (Escape Protocol) and "when you cycle this card" -- this card discarded to pay a cycling
     cost (CR 702.29c): the card it became in the graveyard, who cycled it, and the X paid for it. A card's own, from the
     zone it went to (collectTriggers). */
  if (condition.on === "GameEventCardChangeZone" && condition.cycled) {
    if (fields.cycled !== true) return [];
    const cycler = fields.from?.player?.playerId;
    if (!whoseIs(condition.cycler ?? "you", cycler, controller)) return [];
    const card = fields.becomes;
    if (condition.who === "self" && card !== sourceId) return [];
    return [{card, player: cycler, ...(fields.cycledX !== undefined ? {x: fields.cycledX} : {})}];
  }
  /* "Whenever you discard a card", "whenever an opponent discards a creature card" (CR 701.9): the card it became in the
     graveyard (a discard as a cost -- cycling, "discard a card:" -- is a discard too), and who discarded it. */
  if (condition.on === "GameEventCardChangeZone" && condition.discarded) {
    if (fields.discarded !== true) return [];
    const discarder = fields.from?.player?.playerId;
    if (!whoseIs(condition.discarder ?? "you", discarder, controller)) return [];
    const card = fields.becomes;
    if (condition.filter && !(card !== undefined && state.objects[card] && matchesSelector({...condition.filter, what: "card", zone: "graveyard"}, state, card, {controller, source: sourceId}))) return [];
    return [{card, player: discarder}];
  }
  /* Ward (CR 702.21a): this permanent became the target of a spell or ability an opponent controls -- about that player
     and the stack entry, which "counter it" counters (script/bind.mjs, `stack: "that"`). */
  /* "Whenever this creature becomes tapped" (CR 701.26a): each permanent tapped, what it is about -- the tap events the rules
     emit as an attacker, a {T} cost, a creature tapped to pay or crew, and an effect turn a permanent sideways. */
  if (condition.on === "GameEventCardTapped") {
    const id = fields.card?.cardId;
    return fields.tapped === true && fits(state, id, condition, sourceId, controller) ? [{card: id}] : [];
  }
  if (condition.on === "GameEventBecomesTarget") {
    /* "Whenever this creature becomes the target", and (batch 76) "whenever a Dragon you control becomes the target"
       (`who` another or any, `filter` what was targeted); "of a spell" (`spell`), not an ability. */
    if (!fits(state, fields.targetId, condition, sourceId, controller)) return [];
    if (condition.spell && fields.kind !== "spell") return [];
    const by = fields.by?.playerId;
    if (condition.by === "opponent" && (by === undefined || by === controller)) return [];
    return [{card: fields.targetId, player: by, stackId: fields.stackId}];
  }
  /* "Whenever you gain life" (CR 119.9): each gain its own event -- lifelink from two creatures at once is two -- about the
     player and how much. A loss, or no change, is not a gain. */
  if (condition.on === "GameEventPlayerLivesChanged") {
    const player = fields.player?.playerId, gained = (fields.newLives ?? 0) - (fields.oldLives ?? 0);
    /* "Whenever an opponent loses life" (batch 78): a loss, about the player and how much. */
    if (condition.loser !== undefined) return gained < 0 && whoseIs(condition.loser, player, controller) ? [{player, amount: -gained}] : [];
    if (!(gained > 0) || !whoseIs(condition.gainer ?? "you", player, controller)) return [];
    return [{player, amount: gained}];
  }
  /* "Whenever a player taps a land for mana" (Manabarbs): what was tapped, and who tapped it. */
  if (condition.on === "GameEventManaPool") return tappedForMana(state, fields, condition, sourceId, controller) ? [{card: fields.source?.cardId, player: fields.player?.playerId}] : [];
  /* "Whenever you draw a card", "whenever an opponent draws a card" (CR 121.1): the drawer. */
  if (condition.on === "GameEventCardChangeZone" && condition.drawn) {
    if (fields.drawn !== true) return [];
    const drawer = fields.to?.player?.playerId;
    return whoseIs(condition.drawer ?? "you", drawer, controller) ? [{player: drawer}] : [];
  }
  if (!matches(state, event, condition, sourceId, controller)) return [];
  /* A step's beginning is about the player whose turn it is: "that player draws an additional card" (Howling Mine). */
  if (event.kind === "GameEventTurnPhase" && fields.playerTurn?.playerId !== undefined) return [{player: fields.playerTurn.playerId}];
  /* A zone change is about what the card became, when it went somewhere public (CR 400.7e): "whenever another creature
     you control dies, return that card to its owner's hand" returns the card in the graveyard. Onto the battlefield, it is
     about the player who controls it too: "whenever a creature an opponent controls enters, you may have that player lose
     1 life" (Suture Priest). */
  if (event.kind === "GameEventCardChangeZone" && fields.becomes !== undefined) {
    const player = fields.to?.zoneType === "Battlefield" ? state.objects[fields.becomes]?.controller : undefined;
    return [{card: fields.becomes, ...(Number.isInteger(player) ? {player} : {})}];
  }
  return [{}];
}

/** Whether an event matches a trigger condition. */
function matches(state, event, condition, sourceId, controller) {
  if (event.kind !== condition.on) return false;
  const fields = event.data?.fields ?? {};

  if (condition.on === "GameEventCardChangeZone") {
    /* A sacrifice (effects/zones.mjs sacrificeOne): by whom, and not this one if it says "another". Asked here, where a
       permanent's own departure is read too, so a creature destroyed does not trigger "whenever you sacrifice". */
    if (condition.sacrificed) {
      if (fields.sacrificed !== true || !whoseIs(condition.sacrificer ?? "you", fields.sacrificer, controller)) return false;
      if (condition.another && (fields.leftBehind?.cardId ?? fields.card?.cardId) === sourceId) return false;
    }
    if (condition.from && fields.from?.zoneType !== condition.from) return false;
    if (condition.to && fields.to?.zoneType !== condition.to) return false;
    /* "Put into your graveyard from anywhere" (Moonshadow): the card it became there, read where it now is -- a token is no
       card (CR 108.2b) -- in the graveyard of its owner (CR 400.3). */
    if (condition.intoGraveyard) {
      const card = fields.becomes !== undefined ? state.objects[fields.becomes] : undefined;
      if (!card || card.token || !whoseIs(condition.owner ?? "you", card.owner, controller)) return false;
      return !condition.filter || matchesSelector({...condition.filter, what: "card", zone: "graveyard"}, state, fields.becomes, {controller, source: sourceId});
    }
    /* "Whenever one or more cards leave your graveyard" (Garrison Excavator): the graveyard is its card's owner's. */
    if (condition.leftGraveyard) return whoseIs(condition.owner ?? "you", fields.card?.owner, controller);
    /* `self` means this permanent, compared against the card AS IT WAS — the event's snapshot, not
       the object, because for a death the object no longer exists. An arrival is the other way round:
       the card that moved was the one on the stack or in hand, and the permanent that arrived is a new
       object (CR 400.7), which the event names as `enteredAs`. */
    const moved = fields.enteredAs ?? fields.card?.cardId;
    if (condition.who === "self" && moved !== sourceId) return false;
    if (condition.who === "another" && moved === sourceId) return false;
    /* "When this land enters untapped": as it entered (the event says so), not as it is now. */
    if (condition.untapped && fields.enteredTapped === true) return false;
    /* What arrived must match (`filter`), read where it now is; "you" is this trigger's controller. What LEFT the
       battlefield ("another creature you control dies") is read as it last existed (CR 603.10a). */
    if (condition.filter) {
      const departed = fields.from?.zoneType === "Battlefield" ? fields.leftBehind : null;
      const fits = departed ? matchesLastKnown(condition.filter, departed, {controller, source: sourceId})
        : state.objects[moved] && matchesSelector(condition.filter, state, moved, {controller, source: sourceId});
      if (!fits) return false;
    }
    return true;
  }

  /* A SAGA'S CHAPTER (CR 714.2c): "when one or more lore counters are put onto this Saga, if the number of lore counters
     on it was less than N and became at least N" -- its own counters of the kind, from below N to N or more. */
  /* "Whenever one or more +1/+1 counters are put on this" (cards/index.mjs, `counter added`): more of them than before. */
  if (condition.on === "GameEventCardCounters" && condition.counterAdded)
    return fields.card?.cardId === sourceId && fields.type === condition.counter && (fields.newValue ?? 0) > (fields.oldValue ?? 0);
  if (condition.on === "GameEventCardCounters")
    return fields.card?.cardId === sourceId && fields.type === condition.counter && (fields.oldValue ?? 0) < condition.reaches && (fields.newValue ?? 0) >= condition.reaches;

  if (condition.on === "GameEventTurnPhase") {
    if (condition.phase && fields.phase !== condition.phase) return false;
    if (condition.yourTurn && fields.playerTurn?.playerId !== controller) return false;
    return true;
  }

  return true;
}

/* CR 603.4, the intervening "if": checked when the ability WOULD trigger, and again on resolution.
   An ability whose condition is false when the event happens does not trigger at all — it is not
   put on the stack and then removed, it never goes on. */
/* An intervening "if" (CR 603.4) is asked as the event happens -- here -- and again as the ability resolves (stack.mjs).
   The grammar is script/condition.mjs's. */

/**
 * Find every ability that triggers on these events and queue it (CR 603.2).
 *
 * Nothing goes on the stack here. `openTriggers` does that at the next priority, which is the rule.
 *
 * @param {Array} events  what just happened, as the rules modules returned it
 */
/* "THAT ABILITY TRIGGERS AN ADDITIONAL TIME" (Panharmonicon, Teysa Karlov, Annie Joins Up; CR 603.2d): one more for
   each `triggers-again` static of the trigger's controller whose `affects` names the ability's source -- a permanent, or
   one that has just left the battlefield, read as it last was (Teysa's own "when this dies") -- and whose `cause`, when
   it says one, is the event that triggered it. */
function triggersAgain(state, event, controller, sourceId, lastSeen = null, departed = []) {
  let times = 0;
  /* And one that left the battlefield in this same action, looking back (CR 603.10a): Teysa dying with the others still
     doubles what their deaths trigger (her ruling). Only for a departure; an arrival does not look back. */
  const leaving = event.kind === "GameEventCardChangeZone" && event.data?.fields?.from?.zoneType === "Battlefield";
  const lookBack = leaving ? departed.filter((gone) => gone?.controller === controller)
    .flatMap((gone) => (gone.abilities ?? []).filter((a) => a.kind === "static" && a.rule === "triggers-again").map((ability) => ({ability, source: gone.cardId}))) : [];
  for (const {ability, source: holder} of [...playerStatics(state, "triggers-again", controller), ...lookBack]) {
    const context = {controller, source: holder};
    /* "Mardu -- If a creature attacking causes a triggered ability ... to trigger" (Windcrag Siege): its condition. */
    if (!conditionHolds(state, ability.condition, context)) continue;
    let theirs = false;
    /* A key last known information does not keep (filter.mjs) is not a match. */
    try { theirs = lastSeen ? matchesLastKnown(ability.affects, lastSeen, context) : matchesSelector(ability.affects, state, sourceId, context); } catch { theirs = false; }
    if (!theirs) continue;
    if (ability.cause && !causedBy(state, event, ability.cause, context)) continue;
    times += 1;
  }
  return times;
}
/* The event a trigger triggered on, as a `triggers-again` names it: something entering (what arrived, where it is now),
   dying (as it last was), or attacking. */
function causedBy(state, event, cause, context) {
  const fields = event.data?.fields ?? {};
  if (cause.event === "enters") {
    const arrived = fields.enteredAs ?? fields.card?.cardId;
    return event.kind === "GameEventCardChangeZone" && fields.to?.zoneType === "Battlefield" && state.objects[arrived]?.zone === "battlefield"
      && matchesSelector({what: "permanent", ...(cause.filter ?? {})}, state, arrived, context);
  }
  if (cause.event === "dies") return event.kind === "GameEventCardChangeZone" && fields.from?.zoneType === "Battlefield" && fields.to?.zoneType === "Graveyard"
    && Boolean(fields.leftBehind) && matchesLastKnown(cause.filter ?? {}, fields.leftBehind, context);
  if (cause.event === "attacks") return event.kind === "GameEventAttackersDeclared" && (fields.attackers ?? []).length > 0;
  return false;
}

/* TAPPED FOR MANA (CR 605.1b): a mana ability whose cost tapped its source -- by whom (`tapper`), what (`filter`, `self`,
   `enchanted`, the permanent this Aura enchants), and what it made (`produced`, "a permanent for {C}"). */
function tappedForMana(state, fields, condition, sourceId, controller) {
  if (fields.tapped !== true) return false;
  if (!whoseIs(condition.tapper ?? "you", fields.player?.playerId, controller)) return false;
  const tapped = fields.source?.cardId;
  if (condition.self && tapped !== sourceId) return false;
  if (condition.enchanted && state.objects[sourceId]?.attachedTo !== tapped) return false;
  if (condition.produced && !((fields.produced ?? {})[condition.produced] > 0)) return false;
  if (condition.filter && !(state.objects[tapped] && matchesSelector({what: "permanent", ...condition.filter}, state, tapped, {controller, source: sourceId}))) return false;
  return true;
}

/**
 * THE TRIGGERED MANA ABILITIES THIS MANA EVENT TRIGGERS (CR 605.1b): not put on the stack -- the caller adds what each
 * makes at once, to the player who tapped (its controller, for "its controller adds"). "One mana of any type that land
 * produced": one of what it made.
 */
export function manaTriggered(state, event) {
  const fields = event?.data?.fields ?? {};
  const made = [];
  for (const id of state.zones.battlefield) {
    const holder = state.objects[id];
    for (const ability of holder.abilities ?? []) {
      const mana = ability.kind === "triggered" ? ability.trigger?.manaAbility : null;
      if (!mana || !tappedForMana(state, fields, ability.trigger, id, holder.controller)) continue;
      const [kind] = Object.keys(fields.produced ?? {}).filter((k) => fields.produced[k] > 0);
      const adds = mana.produced ? (kind ? {[kind]: 1} : null) : mana.mana;
      if (adds) made.push({player: fields.player?.playerId, mana: adds, source: id});
    }
  }
  return made;
}

export function collectTriggers(state, events) {
  if (!state.pendingTriggers) state.pendingTriggers = [];
  recordArrivals(state, events);
  /* Triggers that trigger again (triggersAgain): copied once this action is read, so a "one or more" trigger is copied
     with everything it came to be about. */
  const again = [];
  /* EVERYTHING THAT LEFT THE BATTLEFIELD IN THIS ONE ACTION, looking back (CR 603.10a): a board wipe kills Blood Artist
     with the rest, and it sees every one of them die, its own death included. One action's events are read as one
     moment -- a wipe, a round of state-based actions; an effect that destroys one thing and then another in a single
     resolution is read the same way. */
  const departed = (events ?? []).filter((e) => e.kind === "GameEventCardChangeZone" && e.data?.fields?.from?.zoneType === "Battlefield" && e.data.fields.leftBehind)
    .map((e) => e.data.fields.leftBehind);
  /* "WHENEVER ONE OR MORE other creatures die" (`batch`): everything this action did is one event for it (CR 603.2c), so it
     triggers once, about all of them (`about.cards`: "for each of them"). One entry per source and ability, per action. */
  const batched = new Map();
  const joined = (key, about) => {
    if (!batched.has(key)) return false;
    const entry = state.pendingTriggers[batched.get(key)];
    if (about.card !== undefined) entry.about.cards.push(about.card);
    /* "That much", "that many": everything this action dealt, together (two blockers' damage is one Enrage of 5). */
    if (about.amount !== undefined) entry.about.amount = (entry.about.amount ?? 0) + about.amount;
    return true;
  };
  const opened = (key, about) => {
    batched.set(key, state.pendingTriggers.length - 1);
    const entry = state.pendingTriggers[state.pendingTriggers.length - 1];
    entry.about = {...(entry.about ?? {}), cards: about.card !== undefined ? [about.card] : []};
  };
  for (const event of events ?? []) {
    /* An arrival waiting to be told what it is a copy of triggers once it is (rules/entering.mjs). */
    if (event.data?.fields?.awaitingCopy === true) continue;
    /* And a card just cycled, in the graveyard it went to: its own "when you cycle this card" alone, which works from the
       zone the card went to (CR 702.29c). */
    const cycled = event.kind === "GameEventCardChangeZone" && event.data?.fields?.cycled === true ? event.data.fields.becomes : undefined;
    const wentTo = cycled !== undefined && state.objects[cycled] ? [cycled] : [];
    for (const zone of [...WATCHING_ZONES, "cycled"]) {
      for (const id of zone === "cycled" ? wentTo : state.zones[zone]) {
        const object = state.objects[id];
        /* A permanent's abilities now, the ones given it included (layers.mjs); a card's elsewhere. */
        for (const own of abilitiesOf(state, id)) {
          /* "Whenever you cast a creature spell of the chosen type": read with its permanent's choice. */
          const ability = chosenFor(own, object);
          /* A triggered mana ability happened with the mana ability that triggered it (manaTriggered). */
          if (ability.kind !== "triggered" || !ability.trigger || ability.trigger.manaAbility) continue;
          if (zone === "cycled" && !(ability.trigger.cycled && ability.trigger.who === "self")) continue;
          for (const about of subjects(state, event, ability.trigger, id, object.controller)) {
          /* "If it isn't that player's turn" asks about the player the event is about. */
          if (!conditionHolds(state, ability.condition, {controller: object.controller, source: id, about})) continue;
          /* Damage to players, "one or more" at once: once for each player dealt it; damage to "a Dragon you control", once
             for each creature dealt it. */
          const once = `${id}:${ability.id}${ability.trigger.on === "GameEventPlayerDamaged" || ability.trigger.loser !== undefined ? `:${about.player}`
            : ability.trigger.on === "GameEventCardDamaged" && ["creature", "enchanted"].includes(ability.trigger.to) ? `:${about.card}` : ""}`;
          if (ability.trigger.batch && joined(once, about)) continue;
          /* "This ability triggers only once each turn": once it has, this turn, it does not again. */
          if (ability.limit && usesThisTurn(state, id, `trigger:${ability.id}`) >= ability.limit) continue;
          if (ability.limit) recordUse(state, id, `trigger:${ability.id}`);
          state.pendingTriggers.push({
            abilityId: ability.id,
            text: ability.text ?? ability.id,
            controller: object.controller,
            /* The object AS IT WAS. For a death this is the only record of it that still exists. */
            source: {cardId: id, name: object.card},
            /* What caused it, so an effect that refers to "that creature" has it. For a departure
               that is the last known information (CR 113.7a) and not the bare identity reference:
               "each opponent loses life equal to its power" needs the power of a thing that is no
               longer anywhere, and `card` carries only enough to name it. */
            cause: event.data?.fields?.leftBehind ?? event.data?.fields?.card ?? null,
            optional: ability.optional === true,
            /* "Create an X/X Shark": the X paid for the cycling that triggered it (CR 702.29c). */
            ...(about.x !== undefined ? {x: about.x} : {}),
            /* The mana spent to cast its source (rules/actions.mjs), as it triggers: "if {W}{W} was spent to cast it" is asked
               again as it resolves (CR 603.4), when its source may be gone -- sacrificed for its evoke cost -- and is then read
               as it last was (CR 608.2h). What was spent to cast an object never changes while it exists. */
            ...(object.spent ? {spent: {...object.spent}} : {}),
            /* What it is about ("that player", "that card", "that much"), when the event says. */
            ...(about.card !== undefined || about.player !== undefined || about.amount !== undefined ? {about} : {}),
            /* What it does, from the card script (phase 2.4), carried to the stack with it. */
            ...scriptOf(ability),
          });
          const times = triggersAgain(state, event, object.controller, id, null, departed);
          if (times) again.push({at: state.pendingTriggers.length - 1, times});
          if (ability.trigger.batch) opened(once, about);
          }
        }
      }
    }
    /* A DELAYED TRIGGER (CR 603.7) -- "sacrifice it at the beginning of the next end step" -- made by a resolving spell
       or ability, triggers once, at the next end step's beginning, and then it is gone. One made during an end step was
       made after that step began, so the next beginning this sees is the following turn's (CR 603.7c). */
    /* "At the beginning of the next turn's upkeep" (Arcane Denial) the same way: one made during an upkeep waits for the
       next turn's. */
    const moment = event.kind === "GameEventTurnPhase" ? {END_OF_TURN: "end step", UPKEEP: "upkeep"}[event.data?.fields?.phase] : undefined;
    if (moment && (state.delayedTriggers ?? []).length) {
      const due = state.delayedTriggers.filter((d) => d.at === moment);
      state.delayedTriggers = state.delayedTriggers.filter((d) => !due.includes(d));
      for (const d of due) state.pendingTriggers.push({
        abilityId: "delayed", text: d.text ?? (moment === "upkeep" ? "At the beginning of the next upkeep" : "At the beginning of the next end step"), controller: d.controller,
        source: {cardId: d.source, name: d.source !== null ? state.objects[d.source]?.card ?? null : null}, cause: null, optional: false,
        script: {targets: [], effects: d.effects},
      });
    }
    /* A DELAYED TRIGGER THAT WAITS FOR AN EVENT (CR 603.7b): "when that creature dies this turn" fires once, for that
       creature (`watch`, the object it was as the trigger was made); "whenever a creature dies this turn" every time,
       until the turn ends (turn.mjs, cleanup). Not on the action that made it (CR 603.7a): that one is `fresh`. */
    for (const d of [...(state.delayedTriggers ?? [])]) {
      if (!d.on || d.fresh) continue;
      if (d.watch !== undefined && (d.watch === null || event.data?.fields?.card?.cardId !== d.watch)) continue;
      for (const about of subjects(state, event, d.on, d.source, d.controller)) {
        state.pendingTriggers.push({
          abilityId: "delayed", text: d.text ?? "A delayed trigger", controller: d.controller,
          source: {cardId: d.source, name: d.source !== null ? state.objects[d.source]?.card ?? null : null}, cause: null, optional: false,
          ...(about.card !== undefined || about.player !== undefined ? {about} : {}),
          script: {targets: [], effects: d.effects},
        });
        /* Once, unless it is "whenever ... this turn"; "your next ... this turn" (`once`) is once, and gone at the turn's end. */
        if ((!d.thisTurn && !d.untilYourNextTurn) || d.once) { state.delayedTriggers = state.delayedTriggers.filter((other) => other !== d); break; }
      }
    }
    /* A trigger that watches a permanent LEAVING has to also fire for the permanent that left,
       whose object is already gone from the battlefield by the time this runs. The event's snapshot
       is the look-back (CR 603.10a), and `cause` carries the ability it belonged to. */
    if (event.kind === "GameEventCardChangeZone" && event.data?.fields?.from?.zoneType === "Battlefield") for (const gone of departed) {
      for (const own of gone?.abilities ?? []) {
        const ability = chosenFor(own, gone);
        if (ability.kind !== "triggered" || !ability.trigger) continue;
        if (!matches(state, event, ability.trigger, gone.cardId, gone.controller)) continue;
        if (!conditionHolds(state, ability.condition, {controller: gone.controller, source: gone.cardId})) continue;
        /* Dying with the rest, it sees them all (CR 603.10a) -- once, for "one or more". */
        const about = event.data?.fields?.becomes !== undefined ? {card: event.data.fields.becomes} : {};
        if (ability.trigger.batch && joined(`${gone.cardId}:${ability.id}`, about)) continue;
        state.pendingTriggers.push({
          abilityId: ability.id,
          text: ability.text ?? ability.id,
          controller: gone.controller,
          source: {cardId: gone.cardId, name: gone.name},
          cause: gone,
          optional: ability.optional === true,
          /* "When this dies, return it to its owner's hand": the card it became (CR 400.7e). */
          ...(event.data?.fields?.becomes !== undefined ? {about: {card: event.data.fields.becomes}} : {}),
          ...scriptOf(ability),
        });
        const times = triggersAgain(state, event, gone.controller, gone.cardId, gone, departed);
        if (times) again.push({at: state.pendingTriggers.length - 1, times});
        if (ability.trigger.batch) opened(`${gone.cardId}:${ability.id}`, about);
      }
    }
  }
  /* What was made during this action has now been read past (CR 603.7a), and waits for the next. */
  for (const d of state.delayedTriggers ?? []) if (d.fresh) delete d.fresh;
  for (const {at, times} of again) for (let n = 0; n < times; n += 1) state.pendingTriggers.push(structuredClone(state.pendingTriggers[at]));
  return state.pendingTriggers.length;
}

/* A scripted trigger's effects, for the stack entry; nothing for a kernel trigger that has none. */
/* A modal trigger's modes travel with it, to be chosen as it is put on the stack (CR 603.3c). */
const scriptOf = (ability) => ((ability.effects ?? []).length || ability.modal ? {script: {targets: ability.targets ?? [], effects: ability.effects ?? [],
  ...(ability.condition ? {condition: ability.condition} : {}), ...(ability.modal ? {modal: ability.modal} : {})}} : {});

/** How many triggers are waiting to go on the stack. */
export const pendingCount = (state) => (state.pendingTriggers ?? []).length;

/* APNAP (CR 603.3b): the active player, then each other in turn order. */
const apnapOrder = (state) => {
  const count = state.players.length;
  const order = [];
  for (let step = 0; step < count; step += 1) {
    const at = (state.activePlayer + step) % count;
    if (!state.players[at].lost) order.push(at);
  }
  return order;
};

const nextToOrder = (state) => {
  for (const player of apnapOrder(state)) {
    if ((state.pendingTriggers ?? []).some((t) => t.controller === player)) return player;
  }
  return null;
};

/**
 * Put waiting triggers on the stack (CR 603.3), in APNAP order.
 *
 * A player with more than one stops the game and is asked for the order. With exactly one there is
 * nothing to decide, so nothing is asked.
 *
 * @returns {boolean} true when the engine is now waiting on an ordering decision
 */
export function openTriggers(state) {
  if (pendingCount(state) === 0) return false;
  const player = nextToOrder(state);
  if (player === null) return false;
  const mine = state.pendingTriggers.filter((t) => t.controller === player);
  if (mine.length > 1) {
    state.awaiting = {kind: "order-triggers", player};
    return true;
  }
  putOnStack(state, mine);
  /* The next player's, and the one after — each in turn, so one call settles the whole round
     unless somebody has an ordering to make. Then whatever went on the stack wanting targets asks for them. */
  return openTriggers(state) || askTriggerTargets(state);
}

/* The stack entry a trigger-targets question is about, and the context its targets are chosen in. */
function targeting(state, stackId) {
  const entry = state.stack.find((e) => e.stackId === stackId);
  if (!entry) return null;
  const source = entry.cardId !== null && state.objects[entry.cardId] ? entry.cardId : null;
  /* What it is about, for a target described by it: "target creature that player controls" (Mistblade Shinobi). */
  return {entry, context: {controller: entry.playerId, source, ...(entry.about ? {about: entry.about} : {})}};
}

/**
 * Ask for the targets of the lowest trigger on the stack still waiting for them (CR 603.3d), or remove it if it has
 * none left to choose.
 *
 * @returns {boolean} true when the engine is now waiting on that choice
 */
export function askTriggerTargets(state) {
  if (state.awaiting) return true;
  for (const entry of [...state.stack]) {
    if (entry.stage !== "targeting") continue;
    const {context} = targeting(state, entry.stackId);
    /* A modal trigger (CR 603.3c): its modes and their targets, asked together. With no legal way, it is removed -- also
       when it "may" choose none, which is then the only choice. */
    if (entry.script.modal) {
      if (!modalWays(state, entry.script.modal, context).length) { state.stack.splice(state.stack.indexOf(entry), 1); continue; }
      state.awaiting = {kind: "trigger-targets", player: entry.playerId, stackId: entry.stackId};
      return true;
    }
    if (!targetChoices(state, entry.script.targets, context).length) {
      state.stack.splice(state.stack.indexOf(entry), 1);
      continue;
    }
    /* Only counted targets to choose ("up to one other target creature"): there is one way to aim it before they are
       picked, so it is not asked -- its counted targets are (CR 603.3d, 601.2c; script/bind.mjs). */
    const ways = targetChoices(state, entry.script.targets, context);
    if (ways.length === 1 && ways[0].every((t) => isChoosing(t))) {
      entry.targets = structuredClone(ways[0]);
      if (askCounted(state, entry)) return true;
      continue;
    }
    state.awaiting = {kind: "trigger-targets", player: entry.playerId, stackId: entry.stackId};
    return true;
  }
  return false;
}

/* The next counted target of a trigger still to be picked, asked; or, none left, the trigger aimed and waiting. One with
   nothing it could choose is chosen as nothing. Returns whether it asked. */
function askCounted(state, entry) {
  const {context} = targeting(state, entry.stackId);
  for (let index = entry.targets.findIndex(isChoosing); index >= 0; index = entry.targets.findIndex(isChoosing)) {
    if (targetCandidates(state, entry.script.targets[index], context).length) {
      state.awaiting = {kind: "choose-targets", player: entry.playerId, stackId: entry.stackId, index};
      return true;
    }
    entry.targets[index] = [];
  }
  entry.stage = "waiting";
  return false;
}

/** The question for a trigger's counted target (CR 603.3d, 601.2c): a pick-several of its legal choices (script/bind.mjs). */
export function triggerCountedChoice(state, awaiting) {
  const {entry, context} = targeting(state, awaiting.stackId);
  return countedChoice(state, entry.script.targets[awaiting.index], context, {id: `choose-targets:${entry.stackId}:${awaiting.index}`,
    name: entry.name ?? "A triggered ability", hostile: isHostile(entry.script.effects)});
}

/** The counted target picked; then the next, or the next trigger's targets. */
export function resolveTriggerCounted(state, awaiting, indices) {
  const choice = triggerCountedChoice(state, awaiting);
  const picked = [...new Set(indices ?? [])].sort((a, b) => a - b);
  if (picked.length !== (indices ?? []).length || picked.length < choice.min || picked.length > choice.max || picked.some((i) => !choice.options[i]))
    throw new Error("Invalid selection");
  const {entry} = targeting(state, awaiting.stackId);
  entry.targets[awaiting.index] = picked.map((i) => choice.options[i].targets[0]);
  state.awaiting = null;
  if (askCounted(state, entry)) return [];
  askTriggerTargets(state);
  /* What it is aimed at becomes its target (ward, CR 702.21a). */
  return becameTarget(state, entry);
}

/* EACH WAY TO CHOOSE A MODAL TRIGGER'S MODES AND THEIR TARGETS (CR 603.3c, 700.2): as many modes as it says, none twice
   (CR 700.2d), each with a way to aim its targets; a mode with no legal target can't be chosen. "Each mode must target a
   different player": no player twice among them. */
function modalWays(state, modal, context) {
  const ways = [];
  const n = Math.min(modal.choose, modal.modes.length);
  const pick = (from, chosen) => {
    if (chosen.length === n) {
      for (const targets of targetChoices(state, modalScript(modal, chosen).targets, context)) {
        const players = targets.filter((t) => t?.kind === "player").map((t) => t.id);
        if (modal.differentPlayers && new Set(players).size !== players.length) continue;
        ways.push({modes: chosen, targets});
      }
      return;
    }
    for (let i = from; i < modal.modes.length; i += 1) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return ways;
}

/** The choice (§12.1): each legal way to aim the trigger, with what it is aimed at. */
export function triggerTargetsChoice(state, awaiting) {
  const {entry, context} = targeting(state, awaiting.stackId);
  /* A modal trigger: each way to choose its modes and their targets -- "Inkling → Maya; draws a card → Rob" -- and, when it
     may choose none, that too. */
  if (entry.script.modal) {
    const modal = entry.script.modal;
    const options = modalWays(state, modal, context).map(({modes, targets}, index) => {
      let at = 0;
      const label = modes.map((m) => {
        const mine = targets.slice(at, at += modal.modes[m].targets.length);
        /* A mode that names no target is its words alone (Tireless Provisioner's "Create a Food token"). */
        return mine.length ? `${modal.modes[m].text} → ${mine.map((t) => targetName(state, t)).join(", ")}` : modal.modes[m].text;
      }).join("; ");
      return {index, label, modes, targets, hostile: isHostile(modalScript(modal, modes).effects), ...(entry.cardId !== null ? {cardId: entry.cardId} : {})};
    });
    if (modal.mayChooseNone) options.push({index: options.length, label: "Choose none", none: true});
    return {id: `trigger-targets:${entry.stackId}`, title: `${entry.name ?? "A triggered ability"}: choose ${modal.choose}`, mode: "one", min: 1, max: 1, options};
  }
  const hostile = isHostile(entry.script.effects);
  return {
    id: `trigger-targets:${entry.stackId}`,
    title: `Choose targets for ${entry.name ?? "a triggered ability"}`,
    mode: "one",
    min: 1,
    max: 1,
    options: targetChoices(state, entry.script.targets, context).map((targets, index) => ({
      index, label: targets.map((t) => targetName(state, t)).join(", "), targets, hostile,
      ...(entry.cardId !== null ? {cardId: entry.cardId} : {}),
    })),
  };
}

/** Apply the chosen targets, then ask for the next trigger's, if any. */
export function resolveTriggerTargets(state, awaiting, indices) {
  const choice = triggerTargetsChoice(state, awaiting);
  const option = choice.options[indices?.[0]];
  if (!Array.isArray(indices) || indices.length !== 1 || !option) throw new Error("Invalid selection");
  const {entry} = targeting(state, awaiting.stackId);
  state.awaiting = null;
  /* A modal trigger: none chosen, and it is removed from the stack (CR 603.3c); else what resolves is the chosen modes'. */
  if (entry.script.modal) {
    if (option.none) {
      state.stack.splice(state.stack.indexOf(entry), 1);
      askTriggerTargets(state);
      return [];
    }
    const {modal, ...rest} = entry.script;
    entry.script = {...rest, ...modalScript(modal, option.modes)};
    entry.modes = [...option.modes];
  }
  entry.targets = structuredClone(option.targets);
  /* Its counted targets, if it has any, picked next. */
  if (entry.targets.some(isChoosing) && askCounted(state, entry)) return [];
  entry.stage = "waiting";
  askTriggerTargets(state);
  /* What it is aimed at becomes its target (ward, CR 702.21a). */
  return becameTarget(state, entry);
}

function putOnStack(state, triggers) {
  for (const trigger of triggers) {
    const entry = pushAbility(state, {
      sourceId: state.objects[trigger.source.cardId] ? trigger.source.cardId : null,
      controller: trigger.controller,
      abilityId: trigger.abilityId,
      kind: "trigger",
      script: trigger.script ?? null,
      about: trigger.about ?? null,
      /* A permanent's own "when this dies" reads it as it last existed (CR 603.10a): "its power", "for each +1/+1 counter on
         this creature". Only its own departure: another creature's last state is what "that creature" means, not "this". */
      lastKnown: trigger.cause && trigger.cause.cardId === trigger.source?.cardId && !state.objects[trigger.source.cardId] ? trigger.cause : null,
      spent: trigger.spent ?? null,
      x: trigger.x ?? null,
    });
    /* Its targets are asked for once every trigger of the round is on the stack (askTriggerTargets) -- and a modal one's
       modes with them (CR 603.3c). */
    if ((entry.script?.targets ?? []).length || entry.script?.modal) entry.stage = "targeting";
    const at = state.pendingTriggers.indexOf(trigger);
    if (at >= 0) state.pendingTriggers.splice(at, 1);
  }
}

/** The ordering choice (§12.1), for a player with more than one trigger waiting. */
export function triggerChoice(state, awaiting) {
  const mine = state.pendingTriggers.filter((t) => t.controller === awaiting.player);
  return {
    id: `order-triggers:${state.turn}:${awaiting.player}`,
    title: "Choose the order your triggers go on the stack",
    mode: "order",
    min: mine.length,
    max: mine.length,
    options: mine.map((trigger, index) => ({
      index,
      /* The ability's own words, because "trigger 1" and "trigger 2" is not a choice anybody can
         make. The source is named too, since a player may control two copies of one card. */
      label: `${trigger.source.name}: ${trigger.text}`,
      cardId: trigger.source.cardId,
    })),
  };
}

/**
 * Apply the ordering. The FIRST index chosen goes on the stack first, so it resolves last — which
 * is what the choice's title has to mean to a player, and what the board shows.
 */
export function resolveTriggerOrder(state, awaiting, indices) {
  const choice = triggerChoice(state, awaiting);
  const mine = state.pendingTriggers.filter((t) => t.controller === awaiting.player);
  if (!Array.isArray(indices) || indices.length !== mine.length)
    throw new Error("Order all of the triggers");
  if (new Set(indices).size !== indices.length) throw new Error("Invalid selection");
  const ordered = indices.map((index) => {
    if (!choice.options[index]) throw new Error("Invalid selection");
    return mine[index];
  });
  putOnStack(state, ordered);
  state.awaiting = null;
  /* Somebody else may still have triggers waiting, and may also have an ordering to make. */
  if (!openTriggers(state)) askTriggerTargets(state);
  return [];
}
