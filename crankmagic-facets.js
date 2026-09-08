/* The graph's filters: what a card IS, and what you have.
 *
 * The previous app's graph page carried twelve of these and they were the reason the
 * page was useful -- 7,764 cards is not a thing you browse, it is a thing you narrow.
 * CrankMagic's Discover shipped with a search box and nothing else, so the graph could
 * only ever show you the neighbourhood of a card you could already name. These bring
 * the narrowing back.
 *
 * PURE, AND SEPARATE FROM THE UI, for the same reason the rest of this repo is: the
 * counting and matching is where the bugs live, and it can be tested in Node without a
 * browser. crankmagic-discover.js draws checkboxes; this decides what they mean.
 *
 * TWO KINDS OF FACET, and the difference matters.
 *
 *   Ten of them describe Magic -- role, colour, type, mechanics, what a card produces or
 *   requires. They come from data/graph.json, which is public card data.
 *
 *   Two describe YOU -- what you own, and which of your decks a card is in. The old
 *   graph baked those into graph.json from the old app's state, and card-catalog.js
 *   deliberately drops them ("This adapter deliberately drops the own, bench and deck
 *   flags baked into the historical graph"), because ownership is now real, audited
 *   state in the collection model rather than a number frozen into a public file. So
 *   they are supplied here from the live library and matched by card NAME, which is the
 *   only identifier the graph and the collection actually share.
 *
 * A browser with an empty library gets neither: "not owned" against all 7,764 cards is
 * a control that filters nothing, and "in a deck" would offer no options at all. That
 * rule is inherited from the old page and it was right.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankFacets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CARD_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"];

  /* `mine: true` marks a facet that describes the reader rather than the card, so it can
     be dropped whole on an empty library. `match` overrides the default "card has every
     picked value"; only colour needs one. */
  const FACETS = [
    {key: "roles", label: "Role", from: (c) => c.roles || []},

    /* Colour, with the semantics a deckbuilder wants: "legal in a deck of these colours",
       not "printed in these colours". A colourless card is legal in every deck, so it
       passes any selection -- which makes ticking C on its own the only way to isolate
       colourless cards, and that is deliberate. */
    {key: "colors", label: "Color", from: (c) => (c.ci ? String(c.ci).split("") : ["C"]),
     match: (have, picked) => {
       const colorless = have.length === 1 && have[0] === "C";
       if (colorless) return true;
       if (picked.length === 1 && picked[0] === "C") return false;
       return have.every((v) => picked.includes(v));
     }},

    {key: "type", label: "Card type", from: (c) => CARD_TYPES.filter((t) => String(c.type || "").includes(t))},
    {key: "mechanics", label: "Mechanic", from: (c) => c.mechanics || []},
    {key: "tribes", label: "Tribe", from: (c) => c.tribes || []},
    {key: "triggers", label: "Fires on", from: (c) => c.triggers || []},
    {key: "causes", label: "Causes", from: (c) => c.causes || []},
    {key: "produces", label: "Produces", from: (c) => c.produces || []},
    {key: "requires", label: "Requires", from: (c) => c.requires || []},
    {key: "rarity", label: "Rarity", from: (c) => (c.rarity ? [c.rarity] : [])},

    {key: "owned", label: "Ownership", mine: true, from: (c) => c.__mine ? c.__mine.owned : []},
    {key: "decks", label: "In a deck", mine: true, from: (c) => c.__mine ? c.__mine.decks : []}
  ];

  /* WHAT YOU HAVE, BY NAME. The graph is keyed by Scryfall id and the collection by a
     folded-name id, so name is the only join. Quantities are summed across lots because
     a card can sit in several -- two owned copies in different boxes are still "in hand".
     Nothing here reads the stale own/ordered/bench fields in graph.json. */
  function mineFrom(state) {
    const byName = new Map();
    if (!state) return byName;
    const cardName = (id) => (state.cards && state.cards[id] ? state.cards[id].name : "");
    const bucket = (name) => {
      if (!byName.has(name)) byName.set(name, {owned: new Set(), decks: new Set()});
      return byName.get(name);
    };
    for (const lot of state.lots || []) {
      const name = cardName(lot.cardId);
      if (!name) continue;
      const row = bucket(name);
      if (lot.source === "owned") row.owned.add(lot.location && lot.location.kind === "deck" ? "in a deck box" : "on the bench");
      if (lot.source === "ordered") row.owned.add("on order");
      if (lot.source === "incoming") row.owned.add("incoming trade");
    }
    for (const deck of state.decks || []) {
      if (deck.archived) continue;
      for (const slot of deck.slots || []) {
        const name = cardName(slot.cardId);
        if (name) bucket(name).decks.add(deck.name);
      }
    }
    return byName;
  }

  /* Attach each card's personal facts once, rather than looking them up per filter pass.
     `__mine` is deliberately ugly: it is a computed attachment, not card data, and it
     should look wrong if it ever ends up somewhere that expects a catalog row. */
  function decorate(cards, state) {
    const mine = mineFrom(state);
    const has = mine.size > 0;
    return (cards || []).map((c) => {
      if (!has) return c;
      const row = mine.get(c.name);
      return {...c, __mine: {
        owned: row ? [...row.owned] : ["not owned"],
        decks: row ? [...row.decks] : []
      }};
    });
  }

  /* Which facets to show. The two personal ones are dropped whole when the library holds
     nothing -- an Ownership control whose only option is "not owned" filters nothing and
     costs a whole panel of screen to say so. */
  function available(state) {
    const personal = mineFrom(state).size > 0;
    return FACETS.filter((f) => !f.mine || personal);
  }

  /* Every value each facet can take, with how many cards carry it, commonest first.
     Counted over the WHOLE set rather than the filtered one, so the options do not
     shuffle under the reader's cursor as they tick boxes. */
  function values(cards, state) {
    const decorated = decorate(cards, state);
    const out = {};
    for (const facet of available(state)) {
      const counts = new Map();
      for (const card of decorated) {
        for (const v of facet.from(card) || []) {
          if (v === undefined || v === null || v === "") continue;
          counts.set(v, (counts.get(v) || 0) + 1);
        }
      }
      out[facet.key] = [...counts.entries()]
        .map(([value, count]) => ({value, count}))
        .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
    }
    return out;
  }

  /* Within a facet the picks are ANDed -- "a creature that is also a Rat" -- and across
     facets too. That is what the old page did, and it is what makes the count fall
     predictably as you tick. A facet with nothing ticked is not a filter. */
  function matches(card, selection, options) {
    const any = Boolean(options && options.any);
    for (const facet of FACETS) {
      const picked = (selection && selection[facet.key]) || [];
      if (!picked.length) continue;
      const have = facet.from(card) || [];
      /* Colour keeps its own rule in either mode: "legal in a deck of these colours" is
         not a list of alternatives, it is one question about the whole identity. */
      const ok = facet.match ? facet.match(have, picked)
        : any ? picked.some((v) => have.includes(v))
        : picked.every((v) => have.includes(v));
      if (!ok) return false;
    }
    return true;
  }

  function apply(cards, selection, state, options) {
    const decorated = decorate(cards, state);
    if (!selection || !Object.values(selection).some((v) => v && v.length)) return decorated;
    return decorated.filter((c) => matches(c, selection, options));
  }

  function count(selection) {
    return Object.values(selection || {}).reduce((n, v) => n + ((v && v.length) || 0), 0);
  }

  /* The picks as flat rows, so the UI can print a chip per pick and offer to remove it
     one at a time rather than only offering Clear all. */
  function chips(selection) {
    const out = [];
    for (const facet of FACETS) {
      for (const value of (selection && selection[facet.key]) || []) {
        out.push({key: facet.key, label: facet.label, value});
      }
    }
    return out;
  }

  function toggle(selection, key, value) {
    const next = {...(selection || {})};
    const picked = next[key] ? [...next[key]] : [];
    const at = picked.indexOf(value);
    if (at >= 0) picked.splice(at, 1); else picked.push(value);
    if (picked.length) next[key] = picked; else delete next[key];
    return next;
  }

  return {FACETS, CARD_TYPES, available, values, apply, matches, decorate, mineFrom, count, chips, toggle};
});
