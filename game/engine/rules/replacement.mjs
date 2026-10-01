/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* REPLACEMENT AND PREVENTION: CR 614, 615, 616.
 *
 * `docs/engine/PLAN.md` §3.3, eighth row — "affected object's controller orders (616.1)".
 *
 * A REPLACEMENT EFFECT IS NOT A TRIGGER, and the difference is the whole file. It does not use the
 * stack, nobody receives priority, and it cannot be responded to. It waits for an event that WOULD
 * happen and changes it before it does, so the original never occurs: a creature that would die and
 * is exiled instead DID NOT DIE, and nothing that watches for deaths sees one. Modeling it as a
 * trigger that undoes the event afterwards produces a game where "whenever a creature dies" fires
 * on creatures that never died, and where the board reports a death it then has to take back.
 *
 * So the rules modules raise a PROPOSAL — "this is about to happen" — and pass it through here
 * before doing anything. The event they finally report is the replaced one.
 *
 * EACH EFFECT APPLIES ONCE TO A GIVEN EVENT (CR 614.5). Without it two effects that each rewrite a
 * zone change can pass the event back and forth without end. That is a hang, not a wrong answer,
 * and a hang inside state-based actions is the kind nothing can report.
 *
 * WHEN SEVERAL APPLY, THE AFFECTED OBJECT'S CONTROLLER CHOOSES (CR 616.1) — not the effects'
 * controllers, and not the engine. The player whose creature is about to be replaced out of
 * existence picks which replacement happens first, and the order decides the outcome whenever the
 * first removes the second's opportunity.
 *
 * PREVENTION IS A SHIELD THAT WEARS OUT (CR 615.1), so applying it writes back what is left.
 *
 * WHAT IS DEFERRED AND NAMED: self-replacement effects, which apply before others (CR 614.15), and
 * "as this enters" effects (CR 614.1c) both need the card script to express them; the choice here
 * already has the shape they will slot into. Prevention shields are held on the permanent that
 * grants them, which is right for a static shield and will need the continuous-effect machinery of
 * 1.8 for one that lasts "this turn" and then goes away.
 */

import {compileSelector} from "../script/filter.mjs";
import {amountOf, isCounted} from "../script/amount.mjs";

/* "This land enters tapped unless you control a Forest or a Plains" (a check land), "... unless you control two or
   fewer other lands" (a fast land): the arrival's `unless`, read as the land is about to enter -- so the land itself,
   not yet there, is never one of the permanents counted. `controls` is a selector or `{anyOf: [...]}`; at least `min`
   (default 1) and at most `max` of them, controlled by the player whose permanent is entering. */
function unlessHolds(state, unless, player) {
  if (!unless) return false;
  /* "Unless you have two or more opponents": the players still in the game besides this one. */
  if (unless.opponents) {
    const opponents = state.players.filter((p) => p.id !== player && !p.lost).length;
    return opponents >= (unless.opponents.min ?? 1) && (unless.opponents.max === undefined || opponents <= unless.opponents.max);
  }
  const alternatives = Array.isArray(unless.controls?.anyOf) ? unless.controls.anyOf : [unless.controls ?? {}];
  const matchers = alternatives.map((selector) => compileSelector({...selector, controller: "you"}));
  const count = state.zones.battlefield.filter((id) => matchers.some((m) => m(state, id, {controller: player}))).length;
  return count >= (unless.min ?? 1) && (unless.max === undefined || count <= unless.max);
}

/** Where an effect has to be for it to act on the battlefield (CR 113.6). */
const ACTING_ZONES = ["battlefield"];

/* Whether this effect applies to this proposal, given what has already applied to it. */
function applies(state, ability, holder, proposal) {
  if (ability.kind !== "replacement") return false;
  /* CR 614.5: once per event, whatever else is true. */
  if ((proposal.applied ?? []).includes(ability.id)) return false;
  const watches = ability.watches ?? {};
  if (watches.event !== proposal.event) return false;

  if (proposal.event === "enters") {
    /* `who: "self"` is the permanent's own arrival ability. `holder` is null for it, because at
       this moment the permanent is NOT on the battlefield to be a holder — see `applicable`. */
    if (watches.who === "self") return holder === null && !unlessHolds(state, watches.unless, proposal.player);
    if (holder === null) return false;
    if (watches.types && !watches.types.every((type) => (proposal.types ?? []).includes(type))) return false;
    if (watches.controller === "controller" && proposal.player !== holder.controller) return false;
    return true;
  }

  if (proposal.event === "zone-change") {
    if (watches.from && watches.from !== proposal.from) return false;
    if (watches.to && watches.to !== proposal.to) return false;
    /* "If a creature an opponent controls would die" (Liesa): what is moving, as it is now, "you" the holder's controller. */
    if (watches.filter && !(holder && compileSelector(watches.filter)(state, proposal.objectId, {controller: holder.controller, source: holder.id}))) return false;
    return true;
  }

  if (proposal.event === "damage") {
    /* A spent shield is not an applicable effect, so it is neither applied nor offered as a
       choice — a player asked to order two effects where one would do nothing is being asked a
       question that is not really a question. */
    if ((ability.prevent ?? 0) <= 0) return false;
    if (watches.toPlayer === "controller" && proposal.toPlayer !== holder.controller) return false;
    if (Number.isInteger(watches.toPlayer) && proposal.toPlayer !== watches.toPlayer) return false;
    return true;
  }

  return false;
}

/* Every effect that could apply right now, each with the object holding it.
 *
 * THE ENTERING PERMANENT'S OWN ABILITIES ARE READ FIRST, AND FROM NOWHERE (CR 614.12, 614.15). A
 * land that enters tapped says so with its own ability, and at the moment that ability has to be
 * read the land is a card in a hand or on the stack — it is not on the battlefield, so the scan
 * below cannot find it. The proposal carries the abilities of the thing about to arrive, and they
 * are put at the head of the list because a self-replacement applies before anybody else's (CR
 * 614.15), which is what stops the order being a choice nobody should have to make. */
function applicable(state, proposal) {
  const found = [];
  for (const ability of proposal.entering?.abilities ?? []) {
    if (applies(state, ability, null, proposal)) found.push({holderId: null, ability});
  }
  for (const zone of ACTING_ZONES) {
    for (const id of state.zones[zone]) {
      const holder = state.objects[id];
      for (const ability of holder.abilities ?? []) {
        if (applies(state, ability, holder, proposal)) found.push({holderId: id, ability});
      }
    }
  }
  return found;
}

/* Whether a "prevent all damage ... this turn" effect stops this damage: `affects.ids` the objects it is about (fixed as it
   began, as the card says "that creature" or "those permanents"), `apply.to` damage dealt to them (the default),
   `apply.by` damage they deal, `apply.combat` combat damage only. A new object is not one of them (CR 400.7). */
function preventedForAWhile(state, proposal) {
  return (state.effects ?? []).some((effect) => {
    if (effect.rule !== "prevent-damage") return false;
    const ids = effect.affects?.ids ?? [];
    const how = effect.apply ?? {};
    if (how.combat === true && proposal.combat !== true) return false;
    return (how.to !== false && proposal.toCard !== undefined && proposal.toCard !== null && ids.includes(proposal.toCard))
      || (how.by === true && proposal.sourceId !== undefined && proposal.sourceId !== null && ids.includes(proposal.sourceId));
  });
}

/** Who chooses the order (CR 616.1): the affected object's controller, or the affected player. */
function affectedPlayer(state, proposal) {
  if (proposal.event === "enters") return proposal.player ?? null;
  if (proposal.event === "damage") return proposal.toPlayer ?? state.objects[proposal.toCard]?.controller ?? null;
  if (proposal.objectId !== undefined) return state.objects[proposal.objectId]?.controller ?? proposal.player ?? null;
  return proposal.player ?? null;
}

function applyOne(state, {holderId, ability}, proposal) {
  const next = {...proposal, applied: [...(proposal.applied ?? []), ability.id]};

  if (ability.change?.to) next.to = ability.change.to;

  /* CR 614.12: modifying how a permanent ENTERS, rather than where a card goes. The permanent is
     not on the battlefield yet, so these land on the proposal and the caller applies them as part
     of putting it there -- which is what makes it one event rather than a permanent that arrives
     and is then tapped. */
  if (ability.change?.entersTapped === true) next.tapped = true;
  /* "As this land enters, you may pay 2 life. If you don't, it enters tapped": tapped unless paid, and the payment is
     a question for its controller once it is there (rules/entering.mjs). */
  if (ability.change?.unlessPay) next.asks = [...(next.asks ?? []), {...ability.change.unlessPay}];
  /* "As this land enters, you may reveal an Island or Swamp card from your hand. If you don't, it enters tapped." */
  if (ability.change?.unlessReveal) next.asks = [...(next.asks ?? []), {reveal: structuredClone(ability.change.unlessReveal)}];
  if (ability.change?.entersWithCounters) {
    const {counter, count} = ability.change.entersWithCounters;
    /* "With X +1/+1 counters on it" (CR 107.3m: the X paid to cast it), "a +1/+1 counter for each Zombie card in your
       graveyard", "X, where X is the greatest power among other creatures you control": counted as it is about to enter,
       "you" its controller. */
    const n = isCounted(count) ? amountOf(state, count, {controller: proposal.player, source: proposal.objectId, x: proposal.x ?? 0}) : count;
    next.counters = {...(next.counters ?? {})};
    if (n > 0) next.counters[counter] = (next.counters[counter] ?? 0) + n;
  }

  if (Number.isInteger(ability.prevent) && proposal.event === "damage") {
    const stopped = Math.min(ability.prevent, next.amount);
    next.amount -= stopped;
    /* The shield wears out on the object itself, so what is left is part of the game state and
       survives a checkpoint like everything else. */
    const live = state.objects[holderId].abilities.find((a) => a.id === ability.id);
    live.prevent -= stopped;
    /* CR 615.4: an event whose whole effect is prevented does not happen. Saying so on the
       proposal keeps a caller from reporting zero damage as damage. */
    if (next.amount === 0) next.prevented = true;
  }

  return next;
}

/**
 * Run a proposal through every replacement and prevention effect that applies.
 *
 * @param {object} proposal  `{event: "zone-change"|"damage", …}` — what is about to happen
 * @returns {{proposal: object, applied: Array<string>, awaiting: boolean}}
 *   `awaiting` is true when more than one effect applied at once and the affected player has been
 *   asked which goes first (CR 616.1). The caller stops, the driver answers, and
 *   `resolveReplacementOrder` finishes the job.
 */
export function applyReplacements(state, proposal) {
  let current = {...proposal, applied: proposal.applied ?? []};

  /* PREVENTION FOR A WHILE (CR 615): "prevent all combat damage that would be dealt to and dealt by that creature this
     turn" (Maze of Ith), "prevent all damage that would be dealt to those permanents this turn" (Mutational Advantage)
     -- an effect with a duration (`rule: "prevent-damage"`, effects/permanents.mjs's effectUntil). It prevents all of
     the damage, so nothing is left for another effect to apply to, and there is no order to ask (CR 616.1). */
  if (proposal.event === "damage" && preventedForAWhile(state, current))
    return {proposal: {...current, amount: 0, prevented: true}, applied: current.applied, awaiting: false};

  /* Each round finds what still applies to the event AS IT NOW IS, which is what makes an effect
     that rewrites the destination able to bring a different effect into play. Bounded by CR 614.5:
     the applied list only grows, so this cannot run longer than there are effects. */
  for (let guard = 0; guard < 64; guard += 1) {
    const candidates = applicable(state, current);
    if (candidates.length === 0) break;
    if (candidates.length > 1) {
      state.awaiting = {kind: "order-replacements", player: affectedPlayer(state, current), proposal: current};
      return {proposal: current, applied: current.applied, awaiting: true};
    }
    current = applyOne(state, candidates[0], current);
  }

  return {proposal: current, applied: current.applied, awaiting: false};
}

/**
 * How a permanent about to enter the battlefield is modified (CR 614.12).
 *
 * Asked BEFORE the card moves, because the abilities that answer it belong to the card as it is
 * now — once it has moved it is a new object (CR 400.7). The caller applies the answer as part of
 * putting the permanent down, which is what makes entering tapped ONE event: there is no moment
 * where it is on the battlefield untapped, so nothing that watches for tapping sees anything.
 *
 * @returns {{tapped: boolean, counters: object}}
 */
export function enteringModifications(state, {objectId, player, types, abilities, x = 0}) {
  const {proposal} = applyReplacements(state, {
    event: "enters", objectId, player, types: types ?? [], x,
    entering: {abilities: abilities ?? []},
    tapped: false, counters: {},
  });
  return {tapped: proposal.tapped === true, counters: proposal.counters ?? {}, asks: proposal.asks ?? []};
}

/** The choice (§12.1) for CR 616.1: which applicable effect happens first. */
export function replacementChoice(state, awaiting) {
  const candidates = applicable(state, awaiting.proposal);
  return {
    id: `order-replacements:${state.turn}:${awaiting.proposal.event}`,
    title: "Choose which replacement effect applies first",
    mode: "one",
    min: 1,
    max: 1,
    options: candidates.map((candidate, index) => ({
      index,
      /* The effect's own words. "Effect 1" and "effect 2" is not a choice anybody can make, and
         the two may come from different permanents with the same name. */
      label: `${state.objects[candidate.holderId].card}: ${candidate.ability.text ?? candidate.ability.id}`,
      cardId: candidate.holderId,
    })),
  };
}

/**
 * Apply the chosen effect and carry on through the rest (CR 616.1), asking again if another
 * ambiguity turns up — which it can, because applying one can change what else applies.
 */
export function resolveReplacementOrder(state, awaiting, indices) {
  if (!state.awaiting || state.awaiting.kind !== "order-replacements")
    throw new Error("The engine is not waiting on a replacement order");
  const candidates = applicable(state, awaiting.proposal);
  const chosen = candidates[indices?.[0]];
  if (!chosen) throw new Error("Invalid selection");

  const next = applyOne(state, chosen, awaiting.proposal);
  state.awaiting = null;
  return applyReplacements(state, next);
}
