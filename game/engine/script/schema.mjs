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
import {STATIC_RULES, CANT_ATTACK_DEFENDERS} from "../rules/statics.mjs";
import {amountProblems, AMOUNT_PARAMS} from "./amount.mjs";
import {conditionProblems} from "./condition.mjs";
import {isCreatureType} from "../keywords/types.mjs";

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
  /* One way or the other (batch 72): its `then` and its `otherwise`, each a list -- one that is not is reported, not read. */
  branch: (effect) => [...(Array.isArray(effect.then) ? effect.then : []), ...(Array.isArray(effect.otherwise) ? effect.otherwise : [])],
  modal: (effect) => (effect.modes ?? []).flatMap((mode) => mode.effects ?? []),
  unlessPays: (effect) => effect.effects ?? [],
  delayedTrigger: (effect) => effect.effects ?? [],
  /* A reflexive trigger (batch 72): what it does. */
  immediateTrigger: (effect) => effect.effects ?? [],
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
  /* An effect's own condition ("if this spell was cast from a graveyard", "if you do"; resolution.mjs asks it): closed, as
     an ability's is -- an unknown key refused here rather than read as true. */
  for (const message of conditionProblems(effect.condition)) errors.push({path: `${path}.condition`, message});
  /* A reflexive trigger's own targets (CR 603.12): selectors, and every `{target: n}` its effects name declared among them. */
  if (name === "immediateTrigger") {
    for (const [index, selector] of (effect.targets ?? []).entries()) checkSelector(selector, `${path}.targets[${index}]`, errors, {choice: true});
    for (const n of targetRefs(effect.effects ?? []))
      if (n < 0 || n >= (effect.targets ?? []).length) errors.push({path: `${path}.effects`, message: `A reflexive trigger's effect names target ${n}, and it declares ${(effect.targets ?? []).length}`});
  }
  /* "Exile ... until this leaves the battlefield" (CR 610.3): the one "until" the engine returns from. */
  if (name === "exileUntil" && effect.until !== "this leaves")
    errors.push({path: `${path}.until`, message: "exileUntil returns what it exiled when its source leaves the battlefield: `until: \"this leaves\"`"});
  /* Where a countered spell goes instead of its owner's graveyard: exile (Force of Negation) or the top of its owner's
     library (Memory Lapse) -- any other word would be read as the graveyard. */
  if (name === "counterSpell" && effect.to !== undefined && !["exile", "top"].includes(effect.to))
    errors.push({path: `${path}.to`, message: "A countered spell goes to its owner's graveyard, or `to` \"exile\" or \"top\" instead"});
  /* Amass (CR 701.47a): the creature type its Army is, "Goblin" for "amass Goblins 2"; the Army chosen remembered or not. */
  if (name === "amass") {
    if (!isText(effect.subtype) || !isCreatureType(effect.subtype))
      errors.push({path: `${path}.subtype`, message: "Amass names the creature type its Army is: `subtype`, \"Goblin\" for \"amass Goblins\""});
    if (effect.remember !== undefined && effect.remember !== true) errors.push({path: `${path}.remember`, message: "Amass remembers the amassed Army with `remember: true`"});
  }
  /* A branch's test: a condition, and there must be one. */
  if (name === "branch") {
    if (effect.if === undefined) errors.push({path: `${path}.if`, message: "A branch says what decides it: `if`, a condition"});
    for (const message of conditionProblems(effect.if)) errors.push({path: `${path}.if`, message});
    for (const key of ["then", "otherwise"]) if (effect[key] !== undefined && !Array.isArray(effect[key])) errors.push({path: `${path}.${key}`, message: `A branch's ${key} is a list of effects`});
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

/* A target's count: `min` a whole number (0 when absent), `max` a whole number at least 1 and at least `min`, or absent. */
const countValid = (count) => Boolean(count) && typeof count === "object" && !Array.isArray(count)
  && Object.keys(count).every((k) => k === "min" || k === "max")
  && (count.min === undefined || (Number.isInteger(count.min) && count.min >= 0))
  && (count.max === undefined || (Number.isInteger(count.max) && count.max >= 1 && count.max >= (count.min ?? 0)));

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

  /* A target is a selector, or `{anyOf: [...]}` for "any target" (script/bind.mjs) -- either with a `count`, `{min, max}`, for
     "up to N", "any number of", "one or two" (CR 115.1, 601.2c). */
  for (const [index, spec] of (ability.targets ?? []).entries()) {
    const {count, ...selector} = spec && typeof spec === "object" ? spec : {};
    if (count !== undefined && !countValid(count))
      errors.push({path: `${path}.targets[${index}].count`, message: "A target's count is `{min, max}`: whole numbers, max at least 1 and at least min, or no max for \"any number\""});
    if (spec && typeof spec === "object" && "anyOf" in spec) {
      if (!Array.isArray(selector.anyOf) || selector.anyOf.length === 0 || Object.keys(selector).length !== 1)
        errors.push({path: `${path}.targets[${index}]`, message: "A choice of targets is `{anyOf: [selector, ...]}` and nothing else, or that with a count"});
      else selector.anyOf.forEach((one, at) => checkSelector(one, `${path}.targets[${index}].anyOf[${at}]`, errors));
    } else checkSelector(spec && typeof spec === "object" ? selector : spec, `${path}.targets[${index}]`, errors);
  }
  /* Every `{target: n}` an effect names is a target the ability declares, or it would bind to nothing, silently. A
     modal whose modes carry their own targets (chosen as it is cast, CR 700.2): each mode's effects name its own. */
  const modal = (ability.effects ?? []).length === 1 && ability.effects[0]?.effect === "modal" && (ability.effects[0].modes ?? []).some((m) => Array.isArray(m?.targets))
    ? ability.effects[0] : null;
  if (modal) {
    for (const [m, mode] of (modal.modes ?? []).entries()) {
      for (const [index, spec] of (mode.targets ?? []).entries()) {
        const {count, ...selector} = spec && typeof spec === "object" ? spec : {};
        if (count !== undefined && !countValid(count))
          errors.push({path: `${path}.effects[0].modes[${m}].targets[${index}].count`, message: "A target's count is `{min, max}`"});
        if (spec && typeof spec === "object" && "anyOf" in spec) (selector.anyOf ?? []).forEach((one, at) => checkSelector(one, `${path}.effects[0].modes[${m}].targets[${index}].anyOf[${at}]`, errors));
        else checkSelector(spec && typeof spec === "object" ? selector : spec, `${path}.effects[0].modes[${m}].targets[${index}]`, errors);
      }
      for (const n of targetRefs(mode.effects ?? []))
        if (n < 0 || n >= (mode.targets ?? []).length)
          errors.push({path: `${path}.effects[0].modes[${m}]`, message: `A mode names target ${n}, and declares ${(mode.targets ?? []).length}`});
    }
  } else for (const n of targetRefs(ability.effects ?? []))
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

  /* "Choose one or both" (`chooseUpTo`, Perfect Intimidation): built for a spell whose one effect is the modal, its modes
     chosen as it is cast (cards/index.mjs, rules/actions.mjs). Anywhere else the modal is asked as it resolves, as one. */
  for (const [index, effect] of (ability.effects ?? []).entries()) {
    if (effect?.effect !== "modal" || effect.chooseUpTo === undefined) continue;
    if (ability.kind !== "spell" || (ability.effects ?? []).length !== 1)
      errors.push({path: `${path}.effects[${index}].chooseUpTo`, message: "\"Choose one or both\" is built for a spell whose one effect is the modal"});
    if (!Number.isInteger(effect.chooseUpTo) || effect.chooseUpTo <= (effect.choose ?? 1))
      errors.push({path: `${path}.effects[${index}].chooseUpTo`, message: "chooseUpTo is how many modes at most: a whole number more than choose"});
  }

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
    /* "Attack one of your opponents or a planeswalker they control" (CR 506.3): planeswalkers: true, beside defender: "opponent". */
    if (ability.trigger?.planeswalkers !== undefined && (ability.trigger.planeswalkers !== true || on !== "attacks" || ability.trigger.defender !== "opponent"))
      errors.push({path: `${path}.trigger.planeswalkers`, message: "\"Or a planeswalker they control\" is planeswalkers: true, on an attack trigger with defender: \"opponent\""});
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
    /* A rule is read through the whole selector grammar (rules/statics.mjs), a choice of selectors included: "creatures you
       control with power or toughness 1 or less". A layer's `affects` is the layers' narrower matcher, and is not. */
    else checkSelector(ability.affects, `${path}.affects`, errors, {choice: ability.rule !== undefined});
    /* What causes a trigger to trigger again: an arrival, a death, an attack (rules/trigger.mjs). */
    if (ability.rule === "triggers-again" && ability.cause !== undefined && !["enters", "dies", "attacks"].includes(ability.cause?.event))
      errors.push({path: `${path}.cause`, message: "What causes it to trigger again is an event: enters, dies or attacks"});
    /* A restriction on attacking (CR 508.1c): whom, in its words, and a condition under which it does not apply. */
    if (ability.rule === "cant-attack") {
      if (ability.defender !== undefined && !CANT_ATTACK_DEFENDERS.includes(ability.defender))
        errors.push({path: `${path}.defender`, message: `Whom it can't attack is one of ${CANT_ATTACK_DEFENDERS.join(", ")}, or anyone when unsaid`});
      if (ability.unless !== undefined) for (const message of conditionProblems(ability.unless)) errors.push({path: `${path}.unless`, message});
    }
    /* "You or planeswalkers you control" (CR 506.3): a restriction on attacking its controller, or a tax on it, that reaches
       the planeswalkers they control too. Attacking one of those is not attacking them (rules/statics.mjs). */
    if (ability.planeswalkers !== undefined && (ability.planeswalkers !== true || !(ability.rule === "attack-tax" || (ability.rule === "cant-attack" && ability.defender === "you"))))
      errors.push({path: `${path}.planeswalkers`, message: "\"Or planeswalkers you control\" is planeswalkers: true, on a tax on attacking you or a restriction on attacking you"});
    if (ability.rule === "cant-be-blocked-by") {
      if (!ability.by && ability.byPowerBelowSource !== true) errors.push({path, message: "\"Can't be blocked by\" says by what: `by`, or `byPowerBelowSource`"});
      if (ability.by) checkSelector(ability.by, `${path}.by`, errors, {choice: true});
    }
  }

  if (ability.kind === "replacement") {
    if (!ability.watches?.event)
      errors.push({path: `${path}.watches`, message: "A replacement effect says which event it is watching for (CR 614)"});
    if (!ability.change && ability.prevent === undefined)
      errors.push({path: `${path}`, message: "A replacement effect either changes the event or prevents it"});
    /* What follows a prevention (CR 615.5, rules/replacement.mjs): effects held to the effect grammar, after a prevention
       only. A redirection (CR 614.9) goes to what its holder enchants. */
    const then = ability.change?.then;
    if (then !== undefined && (ability.change.prevent !== true || !Array.isArray(then) || then.length === 0))
      errors.push({path: `${path}.change.then`, message: "What follows a prevention is a list of effects, beside prevent: true"});
    if (Array.isArray(then)) then.forEach((effect, index) => checkEffect(effect, `${path}.change.then[${index}]`, errors));
    if (ability.change?.redirect !== undefined && ability.change.redirect !== "enchanted")
      errors.push({path: `${path}.change.redirect`, message: "Damage is redirected to \"enchanted\": what the holder enchants"});
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
  /* A planeswalker's printed loyalty (CR 306.5a). */
  if (identity.loyalty !== undefined && identity.loyalty !== null && !(Number.isInteger(identity.loyalty) && identity.loyalty >= 0))
    errors.push({path: "identity.loyalty", message: "A planeswalker's loyalty is its printed number, 0 or more"});
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

  /* A MODAL DOUBLE-FACED CARD'S BACK FACE (CR 712.3, 712.8): its own identity and abilities, the card's oracle id. */
  if (script.back !== undefined) {
    const back = script.back;
    if (!back || typeof back !== "object" || !Array.isArray(back.abilities)) errors.push({path: "back", message: "A back face is an identity and a list of abilities"});
    else {
      const before = errors.length;
      checkIdentity({...back.identity, oracleId: back.identity?.oracleId ?? script.identity?.oracleId}, errors);
      for (const e of errors.slice(before)) e.path = `back.${e.path}`;
      back.abilities.forEach((ability, index) => checkAbility(ability, `back.abilities[${index}]`, errors));
    }
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
