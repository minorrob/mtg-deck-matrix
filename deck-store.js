/* Imported decks: where they live, and how they join the six.
 *
 * WHAT THIS IS. deck-import.js turns somebody's paste into a resolved list.
 * deck-measure.js turns a resolved list into a score. Neither knows where the
 * deck goes afterwards. This does: it is the record format, the browser
 * storage, and -- the part with the actual work in it -- the translation from
 * an imported deck into the shape My Decks already renders.
 *
 * THE TRANSLATION IS THE POINT. The viewer's model is a flat card catalog whose
 * rows carry per-deck `target` and `actual` counts. Nothing in it knows about
 * imports, and nothing in it should have to: an imported deck that produces
 * catalog rows of the same shape is rendered, counted, priced and grouped by
 * the code that was already there. So `merge` returns a NEW catalog rather than
 * a special case, and every downstream reader stays unchanged.
 *
 * WHY THE MERGE COPIES. A card already in the catalog -- Sol Ring, a Mountain --
 * must gain a target for the imported deck without gaining one for D1 to D6.
 * Mutating the loaded master would make an import contaminate the six decks in
 * place, and a reload would silently "fix" it. Rows are copied on write, so the
 * master a caller holds is the master they still hold afterwards.
 *
 * OWNERSHIP. An imported deck is a deck its owner already built: its cards are
 * `actual` as well as `target`, so it reads as complete and adds nothing to the
 * buy list. Cards it wants but does not have are what a recommendation creates,
 * and those arrive as targets without actuals -- the same distinction the six
 * decks already make.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDeckStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORE_KEY = "mtg-imported-decks.v1";
  const SCHEMA = 1;

  /* Imported ids are "U1", "U2"... -- U for the user, and deliberately not D,
     so an id can never collide with the workbook's own six however either side
     grows. The number is the lowest unused one, not a counter, so deleting and
     re-adding does not walk the ids off into the hundreds. */
  function nextId(records) {
    const taken = new Set((records || []).map((r) => r.id));
    for (let n = 1; n < 1000; n += 1) if (!taken.has(`U${n}`)) return `U${n}`;
    throw new Error("No free imported-deck id");
  }

  /* Scryfall gives colour identity as ["W","B"]; the workbook writes "WB", "C"
     for colourless, "L" for a land and "Multi" past two colours. Imported rows
     have to speak the workbook's dialect or every grouping in the app reads
     them as a colour of their own. */
  function colorCode(identity, typeLine) {
    const colors = (Array.isArray(identity) ? identity : String(identity || "").split(""))
      .filter((c) => "WUBRG".includes(c));
    if (/\bLand\b/.test(typeLine || "")) return "L";
    if (!colors.length) return "C";
    if (colors.length > 2) return "Multi";
    return "WUBRG".split("").filter((c) => colors.includes(c)).join("");
  }

  // "Legendary Creature — Goblin Warrior" -> "Legendary Creature". The workbook
  // keeps the subtype in its own column and the app's type filters expect that.
  function shortType(typeLine) {
    return String(typeLine || "").split(/\s+[—-]\s+/)[0].trim() || "Card";
  }

  function subType(typeLine) {
    const parts = String(typeLine || "").split(/\s+[—-]\s+/);
    return parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";
  }

  /**
   * The stored record for one imported deck.
   *
   * `cards` keeps the printed facts alongside the name, because the whole point
   * of an import is that these cards are not in the app's own catalog: drop the
   * facts and the deck cannot be re-measured without going back to the network.
   */
  function toRecord(resolved, meta) {
    const options = meta || {};
    const cards = (resolved.cards || []).map((entry) => {
      const fact = entry.card || {};
      const typeLine = fact.typeLine || fact.type || "";
      return {
        name: entry.name,
        quantity: Number(entry.quantity || 1),
        isCommander: Boolean(entry.isCommander),
        typeLine,
        manaCost: fact.manaCost || "",
        oracleText: fact.oracleText || "",
        keywords: fact.keywords || [],
        colorIdentity: Array.isArray(fact.colorIdentity)
          ? fact.colorIdentity
          : String(fact.colorIdentity || fact.ci || "").split("").filter((c) => "WUBRG".includes(c)),
        mv: Number(fact.cmc != null ? fact.cmc : (fact.mv || 0)),
        // null, not 0: a card nobody has a price for is unknown, and a shopping
        // list that prints it as free is worse than one that prints a dash.
        price: fact.price == null || fact.price === "" ? null : Number(fact.price),
        gameChanger: Boolean(fact.gameChanger),
        image: fact.image || fact.imageLarge || ""
      };
    });
    return {
      schema: SCHEMA,
      id: options.id || "U1",
      label: options.label || resolved.name || "Imported deck",
      commander: (resolved.commander || [])[0] || "",
      imported: true,
      source: resolved.source || "paste",
      sourceUrl: resolved.sourceUrl || null,
      importedAt: resolved.importedAt || new Date().toISOString(),
      cards,
      total: cards.reduce((n, c) => n + c.quantity, 0),
      unresolved: resolved.unresolved || [],
      warnings: resolved.warnings || [],
      measured: resolved.measured || null,
      // Only a generated deck has this: which rung of which lens, at what budget
      // target. Carried on the record rather than recomputed, because the ladder
      // it came off does not survive the save -- one rung does.
      generated: resolved.generated || null
    };
  }

  /* What is wrong with this deck, in the order a person would want to hear it.
     A deck can be stored and rendered while any of these hold -- the app is not
     a legality checker and a 97-card work in progress is a real thing to have --
     but it cannot be MEASURED against the published protocol, because that
     protocol is defined on a hundred cards with a commander. */
  function problems(record) {
    const found = [];
    if (!record.commander) found.push("No commander is named.");
    if (record.total !== 100) found.push(`${record.total} cards, not 100.`);
    if ((record.unresolved || []).length) {
      found.push(`${record.unresolved.length} card name${record.unresolved.length === 1 ? "" : "s"} ` +
        `could not be matched: ${record.unresolved.slice(0, 4).join(", ")}` +
        `${record.unresolved.length > 4 ? "…" : ""}`);
    }
    const blank = record.cards.filter((c) => !c.typeLine);
    if (blank.length) {
      found.push(`${blank.length} card${blank.length === 1 ? " has" : "s have"} no printed text, ` +
        `so the simulation would be guessing about ${blank.length === 1 ? "it" : "them"}.`);
    }
    return found;
  }

  const measurable = (record) => problems(record).length === 0;

  /** The list deck-measure.js wants: names, counts, and the facts to run on. */
  function toLineup(record) {
    return (record.cards || []).map((c) => ({
      name: c.name,
      quantity: c.quantity,
      isCommander: c.isCommander,
      price: c.price,
      card: c
    }));
  }

  /* One imported card as a catalog row. Every field the viewer reads is set,
     including the ones that stay zero: a row missing `benchActual` throws where
     a row carrying 0 renders, and an import is exactly where an unexpected
     shape would first show up. */
  function catalogRow(card, deckId, deckIds) {
    const target = {};
    const actual = {};
    deckIds.forEach((id) => { target[id] = 0; actual[id] = 0; });
    target[deckId] = card.quantity;
    actual[deckId] = card.quantity;
    return {
      name: card.name,
      bracket: "",
      target,
      actual,
      benchTarget: 0,
      benchActual: 0,
      qty: card.quantity,
      own: card.quantity,
      cartVendor: "",
      ordered: 0,
      price: card.price,
      type: shortType(card.typeLine),
      subType: subType(card.typeLine),
      color: colorCode(card.colorIdentity, card.typeLine),
      mv: card.mv,
      series: "",
      purpose: "",
      mechanics: card.oracleText ? [card.oracleText] : [],
      notes: "",
      moves: "",
      bench: 0,
      buyCount: 0,
      toBuyCost: 0,
      status: "In Hand",
      priceSource: "scryfall",
      imported: true
    };
  }

  /**
   * Fold imported decks into a loaded master, returning a new one.
   *
   * The input master is never touched: rows it owns are copied before their
   * target maps are widened, so a caller can merge, discard the result, and
   * still hold the master they started with.
   */
  function merge(master, records) {
    const list = (records || []).filter((r) => r && r.cards && r.cards.length);
    if (!list.length) return master;

    const deckIds = (master.decks || []).map((d) => d.id).concat(list.map((r) => r.id));
    const byName = new Map();
    const cards = (master.cards || []).map((row) => {
      // Widen every existing row so a lookup for an imported deck reads 0
      // rather than undefined, which is what `target[id] || 0` was papering over.
      const copy = {...row, target: {...row.target}, actual: {...row.actual}};
      list.forEach((rec) => {
        if (copy.target[rec.id] === undefined) copy.target[rec.id] = 0;
        if (copy.actual[rec.id] === undefined) copy.actual[rec.id] = 0;
      });
      byName.set(copy.name.toLowerCase(), copy);
      return copy;
    });

    const decks = (master.decks || []).slice();
    list.forEach((rec) => {
      rec.cards.forEach((card) => {
        const key = card.name.toLowerCase();
        const existing = byName.get(key);
        if (existing) {
          // A card the six already use gains a target here and nowhere else.
          existing.target[rec.id] = card.quantity;
          existing.actual[rec.id] = card.quantity;
          return;
        }
        const row = catalogRow(card, rec.id, deckIds);
        byName.set(key, row);
        cards.push(row);
      });
      decks.push({
        id: rec.id,
        label: rec.label,
        commander: rec.commander,
        targetCards: rec.total,
        boxCards: rec.total,
        upgrades: [],
        b3: [],
        imported: true,
        source: rec.source,
        sourceUrl: rec.sourceUrl,
        importedAt: rec.importedAt,
        measured: rec.measured,
        // Carried onto the deck the viewer renders, not just the stored record:
        // the banner is the one place a generated deck's rung and lens are
        // visible, and the deck page never sees the record.
        generated: rec.generated || null
      });
    });

    return {...master, decks, cards};
  }

  /* ---------------- storage ---------------- */

  function read(storage) {
    try {
      const raw = JSON.parse((storage || {}).getItem(STORE_KEY) || "null");
      if (!raw || !Array.isArray(raw.decks)) return [];
      return raw.decks.filter((d) => d && d.id && Array.isArray(d.cards));
    } catch (err) {
      return [];
    }
  }

  function write(storage, records) {
    try {
      storage.setItem(STORE_KEY, JSON.stringify({schema: SCHEMA, decks: records}));
      return true;
    } catch (err) {
      // Private browsing, a full quota, or storage switched off. The deck is
      // still usable this session; saying so is the caller's job.
      return false;
    }
  }

  function add(records, record) {
    const next = (records || []).slice();
    const at = next.findIndex((r) => r.id === record.id);
    if (at >= 0) next[at] = record; else next.push(record);
    return next;
  }

  const remove = (records, id) => (records || []).filter((r) => r.id !== id);

  return {
    STORE_KEY, SCHEMA,
    nextId, toRecord, problems, measurable, toLineup, merge,
    catalogRow, colorCode, shortType, subType,
    read, write, add, remove
  };
});
