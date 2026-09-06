(function (root, factory) {
  "use strict";
  const isNode = typeof module === "object" && module.exports && typeof require === "function";
  const lineup = isNode ? require("./lineup-model.js") : root && root.MtgLineupModel;
  const compliance = isNode ? require("./compliance-model.js") : root && root.MtgComplianceModel;
  const api = factory(lineup, compliance);
  if (isNode) module.exports = api;
  if (root) root.MtgDeckGenerator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup, Compliance) {
  "use strict";

  if (!Lineup || !Compliance) throw new Error("Deck generator requires the lineup and compliance models");

  const cardKey = Lineup.normalizeName;
  const DECK_SIZE = 100;
  const DEFAULT_LANDS = 36;
  const MIN_ROLE_RESULTS = 12;
  const MAX_TUNED_SWAPS = 10;
  const MAX_ENHANCE_SWAPS = 8;
  const MAX_MAX_SWAPS = 8;
  const ENHANCE_PRICE_CAP = 20;
  // Charged per earlier variant that already used a card, so five lenses on one
  // commander stay genuinely different lists instead of five reshuffles.
  const OVERLAP_PENALTY = 0.1;
  const TIER3_GAME_CHANGER_CAP = 3;
  const COLOR_BASICS = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest"};
  const STAGES = ["Base", "Tuned", "Maxed"];

  // Spell roles, in fill order. `ideal` is the mana value the curve wants for the
  // role; `quota` sums to 63, which is the deck minus 36 lands and the commander.
  const ROLE_QUOTAS = {
    ramp: {quota: 10, ideal: 2},
    draw: {quota: 10, ideal: 3},
    removal: {quota: 8, ideal: 2.5},
    wipe: {quota: 3, ideal: 5},
    protection: {quota: 3, ideal: 2},
    finisher: {quota: 5, ideal: 6},
    theme: {quota: 24, ideal: 3.5}
  };
  const ROLE_ORDER = ["ramp", "draw", "removal", "wipe", "protection", "finisher", "theme"];

  const ROLE_QUERIES = {
    ramp: {tag: "otag:ramp", fallback: '(oracle:"add {" or oracle:"search your library for a basic land card")', extra: "-type:land"},
    draw: {tag: "otag:card-draw", fallback: '(oracle:"draw a card" or oracle:"draw two cards" or oracle:"draw three cards")', extra: ""},
    removal: {tag: "otag:removal", fallback: '(oracle:"destroy target" or oracle:"exile target")', extra: ""},
    wipe: {tag: "otag:board-wipe", fallback: '(oracle:"destroy all" or oracle:"exile all" or oracle:"each player sacrifices")', extra: ""},
    protection: {tag: "otag:protection", fallback: '(oracle:hexproof or oracle:indestructible or oracle:"counter target spell")', extra: ""},
    finisher: {tag: "otag:win-condition", fallback: '(oracle:"you win the game" or oracle:"each opponent loses" or (type:creature power>=5))', extra: "cmc>=4"},
    land: {tag: "type:land -type:basic", fallback: "type:land -type:basic", extra: ""}
  };

  // Theme keys match the mechanics vocabulary the baked catalog filters on, so a
  // generated variant answers the same Compare filters as a curated one.
  const THEME_QUERIES = {
    "Tokens / Go-wide": {query: '(oracle:"create" oracle:"token")', terms: ["create", "token", "populate", "creature tokens"]},
    "Sacrifice / Aristocrats": {query: '(oracle:"sacrifice a creature" or oracle:"whenever a creature you control dies")', terms: ["sacrifice", "dies", "loses 1 life", "drain"]},
    "Counters / Proliferate": {query: '(oracle:"+1/+1 counter" or oracle:proliferate)', terms: ["+1/+1 counter", "proliferate", "counters on"]},
    "Lifegain": {query: '(oracle:"gain life" or oracle:lifelink)', terms: ["gain life", "lifelink", "life total", "you gained life"]},
    "Graveyard / Reanimator": {query: '(oracle:"from your graveyard to the battlefield" or oracle:"return target creature card from your graveyard" or oracle:mill)', terms: ["graveyard", "mill", "return target creature card"]},
    "Blink / ETB": {query: '(oracle:"exile target creature you control" or oracle:"when this creature enters")', terms: ["enters", "exile target creature you control", "return it to the battlefield"]},
    "Lands / Landfall": {query: '(oracle:landfall or oracle:"land enters" or oracle:"additional land")', terms: ["landfall", "land enters", "additional land", "lands you control"]},
    "Ramp / Big Mana": {query: '(oracle:"add {" or oracle:"untap target land")', terms: ["add {", "mana", "untap target land"]},
    "Control / Interaction": {query: '(oracle:"counter target spell" or oracle:"destroy target")', terms: ["counter target spell", "destroy target", "exile target"]},
    "Tribal / Typal": {query: '(oracle:"creatures you control of the chosen type" or oracle:"other creatures you control get")', terms: ["other creatures you control", "creature type", "chosen type"]},
    "Combat / Voltron": {query: '(oracle:"attacks" or oracle:trample or oracle:"double strike")', terms: ["attacks", "trample", "double strike", "combat damage"]},
    "Enchantments / Auras": {query: '(type:enchantment or oracle:"enchanted creature")', terms: ["enchantment", "aura", "enchanted creature"]},
    "Card filtering": {query: '(oracle:"look at the top" or oracle:scry or oracle:surveil)', terms: ["look at the top", "scry", "surveil", "impulse"]},
    "Toughness / Defenders": {query: '(oracle:defender or oracle:"toughness rather than its power")', terms: ["defender", "toughness", "wall"]},
    "Artifacts": {query: '(type:artifact or oracle:"artifacts you control")', terms: ["artifact", "artifacts you control"]},
    "Spellslinger": {query: '(oracle:"instant or sorcery" or oracle:prowess or oracle:magecraft)', terms: ["instant or sorcery", "prowess", "magecraft", "copy target"]}
  };
  const THEME_ALIASES = {Defenders: "Toughness / Defenders", "Toughness matters": "Toughness / Defenders"};

  // A stated play style moves the role mix before any lens shift is applied, so
  // "Fortress" and "Flavor" on the same commander do not build the same deck.
  const PLAYSTYLE_BIAS = {
    Fortress: {protection: 3, removal: 2, wipe: 1, finisher: -3, theme: -3},
    "Build-up": {ramp: 3, draw: 1, theme: 1, removal: -3, finisher: -2},
    Convergence: {theme: 4, draw: 1, removal: -3, wipe: -2},
    Longevity: {draw: 4, protection: 1, finisher: -2, theme: -3},
    Friendly: {theme: 4, protection: 2, wipe: -3, removal: -3},
    Flavor: {theme: 5, draw: -2, removal: -2, finisher: -1}
  };

  const LENSES = [
    {key: "synergy-max", label: "Synergy maximizer", weights: {edhrec: 0.30, theme: 0.45, curve: 0.10, budget: 0.05, scarcity: 0.10}, quotaShift: {theme: 4, removal: -2, draw: -2}, offset: 0, priceCapFactor: 1, lands: 0, blurb: "Leans hardest into the theme you asked for."},
    {key: "budget-value", label: "Budget value", weights: {edhrec: 0.30, theme: 0.20, curve: 0.15, budget: 0.30, scarcity: 0.05}, quotaShift: {}, offset: 0, priceCapFactor: 0.45, lands: 0, blurb: "Spends the least per point of effect."},
    {key: "resilient-midrange", label: "Resilient midrange", weights: {edhrec: 0.30, theme: 0.22, curve: 0.18, budget: 0.15, scarcity: 0.15}, quotaShift: {protection: 3, removal: 2, theme: -5}, offset: 1, priceCapFactor: 1, lands: 1, blurb: "Answers first, wins second; hardest to knock over."},
    {key: "aggro-tempo", label: "Aggressive tempo", weights: {edhrec: 0.28, theme: 0.27, curve: 0.25, budget: 0.10, scarcity: 0.10}, quotaShift: {finisher: 3, theme: 1, ramp: -2, wipe: -2}, offset: 1, priceCapFactor: 1, lands: -2, curveBias: -1, blurb: "Lowest curve, fastest clock, least patient."},
    {key: "spice", label: "Off-meta spice", weights: {edhrec: 0.08, theme: 0.40, curve: 0.17, budget: 0.15, scarcity: 0.20}, quotaShift: {theme: 2, finisher: -1, draw: -1}, offset: 6, priceCapFactor: 1, lands: 0, blurb: "Deliberately skips the cards everyone already owns."}
  ];

  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]));

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < String(value).length; index += 1) {
      hash ^= String(value).charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function canBeCommander(card) {
    if (!card) return false;
    const line = String(card.typeLine || "");
    if (/can be your commander/i.test(card.oracleText || "")) return true;
    return /Legendary/.test(line) && /Creature/.test(line);
  }

  function normalizeThemes(themes) {
    return Array.from(new Set((themes || []).map((theme) => THEME_ALIASES[theme] || theme).filter((theme) => THEME_QUERIES[theme])));
  }

  function classifyRoles(card) {
    const text = String(card.oracleText || "").toLowerCase().replace(/[’]/g, "'");
    const line = String(card.typeLine || "");
    const roles = [];
    if (/\bLand\b/.test(line)) roles.push("land");
    const isPermanentManaSource = /\{t\}: add|adds? \{[wubrgc0-9]/.test(text);
    if ((isPermanentManaSource && !/\bLand\b/.test(line)) || /search your library for (a|up to \w+) basic land|search your library for a land card|put (a|up to \w+) land cards? from your hand onto the battlefield|create a treasure token|you may play an additional land/.test(text)) roles.push("ramp");
    if (/draw (a|one|two|three|four|five|x|\d+) cards?|draws? that many cards|draw cards equal/.test(text) && !/each opponent draws/.test(text)) roles.push("draw");
    if (/destroy target|exile target (?:creature|permanent|artifact|enchantment|planeswalker|nonland)|deals? \d+ damage to (?:target|any target)|target creature gets [-−]|fights? target|return target (?:creature|permanent|nonland permanent) to its owner's hand/.test(text)) roles.push("removal");
    if (/destroy all|exile all|each player sacrifices|all creatures get [-−]|return all creatures|each opponent sacrifices/.test(text)) roles.push("wipe");
    if (/hexproof|indestructible|protection from|counter target spell|regenerate|phases? out|shroud|can't be countered|prevent all damage/.test(text)) roles.push("protection");
    if (/you win the game|each opponent loses \d+ life|extra combat phase|deals damage equal to|double strike|infect|commander damage/.test(text) || (/Creature/.test(line) && Number(card.cmc || 0) >= 5)) roles.push("finisher");
    if (/return target .{0,40}from your graveyard|return .{0,30}from your graveyard to (?:the battlefield|your hand)/.test(text)) roles.push("recursion");
    if (/search your library for a card|search your library for an? (?:artifact|creature|enchantment|instant|sorcery)/.test(text)) roles.push("tutor");
    return roles;
  }

  function themeScore(card, context) {
    if (!context.themes.length) return 0.4;
    const haystack = `${card.oracleText || ""} ${card.typeLine || ""} ${(card.keywords || []).join(" ")}`.toLowerCase();
    let hits = 0;
    let terms = 0;
    context.themes.forEach((theme) => {
      const themeTerms = THEME_QUERIES[theme]?.terms || [];
      terms += 1;
      if (themeTerms.some((term) => haystack.includes(term.toLowerCase()))) hits += 1;
    });
    const commanderOverlap = context.commanderSubtypes.some((subtype) => haystack.includes(subtype.toLowerCase())) ? 0.2 : 0;
    return clamp01((terms ? hits / terms : 0) + commanderOverlap);
  }

  function edhrecScore(rank) {
    if (!rank) return 0.15;
    return clamp01(1 - Math.log10(Math.max(1, rank)) / 4.6);
  }

  function curveScore(cmc, ideal, bias = 0) {
    return clamp01(1 - Math.abs(Number(cmc || 0) - (ideal + bias)) / 5);
  }

  function budgetScore(price, cap) {
    if (!cap) return 0.5;
    return clamp01(1 - Number(price || 0) / cap);
  }

  function scarcityScore(card, role) {
    const roles = card.roles || [];
    const extra = roles.filter((entry) => entry !== role && entry !== "land").length;
    return clamp01(extra / 3);
  }

  function scoreCard(card, role, context, lens, usedCounts) {
    const weights = lens.weights;
    const ideal = ROLE_QUOTAS[role]?.ideal ?? 3;
    const raw = weights.edhrec * edhrecScore(card.edhrecRank)
      + weights.theme * themeScore(card, context)
      + weights.curve * curveScore(card.cmc, ideal, lens.curveBias || 0)
      + weights.budget * budgetScore(card.price, context.perCardCap)
      + weights.scarcity * scarcityScore(card, role);
    const overlap = OVERLAP_PENALTY * Number(usedCounts?.get(cardKey(card.name)) || 0);
    const seeded = context.seedKeys.has(cardKey(card.name)) ? 0.5 : 0;
    return raw - overlap + seeded;
  }

  function identityFits(card, identity) {
    return (card.colorIdentity || []).every((color) => identity.has(String(color).toUpperCase()));
  }

  // Cards that a Tier 3 deck may never contain are dropped at the pool boundary,
  // so no downstream stage has to repair them.
  function tier3Safe(card) {
    return Compliance.deriveComplianceTags(card).length === 0;
  }

  function identityClause(colors) {
    const letters = (colors || []).map((color) => String(color).toUpperCase()).filter((color) => COLOR_BASICS[color]);
    return letters.length ? `id<=${letters.join("").toLowerCase()}` : "id<=wubrg";
  }

  function buildRoleQuery(role, context, useTag) {
    const spec = ROLE_QUERIES[role];
    const parts = [`legal:commander`, identityClause(Array.from(context.identity)), useTag ? spec.tag : spec.fallback];
    if (spec.extra) parts.push(spec.extra);
    if (role !== "land") parts.push("-type:land");
    if (context.preferSet) parts.push(`(set:${context.preferSet} or -set:${context.preferSet})`);
    return parts.filter(Boolean).join(" ");
  }

  function buildThemeQuery(theme, context) {
    return [`legal:commander`, identityClause(Array.from(context.identity)), THEME_QUERIES[theme]?.query || "", "-type:land"].filter(Boolean).join(" ");
  }

  async function resolveCommander(inputs, client, warnings, signal) {
    if (inputs.commanderLink) {
      const resolved = await client.resolveTcgplayerUrl(inputs.commanderLink, {signal});
      if (resolved.card && canBeCommander(resolved.card)) return {commander: resolved.card, source: `tcgplayer:${resolved.matchedBy}`};
      if (resolved.card) warnings.push(`${resolved.card.name} cannot lead a Commander deck, so the link was ignored.`);
      else warnings.push(resolved.error || "That commander link could not be resolved.");
    }
    if (inputs.commanderName) {
      const card = await client.named(inputs.commanderName, {signal});
      if (card && canBeCommander(card)) return {commander: card, source: "typed-name"};
      if (card) warnings.push(`${card.name} cannot lead a Commander deck, so the typed name was ignored.`);
      else warnings.push(`No card matched "${inputs.commanderName}".`);
    }
    const themes = normalizeThemes(inputs.themes);
    const themeClause = themes.length ? THEME_QUERIES[themes[0]].query : "";
    const query = ["is:commander", "legal:commander", identityClause(inputs.colors), themeClause].filter(Boolean).join(" ");
    const results = await client.search(query, {maxPages: 1, order: "edhrec", signal});
    // Re-check identity locally only when colors were actually chosen: with no
    // colors the query above already searched id<=wubrg, and re-checking against
    // an empty set would reject every colored commander the search returned.
    const wanted = new Set((inputs.colors || []).map((color) => String(color).toUpperCase()));
    const commander = results.find((card) => canBeCommander(card) && (!wanted.size || identityFits(card, wanted)));
    if (commander) return {commander, source: "search"};
    if (themeClause) {
      const broader = await client.search(["is:commander", "legal:commander", identityClause(inputs.colors)].join(" "), {maxPages: 1, order: "edhrec", signal});
      const fallback = broader.find(canBeCommander);
      if (fallback) {
        warnings.push("No commander matched every theme, so the most-played commander in your colors was used.");
        return {commander: fallback, source: "search-fallback"};
      }
    }
    return {commander: null, error: "No commander matched those inputs."};
  }

  /* The cards you already own and want built around.
     A TCGplayer link resolves through the product id; anything else is taken as
     a card name, because "Doubling Season" is what somebody actually types and
     making them find a link first is a tax on the one input that is pure
     signal about what they want to play. */
  async function resolveSeeds(inputs, client, context, warnings) {
    const seeds = [];
    const lines = [...(inputs.seedLinks || []), ...(inputs.seedNames || [])];
    for (const link of lines) {
      const raw = String(link || "").trim();
      if (!raw) continue;
      const isLink = /^https?:\/\//i.test(raw);
      const resolved = isLink
        ? await client.resolveTcgplayerUrl(raw, {signal: context.signal})
        : {card: await client.named(raw, {signal: context.signal}), error: "no card matched that name"};
      if (!resolved.card) {
        warnings.push(`${raw} — ${resolved.error || "no card matched"}.`);
        continue;
      }
      const card = resolved.card;
      if (!card.commanderLegal) warnings.push(`${card.name} is not Commander legal and was skipped.`);
      else if (!identityFits(card, context.identity)) warnings.push(`${card.name} falls outside ${context.commander.name}'s color identity and was skipped.`);
      else if (!tier3Safe(card)) warnings.push(`${card.name} breaks a Tier 3 rule and was skipped.`);
      else seeds.push(card);
    }
    return seeds;
  }

  async function fetchPool(context, client, onProgress, warnings) {
    const byName = new Map();
    const roleBuckets = new Map(ROLE_ORDER.map((role) => [role, []]));
    roleBuckets.set("land", []);
    const addCards = (cards, role) => {
      cards.forEach((card) => {
        if (!card?.name || card.isBasicLand) return;
        if (cardKey(card.name) === cardKey(context.commander.name)) return;
        if (!card.commanderLegal || !identityFits(card, context.identity) || !tier3Safe(card)) return;
        const key = cardKey(card.name);
        const existing = byName.get(key);
        const entry = existing || {...card, roles: classifyRoles(card)};
        if (!entry.roles.includes(role) && role !== "theme") entry.roles = [...entry.roles, role];
        if (role === "theme" && !entry.roles.includes("theme")) entry.roles = [...entry.roles, "theme"];
        byName.set(key, entry);
      });
    };
    const roles = [...ROLE_ORDER.filter((role) => role !== "theme"), "land"];
    for (const role of roles) {
      onProgress({phase: "pool", role, message: `Fetching ${role} options…`});
      let cards = await client.search(buildRoleQuery(role, context, true), {maxPages: 1, order: "edhrec", signal: context.signal});
      if (cards.length < MIN_ROLE_RESULTS) {
        const fallback = await client.search(buildRoleQuery(role, context, false), {maxPages: 1, order: "edhrec", signal: context.signal});
        if (cards.length && !fallback.length) warnings.push(`The ${role} fallback search returned nothing; using ${cards.length} tagged results.`);
        cards = [...cards, ...fallback];
      }
      addCards(cards, role);
    }
    for (const theme of context.themes) {
      onProgress({phase: "pool", role: theme, message: `Fetching ${theme} cards…`});
      addCards(await client.search(buildThemeQuery(theme, context), {maxPages: 1, order: "edhrec", signal: context.signal}), "theme");
    }
    context.seeds.forEach((seed) => {
      const key = cardKey(seed.name);
      byName.set(key, {...seed, roles: Array.from(new Set([...classifyRoles(seed), "theme"]))});
    });
    const spells = Array.from(byName.values()).filter((card) => !card.isLand);
    const lands = Array.from(byName.values()).filter((card) => card.isLand);
    ROLE_ORDER.forEach((role) => roleBuckets.set(role, spells.filter((card) => card.roles.includes(role) || (role === "theme" && themeScore(card, context) >= 0.5))));
    roleBuckets.set("land", lands);
    return {byName, spells, lands, roleBuckets};
  }

  async function fetchBasics(context, client) {
    const colors = Array.from(context.identity);
    const names = colors.length ? colors.map((color) => COLOR_BASICS[color]).filter(Boolean) : ["Wastes"];
    const {cards} = await client.collection(names.map((name) => ({name})), {signal: context.signal});
    const found = new Map(cards.map((card) => [card.name, card]));
    return names.map((name) => found.get(name) || {
      name,
      manaCost: "",
      cmc: 0,
      typeLine: `Basic Land — ${name}`,
      oracleText: "",
      keywords: [],
      colorIdentity: name === "Wastes" ? [] : [Object.keys(COLOR_BASICS).find((color) => COLOR_BASICS[color] === name)],
      colors: [],
      legalities: {commander: "legal"},
      commanderLegal: true,
      rarity: "common",
      set: "",
      setName: "",
      image: "",
      imageLarge: "",
      price: 0,
      ceiling: 0,
      edhrecRank: null,
      gameChanger: false,
      isLand: true,
      isBasicLand: true,
      roles: ["land"]
    });
  }

  function quotasFor(lens, spellCount, playstyle = "") {
    const bias = PLAYSTYLE_BIAS[playstyle] || {};
    const quotas = {};
    ROLE_ORDER.forEach((role) => {
      quotas[role] = Math.max(0, ROLE_QUOTAS[role].quota + Number(lens.quotaShift?.[role] || 0) + Number(bias[role] || 0));
    });
    const total = ROLE_ORDER.reduce((sum, role) => sum + quotas[role], 0);
    quotas.theme = Math.max(0, quotas.theme + (spellCount - total));
    return quotas;
  }

  function pipDemand(cards, identity) {
    const demand = new Map(Array.from(identity).map((color) => [color, 0]));
    cards.forEach((card) => {
      const matches = String(card.manaCost || "").match(/\{([WUBRG])(?:\/[WUBRGP])?\}/g) || [];
      matches.forEach((token) => {
        const color = token.replace(/[^WUBRG]/g, "").charAt(0);
        if (demand.has(color)) demand.set(color, demand.get(color) + 1);
      });
    });
    return demand;
  }

  function allocateBasics(basics, count, demand) {
    if (count <= 0) return [];
    const usable = basics.filter((basic) => basic.name === "Wastes" || demand.has((basic.colorIdentity || [])[0]));
    if (!usable.length) return [];
    const weights = usable.map((basic) => Math.max(1, demand.get((basic.colorIdentity || [])[0]) || 1));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const exact = weights.map((weight) => (weight / totalWeight) * count);
    const floors = exact.map((value) => Math.floor(value));
    let assigned = floors.reduce((sum, value) => sum + value, 0);
    const order = exact
      .map((value, index) => ({index, remainder: value - Math.floor(value)}))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    let cursor = 0;
    while (assigned < count) {
      floors[order[cursor % order.length].index] += 1;
      assigned += 1;
      cursor += 1;
    }
    return usable.map((basic, index) => ({card: basic, quantity: floors[index]})).filter((entry) => entry.quantity > 0);
  }

  function fillRole(role, need, pool, context, lens, picked, usedCounts, spend) {
    if (need <= 0) return [];
    const cap = context.perCardCap * (lens.priceCapFactor || 1);
    const candidates = (pool.roleBuckets.get(role) || [])
      .filter((card) => !picked.has(cardKey(card.name)))
      .map((card) => ({card, score: scoreCard(card, role, context, lens, usedCounts)}))
      .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
    const offset = candidates.length > need + lens.offset ? lens.offset : 0;
    const chosen = [];
    for (let index = offset; index < candidates.length && chosen.length < need; index += 1) {
      const {card, score} = candidates[index];
      const price = Number(card.price || 0);
      if (price > cap || spend.total + price > context.budgetUsd) continue;
      picked.set(cardKey(card.name), {card, role, score});
      chosen.push({card, role, score});
      spend.total += price;
    }
    if (chosen.length < need) {
      const cheap = candidates
        .filter((entry) => !picked.has(cardKey(entry.card.name)))
        .sort((a, b) => Number(a.card.price || 0) - Number(b.card.price || 0) || b.score - a.score);
      // Quota completeness still wins over budget in the end (an incomplete deck is worse
      // than an over-budget one), but a cheap-enough card to stay under budget is preferred
      // over one that merely missed the per-card cap -- so try the in-budget cheap options
      // fully before reaching for ones that would blow the total.
      for (const entry of cheap) {
        if (chosen.length >= need) break;
        if (spend.total + Number(entry.card.price || 0) > context.budgetUsd) continue;
        picked.set(cardKey(entry.card.name), {card: entry.card, role, score: entry.score});
        chosen.push({card: entry.card, role, score: entry.score});
        spend.total += Number(entry.card.price || 0);
      }
      for (const entry of cheap) {
        if (chosen.length >= need) break;
        if (picked.has(cardKey(entry.card.name))) continue;
        picked.set(cardKey(entry.card.name), {card: entry.card, role, score: entry.score});
        chosen.push({card: entry.card, role, score: entry.score});
        spend.total += Number(entry.card.price || 0);
      }
    }
    return chosen;
  }

  function literalFor(entry) {
    const card = entry.card || entry;
    return {
      name: card.name,
      quantity: Math.max(1, Number(entry.quantity || card.quantity || 1)),
      typeLine: card.typeLine || "",
      colorIdentity: card.colorIdentity || [],
      gameChanger: Boolean(card.gameChanger),
      commanderLegal: card.commanderLegal !== false,
      isCommander: Boolean(entry.isCommander || card.isCommander),
      tags: [...Compliance.deriveComplianceTags(card), ...(entry.isCommander || card.isCommander ? ["Commander"] : [])]
    };
  }

  function evaluateEntries(entries) {
    return Compliance.evaluateCardList(entries.map(literalFor));
  }

  // Repairs are rare because the pool is pre-filtered, but a Game Changer cap or a
  // known combo pair can still surface once swaps are layered on.
  function repairEntries(entries, context, pool, lens, usedCounts) {
    const working = [...entries];
    const log = [];
    for (let pass = 0; pass < 12; pass += 1) {
      const result = evaluateEntries(working);
      if (!result.tier3.length) return {entries: working, log, result};
      const issue = result.tier3[0];
      const names = issue.card.split(" + ").map((name) => cardKey(name));
      const target = working
        .filter((entry) => !entry.isCommander && !entry.card.isLand && names.includes(cardKey(entry.card.name)))
        .sort((a, b) => (a.score || 0) - (b.score || 0))[0]
        || working.filter((entry) => !entry.isCommander && !entry.card.isLand && entry.card.gameChanger).sort((a, b) => (a.score || 0) - (b.score || 0))[0];
      if (!target) return {entries: working, log, result};
      const index = working.indexOf(target);
      const picked = new Map(working.map((entry) => [cardKey(entry.card.name), entry]));
      const replacement = (pool.roleBuckets.get(target.role) || pool.spells)
        .filter((card) => !picked.has(cardKey(card.name)) && !card.gameChanger)
        .map((card) => ({card, role: target.role, score: scoreCard(card, target.role, context, lens, usedCounts)}))
        .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))[0];
      if (!replacement) {
        working.splice(index, 1);
        log.push(`Cut ${target.card.name} — ${issue.rule}`);
        continue;
      }
      working.splice(index, 1, replacement);
      log.push(`Swapped ${target.card.name} for ${replacement.card.name} — ${issue.rule}`);
    }
    return {entries: working, log, result: evaluateEntries(working)};
  }

  function buildBase(context, pool, basics, lens, usedCounts) {
    const landTarget = Math.max(33, Math.min(40, DEFAULT_LANDS + Number(lens.lands || 0) + (context.themes.includes("Lands / Landfall") ? 2 : 0)));
    const spellCount = DECK_SIZE - 1 - landTarget;
    const quotas = quotasFor(lens, spellCount, context.inputs?.playstyle);
    const picked = new Map();
    const spend = {total: 0};
    const spells = [];
    context.seeds.forEach((seed) => {
      if (picked.has(cardKey(seed.name))) return;
      picked.set(cardKey(seed.name), {card: seed, role: "theme", score: 1});
      spells.push({card: seed, role: "theme", score: 1});
      spend.total += Number(seed.price || 0);
    });
    ROLE_ORDER.forEach((role) => {
      const need = quotas[role] - spells.filter((entry) => entry.role === role).length;
      spells.push(...fillRole(role, need, pool, context, lens, picked, usedCounts, spend));
    });
    while (spells.length > spellCount) {
      const weakest = [...spells].sort((a, b) => (a.score || 0) - (b.score || 0))[0];
      spells.splice(spells.indexOf(weakest), 1);
      picked.delete(cardKey(weakest.card.name));
    }
    if (spells.length < spellCount) {
      const filler = pool.spells
        .filter((card) => !picked.has(cardKey(card.name)))
        .map((card) => ({card, role: "theme", score: scoreCard(card, "theme", context, lens, usedCounts)}))
        .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
      // Same two-tier preference as fillRole's own fallback: fill out the count with the
      // best-scoring cards that still fit the budget before reaching for ones that don't.
      for (const entry of filler) {
        if (spells.length >= spellCount) break;
        if (spend.total + Number(entry.card.price || 0) > context.budgetUsd) continue;
        picked.set(cardKey(entry.card.name), entry);
        spells.push(entry);
        spend.total += Number(entry.card.price || 0);
      }
      for (const entry of filler) {
        if (spells.length >= spellCount) break;
        if (picked.has(cardKey(entry.card.name))) continue;
        picked.set(cardKey(entry.card.name), entry);
        spells.push(entry);
        spend.total += Number(entry.card.price || 0);
      }
    }
    const nonbasicTarget = Math.min(Math.floor(landTarget * 0.3), (pool.roleBuckets.get("land") || []).length);
    const landCap = context.perCardCap * (lens.priceCapFactor || 1);
    // Nonbasics are a pure upgrade over basics -- allocateBasics below fills the same land
    // slot count either way -- so unlike spell quotas there is no completeness pressure to
    // force one through once it would break budget; skip it and let a basic land stand in.
    const nonbasics = (pool.roleBuckets.get("land") || [])
      .filter((card) => !picked.has(cardKey(card.name)))
      .map((card) => ({card, role: "land", score: 0.6 * edhrecScore(card.edhrecRank) + 0.4 * budgetScore(card.price, landCap) - OVERLAP_PENALTY * Number(usedCounts.get(cardKey(card.name)) || 0)}))
      .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
      .filter((entry) => Number(entry.card.price || 0) <= landCap)
      .reduce((chosen, entry) => {
        if (chosen.length >= nonbasicTarget) return chosen;
        if (spend.total + chosen.reduce((sum, prior) => sum + Number(prior.card.price || 0), 0) + Number(entry.card.price || 0) > context.budgetUsd) return chosen;
        chosen.push(entry);
        return chosen;
      }, []);
    nonbasics.forEach((entry) => {
      picked.set(cardKey(entry.card.name), entry);
      spend.total += Number(entry.card.price || 0);
    });
    const demand = pipDemand([context.commander, ...spells.map((entry) => entry.card)], context.identity);
    const basicEntries = allocateBasics(basics, landTarget - nonbasics.length, demand)
      .map((entry) => ({card: entry.card, role: "land", score: 0, quantity: entry.quantity}));
    const commanderEntry = {card: context.commander, role: "commander", score: 1, isCommander: true, quantity: 1};
    const entries = [commanderEntry, ...spells, ...nonbasics, ...basicEntries];
    const repaired = repairEntries(entries, context, pool, lens, usedCounts);
    return {entries: repaired.entries, log: repaired.log, spend: spend.total, landTarget, quotas};
  }

  function totalOf(entries) {
    return entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.quantity || 1)), 0);
  }

  function swappableEntries(entries) {
    return entries.filter((entry) => !entry.isCommander && !entry.card.isLand && Math.max(1, Number(entry.quantity || 1)) === 1);
  }

  // Both sides of a swap are scored against the same stage context, or a stage
  // that is allowed to spend more would rate every upgrade below the cheap card
  // it is meant to replace.
  function buildSwapLadder(context, pool, lens, baseEntries, usedCounts, options) {
    const inDeck = new Map(baseEntries.map((entry) => [cardKey(entry.card.name), entry]));
    const claimed = new Set(options.claimed || []);
    const stageScore = new Map(baseEntries.map((entry) => [cardKey(entry.card.name), scoreCard(entry.card, entry.role, context, lens, usedCounts)]));
    const scoreOf = (entry) => stageScore.get(cardKey(entry.card.name)) ?? entry.score ?? 0;
    const swaps = [];
    let extraSpend = 0;
    let gameChangers = baseEntries.filter((entry) => entry.card.gameChanger).length;
    // A card an earlier stage already cut must stay cut: readmitting it later as a
    // "new" upgrade would list the same physical card under two different rungs, as
    // if buying both were a coherent, additive shopping instruction.
    const candidates = pool.spells
      .filter((card) => !inDeck.has(cardKey(card.name)) && !claimed.has(cardKey(card.name)))
      .map((card) => {
        const role = (card.roles || []).find((entry) => ROLE_ORDER.includes(entry)) || "theme";
        return {card, role, score: scoreCard(card, role, context, lens, usedCounts)};
      })
      .filter((entry) => options.priceFilter(entry.card))
      .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
    for (const candidate of candidates) {
      if (swaps.length >= options.limit) break;
      if (candidate.card.gameChanger && gameChangers >= TIER3_GAME_CHANGER_CAP) continue;
      const price = Number(candidate.card.price || 0);
      if (options.spendCap !== null && extraSpend + price > options.spendCap) continue;
      const target = swappableEntries(baseEntries)
        .filter((entry) => !claimed.has(cardKey(entry.card.name)))
        .filter((entry) => entry.role === candidate.role || options.crossRole)
        .sort((a, b) => scoreOf(a) - scoreOf(b))[0];
      if (!target) continue;
      if ((candidate.score || 0) <= scoreOf(target) + (options.margin || 0)) continue;
      claimed.add(cardKey(target.card.name));
      if (candidate.card.gameChanger) gameChangers += 1;
      extraSpend += price;
      swaps.push({
        key: cardKey(candidate.card.name),
        replacesKey: cardKey(target.card.name),
        card: candidate.card,
        replaced: target.card,
        role: candidate.role,
        score: candidate.score,
        why: `${candidate.card.name} outperforms ${target.card.name} in the ${candidate.role} slot for this build.`
      });
    }
    return {swaps, claimed, extraSpend, gameChangers};
  }

  function applySwaps(entries, swaps) {
    const next = [...entries];
    swaps.forEach((swap) => {
      const index = next.findIndex((entry) => cardKey(entry.card.name) === swap.replacesKey);
      if (index < 0) return;
      next.splice(index, 1, {card: swap.card, role: swap.role, score: swap.score, quantity: 1});
    });
    return next;
  }

  function stageStrength(entries, context) {
    const spells = entries.filter((entry) => !entry.card.isLand && !entry.isCommander);
    if (!spells.length) return 0;
    const avgScore = spells.reduce((sum, entry) => sum + (entry.score || 0), 0) / spells.length;
    const themeFit = spells.reduce((sum, entry) => sum + themeScore(entry.card, context), 0) / spells.length;
    return round2(avgScore * 0.6 + themeFit * 0.4);
  }

  function roleCount(entries, role) {
    return entries.filter((entry) => (entry.card.roles || []).includes(role)).length;
  }

  function scoreRow(label, score, description, extra = "") {
    return {label, score: Math.max(1, Math.min(5, Math.round(score))), extra, description};
  }

  function playstyleRows(entries, context) {
    const interaction = roleCount(entries, "removal") + roleCount(entries, "protection");
    const permanents = entries.filter((entry) => /Creature|Artifact|Enchantment/.test(entry.card.typeLine || "")).length;
    const themeFit = entries.reduce((sum, entry) => sum + themeScore(entry.card, context), 0) / Math.max(1, entries.length);
    return [
      scoreRow("Fortress", 1 + interaction / 5, "Holds off early aggression while you develop"),
      scoreRow("Build-up", 1 + permanents / 12, "Accumulates a 'city' of permanents and resources"),
      scoreRow("Convergence", 1 + roleCount(entries, "finisher") / 2.5, "Separate pieces that suddenly combine into a decisive blow"),
      scoreRow("Longevity", 1 + (roleCount(entries, "draw") + roleCount(entries, "recursion")) / 5, "Chess-like consistency; still standing in the final two"),
      scoreRow("Friendly", 5 - roleCount(entries, "wipe") / 1.5, "Low-salt — minimal targeted sabotage of other players"),
      scoreRow("Flavor", 1 + themeFit * 4, "Mechanics that read as an ode to the cards' own story")
    ];
  }

  function engineRows(entries, context, assembly) {
    const avgRank = entries.filter((entry) => entry.card.edhrecRank).reduce((sum, entry, _index, list) => sum + edhrecScore(entry.card.edhrecRank) / list.length, 0);
    const avgCmc = entries.filter((entry) => !entry.card.isLand).reduce((sum, entry, _index, list) => sum + Number(entry.card.cmc || 0) / list.length, 0);
    return [
      scoreRow("Rate", 1 + avgRank * 4, "Effect per mana — is the deck's core above curve for its cost"),
      scoreRow("Card Adv.", 1 + roleCount(entries, "draw") / 3, "Net cards the engine generates once it is running"),
      scoreRow("Clock", 1 + roleCount(entries, "finisher") / 2 + Math.max(0, 4 - avgCmc), "How quickly it can actually close a game once assembled"),
      scoreRow("Interaction", 1 + (roleCount(entries, "removal") + roleCount(entries, "wipe")) / 3.5, "Density of removal, protection and stack answers"),
      scoreRow("Resilience", 1 + (roleCount(entries, "protection") + roleCount(entries, "recursion")) / 3, "Recovery from wipes, targeted removal and hate pieces"),
      scoreRow("Assembly", 1 + (assembly / 100) * 4, `Computed odds the engine is online by turn 8 — see method — ${assembly}% by turn 8`, `${assembly}%`)
    ];
  }

  function assemblyOdds(entries) {
    const ramp = roleCount(entries, "ramp");
    const draw = roleCount(entries, "draw");
    const lands = entries.filter((entry) => entry.card.isLand).reduce((sum, entry) => sum + Math.max(1, Number(entry.quantity || 1)), 0);
    return Math.max(35, Math.min(92, Math.round(38 + ramp * 1.8 + draw * 1.4 + (lands - 33) * 1.2)));
  }

  function bracketFor(entries, stageIndex) {
    const gameChangers = entries.filter((entry) => entry.card.gameChanger).length;
    const tutors = roleCount(entries, "tutor");
    const value = 2.2 + gameChangers * 0.22 + tutors * 0.03 + stageIndex * 0.2;
    const capped = Math.min(3.4, round2(value));
    return {
      label: `B${capped.toFixed(1)}`,
      gameChangers: `${gameChangers} GC`,
      description: `${STAGES[stageIndex]}: generated bracket estimate ${capped.toFixed(2)}. ${gameChangers} Game Changer${gameChangers === 1 ? "" : "s"} (Bracket 2 allows none, Bracket 3 allows up to three). Estimated from role density, tutor count and Game Changer count rather than play testing.`
    };
  }

  function rarityFor(entries, stageIndex) {
    const ranked = entries.filter((entry) => entry.card.edhrecRank);
    const average = ranked.length ? ranked.reduce((sum, entry) => sum + entry.card.edhrecRank, 0) / ranked.length : 8000;
    const percent = Math.max(20, Math.min(95, Math.round(30 + average / 220 + stageIndex * 8)));
    const label = percent >= 75 ? "Rarely seen" : percent >= 55 ? "Fairly familiar" : "Well known";
    return {percent: `${percent}%`, label, description: "Modeled odds a given opponent has NOT seen this commander and THIS STAGE of the build — estimated from EDHREC popularity of the exact card list"};
  }

  function summariesFor(context, lens, stages) {
    return stages.map((entries, index) => {
      const gameChangers = entries.filter((entry) => entry.card.gameChanger).length;
      const themeLabel = context.themes.length ? context.themes.join(" + ") : "the commander's own text";
      return [
        `${STAGES[index]}: ${lens.blurb}`,
        `${roleCount(entries, "ramp")} ramp · ${roleCount(entries, "draw")} draw · ${roleCount(entries, "removal") + roleCount(entries, "wipe")} interaction, built around ${themeLabel}`,
        gameChangers ? `${gameChangers} Game Changer${gameChangers === 1 ? "" : "s"} — inside the Tier 3 allowance of three` : "No Game Changers — comfortably inside Tier 3"
      ];
    });
  }

  function detailHtmlFor(context, lens, stages, swaps, genLog) {
    const list = (items) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    const stageRows = stages.map((entries, index) => `<li><b>${STAGES[index]}</b> — ${entries.length} distinct cards, ${roleCount(entries, "ramp")} ramp, ${roleCount(entries, "draw")} draw, ${roleCount(entries, "removal")} removal, ${entries.filter((entry) => entry.card.gameChanger).length} Game Changers</li>`).join("");
    return `<div class="detail-block"><h3>Game plan</h3><p>${escapeHtml(context.commander.name)} leads a ${escapeHtml(lens.label.toLowerCase())} build for ${escapeHtml(context.themes.join(" + ") || "its own text")}. ${escapeHtml(lens.blurb)}</p></div>
<div class="detail-block"><h3>How the stages differ</h3><ul>${stageRows}</ul></div>
<div class="detail-block"><h3>Buy order</h3><ol>${list(swaps.tuned.slice(0, 6).map((swap) => `${swap.card.name} over ${swap.replaced.name}`))}</ol></div>
<div class="detail-block"><h3>Bracket placement</h3><p>${escapeHtml(bracketFor(stages[2], 2).description)}</p></div>
<div class="detail-block"><h3>Generation log</h3><ul>${list(genLog)}</ul><p>Generated from live Scryfall data against your Choose inputs. Prices are Scryfall's USD market values at generation time.</p></div>`;
  }

  function buildVariant(context, pool, basics, lens, order, usedCounts) {
    const base = buildBase(context, pool, basics, lens, usedCounts);
    const baseEntries = base.entries;
    // Each ladder judges price against what that stage is allowed to spend.
    const tunedContext = {...context, perCardCap: context.budgetUsd * 0.25};
    const enhanceContext = {...context, perCardCap: ENHANCE_PRICE_CAP};
    // Tuned must keep Base+Tuned inside budget, so its spend cap is what's left
    // after Base (including the commander) already spent -- not a flat fraction.
    const commanderPrice = Number(context.commander.price || 0);
    const tunedSpendCap = Math.max(0, context.budgetUsd - (base.spend + commanderPrice));
    const tuned = buildSwapLadder(tunedContext, pool, lens, baseEntries, usedCounts, {
      limit: MAX_TUNED_SWAPS,
      spendCap: tunedSpendCap,
      margin: 0.02,
      crossRole: false,
      priceFilter: (card) => Number(card.price || 0) <= context.budgetUsd * 0.25
    });
    const tunedEntries = applySwaps(baseEntries, tuned.swaps);
    const enhance = buildSwapLadder(enhanceContext, pool, lens, tunedEntries, usedCounts, {
      limit: MAX_ENHANCE_SWAPS,
      spendCap: null,
      margin: 0.01,
      crossRole: false,
      claimed: tuned.claimed,
      // Bound the ceiling too, not just the nonfoil price: Enhance promises "at or below $20,"
      // and a card whose only listings run higher (foil premium) can't honestly keep that promise.
      priceFilter: (card) => Number(card.price || 0) <= ENHANCE_PRICE_CAP && Number(card.ceiling || card.price || 0) <= ENHANCE_PRICE_CAP
    });
    const enhanceEntries = applySwaps(tunedEntries, enhance.swaps);
    // Maxed is explicitly not a budget stage, so price stops steering the score.
    const priceBlindLens = {...lens, weights: {...lens.weights, budget: 0, edhrec: lens.weights.edhrec + lens.weights.budget}};
    const maxed = buildSwapLadder(context, pool, priceBlindLens, enhanceEntries, usedCounts, {
      limit: MAX_MAX_SWAPS,
      spendCap: null,
      margin: 0,
      crossRole: true,
      claimed: enhance.claimed,
      priceFilter: () => true
    });
    const maxEntries = applySwaps(enhanceEntries, maxed.swaps);
    const repairedMax = repairEntries(maxEntries, context, pool, lens, usedCounts);
    const stages = [baseEntries, tunedEntries, repairedMax.entries];
    const genLog = [
      `Commander resolved via ${context.commanderSource}.`,
      `${pool.spells.length} spells and ${pool.lands.length} nonbasic lands in the candidate pool.`,
      `${base.landTarget} lands · ${DECK_SIZE - 1 - base.landTarget} spells at Base.`,
      `${tuned.swaps.length} Tuned, ${enhance.swaps.length} Enhance and ${maxed.swaps.length} Maxed swaps proposed.`,
      ...base.log,
      ...repairedMax.log
    ];
    const assembly = stages.map(assemblyOdds);
    const profile = {
      tags: ["Generated", lens.label],
      summaries: summariesFor(context, lens, stages),
      stageNotes: stages.map((entries, index) => `${STAGES[index]} · ${entries.filter((entry) => !entry.card.isLand).length} spells · ${lens.blurb}`),
      costs: stages.map((entries) => `$${Math.round(entries.reduce((sum, entry) => sum + Number(entry.card.price || 0) * Math.max(1, Number(entry.quantity || 1)), 0))} total`),
      brackets: stages.map((entries, index) => bracketFor(entries, index)),
      ranks: [order, order, order],
      facts: stages.map((entries, index) => ({
        availability: "Generated from Scryfall",
        budget: index === 0 ? `$${Math.round(context.budgetUsd)} target` : index === 1 ? "tuned spend" : "price-blind",
        costNote: `${STAGES[index]}: ${entries.length} distinct cards priced at generation time.`
      })),
      rarity: stages.map((entries, index) => rarityFor(entries, index)),
      scores: {
        playstyle: stages.map((entries) => playstyleRows(entries, context)),
        engine: stages.map((entries, index) => engineRows(entries, context, assembly[index])),
        growth: [
          scoreRow("Headroom", 1 + (tuned.swaps.length + enhance.swaps.length + maxed.swaps.length) / 6, "How much further this framework can be pushed before you would be rebuilding it, not upgrading it", `${tuned.swaps.length + enhance.swaps.length + maxed.swaps.length} cards`),
          scoreRow("Upgrade value", 1 + budgetScore(tuned.extraSpend / Math.max(1, tuned.swaps.length), context.perCardCap) * 4, "How cheaply that ladder climbs — further upgrades you can buy per $100 of spend", `~$${Math.round(tuned.extraSpend / Math.max(1, tuned.swaps.length))} ea`)
        ]
      },
      mechanics: context.themes.length ? context.themes : ["Generated"],
      detailHtml: detailHtmlFor(context, lens, stages, {tuned: tuned.swaps, enhance: enhance.swaps, max: maxed.swaps}, genLog),
      planHtml: ""
    };
    const refs = (entries) => entries.map((entry) => ({
      key: cardKey(entry.card.name),
      quantity: Math.max(1, Number(entry.quantity || 1)),
      isCommander: Boolean(entry.isCommander)
    }));
    const swapRefs = (swaps) => swaps.map((swap) => ({key: swap.key, replacesKey: swap.replacesKey, why: swap.why, role: swap.role}));
    const variant = {
      id: `c${context.slotId}-${order}`,
      deckId: context.slotId,
      order,
      lens: lens.key,
      lensLabel: lens.label,
      name: `${(context.themes[0] || "Custom").split(" / ")[0]} ${lens.label.split(" ")[0]} — ${context.commander.name.split(",")[0]}`,
      commanderKey: cardKey(context.commander.name),
      createdAt: context.createdAt,
      inputs: context.inputs,
      base: refs(baseEntries),
      tuned: swapRefs(tuned.swaps),
      enhance: swapRefs(enhance.swaps),
      max: swapRefs(maxed.swaps),
      strength: stageStrength(stages[1], context),
      profile,
      genLog
    };
    const cards = new Map();
    stages.flat().forEach((entry) => cards.set(cardKey(entry.card.name), {...entry.card, roles: entry.card.roles || []}));
    [...tuned.swaps, ...enhance.swaps, ...maxed.swaps].forEach((swap) => cards.set(swap.key, {...swap.card, roles: swap.card.roles || []}));
    return {variant, cards: Array.from(cards.values()), stages, compliance: stages.map(evaluateEntries)};
  }

  async function generateForSlot(inputs, options = {}) {
    const client = options.client;
    if (!client) throw new Error("Generation requires a Scryfall client");
    const onProgress = options.onProgress || (() => {});
    const warnings = [];
    onProgress({phase: "commander", message: "Resolving the commander…"});
    const resolved = await resolveCommander(inputs, client, warnings, options.signal);
    if (!resolved.commander) return {commander: null, variants: [], cards: [], warnings, error: resolved.error};
    const commander = resolved.commander;
    const identity = new Set((commander.colorIdentity || []).map((color) => String(color).toUpperCase()));
    const budgetUsd = Math.max(25, Number(inputs.budgetUsd) || 150);
    const context = {
      slotId: Number(inputs.slotId) || 101,
      inputs,
      commander,
      commanderSource: resolved.source,
      commanderSubtypes: String(commander.typeLine || "").split("—")[1]?.trim().split(/\s+/) || [],
      identity,
      themes: normalizeThemes(inputs.themes),
      preferSet: String(inputs.preferSet || "").trim().toLowerCase(),
      budgetUsd,
      perCardCap: Math.max(3, budgetUsd * 0.12),
      seeds: [],
      seedKeys: new Set(),
      signal: options.signal,
      createdAt: options.createdAt || ""
    };
    onProgress({phase: "seeds", message: "Resolving your card links…"});
    context.seeds = await resolveSeeds(inputs, client, context, warnings);
    context.seedKeys = new Set(context.seeds.map((seed) => cardKey(seed.name)));
    const pool = await fetchPool(context, client, onProgress, warnings);
    if (pool.spells.length < 63) {
      warnings.push(`Only ${pool.spells.length} legal spells matched those inputs; widen the colors, themes or budget for a fuller pool.`);
      if (pool.spells.length < 20) return {commander, variants: [], cards: [], warnings, error: "Not enough legal cards matched those inputs to build a deck."};
    }
    onProgress({phase: "basics", message: "Fetching basic lands…"});
    const basics = await fetchBasics(context, client);
    const count = Math.max(1, Math.min(LENSES.length, Number(inputs.variantCount) || 3));
    const usedCounts = new Map();
    const variants = [];
    const cards = new Map();
    for (let index = 0; index < count; index += 1) {
      const lens = LENSES[index];
      onProgress({phase: "build", index, total: count, message: `Building ${lens.label}…`});
      const built = buildVariant(context, pool, basics, lens, index + 1, usedCounts);
      built.stages[1].forEach((entry) => {
        const key = cardKey(entry.card.name);
        usedCounts.set(key, (usedCounts.get(key) || 0) + 1);
      });
      built.cards.forEach((card) => cards.set(cardKey(card.name), card));
      variants.push(built);
    }
    const ranked = [...variants].sort((a, b) => b.variant.strength - a.variant.strength);
    ranked.forEach((built, index) => {
      built.variant.profile.ranks = [index + 1, index + 1, index + 1];
    });
    onProgress({phase: "done", message: `Built ${variants.length} variant${variants.length === 1 ? "" : "s"}.`});
    return {
      commander,
      variants: variants.map((built) => built.variant),
      builds: variants,
      cards: Array.from(cards.values()),
      pool,
      warnings,
      stats: client.stats ? client.stats() : null
    };
  }

  return {
    ROLE_QUOTAS,
    ROLE_ORDER,
    ROLE_QUERIES,
    THEME_QUERIES,
    THEME_ALIASES,
    PLAYSTYLE_BIAS,
    LENSES,
    quotasFor,
    DECK_SIZE,
    classifyRoles,
    canBeCommander,
    normalizeThemes,
    identityClause,
    buildRoleQuery,
    buildThemeQuery,
    scoreCard,
    themeScore,
    edhrecScore,
    allocateBasics,
    pipDemand,
    resolveCommander,
    resolveSeeds,
    fetchPool,
    fetchBasics,
    buildBase,
    buildVariant,
    applySwaps,
    evaluateEntries,
    totalOf,
    generateForSlot,
    mulberry32,
    hashString
  };
});
