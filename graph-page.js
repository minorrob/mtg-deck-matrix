/* The control plane over data/graph.json.
 *
 * One filter state drives both views. The list renders every match; the graph
 * renders ONE card's neighborhood, because 1,500 nodes on a canvas is a hairball
 * that tells you nothing. Picking a card in the list is what chooses the center.
 */
(function () {
  "use strict";

  var DATA = null, LENSES = [], EGO = null, CY = null;

  /* Lenses you have read and decided about. Kept per lens id with the reason,
     because "I dismissed this" and "I dismissed this BECAUSE I disagree with the
     simulation" are different things to come back to in a month. A dismissal is
     never a deletion: the card stays, folded, with a way back. */
  var DISMISS_KEY = "mtg-graph-dismissed.v1";
  var dismissed = (function () {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}") || {}; }
    catch (err) { return {}; }
  })();
  /* WHICH FINDINGS YOU WANT TO READ RIGHT NOW.
   *
   * A Copilot with twenty findings across six decks is a reading list. Somebody packing a
   * bag for a game tonight has one deck in their hands and wants the three findings about
   * it; somebody with an hour and a budget wants the opportunities and none of the
   * warnings; somebody who trusts the simulator over the rules engine wants to read its
   * findings first. Three questions, three axes, one rule.
   *
   * THE RULE IS THAT NOTHING IS HIDDEN. A finding about another deck is not wrong, it is
   * just not tonight's problem, so it folds into a drawer with its count still on the
   * label rather than disappearing. That is what makes this safe to leave switched on: a
   * filter that hides evidence is a filter you have to remember you set.
   *
   * These are lenses on the LENSES, never on the cards. Clicking one changes what the
   * Copilot shows and nothing about the card list underneath it.
   */
  var CP_KEY = "mtg-graph-copilot-filters.v1";
  var CP_AXES = [
    {key: "deck",   label: "Playing tonight"},
    {key: "kind",   label: "Kind"},
    {key: "source", label: "From"}
  ];
  var cpFilter = (function () {
    var empty = {deck: [], kind: [], source: []};
    try {
      var raw = JSON.parse(localStorage.getItem(CP_KEY) || "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        CP_AXES.forEach(function (a) { if (Array.isArray(raw[a.key])) empty[a.key] = raw[a.key]; });
        return empty;
      }
      /* One deck used to be remembered on its own, under its own key. Somebody who set it
         last week should find it still set, on the axis it became. */
      var legacy = localStorage.getItem("mtg-graph-tonight.v1");
      if (legacy) empty.deck = [legacy];
    } catch (err) { /* storage off */ }
    return empty;
  })();
  function saveCpFilter() {
    try {
      var any = CP_AXES.some(function (a) { return cpFilter[a.key].length; });
      if (any) localStorage.setItem(CP_KEY, JSON.stringify(cpFilter));
      else localStorage.removeItem(CP_KEY);
      localStorage.removeItem("mtg-graph-tonight.v1");
    } catch (err) { /* storage off */ }
  }
  function toggleCpFilter(axis, value) {
    var list = cpFilter[axis] || (cpFilter[axis] = []);
    var at = list.indexOf(value);
    if (at >= 0) list.splice(at, 1); else list.push(value);
    saveCpFilter();
  }
  function clearCpFilter() {
    CP_AXES.forEach(function (a) { cpFilter[a.key] = []; });
    saveCpFilter();
  }
  /* What a finding answers on each axis. A lens naming no deck belongs to all of them,
     because "50 cards you own are in no deck" is true tonight too -- so an empty deck
     list passes any deck selection rather than failing every one. */
  function cpValues(lens, axis) {
    if (axis === "deck") return decksOf(lens);
    if (axis === "kind") return [lens.kind];
    return [lens.source === "simulation" ? "simulation" : "rules"];
  }
  function cpPasses(lens, skipAxis) {
    return CP_AXES.every(function (a) {
      if (a.key === skipAxis) return true;
      var picked = cpFilter[a.key] || [];
      if (!picked.length) return true;
      var have = cpValues(lens, a.key);
      if (a.key === "deck" && !have.length) return true;
      return have.some(function (v) { return picked.indexOf(v) >= 0; });
    });
  }

  /* Which decks a finding is about.
     A simulator lens names its deck outright. A graph lens does not carry the
     field, but it does put the deck's name at the front of its title -- "Shadrix
     is 53 cards short", "Atraxa: 1 graveyard payoff" -- which is how it was
     generated and is stable enough to read back. A lens naming no deck belongs to
     all of them, because "50 cards you own are in no deck" is true tonight too. */
  function decksOf(lens) {
    var names = ((DATA && DATA.decks) || []).map(function (d) { return d.name; });
    var found = names.filter(function (n) {
      return (lens.filter && lens.filter.deck === n) ||
        String(lens.title || "").indexOf(n) === 0 ||
        String(lens.title || "").indexOf(n + ":") >= 0;
    });
    return found;
  }

  function setDismissed(id, reason) {
    if (reason === null) delete dismissed[id];
    else dismissed[id] = {reason: reason, at: new Date().toISOString()};
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed)); } catch (err) { /* storage off */ }
  }
  var state = {q: "", mvMax: 20, view: "list", f: {}, showAll: {}, clickFocuses: false, lens: null,
    listShown: 0};
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); };

  // Which card fields a facet reads. Array-valued fields match if ANY selected
  // value is present; scalars match exactly. Color is the exception -- a card
  // passes only if its identity is a SUBSET of what you ticked, because that is
  // what "legal in these colors" means, not "mentions this color".
  var FACETS = [
    {key: "roles",     label: "Role",       from: function (c) { return c.roles; }},
    // Color identity, with the semantics a deckbuilder wants: "legal in a deck of
    // these colors". A colorless card is legal in every deck, so it passes any
    // selection -- ticking C on its own is the way to isolate colorless.
    {key: "colors", label: "Color", from: function (c) { return c.ci ? c.ci.split("") : ["C"]; },
     match: function (have, picked) {
       var colorless = have.length === 1 && have[0] === "C";
       if (colorless) return true;
       if (picked.length === 1 && picked[0] === "C") return false;
       return have.every(function (v) { return picked.indexOf(v) >= 0; });
     }},
    /* `mine: true` -- these two describe the reader, not Magic, and they are dropped
       whole on a browser that has saved nothing. Ownership would otherwise offer one
       option, "not owned", against all 7,764 cards, which is a control that filters
       nothing; In a deck would offer none at all. See stripMine below. */
    {key: "owned",     label: "Ownership",  mine: true, from: function (c) {
      var out = []; if (c.own > 0) out.push("in hand"); if (c.ordered > 0) out.push("on order");
      if (c.bench > 0) out.push("bench"); if (!c.own && !c.ordered) out.push("not owned"); return out; }},
    {key: "decks",     label: "In a deck",  mine: true, from: function (c) { return (c.decks || []).map(function (d) { return d.deck; }); }},
    {key: "type",      label: "Card type",  from: function (c) {
      return ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle"]
        .filter(function (t) { return (c.type || "").indexOf(t) >= 0; }); }},
    {key: "triggers",  label: "Fires on",   from: function (c) { return c.triggers; }},
    {key: "causes",    label: "Causes",     from: function (c) { return c.causes; }},
    {key: "produces",  label: "Produces",   from: function (c) { return c.produces; }},
    {key: "requires",  label: "Requires",   from: function (c) { return c.requires; }},
    {key: "mechanics", label: "Mechanic",   from: function (c) { return c.mechanics; }},
    {key: "tribes",    label: "Tribe",      from: function (c) { return c.tribes; }},
    {key: "rarity",    label: "Rarity",     from: function (c) { return [c.rarity]; }}
  ];

  function indexCard(c) {
    var v = {};
    FACETS.forEach(function (f) { v[f.key] = f.from(c) || []; });
    c._f = v;
    c._search = ((c.name || "") + " " + (c.type || "")).toLowerCase();
    return c;
  }
  function indexCards() { DATA.cards.forEach(indexCard); }

  function matches(card, skipKey) {
    if (state.lens && !state.lens._set[card.id]) return false;
    if (state.q && card._search.indexOf(state.q.toLowerCase()) < 0) return false;
    if (Number(card.mv || 0) > state.mvMax) return false;
    for (var i = 0; i < FACETS.length; i++) {
      var f = FACETS[i];
      if (f.key === skipKey) continue;               // for counting a facet's own options
      var picked = state.f[f.key];
      if (!picked || !picked.length) continue;
      var have = card._f[f.key];
      if (f.match) { if (!f.match(have, picked)) return false; }
      else if (!have.some(function (v) { return picked.indexOf(v) >= 0; })) return false;
    }
    return true;
  }

  function visible() { return DATA.cards.filter(function (c) { return matches(c); }); }

  function optionsFor(facet) {
    // Count against everything the OTHER facets allow, so a count never reads zero
    // for something you can still pick -- the standard faceted-search behavior.
    var pool = DATA.cards.filter(function (c) { return matches(c, facet.key); });
    var counts = {};
    pool.forEach(function (c) { c._f[facet.key].forEach(function (v) { if (v) counts[v] = (counts[v] || 0) + 1; }); });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || String(a).localeCompare(b); })
      .map(function (v) { return {value: v, n: counts[v]}; });
  }

  // Role, Color and Ownership are the three you reach for first, so they start
  // open. A pane where every group is shut costs two clicks to reach any filter.
  var OPEN_BY_DEFAULT = {roles: true, colors: true, owned: true};

  function renderFacets() {
    var host = $("facets"), open = {};
    host.querySelectorAll("details.gp-facet").forEach(function (d) { open[d.dataset.key] = d.open; });
    host.innerHTML = FACETS.filter(function (f) { return !(f.mine && MINE_STRIPPED); }).map(function (f) {
      var all = optionsFor(f), picked = state.f[f.key] || [];
      if (!all.length) return "";
      var cap = state.showAll[f.key] ? all.length : 24;
      var opts = all.slice(0, cap).concat(all.slice(cap).filter(function (o) { return picked.indexOf(o.value) >= 0; }));
      var hidden = all.length - opts.length;
      var isOpen = open[f.key] !== undefined ? open[f.key] : (picked.length > 0 || !!OPEN_BY_DEFAULT[f.key]);
      return '<details class="gp-facet" data-key="' + f.key + '"' + (isOpen ? " open" : "") + '>' +
        "<summary>" + esc(f.label) + (picked.length ? ' <span class="gp-on">' + picked.length + "</span>" : "") + "</summary>" +
        '<div class="gp-opts">' + opts.map(function (o) {
          var on = picked.indexOf(o.value) >= 0;
          return '<label class="gp-opt' + (on ? " is-on" : "") + '">' +
            '<input type="checkbox" data-facet="' + f.key + '" value="' + esc(o.value) + '"' + (on ? " checked" : "") + ">" +
            esc(o.value) + ' <span class="n">' + o.n + "</span></label>";
        }).join("") +
        (hidden > 0 ? '<button class="gp-opt gp-more" data-more="' + f.key + '" type="button">+' + hidden + " more</button>" : "") +
        "</div></details>";
    }).join("") +
    '<details class="gp-facet" data-key="mv" open><summary>Mana value &le; <span class="gp-on">' + state.mvMax + '</span></summary>' +
    '<div class="gp-range"><input type="range" id="mv" min="0" max="20" step="1" aria-label="Highest mana value to include" value="' + state.mvMax + '"></div></details>';
  }

  function cardTile(c) {
    var owned = c.own > 0 ? "in hand" : (c.ordered > 0 ? "on order" : null);
    return '<button class="gp-card' + (EGO === c.id ? " is-ego" : "") + '" data-id="' + c.id + '" type="button">' +
      (c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy">' : '<span class="gp-card-noart"></span>') +
      "<span><b>" + esc(c.name) + "</b>" +
      '<span class="meta">' + (c.mv || 0) + " mv &middot; " + esc(c.ci || "C") +
      (c.price ? " &middot; $" + Number(c.price).toFixed(2) : " &middot; no price") + "</span>" +
      '<span class="gp-tags">' +
        (owned ? '<span class="gp-tag own">' + owned + "</span>" : "") +
        /* Whether a card can sit in a command zone changes what every other tag on it
           means, so it is said first and everywhere -- here, in the popup, and in the
           focus suggestions. The flag comes from Scryfall's own is:commander rather
           than from a type-line guess; see tools/commander-universe.mjs. */
        (c.isCommander ? '<span class="gp-tag cmdr">commander</span>' : "") +
        (c.decks || []).map(function (d) { return '<span class="gp-tag deck">' + esc(d.deck) + "</span>"; }).join("") +
        (c.roles || []).slice(0, 3).map(function (r) { return '<span class="gp-tag">' + esc(r) + "</span>"; }).join("") +
      "</span></span></button>";
  }

  /* ---------------------------------------------------------------------------
   * FOCUS: THE ONE CARD THE GRAPH IS DRAWN AROUND.
   *
   * The graph is ego-centric -- one card in the middle, its reasons around it -- and until
   * now the only way to choose that card was to find it in the list and press Focus inside
   * its popup. That works for the 7,764 cards the corpus was baked with. For a card it was
   * not baked with, which is most of Magic, there was no way in at all: you could not name
   * the card, so you could not ask the question.
   *
   * So: type a name. Cards in the catalog come up as you type. Anything else is looked up
   * on Scryfall, checked for Commander legality, and read by card-classify.js -- the same
   * module graph/ingest/02-build-csv.mjs used to bake the corpus, so a card that arrives
   * this way is connected by exactly the rules its neighbors were connected by. It is
   * marked as a visitor wherever it appears, because two things are true of it that are
   * not true of the rest: nobody owns it, and EDHREC co-play was never computed for it.
   */
  var VISITOR_KEY = "mtg-graph-visitors.v1";
  var VISITOR_CAP = 40;
  var visitors = (function () {
    try { return JSON.parse(localStorage.getItem(VISITOR_KEY) || "[]") || []; }
    catch (err) { return []; }
  })();
  function saveVisitors() {
    try {
      if (visitors.length) localStorage.setItem(VISITOR_KEY, JSON.stringify(visitors));
      else localStorage.removeItem(VISITOR_KEY);
    } catch (err) { /* storage off */ }
  }

  /* A looked-up card in the shape data/graph.json uses, so nothing downstream has to know
     where it came from. Ownership is zero and decks are empty because that is the truth:
     the bake already contains the whole collection, so a card missing from it is a card
     nobody has. */
  function visitorFrom(card) {
    var Classify = window.MtgCardClassify;
    var what = Classify.classify(card);
    return {
      id: card.oracleId || card.scryfallId,
      name: card.name,
      mv: Number(card.cmc) || 0,
      ci: (card.colorIdentity || []).join(""),
      type: card.typeLine || "",
      rarity: card.rarity || "",
      set: card.setName || "",
      price: Number(card.price) || 0,
      priceFoil: Number(card.ceiling) || 0,
      rank: Number(card.edhrecRank) || 0,
      isLand: Boolean(card.isLand),
      isCommander: Boolean(card.canBeCommander),
      image: card.imageLarge || card.image || "",
      buy: card.tcgplayerUrl || "",
      printings: 1,
      cheapestSet: card.setName || "",
      own: 0, ordered: 0, bench: 0, decks: [],
      roles: what.roles, requires: what.requires, causes: what.causes,
      triggers: what.triggers, produces: what.produces,
      mechanics: what.mechanics, tribes: what.tribes,
      visitor: true
    };
  }

  function addVisitor(record) {
    if (!DATA) return null;
    var already = byId(record.id);
    if (already) return already;
    visitors = visitors.filter(function (v) { return v.id !== record.id; });
    visitors.push(record);
    while (visitors.length > VISITOR_CAP) visitors.shift();
    saveVisitors();
    DATA.cards.push(indexCard(record));
    return record;
  }
  function forgetVisitor(id) {
    visitors = visitors.filter(function (v) { return v.id !== id; });
    saveVisitors();
    for (var i = 0; i < DATA.cards.length; i++) {
      if (DATA.cards[i].id === id && DATA.cards[i].visitor) { DATA.cards.splice(i, 1); break; }
    }
    if (EGO === id) EGO = null;
    render();
  }
  function visitorCount() {
    return DATA ? DATA.cards.filter(function (c) { return c.visitor; }).length : 0;
  }

  function focusOn(id) {
    EGO = id;
    state.view = "graph";
    syncViews();
    // A new center has different reasons, so an expanded group from the old one would
    // open something the reader never asked for.
    groupState = {open: {}, only: null};
    render();
    /* On a phone the pane is a full-width block ABOVE the canvas, so leaving it open after
       a pick puts the whole filter list between you and the graph you just asked for. It
       has done its job; it closes, the way any sheet does once you have chosen from it. */
    if (window.matchMedia("(max-width: 860px)").matches) {
      var pane = $("pane"), toggle = $("pane-toggle");
      if (pane && !pane.hidden) {
        pane.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
    }
    var cy = $("cy");
    if (cy && !cy.hidden) cy.scrollIntoView({behavior: "smooth", block: "nearest"});
  }

  /* WHAT COMES UP AS YOU TYPE, AND IN WHAT ORDER.
   *
   * An exact name first, then names that START with what you typed -- that is what somebody
   * halfway through spelling a card means -- then names that merely contain it.
   *
   * Inside each group the order is by how much Magic plays the card, not alphabetical.
   * Alphabetical put "Krenko's Command" above "Krenko, Mob Boss", because an apostrophe
   * sorts before a comma; nobody typing "Krenko" means the first one. EDHREC's rank is
   * already on every card and is the closest thing here to "the card they meant". Cards
   * with no rank sort last rather than first, which is what a 0 would otherwise do. */
  /* ------------------------------------------------- the whole legal universe ----
   *
   * data/graph.json is the RICH corpus: 7,764 cards carrying rules-derived edges, EDHREC
   * co-play, prices and ownership. It is not everything: 31,830 cards are Commander-legal,
   * and at ~920 bytes a card the rest of them in that shape is 29 MB, which is not a page
   * anybody opens twice on a phone at a table.
   *
   * So the rest ship as a flat registry -- name, color identity, rarity, mana value,
   * primary type, EDHREC rank, and whether the card can be a commander -- 1.6 MB, fetched
   * the first time somebody types into the focus box and never on a page load. Typing a
   * card that is not in the corpus finds it here, says what it is, and hands it to the
   * Scryfall lookup that brings it in as a visitor.
   *
   * The point of it is that "every Commander-legal card" stops being a claim the page
   * makes and becomes a list it can show you.
   */
  var UNIVERSE = null;         // [{name, ci, rarity, mv, type, rank, commander}]
  var universeState = "idle";  // idle | loading | ready | failed
  var COMMANDERS = null;       // name -> true, for flagging cards already in the corpus

  function loadUniverse() {
    if (universeState !== "idle") return;
    universeState = "loading";
    fetch("data/commander-universe.json?v=1", {cache: "default"})
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (file) {
        UNIVERSE = (file.cards || []).map(function (row) {
          return {name: row[0], ci: row[1], rarity: row[2], mv: row[3],
                  type: row[4], rank: row[5], commander: Boolean(row[6])};
        });
        COMMANDERS = Object.create(null);
        UNIVERSE.forEach(function (c) { if (c.commander) COMMANDERS[c.name] = true; });
        universeState = "ready";
        // Somebody typed while it was arriving; answer the question they already asked.
        var input = $("focus-q");
        if (input && input.value.trim().length >= 2 && document.activeElement === input) {
          openFocusMenu(input.value.trim());
        }
        renderFocusKept();
      })
      .catch(function () { universeState = "failed"; });
  }

  var RARITY_WORD = {c: "common", u: "uncommon", r: "rare", m: "mythic", s: "special", b: "bonus"};

  function focusMatches(query) {
    if (!DATA || query.length < 2) return [];
    var q = query.toLowerCase();
    var exact = [], starts = [], has = [];
    var seen = Object.create(null);
    DATA.cards.forEach(function (c) {
      var n = (c.name || "").toLowerCase();
      seen[n] = true;
      if (n === q) { exact.push(c); return; }
      var at = n.indexOf(q);
      if (at === 0) starts.push(c); else if (at > 0) has.push(c);
    });
    var played = function (c) { return Number(c.rank) > 0 ? Number(c.rank) : Infinity; };
    var by = function (a, b) {
      return played(a) - played(b) || (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0));
    };
    var here = exact.sort(by).concat(starts.sort(by), has.sort(by));

    /* Then the rest of the universe, after everything the corpus already holds -- a card
       with edges and a price is a better answer than a name, so it goes first. These are
       marked `outside` and carry only what the registry knows. */
    var away = [];
    if (UNIVERSE) {
      UNIVERSE.forEach(function (row) {
        var n = row.name.toLowerCase();
        if (seen[n] || n.indexOf(q) < 0) return;
        away.push({
          id: "universe:" + row.name, name: row.name, outside: true,
          type: row.type, rarity: RARITY_WORD[row.rarity] || "", mv: row.mv,
          ci: row.ci, rank: row.rank, isCommander: row.commander
        });
      });
      away.sort(function (a, b) {
        var an = a.name.toLowerCase(), bn = b.name.toLowerCase();
        return (an.indexOf(q) - bn.indexOf(q))
          || (played(a) - played(b))
          || (an < bn ? -1 : (an > bn ? 1 : 0));
      });
    }
    return here.concat(away).slice(0, 8);
  }

  var focusState = {open: false, options: [], active: -1, busy: false};

  function renderFocusMenu() {
    var menu = $("focus-menu"), input = $("focus-q");
    if (!menu || !input) return;
    if (!focusState.open || !focusState.options.length) {
      menu.hidden = true; menu.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      return;
    }
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    menu.innerHTML = focusState.options.map(function (o, i) {
      var on = i === focusState.active;
      if (o.kind === "lookup") {
        return '<button type="button" role="option" tabindex="-1" id="focus-opt-' + i + '" aria-selected="' + on + '"' +
          ' class="gp-focus-opt is-lookup' + (on ? " is-active" : "") + '" data-focus-lookup="' + esc(o.query) + '">' +
          "Look up <b>" + esc(o.query) + "</b> on Scryfall" +
          '<span class="gp-focus-sub">anything Commander-legal, in or out of the catalog</span></button>';
      }
      var c = o.card;
      var flags = (c.isCommander ? ' <span class="gp-focus-flag is-cmdr">can be a commander</span>' : "")
        + (c.visitor ? ' <span class="gp-focus-flag">looked up</span>' : "")
        + (c.outside ? ' <span class="gp-focus-flag is-away">not in the corpus &mdash; will be looked up</span>' : "");
      /* A card the corpus does not hold is picked by NAME rather than by id: there is no
         node to focus yet, so choosing it runs the Scryfall lookup that makes one. */
      var attr = c.outside
        ? ' data-focus-lookup="' + esc(c.name) + '"'
        : ' data-focus-pick="' + esc(c.id) + '"';
      /* tabindex -1 on both: this is a combobox, so the arrow keys move through the
         options while focus and the tab order stay on the input. Leaving them tabbable
         let Tab walk into a menu that aria-activedescendant had just told a screen reader
         nobody had moved into. */
      return '<button type="button" role="option" tabindex="-1" id="focus-opt-' + i + '" aria-selected="' + on + '"' +
        ' class="gp-focus-opt' + (on ? " is-active" : "") + (c.outside ? " is-away" : "") + '"' + attr + ">" +
        "<b>" + esc(c.name) + "</b>" +
        '<span class="gp-focus-sub">' + esc(c.type || "") + flags + "</span></button>";
    }).join("");
    if (focusState.active >= 0) input.setAttribute("aria-activedescendant", "focus-opt-" + focusState.active);
    else input.removeAttribute("aria-activedescendant");
  }

  function openFocusMenu(query) {
    loadUniverse();          // first keystroke, not page load
    var found = focusMatches(query);
    focusState.options = found.map(function (c) { return {kind: "card", card: c}; });
    /* The way out is always on the list, not behind a second guess. A name that matches
       nothing in the catalog is the obvious case; a name that matches four cards none of
       which is the one you meant is the case that used to be a dead end. */
    if (query.length >= 3) focusState.options.push({kind: "lookup", query: query});
    focusState.open = focusState.options.length > 0;
    focusState.active = -1;
    renderFocusMenu();
  }
  function closeFocusMenu() {
    focusState.open = false; focusState.options = []; focusState.active = -1;
    renderFocusMenu();
  }
  /* Tabbing out of the box shuts the menu, the way any menu behaves. Deferred one turn
     because focusout fires BEFORE focusin lands, so the new element is not the active one
     yet -- checked a tick later, a click on an option inside the box does not close it out
     from under itself. */
  document.addEventListener("focusout", function (e) {
    if (!e.target.closest || !e.target.closest(".gp-focus")) return;
    setTimeout(function () {
      var here = document.activeElement;
      if (focusState.open && (!here || !here.closest || !here.closest(".gp-focus"))) closeFocusMenu();
    }, 0);
  });
  function focusSay(text, tone) {
    var msg = $("focus-msg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.className = "gp-focus-msg" + (tone ? " is-" + tone : "");
  }

  /* The looked-up cards you are keeping, with a way to drop each one. Without this a
     visitor is a card that appeared in your catalog from nowhere and cannot leave. */
  function renderFocusKept() {
    var host = $("focus-kept");
    if (!host || !DATA) return;
    var live = DATA.cards.filter(function (c) { return c.visitor; });
    if (!live.length) { host.hidden = true; host.innerHTML = ""; return; }
    host.hidden = false;
    host.innerHTML = '<span class="gp-focus-kept-lab">Looked up</span>' + live.map(function (c) {
      return '<span class="gp-focus-chip"><button type="button" data-focus-pick="' + esc(c.id) + '">' +
        esc(c.name) + '</button><button type="button" class="gp-focus-drop" data-focus-forget="' + esc(c.id) +
        '" aria-label="Forget ' + esc(c.name) + '">&times;</button></span>';
    }).join("");
  }

  function lookUpCard(query) {
    var Scry = window.MtgScryfall, Classify = window.MtgCardClassify;
    if (!Scry || !Classify) {
      focusSay("The lookup needs two scripts this page could not load. Reload and try again.", "bad");
      return;
    }
    if (focusState.busy) return;
    /* data/graph.json is seven megabytes, so on a slow connection there is a real window
       where the box is on screen and the catalog is not here yet. Without this the lookup
       reads a card list that does not exist and dies on a TypeError, which looks to the
       reader like the card was refused. */
    if (!DATA) {
      focusSay("The catalog is still loading. Try again in a moment.", "bad");
      return;
    }
    focusState.busy = true;
    closeFocusMenu();
    focusSay("Looking up \u201c" + query + "\u201d\u2026");
    var client = Scry.createClient({});
    /* Fuzzy, not exact: somebody typing a card by hand gets the apostrophe, the comma
       after the first name, or the accent wrong, and an exact lookup answers 404 to all
       three. Scryfall's own fuzzy match is what the rest of this app already uses. */
    client.named(query)
      .then(function (card) {
        focusState.busy = false;
        if (!card) { focusSay("No card called \u201c" + query + "\u201d.", "bad"); return; }
        if (card.legalities && card.legalities.commander !== "legal") {
          focusSay(card.name + " is not legal in Commander (" +
            (card.legalities.commander || "unknown") + "), so it is not in this graph.", "bad");
          return;
        }
        var here = byId(card.oracleId) || DATA.cards.filter(function (c) {
          return (c.name || "").toLowerCase() === card.name.toLowerCase();
        })[0];
        if (here) {
          focusSay(card.name + " is already in the catalog.", "ok");
          $("focus-q").value = here.name;
          focusOn(here.id);
          return;
        }
        var added = addVisitor(visitorFrom(card));
        focusSay(card.name + " looked up and drawn. Nobody owns it and EDHREC co-play was " +
          "never computed for it, so its connections come from its rules text alone.", "ok");
        $("focus-q").value = added.name;
        focusOn(added.id);      // renders, which draws the kept chips too
      })
      .catch(function (err) {
        focusState.busy = false;
        focusSay("Scryfall could not be reached (" + (err && err.message ? err.message : "network error") +
          "). The catalog below still works.", "bad");
      });
  }

  /* Tapping a node shows the card. Re-centering lives INSIDE the popup as a button.
     A lock toggle would make the common act -- "what is this card?" -- require a
     mode change, and a mode is a cost paid on every click. Right-click and
     long-press were the other candidates and both fail on a phone, which is where
     this gets used. Double-click still re-centers directly for speed, and the
     toggle in the bar flips single-click to focus for anyone who prefers it. */
  function byId(id) { for (var i = 0; i < DATA.cards.length; i++) if (DATA.cards[i].id === id) return DATA.cards[i]; return null; }

  /* ONE ANSWER TO "I CLICKED A CARD", for the list and the canvas alike.
     They used to disagree: the canvas honoured the toggle in the bar and the list
     tiles always opened the picture, so the same setting meant something on one
     view and nothing on the other. Both come through here now. */
  function cardClicked(id) {
    if (state.clickFocuses) focusOn(id); else openCard(id);
  }

  /* The pill is two buttons rather than one that flips, because a single button
     showing "On" cannot say whether that is the state or the offer. Two say both. */
  function setClickMode(on) {
    state.clickFocuses = !!on;
    document.querySelectorAll("[data-clickmode]").forEach(function (b) {
      var sel = (b.dataset.clickmode === "on") === state.clickFocuses;
      b.classList.toggle("is-on", sel);
      b.setAttribute("aria-pressed", String(sel));
    });
  }

  function openCard(id) {
    var c = byId(id);
    if (!c) return;
    var owned = [];
    if (c.own > 0) owned.push(c.own + " in hand");
    if (c.ordered > 0) owned.push(c.ordered + " on order");
    if (c.bench > 0) owned.push(c.bench + " on the bench");
    var box = document.createElement("div");
    box.className = "gp-modal";
    box.innerHTML =
      '<div class="gp-modal-in" role="dialog" aria-modal="true" aria-label="' + esc(c.name) + '">' +
        '<button class="gp-modal-x" type="button" aria-label="Close">&times;</button>' +
        (c.image ? '<img class="gp-modal-art" src="' + esc(c.image) + '" alt="' + esc(c.name) + '">' : "") +
        '<div class="gp-modal-body">' +
          "<h2>" + esc(c.name) + "</h2>" +
          '<p class="gp-modal-type">' + esc(c.type || "") + "</p>" +
          '<p class="gp-modal-facts">' + (c.mv || 0) + " mana value &middot; " + esc(c.ci || "colorless") +
            (c.price ? " &middot; <strong>$" + Number(c.price).toFixed(2) + "</strong>" : " &middot; no price") +
            (c.cheapestSet ? ' <span class="gp-dim">cheapest in ' + esc(c.cheapestSet) +
              (c.printings > 1 ? " of " + c.printings + " printings" : "") + "</span>" : "") + "</p>" +
          (owned.length ? '<p class="gp-modal-own">' + esc(owned.join(" &middot; ").replace(/&middot;/g, "·")) + "</p>" : "") +
          '<div class="gp-tags">' +
            (c.isCommander ? '<span class="gp-tag cmdr">can be your commander</span>' : "") +
            (c.decks || []).map(function (d) { return '<span class="gp-tag deck">' + esc(d.deck) + "</span>"; }).join("") +
            (c.roles || []).map(function (r) { return '<span class="gp-tag">' + esc(r) + "</span>"; }).join("") +
          "</div>" +
          '<div class="gp-modal-acts">' +
            '<button class="gp-btn primary" data-focus="' + c.id + '" type="button">Focus this card</button>' +
            (c.buy ? '<a class="gp-btn" href="' + esc(c.buy) + '" target="_blank" rel="noopener noreferrer">Buy on TCGPlayer &nearr;</a>' : "") +
          "</div>" +
        "</div>" +
      "</div>";
    box.addEventListener("click", function (e) {
      if (e.target === box || e.target.closest(".gp-modal-x")) closeCard();
      var f = e.target.closest("[data-focus]");
      if (f) {
        EGO = f.dataset.focus; state.view = "graph"; syncViews(); closeCard();
        // A new center has different reasons, so an expanded group from the old
        // one would open something the reader never asked for.
        groupState = {open: {}, only: null};
        render();
      }
    });
    document.body.appendChild(box);
    document.body.classList.add("gp-locked");
    box.querySelector(".gp-modal-x").focus();
  }
  function closeCard() {
    var m = document.querySelector(".gp-modal");
    if (m) m.remove();
    document.body.classList.remove("gp-locked");
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeCard(); });

  /* HOW BIG A FIRST PAGE OF RESULTS IS.
   *
   * Sized to the layout rather than to the data, because the grid is one column
   * on a phone and four or five on a desktop -- so the same number of tiles is a
   * very different amount of scrolling. This used to render 400 whatever the
   * screen: measured, 16,437px on a desktop and 43,535px on a phone, or
   * seventeen screens and fifty-six. Nothing was slow (content-visibility leaves
   * the off-screen tiles unpainted) and the legend was honest about the number.
   * It was simply more page than anybody scrolls, and there was no way to the
   * other 7,310 at all.
   *
   * Read on every render rather than once at load, so rotating a phone resizes
   * the page instead of keeping the number the other orientation chose. */
  function listPage() {
    return window.matchMedia("(max-width: 720px)").matches ? 24 : 96;
  }

  /* Reset the page when the RESULTS change, not when a filter is touched. A
     signature cannot be forgotten the way a reset call in each of six handlers
     can, and "show more" leaves the rows alone, so it keeps what it revealed. */
  var listSig = null, listRows = [];

  function listFoot(shown, total) {
    if (shown >= total) return "";
    return '<button class="gp-show-rest" type="button" data-more-cards>Show ' +
      Math.min(total - shown, listPage()).toLocaleString() + " more</button>" +
      '<p class="gp-legend">' + shown.toLocaleString() + " of " + total.toLocaleString() +
      " cards. Narrowing the filters gets you there quicker than scrolling does.</p>";
  }

  function renderList(rows) {
    listRows = rows;
    if (!rows.length) {
      $("result").innerHTML = '<p class="gp-empty">Nothing matches those filters.</p>';
      listSig = null;
      return;
    }
    var sig = rows.length + "|" + rows[0].id + "|" + rows[rows.length - 1].id;
    if (sig !== listSig) { listSig = sig; state.listShown = 0; }

    var shown = Math.min(rows.length, state.listShown || listPage());
    state.listShown = shown;
    $("result").innerHTML = '<div class="gp-grid">' + rows.slice(0, shown).map(cardTile).join("") + "</div>" +
      '<div class="gp-list-foot">' + listFoot(shown, rows.length) + "</div>";
  }

  /* APPEND, rather than re-render.
   *
   * Going back through render() would rebuild #result, destroying and recreating
   * every tile already on screen -- ninety-six of them, each carrying
   * content-visibility and an image -- so that the reader's position had to be
   * saved and put back around it. Adding the new tiles to the end of the grid
   * touches nothing that is already there instead, so there is no scroll to
   * restore. Driven by a real wheel and a real click, the card under the
   * reader's eye moves 0px. */
  function showMoreCards() {
    var grid = $("result").querySelector(".gp-grid");
    var foot = $("result").querySelector(".gp-list-foot");
    if (!grid || !foot) return;
    var from = state.listShown;
    var to = Math.min(listRows.length, from + listPage());
    if (to <= from) return;
    grid.insertAdjacentHTML("beforeend", listRows.slice(from, to).map(cardTile).join(""));
    state.listShown = to;
    foot.innerHTML = listFoot(to, listRows.length);
  }

  /* The graph is deliberately ego-centric and capped. Two cards are joined when
     one CAUSES an event the other TRIGGERS_ON, when both trigger on the same
     event (a co-payoff), or when EDHREC records them played together. */
  /* WHY THE OLD PICTURE WAS AN ASTERISK, AND IT WAS NOT THE LAYOUT.
   *
   * Good-Fortune Unicorn requires the role "creatures". Every creature in a
   * 4,883-card pool supplies it, so the candidate list was two thousand cards
   * that all scored the same 3, and taking the top 90 took 90 of them. The graph
   * then drew 90 identical spokes labeled "supplies creatures", which is a true
   * statement about nothing.
   *
   * Two things fix it, and both are about WHICH cards are picked rather than
   * where they are drawn:
   *
   *   1. A quota per reason. Reasons compete for slots round-robin instead of
   *      by raw weight, so one broad role cannot crowd out the shared events and
   *      the co-play that were the interesting half of the answer.
   *   2. Relevance inside a reason. Two thousand cards supply "creatures"; the
   *      ones worth drawing are the ones he owns, the ones already in a deck,
   *      and the ones EDHREC actually pairs with this card. Ties inside a group
   *      break on that, not on catalog order.
   */
  var PER_GROUP = 14;     // candidates kept per reason before relevance decides
  var TOTAL_CAP = 90;     // candidates handed to the clustering

  function neighbors(ego, pool) {
    var byId = {}; pool.forEach(function (c) { byId[c.id] = c; });
    var out = [], seen = {};

    // EDHREC co-play, as a lookup: a card the data says is played alongside this
    // one is more worth drawing than one that merely shares a keyword.
    var synergy = {};
    DATA.played.forEach(function (p) {
      if (p.from === ego.id) synergy[p.to] = Math.max(synergy[p.to] || 0, p.synergy || 0);
      if (p.to === ego.id) synergy[p.from] = Math.max(synergy[p.from] || 0, p.synergy || 0);
    });

    /* Relevance is about HIS collection, not the card's power level. A card in
       one of the six decks is the most relevant thing there is; one he owns is
       next; one EDHREC pairs with this card is next. Everything else is a card
       he would have to go and buy on the strength of a shared keyword. */
    function relevance(card) {
      var r = 0;
      if ((card.decks || []).length) r += 4;
      if (card.own > 0) r += 2;
      else if (card.ordered > 0 || card.bench > 0) r += 1;
      r += (synergy[card.id] || 0) * 3;
      return r;
    }

    function add(card, label, weight) {
      if (!card || card.id === ego.id) return;
      var k = card.id + "|" + label;
      if (seen[k]) return; seen[k] = 1;
      out.push({card: card, label: label, weight: weight, rel: relevance(card)});
    }

    var egoTrig = ego.triggers || [], egoCause = ego.causes || [];
    pool.forEach(function (c) {
      (c.causes || []).forEach(function (e) { if (egoTrig.indexOf(e) >= 0) add(c, e, 2); });
      (c.triggers || []).forEach(function (e) {
        if (egoCause.indexOf(e) >= 0) add(c, e, 2);
        else if (egoTrig.indexOf(e) >= 0) add(c, e + " (co-payoff)", 1);
      });
    });
    (ego.requires || []).forEach(function (need) {
      pool.forEach(function (c) { if ((c.roles || []).indexOf(need) >= 0) add(c, "supplies " + need, 3); });
    });
    (ego.roles || []).forEach(function (have) {
      pool.forEach(function (c) { if ((c.requires || []).indexOf(have) >= 0) add(c, "needs " + have, 3); });
    });
    DATA.played.forEach(function (p) {
      if (p.from === ego.id && byId[p.to]) add(byId[p.to], "played together", 1 + (p.synergy || 0) * 3);
      if (p.to === ego.id && byId[p.from]) add(byId[p.from], "played together", 1 + (p.synergy || 0) * 3);
    });

    // Bucket by reason, keep the most relevant few of each, then let the reasons
    // take turns until the canvas is full. Round-robin is what stops "supplies
    // creatures" from being the whole answer.
    var buckets = {}, order = [];
    out.forEach(function (n) {
      if (!buckets[n.label]) { buckets[n.label] = []; order.push(n.label); }
      buckets[n.label].push(n);
    });
    order.forEach(function (label) {
      buckets[label].sort(function (a, b) { return b.rel - a.rel || b.weight - a.weight ||
        (a.card.name < b.card.name ? -1 : 1); });
      buckets[label] = buckets[label].slice(0, PER_GROUP);
    });
    // A reason with more relevant cards behind it goes first, so the busiest
    // wedge is also the one worth reading.
    order.sort(function (a, b) { return buckets[b][0].rel - buckets[a][0].rel || buckets[b].length - buckets[a].length; });

    var picked = [], round = 0, added = true;
    while (picked.length < TOTAL_CAP && added) {
      added = false;
      for (var i = 0; i < order.length && picked.length < TOTAL_CAP; i++) {
        var b = buckets[order[i]];
        if (round < b.length) { picked.push(b[round]); added = true; }
      }
      round++;
    }
    return picked;
  }

  /* WHY THE GRAPH IS NOT A STAR ANY MORE.
   *
   * The ego's 90 neighbors all hang off one node, so laid out as a single ring
   * they draw an asterisk: 90 identical spokes, and 90 edge labels at 6px
   * printed on top of each other. The picture carried one fact -- "this card is
   * connected to a lot of cards" -- which the count already said in words.
   *
   * The information being thrown away was the edge label. Every neighbor is
   * here for a REASON: it supplies a role this card needs, it fires on an event
   * this card causes, it is played alongside it. Group by that reason and 90
   * spokes become eight or so labeled clusters, each label drawn once at a size
   * a person can read. The layout is computed rather than simulated, so the same
   * card always draws the same picture and nothing drifts while you look at it.
   */
  var groupState = {open: {}, only: null};

  /* A phone gets fewer, so the labels stay readable rather than the picture
     staying complete. Nothing is lost: the chip row above the canvas lists every
     reason at full size, and tapping one isolates it. */
  function limits() {
    var narrow = window.matchMedia("(max-width: 860px)").matches;
    return {cap: narrow ? 5 : 8, hubs: narrow ? 4 : 8};
  }

  // The edge labels are already prose; these turn them into a small, ordered set
  // of buckets. Order is deliberate: the reasons that describe a functional
  // dependency come before the ones that describe correlation.
  function groupOf(label) {
    // The ROLE is the reason, not the word "supplies". Collapsing every role
    // into one hub is the same mistake the old single ring made, one level up.
    if (label.indexOf("supplies ") === 0) {
      return {key: "sup:" + label.slice(9), title: "Supplies " + label.slice(9), rank: 0};
    }
    if (label.indexOf("needs ") === 0) {
      return {key: "need:" + label.slice(6), title: "Needs its " + label.slice(6), rank: 1};
    }
    if (label === "played together") return {key: "coplay", title: "Played together (EDHREC)", rank: 4};
    if (label.indexOf(" (co-payoff)") > 0) {
      var ev = label.slice(0, label.length - " (co-payoff)".length);
      return {key: "co:" + ev, title: "Also fires on " + ev, rank: 3};
    }
    return {key: "ev:" + label, title: "Shares the event " + label, rank: 2};
  }

  function cluster(near) {
    var byKey = {}, order = [];
    near.forEach(function (n) {
      var g = groupOf(n.label);
      if (!byKey[g.key]) { byKey[g.key] = {key: g.key, title: g.title, rank: g.rank, items: []}; order.push(byKey[g.key]); }
      byKey[g.key].items.push(n);
    });
    order.forEach(function (g) {
      g.items.sort(function (a, b) { return b.weight - a.weight; });
      g.weight = g.items.reduce(function (n, i) { return n + i.weight; }, 0);
    });
    // Biggest first inside a rank, so the eye lands on the busiest cluster.
    return order.sort(function (a, b) { return a.rank - b.rank || b.items.length - a.items.length; });
  }

  /* Positions, computed rather than simulated, so the same card always draws the
     same picture and nothing drifts while you are looking at it.

     Each cluster owns an angular wedge. Sizing the wedge purely by card count
     put a one-card cluster in a 12-degree slice and then drew a 180px label
     across it, straight through its neighbor -- so a wedge is also never
     narrower than its own label needs, and the hubs alternate between two radii
     so that two wide labels side by side sit on different rings instead of on
     top of each other. Cards start outside the further hub ring, which is what
     keeps a label off the art. */
  var HUB_R_IN = 200, HUB_R_OUT = 292, CARD_R0 = 382, CARD_RING = 98;

  function place(groups) {
    var pos = {}, hub = {};
    // A wedge must hold whichever is larger: its cards, or its label. 22 is the
    // angular cost of a label in the same units the card count is measured in,
    // tuned so an eight-card cluster and a long label ask for about the same.
    var demand = groups.map(function (g) {
      return Math.max(2.6, g.shown.length, g.title.length / 22 * 4);
    });
    var total = demand.reduce(function (a, b) { return a + b; }, 0) || 1;
    var angle = -Math.PI / 2;            // start at twelve o'clock
    groups.forEach(function (g, gi) {
      var span = demand[gi] / total * Math.PI * 2;
      var mid = angle + span / 2;
      var hubR = gi % 2 ? HUB_R_OUT : HUB_R_IN;
      hub[g.key] = {x: Math.cos(mid) * hubR, y: Math.sin(mid) * hubR};
      var n = g.shown.length;
      var rings = n <= 4 ? 1 : (n <= 9 ? 2 : 3);
      var perRing = Math.ceil(n / rings);
      g.shown.forEach(function (item, i) {
        var ring = Math.floor(i / perRing);
        var inRing = i % perRing;
        var countInRing = Math.min(perRing, n - ring * perRing);
        // Leave a margin inside the wedge so neighbouring clusters do not touch.
        var usable = span * 0.8;
        var t = countInRing === 1 ? 0.5 : inRing / (countInRing - 1);
        var a = mid - usable / 2 + usable * t;
        var r = CARD_R0 + ring * CARD_RING;
        pos[item.card.id] = {x: Math.cos(a) * r, y: Math.sin(a) * r};
      });
      angle += span;
    });
    return {pos: pos, hub: hub};
  }

  function renderGraph(rows) {
    var host = $("cy");
    if (!EGO) { EGO = (rows[0] || DATA.cards[0]).id; }
    var ego = DATA.cards.filter(function (c) { return c.id === EGO; })[0];
    if (!ego) { host.innerHTML = ""; return; }
    var near = neighbors(ego, DATA.cards);
    var shownIds = {}; rows.forEach(function (c) { shownIds[c.id] = 1; });
    var groups = cluster(near);
    if (groupState.only && !groups.some(function (g) { return g.key === groupState.only; })) groupState.only = null;
    // Twenty hubs is a hairball of labels, which is the old problem wearing a
    // hat. The canvas draws the busiest MAX_HUBS; the chip row above lists every
    // reason, and clicking one isolates it, so nothing is unreachable.
    var lim = limits();
    var drawn = groupState.only
      ? groups.filter(function (g) { return g.key === groupState.only; })
      : groups.slice(0, lim.hubs);
    drawn.forEach(function (g) {
      var open = groupState.open[g.key] || groupState.only === g.key;
      g.shown = open ? g.items : g.items.slice(0, lim.cap);
      g.hidden = g.items.length - g.shown.length;
    });

    renderGroupBar(groups, near.length);
    $("legend").hidden = false;
    var offCanvas = groupState.only ? 0 : Math.max(0, groups.length - drawn.length);
    $("legend").innerHTML = "Center: <strong>" + esc(ego.name) + "</strong>, ringed by " +
      drawn.reduce(function (n, g) { return n + g.shown.length; }, 0) + " of " + near.length +
      " connected cards, grouped by why they are connected" +
      (offCanvas ? " \u2014 the " + drawn.length + " busiest reasons of " + groups.length +
        ", with " + offCanvas + " more in the chips above" : "") +
      ". Cards are picked for relevance to your collection first: in a deck, then owned, then EDHREC co-play. " +
      "Click a group label to open it, a chip to isolate one reason, or any card to re-center. " +
      "Faded cards fall outside your filters." +
      (ego.visitor
        ? " <strong>" + esc(ego.name) + " was looked up rather than baked into the catalog</strong>, so " +
          "nobody owns it and EDHREC co-play was never computed for it \u2014 everything around it is here " +
          "because of what its rules text says, read by the same rules as every other card."
        : "");
    /* Cytoscape is the one thing on this page that comes from a CDN, so it is the
       one thing that can be missing on a working connection -- a blocked domain, a
       corporate proxy, an offline laptop. Measured here on a cold load: the request
       reset and the drawing stopped, which is correct. What was wrong was the
       message: "Graph library did not load" is a dead end that does not mention
       the List view, which has every one of these cards in it and still works. */
    if (!window.cytoscape) {
      host.innerHTML = '<div class="gp-empty">' +
        "<p><b>The drawing library is not here yet.</b> It comes from a CDN, so a slow " +
        "connection delays it and a blocked domain stops it; nothing else on this page " +
        "needs it, and this view draws itself as soon as it arrives.</p>" +
        "<p>Every card in this view is in the <b>List</b> beside it, with the same " +
        "filters and the same Copilot.</p>" +
        '<button class="gp-btn primary" type="button" data-view="list">Show the list instead</button>' +
        "</div>";
      return;
    }

    var laid = place(drawn);
    var els = [{data: {id: ego.id, label: ego.name, img: ego.image, kind: "ego"}, position: {x: 0, y: 0}}];
    drawn.forEach(function (g) {
      var hubId = "hub:" + g.key;
      els.push({data: {id: hubId, kind: "hub", group: g.key,
        label: g.title + "  (" + g.items.length + ")" + (g.hidden ? "  +" + g.hidden : "")},
        position: laid.hub[g.key]});
      els.push({data: {id: ego.id + ">" + hubId, source: ego.id, target: hubId, kind: "spine", w: Math.min(4, 1 + g.items.length / 4)}});
      g.shown.forEach(function (n) {
        els.push({data: {id: n.card.id, label: n.card.name, img: n.card.image, kind: "card",
          group: g.key, dim: shownIds[n.card.id] ? 0 : 1}, position: laid.pos[n.card.id]});
        els.push({data: {id: hubId + ">" + n.card.id, source: hubId, target: n.card.id, kind: "leaf", w: n.weight}});
      });
    });

    if (CY) { CY.destroy(); CY = null; }
    CY = window.cytoscape({
      container: host, elements: els,
      style: [
        {selector: "node[kind = 'card']", style: {
          "background-image": "data(img)", "background-fit": "cover", "background-color": "#ece4d0",
          width: 46, height: 64, shape: "round-rectangle", label: "data(label)",
          "font-size": 8.5, "text-valign": "bottom", "text-margin-y": 4, color: "#586761",
          "text-max-width": 80, "text-wrap": "ellipsis", "border-width": 1, "border-color": "#dcd2b9"}},
        {selector: "node[dim = 1]", style: {opacity: 0.45}},
        {selector: "node[kind = 'ego']", style: {
          "background-image": "data(img)", "background-fit": "cover", "background-color": "#ece4d0",
          width: 82, height: 114, shape: "round-rectangle", label: "data(label)",
          "font-size": 11, "font-weight": "bold", "text-valign": "bottom", "text-margin-y": 5,
          color: "#16221d", "text-max-width": 130, "text-wrap": "ellipsis",
          "border-width": 3, "border-color": "#dda01c"}},
        /* The hub is the label. Drawing it once, at a readable size, on a solid
           chip is the whole point of the regrouping -- it replaces the 90
           unreadable edge labels the old layout printed on top of each other. */
        {selector: "node[kind = 'hub']", style: {
          shape: "round-rectangle", "background-color": "#0f3a2b", "background-opacity": 0.92,
          width: "label", height: 20, padding: "7px", label: "data(label)", "font-size": 10,
          "font-weight": "bold", color: "#f4efe2", "text-valign": "center", "text-halign": "center",
          "text-max-width": 190, "text-wrap": "wrap", "border-width": 0}},
        {selector: "edge[kind = 'spine']", style: {
          width: "mapData(w, 1, 4, 1.5, 4)", "line-color": "#b8ac8c", "curve-style": "straight",
          opacity: 0.85, "target-arrow-shape": "none"}},
        {selector: "edge[kind = 'leaf']", style: {
          width: "mapData(w, 1, 4, 0.8, 2)", "line-color": "#d4cab1", "curve-style": "bezier",
          opacity: 0.7, "target-arrow-shape": "none"}},
        /* Hover reads one thread out of the picture. Everything not on it fades
           rather than disappearing, so the shape of the whole stays legible. */
        {selector: ".faded", style: {opacity: 0.12}},
        {selector: ".lit", style: {opacity: 1, "border-color": "#dda01c", "border-width": 3}},
        {selector: "edge.lit", style: {"line-color": "#dda01c", opacity: 1, width: 3}}
      ],
      layout: {name: "preset", fit: true, padding: 34},
      wheelSensitivity: 0.2
    });

    /* Group keys carry colons and spaces ("ev:creature enters"), which a
       cytoscape selector string would have to escape. Filtering on the data
       instead sidesteps the escaping question entirely. */
    function clearHighlight() { CY.elements().removeClass("faded lit"); }
    CY.on("mouseover", "node[kind = 'card'], node[kind = 'hub']", function (evt) {
      var n = evt.target, group = n.data("group");
      CY.elements().addClass("faded");
      CY.nodes().filter(function (el) {
        return el.data("group") === group || el.data("kind") === "ego";
      }).removeClass("faded");
      n.closedNeighborhood().removeClass("faded").addClass("lit");
    });
    CY.on("mouseout", "node", clearHighlight);

    CY.on("tap", "node[kind = 'hub']", function (evt) {
      var g = evt.target.data("group");
      groupState.open[g] = !groupState.open[g];
      render();
    });
    CY.on("tap", "node[kind = 'card'], node[kind = 'ego']", function (evt) {
      var id = evt.target.id();
      cardClicked(id);
    });
    CY.on("dbltap", "node[kind = 'card']", function (evt) {
      closeCard(); EGO = evt.target.id(); groupState = {open: {}, only: null}; render();
    });
  }

  /* The same grouping, as text, above the canvas. It is the legend, the table of
     contents and the filter at once: a reader who only wants to know WHY a card
     is connected never has to read the canvas at all. */
  function renderGroupBar(groups, total) {
    var host = $("groups");
    if (!groups.length) { host.hidden = true; return; }
    host.hidden = false;
    host.innerHTML = groups.map(function (g) {
      var on = groupState.only === g.key;
      return '<button type="button" class="gp-group' + (on ? " is-on" : "") + '" data-group="' +
        esc(g.key) + '"><span class="gp-group-n">' + g.items.length + "</span>" + esc(g.title) + "</button>";
    }).join("") + (groupState.only
      ? '<button type="button" class="gp-group gp-group-all" data-group="">Show all ' + total + "</button>"
      : "");
  }

  /* The copilot hands over a filter and the reason for it. It never picks a card
     and never edits a deck, so a lens you disagree with costs one click to drop.
     Each one is generated from a query, so a finding that stops being true stops
     appearing rather than sitting here being wrong. */
  var KIND = {warning: "Warning", attention: "Worth a look", opportunity: "Opportunity"};

  /* Why somebody would set a finding aside. Offered as a fixed list rather than a
     text box, because the reason has to be readable a month later by whoever
     wrote it -- and because "already done" and "I disagree" mean different things
     to the next build: one of them will come back on its own, the other will not. */
  var REASONS = [
    ["done", "Already handled"],
    ["disagree", "I disagree with this"],
    ["later", "Not now"]
  ];
  var REASON_LABEL = {};
  REASONS.forEach(function (r) { REASON_LABEL[r[0]] = r[1]; });

  /* What a lens is worth, in the two currencies this app deals in. Only the
     simulator's lenses carry one; a graph lens says how many cards it found,
     which is a size and not a stake. */
  function impactChip(l) {
    var im = l.impact || {};
    var bits = [];
    if (im.score) bits.push((im.score > 0 ? "+" : "") + Number(im.score).toFixed(2) + " pts");
    if (im.dollars) bits.push("$" + Math.abs(Number(im.dollars)).toFixed(2));
    return bits.length ? '<span class="gp-cp-impact">' + esc(bits.join(" · ")) + "</span>" : "";
  }

  function renderLenses() {
    var host = $("copilot");
    if (!LENSES.length) { host.hidden = true; return; }
    host.hidden = false;
    var active = state.lens;
    var live = LENSES.filter(function (l) { return !dismissed[l.id]; });
    var set = LENSES.filter(function (l) { return dismissed[l.id]; });

    // The filters split `live` in two rather than shortening it: a finding about another
    // deck, or of a kind you are not reading for, is not wrong -- it is just not the
    // question you asked. It folds, with its count on the label.
    var mine = live.filter(function (l) { return cpPasses(l); });
    var others = live.filter(function (l) { return mine.indexOf(l) < 0; });
    var picked = CP_AXES.reduce(function (n, a) { return n + cpFilter[a.key].length; }, 0);

    host.innerHTML =
      "<summary><strong>Copilot</strong> <span class=\"gp-cp-n\">" +
        (picked ? mine.length + " of " + live.length + " showing" : live.length + " things worth a look") +
        (set.length ? " · " + set.length + " set aside" : "") + "</span>" +
        (active ? ' <span class="gp-cp-live">showing: ' + esc(active.title) + "</span>" : "") + "</summary>" +
      filterBar() +
      '<div class="gp-cp-grid">' + mine.map(card).join("") + "</div>" +
      (mine.length ? "" : '<p class="gp-cp-none">Nothing matches those filters. The ' + others.length +
        " other finding" + (others.length === 1 ? " is" : "s are") + " in the drawer below.</p>") +
      (others.length
        ? '<details class="gp-cp-set"><summary>' + others.length + " outside these filters</summary>" +
          '<div class="gp-cp-grid">' + others.map(card).join("") + "</div></details>"
        : "") +
      (set.length
        ? '<details class="gp-cp-set"><summary>' + set.length + " set aside</summary>" +
          '<div class="gp-cp-grid">' + set.map(card).join("") + "</div></details>"
        : "");

    /* THE CHIP ROWS. Every value is offered whether or not it has a finding, with the
       count on it -- "Krenko 0" is an answer, and hiding the chip would make a clean deck
       look like a missing one.

       Counts are taken against what the OTHER axes allow, which is the standard faceted
       rule and the only one that does not lie: counted against everything, a chip promises
       findings the current filters would not show you; counted against everything
       including itself, every unpicked chip in a picked axis reads zero. */
    function filterBar() {
      var deckNames = ((DATA && DATA.decks) || []).map(function (d) { return d.name; });
      var axes = [
        {key: "deck",   label: "Playing tonight", values: deckNames.map(function (n) { return [n, n]; })},
        {key: "kind",   label: "Kind", values: ["warning", "attention", "opportunity"].map(function (k) { return [k, KIND[k]]; })},
        {key: "source", label: "From", values: [["rules", "Card rules"], ["simulation", "Simulation"]]}
      ].filter(function (a) { return a.values.length > 1; });
      if (!axes.length) return "";
      return '<div class="gp-cpf">' + axes.map(function (a) {
        var pool = live.filter(function (l) { return cpPasses(l, a.key); });
        return '<div class="gp-cpf-row" role="group" aria-label="' + esc(a.label) + '">' +
          '<span class="gp-cpf-lab">' + esc(a.label) + "</span>" +
          a.values.map(function (pair) {
            var on = cpFilter[a.key].indexOf(pair[0]) >= 0;
            var n = pool.filter(function (l) { return cpValues(l, a.key).indexOf(pair[0]) >= 0; }).length;
            return '<button type="button" class="gp-cpf-b' + (on ? " is-on" : "") +
              '" data-cpf="' + esc(a.key) + '" data-cpv="' + esc(pair[0]) + '" aria-pressed="' + on + '">' +
              esc(pair[1]) + " <b>" + n + "</b></button>";
          }).join("") + "</div>";
      }).join("") +
        (picked ? '<button type="button" class="gp-cpf-b is-clear" data-cpf-clear>Clear ' + picked +
          " filter" + (picked === 1 ? "" : "s") + "</button>" : "") +
        "</div>";
    }

    function card(l) {
      var on = active && active.id === l.id;
      var gone = dismissed[l.id];
      return '<div class="gp-cp gp-cp-' + esc(l.kind) + (on ? " is-on" : "") + (gone ? " is-set" : "") +
        (l.source === "simulation" ? " is-sim" : "") + '">' +
        '<span class="gp-cp-kind">' + esc(KIND[l.kind] || l.kind) +
          (l.source === "simulation" ? ' <i class="gp-cp-src">simulated</i>' : "") + "</span>" +
        impactChip(l) +
        "<b>" + esc(l.title) + "</b>" +
        "<p>" + esc(l.why) + "</p>" +
        '<p class="gp-cp-ev">' + esc(l.evidence) + "</p>" +
        (gone
          ? '<p class="gp-cp-gone">Set aside — ' + esc(REASON_LABEL[gone.reason] || gone.reason) +
            ' <button class="gp-cp-undo" data-undismiss="' + esc(l.id) + '" type="button">put it back</button></p>'
          : '<div class="gp-cp-acts">' +
            '<button class="gp-btn' + (on ? "" : " primary") + '" data-lens="' + esc(l.id) + '" type="button">' +
              (on ? "Clear this lens" : ((l.action && l.action.label) || ("Show these " + l.count))) + "</button>" +
            '<span class="gp-cp-dis">' + REASONS.map(function (r) {
              return '<button class="gp-cp-x" data-dismiss="' + esc(l.id) + '" data-reason="' + r[0] +
                '" type="button" title="Set aside: ' + esc(r[1]) + '">' + esc(r[1]) + "</button>";
            }).join("") + "</span></div>") +
        "</div>";
    }
  }

  function applyLens(id) {
    if (state.lens && state.lens.id === id) { state.lens = null; render(); return; }
    var l = LENSES.filter(function (x) { return x.id === id; })[0];
    if (!l) return;
    if (!l._set) { l._set = {}; (l.filter.ids || []).forEach(function (i) { l._set[i] = 1; }); }
    state.lens = l;
    state.f = {}; state.q = ""; $("q").value = "";   // a lens is the whole question
    state.view = "list"; syncViews();
    render();
    $("result").scrollIntoView({behavior: "smooth", block: "start"});
  }

  function render() {
    renderLenses();
    var rows = visible();
    /* The denominator is everything the page can show, looked-up cards included, or the
       line reads "7,765 of 7,764" and looks like a bug. What those extra cards are is said
       after it, because a catalog that quietly grew is the thing worth mentioning. */
    var extra = visitorCount();
    $("count").textContent = rows.length.toLocaleString() + " of " +
      DATA.cards.length.toLocaleString() + " cards" +
      (extra ? " \u00b7 " + extra + " looked up" : "");
    renderFacets();
    renderFocusKept();
    var graph = state.view === "graph";
    $("result").hidden = graph; $("cy").hidden = !graph; $("legend").hidden = !graph;
    $("groups").hidden = !graph;
    if (graph) renderGraph(rows); else renderList(rows);
  }

  document.addEventListener("change", function (e) {
    var cb = e.target.closest("input[data-facet]");
    if (cb) {
      var key = cb.dataset.facet, list = state.f[key] || (state.f[key] = []);
      var i = list.indexOf(cb.value);
      if (cb.checked && i < 0) list.push(cb.value); else if (!cb.checked && i >= 0) list.splice(i, 1);
      render(); return;
    }
    if (e.target.id === "mv") { state.mvMax = Number(e.target.value); render(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "q") { state.q = e.target.value.trim(); render(); return; }
    if (e.target.id === "focus-q") {
      var q = e.target.value.trim();
      focusSay("");
      if (!q) closeFocusMenu(); else openFocusMenu(q);
    }
  });
  /* Arrow keys through the suggestions, Enter to take one, Escape to shut it. A combobox
     that can only be driven with a mouse is a combobox half the keyboard sweep this page
     already passed would fail on. */
  document.addEventListener("keydown", function (e) {
    if (e.target.id !== "focus-q") return;
    if (e.key === "Escape") { closeFocusMenu(); return; }
    if (!focusState.open) {
      if (e.key === "Enter" && e.target.value.trim().length >= 3) {
        e.preventDefault(); lookUpCard(e.target.value.trim());
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      /* -1 is the typed text itself, which the cycle passes back through: arrowing off the
         end returns you to what you wrote rather than wrapping straight onto the first
         option, so you can always get back to editing it. */
      var n = focusState.options.length;
      var next = focusState.active + (e.key === "ArrowDown" ? 1 : -1);
      focusState.active = next >= n ? -1 : (next < -1 ? n - 1 : next);
      renderFocusMenu();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      var pick = focusState.options[focusState.active] || focusState.options[0];
      if (!pick) return;
      if (pick.kind === "lookup") lookUpCard(pick.query);
      else if (pick.card && pick.card.outside) lookUpCard(pick.card.name);
      else { e.target.value = pick.card.name; closeFocusMenu(); focusOn(pick.card.id); }
    }
  });
  document.addEventListener("click", function (e) {
    var pickFocus = e.target.closest("[data-focus-pick]");
    if (pickFocus) {
      var picked = byId(pickFocus.dataset.focusPick);
      if (picked) { $("focus-q").value = picked.name; closeFocusMenu(); focusOn(picked.id); }
      return;
    }
    var lookup = e.target.closest("[data-focus-lookup]");
    if (lookup) { lookUpCard(lookup.dataset.focusLookup); return; }
    var forget = e.target.closest("[data-focus-forget]");
    if (forget) { forgetVisitor(forget.dataset.focusForget); return; }
    // Anywhere else shuts the suggestions, the way any menu behaves.
    if (focusState.open && !e.target.closest(".gp-focus")) closeFocusMenu();
    var tile = e.target.closest(".gp-card");
    if (tile && !tile.dataset.more) { cardClicked(tile.dataset.id); return; }
    var view = e.target.closest(".gp-view");
    if (view) { state.view = view.dataset.view; syncViews(); render(); return; }
    var more = e.target.closest("[data-more]");
    if (more) { state.showAll[more.dataset.more] = true; render(); return; }
    if (e.target.closest("[data-more-cards]")) { showMoreCards(); return; }
    /* Clear all clears FILTERS. A looked-up card is not a filter -- it is a card you added
       to the catalog -- so it survives, and the chips below the focus box are how it goes.
       Wiping it here would make "Clear all" a destructive act nobody expects. */
    if (e.target.id === "clear") { state.f = {}; state.q = ""; state.mvMax = 20; state.showAll = {}; state.lens = null; $("q").value = ""; render(); return; }
    var grp = e.target.closest(".gp-group");
    if (grp) {
      var key = grp.dataset.group;
      groupState.only = key && groupState.only !== key ? key : null;
      render(); return;
    }
    var lensBtn = e.target.closest("[data-lens]");
    if (lensBtn) { applyLens(lensBtn.dataset.lens); return; }
    var cpf = e.target.closest("[data-cpf]");
    if (cpf) { toggleCpFilter(cpf.dataset.cpf, cpf.dataset.cpv); renderLenses(); return; }
    if (e.target.closest("[data-cpf-clear]")) { clearCpFilter(); renderLenses(); return; }
    var dis = e.target.closest("[data-dismiss]");
    if (dis) {
      setDismissed(dis.dataset.dismiss, dis.dataset.reason);
      // A lens being looked at that is then set aside must stop filtering, or the
      // page keeps showing a question that is no longer being asked.
      if (state.lens && state.lens.id === dis.dataset.dismiss) state.lens = null;
      render();
      return;
    }
    var undo = e.target.closest("[data-undismiss]");
    if (undo) { setDismissed(undo.dataset.undismiss, null); render(); return; }
    var mode = e.target.closest("[data-clickmode]");
    if (mode) { setClickMode(mode.dataset.clickmode === "on"); return; }
    if (e.target.id === "pane-toggle") {
      var pane = $("pane"), open = !pane.hidden;
      pane.hidden = open; e.target.setAttribute("aria-expanded", String(!open));
    }
  });
  function syncViews() {
    // aria-pressed beside the class: which view you are looking at was styling
    // and nothing else, so a screen reader heard three buttons and no answer.
    document.querySelectorAll(".gp-view").forEach(function (b) {
      var on = b.dataset.view === state.view;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  /* Two sources, one Copilot.
     -------------------------
     data/lenses.json is generated from the graph: what a deck is short of, what
     you own that nothing uses, what the field plays that you do not have. All
     structural, and none of it can say whether a change makes the deck play
     better.

     data/deck-ratings.json can. sim-lenses.js turns its measured deltas into the
     findings the graph cannot reach -- above all the negative one: an upgrade
     path you were about to buy that measures WORSE than the deck you have. It is
     computed here rather than baked into a file, so it can never be stale against
     the ratings it reads.

     All three fetches are optional and all three race. Whoever lands last paints. */
  var GRAPH_LENSES = [], SIM_LENSES = [];

  function mergeLenses() {
    var Sim = window.MtgSimLenses;
    // A sim lens names a deck; the cards it means are looked up once, here, where
    // the card list is. Before graph.json lands there is nothing to resolve
    // against, so the merge waits rather than producing empty filters.
    if (DATA && Sim) {
      SIM_LENSES.forEach(function (l) {
        if (l.filter && !l.filter.ids) l.filter.ids = Sim.resolve(l, DATA.cards);
      });
    }
    var ready = SIM_LENSES.filter(function (l) { return (l.filter.ids || []).length; });
    LENSES = Sim ? Sim.rank(ready.concat(GRAPH_LENSES)) : GRAPH_LENSES;
    if (DATA) renderLenses();
  }

  fetch("data/lenses.json?v=1", {cache: "default"})
    .then(function (r) { return r.ok ? r.json() : {lenses: []}; })
    .catch(function () { return {lenses: []}; })
    .then(function (j) { GRAPH_LENSES = (j && j.lenses) || []; mergeLenses(); });

  Promise.all([
    fetch("data/deck-ratings.json?v=4", {cache: "default"}).then(function (r) { return r.ok ? r.json() : null; }),
    fetch("data/master-v2.json?v=2", {cache: "default"}).then(function (r) { return r.ok ? r.json() : null; })
  ]).catch(function () { return [null, null]; })
    .then(function (parts) {
      var ratings = parts && parts[0];
      if (!ratings || !window.MtgSimLenses) return;
      SIM_LENSES = window.MtgSimLenses.build(ratings, {master: parts[1]});
      mergeLenses();
    });

  /* The library is loaded async so it cannot hold the page up, which means it can
     arrive after this view has already told the reader it is missing. When it
     does, draw -- a message that stays wrong once the thing it describes has
     turned up is worse than the delay it was written to excuse. */
  window.addEventListener("cytoscape-ready", function () {
    if (DATA && state.view === "graph") render();
  });

  /* WHOSE CARDS THESE ARE.
   *
   * data/graph.json is baked from the collection as well as from Magic: every card
   * carries how many are in hand, how many are on order, how many are on the bench and
   * which decks name it. That is the whole point of the graph for the person it was baked
   * for -- and it is a lie told to everybody else, who opened the page and saw "in hand"
   * against cards they have never owned and deck badges for decks they have never built.
   *
   * So on a browser that has saved nothing, those four fields are dropped and the two
   * facets that read them go with them. What is left -- 7,764 cards, their rules, their
   * prices and every edge between them -- is Magic, and belongs to the reader as much as
   * to anybody. It comes back the moment there is a session to describe.
   */
  var MINE = ["own", "ordered", "bench", "decks"];
  var MINE_STRIPPED = false;
  function stripMine(json) {
    var User = window.MtgUserState;
    /* Same decision as My Decks makes, from the same place: a browser that starts empty
       shows no ownership and no deck membership, however many decks have been added since.
       See user-state.js -- inferring it per-render was the bug. */
    if (!User || !User.startsEmpty || !User.startsEmpty(window.localStorage)) return json;
    MINE_STRIPPED = true;
    return Object.assign({}, json, {
      decks: [],
      cards: json.cards.map(function (c) {
        var out = Object.assign({}, c);
        MINE.forEach(function (k) { out[k] = k === "decks" ? [] : 0; });
        return out;
      })
    });
  }

  fetch("data/graph.json?v=2", {cache: "default"})
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (json) {
      DATA = stripMine(json);
      /* The cards somebody looked up last time, put back before anything is indexed, so
         they are ordinary members of the catalog for the rest of the page's life. Any that
         the bake has since caught up with are dropped rather than added twice. */
      var known = {};
      json.cards.forEach(function (c) { known[c.id] = 1; });
      visitors = visitors.filter(function (v) { return v && v.id && !known[v.id]; });
      saveVisitors();
      visitors.forEach(function (v) { DATA.cards.push(v); });
      indexCards();
      mergeLenses();     // sim lenses name decks; now there are cards to name
      // The Copilot is closed by default now on every width -- graph.html no longer
      // carries `open` -- so this only has the pane left to fold on a phone.
      if (window.matchMedia("(max-width: 860px)").matches) $("pane").hidden = true;
      render();
    })
    .catch(function (err) {
      $("count").textContent = "";
      $("result").innerHTML = '<p class="gp-empty">Could not load <code>data/graph.json</code> (' + esc(err.message) +
        "). Build it with <code>node graph/ingest/07-export-app.mjs</code>.</p>";
    });
})();
