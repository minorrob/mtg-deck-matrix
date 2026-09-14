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
 *   they are supplied here from the live library and joined on the ORACLE ID, which a
 *   graph row's id and a library card's reference both carry; the name is the fallback
 *   for a card saved before it had one. The join is written once, below.
 *
 * The card facets are indexed once per card list as posting lists (term -> the cards that
 * carry it), so a filter is set arithmetic and a count under the filters costs what the
 * filters leave, not the whole format. The Trace reads the same index for its adjacency.
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
  const LANDS_ONLY = "lands only";
  const ENTRY = {"enters-untapped": "untapped", "enters-tapped": "tapped", "enters-tapped-unless": "tapped unless"};
  const isLand = (c) => c.isLand === true || /\bLand\b/.test(String(c.type || ""));
  /* THE MANA READING. Rocks, dorks, lands and ramp spells are how a mana base is built, and the
     Collection asks the same question of its rows, so the reading lives here and both use it.
     It takes a graph row (type, isLand) or a catalog card (typeLine): produces and roles are the
     classifier's on either. A land is a land whatever else it does; a nonland that taps for
     mana is a dork when it is a creature and a rock when it is an artifact; a ramp spell is
     ramp by role that makes no mana itself (Cultivate, Rampant Growth). */
  function manaKinds(c) {
    const type = String(c.type || c.typeLine || ""), land = c.isLand === true || /\bLand\b/.test(type);
    const produces = (c.produces || []).includes("mana"), ramp = (c.roles || []).includes("ramp");
    const out = [];
    if (land) { out.push("Land"); if (/\bBasic\b/.test(type)) out.push("Basic land"); return out; }
    if (produces) out.push(/Creature/.test(type) ? "Mana dork" : /Artifact/.test(type) ? "Mana rock" : "Mana source");
    else if (ramp) out.push("Ramp spell");
    return out;
  }
  const anyOf = (have, picked) => picked.some((v) => have.includes(v));
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
    /* MANA VALUE as a facet: "costs under three" is a filter, not a search. Seven and up is
       one bucket. A card has one mana value, so picks within this facet are alternatives
       whatever the all/any rule says -- "two or three" cannot mean both at once. */
    {key: "mv", label: "Mana value", from: (c) => (c.mv === null || c.mv === undefined || !Number.isFinite(Number(c.mv)) ? [] : [Number(c.mv) >= 7 ? "7+" : String(Number(c.mv))]), match: anyOf},
    {key: "manaKind", label: "Mana", from: (c) => manaKinds(c), match: anyOf},
    /* LANDS ARE A MODE, NOT A NODE. A mana base is chosen by colour and by how a land
       enters, not by what it is joined to, so lands stay off the graph and "Lands only"
       turns Discover into a sortable list of them. "Enters" is the entry reading the
       classifier files on every land (see card-classify.js landEntry), offered here as
       its own facet rather than buried among five hundred mechanics. */
    {key: "lands", label: "Lands", from: (c) => (isLand(c) ? [LANDS_ONLY] : [])},
    {key: "enters", label: "Enters", from: (c) => (c.mechanics || []).filter((m) => ENTRY[m]).map((m) => ENTRY[m])},
    {key: "mechanics", label: "Mechanic", from: (c) => (c.mechanics || []).filter((m) => !ENTRY[m])},
    {key: "tribes", label: "Tribe", from: (c) => c.tribes || []},
    /* The tribe a card is a payoff FOR -- "Goblins you control get +1/+1". Tribe says
       what a card is; this says what it is for, and the pair is how a tribal deck is
       walked: pick a tribe here, read the lords; pick it there, read the bodies. */
    {key: "wants", label: "Wants tribe", from: (c) => c.wants || []},
    {key: "makes", label: "Makes tribe", from: (c) => c.makes || []},

    /* The stat a card pays off, and the stat a body supplies. Offers is the only facet
       computed from printed numbers rather than words, which is why a wall deck could not
       be filtered for before it existed. */
    {key: "wantsStat", label: "Pays off stat", from: (c) => c.wantsStat || []},
    {key: "offersStat", label: "Offers stat", from: (c) => c.offersStat || []},

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

  /* THE JOIN KEY IS THE ORACLE ID; THE NAME IS THE LENS. A graph row's id is its Scryfall
     oracle id and a library card carries the same id in its reference (schema 3), so the two
     meet on it exactly whatever the printed name: a Secret Lair "SpongeBob SquarePants" and
     Jodah, the Unifier are one card here. A library card saved before it had an oracle id (typed
     in offline, or from a link that did not carry one) still joins by name, which is what the
     join was before this. Written once; the two personal facets, the gold band and the loop
     list all read it. */
  const ORACLE = "o:", NAME = "n:";
  /* The keys a LIBRARY card is filed under. */
  const keysOf = (c) => {
    const out = [];
    if (c && c.oracleId) out.push(ORACLE + c.oracleId);
    if (c && c.name) out.push(NAME + c.name);
    return out;
  };
  /* The lookup for a graph row (its id is the oracle id), a catalog card (oracleId) or a bare
     name. The oracle id wins where both sides have one. */
  function lookup(map, c) {
    if (!c) return undefined;
    if (typeof c === "string") return map.get(NAME + c);
    return (c.oracleId ? map.get(ORACLE + c.oracleId) : undefined)
      || (typeof c.id === "string" ? map.get(ORACLE + c.id) : undefined)
      || (c.name ? map.get(NAME + c.name) : undefined);
  }

  /* WHAT YOU HAVE. Quantities are summed across lots because a card can sit in several -- two
     owned copies in different boxes are still "in hand". Nothing here reads the stale
     own/ordered/bench fields in graph.json. Two library cards that share an oracle id share one
     row. */
  function mineFrom(state) {
    const mine = new Map();
    if (!state) return mine;
    const rowFor = (id) => {
      const keys = keysOf(state.cards && state.cards[id]);
      if (!keys.length) return null;
      let row = null;
      for (const k of keys) if (mine.has(k)) { row = mine.get(k); break; }
      if (!row) row = {owned: new Set(), decks: new Set()};
      for (const k of keys) mine.set(k, row);
      return row;
    };
    for (const lot of state.lots || []) {
      const row = rowFor(lot.cardId);
      if (!row) continue;
      if (lot.source === "owned") row.owned.add(lot.location && lot.location.kind === "deck" ? "in physical deck" : "on the bench");
      if (lot.source === "ordered") row.owned.add("on order");
    }
    for (const deck of state.decks || []) {
      if (deck.archived) continue;
      for (const slot of deck.slots || []) {
        const row = rowFor(slot.cardId);
        if (row) row.decks.add(deck.name);
      }
    }
    return mine;
  }

  /* The ownership join on its own, for callers that want the answer rather than the filter:
     the graph paints an owned card's gold band from it and the loop list greys the cards you
     lack. Same rule as the Ownership facet -- a lot whose source is "owned". `has` takes a
     graph row, a catalog card or a name. */
  function owns(state) {
    const set = new Map();
    for (const lot of (state && state.lots) || []) {
      if (lot.source !== "owned") continue;
      for (const k of keysOf(state.cards && state.cards[lot.cardId])) set.set(k, true);
    }
    return {size: set.size, has: (c) => lookup(set, c) === true};
  }
  /* The same answer by name only: the lens for a caller that holds nothing but a name. */
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
  const mineOf = (mine, c) => {
    const row = lookup(mine, c);
    return {owned: row ? [...row.owned] : ["not owned"], decks: row ? [...row.decks] : []};
  };
  /* The decorator for a library: the card itself when the library holds nothing. The probe is
     the cheap form for the filters -- the personal facts alone, no copy of the card -- since a
     personal facet reads nothing else. */
  const decorator = (mine) => (mine.size ? (c) => ({...c, __mine: mineOf(mine, c)}) : (c) => c);
  const prober = (mine) => (mine.size ? (c) => ({__mine: mineOf(mine, c)}) : () => ({}));
  function decorate(cards, state) {
    return (cards || []).map(decorator(mineFrom(state)));
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
     shuffle under the reader's cursor as they tick boxes. The card facets are read off the
     posting lists; the two personal ones are counted over the library's join. */
  function values(cards, state) {
    const list = cards || [], ix = index(list), probe = prober(mineFrom(state));
    const out = {};
    for (const facet of available(state)) {
      const counts = new Map();
      if (facet.mine) {
        for (const card of list) for (const v of facet.from(probe(card)) || []) {
          if (v === undefined || v === null || v === "") continue;
          counts.set(v, (counts.get(v) || 0) + 1);
        }
      } else {
        for (const [v, ids] of ix.posting[facet.key]) counts.set(v, ids.length);
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

  /* POSTING LISTS. Every card facet is indexed once per card list -- term -> the positions
     of the cards that carry it -- so a filter is set arithmetic over those lists and a count
     under the filters is proportional to what the filters leave, not to the 31,830 cards of
     the format. The index is keyed on the list and checked against its contents, because
     Discover appends the library's visitors to its copy after the first use; a changed list is
     indexed again on the next call. The two personal facets stay out of it: they change with
     the library, and they are applied to the survivors, which is the cheap end. */
  const INDEXES = new WeakMap();
  function index(cards) {
    const list = cards || [];
    const had = INDEXES.get(list);
    if (had && had.n === list.length && had.same(list)) return had;
    const n = list.length, terms = {}, posting = {};
    for (const facet of FACETS) {
      if (facet.mine) continue;
      const t = new Array(n), p = new Map();
      for (let i = 0; i < n; i++) {
        const vs = [];
        for (const v of facet.from(list[i]) || []) if (!(v === undefined || v === null || v === "")) vs.push(v);
        t[i] = vs;
        for (const v of vs) { let s = p.get(v); if (!s) { s = []; p.set(v, s); } s.push(i); }
      }
      terms[facet.key] = t; posting[facet.key] = p;
    }
    const snapshot = list.slice(), at = new Map(snapshot.map((c, i) => [c, i]));
    const ix = {n, terms, posting, at, same: (l) => { for (let i = 0; i < n; i++) if (l[i] !== snapshot[i]) return false; return true; }};
    INDEXES.set(list, ix);
    return ix;
  }

  /* The cards the picks leave, as a mask over the list, by the rules matches() states:
     exclusions first and absolute; then each facet's includes -- an intersection in "all", a
     union in "any" or where the facet says its picks are alternatives, and colour's own rule
     (every letter of the identity among the picks, colourless always in, unless C alone is
     picked, which is the colourless cards and nothing else). The personal facets are matched
     card by card over what is left. tests/crankmagic-facets.mjs holds this to matches(). */
  function survivors(list, ix, selection, state, options) {
    const any = Boolean(options && options.any), n = ix.n;
    const mask = new Uint8Array(n).fill(1);
    const keep = (ids) => { const on = new Uint8Array(n); for (const i of ids) on[i] = 1; for (let i = 0; i < n; i++) if (!on[i]) mask[i] = 0; };
    const personal = {};
    let hasPersonal = false;
    for (const facet of FACETS) {
      const picked = (selection && selection[facet.key]) || [];
      if (!picked.length) continue;
      if (facet.mine) { personal[facet.key] = picked; hasPersonal = true; continue; }
      const p = ix.posting[facet.key], {yes, no} = split(picked);
      for (const v of no) for (const i of p.get(v) || []) mask[i] = 0;
      if (!yes.length) continue;
      if (facet.key === "colors") {
        const lone = yes.length === 1 && yes[0] === "C", on = new Uint8Array(n);
        if (!lone) { on.fill(1); for (const [v, ids] of p) if (!yes.includes(v)) for (const i of ids) on[i] = 0; }
        for (const i of p.get("C") || []) if (ix.terms.colors[i].length === 1) on[i] = 1;
        for (let i = 0; i < n; i++) if (!on[i]) mask[i] = 0;
      } else if (any || facet.match === anyOf) {
        const union = [];
        for (const v of yes) for (const i of p.get(v) || []) union.push(i);
        keep(union);
      } else {
        for (const v of yes) keep(p.get(v) || []);
      }
    }
    if (hasPersonal) {
      const probe = prober(mineFrom(state));
      for (let i = 0; i < n; i++) if (mask[i] && !matches(probe(list[i]), personal, options)) mask[i] = 0;
    }
    return mask;
  }

  function apply(cards, selection, state, options) {
    const list = cards || [];
    if (!selection || !Object.values(selection).some((v) => v && v.length)) return decorate(list, state);
    const ix = index(list), mask = survivors(list, ix, selection, state, options), dec = decorator(mineFrom(state));
    const out = [];
    for (let i = 0; i < ix.n; i++) if (mask[i]) out.push(dec(list[i]));
    return out;
  }

  /* THE COUNT THAT ANSWERS "AND IF I PICK THIS?". values() counts the whole set so the
     options never shuffle under the cursor; this counts ONE facet's values over the cards the
     current picks leave, so the number beside "B" is the black cards you can still reach, not
     every black card in the format. Within the facet the rule follows the mode: picks are
     ANDed in "all", so the count is over the filtered set as it stands; in "any" a second pick
     is an alternative, so the facet's own includes are lifted first (its excludes stay: an
     excluded term is out whatever else is picked). A pure function, so the Node test can hold
     it to the same answer the dialog shows. */
  function narrowedCounts(cards, selection, state, key, options) {
    const facet = FACETS.find((f) => f.key === key);
    if (!facet) return new Map();
    let sel = selection || {};
    if (options && options.any && sel[key]) {
      const kept = sel[key].filter(isExclude);
      sel = {...sel};
      if (kept.length) sel[key] = kept; else delete sel[key];
    }
    const list = cards || [], ix = index(list), mask = survivors(list, ix, sel, state, options);
    const counts = new Map();
    const bump = (v) => { if (!(v === undefined || v === null || v === "")) counts.set(v, (counts.get(v) || 0) + 1); };
    if (facet.mine) {
      const probe = prober(mineFrom(state));
      for (let i = 0; i < ix.n; i++) if (mask[i]) for (const v of facet.from(probe(list[i])) || []) bump(v);
    } else {
      const t = ix.terms[key];
      for (let i = 0; i < ix.n; i++) if (mask[i]) for (const v of t[i]) bump(v);
    }
    return counts;
  }

  /* The index for other readers -- the Trace walks a term's cards from here rather than
     scanning. `cardsWith` is a posting list as cards, `termsOf` a card's terms in one facet. */
  function postings(cards) {
    const list = cards || [], ix = index(list);
    return {
      size: ix.n,
      values: (key) => (ix.posting[key] ? [...ix.posting[key].keys()] : []),
      cardsWith: (key, value) => ((ix.posting[key] && ix.posting[key].get(value)) || []).map((i) => list[i]),
      termsOf: (key, card) => { const i = ix.at.get(card); return i === undefined || !ix.terms[key] ? [] : ix.terms[key][i].slice(); }
    };
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

  return {FACETS, CARD_TYPES, NOT, available, values, narrowedCounts, apply, matches, decorate, mineFrom, owns, ownedNames, postings, count, chips, toggle, stateOf, set, manaKinds};
});
