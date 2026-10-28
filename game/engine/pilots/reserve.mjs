/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE RESERVE: THE CREATURES HELD HOME FOR THE SWING BACK (docs/ai-players/PLAN-2026-10-26.html §5).
 *
 * Rob, 2026-10-26: Hard considers "the creatures that they would use and the blockers they may want to hold back. Based on
 * the attack potential of other players, the number of creatures on the board, the number of creatures with trample or with
 * flying on the board, and a weighted probability that X number of blockers may be needed between now and my next turn,
 * that AI would hold back the necessary number of blockers and/or the necessary size of blockers if facing those with trample
 * and similar."
 *
 *   for each opponent o, before my next turn:
 *     theirs(o)   every creature of theirs that can attack (they untap first), power above 0, no defender
 *     P(o)        the chance o swings at me rather than at the table's top threat:
 *                 sigmoid(K x (their effect on me - their effect on that seat)), an effect being the damage through as a
 *                 share of the life it is aimed at; 1 when there is no one else for them to hit
 *     through(o, R)  what theirs(o) gets through when my guards and R block to absorb (the pilot's `absorb`: each blocker where it
 *                 cuts the most; a blocked attacker deals none, a trampler all but what its blocker soaks, a flyer is met only by
 *                 a flyer or reach)
 *   the reserve R is the smallest set of my would-be attackers such that
 *     no opponent with P(o) of PMIN or more has a lethal through(o, R), and
 *     the expected damage, the sum of P(o) x through(o, R), is no more than `risk` of my life
 *   built one creature at a time, the one that cuts the expected damage most (the cheaper on a tie), stopping when nothing
 *   cuts it more. `risk` is the difficulty's appetite: Hard 0.25, Normal 1 (only a lethal swing is held against), Easy none (RISK); a persona moves it
 *   (roster.mjs). Pure: the pilot hands in what the view shows and its own `defend`; nothing here reads a hidden card.
 */

/* `risk` is the share of its life it will let the swing back take, on average. Normal's 1 never binds: only a lethal swing is held
   against, one blocker at a time (the plan's "one blocker held when any opponent could present lethal next turn"). */
export const RISK = Object.freeze({normal: 1, hard: 0.25});
export const SWING_K = 6;
export const PMIN = 0.2;
/* The most it will work out: a board of dozens of creatures (a Goblin swarm) is the pilot's crackback term's, as before. */
export const MOST_CANDIDATES = 12;
export const MOST_THEIRS = 30;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/**
 * @param {{candidates: object[], guards: object[], foes: {playerId: number, life: number}[], myLife: number,
 *          theirs: (playerId: number) => object[], blockersOf: (playerId: number) => object[], threatOf: (playerId: number) => number,
 *          through: (attackers: object[], blockers: object[]) => number, worth: (card: object) => number, risk: number}} args
 *   `candidates`: my creatures that could attack and would stop blocking if they did; `guards`: mine that block either way
 *   (defenders, power 0, vigilance). Returns the card ids to hold home.
 */
export function reserveFor({candidates, guards, foes, myLife, theirs, blockersOf, threatOf, through, worth, risk}) {
  if (!candidates.length || !foes.length || candidates.length > MOST_CANDIDATES || foes.some((o) => theirs(o.playerId).length > MOST_THEIRS)) return [];
  const life = Math.max(1, myLife);
  /* P(o): the chance o comes at me, from what each could do to me against what each could do to the table's top threat. */
  const p = new Map(foes.map((o) => {
    const at = theirs(o.playerId);
    const others = foes.filter((f) => f.playerId !== o.playerId);
    if (!others.length) return [o.playerId, 1];
    const top = others.reduce((best, f) => (threatOf(f.playerId) > threatOf(best.playerId) ? f : best));
    const onMe = through(at, guards) / life;
    const onTop = through(at, blockersOf(top.playerId)) / Math.max(1, top.life);
    return [o.playerId, sigmoid(SWING_K * (onMe - onTop))];
  }));
  const state = (held) => {
    const blockers = [...guards, ...held];
    let expected = 0, lethal = false;
    for (const o of foes) {
      const got = through(theirs(o.playerId), blockers);
      expected += p.get(o.playerId) * got;
      if (got >= life && p.get(o.playerId) >= PMIN) lethal = true;
    }
    return {expected, lethal, fine: !lethal && expected / life <= risk};
  };
  const held = [], pool = [...candidates];
  let now = state(held);
  while (!now.fine && pool.length) {
    let best = null;
    for (const c of pool) {
      const s = state([...held, c]);
      const better = !best || s.expected < best.s.expected - 1e-9 || (Math.abs(s.expected - best.s.expected) <= 1e-9 && worth(c) < worth(best.c));
      if (better) best = {c, s};
    }
    /* Nothing cuts the expected damage or lifts a lethal: holding more home is no help, and the rest may as well attack. */
    if (best.s.expected >= now.expected - 1e-9 && !(now.lethal && !best.s.lethal)) break;
    held.push(best.c);
    pool.splice(pool.indexOf(best.c), 1);
    now = best.s;
  }
  return held.map((c) => c.cardId);
}
