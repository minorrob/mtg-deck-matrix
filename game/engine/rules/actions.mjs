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

import {cardsIn, moveObject, usesThisTurn, recordUse, showFace, showAdventure, shownFaceDown, shownFaceUp, turnFaceUp, eventCard, commanderKeyOf, recordDiscard, activationsForbidden, valueCostOf} from "../state/index.mjs";
import {mayLookAt} from "../projection.mjs";
import {pushSpell, pushAbility, becameTarget, crimeCommitted} from "./stack.mjs";
import {spend, parseManaCost, automaticPayment, canPay, chosenPayment, paymentOptions, paymentKey, paymentWords, PAY_CHOICES, manaValue, poolSize, tapPlans, sourceTapPlans, quickTapPlan, convokeCanPay, convokePayments, lessGeneric} from "./mana.mjs";
import {commanderTax, recordCommanderCast, commanderIdentity} from "./commander.mjs";
import {COLORS, MANA_KEYS, manaAbilityNow} from "./mana.mjs";
import {sickForAbilities, hasFlash, splitSecondOnStack} from "../keywords/timing.mjs";
import {targetChoices, targetName, isHostile, modalScript, isChoosing, countOf, targetCandidates, countedChoice, inWords, differentControllersProblem, shareProblem} from "../script/bind.mjs";
import {moveOne, sacrificeOne, mill} from "../script/effects/zones.mjs";
import {compileSelector, matchesSelector, selectMatching} from "../script/filter.mjs";
import {runEffects} from "../script/effects/index.mjs";
import {changeLife} from "../script/effects/resources.mjs";
import {unprepare, preparedCopyStays} from "../script/effects/attributes.mjs";
import {checkStateBasedActions, gameOver} from "./sba.mjs";
import {costReduction, costIncrease, lifeIncrease, costsReadTargets, abilityCostIncrease, equipCostReduction, playerStatics, freeCast, flashGranted, castForbidden, placeCounters, activationForbidden, permanentActivationForbidden, cantBeSacrificed, ruleChanged} from "./statics.mjs";
import {countMana, amountOf, countEffect, isCounted, amountProblems, commanderless} from "../script/amount.mjs";
import {bindEffect} from "../script/bind.mjs";
import {conditionHolds} from "../script/condition.mjs";
import {lastKnown, characteristicsOf, abilitiesOf, deriving, derivingAfresh, onceAQuestion, keywordsOf, colorsOf, controllerOf, staticAbilities} from "./layers.mjs";
import {namesChosen, withChosen, chosenFor} from "../script/chosen.mjs";
import {poolFor, spendFor, addRestricted, addRider, riderChoices, addProvenance, addPoolMana} from "./restricted-mana.mjs";
import {askEntering} from "./entering.mjs";
import {collectTriggers, openTriggers, manaTriggered} from "./trigger.mjs";

const MAIN_PHASES = ["MAIN1", "MAIN2"];
/* CR 307.1 and 308.1: these are the card types that can only be cast at sorcery speed. */
const SORCERY_SPEED = ["Sorcery", "Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"];

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = eventCard;

const isLand = (object) => (object.types ?? []).includes("Land");
/* A modal double-faced card whose back face is a land, front face up (CR 712.12). A nonmodal one is played or cast only
   with its front face up (CR 712.11): its back face is reached by transforming. */
const backLand = (object) => object.mdfc !== undefined && object.mdfc.transforming !== true && object.face !== "back" && (object.mdfc.back.types ?? []).includes("Land");

/* WHAT A SPELL COSTS TO CAST NOW (CR 601.2f): its mana cost plus the commander tax, less what "spells cost {N} less"
   takes off -- generic mana only, the printed generic first and then the tax, never below nothing. The offer and the
   payment read it here, so they cannot disagree. `targets`, the targets chosen for it: its total cost is determined once
   they are (CR 601.2c, then 601.2f), and "this spell costs {1} less to cast if it targets an attacking creature" reads them. */
function castCost(state, player, id, tax, free = false, instead = null, extra = "", targets = null) {
  /* Without paying its mana cost (CR 118.9): nothing for the cost itself, and X is 0 (CR 107.3b); the tax still counts.
     `instead`, an alternative cost's mana (flashback, CR 702.34a): paid rather than the mana cost, reduced like it. And
     `extra`, an additional cost's mana ("blight 1 or pay {3}", Bogslither's Embrace): added to it, free or not (CR 601.2f). */
  const cost = parseManaCost((free ? "" : instead ?? state.objects[id].manaCost ?? "") + (extra ?? ""));
  /* Increases first, then reductions (CR 601.2f): Thalia's {1} more and a Medallion's {1} less cancel out. A cast without
     paying its mana cost still pays an increase (CR 118.9d). */
  cost.generic += costIncrease(state, player, id, targets);
  let reduction = costReduction(state, player, id, targets);
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
 * (`tap`); whether they are there is the offer's to ask (flashbackTappers). One that discards ("Flashback--{1}{U/R}{U/R},
 * Discard a card", Twinned Vision) has it among its `extra` atoms, each card its own offer, as an alternative cost's are; and
 * one that beholds ("Flashback--{1}{R}, Behold three Elementals", Kindle the Inner Flame), which ones asked once it is taken.
 * One that sacrifices ("Flashback--Sacrifice three creatures", Dread Return; wave 4c, k2) says how many and which
 * (`sacrifice`), which ones asked once it is taken, as the creatures it taps are (flashbackSacrificed).
 *
 * @returns {?{mana: string, life: number, extra?: Array<object>, tap?: {count: number, selector: object}, sacrifice?: {count: number, selector: object}}}
 */
const FLASHBACK_EXTRA = ["discard", "behold"];
export function flashbackCost(state, player, id) {
  const object = state.objects[id];
  if (!object || object.zone !== "graveyard" || object.owner !== player) return null;
  if (!(object.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) return null;
  const own = (object.abilities ?? []).find((a) => a.kind === "static" && a.rule === "flashback");
  const held = staticAbilities(state);
  const given = (state.effects ?? []).some((e) => e.rule === "flashback" && (e.affects?.ids ?? []).includes(id))
    /* "Each instant and sorcery card in your graveyard has flashback" (Lier): a permanent's static, its cost the card's mana
       cost -- of its abilities as they are after layer 6 (CR 613.1f). */
    || state.zones.battlefield.some((h) => held(h).some((a) => a.kind === "static" && a.rule === "flashback" && a.affects
      && matchesSelector({...a.affects, what: "card", zone: "graveyard"}, state, id, {controller: state.objects[h].controller, source: h})));
  const cost = own?.cost ?? (given ? [{atom: "mana", cost: object.manaCost ?? ""}] : null);
  if (!cost) return null;
  const tap = cost.find((a) => a.atom === "tapCreature");
  const sacrifice = cost.find((a) => a.atom === "sacrifice");
  return {mana: cost.find((a) => a.atom === "mana")?.cost ?? "", life: cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0),
    ...(cost.some((a) => FLASHBACK_EXTRA.includes(a.atom)) ? {extra: cost.filter((a) => FLASHBACK_EXTRA.includes(a.atom))} : {}), ...(tap ? {tap: {count: tap.count ?? 1, selector: tap.selector ?? {}}} : {}),
    ...(sacrifice ? {sacrifice: {count: sacrifice.count ?? 1, selector: sacrifice.selector ?? {}}} : {})};
}

/* The untapped creatures a player controls that a flashback cost may tap: each fits its selector ("white creatures"), a
   summoning-sick one too, since tapping it is not its own {T} (CR 302.6). */
export const flashbackTappers = (state, player, tap) => state.zones.battlefield.filter((id) => !state.objects[id].tapped
  && characteristicsOf(state, id).controller === player && characteristicsOf(state, id).types.includes("Creature")
  && compileSelector({...(tap?.selector ?? {}), what: "permanent"})(state, id, {controller: player, source: null}));
/* Whether a flashback cost can be paid in full but for its mana: the life, enough creatures to tap, and enough permanents to
   sacrifice (CR 118.3). */
const flashbackPayable = (state, player, back) => back.life <= state.players[player].life
  && (!back.tap || flashbackTappers(state, player, back.tap).length >= back.tap.count)
  && (!back.sacrifice || sacrificeChoices(state, player, null, back.sacrifice.selector).length >= back.sacrifice.count);
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
  /* A permanent's, of its abilities as they are after layer 6 (CR 613.1f). */
  const held = staticAbilities(state);
  const given = state.zones.battlefield.flatMap((h) => held(h).filter((a) => a.kind === "static" && a.rule === "escape" && a.affects?.zone === "graveyard"
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
/* The total cost a convoked spell pays (CR 601.2f), its tax and reductions in, as castCost says it. Cast through Bolas's
   Citadel (`lifeInstead`), life rather than its mana cost, as perform reckons it: no mana for a creature to pay, so none
   is asked for (a question that asked for one could not be answered, and the game waited on it). */
function convokeCost(state, player, action) {
  const {cost, x} = castCost(state, player, action.objectId, action.tax ?? 0, false, action.lifeInstead !== undefined ? "" : null, action.extraMana ?? "", action.targets);
  return {...cost, generic: cost.generic + x};
}
/* A cast's own question, or what it costs, weighed as the card is cast: as its Adventure, when it is cast as one (CR 715.3a). */
/* And face down, when it is cast with disguise (CR 702.168b). */
/* And face up, a card exiled face down that is being played (CR 406.3a; withFaceUp) -- as an Adventure too, then. */
const asCast = (state, action, fn) => withFaceUp(state, action?.objectId, () => (action?.adventure === true ? withAdventure(state, action.objectId, fn)
  : action?.disguise === true ? withFaceDown(state, action.objectId, fn) : fn()));
/* The ways the pool pays the rest once the creatures a convoke picked have paid their part (rules/mana.mjs,
   convokePayments): each untapped and the caster's, none twice -- refused otherwise, before anything is tapped, saying what
   to do instead. `cost` is the total cost, as the payment reckons it; the question reckons it as convokeCost does. */
function convokeWays(state, player, action, cost = convokeCost(state, player, action)) {
  const name = state.objects[action.objectId]?.card ?? "That spell";
  const list = action.convokeTap;
  const fitting = new Map(convokers(state, player).map((c) => [c.id, c]));
  if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every((id) => fitting.has(id)))
    throw new Error(`Those are not untapped creatures you control: pick the creatures to tap for ${name} again`);
  return convokePayments(poolFor(state, player, {spell: action.objectId}), cost, list.map((id) => fitting.get(id)), {life: state.players[player].life});
}
/* The creatures a convoke picked, and what the pool pays besides: the one way there is, or -- the pool paying the rest
   more than one way -- the way its caster chose (`payWith`, X8b; asked once the creatures are picked, performOffered),
   still a way now. Refused before anything is tapped, saying what to do instead. */
function convoked(state, player, action, cost) {
  const name = state.objects[action.objectId]?.card ?? "That spell";
  const ways = convokeWays(state, player, action, cost);
  if (ways.length === 0)
    throw new Error(`Those creatures and the mana in your pool cannot pay for ${name}: each creature pays {1} or one mana of its color. Pick other creatures, or add mana first`);
  const payment = action.payWith === undefined && ways.length === 1 ? ways[0] : ways.find((way) => paymentKey(way) === action.payWith);
  if (!payment)
    throw new Error(`That mana no longer pays the rest of ${name} with those creatures: cast it again, and choose which mana pays from what is in your pool now`);
  return {ids: [...action.convokeTap], payment};
}

/* DELVE (CR 702.66a; Treasure Cruise, Dig Through Time; wave 4c, k2): "each card you exile from your graveyard while casting this
   spell pays for {1}" -- of the generic part of its total cost (CR 601.2f), never more cards than that generic, nor a colored
   symbol (the card's ruling); the rest is paid from the pool (rules/mana.mjs, lessGeneric). The cards of its caster's own
   graveyard, never the spell itself, already on the stack (CR 601.2a). Not an additional or alternative cost (702.66b), so it
   is had with flashback or another alternative cost too, and its mana value is unchanged. */
const hasDelve = (state, id) => keywordsOf(state, id).includes("Delve");
const delvable = (state, player, id) => cardsIn(state, "graveyard", player).filter((c) => c !== id);
/* The total cost a delved cast pays and the life it pays with, as castPayments reckons them (castTerms). */
function delveCost(state, player, action) {
  const {tax, free, back, way, fled, permission, lifeCost} = castTerms(state, player, action);
  const reckoned = castCost(state, player, action.objectId, tax, Boolean(free), lifeCost !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : null, action.extraMana ?? "", action.targets);
  return {cost: anyTypeCost(reckoned.cost, permission), extra: reckoned.x,
    life: state.players[player].life - (back?.life ?? 0) - (way?.life ?? 0) - (lifeCost ?? 0) - lifeOwed(state, player, action)};
}
/* How many cards it may exile: from the fewest that leave the pool able to pay the rest -- one at least, the cast the pool pays
   alone being an offer of its own -- to as many as its generic mana, or as the graveyard holds. Null when no number pays. */
function delveRange(state, player, action) {
  const {cost, extra, life} = delveCost(state, player, action);
  const pool = poolFor(state, player, {spell: action.objectId});
  const most = Math.min(cost.generic + extra, delvable(state, player, action.objectId).length);
  for (let n = 1; n <= most; n += 1) if (canPay(pool, lessGeneric(cost, extra, n), {life})) return {least: n, most};
  return null;
}
/* The ways the pool pays the rest once the cards picked are exiled (CR 601.2h): the picks checked -- one or more, none twice,
   each in the caster's graveyard and never the spell, no more than its generic mana -- refused otherwise, before anything is
   paid, saying what to do instead. */
function delveWays(state, player, action) {
  const name = state.objects[action.objectId]?.card ?? "That spell";
  const list = action.delveExile, yard = delvable(state, player, action.objectId);
  const {cost, extra, life} = delveCost(state, player, action);
  if (!Array.isArray(list) || !list.length || new Set(list).size !== list.length || !list.every((id) => yard.includes(id)) || list.length > cost.generic + extra)
    throw new Error(`Those cards cannot delve ${name}: pick cards of your graveyard again, no more than its generic mana`);
  return paymentOptions(poolFor(state, player, {spell: action.objectId}), lessGeneric(cost, extra, list.length), {life}, PAY_CHOICES);
}
/* The cards a delve picked, and what the pool pays besides: the one way there is, or the way its caster chose (`payWith`,
   X8b; asked once the cards are picked, performOffered), still a way now. */
function delved(state, player, action) {
  const name = state.objects[action.objectId]?.card ?? "That spell";
  const ways = delveWays(state, player, action);
  if (!ways.length) throw new Error(`Those cards and the mana in your pool cannot pay for ${name}: each card exiled pays {1}. Pick more cards, or add mana first`);
  const payment = action.payWith === undefined && ways.length === 1 ? ways[0] : ways.find((way) => paymentKey(way) === action.payWith);
  if (!payment) throw new Error(`That mana no longer pays the rest of ${name} with those cards: cast it again, and choose which mana pays from what is in your pool now`);
  return {ids: [...action.delveExile], payment};
}

/* Options naming objects, two that read alike numbered: "Wastes (1)", "Wastes (2)". */
function numbered(options) {
  for (const option of options) {
    const alike = options.filter((o) => o.label === option.label);
    if (alike.length > 1) alike.forEach((o, k) => { o.label = `${o.label} (${k + 1})`; });
  }
  return options;
}
/* An activated ability's cost, picked once the offer is taken: which permanents a sacrifice of many takes, or which counters
   "remove three counters from among ..." removes -- exactly that many. */
function activationCostChoice(state, {action, player}) {
  const object = state.objects[action.objectId];
  const name = object?.card ?? "That permanent";
  const ability = abilitiesOf(state, action.objectId).find((a) => a.id === action.abilityId);
  /* WATERBEND (CR 701.67a): which untapped artifacts and creatures of theirs to tap, each paying {1} of the waterbend cost --
     as few as leave the pool able to pay the rest, as many as that cost has generic mana -- then, the pool paying the rest more
     than one way, which mana (X8b; its own id, so a board that kept the first picks does not carry them into it). */
  if (action.waterbend === true) {
    if (!Array.isArray(action.waterbendTap)) {
      const range = waterbendRange(state, player, action.objectId, ability, action.x ?? 0, abilityLess(state, player, action.objectId, ability, action.targets));
      return {id: `choose-cost:${action.objectId}:${action.abilityId}`, title: `${name}: waterbend -- tap artifacts and creatures you control, each paying {1}`,
        mode: "many", min: range?.least ?? 0, max: range?.most ?? 0, cost: "waterbend",
        options: numbered(waterbenders(state, player).map((cardId, index) => ({index, label: state.objects[cardId].card, cardId})))};
    }
    return {id: `choose-cost:${action.objectId}:${action.abilityId}:pool`, title: `${name}: which mana pays the rest`, mode: "one", min: 1, max: 1, cost: "pool",
      options: abilityPayments(state, player, action).map((way, index) => ({index, label: paymentWords(way), key: paymentKey(way)}))};
  }
  if (action.countersLater) {
    const atom = countersAmongAtom(ability?.cost);
    const units = counterUnits(state, player, action.objectId, atom);
    return {id: `choose-cost:${action.objectId}:${action.abilityId}`, title: `${name}: remove ${inWords(atom.count)} ${atom.counter ? `${atom.counter} ` : ""}counter${atom.count === 1 ? "" : "s"}`,
      mode: "many", min: atom.count, max: atom.count, cost: "counters",
      options: numbered(units.map((u, index) => ({index, label: `${state.objects[u.id].card}: a ${u.counter} counter`, cardId: u.id, counter: u.counter})))};
  }
  const atom = sacrificeAtom(ability?.cost);
  const n = atom?.count ?? 1;
  return {id: `choose-cost:${action.objectId}:${action.abilityId}`, title: `${name}: sacrifice ${inWords(n)} permanent${n === 1 ? "" : "s"}`,
    mode: "many", min: n, max: n, cost: "sacrifice",
    options: numbered(sacrificeChoices(state, player, action.objectId, atom?.selector).map((cardId, index) => ({index, label: state.objects[cardId].card, cardId})))};
}

/* A CAST'S TERMS (CR 601.2b, 601.2f), reckoned from the action as it was taken: the commander tax, the free cast, the
   flashback, alternative or escape cost it is cast for, the permission it is cast through and the Citadel's life in place of
   its mana -- each null where the action does not take it or it is gone. The same for the question of how it is paid
   (costChoice) as for the payment (perform), so the ways asked about are the ways the payment takes. */
function castTerms(state, player, action) {
  const object = state.objects[action.objectId];
  const tax = object.zone === "command" ? commanderTax(state, player, action.objectId) : 0;
  /* Flashback (CR 702.34a): its cost rather than the mana cost, life and all. */
  const back = action.flashback ? flashbackCost(state, player, action.objectId) : null;
  /* Its alternative cost (CR 118.9), asked again now. */
  const way = action.disguise === true ? DISGUISE_WAY
    : action.alternative !== undefined ? alternativeCosts(state, player, action.objectId).find((w) => w.index === action.alternative) ?? null : null;
  /* Escape (CR 702.138a): its cost's mana rather than the mana cost, and the other cards its caster picked. */
  const fled = action.escape !== undefined ? escapeWays(state, player, action.objectId).find((w) => w.kind === action.escape) ?? null : null;
  /* Cast from a graveyard or a library by a permanent's permission (play-from): the one the caster chose, or the one there
     is -- and if it is the Citadel's, life equal to its mana value rather than its mana cost (lifeInstead). */
  const permission = !back && !fled && ["graveyard", "library", "exile"].includes(object.zone) ? playPermission(state, player, action.objectId, "spell", action.via ?? null) : null;
  const free = action.free ? (permission?.ability.free ? {source: permission.source, limited: false} : freeCast(state, player, action.objectId)) : null;
  const lifeCost = way ? null : free ? freeLife(object, free) : lifeInstead(object, permission);
  return {tax, free, back, way, fled, permission, lifeCost};
}
/* The ways the pool pays a cast taken with `payWays` (castOffers): its total cost, as perform reckons it. */
function castPayments(state, player, action) {
  const {tax, free, back, way, fled, permission, lifeCost} = castTerms(state, player, action);
  const reckoned = castCost(state, player, action.objectId, tax, Boolean(free), lifeCost !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : null, action.extraMana ?? "", action.targets);
  const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permission);
  return paymentOptions(poolFor(state, player, {spell: action.objectId}), cost,
    {life: state.players[player].life - (back?.life ?? 0) - (way?.life ?? 0) - (lifeCost ?? 0) - (action.extraLife ?? 0), x: x + (action.x ?? 0) * cost.variable}, PAY_CHOICES);
}
/* The life a cast owes beyond its mana, its alternative cost's and the Citadel's: an increase for what it targets (Terror of the
   Peaks; rules/statics.mjs, lifeIncrease) and an additional cost of X life (Toxic Deluge; lifeXAtom). */
/* And an additional cost's fixed life, a choice's (Redirect Lightning; additionalVariants, `extraLife`). */
function lifeOwed(state, player, action) {
  const object = state.objects[action.objectId];
  return (action.extraLife ?? 0) + lifeIncrease(state, player, action.objectId, action.targets) + (lifeXAtom(object?.spell?.additionalCost) ? action.x ?? 0 : 0);
}
/* The ways the pool pays an ability taken with `payWays`: its mana, as costPayment reckons it. */
function abilityPayments(state, player, action) {
  const object = state.objects[action.objectId];
  const ability = chosenFor(abilitiesOf(state, action.objectId).find((candidate) => candidate.id === action.abilityId), object);
  const found = ability ? costPayment(state, player, action.objectId, ability.cost, action.x ?? 0, abilityLess(state, player, action.objectId, ability, action.targets), undefined, bentFor(action)) : null;
  return found?.owed ? paymentOptions(poolFor(state, player, {ability: action.objectId}), found.owed.cost, found.owed.options, PAY_CHOICES) : [];
}

export function castCostChoice(state, awaiting) {
  return asCast(state, awaiting.action, () => costChoice(state, awaiting));
}
function costChoice(state, awaiting) {
  const {action, player} = awaiting;
  /* PAID FROM THE POOL, more than one way (X8b): which mana, and which life, pays it -- each way in words, named by its key.
     Asked before any other part of the cost, which is asked after with the way chosen. */
  if (action.payWays === true && action.payWith === undefined) {
    const ways = action.kind === "activate" ? abilityPayments(state, player, action) : castPayments(state, player, action);
    const name = state.objects[action.objectId]?.card ?? "That card";
    /* And for a spell, with rider mana among it -- mana that does something when spent, or whose source is asked after (rules/
       restricted-mana.mjs, riderChoices) -- each way to spend it its own answer, as a cast the pool pays one way offers them
       (`riders`; CR 601.2h: the caster chooses the mana). */
    const options = ways.flatMap((way) => (action.kind === "activate" ? null : riderChoices(state, player, {spell: action.objectId}, way.mana) ?? null)?.map((riders) => ({way, riders})) ?? [{way}])
      .map(({way, riders}, index) => ({index, label: `${paymentWords(way)}${riders?.length ? `, with the mana from ${ridersOffer(state, riders).riderNames.join(", ")}` : ""}`, key: paymentKey(way),
        ...(riders ? {riders} : {})}));
    return {id: `choose-cost:${action.objectId}${action.kind === "activate" ? `:${action.abilityId}` : ""}`, title: `${name}: which mana pays for it`,
      mode: "one", min: 1, max: 1, cost: "pool", options};
  }
  if (action.kind === "activate") return activationCostChoice(state, awaiting);
  const name = state.objects[action.objectId]?.card ?? "That card";
  /* "Tap any number of untapped creatures you control" (Burn at the Stake): which, from none up to all of them. */
  if (action.tapAny === true && !Array.isArray(action.tapChosen)) {
    const able = tapAnyChoices(state, player, action.objectId, additionalAtom(state.objects[action.objectId]?.spell?.additionalCost, "tapCreature"));
    return {id: `choose-cost:${action.objectId}`, title: `${name}: tap any number of untapped creatures you control`, mode: "many", min: 0, max: able.length,
      cost: "tapAny", options: numbered(able.map((cardId, index) => ({index, label: state.objects[cardId].card, cardId})))};
  }
  /* Behold (CR 701.4a): which permanents of theirs to choose and cards in their hand to reveal, exactly that many. */
  if (action.behold > 0 && !Array.isArray(action.beheld)) {
    const atom = beholdOf(state, player, action), n = atom?.count ?? 1, kind = (atom?.selector?.subtypes ?? [])[0] ?? "card";
    return {id: `choose-cost:${action.objectId}`, title: `${name}: behold ${inWords(n)} ${kind}${n === 1 ? "" : "s"}`, mode: "many", min: n, max: n, cost: "behold",
      options: numbered(beholdChoices(state, player, action.objectId, atom).map((c, index) => ({index, label: c.fromHand ? `${state.objects[c.id].card} (reveal it from your hand)` : state.objects[c.id].card,
        cardId: c.id, ...(c.fromHand ? {fromHand: true} : {})})))};
  }
  /* Escalate (CR 702.120a): which untapped creatures to tap, the cost's count again for each mode chosen beyond the first --
     the creatures a flashback cost's tap may take (flashbackTappers), the same words. */
  if (action.escalateTap > 0 && !Array.isArray(action.escalateTapped)) {
    const tap = {count: action.escalateTap, selector: escalateAtom(state.objects[action.objectId])?.tap?.selector ?? {}};
    return {id: `choose-cost:${action.objectId}`, title: `${name}'s escalate: tap ${tappersInWords(tap)}`, mode: "many", min: tap.count, max: tap.count, cost: "escalate",
      options: numbered(flashbackTappers(state, player, tap).map((cardId, index) => ({index, label: state.objects[cardId].card, cardId})))};
  }
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
    /* Then, the creatures picked and the pool paying the rest more than one way (convokeWays): which mana pays it, each way in
       words and named by its key -- the X8b question, asked as it is for a cast the pool pays alone (CR 601.2g-h: the caster
       pays the total cost, choosing the mana; 702.51a: each creature tapped pays {1} or one mana of its color). Its own id,
       so a board that kept the creatures' picks does not carry them into it. */
    if (Array.isArray(action.convokeTap)) {
      const ways = convokeWays(state, player, action);
      return {id: `choose-cost:${action.objectId}:pool`, title: `${name}: which mana pays the rest`, mode: "one", min: 1, max: 1, cost: "pool",
        options: ways.map((way, index) => ({index, label: paymentWords(way), key: paymentKey(way)}))};
    }
    const cost = convokeCost(state, player, action), creatures = convokers(state, player);
    const symbols = cost.generic + cost.symbols.filter((s) => (s.kind === "colored" && s.color !== "C") || s.kind === "hybrid").length;
    const alone = automaticPayment(poolFor(state, player, {spell: action.objectId}), cost, {life: state.players[player].life}) !== null;
    return {id: `choose-cost:${action.objectId}`, title: `${name}: tap creatures to convoke it`, mode: "many", min: alone ? 0 : 1, max: Math.min(creatures.length, symbols),
      cost: "convoke", options: named(creatures.map((c) => c.id))};
  }
  /* Delve (CR 702.66a): which cards of the caster's graveyard to exile, each paying {1} -- from the fewest the pool needs to as
     many as its generic mana (delveRange) -- then, the pool paying the rest more than one way, which mana (its own id, as
     convoke's). */
  if (action.delve === true) {
    if (Array.isArray(action.delveExile)) {
      const ways = delveWays(state, player, action);
      return {id: `choose-cost:${action.objectId}:pool`, title: `${name}: which mana pays the rest`, mode: "one", min: 1, max: 1, cost: "pool",
        options: ways.map((way, index) => ({index, label: paymentWords(way), key: paymentKey(way)}))};
    }
    const range = delveRange(state, player, action);
    return {id: `choose-cost:${action.objectId}`, title: `${name}: exile cards from your graveyard to delve it, each paying {1}`, mode: "many",
      min: range?.least ?? 1, max: range?.most ?? 0, cost: "delve", options: named(delvable(state, player, action.objectId))};
  }
  /* A graveyard alternative cost's other cards (Squee, Dubious Monarch): exactly that many of the rest of the graveyard. */
  const graveWay = action.alternative !== undefined ? alternativeCosts(state, player, action.objectId).find((w) => w.index === action.alternative) : null;
  if (graveWay?.exileOthers && !Array.isArray(action.othersExiled)) {
    const n = graveWay.exileOthers;
    return {id: `choose-cost:${action.objectId}`, title: `${name}: exile ${inWords(n)} other card${n === 1 ? "" : "s"} from your graveyard`, mode: "many", min: n, max: n,
      cost: "exileOthers", options: named(cardsIn(state, "graveyard", player).filter((id) => id !== action.objectId))};
  }
  /* A flashback cost's sacrifice (Dread Return; wave 4c, k2): exactly that many of the permanents it may take. */
  const sacrificing = action.flashback ? flashbackCost(state, player, action.objectId)?.sacrifice : null;
  if (sacrificing && !Array.isArray(action.flashbackSacrifice)) {
    const n = sacrificing.count;
    return {id: `choose-cost:${action.objectId}:sacrifice`, title: `${name}'s flashback: sacrifice ${inWords(n)} ${permanentWords(sacrificing.selector, n)}`, mode: "many", min: n, max: n,
      cost: "flashbackSacrifice", options: named(sacrificeChoices(state, player, null, sacrificing.selector))};
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
  /* Convoke's and "tap any number"'s, any number from its least to its most; the others, exactly as many as they take. */
  const counted = ["convoke", "tapAny", "waterbend", "delve"].includes(choice.cost) ? picked.length >= choice.min && picked.length <= choice.max : picked.length === choice.min;
  if (picked.length !== (indices ?? []).length || !counted || picked.some((i) => !choice.options[i]))
    throw new Error("Invalid selection");
  const ids = picked.map((i) => choice.options[i].cardId);
  /* The ways to tap, read as the question read them: as the card is cast (asCast) -- an Adventure as itself (CR 715.3a), so
     mana in the pool that would pay the creature but not its Adventure (Smaug, the Great Calamity's Spew Flame) is not read
     as paying it, which would leave no way to tap. */
  const way = choice.cost === "mana" ? asCast(state, awaiting.action, () => castTapPlans(state, awaiting.player, awaiting.action, TAP_CHOICES))[picked[0]] : null;
  const action = {...structuredClone(awaiting.action), ...(choice.cost === "pool" ? {payWith: choice.options[picked[0]].key, ...(choice.options[picked[0]].riders ? {payRiders: choice.options[picked[0]].riders} : {})} : way ? {tapPlan: way.key} : choice.cost === "tap" ? {flashbackTap: ids}
    : choice.cost === "flashbackSacrifice" ? {flashbackSacrifice: ids} : choice.cost === "delve" ? {delveExile: ids} : choice.cost === "convoke" ? {convokeTap: ids} : choice.cost === "waterbend" ? {waterbendTap: ids} : choice.cost === "tapAny" ? {tapChosen: ids} : choice.cost === "behold" ? {beheld: ids} : choice.cost === "exileOthers" ? {othersExiled: ids} : choice.cost === "sacrifice" ? {sacrificeSet: ids} : choice.cost === "escalate" ? {escalateTapped: ids}
    : choice.cost === "counters" ? {counterSet: picked.map((i) => ({id: choice.options[i].cardId, counter: choice.options[i].counter}))} : {escapeExile: ids})};
  state.awaiting = null;
  state.priorityPlayer = awaiting.player;
  return applyAction(state, awaiting.player, action);
}

/* The permanents a flashback cost sacrifices, as its caster picked them (Dread Return): that many, none twice, each one it may
   take now. Refused before anything moves. */
function flashbackSacrificed(state, player, action, sacrifice) {
  const list = action.flashbackSacrifice;
  const fitting = sacrificeChoices(state, player, null, sacrifice.selector);
  if (!Array.isArray(list) || list.length !== sacrifice.count || new Set(list).size !== list.length || !list.every((id) => fitting.includes(id)))
    throw new Error(`Those are not ${inWords(sacrifice.count)} ${permanentWords(sacrifice.selector, sacrifice.count)} you can sacrifice for its flashback`);
  return [...list];
}
/* What a cost's selector takes, in words: "creatures", "artifacts", "permanents". */
function permanentWords(selector, n) {
  const type = (selector?.types ?? [])[0];
  return `${type ? type.toLowerCase() : "permanent"}${n === 1 ? "" : "s"}`;
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

/* BEHOLD (CR 701.4a): "behold an Elf" is "reveal an Elf card from your hand or choose an Elf you control"; "behold three
   Elementals", three different objects, of either. A cost atom of a spell's -- an additional cost ("behold an Elf or pay {2}",
   Lys Alana Dignitary) or its flashback cost's (Kindle the Inner Flame) -- offered while there are that many to behold, which
   ones asked once the cast is taken (choose-cost, "behold"), never one offer per set of them. The spell itself is never one
   (it is on its way to the stack); a card from the hand is revealed to every player as the cost is paid (CR 701.20a), and a
   permanent is only chosen. */
const beholdAtom = (atoms) => (atoms ?? []).find((a) => a?.atom === "behold");
/* The behold of the cast an offer takes: its flashback cost's, or its additional cost's, a choice's looked into. */
const beholdOf = (state, player, action) => (action.flashback ? beholdAtom(flashbackCost(state, player, action.objectId)?.extra)
  : additionalAtom(state.objects[action.objectId]?.spell?.additionalCost, "behold"));
function beholdChoices(state, player, spellId, atom) {
  const context = {controller: player, source: spellId};
  const chosen = compileSelector({...(atom?.selector ?? {}), what: "permanent", controller: "you"});
  const revealed = compileSelector({...(atom?.selector ?? {}), what: "card", zone: "hand", controller: "you"});
  return [...state.zones.battlefield.filter((id) => chosen(state, id, context)).map((id) => ({id, fromHand: false})),
    ...cardsIn(state, "hand", player).filter((id) => id !== spellId && revealed(state, id, context)).map((id) => ({id, fromHand: true}))];
}
/* What its caster picked to behold: exactly that many, none twice, each still one it may behold. Refused before anything is
   paid, saying what to do instead. */
function beheldPicked(state, player, action) {
  const atom = beholdOf(state, player, action), able = beholdChoices(state, player, action.objectId, atom).map((c) => c.id);
  const list = action.beheld;
  if (!Array.isArray(list) || list.length !== (atom?.count ?? 1) || new Set(list).size !== list.length || !list.every((id) => able.includes(id)))
    throw new Error(`Those are not what ${state.objects[action.objectId]?.card ?? "that spell"} may behold: pick them again`);
  return [...list];
}

/* ESCALATE (CR 702.120a): the spell's escalate cost, as the card compiler put it among its additional costs -- its mana for each
   mode beyond the first, and its creatures to tap for each (`tap`: a count and a selector). */
const escalateAtom = (object) => (object?.spell?.additionalCost ?? []).find((a) => a?.atom === "escalate") ?? null;
/* The creatures escalate taps, as its caster picked them: that many, none twice, each untapped, theirs and fitting -- a
   summoning-sick one too, tapping it being no {T} of its own (CR 302.6). Refused before anything moves, saying what to do. */
function escalateTapped(state, player, action) {
  const tap = {count: action.escalateTap, selector: escalateAtom(state.objects[action.objectId])?.tap?.selector ?? {}};
  const list = action.escalateTapped, fitting = flashbackTappers(state, player, tap);
  if (!Array.isArray(list) || list.length !== tap.count || new Set(list).size !== list.length || !list.every((id) => fitting.includes(id)))
    throw new Error(`Those are not ${tappersInWords(tap)} to tap for its escalate: pick them again`);
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
 * One that says `zone: "graveyard"` -- "you may cast this card from your graveyard by paying {3}{R} and exiling four other
 * cards from your graveyard rather than paying its mana cost" (Squee, Dubious Monarch) -- is `fromGraveyard`, while that
 * many other cards are in its player's graveyard to exile (`exileOthers`, CR 118.3; which ones, asked once the cast is
 * taken): offered only for the card in its owner's graveyard (offers, castOffers), and the card's other ways never there.
 * It is no escape (CR 702.138): what it casts has not escaped.
 */
export function alternativeCosts(state, player, id) {
  const object = state.objects[id];
  return (object?.abilities ?? []).flatMap((ability, index) => {
    if (ability.kind !== "static" || ability.rule !== "alternative-cost") return [];
    if (!conditionHolds(state, ability.condition, {controller: player, source: id})) return [];
    const cost = ability.cost ?? [];
    const others = cost.filter((a) => a.atom === "exileFromGraveyard").reduce((n, a) => n + (a.count ?? 1), 0);
    if (ability.zone === "graveyard" && cardsIn(state, "graveyard", player).filter((c) => c !== id).length < others) return [];
    /* Sneak's "returning an unblocked creature you control to its owner's hand" (CR 702.190a): picked with the cast, as a
       sacrifice is (additionalChoices). */
    return [{index, mana: cost.find((a) => a.atom === "mana")?.cost ?? "", life: cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0),
      extra: cost.filter((a) => a.atom === "exileFromHand" || a.atom === "sacrifice" || a.atom === "returnToHand"), evoke: ability.evoke === true,
      /* Warp (CR 702.185a): "from your hand", and from nowhere else (castOffers). */
      ...(ability.fromHand === true ? {fromHand: true} : {}),
      /* Sneak (CR 702.190a): cast at an instant's timing, its condition saying when (castOffers). */
      ...(ability.sneak === true ? {sneak: true} : {}),
      /* Impending (CR 702.176a): how many time counters it enters with. */
      ...(Number.isInteger(ability.impending) ? {impending: ability.impending} : {}),
      /* Overload (CR 702.96b): what the spell does cast this way, "each" in place of "target". */
      ...(ability.overload ? {overload: ability.overload} : {}),
      ...(ability.zone === "graveyard" ? {fromGraveyard: true, exileOthers: others} : {}),
      /* Prowl (CR 702.76a): the permanent it becomes was cast for it (rules/stack.mjs). */
      ...(ability.prowl === true ? {prowl: true} : {}),
      /* Surge (CR 702.117a), freerunning (CR 702.173a): the keyword whose cost this is, for "if its surge cost was paid". */
      ...(typeof ability.paidFor === "string" ? {paidFor: ability.paidFor} : {})}];
  });
}

/* The other cards of the graveyard a graveyard alternative cost exiles, as its caster picked them: that many, none twice,
   each another card in their graveyard. Refused before anything moves, saying what to do instead. */
function othersPicked(state, player, action, way) {
  const list = action.othersExiled;
  const others = cardsIn(state, "graveyard", player).filter((id) => id !== action.objectId);
  if (!Array.isArray(list) || list.length !== way.exileOthers || new Set(list).size !== list.length || !list.every((id) => others.includes(id)))
    throw new Error(`Those are not ${inWords(way.exileOthers)} other cards in your graveyard: pick the cards to exile for ${state.objects[action.objectId]?.card ?? "that spell"} again`);
  return [...list];
}

/* A spell's additional cost (CR 601.2b, 601.2h): "As an additional cost to cast this spell, discard a card" or
   "sacrifice a creature". The player chooses what as they cast, so each choice is its own offer, as targets are --
   one per card that could be discarded (never the spell itself) or permanent that could be sacrificed. An additional
   cost nobody could pay leaves the spell unoffered. */
/* "As an additional cost to cast this spell, blight 1 or pay {3}" (Bogslither's Embrace; `{atom: "oneOf", options}`): each
   choice between additional costs a variant of the cast of its own -- its mana (`mana`) added to what the cast costs, the
   rest (`atoms`) picked as any additional cost is (additionalChoices). A spell without a choice has the one variant. */
/* MULTIKICKER (CR 702.33c): "you may pay an additional [cost] any number of times" -- each number of times its own cast, from
   none up to `MULTIKICK_MOST` (a cast that cannot be paid is not offered), that many times its mana added. */
const MULTIKICK_MOST = 10;
function additionalVariants(costs) {
  let variants = [{atoms: [], mana: ""}];
  for (const atom of costs ?? []) {
    /* ESCALATE (CR 702.120a): for each mode chosen beyond the first, its cost again -- each number of extra modes its own
       variant, its mana added that many times and its creatures to tap that many times over (`escalateTap`, picked once the
       cast is taken: castCostChoice). The modes are then exactly that many more than one (withModes). */
    if (atom?.atom === "escalate") {
      variants = variants.flatMap((v) => Array.from({length: (atom.most ?? 0) + 1}, (_, k) => ({...v, mana: v.mana + (atom.mana ?? "").repeat(k), escalate: k,
        ...(atom.tap && k > 0 ? {escalateTap: {count: atom.tap.count * k, selector: atom.tap.selector}} : {})})));
      continue;
    }
    if (atom?.atom === "multikicker") {
      variants = variants.flatMap((v) => Array.from({length: MULTIKICK_MOST + 1}, (_, k) => ({...v, mana: v.mana + (atom.cost ?? "").repeat(k), kicked: k})));
      continue;
    }
    /* REPLICATE (CR 702.56a; Lose Focus, Train E): "you may pay [cost] any number of times" -- as multikicker's, each number of
       times its own cast, that many times its mana added (`replicated`, the copies its trigger makes). */
    if (atom?.atom === "replicate") {
      variants = variants.flatMap((v) => Array.from({length: MULTIKICK_MOST + 1}, (_, k) => ({...v, mana: v.mana + (atom.cost ?? "").repeat(k), replicated: k})));
      continue;
    }
    /* GIFT (CR 702.174a; Dawn's Truce, wave 4b): "as an additional cost to cast this spell, you may choose an opponent" -- the
       spell cast without the gift, and with it, the opponent its caster chooses another offer each (castOffers, `gift`). */
    if (atom?.atom === "gift") {
      variants = variants.flatMap((v) => [v, {...v, gift: true}]);
      continue;
    }
    /* OFFSPRING [cost] (CR 702.175a; Coruscation Mage, wave 4c): "you may pay an additional [cost] as you cast this spell" --
       once at most (its ruling), so two variants: without it, and with its mana added (`offspring`, rules/stack.mjs marks the
       permanent it becomes, for its trigger's "if its offspring cost was paid"). */
    if (atom?.atom === "offspring") {
      variants = variants.flatMap((v) => [v, {...v, mana: v.mana + (atom.cost ?? ""), offspring: true}]);
      continue;
    }
    /* TIERED (CR 702.183a): one mode, and its cost -- each mode its own variant, that mode alone (withModes), its cost added. */
    if (atom?.atom === "tiered") {
      variants = variants.flatMap((v) => (atom.costs ?? []).map((cost, tier) => ({...v, mana: v.mana + cost, tier})));
      continue;
    }
    const options = atom?.atom === "oneOf" ? atom.options ?? [] : [[atom]];
    /* "As an additional cost to cast this spell, pay 5 life or pay {2}" (Redirect Lightning; CR 601.2b, 119.4): a choice's
       life, a fixed amount, paid with the rest of the cost (`life`, the offer's `extraLife`) -- not a cost to pick. */
    const fixedLife = (a) => a.atom === "payLife" && Number.isInteger(a.amount);
    variants = variants.flatMap((v) => options.map((option) => ({...v, atoms: [...v.atoms, ...option.filter((a) => a.atom !== "mana" && !fixedLife(a))],
      mana: v.mana + option.filter((a) => a.atom === "mana").map((a) => a.cost ?? "").join(""),
      ...(option.some(fixedLife) ? {life: (v.life ?? 0) + option.filter(fixedLife).reduce((n, a) => n + a.amount, 0)} : {})})));
  }
  return variants;
}
/* An additional cost's atom of a kind, a choice's options looked into ("blight 1 or pay {3}": its blight). */
const additionalAtom = (costs, kind) => (costs ?? []).flatMap((a) => (a?.atom === "oneOf" ? (a.options ?? []).flat() : [a])).find((a) => a?.atom === kind);

/* "AS AN ADDITIONAL COST TO CAST THIS SPELL, TAP ANY NUMBER OF UNTAPPED CREATURES YOU CONTROL" (Burn at the Stake; CR 601.2b,
   601.2h): `tapCreature` with `count: "any"` -- none up to every one, so the cast is one offer and which ones are asked once
   it is taken (choose-cost, "tapAny"), never an offer per set of them (2^n). A summoning-sick creature may be tapped: it is
   not its own {T} (CR 302.6). */
const tapAnyAtom = (costs) => (costs ?? []).find((a) => a?.atom === "tapCreature" && a.count === "any");
const tapAnyChoices = (state, player, spellId, atom) => state.zones.battlefield.filter((id) => !state.objects[id].tapped
  && characteristicsOf(state, id).controller === player
  && compileSelector({...(atom?.selector ?? {}), what: "permanent"})(state, id, {controller: player, source: spellId}));
/* The creatures its caster picked: none twice, each still an untapped creature of theirs the cost describes. Refused before
   anything is paid, saying what to do instead. */
function tapAnyPicked(state, player, action) {
  const name = state.objects[action.objectId]?.card ?? "That spell";
  const able = tapAnyChoices(state, player, action.objectId, additionalAtom(state.objects[action.objectId]?.spell?.additionalCost, "tapCreature"));
  const list = action.tapChosen;
  if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every((id) => able.includes(id)))
    throw new Error(`Those are not untapped creatures you control: pick the creatures to tap for ${name} again`);
  return [...list];
}

function additionalChoices(state, player, spellId, costs) {
  let choices = [{}];
  for (const atom of costs ?? []) {
    let options = [];
    /* "Discard two cards" (Cathartic Reunion): each set of that many cards in the hand, never the spell itself, one offer
       each (discardSets, as an ability's "discard two cards" is); a card alone for one, as it always was. Too few, and none. */
    if (atom.atom === "discard") options = discardSets(cardsIn(state, "hand", player).filter((id) => id !== spellId), atom.count ?? 1).map((d) => ({discard: d}));
    /* "Exile a blue card from your hand" (Force of Will): a card the selector describes, never the spell itself. */
    if (atom.atom === "exileFromHand") {
      const matches = compileSelector({...(atom.selector ?? {}), what: "card", zone: "hand", controller: "you"});
      options = cardsIn(state, "hand", player).filter((id) => id !== spellId && matches(state, id, {controller: player})).map((id) => ({exile: id}));
    }
    if (atom.atom === "sacrifice") {
      const alternatives = Array.isArray(atom.selector?.anyOf) ? atom.selector.anyOf : [atom.selector ?? {}];
      const matchers = alternatives.map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
      options = state.zones.battlefield.filter((id) => matchers.some((m) => m(state, id, {controller: player})) && !cantBeSacrificed(state, id)).map((id) => ({sacrifice: id}));
    }
    /* "Returning an unblocked creature you control to its owner's hand" (sneak, CR 702.190a): each such creature its own offer. */
    if (atom.atom === "returnToHand") {
      const matches = compileSelector({...(atom.selector ?? {}), what: "permanent", controller: "you"});
      options = state.zones.battlefield.filter((id) => matches(state, id, {controller: player})).map((id) => ({returnToHand: id}));
    }
    /* "Blight 1" (Cinder Strike): a creature of the caster's for the counters, one offer each -- and "you may" (`optional`),
       the offer that pays nothing too, first. */
    if (atom.atom === "blight") options = [...(atom.optional === true ? [{}] : []), ...blightChoices(state, player).map((id) => ({blight: id}))];
    choices = choices.flatMap((chosen) => options.filter((o) => !Object.values(chosen).includes(Object.values(o)[0])).map((o) => ({...chosen, ...o})));
  }
  return choices;
}

/* MODES CHOSEN AS IT IS CAST (CR 700.2a, 601.2b): one offer per choice of modes -- as many as it says, or up to more
   when its condition holds now ("if you control a commander as you cast this spell, you may choose both instead") --
   and per way to choose the chosen modes' targets (601.2c), in the order of the modes. A mode is chosen once (700.2d). */
/* `exactly`: so many modes and no other number (escalate's variant, additionalVariants; the compiler holds it to what the spell
   allows, cards/index.mjs). `only`: that one mode and no other (tiered's variant, CR 702.183a: its cost is that mode's). */
/* "CHOOSE UP TO FOUR. YOU MAY CHOOSE THE SAME MODE MORE THAN ONCE" (Moment of Reckoning; CR 700.2d): `choose: 0`, none chosen a
   choice too ("up to"), and `sameMode`, as many as it says whatever the number of modes -- each mode again after itself, so
   each choice is offered once, its modes in the order they are written, which is the order they are followed in; the
   relative order of one mode chosen twice is the order of their targets, each asked in turn (script/bind.mjs, modalScript). */
/* "CHOOSE THREE. You may choose the same mode more than once" (Eldrazi Confluence; CR 700.2d): `sameMode` beside a `choose` of
   its own, no "up to" -- exactly that many. */
function withModes(state, base, modal, context, exactly = null, only = null) {
  const least = exactly ?? (modal.choose === 0 ? 0 : Math.max(1, modal.choose ?? 1));
  const most = exactly ?? (modal.sameMode ? modal.upTo ?? least : Math.min(modal.modes.length, modal.more && conditionHolds(state, modal.more.condition, context) ? modal.more.choose : modal.upTo ?? least));
  const picks = [];
  const pick = (from, chosen) => {
    if (chosen.length >= least) picks.push(chosen);
    if (chosen.length === most) return;
    for (let i = from; i < modal.modes.length; i += 1) pick(modal.sameMode ? i : i + 1, [...chosen, i]);
  };
  if (Number.isInteger(only)) picks.push([only]);
  else pick(0, []);
  return picks.flatMap((modes) => {
    const {targets: specs, effects} = modalScript(modal, modes);
    const hostile = isHostile(effects);
    return targetChoices(state, specs, context).map((targets) => ({...base, modes, targets, targetNames: targets.map((t) => targetName(state, t)), hostile}));
  });
}

/* An activated ability's offers: one per choice of modes and their targets when its modes are chosen as it is activated
   (cards/index.mjs, `modal`; CR 700.2), or per way to choose its targets -- or the one way `aim` (abilityAims). */
const withModesOrTargets = (state, base, ability, context, aim = null) => (ability.modal ? withModes(state, base, ability.modal, context) : withTargets(state, base, ability, context, aim));

/* A COST THAT READS ITS TARGETS (CR 601.2c, then 601.2f; 602.2b): "this spell costs {1} less to cast if it targets an attacking
   creature" (Run Behind), "this ability costs {1} less to activate for each +1/+1 counter on the creature it targets" (Warrior's
   Blades), "equip abilities you activate that target this creature cost {2} less" (Dwarven Mauler). The targets are chosen
   before the total cost is determined, so each way to choose them is an aim of its own, costed and offered on its own; a cost
   that reads none has the one aim, null, its targets chosen with the offer as ever (withTargets). A spell's own reduction
   says what it reads (`targeting`); an activated ability's reads them through its `costLess`, or as an equip ability. */
/* Or when a permanent's static makes spells cost more for what they target ("spells your opponents cast that target this
   creature cost an additional 3 life to cast", Terror of the Peaks; rules/statics.mjs, costsReadTargets). */
const aimsFor = (state, object, spell, context) => ((object.abilities ?? []).some((a) => a.kind === "static" && a.rule === "this-costs-less" && a.targeting)
  || costsReadTargets(state) ? targetChoices(state, spell?.targets ?? [], context) : [null]);
/* "AS AN ADDITIONAL COST TO CAST THIS SPELL, PAY X LIFE" (Toxic Deluge, wave 4b; CR 601.2b, 107.3a): X announced as it is
   cast -- one offer for each value its caster's life can pay, from none up (CR 119.4: no more life than they have; 119.4b: 0
   always) -- and the X its effects read (`x`), whether or not its mana cost is paid (the card's ruling: it has no {X} in its
   mana cost, so CR 107.3b does not make it 0). */
const lifeXAtom = (costs) => (costs ?? []).find((a) => a?.atom === "payLife" && a.amount === "X") ?? null;
const abilityAims = (state, ability, context) => (ability.costLess !== undefined || ability.equip === true
  ? targetChoices(state, ability.targets ?? [], context) : [null]);

/* One offer per way to choose the targets (script/bind.mjs); a single offer, unchanged, when there are none. `aim`: the one
   way already chosen, its cost reckoned with it (aimsFor). */
function withTargets(state, base, ability, context, aim = null) {
  const specs = ability?.targets ?? [];
  if (!specs.length) return [base];
  const hostile = ability.hostile === true || isHostile(ability.effects);
  return (aim ? [aim] : targetChoices(state, specs, context)).map((targets) => ({
    ...base, targets, targetNames: targets.map((t) => targetName(state, t)), hostile,
  }));
}

/* A mana cost of generic mana only, at least one: what waterbend is paid in (CR 701.67a). */
const genericOnly = (text) => { try { const parsed = parseManaCost(text ?? ""); return parsed.generic >= 1 && parsed.symbols.every((s) => s.kind === "generic"); } catch { return false; } };
/* The cost atoms 2.4 can pay. `costPayment` says whether all of an ability's can be paid now, and how. */
const COST_ATOMS_BUILT = ["{T}", "mana", "payLife", "sacrifice"];
export const costAtomBuilt = (atom) => (COST_ATOMS_BUILT.includes(atom?.atom) && (atom.atom !== "sacrifice" || atom.self === true || (atom.selector && typeof atom.selector === "object"))
  /* Life: a number, or counted as the cost is paid (War Room; script/amount.mjs). */
  && (atom.atom !== "payLife" || (Number.isInteger(atom.amount) && atom.amount >= 0) || (isCounted(atom.amount) && !amountProblems(atom.amount).length)))
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
  /* "Tap another untapped creature you control" (station, CR 702.184a): which one, chosen as it is activated (tapChoices);
     "tap three untapped creatures you control" (Kithkeeper): `count`, which set (tapSets). */
  || (atom?.atom === "tapCreature" && Boolean(atom.selector) && typeof atom.selector === "object" && (atom.count === undefined || (Number.isInteger(atom.count) && atom.count >= 1)))
  /* "Untap a tapped creature you control", "untap two" (Halo Fountain, batch 75): which, chosen as it is activated (untapChoices). */
  || (atom?.atom === "untapCreature" && Number.isInteger(atom.count) && atom.count >= 1)
  /* "Exile this card from your graveyard" (encore, CR 702.141a): an ability of the card in its owner's graveyard. */
  || (atom?.atom === "exileFromGraveyard" && atom.self === true)
  /* "Exile a creature card from your graveyard" (Lorehold Excavation): one card of the player's graveyard the selector
     describes, chosen as it is activated -- each its own offer (graveyardChoices). */
  || (atom?.atom === "exileFromGraveyard" && atom.self !== true && (atom.count ?? 1) === 1 && Boolean(atom.selector) && typeof atom.selector === "object")
  /* "Exile this creature" (Hanged Executioner): the permanent itself, from the battlefield. */
  || (atom?.atom === "exile" && atom.self === true)
  /* "Remove a counter from this creature" (Burdened Stoneback): one counter on it, of whichever kind is chosen as it is
     activated -- one offer for each kind it has. */
  || (atom?.atom === "removeAnyCounter" && atom.self === true && (atom.count ?? 1) === 1)
  /* "Blight 1" (Gristle Glutton; CR 701.68a): N -1/-1 counters on a creature its controller controls, chosen as it is
     activated -- one offer for each. */
  || (atom?.atom === "blight" && Number.isInteger(atom.count ?? 1) && (atom.count ?? 1) >= 1)
  /* "Remove three counters from among other artifacts, creatures, and planeswalkers you control" (Tekuthal, Inquiry
     Dominus): `count` counters of any kinds on the permanents `selector` describes, which ones asked once the offer is
     taken (countersAmong). */
  || (atom?.atom === "removeCountersAmong" && Number.isInteger(atom.count) && atom.count >= 1 && Boolean(atom.selector) && typeof atom.selector === "object"
    /* "Remove a +1/+1 counter from a creature you control" (Bolrac-Clan Crusher): of that kind only (`counter`). */
    && (atom.counter === undefined || typeof atom.counter === "string"))
  /* "Waterbend {3}" (Giant Koi; CR 701.67a): generic mana, some or all of it paid by tapping artifacts and creatures. */
  || (atom?.atom === "waterbend" && genericOnly(atom.cost))
  /* "Pay eight {E}" (Salvation Colossus's unearth; CR 107.14): that many energy counters removed from the player paying. */
  || (atom?.atom === "payEnergy" && Number.isInteger(atom.count) && atom.count >= 1)
  /* "{R}{W}, Unattach this Equipment: ..." (Sunforger; CR 701.3d): the source moved off what it is attached to -- payable only
     while it is attached to something (CR 118.3). */
  || (atom?.atom === "unattach" && atom.self === true);

/* CREW (CR 702.122a): the sets of other untapped creatures you control whose power totals at least N -- each smallest
   such set, so no offer taps a creature it does not need; ids ascending, and no more than CREW_OFFERS_MAX of them. A
   summoning-sick creature may crew. "This token crews Vehicles as though its power were 2 greater" (`crews-with-more`). */
const CREW_OFFERS_MAX = 64;
const crewPower = (state, id) => Math.max(0, characteristicsOf(state, id).power ?? 0)
  /* Of its abilities as they are after layer 6 (CR 613.1f). */
  + staticAbilities(state)(id).filter((a) => a.kind === "static" && a.rule === "crews-with-more").reduce((n, a) => n + (a.amount ?? 0), 0);
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
/* "Tap another untapped creature you control" (station; the selector's `another`), "tap an untapped Ally you control"
   (Boiling Rock Rioter: itself among them, CR 109.5 -- the cost says no "other"): each one it may be, one offer each -- a
   summoning-sick one too, since it is not its own {T} (CR 302.6). */
const tapChoices = (state, player, sourceId, selector) => state.zones.battlefield.filter((id) => state.objects[id].controller === player
  && !state.objects[id].tapped && compileSelector({...selector, what: "permanent"})(state, id, {controller: player, source: sourceId}));
/* "Tap three untapped creatures you control" (Kithkeeper): each set of `count` of them, ids ascending, no more than
   CREW_OFFERS_MAX (as crew). Its own source may be among them, since the cost says no "other" (a selector's `another` says
   so when one does), and a summoning-sick one too: none of it is the creature's own {T} (CR 302.6). Too few, and none.
   Unless the cost is also its own {T} (`ownTap`; "{T}, Tap two untapped creatures you control", Harmonized Trio //
   Brainstorm): the {T} taps it, so it is no untapped creature for the rest of the cost to tap (CR 602.2b, 601.2h) -- as a
   mana ability's (manaTappers). */
function tapSets(state, player, sourceId, selector, count, ownTap = false) {
  const able = state.zones.battlefield.filter((id) => !state.objects[id].tapped && characteristicsOf(state, id).controller === player
    && !(ownTap && id === sourceId)
    && compileSelector({...selector, what: "permanent"})(state, id, {controller: player, source: sourceId})).sort((a, b) => a - b);
  const sets = [];
  const walk = (from, chosen) => {
    if (sets.length >= CREW_OFFERS_MAX) return;
    if (chosen.length === count) { sets.push(chosen); return; }
    for (let i = from; i < able.length; i += 1) walk(i + 1, [...chosen, able[i]]);
  };
  walk(0, []);
  return sets;
}

/* Whether an ability is within its limit this turn ("activate only once each turn", CR 602.5b), and an exhaust ability
   not yet activated by this object (CR 702.177a). */
const withinLimit = (state, id, ability) => (!ability.limit || usesThisTurn(state, id, ability.id) < ability.limit)
  && !(ability.exhaust && (state.objects[id]?.exhausted ?? []).includes(ability.id));
/* Whether a mana ability's "mill N cards" can be paid: that many cards in its controller's library (CR 118.3, 701.17). */
const millPayable = (state, player, ability) => !ability.millCost || cardsIn(state, "library", player).length >= ability.millCost;
/* Whether a mana ability's counters can be paid: every removal has the counters to remove. */
const countersPayable = (state, id, costs) => (costs ?? []).every((c) => c.put || (state.objects[id].counters?.[c.counter] ?? 0) >= c.count);
/* A cost's counters (CR 602.2b, 606.4): put on by the player paying it -- "twice that many instead" sees them (a loyalty
   ability's +1, Wall of Roots' -0/-1; rules/statics.mjs, placeCounters), but not "if an effect would put" (Doubling Season's
   ruling: a cost is no effect) -- or removed. */
function payCounters(state, id, costs, by = null) {
  const counters = state.objects[id].counters;
  for (const c of costs ?? []) counters[c.counter] = Math.max(0, (counters[c.counter] ?? 0) + (c.put ? placeCounters(state, {id}, c.counter, c.count, by, {cost: true}).count : -c.count));
}

/* A SACRIFICE OF MANY (Bolas's Citadel: "sacrifice ten nonland permanents"): one offer for each set while the sets are
   few, as "sacrifice two other creatures" always was; past CREW_OFFERS_MAX of them, one offer (`sacrificeLater`), which
   ones asked once it is taken (choose-cost) and before anything is paid (CR 602.2b, 601.2h) -- ten of twenty permanents
   would be 184,756 offers. */
const setsOf = (n, k) => { let c = 1; for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1); return Math.round(Math.max(0, c)); };
const sacrificesLater = (state, player, sourceId, atom) => Boolean(atom) && (atom.count ?? 1) > 1
  && setsOf(sacrificeChoices(state, player, sourceId, atom.selector).length, atom.count ?? 1) > CREW_OFFERS_MAX;
/* "REMOVE THREE COUNTERS FROM AMONG OTHER ARTIFACTS, CREATURES, AND PLANESWALKERS YOU CONTROL" (Tekuthal): every counter on
   the permanents its selector describes, the player's own, each one a unit to choose -- of any kind, from any of them; or of
   the one kind it names (`counter`: "remove a +1/+1 counter from a creature you control", Bolrac-Clan Crusher). */
const countersAmongAtom = (cost) => (cost ?? []).find((a) => a?.atom === "removeCountersAmong");
function counterUnits(state, player, sourceId, atom) {
  const holds = compileSelector({...atom.selector, what: "permanent", controller: "you"});
  const units = [];
  for (const id of state.zones.battlefield) {
    if (!holds(state, id, {controller: player, source: sourceId})) continue;
    for (const [counter, n] of Object.entries(state.objects[id].counters ?? {})) {
      if (atom.counter !== undefined && counter !== atom.counter) continue;
      for (let i = 0; i < n; i += 1) units.push({id, counter});
    }
  }
  return units;
}
/* The counters an offer's player picked (`counterSet`): that many, each a counter there now, none counted twice. */
function countersPicked(state, player, sourceId, atom, picked) {
  if (!Array.isArray(picked) || picked.length !== atom.count) return false;
  const left = new Map();
  for (const {id, counter} of counterUnits(state, player, sourceId, atom)) left.set(`${id}:${counter}`, (left.get(`${id}:${counter}`) ?? 0) + 1);
  for (const one of picked) {
    const key = `${one?.id}:${one?.counter}`;
    if (!(left.get(key) > 0)) return false;
    left.set(key, left.get(key) - 1);
  }
  return true;
}
/* "Sacrifice a creature: ..." (Viscera Seer, Ashnod's Altar, Phyrexian Tower): a cost the player chooses as they activate
   (CR 602.2b, 601.2h), so each permanent they could sacrifice is its own offer, as with a spell's additional cost. Only
   their own (CR 701.21a); "another" leaves out the source itself. */
function sacrificeChoices(state, player, sourceId, given) {
  /* "Sacrifice a creature of the chosen type" (Etchings of the Chosen): its source's choice. */
  const selector = namesChosen(given) ? withChosen(given, state.objects[sourceId]?.chosen) : given;
  const matches = (Array.isArray(selector?.anyOf) ? selector.anyOf : [selector ?? {}])
    .map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
  /* Never one that can't be sacrificed (Alexios; rules/statics.mjs): a cost it can't pay. */
  return state.zones.battlefield.filter((id) => matches.some((m) => m(state, id, {controller: player, source: sourceId})) && !cantBeSacrificed(state, id));
}
const sacrificeAtom = (cost) => (cost ?? []).find((a) => a?.atom === "sacrifice" && a.selector);
/* "EXILE A CARD FROM YOUR GRAVEYARD" AS A COST (Lorehold Excavation; Rubble Rouser's mana ability; CR 602.2b, 601.2h): the
   cards of the player's own graveyard the selector describes -- one offer each, as a discard is. A permanent's source is
   never among them; a card's own, in that graveyard, is unless the selector says `another` (abilityOffers). */
const graveyardAtom = (cost) => (cost ?? []).find((a) => a?.atom === "exileFromGraveyard" && a.self !== true);
const graveyardChoices = (state, player, sourceId, selector) => {
  const fits = compileSelector({...(selector ?? {}), what: "card", zone: "graveyard"});
  return cardsIn(state, "graveyard", player).filter((id) => fits(state, id, {controller: player, source: sourceId}));
};
const returnAtom = (cost) => (cost ?? []).find((a) => a?.atom === "returnToHand" && a.selector);
const discardAtom = (cost) => (cost ?? []).find((a) => a?.atom === "discard" && a.self !== true);
const blightAtom = (cost) => (cost ?? []).find((a) => a?.atom === "blight");
/* The creatures a player controls that a blight cost may put its counters on: any of them, the source itself included. */
const blightChoices = (state, player) => state.zones.battlefield.filter((id) => characteristicsOf(state, id).controller === player
  && characteristicsOf(state, id).types.includes("Creature"));
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

/* `taps`: how many artifacts and creatures its waterbend cost is paid with (CR 701.67a) -- never more than that cost's generic
   mana, nor than is left to pay, or it is not paid at all. */
function costPayment(state, player, id, cost, x = 0, less = 0, key = undefined, taps = 0) {
  const object = state.objects[id];
  let mana = null, life = 0, owed = null;
  /* The pool's one way to pay this mana, or the way `key` names (X8b); more than one way and none named, and the ability is
     offered all the same, its way asked once it is taken (`owed`, the mana and how it is asked of the pool). */
  const pay = (bill, options) => {
    const pool = poolFor(state, player, {ability: id});
    const one = chosenPayment(pool, bill, options, key);
    if (one) return one;
    if ((key === undefined || key === null) && canPay(pool, bill, options)) { owed = {cost: bill, options}; return null; }
    return undefined;
  };
  /* "Abilities your opponents activate cost {1} more to activate unless they're mana abilities" (Tithe Taker; CR 602.2b,
     601.2f): generic mana added to the total cost, the increase before any reduction. A mana ability is never paid here
     (manaOffers), and an ability with no mana in its cost -- a loyalty ability, "{T}: ..." -- now has that much to pay. */
  const more = abilityCostIncrease(state, player);
  let printedMana = false;
  for (const atom of cost ?? []) {
    if (!costAtomBuilt(atom)) return null;
    if (atom.atom === "discard" && atom.self === true && object.zone !== "hand") return null;
    if (atom.atom === "{T}") {
      if (object.tapped) return null;
      /* CR 302.6: a creature's {T} ability waits until it has been yours since your turn began -- unless it may be
         activated as though it had haste (Thousand-Year Elixir, CR 702.10c). */
      if (sickForAbilities(state, id)) return null;
    }
    if (atom.atom === "mana" || atom.atom === "waterbend") {
      if (printedMana) return null;
      printedMana = true;
      const printed = parseManaCost(atom.cost);
      printed.generic += more;
      /* Generic mana only, never below nothing (CR 601.2f). */
      printed.generic -= Math.min(printed.generic, Math.max(0, less));
      /* Waterbend (CR 701.67a-b): each permanent tapped pays {1} of the waterbend cost's own generic mana -- an increase on
         it is mana, and is paid from the pool -- the rest from the pool. More tapped than is left to pay leaves less than
         nothing to pay, which no pool pays (rules/mana.mjs). */
      if (atom.atom === "waterbend") {
        if (taps > parseManaCost(atom.cost).generic) return null;
        printed.generic -= taps;
      }
      /* {X} in an ability's cost: X generic for each X symbol (CR 107.3, 602.2b). */
      /* The pool, and mana that may be spent only on an ability of this source (rules/restricted-mana.mjs). */
      mana = pay(printed, {life: state.players[player].life, x: x * printed.variable});
      if (mana === undefined) return null;
    }
    /* CR 119.4: a player can pay life only if their life total is at least the amount. "Pay life equal to the number of
       colors in your commanders' color identity" (War Room): counted now (CR 602.2b, 601.2f), and unpayable for a player with
       no commander (CR 903.4f) -- one with a colorless commander pays 0 life, which a player always can (119.4b). */
    if (atom.atom === "payLife") {
      if (commanderless(state, atom.amount, {controller: player})) return null;
      life += amountOf(state, atom.amount ?? 0, {controller: player, source: id});
    }
    /* A −X loyalty cost is offered only for the X it can pay (abilityXValues). */
    if (atom.atom === "removeCounters" && atom.count !== "X" && (object.counters?.[atom.counter] ?? 0) < (atom.count ?? 1)) return null;
    /* Three counters from among them: there must be three there to remove (CR 118.3). */
    if (atom.atom === "removeCountersAmong" && counterUnits(state, player, id, atom).length < atom.count) return null;
    /* Energy (CR 107.14): no more than the player has (CR 118.3). */
    if (atom.atom === "payEnergy" && (state.players[player].counters?.energy ?? 0) < atom.count) return null;
    /* Unattach this Equipment (Sunforger; CR 701.3d): attached to nothing, there is nothing to unattach, and the cost can't be
       paid (CR 118.3). */
    if (atom.atom === "unattach" && state.objects[object.attachedTo]?.zone !== "battlefield") return null;
  }
  /* The increase on an ability that printed no mana: that much generic, from the pool (as its own mana would be). */
  if (!printedMana && more > 0) {
    const increase = parseManaCost(`{${more}}`);
    increase.generic -= Math.min(increase.generic, Math.max(0, less));
    mana = pay(increase, {life: state.players[player].life});
    if (mana === undefined) return null;
  }
  if (life + (mana?.life ?? 0) > state.players[player].life) return null;
  return {mana, life, ...(owed ? {payWays: true, owed} : {})};
}

/* WATERBEND (CR 701.67a): "Waterbend {3}" is "pay {3}; for each generic mana in it, you may tap an untapped artifact or
   creature you control rather than pay that mana" -- a summoning-sick creature too, tapping it being no {T} of its own (CR
   302.6). The fewest and the most an ability's waterbend cost may tap now, the pool paying the rest; null when none would pay
   it, or the ability has no waterbend. */
const waterbendAtom = (cost) => (cost ?? []).find((a) => a?.atom === "waterbend");
const waterbenders = (state, player) => state.zones.battlefield.filter((id) => !state.objects[id].tapped && controllerOf(state, id) === player
  && characteristicsOf(state, id).types.some((t) => t === "Artifact" || t === "Creature"));
function waterbendRange(state, player, id, ability, x, less) {
  const atom = waterbendAtom(ability?.cost);
  if (!atom) return null;
  const payable = [];
  for (let k = 0; k <= Math.min(waterbenders(state, player).length, parseManaCost(atom.cost).generic); k += 1)
    if (costPayment(state, player, id, ability.cost, x, less, undefined, k)) payable.push(k);
  return payable.length ? {least: payable[0], most: payable.at(-1)} : null;
}
/* How many a waterbend offer taps, as its player picked them; none for any other. */
const bentFor = (action) => (action.waterbend === true ? (action.waterbendTap ?? []).length : 0);
/* The ones its player picked: none twice, each still an untapped artifact or creature of theirs. Refused before anything is
   paid, saying what to do instead; too many or too few is the payment's to refuse (costPayment). */
function waterbendPicked(state, player, action) {
  const list = action.waterbendTap, able = waterbenders(state, player);
  if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every((id) => able.includes(id)))
    throw new Error(`Those are not untapped artifacts and creatures you control: pick what to tap for ${state.objects[action.objectId]?.card ?? "that ability"}'s waterbend again`);
  return [...list];
}

/* What an ability's offer carries of its payment: the mana and life, plain data (an offer is copied and sent), and
   `payWays` when the pool pays it more than one way -- the way asked once it is taken (X8b). */
const offeredPayment = (payment) => ({payment: {mana: payment.mana, life: payment.life}, ...(payment.payWays ? {payWays: true} : {})});

/* A player's commander's color identity (CR 903.4): rules/commander.mjs, where the amount grammar reads it too ("pay life
   equal to the number of colors in your commanders' color identity", War Room). */
export {commanderIdentity};

/* The colors "as it enters, choose a color" offers (CR 105.1), by the mana each is. */
export const COLOR_CHOICES = Object.freeze(["White", "Blue", "Black", "Red", "Green"]);
const CHOSEN_COLOR = Object.freeze({White: "W", Blue: "U", Black: "B", Red: "R", Green: "G"});

/** What a mana ability can add, one entry per alternative (2.4b); a counted amount counted now ("{G} for each creature you control"). */
export function manaAlternatives(state, player, given, source = null) {
  /* "An amount of mana of that color equal to the number of creatures you control of the chosen type" (Three Tree City):
     its own choice. */
  /* "Instead add one mana of any color" while its permanent has a luck counter (Gemstone Caverns; rules/mana.mjs). */
  const ability = chosenFor(manaAbilityNow(state, source, given), state.objects[source]);
  const context = {controller: player, source};
  const count = amountOf(state, ability.count ?? 1, context);
  if (Array.isArray(ability.produces)) return ability.produces.map((m) => countMana(state, {...m}, context));
  if (ability.produces) return [countMana(state, {...ability.produces}, context)];
  if (ability.anyColor === true) return COLORS.map((color) => ({[color]: count}));
  /* "Add one mana of the chosen color" (Night Market): the color its permanent chose as it entered; none chosen, none. */
  if (ability.chosenColor === true) { const color = CHOSEN_COLOR[state.objects[source]?.chosen]; return color ? [{[color]: count}] : []; }
  if (ability.anyColor === "identity") return commanderIdentity(state, player).map((color) => ({[color]: count}));
  /* "Two mana in any combination of colors" (Great Hall of the Citadel): each way to make it, an offer each. */
  /* "In any combination of {U} and/or {R}" (Vivi Ornitier): of those colors only. */
  if (ability.anyCombination) return combinations(count, 0, Array.isArray(ability.anyCombination) ? COLORS.filter((c) => ability.anyCombination.includes(c)) : COLORS);
  /* "Any color that a land an opponent controls could produce" (Exotic Orchard), "any type ... a land you control"
     (Reflecting Pool, `anyType`, colorless too): what those lands' own mana abilities could add, now -- never another
     such ability's (CR 106.7), so two Reflecting Pools do not feed each other. Their mana abilities as they are after layer
     6 (CR 613.1f): an Island under Song of the Dryads could produce {G}, and no {U}. */
  if (ability.reflect) {
    const kinds = new Set();
    for (const id of selectMatching(state, ability.reflect, context))
      for (const theirs of abilitiesOf(state, id))
        if (theirs.kind === "mana" && !theirs.reflect && !theirs.among) for (const m of manaAlternatives(state, state.objects[id].controller, theirs, id)) for (const k of Object.keys(m)) kinds.add(k);
    return [...COLORS, ...(ability.anyType ? ["C"] : [])].filter((k) => kinds.has(k)).map((k) => ({[k]: count}));
  }
  /* "Any color among legendary creatures and planeswalkers you control" (Mox Amber), "among legendary creature cards in
     your graveyard": their colors, now. */
  if (ability.among) {
    const colors = new Set(selectMatching(state, ability.among, context).flatMap((id) => (state.objects[id].zone === "battlefield" ? characteristicsOf(state, id).colors : state.objects[id].colors) ?? []));
    /* "For each color among permanents you control, add one mana of that color" (Faeburrow Elder): every one of them, at
       once -- one way, so nothing to choose; with no color among them, it adds nothing. */
    if (ability.each === true) return [Object.fromEntries(COLORS.filter((c) => colors.has(c)).map((c) => [c, count]))];
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
/* What an activated ability's cost is reduced by (CR 602.2b, 601.2f): its own `costLess`, counted with its chosen `targets` ("for
   each +1/+1 counter on the creature it targets", Warrior's Blades) -- and, for an equip ability (CR 702.6a), what a permanent
   of its player's takes off for those targets (Dwarven Mauler; rules/statics.mjs, equipCostReduction). */
const abilityLess = (state, player, id, ability, targets = null) => (ability.costLess === undefined ? 0 : amountOf(state, ability.costLess, {controller: player, source: id, targets: targets ?? []}))
  + (ability.equip === true ? equipCostReduction(state, player, targets) : 0);
function abilityXValues(state, player, ability, id) {
  /* "−X:" (CR 606.4): any X from none to the loyalty it has. */
  if (ability.loyalty === "-X") return Array.from({length: (state.objects[id]?.counters?.loyalty ?? 0) + 1}, (_, n) => n);
  const atom = (ability.cost ?? []).find((a) => a?.atom === "mana");
  return atom ? xValues(poolFor(state, player, {ability: id}), parseManaCost(atom.cost)) : [null];
}

/** How many lands this player may still play this turn. CR 305.2; effects raise the allowance. */
/* "You may play an additional land this turn" (Hearthhull): an effect for the turn (effects/permanents.mjs, effectUntil). */
/* "3+ | You may play an additional land on each of your turns" (Exploration Broodship): one whose condition holds. */
/* "You may play two additional lands on each of your turns" (Azusa, Lost but Seeking; CR 305.2): `count`, that many. */
const landDropsLeft = (state, player) => (state.players[player].landAllowance ?? 1)
  + playerStatics(state, "extra-land-drop", player).filter(({ability, source}) => conditionHolds(state, ability.condition, {controller: player, source}))
    .reduce((n, {ability}) => n + (ability.count ?? 1), 0)
  + (state.effects ?? []).filter((e) => e.rule === "extra-land-drop" && e.sourceController === player).length - state.players[player].landsPlayed;

/* WHAT A PLAYER MAY PLAY FROM ANOTHER ZONE (CR 601.2a, 305.1), by their permanents' static abilities: lands from the
   graveyard, the top card of the library, a card that says it may be cast from its graveyard or exile. `lands` and
   `spells` are each true or a selector the card must match. One list, read by the land offer and the cast offer. */
/* "Once during each of your turns" (Kess, Gisa and Geralf): a permission that says `yourTurn` is open only on its holder's
   turns, and one with a `limit` only until this source has been used that many times this turn (recordUse, as a card is
   played through it). */
const playKey = (ability) => `play-from:${ability.id}`;
/* "DURING EACH OF YOUR TURNS, YOU MAY PLAY A LAND AND CAST A PERMANENT SPELL OF EACH PERMANENT TYPE FROM YOUR GRAVEYARD"
   (Muldrotha, the Gravetide; CR 110.4b): a permission whose limit is kept by type (`perType`) -- one land played, and one
   spell cast of each permanent type. A card of several of them is cast as one, its player's choice (the card's reminder
   text): each type still open its own offer (`asType`, typeWays), and that type's use spent. A land is played as a land
   (CR 305.1), whatever else it is. */
const PERMANENT_SPELL_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Planeswalker"];
const typeKey = (ability, type) => `${playKey(ability)}:${type}`;
const openTypes = (state, ability, source, id, kind) => (kind === "land" ? ["Land"] : PERMANENT_SPELL_TYPES.filter((type) => (state.objects[id].types ?? []).includes(type)))
  .filter((type) => usesThisTurn(state, source, typeKey(ability, type)) < 1);
/* "You may play them IF YOU CONTROL A WIZARD" (Flameshape): a permission's `condition`, asked whenever the card would be
   played -- never once as the permission was made -- so it is open while the condition holds and closed again once it does
   not (a Wizard gone). */
/* "After the current turn has ended" (warp, CR 702.185a): a permission that says `afterTurn` opens only on a later turn. */
const permissionOpen = (state, player, ability, source) => (!ability.yourTurn || state.activePlayer === player)
  && (ability.afterTurn === undefined || state.turn > ability.afterTurn)
  && (ability.limit === undefined || usesThisTurn(state, source, playKey(ability)) < ability.limit)
  && conditionHolds(state, ability.condition, {controller: player, source});
/* A card exiled face down (CR 406.3a-b) -- the one face-down card a permission can name: none names a permanent or a spell --
   is weighed as the card it is (withFaceUp), and only for a player who may look at it (projection.mjs, mayLookAt): the one
   asked is the one who may see what the offer names. A card shown face down elsewhere -- weighed for disguise from the top of
   a library (Mystic Forge, CR 702.168b) -- is its own player's card, and weighed as disguise weighs it. */
const permits = (state, player, ability, id, kind, source) => {
  if (state.objects[id]?.faceDown === true && state.objects[id].zone === "exile" && !mayLookAt(state, state.objects[id], player)) return false;
  return withFaceUp(state, id, () => permitsShown(state, player, ability, id, kind, source));
};
const permitsShown = (state, player, ability, id, kind, source) => {
  const which = kind === "land" ? ability.lands : ability.spells;
  return Boolean(which) && !(ability.notAdventure && state.objects[id].face === "adventure") && isLand(state.objects[id]) === (kind === "land")
    && (which === true || (typeof which === "object" && matchesSelector({...which, what: "card", zone: state.objects[id].zone}, state, id, {controller: player, source})))
    && (ability.perType !== true || openTypes(state, ability, source, id, kind).length > 0);
};
const permittedFrom = (state, player, ability) => (ability.ids ? ability.ids.filter(id => state.objects[id] && !["battlefield", "stack"].includes(state.objects[id].zone))
  : ability.zone === "graveyard" ? cardsIn(state, "graveyard", player)
  : ability.zone === "library-top" ? cardsIn(state, "library", player).slice(0, 1)
  : ability.zone === "exile" ? state.zones.exile : []);
/* A resolved permission (Quintorius) persists independently of its source. Static permissions
   (Maralen) exist only while that permanent grants them. Both use the same cast/cost path. */
const allPlayPermissions = (state, player) => onceAQuestion(state, `play-permissions:${player}`, () => {
  const isPlay = a => a.kind === "static" && a.rule === "play-from";
  const givesPlay = apply => (apply?.addAbilities ?? []).some(isPlay);
  const mayGain = (state.effects ?? []).some(e => givesPlay(e.apply))
    || [...state.zones.battlefield, ...state.zones.graveyard.flat()].some(id => (state.objects[id].abilities ?? []).some(a => givesPlay(a.apply)));
  const statics = [];
  for (const source of state.zones.battlefield) {
    const holder = state.objects[source];
    if (!mayGain && !(holder.abilities ?? []).some(isPlay)) continue;
    const abilities = abilitiesOf(state, source).filter(isPlay);
    if (abilities.length && controllerOf(state, source) === player)
      for (const ability of abilities) statics.push({source, ability: chosenFor(ability, holder)});
  }
  return [...statics, ...(state.effects ?? []).filter(e => e.rule === "may-play" && e.player === player).map(e => ({source: e.id,
    /* A zone's cards, not named ones (script/effects/zones.mjs, mayPlay's `from`): "you may cast a creature spell from your
       graveyard this turn" (Chainer, Nightmare Adept), "you may play cards from the top of your library" (Gwenom, Remorseless)
       -- read as a permanent's play-from is, `count` the cards it lets be played before it is spent (spendPermission). */
    ability: e.from !== undefined ? {id: e.id, zone: e.from, spells: e.spells ?? true, lands: !e.spellsOnly, ...(e.payLife ? {payLife: e.payLife} : {}),
      ...(Number.isInteger(e.count) ? {count: e.count} : {})}
      : {id: e.id, ids: e.affects.ids, spells: true, lands: !e.spellsOnly, free: e.free === true, notAdventure: e.notAdventure === true,
      ...(e.graveyardToLibraryBottom ? {graveyardToLibraryBottom: true} : {}), ...(e.onlyIf !== undefined ? {condition: e.onlyIf} : {}),
      ...(Number.isInteger(e.afterTurn) ? {afterTurn: e.afterTurn} : {})}}))];
});
/* A CARD PLAYED THROUGH A PERMISSION (CR 601.2a, 305.1): what it uses up -- a limited one's use this turn ("once during each
   of your turns", Kess), the type it was played as (Muldrotha's `perType`, `asType` for a spell, a land's "Land"), and a
   permission an effect gave for so many cards (`count`: "a creature spell", Chainer), gone once they are played. */
function spendPermission(state, permission, kind, asType) {
  if (!permission) return;
  if (permission.ability.limit !== undefined) recordUse(state, permission.source, playKey(permission.ability));
  if (permission.ability.perType === true) recordUse(state, permission.source, typeKey(permission.ability, kind === "land" ? "Land" : asType));
  const effect = Number.isInteger(permission.ability.count) ? (state.effects ?? []).find((e) => e.id === permission.source) : null;
  if (effect && (effect.count -= 1) <= 0) state.effects = state.effects.filter((e) => e !== effect);
}
/* "Mana of any type can be spent to cast those spells" (Tinybones, Bauble Burglar; CR 118.14, 609.4b): the cost is not
   changed, only how it may be paid -- each colored or hybrid symbol by one mana of any type, as generic mana is. A snow
   symbol is left as rules/mana.mjs pays it. NAMED: a Phyrexian symbol still asks its color or 2 life. */
const ANY_TYPE_PAYS = ["colored", "hybrid", "monohybrid"];
const anyTypeCost = (cost, permission) => (permission?.ability.anyMana !== true ? cost
  : {...cost, generic: cost.generic + cost.symbols.filter((s) => ANY_TYPE_PAYS.includes(s.kind)).length, symbols: cost.symbols.filter((s) => !ANY_TYPE_PAYS.includes(s.kind))});
/* The life a cast through this permission costs instead of its mana cost -- "pay life equal to its mana value" (Bolas's
   Citadel; CR 118.9) -- or null when it is paid for as usual. X is 0 (CR 107.3b): no alternative cost of the Citadel's
   includes X, so its mana value is the printed one with X as 0 (CR 202.3e). */
const lifeInstead = (object, permit) => (permit?.ability.payLife === "manaValue" ? (object.manaCost ? manaValue(parseManaCost(object.manaCost)) : 0) : null);
/* And a permanent's alternative cost of life for another's spell -- "you may cast an enchantment spell by paying life equal to
   its mana value rather than paying its mana cost" (Demon of Fate's Design; rules/statics.mjs, freeCast's `payLife`): that
   life when the cast takes it, X as 0 (CR 107.3b). Any other free cast costs no life. */
const freeLife = (object, free) => (free?.payLife === "manaValue" ? (object.manaCost ? manaValue(parseManaCost(object.manaCost)) : 0) : null);
/* The permissions open now that let this card be played from where it is. */
const openPermissions = (state, player, id, kind) => allPlayPermissions(state, player)
  .filter(({ability, source}) => permissionOpen(state, player, ability, source) && permittedFrom(state, player, ability).includes(id) && permits(state, player, ability, id, kind, source));
/* Of permissions that give the card the same thing, the one with the fewest drawbacks: no limit, so a limited one is spent
   only when it must be, and no "exile it instead" (Kess) -- the two doing the same but for what is used up or lost, which is
   no choice taken from the player. */
/* Spent by being used: a `limit`, a type's use (`perType`, Muldrotha), so many cards (`count`, Chainer). */
const unlimited = (ability) => ability.limit === undefined && ability.perType !== true && ability.count === undefined;
const preferred = (open) => open.find(({ability}) => unlimited(ability) && ability.graveyardToExile !== true)
  ?? open.find(({ability}) => unlimited(ability)) ?? open[0] ?? null;
/* The permission a card is played through: the one its player chose (`via`, its source), or the preferred one there is. */
function playPermission(state, player, id, kind, via = null) {
  const open = openPermissions(state, player, id, kind);
  if (via !== null) return open.find(({source}) => source === via) ?? null;
  return preferred(open);
}
/* WHICH PERMISSION, WHEN IT MATTERS (CR 601.2a, 305.1; Rob, 2026-09-23: the players decide). Two permanents may each let a
   player play the same card, and do different things with it: Serra Paragon's land "gains" an ability and Crucible of
   Worlds's does not; Bolas's Citadel's spell is paid for with life, Future Sight's with mana; Thundermane Dragon's creature
   gains haste. Each permission that gives something different is an offer of its own, `via` its source -- the preferred of
   those that give alike; ones that all give alike are one offer, as they always were (playPermission). */
/* And what it asks or allows beside: an additional cost to pay (Exploration Broodship), mana of any type spent (Tinybones). */
const permissionDoes = (ability) => JSON.stringify([ability.grants ?? null, ability.gains ?? null, ability.payLife ?? null, ability.free === true, ability.graveyardToLibraryBottom === true,
  ability.additionalCost ?? null, ability.anyMana === true]);
/* Through a per-type permission (Muldrotha), which of its permanent types it is cast as: each still open its own offer, its
   player's to choose; through any other, as itself (null). */
function typeWays(state, player, id, via) {
  const permission = playPermission(state, player, id, "spell", via);
  return permission?.ability.perType === true ? openTypes(state, permission.ability, permission.source, id, "spell") : [null];
}
function permissionWays(state, player, id, kind) {
  const groups = new Map();
  for (const permission of openPermissions(state, player, id, kind)) {
    const does = permissionDoes(permission.ability);
    if (!groups.has(does)) groups.set(does, []);
    groups.get(does).push(permission);
  }
  return groups.size > 1 ? [...groups.values()].map((alike) => preferred(alike).source) : [null];
}
/* What a permission gives what was played through it (`grants`, compiled abilities): a layer-6 effect on the permanent, for
   good -- a permanent that leaves is a new object, and the effect has nothing to apply to (CR 400.7). */
function grantPlayed(state, id, permission, player) {
  const grants = permission?.ability.grants ?? [];
  if (!grants.length) return;
  (state.effects ??= []).push({id: `play-grants:${id}`, layer: 6, affects: {ids: [id]}, apply: {addAbilities: structuredClone(grants)}, until: null, sourceController: player});
}
/* Which rider mana an offer spends (`riders`, entry ids), and whose it is, for a pilot and a log (`riderNames`). */
function ridersOffer(state, riders) {
  if (riders === undefined) return {};
  const entries = Object.values(state.players).flatMap((p) => p.manaRiders ?? []);
  /* A source gone since -- a Treasure sacrificed for its mana -- named as it was (`from`). */
  return {riders, riderNames: riders.map((id) => { const entry = entries.find((e) => e.id === id); return state.objects[entry?.source]?.card ?? entry?.from?.name ?? "mana"; })};
}
const viaOf = (state, via) => (via !== null && via !== undefined ? {via, viaName: state.objects[via]?.card ?? (state.effects ?? []).find(e => e.id === via)?.name ?? null} : {});

function playableElsewhere(state, player, kind) {
  const found = [];
  for (const {ability, source} of allPlayPermissions(state, player)) {
    if (ability.ids || !permissionOpen(state, player, ability, source)) continue;
    for (const id of permittedFrom(state, player, ability)) if (permits(state, player, ability, id, kind, source) && !found.includes(id)) found.push(id);
  }
  if (kind === "spell") for (const zone of ["graveyard", "exile"]) {
    const ids = zone === "exile" ? state.zones.exile.filter((id) => state.objects[id].owner === player) : cardsIn(state, zone, player);
    /* "You may cast this card from your graveyard AS LONG AS YOU CONTROL A ZOMBIE" (Gravecrawler; CR 113.6, 601.2a): its
       `condition`, its owner's, asked whenever it would be cast. */
    for (const id of ids) if ((state.objects[id].abilities ?? []).some((a) => a.kind === "static" && a.rule === "cast-self-from" && (a.zones ?? []).includes(zone)
      && conditionHolds(state, a.condition, {controller: player, source: id})) && !found.includes(id)) found.push(id);
  }
  /* A prepared permanent's prepare spell, the copy in exile (CR 722.3c; script/effects/attributes.mjs): that permanent's
     controller may cast it, for as long as it stays there. */
  if (kind === "spell") for (const id of state.zones.exile)
    if (state.objects[id].prepareOf !== undefined && preparedCopyStays(state, id) && controllerOf(state, state.objects[id].prepareOf) === player && !found.includes(id)) found.push(id);
  /* Keep resolved permissions after the card's own zone permissions, preserving stable offer order -- each while it is open
     (permissionOpen: Flameshape's Wizard). */
  for (const {ability, source} of allPlayPermissions(state, player)) if (ability.ids && permissionOpen(state, player, ability, source))
    for (const id of permittedFrom(state, player, ability))
      if (permits(state, player, ability, id, kind, source) && !found.includes(id)) found.push(id);
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
    /* A mana ability is an activated ability (CR 605.1a): "its activated abilities can't be activated" (Koma) stops it too,
       and so does "your opponents can't activate abilities of artifacts, creatures, or enchantments" (Grand Abolisher). */
    if (activationsForbidden(state, id) || permanentActivationForbidden(state, id)) continue;
    /* Its abilities now: its own and any given it (layers.mjs). */
    for (const ability of abilitiesOf(state, id)) {
      if (ability.kind !== "mana") continue;
      if (ability.tapSelf && object.tapped) continue;
      /* CR 302.6: a creature's {T} ability waits until it has been yours since your turn began, unless it has haste.
         A land is never sick; a land animated this turn is a creature, and is. */
      if (ability.tapSelf && sickForAbilities(state, id)) continue;
      /* "Activate only if you control a Swamp" (CR 602.5b): asked as it would be offered. */
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      if (!manaAbilityPayment(state, player, ability)) continue;
      /* "Activate only once each turn" (Wall of Roots), and counters it cannot remove (Ramos). */
      if (!withinLimit(state, id, ability) || !countersPayable(state, id, ability.counterCost)) continue;
      /* "Mill a card" (Millikin): a cost paid only with the cards to mill (CR 118.3) -- an empty library pays nothing. */
      if (!millPayable(state, player, ability)) continue;
      const alternatives = manaAlternatives(state, player, ability, id);
      const fodder = ability.sacrifice ? sacrificeChoices(state, player, id, ability.sacrifice).map((x) => ({sacrifice: x}))
        /* "Tap an untapped creature you control" (Jaspera Sentinel): one offer per creature it may tap, none and none. */
        : ability.tapCreature ? manaTappers(state, player, id, ability.tapCreature, ability.tapSelf === true).map((x) => ({tap: x}))
        /* "Exile a card from your graveyard" (Rubble Rouser): one offer per card it may exile, as an activated ability's. */
        : ability.exileFromGraveyard ? graveyardChoices(state, player, id, ability.exileFromGraveyard).map((x) => ({exile: x})) : [null];
      for (const costChoice of fodder) alternatives.forEach((mana, produce) => actions.push({
        kind: "activate-mana", objectId: id, abilityId: ability.id, label: object.card, mana,
        /* A fixed ability is one offer and looks as it always has; a choice says which it is. */
        ...(alternatives.length > 1 || Array.isArray(ability.produces) || ability.anyColor || ability.reflect || ability.among ? {produce} : {}),
        ...(costChoice ? {costChoice, costNames: [state.objects[costChoice.sacrifice ?? costChoice.tap ?? costChoice.exile].card]} : {}),
      }));
    }
  }
  return actions;
}

/* A MANA ABILITY THAT TAPS ANOTHER CREATURE: "{T}, Tap an untapped creature you control: Add one mana of any color" (Jaspera
   Sentinel, Saruli Caretaker; CR 605.1a, 602.2b). Which creature is its player's to choose, so each one it may tap is an offer
   of its own, as a mana ability's sacrifice is, and nothing that pays for them (tapUnits, rules/mana.mjs's plainSources)
   ever activates it. Never the source, which its own {T} taps (CR 118.3); a creature that came under its player's control
   this turn may be tapped, the cost not being its own {T} (CR 302.6). One with no {T} of its own ("Tap an untapped artifact
   you control: Add {U}", Urza, Lord High Artificer; "Tap an untapped legendary creature you control", Relic of Legends;
   `tapsSelf` false) may tap its source, if the selector describes it. */
const manaTappers = (state, player, sourceId, selector, tapsSelf = true) => state.zones.battlefield.filter((id) => (!tapsSelf || id !== sourceId) && !state.objects[id].tapped
  && characteristicsOf(state, id).controller === player && compileSelector({...selector, what: "permanent"})(state, id, {controller: player, source: sourceId}));

/**
 * THE SOURCES A CAST MAY TAP (rules/mana.mjs, tapPlans): each untapped source whose mana ability is offered now and asks
 * nothing but {T} -- no mana, life, sacrifice or counters, nothing else done (a painland's damage), nor a restriction on
 * what its mana is spent on. Each `{id, colors, via}`: the colors it can make, and for each the activation that makes it.
 * Only a source that makes one mana at a time, unless `bundles` (`pooledTaps`): then a source's other outputs too -- a
 * two-mana rock's `C:2` -- each with the mana it makes, whole, in `outputs`.
 */
export function tapUnits(state, player, offered = manaOffers(state, player), bundles = false) {
  const units = new Map();
  for (const offer of offered) {
    if (offer.costChoice) continue;
    const ability = abilitiesOf(state, offer.objectId).find((a) => a.id === offer.abilityId);
    if (!ability?.tapSelf || ability.cost || ability.payLife || ability.then || ability.sacrifice || ability.sacrificeSelf || ability.counterCost || ability.spendOnly || ability.millCost
      /* Nor mana that does something when spent (Path of Ancestry): which mana pays is then a choice of its own. */
      || ability.whenSpent
      /* Nor mana that can't be spent to cast spells from the hand (Heartwood Crafter): tapped by its player, it is in the pool. */
      || ability.cantSpend) continue;
    const made = Object.entries(offer.mana ?? {}).filter(([, n]) => n > 0);
    if (!made.length || (!bundles && (made.length !== 1 || made[0][1] !== 1))) continue;
    const color = made.length === 1 && made[0][1] === 1 ? made[0][0] : made.map(([k, n]) => `${k}:${n}`).join("+");
    if (!units.has(offer.objectId)) units.set(offer.objectId, {id: offer.objectId, colors: [], via: {}, ...(bundles ? {outputs: {}} : {})});
    const unit = units.get(offer.objectId);
    if (unit.via[color]) continue;
    unit.colors.push(color);
    if (bundles) unit.outputs[color] = offer.mana;
    unit.via[color] = {abilityId: offer.abilityId, ...(offer.produce !== undefined ? {produce: offer.produce} : {})};
  }
  return [...units.values()];
}

/* A cast that may tap for itself: from the hand or the command zone, its mana cost (and a commander's tax) paid, with
   nothing in the pool -- so the mana tapped is exactly the cost, and paying it is no further choice. */
/* X paid in life (`payLifeX`, Toxic Deluge) is no X its sources' mana pays: it is tapped for as any other. */
const tapCastable = (state, player, action) => ["hand", "command"].includes(action.from) && !action.free && !action.flashback
  && action.escape === undefined && action.alternative === undefined && (action.x === undefined || action.payLifeX === true)
  && (pooledTaps(state) || poolSize(poolFor(state, player, {spell: action.objectId})) === 0);

/* FLOATING MANA AND A SOURCE'S WHOLE OUTPUT TOGETHER (`pooledTaps`, game/room/table.mjs): a cast tapped for tops up what is
   already in the pool, and a source making more than one mana (a two-mana rock) is tapped for all of it, the surplus left in
   the pool (rules/mana.mjs, sourceTapPlans). Only a match that asks carries the key, so a game made before it offers the
   same choices, and so replays exactly as it did: without it, a cast is tapped for only from an empty pool, one mana a
   source. */
const pooledTaps = (state) => state.pooledTaps === true;

/** How many ways to tap for a cast are asked at most: the least flexible first (tapPlans), so the sensible ones. */
const TAP_CHOICES = 24;
/** A way to tap, in words: the sources' names, in the order they are tapped ("Forest, Forest, Island"). */
export const tapWords = (state, plan) => plan.taps.map((t) => state.objects[t.id]?.card ?? "a source").join(", ");

/* The ways to tap for a cost, each with the payment it makes: from an empty pool and one-mana sources the simple solver
   (tapPlans); with floating mana or a source of more than one mana, the bundled one (sourceTapPlans), where the match
   allows it (`pooledTaps`). */
function fundingPlans(state, player, id, cost, limit, units = tapUnits(state, player, undefined, pooledTaps(state))) {
  const pool = poolFor(state, player, {spell: id});
  const empty = poolSize(pool) === 0;
  if (!pooledTaps(state) || (empty && units.every((u) => u.colors.every((c) => MANA_KEYS.includes(c)))))
    return !empty ? [] : tapPlans(units, cost, limit).map((plan) => ({...plan, payment: {mana: Object.fromEntries(MANA_KEYS.map((k) => [k, plan.taps.filter((t) => t.color === k).length])), life: 0}}));
  /* The one an unasked cast taps is built (quickTapPlan); asking which way lists what the search finds with that one first,
     so the first way asked is the way the offer was priced at. */
  const quick = quickTapPlan(units, pool, cost);
  if (limit === 1) return quick ? [quick] : sourceTapPlans(units, pool, cost, 1);
  const found = sourceTapPlans(units, pool, cost, limit);
  return quick ? [quick, ...found.filter((w) => w.key !== quick.key)].slice(0, limit) : found;
}

/** The ways to tap for this cast (`action.autoTap`), up to `limit`, as `tapPlans` says them. */
export function castTapPlans(state, player, action, limit = 2) {
  if (!tapCastable(state, player, action)) return [];
  const tax = action.from === "command" ? commanderTax(state, player, action.objectId) : 0;
  /* An Adventure's cost, cast as one (CR 715.3a). */
  const {cost, x} = asCast(state, action, () => castCost(state, player, action.objectId, tax, false, null, action.extraMana ?? "", action.targets));
  return fundingPlans(state, player, action.objectId, {...cost, generic: cost.generic + x}, limit);
}

/* AN ADVENTURER CARD WEIGHED AS ITS ADVENTURE (CR 715.3a): shown as one for the length of `fn` -- its cost, its timing, its
   targets, and every rule that reads a spell, the Adventure's -- with its derivations made afresh where a memo is open
   (rules/layers.mjs), and as itself again after, unless `fn` cast it: it is then a new object on the stack (CR 400.7), its
   Adventure's there (715.3b). */
function withAdventure(state, id, fn) {
  const object = state.objects[id];
  if (!object?.adventurer || object.face === "adventure") return fn();
  showAdventure(state, id, true);
  try { return derivingAfresh(state, fn); }
  finally { if (state.objects[id]?.face === "adventure") showAdventure(state, id, false); }
}

/* DISGUISE (CR 702.168a-b): "You may cast this card as a 2/2 face-down creature with ward {2}, no name, no subtypes, and no
   mana cost by paying {3} rather than paying its mana cost" -- an alternative cost (CR 118.9), from any zone it could be cast
   from. The card is weighed as that face-down spell for the length of `fn` (state/index.mjs, shownFaceDown): its cost, its
   timing, and every rule that reads a spell, the face-down spell's (702.168b), with its derivations made afresh -- and as
   itself again after, unless `fn` cast it: it is then a new object, a face-down spell on the stack (rules/stack.mjs). */
/* MORPH (CR 702.37a, 702.37c) is cast face down the same way, for {3} -- a 2/2 with no text (state/index.mjs) -- and turned
   face up for its morph cost (702.37e): the card's own face-down keyword, either. */
const disguiseOf = (card) => (card?.abilities ?? []).find((a) => a.kind === "static" && (a.rule === "disguise" || a.rule === "morph")) ?? null;
const DISGUISE_WAY = Object.freeze({mana: "{3}", life: 0, extra: [], evoke: false, disguise: true});
function withFaceDown(state, id, fn) {
  const card = state.objects[id];
  state.objects[id] = shownFaceDown(card);
  try { return derivingAfresh(state, fn); }
  finally { if (state.objects[id]?.disguised === true && state.objects[id].zone !== "stack") state.objects[id] = card; }
}

/* A CARD EXILED FACE DOWN, PLAYED (CR 406.3a): it "has no characteristics, but the spell or ability that exiled it may allow
   it to be played from exile ... the card is turned face up just before the player announces that they are playing the
   card" (Flameshape). So a permission to play it is weighed with the card shown face up for the length of `fn`
   (state/index.mjs, shownFaceUp) -- a land as a land, under the land drop's rules (CR 305.1-305.2), a spell by its own cost,
   timing and targets (CR 601.2), an adventurer card as itself or as its Adventure (715.3) -- with its derivations made
   afresh, and face down again after, unless `fn` played it: it is then a new object on the stack or the battlefield,
   revealed to every player as it is played (CR 400.7). Anything else, as it is -- a face-down permanent too, whose ability's
   question (asCast) is no play of a card. Only the permission's player is asked, and only one who may look at it (permits,
   CR 406.3b), so no other seat is ever offered, or shown, what it is (projection.mjs). Cast face down from there (708.4) is
   not built: a face-down card offers no disguise. And for an effect that lets it be played as it resolves -- "you may play
   the exiled card" of a hideaway card (Windbrisk Heights; CR 702.75a) -- what it may be played as is weighed so too
   (effects/asking.mjs, `play`). */
export function withFaceUp(state, id, fn) {
  const card = state.objects[id];
  if (card?.faceDown !== true || card.zone !== "exile") return fn();
  const shown = shownFaceUp(card);
  state.objects[id] = shown;
  try { return derivingAfresh(state, fn); }
  finally { if (state.objects[id] === shown) state.objects[id] = card; }
}

/* WHERE AN ADVENTURE MAY BE CAST FROM (CR 715.3, 715.3d): its owner's hand, the command zone (a commander, CR 903.8), or
   another zone by a permission other than the Adventure's own exile -- "you may cast the creature later from exile" casts
   it as itself only (`notAdventure`, rules/stack.mjs). A permanent's permission ("you may cast creature spells from the top
   of your library") is asked of the Adventure, shown as one (715.3a). */
function adventureFrom(state, player, id, from) {
  if (from === "hand" || from === "command") return true;
  return playPermission(state, player, id, "spell") !== null;
}

/* THE WAYS TO CAST ONE CARD NOW (CR 601.2): from where it is (`from`), for which cost -- its mana cost, flashback's, escape's,
   an alternative cost, without paying it -- each an offer, with its targets or modes. `adventure`: as its Adventure (CR 715.3),
   the card shown as one by the caller (withAdventure), so every rule weighs only the Adventure's characteristics (715.3a). */
/* `graveyardCost`: cast from the graveyard for an alternative cost that says so (Squee, Dubious Monarch) -- that cost only,
   never its mana cost, which nothing lets it be cast for from there. */
/* `disguise`: cast face down for {3} (CR 702.168a), the card shown face down by the caller (withFaceDown) -- that cost
   alone, never with another alternative cost (CR 118.9a): a free cast, or the Citadel's life. */
function castOffers(state, player, {id, from, flashback, escape, via = null, asType = null, adventure = false, graveyardCost = false, disguise = false}, tappable) {
  const actions = [];
  const object = state.objects[id];
  /* A free alternative cost can make a costless spell castable, never a land (CR 305.9). */
  if (isLand(object)) return actions;
  /* "If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost" (Bolas's Citadel): the
     permission it is cast through, and what it costs (lifeInstead). A card with no mana cost may be cast only for an
     alternative cost (CR 118.6a), and this is one: its mana value, 0, in life. */
  const permit = !flashback && !escape && ["graveyard", "library", "exile"].includes(from) ? playPermission(state, player, id, "spell", via) : null;
  const lifeCost = lifeInstead(object, permit);
  if (disguise && (lifeCost !== null || permit?.ability.free)) return actions;
  if (!object.manaCost && lifeCost === null && !disguise && !(permit?.ability.free || freeCast(state, player, id))) return actions;
  if (lifeCost !== null && lifeCost > state.players[player].life) return actions;
  /* "Can't cast" (castForbidden): from a graveyard, during its controller's turn, more than one each turn. */
  if (castForbidden(state, player, id)) return actions;
  const timely = !sorcerySpeed(object) || hasFlash(state, id) || flashGranted(state, player, id) || (player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0);
  /* SNEAK (CR 702.190a): "any time you could cast an instant during your declare blockers step" -- a card that could not be
     cast now otherwise is offered for its sneak cost alone (`sneaking`), its condition saying when (alternativeCosts). */
  const sneaking = !timely && (object.abilities ?? []).some((a) => a.kind === "static" && a.rule === "alternative-cost" && a.sneak === true);
  if (!timely && !sneaking) return actions;
  const tax = from === "command" ? commanderTax(state, player, id) : 0;
  /* Derive free-cast grants only after timing rejects spells that cannot be cast now. */
  const free = flashback || escape || lifeCost !== null ? null : permit?.ability.free ? {source: permit.source, limited: false} : freeCast(state, player, id);
  /* "Without paying its mana cost": offered alone when it may be used every time; beside the paid cast when it is "once
     each turn", so the player decides which spell spends it. */
  /* Its own alternative costs (CR 118.9), each an offer of its own -- never with flashback, escape, a free cast or the
     Citadel's life, each an alternative cost too (118.9a). */
  /* Warp's "from your hand" (CR 702.185a): from there alone. */
  const alternatives = disguise ? [DISGUISE_WAY] : flashback || escape || lifeCost !== null || permit?.ability.free ? []
    : alternativeCosts(state, player, id).filter((w) => !w.fromHand || from === "hand");
  /* The flashback cost instead of the mana cost, and its life: a player can pay life only if their total is at least
     that much (CR 119.4). */
  const back = flashback ? flashbackCost(state, player, id) : null;
  if (back && !flashbackPayable(state, player, back)) return actions;
  /* The escape cost's mana instead of the mana cost (CR 702.138a); its cards are picked once the offer is taken. */
  const fled = escape ? escapeWays(state, player, id).find((w) => w.kind === escape) ?? null : null;
  /* How it would be cast, for a target it has only if ("if you cast this spell during your main phase", script/bind.mjs). */
  const cast = {from, mainPhase: player === state.activePlayer && MAIN_PHASES.includes(state.phase)};
  /* Cast from the graveyard by its own alternative cost, that cost alone; otherwise the mana cost and every other one. */
  for (const way of graveyardCost ? alternatives.filter((w) => w.fromGraveyard) : disguise ? alternatives : [null, ...alternatives.filter((w) => !w.fromGraveyard)]) {
  if (way && way.life > state.players[player].life) continue;
  if (sneaking && !way?.sneak) continue;
  /* The flashback cost's discard (Twinned Vision) is chosen with the cast, as an alternative cost's card exiled from the hand is. */
  /* And what the permission it is cast through asks besides: "by sacrificing a land in addition to paying its other costs"
     (Exploration Broodship; CR 601.2b, 601.2f). */
  for (const variant of additionalVariants([...(object.spell?.additionalCost ?? []), ...(way?.extra ?? []), ...(back?.extra ?? []), ...(permit?.ability.additionalCost ?? [])])) {
  /* Creatures tapped as an additional cost (tapAnyAtom): asked once the cast is taken, and paid from the pool -- never tapped
     for, which taps creatures too (a mana creature), the two questions about the same creatures. */
  const tapsAny = tapAnyAtom(variant.atoms);
  /* What it beholds (CR 701.4a): that many there to behold, or not this way; which ones, asked once it is taken. */
  const beholds = beholdAtom(variant.atoms);
  if (beholds && beholdChoices(state, player, id, beholds).length < (beholds.count ?? 1)) continue;
  /* An additional cost of X life (lifeXAtom): X its own offer each, below -- not a cost to pick. */
  const lifeX = lifeXAtom(variant.atoms);
  const offeredAtoms = variant.atoms.filter((a) => a !== tapsAny && a !== beholds && a !== lifeX);
  /* Escalate's creatures to tap (CR 702.120a): that many there to tap now, or not that many modes. */
  if (variant.escalateTap && flashbackTappers(state, player, variant.escalateTap).length < variant.escalateTap.count) continue;
  /* Its targets first, when its cost reads them (aimsFor): each way to choose them costed, and offered, on its own. */
  for (const freely of way ? [false] : free ? (free.limited ? [false, true] : [true]) : [false]) for (const aim of aimsFor(state, object, way?.overload ?? object.spell, {controller: player, source: id, cast})) {
  /* The life it costs: the Citadel's, or -- cast without paying its mana cost by a cost of life (freeLife) -- that. */
  const paidLife = freely ? freeLife(object, free) : lifeCost;
  if (paidLife !== null && paidLife > state.players[player].life) continue;
  const reckoned = castCost(state, player, id, tax, freely, paidLife !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : null, variant.mana, aim);
  const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permit);
  /* The life left to pay with once its other life costs are counted: the alternative cost's, the Citadel's, and what it
     costs more for targeting this way (Terror of the Peaks) -- less than none, and no way to aim it so is offered
     (`affordable`, below; CR 119.4). */
  const aimLife = lifeIncrease(state, player, id, aim);
  /* An additional cost's fixed life (Redirect Lightning; CR 119.4): off what is left, so a way it leaves less than none is no
     way to cast it (`affordable`, below). */
  const extraLife = variant.life ?? 0;
  const lifeLeft = state.players[player].life - extraLife - (back?.life ?? 0) - (way?.life ?? 0) - (paidLife ?? 0) - aimLife;
  /* {X} (CR 107.3, 601.2b): one offer per value the pool can pay, from nothing up; a spell without X, one. And X life
     (lifeX): one per value that life can pay. */
  /* The pool, and mana that may be spent only on this spell (rules/restricted-mana.mjs). */
  const pool = poolFor(state, player, {spell: id});
  for (const X of lifeX ? Array.from({length: lifeLeft + 1}, (_, i) => i) : xValues(pool, cost, x)) {
    /* X in its mana cost: what the pool pays for it, and what decides whether its sources can be tapped for it instead. */
    const xMana = lifeX ? null : X;
    let payment = automaticPayment(pool, cost, {life: lifeLeft, x: x + (xMana ?? 0) * cost.variable});
    /* Not from the pool, but by tapping for it (castTapPlans): one offer, its sources tapped as it is cast -- with more
       than one way to tap, the caster is asked which once it is taken (castCostChoice). */
    let autoTap = false;
    /* Not with creatures tapped as an additional cost or for escalate: one tapped for mana as the cast taps its sources could
       not then be tapped for it (their mana is paid from the pool first). */
    if (!payment && (pooledTaps(state) ? !canPay(pool, cost, {life: lifeLeft, x}) : poolSize(pool) === 0) && xMana === null && !freely && !back && !fled && !way && !tapsAny && !variant.escalateTap && ["hand", "command"].includes(from)) {
      const [plan] = fundingPlans(state, player, id, {...cost, generic: cost.generic + x}, 1, tappable());
      if (plan) {
        autoTap = true;
        payment = plan.payment;
      }
    }
    /* MORE THAN ONE WAY FROM THE POOL (X8b): which mana pays decides what can be cast after, so it is the caster's to say --
       one offer, and the way asked once it is taken (costChoice), never left unoffered. */
    const payWays = !payment && !autoTap && canPay(pool, cost, {life: lifeLeft, x: x + (xMana ?? 0) * cost.variable});
    /* CONVOKE (CR 702.51a): the caster's creatures help pay, and the pool the rest -- one offer, beside any the pool or its
       sources pay alone, when the pool and their untapped creatures could pay it together; which creatures, picked once it
       is taken (castCostChoice). Not with {X}, without paying its mana cost, or with another way to pay -- and not with no
       creature to tap: that cast is the one the pool pays, offered already, and a convoke asking for one creature of none
       could not be answered. */
    const helpers = X === null && !freely && !back && !fled && !way && !variant.escalateTap && hasConvoke(state, id) ? convokers(state, player) : [];
    const convokes = helpers.length > 0 && convokeCanPay(pool, {...cost, generic: cost.generic + x}, helpers);
    /* DELVE (CR 702.66a): cards of its caster's graveyard help pay its generic mana, and the pool the rest -- one offer
       (`convoke` "delve" here, `delve` on the offer), beside any the pool or its sources pay alone, when the pool could pay
       what the most cards it may exile leave; which cards, picked once it is taken (castCostChoice). With flashback or an
       alternative cost too (702.66b), and without paying its mana cost, for the tax it still owes. Not with {X} (none of the
       lane's cards has it); and not with no card to exile or no generic mana for one to pay -- that cast is the one the pool
       pays. */
    const delvers = X === null && hasDelve(state, id) ? delvable(state, player, id) : [];
    const delves = delvers.length > 0 && cost.generic + x > 0 && canPay(pool, lessGeneric(cost, x, Math.min(delvers.length, cost.generic + x)), {life: lifeLeft});
    if (!payment && !payWays && !convokes && !delves) continue;
    const paysFor = offeredAtoms.length ? additionalChoices(state, player, id, offeredAtoms) : [null];
    for (const convoke of [...(payment || payWays ? [false] : []), ...(convokes ? [true] : []), ...(delves ? ["delve"] : [])])
    /* Mana that does something when spent on this spell (Path of Ancestry): each way to pay with it or without it its own
       offer (`riders`, rules/restricted-mana.mjs). */
    for (const riders of (convoke || autoTap || payWays ? null : riderChoices(state, player, {spell: id}, payment?.mana ?? {})) ?? [undefined])
    /* The gift promised (CR 702.174a, 702.174k): to which opponent still in the game, its caster's choice -- one offer each. */
    for (const gift of variant.gift ? state.players.filter((p) => p.id !== player && !p.lost).map((p) => p.id) : [undefined])
    for (const costChoice of paysFor) {
      /* Face down, it has no name (CR 708.2a): the offer, its caster's alone, names the card they cast so. */
      /* X paid in life (`payLifeX`, Toxic Deluge): said on the offer, for whoever weighs what it costs (pilots/house-pilot.mjs). */
      const base = {kind: "cast", objectId: id, label: way?.disguise ? object.faceDownCard.card : object.card, payment: convoke || payWays ? null : payment, from, tax, ...(X !== null ? {x: X} : {}),
        ...(lifeX ? {payLifeX: true} : {}), ...(autoTap && !convoke ? {autoTap: true} : {}),
        ...(payWays && !convoke ? {payWays: true} : {}),
        ...(convoke === true ? {convoke: true} : {}), ...(convoke === "delve" ? {delve: true} : {}), ...(variant.mana ? {extraMana: variant.mana} : {}), ...(extraLife ? {extraLife} : {}), ...(variant.kicked ? {kicked: variant.kicked} : {}),
        ...(variant.replicated ? {replicated: variant.replicated} : {}), ...(gift !== undefined ? {gift} : {}), ...(variant.offspring ? {offspring: true} : {}),
        ...(tapsAny ? {tapAny: true} : {}), ...(beholds ? {behold: beholds.count ?? 1} : {}),
        /* Escalated (CR 702.120a): how many modes beyond the first, and how many creatures that taps. */
        ...(variant.escalate ? {escalate: variant.escalate} : {}), ...(variant.escalateTap ? {escalateTap: variant.escalateTap.count} : {}),
        /* A set of cards ("discard two cards") names each one. */
        ...(costChoice ? {costChoice, costNames: Object.values(costChoice).flatMap((c) => [].concat(c).map((one) => state.objects[one].card))} : {}),
        ...(freely ? {free: true} : {}), ...(back ? {flashback: true} : {}), ...(fled ? {escape: fled.kind} : {}), ...(way?.disguise ? {disguise: true} : way ? {alternative: way.index} : {}),
        ...viaOf(state, via), ...(asType ? {asType} : {}), ...(paidLife !== null ? {lifeInstead: paidLife} : {}), ...ridersOffer(state, riders),
        /* Cast as its Adventure (CR 715.3): another action than the card cast as itself. */
        ...(adventure ? {adventure: true} : {})};
      /* A way to aim it that costs more life than there is -- a mode's target, chosen here, at Terror of the Peaks -- is no way
         to cast it (CR 119.4). */
      const affordable = (offer) => lifeIncrease(state, player, id, offer.targets) <= lifeLeft + aimLife;
      actions.push(...(object.spell?.modal && !way?.overload ? withModes(state, base, object.spell.modal, {controller: player, source: id}, variant.escalate !== undefined ? variant.escalate + 1 : null, variant.tier ?? null)
        : withTargets(state, base, way?.overload ?? object.spell, {controller: player, source: id, cast}, aim)).filter(affordable));
    }
  }
  }
  }
  }
  return actions;
}

/* TURNING A MANIFESTED PERMANENT FACE UP (CR 701.40b; 116.2b, a special action): any time its controller has priority,
   whatever the step and whatever is on the stack -- for a creature card with a mana cost, that cost paid (X as 0, CR
   107.3, nothing chooses it), from the pool as an activated ability's is. Its label names the card, for the one player it
   is offered to, who may look at it (CR 708.5). An instant or sorcery card, or a card with no mana cost, can't be turned
   face up this way (701.40b, 701.40g). */
/* AND FOR ITS DISGUISE COST (CR 702.168d): a face-down permanent whose card has disguise, any time its controller has
   priority -- `disguise`, that cost paid. One cast face down with disguise is turned face up that way alone; a manifested one
   either way (CR 701.40b). */
function faceUpCost(state, player, id, disguise = false) {
  const real = state.objects[id].faceDownCard;
  const cost = disguise ? disguiseOf(real)?.cost.find((a) => a.atom === "mana")?.cost ?? null
    : state.objects[id].disguised !== true && (real.types ?? []).includes("Creature") ? real.manaCost : null;
  if (!cost) return null;
  return automaticPayment({...state.players[player].manaPool}, parseManaCost(cost), {life: state.players[player].life, x: 0});
}
function faceUpOffers(state, player) {
  const offers = [];
  for (const id of state.zones.battlefield) {
    if (state.objects[id].faceDown !== true || characteristicsOf(state, id).controller !== player) continue;
    for (const disguise of [false, true]) {
      const payment = faceUpCost(state, player, id, disguise);
      if (payment) offers.push({kind: "turn-face-up", objectId: id, label: state.objects[id].faceDownCard.card, text: "Turn face up", payment, ...(disguise ? {disguise: true} : {})});
    }
  }
  return offers;
}

/* SUSPEND N--[COST] FROM THE HAND (CR 702.62a): "If you could begin to cast this card by putting it onto the stack from your
   hand, you may pay [cost] and exile it with N time counters on it. This action doesn't use the stack" -- a special action
   (CR 116.2f), offered when the card could be cast from its owner's hand now: at its own timing (a sorcery's, unless it has
   flash or is given it) and with nothing forbidding the cast (702.62c), whether or not its mana cost could be paid. Its cost
   is paid from the pool -- not mana only for spells, since no spell is cast -- each way the pool pays it its own offer
   (`payWith`), which mana being the player's to say (X8b). Exiled, the card is suspended (702.62b): rules/trigger.mjs then
   removes a time counter at each of its owner's upkeeps and offers the free cast as the last goes. */
const suspendOf = (object) => (object?.abilities ?? []).find((a) => a.kind === "static" && a.rule === "suspend") ?? null;
const suspendCost = (suspend) => parseManaCost((suspend.cost ?? []).find((a) => a.atom === "mana")?.cost ?? "");
function suspendOffers(state, player) {
  const offers = [];
  const sorceryTime = player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0;
  for (const id of cardsIn(state, "hand", player)) {
    const object = state.objects[id], suspend = suspendOf(object);
    if (!suspend || castForbidden(state, player, id)) continue;
    if (sorcerySpeed(object) && !hasFlash(state, id) && !flashGranted(state, player, id) && !sorceryTime) continue;
    const ways = paymentOptions(state.players[player].manaPool, suspendCost(suspend), {life: state.players[player].life}, PAY_CHOICES);
    for (const way of ways) offers.push({kind: "suspend", objectId: id, label: object.card, text: suspend.text, payment: way, ...(ways.length > 1 ? {payWith: paymentKey(way)} : {})});
  }
  return offers;
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
    /* From the graveyard, or the top of the library, when a permanent says so: the same land drop (CR 305.2). And from exile
       face down, named as the land it is to the one player offered it (withFaceUp, CR 406.3a). */
    for (const id of playableElsewhere(state, player, "land")) actions.push(...withFaceUp(state, id, () => permissionWays(state, player, id, "land")
      .map((via) => ({kind: "play-land", objectId: id, label: state.objects[id].card, from: state.objects[id].zone, ...viaOf(state, via)}))));
  }

  /* CR 605.3a: any time you have priority, whatever the step. */
  const mana = manaOffers(state, player);
  actions.push(...mana);
  actions.push(...faceUpOffers(state, player));
  /* SPLIT SECOND (CR 702.61a-b): a spell with it on the stack, and nothing else is cast or activated -- passing, the mana
     abilities and the special actions above are all there is. */
  if (splitSecondOnStack(state)) return actions;
  /* What a cast could tap, read once and only if a cast asks (castTapPlans). */
  let units = null;
  const tappable = () => (units ??= tapUnits(state, player, mana, pooledTaps(state)));

  /* CR 601.2. Offered only when the pool can pay: the engine does not offer what it cannot do.
     A commander is castable from the COMMAND ZONE as well as from hand (CR 903.8), and its tax is
     part of the cost — so a taxed commander a player cannot afford is never offered, rather than
     offered and refused at payment. */
  const castable = [
    ...cardsIn(state, "hand", player).map((id) => ({id, from: "hand"})),
    ...playableElsewhere(state, player, "spell").flatMap((id) => permissionWays(state, player, id, "spell")
      .flatMap((via) => typeWays(state, player, id, via).map((asType) => ({id, from: state.objects[id].zone, via, ...(asType ? {asType} : {})})))),
    ...cardsIn(state, "command", player)
      .filter((id) => state.objects[id].commander === true)
      .map((id) => ({id, from: "command"})),
    /* Flashback (CR 702.34a): from the graveyard, for the flashback cost. */
    ...cardsIn(state, "graveyard", player).filter((id) => flashbackCost(state, player, id)).map((id) => ({id, from: "graveyard", flashback: true})),
    /* Escape (CR 702.138a): from the graveyard, for an escape cost -- each way one offer, its other cards picked once it is
       taken (`castCostChoice`), never one offer per set of them. */
    ...cardsIn(state, "graveyard", player).flatMap((id) => escapeWays(state, player, id).map((way) => ({id, from: "graveyard", escape: way.kind}))),
    /* And by its own alternative cost from the graveyard (CR 118.9; Squee, Dubious Monarch): its other cards picked once taken. */
    ...cardsIn(state, "graveyard", player).filter((id) => alternativeCosts(state, player, id).some((w) => w.fromGraveyard)).map((id) => ({id, from: "graveyard", graveyardCost: true})),
  ];
  /* A card exiled face down, by its own cost, timing and targets (withFaceUp, CR 406.3a, 601.2). */
  for (const entry of castable) actions.push(...withFaceUp(state, entry.id, () => castOffers(state, player, entry, tappable)));
  /* Disguise (CR 702.168a): face down for {3}, from wherever the card could be cast as that face-down spell -- its owner's
     hand, the command zone (a commander), or a zone a permission opens to it, the permission weighed face down too: Mystic
     Forge's "colorless spells" takes it in, Thundermane Dragon's "power 4 or greater" does not (702.168b). Never for
     flashback or escape, other alternative costs (CR 118.9a): a card in a graveyard with no permission is not offered. */
  const disguisable = new Set([...castable.map((e) => e.id), ...allPlayPermissions(state, player).flatMap(({ability}) => permittedFrom(state, player, ability))]);
  for (const id of disguisable) {
    if (!disguiseOf(state.objects[id])) continue;
    const from = state.objects[id].zone;
    actions.push(...withFaceDown(state, id, () => (["hand", "command"].includes(from) ? [null] : playPermission(state, player, id, "spell") !== null ? permissionWays(state, player, id, "spell") : [])
      .flatMap((via) => castOffers(state, player, {id, from, via, disguise: true}, tappable))));
  }
  /* Suspend, from the hand (CR 702.62a): a special action, where its card could be cast. */
  actions.push(...suspendOffers(state, player));
  /* CR 715.3a: a permission weighs the Adventure's own characteristics. Its main face may
     exceed Maralen's limit even when the Adventure is eligible, or the converse. */
  const adventurers = new Set([...castable.filter(e => !e.flashback && !e.escape).map(e => e.id),
    ...allPlayPermissions(state, player).flatMap(({ability}) => permittedFrom(state, player, ability))]);
  /* One exiled face down is an adventurer card only as the card it is (withFaceUp, CR 406.3a, 715.3). */
  for (const id of adventurers) actions.push(...withFaceUp(state, id, () => {
    if (!state.objects[id]?.adventurer) return [];
    const from = state.objects[id].zone;
    return withAdventure(state, id, () => adventureFrom(state, player, id, from)
      ? permissionWays(state, player, id, "spell").flatMap(via => castOffers(state, player, {id, from, via, adventure: true}, tappable)) : []);
  }));

  /* CR 602.2: a permanent's activated abilities, whenever its controller has priority; a sorcery-speed one only
     when a sorcery could be cast. */
  const sorceryTime = player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0;
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (object.controller !== player) continue;
    /* "Its activated abilities can't be activated this turn" (Koma, Cosmos Serpent; CR 602.5; state/index.mjs), and "during
       your turn, your opponents can't activate abilities of artifacts, creatures, or enchantments" (Grand Abolisher). */
    if (activationsForbidden(state, id) || permanentActivationForbidden(state, id)) continue;
    /* "Return target card of the chosen type" (Dawn-Blessed Pennant): each ability read with its permanent's own choice. */
    for (const ability of abilitiesOf(state, id).map((own) => (object.chosen !== undefined ? chosenFor(own, object) : own))) {
      /* An ability of the card in its owner's hand (cycling, ninjutsu) or graveyard (encore) is not the permanent's (CR 602.2,
         702.29a, 702.141a). */
      if (ability.kind !== "activated" || ability.zone === "hand" || ability.zone === "graveyard") continue;
      /* A loyalty ability any time its controller could cast an instant, on any player's turn, while an effect says so of its
         permanent (Jace's Machinations; CR 606.3's timing, rules/statics.mjs `loyalty-at-instant-speed`). */
      if (ability.timing === "sorcery" && !sorceryTime && !(ability.loyalty !== undefined && ruleChanged(state, "loyalty-at-instant-speed", id))) continue;
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      if (!withinLimit(state, id, ability)) continue;
      /* A loyalty ability: only if none of this permanent's has been activated this turn (CR 606.3). */
      if (ability.loyalty !== undefined && usesThisTurn(state, id, "loyalty") > 0) continue;
      actions.push(...abilityOffers(state, player, id, ability));
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
      /* "Cycling {X}{1}{U}" (Shark Typhoon): one offer for each X the pool can pay; ninjutsu's "return an unblocked attacking
         creature you control to its owner's hand", one per creature it may be -- as a permanent's are (abilityOffers). */
      actions.push(...abilityOffers(state, player, id, ability));
    }
  }

  /* An ability a card has in its owner's graveyard -- encore (CR 702.141a), "Sacrifice two Eldrazi: Return this card from
     your graveyard to your hand" (Eldrazi Ravager) -- whenever that player has priority, at its own timing, its costs
     offered, chosen and paid as a permanent's are (CR 602.2; abilityOffers). */
  for (const id of cardsIn(state, "graveyard", player)) {
    const object = state.objects[id];
    for (const ability of object.abilities ?? []) {
      if (ability.kind !== "activated" || ability.zone !== "graveyard") continue;
      if (ability.timing === "sorcery" && !sorceryTime) continue;
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      actions.push(...abilityOffers(state, player, id, ability));
    }
  }

  /* "During combat, players can't ... activate abilities that aren't mana abilities" (Yuriko, Blade of the Mighty; CR
     602.5; rules/statics.mjs): no activation offered, from anywhere -- a mana ability (`activate-mana`, CR 605.3a) still is. */
  return activationForbidden(state, player) ? actions.filter((a) => a.kind !== "activate") : actions;
}

/* AN ACTIVATED ABILITY'S OFFERS (CR 602.2), wherever it works from -- a permanent's, or a card's in a hand, the command zone
   or a graveyard: one for each X the pool can pay (CR 107.3), each way to pay its costs that its player chooses as they
   activate it (CR 602.2b, 601.2h) -- the permanents to sacrifice, the one to return, the cards to discard, the creatures
   to tap or untap, the card of the graveyard to exile -- and each way to spend rider mana, each with its targets or modes.
   A cost with nothing to pay it with makes no offer: it can't be activated (CR 118.3). The caller says whether the ability
   may be activated now at all (its zone, its timing, its condition, its limit). */
function abilityOffers(state, player, id, ability) {
  const object = state.objects[id];
  const actions = [];
  /* Its targets first, when its cost reads them (abilityAims): each way to choose them costed, and offered, on its own. */
  for (const X of abilityXValues(state, player, ability, id)) for (const aim of abilityAims(state, ability, {controller: player, source: id, ...(X !== null ? {x: X} : {})})) {
    const plain = costPayment(state, player, id, ability.cost, X ?? 0, abilityLess(state, player, id, ability, aim));
    /* Waterbend (CR 701.67a): beside the pool's payment, one offer that taps artifacts and creatures for part of it, when
       some may be -- which ones, and the mana for the rest, asked once it is taken. */
    const bends = (waterbendRange(state, player, id, ability, X ?? 0, abilityLess(state, player, id, ability, aim))?.most ?? 0) > 0;
    if (!plain && !bends) continue;
    const atom = sacrificeAtom(ability.cost), back = returnAtom(ability.cost), toss = discardAtom(ability.cost);
    /* A permanent you control to sacrifice, or to return to its owner's hand, or a card in your hand to discard: one
       offer each (CR 602.2b). No card to discard, and the ability can't be activated. */
    const crew = crewAtom(ability.cost), tapper = tapAtom(ability.cost), untapper = untapAtom(ability.cost), blighter = blightAtom(ability.cost), grave = graveyardAtom(ability.cost);
    const anyCounter = (ability.cost ?? []).some((a) => a?.atom === "removeAnyCounter" && a.self === true);
    /* "Sacrifice two other creatures" (Priest of Forgotten Gods): each set of `count` of them, one offer each, as the
       cards of "discard two cards" are; fewer than that there, and it can't be activated. */
    /* Ten of many permanents: one offer, the ten asked once it is taken (sacrificesLater). */
    const later = sacrificesLater(state, player, id, atom), among = countersAmongAtom(ability.cost);
    const fodder = later ? [null] : atom ? discardSets(sacrificeChoices(state, player, id, atom.selector), atom.count ?? 1).map((s) => ({sacrifice: s}))
      : back ? sacrificeChoices(state, player, id, back.selector).map((r) => ({returnToHand: r}))
      /* "Discard a creature card" (Fauna Shaman): only a card its selector describes. */
      : toss ? discardSets(cardsIn(state, "hand", player).filter((c) => c !== id && (!toss.selector || compileSelector({...toss.selector, what: "card", zone: "hand"})(state, c, {controller: player, source: id}))),
        toss.count ?? 1).map((d) => ({discard: d}))
      : crew ? crewChoices(state, player, id, crew.power).map((set) => ({crew: set}))
      : tapper ? ((tapper.count ?? 1) > 1 ? tapSets(state, player, id, tapper.selector, tapper.count, (ability.cost ?? []).some((a) => a?.atom === "{T}")).map((set) => ({tapAll: set}))
        : tapChoices(state, player, id, tapper.selector).map((t) => ({tap: t})))
      : untapper ? untapChoices(state, player, untapper.count).map((set) => ({untap: set}))
      : blighter ? blightChoices(state, player).map((c) => ({blight: c}))
      /* A card of the graveyard to exile: one offer each; none there, and it can't be activated (CR 118.3). */
      : grave ? graveyardChoices(state, player, id, grave.selector).map((c) => ({exile: c}))
      : anyCounter ? Object.entries(object.counters ?? {}).filter(([, n]) => n > 0).map(([counter]) => ({counter})) : [null];
    for (const payment of [...(plain ? [plain] : []), ...(bends ? [{waterbend: true}] : [])])
    for (const costChoice of fodder)
    /* What rider mana it spends, when it must spend some (rules/restricted-mana.mjs, riderChoices). Not a waterbend offer's:
       its mana is known only once the permanents it taps are picked, so the rest is paid as anything but a spell is, the
       plain mana first and the rider mana after (spendFor). */
    for (const riders of (payment.payWays || payment.waterbend ? null : riderChoices(state, player, {ability: id}, payment.mana?.mana ?? {})) ?? [undefined])
      actions.push(...withModesOrTargets(state, {kind: "activate", objectId: id, abilityId: ability.id, label: object.card, text: ability.text,
        ...(payment.waterbend ? {payment: null, waterbend: true} : offeredPayment(payment)), ...(X !== null ? {x: X} : {}), ...ridersOffer(state, riders),
        /* A loyalty ability says its loyalty cost (CR 606.4), for a pilot to weigh. */
        ...(ability.loyalty !== undefined ? {loyalty: ability.loyalty === "-X" ? -(X ?? 0) : ability.loyalty} : {}),
        /* What its player picks once it is taken: the permanents to sacrifice, the counters to remove (choose-cost). */
        ...(later ? {sacrificeLater: atom.count} : {}), ...(among ? {countersLater: among.count} : {}),
        ...(costChoice ? {costChoice, costNames: costChoice.crew ? costChoice.crew.map((c) => state.objects[c].card)
          : costChoice.untap ? costChoice.untap.map((c) => state.objects[c].card)
          : costChoice.tapAll ? costChoice.tapAll.map((c) => state.objects[c].card)
          : Array.isArray(costChoice.discard) ? costChoice.discard.map((c) => state.objects[c].card)
          : Array.isArray(costChoice.sacrifice) ? costChoice.sacrifice.map((c) => state.objects[c].card)
          : costChoice.counter !== undefined ? [`a ${costChoice.counter} counter`]
          : [state.objects[costChoice.sacrifice ?? costChoice.returnToHand ?? costChoice.discard ?? costChoice.tap ?? costChoice.blight ?? costChoice.exile].card]} : {})}, ability,
        /* "With mana value X": the X of this offer (script/filter.mjs). */
        {controller: player, source: id, ...(X !== null ? {x: X} : {})}, aim));
  }
  return actions;
}

/**
 * Cast a card as an effect resolves (CR 608.2g; effects/asking.mjs, `play`): one of `castChoicesNow`'s, what it costs
 * already the effect's to have paid. No priority is needed, nor a sorcery's timing.
 */
/* `terms.graveyardToExile`: "if that spell would be put into a graveyard, exile it instead" (Halo Forager). */
export function castNow(state, player, action, terms = {}) {
  return perform(state, player, action, {paid: true, ...(terms.graveyardToExile === true ? {graveyardToExile: true} : {})});
}

/**
 * PLAYING A LAND AS AN EFFECT RESOLVES (CR 305.2a; effects/asking.mjs, `play`'s `lands`): "you may play the exiled card"
 * (Windbrisk Heights) plays a land card among them, not casts it -- put onto the battlefield by the play-land action
 * (perform, through castNow), one of the turn's land plays like any other. Never on another player's turn (CR 305.3), nor
 * with no land play left (305.2b): the effect's instruction is then ignored, and nothing is offered. The step and the stack
 * do not matter -- the effect is what lets it be played now. The card as it is: a face-down one is shown face up by the
 * caller (withFaceUp, CR 406.3a). A modal double-faced card with a land on its back is played with that face up (CR 712.12).
 */
export function landChoicesNow(state, player, id) {
  const object = state.objects[id];
  if (!object || player !== state.activePlayer || landDropsLeft(state, player) <= 0) return [];
  return [...(isLand(object) ? [{kind: "play-land", objectId: id, label: object.card, from: object.zone}] : []),
    ...(backLand(object) ? [{kind: "play-land", objectId: id, label: object.mdfc.back.card, face: "back", from: object.zone}] : [])];
}

/** The ways to cast this card now as an effect lets it be cast: its targets or modes. Not a land, an Aura, or a spell with an additional cost to choose. */
export function castChoicesNow(state, player, id) {
  /* An adventurer card: as itself, or as its Adventure (CR 715.3) -- an effect that lets it be cast lets it be cast as one
     (715.3d), each its own choice, the Adventure's weighed with the card shown as one (715.3a). */
  const object = state.objects[id];
  const own = choicesNow(state, player, id);
  if (!object?.adventurer || object.face === "adventure") return own;
  return [...own, ...withAdventure(state, id, () => choicesNow(state, player, id).map((offer) => ({...offer, adventure: true})))];
}
function choicesNow(state, player, id) {
  const object = state.objects[id];
  if (!object || (object.types ?? []).includes("Land") || object.enchant || (object.spell?.additionalCost ?? []).length || castForbidden(state, player, id)) return [];
  /* Nor while a spell with split second is on the stack (CR 702.61a): no spell is cast then, as an effect resolves either. */
  if (splitSecondOnStack(state)) return [];
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
 *
 * AND WITH SOMETHING ON THE STACK (`stack`; Linear ROB-13, the room's `passStack`): the same count, at instant speed --
 * no sorcery-speed spell can be cast with the stack full (CR 307.1) -- and a mana ability that does more than add mana
 * (`plainMana`) is a response in itself, so it is asked. Without `stack`, a player with anything on the stack is always
 * asked, as before.
 */
export function nothingToDo(state, player, actions = legalActions(state, player), {stack = false} = {}) {
  return deriving(state, () => idle(state, player, actions, stack));
}
/* A MANA ABILITY THAT ONLY MAKES MANA: its costs a tap and mana at most, and nothing after it but a painland's hurt to its
   own controller (Adarkar Wastes, Ancient Tomb). One that sacrifices (Phyrexian Altar, Lotus Petal), taps another creature
   (Jaspera Sentinel), pays life (Mana Confluence), removes counters (Ramos), mills (Millikin) or exiles (Rubble Rouser), or
   does something else as it resolves (The Great Henge's life, Strixhaven Stadium's counter), changes the board: in response
   to a spell, that is a play, not nothing. */
const MANA_COSTS = ["sacrifice", "sacrificeSelf", "tapCreature", "payLife", "counterCost", "millCost", "exileFromGraveyard"];
const selfHurt = (effect) => effect?.effect === "dealDamage" && effect.who === "you";
export const plainMana = (ability) => Boolean(ability) && !MANA_COSTS.some((key) => ability[key] !== undefined && ability[key] !== false)
  && (ability.then ?? []).every(selfHurt);
function idle(state, player, actions, stack = false) {
  if (state.priorityPlayer !== player || (state.stack.length && !stack)) return false;
  if (actions.some((a) => a.kind !== "pass" && a.kind !== "activate-mana")) return false;
  if (state.stack.length && actions.some((a) => a.kind === "activate-mana" && !plainMana(abilitiesOf(state, a.objectId).find((x) => x.id === a.abilityId)))) return false;
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
  /* A sorcery's time is the player's own main phase with the stack empty (CR 307.1). */
  const mainNow = player === state.activePlayer && MAIN_PHASES.includes(state.phase) && !state.stack.length;
  /* And what a permanent lets them cast from another zone (the top of the library, say). */
  const spells = [...cardsIn(state, "hand", player), ...cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true), ...playableElsewhere(state, player, "spell")];
  /* And what they may cast from their graveyard for another cost -- flashback (CR 702.34a), escape (702.138a) -- counted at
     that cost's mana: a Woe Strider that could escape is something to do. */
  const fromGraveyard = cardsIn(state, "graveyard", player).some((id) => {
    const object = state.objects[id];
    if (sorcerySpeed(object) && !hasFlash(state, id) && !flashGranted(state, player, id) && !mainNow) return false;
    const back = flashbackCost(state, player, id);
    const costs = [back && flashbackPayable(state, player, back) ? back.mana : null, ...escapeWays(state, player, id).map((way) => way.mana),
      /* And its own alternative cost there (Squee, Dubious Monarch). */
      ...alternativeCosts(state, player, id).filter((way) => way.fromGraveyard).map((way) => way.mana)].filter((m) => typeof m === "string");
    return costs.some((m) => manaValue(parseManaCost(m)) <= mana);
  });
  if (fromGraveyard) return false;
  const castableNow = (id) => {
    const object = state.objects[id];
    /* Or for its warp cost from the hand, at its speed (CR 702.185a), or its sneak cost in its caster's declare blockers step
       (CR 702.190a; the way's condition says when): a cost the mana could pay is something to do -- a creature that could
       be cast only by sneaking, then, is never passed for. */
    const timelyHere = !sorcerySpeed(object) || hasFlash(state, id) || flashGranted(state, player, id) || mainNow;
    if (alternativeCosts(state, player, id).some((way) => ((way.paidFor === "warp" && object.zone === "hand" && timelyHere) || way.sneak === true)
      && manaValue(parseManaCost(way.mana)) <= mana)) return true;
    if (!object.manaCost || (sorcerySpeed(object) && !hasFlash(state, id) && !flashGranted(state, player, id) && !mainNow)) return false;
    const tax = object.zone === "command" ? commanderTax(state, player, id) : 0;
    /* What it costs now, reductions included: a spell made castable by a Medallion is something to do. */
    /* manaValue reads the printed symbols; the reduction lowered the generic count, so take off what it took. */
    const printed = parseManaCost(object.manaCost);
    const needs = ({cost, x}) => manaValue(printed) - (printed.generic - cost.generic) + x;
    /* A cost that reads its targets (aimsFor): what the cheapest way to choose them leaves -- Magnificent End at a tapped
       creature is something to do with two mana. */
    return aimsFor(state, object, object.spell, {controller: player, source: id, cast: {from: object.zone, mainPhase: mainNow}})
      .some((aim) => needs(castCost(state, player, id, tax, false, null, "", aim)) <= mana);
  };
  /* And an adventurer card's Adventure, where it may be cast as one (CR 715.3): an instant there is mana for, in the
     opponent's turn, is something to do. */
  /* And a card exiled face down that they may play, as the card it is (withFaceUp, CR 406.3a). */
  return !spells.some((id) => withFaceUp(state, id, () => castableNow(id)
    || (Boolean(state.objects[id]?.adventurer) && withAdventure(state, id, () => adventureFrom(state, player, id, state.objects[id].zone) && castableNow(id)))));
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
  /* And one delved (CR 702.66a): its cards, too, are picked after it is taken. */
  && (a.delve === true) === (b.delve === true)
  /* And a double-faced card played with its back face up another than with its front (CR 712.12). */
  && (a.face ?? null) === (b.face ?? null)
  /* And an adventurer card cast as its Adventure another than cast as itself (CR 715.3). */
  && (a.adventure === true) === (b.adventure === true)
  /* And with escape, its own or one given (CR 702.138a): another cost, and what it cast escaped. The cards it exiles are
     picked after the offer is taken, so they are not part of it. */
  && (a.escape ?? null) === (b.escape ?? null)
  /* An alternative cost (CR 118.9) is another action than paying the mana cost; and paying an additional cost's mana
     ("or pay {3}") another than paying its other choice. */
  && (a.alternative ?? null) === (b.alternative ?? null)
  && (a.extraMana ?? null) === (b.extraMana ?? null)
  /* And paying an additional cost's life ("pay 5 life or pay {2}") another than paying its mana. */
  && (a.extraLife ?? 0) === (b.extraLife ?? 0)
  /* And replicated that many times (CR 702.56a): another cost, and that many copies. */
  && (a.replicated ?? 0) === (b.replicated ?? 0)
  /* And a gift promised, to that opponent (CR 702.174a): another cost, and another player given it. */
  && (a.gift ?? null) === (b.gift ?? null)
  /* And its offspring cost paid (CR 702.175a): another cost, and a token copy as it enters. */
  && (a.offspring === true) === (b.offspring === true)
  /* And escalated for that many modes beyond the first, tapping that many creatures (CR 702.120a): another cost. Which
     creatures is picked after the offer is taken, so they are not part of it (and are held to the cost as it is paid). */
  && (a.escalate ?? 0) === (b.escalate ?? 0) && (a.escalateTap ?? 0) === (b.escalateTap ?? 0)
  /* And one that beholds (CR 701.4a) another than one that pays the other choice. What it beholds is picked after. */
  && (a.behold ?? 0) === (b.behold ?? 0)
  /* And played or cast through another permanent's permission (permissionWays): another action, when they differ. */
  && (a.via ?? null) === (b.via ?? null)
  /* And cast as another of its permanent types through a permission kept by type (Muldrotha; typeWays). */
  && (a.asType ?? null) === (b.asType ?? null)
  /* And paid with other mana that does something when spent (Path of Ancestry): another action. */
  && JSON.stringify(a.riders ?? null) === JSON.stringify(b.riders ?? null)
  /* And the modes chosen as it is cast (CR 700.2): another choice is another action. */
  && JSON.stringify(a.modes ?? null) === JSON.stringify(b.modes ?? null)
  && targetKey(a) === targetKey(b);

/** The target specs an offer's targets were chosen by, and the context they were chosen in. */
export function offerSpecs(state, player, action) {
  const object = state.objects[action.objectId];
  if (!object) return {specs: [], context: {controller: player, source: action.objectId}};
  /* With what the offer has chosen so far: "a second target", "up to one other target" (script/bind.mjs, distinctFrom). */
  const context = {controller: player, source: action.objectId, chosenTargets: action.targets ?? []};
  if (action.kind === "cast") return {specs: object.spell?.modal && Array.isArray(action.modes) ? modalScript(object.spell.modal, action.modes).targets : object.spell?.targets ?? [], context};
  const ability = chosenFor(abilitiesOf(state, action.objectId).find((candidate) => candidate.id === action.abilityId), object);
  return {specs: ability?.modal && Array.isArray(action.modes) ? modalScript(ability.modal, action.modes).targets : ability?.targets ?? [], context};
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
/* An Adventure's asked with the card shown as its Adventure, as its offer was made (CR 715.3a): the cast stopped to ask
   inside withAdventure, which has shown the card as itself again since -- read so, "up to one target creature" (Meager
   Meal) was the creature card's, which has no spell, and asked of every permanent. */
export function chooseTargetsChoice(state, awaiting) {
  return asCast(state, awaiting.action, () => {
    const {specs, context} = offerSpecs(state, awaiting.player, awaiting.action);
    const object = state.objects[awaiting.action.objectId];
    const ability = awaiting.action.kind === "activate" ? abilitiesOf(state, awaiting.action.objectId).find((a) => a.id === awaiting.action.abilityId) : object?.spell;
    return countedChoice(state, specs[awaiting.index], context, {id: `choose-targets:${awaiting.action.objectId}:${awaiting.index}`,
      name: object?.card ?? "That spell", hostile: awaiting.action.hostile === true || isHostile(ability?.effects ?? []), placeholder: awaiting.action.targets[awaiting.index]});
  });
}

/**
 * The counted target picked: kept in the offer, then the next asked, or the offer taken with every target chosen --
 * cast or activated now, as it would have been had they been chosen with it (CR 601.2c-i, 602.2b).
 */
export function resolveChooseTargets(state, awaiting, indices) {
  const action = structuredClone(awaiting.action);
  /* An Adventure's checked and its next target found with the card shown as one (CR 715.3a); the cast itself shows it so
     again (perform). */
  const next = asCast(state, action, () => {
    const choice = chooseTargetsChoice(state, awaiting);
    const picked = [...new Set(indices ?? [])].sort((a, b) => a - b);
    if (picked.length !== (indices ?? []).length || picked.length < choice.min || picked.length > choice.max || picked.some((i) => !choice.options[i]))
      throw new Error("Invalid selection");
    action.targets[awaiting.index] = picked.map((i) => choice.options[i].targets[0]);
    return nextToChoose(state, awaiting.player, action);
  });
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
    /* "Controlled by different players" (script/bind.mjs): refused with what to do instead. */
    const split = differentControllersProblem(state, spec, chosen, state.objects[action.objectId]?.card ?? "That spell");
    if (split) throw new Error(split);
    /* "From a single graveyard", "that share a creature type" (script/bind.mjs): refused with what to do instead. */
    const apart = shareProblem(state, spec, chosen, state.objects[action.objectId]?.card ?? "That spell");
    if (apart) throw new Error(apart);
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
  }
  /* CAST AS AN ADVENTURE (CR 715.3): the card shown as its Adventure from here on -- its targets, its cost, the spell put on
     the stack -- and as itself again if it is not cast after all (a question asked first, a cost refused). */
  /* CAST WITH DISGUISE (CR 702.168b): shown face down from here on, and put on the stack so (rules/stack.mjs). */
  /* PLAYED FROM EXILE FACE DOWN (CR 406.3a): turned face up from here on -- announced, put on the stack or the battlefield
     and named to every player as the card it is -- and face down again if it is not played after all (asCast). */
  if (action?.kind === "cast" || action?.kind === "play-land") return asCast(state, action, () => performOffered(state, player, action, during));
  return performOffered(state, player, action, during);
}

/* An action already found among the offers (perform), done. */
function performOffered(state, player, action, during) {
  if (!during) {
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
    /* A GRAVEYARD ALTERNATIVE COST'S OTHER CARDS (Squee, Dubious Monarch): the same -- which, asked before anything is paid. */
    if (action.kind === "cast" && action.alternative !== undefined && !Array.isArray(action.othersExiled)
      && alternativeCosts(state, player, action.objectId).find((w) => w.index === action.alternative)?.exileOthers) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* A FLASHBACK COST THAT TAPS CREATURES (Battle Screech): the same -- which ones, asked before anything is paid. */
    if (action.kind === "cast" && action.flashback === true && !Array.isArray(action.flashbackTap) && flashbackCost(state, player, action.objectId)?.tap) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* AND ONE THAT SACRIFICES (Dread Return; wave 4c, k2): which permanents, asked before anything is paid. */
    if (action.kind === "cast" && action.flashback === true && !Array.isArray(action.flashbackSacrifice) && flashbackCost(state, player, action.objectId)?.sacrifice) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* PAID FROM THE POOL, more than one way (X8b; castOffers, costPayment): which way, asked before anything is paid. */
    if ((action.kind === "cast" || action.kind === "activate") && action.payWays === true && action.payWith === undefined) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* CREATURES TAPPED AS AN ADDITIONAL COST, any number of them (Burn at the Stake): which, asked before anything is paid --
       with no untapped creature to tap, none, the one number there is, and nothing is asked. */
    if (action.kind === "cast" && action.tapAny === true && !Array.isArray(action.tapChosen)) {
      if (!tapAnyChoices(state, player, action.objectId, additionalAtom(state.objects[action.objectId]?.spell?.additionalCost, "tapCreature")).length)
        action = {...structuredClone(action), tapChosen: []};
      else {
        state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
        return [];
      }
    }
    /* BEHOLD (CR 701.4a, 601.2h): which to choose or reveal, asked before anything is paid. */
    if (action.kind === "cast" && action.behold > 0 && !Array.isArray(action.beheld)) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* ESCALATE'S CREATURES (CR 702.120a, 601.2h): which to tap for the modes beyond the first, asked before anything is paid. */
    if (action.kind === "cast" && action.escalateTap > 0 && !Array.isArray(action.escalateTapped)) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* CONVOKE (CR 702.51a): which creatures help pay, asked before anything is tapped or paid. */
    if (action.kind === "cast" && action.convoke === true && !Array.isArray(action.convokeTap)) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* And with them picked, the pool paying the rest more than one way (convokeWays): which mana pays it, asked before
       anything is tapped or paid (CR 601.2g-h; X8b), never decided for the caster. Picks that are not untapped creatures of
       theirs are refused here, as they would be when it is paid. */
    if (action.kind === "cast" && action.convoke === true && action.payWith === undefined && convokeWays(state, player, action).length > 1) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* DELVE (CR 702.66a): which cards of the graveyard help pay, asked before anything is paid -- then, the pool paying the rest
       more than one way (delveWays), which mana, never decided for the caster (CR 601.2g-h; X8b). Picks that are not cards it
       may exile are refused here, as they would be when it is paid. */
    if (action.kind === "cast" && action.delve === true && (!Array.isArray(action.delveExile) || (action.payWith === undefined && delveWays(state, player, action).length > 1))) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* A CAST THAT TAPS FOR ITSELF, more than one way (castTapPlans): which sources, asked before anything is tapped. */
    if (action.kind === "cast" && action.autoTap === true && action.tapPlan === undefined && castTapPlans(state, player, action, 2).length > 1) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* WATERBEND (CR 701.67a, 601.2h): which artifacts and creatures to tap, then -- the pool paying the rest more than one way --
       which mana; asked before anything is paid. */
    if (action.kind === "activate" && action.waterbend === true && (!Array.isArray(action.waterbendTap) || (action.payWith === undefined && abilityPayments(state, player, action).length > 1))) {
      state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};
      return [];
    }
    /* AN ABILITY'S COST PICKED ONCE IT IS TAKEN: the ten permanents of "sacrifice ten nonland permanents", the three counters
       of "remove three counters from among ..." -- asked before anything is paid or put on the stack (CR 602.2b, 601.2h). */
    if (action.kind === "activate" && ((action.sacrificeLater && !Array.isArray(action.sacrificeSet)) || (action.countersLater && !Array.isArray(action.counterSet)))) {
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
    /* From another zone, by a permission with a limit: spent (spendPermission). */
    const permission = state.objects[action.objectId].zone !== "hand" ? playPermission(state, player, action.objectId, "land", action.via ?? null) : null;
    spendPermission(state, permission, "land");
    /* CR 614.12: a land played enters the way any permanent does -- through the replacements that change how it
       enters, its own "This land enters tapped" first. Moving it straight there let a tapped land arrive untapped. */
    /* Under the control of the player who played it (CR 305.1, 110.2): a land of another player's, played from exile by a
       permission (Tinybones, Bauble Burglar), is theirs to control, not its owner's. */
    const arrived = moveOne(state, action.objectId, "battlefield", events, {controller: player});
    /* "If you do, it gains '...'" (Serra Paragon): the land played this way has the ability for as long as it is that
       permanent (CR 611.2a, 400.7), in layer 6 (CR 613.1f). */
    if (arrived !== null && state.objects[arrived]?.zone === "battlefield") grantPlayed(state, arrived, permission, player);
    return events;
  }

  if (action.kind === "activate-mana") {
    const events = [];
    const object = state.objects[action.objectId];
    const ability = abilitiesOf(state, action.objectId).find((candidate) => candidate.id === action.abilityId);
    /* Recomputed rather than trusted, like a cast's payment: which alternative, and what it costs, now. */
    const produced = manaAlternatives(state, player, ability, action.objectId)[action.produce ?? 0];
    const payment = manaAbilityPayment(state, player, ability);
    if (!produced || !payment || !withinLimit(state, action.objectId, ability) || !countersPayable(state, action.objectId, ability.counterCost) || !millPayable(state, player, ability))
      throw new Error(`${object.card} cannot add that mana now`);
    const pool = state.players[player].manaPool;
    spend(pool, payment.mana);
    const life = (ability.payLife ?? 0) + payment.life;
    /* Life paid is life lost (CR 119.4): said, and counted (batch 78). */
    if (life > 0) changeLife(state, player, -life, events);
    payCounters(state, action.objectId, ability.counterCost, player);
    /* "{T}, Mill a card: Add {C}" (Millikin): the top card milled as the cost is paid, before the mana is added -- a mill
       like any other, which "whenever a card is put into your graveyard" sees (CR 701.17, 605.3a). */
    if (ability.millCost) events.push(...mill(state, {who: [player], count: ability.millCost}, {controller: player, source: action.objectId}));
    if (ability.limit) recordUse(state, action.objectId, ability.id);
    if (ability.tapSelf) {
      object.tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.objectId), tapped: true}));
    }
    /* And the creature its cost taps, the one chosen with the offer (manaTappers): tapped, not "tapped for mana" (CR 106.12). */
    if (ability.tapCreature && action.costChoice?.tap !== undefined) {
      state.objects[action.costChoice.tap].tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.costChoice.tap), tapped: true}));
    }
    /* And the card of the graveyard its cost exiles, the one chosen with the offer (graveyardChoices), before the mana is
       added -- a cost, paid as the ability is activated (CR 605.3a). Its "when you do" is in `then` (immediateTrigger). */
    if (ability.exileFromGraveyard && action.costChoice?.exile !== undefined) moveOne(state, action.costChoice.exile, "exile", events, {owner: state.objects[action.costChoice.exile].owner});
    /* "Spend this mana only to cast a creature spell of the chosen type": beside the pool (rules/restricted-mana.mjs). */
    if (ability.spendOnly) addRestricted(state, player, produced, ability.spendOnly, action.objectId);
    else {
      /* "This mana can't be spent to cast spells from your hand" (Heartwood Crafter): in the pool, and remembered beside it. */
      addPoolMana(state, player, produced, ability.cantSpend, action.objectId);
      /* Its source as it is now, before a sacrifice of its cost (CR 106.3): "mana from a Treasure". */
      addProvenance(state, player, produced, action.objectId);
    }
    /* "When that mana is spent to cast ..." (Path of Ancestry, Study Hall): in the pool, its rider remembered beside it. */
    if (ability.whenSpent) addRider(state, player, produced, {...ability.whenSpent, ability: ability.id}, action.objectId);
    events.push(event("GameEventManaPool", state, {
      player: {playerId: player, name: state.players[player].name},
      produced: {...produced}, source: cardRef(state, action.objectId),
      /* "Tapped for mana" (CR 605.1b): what a "whenever ... is tapped for mana" ability watches. */
      ...(ability.tapSelf ? {tapped: true} : {}),
    }));
    /* Triggered mana abilities: at once, as part of this one -- "its controller adds an additional {G}". */
    for (const extra of manaTriggered(state, events[events.length - 1])) {
      addPoolMana(state, extra.player, extra.mana);
      events.push(event("GameEventManaPool", state, {player: {playerId: extra.player, name: state.players[extra.player].name}, produced: {...extra.mana}, source: cardRef(state, extra.source)}));
    }
    /* "This land deals 1 damage to you": part of the same mana ability, so it happens now, off the stack too. */
    if ((ability.then ?? []).length) {
      /* "Put a nest counter on this creature": bound to the source, and counted, as a resolution would (it has none). What it
         added (`produced`) is there too: "this creature becomes that color until end of turn" (Foraging Wickermaw). */
      const context = {controller: player, source: action.objectId, produced: {...produced}};
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
    /* Its terms, reckoned again (castTerms): the tax, a free cast, flashback, an alternative cost, escape, a permission. */
    const {tax, free, back, way, fled, permission, lifeCost} = castTerms(state, player, action);
    if (action.free && !free) throw new Error(`${object.card} cannot be cast without paying its mana cost now`);
    if (action.flashback && !back) throw new Error(`${object.card} cannot be cast with flashback now`);
    if (action.alternative !== undefined && !way) throw new Error(`${object.card} cannot be cast that way now`);
    if (action.escape !== undefined && !fled) throw new Error(`${object.card} cannot escape now`);
    const exiling = fled && !during ? escapeExiled(state, player, action, fled) : [];
    /* A graveyard alternative cost's other cards, as its caster picked them (othersPicked). */
    const othersExiling = way?.exileOthers && !during ? othersPicked(state, player, action, way) : [];
    /* A flashback cost's creatures, as its caster picked them. */
    const tapping = back?.tap && !during ? flashbackTapped(state, player, action, back.tap) : [];
    /* And the permanents it sacrifices (flashbackSacrificed). */
    const sacrificing = back?.sacrifice && !during ? flashbackSacrificed(state, player, action, back.sacrifice) : [];
    /* And "tap any number of untapped creatures you control", as its caster picked them (tapAnyPicked). */
    const tappedAny = action.tapAny === true && !during ? tapAnyPicked(state, player, action) : [];
    /* And what it beholds, as its caster picked it (beheldPicked). */
    const beholding = action.behold > 0 && !during ? beheldPicked(state, player, action) : [];
    /* And escalate's, as its caster picked them (CR 702.120a). */
    const escalating = action.escalateTap > 0 && !during ? escalateTapped(state, player, action) : [];
    /* Tapped for it (castTapPlans): the way picked, or the one there is -- each source's mana ability activated, as its
       caster would (CR 601.2g), before the cost is paid from the pool. */
    let tappedFor = null;
    if (action.autoTap === true && !during) {
      const ways = castTapPlans(state, player, action, TAP_CHOICES);
      const tapped = action.tapPlan !== undefined ? ways.find((w) => w.key === action.tapPlan) : ways.length === 1 ? ways[0] : null;
      if (!tapped) throw new Error(`${object.card} cannot be tapped for that way now`);
      const units = new Map(tapUnits(state, player, undefined, pooledTaps(state)).map((u) => [u.id, u]));
      for (const tap of tapped.taps) events.push(...perform(state, player, {kind: "activate-mana", objectId: tap.id, label: state.objects[tap.id].card, ...units.get(tap.id).via[tap.color]}));
      tappedFor = tapped.payment;
    }
    if (action.via !== undefined && !permission) throw new Error(`${object.card} cannot be cast that way now`);
    if (lifeCost !== null && lifeCost > state.players[player].life) throw new Error(`${object.card} costs ${lifeCost} life, and ${state.players[player].name} has ${state.players[player].life}`);
    const reckoned = castCost(state, player, action.objectId, tax, Boolean(free), lifeCost !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : null, action.extraMana ?? "", action.targets);
    const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permission);
    /* The life it owes besides (lifeOwed): for its targets as they are now chosen -- a counted one's too (Terror of the Peaks)
       -- and X life (Toxic Deluge). More than there is, and it is refused, saying so (CR 119.4). */
    const owedLife = lifeOwed(state, player, action);
    if (owedLife > 0 && (lifeCost ?? 0) + (back?.life ?? 0) + (way?.life ?? 0) + owedLife > state.players[player].life)
      throw new Error(`${object.card} costs ${owedLife} more life to cast this way, and ${state.players[player].name} has ${state.players[player].life}: choose other targets, or a smaller X`);
    /* Mana added beyond what was tapped for -- a Swamp's extra {B} beside Nirkana Revenant -- can leave the pool more than
       the cost, and more than one way to spend it: then what the sources were tapped for pays, and the rest stays in the
       pool (CR 106.4). */
    const covered = (pool, mana) => MANA_KEYS.every((k) => (pool[k] ?? 0) >= (mana[k] ?? 0));
    const spending = during ? null : poolFor(state, player, {spell: action.objectId});
    /* Convoked (CR 702.51a): the creatures picked, and what the pool pays besides -- refused before anything is tapped. */
    const convoke = action.convoke === true && !during ? convoked(state, player, action, {...cost, generic: cost.generic + x}) : null;
    /* Delved (CR 702.66a): the cards picked, and what the pool pays besides -- refused before anything is paid. */
    const delve = action.delve === true && !during ? delved(state, player, action) : null;
    /* The pool's one way to pay, or the way its caster chose (`payWith`, X8b) -- still a way now, or refused. */
    const fromPool = during ? {mana: {}, life: 0} : convoke ? convoke.payment : delve ? delve.payment
      : chosenPayment(spending, cost, {life: state.players[player].life - (back?.life ?? 0) - (way?.life ?? 0) - (lifeCost ?? 0) - owedLife, x: x + (action.x ?? 0) * cost.variable}, action.payWith);
    const payment = fromPool ?? (tappedFor && covered(spending, tappedFor.mana) ? tappedFor : null);
    if (!payment || (back && back.life > state.players[player].life) || (way && way.life > state.players[player].life)) throw new Error(`${object.card} cannot be paid for from this pool`);
    const card = cardRef(state, action.objectId);
    /* The rider mana chosen with the offer (`riders`), or with the way the pool pays it (`payRiders`, costChoice). */
    const paid = spendFor(state, player, {spell: action.objectId}, payment.mana, action.riders ?? action.payRiders ?? null);
    if (payment.life > 0) changeLife(state, player, -payment.life, events);
    if (back?.life) changeLife(state, player, -back.life, events);
    if (way?.life) changeLife(state, player, -way.life, events);
    /* Bolas's Citadel's life, paid rather than the mana cost (CR 118.9, 119.4): life paid is life lost. */
    if (lifeCost) changeLife(state, player, -lifeCost, events);
    /* And the life it owes besides: Terror of the Peaks' 3, Toxic Deluge's X (lifeOwed). */
    if (owedLife) changeLife(state, player, -owedLife, events);
    /* CR 903.8: the tax counts casts from the command zone, so it is recorded only here. */
    if (fromCommand) recordCommanderCast(state, player, action.objectId);
    /* "Once each turn" spent (Darksteel Monolith, As Foretold). */
    if (free?.limited) recordUse(state, free.source, `free:${free.abilityId}`);
    /* Cast by a permanent's permission (play-from): its limit spent, and what it says of the spell remembered for when it
       leaves the stack. Not a flashback cast, which is the card's own permission. */
    spendPermission(state, permission, "spell", action.asType);
    /* "If you cast a creature spell this way, it gains haste until end of turn" (Thundermane Dragon): remembered on the spell,
       given to the permanent it becomes (rules/stack.mjs) -- the permission it was cast through's. */
    const gains = object.zone === "library" ? [...(permission?.ability.gains ?? [])] : [];
    /* "If you do, it gains 'When this permanent is put into a graveyard from the battlefield, ...'" (Serra Paragon): the
       permanent it becomes has the ability (rules/stack.mjs). */
    const grants = structuredClone(permission?.ability.grants ?? []);
    /* Cast from suspend (CR 702.62a): a suspended card cast from exile, read before it moves. */
    const fromSuspend = object.suspended === true && object.zone === "exile";
    /* "Until this card is cast from exile" (Emrakul, the Exigent Doom; effects/permanents.mjs, effectUntil): over now. */
    if (object.zone === "exile" && (state.effects ?? []).some((e) => e.untilCast === action.objectId)) state.effects = state.effects.filter((e) => e.untilCast !== action.objectId);

    const permanent = !(object.types ?? []).some((type) => ["Instant", "Sorcery"].includes(type));
    const targets = structuredClone(action.targets ?? []);
    const targetDescription = targets.map((t) => targetName(state, t)).join(", ");
    /* The additional cost chosen, paid with the rest of the cost (CR 601.2h), its cards named before they move. */
    const extraPaid = [];
    /* Each card of a set ("discard two cards") its own. */
    for (const [kind, ids] of Object.entries(action.costChoice ?? {})) for (const id of [].concat(ids)) {
      if (!state.objects[id]) throw new Error("That additional cost can no longer be paid");
      extraPaid.push([kind, id]);
    }
    /* What this player has cast this turn, for "whenever an opponent casts their first noncreature spell each turn". */
    /* And whether it was cast for its warp cost: "if ... a spell was warped this turn" (CR 702.185c; void, script/condition.mjs). */
    (state.players[player].castThisTurn ??= []).push({types: [...(object.types ?? [])], colors: [...(object.colors ?? [])], ...(way?.paidFor === "warp" ? {warped: true} : {})});
    /* And this game, by name (CR 201.2): "if ... you've cast another spell named Approach of the Second Sun this game"
       (script/amount.mjs, spellsCastThisGame) -- the name it was cast with, an Adventure's or a face's (CR 715.3, 712.8).
       Never cleared. */
    const castNames = (state.players[player].castNames ??= {});
    castNames[object.card] = (castNames[object.card] ?? 0) + 1;
    /* A prepare spell's copy (CR 722.3c): the permanent it is the prepare spell of, read before it moves. */
    const preparedBy = object.zone === "exile" && object.prepareOf !== undefined ? object.prepareOf : undefined;
    const entry = pushSpell(state, action.objectId, {controller: player, permanent, targets, ...(action.x !== undefined ? {x: action.x} : {}), ...(Array.isArray(action.modes) ? {modes: action.modes} : {})});
    /* Cast, and that permanent loses the prepared designation as the spell becomes cast (CR 722.3c, 601.2i). */
    if (preparedBy !== undefined) unprepare(state, preparedBy, events, {keepCopy: true});
    /* How it was cast, for its own conditions (script/condition.mjs, `cast`): "if this spell was cast from a graveyard"
       (Sevinne's Reclamation), and Addendum's "if you cast this spell during your main phase" -- its caster's turn, a main
       phase (Unbreakable Formation). A copy is not cast (CR 707.10) and has none. */
    entry.cast = {from: castFrom, mainPhase: player === state.activePlayer && MAIN_PHASES.includes(state.phase),
      /* "If this spell's additional cost was paid" (Cinder Strike): an optional one, paid -- its mana too. */
      /* Escalate's cost too, paid for a mode beyond the first (CR 702.120a: an additional cost). */
      /* Not sneak's returned creature: part of an alternative cost (CR 702.190a, 118.9), no additional cost. */
      /* Not the permission's own (Exploration Broodship's land): that is no cost of this spell's to ask after. */
      ...((extraPaid.some(([kind]) => kind !== "returnToHand") && !(permission?.ability.additionalCost && !(object.spell?.additionalCost ?? []).length)) || action.extraMana || action.extraLife || action.escalate > 0 || (beholding.length && additionalAtom(object.spell?.additionalCost, "behold")) ? {additionalPaid: true} : {}),
      /* The creatures tapped to convoke it (CR 702.51c: they "convoked" it): "each creature that convoked this spell
         connives" (Lethal Scheme; script/bind.mjs, "convoked"). */
      ...((convoke?.ids ?? []).length ? {convoked: [...convoke.ids]} : {}),
      /* How many creatures its additional cost tapped: "three times the number of creatures tapped this way" (Burn at the
         Stake; script/amount.mjs, `tappedThisWay`). */
      ...(action.tapAny === true ? {tapped: tappedAny.length} : {}),
      /* Cast for its surge or freerunning cost (CR 702.117a, 702.173a): "if this spell's freerunning cost was paid"
         (script/condition.mjs, `paidFor`), and the permanent it becomes (rules/stack.mjs). */
      ...(way?.paidFor ? {paidFor: way.paidFor} : {}),
      /* The Phyrexian mana symbols of its cost paid with life, two life each (CR 107.4f): compleated reads it as the permanent
         enters (CR 702.150a; rules/replacement.mjs). */
      ...(payment.life > 0 ? {phyrexianLife: payment.life / 2} : {})};
    /* Kicked that many times (multikicker, CR 702.33c): the permanent it becomes knows it as it enters (rules/stack.mjs). */
    if (action.kicked) entry.kicked = action.kicked;
    /* Its gift promised (CR 702.174k), to the opponent chosen as it was cast: the spell's, a copy's (CR 707.10), and the
       permanent it becomes (rules/stack.mjs). */
    if (action.gift !== undefined) entry.gift = action.gift;
    /* Its offspring cost paid (CR 702.175a): the permanent it becomes knows it as it enters (rules/stack.mjs). */
    if (action.offspring === true) entry.offspring = true;
    /* Cast as an Adventure (CR 715.3): exiled as it resolves, and castable as itself from there (rules/stack.mjs, 715.3d). */
    if (action.adventure === true && object.face === "adventure") entry.adventure = true;
    /* Cast with flashback: exiled, whatever would move it, as it leaves the stack (rules/stack.mjs, effects/zones.mjs). */
    if (back) entry.flashback = true;
    /* Cast with escape, it escaped (CR 702.138b): the permanent it becomes is marked so (rules/stack.mjs). */
    if (fled) entry.escaped = true;
    /* Cast for its evoke cost (CR 702.74a): the permanent it becomes is marked so, for the evoke trigger's condition. */
    if (way?.evoke) entry.evoked = true;
    /* Cast for its impending cost (CR 702.176a): the permanent it becomes is marked so, and enters with that many time counters. */
    if (way?.impending) entry.impending = way.impending;
    /* Overloaded (CR 702.96b): the spell's effects as they then are, carried on the stack. */
    if (way?.overload) entry.overload = structuredClone(way.overload);
    /* Cast for its prowl cost (CR 702.76a): "if its prowl cost was paid" asks the permanent it becomes (rules/stack.mjs). */
    if (way?.prowl) entry.prowled = true;
    /* "And that spell can't be countered" (Cavern of Souls): paid with mana that said so. */
    if (paid.uncounterable) entry.uncounterable = true;
    /* "When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1" (Path of
       Ancestry; CR 106.6, 603.7): a delayed triggered ability of the mana ability's, its controller's, triggering now -- on
       the stack once the cast is done, above the spell (CR 603.3). About the spell as it now is, and which commander it is
       ("the number of times it's been cast from the command zone", Study Hall). */
    for (const rider of paid.triggered ?? []) {
      const spellObject = state.objects[entry.objectId];
      (state.pendingTriggers ??= []).push({abilityId: "mana-spent", text: rider.whenSpent.text, controller: player,
        source: {cardId: rider.source, name: state.objects[rider.source]?.card ?? null}, cause: null, optional: false,
        about: {card: entry.objectId, player, ...(spellObject?.commander === true ? {commanderKey: commanderKeyOf(spellObject)} : {})},
        script: {targets: [], effects: structuredClone(rider.whenSpent.effects)}});
    }
    /* "The next spell you cast this turn can't be countered" (Theorist's Proxy): an effect of its caster's, used up by the
       first spell they cast after it (effectUntil's `rule: "next-spell-uncounterable"`). */
    const next = (state.effects ?? []).findIndex((e) => e.rule === "next-spell-uncounterable" && e.sourceController === player);
    if (next >= 0) { entry.uncounterable = true; state.effects.splice(next, 1); }
    /* "If a spell cast this way would be put into your graveyard, exile it instead" (Kess): to exile, if to a graveyard. */
    if (permission?.ability.graveyardToExile || during?.graveyardToExile) entry.graveyardToExile = true;
    if (permission?.ability.graveyardToLibraryBottom) entry.graveyardToLibraryBottom = true;
    /* On the spell as it now is: moving to the stack made a new object (CR 400.7). */
    if (gains.length && state.objects[entry.objectId]) state.objects[entry.objectId].castGains = gains;
    if (grants.length && state.objects[entry.objectId]) state.objects[entry.objectId].castGrants = grants;
    /* Cast from suspend (CR 702.62a): a creature so cast has haste as long as its caster controls it (rules/stack.mjs). */
    if (fromSuspend) entry.fromSuspend = true;
    /* THE MANA SPENT TO CAST IT (CR 601.2h): "if {W}{W} was spent to cast it" (Wistfulness), "if at least three red mana was
       spent to cast this spell" (adamant) -- by color, on the spell as it now is, and on the permanent it becomes (rules/
       stack.mjs). What the pool paid, tax and all: a creature that convoked it paid no mana (CR 702.51a), and a spell cast
       without paying its mana cost spent none. A copy is not cast and has none (CR 707.10). */
    const spent = Object.fromEntries(Object.entries(payment.mana ?? {}).filter(([, n]) => n > 0));
    if (Object.keys(spent).length && state.objects[entry.objectId]) state.objects[entry.objectId].spent = spent;
    /* And the sources of that mana asked after, as each was as it made it (CR 106.3): "if mana from a Treasure was spent to
       cast it" (Smaug, Wicked Worm; script/condition.mjs, `spentFrom`). */
    if (paid.from.length && state.objects[entry.objectId]) state.objects[entry.objectId].spentFrom = paid.from;
    for (const [kind, id] of extraPaid) {
      /* SNEAK'S UNBLOCKED CREATURE (CR 702.190a), returned to its owner's hand -- and whom it was attacking, read before it
         leaves combat, for the permanent this spell becomes: tapped and attacking the same player or planeswalker (702.190b;
         rules/stack.mjs). */
      if (kind === "returnToHand") {
        const attack = (state.combat?.attacks ?? []).find((a) => a.attacker === id);
        if (way?.sneak && attack) entry.sneak = {player: attack.defender, ...(attack.planeswalker !== undefined ? {planeswalker: attack.planeswalker} : {})};
        moveOne(state, id, "hand", events);
        continue;
      }
      /* "Blight 1": its counters on the creature chosen, put as any counters are (CR 701.68a). */
      if (kind === "blight") {
        const count = additionalAtom(object.spell?.additionalCost, "blight")?.count ?? 1;
        events.push(...runEffects(state, [{effect: "putCounter", targets: [id], counter: "-1/-1", count}], {controller: player, source: entry.objectId}));
        continue;
      }
      /* A card exiled from the hand (Force of Will) goes to exile; a discard or a sacrifice to its owner's graveyard. */
      const paid = kind === "sacrifice" ? sacrificeOne(state, id, events) : moveOne(state, id, kind === "exile" ? "exile" : "graveyard", events, {owner: state.objects[id].owner});
      if (kind === "discard" && paid !== null) { events[events.length - 1].data.fields.discarded = true; recordDiscard(state, player); }
    }
    /* What it beheld from the hand, revealed to every player as the cost is paid (CR 701.4a, 701.20a); it stays in the hand. */
    for (const id of beholding) if (state.objects[id]?.zone === "hand") events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
    /* "Behold a Goblin and exile it" (Champion of the Weird; CR 701.4a, 601.2h): what was beheld -- revealed from the hand, or a
       permanent chosen -- exiled as the cost is paid, and kept against the spell for the permanent it becomes, whose ability
       names "the exiled card" (CR 607.2q; rules/stack.mjs carries it there). */
    if (beholding.length && additionalAtom(object.spell?.additionalCost, "behold")?.exile === true) {
      const exiled = beholding.filter((id) => state.objects[id]).map((id) => moveOne(state, id, "exile", events, {owner: state.objects[id].owner}))
        .filter((id) => id !== null && state.objects[id]?.zone === "exile");
      for (const id of exiled) state.objects[id].exiledTurn = state.turn;
      if (exiled.length) (state.links ??= {})[entry.objectId] = [...(state.links[entry.objectId] ?? []), ...exiled];
    }
    /* Escape's other cards, and a graveyard alternative cost's, and delve's, exiled as the rest of the cost is paid (CR 601.2h). */
    for (const id of [...exiling, ...othersExiling, ...(delve?.ids ?? [])]) if (state.objects[id]) moveOne(state, id, "exile", events, {owner: state.objects[id].owner});
    /* And a flashback cost's creatures, tapped; and a convoke's (CR 702.51c: they convoked it), for no mana; and the creatures
       an additional cost or escalate taps. */
    for (const id of [...tapping, ...escalating, ...(convoke?.ids ?? []), ...tappedAny]) {
      state.objects[id].tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: true}));
    }
    /* And a flashback cost's sacrifices, with the rest of the cost (CR 601.2h): "whenever you sacrifice" sees each. */
    for (const id of sacrificing) if (state.objects[id]?.zone === "battlefield") sacrificeOne(state, id, events);
    /* What it is aimed at becomes its target (ward, CR 702.21a); and aimed at an opponent or what is theirs, a crime (CR 700.13). */
    events.push(...becameTarget(state, entry), ...crimeCommitted(state, entry));
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
    /* REPLICATE (CR 702.56a): "when you cast this spell, if a replicate cost was paid for it, copy it for each time its
       replicate cost was paid. If the spell has any targets, you may choose new targets for any of the copies" -- a triggered
       ability of the spell, waiting with the rest, as storm's; none when it was not paid (CR 603.4). */
    if (action.replicated > 0) {
      (state.pendingTriggers ??= []).push({abilityId: "replicate", text: `Replicate: copy ${object.card} for each time its replicate cost was paid.`, controller: player,
        source: {cardId: entry.objectId, name: object.card}, cause: null, optional: false,
        about: {card: entry.objectId, player, stackId: entry.stackId},
        script: {targets: [], effects: [{effect: "copySpell", spells: "that card", count: action.replicated, newTargets: true}]}});
    }
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: true, abilityId: entry.abilityId, stackId: entry.stackId},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription, castFrom,
    }));
    events.push(event("GameEventCardChangeZone", state, {
      card,
      /* Cast from a graveyard, the card as it was there (Syr Konrad, the Grim; effects/zones.mjs says why). */
      ...(castFrom === "graveyard" ? {wasCard: {types: [...(object.types ?? [])], subtypes: [...(object.subtypes ?? [])], supertypes: [...(object.supertypes ?? [])]}} : {}),
      from: {zoneType: {command: "Command", hand: "Hand", graveyard: "Graveyard", exile: "Exile", library: "Library"}[action.from ?? object.zone] ?? "Hand", player: {playerId: player}},
      to: {zoneType: "Stack", player: {playerId: player}},
    }));
    return events;
  }

  if (action.kind === "activate") {
    const events = [];
    const object = state.objects[action.objectId];
    /* With its permanent's choice, as it was offered: the stack entry's targets are the chosen type's. */
    const ability = chosenFor(abilitiesOf(state, action.objectId).find((candidate) => candidate.id === action.abilityId), object);
    /* Recomputed, as a cast's payment is: the pool may have moved since the offer. */
    /* With the way its player chose (`payWith`, X8b), when the pool pays it more than one way. */
    const payment = costPayment(state, player, action.objectId, ability.cost, action.x ?? 0, abilityLess(state, player, action.objectId, ability, action.targets), action.payWith, bentFor(action));
    if (!payment || payment.payWays || !withinLimit(state, action.objectId, ability)) throw new Error(`${object.card}'s ability cannot be paid for now`);
    /* The artifacts and creatures its waterbend cost taps, as its player picked them (waterbendPicked). */
    const bent = action.waterbend === true ? waterbendPicked(state, player, action) : [];
    /* The permanents and counters picked once it was taken, checked before anything moves. */
    if (action.sacrificeLater) {
      const n = sacrificeAtom(ability.cost)?.count ?? 1, able = sacrificeChoices(state, player, action.objectId, sacrificeAtom(ability.cost)?.selector);
      const set = action.sacrificeSet ?? [];
      if (set.length !== n || new Set(set).size !== n || !set.every((s) => able.includes(s))) throw new Error(`Choose ${inWords(n)} permanents ${object.card}'s cost can sacrifice`);
    }
    if (action.countersLater && !countersPicked(state, player, action.objectId, countersAmongAtom(ability.cost), action.counterSet))
      throw new Error(`Choose ${inWords(countersAmongAtom(ability.cost)?.count ?? 0)} counters there are to remove for ${object.card}'s cost`);
    /* A source the cost sacrifices or exiles is read as it last was ("a 2/2 Spider for each counter on this creature"). */
    const leavesSelf = (ability.cost ?? []).some((a) => ["sacrifice", "exile"].includes(a.atom) && a.self === true);
    const card = cardRef(state, action.objectId);
    const targets = structuredClone(action.targets ?? []);
    const targetDescription = targets.map((t) => targetName(state, t)).join(", ");
    /* Whom an attacker the cost returns was attacking: "tapped and attacking" (ninjutsu) attacks the same player, or the same
       planeswalker (CR 702.49c). */
    const returning = action.costChoice?.returnToHand;
    const was = returning !== undefined ? (state.combat?.attacks ?? []).find((attack) => attack.attacker === returning) : undefined;
    const attacked = was?.defender;
    /* CR 602.2a, then 602.2b and 601.2h: on the stack first, then the costs. */
    /* Its modes, chosen as it was activated: their targets in order, their effects aimed at them (CR 700.2). */
    const script = ability.modal && Array.isArray(action.modes) ? {...ability, ...modalScript(ability.modal, action.modes)} : ability;
    const entry = pushAbility(state, {sourceId: action.objectId, controller: player, abilityId: ability.id, kind: "ability", targets, script,
      ...(attacked !== undefined ? {about: {player: attacked, ...(was.planeswalker !== undefined ? {planeswalker: was.planeswalker} : {})}} : {}),
      /* Station: "charge counters equal to the tapped creature's power" -- the creature it tapped is what it is about. */
      ...(action.costChoice?.tap !== undefined ? {about: {card: action.costChoice.tap}} : {}),
      ...(action.x !== undefined ? {x: action.x} : {}), ...(leavesSelf && object.zone === "battlefield" ? {lastKnown: lastKnown(state, action.objectId)} : {})});
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: false, abilityId: entry.abilityId, stackId: entry.stackId, description: ability.text,
        /* A loyalty ability says its cost (CR 606.4): "whenever you activate a loyalty ability" (rules/trigger.mjs). */
        ...(ability.loyalty !== undefined ? {loyalty: ability.loyalty === "-X" ? -(action.x ?? 0) : ability.loyalty} : {})},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription,
    }));
    events.push(...becameTarget(state, entry), ...crimeCommitted(state, entry));
    /* The mana, once: its own atom's, or what an increase added to a cost that printed none (costPayment). */
    const payMana = () => {
      spendFor(state, player, {ability: action.objectId}, payment.mana.mana, action.riders ?? null);
      if (payment.mana.life > 0) changeLife(state, player, -payment.mana.life, events);
    };
    if (payment.mana && !(ability.cost ?? []).some((a) => a.atom === "mana" || a.atom === "waterbend")) payMana();
    for (const atom of ability.cost ?? []) {
      if (atom.atom === "{T}") {
        object.tapped = true;
        events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.objectId), tapped: true}));
      }
      if (atom.atom === "mana") payMana();
      /* Waterbend (CR 701.67a): the pool's part, and each permanent picked tapped -- a cost paid, not tapped for mana. */
      if (atom.atom === "waterbend") {
        payMana();
        for (const id of bent) {
          state.objects[id].tapped = true;
          events.push(event("GameEventCardTapped", state, {card: cardRef(state, id), tapped: true}));
        }
      }
      /* Life paid is life lost (CR 119.4), counted as it is paid (War Room). */
      if (atom.atom === "payLife") changeLife(state, player, -amountOf(state, atom.amount ?? 0, {controller: player, source: action.objectId}), events);
      if (atom.atom === "addCounters" || atom.atom === "removeCounters")
        payCounters(state, action.objectId, [{counter: atom.counter, count: atom.count === "X" ? action.x ?? 0 : atom.count ?? 1, put: atom.atom === "addCounters"}], player);
      /* "Return a Forest you control to its owner's hand": the one chosen with the offer. */
      if (atom.atom === "returnToHand" && action.costChoice?.returnToHand !== undefined) moveOne(state, action.costChoice.returnToHand, "hand", events);
      /* "Discard a card": the one chosen with the offer, a discard -- "whenever you discard a card" sees it. */
      /* Each card of "discard two cards" a discard of its own. */
      if (atom.atom === "discard" && atom.self !== true && action.costChoice?.discard !== undefined)
        for (const card of [].concat(action.costChoice.discard))
          if (moveOne(state, card, "graveyard", events, {owner: state.objects[card].owner}) !== null) { events[events.length - 1].data.fields.discarded = true; recordDiscard(state, player); }
      /* CR 701.21a: to sacrifice is to move a permanent you control to its owner's graveyard -- through the
         replacements and with its last known information, like any death, so "when this dies" still sees it. */
      if (atom.atom === "sacrifice" && atom.self === true) sacrificeOne(state, action.objectId, events);
      /* "Exile this creature": it leaves for exile, read afterward as it last was. */
      if (atom.atom === "exile" && atom.self === true) {
        const fromHand = object.zone === "hand", exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});
        /* "Exile this card from your hand" (Emrakul, the Exigent Doom): "this card" is then that card in exile (CR 400.7). */
        if (fromHand && exiled !== null) entry.about = {...(entry.about ?? {}), card: exiled};
      }
      /* "Blight 1": the counters on the creature chosen with the offer, put as any counters are (CR 701.68a). */
      if (atom.atom === "blight" && action.costChoice?.blight !== undefined) {
        if (state.objects[action.costChoice.blight]?.zone !== "battlefield") throw new Error("That creature can no longer be blighted");
        events.push(...runEffects(state, [{effect: "putCounter", targets: [action.costChoice.blight], counter: "-1/-1", count: atom.count ?? 1}], {controller: player, source: action.objectId}));
      }
      /* "Remove a counter": one of the kind chosen with the offer. */
      if (atom.atom === "removeAnyCounter" && action.costChoice?.counter !== undefined) payCounters(state, action.objectId, [{counter: action.costChoice.counter, count: 1, put: false}]);
      /* Exiling it from the graveyard is the cost of encore (CR 702.141a), paid after the ability is on the stack: "this card"
         is then that card in exile (CR 400.7), what the ability is about. */
      if (atom.atom === "exileFromGraveyard" && atom.self === true) {
        const exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});
        if (exiled !== null) entry.about = {...(entry.about ?? {}), card: exiled};
      }
      /* "Exile a creature card from your graveyard": the one chosen with the offer, paid after the ability is on the stack. */
      if (atom.atom === "exileFromGraveyard" && atom.self !== true && action.costChoice?.exile !== undefined)
        moveOne(state, action.costChoice.exile, "exile", events, {owner: state.objects[action.costChoice.exile].owner});
      /* Discarding it is the cost of cycling: paid after the ability is on the stack (CR 602.2b, 601.2h), a discard. A cycling
         ability's discard is the card being cycled (CR 702.29c), with the X paid for it ("create an X/X Shark"). */
      if (atom.atom === "discard" && atom.self === true && moveOne(state, action.objectId, "graveyard", events, {owner: object.owner}) !== null) {
        const fields = events[events.length - 1].data.fields;
        fields.discarded = true;
        recordDiscard(state, player);
        if (ability.cycling === true) Object.assign(fields, {cycled: true}, action.x !== undefined ? {cycledX: action.x} : {});
      }
      /* Each permanent of the set chosen, sacrificed (CR 701.21a) -- with the offer, or picked once it was taken. "Draw cards
         equal to the sacrificed creature's toughness" (Felothar the Steadfast): each as it last existed, kept on the ability
         for its effects (`sacrificed`; script/amount.mjs, CR 608.2h). */
      if (atom.atom === "sacrifice" && atom.selector && action.costChoice?.sacrifice !== undefined)
        for (const fodder of [].concat(action.costChoice.sacrifice)) {
          const was = lastKnown(state, fodder);
          /* And its mana value (CR 202.3; a transformed permanent's, its front face's): "the sacrificed enchantment's mana value". */
          const cost = valueCostOf(state.objects[fodder]);
          sacrificeOne(state, fodder, events);
          if (was) (entry.sacrificed ??= []).push({...was, manaValue: cost ? manaValue(parseManaCost(cost)) : 0});
        }
      if (atom.atom === "sacrifice" && atom.selector && Array.isArray(action.sacrificeSet))
        for (const fodder of action.sacrificeSet) if (state.objects[fodder]) sacrificeOne(state, fodder, events);
      /* "Pay eight {E}": that many energy counters removed from the player (CR 107.14) -- as many as they have, or it was not
         offered (costPayment). The board shows a player's counters. */
      if (atom.atom === "payEnergy") state.players[player].counters.energy -= atom.count;
      /* "Unattach this Equipment" (Sunforger; CR 701.3d): off what it was attached to, and still on the battlefield. */
      if (atom.atom === "unattach") {
        const host = state.objects[object.attachedTo];
        if (host) host.attachments = (host.attachments ?? []).filter((a) => a !== action.objectId);
        object.attachedTo = null;
        events.push(event("GameEventCardAttachment", state, {card: cardRef(state, action.objectId), attachedTo: null}));
      }
      /* Three counters from among them, each removed from the permanent it was picked on. */
      if (atom.atom === "removeCountersAmong") for (const {id, counter} of action.counterSet ?? [])
        state.objects[id].counters[counter] = Math.max(0, (state.objects[id].counters[counter] ?? 0) - 1);
      /* Crew: the creatures chosen, tapped (CR 702.122a). */
      /* Station: the creature chosen, tapped. */
      /* And "tap three untapped creatures you control": each of the set chosen. */
      if (atom.atom === "tapCreature") for (const tapped of action.costChoice?.tapAll ?? [action.costChoice?.tap]) {
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
    /* And by its player, whatever becomes of the permanent (CR 400.7): "if you've activated a loyalty ability this turn"
       (Kiora of Salt and Sand; script/condition.mjs, `loyaltyThisTurn`). */
    if (ability.loyalty !== undefined) state.players[player].loyaltyThisTurn = (state.players[player].loyaltyThisTurn ?? 0) + 1;
    return events;
  }

  /* SUSPENDED (CR 702.62a): its cost paid from the pool, the way its player chose when there was more than one, and the card
     exiled with its time counters -- suspended there (702.62b). A special action: nothing goes on the stack, and its player
     receives priority afterward (CR 116.3). */
  if (action.kind === "suspend") {
    const events = [];
    const object = state.objects[action.objectId];
    const suspend = suspendOf(object);
    const payment = chosenPayment(state.players[player].manaPool, suspendCost(suspend), {life: state.players[player].life}, action.payWith);
    if (!payment) throw new Error(`${object.card} cannot be suspended with that mana now: choose one of the ways your pool pays its suspend cost`);
    spend(state.players[player].manaPool, payment.mana);
    if (payment.life > 0) changeLife(state, player, -payment.life, events);
    const exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});
    if (exiled !== null && state.objects[exiled]?.zone === "exile") {
      state.objects[exiled].counters.time = (state.objects[exiled].counters.time ?? 0) + suspend.count;
      state.objects[exiled].suspended = true;
    }
    return events;
  }

  /* TURNED FACE UP (CR 701.40b): the card shown to every player -- a creature card, and its mana cost -- that cost paid,
     and the permanent turned face up (state/index.mjs, turnFaceUp). A special action: nothing goes on the stack, and its
     player receives priority afterward (CR 116.3; applyAction). */
  if (action.kind === "turn-face-up") {
    const events = [];
    /* Recomputed, as a cast's payment is: what pays it, now. */
    const payment = faceUpCost(state, player, action.objectId, action.disguise === true);
    spend(state.players[player].manaPool, payment.mana);
    if (payment.life > 0) changeLife(state, player, -payment.life, events);
    turnFaceUp(state, action.objectId);
    events.push(event("GameEventCardTurnedFaceUp", state, {card: cardRef(state, action.objectId), player: {playerId: player, name: state.players[player].name}}));
    return events;
  }

  /* Unreachable: an action kind that passed the offered check but has no branch would be a kind
     this module enumerates and cannot perform. Loud, per principle 6. */
  throw new Error(`The engine offered ${action.kind} and cannot perform it`);
}
