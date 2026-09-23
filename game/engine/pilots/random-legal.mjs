/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PILOT THAT PLAYS BADLY ON PURPOSE.
 *
 * `docs/engine/PLAN.md` §3.6: "picks uniformly from enumerated legal actions; used by the
 * termination and determinism tests."
 *
 * It is not a weak AI. It is a measuring instrument. A game it cannot finish is a game the engine
 * cannot finish, and because it explores without preference it walks into positions a competent
 * pilot would avoid — which is exactly where the rules are thin. The house pilot in §3.6 plays
 * well; this one plays everywhere.
 *
 * IT DRAWS FROM THE GAME'S OWN RNG. Not `Math.random`. A game played by this pilot is reproducible
 * from its seed, so a crash found in the thousandth seed of a fuzz run is a bug report somebody can
 * replay rather than a story about something that happened once.
 *
 * IT CHOOSES ONLY FROM WHAT IT IS HANDED. It never inspects the state, never names an action it was
 * not offered, and refuses an empty list rather than returning undefined for its caller to trip
 * over one frame later.
 */

/**
 * @param {object} rng  from `createRng`; the game's own stream, so the choice is reproducible
 */
export function randomLegalPilot(rng) {
  if (!rng || typeof rng.int !== "function") throw new Error("A pilot needs the game's rng");
  return {
    id: "random-legal",

    /** One of the given actions, uniformly. */
    choose(actions) {
      if (!Array.isArray(actions) || actions.length === 0)
        throw new Error("There are no legal actions to choose from");
      return actions[rng.int(actions.length)];
    },

    /**
     * An answer to an offered choice (§12.1), for when the kernel starts asking questions with more
     * than one shape. Uniform within the record's own bounds, so the answer is always one the
     * controller will accept.
     */
    answer(choice) {
      const min = choice.min ?? 0, max = choice.max ?? 0;
      if (choice.mode === "integer") return {value: min + rng.int(max - min + 1)};
      if (choice.mode === "ack") return {indices: []};
      if (choice.mode === "text") return {cancel: true};

      /* CR 510.1c: lethal to each in order before the damage moves on. Walking the list and giving
         each what would kill it is the simplest assignment that satisfies the rule; anything left
         over after every blocker has lethal goes on the last one, because the whole amount has to
         be assigned somewhere. The controller validates this against the same rule, so a pilot that
         could not produce a legal assignment would stall a game rather than play a bad one. */
      if (choice.mode === "damage") {
        const targets = choice.options ?? [];
        const amounts = targets.map(() => 0);
        let left = choice.total ?? 0;
        for (let i = 0; i < targets.length; i += 1) {
          const take = Math.min(left, Math.max(0, targets[i].lethal ?? 0));
          amounts[i] = take;
          left -= take;
        }
        if (left > 0 && amounts.length > 0) amounts[amounts.length - 1] += left;
        return {indices: [], amounts};
      }

      /* CR 601.2d: each recipient gets at least the minimum, none gets more than its cap, and the
         total is spent exactly. */
      if (choice.mode === "amount") {
        const targets = choice.options ?? [];
        const minEach = choice.minEach ?? 0;
        const amounts = targets.map(() => minEach);
        let left = (choice.total ?? 0) - minEach * targets.length;
        for (let i = 0; i < targets.length && left > 0; i += 1) {
          const room = Math.max(0, (targets[i].max ?? 0) - amounts[i]);
          const take = Math.min(left, room);
          amounts[i] += take;
          left -= take;
        }
        return {indices: [], amounts};
      }

      const options = choice.options ?? [];
      const take = min + rng.int(Math.max(0, Math.min(max, options.length) - min) + 1);
      /* Draw without replacement, because an index repeated is not a second selection and the
         controller refuses it. */
      const pool = options.map((_, index) => index);
      const indices = [];
      for (let i = 0; i < take; i += 1) indices.push(...pool.splice(rng.int(pool.length), 1));
      return {indices};
    },
  };
}
