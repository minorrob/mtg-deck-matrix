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
  /* THE ROLE LENS (Phase D): a mode of the List tab, on only while a deck is picked under
     Yours. `lensId` is one of CrankLens.LENSES or '' for the plain list; the route can set it
     (#discover?lens=Removal&deck=<id>) and the select in the list head changes it. */
  let lensId = '';
  /* THE TRACE (T2/T3 of docs/crankmagic-strategy-trace-plan.md): the pane's third tab. With a
     deck picked, the graph is remounted over the deck's hundred (or the candidate pool) in
     trace mode and the pane plays the list. `traceTicks` is what the reader ticked this
     session, persisted to the deck definition as `strategies`. */
  let traceOn = false, traceWorld = 'deck', traceResult = null, traceTicks = null, wantTrace = false;
  /* THE TRACE'S LIMITS (Rob, 14 September): cards lit (a hundred at most -- a deck's worth),
     the longest loop the finder closes, and how deep the chain runs. A library preference,
     read here and passed to every trace the pane runs; the module clamps them again. */
  const traceLimits = () => { const p = (C.state.preferences && C.state.preferences.traceLimits) || {}, T = globalThis.CrankTrace, D = T ? T.LIMITS : {maxCards: 100, maxLoop: 4, maxRing: 3, loopMin: 2, loopMax: 6, cardsMin: 10};
    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
    return {maxCards: clamp(p.cards, D.cardsMin, D.maxCards, D.maxCards), maxLoop: clamp(p.loop, D.loopMin, D.loopMax, D.maxLoop), maxRing: clamp(p.rings, 1, D.maxRing, D.maxRing)}; };
  /* The cards ticked in the trace list, by name; cleared when the deck or the world changes. */
  let traceChosen = new Set();
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
    C.HELP.discover = {title: 'Discover', body: '<p>The connected card catalog: follow a card into the cards it is joined to, inspect the evidence for each link, and take what you find into a group or a deck.</p><p><strong>Trace</strong> (the pane\'s third tab, with a deck picked under Yours, or <em>Trace</em> on the deck page) lights the deck from its commander outward: only the joins that serve the deck\'s strategies, loop-backs in gold, the cards it never touches ghosted on the outer band. The list in the pane is the product; the animation shows how it was chosen. The trace score is a heuristic and is labelled one; the measured score beside it is Measure\'s.</p><p>Structural links (shared mechanics and roles) and observed co-play (EDHREC) are different kinds of evidence. Neither claims a simulated improvement.</p><p>In the card pane and the pop-ups, the term with the gold ring is the card’s <strong>Primary Purpose</strong>: the one job it is in a deck for, decided by a fixed ladder (finisher, extra turn, board wipe, multiplier, untap engine, copier, blink, team quality, tutor, sacrifice outlet, removal, draw, ramp, token maker, payoff, and so on down to its body and its tribe). In a filter dialog the count beside an option is what you would have under the filters already applied; the whole-graph figure is on the hover. Picking a deck under <strong>Yours</strong> puts its commander in focus, and dragging the divider beside the graph grows the card picture up to 70%.</p><p><strong>Loops only</strong>, on by default when a deck is picked, walks only the joins that continue or pay off a loop: an untap, copy or blink onto a tap ability worth another go, a repeatable supply into a demand, an event one card causes and another fires on. <strong>Loops this card is in</strong> lists every cycle of four cards or fewer through the focus, each step named and the missing pieces dashed, with the cards that turn each pass into damage, cards or mana.</p>'};
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
    const names = new Set(data.cards.map((c) => c.name)), ids = new Set(data.cards.map((c) => c.id));
    for (const c of C.cards()) {
      if (!names.has(c.name) && !(c.oracleId && ids.has(c.oracleId))) data.cards.push({...c, id: c.oracleId || c.id, type: c.typeLine, ci: (c.colorIdentity || []).join(''), image: c.image});
    }
    /* A library or catalog card's row on the graph: by oracle id (the row's id), then by name
       for a card saved before it had one. */
    const byGraphId = new Map(data.cards.map((c) => [c.id, c]));
    const rowFor = (card) => (card ? (card.oracleId && byGraphId.get(card.oracleId)) || data.cards.find((c) => c.name === card.name) || null : null);

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
    /* EXPLORE SCOPE: query contract for scoped entry into Discover.
     * Support deck=<deckId>, commander=<name>, card=<name>, gap=<slot|role|purpose token>.
     * When none are present, show a chooser instead of auto-loading the full graph. */
    const RECENTS_KEY = 'crankmagic:discover:recents:v1';
    function getRecentScopes() {
      try {
        const stored = localStorage.getItem(RECENTS_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
      } catch { return []; }
    }
    function saveRecentScope(scope) {
      try {
        const recents = getRecentScopes().filter((r) => !(r.type === scope.type && r.id === scope.id));
        recents.unshift(scope);
        localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, 8)));
      } catch { /* localStorage unavailable */ }
    }
    function clearRecentScopes() {
      try { localStorage.removeItem(RECENTS_KEY); } catch { /* localStorage unavailable */ }
    }

    const scopeParams = {
      deck: params.get('deck'),
      commander: params.get('commander'),
      card: params.get('card'),
      gap: params.get('gap')
    };
    const hasScope = !!(scopeParams.deck || scopeParams.commander || scopeParams.card);

    /* If no scope params, show the chooser instead of entering the graph. */
    if (!hasScope) {
      const recents = getRecentScopes();
      C.main.innerHTML = C.pageHead('Discover', '', 'discover')
        + `<div class="cm-explore-chooser">
          <p class="cm-explore-intro">Explore cards from one of three doors:</p>
          <div class="cm-explore-doors">
            <button type="button" class="v-button cm-explore-door" data-action="explore-from-deck">
              <strong>From a deck gap</strong>
              <span>Find cards to fill a need in one of your decks</span>
            </button>
            <button type="button" class="v-button cm-explore-door" data-action="explore-from-commander">
              <strong>From a commander</strong>
              <span>Discover cards that fit a specific commander</span>
            </button>
            <button type="button" class="v-button cm-explore-door" data-action="explore-from-card">
              <strong>From a card</strong>
              <span>Explore connections from any card in the catalog</span>
            </button>
          </div>
          ${recents.length ? `<div class="cm-explore-recents">
            <p class="cm-muted">Recent scopes</p>
            <div class="cm-explore-recent-chips">${recents.map((r) => `<button type="button" class="cm-chip" data-action="explore-recent" data-recent="${e(JSON.stringify(r))}">${e(r.label)}</button>`).join('')}
            <button type="button" class="cm-text-button compact" data-action="explore-clear-recents">Clear</button></div>
          </div>` : ''}
        </div>`;

      actions['explore-from-deck'] = () => {
        const decks = C.state.decks.filter((d) => !d.archived);
        if (!decks.length) { C.notice('You have no decks yet. Create one from the Decks page first.'); return; }
        C.modal('Explore from a deck gap', `<form class="cm-form">
          <div class="cm-form-grid">${C.select('Deck', 'deck', decks.map((d) => [d.id, d.name]), decks[0].id, 'required')}
          ${C.field('Gap (optional)', 'gap', '', 'placeholder="e.g. Removal, Ramp, Draw"')}
          <div class="cm-full"><p class="cm-muted">The gap param is recorded for future use but does not affect Discover behavior in slice A.</p></div></div>
          <div class="cm-form-footer">${b('Cancel', 'close')}<button class="v-button primary" type="submit">Explore deck</button></div>
        </form>`).querySelector('form').addEventListener('submit', (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const deckId = fd.get('deck'), gap = fd.get('gap');
          const deck = C.state.decks.find((d) => d.id === deckId);
          if (deck) {
            saveRecentScope({type: 'deck', id: deckId, label: deck.name + (gap ? ` (${gap})` : ''), gap: gap || undefined});
            C.$('#cm-dialog').close();
            C.go('discover', {deck: deckId, ...(gap ? {gap} : {})});
          }
        });
      };

      actions['explore-from-commander'] = () => {
        const commanders = data.cards.filter((c) => c.isCommander).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        C.modal('Explore from a commander', `<form class="cm-form">
          <div class="cm-form-grid"><label>Commander name<input name="commander" list="cm-commander-list" placeholder="Type a commander name" required autocomplete="off"></label>
          <datalist id="cm-commander-list">${commanders.slice(0, 200).map((c) => `<option value="${e(c.name)}"></option>`).join('')}</datalist>
          <div class="cm-full"><p class="cm-muted">${commanders.length.toLocaleString()} commanders in the catalog.</p></div></div>
          <div class="cm-form-footer">${b('Cancel', 'close')}<button class="v-button primary" type="submit">Explore commander</button></div>
        </form>`).querySelector('form').addEventListener('submit', (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          const name = (fd.get('commander') || '').trim();
          const card = data.cards.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.isCommander);
          if (!card) { C.notice(`"${name}" is not a commander in the catalog.`, true); return; }
          saveRecentScope({type: 'commander', id: card.name, label: card.name});
          C.$('#cm-dialog').close();
          C.go('discover', {commander: card.name});
        });
      };

      actions['explore-from-card'] = () => {
        C.cardPicker('Explore from a card', async (c) => {
          if (!C.state.cards[c.id]) await C.commit({type: 'cards', cards: [c]}, {renderView: false});
          saveRecentScope({type: 'card', id: c.name, label: c.name});
          C.$('#cm-dialog').close();
          C.go('discover', {card: c.name});
        });
      };

      actions['explore-recent'] = (el) => {
        try {
          const scope = JSON.parse(el.dataset.recent);
          if (scope.type === 'deck') C.go('discover', {deck: scope.id, ...(scope.gap ? {gap: scope.gap} : {})});
          else if (scope.type === 'commander') C.go('discover', {commander: scope.id});
          else if (scope.type === 'card') C.go('discover', {card: scope.id});
        } catch (err) { C.notice('Could not restore that recent scope.', true); }
      };

      actions['explore-clear-recents'] = () => {
        clearRecentScopes();
        C.render();
      };

      return () => {};
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
        <aside class="v-panel cm-card-view" id="cm-card-view" aria-live="polite"><div class="cm-pane-tabs" role="tablist" aria-label="Card pane">${tabButton('card', 'Card Info')}${tabButton('list', 'List')}${tabButton('trace', 'Trace')}</div><div id="cm-pane-body"></div></aside>
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
        owned: CrankFacets.owns(C.state),
        onNeighbors(c, neighbors, trailLength, info) {
          /* A new focus clears the card the list opened; a re-layout of the same focus (a
             resize, a slider) does not, or opening a row would undo itself. */
          if ((c && c.id) !== lastFocusId) { listCard = null; listPage = 0; }
          lastFocusId = c && c.id;
          drawCardView(c, info);
          if (graph) { graph.setMode(gmode); graph.setSelected(picked); }
        },
        onPick(card, ids) { picked = ids; drawCardView(graph.current(), null, true); },
        onHit: showPop,
        onTrace(state) { if (state === null && traceOn) { traceOn = false; traceResult = null; if (paneTab === 'trace') { paneTab = 'card'; applyTab(); } return; } updateTraceProgress(state); }
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
    /* WHICH CARD THE POP-UP IS ABOUT, so a second tap on the same node can close it (Rob,
       16 September). The pop-up opens on a tap in Inspect; tapping that same card again is the
       reader putting it down, not asking for it twice. Anywhere else still opens the new card. */
    let popId = '';
    /* WHAT YOU HOLD OF THIS CARD, AND WHO CLAIMS IT (Rob, 16 September). The graph could tell you
       everything about a card except the two things you actually decide on: how many you have, and
       whether any deck is waiting for it. A deck counts as claiming the card when it has a copy
       reserved OR when the card is in its committed hundred and the copy has not arrived yet --
       the second is the case that matters, because that is a deck still owed the card. No deck at
       all says so in words rather than leaving a blank. */
    function holdings(cardId) {
      const lots = (C.state.lots || []).filter((l) => l.cardId === cardId);
      const sum = (f) => lots.filter(f).reduce((n, l) => n + (Number(l.quantity) || 0), 0);
      const decks = new Map();
      for (const l of lots) if (l.allocation && l.allocation.deckId) decks.set(l.allocation.deckId, true);
      for (const d of C.state.decks || []) {
        if (d.archived || decks.has(d.id)) continue;
        if ((d.slots || []).some((r) => r.cardId === cardId && r.committed)) decks.set(d.id, true);
      }
      const named = [...decks.keys()].map((id) => (C.state.decks || []).find((d) => d.id === id)).filter(Boolean).map((d) => d.name);
      return {owned: sum((l) => l.source === 'owned'), ordered: sum((l) => l.source === 'ordered'),
        watching: sum((l) => l.source === 'watching'), reserved: sum((l) => !!l.allocation), decks: named};
    }
    function holdingsHTML(cardId) {
      const h = holdings(cardId);
      const counts = [`${h.owned} owned`, `${h.reserved} reserved`];
      if (h.ordered) counts.push(`${h.ordered} ordered`);
      if (h.watching) counts.push(`${h.watching} watched`);
      return `<p class="cm-holdings"><span class="cm-holdings-counts">${counts.join(' · ')}</span>`
        + `<span class="cm-holdings-decks">${h.decks.length ? e(h.decks.join(' · ')) : '<em>Not assigned</em>'}</span></p>`;
    }
    function showPop(hit) {
      const pop = $('#cm-graph-pop'); if (!pop) return;
      if (!hit) { hidePop(); return; }
      if (hit.kind === 'node' && popId === hit.card.id && !pop.hidden) { hidePop(); return; }
      popId = hit.kind === 'node' ? hit.card.id : '';
      const focus = graph?.current();
      if (hit.kind === 'node') {
        /* THE CARD POP-UP IS THE CARD AND ITS CONNECTION, NOTHING ELSE. The picture at large
           size, the four facts a player reads off a card (type, cost, rarity and set, price),
           the one chip that is its Primary Purpose, and how it is joined to the focus. Its
           full term list -- a dozen chips that made the pop-up a wall -- now lives under
           Inspect card, where the rules text it comes from is. */
        const rec = C.catalog.exact(hit.card.name) || {}, image = rec.image || hit.card.image || '', p = purposeOf(hit.card);
        const facts = [rec.rarity ? e(rec.rarity) : '', rec.setName || rec.set || hit.card.set ? e(rec.setName || rec.set || hit.card.set) : '', Number.isFinite(rec.price) ? e(C.money(rec.price)) : Number.isFinite(hit.card.price) ? e(C.money(hit.card.price)) : ''].filter(Boolean);
        const initials = String(hit.card.name).split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
        pop.classList.add('cm-pop-card');
        /* The picture at the inspector's size, the three buttons stacked on its left, the mana
           pips on the type line, and a narrower column for the rest (Rob, 14 September). */
        pop.innerHTML = `<header><strong>${e(hit.card.name)}</strong><button type="button" class="cm-pop-close" data-action="graph-pop-close" aria-label="Close">×</button></header>
          <div class="cm-pop-body"><div class="cm-pop-side">${b('Focus here', 'graph-card', {id: hit.card.id}, true, {cls: 'compact'})}${b('Inspect card', 'card', {card: CrankCatalog.key(hit.card.name)}, false, {cls: 'compact'})}<button type="button" class="v-button compact${picked.has(hit.card.id) ? ' is-on' : ''}" data-action="graph-tick" data-id="${e(hit.card.id)}">${picked.has(hit.card.id) ? 'Ticked ✓' : 'Tick for a group'}</button>${buyMenu(hit.card, rec)}</div>
          <div class="cm-pop-art">${image ? `<img src="${e(image)}" alt="" loading="lazy">` : `<div class="cm-pop-noart" aria-hidden="true">${e(initials)}</div>`}</div><div class="cm-pop-meta">
          <p class="cm-pop-type">${rec.manaCost ? C.mana(rec.manaCost) : ''}<span class="cm-muted">${e(rec.typeLine || hit.card.type || '')}${hit.pinned ? ' · where you came from' : ''}</span></p>
          ${facts.length ? `<p class="cm-pop-facts">${facts.join(' · ')}</p>` : ''}
          ${holdingsHTML(CrankCatalog.key(hit.card.name))}
          ${p ? `<div class="cm-term-chips">${termChip(p.key, p.value, p)}</div>` : ''}
          ${focus && focus.id !== hit.card.id ? `<h4>Joined to ${e(focus.name)} by</h4>${relationHTML(hit.relation, hit.card, focus)}` : '<p class="cm-muted">This is the focus. Tap another card to read how it joins.</p>'}
          </div></div>`;
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
    function hidePop() { popId = ''; const pop = $('#cm-graph-pop'); if (pop && !pop.hidden) { pop.hidden = true; pop.innerHTML = ''; } graph?.setHighlight(null); }
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
      document.querySelector('.cm-graph-grid')?.classList.toggle('cm-list-open', paneTab === 'list' || paneTab === 'trace');
    }
    actions['pane-tab'] = (el) => {
      const was = paneTab; paneTab = el.dataset.tab; listCard = null; applyTab(); lastDrawn = '';
      if (paneTab === 'trace') { traceOn = true; runTrace(true); }
      else { if (was === 'trace') stopTrace(); else drawCardView(listCard || graph?.current(), null, true); }
      requestAnimationFrame(() => { sizePane(); dispatchEvent(new Event('resize')); });
    };
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
    /* The deck picked under Yours, as the lens needs it. */
    function pickedDeck() {
      const name = (selection.decks || []).find((v) => !String(v).startsWith(CrankFacets.NOT));
      return name ? (C.state.decks || []).find((d) => d.name === name && !d.archived) || null : null;
    }
    const lensSelect = () => {
      const deck = pickedDeck(); if (!deck || !globalThis.CrankLens) return '';
      return `<label class="cm-lens-pick">Lens <select name="lens" aria-label="Role lens">${[['', 'None — the whole list'], ...CrankLens.LENSES.map((l) => [l.id, l.id])].map(([v, label]) => `<option value="${e(v)}"${v === lensId ? ' selected' : ''}>${e(label)}</option>`).join('')}</select></label>`;
    };
    /* The commander's co-play row, from the pairs the page already holds. Cached per commander. */
    const coCache = new Map();
    function coPlayOf(oid) {
      if (!oid || !Array.isArray(data.played) || !data.played.length) return null;
      if (!coCache.has(oid)) {
        const m = new Map();
        for (const p of data.played) { if (p.from === oid) m.set(p.to, p); else if (p.to === oid) m.set(p.from, p); }
        coCache.set(oid, m);
      }
      return coCache.get(oid);
    }
    function lensResult() {
      const deck = pickedDeck(); if (!deck || !lensId || !globalThis.CrankLens) return null;
      return CrankLens.lens(C.state, deck, lensId, {cardOf: (id) => C.card(id), coPlay: coPlayOf, byOracle: (oid) => (C.catalog.oracle ? C.catalog.oracle(oid) : null)});
    }
    /* THE LENS, DRAWN. Left: the deck's cards in the role, the count against the house minimum
       in the warning treatment when under. Right: the candidates, ranked, one Swap for... each.
       Both lists are the pure module's rows; nothing is computed here. */
    function drawLens(r) {
      const badge = `<span class="cm-badge ${r.under ? 'warn' : 'good'} cm-lens-count">${r.count}${r.min !== null ? ` / ${r.min}` : ''}</span>`;
      const own = {owned: 'Owned', ordered: 'Ordered', none: 'Not owned'};
      const src = {bench: 'bench', ordered: 'on order', buy: 'buy list', upgrade: 'linked upgrade', played: 'co-play'};
      const haveRows = r.have.map((h) => `<li class="cm-lens-row"><button type="button" class="cm-card-name" data-action="card" data-card="${e(h.cardId)}">${e(h.name)}</button><span class="cm-muted">${h.quantity > 1 ? `×${h.quantity} · ` : ''}${e(h.roles.join(', '))}${h.option ? ' · Option' : ''}</span><span class="cm-lens-price">${h.price === null ? '' : C.money(h.price)}</span></li>`).join('');
      const candRows = r.candidates.slice(0, 40).map((c) => `<li class="cm-lens-row cm-lens-cand"><button type="button" class="cm-card-name" data-action="card" data-card="${e(c.cardId)}">${e(c.name)}</button><span class="cm-muted">${e(own[c.owned])} · ${e(c.sources.map((s) => src[s] || s).join(', '))}${c.coPlay ? ` · ${Math.round(c.coPlay.inclusion * 100)}% of ${e(r.commander ? r.commander.name : 'the commander')}'s decks` : ''}</span><span class="cm-lens-price">${c.price === null ? '' : C.money(c.price)}</span>${r.deck.status === 'final' || r.deck.status === 'draft' ? `<button type="button" class="v-button compact" data-action="lens-swap" data-card="${e(c.cardId)}">Swap for…</button>` : ''}</li>`).join('');
      view.innerHTML = `<div class="cm-list-head cm-lens">${lensSelect()}
        <h3 class="cm-lens-head">${e(r.lens)} in ${e(r.deck.name)} ${badge}</h3>
        ${r.under ? note(`Under the house minimum: ${r.min - r.count} more to reach ${r.min}. The minimums are the rules module's (crankmagic-rules.js).`, true) : `<p class="cm-muted">${r.min !== null ? `At or over the house minimum of ${r.min}.` : 'No house minimum for this role; the count is shown plain.'}</p>`}
        <div class="cm-lens-cols">
          <section><h4>In the deck <small>${r.have.length}</small></h4>${haveRows ? `<ul class="cm-lens-list">${haveRows}</ul>` : '<p class="cm-muted">No card in the hundred carries this role.</p>'}</section>
          <section><h4>Could join it <small>${r.candidates.length}</small></h4>${candRows ? `<ul class="cm-lens-list">${candRows}</ul>${r.candidates.length > 40 ? `<p class="cm-muted">${r.candidates.length - 40} more, further down the ranking.</p>` : ''}` : '<p class="cm-muted">Nothing outside the hundred carries this role inside the deck\'s colours — not the bench, the buy list, the linked upgrades or the commander\'s co-play neighbours.</p>'}
            <p class="cm-muted cm-lens-foot">Ranked by how often the commander\'s real decks run the card, then owned before ordered before not owned. <em>Swap for…</em> links the card as an uncommitted upgrade option on a slot you choose; the hundred does not change.</p></section>
        </div></div>`;
      $('#cm-graph-size').textContent = lastInfo && lastInfo.total ? `${lastInfo.total} on canvas · lens: ${r.lens}` : '';
      sizePane();
    }
    /* ------------------------------------------------------------------ THE TRACE
       The deck picked under Yours is the subject. `traceRows` is the set walked: the hundred
       as graph rows (This deck), or the hundred plus the candidates -- the library, the deck's
       linked options and the commander's co-play neighbours -- inside the definition's fence
       (What it could be). CrankTrace walks it; the graph plays it; this pane lists it. */
    const tracePick = () => pickedDeck();
    function traceStrategies(deck, commanderRow) {
      const S = globalThis.CrankStrategies;
      return S.forDeck({commanderStrategies: S.derive(commanderRow), mechanics: deck.definition.mechanics, ticked: traceTicks || (deck.definition.strategies && deck.definition.strategies.length ? deck.definition.strategies : null)});
    }
    function traceRows(deck, commanderRow) {
      const seen = new Set([commanderRow.id]), hundred = [];
      for (const r of deck.slots.filter((x) => x.purpose === 'main')) { const row = rowFor(C.card(r.cardId)); if (row && !seen.has(row.id)) { seen.add(row.id); hundred.push(row); } }
      if (traceWorld !== 'pool') return {rows: hundred, fence: null, inDeck: new Set(hundred.map((r) => r.id))};
      const inDeck = new Set(hundred.map((r) => r.id)), pool = [...hundred];
      const add = (row) => { if (row && !seen.has(row.id)) { seen.add(row.id); pool.push(row); } };
      for (const c of C.cards()) add(rowFor(c));
      for (const r of deck.slots.filter((x) => x.purpose !== 'main')) add(rowFor(C.card(r.cardId)));
      const lead = C.card(deck.commanders[0]), co = coPlayOf(lead && lead.oracleId);
      if (co) for (const oid of [...co.keys()].sort((a, b) => co.get(b).inclusion - co.get(a).inclusion).slice(0, 200)) add(byGraphId.get(oid));
      const identity = new Set((lead && lead.colorIdentity) || []), cap = deck.definition.perCardCap;
      const fence = (row) => {
        if (inDeck.has(row.id)) return {ok: true};
        if (String(row.ci || '').split('').some((x) => x && !identity.has(x))) return {ok: false, why: 'outside the colour identity'};
        const rec = C.catalog.exact(row.name);
        if (cap !== null && cap !== undefined && rec && Number.isFinite(rec.price) && rec.price > cap) return {ok: false, why: `over the per-card cap (${C.money(rec.price)})`};
        return {ok: true};
      };
      return {rows: pool, fence, inDeck};
    }
    function runTrace(autoplay) {
      const deck = tracePick(), T = globalThis.CrankTrace, S = globalThis.CrankStrategies;
      const lead = deck && C.card(deck.commanders[0]), commanderRow = lead ? rowFor(lead) : null;
      if (!deck || !T || !S || !commanderRow) { traceResult = null; drawTracePane(); return; }
      const {rows, fence, inDeck} = traceRows(deck, commanderRow);
      const owns = CrankFacets.owns(C.state), held = globalThis.CrankLens ? CrankLens.holdings(C.state) : new Map();
      const statusOf = (row) => { const rec = C.catalog.exact(row.name) || {}; const h = rec.id ? held.get(rec.id) : null; return {status: inDeck.has(row.id) ? 'in deck' : owns.has(row) ? 'owned' : h && h.ordered ? 'on order' : 'not owned', price: Number.isFinite(rec.price) ? rec.price : null}; };
      const strategies = traceStrategies(deck, commanderRow);
      traceResult = T.trace(commanderRow, rows, CrankGraph.relate, strategies, {purposeOf: globalThis.MtgCardClassify ? MtgCardClassify.purposeOf : null, statusOf, fence, ...traceLimits()});
      /* Each offered strategy on its own, so the ticks say what they light. Beamed for the pool. */
      const aloneOpts = {statusOf, fence, beam: traceWorld === 'pool' ? {1: 60, 2: 40, 3: 30} : null, ...traceLimits()};
      traceResult.alone = Object.fromEntries(S.ids().filter((id) => S.derive(commanderRow).includes(id) || S.fromMechanics(deck.definition.mechanics).includes(id) || strategies.includes(id)).map((id) => { const one = T.trace(commanderRow, rows, CrankGraph.relate, [id], aloneOpts); return [id, one ? one.lit : 0]; }));
      traceResult.deckId = deck.id; traceResult.deckName = deck.name; traceResult.world = traceWorld; traceResult.offered = S.ids().filter((id) => S.derive(commanderRow).includes(id) || S.fromMechanics(deck.definition.mechanics).includes(id) || strategies.includes(id));
      traceResult.measured = (C.state.reports || []).filter((r) => r.deckId === deck.id && r.origin === 'measured').slice(-1).map((r) => r.metrics && r.metrics.score && r.metrics.score.value)[0];
      mount([commanderRow, ...rows.filter((r) => r.id !== commanderRow.id)], commanderRow.id);
      graph.setTrace(traceResult, {autoplay});
      drawTracePane();
    }
    function stopTrace() {
      traceOn = false; traceResult = null; traceChosen = new Set();
      if (graph && graph.tracing) graph.setTrace(null);
      refresh(currentFocus());
    }
    function updateTraceProgress(state) {
      if (!state || paneTab !== 'trace') return;
      const at = $('#cm-trace-at'); if (at) at.textContent = `${state.lit} of ${state.total} lit${state.playing ? ' · playing' : state.done ? '' : ' · paused'}`;
      const play = $('#cm-trace-play'); if (play) play.textContent = state.playing ? 'Pause' : state.done ? 'Replay' : 'Play';
      for (const row of view.querySelectorAll('.cm-trace-row[data-order]')) row.classList.toggle('is-lit', Number(row.dataset.order) <= state.lit);
    }
    function drawTracePane() {
      const deck = tracePick(), S = globalThis.CrankStrategies, T = globalThis.CrankTrace;
      if (!deck) { view.innerHTML = `<div class="cm-list-head cm-trace"><h3 class="cm-trace-head">Trace</h3><p class="cm-muted">Pick a deck under <strong>Yours</strong> and the trace lights it from the commander outward: the joins that serve its strategies, the loops that come back, the cards it never touches. Or open a deck page and press <em>Trace</em>.</p></div>`; sizePane(); return; }
      const r = traceResult;
      if (!r || !S || !T) { view.innerHTML = `<div class="cm-list-head cm-trace"><h3 class="cm-trace-head">Trace: ${e(deck.name)}</h3><p class="cm-muted">${r === null && !globalThis.CrankTrace ? 'The trace module has not loaded yet.' : 'The commander is not in the graph, so there is nothing to trace from.'}</p></div>`; sizePane(); return; }
      const st = graph && graph.tracing ? graph.traceState : null, litNow = st ? st.lit : r.lit;
      const ticked = new Set(r.strategies);
      /* What each tick lights on its own, so unticking one is legible: a card stays lit while any
         ticked strategy reaches it, and many joins serve several at once. */
      const alone = r.alone || {};
      const strategyTicks = r.offered.map((id) => `<label class="cm-checkbox cm-trace-tick-strategy"><input type="checkbox" name="traceStrategy" value="${e(id)}"${ticked.has(id) ? ' checked' : ''}> ${e(S.labelOf(id))}${alone[id] !== undefined ? `<small title="Cards this strategy lights on its own">${alone[id]}</small>` : ''}</label>`).join('');
      const more = S.ids().filter((id) => !r.offered.includes(id));
      const moreTicks = more.length ? `<details class="cm-inline-menu cm-hint"><summary class="cm-hint-btn" title="More strategies" aria-label="More strategies">+${more.length}</summary><div class="cm-menu cm-inline-menu-body cm-trace-strategies">${more.map((id) => `<label class="cm-checkbox"><input type="checkbox" name="traceStrategy" value="${e(id)}"${ticked.has(id) ? ' checked' : ''}> ${e(S.labelOf(id))}</label>`).join('')}</div></details>` : '';
      const status = {'in deck': ['In deck', ''], owned: ['Owned', 'good'], 'on order': ['On order', ''], 'not owned': ['Not owned', 'warn']};
      const groups = r.groups.map((g) => {
        const rows = g.ids.map((id) => r.list.find((x) => x.id === id)).map((x) => {
          const key = CrankCatalog.key(x.name), act = r.world === 'pool' && x.status !== 'in deck'
            ? (deck.status === 'draft' ? `<button type="button" class="v-button compact" data-action="discover-to-deck" data-card="${e(x.name)}" data-deck="${e(deck.id)}">Add to deck</button>` : `<button type="button" class="v-button compact" data-action="trace-option" data-card="${e(key)}">Link as option</button>`) : '';
          const pill = r.world === 'pool' && x.status ? `<span class="cm-badge ${status[x.status] ? status[x.status][1] : ''}">${e(status[x.status] ? status[x.status][0] : x.status)}</span>` : '';
          return `<li class="cm-trace-row${x.order <= litNow ? ' is-lit' : ''}${traceChosen.has(x.name) ? ' is-ticked' : ''}" data-order="${x.order}"><input type="checkbox" class="cm-trace-pick" name="tracePick" value="${e(x.name)}" aria-label="Tick ${e(x.name)}"${traceChosen.has(x.name) ? ' checked' : ''}><span class="k">${x.order}</span><span class="cm-trace-ring r${x.ring}">${x.ring}</span><button type="button" class="cm-card-name" data-action="card" data-card="${e(key)}">${e(x.name)}${x.purpose ? `<em>${e(x.purpose)}</em>` : ''}</button>${x.loopBacks ? `<span class="loop">×${x.loopBacks} loop-back${x.loopBacks === 1 ? '' : 's'}</span>` : pill}<span class="via">${e(x.via ? x.via.says : '')}${act ? ' · ' : ''}${act}</span></li>`;
        }).join('');
        return `<h4 class="cm-trace-group">Ring ${g.ring} · ${e(g.label)}<small>${g.ids.length}</small></h4><ol class="cm-trace-list">${rows}</ol>`;
      }).join('');
      const outside = r.outsideDefinition.length ? `<div class="cm-trace-out"><strong>Would help, outside the definition:</strong><ul>${r.outsideDefinition.slice(0, 12).map((o) => `<li>${e(o.name)} — ${e(o.why)}</li>`).join('')}${r.outsideDefinition.length > 12 ? `<li>and ${r.outsideDefinition.length - 12} more</li>` : ''}</ul></div>` : '';
      view.innerHTML = `<div class="cm-list-head cm-trace">
        <h3 class="cm-trace-head">Trace: what ${e(deck.name)} builds from ${e(r.commander.name)}</h3>
        <div class="cm-trace-worlds" role="group" aria-label="What to trace">${b('This deck', 'trace-world', {world: 'deck'}, r.world !== 'pool', {cls: 'compact'})}${b('What it could be', 'trace-world', {world: 'pool'}, r.world === 'pool', {cls: 'compact'})}${deck.status === 'final' ? b('Make the change', 'deck-change', {deck: deck.id}, false, {cls: 'compact'}) : ''}</div>
        <p class="cm-trace-sub cm-muted">Strategies traced — a card stays lit while any ticked strategy reaches it; the small number is what a strategy lights on its own. Your ticks stay with the deck.${traceTicks || (deck.definition.strategies && deck.definition.strategies.length) ? ` ${b('Reset to the commander’s own', 'trace-reset', {}, false, {cls: 'compact'})}` : ''}</p>
        <div class="cm-trace-strategies">${strategyTicks}${moreTicks}</div>
        ${(() => { const lim = traceLimits(), D = T.LIMITS; return `<div class="cm-trace-limits" role="group" aria-label="Trace limits"><label title="A set of more than a hundred cards cannot be played, so the trace never lights more">Cards lit <input type="range" name="traceCards" min="${D.cardsMin}" max="${D.maxCards}" step="5" value="${lim.maxCards}"><output>${lim.maxCards}</output></label><label title="A two-card engine wins games and a four-card loop is the longest a table follows; the finder closes loops up to this many cards">Loop length <input type="range" name="traceLoop" min="${D.loopMin}" max="${D.loopMax}" step="1" value="${lim.maxLoop}"><output>${lim.maxLoop}</output></label><label title="How far the chain runs from the commander: its joins, their joins, one more">Chain depth <input type="range" name="traceRings" min="1" max="${D.maxRing}" step="1" value="${lim.maxRing}"><output>${lim.maxRing}</output></label><span class="cm-muted">${r.capped ? `capped at ${lim.maxCards} · ` : ''}defaults ${D.maxCards} · ${D.maxLoop} · ${D.maxRing}</span></div>`; })()}
        <div class="cm-trace-transport"><button type="button" class="v-button compact" id="cm-trace-play" data-action="trace-ctl" data-ctl="play">${st && st.playing ? 'Pause' : st && st.done ? 'Replay' : 'Play'}</button>${b('Step', 'trace-ctl', {ctl: 'step'}, false, {cls: 'compact'})}${b('Back', 'trace-ctl', {ctl: 'back'}, false, {cls: 'compact'})}${b('End', 'trace-ctl', {ctl: 'end'}, false, {cls: 'compact'})}<label>Speed <select name="traceSpeed" aria-label="Animation speed">${[[0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']].map(([v, l]) => `<option value="${v}"${st && st.speed === v ? ' selected' : (!st && v === 1 ? ' selected' : '')}>${l}</option>`).join('')}</select></label><span class="cm-trace-at" id="cm-trace-at">${st ? `${st.lit} of ${st.total} lit${st.playing ? ' · playing' : st.done ? '' : ' · paused'}` : `${r.lit} lit`}</span></div>
        <div class="cm-trace-score"><div><strong>${r.score}</strong><span>cohesion score · a heuristic</span>${r.measured !== undefined && r.measured !== null ? `<em>measured ${e(String(r.measured))}</em>` : '<em>not yet measured</em>'}</div><div><strong>${r.lit}</strong><span>cards lit of ${r.total}</span></div><div><strong>${r.closedLoops}</strong><span>loop-backs drawn</span></div><div><strong>${r.loopBacks}</strong><span>loop-backs counted</span></div></div>
        <h3 class="cm-chips-head">Lit in order</h3>
        <div class="cm-trace-pickbar${traceChosen.size ? '' : ' is-empty'}" id="cm-trace-pickbar"><span>${traceChosen.size ? `${traceChosen.size} ticked` : 'Tick cards to file them in a group'}</span>${b('Add ticked to a group', 'trace-add-group', {}, traceChosen.size > 0, {cls: 'compact'})}${b('Tick every lit card', 'trace-pick-all', {}, false, {cls: 'compact'})}${traceChosen.size ? b('Clear ticks', 'trace-pick-clear', {}, false, {cls: 'compact'}) : ''}</div>
        ${groups || '<p class="cm-muted">No join in this set serves a ticked strategy. Tick more strategies, or trace What it could be.</p>'}
        <p class="cm-trace-unlit"><b>${e(T.unlitSentence(r))}</b> ${r.unlit.length ? b('Open them in List', 'trace-to-list', {}, false, {cls: 'compact'}) : ''}</p>
        ${outside}
        <p class="cm-trace-foot">${b('Export the list (CSV)', 'trace-export', {}, false, {cls: 'compact'})} The list is the walk's order: ring 1 from the commander, ring 2 from ring 1, strongest join first. Gold counts are loop-backs — joins that come back onto a lit card, plus the cycles through it. The cohesion score says how much of the deck the commander's strategies reach and how tightly it loops; it is not power — over 206 measured lists it does not track Measure's score (rank correlation 0.2), so read the measured figure for that.</p>
      </div>`;
      sizePane();
    }
    actions['trace-world'] = (el) => { traceWorld = el.dataset.world === 'pool' ? 'pool' : 'deck'; traceChosen = new Set(); runTrace(true); };
    /* Reset: back to the commander's own strategies; the deck's saved ticks are cleared with it. */
    actions['trace-reset'] = async () => {
      const deck = tracePick(); if (!deck) return;
      traceTicks = null;
      /* Awaited: the redraw reads the deck's saved strategies, so it must see the cleared ones. */
      if (deck.definition.strategies && deck.definition.strategies.length) await C.commit({type: 'editDeck', deckId: deck.id, definition: {...deck.definition, strategies: []}}, {renderView: false});
      runTrace(true);
    };
    actions['trace-pick-all'] = () => { if (!traceResult) return; traceChosen = new Set(traceResult.list.filter((x) => x.ring > 0).map((x) => x.name)); drawTracePane(); };
    actions['trace-pick-clear'] = () => { traceChosen = new Set(); drawTracePane(); };
    /* File the ticked cards in a Collection group as planned entries — the same command the graph's
       own Tick for a group sends, so a group filled from a trace reads like any other. */
    actions['trace-add-group'] = () => {
      const chosen = [...traceChosen]; if (!chosen.length) throw Error('Tick at least one card in the trace first.');
      const deck = tracePick();
      form(`Add ${chosen.length} card${chosen.length === 1 ? '' : 's'} from the trace to a group`,
        `${s('Collection group', 'group', [['', 'Create a new group'], ...C.state.groups.map((g) => [g.id, g.name])], '')}${C.field('New group name', 'name', deck ? `From the trace of ${deck.name}` : 'From the trace')}<div class="cm-full">${note('Planned entries only. Nothing here says you own a copy.')}<p class="cm-muted">${e(chosen.slice(0, 8).join(', '))}${chosen.length > 8 ? ` and ${chosen.length - 8} more` : ''}</p></div>`,
        async (v) => {
          const cards = chosen.map((name) => C.catalog.exact(name)).filter(Boolean);
          if (cards.length !== chosen.length) throw Error('Some cards could not be matched to the catalog. Try Inspect card on them first.');
          const gid = v.group || 'group:' + C.uid();
          const commands = [];
          if (!v.group) commands.push({type: 'createGroup', groupId: gid, name: v.name || 'From the trace'});
          commands.push({type: 'groupEntries', groupId: gid, cards, entries: cards.map((c) => ({cardId: c.id, quantity: 1, notes: deck ? `From the trace of ${deck.name}` : 'From the trace'}))});
          await C.commit({type: 'batch', commands, summary: `Added ${cards.length} card${cards.length === 1 ? '' : 's'} from the trace to a Collection group`}, {renderView: false});
          traceChosen = new Set(); drawTracePane();
        }, 'Add to group');
    };
    actions['trace-ctl'] = (el) => {
      if (!graph || !graph.tracing) { runTrace(true); return; }
      const ctl = el.dataset.ctl === 'play' && graph.traceState && graph.traceState.playing ? 'pause' : el.dataset.ctl;
      graph.traceControl(ctl);
    };
    actions['trace-to-list'] = () => { paneTab = 'list'; lensId = ''; applyTab(); drawList(); };
    actions['trace-export'] = () => {
      const r = traceResult; if (!r) return;
      const q = (v) => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
      const lines = [['order', 'ring', 'card', 'strategy', 'strategies', 'lit by', 'join', 'loop-backs', 'purpose', 'status', 'price'].join(',')];
      for (const x of r.list) lines.push([x.order, x.ring, x.name, x.groupLabel, x.strategies.join(' '), x.from ? (r.list.find((y) => y.id === x.from) || {}).name || '' : '', x.via ? x.via.says : '', x.loopBacks, x.purpose, x.status, x.price === null ? '' : x.price].map(q).join(','));
      for (const u of r.unlit) lines.push(['', '', u.name, '', '', '', 'unlit', '', u.bucket, '', ''].map(q).join(','));
      C.download(`CrankMagic-trace-${String(r.deckName || 'deck').replace(/[^\w-]+/g, '_')}.csv`, lines.join('\n'), 'text/csv');
    };
    actions['trace-option'] = (el) => { const deck = tracePick(), card = C.card(el.dataset.card); if (deck && card) optionDialog(deck, card, `Trace · ${traceResult ? traceResult.strategies.map((id) => globalThis.CrankStrategies.labelOf(id)).join(', ') : ''}`); };
    pane.addEventListener('input', (ev) => { const r = ev.target.closest('input[type=range][name^=trace]'); if (r && r.nextElementSibling && r.nextElementSibling.tagName === 'OUTPUT') r.nextElementSibling.textContent = r.value; });
    pane.addEventListener('change', (ev) => {
      const speed = ev.target.closest('select[name=traceSpeed]'); if (speed && graph && graph.tracing) { graph.traceControl('speed', speed.value); return; }
      /* A limit slider released: the preference is saved with the library and the trace runs again under it. */
      const lim = ev.target.closest('input[type=range][name^=trace]');
      if (lim) { const v = (n) => Number((view.querySelector(`input[name=${n}]`) || {}).value); const next = {cards: v('traceCards'), loop: v('traceLoop'), rings: v('traceRings')};
        /* Awaited: the trace that follows reads the limits from the library, so the save must land first. */
        (async () => { try { await C.commit({type: 'preferences', values: {traceLimits: next}}, {renderView: false}); } catch (error) { C.notice(error.message, true); } runTrace(false); })(); return; }
      const pick = ev.target.closest('input[name=tracePick]');
      if (pick) { if (pick.checked) traceChosen.add(pick.value); else traceChosen.delete(pick.value); pick.closest('.cm-trace-row')?.classList.toggle('is-ticked', pick.checked); const bar = $('#cm-trace-pickbar'); if (bar) { bar.classList.toggle('is-empty', !traceChosen.size); bar.querySelector('span').textContent = traceChosen.size ? `${traceChosen.size} ticked` : 'Tick cards to file them in a group'; const add = bar.querySelector('[data-action=trace-add-group]'); if (add) add.classList.toggle('primary', traceChosen.size > 0); } return; }
      const tick = ev.target.closest('input[name=traceStrategy]'); if (!tick) return;
      const deck = tracePick(); if (!deck) return;
      traceTicks = [...view.querySelectorAll('input[name=traceStrategy]:checked')].map((x) => x.value);
      /* Persisted with the deck, so a trace run twice agrees with itself and the Lab can read it. */
      C.commit({type: 'editDeck', deckId: deck.id, definition: {...deck.definition, strategies: traceTicks}}, {renderView: false}).catch((error) => C.notice(error.message, true));
      runTrace(false);
    });

    function drawList() {
      const focus = graph?.current();
      if (lensId && !landsOnly()) { const r = lensResult(); if (r) { drawLens(r); return; } }
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
      view.innerHTML = `<div class="cm-list-head">${lands ? '' : lensSelect()}<p class="cm-muted">${lands ? `<strong>${all.length.toLocaleString()} land${all.length === 1 ? '' : 's'}</strong> pass the filters. Sort by a column heading; a row opens the card.` : focus ? `Everything <strong>${e(focus.name)}</strong> reaches at depth 3, breadth 30 — the whole neighbourhood, whatever the sliders say. Filters still apply.` : 'Nothing in focus.'}</p>
        ${pickedRows.length ? `<div class="cm-actions cm-pick-actions">${b(`Add ${pickedRows.length} selected to a group…`, 'results-group', {}, true)}${b('Send to the table', 'results-table')}<details class="cm-inline-menu"><summary class="v-button compact cm-card-view-menu-btn">With ${pickedRows.length} selected</summary><div class="cm-menu cm-inline-menu-body"><p>Add to a draft deck</p>${(C.state.decks || []).filter((d) => !d.archived && d.status === 'draft').map((d) => `<button type="button" data-action="list-to-deck" data-deck="${e(d.id)}">${e(d.name)}</button>`).join('') || '<p class="cm-muted">No draft decks.</p>'}</div></details>${b('Clear selection', 'results-clear')}</div>` : ''}</div>
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
    /* SWAP FOR...: the candidate becomes a linked, uncommitted upgrade option on a main slot the
       reader chooses -- the slots in the lens's role first, then the rest of the hundred. The
       command is the module's; the model keeps the hundred as it was. */
    /* The option dialog the lens and the trace share: a main slot to replace, the role's or the
       strategy's slots first, and the uncommitted `option` command on submit. */
    function optionDialog(deck, card, why, firstSlots = new Set()) {
      const mains = deck.slots.filter((x) => x.purpose === 'main');
      const slots = mains.map((x) => [x.id, `${C.card(x.cardId)?.name || x.cardId}${firstSlots.has(x.id) ? ' — in the role' : ''}`]).sort((a, b) => (firstSlots.has(a[0]) ? 0 : 1) - (firstSlots.has(b[0]) ? 0 : 1) || a[1].localeCompare(b[1]));
      const firstSlot = slots[0] && slots[0][0];
      /* THE TWO CARDS, THE WAY PROMOTE SHOWS THEM (Rob, 16 September). The deck page's Promote
         dialog puts the outgoing and incoming cards side by side before the swap is agreed to;
         a swap decided from a name in a dropdown is decided blind. The difference here is that
         the outgoing card is the reader's to choose, so the panel is redrawn on every change of
         the select rather than written once. */
      const panel = (slotId) => {
        const out = C.card(mains.find((x) => x.id === slotId)?.cardId);
        return (out ? C.compareCards(out, card, {outLabel: 'Out of the deck', intoLabel: 'Into the deck'}) : '')
          + note(`${card.name} is linked to ${out ? out.name + '’s' : 'the'} slot as an upgrade option, uncommitted. ${deck.name}’s hundred does not change until you accept the option on the deck page.`);
      };
      const f = form(`Swap for ${card.name}`,
        `<div class="cm-full cm-swap-pick">${s('Replaces (a main-deck slot)', 'slot', slots, firstSlot)}</div><div class="cm-full" id="cm-swap-preview">${panel(firstSlot)}</div>`,
        async (v) => { await C.commit(CrankLens.swapCommand(deck, v.slot, card, why), {renderView: false}); C.notice(`${card.name} linked as an upgrade option in ${deck.name}.`); if (paneTab === 'trace') runTrace(false); else drawList(); },
        'Link as an option');
      f.addEventListener('change', (ev) => {
        if (!ev.target.matches('select[name=slot]')) return;
        const box = f.querySelector('#cm-swap-preview'); if (box) box.innerHTML = panel(ev.target.value);
      });
    }
    actions['lens-swap'] = (el) => {
      const r = lensResult(); if (!r) return;
      const deck = C.M.deck(C.state, r.deck.id), card = C.card(el.dataset.card);
      if (!card) throw Error('That card is not in the catalog.');
      optionDialog(deck, card, r.lens, new Set(r.have.map((h) => h.slotId)));
    };
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
      const lensSel = ev.target.closest('select[name=lens]');
      if (lensSel) { lensId = lensSel.value; listCard = null; drawList(); return; }
      const one = ev.target.closest('.cm-list-tick'), all = ev.target.closest('.cm-list-tick-all');
      if (!one && !all) return;
      if (one) { if (one.checked) picked.add(one.dataset.id); else picked.delete(one.dataset.id); }
      else { for (const box of pane.querySelectorAll('.cm-list-tick')) { if (all.checked) picked.add(box.dataset.id); else picked.delete(box.dataset.id); } }
      graph?.setSelected(picked); drawList();
    });
    function drawCardView(c, info, keepInfo) {
      if (!keepInfo) lastInfo = info;
      if (paneTab === 'trace') { drawTracePane(); return; }
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
      const owned = CrankFacets.owns(C.state);
      const loopCard = (s, extra = '') => `<button type="button" class="cm-loop-card${owned.has(s) ? '' : ' is-missing'}${extra}" data-action="graph-card" data-id="${e(s.id)}" title="${owned.has(s) ? 'You own this' : 'Not in your library'} — tap to focus it">${e(s.name)}</button>`;
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
            ${holdingsHTML(CrankCatalog.key(c.name))}
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
        ${picked.size ? `<div class="cm-actions cm-pick-actions">${b(`Add ${picked.size} selected to a group…`, 'results-group', {}, true)}${b('Send to the table', 'results-table')}${b('Clear selection', 'results-clear')}</div>` : (gmode === 'select' ? '<p class="cm-muted">Tap cards on the graph to tick them. Tap again to untick.</p>' : '')}
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
      /* A filter change narrows the world; the trace is the deck's, so it ends here. */
      if (traceOn) { traceOn = false; traceResult = null; if (paneTab === 'trace') { paneTab = 'card'; applyTab(); } }
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

    /* SCOPE QUERY CONTRACT: #discover?deck=<id>&gap=<token> | commander=<name> | card=<name>
       deck= picks that deck under Yours and focuses its commander; gap= is recorded for later CTAs.
       commander= focuses that commander without filtering to a deck.
       card= focuses that card by name (matched case-insensitively).
       lens= and trace= continue to work with deck= as before. */
    const lensDeck = params.get('deck') ? (C.state.decks || []).find((d) => d.id === params.get('deck') && !d.archived) || null : null;
    if (lensDeck) {
      selection = {...selection, decks: [lensDeck.name]};
      const wantedLens = globalThis.CrankLens ? CrankLens.lensOf(params.get('lens')) : null;
      if (wantedLens) { lensId = wantedLens.id; paneTab = 'list'; applyTab(); }
      if (params.get('trace') === '1') wantTrace = true;
    }
    const gapIntent = params.get('gap'); /* gap is recorded but not yet acted on in slice A */
    const commanderName = params.get('commander');
    const commanderCard = commanderName ? data.cards.find((c) => c.name.toLowerCase() === commanderName.toLowerCase() && c.isCommander) : null;
    const cardName = params.get('card');
    const namedCard = cardName ? data.cards.find((c) => c.name.toLowerCase() === cardName.toLowerCase()) : null;

    const startFocus = (commanderCard || namedCard || rowFor(wanted) || (lensDeck ? commanderRow(lensDeck.name) : null)
      || data.cards.find((c) => c.name === 'Atraxa, Praetors' Voice' || c.name === "Atraxa, Praetors' Voice")
      || data.cards.find((c) => c.name === 'Krenko, Mob Boss')
      || data.cards[0]);

    /* Show gap intent in the page if present, without building buy flows (out of scope for A). */
    if (gapIntent && lensDeck) {
      const subtitle = C.$('.cm-page-head h1');
      if (subtitle) subtitle.insertAdjacentHTML('afterend', `<p class="cm-muted cm-gap-intent">Gap: ${e(gapIntent)}</p>`);
    }

    refresh(startFocus?.id);
    if (wantTrace) { wantTrace = false; paneTab = 'trace'; applyTab(); traceOn = true; runTrace(true); }

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
      const lead = deck && deck.commanders && C.card(deck.commanders[0]);
      return lead ? rowFor(lead) : null;
    }
    actions['facet-term'] = (el) => {
      selection = CrankFacets.toggle(selection, el.dataset.key, el.dataset.value);
      /* Picking how a land enters is asking for lands: the mode comes on with it. */
      if (el.dataset.key === 'enters' && !landsOnly() && CrankFacets.stateOf(selection, 'enters', el.dataset.value) === 'include') selection = CrankFacets.set(selection, 'lands', 'lands only', 'include');
      let focusId = currentFocus();
      if (el.dataset.key === 'decks' && CrankFacets.stateOf(selection, 'decks', el.dataset.value) === 'include') { const lead = commanderRow(el.dataset.value); if (lead) focusId = lead.id; }
      redrawTicks(); refresh(focusId); updateFacetCounts();
    };
    actions['facet-clear'] = () => { selection = {}; loopTouched = false; lensId = ''; redrawTicks(); refresh(currentFocus()); updateFacetCounts(); };
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

    /* SEND THE CARDS TO THE TABLE (plan §2.15; decided 15 September). Shelf mode needs a way to
       reach the catalog, and this is it: not a second search surface on the table, which would be
       a second Discover to keep in step with this one, but one button and one direction of travel.
       The ids go to this device, the table reads them as rows, and nothing is written to the
       library until the reader files them in a group there. */
    actions['results-table'] = () => {
      const chosen = [...picked].map((id) => data.cards.find((c) => c.id === id)).filter(Boolean);
      if (!chosen.length) throw Error('Tick at least one card first.');
      const ids = chosen.map((c) => { const k = C.catalog.exact(c.name); return k ? k.id : null; }).filter(Boolean);
      if (!ids.length) throw Error('None of these could be matched to the catalog. Try Inspect card on them first.');
      let had = [];
      try { const v = JSON.parse(localStorage.getItem('cm-table-sent') || '[]'); if (Array.isArray(v)) had = v.filter((x) => typeof x === 'string'); } catch (err) { had = []; }
      /* A table is a table: four hundred cards is already more than anyone deals out, and the
         cap is what stops a stray Select all from making the mat unusable. */
      const list = [...new Set([...had, ...ids])].slice(0, 400);
      try { localStorage.setItem('cm-table-sent', JSON.stringify(list)); }
      catch (err) { throw Error('This browser would not store the cards, so they could not be sent to the table.'); }
      picked = new Set(); graph?.setSelected(picked);
      C.notice(`${ids.length} card${ids.length === 1 ? '' : 's'} sent to the table${list.length > ids.length ? `, ${list.length} waiting there now` : ''}. Pick no deck and the table sorts them into collection groups.`);
      C.go('cards', {view: 'tabletop'});
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
