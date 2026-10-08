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
import {eventCard} from "../state/index.mjs";
import {sickForAbilities} from "../keywords/timing.mjs";
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

  const spendGeneric = (left, spentMana, spentLife, need, out, cap, from = 0) => {
    if (need === 0) {
      const mana = {...emptyColored()};
      for (const [key, amount] of Object.entries(spentMana)) mana[key] = amount;
      const signature = KEY_ORDER.map((key) => mana[key]).join(",") + "|" + spentLife;
      if (!out.has(signature)) out.set(signature, {mana, life: spentLife});
      return;
    }
    if (out.size >= cap) return;
    /* Choose which color pays the next generic. Only colors with mana left, and only in a
       non-decreasing key order (`from`), so the same multiset is not enumerated many times over: every ordering of
       twelve mana paying {12} was walked, seconds each time a pool held exactly the cost (the plan's X8). */
    for (let i = from; i < KEY_ORDER.length; i += 1) {
      const key = KEY_ORDER[i];
      if (left[key] <= 0) continue;
      left[key] -= 1;
      spendGeneric(left, {...spentMana, [key]: (spentMana[key] ?? 0) + 1}, spentLife, need - 1, out, cap, i);
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

/* ---- which payment (the plan's X8b): the pool pays more than one way, and its player says which ----
 *
 * "Which color pays a generic symbol decides which spell the player can still cast afterwards" (automaticPayment), so a
 * cast or an ability the pool can pay more than one way is offered all the same, and its player asked which way once it
 * is taken (rules/actions.mjs, castCostChoice): {W} or {U} for {1}, {G} or 2 life for {G/P}. A way is named by its key --
 * how much of each mana and how much life -- which travels with the action and is checked again as it is paid.
 */

/** The ways asked about at most: the first that `payments` finds, each a distinct amount. */
export const PAY_CHOICES = 12;

/** A payment's name: each mana's count, then the life. */
export const paymentKey = (payment) => `${KEY_ORDER.map((key) => payment.mana?.[key] ?? 0).join(",")}|${payment.life ?? 0}`;

/** A payment in words: "{W}{U}", "{G} and 2 life", "2 life". */
export function paymentWords(payment) {
  const mana = KEY_ORDER.flatMap((key) => Array.from({length: payment.mana?.[key] ?? 0}, () => `{${key}}`)).join("");
  const life = payment.life > 0 ? `${payment.life} life` : "";
  return [mana, life].filter(Boolean).join(" and ") || "nothing";
}

/** The way to pay `key` names, still payable from this pool; with no key, the one way there is (automaticPayment). */
export function chosenPayment(pool, cost, options = {}, key = undefined) {
  if (key === undefined || key === null) return automaticPayment(pool, cost, options);
  return payments(pool, cost, options, PAY_CHOICES).find((way) => paymentKey(way) === key) ?? null;
}

/* ---- tapping to cast (the plan's X8: a spell cast in one click) ----
 *
 * A spell the pool cannot pay may still be cast in one action when tapping its caster's untapped sources can pay it: each
 * source one mana of its own, for nothing but {T} (rules/actions.mjs, tapUnits). Sources that make the same mana are
 * interchangeable -- which of two Islands taps changes nothing -- and the mana is all spent at once, so the ways to pay are
 * told apart by the KINDS of source tapped, not by the colors they make. One way, and it is tapped without asking; more,
 * and the caster chooses (CR 601.2g-h: they activate the mana abilities, then pay). A cost with {X}, Phyrexian, snow or
 * monohybrid symbols is left to tapping by hand: its choices are not only which source.
 */

/**
 * The ways to pay `cost` by tapping these units, up to `limit`, each `{taps: [{id, color}], key}`: the units to tap and the
 * color each makes, and the kinds tapped. The least flexible first -- a colorless source before a basic, a basic before a
 * dual, a dual before a source of any color -- so the first way leaves the most choices untapped.
 *
 * @param {Array<{id: number, colors: string[]}>} units  untapped sources, one mana each, in the order they sit
 */
export function tapPlans(units, cost, limit = 2) {
  if (cost.variable > 0 || cost.symbols.some((s) => !["generic", "colored", "hybrid"].includes(s.kind))) return [];
  /* Kinds: the colors a source can make. Fewer colors first (colorless alone, fewest of all: it pays only generic and
     {C}), then the order they sit. */
  const kinds = new Map();
  for (const unit of units) {
    const key = [...unit.colors].sort().join("");
    if (!kinds.has(key)) kinds.set(key, {colors: [...unit.colors], ids: []});
    kinds.get(key).ids.push(unit.id);
  }
  const flexibility = (k) => (kinds.get(k).colors.every((c) => c === "C") ? 0 : kinds.get(k).colors.length);
  const order = [...kinds.keys()].sort((a, b) => flexibility(a) - flexibility(b));
  const left = new Map(order.map((k) => [k, kinds.get(k).ids.length]));
  const needs = cost.symbols.filter((s) => s.kind !== "generic").map((s) => (s.kind === "colored" ? [s.color] : s.either));
  const found = new Map();
  const take = (k) => left.set(k, left.get(k) - 1), give = (k) => left.set(k, left.get(k) + 1);
  /* Generic mana: which kinds pay it, as a multiset -- the kinds in order, never back, so each multiset is met once. */
  const generic = (from, n, used) => {
    if (found.size >= limit) return;
    if (n === 0) {
      const key = used.map(([k]) => k).sort().join(",");
      if (!found.has(key)) found.set(key, used);
      return;
    }
    for (let j = from; j < order.length; j += 1) {
      const k = order[j];
      if (left.get(k) <= 0) continue;
      take(k); generic(j, n - 1, [...used, [k, null]]); give(k);
      if (found.size >= limit) return;
    }
  };
  /* Each colored or hybrid symbol a kind that makes its color. */
  const colored = (i, used) => {
    if (found.size >= limit) return;
    if (i === needs.length) { generic(0, cost.generic, used); return; }
    for (const k of order) for (const color of needs[i]) {
      if (left.get(k) <= 0 || !kinds.get(k).colors.includes(color)) continue;
      take(k); colored(i + 1, [...used, [k, color]]); give(k);
      if (found.size >= limit) return;
    }
  };
  colored(0, []);
  /* Each way's units: of each kind, the first that sit there. */
  return [...found.entries()].map(([key, used]) => {
    const at = new Map();
    const taps = used.map(([k, color]) => {
      const n = at.get(k) ?? 0;
      at.set(k, n + 1);
      return {id: kinds.get(k).ids[n], color: color ?? kinds.get(k).colors[0]};
    });
    return {taps, key};
  });
}

/* ---- convoke (CR 702.51a): creatures help cast a spell ----
 *
 * Each untapped creature its caster taps pays one mana of the spell's total cost instead: a colored one of a color the
 * creature is, or a generic one. Not an additional or alternative cost: it pays part of the total cost, once that is known
 * (702.51b). Each creature pays one symbol: generic, or a colored or hybrid one of a color it is; a colorless creature
 * pays only generic, never {C}. The rest is paid with mana from the pool. Phyrexian, snow and {2/W} symbols are left to the
 * pool, and a cost with {X} is not convoked here (rules/actions.mjs does not offer it).
 */
const convokable = (symbol) => symbol.kind === "colored" && symbol.color !== "C" || symbol.kind === "hybrid";
const paysSymbol = (colors, symbol) => (symbol.kind === "colored" ? colors.includes(symbol.color) : symbol.either.some((c) => colors.includes(c)));
/* What is left of `cost` once these of its symbols (indices into cost.symbols) and this much generic are paid. */
function leftOf(cost, paid, generic) {
  const symbols = cost.symbols.filter((s, i) => s.kind !== "generic" && !paid.includes(i));
  const left = Math.max(0, cost.generic - generic);
  const colored = emptyColored();
  for (const s of symbols) if (s.kind === "colored") colored[s.color] += 1;
  return {symbols: [...symbols, ...(left > 0 ? [{kind: "generic", amount: left}] : [])], generic: left, colored, variable: cost.variable};
}

/**
 * Whether the pool and these untapped creatures, each paying one symbol, can pay `cost` at all -- the creatures as units of
 * their colors beside the pool's mana (tapPlans): a colorless one pays only generic.
 *
 * @param {Array<{id: number, colors: string[]}>} creatures
 */
export function convokeCanPay(pool, cost, creatures) {
  /* tapPlans leaves {X}, Phyrexian, snow and {2/W} costs alone, so none of them is convoked here. */
  const units = [...creatures.map((c) => ({id: `creature:${c.id}`, colors: c.colors.filter((k) => k !== "C")})),
    ...MANA_KEYS.flatMap((k) => Array.from({length: pool[k] ?? 0}, (_, n) => ({id: `pool:${k}:${n}`, colors: [k]})))];
  return tapPlans(units, cost, 1).length > 0;
}

/**
 * What the pool pays once exactly these creatures have each paid one symbol of `cost`: every way they could have been
 * assigned, and every way the pool could then pay the rest, told apart by the mana it spends. One answer is the payment;
 * none, and they cannot pay; more than one, and which mana stays in the pool is the caster's to decide -- the payment
 * question (the plan's X8b), not built, so it is refused rather than decided for them.
 *
 * @returns {Array<{mana: object, life: number}>}
 */
export function convokePayments(pool, cost, creatures, options = {}) {
  const needs = cost.symbols.map((s, i) => [s, i]).filter(([s]) => convokable(s));
  const found = new Map();
  /* Each creature pays one of the symbols left that it can, or generic. */
  const assign = (k, paid, generic) => {
    if (found.size > 1) return;
    if (k === creatures.length) {
      for (const way of payments(pool, leftOf(cost, paid, generic), options, 2)) found.set(JSON.stringify(way.mana) + `|${way.life}`, way);
      return;
    }
    const colors = creatures[k].colors.filter((c) => c !== "C");
    for (const [symbol, i] of needs) if (!paid.includes(i) && paysSymbol(colors, symbol)) assign(k + 1, [...paid, i], generic);
    if (generic < cost.generic) assign(k + 1, paid, generic + 1);
  };
  assign(0, [], 0);
  return [...found.values()];
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
    /* CR 302.6: a creature's {T} waits until it has been theirs since their turn began (or "as though it had haste",
       CR 702.10c: keywords/timing.mjs). */
    if (sickForAbilities(state, id)) continue;
    /* Not one that taps another creature too (Jaspera Sentinel), or exiles a card from the graveyard (Rubble Rouser): which
       creature, or which card, is the payer's to choose (rules/actions.mjs). */
    const ability = abilitiesOf(state, id).find((a) => a.kind === "mana" && a.tapSelf && !a.cost && !a.payLife && !a.sacrifice && !a.sacrificeSelf && !a.condition && !a.spendOnly
      && !a.tapCreature && !a.exileFromGraveyard && (a.produces || a.anyColor === true));
    if (ability) out.push({id, ability});
  }
  return out;
}
/** Whether a player could pay this much generic mana now, from the pool and plain sources together. */
export function canPayGeneric(state, player, amount) {
  return poolSize(state.players[player].manaPool) + plainSources(state, player).length >= amount;
}
/* ---- which mana pays (CR 605.3a, 118.12, 508.1h) ----
 *
 * A generic amount paid without priority is still the payer's to pay: which land they tap decides what they can cast
 * afterwards. The units it can come from are each mana in their pool and each untapped plain source; two units are the
 * same KIND when they give the same mana (a {U} in the pool and an Island are one kind; an Island and a land that taps
 * for {U} or {B} are two). With one kind, or exactly as many units as the amount, every way to pay is the same and it is
 * paid without asking -- the pool first, then the sources in the order they sit; otherwise the payer chooses. */
const kindOf = (ability) => (ability.anyColor === true ? "WUBRG"
  : [...new Set((Array.isArray(ability.produces) ? ability.produces : [ability.produces]).flatMap((p) => Object.keys(p ?? {})))].sort().join(""));
/** The units a generic payment can come from, in the order an unasked payment uses them. */
export function paymentUnits(state, player) {
  const pool = state.players[player].manaPool;
  const units = [];
  for (const key of PAY_ORDER) for (let n = 0; n < (pool[key] ?? 0); n += 1) units.push({from: "pool", color: key, kind: key, label: `{${key}} from your mana pool`});
  for (const {id, ability} of plainSources(state, player)) units.push({from: "tap", id, kind: kindOf(ability), label: `Tap ${state.objects[id].card}`});
  return units;
}
/** Whether paying `amount` from these units is a choice: more than one kind, and more units than the amount. */
export const paymentIsAChoice = (units, amount) => new Set(units.map((u) => u.kind)).size > 1 && units.length > amount;
/** The question: which `amount` of the units pay. */
export function paymentChoice(id, amount, units) {
  return {id, title: `Pay {${amount}}: choose the mana`, mode: "many", min: amount, max: amount,
    options: units.map((u, index) => ({index, label: u.label, ...(u.from === "tap" ? {cardId: u.id} : {})}))};
}
/** Pay with exactly the units at these positions. @returns {Array} events */
export function payWithUnits(state, player, units, indices, amount) {
  const picked = [...new Set(indices ?? [])].map((i) => units[i]);
  if (picked.length !== amount || picked.some((u) => !u)) throw new Error(`Choose exactly ${amount} to pay with`);
  const events = [];
  for (const unit of picked) {
    if (unit.from === "pool") { state.players[player].manaPool[unit.color] -= 1; continue; }
    state.objects[unit.id].tapped = true;
    events.push({kind: "GameEventCardTapped", data: {turn: state.turn, phase: state.phase, fields: {card: {...eventCard(state, unit.id), controller: player}, tapped: true}}});
  }
  return events;
}

/* ---- paying "unless" a mana cost with colored symbols (CR 118.12; echo's "{3}{W}{W}", CR 702.30a) ----
 *
 * The same units as a generic payment -- the pool's mana, then the payer's plain sources -- each able to pay a symbol of a
 * color it gives (tapPlans). The ways to pay are told apart by the kinds of unit they spend, as a cast tapped for is; one
 * way, and it is paid without asking; more, and which is the payer's (CR 605.3a). A cost with {X}, Phyrexian, snow or
 * monohybrid symbols has no ways here. */
const unitColors = (unit) => (unit.from === "pool" ? [unit.color] : unit.kind.split(""));
/** The ways the payer could pay this mana cost now, up to `limit`, with the units they spend: `{units, plans}`. */
export function unlessPlans(state, player, cost, limit = 12) {
  const units = paymentUnits(state, player);
  let parsed = null;
  try { parsed = parseManaCost(cost); } catch { return {units, plans: []}; }
  return {units, plans: tapPlans(units.map((unit, id) => ({id, colors: unitColors(unit)})), parsed, limit)};
}
/** How one of those ways reads: the units it spends. */
export const planWords = (units, plan) => plan.taps.map((t) => units[t.id]?.label ?? "a source").join(", ");
/** Pay it that way: the pool's mana spent, the sources tapped. @returns {Array} events */
export function payPlan(state, player, units, plan) {
  const events = [];
  for (const {id} of plan.taps) {
    const unit = units[id];
    if (!unit) throw new Error("That way to pay is no longer there");
    if (unit.from === "pool") {
      if ((state.players[player].manaPool[unit.color] ?? 0) < 1) throw new Error("That way to pay is no longer there");
      state.players[player].manaPool[unit.color] -= 1;
      continue;
    }
    if (!state.objects[unit.id] || state.objects[unit.id].tapped) throw new Error("That way to pay is no longer there");
    state.objects[unit.id].tapped = true;
    events.push({kind: "GameEventCardTapped", data: {turn: state.turn, phase: state.phase, fields: {card: {cardId: unit.id, name: state.objects[unit.id].card, owner: state.objects[unit.id].owner, controller: player, faceDown: false}, tapped: true}}});
  }
  return events;
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
    events.push({kind: "GameEventCardTapped", data: {turn: state.turn, phase: state.phase, fields: {card: {...eventCard(state, id), controller: player}, tapped: true}}});
    left -= 1;
  }
  return events;
}
