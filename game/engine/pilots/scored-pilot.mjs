/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE HOUSE PILOT'S L1: ITS CHOICES SCORED (docs/plan-to-done-2026-09-30.md, AI-2, "The house pilot's levels of decision").
 *
 * Rob, 2026-10-10: L1 "considers some probabilistic outcome or other statistically/mathematically derived result for a
 * good choice out of those provided." L0 (house-pilot.mjs) plays what is legal by rules of thumb; L1 scores the choices
 * that decide games and leaves every other one to L0, which is the floor:
 *
 *   - WHICH SPELLS, with the mana it has: the set of castable spells that spends the most of it (a knapsack), the
 *     largest of them first, where L0 casts the dearest and strands the rest.
 *   - WHERE A SPELL IS AIMED: at the opposing permanent worth the most (or, for its own, its own worth the most).
 *   - WHICH CREATURES ATTACK: each plan scored on the damage it deals, the trades it makes against the defender's likely
 *     blocks (exact combat for the creatures on the board: first strike, double strike, deathtouch, indestructible,
 *     trample, damage already marked), and the swing back it leaves open -- an attack that would let an opponent kill it
 *     next turn is scored down, unless the attack wins the game.
 *   - WHICH CREATURES BLOCK: blocks that kill and survive, trades that favor it, blockers that survive and stop the
 *     damage, and chump blocks only as many as keep it alive -- where L0, facing lethal, throws everything in.
 *   - WHETHER TO KEEP AN OPENING HAND: the hypergeometric chance of its third land by its third turn (odds.mjs), from its
 *     own deck list less what it holds -- what its player knows; never the library's order.
 *
 * IT SEES WHAT L0 SEES: the seat's projection, the offers, the question, public card facts (`cards`), and its own deck
 * list (`deck`), which its player knows. Difficulty changes effort, never information.
 *
 * THE SETTINGS (Rob, 2026-10-10, "I agree with your recommendations"): "normal" takes the best score. "easy" chooses by
 * weighted chance among the plans near the best (a softmax at temperature `TEMPERATURE.easy`, never a plan more than
 * `BAND` temperatures below the best), so it is usually right, sometimes second-best, and never absurd.
 *
 * NO STREAM, SO A REPLAY AGREES. The room does not tape a house pilot's answers: a replay asks the pilot again
 * (game/room/room.mjs, the decision tape). So this pilot keeps nothing between calls, and easy's chance is drawn from the
 * match's seed, the seat and the question (`chance`), not from a stream: the same view gives the same answer, in a
 * replay and in a room woken mid-game alike.
 */

import {housePilot, meetRequirements} from "./house-pilot.mjs";
import {atLeast} from "./odds.mjs";
import {createRng} from "../rng.mjs";

export const SCORED_PILOT_ID = "house-pilot-l1";
export const SETTINGS = ["easy", "normal"];

/* WHAT THINGS ARE WORTH, in one table, so the weights are tuned in one place (the bench: tools/pilot-bench.mjs). A
   creature's worth is its power and half its toughness, plus its keywords; another permanent's is its mana value; a
   land's is small; a commander's is more. Damage is worth its share of the defender's life, ten for all of it. */
export const WEIGHTS = {
  power: 1, toughness: 0.5, land: 0.5, unknown: 2, commander: 2,
  keyword: {"Flying": 1, "Deathtouch": 1.5, "First Strike": 1, "Double Strike": 2, "Lifelink": 0.5, "Trample": 0.5, "Indestructible": 2,
    "Hexproof": 1, "Vigilance": 0.5, "Menace": 0.5, "Reach": 0.25},
  damage: 10,         // for dealing a defender's whole life
  lethal: 100,        // for an attack that kills
  trade: 1,           // for each point of worth taken from the defender, or lost
  exposure: 3,        // for letting through, next turn, a whole life of its own more than holding back would
  crackback: 60,      // for an attack that leaves it dead to the swing back when holding back would not
  others: 0.5,        // each opponent but the most dangerous, in the swing back: not all of them come at once
  aimed: 0.25,        // a spell's target's worth, beside the mana it spends
  keep: 0.6,          // the least chance of its third land by turn three that it keeps a hand for
};
export const TEMPERATURE = {easy: 1.5, normal: 0};
/* What it scores; the rest is L0's. The bench turns them off one at a time, to measure each. */
export const PARTS = ["cast", "attack", "block", "keep"];
export const BAND = 3;
/* The most creature pairs it works combat out for; beyond it (a board of hundreds of Goblins) L0 answers. */
const MOST_PAIRS = 4000;

const MAIN = ["MAIN1", "MAIN2"];
const isLand = (card) => (card?.types ?? []).includes("Land");
const isCreature = (card) => (card?.types ?? []).includes("Creature");
const has = (card, keyword) => (card?.keywords ?? []).includes(keyword);
const power = (card) => Math.max(0, card?.power ?? 0);
const hits = (card) => power(card) * (has(card, "Double Strike") ? 2 : 1);

/**
 * ONE ATTACKER AGAINST ONE BLOCKER, exactly, as the damage steps deal it (CR 510): a first-strike step when either has
 * first strike or double strike (CR 510.4), then the regular step for the rest and the double strikers still alive;
 * damage is lethal at the toughness left after damage already marked, or at any amount from deathtouch (CR 702.2b),
 * and never to an indestructible creature (CR 702.12b).
 */
export function fight(attacker, blocker) {
  const side = (c) => ({power: power(c), left: (c.toughness ?? 0) - (c.damage ?? 0), touch: has(c, "Deathtouch"), sturdy: has(c, "Indestructible"),
    first: has(c, "First Strike") || has(c, "Double Strike"), twice: has(c, "Double Strike"), dead: false, dying: false});
  const A = side(attacker), B = side(blocker);
  const strike = (from, to) => {
    if (from.power <= 0) return;
    to.left -= from.power;
    if (!to.sturdy && (from.touch || to.left <= 0)) to.dying = true;
  };
  for (const step of ["first", "regular"]) {
    const aStrikes = !A.dead && (step === "first" ? A.first : !A.first || A.twice);
    const bStrikes = !B.dead && (step === "first" ? B.first : !B.first || B.twice);
    if (aStrikes) strike(A, B);
    if (bStrikes) strike(B, A);
    A.dead = A.dying; B.dead = B.dying;
  }
  return {attackerDies: A.dead, blockerDies: B.dead};
}

/* What a blocked trampler still deals the player: all but lethal damage to its blocker, one for deathtouch (CR 702.19c). */
const trampleOver = (attacker, blocker) => (!has(attacker, "Trample") ? 0
  : Math.max(0, hits(attacker) - (has(attacker, "Deathtouch") ? 1 : Math.max(0, (blocker.toughness ?? 0) - (blocker.damage ?? 0)))));

/* Who may block whom when the rules are not asking (a plan, or the swing back): flying needs flying or reach (CR 702.9b),
   and menace two blockers (CR 702.111b), which this one-blocker model never gives it. */
export const mayBlock = (blocker, attacker) => !has(attacker, "Menace")
  && (!has(attacker, "Flying") || has(blocker, "Flying") || has(blocker, "Reach"));

/**
 * HOW A SENSIBLE DEFENDER MEETS AN ATTACK, one blocker to an attacker: first the blocks that kill and survive, then the
 * trades that cost it no more than they take, then blockers that survive and stop the damage, and then, only while what
 * gets through would kill it, chump blocks -- the cheapest blocker before the biggest attacker. The worthiest attacker is
 * answered first throughout. `canBlock(blocker, attacker)` says what the rules allow; `toPlayer(attacker)` whether its
 * damage is at the player (an attack on a planeswalker is not). Returns the blocks, the damage through, and who dies.
 */
export function defend({attackers, blockers, life, canBlock = mayBlock, worth, toPlayer = () => true}) {
  const free = [...blockers], blocks = new Map();
  const assign = (a, b) => {blocks.set(a.cardId, b); free.splice(free.indexOf(b), 1);};
  const byWorth = [...attackers].sort((x, y) => worth(y) - worth(x) || x.cardId - y.cardId);
  const cheapest = (list) => list.sort((x, y) => worth(x) - worth(y) || x.cardId - y.cardId)[0];
  for (const want of ["free", "trade", "wall"]) {
    for (const a of byWorth) {
      if (blocks.has(a.cardId)) continue;
      if (want === "wall" && (has(a, "Trample") || !toPlayer(a))) continue;
      const fits = free.filter((b) => canBlock(b, a) && (() => {
        const r = fight(a, b);
        if (want === "free") return r.attackerDies && !r.blockerDies;
        if (want === "trade") return r.attackerDies && r.blockerDies && worth(b) <= worth(a);
        return !r.blockerDies;
      })());
      if (fits.length) assign(a, cheapest(fits));
    }
  }
  const through = () => attackers.filter((a) => toPlayer(a)).reduce((n, a) => n + (blocks.has(a.cardId) ? trampleOver(a, blocks.get(a.cardId)) : hits(a)), 0);
  /* Chump blocks, the biggest attacker first, only while the rest would kill. */
  const biggest = [...attackers].filter((a) => toPlayer(a)).sort((x, y) => hits(y) - hits(x) || x.cardId - y.cardId);
  for (const a of biggest) {
    if (through() < life) break;
    if (blocks.has(a.cardId)) continue;
    const able = free.filter((b) => canBlock(b, a));
    if (able.length) assign(a, cheapest(able));
  }
  const attackersLost = [], blockersLost = [];
  for (const a of attackers) {
    const b = blocks.get(a.cardId);
    if (!b) continue;
    const r = fight(a, b);
    if (r.attackerDies) attackersLost.push(a);
    if (r.blockerDies) blockersLost.push(b);
  }
  return {blocks, through: through(), attackersLost, blockersLost};
}

/* A chance in [0, 1) from the match's seed, the seat and the question: the same every time it is asked. */
const chance = (...parts) => createRng(parts.join("|")).unit();

/**
 * THE CHOSEN PLAN among scored ones: the best at "normal"; at "easy", by weighted chance among those within BAND
 * temperatures of the best. Ties go to the earlier plan, so the order plans are made in is the tie-break.
 */
export function pick(plans, setting, roll) {
  if (!plans.length) return null;
  const best = plans.reduce((top, p) => (p.value > top.value ? p : top));
  const t = TEMPERATURE[setting] ?? 0;
  if (!(t > 0)) return best;
  const near = plans.filter((p) => p.value >= best.value - BAND * t);
  const weights = near.map((p) => Math.exp((p.value - best.value) / t));
  let r = roll() * weights.reduce((n, w) => n + w, 0);
  for (let i = 0; i < near.length; i += 1) {r -= weights[i]; if (r < 0) return near[i];}
  return near[near.length - 1];
}

/**
 * @param {{seat: number, cards?: Function, deck?: string[], setting?: string, seed?: string}} options
 *   `deck`: the seat's own deck list by name, which its player knows; `setting`: "easy" or "normal"; `seed`: the match's,
 *   for easy's chance.
 */
export function scoredPilot({seat, cards = () => null, deck = [], setting = "normal", seed = "", parts = PARTS, weights = WEIGHTS} = {}) {
  if (!SETTINGS.includes(setting)) throw new Error(`The house pilot plays at ${SETTINGS.join(" or ")}, not ${setting}`);
  const on = new Set(parts);
  const floor = housePilot({seat, cards});
  const known = (name) => (name ? cards(name) : null) ?? null;
  const manaValue = (name) => known(name)?.manaValue ?? Infinity;
  const W = weights;

  const me = (view) => {
    if (!view || view.viewerSeatId !== seat) throw new Error(`The house pilot for seat ${seat} was handed seat ${view?.viewerSeatId}'s view`);
    return view.players[seat];
  };
  const zone = (player, name) => player?.zones?.[name]?.cards ?? [];
  const battlefield = (view) => (view.players ?? []).flatMap((p) => zone(p, "Battlefield"));
  const creaturesOf = (view, playerId) => battlefield(view).filter((c) => isCreature(c) && c.controller === playerId);
  const opponents = (view) => view.players.filter((p) => p.playerId !== seat && p.health.status === "active");
  const roll = (view, key) => () => chance(seed, seat, view.turn, view.phase, key);

  function worth(card) {
    if (!card) return 0;
    let v;
    if (isCreature(card)) {
      v = power(card) * W.power + Math.max(0, card.toughness ?? 0) * W.toughness;
      for (const k of card.keywords ?? []) v += W.keyword[k] ?? 0;
    } else if (isLand(card)) v = W.land;
    else {const mv = known(card.name)?.manaValue; v = Number.isFinite(mv) ? mv : W.unknown;}
    return v + (card.commander ? W.commander : 0);
  }

  /* An offer's targets: how many are on the side its effect is meant for (as L0 counts them), and what they are worth. */
  function aimOf(view, action) {
    const where = new Map(battlefield(view).map((c) => [c.cardId, c]));
    let on = 0, value = 0;
    for (const t of action.targets ?? []) {
      if (Array.isArray(t)) {on += 1; continue;}
      if (t?.kind === "choose") {on += (t.of ?? 1) > 0 ? 1 : 0; continue;}
      const card = t.kind === "player" ? null : where.get(t.id);
      const theirs = t.kind === "player" ? t.id !== seat : (card?.controller ?? seat) !== seat;
      if (theirs !== (action.hostile === true)) continue;
      on += 1;
      value += card ? worth(card) : 0;
    }
    return {on, value};
  }

  /* ---- Which spells, with the mana it has ---- */
  function castPlan(view, actions) {
    const self = me(view);
    const offers = actions.filter((a) => a.kind === "cast" && a.x === undefined && !a.convoke);
    if (!offers.length) return null;
    /* One offer per spell: the one aimed best. */
    const bySpell = new Map();
    for (const a of offers) {
      const aim = aimOf(view, a);
      if ((a.targets ?? []).length && aim.on === 0) continue;
      const cost = manaValue(a.label) + (a.tax ?? 0);
      if (!Number.isFinite(cost)) continue;
      const prev = bySpell.get(a.objectId);
      if (!prev || aim.value > prev.aim.value) bySpell.set(a.objectId, {a, aim, cost});
    }
    const spells = [...bySpell.values()].sort((x, y) => y.cost - x.cost || x.a.objectId - y.a.objectId).slice(0, 12);
    if (!spells.length) return null;
    const sources = new Set(actions.filter((a) => a.kind === "activate-mana" && !a.costChoice).map((a) => a.objectId)).size;
    const mana = sources + (self.mana ?? []).reduce((n, m) => n + m.amount, 0);
    /* Every set that fits, scored by the mana it spends and then by what its spells aim at. */
    const plans = [];
    for (let mask = 1; mask < 1 << spells.length; mask += 1) {
      const set = spells.filter((_, i) => mask & (1 << i));
      const spent = set.reduce((n, s) => n + s.cost, 0);
      if (spent > mana) continue;
      const first = set[0];
      plans.push({value: spent + W.aimed * set.reduce((n, s) => n + s.aim.value, 0), first: first.a});
    }
    /* The largest spell of the plan is cast first; the same first spell is one choice, at its best plan's score. */
    const firsts = new Map();
    for (const p of plans) if (!firsts.has(p.first.objectId) || p.value > firsts.get(p.first.objectId).value) firsts.set(p.first.objectId, p);
    const chosen = pick([...firsts.values()], setting, roll(view, `cast:${view.stackSize}:${spells.map((s) => s.a.objectId).join(",")}`));
    return chosen ? chosen.first : null;
  }

  /* ---- Which creatures attack ---- */
  function attackPlan(view, choice) {
    const self = me(view);
    const mine = new Map(creaturesOf(view, seat).map((c) => [c.cardId, c]));
    const foes = opponents(view);
    const plans = [];
    if (mine.size * foes.reduce((n, o) => n + creaturesOf(view, o.playerId).length, 0) > MOST_PAIRS) return null;
    /* What every opponent could swing back with, at the creatures it would have untapped. */
    const swingBack = (lost, blockersLostOf, going) => {
      const goingIds = new Set(going.map((c) => c.cardId));
      const lostIds = new Set(lost.map((c) => c.cardId));
      const guards = [...mine.values()].filter((c) => !c.tapped && !lostIds.has(c.cardId) && (!goingIds.has(c.cardId) || has(c, "Vigilance")));
      const each = foes.map((o) => {
        const gone = new Set((blockersLostOf(o.playerId) ?? []).map((c) => c.cardId));
        const theirs = creaturesOf(view, o.playerId).filter((c) => !gone.has(c.cardId) && !has(c, "Defender") && power(c) > 0);
        return defend({attackers: theirs, blockers: guards, life: self.life, worth}).through;
      }).sort((a, b) => b - a);
      return (each[0] ?? 0) + W.others * each.slice(1).reduce((n, x) => n + x, 0);
    };
    const held = swingBack([], () => [], []);
    for (const p of foes) {
      const ready = choice.options.filter((o) => o.defenderId === p.playerId && o.planeswalkerId === undefined && power(mine.get(o.cardId)) > 0)
        .map((o) => ({o, c: mine.get(o.cardId)}));
      if (!ready.length) continue;
      const walls = creaturesOf(view, p.playerId).filter((c) => !c.tapped);
      const score = (set) => {
        const going = set.map((r) => r.c);
        const out = defend({attackers: going, blockers: walls, life: p.life, worth});
        const lethal = going.length > 0 && out.through >= p.life;
        let value = W.damage * Math.min(out.through, p.life) / Math.max(1, p.life) + (lethal ? W.lethal : 0)
          + W.trade * (out.blockersLost.reduce((n, c) => n + worth(c), 0) - out.attackersLost.reduce((n, c) => n + worth(c), 0));
        if (!(lethal && foes.length === 1)) {
          const back = swingBack(out.attackersLost, (id) => (id === p.playerId ? out.blockersLost : []), going);
          value -= W.exposure * Math.max(0, back - held) / Math.max(1, self.life);
          if (back >= self.life && held < self.life) value -= W.crackback;
        }
        return {value, set, p};
      };
      /* The plans, the most aggressive first: a tie goes to the attack, as L0 would make it. */
      const candidates = [ready, ready.filter((r) => !walls.some((b) => mayBlock(b, r.c) && fight(r.c, b).attackerDies && !fight(r.c, b).blockerDies))];
      /* Greedily, one creature at a time while the plan improves: on a board of a few creatures only. */
      if (ready.length <= 10) {
        let set = [], now = score(set).value;
        for (;;) {
          const next = ready.filter((r) => !set.includes(r)).map((r) => ({r, v: score([...set, r]).value})).sort((a, b) => b.v - a.v)[0];
          if (!next || next.v <= now) break;
          set = [...set, next.r]; now = next.v;
        }
        candidates.push(set);
      }
      candidates.push([]);
      const seen = new Set();
      for (const set of candidates) {
        const key = set.map((r) => r.o.index).sort((a, b) => a - b).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        plans.push(score(set));
      }
    }
    if (!plans.length) return null;
    const chosen = pick(plans, setting, roll(view, `attack:${choice.id}`));
    return {indices: meetRequirements(choice, chosen.set.map((r) => r.o.index), chosen.p.playerId)};
  }

  /* ---- Which creatures block ---- */
  function blockPlan(view, choice) {
    const self = me(view);
    const onBoard = new Map(battlefield(view).map((c) => [c.cardId, c]));
    const attacks = (view.combat?.attacks ?? []).filter((a) => a.defender === seat);
    const attackers = attacks.map((a) => onBoard.get(a.attacker)).filter(Boolean);
    const atMe = new Set(attacks.filter((a) => a.planeswalker === undefined).map((a) => a.attacker));
    const blockers = [...new Set(choice.options.map((o) => o.cardId))].map((id) => onBoard.get(id)).filter(Boolean);
    if (attackers.length * blockers.length > MOST_PAIRS) return null;
    const allowed = new Map(choice.options.map((o) => [`${o.cardId}:${o.attackerId}`, o.index]));
    /* One blocker each, so never a creature with menace, which two or more must block (CR 702.111b). */
    const canBlock = (b, a) => !has(a, "Menace") && allowed.has(`${b.cardId}:${a.cardId}`);
    const out = defend({attackers, blockers, life: self.life, canBlock, worth, toPlayer: (a) => atMe.has(a.cardId)});
    const indices = [...out.blocks].map(([attackerId, b]) => allowed.get(`${b.cardId}:${attackerId}`));
    return {indices: indices.slice(0, Math.max(choice.min ?? 0, Math.min(choice.max ?? indices.length, indices.length)))};
  }

  /* ---- Whether to keep the opening hand ---- */
  function keepOrNot(view, choice) {
    const self = me(view);
    const taken = Number(String(choice.id).split(":")[2] ?? 0);
    const facts = deck.map((name) => known(name));
    if (taken >= 2 || !deck.length || facts.some((f) => !f)) return null;
    const hand = zone(self, "Hand"), lands = hand.filter(isLand).length;
    const size = self.zones?.Library?.count ?? 0;
    const left = Math.max(0, facts.filter((f) => isLand(f)).length - lands);
    const draws = view.turnPlayerId === seat ? 2 : 3;
    const third = atLeast(size, Math.min(left, size), Math.min(draws, size), 3 - lands);
    const keep = lands <= 5 && third >= W.keep;
    const offered = (choice.options ?? []).map((o, i) => o.index ?? i);
    return {indices: [offered[keep ? 0 : 1] ?? offered[0]]};
  }

  return {
    id: SCORED_PILOT_ID,
    seat,
    setting,
    /* Its quick pass is L0's: it takes nothing L0 would not. */
    passes: floor.passes,

    choose(view, actions) {
      me(view);
      if (!Array.isArray(actions) || actions.length === 0) throw new Error("There are no legal actions to choose from");
      /* A land, and a planeswalker's ability, first, as L0 plays them; then the spells it plans; the rest is L0's. */
      if (actions.some((a) => a.kind === "play-land")) return floor.choose(view, actions);
      if (actions.some((a) => a.kind === "activate" && a.loyalty !== undefined)) {
        const l0 = floor.choose(view, actions);
        if (l0.kind === "activate") return l0;
      }
      const planned = on.has("cast") ? castPlan(view, actions) : null;
      return planned ?? floor.choose(view, actions);
    },

    answer(view, choice) {
      me(view);
      const id = String(choice.id ?? "");
      const scored = id.startsWith("mulligan:") && on.has("keep") ? keepOrNot(view, choice)
        : id.startsWith("declare-attackers:") && on.has("attack") ? attackPlan(view, choice)
        : id.startsWith("declare-blockers:") && on.has("block") ? blockPlan(view, choice)
        : null;
      return scored ?? floor.answer(view, choice);
    },
  };
}
