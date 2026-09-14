/* THE TRACE: the deck's strategy, lit from the commander outward.
 *
 * T1 of docs/crankmagic-strategy-trace-plan.md (§2). A deterministic breadth walk from the
 * commander over a card set -- the hundred, or a candidate pool -- crossing only the joins
 * that serve one of the deck's strategies (crankmagic-strategies.js), with loop-backs counted.
 *
 *   Ring 1: cards with a serving join from the commander.
 *   Ring 2: cards with a serving join from a ring-1 card.
 *   Ring 3: cards with a serving join from ring 1 or 2.
 *   A card is placed in the first ring that reaches it; within a ring the order is join
 *   strength, then name, so the animation is the same every time. A later serving join onto
 *   a card already lit is a LOOP-BACK: not re-placed, its counter rises, the join is kept as a
 *   return edge (drawn gold). Closed cycles through a lit card (CrankLoops) count too.
 *
 *   Score = Σ over lit cards of ringWeight × (1 + loopBacks) × strategiesServed, weights
 *   3 · 2 · 1. A heuristic, labelled one wherever it is shown; the simulator is the measure.
 *
 * THE LIST IS THE PRODUCT, the animation the explanation: the walk returns a grouped, tagged
 * list first (ring → strategy, each row with the join that lit it, the strategies it serves,
 * its loop-backs, its Primary Purpose) plus the return edges, the unlit cards in buckets, the
 * cards a pool trace fenced out, and the score. The canvas plays the list in order.
 *
 * PURE and UMD like crankmagic-loops.js. `relate(a, b)` is the graph's own scoring
 * (CrankGraph.relate or a mounted graph's relation); nothing here knows a card by name. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankTrace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RING_WEIGHT = [0, 3, 2, 1];
  const MAX_RING = 3;
  const strategiesModule = () => (typeof globalThis !== "undefined" && globalThis.CrankStrategies) || null;
  const loopsModule = () => (typeof globalThis !== "undefined" && globalThis.CrankLoops) || null;

  const isLand = (c) => c.isLand === true || /\bLand\b/.test(String(c.type || c.typeLine || ""));
  const has = (list, t) => Array.isArray(list) && list.includes(t);
  /* The bucket an unlit card is reported in: what it is for, since the trace did not touch it. */
  function bucketOf(c) {
    if (isLand(c)) return "land";
    if (has(c.produces, "mana") || has(c.roles, "ramp")) return "mana";
    if (has(c.roles, "removal") || has(c.roles, "wipe") || has(c.roles, "counterspell")) return "removal";
    if (has(c.roles, "draw") || has(c.roles, "tutor")) return "draw";
    if (/Creature/.test(String(c.type || c.typeLine || ""))) return "body";
    return "other";
  }
  const BUCKET_LABEL = {land: "lands", mana: "mana rocks and ramp", removal: "removal and interaction", draw: "draw and tutors", body: "bodies with no join to a traced strategy", other: "other cards with no join to a traced strategy"};

  /* The strength of a join in 0–1: the pair score, saturating around a drive plus a fire. */
  const strengthOf = (r) => (r && Number.isFinite(r.score) ? Math.min(1, r.score / 18) : 0);

  /* One trace.
     commander  the commander's card (a graph row or a catalog card with terms)
     cards      the set walked: the hundred, or a candidate pool; the commander may be in it
     relate     (a, b) => relation | null
     strategies the deck's strategy ids; the walk crosses only joins that serve one of them
     options    {S, loops, purposeOf, statusOf, fence, maxRing, weights}
       fence(card) => {ok, why}: the deck definition as a fence for a pool trace; a card that
       fails is not lit and is listed under outsideDefinition. */
  function trace(commander, cards, relate, strategies, options = {}) {
    const S = options.S || strategiesModule();
    if (!commander || !S) return null;
    const wanted = new Set(strategies && strategies.length ? strategies : S.derive(commander));
    const maxRing = Math.max(1, Math.min(MAX_RING, options.maxRing || MAX_RING));
    const weights = options.weights || RING_WEIGHT;
    const purposeOf = options.purposeOf || (() => null);
    const fence = options.fence || null;

    /* The world: every card but the commander, by name for determinism; fenced cards aside. */
    const outside = [];
    const world = [];
    const seen = new Set([commander.id]);
    for (const c of [...cards].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      if (!c || !c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      if (fence) { const f = fence(c); if (f && f.ok === false) { outside.push({id: c.id, name: c.name, why: f.why || "outside the deck definition"}); continue; } }
      world.push(c);
    }

    /* A serving join, or null. `serves` is the intersection with the deck's strategies. */
    const cache = new Map();
    const join = (a, b) => {
      const key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
      if (cache.has(key)) return cache.get(key);
      const r = relate(a, b);
      let out = null;
      if (r) {
        const serves = S.servedBy(r).filter((id) => wanted.has(id));
        if (serves.length) out = {r, serves, strength: strengthOf(r)};
      }
      cache.set(key, out);
      return out;
    };
    const viaOf = (r) => ({kind: r.kind || "", term: r.tag || "", says: r.reason || r.kind || ""});
    /* A return edge counts as a LOOP-BACK only when the join is one a loop runs on -- an
       engine onto a tap ability, a repeatable supply into a demand, an event one card causes
       and another fires on (CrankLoops.edgesOf). A tribal or stat join onto a lit card is
       true but is not a loop: thirty Goblins all naming each other would otherwise count as
       four hundred loop-backs and the number would mean nothing. Those stay as cross-links the
       canvas may draw faintly; they are not returned here. */
    const loopsMod = options.loops || loopsModule();
    const isLoopJoin = (r) => (loopsMod && typeof loopsMod.edgesOf === "function")
      ? loopsMod.edgesOf(r).length > 0
      : Boolean((r.drives && r.drives.length) || (r.drivenBy && r.drivenBy.length) || (r.loopFeeds && r.loopFeeds.length) || (r.loopFed && r.loopFed.length) || (r.fires && r.fires.length) || (r.firedBy && r.firedBy.length));

    const placed = new Map();
    const root = {id: commander.id, name: commander.name, card: commander, ring: 0, from: null, via: null, strategies: [...wanted], loopBacks: 0, strength: 1, order: 0};
    placed.set(root.id, root);
    const list = [root];
    const returns = [];
    const returned = new Set();
    let frontier = [root];
    for (let ring = 1; ring <= maxRing && frontier.length; ring += 1) {
      const reached = [];
      for (const parent of frontier) {
        for (const c of world) {
          if (c.id === parent.id) continue;
          const j = join(parent.card, c);
          if (!j) continue;
          const already = placed.get(c.id);
          if (already) {
            /* A serving loop join onto a lit card that is not this node's own parent: a loop-back. */
            if (already.id === parent.from || !isLoopJoin(j.r)) continue;
            const key = parent.id + ">" + c.id, back = c.id + ">" + parent.id;
            if (returned.has(key) || returned.has(back)) continue;
            returned.add(key);
            already.loopBacks += 1;
            returns.push({from: parent.id, to: c.id, via: viaOf(j.r), strategies: j.serves});
            continue;
          }
          reached.push({card: c, parent, j});
        }
      }
      /* Strongest join first, then name; a card reached by two parents keeps the first. A beam
         (options.beam[ring]) caps how many new cards a ring may place: the Lab's pool trace
         over the whole catalog would otherwise light thousands and take ring 2 to a crawl. */
      reached.sort((x, y) => (y.j.r.score - x.j.r.score) || String(x.card.name).localeCompare(String(y.card.name)));
      const beam = options.beam && Number.isFinite(options.beam[ring]) ? options.beam[ring] : Infinity;
      let placedHere = 0;
      const next = [];
      for (const {card, parent, j} of reached) {
        const already = placed.get(card.id);
        if (already) {
          const key = parent.id + ">" + card.id, back = card.id + ">" + parent.id;
          if (already.from !== parent.id && isLoopJoin(j.r) && !returned.has(key) && !returned.has(back)) { returned.add(key); already.loopBacks += 1; returns.push({from: parent.id, to: card.id, via: viaOf(j.r), strategies: j.serves}); }
          continue;
        }
        if (placedHere >= beam) continue;
        const node = {id: card.id, name: card.name, card, ring, from: parent.id, via: viaOf(j.r), strategies: j.serves, loopBacks: 0, strength: j.strength, order: list.length};
        placed.set(card.id, node);
        list.push(node); next.push(node); placedHere += 1;
      }
      frontier = next;
    }

    /* Closed cycles through a lit card count as loop-backs too, so a cycle the walk reached by
       another route still shows on the card. CrankLoops.countThrough when the module is there. */
    const loops = loopsMod;
    let cycles = new Map();
    if (loops && typeof loops.countThrough === "function" && list.length > 1) {
      try { cycles = loops.countThrough(list.map((n) => n.card), relate); } catch { cycles = new Map(); }
      for (const n of list) { const k = cycles.get(n.id) || 0; if (k) n.loopBacks += k; }
    }

    /* The score, the groups, the unlit report. */
    let score = 0;
    for (const n of list) if (n.ring > 0) score += (weights[n.ring] || 0) * (1 + n.loopBacks) * n.strategies.length;
    const rows = list.map((n) => {
      const p = purposeOf(n.card);
      const st = options.statusOf ? options.statusOf(n.card) : null;
      return {id: n.id, name: n.name, ring: n.ring, group: n.strategies[0] || "", groupLabel: S.labelOf(n.strategies[0] || ""), purpose: p && p.label ? p.label : "",
        via: n.via, from: n.from, strategies: n.strategies, loopBacks: n.loopBacks, strength: Math.round(n.strength * 100) / 100,
        status: st && st.status ? st.status : "", price: st && Number.isFinite(st.price) ? st.price : null, order: n.order};
    });
    const groups = [];
    for (const n of rows) {
      if (!n.ring) continue;
      let g = groups.find((x) => x.ring === n.ring && x.strategy === n.group);
      if (!g) { g = {ring: n.ring, strategy: n.group, label: n.groupLabel, ids: []}; groups.push(g); }
      g.ids.push(n.id);
    }
    groups.sort((a, b) => a.ring - b.ring || S.ids().indexOf(a.strategy) - S.ids().indexOf(b.strategy));
    const unlit = world.filter((c) => !placed.has(c.id)).map((c) => ({id: c.id, name: c.name, bucket: bucketOf(c)}));
    const buckets = {};
    for (const u of unlit) buckets[u.bucket] = (buckets[u.bucket] || 0) + 1;
    const closed = returns.length;
    return {commander: {id: commander.id, name: commander.name}, strategies: S.ids().filter((id) => wanted.has(id)),
      list: rows, groups, returns, unlit, buckets, bucketLabels: BUCKET_LABEL, outsideDefinition: outside,
      score, lit: rows.length - 1, total: world.length, loopBacks: rows.reduce((n, r) => n + r.loopBacks, 0), closedLoops: closed,
      weights: weights.slice(1, 4)};
  }

  /* The unlit report as a sentence: "79 cards the trace never touched: 33 lands, 8 mana rocks…" */
  function unlitSentence(t) {
    if (!t || !t.unlit.length) return "The trace touched every card.";
    const parts = Object.entries(t.buckets).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${BUCKET_LABEL[k] || k}`);
    return `${t.unlit.length} card${t.unlit.length === 1 ? "" : "s"} the trace never touched: ${parts.join(", ")}.`;
  }

  /* THE SEED FOR THE LAB: a Map card id -> bonus from a trace result, ring 1 worth the most,
     each loop-back adding, so the draft builder's score prefers what the commander reaches. */
  function seedFrom(result, {ring = [0, 300, 200, 100], perLoopBack = 20, keyOf = (r) => r.id} = {}) {
    const seed = new Map();
    if (!result) return seed;
    for (const r of result.list) { if (!r.ring) continue; seed.set(keyOf(r), (ring[r.ring] || 0) + perLoopBack * r.loopBacks); }
    return seed;
  }

  return {trace, seedFrom, unlitSentence, bucketOf, strengthOf, RING_WEIGHT, MAX_RING, BUCKET_LABEL};
});
