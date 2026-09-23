/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE ONLY PUBLIC ENTRY TO THE CRANKMAGIC RULES ENGINE.
 *
 * `docs/engine/PLAN.md` §3.1. Nothing outside this file's exports is a supported interface: the
 * runtime, the pilots and the page all reach the engine through `createGame` and the controller
 * contract in §12.1, so a network boundary can be inserted later at `browserBridgeForSeat`
 * without the page layer knowing (§3.8, cloud readiness).
 *
 * Clean room, and it is the load-bearing rule of this whole directory: written from the
 * Comprehensive Rules and Scryfall oracle text. Nothing from Forge enters here in any form — not
 * copied, not translated, not paraphrased. Forge is a behavioral oracle run from outside the
 * product, and a divergence between the two is adjudicated against the CR, not settled by
 * copying. See `docs/engine/ADR-001-own-engine.md`.
 *
 * PHASE 0. This is the scaffold. `createGame` throws until the phase 1 kernel lands, because a
 * stub that returns a plausible-looking game would let callers be written against a fiction and
 * would fail later, further from the cause. Principle 6: unsupported is loud.
 */

/** The flag value that selects this engine. `serve-review.mjs` reads CRANKMAGIC_ENGINE. */
export const ENGINE_ID = "crank";

/** Bumped when the journal or projection shape changes in a way a reader must notice. */
export const ENGINE_PROTOCOL = 1;

/* The phases of `docs/engine/PLAN.md` §6, so a caller can ask what is actually built rather than
   discovering it by catching an exception. `implemented` moves as each phase's gate is passed. */
export const ENGINE_STATUS = Object.freeze({
  id: ENGINE_ID,
  protocol: ENGINE_PROTOCOL,
  phase: 0,
  implemented: Object.freeze([]),
  /* Phase 1's gate, from §6: a four-player game of vanilla creatures and lands with commanders
     running to completion for 1,000 seeds, the same hash on replay, no hidden card in any seat
     projection. Until that passes, this engine plays nothing. */
  next: "kernel: rng, state, zones, turn structure, priority, stack",
});

export class EngineNotImplemented extends Error {
  constructor(what) {
    super(`${what} is not implemented yet. The CrankMagic engine is at phase ${ENGINE_STATUS.phase}; `
      + `next is ${ENGINE_STATUS.next}. Run with CRANKMAGIC_ENGINE=forge until phase 1's gate passes.`);
    this.name = "EngineNotImplemented";
    this.engine = ENGINE_ID;
    this.phase = ENGINE_STATUS.phase;
  }
}

/**
 * Start a game.
 *
 * @param {object} pod   seats, decks and settings, the shape `local-game-launcher.mjs` already builds
 * @param {{seed?: string}} options  the seed every random decision derives from; same pod and seed
 *                                   must produce the same journal and the same state hashes (§3.2.1)
 * @returns {never} until phase 1
 */
export function createGame(pod, options = {}) {
  void pod; void options;
  throw new EngineNotImplemented("createGame");
}
