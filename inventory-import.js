/* What you actually own, read out of whatever file it happens to live in.
 *
 * WHAT THIS IS FOR. Every ownership figure in this app came from one audited
 * workbook. Somebody else's collection lives in a spreadsheet, a CSV out of a
 * deck site, or a note on their phone that reads "3x Sol Ring". This turns any of
 * those into the same list, matches it against what the decks are asking for, and
 * says what is left over -- which is the bench.
 *
 * THE HARD PART IS NOT THE PARSE, IT IS THE ALLOCATION. Three Sol Rings and five
 * decks that each want one is not "Sol Ring: owned". Three go into decks and two
 * decks still need one, and an inventory feature that cannot say that is worse
 * than no feature, because it tells somebody they are finished when they are not.
 * reconcile() allocates copy by copy, in a stated order, and reports the shortfall.
 *
 * WHAT COUNTS AS A COLUMN. A CSV from Moxfield, Archidekt, Deckbox, Helvault and
 * a hand-made sheet all name their columns differently and agree on nothing except
 * that one of them is the card and one is how many. So the header is matched
 * against a list of the names those exports actually use, and when no header
 * matches, the first column that holds text is the name and the first that holds
 * numbers is the count. That guess is reported, never silent.
 */
(function (root, factory) {
  "use strict";
  const lineup = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./lineup-model.js")
    : root && root.MtgLineupModel;
  const api = factory(lineup);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgInventoryImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup) {
  "use strict";

  if (!Lineup) throw new Error("The inventory importer needs the lineup model");
  const normalize = Lineup.normalizeName;

  /* Header names, as the exports really write them. Checked longest-first so
     "card name" wins over a bare "name" in a sheet that has both. */
  const NAME_HEADERS = ["card name", "cardname", "card", "name", "title", "card_name"];
  const QTY_HEADERS = ["quantity", "qty", "count", "copies", "amount", "have", "owned",
                       "number", "num", "#", "total qty"];
  const SET_HEADERS = ["set", "edition", "set name", "set code", "expansion"];
  const FOIL_HEADERS = ["foil", "is foil", "finish", "printing"];

  const clean = (v) => String(v == null ? "" : v).trim();
  const headerKey = (v) => clean(v).toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");

  function pickColumn(header, candidates) {
    const keys = header.map(headerKey);
    for (const want of candidates) {
      const at = keys.indexOf(want);
      if (at >= 0) return at;
    }
    return -1;
  }

  const isNumber = (v) => clean(v) !== "" && Number.isFinite(Number(clean(v)));

  /**
   * A grid of cells -> the cards it lists.
   *
   * Returns {cards, columns, guessed, skipped} -- `guessed` is true when the
   * header named nothing recognizable and the columns were inferred, which the
   * caller must show rather than swallow.
   */
  function parseTable(rows) {
    const grid = (rows || []).map((r) => (Array.isArray(r) ? r : [r]));
    const body = grid.filter((r) => r.some((c) => clean(c) !== ""));
    if (!body.length) return {cards: [], columns: {}, guessed: false, skipped: 0};

    const header = body[0];
    let nameAt = pickColumn(header, NAME_HEADERS);
    let qtyAt = pickColumn(header, QTY_HEADERS);
    const setAt = pickColumn(header, SET_HEADERS);
    const foilAt = pickColumn(header, FOIL_HEADERS);
    let guessed = false;
    let start = 1;

    if (nameAt < 0) {
      /* No header this recognizes. The first column holding text that is not a
         number is the name, and the first holding numbers is the count -- checked
         against the data rather than the first row, because the first row may
         itself be a card. */
      guessed = true;
      start = 0;
      const sample = body.slice(0, 20);
      const width = Math.max(...sample.map((r) => r.length));
      for (let c = 0; c < width && nameAt < 0; c += 1) {
        if (sample.some((r) => clean(r[c]) !== "" && !isNumber(r[c]))) nameAt = c;
      }
      if (nameAt < 0) nameAt = 0;
      for (let c = 0; c < width && qtyAt < 0; c += 1) {
        if (c !== nameAt && sample.some((r) => isNumber(r[c]))) qtyAt = c;
      }
    }

    const cards = [];
    let skipped = 0;
    body.slice(start).forEach((row) => {
      const name = clean(row[nameAt]);
      if (!name) { skipped += 1; return; }
      // A row whose "name" is a number is a stray column, not a card.
      if (isNumber(name)) { skipped += 1; return; }
      const raw = qtyAt >= 0 ? clean(row[qtyAt]) : "";
      const quantity = isNumber(raw) ? Math.max(0, Math.round(Number(raw))) : 1;
      if (!quantity) { skipped += 1; return; }
      cards.push({
        name: stripSuffix(name),
        quantity,
        set: setAt >= 0 ? clean(row[setAt]) : "",
        foil: foilAt >= 0 ? /^(true|yes|y|1|foil|etched)$/i.test(clean(row[foilAt])) : false
      });
    });

    return {cards: merge(cards), columns: {nameAt, qtyAt, setAt, foilAt}, guessed, skipped};
  }

  // "Sol Ring (LTC) 123" and "Sol Ring [LTC]" -- a set code and collector number
  // trailing a name, which several exports append and no matcher wants.
  const TRAILING = /\s*(?:\((?<paren>[A-Za-z0-9]{2,6})\)|\[(?<square>[A-Za-z0-9]{2,6})\])\s*(?<num>[A-Za-z0-9\-★]+)?\s*$/;
  function stripSuffix(name) {
    const hit = TRAILING.exec(name);
    return hit ? name.slice(0, hit.index).trim() : name;
  }

  /* One entry per card, copies summed. A collection listed by printing has the
     same card on four rows, and four rows of one Sol Ring is four Sol Rings. */
  function merge(cards) {
    const byKey = new Map();
    cards.forEach((card) => {
      const key = normalize(card.name);
      if (byKey.has(key)) { byKey.get(key).quantity += card.quantity; return; }
      byKey.set(key, {...card});
    });
    return [...byKey.values()];
  }

  /* Which delimiter a line is using. Counted across the first few lines rather
     than the first, because one card name with a comma in it would otherwise
     turn a tab-separated file into a comma-separated one. */
  function sniff(text) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
    if (!lines.length) return null;
    const count = (ch) => lines.reduce((n, l) => n + (l.split(ch).length - 1), 0);
    const tabs = count("\t");
    const commas = count(",");
    const semis = count(";");
    const best = Math.max(tabs, commas, semis);
    if (!best) return null;
    if (tabs === best) return "\t";
    if (semis === best) return ";";
    return ",";
  }

  /* A CSV split that respects quoting, because a card name with a comma in it --
     "Krenko, Mob Boss" -- is the single most common name shape in this app. */
  function splitLine(line, delimiter) {
    const out = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { out.push(cell); cell = ""; }
      else cell += ch;
    }
    out.push(cell);
    return out;
  }

  // "3 Sol Ring", "3x Sol Ring", "Sol Ring x3", "Sol Ring" -- the four shapes a
  // person types when nobody is making them use a format.
  const LEAD = /^\s*(\d+)\s*[xX]?\s+(.+?)\s*$/;
  const TRAIL = /^\s*(.+?)\s+[xX]\s*(\d+)\s*$/;

  function parseFreeform(text) {
    const cards = [];
    let skipped = 0;
    String(text).split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line || /^[/#]/.test(line)) return;
      // A whole line wrapped in quotes is a CSV artifact -- one row of a
      // single-column export -- and the quotes are never part of a card name.
      let name = line.replace(/^"(.*)"$/, "$1").trim();
      let quantity = 1;
      const lead = LEAD.exec(name);
      const trail = TRAIL.exec(name);
      if (lead) { quantity = Number(lead[1]); name = lead[2]; }
      else if (trail) { name = trail[1]; quantity = Number(trail[2]); }
      name = stripSuffix(name);
      if (!name || !quantity) { skipped += 1; return; }
      cards.push({name, quantity, set: "", foil: false});
    });
    return {cards: merge(cards), columns: {}, guessed: false, skipped};
  }

  /**
   * Text of any shape -> the cards it lists.
   *
   * A delimited file goes through the table path so its header is honoured; a
   * plain list goes through the freeform one. The choice is reported so a wrong
   * guess is visible rather than mysterious.
   */
  function parseText(text) {
    const delimiter = sniff(text);
    if (!delimiter) return {...parseFreeform(text), shape: "list"};
    const rows = String(text).split(/\r?\n/).filter((l) => l.trim())
      .map((line) => splitLine(line, delimiter));
    /* A real table has a consistent width; a list that happens to contain a comma
       does not. "Krenko, Mob Boss" on its own line splits into two cells while
       every other line stays one, and reading that as a table truncates the name
       to "Krenko" -- the single most damaging thing this parser could do, because
       it produces a plausible wrong answer rather than an error.

       So the MODE of the row widths decides. Widths [2,1,1] is a list with a comma
       in it; [6,6,6,6] is a CSV; [2,2] is a header and one card, which is a table. */
    const widths = rows.map((r) => r.length);
    const tally = new Map();
    widths.forEach((w) => tally.set(w, (tally.get(w) || 0) + 1));
    let mode = 1;
    tally.forEach((n, w) => { if (n > (tally.get(mode) || 0) || (n === tally.get(mode) && w > mode)) mode = w; });
    if (mode < 2) return {...parseFreeform(text), shape: "list"};
    // Rows narrower than the mode lost their delimiters to a quoted comma or a
    // trailing blank; rows wider than it have an extra one. Both are still rows.
    const table = parseTable(rows);
    return {...table, shape: delimiter === "\t" ? "tsv" : "csv", delimiter};
  }

  /**
   * Match a collection against what the decks want.
   *
   * `decks` is [{id, label, wants: [{name, quantity}]}] in the order copies
   * should be allocated -- the caller decides that order, because "which deck
   * gets the only Sol Ring" is a judgement about decks and not about inventory.
   *
   * Returns:
   *   holdings  one row per owned card: how many, how many the decks took, what
   *             is left over
   *   decks     per deck: what it got, and what it is still short of
   *   bench     the leftovers, which is the answer this was asked for
   *   unknown   names in the file that no deck wants -- kept, never dropped,
   *             because a collection is not only the cards the decks need
   */
  function reconcile(cards, decks) {
    const owned = new Map();
    (cards || []).forEach((card) => {
      const key = normalize(card.name);
      const row = owned.get(key) || {name: card.name, quantity: 0, used: 0, key};
      row.quantity += Number(card.quantity || 0);
      owned.set(key, row);
    });

    const perDeck = (decks || []).map((deck) => ({
      id: deck.id, label: deck.label, filled: [], short: [], filledCount: 0, shortCount: 0
    }));

    (decks || []).forEach((deck, index) => {
      const report = perDeck[index];
      (deck.wants || []).forEach((want) => {
        const key = normalize(want.name);
        const need = Math.max(1, Number(want.quantity || 1));
        const row = owned.get(key);
        const free = row ? row.quantity - row.used : 0;
        const take = Math.max(0, Math.min(need, free));
        if (take) {
          row.used += take;
          report.filled.push({name: row.name, quantity: take});
          report.filledCount += take;
        }
        if (take < need) {
          report.short.push({name: want.name, quantity: need - take});
          report.shortCount += need - take;
        }
      });
    });

    const holdings = [...owned.values()].map((row) => ({
      name: row.name, quantity: row.quantity, used: row.used, spare: row.quantity - row.used
    }));
    const bench = holdings.filter((row) => row.spare > 0)
      .sort((a, b) => b.spare - a.spare || a.name.localeCompare(b.name));
    const wanted = new Set();
    (decks || []).forEach((d) => (d.wants || []).forEach((w) => wanted.add(normalize(w.name))));
    const unknown = holdings.filter((row) => !wanted.has(normalize(row.name)));

    return {
      holdings,
      decks: perDeck,
      bench,
      unknown,
      totals: {
        cards: holdings.reduce((n, r) => n + r.quantity, 0),
        distinct: holdings.length,
        used: holdings.reduce((n, r) => n + r.used, 0),
        spare: holdings.reduce((n, r) => n + r.spare, 0),
        short: perDeck.reduce((n, d) => n + d.shortCount, 0)
      }
    };
  }

  return {
    parseText, parseTable, parseFreeform, reconcile,
    splitLine, sniff, stripSuffix, merge,
    NAME_HEADERS, QTY_HEADERS
  };
});
