/* The swap record: every recommended swap names its evidence, its composition change, its price, and its measured gain
 * when one exists, and is shown as unmeasured, never as a gain, when none does.
 *
 * WHAT THIS IS FOR (Linear ROB-117). Three places propose swaps today and each says something different about why:
 * the advisor labels inventory matches exact, shared-role alternatives hypotheses and historical swaps reference-only
 * (crankmagic-advisor.js); the Lab's refine keeps a swap only when a measured run beats the old score by more than its
 * own noise (crankmagic-lab.js); the AI advisor (cloud/advise.mjs) returns swaps as text. The deck page shows them
 * side by side with no common shape, so a hypothesis can read like a measurement. This module is the one record all
 * three emit, and the one rule all three obey: no recommendation without evidence, and no gain without a measurement.
 *
 * THE RECORD. {out, in, evidence[], composition, price, owned, measured, status, says}.
 *   evidence     [{kind, says, weight}]: role (shares the role it fills), strategy (serves one of the deck's), trace
 *                (the graph joins it to the commander or the hundred), inventory (owned), advisor, ai, history, each
 *                with the words the screen shows. A record with no evidence is status "no-evidence" and says it is not
 *                recommended; nothing downstream may promote it.
 *   composition  the role counts before and after (deck-composition.js, ROB-114) and what moved, or null with a note
 *                when the hundred was not supplied.
 *   price        out, in, delta.   owned  whether each copy is in the library.
 *   measured     null until withMeasurement() attaches a before and an after from the same protocol (score, standard
 *                error, games, seeds); then delta, its standard error, and whether the gain clears twice the noise.
 *   status       measured-gain · measured-no-gain · measured-loss · unmeasured · no-evidence
 *
 * ORDER. rank() puts measured gains first by their delta, then every unmeasured record by the weight of its evidence,
 * then measured no-gains and losses. An unmeasured record never sorts above a measured gain, and its sentence says
 * "unmeasured". measureTop() measures the n best unmeasured records against one baseline through whatever measuring
 * function the caller supplies (the Lab's runner in a worker, deck-measure.js in Node), on one protocol, so the deltas
 * are comparable; it never fakes a number for the ones it did not reach.
 *
 * PURE and UMD like deck-generator.js. tests/swap-record.mjs holds it on Krenko's hundred with the simulator's preview
 * protocol; the breaks are game/tools/batch/breaks-swap-record.py.
 */
(function (root, factory) {
  "use strict";
  const node = typeof module === "object" && module.exports && typeof require === "function";
  const take = (file, name) => { if (node) { try { return require(file); } catch (e) { return null; } } return root ? root[name] : null; };
  const api = factory({composition: take("./deck-composition.js", "CrankComposition"), strategies: take("./crankmagic-strategies.js", "CrankStrategies"), classify: take("./card-classify.js", "MtgCardClassify")});
  if (node) module.exports = api;
  if (root) root.CrankSwap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (deps) {
  "use strict";

  const STATUS = Object.freeze(["measured-gain", "measured-no-gain", "measured-loss", "unmeasured", "no-evidence"]);
  const WEIGHT = Object.freeze({inventory: 1, role: 1, strategy: 2, trace: 2, advisor: 1, ai: 1, history: 0.5});
  const NOISE = 2;   // a gain is a gain when it clears this many standard errors of the difference
  const GENERIC = new Set(["creatures", "artifacts", "lands", "instants", "enchantments", "sorceries", "planeswalkers"]);

  const round2 = (x) => Math.round(Number(x || 0) * 100) / 100;
  const money = (x) => (x === null || x === undefined ? "no price" : `$${round2(x).toFixed(2)}`);
  const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").trim().toLowerCase();
  const nameOf = (c) => (c && typeof c === "object" ? String(c.name || "") : String(c || ""));
  const priceOf = (c) => (c && typeof c === "object" && Number.isFinite(c.price) && c.price > 0 ? c.price : null);
  const rolesOf = (c) => {
    if (!c || typeof c !== "object") return [];
    if (deps.composition && deps.composition.rolesOf && deps.composition.normalize) { try { return deps.composition.rolesOf(deps.composition.normalize(c), deps.classify && deps.classify.classify).roles; } catch (e) { /* fall through */ } }
    return Array.isArray(c.roles) ? c.roles.filter((r) => !GENERIC.has(r)) : [];
  };
  const label = (id) => (deps.strategies && deps.strategies.labelOf ? deps.strategies.labelOf(id) : id).toLowerCase();

  /* ---------- the record ---------- */

  /**
   * One swap. `swap` is {out, in} as card rows (or names, with less to say); `context` may carry deck ({commanders,
   * cards}), owned (ids or names), relate (CrankGraph.relate), strategies (the deck's ids), source ({kind, says}),
   * bracket and playStyle for the composition targets, and evidence the caller already has.
   */
  function record(swap, context) {
    const ctx = context || {};
    const out = swap && swap.out, into = swap && swap.in;
    const outName = nameOf(out), inName = nameOf(into);
    const evidence = [];
    const add = (kind, says) => { if (kind && says) evidence.push({kind, says, weight: WEIGHT[kind] || 0.5}); };
    for (const e of ctx.evidence || []) add(e.kind, e.says);
    if (ctx.source && ctx.source.kind) add(ctx.source.kind, ctx.source.says || `proposed by the ${ctx.source.kind}`);

    /* Roles shared. */
    const outRoles = rolesOf(out), inRoles = rolesOf(into);
    const shared = outRoles.filter((r) => inRoles.includes(r));
    if (shared.length) add("role", `${inName} fills the same role${shared.length > 1 ? "s" : ""} as ${outName} (${shared.join(", ")})`);

    /* Strategies served. */
    const wanted = new Set(ctx.strategies || []);
    let serves = [];
    if (deps.strategies && typeof deps.strategies.derive === "function" && into && typeof into === "object") {
      try { serves = (deps.strategies.derive(into) || []).filter((id) => wanted.size ? wanted.has(id) : true); } catch (e) { serves = []; }
    }
    if (serves.length && wanted.size) add("strategy", `${inName} serves ${serves.map(label).slice(0, 3).join(", ")}`);

    /* The graph's joins. */
    const deck = ctx.deck || null;
    if (typeof ctx.relate === "function" && into && typeof into === "object" && deck) {
      const commanders = deck.commanders || [];
      const joins = [];
      for (const c of commanders) { try { const r = ctx.relate(c, into); if (r && r.score > 0) joins.push({to: c.name, score: r.score, reason: r.reason || r.kind || ""}); } catch (e) { /* unrelated */ } }
      let within = 0;
      for (const c of (deck.cards || []).slice(0, 120)) { if (!c || fold(c.name) === fold(outName)) continue; try { const r = ctx.relate(c, into); if (r && r.score > 0) within++; } catch (e) { /* unrelated */ } }
      if (joins.length) add("trace", `the graph joins ${inName} to ${joins.map((j) => j.to.split(",")[0]).join(" and ")}${joins[0].reason ? ` (${joins[0].reason})` : ""}`);
      if (within >= 3) add("trace", `${inName} joins ${within} cards already in the hundred`);
    }

    /* Owned. */
    const ownedSet = ctx.owned instanceof Set ? ctx.owned : new Set([...(Array.isArray(ctx.owned) ? ctx.owned : ctx.owned && typeof ctx.owned === "object" ? Object.keys(ctx.owned) : [])].map(String));
    const has = (c) => !!c && typeof c === "object" && (ownedSet.has(String(c.id)) || ownedSet.has(fold(c.name)) || ownedSet.has(c.name));
    const owned = {out: has(out), in: has(into)};
    if (owned.in) add("inventory", `you own ${inName}`);

    /* Composition before and after. */
    let composition = null;
    if (deps.composition && typeof deps.composition.compose === "function" && deck && Array.isArray(deck.cards) && deck.cards.length) {
      try {
        const opts = {bracket: ctx.bracket || 3, playStyle: ctx.playStyle || "Balanced", commanders: deck.commanders || [], strategies: deps.strategies, classify: deps.classify && deps.classify.classify, targets: ctx.targets || null};
        const before = deps.composition.compose(deck.cards, opts);
        const after = deps.composition.compose(deck.cards.map((c) => (fold(nameOf(c)) === fold(outName) ? into : c)), opts);
        const delta = {};
        for (const role of Object.keys(before.roles || {})) { const d = (after.roles[role] ? after.roles[role].count : 0) - before.roles[role].count; if (d) delta[role] = d; }
        const gapsBefore = Object.values(before.gaps || {}).filter((g) => g.verdict !== "in range").length;
        const gapsAfter = Object.values(after.gaps || {}).filter((g) => g.verdict !== "in range").length;
        const moved = Object.entries(delta).map(([r, d]) => `${r} ${d > 0 ? "+" : ""}${d}`);
        composition = {delta, gaps: {before: gapsBefore, after: gapsAfter}, says: moved.length ? `${moved.join(", ")}; ${gapsAfter < gapsBefore ? `${gapsBefore - gapsAfter} fewer target${gapsBefore - gapsAfter === 1 ? "" : "s"} missed` : gapsAfter > gapsBefore ? `${gapsAfter - gapsBefore} more target${gapsAfter - gapsBefore === 1 ? "" : "s"} missed` : "the targets as before"}` : "no role count moves"};
      } catch (e) { composition = null; }
    }

    const price = {out: priceOf(out), in: priceOf(into), delta: priceOf(out) !== null && priceOf(into) !== null ? round2(priceOf(into) - priceOf(out)) : null};
    const r = {out: {name: outName, price: price.out, owned: owned.out}, in: {name: inName, price: price.in, owned: owned.in}, evidence, composition, price, owned, measured: null, status: evidence.length ? "unmeasured" : "no-evidence", says: ""};
    r.says = sentence(r);
    return r;
  }

  function sentence(r) {
    const head = `${r.in.name} for ${r.out.name}`;
    if (r.status === "no-evidence") return `${head}: not recommended; nothing supports it.`;
    const why = r.evidence.map((e) => e.says).join("; ");
    const priceBit = r.price.delta === null ? "" : r.price.delta > 0 ? `; ${money(r.price.delta)} more` : r.price.delta < 0 ? `; ${money(-r.price.delta)} less` : "";
    const comp = r.composition && r.composition.says && r.composition.says !== "no role count moves" ? `; ${r.composition.says}` : "";
    if (!r.measured) return `${head}: ${why}${comp}${priceBit}. Unmeasured: no measured gain is claimed.`;
    const m = r.measured;
    const gain = m.delta > 0 ? `+${m.delta.toFixed(2)}` : m.delta.toFixed(2);
    const verdict = r.status === "measured-gain" ? `a measured gain of ${gain} points (± ${m.se.toFixed(2)}, ${m.protocol})` : r.status === "measured-loss" ? `measured ${gain} points (± ${m.se.toFixed(2)}, ${m.protocol}): a loss` : `measured ${gain} points (± ${m.se.toFixed(2)}, ${m.protocol}): within the noise, no gain shown`;
    return `${head}: ${verdict}; ${why}${comp}${priceBit}.`;
  }

  /** Attach a measurement: before and after from the same protocol, each {score, se, games, protocol?, seeds?}. */
  function withMeasurement(r, before, after, options) {
    const o = options || {};
    const okRun = (x) => x && Number.isFinite(x.score) && Number.isFinite(x.se) && x.se >= 0 && Number.isFinite(x.games) && x.games > 0;
    if (!okRun(before) || !okRun(after)) throw new Error("A measurement needs a before and an after, each with a score, a standard error and a game count.");
    /* One seed has no error: its standard error is zero by construction, and a delta against zero noise would call
       every tenth of a point a gain. Two seeds is the least that says anything; the Lab's refine uses three. */
    if (!(before.se > 0) || !(after.se > 0)) throw new Error("A measurement on one seed has no standard error; measure on at least two seeds before claiming a gain.");
    const protocol = o.protocol || after.protocol || before.protocol || "unknown";
    if (before.protocol && after.protocol && before.protocol !== after.protocol) throw new Error(`Before and after are on different protocols (${before.protocol}, ${after.protocol}); the delta would mean nothing.`);
    const delta = round2(after.score - before.score);
    const se = Math.round(Math.sqrt(before.se * before.se + after.se * after.se) * 1000) / 1000;
    const significant = Math.abs(delta) > NOISE * se && Math.abs(delta) >= (o.minGain === undefined ? 0 : o.minGain);
    const status = r.status === "no-evidence" ? "no-evidence" : !significant ? "measured-no-gain" : delta > 0 ? "measured-gain" : "measured-loss";
    const measured = {protocol, games: before.games + after.games, seeds: (before.seeds || null), before: {score: before.score, se: before.se}, after: {score: after.score, se: after.se}, delta, se, significant, noise: NOISE, at: o.at || null};
    const next = {...r, measured, status};
    next.says = sentence(next);
    return next;
  }

  /** The order a screen shows them in: measured gains, then unmeasured by evidence, then the rest. */
  function rank(records) {
    const tier = (r) => (r.status === "measured-gain" ? 0 : r.status === "unmeasured" ? 1 : r.status === "measured-no-gain" ? 2 : r.status === "measured-loss" ? 3 : 4);
    const weight = (r) => r.evidence.reduce((n, e) => n + (e.weight || 0), 0);
    return records.slice().sort((a, b) => tier(a) - tier(b) || (tier(a) === 0 ? b.measured.delta - a.measured.delta : 0) || weight(b) - weight(a) || (a.price.delta || 0) - (b.price.delta || 0) || `${a.in.name}`.localeCompare(`${b.in.name}`));
  }

  /**
   * Measure the n best unmeasured records against one baseline. `measure(cards)` returns (or resolves to)
   * {score, se, games, protocol}; `deck.cards` is the hundred the records swap into. Records not reached stay unmeasured.
   */
  async function measureTop(records, measure, options) {
    const o = options || {};
    const n = o.n === undefined || o.n === null ? 10 : Math.max(0, Math.round(Number(o.n) || 0));
    const deck = o.deck || {};
    if (!Array.isArray(deck.cards) || !deck.cards.length || typeof measure !== "function") return records.slice();
    const ordered = rank(records).filter((r) => r.status === "unmeasured").slice(0, n);
    if (!ordered.length) return records.slice();
    const before = await measure(deck.cards);
    const done = new Map();
    for (const r of ordered) {
      const after = await measure(deck.cards.map((c) => (fold(nameOf(c)) === fold(r.out.name) ? (r.inCard || o.cardOf && o.cardOf(r.in.name) || {name: r.in.name}) : c)));
      done.set(r, withMeasurement(r, before, after, {protocol: o.protocol || after.protocol || before.protocol, at: o.at}));
    }
    return records.map((r) => done.get(r) || r);
  }

  return {record, withMeasurement, rank, measureTop, sentence, STATUS, WEIGHT, NOISE};
});
