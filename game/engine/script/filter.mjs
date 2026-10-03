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

import {usesThisTurn} from "../state/index.mjs";
import {typesOf, keywordsOf, controllerOf, characteristicsOf} from "../rules/layers.mjs";
import {parseManaCost, manaValue} from "../rules/mana.mjs";

/* The steps after blockers are declared, in which an attacker is blocked or unblocked (CR 509.1h). */
const BLOCKERS_DECLARED = ["COMBAT_DECLARE_BLOCKERS", "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END"];

/** Every key a selector may carry. Anything else is a bug in whatever wrote it. */
export const SELECTOR_KEYS = Object.freeze([
  "what", "types", "subtypes", "supertypes", "nonTypes", "nonSubtypes", "zone", "controller", "who", "another", "target", "token", "manaValue", "named",
  "attachedBy", "colors", "tapped", "counters", "power", "self", "keywords", "nonSupertypes", "colorless", "attacking", "toughness", "countersAtLeast", "attackedThisTurn", "commander", "nonColors", "owner", "enteredThisTurn", "toughnessOverPower",
  "unblocked", "singleTarget",
]);

/* A SELECTOR READ AGAINST LAST KNOWN INFORMATION (CR 603.10a, 608.2h). "Whenever another creature you control dies"
   asks what the thing was and whose, and by then it is a new object in a graveyard (CR 400.7): only the snapshot taken
   as it left (rules/layers.mjs, lastKnown) still knows. These are the keys a departure's filter may use. */
const LAST_KNOWN_KEYS = ["what", "types", "subtypes", "supertypes", "nonTypes", "nonSubtypes", "controller", "token", "another", "attachedBy", "anyOf"];
export function matchesLastKnown(selector, lki, context = {}) {
  if (!lki) return false;
  const s = selector ?? {};
  for (const key of Object.keys(s)) if (!LAST_KNOWN_KEYS.includes(key)) throw new Error(`A filter on something that has left the battlefield cannot use \`${key}\``);
  if (Array.isArray(s.anyOf)) return s.anyOf.some((one) => matchesLastKnown({...one, ...(s.controller ? {controller: s.controller} : {})}, lki, context));
  if (s.what && s.what !== "permanent" && s.what !== "card") return false;
  const types = lki.types ?? [], subtypes = [...types, ...(lki.subtypes ?? [])];
  if (s.types && !s.types.every((t) => types.includes(t))) return false;
  if (s.nonTypes && s.nonTypes.some((t) => types.includes(t))) return false;
  if (s.subtypes && !s.subtypes.every((t) => subtypes.includes(t))) return false;
  if (s.nonSubtypes && s.nonSubtypes.some((t) => subtypes.includes(t))) return false;
  if (s.supertypes && !s.supertypes.every((t) => (lki.supertypes ?? []).includes(t))) return false;
  if (s.controller === "you" && lki.controller !== context.controller) return false;
  if (s.controller === "opponent" && lki.controller === context.controller) return false;
  if (s.token !== undefined && (lki.token === true) !== s.token) return false;
  if (s.another === true && lki.cardId === context.source) return false;
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
}

/* CR 115.2, and the difference between the two keywords is the part worth getting right:
   hexproof stops opponents only (CR 702.11b); shroud stops everybody, its controller included. */
function canBeTargetedBy(state, id, chooser) {
  const keywords = keywordsOf(state, id);
  if (keywords.includes("Shroud")) return false;
  if (keywords.includes("Hexproof") && controllerOf(state, id) !== chooser) return false;
  /* Protection is deferred and named: "protection from" carries a quality the card script has to
     express, and there is nothing yet to express it with. When phase 2 gives it one, it goes
     here and every targeting selector gains it at once. */
  return true;
}

function matchesManaValue(state, id, rule, context = {}) {
  const cost = state.objects[id].manaCost;
  const value = cost ? manaValue(parseManaCost(cost)) : 0;
  /* "With mana value X" (Likeness Looter): the X paid, as it is targeted and as it resolves. */
  if (rule.exactly !== undefined) return value === (rule.exactly === "X" ? context.x ?? 0 : rule.exactly);
  if (rule.min !== undefined && value < rule.min) return false;
  if (rule.max !== undefined && value > rule.max) return false;
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
    if (selector.colorless === true && (characteristicsOf(state, id).colors ?? []).length > 0) return false;
    /* "Permanents that are one or more colors" (All Is Dust). */
    if (selector.colorless === false && (characteristicsOf(state, id).colors ?? []).length === 0) return false;
    if (selector.colors) {
      const current = characteristicsOf(state, id).colors ?? [];
      if (!selector.colors.every((color) => current.includes(color))) return false;
    }
    /* "Target nonblack creature" (Snuff Out): none of these colors. */
    if (selector.nonColors && selector.nonColors.some((color) => (characteristicsOf(state, id).colors ?? []).includes(color))) return false;

    /* Types through the layers: a land animated this turn IS a creature, and a selector that read
       the printed type line would not find it. */
    if (selector.types) {
      const current = typesOf(state, id);
      if (!selector.types.every((type) => current.includes(type))) return false;
    }

    /* Subtypes (CR 205.3): the printed ones, and any the layers added -- an animated land's "Elemental" arrives
       with its types. "A Forest" is a land with the subtype Forest, basic or not (CR 305.6). */
    if (selector.subtypes) {
      const current = [...typesOf(state, id), ...(object.subtypes ?? [])];
      if (!selector.subtypes.every((subtype) => current.includes(subtype))) return false;
    }

    /* Supertypes (CR 205.4): "a basic land card" is a land with the supertype Basic. */
    if (selector.supertypes && !selector.supertypes.every((st) => (object.supertypes ?? []).includes(st))) return false;
    /* "Nonlegendary creature": none of these supertypes. */
    if (selector.nonSupertypes && selector.nonSupertypes.some((st) => (object.supertypes ?? []).includes(st))) return false;

    /* "Nonartifact creature", "non-Elf creature", "noncreature spell": none of these -- and an artifact creature is an
       artifact (CR 205.2b), so "nonartifact" excludes it. */
    if (selector.nonTypes || selector.nonSubtypes) {
      const current = [...typesOf(state, id), ...(object.subtypes ?? [])];
      if ((selector.nonTypes ?? []).some((type) => current.includes(type))) return false;
      if ((selector.nonSubtypes ?? []).some((subtype) => current.includes(subtype))) return false;
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
    if (selector.singleTarget === true && (state.stack.find((e) => e.objectId === id)?.targets ?? []).length !== 1) return false;
    /* "With a +1/+1 counter on it", or `"any"`: "permanents you control with counters on them" (Mutational Advantage). */
    if (selector.counters !== undefined && !(selector.counters === "any" ? Object.values(object.counters ?? {}).some((n) => n > 0)
      : (object.counters?.[selector.counters] ?? 0) > 0)) return false;
    /* "Creatures that entered this turn" (Force of Despair): on the battlefield since this turn. */
    if (selector.enteredThisTurn === true && !(object.zone === "battlefield" && object.arrivedTurn === state.turn)) return false;
    /* "With toughness greater than its power" (Bedrock Tortoise), through the layers. */
    if (selector.toughnessOverPower === true) { const c = characteristicsOf(state, id); if (!((c.toughness ?? 0) > (c.power ?? 0))) return false; }
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
    }
    /* "Power or toughness 1 or less" (Tetsuko Umezawa): toughness the same way, through the layers. */
    if (selector.toughness) {
      const toughness = characteristicsOf(state, id).toughness ?? 0;
      if (selector.toughness.min !== undefined && toughness < selector.toughness.min) return false;
      if (selector.toughness.max !== undefined && toughness > selector.toughness.max) return false;
    }
    if (selector.self === true && id !== context.source) return false;
    /* "A creature with flying": its keywords now, through the layers (CR 702). */
    if (selector.keywords && !selector.keywords.every((word) => keywordsOf(state, id).includes(word))) return false;
    if (selector.target === true && !canBeTargetedBy(state, id, chooser)) return false;

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
