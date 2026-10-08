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

import {addObject, transformObject, rememberExileLooker} from "../../state/index.mjs";
import {selectMatching, compileSelector} from "../filter.mjs";
import {bindEffect, rememberNow} from "../bind.mjs";
import {amountOf} from "../amount.mjs";
import {event, cardRef} from "./zones.mjs";
import {typesOf, controllerOf} from "../../rules/layers.mjs";
import {protectedFrom} from "../../rules/protection.mjs";
import {manaValue, parseManaCost} from "../../rules/mana.mjs";
import {countersPlaced} from "../../rules/statics.mjs";

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
  /* EMPOWER JACE's token (the live-game plan of 2026-10-04): "a blue Jace planeswalker token with '[-1]: Surveil 1' and
     '[-3]: Draw a card.'" -- no printed loyalty, so it enters with none and the empower puts its counters on (CR 306.5b is a
     printed loyalty's; script/resolution.mjs). Its abilities as a card's are compiled (cards/index.mjs, a loyalty cost). */
  Jace: {name: "Jace", types: ["Planeswalker"], subtypes: ["Jace"], colors: ["U"],
    abilities: [
      {id: "jace-surveil", kind: "activated", text: "\u22121: Surveil 1.", targets: [], loyalty: -1, timing: "sorcery",
        cost: [{atom: "removeCounters", self: true, counter: "loyalty", count: 1}], effects: [{effect: "surveil", count: 1}]},
      {id: "jace-draw", kind: "activated", text: "\u22123: Draw a card.", targets: [], loyalty: -3, timing: "sorcery",
        cost: [{atom: "removeCounters", self: true, counter: "loyalty", count: 3}], effects: [{effect: "draw", count: 1}]},
    ]},
  /* CR 111.10v (Splinter, the Mentor) */
  Mutagen: {name: "Mutagen", types: ["Artifact"], subtypes: ["Mutagen"],
    abilities: [{id: "mutagen", kind: "activated", text: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.",
      timing: "sorcery", targets: [{what: "permanent", types: ["Creature"]}],
      cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}], effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: 1}]}]},
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
  /* Protection (CR 702.16c-d): not equipped or enchanted by a permanent with the quality -- it does not move. */
  if (protectedFrom(state, {card: hostId}, sourceId)) return events;
  const before = source.attachedTo !== null && source.attachedTo !== undefined ? state.objects[source.attachedTo] : null;
  if (before) before.attachments = (before.attachments ?? []).filter((id) => id !== sourceId);
  source.attachedTo = hostId;
  host.attachments = [...(host.attachments ?? []), sourceId];
  events.push(event("GameEventCardAttachment", state, {card: cardRef(state, sourceId), attachedTo: cardRef(state, hostId)}));
  return events;
}

/* AN AURA THAT ENTERS WITHOUT BEING CAST (CR 303.4f, batch 70): a token copy of an Aura (Yenna, Redtooth Regent), an Aura
   card returned from a graveyard (Sun Titan, Sevinne's Reclamation). Its controller chooses what it will enchant as it
   enters -- anything its Enchant could enchant, which is not targeting, so hexproof does not stop it; asked before it is
   on the battlefield, so never itself (CR 303.4d). With nothing to enchant it does not enter: a card stays where it was,
   and a token is not made (CR 303.4g). What it may enchant here are permanents; an Aura that enchants a player is not
   built, and finds nothing. */
export function enchantable(state, enchant, controller) {
  const {anyOf, ...shared} = enchant ?? {};
  const each = (Array.isArray(anyOf) ? anyOf.map((one) => ({...shared, ...one})) : [enchant ?? {}])
    .filter((one) => (one.what ?? "permanent") === "permanent")
    .map((one) => compileSelector({...one, what: "permanent"}));
  return state.zones.battlefield.filter((id) => each.some((match) => match(state, id, {controller})));
}
/* It enters attached (CR 303.4f): to the one there is, at once; with a choice, its controller is asked next, before the
   rest of what the effect does (asking.mjs, enchantWhat) -- or, with no resolution to ask in, it takes the first. */
export function enchantOnArrival(state, auraId, hosts, controller) {
  if (hosts.length === 1 || !state.resolving) { attachTo(state, auraId, hosts[0]); return; }
  state.resolving.queue.unshift({effect: "enchantWhat", aura: auraId, hosts: [...hosts], player: controller});
}
/** Attach an Aura entering the battlefield to what it enchants (CR 303.4f): no event of its own, it enters attached. */
export function attachTo(state, auraId, hostId) {
  const host = state.objects[hostId];
  state.objects[auraId].attachedTo = hostId;
  host.attachments = [...(host.attachments ?? []), auraId];
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
    /* "And it has 'When this token leaves the battlefield, ...'" (Hofri Ghostforge; CR 707.9a): abilities the copy has besides
       the original's, part of its copiable values -- compiled with the card (cards/index.mjs), bound as it is made. */
    abilities: [...structuredClone(object.abilities ?? []), ...structuredClone(except.addAbilities ?? [])],
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

/* It attacks that player in this combat -- or that planeswalker of theirs: never declared as an attacker (CR 508.4: no
   "whenever ... attacks" for it), and blocked or not as the combat goes. The player defends now, so they declare blockers. */
export function joinAttack(state, id, player, planeswalker = undefined) {
  state.combat.attacks.push({attacker: id, defender: player, ...(planeswalker !== undefined ? {planeswalker} : {}), blocked: false, blockers: []});
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
    const player = context.about?.player, planeswalker = context.about?.planeswalker;
    if (player === controller || !state.players[player] || state.players[player].lost) return;
    /* The same planeswalker (ninjutsu, CR 702.49c) -- one no longer on the battlefield, or no longer that player's, is
       attacked by nothing (CR 506.3c). */
    if (planeswalker !== undefined && !(state.objects[planeswalker] && typesOf(state, planeswalker).includes("Planeswalker") && state.objects[planeswalker].controller === player)) return;
    for (const id of creatures) joinAttack(state, id, player, planeswalker);
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
  /* "That attacks that opponent this turn if able" (encore, CR 702.141a): a requirement on them for this turn (CR 508.1d),
     the player the effect is about (rules/combat.mjs reads it). */
  if (params.mustAttack === "that player" && Number.isInteger(context.about?.player))
    pushEffect(state, {id: `must-attack:${context.source ?? "effect"}:${made.join(",")}`, rule: "must-attack", affects: {ids: made}, defender: context.about.player,
      until: "end-of-turn", sourceController: controller});
  /* "That token gains haste until end of turn and attacks this combat if able" (Legion Warboss; CR 508.1d): a requirement on
     them in this combat alone -- the combat phase under way, as rules/turn.mjs counts them -- read with the statics' "attacks each
     combat if able" (rules/statics.mjs, attacksEachCombat), and named by its source when a declaration breaks it. */
  if (params.mustAttack === "this combat")
    pushEffect(state, {id: `attacks-this-combat:${context.source ?? "effect"}:${made.join(",")}`, rule: "attacks-each-combat", affects: {ids: made},
      combat: state.combatsThisTurn ?? 0, until: "end-of-turn", sourceId: context.source ?? null, sourceName: state.objects[context.source]?.card ?? null, sourceController: controller});
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
/* WHAT A COPY'S GIVEN ABILITY REMEMBERS (CR 603.7c's sense, for an ability made with the copy): "return THE EXILED CARD to
   its owner's graveyard" (Hofri Ghostforge) -- `targets: "remembered"` in what `except.addAbilities` gives, the card the
   effect before it exiled, bound now to that object; a card that has left exile since is a new object, and nothing
   returns (CR 400.7). */
function rememberedIn(abilities, remembered) {
  const walk = (effect) => {
    if (!effect || typeof effect !== "object") return effect;
    const out = {...effect, ...(effect.targets === "remembered" ? {targets: [...(remembered ?? [])]} : {})};
    for (const key of ["effects", "then", "otherwise"]) if (Array.isArray(out[key])) out[key] = out[key].map(walk);
    return out;
  };
  return (abilities ?? []).map((ability) => ({...ability, ...(Array.isArray(ability.effects) ? {effects: ability.effects.map(walk)} : {})}));
}
export function makeCopies(state, ids, params, context, events) {
  const controller = params.controller ?? context.controller;
  const made = [];
  for (const id of ids) {
    /* "A copy of THAT CREATURE" (Hofri Ghostforge; CR 707.2, 608.2h): the creature the trigger is about, its copiable values as
       it last existed on the battlefield (`asItLastWas`) -- a creature that was copying something, or face down, is that
       (rules/layers.mjs, lastKnown's `copiable`); one that was neither, its card's own, which is where it now is. */
    const original = params.asItLastWas === true && context.about?.copiedAs && state.objects[id] ? context.about.copiedAs : state.objects[id];
    if (!original) continue;
    const except = params.except?.addAbilities ? {...params.except, addAbilities: rememberedIn(params.except.addAbilities, context.remembered)} : params.except;
    for (let i = 0; i < (params.count ?? 1); i += 1) {
      const values = copiable(original, except);
      /* A copy of an Aura enchants something as it enters, or is not made (CR 303.4f-g). */
      const hosts = values.enchant ? enchantable(state, values.enchant, controller) : null;
      if (hosts && !hosts.length) continue;
      const copy = addObject(state, {...values, owner: controller, controller, token: true}, "battlefield");
      if (hosts) enchantOnArrival(state, copy, hosts, controller);
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
  const made = makeCopies(state, originals, params, context, events);
  /* "If the token is an Aura, untap Yenna" (batch 70): the tokens made, for the effects after it. */
  if (params.remember) context.remembered = made;
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

/**
 * `investigate` — CR 701.16a: to investigate is to create a Clue token (CR 111.10f). "Investigate twice" is `count: 2`;
 * "its controller investigates" (Fateful Absence) is `controller`, as a token's: `{controllerOf: {target: 0}}`.
 */
export function investigate(state, params, context) {
  return createToken(state, {...(params.controller !== undefined ? {controller: params.controller} : {}), count: params.count ?? 1, token: {predefined: "Clue"}}, context);
}

/**
 * "THE EXILED CARD'S OWNER CREATES AN X/X BLUE ILLUSION CREATURE TOKEN, WHERE X IS THE MANA VALUE OF THE EXILED CARD"
 * (Skyclave Apparition; CR 607.2a): createToken's `linked`. What this permanent's linked ability exiled (effects/zones.mjs,
 * `link`), while each is still that card in exile (CR 400.7) -- read against the source as it last was, since its leaving
 * is what triggered this. Each player who owns one of them creates the token, X the mana values of all of them together
 * (the card's ruling of 2020-09-25; an {X} in a mana cost is 0 there, CR 202.3e) -- "X" in the token's power and
 * toughness. None there, and nobody does. Used, the link is spent.
 */
function linkedTokens(state, params, context) {
  const key = context.source ?? context.lastKnown?.cardId ?? null;
  /* A linked card that has left exile is a new object, and its id here names nothing (CR 400.7). */
  const exiled = (state.links?.[key] ?? []).filter((id) => state.objects[id]);
  if (key !== null && state.links) delete state.links[key];
  const x = exiled.reduce((n, id) => n + (state.objects[id].manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0), 0);
  const {linked: _linked, ...rest} = params;
  return [...new Set(exiled.map((id) => state.objects[id].owner))].flatMap((owner) => createToken(state, {...rest, controller: owner}, {...context, x}));
}

/** `createToken` — CR 111. */
export function createToken(state, params, context) {
  if (params.linked === true) return linkedTokens(state, params, context);
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
  /* "X/X ... where X is the mana value of the exiled card" (linkedTokens): "X", the X this effect was given. */
  const sized = (value) => (value === "X" || (value !== null && typeof value === "object") ? amountOf(state, value, context) : value ?? null);
  for (let i = 0; i < count; i += 1) {
    const id = addObject(state, {
      card: spec.name ?? "Token",
      types: spec.types ?? ["Creature"],
      /* A Goblin token is a Goblin (CR 111.4): "sacrifice a Goblin" has to find it. */
      subtypes: spec.subtypes ?? [],
      /* "Colorless snow artifact tokens named Replicated Ring" (batch 72): its supertypes (state/index.mjs keeps none empty). */
      supertypes: spec.supertypes ?? [],
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
    /* The tokens each player has made this turn ("only if you created a token this turn", Idol of Oblivion): its creator
       is its controller unless the effect says otherwise (CR 111.2). Cleared as a turn begins (rules/turn.mjs). */
    state.players[controller].tokensThisTurn = (state.players[controller].tokensThisTurn ?? 0) + 1;
  }
  /* "They gain haste until end of turn" (Ovika), and the rest a made permanent may gain (afterwards). */
  afterwards(state, made, {...params, controller}, context);
  /* "Create X 1/1 white Soldier creature tokens. If X is 5 or more, destroy all OTHER creatures" (Martial Coup): the
     tokens this made, for the effects after it. */
  if (params.remember) context.remembered = made;
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
    apply: {addTypes: params.addTypes ?? ["Creature"], ...(params.subtypes ? {addTypes: [...(params.addTypes ?? ["Creature"]), ...params.subtypes]} : {}),
      /* "And gain all creature types" (Mirror Entity, batch 74): in the same layer (rules/layers.mjs). */
      ...(params.allCreatureTypes === true ? {allCreatureTypes: true} : {})},
    until: params.until ?? null,
    sourceController: context.controller,
  });
  /* "Becomes a 2/1 blue and red Elemental creature" (Restless Spire): its colors, in their own layer (CR 613.1e). "Becomes
     that color" (Foraging Wickermaw, `colors: "produced"`): the colors of the mana its mana ability just added -- and no
     type, with `addTypes: []`. */
  const colors = params.colors === "produced" ? ["W", "U", "B", "R", "G"].filter((c) => (context.produced?.[c] ?? 0) > 0) : params.colors;
  if (Array.isArray(colors)) {
    pushEffect(state, {
      id: `animate-colors:${context.source ?? "effect"}`,
      layer: 5, affects,
      apply: {setColors: [...colors]},
      until: params.until ?? null,
      sourceController: context.controller,
    });
  }
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
    /* Put by the earthbending player (CR 122.6): "twice that many instead" sees them. */
    const count = countersPlaced(state, id, "+1/+1", params.count ?? 1, context.controller);
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
      /* "Target creature gains 'When this creature dies, return it ...' until end of turn" (Feign Death, batch 76): the
         abilities, compiled as the card was (cards/index.mjs). */
      ...(params.abilities ? {addAbilities: params.abilities} : {}),
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
  /* "That creature's owner can't cast spells with the same name as that creature until your next turn" (Reflector Mage):
     a rule changed for players, not objects -- `who`, bound as it resolves ({ownerOf: {target: 0}}, script/bind.mjs) -- and
     the spells it forbids by `named`, that creature's name as it resolves ({nameOf: {target: 0}}; CR 201.2a). Read where a
     cast is offered (rules/statics.mjs, castForbidden). Lands are played, not cast, and stay playable (the card's ruling). A
     name that could not be read (the creature gone) forbids nothing. */
  if (params.rule === "cant-cast") {
    if (typeof params.named !== "string" || !Array.isArray(params.who) || !params.who.length) return [];
    pushEffect(state, {id: params.id ?? `effect:${context.source ?? "effect"}`, rule: "cant-cast", players: [...params.who], spells: {named: params.named},
      affects: {what: "player"}, apply: {}, until: params.until ?? "end-of-turn", sourceController: context.controller});
    return [];
  }
  pushEffect(state, {
    id: params.id ?? `effect:${context.source ?? "effect"}`,
    /* A rule changed for a while ("can't be blocked this turn", rules/statics.mjs), or a characteristic, in a layer. */
    ...(params.rule ? {rule: params.rule} : {layer: params.layer ?? 6, sublayer: params.sublayer}),
    /* `selector`: what it affects, fixed as it resolves (CR 611.2c) -- "each instant and sorcery card in your graveyard
       gains flashback until end of turn" does not reach a card put there later. A choice (`anyOf`) is each of them. */
    affects: params.targets ? {ids: params.targets} : params.selector ? {ids: fixedAt(state, params.selector, context)}
      /* "Creatures they control can't attack Jaces you control this turn" (Jace, Multiverse Architect): a rule changed,
         not a characteristic, so it reaches the creatures that player controls as they are -- one that arrives later
         included (CR 611.2c is about characteristics) -- `who` the player, bound as it resolves ("that player"). */
      : params.rule === "cant-attack" && Array.isArray(params.who) ? {what: "permanent", controller: params.who[0] ?? -1}
      : params.affects ?? {what: "permanent"},
    /* `toward`: which planeswalkers they can't attack ("Jaces you control"), "you" this effect's controller -- attacking a
       player, or any other planeswalker, they still may (rules/statics.mjs, cantAttack). */
    ...(params.rule === "cant-attack" && params.toward ? {toward: params.toward} : {}),
    /* "Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it"
       (Promise of Loyalty): `defender` "you", this effect's controller, `planeswalkers` theirs too (CR 506.3), and
       `whileCounter`, a duration of each creature's own -- while it has that counter (CR 611.2b; rules/statics.mjs). */
    ...(params.rule === "cant-attack" && params.defender === "you" ? {defender: "you", ...(params.planeswalkers === true ? {planeswalkers: true} : {})} : {}),
    ...(params.rule === "cant-attack" && typeof params.whileCounter === "string" ? {whileCounter: params.whileCounter} : {}),
    apply: params.apply ?? {},
    /* "Until end of turn" (the default), "until your next turn", or "ever": an effect with no duration -- "up to one other
       target creature loses all abilities" (Abigale) -- lasting as long as what it affects does (CR 611.2a; a permanent
       that leaves is a new object, CR 400.7). */
    until: params.until === "ever" ? null : params.until ?? "end-of-turn",
    /* "Until that player's next turn" (Teferi's Reproach): `their-next-turn`, the player `who` names (rules/turn.mjs). And a
       rule changed for players (`players`): their protection, their life total that can't change. */
    ...(params.until === "their-next-turn" || ["protection", "life-cant-change"].includes(params.rule) ? {players: Array.isArray(params.who) ? [...params.who] : [context.controller]} : {}),
    ...(params.rule === "protection" ? {from: params.from ?? "everything"} : {}),
    /* "Until this card is cast from exile" (Emrakul, the Exigent Doom): `untilCast` the card, as `until: "ever"` otherwise is,
       until that cast (rules/actions.mjs). */
    ...(Array.isArray(params.untilCast) && params.untilCast.length ? {untilCast: params.untilCast[0]} : {}),
    sourceController: context.controller,
  });
  return [];
}

/**
 * `gainControl` -- CR 613.1b: "gain control of target creature until end of turn", "untap all creatures and gain control
 * of them" (`selector`, fixed as it resolves), "target opponent gains control of this creature" (`toPlayer`), "for as long
 * as this creature remains on the battlefield" (Sower of Temptation: `until: "this leaves"`). For good unless `until` says
 * one of those. The permanent's controller itself changes -- the projection, its triggers, a choice of "a creature you
 * control" all read it -- and a change for a while leaves a `control-returns` record of whom it took the permanent from,
 * which gives it back when the duration ends (endControlChange: as the turn ends, rules/turn.mjs; as its source leaves the
 * battlefield, effects/zones.mjs). It has changed controller, so it is summoning sick for its new controller unless it has
 * haste (CR 302.6), and again for its old one when it returns.
 */
export function gainControl(state, params, context) {
  const to = Number.isInteger(params.toPlayer) ? params.toPlayer : context.controller;
  /* "For as long as this creature remains on the battlefield": a duration that never starts -- its source gone from the
     battlefield before this resolves (rules/stack.mjs leaves it null then) -- and the effect does nothing (CR 611.2b). */
  const source = context.source ?? null;
  if (params.until === "this leaves" && (source === null || state.objects[source]?.zone !== "battlefield")) return [];
  const ids = (params.selector ? selectMatching(state, params.selector, context) : params.targets ?? []).filter((id) => state.objects[id]?.zone === "battlefield");
  for (const id of ids) {
    const object = state.objects[id];
    /* For good: later than every control change before it, and never ending, so none of them decides its controller again
       (CR 613.7, timestamp order in layer 2) -- their records are spent. */
    if (!CONTROL_DURATIONS.includes(params.until)) state.effects = state.effects?.filter((e) => !(e.rule === "control-returns" && e.affects.ids[0] === id));
    else if (object.controller !== to) (state.effects ??= []).push({id: `control-returns:${id}:${state.effects.length}`, rule: "control-returns", affects: {ids: [id]},
      apply: {controller: object.controller}, until: params.until, ...(params.until === "this leaves" ? {source} : {}), sourceController: context.controller});
    rememberExileLooker(state, id, controllerOf(state, id));
    if (object.controller !== to) object.controlledSinceTurn = state.turn;
    object.controller = to;
    rememberExileLooker(state, id, controllerOf(state, id));
  }
  return [];
}
/** How long a control change may last other than for good: the turn, or while its source stays (schema.mjs reads it). */
export const CONTROL_DURATIONS = Object.freeze(["end-of-turn", "this leaves"]);

/**
 * A CONTROL CHANGE ENDS (CR 613.1b, 613.7): `record`, the `control-returns` record gainControl left. Control effects apply in
 * timestamp order, the latest winning, so its permanent goes back to whom this one took it from -- unless a later change
 * still holds it, and then that one is told to give it back there in its turn, as though this one had never been. "Gain
 * control until end of turn" twice in a turn ends with the first controller; a creature Sower of Temptation took and then
 * lent until end of turn goes to its owner when the Sower leaves only once the loan ends. Changing hands, it is summoning
 * sick for whom it returns to (CR 302.6), and not at all for one who has had it all along. A permanent gone from the
 * battlefield is a new object (CR 400.7) whose records are spent as it leaves (controlSourceLeft).
 */
export function endControlChange(state, record) {
  const id = record.affects.ids[0];
  const later = (state.effects ?? []).filter((e) => e.rule === "control-returns" && e.affects.ids[0] === id);
  const next = later[later.indexOf(record) + 1];
  if (next) next.apply = {...next.apply, controller: record.apply.controller};
  else if (state.objects[id].controller !== record.apply.controller) {
    state.objects[id].controller = record.apply.controller;
    state.objects[id].controlledSinceTurn = state.turn;
  }
  state.effects = state.effects.filter((e) => e !== record);
}

/**
 * A PERMANENT HAS LEFT THE BATTLEFIELD (`departed`, its id there): each control change lasting "for as long as" it remained
 * there ends (CR 611.2b; Sower of Temptation), and the records of control changes to it are spent -- it is a new object
 * now, wherever it went (CR 400.7). Called with every departure (effects/zones.mjs, returnExiledUntil).
 */
export function controlSourceLeft(state, departed) {
  for (const record of (state.effects ?? []).filter((e) => e.rule === "control-returns" && e.until === "this leaves" && e.source === departed)) endControlChange(state, record);
  if (state.effects?.some((e) => e.rule === "control-returns" && e.affects.ids[0] === departed))
    state.effects = state.effects.filter((e) => !(e.rule === "control-returns" && e.affects.ids[0] === departed));
}

/**
 * `phaseOut` -- "all nonland permanents they control phase out" (Teferi's Reproach; CR 702.26): each permanent the selector
 * describes is treated as though it does not exist -- out of the battlefield's list, out of combat (CR 506.4), its zone
 * "phased" -- with no zone change at all (CR 702.26e: nothing leaves or enters, nothing triggers), and phases back in, the
 * same object, before its controller untaps during their next untap step (rules/turn.mjs, CR 702.26b).
 */
/**
 * `setState` -- §12.2's state of a permanent (Forge's SetState is the ruler only), two of them built:
 *   `level: N`         a Class's level set to N, its level bar's ability (CR 716.2a): a designation any permanent may have (716.2b), kept on
 *                      the permanent until it leaves (a new object has none, CR 400.7; 716.2d reads none as 1). It is not
 *                      copiable (716.2b): a copy of the Class is level 1.
 *   `transform: true`  "transform Venat" (CR 701.27a; state/index.mjs, transformObject). An activated or triggered ability
 *                      of the permanent that transforms it does so only if it hasn't transformed since the ability was put
 *                      on the stack -- a delayed trigger's, since it was made (701.27f) -- the count then
 *                      (`context.sourceTransforms`, rules/stack.mjs) against the count now; otherwise the instruction is
 *                      ignored.
 */
export function setState(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) {
    const object = state.objects[id];
    /* Gone from the battlefield -- a new object, if anywhere (CR 400.7) -- and there is nothing to change. */
    if (object?.zone !== "battlefield") continue;
    if (Number.isInteger(params.level)) {
      const before = object.level ?? 1;
      object.level = params.level;
      events.push(event("GameEventCardLevel", state, {card: cardRef(state, id), oldValue: before, newValue: params.level}));
    }
    if (params.transform === true) {
      if (id === context.source && context.sourceTransforms !== undefined && (object.transforms ?? 0) !== context.sourceTransforms) continue;
      const was = object.card;
      if (transformObject(state, id)) events.push(event("GameEventCardTransformed", state, {card: cardRef(state, id), from: was, to: state.objects[id].card}));
    }
  }
  return events;
}

export function phaseOut(state, params, context) {
  const ids = (params.selector ? selectMatching(state, params.selector, context) : params.targets ?? []).filter((id) => state.objects[id]?.zone === "battlefield");
  /* Anything attached to one phases out with it, indirectly (CR 702.26h), and back in with it, whoever controls it. */
  for (const id of [...ids]) for (const other of state.zones.battlefield) if (state.objects[other].attachedTo === id && !ids.includes(other)) ids.push(other);
  for (const id of ids) {
    const object = state.objects[id];
    state.zones.battlefield.splice(state.zones.battlefield.indexOf(id), 1);
    object.zone = "phased";
    object.phasedOut = {player: ids.includes(object.attachedTo) ? state.objects[object.attachedTo].controller : object.controller};
    (state.phasedOut ??= []).push(id);
    if (state.combat) {
      state.combat.attacks = (state.combat.attacks ?? []).filter((a) => a.attacker !== id);
      for (const attack of state.combat.attacks ?? []) attack.blockers = (attack.blockers ?? []).filter((b) => b !== id);
    }
  }
  return [];
}
/** Phase in every permanent of `player`'s that phased out (CR 702.26b), as their untap step begins. */
export function phaseIn(state, player) {
  const back = (state.phasedOut ?? []).filter((id) => state.objects[id]?.phasedOut?.player === player);
  for (const id of back) {
    const object = state.objects[id];
    delete object.phasedOut;
    object.zone = "battlefield";
    state.zones.battlefield.push(id);
  }
  state.phasedOut = (state.phasedOut ?? []).filter((id) => !back.includes(id));
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
/**
 * `immediateTrigger` -- a reflexive triggered ability (Forge's ImmediateTrigger; CR 603.12): "Sacrifice it. When you do,
 * search your library ..." (the New Capenna lands), "you may create a Treasure token. When you do, target opponent creates
 * a tapped Treasure token" (Generous Plunderer). It triggers as the resolution does what it names -- an effect's own
 * condition saying whether it did ("this way", script/condition.mjs) -- and goes on the stack the next time a player
 * would receive priority, with the other triggers waiting then, its targets chosen as it does (CR 603.3d; none legal,
 * and it is removed). `effects` what it does, `targets` its own; "that card" and "that player" what this resolution is
 * about.
 */
export function immediateTrigger(state, params, context) {
  const source = context.source ?? null;
  (state.pendingTriggers ??= []).push({abilityId: "reflexive", text: params.text ?? "When you do", controller: context.controller,
    source: {cardId: source, name: source !== null ? state.objects[source]?.card ?? null : null}, cause: null, optional: false,
    ...(context.about ? {about: structuredClone(context.about)} : {}),
    script: {targets: structuredClone(params.targets ?? []), effects: structuredClone(params.effects ?? [])}});
  return [];
}

export function delayedTrigger(state, params, context) {
  if (!state.delayedTriggers) state.delayedTriggers = [];
  const waits = Boolean(params.on);
  /* "That creature": the object, now; gone already, and the trigger waits on nothing (CR 603.7a's example). */
  const watch = waits && params.watch !== undefined ? ((bindEffect({targets: params.watch}, context).targets ?? [])[0] ?? null) : undefined;
  state.delayedTriggers.push({
    ...(waits ? {on: structuredClone(params.on), ...(watch !== undefined ? {watch} : {}), ...(params.thisTurn ? {thisTurn: true} : {}), ...(params.once ? {once: true} : {}),
      /* "Until your next turn, whenever a creature attacks you ..." (Jace, Reality Sculptor): every time, until its controller's
         next turn begins (rules/turn.mjs). */
      ...(params.untilYourNextTurn ? {untilYourNextTurn: true} : {}), fresh: true}
      /* "At the beginning of YOUR next upkeep" (rebound, CR 702.88a; rules/stack.mjs): its controller's, not the next one's.
         "At the beginning of that player's next end step" (The Eternal Wanderer): a moment of that player's turn only (`player`). */
      : {at: params.at ?? "end step", ...(params.yours === true ? {yours: true} : {}), ...(Number.isInteger(params.player) ? {player: params.player} : {})}),
    controller: context.controller,
    source: context.source ?? null,
    /* A double-faced source's transforms as this is made: "transform it" from a delayed trigger is ignored once it has
       transformed since (CR 701.27f; setState). */
    ...(state.objects[context.source]?.mdfc && state.objects[context.source].zone === "battlefield" ? {sourceTransforms: state.objects[context.source].transforms ?? 0} : {}),
    effects: rememberNow(params.effects ?? [], context, {keepThat: waits, state}),
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
