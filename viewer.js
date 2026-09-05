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
    benchFilter: "all",
    buyFilter: "need",    // the store list opens on what the decks are short of
    buyGroup: "price"     // price | color | kind -- how the buy list is grouped
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
        picks: Array.from(state.picks.values())
      }));
    } catch (err) { /* private mode, or storage off; the page still works */ }
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || "{}");
      state.shareTo = raw.shareTo || "";
      (raw.picks || []).forEach(function (p) { state.picks.set(p.source + "|" + p.name, p); });
    } catch (err) { /* ignore anything unparseable */ }
  }

  /* -------------------------------------------------------- added decks */

  var Store = window.MtgDeckStore;

  /* Fold the added decks back into the catalog and drop every memo computed off
     the old one. byName caches a name index and orderedDecks stamps _rank onto
     the deck objects; both describe the catalog that was, and a stale index is
     how an added card would come back "not found" from the row that holds it. */
  function rebuild() {
    DATA = Store ? Store.merge(MASTER, IMPORTS) : MASTER;
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
      return { id: id, commander: deck.commander, builds: { v1: {
        score: deck.measured.score,
        winRate: deck.measured.winRate,
        bracket: null
      } } };
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
      factsPending = fetchJson("data/card-facts.json?v=1").then(function (f) {
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
      if (f && f.normal) {
        var img = el("img", { src: f.normal, alt: name });
        img.addEventListener("error", function () {
          front.textContent = "";
          front.appendChild(el("div", { class: "fallback", text: "No image for " + name }));
        });
        front.appendChild(img);
      } else {
        front.appendChild(el("div", { class: "fallback",
          text: f ? "No image for " + name : name + " is not in the card data" }));
      }
      fillBack(back, name, f, card);
    });
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
      "MtgImportPanel", "MtgSimEngine"].filter(function (name) { return !window[name]; });
    if (missing.length) return toast("The import tools did not load (" + missing[0] + ").");

    window.MtgImportPanel.createPanel({
      existing: function () { return IMPORTS; },
      localCards: localCards,
      lookupCards: lookupCards,
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
        record.measured = window.MtgDeckMeasure.measure(cards, {
          config: context.config, seats: context.seats,
          onSeed: function (done, total) { button.textContent = "Seed " + done + " of " + total; }
        });
        saveImports();
        rebuild();
        toast(record.label + " scores " + record.measured.score.toFixed(2) + ".");
        render();
      }, 30);
    });
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

  /* --------------------------------------------------------------- decks  */

  function renderDecks(root) {
    var decks = orderedDecks();

    var added = decks.filter(function (d) { return d.imported; }).length;
    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: added
        ? decks.length + " decks"
        : "The six decks" }),
      el("p", { text: RATINGS
        ? "Ranked by simulated score. Tap a deck for how to play it and what is still missing."
        : "Tap a deck for how to play it, the full hundred, and what is still missing." })
    ]));

    var grid = el("div", { class: "deck-grid" });
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

      grid.appendChild(el("button", {
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
    });

    // The tile that adds one. Last in the grid, because it is the thing you
    // reach for after looking at what is already there.
    grid.appendChild(el("button", { class: "deck-add", type: "button",
      onclick: openImport }, [
      el("span", { class: "plus", "aria-hidden": "true", text: "+" }),
      el("b", { text: "Add a deck" }),
      el("span", { text: "Paste a list from Moxfield or anywhere else, or give an "
        + "Archidekt link. It is scored on the same simulation as these." })
    ]));
    root.appendChild(grid);

    /* Only how the score is made. The import still records where the workbook
       contradicts itself -- in data/master-v2.json under dataNotes, and on
       stdout when tools/import_master_v2.py runs -- but that is bookkeeping for
       whoever is fixing the sheet, not something to put in front of a reader. */
    if (RATINGS && RATINGS.method) {
      root.appendChild(el("details", { class: "panel", style: "margin-top:20px" }, [
        el("summary", { style: "cursor:pointer;color:var(--text-dim);font-size:13px",
          text: "How the score is measured" }),
        el("ul", { class: "note-list", style: "margin-top:10px" },
          [RATINGS.method].concat(RATINGS.notes || []).slice(0, 4).map(function (n) {
            return el("li", { text: n });
          }))
      ]));
    }
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

    root.appendChild(el("button", { class: "back-link", type: "button",
      onclick: function () { go("#/decks"); } }, "← All decks"));

    /* An added deck says where it came from, and offers the way back out. The
       six do neither, because neither is true of them. */
    if (deck.imported) {
      root.appendChild(el("div", { class: "imp-banner" }, [
        el("span", {}, [
          el("b", { text: "Added deck" }), " · ",
          deck.source === "paste" ? "pasted list" : "from " + deck.source,
          deck.sourceUrl ? el("a", { href: deck.sourceUrl, target: "_blank",
            rel: "noopener", text: " open it there ↗" }) : null,
          deck.measured ? "" : " · not scored yet"
        ]),
        deck.measured ? null : el("button", { class: "btn", type: "button",
          text: "Measure it", style: "margin-left:auto",
          onclick: function (e) { measureDeck(deck, e.currentTarget); } }),
        el("button", { class: "btn ghost", type: "button",
          style: deck.measured ? "" : "margin-left:0",
          onclick: function () { removeImport(deck); }, text: "Remove" })
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

  function pickTable(rows, cols) {
    if (!rows.length) {
      return el("div", { class: "pick-table" }, el("div", { class: "empty",
        text: "Nothing here right now." }));
    }
    var table = el("div", { class: "pick-table" }, [
      el("div", { class: "pick-head" }, [
        el("span", {}), el("span", { text: "Card" }), el("span", { class: "where", text: cols.where }),
        el("span", { class: "st", text: cols.status }), el("span", { class: "money", text: "Price" })
      ])
    ]);
    rows.forEach(function (row) {
      var key = pickKey(row), on = state.picks.has(key);
      var node = el("label", {
        class: "pick-row" + (on ? " is-picked" : ""),
        "data-pick": key
      }, [
        el("input", { type: "checkbox", checked: on, onchange: function (e) {
          togglePick(row, e.target.checked);
        } }),
        el("span", { class: "n" }, [
          el("b", { text: row.name + (row.copies > 1 ? "  x" + row.copies : "") }),
          el("span", { text: row.sub || "" })
        ]),
        el("span", { class: "where", text: row.where || "" }),
        el("span", { class: "st" }, row.status
          ? el("span", { class: "chip " + (row.chip || ""), text: row.status }) : null),
        el("span", { class: "money num", text: row.price ? money(row.price) : "—" }),
        el("button", {
          class: "info", type: "button", title: "Show " + row.name,
          "aria-label": "Show " + row.name,
          onclick: function (e) { e.preventDefault(); e.stopPropagation(); openCard(row.name); }
        }, "i")
      ]);
      table.appendChild(node);
    });
    return table;
  }

  function matchesQuery(row) {
    if (!state.query) return true;
    var q = state.query.toLowerCase();
    return (row.name + " " + (row.sub || "") + " " + (row.where || "")).toLowerCase().indexOf(q) >= 0;
  }

  function benchRows() {
    return DATA.cards.filter(function (c) { return c.bench > 0; }).map(function (c) {
      var uses = DATA.decks.filter(function (d) { return (c.target[d.id] || 0) > 0; })
        .map(function (d) { return d.label; });
      return {
        source: "Bench", name: c.name, price: c.price, copies: c.bench,
        sub: [c.type, c.purpose].filter(Boolean).join(" · "),
        where: uses.length ? "also in " + uses.join(", ") : "spare",
        status: c.status, chip: c.status === "Bench-Sub" || c.status === "Extra-Sub" ? "patina" : "",
        group: uses.length ? "Spare copies of cards a deck uses" : "Not in any deck"
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  var BUY_KIND = {
    need:  { status: "Needed now", chip: "rose",   group: "Needed to finish a deck" },
    tuned: { status: "Tuned",      chip: "patina", group: "Tuned upgrades" },
    b3:    { status: "Bracket 3",  chip: "amber",  group: "Bracket 3 upgrades" }
  };

  /* What a card is doing on the buy list is a property of the card, not of which
     loop happened to reach it first. A Tuned add that a deck already targets
     shows up both as a plan hole and as an upgrade; it belongs under Tuned, or
     the Tuned filter comes back empty. So the plan is read first and the holes
     are classified against it. */
  function buyPlan() {
    var plan = {};
    DATA.decks.forEach(function (deck) {
      deck.upgrades.filter(function (u) { return u.action === "ADD"; }).forEach(function (u) {
        plan[u.card] = plan[u.card] ||
          { kind: "tuned", deck: deck.label, replaces: u.replaces, price: u.price };
      });
      deck.b3.forEach(function (s) {
        plan[s.add] = plan[s.add] ||
          { kind: "b3", deck: deck.label, replaces: s.replaces, price: s.price,
            gameChanger: s.gameChanger, why: s.why };
      });
    });
    return plan;
  }

  function buyRows() {
    var plan = buyPlan(), rows = [], seen = {};

    function push(name, price, copies, kind, deckLabel, replaces, gc) {
      if (seen[name]) return;
      seen[name] = true;
      var c = byName(name), meta = BUY_KIND[kind];
      var sub = c ? [c.type, c.purpose].filter(Boolean).join(" · ") : "";
      if (replaces) sub += (sub ? " · " : "") + "replaces " + replaces;
      var inCart = c && c.cartVendor === "WF";
      rows.push({
        source: "To Buy", name: name, price: price, copies: copies || 1,
        sub: sub, where: deckLabel ? "for " + deckLabel : "",
        status: inCart ? "In WF cart" : (gc ? "Game Changer" : meta.status),
        chip: inCart ? "patina" : (gc ? "amber" : meta.chip), kind: kind, group: meta.group,
        color: c ? c.color : "", type: c ? c.type : "", inCart: inCart
      });
    }

    // Holes in a deck's current plan.
    DATA.cards.forEach(function (c) {
      if (c.buyCount <= 0) return;
      var p = plan[c.name];
      var wants = DATA.decks.filter(function (d) { return (c.target[d.id] || 0) > 0; })
        .map(function (d) { return d.label; });
      // A targeted card the decks are short of is needed now, whatever plan
      // it also appears in; the upgrade loops below only add what is not.
      push(c.name, c.price, c.buyCount, "need",
        wants.join(", ") || (p && p.deck) || "", p && p.replaces, p && p.gameChanger);
    });

    // Upgrades not yet owned, in plan order.
    ["tuned", "b3"].forEach(function (kind) {
      Object.keys(plan).forEach(function (name) {
        var p = plan[name];
        if (p.kind !== kind) return;
        var c = byName(name);
        if (c && (c.status === "In Hand" || c.status === "Ordered")) return;
        push(name, p.price !== null && p.price !== undefined ? p.price : (c && c.price),
          1, kind, p.deck, p.replaces, p.gameChanger);
      });
    });
    return rows;
  }

  function groupedTable(root, rows, cols) {
    var order = [], groups = {};
    rows.forEach(function (r) {
      if (!groups[r.group]) { groups[r.group] = []; order.push(r.group); }
      groups[r.group].push(r);
    });
    if (!rows.length) {
      root.appendChild(el("div", { class: "pick-table" },
        el("div", { class: "empty", text: "Nothing matches." })));
      return;
    }
    order.forEach(function (name) {
      var list = groups[name];
      var sum = list.reduce(function (n, r) { return n + (r.price || 0) * (r.copies || 1); }, 0);
      root.appendChild(el("div", { class: "section-head", style: "margin:18px 0 8px" }, [
        el("h2", { style: "font-size:16px", text: name }),
        el("p", { text: plural(list.length, "card") + " · " + money(sum) }),
        el("button", { class: "pick-all", type: "button", onclick: function () {
          var allOn = list.every(function (r) { return state.picks.has(pickKey(r)); });
          list.forEach(function (r) { togglePick(r, !allOn); });
        }, text: "Select all" })
      ]));
      root.appendChild(pickTable(list, cols));
    });
  }

  /* The buy list is read in a shop, off a phone. Price bands put the expensive
     cards first so they get checked against the case before the commons; the
     color view follows how a singles binder is sorted. Cards already in the
     Wake Forest cart are bought online and sit in a group of their own at the
     bottom in every view. */
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
    return "Multicolor";
  }
  function regroupBuyRows(rows, mode) {
    var out = rows.map(function (r) {
      var g = r.inCart ? "In your Wake Forest cart — buying online, skip at the store"
        : mode === "price" ? priceBand(r.price)
        : mode === "color" ? colorGroup(r)
        : r.group;
      return Object.assign({}, r, { group: g });
    });
    var rank = function (r) {
      if (r.inCart) return 99;
      if (mode === "price") return PRICE_BANDS.map(function (b) { return b[0]; }).indexOf(r.group);
      if (mode === "color") return COLOR_ORDER.indexOf(r.group);
      return 0;
    };
    out.sort(function (a, b) {
      var d = rank(a) - rank(b);
      if (d) return d;
      if (mode === "color" && !a.inCart) return ((b.price || 0) - (a.price || 0)) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  /* ------------------------------------------------------ uploaded counts */

  /* The strip above the bench. Two states: no file, in which case it offers one
     and explains what will happen; or a file, in which case it says what came of
     it and offers the way back. There is no third state, because an upload that
     half-applied would be worse than one that failed. */
  function inventoryBar() {
    if (!INVENTORY) {
      var box = el("div", { class: "inv-bar" }, [
        el("div", {}, [
          el("b", { text: "These counts come from the Deck Master workbook." }),
          el("span", { text: " Upload what you actually own and the decks are filled from it "
            + "instead — whatever is left over lands here." })
        ]),
        el("label", { class: "btn primary inv-file" }, [
          "Upload what I own",
          el("input", { type: "file", accept: ".csv,.tsv,.txt,.xlsx,text/csv,text/plain",
            hidden: true, onchange: onInventoryFile })
        ])
      ]);
      return box;
    }
    var r = INVENTORY.result || {totals: {}};
    var t = r.totals || {};
    var when = String(INVENTORY.uploadedAt || "").slice(0, 10);
    return el("div", { class: "inv-bar is-on" }, [
      el("div", {}, [
        el("b", { text: plural(t.cards || 0, "card") + " from your upload" }),
        el("span", { text: " · " + plural(t.used || 0, "copy", "copies") + " went into decks · "
          + plural(t.spare || 0, "copy", "copies") + " on the bench"
          + (t.short ? " · " + plural(t.short, "copy", "copies") + " still needed" : "")
          + (when ? " · read " + when : "") })
      ]),
      el("div", { class: "inv-acts" }, [
        el("label", { class: "btn inv-file" }, [
          "Replace",
          el("input", { type: "file", accept: ".csv,.tsv,.txt,.xlsx,text/csv,text/plain",
            hidden: true, onchange: onInventoryFile })
        ]),
        el("button", { class: "btn ghost", type: "button", text: "Use the workbook's counts",
          onclick: clearInventory })
      ])
    ]);
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
            var sheet = (book.sheets || [])[0];
            if (!sheet || !sheet.rows.length) throw new Error("The first sheet is empty.");
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
      return toast("No cards were found in that file.");
    }
    INVENTORY = {cards: parsed.cards, uploadedAt: new Date().toISOString(), source: source};
    if (!saveInventory()) toast("This browser would not save it — it is here until you reload.");
    rebuild();
    var t = (INVENTORY.result || {totals: {}}).totals || {};
    // A guessed column layout is the one thing about this that could be silently
    // wrong, so it is said out loud rather than left in the count.
    toast(plural(t.cards || 0, "card") + " read"
      + (parsed.guessed ? " (columns were guessed)" : "")
      + " · " + plural(t.spare || 0, "copy", "copies") + " on the bench");
    go("#/bench");
    render();
  }

  function renderPicker(root, kind) {
    var isBench = kind === "bench";
    var all = isBench ? benchRows() : buyRows();
    var filter = isBench ? state.benchFilter : state.buyFilter;

    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: isBench ? "The bench" : "Still to buy" }),
      el("p", { text: isBench
        ? "Spare copies not committed to any of the decks. Tick what you want to move, then Share."
        : "Everything the decks still need, plus every upgrade not yet bought. Tick and Share." })
    ]));

    // The bench IS the leftover, so the upload that produces it belongs here.
    if (isBench) root.appendChild(inventoryBar());

    var chips = isBench
      ? [["all", "All"], ["spare", "Not in any deck"], ["dupe", "Spare copies"]]
      : [["all", "All"], ["need", "Needed now"], ["tuned", "Tuned"], ["b3", "Bracket 3"]];

    root.appendChild(el("div", { class: "toolbar" }, [
      el("input", { type: "search", placeholder: isBench ? "Search the bench" : "Search the buy list",
        value: state.query, oninput: function (e) { state.query = e.target.value; render(); } }),
      el("div", { class: "filter" }, chips.map(function (c) {
        return el("button", { type: "button", "aria-pressed": filter === c[0] ? "true" : "false",
          text: c[1], onclick: function () {
            if (isBench) state.benchFilter = c[0]; else state.buyFilter = c[0];
            render();
          } });
      }))
    ]));

    var rows = all.filter(matchesQuery).filter(function (r) {
      if (filter === "all") return true;
      if (isBench) return filter === "spare" ? r.where === "spare" : r.where !== "spare";
      return r.kind === filter;
    });

    if (!isBench) {
      var modes = [["price", "By price"], ["color", "By color"], ["kind", "By reason"]];
      root.appendChild(el("div", { class: "filter", style: "margin:-4px 0 10px" }, modes.map(function (m) {
        return el("button", { type: "button", "aria-pressed": state.buyGroup === m[0] ? "true" : "false",
          text: m[1], onclick: function () { state.buyGroup = m[0]; save(); render(); } });
      })));
      rows = regroupBuyRows(rows, state.buyGroup);
    }

    groupedTable(root, rows, {
      where: isBench ? "Where else" : "For which deck",
      status: "Status"
    });
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

    var bits = [
      [String(DATA.decks.length), "decks"],
      [String(boxed) + "/" + DATA.decks.reduce(function (n, d) { return n + (d.targetCards || 100); }, 0),
        "cards boxed"],
      [String(ordered), "on order"], [String(toBuy), "still to buy"],
      [money(buyCost), "to finish"], [String(bench), "bench copies"],
      [String(upgrades), "upgrades planned"]
    ];
    var row = el("div", { class: "ribbon" });
    bits.forEach(function (b, i) {
      if (i) row.appendChild(el("span", { class: "sep", text: "·" }));
      row.appendChild(el("span", {}, [el("b", { text: b[0] }), " " + b[1]]));
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
    }
    state.view = ["decks", "bench", "buy"].indexOf(parts[0]) >= 0 ? parts[0] : "decks";
    state.deck = null;
    state.query = "";
    render();
  }

  /* The ribbon and the two tab counts describe the whole catalog, so they are
     rebuilt on every render rather than once at boot -- adding or removing a
     deck changes all three, and a stale "6 decks" over seven is the kind of
     wrong that reads as a bug in the numbers themselves. */
  function renderCounts() {
    // "six Commander decks" stops being true the moment somebody adds a seventh.
    var sub = document.getElementById("brand-sub");
    if (sub && DATA.decks.some(function (d) { return d.imported; })) {
      sub.textContent = DATA.decks.length + " Commander decks, what they do, and what they still need";
    }
    var slot = document.getElementById("ribbon-slot");
    if (slot) { slot.textContent = ""; slot.appendChild(renderRibbon()); }
    var bench = document.getElementById("tab-bench");
    if (bench) bench.querySelector(".count").textContent = String(benchRows().length);
    var buy = document.getElementById("tab-buy");
    if (buy) buy.querySelector(".count").textContent = String(buyRows().length);
  }

  function render() {
    var root = document.getElementById("page");
    root.textContent = "";
    renderCounts();

    document.querySelectorAll(".tab").forEach(function (t) {
      var on = t.dataset.view === state.view || (state.view === "deck" && t.dataset.view === "decks");
      t.setAttribute("aria-selected", on ? "true" : "false");
    });

    if (state.view === "deck") renderDeck(root, state.deck);
    else if (state.view === "bench") renderPicker(root, "bench");
    else if (state.view === "buy") renderPicker(root, "buy");
    else renderDecks(root);

    syncTray();
    if (state.view !== "deck") window.scrollTo(0, 0);
  }

  /* --------------------------------------------------------------- start */

  function fetchJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + " → " + r.status);
      return r.json();
    });
  }

  function boot() {
    load();
    fetchJson("data/master-v2.json?v=1").then(function (master) {
      MASTER = master;
      // Decks added on this device are read before the first render, so an
      // added deck is on the page at load rather than appearing a beat later.
      IMPORTS = Store ? Store.read(window.localStorage) : [];
      loadInventory();
      rebuild();
      // The ratings and the guides are generated separately and may lag; the
      // page is fully usable without either, so a miss is not an error.
      return Promise.all([
        fetchJson("data/deck-ratings.json?v=1").catch(function () { return null; }),
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
      window.addEventListener("hashchange", function () { closeCard(); route(); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && document.getElementById("sheet")) closeCard();
      });
      route();
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
