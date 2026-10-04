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
 *   {toughnessOf: ref}                   its toughness ("its controller gains life equal to its toughness", Condemn)
 *   {greatestPower: selector}            the greatest power among what the selector matches, 0 if nothing (CR 208.1)
 *   {totalPower: selector}               their powers added together
 *   {devotion: [colors]}                 CR 700.5: the mana symbols of those colors among the mana costs of permanents you
 *                                        control -- a hybrid symbol of two of them once, a Phyrexian one of its color
 *   {lifeLostThisWay: true}              the life the effects before it in this resolution took ("You gain life equal to
 *                                        the life lost this way")
 *   {cardTypesAmong: "remembered"}       how many card types there are among what the effect before it remembered -- "a
 *                                        Spirit for each card type among cards discarded this way" (Occult Epiphany)
 *   {rememberedCount: true}              how many things the effect before it remembered -- "each player shuffles the cards
 *                                        from their hand into their library, then draws that many cards" (batch 80)
 *   {excessDamage: true}                 the excess damage the damage before it in this resolution dealt (CR 120.4a)
 *   {lesserOf: [amount, amount]}         the least of them: "greater than this creature's power or toughness" (increment)
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

import {conditionHolds, conditionProblems} from "./condition.mjs";
import {selectMatching, compileSelector, matchesLastKnown} from "./filter.mjs";
import {powerOf, toughnessOf, characteristicsOf, controllerOf} from "../rules/layers.mjs";
import {parseManaCost, manaValue} from "../rules/mana.mjs";

/** The keys an amount may carry; one of the first, with `times` and `plus` beside it. */
export const AMOUNT_KINDS = Object.freeze(["x", "count", "countersOn", "powerOf", "toughnessOf", "greatestPower", "totalPower", "devotion", "lifeLostThisWay", "colorsOf", "thoseCards", "damageDealt", "castBefore", "manaValueOf", "if", "lifeTotal", "lifeLostThisTurn", "colorsAmong", "greatestToughness", "countersAmong", "lifeGained", "damagePrevented", "lifeLost", "rememberedCount",
  "lifeGainedThisTurn", "tokensCreatedThisTurn", "mostAmongOpponents", "permanentsLeftThisTurn", "playersDealtCombatDamage", "cardTypesAmong", "manaSpent",
  "permanentsEnteredThisTurn", "excessDamage", "lesserOf", "kicked"]);
const AMOUNT_EXTRAS = ["counter", "times", "plus", "atMost", "then", "else", "half", "filter", "controlledBy"];
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
  for (const key of ["lifeGainedThisTurn", "tokensCreatedThisTurn", "permanentsLeftThisTurn", "permanentsEnteredThisTurn"]) if (key in value && !["you", "that player"].includes(value[key])) problems.push(`${key} is "you" or "that player"`);
  /* What entered, as it was (rules/trigger.mjs keeps it): a filter of what a last known snapshot answers, and only there. */
  if ("filter" in value) {
    if (!("permanentsEnteredThisTurn" in value)) problems.push("Only permanentsEnteredThisTurn takes a filter");
    else try { matchesLastKnown(value.filter, {}, {}); } catch (error) { problems.push(`What permanentsEnteredThisTurn counts: ${error.message}`); }
  }
  if ("playersDealtCombatDamage" in value && !["opponent", "any"].includes(value.playersDealtCombatDamage)) problems.push('playersDealtCombatDamage is "opponent" or "any"');
  if ("cardTypesAmong" in value && value.cardTypesAmong !== "remembered") problems.push('cardTypesAmong is "remembered"');
  if ("manaSpent" in value && !["that card", "self"].includes(value.manaSpent)) problems.push('manaSpent is "that card" or "self"');
  if ("controlledBy" in value && !("rememberedCount" in value && value.controlledBy === "that player")) problems.push('controlledBy is "that player", of a rememberedCount');
  if ("lesserOf" in value && !(Array.isArray(value.lesserOf) && value.lesserOf.length >= 2)) problems.push("lesserOf is two or more amounts");
  else if ("lesserOf" in value) for (const one of value.lesserOf) problems.push(...amountProblems(one).map((p) => `lesserOf: ${p}`));
  if ("devotion" in value && !(Array.isArray(value.devotion) && value.devotion.length && value.devotion.every((c) => COLORS.includes(c)))) problems.push("Devotion is to one or more colors: {devotion: [\"B\"]}");
  for (const key of ["times", "plus", "atMost"]) if (key in value && !Number.isInteger(value[key])) problems.push(`An amount's ${key} is a whole number`);
  if ("if" in value) {
    problems.push(...conditionProblems(value.if).map((p) => `An amount's condition: ${p}`));
    for (const key of ["then", "else"]) if (key in value) problems.push(...amountProblems(value[key]));
  }
  /* What it counts is a selector, held to the selector grammar (script/filter.mjs), a choice of them included. */
  for (const key of ["count", "greatestPower", "totalPower", "mostAmongOpponents"]) {
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

/* The player an amount refers to: you, or the player a trigger or repetition is about. */
const playerOf = (ref, context) => (ref === "that player" ? context.about?.player ?? null : ref === "you" ? context.controller ?? null : null);

/* The object an amount refers to: the source, or what the trigger is about. */
function objectOf(ref, context) {
  if (ref === "self") return context.source ?? null;
  if (ref === "that card") return context.about?.card ?? null;
  /* "You lose life equal to its mana value" (Dark Confidant): what an earlier effect moved. */
  if (ref === "remembered") return context.remembered?.[0] ?? null;
  /* "Target creature you control deals damage equal to its power" (Infectious Bite): a target, while it is one. */
  if (ref && typeof ref === "object" && Number.isInteger(ref.target)) { const chosen = (context.targets ?? [])[ref.target]; return chosen?.kind === "object" ? chosen.id : null; }
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
  /* What a trigger or a repetition is about, too: "the number of nonbasic lands that player controls" (repeatFor). */
  const who = {controller: context.controller, source: context.source, ...(context.about ? {about: context.about} : {})};
  let n = 0;
  if ("x" in value) n = Math.max(0, context.x ?? 0);
  /* "A charge counter on it for each time it was kicked" (Everflowing Chalice; multikicker, CR 702.33c). */
  else if ("kicked" in value) n = context.kicked ?? 0;
  /* "Greater than this creature's power or toughness" (increment, Berta): the lesser of them. */
  else if ("lesserOf" in value) n = Math.min(...value.lesserOf.map((one) => amountOf(state, one, context)));
  else if ("count" in value) n = matching(state, value.count, who).length;
  else if ("countersOn" in value) {
    const id = objectOf(value.countersOn, context);
    /* A source sacrificed as the cost ("for each counter on this creature") is read as it last was (CR 608.2h). */
    const counters = id !== null && state.objects[id] ? state.objects[id].counters : context.lastKnown?.counters;
    n = value.counter === "any" ? Object.values(counters ?? {}).reduce((a, b) => a + b, 0) : counters?.[value.counter] ?? 0;
  } else if ("powerOf" in value) {
    const id = objectOf(value.powerOf, context);
    n = id !== null && state.objects[id]?.zone === "battlefield" ? powerOf(state, id) : (context.lastKnown?.power ?? 0);
  } else if ("toughnessOf" in value) {
    const id = objectOf(value.toughnessOf, context);
    n = id !== null && state.objects[id]?.zone === "battlefield" ? toughnessOf(state, id) : (context.lastKnown?.toughness ?? 0);
  } else if ("countersAmong" in value) {
    /* "The number of +1/+1 counters on lands you control" (Toph, the Blind Bandit): all of them, of the kind. */
    n = matching(state, value.countersAmong, who).reduce((sum, id) => sum + (state.objects[id].counters?.[value.counter ?? "+1/+1"] ?? 0), 0);
  } else if ("greatestToughness" in value) {
    /* "Draw cards equal to the greatest toughness among creatures you control" (Last March of the Ents). */
    n = Math.max(0, ...matching(state, value.greatestToughness, who).map((id) => characteristicsOf(state, id).toughness ?? 0));
  } else if ("greatestPower" in value || "totalPower" in value) {
    const powers = matching(state, value.greatestPower ?? value.totalPower, who).map((id) => characteristicsOf(state, id).power ?? 0);
    n = "greatestPower" in value ? Math.max(0, ...powers) : powers.reduce((a, b) => a + b, 0);
  } else if ("devotion" in value) n = devotion(state, context.controller, value.devotion);
  else if ("lifeLostThisWay" in value) n = context.lifeLost ?? 0;
  /* "Then draws that many cards" (Winds of Change): what the effect before it moved, and remembered, counted. */
  /* "For each creature exiled this way, its controller searches" (Winds of Abandon): `controlledBy` "that player", those of
     them that player controlled as they left the battlefield (script/effects/zones.mjs). */
  else if ("rememberedCount" in value) n = value.controlledBy === "that player"
    ? (context.remembered ?? []).filter((id) => (context.rememberedControllers ?? {})[id] === context.about?.player).length
    : (context.remembered ?? []).length;
  /* "Empower Jace X, where X is that excess damage" (Violent Echoes): the excess the damage before it dealt (effects/resources.mjs). */
  else if ("excessDamage" in value) n = context.excessDamage ?? 0;
  /* "For each card type among cards discarded this way" (Occult Epiphany): the card types (CR 205.2a) the remembered
     cards have between them, as they are now -- an artifact creature is two. */
  else if ("cardTypesAmong" in value) n = new Set((context.remembered ?? []).flatMap((id) => state.objects[id]?.types ?? [])).size;
  /* "Draw that many cards", "search for up to that many": how many a "one or more" trigger is about (rules/trigger.mjs). */
  else if ("thoseCards" in value) n = (context.about?.cards ?? []).length;
  /* "That many", after damage: how much the trigger's damage was (rules/trigger.mjs). */
  else if ("damageDealt" in value) n = context.about?.amount ?? 0;
  /* "Target opponent loses that much life" (Sanguine Bond; Forge's LifeAmount): the life the trigger is about gaining. */
  else if ("lifeGained" in value) n = context.about?.amount ?? 0;
  /* "That player mills that many cards", "you gain that much life" (batch 78): the life lost the trigger is about. */
  else if ("lifeLost" in value) n = context.about?.amount ?? 0;
  /* "Each opponent mills that many cards" (The Mindskinner), "a +1/+1 counter for each 1 damage prevented this way" (Vigor):
     the damage a prevention stopped, its follow-up about it (rules/replacement.mjs). */
  else if ("damagePrevented" in value) n = context.about?.amount ?? 0;
  /* "If you control a creature with power 4 or greater, instead search for three" (Forge's Count$Compare): one amount
     or the other, by a condition asked now (script/condition.mjs). */
  else if ("if" in value) n = amountOf(state, conditionHolds(state, value.if, {controller: context.controller, source: context.source}) ? value.then ?? 0 : value.else ?? 0, context);
  /* "Half that player's life total, rounded down" (Heartless Hidetsugu): a player's life now; `half` halves it, down. */
  else if ("lifeTotal" in value) {
    const player = playerOf(value.lifeTotal, context);
    const life = player !== null ? state.players[player]?.life ?? 0 : 0;
    n = value.half === true ? Math.floor(life / 2) : life;
  }
  /* "Equal to the life they lost this turn" (Wound Reflection; resources.mjs keeps it, turn.mjs clears it). */
  else if ("lifeLostThisTurn" in value) {
    const player = playerOf(value.lifeLostThisTurn, context);
    n = player !== null ? state.players[player]?.lostThisTurn ?? 0 : 0;
  }
  /* "If you gained 3 or more life this turn" (Indulging Patrician), "only if you created a token this turn" (Idol of
     Oblivion): what that player has gained, and made, this turn (resources.mjs and permanents.mjs keep them, turn.mjs
     clears them). */
  else if ("lifeGainedThisTurn" in value) {
    const player = playerOf(value.lifeGainedThisTurn, context);
    n = player !== null ? state.players[player]?.gainedThisTurn ?? 0 : 0;
  } else if ("tokensCreatedThisTurn" in value) {
    const player = playerOf(value.tokensCreatedThisTurn, context);
    n = player !== null ? state.players[player]?.tokensThisTurn ?? 0 : 0;
  }
  /* Revolt, "if a permanent left the battlefield under your control this turn" (Hidden Stockpile): how many did, under that
     player's control (state/index.mjs keeps it). */
  else if ("permanentsLeftThisTurn" in value) {
    const player = playerOf(value.permanentsLeftThisTurn, context);
    n = player !== null ? state.players[player]?.leftThisTurn ?? 0 : 0;
  }
  /* "The number of creatures that entered the battlefield under your control this turn" (Kinbinding), and "another
     creature" (Wary Farmer, `another`: not this one): what entered under that player's control, as it entered (rules/
     trigger.mjs, recordArrivals), that `filter` fits -- one that has left since included. */
  else if ("permanentsEnteredThisTurn" in value) {
    const player = playerOf(value.permanentsEnteredThisTurn, context);
    const fits = (was) => matchesLastKnown(value.filter ?? {}, was, {controller: context.controller, source: context.source});
    n = player !== null ? (state.players[player]?.enteredThisTurn ?? []).filter(fits).length : 0;
  }
  /* "The number of opponents that were dealt combat damage this turn" (Tymna the Weaver): the players still in the game
     whom combat damage reached this turn (rules/combat.mjs keeps it, turn.mjs clears it) -- the controller's opponents,
     or anyone. */
  else if ("playersDealtCombatDamage" in value) n = state.players.filter((p) => !p.lost && p.combatDamagedThisTurn === true
    && (value.playersDealtCombatDamage === "any" || p.id !== context.controller)).length;
  /* "If an opponent controls more lands than you" (Weathered Wayfarer): the most of them any one opponent has -- the
     selector counted as each opponent still in the game sees it ("you" being that opponent). */
  else if ("mostAmongOpponents" in value) {
    const opponents = state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => p.id);
    n = Math.max(0, ...opponents.map((opponent) => matching(state, value.mostAmongOpponents, {...who, controller: opponent}).length));
  }
  /* "Where X is the mana value of that spell" (Ovika): its printed cost, X counted as 0 (CR 202.3). */
  else if ("manaValueOf" in value) {
    const id = objectOf(value.manaValueOf, context);
    n = id !== null && state.objects[id]?.manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0;
  }
  /* "If five or more mana was spent to cast that spell" (Expressive Firedancer; CR 601.2h): every mana spent on it, of
     whatever kind, as rules/actions.mjs recorded it on the spell. */
  else if ("manaSpent" in value) {
    const id = objectOf(value.manaSpent, context);
    n = id !== null ? Object.values(state.objects[id]?.spent ?? {}).reduce((a, b) => a + b, 0) : 0;
  }
  /* "For each other instant and sorcery spell you've cast before it this turn": counted as the trigger triggered. */
  else if ("castBefore" in value) n = context.about?.castBefore ?? 0;
  /* "For each of that spell's colors" (Ramos, CR 105.2): how many colors it has, through the layers on the battlefield. */
  /* "For each color among permanents you control" (Conqueror's Flail): the colors they have between them, as they are. */
  else if ("colorsAmong" in value) n = new Set(matching(state, value.colorsAmong, who).flatMap((id) => characteristicsOf(state, id).colors ?? [])).size;
  else if ("colorsOf" in value) {
    const id = objectOf(value.colorsOf, context);
    n = id !== null && state.objects[id] ? (state.objects[id].zone === "battlefield" ? characteristicsOf(state, id).colors : state.objects[id].colors ?? []).length : 0;
  }
  /* `atMost`: "{1} less if you control a creature with flying" is the count of them, at most 1. */
  const total = Math.min(value.atMost ?? Infinity, n) * (value.times ?? 1) + (value.plus ?? 0);
  return (value.times ?? 1) < 0 ? total : Math.max(0, total);
}

/** The parameters of an effect that take a number, and so may take a count -- "the top X cards" (`fromTop`, Villainous
 *  Wealth, batch 79) among them. */
export const AMOUNT_PARAMS = Object.freeze(["amount", "count", "power", "toughness", "fromTop",
  /* "You may pay X life" (Tymna the Weaver; effects/asking.mjs, unlessPays). */
  "life"]);

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
