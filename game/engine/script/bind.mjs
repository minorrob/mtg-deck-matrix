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

import {compileSelector, selectMatching, creatureTypesOf, shareCreatureType} from "./filter.mjs";
import {powerOf, toughnessOf, controllerOf} from "../rules/layers.mjs";
import {namesChosen, withChosen, namesChosenColor, withChosenColor} from "./chosen.mjs";
import {valueCostOf, shownName, xOnStack} from "../state/index.mjs";
import {parseManaCost, manaValue} from "../rules/mana.mjs";
import {amountOf, AMOUNT_PARAMS} from "./amount.mjs";
import {conditionHolds} from "./condition.mjs";
import {targetFacts, effectForTarget} from "./decision.mjs";

/** More than this many ways to choose a spell's targets, and the card is refused at prepare rather than offered. */
export const TARGET_CHOICES_MAX = 4096;

/* WHAT A TARGET SPEC SAYS BESIDES ITS SELECTOR (Train B, X11):
 *   `distinctFrom: [n]`        "a second target creature", "up to one other target artifact": not the object or player
 *                               chosen for target n of the same spell or ability (Tidus, Yuna's Guardian; Return to Dust)
 *   `onlyIf: condition`        a target the spell has only when the condition holds as it is cast (CR 601.2c: "the spell
 *                               is cast as though it did not require those targets"): "if you cast this spell during your
 *                               main phase, you may exile up to one other target" (Return to Dust, {cast: {mainPhase: true}})
 *   `differentControllers`     a counted target's choices each controlled by a different player ("up to two target
 *                               artifacts and/or enchantments controlled by different players", Protector of the Wastes)
 *   `share`                    a counted target's choices together: "graveyard", all from a single graveyard ("up to two
 *                               target cards from a single graveyard", Unlicensed Hearse); "creature type", a creature type
 *                               all of them have ("two target creature cards that share a creature type", Unbury)
 *   `forEach: "opponent"`      "for each opponent, destroy up to one target creature or planeswalker that player controls"
 *                               (Lich's Relic's reflexive trigger), with `count: {min: 0, max: 1}`, the count for each of them:
 *                               one instance of "target" for each opponent (CR 601.2c), so what an opponent controls, no more
 *                               than one of each opponent's, and as many as there are opponents. Each one chosen keeps the
 *                               player it was chosen for (`forPlayer`), and is illegal as the ability resolves once that player
 *                               no longer controls it (CR 608.2b), whoever controls it then
 *   `ownedByControllerOf: n`   "target artifact a player controls and target artifact card in that player's graveyard" (Goblin
 *                               Welder): a card whose owner -- whose graveyard it is in (CR 400.3) -- controls the permanent
 *                               chosen for target n, as it is chosen and again as the ability resolves (CR 608.2b): that
 *                               permanent gone, or another player's now, and this target is illegal too (relatedLegal)
 * None is part of what a target may be (the selector), so each is set aside beside `count`. */
export const SPEC_KEYS = Object.freeze(["totalPowerAtMost", "count", "distinctFrom", "onlyIf", "differentControllers", "share", "forEach", "ownedByControllerOf"]);
/** What a counted target's choices may share (`share`). */
export const SHARES = Object.freeze(["graveyard", "creature type"]);
const selectorOf = (spec) => Object.fromEntries(Object.entries(spec && typeof spec === "object" ? spec : {}).filter(([key]) => !SPEC_KEYS.includes(key)));
/* "For each opponent ... that player controls" (`forEach`): one of each opponent's, as "controlled by different players" is. */
const forEachOpponent = (spec) => spec?.forEach === "opponent";
const oneOfEach = (spec) => spec?.differentControllers === true || forEachOpponent(spec);

/** A target spec's alternatives, each a targeting selector (CR 115.2); its count, if it has one, is not part of them. */
export function targetAlternatives(spec) {
  const plain = selectorOf(spec);
  const list = Array.isArray(plain.anyOf) ? plain.anyOf : [plain];
  /* "That player controls", for each opponent (`forEach`): only what an opponent controls. */
  return list.map((selector) => ({...selector, ...(forEachOpponent(spec) ? {controller: "opponent"} : {}), target: true}));
}

/** A counted target's bounds, `{min, max}` (`max` null for "any number"), or null for a single target. "Up to that many
    target ..." (Bloodthirsty Adversary's reflexive trigger, `max: "X"`): the X it was made with (CR 603.12, 107.3). */
export function countOf(spec, context = {}) {
  /* "For each opponent, up to one target" (`forEach`): none at least, and no most but the one of each opponent's (oneOfEach). */
  if (forEachOpponent(spec)) return {min: 0, max: null};
  const count = spec && typeof spec === "object" ? spec.count : undefined;
  /* "Exile X target creatures" (Curse of the Swine; CR 601.2c, X chosen before the targets, 601.2b): `min` "X" too, exactly X. */
  const x = Math.max(0, context?.x ?? 0);
  return count && typeof count === "object" ? {min: count.min === "X" ? x : count.min ?? 0, max: count.max === "X" ? x : count.max ?? null} : null;
}
/** The placeholder a counted target holds in an offer until its controller picks (rules/turn.mjs, "choose-targets"), and
    how many there are to pick from (`of`): "up to two" with none to pick does nothing, for a pilot weighing the offer. */
/* And, for one whose choices share something (`share`), which of its candidates it picks among -- the group it was offered
   with (shareGroups) -- and that group's words. */
export const choosing = (spec, of, context = {}, group = null) => ({kind: "choose", ...countOf(spec, context), ...(of !== undefined ? {of} : {}),
  ...(group ? {group: [...group.ids], groupLabel: group.label} : {})});
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

/* An ability on the stack (CR 115.2, script/filter.mjs) is no object: chosen as `{kind: "ability", id}`, its entry's stack id. */
const kindOf = (selector) => ((selector.what ?? "permanent") === "player" ? "player" : selector.what === "ability" ? "ability" : "object");

/* The targets chosen for other instances of "target" that this one must differ from (`distinctFrom`), as the offer or the
   stack entry holds them so far (`context.chosenTargets`, or the way being built). */
const otherThan = (spec, chosen) => (Array.isArray(spec?.distinctFrom) ? spec.distinctFrom.flatMap((n) => [].concat((chosen ?? [])[n] ?? [])).filter((t) => t && (t.kind === "object" || t.kind === "player")) : []);
const sameTarget = (a, b) => a.kind === b.kind && a.id === b.id;
/* "In that player's graveyard" (`ownedByControllerOf`): the candidate a card owned by whoever controls the permanent chosen for
   that target -- with none chosen there yet, or that one gone, no candidate is. Any other spec, every candidate. */
function relatedLegal(state, spec, chosen, candidate) {
  if (!Number.isInteger(spec?.ownedByControllerOf)) return true;
  const first = (chosen ?? [])[spec.ownedByControllerOf];
  return Boolean(first) && !Array.isArray(first) && first.kind === "object" && state.objects[first.id]?.zone === "battlefield"
    && candidate?.kind === "object" && state.objects[candidate.id]?.owner === controllerOf(state, first.id);
}

/** Every legal choice for one target, as `{kind, id}`: in the selectors' order, each in its stable order. */
export function targetCandidates(state, spec, context) {
  const found = [];
  const others = otherThan(spec, context?.chosenTargets);
  for (const selector of targetAlternatives(spec)) {
    const kind = kindOf(selector);
    for (const id of selectMatching(state, selector, context)) {
      if (!found.some((c) => c.kind === kind && c.id === id) && !others.some((o) => sameTarget(o, {kind, id}))
        /* Of the targets chosen so far, when they are known (an offer's, a stack entry's); every way's own, otherwise
           (targetChoices, below). */
        && (!Number.isInteger(spec?.ownedByControllerOf) || !Array.isArray(context?.chosenTargets) || relatedLegal(state, spec, context.chosenTargets, {kind, id}))) found.push({kind, id});
    }
  }
  return found;
}

/* A COUNTED TARGET'S CHOICES TOGETHER (`share`; CR 115.1, 601.2c). "Up to two target cards from a single graveyard"
   (Unlicensed Hearse): one graveyard's cards. "Two target creature cards that share a creature type" (Unbury): a creature
   type every one of them has -- a changeling has every one (CR 702.73a). Its candidates in groups that hold together, each
   offered as its own way to aim it: a graveyard (its owner's, CR 400.3), or a creature type a candidate has, the changelings
   with every one; a group too small for the least it must choose is none. The cards are then picked within the group, and
   whatever is picked is held to the rule again (shareProblem) -- so every legal choice has its way, and no other. */
function shareGroups(state, spec, candidates) {
  const objects = candidates.filter((c) => c.kind === "object" && state.objects[c.id]).map((c) => c.id);
  if (spec.share === "graveyard") {
    const owners = [...new Set(objects.map((id) => state.objects[id].owner))].sort((a, b) => a - b);
    return owners.map((owner) => ({key: `graveyard:${owner}`, label: `from ${state.players[owner]?.name ?? `Seat ${owner + 1}`}'s graveyard`,
      ids: objects.filter((id) => state.objects[id].owner === owner)}));
  }
  const types = new Map(objects.map((id) => [id, creatureTypesOf(state, id)]));
  const named = [...new Set([...types.values()].flatMap((t) => t.types))].sort();
  const groups = named.map((type) => ({key: `creature type:${type}`, label: `that share a creature type: ${type}`,
    ids: objects.filter((id) => types.get(id).every || types.get(id).types.includes(type))}));
  /* Changelings that name no creature type of their own share every one, with each other. */
  const every = objects.filter((id) => types.get(id).every);
  if (!named.length && every.length) groups.push({key: "creature type:every", label: "that share a creature type", ids: every});
  return groups;
}
/* A counted target's candidates within the group its placeholder was offered with -- every candidate, without one. */
function groupCandidates(state, spec, context, placeholder) {
  const all = targetCandidates(state, spec, context);
  return Array.isArray(placeholder?.group) ? all.filter((c) => c.kind === "object" && placeholder.group.includes(c.id)) : all;
}
/** Why a counted target's choices do not hold together as its `share` says, in words, or null (CR 601.2c). */
export function shareProblem(state, spec, chosen, name) {
  if (Number.isFinite(spec?.totalPowerAtMost) && (chosen ?? []).reduce((n, t) => n + (t?.kind === "object" && state.objects[t.id] ? powerOf(state, t.id) : 0), 0) > spec.totalPowerAtMost)
    return `${name}'s targets exceed total power ${spec.totalPowerAtMost}: choose creature cards with total power ${spec.totalPowerAtMost} or less.`;
  const objects = (chosen ?? []).filter((t) => t?.kind === "object" && state.objects[t.id]).map((t) => t.id);
  if (spec?.share === "graveyard" && new Set(objects.map((id) => state.objects[id].owner)).size > 1)
    return `${name}'s targets must be in a single graveyard: choose them all from one player's graveyard.`;
  if (spec?.share === "creature type" && objects.length > 1 && !shareCreatureType(state, objects))
    return `${name}'s targets must share a creature type: choose cards with a creature type in common.`;
  return null;
}

/* Whether a spec's target is one the ability has at all: an `onlyIf` that holds as it is cast or put on the stack. */
const required = (state, spec, context) => !spec?.onlyIf || conditionHolds(state, spec.onlyIf, {controller: context?.controller, source: context?.source ?? null,
  ...(context?.about ? {about: context.about} : {}), ...(context?.cast ? {cast: context.cast} : {})});

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
    /* A target it has only if (`onlyIf`): cast as though it did not require it (CR 601.2c) -- chosen as none. */
    if (!required(state, spec, context)) { choices = choices.map((chosen) => [...chosen, []]); continue; }
    const candidates = targetCandidates(state, spec, context);
    /* A counted target is one placeholder in each way, picked once the offer is taken -- or no way at all, when fewer than
       its least are there to choose (CR 601.2c). */
    const count = countOf(spec, context);
    if (count) {
      if (candidates.length < count.min) return [];
      const free = (chosen) => candidates.filter((c) => !otherThan(spec, chosen).some((o) => sameTarget(o, c)));
      /* Whose choices share something (`share`): a way for each group large enough -- and with none, "up to" still the one
         way of choosing nothing. */
      if (spec.share) {
        choices = choices.flatMap((chosen) => {
          const groups = shareGroups(state, spec, free(chosen)).filter((group) => group.ids.length >= count.min);
          return groups.length ? groups.map((group) => [...chosen, choosing(spec, group.ids.length, context, group)]) : count.min === 0 ? [[...chosen, choosing(spec, 0, context)]] : [];
        });
        continue;
      }
      choices = choices.map((chosen) => [...chosen, choosing(spec, free(chosen).length, context)]);
      continue;
    }
    const next = [];
    /* "A second target creature" (`distinctFrom`): never the one chosen for that other target. "In that player's graveyard"
       (`ownedByControllerOf`): only a card of the player who controls the permanent that way chose. */
    for (const chosen of choices) for (const candidate of candidates)
      if (!otherThan(spec, chosen).some((o) => sameTarget(o, candidate)) && relatedLegal(state, spec, chosen, candidate)) next.push([...chosen, candidate]);
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
export function countedChoice(state, spec, context, {id, name, hostile = false, placeholder = null, effects = [], targetIndex = 0}) {
  const count = countOf(spec, context) ?? {min: 1, max: 1};
  /* Within the group it was offered with (`share`): one graveyard's cards, or those with the creature type. */
  const candidates = groupCandidates(state, spec, context, placeholder);
  const options = candidates.map((c, index) => {
    const whose = c.kind === "object" && state.objects[c.id] && controllerOf(state, c.id) !== context.controller ? ` (${state.players[controllerOf(state, c.id)]?.name}'s)` : "";
    /* "For each opponent ... that player controls" (`forEach`): the opponent each is chosen for, kept with it (stillLegal). */
    const target = forEachOpponent(spec) ? {...c, forPlayer: controllerOf(state, c.id)} : c;
    return {index, ...(Number.isFinite(spec.totalPowerAtMost) ? {power: powerOf(state, c.id)} : {}), label: `${targetName(state, c)}${whose}`, ...(c.kind === "object" ? {cardId: c.id} : {playerId: c.id}), targets: [target], hostile,
      ...targetFacts(state, c, effectForTarget(effects, targetIndex))};
  });
  for (const option of options) {
    const alike = options.filter((o) => o.label === option.label);
    if (alike.length > 1) alike.forEach((o, n) => { o.label = `${o.label} (${n + 1})`; });
  }
  /* "Controlled by different players" (`differentControllers`), "for each opponent" (`forEach`): at most one of each player's,
     refused with what to do instead (controller.mjs reads `capped`; both pilots keep to it). */
  const capped = oneOfEach(spec) ? differentControllersCap(state, options, name, forEachOpponent(spec)) : null;
  const words = forEachOpponent(spec) ? "for each opponent, choose up to one target that player controls"
    : `choose ${countWords(count)}${placeholder?.groupLabel ? ` ${placeholder.groupLabel}` : ""}${capped ? ", each controlled by a different player" : ""}`;
  return {id, title: `${name}: ${words}`, mode: "many", min: Math.min(count.min, options.length),
    max: count.max === null ? options.length : Math.min(count.max, options.length), options,
    ...(Number.isFinite(spec.totalPowerAtMost) ? {budget: {by: "power", most: spec.totalPowerAtMost,
      why: `Choose creature cards with total power ${spec.totalPowerAtMost} or less.`}} : {}), ...(capped ? {capped} : {})};
}

/* "Controlled by different players" as a cap: no more than one option of each controller's, and the words that say so --
   for each opponent's (`each`), one of that opponent's. */
function differentControllersCap(state, options, name, each = false) {
  const players = [...new Set(options.map((o) => o.controllerId).filter((p) => p !== undefined))];
  const whose = (p) => state.players[p]?.name ?? `Seat ${p + 1}`;
  return {by: "controllerId", most: Object.fromEntries(players.map((p) => [p, 1])),
    why: Object.fromEntries(players.map((p) => [p, each ? `${name} targets up to one of each opponent's: choose no more than one of ${whose(p)}'s.`
      : `${name}'s targets must be controlled by different players: choose no more than one of ${whose(p)}'s, and the others from other players.`]))};
}

/** Why a counted target's choices break "controlled by different players" (`differentControllers`) or "for each opponent"
    (`forEach`), in words, or null. */
export function differentControllersProblem(state, spec, chosen, name) {
  if (!oneOfEach(spec)) return null;
  const seen = new Map();
  for (const t of chosen ?? []) {
    if (t?.kind !== "object" || !state.objects[t.id]) continue;
    const p = controllerOf(state, t.id), whose = state.players[p]?.name ?? `Seat ${p + 1}`;
    if (seen.has(p)) return forEachOpponent(spec)
      ? `${name} targets up to one of each opponent's: ${targetName(state, seen.get(p))} and ${targetName(state, t)} are both ${whose}'s. Choose no more than one of each opponent's.`
      : `${name}'s targets must be controlled by different players: ${targetName(state, seen.get(p))} and ${targetName(state, t)} are both ${whose}'s. Choose no more than one of each player's.`;
    seen.set(p, t);
  }
  return null;
}

/** Whether a chosen target is still legal (CR 608.2b): still there, and still what its spec asks for. */
export function stillLegal(state, spec, chosen, context) {
  if (!chosen) return false;
  /* "That player controls" (`forEach`): still the opponent's it was chosen for -- one that has come under another player's
     control is no longer that player's creature (CR 608.2b), even another opponent's. */
  if (forEachOpponent(spec) && state.objects[chosen.id] && controllerOf(state, chosen.id) !== chosen.forPlayer) return false;
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
      let kept = was.filter((t) => stillLegal(state, spec, t, context));
      /* "That share a creature type" (CR 608.2b): those still legal that no longer have one in common are none of them
         legal -- each no longer shares one with the others. One left alone shares with nothing, and stays. */
      if (shareProblem(state, spec, kept, "")) kept = [];
      had += was.length; legal += kept.length;
      return kept;
    }
    had += 1;
    if (!stillLegal(state, spec, was, context)) return null;
    legal += 1;
    return was;
  });
  /* "In that player's graveyard" (`ownedByControllerOf`, CR 608.2b): the permanent it is about gone or illegal, or another
     player's now, and this card is no longer a legal target either. */
  for (const [index, spec] of (specs ?? []).entries())
    if (Number.isInteger(spec?.ownedByControllerOf) && targets[index] && !relatedLegal(state, spec, targets, targets[index])) { targets[index] = null; legal -= 1; }
  return {targets, fizzles: had > 0 && legal === 0};
}

const isRef = (value) => value && typeof value === "object" && !Array.isArray(value) && Number.isInteger(value.target);
/* `ownerOf` and `nameOf` (Reflector Mage): "that creature's owner can't cast spells with the same name as that creature" --
   whose it is (CR 108.3) and what it is called (CR 201.2) as the resolution begins, before the creature is returned. */
const FACT_KEYS = ["powerOf", "toughnessOf", "manaValueOf", "controllerOf", "ownerOf", "nameOf"];
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
      /* A transformed permanent's is its front face's (CR 202.3b). A spell's on the stack counts X as the value chosen for it
         (CR 202.3e): "add an amount of {C} equal to that spell's mana value" (Mana Drain), "lose life equal to that spell's
         mana value" (Imp's Mischief) -- read as the resolution begins, before the spell is countered or moved. */
      manaValueOf: valueCostOf(o) ? manaValue(parseManaCost(valueCostOf(o)), {x: xOnStack(state, t.id)}) : 0,
      controllerOf: o.zone === "battlefield" ? controllerOf(state, t.id) : o.controller,
      /* A face-down permanent has no name (CR 708.2; Reflector Mage's ruling): a lock by its name locks nothing. */
      ownerOf: o.owner, nameOf: o.faceDown === true ? null : o.card};
  });
}
/* A fact's value, or undefined when its target became illegal. */
/* A target's power or toughness while it is still the same object -- in the zone it was expected to be in, never moved (CR
   400.7) -- is its current one (CR 608.2h): "Target creature you control gets +1/+0 until end of turn. It deals damage
   equal to its power" (Assert Perfection, Burrog Barrage) reads the power the pump left. Gone from there -- Swords to
   Plowshares' exiled creature -- it is the fact read as the resolution began, its last known information. `state` given by
   the resolution's own binding (script/resolution.mjs). A counted target's one object ("up to one target creature") is read
   as the fact, as before. */
const FROM_NOW = ["powerOf", "toughnessOf"];
function factValue(value, context, state = null) {
  const key = factRef(value);
  if (!key) return undefined;
  const fact = (context.facts ?? [])[value[key].target]?.[key];
  if (fact === undefined || state === null || !FROM_NOW.includes(key)) return fact;
  const id = (context.targets ?? [])[value[key].target]?.id;
  if (!state.objects[id]) return fact;
  return key === "powerOf" ? powerOf(state, id) : toughnessOf(state, id);
}

function thisCardInGraveyard(state, source) {
  if (source === null || source === undefined) return [];
  for (const list of Object.values(state.zones.graveyard ?? {})) for (const id of list) if (state.objects[id]?.wasPermanent === source) return [id];
  return [];
}

function objectsOf(value, context) {
  if (value === "self") return context.source !== null && context.source !== undefined ? [context.source] : [];
  /* "That spell", "that creature": what the trigger is about (trigger.mjs), while it is still there. */
  if (value === "that card" && context.about?.cards) return [...context.about.cards];
  if (value === "that card") return context.about?.card !== undefined && context.about.card !== null ? [context.about.card] : [];
  /* "Tap enchanted creature", "untap equipped creature": what the source is attached to as it resolves (stack.mjs). */
  if (value === "enchanted" || value === "equipped") return context.attached !== undefined && context.attached !== null ? [context.attached] : [];
  /* "A copy of it": what an earlier effect of this resolution moved (effects/zones.mjs, `remember`), while it is there. */
  if (value === "remembered") return (context.remembered ?? []).slice();
  /* "The exiled cards" (Tibalt's Trickery): every card the digUntil before it exiled (`rememberAll`, effects/zones.mjs). */
  if (value === "the exiled cards") return (context.exiledThisWay ?? []).slice();
  /* "Each creature that convoked this spell" (Lethal Scheme; CR 702.51c): the creatures tapped to pay for it as it was cast
     (rules/actions.mjs) -- each as it was then, one gone since among them, for an effect that reads last known information
     (connive, CR 701.50b). */
  if (value === "convoked") return [...(context.cast?.convoked ?? [])];
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
  /* "That attacking player draws a card" (Breena, the Demagogue): the player whose attack the trigger is about (rules/trigger.mjs,
     `attacker`), as Combat Calligrapher's token's controller is. */
  if (value === "attacking player") return Number.isInteger(context.about?.attacker) ? [context.about.attacker] : [];
  /* "The chosen player" of a gift (CR 702.174d-i): the opponent it was promised to as the spell was cast -- the spell's own
     (rules/stack.mjs), or the permanent's whose gift trigger this is. None promised, nobody -- nor one who has left the game
     (CR 800.4a). */
  if (value === "the chosen player") {
    const gift = context.gift ?? (state && context.source !== null && context.source !== undefined ? state.objects[context.source]?.gift : undefined);
    return Number.isInteger(gift) && !(state?.players[gift]?.lost) ? [gift] : [];
  }
  /* "It deals 1 damage to its controller" (Vengeful Ancestor, batch 75): the controller of what the trigger is about -- the
     attacking creature -- now, while it is on the battlefield; gone, the one it last had (CR 608.2h), as it attacked. */
  if (value === "that card's controller") {
    const card = context.about?.card;
    if (state && card !== undefined && card !== null && state.objects[card]?.zone === "battlefield") return [controllerOf(state, card)];
    if (context.about?.controller !== undefined && context.about.controller !== null) return [context.about.controller];
    /* "Whenever a creature an opponent controls dies, that player loses 2 life" (Massacre Wurm, wave 4b): a permanent that has
       left the battlefield, by the controller it had as it last existed there (CR 603.10a, 608.2h). */
    const was = context.about?.lastKnown?.controller;
    return Number.isInteger(was) ? [was] : [];
  }
  /* "Then each opponent who didn't draws a card" (Kynaios and Tiro of Meletis): its controller's opponents who did not do what
     this resolution offered them (effects/asking.mjs, chooseCard's `did`) -- one who has left the game does nothing
     (CR 800.4a; effects/zones.mjs, playersFor). */
  if (value === "each opponent who didn't")
    return (state?.players ?? []).filter((p) => p.id !== context.controller && !(context.whoDid ?? []).includes(p.id)).map((p) => p.id);
  /* "This creature deals 4 damage to each other opponent" (Parapet Thrasher; precon load lane C): its controller's opponents but
     the one the trigger is about -- "that opponent" -- each still in the game (CR 800.4a; effects/zones.mjs, playersFor). */
  if (value === "each other opponent")
    return (state?.players ?? []).map((p) => p.id).filter((id) => id !== context.controller && id !== context.about?.player);
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
  const chosen = namesChosen(effect) ? withChosen(effect, context.chosen) : {...effect};
  /* And "that color", chosen earlier in this resolution (script/chosen.mjs, "$chosenColor"). */
  const bound = namesChosenColor(effect) ? withChosenColor(chosen, context.chosenColor) : chosen;
  /* Facts first: a number for an amount, a player where a player goes. */
  for (const [key, value] of Object.entries(bound)) {
    /* Who chooses by `ownerOf` is the owner as the object now is (below), not a fact read as the resolution began. */
    if (!factRef(value) || (key === "chooser" && factRef(value) === "ownerOf")) continue;
    const fact = factValue(value, context, state);
    if (key === "who") bound.who = fact === undefined ? [] : [fact];
    /* "Exile up to one target non-Salamander creature. That creature's controller creates a 4/3 ... token" (Amphin Mutineer):
       none chosen, or that target gone (CR 608.2b), there is no such player -- nobody creates it, never this ability's
       controller in their place (effects/permanents.mjs, createToken). */
    else if (fact === undefined && key === "controller") bound.controller = -1;
    else if (fact === undefined) delete bound[key];
    else bound[key] = fact;
  }
  /* "THE PLAYER OR PLANESWALKER THAT CREATURE IS ATTACKING" (Raid Bombardment, Myr Battlesphere; CR 506.3, 508.1b): what the
     creature an attack trigger is about attacks, as it attacked when the ability triggered (rules/trigger.mjs) -- the
     planeswalker, while it is still on the battlefield (gone, nothing is dealt the damage, CR 506.4c), or else the player. */
  if (bound.who === "attacked") {
    const walker = context.about?.planeswalker;
    if (walker === undefined || walker === null) bound.who = "that player";
    else { bound.who = []; bound.targets = !state || state.objects[walker]?.zone === "battlefield" ? [walker] : []; }
  }
  /* "RETURN THIS CARD TO ITS OWNER'S HAND" (Angelic Destiny, its "when enchanted creature dies"): the card the ability's source
     became in a graveyard, the new object it is once it was put there from the battlefield (CR 400.7; the Aura, by the
     state-based action after the creature died, CR 704.5m). Gone from there since, it is nothing. */
  if (bound.targets === "this card") bound.targets = state ? thisCardInGraveyard(state, context.source ?? context.sourceWas) : [];
  if ("targets" in bound) bound.targets = objectsOf(bound.targets, context);
  /* "Destroy all creatures with power greater than target creature's power" (Fell the Mighty; CR 608.2h): a selector's
     `power.moreThan`, a fact about a target, read as the resolution began -- a number, or null when that target is no
     longer legal, which matches nothing (script/filter.mjs). */
  if (bound.selector && typeof bound.selector === "object" && factRef(bound.selector.power?.moreThan)) {
    const fact = factValue(bound.selector.power.moreThan, context);
    bound.selector = {...bound.selector, power: {...bound.selector.power, moreThan: Number.isInteger(fact) ? fact : null}};
  }
  /* "Each opponent may sacrifice a permanent of their choice that shares a card type with it" (Braids, Arisen Nightmare; CR
     608.2h): `sharesCardTypeWith` "moved" bound to the card types of what the effect before it moved, as each last existed
     (effects/asking.mjs, sacrifice's `movedWas`) -- a land animated into a creature shares both. */
  if (bound.selector && typeof bound.selector === "object" && bound.selector.sharesCardTypeWith === "moved")
    bound.selector = {...bound.selector, sharesCardTypeWith: [...new Set((context.movedWas ?? []).flatMap((was) => was.types ?? []))]};
  /* "Exile target player's graveyard": a selector's controller bound to the target player, or to nobody. */
  if (bound.selector && typeof bound.selector === "object" && isRef(bound.selector.controller)) {
    const [player] = playersOf(bound.selector.controller, context);
    bound.selector = {...bound.selector, controller: player ?? -1};
  }
  if ("spells" in bound) bound.spells = objectsOf(bound.spells, context);
  /* "Create a Royal Role token attached to that creature" (Royal Treatment): what the token enters attached to. */
  if ("attachedTo" in bound) bound.attachedTo = objectsOf(bound.attachedTo, context);
  /* "Until this card is cast from exile" (Emrakul, the Exigent Doom): which card's cast ends it. */
  if ("untilCast" in bound) bound.untilCast = objectsOf(bound.untilCast, context);
  /* "Counter that spell or ability" (ward): the stack entry the trigger is about, by its stack id (rules/trigger.mjs). */
  if (bound.stack === "that") bound.stack = context.about?.stackId !== undefined && context.about.stackId !== null ? [context.about.stackId] : [];
  /* "Change the target of target spell or ability" (Bolt Bend): the stack entries among target n -- an ability by its own
     stack id, a spell by its entry's. */
  if (isRef(bound.stack)) {
    const chosen = [].concat((context.targets ?? [])[bound.stack.target] ?? []).filter(Boolean);
    bound.stack = chosen.map((t) => (t.kind === "ability" ? t.id : t.kind === "object" ? state?.stack.find((e) => e.objectId === t.id)?.stackId : undefined)).filter((id) => id !== undefined);
  }
  /* Where the damage comes from, when it is not the spell: "target creature you control deals damage ..." (damageAll). */
  if ("from" in bound) bound.from = objectsOf(bound.from, context);
  /* What is attached, when it is not the ability's source: "you may attach it to target creature you control" (Sigarda's
     Aid, "it" the Equipment that entered). Gone, it is nothing -- never the source in its place. */
  /* "Attach target Equipment you control to up to one target creature you control" (Iron Hills Stalwart; CR 701.3a): one of
     the ability's targets -- illegal as it resolves, it is nothing, and nothing moves (CR 608.2b). */
  if (typeof bound.source === "string" || isRef(bound.source)) { const [id] = objectsOf(bound.source, context); bound.source = id ?? -1; }
  if ("who" in bound) bound.who = playersOf(bound.who, context, state);
  /* "Target opponent creates a 1/1 Spirit" (Forbidden Orchard): a token's controller, a target player -- or no one. "That
     creature's controller creates a 1/1 Myr" (Genesis Chamber): the controller of what the trigger is about. "Each opponent
     creates a 1/1 white Human creature token" (Slaughter Specialist; CR 111.2), "each opponent may create X ... tokens"
     (Tempt with Vengeance): "that player", the one a repetition is about (effects/index.mjs, repeatFor). */
  if (isRef(bound.controller) || ["that card's controller", "that player", "the chosen player"].includes(bound.controller)) { const [player] = playersOf(bound.controller, context, state); bound.controller = player ?? -1; }
  /* "That attacking player creates a ... token" (Combat Calligrapher): the player whose attack the trigger is about. */
  if (bound.controller === "attacking player") bound.controller = Number.isInteger(context.about?.attacker) ? context.about.attacker : -1;
  /* "At the beginning of each player's upkeep, that player gains control of Alexios": the player the trigger is about. */
  if (isRef(bound.toPlayer) || bound.toPlayer === "that player") {
    const [player] = playersOf(bound.toPlayer, context);
    if (player === undefined) delete bound.toPlayer; else bound.toPlayer = player;
  }
  /* Who makes a choice that is not the controller's ("its controller may draw up to two cards"): one player. */
  /* "Its controller may draw a card" (Selvala, Heart of the Wilds, wave 4b): the controller of what the trigger is about. */
  if (isRef(bound.chooser) || bound.chooser === "that player" || bound.chooser === "that card's controller") {
    const [player] = playersOf(bound.chooser, context, state);
    if (player === undefined) delete bound.chooser; else bound.chooser = player;
  }
  /* "The owner of target nonland permanent puts it into their library second from the top or on the bottom" (Temporal
     Cleansing): the owner of a target object (`ownerOf`), as it now is. */
  if (bound.chooser && typeof bound.chooser === "object" && isRef(bound.chooser.ownerOf)) {
    const [id] = objectsOf(bound.chooser.ownerOf, context);
    const owner = id !== undefined ? state?.objects[id]?.owner : undefined;
    if (owner === undefined) delete bound.chooser; else bound.chooser = owner;
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
 *
 * And a count of this resolution -- "that many" of what the effect before it moved, the life lost this way -- is counted
 * now, while there is a resolution to count: "exile all creatures you control. At the beginning of the next end step,
 * reveal cards ... until you reveal that many creature cards" (Synthetic Destiny).
 */
const THIS_WAY = ["rememberedCount", "lifeLostThisWay", "cardTypesAmong"];
/* An effect's counts of this resolution ("that many" of what the effect before it did), counted now. */
function thisWayNow(bound, context, state) {
  for (const key of AMOUNT_PARAMS) {
    if (!(bound[key] && typeof bound[key] === "object" && THIS_WAY.some((kind) => kind in bound[key]))) continue;
    /* "For each of those cards that are STILL exiled" (Dragonhawk, Fate's Tempest; script/amount.mjs, `still`): the cards
       remembered now, counted as the delayed trigger resolves. */
    if (bound[key].still === true) bound[key] = {...bound[key], still: [...(context.remembered ?? [])]};
    else bound[key] = amountOf(state, bound[key], context);
  }
  return bound;
}
/* Each effect, and those nested in it -- a branch's, a repetition's, a modal's modes' -- as `one` makes it. */
function walkEffects(effects, one) {
  const walk = (effect) => {
    if (!effect || typeof effect !== "object") return effect;
    const bound = one(effect);
    for (const key of ["effects", "then", "otherwise"]) if (Array.isArray(bound[key])) bound[key] = bound[key].map(walk);
    if (Array.isArray(bound.modes)) bound.modes = bound.modes.map((mode) => ({...mode, effects: (mode.effects ?? []).map(walk)}));
    return bound;
  };
  return (effects ?? []).map(walk);
}
export function rememberNow(effects, context, {keepThat = false, state = null} = {}) {
  /* What the delayed trigger's own effects remember as it resolves is its own: "At the beginning of the next end step, untap up
     to two lands" (Teferi, Hero of Dominaria) -- the lands chosen then (CR 603.7), not what this resolution remembered. An
     effect after one of its own that remembers keeps "remembered" for that resolution. */
  let own = false;
  return walkEffects(effects, (effect) => {
    const kept = {};
    if (keepThat) for (const key of ["targets", "spells", "who", "toPlayer", "chooser"])
      if (["that card", "that player", "that card's controller"].includes(effect[key])) kept[key] = effect[key];
    if (own && effect.targets === "remembered") kept.targets = "remembered";
    if (effect.remember === true) own = true;
    return thisWayNow({...bindEffect(effect, context), ...kept}, context, state);
  });
}

/**
 * A REFLEXIVE TRIGGER'S "THAT MANY" (CR 603.12): "When one or more nonland cards are exiled this way, put that many +1/+1
 * counters on target attacking creature" (Augusta, Order Returned) -- how many the resolution that made it did, counted
 * as it triggers, while there is that resolution to count; by the time it resolves there is only its own (effects/
 * permanents.mjs, immediateTrigger). Nothing else is bound: its targets are its own, chosen as it goes on the stack.
 */
export const countThisWay = (effects, context, state) => walkEffects(effects, (effect) => thisWayNow({...effect}, context, state));

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
  /* A MODE THAT MAY BE CHOSEN MORE THAN ONCE (`sameMode`, Moment of Reckoning; CR 700.2d): each time chosen, its own instance of
     "target" -- the same object or player as another's, or not -- so each target is a counted one of one, picked in turn once
     the offer is taken (rules/actions.mjs): a spell aimed four times at a crowded board is a handful of offers, not every
     product of its targets. */
  const each = (spec) => (modal.sameMode === true && spec.count === undefined ? {...spec, count: {min: 1, max: 1}} : spec);
  for (const index of modes ?? []) {
    const mode = modal.modes[index];
    if (!mode) continue;
    effects.push(...shift(structuredClone(mode.effects ?? []), targets.length));
    targets.push(...structuredClone(mode.targets ?? []).map(each));
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
    /* Nor an emblem's abilities' (CR 114.4: they are its own, compiled and checked as a card's are, cards/index.mjs). */
    if (value.effect === "emblem") return;
    Object.values(value).forEach(walk);
  };
  walk(effects);
  return found;
}

/* The primitives that do something TO what they are aimed at. Read by a pilot choosing among an offer's targets --
   aim these at an opponent's things, the rest at your own -- and by nothing in the rules. */
const HOSTILE = new Set(["destroy", "dealDamage", "moveZone", "tap", "counterSpell", "loseLife", "discard", "mill", "removeCounter",
  /* "Target player loses the game" (CR 104.3e): aimed at an opponent. */
  "loseGame"]);

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
  if (chosen.kind === "choose") return `${countWords(chosen)}${chosen.groupLabel ? ` ${chosen.groupLabel}` : ""}`;
  if (chosen.kind === "player") return state.players[chosen.id]?.name ?? `Seat ${chosen.id + 1}`;
  /* An ability on the stack: its source's, as the stack says it (a face-down source's has no name, CR 708.2a). */
  if (chosen.kind === "ability") {
    const entry = state.stack.find((e) => e.stackId === chosen.id);
    return entry ? `${entry.faceDown || !entry.name ? "An" : `${entry.name}'s`} ${entry.kind === "trigger" ? "triggered" : "activated"} ability` : "an ability, now gone";
  }
  /* A face-down permanent has no name (CR 708.2a): it is said to be face down. */
  return shownName(state.objects[chosen.id]);
}
