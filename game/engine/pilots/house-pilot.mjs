/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE HOUSE PILOT: THE ENGINE'S OWN OPPONENT (PLAN §3.6, task 4.2).
 *
 * It replaces Forge's native AI in the cloud, where Forge does not exist. Two properties are the point, and
 * `tests/engine-house-pilot.mjs` holds both:
 *
 * 1. IT SEES ONLY ITS SEAT. It is handed exactly what a browser seat is handed: the seat's projection
 *    (`projectFor(state, seat)`), the actions the engine offers that seat, and the choice it is asked. It
 *    imports nothing that reads game state, so it cannot look at a hand or a library that is not its own; a
 *    game room that routes a pilot wrongly still cannot leak through it. The one other thing it may know is
 *    public card knowledge -- what a named card costs and is -- through `cards(name)`, the same facts a
 *    player can read off the card.
 *
 * 2. IT COSTS NOTHING. No model, no network, no clock and no randomness: the same view and the same offer
 *    give the same decision, so a game of house pilots replays from its seed like any other.
 *
 * HOW IT PLAYS, for now. A land every turn. Mana is tapped only when a spell it holds fits the mana it could
 * make, and then the most expensive castable spell is cast, commander included. A spell with targets is offered
 * once per way to aim it (engine 2.4): one marked `hostile` -- removal, damage -- goes at an opponent's things, any
 * other at its own, and a spell whose every legal aim is the wrong side is not cast at all. It attacks the opponent with
 * the lowest life: with everything when it has more attackers than that player has untapped creatures, and
 * otherwise with each creature no untapped enemy creature can kill for free, and blocks when a blocker
 * kills the attacker and survives, or when the damage coming in would be lethal. It keeps a hand of two to
 * five lands. These are heuristics on the visible board.
 *
 * WHAT IT MAY TAKE NONE OF (`picks`; Linear ROB-164, found by the Play readiness evaluation of 2026-10-19: a person and three AIs).
 * A choice whose least answer is none -- "search your library for up to two basic land cards", a search for a card with a
 * quality, which may fail to find (CR 701.23b), proliferate's "any number" -- used to fall through to its first `min`
 * options: none. So an AI seat cracked Evolving Wilds for nothing and proliferated nothing. With `picks` it takes what
 * such a choice is for: a search, as many as it may, the lands of the colors it lacks or the costliest card it could cast
 * soon; proliferate, its own counters that help it and another player's that hurt them; any other, the permanents and
 * players on the side it is meant for. A match launched before `picks` keeps the old answers, so it replays as it was
 * played (game/room/room.mjs, `pilotPicks`).
 *
 * THIS IS L0, the floor of the house pilot's levels of decision (AI-2, docs/plan-to-done-2026-09-30.md). L1 scores the
 * choices that decide games -- the mana it spends, where a spell is aimed, the activated abilities worth their cost
 * (which this pilot never takes), attacks against the swing back, blocks, the opening hand's odds -- and answers the
 * rest with this pilot: `scored-pilot.mjs`. A table's AI seat is L1 at Normal or
 * Easy; a seat without a setting, as in every match launched before settings were, is this one.
 *
 * NOT YET: PLAN §3.6's rollouts (short deterministic playouts against the engine, whose budget is the
 * difficulty). A rollout from a seat's view has to invent the hidden cards first -- sample them from what is
 * publicly known -- or it cheats, and the card definitions that make rollouts worth their cost arrive with
 * phase 3. Difficulty will change search effort, never information.
 */

export const HOUSE_PILOT_ID = "house-pilot";

/**
 * A CHOICE'S REQUIREMENTS, MET (CR 508.1d: "other Goblin creatures you control attack each combat if able"): `indices`, with
 * as few options added as the record's `requires` asks -- for each, at least `least` of the options whose `by` value is
 * one of `values`, each value once -- keeping to `exclusiveBy` and to `capped` (no more at a planeswalker than it allows).
 * A value may need more than one option (`per`): "must be blocked if able" asks two blockers of an attacker with menace
 * (CR 509.1c, 702.111b; rules/combat.mjs, blockRequirements), each blocker blocking once (`exclusiveBy`).
 * And to `budget`, what the player can pay for (an attack tax, CR 508.1d, 508.1h): the picks it is given are kept, in
 * order, while they fit it, and what it adds fits it.
 * A player the answerer prefers (`prefer`, the house pilot's defender) is tried first, then players before planeswalkers,
 * each an attack for free before one that costs.
 * Pure, over the record alone: the house pilot imports nothing, and the random pilot and the card scenarios use this one.
 */
export function meetRequirements(choice, indices, prefer = null) {
  const options = choice.options ?? [];
  const requirements = Array.isArray(choice.requires) ? choice.requires : [];
  /* `capped` by its own field: a planeswalker an attack may name (CR 508.1c; the field unsaid, as before), an attacker a
     blocker may (509.1b). */
  const cap = (option) => (choice.capped ? option[choice.capped.by ?? "planeswalkerId"] : undefined);
  const room = (list, option) => withinBudget(choice, [...list, option.index])
    && (choice.exclusiveBy === undefined || !list.some((i) => options[i]?.[choice.exclusiveBy] === option[choice.exclusiveBy]))
    && (cap(option) === undefined || choice.capped.most?.[cap(option)] === undefined
      || list.filter((i) => options[i] && cap(options[i]) === cap(option)).length < choice.capped.most[cap(option)]);
  const costs = (o) => (choice.budget && (o[choice.budget.by] ?? 0) > 0 ? 1 : 0);
  const rank = (o) => (o.planeswalkerId === undefined ? (prefer !== null && o.defenderId === prefer ? 0 : 1) : 2) * 2 + costs(o);
  indices = keptWithin(choice, indices);
  /* CR 508.1c-d: satisfy the requirements together. An attacker with an uncapped alternative may need to leave a capped
     planeswalker's place for another required attacker. Backtracking only within one group would strand the later group. */
  const solve = (n, selected) => {
    if (n >= requirements.length) return selected;
    const need = requirements[n];
    const per = (value) => need.per?.[value] ?? 1;
    const count = (list, value) => list.filter((i) => options[i]?.[need.by] === value).length;
    const missing = (need.values ?? []).filter((value) => count(selected, value) < per(value));
    const short = (need.least ?? 0) - ((need.values ?? []).length - missing.length);
    /* The first way that fits, depth first, a value left out only when the rest can still make up the number: each value's
       options taken, as many as it still needs, each with room beside those before it. */
    const fill = (k, list, left) => {
      if (left <= 0) return solve(n + 1, list);
      if (missing.length - k < left) return null;
      const ways = options.filter((o) => o[need.by] === missing[k]).sort((a, b) => rank(a) - rank(b) || a.index - b.index);
      const take = (list2, from, still) => {
        if (still <= 0) return fill(k + 1, list2, left - 1);
        for (let j = from; j < ways.length; j += 1) {
          if (list2.includes(ways[j].index) || !room(list2, ways[j])) continue;
          const rest = take([...list2, ways[j].index], j + 1, still - 1);
          if (rest) return rest;
        }
        return null;
      };
      return take(list, 0, per(missing[k]) - count(list, missing[k])) ?? fill(k + 1, list, left);
    };
    return fill(0, selected, short);
  };
  const preserved = solve(0, [...indices]);
  if (preserved !== null) return preserved;
  /* An optional attack may already occupy the only place a required attacker can use. Start with the requirements in
     that case, then retain every original pick that still fits; replacing the optional attack is necessary for legality. */
  const out = solve(0, []);
  if (out === null) throw new Error("The attack requirements cannot be met by the offered choices");
  for (const index of indices) {
    const option = options[index];
    const by = choice.exclusiveBy ?? "cardId";
    if (option && !out.some((i) => options[i]?.[by] === option[by]) && room(out, option) && out.length < (choice.max ?? Infinity)) out.push(index);
  }
  return out;
}

/** Whether these options keep to the record's `budget` ("total power 4 or less"; the mana an attack tax can be paid with,
    CR 508.1h): their `by` values total no more than its `most`. With no budget, any do. */
export const withinBudget = (choice, indices) => !choice.budget
  || indices.reduce((n, i) => n + (choice.options?.[i]?.[choice.budget.by] ?? 0), 0) <= choice.budget.most;
/** These options, in order, each kept while those kept still keep to the budget. */
export const keptWithin = (choice, indices) => indices.reduce((kept, i) => (withinBudget(choice, [...kept, i]) ? [...kept, i] : kept), []);

/** Explicit pilot decisions over the public choice only. Humans receive the same unmodified offered choices. */
export function combatSourceAnswer(choice) {
  if (!String(choice.id ?? "").startsWith("assign-sources:")) return null;
  const selected = choice.options.find(option => option.damageAssigned === false) ?? choice.options.find(option => option.confirmDamage);
  return {indices: [selected.index]};
}

/** Allocate lethal to blockers, then the printed loyalty prerequisite, then excess to the final recipient. */
export function combatDamageAnswer(choice) {
  const options = choice.options ?? [], amounts = options.map(() => 0);
  let left = choice.total ?? 0;
  for (let i = 0; i < options.length; i += 1) {
    const take = Math.min(left, Math.max(0, options[i].lethal ?? 0));
    amounts[i] = take; left -= take;
  }
  for (const option of options) for (const requirement of option.requires ?? []) {
    const take = Math.min(left, Math.max(0, requirement.amount - amounts[requirement.index]));
    amounts[requirement.index] += take; left -= take;
  }
  if (left > 0 && amounts.length) amounts[amounts.length - 1] += left;
  return {indices: [], amounts};
}

const MAIN = ["MAIN1", "MAIN2"];
const isLand = (card) => (card?.types ?? []).includes("Land");
const isCreature = (card) => (card?.types ?? []).includes("Creature");

/* THE MANA A CARD MAKES, read off the card as anyone reads it: what each of its mana abilities says it adds (`produces`, one
   way or a list of them; a basic land type's is written there too, CR 305.6), all five for "one mana of any color", and C
   for colorless. What a land found by a search would give; the room's public facts carry it as `makes` (game/room/room.mjs).
   Pure, over a definition. */
const MANA = ["W", "U", "B", "R", "G", "C"];
export function manaColors(card) {
  const made = new Set();
  for (const ability of card?.abilities ?? []) {
    if (ability.kind !== "mana") continue;
    if (ability.anyColor) for (const color of MANA.slice(0, 5)) made.add(color);
    for (const way of [ability.produces ?? []].flat()) for (const color of Object.keys(way ?? {})) made.add(color);
  }
  return MANA.filter((color) => made.has(color));
}
/* Counters that cost the one who has them: a negative one (CR 122.1a), poison (CR 122.1f), stun (CR 122.1d), finality
   (CR 122.1h), and the kinds a card counts against its holder. Any other kind is its holder's: +1/+1, loyalty, charge, lore. */
const HARMFUL = new Set(["poison", "stun", "finality", "age", "burden", "doom", "rad", "depletion", "bounty"]);
const harmful = (kind) => kind.startsWith("-") || HARMFUL.has(kind);

/**
 * @param {{seat: number, cards?: (name: string) => ?{manaValue?: number, types?: string[], power?: number, toughness?: number}, picks?: boolean}} options
 *   `cards` answers public questions about a named card; without it the pilot plays what it can see. `picks`: it takes what
 *   a choice it may answer with none is for (above); without it, none.
 */
export function housePilot({seat, cards = () => null, picks = false} = {}) {
  if (!Number.isInteger(seat) || seat < 0) throw new Error("A house pilot sits in one seat");
  const known = (name) => (name ? cards(name) : null) ?? null;
  const manaValue = (name) => known(name)?.manaValue ?? Infinity;

  function me(view) {
    if (!view || view.viewerSeatId !== seat) throw new Error(`The house pilot for seat ${seat} was handed seat ${view?.viewerSeatId}'s view`);
    return view.players[seat];
  }
  const zone = (player, name) => player?.zones?.[name]?.cards ?? [];
  const creaturesOf = (player) => zone(player, "Battlefield").filter((c) => isCreature(c));
  const poolTotal = (player) => (player.mana ?? []).reduce((n, m) => n + m.amount, 0);
  /* Whose a target is, read off the view: a permanent's controller, or the player. */
  const controllerIn = (view, id) => {
    for (const player of view.players ?? []) for (const card of zone(player, "Battlefield")) if (card.cardId === id) return card.controller;
    return null;
  };
  /* How many of an offer's targets are on the side its effect is meant for. */
  const aim = (view, action) => (action.targets ?? []).reduce((n, t) => {
    /* A counted target is picked later, by `answer` below ("choose-targets"): worth taking the offer for -- unless there is
       nothing to pick ("up to two target creatures you control", with none). */
    if (Array.isArray(t)) return n + 1;
    if (t?.kind === "choose") return n + ((t.of ?? 1) > 0 ? 1 : 0);
    /* An ability on the stack (Bolt Bend): its controller, as the stack shows it -- its stack id names no card. */
    const theirs = t.kind === "player" ? t.id !== seat : t.kind === "ability" ? ((view.stack ?? []).find((e) => e.stackId === t.id)?.playerId ?? seat) !== seat
      : (controllerIn(view, t.id) ?? seat) !== seat;
    return n + (theirs === (action.hostile === true) ? 1 : 0);
  }, 0);

  /* The first `count` options, honoring `exclusiveBy` and `capped` the way the controller does -- `capped`: no more of a value
     than it allows ("controlled by different players", one of each player's). */
  function firstOf(choice, preferred, count) {
    const used = new Set(), out = [], taken = new Map();
    for (const index of preferred) {
      if (out.length >= count) break;
      const option = choice.options[index];
      const key = choice.exclusiveBy ? option?.[choice.exclusiveBy] : undefined;
      if (key !== undefined && used.has(key)) continue;
      const cap = choice.capped ? option?.[choice.capped.by] : undefined;
      if (cap !== undefined && choice.capped.most?.[cap] !== undefined && (taken.get(cap) ?? 0) >= choice.capped.most[cap]) continue;
      if (cap !== undefined) taken.set(cap, (taken.get(cap) ?? 0) + 1);
      if (key !== undefined) used.add(key);
      out.push(index);
    }
    return out;
  }

  /* ---- What it takes when it may take none (`picks`) ---- */

  /* Its permanents, wherever their owners' battlefields list them: the view lists a permanent under its owner. */
  const mine = (view) => (view.players ?? []).flatMap((p) => zone(p, "Battlefield")).filter((c) => c.controller === seat);
  const makes = (name) => known(name)?.makes ?? manaColors(known(name));
  /* An option's card by name: as the view shows it, or as the option says it ("Bear, in your graveyard", a search of two zones). */
  const nameOf = (view, option) => (view.players ?? []).flatMap((p) => Object.values(p.zones ?? {}).flatMap((z) => z.cards ?? []))
    .find((c) => c.cardId === option.cardId && c.name)?.name ?? String(option.label ?? "").replace(/, in your [a-z ]+$/, "");
  /* Lands, best first: each the one making most of the colors its hand and commanders cost and nothing of its own makes yet,
     then most of those it needs at all; one taken counts as made, so the next brings another color. */
  function landOrder(view, self, choice, indices) {
    const need = Object.fromEntries(MANA.map((color) => [color, 0]));
    for (const c of [...zone(self, "Hand"), ...zone(self, "Command").filter((c) => c.commander)])
      for (const color of known(c.name)?.colors ?? []) need[color] = (need[color] ?? 0) + (c.commander ? 2 : 1);
    const have = new Set(mine(view).flatMap((c) => makes(c.name)));
    const left = [...indices], order = [];
    while (left.length) {
      const score = (i) => makes(nameOf(view, choice.options[i])).reduce((n, color) => n + need[color] * (have.has(color) ? 1 : 4), 0);
      const best = left.reduce((top, i) => (score(i) > score(top) ? i : top));
      order.push(best);
      left.splice(left.indexOf(best), 1);
      for (const color of makes(nameOf(view, choice.options[best]))) have.add(color);
    }
    return order;
  }
  /* Other cards, best first: the costliest it could cast by its next turn -- a mana for each of its sources, and the land it
     would play -- then the cheapest of the rest, which it reaches soonest. */
  function spellOrder(view, choice, indices) {
    const could = mine(view).filter((c) => isLand(c) || makes(c.name).length).length + 1;
    const mv = (i) => manaValue(nameOf(view, choice.options[i]));
    return [...indices.filter((i) => mv(i) <= could).sort((a, b) => mv(b) - mv(a) || a - b), ...indices.filter((i) => mv(i) > could).sort((a, b) => mv(a) - mv(b) || a - b)];
  }
  /* A player's or a permanent's counters, the kinds there are: a player's poison among them (CR 122.1f). */
  function countersOf(view, option) {
    if (option.playerId !== undefined) {
      const p = view.players?.[option.playerId];
      return Object.entries({...(p?.counters ?? {}), ...(p?.health?.poison > 0 ? {poison: p.health.poison} : {})}).filter(([, n]) => n > 0).map(([kind]) => kind);
    }
    const card = (view.players ?? []).flatMap((p) => zone(p, "Battlefield")).find((c) => c.cardId === option.cardId);
    return Object.entries(card?.counters ?? {}).filter(([, n]) => n > 0).map(([kind]) => kind);
  }

  /* The answer to a choice it may answer with none -- or to any search of a library -- when it has a rule for it; null when
     it has none. Each takes the options it wants in order, as many as it may, kept to the choice's `exclusiveBy` and
     `capped` (firstOf); a choice held to a `budget` never comes here, the rule for it in `answer` keeping the most it can. */
  function takes(view, self, choice) {
    const id = String(choice.id ?? ""), options = choice.options ?? [], min = choice.min ?? 0, max = choice.max ?? 0;
    const all = options.map((o) => o.index), title = String(choice.title ?? "");
    /* A search (CR 701.23) of its library, or a card it may put somewhere from its hand or graveyard ("you may put a land card
       from your hand onto the battlefield", Chulane): as many as it may of what it is for. A land search, the lands of the
       colors it lacks; any other, the costliest card it could cast soon -- and a land first when its hand has none and it
       has fewer than four in play. A search for a card with a quality may fail to find (CR 701.23b), but finding is why
       the card was played. A card it must put from its hand or graveyard (Brainstorm's two, back on top) is not one it
       wants: those are left to the first answer, below. */
    if (id.startsWith("chooseCard:") && (/^Search your library/.test(title) || (min === 0 && /^Search your (hand|graveyard)/.test(title)))) {
      const land = (i) => (known(nameOf(view, options[i]))?.types ?? []).includes("Land");
      const lands = all.filter(land), others = all.filter((i) => !land(i));
      const short = !zone(self, "Hand").some(isLand) && mine(view).filter(isLand).length < 4;
      const order = short || !others.length ? [...landOrder(view, self, choice, lands), ...spellOrder(view, choice, others)]
        : [...spellOrder(view, choice, others), ...landOrder(view, self, choice, lands)];
      return firstOf(choice, order, max);
    }
    /* Proliferate (CR 701.34a): each permanent and player whose counters are all of a kind it wants more of -- its own where
       each kind helps it (+1/+1, loyalty), another's where each kind hurts them (poison, -1/-1) -- so never an opponent's
       +1/+1 or loyalty, and never its own poison. */
    if (id.startsWith("proliferate:")) {
      const wanted = options.filter((o) => {
        const kinds = countersOf(view, o);
        const own = o.playerId !== undefined ? o.playerId === seat : controllerIn(view, o.cardId) === seat;
        return kinds.length > 0 && (own ? !kinds.some(harmful) : kinds.every(harmful));
      });
      return firstOf(choice, wanted.map((o) => o.index), max);
    }
    /* Any other choice of any number, none among them (Peregrine Drake's "untap up to five lands"; "choose up to two to keep,
       the rest are sacrificed"): the permanents and players on the side it is meant for, as `aim` reads a spell's targets --
       an opponent's when the choice is hostile, else its own -- the costliest first, as many as it may. A card in another
       zone is on no side, and is left: the top of a library being surveilled, a card it may put into its graveyard. */
    if (choice.mode === "many" && min === 0) {
      const sided = options.filter((o) => o.targets || o.playerId !== undefined || controllerIn(view, o.cardId) !== null);
      const aimed = sided.filter((o) => aim(view, o.targets ? o : {hostile: choice.hostile === true || o.hostile === true,
        targets: [o.playerId !== undefined ? {kind: "player", id: o.playerId} : {kind: "card", id: o.cardId}]}) > 0);
      const value = (o) => (o.playerId !== undefined ? 0 : known(nameOf(view, o))?.manaValue ?? 0);
      return firstOf(choice, aimed.sort((a, b) => value(b) - value(a) || a.index - b.index).map((o) => o.index), max);
    }
    return null;
  }

  return {
    id: HOUSE_PILOT_ID,
    seat,

    /** True when `choose` would pass whatever the board: nothing on offer that it ever takes -- a land, a loyalty ability,
        a spell, a face-down card turned up -- and no mana it would tap, which it does only in its own main phase with
        the stack empty. The room then passes for it without working out its view (game/room/room.mjs). */
    passes(actions, stackSize) {
      return !actions.some((a) => a.kind === "play-land" || a.kind === "cast" || a.kind === "turn-face-up" || a.kind === "suspend" || (a.kind === "activate" && a.loyalty !== undefined)
        || (a.kind === "activate-mana" && stackSize === 0));
    },

    /** One of the offered actions. */
    choose(view, actions) {
      const self = me(view);
      if (!Array.isArray(actions) || actions.length === 0) throw new Error("There are no legal actions to choose from");
      /* A real land before a double-faced card's land face: the spell on its front is worth keeping. */
      const land = actions.find((a) => a.kind === "play-land" && !a.face) ?? actions.find((a) => a.kind === "play-land");
      if (land) return land;
      /* A planeswalker's loyalty ability, once a turn (CR 606.3): the one that costs the least loyalty, aimed where its
         targets should go. */
      const loyal = actions.filter((a) => a.kind === "activate" && a.loyalty !== undefined && (!(a.targets ?? []).length || aim(view, a) > 0));
      if (loyal.length) return loyal.reduce((best, a) => (a.loyalty > best.loyalty ? a : best));
      /* An X spell at X = 0 does next to nothing; at its largest it does the most (CR 107.3). */
      /* Never convoked (CR 702.51a): which creatures to tap is a plan of its own, and the pool or the lands pay instead. */
      /* X paid in life (Toxic Deluge, `payLifeX`): never all of its life -- paying it, it would lose (CR 704.5a) -- and no more
         is worth more, so the least X that does something is the one cast. */
      const casts = actions.filter((a) => a.kind === "cast" && a.x !== 0 && !a.convoke && (!(a.targets ?? []).length || aim(view, a) > 0)
        && !(a.payLifeX === true && a.x >= self.life));
      const worth = (a) => manaValue(a.label) + (a.payLifeX === true ? 0 : a.x ?? 0);
      const best = casts.length ? casts.reduce((top, a) => (worth(a) > worth(top) || (worth(a) === worth(top) && aim(view, a) > aim(view, top)) ? a : top)) : null;
      /* An X spell waits for every source to be tapped first, so X is as large as the mana allows. */
      const untapped = actions.filter((a) => a.kind === "activate-mana" && !a.costChoice);
      if (best && best.x !== undefined && untapped.length && view.turnPlayerId === seat && MAIN.includes(view.phase) && view.stackSize === 0) return untapped[0];
      if (best) return best;
      /* A card suspended from its hand (CR 702.62a), when the pool already pays its suspend cost and nothing is cast: it comes
         back free in a few turns. */
      const suspend = actions.find((a) => a.kind === "suspend");
      if (suspend) return suspend;
      /* A manifested creature card of its own turned face up (CR 701.40b), when the pool already pays and nothing is cast. */
      const faceUp = actions.find((a) => a.kind === "turn-face-up");
      if (faceUp) return faceUp;
      /* Tap for mana only for a spell that would then fit: in its own main phase with the stack empty,
         a nonland card it holds (or its commander) costing no more than the mana it could have. */
      /* Never a source whose cost is a creature (Ashnod's Altar): the pilot does not trade its board for mana. */
      const sources = actions.filter((a) => a.kind === "activate-mana" && !a.costChoice);
      if (sources.length && view.turnPlayerId === seat && MAIN.includes(view.phase) && view.stackSize === 0) {
        const could = new Set(sources.map((a) => a.objectId)).size + poolTotal(self);
        const spells = [...zone(self, "Hand"), ...zone(self, "Command").filter((c) => c.commander)].filter((c) => c.name && !isLand(c));
        /* A spell with {X} wants every source tapped: X is as large as the mana (CR 107.3). */
        const wanted = spells.some((c) => manaValue(c.name) <= could && (manaValue(c.name) > poolTotal(self) || known(c.name)?.x === true));
        if (wanted) return sources[0];
      }
      return actions.find((a) => a.kind === "pass") ?? actions[0];
    },

    /** An answer to an offered choice, always within its bounds. */
    answer(view, choice) {
      const self = me(view);
      const min = choice.min ?? 0, max = choice.max ?? 0;
      const options = choice.options ?? [];
      const id = String(choice.id ?? "");

      if (choice.mode === "integer") return {value: min};
      if (choice.mode === "ack") return {indices: []};
      if (choice.mode === "text") return {cancel: true};
      if (choice.mode === "damage") return combatDamageAnswer(choice);
      const combatSource = combatSourceAnswer(choice);
      if (combatSource) return combatSource;
      if (choice.mode === "amount") {
        const minEach = choice.minEach ?? 0, amounts = options.map(() => minEach);
        let left = (choice.total ?? 0) - minEach * options.length;
        for (let i = 0; i < options.length && left > 0; i += 1) { const take = Math.min(left, Math.max(0, (options[i].max ?? 0) - amounts[i])); amounts[i] += take; left -= take; }
        return {indices: [], amounts};
      }

      /* Keep two to five lands; after two mulligans, keep. */
      if (id.startsWith("mulligan:")) {
        const lands = zone(self, "Hand").filter(isLand).length;
        const taken = Number(id.split(":")[2] ?? 0);
        return {indices: [taken >= 2 || (lands >= 2 && lands <= 5) ? 0 : 1]};
      }
      /* Bottom what the hand has too much of: lands past four, else the most expensive spells. */
      if (id.startsWith("mulligan-bottom:") || id.startsWith("cleanup-discard:")) {
        const hand = new Map(zone(self, "Hand").map((c) => [c.cardId, c]));
        const lands = options.filter((o) => isLand(hand.get(o.cardId))).length;
        const rank = (o) => { const c = hand.get(o.cardId); return isLand(c) ? (lands > 4 ? 1000 : -1) : manaValue(c?.name ?? o.label); };
        const order = options.map((o, i) => i).sort((a, b) => rank(options[b]) - rank(options[a]) || a - b);
        return {indices: firstOf(choice, order, min)};
      }
      /* A choice held to a budget ("any number of creatures with total power 4 or less", Slaughter the Strong): the strongest
         first while they fit, so the most power is kept. Not an attack's, planned below. */
      if (choice.budget && !id.startsWith("declare-attackers:") && !id.startsWith("declare-blockers:")) {
        const by = choice.budget.by, order = options.map((o) => o.index).sort((a, b) => (options[b][by] ?? 0) - (options[a][by] ?? 0) || a - b);
        const kept = [];
        let total = 0;
        for (const index of order) if (kept.length < max && total + (options[index][by] ?? 0) <= choice.budget.most) { kept.push(index); total += options[index][by] ?? 0; }
        return {indices: kept};
      }
      /* Which permanent of a type a player keeps, chosen by this seat for each player (Tragic Arrogance): its own costliest,
         another player's cheapest. */
      if (id.startsWith("sacrifice-keep-type:") && options.length) {
        const own = options[0].keeper === seat, value = (o) => manaValue(o.label);
        return {indices: [options.reduce((best, o) => ((own ? value(o) > value(best) : value(o) < value(best)) ? o : best)).index]};
      }
      if (id.startsWith("sacrifice:")) {
        const rank = (o) => (o.token ? -1 : manaValue(o.label));
        const order = options.map((o, i) => i).sort((a, b) => rank(options[a]) - rank(options[b]) || a - b);
        return {indices: firstOf(choice, order, min)};
      }
      if (id.startsWith("declare-attackers:")) {
        const opponents = view.players.filter((p) => p.playerId !== seat && p.health.status === "active");
        const blockersOf = (pid) => creaturesOf(view.players[pid]).filter((c) => !c.tapped);
        const mine = new Map(creaturesOf(self).map((c) => [c.cardId, c]));
        const target = (optionsFor) => optionsFor.reduce((best, o) => {
          const life = view.players[o.defenderId].life, bestLife = view.players[best.defenderId].life;
          return life < bestLife || (life === bestLife && o.defenderId < best.defenderId) ? o : best;
        });
        const byCreature = new Map();
        /* Players only: the house pilot does not attack a planeswalker (an attack on one is not on its controller). */
        for (const o of options) { if (!opponents.some((p) => p.playerId === o.defenderId) || o.planeswalkerId !== undefined) continue; (byCreature.get(o.cardId) ?? byCreature.set(o.cardId, []).get(o.cardId)).push(o); }
        /* One defender for the whole attack: the one it can hurt most, a lethal attack first, then the lowest
           life. Against a defender with fewer untapped creatures than it has attackers, everything goes in,
           because the excess gets through however they block; otherwise only the creatures no untapped blocker
           can kill for free. The damage estimate assumes the defender blocks the biggest attackers. */
        const plans = opponents.map((p) => {
          const ready = [...byCreature].map(([cardId, list]) => [mine.get(cardId), list.find((o) => o.defenderId === p.playerId)])
            .filter(([c, o]) => o && (c?.power ?? 0) > 0);
          const walls = blockersOf(p.playerId);
          const overwhelm = ready.length > walls.length;
          const sent = ready.filter(([c]) => overwhelm || !walls.some((b) => (b.power ?? 0) >= (c?.toughness ?? 0) && (b.toughness ?? 0) > (c?.power ?? 0)));
          /* No more than it can pay for (an attack tax, CR 508.1h; the record's `budget`): the strongest first. */
          const affordable = new Set(keptWithin(choice, sent.slice().sort(([a, x], [b, y]) => (b?.power ?? 0) - (a?.power ?? 0) || x.index - y.index).map(([, o]) => o.index)));
          const going = sent.filter(([, o]) => affordable.has(o.index));
          const powers = going.map(([c]) => c?.power ?? 0).sort((a, b) => a - b);
          const through = powers.slice(0, Math.max(0, powers.length - walls.length)).reduce((n, x) => n + x, 0);
          return {p, going, through, lethal: through >= p.life};
        }).filter((plan) => plan.going.length);
        /* And every creature the rules make attack (CR 508.1d, the record's `requires`): sent at the same player, if it can. */
        if (!plans.length) return {indices: meetRequirements(choice, [])};
        const best = plans.reduce((a, b) => (b.lethal !== a.lethal ? (b.lethal ? b : a)
          : b.through !== a.through ? (b.through > a.through ? b : a)
          : b.p.life < a.p.life || (b.p.life === a.p.life && b.p.playerId < a.p.playerId) ? b : a));
        const picks = best.going.map(([, o]) => o.index);
        return {indices: meetRequirements(choice, firstOf(choice, picks, max), best.p.playerId)};
      }
      if (id.startsWith("declare-blockers:")) {
        const attacks = view.combat?.attacks.filter((a) => a.defender === seat) ?? [];
        const onBoard = new Map(view.players.flatMap((p) => creaturesOf(p)).map((c) => [c.cardId, c]));
        /* What would come at its life: an attack on one of its planeswalkers would not. */
        const incoming = attacks.filter((a) => a.planeswalker === undefined).reduce((n, a) => n + (onBoard.get(a.attacker)?.power ?? 0), 0);
        const lethal = incoming >= self.life;
        const used = new Set(), blocked = new Set(), picks = [];
        const good = (o) => { const b = onBoard.get(o.cardId), a = onBoard.get(o.attackerId); return (b?.power ?? 0) >= (a?.toughness ?? 0) && (b?.toughness ?? 0) > (a?.power ?? 0); };
        /* One blocker each, so never on a creature with menace, which only two or more may block (CR 702.111b): the
           rules would refuse the whole declaration. Read from what it sees of the attacker. */
        const single = options.filter((o) => !(onBoard.get(o.attackerId)?.keywords ?? []).includes("Menace"));
        for (const o of single) if (good(o) && !used.has(o.cardId) && !blocked.has(o.attackerId)) { picks.push(o.index); used.add(o.cardId); blocked.add(o.attackerId); }
        if (lethal) {
          const biggest = [...single].sort((x, y) => (onBoard.get(y.attackerId)?.power ?? 0) - (onBoard.get(x.attackerId)?.power ?? 0) || x.index - y.index);
          for (const o of biggest) if (!used.has(o.cardId) && !blocked.has(o.attackerId)) { picks.push(o.index); used.add(o.cardId); blocked.add(o.attackerId); }
        }
        /* And what the record requires ("must be blocked if able", CR 509.1c): those blocks added to its own -- kept, in order,
           to what it can pay to block with (a block tax, Archangel of Tithes; CR 509.1d). */
        const kept = keptWithin(choice, picks.slice(0, Math.max(min, Math.min(max, picks.length))));
        return {indices: Array.isArray(choice.requires) && choice.requires.length ? meetRequirements(choice, kept) : kept};
      }
      /* A trigger's targets (engine 2.4c): aimed as a cast is -- a hostile one at an opponent's things. */
      if (id.startsWith("trigger-targets:") && options.length) {
        const best = options.reduce((b, o) => (aim(view, o) > aim(view, b) ? o : b));
        return {indices: [best.index]};
      }
      /* A counted target ("up to two target creatures"): every one on the side its effect is meant for, as many as it may,
         at least as many as it must. */
      if (id.startsWith("choose-targets:")) {
        const aimed = options.filter((o) => aim(view, o) > 0).map((o) => o.index);
        const rest = options.map((o) => o.index).filter((i) => !aimed.includes(i));
        /* Kept to a cap the choice carries ("controlled by different players"): the first of each it may take. */
        const fit = firstOf(choice, [...aimed, ...rest], max);
        return {indices: fit.slice(0, Math.max(min, Math.min(max, fit.filter((i) => aimed.includes(i)).length)))};
      }
      /* A flashback cost's creatures to tap (Battle Screech), or escalate's (Collective Effort): the weakest first -- what it
         would least miss in combat. */
      if (id.startsWith("choose-cost:") && (choice.cost === "tap" || choice.cost === "escalate")) {
        const mine = new Map(creaturesOf(self).map((c) => [c.cardId, c]));
        const order = options.map((o, i) => i).sort((a, b) => (mine.get(options[a].cardId)?.power ?? 0) - (mine.get(options[b].cardId)?.power ?? 0) || a - b);
        return {indices: firstOf(choice, order, min)};
      }
      /* What to behold (CR 701.4a): permanents first -- choosing one shows nothing -- then cards revealed from the hand. */
      if (id.startsWith("choose-cost:") && choice.cost === "behold") {
        const order = options.map((o, i) => i).sort((a, b) => Number(options[a].fromHand === true) - Number(options[b].fromHand === true) || a - b);
        return {indices: firstOf(choice, order, min)};
      }
      /* Creatures tapped as an additional cost, any number of them ("three times the number of creatures tapped this way",
         Burn at the Stake): every one it is offered, for the most the spell can do. */
      if (id.startsWith("choose-cost:") && choice.cost === "tapAny") return {indices: options.map((o) => o.index).slice(0, max)};
      /* What a cast taps for itself (rules/actions.mjs, castTapPlans): the first way, the least flexible sources tapped,
         keeping the most colors for later. */
      if (id.startsWith("choose-cost:") && choice.cost === "mana") return {indices: [0]};
      /* Which mana in the pool pays (rules/actions.mjs, X8b): mana rather than life where a way spends none, else the first
         way found -- the pool's order, its colors as they came. */
      if (id.startsWith("choose-cost:") && choice.cost === "pool") {
        const lifeless = options.find((o) => /\|0$/.test(o.key ?? ""));
        return {indices: [(lifeless ?? options[0]).index]};
      }
      /* "You may pay {X}" (Halo Forager): the most it can pay that is the mana value of an instant or sorcery card in a
         graveyard -- what that X is for -- or nothing. */
      if (id.startsWith("unless:") && options.some((o) => o.x !== undefined)) {
        const values = new Set(view.players.flatMap((p) => zone(p, "Graveyard")).filter((c) => (known(c.name)?.types ?? []).some((t) => t === "Instant" || t === "Sorcery")).map((c) => manaValue(c.name)));
        const best = options.filter((o) => o.x !== undefined && values.has(o.x)).reduce((top, o) => (!top || o.x > top.x ? o : top), null);
        return {indices: [(best ?? options.find((o) => o.pay === false)).index]};
      }
      /* Escape's other cards (CR 702.138a): the lands first, then the cheapest -- what it is least likely to want back. */
      if (id.startsWith("choose-cost:")) {
        const yard = new Map(zone(self, "Graveyard").map((c) => [c.cardId, c]));
        const rank = (o) => (isLand(yard.get(o.cardId)) ? -1 : manaValue(o.label.replace(/ \(\d+\)$/, "")));
        const order = options.map((o, i) => i).sort((a, b) => rank(options[a]) - rank(options[b]) || a - b);
        return {indices: firstOf(choice, order, min)};
      }
      /* Which counters to remove (Mabel, Bitter Recluse): from another player's permanent all it may but -1/-1 counters; from
         its own, its -1/-1 counters alone -- and only as many others as it must. */
      if (id.startsWith("remove-counters:") && options.length) {
        const own = controllerIn(view, options[0].cardId) === seat, harmful = (i) => options[i].counter === "-1/-1";
        const wanted = options.map((o) => o.index).filter((i) => own === harmful(i));
        const rest = options.map((o) => o.index).filter((i) => !wanted.includes(i));
        return {indices: [...wanted, ...rest].slice(0, Math.max(min, Math.min(max, wanted.length)))};
      }
      /* Where a counter moves (Forgotten Ancient): onto a creature of its own, else no more. */
      if (id.startsWith("move-counters:") && options.length) {
        const own = options.find((o) => o.cardId !== undefined && controllerIn(view, o.cardId) === seat);
        return {indices: [(own ?? options[options.length - 1]).index]};
      }
      /* CR 616.1: which effect changes damage dealt to it or its own first -- the one that leaves the least. */
      if (id.startsWith("order-damage:") && options.length) {
        const best = options.reduce((b, o) => ((o.leaves ?? Infinity) < (b.leaves ?? Infinity) ? o : b));
        return {indices: [best.index]};
      }
      /* CR 616.1: which effect changes the counters put on its own permanent first -- the most, or of -1/-1 counters the
         fewest (the kind is in the question's id). */
      if (id.startsWith("order-counters:") && options.length) {
        const fewest = id.includes(":-1/-1:");
        const best = options.reduce((b, o) => ((fewest ? o.least < b.least : o.puts > b.puts) ? o : b));
        return {indices: [best.index]};
      }
      /* CR 616.1: which effect changes the tokens it makes first (Anointed Procession, Queen Allenal) -- the most. */
      if (id.startsWith("order-tokens:") && options.length) {
        const best = options.reduce((b, o) => ((o.makes ?? 0) > (b.makes ?? 0) ? o : b));
        return {indices: [best.index]};
      }
      /* A choice it may answer with none, or a search: what the choice is for (`picks`, above). */
      if (picks && max > 0) {
        const taken = takes(view, self, choice);
        if (taken) return {indices: taken};
      }
      /* Anything else (trigger order, the commander's zone, an effect's choice): the first legal answer,
         in the order offered, which is also what a careful reader would do by default. */
      if (choice.mode === "boolean") return {indices: [0]};
      return {indices: firstOf(choice, options.map((o, i) => i), Math.max(min, choice.mode === "one" ? 1 : min))};
    },
  };
}
