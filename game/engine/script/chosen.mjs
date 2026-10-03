/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THE CHOSEN TYPE" ("$chosen"). What a permanent's controller chose as it entered ("as this artifact enters, choose a
 * creature type", rules/entering.mjs, kept as the permanent's `chosen`), or what a chooseType chose earlier in a
 * resolution (script/resolution.mjs, the context's `chosen`) -- named in an ability wherever the ability reads it: a
 * selector's subtypes, a type it adds, a count, a cost. Replaced by the choice before the ability is read; before anything
 * is chosen, by a name no card has, so it matches nothing. One place, so the layers, the rules statics, the triggers,
 * the costs and the replacements all read it the same way.
 */

export const NONE_CHOSEN = "(none chosen)";

/** Whether an ability, effect or selector names the choice at all. */
export const namesChosen = (value) => JSON.stringify(value ?? null).includes('"$chosen"');

/** The value with every "$chosen" replaced by the choice (or NONE_CHOSEN). */
export function withChosen(value, chosen) {
  const choice = chosen ?? NONE_CHOSEN;
  const walk = (v) => (Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    : v === "$chosen" ? choice : v);
  return walk(value);
}

/** A permanent's ability, read with that permanent's own choice. Unchanged when it names none. */
export const chosenFor = (ability, holder) => (namesChosen(ability) ? withChosen(ability, holder?.chosen) : ability);
