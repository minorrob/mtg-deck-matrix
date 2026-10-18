/* The compliance report: each bracket rule, where this hundred stands against it, the cards that count, and the swap
 * that would bring it inside. It explains; it never enforces.
 *
 * WHAT THIS IS FOR (Linear ROB-111). The lobby refuses a seat over its bracket's Game Changer cap and names the cards
 * (crankmagic-lobby.js validate); the Lab's compliance tiers list issues per tier (compliance-model.js); the deck page
 * counts Game Changers against the house limit. None of them gives the reader one report that says, rule by rule,
 * met or over, what the app checked and what it could not, and what one swap would do. This does, as a pure function
 * the Lab (ROB-110), the deck page (the Tune tab) and the lobby's deck chooser render. AGENTS.md: decisions inside the
 * game belong to the players, so the report returns suggestions and changes nothing; the deck handed in is the deck
 * handed back.
 *
 * THE RULES (data/commander-brackets.json, dated; the report says which date it judged by):
 *   game-changers     cards the record flags (Scryfall's game_changer) or the caller names; the bracket's allowance
 *   mass-land-denial  text that destroys, sacrifices or locks down everyone's lands (compliance-model.js derives it)
 *   extra-turns       an extra-turn spell that comes back to be cast again is a chain (derived); three or more one-shot
 *                     extra turns in one pile is a question for the table, and the report says so rather than judging
 *   two-card-combos   the known early pairs (compliance-model.js TIER3_EARLY_COMBO_PAIRS) and curated combo tags; the
 *                     app cannot see every combo and says so
 *   tutors            counted, never a rule: the lower brackets keep them light
 *
 * EACH RULE'S STATUS: met · over · review (the app can count but not judge) · info (no rule at this bracket) ·
 * not-checked (the data to check it was not there, and why). `fits` is every checked rule met; `lowestFitting` is the
 * lowest bracket the deck fits as checked.
 *
 * SWAPS. For a rule that is over, one swap per card that would need to go: the least played goes first (the lobby's
 * own order), and the card in is the most played card in the pool that shares a role and breaks no rule, or a basic
 * land in the deck's heaviest color when there is no pool. A basic keeps the hundred legal and is plainly worse than
 * what it replaced; the sentence says so.
 *
 * PURE and UMD like deck-generator.js. tests/compliance-report.mjs holds it per bracket; the breaks are
 * game/tools/batch/breaks-compliance-report.py.
 */
(function (root, factory) {
  "use strict";
  const node = typeof module === "object" && module.exports && typeof require === "function";
  const take = (file, name) => { if (node) { try { return require(file); } catch (e) { return null; } } return root ? root[name] : null; };
  const api = factory({compliance: take("./compliance-model.js", "MtgComplianceModel"), brackets: node ? take("./data/commander-brackets.json") : root && root.CrankCommanderBrackets});
  if (node) module.exports = api;
  if (root) root.CrankCompliance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  const COLORS = ["W", "U", "B", "R", "G"];
  const BASIC_FOR = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes"};
  const EXTRA_TURN = /take (?:an|one|two|x|that many) extra turns?|extra turn after this one/i;
  const TUTOR = /search your library for (?:a|an|up to|any)\b(?!.{0,40}basic land)/i;
  const ONE_SHOTS_TO_REVIEW = 3;
  const TUTORS_LIGHT = 3;
  const ORDER = ["game-changers", "mass-land-denial", "extra-turns", "two-card-combos", "tutors"];

  const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim().toLowerCase();
  const front = (name) => String(name || "").split(" // ")[0].trim();
  const list = (names, limit = 4) => (names.length > limit ? `${names.slice(0, limit).join(", ")} and ${names.length - limit} more` : names.join(", "));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

  function normalize(raw) {
    const c = raw || {};
    const ci = c.colorIdentity || c.ci || c.color_identity;
    return {
      name: String(c.name || "").trim(), quantity: Math.max(1, Math.floor(Number(c.quantity)) || 1),
      typeLine: String(c.typeLine || c.type_line || c.type || ""), text: String(c.oracleText || c.oracle_text || c.text || ""),
      gameChanger: !!(c.gameChanger || c.game_changer), tags: (c.tags || []).map((t) => String(t).toLowerCase()),
      roles: Array.isArray(c.roles) ? c.roles : [], rank: Number.isFinite(c.rank) && c.rank > 0 ? c.rank : (Number.isFinite(c.edhrecRank) && c.edhrecRank > 0 ? c.edhrecRank : null),
      identity: Array.isArray(ci) ? ci.map((x) => String(x).toUpperCase()) : typeof ci === "string" ? ci.split("") : null,
      price: Number.isFinite(c.price) && c.price > 0 ? c.price : null, raw: c
    };
  }
  const isBasic = (c) => /\bBasic\b/.test(c.typeLine);
  const isLand = (c) => /\bLand\b/.test(c.typeLine);

  function bracketTable(options) {
    const data = (options && options.brackets) || deps.brackets || null;
    const brackets = data && Array.isArray(data.brackets) ? data.brackets : null;
    return {brackets, rules: data && data.rules ? data.rules : [], asOf: data && data.updatedAt ? String(data.updatedAt) : null};
  }
  const bracketOf = (table, n) => (table.brackets || []).find((b) => b.n === n) || null;

  /* What each card counts against. */
  function facts(cards, options) {
    const named = new Set([...(options && options.gameChangers instanceof Set ? options.gameChangers : Array.isArray(options && options.gameChangers) ? options.gameChangers : [])].flatMap((n) => [fold(n), fold(front(n))]));
    const derive = deps.compliance && typeof deps.compliance.deriveComplianceTags === "function" ? deps.compliance.deriveComplianceTags : () => [];
    for (const c of cards) {
      const derived = c.text ? derive({oracleText: c.text}).map((t) => t.toLowerCase()) : [];
      const tags = c.tags.concat(derived);
      c.isGameChanger = c.gameChanger || named.has(fold(c.name)) || named.has(fold(front(c.name)));
      c.massLandDenial = tags.some((t) => /mass land|land destruction/.test(t));
      c.extraTurn = EXTRA_TURN.test(c.text.replace(/\([^)]*\)/g, ""));
      c.extraTurnLoop = tags.some((t) => /extra turn loop|turn loop/.test(t));
      c.comboTag = tags.some((t) => /infinite combo|two.card combo|early combo/.test(t));
      c.tutor = c.roles.includes("tutor") || (!isLand(c) && TUTOR.test(c.text.replace(/\([^)]*\)/g, "")));
    }
  }

  /* The swap for one card out: the most played pool card sharing a role that breaks no rule, else a basic. */
  function swapFor(out, cards, pool, identity, breaks) {
    const inDeck = new Set(cards.map((c) => fold(c.name)));
    const heaviest = (() => {
      const weight = new Map(COLORS.map((x) => [x, 0]));
      for (const c of cards) for (const x of c.identity || []) if (weight.has(x)) weight.set(x, weight.get(x) + c.quantity);
      const colors = identity && identity.length ? identity : COLORS.filter((x) => weight.get(x) > 0);
      return colors.slice().sort((a, b) => weight.get(b) - weight.get(a) || a.localeCompare(b))[0] || "C";
    })();
    const basic = {name: BASIC_FOR[heaviest] || "Wastes", why: `a basic keeps the hundred legal; put something real there before a game that matters`};
    if (!pool || !pool.length) return {out: out.name, in: basic.name, why: `no pool to choose from, so ${basic.why}`};
    const roles = new Set(out.roles.filter((r) => !["creatures", "instants", "artifacts", "lands", "enchantments", "sorceries"].includes(r)));
    const fits = pool.map(normalize).filter((p) => p.name && !inDeck.has(fold(p.name)) && !breaks(p) && (!identity || !identity.length || !(p.identity || []).some((x) => !identity.includes(x))) && !isLand(p));
    facts(fits, {});
    const shared = fits.filter((p) => !p.isGameChanger && !p.massLandDenial && !p.extraTurnLoop && (!roles.size || p.roles.some((r) => roles.has(r))));
    shared.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || a.name.localeCompare(b.name));
    const pick = shared[0];
    if (!pick) return {out: out.name, in: basic.name, why: `nothing in the pool shares its role without breaking a rule, so ${basic.why}`};
    const role = [...roles].find((r) => pick.roles.includes(r));
    return {out: out.name, in: pick.name, why: `${pick.name} shares its role${role ? ` (${role})` : ""}${pick.rank ? `, #${pick.rank.toLocaleString("en-US")} among what Commander decks run` : ""}, and counts against no rule at this bracket`};
  }

  /**
   * The report for one deck at one bracket. `deck` is {commanders, cards}; `options.bracket` 1 to 5 (default 3);
   * `options.pool` the catalog rows swaps may come from; `options.gameChangers` names to count beyond the flags;
   * `options.brackets` the bracket table (data/commander-brackets.json).
   */
  function report(deck, options) {
    const o = options || {};
    const table = bracketTable(o);
    const n = Math.min(5, Math.max(1, Math.round(Number(o.bracket)) || 3));
    const bracket = bracketOf(table, n);
    if (!bracket) return {available: false, error: "The bracket table (data/commander-brackets.json) was not available.", bracket: {n}, rules: [], fits: null};
    const commanders = ((deck && deck.commanders) || []).map(normalize).filter((c) => c.name);
    const cards = ((deck && deck.cards) || []).map(normalize).filter((c) => c.name);
    const identity = [...new Set(commanders.flatMap((c) => c.identity || []))];
    facts(cards, o);
    facts(commanders, o);
    const all = commanders.map((c) => ({...c, isCommander: true})).concat(cards);
    const breaks = (p) => p.isGameChanger || p.massLandDenial || p.extraTurnLoop;
    const rules = [];
    const label = (id) => (table.rules.find((r) => r.id === id) || {label: id}).label;
    const says = (id) => (table.rules.find((r) => r.id === id) || {says: ""}).says;

    /* 1. Game Changers. */
    {
      const hits = all.filter((c) => c.isGameChanger);
      const count = hits.reduce((s, c) => s + c.quantity, 0);
      const limit = bracket.gameChangers;
      const flagged = all.some((c) => c.gameChanger) || (o.gameChangers && (o.gameChangers.size || o.gameChangers.length));
      const checked = flagged || hits.length > 0 || all.every((c) => "gameChanger" in c.raw || "game_changer" in c.raw);
      let status = !checked ? "not-checked" : limit === null ? "info" : count > limit ? "over" : "met";
      const swaps = [];
      if (status === "over") {
        const order = hits.filter((c) => !c.isCommander).slice().sort((a, b) => (b.rank === null ? -1 : b.rank) - (a.rank === null ? -1 : a.rank) || a.name.localeCompare(b.name));
        for (const out of order.slice(0, count - limit)) swaps.push(swapFor(out, cards, o.pool, identity, breaks));
      }
      rules.push({id: "game-changers", label: label("game-changers"), status, checked: status !== "not-checked", count, limit,
        cards: hits.map((c) => ({name: c.name, why: c.isCommander ? "the commander, on the list" : "on the list"})),
        how: status === "not-checked" ? "no card carried a Game Changer flag and none were named; resolve the list against the catalog first" : "the record's Game Changer flag (Scryfall's game_changer) and any names the caller added",
        says: status === "not-checked" ? `Not checked: ${says("game-changers")} The cards carried no flag.` : limit === null ? `${plural(count, "Game Changer")}; bracket ${n} sets no limit.` : count > limit ? `${plural(count, "Game Changer")} (${list(hits.map((c) => c.name))}); bracket ${n} allows ${limit === 0 ? "none" : limit}. ${count - limit} would have to go.` : `${count ? plural(count, "Game Changer") + ` (${list(hits.map((c) => c.name))})` : "No Game Changers"}; bracket ${n} allows ${limit === 0 ? "none" : limit}.`,
        swaps});
    }

    /* 2. Mass land denial. */
    {
      const hits = all.filter((c) => c.massLandDenial);
      const allowed = bracket.massLandDenial;
      const status = allowed ? "info" : hits.length ? "over" : "met";
      const swaps = status === "over" ? hits.filter((c) => !c.isCommander).map((out) => swapFor(out, cards, o.pool, identity, breaks)) : [];
      rules.push({id: "mass-land-denial", label: label("mass-land-denial"), status, checked: true, count: hits.length, limit: allowed ? null : 0, cards: hits.map((c) => ({name: c.name, why: "destroys, sacrifices or locks down everyone's lands"})),
        how: "read from each card's own text (compliance-model.js derives the tag) and from curated tags", says: allowed ? `${hits.length ? plural(hits.length, "mass land denial card") + ` (${list(hits.map((c) => c.name))})` : "No mass land denial"}; bracket ${n} allows it.` : hits.length ? `${list(hits.map((c) => c.name))}: mass land denial, which bracket ${n} does not allow.` : `No mass land denial, as bracket ${n} asks.`, swaps});
    }

    /* 3. Extra turns. */
    {
      const loops = all.filter((c) => c.extraTurnLoop);
      const shots = all.filter((c) => c.extraTurn && !c.extraTurnLoop);
      const allowed = bracket.extraTurnChains;
      const total = loops.length + shots.length;
      const status = allowed ? "info" : loops.length ? "over" : shots.length >= ONE_SHOTS_TO_REVIEW ? "review" : "met";
      const swaps = status === "over" ? loops.filter((c) => !c.isCommander).map((out) => swapFor(out, cards, o.pool, identity, breaks)) : [];
      rules.push({id: "extra-turns", label: label("extra-turns"), status, checked: true, count: total, limit: allowed ? null : 0,
        cards: loops.map((c) => ({name: c.name, why: "comes back to be cast again: a chain on its own"})).concat(shots.map((c) => ({name: c.name, why: "one extra turn, once"}))),
        how: "a spell that returns itself is read from its text; several one-shot extra turns are counted, and whether they chain in play is the table's judgment",
        says: allowed ? `${total ? plural(total, "extra-turn spell") : "No extra turns"}; bracket ${n} allows chains.` : loops.length ? `${list(loops.map((c) => c.name))} ${loops.length === 1 ? "comes" : "come"} back to be cast again, a chain bracket ${n} does not allow.` : shots.length >= ONE_SHOTS_TO_REVIEW ? `${plural(shots.length, "one-shot extra turn")} (${list(shots.map((c) => c.name))}): none chains by itself, but ${shots.length} in one pile is a question for the table at bracket ${n}.` : shots.length ? `${plural(shots.length, "one-shot extra turn")} (${list(shots.map((c) => c.name))}); no chain, as bracket ${n} asks.` : `No extra turns, as bracket ${n} asks.`,
        swaps});
    }

    /* 4. Two-card combos. */
    {
      const names = new Set(all.map((c) => fold(c.name)));
      const pairs = (deps.compliance && deps.compliance.TIER3_EARLY_COMBO_PAIRS || []).filter((pair) => pair.every((x) => names.has(fold(x))));
      const tagged = all.filter((c) => c.comboTag && !pairs.some((pair) => pair.some((x) => fold(x) === fold(c.name))));
      const policy = bracket.twoCardCombos;
      const found = pairs.length + tagged.length;
      const status = policy === "any" ? "info" : pairs.length ? "over" : tagged.length ? (policy === "none" ? "over" : "review") : "met";
      const swaps = [];
      if (status === "over") {
        for (const pair of pairs) { const out = all.find((c) => fold(c.name) === fold(pair[0]) && !c.isCommander) || all.find((c) => fold(c.name) === fold(pair[1]) && !c.isCommander); if (out) swaps.push(swapFor(out, cards, o.pool, identity, breaks)); }
        if (policy === "none") for (const out of tagged.filter((c) => !c.isCommander)) swaps.push(swapFor(out, cards, o.pool, identity, breaks));
      }
      rules.push({id: "two-card-combos", label: label("two-card-combos"), status, checked: true, count: found, limit: policy === "any" ? null : 0,
        cards: pairs.map((pair) => ({name: pair.join(" + "), why: "a known two-card combo that wins early"})).concat(tagged.map((c) => ({name: c.name, why: "curated as a combo piece"}))),
        how: `the known early pairs (${(deps.compliance && deps.compliance.TIER3_EARLY_COMBO_PAIRS || []).length}) and curated combo tags; the app cannot see every combo, and a combo it does not know is not here`,
        says: policy === "any" ? `${found ? plural(found, "known combo piece or pair") : "No known two-card combo"}; bracket ${n} allows them.` : pairs.length ? `${pairs.map((p) => p.join(" + ")).join("; ")}: ${pairs.length === 1 ? "a two-card combo that wins early" : "two-card combos that win early"}, which bracket ${n} does not allow${policy === "late" ? " before the late game" : ""}.` : tagged.length ? (policy === "none" ? `${list(tagged.map((c) => c.name))}: curated as combo pieces, which bracket ${n} does not allow.` : `${list(tagged.map((c) => c.name))}: curated as combo pieces; at bracket ${n} a two-card combo is a late-game finish only, which the table judges.`) : `No known two-card combo, as bracket ${n} asks; the app knows ${(deps.compliance && deps.compliance.TIER3_EARLY_COMBO_PAIRS || []).length} pairs and the curated tags, not every combo.`,
        swaps});
    }

    /* 5. Tutors. */
    {
      const hits = all.filter((c) => c.tutor);
      const count = hits.reduce((s, c) => s + c.quantity, 0);
      const status = bracket.tutorsLight ? (count > TUTORS_LIGHT ? "review" : "met") : "info";
      rules.push({id: "tutors", label: label("tutors"), status, checked: true, count, limit: bracket.tutorsLight ? TUTORS_LIGHT : null, cards: hits.map((c) => ({name: c.name, why: "searches the library"})),
        how: "the record's tutor role, else the card's text (a basic-land search is not a tutor)",
        says: bracket.tutorsLight ? (count > TUTORS_LIGHT ? `${plural(count, "tutor")} (${list(hits.map((c) => c.name))}); bracket ${n} keeps them light, a few at most. Not a rule: the table decides.` : `${count ? plural(count, "tutor") + ` (${list(hits.map((c) => c.name))})` : "No tutors"}; light, as bracket ${n} likes.`) : `${count ? plural(count, "tutor") : "No tutors"}; no limit at bracket ${n}.`,
        swaps: []});
    }

    rules.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    const over = rules.filter((r) => r.status === "over");
    const review = rules.filter((r) => r.status === "review");
    const notChecked = rules.filter((r) => r.status === "not-checked");
    const fits = over.length === 0;
    /* The lowest bracket the deck fits, as checked, by the same reading. */
    let lowestFitting = null;
    for (const b of (table.brackets || []).slice().sort((x, y) => x.n - y.n)) {
      const gc = all.filter((c) => c.isGameChanger).reduce((s, c) => s + c.quantity, 0);
      const okGc = b.gameChangers === null || gc <= b.gameChangers;
      const okMld = b.massLandDenial || !all.some((c) => c.massLandDenial);
      const okTurns = b.extraTurnChains || !all.some((c) => c.extraTurnLoop);
      const names = new Set(all.map((c) => fold(c.name)));
      const pairs = (deps.compliance && deps.compliance.TIER3_EARLY_COMBO_PAIRS || []).some((pair) => pair.every((x) => names.has(fold(x))));
      const taggedCombo = all.some((c) => c.comboTag);
      const okCombo = b.twoCardCombos === "any" || (!pairs && (b.twoCardCombos === "late" || !taggedCombo));
      if (okGc && okMld && okTurns && okCombo) { lowestFitting = b.n; break; }
    }
    return {
      available: true,
      bracket: {n, name: bracket.name, says: bracket.says}, asOf: table.asOf,
      rules, fits, over: over.map((r) => r.id), review: review.map((r) => r.id), notChecked: notChecked.map((r) => r.id), lowestFitting,
      swaps: rules.flatMap((r) => r.swaps.map((s) => ({rule: r.id, ...s}))),
      decides: "The reader. This report changes nothing on its own; every swap is an offer.",
      says: `Bracket ${n}, ${bracket.name}${table.asOf ? ` (rules as of ${table.asOf})` : ""}: ${fits ? "every rule the app can check is met" : `${plural(over.length, "rule")} over (${over.map((r) => r.label.toLowerCase()).join(", ")})`}${review.length ? `; ${review.map((r) => r.label.toLowerCase()).join(" and ")} for the table to judge` : ""}${notChecked.length ? `; ${notChecked.map((r) => r.label.toLowerCase()).join(" and ")} not checked` : ""}.${lowestFitting !== null && lowestFitting !== n ? ` As checked, it fits bracket ${lowestFitting} and up.` : ""}`
    };
  }

  /** The same deck at every bracket, for a chooser: [{n, name, fits, over}]. */
  function ladder(deck, options) {
    const table = bracketTable(options);
    return (table.brackets || []).map((b) => { const r = report(deck, {...(options || {}), bracket: b.n}); return {n: b.n, name: b.name, fits: r.fits, over: r.over, review: r.review}; });
  }

  return {report, ladder, normalize, ONE_SHOTS_TO_REVIEW, TUTORS_LIGHT, ORDER};
});
