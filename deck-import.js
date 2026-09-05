/* Turning somebody else's decklist into a deck this app can measure.
 *
 * WHAT THIS IS FOR. Every deck in the app so far came from one workbook. This
 * module is the other door: a list pasted out of Moxfield, Archidekt, Deckbox or
 * a text file becomes the same shape the rest of the app already understands.
 *
 * THE PARSE IS THE BLANK LINE. Confirmed against a real Moxfield export: 77 rows
 * and 99 cards, one blank line, then a single row that is the commander -- 100
 * exactly. Moxfield puts the command zone in its own trailing block and does not
 * label it, so the blank line carries the meaning. Sites that DO label their
 * sections are handled too, and a labelled header always beats the positional
 * guess because it is stated rather than inferred.
 *
 * NOTHING IS EVER SILENTLY DROPPED. A line this cannot parse and a name it
 * cannot resolve both come back in the result. A deck that imports 97 of 100
 * cards and says so is useful; one that imports 97 and claims 100 is a liability,
 * because every number computed downstream is then quietly wrong.
 */
(function (root, factory) {
  "use strict";
  const lineup = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./lineup-model.js")
    : root && root.MtgLineupModel;
  const api = factory(lineup);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDeckImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup) {
  "use strict";

  if (!Lineup) throw new Error("Deck import requires the lineup model");

  const normalizeName = Lineup.normalizeName;

  /* The app's normalizeName turns every non-alphanumeric run into a space, so
     "Mjolnir" and "Mjölnir" normalize differently -- the umlaut becomes a space,
     a plain o does not. Both sides of a machine export carry the same spelling
     and match without help, which is why the real Moxfield paste resolved
     cleanly. A person typing a name into the inventory box does not, so this is
     the second key every lookup falls back to. */
  function foldName(value) {
    const folded = String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return normalizeName(folded);
  }

  // Section headers, as the exporters actually write them. Matched on the
  // normalized text so "Sideboard:", "SIDEBOARD" and "// Sideboard" all land.
  const SECTION_WORDS = [
    [/^(commanders?|command zone)$/, "commander"],
    [/^(deck|mainboard|main deck|main)$/, "main"],
    [/^(sideboard|side board)$/, "side"],
    [/^(maybe ?board|considering|maybe)$/, "maybe"],
    [/^(tokens?|token ?board)$/, "token"]
  ];

  function sectionOf(line) {
    // "Commander (1)" and "Deck (99)" both carry a count the header does not need.
    const bare = line.replace(/^[/#\s]+/, "").replace(/[:(].*$/, "").trim().toLowerCase();
    for (const [pattern, name] of SECTION_WORDS) if (pattern.test(bare)) return name;
    return null;
  }

  /* One line of a decklist. The forms that turn up in real exports:
       1 Sol Ring
       1x Sol Ring                     Archidekt and several others
       23 Mountain
       1 Sol Ring (LTC) 292            Moxfield "with set" export
       1 Sol Ring [LTC]                bracket variant
       SB: 1 Sol Ring                  older sideboard marker
       Sol Ring                        a bare name, quantity assumed 1
     Set codes and collector numbers are parsed off and kept rather than pasted
     into the name, where they would break every lookup. */
  const LINE = /^\s*(?:(SB|MB):\s*)?(?:(\d+)\s*x?\s+)?(.+?)\s*$/i;
  const TRAILING_SET = /\s*(?:\((?<paren>[A-Za-z0-9]{2,6})\)|\[(?<square>[A-Za-z0-9]{2,6})\])\s*(?<num>[A-Za-z0-9\-★]+)?\s*$/;

  function parseLine(raw) {
    const line = raw.trim();
    if (!line) return null;
    if (/^[/#]{1,2}\s*$/.test(line)) return null;
    const hit = LINE.exec(line);
    if (!hit) return {error: raw};
    const marker = (hit[1] || "").toUpperCase();
    let name = hit[3];
    let set = null, collector = null;
    const setHit = TRAILING_SET.exec(name);
    if (setHit) {
      set = (setHit.groups.paren || setHit.groups.square || "").toUpperCase();
      collector = setHit.groups.num || null;
      name = name.slice(0, setHit.index).trim();
    }
    if (!name) return {error: raw};
    return {
      quantity: hit[2] ? Number(hit[2]) : 1,
      name,
      set,
      collector,
      marker: marker === "SB" ? "side" : null
    };
  }

  /**
   * Parse a pasted decklist into rows, sections and a commander.
   *
   * Returns {rows, commander, total, warnings, sawSectionHeaders}. Rows carry
   * their section; nothing is filtered out here, because which sections count
   * toward the hundred is a question for the caller, not the parser.
   */
  function parseDecklist(text) {
    const blocks = String(text || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
    const rows = [];
    const warnings = [];
    let sawSectionHeaders = false;
    let current = "main";

    blocks.forEach((block, blockIndex) => {
      const lines = block.split("\n").filter((line) => line.trim());
      lines.forEach((line) => {
        const section = sectionOf(line);
        // A header only counts as a header when it is not also a card line --
        // "1 Commander's Plate" starts with a quantity and is a card.
        if (section && !/^\s*(?:SB:|MB:)?\s*\d/.test(line)) {
          sawSectionHeaders = true;
          current = section;
          return;
        }
        const parsed = parseLine(line);
        if (!parsed) return;
        if (parsed.error) { warnings.push(`Could not read: ${parsed.error.trim()}`); return; }
        rows.push({...parsed, section: parsed.marker || current, block: blockIndex});
      });
      // Sections that came from a header persist across blank lines; a
      // positional block does not, or the trailing commander block would leak
      // its section onto anything after it.
      if (!sawSectionHeaders) current = "main";
    });

    let commander = [];
    if (sawSectionHeaders) {
      commander = rows.filter((r) => r.section === "commander");
    } else {
      /* No headers, so fall back to Moxfield's convention: the command zone is
         the final blank-line-separated block. Only trust it when it looks like a
         command zone -- one or two cards, and the whole list then totalling 100.
         A 60-card list whose last block is a sideboard must not have its
         sideboard promoted to commander. */
      const lastBlock = rows.length ? rows[rows.length - 1].block : -1;
      const tail = rows.filter((r) => r.block === lastBlock);
      const head = rows.filter((r) => r.block !== lastBlock);
      const total = rows.reduce((n, r) => n + r.quantity, 0);
      const plausible = tail.length >= 1 && tail.length <= 2 &&
        tail.every((r) => r.quantity === 1) && head.length > 0 && total === 100;
      if (plausible) {
        commander = tail;
        tail.forEach((r) => { r.section = "commander"; });
      } else if (tail.length && head.length && tail.length <= 2) {
        warnings.push(
          `The last block (${tail.map((r) => r.name).join(", ")}) looks like a command zone, ` +
          `but the list totals ${total} cards rather than 100, so it was left in the main deck.`);
      }
    }

    const counted = rows.filter((r) => r.section === "main" || r.section === "commander");
    return {
      rows,
      commander: commander.map((r) => r.name),
      total: counted.reduce((n, r) => n + r.quantity, 0),
      warnings,
      sawSectionHeaders
    };
  }

  /**
   * Build the lookup a resolve needs. Primary key is the app's own
   * normalizeName; the folded key is the fallback for hand-typed accents.
   * First writer wins on the folded key so an exact match is never displaced.
   */
  function buildIndex(cards) {
    const byName = new Map();
    const byFolded = new Map();
    (cards || []).forEach((card) => {
      const key = normalizeName(card.name);
      if (!byName.has(key)) byName.set(key, card);
      const folded = foldName(card.name);
      if (!byFolded.has(folded)) byFolded.set(folded, card);
    });
    return {byName, byFolded, size: byName.size};
  }

  function lookup(index, name) {
    return index.byName.get(normalizeName(name)) || index.byFolded.get(foldName(name)) || null;
  }

  /**
   * Resolve a parsed list against a card index, producing the ImportedDeck the
   * rest of the app consumes. Unresolved names are returned, never dropped.
   */
  function resolveDeck(parsed, index, meta) {
    const cards = [];
    const unresolved = [];
    const seen = new Map();

    parsed.rows.forEach((row) => {
      if (row.section !== "main" && row.section !== "commander") return;
      const card = lookup(index, row.name);
      if (!card) { unresolved.push(row.name); return; }
      // A name repeated across blocks is one entry with the copies summed;
      // basics arrive that way from some exporters.
      const key = normalizeName(card.name);
      if (seen.has(key)) {
        seen.get(key).quantity += row.quantity;
        return;
      }
      const entry = {
        name: card.name,
        quantity: row.quantity,
        isCommander: row.section === "commander",
        set: row.set,
        card
      };
      seen.set(key, entry);
      cards.push(entry);
    });

    const resolvedTotal = cards.reduce((n, c) => n + c.quantity, 0);
    const warnings = parsed.warnings.slice();
    if (!parsed.commander.length) {
      warnings.push("No commander identified. Name it before the deck can be measured.");
    }
    if (resolvedTotal !== 100) {
      warnings.push(`${resolvedTotal} cards resolved, not 100.` +
        (unresolved.length ? ` ${unresolved.length} name(s) could not be matched.` : ""));
    }

    return {
      source: (meta && meta.source) || "paste",
      sourceUrl: (meta && meta.sourceUrl) || null,
      name: (meta && meta.name) || (parsed.commander[0] || "Imported deck"),
      importedAt: new Date().toISOString(),
      commander: parsed.commander,
      cards,
      unresolved,
      total: resolvedTotal,
      warnings,
      measured: null
    };
  }

  return {
    parseDecklist,
    resolveDeck,
    buildIndex,
    lookup,
    foldName,
    parseLine
  };
});
