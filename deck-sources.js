/* Loading a deck from the site it lives on.
 *
 * WHAT ACTUALLY WORKS, MEASURED RATHER THAN ASSUMED. Two deck sites, two
 * different answers, and the difference decides the whole shape of this file:
 *
 *   Archidekt  GET https://archidekt.com/api/decks/<id>/ answers 200 with the
 *              full deck, and every card carries its own `oracleCard` -- name,
 *              mana cost, colour identity, rules text, keywords, types, prices.
 *              A deck loaded this way needs nothing else: it is resolved on
 *              arrival, with no name matching and no second round trip.
 *
 *   Moxfield   the same request answers 403. Not "sometimes", and not because
 *              of an origin header: it is refused outright, to a server and to
 *              a browser alike. So there is no URL path for Moxfield and this
 *              file does not pretend there is one. A Moxfield link is
 *              recognised, and answered with the thing that does work -- open
 *              the deck, More ▾, Export, and paste it in. The paste path is
 *              exact and needs no permission from anybody.
 *
 * That asymmetry is the honest state of the world, not a limitation to be
 * apologised for in a tooltip. A user who pastes gets a better import than one
 * who supplies a link, because a paste cannot be rate-limited or blocked.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDeckSources = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Archidekt writes colour identity out in full -- ["Green"], not ["G"] --
     and everything downstream indexes single letters. */
  const COLOR_LETTER = {White: "W", Blue: "U", Black: "B", Red: "R", Green: "G"};

  const SITES = [
    {
      key: "archidekt",
      label: "Archidekt",
      // archidekt.com/decks/123456/some-slug, with or without the slug.
      test: /archidekt\.com\/decks\/(\d+)/i,
      api: (id) => `https://archidekt.com/api/decks/${id}/`,
      fetchable: true
    },
    {
      key: "moxfield",
      label: "Moxfield",
      test: /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i,
      api: null,
      fetchable: false,
      // Said once, in the words of the buttons the user is looking at.
      advice: "Moxfield refuses API requests from other sites, so a link cannot be " +
        "loaded. Open the deck there, choose More ▾ → Export, copy the box, and " +
        "paste it below — that path is exact and always available."
    },
    {
      key: "deckstats",
      label: "Deckstats",
      test: /deckstats\.net\/decks\/(\d+\/\d+)/i,
      api: null,
      fetchable: false,
      advice: "Deckstats has no open deck endpoint. Use its Export → Plain text " +
        "and paste the list below."
    }
  ];

  /** Which site a URL belongs to, and whether it can be fetched. */
  function identify(url) {
    const text = String(url || "").trim();
    if (!text) return null;
    for (const site of SITES) {
      const hit = site.test.exec(text);
      if (hit) return {...site, id: hit[1], url: text};
    }
    return null;
  }

  const typeLineOf = (oracle) => {
    const parts = []
      .concat(oracle.superTypes || [], oracle.types || [])
      .filter(Boolean).join(" ");
    const sub = (oracle.subTypes || []).filter(Boolean).join(" ");
    return sub ? `${parts} — ${sub}` : parts;
  };

  /* Archidekt prices come as a bag of a dozen vendors. TCGplayer market is the
     figure every other price in this app is quoted in, so it is the one taken,
     with the vendor minimum behind it.

     When neither is there the answer is null, not 0. Archidekt really does send
     a bare 0 for cards it has no price for -- Mana Crypt comes back at 0.00 in
     the response this file's fixture was cut from -- and a $100 card printed as
     "$0.00" on a shopping list is worse than one printed as "-". */
  const priceOf = (card) => {
    const p = card.prices || {};
    const usd = Number(p.tcg || p.tcgMinimum || 0);
    return usd > 0 ? usd : null;
  };

  /**
   * Archidekt's deck JSON -> the resolved shape deck-import.js produces.
   *
   * Returned already resolved: `cards[].card` carries the printed facts, so
   * deck-store and deck-measure need no lookup and no network.
   */
  function fromArchidekt(json, meta) {
    const rows = json && Array.isArray(json.cards) ? json.cards : [];
    // A category the deck marks as not included is a maybeboard by another
    // name, and must not be counted into the hundred.
    const excluded = new Set((json.categories || [])
      .filter((c) => c && c.includedInDeck === false)
      .map((c) => c.name));

    const cards = [];
    const commander = [];
    rows.forEach((row) => {
      const oracle = (row.card || {}).oracleCard || {};
      if (!oracle.name) return;
      const categories = row.categories || [];
      if (categories.some((c) => excluded.has(c))) return;
      if (/^(maybeboard|sideboard|considering)$/i.test(row.label || "")) return;
      const isCommander = categories.some((c) => /^commanders?$/i.test(c));
      if (isCommander) commander.push(oracle.name);
      const typeLine = typeLineOf(oracle);
      cards.push({
        name: oracle.name,
        quantity: Number(row.quantity || 1),
        isCommander,
        card: {
          name: oracle.name,
          typeLine,
          manaCost: oracle.manaCost || "",
          oracleText: oracle.text || "",
          keywords: oracle.keywords || [],
          colorIdentity: (oracle.colorIdentity || [])
            .map((c) => COLOR_LETTER[c] || c).filter((c) => "WUBRG".includes(c)),
          cmc: Number(oracle.cmc || 0),
          price: priceOf(row.card || {}),
          gameChanger: Boolean(oracle.gameChanger)
        }
      });
    });

    const total = cards.reduce((n, c) => n + c.quantity, 0);
    const warnings = [];
    if (!commander.length) {
      warnings.push("No card is in the Commander category on Archidekt, so the " +
        "command zone is unknown. Name the commander before measuring.");
    }
    if (total !== 100) warnings.push(`${total} cards came back, not 100.`);

    return {
      source: "archidekt",
      sourceUrl: (meta && meta.url) || null,
      name: json.name || "Archidekt deck",
      owner: (json.owner || {}).username || "",
      importedAt: new Date().toISOString(),
      commander,
      cards,
      unresolved: [],
      total,
      warnings,
      measured: null
    };
  }

  /**
   * Load a deck by URL.
   *
   * Resolves to {deck} on success and {error, advice, site} otherwise. It never
   * rejects for an unsupported site: "Moxfield will not serve this, here is what
   * to do instead" is an answer, not a failure, and the caller shows it as one.
   */
  async function load(url, options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    const site = identify(url);
    if (!site) {
      return {error: "That does not look like an Archidekt, Moxfield or Deckstats deck link."};
    }
    if (!site.fetchable) {
      return {site, error: `${site.label} decks cannot be loaded by link.`, advice: site.advice};
    }
    if (!fetchImpl) return {site, error: "This browser cannot make the request."};
    let response;
    try {
      response = await fetchImpl(site.api(site.id), {headers: {Accept: "application/json"}});
    } catch (err) {
      return {site, error: `Could not reach ${site.label}. Check the connection, or paste the export instead.`};
    }
    if (!response.ok) {
      return {site, error: response.status === 404
        ? `${site.label} has no deck ${site.id}, or it is private.`
        : `${site.label} answered ${response.status}. Paste the export instead.`};
    }
    const json = await response.json();
    return {site, deck: fromArchidekt(json, {url})};
  }

  return {SITES, identify, load, fromArchidekt, typeLineOf, COLOR_LETTER};
});
