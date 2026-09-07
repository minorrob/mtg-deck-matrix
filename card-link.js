/**
 * "It is this card. Here is the link."
 *
 * The fix-the-names screen offers five guesses and a way to give up. Sometimes the reader
 * knows exactly which card they meant and none of the five is it -- a card too new for the
 * bulk data, a promo, an Alchemy rebalance, or a name Scryfall spells differently enough
 * that no rung reached it. They are looking at the card in another tab. This turns that tab
 * into an answer.
 *
 * WHAT A LINK IS WORTH depends entirely on where it points, and the ladder is ordered by
 * how certain each source is:
 *
 *   1. A SCRYFALL CARD PAGE names a printing outright: scryfall.com/card/blb/238/sheltered-by-ghosts
 *      is set `blb`, collector number `238`, and /cards/blb/238 returns that exact card. No
 *      guessing at all.
 *   2. A LINK CARRYING A SEARCH says the name in the open: ?q=Sol+Ring, and TCGplayer's
 *      search links do the same.
 *   3. A TCGPLAYER PRODUCT ID is exact for a product, and Scryfall indexes it: /cards/tcgplayer/59989.
 *   4. A SLUG is a guess. edhrec.com/cards/sol-ring, cardkingdom.com/mtg/c21/sol-ring and
 *      cardmarket's /Singles/Commander-2021/Sol-Ring all end in the name with the hyphens
 *      taken out -- but so does every URL, so the guess gets checked, never trusted.
 *
 * WHEN EVERY RUNG MISSES the link is still worth more than nothing, and that is the point of
 * this module. A card Scryfall has never heard of is still a card the reader is holding, and
 * refusing it is the same dead end the fix screen was built to remove. So the link becomes a
 * MANUAL CARD: the name they were asking about, the picture if the link is one, the address
 * it came from, and an honest `manual: true` that follows it everywhere -- into the deck, into
 * the problems list, onto the screen. manual-cards.js keeps the population of them and asks
 * Scryfall again later; the day the card is indexed, it stops being manual on its own.
 *
 * A MANUAL CARD IS NOT A SCORED CARD. It has no type line and no rules text, so the
 * simulation cannot play it and deck-store's `problems()` says so in as many words. That is
 * the trade being offered: your deck is complete and honest about what it is missing, rather
 * than one card short and silent about why.
 *
 * PURE apart from the client it is handed. tests/card-link.mjs runs the whole ladder against
 * a stub, and every parse in it is offline.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCardLink = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var IMAGE = /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i;

  /* Hosts worth naming on screen. Anything else is shown by its own hostname, which is
     more use to a reader than "another site". */
  var SITES = [
    {test: /(?:^|\.)scryfall\.com$/i, label: "Scryfall"},
    {test: /(?:^|\.)cards\.scryfall\.io$/i, label: "Scryfall"},
    {test: /(?:^|\.)tcgplayer\.com$/i, label: "TCGplayer"},
    {test: /(?:^|\.)edhrec\.com$/i, label: "EDHREC"},
    {test: /(?:^|\.)cardkingdom\.com$/i, label: "Card Kingdom"},
    {test: /(?:^|\.)cardmarket\.com$/i, label: "Cardmarket"},
    {test: /(?:^|\.)moxfield\.com$/i, label: "Moxfield"},
    {test: /(?:^|\.)archidekt\.com$/i, label: "Archidekt"},
    {test: /(?:^|\.)coolstuffinc\.com$/i, label: "CoolStuffInc"},
    {test: /(?:^|\.)starcitygames\.com$/i, label: "Star City Games"},
    {test: /(?:^|\.)gatherer\.wizards\.com$/i, label: "Gatherer"}
  ];

  function siteLabel(host) {
    for (var i = 0; i < SITES.length; i += 1) if (SITES[i].test.test(host)) return SITES[i].label;
    return host.replace(/^www\./i, "");
  }

  function parseUrl(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return null;
    /* A pasted link is as often "scryfall.com/card/..." as "https://scryfall.com/card/...".
       Assume https rather than refusing something that is plainly a link. */
    var withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
    try {
      var url = new URL(withScheme);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (!/\./.test(url.hostname)) return null;
      return url;
    } catch (error) {
      return null;
    }
  }

  /* "sheltered-by-ghosts" -> "sheltered by ghosts". Hyphens and underscores only; a slug
     that is all digits, or too short to be a card name, is worth nothing and says so. */
  function slugToName(slug) {
    var text = decodeURIComponent(String(slug || ""))
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[-_+]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 3) return "";
    if (!/[a-z]/i.test(text)) return "";
    return text;
  }

  /* A slug is often "<set words> <card name>" with nothing to mark the join, so the
     candidates are the whole thing and then progressively shorter tails. Longest first:
     the full slug is right far more often than a trimmed one, and a wrong trim that
     happens to be a real card is the worst outcome available. */
  function nameCandidates(name) {
    var words = String(name || "").split(" ").filter(Boolean);
    var out = [];
    for (var drop = 0; drop < Math.min(4, words.length); drop += 1) {
      var candidate = words.slice(drop).join(" ");
      if (candidate.length > 2) out.push(candidate);
    }
    return out;
  }

  function queryName(url) {
    var q = url.searchParams.get("q") || url.searchParams.get("name")
      || url.searchParams.get("productName") || "";
    q = String(q).replace(/\+/g, " ").trim();
    /* A Scryfall search can be a whole query language -- "t:creature c:rw" is not a name.
       Take it only when it looks like plain words. */
    if (!q || /[:<>="]/.test(q)) return "";
    return q;
  }

  function segments(url) {
    return url.pathname.split("/").map(function (part) { return part.trim(); }).filter(Boolean);
  }

  /**
   * What this link is, and everything it says about a card, with no network at all.
   * Returns null when the value is not a usable http(s) link.
   */
  function identify(value) {
    var url = parseUrl(value);
    if (!url) return null;
    var host = url.hostname.toLowerCase();
    var parts = segments(url);
    var link = {
      kind: "slug",
      site: siteLabel(host),
      host: host,
      url: url.href,
      set: "",
      number: "",
      name: "",
      image: "",
      productId: null
    };

    /* An affiliate wrapper carries the real destination in `u`; the app's own TCGplayer
       links are built that way, so a reader copying one back in must land somewhere. */
    var wrapped = url.searchParams.get("u");
    if (wrapped && /^https?:\/\//i.test(wrapped) && wrapped !== url.href) {
      var inner = identify(wrapped);
      if (inner) return Object.assign(inner, {wrapped: true});
    }

    if (/scryfall\.io$/i.test(host) || IMAGE.test(url.pathname)) {
      link.kind = /scryfall\.io$/i.test(host) ? "scryfall-image" : "image";
      link.image = url.href;
      /* A Scryfall image path is a uuid, so it names nothing; some other host's image is
         often <name>.jpg and worth reading. */
      if (link.kind === "image") link.name = slugToName(parts[parts.length - 1] || "");
      return link;
    }

    if (/scryfall\.com$/i.test(host)) {
      // /card/<set>/<number>[/<slug>] -- the only shape that names a printing exactly.
      if (parts[0] === "card" && parts[1] && parts[2]) {
        link.kind = "scryfall-card";
        link.set = parts[1].toLowerCase();
        link.number = parts[2];
        link.name = slugToName(parts[3] || "");
        return link;
      }
      link.kind = "scryfall-search";
      link.name = queryName(url);
      return link;
    }

    if (/tcgplayer\.com$/i.test(host)) {
      link.kind = "tcgplayer";
      var product = /\/product\/(\d+)/.exec(url.pathname);
      link.productId = product ? Number(product[1]) : null;
      link.name = queryName(url) || slugToName(product ? (parts[parts.indexOf(product[1]) + 1] || "")
        : (parts[parts.length - 1] || ""));
      return link;
    }

    // Everything else: the last path segment, if it reads like words.
    link.name = queryName(url) || slugToName(parts[parts.length - 1] || "");
    return link;
  }

  /* The card record a link becomes when Scryfall cannot place it. Every field the app reads
     is present, so a manual card flows through the deck, the table and the export unchanged
     -- and `manual` is the one field that makes it visible as what it is. */
  function manualCard(link, options) {
    var opts = options || {};
    var name = String(opts.name || (link && link.name) || "").trim();
    return {
      scryfallId: "",
      oracleId: "",
      name: name,
      manaCost: "",
      cmc: 0,
      typeLine: "",
      oracleText: "",
      keywords: [],
      colors: [],
      colorIdentity: [],
      legalities: {},
      commanderLegal: true,
      rarity: "",
      set: link && link.set ? link.set : "",
      setName: "",
      image: (link && link.image) || "",
      imageLarge: (link && link.image) || "",
      price: 0,
      ceiling: 0,
      edhrecRank: null,
      gameChanger: false,
      reserved: false,
      producedMana: [],
      layout: "normal",
      tcgplayerId: link && link.productId ? link.productId : null,
      tcgplayerUrl: link && link.host && /tcgplayer/.test(link.host) ? link.url : "",
      isLand: false,
      isBasicLand: false,
      canBeCommander: false,
      /* The three fields that only a manual card has. */
      manual: true,
      source: link ? link.url : "",
      sourceSite: link ? link.site : "",
      addedAt: opts.now ? opts.now() : new Date().toISOString()
    };
  }

  /**
   * Turn a link into a card. Returns {link, card, manual, via, error}.
   *
   *   card    a real Scryfall card, when a rung placed it
   *   manual  the fallback record, when none did and `allowManual` is not false
   *   via     which rung answered, for the line shown under the button
   *
   * A rung that throws is skipped, not fatal: an offline lookup should still leave the
   * reader with a manual card rather than an error message.
   */
  async function resolveLink(value, client, options) {
    var opts = options || {};
    var link = identify(value);
    if (!link) return {link: null, card: null, manual: null, error: "That does not look like a link."};

    async function tryRung(run) {
      try { return await run(); } catch (error) { return null; }
    }

    // 1. An exact printing.
    if (link.kind === "scryfall-card" && link.set && link.number && client && client.bySetNumber) {
      var exact = await tryRung(function () { return client.bySetNumber(link.set, link.number); });
      if (exact) return {link: link, card: exact, manual: null, via: "the Scryfall printing"};
    }

    // 2. A name the link states outright.
    if (link.name && client && client.named) {
      var byName = await tryRung(function () { return client.named(link.name, {exact: true}); });
      if (byName) return {link: link, card: byName, manual: null, via: "the name in the link"};
    }

    // 3. A TCGplayer product, which Scryfall indexes by id.
    if (link.productId && client && client.byTcgplayerId) {
      var byProduct = await tryRung(function () { return client.byTcgplayerId(link.productId); });
      if (byProduct) return {link: link, card: byProduct, manual: null, via: "the TCGplayer product"};
    }

    // 4. The slug, as a guess, checked against Scryfall before it is believed.
    if (link.name && client && client.named) {
      var candidates = nameCandidates(link.name);
      for (var i = 0; i < candidates.length; i += 1) {
        var guess = await tryRung((function (candidate) {
          return function () { return client.named(candidate); };
        })(candidates[i]));
        if (guess) return {link: link, card: guess, manual: null, via: "the name in the address"};
      }
    }

    if (opts.allowManual === false) {
      return {link: link, card: null, manual: null,
        error: "Scryfall does not have a card at that link."};
    }
    return {link: link, card: null, manual: manualCard(link, opts), via: "the link itself"};
  }

  return {
    identify: identify,
    resolveLink: resolveLink,
    manualCard: manualCard,
    slugToName: slugToName,
    nameCandidates: nameCandidates
  };
});
