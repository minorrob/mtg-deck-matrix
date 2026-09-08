/* Discover: the card graph, and the filters that make 7,764 cards navigable.
 *
 * The graph alone can only show you the neighbourhood of a card you can already name.
 * That is a fine tool for "what goes with Yuriko" and a useless one for "show me the
 * black Rats I do not own yet" -- which is the question a deckbuilder actually has. The
 * previous app's graph page carried twelve facets for exactly that reason; they are back
 * here, driven by crankmagic-facets.js, which does the counting and matching and is
 * tested in Node without a browser.
 *
 * FILTERING NARROWS THE GRAPH ITSELF, not just a list beside it. CrankGraph.mount takes
 * the card set it will draw and search for neighbours within, so a filtered view is a
 * remount over the narrowed set: the links you can follow are links between cards that
 * passed the filter. A filter that only greyed out tiles would still walk you into cards
 * you had just excluded.
 *
 * MOBILE. The pane is a <details> per facet inside a responsive grid, closed by default,
 * with each value list scrolling inside its own box. On a phone the canvas is 390px tall
 * and the graph grid is one column, so the matching-card list under the count matters
 * more than the canvas does -- it is the part you can actually use with a thumb, and it
 * is why the results are a list and not only a picture.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, button: b, actions, views, $} = C;
  let graph = null;
  /* Held across renders of this view so a filter survives following a card into the
     inspector and coming back. Cleared only by Clear filters. */
  let selection = {};

  views.discover = async (params) => {
    C.main.innerHTML = C.head('The connected card catalog', 'Follow the possibilities.',
      'Explore relationships, inspect the evidence, and follow a card into your plans.')
      + '<p role="status">Loading graph metadata…</p>';

    const loaded = await C.catalog.loadGraph();
    if (C.route().view !== 'discover') return;

    /* The graph plus anything in the library it does not know about -- a card imported
       from a link, or one printed after the graph snapshot. Shaped like a graph row so
       the facets and the canvas can read it without a special case. */
    const data = {...loaded, cards: [...loaded.cards]};
    const names = new Set(data.cards.map((c) => c.name));
    for (const c of Object.values(C.state.cards)) {
      if (!names.has(c.name)) {
        data.cards.push({...c, id: c.oracleId || c.id, type: c.typeLine, ci: (c.colorIdentity || []).join('')});
      }
    }

    const wanted = C.catalog.get(params.get('card'));
    const facets = CrankFacets.available(C.state);
    const values = CrankFacets.values(data.cards, C.state);

    C.main.innerHTML = C.head('The connected card catalog', 'Follow the possibilities.',
      'Structural links and observed co-play are different kinds of evidence. Neither claims a simulated improvement.')
      + `<div class="cm-toolbar"><label class="cm-search">Find a card<input id="cm-graph-query" placeholder="Card name" list="cm-graph-names"><datalist id="cm-graph-names"></datalist></label>${C.select('Connections', 'edgeType', [['mechanic', 'Shared mechanics / roles'], ['played', 'EDHREC co-play']], 'mechanic')}${b('Search catalog / link', 'graph-lookup')}${b('Back', 'graph-back')}${b('Reset view', 'graph-reset')}</div>

      <details class="cm-details" id="cm-facet-details">
        <summary><strong>Filters</strong> <span id="cm-facet-summary" class="cm-muted"></span></summary>
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
      <div class="cm-facet-status"><p role="status" id="cm-facet-count"></p><div class="cm-actions" id="cm-facet-chips"></div></div>

      <div class="cm-graph-grid">
        <div>
          <canvas class="cm-graph" id="cm-graph" tabindex="0" role="img" aria-label="Interactive card relationship graph. Drag to pan. Pinch or mouse wheel to zoom. Keyboard arrows pan, plus and minus zoom, zero resets. Use the adjacent card list for navigation."></canvas>
          <!-- The focused card and its Inspect button sit DIRECTLY under the canvas. They
               used to live in the right-hand panel, which is fine on a desktop and wrong
               on a phone: the grid collapses to one column there, so everything in the
               left column came first and the reader had to scroll past the whole result
               list to inspect the card they had just tapped. The control that acts on the
               selection belongs beside the selection. -->
          <div class="cm-graph-focus" id="cm-graph-focus"></div>
          <p class="cm-muted">Pinch to zoom · drag to pan · tap a card to explore · double-tap to reset. With a mouse: wheel to zoom, and arrow keys / + / − / 0 also work. Zoom in to label each line with why the two cards are joined.</p>
        </div>
        <aside class="v-panel">
          <h3>Follow a connection</h3>
          <div class="cm-neighbors" id="cm-graph-neighbors"></div>
          <h3>Matching cards</h3>
          <div class="cm-neighbors" id="cm-facet-results"></div>
        </aside>
      </div>`;

    const focusPanel = $('#cm-graph-focus'), neighborPanel = $('#cm-graph-neighbors');

    function mount(cards, focusId) {
      graph?.destroy();
      graph = CrankGraph.mount({
        canvas: $('#cm-graph'), cards, played: data.played, focus: focusId,
        onNeighbors(c, neighbors) {
          focusPanel.innerHTML = `<div><h2>${e(c?.name || 'No card')}</h2><p>${e(c?.type || '')} ${C.colors(String(c?.ci || '').split(''))}</p></div><div class="cm-actions">${c ? b('Inspect card', 'card', {card: CrankCatalog.key(c.name)}) : ''}</div>`;
          const groups = new Map();
          for (const n of neighbors) {
            const kind = n.kind || 'Related';
            if (!groups.has(kind)) groups.set(kind, []);
            groups.get(kind).push(n);
          }
          neighborPanel.innerHTML = [...groups.entries()].map(([kind, rows]) =>
            `<h4 class="cm-edge-kind">${e(kind)} <span class="cm-muted">${rows.length}</span></h4>`
            + rows.map((n) => `<button data-action="graph-card" data-id="${e(n.card.id)}">${e(n.card.name)}<small>${e(n.reason)}</small></button>`).join('')
          ).join('') || '<p>No captured links of this type. Try another relationship or card.</p>';
        }
      });
    }

    /* One place decides what the filtered world is, and everything -- the count, the
       chips, the result list and the graph itself -- is drawn from it. */
    function refresh(keepFocus) {
      const shown = CrankFacets.apply(data.cards, selection, C.state);
      const picks = CrankFacets.count(selection);

      $('#cm-facet-count').textContent = picks
        ? `${shown.length.toLocaleString()} of ${data.cards.length.toLocaleString()} cards match ${picks} filter${picks === 1 ? '' : 's'}.`
        : `${data.cards.length.toLocaleString()} cards. Narrow them with Filters, or search for one by name.`;

      $('#cm-facet-summary').textContent = picks ? `· ${picks} applied · ${shown.length.toLocaleString()} cards` : '· none applied';

      $('#cm-facet-chips').innerHTML = CrankFacets.chips(selection)
        .map((chip) => `<button class="cm-chip" data-action="facet-drop" data-key="${e(chip.key)}" data-value="${e(chip.value)}">${e(chip.label)}: ${e(chip.value)} <span aria-hidden="true">×</span><span class="cm-visually-hidden"> — remove this filter</span></button>`)
        .join('') + (picks ? b('Clear filters', 'facet-clear') : '');

      for (const facet of facets) {
        const n = (selection[facet.key] || []).length;
        const label = $(`[data-facet-count="${facet.key}"]`);
        if (label) label.textContent = n ? `· ${n}` : '';
      }

      /* The graph must never offer a card the filter excluded, so it is remounted over
         the narrowed set. If the card in focus did not survive, focus the first that
         did rather than showing an empty canvas. */
      const keep = keepFocus && shown.some((c) => c.id === keepFocus);
      if (shown.length) {
        mount(shown, keep ? keepFocus : shown[0].id);
      } else {
        graph?.destroy();
        graph = null;
        focusPanel.innerHTML = '<h2>Nothing matches</h2><p>No card carries every filter you have picked.</p>';
        neighborPanel.innerHTML = '';
      }

      $('#cm-facet-results').innerHTML = shown.slice(0, 60)
        .map((c) => `<button data-action="graph-card" data-id="${e(c.id)}">${e(c.name)}<small>${e(c.type || '')}</small></button>`).join('')
        || '<p>Clear a filter to see cards again.</p>';
      if (shown.length > 60) {
        $('#cm-facet-results').insertAdjacentHTML('beforeend',
          `<p class="cm-muted">Showing the first 60 of ${shown.length.toLocaleString()}. Narrow further to see the rest.</p>`);
      }
    }

    const startFocus = data.cards.find((c) => c.name === wanted?.name)
      || data.cards.find((c) => c.name === 'Atraxa, Praetors’ Voice' || c.name === "Atraxa, Praetors' Voice")
      || data.cards.find((c) => c.name === 'Krenko, Mob Boss')
      || data.cards[0];
    refresh(startFocus?.id);

    /* Delegated, because refresh() rewrites the chip row and the graph's own panels on
       every change; listeners bound to those nodes would not survive. */
    $('#cm-facet-panel').addEventListener('change', (ev) => {
      const key = ev.target.dataset?.facetPick;
      if (!key) return;
      selection = CrankFacets.toggle(selection, key, ev.target.value);
      refresh(graph ? undefined : null);
    });

    $('#cm-facet-panel').addEventListener('input', (ev) => {
      const key = ev.target.dataset?.facetSearch;
      if (!key) return;
      const q = ev.target.value.trim().toLowerCase();
      for (const row of $(`[data-facet-list="${key}"]`).querySelectorAll('[data-value]')) {
        row.hidden = Boolean(q) && !row.dataset.value.includes(q);
      }
    });

    actions['facet-drop'] = (el) => { selection = CrankFacets.toggle(selection, el.dataset.key, el.dataset.value); redrawTicks(); refresh(); };
    actions['facet-clear'] = () => { selection = {}; redrawTicks(); refresh(); };

    /* A chip removed has to untick the box it came from, or the pane and the chips
       disagree about what is filtered and the reader believes the pane. */
    function redrawTicks() {
      for (const box of $('#cm-facet-panel').querySelectorAll('[data-facet-pick]')) {
        box.checked = (selection[box.dataset.facetPick] || []).includes(box.value);
      }
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
