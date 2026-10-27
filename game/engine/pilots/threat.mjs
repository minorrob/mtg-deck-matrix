/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE THREAT TABLE: WHO AT THE TABLE IS THE BIGGEST THREAT, READ THE SAME WAY AT EVERY DIFFICULTY
 * (docs/ai-players/PLAN-2026-10-26.html §4; Rob, 2026-10-26: "determining the calculation of who is the biggest threat:
 * where can I do the most damage or have the biggest effect on their ability to play ... They can see and look at: total
 * life, who has the biggest hitters, who seems to be getting the most cards onto their map, who has the fastest ramp-ups.
 * Those were all triggers that all of the difficulties would pay attention to at a foundational level.")
 *
 * One row per living opponent, six signals each in [0, 1], and a score: the weighted mean of the signals under the
 * difficulty's weights. The difficulty supplies the weights; this module never knows which difficulty is asking, and it
 * reads only what any player at the table can see -- the seat's projection and public card facts -- so a person and an
 * AI are rows of the same shape, and nothing here can tell them apart (tests/engine-threat.mjs holds that invariant).
 *
 *   life       their life as a share of the highest life among the opponents: the seat furthest from losing
 *   hitters    the power on their board, evasion counted, as a share of my life: how fast they could kill me
 *   growth     nonland permanents they have put on the board, a turn, against the table's fastest
 *   ramp       mana sources on their board, a turn, against the table's fastest (lands, and what makes mana)
 *   engine     compounding permanents (doublers, draw engines, token makers with payoffs, untappers, recursion): PR 2 of
 *              the plan reads them from the graph corpus; until then 0, and its weight is 0 at Easy
 *   commander  the commander's threat class from the catalog: PR 2 as well; until then 0
 *
 * EASY reads the four foundation signals at equal weight and keeps a rank, not a score: the top row scores 1 and the rest
 * 0 (ties to the lowest life, then the earlier seat), so its target is the top of the rank and nothing else moves it.
 * NORMAL and HARD take the weighted mean each decision. The pilot multiplies `of(playerId)` by an action's effect on that
 * seat (the damage through as a share of their life; what their board loses): where threat × effect is highest is where
 * it goes, so a huge threat behind a wall of blockers loses to a smaller one that can actually be hit. The pilot reads
 * `over(playerId)`, the score less the table's mean: the table decides where, never whether.
 */

export const SIGNALS = Object.freeze(["life", "hitters", "growth", "ramp", "engine", "commander"]);

/* The weights, by difficulty: the plan's table, §4. A weight of 0 leaves a signal out of the mean. */
export const THREAT_WEIGHTS = Object.freeze({
  easy: Object.freeze({life: 1, hitters: 1, growth: 1, ramp: 1, engine: 0, commander: 0}),
  normal: Object.freeze({life: 0.8, hitters: 1, growth: 0.9, ramp: 1, engine: 0.6, commander: 0.2}),
  hard: Object.freeze({life: 0.6, hitters: 1, growth: 0.8, ramp: 1, engine: 1.2, commander: 1}),
});

/* The same keyword worth L1 gives a creature (scored-pilot.mjs WEIGHTS.keyword), as a fraction of its power: evasion and
   extra damage make a hitter faster. */
const EVASION = {"Flying": 0.5, "Trample": 0.25, "Menace": 0.25, "Double Strike": 1, "Deathtouch": 0.25, "Lifelink": 0.1};

const isLand = (card) => (card?.types ?? []).includes("Land");
const isCreature = (card) => (card?.types ?? []).includes("Creature");
const clamp = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * The threat table for `seat`, from its view.
 *
 * @param {object} view  the seat's projection (game/engine/projection.mjs)
 * @param {{seat: number, cards?: (name: string) => ?object, setting?: string, weights?: object}} options
 *   `cards`: public card facts by name (the room's `factsFrom`): `types` and `makes` are read; `setting`: "easy",
 *   "normal" or "hard", choosing the weights; `weights`: the table of weights by setting, THREAT_WEIGHTS unless given.
 * @returns {{rows: Array<{playerId: number, signals: object, score: number}>, top: ?number, of: (playerId: number) => number}}
 */
export function threatTable(view, {seat, cards = () => null, setting = "normal", weights = THREAT_WEIGHTS} = {}) {
  const w = weights[setting] ?? weights.normal;
  const me = view?.players?.[seat];
  const foes = (view?.players ?? []).filter((p) => p.playerId !== seat && p.health?.status === "active");
  const known = (name) => (name ? cards(name) : null) ?? null;
  const board = (p) => p?.zones?.Battlefield?.cards ?? [];
  /* The turns a seat has taken, near enough: the game's turn count over the seats. */
  const turns = Math.max(1, Math.ceil((view?.turn ?? 1) / Math.max(1, view?.players?.length ?? 1)));
  const myLife = Math.max(1, me?.life ?? 40);
  const hits = (c) => Math.max(0, c.power ?? 0) * (1 + (c.keywords ?? []).reduce((n, k) => n + (EVASION[k] ?? 0), 0));
  const raw = foes.map((p) => {
    const cards = board(p).filter((c) => c.controller === p.playerId);
    const hitters = cards.filter((c) => isCreature(c) && !(c.keywords ?? []).includes("Defender")).reduce((n, c) => n + hits(c), 0);
    const nonland = cards.filter((c) => !isLand(c)).length;
    const sources = cards.filter((c) => isLand(c) || (known(c.name)?.makes ?? []).length > 0).length;
    return {playerId: p.playerId, life: Math.max(0, p.life ?? 0), hitters: hitters / myLife, growth: nonland / turns, ramp: sources / turns};
  });
  const most = (key) => raw.reduce((m, r) => Math.max(m, r[key]), 0);
  const topLife = most("life"), topGrowth = most("growth"), topRamp = most("ramp");
  const rows = raw.map((r) => {
    const signals = {
      life: topLife > 0 ? clamp(r.life / topLife) : 0,
      hitters: clamp(r.hitters),
      growth: topGrowth > 0 ? clamp(r.growth / topGrowth) : 0,
      ramp: topRamp > 0 ? clamp(r.ramp / topRamp) : 0,
      engine: 0,
      commander: 0,
    };
    const total = SIGNALS.reduce((n, k) => n + (w[k] ?? 0), 0);
    const score = total > 0 ? SIGNALS.reduce((n, k) => n + (w[k] ?? 0) * signals[k], 0) / total : 0;
    return {playerId: r.playerId, signals, score, life: r.life};
  });
  /* Easy keeps a rank: the top row is 1, the rest 0; a tie goes to the lowest life, then the earlier seat. */
  if (setting === "easy" && rows.length) {
    const top = rows.reduce((best, r) => (r.score > best.score || (r.score === best.score && (r.life < best.life || (r.life === best.life && r.playerId < best.playerId))) ? r : best));
    for (const r of rows) r.score = r === top ? 1 : 0;
  }
  const byId = new Map(rows.map((r) => [r.playerId, r.score]));
  const top = rows.length ? rows.reduce((best, r) => (r.score > best.score ? r : best)).playerId : null;
  /* The table's mean: a pilot weighs a seat's score against it, so the table says WHERE to go, never WHETHER to attack
     at all -- with one opponent every seat is the mean, and the threat term is nothing. */
  const mean = rows.length ? rows.reduce((n, r) => n + r.score, 0) / rows.length : 0;
  return {rows: rows.map(({playerId, signals, score}) => ({playerId, signals, score})), top, mean, of: (playerId) => byId.get(playerId) ?? 0,
    over: (playerId) => (byId.has(playerId) ? byId.get(playerId) - mean : 0)};
}

/**
 * THE FLOOR UNDER A STUPID ATTACK (Rob, 2026-10-26: "attacking somebody with a creature that will die and do nothing to
 * the other player ... That is not a card anybody would play"): an attack plan in which every attacker dies to the
 * defender's blocks and nothing gets through. Removed before any draw, at every difficulty, so Easy's chance never falls
 * on it. `out` is `defend`'s answer for the plan (scored-pilot.mjs).
 */
export const absurd = (going, out) => going.length > 0 && out.through === 0 && out.attackersLost.length === going.length;
