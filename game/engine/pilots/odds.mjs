/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* DRAW ODDS: THE HYPERGEOMETRIC DISTRIBUTION (AI-2's L1, docs/plan-to-done-2026-09-30.md).
 *
 * Drawing `draws` cards from a library of `size` cards, `hits` of which are what is wanted, without putting any back: the
 * chance of exactly `k` of them is C(hits, k) C(size - hits, draws - k) / C(size, draws). A pilot asks it of its own deck
 * list less the cards it has seen, which is what its player knows; never of the library's order, which nobody does. A
 * deck is at most a hundred cards, so the binomials are exact enough as floating-point products.
 */

/** C(n, k): the ways to choose k of n; 0 outside 0 <= k <= n. */
export function binomial(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0;
  const m = Math.min(k, n - k);
  let ways = 1;
  for (let i = 1; i <= m; i += 1) ways = (ways * (n - m + i)) / i;
  return ways;
}

/** The chance of exactly `k` hits in `draws` cards from `size`, `hits` of them hits. */
export function exactly(size, hits, draws, k) {
  if (draws > size) draws = size;
  const all = binomial(size, draws);
  return all ? (binomial(hits, k) * binomial(size - hits, draws - k)) / all : 0;
}

/** The chance of at least `k` hits: 1 when none are needed. */
export function atLeast(size, hits, draws, k) {
  if (k <= 0) return 1;
  let p = 0;
  for (let i = k; i <= Math.min(hits, draws); i += 1) p += exactly(size, hits, draws, i);
  return Math.min(1, p);
}
