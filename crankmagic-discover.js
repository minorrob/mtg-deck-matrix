/* Discover: the card graph, the filters that make 7,764 cards navigable, and the path
 * from "these cards go together" to "put them in a group".
 *
 * THE SHAPE OF THE PAGE. The graph on the left, as tall as the pane beside it; on the
 * right, the Card View -- the card in focus, as a card: its art, its text, its cost, and
 * the terms it is joined to other cards by, each of which is a filter you can tap. There
 * is no list of neighbours and no list of results: the graph IS the list, and a card you
 * want to read opens in the inspector pop-up. That was the reader's call and it is right;
 * a list beside a picture of the same thing is the picture admitting it is not enough.
 *
 * THREE WAYS TO NARROW, and they compose:
 *   The Filters pane   — ten card facets plus what you own, from crankmagic-facets.js,
 *                        with an any/all switch so "proliferate OR counters" is sayable.
 *   The focused card   — its own mechanics, roles and produces/requires, as chips in the
 *                        Card View. Tap "proliferate" with Atraxa in focus and the view
 *                        becomes the cards joined to her that way.
 *   The graph's reach  — depth (1-3 hops) and breadth (how many neighbours the focus
 *                        gets), because "show me the web" and "show me the six that
 *                        matter" are different questions.
 *
 * FILTERING NARROWS THE GRAPH ITSELF. CrankGraph.mount takes the card set it will draw
 * and walk, so a filtered view is a remount over the narrowed set: every hop you follow
 * stays inside the filter.
 *
 * AND THEN A GROUP. Switch to Select, tap the cards you want on the canvas, and "Add
 * selected to a group" writes them into a Collection group -- as planned entries, never
 * as a claim of ownership. Find the cards, keep the cards, without leaving the graph.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, button: b, actions, views, $, note, form, select: s} = C;
  let graph = null;
  /* Held across renders of this view so a filter survives following a card into the
     inspector and coming back. Cleared only by Clear filters. */
  let selection = {};
  let mode = 'all';            // within a facet: 'all' picks must match, or 'any'
  let depth = 2, breadth = 12; // the graph's reach, remembered like the filters
  let picking = false;         // select mode on the canvas
  let picked = new Set();      // card ids ticked on the canvas

  views.discover = async (params) => {
    C.main.innerHTML = C.head('The connected card catalog', 'Follow the possibilities.',
      'Explore relationships, inspect the evidence, and follow a card into your plans.')
      + '<p role="status">Loading graph metadata…</p>';

    const loaded = await C.catalog.loadGraph();
    if (C.route().view !== 'discover') return;

    /* The graph plus anything in the library it does not know about -- a card imported
       from a link, or one printed after the graph snapshot -- shaped like a graph row. */
    const data = {...loaded, cards: [...loaded.cards]};
    const names = new Set(data.cards.map((c) => c.name));
    for (const c of Object.values(C.state.cards)) {
      if (!names.has(c.name)) data.cards.push({...c, id: c.oracleId || c.id, type: c.typeLine, ci: (c.colorIdentity || []).join(''), image: c.image});
    }

    const wanted = C.catalog.get(params.get('card'));
    const facets = CrankFacets.available(C.state);
    const values = CrankFacets.values(data.cards, C.state);

    C.main.innerHTML = C.head('The connected card catalog', 'Follow the possibilities.',
      'Structural links and observed co-play are different kinds of evidence. Neither claims a simulated improvement.')
      + `<div class="cm-toolbar"><label class="cm-search">Find a card<input id="cm-graph-query" placeholder="Card name" list="cm-graph-names"><datalist id="cm-graph-names"></datalist></label>${C.select('Connections', 'edgeType', [['mechanic', 'Shared mechanics / roles'], ['played', 'EDHREC co-play']], 'mechanic')}${b('Search catalog / link', 'graph-lookup')}${b('Back', 'graph-back')}${b('Reset view', 'graph-reset')}</div>

      <details class="cm-details" id="cm-facet-details">
        <summary><strong>Filters</strong> <span id="cm-facet-summary" class="cm-muted"></span></summary>
        <div class="cm-facet-mode">
          <span class="cm-muted">Within a facet, a card must match</span>
          <label class="cm-checkbox"><input type="radio" name="facetMode" value="all" ${mode === 'all' ? 'checked' : ''}> all picks</label>
          <label class="cm-checkbox"><input type="radio" name="facetMode" value="any" ${mode === 'any' ? 'checked' : ''}> any pick</label>
        </div>
        <div class="cm-filter-panel" id="cm-facet-panel">${facets.map((facet) => {
          const rows = values[facet.key] || [];
          return `<details class="cm-details" data-facet="${e(facet.key)}">
            <summary>${e(facet.label)} <span class="cm-muted" data-facet-count="${e(facet.key)}"></span></summary>
            <div class="cm-facet-values">${rows.length > 40
              ? `<label class="cm-search"><span class="cm-muted">Filter ${e(facet.label.toLowerCase())}</span><input type="search" data-facet-search="${e(facet.key)}" placeholder="Type to narrow"></label>` : ''}
              <div class="cm-facet-list" data-facet-list="${e(facet.key)}">${rows.map((row) => `
                <label class="cm-checkbox" data-value="${e(String(row.value).toLowerCase())}"><input type="checkbox" data-facet-pick="${e(facet.key)}" value="${e(row.value)}"><span>${e(row.value)}</span> <small class="cm-muted">${row.count}</small></label>`).join('')}
              </div>
            </div>
          </details>`;
        }).join('')}</div>
      </details>

      <div class="cm-facet-status">
        <p role="status" id="cm-facet-count"></p>
        <div class="cm-actions" id="cm-facet-chips"></div>
        <div class="cm-graph-reach">
          <label>Depth <output id="cm-depth-out">${depth}</output><input type="range" id="cm-depth" min="1" max="3" step="1" value="${depth}" aria-label="How many hops from the focused card"></label>
          <label>Breadth <output id="cm-breadth-out">${breadth}</output><input type="range" id="cm-breadth" min="6" max="30" step="1" value="${breadth}" aria-label="How many neighbours the focused card gets"></label>
          <span class="cm-muted" id="cm-graph-size"></span>
        </div>
      </div>

      <p class="cm-muted cm-graph-hint">Pinch to zoom · drag to pan · tap a card to explore · double-tap to reset · zoom in to label the focus's connections and name the outer rings. With a mouse: wheel to zoom, arrow keys / + / − / 0.</p>
      <div class="cm-graph-grid cm-graph-grid-tall">
        <div class="cm-graph-col">
          <canvas class="cm-graph" id="cm-graph" tabindex="0" role="img" aria-label="Interactive card relationship graph. Drag to pan. Pinch or mouse wheel to zoom. Tap a card to explore it, or switch to Select to tick cards for a group. Keyboard arrows pan, plus and minus zoom, zero resets."></canvas>
        </div>
        <aside class="v-panel cm-card-view" id="cm-card-view" aria-live="polite"></aside>
      </div>`;

    const view = $('#cm-card-view');

    function mount(cards, focusId) {
      graph?.destroy();
      graph = CrankGraph.mount({
        canvas: $('#cm-graph'), cards, played: data.played, focus: focusId, depth, breadth,
        onNeighbors(c, neighbors, trailLength, info) {
          drawCardView(c, info);
          if (graph) { graph.setMode(picking ? 'select' : 'navigate'); graph.setSelected(picked); }
        },
        onPick(card, ids) { picked = ids; drawCardView(graph.current(), null, true); }
      });
    }

    /* THE CARD VIEW. What the old side lists could not be: the card itself. Art, cost,
       type, the printed text, and then the terms it is joined on -- each a filter. The
       catalog record has the text and the art; the graph row has the terms. */
    const TERM_FACET = {mechanics: 'mechanics', roles: 'roles', produces: 'produces', requires: 'requires', causes: 'causes', triggers: 'triggers', tribes: 'tribes'};
    let lastInfo = null, lastDrawn = '';
    function drawCardView(c, info, keepInfo) {
      if (!keepInfo) lastInfo = info;
      /* Same card, same picture, same picks: leave the pane alone. Rewriting it moves the
         canvas beside it, which re-lays out the graph, which calls back here. */
      const key = JSON.stringify([c && c.id, lastInfo && [lastInfo.total, lastInfo.byDepth, lastInfo.crossLinks], picking, [...picked].sort(), selection, keepInfo ? Date.now() : 0]);
      if (!keepInfo && key === lastDrawn) return;
      lastDrawn = key;
      if (!c) { view.innerHTML = '<h2>Nothing matches</h2><p>No card carries the filters you have picked.</p>'; $('#cm-graph-size').textContent = ''; return; }
      const rec = C.catalog.exact(c.name) || {};
      const t = CrankGraph.termsOf(c);
      const chips = [];
      if (t) for (const [group, key] of Object.entries(TERM_FACET)) {
        for (const value of t[group] || []) {
          const on = (selection[key] || []).includes(value);
          chips.push(`<button class="cm-chip${on ? ' is-on' : ''}" data-action="facet-term" data-key="${e(key)}" data-value="${e(value)}" aria-pressed="${on}">${e(value)}<small>${e(CrankFacets.FACETS.find((f) => f.key === key)?.label || key)}</small></button>`);
        }
      }
      const img = rec.image || c.image || '';
      const cost = rec.manaCost ? C.mana(rec.manaCost) : '';
      view.innerHTML = `
        <div class="cm-card-view-head">
          ${img ? `<img class="cm-card-view-art" src="${e(img)}" alt="" loading="lazy">` : '<div class="cm-card-view-art cm-card-view-blank"></div>'}
          <div class="cm-card-view-title">
            <h2>${e(c.name)}</h2>
            <p>${e(rec.typeLine || c.type || '')}</p>
            <p class="cm-card-view-cost">${cost} ${C.colors(String(c.ci || (rec.colorIdentity || []).join('')).split(''))}</p>
            ${rec.rarity || rec.setName ? `<p class="cm-muted">${e([rec.rarity, rec.setName].filter(Boolean).join(' · '))}${Number.isFinite(rec.price) && rec.price > 0 ? ` · ${e(C.money(rec.price))}` : ''}</p>` : ''}
          </div>
        </div>
        ${rec.oracleText ? `<p class="cm-oracle cm-card-view-oracle">${e(rec.oracleText)}</p>` : ''}
        <div class="cm-actions">${b('Inspect card', 'card', {card: CrankCatalog.key(c.name)}, true)}<button class="v-button${picking ? ' is-on' : ''}" data-action="graph-pickmode" aria-pressed="${picking}">${picking ? 'Selecting: tap cards' : 'Select cards'}</button></div>
        ${picked.size ? `<div class="cm-actions cm-pick-actions">${b(`Add ${picked.size} selected to a group…`, 'results-group', {}, true)}${b('Clear selection', 'results-clear')}</div>` : (picking ? '<p class="cm-muted">Tap cards on the graph to tick them. Tap again to untick.</p>' : '')}
        ${chips.length ? `<h3>Joined to other cards by</h3><p class="cm-muted">Tap one to filter the graph to cards that share it.</p><div class="cm-term-chips">${chips.join('')}</div>` : ''}
        ${lastInfo && lastInfo.total ? `<p class="cm-muted cm-card-view-foot">${lastInfo.total} cards on the canvas · ${lastInfo.byDepth.filter(Boolean).join(' / ')} by ring · ${lastInfo.crossLinks} cross-links</p>` : ''}`;
      $('#cm-graph-size').textContent = lastInfo && lastInfo.total ? `${lastInfo.total} on canvas` : '';
    }

    /* One place decides what the filtered world is; the count, the chips and the graph
       are all drawn from it. */
    function refresh(keepFocus) {
      const shown = CrankFacets.apply(data.cards, selection, C.state, {any: mode === 'any'});
      const picks = CrankFacets.count(selection);
      $('#cm-facet-count').textContent = picks
        ? `${shown.length.toLocaleString()} of ${data.cards.length.toLocaleString()} cards match ${picks} filter${picks === 1 ? '' : 's'}${picks > 1 ? ` (${mode} within a facet)` : ''}.`
        : `${data.cards.length.toLocaleString()} cards. Narrow them with Filters, with the focused card's own terms, or search for one by name.`;
      $('#cm-facet-summary').textContent = picks ? `· ${picks} applied · ${shown.length.toLocaleString()} cards` : '· none applied';
      $('#cm-facet-chips').innerHTML = CrankFacets.chips(selection)
        .map((chip) => `<button class="cm-chip" data-action="facet-drop" data-key="${e(chip.key)}" data-value="${e(chip.value)}">${e(chip.label)}: ${e(chip.value)} <span aria-hidden="true">×</span><span class="cm-visually-hidden"> — remove this filter</span></button>`)
        .join('') + (picks ? b('Clear filters', 'facet-clear') : '');
      for (const facet of facets) {
        const n = (selection[facet.key] || []).length;
        const label = $(`[data-facet-count="${facet.key}"]`);
        if (label) label.textContent = n ? `· ${n}` : '';
      }
      const keep = keepFocus && shown.some((c) => c.id === keepFocus);
      if (shown.length) mount(shown, keep ? keepFocus : shown[0].id);
      else { graph?.destroy(); graph = null; drawCardView(null, null); }
    }

    const startFocus = data.cards.find((c) => c.name === wanted?.name)
      || data.cards.find((c) => c.name === 'Atraxa, Praetors’ Voice' || c.name === "Atraxa, Praetors' Voice")
      || data.cards.find((c) => c.name === 'Krenko, Mob Boss')
      || data.cards[0];
    refresh(startFocus?.id);

    const currentFocus = () => graph?.current()?.id;

    /* Delegated: refresh() rewrites these regions, so listeners bound to nodes would not survive. */
    $('#cm-facet-panel').addEventListener('change', (ev) => {
      const key = ev.target.dataset?.facetPick; if (!key) return;
      selection = CrankFacets.toggle(selection, key, ev.target.value); refresh(currentFocus());
    });
    $('#cm-facet-panel').addEventListener('input', (ev) => {
      const key = ev.target.dataset?.facetSearch; if (!key) return;
      const q = ev.target.value.trim().toLowerCase();
      for (const row of $(`[data-facet-list="${key}"]`).querySelectorAll('[data-value]')) row.hidden = Boolean(q) && !row.dataset.value.includes(q);
    });
    $('#cm-facet-details').addEventListener('change', (ev) => { if (ev.target.name === 'facetMode') { mode = ev.target.value; refresh(currentFocus()); } });
    $('#cm-depth').addEventListener('input', (ev) => { depth = Number(ev.target.value); $('#cm-depth-out').textContent = depth; graph?.setDepth(depth); });
    $('#cm-breadth').addEventListener('input', (ev) => { breadth = Number(ev.target.value); $('#cm-breadth-out').textContent = breadth; graph?.setBreadth(breadth); });

    actions['facet-drop'] = (el) => { selection = CrankFacets.toggle(selection, el.dataset.key, el.dataset.value); redrawTicks(); refresh(currentFocus()); };
    actions['facet-term'] = (el) => { selection = CrankFacets.toggle(selection, el.dataset.key, el.dataset.value); redrawTicks(); refresh(currentFocus()); };
    actions['facet-clear'] = () => { selection = {}; redrawTicks(); refresh(currentFocus()); };
    actions['graph-pickmode'] = () => { picking = !picking; graph?.setMode(picking ? 'select' : 'navigate'); drawCardView(graph?.current(), null, true); };
    actions['results-clear'] = () => { picked = new Set(); graph?.setSelected(picked); drawCardView(graph?.current(), null, true); };

    /* FIND THE CARDS, KEEP THE CARDS. A group is a plan, not a claim of ownership: these
       land as planned entries, exactly as an imported list does. */
    actions['results-group'] = () => {
      const chosen = [...picked].map((id) => data.cards.find((c) => c.id === id)).filter(Boolean);
      if (!chosen.length) throw Error('Switch to Select and tap at least one card on the graph first.');
      form(`Add ${chosen.length} card${chosen.length === 1 ? '' : 's'} to a group`,
        `${s('Collection group', 'group', [['', 'Create a new group'], ...C.state.groups.map((g) => [g.id, g.name])], '')}${C.field('New group name', 'name', 'From the graph')}<div class="cm-full">${note('Planned entries only. Nothing here says you own a copy.')}<p class="cm-muted">${chosen.slice(0, 12).map((c) => e(c.name)).join(' · ')}${chosen.length > 12 ? ` · and ${chosen.length - 12} more` : ''}</p></div>`,
        async (v) => {
          const cards = chosen.map((c) => C.catalog.exact(c.name)).filter(Boolean);
          if (cards.length !== chosen.length) throw Error('Some cards could not be matched to the catalog. Try Inspect card on them first.');
          const gid = v.group || 'group:' + C.uid();
          const commands = [];
          if (!v.group) commands.push({type: 'createGroup', groupId: gid, name: v.name || 'From the graph'});
          commands.push({type: 'groupEntries', groupId: gid, cards, entries: cards.map((c) => ({cardId: c.id, quantity: 1}))});
          await C.commit({type: 'batch', commands, summary: `Added ${cards.length} card${cards.length === 1 ? '' : 's'} to a Collection group`}, {renderView: false});
          picked = new Set(); graph?.setSelected(picked); drawCardView(graph?.current(), null, true);
        }, 'Add to group');
    };

    function redrawTicks() {
      for (const box of $('#cm-facet-panel').querySelectorAll('[data-facet-pick]')) box.checked = (selection[box.dataset.facetPick] || []).includes(box.value);
    }

    $('#cm-graph-query').addEventListener('input', (ev) => {
      const q = ev.target.value.toLowerCase();
      const hits = data.cards.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
      $('#cm-graph-names').innerHTML = hits.map((c) => `<option value="${e(c.name)}"></option>`).join('');
      const exact = data.cards.find((c) => c.name.toLowerCase() === q);
      if (exact) graph?.select(exact.id);
    });
    $('[name=edgeType]').addEventListener('change', (ev) => graph?.setType(ev.target.value));

    return () => { graph?.destroy(); graph = null; };
  };

  actions['graph-lookup'] = () => C.cardPicker('Find a card to explore', async (c) => {
    if (!C.state.cards[c.id]) await C.commit({type: 'cards', cards: [c]}, {renderView: false});
    C.$('#cm-dialog').close();
    C.go('discover', {card: c.id});
  });
  actions['graph-card'] = (el) => graph?.select(el.dataset.id);
  actions['graph-back'] = () => graph?.back();
  actions['graph-reset'] = () => graph?.reset();
});
