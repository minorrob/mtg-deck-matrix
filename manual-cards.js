/**
 * The cards Scryfall does not know yet.
 *
 * A card added from a link that no lookup could place is kept anyway -- see card-link.js for
 * why -- and it has to be kept SOMEWHERE, because the reader will add another one next week
 * and because the reason it did not resolve is usually temporary. A card spoiled on Tuesday
 * is in the bulk data by Friday.
 *
 * So manual cards are a population, not a one-off. This module owns it:
 *
 *   - it lives under one localStorage key, enumerated in user-state.js so Clear session
 *     actually clears it and a browser backup actually carries it;
 *   - `recheck` asks Scryfall about all of them in ONE request -- /cards/collection takes
 *     seventy-five identifiers at a time -- rather than one request per card per page load;
 *   - `promote` writes the answer back into every stored deck holding that card, so a deck
 *     that could not be scored on Tuesday can be scored on Friday without anyone re-typing
 *     anything.
 *
 * WHAT IT DOES NOT DO. It never invents rules text, never guesses a type line, and never
 * quietly upgrades a card to something with a different name. A promotion happens only on an
 * exact name match, because "close enough" on a card the reader deliberately added by hand is
 * how you end up with a deck nobody recognizes.
 *
 * PURE: storage and the Scryfall client are both handed in. tests/manual-cards.mjs runs the
 * whole thing against stubs.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgManualCards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KEY = "mtg-manual-cards.v1";

  function fold(name) {
    return String(name == null ? "" : name).trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  function read(storage) {
    if (!storage) return [];
    try {
      var parsed = JSON.parse(storage.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(function (c) { return c && c.name; }) : [];
    } catch (error) {
      return [];
    }
  }

  function write(storage, list) {
    if (!storage) return list;
    try { storage.setItem(KEY, JSON.stringify(list || [])); } catch (error) { /* full or blocked */ }
    return list;
  }

  /** Add one, replacing any earlier record of the same name rather than stacking duplicates. */
  function add(storage, card) {
    if (!card || !card.name) return read(storage);
    var list = read(storage).filter(function (c) { return fold(c.name) !== fold(card.name); });
    list.push(Object.assign({}, card, {manual: true}));
    return write(storage, list);
  }

  function remove(storage, name) {
    return write(storage, read(storage).filter(function (c) { return fold(c.name) !== fold(name); }));
  }

  function get(storage, name) {
    return read(storage).filter(function (c) { return fold(c.name) === fold(name); })[0] || null;
  }

  /**
   * Ask Scryfall about every manual card at once. Returns {found, still}:
   *
   *   found  [{name, card}] -- the manual name, and the real card that now answers to it
   *   still  the manual records Scryfall still does not have
   *
   * An exact name match only. A card that comes back under a different name is not this
   * card, and a fuzzy promotion would replace what the reader added with something else.
   */
  async function recheck(list, client) {
    var manual = (list || []).filter(function (c) { return c && c.name; });
    if (!manual.length || !client || !client.collection) return {found: [], still: manual};
    var result;
    try {
      result = await client.collection(manual.map(function (c) { return {name: c.name}; }));
    } catch (error) {
      return {found: [], still: manual, error: String(error && error.message || error)};
    }
    var byName = Object.create(null);
    (result && result.cards || []).forEach(function (card) {
      if (card && card.name) byName[fold(card.name)] = card;
    });
    var found = [];
    var still = [];
    manual.forEach(function (entry) {
      var card = byName[fold(entry.name)];
      if (card) found.push({name: entry.name, card: card});
      else still.push(entry);
    });
    return {found: found, still: still};
  }

  /**
   * Write promotions back into stored deck records. Pure: returns new records and how many
   * card slots changed, and touches nothing when there is nothing to do.
   */
  function promote(records, found) {
    var byName = Object.create(null);
    (found || []).forEach(function (entry) {
      if (entry && entry.name && entry.card) byName[fold(entry.name)] = entry.card;
    });
    if (!Object.keys(byName).length) return {records: records || [], changed: 0};
    /* A stored deck record holds cards FLATTENED -- deck-store's toRecord copies the fields
       it needs off the Scryfall card rather than keeping the card. So a promotion writes
       those same fields, and clears the three that made it manual. */
    var changed = 0;
    var next = (records || []).map(function (record) {
      var touched = false;
      var cards = (record.cards || []).map(function (entry) {
        if (!entry || !entry.manual) return entry;
        var real = byName[fold(entry.name)];
        if (!real) return entry;
        changed += 1;
        touched = true;
        return Object.assign({}, entry, {
          name: real.name,
          typeLine: real.typeLine || real.type_line || "",
          manaCost: real.manaCost || "",
          oracleText: real.oracleText || "",
          keywords: real.keywords || [],
          colorIdentity: Array.isArray(real.colorIdentity) ? real.colorIdentity : [],
          mv: Number(real.cmc != null ? real.cmc : (real.mv || 0)),
          price: real.price == null || real.price === "" ? null : Number(real.price),
          gameChanger: Boolean(real.gameChanger),
          image: real.image || real.imageLarge || entry.image || "",
          manual: false,
          source: "",
          sourceSite: ""
        });
      });
      return touched ? Object.assign({}, record, {cards: cards}) : record;
    });
    return {records: changed ? next : (records || []), changed: changed};
  }

  /** How many manual cards a deck record is carrying, for the problems list. */
  function countIn(record) {
    return ((record && record.cards) || []).filter(function (entry) {
      return entry && entry.manual;
    }).length;
  }

  return {
    KEY: KEY, read: read, write: write, add: add, remove: remove, get: get,
    recheck: recheck, promote: promote, countIn: countIn, fold: fold
  };
});
