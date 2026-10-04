/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT A PLAYER MAY DO RIGHT NOW.
 *
 * `docs/engine/PLAN.md` §3.6: the `random-legal` pilot "picks uniformly from enumerated legal
 * actions". That sentence is the contract this file exists to keep, and the word that matters is
 * ENUMERATED.
 *
 * LEGALITY IS OFFERED, NOT ASSERTED. The engine lists what a player may do and refuses anything it
 * did not list. The alternative — a pilot that names an action and an engine that performs it if it
 * looks plausible — is how a pilot ends up playing two lands in a turn, or acting on somebody
 * else's, and nobody notices for a month because the board renders it perfectly. Refusing here also
 * means the house pilot, an API pilot and a browser seat are all held to the same rules by the same
 * code, rather than each being trusted to know them.
 *
 * PLAYING A LAND IS A SPECIAL ACTION (CR 116.2a, 305.1): it does not use the stack and cannot be
 * responded to. It is legal only while its player has priority, during a main phase of their own
 * turn, with an empty stack, and while they have a land drop left (CR 305.2). Every clause is a
 * separate way to get it wrong, so each is a separate line below.
 *
 * A MANA ABILITY NEVER TOUCHES THE STACK (CR 605.3a). It cannot be responded to, it resolves as it
 * is activated, and it may be activated any time its controller has priority — not only in a main
 * phase. Putting it on the stack is the most visible rules error an engine can make: every land tap
 * would become a window for instants and every game would play wrong from turn one.
 *
 * TIMING IS TWO RULES, NOT ONE. A sorcery-speed spell needs a main phase of its controller's own
 * turn with an empty stack (CR 307.1). An instant needs priority and nothing else (CR 304.1). Using
 * one test for both either forbids legal instants or allows sorceries during combat.
 *
 * WHAT IS DEFERRED AND IS NAMED RATHER THAN FAKED: CR 601.2g lets a player activate mana abilities
 * DURING casting, once the total cost is known. Here, tapping and casting are separate offered
 * actions — a legal sequence, and the one a human plays. A spell is offered when the POOL can pay
 * for it, not when the battlefield could, so the engine never offers a cast it cannot complete.
 * Automatic land-tapping belongs with the payment choice (§12.1 `payment.automaticEligible`).
 *
 * TARGETS ARE PART OF THE OFFER (phase 2.4, script/bind.mjs). A spell or ability with targets is offered once per
 * legal way to choose them (CR 601.2c, 602.2b), and `targets` is part of what identifies the action, so a pilot that
 * names one it was not offered is refused. With no legal choice it is not offered at all. `label` stays the card's
 * name; `targetNames` says what each choice is aimed at.
 *
 * A MANA ABILITY THAT CHOOSES (2.4b) is offered once per thing it can add, the way a spell is offered once per aim:
 * "{T}: Add {W} or {U}" is two offers, "any color" five, and "any color in your commander's color identity" as many as
 * that identity has -- none for a player with no commander (CR 903.4f). `produce` says which, and is part of what
 * identifies the offer. A mana ability may cost more than {T} (a Signet's {1}, a pain land's damage, a life paid),
 * and is offered only when that can be paid; it is still a mana ability, so all of it happens at once, off the stack
 * (CR 605.3a). Each offer carries `mana`, what it adds, so a caller can count without knowing the rules.
 *
 * NON-MANA ACTIVATED ABILITIES (CR 602) come from the card script: offered whenever their controller has priority
 * (or, for one marked `timing: "sorcery"`, when a sorcery could be cast), and only when every cost can be paid now.
 * The ability goes on the stack first and its costs are paid after (CR 602.2a, then 602.2b and 601.2h), so an ability that
 * sacrifices its own source still knows where it came from. The cost atoms built are `{T}`, `mana`, `payLife` and
 * `sacrifice` of the source itself; a card with any other is refused at prepare (cards/index.mjs).
 */

import {cardsIn, moveObject, usesThisTurn, recordUse, showFace} from "../state/index.mjs";
import {pushSpell, pushAbility, becameTarget} from "./stack.mjs";
import {addMana, spend, parseManaCost, automaticPayment, manaValue, poolSize, tapPlans, convokeCanPay, convokePayments} from "./mana.mjs";
import {commanderTax, recordCommanderCast, colorIdentity} from "./commander.mjs";
import {COLORS, MANA_KEYS} from "./mana.mjs";
import {summoningSick, hasFlash} from "../keywords/timing.mjs";
import {targetChoices, targetName, isHostile, modalScript, isChoosing, countOf, targetCandidates, countedChoice, inWords} from "../script/bind.mjs";
import {moveOne, sacrificeOne} from "../script/effects/zones.mjs";
import {compileSelector, matchesSelector, selectMatching} from "../script/filter.mjs";
import {runEffects} from "../script/effects/index.mjs";
import {changeLife} from "../script/effects/resources.mjs";
import {checkStateBasedActions, gameOver} from "./sba.mjs";
import {costReduction, costIncrease, playerStatics, freeCast, flashGranted, castForbidden} from "./statics.mjs";
import {countMana, amountOf, countEffect} from "../script/amount.mjs";
import {bindEffect} from "../script/bind.mjs";
import {conditionHolds} from "../script/condition.mjs";
import {lastKnown, characteristicsOf, abilitiesOf, deriving, keywordsOf, colorsOf} from "./layers.mjs";
import {namesChosen, withChosen, chosenFor} from "../script/chosen.mjs";
import {poolFor, spendFor, addRestricted} from "./restricted-mana.mjs";
import {askEntering} from "./entering.mjs";
import {collectTriggers, openTriggers, manaTriggered} from "./trigger.mjs";

const MAIN_PHASES = ["MAIN1", "MAIN2"];
/* CR 307.1 and 308.1: these are the card types that can only be cast at sorcery speed. */
const SORCERY_SPEED = ["Sorcery", "Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"];

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

const isLand = (object) => (object.types ?? []).includes("Land");
/* A modal double-faced card whose back face is a land, front face up (CR 712.12). */
const backLand = (object) => object.mdfc !== undefined && object.face !== "back" && (object.mdfc.back.types ?? []).includes("Land");

/* WHAT A SPELL COSTS TO CAST NOW (CR 601.2f): its mana cost plus the commander tax, less what "spells cost {N} less"
   takes off -- generic mana only, the printed generic first and then the tax, never below nothing. The offer and the
   payment read it here, so they cannot disagree. */
function castCost(state, player, id, tax, free = false, instead = null) {
  /* Without paying its mana cost (CR 118.9): nothing for the cost itself, and X is 0 (CR 107.3b); the tax still counts.
     `instead`, an alternative cost's mana (flashback, CR 702.34a): paid rather than the mana cost, reduced like it. */
  const cost = parseManaCost(free ? "" : instead ?? state.objects[id].manaCost);
  /* Increases first, then reductions (CR 601.2f): Thalia's {1} more and a Medallion's {1} less cancel out. A cast without
     paying its mana cost still pays an increase (CR 118.9d). */
  cost.generic += costIncrease(state, player, id);
  let reduction = costReduction(state, player, id);
  const fromPrinted = Math.min(cost.generic, reduction);
  cost.generic -= fromPrinted;
  reduction -= fromPrinted;
  return {cost, x: Math.max(0, tax - reduction)};
}

/**
 * FLASHBACK (CR 702.34a): what it costs to cast this card from its owner's graveyard, or null when it cannot be. Its own
 * keyword's cost, or -- given until end of turn ("each instant and sorcery card in your graveyard gains flashback",
 * Past in Flames) -- its mana cost. Only an instant or sorcery, and only from the caster's own graveyard. A cost that taps
 * creatures ("Flashback--Tap three untapped white creatures you control", Battle Screech) says how many and which
 * (`tap`); whether they are there is the offer's to ask (flashbackTappers).
 *
 * @returns {?{mana: string, life: number, tap?: {count: number, selector: object}}}
 */
export function flashbackCost(state, player, id) {
  const object = state.objects[id];
  if (!object || object.zone !== "graveyard" || object.owner !== player) return null;
  if (!(object.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) return null;
  const own = (object.abilities ?? []).find((a) => a.kind === "static" && a.rule === "flashback");
  const given = (state.effects ?? []).some((e) => e.rule === "flashback" && (e.affects?.ids ?? []).includes(id))
    /* "Each instant and sorcery card in your graveyard has flashback" (Lier): a permanent's static, its cost the card's mana cost. */
    || state.zones.battlefield.some((h) => (state.objects[h].abilities ?? []).some((a) => a.kind === "static" && a.rule === "flashback" && a.affects
      && matchesSelector({...a.affects, what: "card", zone: "graveyard"}, state, id, {controller: state.objects[h].controller, source: h})));
  const cost = own?.cost ?? (given ? [{atom: "mana", cost: object.manaCost ?? ""}] : null);
  if (!cost) return null;
  const tap = cost.find((a) => a.atom === "tapCreature");
  return {mana: cost.find((a) => a.atom === "mana")?.cost ?? "", life: cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0),
    ...(tap ? {tap: {count: tap.count ?? 1, selector: tap.selector ?? {}}} : {})};
}

/* The untapped creatures a player controls that a flashback cost may tap: each fits its selector ("white creatures"), a
   summoning-sick one too, since tapping it is not its own {T} (CR 302.6). */
export const flashbackTappers = (state, player, tap) => state.zones.battlefield.filter((id) => !state.objects[id].tapped
  && characteristicsOf(state, id).controller === player && characteristicsOf(state, id).types.includes("Creature")
  && compileSelector({...(tap?.selector ?? {}), what: "permanent"})(state, id, {controller: player, source: null}));
/* Whether a flashback cost can be paid in full but for its mana: the life, and enough creatures to tap (CR 118.3). */
const flashbackPayable = (state, player, back) => back.life <= state.players[player].life
  && (!back.tap || flashbackTappers(state, player, back.tap).length >= back.tap.count);
const COLOR_WORDS = {W: "white", U: "blue", B: "black", R: "red", G: "green"};
/** The creatures a flashback cost taps, as the card says them: "three untapped white creatures you control". */
export const tappersInWords = (tap) => `${inWords(tap.count)} untapped ${[...(tap.selector?.colors ?? []).map((c) => COLOR_WORDS[c] ?? c), ...(tap.selector?.subtypes ?? [])].join(" ")}${(tap.selector?.colors ?? []).length || (tap.selector?.subtypes ?? []).length ? " " : ""}creature${tap.count === 1 ? "" : "s"} you control`;

/**
 * ESCAPE (CR 702.138a): the ways this card may be cast from its owner's graveyard rather than for its mana cost, each
 * `{kind, mana, exile}`. "own" is the card's own escape. "given" is the escape a permanent gives it ("each nonland card in
 * your graveyard has escape", Underworld Breach): the card's mana cost and the other cards to exile. Two permanents that
 * give it make one way, the fewer cards. A way counts only while that many other cards are in the graveyard to exile.
 * A card without a mana cost is given none: a cost based on that mana cost cannot be paid (CR 118.6). A land card has no
 * mana cost, and cards/index.mjs refuses a land's own escape.
 *
 * @returns {Array<{kind: "own"|"given", mana: string, exile: number}>}
 */
export function escapeWays(state, player, id) {
  const object = state.objects[id];
  if (!object || object.zone !== "graveyard" || object.owner !== player) return [];
  const exileOf = (cost) => (cost ?? []).filter((a) => a.atom === "exileFromGraveyard").reduce((n, a) => n + (a.count ?? 1), 0);
  const ways = [];
  const own = (object.abilities ?? []).find((a) => a.kind === "static" && a.rule === "escape" && !a.affects?.zone);
  if (own) ways.push({kind: "own", mana: (own.cost ?? []).find((a) => a.atom === "mana")?.cost ?? "", exile: exileOf(own.cost)});
  const given = state.zones.battlefield.flatMap((h) => (state.objects[h].abilities ?? []).filter((a) => a.kind === "static" && a.rule === "escape" && a.affects?.zone === "graveyard"
    && matchesSelector({...a.affects, what: "card", zone: "graveyard"}, state, id, {controller: state.objects[h].controller, source: h})));
  if (given.length && object.manaCost) ways.push({kind: "given", mana: object.manaCost, exile: Math.min(...given.map((a) => exileOf(a.cost)))});
  const others = cardsIn(state, "graveyard", player).filter((c) => c !== id).length;
  return ways.filter((way) => way.exile <= others);
}

/**
 * The question a cast asks once it is taken, before anything is paid (CR 601.2h): which other cards of the graveyard an
 * escape exiles (CR 702.138a), or which creatures a flashback cost taps (CR 702.34a; "tap three untapped white creatures
 * you control", Battle Screech). `cost` says which: "exile" or "tap".
 */
/* CONVOKE (CR 702.51a): "each creature you tap while casting this spell pays for {1} or one mana of that creature's color".
   The untapped creatures a player controls, each with its colors as it is now: a summoning-sick one too, since tapping it
   is not its own {T} (CR 302.6). Not an additional or alternative cost (702.51b): it pays part of the total cost, the rest
   from the pool (rules/mana.mjs, convokePayments). */
const hasConvoke = (state, id) => keywordsOf(state, id).includes("Convoke");
export const convokers = (state, player) => state.zones.battlefield.filter((id) => !state.objects[id].tapped
  && characteristicsOf(state, id).controller === player && characteristicsOf(state, id).types.includes("Creature"))
  .map((id) => ({id, colors: colorsOf(state, id)}));
/* The total cost a convoked spell pays (CR 601.2f), its tax and reductions in, as castCost says it. */
function convokeCost(state, player, action) {
  const {cost, x} = castCost(state, player, action.objectId, action.tax ?? 0);
  return {...cost, generic: cost.generic + x};
}
/* The creatures a convoke picked, and what the pool pays besides: each untapped and the caster's, none twice, and one way
   for the pool to pay the rest. Refused before anything is tapped, saying what to do instead. */
function convoked(state, player, action, cost) {
  const name = state.objects[action.objectId]?.card ?? "That spell";
  const list = action.convokeTap;
  const fitting = new Map(convokers(state, player).map((c) => [c.id, c]));
  if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every((id) => fitting.has(id)))
    throw new Error(`Those are not untapped creatures you control: pick the creatures to tap for ${name} again`);
  const ways = convokePayments(poolFor(state, player, {spell: action.objectId}), cost, list.map((id) => fitting.get(id)), {life: state.players[player].life});
  if (ways.length === 0)
    throw new Error(`Those creatures and the mana in your pool cannot pay for ${name}: each creature pays {1} or one mana of its color. Pick other creatures, or add mana first`);
  if (ways.length > 1)
    throw new Error(`With those creatures, your pool could pay the rest of ${name} more than one way: pick creatures that leave one way, or spend the mana it should not use first`);
  return {ids: [...list], payment: ways[0]};
}

export function castCostChoice(state, awaiting) {
  const {action, player} = awaiting;
  const name = state.objects[action.objectId]?.card ?? "That card";
  /* Tapped for it (castTapPlans), with more than one way: which sources. */
  if (action.autoTap === true) {
    const options = castTapPlans(state, player, action, TAP_CHOICES).map((plan, index) => ({index, label: tapWords(state, plan)}));
    for (const option of options) {
      const alike = options.filter((o) => o.label === option.label);
      if (alike.length > 1) alike.forEach((o, k) => { o.label = `${o.label} (${k + 1})`; });
    }
    return {id: `choose-cost:${action.objectId}`, title: `${name}: what to tap for it`, mode: "one", min: 1, max: 1, cost: "mana", options};
  }
  const named = (ids) => {
    const options = ids.map((cardId, index) => ({index, label: state.objects[cardId].card, cardId}));
    /* Two that read alike, numbered: "Wastes (1)", "Wastes (2)". */
    for (const option of options) {
      const alike = options.filter((o) => o.label === option.label);
      if (alike.length > 1) alike.forEach((o, k) => { o.label = `${o.label} (${k + 1})`; });
    }
    return options;
  };
  /* Convoke (CR 702.51a): which of the caster's untapped creatures help pay -- as many as there are symbols they could pay,
     and none when the pool can pay it all. */
  if (action.convoke === true) {
    const cost = convokeCost(state, player, action), creatures = convokers(state, player);
    const symbols = cost.generic + cost.symbols.filter((s) => (s.kind === "colored" && s.color !== "C") || s.kind === "hybrid").length;
    const alone = automaticPayment(poolFor(state, player, {spell: action.objectId}), cost, {life: state.players[player].life}) !== null;
    return {id: `choose-cost:${action.objectId}`, title: `${name}: tap creatures to convoke it`, mode: "many", min: alone ? 0 : 1, max: Math.min(creatures.length, symbols),
      cost: "convoke", options: named(creatures.map((c) => c.id))};
  }
  if (action.escape === undefined) {
    const tap = flashbackCost(state, player, action.objectId)?.tap ?? {count: 0, selector: {}};
    return {id: `choose-cost:${action.objectId}`, title: `${name}'s flashback: tap ${tappersInWords(tap)}`, mode: "many", min: tap.count, max: tap.count, cost: "tap",
      options: named(flashbackTappers(state, player, tap))};
  }
  const n = escapeWays(state, player, action.objectId).find((way) => way.kind === action.escape)?.exile ?? 0;
  return {id: `choose-cost:${action.objectId}`, title: `${name}'s escape: exile ${inWords(n)} other card${n === 1 ? "" : "s"} from your graveyard`,
    mode: "many", min: n, max: n, cost: "exile", options: named(cardsIn(state, "graveyard", player).filter((id) => id !== action.objectId))};
}

/** What the cast's cost takes, picked: the cast taken with it, as it would have been had it been chosen with it (CR 601.2h). */
export function resolveCastCost(state, awaiting, indices) {
  const choice = castCostChoice(state, awaiting);
  const picked = [...new Set(indices ?? [])].sort((a, b) => a - b);
  /* Convoke's, any number from its least to its most; the others, exactly as many as they take. */
  const counted = choice.cost === "convoke" ? picked.length >= choice.min && picked.length <= choice.max : picked.length === choice.min;
  if (picked.length !== (indices ?? []).length || !counted || picked.some((i) => !choice.options[i]))
    throw new Error("Invalid selection");
  const ids = picked.map((i) => choice.options[i].cardId);
  const way = choice.cost === "mana" ? castTapPlans(state, awaiting.player, awaiting.action, TAP_CHOICES)[picked[0]] : null;
  const action = {...structuredClone(awaiting.action), ...(way ? {tapPlan: way.key} : choice.cost === "tap" ? {flashbackTap: ids}
    : choice.cost === "convoke" ? {convokeTap: ids} : {escapeExile: ids})};
  state.awaiting = null;
  state.priorityPlayer = awaiting.player;
  return applyAction(state, awaiting.player, action);
}

/* The creatures a flashback cost taps, as its caster picked them: that many, none twice, each untapped and fitting.
   Refused before anything moves. */
function flashbackTapped(state, player, action, tap) {
  const list = action.flashbackTap;
  const fitting = flashbackTappers(state, player, tap);
  if (!Array.isArray(list) || list.length !== tap.count || new Set(list).size !== list.length || !list.every((id) => fitting.includes(id)))
    throw new Error(`Those are not ${tappersInWords(tap)} for its flashback`);
  return [...list];
}

/* The cards an escape exiles, as its caster picked them: that many, none twice, each another card in their graveyard.
   Refused before anything moves. */
function escapeExiled(state, player, action, way) {
  const list = action.escapeExile;
  const others = cardsIn(state, "graveyard", player).filter((id) => id !== action.objectId);
  if (!Array.isArray(list) || list.length !== way.exile || new Set(list).size !== list.length || !list.every((id) => others.includes(id)))
    throw new Error(`Those are not ${inWords(way.exile)} other cards in that graveyard for its escape`);
  return [...list];
}

/**
 * ALTERNATIVE COSTS (CR 118.9): the card's own "rather than pay this spell's mana cost" statics whose condition holds now
 * for this player -- each as `{index, mana, life, extra, evoke}`: the mana paid instead ("" for none), the life, the atoms
 * chosen as it is cast (a card exiled from the hand, a permanent sacrificed), and whether it is an evoke cost (CR 702.74a).
 */
export function alternativeCosts(state, player, id) {
  const object = state.objects[id];
  return (object?.abilities ?? []).flatMap((ability, index) => {
    if (ability.kind !== "static" || ability.rule !== "alternative-cost") return [];
    if (!conditionHolds(state, ability.condition, {controller: player, source: id})) return [];
    const cost = ability.cost ?? [];
    return [{index, mana: cost.find((a) => a.atom === "mana")?.cost ?? "", life: cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0),
      extra: cost.filter((a) => a.atom === "exileFromHand" || a.atom === "sacrifice"), evoke: ability.evoke === true}];
  });
}

/* A spell's additional cost (CR 601.2b, 601.2h): "As an additional cost to cast this spell, discard a card" or
   "sacrifice a creature". The player chooses what as they cast, so each choice is its own offer, as targets are --
   one per card that could be discarded (never the spell itself) or permanent that could be sacrificed. An additional
   cost nobody could pay leaves the spell unoffered. */
function additionalChoices(state, player, spellId, costs) {
  let choices = [{}];
  for (const atom of costs ?? []) {
    let options = [];
    if (atom.atom === "discard") options = cardsIn(state, "hand", player).filter((id) => id !== spellId).map((id) => ({discard: id}));
    /* "Exile a blue card from your hand" (Force of Will): a card the selector describes, never the spell itself. */
    if (atom.atom === "exileFromHand") {
      const matches = compileSelector({...(atom.selector ?? {}), what: "card", zone: "hand", controller: "you"});
      options = cardsIn(state, "hand", player).filter((id) => id !== spellId && matches(state, id, {controller: player})).map((id) => ({exile: id}));
    }
    if (atom.atom === "sacrifice") {
      const alternatives = Array.isArray(atom.selector?.anyOf) ? atom.selector.anyOf : [atom.selector ?? {}];
      const matchers = alternatives.map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
      options = state.zones.battlefield.filter((id) => matchers.some((m) => m(state, id, {controller: player}))).map((id) => ({sacrifice: id}));
    }
    choices = choices.flatMap((chosen) => options.filter((o) => !Object.values(chosen).includes(Object.values(o)[0])).map((o) => ({...chosen, ...o})));
  }
  return choices;
}

/* MODES CHOSEN AS IT IS CAST (CR 700.2a, 601.2b): one offer per choice of modes -- as many as it says, or up to more
   when its condition holds now ("if you control a commander as you cast this spell, you may choose both instead") --
   and per way to choose the chosen modes' targets (601.2c), in the order of the modes. A mode is chosen once (700.2d). */
function withModes(state, base, modal, context) {
  const least = Math.max(1, modal.choose ?? 1);
  const most = Math.min(modal.modes.length, modal.more && conditionHolds(state, modal.more.condition, context) ? modal.more.choose : modal.upTo ?? least);
  const picks = [];
  const pick = (from, chosen) => {
    if (chosen.length >= least) picks.push(chosen);
    if (chosen.length === most) return;
    for (let i = from; i < modal.modes.length; i += 1) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return picks.flatMap((modes) => {
    const {targets: specs, effects} = modalScript(modal, modes);
    const hostile = isHostile(effects);
    return targetChoices(state, specs, context).map((targets) => ({...base, modes, targets, targetNames: targets.map((t) => targetName(state, t)), hostile}));
  });
}

/* One offer per way to choose the targets (script/bind.mjs); a single offer, unchanged, when there are none. */
function withTargets(state, base, ability, context) {
  const specs = ability?.targets ?? [];
  if (!specs.length) return [base];
  const hostile = ability.hostile === true || isHostile(ability.effects);
  return targetChoices(state, specs, context).map((targets) => ({
    ...base, targets, targetNames: targets.map((t) => targetName(state, t)), hostile,
  }));
}

/* The cost atoms 2.4 can pay. `costPayment` says whether all of an ability's can be paid now, and how. */
const COST_ATOMS_BUILT = ["{T}", "mana", "payLife", "sacrifice"];
export const costAtomBuilt = (atom) => (COST_ATOMS_BUILT.includes(atom?.atom) && (atom.atom !== "sacrifice" || atom.self === true || (atom.selector && typeof atom.selector === "object")))
  /* "Discard this card" (cycling, CR 702.29a): a card's ability activated from its owner's hand. */
  || (atom?.atom === "discard" && atom.self === true)
  /* "{1}{R}, Discard a card: Draw a card" (Glint-Horn Buccaneer): which card is chosen as it is activated, one offer each. */
  || (atom?.atom === "discard" && atom.self !== true)
  /* "Return a Forest you control to its owner's hand" (Quirion Ranger): which one is chosen as it is activated, like a
     sacrifice -- each its own offer. */
  || (atom?.atom === "returnToHand" && Boolean(atom.selector) && typeof atom.selector === "object")
  /* "Put a -0/-1 counter on this creature" (Wall of Roots), "remove five +1/+1 counters from Ramos": counters on the
     source itself; a removal it cannot make, it cannot pay (CR 118.3). */
  || (["addCounters", "removeCounters"].includes(atom?.atom) && atom.self === true && typeof atom.counter === "string")
  /* "Crew 3": other untapped creatures with total power 3 or more, the player's choice (crewChoices). */
  || (atom?.atom === "crew" && Number.isInteger(atom.power) && atom.power >= 0)
  /* "Tap another untapped creature you control" (station, CR 702.184a): which one, chosen as it is activated (tapChoices). */
  || (atom?.atom === "tapCreature" && Boolean(atom.selector) && typeof atom.selector === "object")
  /* "Untap a tapped creature you control", "untap two" (Halo Fountain, batch 75): which, chosen as it is activated (untapChoices). */
  || (atom?.atom === "untapCreature" && Number.isInteger(atom.count) && atom.count >= 1)
  /* "Exile this card from your graveyard" (encore, CR 702.141a): an ability of the card in its owner's graveyard. */
  || (atom?.atom === "exileFromGraveyard" && atom.self === true);

/* CREW (CR 702.122a): the sets of other untapped creatures you control whose power totals at least N -- each smallest
   such set, so no offer taps a creature it does not need; ids ascending, and no more than CREW_OFFERS_MAX of them. A
   summoning-sick creature may crew. "This token crews Vehicles as though its power were 2 greater" (`crews-with-more`). */
const CREW_OFFERS_MAX = 64;
const crewPower = (state, id) => Math.max(0, characteristicsOf(state, id).power ?? 0)
  + (state.objects[id].abilities ?? []).filter((a) => a.kind === "static" && a.rule === "crews-with-more").reduce((n, a) => n + (a.amount ?? 0), 0);
function crewChoices(state, player, vehicle, power) {
  const crew = state.zones.battlefield.filter((id) => id !== vehicle && state.objects[id].controller === player && !state.objects[id].tapped
    && characteristicsOf(state, id).types.includes("Creature")).sort((a, b) => a - b);
  const sets = [];
  const walk = (from, chosen, total) => {
    if (sets.length >= CREW_OFFERS_MAX) return;
    if (total >= power) { sets.push(chosen); return; }
    for (let i = from; i < crew.length; i += 1) walk(i + 1, [...chosen, crew[i]], total + crewPower(state, crew[i]));
  };
  walk(0, [], 0);
  /* Smallest: no set that has another set in it -- a creature it could leave untapped. */
  return sets.filter((set) => !sets.some((other) => other !== set && other.length < set.length && other.every((id) => set.includes(id))));
}
const crewAtom = (cost) => (cost ?? []).find((a) => a?.atom === "crew");
const untapAtom = (cost) => (cost ?? []).find((a) => a?.atom === "untapCreature");
/* "Untap a tapped creature you control", "untap fifteen tapped creatures you control": each set of that many tapped
   creatures the player controls, ids ascending, no more than CREW_OFFERS_MAX of them (as crew); too few, and none. */
function untapChoices(state, player, count) {
  const tapped = state.zones.battlefield.filter((id) => state.objects[id].tapped
    && characteristicsOf(state, id).controller === player && characteristicsOf(state, id).types.includes("Creature")).sort((a, b) => a - b);
  const sets = [];
  const walk = (from, chosen) => {
    if (sets.length >= CREW_OFFERS_MAX) return;
    if (chosen.length === count) { sets.push(chosen); return; }
    for (let i = from; i < tapped.length; i += 1) walk(i + 1, [...chosen, tapped[i]]);
  };
  walk(0, []);
  return sets;
}
const tapAtom = (cost) => (cost ?? []).find((a) => a?.atom === "tapCreature");
/* "Tap another untapped creature you control": each one it may be, one offer each -- a summoning-sick one too, since it is
   not its own {T} (CR 302.6). */
const tapChoices = (state, player, sourceId, selector) => state.zones.battlefield.filter((id) => id !== sourceId && state.objects[id].controller === player
  && !state.objects[id].tapped && compileSelector({...selector, what: "permanent"})(state, id, {controller: player, source: sourceId}));

/* Whether an ability is within its limit this turn ("activate only once each turn", CR 602.5b), and an exhaust ability
   not yet activated by this object (CR 702.177a). */
const withinLimit = (state, id, ability) => (!ability.limit || usesThisTurn(state, id, ability.id) < ability.limit)
  && !(ability.exhaust && (state.objects[id]?.exhausted ?? []).includes(ability.id));
/* Whether a mana ability's counters can be paid: every removal has the counters to remove. */
const countersPayable = (state, id, costs) => (costs ?? []).every((c) => c.put || (state.objects[id].counters?.[c.counter] ?? 0) >= c.count);
function payCounters(state, id, costs) {
  const counters = state.objects[id].counters;
  for (const c of costs ?? []) counters[c.counter] = Math.max(0, (counters[c.counter] ?? 0) + (c.put ? c.count : -c.count));
}

/* "Sacrifice a creature: ..." (Viscera Seer, Ashnod's Altar, Phyrexian Tower): a cost the player chooses as they activate
   (CR 602.2b, 601.2h), so each permanent they could sacrifice is its own offer, as with a spell's additional cost. Only
   their own (CR 701.21a); "another" leaves out the source itself. */
function sacrificeChoices(state, player, sourceId, given) {
  /* "Sacrifice a creature of the chosen type" (Etchings of the Chosen): its source's choice. */
  const selector = namesChosen(given) ? withChosen(given, state.objects[sourceId]?.chosen) : given;
  const matches = (Array.isArray(selector?.anyOf) ? selector.anyOf : [selector ?? {}])
    .map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
  return state.zones.battlefield.filter((id) => matches.some((m) => m(state, id, {controller: player, source: sourceId})));
}
const sacrificeAtom = (cost) => (cost ?? []).find((a) => a?.atom === "sacrifice" && a.selector);
const returnAtom = (cost) => (cost ?? []).find((a) => a?.atom === "returnToHand" && a.selector);
const discardAtom = (cost) => (cost ?? []).find((a) => a?.atom === "discard" && a.self !== true);
/* "Discard two cards" (Solphim, batch 70's next): each set of `count` cards in the hand, never the source itself, one offer
   each -- a single card as itself, as a one-card discard always was; none, and the ability can't be activated. */
function discardSets(cards, count) {
  if (count <= 1) return cards.map((c) => c);
  const sets = [];
  const walk = (from, chosen) => {
    if (chosen.length === count) { sets.push([...chosen]); return; }
    for (let i = from; i < cards.length; i += 1) walk(i + 1, [...chosen, cards[i]]);
  };
  walk(0, []);
  return sets;
}

function costPayment(state, player, id, cost, x = 0, less = 0) {
  const object = state.objects[id];
  let mana = null, life = 0;
  for (const atom of cost ?? []) {
    if (!costAtomBuilt(atom)) return null;
    if (atom.atom === "discard" && atom.self === true && object.zone !== "hand") return null;
    if (atom.atom === "{T}") {
      if (object.tapped) return null;
      /* CR 302.6: a creature's {T} ability waits until it has been yours since your turn began. */
      if (summoningSick(state, id)) return null;
    }
    if (atom.atom === "mana") {
      if (mana) return null;
      const printed = parseManaCost(atom.cost);
      /* Generic mana only, never below nothing (CR 601.2f). */
      printed.generic -= Math.min(printed.generic, Math.max(0, less));
      /* {X} in an ability's cost: X generic for each X symbol (CR 107.3, 602.2b). */
      /* The pool, and mana that may be spent only on an ability of this source (rules/restricted-mana.mjs). */
      mana = automaticPayment(poolFor(state, player, {ability: id}), printed, {life: state.players[player].life, x: x * printed.variable});
      if (!mana) return null;
    }
    /* CR 119.4: a player can pay life only if their life total is at least the amount. */
    if (atom.atom === "payLife") life += atom.amount ?? 0;
    if (atom.atom === "removeCounters" && (object.counters?.[atom.counter] ?? 0) < (atom.count ?? 1)) return null;
  }
  if (life + (mana?.life ?? 0) > state.players[player].life) return null;
  return {mana, life};
}

/**
 * A player's commander's color identity (CR 903.4): the union of their commanders' (702.124c), as established when the
 * game began (903.4a) -- the identity the definition carried, or read off the printed cost for an object without one.
 * Empty for a player with no commander, which is what makes "any color in your commander's identity" add nothing.
 */
export function commanderIdentity(state, player) {
  const found = new Set();
  for (const object of Object.values(state.objects)) {
    if (object.commander !== true || object.owner !== player) continue;
    for (const color of object.colorIdentity ?? colorIdentity({manaCost: object.manaCost})) found.add(color);
  }
  return COLORS.filter((color) => found.has(color));
}

/** What a mana ability can add, one entry per alternative (2.4b); a counted amount counted now ("{G} for each creature you control"). */
export function manaAlternatives(state, player, given, source = null) {
  /* "An amount of mana of that color equal to the number of creatures you control of the chosen type" (Three Tree City):
     its own choice. */
  const ability = chosenFor(given, state.objects[source]);
  const context = {controller: player, source};
  const count = amountOf(state, ability.count ?? 1, context);
  if (Array.isArray(ability.produces)) return ability.produces.map((m) => countMana(state, {...m}, context));
  if (ability.produces) return [countMana(state, {...ability.produces}, context)];
  if (ability.anyColor === true) return COLORS.map((color) => ({[color]: count}));
  if (ability.anyColor === "identity") return commanderIdentity(state, player).map((color) => ({[color]: count}));
  /* "Two mana in any combination of colors" (Great Hall of the Citadel): each way to make it, an offer each. */
  /* "In any combination of {U} and/or {R}" (Vivi Ornitier): of those colors only. */
  if (ability.anyCombination) return combinations(count, 0, Array.isArray(ability.anyCombination) ? COLORS.filter((c) => ability.anyCombination.includes(c)) : COLORS);
  /* "Any color that a land an opponent controls could produce" (Exotic Orchard), "any type ... a land you control"
     (Reflecting Pool, `anyType`, colorless too): what those lands' own mana abilities could add, now -- never another
     such ability's (CR 106.7), so two Reflecting Pools do not feed each other. */
  if (ability.reflect) {
    const kinds = new Set();
    for (const id of selectMatching(state, ability.reflect, context))
      for (const theirs of state.objects[id].abilities ?? [])
        if (theirs.kind === "mana" && !theirs.reflect && !theirs.among) for (const m of manaAlternatives(state, state.objects[id].controller, theirs, id)) for (const k of Object.keys(m)) kinds.add(k);
    return [...COLORS, ...(ability.anyType ? ["C"] : [])].filter((k) => kinds.has(k)).map((k) => ({[k]: count}));
  }
  /* "Any color among legendary creatures and planeswalkers you control" (Mox Amber), "among legendary creature cards in
     your graveyard": their colors, now. */
  if (ability.among) {
    const colors = new Set(selectMatching(state, ability.among, context).flatMap((id) => (state.objects[id].zone === "battlefield" ? characteristicsOf(state, id).colors : state.objects[id].colors) ?? []));
    return COLORS.filter((c) => colors.has(c)).map((c) => ({[c]: count}));
  }
  return [];
}

/* Whether a mana ability's cost beyond {T} can be paid now: mana from the pool (unambiguously, as a cast's), and life. */
function manaAbilityPayment(state, player, ability) {
  const pool = state.players[player].manaPool;
  const mana = ability.cost ? automaticPayment(pool, parseManaCost(ability.cost), {life: state.players[player].life}) : {mana: {}, life: 0};
  if (!mana) return null;
  if ((ability.payLife ?? 0) + mana.life > state.players[player].life) return null;
  return mana;
}

const total = (mana) => Object.values(mana ?? {}).reduce((n, v) => n + v, 0);
/* Every way to make `n` mana of the five colors, each once: {W: 2}, {W: 1, U: 1}, ... -- 15 ways for two. */
const combinations = (n, from = 0, colors = COLORS) => (n <= 0 ? [{}]
  : colors.slice(from).flatMap((color, i) => combinations(n - 1, from + i, colors).map((rest) => ({[color]: (rest[color] ?? 0) + 1, ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== color))}))));

/* The values X may take for a cost with {X} (CR 107.3): nothing up to what the pool holds past the rest of the cost,
   each X symbol taking X (CR 107.3a). A cost without X: the one null. `extra` is generic already owed (the tax). */
function xValues(pool, cost, extra = 0) {
  if (!cost.variable) return [null];
  const rest = cost.symbols.filter((s) => s.kind !== "variable" && s.kind !== "generic").length + cost.generic + extra;
  const most = Math.floor((poolSize(pool) - rest) / cost.variable);
  return most < 0 ? [] : Array.from({length: most + 1}, (_, i) => i);
}
const abilityLess = (state, player, id, ability) => (ability.costLess === undefined ? 0 : amountOf(state, ability.costLess, {controller: player, source: id}));
function abilityXValues(state, player, ability, id) {
  const atom = (ability.cost ?? []).find((a) => a?.atom === "mana");
  return atom ? xValues(poolFor(state, player, {ability: id}), parseManaCost(atom.cost)) : [null];
}

/** How many lands this player may still play this turn. CR 305.2; effects raise the allowance. */
/* "You may play an additional land this turn" (Hearthhull): an effect for the turn (effects/permanents.mjs, effectUntil). */
const landDropsLeft = (state, player) => (state.players[player].landAllowance ?? 1) + playerStatics(state, "extra-land-drop", player).length
  + (state.effects ?? []).filter((e) => e.rule === "extra-land-drop" && e.sourceController === player).length - state.players[player].landsPlayed;

/* What a spell cast from the top of a library by a permanent's permission gains as it resolves: the `gains` of the first
   "play-from" ability whose spells it fits ("it gains haste until end of turn"). */
function castFromTopGains(state, player, id) {
  for (const {ability} of playerStatics(state, "play-from", player)) {
    if (ability.zone !== "library-top" || !ability.spells || !ability.gains) continue;
    const which = ability.spells;
    if (which === true || matchesSelector({...which, what: "card", zone: "library"}, state, id, {controller: player})) return [...ability.gains];
  }
  return [];
}

/* WHAT A PLAYER MAY PLAY FROM ANOTHER ZONE (CR 601.2a, 305.1), by their permanents' static abilities: lands from the
   graveyard, the top card of the library, a card that says it may be cast from its graveyard or exile. `lands` and
   `spells` are each true or a selector the card must match. One list, read by the land offer and the cast offer. */
/* "Once during each of your turns" (Kess, Gisa and Geralf): a permission that says `yourTurn` is open only on its holder's
   turns, and one with a `limit` only until this source has been used that many times this turn (recordUse, as a card is
   played through it). */
const playKey = (ability) => `play-from:${ability.id}`;
const permissionOpen = (state, player, ability, source) => (!ability.yourTurn || state.activePlayer === player)
  && (ability.limit === undefined || usesThisTurn(state, source, playKey(ability)) < ability.limit);
const permits = (state, player, ability, id, kind) => {
  const which = kind === "land" ? ability.lands : ability.spells;
  return Boolean(which) && isLand(state.objects[id]) === (kind === "land")
    && (which === true || (typeof which === "object" && matchesSelector({...which, what: "card", zone: state.objects[id].zone}, state, id, {controller: player})));
};
const permittedFrom = (state, player, ability) => (ability.zone === "graveyard" ? cardsIn(state, "graveyard", player)
  : ability.zone === "library-top" ? cardsIn(state, "library", player).slice(0, 1) : []);
/* The permission a card is played through: one with no limit first, so a limited one is spent only when it must be. */
function playPermission(state, player, id, kind) {
  const open = playerStatics(state, "play-from", player)
    .filter(({ability, source}) => permissionOpen(state, player, ability, source) && permittedFrom(state, player, ability).includes(id) && permits(state, player, ability, id, kind));
  return open.find(({ability}) => ability.limit === undefined) ?? open[0] ?? null;
}

function playableElsewhere(state, player, kind) {
  const found = [];
  for (const {ability, source} of playerStatics(state, "play-from", player)) {
    if (!permissionOpen(state, player, ability, source)) continue;
    for (const id of permittedFrom(state, player, ability)) if (permits(state, player, ability, id, kind) && !found.includes(id)) found.push(id);
  }
  if (kind === "spell") for (const zone of ["graveyard", "exile"]) {
    const ids = zone === "exile" ? state.zones.exile.filter((id) => state.objects[id].owner === player) : cardsIn(state, zone, player);
    for (const id of ids) if ((state.objects[id].abilities ?? []).some((a) => a.kind === "static" && a.rule === "cast-self-from" && (a.zones ?? []).includes(zone)) && !found.includes(id)) found.push(id);
  }
  /* "Until the end of your next turn, you may play that card" (script/effects/zones.mjs, mayPlay): the cards an effect let
     this player play, while each is still the object it named (CR 400.7) -- a land, or a spell ("you may cast" one only). */
  for (const effect of state.effects ?? []) {
    if (effect.rule !== "may-play" || effect.player !== player || (kind === "land" && effect.spellsOnly)) continue;
    for (const id of effect.affects.ids)
      if (state.objects[id] && !["battlefield", "stack"].includes(state.objects[id].zone) && isLand(state.objects[id]) === (kind === "land") && !found.includes(id)) found.push(id);
  }
  return found;
}

/**
 * Every action the given player may legally take at this instant.
 *
 * A player who does not hold priority gets an empty list — not a list containing "pass", because
 * they cannot pass either. An empty list is the honest answer to "what may you do", and a caller
 * that treats it as "nothing to do" is right.
 */
/** Its mana abilities' activations, each an offer (CR 605.3a): any time the player has priority, whatever the step. */
function manaOffers(state, player) {
  const actions = [];
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (object.controller !== player) continue;
    /* Its abilities now: its own and any given it (layers.mjs). */
    for (const ability of abilitiesOf(state, id)) {
      if (ability.kind !== "mana") continue;
      if (ability.tapSelf && object.tapped) continue;
      /* CR 302.6: a creature's {T} ability waits until it has been yours since your turn began, unless it has haste.
         A land is never sick; a land animated this turn is a creature, and is. */
      if (ability.tapSelf && summoningSick(state, id)) continue;
      /* "Activate only if you control a Swamp" (CR 602.5b): asked as it would be offered. */
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      if (!manaAbilityPayment(state, player, ability)) continue;
      /* "Activate only once each turn" (Wall of Roots), and counters it cannot remove (Ramos). */
      if (!withinLimit(state, id, ability) || !countersPayable(state, id, ability.counterCost)) continue;
      const alternatives = manaAlternatives(state, player, ability, id);
      const fodder = ability.sacrifice ? sacrificeChoices(state, player, id, ability.sacrifice).map((x) => ({sacrifice: x})) : [null];
      for (const costChoice of fodder) alternatives.forEach((mana, produce) => actions.push({
        kind: "activate-mana", objectId: id, abilityId: ability.id, label: object.card, mana,
        /* A fixed ability is one offer and looks as it always has; a choice says which it is. */
        ...(alternatives.length > 1 || Array.isArray(ability.produces) || ability.anyColor || ability.reflect || ability.among ? {produce} : {}),
        ...(costChoice ? {costChoice, costNames: [state.objects[costChoice.sacrifice].card]} : {}),
      }));
    }
  }
  return actions;
}

/**
 * THE SOURCES A CAST MAY TAP (rules/mana.mjs, tapPlans): each untapped source whose mana ability is offered now and asks
 * nothing but {T} -- no mana, life, sacrifice or counters, nothing else done (a painland's damage), nor a restriction on
 * what its mana is spent on -- for one mana. Each `{id, colors, via}`: the colors it can make, and for each the
 * activation that makes it.
 */
export function tapUnits(state, player, offered = manaOffers(state, player)) {
  const units = new Map();
  for (const offer of offered) {
    if (offer.costChoice) continue;
    const ability = abilitiesOf(state, offer.objectId).find((a) => a.id === offer.abilityId);
    if (!ability?.tapSelf || ability.cost || ability.payLife || ability.then || ability.sacrifice || ability.sacrificeSelf || ability.counterCost || ability.spendOnly) continue;
    const made = Object.entries(offer.mana ?? {}).filter(([, n]) => n > 0);
    if (made.length !== 1 || made[0][1] !== 1) continue;
    const color = made[0][0];
    if (!units.has(offer.objectId)) units.set(offer.objectId, {id: offer.objectId, colors: [], via: {}});
    const unit = units.get(offer.objectId);
    if (unit.via[color]) continue;
    unit.colors.push(color);
    unit.via[color] = {abilityId: offer.abilityId, ...(offer.produce !== undefined ? {produce: offer.produce} : {})};
  }
  return [...units.values()];
}

/* A cast that may tap for itself: from the hand or the command zone, its mana cost (and a commander's tax) paid, with
   nothing in the pool -- so the mana tapped is exactly the cost, and paying it is no further choice. */
const tapCastable = (state, player, action) => ["hand", "command"].includes(action.from) && !action.free && !action.flashback
  && action.escape === undefined && action.alternative === undefined && action.x === undefined
  && poolSize(poolFor(state, player, {spell: action.objectId})) === 0;

/** How many ways to tap for a cast are asked at most: the least flexible first (tapPlans), so the sensible ones. */
const TAP_CHOICES = 24;
/** A way to tap, in words: the sources' names, in the order they are tapped ("Forest, Forest, Island"). */
export const tapWords = (state, plan) => plan.taps.map((t) => state.objects[t.id]?.card ?? "a source").join(", ");

/** The ways to tap for this cast (`action.autoTap`), up to `limit`, as `tapPlans` says them. */
export function castTapPlans(state, player, action, limit = 2) {
  if (!tapCastable(state, player, action)) return [];
  const tax = action.from === "command" ? commanderTax(state, player, action.objectId) : 0;
  const {cost, x} = castCost(state, player, action.objectId, tax, false, null);
  return tapPlans(tapUnits(state, player), {...cost, generic: cost.generic + x}, limit);
}

export function legalActions(state, player) {
  /* It only reads: every object it derives, derived once (rules/layers.mjs, deriving). */
  return deriving(state, () => offers(state, player));
}
function offers(state, player) {
  if (state.priorityPlayer !== player) return [];

  const actions = [{kind: "pass"}];

  /* CR 116.2a and 305.1. All four conditions, each of which is a real way to be wrong. */
  if (player === state.activePlayer
      && MAIN_PHASES.includes(state.phase)
      && state.stack.length === 0
      && landDropsLeft(state, player) > 0) {
    for (const id of cardsIn(state, "hand", player)) {
      if (isLand(state.objects[id])) actions.push({kind: "play-land", objectId: id, label: state.objects[id].card});
      /* A modal double-faced card with a land on its back (CR 712.12): played with that face up. */
      if (backLand(state.objects[id])) actions.push({kind: "play-land", objectId: id, label: state.objects[id].mdfc.back.card, face: "back"});
    }
    /* From the graveyard, or the top of the library, when a permanent says so: the same land drop (CR 305.2). */
    for (const id of playableElsewhere(state, player, "land")) actions.push({kind: "play-land", objectId: id, label: state.objects[id].card, from: state.objects[id].zone});
  }

  /* CR 605.3a: any time you have priority, whatever the step. */
  const mana = manaOffers(state, player);
  actions.push(...mana);
  /* What a cast could tap, read once and only if a cast asks (castTapPlans). */
  let units = null;
  const tappable = () => (units ??= tapUnits(state, player, mana));

  /* CR 601.2. Offered only when the pool can pay: the engine does not offer what it cannot do.
     A commander is castable from the COMMAND ZONE as well as from hand (CR 903.8), and its tax is
     part of the cost — so a taxed commander a player cannot afford is never offered, rather than
     offered and refused at payment. */
  const castable = [
    ...cardsIn(state, "hand", player).map((id) => ({id, from: "hand"})),
    ...playableElsewhere(state, player, "spell").map((id) => ({id, from: state.objects[id].zone})),
    ...cardsIn(state, "command", player)
      .filter((id) => state.objects[id].commander === true)
      .map((id) => ({id, from: "command"})),
    /* Flashback (CR 702.34a): from the graveyard, for the flashback cost. */
    ...cardsIn(state, "graveyard", player).filter((id) => flashbackCost(state, player, id)).map((id) => ({id, from: "graveyard", flashback: true})),
    /* Escape (CR 702.138a): from the graveyard, for an escape cost -- each way one offer, its other cards picked once it is
       taken (`castCostChoice`), never one offer per set of them. */
    ...cardsIn(state, "graveyard", player).flatMap((id) => escapeWays(state, player, id).map((way) => ({id, from: "graveyard", escape: way.kind}))),
  ];
  for (const {id, from, flashback, escape} of castable) {
    const object = state.objects[id];
    if (!object.manaCost) continue;
    /* "Can't cast" (castForbidden): from a graveyard, during its controller's turn, more than one each turn. */
    if (castForbidden(state, player, id)) continue;
    if (sorcerySpeed(object) && !hasFlash(state, id) && !flashGranted(state, player, id) && !(player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0))
      continue;
    const tax = from === "command" ? commanderTax(state, player, id) : 0;
    /* "Without paying its mana cost": offered alone when it may be used every time; beside the paid cast when it is "once
       each turn", so the player decides which spell spends it. */
    const free = flashback || escape ? null : freeCast(state, player, id);
    /* Its own alternative costs (CR 118.9), each an offer of its own -- never with flashback, escape or a free cast (118.9a). */
    const alternatives = flashback || escape ? [] : alternativeCosts(state, player, id);
    /* The flashback cost instead of the mana cost, and its life: a player can pay life only if their total is at least
       that much (CR 119.4). */
    const back = flashback ? flashbackCost(state, player, id) : null;
    if (back && !flashbackPayable(state, player, back)) continue;
    /* The escape cost's mana instead of the mana cost (CR 702.138a); its cards are picked once the offer is taken. */
    const fled = escape ? escapeWays(state, player, id).find((w) => w.kind === escape) ?? null : null;
    for (const way of [null, ...alternatives]) {
    if (way && way.life > state.players[player].life) continue;
    for (const freely of way ? [false] : free ? (free.limited ? [false, true] : [true]) : [false]) {
    const {cost, x} = castCost(state, player, id, tax, freely, back ? back.mana : fled ? fled.mana : way ? way.mana : null);
    /* {X} (CR 107.3, 601.2b): one offer per value the pool can pay, from nothing up; a spell without X, one. */
    /* The pool, and mana that may be spent only on this spell (rules/restricted-mana.mjs). */
    const pool = poolFor(state, player, {spell: id});
    for (const X of xValues(pool, cost, x)) {
      let payment = automaticPayment(pool, cost, {life: state.players[player].life - (back?.life ?? 0) - (way?.life ?? 0), x: x + (X ?? 0) * cost.variable});
      /* Not from the pool, but by tapping for it (castTapPlans): one offer, its sources tapped as it is cast -- with more
         than one way to tap, the caster is asked which once it is taken (castCostChoice). */
      let autoTap = false;
      if (!payment && X === null && !freely && !back && !fled && !way && ["hand", "command"].includes(from) && poolSize(pool) === 0) {
        const [plan] = tapPlans(tappable(), {...cost, generic: cost.generic + x}, 1);
        if (plan) {
          autoTap = true;
          payment = {mana: Object.fromEntries(MANA_KEYS.map((k) => [k, plan.taps.filter((t) => t.color === k).length])), life: 0};
        }
      }
      /* CONVOKE (CR 702.51a): the caster's creatures help pay, and the pool the rest -- one offer, beside any the pool or its
         sources pay alone, when the pool and their untapped creatures could pay it together; which creatures, picked once it
         is taken (castCostChoice). Not with {X}, without paying its mana cost, or with another way to pay. */
      const convokes = X === null && !freely && !back && !fled && !way && hasConvoke(state, id)
        && convokeCanPay(pool, {...cost, generic: cost.generic + x}, convokers(state, player));
      if (!payment && !convokes) continue;
      const extra = [...(object.spell?.additionalCost ?? []), ...(way?.extra ?? [])];
      const paysFor = extra.length ? additionalChoices(state, player, id, extra) : [null];
      for (const convoke of [...(payment ? [false] : []), ...(convokes ? [true] : [])])
      for (const costChoice of paysFor) {
        const base = {kind: "cast", objectId: id, label: object.card, payment: convoke ? null : payment, from, tax, ...(X !== null ? {x: X} : {}), ...(autoTap && !convoke ? {autoTap: true} : {}),
          ...(convoke ? {convoke: true} : {}),
          ...(costChoice ? {costChoice, costNames: Object.values(costChoice).map((c) => state.objects[c].card)} : {}),
          ...(freely ? {free: true} : {}), ...(back ? {flashback: true} : {}), ...(fled ? {escape: fled.kind} : {}), ...(way ? {alternative: way.index} : {})};
        actions.push(...(object.spell?.modal ? withModes(state, base, object.spell.modal, {controller: player, source: id}) : withTargets(state, base, object.spell, {controller: player, source: id})));
      }
    }
    }
    }
  }

  /* CR 602.2: a permanent's activated abilities, whenever its controller has priority; a sorcery-speed one only
     when a sorcery could be cast. */
  const sorceryTime = player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0;
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (object.controller !== player) continue;
    for (const ability of abilitiesOf(state, id)) {
      /* An ability of the card in its owner's hand (cycling, ninjutsu) or graveyard (encore) is not the permanent's (CR 602.2,
         702.29a, 702.141a). */
      if (ability.kind !== "activated" || ability.zone === "hand" || ability.zone === "graveyard") continue;
      if (ability.timing === "sorcery" && !sorceryTime) continue;
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      if (!withinLimit(state, id, ability)) continue;
      /* A loyalty ability: only if none of this permanent's has been activated this turn (CR 606.3). */
      if (ability.loyalty !== undefined && usesThisTurn(state, id, "loyalty") > 0) continue;
      for (const X of abilityXValues(state, player, ability, id)) {
        const payment = costPayment(state, player, id, ability.cost, X ?? 0, abilityLess(state, player, id, ability));
        if (!payment) continue;
        const atom = sacrificeAtom(ability.cost), back = returnAtom(ability.cost), toss = discardAtom(ability.cost);
        /* A permanent you control to sacrifice, or to return to its owner's hand, or a card in your hand to discard: one
           offer each (CR 602.2b). No card to discard, and the ability can't be activated. */
        const crew = crewAtom(ability.cost), tapper = tapAtom(ability.cost), untapper = untapAtom(ability.cost);
        /* "Sacrifice two other creatures" (Priest of Forgotten Gods): each set of `count` of them, one offer each, as the
           cards of "discard two cards" are; fewer than that there, and it can't be activated. */
        const fodder = atom ? discardSets(sacrificeChoices(state, player, id, atom.selector), atom.count ?? 1).map((s) => ({sacrifice: s}))
          : back ? sacrificeChoices(state, player, id, back.selector).map((r) => ({returnToHand: r}))
          /* "Discard a creature card" (Fauna Shaman): only a card its selector describes. */
          : toss ? discardSets(cardsIn(state, "hand", player).filter((c) => c !== id && (!toss.selector || compileSelector({...toss.selector, what: "card", zone: "hand"})(state, c, {controller: player, source: id}))),
            toss.count ?? 1).map((d) => ({discard: d}))
          : crew ? crewChoices(state, player, id, crew.power).map((set) => ({crew: set}))
          : tapper ? tapChoices(state, player, id, tapper.selector).map((t) => ({tap: t}))
          : untapper ? untapChoices(state, player, untapper.count).map((set) => ({untap: set})) : [null];
        for (const costChoice of fodder)
          actions.push(...withTargets(state, {kind: "activate", objectId: id, abilityId: ability.id, label: object.card, text: ability.text, payment, ...(X !== null ? {x: X} : {}),
            /* A loyalty ability says its loyalty cost (CR 606.4), for a pilot to weigh. */
            ...(ability.loyalty !== undefined ? {loyalty: ability.loyalty} : {}),
            ...(costChoice ? {costChoice, costNames: costChoice.crew ? costChoice.crew.map((c) => state.objects[c].card)
              : costChoice.untap ? costChoice.untap.map((c) => state.objects[c].card)
              : Array.isArray(costChoice.discard) ? costChoice.discard.map((c) => state.objects[c].card)
              : Array.isArray(costChoice.sacrifice) ? costChoice.sacrifice.map((c) => state.objects[c].card)
              : [state.objects[costChoice.sacrifice ?? costChoice.returnToHand ?? costChoice.discard ?? costChoice.tap].card]} : {})}, ability,
            /* "With mana value X": the X of this offer (script/filter.mjs). */
            {controller: player, source: id, ...(X !== null ? {x: X} : {})}));
      }
    }
  }

  /* CR 702.29a and its kin: an ability a card has in its owner's hand -- cycling, "{2}, discard this card: draw a card"
     -- whenever that player has priority, unless it says sorcery speed. */
  /* Commander ninjutsu (CR 702.49d) works from the command zone as well: the hand's abilities that say so (`alsoCommand`). */
  for (const id of [...cardsIn(state, "hand", player), ...cardsIn(state, "command", player)]) {
    const object = state.objects[id];
    for (const ability of object.abilities ?? []) {
      if (ability.kind !== "activated" || ability.zone !== "hand") continue;
      if (object.zone === "command" && ability.alsoCommand !== true) continue;
      if (ability.timing === "sorcery" && !sorceryTime) continue;
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      /* "Cycling {X}{1}{U}" (Shark Typhoon): one offer for each X the pool can pay, as a permanent's ability has (CR 107.3). */
      for (const X of abilityXValues(state, player, ability, id)) {
        const payment = costPayment(state, player, id, ability.cost, X ?? 0, abilityLess(state, player, id, ability));
        if (!payment) continue;
        /* "Return an unblocked attacking creature you control to its owner's hand" (ninjutsu): one offer per creature it may be. */
        const back = returnAtom(ability.cost);
        for (const costChoice of back ? sacrificeChoices(state, player, id, back.selector).map((r) => ({returnToHand: r})) : [null])
          actions.push(...withTargets(state, {kind: "activate", objectId: id, abilityId: ability.id, label: object.card, text: ability.text, payment, ...(X !== null ? {x: X} : {}),
            ...(costChoice ? {costChoice, costNames: [state.objects[costChoice.returnToHand].card]} : {})}, ability, {controller: player, source: id, ...(X !== null ? {x: X} : {})}));
      }
    }
  }

  /* An ability a card has in its owner's graveyard -- encore (CR 702.141a) -- whenever that player has priority, at its own
     timing. */
  for (const id of cardsIn(state, "graveyard", player)) {
    const object = state.objects[id];
    for (const ability of object.abilities ?? []) {
      if (ability.kind !== "activated" || ability.zone !== "graveyard") continue;
      if (ability.timing === "sorcery" && !sorceryTime) continue;
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      const payment = costPayment(state, player, id, ability.cost, 0, abilityLess(state, player, id, ability));
      if (!payment) continue;
      actions.push(...withTargets(state, {kind: "activate", objectId: id, abilityId: ability.id, label: object.card, text: ability.text, payment}, ability, {controller: player, source: id}));
    }
  }

  return actions;
}

/**
 * Cast a card as an effect resolves (CR 608.2g; effects/asking.mjs, `play`): one of `castChoicesNow`'s, what it costs
 * already the effect's to have paid. No priority is needed, nor a sorcery's timing.
 */
export function castNow(state, player, action) {
  return perform(state, player, action, {paid: true});
}

/** The ways to cast this card now as an effect lets it be cast: its targets or modes. Not a land, an Aura, or a spell with an additional cost to choose. */
export function castChoicesNow(state, player, id) {
  const object = state.objects[id];
  if (!object || (object.types ?? []).includes("Land") || object.enchant || (object.spell?.additionalCost ?? []).length || castForbidden(state, player, id)) return [];
  const base = {kind: "cast", objectId: id, label: object.card, payment: {mana: {}, life: 0}, from: object.zone, tax: 0};
  const context = {controller: player, source: id};
  /* NAMED: a spell with a counted target ("up to two target creatures") is not cast this way yet -- its targets would be a
     question in the middle of a resolution, which the cast an effect makes does not stop for. */
  return (object.spell?.modal ? withModes(state, base, object.spell.modal, context) : withTargets(state, base, object.spell, context))
    .filter((offer) => !(offer.targets ?? []).some(isChoosing));
}

const sorcerySpeed = (object) => (object.types ?? []).some((type) => SORCERY_SPEED.includes(type));

/**
 * NOTHING TO DO (docs/plan-to-done-2026-09-30.md, item 11): the player holds priority, the stack is empty, and there
 * is no action but to pass. A mana ability counts only while there is something the mana could be for -- a spell
 * castable now, at its speed, with the pool and every untapped source together. That is a count, not a payment:
 * colors are not matched, so a doubtful case is asked rather than passed for the player.
 */
export function nothingToDo(state, player, actions = legalActions(state, player)) {
  return deriving(state, () => idle(state, player, actions));
}
function idle(state, player, actions) {
  if (state.priorityPlayer !== player || state.stack.length) return false;
  if (actions.some((a) => a.kind !== "pass" && a.kind !== "activate-mana")) return false;
  /* Each source counted once, at the most it can add net of what it costs -- a Sol Ring is two, a Signet one, and a
     dual land one however many colors it offers. */
  const best = new Map();
  for (const a of actions.filter((x) => x.kind === "activate-mana")) {
    const ability = abilitiesOf(state, a.objectId).find((x) => x.id === a.abilityId);
    const net = total(a.mana) - (ability?.cost ? manaValue(parseManaCost(ability.cost)) : 0);
    best.set(a.objectId, Math.max(best.get(a.objectId) ?? 0, net));
  }
  if (!best.size) return true;
  const mana = poolSize(state.players[player].manaPool) + [...best.values()].reduce((n, v) => n + Math.max(0, v), 0);
  const mainNow = player === state.activePlayer && MAIN_PHASES.includes(state.phase);
  /* And what a permanent lets them cast from another zone (the top of the library, say). */
  const spells = [...cardsIn(state, "hand", player), ...cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true), ...playableElsewhere(state, player, "spell")];
  /* And what they may cast from their graveyard for another cost -- flashback (CR 702.34a), escape (702.138a) -- counted at
     that cost's mana: a Woe Strider that could escape is something to do. */
  const fromGraveyard = cardsIn(state, "graveyard", player).some((id) => {
    const object = state.objects[id];
    if (sorcerySpeed(object) && !hasFlash(state, id) && !flashGranted(state, player, id) && !mainNow) return false;
    const back = flashbackCost(state, player, id);
    const costs = [back && flashbackPayable(state, player, back) ? back.mana : null, ...escapeWays(state, player, id).map((way) => way.mana)].filter((m) => typeof m === "string");
    return costs.some((m) => manaValue(parseManaCost(m)) <= mana);
  });
  if (fromGraveyard) return false;
  return !spells.some((id) => {
    const object = state.objects[id];
    if (!object.manaCost || (sorcerySpeed(object) && !hasFlash(state, id) && !flashGranted(state, player, id) && !mainNow)) return false;
    const tax = object.zone === "command" ? commanderTax(state, player, id) : 0;
    /* What it costs now, reductions included: a spell made castable by a Medallion is something to do. */
    const {cost, x} = castCost(state, player, id, tax);
    /* manaValue reads the printed symbols; the reduction lowered the generic count, so take off what it took. */
    const printed = parseManaCost(object.manaCost);
    return manaValue(printed) - (printed.generic - cost.generic) + x <= mana;
  });
}

/* Two actions are the same offer when they agree on everything that identifies them. Comparing by
   value rather than by reference is what lets an action survive a round trip through JSON — a pilot
   across a network boundary submits a copy, not the object it was handed. */
/* A counted target is one offer however it is then picked: its placeholder and the list chosen for it are the same offer. */
const targetKey = (action) => (action.targets ?? []).map((t) => (Array.isArray(t) || isChoosing(t) ? "many" : `${t?.kind}:${t?.id}`)).join(",")
  + "|" + Object.entries(action.costChoice ?? {}).map(([k, v]) => `${k}:${v}`).join(",");
const sameAction = (a, b) => a.kind === b.kind
  && (a.objectId ?? null) === (b.objectId ?? null)
  && (a.abilityId ?? null) === (b.abilityId ?? null)
  && (a.produce ?? null) === (b.produce ?? null)
  && (a.x ?? null) === (b.x ?? null)
  /* A cast with flashback is another action than the same card cast another way: it is exiled after (CR 702.34a). */
  && (a.flashback === true) === (b.flashback === true)
  /* And one that taps for itself another than one the pool pays (castTapPlans). Which way it taps is picked after the
     offer is taken, so it is not part of it. */
  && (a.autoTap === true) === (b.autoTap === true)
  /* And one convoked another than one the pool pays alone (CR 702.51a). Which creatures it taps is picked after the offer
     is taken, so they are not part of it. */
  && (a.convoke === true) === (b.convoke === true)
  /* And a double-faced card played with its back face up another than with its front (CR 712.12). */
  && (a.face ?? null) === (b.face ?? null)
  /* And with escape, its own or one given (CR 702.138a): another cost, and what it cast escaped. The cards it exiles are
     picked after the offer is taken, so they are not part of it. */
  && (a.escape ?? null) === (b.escape ?? null)
  /* An alternative cost (CR 118.9) is another action than paying the mana cost. */
  && (a.alternative ?? null) === (b.alternative ?? null)
  /* And the modes chosen as it is cast (CR 700.2): another choice is another action. */
  && JSON.stringify(a.modes ?? null) === JSON.stringify(b.modes ?? null)
  && targetKey(a) === targetKey(b);

/** The target specs an offer's targets were chosen by, and the context they were chosen in. */
export function offerSpecs(state, player, action) {
  const object = state.objects[action.objectId];
  if (!object) return {specs: [], context: {controller: player, source: action.objectId}};
  const context = {controller: player, source: action.objectId};
  if (action.kind === "cast") return {specs: object.spell?.modal && Array.isArray(action.modes) ? modalScript(object.spell.modal, action.modes).targets : object.spell?.targets ?? [], context};
  const ability = abilitiesOf(state, action.objectId).find((candidate) => candidate.id === action.abilityId);
  return {specs: ability?.targets ?? [], context};
}

/* The next counted target of an offer still to be picked, or -1. One with nothing it could choose is no question: it is
   chosen as nothing (its least is 0, or the offer would not have been made). */
function nextToChoose(state, player, action) {
  const {specs, context} = offerSpecs(state, player, action);
  for (let index = action.targets.findIndex(isChoosing); index >= 0; index = action.targets.findIndex(isChoosing)) {
    if (targetCandidates(state, specs[index], context).length) return index;
    action.targets[index] = [];
  }
  return -1;
}

/** The question for an offer's counted target (CR 601.2c): its legal choices, picked as a pick-several (script/bind.mjs). */
export function chooseTargetsChoice(state, awaiting) {
  const {specs, context} = offerSpecs(state, awaiting.player, awaiting.action);
  const object = state.objects[awaiting.action.objectId];
  const ability = awaiting.action.kind === "activate" ? abilitiesOf(state, awaiting.action.objectId).find((a) => a.id === awaiting.action.abilityId) : object?.spell;
  return countedChoice(state, specs[awaiting.index], context, {id: `choose-targets:${awaiting.action.objectId}:${awaiting.index}`,
    name: object?.card ?? "That spell", hostile: awaiting.action.hostile === true || isHostile(ability?.effects ?? [])});
}

/**
 * The counted target picked: kept in the offer, then the next asked, or the offer taken with every target chosen --
 * cast or activated now, as it would have been had they been chosen with it (CR 601.2c-i, 602.2b).
 */
export function resolveChooseTargets(state, awaiting, indices) {
  const choice = chooseTargetsChoice(state, awaiting);
  const picked = [...new Set(indices ?? [])].sort((a, b) => a - b);
  if (picked.length !== (indices ?? []).length || picked.length < choice.min || picked.length > choice.max || picked.some((i) => !choice.options[i]))
    throw new Error("Invalid selection");
  const action = structuredClone(awaiting.action);
  action.targets[awaiting.index] = picked.map((i) => choice.options[i].targets[0]);
  const next = nextToChoose(state, awaiting.player, action);
  if (next >= 0) {
    state.awaiting = {...awaiting, action, index: next};
    return [];
  }
  state.awaiting = null;
  state.priorityPlayer = awaiting.player;
  return applyAction(state, awaiting.player, action);
}

/* A counted target's list, as its controller picked it: each a legal choice now, none twice (CR 115.3), as many as its
   count allows. Refused before anything moves. */
function countedProblem(state, player, action) {
  const {specs, context} = offerSpecs(state, player, action);
  for (const [index, spec] of specs.entries()) {
    const count = countOf(spec), chosen = (action.targets ?? [])[index];
    if (!count) continue;
    if (!Array.isArray(chosen)) throw new Error("Choose those targets first");
    const legal = targetCandidates(state, spec, context);
    const keys = chosen.map((t) => `${t?.kind}:${t?.id}`);
    if (new Set(keys).size !== keys.length || !chosen.every((t) => legal.some((c) => c.kind === t?.kind && c.id === t?.id))
      || chosen.length < count.min || (count.max !== null && chosen.length > count.max))
      throw new Error(`Those are not ${targetName(state, {kind: "choose", ...count})} it can have`);
  }
}

/**
 * Perform an action, after checking the engine actually offered it.
 *
 * AND THEN THE PLAYER RECEIVES PRIORITY AGAIN (CR 117.3c), which is two rules of its own. The count of passes in
 * succession starts over (CR 117.4): without that, a player who answered a spell and passed would see it resolve
 * before the player they answered had a chance to reply. And before they receive it, state-based actions are
 * performed and waiting triggers go on the stack (CR 117.5): a land that gains a life as it enters triggers on the
 * land drop, and a pain land at one life loses its controller the game then, not at the next step.
 *
 * @returns {Array} events for the caller to journal
 */
export function applyAction(state, player, action) {
  const events = perform(state, player, action);
  state.passes = 0;
  /* What the action did triggers now (CR 603.2), whatever is asked next; the triggers wait to go on the stack. */
  collectTriggers(state, events);
  /* A land that asks as it enters (a shock land) asks first: it is part of the land's entering. */
  if (askEntering(state)) { state.priorityPlayer = null; return events; }
  const sba = checkStateBasedActions(state);
  events.push(...sba);
  collectTriggers(state, sba);
  if (!state.awaiting) openTriggers(state);
  if (state.awaiting) state.priorityPlayer = null;
  else if (state.players[player].lost) {
    /* The actor lost to a state-based action: the round goes on from the next player still in the game (CR 800.4). */
    const count = state.players.length;
    let next = null;
    for (let step = 1; step < count && next === null; step += 1) if (!state.players[(player + step) % count].lost) next = (player + step) % count;
    state.priorityPlayer = gameOver(state) ? null : next;
  }
  return events;
}

function perform(state, player, action, during = null) {
  /* Cast as an effect resolves (castNow): no priority, and not one of the offers -- the effect has chosen it, and paid. */
  if (!during) {
    if (state.priorityPlayer !== player)
      throw new Error("That player does not hold priority");
    const offered = legalActions(state, player);
    if (!action || !offered.some((candidate) => sameAction(candidate, action)))
      throw new Error(`That is not a legal action here: ${JSON.stringify(action?.kind ?? action)}`);
    /* A COUNTED TARGET (CR 601.2c, 602.2b; script/bind.mjs): taken with its placeholder, the offer stops to ask which,
       nothing moved or paid before the answer (rules/turn.mjs, "choose-targets"); taken with a list, the list is checked. */
    if ((action.targets ?? []).some(isChoosing)) {
      action = structuredClone(action);
      const index = nextToChoose(state, player, action);
      if (index >= 0) {
        state.awaiting = {kind: "choose-targets", player, action, index};
        return [];
      }
    }
    countedProblem(state, player, action);
    /* ESCAPE'S OTHER CARDS (CR 702.138a, 601.2h): taken without them, the cast stops to ask which, nothing moved or paid
       before the answer (rules/turn.mjs, "choose-cost"); taken with them, they are checked as it is cast. */
    if (action.kind === "cast" && action.escape !== undefined && !Array.isArray(action.escapeExile)) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* A FLASHBACK COST THAT TAPS CREATURES (Battle Screech): the same -- which ones, asked before anything is paid. */
    if (action.kind === "cast" && action.flashback === true && !Array.isArray(action.flashbackTap) && flashbackCost(state, player, action.objectId)?.tap) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* CONVOKE (CR 702.51a): which creatures help pay, asked before anything is tapped or paid. */
    if (action.kind === "cast" && action.convoke === true && !Array.isArray(action.convokeTap)) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* A CAST THAT TAPS FOR ITSELF, more than one way (castTapPlans): which sources, asked before anything is tapped. */
    if (action.kind === "cast" && action.autoTap === true && action.tapPlan === undefined && castTapPlans(state, player, action, 2).length > 1) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
  }

  /* Passing is the priority module's business, because what a full round of passes means depends on
     the stack. The caller routes it there; this refusal is so that nobody routes it here and gets a
     silent no-op instead. */
  if (action.kind === "pass")
    throw new Error("Pass through passPriority, which is what decides whether a round ends a step or resolves an object");

  if (action.kind === "play-land") {
    const events = [];
    /* A double-faced card's land face, turned up first (CR 712.12): it is played as that face, so it is announced by that
       face's name, and it enters with that face up -- how it enters is that face's "as this land enters". */
    if (action.face === "back") showFace(state, action.objectId, "back");
    const card = cardRef(state, action.objectId);
    state.players[player].landsPlayed += 1;
    /* The order matters to a reader: the land is announced as a land, then as the zone change it
       also is, which is what `match-telemetry.mjs` counts and what the audio rules listen for. */
    events.push(event("GameEventLandPlayed", state, {land: card, player: {playerId: player, name: state.players[player].name}}));
    /* From another zone, by a permission with a limit: spent. */
    const permission = state.objects[action.objectId].zone !== "hand" ? playPermission(state, player, action.objectId, "land") : null;
    if (permission?.ability.limit !== undefined) recordUse(state, permission.source, playKey(permission.ability));
    /* CR 614.12: a land played enters the way any permanent does -- through the replacements that change how it
       enters, its own "This land enters tapped" first. Moving it straight there let a tapped land arrive untapped. */
    moveOne(state, action.objectId, "battlefield", events);
    return events;
  }

  if (action.kind === "activate-mana") {
    const events = [];
    const object = state.objects[action.objectId];
    const ability = abilitiesOf(state, action.objectId).find((candidate) => candidate.id === action.abilityId);
    /* Recomputed rather than trusted, like a cast's payment: which alternative, and what it costs, now. */
    const produced = manaAlternatives(state, player, ability, action.objectId)[action.produce ?? 0];
    const payment = manaAbilityPayment(state, player, ability);
    if (!produced || !payment || !withinLimit(state, action.objectId, ability) || !countersPayable(state, action.objectId, ability.counterCost))
      throw new Error(`${object.card} cannot add that mana now`);
    const pool = state.players[player].manaPool;
    spend(pool, payment.mana);
    const life = (ability.payLife ?? 0) + payment.life;
    /* Life paid is life lost (CR 119.4): said, and counted (batch 78). */
    if (life > 0) changeLife(state, player, -life, events);
    payCounters(state, action.objectId, ability.counterCost);
    if (ability.limit) recordUse(state, action.objectId, ability.id);
    if (ability.tapSelf) {
      object.tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.objectId), tapped: true}));
    }
    /* "Spend this mana only to cast a creature spell of the chosen type": beside the pool (rules/restricted-mana.mjs). */
    if (ability.spendOnly) addRestricted(state, player, produced, ability.spendOnly, action.objectId);
    else addMana(pool, produced);
    events.push(event("GameEventManaPool", state, {
      player: {playerId: player, name: state.players[player].name},
      produced: {...produced}, source: cardRef(state, action.objectId),
      /* "Tapped for mana" (CR 605.1b): what a "whenever ... is tapped for mana" ability watches. */
      ...(ability.tapSelf ? {tapped: true} : {}),
    }));
    /* Triggered mana abilities: at once, as part of this one -- "its controller adds an additional {G}". */
    for (const extra of manaTriggered(state, events[events.length - 1])) {
      addMana(state.players[extra.player].manaPool, extra.mana);
      events.push(event("GameEventManaPool", state, {player: {playerId: extra.player, name: state.players[extra.player].name}, produced: {...extra.mana}, source: cardRef(state, extra.source)}));
    }
    /* "This land deals 1 damage to you": part of the same mana ability, so it happens now, off the stack too. */
    if ((ability.then ?? []).length) {
      /* "Put a nest counter on this creature": bound to the source, and counted, as a resolution would (it has none). */
      const context = {controller: player, source: action.objectId};
      events.push(...runEffects(state, ability.then.map((e) => countEffect(state, bindEffect(e, context), context)), context));
    }
    /* "{T}, Sacrifice this artifact: Add one mana of any color" (a Treasure, Lotus Petal): the sacrifice is part of the
       cost of a mana ability, paid as it is activated (CR 605.3a, 701.21a). */
    if (ability.sacrificeSelf && state.objects[action.objectId]) sacrificeOne(state, action.objectId, events);
    if (ability.sacrifice && action.costChoice?.sacrifice !== undefined) sacrificeOne(state, action.costChoice.sacrifice, events);
    /* NOTHING GOES ON THE STACK. CR 605.3a — the whole point of a mana ability. */
    return events;
  }

  if (action.kind === "cast") {
    const events = [];
    const object = state.objects[action.objectId];
    /* Recomputed rather than trusted: the action arrived from a pilot, possibly across a network,
       and the pool may have moved since it was offered. The offered check above proves the action
       is still on the list, and this proves the payment still balances. */
    const fromCommand = object.zone === "command";
    /* "Whenever you cast a legendary spell from your hand" (Jodah): where it was cast from, for what watches. */
    const castFrom = object.zone;
    const tax = fromCommand ? commanderTax(state, player, action.objectId) : 0;
    const free = action.free ? freeCast(state, player, action.objectId) : null;
    if (action.free && !free) throw new Error(`${object.card} cannot be cast without paying its mana cost now`);
    /* Flashback (CR 702.34a): its cost rather than the mana cost, life and all. */
    const back = action.flashback ? flashbackCost(state, player, action.objectId) : null;
    if (action.flashback && !back) throw new Error(`${object.card} cannot be cast with flashback now`);
    /* Its alternative cost (CR 118.9), asked again now. */
    const way = action.alternative !== undefined ? alternativeCosts(state, player, action.objectId).find((w) => w.index === action.alternative) : null;
    if (action.alternative !== undefined && !way) throw new Error(`${object.card} cannot be cast that way now`);
    /* Escape (CR 702.138a): its cost's mana rather than the mana cost, and the other cards its caster picked. */
    const fled = action.escape !== undefined ? escapeWays(state, player, action.objectId).find((w) => w.kind === action.escape) : null;
    if (action.escape !== undefined && !fled) throw new Error(`${object.card} cannot escape now`);
    const exiling = fled && !during ? escapeExiled(state, player, action, fled) : [];
    /* A flashback cost's creatures, as its caster picked them. */
    const tapping = back?.tap && !during ? flashbackTapped(state, player, action, back.tap) : [];
    /* Tapped for it (castTapPlans): the way picked, or the one there is -- each source's mana ability activated, as its
       caster would (CR 601.2g), before the cost is paid from the pool. */
    let tappedFor = null;
    if (action.autoTap === true && !during) {
      const ways = castTapPlans(state, player, action, TAP_CHOICES);
      const tapped = action.tapPlan !== undefined ? ways.find((w) => w.key === action.tapPlan) : ways.length === 1 ? ways[0] : null;
      if (!tapped) throw new Error(`${object.card} cannot be tapped for that way now`);
      const units = new Map(tapUnits(state, player).map((u) => [u.id, u]));
      for (const tap of tapped.taps) events.push(...perform(state, player, {kind: "activate-mana", objectId: tap.id, label: state.objects[tap.id].card, ...units.get(tap.id).via[tap.color]}));
      tappedFor = {mana: Object.fromEntries(MANA_KEYS.map((k) => [k, tapped.taps.filter((t) => t.color === k).length])), life: 0};
    }
    const {cost, x} = castCost(state, player, action.objectId, tax, Boolean(free), back ? back.mana : fled ? fled.mana : way ? way.mana : null);
    /* Mana added beyond what was tapped for -- a Swamp's extra {B} beside Nirkana Revenant -- can leave the pool more than
       the cost, and more than one way to spend it: then what the sources were tapped for pays, and the rest stays in the
       pool (CR 106.4). */
    const covered = (pool, mana) => MANA_KEYS.every((k) => (pool[k] ?? 0) >= (mana[k] ?? 0));
    const spending = during ? null : poolFor(state, player, {spell: action.objectId});
    /* Convoked (CR 702.51a): the creatures picked, and what the pool pays besides -- refused before anything is tapped. */
    const convoke = action.convoke === true && !during ? convoked(state, player, action, {...cost, generic: cost.generic + x}) : null;
    const fromPool = during ? {mana: {}, life: 0} : convoke ? convoke.payment
      : automaticPayment(spending, cost, {life: state.players[player].life - (back?.life ?? 0) - (way?.life ?? 0), x: x + (action.x ?? 0) * cost.variable});
    const payment = fromPool ?? (tappedFor && covered(spending, tappedFor.mana) ? tappedFor : null);
    if (!payment || (back && back.life > state.players[player].life) || (way && way.life > state.players[player].life)) throw new Error(`${object.card} cannot be paid for from this pool`);
    const card = cardRef(state, action.objectId);
    const paid = spendFor(state, player, {spell: action.objectId}, payment.mana);
    if (payment.life > 0) changeLife(state, player, -payment.life, events);
    if (back?.life) changeLife(state, player, -back.life, events);
    if (way?.life) changeLife(state, player, -way.life, events);
    /* CR 903.8: the tax counts casts from the command zone, so it is recorded only here. */
    if (fromCommand) recordCommanderCast(state, player, action.objectId);
    /* "Once each turn" spent (Darksteel Monolith, As Foretold). */
    if (free?.limited) recordUse(state, free.source, `free:${free.abilityId}`);
    /* Cast from a graveyard or a library by a permanent's permission (play-from): its limit spent, and what it says of
       the spell remembered for when it leaves the stack. Not a flashback cast, which is the card's own permission. */
    const permission = !back && ["graveyard", "library"].includes(object.zone) ? playPermission(state, player, action.objectId, "spell") : null;
    if (permission?.ability.limit !== undefined) recordUse(state, permission.source, playKey(permission.ability));
    /* "If you cast a creature spell this way, it gains haste until end of turn" (Thundermane Dragon): remembered on the spell,
       given to the permanent it becomes (rules/stack.mjs). */
    const gains = object.zone === "library" ? castFromTopGains(state, player, action.objectId) : [];

    const permanent = !(object.types ?? []).some((type) => ["Instant", "Sorcery"].includes(type));
    const targets = structuredClone(action.targets ?? []);
    const targetDescription = targets.map((t) => targetName(state, t)).join(", ");
    /* The additional cost chosen, paid with the rest of the cost (CR 601.2h), its cards named before they move. */
    const extraPaid = [];
    for (const [kind, id] of Object.entries(action.costChoice ?? {})) {
      if (!state.objects[id]) throw new Error("That additional cost can no longer be paid");
      extraPaid.push([kind, id]);
    }
    /* What this player has cast this turn, for "whenever an opponent casts their first noncreature spell each turn". */
    (state.players[player].castThisTurn ??= []).push({types: [...(object.types ?? [])], colors: [...(object.colors ?? [])]});
    const entry = pushSpell(state, action.objectId, {controller: player, permanent, targets, ...(action.x !== undefined ? {x: action.x} : {}), ...(Array.isArray(action.modes) ? {modes: action.modes} : {})});
    /* How it was cast, for its own conditions (script/condition.mjs, `cast`): "if this spell was cast from a graveyard"
       (Sevinne's Reclamation), and Addendum's "if you cast this spell during your main phase" -- its caster's turn, a main
       phase (Unbreakable Formation). A copy is not cast (CR 707.10) and has none. */
    entry.cast = {from: castFrom, mainPhase: player === state.activePlayer && MAIN_PHASES.includes(state.phase)};
    /* Cast with flashback: exiled, whatever would move it, as it leaves the stack (rules/stack.mjs, effects/zones.mjs). */
    if (back) entry.flashback = true;
    /* Cast with escape, it escaped (CR 702.138b): the permanent it becomes is marked so (rules/stack.mjs). */
    if (fled) entry.escaped = true;
    /* Cast for its evoke cost (CR 702.74a): the permanent it becomes is marked so, for "if its evoke cost was paid". */
    if (way?.evoke) entry.evoked = true;
    /* "And that spell can't be countered" (Cavern of Souls): paid with mana that said so. */
    if (paid.uncounterable) entry.uncounterable = true;
    /* "If a spell cast this way would be put into your graveyard, exile it instead" (Kess): to exile, if to a graveyard. */
    if (permission?.ability.graveyardToExile) entry.graveyardToExile = true;
    /* On the spell as it now is: moving to the stack made a new object (CR 400.7). */
    if (gains.length && state.objects[entry.objectId]) state.objects[entry.objectId].castGains = gains;
    /* THE MANA SPENT TO CAST IT (CR 601.2h): "if {W}{W} was spent to cast it" (Wistfulness), "if at least three red mana was
       spent to cast this spell" (adamant) -- by color, on the spell as it now is, and on the permanent it becomes (rules/
       stack.mjs). What the pool paid, tax and all: a creature that convoked it paid no mana (CR 702.51a), and a spell cast
       without paying its mana cost spent none. A copy is not cast and has none (CR 707.10). */
    const spent = Object.fromEntries(Object.entries(payment.mana ?? {}).filter(([, n]) => n > 0));
    if (Object.keys(spent).length && state.objects[entry.objectId]) state.objects[entry.objectId].spent = spent;
    for (const [kind, id] of extraPaid) {
      /* A card exiled from the hand (Force of Will) goes to exile; a discard or a sacrifice to its owner's graveyard. */
      const paid = kind === "sacrifice" ? sacrificeOne(state, id, events) : moveOne(state, id, kind === "exile" ? "exile" : "graveyard", events, {owner: state.objects[id].owner});
      if (kind === "discard" && paid !== null) events[events.length - 1].data.fields.discarded = true;
    }
    /* Escape's other cards, exiled as the rest of the cost is paid (CR 601.2h). */
    for (const id of exiling) if (state.objects[id]) moveOne(state, id, "exile", events, {owner: state.objects[id].owner});
    /* And a flashback cost's creatures, tapped; and a convoke's (CR 702.51c: they convoked it), for no mana. */
    for (const id of [...tapping, ...(convoke?.ids ?? [])]) {
      state.objects[id].tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: true}));
    }
    /* What it is aimed at becomes its target (ward, CR 702.21a). */
    events.push(...becameTarget(state, entry));
    /* STORM (CR 702.40a): "when you cast this spell, copy it for each spell cast before it this turn. You may choose new
       targets for the copies" -- a triggered ability of the spell on the stack, waiting with the rest; every player's
       spells this turn counted, this one aside. */
    if ((object.abilities ?? []).some((a) => a.kind === "static" && a.rule === "storm")) {
      const before = state.players.reduce((n, p) => n + (p.castThisTurn ?? []).length, 0) - 1;
      (state.pendingTriggers ??= []).push({abilityId: "storm", text: `Storm: copy ${object.card} for each spell cast before it this turn.`, controller: player,
        source: {cardId: entry.objectId, name: object.card}, cause: null, optional: false,
        about: {card: entry.objectId, player, stackId: entry.stackId, castBefore: Math.max(0, before)},
        script: {targets: [], effects: [{effect: "copySpell", spells: "that card", count: {castBefore: true}, newTargets: true}]}});
    }
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: true, abilityId: entry.abilityId, stackId: entry.stackId},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription, castFrom,
    }));
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: {command: "Command", hand: "Hand", graveyard: "Graveyard", exile: "Exile", library: "Library"}[action.from ?? object.zone] ?? "Hand", player: {playerId: player}},
      to: {zoneType: "Stack", player: {playerId: player}},
    }));
    return events;
  }

  if (action.kind === "activate") {
    const events = [];
    const object = state.objects[action.objectId];
    const ability = abilitiesOf(state, action.objectId).find((candidate) => candidate.id === action.abilityId);
    /* Recomputed, as a cast's payment is: the pool may have moved since the offer. */
    const payment = costPayment(state, player, action.objectId, ability.cost, action.x ?? 0, abilityLess(state, player, action.objectId, ability));
    if (!payment || !withinLimit(state, action.objectId, ability)) throw new Error(`${object.card}'s ability cannot be paid for now`);
    /* A source the cost sacrifices is read as it last was ("a 2/2 Spider for each counter on this creature"). */
    const sacrificesSelf = (ability.cost ?? []).some((a) => a.atom === "sacrifice" && a.self === true);
    const card = cardRef(state, action.objectId);
    const targets = structuredClone(action.targets ?? []);
    const targetDescription = targets.map((t) => targetName(state, t)).join(", ");
    /* Whom an attacker the cost returns was attacking: "tapped and attacking" (ninjutsu) attacks the same player, or the same
       planeswalker (CR 702.49c). */
    const returning = action.costChoice?.returnToHand;
    const was = returning !== undefined ? (state.combat?.attacks ?? []).find((attack) => attack.attacker === returning) : undefined;
    const attacked = was?.defender;
    /* CR 602.2a, then 602.2b and 601.2h: on the stack first, then the costs. */
    const entry = pushAbility(state, {sourceId: action.objectId, controller: player, abilityId: ability.id, kind: "ability", targets, script: ability,
      ...(attacked !== undefined ? {about: {player: attacked, ...(was.planeswalker !== undefined ? {planeswalker: was.planeswalker} : {})}} : {}),
      /* Station: "charge counters equal to the tapped creature's power" -- the creature it tapped is what it is about. */
      ...(action.costChoice?.tap !== undefined ? {about: {card: action.costChoice.tap}} : {}),
      ...(action.x !== undefined ? {x: action.x} : {}), ...(sacrificesSelf && object.zone === "battlefield" ? {lastKnown: lastKnown(state, action.objectId)} : {})});
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: false, abilityId: entry.abilityId, stackId: entry.stackId, description: ability.text},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription,
    }));
    events.push(...becameTarget(state, entry));
    for (const atom of ability.cost ?? []) {
      if (atom.atom === "{T}") {
        object.tapped = true;
        events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.objectId), tapped: true}));
      }
      if (atom.atom === "mana") {
        spendFor(state, player, {ability: action.objectId}, payment.mana.mana);
        if (payment.mana.life > 0) changeLife(state, player, -payment.mana.life, events);
      }
      if (atom.atom === "payLife") changeLife(state, player, -(atom.amount ?? 0), events);
      if (atom.atom === "addCounters" || atom.atom === "removeCounters")
        payCounters(state, action.objectId, [{counter: atom.counter, count: atom.count ?? 1, put: atom.atom === "addCounters"}]);
      /* "Return a Forest you control to its owner's hand": the one chosen with the offer. */
      if (atom.atom === "returnToHand" && action.costChoice?.returnToHand !== undefined) moveOne(state, action.costChoice.returnToHand, "hand", events);
      /* "Discard a card": the one chosen with the offer, a discard -- "whenever you discard a card" sees it. */
      /* Each card of "discard two cards" a discard of its own. */
      if (atom.atom === "discard" && atom.self !== true && action.costChoice?.discard !== undefined)
        for (const card of [].concat(action.costChoice.discard))
          if (moveOne(state, card, "graveyard", events, {owner: state.objects[card].owner}) !== null) events[events.length - 1].data.fields.discarded = true;
      /* CR 701.21a: to sacrifice is to move a permanent you control to its owner's graveyard -- through the
         replacements and with its last known information, like any death, so "when this dies" still sees it. */
      if (atom.atom === "sacrifice" && atom.self === true) sacrificeOne(state, action.objectId, events);
      /* Exiling it from the graveyard is the cost of encore (CR 702.141a), paid after the ability is on the stack: "this card"
         is then that card in exile (CR 400.7), what the ability is about. */
      if (atom.atom === "exileFromGraveyard" && atom.self === true) {
        const exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});
        if (exiled !== null) entry.about = {...(entry.about ?? {}), card: exiled};
      }
      /* Discarding it is the cost of cycling: paid after the ability is on the stack (CR 602.2b, 601.2h), a discard. A cycling
         ability's discard is the card being cycled (CR 702.29c), with the X paid for it ("create an X/X Shark"). */
      if (atom.atom === "discard" && atom.self === true && moveOne(state, action.objectId, "graveyard", events, {owner: object.owner}) !== null) {
        const fields = events[events.length - 1].data.fields;
        fields.discarded = true;
        if (ability.cycling === true) Object.assign(fields, {cycled: true}, action.x !== undefined ? {cycledX: action.x} : {});
      }
      /* Each permanent of the set chosen, sacrificed (CR 701.21a). */
      if (atom.atom === "sacrifice" && atom.selector && action.costChoice?.sacrifice !== undefined)
        for (const fodder of [].concat(action.costChoice.sacrifice)) sacrificeOne(state, fodder, events);
      /* Crew: the creatures chosen, tapped (CR 702.122a). */
      /* Station: the creature chosen, tapped. */
      if (atom.atom === "tapCreature") {
        const tapped = action.costChoice?.tap;
        if (!state.objects[tapped] || state.objects[tapped].tapped) throw new Error("That creature can no longer be tapped");
        state.objects[tapped].tapped = true;
        events.push(event("GameEventCardTapped", state, {card: cardRef(state, tapped), tapped: true}));
      }
      /* "Untap a tapped creature you control": the ones chosen (still tapped -- the action is one legalActions offers). */
      if (atom.atom === "untapCreature") for (const id of action.costChoice?.untap ?? []) {
        state.objects[id].tapped = false;
        events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: false}));
      }
      if (atom.atom === "crew") for (const id of action.costChoice?.crew ?? []) {
        if (!state.objects[id] || state.objects[id].tapped) throw new Error("That creature can no longer crew");
        state.objects[id].tapped = true;
        events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: true}));
      }
    }
    if (ability.limit) recordUse(state, action.objectId, ability.id);
    /* Exhausted: this object never activates it again (CR 702.177a). It is a new object once it changes zones (CR 400.7),
       and moveObject makes it one, so the record goes with the old. */
    if (ability.exhaust) (object.exhausted ??= []).push(ability.id);
    /* A loyalty ability activated: none other of this permanent's this turn (CR 606.3). */
    if (ability.loyalty !== undefined) recordUse(state, action.objectId, "loyalty");
    return events;
  }

  /* Unreachable: an action kind that passed the offered check but has no branch would be a kind
     this module enumerates and cannot perform. Loud, per principle 6. */
  throw new Error(`The engine offered ${action.kind} and cannot perform it`);
}
