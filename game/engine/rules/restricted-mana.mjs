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
 *
 * MANA THAT DOES SOMETHING WHEN IT IS SPENT (CR 106.6): "When that mana is spent to cast a creature spell that shares a
 * creature type with your commander, scry 1" (Path of Ancestry), "when you spend this mana to cast your commander, scry X"
 * (Study Hall). That mana is not restricted: it is in the pool like any other and pays for anything. Beside the pool,
 * `manaRiders` remembers which of it came with a rider -- one entry a mana: its `key`, its `source`, an `id`, and what it
 * does (`whenSpent`: `spell`, a selector of the spells it triggers for; `effects`; `text`). Spent on such a spell, it makes
 * a delayed triggered ability of its source's controller (CR 603.7), on the stack the next time a player would receive
 * priority. Which mana pays is the player's choice: rules/actions.mjs offers a cast that could spend rider mana on a spell
 * it triggers for both ways (`riders`, riderChoices). On anything else the plain mana is spent first: the two pay the same,
 * and the rider mana can still do more, so keeping it takes nothing from the player -- unless there is not enough plain
 * mana, and then which riders go is theirs to say, too. A pool spent elsewhere (an "unless that player pays" cost, a ward)
 * spends the plain mana first in the same way (ridersOf keeps no more riders of a key than the pool holds).
 */
import {compileSelector} from "../script/filter.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {spend, MANA_KEYS} from "./mana.mjs";

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

/** Mana with a rider: in the pool, and remembered beside it (`whenSpent`, the source's mana ability's). */
export function addRider(state, player, mana, whenSpent, source) {
  const list = (state.players[player].manaRiders ??= []);
  for (const [key, n] of Object.entries(mana)) for (let i = 0; i < n; i += 1) {
    state.manaSerial = (state.manaSerial ?? 0) + 1;
    list.push({id: state.manaSerial, key, source, whenSpent: structuredClone(whenSpent)});
  }
}

/** The rider mana a player has: no more of a key than the pool holds -- the plain mana spent first by whatever spent it
 *  without saying (the oldest riders kept). It only reads: spendFor and the pool's emptying write the list. */
export function ridersOf(state, player) {
  const list = state.players[player].manaRiders ?? [];
  if (!list.length) return list;
  const pool = state.players[player].manaPool;
  const seen = {};
  return list.filter((entry) => { seen[entry.key] = (seen[entry.key] ?? 0) + 1; return seen[entry.key] <= (pool[entry.key] ?? 0); });
}

/* Whether a rider triggers on this use: a spell it describes, read where the card is as it is cast. */
const triggersOn = (state, player, entry, use) => use.spell !== undefined && Boolean(entry.whenSpent?.spell)
  && compileSelector({...entry.whenSpent.spell, what: "card", zone: state.objects[use.spell]?.zone})(state, use.spell, {controller: player, source: entry.source});

/* The restricted mana a payment takes first, by key (spendFor spends those first). */
function restrictedTake(state, player, use, mana) {
  const left = {...mana};
  for (const entry of restricted(state, player)) if ((left[entry.key] ?? 0) > 0 && admits(state, player, entry, use)) left[entry.key] -= 1;
  return left;
}

const RIDER_CHOICES = 16;
/**
 * THE WAYS TO PAY WITH RIDER MANA (CR 106.6, 601.2h): each a list of the rider entries a payment of `mana` spends on `use`,
 * or null when the player has none. For each key the payment needs: as few riders as the plain mana leaves room for, up to
 * as many as there are -- grouped by source, since two of one source's are alike -- less the ways that spend a rider that
 * does nothing here while plain mana is left over (the same payment, less rider mana kept). One way with none of it, when
 * that is all there is.
 */
export function riderChoices(state, player, use, mana) {
  const riders = ridersOf(state, player);
  if (!riders.length) return null;
  const need = restrictedTake(state, player, use, mana);
  const pool = state.players[player].manaPool;
  let ways = [[]];
  for (const key of MANA_KEYS) {
    const mine = riders.filter((r) => r.key === key);
    const n = Math.max(0, need[key] ?? 0);
    if (!mine.length || n === 0) continue;
    const plain = (pool[key] ?? 0) - mine.length;
    const groups = [];
    for (const r of mine) {
      const kind = `${r.source}:${r.whenSpent?.ability ?? ""}`;
      const group = groups.find((g) => g.kind === kind);
      if (group) group.ids.push(r.id); else groups.push({kind, ids: [r.id], triggers: triggersOn(state, player, r, use)});
    }
    const here = [];
    const walk = (g, picked, total) => {
      if (g === groups.length) {
        if (total < n - plain || total > n) return;
        const plainLeft = plain - (n - total);
        if (plainLeft > 0 && groups.some((group, i) => !group.triggers && picked[i] > 0)) return;
        here.push(groups.flatMap((group, i) => group.ids.slice(0, picked[i])));
        return;
      }
      for (let c = 0; c <= groups[g].ids.length; c += 1) walk(g + 1, [...picked, c], total + c);
    };
    walk(0, [], 0);
    ways = ways.flatMap((way) => here.map((ids) => [...way, ...ids])).slice(0, RIDER_CHOICES);
  }
  return ways.map((ids) => [...ids].sort((a, b) => a - b));
}

/** What `player` may spend on `use` now: the pool, and the restricted mana that admits it. A copy, to pay from. */
export function poolFor(state, player, use) {
  const pool = {...state.players[player].manaPool};
  for (const entry of restricted(state, player)) if (admits(state, player, entry, use)) pool[entry.key] = (pool[entry.key] ?? 0) + 1;
  return pool;
}

/**
 * Spend `mana` on `use`: the restricted mana that admits it first, then the pool -- of it, the rider mana `riders` names
 * (an offer's choice, riderChoices), or, unnamed, the plain mana first and then the oldest riders.
 *
 * @returns {{uncounterable: boolean, triggered: Array}} whether any of it said "that spell can't be countered", and the
 *   rider entries spent that trigger on this use (the caller makes their triggers, about the spell as it now is)
 */
export function spendFor(state, player, use, mana, riders = null) {
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
  const mine = ridersOf(state, player);
  let spent = [];
  if (mine.length) {
    const pool = state.players[player].manaPool;
    if (Array.isArray(riders)) {
      spent = riders.map((id) => mine.find((r) => r.id === id));
      if (spent.some((r) => !r) || new Set(riders).size !== riders.length) throw new Error("That mana is no longer in the pool");
      for (const key of MANA_KEYS) if (spent.filter((r) => r.key === key).length > (left[key] ?? 0)) throw new Error("More of that mana than the cost takes");
    }
    /* What must come from rider mana besides: the plain mana runs out. */
    for (const key of MANA_KEYS) {
      const named = spent.filter((r) => r.key === key).length;
      const plain = (pool[key] ?? 0) - mine.filter((r) => r.key === key).length;
      const more = Math.max(0, (left[key] ?? 0) - named - plain);
      if (more > 0 && Array.isArray(riders)) throw new Error("Not enough of that mana without the riders it would spend");
      spent.push(...mine.filter((r) => r.key === key && !spent.includes(r)).slice(0, more));
    }
    state.players[player].manaRiders = mine.filter((r) => !spent.includes(r));
  }
  spend(state.players[player].manaPool, left);
  return {uncounterable, triggered: spent.filter((r) => triggersOn(state, player, r, use))};
}

/** Empty it with the pool (CR 500.4), the riders of the pool's mana too. @returns {number} how much there was */
export function emptyRestricted(player) {
  const had = player.restrictedMana?.length ?? 0;
  if (had) player.restrictedMana = [];
  if (player.manaRiders?.length) player.manaRiders = [];
  return had;
}
