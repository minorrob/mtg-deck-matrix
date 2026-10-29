/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* MANA THAT MAY BE SPENT ONLY ON SOME THINGS (CR 106.6): "Spend this mana only to cast a creature spell of the chosen
 * type" (Cavern of Souls), "only to cast creature spells or activate abilities of creatures" (Castle Garenbrig).
 *
 * It is mana in its player's pool like any other, and empties with it (CR 500.4, rules/turn.mjs), but it is kept beside
 * the pool -- the player's `restrictedMana`, one entry a mana -- each entry with what it may pay for: `spell`, a selector
 * over the card being cast, `ability`, one over the permanent whose ability is being activated ("abilities of
 * creatures": a creature permanent, CR 109.2), `abilitySource`, one over the source of an ability wherever that object is
 * ("abilities of Elf sources": an Elf card's cycling in a hand too -- CR 109.2 does not narrow a "source" to a permanent,
 * and an ability's source is the object it is of, CR 113.7); any of them, or more than one. "The chosen
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
 *
 * MANA FROM A SOURCE OF A KIND (CR 106.3, 601.2h): "if mana from a Treasure was spent to cast it" (Smaug, Wicked Worm). The
 * source of mana is the object whose ability made it (CR 106.3) -- as it was as it made it: a Treasure is sacrificed for its
 * mana. Mana a mana ability makes whose source an ability in the game asks after (a `spentFrom` condition, script/
 * condition.mjs) -- and only that: nothing else can tell one mana of a type from another -- is remembered beside the pool
 * as rider mana is, its source as it then was (`from`). Spent to cast a spell, the spell remembers it (rules/actions.mjs, `spentFrom`). And where it would
 * be read -- a spell cast by a player who controls a permanent that asks after it -- which mana pays is the player's to say,
 * each way its own offer, as a rider's is (riderChoices); elsewhere the other mana is spent first, as a rider's is, keeping
 * every way for a spell after.
 *
 * MANA THAT CAN'T BE SPENT ON SOME THINGS (CR 106.4, 106.6): "This mana can't be spent to cast spells from your hand"
 * (Heartwood Crafter; a mana ability's `cantSpend: {castFrom: "hand"}`). It pays for everything else -- an ability, a
 * spell cast from exile (a prepare spell's copy, CR 722.3c) or from the command zone, an "unless" cost, a ward -- so it is
 * in the pool like any other, and `withheldMana` beside the pool says how much of the pool it is: one entry a mana, its
 * `key`, its `source`, `cantSpend`. A spell cast from its caster's hand sees the pool less it (poolFor) and spends none of
 * it (spendFor). Anything else spends it first: it pays for all the rest of the pool pays for but that, so spending it
 * first takes nothing from its player. A spend that does not go through spendFor -- an "unless" cost or a ward (CR
 * 118.12, rules/mana.mjs), a mana ability's own cost, a manifest turned face up (rules/actions.mjs) -- is read as having
 * spent it first too: `withheldSeen`, the pool as it was when the entries were last written, says how much of each kind
 * went since (withheldOf), and whatever adds mana to the pool settles that first (addPoolMana), so that what it adds is
 * never taken for what was spent.
 */
import {compileSelector, matchesLastKnown} from "../script/filter.mjs";
import {chosenFor} from "../script/chosen.mjs";
import {spend, addMana, MANA_KEYS} from "./mana.mjs";
import {lastKnown, controllerOf} from "./layers.mjs";

/** The keys a mana ability's `spendOnly` may carry. */
export const SPEND_ONLY_KEYS = Object.freeze(["spell", "ability", "abilitySource", "uncounterable"]);

const restricted = (state, player) => state.players[player].restrictedMana ?? [];

/** Add `mana` that `player` may spend only as `spendOnly` says, made by the object `source`. */
export function addRestricted(state, player, mana, spendOnly, source) {
  const only = chosenFor(spendOnly, state.objects[source]);
  const list = (state.players[player].restrictedMana ??= []);
  for (const [key, n] of Object.entries(mana)) for (let i = 0; i < n; i += 1)
    list.push({key, source, ...(only.spell ? {spell: only.spell} : {}), ...(only.ability ? {ability: only.ability} : {}),
      ...(only.abilitySource ? {abilitySource: only.abilitySource} : {}), ...(only.uncounterable === true ? {uncounterable: true} : {})});
}

/* Whether this entry may pay for `use`: casting the card `use.spell` (where it is now, before it moves to the stack), or
   activating an ability of the object `use.ability` -- by `ability`, a permanent on the battlefield, a card's ability in a
   hand not one; by `abilitySource`, the object where it is now: Woodland Weavemaster's {G} pays an Elf card's "Cycling {1}"
   in its owner's hand (CR 109.2, 113.7). */
function admits(state, player, entry, use) {
  const context = {controller: player, source: entry.source};
  if (use.spell !== undefined) return Boolean(entry.spell) && compileSelector({...entry.spell, what: "card", zone: state.objects[use.spell]?.zone})(state, use.spell, context);
  if (use.ability !== undefined) return (Boolean(entry.ability) && compileSelector({...entry.ability, what: "permanent"})(state, use.ability, context))
    || (Boolean(entry.abilitySource) && compileSelector({...entry.abilitySource, what: "card", zone: state.objects[use.ability]?.zone})(state, use.ability, context));
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

/* What the abilities in the game ask of the source of mana spent (`spentFrom`): each a selector of the source as it last was. */
const provenanceAsked = (state, objects = Object.values(state.objects)) => objects.flatMap((object) => (object.abilities ?? [])
  .map((ability) => ability.condition?.spentFrom).filter(Boolean));

/** Mana `source` made for `player`, in the pool: remembered with what its source was, when an ability in the game asks
    (CR 106.3). */
export function addProvenance(state, player, mana, source) {
  /* Its source as it now is, read only when something asks (lastKnown runs the layers). */
  let was = null;
  if (!provenanceAsked(state).some((selector) => matchesLastKnown(selector, (was ??= lastKnown(state, source)), {controller: player}))) return;
  const from = {cardId: source, name: was.name, controller: was.controller, types: was.types, subtypes: was.subtypes, supertypes: was.supertypes, token: was.token};
  const list = (state.players[player].manaRiders ??= []);
  for (const [key, n] of Object.entries(mana)) for (let i = 0; i < n; i += 1) {
    state.manaSerial = (state.manaSerial ?? 0) + 1;
    list.push({id: state.manaSerial, key, source, from: structuredClone(from)});
  }
}
/* Whether spending this mana on `use` is read: a spell cast by a player who controls a permanent with an ability asking after
   the source of the mana spent, and this mana's source what it asks (CR 601.2h). */
const provenanceRead = (state, player, entry, use) => Boolean(entry.from) && use.spell !== undefined
  && provenanceAsked(state, state.zones.battlefield.filter((id) => controllerOf(state, id) === player).map((id) => state.objects[id]))
    .some((selector) => matchesLastKnown(selector, entry.from, {controller: player}));

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
      /* Mana from sources alike -- two Treasures' -- is alike (`from`). */
      const kind = r.from ? `from:${JSON.stringify([r.from.types, r.from.subtypes, r.from.supertypes, r.from.token])}` : `${r.source}:${r.whenSpent?.ability ?? ""}`;
      const group = groups.find((g) => g.kind === kind);
      if (group) group.ids.push(r.id); else groups.push({kind, ids: [r.id], triggers: triggersOn(state, player, r, use) || provenanceRead(state, player, r, use)});
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
    /* CR 106.6, 601.2h: distinguishable source/rider payments remain the payer's choices, without a display cap. */
    ways = ways.flatMap((way) => here.map((ids) => [...way, ...ids]));
  }
  return ways.map((ids) => [...ids].sort((a, b) => a - b));
}

/* Whether this withheld mana can't pay for `use`: casting a spell from the zone it names, the card read where it is now (an
   ability's use names no spell). */
const withholds = (state, entry, use) => state.objects[use.spell]?.zone === entry.cantSpend.castFrom;

/** The withheld mana still in the pool: its entries, less what was spent since they were last written without spendFor
 *  saying so -- taken from them first. It only reads: spendFor and addPoolMana write the list. */
export function withheldOf(state, player) {
  const p = state.players[player];
  const list = p.withheldMana ?? [];
  if (!list.length) return list;
  const gone = Object.fromEntries(MANA_KEYS.map((key) => [key, p.withheldSeen[key] - p.manaPool[key]]));
  return list.filter((entry) => {
    if (gone[entry.key] > 0) { gone[entry.key] -= 1; return false; }
    return true;
  });
}
/* Written as the pool now is (withheldOf), before the pool changes again -- its writer then says what the pool was. Nothing
   kept for a player who has had none. */
function settleWithheld(state, player) {
  const p = state.players[player];
  if (p.withheldMana) p.withheldMana = withheldOf(state, player);
}

/** Add `mana` to `player`'s pool, made by `source` -- and, with `cantSpend` (Heartwood Crafter's), remembered beside it as
 *  mana that can't be spent on those. */
export function addPoolMana(state, player, mana, cantSpend, source) {
  settleWithheld(state, player);
  const p = state.players[player];
  addMana(p.manaPool, mana);
  if (cantSpend) for (const [key, n] of Object.entries(mana)) for (let i = 0; i < n; i += 1) (p.withheldMana ??= []).push({key, source, cantSpend});
  if (p.withheldMana?.length) p.withheldSeen = {...p.manaPool};
}

/** What `player` may spend on `use` now: the pool, and the restricted mana that admits it -- less the mana that can't be
 *  spent on it. A copy, to pay from. */
export function poolFor(state, player, use) {
  const pool = {...state.players[player].manaPool};
  for (const entry of restricted(state, player)) if (admits(state, player, entry, use)) pool[entry.key] = (pool[entry.key] ?? 0) + 1;
  for (const entry of withheldOf(state, player)) if (withholds(state, entry, use)) pool[entry.key] -= 1;
  return pool;
}

/**
 * Spend `mana` on `use`: the restricted mana that admits it first, then the pool -- of it, the rider mana `riders` names
 * (an offer's choice, riderChoices), or, unnamed, the plain mana first and then the oldest riders; and of the pool, the
 * withheld mana first, where it may be spent.
 *
 * @returns {{uncounterable: boolean, triggered: Array, from: Array}} whether any of it said "that spell can't be countered", the
 *   rider entries spent that trigger on this use (the caller makes their triggers, about the spell as it now is), and the
 *   sources, as each was, of the mana spent whose source is asked after (CR 106.3)
 */
export function spendFor(state, player, use, mana, riders = null) {
  settleWithheld(state, player);
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
  const p = state.players[player];
  if (p.withheldMana?.length) {
    const take = {...left};
    p.withheldMana = p.withheldMana.filter((entry) => {
      if (withholds(state, entry, use) || !(take[entry.key] > 0)) return true;
      take[entry.key] -= 1;
      return false;
    });
  }
  spend(p.manaPool, left);
  if (p.withheldMana?.length) p.withheldSeen = {...p.manaPool};
  return {uncounterable, triggered: spent.filter((r) => triggersOn(state, player, r, use)), from: spent.filter((r) => r.from).map((r) => r.from)};
}

/** "That mana becomes colorless instead" of being lost (Omnath, Locus of the Void; CR 614.1a, 106.4; rules/turn.mjs): `player`'s
 *  pool but what is `kept` (firebending's, not lost now) becomes {C}, and the mana kept beside it with it -- the restricted
 *  mana, each still paying only for what it did; the riders and withheld mana of what became {C}, each still doing and
 *  refusing what it did. */
/* Taken out of the pool as it was, and put back as {C} through addPoolMana, the pool's one way up -- the withheld mana's record
   written between the two, so nothing it withholds reads as spent. */
export function colorlessPool(state, player, kept = {}) {
  const p = state.players[player];
  settleWithheld(state, player);
  const lost = Object.fromEntries(MANA_KEYS.map((key) => [key, Math.max(0, (p.manaPool[key] ?? 0) - (kept[key] ?? 0))]));
  for (const entry of p.restrictedMana ?? []) entry.key = "C";
  for (const list of [p.manaRiders ?? [], p.withheldMana ?? []]) {
    const left = {...lost};
    for (const entry of list) if (left[entry.key] > 0) { left[entry.key] -= 1; entry.key = "C"; }
  }
  spend(p.manaPool, lost);
  if (p.withheldMana?.length) p.withheldSeen = {...p.manaPool};
  addPoolMana(state, player, {C: MANA_KEYS.reduce((n, key) => n + lost[key], 0)}, null, null);
}

/** Empty it with the pool (CR 500.4), the riders of the pool's mana too. @returns {number} how much there was */
/* `keep`: the kinds of mana its player does not lose (Leyline Tyrant's red; rules/turn.mjs) -- those entries stay, as they were. */
export function emptyRestricted(player, keep = []) {
  const had = player.restrictedMana?.length ?? 0;
  const kept = (list) => list.filter((entry) => keep.includes(entry.key));
  if (had) player.restrictedMana = kept(player.restrictedMana);
  if (player.manaRiders?.length) player.manaRiders = kept(player.manaRiders);
  if (player.withheldMana?.length) player.withheldMana = kept(player.withheldMana);
  return had;
}
