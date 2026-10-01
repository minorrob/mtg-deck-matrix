/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EFFECT PRIMITIVES THAT MAKE OR CHANGE PERMANENTS.
 *
 * `docs/engine/PLAN.md` §12.2, the Permanents, Modifiers and Flow families. Seven of the measured
 * top twenty-five, including `Token` at 67 uses — Rob's decks make a lot of things.
 *
 * NOTHING HERE WRITES A CHANGE INTO THE CARD. A pump, an animation and a granted keyword are
 * continuous effects with a duration (CR 611), pushed onto `state.effects` for the layer system to
 * apply. Adding two to a creature's stored power would produce a pump that never wears off, could
 * not be ordered against a later effect, and would leave no way to ask what the creature is without
 * it — which is the question the next effect has to ask. 1.8 exists so that these are four lines
 * each instead of a bookkeeping problem.
 *
 * A TOKEN IS AN OBJECT LIKE ANY OTHER, except that it ceases to exist the moment it leaves the
 * battlefield (CR 704.5d), which state-based actions already handle. It is created with `token:
 * true` and nothing else here treats it specially.
 */

import {addObject} from "../../state/index.mjs";
import {selectMatching} from "../filter.mjs";
import {event, cardRef} from "./zones.mjs";

/* A continuous effect needs a timestamp to be ordered by (CR 613.7), and it has to be part of the
   state so a checkpoint carries it. The state's own counter is the right source: it is monotonic
   and a replay assigns the same numbers. */
function pushEffect(state, effect) {
  if (!state.effects) state.effects = [];
  const timestamp = state.nextTimestamp;
  state.nextTimestamp += 1;
  state.effects.push({...effect, timestamp});
  return timestamp;
}

/** `createToken` — CR 111. */
export function createToken(state, params, context) {
  const events = [];
  const spec = params.token ?? {};
  const count = params.count ?? 1;
  const controller = params.controller ?? context.controller;
  for (let i = 0; i < count; i += 1) {
    const id = addObject(state, {
      card: spec.name ?? "Token",
      types: spec.types ?? ["Creature"],
      /* A Goblin token is a Goblin (CR 111.4): "sacrifice a Goblin" has to find it. */
      subtypes: spec.subtypes ?? [],
      power: spec.power ?? null,
      toughness: spec.toughness ?? null,
      keywords: spec.keywords ?? [],
      abilities: spec.abilities ?? [],
      owner: controller,
      controller,
      token: true,
    }, "battlefield");
    if (spec.tapped) state.objects[id].tapped = true;
    events.push(event("GameEventCardChangeZone", state, {
      card: cardRef(state, id),
      from: {zoneType: null, player: {playerId: controller}},
      to: {zoneType: "Battlefield", player: {playerId: controller}},
      createdAsToken: true,
    }));
  }
  return events;
}

/**
 * `animate` — a land or artifact becomes a creature.
 *
 * Two layers at once, which is why it is one primitive and not two effects: the type change is
 * layer 4 and the power and toughness are layer 7b, and CR 613 applies them in that order whatever
 * the card's wording. Splitting it into a caller's responsibility would let somebody emit them with
 * the wrong layers and get a land that is a creature with no body.
 */
export function animate(state, params, context) {
  const affects = {ids: params.targets ?? []};
  pushEffect(state, {
    id: `animate:${context.source ?? "effect"}`,
    layer: 4, affects,
    apply: {addTypes: params.addTypes ?? ["Creature"], ...(params.subtypes ? {addTypes: [...(params.addTypes ?? ["Creature"]), ...params.subtypes]} : {})},
    until: params.until ?? null,
    sourceController: context.controller,
  });
  if (Number.isInteger(params.power) || Number.isInteger(params.toughness)) {
    pushEffect(state, {
      id: `animate-pt:${context.source ?? "effect"}`,
      layer: 7, sublayer: "b", affects,
      apply: {setPower: params.power, setToughness: params.toughness},
      until: params.until ?? null,
      sourceController: context.controller,
    });
  }
  return [];
}

/** `animateAll` — the same over a selector. */
export function animateAll(state, params, context) {
  return animate(state, {...params, targets: selectMatching(state, params.selector ?? {what: "permanent"}, context)}, context);
}

/**
 * `pump` — +N/+N until a duration.
 *
 * Layer 7c, which is what makes "becomes 1/1" then "+2/+2" a 3/3 whichever was played first. The
 * state's printed power is untouched, so when the duration ends the effect is simply dropped and
 * there is nothing to undo.
 */
export function pump(state, params, context) {
  pushEffect(state, {
    id: `pump:${context.source ?? "effect"}`,
    layer: 7, sublayer: "c", affects: {ids: params.targets ?? []},
    apply: {
      power: params.power ?? 0, toughness: params.toughness ?? 0,
      ...(params.keywords ? {addKeywords: params.keywords} : {}),
    },
    until: params.until ?? "end-of-turn",
    sourceController: context.controller,
  });
  return [];
}

/** `pumpAll` — the same over a selector, as one effect rather than one per creature. */
export function pumpAll(state, params, context) {
  pushEffect(state, {
    id: `pumpAll:${context.source ?? "effect"}`,
    layer: 7, sublayer: "c", affects: params.selector ?? {what: "permanent"},
    apply: {
      power: params.power ?? 0, toughness: params.toughness ?? 0,
      ...(params.keywords ? {addKeywords: params.keywords} : {}),
    },
    until: params.until ?? "end-of-turn",
    sourceController: context.controller,
  });
  return [];
}

/**
 * `effectUntil` — a temporary static ability.
 *
 * The general form the other three are special cases of: any layer, any selector, any change, for a
 * duration. `Effect` is 16 of the 821 uses in Rob's decks, and it is how a card says something the
 * narrower primitives cannot.
 */
export function effectUntil(state, params, context) {
  pushEffect(state, {
    id: params.id ?? `effect:${context.source ?? "effect"}`,
    layer: params.layer ?? 6,
    sublayer: params.sublayer,
    affects: params.affects ?? {what: "permanent"},
    apply: params.apply ?? {},
    until: params.until ?? "end-of-turn",
    sourceController: context.controller,
  });
  return [];
}

/**
 * `delayedTrigger` — CR 603.7, something that will happen later.
 *
 * Created by a resolving effect and fired when its moment arrives. Held on the state so a
 * checkpoint carries it: a delayed trigger lost in a save is a promise the game made and did not
 * keep, with nothing to show it ever existed.
 */
export function delayedTrigger(state, params, context) {
  if (!state.delayedTriggers) state.delayedTriggers = [];
  state.delayedTriggers.push({
    at: params.at ?? "end step",
    controller: context.controller,
    source: context.source ?? null,
    effects: structuredClone(params.effects ?? []),
    text: params.text ?? null,
  });
  return [];
}

/**
 * `cleanup` — end-of-effect bookkeeping.
 *
 * §12.2 calls this out as "not a card-visible primitive", and it is 41 of the 821 uses: Forge emits
 * it to forget remembered objects after a resolution. It does nothing a player can see, which is
 * exactly why it is here rather than left out — the schema would otherwise refuse a name the
 * compiler emits on a third of the cards.
 */
export function cleanup(state, params, context) {
  if (context.remembered && Array.isArray(params.forget)) {
    for (const key of params.forget) delete context.remembered[key];
  }
  void state;
  return [];
}
