/* The control plane over data/graph.json.
 *
 * One filter state drives both views. The list renders every match; the graph
 * renders ONE card's neighbourhood, because 1,500 nodes on a canvas is a hairball
 * that tells you nothing. Picking a card in the list is what chooses the centre.
 */
(function () {
  "use strict";

  var DATA = null, LENSES = [], EGO = null, CY = null;
  var state = {q: "", mvMax: 20, view: "list", f: {}, showAll: {}, clickFocuses: false, lens: null};
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); };

  // Which card fields a facet reads. Array-valued fields match if ANY selected
  // value is present; scalars match exactly. Colour is the exception -- a card
  // passes only if its identity is a SUBSET of what you ticked, because that is
  // what "legal in these colours" means, not "mentions this colour".
  var FACETS = [
    {key: "roles",     label: "Role",       from: function (c) { return c.roles; }},
    // Colour identity, with the semantics a deckbuilder wants: "legal in a deck of
    // these colours". A colourless card is legal in every deck, so it passes any
    // selection -- ticking C on its own is the way to isolate colourless.
    {key: "colors", label: "Colour", from: function (c) { return c.ci ? c.ci.split("") : ["C"]; },
     match: function (have, picked) {
       var colourless = have.length === 1 && have[0] === "C";
       if (colourless) return true;
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
    // for something you can still pick -- the standard faceted-search behaviour.
    var pool = DATA.cards.filter(function (c) { return matches(c, facet.key); });
    var counts = {};
    pool.forEach(function (c) { c._f[facet.key].forEach(function (v) { if (v) counts[v] = (counts[v] || 0) + 1; }); });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || String(a).localeCompare(b); })
      .map(function (v) { return {value: v, n: counts[v]}; });
  }

  // Role, Colour and Ownership are the three you reach for first, so they start
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

  /* Tapping a node shows the card. Re-centring lives INSIDE the popup as a button.
     A lock toggle would make the common act -- "what is this card?" -- require a
     mode change, and a mode is a cost paid on every click. Right-click and
     long-press were the other candidates and both fail on a phone, which is where
     this gets used. Double-click still re-centres directly for speed, and the
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
          '<p class="gp-modal-facts">' + (c.mv || 0) + " mana value &middot; " + esc(c.ci || "colourless") +
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
      if (f) { EGO = f.dataset.focus; state.view = "graph"; syncViews(); closeCard(); render(); }
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
  function neighbours(ego, pool) {
    var byId = {}; pool.forEach(function (c) { byId[c.id] = c; });
    var inFilter = {}; pool.forEach(function (c) { inFilter[c.id] = 1; });
    var out = [], seen = {};
    function add(card, label, weight) {
      if (!card || card.id === ego.id) return;
      var k = card.id + "|" + label;
      if (seen[k]) return; seen[k] = 1;
      out.push({card: card, label: label, weight: weight});
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
    return out.sort(function (a, b) { return b.weight - a.weight; }).slice(0, 90);
  }

  function renderGraph(rows) {
    var host = $("cy");
    if (!EGO) { EGO = (rows[0] || DATA.cards[0]).id; }
    var ego = DATA.cards.filter(function (c) { return c.id === EGO; })[0];
    if (!ego) { host.innerHTML = ""; return; }
    var near = neighbours(ego, DATA.cards);
    var shown = {}; rows.forEach(function (c) { shown[c.id] = 1; });
    $("legend").hidden = false;
    $("legend").innerHTML = "Centre: <strong>" + esc(ego.name) + "</strong>. " + near.length +
      " connected cards. Edges name what joins them &mdash; a shared event, a role one needs and the other supplies, or EDHREC co-play. Faded nodes fall outside your current filters. Click any node to re-centre.";
    if (!window.cytoscape) { host.innerHTML = '<p class="gp-empty">Graph library did not load.</p>'; return; }

    var els = [{data: {id: ego.id, label: ego.name, img: ego.image, ego: 1}}];
    near.forEach(function (n) {
      els.push({data: {id: n.card.id, label: n.card.name, img: n.card.image, dim: shown[n.card.id] ? 0 : 1}});
      els.push({data: {id: ego.id + ">" + n.card.id + n.label, source: ego.id, target: n.card.id, label: n.label, w: n.weight}});
    });
    if (CY) { CY.destroy(); CY = null; }
    CY = window.cytoscape({
      container: host, elements: els,
      style: [
        {selector: "node", style: {
          "background-image": "data(img)", "background-fit": "cover", "background-color": "#ece4d0",
          width: 40, height: 56, shape: "round-rectangle", label: "data(label)",
          "font-size": 7, "text-valign": "bottom", "text-margin-y": 3, color: "#586761",
          "text-max-width": 66, "text-wrap": "ellipsis", "border-width": 1, "border-color": "#dcd2b9"}},
        {selector: "node[dim = 1]", style: {opacity: 0.32}},
        {selector: "node[ego]", style: {width: 66, height: 92, "border-width": 3, "border-color": "#dda01c", "font-size": 9, color: "#16221d"}},
        {selector: "edge", style: {
          width: "mapData(w, 1, 4, 1, 3)", "line-color": "#c9bfa6", "curve-style": "bezier",
          label: "data(label)", "font-size": 6, color: "#8b8371", "text-rotation": "autorotate",
          "target-arrow-shape": "none"}}
      ],
      layout: {name: "concentric", concentric: function (n) { return n.data("ego") ? 10 : 1; },
               levelWidth: function () { return 1; }, minNodeSpacing: 22, padding: 24},
      wheelSensitivity: 0.2
    });
    CY.on("tap", "node", function (evt) {
      var id = evt.target.id();
      if (state.clickFocuses) { EGO = id; render(); } else openCard(id);
    });
    CY.on("dbltap", "node", function (evt) { closeCard(); EGO = evt.target.id(); render(); });
  }

  /* The copilot hands over a filter and the reason for it. It never picks a card
     and never edits a deck, so a lens you disagree with costs one click to drop.
     Each one is generated from a query, so a finding that stops being true stops
     appearing rather than sitting here being wrong. */
  var KIND = {warning: "Warning", attention: "Worth a look", opportunity: "Opportunity"};

  function renderLenses() {
    var host = $("copilot");
    if (!LENSES.length) { host.hidden = true; return; }
    host.hidden = false;
    var active = state.lens;
    host.innerHTML =
      "<summary><strong>Copilot</strong> <span class=\"gp-cp-n\">" + LENSES.length + " things worth a look</span>" +
        (active ? ' <span class="gp-cp-live">showing: ' + esc(active.title) + "</span>" : "") + "</summary>" +
      '<div class="gp-cp-grid">' + LENSES.map(function (l) {
        var on = active && active.id === l.id;
        return '<div class="gp-cp gp-cp-' + esc(l.kind) + (on ? " is-on" : "") + '">' +
          '<span class="gp-cp-kind">' + esc(KIND[l.kind] || l.kind) + "</span>" +
          "<b>" + esc(l.title) + "</b>" +
          "<p>" + esc(l.why) + "</p>" +
          '<p class="gp-cp-ev">' + esc(l.evidence) + "</p>" +
          '<button class="gp-btn' + (on ? "" : " primary") + '" data-lens="' + esc(l.id) + '" type="button">' +
            (on ? "Clear this lens" : "Show these " + l.count) + "</button></div>";
      }).join("") + "</div>";
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
    var lensBtn = e.target.closest("[data-lens]");
    if (lensBtn) { applyLens(lensBtn.dataset.lens); return; }
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

  // Lenses are optional: the page is fully usable without them, so a missing or
  // stale lenses.json must never stop the cards loading.
  fetch("data/lenses.json", {cache: "no-store"})
    .then(function (r) { return r.ok ? r.json() : {lenses: []}; })
    .catch(function () { return {lenses: []}; })
    .then(function (j) {
      LENSES = (j && j.lenses) || [];
      if (DATA) renderLenses();          // the two fetches race; whoever lands second paints
    });

  fetch("data/graph.json", {cache: "no-store"})
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (json) {
      DATA = json;
      indexCards();
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
