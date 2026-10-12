/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE ONLY SOURCE OF RANDOMNESS IN THE ENGINE.
 *
 * `docs/engine/PLAN.md` §3.1 (rng.mjs: "seeded PRNG, splitmix32 seeding xoshiro128**, tape record
 * and replay") and §3.2.1: all randomness goes through here, so the same pod, seed and decisions
 * produce the same journal and the same state hashes.
 *
 * Three promises are kept here and nowhere else, and everything above depends on all three:
 *
 *   REPRODUCIBLE  a seed is a stream. A bug report is a seed plus a decision tape, and replaying it
 *                 gives the same game — which is also how phase 5 compares this engine to Forge.
 *   RESUMABLE     the position is plain data (§3.2.4), so `structuredClone(state)` plus a
 *                 checkpoint restores a game mid-decision. Resume is a feature, not a recovery
 *                 hack, so the generator must never hide state in a closure a clone cannot reach.
 *   UNBIASED      a shuffled library has to be a fair permutation. A biased shuffle does not crash;
 *                 it quietly changes which games are winnable, and nobody notices for months.
 *
 * `Math.random` must never appear anywhere under `game/engine/`.
 *
 * WHY THESE TWO ALGORITHMS. xoshiro128** is small, fast, has a long period and passes the usual
 * statistical batteries, and it needs four well-mixed 32-bit words to start. splitmix32 is the
 * standard way to grow one seed into those four: seeding xoshiro's state directly from a small
 * number leaves it correlated for the first draws, which would show up exactly where it matters —
 * the opening shuffle. Both are published public-domain constructions, written here from their
 * definitions; no implementation was copied from anywhere.
 *
 * No platform calls: no `node:crypto`, no WebCrypto, no `Date`. Node and a browser Worker see the
 * same stream (§3.2.7).
 */

/** The draw kinds a tape can record. A replay reads these, so a person can too. */
export const SEQUENCE_KINDS = ["unit", "int", "shuffle"];

/* A seed is any string. FNV-1a folds it to the 32 bits splitmix32 expands; it is a hash, not a
   generator, and is used only to start one. */
function seedToWord(seed) {
  let h = 0x811c9dc5;
  const text = String(seed ?? "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* splitmix32: one word in, one well-mixed word out, advancing its own counter. Used only to fill
   xoshiro's four words so they do not start correlated. */
function splitmix32(word) {
  let a = word >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/**
 * A seeded generator.
 *
 * @param {string} seed      the game's seed; any string, including the empty one
 * @param {?object} resume   a checkpoint from `.checkpoint()`, to continue an interrupted stream
 * @param {{record?: boolean}} options  `record` keeps a tape of every draw, off by default
 */
export function createRng(seed, resume = null, options = {}) {
  let s0, s1, s2, s3, draws;

  if (resume) {
    /* A checkpoint is plain data and may have been through JSON, so every field is coerced and
       checked rather than trusted: a malformed resume must fail here, loudly, and not produce a
       plausible-looking game on a stream nobody can reproduce. */
    const w = resume.words;
    if (!Array.isArray(w) || w.length !== 4 || w.some((n) => !Number.isInteger(n)))
      throw new Error("An rng checkpoint needs four integer words");
    if (!Number.isInteger(resume.draws) || resume.draws < 0)
      throw new Error("An rng checkpoint needs a draw count");
    [s0, s1, s2, s3] = w.map((n) => n >>> 0);
    draws = resume.draws;
  } else {
    const grow = splitmix32(seedToWord(seed));
    s0 = grow(); s1 = grow(); s2 = grow(); s3 = grow();
    draws = 0;
  }

  const tape = [];
  const recording = options.record === true;

  /* xoshiro128**: one 32-bit word per call. */
  function word() {
    const five = Math.imul(s1, 5) >>> 0;
    const r = Math.imul(((five << 7) | (five >>> 25)) >>> 0, 9) >>> 0;   /* rotl(s1 * 5, 7) * 9 */
    const t = (s1 << 9) >>> 0;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t;
    s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;
    s0 >>>= 0; s1 >>>= 0; s2 >>>= 0; s3 >>>= 0;
    draws += 1;
    return r;
  }

  const record = (kind, value) => { if (recording) tape.push({kind, at: draws, value}); };

  const api = {
    /** A float in [0, 1). The 32-bit word divided by 2^32, so 1 is never reached. */
    unit() {
      const n = word() / 4294967296;
      record("unit", n);
      return n;
    },

    /**
     * An integer in [0, bound). REJECTION SAMPLING, not modulo: `word() % bound` is biased toward
     * the low values whenever bound does not divide 2^32, which for a shuffle means the bottom of
     * the library is very slightly likelier to stay put. The loop draws again from the tail rather
     * than folding it in, so every value is equally likely.
     */
    int(bound) {
      if (!Number.isInteger(bound)) throw new Error("int(bound) needs an integer bound");
      if (bound <= 0) throw new Error("int(bound) needs a positive bound");
      const limit = 4294967296 - (4294967296 % bound);
      let n = word();
      while (n >= limit) n = word();
      const value = n % bound;
      record("int", {bound, value});
      return value;
    },

    /** One element, uniformly. Throws on an empty list rather than returning undefined. */
    pick(list) {
      if (!Array.isArray(list) || list.length === 0) throw new Error("pick needs a non-empty array");
      return list[this.int(list.length)];
    },

    /**
     * A fair permutation, as a NEW array. Fisher-Yates walking down, which is the form that is
     * unbiased; the upward variant with `int(length)` is the classic subtly-wrong shuffle.
     * The input is left alone because a library is shuffled, not mutated underfoot.
     */
    shuffle(list) {
      const out = Array.from(list);
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = api.int(i + 1);
        const swap = out[i]; out[i] = out[j]; out[j] = swap;
      }
      record("shuffle", {size: out.length});
      return out;
    },

    /** The position, as plain data. Part of a checkpoint (§3.2.4). */
    checkpoint() {
      return {words: [s0, s1, s2, s3].map((n) => n >>> 0), draws};
    },

    /** Every draw taken, when recording. Empty otherwise: a game does not pay for a tape nobody reads. */
    tape() {
      return tape.slice();
    },

    /** How many words have been drawn. The cheap half of a checkpoint, for a journal line. */
    get draws() {
      return draws;
    },
  };

  return api;
}
