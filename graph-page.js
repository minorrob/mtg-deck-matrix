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
  /* Which deck is being played tonight, if any.
     A Copilot with twenty findings across six decks is a reading list. Somebody
     packing a bag for a game tonight has one deck in their hands and wants the
     three findings about it -- so this is a lens on the lenses, not a filter on
     the cards, and it never hides anything: the rest fold into a drawer with
     their count still on the label. */
  var TONIGHT_KEY = "mtg-graph-tonight.v1";
  var tonight = (function () {
    try { return localStorage.getItem(TONIGHT_KEY) || ""; } catch (err) { return ""; }
  })();
  function setTonight(deck) {
    tonight = tonight === deck ? "" : deck;
    try {
      if (tonight) localStorage.setItem(TONIGHT_KEY, tonight);
      else localStorage.removeItem(TONIGHT_KEY);
    } catch (err) { /* storage off */ }
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
  var state = {q: "", mvMax: 20, view: "list", f: {}, showAll: {}, clickFocuses: false, lens: null};
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
    {key: "owned",     label: "Ownership",  from: function (c) {
      var out = []; if (c.own > 0) out.push("in hand"); if (c.ordered > 0) out.push("on order");
      if (c.bench > 0) out.push("bench"); if (!c.own && !c.ordered) out.push("not owned"); return out; }},
    {key: "decks",     label: "In a deck",  from: function (c) { return (c.decks || []).map(function (d) { return d.deck; }); }},
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

  function indexCards() {
    DATA.cards.forEach(function (c) {
      var v = {};
      FACETS.forEach(function (f) { v[f.key] = f.from(c) || []; });
      c._f = v;
      c._search = ((c.name || "") + " " + (c.type || "")).toLowerCase();
    });
  }

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
    host.innerHTML = FACETS.map(function (f) {
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
    '<div class="gp-range"><input type="range" id="mv" min="0" max="20" step="1" value="' + state.mvMax + '"></div></details>';
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
        (c.decks || []).map(function (d) { return '<span class="gp-tag deck">' + esc(d.deck) + "</span>"; }).join("") +
        (c.roles || []).slice(0, 3).map(function (r) { return '<span class="gp-tag">' + esc(r) + "</span>"; }).join("") +
      "</span></span></button>";
  }

  /* Tapping a node shows the card. Re-centering lives INSIDE the popup as a button.
     A lock toggle would make the common act -- "what is this card?" -- require a
     mode change, and a mode is a cost paid on every click. Right-click and
     long-press were the other candidates and both fail on a phone, which is where
     this gets used. Double-click still re-centers directly for speed, and the
     toggle in the bar flips single-click to focus for anyone who prefers it. */
  function byId(id) { for (var i = 0; i < DATA.cards.length; i++) if (DATA.cards[i].id === id) return DATA.cards[i]; return null; }

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

  function renderList(rows) {
    $("result").innerHTML = rows.length
      ? '<div class="gp-grid">' + rows.slice(0, 400).map(cardTile).join("") + "</div>" +
        (rows.length > 400 ? '<p class="gp-legend">Showing the first 400 of ' + rows.length + ". Narrow the filters to see the rest.</p>" : "")
      : '<p class="gp-empty">Nothing matches those filters.</p>';
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
      "Faded cards fall outside your filters.";
    if (!window.cytoscape) { host.innerHTML = '<p class="gp-empty">Graph library did not load.</p>'; return; }

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
      if (state.clickFocuses) { EGO = id; groupState = {open: {}, only: null}; render(); } else openCard(id);
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

    // Tonight's deck splits `live` in two rather than filtering it: a finding
    // about another deck is not wrong, it is just not tonight's problem.
    var mine = live, others = [];
    if (tonight) {
      mine = live.filter(function (l) {
        var d = decksOf(l);
        return !d.length || d.indexOf(tonight) >= 0;
      });
      others = live.filter(function (l) { return mine.indexOf(l) < 0; });
    }

    host.innerHTML =
      "<summary><strong>Copilot</strong> <span class=\"gp-cp-n\">" +
        (tonight ? mine.length + " for " + esc(tonight) + " tonight" : live.length + " things worth a look") +
        (set.length ? " · " + set.length + " set aside" : "") + "</span>" +
        (active ? ' <span class="gp-cp-live">showing: ' + esc(active.title) + "</span>" : "") + "</summary>" +
      tonightBar() +
      '<div class="gp-cp-grid">' + mine.map(card).join("") + "</div>" +
      (others.length
        ? '<details class="gp-cp-set"><summary>' + others.length + " about the other decks</summary>" +
          '<div class="gp-cp-grid">' + others.map(card).join("") + "</div></details>"
        : "") +
      (set.length
        ? '<details class="gp-cp-set"><summary>' + set.length + " set aside</summary>" +
          '<div class="gp-cp-grid">' + set.map(card).join("") + "</div></details>"
        : "");

    /* The chip row. Every deck is offered whether or not it has a finding, with
       the count on it -- "Krenko 0" is an answer, and hiding the chip would make
       a clean deck look like a missing one. */
    function tonightBar() {
      var names = ((DATA && DATA.decks) || []).map(function (d) { return d.name; });
      if (names.length < 2) return "";
      var counts = {};
      names.forEach(function (n) {
        counts[n] = live.filter(function (l) { return decksOf(l).indexOf(n) >= 0; }).length;
      });
      return '<div class="gp-tonight" role="group" aria-label="Which deck are you playing tonight">' +
        '<span class="gp-tonight-lab">Playing tonight</span>' +
        names.map(function (n) {
          var on = tonight === n;
          return '<button type="button" class="gp-tonight-b' + (on ? " is-on" : "") +
            '" data-tonight="' + esc(n) + '" aria-pressed="' + on + '">' + esc(n) +
            ' <b>' + counts[n] + "</b></button>";
        }).join("") +
        (tonight
          ? '<button type="button" class="gp-tonight-b is-clear" data-tonight="">Any deck</button>'
          : "") +
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
    $("count").textContent = rows.length.toLocaleString() + " of " + DATA.cards.length.toLocaleString() + " cards";
    renderFacets();
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
    if (e.target.id === "q") { state.q = e.target.value.trim(); render(); }
  });
  document.addEventListener("click", function (e) {
    var tile = e.target.closest(".gp-card");
    if (tile && !tile.dataset.more) { openCard(tile.dataset.id); return; }
    var view = e.target.closest(".gp-view");
    if (view) { state.view = view.dataset.view; syncViews(); render(); return; }
    var more = e.target.closest("[data-more]");
    if (more) { state.showAll[more.dataset.more] = true; render(); return; }
    if (e.target.id === "clear") { state.f = {}; state.q = ""; state.mvMax = 20; state.showAll = {}; state.lens = null; $("q").value = ""; render(); return; }
    var grp = e.target.closest(".gp-group");
    if (grp) {
      var key = grp.dataset.group;
      groupState.only = key && groupState.only !== key ? key : null;
      render(); return;
    }
    var lensBtn = e.target.closest("[data-lens]");
    if (lensBtn) { applyLens(lensBtn.dataset.lens); return; }
    var pick = e.target.closest("[data-tonight]");
    if (pick) { setTonight(pick.dataset.tonight); renderLenses(); return; }
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
    var lock = e.target.closest("#click-focus");
    if (lock) {
      state.clickFocuses = !state.clickFocuses;
      lock.classList.toggle("is-on", state.clickFocuses);
      lock.setAttribute("aria-pressed", String(state.clickFocuses));
      return;
    }
    if (e.target.id === "pane-toggle") {
      var pane = $("pane"), open = !pane.hidden;
      pane.hidden = open; e.target.setAttribute("aria-expanded", String(!open));
    }
  });
  function syncViews() {
    document.querySelectorAll(".gp-view").forEach(function (b) { b.classList.toggle("is-on", b.dataset.view === state.view); });
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

  fetch("data/lenses.json", {cache: "no-store"})
    .then(function (r) { return r.ok ? r.json() : {lenses: []}; })
    .catch(function () { return {lenses: []}; })
    .then(function (j) { GRAPH_LENSES = (j && j.lenses) || []; mergeLenses(); });

  Promise.all([
    fetch("data/deck-ratings.json", {cache: "no-store"}).then(function (r) { return r.ok ? r.json() : null; }),
    fetch("data/master-v2.json", {cache: "no-store"}).then(function (r) { return r.ok ? r.json() : null; })
  ]).catch(function () { return [null, null]; })
    .then(function (parts) {
      var ratings = parts && parts[0];
      if (!ratings || !window.MtgSimLenses) return;
      SIM_LENSES = window.MtgSimLenses.build(ratings, {master: parts[1]});
      mergeLenses();
    });

  fetch("data/graph.json", {cache: "no-store"})
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (json) {
      DATA = json;
      indexCards();
      mergeLenses();     // sim lenses name decks; now there are cards to name
      if (window.matchMedia("(max-width: 860px)").matches) {
        $("pane").hidden = true;
        // Eleven findings is most of a phone screen before a single card shows.
        // Collapsed still announces the count, which is the part that matters.
        $("copilot").open = false;
      }
      render();
    })
    .catch(function (err) {
      $("count").textContent = "";
      $("result").innerHTML = '<p class="gp-empty">Could not load <code>data/graph.json</code> (' + esc(err.message) +
        "). Build it with <code>node graph/ingest/07-export-app.mjs</code>.</p>";
    });
})();
