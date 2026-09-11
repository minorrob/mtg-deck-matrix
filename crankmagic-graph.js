/* The card graph: a neighbourhood you can walk, drawn to the breadth it actually has.
 *
 * WHAT IT SHOWS. One card in focus, the cards it is joined to, and the cards THEY are
 * joined to, out to a depth the reader chooses. Two kinds of edge, never mixed: typed
 * structural links from card text (shared mechanics and roles, and produces→requires
 * pairs such as a Treasure maker feeding a card that needs artifacts), and EDHREC
 * co-play. Neither is simulated evidence and the labels say which is which.
 *
 * WHY IT IS NOT A STAR ANY MORE. The first version put twelve neighbours on a ring around
 * the focus and stopped. That answers "what touches Atraxa" and nothing else: it cannot
 * show that six of those twelve are also joined to each other, which is the whole point
 * of a graph over a list. This one walks out to a depth, keeps every node's fan-out
 * bounded so the picture stays legible, and then draws the CROSS-LINKS -- every edge
 * between any two cards that made it onto the canvas, not just the spokes -- so a
 * cluster of proliferate cards reads as a cluster.
 *
 * HOW IT STAYS READABLE. Three controls, all bounded:
 *   depth    1-3   how many hops from the focus
 *   breadth  6-30  how many neighbours the focus itself gets
 *   cap      ~180  the most nodes ever placed, whatever the settings
 * Children sit in the angular sector of their parent rather than on a shared ring, so
 * what belongs to what is visible without reading a single label. Rings shrink with
 * depth, names appear per ring only once the zoom makes them legible, and edge labels
 * (why two cards are joined) sit on the focus's own spokes above 0.95 zoom.
 *
 * SPEED. links() used to scan all 7,764 cards for every node; at depth 3 that is a
 * million comparisons per layout. An inverted index -- term → the cards carrying it --
 * is built once per mount, so a node's candidates are the union of a few hundred ids
 * rather than the whole catalog.
 */
(function (root) {
  'use strict';

  const GENERIC = new Set(['creatures', 'lands', 'artifacts', 'enchantments', 'instants', 'sorceries', 'planeswalkers']);
  const CAP = 180;

  /* The words a card is joinable on, for a UI to offer as filters: "Atraxa is in focus;
     here are proliferate, counters, ... -- tap one to see the cards joined to it that
     way." Static, because the Card View needs it before a mount has finished. */
  function termsOf(c) {
    if (!c) return null;
    return {
      mechanics: [...(c.mechanics || [])], roles: (c.roles || []).filter((r) => !GENERIC.has(r)),
      produces: [...(c.produces || [])], requires: [...(c.requires || [])],
      causes: [...(c.causes || [])], triggers: [...(c.triggers || [])],
      multiplies: [...(c.multiplies || [])], grants: [...(c.grants || [])],
      extends: [...(c.extends || [])], tribes: [...(c.tribes || [])], wants: [...(c.wants || [])], makes: [...(c.makes || [])],
      wantsStat: [...(c.wantsStat || [])], offersStat: [...(c.offersStat || [])]
    };
  }

  /* Event ids read like database columns and the canvas is not a database. The chips
     stay raw -- they are filter values and must match the facet exactly -- but an edge
     label and a pop-up sentence get the English. */
  const EVENT_LABEL = {
    'creature-etb': 'a creature entering', 'land-drop': 'a land drop', 'creature-dies': 'a creature dying',
    'attack': 'an attack', 'combat-begin': 'combat', 'end-step': 'the end step', 'upkeep': 'upkeep',
    'cast-spell': 'a spell cast', 'proliferate': 'proliferate', 'counter-placed': 'a +1/+1 counter',
    'life-gain': 'life gain', 'life-loss': 'life loss', 'draw-card': 'a draw', 'sacrifice': 'a sacrifice',
    'graveyard-entry': 'the graveyard', 'trigger': 'its triggers',
    'cast-creature': 'a creature spell cast', 'cast-instant-sorcery': 'an instant or sorcery cast',
    'cast-enchantment': 'an enchantment cast', 'cast-artifact': 'an artifact cast', 'cast-legendary': 'a legendary spell cast'
  };
  const say = (id) => EVENT_LABEL[id] || String(id).replace(/-/g, ' ');
  const sayAll = (list, n) => list.slice(0, n || 3).map(say).join(', ');

  /* THE TERM SETS a pair is scored on. Kept as Sets because every question asked of
     them is "does the other card carry this term", and set membership is the cheap way
     to ask it a few hundred thousand times a layout. */
  const TERM_KEYS = ['shared', 'fills', 'produces', 'requires', 'causes', 'triggers', 'multiplies', 'grants', 'extends', 'tribes', 'wants', 'makes', 'offered', 'wantsStat', 'offersStat'];
  function termSets(c) {
    const t = {
      shared: new Set([...(c.mechanics || []), ...(c.roles || []).filter((r) => !GENERIC.has(r))]),
      /* WHAT THIS CARD SUPPLIES, for the demand side to ask about. Roles are the shared
         supply/demand vocabulary -- REQUIRES names "creatures", "counters", "graveyard",
         and FILLS names the same words -- so this is the set a REQUIRES is checked
         against. It used to be checked against `produces`, whose ids are resources
         (token, mana, card) and share not one word with the roles, so the feeds/fed
         join never fired once across the whole corpus. */
      fills: new Set(c.roles || []),
      produces: new Set(c.produces || []),
      requires: new Set(c.requires || []),
      tribes: new Set(c.tribes || []),
      wants: new Set(c.wants || []),
      makes: new Set(c.makes || []),
      /* A payoff for a stat, and a body that has it. The one join read off printed numbers
         rather than words: a 0/4 Wall's text never says it is a wall. */
      wantsStat: new Set(c.wantsStat || []),
      offersStat: new Set(c.offersStat || []),
      /* The tribe a card OFFERS a payoff: what it is, and what it makes tokens of. */
      offersTribe: new Set([...(c.tribes || []), ...(c.makes || [])]),
      causes: new Set(c.causes || []),
      triggers: new Set(c.triggers || []),
      multiplies: new Set(c.multiplies || []),
      grants: new Set(c.grants || []),
      extends: new Set(c.extends || [])
    };
    /* What this card OFFERS a multiplier: a resource it makes or an ability it fires.
       Built once per card rather than once per pair -- a depth-3 layout asks about a
       hundred thousand pairs, and a fresh Set per question was most of the frame. */
    t.offered = new Set([...t.produces, ...t.triggers]);
    /* Torbran multiplies damage, and the card that offers damage is the one that CAUSES
       life loss, not one that listens for it. The one event whose multiplier pairs with
       the causer rather than the listener. */
    if (t.causes.has('life-loss')) t.offered.add('life-loss');
    return t;
  }

  /* Intersection, walking the smaller side, handing back one shared empty array when
     there is nothing -- which is the answer for the overwhelming majority of pairs. */
  const NONE = Object.freeze([]);
  function inter(a, b) {
    if (!a.size || !b.size) return NONE;
    const small = a.size <= b.size ? a : b, big = small === a ? b : a;
    let out = null;
    for (const term of small) if (big.has(term)) (out || (out = [])).push(term);
    return out || NONE;
  }

    /* SCORE ONE PAIR -- and the five ways two cards can be joined, weakest first.
     *
     *   shared      both say the same word. The cheapest kind of link and the one the
     *               graph used to have on its own: a fact about vocabulary, not play.
     *   feeds/fed   one supplies what the other needs -- bodies for a sac outlet,
     *               +1/+1 counters for a counters payoff. A relationship, not a word.
     *   tribal      one names a tribe as its payoff, the other is that tribe.
     *   statted     one pays off a stat, the other's printed numbers supply it.
     *   extended    one hands out a quality, the other spreads it across your board.
     *   fires       one CAUSES an event, the other TRIGGERS on it. Krenko makes
     *               creatures enter; Purphoros fires when they do. This is the chain
     *               a Commander deck actually is, and the graph could not see it until
     *               now -- both sides were already in the data and nothing read them
     *               against each other.
     *   multiplied  one makes a thing, the other makes MORE of it. Krenko and Parallel
     *               Lives; a card whose ability triggers and Panharmonicon.
     *
     * Direction matters and is kept: a → b is not the same sentence as b → a, and the
     * pop-up prints the arrow the reader is looking at. */
    const GENERIC_MULT = 'trigger';
    function relateTerms(ta, tb) {
      const feeds = inter(ta.fills, tb.requires);
      const fed = inter(ta.requires, tb.fills);
      /* A role that is also the supply for the other card's demand is reported once, as
         the relationship, not again as a shared word. */
      const sharedRaw = inter(ta.shared, tb.shared);
      const shared = (feeds.length || fed.length) ? sharedRaw.filter((t) => !feeds.includes(t) && !fed.includes(t)) : sharedRaw;
      /* THE TRIBE. Krenko names Goblins; Goblin Chieftain is one and names them too.
         Neither event, resource nor quality joins them, and until this they were strangers
         on the canvas. A payoff → member edge is the card's text naming the other card's
         type line. */
      const tribal = inter(ta.wants, tb.offersTribe);
      const tribalBy = inter(ta.offersTribe, tb.wants);
      const statted = inter(ta.wantsStat, tb.offersStat);
      const stattedBy = inter(ta.offersStat, tb.wantsStat);
      const fires = inter(ta.causes, tb.triggers);
      const firedBy = inter(ta.triggers, tb.causes);
      /* A generic doubler ("if a triggered ability of a Wizard you control triggers...")
         names no event, so it pairs with anything that has a trigger at all -- true, but
         the weakest of these, and scored that way. */
      let multiplied = inter(ta.offered, tb.multiplies);
      let multiplies = inter(tb.offered, ta.multiplies);
      const genericTo = !multiplied.length && tb.multiplies.has(GENERIC_MULT) && ta.triggers.size > 0;
      const genericFrom = !multiplies.length && ta.multiplies.has(GENERIC_MULT) && tb.triggers.size > 0;
      if (genericTo) multiplied = [GENERIC_MULT];
      if (genericFrom) multiplies = [GENERIC_MULT];
      /* A quality one card hands out and the other widens. An ability-sharer cannot
         name in advance what it will be spreading, so it carries the id "keywords" and
         the chips name the qualities coming from the other side. */
      let extended = inter(ta.grants, tb.extends);
      let extendedBy = inter(tb.grants, ta.extends);
      if (!extended.length && tb.extends.has('keywords') && ta.grants.size) extended = [...ta.grants].slice(0, 3);
      if (!extendedBy.length && ta.extends.has('keywords') && tb.grants.size) extendedBy = [...tb.grants].slice(0, 3);

      const multWeight = (genericTo ? 2 : 0) + (genericFrom ? 2 : 0)
        + ((multiplied.length - (genericTo ? 1 : 0)) + (multiplies.length - (genericFrom ? 1 : 0))) * 4;
      /* Being a creature satisfies "needs creatures": true of most of the deck, so a
         generic role feeding a demand is worth one, a specific one (counters, graveyard,
         a sac outlet) three. */
      const feedWeight = (list) => list.reduce((n, t) => n + (GENERIC.has(t) ? 1 : 3), 0);
      const score = shared.length * 2 + feedWeight(feeds) + feedWeight(fed)
        + (fires.length + firedBy.length) * 4 + multWeight
        + (extended.length + extendedBy.length) * 3
        + (tribal.length + tribalBy.length) * 3
        + (statted.length + stattedBy.length) * 3;
      if (!score) return null;

      /* One pair can be joined several ways at once. The label names the strongest,
         because an edge has room for one sentence and the pop-up prints them all. */
      const say2 = (list) => sayAll(list, 2);
      const cases = [
        [fires.length,      'Causes → triggers on',  '→ ' + say(fires[0]),      'Causes → triggers on · ' + sayAll(fires)],
        [firedBy.length,    'Triggers on ← caused',  '← ' + say(firedBy[0]),    'Triggers on ← caused by · ' + sayAll(firedBy)],
        [multiplied.length, 'Makes → multiplies',    '→ ×' + say(multiplied[0]),'Makes → multiplies · ' + say2(multiplied)],
        [multiplies.length, 'Multiplies ← makes',    '← ×' + say(multiplies[0]),'Multiplies ← makes · ' + say2(multiplies)],
        [statted.length,    'Stat payoff → body',    '→ ' + statted[0],         'Stat payoff → body · ' + statted.slice(0, 2).join(', ')],
        [stattedBy.length,  'Body ← stat payoff',    '← ' + stattedBy[0],       'Body ← stat payoff · ' + stattedBy.slice(0, 2).join(', ')],
        [tribal.length,     'Tribal payoff → member', '→ ' + tribal[0],         'Tribal payoff → member · ' + tribal.slice(0, 2).join(', ')],
        [tribalBy.length,   'Member ← tribal payoff', '← ' + tribalBy[0],       'Member ← tribal payoff · ' + tribalBy.slice(0, 2).join(', ')],
        [feeds.length,      'Supplies → needs',      '→ ' + feeds[0],           'Supplies → needs · ' + feeds.join(', ')],
        [fed.length,        'Needs ← supplies',      '← ' + fed[0],             'Needs ← supplies · ' + fed.join(', ')],
        [extended.length,   'Grants → extends',      '→ ' + say2(extended),     'Grants → extends across your board · ' + say2(extended)],
        [extendedBy.length, 'Extends ← grants',      '← ' + say2(extendedBy),   'Extends ← grants · ' + say2(extendedBy)],
        [shared.length,     'Shared mechanics / roles', shared.slice(0, 2).join(', '), 'Shared mechanics / roles · ' + shared.slice(0, 3).join(', ')]
      ];
      const [, kind, tag, reason] = cases.find((c) => c[0]) || [];
      return {shared, feeds, fed, fires, firedBy, multiplied, multiplies, extended, extendedBy,
              tribal, tribalBy, statted, stattedBy, score, kind, tag, reason};
    }

  root.CrankGraph = {
    termsOf,
    TERM_KEYS,
    /* The scoring the canvas uses, reachable without one. */
    relate: (a, b) => (a && b && a !== b ? relateTerms(termSets(a), termSets(b)) : null),

    mount({canvas, cards, played = [], focus, history = [], owned = null, onSelect, onNeighbors, onPick, onHit, type = 'mechanic', depth = 2, breadth = 12}) {
      const ctx = canvas.getContext('2d');
      const byId = new Map(cards.map((c) => [c.id, c]));
      /* The path walked so far. A filter remounts the graph over a narrower set of cards;
         the trail comes along, minus any card the filter removed, so Back and the pinned
         previous focus survive narrowing. */
      const trail = [...(history || [])].filter((id) => byId.has(id));
      let center = focus || (cards[0] && cards[0].id);
      let nodes = [], edges = [], scale = 1, pan = {x: 0, y: 0}, drag = null;
      let width = 600, height = 550, frame = 0, disposed = false;
      const pointers = new Map();
      let pinch = null, lastTap = {at: 0, x: 0, y: 0}, touched = false;
      /* navigate: a tap re-centres on the card. inspect: a tap opens the card's terms and
         its connection to the focus in a pop-up, without moving. select: a tap ticks it,
         for "add these to a group" -- the loop the graph exists for happens ON the graph,
         not in a list. An edge tap opens its definition in every mode. */
      let mode = 'navigate';
      const selected = new Set();
      let highlight = null;   // [idA, idB] of the edge a pop-up is about
      let hover = null;       // the node under a mouse, whose cross-links are drawn on their own
      /* RESTING ON A CARD NAMES IT. Names are drawn per ring only where there is room, so
         at a wide reach most discs are unlabelled and the only way to learn what one is
         was to click it. Half a second of stillness is the difference between passing over
         a node and asking about it, so that is when the name appears -- and it stays until
         the pointer moves off, rather than fading on a timer the reader did not set. */
      let named = null, nameTimer = null;
      const HOVER_NAME_MS = 500;
      function nameAfterRest(n) {
        if (nameTimer) { clearTimeout(nameTimer); nameTimer = null; }
        if (named && named !== n) { named = null; }
        if (!n) return;
        nameTimer = setTimeout(() => { nameTimer = null; if (hover === n && !disposed) { named = n; draw(); } }, HOVER_NAME_MS);
      }
      /* THE WEB, ON REQUEST. Every cross-link between sixty-one cards is 1,600 lines, and at
         fit zoom that is a blue fog the reader cannot see through. So the web is drawn whole
         only while it is small enough to read; past that, a card's own cross-links appear
         when the mouse rests on it or a pop-up is about it, and the count stays in the Card
         View so nobody thinks the connections went away. */
      const WEB_LIMIT = 60;

      /* THE CARD ART. A node is the card, not a blue circle standing in for it. Images
         load lazily -- only the cards on the canvas, from Scryfall's small rendition --
         and the frame repaints once each arrives. A card with no image, or one that fails,
         keeps the plain disc, so the picture never waits on the network to be usable. */
      const images = new Map();
      let repaintQueued = false;
      function art(c) {
        const url = String(c.image || '');
        if (!url) return null;
        const key = c.id;
        if (images.has(key)) { const img = images.get(key); return img && img !== 'failed' && img.complete && img.naturalWidth ? img : null; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { if (!repaintQueued) { repaintQueued = true; setTimeout(() => { repaintQueued = false; draw(); }, 60); } };
        img.onerror = () => images.set(key, 'failed');
        img.src = url.replace('/normal/', '/small/').replace('/large/', '/small/');
        images.set(key, img);
        return null;
      }

      const clampScale = (v) => Math.max(.25, Math.min(5, v));
      depth = clampDepth(depth); breadth = clampBreadth(breadth);
      function clampDepth(v) { return Math.max(1, Math.min(3, Math.round(Number(v) || 1))); }
      function clampBreadth(v) { return Math.max(6, Math.min(30, Math.round(Number(v) || 12))); }

      /* ---------------------------------------------------------- the term index */

      /* The words a card can be joined on. Mechanics and non-generic roles join by
         sharing; produces and requires join by feeding. Kept per card as Sets so a
         pair check is set intersection and not array scanning. */
      const TERMS = new Map(cards.map((c) => [c.id, termSets(c)]));
      const KEYS = TERM_KEYS;

      /* THE CANDIDATE CAP. "Causes a creature to enter" is 889 cards and "produces a
         token" is 1,154; a node scores every candidate and then keeps twelve. Scoring
         two thousand cards per node to keep twelve is most of a depth-3 layout, and the
         ones that lose are the ones nobody plays -- so each term's list is sorted by
         EDHREC rank once per mount and cut here. A card outside the cut can still reach
         the canvas through any of its other terms; what it cannot do is arrive on the
         strength of the single commonest word it knows. */
      const PER_TERM = 400;
      const rankOf = (c) => (Number.isFinite(c.rank) && c.rank > 0 ? c.rank : Infinity);
      const index = {};
      for (const k of KEYS) index[k] = new Map();
      for (const c of cards) {
        const t = TERMS.get(c.id);
        for (const k of KEYS) {
          for (const term of t[k]) {
            if (!index[k].has(term)) index[k].set(term, []);
            index[k].get(term).push(c);
          }
        }
      }
      for (const k of KEYS) {
        for (const [term, list] of index[k]) {
          if (list.length > PER_TERM) {
            list.sort((a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name));
            index[k].set(term, list.slice(0, PER_TERM).map((c) => c.id));
          } else {
            index[k].set(term, list.map((c) => c.id));
          }
        }
      }
      const coPlay = new Map();
      for (const e of played) {
        if (!coPlay.has(e.from)) coPlay.set(e.from, []);
        if (!coPlay.has(e.to)) coPlay.set(e.to, []);
        coPlay.get(e.from).push(e); coPlay.get(e.to).push(e);
      }

      /* The pair scoring lives at module scope (relateTerms) so a Node test can hold it
         to what it claims without standing up a canvas. */
      const relate = (a, b) => relateTerms(TERMS.get(a.id), TERMS.get(b.id));

      /* The best `limit` neighbours of one card, excluding any already placed. */
      function links(c, limit, exclude) {
        if (!c) return [];
        if (type === 'played') {
          return (coPlay.get(c.id) || [])
            .map((e) => ({card: byId.get(e.from === c.id ? e.to : e.from), e}))
            .filter((x) => x.card && !exclude.has(x.card.id))
            .sort((a, b) => b.e.inclusion - a.e.inclusion)
            .slice(0, limit)
            .map(({card, e}) => ({card, kind: 'EDHREC co-play', tag: `${(e.inclusion * 100).toFixed(1)}% of decks`,
              reason: `EDHREC co-play · ${e.decks} decks · ${(e.inclusion * 100).toFixed(1)}% inclusion`, score: e.inclusion}));
        }
        const t = TERMS.get(c.id);
        const candidates = new Set();
        /* Who could possibly be joined to this card: the other side of every relation,
           looked up in the inverted index rather than by scanning 7,764 cards. */
        const pull = (from, into) => { for (const term of t[from]) for (const id of index[into].get(term) || []) candidates.add(id); };
        pull('shared', 'shared');
        /* Supply and demand share the role vocabulary, so a card's fills are looked up in
           the requires index and the other way round. This used to pull produces against
           requires -- resource ids against role ids -- and so never found a candidate. */
        pull('fills', 'requires'); pull('requires', 'fills');
        pull('causes', 'triggers'); pull('triggers', 'causes');
        pull('offered', 'multiplies'); pull('multiplies', 'offered');
        pull('grants', 'extends'); pull('extends', 'grants');
        /* The tribe: a payoff's wants against what the others are or make, and back. */
        pull('wants', 'tribes'); pull('wants', 'makes'); pull('tribes', 'wants'); pull('makes', 'wants');
        pull('wantsStat', 'offersStat'); pull('offersStat', 'wantsStat');
        /* The generic trigger doublers name no event, so neither index lookup finds them:
           a card with any trigger reaches them, and they reach back to any card with one. */
        if (t.triggers.size) for (const id of index.multiplies.get(GENERIC_MULT) || []) candidates.add(id);
        if (t.multiplies.has(GENERIC_MULT)) for (const list of index.triggers.values()) for (const id of list) candidates.add(id);
        if (t.extends.has('keywords')) for (const list of index.grants.values()) for (const id of list) candidates.add(id);
        if (t.grants.size) for (const id of index.extends.get('keywords') || []) candidates.add(id);
        candidates.delete(c.id);
        const out = [];
        for (const id of candidates) {
          if (exclude.has(id)) continue;
          const x = byId.get(id); if (!x) continue;
          const r = relate(c, x); if (r) out.push({card: x, ...r});
        }
        /* Ties are the common case now: a dozen cards all fire on a creature entering and
           all score the same. Alphabetical put "Access Denied" at the top of Purphoros's
           ring, which reads as arbitrary because it is. EDHREC rank is the tiebreak a
           reader expects -- the cards people actually play with this one, first. */
        out.sort((a, b) => b.score - a.score || rankOf(a.card) - rankOf(b.card)
          || a.card.name.localeCompare(b.card.name));
        if (out.length <= limit) return out;
        /* ONE RING, MORE THAN ONE SENTENCE. Score alone gave Purphoros fourteen neighbours
           all labelled "Triggers on ← caused by · a creature entering": true, and useless
           to read, because the picture then says one thing fourteen times. So a single
           kind may take at most three fifths of the fan and the rest is filled from what
           is left, still in score order. The strongest relation still leads; it just does
           not get to be the only one on screen. */
        const perKind = Math.max(3, Math.ceil(limit * .6));
        const counts = new Map(), picked = [], rest = [];
        for (const x of out) {
          const n = counts.get(x.kind) || 0;
          if (picked.length < limit && n < perKind) { counts.set(x.kind, n + 1); picked.push(x); }
          else rest.push(x);
        }
        for (const x of rest) { if (picked.length >= limit) break; picked.push(x); }
        return picked;
      }

      /* A link entry for one known pair, in the shape links() returns -- for the card the
         reader just left, which must stay on ring 1 whether or not it made the top cut. */
      function linkTo(c, other) {
        if (!other || other.id === c.id) return null;
        if (type === 'played') {
          const e = (coPlay.get(c.id) || []).find((x) => x.from === other.id || x.to === other.id);
          return e ? {card: other, kind: 'EDHREC co-play', tag: `${(e.inclusion * 100).toFixed(1)}% of decks`,
            reason: `EDHREC co-play · ${e.decks} decks · ${(e.inclusion * 100).toFixed(1)}% inclusion`, score: e.inclusion} : null;
        }
        const r = relate(c, other);
        return r ? {card: other, ...r} : null;
      }

      /* ------------------------------------------------------------- the layout */

      function ring(k) {
        const base = Math.max(140, Math.min(230, Math.min(width, height) * .30));
        return base * (k === 1 ? 1 : k === 2 ? 1.95 : 2.8);
      }
      const radius = (k) => (k === 0 ? 39 : k === 1 ? 20 : k === 2 ? 12 : 8);

      /* Breadth-first to `depth`, each node's children bounded and placed inside the
         parent's angular sector so clusters stay attached to what they hang off. */
      function layout() {
        const c = byId.get(center);
        nodes = []; edges = [];
        if (!c) { onNeighbors && onNeighbors(null, [], trail.length, {total: 0, byDepth: []}); draw(); return; }
        const placed = new Set([c.id]);
        const root = {card: c, x: 0, y: 0, r: radius(0), depth: 0, angle: 0, span: Math.PI * 2};
        nodes.push(root);
        const direct = links(c, breadth, placed);

        /* WHERE YOU CAME FROM. The card the reader just left stays on ring 1 whether or not
           it made the focus's top cut, pinned to the left with a wider sector and a fuller
           fan beneath it, so a hop reads as a step along a path with the previous
           neighbourhood still in view. Only the immediate previous focus gets this; two
           hops back it is a node like any other. */
        const prev = trail.length ? byId.get(trail[trail.length - 1]) : null;
        if (prev && prev.id !== c.id) {
          const at = direct.findIndex((n) => n.card.id === prev.id);
          if (at >= 0) direct.unshift(direct.splice(at, 1)[0]);
          else { const back = linkTo(c, prev); if (back) { if (direct.length >= breadth) direct.pop(); direct.unshift(back); } }
        }
        direct.forEach((n) => placed.add(n.card.id));
        const hasPrev = Boolean(prev && direct.length && direct[0].card.id === prev.id);
        const prevSpan = hasPrev ? Math.min(Math.PI / 2, (Math.PI * 2 / direct.length) * 2.2) : 0;
        const restSpan = direct.length - (hasPrev ? 1 : 0) > 0 ? (Math.PI * 2 - prevSpan) / (direct.length - (hasPrev ? 1 : 0)) : Math.PI * 2;
        let cursor = Math.PI + prevSpan / 2 + restSpan / 2;

        let frontier = direct.map((n, i) => {
          const pinned = hasPrev && i === 0;
          let angle, span;
          if (!hasPrev) { angle = (i / direct.length) * Math.PI * 2 - Math.PI / 2; span = (Math.PI * 2) / direct.length; }
          else if (pinned) { angle = Math.PI; span = prevSpan; }
          else { angle = cursor; cursor += restSpan; span = restSpan; }
          const node = {card: n.card, reason: n.reason, kind: n.kind, tag: n.tag, parent: root, pinned,
            x: Math.cos(angle) * ring(1), y: Math.sin(angle) * ring(1), r: radius(1), depth: 1, angle, span};
          edges.push({a: root, b: node, tree: true, kind: n.kind});
          return node;
        });
        nodes.push(...frontier);

        /* HOW THE CAP IS SPENT. Every ring the reader asked for gets a share of what is
           left under CAP, so depth 3 is a third ring and not a second ring that ate the
           whole budget: an inner ring takes ~60% of the remainder, the outermost the
           rest. Within a ring the share is split evenly across parents, the earliest
           (best-scored) parents taking any leftover, and each parent's fan is bounded by
           the reader's breadth too -- children of the focus get at most a third of it,
           theirs a fifth -- because the question at depth 3 is "is there a web out
           here", not "list them all". */
        let remaining = CAP - nodes.length;
        for (let d = 2; d <= depth && remaining > 0 && frontier.length; d += 1) {
          const share = d < depth ? Math.max(frontier.length, Math.round(remaining * .6)) : remaining;
          const perParent = Math.max(1, Math.floor(share / frontier.length));
          let extra = Math.max(0, share - perParent * frontier.length);
          const maxFan = Math.max(1, Math.round(breadth / (d === 2 ? 3 : 5)));
          const next = [];
          let spent = 0;
          for (const parent of frontier) {
            if (spent >= share || nodes.length >= CAP) break;
            const bonus = extra > 0 ? 1 : 0;
            /* The pinned previous focus keeps a fan the size the focus itself gets, so its
               old neighbourhood is still visible; everyone else gets the ring's share. */
            const want = parent.pinned && d === 2
              ? Math.min(breadth, Math.max(perParent * 3, 6), share - spent, CAP - nodes.length)
              : Math.min(maxFan, perParent + bonus, share - spent, CAP - nodes.length);
            if (bonus && want > perParent) extra -= 1;
            const kids = links(parent.card, want, placed);
            kids.forEach((k) => placed.add(k.card.id));
            spent += kids.length;
            const usable = parent.span * .82;
            kids.forEach((k, i) => {
              const angle = parent.angle - usable / 2 + (kids.length === 1 ? usable / 2 : (i / (kids.length - 1)) * usable);
              const node = {card: k.card, reason: k.reason, kind: k.kind, tag: k.tag, parent,
                x: Math.cos(angle) * ring(d), y: Math.sin(angle) * ring(d), r: radius(d), depth: d,
                angle, span: usable / Math.max(1, kids.length)};
              edges.push({a: parent, b: node, tree: true, kind: k.kind});
              nodes.push(node); next.push(node);
            });
          }
          remaining = CAP - nodes.length;
          frontier = next;
        }

        /* THE CROSS-LINKS: every relationship between two cards that both made it onto
           the canvas, beyond the tree that placed them. This is the many-to-many the
           picture exists to show. O(n²) over at most CAP nodes on precomputed Sets. */
        const treeKey = new Set(edges.map((e) => e.a.card.id + '|' + e.b.card.id));
        for (let i = 1; i < nodes.length; i += 1) {
          for (let j = i + 1; j < nodes.length; j += 1) {
            const a = nodes[i], b = nodes[j];
            if (treeKey.has(a.card.id + '|' + b.card.id) || treeKey.has(b.card.id + '|' + a.card.id)) continue;
            const r = type === 'played' ? coPlayPair(a.card.id, b.card.id) : relate(a.card, b.card);
            if (r) edges.push({a, b, tree: false, kind: r.kind});
          }
        }
        const byDepth = [1, 2, 3].map((d) => nodes.filter((n) => n.depth === d).length);
        onNeighbors && onNeighbors(c, direct, trail.length, {total: nodes.length, byDepth, crossLinks: edges.filter((e) => !e.tree).length});
        draw();
      }
      function coPlayPair(x, y) {
        const e = (coPlay.get(x) || []).find((e) => e.from === y || e.to === y);
        return e ? {kind: 'EDHREC co-play'} : null;
      }

      /* Zoom so the whole neighbourhood is on screen, with room for the names under the
         outer ring. Deeper layouts are wider, so this is what keeps depth 3 from opening
         as a picture of the middle of itself. */
      function fit() {
        if (!nodes.length) { scale = 1; pan = {x: 0, y: 0}; return; }
        const rx = Math.max(...nodes.map((n) => Math.abs(n.x) + n.r)) + 70;
        const ry = Math.max(...nodes.map((n) => Math.abs(n.y) + n.r)) + 42;
        scale = clampScale(Math.min(1, Math.min(width / 2 / rx, height / 2 / ry)));
        pan = {x: 0, y: 0};
      }

      /* --------------------------------------------------------------- drawing */

      function draw() {
        if (disposed) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          ctx.clearRect(0, 0, width, height);
          ctx.save();
          ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
          ctx.scale(scale, scale);
          const played = type === 'played';

          // cross-links first and faintest, so the tree reads on top of the web -- the whole
          // web only while it is small; otherwise just the hovered or inspected card's own
          const crossCount = edges.reduce((n, e) => n + (e.tree ? 0 : 1), 0);
          const focusId = hover ? hover.card.id : highlight ? highlight[1] : null;
          for (const e of edges) {
            if (e.tree) continue;
            const own = focusId && (e.a.card.id === focusId || e.b.card.id === focusId);
            if (crossCount > WEB_LIMIT && !own) continue;
            ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
            ctx.strokeStyle = own ? (played ? '#e6cf9d99' : '#8fc3f2aa') : (played ? '#c6a86d2e' : '#5384b62e'); ctx.lineWidth = own ? 1.4 : 1; ctx.stroke();
          }
          for (const e of edges) {
            if (!e.tree) continue;
            ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
            ctx.strokeStyle = played ? (e.b.depth === 1 ? '#c6a86d99' : '#c6a86d55') : (e.b.depth === 1 ? '#5384b699' : '#5384b655');
            ctx.lineWidth = e.b.depth === 1 ? 1.2 : 1; ctx.stroke();
          }
          /* The trail, and the edge a pop-up is about, over everything else: the step the
             reader just took in amber, the connection they asked about in gold. */
          for (const e of edges) {
            const lit = highlight && ((e.a.card.id === highlight[0] && e.b.card.id === highlight[1]) || (e.a.card.id === highlight[1] && e.b.card.id === highlight[0]));
            if (!e.b.pinned && !lit) continue;
            ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
            ctx.strokeStyle = lit ? '#ffd166' : '#e0b660bb'; ctx.lineWidth = lit ? 2.6 : 2.2; ctx.stroke();
          }

          /* ROOM TO LETTER. A name is drawn only where the ring has room for it: the arc
             between neighbours, on screen, must be wide enough for a label. Thirty names on
             ring 1 at fit zoom are a smear; the same thirty at 2x zoom read fine. Gating on
             spacing rather than on zoom alone means breadth 12 reads at depth 3 and breadth
             30 asks the reader to zoom in, which is what the hint says. */
          const perRing = [0, 1, 2, 3].map((d) => nodes.filter((n) => n.depth === d).length);
          const spacing = (d) => (2 * Math.PI * ring(d) * scale) / Math.max(1, perRing[d]);
          const roomy = (d) => d === 0 || spacing(d) >= (d === 1 ? 44 : 60);

          /* Why two cards are joined, lettered on the spokes whenever the ring is sparse
             enough to carry the words: the focus's own spokes from about two-thirds zoom,
             and ring 2's when it holds few nodes or the reader has zoomed in. Lettering a
             crowded ring would bury the picture under its own captions. */
          const labelRing1 = scale >= .6 && spacing(1) >= 56, labelRing2 = spacing(2) >= 84 && scale >= .9;
          if (labelRing1 || labelRing2) {
            for (const n of nodes) {
              if (!((n.depth === 1 && labelRing1) || (n.depth === 2 && labelRing2))) continue;
              const tag = String(n.tag || '').trim(); if (!tag) continue;
              const text = tag.length > 20 ? tag.slice(0, 19) + '…' : tag;
              const p = n.parent || {x: 0, y: 0};
              const mx = p.x + (n.x - p.x) * .58, my = p.y + (n.y - p.y) * .58;
              ctx.font = '10px Satoshi, sans-serif'; ctx.textAlign = 'center';
              const w = ctx.measureText(text).width + 10;
              ctx.fillStyle = '#0f1826d9'; ctx.beginPath(); ctx.roundRect(mx - w / 2, my - 8, w, 16, 8); ctx.fill();
              ctx.strokeStyle = played ? '#c6a86d55' : '#5384b655'; ctx.lineWidth = 1; ctx.stroke();
              ctx.fillStyle = played ? '#e6cf9d' : '#a8cdf0'; ctx.fillText(text, mx, my + 3.5);
            }
          }

          // nodes, outer rings first so the focus is painted last and on top
          const order = [...nodes].sort((a, b) => b.depth - a.depth);
          for (const n of order) {
            const focus = n.depth === 0;
            const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r + (focus ? 12 : 6));
            glow.addColorStop(0, focus ? '#638abd' : n.depth === 1 ? '#385b83' : '#2b4666');
            glow.addColorStop(1, '#263c5700');
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + (focus ? 12 : 6), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = focus ? '#386794' : n.depth === 1 ? '#203a58' : '#1b3049';
            ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
            const img = art(n.card);
            if (img) {
              /* The art box of a Magic card sits in roughly the top half. A square crop of
                 that region, drawn to cover the disc, gives the painting and not the text. */
              ctx.save(); ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.clip();
              const sw = img.naturalWidth * .84, sx = img.naturalWidth * .08, sy = img.naturalHeight * .11;
              ctx.drawImage(img, sx, sy, sw, sw, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
              ctx.restore();
            } else if (n.depth <= 1) {
              ctx.fillStyle = '#bddbff'; ctx.font = (focus ? '12' : '9') + 'px Satoshi, sans-serif'; ctx.textAlign = 'center';
              ctx.fillText((n.card.ci || 'C').split('').join(' '), n.x, n.y + (focus ? 4 : 3));
            }
            /* A CARD YOU OWN WEARS A GOLD BAND, just outside its disc. Outside rather than
               instead of the ring the node already has, because that ring says what the
               reader is doing -- selected, pinned, focused, which ring it sits in -- and
               owning a card is a fact about the card. Scaled with the disc so it reads as
               a band on ring 1 and still as a band out on ring 3. */
            if (owned && owned.has(n.card.name)) {
              const band = Math.max(1.5, n.r * .11);
              ctx.strokeStyle = '#f2c96b'; ctx.lineWidth = band;
              ctx.beginPath(); ctx.arc(n.x, n.y, n.r + band / 2 + 1, 0, Math.PI * 2); ctx.stroke();
            }
            const isSel = selected.has(n.card.id);
            ctx.strokeStyle = isSel ? '#ffd166' : n.pinned ? '#e0b660' : focus ? '#c0e8ff' : n.depth === 1 ? '#71b6e3' : '#4f89b8';
            ctx.lineWidth = isSel ? 3 : n.pinned ? 2 : focus ? 1.5 : 1;
            ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.stroke();
            if (isSel) {
              // a small check badge, so a selected card reads as selected at any zoom
              ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(n.x + n.r * .7, n.y - n.r * .7, Math.max(6, n.r * .32), 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = '#1b1b1b'; ctx.font = 'bold ' + Math.max(8, n.r * .4) + 'px Satoshi, sans-serif'; ctx.textAlign = 'center';
              ctx.fillText('✓', n.x + n.r * .7, n.y - n.r * .7 + Math.max(3, n.r * .14));
            }
            /* Names per ring, gated on zoom: ring 1 always, ring 2 from 0.8, ring 3 from
               1.3. Below those the text would be a smaller smear than the circle it labels. */
            const showName = n.depth === 0 || n.pinned || (roomy(n.depth) && (n.depth === 1 || (n.depth === 2 && scale >= .8) || (n.depth === 3 && scale >= 1.3)));
            if (showName) {
              const name = (n.pinned ? '◀ ' : '') + n.card.name;
              const max = n.depth === 0 ? 28 : n.depth === 1 ? 24 : 18;
              ctx.fillStyle = n.depth <= 1 ? '#edf7ff' : '#c9dcf2';
              ctx.font = (focus ? 'bold 13' : n.depth === 1 ? '11' : '10') + 'px Satoshi, sans-serif'; ctx.textAlign = 'center';
              ctx.fillText(name.length > max ? name.slice(0, max - 2) + '…' : name, n.x, n.y + n.r + (n.depth <= 1 ? 15 : 12));
            }
          }

          /* The rested-on card's name, drawn after every node so it is never buried, and
             above the disc so the cursor is not sitting on top of the answer. */
          if (named && nodes.includes(named)) {
            const label = named.card.name;
            ctx.font = 'bold 12px Satoshi, sans-serif'; ctx.textAlign = 'center';
            const w = ctx.measureText(label).width + 14, h = 20;
            const y = named.y - named.r - 14;
            ctx.fillStyle = '#0b1420f2';
            ctx.beginPath(); ctx.roundRect(named.x - w / 2, y - h / 2, w, h, 9); ctx.fill();
            ctx.strokeStyle = '#7fb2dd88'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = '#eaf4ff'; ctx.fillText(label, named.x, y + 4);
          }
          ctx.restore();
        });
      }

      /* ------------------------------------------------------------- pointing */

      function pick(e) {
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left - width / 2 - pan.x) / scale, y = (e.clientY - r.top - height / 2 - pan.y) / scale;
        // smallest hit first, so a ring-3 dot inside a ring-1 halo is still pickable
        return [...nodes].sort((a, b) => a.r - b.r).find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 8);
      }
      /* The nearest edge to a tap, in screen pixels, when no node was hit. Tree edges and
         cross-links alike: a cross-link is exactly the connection a reader asks "why?"
         about. The ends of a segment are excluded so a tap beside a node is not an edge. */
      function pickEdge(e) {
        const r = canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const sx = (n) => width / 2 + pan.x + n.x * scale, sy = (n) => height / 2 + pan.y + n.y * scale;
        let best = null, bestD = 7;
        for (const edge of edges) {
          const ax = sx(edge.a), ay = sy(edge.a), bx = sx(edge.b), by = sy(edge.b);
          const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
          let t = ((px - ax) * dx + (py - ay) * dy) / len2; t = Math.max(.1, Math.min(.9, t));
          const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
          if (d < bestD) { bestD = d; best = edge; }
        }
        return best;
      }
      const screenOf = (n) => ({x: width / 2 + pan.x + n.x * scale, y: height / 2 + pan.y + n.y * scale, r: n.r * scale});
      function relation(idA, idB) {
        const a = byId.get(idA), b = byId.get(idB);
        if (!a || !b || a.id === b.id) return null;
        const co = (coPlay.get(a.id) || []).find((x) => x.from === b.id || x.to === b.id) || null;
        const r = relate(a, b);
        if (!r && !co) return null;
        const none = [];
        /* Every list the pop-up reads, present even when empty: the tribal and stat lists
           arrived in relate() after this was written, and a missing one threw inside the
           pointerup handler -- which left the drag armed and the whole graph glued to the
           cursor, the symptom a reader met as "Inspect does not inspect". */
        return {shared: r ? r.shared : none, feeds: r ? r.feeds : none, fed: r ? r.fed : none,
          fires: r ? r.fires : none, firedBy: r ? r.firedBy : none,
          multiplied: r ? r.multiplied : none, multiplies: r ? r.multiplies : none,
          extended: r ? r.extended : none, extendedBy: r ? r.extendedBy : none,
          tribal: r && r.tribal ? r.tribal : none, tribalBy: r && r.tribalBy ? r.tribalBy : none,
          statted: r && r.statted ? r.statted : none, stattedBy: r && r.stattedBy ? r.stattedBy : none,
          kind: r ? r.kind : 'EDHREC co-play',
          reason: r ? r.reason : null, coPlay: co ? {decks: co.decks, inclusion: co.inclusion} : null};
      }
      function select(id, history = true) {
        if (!byId.has(id)) return;
        if (history && id !== center) trail.push(center);
        center = id; touched = false;
        layout(); fit(); draw();
        onSelect && onSelect(byId.get(id));
      }
      function span() {
        const [a, b] = [...pointers.values()];
        return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))};
      }
      function wheel(e) {
        e.preventDefault();
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left - width / 2, y = e.clientY - r.top - height / 2, old = scale;
        touched = true; scale = clampScale(scale * Math.exp(-e.deltaY * .001));
        pan.x = x - (x - pan.x) * scale / old; pan.y = y - (y - pan.y) * scale / old; draw();
      }
      function down(e) {
        pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
        /* Capture is an optimisation, not a requirement, and it THROWS on a pointer the
           browser no longer considers active. Letting that escape once skipped the pinch
           arming below it. */
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* carry on without it */ }
        if (pointers.size === 2) { pinch = span(); pinch.scale = scale; pinch.pan = {x: pan.x, y: pan.y}; drag = null; return; }
        if (pointers.size === 1) drag = {x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false};
      }
      function move(e) {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
        if (pinch && pointers.size === 2) {
          /* Zoom about the point BETWEEN the fingers, so the card you pinched over stays
             under them; anchoring at the canvas centre is what makes a pinch fight you. */
          const now = span(), r = canvas.getBoundingClientRect();
          const cx = now.x - r.left - width / 2, cy = now.y - r.top - height / 2;
          touched = true; scale = clampScale(pinch.scale * (now.d / pinch.d));
          const k = scale / pinch.scale;
          pan.x = cx - (cx - pinch.pan.x) * k + (now.x - pinch.x);
          pan.y = cy - (cy - pinch.pan.y) * k + (now.y - pinch.y);
          draw(); return;
        }
        if (!drag) {
          if (e.pointerType === 'mouse') { const n = pick(e); if (n !== hover) { hover = n; canvas.style.cursor = n ? 'pointer' : ''; nameAfterRest(n); draw(); } }
          return;
        }
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = drag.moved || Math.hypot(dx, dy) > 5;
        pan = {x: drag.px + dx, y: drag.py + dy}; draw();
      }
      function up(e) {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        /* The drag is over the moment the pointer lifts. It used to be cleared at the end of
           this handler, after the tap callbacks -- so a callback that threw left it armed and
           every later mouse move panned the canvas. */
        const tap = drag && !drag.moved; drag = null;
        if (tap) {
          /* A phone has no '0' key: two taps in the same spot inside 300ms resets the view.
             Touch only, and never in select mode -- a mouse has the key and the button,
             and someone ticking neighbours quickly at low zoom lands two clicks within
             24px of each other without meaning "reset". */
          const now = Date.now();
          if (e.pointerType === 'touch' && mode !== 'select' && now - lastTap.at < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) {
            lastTap = {at: 0, x: 0, y: 0}; fit(); draw(); return;
          }
          lastTap = {at: now, x: e.clientX, y: e.clientY};
          const n = pick(e);
          if (n && mode === 'select') {
            if (selected.has(n.card.id)) selected.delete(n.card.id); else selected.add(n.card.id);
            draw(); onPick && onPick(n.card, new Set(selected));
          } else if (n && mode === 'inspect') {
            const at = screenOf(n);
            onHit && onHit({kind: 'node', card: n.card, depth: n.depth, pinned: !!n.pinned, relation: relation(center, n.card.id), x: at.x, y: at.y + at.r});
          } else if (n) select(n.card.id);
          else {
            const edge = pickEdge(e);
            const r = canvas.getBoundingClientRect();
            if (edge) onHit && onHit({kind: 'edge', a: edge.a.card, b: edge.b.card, tree: edge.tree, edgeKind: edge.kind, relation: relation(edge.a.card.id, edge.b.card.id), x: e.clientX - r.left, y: e.clientY - r.top});
            else onHit && onHit(null);
          }
        }
      }
      function key(e) {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '0'].includes(e.key)) return;
        e.preventDefault();
        if (e.key === '0') fit();
        else if (e.key === '+') { touched = true; scale = clampScale(scale * 1.2); }
        else if (e.key === '-') { touched = true; scale = clampScale(scale / 1.2); }
        else { pan.x += e.key === 'ArrowLeft' ? 25 : e.key === 'ArrowRight' ? -25 : 0; pan.y += e.key === 'ArrowUp' ? 25 : e.key === 'ArrowDown' ? -25 : 0; }
        draw();
      }
      function resize() {
        const r = canvas.getBoundingClientRect(); const first = !width || !height;
        /* The canvas is stretched to the pane beside it, and that pane is rewritten from
           this module's own layout callback. Re-laying out on a sub-pixel wobble is how
           that becomes a loop; a real resize is whole pixels. */
        if (!first && Math.abs(r.width - width) < 1 && Math.abs(r.height - height) < 1) return;
        width = r.width; height = r.height;
        const d = Math.min(devicePixelRatio || 1, 2);
        canvas.width = width * d; canvas.height = height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
        // the rings are a function of the canvas, so a rotation must move the nodes, not just repaint
        layout(); if (first || !touched) fit(); draw();
      }

      canvas.addEventListener('wheel', wheel, {passive: false});
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('pointerleave', () => { nameAfterRest(null); if (hover || named) { hover = null; named = null; canvas.style.cursor = ''; draw(); } });
      canvas.addEventListener('keydown', key);
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      layout(); resize();

      const api = {
        select,
        back() { while (trail.length) { const id = trail.pop(); if (byId.has(id)) { select(id, false); return; } } },
        history() { return [...trail]; },
        setType(value) { type = value; layout(); fit(); draw(); },
        setDepth(value) { depth = clampDepth(value); layout(); fit(); draw(); },
        setBreadth(value) { breadth = clampBreadth(value); layout(); fit(); draw(); },
        reset() { fit(); draw(); },
        terms(id) { return termsOf(byId.get(id || center)); },
        get settings() { return {type, depth, breadth, nodes: nodes.length, mode}; },
        setMode(value) { mode = ['select', 'inspect'].includes(value) ? value : 'navigate'; draw(); },
        /* The edge a pop-up is about, lit in gold until the pop-up closes. */
        setHighlight(pair) { highlight = pair && pair.length === 2 ? [pair[0], pair[1]] : null; draw(); },
        relation,
        /* The card the reader came from, if it is on the canvas. */
        previous() { const p = nodes.find((n) => n.pinned); return p ? p.card : null; },
        setSelected(ids) { selected.clear(); for (const id of ids || []) selected.add(id); draw(); },
        get selected() { return new Set(selected); },
        /* Which cards are on the canvas right now -- what "tick all shown" means. */
        visible() { return nodes.map((n) => n.card); },
        /* Where each node is on the canvas right now, in CSS pixels -- what a pop-up
           anchors to, and what a test clicks. */
        positions() { return nodes.map((n) => ({id: n.card.id, name: n.card.name, depth: n.depth, pinned: !!n.pinned, parent: n.parent ? n.parent.card.id : null, x: width / 2 + pan.x + n.x * scale, y: height / 2 + pan.y + n.y * scale, r: n.r * scale})); },
        current() { return byId.get(center) || null; },
        destroy() {
          disposed = true; if (nameTimer) clearTimeout(nameTimer); cancelAnimationFrame(frame); observer.disconnect();
          for (const [name, fn] of [['wheel', wheel], ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['keydown', key]]) canvas.removeEventListener(name, fn);
        }
      };
      canvas.crankGraph = api;
      return api;
    }
  };
})(globalThis);
