/* Card resolution: a typed, pasted or exported line to one card in the store, with the confidence said out loud.
 *
 * WHAT THIS IS FOR (Linear ROB-131). Names reach the app from everywhere: a Moxfield export with "(LTC) 292" on the
 * end, an Archidekt line with "*F*" and a category tag, a friend's text file with "Thassas Oracle" and "Cylonic
 * Rift", a flavor name off a Secret Lair, one face of a double-faced card, a foreign printing, and the occasional name
 * that is not a card at all. Until now each door did its own matching (deck-import.js keys by the app's normalizer and
 * a folded spelling, the lobby asks the catalog for an exact name, the images ask Scryfall), and a miss anywhere was a
 * dead row. This module is the one answer all of them can call, offline, in Node and the browser from one file.
 *
 * THE LAYERS, in the order they are tried, each named on the result so a screen can say how sure it is:
 *
 *   exact       the name as the store spells it                                           confidence 1
 *   normalized  the app's own key (lineup-model normalizeName: lower case, front face only) 0.99
 *   folded      accents, ligatures, curly quotes, apostrophes and punctuation set aside     0.98
 *   face        one face of a split, transform, adventure, modal or flip card, or both
 *               faces written "Fire/Ice" or "Fire Ice"                                     0.96
 *   alias       a flavor name (data/flavor-names.json: "'Tis But a Scratch!" is Dismember)  0.95
 *   fuzzy       the nearest name by edit distance among trigram candidates; its confidence
 *               is the similarity itself, accepted only above ACCEPT and only when the
 *               runner-up is MARGIN behind                                                  0.84 to 0.99
 *   printing    a set code and collector number confirmed by a client (Scryfall's
 *               /cards/<set>/<number>): the one layer that can outrank a fuzzy guess        1
 *   scryfall    Scryfall's own fuzzy /cards/named for a row still held after the offline
 *               layers; confidence is the similarity of what came back to what was typed    0.55 to 0.99
 *
 * A row no layer accepts is HELD, never dropped and never guessed: it carries the nearest candidates (at most five,
 * each with its own confidence) so the fix-the-names screen can offer them, and `says` explains in one sentence.
 * Foreign names are held offline on purpose: the store carries English names only, and a near-miss in another
 * language is exactly the wrong accept the acceptance forbids. The photo and model pass the issue names (an image to
 * a name and set, under the AI door of ROB-132) is a later layer behind the same result shape; it is not here.
 *
 * ZERO WRONG ACCEPTS is the contract, and the published rate is whatever is left: tests/card-resolve.mjs runs the
 * 200-line fixture (tests/fixtures/card-resolve-lines.json) and fails on any accepted row whose card is not the one
 * the line meant, then prints the rate. The break that lowers ACCEPT admits a wrong card and fails
 * (game/tools/batch/breaks-card-resolve.py).
 *
 * The store is whatever the caller indexes: data/engine/oracle.json's rows ({name, layout, faces}), the catalog's
 * cards ({name, ...}) or graph rows; only `name` is required, and `faces[].name` or " // " in the name gives the
 * faces. Flavor names come from data/flavor-names.json's `cards` triples when the caller passes them.
 */
(function (root, factory) {
  "use strict";
  const node = typeof module === "object" && module.exports && typeof require === "function";
  const lineup = node ? require("./lineup-model.js") : root && root.MtgLineupModel;
  const importer = node ? require("./deck-import.js") : root && root.MtgDeckImport;
  const api = factory(lineup, importer);
  if (node) module.exports = api;
  if (root) root.CrankResolve = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup, Import) {
  "use strict";

  if (!Lineup || !Import) throw new Error("Card resolution requires the lineup model and the deck importer");

  const normalizeName = Lineup.normalizeName;

  /* The thresholds. ACCEPT is where a fuzzy match becomes an answer rather than a candidate: at 0.84 a thirteen-letter
     name may be one letter wrong ("Cylonic Rift" is 0.92) and a five-letter name may not ("Shok" to "Shock" is 0.8,
     held, because at that length one letter is a different card as often as a typo). HOLD is the floor below which a
     candidate is not even worth offering. MARGIN keeps two names within a hair of each other from being decided by a
     coin flip: both are offered instead. */
  const DEFAULTS = Object.freeze({accept: 0.84, hold: 0.55, margin: 0.04, candidates: 5, scan: 160});

  const LAYER_CONFIDENCE = Object.freeze({exact: 1, normalized: 0.99, folded: 0.98, face: 0.96, alias: 0.95, printing: 1});

  /* ---------- spelling ---------- */

  /* Everything a person or an exporter does to a name that is not a different card: accents, the Æ ligature older
     exports still carry ("Æther Vial"), ß, curly quotes, every kind of dash, and apostrophes, which are dropped rather
     than spaced so "Thassas Oracle" and "Thassa's Oracle" fold to the same key. Case and the rest of the punctuation go
     the way normalizeName sends them. */
  function fold(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/Æ/g, "AE").replace(/æ/g, "ae").replace(/Œ/g, "OE").replace(/œ/g, "oe").replace(/ß/g, "ss")
      .replace(/[\u2018\u2019\u02bc']/g, "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /* The faces of a card, as the store spells them: the whole name first, then each half. */
  function facesOf(card) {
    const whole = String(card.name || "").trim();
    const named = Array.isArray(card.faces) ? card.faces.map((f) => f && f.name).filter(Boolean) : [];
    const halves = named.length >= 2 ? named : whole.split(" // ").map((s) => s.trim()).filter(Boolean);
    return halves.length >= 2 ? halves : [];
  }

  /* ---------- the index ---------- */

  const push = (map, key, card) => {
    if (!key) return;
    const list = map.get(key);
    if (!list) map.set(key, [card]);
    else if (!list.includes(card)) list.push(card);
  };

  function trigrams(folded) {
    const padded = ` ${folded} `;
    const out = new Set();
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
    return out;
  }

  /**
   * Build the resolver over a store. `cards` is any array of rows with a `name`; `aliases` is a list of
   * [alias, name] pairs (data/flavor-names.json's `cards`, whose third column is ignored). Returns an object whose
   * `resolve`, `resolveMany` and `summary` are bound to this store; the maps are exposed for the suites.
   */
  function createResolver(cards, options) {
    const opts = {...DEFAULTS, ...(options || {})};
    const rows = (cards || []).filter((c) => c && c.name);
    const exact = new Map(), normalized = new Map(), folded = new Map(), face = new Map(), alias = new Map();
    const grams = new Map();           // trigram -> array of row indices
    const foldedName = new Array(rows.length);
    const articles = [];               // [folded name without its leading "the", card]

    rows.forEach((card, i) => {
      const whole = String(card.name).trim();
      const f = fold(whole);
      foldedName[i] = f;
      push(exact, whole, card);
      push(normalized, normalizeName(whole), card);
      push(folded, f, card);
      /* "Ur-Dragon" for The Ur-Dragon, "Great Henge" for The Great Henge: the article is the first thing a typist
         drops. The key is added only where no card spells its name that way, so it never shadows a real name. */
      if (/^the /.test(f) && !folded.has(f.slice(4))) articles.push([f.slice(4), card]);
      const halves = facesOf(card);
      if (halves.length) {
        halves.forEach((h) => push(face, fold(h), card));
        push(face, fold(halves.join(" ")), card);
      }
      for (const g of trigrams(f)) {
        const list = grams.get(g);
        if (list) list.push(i); else grams.set(g, [i]);
      }
    });

    for (const [key, card] of articles) if (!folded.has(key)) push(folded, key, card);

    /* A flavor name only points at a card the store has. The alias layer is tried last, so a flavor name that is
       also a real card's name (Scryfall has printed a few) never shadows the real card. */
    const byExactName = (name) => (exact.get(String(name || "").trim()) || [])[0] || null;
    for (const pair of (opts.aliases || [])) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const target = byExactName(pair[1]);
      const key = fold(pair[0]);
      if (target && key) push(alias, key, target);
    }

    /* Optimal string alignment distance (Levenshtein plus adjacent transposition, which is most of what a typist does
       wrong). Two short rows, no allocation per call beyond them. */
    function distance(a, b) {
      const la = a.length, lb = b.length;
      if (!la) return lb;
      if (!lb) return la;
      let prev2 = null, prev = new Array(lb + 1), cur = new Array(lb + 1);
      for (let j = 0; j <= lb; j++) prev[j] = j;
      for (let i = 1; i <= la; i++) {
        cur[0] = i;
        for (let j = 1; j <= lb; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
          cur[j] = v;
        }
        [prev2, prev, cur] = [prev, cur, prev2 || new Array(lb + 1)];
      }
      return prev[lb];
    }

    const round = (x) => Math.round(x * 1000) / 1000;
    const similarity = (a, b) => (a === b ? 1 : 1 - distance(a, b) / Math.max(a.length, b.length));

    /* The nearest names: trigram overlap picks the rows worth measuring, edit similarity ranks them. */
    function nearest(query) {
      const f = fold(query);
      if (f.length < 3) return [];
      const hits = new Map();
      for (const g of trigrams(f)) {
        const list = grams.get(g);
        if (!list) continue;
        for (const i of list) hits.set(i, (hits.get(i) || 0) + 1);
      }
      const shortlist = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.scan);
      /* A name typed short ("Krenko") is never accepted, but the cards it begins are the candidates worth offering,
         scored by how much of the name was typed, so the fix screen can show both Krenkos. */
      const within = (i) => foldedName[i].startsWith(f + " ") || foldedName[i].endsWith(" " + f) || foldedName[i].includes(" " + f + " ");
      const scored = shortlist.map(([i]) => {
        const sim = similarity(f, foldedName[i]);
        const partial = within(i);
        const typed = partial ? Math.min(opts.accept - 0.01, opts.hold + (1 - opts.hold) * (f.length / foldedName[i].length)) : 0;
        return {card: rows[i], confidence: Math.max(sim, typed), partial};
      })
        .filter((c) => c.confidence >= opts.hold)
        .sort((a, b) => b.confidence - a.confidence || a.card.name.localeCompare(b.card.name));
      const seen = new Set(), out = [];
      for (const c of scored) {
        if (seen.has(c.card.name)) continue;
        seen.add(c.card.name);
        out.push(c);
        if (out.length >= opts.candidates) break;
      }
      return out;
    }

    /* ---------- one line ---------- */

    /* What exporters hang on a line that is not the name: a foil marker, Archidekt's category and tag brackets, a
       trailing comment, and lower-case set codes the importer's parser expects upper. Done before parseLine so set and
       collector number are still read off the end. */
    function clean(line) {
      return String(line || "")
        .replace(/\s*\*[A-Za-z]\*\s*/g, " ")              // *F* and the like
        .replace(/\s*\^[^^]*\^\s*/g, " ")                   // ^Have,#aabbcc^
        .replace(/\s*\[(?![A-Za-z0-9]{2,6}\])[^\]]*\]\s*/g, " ") // [Commander{top}], [Land]; a [SET] code is kept
        .replace(/\s*#.*$/, "")                             // a trailing comment
        .replace(/\s+/g, " ")
        .trim();
    }

    function parse(input) {
      if (input && typeof input === "object") {
        return {quantity: Number(input.quantity) || 1, name: String(input.name || "").trim(), set: input.set || null, collector: input.collector || null, marker: input.marker || null};
      }
      const parsed = Import.parseLine(clean(input));
      if (!parsed || parsed.error || !/[a-z]/.test(fold(parsed.name))) return null;   // "1" alone is a count, not a name
      return parsed;
    }

    function pick(list, layer, name) {
      if (!list || !list.length) return null;
      if (list.length === 1) return {card: list[0], layer, confidence: LAYER_CONFIDENCE[layer]};
      /* Two cards behind one key (a face name another card also uses) is a question, not an answer. */
      return {held: true, layer, candidates: list.slice(0, opts.candidates).map((c) => ({name: c.name, confidence: LAYER_CONFIDENCE[layer]})),
        says: `"${name}" could be ${list.slice(0, opts.candidates).map((c) => c.name).join(" or ")}; pick one.`};
    }

    function answer(name) {
      const whole = String(name || "").trim();
      const f = fold(whole);
      return pick(exact.get(whole), "exact", whole)
        || pick(normalized.get(normalizeName(whole)), "normalized", whole)
        || pick(folded.get(f), "folded", whole)
        || pick(face.get(f) || face.get(fold(whole.replace(/\s*(?:\/\/|\/|\|)\s*/g, " "))), "face", whole)
        || pick(alias.get(f), "alias", whole)
        || null;
    }

    /**
     * Resolve one line or one {name, set, collector, quantity}. Always returns a row; `held` says whether a reader
     * has to look at it. `card` is the store's own row when a layer accepted.
     */
    function resolve(input) {
      const parsed = parse(input);
      const line = typeof input === "string" ? input : (input && input.name) || "";
      if (!parsed || !parsed.name) {
        return {line, quantity: 0, name: "", set: null, collector: null, card: null, resolved: null, layer: "unreadable", confidence: 0, held: true, candidates: [], says: `Could not read a card name in "${String(line).trim()}".`};
      }
      const base = {line, quantity: parsed.quantity, name: parsed.name, set: parsed.set || null, collector: parsed.collector || null, marker: parsed.marker || null};
      const hit = answer(parsed.name);
      if (hit && !hit.held) {
        const how = hit.layer === "exact" ? "as written" : hit.layer === "alias" ? `by its flavor name` : hit.layer === "face" ? "by one face" : `by spelling (${hit.layer})`;
        return {...base, card: hit.card, resolved: hit.card.name, layer: hit.layer, confidence: hit.confidence, held: false, candidates: [], says: `${hit.card.name}, matched ${how}.`};
      }
      if (hit && hit.held) return {...base, card: null, resolved: null, layer: hit.layer, confidence: 0, held: true, candidates: hit.candidates, says: hit.says};

      const near = nearest(parsed.name);
      const top = near[0], second = near[1];
      /* A typed name that is one letter from one card and a whole word inside another ("Ur-Dragon" against Ur-Drago
         and The Ur-Dragon, before the article rule) is a question for the reader, whatever the edit distance says. */
      const contained = top && !top.partial && near.find((c) => c.partial);
      if (top && !contained && top.confidence >= opts.accept && (!second || top.confidence - second.confidence >= opts.margin)) {
        return {...base, card: top.card, resolved: top.card.name, layer: "fuzzy", confidence: round(top.confidence), held: false,
          candidates: near.slice(1).map((c) => ({name: c.card.name, confidence: round(c.confidence)})),
          says: `${top.card.name}, the nearest spelling to "${parsed.name}" (${Math.round(top.confidence * 100)}% alike).`};
      }
      const candidates = near.map((c) => ({name: c.card.name, confidence: round(c.confidence)}));
      const says = !top ? `No card in the store is close to "${parsed.name}".`
        : contained ? `"${parsed.name}" could be ${top.card.name} or ${contained.card.name}; pick one.`
        : top.confidence >= opts.accept ? `"${parsed.name}" is as close to ${top.card.name} as to ${second.card.name}; pick one.`
        : `"${parsed.name}" is not a name in the store; nearest is ${top.card.name} (${Math.round(top.confidence * 100)}% alike), not close enough to assume.`;
      return {...base, card: null, resolved: null, layer: top ? "held" : "unknown", confidence: top ? round(top.confidence) : 0, held: true, candidates, says};
    }

    /** Every line of a pasted list (a string with newlines, or an array of lines or {name} rows). Blank lines and
     * section headers are skipped; a line that reads as nothing comes back held as "unreadable". */
    function resolveMany(input) {
      const lines = Array.isArray(input) ? input : String(input || "").replace(/\r\n?/g, "\n").split("\n");
      const out = [];
      for (const raw of lines) {
        if (typeof raw === "string") {
          const trimmed = raw.trim();
          if (!trimmed || /^[/#]{1,2}\s*$/.test(trimmed)) continue;
          if (/^(?:\/\/|#)?\s*(?:commanders?|command zone|deck|mainboard|main deck|main|sideboard|side board|maybeboard|maybe board|maybe|considering|tokens?)\s*(?:\(\d+\))?\s*:?\s*$/i.test(trimmed)) continue;
        }
        out.push(resolve(raw));
      }
      return out;
    }

    /** The published numbers: how many lines, how many each layer answered, how many are held, and the rate. */
    function summary(results) {
      const layers = {};
      let accepted = 0;
      for (const r of results) {
        layers[r.layer] = (layers[r.layer] || 0) + 1;
        if (!r.held) accepted++;
      }
      return {lines: results.length, accepted, held: results.length - accepted, rate: results.length ? round(accepted / results.length) : 0, layers};
    }

    /* ---------- the client layers (async, optional) ---------- */

    /**
     * Confirm or supply a row from its printing when it names one, and ask Scryfall's fuzzy name for rows still held.
     * `client` is scryfall-client.js's shape: bySetNumber(set, number) and named(name). Rows the client cannot improve
     * come back unchanged; a client error leaves the row as it was and notes it. One request per row at most two.
     */
    async function withClient(results, client, options) {
      const o = {...opts, ...(options || {})};
      const out = [];
      for (const r of results) {
        let row = r;
        if (client && typeof client.bySetNumber === "function" && row.set && row.collector && row.layer !== "unreadable") {
          try {
            const found = await client.bySetNumber(row.set, row.collector, {signal: o.signal});
            if (found && found.name) {
              const same = row.card && fold(found.name) === fold(row.card.name);
              const local = answer(found.name);
              const card = (local && !local.held && local.card) || found;
              if (same || !row.card || row.layer === "fuzzy") {
                /* The printing agrees, or the name was a guess: the printing is the better witness. */
                row = {...row, card, resolved: card.name, layer: "printing", confidence: 1, held: false, candidates: [],
                  says: `${card.name}, ${row.set.toUpperCase()} ${row.collector}${same ? ", name and printing agree" : ", by its printing"}.`};
              } else {
                row = {...row, card: null, resolved: null, layer: "held", confidence: 0, held: true, conflict: true,
                  candidates: [{name: row.card.name, confidence: row.confidence}, {name: found.name, confidence: 1}],
                  says: `The line says ${row.card.name} but ${row.set.toUpperCase()} ${row.collector} is ${found.name}; pick one.`};
              }
            }
          } catch (error) { row = {...row, says: `${row.says} (The printing lookup failed: ${error && error.message ? error.message : error}.)`}; }
        }
        /* A row held because its name and its printing disagree already has both answers; only a row nothing has
           placed is worth Scryfall's guess. */
        if (row.held && !row.conflict && row.layer !== "unreadable" && client && typeof client.named === "function") {
          try {
            const found = await client.named(row.name, {signal: o.signal});
            if (found && found.name) {
              const conf = similarity(fold(row.name), fold(found.name));
              const local = answer(found.name);
              const card = (local && !local.held && local.card) || found;
              if (conf >= o.hold) {
                row = {...row, card, resolved: card.name, layer: "scryfall", confidence: round(conf), held: false,
                  candidates: row.candidates.filter((c) => c.name !== card.name),
                  says: `${card.name}, Scryfall's reading of "${row.name}" (${Math.round(conf * 100)}% alike).`};
              } else if (!row.candidates.some((c) => c.name === found.name)) {
                row = {...row, candidates: [{name: found.name, confidence: round(conf)}, ...row.candidates].slice(0, o.candidates)};
              }
            }
          } catch (error) { /* Scryfall says 404 for a name it cannot place; the row stays held with what it had. */ }
        }
        out.push(row);
      }
      return out;
    }

    return {resolve, resolveMany, summary, withClient, nearest, fold, size: rows.length, maps: {exact, normalized, folded, face, alias}, options: opts};
  }

  return {createResolver, fold, facesOf, DEFAULTS, LAYER_CONFIDENCE};
});
