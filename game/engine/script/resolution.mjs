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

import {runEffect} from "./effects/index.mjs";
import {ASKING} from "./effects/asking.mjs";
import {bindEffect} from "./bind.mjs";

/** Whether a resolution is paused, waiting for somebody. */
export const resolutionPending = (state) => Boolean(state.resolving);

/**
 * Start resolving a list of effects.
 *
 * @returns {{status: "done"|"waiting", events: Array}}
 */
export function beginResolution(state, effects, context = {}) {
  if (state.resolving) throw new Error("A resolution is already under way; finish it before starting another");
  state.resolving = {
    queue: structuredClone(effects ?? []),
    /* `targets` are the ones still legal as the resolution began (bind.mjs, CR 608.2b), null where one is not. */
    context: {controller: context.controller ?? 0, source: context.source ?? null, x: context.x ?? 0, targets: context.targets ?? [], facts: context.facts ?? [],
      ...(context.about ? {about: context.about} : {})},
    events: [],
  };
  return runResolution(state);
}

/**
 * Work through the queue until it is empty or something asks a question.
 *
 * @returns {{status: "done"|"waiting", events: Array}}
 */
export function runResolution(state) {
  const resolving = state.resolving;
  if (!resolving) return {status: "done", events: []};

  while (resolving.queue.length > 0) {
    /* Bound as it reaches the head, not when the queue was built: a modal's chosen effects arrive later, and are
       bound against the same targets as everything else (bind.mjs). */
    const effect = bindEffect(resolving.queue[0], resolving.context);
    resolving.queue[0] = effect;
    const asking = ASKING[effect?.effect];

    if (asking) {
      /* `open` returns false when there is nothing to ask about — an empty library to scry, a hand
         with nothing in it to discard. The effect is then simply done, rather than the game
         stopping on a question with no answers. */
      if (asking.open(state, effect, resolving.context)) {
        state.awaiting.resolution = true;
        return {status: "waiting", events: resolving.events};
      }
      resolving.queue.shift();
      continue;
    }

    resolving.queue.shift();
    resolving.events.push(...runEffect(state, effect, resolving.context));
  }

  const events = resolving.events;
  state.resolving = null;
  return {status: "done", events};
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
    return {status: "waiting", events};
  }

  state.awaiting = null;
  if (!state.resolving) return {status: "done", events};

  /* The effect that asked is finished. A modal hands back the chosen modes' effects, which go in
     front of whatever was already queued. */
  state.resolving.queue.shift();
  if (!Array.isArray(outcome) && Array.isArray(outcome.splice) && outcome.splice.length > 0) {
    state.resolving.queue.unshift(...outcome.splice);
  }
  return runResolution(state);
}

/** The choice record for whatever the resolution is asking (§12.1). */
export function resolutionChoice(state, awaiting) {
  const asking = ASKING[awaiting.effect];
  if (!asking) throw new Error(`No asking primitive named ${awaiting.effect}`);
  return asking.choice(state, awaiting);
}
