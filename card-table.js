/**
 * One table, wherever a list of cards is read.
 *
 * The Shop grew a table worth keeping: every dimension available three ways at once --
 * as a column you can sort on, as a multi-select filter, and as a grouping -- with the
 * filter counts computed against what the OTHER filters already allow, so a count never
 * offers a click that leads to an empty list. The Bench had two sort chips and a search
 * box; Upgrades had no table at all, just a paragraph per deck. Three lists of cards,
 * three different answers to "show me the rares I still owe".
 *
 * So the machinery moved here and the pages declare what they have:
 *
 *   FACET   {key, label, of(row) -> value | [values], order?}   what a filter matches on
 *   COLUMN  {key, label, sortable?, value(row)?}                what a header sorts on
 *   GROUP   {key, label, of(row) -> bucket, order?}             what a band is cut on
 *
 * `of` returning an array means a row belongs to several buckets at once -- a card in
 * three decks answers the Deck filter three times -- which is the case the Shop needed
 * and the reason a plain `row[key]` lookup was never enough.
 *
 * PURE. Everything here takes rows and returns rows, or takes rows and returns an HTML
 * string. No DOM, no storage, no fetch -- which is what lets tests/card-table.mjs hold
 * the counting and the ordering to their promises without a browser.
 *
 * WHY THE MARKUP IS STRINGS AND NOT NODES. viewer.js builds nodes and app.js builds
 * strings, and this is used by both. Strings are the smaller lie: a caller that wants
 * nodes sets innerHTML once, where a caller that wants strings would have to serialize.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCardTable = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, function (c) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c];
    });
  }

  /** Whatever a facet or group says this row is, always as an array. */
  function valuesOf(row, spec) {
    var v = spec.of ? spec.of(row) : row[spec.key];
    if (v === null || v === undefined || v === "") return [];
    return Array.isArray(v) ? v.filter(function (x) { return x !== null && x !== undefined && x !== ""; }) : [v];
  }

  /** A facet's options, in the order it declares or alphabetically. */
  function options(rows, facet) {
    if (facet.order) return facet.order.slice();
    var set = new Set();
    rows.forEach(function (row) { valuesOf(row, facet).forEach(function (v) { set.add(v); }); });
    return Array.from(set).sort(function (a, b) { return String(a).localeCompare(String(b)); });
  }

  /** Does this row survive one facet's chosen values? Nothing chosen means everything. */
  function passesFacet(row, facet, chosen) {
    if (!chosen || !chosen.length) return true;
    var mine = valuesOf(row, facet);
    return mine.some(function (v) { return chosen.indexOf(v) >= 0; });
  }

  /**
   * Does this row survive the whole filter?
   *
   * `f.query` is matched against the fields a facet named `search` declares, so a page
   * decides what "search" means rather than this file guessing that it means the name.
   */
  function passes(row, facets, f) {
    f = f || {};
    for (var i = 0; i < facets.length; i += 1) {
      if (!passesFacet(row, facets[i], f[facets[i].key])) return false;
    }
    if (f.query) {
      var q = String(f.query).toLowerCase();
      var hay = (f.searchIn || ["name"]).map(function (k) { return row[k] || ""; }).join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function filter(rows, facets, f) {
    return rows.filter(function (row) { return passes(row, facets, f); });
  }

  /**
   * HOW MANY ROWS EACH OPTION WOULD LEAVE, counted against every filter EXCEPT its own.
   *
   * The naive count -- how many of the currently visible rows carry this value -- reads
   * as zero for every option you have not picked the moment you pick one, which makes a
   * multi-select look broken. Counting each axis against the others is what makes the
   * number mean "click this and you get that many", which is the only thing it can
   * honestly mean.
   */
  function counts(rows, facets, f, facet) {
    var others = facets.filter(function (x) { return x.key !== facet.key; });
    var pool = rows.filter(function (row) { return passes(row, others, f); });
    var tally = new Map();
    pool.forEach(function (row) {
      valuesOf(row, facet).forEach(function (v) { tally.set(v, (tally.get(v) || 0) + 1); });
    });
    return tally;
  }

  function sortValue(row, column) {
    if (column && column.value) return column.value(row);
    var v = row[column.key];
    return v === null || v === undefined ? "" : v;
  }

  /**
   * Sorted, and stably: ties break on name so a row never moves under a finger that was
   * reaching for it. Unknown numbers sort below every real figure rather than above,
   * because a card nobody has a price for is unknown, not free.
   */
  function sortRows(rows, columns, key, dir) {
    var column = columns.filter(function (c) { return c.key === key; })[0];
    if (!column) return rows.slice();
    var sign = dir === "desc" ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      var x = sortValue(a, column), y = sortValue(b, column);
      if (typeof x === "number" && typeof y === "number") return (x - y) * sign || String(a.name).localeCompare(String(b.name));
      return String(x).localeCompare(String(y)) * sign || String(a.name).localeCompare(String(b.name));
    });
  }

  /** The drawer a card is filed in: its first letter, digits and symbols in one box. */
  function letterOf(name) {
    var c = String(name || "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  }

  /**
   * Rows cut into bands. Returns [[label, rows], ...]; one band with an empty label
   * when nothing is grouping, so a caller renders bands and never branches.
   *
   * A row lands in ONE band even when its facet value is plural -- a card in three decks
   * would otherwise be counted three times and the bands would add up to more cards than
   * there are. The first value wins, which is why `of` returns them in a stated order.
   */
  function groupRows(rows, group) {
    if (!group) return [["", rows]];
    var map = new Map();
    rows.forEach(function (row) {
      var mine = valuesOf(row, group);
      var g = mine.length ? String(mine[0]) : (group.empty || "Not set");
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(row);
    });
    var order = Array.from(map.keys());
    if (group.order) {
      var rank = function (g) { var i = group.order.indexOf(g); return i < 0 ? group.order.length : i; };
      order.sort(function (a, b) { return rank(a) - rank(b) || a.localeCompare(b); });
    } else {
      order.sort(function (a, b) { return a.localeCompare(b); });
    }
    /* Whatever the band for "we do not know" is called, it is a to-do rather than a
       shelf, and it goes last however the rest are ordered. */
    var unknown = order.indexOf(group.empty || "Not set");
    if (unknown > -1) order.push(order.splice(unknown, 1)[0]);
    return order.map(function (g) { return [g, map.get(g)]; });
  }

  /* -------------------------------------------------------------- markup ---- */

  /**
   * The filter bar: a search box, one collapsed menu per facet, and a group-by.
   *
   * MINIMAL REAL ESTATE IS THE WHOLE POINT. Nine facets as chip rows is nine rows of
   * chrome above a list that is the actual page. Each facet is one button carrying its
   * own count when it is narrowing something, and its options only exist while it is
   * open. Nothing is chosen -> one row of buttons. Something is chosen -> the same row,
   * with the chosen ones lit and a Clear beside them.
   */
  function filterBar(rows, facets, f, opts) {
    opts = opts || {};
    f = f || {};
    var chosenCount = facets.reduce(function (n, x) { return n + ((f[x.key] || []).length ? 1 : 0); }, 0);
    var bits = [];
    if (opts.search !== false) {
      bits.push('<label class="ct-search"><span class="ct-sr">' + esc(opts.searchLabel || "Search") + "</span>" +
        '<input type="search" data-ct-query placeholder="' + esc(opts.searchLabel || "Search") + '" ' +
        'aria-label="' + esc(opts.searchLabel || "Search") + '" value="' + esc(f.query || "") + '"></label>');
    }
    facets.forEach(function (facet) {
      var chosen = f[facet.key] || [];
      var tally = counts(rows, facets, f, facet);
      var list = options(rows, facet).filter(function (v) { return tally.get(v) || chosen.indexOf(v) >= 0; });
      if (!list.length) return;
      var open = f.open === facet.key;
      bits.push('<div class="ct-facet' + (chosen.length ? " is-on" : "") + (open ? " is-open" : "") + '">' +
        '<button type="button" class="ct-facet-btn" data-ct-facet="' + esc(facet.key) + '" ' +
          'aria-expanded="' + (open ? "true" : "false") + '">' +
          esc(facet.label) + (chosen.length ? ' <span class="ct-n">' + chosen.length + "</span>" : "") +
        "</button>" +
        (open ? '<div class="ct-menu" role="group" aria-label="' + esc(facet.label) + '">' +
          list.map(function (v) {
            var on = chosen.indexOf(v) >= 0;
            return '<button type="button" class="ct-opt' + (on ? " is-on" : "") + '" ' +
              'data-ct-pick="' + esc(facet.key) + '" data-ct-value="' + esc(v) + '" ' +
              'aria-pressed="' + (on ? "true" : "false") + '">' +
              esc(v) + ' <span class="ct-n">' + (tally.get(v) || 0) + "</span></button>";
          }).join("") + "</div>" : "") +
      "</div>");
    });
    /* SORTING ON A PHONE. The header row is the sort control, and below 760px there is
       no header row -- the columns fold into the rows and take their labels with them. So
       the same choice is offered here as a select plus a direction, hidden by CSS at the
       widths where the header exists. Without it a phone could filter and not sort, which
       is half a table. */
    if (opts.sort && opts.columns) {
      var sortable = opts.columns.filter(function (c) { return c.sortable !== false; });
      bits.push('<label class="ct-sortby"><span class="ct-sr">Sort by</span>' +
        '<select data-ct-sortby aria-label="Sort by">' +
        sortable.map(function (c) {
          return '<option value="' + esc(c.key) + '"' + (opts.sort.key === c.key ? " selected" : "") +
            ">" + esc(c.label) + "</option>";
        }).join("") + "</select></label>");
      bits.push('<button type="button" class="ct-sortdir" data-ct-sortdir aria-label="' +
        (opts.sort.dir === "desc" ? "Sorted high to low. Switch to low to high."
                                  : "Sorted low to high. Switch to high to low.") + '">' +
        (opts.sort.dir === "desc" ? "▾" : "▴") + "</button>");
    }
    if (opts.groups && opts.groups.length) {
      var by = f.group || "";
      bits.push('<label class="ct-group"><span class="ct-sr">Group by</span>' +
        '<select data-ct-group aria-label="Group by"><option value="">No grouping</option>' +
        opts.groups.map(function (g) {
          return '<option value="' + esc(g.key) + '"' + (by === g.key ? " selected" : "") + ">" +
            esc(g.label) + "</option>";
        }).join("") + "</select></label>");
    }
    if (chosenCount || f.query) {
      bits.push('<button type="button" class="ct-clear" data-ct-clear>Clear filters</button>');
    }
    return '<div class="ct-bar">' + bits.join("") + "</div>";
  }

  /**
   * One header row. A sortable column is a button; the arrow says which way.
   *
   * `opts.before` and `opts.after` are how many columns the ROW has that the header does
   * not name -- a tick box on the left, an info button on the right. They have to be
   * emitted as empty cells rather than left out: the header and the row share one grid
   * template, so a header short by one lands every label a column to the left of the
   * data it describes, which is exactly what it did.
   */
  function head(columns, sort, opts) {
    sort = sort || {};
    opts = opts || {};
    var pad = function (n) {
      var out = "";
      for (var i = 0; i < (n || 0); i += 1) out += '<span class="ct-cell" aria-hidden="true"></span>';
      return out;
    };
    return '<div class="ct-head" role="row">' + pad(opts.before) + columns.map(function (c) {
      var cls = "ct-cell ct-" + c.key + (c.numeric ? " ct-num" : "");
      if (c.sortable === false) return '<span class="' + cls + '" role="columnheader">' + esc(c.label) + "</span>";
      var on = sort.key === c.key;
      return '<button type="button" class="' + cls + ' ct-sort' + (on ? " is-on" : "") + '" role="columnheader" ' +
        'data-ct-sort="' + esc(c.key) + '" aria-sort="' + (on ? (sort.dir === "desc" ? "descending" : "ascending") : "none") + '">' +
        esc(c.label) + '<i aria-hidden="true">' + (on ? (sort.dir === "desc" ? "▾" : "▴") : "⇅") + "</i></button>";
    }).join("") + pad(opts.after) + "</div>";
  }

  /**
   * The reader's filter state, changed by one click on the bar.
   *
   * Returns a NEW state rather than mutating, so a caller can compare and decide whether
   * to save. Toggling a value off the last chosen option clears the key rather than
   * leaving an empty array, because "[]" and "absent" would otherwise both mean "all"
   * and only one of them would round-trip through storage.
   */
  function toggle(f, key, value) {
    var next = Object.assign({}, f);
    var chosen = (next[key] || []).slice();
    var at = chosen.indexOf(value);
    if (at >= 0) chosen.splice(at, 1); else chosen.push(value);
    if (chosen.length) next[key] = chosen; else delete next[key];
    return next;
  }

  /** Header click: same column flips direction, a new column starts ascending. */
  function nextSort(sort, key, firstDir) {
    if (sort && sort.key === key) return {key: key, dir: sort.dir === "asc" ? "desc" : "asc"};
    return {key: key, dir: firstDir || "asc"};
  }

  return {
    esc: esc, valuesOf: valuesOf, options: options, passes: passes, filter: filter,
    counts: counts, sortValue: sortValue, sortRows: sortRows, groupRows: groupRows,
    letterOf: letterOf, filterBar: filterBar, head: head, toggle: toggle, nextSort: nextSort
  };
});
