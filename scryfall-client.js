(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgScryfall = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const API_BASE = "https://api.scryfall.com";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const CACHE_PREFIX = "mtg-scryfall:";
  const MAX_ATTEMPTS = 4;
  const COLLECTION_BATCH = 75;

  function memoryCache() {
    const store = new Map();
    return {
      get: (key) => (store.has(key) ? store.get(key) : null),
      set: (key, value) => void store.set(key, value)
    };
  }

  function sessionCache() {
    try {
      if (typeof sessionStorage === "undefined") return memoryCache();
      sessionStorage.setItem(`${CACHE_PREFIX}probe`, "1");
      sessionStorage.removeItem(`${CACHE_PREFIX}probe`);
    } catch (error) {
      return memoryCache();
    }
    return {
      get: (key) => sessionStorage.getItem(CACHE_PREFIX + key),
      set(key, value) {
        try {
          sessionStorage.setItem(CACHE_PREFIX + key, value);
        } catch (error) {
          // A full quota only costs us the cache, never the lookup itself.
        }
      }
    };
  }

  function decodeAffiliateTarget(url) {
    const match = /[?&]u=([^&#]+)/.exec(url);
    if (!match) return null;
    try {
      const decoded = decodeURIComponent(match[1]);
      return /tcgplayer\.com/i.test(decoded) ? decoded : null;
    } catch (error) {
      return null;
    }
  }

  function slugToName(slug) {
    return String(slug || "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // TCGplayer links reach us in four shapes: a bare product link, a product link
  // with a set-prefixed slug, an affiliate wrapper carrying the real link in `u`,
  // and a search link whose `q` is the card name. Everything the caller can use
  // for a lookup comes back at once so resolution can fall back without reparsing.
  function parseTcgplayerUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const target = decodeAffiliateTarget(raw) || raw;
    if (!/tcgplayer\.com/i.test(target)) return null;
    const productId = (/\/product\/(\d+)/.exec(target) || [])[1] || null;
    const query = (/[?&]q=([^&#]+)/.exec(target) || [])[1] || null;
    const slug = (/\/product\/\d+\/([^?#/]+)/.exec(target) || /tcgplayer\.com\/(?:magic|product)\/[^/]+\/([^?#/]+)/.exec(target) || [])[1] || null;
    let name = null;
    if (query) {
      try {
        name = decodeURIComponent(query.replace(/\+/g, " ")).trim() || null;
      } catch (error) {
        name = null;
      }
    }
    return {productId: productId ? Number(productId) : null, name, slug, url: target, affiliate: target !== raw};
  }

  // A product slug is "<set words>-<card name>" with no separator we can trust,
  // so a fuzzy lookup gets progressively shorter leading trims until one sticks.
  function slugNameCandidates(slug) {
    const words = slugToName(slug).split(" ").filter(Boolean);
    const candidates = [];
    for (let drop = 0; drop < Math.min(4, words.length); drop += 1) {
      const candidate = words.slice(drop).join(" ");
      if (candidate.length > 2) candidates.push(candidate);
    }
    return candidates;
  }

  function faceValue(raw, key) {
    const direct = raw[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
    const values = (raw.card_faces || []).map((face) => face[key]).filter((value) => value !== undefined && value !== null && value !== "");
    return values.length ? values.join(" // ") : "";
  }

  function imageFor(raw, size) {
    return raw.image_uris?.[size] || raw.card_faces?.[0]?.image_uris?.[size] || "";
  }

  function normalizeCard(raw) {
    if (!raw || raw.object === "error") return null;
    const prices = raw.prices || {};
    const usd = Number(prices.usd) || Number(prices.usd_etched) || Number(prices.usd_foil) || 0;
    const typeLine = faceValue(raw, "type_line");
    const oracleText = faceValue(raw, "oracle_text");
    return {
      scryfallId: raw.id || "",
      name: raw.name || "",
      manaCost: faceValue(raw, "mana_cost"),
      cmc: Number(raw.cmc || 0),
      typeLine,
      oracleText,
      keywords: raw.keywords || [],
      colors: raw.colors || raw.card_faces?.[0]?.colors || [],
      colorIdentity: raw.color_identity || [],
      legalities: raw.legalities || {},
      commanderLegal: (raw.legalities?.commander || "legal") === "legal",
      rarity: raw.rarity || "",
      set: raw.set || "",
      setName: raw.set_name || "",
      image: imageFor(raw, "small"),
      imageLarge: imageFor(raw, "normal"),
      price: usd,
      ceiling: Number(prices.usd_foil) || usd,
      edhrecRank: Number(raw.edhrec_rank) || null,
      gameChanger: Boolean(raw.game_changer),
      reserved: Boolean(raw.reserved),
      producedMana: raw.produced_mana || [],
      layout: raw.layout || "normal",
      tcgplayerId: raw.tcgplayer_id || null,
      tcgplayerUrl: raw.purchase_uris?.tcgplayer || "",
      isLand: /\bLand\b/.test(typeLine),
      isBasicLand: /\bBasic Land\b/.test(typeLine),
      canBeCommander: /Legendary/.test(typeLine) && (/Creature/.test(typeLine) || /can be your commander/i.test(oracleText))
    };
  }

  function createClient(options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error("Scryfall client requires a fetch implementation");
    const baseUrl = options.baseUrl || API_BASE;
    const delayMs = Number.isFinite(options.delayMs) ? Number(options.delayMs) : 120;
    const cache = options.cache || sessionCache();
    const now = options.now || (() => Date.now());
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const stats = {requests: 0, cacheHits: 0, retries: 0, errors: 0, notFound: 0};
    let chain = Promise.resolve();
    let lastRequestAt = 0;

    function enqueue(task) {
      const run = chain.then(async () => {
        const wait = delayMs - (now() - lastRequestAt);
        if (wait > 0) await sleep(wait);
        lastRequestAt = now();
        return task();
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    }

    function readCache(key) {
      const raw = cache.get(key);
      if (!raw) return null;
      try {
        const entry = JSON.parse(raw);
        if (!entry || now() - Number(entry.savedAt || 0) > CACHE_TTL_MS) return null;
        stats.cacheHits += 1;
        return entry.payload;
      } catch (error) {
        return null;
      }
    }

    function writeCache(key, payload) {
      try {
        cache.set(key, JSON.stringify({savedAt: now(), payload}));
      } catch (error) {
        // Cache writes are best effort; a failure must never fail a lookup.
      }
    }

    async function request(path, init = {}) {
      const key = `${init.method || "GET"} ${path}${init.body ? ` ${init.body}` : ""}`;
      const cached = readCache(key);
      if (cached !== null) return cached;
      let attempt = 0;
      let lastError = null;
      while (attempt < MAX_ATTEMPTS) {
        attempt += 1;
        try {
          const payload = await enqueue(async () => {
            stats.requests += 1;
            const response = await fetchImpl(`${baseUrl}${path}`, {
              method: init.method || "GET",
              headers: {Accept: "application/json", ...(init.body ? {"Content-Type": "application/json"} : {}), ...(init.headers || {})},
              body: init.body,
              signal: init.signal
            });
            if (response.status === 404) {
              stats.notFound += 1;
              return {status: 404, data: null};
            }
            if (response.status === 429 || response.status >= 500) return {status: response.status, retry: true};
            if (!response.ok) throw new Error(`Scryfall responded ${response.status}`);
            return {status: response.status, data: await response.json()};
          });
          if (payload.retry) {
            stats.retries += 1;
            lastError = new Error(`Scryfall responded ${payload.status}`);
            await sleep(250 * (2 ** (attempt - 1)));
            continue;
          }
          writeCache(key, payload.data);
          return payload.data;
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          lastError = error;
          stats.retries += 1;
          await sleep(250 * (2 ** (attempt - 1)));
        }
      }
      stats.errors += 1;
      throw lastError || new Error("Scryfall request failed");
    }

    async function search(query, searchOptions = {}) {
      const maxPages = Number(searchOptions.maxPages || 1);
      const order = searchOptions.order || "edhrec";
      const unique = searchOptions.unique || "cards";
      const direction = searchOptions.direction || "auto";
      const cards = [];
      for (let page = 1; page <= maxPages; page += 1) {
        const path = `/cards/search?q=${encodeURIComponent(query)}&order=${encodeURIComponent(order)}&unique=${encodeURIComponent(unique)}&dir=${encodeURIComponent(direction)}&page=${page}`;
        let data = null;
        try {
          data = await request(path, {signal: searchOptions.signal});
        } catch (error) {
          if (searchOptions.tolerant === false) throw error;
          break;
        }
        if (!data || !Array.isArray(data.data)) break;
        data.data.forEach((raw) => {
          const card = normalizeCard(raw);
          if (card) cards.push(card);
        });
        if (!data.has_more) break;
      }
      return cards;
    }

    async function named(name, namedOptions = {}) {
      const clean = String(name || "").trim();
      if (!clean) return null;
      const key = namedOptions.exact ? "exact" : "fuzzy";
      const data = await request(`/cards/named?${key}=${encodeURIComponent(clean)}`, {signal: namedOptions.signal});
      return normalizeCard(data);
    }

    async function byTcgplayerId(id, idOptions = {}) {
      const numeric = Number(id);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;
      const data = await request(`/cards/tcgplayer/${numeric}`, {signal: idOptions.signal});
      return normalizeCard(data);
    }

    async function collection(identifiers, collectionOptions = {}) {
      const list = (identifiers || []).map((entry) => (typeof entry === "string" ? {name: entry} : entry)).filter(Boolean);
      const found = [];
      const missing = [];
      for (let index = 0; index < list.length; index += COLLECTION_BATCH) {
        const batch = list.slice(index, index + COLLECTION_BATCH);
        const data = await request("/cards/collection", {
          method: "POST",
          body: JSON.stringify({identifiers: batch}),
          signal: collectionOptions.signal
        });
        (data?.data || []).forEach((raw) => {
          const card = normalizeCard(raw);
          if (card) found.push(card);
        });
        (data?.not_found || []).forEach((entry) => missing.push(entry.name || entry.id || ""));
      }
      return {cards: found, missing};
    }

    // Resolution order matches how reliable each signal is: the product id is
    // exact, an explicit `q` is the card name, and the slug is only a guess.
    async function resolveTcgplayerUrl(value, resolveOptions = {}) {
      const parsed = parseTcgplayerUrl(value);
      if (!parsed) return {card: null, parsed: null, error: "That does not look like a TCGplayer link."};
      if (parsed.productId) {
        const card = await byTcgplayerId(parsed.productId, resolveOptions);
        if (card) return {card, parsed, matchedBy: "product-id"};
      }
      if (parsed.name) {
        const card = await named(parsed.name, resolveOptions);
        if (card) return {card, parsed, matchedBy: "search-query"};
      }
      for (const candidate of parsed.slug ? slugNameCandidates(parsed.slug) : []) {
        const card = await named(candidate, resolveOptions);
        if (card) return {card, parsed, matchedBy: "slug"};
      }
      return {card: null, parsed, error: "No Scryfall card matched that TCGplayer link."};
    }

    return {
      search,
      named,
      collection,
      byTcgplayerId,
      resolveTcgplayerUrl,
      parseTcgplayerUrl,
      normalizeCard,
      stats: () => ({...stats})
    };
  }

  return {createClient, parseTcgplayerUrl, slugNameCandidates, normalizeCard, API_BASE, CACHE_TTL_MS};
});
