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

import {typesOf, keywordsOf, controllerOf} from "../rules/layers.mjs";
import {parseManaCost, manaValue} from "../rules/mana.mjs";

/** Every key a selector may carry. Anything else is a bug in whatever wrote it. */
export const SELECTOR_KEYS = Object.freeze([
  "what", "types", "subtypes", "supertypes", "nonTypes", "nonSubtypes", "zone", "controller", "who", "another", "target", "token", "manaValue", "named",
]);

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

function matchesManaValue(state, id, rule) {
  const cost = state.objects[id].manaCost;
  const value = cost ? manaValue(parseManaCost(cost)) : 0;
  if (rule.exactly !== undefined) return value === rule.exactly;
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

    /* "Nonartifact creature", "non-Elf creature", "noncreature spell": none of these -- and an artifact creature is an
       artifact (CR 205.2b), so "nonartifact" excludes it. */
    if (selector.nonTypes || selector.nonSubtypes) {
      const current = [...typesOf(state, id), ...(object.subtypes ?? [])];
      if ((selector.nonTypes ?? []).some((type) => current.includes(type))) return false;
      if ((selector.nonSubtypes ?? []).some((subtype) => current.includes(subtype))) return false;
    }

    if (selector.named !== undefined && object.card !== selector.named) return false;
    if (selector.token !== undefined && object.token !== selector.token) return false;

    if (selector.controller) {
      const holder = controllerOf(state, id);
      if (selector.controller === "you" && holder !== chooser) return false;
      if (selector.controller === "opponent" && holder === chooser) return false;
    }

    /* CR 109.5 */
    if (selector.another === true) {
      if (context.source === undefined || context.source === null)
        throw new Error("A selector using `another` needs the source it is another than (CR 109.5)");
      if (id === context.source) return false;
    }

    if (selector.manaValue && !matchesManaValue(state, id, selector.manaValue)) return false;
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
