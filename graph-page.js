/* The control plane over data/graph.json.
 *
 * One filter state drives both views. The list renders every match; the graph
 * renders ONE card's neighbourhood, because 1,500 nodes on a canvas is a hairball
 * that tells you nothing. Picking a card in the list is what chooses the centre.
 */
(function () {
  "use strict";

  var DATA = null, EGO = null, CY = null;
  var state = {q: "", mvMax: 20, view: "list", f: {}, showAll: {}};
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); };

  // Which card fields a facet reads. Array-valued fields match if ANY selected
  // value is present; scalars match exactly. Colour is the exception -- a card
  // passes only if its identity is a SUBSET of what you ticked, because that is
  // what "legal in these colours" means, not "mentions this colour".
  var FACETS = [
    {key: "roles",     label: "Role",       from: function (c) { return c.roles; }},
    {key: "colors",    label: "Colour",     from: function (c) { return c.ci ? c.ci.split("") : ["C"]; }, subset: true},
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
    if (state.q && card._search.indexOf(state.q.toLowerCase()) < 0) return false;
    if (Number(card.mv || 0) > state.mvMax) return false;
    for (var i = 0; i < FACETS.length; i++) {
      var f = FACETS[i];
      if (f.key === skipKey) continue;               // for counting a facet's own options
      var picked = state.f[f.key];
      if (!picked || !picked.length) continue;
      var have = card._f[f.key];
      if (f.subset) { if (!have.every(function (v) { return picked.indexOf(v) >= 0; })) return false; }
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
    CY.on("tap", "node", function (evt) { EGO = evt.target.id(); render(); });
  }

  function render() {
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
    if (tile) { EGO = tile.dataset.id; state.view = "graph"; syncViews(); render(); return; }
    var view = e.target.closest(".gp-view");
    if (view) { state.view = view.dataset.view; syncViews(); render(); return; }
    var more = e.target.closest("[data-more]");
    if (more) { state.showAll[more.dataset.more] = true; render(); return; }
    if (e.target.id === "clear") { state.f = {}; state.q = ""; state.mvMax = 20; state.showAll = {}; $("q").value = ""; render(); return; }
    if (e.target.id === "pane-toggle") {
      var pane = $("pane"), open = !pane.hidden;
      pane.hidden = open; e.target.setAttribute("aria-expanded", String(!open));
    }
  });
  function syncViews() {
    document.querySelectorAll(".gp-view").forEach(function (b) { b.classList.toggle("is-on", b.dataset.view === state.view); });
  }

  fetch("data/graph.json", {cache: "no-store"})
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (json) {
      DATA = json;
      indexCards();
      if (window.matchMedia("(max-width: 860px)").matches) $("pane").hidden = true;
      render();
    })
    .catch(function (err) {
      $("count").textContent = "";
      $("result").innerHTML = '<p class="gp-empty">Could not load <code>data/graph.json</code> (' + esc(err.message) +
        "). Build it with <code>node graph/ingest/07-export-app.mjs</code>.</p>";
    });
})();
