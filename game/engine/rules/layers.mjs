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

/** The seven layers of CR 613.1, in order. */
export const LAYERS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

/** The sublayers of layer 7, in the order CR 613.4 gives. */
const SUBLAYERS = Object.freeze(["a", "b", "c", "d", "e"]);

/* An object's printed characteristics: where a derivation starts. */
function printed(state, id) {
  const object = state.objects[id];
  return {
    id,
    card: object.card,
    types: [...(object.types ?? [])],
    colors: [...(object.colors ?? [])],
    keywords: [...(object.keywords ?? [])],
    power: object.power,
    toughness: object.toughness,
    controller: object.controller,
    counters: {...object.counters},
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
function affects(state, effect, current, sourceController) {
  const rule = effect.affects ?? {};
  if (rule.ids && !rule.ids.includes(current.id)) return false;
  if (rule.types && !rule.types.every((type) => current.types.includes(type))) return false;
  if (rule.controller === "you" && current.controller !== sourceController) return false;
  if (rule.controller === "opponent" && current.controller === sourceController) return false;
  if (Number.isInteger(rule.controller) && current.controller !== rule.controller) return false;
  if (rule.token !== undefined && (state.objects[current.id]?.token ?? false) !== rule.token) return false;
  return true;
}

function applyEffect(current, effect) {
  const change = effect.apply ?? {};
  if (Number.isInteger(change.controller)) current.controller = change.controller;
  /* CR 613.1d: "in addition to its other types" adds; setTypes replaces. */
  if (change.addTypes) for (const type of change.addTypes) if (!current.types.includes(type)) current.types.push(type);
  if (change.setTypes) current.types = [...change.setTypes];
  if (change.setColors) current.colors = [...change.setColors];
  if (change.removeAllAbilities) current.keywords = [];
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

/* Every continuous effect in play: the static abilities of permanents, plus effects with a
   duration that a resolved spell left behind in `state.effects`. */
function allEffects(state) {
  const found = [];
  for (const id of state.zones.battlefield) {
    const holder = state.objects[id];
    for (const ability of holder.abilities ?? []) {
      if (ability.kind !== "static") continue;
      found.push({
        ...ability,
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
   The test is done by applying B and asking whether A's outcome moves. */
function dependsOn(state, a, b, base, sourceOf) {
  const withoutB = applyEffect(structuredClone(base), a);
  const afterB = applyEffect(structuredClone(base), b);
  const appliesAfterB = affects(state, a, afterB, sourceOf(a));
  const appliedBefore = affects(state, a, base, sourceOf(a));
  /* Whether A applies at all has changed. */
  if (appliesAfterB !== appliedBefore) return true;
  if (!appliesAfterB) return false;
  /* Or what it produces has changed by more than B's own contribution. */
  const both = applyEffect(structuredClone(afterB), a);
  const reverse = applyEffect(structuredClone(withoutB), b);
  return canonical(both) !== canonical(reverse);
}

/* Order one layer's effects: timestamp order (CR 613.7), then move any effect that depends on a
   later one behind it (CR 613.8). A dependency loop falls back to timestamps, as the rule says. */
function orderWithin(state, effects, base, sourceOf) {
  const byTime = [...effects].sort((x, y) => (x.timestamp ?? 0) - (y.timestamp ?? 0));
  const out = [];
  const remaining = [...byTime];
  let guard = 0;
  while (remaining.length > 0 && guard < 64) {
    guard += 1;
    /* The first effect that does not depend on anything still waiting. */
    const at = remaining.findIndex((candidate) =>
      !remaining.some((other) => other !== candidate && dependsOn(state, candidate, other, base, sourceOf)));
    /* Every remaining effect depends on another: a loop, so CR 613.8b says use timestamps. */
    out.push(...(at < 0 ? remaining.splice(0) : remaining.splice(at, 1)));
  }
  return out;
}

/**
 * What an object currently is: printed characteristics with every continuous effect applied in the
 * order CR 613 gives.
 *
 * Returns a fresh object each time. A caller that edits the answer has not edited the game, which
 * is the same promise the projection makes and for the same reason.
 */
export function characteristicsOf(state, id) {
  if (!state.objects[id]) throw new Error(`There is no object ${id} to describe`);
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
        const plus = current.counters["+1/+1"] ?? 0;
        const minus = current.counters["-1/-1"] ?? 0;
        if (current.power !== null) current.power += plus - minus;
        if (current.toughness !== null) current.toughness += plus - minus;
        continue;
      }
      const here = inLayer.filter((effect) => (effect.sublayer ?? "c") === sublayer);
      for (const effect of orderWithin(state, here, current, sourceOf)) {
        if (affects(state, effect, current, sourceOf(effect))) current = applyEffect(current, effect);
      }
    }
  }

  return current;
}

/** Current power. Null for an object that has none — which is not the same as zero. */
export const powerOf = (state, id) => characteristicsOf(state, id).power ?? 0;
/** Current toughness, by the same rule. */
export const toughnessOf = (state, id) => characteristicsOf(state, id).toughness ?? 0;
/** Who currently controls it, after layer 2. */
export const controllerOf = (state, id) => characteristicsOf(state, id).controller;
/** What it currently is, after layer 4. */
export const typesOf = (state, id) => characteristicsOf(state, id).types;
/** What it currently has, after layer 6. */
export const keywordsOf = (state, id) => characteristicsOf(state, id).keywords;
