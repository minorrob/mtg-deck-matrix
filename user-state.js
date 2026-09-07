/**
 * Everything this app remembers about YOU, in one enumerable list.
 *
 * WHY A LIST AND NOT A LOOP OVER localStorage. Clearing the session has to produce the
 * experience of somebody who has never opened the app -- no decks, no ownership, no game
 * log, no Copilot dismissals, no looked-up cards. The tempting implementation is to walk
 * every key beginning with "mtg-" and delete it, and it is wrong twice over: it would
 * delete keys other things on the same origin might add later, and it says nothing about
 * what was supposed to be there, so a key that stopped being cleared would be invisible.
 *
 * So the keys are named, one line each, beside the module that owns them.
 * tests/data-integrity.mjs holds every line to that module: rename a key on either side
 * and the suite fails rather than a clear quietly leaving something behind.
 *
 * WHAT IS NOT HERE. data/*.json is the app's own content -- the card catalog, the deck
 * plans, the graph -- and belongs to the repository, not to the reader. Clearing a session
 * does not touch it, which is why the card list is still full afterwards and the deck list
 * is empty: one describes Magic, the other describes you.
 *
 * Pure. No DOM.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgUserState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Every key, with the module that writes it and one line on what is lost with it. The
     `what` is not decoration: it is what the confirmation dialog reads out, so somebody
     about to clear knows what they are clearing. */
  var KEYS = [
    {key: "mtg-deck-matrix-state-v1", owner: "app.js", what: "deck picks, buys, Shop marks, prices and the game log"},
    {key: "mtg-deck-matrix-custom-v1", owner: "custom-model.js", what: "decks built on the Choose step"},
    {key: "mtg-imported-decks.v1", owner: "deck-store.js", what: "decks you added or built"},
    {key: "mtg-manual-cards.v1", owner: "manual-cards.js", what: "cards you added from a link that Scryfall does not have yet"},
    /* Not a thing the reader saved -- a note about which catalog this browser starts
       from. It is backed up and cleared with everything else, but it is not counted as
       "something saved", so clearing a browser that holds only this still reports the
       clean slate it is. */
    {key: "mtg-catalog-source.v1", owner: "user-state.js", meta: true, what: "which catalog this browser starts from"},
    {key: "mtg-viewer-inventory.v1", owner: "viewer.js", what: "the collection you uploaded"},
    {key: "mtg-viewer.v1", owner: "viewer.js", what: "cards ticked on the Bench and To Buy"},
    {key: "mtg-viewer-archived.v1", owner: "viewer.js", what: "which decks you archived"},
    {key: "mtg-graph-dismissed.v1", owner: "graph-page.js", what: "Copilot findings you set aside"},
    {key: "mtg-graph-copilot-filters.v1", owner: "graph-page.js", what: "Copilot filters"},
    {key: "mtg-graph-visitors.v1", owner: "graph-page.js", what: "cards you looked up on the graph"},
    {key: "mtg-shop-extra-filters-v1", owner: "shop-filters.js", what: "extra Shop filters"},
    {key: "mtg-card-metadata-v2", owner: "app.js", what: "card facts fetched for your cards"},
    {key: "mtg-load-undo-v1", owner: "app.js", what: "the undo for the last file load"},
    {key: "mtg-last-export-v1", owner: "app.js", what: "when you last exported"},
    {key: "mtg-header-collapsed-v1", owner: "app.js", what: "whether the header is folded"},
    {key: "mtg-owned-extras-import-v3", owner: "app.js", what: "a one-time ownership import marker"},
    /* Written by versions of this app that predate the current ones. A reader who has been
       here since then still has them, and a clear that left them would leave the next
       migration something to find. */
    {key: "mtg-variant-picks", owner: "app.js", what: "picks from an older version"},
    {key: "mtg-graph-tonight.v1", owner: "graph-page.js", what: "the deck you were playing tonight, from an older version"},
    {key: "mtg-tuned-exclusions-v1", owner: "app.js", what: "tuned-card exclusions from an older version"}
  ];

  /* Scryfall answers, cached for a day so typing a card name twice costs one request. Not
     yours in any meaningful sense -- it is a copy of a public API -- but it is keyed by
     what you looked up, so a clear takes it too. */
  var SESSION_PREFIX = "mtg-scryfall:";

  function keys() { return KEYS.map(function (k) { return k.key; }); }

  /* Which of them this browser actually holds. Reported rather than assumed, because
     "clear my session" on a session with nothing in it should say so rather than claiming
     to have destroyed eighteen things. */
  function present(storage) {
    if (!storage) return [];
    return KEYS.filter(function (k) {
      if (k.meta) return false;
      try { return storage.getItem(k.key) !== null; } catch (err) { return false; }
    });
  }

  /* clearAll has to remove the meta keys too, or a clear leaves a note behind about a
     catalog that is no longer there. present() is what the reader is TOLD about; this is
     what is actually removed. */
  function held(storage) {
    if (!storage) return [];
    return KEYS.filter(function (k) {
      try { return storage.getItem(k.key) !== null; } catch (err) { return false; }
    });
  }

  /**
   * Wipe the lot. Returns what was actually removed, so the caller can say so.
   *
   * Session storage is swept by prefix rather than by name because the keys are Scryfall
   * queries -- there is no list of them, and there is no other writer on this origin.
   */
  function clearAll(storage, session) {
    var gone = held(storage).map(function (k) { return k.key; });
    gone.forEach(function (key) {
      try { storage.removeItem(key); } catch (err) { /* nothing more to do about it */ }
    });
    var cached = 0;
    try {
      if (session) {
        var doomed = [];
        for (var i = 0; i < session.length; i += 1) {
          var name = session.key(i);
          if (name && name.indexOf(SESSION_PREFIX) === 0) doomed.push(name);
        }
        doomed.forEach(function (name) { session.removeItem(name); });
        cached = doomed.length;
      }
    } catch (err) { /* session storage off, or blocked */ }
    return {keys: gone, cached: cached};
  }

  /** True when this browser looks like one that has never opened the app. */
  function isFresh(storage) { return present(storage).length === 0; }

  /* WHICH CATALOG THIS BROWSER STARTS FROM, decided once and then left alone.
   * ------------------------------------------------------------------------
   * It used to be inferred on every render: "show the six shipped decks unless this
   * browser has saved nothing at all". Which meant Clear session emptied the page, and
   * then adding a single deck of your own brought all six back -- along with their
   * collection, their bench and their ownership figures -- because saving that deck made
   * the browser no longer empty. Somebody who had deliberately cleared everything got
   * 459 bench copies of someone else's cards for the crime of adding a deck.
   *
   * The inference was never the point; it was a guess at a decision. So the decision is
   * recorded instead:
   *
   *   "empty"    start with nothing. Set by Clear session, and by the first boot of a
   *              browser that had nothing saved. Adding decks does not change it.
   *   "default"  start with the six shipped decks and the collection behind them. Set by
   *              Load default, and by the first boot of a browser that already had state.
   *
   * `resolve` is the one both pages call: it answers, and on a browser that has never
   * decided it writes down the answer so the same question cannot be answered differently
   * five minutes later.
   */
  var CATALOG_KEY = "mtg-catalog-source.v1";

  function catalogSource(storage) {
    if (!storage) return "";
    try {
      var value = storage.getItem(CATALOG_KEY);
      return value === "empty" || value === "default" ? value : "";
    } catch (err) { return ""; }
  }

  function setCatalogSource(storage, value) {
    if (!storage) return value;
    try {
      if (value === "empty" || value === "default") storage.setItem(CATALOG_KEY, value);
      else storage.removeItem(CATALOG_KEY);
    } catch (err) { /* storage off or full; the inference below still answers */ }
    return value;
  }

  function resolveCatalogSource(storage) {
    var recorded = catalogSource(storage);
    if (recorded) return recorded;
    return setCatalogSource(storage, isFresh(storage) ? "empty" : "default");
  }

  /** True when this browser should show no shipped decks and no shipped ownership. */
  function startsEmpty(storage) { return resolveCatalogSource(storage) === "empty"; }

  /**
   * EVERYTHING, AS ONE FILE.
   *
   * Both pages had an export and neither covered the other: the Matrix wrote its own
   * app state, My Decks wrote nothing at all, and "download a backup first" before a
   * clear therefore offered to save a third of what the clear was about to destroy.
   * A backup taken against this list covers exactly the keys the clear removes, which
   * is the only definition of "backup" that means anything here.
   *
   * Values are stored as their raw strings rather than re-parsed. Some of these keys
   * hold JSON and some hold a bare number or a timestamp, and a restore that
   * round-tripped through JSON.parse would have to know which is which -- and would
   * silently drop the ones it guessed wrong about.
   */
  function snapshot(storage) {
    var values = {};
    /* held(), not present(): a backup has to cover exactly what a clear destroys, and the
       clear takes the meta keys too. Restoring a backup of a cleared browser should give
       back a cleared browser, not one that re-guesses. */
    held(storage).forEach(function (k) {
      try { values[k.key] = storage.getItem(k.key); } catch (err) { /* skip it */ }
    });
    return {
      kind: "mtg-deck-matrix-browser-backup",
      version: 1,
      savedAt: new Date().toISOString(),
      keys: Object.keys(values),
      values: values
    };
  }

  /**
   * Put a snapshot back. Returns {restored, skipped} -- skipped names keys the file
   * carries that this build does not know about, which is what a backup from a newer
   * version looks like and is worth saying rather than silently dropping.
   */
  function restore(storage, file) {
    if (!file || file.kind !== "mtg-deck-matrix-browser-backup" || !file.values) {
      throw new Error("That is not a backup of this app.");
    }
    var known = {};
    KEYS.forEach(function (k) { known[k.key] = true; });
    var restored = [], skipped = [];
    Object.keys(file.values).forEach(function (key) {
      if (!known[key]) { skipped.push(key); return; }
      try { storage.setItem(key, String(file.values[key])); restored.push(key); }
      catch (err) { skipped.push(key); }
    });
    return {restored: restored, skipped: skipped};
  }

  return {KEYS: KEYS, SESSION_PREFIX: SESSION_PREFIX, keys: keys, present: present,
          clearAll: clearAll, isFresh: isFresh, snapshot: snapshot, restore: restore,
          CATALOG_KEY: CATALOG_KEY, catalogSource: catalogSource,
          setCatalogSource: setCatalogSource, resolveCatalogSource: resolveCatalogSource,
          startsEmpty: startsEmpty};
});
