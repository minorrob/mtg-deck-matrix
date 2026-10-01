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

/* Predefined tokens (CR 111.10): what "a Treasure token" is, so a card need only name it. */
export const PREDEFINED_TOKENS = Object.freeze({
  /* CR 111.10a */
  Treasure: {name: "Treasure", types: ["Artifact"], subtypes: ["Treasure"],
    abilities: [{id: "treasure", kind: "mana", tapSelf: true, anyColor: true, sacrificeSelf: true, text: "{T}, Sacrifice this artifact: Add one mana of any color."}]},
  /* CR 111.10b */
  Food: {name: "Food", types: ["Artifact"], subtypes: ["Food"],
    abilities: [{id: "food", kind: "activated", text: "{2}, {T}, Sacrifice this artifact: You gain 3 life.", targets: [],
      cost: [{atom: "mana", cost: "{2}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}], effects: [{effect: "gainLife", amount: 3}]}]},
  /* CR 111.10f */
  Clue: {name: "Clue", types: ["Artifact"], subtypes: ["Clue"],
    abilities: [{id: "clue", kind: "activated", text: "{2}, Sacrifice this artifact: Draw a card.", targets: [],
      cost: [{atom: "mana", cost: "{2}"}, {atom: "sacrifice", self: true}], effects: [{effect: "draw", count: 1}]}]},
});

/**
 * `attach` — CR 701.3: the source (an Equipment) taken from whatever it was attached to and put onto the target.
 * Equip is "[Cost]: Attach this permanent to target creature you control. Activate only as a sorcery." (CR 702.6a).
 */
export function attach(state, params, context) {
  const events = [];
  const sourceId = params.source ?? context.source;
  const source = sourceId === null || sourceId === undefined ? null : state.objects[sourceId];
  const [hostId] = params.targets ?? [];
  const host = hostId === undefined ? null : state.objects[hostId];
  if (!source || !host || source.zone !== "battlefield" || host.zone !== "battlefield" || sourceId === hostId) return events;
  /* CR 701.3b: attaching it to what it is already attached to does nothing. */
  if (source.attachedTo === hostId) return events;
  const before = source.attachedTo !== null && source.attachedTo !== undefined ? state.objects[source.attachedTo] : null;
  if (before) before.attachments = (before.attachments ?? []).filter((id) => id !== sourceId);
  source.attachedTo = hostId;
  host.attachments = [...(host.attachments ?? []), sourceId];
  events.push(event("GameEventCardAttachment", state, {card: cardRef(state, sourceId), attachedTo: cardRef(state, hostId)}));
  return events;
}

/* COPIABLE VALUES (CR 707.2): what a copy of a permanent copies -- its name, mana cost, colors, types, subtypes,
   supertypes, rules text and printed power and toughness, which is what the state holds (the layers derive the rest),
   and never its counters, damage, tapped state or the effects on it. A copy of a token that is itself a copy copies the
   copy (CR 707.3). `except` is the card's "except ..." (CR 707.9): not legendary, an extra type, keywords, power and
   toughness, colors. */
function copiable(object, except = {}) {
  const supertypes = (object.supertypes ?? []).filter((t) => !(except.nonLegendary && t === "Legendary"));
  return {
    card: object.card, manaCost: object.manaCost ?? null,
    types: [...new Set([...(object.types ?? []), ...(except.addTypes ?? [])])],
    subtypes: [...(except.setSubtypes ?? object.subtypes ?? [])],
    ...(supertypes.length ? {supertypes} : {}),
    colors: [...(except.setColors ?? object.colors ?? [])],
    keywords: [...new Set([...(object.keywords ?? []), ...(except.addKeywords ?? [])])],
    abilities: structuredClone(object.abilities ?? []),
    power: except.setPower ?? object.power ?? null, toughness: except.setToughness ?? object.toughness ?? null,
    ...(object.spell ? {spell: structuredClone(object.spell)} : {}),
    ...(object.enchant ? {enchant: structuredClone(object.enchant)} : {}),
  };
}

/**
 * Make token copies of permanents (CR 707.2, 111.4): `count` of each, under `controller` (the effect's, unless said);
 * "it gains haste until end of turn" (`gainsUntilEndOfTurn`), "that token gains haste" (`gains`, for as long as it
 * lasts), and "sacrifice it at the beginning of the next end step"
 * (`atEndStep`), a delayed trigger that remembers the tokens made. Shared by copyPermanent and populate.
 */
export function makeCopies(state, ids, params, context, events) {
  const controller = params.controller ?? context.controller;
  const made = [];
  for (const id of ids) {
    const original = state.objects[id];
    if (!original) continue;
    for (let i = 0; i < (params.count ?? 1); i += 1) {
      const copy = addObject(state, {...copiable(original, params.except), owner: controller, controller, token: true}, "battlefield");
      if (params.tapped) state.objects[copy].tapped = true;
      made.push(copy);
      events.push(event("GameEventCardChangeZone", state, {
        card: cardRef(state, copy), enteredAs: copy,
        from: {zoneType: null, player: {playerId: controller}}, to: {zoneType: "Battlefield", player: {playerId: controller}}, createdAsToken: true,
      }));
    }
  }
  if (made.length && params.gainsUntilEndOfTurn) pushEffect(state, {id: `copy-gains:${context.source ?? "effect"}`, layer: 6, affects: {ids: made},
    apply: {addKeywords: params.gainsUntilEndOfTurn}, until: "end-of-turn", sourceController: controller});
  /* "That token gains haste": an effect on the token, with no end -- it lasts while the token does. */
  if (made.length && params.gains) pushEffect(state, {id: `copy-gains-always:${context.source ?? "effect"}`, layer: 6, affects: {ids: made},
    apply: {addKeywords: params.gains}, until: "leaves", sourceController: controller});
  if (made.length && params.atEndStep) delayedTrigger(state, {at: "end step", text: params.atEndStep === "exile" ? "Exile it at the beginning of the next end step." : "Sacrifice it at the beginning of the next end step.",
    effects: [{effect: "moveZone", targets: made, to: params.atEndStep === "exile" ? "exile" : "graveyard"}]}, context);
  return made;
}

/** `copyPermanent` — "create a token that's a copy of target creature you control" (CR 707.2), or one of each a selector matches ("for each token you control"). */
export function copyPermanent(state, params, context) {
  const events = [];
  const originals = params.selector ? selectMatching(state, params.selector, context) : (params.targets ?? []);
  makeCopies(state, originals, params, context, events);
  return events;
}

/** `createToken` — CR 111. */
export function createToken(state, params, context) {
  const events = [];
  const spec = params.token?.predefined ? PREDEFINED_TOKENS[params.token.predefined] : params.token ?? {};
  if (!spec) throw new Error(`No predefined token named ${params.token.predefined}`);
  const count = params.count ?? 1;
  const controller = params.controller ?? context.controller;
  for (let i = 0; i < count; i += 1) {
    const id = addObject(state, {
      card: spec.name ?? "Token",
      types: spec.types ?? ["Creature"],
      /* A Goblin token is a Goblin (CR 111.4): "sacrifice a Goblin" has to find it. */
      subtypes: spec.subtypes ?? [],
      /* "A 1/1 red Elemental" is red (CR 111.4): "white creatures you control" has to find a white token. */
      colors: spec.colors ?? [],
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
  /* CR 611.2c: the set of objects a resolving spell's continuous effect changes is fixed as it begins. "Permanents you
     control gain indestructible until end of turn" protects the ones there now, not one that enters later. */
  const ids = selectMatching(state, params.selector ?? {what: "permanent"}, context);
  pushEffect(state, {
    id: `pumpAll:${context.source ?? "effect"}`,
    layer: 7, sublayer: "c", affects: {ids},
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
