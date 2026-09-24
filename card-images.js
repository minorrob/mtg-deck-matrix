/**
 * The picture of a card the app does not ship.
 *
 * data/card-facts.json carries images for 668 cards -- the six decks and their ladders. A
 * deck somebody pastes in is a hundred cards the file has never heard of, so opening one of
 * them said "X is not in the card data" over a blank rectangle. The card is real, the app
 * knows its name, and Scryfall has had a picture of it the whole time.
 *
 * THE LADDER, cheapest first, and every rung that answers is remembered:
 *
 *   1. THE SHIPPED FACTS. No network, no storage, already in memory.
 *   2. THIS BROWSER'S CACHE. What was looked up before, kept in localStorage under one key
 *      that Clear session knows about. A deck you opened yesterday costs nothing today.
 *   3. THE DECK RECORD ITSELF. An imported card carries the image Scryfall gave at import
 *      time; a card added from a link carries whatever the link was. Both are already on
 *      disk and neither needs asking for.
 *   4. SCRYFALL. One request, and the answer is cached.
 *
 * WHY NOT A THIRD-PARTY IMAGE HOST as a further rung. TCGplayer's images need its API,
 * which needs a client id and secret this app has nowhere to keep; Archidekt serves images
 * for a deck it hosts but not for an arbitrary card, and not with headers a browser on
 * another origin may read. Scryfall is the one public, CORS-open card-image source, so the
 * honest fallbacks are the two that cost nothing -- what the record already carries, and
 * what the reader pasted -- rather than a third host that would fail silently.
 *
 * THE CACHE IS BOUNDED. localStorage is a few megabytes and a collection is thousands of
 * cards, so it holds CAP entries and drops the least recently used. Every write is wrapped:
 * a full or blocked store costs a cache hit, never a picture.
 *
 * PURE apart from the storage and the client it is handed. tests/card-images.mjs.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCardImages = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KEY = "mtg-card-images.v1";
  var CAP = 600;

  /* Apostrophes are REMOVED rather than turned into a space, so "Teferi's Protection" and
     "Teferis Protection" are one cache entry rather than two. Every other separator becomes
     a space. A cache is the one place where matching a little too generously costs nothing:
     the worst case is showing the right picture for a name spelled slightly differently. */
  function fold(name) {
    return String(name == null ? "" : name).trim().toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/['\u2019\u02bc]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  function read(storage) {
    if (!storage) return {};
    try {
      var parsed = JSON.parse(storage.getItem(KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) { return {}; }
  }

  function write(storage, map) {
    if (!storage) return map;
    try { storage.setItem(KEY, JSON.stringify(map)); } catch (error) { /* full or blocked */ }
    return map;
  }

  /* Least recently used out. `at` is touched on every hit, so the cards somebody actually
     looks at survive a collection ten times the size of the cache. */
  function trim(map) {
    var keys = Object.keys(map);
    if (keys.length <= CAP) return map;
    keys.sort(function (a, b) { return (map[a].at || 0) - (map[b].at || 0); });
    keys.slice(0, keys.length - CAP).forEach(function (key) { delete map[key]; });
    return map;
  }

  function remember(storage, name, image, source, now) {
    if (!name || !image || !image.normal) return null;
    var map = read(storage);
    var entry = {
      small: image.small || image.normal,
      normal: image.normal,
      source: source || "scryfall",
      at: now || Date.now()
    };
    map[fold(name)] = entry;
    write(storage, trim(map));
    return entry;
  }

  function cached(storage, name, now) {
    var map = read(storage);
    var entry = map[fold(name)];
    if (!entry || !entry.normal) return null;
    // Touched, so looking at a card keeps it in the cache.
    entry.at = now || Date.now();
    write(storage, map);
    return entry;
  }

  function forget(storage, name) {
    var map = read(storage);
    delete map[fold(name)];
    return write(storage, map);
  }

  function size(storage) { return Object.keys(read(storage)).length; }

  /* An image off any of the shapes the app stores a card in: the shipped facts file, a
     record made by deck-store, a card made by scryfall-client, or a manual card from a
     pasted link. */
  function imageOf(card) {
    if (!card) return null;
    var normal = card.normal || card.imageLarge || card.image || "";
    var small = card.small || card.image || normal;
    return normal ? {small: small || normal, normal: normal} : null;
  }

  /**
   * The picture for one card. Returns {small, normal, source} or null.
   *
   *   facts    the shipped card-facts map, keyed by printed name
   *   local    a function(name) -> a card the app already holds (a deck record entry, a
   *            manual card), or null
   *   storage  where the cache lives
   *   client   a Scryfall client; omit it and the ladder stops at rung 3
   */
  async function resolve(name, options) {
    var opts = options || {};
    var clean = String(name == null ? "" : name).trim();
    if (!clean) return null;

    var shipped = imageOf((opts.facts || {})[clean]);
    if (shipped) return Object.assign({source: "shipped"}, shipped);

    var hit = cached(opts.storage, clean, opts.now && opts.now());
    if (hit) return {small: hit.small, normal: hit.normal, source: hit.source, cached: true};

    var held = imageOf(opts.local ? opts.local(clean) : null);
    if (held) {
      remember(opts.storage, clean, held, "your deck", opts.now && opts.now());
      return Object.assign({source: "your deck"}, held);
    }

    if (!opts.client || !opts.client.named) return null;
    var card = null;
    try { card = await opts.client.named(clean, {exact: true}); }
    catch (error) { card = null; }
    if (!card) {
      /* One fuzzy retry, because a name that reached this point came out of somebody's
         deck list and may be spelled the way their exporter spells it. */
      try { card = await opts.client.named(clean); } catch (error) { card = null; }
    }
    var found = imageOf(card);
    if (!found) return null;
    remember(opts.storage, clean, found, "scryfall", opts.now && opts.now());
    return Object.assign({source: "scryfall"}, found);
  }

  return {
    KEY: KEY, CAP: CAP,
    read: read, write: write, remember: remember, cached: cached, forget: forget,
    size: size, resolve: resolve, imageOf: imageOf, fold: fold, trim: trim
  };
});
