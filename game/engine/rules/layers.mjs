/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CONTINUOUS EFFECTS AND LAYERS: CR 611 TO 613.
 *
 * `docs/engine/PLAN.md` §3.3, ninth row — "the layer system with timestamps and dependency
 * (613.8)".
 *
 * THE STATE HOLDS PRINTED VALUES; THIS DERIVES CURRENT ONES. Every other design is worse in the
 * same way. An engine that applies an anthem by adding one to a creature's power in the state
 * cannot take it back when the anthem leaves, cannot order it against a later effect, and cannot
 * answer "what is this creature without the anthem" — which is the question every subsequent effect
 * has to ask. Here, an effect leaving costs nothing: the next derivation simply does not include
 * it.
 *
 * LAYERS ARE CATEGORIES, NOT PRIORITIES (CR 613.1). Everything in layer 4 happens before anything
 * in layer 6, whatever the timestamps, because a type change decides what an ability-granting
 * effect even applies to. Within a layer it is timestamp order (CR 613.7).
 *
 * THE SUBLAYERS OF LAYER 7 ARE COUNTERINTUITIVE AND THE ORDER IS THE RULE (CR 613.4):
 *
 *   7a  characteristic-defining abilities   (a printed power or toughness that reads off the game)
 *   7b  effects that SET power and toughness
 *   7c  effects that MODIFY them (+2/+2)
 *   7d  counters
 *   7e  effects that switch them
 *
 * So "becomes 1/1" followed by "+2/+2" is a 3/3 whichever was played first, and a +1/+1 counter on
 * a creature set to 1/1 makes it 2/2. Getting this backwards produces boards that are wrong in a
 * way players notice at once and cannot explain.
 *
 * DEPENDENCY BEATS TIMESTAMP (CR 613.8). If applying one effect would change what another applies
 * to, the dependent one waits however old it is. Timestamp order alone is wrong exactly when two
 * effects in one layer interact, which is when anybody is looking.
 *
 * WHAT IS DEFERRED AND NAMED: layer 1 (copy effects, CR 706), layer 3 (text-changing) and layer 7a
 * (characteristic-defining abilities) all need the card script to express them, and each has its
 * slot in the table below rather than being absent. CR 613.8b's dependency LOOP — where two effects
 * depend on each other — falls back to timestamp order here, which is what the rule says to do.
 */

import {conditionHolds} from "../script/condition.mjs";
import {isCounted, amountOf} from "../script/amount.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {hasSubtype, everyCreatureType} from "../keywords/types.mjs";

/** The seven layers of CR 613.1, in order. */
export const LAYERS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

/** The sublayers of layer 7, in the order CR 613.4 gives. */
const SUBLAYERS = Object.freeze(["a", "b", "c", "d", "e"]);

/* KEYWORD COUNTERS (CR 122.1b): a counter that is a keyword gives the object that keyword -- in layer 6 (CR 613.1f), read
   here with its printed keywords; an effect that removes abilities takes away only the ones whose counter was put on
   before it, in timestamp order (CR 613.7): Abigale's "loses all abilities. Put a flying counter ... on that creature"
   leaves it flying. A counter's timestamp is its placing (effects/resources.mjs addCounters); one it entered with is as
   old as the permanent. The ones the engine plays. */
const KEYWORD_COUNTERS = Object.freeze({"flying": "Flying", "first strike": "First Strike", "double strike": "Double Strike", "deathtouch": "Deathtouch",
  "haste": "Haste", "hexproof": "Hexproof", "indestructible": "Indestructible", "lifelink": "Lifelink", "menace": "Menace", "reach": "Reach",
  "trample": "Trample", "vigilance": "Vigilance"});
const counterKeywords = (counters) => Object.entries(counters ?? {}).filter(([kind, n]) => n > 0 && KEYWORD_COUNTERS[kind]).map(([kind]) => KEYWORD_COUNTERS[kind]);
export const isKeywordCounter = (kind) => Boolean(KEYWORD_COUNTERS[kind]);
/* The keywords an object's counters give it, each with its counter's timestamp. */
const stampedCounterKeywords = (object) => Object.entries(object.counters ?? {}).filter(([kind, n]) => n > 0 && KEYWORD_COUNTERS[kind])
  .map(([kind]) => [KEYWORD_COUNTERS[kind], object.counterStamps?.[kind] ?? object.timestamp ?? 0]);

/* An object's printed characteristics: where a derivation starts. */
function printed(state, id) {
  const object = state.objects[id];
  return {
    id,
    card: object.card,
    types: [...(object.types ?? [])],
    /* Subtypes, which layer 4 may set ("is a colorless Forest land", Song of the Dryads). */
    subtypes: [...(object.subtypes ?? [])],
    colors: [...(object.colors ?? [])],
    keywords: [...new Set([...(object.keywords ?? []), ...counterKeywords(object.counters)])],
    counterKeywords: stampedCounterKeywords(object),
    /* Changeling (CR 702.73a), every creature type; an effect may make it so in layer 4 (applyEffect). */
    everyCreatureType: everyCreatureType(object.keywords),
    power: object.power,
    toughness: object.toughness,
    controller: object.controller,
    counters: {...object.counters},
    /* Abilities other effects give it (batch 76), in the order they were given. */
    granted: [],
  };
}

/* Does this effect apply to this object, given what it currently looks like? The question is asked
   against the PARTIALLY DERIVED object, which is what makes layer 2 able to change who an anthem
   sees and layer 4 able to bring a land into a creature effect's reach.
 *
 * IT READS THE SELECTOR GRAMMAR'S KEYS, NOT A DIALECT OF ITS OWN. `script/filter.mjs` says
 * `controller: "you"`, so this does too. It cannot CALL `compileSelector` — that matcher reads
 * fully derived characteristics through `typesOf`, and deriving is what this is in the middle of
 * doing, so it would recurse. Two matchers over one shape is fine; two spellings of the same idea
 * is what produced a `pumpAll` that pumped the opponent's creatures as well, silently, because
 * "you" was not a word this understood. */
/* THE KEYS A LAYER STATIC'S `affects` MAY CARRY -- this matcher's, narrower than the selector grammar because the layers
   cannot ask what they are still deriving. Anything else would be ignored, and a static would affect more than it says:
   the card compiler refuses it (cards/index.mjs). */
export const LAYER_AFFECTS_KEYS = Object.freeze(["anyOf", "what", "ids", "types", "subtypes", "supertypes", "controller", "token", "another", "self", "attachedBy", "colors", "colorless", "countersAtLeast", "tapped", "counters"]);

function affects(state, effect, current, sourceController) {
  const rule = effect.affects ?? {};
  /* "Artifacts and creatures you control have ward {1}" (Thorin): any of these, each with what they share -- an artifact
     creature once, where two statics would give it the ability twice. */
  if (Array.isArray(rule.anyOf)) {
    const {anyOf, ...shared} = rule;
    return anyOf.some((one) => affects(state, {...effect, affects: {...shared, ...one}}, current, sourceController));
  }
  if (rule.ids && !rule.ids.includes(current.id)) return false;
  if (rule.types && !rule.types.every((type) => current.types.includes(type))) return false;
  if (rule.controller === "you" && current.controller !== sourceController) return false;
  if (rule.controller === "opponent" && current.controller === sourceController) return false;
  if (Number.isInteger(rule.controller) && current.controller !== rule.controller) return false;
  if (rule.token !== undefined && (state.objects[current.id]?.token ?? false) !== rule.token) return false;
  /* "Other Elf creatures you control get +1/+1": a subtype (printed, or a type the layers added), and not the source. */
  /* A changeling is every creature type (CR 702.73a): an Elf lord's "other Elves" takes it in. */
  if (rule.subtypes && !rule.subtypes.every((t) => current.types.includes(t) || hasSubtype(current.subtypes, current.everyCreatureType, t))) return false;
  /* "Legendary Humans you control have indestructible" (General's Enforcer): printed supertypes, which no layer changes. */
  if (rule.supertypes && !rule.supertypes.every((t) => (state.objects[current.id]?.supertypes ?? []).includes(t))) return false;
  if (rule.another === true && current.id === effect.sourceId) return false;
  /* "This creature's power and toughness are each equal to ...": the source itself. */
  if (rule.self === true && current.id !== effect.sourceId) return false;
  /* "Equipped creature has haste": the one its source is attached to (CR 301.5). */
  if (rule.attachedBy === "self" && state.objects[effect.sourceId]?.attachedTo !== current.id) return false;
  /* "As long as enchanted creature is white" (Steel of the Godhead): its colors as they now are -- layer 5 is done by the
     time layers 6 and 7 ask. */
  if (rule.colors && !rule.colors.every((color) => (current.colors ?? []).includes(color))) return false;
  /* "Colorless creatures you control get +2/+2" (Forsaken Monument): no color, as layer 5 left it. */
  if (rule.colorless === true && (current.colors ?? []).length > 0) return false;
  /* "As long as this creature has four or more +1/+1 counters on it" (Voice of the Blessed): counters as they are now. */
  if (rule.countersAtLeast && ((current.counters ?? {})[rule.countersAtLeast.counter] ?? 0) < rule.countersAtLeast.count) return false;
  /* "Permanents you control with counters on them have ward {1}" (Innkeeper's Talent): `counters` "any" -- or a kind, "with
     a +1/+1 counter on it" -- as the selector grammar says it (script/filter.mjs), its counters as they are now. */
  if (rule.counters !== undefined && !(rule.counters === "any" ? Object.values(current.counters ?? {}).some((n) => n > 0)
    : ((current.counters ?? {})[rule.counters] ?? 0) > 0)) return false;
  /* "Other tapped legendary creatures you control have indestructible" (The Seriema): tapped as it is, which no layer changes. */
  if (rule.tapped !== undefined && (state.objects[current.id]?.tapped === true) !== rule.tapped) return false;
  return true;
}

/** Whether a static ability's `affects` takes in this object as it currently is (rules/statics.mjs reads it). */
export const staticAffects = (state, effect, id, sourceController) => affects(state, effect, characteristicsOf(state, id), sourceController);

function applyEffect(current, effect) {
  const change = effect.apply ?? {};
  if (Number.isInteger(change.controller)) current.controller = change.controller;
  /* CR 613.1d: "in addition to its other types" adds; setTypes replaces. */
  if (change.addTypes) for (const type of change.addTypes) if (!current.types.includes(type)) current.types.push(type);
  if (change.setTypes) current.types = [...change.setTypes];
  /* "Enchanted permanent is a colorless Forest land" (Song of the Dryads): its subtypes set, every other one lost (CR 205.1b). */
  if (change.setSubtypes) { current.subtypes = [...change.setSubtypes]; current.everyCreatureType = false; }
  /* "It's not a creature" (impending, CR 702.176a): that type taken away, the rest kept. */
  if (change.removeTypes) current.types = current.types.filter((type) => !change.removeTypes.includes(type));
  if (change.setColors) current.colors = [...change.setColors];
  /* "Gain all creature types" (Mirror Entity, batch 74): a type change, layer 4 (CR 613.1d). */
  if (change.allCreatureTypes === true) current.everyCreatureType = true;
  /* "Loses all abilities" (CR 613.1f): its own, and any given it before -- one given after, in timestamp order, it keeps. */
  if (change.removeAllAbilities) {
    /* A keyword counter put on after it keeps its keyword (above). */
    current.keywords = [...new Set((current.counterKeywords ?? []).filter(([, stamp]) => stamp > (effect.timestamp ?? 0)).map(([word]) => word))];
    current.granted = []; current.lostAbilities = true;
  }
  /* GRANTED ABILITIES (Forge's AddAbility, batch 76): "lands you control have '{T}: Add one mana of any color'", "equipped
     creature has 'Whenever this creature attacks, create a Treasure token'" -- abilities compiled as a card's own are
     (cards/index.mjs), each with an id naming the effect that gave it -- its timestamp, and which of its holder's
     abilities it is -- so two grants of one ability are two abilities. */
  if (change.addAbilities) for (const ability of change.addAbilities)
    current.granted.push({...ability, id: `granted:${effect.timestamp ?? ""}:${effect.id ?? ""}:${ability.id}`});
  if (change.addKeywords) for (const word of change.addKeywords) if (!current.keywords.includes(word)) current.keywords.push(word);
  if (Number.isInteger(change.setPower)) current.power = change.setPower;
  if (Number.isInteger(change.setToughness)) current.toughness = change.setToughness;
  if (Number.isInteger(change.power) && current.power !== null) current.power += change.power;
  if (Number.isInteger(change.toughness) && current.toughness !== null) current.toughness += change.toughness;
  if (change.switchPT === true && current.power !== null) {
    const was = current.power;
    current.power = current.toughness;
    current.toughness = was;
  }
  return current;
}

/* A STATIC ABILITY'S CONDITION (Forge's IsPresentStatic): "as long as you control three or more creatures". Asked as the
   effects are gathered, every time. Counting creatures asks their types, which are derived here, so a condition asked
   while another is being asked leaves conditional statics out of that inner derivation (they change keywords and power,
   never what a condition counts) instead of asking forever. */
let conditioning = 0;
function holdsNow(state, condition, context) {
  if (!condition) return true;
  if (conditioning > 0) return false;
  conditioning += 1;
  try { return conditionHolds(state, condition, context); } finally { conditioning -= 1; }
}

/* Every continuous effect in play: the static abilities of permanents, plus effects with a
   duration that a resolved spell left behind in `state.effects`. And a card's static that works from its owner's
   graveyard (`worksFrom: "graveyard"`, CR 113.6b): "as long as this card is in your graveyard and you control a Mountain".
   Gathered once per derivation and guard level (`memo`). */
function allEffects(state) {
  const key = memo !== null && memo.state === state ? (conditioning > 0 ? "inner" : "outer") : null;
  if (key !== null && memo.effects.has(key)) return memo.effects.get(key);
  const found = gatherEffects(state);
  if (key !== null) memo.effects.set(key, found);
  return found;
}
function gatherEffects(state) {
  const found = [];
  for (const graveyard of state.zones.graveyard ?? []) for (const id of graveyard) {
    const card = state.objects[id];
    for (const ability of card?.abilities ?? []) {
      if (ability.kind !== "static" || ability.worksFrom !== "graveyard" || ability.rule) continue;
      if (!holdsNow(state, ability.condition, {controller: card.owner, source: id})) continue;
      found.push({...ability, sourceId: id, sourceController: card.owner, timestamp: ability.timestamp ?? card.timestamp});
    }
  }
  for (const id of state.zones.battlefield) {
    const holder = state.objects[id];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static") continue;
      /* One that works from a graveyard does not work here (CR 113.6). */
      if (ability.worksFrom === "graveyard") continue;
      if (!holdsNow(state, ability.condition, {controller: holder.controller, source: id})) continue;
      found.push({
        /* "Creatures you control of the chosen type get +1/+1", "this creature is the chosen type": its own choice. */
        ...chosenFor(ability, holder),
        sourceId: id,
        sourceController: holder.controller,
        /* A static ability's timestamp is its permanent's (CR 613.7d). */
        timestamp: ability.timestamp ?? holder.timestamp,
      });
    }
  }
  for (const effect of state.effects ?? []) {
    found.push({...effect, sourceController: effect.sourceController ?? null});
  }
  return found;
}

/* A COUNTED CHANGE (script/amount.mjs): "power and toughness each equal to the number of cards in your hand" (CR 604.3,
   a characteristic-defining ability, 7a) and "+1/+1 for each land you control" (7c) are counted each time the layer is
   applied, not once. Counting asks other objects' types and controllers, and a count made while another count is
   being made skips the counted changes it meets: they change power and toughness only, never what is counted, and
   without the skip two Masters of Etherium would each ask the other forever. */
let counting = 0;
function counted(state, effect) {
  const change = effect.apply ?? {};
  if (!Object.values(change).some(isCounted)) return effect;
  if (counting > 0) return null;
  counting += 1;
  try {
    const context = {controller: effect.sourceController, source: effect.sourceId ?? null, x: state.objects[effect.sourceId]?.xPaid ?? 0};
    return {...effect, apply: Object.fromEntries(Object.entries(change).map(([k, v]) => [k, isCounted(v) ? amountOf(state, v, context) : v]))};
  } finally {
    counting -= 1;
  }
}

/* The same effect without its counted amounts, for a derivation that will not be asked power or toughness: what else it
   does (a keyword it gives with them) still applies. */
function uncounted(effect) {
  const change = effect.apply ?? {};
  if (!Object.values(change).some(isCounted)) return effect;
  return {...effect, apply: Object.fromEntries(Object.entries(change).filter(([, v]) => !isCounted(v)))};
}

/* Two derived objects compared by VALUE, not by the order things happen to sit in their lists.
   Without this, two effects that each add a type produce the same set in a different order and look
   mutually dependent — which resolves as a dependency loop and quietly falls back to timestamps,
   turning the dependency rule off exactly where it was needed. */
const canonical = (current) => JSON.stringify({
  ...current,
  types: [...current.types].sort(),
  colors: [...current.colors].sort(),
  keywords: [...current.keywords].sort(),
});

/* CR 613.8a: A depends on B when applying B first would change what A applies to, or what A does.
   The test is done by applying B and asking whether A's outcome moves, each on a trial copy of the derivation so far.
   `applyEffect` sets top-level fields and pushes onto the top-level lists, and changes nothing inside them (a granted
   ability is pushed as a new object), so a trial is the derivation with its own lists: a deep copy of every granted
   ability's script, four per pair (by structuredClone, then a plain copy), was most of a whole game's CPU
   (engine-room-games seed 11, 2026-10-05: the review's F-2). */
const trial = (c) => ({...c, types: [...c.types], subtypes: [...c.subtypes], colors: [...c.colors], keywords: [...c.keywords], granted: [...c.granted]});
function dependsOn(state, a, b, base, sourceOf) {
  trials += 1;
  const withoutB = applyEffect(trial(base), a);
  const afterB = applyEffect(trial(base), b);
  const appliesAfterB = affects(state, a, afterB, sourceOf(a));
  const appliedBefore = affects(state, a, base, sourceOf(a));
  /* Whether A applies at all has changed. */
  if (appliesAfterB !== appliedBefore) return true;
  if (!appliesAfterB) return false;
  /* Or what it produces has changed by more than B's own contribution. */
  const both = applyEffect(trial(afterB), a);
  const reverse = applyEffect(trial(withoutB), b);
  return canonical(both) !== canonical(reverse);
}

/* Order one layer's effects: timestamp order (CR 613.7), then move any effect that depends on a
   later one behind it (CR 613.8). A dependency loop falls back to timestamps, as the rule says.
   Whether A depends on B is asked against the same `base` for the whole ordering, so each pair is asked once: asked
   afresh on every pass, an ordering of n effects made about n^3 trials, and a board with a dozen effects in one layer
   spent seconds there (the review's F-2). */
function orderWithin(state, effects, base, sourceOf) {
  const byTime = [...effects].sort((x, y) => (x.timestamp ?? 0) - (y.timestamp ?? 0));
  const out = [];
  const remaining = [...byTime];
  const index = new Map(byTime.map((effect, i) => [effect, i])), asked = new Map();
  const depends = (x, y) => {
    const key = index.get(x) * byTime.length + index.get(y);
    if (!asked.has(key)) asked.set(key, dependsOn(state, x, y, base, sourceOf));
    return asked.get(key);
  };
  let guard = 0;
  while (remaining.length > 0 && guard < 64) {
    guard += 1;
    /* The first effect that does not depend on anything still waiting. */
    const at = remaining.findIndex((candidate) =>
      !remaining.some((other) => other !== candidate && depends(candidate, other)));
    /* Every remaining effect depends on another: a loop, so CR 613.8b says use timestamps. */
    out.push(...(at < 0 ? remaining.splice(0) : remaining.splice(at, 1)));
  }
  return out;
}

/* A DERIVATION'S MEMO. Deriving an object asks about others -- a static's condition counts Mountains, a counted power
   counts creatures -- and each of those is derived in turn, the same ones again and again: with Anger in a graveyard ("as
   long as you control a Mountain") and Adeline's power counting creatures on a board of 57 permanents, one projection
   derived the board hundreds of thousands of times, and a game took seconds a step (engine-room-games seed 1,
   2026-10-03). Deriving changes nothing in the game. So while a derivation runs -- or a question that only reads and
   asks many (`deriving`: a projection, the offers) -- each object is derived once per guard level (a condition being
   asked, a count being made: each leaves something out, holdsNow and counted) and the effects in play are gathered once
   per level; every answer handed out is a copy. The memo lives no longer than the call that opened it, so nothing that
   changes the game meets an answer from before the change. `memoOff` is for the suite that compares the two. */
let memo = null, memoOff = false, derivations = 0, trials = 0;
/** Run `fn`, a question that reads the game and changes nothing, with one memo for every derivation it makes. */
export function deriving(state, fn) {
  if (memo !== null || memoOff) return fn();
  memo = {state, characteristics: new Map(), effects: new Map(), asked: new Map()};
  try { return fn(); } finally { memo = null; }
}
/** Inside a `deriving` question, `fn`'s answer about the whole board, made once per guard level (as a derivation is) and
    kept under `key` (the protections in play, asked once per target candidate); outside one, made afresh. The answer is
    shared: never to be edited. */
export function onceAQuestion(state, key, fn) {
  if (memo === null || memo.state !== state) return fn();
  const at = `${key}|${conditioning > 0 ? 1 : 0}|${counting > 0 ? 1 : 0}`;
  if (!memo.asked.has(at)) memo.asked.set(at, fn());
  return memo.asked.get(at);
}
/** Derive afresh for the length of `fn`, then go back to the memo that was open: an object shown another way for a moment --
    an adventurer card weighed as its Adventure (CR 715.3a; rules/actions.mjs) -- is read as it then is, and what the open
    memo holds of it as it was is neither read nor overwritten. With no memo open -- the cast itself, which changes the
    game -- none is opened: each derivation is its own, as ever outside one. */
export function derivingAfresh(state, fn) {
  if (memo === null) return fn();
  const outer = memo;
  memo = {state, characteristics: new Map(), effects: new Map(), asked: new Map()};
  try { return fn(); } finally { memo = outer; }
}
/** For the suites: turn the memo off (to compare), and how many derivations -- and dependency trials (CR 613.8a,
    `dependsOn`) -- were made since `reset`. */
export const deriveMemo = {off(value = true) { memoOff = value; }, count() { return derivations; }, trials() { return trials; }, reset() { derivations = 0; trials = 0; }};
const copy = (v) => (Array.isArray(v) ? v.map(copy) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)])) : v);

/**
 * What an object currently is: printed characteristics with every continuous effect applied in the
 * order CR 613 gives.
 *
 * Returns a fresh object each time. A caller that edits the answer has not edited the game, which
 * is the same promise the projection makes and for the same reason.
 */
export function characteristicsOf(state, id) {
  /* Outside a memo the answer is this call's alone; inside one it is shared, and handed out as a copy. */
  const shared = memo !== null;
  const current = derived(state, id);
  return shared ? copy(current) : current;
}

/* The derivation, from the memo when one is open: shared, never to be edited -- the accessors below hand out a field.
   `counts`: whether the question needs power and toughness. A counted change ("+1/+1 for each creature you control",
   "power equal to the number of cards in your hand") changes only those (`counted`), and counting asks about the whole
   board again; who controls an object, what it is and what it has are derived with every effect but its counted
   amounts. A derivation with them answers a question without. */
function derived(state, id, counts = true) {
  if (!state.objects[id]) throw new Error(`There is no object ${id} to describe`);
  if (memo === null && !memoOff) return deriving(state, () => derived(state, id, counts));
  const key = memo !== null && memo.state === state ? `${id}|${conditioning > 0 ? 1 : 0}|${counting > 0 ? 1 : 0}` : null;
  const known = key !== null ? memo.characteristics.get(key) : undefined;
  if (known && (known.counts || !counts)) return known.current;
  const current = derive(state, id, counts);
  if (key !== null) memo.characteristics.set(key, {counts, current});
  return current;
}

function derive(state, id, counts = true) {
  derivations += 1;
  let current = printed(state, id);
  const effects = allEffects(state);
  const sourceOf = (effect) => effect.sourceController;

  for (const layer of LAYERS) {
    const inLayer = effects.filter((effect) => (effect.layer ?? 0) === layer);
    /* Layer 7 always runs, even with no effects in it: counters are sublayer 7d and they are not
       an effect, they are on the object. Skipping the layer because nothing else was in it left
       every counter on every board doing nothing. */
    if (inLayer.length === 0 && layer !== 7) continue;

    if (layer !== 7) {
      for (const effect of orderWithin(state, inLayer, current, sourceOf)) {
        if (affects(state, effect, current, sourceOf(effect))) current = applyEffect(current, effect);
      }
      continue;
    }

    /* CR 613.4: layer 7 runs sublayer by sublayer, and counters are 7d — after anything that sets
       power and toughness, and after anything that modifies them. */
    for (const sublayer of SUBLAYERS) {
      if (sublayer === "d") {
        /* +1/+1 and -1/-1, and every other "+X/+Y" counter (CR 122.1a): the -0/-1 counters on Wall of Roots. */
        for (const [kind, n] of Object.entries(current.counters ?? {})) {
          const pt = /^([+-]\d+)\/([+-]\d+)$/.exec(kind);
          if (!pt || !(n > 0)) continue;
          if (current.power !== null) current.power += Number(pt[1]) * n;
          if (current.toughness !== null) current.toughness += Number(pt[2]) * n;
        }
        continue;
      }
      const here = inLayer.filter((effect) => (effect.sublayer ?? "c") === sublayer);
      for (const effect of orderWithin(state, here, current, sourceOf)) {
        if (!affects(state, effect, current, sourceOf(effect))) continue;
        const now = counts ? counted(state, effect) : uncounted(effect);
        if (now) current = applyEffect(current, now);
      }
    }
  }

  return current;
}

/** Current power. Null for an object that has none — which is not the same as zero. */
export const powerOf = (state, id) => derived(state, id).power ?? 0;
/** Current toughness, by the same rule. */
export const toughnessOf = (state, id) => derived(state, id).toughness ?? 0;
/** Who currently controls it, after layer 2. */
export const controllerOf = (state, id) => derived(state, id, false).controller;
/** What it currently is, after layer 4 (a copy, as every answer here is). */
export const typesOf = (state, id) => [...derived(state, id, false).types];
/** What it currently has, after layer 6. */
export const keywordsOf = (state, id) => [...derived(state, id, false).keywords];
/** Its colors, after layer 5. */
export const colorsOf = (state, id) => [...(derived(state, id, false).colors ?? [])];
/** Its subtypes, after layer 4. */
export const subtypesOf = (state, id) => [...derived(state, id, false).subtypes];
/** Whether it is every creature type (a changeling, CR 702.73a, or an effect's, layer 4). */
export const everyCreatureTypeOf = (state, id) => derived(state, id, false).everyCreatureType === true;

/* Its own abilities unless it lost them, then the ones given it. */
const heldAbilities = (object, current) => [...(current.lostAbilities ? [] : object.abilities ?? []), ...current.granted];

/* Whether any effect in play may give or take abilities -- an effect left behind, a static on the battlefield or in a
   graveyard (where one may work from, allEffects): when none does, a permanent's abilities are its own, and nothing need
   be derived to read them. */
function abilitiesChange(state) {
  const changes = (apply) => Boolean(apply && (apply.addAbilities || apply.removeAllAbilities));
  if ((state.effects ?? []).some((effect) => changes(effect.apply))) return true;
  const holders = [...state.zones.battlefield, ...(state.zones.graveyard ?? []).flat()];
  return holders.some((id) => (state.objects[id].abilities ?? []).some((ability) => ability.kind === "static" && changes(ability.apply)));
}

/**
 * A PERMANENT'S ABILITIES NOW (CR 613.1f, batch 76): its own, less them if it lost them, and those other effects gave it
 * -- what its activated, mana and triggered abilities are read from. Anywhere but the battlefield, the card's own.
 */
export function abilitiesOf(state, id) {
  const object = state.objects[id];
  if (object.zone !== "battlefield" || !abilitiesChange(state)) return object.abilities ?? [];
  return heldAbilities(object, characteristicsOf(state, id));
}

/**
 * LAST KNOWN INFORMATION (CR 113.7a) — everything about an object, captured before it leaves.
 *
 * "If the source is no longer in the zone it's expected to be in at that time, its last known
 * information is used." A zone change makes a new object with no memory of the old one (CR 400.7),
 * and a token in any zone but the battlefield ceases to exist outright (CR 111.7), so by the time
 * anything asks about the thing that died, there is nothing left to ask.
 *
 * THE SNAPSHOT USED TO BE FIVE FIELDS: id, name, owner, controller and abilities. That was enough
 * for "whenever this creature dies" to find its own trigger and no more. It was not enough for the
 * far more common shape — "whenever a creature you control dies, each opponent loses life equal to
 * ITS POWER" — because power was never recorded, and there is no way to recover it afterwards.
 * Nor "if it was a Goblin", nor "return it with the counters it had".
 *
 * IT IS THE CHARACTERISTICS, NOT THE PRINTED VALUES. A 2/2 wearing two +1/+1 counters under an
 * anthem died as a 5/5, and that is the number the trigger owes. So this runs the layers rather
 * than reading the object's own fields, and `controller` is the post-layer-2 controller — a stolen
 * creature dies under the thief, and its owner is a separate field for the cards that care.
 */
export function lastKnown(state, id) {
  const object = state.objects[id];
  if (!object) return null;
  const current = characteristicsOf(state, id);
  return {
    cardId: id,
    name: object.card,
    owner: object.owner,
    controller: current.controller,
    types: [...current.types],
    /* What "another Vampire you control dies" and "equipped creature dies" ask of a thing that is gone. */
    subtypes: [...current.subtypes],
    supertypes: [...(object.supertypes ?? [])],
    /* What it chose as it entered, for its abilities read as it last was. */
    ...(object.chosen !== undefined ? {chosen: object.chosen} : {}),
    /* Its Class level (CR 716.2a), for the abilities it had at that level. */
    ...(Number.isInteger(object.level) ? {level: object.level} : {}),
    attachments: [...(object.attachments ?? [])],
    /* What it was attached to: "sacrifice this Aura: exile enchanted creature" (Spiral into Solitude). */
    attachedTo: object.attachedTo ?? null,
    colors: [...current.colors],
    keywords: [...current.keywords],
    /* Every creature type, as it last was (Changeling, or an effect's). */
    everyCreatureType: current.everyCreatureType === true,
    /* Null, not zero, for a thing that has no power — a dying Sol Ring is not a 0/0. */
    power: current.power ?? null,
    toughness: current.toughness ?? null,
    counters: {...current.counters},
    damage: object.damage ?? 0,
    tapped: object.tapped === true,
    token: object.token === true,
    commander: object.commander === true,
    /* Its abilities as it last was, the ones given it included: "when this creature dies" given by Feign Death. */
    abilities: structuredClone(heldAbilities(object, current)),
  };
}
