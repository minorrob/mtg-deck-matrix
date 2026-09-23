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

/** Where an effect has to be for it to act on the battlefield (CR 113.6). */
const ACTING_ZONES = ["battlefield"];

/* Whether this effect applies to this proposal, given what has already applied to it. */
function applies(state, ability, holder, proposal) {
  if (ability.kind !== "replacement") return false;
  /* CR 614.5: once per event, whatever else is true. */
  if ((proposal.applied ?? []).includes(ability.id)) return false;
  const watches = ability.watches ?? {};
  if (watches.event !== proposal.event) return false;

  if (proposal.event === "zone-change") {
    if (watches.from && watches.from !== proposal.from) return false;
    if (watches.to && watches.to !== proposal.to) return false;
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

/* Every effect that could apply right now, each with the object holding it. */
function applicable(state, proposal) {
  const found = [];
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

/** Who chooses the order (CR 616.1): the affected object's controller, or the affected player. */
function affectedPlayer(state, proposal) {
  if (proposal.event === "damage") return proposal.toPlayer ?? state.objects[proposal.toCard]?.controller ?? null;
  if (proposal.objectId !== undefined) return state.objects[proposal.objectId]?.controller ?? proposal.player ?? null;
  return proposal.player ?? null;
}

function applyOne(state, {holderId, ability}, proposal) {
  const next = {...proposal, applied: [...(proposal.applied ?? []), ability.id]};

  if (ability.change?.to) next.to = ability.change.to;

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
