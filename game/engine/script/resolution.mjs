/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A RESOLUTION THAT CAN STOP HALF WAY THROUGH AND CARRY ON.
 *
 * `docs/engine/PLAN.md` §3.2.4 — "resume from any decision is a first-class feature, not a recovery
 * hack". Phase 1 made that true for turn-based actions: declaring attackers, discarding at cleanup.
 * This makes it true for card effects, which is where it is actually used. "Scry 2, then draw a
 * card" has to ask between the two, and the draw has to still happen afterwards.
 *
 * A QUEUE, NOT A CALL STACK. The effects of a resolution sit in a list, and a chosen mode's effects
 * are SPLICED INTO THE FRONT of it. That is what makes a modal containing a scry work: the scry
 * stops the resolution exactly as a top-level scry would, and whatever followed the modal is still
 * sitting behind it. Written with recursion, the paused call would have had to unwind across the
 * pause and rebuild itself on the way back in — which is the same reason the engine as a whole is a
 * state machine rather than a thread that blocks.
 *
 * AND IT IS PLAIN DATA. `state.resolving` is a list, an index and a context, so a game saved in the
 * middle of an effect resumes in the middle of that effect. Holding a generator or a closure here
 * would have made §3.2.4 true of everything except the part players spend the most time in.
 */

import {runEffect, eachOf} from "./effects/index.mjs";
import {ASKING, commandersGoingHome} from "./effects/asking.mjs";
import {damageQuestion} from "./effects/resources.mjs";
import {bindEffect} from "./bind.mjs";
import {countEffect} from "./amount.mjs";
import {conditionHolds} from "./condition.mjs";

/** Whether a resolution is paused, waiting for somebody. */
export const resolutionPending = (state) => Boolean(state.resolving);

/**
 * Start resolving a list of effects. `rng`, the game's random stream, reaches every effect of it (batch 80): it is handed
 * in at each step rather than kept, since a generator is not state and the resolution must stay plain data.
 *
 * @returns {{status: "done"|"waiting", events: Array}}
 */
export function beginResolution(state, effects, context = {}, rng = null) {
  if (state.resolving) throw new Error("A resolution is already under way; finish it before starting another");
  state.resolving = {
    queue: structuredClone(effects ?? []),
    /* `targets` are the ones still legal as the resolution began (bind.mjs, CR 608.2b), null where one is not. */
    context: {controller: context.controller ?? 0, source: context.source ?? null, x: context.x ?? 0, targets: context.targets ?? [], facts: context.facts ?? [],
      ...(context.about ? {about: context.about} : {}), ...(context.lastKnown ? {lastKnown: context.lastKnown} : {}), ...(context.attached !== undefined ? {attached: context.attached} : {}),
      /* What the ability's permanent chose as it entered ("the chosen type", script/chosen.mjs). */
      ...(context.chosen !== undefined ? {chosen: context.chosen} : {}),
      /* How a spell was cast, for "if this spell was cast from a graveyard" (script/condition.mjs, `cast`). */
      ...(context.cast ? {cast: context.cast} : {}),
      /* How many times its source had transformed as the ability went on the stack (CR 701.27f; rules/stack.mjs). */
      ...(context.sourceTransforms !== undefined ? {sourceTransforms: context.sourceTransforms} : {})},
    events: [],
  };
  return runResolution(state, rng);
}

/* The events this resolution has not handed back yet. A resolution that stops to ask hands back what happened before the
   question, and on carrying on only what happened after: each event once, whatever reads them -- a log, the conformance
   suite's "a life change begins where the last ended" (Uro: the 3 life gained, then "you may put a land card"). The whole
   list stays with the resolution. */
function unreported(resolving) {
  const fresh = resolving.events.slice(resolving.reported ?? 0);
  resolving.reported = resolving.events.length;
  return fresh;
}

/**
 * Work through the queue until it is empty or something asks a question.
 *
 * @returns {{status: "done"|"waiting", events: Array}}
 */
export function runResolution(state, rng = null) {
  const resolving = state.resolving;
  if (!resolving) return {status: "done", events: []};

  while (resolving.queue.length > 0) {
    /* Bound as it reaches the head, not when the queue was built: a modal's chosen effects arrive later, and are
       bound against the same targets as everything else (bind.mjs). */
    /* And counted as it reaches the head (CR 608.2h): "draw a card for each creature you control" counts then. */
    const effect = countEffect(state, bindEffect(resolving.queue[0], resolving.context, state), resolving.context);
    resolving.queue[0] = effect;
    /* AN EFFECT'S OWN CONDITION (Forge's Condition): "Metalcraft -- If you control three or more artifacts, exile that
       creature". Asked now, as it reaches the head (CR 608.2c, the instructions in order); false, and it does nothing. */
    if (effect?.condition && !conditionHolds(state, effect.condition, {controller: resolving.context.controller, source: resolving.context.source, about: resolving.context.about,
      remembered: resolving.context.remembered, targets: resolving.context.targets, cast: resolving.context.cast, x: resolving.context.x,
      /* "If excess damage was dealt to that permanent this way" (Violent Echoes; effects/resources.mjs). */
      excessDamage: resolving.context.excessDamage, rememberedControllers: resolving.context.rememberedControllers})) {
      resolving.queue.shift();
      continue;
    }
    /* BRANCH (Forge's Branch; batch 72): "if you control six or more lands, create a token that's a copy of this creature
       instead" -- its own condition (`if`) asked now, as it reaches the head (CR 608.2c), and the effects of the way it goes
       put in front of whatever follows, so one of them may stop to ask (Composer of Spring's "you may put a card"). */
    if (effect?.effect === "branch") {
      const holds = conditionHolds(state, effect.if, {controller: resolving.context.controller, source: resolving.context.source, about: resolving.context.about,
        remembered: resolving.context.remembered, targets: resolving.context.targets, cast: resolving.context.cast});
      resolving.queue.shift();
      resolving.queue.unshift(...structuredClone((holds ? effect.then : effect.otherwise) ?? []));
      continue;
    }
    /* EMPOWER JACE N (the live-game plan of 2026-10-04): "put N loyalty counters on a Jace token you control. If you don't
       control one, first create a blue Jace planeswalker token" -- a token of yours with the subtype Jace. With two or
       more, which one is its controller's choice (chooseCard, kept where it is); with one, that one; with none, the
       predefined token made first (effects/permanents.mjs). Put in front of what follows, as a branch is. */
    /* "FOR EACH ..., THAT PLAYER SEARCHES" (Winds of Abandon, overloaded): a repetition whose effects ask, spliced in for each
       of what it ranges over (script/effects/index.mjs, eachOf: players in turn order, CR 101.4) -- each one's effects after
       a mark that makes it what "that player" and "that card" are while they run, so each is bound and counted as it reaches
       the head, as it would be repeated directly; and the resolution's own subject back after the last. */
    if (effect?.effect === "repeatFor" && (effect.effects ?? []).some((inner) => ASKING[inner?.effect])) {
      resolving.queue.shift();
      const before = resolving.context.about;
      const spliced = eachOf(state, effect.each, resolving.context).flatMap((about) => [{effect: "__about", about: {...(before ?? {}), ...about}}, ...structuredClone(effect.effects ?? [])]);
      resolving.queue.unshift(...spliced, {effect: "__about", about: before});
      continue;
    }
    if (effect?.effect === "__about") {
      resolving.queue.shift();
      if (effect.about === undefined) delete resolving.context.about; else resolving.context.about = effect.about;
      continue;
    }
    if (effect?.effect === "empowerJace") {
      const jace = {what: "permanent", token: true, subtypes: ["Jace"], controller: "you"};
      const count = Math.max(0, effect.count ?? 0);
      resolving.queue.shift();
      resolving.queue.unshift({effect: "branch", if: {present: jace, atLeast: 2},
        then: [{effect: "chooseCard", zone: "battlefield", selector: jace, count: 1, to: "stay", remember: true},
          {effect: "putCounter", targets: "remembered", counter: "loyalty", count}],
        otherwise: [{effect: "branch", if: {present: jace},
          then: [{effect: "putCounterAll", selector: jace, counter: "loyalty", count}],
          otherwise: [{effect: "createToken", count: 1, token: {predefined: "Jace"}, remember: true},
            {effect: "putCounter", targets: "remembered", counter: "loyalty", count}]}]});
      continue;
    }
    /* CR 903.9b: a commander this sends to its owner's hand or library may go to the command zone instead -- a
       replacement, so the owners are asked before anything moves (effects/asking.mjs, commanderHome). */
    const home = effect?.effect === "moveZone" || effect?.effect === "counterSpell" ? commandersGoingHome(state, effect) : [];
    if (home.length) resolving.queue[0] = {effect: "commanderHome", commanders: home, move: effect};
    /* CR 616.1: damage that two or more effects would change, where the order changes how it ends -- the player dealt it
       chooses which applies first, before any of it is dealt (effects/asking.mjs, orderDamage). */
    else if (damageQuestion(state, effect, resolving.context, effect?.damageOrders ?? {}))
      resolving.queue[0] = {effect: "orderDamage", damage: effect, answers: effect.damageOrders ?? {}};
    const head = resolving.queue[0];
    const asking = ASKING[head?.effect];

    if (asking) {
      /* `open` returns false when there is nothing to ask about — an empty library to scry, a hand
         with nothing in it to discard. The effect is then simply done, rather than the game
         stopping on a question with no answers. It returns {events} when it was done without asking
         anybody (batch 80): a discard at random, nothing among the cards a dig may take. */
      const opened = asking.open(state, head, resolving.context, rng);
      if (opened === true) {
        state.awaiting.resolution = true;
        return {status: "waiting", events: unreported(resolving)};
      }
      if (opened && Array.isArray(opened.events)) resolving.events.push(...opened.events);
      resolving.queue.shift();
      continue;
    }

    resolving.queue.shift();
    resolving.events.push(...runEffect(state, effect, resolving.context, rng));
  }

  const events = unreported(resolving);
  state.resolving = null;
  /* And all of them, for what triggers on them as a player would next receive priority (rules/turn.mjs). */
  return {status: "done", events, all: resolving.events};
}

/**
 * Apply the answer to whatever the resolution asked, and carry on.
 *
 * `extra` carries what the generic `indices` cannot: scry's `toBottom`, for instance. The choice
 * record says which fields it expects, and `controller.mjs` validates them.
 */
export function answerResolution(state, indices, extra = {}, rng = null) {
  const awaiting = state.awaiting;
  if (!awaiting || awaiting.kind !== "effect-choice")
    throw new Error("The resolution is not waiting on an effect choice");
  const asking = ASKING[awaiting.effect];
  if (!asking) throw new Error(`No asking primitive named ${awaiting.effect}`);

  /* The game's random stream, for an answer that shuffles a library (a search); a generator is not state, so it is
     handed in, as the mulligan's is. */
  const outcome = asking.apply(state, awaiting, indices, extra, rng);
  const events = Array.isArray(outcome) ? outcome : outcome.events ?? [];
  state.resolving?.events.push(...events);

  /* `again` means the same effect has another player to ask — "each opponent discards a card" is
     one effect and several questions. The effect stays at the head of the queue and `open` is not
     called again, because `apply` has already set up the next question. */
  if (!Array.isArray(outcome) && outcome.again === true) {
    state.awaiting.resolution = true;
    return {status: "waiting", events: state.resolving ? unreported(state.resolving) : events};
  }

  state.awaiting = null;
  if (!state.resolving) return {status: "done", events};
  /* What the answer moved, remembered for the effects after it ("untap that land"). */
  /* Beside what was remembered before, when the answer says so (`rememberAdd`): "for each player, choose a creature that
     player controls" remembers each in turn (The Eternal Wanderer). */
  if (!Array.isArray(outcome) && Array.isArray(outcome.remembered)) state.resolving.context.remembered = outcome.rememberAdd === true
    ? [...(state.resolving.context.remembered ?? []), ...outcome.remembered] : outcome.remembered;
  /* "Choose a creature type": the type, for the effects after it ("$chosen", script/bind.mjs). */
  if (!Array.isArray(outcome) && typeof outcome.chosen === "string") state.resolving.context.chosen = outcome.chosen;

  /* The effect that asked is finished. A modal hands back the chosen modes' effects, which go in
     front of whatever was already queued. */
  state.resolving.queue.shift();
  if (!Array.isArray(outcome) && Array.isArray(outcome.splice) && outcome.splice.length > 0) {
    state.resolving.queue.unshift(...outcome.splice);
  }
  /* What follows the answer has the same random stream the answer had. */
  return runResolution(state, rng);
}

/** The choice record for whatever the resolution is asking (§12.1). */
export function resolutionChoice(state, awaiting) {
  const asking = ASKING[awaiting.effect];
  if (!asking) throw new Error(`No asking primitive named ${awaiting.effect}`);
  return asking.choice(state, awaiting);
}
