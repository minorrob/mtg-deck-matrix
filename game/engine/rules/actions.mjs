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

import {cardsIn, moveObject, usesThisTurn, recordUse} from "../state/index.mjs";
import {pushSpell, pushAbility, becameTarget} from "./stack.mjs";
import {addMana, spend, parseManaCost, automaticPayment, manaValue, poolSize} from "./mana.mjs";
import {commanderTax, recordCommanderCast, colorIdentity} from "./commander.mjs";
import {COLORS} from "./mana.mjs";
import {summoningSick, hasFlash} from "../keywords/timing.mjs";
import {targetChoices, targetName, isHostile, modalScript} from "../script/bind.mjs";
import {moveOne, sacrificeOne} from "../script/effects/zones.mjs";
import {compileSelector, matchesSelector, selectMatching} from "../script/filter.mjs";
import {runEffects} from "../script/effects/index.mjs";
import {checkStateBasedActions, gameOver} from "./sba.mjs";
import {costReduction, costIncrease, playerStatics, freeCast, flashGranted} from "./statics.mjs";
import {countMana, amountOf, countEffect} from "../script/amount.mjs";
import {bindEffect} from "../script/bind.mjs";
import {conditionHolds} from "../script/condition.mjs";
import {lastKnown, characteristicsOf} from "./layers.mjs";
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
 * Past in Flames) -- its mana cost. Only an instant or sorcery, and only from the caster's own graveyard.
 *
 * @returns {?{mana: string, life: number}}
 */
export function flashbackCost(state, player, id) {
  const object = state.objects[id];
  if (!object || object.zone !== "graveyard" || object.owner !== player) return null;
  if (!(object.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) return null;
  const own = (object.abilities ?? []).find((a) => a.kind === "static" && a.rule === "flashback");
  const given = (state.effects ?? []).some((e) => e.rule === "flashback" && (e.affects?.ids ?? []).includes(id));
  const cost = own?.cost ?? (given ? [{atom: "mana", cost: object.manaCost ?? ""}] : null);
  if (!cost) return null;
  return {mana: cost.find((a) => a.atom === "mana")?.cost ?? "", life: cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0)};
}

/**
 * ALTERNATIVE COSTS (CR 118.9): the card's own "rather than pay this spell's mana cost" statics whose condition holds now
 * for this player -- each as `{index, mana, life, extra}`: the mana paid instead ("" for none), the life, and the atoms
 * chosen as it is cast (a card exiled from the hand, a permanent sacrificed).
 */
export function alternativeCosts(state, player, id) {
  const object = state.objects[id];
  return (object?.abilities ?? []).flatMap((ability, index) => {
    if (ability.kind !== "static" || ability.rule !== "alternative-cost") return [];
    if (!conditionHolds(state, ability.condition, {controller: player, source: id})) return [];
    const cost = ability.cost ?? [];
    return [{index, mana: cost.find((a) => a.atom === "mana")?.cost ?? "", life: cost.filter((a) => a.atom === "payLife").reduce((n, a) => n + (a.amount ?? 0), 0),
      extra: cost.filter((a) => a.atom === "exileFromHand" || a.atom === "sacrifice")}];
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
  const most = Math.min(modal.modes.length, modal.more && conditionHolds(state, modal.more.condition, context) ? modal.more.choose : least);
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
  || (["addCounters", "removeCounters"].includes(atom?.atom) && atom.self === true && typeof atom.counter === "string");

/* Whether an ability is within its limit this turn ("activate only once each turn", CR 602.5b). */
const withinLimit = (state, id, ability) => !ability.limit || usesThisTurn(state, id, ability.id) < ability.limit;
/* Whether a mana ability's counters can be paid: every removal has the counters to remove. */
const countersPayable = (state, id, costs) => (costs ?? []).every((c) => c.put || (state.objects[id].counters?.[c.counter] ?? 0) >= c.count);
function payCounters(state, id, costs) {
  const counters = state.objects[id].counters;
  for (const c of costs ?? []) counters[c.counter] = Math.max(0, (counters[c.counter] ?? 0) + (c.put ? c.count : -c.count));
}

/* "Sacrifice a creature: ..." (Viscera Seer, Ashnod's Altar, Phyrexian Tower): a cost the player chooses as they activate
   (CR 602.2b, 601.2h), so each permanent they could sacrifice is its own offer, as with a spell's additional cost. Only
   their own (CR 701.21a); "another" leaves out the source itself. */
function sacrificeChoices(state, player, sourceId, selector) {
  const matches = (Array.isArray(selector?.anyOf) ? selector.anyOf : [selector ?? {}])
    .map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
  return state.zones.battlefield.filter((id) => matches.some((m) => m(state, id, {controller: player, source: sourceId})));
}
const sacrificeAtom = (cost) => (cost ?? []).find((a) => a?.atom === "sacrifice" && a.selector);
const returnAtom = (cost) => (cost ?? []).find((a) => a?.atom === "returnToHand" && a.selector);
const discardAtom = (cost) => (cost ?? []).find((a) => a?.atom === "discard" && a.self !== true);

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
      mana = automaticPayment(state.players[player].manaPool, printed, {life: state.players[player].life, x: x * printed.variable});
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
export function manaAlternatives(state, player, ability, source = null) {
  const context = {controller: player, source};
  const count = amountOf(state, ability.count ?? 1, context);
  if (Array.isArray(ability.produces)) return ability.produces.map((m) => countMana(state, {...m}, context));
  if (ability.produces) return [countMana(state, {...ability.produces}, context)];
  if (ability.anyColor === true) return COLORS.map((color) => ({[color]: count}));
  if (ability.anyColor === "identity") return commanderIdentity(state, player).map((color) => ({[color]: count}));
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

/* The values X may take for a cost with {X} (CR 107.3): nothing up to what the pool holds past the rest of the cost,
   each X symbol taking X (CR 107.3a). A cost without X: the one null. `extra` is generic already owed (the tax). */
function xValues(pool, cost, extra = 0) {
  if (!cost.variable) return [null];
  const rest = cost.symbols.filter((s) => s.kind !== "variable" && s.kind !== "generic").length + cost.generic + extra;
  const most = Math.floor((poolSize(pool) - rest) / cost.variable);
  return most < 0 ? [] : Array.from({length: most + 1}, (_, i) => i);
}
const abilityLess = (state, player, id, ability) => (ability.costLess === undefined ? 0 : amountOf(state, ability.costLess, {controller: player, source: id}));
function abilityXValues(state, player, ability) {
  const atom = (ability.cost ?? []).find((a) => a?.atom === "mana");
  return atom ? xValues(state.players[player].manaPool, parseManaCost(atom.cost)) : [null];
}

/** How many lands this player may still play this turn. CR 305.2; effects raise the allowance. */
const landDropsLeft = (state, player) => (state.players[player].landAllowance ?? 1) + playerStatics(state, "extra-land-drop", player).length - state.players[player].landsPlayed;

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
  return found;
}

/**
 * Every action the given player may legally take at this instant.
 *
 * A player who does not hold priority gets an empty list — not a list containing "pass", because
 * they cannot pass either. An empty list is the honest answer to "what may you do", and a caller
 * that treats it as "nothing to do" is right.
 */
export function legalActions(state, player) {
  if (state.priorityPlayer !== player) return [];

  const actions = [{kind: "pass"}];

  /* CR 116.2a and 305.1. All four conditions, each of which is a real way to be wrong. */
  if (player === state.activePlayer
      && MAIN_PHASES.includes(state.phase)
      && state.stack.length === 0
      && landDropsLeft(state, player) > 0) {
    for (const id of cardsIn(state, "hand", player)) {
      if (!isLand(state.objects[id])) continue;
      actions.push({kind: "play-land", objectId: id, label: state.objects[id].card});
    }
    /* From the graveyard, or the top of the library, when a permanent says so: the same land drop (CR 305.2). */
    for (const id of playableElsewhere(state, player, "land")) actions.push({kind: "play-land", objectId: id, label: state.objects[id].card, from: state.objects[id].zone});
  }

  /* CR 605.3a: any time you have priority, whatever the step. */
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (object.controller !== player) continue;
    for (const ability of object.abilities ?? []) {
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
  ];
  for (const {id, from, flashback} of castable) {
    const object = state.objects[id];
    if (!object.manaCost) continue;
    if (sorcerySpeed(object) && !hasFlash(state, id) && !flashGranted(state, player, id) && !(player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0))
      continue;
    const tax = from === "command" ? commanderTax(state, player, id) : 0;
    /* "Without paying its mana cost": offered alone when it may be used every time; beside the paid cast when it is "once
       each turn", so the player decides which spell spends it. */
    const free = flashback ? null : freeCast(state, player, id);
    /* Its own alternative costs (CR 118.9), each an offer of its own -- never with flashback or a free cast (118.9a). */
    const alternatives = flashback ? [] : alternativeCosts(state, player, id);
    /* The flashback cost instead of the mana cost, and its life: a player can pay life only if their total is at least
       that much (CR 119.4). */
    const back = flashback ? flashbackCost(state, player, id) : null;
    if (back && back.life > state.players[player].life) continue;
    for (const way of [null, ...alternatives]) {
    if (way && way.life > state.players[player].life) continue;
    for (const freely of way ? [false] : free ? (free.limited ? [false, true] : [true]) : [false]) {
    const {cost, x} = castCost(state, player, id, tax, freely, back ? back.mana : way ? way.mana : null);
    /* {X} (CR 107.3, 601.2b): one offer per value the pool can pay, from nothing up; a spell without X, one. */
    for (const X of xValues(state.players[player].manaPool, cost, x)) {
      const payment = automaticPayment(state.players[player].manaPool, cost, {life: state.players[player].life - (back?.life ?? 0) - (way?.life ?? 0), x: x + (X ?? 0) * cost.variable});
      if (!payment) continue;
      const extra = [...(object.spell?.additionalCost ?? []), ...(way?.extra ?? [])];
      const paysFor = extra.length ? additionalChoices(state, player, id, extra) : [null];
      for (const costChoice of paysFor) {
        const base = {kind: "cast", objectId: id, label: object.card, payment, from, tax, ...(X !== null ? {x: X} : {}), ...(costChoice ? {costChoice, costNames: Object.values(costChoice).map((c) => state.objects[c].card)} : {}),
          ...(freely ? {free: true} : {}), ...(back ? {flashback: true} : {}), ...(way ? {alternative: way.index} : {})};
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
    for (const ability of object.abilities ?? []) {
      if (ability.kind !== "activated") continue;
      if (ability.timing === "sorcery" && !sorceryTime) continue;
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      if (!withinLimit(state, id, ability)) continue;
      for (const X of abilityXValues(state, player, ability)) {
        const payment = costPayment(state, player, id, ability.cost, X ?? 0, abilityLess(state, player, id, ability));
        if (!payment) continue;
        const atom = sacrificeAtom(ability.cost), back = returnAtom(ability.cost), toss = discardAtom(ability.cost);
        /* A permanent you control to sacrifice, or to return to its owner's hand, or a card in your hand to discard: one
           offer each (CR 602.2b). No card to discard, and the ability can't be activated. */
        const fodder = atom ? sacrificeChoices(state, player, id, atom.selector).map((s) => ({sacrifice: s}))
          : back ? sacrificeChoices(state, player, id, back.selector).map((r) => ({returnToHand: r}))
          : toss ? cardsIn(state, "hand", player).filter((c) => c !== id).map((d) => ({discard: d})) : [null];
        for (const costChoice of fodder)
          actions.push(...withTargets(state, {kind: "activate", objectId: id, abilityId: ability.id, label: object.card, text: ability.text, payment, ...(X !== null ? {x: X} : {}),
            ...(costChoice ? {costChoice, costNames: [state.objects[costChoice.sacrifice ?? costChoice.returnToHand ?? costChoice.discard].card]} : {})}, ability, {controller: player, source: id}));
      }
    }
  }

  /* CR 702.29a and its kin: an ability a card has in its owner's hand -- cycling, "{2}, discard this card: draw a card"
     -- whenever that player has priority, unless it says sorcery speed. */
  for (const id of cardsIn(state, "hand", player)) {
    const object = state.objects[id];
    for (const ability of object.abilities ?? []) {
      if (ability.kind !== "activated" || ability.zone !== "hand") continue;
      if (ability.timing === "sorcery" && !sorceryTime) continue;
      if (!conditionHolds(state, ability.condition, {controller: player, source: id})) continue;
      const payment = costPayment(state, player, id, ability.cost, 0, abilityLess(state, player, id, ability));
      if (!payment) continue;
      actions.push(...withTargets(state, {kind: "activate", objectId: id, abilityId: ability.id, label: object.card, text: ability.text, payment},
        ability, {controller: player, source: id}));
    }
  }

  return actions;
}

const sorcerySpeed = (object) => (object.types ?? []).some((type) => SORCERY_SPEED.includes(type));

/**
 * NOTHING TO DO (docs/plan-to-done-2026-09-30.md, item 11): the player holds priority, the stack is empty, and there
 * is no action but to pass. A mana ability counts only while there is something the mana could be for -- a spell
 * castable now, at its speed, with the pool and every untapped source together. That is a count, not a payment:
 * colors are not matched, so a doubtful case is asked rather than passed for the player.
 */
export function nothingToDo(state, player, actions = legalActions(state, player)) {
  if (state.priorityPlayer !== player || state.stack.length) return false;
  if (actions.some((a) => a.kind !== "pass" && a.kind !== "activate-mana")) return false;
  /* Each source counted once, at the most it can add net of what it costs -- a Sol Ring is two, a Signet one, and a
     dual land one however many colors it offers. */
  const best = new Map();
  for (const a of actions.filter((x) => x.kind === "activate-mana")) {
    const ability = (state.objects[a.objectId].abilities ?? []).find((x) => x.id === a.abilityId);
    const net = total(a.mana) - (ability?.cost ? manaValue(parseManaCost(ability.cost)) : 0);
    best.set(a.objectId, Math.max(best.get(a.objectId) ?? 0, net));
  }
  if (!best.size) return true;
  const mana = poolSize(state.players[player].manaPool) + [...best.values()].reduce((n, v) => n + Math.max(0, v), 0);
  const mainNow = player === state.activePlayer && MAIN_PHASES.includes(state.phase);
  /* And what a permanent lets them cast from another zone (the top of the library, say). */
  const spells = [...cardsIn(state, "hand", player), ...cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true), ...playableElsewhere(state, player, "spell")];
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
const targetKey = (action) => (action.targets ?? []).map((t) => `${t?.kind}:${t?.id}`).join(",")
  + "|" + Object.entries(action.costChoice ?? {}).map(([k, v]) => `${k}:${v}`).join(",");
const sameAction = (a, b) => a.kind === b.kind
  && (a.objectId ?? null) === (b.objectId ?? null)
  && (a.abilityId ?? null) === (b.abilityId ?? null)
  && (a.produce ?? null) === (b.produce ?? null)
  && (a.x ?? null) === (b.x ?? null)
  /* A cast with flashback is another action than the same card cast another way: it is exiled after (CR 702.34a). */
  && (a.flashback === true) === (b.flashback === true)
  /* An alternative cost (CR 118.9) is another action than paying the mana cost. */
  && (a.alternative ?? null) === (b.alternative ?? null)
  /* And the modes chosen as it is cast (CR 700.2): another choice is another action. */
  && JSON.stringify(a.modes ?? null) === JSON.stringify(b.modes ?? null)
  && targetKey(a) === targetKey(b);

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

function perform(state, player, action) {
  if (state.priorityPlayer !== player)
    throw new Error("That player does not hold priority");
  const offered = legalActions(state, player);
  if (!action || !offered.some((candidate) => sameAction(candidate, action)))
    throw new Error(`That is not a legal action here: ${JSON.stringify(action?.kind ?? action)}`);

  /* Passing is the priority module's business, because what a full round of passes means depends on
     the stack. The caller routes it there; this refusal is so that nobody routes it here and gets a
     silent no-op instead. */
  if (action.kind === "pass")
    throw new Error("Pass through passPriority, which is what decides whether a round ends a step or resolves an object");

  if (action.kind === "play-land") {
    const events = [];
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
    const ability = (object.abilities ?? []).find((candidate) => candidate.id === action.abilityId);
    /* Recomputed rather than trusted, like a cast's payment: which alternative, and what it costs, now. */
    const produced = manaAlternatives(state, player, ability, action.objectId)[action.produce ?? 0];
    const payment = manaAbilityPayment(state, player, ability);
    if (!produced || !payment || !withinLimit(state, action.objectId, ability) || !countersPayable(state, action.objectId, ability.counterCost))
      throw new Error(`${object.card} cannot add that mana now`);
    const pool = state.players[player].manaPool;
    spend(pool, payment.mana);
    const life = (ability.payLife ?? 0) + payment.life;
    if (life > 0) state.players[player].life -= life;
    payCounters(state, action.objectId, ability.counterCost);
    if (ability.limit) recordUse(state, action.objectId, ability.id);
    if (ability.tapSelf) {
      object.tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.objectId), tapped: true}));
    }
    addMana(pool, produced);
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
    const tax = fromCommand ? commanderTax(state, player, action.objectId) : 0;
    const free = action.free ? freeCast(state, player, action.objectId) : null;
    if (action.free && !free) throw new Error(`${object.card} cannot be cast without paying its mana cost now`);
    /* Flashback (CR 702.34a): its cost rather than the mana cost, life and all. */
    const back = action.flashback ? flashbackCost(state, player, action.objectId) : null;
    if (action.flashback && !back) throw new Error(`${object.card} cannot be cast with flashback now`);
    /* Its alternative cost (CR 118.9), asked again now. */
    const way = action.alternative !== undefined ? alternativeCosts(state, player, action.objectId).find((w) => w.index === action.alternative) : null;
    if (action.alternative !== undefined && !way) throw new Error(`${object.card} cannot be cast that way now`);
    const {cost, x} = castCost(state, player, action.objectId, tax, Boolean(free), back ? back.mana : way ? way.mana : null);
    const payment = automaticPayment(state.players[player].manaPool, cost, {life: state.players[player].life - (back?.life ?? 0) - (way?.life ?? 0), x: x + (action.x ?? 0) * cost.variable});
    if (!payment || (back && back.life > state.players[player].life) || (way && way.life > state.players[player].life)) throw new Error(`${object.card} cannot be paid for from this pool`);
    const card = cardRef(state, action.objectId);
    spend(state.players[player].manaPool, payment.mana);
    if (payment.life > 0) state.players[player].life -= payment.life;
    if (back?.life) state.players[player].life -= back.life;
    if (way?.life) state.players[player].life -= way.life;
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
    /* Cast with flashback: exiled, whatever would move it, as it leaves the stack (rules/stack.mjs, effects/zones.mjs). */
    if (back) entry.flashback = true;
    /* "If a spell cast this way would be put into your graveyard, exile it instead" (Kess): to exile, if to a graveyard. */
    if (permission?.ability.graveyardToExile) entry.graveyardToExile = true;
    /* On the spell as it now is: moving to the stack made a new object (CR 400.7). */
    if (gains.length && state.objects[entry.objectId]) state.objects[entry.objectId].castGains = gains;
    for (const [kind, id] of extraPaid) {
      /* A card exiled from the hand (Force of Will) goes to exile; a discard or a sacrifice to its owner's graveyard. */
      const paid = kind === "sacrifice" ? sacrificeOne(state, id, events) : moveOne(state, id, kind === "exile" ? "exile" : "graveyard", events, {owner: state.objects[id].owner});
      if (kind === "discard" && paid !== null) events[events.length - 1].data.fields.discarded = true;
    }
    /* What it is aimed at becomes its target (ward, CR 702.21a). */
    events.push(...becameTarget(state, entry));
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: true, abilityId: entry.abilityId, stackId: entry.stackId},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription,
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
    const ability = (object.abilities ?? []).find((candidate) => candidate.id === action.abilityId);
    /* Recomputed, as a cast's payment is: the pool may have moved since the offer. */
    const payment = costPayment(state, player, action.objectId, ability.cost, action.x ?? 0, abilityLess(state, player, action.objectId, ability));
    if (!payment || !withinLimit(state, action.objectId, ability)) throw new Error(`${object.card}'s ability cannot be paid for now`);
    /* A source the cost sacrifices is read as it last was ("a 2/2 Spider for each counter on this creature"). */
    const sacrificesSelf = (ability.cost ?? []).some((a) => a.atom === "sacrifice" && a.self === true);
    const card = cardRef(state, action.objectId);
    const targets = structuredClone(action.targets ?? []);
    const targetDescription = targets.map((t) => targetName(state, t)).join(", ");
    /* CR 602.2a, then 602.2b and 601.2h: on the stack first, then the costs. */
    const entry = pushAbility(state, {sourceId: action.objectId, controller: player, abilityId: ability.id, kind: "ability", targets, script: ability,
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
        spend(state.players[player].manaPool, payment.mana.mana);
        if (payment.mana.life > 0) state.players[player].life -= payment.mana.life;
      }
      if (atom.atom === "payLife") state.players[player].life -= atom.amount ?? 0;
      if (atom.atom === "addCounters" || atom.atom === "removeCounters")
        payCounters(state, action.objectId, [{counter: atom.counter, count: atom.count ?? 1, put: atom.atom === "addCounters"}]);
      /* "Return a Forest you control to its owner's hand": the one chosen with the offer. */
      if (atom.atom === "returnToHand" && action.costChoice?.returnToHand !== undefined) moveOne(state, action.costChoice.returnToHand, "hand", events);
      /* "Discard a card": the one chosen with the offer, a discard -- "whenever you discard a card" sees it. */
      if (atom.atom === "discard" && atom.self !== true && action.costChoice?.discard !== undefined
        && moveOne(state, action.costChoice.discard, "graveyard", events, {owner: state.objects[action.costChoice.discard].owner}) !== null) events[events.length - 1].data.fields.discarded = true;
      /* CR 701.21a: to sacrifice is to move a permanent you control to its owner's graveyard -- through the
         replacements and with its last known information, like any death, so "when this dies" still sees it. */
      if (atom.atom === "sacrifice" && atom.self === true) sacrificeOne(state, action.objectId, events);
      /* Discarding it is the cost of cycling: paid after the ability is on the stack (CR 602.2b, 601.2h), a discard. */
      if (atom.atom === "discard" && atom.self === true && moveOne(state, action.objectId, "graveyard", events, {owner: object.owner}) !== null) events[events.length - 1].data.fields.discarded = true;
      if (atom.atom === "sacrifice" && atom.selector && action.costChoice?.sacrifice !== undefined) sacrificeOne(state, action.costChoice.sacrifice, events);
    }
    if (ability.limit) recordUse(state, action.objectId, ability.id);
    return events;
  }

  /* Unreachable: an action kind that passed the offered check but has no branch would be a kind
     this module enumerates and cannot perform. Loud, per principle 6. */
  throw new Error(`The engine offered ${action.kind} and cannot perform it`);
}
