/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AN AMOUNT THE GAME COUNTS (M4 phase 3, batch 10: the catalog's first missing option, 586 of the most-played cards).
 *
 * "Draw a card for each creature you control", "add {B} for each Swamp you control", "each opponent loses X life, where
 * X is your devotion to black", "+X/+X where X is the greatest power among creatures you control", "create X 1/1
 * Warriors". A card script says the count, not a number, wherever an effect takes a number (`amount`, `count`, `power`,
 * `toughness`, a mana amount) or a static ability's power and toughness do:
 *
 *   "X", or {x: true}                    the value chosen for X as the spell was cast or the ability activated (CR 107.3a);
 *                                        on a permanent's own abilities, the X paid to cast it (CR 107.3m)
 *   {count: selector}                    how many things the selector matches now -- "for each creature you control",
 *                                        "the number of cards in your hand" ({what: "card", zone: "hand", controller: "you"})
 *   {countersOn: ref, counter: kind}     counters of a kind on an object ("for each burden counter on The One Ring"), or
 *                                        of every kind, `counter: "any"` ("for each counter on this creature")
 *   {powerOf: ref}                       an object's power ("Krenko's power"): "self", or "that card"
 *   {greatestPower: selector}            the greatest power among what the selector matches, 0 if nothing (CR 208.1)
 *   {totalPower: selector}               their powers added together
 *   {devotion: [colors]}                 CR 700.5: the mana symbols of those colors among the mana costs of permanents you
 *                                        control -- a hybrid symbol of two of them once, a Phyrexian one of its color
 *   {lifeLostThisWay: true}              the life the effects before it in this resolution took ("You gain life equal to
 *                                        the life lost this way")
 *
 * and any of them may say `atMost` ("{1} less IF you control a creature with flying": the count, at most 1), `times` and
 * `plus`: "twice X", "1 plus the number of ...", and `times: -1` for "-X/-X" and
 * "-1/-1 for each Swamp you control" -- the only way an amount comes out below nothing; every other is at least 0.
 * A selector counted may be a choice, `{anyOf: [...]}` with what the alternatives share: "Squirrels, Bats, Lizards,
 * and Rats you control", each counted once.
 *
 * READ WHEN THE EFFECT HAPPENS (CR 608.2h): an effect's amount is counted once, as that effect is applied in the
 * resolution, and not again -- Craterhoof's +X/+X is the creature count as its trigger resolves, however many creatures
 * there are a moment later. A static ability's is counted continuously, every time its layer is applied
 * (rules/layers.mjs), because a characteristic-defining ability IS the count (CR 604.3).
 *
 * THE GRAMMAR IS CLOSED, like the selector's: a key this does not know is refused at the schema, not read as zero.
 */

import {selectMatching, compileSelector} from "./filter.mjs";
import {powerOf, characteristicsOf, controllerOf} from "../rules/layers.mjs";
import {parseManaCost} from "../rules/mana.mjs";

/** The keys an amount may carry; one of the first, with `times` and `plus` beside it. */
export const AMOUNT_KINDS = Object.freeze(["x", "count", "countersOn", "powerOf", "greatestPower", "totalPower", "devotion", "lifeLostThisWay"]);
const AMOUNT_EXTRAS = ["counter", "times", "plus", "atMost"];
const COLORS = ["W", "U", "B", "R", "G"];

/** Whether a value is a counted amount rather than a plain number. */
export const isCounted = (value) => value === "X" || (value !== null && typeof value === "object" && !Array.isArray(value) && AMOUNT_KINDS.some((k) => k in value));

/** Every problem with an amount, for the schema (script/schema.mjs). A number is always fine. */
export function amountProblems(value) {
  if (typeof value === "number" || value === "X") return [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [`An amount is a number, "X", or one of {${AMOUNT_KINDS.join(", ")}}`];
  const kinds = AMOUNT_KINDS.filter((k) => k in value);
  if (kinds.length !== 1) return [`An amount counts one thing, by one of ${AMOUNT_KINDS.join(", ")}`];
  const problems = [];
  for (const key of Object.keys(value)) if (!AMOUNT_KINDS.includes(key) && !AMOUNT_EXTRAS.includes(key)) problems.push(`An amount has no key ${JSON.stringify(key)}`);
  if ("countersOn" in value && typeof value.counter !== "string") problems.push("Counting counters says which kind: {countersOn, counter}");
  if ("devotion" in value && !(Array.isArray(value.devotion) && value.devotion.length && value.devotion.every((c) => COLORS.includes(c)))) problems.push("Devotion is to one or more colors: {devotion: [\"B\"]}");
  for (const key of ["times", "plus", "atMost"]) if (key in value && !Number.isInteger(value[key])) problems.push(`An amount's ${key} is a whole number`);
  /* What it counts is a selector, held to the selector grammar (script/filter.mjs), a choice of them included. */
  for (const key of ["count", "greatestPower", "totalPower"]) {
    if (!(key in value)) continue;
    const {anyOf, ...shared} = value[key] ?? {};
    try { for (const one of Array.isArray(anyOf) ? anyOf.map((a) => ({...shared, ...a})) : [value[key]]) compileSelector(one); }
    catch (error) { problems.push(`What ${key} counts: ${error.message}`); }
  }
  return problems;
}

/* What a counted selector matches: one selector, or a choice of them, each thing once. */
function matching(state, selector, who) {
  const {anyOf, ...shared} = selector ?? {};
  if (!Array.isArray(anyOf)) return selectMatching(state, selector, who);
  return [...new Set(anyOf.flatMap((one) => selectMatching(state, {...shared, ...one}, who)))];
}

/* The object an amount refers to: the source, or what the trigger is about. */
function objectOf(ref, context) {
  if (ref === "self") return context.source ?? null;
  if (ref === "that card") return context.about?.card ?? null;
  return null;
}

/* CR 700.5: each mana symbol among the mana costs of permanents the player controls that is one of these colors. */
function devotion(state, player, colors) {
  let total = 0;
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (!object?.manaCost || controllerOf(state, id) !== player) continue;
    for (const symbol of parseManaCost(object.manaCost).symbols) {
      if (symbol.kind === "colored" && colors.includes(symbol.color)) total += 1;
      else if (symbol.kind === "hybrid" && symbol.either.some((c) => colors.includes(c))) total += 1;
      else if ((symbol.kind === "phyrexian" || symbol.kind === "monohybrid") && colors.includes(symbol.color)) total += 1;
    }
  }
  return total;
}

/**
 * What an amount comes to now.
 *
 * @param {object} context  `{controller, source, x, about, lifeLost}`: whose ability it is, its object, X, what a trigger
 *   is about, and the life the resolution's effects have taken so far
 */
export function amountOf(state, value, context = {}) {
  if (typeof value === "number") return value;
  if (value === "X") return Math.max(0, context.x ?? 0);
  if (!isCounted(value)) return 0;
  const who = {controller: context.controller, source: context.source};
  let n = 0;
  if ("x" in value) n = Math.max(0, context.x ?? 0);
  else if ("count" in value) n = matching(state, value.count, who).length;
  else if ("countersOn" in value) {
    const id = objectOf(value.countersOn, context);
    /* A source sacrificed as the cost ("for each counter on this creature") is read as it last was (CR 608.2h). */
    const counters = id !== null && state.objects[id] ? state.objects[id].counters : context.lastKnown?.counters;
    n = value.counter === "any" ? Object.values(counters ?? {}).reduce((a, b) => a + b, 0) : counters?.[value.counter] ?? 0;
  } else if ("powerOf" in value) {
    const id = objectOf(value.powerOf, context);
    n = id !== null && state.objects[id]?.zone === "battlefield" ? powerOf(state, id) : (context.lastKnown?.power ?? 0);
  } else if ("greatestPower" in value || "totalPower" in value) {
    const powers = matching(state, value.greatestPower ?? value.totalPower, who).map((id) => characteristicsOf(state, id).power ?? 0);
    n = "greatestPower" in value ? Math.max(0, ...powers) : powers.reduce((a, b) => a + b, 0);
  } else if ("devotion" in value) n = devotion(state, context.controller, value.devotion);
  else if ("lifeLostThisWay" in value) n = context.lifeLost ?? 0;
  /* `atMost`: "{1} less if you control a creature with flying" is the count of them, at most 1. */
  const total = Math.min(value.atMost ?? Infinity, n) * (value.times ?? 1) + (value.plus ?? 0);
  return (value.times ?? 1) < 0 ? total : Math.max(0, total);
}

/** The parameters of an effect that take a number, and so may take a count. */
export const AMOUNT_PARAMS = Object.freeze(["amount", "count", "power", "toughness"]);

/** An effect with its counted amounts read now (bind.mjs calls this as the effect reaches the head of the queue). */
export function countEffect(state, effect, context) {
  let bound = effect;
  for (const key of AMOUNT_PARAMS) {
    if (!isCounted(effect[key])) continue;
    bound = bound === effect ? {...effect} : bound;
    bound[key] = amountOf(state, effect[key], context);
  }
  /* "Add {B} for each Swamp you control": a mana amount. */
  if (effect.mana && typeof effect.mana === "object" && Object.values(effect.mana).some(isCounted)) {
    bound = bound === effect ? {...effect} : bound;
    bound.mana = Object.fromEntries(Object.entries(effect.mana).map(([k, v]) => [k, amountOf(state, v, context)]));
  }
  return bound;
}

/** A mana ability's mana, counted now: "{T}: Add {G} for each creature you control". */
export function countMana(state, mana, context) {
  if (!mana || !Object.values(mana).some(isCounted)) return mana;
  return Object.fromEntries(Object.entries(mana).map(([k, v]) => [k, amountOf(state, v, context)]));
}
