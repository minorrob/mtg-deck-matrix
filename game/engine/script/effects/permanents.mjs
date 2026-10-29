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

import {addObject, transformObject, rememberExileLooker, COPY_KEYS} from "../../state/index.mjs";
import {selectMatching, compileSelector} from "../filter.mjs";
import {bindEffect, rememberNow, countThisWay} from "../bind.mjs";
import {amountOf} from "../amount.mjs";
import {event, cardRef, moveOne, playersFor} from "./zones.mjs";
import {typesOf, controllerOf, staticAbilities} from "../../rules/layers.mjs";
import {protectedFrom} from "../../rules/protection.mjs";
import {manaValue, parseManaCost} from "../../rules/mana.mjs";
import {countersPlaced, enteringCountersPlaced, tokensCreated} from "../../rules/statics.mjs";
import {clearRingBearer} from "../../keywords/ring.mjs";
import {removeFromCombat} from "../../rules/combat.mjs";
import {enteringModifications} from "../../rules/replacement.mjs";
import {prepare} from "./attributes.mjs";
import {isCreatureType} from "../../keywords/types.mjs";
import {registerRuleOperation, askRuleOperation, emitRuleEvents} from "../../rules/operations.mjs";
import {patchEnteringObject, prospectiveEnteringState} from "../../rules/pre-entry.mjs";
import {enteredWith} from "../../rules/entering.mjs";

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
  /* CR 111.10: a Blood token (Kamber, the Plunderer; Moonstone Eulogist) -- "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card." */
  Blood: {name: "Blood", types: ["Artifact"], subtypes: ["Blood"],
    abilities: [{id: "blood", kind: "activated", text: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.", targets: [],
      cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}, {atom: "discard"}, {atom: "sacrifice", self: true}], effects: [{effect: "draw", count: 1}]}]},
  /* A 2/2 black Zombie creature token with decayed (CR 702.147; Tainted Adversary): it can't block (702.147a), and when it
     attacks it is sacrificed at end of combat (702.147b) -- the keyword's two abilities, written out as a token's are. */
  "Decayed Zombie": {name: "Zombie", types: ["Creature"], subtypes: ["Zombie"], colors: ["B"], power: 2, toughness: 2, keywords: ["Decayed"],
    abilities: [
      {id: "decayed-block", kind: "static", rule: "cant-block", affects: {what: "permanent", self: true}, text: "This creature can't block."},
      {id: "decayed-attack", kind: "triggered", text: "When this creature attacks, sacrifice it at end of combat.", trigger: {on: "GameEventAttackersDeclared", who: "self"},
        effects: [{effect: "delayedTrigger", at: "end of combat", text: "Sacrifice it at end of combat.", effects: [{effect: "moveZone", targets: "self", sacrifice: true}]}]}]},
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
  /* CR 111.10m (Royal Treatment): a Role (CR 303.7) -- a colorless Aura Role enchantment token with enchant creature, named
     Royal, "Enchanted creature gets +1/+1 and has ward {1}" (its ward the triggered ability the keyword is, as a card's
     compiles; cards/index.mjs). Created attached to what it enchants (createToken's `attachedTo`). */
  "Royal Role": {name: "Royal", types: ["Enchantment"], subtypes: ["Aura", "Role"], colors: [], enchant: {what: "permanent", types: ["Creature"]},
    abilities: [
      {id: "royal-pt", kind: "static", text: "Enchanted creature gets +1/+1 and has ward {1}.", layer: 7, sublayer: "c",
        affects: {what: "permanent", attachedBy: "self"}, apply: {power: 1, toughness: 1}},
      {id: "royal-ward", kind: "static", text: "Enchanted creature gets +1/+1 and has ward {1}.", layer: 6, affects: {what: "permanent", attachedBy: "self"},
        apply: {addKeywords: ["Ward"], addAbilities: [{id: "ward", kind: "triggered", text: "ward {1}", trigger: {on: "GameEventBecomesTarget", who: "self", by: "opponent"},
          effects: [{effect: "unlessPays", who: "that player", amount: 1, effects: [{effect: "counterSpell", stack: "that"}]}]}]}},
    ]},
  /* CR 111.10v (Splinter, the Mentor) */
  Mutagen: {name: "Mutagen", types: ["Artifact"], subtypes: ["Mutagen"],
    abilities: [{id: "mutagen", kind: "activated", text: "{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.",
      timing: "sorcery", targets: [{what: "permanent", types: ["Creature"]}],
      cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}], effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: 1}]}]},
  /* CR 111.10s (Restless Anchorage): explore, CR 701.44 (effects/asking.mjs, explore). */
  Map: {name: "Map", types: ["Artifact"], subtypes: ["Map"],
    abilities: [{id: "map", kind: "activated", text: "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.",
      timing: "sorcery", targets: [{what: "permanent", types: ["Creature"], controller: "you"}],
      cost: [{atom: "mana", cost: "{1}"}, {atom: "{T}"}, {atom: "sacrifice", self: true}], effects: [{effect: "explore", targets: {target: 0}}]}]},
  /* CR 111.10i, 701.53b (Train E, Sunfall's incubate): a double-faced token. Its front face a colorless Incubator artifact
     with "{2}: Transform this token.", its back face (`back`) a 0/0 colorless Phyrexian artifact creature named Phyrexian
     Token. makeToken gives the token both faces, and it transforms as a double-faced permanent does (CR 701.27a, 712.18;
     state/index.mjs, transformObject): the same object, its counters still on it. */
  Incubator: {name: "Incubator", types: ["Artifact"], subtypes: ["Incubator"], colors: [],
    abilities: [{id: "incubator", kind: "activated", text: "{2}: Transform this token.", targets: [],
      cost: [{atom: "mana", cost: "{2}"}], effects: [{effect: "setState", targets: "self", transform: true}]}],
    back: {name: "Phyrexian Token", types: ["Artifact", "Creature"], subtypes: ["Phyrexian"], colors: [], power: 0, toughness: 0}},
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
  /* "It loses 'enchant creature card in a graveyard' and gains 'enchant creature put onto the battlefield with this Aura.'
     ... attach this Aura to it" (Animate Dead; CR 303.4, 613.1f): `enchants: true`, the Aura's Enchant from now on that one
     creature alone, for as long as the Aura is this object (`enchantOnly`, which a zone change does not carry, CR 400.7;
     rules/sba.mjs reads it). Changed whether or not the Aura can then be attached: with no creature put onto the battlefield,
     or one it can't enchant (protection from black), it enchants nothing it may, and goes to its owner's graveyard (CR 704.5m). */
  if (params.enchants === true && source && source.zone === "battlefield") source.enchantOnly = host && host.zone === "battlefield" ? hostId : null;
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
  /* "Enchant creature card in a graveyard" (Animate Dead returned by Sun Titan; CR 303.4f, 303.4a): a card in that zone it
     could enchant, as it is there. */
  if (enchant?.what === "card" && typeof enchant.zone === "string" && !Array.isArray(enchant.anyOf)) return selectMatching(state, enchant, {controller});
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
/* A characteristic-defining ability of its power or toughness (CR 604.3; layer 7a, its own object's), defining one the copy
   effect sets (CR 707.9d). */
const definesSetStats = (ability, except) => ability?.kind === "static" && ability.layer === 7 && ability.sublayer === "a" && ability.affects?.self === true
  && ((except.setPower !== undefined && ability.apply?.setPower !== undefined) || (except.setToughness !== undefined && ability.apply?.setToughness !== undefined));
function copiable(object, except = {}) {
  const supertypes = [...new Set([...(object.supertypes ?? []).filter((t) => !(except.nonLegendary && t === "Legendary")), ...(except.addSupertypes ?? [])])];
  return {
    /* "With no mana cost" (embalm, CR 702.128a): none, part of the copiable values (CR 707.9b) -- its mana value 0. */
    card: except.name ?? object.card, manaCost: except.noManaCost === true ? null : object.manaCost ?? null,
    /* "It's a Vehicle artifact ... and it loses all other card types" (Imposter Mech): set, then any added. */
    types: [...new Set([...(except.setTypes ?? object.types ?? []), ...(except.addTypes ?? [])])],
    /* "It's a 2/2 black Zombie in addition to its other colors and types" (Ratadrabik): added, not set. */
    /* "Except it's a 0/1 white Illusion" (Preston, the Vanisher; CR 707.9b, 205.1b): its creature types that one alone
       (`setCreatureTypes`), its other subtypes (an Equipment's, a Vehicle's) kept. */
    subtypes: [...new Set([...[...(except.setSubtypes ?? object.subtypes ?? []), ...(except.addSubtypes ?? [])]
      .filter((t) => !except.setCreatureTypes || !isCreatureType(t)), ...(except.setCreatureTypes ?? [])])],
    ...(supertypes.length ? {supertypes} : {}),
    colors: [...new Set([...(except.setColors ?? object.colors ?? []), ...(except.addColors ?? [])])],
    keywords: [...new Set([...(object.keywords ?? []), ...(except.addKeywords ?? [])])],
    /* "And it has 'When this token leaves the battlefield, ...'" (Hofri Ghostforge; CR 707.9a): abilities the copy has besides
       the original's, part of its copiable values -- compiled with the card (cards/index.mjs), bound as it is made. */
    /* A copy whose power or toughness the effect sets ("except it's 1/1", offspring; "half that creature's power", Saw in
       Half; wave 4c) does not copy a characteristic-defining ability that would define it (CR 707.9d; Saw in Half's ruling):
       "Adeline's power is equal to the number of creatures you control" is no ability of a 1/1 copy of her. */
    abilities: [...structuredClone((object.abilities ?? []).filter((a) => !definesSetStats(a, except))), ...structuredClone(except.addAbilities ?? [])],
    power: except.setPower ?? object.power ?? null, toughness: except.setToughness ?? object.toughness ?? null,
    /* Its printed loyalty (CR 707.2): a planeswalker copied as it enters has that many loyalty counters (CR 306.5b; Spark
       Double, rules/replacement.mjs ownEntering). */
    ...(Number.isInteger(object.loyalty) ? {loyalty: object.loyalty} : {}),
    ...(Number.isInteger(object.defense) ? {defense: object.defense} : {}),
    ...(object.spell ? {spell: structuredClone(object.spell)} : {}),
    ...(object.enchant ? {enchant: structuredClone(object.enchant)} : {}),
    /* CR 722.2b: the inset spell is a copiable characteristic, not the prepared designation. */
    ...(object.preparation ? {preparation: structuredClone(object.preparation)} : {}),
  };
}

/* A created token copy of a double-faced permanent has both faces and its current orientation (CR 707.8a). This
   belongs to token creation, not becomeCopy: a physical single-faced copy does not acquire another physical face.
   A merged or face-down permanent is not copied as a double-faced permanent (CR 730.2i, 708.2a). */
function copiedTokenFaces(original, except) {
  if (!original.mdfc || original.merged || original.faceDown === true) return {};
  /* An existing copy effect applies to either physical face while it lasts (CR 707.8a, 712.9). Its copiable values
     become both token faces; the copy effect itself and the original's underlying identity are not copied. */
  const face = (side) => copiable(original.copyEffects?.length ? original : side, except);
  return {mdfc: {...structuredClone(original.mdfc), front: face(original.mdfc.front), back: face(original.mdfc.back)},
    ...(original.face === "back" ? {face: "back"} : {})};
}

/* WHO A CREATURE PUT ONTO THE BATTLEFIELD ATTACKING MAY ATTACK (CR 508.4): a defending player -- and where every opponent
   is one (Commander's attack multiple players option, CR 802.2), each opponent still in the game, in turn order. */
export function defendingPlayers(state, controller) {
  const seats = state.players.map((p) => p.id), from = seats.indexOf(controller);
  return [...seats.slice(from + 1), ...seats.slice(0, from)].filter((id) => !state.players[id].lost);
}

/* WHAT A CREATURE PUT ONTO THE BATTLEFIELD ATTACKING MAY ATTACK (CR 508.4): each defending player, then each planeswalker a
   defending player controls, its controller's choice among them (effects/asking.mjs, attackWhom). */
export function attackPlaces(state, controller) {
  const players = defendingPlayers(state, controller);
  return [...players.map((player) => ({player})), ...players.flatMap((player) => state.zones.battlefield
    .filter((id) => typesOf(state, id).includes("Planeswalker") && controllerOf(state, id) === player).map((planeswalker) => ({player, planeswalker})))];
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
 * defending player, or planeswalker one controls, its controller chooses as it enters -- the only one, or asked, a creature
 * at a time (asking.mjs, attackWhom). Only in a combat, only a creature, and only the attacking player's (CR 506.3a-b); a player no longer in
 * the game is attacked by nothing (CR 508.4a).
 */
export function enterAttacking(state, ids, whom, context, controller) {
  const creatures = ids.filter((id) => state.objects[id]?.zone === "battlefield" && typesOf(state, id).includes("Creature"));
  if (!creatures.length) return;
  /* NO CREATURE WAS DECLARED (CR 508.8): one put onto the battlefield attacking in the declare attackers step all the same
     makes an attack of it -- the declare blockers and combat damage steps then happen (rules/turn.mjs reads the attacks).
     The active player's, who is the attacking player (CR 506.2, 506.3b), once attackers are declared (Meandering
     Towershell, back "at the beginning of the declare attackers step"). */
  if (!state.combat && state.phase === "COMBAT_DECLARE_ATTACKERS" && controller === state.activePlayer)
    state.combat = {attackingPlayerId: controller, defenders: [], attacks: []};
  if (!state.combat || state.combat.attackingPlayerId !== controller) return;
  /* "Tapped and attacking that player or a planeswalker they control" (myriad, CR 702.116a): the player the effect is about,
     or one of their planeswalkers, its controller's choice as it enters (asking.mjs, attackWhom). */
  if (whom === "that player or their planeswalker") {
    const places = attackPlaces(state, controller).filter((place) => place.player === context.about?.player);
    if (!places.length) return;
    if (places.length === 1 || !state.resolving) { for (const id of creatures) joinAttack(state, id, places[0].player, places[0].planeswalker); return; }
    state.resolving.queue.unshift({effect: "attackWhom", tokens: creatures, player: controller, places});
    return;
  }
  if (whom === "that player") {
    const player = context.about?.player, planeswalker = context.about?.planeswalker;
    if (player === controller || !state.players[player] || state.players[player].lost) return;
    /* The same planeswalker (ninjutsu, CR 702.49c) -- one no longer on the battlefield, or no longer that player's, is
       attacked by nothing (CR 506.3c). */
    if (planeswalker !== undefined && !(state.objects[planeswalker] && typesOf(state, planeswalker).includes("Planeswalker") && state.objects[planeswalker].controller === player)) return;
    for (const id of creatures) joinAttack(state, id, player, planeswalker);
    return;
  }
  const places = attackPlaces(state, controller);
  if (!places.length) return;
  /* One place it may attack, or an effect run outside a resolution with no one to ask: the first player in turn order. */
  if (places.length === 1 || !state.resolving) { for (const id of creatures) joinAttack(state, id, places[0].player, places[0].planeswalker); return; }
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
  /* "Put target creature card from a graveyard onto the battlefield under your control. It's a Phyrexian in addition to its
     other types" (Portal to Phyrexia): a subtype added from now on, as long as it is this object (CR 205.1b, layer 4). */
  if (params.addSubtypes) pushEffect(state, {id: `subtypes:${context.source ?? "effect"}`, layer: 4, affects: {ids: made}, apply: {addSubtypes: params.addSubtypes}, until: null, sourceController: controller});
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
    const original = id?.values ?? (params.asItLastWas === true && context.about?.copiedAs && state.objects[id] ? context.about.copiedAs : state.objects[id]);
    if (!original) continue;
    const except = params.except?.addAbilities ? {...params.except, addAbilities: rememberedIn(params.except.addAbilities, context.remembered)} : params.except;
    /* Twice as many copies (Anointed Procession), Dragons instead of a copy that would be an artifact (Draconic Visitor), a
       Soldier beside a creature's (Queen Allenal): rules/statics.mjs, tokensCreated -- read against what the copy would be,
       in the order its controller chose for this original (tokenQuestion). The copies are the effect's own; what is made
       instead of them, or beside them, is made as its token says, and as the effect makes its tokens (tapped, hasty). */
    const {groups} = tokensCreated(state, controller, params.count ?? 1, copiable(original, except), {orders: params.tokenOrders?.[copyEventKey(id)] ?? []});
    for (const {token, count, own} of groups) for (let i = 0; i < count; i += 1) {
      if (!own) { made.push(makeToken(state, token, controller, params, context, events)); continue; }
      const values = copiable(original, except);
      /* A copy of an Aura enchants something as it enters, or is not made (CR 303.4f-g). */
      const hosts = values.enchant ? enchantable(state, values.enchant, controller) : null;
      if (hosts && !hosts.length) continue;
      const copy = addObject(state, {...values, ...copiedTokenFaces(original, except), owner: controller, controller, token: true}, "battlefield");
      if (hosts) enchantOnArrival(state, copy, hosts, controller);
      if (params.tapped) state.objects[copy].tapped = true;
      made.push(copy);
      events.push(event("GameEventCardChangeZone", state, {
        card: cardRef(state, copy), enteredAs: copy, becomes: copy, ...(state.objects[copy]?.tapped ? {enteredTapped: true} : {}),
        from: {zoneType: null, player: {playerId: controller}}, to: {zoneType: "Battlefield", player: {playerId: controller}}, createdAsToken: true,
      }));
      /* The copied preparation card's own entering replacement applies (CR 614.12, 722.3a-c). */
      if (values.preparation) {
        const entering = enteringModifications(state, {objectId: copy, player: controller, types: values.types, abilities: values.abilities});
        if ((entering.designations ?? []).includes("prepared")) prepare(state, copy, events);
      }
    }
  }
  afterwards(state, made, {...params, controller}, context);
  return made;
}
/* Which event of a copy effect an order answers: the original by its id, or the source as it last existed (`lastKnown`) --
   or a creature an effect moved, as it last existed, by the id of what it became (`key`; movedCopies). */
const copyEventKey = (id) => (id?.values ? (id.key !== undefined ? String(id.key) : "lastKnown") : String(id));

/* "ITS CONTROLLER CREATES TWO TOKENS THAT ARE COPIES OF THAT CREATURE, EXCEPT THEIR POWER IS HALF THAT CREATURE'S POWER AND THEIR
   TOUGHNESS IS HALF THAT CREATURE'S TOUGHNESS. ROUND UP EACH TIME" (Saw in Half; wave 4c): `of: "moved"`, a copy of each
   creature the effect before it moved and remembered -- "if that creature dies this way", a destroy's `remember` (effects/
   zones.mjs: none indestructible, regenerated, or sent elsewhere by a replacement) -- as it last existed on the battlefield
   (CR 608.2h, 113.7a): its copiable values, or what it was copying (CR 707.3; layers.mjs lastKnown's `copiable`), under the
   control of its controller then. `halfStats`: their base power and toughness half the power and toughness it last had,
   each rounded up (CR 707.9b; the card's rulings). */
function movedCopies(state, params, context) {
  const half = (n) => Math.ceil((n ?? 0) / 2) + 0;
  /* Each as it last was (`movedWas`), beside what it became (`remembered`): destroy keeps the two in step (effects/zones.mjs). */
  return (context.movedWas ?? []).map((was, i) => ({id: (context.remembered ?? [])[i], was})).map(({id, was}) => ({id, controller: was.controller,
    original: was.copiable ?? state.objects[id], except: {...(params.except ?? {}), ...(params.halfStats === true ? {setPower: half(was.power), setToughness: half(was.toughness)} : {})}}));
}

/** `copyPermanent` — "create a token that's a copy of target creature you control" (CR 707.2), or one of each a selector matches ("for each token you control"). */
export function copyPermanent(state, params, context) {
  const events = [];
  if (params.of === "moved") {
    for (const one of movedCopies(state, params, context)) makeCopies(state, [{values: one.original, key: one.id}], {...params, controller: one.controller, except: one.except}, context, events);
    return events;
  }
  const originals = params.selector ? selectMatching(state, params.selector, context) : (params.targets ?? []);
  /* "Create a token that's a copy of this creature" (`targets: "self"`, `lastKnown`; Colorstorm Stallion's Opus), this creature
     gone since its ability was put on the stack: a copy of it as it last existed on the battlefield (CR 608.2h, 113.7a) --
     the copiable values its last known information kept for that ability (rules/layers.mjs, lastKnown). */
  const gone = params.lastKnown === true && !originals.length && context.lastKnown?.copiable ? [{values: context.lastKnown.copiable}] : null;
  const made = makeCopies(state, gone ?? originals, params, context, events);
  /* "If the token is an Aura, untap Yenna" (batch 70): the tokens made, for the effects after it. */
  if (params.remember) context.remembered = made;
  /* "Exile the tokens at end of combat" (myriad): every token made by each time it is repeated, kept together. */
  if (params.rememberMore) context.remembered = [...(context.remembered ?? []), ...made];
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
export {COPY_KEYS};
/* Its own values, only those it has: a key holding undefined would not survive the room's storage (JSON drops it), and a
   value it never had is read as none (showCopy; state/index.mjs, moveObject). */
const ownValues = (object) => Object.fromEntries(COPY_KEYS.filter((key) => object[key] !== undefined).map((key) => [key, structuredClone(object[key])]));
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
/* A pre-entry copy uses the same copiable-value implementation as becomeCopy. Only this one object's prospective
   characteristics are cloned; the real card, battlefield, timestamps and object-ID stream are untouched. */
export function entryCopyPatch(state, id, fromId, options = {}) {
  const object = state.objects[id];
  if (!object || state.objects[fromId]?.zone !== "battlefield") return null;
  const prospective = {...structuredClone(object), zone: "battlefield"};
  if (!copyOnto({objects: {...state.objects, [id]: prospective}}, id, fromId, options)) return null;
  const keys = [...COPY_KEYS, "uncopied", "copyEffects"];
  return {set: Object.fromEntries(keys.filter(key => prospective[key] !== undefined).map(key => [key, structuredClone(prospective[key])])),
    remove: keys.filter(key => prospective[key] === undefined)};
}
/* "Each nonland permanent you control becomes a copy of target non-Aura permanent" (Mirrorform): `selector`, what becomes
   the copy in the source's place -- each permanent it matches as the effect begins (CR 611.2c). The target among them
   becomes a copy of itself, which changes nothing, so the rest copy it as it was (CR 707.2). */
export function becomeCopy(state, params, context) {
  const ids = params.selector ? selectMatching(state, params.selector, context) : [context.source];
  for (const id of ids) copyOnto(state, id, (params.targets ?? [])[0], {except: params.except ?? {}, keep: params.keep ?? [], until: params.until ?? null});
  return [];
}
/**
 * "FOR AS LONG AS THAT LAND HAS A BLIGHT COUNTER ON IT" (Ultima, Origin of Oblivion; CR 611.2b): a layer's effect lasting while
 * each object it affects has a counter of a kind (`whileCounter`) ends for an object with none -- for good, so a counter put
 * on again later does not bring it back -- and with none left, it is over. Run as the game is checked (rules/sba.mjs); the
 * layers apply it only while the counter is there, in between. A rule changed for a while (`rule`, Promise of Loyalty's
 * "can't attack") reads its counter where the rule is asked (rules/statics.mjs).
 */
export function endCounterDurations(state) {
  const over = new Set();
  for (const e of state.effects ?? []) {
    if (!e.whileCounter || e.rule || !Array.isArray(e.affects?.ids)) continue;
    const ids = e.affects.ids.filter((id) => (state.objects[id]?.counters?.[e.whileCounter] ?? 0) > 0);
    if (!ids.length) over.add(e);
    else if (ids.length < e.affects.ids.length) e.affects = {...e.affects, ids};
  }
  if (over.size) state.effects = state.effects.filter((e) => !over.has(e));
}

/** "Until end of turn": those copy effects end (rules/turn.mjs, the cleanup step). "Shards you control become copies of it
    until the next end step" (Niko, Light of Hope): `until` "next-end-step", over as an end step begins (rules/turn.mjs),
    before anything triggers then (CR 513.1, 611.2a). */
export function endCopies(state, until = "end-of-turn") {
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (!(object.copyEffects ?? []).some((c) => c.until === until)) continue;
    object.copyEffects = object.copyEffects.filter((c) => c.until !== until);
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
 * `incubate` — CR 701.53a (Train E, Sunfall: "Incubate X, where X is the number of creatures exiled this way"): one
 * Incubator token (CR 111.10i) that enters the battlefield with N +1/+1 counters on it. `count` is the N, an amount counted
 * as the effect is applied (CR 608.2h). The counters are given as it enters (CR 122.6), by its controller (122.6a), so an
 * effect that changes how many are put sees them; none at all, and it enters with none.
 */
export function incubate(state, params, context) {
  return createToken(state, {count: 1, token: {predefined: "Incubator"}, entersWithCounters: {"+1/+1": params.count ?? 0}}, context);
}

/**
 * `emblem` -- "you get an emblem with ..." (CR 114; the library load's L1: Ajani Steadfast, Teferi, Hero of Dominaria,
 * Mordenkainen). An object put into its player's command zone (114.1, 114.2), owned and controlled by that player, with the
 * abilities the effect gives it (`abilities`, compiled as a card's are, cards/index.mjs) and no other characteristic: no
 * types, no mana cost, no color (114.3). It is neither a card nor a permanent (114.5); `card` is only what the board calls
 * it, after what made it. Its abilities function in the command zone (114.4): its triggered abilities (rules/trigger.mjs),
 * its replacement effects (rules/replacement.mjs) and the rules it changes for players and permanents (rules/statics.mjs,
 * playerRuleChanged and ruleChanged). Nothing removes it.
 */
export function emblem(state, params, context) {
  const player = context.controller;
  const named = state.objects[context.source]?.card ?? context.lastKnown?.name ?? null;
  const id = addObject(state, {card: named ? `${named} emblem` : "Emblem", emblem: true, owner: player, controller: player,
    abilities: params.abilities ?? []}, "command", player);
  /* One printed ability can use multiple layer bodies; its Oracle text is still printed once (CR 114.2-4). */
  if (params.text !== undefined) state.objects[id].emblemOracleText = params.text;
  return [event("GameEventEmblemCreated", state, {player: {playerId: player, name: state.players[player].name}, card: cardRef(state, id)})];
}

/* A face of a double-faced token (an Incubator, CR 111.10i), as a double-faced card's face is kept (cards/index.mjs,
   faceOfDefinition): what transformObject turns over (state/index.mjs). */
const tokenFace = (spec) => ({card: spec.name ?? "Token", types: [...(spec.types ?? [])], subtypes: [...(spec.subtypes ?? [])], supertypes: [...(spec.supertypes ?? [])],
  manaCost: null, colors: [...(spec.colors ?? [])], power: spec.power ?? null, toughness: spec.toughness ?? null, keywords: [...(spec.keywords ?? [])],
  abilities: structuredClone(spec.abilities ?? [])});

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
  /* A target player who is no longer one creates nothing -- nor one who has left the game (CR 800.4b: no token is created
     under their control; Tempt with Vengeance's "may create" answered for them, CR 800.4g). */
  if (!state.players[controller] || state.players[controller].lost) return events;
  /* "Create a Royal Role token attached to that creature" (Royal Treatment): `attachedTo`, an object bound as a target is --
     an Aura token created attached to what its Enchant could not enchant, or to nothing, is not created (CR 303.4i). An Aura
     token's alone: the compiler refuses it of any other (cards/index.mjs). */
  const [host] = params.attachedTo ?? [];
  if (params.attachedTo !== undefined && !enchantable(state, spec.enchant, controller).includes(host)) return events;
  const made = [];
  /* "Twice that many of those tokens instead" (Anointed Procession), artifact tokens made Dragons instead (Draconic Visitor),
     "those tokens plus a 1/1 white Soldier" (Queen Allenal), "one of each" (Academy Manufactor): what is made, in the order
     their controller chose (rules/statics.mjs, tokensCreated; effects/asking.mjs, orderTokens) -- each as the effect says its
     tokens are made, tapped, attacking or gaining haste, whatever a replacement made of them (their rulings; CR 614.6). */
  const {groups} = tokensCreated(state, controller, count, spec, {orders: params.tokenOrders?.[TOKEN_EVENT] ?? []});
  for (const {token, count: many} of groups) for (let i = 0; i < many; i += 1) made.push(makeToken(state, token, controller, params, context, events));
  /* An Aura among them enters attached (Royal Treatment's Role, twice that many of it too); a Food added beside it does not. */
  if (params.attachedTo !== undefined) for (const id of made) if (state.objects[id].enchant) attachTo(state, id, host);
  /* "They gain haste until end of turn" (Ovika), and the rest a made permanent may gain (afterwards). */
  afterwards(state, made, {...params, controller}, context);
  /* "Exile the top card of your library face down ... Create a 2/2 colorless Spirit creature token. When that token leaves the
     battlefield, put the exiled card into your hand" (Ugin, the Ineffable; CR 607.2a; card load w4d L1): `linkRemembered`,
     what an earlier effect of this resolution remembered, linked to each token made, for its own ability (`linked`,
     effects/zones.mjs) -- "the exiled card", still that card in exile (CR 400.7). */
  if (params.linkRemembered === true) for (const id of made) if (state.objects[id])
    (state.links ??= {})[id] = (context.remembered ?? []).filter((card) => state.objects[card]?.zone === "exile");
  /* "Create X 1/1 white Soldier creature tokens. If X is 5 or more, destroy all OTHER creatures" (Martial Coup): the
     tokens this made, for the effects after it -- the ones a replacement added among them (CR 614.6). */
  if (params.remember) context.remembered = made;
  return events;
}

/* The answers kept for the order of the effects changing tokens (CR 616.1; effects/asking.mjs, orderTokens): by the event --
   a createToken's one, or each original a copy is made of. */
const TOKEN_EVENT = "made";
/**
 * The first event of this token effect whose replacement effects' order is the tokens' controller's to choose and not yet
 * chosen (CR 616.1), given `answers` (by event): `{player, options, controller, count, values, key}`, or null. It changes
 * nothing. A createToken or a copyPermanent of targets; the rest (populate, amass, investigate's Clues, which no adder adds
 * to unless they are made Dragons first) take the order that makes the most (rules/statics.mjs, tokensCreated).
 */
export function tokenQuestion(state, effect, context, answers = {}) {
  const ask = (controller, count, values, key) => {
    const {question} = tokensCreated(state, controller, count, values, {orders: answers[key] ?? [], askable: true});
    return question ? {...question, controller, count, values, key, answered: answers[key] ?? []} : null;
  };
  const controller = effect?.controller ?? context.controller;
  /* Copies of what the effect before it moved (Saw in Half; movedCopies): each its controller's, as it last existed. */
  if (effect?.effect === "copyPermanent" && effect.of === "moved") {
    for (const one of movedCopies(state, effect, context)) {
      const asked = ask(one.controller, effect.count ?? 1, copiable(one.original, one.except), String(one.id));
      if (asked) return asked;
    }
    return null;
  }
  /* Linked tokens are made under the exiled cards' owners' control (linkedTokens): theirs to order, not asked here. */
  if (effect?.effect === "createToken" && effect.linked !== true)
    return ask(controller, effect.count ?? 1, effect.token?.predefined ? PREDEFINED_TOKENS[effect.token.predefined] : effect.token, TOKEN_EVENT);
  if (effect?.effect === "copyPermanent" && !effect.selector && Array.isArray(effect.targets)) {
    for (const id of effect.targets) {
      if (!state.objects[id]) continue;
      const asked = ask(controller, effect.count ?? 1, copiable(state.objects[id], effect.except), copyEventKey(id));
      if (asked) return asked;
    }
    /* A copy of this creature as it last existed (copyPermanent's `lastKnown`). */
    if (effect.lastKnown === true && !effect.targets.length && context.lastKnown?.copiable)
      return ask(controller, effect.count ?? 1, copiable(context.lastKnown.copiable, effect.except), copyEventKey({values: true}));
  }
  return null;
}

/* One token of this spec, under `controller`'s control, as the effect says it is made (tapped), said so. */
function tokenObject(state, spec, controller, context) {
  const sized = (value) => (value === "X" || (value !== null && typeof value === "object") ? amountOf(state, value, context) : value ?? null);
  return {
    card: spec.name ?? "Token",
    types: spec.types ?? ["Creature"],
    /* A Goblin token is a Goblin (CR 111.4): "sacrifice a Goblin" has to find it. */
    subtypes: spec.subtypes ?? [],
    /* "Colorless snow artifact tokens named Replicated Ring" (batch 72): its supertypes (state/index.mjs keeps none empty). */
    supertypes: spec.supertypes ?? [],
    /* "A 1/1 red Elemental" is red (CR 111.4): "white creatures you control" has to find a white token. */
    colors: spec.colors ?? [],
    /* A mana cost only when the effect gives it one (CR 111.3): "a {1} 1/1 Food Golem artifact creature" (Ginger, Queen of
       Sweets' Gingerbrute) has mana value 1; a token made without one has none. */
    ...(spec.manaCost ? {manaCost: spec.manaCost} : {}),
    power: sized(spec.power),
    toughness: sized(spec.toughness),
    keywords: spec.keywords ?? [],
    abilities: spec.abilities ?? [],
    /* An Aura token's Enchant (a Role's, CR 303.7): what the state-based actions hold it to (CR 704.5m). */
    ...(spec.enchant ? {enchant: spec.enchant} : {}),
    ...(spec.preparation ? {preparation: structuredClone(spec.preparation)} : {}),
    /* A double-faced token (an Incubator, CR 111.10i): both faces, its front face up as it enters (CR 712.14's default),
       so it is one that can transform (CR 701.27a, 712.9). */
    ...(spec.back ? {mdfc: {front: tokenFace(spec), back: tokenFace(spec.back), transforming: true}} : {}),
    owner: controller,
    controller,
    token: true,
  };
}

/* A script caller dispatches these effects through the rule-operation bridge. Every token in one instruction is
   planned before any of them enters, so a Mimic created in the same event is never a pre-existing replacement source. */
export function tokenEntryEffectFrame(effect, context) {
  if (!["createToken", "copyPermanent", "investigate", "incubate"].includes(effect.effect)) return null;
  const params = effect.effect === "investigate" ? {effect: "createToken", count: effect.count ?? 1, token: {predefined: "Clue"},
    ...(effect.controller !== undefined ? {controller: effect.controller} : {})}
    : effect.effect === "incubate" ? {effect: "createToken", count: 1, token: {predefined: "Incubator"}, entersWithCounters: {"+1/+1": effect.count ?? 0}}
    : effect;
  return {kind: "token-entry", params: structuredClone(params), context: structuredClone(context)};
}

function tokenEntryBatches(state, params, context) {
  const batches = [];
  const add = (controller, entries, local = context, settings = params) => {
    if (state.players[controller] && !state.players[controller].lost) batches.push({controller, entries, context: structuredClone(local), params: structuredClone(settings), made: []});
  };
  const ordinary = (settings, local) => {
    const controller = settings.controller ?? local.controller;
    const spec = settings.token?.predefined ? PREDEFINED_TOKENS[settings.token.predefined] : settings.token ?? {};
    if (!spec) throw new Error(`No predefined token named ${settings.token.predefined}`);
    const [host] = settings.attachedTo ?? [];
    if (settings.attachedTo !== undefined && !enchantable(state, spec.enchant, controller).includes(host)) return;
    const {groups} = tokensCreated(state, controller, settings.count ?? 1, spec, {orders: settings.tokenOrders?.[TOKEN_EVENT] ?? []});
    add(controller, groups.flatMap(({token, count}) => Array.from({length: count}, () => ({candidate: tokenObject(state, token, controller, local), forcedTapped: token.tapped === true}))), local, settings);
  };
  if (params.effect === "createToken") {
    if (params.linked === true) {
      const key = context.source ?? context.lastKnown?.cardId ?? null;
      const exiled = (state.links?.[key] ?? []).filter(id => state.objects[id]);
      if (key !== null && state.links) delete state.links[key];
      const x = exiled.reduce((n, id) => n + (state.objects[id].manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0), 0);
      for (const controller of new Set(exiled.map(id => state.objects[id].owner))) ordinary({...params, linked: false, controller}, {...context, x});
    } else ordinary(params, context);
    return batches;
  }
  const copies = (ids, settings, local) => {
    const controller = settings.controller ?? local.controller, entries = [];
    for (const id of ids) {
      const original = id?.values ?? (settings.asItLastWas === true && local.about?.copiedAs && state.objects[id] ? local.about.copiedAs : state.objects[id]);
      if (!original) continue;
      const except = settings.except?.addAbilities ? {...settings.except, addAbilities: rememberedIn(settings.except.addAbilities, local.remembered)} : settings.except;
      const {groups} = tokensCreated(state, controller, settings.count ?? 1, copiable(original, except), {orders: settings.tokenOrders?.[copyEventKey(id)] ?? []});
      for (const {token, count, own} of groups) for (let index = 0; index < count; index += 1) entries.push({ownCopy: own === true, forcedTapped: !own && token.tapped === true, candidate: own
        ? {...copiable(original, except), ...copiedTokenFaces(original, except), owner: controller, controller, token: true}
        : tokenObject(state, token, controller, local)});
    }
    add(controller, entries, local, settings);
  };
  if (params.of === "moved") for (const one of movedCopies(state, params, context))
    copies([{values: one.original, key: one.id}], {...params, controller: one.controller, except: one.except}, context);
  else {
    const originals = params.selector ? selectMatching(state, params.selector, context) : params.targets ?? [];
    const gone = params.lastKnown === true && !originals.length && context.lastKnown?.copiable ? [{values: context.lastKnown.copiable}] : null;
    copies(gone ?? originals, params, context);
  }
  return batches;
}

registerRuleOperation("token-entry", (state, frame) => {
  if (!frame.batches) {
    frame.batches = tokenEntryBatches(state, frame.params, frame.context);
    frame.entries = frame.batches.flatMap((batch, batchIndex) => batch.entries.map(entry => ({...entry, batchIndex})));
    frame.index = 0;
  }
  if (frame.stage === "after-entry") {
    frame.entries[frame.index].prepared = frame.childResult?.entering?.to && frame.childResult.entering.to !== "battlefield" ? null : frame.childResult;
    delete frame.childResult; frame.stage = "attachment";
  }
  if (frame.index < frame.entries.length) {
    const entry = frame.entries[frame.index], batch = frame.batches[entry.batchIndex];
    if (!state.players[batch.controller] || state.players[batch.controller].lost) { frame.index += 1; frame.stage = null; return {status: "continue"}; }
    if (frame.stage === "attachment") {
      const values = {...entry.candidate}; patchEnteringObject(values, entry.prepared?.objectPatch);
      if (values.enchant && entry.prepared) {
        entry.enchant = values.enchant;
        const hosts = enchantable(state, values.enchant, batch.controller), specified = batch.params.attachedTo;
        if (specified !== undefined) entry.host = hosts.includes(specified[0]) ? specified[0] : null;
        else if (frame.answer) {
          const selected = frame.hosts[frame.answer.indices[0]]; delete frame.answer;
          if (hosts.includes(selected)) entry.host = selected;
        }
        if (specified === undefined && entry.host === undefined && hosts.length > 1) {
          frame.hosts = hosts;
          return askRuleOperation(state, frame, {player: batch.controller, choice: {id: `token-enchant:${state.ruleOperation.serial}:${frame.index}`,
            title: `${values.card}: choose what it enchants as it enters`, mode: "one", min: 1, max: 1,
            options: hosts.map((id, index) => ({index, label: state.objects[id].card, cardId: id}))}});
        }
        if (specified === undefined && entry.host === undefined) entry.host = hosts[0] ?? null;
        if (entry.host === null) entry.prepared = null;
      }
      frame.index += 1; frame.stage = null;
      return {status: "continue"};
    }
    frame.stage = "after-entry";
    entry.virtualId = `token-entry:${state.ruleOperation.serial}:${frame.index}`;
    return {status: "continue", children: [{kind: "entering", objectId: entry.virtualId, player: batch.controller, candidate: entry.candidate}]};
  }
  /* Count replacements before the simultaneous entrants exist; no new token's static can change a sibling's counters. */
  for (const entry of frame.entries) if (entry.prepared && !state.players[frame.batches[entry.batchIndex].controller].lost) {
    const batch = frame.batches[entry.batchIndex];
    const view = prospectiveEnteringState(state, {objectId: entry.virtualId, player: batch.controller, candidate: entry.candidate, objectPatch: entry.prepared.objectPatch});
    entry.counters = {};
    const wanted = {...entry.prepared.entering.counters};
    for (const [counter, count] of Object.entries(batch.params.entersWithCounters ?? {})) wanted[counter] = (wanted[counter] ?? 0) + count;
    for (const [counter, count] of Object.entries(wanted)) {
      const placed = enteringCountersPlaced(view, entry.virtualId, counter, count, batch.controller);
      if (placed > 0) entry.counters[counter] = placed;
    }
  }
  for (const entry of frame.entries) if (entry.prepared && !state.players[frame.batches[entry.batchIndex].controller].lost) {
    const batch = frame.batches[entry.batchIndex];
    if (entry.host !== undefined && (!state.objects[entry.host] || !enchantable(state, entry.enchant, batch.controller).includes(entry.host))) continue;
    const id = addObject(state, entry.candidate, "battlefield");
    patchEnteringObject(state.objects[id], entry.prepared.objectPatch);
    state.objects[id].counters = entry.counters;
    state.objects[id].tapped = entry.forcedTapped || batch.params.tapped === true || entry.prepared.entering.tapped === true;
    if (entry.host !== undefined) attachTo(state, id, entry.host);
    const events = [event("GameEventCardChangeZone", state, {card: cardRef(state, id), becomes: id, createdAsToken: true,
      ...(entry.ownCopy ? {enteredAs: id} : {}), ...(state.objects[id].tapped ? {enteredTapped: true} : {}), from: {zoneType: null, player: {playerId: batch.controller}}, to: {zoneType: "Battlefield", player: {playerId: batch.controller}}})];
    if ((entry.prepared.entering.designations ?? []).includes("prepared")) prepare(state, id, events);
    events.push(...enteredWith(state, id, {counters: entry.counters}));
    if (entry.prepared.entering.gainsKeywords?.length) pushEffect(state, {id: `entry-keywords:${id}`, layer: 6, affects: {ids: [id]},
      apply: {addKeywords: entry.prepared.entering.gainsKeywords}, until: null, sourceController: batch.controller});
    state.players[batch.controller].tokensThisTurn = (state.players[batch.controller].tokensThisTurn ?? 0) + 1;
    batch.made.push(id); emitRuleEvents(state, events);
  }
  const made = frame.batches.flatMap(batch => batch.made);
  for (const batch of frame.batches) {
    afterwards(state, batch.made, {...batch.params, controller: batch.controller}, batch.context);
    if (batch.params.linkRemembered === true) for (const id of batch.made) (state.links ??= {})[id] = (batch.context.remembered ?? []).filter(card => state.objects[card]?.zone === "exile");
  }
  if (frame.params.remember) frame.context.remembered = made;
  if (frame.params.rememberMore) frame.context.remembered = [...(frame.context.remembered ?? []), ...made];
  return {status: "done", result: {context: frame.context, made}};
});
function makeToken(state, spec, controller, params, context, events) {
  const id = addObject(state, tokenObject(state, spec, controller, context), "battlefield");
  /* "Create a tapped Treasure token": the effect says so as well as a spec can. */
  let entering = null;
  if (spec.tapped || params.tapped) state.objects[id].tapped = true;
  /* "Creatures your opponents control enter tapped" (Authority of the Consuls; CR 614.1c, 614.12): a token is a permanent
     entering the battlefield too (CR 111.1), and a replacement that has it enter tapped applies as it is made. Only that is
     taken from them here -- what else a token enters with, the effect's own words give (above, below) -- and not "tapped
     unless you pay" (a shock land's), which asks a question no token is asked yet (NAMED). */
  else {
    entering = enteringModifications(state, {objectId: id, player: controller, types: state.objects[id].types, abilities: state.objects[id].abilities});
    if (entering.tapped && !entering.asks.some((ask) => ask.life !== undefined || ask.reveal !== undefined)) state.objects[id].tapped = true;
  }
  /* "An Incubator token that enters the battlefield with N +1/+1 counters on it" (incubate, CR 701.53a): given as it enters,
     before the event that says it entered (CR 122.6), by its controller (122.6a) -- "twice that many instead" sees them. */
  for (const [counter, n] of Object.entries(params.entersWithCounters ?? {})) {
    const placed = enteringCountersPlaced(state, id, counter, n, controller);
    if (placed > 0) state.objects[id].counters[counter] = (state.objects[id].counters[counter] ?? 0) + placed;
  }
  events.push(event("GameEventCardChangeZone", state, {
    card: cardRef(state, id),
    /* The token is the object that arrived: "for each of them, create a token that's a copy of it" names it. */
    becomes: id, ...(state.objects[id]?.tapped ? {enteredTapped: true} : {}),
    from: {zoneType: null, player: {playerId: controller}},
    to: {zoneType: "Battlefield", player: {playerId: controller}},
    createdAsToken: true,
  }));
  /* A preparation token's own replacement gives it a fresh designation/copy, never the source's prepared state. */
  if (state.objects[id].preparation) {
    const preparedEntry = entering ?? enteringModifications(state, {objectId: id, player: controller, types: state.objects[id].types, abilities: state.objects[id].abilities});
    if ((preparedEntry.designations ?? []).includes("prepared")) prepare(state, id, events);
  }
  /* The tokens each player has made this turn ("only if you created a token this turn", Idol of Oblivion): its creator
     is its controller unless the effect says otherwise (CR 111.2). Cleared as a turn begins (rules/turn.mjs). */
  state.players[controller].tokensThisTurn = (state.players[controller].tokensThisTurn ?? 0) + 1;
  return id;
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
    /* "Becomes a 0/0 Elemental creature", "each of them is a 1/1 Spirit in addition to its other types" (Ghost Vacuum): its
       subtypes added beside its own, in the same layer (CR 205.1b, 613.1d) -- creature types, never card types. */
    apply: {addTypes: params.addTypes ?? ["Creature"], ...(params.subtypes ? {addSubtypes: [...params.subtypes]} : {}),
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
      events.push(event("GameEventCardCounters", state, {card: cardRef(state, id), type: "+1/+1", oldValue: before, newValue: before + count, by: context.controller}));
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
  /* "For as long as this Saga remains on the battlefield" (Old Fat Spider Can't See Me; CR 611.2b): `until: "this leaves"`,
     ended as its source leaves the battlefield (endWhileSourceRemains) -- a duration that never starts with the source gone
     from it before this resolves (rules/stack.mjs leaves the source null then), and the effect does nothing. */
  const whileHere = params.until === "this leaves";
  if (whileHere && (context.source === null || context.source === undefined || state.objects[context.source]?.zone !== "battlefield")) return [];
  /* "That creature's owner can't cast spells with the same name as that creature until your next turn" (Reflector Mage):
     a rule changed for players, not objects -- `who`, bound as it resolves ({ownerOf: {target: 0}}, script/bind.mjs) -- and
     the spells it forbids by `named`, that creature's name as it resolves ({nameOf: {target: 0}}; CR 201.2a). Read where a
     cast is offered (rules/statics.mjs, castForbidden). Lands are played, not cast, and stay playable (the card's ruling). A
     name that could not be read (the creature gone) forbids nothing. */
  /* "If you do, you can't cast additional spells this turn" (Conduit of Worlds): every spell (`allSpells`), its controller's
     ("you"). "Your opponents can't cast spells this turn" (Silence; library load L2): each opponent still in the game as it
     resolves ("opponent"); "players can't cast spells this turn" (Bilbo's Gambit): each player ("each") -- named now, as
     the rule is changed for players and not objects (CR 611.2c is about characteristics). */
  /* "Until your next turn, your opponents can't cast spells from anywhere other than their hands" (Avatar's Wrath; CR 601.3):
     every spell from anywhere but a hand (`fromAnywhereButHand`; rules/statics.mjs, castForbidden). */
  if (params.rule === "cant-cast" && params.fromAnywhereButHand === true) {
    const forbidden = Array.isArray(params.who) ? params.who : playersFor(state, params.who, context.controller);
    if (!forbidden.length) return [];
    pushEffect(state, {id: params.id ?? `effect:${context.source ?? "effect"}`, rule: "cant-cast", players: [...forbidden], spells: {}, fromAnywhereButHand: true,
      affects: {what: "player"}, apply: {}, until: params.until ?? "end-of-turn", sourceController: context.controller});
    return [];
  }
  if (params.rule === "cant-cast") {
    const who = typeof params.who === "string" ? playersFor(state, params.who, context.controller) : params.who;
    if (!(typeof params.named === "string" || params.allSpells === true) || !Array.isArray(who) || !who.length) return [];
    pushEffect(state, {id: params.id ?? `effect:${context.source ?? "effect"}`, rule: "cant-cast", players: [...who], spells: params.allSpells === true ? {} : {named: params.named},
      affects: {what: "player"}, apply: {}, until: params.until ?? "end-of-turn", sourceController: context.controller});
    return [];
  }
  pushEffect(state, {
    id: params.id ?? `effect:${context.source ?? "effect"}`,
    /* A rule changed for a while ("can't be blocked this turn", rules/statics.mjs), or a characteristic, in a layer. */
    ...(params.rule ? {rule: params.rule} : {layer: params.layer ?? 6, ...(params.sublayer !== undefined ? {sublayer: params.sublayer} : {})}),
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
    /* And "for as long as that land has a blight counter on it, it loses all land types and abilities" (Ultima, Origin of
       Oblivion): the same, for a characteristic changed in a layer (rules/layers.mjs). */
    ...(typeof params.whileCounter === "string" ? {whileCounter: params.whileCounter} : {}),
    apply: params.apply ?? {},
    /* "Until end of turn" (the default), "until your next turn", or "ever": an effect with no duration -- "up to one other
       target creature loses all abilities" (Abigale) -- lasting as long as what it affects does (CR 611.2a; a permanent
       that leaves is a new object, CR 400.7). */
    until: params.until === "ever" ? null : params.until ?? "end-of-turn",
    /* "Until that player's next turn" (Teferi's Reproach): `their-next-turn`, the player `who` names (rules/turn.mjs). And a
       rule changed for players (`players`): their protection, their life total that can't change. */
    /* And "you have no maximum hand size for the rest of the game" (Wisdom of Ages; CR 402.2, 611.2a): read at cleanup
       (rules/statics.mjs, playerRuleChanged). And "until end of turn, you may look at the top card of your library any time"
       (Gwenom, Remorseless; CR 401.2): read as the library is shown (projection.mjs, topSeenBy). */
    /* "Creatures you control gain ... protection from each color until end of turn" (Akroma's Will; CR 702.16, 611.2c) is a
       protection over the permanents it names, fixed as it resolves (`selector`, `targets`), and no player's
       (rules/protection.mjs, protectedFrom). And "you gain hexproof until end of turn" (Dawn's Truce; CR 702.11c): its
       players, read where a target is chosen (script/filter.mjs, playerHasHexproof). */
    ...(params.until === "their-next-turn" || (["protection", "life-cant-change", "no-maximum-hand-size", "damage-doubled", "look-at-top", "player-hexproof"].includes(params.rule)
      && !(params.rule === "protection" && (params.targets || params.selector))) ? {players: Array.isArray(params.who) ? [...params.who] : [context.controller]} : {}),
    /* And "you ... gain hexproof from blue and from black until end of turn" (Veil of Summer; CR 702.11d): a hexproof from over
       players (rules/protection.mjs, playerHexproofFrom) -- with no targets and no selector, where Skrelv's is over the
       permanents it targets. */
    ...(params.rule === "hexproof-from" && !params.targets && !params.selector ? {players: Array.isArray(params.who) ? [...params.who] : [context.controller]} : {}),
    /* "If a source would deal damage to that player or a permanent that player controls, it deals double that damage
       instead" (Lightning, Army of One; rules/replacement.mjs, rememberedReplacement): `who` the players it remembers, its
       name for the order's question (CR 616.1). "That creature enters with an additional +1/+1 counter on it" (Summon:
       Fenrir): `counter` and `count`, about the spell `targets` names. */
    ...(params.rule === "damage-doubled" ? {name: state.objects[context.source]?.card ?? context.lastKnown?.name ?? "An effect"} : {}),
    ...(params.rule === "enters-with-counters" ? {counters: {counter: params.counter, count: params.count ?? 1}} : {}),
    ...(params.rule === "protection" ? {from: params.from ?? "everything"} : {}),
    /* "You may cast sorcery spells as though they had flash" until your next turn (Teferi, Time Raveler's +1): for its
       controller (`players`), and which spells, a card selector, or every spell (`true`) -- read where a cast's timing is
       (rules/statics.mjs, flashGranted). */
    ...(params.rule === "cast-as-though-flash" ? {players: Array.isArray(params.who) ? [...params.who] : [context.controller],
      spells: params.spells === true ? true : structuredClone(params.spells ?? {})} : {}),
    /* "Creatures your opponents control attack this turn if able" (Bident of Thassa; rules/statics.mjs, attacksEachCombat):
       named by its source when a declaration breaks it, as it was then, gone or not (rules/combat.mjs). */
    ...(params.rule === "attacks-each-combat" ? {sourceId: context.source ?? null, sourceName: state.objects[context.source]?.card ?? context.lastKnown?.name ?? null} : {}),
    /* A PREVENTION SHIELD OF A PLAYER'S (CR 615; rules/replacement.mjs, preventionsFor): "prevent all combat damage that would
       be dealt to you this turn" (Inkshield) -- `who`, the players it shields -- "the next time a source of your choice
       would deal damage to you this turn" (Deflecting Palm) -- `from`, the sources chosen (CR 609.7a), and `next`, used up
       by the first damage it prevents (CR 615.8) -- and what follows, `then` (CR 615.5), done by its controller and dealt by
       the spell that made it (`dealer`, followed to the card it becomes, rules/stack.mjs), its name for the order's
       question (CR 616.1). */
    ...(params.rule === "prevent-damage" && params.who !== undefined ? {players: Array.isArray(params.who) ? [...params.who] : [context.controller]} : {}),
    ...(params.rule === "prevent-damage" && Array.isArray(params.from) ? {sources: [...params.from]} : {}),
    ...(params.rule === "prevent-damage" && params.next === true ? {next: true} : {}),
    ...(params.rule === "prevent-damage" && Array.isArray(params.then) ? {then: structuredClone(params.then), dealer: context.source ?? null} : {}),
    ...(params.rule === "prevent-damage" ? {name: state.objects[context.source]?.card ?? context.lastKnown?.name ?? "An effect"} : {}),
    /* "Hexproof from that color until end of turn" (Skrelv, Defector Mite; CR 702.11d): its colors, chosen as it resolves
       ("$chosenColor", script/bind.mjs), read where a target is chosen (rules/protection.mjs, hexproofFrom). */
    ...(params.rule === "hexproof-from" ? {colors: [...(params.colors ?? [])]} : {}),
    /* "It can't be blocked by creatures of that color this turn" (Skrelv): which blockers, a selector (rules/statics.mjs,
       cantBeBlockedBy, `by`). */
    ...(params.rule === "cant-be-blocked-by" ? {by: structuredClone(params.by ?? {})} : {}),
    /* "Until this card is cast from exile" (Emrakul, the Exigent Doom): `untilCast` the card, as `until: "ever"` otherwise is,
       until that cast (rules/actions.mjs). */
    ...(Array.isArray(params.untilCast) && params.untilCast.length ? {untilCast: params.untilCast[0]} : {}),
    ...(whileHere ? {source: context.source} : {}),
    sourceController: context.controller,
  });
  return [];
}

/**
 * A PERMANENT HAS LEFT THE BATTLEFIELD (`departed`, its id there): each effect lasting "for as long as" it remained there
 * ends (CR 611.2b; effectUntil's `until: "this leaves"`, Old Fat Spider Can't See Me) -- wherever it went, it is a new
 * object (CR 400.7), and coming back does not bring the effect back. Called with every departure, after controlSourceLeft
 * has given back what a control change lasting as long took (effects/zones.mjs, returnExiledUntil).
 */
export function endWhileSourceRemains(state, departed) {
  if ((state.effects ?? []).some((e) => e.until === "this leaves" && e.source === departed))
    state.effects = state.effects.filter((e) => !(e.until === "this leaves" && e.source === departed));
}

/**
 * `gainControl` -- CR 613.1b: "gain control of target creature until end of turn", "untap all creatures and gain control
 * of them" (`selector`, fixed as it resolves), "target opponent gains control of this creature" (`toPlayer`), "for as long
 * as this creature remains on the battlefield" (Sower of Temptation: `until: "this leaves"`). For good unless `until` says
 * one of those. The permanent's controller itself changes -- the projection, its triggers, a choice of "a creature you
 * control" all read it -- and every change leaves a `control-returns` record: whom it took the permanent from, whom it gave
 * it to (`to`), and how long it lasts (`until`, unsaid for good). That record gives it back when the change ends
 * (endControlChange): as the turn ends (rules/turn.mjs), as its source leaves the battlefield (effects/zones.mjs), or --
 * for good ones too -- as the player it gave control to leaves the game (CR 800.4a; rules/sba.mjs). It has changed
 * controller, so it is summoning sick for its new controller unless it has haste (CR 302.6), and again for its old one
 * when it returns. And it is removed from combat (CR 506.4; rules/combat.mjs): an attacker taken in the middle of a combat
 * attacks no one, and a blocker taken blocks nothing -- each time its controller changes, going and coming back.
 */
export function gainControl(state, params, context) {
  /* "Choose a different opponent" for each (`toEach`, Dack Fayden, Helping Hand) is its controller's choice: asked by the
     resolution (effects/asking.mjs, controlToOpponents), never given to this effect's controller here by default. */
  if (params.toEach !== undefined) throw new Error("gainControl's toEach asks its controller whose each permanent becomes: run it through the resolution (script/resolution.mjs)");
  const to = Number.isInteger(params.toPlayer) ? params.toPlayer : context.controller;
  /* "For as long as this creature remains on the battlefield": a duration that never starts -- its source gone from the
     battlefield before this resolves (rules/stack.mjs leaves it null then) -- and the effect does nothing (CR 611.2b). */
  const source = context.source ?? null;
  if (params.until === "this leaves" && (source === null || state.objects[source]?.zone !== "battlefield")) return [];
  const ids = (params.selector ? selectMatching(state, params.selector, context) : params.targets ?? []).filter((id) => state.objects[id]?.zone === "battlefield");
  /* "Gain control of all creatures with power 4 or greater until end of turn. Untap those creatures" (Mob Rule; library load
     L2): what it named as it resolved, for the effects after it to name as "remembered" -- not the selector read again, which
     a creature's power changed by the control change itself (an anthem left behind) would no longer fit. */
  if (params.remember) context.remembered = ids.slice();
  for (const id of ids) {
    const object = state.objects[id];
    /* Kept even for good, and even when it changes nothing: a later change outlasts the earlier ones in layer 2 (CR 613.7),
       but its player may leave the game and the earlier ones decide again (CR 800.4a). */
    (state.effects ??= []).push({id: `control-returns:${id}:${state.effects.length}`, rule: "control-returns", affects: {ids: [id]},
      apply: {controller: object.controller}, to, ...(params.until ? {until: params.until} : {}), ...(params.until === "this leaves" ? {source} : {}), sourceController: context.controller});
    rememberExileLooker(state, id, controllerOf(state, id));
    if (object.controller !== to) {
      clearRingBearer(state, id);
      object.controlledSinceTurn = state.turn;
      removeFromCombat(state, id);
    }
    object.controller = to;
    rememberExileLooker(state, id, controllerOf(state, id));
  }
  return [];
}
/**
 * `exchangeControl` -- CR 701.12a-b: "exchange control of target artifact or creature you control and target creature an
 * opponent controls with power 3 or less" (Oko, Thief of Crowns' -5): `from` the one, `targets` the other -- or, with no
 * `from`, "exchange control of two target creatures" (Switcheroo): the two of `targets`. Both still on the battlefield -- and each still a legal target as it resolves, or nothing is bound to it (CR 608.2b) -- and controlled
 * by different players: each player gains control of the other's, at once and for good, as two control changes, each with
 * its record, so a player who leaves the game gives back what they were given (CR 800.4a). One gone, or no longer legal,
 * and no part of the exchange happens (701.12a); both one player's, and it does nothing (701.12b).
 */
export function exchangeControl(state, params, context) {
  const [one, other] = params.from !== undefined ? [params.from[0], (params.targets ?? [])[0]] : params.targets ?? [];
  if (state.objects[one]?.zone !== "battlefield" || state.objects[other]?.zone !== "battlefield") return [];
  const ones = controllerOf(state, one), others = controllerOf(state, other);
  if (ones === others) return [];
  gainControl(state, {targets: [one], toPlayer: others}, context);
  gainControl(state, {targets: [other], toPlayer: ones}, context);
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
 * sick for whom it returns to (CR 302.6), and not at all for one who has had it all along, and it leaves combat (CR 506.4).
 * A permanent gone from the battlefield is a new object (CR 400.7) whose records are spent as it leaves (controlSourceLeft).
 * Ending one may exile its permanent (CR 800.4c), so a caller ending several asks for the next one still standing each time
 * (`nextRecord`).
 */
export function endControlChange(state, record, events = []) {
  const id = record.affects.ids[0];
  const later = (state.effects ?? []).filter((e) => e.rule === "control-returns" && e.affects.ids[0] === id);
  const next = later[later.indexOf(record) + 1];
  state.effects = state.effects.filter((e) => e !== record);
  if (next) next.apply = {...next.apply, controller: record.apply.controller};
  /* Back to a player who has left the game it does not go: no other change gives it to a player still in the game, the
     one who controlled it by default is gone, and it is exiled -- as soon as the change ends (CR 800.4c). */
  else if (state.players[record.apply.controller].lost) moveOne(state, id, "exile", events);
  else if (state.objects[id].controller !== record.apply.controller) {
    state.objects[id].controller = record.apply.controller;
    state.objects[id].controlledSinceTurn = state.turn;
    /* Its controller changes back, and it leaves the combat it is in (CR 506.4): one Sower of Temptation or Tractor Beam
       held, given back mid-combat as its source leaves, attacks or blocks no longer. */
    removeFromCombat(state, id);
  }
  return events;
}
/** The first control record still in effect that `fits` (endControlChange's callers, one at a time). */
export const nextRecord = (state, fits) => (state.effects ?? []).find((e) => e.rule === "control-returns" && fits(e));

/**
 * A PERMANENT HAS LEFT THE BATTLEFIELD (`departed`, its id there): each control change lasting "for as long as" it remained
 * there ends (CR 611.2b; Sower of Temptation), and the records of control changes to it are spent -- it is a new object
 * now, wherever it went (CR 400.7). Called with every departure (effects/zones.mjs, returnExiledUntil).
 */
export function controlSourceLeft(state, departed, events = []) {
  /* Its own records first: a Sower that took itself (its trigger's only target) has one it is both the source and the
     subject of, and nothing is left to give back (G1, 2026-10-08). */
  if (state.effects?.some((e) => e.rule === "control-returns" && e.affects.ids[0] === departed))
    state.effects = state.effects.filter((e) => !(e.rule === "control-returns" && e.affects.ids[0] === departed));
  for (let record; (record = nextRecord(state, (e) => e.until === "this leaves" && e.source === departed));) endControlChange(state, record, events);
}

/**
 * "YOU CONTROL ENCHANTED PERMANENT" (Tractor Beam; CR 613.1b, 611.3a): an Aura's static ability, `rule: "control-enchanted"`
 * (rules/statics.mjs), made the control change gainControl makes -- the permanent's controller itself changes, so every
 * reader sees it, summoning sickness included (CR 302.6) -- with the Aura's own record (`byAura`), from the first moment it
 * applies: the Aura on the battlefield with the ability (after layer 6, CR 613.1f), attached to that permanent. Asked whenever
 * the game is checked (rules/sba.mjs), before anything else is: a player never holds priority before it applies. It lasts while
 * that holds and its controller is still whom the record gave control to: the Aura gone (controlSourceLeft, `until: "this
 * leaves"`), attached elsewhere, without the ability, or under another player's control, and it ends (endControlChange) --
 * the next to apply, applying afresh. A later change of control outlasts it, and gives it back as it ends (CR 613.7).
 */
const controlsEnchanted = (state, held, aura) => held(aura).some((a) => a.kind === "static" && a.rule === "control-enchanted");
export function controlByAuras(state, events = []) {
  /* Only a card that prints it has it (no effect gives it): none on the battlefield, and nothing to do -- an Aura gone has
     ended its record as it left (controlSourceLeft). */
  if (!state.zones.battlefield.some((id) => (state.objects[id].abilities ?? []).some((a) => a.rule === "control-enchanted"))) return;
  const held = staticAbilities(state);
  const holds = (record) => state.objects[record.byAura]?.attachedTo === record.affects.ids[0] && controllerOf(state, record.byAura) === record.to
    && controlsEnchanted(state, held, record.byAura);
  for (let record; (record = nextRecord(state, (e) => e.byAura !== undefined && !holds(e)));) endControlChange(state, record, events);
  for (const aura of [...state.zones.battlefield]) {
    const host = state.objects[aura]?.attachedTo;
    /* An Aura attached to nothing (put onto the battlefield so, until the game puts it into the graveyard, CR 704.5m). */
    if (state.objects[host]?.zone !== "battlefield" || !controlsEnchanted(state, held, aura)) continue;
    if ((state.effects ?? []).some((e) => e.byAura === aura && e.affects.ids[0] === host)) continue;
    gainControl(state, {targets: [host], until: "this leaves"}, {controller: controllerOf(state, aura), source: aura});
    state.effects.findLast((e) => e.rule === "control-returns" && e.affects.ids[0] === host).byAura = aura;
  }
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
    removeFromCombat(state, id);
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
  /* "They're goaded for the rest of the game" (Dack Fayden, Helping Hand; CR 701.15a): `until: "game"`, a goad that no turn
     ends -- each permanent goaded until it leaves the battlefield and is a new object (CR 400.7). */
  if (ids.length) (state.effects ??= []).push({id: `goad:${context.source ?? "effect"}:${state.effects.length}`, rule: "goaded", affects: {ids}, until: params.until === "game" ? "game" : "your-next-turn", sourceController: context.controller});
  return [];
}


/**
 * `removeFromCombat` -- CR 506.4: "remove target attacking creature you control from combat" (Reconnaissance; wave 4d L3). It
 * stops being an attacking, blocking or blocked creature (rules/combat.mjs); a creature not in combat is unchanged. What
 * follows it on the card ("and untap it") is the next effect's.
 */
export function leaveCombat(state, params, context) {
  for (const id of params.targets ?? []) if (state.objects[id]?.zone === "battlefield") removeFromCombat(state, id);
  void context;
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
  /* "There is an additional end step after this step" (Y'shtola Rhul; CR 500.10): a step, after the one under way. */
  "end step": ["END_OF_TURN"],
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
  if (!steps.length) return [];
  /* "At the beginning of that combat, untap all creatures you control" (Moraug, Fury of Akoum; wave 4d L3, CR 603.7): a
     delayed trigger of that added combat's beginning, and no other's -- `atBeginning`, tagged with it; rules/turn.mjs numbers
     the combat as the phase is put in the turn, and rules/trigger.mjs fires it there. */
  const tag = steps.includes("COMBAT_BEGIN") && params.atBeginning ? `combat:${state.turn}:${(state.extraPhases ?? []).length}:${(state.delayedTriggers ?? []).length}` : undefined;
  /* An added step goes after this step, not after this phase (CR 500.10): an end step, after this end step. */
  const after = (params.phases ?? []).includes("end step") ? state.phase : endOfPhase(state.phase);
  (state.extraPhases ??= []).push({turn: state.turn, after, steps, ...(tag ? {tag} : {})});
  if (tag) delayedTrigger(state, {at: "that combat", tag, text: params.atBeginning.text, effects: params.atBeginning.effects}, context);
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
 * about -- or, `about: "remembered"`, "that card" what the effect before it remembered: "when you discard a card this way,
 * destroy target nonland permanent ... with mana value less than or equal to the mana value of the discarded card"
 * (Argentum Masticore; effects/asking.mjs, unlessPays's discard).
 */
export function immediateTrigger(state, params, context) {
  const source = context.source ?? null;
  /* What it remembered moved off the battlefield ("you may sacrifice another creature. When you do, Ziatora deals damage
     equal to that creature's power", Ziatora, the Incinerator): "that creature" as it last existed there (CR 608.2h) -- the
     effect before it kept each as it left (`movedWas`, effects/asking.mjs and effects/zones.mjs), one for each it moved. */
  const was = params.about === "remembered" && (context.movedWas ?? []).length === (context.remembered ?? []).length ? context.movedWas?.[0] : undefined;
  const about = params.about === "remembered" && context.remembered?.[0] !== undefined ? {...(context.about ?? {}), card: context.remembered[0], ...(was ? {lastKnown: structuredClone(was)} : {})} : context.about;
  (state.pendingTriggers ??= []).push({abilityId: "reflexive", text: params.text ?? "When you do", controller: context.controller,
    source: {cardId: source, name: source !== null ? state.objects[source]?.card ?? null : null}, cause: null, optional: false,
    ...(about ? {about: structuredClone(about)} : {}),
    /* And the X of the resolution that made it (Halo Forager's "you may pay {X}. When you do, ... with mana value X"):
       what its targets and effects read as X (rules/trigger.mjs). */
    ...(Number.isInteger(context.x) ? {x: context.x} : {}),
    /* "Put that many +1/+1 counters" (Augusta, Order Returned): what this resolution did, counted now (script/bind.mjs). */
    script: {targets: structuredClone(params.targets ?? []), effects: structuredClone(countThisWay(params.effects, context, state))}});
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
      : {at: params.at ?? "end step", ...(params.yours === true ? {yours: true} : {}), ...(Number.isInteger(params.player) ? {player: params.player} : {}),
        /* "On your next turn" (Meandering Towershell): a turn after this one (rules/trigger.mjs). */
        ...(params.at === "your next declare attackers" ? {madeOnTurn: state.turn} : {}),
        /* "At the beginning of that combat" (addPhase's `atBeginning`): the added combat it names. */
        ...(params.at === "that combat" ? {tag: params.tag} : {})}),
    controller: context.controller,
    source: context.source ?? null,
    /* A double-faced source's transforms as this is made: "transform it" from a delayed trigger is ignored once it has
       transformed since (CR 701.27f; setState). */
    ...((state.objects[context.source]?.mdfc || state.objects[context.source]?.merged?.some(p => p.physical.mdfc)) && state.objects[context.source].zone === "battlefield" ? {sourceTransforms: state.objects[context.source].transforms ?? 0} : {}),
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
