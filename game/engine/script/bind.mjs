/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TARGETS: CHOSEN AS THE SPELL IS CAST, CHECKED AGAIN AS IT RESOLVES.
 *
 * `docs/engine/PLAN.md` §6, phase 2.4 -- the glue between a card script and a game. A script is written once, long
 * before any game, so it cannot name the creature it will destroy. It names a TARGET instead -- "target 0" -- and
 * this file is what turns that into an object at the moment the rules say it is chosen, and checks it again at the
 * moment the rules say it is checked.
 *
 * CHOSEN ON CASTING (CR 601.2c), NOT ON RESOLUTION. Every opponent sees what a spell is aimed at while it is on the
 * stack, and answers it knowing. So a cast is OFFERED once per legal way to choose its targets (`targetChoices`),
 * the same contract as every other action here: the engine lists what may be done and refuses anything it did not
 * list. A spell with no legal target is never offered (CR 601.2c: it cannot be cast), rather than offered and fizzled.
 *
 * CHECKED AGAIN ON RESOLUTION (CR 608.2b). A target that has left the battlefield is a new object (CR 400.7) and no
 * longer the one chosen; one that gained hexproof is no longer a legal choice. Each illegal target is dropped and the
 * spell does as much as it still can; if EVERY target is illegal the spell does not resolve at all -- it does nothing
 * and goes to the graveyard. An engine that skipped the check would let a removal spell hit whatever now stands where
 * its target stood.
 *
 * A TARGET IS A SELECTOR, OR A CHOICE OF THEM. `{what: "permanent", types: ["Creature"]}` is "target creature";
 * `{anyOf: [creature, player, planeswalker]}` is "any target" (CR 115.4). Every one is marked `target: true` here, so
 * hexproof and shroud (filter.mjs) apply to every targeting card without its script having to remember them.
 *
 * WHAT AN EFFECT SAYS, AND WHAT IT GETS. An effect names its target by `{target: n}` where it would name objects or
 * players, and `"self"` for the card the ability is on:
 *   `targets`   the objects among target n (an effect's object list: destroy, moveZone, pump, dealDamage ...);
 *   `who`       the players among target n (draw, gainLife, loseLife, dealDamage to a player ...);
 *   `toPlayer`  the one player of target n;
 *   `spells`    the spells among target n, by their objects on the stack (counterSpell).
 * So "deal 3 damage to any target" is `{effect: "dealDamage", amount: 3, targets: {target: 0}, who: {target: 0}}`:
 * whichever kind was chosen, the other binds to nothing.
 *
 * FACTS ABOUT A TARGET (CR 608.2h): `{powerOf: {target: n}}`, `{toughnessOf: {target: n}}`, `{manaValueOf: {target: n}}` and
 * `{controllerOf: {target: n}}` name what an effect needs to know about its target -- Swords to Plowshares' "its controller
 * gains life equal to its power", Condemn's "equal to its toughness". They are read once, as the resolution begins
 * (`factsOf`), so an effect after the exile still knows the power of what it exiled: the last known information, as the
 * rule asks. `controllerOf` binds where a player goes: `who`, `toPlayer`, `controller` (whose token, under whose control).
 *
 * "UP TO N TARGET ...", "ANY NUMBER OF TARGET ...", "ONE OR TWO TARGET ..." (CR 115.1, 601.2c): one instance of the word
 * "target" with a count -- `count: {min, max}` beside the selector, or beside `anyOf`; no `max` is "any number". It is not
 * enumerated as offers (a board of twenty creatures has 1,351 ways to choose up to three): an offer holds a placeholder for
 * it (`choosing`), and once the offer is taken its controller picks them as a pick-several, nothing moved or paid before
 * the answer (rules/actions.mjs and rules/trigger.mjs; the question is rules/turn.mjs's "choose-targets"). The same object
 * is chosen at most once for one instance (CR 115.3). What it chose is a list, `[{kind, id}, ...]` -- possibly empty --
 * where a single target's is one `{kind, id}`; an effect naming it gets all of them that are still legal.
 *
 * A CHOSEN TARGET IS PLAIN DATA, `{kind: "object"|"player", id}`, so a game saved with a spell on the stack resumes
 * with the same targets, and an action survives a round trip through JSON to a pilot across a network.
 */

import {compileSelector, selectMatching} from "./filter.mjs";
import {powerOf, toughnessOf, controllerOf} from "../rules/layers.mjs";
import {namesChosen, withChosen} from "./chosen.mjs";
import {parseManaCost, manaValue} from "../rules/mana.mjs";

/** More than this many ways to choose a spell's targets, and the card is refused at prepare rather than offered. */
export const TARGET_CHOICES_MAX = 4096;

/** A target spec's alternatives, each a targeting selector (CR 115.2); its count, if it has one, is not part of them. */
export function targetAlternatives(spec) {
  const {count, ...plain} = spec && typeof spec === "object" ? spec : {};
  const list = Array.isArray(plain.anyOf) ? plain.anyOf : [plain];
  return list.map((selector) => ({...selector, target: true}));
}

/** A counted target's bounds, `{min, max}` (`max` null for "any number"), or null for a single target. */
export function countOf(spec) {
  const count = spec && typeof spec === "object" ? spec.count : undefined;
  return count && typeof count === "object" ? {min: count.min ?? 0, max: count.max ?? null} : null;
}
/** The placeholder a counted target holds in an offer until its controller picks (rules/turn.mjs, "choose-targets"), and
    how many there are to pick from (`of`): "up to two" with none to pick does nothing, for a pilot weighing the offer. */
export const choosing = (spec, of) => ({kind: "choose", ...countOf(spec), ...(of !== undefined ? {of} : {})});
export const isChoosing = (t) => Boolean(t) && !Array.isArray(t) && t.kind === "choose";

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** A small number in words, as a card says it: "four other cards". */
export const inWords = (n) => COUNT_WORDS[n] ?? String(n);
/** A count in words, as a card says it: "up to two targets", "any number of targets", "one or two targets". */
export function countWords({min = 0, max = null} = {}) {
  if (max === null) return min > 0 ? `${inWords(min)} or more targets` : "any number of targets";
  if (min === 0) return `up to ${inWords(max)} target${max === 1 ? "" : "s"}`;
  if (min === max) return `${inWords(max)} target${max === 1 ? "" : "s"}`;
  return `${inWords(min)} ${max === min + 1 ? "or" : "to"} ${inWords(max)} targets`;
}

const kindOf = (selector) => ((selector.what ?? "permanent") === "player" ? "player" : "object");

/** Every legal choice for one target, as `{kind, id}`: in the selectors' order, each in its stable order. */
export function targetCandidates(state, spec, context) {
  const found = [];
  for (const selector of targetAlternatives(spec)) {
    const kind = kindOf(selector);
    for (const id of selectMatching(state, selector, context)) {
      if (!found.some((c) => c.kind === kind && c.id === id)) found.push({kind, id});
    }
  }
  return found;
}

/**
 * Every way to choose an ability's targets: one list per way, one entry per instance of the word "target".
 *
 * CR 601.2c lets the same object be chosen for different instances of "target", so this is the plain product.
 * An ability with no targets has exactly one way: choose nothing. An ability with a target and no legal choice has
 * none, which is what keeps it off the list of things that may be done.
 */
export function targetChoices(state, specs, context) {
  let choices = [[]];
  for (const spec of specs ?? []) {
    const candidates = targetCandidates(state, spec, context);
    /* A counted target is one placeholder in each way, picked once the offer is taken -- or no way at all, when fewer than
       its least are there to choose (CR 601.2c). */
    const count = countOf(spec);
    if (count) {
      if (candidates.length < count.min) return [];
      choices = choices.map((chosen) => [...chosen, choosing(spec, candidates.length)]);
      continue;
    }
    const next = [];
    for (const chosen of choices) for (const candidate of candidates) next.push([...chosen, candidate]);
    choices = next;
    if (choices.length > TARGET_CHOICES_MAX)
      throw new Error(`More than ${TARGET_CHOICES_MAX} ways to choose these targets; a card that needs this many is refused at prepare`);
  }
  return choices;
}

/**
 * The question for a counted target (CR 601.2c): its legal choices as a pick-several, as few as its count allows and as many
 * as it allows or there are. Each option is one candidate (`targets: [it]`, `hostile` for a pilot's aim), a permanent said
 * with whose it is when it is not the chooser's, and two that would read alike numbered.
 */
export function countedChoice(state, spec, context, {id, name, hostile = false}) {
  const count = countOf(spec) ?? {min: 1, max: 1};
  const candidates = targetCandidates(state, spec, context);
  const options = candidates.map((c, index) => {
    const whose = c.kind === "object" && state.objects[c.id] && controllerOf(state, c.id) !== context.controller ? ` (${state.players[controllerOf(state, c.id)]?.name}'s)` : "";
    return {index, label: `${targetName(state, c)}${whose}`, ...(c.kind === "object" ? {cardId: c.id} : {playerId: c.id}), targets: [c], hostile};
  });
  for (const option of options) {
    const alike = options.filter((o) => o.label === option.label);
    if (alike.length > 1) alike.forEach((o, n) => { o.label = `${o.label} (${n + 1})`; });
  }
  return {id, title: `${name}: choose ${countWords(count)}`, mode: "many", min: Math.min(count.min, options.length),
    max: count.max === null ? options.length : Math.min(count.max, options.length), options};
}

/** Whether a chosen target is still legal (CR 608.2b): still there, and still what its spec asks for. */
export function stillLegal(state, spec, chosen, context) {
  if (!chosen) return false;
  return targetAlternatives(spec).some((selector) => kindOf(selector) === chosen.kind
    && compileSelector(selector)(state, chosen.id, context));
}

/**
 * The targets as the resolution sees them: each still-legal one, and null where one has become illegal; for a counted
 * target, the list of those of its chosen that are still legal.
 *
 * @returns {{targets: Array<?{kind, id}|Array>, fizzles: boolean}} `fizzles` when there were targets and none is legal --
 *   a counted target with none chosen is no target, so "up to one" with none chosen still resolves (CR 608.2b)
 */
export function recheckTargets(state, specs, chosen, context) {
  let had = 0, legal = 0;
  const targets = (specs ?? []).map((spec, index) => {
    const was = (chosen ?? [])[index];
    if (Array.isArray(was)) {
      const kept = was.filter((t) => stillLegal(state, spec, t, context));
      had += was.length; legal += kept.length;
      return kept;
    }
    had += 1;
    if (!stillLegal(state, spec, was, context)) return null;
    legal += 1;
    return was;
  });
  return {targets, fizzles: had > 0 && legal === 0};
}

const isRef = (value) => value && typeof value === "object" && !Array.isArray(value) && Number.isInteger(value.target);
const FACT_KEYS = ["powerOf", "toughnessOf", "manaValueOf", "controllerOf"];
const factRef = (value) => value && typeof value === "object" && !Array.isArray(value) && FACT_KEYS.find((k) => isRef(value[k])) || null;

/** What effects may need to know about each object target, read now (CR 608.2h): power, toughness, mana value, controller. */
export function factsOf(state, targets) {
  return (targets ?? []).map((target) => {
    /* A counted target's facts are not one creature's: none is read -- unless one was chosen ("destroy up to one target
       nonbasic land. Its controller may search ...", White Orchid Phantom): that one's. */
    const chosen = Array.isArray(target) ? target.filter((x) => x?.kind === "object") : null;
    const t = chosen ? (chosen.length === 1 ? chosen[0] : null) : target;
    if (!t || t.kind !== "object" || !state.objects[t.id]) return null;
    const o = state.objects[t.id];
    return {powerOf: o.zone === "battlefield" ? powerOf(state, t.id) : (o.power ?? 0),
      /* "Its controller gains life equal to its toughness" (Condemn): as it was, before the effect moved it. */
      toughnessOf: o.zone === "battlefield" ? toughnessOf(state, t.id) : (o.toughness ?? 0),
      manaValueOf: o.manaCost ? manaValue(parseManaCost(o.manaCost)) : 0,
      controllerOf: o.zone === "battlefield" ? controllerOf(state, t.id) : o.controller};
  });
}
/* A fact's value, or undefined when its target became illegal. */
function factValue(value, context) {
  const key = factRef(value);
  if (!key) return undefined;
  return (context.facts ?? [])[value[key].target]?.[key];
}

function objectsOf(value, context) {
  if (value === "self") return context.source !== null && context.source !== undefined ? [context.source] : [];
  /* "That spell", "that creature": what the trigger is about (trigger.mjs), while it is still there. */
  if (value === "that card") return context.about?.card !== undefined && context.about.card !== null ? [context.about.card] : [];
  /* "Tap enchanted creature", "untap equipped creature": what the source is attached to as it resolves (stack.mjs). */
  if (value === "enchanted" || value === "equipped") return context.attached !== undefined && context.attached !== null ? [context.attached] : [];
  /* "A copy of it": what an earlier effect of this resolution moved (effects/zones.mjs, `remember`), while it is there. */
  if (value === "remembered") return (context.remembered ?? []).slice();
  /* "For each of them": everything a "one or more" trigger is about (trigger.mjs, `batch`). */
  if (value === "those cards") return (context.about?.cards ?? []).slice();
  if (!isRef(value)) return value;
  const chosen = (context.targets ?? [])[value.target];
  /* A counted target: every one of its chosen that is an object. */
  if (Array.isArray(chosen)) return chosen.filter((t) => t?.kind === "object").map((t) => t.id);
  return chosen && chosen.kind === "object" ? [chosen.id] : [];
}

function playersOf(value, context, state = null) {
  /* "That player": the one who cast, was dealt the damage, or drew (trigger.mjs). */
  if (value === "that player") return context.about?.player !== undefined && context.about.player !== null ? [context.about.player] : [];
  /* "It deals 1 damage to its controller" (Vengeful Ancestor, batch 75): the controller of what the trigger is about -- the
     attacking creature -- now, while it is on the battlefield; gone, the one it last had (CR 608.2h), as it attacked. */
  if (value === "that card's controller") {
    const card = context.about?.card;
    if (state && card !== undefined && card !== null && state.objects[card]?.zone === "battlefield") return [controllerOf(state, card)];
    return context.about?.controller !== undefined && context.about.controller !== null ? [context.about.controller] : [];
  }
  if (!isRef(value)) return value;
  const chosen = (context.targets ?? [])[value.target];
  if (Array.isArray(chosen)) return chosen.filter((t) => t?.kind === "player").map((t) => t.id);
  return chosen && chosen.kind === "player" ? [chosen.id] : [];
}

/**
 * An effect with its references bound to this resolution's targets and source. Only the effect's own parameters:
 * a modal's chosen effects are bound when they reach the head of the queue, against the same targets.
 */
/* "THE CHOSEN TYPE" ("$chosen", script/chosen.mjs): what a chooseType earlier in this resolution chose, or what the
   ability's permanent chose as it entered -- wherever an effect names it. */
export function bindEffect(effect, context, state = null) {
  if (!effect || typeof effect !== "object") return effect;
  const bound = namesChosen(effect) ? withChosen(effect, context.chosen) : {...effect};
  /* Facts first: a number for an amount, a player where a player goes. */
  for (const [key, value] of Object.entries(bound)) {
    if (!factRef(value)) continue;
    const fact = factValue(value, context);
    if (key === "who") bound.who = fact === undefined ? [] : [fact];
    else if (fact === undefined) delete bound[key];
    else bound[key] = fact;
  }
  if ("targets" in bound) bound.targets = objectsOf(bound.targets, context);
  /* "Exile target player's graveyard": a selector's controller bound to the target player, or to nobody. */
  if (bound.selector && typeof bound.selector === "object" && isRef(bound.selector.controller)) {
    const [player] = playersOf(bound.selector.controller, context);
    bound.selector = {...bound.selector, controller: player ?? -1};
  }
  if ("spells" in bound) bound.spells = objectsOf(bound.spells, context);
  /* "Counter that spell or ability" (ward): the stack entry the trigger is about, by its stack id (rules/trigger.mjs). */
  if (bound.stack === "that") bound.stack = context.about?.stackId !== undefined && context.about.stackId !== null ? [context.about.stackId] : [];
  /* Where the damage comes from, when it is not the spell: "target creature you control deals damage ..." (damageAll). */
  if ("from" in bound) bound.from = objectsOf(bound.from, context);
  /* What is attached, when it is not the ability's source: "you may attach it to target creature you control" (Sigarda's
     Aid, "it" the Equipment that entered). Gone, it is nothing -- never the source in its place. */
  if (typeof bound.source === "string") { const [id] = objectsOf(bound.source, context); bound.source = id ?? -1; }
  if ("who" in bound) bound.who = playersOf(bound.who, context, state);
  /* "Target opponent creates a 1/1 Spirit" (Forbidden Orchard): a token's controller, a target player -- or no one. "That
     creature's controller creates a 1/1 Myr" (Genesis Chamber): the controller of what the trigger is about. */
  if (isRef(bound.controller) || bound.controller === "that card's controller") { const [player] = playersOf(bound.controller, context, state); bound.controller = player ?? -1; }
  /* "That attacking player creates a ... token" (Combat Calligrapher): the player whose attack the trigger is about. */
  if (bound.controller === "attacking player") bound.controller = Number.isInteger(context.about?.attacker) ? context.about.attacker : -1;
  if (isRef(bound.toPlayer)) {
    const [player] = playersOf(bound.toPlayer, context);
    if (player === undefined) delete bound.toPlayer; else bound.toPlayer = player;
  }
  /* Who makes a choice that is not the controller's ("its controller may draw up to two cards"): one player. */
  if (isRef(bound.chooser) || bound.chooser === "that player") {
    const [player] = playersOf(bound.chooser, context);
    if (player === undefined) delete bound.chooser; else bound.chooser = player;
  }
  return bound;
}

/**
 * A DELAYED TRIGGER REMEMBERS WHAT IT NAMES (CR 603.7c), AS IT IS MADE. "Return that card to its owner's hand at the
 * beginning of the next end step" means the card the dies trigger was about; "its controller may draw up to two cards
 * at the beginning of the next turn's upkeep", the player who controlled the countered spell. By the time the delayed
 * trigger resolves there is no trigger and no spell to ask, so every reference in its effects -- a target, a fact
 * about one, "self", "that card", "that player", nested modes included -- is bound now, to the object or player
 * itself. An object that has since changed zones is a new object (CR 400.7) and the old one is simply not there, which
 * is the rule's "it won't affect it". For a delayed trigger that waits for an event (`keepThat`), "that card" and "that
 * player" mean what THAT event is about, and are left for it.
 */
export function rememberNow(effects, context, {keepThat = false} = {}) {
  const walk = (effect) => {
    if (!effect || typeof effect !== "object") return effect;
    const kept = {};
    if (keepThat) for (const key of ["targets", "spells", "who", "toPlayer", "chooser"])
      if (["that card", "that player", "that card's controller"].includes(effect[key])) kept[key] = effect[key];
    const bound = {...bindEffect(effect, context), ...kept};
    for (const key of ["effects", "then", "otherwise"]) if (Array.isArray(bound[key])) bound[key] = bound[key].map(walk);
    if (Array.isArray(bound.modes)) bound.modes = bound.modes.map((mode) => ({...mode, effects: (mode.effects ?? []).map(walk)}));
    return bound;
  };
  return (effects ?? []).map(walk);
}

/**
 * A MODAL SPELL'S CHOSEN MODES AS ONE SCRIPT (CR 700.2): their targets in the order chosen, and their effects with each
 * `{target: n}` moved past the targets of the modes before it -- a mode's script names its own targets from 0.
 */
export function modalScript(modal, modes) {
  const targets = [], effects = [];
  const shift = (value, by) => {
    if (Array.isArray(value)) return value.map((v) => shift(v, by));
    if (!value || typeof value !== "object") return value;
    if (isRef(value)) return {...value, target: value.target + by};
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v, by)]));
  };
  for (const index of modes ?? []) {
    const mode = modal.modes[index];
    if (!mode) continue;
    effects.push(...shift(structuredClone(mode.effects ?? []), targets.length));
    targets.push(...structuredClone(mode.targets ?? []));
  }
  return {targets, effects};
}

/** Every `{target: n}` an ability's effects name, nested ones included, so the schema can check each is declared. */
export function targetRefs(effects) {
  const found = [];
  const walk = (value) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object") return;
    if (isRef(value)) { found.push(value.target); return; }
    const fact = factRef(value);
    if (fact) { found.push(value[fact].target); return; }
    /* A reflexive trigger's targets are its own, chosen as it goes on the stack (CR 603.12; schema.mjs checks them). */
    if (value.effect === "immediateTrigger") return;
    Object.values(value).forEach(walk);
  };
  walk(effects);
  return found;
}

/* The primitives that do something TO what they are aimed at. Read by a pilot choosing among an offer's targets --
   aim these at an opponent's things, the rest at your own -- and by nothing in the rules. */
const HOSTILE = new Set(["destroy", "dealDamage", "moveZone", "tap", "counterSpell", "loseLife", "discard", "mill", "removeCounter"]);

/** Whether an ability's effects are aimed against what they target: a removal spell, not a pump. */
export function isHostile(effects) {
  let hostile = false;
  const walk = (list) => {
    for (const effect of list ?? []) {
      if (!effect || typeof effect !== "object") continue;
      if (HOSTILE.has(effect.effect)) hostile = true;
      for (const mode of effect.modes ?? []) walk(mode.effects);
      walk(effect.effects);
      walk(effect.effects);
    }
  };
  walk(effects);
  return hostile;
}

/** How a chosen target reads in a label and a log: the card's name, or the player's. */
export function targetName(state, chosen) {
  if (!chosen) return "";
  /* A counted target: its chosen, said together; a placeholder, what is still to be chosen. */
  if (Array.isArray(chosen)) return chosen.length ? chosen.map((t) => targetName(state, t)).join(" and ") : "no target";
  if (chosen.kind === "choose") return countWords(chosen);
  if (chosen.kind === "player") return state.players[chosen.id]?.name ?? `Seat ${chosen.id + 1}`;
  return state.objects[chosen.id]?.card ?? "";
}
