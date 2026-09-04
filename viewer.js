/* Trey's Commander Decks — the fast view.
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

  var STORE = "mtg-viewer.v1";
  var state = {
    view: "decks",
    deck: null,
    picks: new Map(),     // "<source>|<name>" -> {name, price, source, where}
    shareTo: "",
    query: "",
    benchFilter: "all",
    buyFilter: "all"
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
    return { rows: rows, tally: tally, toBuyCost: cost, total: 100 };
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

  function guideFor(id) {
    if (!GUIDES) return null;
    return (GUIDES.decks || []).filter(function (g) { return g.id === id; })[0] || null;
  }

  function swapsFor(id) {
    if (!SWAPS) return null;
    return (SWAPS.decks || []).filter(function (s) { return s.id === id; })[0] || null;
  }

  function ratingFor(id) {
    if (!RATINGS) return null;
    return (RATINGS.decks || []).filter(function (r) { return r.id === id; })[0] || null;
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
    return el("div", { class: "ready" }, [
      el("div", { class: "ready-bar" }, [
        el("i", { class: "have", style: "width:" + box + "%" }),
        el("i", { class: "order", style: "width:" + coming + "%" })
      ]),
      el("span", { class: "ready-label" }, [
        el("b", { text: box + "/100" }), " boxed"
      ])
    ]);
  }

  /* --------------------------------------------------------------- decks  */

  function renderDecks(root) {
    var decks = orderedDecks();

    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: "The six decks" }),
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
          (deck.label + " — " + plural(stats.tally.box, "card") + " of the hundred already boxed.") }),
        el("div", { class: "meta-row" }, meta),
        readyBar(stats)
      ]));
    });
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
      }, [thumb, el("span", { class: "k", text: "Commander" })]);
      thumb.addEventListener("error", function () { thumb.remove(); });
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

  /* What the optimiser would change, and what it costs. Shown as a
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

    var stats1 = [
      { k: "Boxed", v: stats.tally.box + "/100", n: stats.tally.box === 100 ? "ready to play" : "of the plan" },
      { k: "Lands", v: String(shape.lands) },
      { k: "Avg cost", v: shape.avgMv.toFixed(2), n: "mana value" }
    ];
    if (rating && rating.builds && rating.builds.v1) {
      stats1.unshift({ k: "Score", v: rating.builds.v1.score.toFixed(1),
        n: "rank " + (rating.rank ? rating.rank.v1 : deck._rank) + " of 6" });
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
      rows.push({
        source: "To Buy", name: name, price: price, copies: copies || 1,
        sub: sub, where: deckLabel ? "for " + deckLabel : "",
        status: gc ? "Game Changer" : meta.status,
        chip: gc ? "amber" : meta.chip, kind: kind, group: meta.group
      });
    }

    // Holes in a deck's current plan.
    DATA.cards.forEach(function (c) {
      if (c.buyCount <= 0) return;
      var p = plan[c.name];
      var wants = DATA.decks.filter(function (d) { return (c.target[d.id] || 0) > 0; })
        .map(function (d) { return d.label; });
      push(c.name, c.price, c.buyCount, p ? p.kind : "need",
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

  function renderPicker(root, kind) {
    var isBench = kind === "bench";
    var all = isBench ? benchRows() : buyRows();
    var filter = isBench ? state.benchFilter : state.buyFilter;

    root.appendChild(el("div", { class: "section-head" }, [
      el("h2", { text: isBench ? "The bench" : "Still to buy" }),
      el("p", { text: isBench
        ? "Spare copies not committed to any of the six decks. Tick what you want to move, then Share."
        : "Everything the six decks still need, plus every upgrade not yet bought. Tick and Share." })
    ]));

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
      ["6", "decks"], [String(boxed) + "/600", "cards boxed"],
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

  function render() {
    var root = document.getElementById("page");
    root.textContent = "";

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
      DATA = master;
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

      document.getElementById("ribbon-slot").appendChild(renderRibbon());
      document.getElementById("tab-bench").querySelector(".count").textContent =
        String(benchRows().length);
      document.getElementById("tab-buy").querySelector(".count").textContent =
        String(buyRows().length);

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
