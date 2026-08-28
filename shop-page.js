/**
 * Shop page - the same slots, re-keyed by card name and merged across all six decks.
 *
 * That re-key is the only real difference from the Deck page: there a row is a slot,
 * here a row is a card you have to find. Basics collapse the opposite way (Forest x25
 * across six decks, not x11 in one), and every seller-facing dimension is available
 * three ways at once - as a column, as a multi-select filter, and as a grouping.
 *
 * Table and gallery are two renderings of one filtered, sorted, grouped list; group-by
 * applies to both, and in the table it becomes bands with sorting inside each band.
 */
(function (root, factory) {
  "use strict";
  const req = (typeof module === "object" && module.exports && typeof require === "function") ? require : null;
  const Slot = req ? req("./slot-model.js") : root && root.MtgSlotModel;
  const api = factory(Slot);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgShopPage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Slot) {
  "use strict";

  if (!Slot) throw new Error("Shop page requires the slot model");

  const COLOR_LABEL = {W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", M: "Multicolor", C: "Colorless"};
  const COLOR_HEX = {W: "#f4efdc", U: "#a9c9e0", B: "#9a94a3", R: "#dda291", G: "#a6c3a4", M: "#e3ce8f", C: "#cfc8bb"};
  const RARITY_KEY = {common: "C", uncommon: "U", rare: "R", special: "S", mythic: "M", bonus: "B"};
  const STATUS = ["Not in hand", "Ordered", "Partly here", "In hand"];

  const COLUMNS = [
    {key: "status", label: "Status", sortable: false},
    {key: "name", label: "Card"},
    {key: "decks", label: "Decks"},
    {key: "color", label: "Color"},
    {key: "type", label: "Type"},
    {key: "rarity", label: "Rarity"},
    {key: "band", label: "Price band"},
    {key: "spot", label: "Where"},
    {key: "price", label: "Target"},
    {key: "paid", label: "Paid"},
    {key: "lineTotal", label: "Line"}
  ];
  const FILTERS = [
    {key: "status", label: "Status"}, {key: "color", label: "Color"}, {key: "type", label: "Type"},
    {key: "band", label: "Price"}, {key: "spot", label: "Where"}, {key: "rarity", label: "Rarity"},
    {key: "deck", label: "Deck"}, {key: "rung", label: "Rung"}
  ];
  /* Set and Letter are here because that is how a vendor's singles are filed -- a box per
     set, or one long alphabetical run -- and matching the app's order to the box in front
     of you is the difference between scanning and searching. */
  const GROUP_BY = [
    ["none", "No grouping"], ["letter", "First letter"], ["setName", "Set"],
    ["spot", "Where at the table"], ["band", "Price band"],
    ["color", "Color"], ["type", "Type"], ["rarity", "Rarity"], ["deck", "Deck"], ["status", "Status"]
  ];

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  }
  function money(n) { return Number.isFinite(Number(n)) ? "$" + Number(n).toFixed(2) : "—"; }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /** What one copy costs: what you paid if you have said, the target estimate if not. */
  function unitCost(row, paid) {
    return paid === null || paid === undefined ? Number(row.price) || 0 : Number(paid) || 0;
  }

  /* A price nobody has is not a price of nothing. Zero reaches here two ways -- a plan
     entry that was never priced, and a catalog miss -- and printing "$0.00" against a card
     at a seller's table would have you handing over a common's worth for a ten-dollar
     card. Say what is true instead: we do not know. */
  function isPriced(row, paid) {
    if (paid !== null && paid !== undefined) return true;
    return Number(row.price) > 0;
  }

  function colorKey(colorIdentity) {
    const ci = Array.isArray(colorIdentity) ? colorIdentity : [];
    if (!ci.length) return "C";
    if (ci.length > 1) return "M";
    return ci[0];
  }

  /** Decorate the model's shop rows with the facts a seller's table is organised by.
   *  Name normalisation belongs to the caller, which already owns the lineup model. */
  function decorate(rows, factFor, deckLabels, paidFor) {
    const lookup = typeof factFor === "function" ? factFor : () => ({});
    const paidLookup = typeof paidFor === "function" ? paidFor : () => null;
    return rows.map((row) => {
      const fact = lookup(row.name) || {};
      const ck = colorKey(fact.colorIdentity);
      return Object.assign({}, row, {
        colorKey: ck,
        color: COLOR_LABEL[ck],
        rarity: (fact.rarity || "common").replace(/^./, (c) => c.toUpperCase()),
        rarityKey: RARITY_KEY[fact.rarity] || "C",
        setName: fact.setName || "",
        /* The slot's `type` is the job the slot does, which is the right label on a deck
           list and the wrong one in a shop: a Land slot filled by Abrupt Decay would have
           you looking for it in the wrong box. This is what the card actually is. */
        cardType: fact.typeLine ? Slot.cardType(fact) : "",
        image: fact.image || "",
        oracleText: fact.oracleText || "",
        deckNames: (row.decks || []).map((d) => (deckLabels || {})[d] || d),
        /* What the row costs, not what one copy costs. A price you typed wins over the
           target estimate, and a row standing for twelve copies costs twelve times it --
           the same rule the Deck page's slot rows use, so the two never disagree. */
        lineTotal: unitCost(row, paidLookup(row.name)) * row.quantity,
        // What it cost, not what it is worth. null is unpriced; 0 is a real answer.
        paid: paidLookup(row.name),
        rung: (row.rungs || []).map((r) => Slot.RUNG_LABEL[r] || r).join(", ")
      });
    });
  }

  function values(rows, key) {
    if (key === "band") return Slot.PRICE_BANDS.slice();
    if (key === "spot") return Slot.SPOTS.slice();
    if (key === "status") return STATUS.slice();
    const set = new Set();
    rows.forEach((r) => {
      if (key === "deck") (r.deckNames || []).forEach((d) => set.add(d));
      else if (key === "rung") (r.rungs || []).forEach((g) => set.add(Slot.RUNG_LABEL[g] || g));
      else if (r[key]) set.add(r[key]);
    });
    return Array.from(set).sort();
  }

  function passes(row, f) {
    const any = (key, value) => !f[key] || !f[key].length || f[key].indexOf(value) >= 0;
    const anyOf = (key, list) => !f[key] || !f[key].length || (list || []).some((v) => f[key].indexOf(v) >= 0);
    if (!any("status", row.acquisition)) return false;
    if (!any("color", row.color)) return false;
    if (!any("type", row.type)) return false;
    if (!any("band", row.band)) return false;
    if (!any("spot", row.spot)) return false;
    if (!any("rarity", row.rarity)) return false;
    if (!anyOf("deck", row.deckNames)) return false;
    if (!anyOf("rung", (row.rungs || []).map((g) => Slot.RUNG_LABEL[g] || g))) return false;
    if (f.query) {
      const q = f.query.toLowerCase();
      if (!(row.name.toLowerCase().indexOf(q) >= 0 || (row.type || "").toLowerCase().indexOf(q) >= 0
        || (row.setName || "").toLowerCase().indexOf(q) >= 0)) return false;
    }
    return true;
  }

  function sortValue(row, key) {
    if (key === "decks") return (row.deckNames || []).join(",");
    if (key === "setName") return row.setName || "";
    if (key === "band") return Slot.PRICE_BANDS.indexOf(row.band);
    if (key === "spot") return Slot.SPOTS.indexOf(row.spot);
    if (key === "price") return row.price == null ? -1 : row.price;
    // Unpriced sorts below every real figure, including a genuine zero.
    if (key === "paid") return row.paid == null ? -1 : row.paid;
    if (key === "lineTotal") return row.lineTotal;
    return row[key] == null ? "" : row[key];
  }
  function sortRows(rows, key, dir) {
    const sign = dir === "desc" ? -1 : 1;
    return rows.slice().sort((a, b) => {
      const x = sortValue(a, key), y = sortValue(b, key);
      if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
      return String(x).localeCompare(String(y)) * sign || String(a.name).localeCompare(String(b.name));
    });
  }
  /** The drawer a card would be filed in: its first letter, with digits and symbols
   *  swept into one bucket the way a shop's box divider does. */
  function letterOf(name) {
    const c = String(name || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  }

  function groupRows(rows, groupBy) {
    if (!groupBy || groupBy === "none") return [["", rows]];
    const map = new Map();
    rows.forEach((r) => {
      const g = groupBy === "deck" ? (r.deckNames || []).join(" + ")
        : groupBy === "status" ? r.acquisition
        : groupBy === "letter" ? letterOf(r.name)
        : groupBy === "setName" ? (r.setName || "No set")
        : (r[groupBy] || "No price yet");
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(r);
    });
    let order = Array.from(map.keys());
    if (groupBy === "band") order.sort((a, b) => Slot.PRICE_BANDS.indexOf(a) - Slot.PRICE_BANDS.indexOf(b));
    else if (groupBy === "spot") order.sort((a, b) => Slot.SPOTS.indexOf(a) - Slot.SPOTS.indexOf(b));
    else if (groupBy === "status") order.sort((a, b) => STATUS.indexOf(a) - STATUS.indexOf(b));
    else order.sort();
    // Cards we have no price for are a to-do, not a shelf; they sort last either way.
    const unpriced = order.indexOf("No price yet");
    if (unpriced > -1) order.push(order.splice(unpriced, 1)[0]);
    return order.map((g) => [g, map.get(g)]);
  }

  /* ---------------- pieces ---------------- */
  /* Type what you paid. Committed on change rather than on every keystroke, so a
     half-typed "1" never lands as a dollar. */
  function paidInput(row) {
    return `<span class="sp-paid${row.paid === null ? "" : " is-set"}">
      <input type="text" inputmode="decimal" data-sp-paid="${esc(row.key)}"
        value="${row.paid === null ? "" : Number(row.paid).toFixed(2)}" placeholder="—"
        aria-label="What you paid for ${esc(row.name)}"></span>`;
  }

  function triMarkup(row) {
    const many = row.quantity > 1;
    const on = (k) => k === "need" ? (row.need > 0 && !row.inHand && !row.ordered)
      : k === "ordered" ? (row.ordered > 0 && row.inHand < row.quantity)
      : row.inHand > 0;
    return `<span class="sp-tri" data-sp-tri="${esc(row.key)}">
      <button type="button" data-sp-s="need" aria-pressed="${on("need")}">Need${many ? " " + row.need : ""}</button>
      <button type="button" data-sp-s="ordered" aria-pressed="${on("ordered")}">Ordered${many ? " " + row.ordered : ""}</button>
      <button type="button" data-sp-s="hand" aria-pressed="${on("hand")}">In hand${many ? ` ${row.inHand}/${row.quantity}` : ""}</button>
    </span>`;
  }
  function bandHeader(name, list, colSpan) {
    const owed = list.reduce((sum, r) => sum + unitCost(r, r.paid) * r.need, 0);
    const inner = `<span class="sp-band-nm">${esc(name)}</span><span class="sp-band-ct">${
      plural(list.length, "card")} · ${money(owed)} still to buy</span>`;
    return colSpan ? `<tr class="sp-band"><td colspan="${colSpan}">${inner}</td></tr>`
                   : `<div class="sp-band">${inner}</div>`;
  }
  function cell(row, key) {
    switch (key) {
      case "status": return triMarkup(row);
      case "name": return `<span class="sp-nm">${esc(row.name)}</span>${
        row.quantity > 1 ? ` <span class="sp-qty dp-num">×${row.quantity}</span>` : ""}`;
      case "decks": return (row.deckNames || []).map((d) => `<span class="sp-chip">${esc(d)}</span>`).join("");
      case "color": return `<span class="sp-dot" style="background:${COLOR_HEX[row.colorKey]}"></span>${esc(row.color)}`;
      case "rarity": return `<span class="sp-dot is-ring" style="--rar:var(--rar-${row.rarityKey})"></span>${esc(row.rarity)}`;
      case "band": return `<span class="sp-pill dp-num">${esc(row.band || "no price")}</span>`;
      case "spot": return esc(row.spot || "no price");
      case "price": return `<span class="dp-num${row.need ? " is-buy" : ""}">${money(row.price)}</span>`;
      case "paid": return paidInput(row);
      case "lineTotal": return `<span class="dp-num"${
        row.quantity > 1 ? ` title="${money(unitCost(row, row.paid))} each &times; ${row.quantity}"` : ""
      }>${money(row.lineTotal)}</span>`;
      default: return esc(row[key] || "");
    }
  }

  /**
   * The Bench is what you own that is in no box. Each card offers the best slot it
   * could fill in each deck, tagged with the rung it would occupy, and - the fact
   * that actually decides the trade - the state of the card it would replace.
   */
  /* Cards reach the Bench two ways: pushed out of a deck, or picked up in a shop and
     typed in here. The intake sits above the cards in both the empty and full states,
     because "I just bought this and it has no home" is exactly when the Bench is empty. */
  function benchIntakeMarkup(open) {
    return `<div class="sp-intake" data-sp-intake data-open="${open ? 1 : 0}">
      <div class="sp-intake-hd">
        <button type="button" class="sp-intake-go" data-sp-intake-toggle aria-expanded="${Boolean(open)}">
          ${open ? "\u00d7 Close" : "+ Add card to Bench"}</button>
        <span class="sp-intake-note">A TCGplayer link or just the card name. One per line.</span>
      </div>
      ${open ? `<div class="sp-intake-body">
        <textarea data-sp-intake-input rows="3" aria-label="TCGplayer links or card names to add to the Bench"
          placeholder="https://www.tcgplayer.com/product/&#10;Solemn Simulacrum"></textarea>
        <div class="sp-intake-actions">
          <button type="button" class="sp-intake-go" data-sp-intake-submit>Look up and add</button>
          <span class="sp-intake-status" data-sp-intake-status aria-live="polite"></span>
        </div>
      </div>` : ""}
    </div>`;
  }

  function benchMarkup(ctx) {
    const items = ctx.bench || [];
    const intake = benchIntakeMarkup(ctx.intakeOpen);
    if (!items.length) {
      return `${intake}<p class="sp-empty">Nothing on the Bench. Cards land here when you own them but have not
        put them in any deck's box.</p>`;
    }
    return `${intake}<div class="sp-bench">${items.map((item) => {
      const opts = item.destinations || [];
      const chosen = opts[0];
      return `<article class="sp-bcard" style="--rar:var(--rar-${item.rarityKey || "C"})">
        <div class="sp-bhead">
          ${item.image ? `<img class="sp-bart" src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`
                       : `<div class="sp-bart sp-art-blank"><span>${esc(item.name)}</span></div>`}
          <div><div class="sp-nm">${esc(item.name)}</div>
            <div class="sp-meta">${esc(item.typeLine || "")}</div>
            <div class="sp-meta"><span class="sp-pill dp-num">${money(item.price)}</span>
              <span class="sp-pill">${esc(item.spot || "no price")}</span></div>
            <div class="sp-meta">${item.roles && item.roles.length
              ? esc(item.roles.join(" · "))
              : "No role in any of the six decks"}</div>
          </div>
        </div>
        ${opts.length ? `
          <label class="sp-lab" for="sp-dest-${esc(item.key)}">Best slot per deck</label>
          <select class="sp-sel sp-dest" id="sp-dest-${esc(item.key)}" data-sp-dest="${esc(item.key)}">
            ${opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join("")}
          </select>
          ${destDetail(chosen)}
          <button type="button" class="sp-assign" data-sp-assign="${esc(item.key)}|0">Assign · ${esc(chosen.action)}</button>
        ` : `<p class="sp-meta">No legal slot in any deck: colour identity, singleton or bracket rules rule it out.</p>`}
      </article>`;
    }).join("")}</div>`;
  }

  function destDetail(d) {
    if (!d) return "";
    const r = d.replaced || {};
    const consequence = r.kind === "buy"
      ? `<b>Saves ${money(r.price)}</b> — you no longer have to buy it.`
      : r.kind === "ordered"
        ? "Already paid for; it will arrive with no slot."
        : r.kind === "active"
          ? "Frees a physical card — it moves to the Bench."
          : "That card is owned and already off-box.";
    return `<div class="sp-tags">
        <span class="sp-tag ${d.rung ? "is-rung" : ""}">${d.rung ? "Slots as " + esc(d.rung) : "Ad-hoc transfer"}</span>
        ${(d.reasons || []).map((x) => `<span class="sp-tag">${esc(x)}</span>`).join("")}
      </div>
      <div class="sp-repl"><b>Replacing</b>${esc(r.name || "an empty slot")}
        ${r.label ? ` · <span class="dp-loc is-${esc(r.kind)}"><span class="dp-g">${esc(r.glyph || "")}</span>${esc(r.label)}</span>` : ""}
        <div>${consequence}</div></div>`;
  }

  /* ---------------- Store: the view for when you are standing at a booth ----------------
   *
   * Everything else on this page is for deciding what to buy. This one is for the ten
   * seconds after you have already decided: you are holding a card, flipping through a
   * seller's box, and the only questions are "is this on my list" and "how much should it
   * be". So the row carries a name you can read at arm's length, the money, and one big
   * target you can hit without looking -- and nothing else. Four rows fit on a phone in
   * the table view; twelve fit here, which is the whole point.
   *
   * Rows you have picked up stay where they are, struck through with an Undo, rather than
   * vanishing: a row that disappears under your thumb is indistinguishable from a mistap,
   * and it takes the place you were reading with it.
   */
  function storeMarkup(groups, done, groupBy) {
    if (!groups.length) return '<p class="sp-empty">Nothing left on the list. Either the filters are too tight, or you are done.</p>';
    return groups.map(([name, list]) => {
      const owe = list.filter((r) => !done.has(r.key));
      const money_ = owe.reduce((n, r) => n + unitCost(r, r.paid) * r.need, 0);
      return `<section class="sp-store-grp">${name ? `<h3 class="sp-store-h">
          <span class="sp-store-hn">${esc(name)}</span>
          <span class="sp-store-hc">${owe.length ? `${plural(owe.length, "card")} · ${money(money_)}` : "all picked up"}</span>
        </h3>` : ""}
        <ul class="sp-store-list">${list.map((r) => storeRow(r, done.has(r.key), groupBy)).join("")}</ul>
      </section>`;
    }).join("");
  }

  function storeRow(r, picked, groupBy) {
    /* What is still owed, not what the deck asks for. A row of two Arcane Signets with one
       already in the box is one card to find, and labelling it "x2" sends you looking for
       a copy you have. */
    const many = r.need > 1;
    if (picked) {
      return `<li class="sp-store-row is-got" data-sp-row="${esc(r.key)}">
        <span class="sp-store-tick">✓</span>
        <span class="sp-store-body"><span class="sp-store-nm">${esc(r.name)}</span></span>
        <button type="button" class="sp-undo" data-sp-unbuy="${esc(r.key)}">Undo</button>
      </li>`;
    }
    /* What you expect to pay, so a seller's sticker can be judged without doing sums.
       The line is the row's price; the unit rides along only when they differ. */
    const line = unitCost(r, r.paid) * r.need;
    /* Above a few dollars the seller's sticker is worth reading carefully; below it, it is
       not. Marking the row is what lets a page of near-identical commons be skimmed and
       the two cards that matter still catch the eye. */
    const known = isPriced(r, r.paid);
    const dear = known && line >= 5;
    return `<li class="sp-store-row${dear ? " is-dear" : ""}" data-sp-row="${esc(r.key)}">
      <span class="sp-store-dot" style="background:${COLOR_HEX[r.colorKey]}" title="${esc(r.color)}"></span>
      <span class="sp-store-body">
        <span class="sp-store-nm">${esc(r.name)}${many ? ` <span class="sp-qty dp-num">×${r.need}</span>` : ""}</span>
        <span class="sp-store-sub">${[
          esc(r.cardType || r.type || ""),
          /* Which decks want it comes before which set it is from: the decks decide
             whether a card at a bad price is still worth taking, and the set is usually
             already the divider you are standing in front of. */
          (r.deckNames || []).length ? (r.deckNames || []).map((d) => esc(d)).join(" ") : "",
          groupBy === "setName" ? "" : esc(r.setName || "")
        ].filter(Boolean).join(" · ")}</span>
      </span>
      <span class="sp-store-money${dear ? " is-dear" : ""}${known ? "" : " is-unpriced"}">
        <b class="dp-num">${known ? money(line) : "?"}</b>${
          known && many ? `<span class="sp-store-ea">${money(unitCost(r, r.paid))} ea</span>` : ""}${
          known ? "" : '<span class="sp-store-ea">no price</span>'}
      </span>
      <button type="button" class="sp-buy" data-sp-buy="${esc(r.key)}">Buy${many ? " " + r.need : ""}</button>
    </li>`;
  }

  function render(host, ctx) {
    if (!host) return;
    const f = ctx.filters || {};
    const all = decorate(ctx.rows || [], ctx.factFor, ctx.deckLabels, ctx.paidFor);
    const done = ctx.picked instanceof Set ? ctx.picked : new Set();
    /* The Store view answers one question -- what is still on the list -- so it starts
       from what you still owe rather than from everything. A card picked up in this
       sitting stays visible so the tick can be taken back; one bought last week does not. */
    const inStore = f.view === "store";
    const scope = inStore && !f.storeAll ? all.filter((r) => r.need > 0 || done.has(r.key)) : all;
    const kept = scope.filter((r) => passes(r, f));
    const groups = groupRows(sortRows(kept, f.sortKey || "name", f.sortDir || "asc"), f.groupBy);

    const owedCards = kept.reduce((n, r) => n + r.need, 0);
    const owedValue = kept.reduce((n, r) => n + unitCost(r, r.paid) * r.need, 0);
    // Counted over every row, not the filtered ones: "what has this cost me" is a
    // question about the collection, and a filter is not meant to change the answer.
    // What was actually spent, so a row of twelve Plains counts twelve times, not once.
    const paidTotal = all.reduce((n, r) => n + (r.paid === null ? 0 : r.paid * r.quantity), 0);
    const paidCount = all.filter((r) => r.paid !== null).length;

    const chips = [];
    FILTERS.forEach((flt) => (f[flt.key] || []).forEach((v) => chips.push(
      `<span class="sp-fchip">${esc(flt.label)}: ${esc(v)}<button type="button" data-sp-unchip="${esc(flt.key)}|${esc(v)}" aria-label="Remove">×</button></span>`)));

    /* On a phone this whole bar used to sit between you and the one thing you came here
       to do, which is tell the app you bought a card. Nothing is removed -- every filter,
       the grouping, the sort and the totals are all still here on a phone exactly as they
       are on a desktop -- but the options fold behind one button, and what stays out is
       the row that picks the view and the line that says what you still owe. */
    const activeFilters = FILTERS.reduce((n, flt) => n + (f[flt.key] || []).length, 0) + (f.query ? 1 : 0);
    const bar = `<div class="sp-bar" data-open="${f.barOpen ? 1 : 0}">
      <div class="sp-frow sp-frow-nav">
        <span class="sp-seg">
          <button type="button" data-sp-view="table" aria-pressed="${f.view === "table"}">\u2630 Table</button>
          <button type="button" data-sp-view="gallery" aria-pressed="${f.view === "gallery"}">\u25a6 Gallery</button>
          <button type="button" data-sp-view="bench" aria-pressed="${f.view === "bench"}">\u25c7 Bench${
            (ctx.bench || []).length ? " " + (ctx.bench || []).length : ""}</button>
          <button type="button" data-sp-view="store" aria-pressed="${f.view === "store"}">\u25c9 Store</button>
        </span>
        <button type="button" class="sp-mob" data-sp-mob aria-expanded="${Boolean(f.barOpen)}">
          ${f.barOpen ? "Hide options" : "Filter, group, sort"}${
            activeFilters ? `<span class="sp-cnt dp-num">${activeFilters}</span>` : '<span class="sp-caret">\u25be</span>'}
        </button>
      </div>
      <div class="sp-bar-body">
      <div class="sp-frow">
        ${FILTERS.map((flt) => {
          const n = (f[flt.key] || []).length;
          return `<span class="sp-drop">
            <button type="button" class="sp-fbtn" data-sp-drop="${esc(flt.key)}" data-on="${n ? 1 : 0}">${esc(flt.label)}${
              n ? `<span class="sp-cnt dp-num">${n}</span>` : '<span class="sp-caret">▾</span>'}</button>
            <div class="sp-pop" id="sp-pop-${esc(flt.key)}" hidden>
              ${values(all, flt.key).map((v) => `<label><input type="checkbox" data-sp-chk="${esc(flt.key)}|${esc(v)}"${
                (f[flt.key] || []).indexOf(v) >= 0 ? " checked" : ""}>${esc(v)}</label>`).join("")}
              <div class="sp-pop-foot"><button type="button" data-sp-all="${esc(flt.key)}">Select all</button><button type="button" data-sp-none="${esc(flt.key)}">Clear</button></div>
            </div></span>`;
        }).join("")}
        <input class="sp-q" id="sp-q" type="search" placeholder="Search cards…" aria-label="Search cards" value="${esc(f.query || "")}">
      </div>
      <div class="sp-frow">
        <span class="sp-lab">Group by</span>
        <select class="sp-sel" id="sp-group">${GROUP_BY.map(([v, l]) =>
          `<option value="${v}"${f.groupBy === v ? " selected" : ""}>${l}</option>`).join("")}</select>
        ${f.view === "gallery" ? `<span class="sp-lab">Sort</span><select class="sp-sel" id="sp-sort">${
          COLUMNS.filter((c) => c.sortable !== false).map((c) =>
            `<option value="${c.key}"${f.sortKey === c.key ? " selected" : ""}>${c.label}</option>`).join("")}</select>` : ""}
      </div>
      ${chips.length ? `<div class="sp-frow"><div class="sp-chips">${chips.join("")}<button type="button" class="sp-mini" data-sp-clear="1">Clear all filters</button></div></div>` : ""}
      </div>
      <div class="sp-frow sp-frow-tot">
        <span class="sp-tot"><b class="dp-num">${owedCards}</b> still to buy · <b class="dp-num">${money(owedValue)}</b></span>
        <span class="sp-tot sp-paid-tot" data-sp-paid-total><b class="dp-num">${money(paidTotal)}</b> paid · ${paidCount}/${all.length} priced</span>
      </div>
    </div>`;

    if (f.view === "bench") { host.innerHTML = bar + benchMarkup(ctx); return; }

    /* The Store gets its own bar. Everything on the general one is a decision aid, and at
       a booth there are no decisions left to make -- so what stays out is a search box you
       can reach without a tap, the two controls that make the app's order match the box in
       front of you, and the count of what is left. The full filter set is still one tap
       away behind the same button as everywhere else. */
    if (inStore) {
      const left = kept.filter((r) => !done.has(r.key));
      const leftCards = left.reduce((n, r) => n + r.need, 0);
      const leftValue = left.reduce((n, r) => n + unitCost(r, r.paid) * r.need, 0);
      const gotHere = kept.length - left.length;
      const storeBar = `<div class="sp-store-bar" data-open="${f.barOpen ? 1 : 0}">
        <div class="sp-store-top">
          <span class="sp-seg sp-seg-sm">
            <button type="button" data-sp-view="table" aria-pressed="false">\u2630</button>
            <button type="button" data-sp-view="gallery" aria-pressed="false">\u25a6</button>
            <button type="button" data-sp-view="store" aria-pressed="true">\u25c9 Store</button>
          </span>
          <span class="sp-store-count"><b class="dp-num">${leftCards}</b> to find · <b class="dp-num">${money(leftValue)}</b>${
            gotHere ? ` · <span class="sp-store-got">${gotHere} picked up</span>` : ""}</span>
        </div>
        <div class="sp-store-top">
          <input class="sp-q sp-store-q" id="sp-q" type="search" placeholder="Type a card name\u2026" aria-label="Search cards" value="${esc(f.query || "")}">
        </div>
        <div class="sp-store-top">
          <span class="sp-lab">In the box by</span>
          <select class="sp-sel" id="sp-group" aria-label="Group the list the way the seller's cards are filed">${
            GROUP_BY.map(([v, l]) => `<option value="${v}"${f.groupBy === v ? " selected" : ""}>${l}</option>`).join("")}</select>
          <span class="sp-lab">then</span>
          <select class="sp-sel" id="sp-sort" aria-label="Sort within each group">${
            COLUMNS.filter((c) => c.sortable !== false).map((c) =>
              `<option value="${c.key}"${f.sortKey === c.key ? " selected" : ""}>${c.label}</option>`).join("")}</select>
          <button type="button" class="sp-mini" data-sp-storeall aria-pressed="${Boolean(f.storeAll)}">${
            f.storeAll ? "Only what I need" : "Show everything"}</button>
          <button type="button" class="sp-mini" data-sp-mob aria-expanded="${Boolean(f.barOpen)}">Filters${
            activeFilters ? `<span class="sp-cnt dp-num">${activeFilters}</span>` : ""}</button>
        </div>
        ${f.barOpen ? `<div class="sp-store-filters"><div class="sp-frow">${FILTERS.map((flt) => {
          const n = (f[flt.key] || []).length;
          return `<span class="sp-drop">
            <button type="button" class="sp-fbtn" data-sp-drop="${esc(flt.key)}" data-on="${n ? 1 : 0}">${esc(flt.label)}${
              n ? `<span class="sp-cnt dp-num">${n}</span>` : '<span class="sp-caret">▾</span>'}</button>
            <div class="sp-pop" id="sp-pop-${esc(flt.key)}" hidden>
              ${values(all, flt.key).map((v) => `<label><input type="checkbox" data-sp-chk="${esc(flt.key)}|${esc(v)}"${
                (f[flt.key] || []).indexOf(v) >= 0 ? " checked" : ""}>${esc(v)}</label>`).join("")}
              <div class="sp-pop-foot"><button type="button" data-sp-all="${esc(flt.key)}">Select all</button><button type="button" data-sp-none="${esc(flt.key)}">Clear</button></div>
            </div></span>`;
        }).join("")}${chips.length ? `<button type="button" class="sp-mini" data-sp-clear="1">Clear all</button>` : ""}</div></div>` : ""}
      </div>`;
      host.innerHTML = storeBar + `<div class="sp-store">${storeMarkup(groups, done, f.groupBy)}</div>`;
      return;
    }


    if (!kept.length) {
      host.innerHTML = bar + '<p class="sp-empty">Nothing matches those filters.</p>';
      return;
    }

    let body;
    if (f.view === "gallery") {
      body = groups.map(([name, list]) => `<section class="sp-group">${
        name ? bandHeader(name, list, 0) : ""}<div class="sp-gal">${list.map((r) => `
          <article class="sp-card" style="--rar:var(--rar-${r.rarityKey})" data-sp-row="${esc(r.key)}">
            ${r.image ? `<img class="sp-art" src="${esc(Slot.cardImage(r.image, "normal"))}" alt="${esc(r.name)}" loading="lazy">`
                      : `<div class="sp-art sp-art-blank"><span>${esc(r.name)}</span></div>`}
            <div class="sp-cbody">
              <div class="sp-nm">${esc(r.name)}${r.quantity > 1 ? ` <span class="sp-qty dp-num">×${r.quantity}</span>` : ""}</div>
              <div class="sp-meta"><span class="sp-dot" style="background:${COLOR_HEX[r.colorKey]}"></span>${esc(r.color)} · ${esc(r.type)} · ${esc(r.rarity)}</div>
              <div class="sp-meta">${(r.deckNames || []).map((d) => `<span class="sp-chip">${esc(d)}</span>`).join("")}<span class="sp-pill dp-num">${esc(r.band || "—")}</span></div>
              <div class="sp-foot"><span class="dp-num${r.need ? " is-buy" : ""}"${
                r.quantity > 1 ? ` title="${money(unitCost(r, r.paid))} each &times; ${r.quantity}"` : ""
              }>${money(r.lineTotal)}</span><span class="sp-where">${esc(r.spot || "—")}</span></div>
              <div class="sp-foot"><span class="sp-lab">Paid</span>${paidInput(r)}</div>
              ${triMarkup(r)}
            </div></article>`).join("")}</div></section>`).join("");
    } else {
      const head = COLUMNS.map((c) => {
        if (c.sortable === false) return `<th>${esc(c.label)}</th>`;
        const on = (f.sortKey || "name") === c.key;
        return `<th><button type="button" data-sp-sort="${c.key}">${esc(c.label)}${
          on ? `<span class="sp-ar">${(f.sortDir || "asc") === "asc" ? "▲" : "▼"}</span>` : ""}</button></th>`;
      }).join("");
      body = `<div class="sp-tw"><table class="sp-table"><thead><tr>${head}</tr></thead><tbody>${
        groups.map(([name, list]) => (name ? bandHeader(name, list, COLUMNS.length) : "")
          + list.map((r) => `<tr data-sp-row="${esc(r.key)}">${
            COLUMNS.map((c) => `<td data-k="${c.key}" data-lab="${esc(c.label)}">${cell(r, c.key)}</td>`).join("")}</tr>`).join("")).join("")
      }</tbody></table></div>`;
    }
    host.innerHTML = bar + body;
  }

  return {render, decorate, passes, sortRows, groupRows, values, benchMarkup, destDetail,
          COLUMNS, FILTERS, GROUP_BY, STATUS};
});
