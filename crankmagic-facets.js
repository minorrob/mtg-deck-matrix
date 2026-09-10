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
 *   Thirteen of them describe Magic -- role, colour, type, mechanics, and the four
 *   directed relations a chain is built out of: what a card triggers on and what causes
 *   that event, what it produces and what requires it, what it multiplies, what quality
 *   it grants and what extends one. They come from data/graph.json, which is public card
 *   data; tools/graph-amplifiers.mjs bakes the last three.
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

    /* THE FOUR DIRECTED ONES, in the order a chain is built. A card TRIGGERS on an event,
       another CAUSES it; a card PRODUCES a resource, another REQUIRES it; a card MULTIPLIES
       what a third makes or fires; a card GRANTS a quality and another EXTENDS it across
       the board. Picking one side and reading the other is how the graph is walked, so
       both sides are offered as filters rather than only the halves the old page had. */
    {key: "triggers", label: "Triggers on", from: (c) => c.triggers || []},
    {key: "causes", label: "Causes", from: (c) => c.causes || []},
    {key: "multiplies", label: "Multiplies", from: (c) => c.multiplies || []},
    {key: "produces", label: "Produces", from: (c) => c.produces || []},
    {key: "requires", label: "Requires", from: (c) => c.requires || []},
    {key: "grants", label: "Grants", from: (c) => c.grants || []},
    {key: "extends", label: "Extends", from: (c) => c.extends || []},

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
      if (lot.source === "owned") row.owned.add(lot.location && lot.location.kind === "deck" ? "in deck box" : "on the bench");
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

  /* The ownership join on its own, for callers that want the answer rather than the filter:
     the graph paints an owned card's gold band from this. Same rule as the Ownership facet
     -- a lot whose source is "owned", matched by name, because a graph node's id comes from
     graph.json and a lot's from the catalog and the two only meet on the name. */
  function ownedNames(state) {
    const set = new Set();
    for (const lot of (state && state.lots) || []) {
      if (lot.source !== "owned") continue;
      const card = state.cards && state.cards[lot.cardId];
      if (card && card.name) set.add(card.name);
    }
    return set;
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

  /* A PICK IS THREE-WAY, and the third state is the one that was missing. Tapping a term
     once asks for the cards that carry it; tapping again asks for the cards that do NOT
     ("show me the counters deck without the proliferate"); tapping a third time lets go.
     An exclusion is stored as the value with a "!" in front of it, so a selection stays a
     plain object of string arrays -- one shape to save in preferences, put in a URL and
     compare. A value cannot begin with "!" in any of these vocabularies. */
  const NOT = "!";
  const isExclude = (v) => String(v).startsWith(NOT);
  const bare = (v) => (isExclude(v) ? String(v).slice(NOT.length) : v);
  const split = (picked) => ({
    yes: picked.filter((v) => !isExclude(v)),
    no: picked.filter(isExclude).map(bare)
  });

  /* Within a facet the included picks are ANDed -- "a creature that is also a Rat" -- and
     across facets too. That is what the old page did, and it is what makes the count fall
     predictably as you tick. Exclusions are always ANDed and always absolute: a card
     carrying an excluded term is out, whatever else it carries and whichever mode is on.
     A facet with nothing picked is not a filter. */
  function matches(card, selection, options) {
    const any = Boolean(options && options.any);
    for (const facet of FACETS) {
      const picked = (selection && selection[facet.key]) || [];
      if (!picked.length) continue;
      const have = facet.from(card) || [];
      const {yes, no} = split(picked);
      if (no.some((v) => have.includes(v))) return false;
      if (!yes.length) continue;
      /* Colour keeps its own rule in either mode: "legal in a deck of these colours" is
         not a list of alternatives, it is one question about the whole identity. */
      const ok = facet.match ? facet.match(have, yes)
        : any ? yes.some((v) => have.includes(v))
        : yes.every((v) => have.includes(v));
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
     one at a time rather than only offering Clear all. `exclude` says which way the pick
     points; `value` is the term either way, so a chip reads the same in both states. */
  function chips(selection) {
    const out = [];
    for (const facet of FACETS) {
      for (const picked of (selection && selection[facet.key]) || []) {
        out.push({key: facet.key, label: facet.label, value: bare(picked), exclude: isExclude(picked)});
      }
    }
    return out;
  }

  /* The cycle: not picked -> include -> exclude -> not picked. */
  function toggle(selection, key, value) {
    const next = {...(selection || {})};
    const picked = (next[key] || []).filter((v) => bare(v) !== value);
    const was = (next[key] || []).find((v) => bare(v) === value);
    if (was === undefined) picked.push(value);
    else if (!isExclude(was)) picked.push(NOT + value);
    if (picked.length) next[key] = picked; else delete next[key];
    return next;
  }

  /* Which way a term currently points, for a control that has to draw three states. */
  function stateOf(selection, key, value) {
    const was = ((selection && selection[key]) || []).find((v) => bare(v) === value);
    return was === undefined ? "off" : isExclude(was) ? "exclude" : "include";
  }

  /* A checkbox is two-state and cannot express the third. Ticking one means include and
     clearing it means gone, whichever state the term was in. */
  function set(selection, key, value, state) {
    const next = {...(selection || {})};
    const picked = (next[key] || []).filter((v) => bare(v) !== value);
    if (state === "include") picked.push(value);
    if (state === "exclude") picked.push(NOT + value);
    if (picked.length) next[key] = picked; else delete next[key];
    return next;
  }

  return {FACETS, CARD_TYPES, NOT, available, values, apply, matches, decorate, mineFrom, ownedNames, count, chips, toggle, stateOf, set};
});
