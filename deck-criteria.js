/* Build me a deck from my criteria: a hundred with a reason on every slot, measured against what was asked for.
 *
 * WHAT THIS IS FOR (Linear ROB-109). Rob's fourth outcome: "creating Commander decks is fast with solid reasonableness
 * to how it's generated based on the criteria I'm after (playstyle, cost, bracket, maybe commander, maybe colors)."
 * The Lab builds from a commander today (draft-builder.js, seeded by the Trace); the online generator builds from a
 * commander and themes (deck-generator.js, Scryfall required). Neither starts from criteria alone, suggests a commander,
 * or says why each card is in the list. This module does, offline, over the catalog the app already has, as one pure
 * function the Lab's new screen (ROB-110) renders and never recomputes.
 *
 * THE CRITERIA RECORD:
 *   {playstyle, budgetUsd, bracket, commander, colors, mustInclude, neverInclude, ownedFirst, seed, perCardCap}
 *   playstyle is one of the Lab's five (Balanced, Aggressive, Reactive, Value engine, Combo); bracket the published
 *   1 to 5; commander a name or a row, or null to ask for suggestions; colors the letters W U B R G when the
 *   commander is open; mustInclude pinned by name; neverInclude fenced out; ownedFirst prefers the library's copies;
 *   seed makes two builds on the same criteria differ, and the same seed the same build.
 *
 * HOW IT BUILDS. The draft builder does the hundred (roles to their targets, the cap planned not merely obeyed, the
 * bracket's Game Changer allowance spent, the reserve rule so the list always completes); this module decides what the
 * builder is pointed at:
 *   - the commander, given or suggested (suggestCommanders: fit to the playstyle's strategies, to the colors asked
 *     for, to what people play, to the budget, each with its reason);
 *   - the deck's strategies: what the commander's own text offers (crankmagic-strategies.js derive) plus what the
 *     playstyle asks for;
 *   - the seed, a bonus per card: the Trace from the commander over the legal pool (crankmagic-trace.js, the same walk
 *     the Lab seeds from: ring 1 engines first, then ring 2, then the payoffs, each weighed by its loop-backs), the
 *     playstyle's role weights (Aggressive wants threats and a low curve, Reactive wants answers, Value engine wants
 *     draw and recursion, Combo wants tutors and engines), and a small deterministic jitter from the seed string.
 *     Without the graph's relate() (a page that has not loaded it) the seed falls back to what each card's own text
 *     offers the deck's strategies, at a lower weight, and the method says so.
 * Then every slot gets its reason: the role it fills, the strategies it serves, and why it beat the next candidate of
 * the same role (asked for, owned, serves a strategy the other does not, more played, cheaper, cheaper to cast).
 *
 * WHAT COMES BACK WITH IT. The composition summary against the bracket's and playstyle's targets (deck-composition.js,
 * ROB-114) with the gaps named; the legality verdict (commander-legality.js, ROB-104) with the banned list applied;
 * the budget line (cap, spent, within); the Game Changer line (allowed, carried). The method says what this is: a
 * constructive draft, not a measured deck. The simulator measures (ROB-116); this builds.
 *
 * PURE and UMD like deck-generator.js. tests/deck-criteria.mjs holds six criteria sets on the committed stores; the
 * breaks are game/tools/batch/breaks-deck-criteria.py. The Lab passes `C.catalog.all()` as the catalog and the owned
 * counts as the library; the suite builds the same rows from the stores (tests/helpers/catalog-rows.mjs).
 */
(function (root, factory) {
  "use strict";
  const node = typeof module === "object" && module.exports && typeof require === "function";
  const take = (file, name) => { if (node) { try { return require(file); } catch (e) { return null; } } return root ? root[name] : null; };
  const api = factory({
    draft: take("./draft-builder.js", "CrankDraft"),
    strategies: take("./crankmagic-strategies.js", "CrankStrategies"),
    composition: take("./deck-composition.js", "CrankComposition"),
    legality: take("./commander-legality.js", "CrankLegality"),
    classify: take("./card-classify.js", "MtgCardClassify"),
    change: take("./crankmagic-change.js", "CrankChange"),
    trace: take("./crankmagic-trace.js", "CrankTrace"),
    relate: root && root.CrankGraph && typeof root.CrankGraph.relate === "function" ? root.CrankGraph.relate : null,
    targets: node ? take("./data/composition-targets.json") : root && root.CrankCompositionTargets,
    banned: node ? take("./data/commander-banned.json") : root && root.CrankCommanderBanned
  });
  if (node) module.exports = api;
  if (root) root.CrankCriteria = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  const PLAYSTYLES = ["Balanced", "Aggressive", "Reactive", "Value engine", "Combo"];
  const COLORS = ["W", "U", "B", "R", "G"];
  const COLOR_NAME = {W: "white", U: "blue", B: "black", R: "red", G: "green"};

  /* What each playstyle asks for: the strategies it leans on and the roles it weighs, as points added to the
     builder's score (the builder's own terms: a matched mechanic is 100, a staple's popularity up to 40, an owned copy
     30, each mana value point minus one). STRATEGY_POINTS is worth a staple's popularity, so what the deck is trying to
     do outranks what is merely played; the role weights are half that, a lean rather than a mandate. */
  const PLAYSTYLE = {
    "Balanced": {strategies: [], roles: {}, mvBias: 0, says: "the commander's own strategies, the roles to their targets"},
    "Aggressive": {strategies: ["team-quality", "tribal-payoff", "stat-payoff", "counters"], roles: {threat: 25, finisher: 10, wipe: -25, draw: -5}, mvBias: -3, says: "threats and a low curve over answers"},
    "Reactive": {strategies: ["spellslinger", "draw-payoff"], roles: {removal: 25, counterspell: 25, protection: 15, wipe: 10, threat: -10}, mvBias: 0, says: "answers first: removal, counterspells, protection"},
    "Value engine": {strategies: ["etb-payoff", "blink-loop", "death-payoff", "draw-payoff", "recursion-loop", "landfall"], roles: {draw: 25, recursion: 15, ramp: 10}, mvBias: 0, says: "card advantage and engines that keep giving"},
    "Combo": {strategies: ["untap-loop", "copy-loop", "sacrifice-supply", "tutor-chain", "extra-turns"], roles: {tutor: 30, protection: 10, counterspell: 10}, mvBias: 0, says: "tutors, engines and the protection to resolve them"}
  };
  const STRATEGY_POINTS = 15;     // the fallback, when the Trace is not available: a card's own text offering a strategy
  const STRATEGY_CAP = 45;
  const TRACE_BEAM = {1: 60, 2: 40, 3: 30};
  const TRACE_WORLD = 2000;       // the most-played cards in the colors, plus the owned and the asked-for; ring 2 costs beam × world
  const TRACE_RING = [0, 150, 100, 50];
  const TRACE_LOOP = 15;          // per log2(1 + loop-backs): 2 loop-backs are worth 24 points, 270 are worth 120, not 5,400
  const ROLE_SCALE = 3;           // the playstyle's role weights, against the Trace's rings
  const JITTER = 6;
  const SUGGESTIONS = 5;

  const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim().toLowerCase();
  const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;
  const money = (x) => (x === null || x === undefined ? "no price" : `$${round2(x).toFixed(2)}`);
  const list = (names, limit = 3) => names.length > limit ? `${names.slice(0, limit).join(", ")} and ${names.length - limit} more` : names.join(", ");

  /* A small deterministic hash for the seed's jitter (the same mixing deck-generator.js uses). */
  function hash(value) {
    let h = 2166136261;
    const s = String(value);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  }
  const jitter = (seed, id) => (hash(`${seed}|${id}`) % 1000) / 1000 * JITTER;

  /* ---------- the criteria ---------- */

  function normalizeCriteria(raw) {
    const c = raw || {};
    const playstyle = PLAYSTYLES.find((p) => fold(p) === fold(Array.isArray(c.playstyle) ? c.playstyle[0] : c.playstyle)) || "Balanced";
    const bracket = Math.min(5, Math.max(1, Math.round(Number(c.bracket)) || 3));
    const budget = c.budgetUsd === null || c.budgetUsd === undefined || c.budgetUsd === "" ? null : Math.max(0, Number(c.budgetUsd) || 0);
    const perCardCap = c.perCardCap === null || c.perCardCap === undefined || c.perCardCap === "" ? null : Math.max(0, Number(c.perCardCap) || 0);
    const colors = Array.isArray(c.colors) ? [...new Set(c.colors.map((x) => String(x).toUpperCase()).filter((x) => COLORS.includes(x)))] : null;
    const names = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => (x && typeof x === "object" ? x.name : x)).map((x) => String(x || "").trim()).filter(Boolean);
    return {
      playstyle, bracket, budgetUsd: budget, perCardCap,
      commander: c.commander && typeof c.commander === "object" ? c.commander : (c.commander ? String(c.commander).trim() : null),
      colors: colors && colors.length ? colors : null,
      mustInclude: names(c.mustInclude), neverInclude: names(c.neverInclude),
      ownedFirst: c.ownedFirst !== false,
      seed: c.seed === undefined || c.seed === null || c.seed === "" ? "crankmagic" : String(c.seed)
    };
  }

  /* ---------- the stores ---------- */

  const identityOf = (card) => (Array.isArray(card.colorIdentity) ? card.colorIdentity : String(card.ci || "").split("")).map((x) => String(x).toUpperCase()).filter((x) => COLORS.includes(x));
  const isLegal = (card) => !!card && (card.verified === undefined || card.verified) && (!card.legalities || !card.legalities.commander || card.legalities.commander === "legal");
  const canLead = (card) => !!(card.commander || card.isCommander || (/Legendary/.test(card.typeLine || "") && /Creature/.test(card.typeLine || "")) || /can be your commander/i.test(card.oracleText || ""));
  const priceOf = (card) => (Number.isFinite(card.price) && card.price > 0 ? card.price : null);
  const rankOf = (card) => (Number.isFinite(card.rank) && card.rank > 0 ? card.rank : null);
  const rankBonus = (card) => { const r = rankOf(card); return r ? Math.max(0, 40 - 8 * Math.log10(r)) : 0; };

  function libraryOf(library) {
    const byId = new Map(), byName = new Map();
    if (!library) return {byId, byName, size: 0};
    if (library instanceof Map) { for (const [k, v] of library) { if (v > 0) byId.set(k, v); } }
    else if (Array.isArray(library)) { for (const r of library) { if (!r) continue; const q = Number(r.quantity) || 1; if (r.id) byId.set(r.id, (byId.get(r.id) || 0) + q); if (r.name) byName.set(fold(r.name), (byName.get(fold(r.name)) || 0) + q); } }
    else if (typeof library === "object") { for (const [k, v] of Object.entries(library)) if (Number(v) > 0) byId.set(k, Number(v)); }
    return {byId, byName, size: byId.size + byName.size};
  }
  const ownedCount = (lib, card) => lib.byId.get(card.id) || lib.byName.get(fold(card.name)) || 0;

  /* ---------- the commander ---------- */

  function strategiesOf(card) {
    if (!deps.strategies || !card) return [];
    try { return deps.strategies.derive(card) || []; } catch (e) { return []; }
  }
  const labelOf = (id) => (deps.strategies && deps.strategies.labelOf ? deps.strategies.labelOf(id) : id).toLowerCase();

  /**
   * Commanders that fit the criteria, best first, each with its reasons. Fit: the playstyle's strategies the card
   * offers, the colors asked for (an exact match first, then inside them), what people play (the commander rank
   * where the catalog has it, else the card's rank), and the budget (a commander should not be a tenth of it).
   */
  function suggestCommanders(rawCriteria, catalog, options) {
    const c = normalizeCriteria(rawCriteria);
    const o = options || {};
    const want = new Set(PLAYSTYLE[c.playstyle].strategies);
    const limit = Math.max(1, Number(o.limit) || SUGGESTIONS);
    const never = new Set(c.neverInclude.map(fold));
    const rows = [];
    for (const card of catalog || []) {
      if (!card || !canLead(card) || !isLegal(card) || never.has(fold(card.name))) continue;
      const identity = identityOf(card);
      if (c.colors && identity.some((x) => !c.colors.includes(x))) continue;
      if (!identity.length && c.colors) continue;
      const offers = strategiesOf(card);
      const matched = offers.filter((id) => want.has(id));
      const exact = c.colors ? identity.length === c.colors.length : false;
      const price = priceOf(card);
      const rank = Number.isFinite(card.commanderRank) && card.commanderRank > 0 ? card.commanderRank : null;
      const played = rank ? Math.max(0, 40 - 8 * Math.log10(rank)) : rankBonus(card) * 0.5;
      const overBudget = c.budgetUsd !== null && price !== null && price > Math.max(5, c.budgetUsd * 0.1);
      const score = matched.length * 30 + (c.playstyle === "Balanced" ? Math.min(2, offers.length) * 10 : 0) + (exact ? 15 : 0) + played - (overBudget ? 40 : 0) - (price === null && c.budgetUsd !== null ? 10 : 0);
      const reasons = [];
      if (matched.length) reasons.push(`offers ${list(matched.map(labelOf))} (${c.playstyle} asks for ${list([...want].map(labelOf), 2)})`);
      else if (offers.length) reasons.push(`offers ${list(offers.map(labelOf))}`);
      if (c.colors) reasons.push(exact ? `exactly ${identity.map((x) => COLOR_NAME[x]).join(" and ")}` : `inside ${c.colors.map((x) => COLOR_NAME[x]).join(" and ")} (${identity.map((x) => COLOR_NAME[x]).join(" and ") || "colorless"})`);
      if (rank) reasons.push(`#${rank.toLocaleString("en-US")} among commanders people play`);
      else if (rankOf(card)) reasons.push(`#${rankOf(card).toLocaleString("en-US")} among cards people play`);
      if (price !== null) reasons.push(overBudget ? `${money(price)}, a large share of a ${money(c.budgetUsd)} deck` : money(price));
      rows.push({card, score: round2(score), strategies: offers, matched, reasons, says: `${card.name}: ${reasons.join("; ")}.`});
    }
    rows.sort((a, b) => b.score - a.score || (rankOf(a.card) || Infinity) - (rankOf(b.card) || Infinity) || a.card.name.localeCompare(b.card.name));
    return rows.slice(0, limit);
  }

  function findCard(catalog, nameOrRow) {
    if (!nameOrRow) return null;
    if (typeof nameOrRow === "object") {
      const byId = nameOrRow.id ? catalog.find((c) => c.id === nameOrRow.id) : null;
      return byId || catalog.find((c) => fold(c.name) === fold(nameOrRow.name)) || nameOrRow;
    }
    const key = fold(nameOrRow);
    return catalog.find((c) => fold(c.name) === key) || catalog.find((c) => fold(String(c.name).split(" // ")[0]) === key) || null;
  }

  /* ---------- roles, for the seed and the reasons ---------- */

  function rolesOf(card) {
    if (deps.composition && deps.composition.rolesOf && deps.composition.normalize) {
      try { return deps.composition.rolesOf(deps.composition.normalize(card), deps.classify && deps.classify.classify).roles; } catch (e) { /* fall through */ }
    }
    return Array.isArray(card.roles) ? card.roles : [];
  }

  /* ---------- the build ---------- */

  /**
   * The hundred from the criteria. `catalog` is the app's catalog rows; `library` the owned copies (a Map or object of
   * id to count, or rows with name and quantity); `options` may override the modules (draft, strategies, composition,
   * legality, classify, targets, banned) and the suggestion limit.
   */
  function buildFromCriteria(rawCriteria, catalog, library, options) {
    const started = Date.now();
    const o = {...deps, ...(options || {})};
    const criteria = normalizeCriteria(rawCriteria);
    const rows = (catalog || []).filter((c) => c && c.name);
    const notes = [], issues = [];
    if (!o.draft || typeof o.draft.build !== "function") return {available: false, criteria, error: "The draft builder (draft-builder.js) is not available.", notes, issues};
    const lib = libraryOf(library);

    /* 1. The commander. */
    let commander = findCard(rows, criteria.commander);
    let chosen = {how: "given", reason: "", alternatives: []};
    if (criteria.commander && !commander) issues.push(`${typeof criteria.commander === "object" ? criteria.commander.name : criteria.commander} is not in the catalog; a commander was suggested instead.`);
    if (!commander) {
      const suggested = suggestCommanders(criteria, rows, {limit: o.limit || SUGGESTIONS});
      if (!suggested.length) return {available: false, criteria, error: `No commander in the catalog fits ${criteria.colors ? criteria.colors.map((x) => COLOR_NAME[x]).join(" and ") : "those criteria"}.`, notes, issues};
      commander = suggested[0].card;
      chosen = {how: "suggested", reason: suggested[0].says, alternatives: suggested.slice(1).map((s) => ({name: s.card.name, says: s.says, strategies: s.strategies}))};
    } else if (!canLead(commander)) {
      issues.push(`${commander.name} is not a legendary creature and does not say it can be your commander; the build went ahead so the list can be reviewed.`);
    }
    const identity = identityOf(commander);
    if (criteria.colors && identity.some((x) => !criteria.colors.includes(x))) notes.push(`${commander.name} is ${identity.map((x) => COLOR_NAME[x]).join(" and ")}; the colors asked for were ${criteria.colors.map((x) => COLOR_NAME[x]).join(" and ")}. The commander decides.`);

    /* 2. The deck's strategies: the commander's own, then the playstyle's. */
    const own = strategiesOf(commander);
    const style = PLAYSTYLE[criteria.playstyle];
    const strategies = [...new Set([...own, ...style.strategies])];
    const wanted = new Set(strategies);

    /* 3. The pool and the pins. */
    const never = new Set(criteria.neverInclude.map(fold));
    const pool = rows.filter((c) => c !== commander && !never.has(fold(c.name)));
    const pinned = [];
    for (const name of criteria.mustInclude) {
      const card = findCard(pool, name);
      if (!card) { issues.push(`${name} is not in the catalog and could not be pinned.`); continue; }
      if (identityOf(card).some((x) => !identity.includes(x))) { issues.push(`${card.name} is outside ${commander.name}'s colors and was not pinned.`); continue; }
      pinned.push({cardId: card.id, quantity: 1});
    }

    /* 4. The seed: the Trace's rings and loop-backs when the graph can relate cards, the playstyle's roles, the jitter. */
    const seed = new Map();
    const roleCache = new Map();
    const rolesFor = (card) => { if (!roleCache.has(card.id)) roleCache.set(card.id, rolesOf(card)); return roleCache.get(card.id); };
    const fits = (card) => isLegal(card) && !identityOf(card).some((x) => !identity.includes(x));
    const world = pool.filter(fits);
    /* The Trace walks the most-played cards in the colors (plus every owned and asked-for card), not all of them:
       ring 2 relates each of its sixty engines to every card in the world, and twelve thousand cards is seconds. */
    const must = new Set(pinned.map((p) => p.cardId));
    const traceWorld = world.length <= TRACE_WORLD ? world : [...world].sort((a, b) => (must.has(b.id) - must.has(a.id)) || ((ownedCount(lib, b) > 0) - (ownedCount(lib, a) > 0)) || (rankOf(a) || Infinity) - (rankOf(b) || Infinity) || a.name.localeCompare(b.name)).slice(0, TRACE_WORLD);
    let traced = null, traceNote = "";
    if (o.trace && typeof o.trace.trace === "function" && typeof o.relate === "function" && o.strategies) {
      try {
        traced = o.trace.trace(commander, traceWorld, o.relate, strategies, {S: o.strategies, beam: TRACE_BEAM, purposeOf: o.classify && o.classify.purposeOf});
      } catch (e) { traced = null; traceNote = `The Trace could not be computed (${e.message}); the seed fell back to each card's own text.`; }
    } else traceNote = "The graph's relate() was not available, so the seed is what each card's own text offers the deck's strategies, not the Trace.";
    if (traceNote) notes.push(traceNote);
    const lit = new Map();   // id -> the trace row: ring, loopBacks, strategies served
    if (traced) for (const r of traced.list) if (r.ring) lit.set(r.id, r);
    const ringBonus = traced ? new Map([...lit.values()].map((r) => [r.id, (TRACE_RING[r.ring] || 0) + TRACE_LOOP * Math.log2(1 + (r.loopBacks || 0))])) : null;
    const servesCache = new Map();
    const servesFor = (card) => {
      if (!servesCache.has(card.id)) {
        const row = lit.get(card.id);
        servesCache.set(card.id, row ? (row.strategies || []).filter((id) => wanted.has(id)) : (traced ? [] : strategiesOf(card).filter((id) => wanted.has(id))));
      }
      return servesCache.get(card.id);
    };
    const weightOf = (card) => {
      let w = ringBonus ? (ringBonus.get(card.id) || 0) : Math.min(STRATEGY_CAP, servesFor(card).length * STRATEGY_POINTS);
      for (const r of rolesFor(card)) if (style.roles[r]) w += style.roles[r] * ROLE_SCALE;
      if (style.mvBias && !/Land/.test(card.typeLine || "")) w += style.mvBias * (Number(card.manaValue) || 0);
      return w;
    };
    for (const card of world) {
      const w = weightOf(card) + jitter(criteria.seed, card.id);
      if (w !== 0) seed.set(card.id, w);
    }
    const available = {};
    if (criteria.ownedFirst && lib.size) for (const card of pool) { const n = ownedCount(lib, card); if (n > 0) available[card.id] = n; }

    /* 5. The builder. */
    const definition = {
      baseBracket: criteria.bracket, bracketCeiling: criteria.bracket, budget: criteria.budgetUsd, perCardCap: criteria.perCardCap,
      playStyle: criteria.playstyle, mechanics: [], strategies, fitBracket: true, speed: 3, competitiveness: 3, saltiness: 3, restrictions: ""
    };
    const built = o.draft.build({commanders: [commander], cards: pool, definition, available, benchOnly: false, pinned, seed});
    const byId = new Map(pool.map((c) => [c.id, c]));
    byId.set(commander.id, commander);
    const chosenIds = new Set(built.slots.map((s) => s.cardId));

    /* 6. The reasons: role, strategies served, and why this over the next of its role. */
    const draftRole = (card) => o.draft.role(card);
    const order = (card) => weightOf(card) + rankBonus(card) + (available[card.id] ? 30 : 0) - (Number(card.manaValue) || 0);
    const nextByRole = new Map();
    const runnerUp = (card) => {
      const r = draftRole(card);
      if (!nextByRole.has(r)) {
        const best = pool.filter((c) => !chosenIds.has(c.id) && isLegal(c) && draftRole(c) === r && !identityOf(c).some((x) => !identity.includes(x)) && (criteria.perCardCap === null || (priceOf(c) !== null && priceOf(c) <= criteria.perCardCap)))
          .sort((a, b) => order(b) - order(a) || a.name.localeCompare(b.name))[0] || null;
        nextByRole.set(r, best);
      }
      return nextByRole.get(r);
    };
    const why = (card, isPinned) => {
      const serves = servesFor(card);
      const parts = [];
      const role = draftRole(card);
      const fine = rolesFor(card).filter((r) => r !== "threat" || /Creature|Planeswalker/.test(card.typeLine || ""));
      parts.push(role === "engine" ? (fine.length ? fine.join(", ") : "part of the plan") : role === "interaction" ? (fine.filter((r) => ["removal", "counterspell", "wipe", "protection"].includes(r)).join(", ") || "interaction") : role);
      const row = lit.get(card.id);
      if (serves.length) parts.push(`serves ${list(serves.map(labelOf))}${row ? ` (ring ${row.ring}${row.loopBacks ? `, ${row.loopBacks} loop-back${row.loopBacks === 1 ? "" : "s"}` : ""})` : ""}`);
      if (isPinned) parts.push("asked for");
      if (available[card.id]) parts.push("owned");
      const next = runnerUp(card);
      let over = "";
      if (next) {
        const ns = servesFor(next);
        if (isPinned) over = `${next.name} was next; this one you asked for`;
        else if (available[card.id] && !available[next.id]) over = `over ${next.name}, which you would buy`;
        else if (row && !lit.has(next.id)) over = `over ${next.name}, which the Trace from ${commander.name.split(",")[0]} never reaches`;
        else if (row && lit.get(next.id) && row.ring < lit.get(next.id).ring) over = `over ${next.name}: closer to the commander (ring ${row.ring} against ring ${lit.get(next.id).ring})`;
        else if (serves.length > ns.length) over = `over ${next.name}, which serves ${ns.length ? "fewer of the deck's strategies" : "none of the deck's strategies"}`;
        else if (rankOf(card) && rankOf(next) && rankOf(card) < rankOf(next)) over = `over ${next.name}: more played (#${rankOf(card).toLocaleString("en-US")} against #${rankOf(next).toLocaleString("en-US")})`;
        else if (priceOf(card) !== null && priceOf(next) !== null && priceOf(card) < priceOf(next)) over = `over ${next.name}: cheaper (${money(priceOf(card))} against ${money(priceOf(next))})`;
        else if ((Number(card.manaValue) || 0) < (Number(next.manaValue) || 0)) over = `over ${next.name}: cheaper to cast`;
        else over = `over ${next.name} by the builder's order`;
      }
      return {parts, over, says: `${parts.join("; ")}${over ? `; ${over}` : ""}.`};
    };
    const cards = built.slots.map((s) => {
      const card = byId.get(s.cardId);
      const isCommander = card === commander;
      const isPinned = !!s.pinned;
      const w = isCommander ? null : why(card, isPinned);
      return {
        card, name: card.name, quantity: s.quantity, isCommander, pinned: isPinned,
        role: isCommander ? "commander" : draftRole(card), roles: isCommander ? [] : rolesFor(card), strategies: isCommander ? own : servesFor(card),
        owned: Math.min(s.quantity, ownedCount(lib, card)), price: priceOf(card), rank: rankOf(card),
        reason: isCommander ? (chosen.how === "given" ? `Your commander; offers ${list(own.map(labelOf)) || "no strategy the vocabulary names"}.` : chosen.reason) : w.says
      };
    });
    const total = cards.reduce((n, c) => n + c.quantity, 0);

    /* 7. Composition, legality, budget, bracket. */
    let composition = null;
    if (o.composition && typeof o.composition.compose === "function") {
      try {
        composition = o.composition.compose(cards.filter((c) => !c.isCommander).map((c) => ({card: c.card, quantity: c.quantity})),
          {bracket: criteria.bracket, playStyle: criteria.playstyle, commanders: [commander], strategies: o.strategies, classify: o.classify && o.classify.classify, landTarget: o.change && o.change.landTarget, targets: o.targets && o.targets.base ? o.targets : (o.targets || null), colors: identity});
      } catch (e) { notes.push(`The composition summary could not be computed: ${e.message}`); }
    } else notes.push("The composition model (deck-composition.js) was not available; no composition summary.");
    let legality = null;
    if (o.legality && typeof o.legality.check === "function") {
      const bannedList = o.banned && o.banned.cards ? o.banned : (Array.isArray(o.banned) ? {cards: o.banned, generatedAt: null} : null);
      legality = o.legality.check({commanders: [commander], cards: cards.filter((c) => !c.isCommander).map((c) => ({...c.card, quantity: c.quantity}))}, {banned: bannedList ? bannedList.cards : undefined, bannedAt: bannedList ? bannedList.generatedAt : undefined});
    } else notes.push("The legality check (commander-legality.js) was not available; the list was not checked.");
    const spent = round2(built.estimatedPrice);
    const budget = {cap: criteria.budgetUsd, spent, within: criteria.budgetUsd === null || spent <= criteria.budgetUsd + 1e-9, unknownPrices: built.unknownPrices};
    const gcCap = criteria.bracket >= 4 ? null : criteria.bracket === 3 ? 3 : 0;
    const bracket = {n: criteria.bracket, gameChangers: built.gameChangers, allowed: gcCap, within: gcCap === null || built.gameChangers <= gcCap, fit: built.bracketFit};
    const ownedCards = cards.reduce((n, c) => n + c.owned, 0);

    return {
      available: true,
      criteria, seed: criteria.seed,
      commander: {card: commander, name: commander.name, identity, how: chosen.how, reason: chosen.reason || cards[0].reason, alternatives: chosen.alternatives},
      strategies: strategies.map((id) => ({id, label: labelOf(id), from: own.includes(id) ? (style.strategies.includes(id) ? "commander and playstyle" : "commander") : "playstyle"})),
      playstyle: {name: criteria.playstyle, says: style.says},
      cards, total, complete: total === 100,
      budget, bracket, composition, legality,
      owned: {cards: ownedCards, preferred: criteria.ownedFirst && lib.size > 0},
      pinned: pinned.length, fenced: criteria.neverInclude.length, seeded: built.seeded,
      trace: traced ? {lit: traced.lit, world: traceWorld.length, pool: world.length, inDeck: cards.filter((c) => lit.has(c.card.id)).length} : null,
      issues: issues.concat(built.issues || []), notes: notes.concat(built.notes || []),
      method: `Constructive draft from criteria, seeded by ${traced ? "the Trace from the commander" : "the commander's strategies"} and the ${criteria.playstyle} playstyle; not simulated.`,
      ms: Date.now() - started
    };
  }

  return {PLAYSTYLES, PLAYSTYLE, STRATEGY_POINTS, JITTER, normalizeCriteria, suggestCommanders, buildFromCriteria, findCard, libraryOf, hash};
});
