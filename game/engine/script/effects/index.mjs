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
 * FOUR OF THE TWENTY-FIVE ARE NOT BUILT YET, and they are the four that ask a player something:
 * `dig`, `scry`, `discard` and `modal`. A resolution that stops half way through and resumes is
 * 2.2b. They are ABSENT rather than stubbed, and `runEffect` says so by name — the schema will
 * happily validate a card that uses one, so this is the loud half of that (principle 6).
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
import {moveZone, moveZoneAll, draw, destroy, counterSpell} from "./zones.mjs";
import {
  addMana, tap, untap, untapAll, gainLife, loseLife, dealDamage,
  putCounter, putCounterAll, removeCounter, proliferate,
} from "./resources.mjs";
import {
  createToken, animate, animateAll, pump, pumpAll, effectUntil, delayedTrigger, cleanup,
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

/** The four that need a decision, and therefore 2.2b's resumable resolution. */
export const NEEDS_A_DECISION = Object.freeze(["dig", "scry", "discard", "modal"]);

/** Every primitive that is built. A name here that the catalog does not declare is a bug. */
export const EFFECTS = Object.freeze({
  moveZone, moveZoneAll, draw, destroy, counterSpell,
  addMana, tap, untap, untapAll, gainLife, loseLife, dealDamage,
  putCounter, putCounterAll, removeCounter, proliferate,
  createToken, animate, animateAll, pump, pumpAll, effectUntil, delayedTrigger, cleanup,
});

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
      ? "it asks a player something, and resumable resolution is 2.2b"
      : "it has not been built yet";
    throw new Error(`The primitive ${name} is declared but not implemented: ${why}`);
  }
  return run(state, effect, context) ?? [];
}

/** Run a list of effects in order, collecting what happened. */
export function runEffects(state, effects, context = {}) {
  const events = [];
  for (const effect of effects ?? []) events.push(...runEffect(state, effect, context));
  return events;
}
