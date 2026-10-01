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

import {cardsIn, moveObject} from "../state/index.mjs";
import {pushSpell, pushAbility} from "./stack.mjs";
import {addMana, spend, parseManaCost, automaticPayment, manaValue, poolSize} from "./mana.mjs";
import {commanderTax, recordCommanderCast, colorIdentity} from "./commander.mjs";
import {COLORS} from "./mana.mjs";
import {summoningSick, hasFlash} from "../keywords/timing.mjs";
import {targetChoices, targetName, isHostile} from "../script/bind.mjs";
import {moveOne} from "../script/effects/zones.mjs";
import {compileSelector} from "../script/filter.mjs";
import {runEffects} from "../script/effects/index.mjs";
import {checkStateBasedActions, gameOver} from "./sba.mjs";
import {askEntering} from "./entering.mjs";
import {collectTriggers, openTriggers} from "./trigger.mjs";

const MAIN_PHASES = ["MAIN1", "MAIN2"];
/* CR 307.1 and 308.1: these are the card types that can only be cast at sorcery speed. */
const SORCERY_SPEED = ["Sorcery", "Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"];

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

const isLand = (object) => (object.types ?? []).includes("Land");

/* A spell's additional cost (CR 601.2b, 601.2h): "As an additional cost to cast this spell, discard a card" or
   "sacrifice a creature". The player chooses what as they cast, so each choice is its own offer, as targets are --
   one per card that could be discarded (never the spell itself) or permanent that could be sacrificed. An additional
   cost nobody could pay leaves the spell unoffered. */
function additionalChoices(state, player, spellId, costs) {
  let choices = [{}];
  for (const atom of costs ?? []) {
    let options = [];
    if (atom.atom === "discard") options = cardsIn(state, "hand", player).filter((id) => id !== spellId).map((id) => ({discard: id}));
    if (atom.atom === "sacrifice") {
      const alternatives = Array.isArray(atom.selector?.anyOf) ? atom.selector.anyOf : [atom.selector ?? {}];
      const matchers = alternatives.map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
      options = state.zones.battlefield.filter((id) => matchers.some((m) => m(state, id, {controller: player}))).map((id) => ({sacrifice: id}));
    }
    choices = choices.flatMap((chosen) => options.filter((o) => !Object.values(chosen).includes(Object.values(o)[0])).map((o) => ({...chosen, ...o})));
  }
  return choices;
}

/* One offer per way to choose the targets (script/bind.mjs); a single offer, unchanged, when there are none. */
function withTargets(state, base, ability, context) {
  const specs = ability?.targets ?? [];
  if (!specs.length) return [base];
  const hostile = isHostile(ability.effects);
  return targetChoices(state, specs, context).map((targets) => ({
    ...base, targets, targetNames: targets.map((t) => targetName(state, t)), hostile,
  }));
}

/* The cost atoms 2.4 can pay. `costPayment` says whether all of an ability's can be paid now, and how. */
const COST_ATOMS_BUILT = ["{T}", "mana", "payLife", "sacrifice"];
export const costAtomBuilt = (atom) => COST_ATOMS_BUILT.includes(atom?.atom) && (atom.atom !== "sacrifice" || atom.self === true || (atom.selector && typeof atom.selector === "object"));

/* "Sacrifice a creature: ..." (Viscera Seer, Ashnod's Altar, Phyrexian Tower): a cost the player chooses as they activate
   (CR 602.2b, 601.2h), so each permanent they could sacrifice is its own offer, as with a spell's additional cost. Only
   their own (CR 701.21a); "another" leaves out the source itself. */
function sacrificeChoices(state, player, sourceId, selector) {
  const matches = (Array.isArray(selector?.anyOf) ? selector.anyOf : [selector ?? {}])
    .map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
  return state.zones.battlefield.filter((id) => matches.some((m) => m(state, id, {controller: player, source: sourceId})));
}
const sacrificeAtom = (cost) => (cost ?? []).find((a) => a?.atom === "sacrifice" && a.selector);

function costPayment(state, player, id, cost) {
  const object = state.objects[id];
  let mana = null, life = 0;
  for (const atom of cost ?? []) {
    if (!costAtomBuilt(atom)) return null;
    if (atom.atom === "{T}") {
      if (object.tapped) return null;
      /* CR 302.6: a creature's {T} ability waits until it has been yours since your turn began. */
      if (summoningSick(state, id)) return null;
    }
    if (atom.atom === "mana") {
      if (mana) return null;
      mana = automaticPayment(state.players[player].manaPool, parseManaCost(atom.cost), {life: state.players[player].life});
      if (!mana) return null;
    }
    /* CR 119.4: a player can pay life only if their life total is at least the amount. */
    if (atom.atom === "payLife") life += atom.amount ?? 0;
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

/** What a mana ability can add, one entry per alternative (2.4b). */
export function manaAlternatives(state, player, ability) {
  const count = ability.count ?? 1;
  if (Array.isArray(ability.produces)) return ability.produces.map((m) => ({...m}));
  if (ability.produces) return [{...ability.produces}];
  if (ability.anyColor === true) return COLORS.map((color) => ({[color]: count}));
  if (ability.anyColor === "identity") return commanderIdentity(state, player).map((color) => ({[color]: count}));
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

/** How many lands this player may still play this turn. CR 305.2; effects raise the allowance. */
const landDropsLeft = (state, player) => (state.players[player].landAllowance ?? 1) - state.players[player].landsPlayed;

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
      if (!manaAbilityPayment(state, player, ability)) continue;
      const alternatives = manaAlternatives(state, player, ability);
      const fodder = ability.sacrifice ? sacrificeChoices(state, player, id, ability.sacrifice).map((x) => ({sacrifice: x})) : [null];
      for (const costChoice of fodder) alternatives.forEach((mana, produce) => actions.push({
        kind: "activate-mana", objectId: id, abilityId: ability.id, label: object.card, mana,
        /* A fixed ability is one offer and looks as it always has; a choice says which it is. */
        ...(alternatives.length > 1 || Array.isArray(ability.produces) || ability.anyColor ? {produce} : {}),
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
    ...cardsIn(state, "command", player)
      .filter((id) => state.objects[id].commander === true)
      .map((id) => ({id, from: "command"})),
  ];
  for (const {id, from} of castable) {
    const object = state.objects[id];
    if (!object.manaCost) continue;
    if (sorcerySpeed(object) && !hasFlash(state, id) && !(player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0))
      continue;
    const tax = from === "command" ? commanderTax(state, player, id) : 0;
    const cost = parseManaCost(object.manaCost);
    const payment = automaticPayment(state.players[player].manaPool, cost, {life: state.players[player].life, x: tax});
    if (!payment) continue;
    const extra = object.spell?.additionalCost ?? [];
    const paysFor = extra.length ? additionalChoices(state, player, id, extra) : [null];
    for (const costChoice of paysFor)
      actions.push(...withTargets(state, {kind: "cast", objectId: id, label: object.card, payment, from, tax, ...(costChoice ? {costChoice, costNames: Object.values(costChoice).map((x) => state.objects[x].card)} : {})},
        object.spell, {controller: player, source: id}));
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
      const payment = costPayment(state, player, id, ability.cost);
      if (!payment) continue;
      const atom = sacrificeAtom(ability.cost);
      const fodder = atom ? sacrificeChoices(state, player, id, atom.selector).map((x) => ({sacrifice: x})) : [null];
      for (const costChoice of fodder)
        actions.push(...withTargets(state, {kind: "activate", objectId: id, abilityId: ability.id, label: object.card, text: ability.text, payment,
          ...(costChoice ? {costChoice, costNames: [state.objects[costChoice.sacrifice].card]} : {})}, ability, {controller: player, source: id}));
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
  const spells = [...cardsIn(state, "hand", player), ...cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true)];
  return !spells.some((id) => {
    const object = state.objects[id];
    if (!object.manaCost || (sorcerySpeed(object) && !hasFlash(state, id) && !mainNow)) return false;
    const tax = object.zone === "command" ? commanderTax(state, player, id) : 0;
    return manaValue(parseManaCost(object.manaCost)) + tax <= mana;
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
    const produced = manaAlternatives(state, player, ability)[action.produce ?? 0];
    const payment = manaAbilityPayment(state, player, ability);
    if (!produced || !payment) throw new Error(`${object.card} cannot add that mana now`);
    const pool = state.players[player].manaPool;
    spend(pool, payment.mana);
    const life = (ability.payLife ?? 0) + payment.life;
    if (life > 0) state.players[player].life -= life;
    if (ability.tapSelf) {
      object.tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.objectId), tapped: true}));
    }
    addMana(pool, produced);
    events.push(event("GameEventManaPool", state, {
      player: {playerId: player, name: state.players[player].name},
      produced: {...produced}, source: cardRef(state, action.objectId),
    }));
    /* "This land deals 1 damage to you": part of the same mana ability, so it happens now, off the stack too. */
    if ((ability.then ?? []).length) events.push(...runEffects(state, ability.then, {controller: player, source: action.objectId}));
    /* "{T}, Sacrifice this artifact: Add one mana of any color" (a Treasure, Lotus Petal): the sacrifice is part of the
       cost of a mana ability, paid as it is activated (CR 605.3a, 701.21a). */
    if (ability.sacrificeSelf && state.objects[action.objectId]) moveOne(state, action.objectId, "graveyard", events);
    if (ability.sacrifice && action.costChoice?.sacrifice !== undefined) moveOne(state, action.costChoice.sacrifice, "graveyard", events);
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
    const cost = parseManaCost(object.manaCost);
    const payment = automaticPayment(state.players[player].manaPool, cost, {life: state.players[player].life, x: tax});
    if (!payment) throw new Error(`${object.card} cannot be paid for from this pool`);
    const card = cardRef(state, action.objectId);
    spend(state.players[player].manaPool, payment.mana);
    if (payment.life > 0) state.players[player].life -= payment.life;
    /* CR 903.8: the tax counts casts from the command zone, so it is recorded only here. */
    if (fromCommand) recordCommanderCast(state, player, action.objectId);

    const permanent = !(object.types ?? []).some((type) => ["Instant", "Sorcery"].includes(type));
    const targets = structuredClone(action.targets ?? []);
    const targetDescription = targets.map((t) => targetName(state, t)).join(", ");
    /* The additional cost chosen, paid with the rest of the cost (CR 601.2h), its cards named before they move. */
    const extraPaid = [];
    for (const [kind, id] of Object.entries(action.costChoice ?? {})) {
      if (!state.objects[id]) throw new Error("That additional cost can no longer be paid");
      extraPaid.push([kind, id]);
    }
    const entry = pushSpell(state, action.objectId, {controller: player, permanent, targets});
    for (const [kind, id] of extraPaid) {
      const paid = moveOne(state, id, "graveyard", events, {owner: state.objects[id].owner});
      if (kind === "discard" && paid !== null) events[events.length - 1].data.fields.discarded = true;
    }
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: true, abilityId: entry.abilityId, stackId: entry.stackId},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription,
    }));
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: fromCommand ? "Command" : "Hand", player: {playerId: player}},
      to: {zoneType: "Stack", player: {playerId: player}},
    }));
    return events;
  }

  if (action.kind === "activate") {
    const events = [];
    const object = state.objects[action.objectId];
    const ability = (object.abilities ?? []).find((candidate) => candidate.id === action.abilityId);
    /* Recomputed, as a cast's payment is: the pool may have moved since the offer. */
    const payment = costPayment(state, player, action.objectId, ability.cost);
    if (!payment) throw new Error(`${object.card}'s ability cannot be paid for now`);
    const card = cardRef(state, action.objectId);
    const targets = structuredClone(action.targets ?? []);
    const targetDescription = targets.map((t) => targetName(state, t)).join(", ");
    /* CR 602.2a, then 602.2b and 601.2h: on the stack first, then the costs. */
    const entry = pushAbility(state, {sourceId: action.objectId, controller: player, abilityId: ability.id, kind: "ability", targets, script: ability});
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: false, abilityId: entry.abilityId, stackId: entry.stackId, description: ability.text},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription,
    }));
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
      /* CR 701.21a: to sacrifice is to move a permanent you control to its owner's graveyard -- through the
         replacements and with its last known information, like any death, so "when this dies" still sees it. */
      if (atom.atom === "sacrifice" && atom.self === true) moveOne(state, action.objectId, "graveyard", events);
      if (atom.atom === "sacrifice" && atom.selector && action.costChoice?.sacrifice !== undefined) moveOne(state, action.costChoice.sacrifice, "graveyard", events);
    }
    return events;
  }

  /* Unreachable: an action kind that passed the offered check but has no branch would be a kind
     this module enumerates and cannot perform. Loud, per principle 6. */
  throw new Error(`The engine offered ${action.kind} and cannot perform it`);
}
