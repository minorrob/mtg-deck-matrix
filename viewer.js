/* My Commander Decks — the fast view.
 *
 * Three tabs and nothing else: the six decks, the bench, and what is still to
 * buy. Everything it shows comes from data/master-v2.json, which is generated
 * from the Deck Master workbook by tools/import_master_v2.py; the ratings and
 * the play guides are separate files and the page renders without them if they
 * are missing, because they are regenerated on a different cadence.
 *
 * There is deliberately no deck-comparison machinery here. That still exists,
 * in full, at matrix.html.
 */
(function () {
  "use strict";

  var DATA = null, RATINGS = null, GUIDES = null, SWAPS = null;

  /* The workbook's six, exactly as loaded, and the decks somebody added on this
     device. DATA is the two folded together and is what every render reads; the
     master is kept apart so removing an import restores the six unchanged rather
     than approximately. */
  var MASTER = null, IMPORTS = [];

  /* What the reader says they own, if they have told us. null means they have
     not, and the workbook's own audited figures stand untouched -- which is the
     default and must stay the default, because those figures were counted by
     hand against physical boxes and an upload is a claim. */
  var INVENTORY = null;

  var STORE = "mtg-viewer.v1";
  var state = {
    view: "decks",
    deck: null,
    picks: new Map(),     // "<source>|<name>" -> {name, price, source, where}
    shareTo: "",
    query: "",
    /* One table, two lists, one shape of state each.
       `f` is the filter -- chosen values per facet, plus `query` and `open` (which
       facet menu is showing). `sort` is the column and direction.

       The bench opens on VALUE descending, not A-Z. The question asked of it, at ten
       cards or at two thousand, is "is there anything in here worth doing something
       about", which alphabetical order answers last -- and past the page cap only the
       first page is on screen, so the first fifty cards beginning with A is an
       arbitrary answer where the fifty most valuable is a real one.

       Upgrades opens on deck, because the question there is "what would I change about
       THIS deck", and a list mixing six decks by price answers a question nobody asked. */
    bench: {f: {}, sort: {key: "value", dir: "desc"}},
    upgrades: {f: {}, sort: {key: "deck", dir: "asc"}},
    archivedId: null
  };

  /* ------------------------------------------------------------- plumbing */

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    (Array.isArray(kids) ? kids : kids ? [kids] : []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    });
    return node;
  }

  function money(n) {
    if (n === null || n === undefined) return "—";
    return "$" + Number(n).toFixed(2);
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        shareTo: state.shareTo,
        picks: Array.from(state.picks.values()),
        /* How the lists are arranged is a preference, and a preference that
           does not survive a reload is a preference the app forgot. These were
           being changed, save() was being called, and none of them was in the
           object -- so picking "By color" lasted exactly until the next visit.
           `query` stays out on purpose: a search box that comes back pre-filled is
           the app deciding something the reader did not ask for twice. */
        bench: {f: withoutOpen(state.bench.f), sort: state.bench.sort},
        upgrades: {f: withoutOpen(state.upgrades.f), sort: state.upgrades.sort}
      }));
    } catch (err) { /* private mode, or storage off; the page still works */ }
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || "{}");
      state.shareTo = raw.shareTo || "";
      // Read back only against the facets and columns this build offers, so a saved
      // file from an older one cannot leave a tab filtered by a dimension that is gone
      // -- which looks exactly like a list that lost half its rows for no reason.
      readTable(state.bench, raw.bench, benchFacets(), BENCH_COLUMNS);
      readTable(state.upgrades, raw.upgrades, upgradeFacets(), UPGRADE_COLUMNS);
      (raw.picks || []).forEach(function (p) { state.picks.set(p.source + "|" + p.name, p); });
    } catch (err) { /* ignore anything unparseable */ }
  }

  /* -------------------------------------------------------- added decks */

  var Store = window.MtgDeckStore;

  /* Fold the added decks back into the catalog and drop every memo computed off
     the old one. byName caches a name index and orderedDecks stamps _rank onto
     the deck objects; both describe the catalog that was, and a stale index is
     how an added card would come back "not found" from the row that holds it. */
  /* A BROWSER THAT HAS NEVER OPENED THIS APP HAS NO DECKS.
   *
   * data/master-v2.json carries two things at once: the card catalog, which belongs to
   * the repository, and one person's build of six decks -- what is boxed, what is owed,
   * what is on the bench -- which does not. Loading both meant a stranger, and anybody
   * who had just pressed Clear session, opened the page to somebody else's six decks and
   * a 176-card bench presented as their own, with no way to tell the difference.
   *
   * So the build half is gated. A fresh browser gets the catalog with every deck and
   * every ownership figure zeroed: the card list still works, search still works, the
   * graph is untouched, and My Decks is empty with a note saying how it fills. Add a
   * deck, build one, or press Load default, and the six come back.
   *
   * `fresh` is the whole browser, not this page: somebody who has only ever used the
   * Deck Matrix has a session, and taking their decks away here because they have not
   * ticked anything on this page would be the same bug in the other direction.
   */
  /* WHETHER THE SIX SHIPPED DECKS BELONG ON THIS PAGE.
     It used to be inferred -- "this browser has saved nothing, so show nothing" -- and
     the inference broke the moment you saved anything. Clear session, then add one deck
     of your own, and all six came back with their collection and their bench, because
     saving your deck made the browser no longer empty. The decision is recorded now;
     see user-state.js. Adding decks does not change it, and Load default is the only
     thing that brings the six back. */
  function freshBrowser() {
    var User = window.MtgUserState;
    if (!User || !User.startsEmpty) return false;  // cannot tell, so change nothing
    return User.startsEmpty(window.localStorage);
  }

  function blankMaster(master) {
    return Object.assign({}, master, {
      decks: [],
      cards: master.cards.map(function (c) {
        return Object.assign({}, c, {
          target: {}, actual: {}, own: 0, ordered: 0, qty: 0,
          bench: 0, benchTarget: 0, benchActual: 0, buyCount: 0, toBuyCost: 0, status: ""
        });
      })
    });
  }

  function rebuild() {
    var base = freshBrowser() ? blankMaster(MASTER) : MASTER;
    DATA = dropArchived(Store ? Store.merge(base, IMPORTS) : base);
    applyInventory();
    byName.index = null;
    // merge builds new deck objects, so a deck page already open is holding the
    // old one. Re-point it, or scoring a deck leaves its own banner still saying
    // "not scored yet" while the stat block above it shows the score.
    if (state.deck) {
      state.deck = DATA.decks.filter(function (d) { return d.id === state.deck.id; })[0] || null;
    }
  }

  /* An uploaded collection replaces the workbook's ownership figures.
     -----------------------------------------------------------------
     Every `actual`, `bench` and `own` on the catalog is recomputed from what the
     file says, by allocating copies to decks in deck order and calling the
     remainder bench. That is the same arithmetic the workbook does by hand, run
     against a different set of numbers.

     DATA is rebuilt from MASTER on every call, so this writes to a fresh copy
     and the workbook's own figures are one `clearInventory()` away, with no
     reload and nothing to undo.

     Deck order decides who gets the only copy of a card three decks want. It is
     the Master's own order, which is stable and stated, rather than the ranked
     order -- ranking depends on the ratings, which depend on the decks, and a
     rule that changes when a score changes is not a rule anybody can predict. */
  function applyInventory() {
    var Inv = window.MtgInventoryImport;
    if (!INVENTORY || !Inv || !DATA) return;
    var decks = DATA.decks.map(function (deck) {
      return {
        id: deck.id, label: deck.label,
        wants: DATA.cards.filter(function (c) { return (c.target[deck.id] || 0) > 0; })
          .map(function (c) { return {name: c.name, quantity: c.target[deck.id]}; })
      };
    });
    var result = Inv.reconcile(INVENTORY.cards, decks);
    INVENTORY.result = result;

    var held = {};
    result.holdings.forEach(function (row) { held[row.name.toLowerCase()] = row; });
    var allocated = {};
    result.decks.forEach(function (deck) {
      deck.filled.forEach(function (f) {
        allocated[f.name.toLowerCase() + "|" + deck.id] = f.quantity;
      });
    });

    /* A NEW object, not an assignment into DATA. With no added decks Store.merge
       returns the master itself -- there is nothing to merge, so there is nothing
       to copy -- and writing DATA.cards would overwrite the workbook's own rows
       in place. Reverting would then "restore" the numbers the upload had already
       replaced, which is exactly what it did before this line. */
    var cards = DATA.cards.map(function (card) {
      var row = held[card.name.toLowerCase()];
      var actual = {};
      var short = 0;
      DATA.decks.forEach(function (deck) {
        var got = allocated[card.name.toLowerCase() + "|" + deck.id] || 0;
        actual[deck.id] = got;
        short += Math.max(0, (card.target[deck.id] || 0) - got);
      });
      var owned = row ? row.quantity : 0;
      return Object.assign({}, card, {
        actual: actual,
        own: owned,
        qty: owned,
        // Ordered copies came from the workbook and describe a purchase, not a
        // shelf. An upload says nothing about them, so they are cleared rather
        // than carried over as if the file had confirmed them.
        ordered: 0,
        bench: row ? row.spare : 0,
        benchActual: row ? row.spare : 0,
        /* buyCount and status are what the To Buy tab reads. Leaving them at the
           workbook's figures left that tab describing the audited collection
           while the ribbon beside it described the uploaded one -- two counts of
           the same thing, on the same screen, disagreeing. */
        buyCount: short,
        toBuyCost: card.price ? short * card.price : 0,
        status: owned > 0 ? "In Hand" : "To Buy"
      });
    });

    // A card in the file that no deck lists is still owned, and belongs on the
    // bench rather than nowhere.
    var known = {};
    cards.forEach(function (c) { known[c.name.toLowerCase()] = true; });
    result.holdings.filter(function (row) { return !known[row.name.toLowerCase()]; })
      .forEach(function (row) {
        var blank = {};
        DATA.decks.forEach(function (d) { blank[d.id] = 0; });
        cards.push({
          name: row.name, bracket: "", target: Object.assign({}, blank), actual: Object.assign({}, blank),
          benchTarget: 0, benchActual: row.spare, qty: row.quantity, own: row.quantity,
          cartVendor: "", ordered: 0, price: null, type: "Card", subType: "", color: "C",
          mv: 0, series: "", purpose: "", mechanics: [], notes: "", moves: "",
          bench: row.spare, buyCount: 0, toBuyCost: 0, status: "In Hand",
          priceSource: "upload", fromUpload: true
        });
      });

    DATA = Object.assign({}, DATA, {cards: cards});
  }

  var INVENTORY_KEY = "mtg-viewer-inventory.v1";

  function saveInventory() {
    try {
      if (INVENTORY) {
        localStorage.setItem(INVENTORY_KEY, JSON.stringify({
          cards: INVENTORY.cards, uploadedAt: INVENTORY.uploadedAt, source: INVENTORY.source
        }));
      } else localStorage.removeItem(INVENTORY_KEY);
      return true;
    } catch (err) { return false; }
  }

  function loadInventory() {
    try {
      var raw = JSON.parse(localStorage.getItem(INVENTORY_KEY) || "null");
      INVENTORY = raw && Array.isArray(raw.cards) && raw.cards.length ? raw : null;
    } catch (err) { INVENTORY = null; }
  }

  function clearInventory() {
    INVENTORY = null;
    saveInventory();
    rebuild();
    toast("Back to the workbook's own counts.");
    render();
  }

  function saveImports() {
    if (!Store) return true;
    var ok = Store.write(window.localStorage, IMPORTS);
    if (!ok) toast("This browser would not save the deck — it is here until you reload.");
    return ok;
  }

  /* ------------------------------------------------------------- archive */

  /* PUT A DECK DOWN WITHOUT THROWING IT AWAY.
   *
   * Six decks was a list you could hold in your head. Sixteen is not, and most of them
   * are not what anybody is working on this month -- so the page needs a way to say "not
   * now" that is neither deleting the deck nor scrolling past it forever.
   *
   * Archiving hides a deck from the list AND stops it counting: its shortfall leaves To
   * Buy, because a deck you are not building is not a deck you are shopping for -- that is
   * the whole reason to archive one, and a To Buy total that still included it would make
   * the feature pointless.
   *
   * What it does NOT claim is where the physical cards went. A deck you archive may still
   * be sleeved in its box. With an uploaded collection the allocation genuinely re-runs
   * and its copies land on the bench, which is right because the collection is a count of
   * what exists; without one, the workbook's own bench figure is left exactly alone rather
   * than added to on a guess. So the bench usually does not move, and nothing on screen
   * says it will.
   *
   * It applies to all sixteen, not just the added ones. The six come from the repository
   * and cannot be deleted -- there is nothing local to delete -- but "I am not playing
   * Atraxa this year" is the same sentence about any of them. */
  var ARCHIVE_KEY = "mtg-viewer-archived.v1";
  var ARCHIVED = [];

  function loadArchived() {
    try {
      var raw = JSON.parse(window.localStorage.getItem(ARCHIVE_KEY) || "null");
      ARCHIVED = Array.isArray(raw) ? raw.filter(function (id) { return typeof id === "string"; }) : [];
    } catch (err) { ARCHIVED = []; }
  }
  function saveArchived() {
    try {
      if (ARCHIVED.length) window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify(ARCHIVED));
      else window.localStorage.removeItem(ARCHIVE_KEY);
    } catch (err) { toast("This browser would not remember that — it holds until you reload."); }
  }
  function isArchived(id) { return ARCHIVED.indexOf(id) >= 0; }

  function setArchived(id, on) {
    var at = ARCHIVED.indexOf(id);
    if (on && at < 0) ARCHIVED.push(id);
    if (!on && at >= 0) ARCHIVED.splice(at, 1);
    saveArchived();
    rebuild();
    render();
  }

  /* The archived decks, read off the unfiltered catalog rather than the visible one --
     which no longer has them, that being the point. */
  function archivedDecks() {
    var base = Store ? Store.merge(MASTER, IMPORTS) : MASTER;
    return ((base && base.decks) || []).filter(function (d) { return isArchived(d.id); });
  }

  /* Everything downstream of this reads DATA, so filtering here is the whole feature:
     the grid, the ranking, the bench, the buy list and the collection allocation all
     stop seeing the deck at once, and none of them needs to know why. */
  function dropArchived(data) {
    if (!data || !ARCHIVED.length) return data;
    var gone = {};
    ARCHIVED.forEach(function (id) { gone[id] = 1; });
    var decks = (data.decks || []).filter(function (d) { return !gone[d.id]; });
    if (decks.length === (data.decks || []).length) return data;
    var strip = function (map) {
      var out = {};
      Object.keys(map || {}).forEach(function (id) { if (!gone[id]) out[id] = map[id]; });
      return out;
    };
    var sum = function (map) {
      return Object.keys(map || {}).reduce(function (n, id) { return n + (Number(map[id]) || 0); }, 0);
    };
    var cards = (data.cards || []).map(function (card) {
      var target = strip(card.target);
      /* RECOMPUTED, NOT LEFT ALONE. buyCount is a column in the workbook, and leaving it
         at the workbook's figure made archiving a half-measure: a deck's upgrade rows left
         the buy list (those are derived from the deck) and its shortfall rows stayed
         (that column is not). Checked against data/master-v2.json, the column IS exactly
         `what every deck wants, minus what you own, minus what is on the way` on all 648
         rows -- so this is the workbook's own arithmetic run over the decks that are
         left, not an attribution invented here. */
      var short = Math.max(0, sum(target) - (Number(card.own) || 0) - (Number(card.ordered) || 0));
      return Object.assign({}, card, {
        target: target, actual: strip(card.actual),
        buyCount: short,
        toBuyCost: card.price ? short * card.price : 0
      });
    });
    return Object.assign({}, data, {decks: decks, cards: cards});
  }

  /* --------------------------------------------------------- card reading */

  // Card type buckets, in the order a decklist is normally written out.
  var GROUPS = [
    ["Commander", function (c, d) { return c.name === d.commander; }],
    ["Creatures", function (c) { return /Creature/.test(c.type); }],
    ["Planeswalkers", function (c) { return /Planeswalker/.test(c.type); }],
    ["Instants", function (c) { return /Instant/.test(c.type); }],
    ["Sorceries", function (c) { return /Sorcery/.test(c.type); }],
    ["Artifacts", function (c) { return /Artifact/.test(c.type); }],
    ["Enchantments", function (c) { return /Enchantment/.test(c.type); }],
    ["Battles", function (c) { return /Battle/.test(c.type); }],
    ["Lands", function (c) { return /Land/.test(c.type); }]
  ];

  function byName(name) {
    if (!byName.index) {
      byName.index = {};
      DATA.cards.forEach(function (c) { byName.index[c.name] = c; });
    }
    return byName.index[name] || null;
  }

  /* Where a copy of this card stands, for this deck specifically.
     "box" it is physically in that deck's box · "hand" a spare copy is on the
     bench so the slot can be filled today · "order" bought, in transit ·
     "buy" nothing anywhere. */
  function slotState(card, deckId) {
    var want = card.target[deckId] || 0;
    var have = card.actual[deckId] || 0;
    if (have >= want) return "box";
    if (card.benchActual > 0) return "hand";
    if (card.ordered > 0) return "order";
    return "buy";
  }

  var SLOT_LABEL = { box: "In the box", hand: "On the bench", order: "On order", buy: "To buy" };

  function deckCards(deck) {
    return DATA.cards
      .filter(function (c) { return (c.target[deck.id] || 0) > 0; })
      .map(function (c) {
        return { card: c, qty: c.target[deck.id], state: slotState(c, deck.id) };
      });
  }

  // Cards sitting in a deck's box that its plan does not ask for. The workbook
  // calls these placeholders: real cards filling a slot until the right one lands.
  function placeholders(deck) {
    return DATA.cards.filter(function (c) {
      return (c.actual[deck.id] || 0) > (c.target[deck.id] || 0);
    });
  }

  function deckStats(deck) {
    var rows = deckCards(deck), tally = { box: 0, hand: 0, order: 0, buy: 0 }, cost = 0;
    rows.forEach(function (r) {
      tally[r.state] += r.qty;
      if (r.state === "buy" && r.card.price) cost += r.card.price * r.qty;
    });
    // An added deck may be 97 cards, and a readiness bar drawn against 100 would
    // report it as permanently short of a hundredth card it does not want.
    return { rows: rows, tally: tally, toBuyCost: cost, total: deck.targetCards || 100 };
  }

  // The curve and the role split, computed here rather than trusted to the
  // guides file, so the numbers on screen always describe the current list.
  function deckShape(deck) {
    var rows = deckCards(deck), curve = {}, roles = {}, lands = 0, spells = 0, mvSum = 0;
    for (var i = 1; i <= 8; i += 1) curve[i] = 0;
    rows.forEach(function (r) {
      var c = r.card;
      if (/Land/.test(c.type)) { lands += r.qty; return; }
      spells += r.qty;
      var mv = Math.max(1, Math.min(8, Math.round(c.mv || 0)));
      curve[mv] += r.qty;
      mvSum += (c.mv || 0) * r.qty;
      // "Tuned add" is bookkeeping about how a card got here, not a job it does.
      if (c.purpose && c.purpose !== "Tuned add") {
        roles[c.purpose] = (roles[c.purpose] || 0) + r.qty;
      }
    });
    return { curve: curve, roles: roles, lands: lands, spells: spells,
             avgMv: spells ? mvSum / spells : 0 };
  }

  /* An added deck has no written hook, because nobody wrote one for it. What can
     honestly be said is what it is made of, which is what the guides' first line
     would have covered anyway. */
  function addedHook(deck) {
    var shape = deckShape(deck), rows = deckCards(deck);
    var creatures = 0;
    rows.forEach(function (r) { if (/Creature/.test(r.card.type)) creatures += r.qty; });
    var colors = colorsOf(deck);
    var SPREAD = { 0: "Colorless", 1: "Mono-color", 2: "Two colors",
                   3: "Three colors", 4: "Four colors", 5: "Five colors" };
    return (SPREAD[colors.length] || "Multicolor") + ". " +
      plural(shape.lands, "land") + ", " + plural(creatures, "creature") +
      ", average mana value " + shape.avgMv.toFixed(2) + ".";
  }

  function colorsOf(deck) {
    var seen = {};
    deckCards(deck).forEach(function (r) {
      var col = r.card.color || "";
      if (col === "Multi" || col === "" || col === "C") return;
      col.split("").forEach(function (ch) { if ("WUBRG".indexOf(ch) >= 0) seen[ch] = true; });
    });
    var guide = guideFor(deck.id);
    if (guide && guide.colorIdentity && guide.colorIdentity.length) {
      return guide.colorIdentity;
    }
    return "WUBRG".split("").filter(function (ch) { return seen[ch]; });
  }

  /* Guides, ratings and swaps are keyed by slot id, but they were generated for
     the commander that held the slot at the time. After the 2026-09-05 rebuild
     D4 and D6 changed hands (Felothar, Krenko), so a record only counts when
     its commander matches the master's; a stale one is hidden, not shown. */
  function sameCommander(rec, id) {
    var deck = (DATA.decks || []).filter(function (d) { return d.id === id; })[0];
    return !deck || !rec.commander || rec.commander === deck.commander;
  }
  function guideFor(id) {
    if (!GUIDES) return null;
    return (GUIDES.decks || []).filter(function (g) { return g.id === id && sameCommander(g, id); })[0] || null;
  }

  /* The optimizer's recommendations were measured against the hundred as it
     stood on 2026-09-04, and the 2026-09-05 rebuild changed 14 to 30 cards in
     every deck. Its source lists are gone, so the file cannot be regenerated --
     but a swap can still be checked one at a time: "cut X for Y" is advice only
     while X is still in the deck. The dead ones are dropped rather than the
     whole panel hidden, because the 45 that survive are still the right call,
     and the panel says how many went and why. */
  function swapsFor(id) {
    if (!SWAPS) return null;
    var rec = (SWAPS.decks || []).filter(function (s) { return s.id === id; })[0];
    if (!rec) return null;
    var deck = (DATA.decks || []).filter(function (d) { return d.id === id; })[0];
    if (!deck) return rec;
    var held = {};
    deckCards(deck).forEach(function (r) { held[r.card.name] = true; });
    var live = (rec.swaps || []).filter(function (s) { return !s.out || held[s.out]; });
    if (live.length === (rec.swaps || []).length && rec.commander === deck.commander) return rec;
    return {
      id: rec.id, label: rec.label, commander: rec.commander,
      tiers: rec.tiers, before: rec.before, swaps: live,
      dropped: (rec.swaps || []).length - live.length,
      // A seat change makes every measured figure in the record describe a deck
      // with a different commander, which the reader should be told once.
      reseated: rec.commander !== deck.commander ? rec.commander : null
    };
  }

  /* An added deck carries its own measurement rather than appearing in the
     ratings file, which is generated from the workbook and knows nothing about
     it. Shaped like a ratings record so every reader stays the same. */
  function ratingFor(id) {
    var deck = (DATA.decks || []).filter(function (d) { return d.id === id; })[0];
    if (deck && deck.imported) {
      if (!deck.measured) return null;
      /* THE WHOLE MEASUREMENT, not three fields of it. Copying `score` and `winRate`
         by hand left screwPct and floodPct undefined, and the Shape panel printed
         "Mana screw NaN%" over an imported deck -- the one place the app looked least
         like it knew what it was doing. measure() returns every one of these; pass
         them all and a new metric shows up without being wired in twice. */
      return { id: id, commander: deck.commander,
        builds: { v1: Object.assign({bracket: null}, deck.measured) } };
    }
    if (!RATINGS) return null;
    return (RATINGS.decks || []).filter(function (r) { return r.id === id && sameCommander(r, id); })[0] || null;
  }

  // Rank by measured score when the ratings file is present; otherwise by how
  // close the deck is to being playable, which is the next most useful order.
  function orderedDecks() {
    var decks = DATA.decks.slice();
    decks.forEach(function (d) {
      var r = ratingFor(d.id);
      d._score = r && r.builds && r.builds.v1 ? r.builds.v1.score : null;
      d._ready = deckStats(d).tally.box;
    });
    decks.sort(function (a, b) {
      if (a._score !== null && b._score !== null) return b._score - a._score;
      if (a._score !== null) return -1;
      if (b._score !== null) return 1;
      return b._ready - a._ready;
    });
    decks.forEach(function (d, i) { d._rank = i + 1; });
    return decks;
  }

  /* A deck's place in that order, asked for one deck at a time.
     orderedDecks() stamps _rank as a side effect of building the grid, so a deck
     page opened straight from a link -- a shared URL, a reload, the jump after an
     import -- had never been through it and printed "rank undefined". The order
     is cheap enough to recompute and this is the only honest way to ask. */
  function rankOf(id) {
    var at = orderedDecks().map(function (d) { return d.id; }).indexOf(id);
    return at < 0 ? null : at + 1;
  }

  /* ---------------------------------------------------------- card popup */

  var FACTS = null, factsPending = null;

  /* 403 KB of printed card text and image URLs. Nobody needs it to read the
     deck list, so it is not fetched until the first card is opened. */
  function loadFacts() {
    if (FACTS) return Promise.resolve(FACTS);
    if (!factsPending) {
      factsPending = fetchJson("data/card-facts.json?v=2").then(function (f) {
        FACTS = f.cards || {};
        return FACTS;
      }).catch(function () { FACTS = {}; return FACTS; });
    }
    return factsPending;
  }

  // "{2}{R}{R}" -> pips. Hybrid and phyrexian symbols keep their raw text,
  // which is rare enough here to be worth less code than a full symbol set.
  function manaCost(cost) {
    var wrap = el("span", { class: "cost" });
    (String(cost || "").match(/\{[^}]+\}/g) || []).forEach(function (sym) {
      var body = sym.slice(1, -1);
      wrap.appendChild(el("span", {
        class: "mana" + (/^[WUBRG]$/.test(body) ? " " + body : ""), text: body
      }));
    });
    return wrap;
  }

  // Scryfall wraps reminder text in parentheses; it reads as an aside.
  function oracle(text) {
    var node = el("div", { class: "oracle" });
    String(text || "").split(/(\([^)]*\))/).forEach(function (part) {
      if (!part) return;
      node.appendChild(part.charAt(0) === "(" ? el("em", { text: part })
                                              : document.createTextNode(part));
    });
    return node;
  }

  function closeCard() {
    var sheet = document.getElementById("sheet");
    if (sheet) sheet.remove();
    document.body.style.overflow = "";
    if (closeCard.restore && closeCard.restore.focus) closeCard.restore.focus();
    closeCard.restore = null;
  }

  /* A sheet with arbitrary contents. openCard builds the card one; this is the same
     shell for everything else that needs the reader's whole attention -- so far, the
     "you re-ran it, here is what changed" screen, which has to be answered before it
     overwrites a number somebody may have been relying on. */
  function openSheet(label, nodes, options) {
    closeCard();
    closeCard.restore = document.activeElement;
    document.body.style.overflow = "hidden";
    var body = el("div", { class: "sheet-body" }, [
      el("button", { class: "sheet-x", type: "button", "aria-label": "Close",
        onclick: closeCard, text: "\u00d7" })
    ].concat(nodes));
    var sheet = el("div", { class: "sheet", id: "sheet", role: "dialog",
      "aria-modal": "true", "aria-label": label }, [body]);
    /* A comparison must be answered, not dismissed: clicking away from it would leave
       the reader unsure which of the two numbers is now the deck's. */
    if (!(options && options.mustAnswer)) {
      sheet.addEventListener("click", function (e) { if (e.target === sheet) closeCard(); });
    }
    document.body.appendChild(sheet);
    return body;
  }

  function openCard(name) {
    closeCard();
    closeCard.restore = document.activeElement;
    document.body.style.overflow = "hidden";

    var card = byName(name);
    var flip = el("button", { class: "flip", type: "button",
      "aria-label": "Turn " + name + " over" });
    var front = el("div", { class: "face front" });
    var back = el("div", { class: "face back" });
    flip.appendChild(el("div", { class: "flip-inner" }, [front, back]));
    flip.addEventListener("click", function () { flip.classList.toggle("is-flipped"); });

    var sheet = el("div", { class: "sheet", id: "sheet", role: "dialog",
      "aria-modal": "true", "aria-label": name }, [
      el("div", { class: "sheet-body" }, [
        el("button", { class: "sheet-x", type: "button", "aria-label": "Close",
          onclick: closeCard, text: "×" }),
        flip,
        el("p", { class: "sheet-hint", text: "Tap the card to turn it over" }),
        cardStanding(card, name)
      ])
    ]);
    // A click on the backdrop closes; a click inside must not.
    sheet.addEventListener("click", function (e) { if (e.target === sheet) closeCard(); });
    document.body.appendChild(sheet);
    flip.focus();

    loadFacts().then(function (facts) {
      var f = facts[name];
      fillBack(back, name, f, card);
      /* THE PICTURE, FROM WHEREVER IT IS. The shipped facts file covers 668 cards, so every
         card in a deck somebody pasted in used to open on "is not in the card data" over a
         blank rectangle -- a real card, whose name the app knows, that Scryfall has had a
         picture of the whole time. card-images.js runs the ladder and caches what it
         finds; here we only draw. */
      front.textContent = "";
      front.appendChild(el("div", { class: "fallback", text: name }));
      cardImage(name).then(function (image) {
        if (!image) {
          front.textContent = "";
          front.appendChild(el("div", { class: "fallback",
            text: f ? "No image for " + name : "No picture found for " + name }));
          return;
        }
        var img = el("img", { src: image.normal, alt: name });
        img.addEventListener("error", function () {
          /* A cached URL that has stopped resolving is worse than none: drop it so the
             next open asks again rather than drawing the same broken box forever. */
          if (window.MtgCardImages && image.cached) window.MtgCardImages.forget(window.localStorage, name);
          front.textContent = "";
          front.appendChild(el("div", { class: "fallback", text: "No image for " + name }));
        });
        front.textContent = "";
        front.appendChild(img);
      });
    });
  }

  /* One card's picture: the shipped facts, then this browser's cache, then the image the
     deck record already carries from its import, then Scryfall. See card-images.js. */
  function cardImage(name) {
    var Images = window.MtgCardImages;
    if (!Images) return Promise.resolve(null);
    if (!scryfall && window.MtgScryfall) scryfall = window.MtgScryfall.createClient();
    return loadFacts().then(function (facts) {
      return Images.resolve(name, {
        facts: facts,
        storage: window.localStorage,
        client: scryfall,
        local: function (wanted) { return heldCard(wanted); }
      });
    }).catch(function () { return null; });
  }

  /* The card as the app already holds it -- in an added deck's record, or in the population
     of cards somebody added from a link. Both carry an image and neither needs a request. */
  function heldCard(name) {
    var lower = String(name).toLowerCase();
    for (var i = 0; i < (IMPORTS || []).length; i += 1) {
      var cards = IMPORTS[i].cards || [];
      for (var j = 0; j < cards.length; j += 1) {
        if (String(cards[j].name).toLowerCase() === lower && cards[j].image) return cards[j];
      }
    }
    var Manual = window.MtgManualCards;
    return Manual ? Manual.get(window.localStorage, name) : null;
  }

  function fillBack(back, name, f, card) {
    back.textContent = "";
    back.appendChild(el("h4", {}, [name, f && f.manaCost ? " " : null,
      f && f.manaCost ? manaCost(f.manaCost) : null]));
    if (f) {
      back.appendChild(el("div", { class: "tl", text: f.typeLine }));
      back.appendChild(oracle(f.oracleText));
      var pt = f.power !== undefined && f.power !== null ? f.power + "/" + f.toughness
             : (f.loyalty ? "Loyalty " + f.loyalty : "");
      if (pt) back.appendChild(el("div", { class: "pt", text: pt }));
      back.appendChild(el("div", { class: "foot" }, [
        f.setName ? el("span", { text: f.setName + (f.setCode ? " (" + f.setCode + ")" : "") }) : null,
        f.rarity ? el("span", { text: f.rarity }) : null,
        (card && card.price) || f.price ? el("span", { text: money(card && card.price || f.price) }) : null
      ]));
    } else if (card) {
      // No Scryfall record, but the workbook still knows what it does.
      back.appendChild(el("div", { class: "tl", text: card.type }));
      if (card.mechanics && card.mechanics.length) {
        back.appendChild(oracle(card.mechanics.join("\n")));
      }
    }
  }

  /* Where this card stands in the collection: the half the printed card does
     not tell you, and the reason for opening it on a phone in a card shop. */
  function cardStanding(card, name) {
    if (!card) return null;
    var uses = DATA.decks.filter(function (d) { return (card.target[d.id] || 0) > 0; });
    var box = DATA.decks.filter(function (d) { return (card.actual[d.id] || 0) > 0; });
    var rows = [];

    rows.push(el("div", { class: "row" }, [
      el("span", { class: "chip " + statusChip(card.status), text: card.status }),
      card.purpose ? el("span", { class: "chip plain", text: card.purpose }) : null,
      card.price ? el("span", { text: money(card.price) + " each" }) : null
    ]));
    rows.push(el("div", { class: "row" }, [
      el("span", {}, [el("b", { text: String(card.own) }), " owned"]),
      card.ordered ? el("span", {}, [el("b", { text: String(card.ordered) }), " on order"]) : null,
      card.bench ? el("span", {}, [el("b", { text: String(card.bench) }), " spare on the bench"]) : null,
      card.buyCount ? el("span", {}, [el("b", { text: String(card.buyCount) }), " to buy"]) : null
    ]));
    rows.push(el("div", { class: "row" }, [
      uses.length
        ? el("span", {}, ["Wanted by ", el("b", { text: uses.map(function (d) { return d.label; }).join(", ") })])
        : el("span", { text: "Not in any of the six decks" })
    ]));
    if (box.length) {
      rows.push(el("div", { class: "row" }, [
        el("span", {}, ["In the box for ", el("b", { text: box.map(function (d) { return d.label; }).join(", ") })])
      ]));
    }
    // A card the workbook has a note about usually has one for a reason.
    if (card.notes) rows.push(el("div", { class: "row" }, el("span", { text: card.notes })));
    return el("div", { class: "sheet-meta" }, rows);
  }

  function statusChip(status) {
    if (status === "In Hand") return "patina";
    if (status === "Ordered") return "amber";
    if (status === "To Buy" || status === "B3 Option") return "rose";
    return "";
  }

  // Any card name, anywhere, opens the popup.
  function cardLink(name, extra) {
    return el("button", {
      class: "cardlink" + (extra ? " " + extra : ""), type: "button", title: name,
      onclick: function (e) { e.preventDefault(); e.stopPropagation(); openCard(name); }
    }, name);
  }

  /* --------------------------------------------------------- shared parts */

  /* Commander art, straight from Scryfall's named endpoint. It is the fastest
     way to tell six decks apart, and it is the one thing here that needs the
     network — so a failed load removes the strip instead of leaving a gap. */
  function art(name, cls) {
    var img = el("img", { alt: "", loading: "lazy", src:
      "https://api.scryfall.com/cards/named?format=image&version=art_crop&exact="
      + encodeURIComponent(name) });
    var band = el("div", { class: cls, "aria-hidden": "true" }, img);
    img.addEventListener("error", function () { band.remove(); });
    return band;
  }

  function pips(colors) {
    return el("div", { class: "pips", title: colors.join("") || "Colorless" },
      (colors.length ? colors : ["C"]).map(function (c) {
        return el("span", { class: "pip " + c });
      }));
  }

  function readyBar(stats) {
    var box = stats.tally.box, coming = stats.tally.order + stats.tally.hand;
    // The bar is a percentage of the deck's own target, not of a hundred: an
    // added deck of 97 cards is full at 97, not 97% of the way there forever.
    var pct = function (n) { return Math.round(n / (stats.total || 100) * 100); };
    return el("div", { class: "ready" }, [
      el("div", { class: "ready-bar" }, [
        el("i", { class: "have", style: "width:" + pct(box) + "%" }),
        el("i", { class: "order", style: "width:" + pct(coming) + "%" })
      ]),
      el("span", { class: "ready-label" }, [
        el("b", { text: box + "/" + stats.total }), " boxed"
      ])
    ]);
  }

  /* ----------------------------------------------------------- add a deck */

  /* Three things the import panel needs and this page does not otherwise load:
     the app's own card names to match a paste against, a Scryfall client for
     everything that does not match, and the simulation's config. Each is fetched
     once, on the first import, and never on a page that only reads decks. */

  var simContext = null, scryfall = null;

  function localCards() {
    // The workbook's own catalog is already in memory, and its 648 names are
    // the ones most likely to overlap a deck built from the same card pool.
    return Promise.resolve((MASTER.cards || []).map(function (c) {
      return { name: c.name, type: c.type, typeLine: c.type, mv: c.mv,
               price: c.price, colorIdentity: c.color, ci: c.color };
    }));
  }

  /* The app's own catalog carries no rules text, and the engine reads rules text.
     So a card that matched locally is still looked up: matching tells us the name
     is real, Scryfall tells us what the card does. */
  function lookupCards(names) {
    if (!window.MtgScryfall) return Promise.resolve({});
    if (!scryfall) scryfall = window.MtgScryfall.createClient();
    return scryfall.collection(names).then(function (result) {
      var out = {};
      result.cards.forEach(function (card) { out[card.name] = card; });
      return out;
    });
  }

  /* THE NAMES THAT DID NOT MATCH, and what they might have meant.
     card-resolve.js owns the ladder; this hands it the two things it cannot get for
     itself -- a Scryfall client, and the list of every Commander-legal card name, which
     is the rung that catches a plain typo without a request at all. The registry is
     fetched once, lazily: it is 1.6 MB and most imports never need it. */
  var UNIVERSE_NAMES = null;
  function localCardNames() {
    if (UNIVERSE_NAMES) return Promise.resolve(UNIVERSE_NAMES);
    return fetchJson("data/commander-universe.json?v=1")
      .then(function (file) {
        UNIVERSE_NAMES = (file.cards || []).map(function (row) { return row[0]; });
        return UNIVERSE_NAMES;
      })
      .catch(function () { UNIVERSE_NAMES = []; return UNIVERSE_NAMES; });
  }
  function resolveNames(names, options) {
    var Resolve = window.MtgCardResolve;
    if (!Resolve || !window.MtgScryfall) {
      return Promise.reject(new Error("The card lookup did not load."));
    }
    if (!scryfall) scryfall = window.MtgScryfall.createClient();
    return localCardNames().then(function (localNames) {
      return Resolve.resolveNames(names, scryfall,
        Object.assign({localNames: localNames}, options || {}));
    });
  }

  /* A LINK IS AN ANSWER TOO. card-link.js does the reading; this hands it a Scryfall
     client and the name the reader was being asked about, so a link that says nothing
     about the card's name still produces a card called the right thing. */
  function resolveLink(url, options) {
    var Link = window.MtgCardLink;
    if (!Link || !window.MtgScryfall) {
      return Promise.reject(new Error("The card lookup did not load."));
    }
    if (!scryfall) scryfall = window.MtgScryfall.createClient();
    return Link.resolveLink(url, scryfall, options || {});
  }

  /* The population of cards Scryfall could not place, and the standing offer to ask again.
     Runs once on load, costs one request for all of them, and says nothing at all when
     there is nothing to say -- which is the normal case. */
  function rememberManualCard(card) {
    var Manual = window.MtgManualCards;
    if (Manual) Manual.add(window.localStorage, card);
  }

  function recheckManualCards() {
    var Manual = window.MtgManualCards;
    if (!Manual || !window.MtgScryfall || !Store) return;
    var pending = Manual.read(window.localStorage);
    if (!pending.length) return;
    if (!scryfall) scryfall = window.MtgScryfall.createClient();
    Manual.recheck(pending, scryfall).then(function (result) {
      if (!result.found.length) return;
      Manual.write(window.localStorage, result.still);
      var promoted = Manual.promote(IMPORTS, result.found);
      if (!promoted.changed) return;
      IMPORTS = promoted.records;
      saveImports();
      rebuild();
      render();
      toast(result.found.length === 1
        ? "Scryfall now has " + result.found[0].name + ". It counts as a real card."
        : "Scryfall now has " + result.found.length + " of the cards you added by link.");
    }).catch(function () { /* offline is not a failure worth reporting here */ });
  }

  function measureContext() {
    if (simContext) return Promise.resolve(simContext);
    return Promise.all([
      fetchJson("sim/config.json?v=1"),
      fetchJson("sim/opponents.json?v=1")
    ]).then(function (parts) {
      simContext = {
        config: parts[0],
        seats: window.MtgDeckMeasure.buildSeats(parts[1], parts[0].table)
      };
      return simContext;
    }).catch(function () { return null; });
  }

  function openImport() {
    var missing = ["MtgDeckImport", "MtgDeckSources", "MtgDeckStore", "MtgDeckMeasure",
      "MtgImportPanel", "MtgSimEngine", "MtgCardResolve", "MtgCardLink",
      "MtgManualCards"].filter(function (name) { return !window[name]; });
    if (missing.length) return toast("The import tools did not load (" + missing[0] + ").");

    window.MtgImportPanel.createPanel({
      existing: function () { return IMPORTS; },
      localCards: localCards,
      lookupCards: lookupCards,
      resolveNames: resolveNames,
      resolveLink: resolveLink,
      onManualCard: rememberManualCard,
      measureContext: measureContext,
      onSaved: function (record) {
        IMPORTS = Store.add(IMPORTS, record);
        saveImports();
        rebuild();
        toast(record.measured
          ? record.label + " added and measured at " + record.measured.score.toFixed(2) + "."
          : record.label + " added.");
        go("#/deck/" + record.id);
      }
    }).open();
  }

  /* Building one from nothing.
     The generator's own front door -- the Choose tab -- was retired when the app
     went to four tabs, and it has been unreachable ever since. This is its new
     one, beside Add a deck rather than on a tab of its own, because "I have a
     deck" and "I want one" are the same errand from where the reader sits. */
  function openBuild() {
    var missing = ["MtgDeckGenerator", "MtgDeckBuild", "MtgDeckStore", "MtgDeckMeasure",
      "MtgBuildPanel", "MtgScryfall", "MtgSimEngine"].filter(function (name) { return !window[name]; });
    if (missing.length) return toast("The deck builder did not load (" + missing[0] + ").");

    window.MtgBuildPanel.createPanel({
      existing: function () { return IMPORTS; },
      measureContext: measureContext,
      onSaved: function (record) {
        IMPORTS = Store.add(IMPORTS, record);
        saveImports();
        rebuild();
        toast(record.measured
          ? record.label + " built and measured at " + record.measured.score.toFixed(2) + "."
          : record.label + " built.");
        go("#/deck/" + record.id);
      }
    }).open();
  }

  /* Measuring a deck that was saved without a score.
     The panel's preview is deliberately not recorded -- one seed and 2,000 games
     is a tenth of a point out, which is the size of the gaps between these decks
     -- so a deck saved after only a preview arrives here unscored, and this is
     how it gets a real number without being imported again. */
  function measureDeck(deck, button) {
    var record = IMPORTS.filter(function (r) { return r.id === deck.id; })[0];
    if (!record || !window.MtgDeckMeasure) return;
    if (!Store.measurable(record)) {
      return toast("A score needs a hundred cards and a commander. This deck has "
        + record.total + ".");
    }
    button.disabled = true;
    button.textContent = "Measuring…";
    measureContext().then(function (context) {
      if (!context) { button.disabled = false; button.textContent = "Measure it";
        return toast("The simulation could not be loaded."); }
      var cards = window.MtgDeckMeasure.hydrate(Store.toLineup(record), null);
      // One frame, so the disabled button paints before the engine takes the
      // thread for three and a half seconds.
      setTimeout(function () {
        var before = record.measured || null;
        var result = window.MtgDeckMeasure.measure(cards, {
          config: context.config, seats: context.seats,
          onSeed: function (done, total) { button.textContent = "Seed " + done + " of " + total; }
        });
        /* A FIRST RUN IS A RESULT. A SECOND RUN IS A COMPARISON. Overwriting a number
           somebody changed cards to move, without first saying which way it moved, throws
           away the only thing the re-run was for. */
        if (before) return showRerun(record, before, result);
        record.measured = result;
        saveImports();
        rebuild();
        toast(record.label + " scores " + result.score.toFixed(2) + ".");
        render();
      }, 30);
    });
  }

  /* HOW YOU PLAY IT -- the other question the engine can answer.
     -----------------------------------------------------------
     The header score is a deck and a pilot multiplied together, and until now there
     was one pilot, so it could not be factored. This runs the same hundred under two
     ways of playing and then once more per decision with that decision handed back,
     so the sentence it produces -- "you can play this deck competitively by attacking
     whoever is closest to winning" -- names a decision that was measured on THIS deck
     rather than one that sounds plausible.

     Held in memory only, keyed by the hundred's own hash. It is a reading of the deck,
     not a fact about it: nothing is written to the record, nothing reaches localStorage,
     and a cleared session has nothing of it left to clear. Re-running costs seconds. */
  var PILOT_LENS = {};

  function pilotLens(deck, button) {
    if (!window.MtgDeckMeasure || !window.MtgPilotPolicy || !window.MtgMeasureReport) {
      return toast("The pilot lens did not load.");
    }
    var lineup = deck.imported
      ? (function () {
          var record = IMPORTS.filter(function (r) { return r.id === deck.id; })[0];
          return record ? Store.toLineup(record) : null;
        }())
      : deckCards(deck).map(function (row) {
          return {
            name: row.card.name, quantity: row.qty,
            isCommander: row.card.purpose === "Commander" || row.card.name === deck.commander
          };
        });
    if (!lineup || !lineup.length) return toast("This deck has no list to read.");

    /* card-facts.json is 403 KB and is not fetched until the first card popup, so
       FACTS is null on a page nobody has clicked a card on. Reading it directly
       measured a hundred cards with no type line and no mana cost: every deck came
       back 28.5, both pilots identical, and the panel rendered it without complaint.
       Load it first, and let measureLens refuse the run if it still arrives empty. */
    var label = button.textContent;
    button.disabled = true;
    button.textContent = "Reading…";
    Promise.all([loadFacts(), measureContext()]).then(function (parts) {
      var facts = parts[0], context = parts[1];
      var cards = window.MtgDeckMeasure.hydrate(lineup, facts);
      var hash = window.MtgDeckMeasure.lineupHash(cards);
      if (PILOT_LENS[hash]) {
        button.disabled = false; button.textContent = label;
        return showPilotLens(deck, PILOT_LENS[hash]);
      }
      if (!context) { button.disabled = false; button.textContent = label;
        return toast("The simulation could not be loaded."); }
      // One frame, so the disabled button paints before the engine takes the thread.
      setTimeout(function () {
        var lens;
        try {
          lens = window.MtgDeckMeasure.measureLens(cards, {
            config: context.config, seats: context.seats,
            deckName: String(deck.label || "").split(" ")[0],
            onRun: function (index, total) { button.textContent = "Run " + (index + 1) + " of " + total; }
          });
        } catch (error) {
          return toast(String(error && error.message || "The pilot lens could not run."));
        } finally {
          button.disabled = false;
          button.textContent = label;
        }
        PILOT_LENS[hash] = lens;
        showPilotLens(deck, lens);
      }, 30);
    });
  }

  function showPilotLens(deck, lens) {
    var wrap = el("div", { class: "mr-sheet" });
    wrap.appendChild(el("h2", { class: "mr-title", text: "How you play it" }));
    wrap.appendChild(el("p", { class: "mr-sub", text: deck.label
      + " — the same hundred cards, played two ways, on the same seeds." }));
    var box = el("div");
    box.innerHTML = window.MtgMeasureReport.pilotHtml(lens);
    wrap.appendChild(box);
    openSheet("How you play it", [wrap]);
  }

  /* WHAT THE RE-RUN DID, before it is allowed to replace anything.
     ---------------------------------------------------------------
     You change three cards and press it again; the only question that matters is whether
     the deck got better, and by more than the noise. So both numbers are shown, the parts
     that moved are named, and the reader decides which measurement the deck keeps. */
  function showRerun(record, before, after) {
    var Report = window.MtgMeasureReport;
    var diff = Report && Report.compare(after, before);
    var wrap = el("div", { class: "mr-sheet" });
    wrap.appendChild(el("h2", { class: "mr-title", text: "You ran it again" }));
    wrap.appendChild(el("p", { class: "mr-sub",
      text: record.label + " — " + (after.games ? after.games.toLocaleString("en-US") + " games, "
        + Report.took(after.elapsedMs) : "measured again") }));
    var box = el("div");
    box.innerHTML = (diff ? Report.compareHtml(diff) : "") + Report.html(after, {compact: true});
    wrap.appendChild(box);
    var acts = el("div", { class: "mr-acts" }, [
      el("button", { class: "btn ghost", type: "button", text: "Keep the old score",
        onclick: function () {
          closeCard();
          toast("Kept the earlier measurement of " + before.score.toFixed(2) + ".");
        } }),
      el("button", { class: "btn primary", type: "button", text: "Use the new score",
        onclick: function () {
          record.measured = after;
          saveImports();
          rebuild();
          closeCard();
          toast(record.label + " now scores " + after.score.toFixed(2) + ".");
          render();
        } })
    ]);
    wrap.appendChild(acts);
    openSheet("How the new run compares", [wrap], {mustAnswer: true});
  }

  /* Taking one back out. The master was never written to, so this is a filter
     and a rebuild rather than a reload. */
  function removeImport(deck) {
    if (!window.confirm("Remove " + deck.label + "? The six decks are not affected.")) return;
    IMPORTS = Store.remove(IMPORTS, deck.id);
    saveImports();
    rebuild();
    toast(deck.label + " removed.");
    go("#/decks");
  }

  /* The small control in the corner of a deck card.
     ------------------------------------------------
     Two actions, and they are not the same act. ARCHIVE puts a deck down: it comes off
     the list and out of the arithmetic, and one click brings it back. DELETE destroys the
     record, and is offered only for a deck added on this device -- the six live in the
     repository, so there is nothing local to delete and a button claiming otherwise would
     be lying about what it does.

     Opened by its own button rather than on hover, because hover does not exist on the
     device this page is mostly read on. */
  var openMenuFor = null;

  function closeDeckMenus() {
    openMenuFor = null;
    Array.prototype.forEach.call(document.querySelectorAll(".deck-menu-pop"), function (n) {
      n.hidden = true;
    });
    Array.prototype.forEach.call(document.querySelectorAll(".deck-menu-b"), function (n) {
      n.setAttribute("aria-expanded", "false");
    });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".deck-menu")) closeDeckMenus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openMenuFor) closeDeckMenus();
  });

  function deckMenu(deck) {
    var pop = el("div", { class: "deck-menu-pop", role: "menu", hidden: true });
    var item = function (label, hint, run) {
      return el("button", { class: "deck-menu-i", type: "button", role: "menuitem",
        onclick: function () { closeDeckMenus(); run(); } }, [
        el("b", { text: label }),
        el("span", { text: hint })
      ]);
    };
    pop.appendChild(item("Archive", "Off this list and out of the buy list. Nothing is deleted.",
      function () {
        setArchived(deck.id, true);
        toast(deck.label + " archived \u2014 it is in the drawer at the bottom.");
      }));
    if (deck.imported) {
      pop.appendChild(item("Delete", "Destroys the deck you added. The six are not affected.",
        function () { removeImport(deck); }));
    } else {
      pop.appendChild(el("p", { class: "deck-menu-note",
        text: "This one ships with the app, so there is nothing here to delete \u2014 "
          + "archiving is how it goes away." }));
    }

    var button = el("button", {
      class: "deck-menu-b", type: "button", "aria-haspopup": "menu", "aria-expanded": "false",
      "aria-label": "More for " + deck.label, title: "More for " + deck.label,
      onclick: function (e) {
        var opening = pop.hidden;
        closeDeckMenus();
        if (!opening) return;
        pop.hidden = false;
        openMenuFor = deck.id;
        e.currentTarget.setAttribute("aria-expanded", "true");
      }
    }, ["\u22ef"]);
    return el("div", { class: "deck-menu" }, [button, pop]);
  }

  /* --------------------------------------------------------------- decks  */

  function renderDecks(root) {
    var decks = orderedDecks();

    /* THE THREE DOORS, ABOVE THE DECKS RATHER THAN AFTER THEM.
     *
     * Add and Build used to sit at the end of the grid, on the reasoning that they are
     * what you reach for after looking at what is already there. That holds at six decks
     * and stops holding at sixteen: the tiles end up a screen and a half down, behind
     * every deck you were not looking for, and the two things somebody arrives wanting to
     * do are the two hardest to find.
     *
     * Explore cards joins them because it is the same kind of thing -- a way in, not a
     * deck -- and because the card graph had no route from here except the small link in
     * the bar and one in the footer. */
    var start = el("div", { class: "start-grid" });
    start.appendChild(el("button", { class: "start-tile deck-add", type: "button",
      onclick: openImport }, [
      el("span", { class: "plus", "aria-hidden": "true", text: "+" }),
      el("b", { text: "Add a deck" }),
      el("span", { text: "Paste a list from Moxfield or anywhere else, or give an "
        + "Archidekt link. It is scored on the same simulation as the rest." })
    ]));
    start.appendChild(el("button", { class: "start-tile deck-add is-build", type: "button",
      onclick: openBuild }, [
      el("span", { class: "plus", "aria-hidden": "true", text: "\u2726" }),
      el("b", { text: "Build one" }),
      el("span", { text: "Name a commander and a theme. It is built from live "
        + "Scryfall data into a legal hundred, at three prices." })
    ]));
    /* A link, not a button: it goes to another page, and a person who wants it in a new
       tab should be able to have one. */
    start.appendChild(el("a", { class: "start-tile is-explore", href: "graph.html" }, [
      el("span", { class: "plus", "aria-hidden": "true", text: "\u25c9" }),
      el("b", { text: "Explore cards" }),
      el("span", { text: "Every Commander-legal card, what connects them, and a Copilot "
        + "that says which are worth a look." })
    ]));
    root.appendChild(start);

    var added = decks.filter(function (d) { return d.imported; }).length;
    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: "My Decks" }),
      el("p", { text: !decks.length
        ? "Nothing here yet. The three doors above are how it fills."
        : (added ? decks.length + " decks. " : "")
          + (RATINGS
            ? "Ranked by simulated score. Tap a deck for how to play it and what is still missing."
            : "Tap a deck for how to play it, the full hundred, and what is still missing.") })
    ]));

    /* Directly under the heading and above the decks: "why should I believe this number"
       is asked the moment the first score is seen, not at the foot of the page. */
    var method = scorePanel();
    if (method) root.appendChild(method);

    var grid = el("div", { class: "deck-grid" });
    /* Every deck archived is a reachable state, and an empty grid with a drawer under it
       reads as the app having lost them. The drawer below says how many and offers them
       back; this says the list is empty on purpose. */
    if (!decks.length) {
      if (archivedDecks().length) {
        grid.appendChild(el("p", { class: "empty-note",
          text: "Every deck is archived. They are in the drawer below, one click from coming back." }));
      } else {
        /* The state a cleared session lands in. Three doors are already above this, so
           this is the fourth -- the one that fills the page with the decks kept in the
           repository -- plus a sentence saying that is what the other three are for. */
        grid.appendChild(el("div", { class: "panel empty-note" }, [
          el("h3", { text: "No decks yet" }),
          el("p", { class: "play-line", text: "Nothing is saved in this browser. Add a deck from a "
            + "list you already have, build one from a commander and a theme, or load the six "
            + "decks kept in this repository and start from those." }),
          el("button", { class: "btn primary", type: "button", text: "Load default",
            onclick: loadDefault })
        ]));
      }
    }
    decks.forEach(function (deck) {
      var stats = deckStats(deck), guide = guideFor(deck.id), rating = ratingFor(deck.id);
      var meta = [];
      if (rating && rating.builds && rating.builds.v1) {
        meta.push(el("span", { class: "chip patina",
          text: "Score " + rating.builds.v1.score.toFixed(1) }));
        if (rating.builds.v1.bracket) {
          meta.push(el("span", { class: "chip", text: rating.builds.v1.bracket.label }));
        }
      }
      if (guide && guide.difficulty) {
        meta.push(el("span", { class: "chip", text: guide.difficulty.tier }));
      }
      if (deck.b3.length) {
        meta.push(el("span", { class: "chip amber", text: deck.b3.length + " B3 upgrades" }));
      }
      if (stats.tally.buy) {
        meta.push(el("span", { class: "chip rose", text: stats.tally.buy + " to buy" }));
      }
      if (deck.imported) {
        meta.push(el("span", { class: "chip", title: "Added on this device from "
          + (deck.source === "paste" ? "a pasted list" : deck.source),
          text: deck.measured ? "Added deck" : "Added · not scored" }));
      }

      /* The card stays one big button -- it has one job, which is to open the deck -- and
         the menu is its SIBLING rather than a button inside a button, which is invalid
         markup and a hit target nobody can predict. The slot exists to position it. */
      var slot = el("div", { class: "deck-slot" });
      slot.appendChild(deckMenu(deck));
      slot.appendChild(el("button", {
        class: "deck-card", type: "button",
        onclick: function () { go("#/deck/" + deck.id); }
      }, [
        art(deck.commander, "card-art"),
        el("div", { class: "deck-card-top" }, [
          el("span", { class: "rank-badge" + (deck._rank === 1 ? " is-top" : ""), title:
            RATINGS ? "Rank by simulated score" : "Rank by how close it is to complete" }, [
            el("small", { text: "RANK" }), String(deck._rank)
          ]),
          el("div", { class: "deck-name" }, [
            el("h3", { text: (guide && guide.nickname) || deck.label }),
            el("div", { class: "commander", text: deck.commander })
          ]),
          pips(colorsOf(deck))
        ]),
        el("p", { class: "hook", text: (guide && guide.hook) ||
          (deck.imported ? addedHook(deck)
            : deck.label + " — " + plural(stats.tally.box, "card") + " of the hundred already boxed.") }),
        el("div", { class: "meta-row" }, meta),
        readyBar(stats)
      ]));
      grid.appendChild(slot);
    });

    root.appendChild(grid);

    /* WHAT YOU PUT DOWN, AND HOW TO PICK IT BACK UP.
     *
     * Closed, and headed by the count. An archived deck is not gone and the page has to
     * keep saying so, or the first reaction to a missing deck is that the app lost it --
     * and the second is to add it again. */
    var away = archivedDecks();
    if (away.length) {
      var drawer = el("details", { class: "panel archive-drawer", style: "margin-top:18px" });
      drawer.appendChild(el("summary", { text: away.length +
        (away.length === 1 ? " archived deck" : " archived decks") +
        " \u00b7 off the list above and out of the buy list, not deleted" }));
      var rows = el("div", { class: "archive-rows" });
      away.forEach(function (deck) {
        rows.appendChild(el("div", { class: "archive-row" }, [
          el("div", {}, [
            el("b", { text: deck.label }),
            el("span", { class: "archive-sub", text: deck.commander +
              (deck.imported ? " \u00b7 added on this device" : "") })
          ]),
          el("button", { class: "btn", type: "button", text: "Put it back",
            onclick: function () { setArchived(deck.id, false); toast(deck.label + " is back in the list."); } }),
          deck.imported ? el("button", { class: "btn ghost", type: "button", text: "Delete",
            onclick: function () { removeImport(deck); } }) : null
        ]));
      });
      drawer.appendChild(rows);
      root.appendChild(drawer);
    }
  }

  /* ------------------------------------------------- how the score is made ----
   *
   * WHO THIS IS FOR. Somebody who has played Commander for years and has been handed a
   * number by a piece of software before. They do not want reassurance, they want the
   * method -- how many games, against what, weighted how, and what counts as a real
   * difference -- and they want to know what it does NOT model, because a tool that
   * claims to model everything is a tool that has not been checked.
   *
   * So the panel says the sample size first, the opponents second, the weights third,
   * the significance rule fourth, and the limits last, in that order and in one screen.
   * Every figure is read out of data/deck-ratings.json and sim/opponents.json rather
   * than typed here: a re-run that changes the sample changes this paragraph.
   *
   * It sits under the heading rather than at the foot of the page, because the question
   * "why should I believe this number" is asked when the number is first seen.
   */
  var SCORE_WEIGHTS = [
    ["35%", "win rate"], ["15%", "mana screw"], ["10%", "flood"],
    ["10%", "commander reliability"], ["10%", "interaction in hand"],
    ["10%", "clock"], ["5%", "dead cards"], ["5%", "own fun"]
  ];
  function scorePanel() {
    if (!RATINGS || !RATINGS.method) return null;
    // Nothing has been scored yet, so there is no number to explain.
    if (!DATA.decks.length) return null;
    var seeds = (RATINGS.seeds || []).length;
    var per = Number(RATINGS.gamesPerSeed) || 0;
    var total = seeds * per;
    var games = total ? total.toLocaleString() : null;

    var open = el("details", { class: "panel score-method" }, [
      el("summary", {}, [
        el("b", { text: "How the score is measured" }),
        el("span", { text: games
          ? games + " simulated games per list · " + seeds + " independent seeds · a nine-archetype pod"
          : "the method, the sample and the limits" })
      ]),
      el("div", { class: "score-method-body" }, [
        el("p", { class: "play-line", text:
          "Every hundred is played out"
          + (games ? " " + games + " times — " + per.toLocaleString() + " games on each of "
              + seeds + " independent seeds" : "")
          + ", one deck at a time in a four-player pod. The other three seats are drawn from "
          + "nine written opponent profiles — starter precon, upgraded casual, tuned Bracket 3, "
          + "combo, stax, aristocrats, voltron, tokens and group hug — so a deck is measured "
          + "against a spread of what it will actually sit down against rather than one "
          + "gauntlet it can be tuned to beat. The six decks never play each other." }),
        el("p", { class: "play-line", text:
          "Score is a 0–100 composite of how the games went, not a win percentage:" }),
        el("ul", { class: "score-weights" }, SCORE_WEIGHTS.map(function (w) {
          return el("li", {}, [el("b", { text: w[0] }), " " + w[1]]);
        })),
        el("p", { class: "play-line", text:
          "Two builds count as different only when the gap between them is larger than twice "
          + "their combined seed-to-seed standard error. Anything smaller is printed as it fell "
          + "and should be read as a tie — which is why a more expensive build sometimes scores "
          + "no better here, and why this says so instead of rounding it away." }),
        el("p", { class: "play-line score-limits", text:
          "What it does not model: politics, threat assessment, and the table talking you out "
          + "of an attack. Opponents play their archetype, not the room. Treat the score as a "
          + "measure of how the deck functions — mana, curve, commander, interaction, clock — "
          + "and not as a prediction of any particular game night." }),
        el("p", { class: "play-line score-src", text: RATINGS.method })
      ])
    ]);
    return open;
  }

  /* -------------------------------------------------------- deck detail  */

  function statBlock(items, deck) {
    var cells = items.map(function (it) {
      return el("div", { class: "stat" }, [
        el("div", { class: "k", text: it.k }),
        el("div", { class: "v num", text: it.v }),
        it.n ? el("div", { class: "n", text: it.n }) : null
      ]);
    });
    // The strip lays out on a fixed column count, so an odd number of stats
    // leaves a hole. The commander belongs in it: it is the one card every
    // reader wants to look at first, and it opens like any other.
    if (deck) {
      var thumb = el("img", { alt: deck.commander, loading: "lazy", src:
        "https://api.scryfall.com/cards/named?format=image&version=small&exact="
        + encodeURIComponent(deck.commander) });
      var cell = el("button", {
        class: "stat stat-commander", type: "button",
        title: "Show " + deck.commander, "aria-label": "Show " + deck.commander,
        onclick: function () { openCard(deck.commander); }
      }, [thumb]);
      // 44px of card is 61px tall, which is the whole cell: a label beside it
      // overflowed the 74px of content and got clipped to "COMM". The art says
      // "commander" on its own, and the button keeps the accessible name. If the
      // art never arrives, the word comes back in its place.
      thumb.addEventListener("error", function () {
        thumb.remove();
        cell.appendChild(el("span", { class: "k", text: "Commander" }));
      });
      cells.push(cell);
    }
    return el("div", { class: "stat-strip" }, cells);
  }

  function curveChart(shape) {
    var max = 1;
    Object.keys(shape.curve).forEach(function (k) { max = Math.max(max, shape.curve[k]); });
    return el("div", { class: "curve" }, Object.keys(shape.curve).map(function (k) {
      var n = shape.curve[k];
      return el("div", { class: "bar", title: n + " cards at mana value " + k }, [
        el("em", { text: n || "" }),
        el("i", { style: "height:" + Math.round((n / max) * 100) + "%" }),
        el("span", { text: k === "8" ? "8+" : k })
      ]);
    }));
  }

  function cardList(deck) {
    var stats = deckStats(deck), wrap = el("div", { class: "groups" });
    var used = {};
    GROUPS.forEach(function (g) {
      var name = g[0], test = g[1];
      var rows = stats.rows.filter(function (r) {
        if (used[r.card.name]) return false;
        if (test(r.card, deck)) { used[r.card.name] = true; return true; }
        return false;
      });
      if (!rows.length) return;
      rows.sort(function (a, b) { return a.card.name.localeCompare(b.card.name); });
      var count = rows.reduce(function (n, r) { return n + r.qty; }, 0);
      wrap.appendChild(el("div", { class: "group" }, [
        el("h4", {}, [el("span", { text: name }), el("span", { class: "num", text: String(count) })]),
        el("div", {}, rows.map(function (r) {
          return el("div", { class: "card-row", title: SLOT_LABEL[r.state] }, [
            el("span", { class: "dot " + r.state }),
            el("span", { class: "cname" }, [
              cardLink(r.card.name),
              r.card.purpose ? el("span", { class: "sub", text: r.card.purpose }) : null
            ]),
            el("span", { class: "qty", text: r.qty > 1 ? "x" + r.qty : "" }),
            el("span", { class: "price num", text: r.card.price ? money(r.card.price) : "" })
          ]);
        }))
      ]));
    });
    return wrap;
  }

  function swapRows(list, opts) {
    return list.map(function (s) {
      return el("div", { class: "swap" + (s.replaces ? "" : " no-out") }, [
        el("div", { class: "in" }, [
          cardLink(s.add),
          s.gameChanger ? el("span", { class: "chip amber", text: "Game Changer" }) : null,
          el("span", { class: "price num", text: s.price ? money(s.price) : "" })
        ]),
        el("div", { class: "arrow", text: "→" }),
        el("div", { class: "out" }, s.replaces ? ["out: ", cardLink(s.replaces)] : []),
        opts && opts.why && s.why ? el("div", { class: "why", text: s.why }) : null
      ]);
    });
  }

  /* What the optimizer would change, and what it costs. Shown as a
     recommendation rather than folded into the hundred above, because he has
     not made these swaps -- the deck list stays what the workbook says it is. */
  function swapPanel(plan) {
    var free = plan.swaps.filter(function (s) { return s.free; });
    var paid = plan.swaps.filter(function (s) { return !s.free; });
    var tier = plan.tiers["$15"] || plan.tiers["$0"];
    var before = plan.before;

    function row(s) {
      return el("div", { class: "swap" + (s.out ? "" : " no-out") }, [
        el("div", { class: "in" }, [
          cardLink(s["in"]),
          s.free ? el("span", { class: "chip patina", text: "free" })
                 : el("span", { class: "price num", text: money(s.price) })
        ]),
        el("div", { class: "arrow", text: "\u2192" }),
        el("div", { class: "out" }, ["out: ", cardLink(s.out)]),
        el("div", { class: "why", text: s.reason })
      ]);
    }

    var delta = tier.terms.performance - before.performance;
    var winBefore = before.winRate * 100, winAfter = tier.terms.winRate * 100;
    return el("div", { class: "panel" }, [
      el("h3", {}, [el("span", { text: "Recommended changes" }),
        el("span", { class: "tally", text: plural(plan.swaps.length, "swap") + " · "
          + money(tier.spend) + " · " + plural(free.length, "free card") + " off the bench" })]),
      el("div", { class: "meta-row", style: "margin:-2px 0 10px" }, [
        el("span", { class: "chip patina",
          text: (delta >= 0 ? "+" : "") + delta.toFixed(2) + " performance" }),
        el("span", { class: "chip" + (winAfter < 60 ? "" : " rose"),
          text: "win " + winBefore.toFixed(1) + "% \u2192 " + winAfter.toFixed(1) + "%" }),
        el("span", { class: "chip",
          text: "decisions " + before.decisionDensity + " \u2192 " + tier.terms.decisionDensity })
      ]),
      plan.dropped || plan.reseated ? el("p", { class: "caveat", text:
        "Measured on the list as it stood before the 2026-09-05 rebuild"
        + (plan.reseated ? ", when " + plan.reseated + " held the seat" : "")
        + ". " + (plan.dropped
          ? plural(plan.dropped, "recommendation") + " dropped: the card it would cut has already left the deck."
          : "Every recommendation still names a card in the deck.") }) : null,
      free.length ? el("h4", { class: "swap-head", text: "Free, off the bench" }) : null,
      el("div", {}, free.map(row)),
      paid.length ? el("h4", { class: "swap-head",
        text: "Worth buying \u2014 " + money(paid.reduce(function (n, s) { return n + s.price; }, 0)) }) : null,
      el("div", {}, paid.map(row))
    ]);
  }

  function renderDeck(root, deck) {
    var stats = deckStats(deck), shape = deckShape(deck);
    var guide = guideFor(deck.id), rating = ratingFor(deck.id);
    var extra = placeholders(deck);

    root.appendChild(el("button", { class: "deck-back", type: "button",
      onclick: function () { go("#/decks"); } }, "← All decks"));

    /* An added deck says where it came from and offers both ways out. The six say where
       they came from too -- the repository -- which is why one of those ways is missing
       for them and the other is not. */
    if (deck.imported) {
      var gen = deck.generated;
      root.appendChild(el("div", { class: "imp-banner" }, [
        el("span", {}, [
          el("b", { text: gen ? "Built here" : "Added deck" }), " · ",
          /* A generated deck's provenance is the interesting kind: which rung of
             which lens, and what it was aimed at. A pasted one only has where the
             text came from. */
          gen
            ? [gen.rungLabel, gen.lensLabel].filter(Boolean).join(" · ").toLowerCase()
              + (gen.inputs && gen.inputs.budgetUsd ? " · $" + Math.round(gen.inputs.budgetUsd) + " target" : "")
            : deck.source === "paste" ? "pasted list" : "from " + deck.source,
          deck.sourceUrl ? el("a", { href: deck.sourceUrl, target: "_blank",
            rel: "noopener", text: " open it there ↗" }) : null,
          deck.measured ? "" : " · not scored yet"
        ]),
        el("div", { class: "imp-banner-acts" }, [
          deck.measured ? null : el("button", { class: "btn", type: "button",
            text: "Measure it",
            onclick: function (e) { measureDeck(deck, e.currentTarget); } }),
          el("button", { class: "btn", type: "button",
            onclick: function () {
              setArchived(deck.id, true);
              toast(deck.label + " archived \u2014 it is in the drawer at the bottom of My Decks.");
              go("#/decks");
            }, text: "Archive" }),
          el("button", { class: "btn ghost", type: "button",
            onclick: function () { removeImport(deck); }, text: "Delete" })
        ])
      ]));
    }
    /* The six can be put down too. A control that exists on fifteen deck cards and not
       on the sixteenth reads as a bug, and "I am not playing Atraxa this year" is the
       same sentence whichever deck it is about. Delete is the one that genuinely does
       not apply: these live in the repository, so there is nothing local to destroy. */
    if (!deck.imported) {
      root.appendChild(el("div", { class: "imp-banner" }, [
        el("span", { text: "Ships with the app, so there is nothing local to delete." }),
        el("div", { class: "imp-banner-acts" }, [
        el("button", { class: "btn", type: "button", text: "Archive",
          onclick: function () {
            setArchived(deck.id, true);
            toast(deck.label + " archived \u2014 it is in the drawer at the bottom of My Decks.");
            go("#/decks");
          } })
        ])
      ]));
    }

    var stats1 = [
      { k: "Boxed", v: stats.tally.box + "/" + stats.total,
        n: stats.tally.box === stats.total ? "ready to play" : "of the plan" },
      { k: "Lands", v: String(shape.lands) },
      { k: "Avg cost", v: shape.avgMv.toFixed(2), n: "mana value" }
    ];
    if (rating && rating.builds && rating.builds.v1) {
      // The ratings file's own rank is over the six it was generated for; once a
      // deck has been added, the only rank that describes what is on screen is
      // the one computed over what is on screen.
      var place = DATA.decks.some(function (d) { return d.imported; })
        ? rankOf(deck.id)
        : (rating.rank ? rating.rank.v1 : rankOf(deck.id));
      stats1.unshift({ k: "Score", v: rating.builds.v1.score.toFixed(1),
        n: place ? "rank " + place + " of " + DATA.decks.length : "measured here" });
      if (rating.builds.v1.bracket) {
        stats1.push({ k: "Bracket", v: rating.builds.v1.bracket.label });
      }
    }
    if (stats.tally.buy) stats1.push({ k: "To buy", v: money(stats.toBuyCost), n: plural(stats.tally.buy, "card") });

    root.appendChild(art(deck.commander, "hero-art"));
    root.appendChild(el("div", { class: "detail-head" }, [
      el("div", { class: "titles" }, [
        el("h2", { text: (guide && guide.nickname) || deck.label }),
        el("div", { class: "commander", text: deck.commander +
          (guide && guide.archetype ? " · " + guide.archetype : "") }),
        el("div", { class: "meta-row", style: "margin-top:10px" }, [pips(colorsOf(deck))]),
        guide && guide.hook ? el("p", { class: "hook", text: guide.hook }) : null
      ]),
      statBlock(stats1, deck)
    ]));

    var left = el("div"), right = el("div");

    /* how to play */
    if (guide) {
      var play = el("div", { class: "panel" }, [el("h3", { text: "How to play it" })]);
      if (guide.whatItDoes) play.appendChild(el("p", { class: "play-line", text: guide.whatItDoes }));
      if (guide.turns && guide.turns.length) {
        play.appendChild(el("dl", { class: "turns" }, guide.turns.reduce(function (out, t) {
          out.push(el("div", { class: "turn" }, [
            el("dt", { text: t.when }), el("dd", { text: t.do })
          ]));
          return out;
        }, [])));
      }
      if (guide.howItWins) {
        play.appendChild(el("p", { class: "play-line", style: "margin-top:12px" }, [
          el("b", { text: "How it wins. " }), guide.howItWins
        ]));
      }
      if (guide.mulligan) {
        play.appendChild(el("p", { class: "play-line" }, [
          el("b", { text: "Keepable hand. " }), guide.mulligan
        ]));
      }
      if (guide.watchFor && guide.watchFor.length) {
        play.appendChild(el("h3", { text: "Watch for", style: "margin-top:14px" }));
        play.appendChild(el("ul", { class: "note-list" }, guide.watchFor.map(function (w) {
          return el("li", { text: w });
        })));
      }
      left.appendChild(play);

      if (guide.keyCards && guide.keyCards.length) {
        left.appendChild(el("div", { class: "panel" }, [
          el("h3", {}, [el("span", { text: "Cards that carry it" })]),
          el("div", { class: "key-cards" }, guide.keyCards.map(function (kc) {
            return el("div", { class: "key-card" }, [
              el("div", { class: "kc-name" }, cardLink(kc.name)),
              el("div", { class: "kc-why", text: kc.why })
            ]);
          }))
        ]));
      }
    } else {
      left.appendChild(el("div", { class: "panel" }, [
        el("h3", { text: "How to play it" }),
        el("p", { class: "play-line", text:
          "The written guide for this deck has not been generated yet. The card list, "
          + "the curve and the upgrade paths below are live." })
      ]));
    }

    /* shape and measured numbers */
    var shapePanel = el("div", { class: "panel" }, [
      el("h3", {}, [el("span", { text: "Shape" }),
        el("span", { class: "tally", text: shape.lands + " lands · " + shape.spells + " spells" })]),
      curveChart(shape)
    ]);
    var topRoles = Object.keys(shape.roles)
      .sort(function (a, b) { return shape.roles[b] - shape.roles[a]; })
      .filter(function (r) { return shape.roles[r] > 1; }).slice(0, 8);
    if (topRoles.length) {
      shapePanel.appendChild(el("div", { class: "meta-row", style: "margin-top:12px" },
        topRoles.map(function (r) {
          return el("span", { class: "chip plain", text: r + " " + shape.roles[r] });
        })));
    }
    if (rating && rating.builds && rating.builds.v1) {
      var m = rating.builds.v1;
      shapePanel.appendChild(el("div", { class: "meta-row", style: "margin-top:12px" }, [
        el("span", { class: "chip", text: "Mana screw " + (m.screwPct * 100).toFixed(1) + "%" }),
        el("span", { class: "chip", text: "Flood " + (m.floodPct * 100).toFixed(1) + "%" }),
        m.avgCommanderTurn ? el("span", { class: "chip",
          text: "Commander on turn " + m.avgCommanderTurn.toFixed(1) }) : null
      ]));
    }
    right.appendChild(shapePanel);

    /* HOW IT PLAYED -- the panel that says what the number on the header means.
       ----------------------------------------------------------------------
       The header shows a score and nothing else, and "51.33" against a deck somebody just
       built reads as a verdict. This is the receipt: what was run and how fast, which of
       the nine measures earned points and which lost them, and which cards carried the
       deck or sat in hand. measure-report.js renders it; the engine has been computing
       every figure in it since it was written. */
    var measured = rating && rating.builds && rating.builds.v1;
    if (measured && window.MtgMeasureReport && (measured.scoreParts || measured.perCard)) {
      var howPanel = el("div", { class: "panel" }, [
        el("h3", {}, [el("span", { text: "How it played" }),
          el("span", { class: "tally", text: measured.protocol && measured.protocol.preview
            ? "a quick preview" : "the published protocol" })])
      ]);
      var report = el("div");
      report.innerHTML = window.MtgMeasureReport.html(measured);
      howPanel.appendChild(report);
      /* Two buttons doing different things. "Run it again" REPLACES the number above,
         so only an added deck gets it -- the six ship with a measurement taken by the
         same engine on the same protocol, and re-running them here would replace a
         published number with a local one. "How you play it" replaces nothing: it is a
         second reading held in memory, so every deck can have it, and the six are the
         most interesting ones to read that way. */
      var howActs = el("div", { class: "mr-acts" });
      if (deck.imported) {
        howActs.appendChild(el("button", { class: "btn", type: "button", text: "Run it again",
          onclick: function (e) { measureDeck(deck, e.currentTarget); } }));
      }
      if (window.MtgPilotPolicy) {
        howActs.appendChild(el("button", { class: "btn", type: "button", text: "How you play it",
          onclick: function (e) { pilotLens(deck, e.currentTarget); } }));
      }
      if (howActs.childNodes.length) howPanel.appendChild(howActs);
      howPanel.appendChild(el("p", { class: "mr-note", text: deck.imported
        ? "Change cards on this page, then run it again — the new result is shown against "
          + "this one before it replaces it. \u201cHow you play it\u201d replaces nothing: "
          + "it reads the same hundred under two pilots and says which decisions are worth points."
        : "\u201cHow you play it\u201d reads this same hundred under two pilots — one playing "
          + "casually, one playing to win — and says which decisions the difference is made of." }));
      right.appendChild(howPanel);
    }

    /* upgrades */
    var adds = deck.upgrades.filter(function (u) { return u.action === "ADD"; });
    var cuts = deck.upgrades.filter(function (u) { return u.action === "CUT"; });
    if (adds.length) {
      var addCost = adds.reduce(function (n, a) {
        var c = byName(a.card);
        return n + ((c && (c.status === "In Hand" || c.status === "Ordered")) ? 0 : (a.price || 0));
      }, 0);
      right.appendChild(el("div", { class: "panel" }, [
        el("h3", {}, [el("span", { text: "Tuned upgrades" }),
          el("span", { class: "tally", text: plural(adds.length, "card") + " · " + money(addCost) + " still to buy" })]),
        // These are not a future tier: the workbook already put them in the
        // hundred above, where they read as "to buy". This panel is the reason
        // those slots are red.
        el("p", { class: "play-line", style: "margin-top:-4px;font-size:12.5px;color:var(--text-faint)",
          text: "Already part of the hundred above. Until they are bought, the slots they took show as still to buy." }),
        el("div", {}, swapRows(adds.map(function (a) {
          return { add: a.card, replaces: a.replaces, price: a.price };
        }))),
        cuts.length ? el("p", { class: "play-line", style: "margin-top:10px;font-size:12.5px;color:var(--text-faint)",
          text: "Out to the bench: " + cuts.map(function (c) { return c.card; }).join(", ") }) : null
      ]));
    }

    if (deck.b3.length) {
      var b3Cost = deck.b3.reduce(function (n, s) {
        var c = byName(s.add);
        return n + ((c && (c.status === "In Hand" || c.status === "Ordered")) ? 0 : (s.price || 0));
      }, 0);
      var verdict = null;
      if (rating && rating.delta && rating.delta.v1ToB3) {
        var d = rating.delta.v1ToB3;
        var sign = d.score >= 0 ? "+" : "";
        verdict = el("p", { class: "play-line",
          style: "margin-top:-2px;font-size:13px;color:var(--text-dim)" }, [
          el("span", { class: "chip " + (!d.significant ? "" : d.score > 0 ? "patina" : "rose"),
            text: sign + d.score.toFixed(2) + " score" }),
          " ",
          !d.significant
            ? "Too small to tell apart from noise. On the simulation, this money buys a legal Bracket 3 deck, not a stronger one."
            : d.score > 0
              ? "Measurably stronger on the simulation."
              : "Measurably weaker on the simulation. It makes the deck Bracket 3 legal, but it does not make it better."
        ]);
      }
      right.appendChild(el("div", { class: "panel" }, [
        el("h3", {}, [el("span", { text: "Bracket 3 upgrades" }),
          el("span", { class: "tally", text: plural(deck.b3.length, "swap") + " · " + money(b3Cost) })]),
        verdict,
        el("div", {}, swapRows(deck.b3, { why: true }))
      ]));
    }

    var plan = swapsFor(deck.id);
    if (plan && plan.swaps.length) right.appendChild(swapPanel(plan));

    root.appendChild(el("div", { class: "cols" }, [left, right]));

    /* the hundred */
    var listPanel = el("div", { class: "panel" }, [
      el("h3", {}, [el("span", { text: "The hundred" }),
        el("span", { class: "tally", text: stats.tally.box + " boxed · " + stats.tally.hand
          + " on the bench · " + stats.tally.order + " on order · " + stats.tally.buy + " to buy" })]),
      el("div", { class: "legend" }, [
        el("span", {}, [el("i", { class: "dot box" }), "In the box"]),
        el("span", {}, [el("i", { class: "dot hand" }), "Spare copy on the bench"]),
        el("span", {}, [el("i", { class: "dot order" }), "On order"]),
        el("span", {}, [el("i", { class: "dot buy" }), "Still to buy"])
      ]),
      cardList(deck)
    ]);
    if (extra.length) {
      listPanel.appendChild(el("p", { class: "play-line",
        style: "margin-top:6px;font-size:12.5px;color:var(--text-faint)",
        text: "Also in the box, not in the plan (" + extra.length + "): "
          + extra.map(function (c) { return c.name; }).join(", ") }));
    }
    root.appendChild(listPanel);
  }

  /* ---------------------------------------------------- bench and to-buy */

  function pickKey(row) { return row.source + "|" + row.name; }

  function togglePick(row, on) {
    var key = pickKey(row);
    if (on === undefined) on = !state.picks.has(key);
    if (on) state.picks.set(key, row); else state.picks.delete(key);
    save();
    syncTray();
    document.querySelectorAll('[data-pick="' + cssEscape(key) + '"]').forEach(function (node) {
      node.classList.toggle("is-picked", on);
      var box = node.querySelector("input");
      if (box) box.checked = on;
    });
  }

  function cssEscape(s) { return s.replace(/["\\]/g, "\\$&"); }

  /* Cards are read in a shop, off a phone. Price bands put the expensive ones first
     so they get checked against the case before the commons; the color buckets follow
     how a singles binder is sorted. Shared by the bench, the upgrades and every
     grouping either of them offers. */
  var PRICE_BANDS = [["$6 and up", 6], ["$4 to $6", 4], ["$1 to $4", 1], ["Under $1", 0]];
  var COLOR_NAME = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless", L: "Lands" };
  var COLOR_ORDER = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"];
  function priceBand(p) {
    for (var i = 0; i < PRICE_BANDS.length; i++) if ((p || 0) >= PRICE_BANDS[i][1]) return PRICE_BANDS[i][0];
    return "Under $1";
  }
  function colorGroup(row) {
    if (row.type && /Land/.test(row.type) && !/Creature/.test(row.type)) return "Lands";
    var c = row.color || "";
    if (COLOR_NAME[c]) return COLOR_NAME[c];
    return c ? "Multicolor" : "Colorless";
  }

  /* The type somebody would name a card by, out of a type line that can carry four.
     "Legendary Creature - Human Wizard" is a Creature; a Land Creature is a Land,
     because that is where it is filed in a binder and how it is shopped for. */
  var PRIMARY_TYPES = ["Land", "Creature", "Planeswalker", "Battle", "Artifact",
                       "Enchantment", "Instant", "Sorcery"];
  function primaryType(line) {
    for (var i = 0; i < PRIMARY_TYPES.length; i += 1) {
      if (String(line || "").indexOf(PRIMARY_TYPES[i]) >= 0) return PRIMARY_TYPES[i];
    }
    return "Other";
  }
  var RARITY_LABEL = {common: "Common", uncommon: "Uncommon", rare: "Rare",
                      mythic: "Mythic", special: "Special", bonus: "Bonus"};
  var RARITY_ORDER = ["Mythic", "Rare", "Uncommon", "Common", "Special", "Bonus"];
  function rarityLabel(r) { return RARITY_LABEL[r] || ""; }

  function benchRows() {
    return DATA.cards.filter(function (c) { return c.bench > 0; }).map(function (c) {
      var uses = DATA.decks.filter(function (d) { return (c.target[d.id] || 0) > 0; })
        .map(function (d) { return d.label; });
      return {
        source: "Bench", name: c.name, price: c.price, copies: c.bench,
        /* What a stack of spare copies is WORTH is the question the bench is read
           for, and it is the unit price times how many of them there are -- not the
           unit price, which is what the column used to sort on. */
        value: (c.price || 0) * (c.bench || 1),
        sub: [c.type, c.purpose].filter(Boolean).join(" · "),
        /* The deck names alone. It used to read "also in Chulane, Atraxa", which is a
           sentence and not a cell: on a phone the column label is printed in front of the
           value, so it came out "ALSO IN also in Chulane, Atraxa". */
        where: uses.length ? uses.join(", ") : "spare",
        decks: uses,
        type: primaryType(c.type), typeLine: c.type || "",
        color: colorGroup(c), rarity: rarityLabel(c.rarity),
        band: priceBand(c.price),
        status: c.status, chip: c.status === "Bench-Sub" || c.status === "Extra-Sub" ? "patina" : "",
        shelf: uses.length ? "Spare copy of a card a deck uses" : "Not in any deck"
      };
    });
  }

  /* ------------------------------------------------------- upgrade rows ----
   * Two written sources, one list. `upgrades` are the Tuned adds the workbook
   * already folded into the hundred; `b3` are the Bracket 3 swaps it did not.
   * Both name a card going in and, usually, a card coming out -- which is the pair
   * this table exists to show side by side, because "buy Underworld Breach" and
   * "cut Primary Research to do it" are one decision, not two.
   */
  function upgradeRows() {
    var rows = [];
    DATA.decks.forEach(function (deck) {
      function push(kind, entry) {
        var card = byName(entry.add);
        var owned = card && (card.status === "In Hand" || card.status === "Ordered");
        rows.push({
          source: "To Buy", kind: kind, name: entry.add, out: entry.replaces || "",
          why: entry.why || "", price: entry.price || (card && card.price) || 0,
          deck: deck.label, deckId: deck.id, gameChanger: Boolean(entry.gameChanger),
          type: primaryType(entry.type || (card && card.type)),
          typeLine: entry.type || (card && card.type) || "",
          color: colorGroup({type: entry.type || (card && card.type),
                             color: entry.color || (card && card.color)}),
          rarity: rarityLabel(card && card.rarity),
          band: priceBand(entry.price || (card && card.price)),
          /* Owned means the swap costs nothing but the shuffle, which is the first
             thing to know about it and the reason this is a status and not a price. */
          status: owned ? (card.status === "Ordered" ? "On order" : "Already owned") : "Still to buy",
          copies: 1
        });
      }
      (deck.upgrades || []).filter(function (u) { return u.action === "ADD"; })
        .forEach(function (u) { push("Tuned", {add: u.card, replaces: u.replaces, price: u.price}); });
      (deck.b3 || []).forEach(function (b) { push("Bracket 3", b); });
    });
    return rows;
  }

  /* ------------------------------------------------------- the table ----
   * Declared, not written twice. What differs between the bench and the upgrades is
   * which dimensions exist and which columns render; everything about filtering,
   * counting, sorting and banding is card-table.js, which the Shop uses too.
   */
  var BENCH_COLUMNS = [
    {key: "name", label: "Card"},
    {key: "where", label: "Also in"},
    {key: "type", label: "Type"},
    {key: "color", label: "Color"},
    {key: "rarity", label: "Rarity", value: function (r) { return RARITY_ORDER.indexOf(r.rarity); }},
    {key: "copies", label: "Copies", numeric: true},
    {key: "price", label: "Each", numeric: true, value: function (r) { return r.price == null ? -1 : r.price; }},
    {key: "value", label: "Worth", numeric: true}
  ];
  var UPGRADE_COLUMNS = [
    {key: "name", label: "In, and out"},
    {key: "why", label: "Why"},
    {key: "deck", label: "Deck"},
    {key: "kind", label: "Rung"},
    {key: "status", label: "Status"},
    {key: "price", label: "Price", numeric: true, value: function (r) { return r.price == null ? -1 : r.price; }}
  ];
  var BAND_ORDER = PRICE_BANDS.map(function (b) { return b[0]; });

  function benchFacets() {
    return [
      {key: "deck", label: "Deck", of: function (r) { return r.decks.length ? r.decks : ["Not in any deck"]; }},
      {key: "color", label: "Color", order: COLOR_ORDER},
      {key: "band", label: "Price", order: BAND_ORDER},
      {key: "type", label: "Type", order: PRIMARY_TYPES.concat(["Other"])},
      {key: "rarity", label: "Rarity", order: RARITY_ORDER}
    ];
  }
  function upgradeFacets() {
    return [
      {key: "deck", label: "Deck"},
      {key: "kind", label: "Rung", order: ["Tuned", "Bracket 3"]},
      {key: "status", label: "Status", order: ["Still to buy", "On order", "Already owned"]},
      {key: "color", label: "Color", order: COLOR_ORDER},
      {key: "band", label: "Price", order: BAND_ORDER},
      {key: "type", label: "Type", order: PRIMARY_TYPES.concat(["Other"])},
      {key: "rarity", label: "Rarity", order: RARITY_ORDER}
    ];
  }
  function benchGroups() {
    return [
      {key: "shelf", label: "In a deck or not"},
      {key: "deck", label: "Deck", of: function (r) { return r.decks; }, empty: "Not in any deck"},
      {key: "color", label: "Color", order: COLOR_ORDER},
      {key: "band", label: "Price", order: BAND_ORDER, empty: "No price yet"},
      {key: "type", label: "Type", order: PRIMARY_TYPES.concat(["Other"])},
      {key: "rarity", label: "Rarity", order: RARITY_ORDER, empty: "Rarity unknown"}
    ];
  }
  function upgradeGroups() {
    return [
      {key: "deck", label: "Deck"},
      {key: "kind", label: "Rung", order: ["Tuned", "Bracket 3"]},
      {key: "status", label: "Status", order: ["Still to buy", "On order", "Already owned"]},
      {key: "color", label: "Color", order: COLOR_ORDER},
      {key: "band", label: "Price", order: BAND_ORDER, empty: "No price yet"}
    ];
  }

  /* Which facet menu is open is a fact about this second, not a preference: saved, it
     would reopen a dropdown on a page somebody has not touched yet. */
  function withoutOpen(f) {
    var out = {};
    Object.keys(f || {}).forEach(function (k) { if (k !== "open") out[k] = f[k]; });
    return out;
  }

  /* A saved filter is only read back where the dimension still exists AND the value is
     still one this build offers. A file from an older build that names a facet that is
     gone, or a rarity spelled the old way, would otherwise leave the list filtered by
     something with no control on screen -- which reads as rows having vanished. */
  function readTable(target, raw, facets, columns) {
    if (!raw || typeof raw !== "object") return;
    var keys = {};
    facets.forEach(function (x) { keys[x.key] = true; });
    var f = {};
    Object.keys(raw.f || {}).forEach(function (k) {
      if (k === "query") return;                       // deliberately not restored
      if (!keys[k] || !Array.isArray(raw.f[k])) return;
      var vals = raw.f[k].filter(function (v) { return typeof v === "string"; });
      if (vals.length) f[k] = vals;
    });
    if (typeof raw.f === "object" && raw.f && typeof raw.f.group === "string") {
      f.group = raw.f.group;
    }
    target.f = f;
    if (raw.sort && columns.some(function (c) { return c.key === raw.sort.key; })
      && (raw.sort.dir === "asc" || raw.sort.dir === "desc")) {
      target.sort = {key: raw.sort.key, dir: raw.sort.dir};
    }
  }

  /* THE BUY LIST IS NOT HERE ANY MORE, and this is where it was.
   *
   * There were two of them: this one, derived from the master plus the ownership ledger,
   * and the Shop on the Deck Matrix, derived from the slot model plus the written pull
   * list. They disagreed -- the Shop knows about the pull list, about what has been paid,
   * about where a card is being bought and about marking one bought, and none of that
   * could reach here. Two buy lists that disagree is worse than one that is a click away,
   * so the tab went and the Shop is the buy list. #/buy redirects to it, and the ribbon's
   * "still to buy" and "on order" open it directly.
   */

  /* ------------------------------------------------------ uploaded counts */

  /* The strip above the bench. Two states: no file, in which case it offers one
     and explains what will happen; or a file, in which case it says what came of
     it and offers the way back. There is no third state, because an upload that
     half-applied would be worse than one that failed. */
  var INV_ACCEPT = ".csv,.tsv,.txt,.xlsx,text/csv,text/plain";

  /* The file picker plus the way to find out what the file should look like. The link
     under the button rather than beside it: "what am I even uploading" is the question
     that stops somebody, and it should be answered where they are already looking. */
  function uploadControl(label, primary) {
    return el("div", { class: "inv-upload" }, [
      el("label", { class: "btn" + (primary ? " primary" : "") + " inv-file" }, [
        label,
        el("input", { type: "file", accept: INV_ACCEPT, hidden: true, onchange: onInventoryFile })
      ]),
      el("button", { class: "inv-template", type: "button", text: "download template",
        title: "An .xlsx with the columns this reader wants, and a second sheet of examples",
        onclick: downloadInventoryTemplate })
    ]);
  }

  function inventoryBar() {
    if (!INVENTORY) {
      return el("div", { class: "inv-bar" }, [
        el("div", {}, [
          el("b", { text: "These counts come from the starting card base, not one you uploaded." }),
          el("span", { text: " Upload the cards you actually own and the decks are filled "
            + "from that instead — whatever is left over lands here." })
        ]),
        uploadControl("Upload what I own", true)
      ]);
    }
    var r = INVENTORY.result || {totals: {}};
    var t = r.totals || {};
    var when = String(INVENTORY.uploadedAt || "").slice(0, 10);
    return el("div", { class: "inv-bar is-on" }, [
      el("div", {}, [
        /* Says what the numbers ARE, not where a file came from. Before an upload the
           counts are the workbook's audit; after one they are the cards you told this app
           you own, and the bench is what those cards did not fill. */
        el("b", { text: "These counts come from your uploaded, currently owned card base." }),
        el("span", { text: " " + plural(t.cards || 0, "card") + " read · "
          + plural(t.used || 0, "copy", "copies") + " went into decks · "
          + plural(t.spare || 0, "copy", "copies") + " spare on the bench"
          + (t.short ? " · " + plural(t.short, "copy", "copies") + " still needed" : "")
          + (when ? " · read " + when : "") })
      ]),
      el("div", { class: "inv-acts" }, [
        uploadControl("Replace", false),
        el("button", { class: "btn ghost", type: "button", text: "Use the workbook's counts",
          onclick: clearInventory })
      ])
    ]);
  }

  /* WHAT THE UPLOAD SHOULD LOOK LIKE, as a file rather than as a sentence.
     ---------------------------------------------------------------------
     Two sheets. The first is empty but for the headers and is the one to type into; the
     second is called "example" and carries a few rows showing what each column takes.
     The reader ignores any sheet called example, so the template can be filled in and
     sent straight back without deleting anything -- which is what people do with a
     template, and what would otherwise import four made-up cards. */
  function downloadInventoryTemplate() {
    var Writer = window.MtgXlsxWriter;
    if (!Writer) return toast("The spreadsheet writer did not load.");
    /* Name and Quantity are the two the reader actually needs; the rest are there because
       every collection export in the wild carries them and deleting a column is more
       work than leaving it. */
    var columns = [
      { key: "name", label: "Name", width: 34 },
      { key: "quantity", label: "Quantity", width: 11 },
      { key: "set", label: "Set", width: 26 },
      { key: "condition", label: "Condition", width: 12 },
      { key: "foil", label: "Foil", width: 8 },
      { key: "notes", label: "Notes", width: 30 }
    ];
    var book = { sheets: [
      { name: "cards", columns: columns, rows: [] },
      { name: "example", columns: columns, rows: [
        { name: "Sol Ring", quantity: 2, set: "Commander 2021", condition: "NM", foil: "no",
          notes: "one of them is already in the Atraxa box" },
        { name: "Llanowar Elves", quantity: 1, set: "Dominaria United", condition: "LP", foil: "no", notes: "" },
        { name: "Rhystic Study", quantity: 1, set: "Jumpstart", condition: "NM", foil: "yes", notes: "sleeved" },
        { name: "Forest", quantity: 40, set: "", condition: "", foil: "no", notes: "basics, any printing" }
      ]}
    ]};
    var blob = new Blob([Writer.build(book)], { type: Writer.MIME });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "mtg-collection-template.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Template downloaded. Type into the first sheet — the example sheet is ignored on upload.");
  }

  /* WHICH SHEET WE READ, and why it is not simply the first one.
     The template we hand out has two sheets: `cards`, which is empty apart from
     the headers, and `example`, which shows what a filled-in row looks like. People
     fill in the first and send the workbook straight back without deleting anything
     -- that is what a template is for -- so a reader that took the first non-empty
     sheet would import Sol Ring, Llanowar Elves, Rhystic Study and forty Forests
     that nobody owns. A sheet called `example` is therefore never read, and if it
     is the only sheet in the file the upload fails rather than lying.
     Beyond that the rule is the old one: the first sheet with anything on it. */
  function pickInventorySheet(sheets) {
    var usable = sheets.filter(function (s) {
      return s && s.rows && s.rows.length && !/^examples?$/i.test(String(s.name || "").trim());
    });
    return usable[0] || null;
  }

  /* A .xlsx arrives as bytes and everything else as text, and the difference has
     to be settled before the file is read rather than after -- readAsText on a
     ZIP produces mojibake that parses as a one-column list of nonsense. */
  function onInventoryFile(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    var Inv = window.MtgInventoryImport;
    if (!Inv) return toast("The inventory reader did not load.");
    var reader = new FileReader();
    reader.onerror = function () { toast("That file could not be read."); };
    if (/\.xlsx$/i.test(file.name)) {
      reader.onload = function () {
        var Xlsx = window.MtgXlsxReader;
        if (!Xlsx) return toast("The spreadsheet reader did not load.");
        Xlsx.read(new Uint8Array(reader.result))
          .then(function (book) {
            var sheet = pickInventorySheet(book.sheets || []);
            if (!sheet) throw new Error("No sheet in that workbook had anything on it.");
            takeInventory(Inv.parseTable(sheet.rows), file.name + " · " + sheet.name);
          })
          .catch(function (err) { toast(String(err && err.message || err)); });
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = function () {
        takeInventory(Inv.parseText(String(reader.result || "")), file.name);
      };
      reader.readAsText(file);
    }
  }

  function takeInventory(parsed, source) {
    if (!parsed.cards.length) {
      /* The commonest way to land here is the template, downloaded and sent straight back
         without anything typed into it -- the example sheet is ignored by design, so an
         untouched template really does contain no cards. Saying so is more use than
         "no cards were found", which reads as the reader having done something wrong. */
      return toast(/template/i.test(source || "")
        ? "That is the template with nothing typed into it yet. Fill in the first sheet — "
          + "the example sheet is ignored on purpose."
        : "No cards were found in that file.");
    }
    INVENTORY = {cards: parsed.cards, uploadedAt: new Date().toISOString(), source: source};
    var saved = saveInventory();
    rebuild();
    var t = (INVENTORY.result || {totals: {}}).totals || {};
    /* ONE toast, not two. There were two, and the second landed in the same tick
       as the first: toast() replaces the node's text and resets its timer, so the
       warning that the upload had not been saved was overwritten by the count
       before it could be read. The failure case is a collection too big for this
       browser's storage -- which is to say, exactly the big upload this message
       exists for. So the warning is part of the same sentence as the count.
       A guessed column layout goes in it too: it is the other thing about an
       upload that can be silently wrong. */
    toast(plural(t.cards || 0, "card") + " read"
      + (parsed.guessed ? " (columns were guessed)" : "")
      + " · " + plural(t.spare || 0, "copy", "copies") + " on the bench"
      + (saved ? "" : " · too big to save, so it is gone when you reload"));
    go("#/bench");
    render();
  }

  /* HOW MANY ROWS BEFORE THE REST GOES BEHIND A BUTTON.
     Fifty on a desktop, where a row is one line. On a phone the columns fold into the row
     and take their labels with them, so a row is five lines and fifty of them is nineteen
     screens -- measured, on the 2,161-card bench. The cap is a promise about how much
     page arrives, so it is counted in screens rather than in rows.
     Only the bench is capped: the upgrade list is bounded by what six decks recommend,
     which is dozens, and hiding the last of those behind a tap buys nothing. */
  function groupPage() {
    return window.matchMedia && window.matchMedia("(max-width: 760px)").matches ? 22 : 50;
  }

  /* ------------------------------------------------------- bench + upgrades ----
   * Two lists, one table. Both go through renderTable, which owns the filter bar, the
   * header sort, the bands and the wiring; each caller supplies its rows, its columns
   * and how to draw one.
   */
  function renderTable(root, opts) {
    var Table = window.MtgCardTable;
    if (!Table) {
      root.appendChild(el("div", { class: "panel", text: "The table module did not load." }));
      return;
    }
    var view = opts.state;                       // {f, sort}
    var facets = opts.facets, columns = opts.columns;

    var host = el("div", { class: "ct" });
    root.appendChild(host);
    /* Which bands the reader has opened. Local to this render rather than saved: two
       thousand rows coming back expanded on the next visit is the app deciding something
       nobody asked for twice. */
    var expanded = {};

    function draw() {
      var kept = Table.filter(opts.rows, facets, Object.assign({searchIn: opts.searchIn}, view.f));
      var sorted = Table.sortRows(kept, columns, view.sort.key, view.sort.dir);
      var group = (opts.groups || []).filter(function (g) { return g.key === view.f.group; })[0] || null;
      var bands = Table.groupRows(sorted, group);

      var html = Table.filterBar(opts.rows, facets, view.f,
        {searchLabel: opts.searchLabel, groups: opts.groups,
         columns: columns, sort: view.sort});
      html += '<div class="ct-table" style="--ct-cols:' + opts.cols + '">';
      /* One tick box before the named columns and one "i" after them, so the header
         lands over the data it describes rather than a column to the left of it. */
      html += Table.head(columns, view.sort, {before: 1, after: 1});
      if (!sorted.length) {
        html += '<div class="ct-empty">' + Table.esc(opts.nothing || "Nothing matches these filters.") + "</div>";
      } else {
        bands.forEach(function (band, i) {
          var list = band[1];
          if (band[0]) {
            var worth = list.reduce(function (n, r) { return n + (r.price || 0) * (r.copies || 1); }, 0);
            html += '<div class="ct-band">' + Table.esc(band[0]) +
              "<span>" + plural(list.length, "card") + " · " + money(worth) + "</span></div>";
          }
          /* A LIST LONGER THAN THE CAP IS NOT READ, IT IS SCROLLED PAST.
             The bench after a collection upload is the case that proves it: 1,940 spare
             cards rendered at once is 118,000 pixels -- 126 screens on a desktop and 156
             on a phone. So a long band shows its first page and says exactly how many it
             is holding back, with one button for the rest. Filtering and sorting are the
             better answers and are one click away above; this is for the reader who
             wants the whole thing anyway. */
          var key = band[0] || "*";
          var open = !opts.cap || expanded[key] || list.length <= opts.cap;
          var shown = open ? list : list.slice(0, opts.cap);
          shown.forEach(function (row) { html += opts.row(row, Table); });
          if (!open) {
            html += '<button class="ct-more" type="button" data-ct-more="' + Table.esc(key) + '">' +
              "Show the other " + plural(list.length - shown.length, "card") + "</button>";
          }
          void i;
        });
      }
      html += "</div>";
      host.innerHTML = html;
      if (opts.after) opts.after(host);
    }

    /* One listener on the host rather than one per control: the bar is rebuilt on every
       change, so anything bound to a button inside it would be bound to a node that is
       already gone by the time it is pressed. */
    host.addEventListener("click", function (e) {
      var facet = e.target.closest("[data-ct-facet]");
      if (facet) {
        var key = facet.dataset.ctFacet;
        view.f = Object.assign({}, view.f, {open: view.f.open === key ? null : key});
        draw();
        return;
      }
      var pick = e.target.closest("[data-ct-pick]");
      if (pick) {
        var open = view.f.open;
        view.f = Table.toggle(view.f, pick.dataset.ctPick, pick.dataset.ctValue);
        view.f.open = open;                    // the menu stays up: people pick more than one
        save();
        draw();
        return;
      }
      if (e.target.closest("[data-ct-clear]")) {
        view.f = {};
        save();
        draw();
        return;
      }
      var more = e.target.closest("[data-ct-more]");
      if (more) {
        /* Redraw in place and put the scroll position back. The button sits at the BOTTOM
           of what has just been read; throwing the reader to the top is how a "show more"
           comes to feel like a mistake. */
        var y = window.scrollY;
        expanded[more.dataset.ctMore] = true;
        draw();
        window.scrollTo(0, y);
        return;
      }
      var sort = e.target.closest("[data-ct-sort]");
      if (sort) {
        var col = columns.filter(function (c) { return c.key === sort.dataset.ctSort; })[0];
        view.sort = Table.nextSort(view.sort, sort.dataset.ctSort, col && col.numeric ? "desc" : "asc");
        save();
        draw();
        return;
      }
      if (e.target.closest("[data-ct-sortdir]")) {
        view.sort = {key: view.sort.key, dir: view.sort.dir === "asc" ? "desc" : "asc"};
        save();
        draw();
        return;
      }
      if (opts.onClick) opts.onClick(e, draw);
    });
    host.addEventListener("change", function (e) {
      if (e.target.matches("[data-ct-group]")) {
        view.f = Object.assign({}, view.f, {group: e.target.value || undefined});
        save();
        draw();
      }
      if (e.target.matches("[data-ct-sortby]")) {
        var col = columns.filter(function (c) { return c.key === e.target.value; })[0];
        view.sort = {key: e.target.value, dir: col && col.numeric ? "desc" : "asc"};
        save();
        draw();
      }
    });
    host.addEventListener("input", function (e) {
      if (!e.target.matches("[data-ct-query]")) return;
      var at = e.target.selectionStart;
      view.f = Object.assign({}, view.f, {query: e.target.value});
      draw();
      var box = host.querySelector("[data-ct-query]");
      if (box) { box.focus(); box.setSelectionRange(at, at); }
    });
    /* Clicking anywhere else closes an open facet menu, the way any menu closes.
     *
     * ON THE CAPTURE PHASE, and this is the whole reason the menu would not open at all.
     * On the bubble phase this listener runs AFTER the one on the host -- which has by
     * then replaced host.innerHTML, so the button that was clicked is detached and
     * `host.contains(e.target)` is false. Every click that opened a menu immediately
     * closed it again. Capture runs document before host, while the target is still in
     * the tree, so the test asks the question about the DOM that was actually clicked.
     *
     * It removes itself once its host is gone: render() replaces #page on every route
     * change, and a listener per visit to the bench is a leak that grows all session. */
    function closeOnOutside(e) {
      if (!document.contains(host)) {
        document.removeEventListener("click", closeOnOutside, true);
        return;
      }
      if (!view.f.open) return;
      if (host.contains(e.target)) return;
      view.f = Object.assign({}, view.f, {open: null});
      draw();
    }
    document.addEventListener("click", closeOnOutside, true);

    draw();
    return draw;
  }

  /* The tick box and the "i" are the same two controls on both tables, so they are
     written once. The row itself is a label, so the whole row is the tick target. */
  function ctPick(row, T) {
    var key = pickKey(row);
    return '<label class="ct-row' + (state.picks.has(key) ? " is-picked" : "") +
      '" data-pick="' + T.esc(key) + '" data-ct-row="' + T.esc(key) + '">' +
      '<span class="ct-tick"><input type="checkbox"' + (state.picks.has(key) ? " checked" : "") +
      ' aria-label="Select ' + T.esc(row.name) + '"></span>';
  }
  function ctInfo(row, T) {
    return '<button class="ct-info" type="button" data-ct-card="' + T.esc(row.name) +
      '" title="Show ' + T.esc(row.name) + '" aria-label="Show ' + T.esc(row.name) + '">i</button></label>';
  }

  /* Shared by both tables: a tick changes the tray, and the "i" opens the card. */
  function ctRowClick(rowsByKey) {
    return function (e) {
      var info = e.target.closest("[data-ct-card]");
      if (info) { e.preventDefault(); e.stopPropagation(); openCard(info.dataset.ctCard); return; }
      var box = e.target.closest("[data-ct-row]");
      if (box && e.target.matches('input[type="checkbox"]')) {
        var row = rowsByKey[box.dataset.ctRow];
        if (row) togglePick(row, e.target.checked);
      }
    };
  }

  function renderBench(root) {
    var rows = benchRows();
    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: "The bench" }),
      el("p", { text: "Spare copies not committed to any of the decks. Sort on a column, "
        + "narrow it with the filters, and tick what you want to move." })
    ]));

    // The bench IS the leftover, so the upload that produces it belongs here.
    root.appendChild(inventoryBar());

    if (!rows.length) { root.appendChild(emptyNote("bench")); return; }

    var byKey = {};
    rows.forEach(function (r) { byKey[pickKey(r)] = r; });
    renderTable(root, {
      state: state.bench, rows: rows, columns: BENCH_COLUMNS,
      facets: benchFacets(), groups: benchGroups(),
      searchLabel: "Search the bench", searchIn: ["name", "sub", "where"],
      cols: "26px minmax(0,2fr) minmax(0,1.4fr) 84px 88px 84px 60px 62px 74px 30px",
      nothing: "No spare copy matches these filters.", cap: groupPage(),
      onClick: ctRowClick(byKey),
      row: function (row, T) {
        return ctPick(row, T) +
          '<span class="ct-cell ct-name"><b>' + T.esc(row.name) +
            (row.copies > 1 ? "  x" + row.copies : "") + "</b>" +
            (row.sub ? '<span class="ct-sub">' + T.esc(row.sub) + "</span>" : "") + "</span>" +
          '<span class="ct-cell" data-label="Also in">' + T.esc(row.where) + "</span>" +
          /* data-minor: still a column on a desktop, folded away on a phone. Eight
             labelled lines per row made a 22-row page nine screens tall, and four of the
             eight are dimensions you FILTER by rather than read -- the filters above still
             offer every one of them, and the "i" opens the card itself. */
          '<span class="ct-cell" data-minor data-label="Type">' + T.esc(row.type) + "</span>" +
          '<span class="ct-cell" data-minor data-label="Color">' + T.esc(row.color) + "</span>" +
          '<span class="ct-cell" data-minor data-label="Rarity">' + T.esc(row.rarity || "—") + "</span>" +
          '<span class="ct-cell ct-num" data-label="Copies">' + row.copies + "</span>" +
          '<span class="ct-cell ct-num" data-minor data-label="Each">' + (row.price ? money(row.price) : "—") + "</span>" +
          '<span class="ct-cell ct-num" data-label="Worth"><b>' + money(row.value) + "</b></span>" +
          ctInfo(row, T);
      }
    });
  }

  function renderUpgrades(root) {
    var rows = upgradeRows();
    var owed = rows.filter(function (r) { return r.status === "Still to buy"; });
    var cost = owed.reduce(function (n, r) { return n + (r.price || 0); }, 0);
    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: "Upgrades" }),
      el("p", { text: "Every change the plan recommends, as the card going in and the card "
        + "coming out. " + plural(owed.length, "card") + " still to buy · " + money(cost) + "." })
    ]));

    if (!rows.length) { root.appendChild(emptyNote("upgrades")); return; }

    var byKey = {};
    rows.forEach(function (r) { byKey[pickKey(r)] = r; });
    renderTable(root, {
      state: state.upgrades, rows: rows, columns: UPGRADE_COLUMNS,
      facets: upgradeFacets(), groups: upgradeGroups(),
      searchLabel: "Search the upgrades", searchIn: ["name", "out", "why", "deck"],
      cols: "26px minmax(0,1.5fr) minmax(0,1.9fr) 116px 84px 96px 74px 30px",
      nothing: "No recommended change matches these filters.",
      onClick: ctRowClick(byKey),
      row: function (row, T) {
        return ctPick(row, T) +
          '<span class="ct-cell ct-name"><span class="ct-swap">' +
            '<span class="ct-in"><b>' + T.esc(row.name) + "</b>" +
              (row.gameChanger ? '<span class="ct-gc">Game Changer</span>' : "") + "</span>" +
            '<span class="ct-arrow" aria-hidden="true">→</span>' +
            '<span class="ct-out">' + (row.out ? "<b>" + T.esc(row.out) + "</b>"
              : '<span class="ct-sub">nothing comes out</span>') + "</span>" +
          "</span></span>" +
          '<span class="ct-cell ct-why" data-label="Why">' +
            T.esc(row.why || (row.kind === "Tuned"
              ? "A Tuned add the plan already counts in the hundred."
              : "A Bracket 3 swap: legal at Bracket 3, and not part of the hundred yet.")) + "</span>" +
          '<span class="ct-cell" data-label="Deck">' + T.esc(row.deck) + "</span>" +
          '<span class="ct-cell" data-minor data-label="Rung">' + T.esc(row.kind) + "</span>" +
          '<span class="ct-cell" data-label="Status">' + T.esc(row.status) + "</span>" +
          '<span class="ct-cell ct-num" data-label="Price">' + (row.price ? money(row.price) : "—") + "</span>" +
          ctInfo(row, T);
      }
    });
  }

  /* WHAT AN EMPTY LIST MEANS, said only while it is empty.
   *
   * A cleared session lands on a bench of nothing and an upgrade list of nothing, which
   * looks identical to an app that failed to load. The difference is one sentence, and
   * it only helps while it is true -- a note explaining how a list fills, printed above
   * a full list, is noise somebody learns to skip past. */
  var EMPTY_NOTE = {
    bench: {
      title: "Nothing on the bench yet",
      body: "The bench is what is left over: copies you own that no deck has a slot for. "
        + "Upload the cards you actually own with the button above, or get some decks — "
        + "whatever they do not take lands here."
    },
    upgrades: {
      title: "No upgrades to show yet",
      body: "Upgrades are the changes a deck plan recommends — a card going in, a card "
        + "coming out, and why. They appear once there is a deck to recommend them for."
    }
  };
  function emptyNote(kind) {
    var n = EMPTY_NOTE[kind];
    /* Two ways out, and which one is offered depends on what is missing. A browser with
       nothing in it wants the default load; one that has decks but an empty bench wants
       the deck list, because the answer is up there. */
    var blank = freshBrowser();
    return el("div", { class: "panel empty-note" }, [
      el("h3", { text: n.title }),
      el("p", { class: "play-line", text: n.body }),
      blank
        ? el("button", { class: "btn primary", type: "button", text: "Load default", onclick: loadDefault })
        : el("button", { class: "btn primary", type: "button", text: "Go to the decks",
            onclick: function () { go("#/decks"); } })
    ]);
  }

  /* Somebody followed a link to a deck they have since put down. Say which deck, say
     what archived means, and offer the one button that undoes it -- rather than dropping
     them on the deck list, which looks exactly like the deck having been deleted. */
  function renderArchivedDeck(root, id) {
    var deck = archivedDecks().filter(function (d) { return d.id === id; })[0];
    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: deck ? deck.label : "That deck is archived" }),
      el("p", { text: "Archived, so it is off the deck list and its cards are out of the "
        + "buy list. Nothing about it has been deleted." })
    ]));
    root.appendChild(el("div", { class: "panel", style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center" }, [
      el("span", { style: "color:var(--text-dim);font-size:13.5px",
        text: deck ? deck.commander : "It is not in this browser's list at all." }),
      deck ? el("button", { class: "btn primary", type: "button", text: "Put it back",
        onclick: function () {
          setArchived(deck.id, false);
          toast(deck.label + " is back in the list.");
          go("#/deck/" + deck.id);
        } }) : null,
      el("button", { class: "btn", type: "button", text: "Back to my decks",
        onclick: function () { go("#/decks"); } })
    ]));
  }

  /* ------------------------------------------------------------ the tray */

  function shareText() {
    var picks = Array.from(state.picks.values());
    var bySource = { Bench: [], "To Buy": [] };
    picks.forEach(function (p) { (bySource[p.source] || bySource["To Buy"]).push(p); });

    var lines = [], total = 0;
    ["Bench", "To Buy"].forEach(function (src) {
      var list = bySource[src];
      if (!list.length) return;
      list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      lines.push(src.toUpperCase() + " (" + list.length + ")");
      list.forEach(function (p) {
        var cost = (p.price || 0) * (p.copies || 1);
        total += cost;
        lines.push("  " + (p.copies > 1 ? p.copies + "x " : "") + p.name
          + "  " + (p.price ? money(p.price) : "no price")
          + (p.where ? "  [" + p.where + "]" : ""));
      });
      lines.push("");
    });
    lines.push("TOTAL  " + money(total) + "  (" + plural(picks.length, "card") + ")");
    return { body: lines.join("\n"), total: total, count: picks.length };
  }

  function syncTray() {
    var tray = document.getElementById("tray");
    var n = state.picks.size;
    tray.classList.toggle("is-open", n > 0);
    if (!n) return;
    var s = shareText();
    document.getElementById("tray-tally").innerHTML =
      "<b>" + n + "</b> selected <span>· " + money(s.total) + "</span>";
  }

  function doShare() {
    var s = shareText();
    if (!s.count) return;
    var subject = "MTG cards — " + plural(s.count, "card") + ", " + money(s.total);
    // mailto has no formal length limit but browsers and mail clients start
    // dropping the body somewhere past ~1800 characters, so a long list is cut
    // with a marker rather than silently truncated by the client.
    var body = s.body;
    if (body.length > 1700) {
      body = body.slice(0, 1700) + "\n\n… list truncated for email. Use Copy list for all of it.";
    }
    var to = (state.shareTo || "").trim();
    window.location.href = "mailto:" + encodeURIComponent(to)
      + "?subject=" + encodeURIComponent(subject)
      + "&body=" + encodeURIComponent(body);
  }

  function copyList() {
    var s = shareText();
    if (!s.count) return;
    var done = function () { toast("List copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s.body).then(done, function () { fallbackCopy(s.body, done); });
    } else {
      fallbackCopy(s.body, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = el("textarea", { style: "position:fixed;opacity:0" });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (err) { toast("Could not copy"); }
    document.body.removeChild(ta);
  }

  var toastTimer = null;
  function toast(msg) {
    var node = document.getElementById("toast");
    node.textContent = msg;
    node.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove("is-on"); }, 1900);
  }

  /* ------------------------------------------------------------- ribbon  */

  function renderRibbon() {
    var boxed = 0, ordered = 0, toBuy = 0, buyCost = 0;
    DATA.decks.forEach(function (d) {
      var s = deckStats(d);
      boxed += s.tally.box;
      ordered += s.tally.order;
      toBuy += s.tally.buy;
      buyCost += s.toBuyCost;
    });
    var bench = DATA.cards.reduce(function (n, c) { return n + c.bench; }, 0);
    var upgrades = DATA.decks.reduce(function (n, d) {
      return n + d.b3.length + d.upgrades.filter(function (u) { return u.action === "ADD"; }).length;
    }, 0);

    /* EVERY FIGURE GOES SOMEWHERE. The ribbon read as a caption -- seven numbers you
       could look at and not touch -- when each one is the summary of a page that already
       exists. The cards-boxed figure is the Deck view; "on order" and "still to buy" are
       the Shop; "bench copies" is the bench. A number that answers a question should be
       the way to the rest of the answer. */
    var bits = [
      [String(DATA.decks.length), "decks", "#/decks", "Back to the deck list"],
      [String(boxed) + "/" + DATA.decks.reduce(function (n, d) { return n + (d.targetCards || 100); }, 0),
        "cards boxed", "matrix.html#deck", "Open the Deck view in Build & shop"],
      [String(ordered), "on order", "matrix.html#shop", "Open the Shop"],
      [String(toBuy), "still to buy", "matrix.html#shop", "Open the Shop"],
      [money(buyCost), "to finish", "matrix.html#shop", "Open the Shop"],
      [String(bench), "bench copies", "#/bench", "Open the bench"],
      [String(upgrades), "upgrades planned", "#/upgrades", "Open the upgrades"]
    ];
    var row = el("div", { class: "ribbon" });
    bits.forEach(function (b, i) {
      if (i) row.appendChild(el("span", { class: "sep", text: "·" }));
      row.appendChild(el("a", { class: "ribbon-stat", href: b[2], title: b[3] },
        [el("b", { text: b[0] }), " " + b[1]]));
    });
    return row;
  }

  /* ------------------------------------------------------------- routing */

  function go(hash) {
    if (window.location.hash === hash) route();
    else window.location.hash = hash;
  }

  function route() {
    var h = (window.location.hash || "#/decks").replace(/^#\/?/, "");
    var parts = h.split("/");
    if (parts[0] === "deck" && parts[1]) {
      var deck = DATA.decks.filter(function (d) { return d.id === parts[1]; })[0];
      if (deck) { state.view = "deck"; state.deck = deck; render(); return; }
      /* A bookmark, or the browser's back button after archiving. The deck is not gone,
         it is put down -- and dropping through to the deck list would say the opposite,
         silently, to somebody who followed a link that used to work. */
      if (isArchived(parts[1])) {
        state.view = "archived"; state.archivedId = parts[1]; state.deck = null; render(); return;
      }
    }
    /* #/buy is gone: the buy list lives on the Shop tab of the Deck Matrix, which is the
       same list with a better table and the only place that can mark a card bought. An
       old bookmark or a link in somebody's notes still has to land somewhere sensible,
       so it lands there rather than on a tab that no longer exists. */
    if (parts[0] === "buy") { window.location.replace("matrix.html#shop"); return; }
    state.view = ["decks", "bench", "upgrades"].indexOf(parts[0]) >= 0 ? parts[0] : "decks";
    state.deck = null;
    state.query = "";
    render();
  }

  /* The ribbon and the two tab counts describe the whole catalog, so they are
     rebuilt on every render rather than once at boot -- adding or removing a
     deck changes all three, and a stale "6 decks" over seven is the kind of
     wrong that reads as a bug in the numbers themselves. */
  function renderCounts() {
    /* "six Commander decks" stops being true the moment somebody adds a seventh -- or
       archives one of the six, which the original test for "has anybody added a deck"
       did not catch: five decks on screen under a line still promising six. */
    var sub = document.getElementById("brand-sub");
    if (sub && DATA.decks.length !== 6) {
      sub.textContent = DATA.decks.length
        ? DATA.decks.length + " Commander deck" + (DATA.decks.length === 1 ? "" : "s")
          + ", what they do, and what they still need"
        // A cleared browser. "0 Commander decks, what they do" describes nothing.
        : "Nothing saved here yet — add a deck, build one, or load the default";
    }
    var slot = document.getElementById("ribbon-slot");
    if (slot) { slot.textContent = ""; slot.appendChild(renderRibbon()); }
    var bench = document.getElementById("tab-bench");
    if (bench) bench.querySelector(".count").textContent = String(benchRows().length);
    var up = document.getElementById("tab-upgrades");
    if (up) up.querySelector(".count").textContent = String(upgradeRows().length);
  }

  function render() {
    var root = document.getElementById("page");
    root.textContent = "";
    renderCounts();

    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.view === state.view
        || ((state.view === "deck" || state.view === "archived") && t.dataset.view === "decks");
      t.setAttribute("aria-selected", on ? "true" : "false");
    });

    if (state.view === "deck") renderDeck(root, state.deck);
    else if (state.view === "archived") renderArchivedDeck(root, state.archivedId);
    else if (state.view === "bench") renderBench(root);
    else if (state.view === "upgrades") renderUpgrades(root);
    else renderDecks(root);

    syncTray();
    /* A re-render means a new page, so it starts at the top -- with no exception any
       more. There used to be one: expanding a capped group rebuilt the whole page from
       a button at the bottom of it, so the position had to be saved and put back. The
       shared table redraws only itself, in place, so filtering and sorting never move
       the page at all and there is nothing left to restore. */
    if (state.view !== "deck") window.scrollTo(0, 0);
  }

  /* -------------------------------------------------------------- admin ----
   *
   * The same button, the same menu and the same clear as the Deck Matrix, because they
   * are two views of one browser: a clear pressed on either has to leave the other one
   * empty too, and a backup taken on either has to be readable by the other.
   *
   * The backup is MtgUserState.snapshot -- every key the app writes, as raw strings.
   * The Matrix also writes its own richer payload, and this reads both: a file with a
   * `values` block is a browser snapshot, a file with `myDecks` is a Matrix export, and
   * refusing one of them because it came from the other page would be the app being
   * precious about a format the reader never chose.
   */
  function browserBackup() {
    var User = window.MtgUserState;
    if (!User) return toast("The backup module did not load.");
    var snap = User.snapshot(window.localStorage);
    if (!snap.keys.length) return toast("There is nothing saved in this browser to back up.");
    var blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "mtg-browser-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    try { localStorage.setItem("mtg-last-export-v1", String(Date.now())); } catch (err) { /* fine */ }
    toast("Backed up " + plural(snap.keys.length, "saved thing") + " from this browser.");
  }

  function restoreBackup(file) {
    var User = window.MtgUserState;
    if (!User) return toast("The backup module did not load, so nothing was restored.");
    var reader = new FileReader();
    reader.onerror = function () { toast("That file could not be read."); };
    reader.onload = function () {
      var payload;
      try { payload = JSON.parse(String(reader.result || "")); }
      catch (err) { return toast("That file is not readable JSON."); }
      try {
        if (payload && payload.values) {
          var out = User.restore(window.localStorage, payload);
          toast("Restored " + plural(out.restored.length, "saved thing")
            + (out.skipped.length ? " · " + out.skipped.length + " it did not recognize" : "")
            + ". Reloading…");
        } else if (payload && payload.myDecks) {
          /* A Deck Matrix export. Only the four keys this page owns are taken from it;
             the Matrix half of the file is its own business and restoring it from here
             would be this page overwriting a page it cannot see. */
          var mine = payload.myDecks, took = 0;
          var MAP = {decks: (Store && Store.STORE_KEY) || "mtg-imported-decks.v1",
                     inventory: INVENTORY_KEY, picks: STORE, archived: ARCHIVE_KEY};
          Object.keys(MAP).forEach(function (field) {
            try {
              if (mine[field]) { localStorage.setItem(MAP[field], JSON.stringify(mine[field])); took += 1; }
              else localStorage.removeItem(MAP[field]);
            } catch (err) { /* storage refused; the rest still lands */ }
          });
          toast("Restored " + plural(took, "thing") + " from a Deck Matrix backup. Reloading…");
        } else {
          return toast("That is not a backup of this app.");
        }
      } catch (err) {
        return toast(String(err && err.message || err));
      }
      setTimeout(function () { window.location.reload(); }, 700);
    };
    reader.readAsText(file);
  }

  /* LOAD DEFAULT: this repository's own copy of the six decks, the collection behind
     them and the card statuses -- the thing to press on a browser that has never seen
     this app, or after a clear. It is a file in the repo rather than anything
     account-shaped, so anybody who opens the page can press it and see the same decks. */
  function loadDefault() {
    if (!window.confirm("Load the default decks and collection?\n\n"
      + "This replaces the decks, the uploaded collection and the ticks currently saved "
      + "in this browser with the copy kept in the repository.")) return;
    fetchJson("data/my-load.json?v=1").then(function (payload) {
      var User = window.MtgUserState;
      if (!payload || !payload.values || !User) throw new Error("The default load file is not readable.");
      User.clearAll(window.localStorage, window.sessionStorage);
      var out = User.restore(window.localStorage, payload);
      // Pressing this IS the decision to start from the shipped six, so record it rather
      // than leaving the next boot to guess.
      if (User.setCatalogSource) User.setCatalogSource(window.localStorage, "default");
      toast("Loaded the default: " + plural(out.restored.length, "saved thing") + ". Reloading…");
      setTimeout(function () { window.location.reload(); }, 700);
    }).catch(function (err) {
      toast("Could not load the default (" + (err && err.message || err) + ").");
    });
  }

  function mountAdminMenu() {
    var Admin = window.MtgAdminMenu;
    if (!Admin) return;
    Admin.mount({
      items: function () {
        var when = null;
        try { when = Admin.ago(Number(localStorage.getItem("mtg-last-export-v1")) || 0); }
        catch (err) { when = null; }
        return [
          {kind: "note", text: when ? "backed up " + when : "never backed up", stale: !when},
          {kind: "item", label: "Export a backup", run: browserBackup,
            hint: "One file with everything this browser has saved — decks, collection, ticks and marks."},
          {kind: "file", label: "Import a backup", accept: ".json,application/json", onFile: restoreBackup,
            hint: "Reads a backup from either page. Replaces what is saved here."},
          {kind: "sep"},
          {kind: "item", label: "Load default", run: loadDefault,
            hint: "The six decks and the collection behind them, as kept in this repository."},
          {kind: "sep"},
          {kind: "item", label: "Clear session", warn: true,
            hint: "Everything, including added decks and your collection. Offers a backup first.",
            run: function () {
              Admin.clearSession({
                onExport: browserBackup,
                say: toast,
                onCleared: function (gone) {
                  toast(plural(gone.keys.length, "saved thing") + " cleared. Reloading…");
                  /* A reload rather than a re-render: half this page's state lives in
                     module variables read at boot, and putting a browser back to "never
                     opened" from the inside means finding every one of them. */
                  setTimeout(function () { window.location.reload(); }, 700);
                }
              });
            }}
        ];
      }
    });
  }

  /* --------------------------------------------------------------- start */

  /* Every URL here already carries its own ?v=, which is what makes the browser
     cache safe to use: a data rebuild bumps the version and the URL changes, so
     nothing stale can be served. "no-cache" was defeating that for no benefit --
     measured at the socket, it re-downloaded every file on every visit, exactly
     as "no-store" did. */
  function fetchJson(url) {
    return fetch(url, { cache: "default" }).then(function (r) {
      if (!r.ok) throw new Error(url + " → " + r.status);
      return r.json();
    });
  }

  function boot() {
    load();
    fetchJson("data/master-v2.json?v=2").then(function (master) {
      MASTER = master;
      // Decks added on this device are read before the first render, so an
      // added deck is on the page at load rather than appearing a beat later.
      IMPORTS = Store ? Store.read(window.localStorage) : [];
      loadInventory();
      loadArchived();
      rebuild();
      // The ratings and the guides are generated separately and may lag; the
      // page is fully usable without either, so a miss is not an error.
      return Promise.all([
        fetchJson("data/deck-ratings.json?v=4").catch(function () { return null; }),
        fetchJson("data/deck-guides.json?v=1").catch(function () { return null; }),
        fetchJson("data/deck-swaps.json?v=1").catch(function () { return null; })
      ]);
    }).then(function (extra) {
      RATINGS = extra[0];
      GUIDES = extra[1];
      SWAPS = extra[2];

      var to = document.getElementById("share-to");
      to.value = state.shareTo;
      to.addEventListener("input", function (e) { state.shareTo = e.target.value; save(); });

      document.getElementById("share-btn").addEventListener("click", doShare);
      document.getElementById("copy-btn").addEventListener("click", copyList);
      document.getElementById("clear-btn").addEventListener("click", function () {
        state.picks.clear(); save(); render();
      });
      document.querySelectorAll(".tab").forEach(function (t) {
        t.addEventListener("click", function () { go("#/" + t.dataset.view); });
      });
      mountAdminMenu();
      window.addEventListener("hashchange", function () { closeCard(); route(); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && document.getElementById("sheet")) closeCard();
      });
      route();
      /* After the page is on screen, not before: a card you added by link is already in
         your deck, and asking Scryfall whether it exists yet must never delay the load. */
      recheckManualCards();
    }).catch(function (err) {
      document.getElementById("page").appendChild(el("div", { class: "panel" }, [
        el("h3", { text: "Could not load the deck data" }),
        el("p", { class: "play-line", text: String(err && err.message || err) }),
        el("p", { class: "play-line", text:
          "If you are opening this file directly from disk, a browser will block the "
          + "data files. Serve the folder over http instead." })
      ]));
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
