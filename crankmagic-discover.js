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
 *                        Card View. Tap "counter" with Atraxa in focus and the view
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

  /* PRESENTATION MODE.
   *
   * The graph is the thing on this page, and on a laptop it was getting a third of the
   * screen: a 180px nav rail, a page title and its subtitle, a hint paragraph, and a
   * 405px card pane all took their cut first. None of that is wrong when you are reading;
   * all of it is in the way when you are exploring.
   *
   * So one button gives the canvas the room. The nav collapses, the title and its
   * subtitle go (the eyebrow stays, so the page still says where you are), the search and
   * filter rows rise to sit under it, the card pane halves and stacks its art above the
   * text instead of beside it, and the canvas grows to fill what that frees. Everything
   * the mode is for stays reachable at full function -- search, filters, the three tap
   * modes, the card's identity and the terms it is joined by. Nothing is hidden that you
   * would have to leave the mode to get back.
   *
   * It is a toggle, not a drag: two states a reader can predict beat a continuum they
   * have to manage. The class goes on the app root because the nav rail it collapses
   * lives outside this view.
   */
  let stage = false, tools = false;
  const STAGE_ICONS = {
    on: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 1.8H1.8V6M10 1.8h4.2V6M6 14.2H1.8V10M10 14.2h4.2V10"/></svg>',
    off: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M1.8 5.6H6V1.4M14.2 5.6H10V1.4M1.8 10.4H6v4.2M14.2 10.4H10v4.2"/></svg>'
  };
  const stageButton = () => `<button type="button" class="cm-stage-btn" data-action="graph-stage"
    aria-pressed="${stage}" aria-label="${stage ? 'Restore the default layout' : 'Give the graph the screen'}"
    title="${stage ? 'Restore the default layout' : 'Give the graph the screen'}">${stage ? STAGE_ICONS.off : STAGE_ICONS.on}</button>`;
  const TOOLS_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 4.5h12M2 8h12M2 11.5h12"/><circle cx="5.5" cy="4.5" r="1.6" fill="currentColor" stroke="none"/><circle cx="10.5" cy="8" r="1.6" fill="currentColor" stroke="none"/><circle cx="6.5" cy="11.5" r="1.6" fill="currentColor" stroke="none"/></svg>';
  /* Collapsed by default once the mode is on: a reader who asked for the canvas to have the
     screen did not ask to keep looking at a search box they are not typing in. One click
     brings both rows back, and the button stays put so the way back is where it was. */
  const toolsButton = () => `<button type="button" class="cm-tools-toggle" data-action="graph-tools"
    aria-expanded="${tools}" aria-controls="cm-facet-bar"
    aria-label="${tools ? 'Hide search and filters' : 'Show search and filters'}"
    title="${tools ? 'Hide search and filters' : 'Show search and filters'}">${TOOLS_ICON}</button>`;
  const applyStage = () => {
    const root = document.getElementById('matrix-v2');
    root?.classList.toggle('cm-stage', stage);
    root?.classList.toggle('cm-tools-open', stage && tools);
  };
  let graph = null;
  /* Held across renders of this view so a filter survives following a card into the
     inspector and coming back. Cleared only by Clear filters. */
  let selection = {};
  let mode = 'all';            // within a facet: 'all' picks must match, or 'any'
  let depth = 2, breadth = 12; // the graph's reach, remembered like the filters
  let gmode = 'navigate';      // what a tap on the canvas does: navigate, inspect or select
  let picked = new Set();      // card ids ticked on the canvas, or in the List tab
  /* THE PANE HAS TWO TABS. Card Info is the pane as it was; List is every card the focus
     reaches at the widest depth and breadth, whatever the sliders say -- the sliders shape
     the picture, the list is the whole neighbourhood -- under the same filters, sortable by
     its column headers, paged, with a tick per row for batch work and Add/Buy on each. It
     is remembered across focus changes; the pane widens while it is open and the canvas
     keeps the rest. */
  let paneTab = 'card', listSort = {key: 'ring', dir: 1}, listPage = 0, listCard = null, lastFocusId = null, landRows = [], revealCard = false;
  /* LOOPS ONLY: the depth gauge walks only the joins that continue or pay off a loop. It follows
     the deck pick -- a deck is a question about its loops, the open graph a question about
     everything -- until the reader sets it by hand, and Clear filters hands it back. */
  let loopMode = false, loopTouched = false, deckPicked = false, lastWorld = [], loopsCache = {key: '', loops: []};
  const LIST_PAGE = 40;

  /* Below this many single-card values the fold costs more than it saves: a toggle to
     hide four rows is noise. Mechanic has 304 of them; everything shorter is left whole.
     Module scope, because the panel's markup reads it long before the view's body runs. */
  const FOLD_TAIL = 12;

  views.discover = async (params) => {
    C.HELP.discover = {title: 'Discover', body: '<p>The connected card catalog: follow a card into the cards it is joined to, inspect the evidence for each link, and take what you find into a group or a deck.</p><p>Structural links (shared mechanics and roles) and observed co-play (EDHREC) are different kinds of evidence. Neither claims a simulated improvement.</p><p>In the card pane and the pop-ups, the term with the gold ring is the card’s <strong>Primary Purpose</strong>: the one job it is in a deck for, decided by a fixed ladder (finisher, extra turn, board wipe, multiplier, untap engine, copier, blink, team quality, tutor, sacrifice outlet, removal, draw, ramp, token maker, payoff, and so on down to its body and its tribe). In a filter dialog the count beside an option is what you would have under the filters already applied; the whole-graph figure is on the hover. Picking a deck under <strong>Yours</strong> puts its commander in focus, and dragging the divider beside the graph grows the card picture up to 70%.</p><p><strong>Loops only</strong>, on by default when a deck is picked, walks only the joins that continue or pay off a loop: an untap, copy or blink onto a tap ability worth another go, a repeatable supply into a demand, an event one card causes and another fires on. <strong>Loops this card is in</strong> lists every cycle of four cards or fewer through the focus, each step named and the missing pieces dashed, with the cards that turn each pass into damage, cards or mana.</p>'};
    C.main.innerHTML = C.pageHead('Discover') + '<p role="status">Loading graph metadata…</p>';

    const loaded = await C.catalog.loadGraph();
    if (C.route().view !== 'discover') return;
    /* The pairs are the weight of the graph and this is the one page that draws them, so
       they load here, once, with a line that says so -- not at install for every visitor. */
    if (!(loaded.played && loaded.played.length) && C.catalog.loadPlayed) {
      const status = C.main.querySelector('[role=status]'); if (status) status.textContent = 'Loading the co-play links — about 20 MB, kept for next time…';
      try { await C.catalog.loadPlayed(); } catch (error) { C.notice('The co-play links could not be loaded, so the graph draws the rules-derived joins only. ' + error.message, true); }
      if (C.route().view !== 'discover') return;
    }

    /* The graph plus anything in the library it does not know about -- a card imported
       from a link, or one printed after the graph snapshot -- shaped like a graph row. */
    const data = {...loaded, cards: [...loaded.cards]};
    const names = new Set(data.cards.map((c) => c.name));
    for (const c of Object.values(C.state.cards)) {
      if (!names.has(c.name)) data.cards.push({...c, id: c.oracleId || c.id, type: c.typeLine, ci: (c.colorIdentity || []).join(''), image: c.image});
    }

    /* THE UNIVERSE, EXPLAINED ONCE. The count beside the filters is the whole format, and
       a reader is entitled to ask why that number and not another. Every figure here is
       read off the file itself, so it cannot drift from what the graph is drawing. */
    function universeHint(g) {
      const total = (g.counts && g.counts.cards) || g.cards.length, links = (g.counts && g.counts.playedWith) || (g.played || []).length;
      const commanders = g.cards.filter((c) => c.isCommander).length;
      const whole = /^every/i.test(g.scope || '');
      const when = g.generatedAt ? new Date(g.generatedAt).toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'}) : '';
      const body = whole
        ? `<p><strong>${total.toLocaleString()} cards</strong> is every card legal in Commander, as Scryfall lists the format — one entry per card, not per printing. <strong>${commanders.toLocaleString()}</strong> of them can lead a deck, and every one of those is here.</p>
           <p>Two kinds of evidence join them. What a card <em>does</em> — what it causes, triggers on, produces, multiplies, the tribe it is or wants — is read off every card's rules text by the same classifier that reads a card you type. What people <em>actually play</em> comes from EDHREC: for each of the ${commanders.toLocaleString()} commanders, the cards its real decks run alongside it, <strong>${links.toLocaleString()}</strong> co-play links in all.</p>
           <p>So if a card is legal, it is here; if any commander's players play it, that link is here too. A Commander deck cannot legally contain anything outside this set, which is why you can treat it as the definitive universe of cards you will care about — for any commander, not only the ones you own.</p>`
        : `<p><strong>${total.toLocaleString()} cards</strong> — this build's scope is <em>${e(g.scope || 'unknown')}</em>: cards that were owned, named by a deck, linked by EDHREC to those decks' commanders, or able to lead a deck (${commanders.toLocaleString()}). Any other legal card can still be typed into Find a card and brought in as a visitor.</p>`;
      return `<details class="cm-inline-menu cm-hint cm-universe-hint"><summary class="cm-hint-btn" aria-label="What is this universe of cards?" title="What is this universe of cards?">?</summary><div class="cm-menu cm-inline-menu-body cm-hint-body cm-universe-body"><h4>The universe</h4>${body}${when ? `<p class="cm-muted">Refreshed ${e(when)}.</p>` : ''}</div></details>`;
    }
    const wanted = C.catalog.get(params.get('card'));
    const facets = CrankFacets.available(C.state);
    const values = CrankFacets.values(data.cards, C.state);
    /* THE FILTER BAR. One button per facet, grouped by what it asks about -- the card, its
       rules, lands, yours -- each opening its options in a dialog over the page, so picking a
       filter never moves the page under the pointer. A facet with a single value (Lands only)
       is the toggle itself. The badge is the number of picks in that facet. */
    const FACET_GROUPS = [['Card', ['type', 'colors', 'mv', 'manaKind', 'rarity']], ['Rules', ['roles', 'mechanics', 'tribes', 'wants', 'makes', 'wantsStat', 'offersStat', 'triggers', 'causes', 'multiplies', 'produces', 'requires', 'grants', 'extends']], ['Lands', ['lands', 'enters']], ['Yours', ['owned', 'decks']]];
    const sortedRows = (key) => (values[key] || []).slice().sort((a, b) => key === 'mv'
      ? (a.value === '7+' ? 99 : Number(a.value)) - (b.value === '7+' ? 99 : Number(b.value))
      : String(a.value).localeCompare(String(b.value), undefined, {sensitivity: 'base', numeric: true}));
    /* THE COUNT IS WHAT YOU WOULD HAVE. Beside each option: the cards that carry it AMONG the
       cards the filters already applied leave (CrankFacets.narrowedCounts), not every card in
       the format -- "B: 20" under a role filter rather than "B: 7,179". The whole-graph figure
       stays on the tooltip, the fold ("used by one card") still reads the whole graph so the
       list does not reshuffle, and an option no current card carries steps back rather than
       vanishing, so the reader can still see it exists. */
    const countLabel = (row, narrow) => { const n = narrow ? (narrow.get(row.value) || 0) : row.count; return {n, note: narrow && n !== row.count ? `${n.toLocaleString()} of ${row.count.toLocaleString()} in the whole graph, under your other filters` : `${row.count.toLocaleString()} card${row.count === 1 ? '' : 's'} in the whole graph`}; };
    const pickButton = (key, row, folds, narrow) => { const {n, note} = countLabel(row, narrow); return `<button type="button" class="cm-facet-pick${n === 0 ? ' is-empty' : ''}" data-action="facet-term" data-facet-pick="${e(key)}" data-key="${e(key)}" data-value="${e(row.value)}" data-lower="${e(String(row.value).toLowerCase())}" data-count="${e(note)}"${folds && row.count < 2 ? ' data-rare="1" hidden' : ''}><span>${e(row.value)}</span> <small class="cm-muted">${n.toLocaleString()}</small></button>`; };
    function facetBar() {
      const placed = new Set(FACET_GROUPS.flatMap(([, keys]) => keys)), extra = facets.filter((f) => !placed.has(f.key)).map((f) => f.key);
      return FACET_GROUPS.map(([label, keys]) => [label, label === 'Rules' ? keys.concat(extra) : keys]).map(([label, keys]) => {
        const items = keys.map((k) => facets.find((f) => f.key === k)).filter(Boolean).map((facet) => {
          const rows = values[facet.key] || [];
          if (rows.length === 1) return `<button type="button" class="cm-facet-btn cm-facet-pick" data-action="facet-term" data-facet-pick="${e(facet.key)}" data-key="${e(facet.key)}" data-value="${e(rows[0].value)}" title="${e(facet.label)}: ${e(rows[0].value)}">${e(facet.key === 'lands' ? 'Lands only' : facet.label)}</button>`;
          return `<button type="button" class="cm-facet-btn" data-action="facet-open" data-facet="${e(facet.key)}" aria-haspopup="dialog">${e(facet.label)}<span class="cm-facet-n" data-facet-count="${e(facet.key)}"></span></button>`;
        });
        return items.length ? `<span class="cm-facet-group" data-group="${e(label.toLowerCase())}"><span class="cm-facet-group-name">${e(label)}</span>${items.join('')}</span>` : '';
      }).join('');
    }

    C.main.innerHTML = C.pageHead('Discover', toolsButton(), 'discover')
      + `<div class="cm-toolbar"><label class="cm-search">Find a card<input id="cm-graph-query" placeholder="Card name" list="cm-graph-names"><datalist id="cm-graph-names"></datalist></label>${C.select('Connections', 'edgeType', [['mechanic', 'Shared mechanics / roles'], ['played', 'EDHREC co-play']], 'mechanic')}${b('Search catalog / link', 'graph-lookup')}${b('Back', 'graph-back')}${b('Reset view', 'graph-reset')}</div>

      <div class="cm-facet-bar" id="cm-facet-bar" role="group" aria-label="Filters">
        <span class="cm-facet-bar-head"><strong>Filters</strong> <span id="cm-facet-summary" class="cm-muted"></span></span>
        ${facetBar()}
        <span class="cm-facet-drop-tools">${b('Clear all', 'facet-clear', {}, false, {cls: 'compact'})}</span>
      </div>

      <div class="cm-facet-status">
        <p role="status" id="cm-facet-count"></p>${universeHint(loaded)}
        <div class="cm-actions" id="cm-facet-chips"></div>
        <div class="cm-graph-reach">
          <label>Depth <output id="cm-depth-out">${depth}</output><input type="range" id="cm-depth" min="1" max="3" step="1" value="${depth}" aria-label="How many hops from the focused card"></label>
          <label>Breadth <output id="cm-breadth-out">${breadth}</output><input type="range" id="cm-breadth" min="6" max="30" step="1" value="${breadth}" aria-label="How many neighbours the focused card gets"></label>
          <label class="cm-checkbox cm-loop-toggle" title="Walk only the joins that continue or pay off a loop: an untap, copy or blink onto a tap ability worth another go; a repeatable supply into a demand; an event one card causes and another fires on. Off, every join counts."><input type="checkbox" id="cm-loop-mode"${loopMode ? ' checked' : ''}> Loops only</label>
          <span class="cm-muted" id="cm-graph-size"></span>
        </div>
      </div>

      <div class="cm-graph-grid cm-graph-grid-tall">
        <div class="cm-graph-col">
          <div class="cm-graph-modes" role="group" aria-label="What a tap on the graph does">${[['navigate', 'Navigate'], ['inspect', 'Inspect'], ['select', 'Select']].map(([m, label]) => `<button type="button" class="v-button${gmode === m ? ' is-on' : ''}" data-action="graph-mode" data-mode="${m}" aria-pressed="${gmode === m}">${label}</button>`).join('')}<details class="cm-inline-menu cm-hint cm-graph-hint"><summary class="cm-hint-btn" aria-label="How the graph works" title="How the graph works">i</summary><div class="cm-menu cm-inline-menu-body cm-hint-body"><p id="cm-graph-mode-hint">${modeHint(gmode)}</p><p>Pinch to zoom · drag to pan · tap a card to explore · double-tap to reset · zoom in to label the focus's connections and name the outer rings. With a mouse: wheel to zoom, arrow keys / + / − / 0.</p><p>A gold band around a card means you own a copy.</p></div></details><span class="cm-graph-back" id="cm-graph-back"></span></div>
          <div class="cm-graph-box">
            <canvas class="cm-graph" id="cm-graph" tabindex="0" role="img" aria-label="Interactive card relationship graph. Drag to pan. Pinch or mouse wheel to zoom. In Navigate a tap re-centres on a card; in Inspect a tap opens its terms; in Select a tap ticks it for a group. A tap on a line opens why two cards are joined. Keyboard arrows pan, plus and minus zoom, zero resets."></canvas>
            ${stageButton()}
            <div class="cm-graph-pop" id="cm-graph-pop" role="dialog" aria-label="Connection details" hidden></div>
          </div>
        </div>
        <div class="cm-pane-gutter" id="cm-pane-gutter" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize the card pane. Drag it, or use the arrow keys. Double-click to reset." title="Drag to resize · double-click to reset"><i></i></div>
        <aside class="v-panel cm-card-view" id="cm-card-view" aria-live="polite"><div class="cm-pane-tabs" role="tablist" aria-label="Card pane">${tabButton('card', 'Card Info')}${tabButton('list', 'List')}</div><div id="cm-pane-body"></div></aside>
      </div>`;

    applyStage();
    const pane = $('#cm-card-view');
    const view = $('#cm-pane-body');
    applyTab();

    /* THE PANE ENDS WHERE THE GRAPH ENDS. A grid row is as tall as its tallest item's
       content, so a pane holding art, rules text and forty relation chips made the row
       137px taller than the canvas beside it however tall the canvas was -- and CSS has
       no way to say "be exactly as tall as my sibling" when the sibling is the shorter
       one. So the height is read off the graph column and written here, once per draw and
       on resize; the pane scrolls inside it. Skipped on a narrow screen, where the two
       stack and the pane should be as tall as its content. */
    let paneFrame = 0;
    function sizePane() {
      cancelAnimationFrame(paneFrame);
      paneFrame = requestAnimationFrame(() => {
        const column = document.querySelector('.cm-graph-col'), canvas = $('#cm-graph');
        if (!column || !canvas || !pane) return;
        const stacked = getComputedStyle(pane).getPropertyValue('--cm-pane-stacked').trim() === '1';
        if (stacked || landsOnly()) { pane.style.height = ''; return; }
        /* From the column's TOP to the canvas's BOTTOM, not the column's own height: the
           column is stretched by the same row the pane is inflating, so reading its height
           reads the pane's height back and the two agree on being too tall. The canvas's
           position does not depend on the pane, so this measurement cannot chase itself. */
        const height = Math.round(canvas.getBoundingClientRect().bottom - column.getBoundingClientRect().top);
        if (height > 200) pane.style.height = height + 'px';
      });
    }
    addEventListener('resize', sizePane);

    /* THE DIVIDER. The pane's width is the reader's to set: drag the gutter, or focus it and
       use the arrow keys; double-click puts it back. Remembered per device and per mode --
       the width that suits a laptop on a table in stage mode is not the width that suits a
       desk -- so it lives in localStorage rather than in the library, which travels. As the
       pane narrows the list sheds columns in a fixed order (Link, then Color, then Price;
       the name and the tick stay), and grows them back as it widens. */
    const paneKey = () => `crankmagic:paneWidth:${stage ? 'stage' : 'default'}`;
    function paneWidthStored() { try { const v = Number(localStorage.getItem(paneKey())); return v > 0 ? v : null; } catch { return null; } }
    function setPaneWidth(w, persist) {
      const grid = document.querySelector('.cm-graph-grid'); if (!grid) return;
      if (w === null) grid.style.removeProperty('--cm-pane-w'); else grid.style.setProperty('--cm-pane-w', Math.round(w) + 'px');
      if (persist) { try { if (w === null) localStorage.removeItem(paneKey()); else localStorage.setItem(paneKey(), String(Math.round(w))); } catch { /* private mode: the width lasts for the visit */ } }
    }
    function clampPane(w) { const grid = document.querySelector('.cm-graph-grid'); const max = grid ? Math.max(260, grid.clientWidth * 0.6) : 900; return Math.min(max, Math.max(240, w)); }
    /* Which columns each width can carry. Dropped from the markup rather than hidden with
       CSS: under a fixed table layout a display:none column still keeps its width. */
    const BAND_DROPS = {l: [], m: ['link'], s: ['link', 'color'], xs: ['link', 'color', 'price']};
    /* In Lands only the Enters column is the point, so it is the last to go rather than the first. */
    const LAND_DROPS = {l: [], m: ['color'], s: ['color', 'price'], xs: ['color', 'price']};
    function bandPane() { if (!pane) return; const w = pane.clientWidth; const band = w >= 380 ? 'l' : w >= 330 ? 'm' : w >= 290 ? 's' : 'xs'; if (pane.dataset.w === band) return; const had = pane.dataset.w; pane.dataset.w = band; if (had && paneTab === 'list') drawList(); }
    const paneObserver = new ResizeObserver(bandPane); paneObserver.observe(pane); bandPane();
    const gutter = $('#cm-pane-gutter');
    let dragging = null;
    const settle = () => { sizePane(); dispatchEvent(new Event('resize')); };
    gutter.addEventListener('pointerdown', (ev) => { if (ev.button) return; dragging = {right: gutter.parentElement.getBoundingClientRect().right}; gutter.setPointerCapture(ev.pointerId); gutter.classList.add('is-dragging'); ev.preventDefault(); });
    gutter.addEventListener('pointermove', (ev) => { if (dragging) setPaneWidth(clampPane(dragging.right - ev.clientX - 6), false); });
    const endDrag = () => { if (!dragging) return; dragging = null; gutter.classList.remove('is-dragging'); const w = parseFloat(gutter.parentElement.style.getPropertyValue('--cm-pane-w')); if (w) setPaneWidth(w, true); settle(); };
    gutter.addEventListener('pointerup', endDrag); gutter.addEventListener('pointercancel', endDrag);
    gutter.addEventListener('dblclick', () => { setPaneWidth(null, true); settle(); });
    gutter.addEventListener('keydown', (ev) => {
      const step = ev.key === 'ArrowLeft' ? 24 : ev.key === 'ArrowRight' ? -24 : 0;
      if (!step && ev.key !== 'Home') return;
      ev.preventDefault(); if (step) setPaneWidth(clampPane(pane.clientWidth + step), true); else setPaneWidth(null, true); settle();
    });
    setPaneWidth(paneWidthStored(), false);

    function mount(cards, focusId) {
      const history = graph ? graph.history() : [];
      graph?.destroy();
      hidePop();
      graph = CrankGraph.mount({
        canvas: $('#cm-graph'), cards, played: data.played, focus: focusId, history, depth, breadth, loopMode,
        owned: CrankFacets.ownedNames(C.state),
        onNeighbors(c, neighbors, trailLength, info) {
          /* A new focus clears the card the list opened; a re-layout of the same focus (a
             resize, a slider) does not, or opening a row would undo itself. */
          if ((c && c.id) !== lastFocusId) { listCard = null; listPage = 0; }
          lastFocusId = c && c.id;
          drawCardView(c, info);
          if (graph) { graph.setMode(gmode); graph.setSelected(picked); }
        },
        onPick(card, ids) { picked = ids; drawCardView(graph.current(), null, true); },
        onHit: showPop
      });
      graph.setMode(gmode); graph.setSelected(picked);
    }

    /* THE POP-UP: why. A tap on a card in Inspect, or on any line in any mode, opens the
       terms that matter when building a chain -- what the card triggers on, causes,
       produces and requires, and exactly which of those it shares with the focus (or, for
       a line, with the card at the other end). Every term is a filter. The Card View pane
       stays the place to read the card; this is the place to read the connection. */
    const TERM_LABEL = Object.fromEntries(CrankFacets.FACETS.map((f) => [f.key, f.label]));
    /* THE PRIMARY PURPOSE WEARS A GOLD RING. A card carries a dozen terms; one of them is the
       job it is in a deck for, and MtgCardClassify.purposeOf names it by a fixed ladder
       (finisher, wipe, multiplier, team quality, tutor, outlet, removal ... down to its body
       and its tribe). The pane, the pop-up and a list row all ring that chip, so the eye lands
       on it first; the hover says so. `primary` is the {key, value} to ring, or null. */
    const purposeOf = (card) => (card && globalThis.MtgCardClassify ? MtgCardClassify.purposeOf(card) : null);
    function termChip(key, value, primary) {
      const on = CrankFacets.stateOf(selection, key, value);
      const prime = !!(primary && primary.key === key && primary.value === value);
      const hint = on === 'include' ? 'Showing only cards with this — tap to exclude them instead' : on === 'exclude' ? 'Hiding cards with this — tap to clear' : 'Tap to show only cards with this';
      return `<button class="cm-chip${on === 'include' ? ' is-on' : on === 'exclude' ? ' is-not' : ''}${prime ? ' cm-chip-primary' : ''}" data-action="facet-term" data-key="${e(key)}" data-value="${e(value)}" aria-pressed="${on !== 'off'}"${prime ? ' data-primary="1"' : ''} title="${prime ? `Primary Purpose — ${e(primary.label)}: ${e(primary.why)}. ` : ''}${hint}">${e(value)}<small>${e(TERM_LABEL[key] || key)}</small></button>`;
    }
    /* A shared term is a mechanic when the card lists it as one, a role otherwise. */
    const keyOf = (card, term) => ((card.mechanics || []).includes(term) ? 'mechanics' : 'roles');
    function relationHTML(rel, from, to) {
      if (!rel) return `<p class="cm-muted">No rules-derived connection between these two on this graph.</p>`;
      /* Every way these two are joined, not only the strongest -- the edge label had room
         for one sentence, the pop-up does not. Each chip is also the filter for that term,
         so "they share proliferate" is one tap from "show me everything that proliferates". */
      const p = purposeOf(from);
      const chips = [
        ...(rel.drives || []).map((t) => termChip('roles', t, p)),
        ...(rel.drivenBy || []).map((t) => termChip('roles', t, p)),
        ...rel.fires.map((t) => termChip('causes', t, p)),
        ...rel.firedBy.map((t) => termChip('triggers', t, p)),
        ...rel.multiplied.map((t) => termChip('multiplies', t, p)),
        ...rel.multiplies.map((t) => termChip('multiplies', t, p)),
        ...rel.extended.map((t) => termChip('extends', t, p)),
        ...rel.extendedBy.map((t) => termChip('extends', t, p)),
        ...rel.statted.map((t) => termChip('offersStat', t, p)),
        ...rel.stattedBy.map((t) => termChip('wantsStat', t, p)),
        ...rel.tribal.map((t) => termChip('tribes', t, p)),
        ...rel.tribalBy.map((t) => termChip('wants', t, p)),
        ...rel.feeds.map((t) => termChip('roles', t, p)),
        ...rel.fed.map((t) => termChip('requires', t, p)),
        ...rel.shared.map((t) => termChip(keyOf(from, t), t, p))
      ];
      const co = rel.coPlay ? `<p class="cm-muted">EDHREC co-play · ${(rel.coPlay.inclusion * 100).toFixed(1)}% of ${rel.coPlay.decks.toLocaleString()} decks</p>` : '';
      return `${chips.length ? `<p class="cm-muted">${e(rel.reason || rel.kind)}</p><div class="cm-term-chips">${chips.join('')}</div>` : ''}${co}`;
    }
    function ownTermsHTML(card) {
      const t = CrankGraph.termsOf(card); if (!t) return '';
      const chips = [], p = purposeOf(card);
      for (const [group, key] of Object.entries(TERM_FACET)) for (const value of t[group] || []) chips.push(termChip(key, value, p));
      return chips.length ? `<h4>Its own terms</h4><div class="cm-term-chips">${chips.join('')}</div>` : '';
    }
    function showPop(hit) {
      const pop = $('#cm-graph-pop'); if (!pop) return;
      if (!hit) { hidePop(); return; }
      const focus = graph?.current();
      if (hit.kind === 'node') {
        /* THE CARD POP-UP IS THE CARD AND ITS CONNECTION, NOTHING ELSE. The picture at large
           size, the four facts a player reads off a card (type, cost, rarity and set, price),
           the one chip that is its Primary Purpose, and how it is joined to the focus. Its
           full term list -- a dozen chips that made the pop-up a wall -- now lives under
           Inspect card, where the rules text it comes from is. */
        const rec = C.catalog.exact(hit.card.name) || {}, image = rec.image || hit.card.image || '', p = purposeOf(hit.card);
        const facts = [rec.manaCost ? C.mana(rec.manaCost) : '', rec.rarity ? e(rec.rarity) : '', rec.setName || rec.set || hit.card.set ? e(rec.setName || rec.set || hit.card.set) : '', Number.isFinite(rec.price) ? e(C.money(rec.price)) : Number.isFinite(hit.card.price) ? e(C.money(hit.card.price)) : ''].filter(Boolean);
        const initials = String(hit.card.name).split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
        pop.classList.add('cm-pop-card');
        pop.innerHTML = `<header><strong>${e(hit.card.name)}</strong><button type="button" class="cm-pop-close" data-action="graph-pop-close" aria-label="Close">×</button></header>
          <div class="cm-pop-body"><div class="cm-pop-art">${image ? `<img src="${e(image)}" alt="" loading="lazy">` : `<div class="cm-pop-noart" aria-hidden="true">${e(initials)}</div>`}</div><div class="cm-pop-meta">
          <p class="cm-muted">${e(rec.typeLine || hit.card.type || '')}${hit.pinned ? ' · where you came from' : ''}</p>
          ${facts.length ? `<p class="cm-pop-facts">${facts.join(' · ')}</p>` : ''}
          ${p ? `<div class="cm-term-chips">${termChip(p.key, p.value, p)}</div>` : ''}
          ${focus && focus.id !== hit.card.id ? `<h4>Joined to ${e(focus.name)} by</h4>${relationHTML(hit.relation, hit.card, focus)}` : '<p class="cm-muted">This is the focus. Tap another card to read how it joins.</p>'}
          </div></div>
          <div class="cm-actions">${b('Focus here', 'graph-card', {id: hit.card.id}, true)}${b('Inspect card', 'card', {card: CrankCatalog.key(hit.card.name)})}<button type="button" class="v-button${picked.has(hit.card.id) ? ' is-on' : ''}" data-action="graph-tick" data-id="${e(hit.card.id)}">${picked.has(hit.card.id) ? 'Ticked ✓' : 'Tick for a group'}</button></div>`;
        graph?.setHighlight(focus ? [focus.id, hit.card.id] : null);
      } else {
        pop.classList.remove('cm-pop-card');
        pop.innerHTML = `<header><strong>${e(hit.a.name)} ↔ ${e(hit.b.name)}</strong><button type="button" class="cm-pop-close" data-action="graph-pop-close" aria-label="Close">×</button></header>
          <p class="cm-muted">${hit.tree ? 'On the tree that placed them' : 'A cross-link: both are on the canvas and they are joined to each other too'}</p>
          <h4>Joined by</h4>${relationHTML(hit.relation, hit.a, hit.b)}
          <div class="cm-actions">${b('Focus ' + hit.a.name.split(',')[0], 'graph-card', {id: hit.a.id})}${b('Focus ' + hit.b.name.split(',')[0], 'graph-card', {id: hit.b.id})}</div>`;
        graph?.setHighlight([hit.a.id, hit.b.id]);
      }
      pop.hidden = false;
      /* A card's pop-up opens to the RIGHT of its node, top edge level with it, so the node
         stays in view beside its own picture; when the column has no room on the right it
         opens on the left. A line's pop-up still hangs under the point that was tapped. */
      const col = pop.parentElement, canvas = $('#cm-graph'), gap = (hit.r || 16) + 14;
      /* The right bound is the whole grid, not the graph column: a card's pop-up may lie over
         the pane, which is only the card it just replaced, but never over the node it is for. */
      const bound = Math.max(col.clientWidth, (col.closest('.cm-graph-grid') || col).clientWidth);
      let left, top;
      if (hit.kind === 'node') {
        left = hit.x + gap;
        if (left + pop.offsetWidth > bound - 6) left = hit.x - gap - pop.offsetWidth;
        left = Math.max(6, Math.min(bound - pop.offsetWidth - 6, left));
        top = canvas.offsetTop + hit.y - 24;
      } else {
        left = Math.max(6, Math.min(col.clientWidth - pop.offsetWidth - 6, hit.x - 40));
        top = canvas.offsetTop + hit.y + 10;
      }
      if (top + pop.offsetHeight > canvas.offsetTop + canvas.clientHeight - 6) top = Math.max(canvas.offsetTop + 6, canvas.offsetTop + canvas.clientHeight - pop.offsetHeight - 6);
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
    }
    function hidePop() { const pop = $('#cm-graph-pop'); if (pop && !pop.hidden) { pop.hidden = true; pop.innerHTML = ''; } graph?.setHighlight(null); }
    function modeHint(m) { return m === 'inspect' ? 'Tap a card for its terms and its link to the focus; tap a line for why two cards are joined.' : m === 'select' ? 'Tap cards to tick them, then add them to a group from the Card View.' : 'Tap a card to make it the focus; the card you came from stays at the left.'; }
    /* Escape is the way out of presentation mode as well as out of a pop-up, in that order:
       the mode hides the nav rail, so it needs an exit that does not depend on finding the
       small control that opened it. The pop-up wins when one is open, because that is the
       thing the reader most recently put on screen. */
    const onKey = (ev) => {
      if (ev.key !== 'Escape') return;
      const pop = $('#cm-graph-pop');
      if (pop && !pop.hidden) { hidePop(); return; }
      if (stage) actions['graph-stage']();
    };
    document.addEventListener('keydown', onKey);
    /* A dropdown left hanging over the page after the click that used it is the reader
       wondering whether it worked. One closes when you pick from it and when you look
       away; opening one closes the others. */
    const closeMenus = (except) => { for (const d of document.querySelectorAll('.cm-inline-menu[open]')) if (d !== except) d.open = false; };
    const onDocClick = (ev) => {
      const menu = ev.target.closest && ev.target.closest('.cm-inline-menu');
      if (!menu || ev.target.closest('.cm-inline-menu-body')) return closeMenus(null);
      closeMenus(menu);
    };
    document.addEventListener('click', onDocClick);

    /* THE CARD VIEW. What the old side lists could not be: the card itself. Art, cost,
       type, the printed text, and then the terms it is joined on -- each a filter. The
       catalog record has the text and the art; the graph row has the terms. */
    const TERM_FACET = {mechanics: 'mechanics', roles: 'roles', triggers: 'triggers', causes: 'causes',
      multiplies: 'multiplies', produces: 'produces', requires: 'requires',
      grants: 'grants', extends: 'extends', tribes: 'tribes', wants: 'wants', makes: 'makes',
      wantsStat: 'wantsStat', offersStat: 'offersStat'};
    let lastInfo = null, lastDrawn = '';

    /* BACK BELONGS TO THE GRAPH, NOT TO THE CARD. It undoes a move on the canvas, so it
       sits at the top-right of the graph column -- the outside corner of the box it acts
       on -- rather than inside the pane, where it was painting over the card's own name.
       It is written from here rather than with the row around it because it changes with
       every focus and the row is drawn once. */
    function drawBack() {
      const slot = $('#cm-graph-back');
      if (!slot) return;
      const prior = graph && graph.previous();
      /* "Back to Prior Card", not "Back to Atraxa". The card's name set the button's width,
         so the button moved every time the focus did -- and it sits in a row with a wrapping
         hint beside it, where a control that changes width reflows its neighbours. The name
         is still there for anyone who wants it, on the title. */
      slot.innerHTML = prior
        ? `<button type="button" class="v-button" data-action="graph-back" title="Back to ${e(prior.name)}">◀ Back to Prior Card</button>`
        : '';
    }
    /* ADD/BUY, ONE MENU FOR THE PANE AND EVERY LIST ROW: the two vendors, the library, the
       collection groups and the draft decks. */
    function buyMenu(c, rec, compact = false) {
      const buy = rec.buy || c.buy || C.buyLink(rec.name ? rec : c);
      const kingdom = 'https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=' + encodeURIComponent(c.name);
      const cardId = CrankCatalog.key(c.name);
      const groups = C.state.groups || [];
      const draftDecks = (C.state.decks || []).filter((d) => !d.archived && d.status === 'draft');
      return `<details class="cm-inline-menu" name="cm-card-view-menu"><summary class="v-button cm-card-view-menu-btn${compact ? ' cm-buy-caret' : ''}"${compact ? ` title="Add/Buy" aria-label="Add or buy ${e(c.name)}"` : ''}>${compact ? (C.caret ? C.caret('down') : '▾') : 'Add/Buy'}</summary><div class="cm-menu cm-inline-menu-body">
              <a href="${e(buy)}" target="_blank" rel="noopener">Buy at TCGplayer ↗</a>
              <a href="${e(kingdom)}" target="_blank" rel="noopener">Buy at Card Kingdom ↗</a>
              <hr>
              <p>Add to collection</p>
              <button type="button" data-action="add-card" data-card="${e(cardId)}">Your library…</button>
              ${groups.map((g) => `<button type="button" data-action="discover-to-group" data-card="${e(c.name)}" data-group="${e(g.id)}">${e(g.name)}</button>`).join('')
                || '<p class="cm-muted">No collection groups yet.</p>'}
              <hr>
              <p>Add to deck</p>
              ${draftDecks.map((d) => `<button type="button" data-action="discover-to-deck" data-card="${e(c.name)}" data-deck="${e(d.id)}">${e(d.name)}</button>`).join('')
                || '<p class="cm-muted">No draft decks. A finalized list changes through its own page.</p>'}
            </div></details>`;
    }
    function tabButton(id, label) { return `<button type="button" role="tab" class="cm-pane-tab${paneTab === id ? ' is-on' : ''}" aria-selected="${paneTab === id}" data-action="pane-tab" data-tab="${id}">${label}</button>`; }
    function applyTab() {
      for (const t of document.querySelectorAll('.cm-pane-tab')) { const on = t.dataset.tab === paneTab; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); }
      document.querySelector('.cm-graph-grid')?.classList.toggle('cm-list-open', paneTab === 'list');
    }
    actions['pane-tab'] = (el) => { paneTab = el.dataset.tab; listCard = null; applyTab(); lastDrawn = ''; drawCardView(listCard || graph?.current(), null, true); requestAnimationFrame(() => { sizePane(); dispatchEvent(new Event('resize')); }); };
    /* THE LIST. graph.reach() at the widest setting, over the filtered world the graph is
       mounted on, so every filter still applies and only the sliders do not. */
    const LIST_COLS = [['name', 'Card'], ['link', 'Link'], ['color', 'Color'], ['price', 'Price']];
    /* ONE PIP PER CARD, whatever it costs. A mono-coloured card shows its symbol once; a
       colourless one the grey pip; a multicoloured one a pip of the same shape split into
       wedges of its own colours -- and a four- or five-colour card the full five-way split,
       which is the format's own sign for "all of them". */
    const PIP = {W: '#fff0b4', U: '#53acff', B: '#696076', R: '#ee735f', G: '#66b889'};
    const PIP_NAME = {W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green'};
    function colorPip(ci) {
      const list = String(ci || '').split('').filter((x) => PIP[x]);
      if (!list.length) return '<span class="cm-colors" title="Colorless"><i class="cm-color C"></i></span>';
      if (list.length === 1) return `<span class="cm-colors" title="${PIP_NAME[list[0]]}"><img class="cm-pip" src="assets/mana/${list[0]}.svg?v=1" alt="${PIP_NAME[list[0]]}"></span>`;
      const wedges = list.length >= 4 ? ['W', 'U', 'B', 'R', 'G'] : list, n = wedges.length;
      const paths = wedges.map((c, i) => {
        const a0 = -Math.PI / 2 + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
        const pt = (a) => `${(9 + 8 * Math.cos(a)).toFixed(2)} ${(9 + 8 * Math.sin(a)).toFixed(2)}`;
        return `<path d="M9 9 L${pt(a0)} A8 8 0 ${2 * Math.PI / n > Math.PI ? 1 : 0} 1 ${pt(a1)} Z" fill="${PIP[c]}"/>`;
      }).join('');
      const label = list.map((c) => PIP_NAME[c]).join(' / ');
      return `<span class="cm-colors" title="${e(label)}"><svg class="cm-pip cm-pip-multi" viewBox="0 0 18 18" role="img" aria-label="${e(label)}">${paths}<circle cx="9" cy="9" r="8" fill="none" stroke="#0b0f17" stroke-width=".8"/><circle cx="9" cy="9" r="2.2" fill="#0b0f17" opacity=".55"/></svg></span>`;
    }
    const ENTRY_LABEL = {'enters-untapped': 'untapped', 'enters-tapped': 'tapped', 'enters-tapped-unless': 'tapped unless'};
    const entryOf = (c) => ENTRY_LABEL[(c.mechanics || []).find((m) => ENTRY_LABEL[m])] || '';
    function rowOf(card, depth, link, parent) {
      const rec = C.catalog.exact(card.name) || {};
      return {id: card.id, card, rec, depth, name: card.name, type: rec.typeLine || card.type || '', link, parent, mana: rec.manaValue ?? card.mv ?? null, manaCost: rec.manaCost || '', price: Number.isFinite(rec.price) ? rec.price : null, ci: String(card.ci || (rec.colorIdentity || []).join(''))};
    }
    function listRows() {
      if (landsOnly()) return landRows.map((c) => rowOf(c, 0, entryOf(c), null));
      if (!graph) return [];
      return graph.reach(3, 30).map((n) => rowOf(n.card, n.depth, n.tag || n.kind || '', n.parent || null));
    }
    function drawList() {
      const focus = graph?.current();
      const all = listRows();
      const key = listSort.key, dir = listSort.dir;
      all.sort((x, y) => { if (key === 'ring') return (x.depth - y.depth) * dir || x.name.localeCompare(y.name); const val = (r) => key === 'color' ? r.ci.length + r.ci : r[key]; const a = val(x), b = val(y); if (a === null || a === undefined) return 1; if (b === null || b === undefined) return -1; return (typeof a === 'number' ? a - b : String(a).localeCompare(String(b))) * dir || x.name.localeCompare(y.name); });
      const pages = Math.max(1, Math.ceil(all.length / LIST_PAGE));
      if (revealCard && listCard) { const at = all.findIndex((r) => r.id === listCard.id); if (at >= 0) listPage = Math.floor(at / LIST_PAGE); revealCard = false; }
      listPage = Math.min(listPage, pages - 1);
      const rows = all.slice(listPage * LIST_PAGE, listPage * LIST_PAGE + LIST_PAGE);
      const lands = landsOnly();
      const drop = (lands ? LAND_DROPS : BAND_DROPS)[pane.dataset.w] || []; const cols = LIST_COLS.filter(([k]) => !(stage && k === 'price') && !drop.includes(k)).map(([k, l]) => [k, lands && k === 'link' ? 'Enters' : l]);
      const allTicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
      const pickedRows = all.filter((r) => picked.has(r.id));
      const paging = `<div class="cm-paging cm-list-paging"><span>${all.length} card${all.length === 1 ? '' : 's'}${pages > 1 ? ` · page ${listPage + 1} of ${pages}` : ''}</span><div class="cm-actions"><button type="button" class="v-button compact" data-action="list-page" data-step="-1" ${listPage === 0 ? 'disabled' : ''}>Previous</button><button type="button" class="v-button compact" data-action="list-page" data-step="1" ${listPage + 1 >= pages ? 'disabled' : ''}>Next</button></div></div>`;
      view.innerHTML = `<div class="cm-list-head"><p class="cm-muted">${lands ? `<strong>${all.length.toLocaleString()} land${all.length === 1 ? '' : 's'}</strong> pass the filters. Sort by a column heading; a row opens the card.` : focus ? `Everything <strong>${e(focus.name)}</strong> reaches at depth 3, breadth 30 — the whole neighbourhood, whatever the sliders say. Filters still apply.` : 'Nothing in focus.'}</p>
        ${pickedRows.length ? `<div class="cm-actions cm-pick-actions">${b(`Add ${pickedRows.length} selected to a group…`, 'results-group', {}, true)}<details class="cm-inline-menu"><summary class="v-button compact cm-card-view-menu-btn">With ${pickedRows.length} selected</summary><div class="cm-menu cm-inline-menu-body"><p>Add to a draft deck</p>${(C.state.decks || []).filter((d) => !d.archived && d.status === 'draft').map((d) => `<button type="button" data-action="list-to-deck" data-deck="${e(d.id)}">${e(d.name)}</button>`).join('') || '<p class="cm-muted">No draft decks.</p>'}</div></details>${b('Clear selection', 'results-clear')}</div>` : ''}</div>
        ${paging}
        <div class="cm-table-wrap cm-list-wrap"><table class="cm-table cm-list-table"><thead><tr><th scope="col" class="cm-tick-cell"><input type="checkbox" class="cm-list-tick-all" ${allTicked ? 'checked' : ''} aria-label="Tick every card on this page"></th>${cols.map(([k, l]) => `<th scope="col" class="cm-col-${k}" aria-sort="${key === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-action="list-sort" data-key="${k}">${l}${key === k ? ` <span aria-hidden="true">${dir === 1 ? '↑' : '↓'}</span>` : ' <span class="cm-sort-idle" aria-hidden="true">↕</span>'}</button></th>`).join('')}${stage ? '' : '<th scope="col" class="cm-col-buy"><span class="cm-visually-hidden">Add/Buy</span></th>'}</tr></thead><tbody>${rows.map((r) => `<tr class="cm-list-row${listCard && listCard.id === r.id ? ' is-on' : ''}${picked.has(r.id) ? ' cm-row-ticked' : ''}" data-id="${e(r.id)}"><td class="cm-tick-cell"><input type="checkbox" class="cm-list-tick" data-id="${e(r.id)}" ${picked.has(r.id) ? 'checked' : ''} aria-label="Tick ${e(r.name)}"></td>${cols.map(([k]) => k === 'name' ? `<td class="cm-list-namecell"><button type="button" class="cm-card-name cm-list-name" data-action="list-card" data-id="${e(r.id)}" aria-expanded="${listCard && listCard.id === r.id ? 'true' : 'false'}">${e(r.name)}</button></td>` : k === 'link' ? `<td class="cm-list-link" title="${e(r.link)}">${e(r.link)}</td>` : k === 'color' ? `<td class="cm-list-color">${colorPip(r.ci)}</td>` : `<td class="cm-price">${r.price !== null ? C.money(r.price) : '<span class="cm-muted">—</span>'}</td>`).join('')}${stage ? '' : `<td class="cm-list-buy">${buyMenu(r.card, r.rec, true)}</td>`}</tr>${listCard && listCard.id === r.id ? `<tr class="cm-list-detail"><td colspan="${cols.length + (stage ? 1 : 2)}">${rowDetailHTML(r)}</td></tr>` : ''}`).join('') || `<tr><td colspan="${cols.length + 2}">Nothing reaches from here under these filters.</td></tr>`}</tbody></table></div>${rows.length > 12 ? paging : ''}`;
      $('#cm-graph-size').textContent = lands ? '' : lastInfo && lastInfo.total ? `${lastInfo.total} on canvas · ${all.length} in reach${loopMode ? ' · loops only' : ''}` : '';
      sizePane();
    }
    actions['list-sort'] = (el) => { const k = el.dataset.key; listSort = {key: k, dir: listSort.key === k ? -listSort.dir : 1}; drawList(); };
    actions['list-page'] = (el) => { listPage += Number(el.dataset.step); drawList(); };
    /* A ROW OPENS IN PLACE. What Inspect shows for a tapped node -- the type line, how it
       is joined to the card that placed it, its own terms, and the three things to do next
       -- unfolds under the row. The focus stays put, the tab stays put, and moving the
       graph is the one button that says so. Ring 2 and 3 cards hang off a ring 1 or 2 card,
       not the focus, so the join named is the one the canvas actually draws. */
    function rowDetailHTML(r) {
      const parent = r.parent, rel = parent && graph ? graph.relation(r.id, parent.id) : null;
      return `<div class="cm-list-pop cm-list-pop-row"><p class="cm-muted cm-pop-type">${e(r.type)}${r.depth ? ` · ring ${r.depth}` : ''}</p>
        ${parent ? `<h4>Joined to ${e(parent.name)} by</h4>${relationHTML(rel, r.card, parent)}` : ''}
        ${ownTermsHTML(r.card)}
        <div class="cm-actions">${landsOnly() ? '' : b('Focus here', 'graph-card', {id: r.id}, true)}${b('Inspect card', 'card', {card: CrankCatalog.key(r.name)})}<button type="button" class="v-button${picked.has(r.id) ? ' is-on' : ''}" data-action="graph-tick" data-id="${e(r.id)}">${picked.has(r.id) ? 'Ticked ✓' : 'Tick for a group'}</button></div></div>`;
    }
    actions['list-card'] = (el) => {
      const id = el.dataset.id;
      if (listCard && listCard.id === id) { listCard = null; drawList(); return; }
      const row = listRows().find((r) => r.id === id); if (!row) return;
      listCard = row.card; drawList();
      pane.querySelector('.cm-list-detail')?.scrollIntoView({block: 'nearest'});
    };
    /* The whole row is the target, not only the name -- except the parts that are already
       controls: the tick box, the Add/Buy menu, and anything inside the open detail. */
    pane.addEventListener('click', (ev) => {
      const row = ev.target.closest('.cm-list-row'); if (!row) return;
      if (ev.target.closest('[data-action], .cm-tick-cell, .cm-list-buy, a, input, summary, details')) return;
      actions['list-card']({dataset: {id: row.dataset.id}});
    });
    actions['list-to-deck'] = async (el) => {
      const deck = C.M.deck(C.state, el.dataset.deck);
      if (deck.status !== 'draft') throw Error('Only a draft list can take cards this way.');
      const chosen = listRows().filter((r) => picked.has(r.id));
      const cards = [];
      for (const r of chosen) { const known = C.catalog.exact(r.name); if (known && !deck.slots.some((x) => x.cardId === known.id && x.purpose === 'main') && !cards.some((k) => k.id === known.id)) cards.push(known); }
      if (!cards.length) throw Error('Every selected card is already in that list, or not in the catalog.');
      const slots = deck.slots.filter((r) => r.purpose === 'main').map((r) => ({cardId: r.cardId, quantity: r.quantity, purpose: 'main', printing: r.printing, pinned: r.pinned}));
      await C.commit({type: 'batch', commands: [{type: 'cards', cards}, {type: 'editDeck', deckId: deck.id, slots: [...slots, ...cards.map((c) => ({cardId: c.id, quantity: 1, purpose: 'main'}))]}], summary: `Added ${cards.length} card${cards.length === 1 ? '' : 's'} to ${deck.name}`}, {renderView: false});
      picked = new Set(); graph?.setSelected(picked); drawList();
      C.notice(`${cards.length} card${cards.length === 1 ? '' : 's'} added to ${deck.name}.`);
    };
    pane.addEventListener('change', (ev) => {
      const one = ev.target.closest('.cm-list-tick'), all = ev.target.closest('.cm-list-tick-all');
      if (!one && !all) return;
      if (one) { if (one.checked) picked.add(one.dataset.id); else picked.delete(one.dataset.id); }
      else { for (const box of pane.querySelectorAll('.cm-list-tick')) { if (all.checked) picked.add(box.dataset.id); else picked.delete(box.dataset.id); } }
      graph?.setSelected(picked); drawList();
    });
    function drawCardView(c, info, keepInfo) {
      if (!keepInfo) lastInfo = info;
      if (paneTab === 'list') { drawList(); return; }
      if (listCard && (!c || c.id !== listCard.id)) c = listCard;
      /* Same card, same picture, same picks: leave the pane alone. Rewriting it moves the
         canvas beside it, which re-lays out the graph, which calls back here. */
      const key = JSON.stringify([c && c.id, lastInfo && [lastInfo.total, lastInfo.byDepth, lastInfo.crossLinks], gmode, [...picked].sort(), selection, loopMode, keepInfo ? Date.now() : 0]);
      if (!keepInfo && key === lastDrawn) return;
      lastDrawn = key;
      drawBack();
      if (!c) { view.innerHTML = '<h2>Nothing matches</h2><p>No card carries the filters you have picked.</p>'; $('#cm-graph-size').textContent = ''; return; }
      const rec = C.catalog.exact(c.name) || {};
      const t = CrankGraph.termsOf(c);
      const chips = [], purpose = purposeOf(c);
      if (t) for (const [group, key] of Object.entries(TERM_FACET)) {
        for (const value of t[group] || []) chips.push(termChip(key, value, purpose));
      }
      const img = rec.image || c.image || '';
      const cost = rec.manaCost ? C.mana(rec.manaCost) : '';
      /* LOOPS THIS CARD IS IN. Over the deck's own cards when a deck is picked, else over what is
         on the canvas. The mount's cached relation does the pair scoring, so the world's ids
         must be the mount's -- both worlds are. Cached per focus and world, because the pane is
         redrawn far more often than either changes. */
      const world = deckPicked ? lastWorld : (graph ? graph.visible() : []);
      const loopKey = c.id + '|' + world.length + '|' + world.map((x) => x.id).join(',');
      if (loopsCache.key !== loopKey) loopsCache = {key: loopKey, loops: graph && globalThis.CrankLoops ? CrankLoops.find(world, (a, b) => graph.relation(a.id, b.id), c.id) : []};
      const owned = CrankFacets.ownedNames(C.state);
      const loopCard = (s, extra = '') => `<button type="button" class="cm-loop-card${owned.has(s.name) ? '' : ' is-missing'}${extra}" data-action="graph-card" data-id="${e(s.id)}" title="${owned.has(s.name) ? 'You own this' : 'Not in your library'} — tap to focus it">${e(s.name)}</button>`;
      const loopsHTML = loopsCache.loops.length
        ? `<h3 class="cm-chips-head">Loops this card is in <small class="cm-muted">${loopsCache.loops.length}</small>
            <details class="cm-inline-menu cm-hint"><summary class="cm-hint-btn" aria-label="How these are found" title="How these are found">i</summary><div class="cm-menu cm-inline-menu-body cm-hint-body">A cycle of four cards or fewer through this card, over the joins a loop runs on: an untap, copy or blink onto a tap ability; a repeatable supply into a demand; an event one card causes and another fires on. A dashed card is not in your library. The second line is what turns each pass into damage, cards or mana.</div></details>
          </h3><ol class="cm-loops">${loopsCache.loops.slice(0, 6).map((l) => `<li class="cm-loop${l.closed ? ' is-closed' : ''}">${l.steps.map((s) => loopCard(s) + `<span class="cm-loop-via">${e(s.via ? s.via.says : '')} →</span>`).join('')}<span class="cm-loop-back">back to ${e(l.steps[0].name.split(',')[0])}</span>${l.payoffs.length ? `<div class="cm-loop-pay"><span class="cm-muted">Pays off through</span>${l.payoffs.map((p) => loopCard(p, ' cm-loop-payoff')).join('')}</div>` : ''}</li>`).join('')}</ol>`
        : (loopMode && deckPicked ? `<p class="cm-muted cm-loops-none">No closed loop of four cards or fewer runs through ${e(c.name)} in this deck.</p>` : '');
      /* WHAT BRACKET THIS CARD COMMITS YOU TO. The bracket system is about decks, but three
         kinds of card decide one: a Game Changer (Scryfall's own curated flag, baked into
         the graph) puts a deck at 3 or above, and mass land denial and looping extra turns
         are ruled out below 4. Everything else is legal at every bracket, and saying so is
         worth a line -- "no restriction" is an answer a reader came here for. */
      const BRACKETS = {
        gameChanger: ['Game Changer', 'A deck playing this is bracket 3 or higher. Three of them is the Tier 3 limit.'],
        massLand: ['Mass land denial', 'Not permitted below bracket 4.'],
        extraTurns: ['Extra turns', 'Keep these sparse and non-repeatable below bracket 4.']
      };
      const bracket = BRACKETS[c.bracket || (c.gameChanger || rec.gameChanger ? 'gameChanger' : '')]
        || ['No bracket restriction', 'Legal at every bracket.'];
      /* The frame around the art takes the card's identity: one colour for one colour,
         gold for three or more, a quiet grey for colourless. */
      const ci = String(c.ci || (rec.colorIdentity || []).join('')).split('').filter(Boolean);
      const tint = ci.length >= 3 ? '#e0b660' : ci.length === 2 ? ({W: '#f2dfa0', U: '#5fb2ff', B: '#9a8fae', R: '#f07a66', G: '#6fc493'})[ci[0]] : ci.length === 1 ? ({W: '#f2dfa0', U: '#5fb2ff', B: '#9a8fae', R: '#f07a66', G: '#6fc493'})[ci[0]] : '#6f8199';
      view.innerHTML = `
        <div class="cm-card-view-head">
          ${img ? `<img class="cm-card-view-art" src="${e(img)}" alt="" loading="lazy" style="--ci-a:${tint}">` : '<div class="cm-card-view-art cm-card-view-blank"></div>'}
          <div class="cm-card-view-title">
            <h2>${e(c.name)}</h2>
            <p>${e(rec.typeLine || c.type || '')}</p>
            <!-- The mana cost already says the colours. Printing the identity pips beside
                 it gave Atraxa eight symbols for a four-colour card; the pips are for the
                 cards that have no cost to read, which is the lands. -->
            <p class="cm-card-view-cost">${cost || C.colors(String(c.ci || (rec.colorIdentity || []).join('')).split(''))}</p>
            ${rec.rarity || rec.setName ? `<p class="cm-muted">${e([rec.rarity, rec.setName].filter(Boolean).join(' · '))}${Number.isFinite(rec.price) && rec.price > 0 ? ` · ${e(C.money(rec.price))}` : ''}</p>` : ''}
            <p class="cm-card-view-bracket"><span class="cm-badge${bracket[0] === 'Game Changer' ? ' warn' : ''}">${e(bracket[0])}</span> <small>${e(bracket[1])}</small></p>
            <!-- ADD AND/OR BUY SITS WITH THE PRICE AND THE BRACKET, the two things it acts
                 on, rather than in a stack under the art with Inspect, which acts on the art. -->
            <div class="cm-card-view-buy">${buyMenu(c, rec)}</div>
          </div>
          <!-- INSPECT BELONGS TO THE ART, so it sits directly beneath it in the art's own
               column, where there was nothing but empty space. -->
          <div class="cm-card-view-tools">
            ${b('Inspect card', 'card', {card: CrankCatalog.key(c.name)}, true)}
          </div>
        </div>
        <!-- NO ORACLE BOX. The card image above is the whole card, rules text included, so
             reprinting it underneath said the same thing twice and pushed the terms -- the
             part of this pane you cannot get from the picture -- below the fold. -->
        ${picked.size ? `<div class="cm-actions cm-pick-actions">${b(`Add ${picked.size} selected to a group…`, 'results-group', {}, true)}${b('Clear selection', 'results-clear')}</div>` : (gmode === 'select' ? '<p class="cm-muted">Tap cards on the graph to tick them. Tap again to untick.</p>' : '')}
        ${loopsHTML}
        ${chips.length ? `<h3 class="cm-chips-head">Joined to other cards by
          <details class="cm-inline-menu cm-hint"><summary class="cm-hint-btn" aria-label="How these work" title="How these work">i</summary><div class="cm-menu cm-inline-menu-body cm-hint-body">Tap once for only the cards that share it, again to hide them instead, a third time to clear. They stack. The gold ring is the card’s Primary Purpose: the one term it is in a deck for.</div></details>
        </h3><div class="cm-term-chips">${chips.join('')}</div>` : ''}
        ${loopMode && lastInfo && lastInfo.total === 1 ? `<p class="cm-muted cm-card-view-foot">Loops only is on and no join from ${e(c.name)} continues a loop under these filters. Turn it off to see every connection.</p>` : ''}
        ${lastInfo && lastInfo.total ? `<p class="cm-muted cm-card-view-foot">${lastInfo.total} cards on the canvas · ${lastInfo.byDepth.filter(Boolean).join(' / ')} by ring · ${lastInfo.crossLinks} cross-links${lastInfo.crossLinks > 60 ? ' (too many to draw at once: rest on a card, or inspect it, to see its own)' : ''}</p>` : ''}`;
      $('#cm-graph-size').textContent = lastInfo && lastInfo.total ? `${lastInfo.total} on canvas${loopMode ? ' · loops only' : ''}` : '';
      sizePane();
    }

    /* One place decides what the filtered world is; the count, the chips and the graph
       are all drawn from it. */
    const isLand = (c) => c.isLand === true || /\bLand\b/.test(String(c.type || ''));
    const landsOnly = () => CrankFacets.stateOf(selection, 'lands', 'lands only') === 'include';
    function refresh(keepFocus) {
      /* Enters is a question about lands, so it only means anything in Lands only; off the
         mode it would empty the graph (no spell enters tapped or untapped). Dropped here,
         so leaving the mode by any door -- the chip, Clear, picking a spell -- clears it. */
      const wasLands = document.querySelector('.cm-graph-grid')?.classList.contains('cm-lands-mode') || false;
      if (!landsOnly() && selection.enters && selection.enters.length) { selection = {...selection}; delete selection.enters; redrawTicks(); }
      const shown = CrankFacets.apply(data.cards, selection, C.state, {any: mode === 'any'});
      const picks = CrankFacets.count(selection);
      /* LANDS ONLY is a different page: no canvas, no rings, the lands that pass the other
         filters as a list the reader sorts. Off it, lands stay out of the graph's world --
         they are not joined to anything on it, by design. */
      const lands = landsOnly();
      document.querySelector('.cm-graph-grid')?.classList.toggle('cm-lands-mode', lands);
      document.getElementById('matrix-v2')?.classList.toggle('cm-lands', lands);
      $('#cm-facet-count').textContent = picks
        ? `${shown.length.toLocaleString()} of ${data.cards.length.toLocaleString()} cards match ${picks} filter${picks === 1 ? '' : 's'}${picks > 1 ? ` (${mode} within a facet)` : ''}.`
        : `${data.cards.length.toLocaleString()} cards. Narrow them with Filters, with the focused card's own terms, or search for one by name.`;
      $('#cm-facet-summary').textContent = picks ? `· ${picks} applied · ${shown.length.toLocaleString()} cards` : '· none applied';
      $('#cm-facet-chips').innerHTML = CrankFacets.chips(selection)
        .map((chip) => `<button class="cm-chip${chip.exclude ? ' is-not' : ''}" data-action="facet-drop" data-key="${e(chip.key)}" data-value="${e(chip.value)}">${chip.exclude ? '<span aria-hidden="true">−</span> ' : ''}${e(chip.label)}: ${e(chip.value)}${chip.exclude ? '<span class="cm-visually-hidden"> — excluded</span>' : ''} <span aria-hidden="true">×</span><span class="cm-visually-hidden"> — remove this filter</span></button>`)
        .join('') + (picks ? b('Clear filters', 'facet-clear') : '');
      for (const facet of facets) {
        const n = (selection[facet.key] || []).length;
        const label = $(`[data-facet-count="${facet.key}"]`);
        if (label) label.textContent = n ? String(n) : '';
      }
      /* THE FOCUSED CARD SURVIVES ITS OWN FILTERS. Excluding "deathtouch" from Atraxa's
         neighbourhood used to remove Atraxa, because Atraxa has deathtouch -- the reader
         lost the card they were asking about, and the chip they had just tapped moved out
         from under their finger. A filter narrows the neighbourhood; the subject is not
         part of what is being narrowed. */
      if (lands) {
        landRows = shown.filter(isLand); graph?.destroy(); graph = null; hidePop();
        if (listCard && !landRows.some((c) => c.id === listCard.id)) listCard = null;
        paneTab = 'list'; applyTab(); drawList(); drawBack(); return;
      }
      landRows = [];
      if (wasLands && paneTab === 'list') { paneTab = 'card'; applyTab(); }
      const pool = shown.filter((c) => !isLand(c));
      deckPicked = (selection.decks || []).some((v) => !String(v).startsWith(CrankFacets.NOT));
      if (!loopTouched) loopMode = deckPicked;
      const loopBox = $('#cm-loop-mode'); if (loopBox) loopBox.checked = loopMode;
      lastWorld = pool; loopsCache = {key: '', loops: []};
      const focused = keepFocus && data.cards.find((c) => c.id === keepFocus);
      const world = focused && !pool.some((c) => c.id === keepFocus) ? [focused, ...pool] : pool;
      if (world.length) mount(world, focused ? keepFocus : world[0].id);
      else { graph?.destroy(); graph = null; drawCardView(null, null); }
    }

    const startFocus = data.cards.find((c) => c.name === wanted?.name)
      || data.cards.find((c) => c.name === 'Atraxa, Praetors’ Voice' || c.name === "Atraxa, Praetors' Voice")
      || data.cards.find((c) => c.name === 'Krenko, Mob Boss')
      || data.cards[0];
    refresh(startFocus?.id);

    const currentFocus = () => graph?.current()?.id;

    /* Delegated: refresh() rewrites these regions, so listeners bound to nodes would not survive. */
    /* The pane's values are three-state buttons now, handled by the facet-term action like
       every other term control. There is nothing left here for a change event to catch. */
    /* A row is hidden for one of two reasons and they must not fight: a search that does
       not match it, or a folded tail it belongs to. A search wins -- typing a name finds it
       whether or not the tail is open -- so the fold only applies when the box is empty. */
    function applyFacetRows(key) {
      const list = $(`[data-facet-list="${key}"]`); if (!list) return;
      const box = $(`[data-facet-search="${key}"]`);
      const q = (box ? box.value : '').trim().toLowerCase();
      const open = list.dataset.expanded === '1';
      for (const row of list.querySelectorAll('[data-lower]')) {
        row.hidden = q ? !row.dataset.lower.includes(q) : (row.dataset.rare === '1' && !open);
      }
    }
    /* The facet's options live in a dialog now, so its search box, its long-tail fold and the
       all/any rule are listened for on the document and let go with the view. */
    const onFacetInput = (ev) => {
      const key = ev.target.dataset?.facetSearch; if (!key) return;
      applyFacetRows(key);
    };
    const onFacetMore = (ev) => {
      const button = ev.target.closest('[data-facet-more]'); if (!button) return;
      const key = button.dataset.facetMore, list = $(`[data-facet-list="${key}"]`); if (!list) return;
      const open = list.dataset.expanded !== '1';
      list.dataset.expanded = open ? '1' : '0';
      const rare = list.querySelectorAll('[data-rare="1"]').length;
      button.textContent = open ? 'Show only what two or more cards share' : `Show ${rare.toLocaleString()} more used by one card`;
      applyFacetRows(key);
    };
    const onModeChange = (ev) => { if (ev.target.name === 'facetMode') { mode = ev.target.value; refresh(currentFocus()); updateFacetCounts(); } };
    document.addEventListener('input', onFacetInput); document.addEventListener('click', onFacetMore); document.addEventListener('change', onModeChange);
    $('#cm-depth').addEventListener('input', (ev) => { depth = Number(ev.target.value); $('#cm-depth-out').textContent = depth; graph?.setDepth(depth); });
    $('#cm-breadth').addEventListener('input', (ev) => { breadth = Number(ev.target.value); $('#cm-breadth-out').textContent = breadth; graph?.setBreadth(breadth); });
    $('#cm-loop-mode').addEventListener('change', (ev) => { loopMode = ev.target.checked; loopTouched = true; loopsCache = {key: '', loops: []}; hidePop(); if (graph) graph.setLoopMode(loopMode); else drawCardView(null, null, true); });

    /* The × on an applied chip means gone, not "next state". */
    actions['facet-drop'] = (el) => { selection = CrankFacets.set(selection, el.dataset.key, el.dataset.value, 'off'); redrawTicks(); refresh(currentFocus()); };
    /* Adding a card from Discover, without leaving the graph. A collection group takes it
       as a planned entry; a draft deck takes it as a main slot. A finalized list is not
       offered, because changing one is a reviewed act on its own page and not a one-tap
       side effect of browsing. */
    async function cardFor(name) {
      const known = C.catalog.exact(name);
      if (!known) throw Error(name + ' is not in the catalog. Open it and use Verify first.');
      return C.catalog.details(known, {onFail: () => {
        C.notice(`Could not reach Scryfall for ${known.name}; showing the facts already saved.`, true);
      }}).catch(() => known);
    }
    actions['discover-to-group'] = async (el) => {
      const group = C.state.groups.find((g) => g.id === el.dataset.group);
      if (!group) throw Error('That collection group no longer exists.');
      const card = await cardFor(el.dataset.card);
      if (group.entries.some((r) => r.cardId === card.id)) throw Error(card.name + ' is already planned in ' + group.name + '.');
      await C.commit({type: 'groupEntries', groupId: group.id, cards: [card],
        entries: [...group.entries.map((r) => ({cardId: r.cardId, quantity: r.quantity, printing: r.printing})), {cardId: card.id, quantity: 1}],
        replace: true, summary: `Added ${card.name} to ${group.name}`}, {renderView: false});
      C.notice(`${card.name} added to ${group.name}. Planning a card is not owning it.`);
    };
    actions['discover-to-deck'] = async (el) => {
      const deck = C.M.deck(C.state, el.dataset.deck);
      if (deck.status !== 'draft') throw Error('Only a draft list can take a card this way.');
      const card = await cardFor(el.dataset.card);
      if (deck.slots.some((r) => r.cardId === card.id && r.purpose === 'main')) throw Error(card.name + ' is already in ' + deck.name + '.');
      const slots = deck.slots.filter((r) => r.purpose === 'main').map((r) => ({cardId: r.cardId, quantity: r.quantity, purpose: 'main', printing: r.printing, pinned: r.pinned}));
      await C.commit({type: 'batch', commands: [{type: 'cards', cards: [card]},
        {type: 'editDeck', deckId: deck.id, slots: [...slots, {cardId: card.id, quantity: 1, purpose: 'main'}]}],
        summary: `Added ${card.name} to ${deck.name}`}, {renderView: false});
      C.notice(`${card.name} added to ${deck.name} — ${slots.length + 1} cards in the list now.`);
    };
    /* PICKING A DECK PUTS ITS COMMANDER IN FOCUS. "In a deck → Krenko Goblins" is a question
       about that deck, and the card the deck is built around is where reading it starts; the
       reader can walk anywhere from there. Only on the way in: clearing the pick, or excluding
       the deck, leaves the focus where it is. Matched by name, the one id the graph and the
       library share. */
    function commanderRow(deckName) {
      const deck = (C.state.decks || []).find((d) => d.name === deckName && !d.archived);
      const lead = deck && deck.commanders && C.state.cards[deck.commanders[0]];
      return lead ? data.cards.find((c) => c.name === lead.name) || null : null;
    }
    actions['facet-term'] = (el) => {
      selection = CrankFacets.toggle(selection, el.dataset.key, el.dataset.value);
      /* Picking how a land enters is asking for lands: the mode comes on with it. */
      if (el.dataset.key === 'enters' && !landsOnly() && CrankFacets.stateOf(selection, 'enters', el.dataset.value) === 'include') selection = CrankFacets.set(selection, 'lands', 'lands only', 'include');
      let focusId = currentFocus();
      if (el.dataset.key === 'decks' && CrankFacets.stateOf(selection, 'decks', el.dataset.value) === 'include') { const lead = commanderRow(el.dataset.value); if (lead) focusId = lead.id; }
      redrawTicks(); refresh(focusId); updateFacetCounts();
    };
    actions['facet-clear'] = () => { selection = {}; loopTouched = false; redrawTicks(); refresh(currentFocus()); updateFacetCounts(); };
    actions['facet-done'] = () => { document.querySelector('dialog[open]')?.close(); };
    /* A FACET OPENS IN A DIALOG: its options A to Z (mana value lowest first), a search box when
       there are many, the same three-state picks as the chips, the all/any rule, Clear for this
       facet and Done. Over the page rather than in it, so nothing shifts under the pointer. */
    actions['facet-open'] = (el) => {
      const key = el.dataset.facet, facet = facets.find((f) => f.key === key); if (!facet) return;
      const rows = sortedRows(key), rare = rows.filter((r) => r.count < 2).length, folds = rare >= FOLD_TAIL && rows.length - rare >= 1;
      const narrow = narrowedFor(key);
      C.modal(facet.label, `<div class="cm-facet-dialog" data-facet-dialog="${e(key)}">
        <p class="cm-muted cm-facet-help">${rows.length.toLocaleString()} option${rows.length === 1 ? '' : 's'}${key === 'mv' ? ', lowest first' : ', A to Z'}. Tap once to show only cards with it, twice to hide them, a third time to let go.${narrow ? ' Counts are under the filters you already have.' : ''}</p>
        ${rows.length > 12 ? `<label class="cm-search"><span class="cm-muted">Find in ${e(facet.label.toLowerCase())}</span><input type="search" data-facet-search="${e(key)}" placeholder="Type to narrow"></label>` : ''}
        <div class="cm-facet-list cm-facet-grid" data-facet-list="${e(key)}" data-expanded="0">${rows.map((row) => pickButton(key, row, folds, narrow)).join('')}</div>
        ${folds ? `<button type="button" class="cm-text-button" data-facet-more="${e(key)}">Show ${rare.toLocaleString()} more used by one card</button>` : ''}
        <div class="cm-facet-dialog-foot"><span class="cm-facet-mode"><span class="cm-muted">A card must match</span><label class="cm-checkbox"><input type="radio" name="facetMode" value="all" ${mode === 'all' ? 'checked' : ''}> all picks</label><label class="cm-checkbox"><input type="radio" name="facetMode" value="any" ${mode === 'any' ? 'checked' : ''}> any pick</label></span><span class="cm-facet-drop-tools">${b('Clear ' + facet.label.toLowerCase(), 'facet-clear-one', {key}, false, {cls: 'compact'})}${b('Done', 'facet-done', {}, true, {cls: 'compact'})}</span></div></div>`);
      redrawTicks();
    };
    actions['facet-clear-one'] = (el) => { selection = {...selection}; delete selection[el.dataset.key]; redrawTicks(); refresh(currentFocus()); updateFacetCounts(); };
    /* The counts in an open facet dialog follow every pick made in it. */
    function narrowedFor(key) { return CrankFacets.count(selection) ? CrankFacets.narrowedCounts(data.cards, selection, C.state, key, {any: mode === 'any'}) : null; }
    function updateFacetCounts() {
      const dialog = document.querySelector('[data-facet-dialog]'); if (!dialog) return;
      const key = dialog.dataset.facetDialog, narrow = narrowedFor(key), byValue = new Map((values[key] || []).map((r) => [String(r.value), r]));
      for (const pick of dialog.querySelectorAll('[data-facet-pick]')) {
        const row = byValue.get(pick.dataset.value); if (!row) continue;
        const {n, note} = countLabel(row, narrow);
        const small = pick.querySelector('small'); if (small) small.textContent = n.toLocaleString();
        pick.classList.toggle('is-empty', n === 0); pick.dataset.count = note;
      }
      const help = dialog.querySelector('.cm-facet-help'); if (help) help.textContent = help.textContent.replace(/ Counts are under the filters you already have\.$/, '') + (narrow ? ' Counts are under the filters you already have.' : '');
      redrawTicks();
    }
    actions['graph-mode'] = (el) => {
      gmode = el.dataset.mode; graph?.setMode(gmode); hidePop();
      for (const btn of document.querySelectorAll('[data-action=graph-mode]')) { const on = btn.dataset.mode === gmode; btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', String(on)); }
      $('#cm-graph-mode-hint').textContent = modeHint(gmode);
      drawCardView(graph?.current(), null, true);
    };
    /* The canvas is drawn to its own measured size and watched by a ResizeObserver, so the
       layout change is enough to redraw it; sizePane() is nudged because the pane's height
       is written in pixels off the canvas rather than read from the grid. */
    actions['graph-stage'] = () => { stage = !stage; if (!stage) tools = false; applyStage(); hidePop(); setPaneWidth(paneWidthStored(), false);
      $('.cm-tools-toggle')?.replaceWith(Object.assign(document.createElement('div'), {innerHTML: toolsButton()}).firstElementChild);
      const host = $('.cm-graph-box'); if (host) host.querySelector('.cm-stage-btn')?.replaceWith(
        Object.assign(document.createElement('div'), {innerHTML: stageButton()}).firstElementChild);
      requestAnimationFrame(() => { sizePane(); dispatchEvent(new Event('resize')); redrawIfList(); }); };
    actions['graph-tools'] = (el) => { tools = !tools; applyStage();
      el.outerHTML = toolsButton();
      requestAnimationFrame(() => { sizePane(); dispatchEvent(new Event('resize')); }); };
    actions['graph-pop-close'] = () => hidePop();
    actions['graph-tick'] = (el) => { const id = el.dataset.id; if (picked.has(id)) picked.delete(id); else picked.add(id); graph?.setSelected(picked); el.classList.toggle('is-on', picked.has(id)); el.textContent = picked.has(id) ? 'Ticked ✓' : 'Tick for a group'; drawCardView(graph?.current(), null, true); };
    actions['results-clear'] = () => { picked = new Set(); graph?.setSelected(picked); drawCardView(graph?.current(), null, true); };
    /* Presentation mode changes which columns the list shows. */
    const redrawIfList = () => { if (paneTab === 'list') drawList(); };

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
      for (const pick of document.querySelectorAll('[data-facet-pick]')) {
        const state = CrankFacets.stateOf(selection, pick.dataset.facetPick, pick.dataset.value);
        pick.classList.toggle('is-on', state === 'include');
        pick.classList.toggle('is-not', state === 'exclude');
        pick.setAttribute('aria-pressed', state === 'off' ? 'false' : 'true');
        pick.title = (state === 'include' ? 'Showing only cards with this — tap to exclude them instead'
          : state === 'exclude' ? 'Hiding cards with this — tap to clear' : 'Tap to show only cards with this') + (pick.dataset.count ? ' · ' + pick.dataset.count : '');
      }
    }

    /* FIND A CARD. Typing narrows the suggestions and an exact name focuses at once, as
       before. Enter is the new part: it takes the best match for whatever is typed -- the
       exact name, else the name that starts with it, else one that contains it, the most
       played first -- and makes it the focus. A match that the filters keep off the canvas
       goes through the route instead, which is how the picker brings a card in. */
    const rankOf = (c) => (Number.isFinite(c.rank) ? c.rank : Infinity);
    function bestMatch(q) {
      q = q.trim().toLowerCase(); if (!q) return null;
      const tier = (name) => (name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3);
      let best = null, bestKey = null;
      for (const c of data.cards) {
        const t = tier(c.name.toLowerCase()); if (t === 3) continue;
        const key = [t, rankOf(c), c.name];
        if (!best || key[0] < bestKey[0] || key[0] === bestKey[0] && (key[1] < bestKey[1] || key[1] === bestKey[1] && key[2] < bestKey[2])) { best = c; bestKey = key; }
      }
      return best;
    }
    /* A card the filters keep off the canvas cannot be selected on it -- select() is a
       no-op for an id the graph does not hold, which is what "I picked it and nothing
       happened" was. refresh() already keeps a focus the filters would drop, so the
       filtered-out case goes through it and the card arrives as the focus with its own
       neighbourhood drawn around it. */
    function focusOn(c) {
      if (!c) return false;
      if (isLand(c)) {
        if (!landsOnly()) { selection = CrankFacets.set(selection, 'lands', 'lands only', 'include'); redrawTicks(); }
        listCard = c; revealCard = true; refresh(c.id);
        pane.querySelector('.cm-list-detail')?.scrollIntoView({block: 'nearest'});
        return true;
      }
      if (landsOnly()) { selection = CrankFacets.set(selection, 'lands', 'lands only', 'off'); redrawTicks(); listCard = null; refresh(c.id); return true; }
      graph?.select(c.id);
      if (graph && graph.current() && graph.current().id === c.id) return true;
      refresh(c.id);
      return true;
    }
    $('#cm-graph-query').addEventListener('input', (ev) => {
      const q = ev.target.value.toLowerCase();
      const hits = data.cards.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
      $('#cm-graph-names').innerHTML = hits.map((c) => `<option value="${e(c.name)}"></option>`).join('');
      const exact = data.cards.find((c) => c.name.toLowerCase() === q);
      if (exact) focusOn(exact);
    });
    /* Picking a suggestion fires input in every browser that has a datalist, and change on
       the ones that only fire it on commit; both land here. */
    $('#cm-graph-query').addEventListener('change', (ev) => { const exact = data.cards.find((c) => c.name.toLowerCase() === ev.target.value.trim().toLowerCase()); if (exact) focusOn(exact); });
    $('#cm-graph-query').addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const hit = bestMatch(ev.target.value);
      if (!hit) { C.notice(`No card on the graph matches “${ev.target.value.trim()}”. Search catalog / link looks further.`); return; }
      ev.target.value = hit.name; ev.target.blur();
      focusOn(hit);
    });
    $('[name=edgeType]').addEventListener('change', (ev) => graph?.setType(ev.target.value));

    return () => { document.getElementById('matrix-v2')?.classList.remove('cm-stage', 'cm-tools-open');
      document.removeEventListener('keydown', onKey); document.removeEventListener('click', onDocClick); document.removeEventListener('input', onFacetInput); document.removeEventListener('click', onFacetMore); document.removeEventListener('change', onModeChange); removeEventListener('resize', sizePane); paneObserver.disconnect(); cancelAnimationFrame(paneFrame); graph?.destroy(); graph = null; };
  };

  actions['graph-lookup'] = () => C.cardPicker('Find a card to explore', async (c) => {
    if (!C.state.cards[c.id]) await C.commit({type: 'cards', cards: [c]}, {renderView: false});
    C.$('#cm-dialog').close();
    C.go('discover', {card: c.id});
  });
  actions['graph-card'] = (el) => { graph?.select(el.dataset.id); };
  actions['graph-back'] = () => graph?.back();
  actions['graph-reset'] = () => graph?.reset();
});
