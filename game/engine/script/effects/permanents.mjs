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
import {bindEffect, rememberNow} from "../bind.mjs";
import {amountOf} from "../amount.mjs";
import {event, cardRef} from "./zones.mjs";
import {typesOf} from "../../rules/layers.mjs";

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
  /* "A 1/1 black and green Pest creature token with 'When this token dies, you gain 1 life.'" (Strixhaven's). */
  Pest: {name: "Pest", types: ["Creature"], subtypes: ["Pest"], colors: ["B", "G"], power: 1, toughness: 1,
    abilities: [{id: "pest", kind: "triggered", text: "When this token dies, you gain 1 life.", trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "self"}, effects: [{effect: "gainLife", amount: 1}]}]},
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
   toughness, colors, its name ("except its name is Sarkhan, Soul Aflame"), an extra supertype ("except it's legendary"), its
   card types set. */
function copiable(object, except = {}) {
  const supertypes = [...new Set([...(object.supertypes ?? []).filter((t) => !(except.nonLegendary && t === "Legendary")), ...(except.addSupertypes ?? [])])];
  return {
    card: except.name ?? object.card, manaCost: object.manaCost ?? null,
    /* "It's a Vehicle artifact ... and it loses all other card types" (Imposter Mech): set, then any added. */
    types: [...new Set([...(except.setTypes ?? object.types ?? []), ...(except.addTypes ?? [])])],
    /* "It's a 2/2 black Zombie in addition to its other colors and types" (Ratadrabik): added, not set. */
    subtypes: [...new Set([...(except.setSubtypes ?? object.subtypes ?? []), ...(except.addSubtypes ?? [])])],
    ...(supertypes.length ? {supertypes} : {}),
    colors: [...new Set([...(except.setColors ?? object.colors ?? []), ...(except.addColors ?? [])])],
    keywords: [...new Set([...(object.keywords ?? []), ...(except.addKeywords ?? [])])],
    abilities: structuredClone(object.abilities ?? []),
    power: except.setPower ?? object.power ?? null, toughness: except.setToughness ?? object.toughness ?? null,
    ...(object.spell ? {spell: structuredClone(object.spell)} : {}),
    ...(object.enchant ? {enchant: structuredClone(object.enchant)} : {}),
  };
}

/* WHO A CREATURE PUT ONTO THE BATTLEFIELD ATTACKING MAY ATTACK (CR 508.4): a defending player -- and where every opponent
   is one (Commander's attack multiple players option, CR 802.2), each opponent still in the game, in turn order. */
export function defendingPlayers(state, controller) {
  const seats = state.players.map((p) => p.id), from = seats.indexOf(controller);
  return [...seats.slice(from + 1), ...seats.slice(0, from)].filter((id) => !state.players[id].lost);
}

/* It attacks that player in this combat: never declared as an attacker (CR 508.4: no "whenever ... attacks" for it), and
   blocked or not as the combat goes. The player defends now, so they declare blockers. */
export function joinAttack(state, id, player) {
  state.combat.attacks.push({attacker: id, defender: player, blocked: false, blockers: []});
  if (!state.combat.defenders.includes(player)) state.combat.defenders.push(player);
}

/**
 * "Tapped and attacking" (CR 508.4; Forge's TokenAttacking) -- `attacking` on what makes or moves permanents: "that
 * player", the one the ability is about (Adeline's "attacking that player", ninjutsu's returned attacker's); `true`, the
 * defending player its controller chooses as it enters -- the only one, or asked, a creature at a time (asking.mjs,
 * attackWhom). Only in a combat, only a creature, and only the attacking player's (CR 506.3a-b); a player no longer in
 * the game is attacked by nothing (CR 508.4a).
 */
export function enterAttacking(state, ids, whom, context, controller) {
  if (!state.combat || state.combat.attackingPlayerId !== controller) return;
  const creatures = ids.filter((id) => state.objects[id]?.zone === "battlefield" && typesOf(state, id).includes("Creature"));
  if (!creatures.length) return;
  if (whom === "that player") {
    const player = context.about?.player;
    if (player === controller || !state.players[player] || state.players[player].lost) return;
    for (const id of creatures) joinAttack(state, id, player);
    return;
  }
  const players = defendingPlayers(state, controller);
  if (!players.length) return;
  /* One defending player, or an effect run outside a resolution with no one to ask: the first in turn order. */
  if (players.length === 1 || !state.resolving) { for (const id of creatures) joinAttack(state, id, players[0]); return; }
  /* Asked next, before the rest of what the ability does. */
  state.resolving.queue.unshift({effect: "attackWhom", tokens: creatures, player: controller});
}

/**
 * What permanents just put onto the battlefield gain -- "it gains haste until end of turn", "that creature gains haste"
 * -- and "sacrifice it at the beginning of the next end step", a delayed trigger that remembers them. Shared by token
 * copies, a card put onto the battlefield from a hand or a library (zones.mjs, asking.mjs) and a mass return.
 */
export function afterwards(state, ids, params, context) {
  const made = ids.filter((id) => state.objects[id]?.zone === "battlefield");
  if (!made.length) return;
  const controller = params.controller === undefined || params.controller === "you" ? context.controller : params.controller;
  if (params.gainsUntilEndOfTurn) pushEffect(state, {id: `gains:${context.source ?? "effect"}`, layer: 6, affects: {ids: made},
    apply: {addKeywords: params.gainsUntilEndOfTurn}, until: "end-of-turn", sourceController: controller});
  if (params.gains) pushEffect(state, {id: `gains-always:${context.source ?? "effect"}`, layer: 6, affects: {ids: made},
    apply: {addKeywords: params.gains}, until: "leaves", sourceController: controller});
  /* "If it would leave the battlefield, exile it instead of putting it anywhere else" (effects/zones.mjs, moveOne). */
  if (params.exileIfLeaves) for (const id of made) state.objects[id].exileIfLeaves = true;
  if (params.atEndStep) delayedTrigger(state, {at: "end step", text: params.atEndStep === "exile" ? "Exile it at the beginning of the next end step." : "Sacrifice it at the beginning of the next end step.",
    effects: [{effect: "moveZone", targets: made, to: params.atEndStep === "exile" ? "exile" : "graveyard", ...(params.atEndStep === "exile" ? {} : {sacrifice: true})}]}, context);
  /* "Tapped and attacking" (Leonin Warleader's Cats, a ninja put onto the battlefield). */
  if (params.attacking) enterAttacking(state, made, params.attacking, context, controller);
  /* "Return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)" (the Enduring
     cycle): its card types from now on, as long as it is this object (CR 205.1a, layer 4). */
  if (params.setTypes) pushEffect(state, {id: `types:${context.source ?? "effect"}`, layer: 4, affects: {ids: made}, apply: {setTypes: params.setTypes}, until: null, sourceController: controller});
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
        card: cardRef(state, copy), enteredAs: copy, becomes: copy, ...(state.objects[copy]?.tapped ? {enteredTapped: true} : {}),
        from: {zoneType: null, player: {playerId: controller}}, to: {zoneType: "Battlefield", player: {playerId: controller}}, createdAsToken: true,
      }));
    }
  }
  afterwards(state, made, {...params, controller}, context);
  return made;
}

/** `copyPermanent` — "create a token that's a copy of target creature you control" (CR 707.2), or one of each a selector matches ("for each token you control"). */
export function copyPermanent(state, params, context) {
  const events = [];
  const originals = params.selector ? selectMatching(state, params.selector, context) : (params.targets ?? []);
  makeCopies(state, originals, params, context, events);
  return events;
}

/**
 * `becomeCopy` -- "this land becomes a copy of target land" (Thespian's Stage), "... until end of turn" (Mirage Mirror):
 * CR 707.2, layer 1 (CR 613.1a).
 *
 * `targets`, the object copied, first of them: its copiable values as they are now -- its own, or what a copy effect
 * made them (CR 707.3) -- a permanent or a card elsewhere ("target creature card in your graveyard"). The source is what
 * becomes the copy. `until` "end-of-turn", or for good. `except` as a token copy's (copiable), and `keep`: the ids of its own abilities it keeps ("except it has
 * this ability").
 *
 * THE VALUES ARE WRITTEN ONTO THE PERMANENT, ITS OWN KEPT BESIDE THEM (`uncopied`), so everything that reads a
 * permanent's name, types, abilities and printed power and toughness -- the layers, the triggers, the offers -- reads the
 * copy without knowing there is one. The latest copy effect is the one that shows (CR 613.7); when it ends the one before
 * it shows again, and with none left the permanent is its own again. Leaving the battlefield ends them all: a card moves
 * as itself (state/index.mjs, moveObject; CR 400.7).
 */
export const COPY_KEYS = Object.freeze(["card", "manaCost", "types", "subtypes", "supertypes", "colors", "keywords", "abilities", "power", "toughness", "spell", "enchant"]);
const ownValues = (object) => Object.fromEntries(COPY_KEYS.map((key) => [key, object[key] === undefined ? undefined : structuredClone(object[key])]));
function showCopy(object) {
  const latest = (object.copyEffects ?? []).at(-1);
  const values = latest ? latest.values : object.uncopied;
  for (const key of COPY_KEYS) {
    if (values[key] === undefined) delete object[key];
    else object[key] = structuredClone(values[key]);
  }
  if (!latest) { delete object.uncopied; delete object.copyEffects; }
}
/** The permanent `id` becomes a copy of `fromId` (becomeCopy; and entering as a copy, rules/entering.mjs). @returns {boolean} whether it did */
export function copyOnto(state, id, fromId, {except = {}, keep = [], until = null} = {}) {
  const from = state.objects[fromId], object = state.objects[id];
  if (!from || !object || object.zone !== "battlefield") return false;
  object.uncopied ??= ownValues(object);
  const values = copiable(from, except);
  /* "Except it has this ability": its own, renamed so an id the copy also has does not answer for it. */
  for (const ability of (object.uncopied.abilities ?? []).filter((a) => keep.includes(a.id))) values.abilities.push({...structuredClone(ability), id: `kept-${ability.id}`});
  (object.copyEffects ??= []).push({values, until});
  showCopy(object);
  return true;
}
export function becomeCopy(state, params, context) {
  copyOnto(state, context.source, (params.targets ?? [])[0], {except: params.except ?? {}, keep: params.keep ?? [], until: params.until ?? null});
  return [];
}
/** "Until end of turn": those copy effects end (rules/turn.mjs, the cleanup step). */
export function endCopies(state) {
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (!(object.copyEffects ?? []).some((c) => c.until === "end-of-turn")) continue;
    object.copyEffects = object.copyEffects.filter((c) => c.until !== "end-of-turn");
    showCopy(object);
  }
}

/** `createToken` — CR 111. */
export function createToken(state, params, context) {
  const events = [];
  const spec = params.token?.predefined ? PREDEFINED_TOKENS[params.token.predefined] : params.token ?? {};
  if (!spec) throw new Error(`No predefined token named ${params.token.predefined}`);
  const count = params.count ?? 1;
  const controller = params.controller ?? context.controller;
  /* A target player who is no longer one creates nothing. */
  if (!state.players[controller]) return events;
  const made = [];
  /* "An X/X green Dinosaur Beast ... where X is the amount of damage those creatures dealt" (Quartzwood Crasher): its size
     counted as it is made. */
  const sized = (value) => (value !== null && typeof value === "object" ? amountOf(state, value, context) : value ?? null);
  for (let i = 0; i < count; i += 1) {
    const id = addObject(state, {
      card: spec.name ?? "Token",
      types: spec.types ?? ["Creature"],
      /* A Goblin token is a Goblin (CR 111.4): "sacrifice a Goblin" has to find it. */
      subtypes: spec.subtypes ?? [],
      /* "A 1/1 red Elemental" is red (CR 111.4): "white creatures you control" has to find a white token. */
      colors: spec.colors ?? [],
      power: sized(spec.power),
      toughness: sized(spec.toughness),
      keywords: spec.keywords ?? [],
      abilities: spec.abilities ?? [],
      owner: controller,
      controller,
      token: true,
    }, "battlefield");
    /* "Create a tapped Treasure token": the effect says so as well as a spec can. */
    if (spec.tapped || params.tapped) state.objects[id].tapped = true;
    events.push(event("GameEventCardChangeZone", state, {
      card: cardRef(state, id),
      /* The token is the object that arrived: "for each of them, create a token that's a copy of it" names it. */
      becomes: id, ...(state.objects[id]?.tapped ? {enteredTapped: true} : {}),
      from: {zoneType: null, player: {playerId: controller}},
      to: {zoneType: "Battlefield", player: {playerId: controller}},
      createdAsToken: true,
    }));
    made.push(id);
  }
  /* "They gain haste until end of turn" (Ovika), and the rest a made permanent may gain (afterwards). */
  afterwards(state, made, {...params, controller}, context);
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

/**
 * `earthbend` -- "Earthbend N: target land you control becomes a 0/0 creature with haste that's still a land. Put N +1/+1
 * counters on it. When it dies or is exiled, return it to the battlefield tapped" (Forge's Earthbend): for good, the
 * land's own (`targets`), `count` the counters; the return a delayed trigger waiting on that permanent (CR 603.7).
 */
export function earthbend(state, params, context) {
  const events = [];
  for (const id of (params.targets ?? []).filter((t) => state.objects[t]?.zone === "battlefield")) {
    animate(state, {targets: [id], addTypes: ["Creature"], power: 0, toughness: 0}, context);
    pushEffect(state, {id: `earthbend:${id}`, layer: 6, affects: {ids: [id]}, apply: {addKeywords: ["Haste"]}, until: null, sourceController: context.controller});
    const count = params.count ?? 1;
    if (count > 0) {
      const before = state.objects[id].counters["+1/+1"] ?? 0;
      state.objects[id].counters["+1/+1"] = before + count;
      events.push(event("GameEventCardCounters", state, {card: cardRef(state, id), type: "+1/+1", oldValue: before, newValue: before + count}));
    }
    const back = [{effect: "moveZone", targets: "that card", to: "battlefield", tapped: true}];
    for (const to of ["Graveyard", "Exile"])
      delayedTrigger(state, {on: {on: "GameEventCardChangeZone", from: "Battlefield", to, who: "any"}, watch: [id], text: "When it dies or is exiled, return it to the battlefield tapped.", effects: back}, context);
  }
  return events;
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
  /* "Prevent all damage that would be dealt to those permanents this turn" (Mutational Advantage): the same set, for the
     effects after this one to name as "remembered" (script/bind.mjs). */
  if (params.remember) context.remembered = ids.slice();
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
/* What a selector names now, a choice of alternatives (`anyOf`) each with what they share. */
function fixedAt(state, selector, context) {
  const {anyOf, ...shared} = selector;
  const each = Array.isArray(anyOf) ? anyOf.map((one) => ({...shared, ...one})) : [selector];
  return [...new Set(each.flatMap((one) => selectMatching(state, one, context)))];
}

export function effectUntil(state, params, context) {
  pushEffect(state, {
    id: params.id ?? `effect:${context.source ?? "effect"}`,
    /* A rule changed for a while ("can't be blocked this turn", rules/statics.mjs), or a characteristic, in a layer. */
    ...(params.rule ? {rule: params.rule} : {layer: params.layer ?? 6, sublayer: params.sublayer}),
    /* `selector`: what it affects, fixed as it resolves (CR 611.2c) -- "each instant and sorcery card in your graveyard
       gains flashback until end of turn" does not reach a card put there later. A choice (`anyOf`) is each of them. */
    affects: params.targets ? {ids: params.targets} : params.selector ? {ids: fixedAt(state, params.selector, context)} : params.affects ?? {what: "permanent"},
    apply: params.apply ?? {},
    until: params.until ?? "end-of-turn",
    sourceController: context.controller,
  });
  return [];
}

/**
 * `gainControl` -- CR 613.1b: "gain control of target creature until end of turn", "untap all creatures and gain control
 * of them" (`selector`, fixed as it resolves), "target opponent gains control of this creature" (`toPlayer`). For good
 * unless `until` says "end-of-turn". The permanent's controller itself changes -- the projection, its triggers, a choice
 * of "a creature you control" all read it -- and for a turn a `control-returns` record gives it back as the turn ends
 * (rules/turn.mjs). It has changed controller, so it is summoning sick for its new controller unless it has haste
 * (CR 302.6), and again for its old one when it returns.
 */
export function gainControl(state, params, context) {
  const to = Number.isInteger(params.toPlayer) ? params.toPlayer : context.controller;
  const ids = (params.selector ? selectMatching(state, params.selector, context) : params.targets ?? []).filter((id) => state.objects[id]?.zone === "battlefield");
  for (const id of ids) {
    const object = state.objects[id];
    if (params.until === "end-of-turn" && object.controller !== to)
      (state.effects ??= []).push({id: `control-returns:${id}:${state.effects.length}`, rule: "control-returns", affects: {ids: [id]}, apply: {controller: object.controller}, until: "end-of-turn", sourceController: context.controller});
    if (object.controller !== to) object.controlledSinceTurn = state.turn;
    object.controller = to;
  }
  return [];
}

/**
 * `goad` -- "goad target creature", "goad all creatures you don't control" (CR 701.15; Forge's Goad): until this effect's
 * controller's next turn, each creature it names (`targets`, or every one `selector` describes, fixed as it resolves)
 * attacks each combat if able and attacks a player other than its goader if able (rules/combat.mjs). Goaded again by the
 * same player, nothing more (CR 701.15b); by two players, it avoids both if it can.
 */
export function goad(state, params, context) {
  const ids = (params.selector ? selectMatching(state, params.selector, context) : params.targets ?? []).filter((id) => state.objects[id]?.zone === "battlefield");
  if (ids.length) (state.effects ??= []).push({id: `goad:${context.source ?? "effect"}:${state.effects.length}`, rule: "goaded", affects: {ids}, until: "your-next-turn", sourceController: context.controller});
  return [];
}

/**
 * `regenerate` -- CR 701.19a: a regeneration shield on each target (or each permanent `selector` describes, fixed as it
 * resolves: "regenerate each creature you control"), until end of turn. rules/replacement.mjs `regenerated` uses one up.
 */
export function regenerate(state, params, context) {
  const ids = params.selector ? selectMatching(state, params.selector, context) : params.targets ?? [];
  for (const id of ids) {
    if (!state.objects[id] || state.objects[id].zone !== "battlefield") continue;
    (state.effects ??= []).push({id: `regeneration:${id}:${(state.effects ?? []).length}`, rule: "regeneration", affects: {ids: [id]}, until: "end-of-turn", sourceController: context.controller});
  }
  return [];
}

/* The steps of each phase an effect may add (CR 500.8), by name: a combat phase; a main phase (after a combat, a
   postcombat one, CR 505.1a); a beginning phase. And the step a phase ends with, which the added ones follow. */
const ADDED_STEPS = Object.freeze({
  combat: ["COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS", "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END"],
  main: ["MAIN2"],
  beginning: ["UNTAP", "UPKEEP", "DRAW"],
});
export const ADDED_PHASES = Object.freeze(Object.keys(ADDED_STEPS));
const endOfPhase = (step) => (["UNTAP", "UPKEEP", "DRAW"].includes(step) ? "DRAW" : String(step).startsWith("COMBAT") ? "COMBAT_END"
  : step === "END_OF_TURN" ? "CLEANUP" : step);

/**
 * `addPhase` — CR 500.8: "after this main phase, there is an additional combat phase followed by an additional main
 * phase" (`phases: ["combat", "main"]`), "after this phase, there is an additional combat phase", "an additional
 * beginning phase after this phase". Remembered on the state for this turn, after the phase now under way; rules/turn.mjs
 * puts the steps there, the most recently added first, and then goes on from where the turn was.
 */
export function addPhase(state, params, context) {
  const steps = (params.phases ?? ["combat"]).flatMap((kind) => ADDED_STEPS[kind] ?? []);
  if (steps.length) (state.extraPhases ??= []).push({turn: state.turn, after: endOfPhase(state.phase), steps});
  void context;
  return [];
}

/**
 * `delayedTrigger` — CR 603.7, something that will happen later.
 *
 * Created by a resolving effect and fired when its moment arrives. Held on the state so a
 * checkpoint carries it: a delayed trigger lost in a save is a promise the game made and did not
 * keep, with nothing to show it ever existed.
 *
 * WHEN: `at` "end step" (the next end step's beginning) or "upkeep" (the next turn's upkeep), or `on`, an event, in
 * the words a triggered ability uses (cards/index.mjs compiles a script's `when`) -- "when that creature dies this
 * turn" with `watch` the object it waits on, "whenever a creature dies this turn" with none. One that waits for an
 * event triggers once unless it has a duration (`thisTurn`, CR 603.7b), and never on what happened before it was
 * made (CR 603.7a): it is `fresh` until the action that made it has been read for triggers (rules/trigger.mjs).
 * WHAT: its effects, with every reference remembered now (script/bind.mjs, rememberNow; CR 603.7c).
 */
export function delayedTrigger(state, params, context) {
  if (!state.delayedTriggers) state.delayedTriggers = [];
  const waits = Boolean(params.on);
  /* "That creature": the object, now; gone already, and the trigger waits on nothing (CR 603.7a's example). */
  const watch = waits && params.watch !== undefined ? ((bindEffect({targets: params.watch}, context).targets ?? [])[0] ?? null) : undefined;
  state.delayedTriggers.push({
    ...(waits ? {on: structuredClone(params.on), ...(watch !== undefined ? {watch} : {}), ...(params.thisTurn ? {thisTurn: true} : {}), ...(params.once ? {once: true} : {}), fresh: true}
      : {at: params.at ?? "end step"}),
    controller: context.controller,
    source: context.source ?? null,
    effects: rememberNow(params.effects ?? [], context, {keepThat: waits}),
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
