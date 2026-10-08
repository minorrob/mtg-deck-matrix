/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE SELECTOR GRAMMAR: WHICH THINGS A CARD IS TALKING ABOUT.
 *
 * `docs/engine/PLAN.md` §3.4 — "a small grammar for 'creature you control', 'another target
 * creature', 'each opponent', 'token', 'with mana value 2 or less', compiled by `filter.mjs` and
 * tested on its own" — and §6's phase 2.1.
 *
 * Almost every card says which things it affects, and almost all of them say it in one of a few
 * dozen shapes. This is that sentence as data. It is the construct the compiler will emit most
 * often, which makes it the one most worth being unable to get subtly wrong.
 *
 * THREE RULES THAT LOOK LIKE WORDING AND ARE NOT:
 *
 *   "ANOTHER" MEANS OTHER THAN THE SOURCE (CR 109.5). Not "other than the one just picked". A card
 *   reading "whenever another creature you control enters" does not trigger off itself, and an
 *   engine that reads it the other way gives the same answer on almost every board and the wrong
 *   one on the board where it matters. `another` without a source is refused, because a compiler
 *   that forgot to pass one would otherwise get a selector quietly meaning "any".
 *
 *   "YOU CONTROL" IS THE ABILITY'S CONTROLLER, NOT THE CARD'S OWNER. A stolen creature's activated
 *   ability says "you", and "you" is whoever is using it now. So control is read from the context
 *   passed at match time, and one compiled selector serves every seat.
 *
 *   "TARGET" IS A RULE, NOT A LABEL (CR 115.2). Hexproof and shroud make a permanent an illegal
 *   choice. A selector that carried `target: true` and did not enforce it would let every targeting
 *   card in the game ignore the keywords that exist to stop it — and the difference between the two
 *   is the half people forget: hexproof stops opponents, shroud stops everybody including you.
 *
 * THE GRAMMAR IS CLOSED. An unknown key is refused rather than ignored. A compiler emitting
 * `manaValueMax` where the grammar says `manaValue` would otherwise produce a selector that matches
 * everything, schema-valid and silently wrong — the same reason the primitive catalog is declared.
 */

import {usesThisTurn, valueCostOf} from "../state/index.mjs";
import {typesOf, keywordsOf, controllerOf, characteristicsOf, colorsOf, everyCreatureTypeOf, subtypesOf} from "../rules/layers.mjs";
import {parseManaCost, manaValue} from "../rules/mana.mjs";
import {hasSubtype, isCreatureType} from "../keywords/types.mjs";
import {protectedFrom} from "../rules/protection.mjs";
import {amountOf, amountProblems} from "./amount.mjs";

/* The steps after blockers are declared, in which an attacker is blocked or unblocked (CR 509.1h). */
const BLOCKERS_DECLARED = ["COMBAT_DECLARE_BLOCKERS", "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END"];

/** Every key a selector may carry. Anything else is a bug in whatever wrote it. */
export const SELECTOR_KEYS = Object.freeze([
  "what", "types", "subtypes", "supertypes", "nonTypes", "nonSubtypes", "zone", "controller", "who", "another", "target", "token", "manaValue", "named",
  "attachedBy", "colors", "tapped", "counters", "power", "self", "keywords", "nonSupertypes", "colorless", "attacking", "toughness", "countersAtLeast", "attackedThisTurn", "commander", "nonColors", "owner", "enteredThisTurn", "toughnessOverPower",
  "unblocked", "singleTarget", "goaded", "uniqueName", "sharesCreatureType", "multicolored", "sharesColor",
  "sharesCreatureTypeWithCommander",
  /* "A card exiled with this artifact" (CR 607.2a, 406.6): what this source's linked ability exiled, still in exile. */
  "exiledWith",
  /* "Each equipped creature" (Hemlock Vial). */
  "equipped",
]);

/* THE SOURCE A LINK IS KEPT AGAINST (CR 607.2a; effects/zones.mjs, `link`): the ability's source -- or, gone from the
   battlefield since its ability was put on the stack, that object as it last was (CR 113.7a): "if there are cards exiled
   with this enchantment" still finds what its other ability exiled. */
export const linkSource = (context) => context?.source ?? context?.lastKnown?.cardId ?? null;
/** The cards in exile a source's linked ability put there (CR 607.2a), each still the object it exiled (CR 400.7). */
export const exiledWithSource = (state, source) => (source === null || source === undefined ? []
  : (state.links?.[source] ?? []).filter((id) => state.objects[id]?.zone === "exile"));

/* A SELECTOR READ AGAINST LAST KNOWN INFORMATION (CR 603.10a, 608.2h). "Whenever another creature you control dies"
   asks what the thing was and whose, and by then it is a new object in a graveyard (CR 400.7): only the snapshot taken
   as it left (rules/layers.mjs, lastKnown) still knows. These are the keys a departure's filter may use. */
/* `self` (Rundvelt Hordemaster): "whenever this creature or another Goblin you control dies" -- the source itself, as it
   last was, whatever it then was (`anyOf: [{self: true}, {subtypes, controller}]`). */
const LAST_KNOWN_KEYS = ["what", "types", "subtypes", "supertypes", "nonTypes", "nonSubtypes", "controller", "token", "another", "attachedBy", "anyOf", "self"];
export function matchesLastKnown(selector, lki, context = {}) {
  if (!lki) return false;
  const s = selector ?? {};
  for (const key of Object.keys(s)) if (!LAST_KNOWN_KEYS.includes(key)) throw new Error(`A filter on something that has left the battlefield cannot use \`${key}\``);
  if (Array.isArray(s.anyOf)) return s.anyOf.some((one) => matchesLastKnown({...one, ...(s.controller ? {controller: s.controller} : {})}, lki, context));
  if (s.what && s.what !== "permanent" && s.what !== "card") return false;
  const types = lki.types ?? [], subtypes = [...types, ...(lki.subtypes ?? [])];
  /* A changeling as it last was is every creature type (keywords/types.mjs). */
  const changeling = lki.everyCreatureType === true;
  if (s.types && !s.types.every((t) => types.includes(t))) return false;
  if (s.nonTypes && s.nonTypes.some((t) => types.includes(t))) return false;
  if (s.subtypes && !s.subtypes.every((t) => subtypes.includes(t) || (changeling && isCreatureType(t)))) return false;
  if (s.nonSubtypes && s.nonSubtypes.some((t) => subtypes.includes(t) || (changeling && isCreatureType(t)))) return false;
  if (s.supertypes && !s.supertypes.every((t) => (lki.supertypes ?? []).includes(t))) return false;
  if (s.controller === "you" && lki.controller !== context.controller) return false;
  if (s.controller === "opponent" && lki.controller === context.controller) return false;
  if (s.token !== undefined && (lki.token === true) !== s.token) return false;
  if (s.another === true && lki.cardId === context.source) return false;
  if (s.self === true && lki.cardId !== context.source) return false;
  /* "Equipped creature dies": the Equipment was attached to it as it died. */
  if (s.attachedBy === "self" && !(lki.attachments ?? []).includes(context.source)) return false;
  return true;
}

/**
 * A selector that may be a choice ("an instant or sorcery spell", "an Aura, Equipment, or Vehicle spell"): `anyOf` its
 * alternatives, each with the keys they share. A trigger's filter is read this way; a target's choice is targetChoices'.
 */
export function matchesSelector(selector, state, id, context = {}) {
  if (!selector) return true;
  const {anyOf, ...shared} = selector;
  if (!Array.isArray(anyOf)) return compileSelector(selector)(state, id, context);
  return anyOf.some((one) => compileSelector({...shared, ...one})(state, id, context));
}

/** What a selector can be about. */
const WHAT = ["permanent", "card", "player", "spell"];

/* Where each `what` looks by default. A permanent is on the battlefield and nowhere else
   (CR 110.1) — a card in a hand is a card, not a permanent, and conflating them is how a "destroy
   target creature" finds something in somebody's hand. */
const DEFAULT_ZONE = {permanent: "battlefield", card: "hand", spell: "stack"};

function assertGrammar(selector) {
  if (!selector || typeof selector !== "object") throw new Error("A selector is an object");
  for (const key of Object.keys(selector)) {
    if (!SELECTOR_KEYS.includes(key))
      throw new Error(`The selector grammar has no key ${JSON.stringify(key)}; it has ${SELECTOR_KEYS.join(", ")}`);
  }
  if (selector.what !== undefined && !WHAT.includes(selector.what))
    throw new Error(`A selector is about one of ${WHAT.join(", ")}, not ${JSON.stringify(selector.what)}`);
  if (selector.types !== undefined && !Array.isArray(selector.types))
    throw new Error("A selector's types are a list, because 'artifact creature' is two of them");
  if (selector.subtypes !== undefined && !Array.isArray(selector.subtypes))
    throw new Error("A selector's subtypes are a list: 'Mountain Plains' is two of them");
  for (const key of ["supertypes", "nonTypes", "nonSubtypes"])
    if (selector[key] !== undefined && !Array.isArray(selector[key])) throw new Error(`A selector's ${key} are a list`);
  /* What it shares a creature type with: a selector of permanents, held to the same grammar. */
  if (selector.sharesCreatureType !== undefined) compileSelector({...selector.sharesCreatureType, what: "permanent"});
  if (selector.multicolored !== undefined && selector.multicolored !== true) throw new Error("A selector's multicolored is true: two or more colors");
  if (selector.sharesColor !== undefined && selector.sharesColor !== "self") throw new Error("A selector's sharesColor is \"self\": a color of its source's");
  if (selector.sharesCreatureTypeWithCommander !== undefined && selector.sharesCreatureTypeWithCommander !== true)
    throw new Error("A selector's sharesCreatureTypeWithCommander is true: a creature type of a commander of yours");
  /* A mana value's most may be an amount counted (Betor): one of the amount grammar's (script/amount.mjs). */
  const most = selector.manaValue?.max;
  if (most !== null && typeof most === "object" && amountProblems(most).length) throw new Error(`A selector's manaValue.max: ${amountProblems(most).join("; ")}`);
  if (selector.exiledWith !== undefined && selector.exiledWith !== "self") throw new Error("A selector's exiledWith is \"self\": a card this source's linked ability exiled");
  if (selector.equipped !== undefined && selector.equipped !== true) throw new Error("A selector's equipped is true: an Equipment is attached to it");
  /* "With power less than this creature's power" (mentor, CR 702.134a): `power.lessThan` "self". */
  if (selector.power?.lessThan !== undefined && selector.power.lessThan !== "self") throw new Error("A selector's power.lessThan is \"self\": less than its source's power");
}

/* AN OBJECT'S CREATURE TYPES (CR 205.3m): the subtypes of a creature or a kindred card, through the layers on the
   battlefield and as printed elsewhere; `every` for a changeling (CR 702.73a). A planeswalker's subtypes are not. */
function creatureTypesOf(state, id) {
  const object = state.objects[id];
  const types = typesOf(state, id);
  if (!types.includes("Creature") && !types.includes("Kindred")) return {every: false, types: []};
  const subtypes = object.zone === "battlefield" ? subtypesOf(state, id) : object.subtypes ?? [];
  return {every: everyCreatureTypeOf(state, id) === true, types: subtypes.filter(isCreatureType)};
}

/* A player with hexproof (CR 702.11c): a permanent of theirs with the static "you have hexproof" (rules/statics.mjs). */
const playerHasHexproof = (state, player) => state.zones.battlefield.some((id) => controllerOf(state, id) === player
  && (state.objects[id].abilities ?? []).some((a) => a.kind === "static" && a.rule === "player-hexproof"));

/* CR 115.2, and the difference between the two keywords is the part worth getting right:
   hexproof stops opponents only (CR 702.11b); shroud stops everybody, its controller included. */
function canBeTargetedBy(state, id, chooser, source = null) {
  const keywords = keywordsOf(state, id);
  if (keywords.includes("Shroud")) return false;
  if (keywords.includes("Hexproof") && controllerOf(state, id) !== chooser) return false;
  /* Protection (CR 702.16b; rules/protection.mjs): no target of a spell or ability from a source with the quality. */
  if (protectedFrom(state, {card: id}, source)) return false;
  return true;
}

function matchesManaValue(state, id, rule, context = {}) {
  /* A transformed permanent's is its front face's (CR 202.3b; state/index.mjs, valueCostOf). */
  const cost = valueCostOf(state.objects[id]);
  const value = cost ? manaValue(parseManaCost(cost)) : 0;
  /* "With mana value X" (Likeness Looter): the X paid, as it is targeted and as it resolves. */
  if (rule.exactly !== undefined) return value === (rule.exactly === "X" ? context.x ?? 0 : rule.exactly);
  /* "With even mana values" (Void Winnower): zero is even. */
  if (rule.even !== undefined && (value % 2 === 0) !== rule.even) return false;
  if (rule.min !== undefined && value < rule.min) return false;
  /* "With mana value X or less" (Rally the Ancestors): the X paid, as `exactly` reads it. "Less than or equal to the amount
     of life you lost this turn" (Betor, Ancestor's Voice): an amount counted as the selector is asked (script/amount.mjs) --
     as the target is chosen, and again as it resolves (CR 608.2b). */
  const most = rule.max === "X" ? context.x ?? 0 : rule.max !== null && typeof rule.max === "object" ? amountOf(state, rule.max, context) : rule.max;
  if (rule.max !== undefined && value > most) return false;
  return true;
}

/**
 * Compile a selector into a predicate.
 *
 * @returns {(state, id, context) => boolean}  `context` is `{controller, source}` — who is using
 *   the ability and which object it belongs to. It is taken at match time rather than baked in, so
 *   one compiled selector answers for every seat.
 */
export function compileSelector(selector) {
  /* "A creature or planeswalker", "Birds, Frogs, Otters, and Rats you control": any of these, each with the keys they
     share -- read the same for every caller, as matchesSelector reads it. */
  if (Array.isArray(selector?.anyOf)) {
    const {anyOf, ...shared} = selector;
    const each = anyOf.map((one) => compileSelector({...shared, ...one}));
    return (state, id, context = {}) => each.some((match) => match(state, id, context));
  }
  assertGrammar(selector);
  const what = selector.what ?? "permanent";

  return function matches(state, id, context = {}) {
    const chooser = context.controller;
    if (what === "player") {
      const player = state.players[id];
      /* CR 800.4a: a player who has left the game is not a player to be chosen. */
      if (!player || player.lost) return false;
      /* "You have hexproof" (Crystal Barricade, batch 71; CR 702.11c): no target of a spell or ability an opponent controls. */
      if (selector.target === true && id !== chooser && playerHasHexproof(state, id)) return false;
      /* "You ... have protection from" (CR 702.16j): no target of a spell or ability from a source with the quality. */
      if (selector.target === true && protectedFrom(state, {player: id}, context.source ?? null)) return false;
      const who = selector.who ?? "any";
      if (who === "you") return id === chooser;
      if (who === "opponent") return id !== chooser;
      return true;
    }

    const object = state.objects[id];
    if (!object) return false;

    const zone = selector.zone ?? DEFAULT_ZONE[what];
    if (zone && object.zone !== zone) return false;

    /* Colors through the layers (CR 105.2): "a blue spell" is one with blue among its colors; listing two asks for both. */
    /* "Colorless spells" (CR 105.2c): no color at all, through the layers. */
    if (selector.colorless === true && colorsOf(state, id).length > 0) return false;
    /* "Permanents that are one or more colors" (All Is Dust). */
    if (selector.colorless === false && colorsOf(state, id).length === 0) return false;
    /* "A multicolored spell" (CR 105.2b, Mage Tower Referee): two or more colors, through the layers. */
    if (selector.multicolored === true && colorsOf(state, id).length < 2) return false;
    /* "An instant or sorcery card that shares a color with this planeswalker" (Kasmina): a color of its source's, now. */
    if (selector.sharesColor === "self") {
      const source = context.source !== null && context.source !== undefined && state.objects[context.source] ? colorsOf(state, context.source) : [];
      const own = state.objects[id]?.zone === "battlefield" ? colorsOf(state, id) : (state.objects[id]?.colors ?? []);
      if (!own.some((color) => source.includes(color))) return false;
    }
    if (selector.colors) {
      const current = colorsOf(state, id);
      if (!selector.colors.every((color) => current.includes(color))) return false;
    }
    /* "Target nonblack creature" (Snuff Out): none of these colors. */
    if (selector.nonColors && selector.nonColors.some((color) => colorsOf(state, id).includes(color))) return false;

    /* Types through the layers: a land animated this turn IS a creature, and a selector that read
       the printed type line would not find it. */
    if (selector.types) {
      const current = typesOf(state, id);
      if (!selector.types.every((type) => current.includes(type))) return false;
    }

    /* Subtypes (CR 205.3): the printed ones, and any the layers added -- an animated land's "Elemental" arrives
       with its types. "A Forest" is a land with the subtype Forest, basic or not (CR 305.6). */
    /* A changeling is every creature type (CR 702.73a; keywords/types.mjs), in every zone. */
    if (selector.subtypes) {
      const current = [...typesOf(state, id), ...(object.zone === "battlefield" ? subtypesOf(state, id) : object.subtypes ?? [])], every = everyCreatureTypeOf(state, id);
      if (!selector.subtypes.every((subtype) => hasSubtype(current, every, subtype))) return false;
    }

    /* Supertypes (CR 205.4): "a basic land card" is a land with the supertype Basic. */
    if (selector.supertypes && !selector.supertypes.every((st) => (object.supertypes ?? []).includes(st))) return false;
    /* "Nonlegendary creature": none of these supertypes. */
    if (selector.nonSupertypes && selector.nonSupertypes.some((st) => (object.supertypes ?? []).includes(st))) return false;

    /* "Nonartifact creature", "non-Elf creature", "noncreature spell": none of these -- and an artifact creature is an
       artifact (CR 205.2b), so "nonartifact" excludes it. */
    if (selector.nonTypes || selector.nonSubtypes) {
      const current = [...typesOf(state, id), ...(object.zone === "battlefield" ? subtypesOf(state, id) : object.subtypes ?? [])], every = everyCreatureTypeOf(state, id);
      if ((selector.nonTypes ?? []).some((type) => current.includes(type))) return false;
      /* "Non-Elf": a changeling is an Elf. */
      if ((selector.nonSubtypes ?? []).some((subtype) => hasSubtype(current, every, subtype))) return false;
    }

    if (selector.named !== undefined && object.card !== selector.named) return false;
    if (selector.token !== undefined && object.token !== selector.token) return false;

    /* Seat 0 is a controller too: not falsy here. */
    if (selector.controller !== undefined && selector.controller !== null) {
      const holder = controllerOf(state, id);
      if (selector.controller === "you" && holder !== chooser) return false;
      if (selector.controller === "opponent" && holder === chooser) return false;
      /* "Each creature that player controls": the player a trigger is about (Balefire Dragon). */
      if (selector.controller === "that player" && holder !== context.about?.player) return false;
      /* A player itself, bound from a target ("exile target player's graveyard", script/bind.mjs). */
      if (Number.isInteger(selector.controller) && holder !== selector.controller) return false;
    }

    /* "Equipped creature": the permanent the source is attached to (CR 301.5, 701.3). */
    if (selector.attachedBy === "self") {
      if (context.source === undefined || context.source === null) throw new Error("A selector using `attachedBy` needs the source attached to it");
      if (state.objects[context.source]?.attachedTo !== id) return false;
    }

    /* CR 109.5 */
    if (selector.another === true) {
      if (context.source === undefined || context.source === null)
        throw new Error("A selector using `another` needs the source it is another than (CR 109.5)");
      if (id === context.source) return false;
    }

    if (selector.manaValue && !matchesManaValue(state, id, selector.manaValue, context)) return false;
    /* "Tapped land your opponents control" (CR 110.5), "creature with a +1/+1 counter on it" (CR 122.1), "power 4 or
       greater" (through the layers), "this creature" itself. */
    if (selector.tapped !== undefined && (object.tapped === true) !== selector.tapped) return false;
    /* "Target spell with a single target" (Misdirection): the spell on the stack, aimed at exactly one thing. */
    /* "With a single target": one object or player chosen in all -- a counted target's list counts each it holds. */
    if (selector.singleTarget === true && (state.stack.find((e) => e.objectId === id)?.targets ?? []).flat().filter(Boolean).length !== 1) return false;
    /* "Target enchantment you control that doesn't have the same name as another permanent you control" (Yenna, batch
       70): no other permanent its controller controls has its name -- a copy's name is the one it copied (CR 707.2). */
    if (selector.uniqueName === true) {
      const holder = controllerOf(state, id);
      /* Nameless -- face down (CR 708.2a) -- it shares a name with nothing. */
      if (object.card !== null && state.zones.battlefield.some((other) => other !== id && state.objects[other].card === object.card && controllerOf(state, other) === holder)) return false;
    }
    /* "A creature card that shares a creature type with a creature you control" (Descendants' Path, batch 73): one of its
       subtypes is one of a permanent's the selector describes, itself aside -- a creature's subtypes are creature types
       (CR 205.3m), the layers' included. */
    if (selector.sharesCreatureType) {
      const mine = new Set(object.subtypes ?? []), mineAll = everyCreatureTypeOf(state, id);
      const others = selectMatching(state, {what: "permanent", ...selector.sharesCreatureType}, context).filter((other) => other !== id);
      /* A changeling shares every creature type (CR 702.73a): with anything that has one. */
      const shares = (other) => {
        const theirs = [...typesOf(state, other), ...(state.objects[other].subtypes ?? [])], theirsAll = characteristicsOf(state, other).everyCreatureType;
        if (mineAll) return theirsAll || theirs.some(isCreatureType);
        if (theirsAll) return [...mine].some(isCreatureType);
        return theirs.some((t) => mine.has(t));
      };
      if (!others.some(shares)) return false;
    }
    /* "A creature spell that shares a creature type with your commander" (Path of Ancestry): with a commander the chooser
       owns, wherever it is (CR 903.3) -- either of two (CR 702.124). A changeling shares every creature type with anything
       that has one (CR 702.73a). */
    if (selector.sharesCreatureTypeWithCommander === true) {
      const mine = creatureTypesOf(state, id);
      const shares = Object.values(state.objects).filter((o) => o.commander === true && o.owner === chooser).some((commander) => {
        const theirs = creatureTypesOf(state, commander.id);
        if (mine.every) return theirs.every || theirs.types.length > 0;
        if (theirs.every) return mine.types.length > 0;
        return mine.types.some((t) => theirs.types.includes(t));
      });
      if (!shares) return false;
    }
    /* "Whenever a goaded creature attacks" (effects/permanents.mjs goad). */
    if (selector.goaded === true && !(state.effects ?? []).some((e) => e.rule === "goaded" && e.affects.ids.includes(id))) return false;
    /* "With a +1/+1 counter on it", or `"any"`: "permanents you control with counters on them" (Mutational Advantage). */
    if (selector.counters !== undefined && !(selector.counters === "any" ? Object.values(object.counters ?? {}).some((n) => n > 0)
      : (object.counters?.[selector.counters] ?? 0) > 0)) return false;
    /* "Creatures that entered this turn" (Force of Despair): on the battlefield since this turn. */
    if (selector.enteredThisTurn === true && !(object.zone === "battlefield" && object.arrivedTurn === state.turn)) return false;
    /* "With toughness greater than its power" (Bedrock Tortoise), through the layers. */
    if (selector.toughnessOverPower === true) { const c = characteristicsOf(state, id); if (!((c.toughness ?? 0) > (c.power ?? 0))) return false; }
    /* "Each equipped creature" (Hemlock Vial; CR 301.5a): an Equipment attached to it -- an Aura is not one -- and still there:
       one that has left the battlefield is a new object, the old one gone (CR 400.7). */
    if (selector.equipped === true && !(object.attachments ?? []).some((other) => state.objects[other] && subtypesOf(state, other).includes("Equipment"))) return false;
    /* "Permanents you don't own" (Agent of Treachery): whose it is, not who controls it (CR 108.3). */
    if (selector.owner === "you" && object.owner !== chooser) return false;
    if (selector.owner === "opponent" && object.owner === chooser) return false;
    /* "If you control a commander" (CR 903.3): a card designated a commander. */
    if (selector.commander === true && object.commander !== true) return false;
    /* "Untap all creatures that attacked this turn" (Relentless Assault): declared as an attacker in a combat this turn. */
    if (selector.attackedThisTurn === true && usesThisTurn(state, id, "attacked") === 0) return false;
    /* "Four or more +1/+1 counters on it": a number of counters of a kind. */
    if (selector.countersAtLeast && ((object.counters ?? {})[selector.countersAtLeast.counter] ?? 0) < selector.countersAtLeast.count) return false;
    /* "Target attacking creature" (Maze of Ith, CR 508.1k): declared as an attacker in this combat. */
    if (selector.attacking === true && !(state.combat?.attacks ?? []).some((attack) => attack.attacker === id)) return false;
    /* "An unblocked attacking creature" (CR 509.1h): its blockers declared -- from the declare blockers step on -- and
       none blocking it. */
    if (selector.unblocked === true && !(BLOCKERS_DECLARED.includes(state.phase) && (state.combat?.attacks ?? []).some((attack) => attack.attacker === id && !attack.blocked))) return false;
    if (selector.power) {
      const power = characteristicsOf(state, id).power ?? 0;
      if (selector.power.min !== undefined && power < selector.power.min) return false;
      if (selector.power.max !== undefined && power > selector.power.max) return false;
      /* "With power greater than target creature's power" (Fell the Mighty): `moreThan`, the target's power, bound to a number
         as the effect resolves (script/bind.mjs). Unbound -- a fact never read, or its target gone -- it matches nothing:
         greater than a power nobody knows is no creature, never every one. */
      if (selector.power.moreThan !== undefined && !(Number.isInteger(selector.power.moreThan) && power > selector.power.moreThan)) return false;
      /* "Target attacking creature with power less than this creature's power" (mentor, CR 702.134a): its source's power now,
         through the layers -- or, gone from the battlefield, as it last was (CR 113.7a, 608.2h). No source to compare with,
         and nothing is less. */
      if (selector.power.lessThan === "self") {
        const source = context.source;
        const theirs = source !== null && source !== undefined && state.objects[source]?.zone === "battlefield" ? characteristicsOf(state, source).power ?? 0
          : context.lastKnown && (source === null || source === undefined || context.lastKnown.cardId === source) ? context.lastKnown.power : null;
        if (!(Number.isInteger(theirs) && power < theirs)) return false;
      }
    }
    /* "Power or toughness 1 or less" (Tetsuko Umezawa): toughness the same way, through the layers. */
    if (selector.toughness) {
      const toughness = characteristicsOf(state, id).toughness ?? 0;
      if (selector.toughness.min !== undefined && toughness < selector.toughness.min) return false;
      if (selector.toughness.max !== undefined && toughness > selector.toughness.max) return false;
    }
    if (selector.self === true && id !== context.source) return false;
    /* "A card exiled with this artifact", "target card exiled with Quintorius" (CR 607.2a, 406.6): one this source's linked
       ability exiled, still that card in exile. */
    if (selector.exiledWith === "self" && !exiledWithSource(state, linkSource(context)).includes(id)) return false;
    /* "A creature with flying": its keywords now, through the layers (CR 702). */
    if (selector.keywords && !selector.keywords.every((word) => keywordsOf(state, id).includes(word))) return false;
    if (selector.target === true && !canBeTargetedBy(state, id, chooser, context.source ?? null)) return false;

    return true;
  };
}

/**
 * Everything a selector matches right now, in a stable order.
 *
 * Zone order for objects, seat order for players — both already deterministic, so a replay picks
 * the same candidates in the same order.
 */
export function selectMatching(state, selector, context = {}) {
  const match = compileSelector(selector);
  const what = selector.what ?? "permanent";
  if (what === "player") return state.players.map((p) => p.id).filter((id) => match(state, id, context));

  const zone = selector.zone ?? DEFAULT_ZONE[what];
  const candidates = zone === "battlefield" || zone === "stack" || zone === "exile"
    ? state.zones[zone]
    : state.zones[zone].flat();
  return candidates.filter((id) => match(state, id, context));
}
