/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* `CrankCardScript@1`: WHAT A CARD DEFINITION IS ALLOWED TO SAY.
 *
 * `docs/engine/PLAN.md` §3.4, and §6's phase 2.1. Thirty-one thousand of these will be written by a
 * model, so this is not documentation. It is the thing standing between a plausible-looking
 * generated document and a game that plays it wrong.
 *
 * EVERY EFFECT NAMES A PRIMITIVE FROM THE CATALOG, which is why 2.1a came first. A schema that
 * accepted any string for `effect` would accept `destroyCreature`: not a primitive, reads
 * perfectly, and would compile, validate, ship, and then do nothing at all. Principle 6 says
 * unsupported is loud; this is where that gets enforced for cards.
 *
 * EVERY ABILITY CARRIES THE ORACLE SENTENCE IT IMPLEMENTS (§3.2.5), so a definition can be
 * re-checked when the text changes. Without it, an errata'd card has a definition nobody can tell
 * is now wrong — among thirty-one thousand others.
 *
 * EACH ABILITY KIND IS HELD TO WHAT ITS ENGINE MODULE ACTUALLY NEEDS. A static ability without a
 * layer cannot be ordered by `layers.mjs`; a triggered ability without a trigger event is not
 * something `trigger.mjs` can watch for; a replacement without `watches` is not something
 * `replacement.mjs` can match. Validating against the modules that execute them is the only way the
 * schema means anything — a schema that agreed with itself and not with the engine would pass
 * documents the engine then refused.
 *
 * `reveals` EARNS ITS PLACE. A card declares what information it exposes and to whom, so 1.10's
 * hidden-information property has something to check a card against. Without it the first card
 * reading "look at target player's hand" either leaks by accident or is indistinguishable from a
 * leak, and the property test cannot tell which.
 *
 * VALIDATION RETURNS A LIST. The compiler retries against the errors, so it needs all of them at
 * once; stopping at the first turns a fixable document into as many round trips as it has
 * mistakes, thirty-one thousand times over.
 */

import {isPrimitive, isKeyword, isTriggerEvent} from "../vocabulary.mjs";
import {compileSelector} from "./filter.mjs";
import {targetRefs} from "./bind.mjs";
import {LAYERS} from "../rules/layers.mjs";
import {STATIC_RULES} from "../rules/statics.mjs";
import {amountProblems, AMOUNT_PARAMS} from "./amount.mjs";
import {conditionProblems} from "./condition.mjs";

/* The facts about a target an effect may name where it takes a number (script/bind.mjs). */
const FACT_KEYS = ["powerOf", "manaValueOf", "controllerOf"];

export const SCRIPT_SCHEMA = "CrankCardScript@1";

/** The six kinds of ability a card can have (§3.4). */
export const ABILITY_KINDS = Object.freeze([
  "spell", "activated", "triggered", "static", "replacement", "keyword",
]);

/* Composers hold other effects rather than doing something themselves, so their children are
   validated too — a validator that only checked the top level would pass every nested mistake, and
   nesting is where a generated document goes wrong. */
const COMPOSERS = {
  sequence: (effect) => effect.effects ?? [],
  repeatFor: (effect) => effect.effects ?? [],
  branch: (effect) => [...(effect.then ?? []), ...(effect.otherwise ?? [])],
  modal: (effect) => (effect.modes ?? []).flatMap((mode) => mode.effects ?? []),
};

/** What an ability may say it exposes. Closed, like every other vocabulary here. */
const REVEAL_WHAT = ["hand", "library", "card", "top", "face-down"];
const REVEAL_TO = ["controller", "owner", "target", "all", "you"];

const isText = (value) => typeof value === "string" && value.trim() !== "";

function checkEffect(effect, path, errors) {
  if (!effect || typeof effect !== "object") {
    errors.push({path, message: "An effect is an object naming a primitive"});
    return;
  }
  const name = effect.effect;
  if (!isText(name)) {
    errors.push({path, message: "An effect names a primitive in its `effect` field"});
    return;
  }
  if (!isPrimitive(name)) {
    errors.push({path, message: `${JSON.stringify(name)} is not a primitive in the catalog (§12.2)`});
    return;
  }
  /* A counted amount (script/amount.mjs) where an effect takes a number: "X", or one of its closed kinds. */
  for (const key of AMOUNT_PARAMS) {
    const value = effect[key];
    if (value === undefined || typeof value === "number") continue;
    /* A fact about a target ({powerOf: {target: 0}}, bind.mjs's), read as the resolution begins; anything else is a count. */
    const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
    if (keys.length === 1 && FACT_KEYS.includes(keys[0]) && Number.isInteger(value[keys[0]]?.target)) continue;
    for (const message of amountProblems(value)) errors.push({path: `${path}.${key}`, message});
  }
  const children = COMPOSERS[name];
  if (!children) return;
  const nested = children(effect);
  if (nested.length === 0) errors.push({path, message: `${name} composes other effects and has none`});
  nested.forEach((child, index) => checkEffect(child, `${path}.effects[${index}]`, errors));
}

function checkSelector(selector, path, errors, {choice = false} = {}) {
  try {
    /* A choice of alternatives ("instant and sorcery spells") where the reader takes one (statics.mjs costReduction):
       each alternative, with the keys they share, is a selector of its own. */
    const {anyOf, ...shared} = selector ?? {};
    if (choice && Array.isArray(anyOf)) for (const one of anyOf) compileSelector({...shared, ...one});
    else compileSelector(selector);
  } catch (error) {
    errors.push({path, message: error.message});
  }
}

function checkAbility(ability, path, errors) {
  if (!ability || typeof ability !== "object") {
    errors.push({path, message: "An ability is an object"});
    return;
  }
  if (!ABILITY_KINDS.includes(ability.kind)) {
    errors.push({path: `${path}.kind`, message: `An ability is one of ${ABILITY_KINDS.join(", ")}, not ${JSON.stringify(ability.kind)}`});
    return;
  }
  /* §3.2.5 */
  if (!isText(ability.text))
    errors.push({path: `${path}.text`, message: "An ability carries the oracle sentence it implements, so it can be re-checked when the card is errata'd"});

  /* A target is a selector, or `{anyOf: [...]}` for "any target" (script/bind.mjs). */
  for (const [index, selector] of (ability.targets ?? []).entries()) {
    if (selector && typeof selector === "object" && "anyOf" in selector) {
      if (!Array.isArray(selector.anyOf) || selector.anyOf.length === 0 || Object.keys(selector).length !== 1)
        errors.push({path: `${path}.targets[${index}]`, message: "A choice of targets is `{anyOf: [selector, ...]}` and nothing else"});
      else selector.anyOf.forEach((one, at) => checkSelector(one, `${path}.targets[${index}].anyOf[${at}]`, errors));
    } else checkSelector(selector, `${path}.targets[${index}]`, errors);
  }
  /* Every `{target: n}` an effect names is a target the ability declares, or it would bind to nothing, silently. */
  for (const n of targetRefs(ability.effects ?? []))
    if (n < 0 || n >= (ability.targets ?? []).length)
      errors.push({path: `${path}.effects`, message: `An effect names target ${n}, and the ability declares ${(ability.targets ?? []).length}`});
  for (const [index, reveal] of (ability.reveals ?? []).entries()) {
    if (!REVEAL_WHAT.includes(reveal?.what))
      errors.push({path: `${path}.reveals[${index}].what`, message: `A reveal exposes one of ${REVEAL_WHAT.join(", ")}`});
    if (!REVEAL_TO.includes(reveal?.to))
      errors.push({path: `${path}.reveals[${index}].to`, message: "A reveal says TO WHOM, or there is nothing for the projection to be checked against"});
  }

  /* A condition (script/condition.mjs): closed, like the rest. */
  for (const message of conditionProblems(ability.condition)) errors.push({path: `${path}.condition`, message});

  const effectful = ["spell", "activated", "triggered"].includes(ability.kind);
  if (effectful) {
    const effects = ability.effects ?? [];
    if (effects.length === 0)
      errors.push({path: `${path}.effects`, message: `A ${ability.kind} ability with no effects is a definition somebody did not finish`});
    effects.forEach((effect, index) => checkEffect(effect, `${path}.effects[${index}]`, errors));
  }

  if (ability.kind === "activated" && (ability.cost ?? []).length === 0)
    errors.push({path: `${path}.cost`, message: "An activated ability has a cost; one with none is a free ability nobody wrote"});

  if (ability.kind === "triggered") {
    const on = ability.trigger?.on;
    if (!isText(on)) {
      errors.push({path: `${path}.trigger`, message: "A triggered ability says what it triggers on"});
    } else if (!isTriggerEvent(on)) {
      /* The app's vocabulary and the engine's are bridged, not interchangeable — `vocabulary.mjs`
         maps `creature-dies` to `dies`, and a script has to carry the engine's spelling or
         `trigger.mjs` will never match it. */
      errors.push({path: `${path}.trigger.on`, message: `${JSON.stringify(on)} is not a trigger event the engine declares; the app's terms are bridged in vocabulary.mjs, not accepted here`});
    }
  }

  if (ability.kind === "keyword") {
    if (!isKeyword(ability.keyword))
      errors.push({path: `${path}.keyword`, message: `${JSON.stringify(ability.keyword)} is not a keyword the engine can grant`});
  }

  if (ability.kind === "static") {
    /* A static changes a characteristic, in a layer (CR 613), or a rule, by name (rules/statics.mjs): one or the
       other, never neither -- something nothing orders and nothing reads would validate and do nothing. */
    if (ability.rule !== undefined) {
      if (!Object.hasOwn(STATIC_RULES, ability.rule))
        errors.push({path: `${path}.rule`, message: `${JSON.stringify(ability.rule)} is not a rule a static ability can change; they are ${Object.keys(STATIC_RULES).join(", ")}`});
    } else {
      if (!LAYERS.includes(ability.layer))
        errors.push({path: `${path}.layer`, message: `A static ability says which layer it applies in (CR 613); layers are ${LAYERS.join(", ")}`});
      if (!ability.apply) errors.push({path: `${path}.apply`, message: "A static ability says what it does"});
    }
    if (!ability.affects) errors.push({path: `${path}.affects`, message: "A static ability says what it affects"});
    else checkSelector(ability.affects, `${path}.affects`, errors, {choice: ability.rule === "spells-cost-less"});
  }

  if (ability.kind === "replacement") {
    if (!ability.watches?.event)
      errors.push({path: `${path}.watches`, message: "A replacement effect says which event it is watching for (CR 614)"});
    if (!ability.change && ability.prevent === undefined)
      errors.push({path: `${path}`, message: "A replacement effect either changes the event or prevents it"});
  }
}

function checkIdentity(identity, errors) {
  if (!identity || typeof identity !== "object") {
    errors.push({path: "identity", message: "A script carries the card's identity"});
    return;
  }
  if (!isText(identity.name)) errors.push({path: "identity.name", message: "A card has a name"});
  if (!isText(identity.oracleId))
    errors.push({path: "identity.oracleId", message: "A card carries its oracleId, which is how a definition is matched to a card at all"});
  if (!Array.isArray(identity.types) || identity.types.length === 0)
    errors.push({path: "identity.types", message: "A card has at least one type"});
  if (identity.manaCost !== undefined && identity.manaCost !== null && typeof identity.manaCost !== "string")
    errors.push({path: "identity.manaCost", message: "A mana cost is the printed text, or null for a card with none"});
}

/**
 * Check a card definition.
 *
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}} every problem, each
 *   saying where it is, because the compiler retries against them.
 */
export function validateScript(script) {
  const errors = [];
  if (!script || typeof script !== "object") {
    return {valid: false, errors: [{path: "", message: "A card script is an object"}]};
  }
  if (script.schema !== SCRIPT_SCHEMA)
    errors.push({path: "schema", message: `A card script names its schema as ${SCRIPT_SCHEMA}, not ${JSON.stringify(script.schema)}`});

  checkIdentity(script.identity, errors);

  if (!Array.isArray(script.abilities)) {
    errors.push({path: "abilities", message: "A script has an abilities list, empty for a vanilla card"});
  } else {
    script.abilities.forEach((ability, index) => checkAbility(ability, `abilities[${index}]`, errors));
  }

  return {valid: errors.length === 0, errors};
}

/**
 * Check, and throw with everything that is wrong.
 *
 * The loud form, for a caller that has no way to recover — the runtime loading a committed
 * definition, rather than the compiler working one out.
 */
export function assertScript(script) {
  const {valid, errors} = validateScript(script);
  if (valid) return script;
  const detail = errors.map((e) => `${e.path}: ${e.message}`).join("; ");
  throw new Error(`${script?.identity?.name ?? "A card"} is not a valid ${SCRIPT_SCHEMA} — ${detail}`);
}
