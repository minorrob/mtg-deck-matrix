/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE STACK: CR 405, 608.
 *
 * `docs/engine/PLAN.md` §3.3, third row. Last on, first off, and everything that uses the stack
 * waits for everything above it.
 *
 * A SPELL'S CARD IS REALLY IN THE STACK ZONE (CR 405.1). It is not still in hand with a flag on it.
 * The cheap version — leave the card where it is and remember that it is being cast — is wrong in
 * ways that surface far from here: every opponent's view of that hand is one card too many, a
 * graveyard-recursion effect can find a card that is mid-cast, and a countered spell has nowhere to
 * be put. So `pushSpell` moves the object, which by CR 400.7 makes a new one, and the entry
 * records the new id.
 *
 * AN ABILITY ON THE STACK IS INDEPENDENT OF ITS SOURCE (CR 113.7a). Destroying the creature does
 * not remove its activated ability from the stack, and resolving that ability moves no card at all.
 * That is why there are two lists here and not one: `state.zones.stack` holds the cards, because
 * the one-object-one-zone invariant has to cover them, and `state.stack` holds the entries, because
 * an ability has no card. They are appended and popped together and `engine-stack` pins that they
 * never drift.
 *
 * WHAT RESOLVES IS THE CARD'S SCRIPT (phase 2.4). This module owns the order of resolution and where a card ends
 * up; what a spell DOES is its card script: a spell's own spell ability, read off its card, or an ability's effects,
 * carried on its entry because the ability outlives its source (CR 113.7a). A caller may still pass an effect of its
 * own, which runs instead -- the kernel's tests and the gate's vanilla games do. The effect runs while the card is
 * still on the stack, because a spell that refers to itself must be able to find itself.
 *
 * A RESOLUTION CAN STOP TO ASK (script/resolution.mjs): "scry 2, then draw" asks between the two. The spell stays
 * on top of the stack, marked `resolving`, until the question is answered and its last effect has run; only then
 * does it leave the stack (`finishResolving`). Nobody holds priority meanwhile (CR 608.2: nothing happens between
 * the steps of a resolution).
 *
 * TARGETS ARE CHECKED AGAIN FIRST (CR 608.2b, script/bind.mjs): an illegal one is dropped, and a spell or ability
 * whose every target is illegal does nothing and leaves the stack with `hasFizzled`.
 */

import {holdArrival} from "./entering.mjs";
import {conditionHolds} from "../script/condition.mjs";
import {moveObject, addObject, removeObject} from "../state/index.mjs";
import {enteringModifications} from "./replacement.mjs";
import {beginResolution, resolutionPending} from "../script/resolution.mjs";
import {recheckTargets, factsOf, modalScript} from "../script/bind.mjs";

/* The projection contract (§12.1) names these zones with a capital, and the telemetry matches on
   them by name. The engine's own zone keys are lower case. */
const ZONE_LABEL = {
  library: "Library", hand: "Hand", battlefield: "Battlefield",
  graveyard: "Graveyard", exile: "Exile", stack: "Stack", command: "Command",
};

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

/**
 * "Becomes the target of a spell or ability" (CR 115.1, 702.21a): one event for each object a stack entry is aimed at,
 * once however many of its targets name it, as the targets are chosen -- a spell cast, an ability activated, a trigger's
 * targets chosen, a copy's new target. `only` limits it to one object (a copy's changed target). Ward watches for it.
 */
export function becameTarget(state, entry, only = null) {
  const seen = new Set();
  /* A counted target's list: each of them (script/bind.mjs). */
  return (entry?.targets ?? []).flat().filter((t) => t && t.kind === "object" && state.objects[t.id] && (only === null || t.id === only) && !seen.has(t.id) && seen.add(t.id))
    .map((t) => event("GameEventBecomesTarget", state, {card: cardRef(state, t.id), targetId: t.id, stackId: entry.stackId, kind: entry.kind, by: {playerId: entry.playerId}}));
}

/** How many objects are on the stack. */
export const stackSize = (state) => state.stack.length;

/** The top entry, or null. The top is the LAST one added (CR 608.1). */
export const peekStack = (state) => (state.stack.length ? state.stack[state.stack.length - 1] : null);

/* Every entry carries the fields `CommanderProbeProjection@1` names, so the board reads the
   engine's stack with the code it already has. `stage` is the bridge's own field; the engine sets
   it to "waiting" until the resolution machinery in 1.6 has more to say. */
function entryFor(state, {objectId, cardId, name, playerId, kind, abilityId, targets}) {
  const stackId = state.nextStackId;
  state.nextStackId += 1;
  return {
    stackId,
    abilityId: abilityId ?? null,
    objectId: objectId ?? null,
    cardId: cardId ?? null,
    name: name ?? null,
    faceDown: false,
    playerId,
    kind,
    stage: "waiting",
    targets: targets ?? [],
  };
}

/**
 * Cast a spell: move its card to the stack zone and put an entry on the stack.
 *
 * `permanent` says where the card goes when it resolves. It is declared at cast time because the
 * card directory does not exist until phase 2; from then on the type line answers it.
 */
export function pushSpell(state, objectId, {controller, targets = [], permanent = false, abilityId = null, x = null, modes = null} = {}) {
  const object = state.objects[objectId];
  if (!object) throw new Error(`There is no object ${objectId} to cast`);
  const name = object.card;
  const moved = moveObject(state, objectId, "stack");
  const entry = entryFor(state, {
    objectId: moved, cardId: moved, name, playerId: controller ?? object.controller,
    kind: "spell", abilityId, targets,
  });
  entry.permanent = permanent === true;
  /* The value chosen for X (CR 601.2b), part of the spell until it leaves the stack (CR 107.3a). */
  if (x !== null) entry.x = x;
  /* The modes chosen as it was cast (CR 700.2), in order. */
  if (Array.isArray(modes)) entry.modes = [...modes];
  state.stack.push(entry);
  return entry;
}

/**
 * Put an activated or triggered ability on the stack. Nothing moves: the ability is not its source.
 *
 * `sourceId` may be null for an ability whose source has already left the battlefield, which is a
 * legal position (CR 113.7a) rather than a bug.
 */
export function pushAbility(state, {sourceId = null, controller, abilityId, kind = "ability", targets = [], script = null, about = null, x = null, lastKnown = null} = {}) {
  if (!abilityId) throw new Error("An ability on the stack needs an abilityId, or nothing can resolve it");
  const source = sourceId === null ? null : state.objects[sourceId];
  const entry = entryFor(state, {
    objectId: null, cardId: source ? source.id : null, name: source ? source.card : null,
    playerId: controller, kind, abilityId, targets,
  });
  /* What it does, carried with it: its source may leave before it resolves, and the ability does not (CR 113.7a). */
  if (script && (script.effects ?? []).length) entry.script = structuredClone({targets: script.targets ?? [], effects: script.effects, ...(script.condition ? {condition: script.condition} : {})});
  /* What a trigger is about -- the spell cast, the attacker, the player dealt damage -- for "that player" (trigger.mjs). */
  if (about) entry.about = structuredClone(about);
  /* X chosen as it was activated (CR 602.2b); and its source as it last was, for a source the cost sacrificed. */
  if (x !== null) entry.x = x;
  if (lastKnown) entry.lastKnown = structuredClone(lastKnown);
  state.stack.push(entry);
  return entry;
}

/**
 * Copy a spell on the stack (CR 707.10): a new spell, controlled by whoever copied it (CR 707.10, 110.2), with the
 * original's copiable values (CR 707.2) and every choice made for it -- its targets, X, whether it becomes a permanent.
 * It is put on the stack, not cast, so nothing that says "whenever you cast" sees it. As it leaves the stack it ceases
 * to exist (finishTop, CR 704.5e), unless it was a permanent spell that resolved: that becomes a token (CR 608.3f).
 * `nonLegendary`: "except it isn't legendary if the spell is legendary" (Double Major).
 */
export function pushCopy(state, original, {controller, nonLegendary = false} = {}) {
  const object = original?.objectId !== null && original?.objectId !== undefined ? state.objects[original.objectId] : null;
  if (!object) throw new Error("There is no spell there to copy");
  const supertypes = (object.supertypes ?? []).filter((s) => !(nonLegendary && s === "Legendary"));
  const id = addObject(state, {
    card: object.card, types: object.types, manaCost: object.manaCost, abilities: object.abilities,
    power: object.power, toughness: object.toughness, keywords: object.keywords, owner: controller, controller,
    spell: object.spell, subtypes: object.subtypes, supertypes, colors: object.colors, colorIdentity: object.colorIdentity,
    enchant: object.enchant, copy: true,
  }, "stack", null);
  const entry = entryFor(state, {objectId: id, cardId: id, name: object.card, playerId: controller, kind: "spell",
    abilityId: original.abilityId, targets: structuredClone(original.targets ?? [])});
  entry.permanent = original.permanent === true;
  entry.copy = true;
  if (original.x !== undefined) entry.x = original.x;
  /* And its modes (CR 707.10): a copy of a modal spell has the modes the original has. */
  if (Array.isArray(original.modes)) entry.modes = [...original.modes];
  state.stack.push(entry);
  return entry;
}

/* What an entry does: a spell's spell ability off its card, or the script its ability carried onto the stack. */
function scriptOf(state, entry) {
  if (entry.kind === "spell") {
    const spell = entry.objectId === null ? null : state.objects[entry.objectId]?.spell;
    /* Its modes, chosen as it was cast (CR 700.2): their targets in order, their effects aimed at them. */
    if (spell?.modal && Array.isArray(entry.modes)) return modalScript(spell.modal, entry.modes);
    return spell && (spell.effects ?? []).length ? spell : null;
  }
  return entry.script ?? null;
}

/** The target specs a stack entry's targets were chosen by: its spell's or its ability's, or its chosen modes'. */
export function specsOf(state, entry) {
  return scriptOf(state, entry)?.targets ?? [];
}

/**
 * Resolve the top object.
 *
 * @param {object} state
 * @param {?function} effect  `(state, entry, events) => void`, run while the card is still on the
 *                            stack. Phase 2 passes the compiled card script here.
 * @returns {Array} events for the caller to journal
 */
export function resolveTop(state, effect = null, rng = null) {
  const entry = peekStack(state);
  if (!entry) throw new Error("There is nothing on the stack to resolve");
  if (entry.stage === "resolving") throw new Error("The top of the stack is already resolving; answer what it asked");
  const events = [];

  /* The effect happens first, while the spell is still on the stack: a spell that refers to itself
     ("exile it", "this creature") has to be able to find itself. */
  if (typeof effect === "function") {
    effect(state, entry, events);
    return finishTop(state, entry, events, false);
  }
  /* AN AURA SPELL (CR 303.4, 608.3): its target checked again as it resolves -- illegal now, and it does not resolve
     (CR 608.3b) -- and the permanent enters attached to it (CR 303.4f). */
  const enchanting = entry.kind === "spell" && entry.objectId !== null ? state.objects[entry.objectId]?.enchant : null;
  if (enchanting) {
    const context = {controller: entry.playerId, source: entry.objectId};
    const {targets, fizzles} = recheckTargets(state, [enchanting], entry.targets, context);
    return finishTop(state, entry, events, fizzles, fizzles ? null : targets[0]?.id ?? null);
  }
  const script = scriptOf(state, entry);
  if (!script) return finishTop(state, entry, events, false);

  const source = entry.kind === "spell" ? entry.objectId : (entry.cardId !== null && state.objects[entry.cardId] ? entry.cardId : null);
  /* X (CR 107.3a): the spell's or ability's own; a permanent's ability uses the X paid to cast it (CR 107.3m). */
  const x = entry.x ?? (source !== null ? state.objects[source]?.xPaid : undefined) ?? 0;
  const attached = source !== null ? state.objects[source]?.attachedTo ?? null : null;
  const context = {controller: entry.playerId, source, x, ...(entry.about ? {about: entry.about} : {}), ...(entry.lastKnown ? {lastKnown: entry.lastKnown} : {}), ...(attached !== null ? {attached} : {}),
    /* How the spell was cast, for its own conditions ("if this spell was cast from a graveyard"; rules/actions.mjs). */
    ...(entry.cast ? {cast: entry.cast} : {}),
    /* What its permanent chose as it entered: "draw a card for each creature of the chosen type". */
    ...(source !== null && state.objects[source]?.chosen !== undefined ? {chosen: state.objects[source].chosen} : {})};
  const {targets, fizzles} = recheckTargets(state, script.targets, entry.targets, context);
  if (fizzles) return finishTop(state, entry, events, true);
  /* An intervening "if" asked again as it resolves (CR 603.4): false now, and the ability does nothing. A triggered
     ability's own condition only -- "activate only if" was asked as it was activated (CR 602.5b) and is not again. */
  if (entry.kind === "trigger" && script.condition && !conditionHolds(state, script.condition, {controller: entry.playerId, source, about: entry.about ?? undefined})) return finishTop(state, entry, events, false);
  /* What its effects need to know about their targets, read once, now (CR 608.2h). */
  const outcome = beginResolution(state, script.effects, {...context, targets, facts: factsOf(state, targets)}, rng);
  events.push(...outcome.events);
  if (outcome.status === "waiting") {
    entry.stage = "resolving";
    return events;
  }
  return finishTop(state, entry, events, false);
}

/**
 * The top entry's resolution has run its last effect, after stopping to ask: it leaves the stack now.
 *
 * @returns {Array} events, or none when the top was not waiting on its own resolution
 */
export function finishResolving(state) {
  /* The one resolving, wherever it is: what it put on the stack as it resolved -- a copy -- is above it now. */
  const entry = state.stack.findLast((e) => e.stage === "resolving") ?? null;
  if (!entry || entry.stage !== "resolving" || resolutionPending(state)) return [];
  return finishTop(state, entry, [], false);
}

/* The entry leaves the stack: a permanent spell to the battlefield, an instant or sorcery (or a spell that did not
   resolve) to its owner's graveyard, and an ability to nowhere. */
function finishTop(state, entry, events, fizzled, attachTo = null) {
  /* This entry, not whatever is on top: a copy it made as it resolved is above it (pushCopy). */
  const at = state.stack.indexOf(entry);
  if (at >= 0) state.stack.splice(at, 1);

  /* A copy leaves the stack and ceases to exist (CR 707.10a, 704.5e) -- an instant's or sorcery's, or one that did not
     resolve. A copy of a permanent spell that resolves becomes a token instead, and is no longer a copy (CR 608.3f). */
  const copied = entry.objectId !== null && state.objects[entry.objectId]?.copy === true;
  if (copied && !(entry.permanent && !fizzled)) removeObject(state, entry.objectId);
  else if (copied) { state.objects[entry.objectId].token = true; delete state.objects[entry.objectId].copy; }

  if (entry.objectId !== null && state.objects[entry.objectId]) {
    const card = cardRef(state, entry.objectId);
    const owner = state.objects[entry.objectId].owner;
    /* CR 608.3: a permanent spell becomes a permanent. CR 608.2m: an instant or sorcery is put into
       its OWNER's graveyard as the final part of its resolution — not the graveyard of whoever
       cast it, which is a different player whenever a card has been borrowed. */
    /* Cast with flashback, it is exiled instead of going anywhere else (CR 702.34a): resolved, or fizzled. */
    const to = entry.permanent && !fizzled ? "battlefield" : entry.flashback || entry.graveyardToExile ? "exile" : "graveyard";
    /* CR 614.12, asked before the move: a permanent coming off the stack enters tapped or with
       counters as ONE event, and the abilities that say so are on the spell, not on anything that
       is on the battlefield yet. */
    const object = state.objects[entry.objectId];
    const entering = to === "battlefield"
      ? enteringModifications(state, {objectId: entry.objectId, player: entry.playerId,
        types: object.types, abilities: object.abilities, x: entry.x ?? 0})
      : null;
    const arrived = moveObject(state, entry.objectId, to, to === "graveyard" ? owner : null);
    /* CR 608.3a: it enters under its caster's control -- not its owner's, when a card was cast by another player (Tinybones,
       the Pickpocket casting a card from an opponent's graveyard). */
    if (to === "battlefield") state.objects[arrived].controller = entry.playerId;
    /* An Aura enters attached to what it was cast at (CR 303.4f). */
    if (to === "battlefield" && attachTo !== null && state.objects[attachTo]) {
      state.objects[arrived].attachedTo = attachTo;
      state.objects[attachTo].attachments = [...(state.objects[attachTo].attachments ?? []), arrived];
    }
    /* "When this enters, each creature gets -X/-X": the X paid stays with the permanent (CR 107.3m). */
    if (to === "battlefield" && entry.x !== undefined) state.objects[arrived].xPaid = entry.x;
    /* "If you cast a creature spell this way, it gains haste until end of turn" (rules/actions.mjs, castGains). */
    if (to === "battlefield" && (object.castGains ?? []).length)
      (state.effects ??= []).push({id: `cast-gains:${arrived}`, layer: 6, affects: {ids: [arrived]}, apply: {addKeywords: [...object.castGains]}, until: "end-of-turn", sourceController: entry.playerId});
    if (entering) {
      if (entering.tapped) state.objects[arrived].tapped = true;
      for (const ask of entering.asks ?? []) (state.enteringQuestions ??= []).push({objectId: arrived, ...ask});
      for (const [counter, count] of Object.entries(entering.counters)) {
        state.objects[arrived].counters[counter] = (state.objects[arrived].counters[counter] ?? 0) + count;
      }
    }
    events.push(event("GameEventCardChangeZone", state, {
      card,
      ...(to === "battlefield" ? {enteredAs: arrived, ...(state.objects[arrived]?.tapped ? {enteredTapped: true} : {})} : {}),
      /* What it became, on the battlefield or in the graveyard -- both public (CR 400.7e). */
      becomes: arrived,
      from: {zoneType: ZONE_LABEL.stack, player: {playerId: entry.playerId}},
      to: {zoneType: ZONE_LABEL[to], player: {playerId: to === "graveyard" ? owner : entry.playerId}},
    }));
    /* "You may have this creature enter as a copy of ...": its arrival waits for the answer (rules/entering.mjs). */
    if (to === "battlefield") holdArrival(state, arrived, events[events.length - 1]);
  }

  events.push(event("GameEventSpellResolved", state, {
    stackId: entry.stackId, abilityId: entry.abilityId, card: entry.cardId === null ? null : {cardId: entry.cardId, name: entry.name},
    playerId: entry.playerId, kind: entry.kind, hasFizzled: fizzled,
  }));
  return events;
}

/**
 * The stack as a caller may see it (§3.2.2: no caller ever receives an engine object).
 *
 * The engine's own object id is dropped, because it is the handle by which a caller could reach
 * into the state; everything the board draws is here.
 */
export function stackProjection(state) {
  /* How a spell was cast (`cast`, rules/actions.mjs) is the engine's, for its conditions: the board's contract is as it was. */
  return state.stack.map(({objectId, permanent, script, cast, ...shown}) => ({...shown}));
}
