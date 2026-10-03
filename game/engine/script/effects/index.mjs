/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE EFFECT REGISTRY: WHERE A CARD DEFINITION STOPS BEING A DOCUMENT.
 *
 * `docs/engine/PLAN.md` §6, phase 2.2 — "effect primitives for the top 25 deck primitives".
 *
 * THE TWENTY-FIVE ARE MEASURED, NOT CHOSEN. `game/docs/engine-inventory.json` counted every Forge
 * API used across Rob's seven decks: 64 distinct names and 821 uses, of which the top 25 are 90.9%.
 * Building in frequency order means the first thing that works is the thing most of his cards
 * actually do, and the number is checkable rather than a judgment somebody made.
 *
 * FOUR OF THE TWENTY-FIVE ASK A PLAYER SOMETHING -- `dig`, `scry`, `discard` and `modal` -- and
 * none of them can be written as a function that returns events. They are `open`/`apply` pairs in
 * `effects/asking.mjs`, driven by `resolution.mjs`, which is what lets an effect stop half way
 * through and carry on. `runEffect` refuses to call one directly rather than running half of it.
 *
 * EVERY PRIMITIVE HAS THE SAME SHAPE: `(state, params, context) => events`. It mutates the state
 * and hands back what happened; nothing here holds a journal, for the same reason no rules module
 * does — a rollback discards the events with the state rather than leaving a record of something
 * that did not happen.
 *
 * `context` is `{controller, source, targets, x, remembered}`: who is doing this, which object it
 * came from, what it was aimed at, the value chosen for X, and the resolution's scratch space.
 */

import {isPrimitive} from "../../vocabulary.mjs";
import {bindEffect} from "../bind.mjs";
import {countEffect} from "../amount.mjs";
import {controllerOf, typesOf} from "../../rules/layers.mjs";
import {moveZone, moveZoneAll, draw, destroy, destroyAll, mill, counterSpell, sacrificeAll, digUntil} from "./zones.mjs";
import {
  addMana, tap, untap, untapAll, gainLife, loseLife, dealDamage,
  putCounter, putCounterAll, removeCounter, proliferate, damageAll, fight, poison, winGame,
} from "./resources.mjs";
import {
  createToken, animate, animateAll, pump, pumpAll, effectUntil, delayedTrigger, cleanup, attach, copyPermanent, regenerate, addPhase, gainControl,
  becomeCopy, earthbend, goad,
} from "./permanents.mjs";

/**
 * The twenty-five most-used primitives across Rob's seven decks, in frequency order, with the count
 * from `game/docs/engine-inventory.json` beside each. Together they are 90.9% of 821 uses.
 */
export const TOP_25 = Object.freeze([
  "moveZone",       /* ChangeZone 100 */
  "addMana",        /* Mana 97 */
  "draw",           /* Draw 69 */
  "createToken",    /* Token 67 */
  "tap",            /* Tap 55 */
  "cleanup",        /* Cleanup 41 */
  "destroy",        /* Destroy 41 */
  "putCounter",     /* PutCounter 30 */
  "gainLife",       /* GainLife 28 */
  "loseLife",       /* LoseLife 27 */
  "dealDamage",     /* DealDamage 24 */
  "pump",           /* Pump 23 */
  "proliferate",    /* Proliferate 21 */
  "modal",          /* Charm 20 — 2.2b, asks which mode */
  "pumpAll",        /* PumpAll 19 */
  "effectUntil",    /* Effect 16 */
  "dig",            /* Dig 12 — 2.2b, asks which card */
  "scry",           /* Scry 11 — 2.2b, asks top or bottom */
  "discard",        /* Discard 7 — 2.2b, asks which card */
  "moveZoneAll",    /* ChangeZoneAll 7 */
  "animate",        /* Animate 7 */
  "counterSpell",   /* Counter 7 */
  "untap",          /* Untap 6 */
  "putCounterAll",  /* PutCounterAll 6 */
  "delayedTrigger", /* DelayedTrigger 5 */
]);

/**
 * The four that ask a player something.
 *
 * They are deliberately NOT in `EFFECTS`, because `EFFECTS` is the set of things that can be called
 * as `(state, params, context) => events` and none of these can: each is an `open`/`apply` pair in
 * `effects/asking.mjs`, driven by `resolution.mjs`. Putting a throwing stub in the registry would
 * have made "is this built" answer yes to something no caller can use.
 */
export const NEEDS_A_DECISION = Object.freeze(["dig", "scry", "surveil", "discard", "modal", "chooseCard", "proliferate", "sacrifice", "populate", "unlessPays", "copySpell", "chooseType", "play", "changeTargets"]);

/* What "each" ranges over (`repeatFor`), each with what it binds: a player -- in turn order from the active player
   (CR 101.4) -- as "that player"; a creature as "that card", and its controller as "that player". */
function eachOf(state, each, context) {
  const seats = state.players.map((p) => p.id), from = seats.indexOf(state.activePlayer ?? 0);
  const players = [...seats.slice(from), ...seats.slice(0, from)].filter((id) => !state.players[id].lost);
  if (each === "player") return players.map((player) => ({player}));
  if (each === "opponent") return players.filter((player) => player !== context.controller).map((player) => ({player}));
  if (each === "creature") return state.zones.battlefield.filter((id) => typesOf(state, id).includes("Creature")).map((card) => ({card, player: controllerOf(state, card)}));
  return [];
}
/** What `repeatFor` may range over. */
export const REPEAT_EACH = Object.freeze(["player", "opponent", "creature"]);

/**
 * `repeatFor` — Forge's RepeatEach: "deals damage to each player equal to twice the number of nonbasic lands that
 * player controls". Its effects, once for each player, opponent or creature, in that order, with "that player" and
 * "that card" bound to it and every amount counted for it (CR 608.2h, each as it is done). What it repeats does not
 * stop to ask (cards/index.mjs refuses one that would).
 */
function repeatFor(state, params, context) {
  const events = [];
  for (const about of eachOf(state, params.each, context)) {
    const each = {...context, about: {...(context.about ?? {}), ...about}};
    for (const effect of params.effects ?? []) events.push(...runEffect(state, countEffect(state, bindEffect(effect, each), each), each));
  }
  return events;
}

/** Every primitive that can be called directly. A name here the catalog does not declare is a bug. */
export const EFFECTS = Object.freeze({
  moveZone, moveZoneAll, draw, destroy, counterSpell,
  /* Past the twenty-five, by what blocks the seven decks next (docs/engine/coverage.md): a board wipe, and mill. */
  destroyAll, mill,
  addMana, tap, untap, untapAll, gainLife, loseLife, dealDamage,
  putCounter, putCounterAll, removeCounter, proliferate,
  createToken, animate, animateAll, pump, pumpAll, effectUntil, delayedTrigger, cleanup,
  /* Phase 3, batch 6: Equip. Batch 13: a token that's a copy (CR 707). */
  attach, copyPermanent,
  /* Batch 24: damage to each creature and each opponent. Batch 28: a regeneration shield. Batch 33: extra phases.
     Batch 36: the same for each player, opponent or creature. */
  damageAll, regenerate, addPhase, repeatFor,
  /* Batch 52: two creatures fight (CR 701.14). */
  fight,
  /* Batch 40: a change of control, for a turn or for good. Batch 49: every permanent a selector fits, sacrificed. */
  gainControl, sacrificeAll,
  /* Batch 58: a permanent becomes a copy (CR 707.2, layer 1). */
  becomeCopy,
  /* Batch 62: cards from the top of a library until one fits. */
  digUntil,
  /* Batch 64: poison counters on players. */
  poison,
  /* Batch 65: a land made a creature, its counters, and its return. */
  earthbend,
  /* Batch 68: "you win the game". */
  winGame,
  /* Batch 69: goad. */
  goad,
});

/** Whether the engine can perform this primitive at all, by either route. */
export const isBuilt = (name) => Boolean(EFFECTS[name]) || NEEDS_A_DECISION.includes(name);

/**
 * Run one effect.
 *
 * Refuses in two different ways on purpose, because they are two different problems. A name the
 * catalog does not declare is a bad document — somebody wrote `destroyCreature`. A name the catalog
 * declares and this does not implement is a gap in the engine, and saying which it is turns "why
 * did nothing happen" into a one-line answer.
 */
export function runEffect(state, effect, context = {}) {
  const name = effect?.effect;
  if (!isPrimitive(name))
    throw new Error(`${JSON.stringify(name)} is not a primitive in the catalog (§12.2)`);
  const run = EFFECTS[name];
  if (!run) {
    const why = NEEDS_A_DECISION.includes(name)
      ? "it asks a player something; run it through resolution.mjs, which can stop and resume"
      : "it is declared in the catalog and not implemented yet";
    throw new Error(`The primitive ${name} cannot be run directly: ${why}`);
  }
  return run(state, effect, context) ?? [];
}

/**
 * What follows a prevention (CR 615.5; rules/replacement.mjs, `followUps`): "each opponent mills that many cards" (The
 * Mindskinner), immediately after the damage event, done by whatever dealt the damage -- each effect bound to what the
 * damage was about and counted then. What follows never asks (cards/index.mjs refuses one that would).
 */
export function runFollowUps(state, proposal) {
  const events = [];
  for (const {effects, context} of proposal.followUps ?? [])
    for (const effect of effects) events.push(...runEffect(state, countEffect(state, bindEffect(effect, context), context), context));
  return events;
}

/** Run a list of effects in order, collecting what happened. */
export function runEffects(state, effects, context = {}) {
  const events = [];
  for (const effect of effects ?? []) events.push(...runEffect(state, effect, context));
  return events;
}
