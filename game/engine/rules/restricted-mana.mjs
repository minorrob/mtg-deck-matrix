/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MANA THAT MAY BE SPENT ONLY ON SOME THINGS (CR 106.6): "Spend this mana only to cast a creature spell of the chosen
 * type" (Cavern of Souls), "only to cast creature spells or activate abilities of creatures" (Castle Garenbrig).
 *
 * It is mana in its player's pool like any other, and empties with it (CR 500.4, rules/turn.mjs), but it is kept beside
 * the pool -- the player's `restrictedMana`, one entry a mana -- each entry with what it may pay for: `spell`, a selector
 * over the card being cast, `ability`, one over the source of an ability being activated; either, or both. "The chosen
 * type" is read as the mana is made, its source's choice (script/chosen.mjs), so the source leaving later changes
 * nothing. What a spell or an ability may spend is the pool and the entries that admit it, and it spends those entries
 * first: nothing else could use them. "And that spell can't be countered" (Cavern, Delighted Halfling) rides on the
 * entry -- a spell paid with any of it can't be countered (rules/statics.mjs, `cantBeCountered`).
 *
 * Not on the board yet: the room's projection shows the pool, and only the pool.
 */
import {compileSelector} from "../script/filter.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {spend} from "./mana.mjs";

/** The keys a mana ability's `spendOnly` may carry. */
export const SPEND_ONLY_KEYS = Object.freeze(["spell", "ability", "uncounterable"]);

const restricted = (state, player) => state.players[player].restrictedMana ?? [];

/** Add `mana` that `player` may spend only as `spendOnly` says, made by the object `source`. */
export function addRestricted(state, player, mana, spendOnly, source) {
  const only = chosenFor(spendOnly, state.objects[source]);
  const list = (state.players[player].restrictedMana ??= []);
  for (const [key, n] of Object.entries(mana)) for (let i = 0; i < n; i += 1)
    list.push({key, source, ...(only.spell ? {spell: only.spell} : {}), ...(only.ability ? {ability: only.ability} : {}), ...(only.uncounterable === true ? {uncounterable: true} : {})});
}

/* Whether this entry may pay for `use`: casting the card `use.spell` (where it is now, before it moves to the stack), or
   activating an ability of the permanent `use.ability` -- on the battlefield; a card's ability in a hand is not one. */
function admits(state, player, entry, use) {
  const context = {controller: player, source: entry.source};
  if (use.spell !== undefined) return Boolean(entry.spell) && compileSelector({...entry.spell, what: "card", zone: state.objects[use.spell]?.zone})(state, use.spell, context);
  if (use.ability !== undefined) return Boolean(entry.ability) && compileSelector({...entry.ability, what: "permanent"})(state, use.ability, context);
  return false;
}

/** What `player` may spend on `use` now: the pool, and the restricted mana that admits it. A copy, to pay from. */
export function poolFor(state, player, use) {
  const pool = {...state.players[player].manaPool};
  for (const entry of restricted(state, player)) if (admits(state, player, entry, use)) pool[entry.key] = (pool[entry.key] ?? 0) + 1;
  return pool;
}

/**
 * Spend `mana` on `use`: the restricted mana that admits it first, then the pool.
 *
 * @returns {{uncounterable: boolean}} whether any of it said "that spell can't be countered"
 */
export function spendFor(state, player, use, mana) {
  const list = restricted(state, player);
  const left = {...mana};
  let uncounterable = false;
  for (let i = 0; i < list.length;) {
    const entry = list[i];
    if ((left[entry.key] ?? 0) > 0 && admits(state, player, entry, use)) {
      left[entry.key] -= 1;
      uncounterable ||= entry.uncounterable === true;
      list.splice(i, 1);
    } else i += 1;
  }
  spend(state.players[player].manaPool, left);
  return {uncounterable};
}

/** Empty it with the pool (CR 500.4). @returns {number} how much there was */
export function emptyRestricted(player) {
  const had = player.restrictedMana?.length ?? 0;
  if (had) player.restrictedMana = [];
  return had;
}
