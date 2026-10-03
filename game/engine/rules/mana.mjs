/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MANA AND MANA COSTS: CR 106, 107, 202.3.
 *
 * `docs/engine/PLAN.md` §3.3, fourth row, and §12.1's `payment.automaticEligible` — the board
 * already distinguishes "the engine can just pay this" from "the player must choose", and this file
 * is where that question gets its answer.
 *
 * THE THREE HYBRIDS DO NOT PAY ALIKE, and folding them together is the quiet defect here:
 *
 *   {W/U}  either color.                                    Mana value 1.
 *   {2/W}  one white, OR two mana of any kind (CR 107.4e).  Mana value 2, however it is paid.
 *   {W/P}  one white, OR two life (CR 107.4f). Not mana.    Mana value 1.
 *
 * A parser that treats all three as "one of two things" makes costs payable that should not be,
 * which is unwinnable-game territory and the kind of thing nobody reports because they assume they
 * misread the card.
 *
 * {C} IS NOT GENERIC (CR 107.4c). A colorless mana requirement is paid only with colorless mana;
 * generic is paid with anything. The symbols look similar and the rules are opposite.
 *
 * X IS ZERO EXCEPT ON THE STACK (CR 202.3e). The deck page's curve, every "mana value 3 or less"
 * selector and the statistics all read mana value, so getting this wrong is visible in the app long
 * before it is visible in a game.
 *
 * WHEN A PAYMENT IS AMBIGUOUS, THE ENGINE DOES NOT CHOOSE. Which color pays a generic symbol is the
 * player's business: the mana they keep is the spell they can still cast. `automaticPayment`
 * returns null rather than picking, and the caller offers the choice (§3.2.3).
 */

export const COLORS = Object.freeze(["W", "U", "B", "R", "G"]);
import {summoningSick} from "../keywords/timing.mjs";
import {abilitiesOf} from "./layers.mjs";

/** The pool's keys: the five colors plus colorless. */
export const MANA_KEYS = Object.freeze([...COLORS, "C"]);

const emptyColored = () => ({W: 0, U: 0, B: 0, R: 0, G: 0, C: 0});

/**
 * Read a mana cost.
 *
 * @param {string} text  a cost as printed, e.g. "{2}{G}{G}", "{X}{R}", "{W/U}", "" for free
 * @returns {{symbols: Array, generic: number, colored: object, variable: number}}
 */
export function parseManaCost(text) {
  const source = String(text ?? "").trim();
  const cost = {symbols: [], generic: 0, colored: emptyColored(), variable: 0};
  if (source === "") return cost;

  /* Every symbol is braced. A bare "2G" is not a cost, and accepting it would mean accepting
     whatever else a bad import produced. */
  let at = 0;
  while (at < source.length) {
    if (source[at] !== "{") throw new Error(`A mana cost is made of braced symbols; cannot understand ${JSON.stringify(source)}`);
    const close = source.indexOf("}", at);
    if (close < 0) throw new Error(`Unclosed mana symbol in ${JSON.stringify(source)}`);
    const body = source.slice(at + 1, close);
    at = close + 1;
    cost.symbols.push(readSymbol(body, cost));
  }
  return cost;
}

function readSymbol(body, cost) {
  if (/^\d+$/.test(body)) {
    const amount = Number(body);
    cost.generic += amount;
    return {kind: "generic", amount};
  }
  if (MANA_KEYS.includes(body)) {
    cost.colored[body] += 1;
    return {kind: "colored", color: body};
  }
  if (/^[XYZ]$/.test(body)) {
    cost.variable += 1;
    return {kind: "variable", name: body};
  }
  if (body === "S") return {kind: "snow"};
  /* CR 107.4f, before the plain hybrid: {W/P} is Phyrexian, not a two-color hybrid. */
  const phyrexian = /^([WUBRGC])\/P$/.exec(body);
  if (phyrexian) return {kind: "phyrexian", color: phyrexian[1], life: 2};
  /* CR 107.4e: {2/W} is two generic or one white, and its mana value is 2 either way. */
  const mono = /^(\d+)\/([WUBRGC])$/.exec(body);
  if (mono) return {kind: "monohybrid", amount: Number(mono[1]), color: mono[2]};
  const hybrid = /^([WUBRGC])\/([WUBRGC])$/.exec(body);
  if (hybrid) return {kind: "hybrid", either: [hybrid[1], hybrid[2]]};
  throw new Error(`Cannot understand the mana symbol {${body}}`);
}

/**
 * The cost's mana value (CR 202.3).
 *
 * @param {object} cost  from `parseManaCost`
 * @param {{x?: number}} options  X's chosen value; zero anywhere but on the stack (CR 202.3e)
 */
export function manaValue(cost, {x = 0} = {}) {
  let total = 0;
  for (const symbol of cost.symbols) {
    if (symbol.kind === "generic") total += symbol.amount;
    else if (symbol.kind === "variable") total += x;
    /* CR 202.3f: a monocolored hybrid counts as its generic half however it is paid. */
    else if (symbol.kind === "monohybrid") total += symbol.amount;
    else total += 1;
  }
  return total;
}

/** How much mana is in a pool. */
export const poolSize = (pool) => MANA_KEYS.reduce((sum, key) => sum + (pool[key] ?? 0), 0);

/** Add mana to a pool. Refuses an unknown color rather than creating a sixth one. */
export function addMana(pool, mana) {
  for (const [key, amount] of Object.entries(mana)) {
    if (!MANA_KEYS.includes(key)) throw new Error(`There is no mana color ${JSON.stringify(key)}`);
    if (!Number.isInteger(amount) || amount < 0) throw new Error("Mana is added in whole, non-negative amounts");
    pool[key] += amount;
  }
  return pool;
}

/** Take mana out of a pool. A pool may never go negative: that is a spell cast unpaid. */
export function spend(pool, mana) {
  for (const [key, amount] of Object.entries(mana)) {
    if (!MANA_KEYS.includes(key)) throw new Error(`There is no mana color ${JSON.stringify(key)}`);
    if ((pool[key] ?? 0) < amount) throw new Error(`Not enough ${key} in the pool to spend ${amount}`);
  }
  for (const [key, amount] of Object.entries(mana)) pool[key] -= amount;
  return pool;
}

/* ---- paying ----
 *
 * Every payment is enumerated the same way: walk the symbols, and at each one branch over the ways
 * it can be paid. The branching factor is tiny — a cost with more than a handful of hybrids does
 * not exist — and enumerating is the only way to answer "is there more than one way to pay this",
 * which is the question §12.1 actually asks. */

const KEY_ORDER = MANA_KEYS;

/* Ways to pay one symbol, each as {mana, life} to subtract. Generic and monohybrid's generic half
   are handled separately because they can come from any color, which is a choice over the pool
   rather than over the symbol. */
function waysToPay(symbol, available, life) {
  const one = (key) => ({mana: {[key]: 1}, life: 0});
  switch (symbol.kind) {
    case "colored": return available[symbol.color] > 0 ? [one(symbol.color)] : [];
    /* CR 107.4h: snow mana is produced by snow sources; the pool does not track its source yet, so
       the honest answer is that any mana pays it and 1.8 refines it when snow permanents exist. */
    case "snow": return KEY_ORDER.filter((key) => available[key] > 0).map(one);
    case "hybrid": return symbol.either.filter((color) => available[color] > 0).map(one);
    case "phyrexian": {
      const ways = available[symbol.color] > 0 ? [one(symbol.color)] : [];
      if (life >= symbol.life) ways.push({mana: {}, life: symbol.life});
      return ways;
    }
    default: return [];
  }
}

/* Enumerate payments, stopping as soon as `limit` distinct ones are found. Distinct means the
   amounts differ: paying the same two green in a different order is one payment, not two. */
function payments(pool, cost, {x = 0, life = 0} = {}, limit = 2) {
  const found = new Map();
  const fixed = [];
  let generic = cost.generic + x;

  for (const symbol of cost.symbols) {
    if (symbol.kind === "generic" || symbol.kind === "variable") continue;
    if (symbol.kind === "monohybrid") { fixed.push(symbol); continue; }
    fixed.push(symbol);
  }

  const available = {...emptyColored(), ...pool};

  const walk = (index, spentMana, spentLife, genericLeft) => {
    if (found.size >= limit) return;
    if (index >= fixed.length) {
      /* Generic is paid with anything left. Each distinct multiset of colors is a distinct payment,
         which is exactly the ambiguity the player is entitled to resolve. */
      spendGeneric(available, spentMana, spentLife, genericLeft, found, limit);
      return;
    }
    const symbol = fixed[index];
    if (symbol.kind === "monohybrid") {
      /* Either the colored half now, or its generic amount added to the generic pile. */
      if (available[symbol.color] > 0) {
        available[symbol.color] -= 1;
        walk(index + 1, {...spentMana, [symbol.color]: (spentMana[symbol.color] ?? 0) + 1}, spentLife, genericLeft);
        available[symbol.color] += 1;
      }
      walk(index + 1, spentMana, spentLife, genericLeft + symbol.amount);
      return;
    }
    for (const way of waysToPay(symbol, available, life - spentLife)) {
      const next = {...spentMana};
      for (const [key, amount] of Object.entries(way.mana)) {
        available[key] -= amount;
        next[key] = (next[key] ?? 0) + amount;
      }
      walk(index + 1, next, spentLife + way.life, genericLeft);
      for (const [key, amount] of Object.entries(way.mana)) available[key] += amount;
    }
  };

  const spendGeneric = (left, spentMana, spentLife, need, out, cap) => {
    if (need === 0) {
      const mana = {...emptyColored()};
      for (const [key, amount] of Object.entries(spentMana)) mana[key] = amount;
      const signature = KEY_ORDER.map((key) => mana[key]).join(",") + "|" + spentLife;
      if (!out.has(signature)) out.set(signature, {mana, life: spentLife});
      return;
    }
    if (out.size >= cap) return;
    /* Choose which color pays the next generic. Only colors with mana left, and only in a
       non-decreasing key order, so the same multiset is not enumerated many times over. */
    for (const key of KEY_ORDER) {
      if (left[key] <= 0) continue;
      left[key] -= 1;
      spendGeneric(left, {...spentMana, [key]: (spentMana[key] ?? 0) + 1}, spentLife, need - 1, out, cap);
      left[key] += 1;
      if (out.size >= cap) return;
    }
  };

  walk(0, {}, 0, generic);
  return [...found.values()];
}

/**
 * Whether this pool (and this much life) can pay this cost at all.
 */
export function canPay(pool, cost, options = {}) {
  return payments(pool, cost, options, 1).length > 0;
}

/**
 * The one legal payment, or null when there is none — or more than one.
 *
 * Null for "more than one" is deliberate and is what §12.1's `payment.automaticEligible` means:
 * which color pays a generic symbol decides which spell the player can still cast afterwards, so it
 * is theirs to decide, not the engine's to guess.
 */
export function automaticPayment(pool, cost, options = {}) {
  const found = payments(pool, cost, options, 2);
  return found.length === 1 ? found[0] : null;
}

/** Every distinct way to pay, up to `limit`, for offering as a choice. */
export function paymentOptions(pool, cost, options = {}, limit = 12) {
  return payments(pool, cost, options, limit);
}

/* ---- paying "unless" (CR 118.12) for a player who does not hold priority ----
 *
 * The payer answers a question in the middle of a resolution and has no priority in which to tap, so paying taps for
 * them: the pool first, then their untapped mana sources that need nothing but {T} -- a land, a mana rock, a creature
 * that has been theirs since their turn began -- each adding its first kind of mana. Generic mana only.
 */
const PAY_ORDER = ["C", "W", "U", "B", "R", "G"];
function plainSources(state, player) {
  const out = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (object.controller !== player || object.tapped) continue;
    /* CR 302.6: a creature's {T} waits until it has been theirs since their turn began. */
    if (summoningSick(state, id)) continue;
    const ability = abilitiesOf(state, id).find((a) => a.kind === "mana" && a.tapSelf && !a.cost && !a.payLife && !a.sacrifice && !a.sacrificeSelf && !a.condition && !a.spendOnly
      && (a.produces || a.anyColor === true));
    if (ability) out.push({id, ability});
  }
  return out;
}
/** Whether a player could pay this much generic mana now, from the pool and plain sources together. */
export function canPayGeneric(state, player, amount) {
  return poolSize(state.players[player].manaPool) + plainSources(state, player).length >= amount;
}
/** Pay it: the pool first, then tap sources as needed. @returns {Array} events */
export function payGeneric(state, player, amount) {
  const events = [];
  const pool = state.players[player].manaPool;
  let left = amount;
  for (const key of PAY_ORDER) while (left > 0 && (pool[key] ?? 0) > 0) { pool[key] -= 1; left -= 1; }
  for (const {id} of plainSources(state, player)) {
    if (left <= 0) break;
    state.objects[id].tapped = true;
    events.push({kind: "GameEventCardTapped", data: {turn: state.turn, phase: state.phase, fields: {card: {cardId: id, name: state.objects[id].card, owner: state.objects[id].owner, controller: player, faceDown: false}, tapped: true}}});
    left -= 1;
  }
  return events;
}
