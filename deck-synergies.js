/* THE SYNERGIES MODEL: which cards in a hundred work together, which chains the deck can run, and the one card
 * that would complete a chain it almost has.
 *
 * Rob, October 18 (Linear ROB-115, project "Deck tuning"): "easily able to identify synergistic/complimentary cards
 * and/or chains of cards." The graph already scores every pair (crankmagic-graph.js relateTerms: shared, feeds,
 * fires, multiplies, tribal, statted, extended, drives), the loop finder already closes cycles through one anchor
 * (crankmagic-loops.js), and the trace lights the deck from the commander outward (crankmagic-trace.js). What none
 * of them does is answer, for one deck, in one call: the pairs worth knowing about, every chain the hundred can run,
 * and the completions. This module does, as a pure function the Tune tab (ROB-113) renders and never recomputes.
 *
 * WHAT IT READS. Graph rows (data/graph.json unpacked, or anything carrying the classifier's fields: roles, causes,
 * triggers, produces, tribes, wants, mechanics), the graph's own `relate(a, b)` (CrankGraph.relate), the loop
 * finder (CrankLoops), and the strategy vocabulary (CrankStrategies) for which strategy a join serves. Nothing here
 * knows a card by name; every relation comes from the graph's scoring, so a pair reads here exactly as it reads on
 * the Discover canvas.
 *
 * PAIRS are the joins above a strength floor, strongest first, each with the graph's own sentence and the
 * strategies it serves; a pair that serves one of the deck's declared strategies is kept even below the floor,
 * because that is the deck saying what it is for. CHAINS are the loop finder's closed cycles through every card that
 * can anchor one (a tap ability, a loop engine, a repeatable supply), deduplicated by membership, each with its
 * sentence and its payoffs; a triple is a chain of three. COMPLETIONS are cards outside the deck, inside its colors,
 * that would close a chain with cards already in it: for each candidate, only its edges to and from the deck are
 * scored, then a short walk through the deck's own loop edges looks for a way back, so a pool of several hundred
 * candidates costs tens of thousands of relate calls, not millions. Each completion names the chain it would close,
 * its price and whether it is owned, so the reader can decide.
 *
 * WHAT THE NUMBERS ARE NOT. A join is a fact about the cards' text, not a measurement of how often they meet in a
 * game; a chain the finder closes is a shape the rules text allows, not a proof the engine resolves it (the rules
 * engine and the simulator are the measures). The strength is the graph's heuristic, labeled so wherever it is shown.
 *
 * PURE and UMD like crankmagic-loops.js. tests/deck-synergies.mjs holds it on Krenko's hundred: the known
 * Prospector-and-Staff engine, the Staff proposed when it is taken out, an honest empty set for a pile of lands.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankSynergies = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = {minStrength: 0.34, maxPairs: 60, maxChains: 40, maxCompletions: 12, maxLen: 4, poolSize: 400, completionLen: 3};
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const colorsOf = (row) => { const ci = row && row.ci; return Array.isArray(ci) ? ci : String(ci || "").split("").filter((c) => "WUBRG".includes(c)); };
  const isLand = (row) => Boolean(row && (row.isLand || /\bLand\b/.test(String(row.type || row.typeLine || ""))));
  const nameOf = (row) => String((row && row.name) || "");
  const priceOf = (row) => { const p = Number(row && row.price); return Number.isFinite(p) ? p : null; };
  const defaultOwned = (row) => num(row && row.own) > 0 || num(row && row.bench) > 0;

  /* The deck's strategies, declared or derived: what the pairs are read against. */
  function declaredStrategies(options, commanders, strategies) {
    if (Array.isArray(options.strategyIds) && options.strategyIds.length) return options.strategyIds;
    if (!strategies || typeof strategies.forDeck !== "function") return [];
    const fromCommanders = [];
    for (const c of commanders || []) for (const id of (typeof strategies.derive === "function" ? strategies.derive(c) : [])) if (!fromCommanders.includes(id)) fromCommanders.push(id);
    for (const id of options.commanderStrategies || []) if (!fromCommanders.includes(id)) fromCommanders.push(id);
    return strategies.forDeck({commanderStrategies: fromCommanders, mechanics: options.mechanics || [], ticked: options.ticked || null});
  }

  /* PAIRS. Every ordered pair once (a → b and b → a are the same pair; the stronger direction's sentence is kept). */
  function pairsOf(rows, relate, declared, cfg) {
    const out = [];
    const declaredSet = new Set(declared);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const ab = relate(a, b), ba = relate(b, a);
        const r = !ab ? ba : !ba ? ab : (ba.score > ab.score ? ba : ab);
        if (!r) continue;
        const from = r === ab ? a : b, to = r === ab ? b : a;
        const serves = Array.isArray(r.serves) ? r.serves : [];
        const declaredHit = serves.filter((id) => declaredSet.has(id));
        if (r.strength < cfg.minStrength && !declaredHit.length) continue;
        out.push({a: nameOf(from), b: nameOf(to), aId: from.id, bId: to.id, kind: r.kind, says: r.reason, tag: r.tag, strength: Math.round(r.strength * 100) / 100, score: r.score, serves, declared: declaredHit});
      }
    }
    out.sort((x, y) => y.strength - x.strength || y.declared.length - x.declared.length || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
    return out;
  }

  /* CHAINS. The loop finder, anchored on every card that can anchor a cycle; the same cycle reached from two
     anchors is one chain. */
  function chainsOf(rows, relate, loops, cfg) {
    if (!loops || typeof loops.find !== "function") return {available: false, list: []};
    /* A cycle closes on an engine (untap, copy, blink), an outlet, a tap ability, or a card that both causes and
       listens for an event (the draw-and-damage pair); anchoring on every token maker as well found the same cycles
       again at twice the cost, so those are reached through their engines. */
    const anchors = rows.filter((r) => (Array.isArray(r.mechanics) && r.mechanics.includes("tap-ability")) || (Array.isArray(r.roles) && r.roles.some((x) => ["untap", "copy", "blink", "sac-outlet"].includes(x))) || (Array.isArray(r.causes) && r.causes.length && Array.isArray(r.triggers) && r.triggers.length));
    const seen = new Map();
    for (const anchor of anchors) {
      for (const loop of loops.find(rows, relate, anchor.id, {maxLen: cfg.maxLen})) {
        const key = loop.steps.map((s) => s.id).sort().join("|");
        if (seen.has(key)) continue;
        seen.set(key, {
          cards: loop.steps.map((s) => s.name),
          ids: loop.steps.map((s) => s.id),
          length: loop.length,
          closed: Boolean(loop.closed),
          says: typeof loops.sentence === "function" ? loops.sentence(loop) : loop.steps.map((s) => s.name).join(" → "),
          payoffs: (loop.payoffs || []).map((p) => ({name: p.name, on: p.says}))
        });
      }
    }
    const list = [...seen.values()].sort((a, b) => Number(b.closed) - Number(a.closed) || a.length - b.length || a.cards.join().localeCompare(b.cards.join()));
    return {available: true, list: list.slice(0, cfg.maxChains), total: list.length};
  }

  /* COMPLETIONS. The deck's own loop edges once; then, per candidate, its edges to and from the deck, and a walk of
     at most `completionLen` steps from a card it reaches back to a card that reaches it. */
  function completionsOf(rows, pool, relate, loops, cfg, owned) {
    if (!loops || typeof loops.edgesOf !== "function") return {available: false, list: [], scanned: 0};
    const ids = new Set(rows.map((r) => r.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const adj = new Map(rows.map((r) => [r.id, []]));
    for (const a of rows) for (const b of rows) {
      if (a.id === b.id) continue;
      const es = loops.edgesOf(relate(a, b));
      if (es.length) adj.get(a.id).push({to: b.id, via: es[0]});
    }
    const reach = (from, targets, maxSteps) => {
      /* The shortest path from `from` to any id in `targets` over the deck's loop edges, as the ids walked. */
      const queue = [[from]];
      const visited = new Set([from]);
      while (queue.length) {
        const path = queue.shift();
        const here = path[path.length - 1];
        if (targets.has(here) && path.length > 1) return path;
        if (path.length > maxSteps) continue;
        for (const e of adj.get(here) || []) if (!visited.has(e.to)) { visited.add(e.to); queue.push([...path, e.to]); }
      }
      return targets.has(from) ? [from] : null;
    };
    const found = [];
    let scanned = 0;
    for (const c of pool) {
      if (!c || ids.has(c.id) || isLand(c)) continue;
      scanned++;
      const outs = [], ins = new Set();
      for (const d of rows) {
        const eo = loops.edgesOf(relate(c, d)); if (eo.length) outs.push({to: d.id, via: eo[0]});
        const ei = loops.edgesOf(relate(d, c)); if (ei.length) ins.add(d.id);
      }
      if (!outs.length || !ins.size) continue;
      let best = null;
      for (const o of outs) {
        const path = reach(o.to, ins, cfg.completionLen);
        if (path && (!best || path.length < best.path.length)) best = {o, path};
      }
      if (!best) continue;
      const chain = [nameOf(c), ...best.path.map((id) => nameOf(byId.get(id))), nameOf(c)];
      found.push({name: nameOf(c), id: c.id, price: priceOf(c), owned: Boolean(owned(c)), rank: Number.isFinite(c.rank) ? c.rank : null,
        closes: chain, length: chain.length - 1, via: best.o.via.says, says: `${nameOf(c)} would close a chain: ${chain.join(" → ")}.`});
    }
    found.sort((a, b) => Number(b.owned) - Number(a.owned) || a.length - b.length || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
    return {available: true, list: found.slice(0, cfg.maxCompletions), total: found.length, scanned};
  }

  /* THE POOL: candidates outside the deck, inside its colors, no lands, owned first then most played, capped. */
  function poolFrom(allRows, rows, colors, owned, cfg) {
    const ids = new Set(rows.map((r) => r.id));
    const allowed = new Set(colors || []);
    const fits = (row) => colorsOf(row).every((c) => allowed.has(c));
    const list = (allRows || []).filter((r) => r && !ids.has(r.id) && !isLand(r) && fits(r));
    list.sort((a, b) => Number(owned(b)) - Number(owned(a)) || (Number.isFinite(a.rank) ? a.rank : Infinity) - (Number.isFinite(b.rank) ? b.rank : Infinity) || nameOf(a).localeCompare(nameOf(b)));
    return list.slice(0, cfg.poolSize);
  }

  /* THE ONE FUNCTION. `rows`: the deck's graph rows (the hundred, commanders included); `options`: relate
     (CrankGraph.relate), loops (CrankLoops), strategies (CrankStrategies), commanders (rows), strategyIds or
     commanderStrategies and mechanics, pool (candidate rows) or allRows with colors to draw the pool from, owned(row),
     and the limits in DEFAULTS. */
  function synergies(rows, options = {}) {
    const cfg = {...DEFAULTS, ...(options.limits || {})};
    const relate = options.relate || (typeof globalThis !== "undefined" && globalThis.CrankGraph && globalThis.CrankGraph.relate) || null;
    const loops = options.loops || (typeof globalThis !== "undefined" && globalThis.CrankLoops) || null;
    const strategies = options.strategies || (typeof globalThis !== "undefined" && globalThis.CrankStrategies) || null;
    const owned = typeof options.owned === "function" ? options.owned : defaultOwned;
    const deck = (rows || []).filter((r) => r && r.id);
    if (!relate) return {available: false, note: "the graph's relate() was not available", pairs: [], chains: {available: false, list: []}, completions: {available: false, list: []}, byStrategy: [], unjoined: []};
    const spells = deck.filter((r) => !isLand(r));
    const commanders = (options.commanders || []).filter(Boolean);
    const declared = declaredStrategies(options, commanders, strategies);
    const started = Date.now();

    const pairs = pairsOf(spells, relate, declared, cfg);
    const chains = chainsOf(spells, relate, loops, cfg);
    const colors = options.colors && options.colors.length ? options.colors : [...new Set(commanders.flatMap(colorsOf))];
    const pool = Array.isArray(options.pool) ? options.pool : poolFrom(options.allRows, deck, colors, owned, cfg);
    const completions = completionsOf(spells, pool, relate, loops, cfg, owned);

    /* By strategy: how many pairs serve each declared strategy, and the strongest three. */
    const byStrategy = declared.map((id) => {
      const mine = pairs.filter((p) => p.serves.includes(id));
      return {id, label: strategies && typeof strategies.labelOf === "function" ? strategies.labelOf(id) : id, pairs: mine.length, top: mine.slice(0, 3).map((p) => `${p.a} ${p.tag} ${p.b}`)};
    });
    /* Unjoined: spells with no pair above the floor and on no chain; the first place to look for a swap. */
    const joined = new Set();
    for (const p of pairs) { joined.add(p.aId); joined.add(p.bId); }
    for (const c of chains.list) for (const id of c.ids) joined.add(id);
    const unjoined = spells.filter((r) => !joined.has(r.id)).map(nameOf).sort();

    return {
      cards: deck.length, spells: spells.length, strategies: declared,
      pairs: pairs.slice(0, cfg.maxPairs), pairsTotal: pairs.length,
      chains, completions, byStrategy, unjoined,
      ms: Date.now() - started,
      note: "Joins are facts about card text and the graph's heuristic strength; a chain is a shape the text allows, not a proof the engine resolves it. The simulator and the rules engine measure play."
    };
  }

  return {DEFAULTS, synergies, pairsOf, chainsOf, completionsOf, poolFrom, declaredStrategies};
});
