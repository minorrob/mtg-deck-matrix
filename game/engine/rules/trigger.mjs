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
import {pushAbility} from "./stack.mjs";
import {cardsIn, usesThisTurn, recordUse} from "../state/index.mjs";
import {matchesSelector, matchesLastKnown} from "../script/filter.mjs";
import {targetChoices, targetName, isHostile} from "../script/bind.mjs";

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

/**
 * WHAT A TRIGGER IS ABOUT, ONE ENTRY PER TRIGGERING (CR 603.2c). "Whenever a creature you control attacks" triggers once
 * for each creature that attacks, so an event can answer more than once; each answer says what it was about -- the spell
 * cast and its caster, the attacking creature and the player it attacks, the creature that dealt damage and the player
 * it was dealt to, the player who drew -- for "that player" and "that card" in what the ability does.
 */
function subjects(state, event, condition, sourceId, controller) {
  if (event.kind !== condition.on) return [];
  const fields = event.data?.fields ?? {};
  /* "Whenever you cast a noncreature spell" (CR 601.2i): the spell on the stack, and who cast it. */
  if (condition.on === "GameEventSpellAbilityCast") {
    if (!fields.sa?.isSpell) return [];
    /* The spell is the stack entry's object: the card in hand became a new object as it moved to the stack (CR 400.7). */
    const caster = fields.si?.actor?.playerId;
    const spell = state.stack.find((e) => e.stackId === fields.sa?.stackId)?.objectId ?? fields.card?.cardId;
    if (!whoseIs(condition.caster ?? "you", caster, controller)) return [];
    if (condition.filter && !(state.objects[spell] && matchesSelector({...condition.filter, what: "spell"}, state, spell, {controller, source: sourceId}))) return [];
    /* "Their first noncreature spell each turn": this is the first of the caster's spells this turn the filter fits. And
       "copy it for each other instant and sorcery spell you've cast before it this turn" (Thousand-Year Storm): how many
       of them came before this one, counted now, as it triggers -- a spell cast later, in response, did not. */
    if (condition.firstThisTurn || condition.countBefore) {
      const {what: _ignored, ...shape} = condition.filter ?? {};
      const fitted = (state.players[caster]?.castThisTurn ?? []).filter((cast) => matchesLastKnown(shape, {...cast, controller: caster}, {controller}));
      if (condition.firstThisTurn && fitted.length !== 1) return [];
      if (condition.countBefore) return [{card: spell, player: caster, castBefore: Math.max(0, fitted.length - 1)}];
    }
    return [{card: spell, player: caster}];
  }
  /* "Whenever this creature attacks", "whenever a creature you control attacks" (CR 508.1m): each attacker, and the
     player it attacks. */
  if (condition.on === "GameEventAttackersDeclared") {
    const matched = (fields.attackers ?? []).filter((a) => fits(state, a.card?.cardId, condition, sourceId, controller))
      /* "Attack one of your opponents" (Frontier Warmonger): the player attacked is not this ability's controller. */
      .filter((a) => condition.defender !== "opponent" || (a.defender?.playerId !== undefined && a.defender.playerId !== controller));
    /* "Whenever a player attacks with three or more creatures" (Aurelia): the attack as a whole, counted -- one event
       declares every attacker (CR 508.1). */
    if (condition.atLeast && matched.length < condition.atLeast) return [];
    return matched.map((a) => ({card: a.card.cardId, player: a.defender?.playerId}));
  }
  /* "Whenever this deals combat damage to a player", "whenever a creature you control deals combat damage to an
     opponent" (CR 510.2, 120.3): the source, and the player dealt the damage. */
  if (condition.on === "GameEventPlayerDamaged") {
    if (condition.combat && fields.combat !== true) return [];
    /* "Whenever a source you control deals noncombat damage to an opponent" (Niv-Mizzet, Visionary). */
    if (condition.noncombat && fields.combat === true) return [];
    /* "A source you control" -- a permanent or a spell: its controller as the damage was dealt. */
    if (condition.sourceYours && fields.source?.controller !== controller) return [];
    const to = fields.target?.playerId, source = fields.source?.cardId;
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
    return [{card: fields.source?.cardId, player: fields.source?.controller, amount: fields.amount ?? 0}];
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
  /* "Whenever you gain life" (CR 119.9): each gain its own event -- lifelink from two creatures at once is two -- about the
     player and how much. A loss, or no change, is not a gain. */
  if (condition.on === "GameEventPlayerLivesChanged") {
    const player = fields.player?.playerId, gained = (fields.newLives ?? 0) - (fields.oldLives ?? 0);
    if (!(gained > 0) || !whoseIs(condition.gainer ?? "you", player, controller)) return [];
    return [{player, amount: gained}];
  }
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
     you control dies, return that card to its owner's hand" returns the card in the graveyard. */
  if (event.kind === "GameEventCardChangeZone" && fields.becomes !== undefined) return [{card: fields.becomes}];
  return [{}];
}

/** Whether an event matches a trigger condition. */
function matches(state, event, condition, sourceId, controller) {
  if (event.kind !== condition.on) return false;
  const fields = event.data?.fields ?? {};

  if (condition.on === "GameEventCardChangeZone") {
    if (condition.from && fields.from?.zoneType !== condition.from) return false;
    if (condition.to && fields.to?.zoneType !== condition.to) return false;
    /* `self` means this permanent, compared against the card AS IT WAS — the event's snapshot, not
       the object, because for a death the object no longer exists. An arrival is the other way round:
       the card that moved was the one on the stack or in hand, and the permanent that arrived is a new
       object (CR 400.7), which the event names as `enteredAs`. */
    const moved = fields.enteredAs ?? fields.card?.cardId;
    if (condition.who === "self" && moved !== sourceId) return false;
    if (condition.who === "another" && moved === sourceId) return false;
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
export function collectTriggers(state, events) {
  if (!state.pendingTriggers) state.pendingTriggers = [];
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
    if (about.card !== undefined) state.pendingTriggers[batched.get(key)].about.cards.push(about.card);
    return true;
  };
  const opened = (key, about) => {
    batched.set(key, state.pendingTriggers.length - 1);
    const entry = state.pendingTriggers[state.pendingTriggers.length - 1];
    entry.about = {...(entry.about ?? {}), cards: about.card !== undefined ? [about.card] : []};
  };
  for (const event of events ?? []) {
    for (const zone of WATCHING_ZONES) {
      for (const id of state.zones[zone]) {
        const object = state.objects[id];
        for (const ability of object.abilities ?? []) {
          if (ability.kind !== "triggered" || !ability.trigger) continue;
          for (const about of subjects(state, event, ability.trigger, id, object.controller)) {
          /* "If it isn't that player's turn" asks about the player the event is about. */
          if (!conditionHolds(state, ability.condition, {controller: object.controller, source: id, about})) continue;
          if (ability.trigger.batch && joined(`${id}:${ability.id}`, about)) continue;
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
            /* What it is about ("that player", "that card"), when the event says. */
            ...(about.card !== undefined || about.player !== undefined ? {about} : {}),
            /* What it does, from the card script (phase 2.4), carried to the stack with it. */
            ...scriptOf(ability),
          });
          if (ability.trigger.batch) opened(`${id}:${ability.id}`, about);
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
        if (!d.thisTurn) { state.delayedTriggers = state.delayedTriggers.filter((other) => other !== d); break; }
      }
    }
    /* A trigger that watches a permanent LEAVING has to also fire for the permanent that left,
       whose object is already gone from the battlefield by the time this runs. The event's snapshot
       is the look-back (CR 603.10a), and `cause` carries the ability it belonged to. */
    if (event.kind === "GameEventCardChangeZone" && event.data?.fields?.from?.zoneType === "Battlefield") for (const gone of departed) {
      for (const ability of gone?.abilities ?? []) {
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
        if (ability.trigger.batch) opened(`${gone.cardId}:${ability.id}`, about);
      }
    }
  }
  /* What was made during this action has now been read past (CR 603.7a), and waits for the next. */
  for (const d of state.delayedTriggers ?? []) if (d.fresh) delete d.fresh;
  return state.pendingTriggers.length;
}

/* A scripted trigger's effects, for the stack entry; nothing for a kernel trigger that has none. */
const scriptOf = (ability) => ((ability.effects ?? []).length ? {script: {targets: ability.targets ?? [], effects: ability.effects, ...(ability.condition ? {condition: ability.condition} : {})}} : {});

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
  return {entry, context: {controller: entry.playerId, source}};
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
    if (!targetChoices(state, entry.script.targets, context).length) {
      state.stack.splice(state.stack.indexOf(entry), 1);
      continue;
    }
    state.awaiting = {kind: "trigger-targets", player: entry.playerId, stackId: entry.stackId};
    return true;
  }
  return false;
}

/** The choice (§12.1): each legal way to aim the trigger, with what it is aimed at. */
export function triggerTargetsChoice(state, awaiting) {
  const {entry, context} = targeting(state, awaiting.stackId);
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
  entry.targets = structuredClone(option.targets);
  entry.stage = "waiting";
  state.awaiting = null;
  askTriggerTargets(state);
  return [];
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
    });
    /* Its targets are asked for once every trigger of the round is on the stack (askTriggerTargets). */
    if ((entry.script?.targets ?? []).length) entry.stage = "targeting";
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
