/* The loop finder: which cards on a canvas, or in a deck, close a cycle with the card in
 * focus, and what pays each cycle off.
 *
 * A loop is a directed cycle over the edges crankmagic-graph.js already scores, kept to the
 * three kinds a cycle actually runs on (docs/crankmagic-loop-patterns.md):
 *
 *   resets   an engine gives a tap ability another go -- untap, copy or blink → tap ability
 *            (Thornbite Staff → Krenko; Kiki-Jiki → Krenko; Felidar Guardian → Kiki-Jiki)
 *   feeds    a repeatable supply meets a demand -- tokens → "sacrifice a creature"
 *            (Krenko → Goblin Bombardment), counters → a counters payoff
 *   fires    one causes an event the other triggers on, for the events a cycle runs on
 *            (Goblin Bombardment → Thornbite Staff, a creature dying; Niv-Mizzet ↔ Curiosity)
 *
 * The search is a depth-first walk from the focus back to itself, at most four cards long,
 * over an adjacency built once per card set -- the sets are a deck (about a hundred) or a
 * canvas (at most 180), so the pair scoring is tens of thousands of set intersections and
 * the walk over the sparse loop edges is cheap. A cycle is CLOSED when something on it resets
 * a tap ability, or when every step is an event firing (the two-card draw–damage shape);
 * anything else is reported as a chain the reader can judge. PAYOFFS are the cards outside
 * the cycle that fire on an event a cycle member causes and turn it into damage, cards,
 * tokens or mana -- the exhaust every loop needs.
 *
 * Pure and UMD, so tests/crankmagic-loops.mjs can hold it to the D6 loop and the Niv-Mizzet
 * pair without a browser. It never reads the DOM; the caller passes a relate function
 * (CrankGraph.relate, or a mount's cached one).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankLoops = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LOOP_EVENTS = new Set(["creature-etb", "creature-dies", "sacrifice", "draw-card", "life-loss", "life-gain", "counter-placed", "graveyard-entry", "land-drop", "attack", "combat-begin"]);
  const PAYOFF_PRODUCE = new Set(["card", "token", "mana", "treasure"]);
  const VERB = {untap: "untaps", copy: "copies", blink: "blinks"};
  const EVENT = {"creature-etb": "a creature entering", "creature-dies": "a creature dying", sacrifice: "a sacrifice", "draw-card": "a draw", "life-loss": "life loss", "life-gain": "life gain", "counter-placed": "a counter placed", "graveyard-entry": "the graveyard", "land-drop": "a land drop", attack: "an attack", "combat-begin": "combat"};

  /* The loop edges a → b in one relation, strongest kind first. */
  function edgesOf(r) {
    const out = [];
    if (!r) return out;
    for (const t of r.drives || []) out.push({kind: "resets", term: t, says: VERB[t] || t});
    for (const t of r.loopFeeds || []) out.push({kind: "feeds", term: t, says: "feeds " + t});
    for (const t of r.fires || []) if (LOOP_EVENTS.has(t)) out.push({kind: "fires", term: t, says: EVENT[t] || t});
    return out;
  }

  /* Every loop edge among `cards`, as an adjacency map id → [{to, via}]. */
  function adjacency(cards, relate) {
    const adj = new Map(cards.map((c) => [c.id, []]));
    for (const a of cards) {
      for (const b of cards) {
        if (a === b || a.id === b.id) continue;
        const es = edgesOf(relate(a, b));
        if (es.length) adj.get(a.id).push({to: b.id, via: es[0], all: es});
      }
    }
    return adj;
  }

  /* Cycles through `anchorId`, each at most `maxLen` cards, as ordered steps starting at the
     anchor. A cycle is one object however many times the walk could find it: the anchor is
     fixed, so rotations cannot repeat it, and the direction is part of what it says. */
  function cycles(adj, anchorId, maxLen) {
    const found = [];
    const seen = new Set();
    if (!adj.has(anchorId)) return found;
    (function walk(path) {
      const last = path[path.length - 1];
      for (const e of adj.get(last.id) || []) {
        if (e.to === anchorId) {
          if (path.length >= 2) {
            const key = path.map((p) => p.id).join(">");
            if (!seen.has(key)) { seen.add(key); found.push(path.map((p, i) => ({id: p.id, via: i === 0 ? e.via : p.via}))); }
          }
          continue;
        }
        if (path.length >= maxLen || path.some((p) => p.id === e.to)) continue;
        walk(path.concat({id: e.to, via: e.via}));
      }
    })([{id: anchorId, via: null}]);
    /* The walk records on each step the edge that ARRIVED there (the anchor's slot holds the
       closing edge). Rotate once so `via` on step i is the edge that LEAVES step i for step
       i+1 -- the shape a sentence reads in: "Thornbite Staff → untaps → Krenko". */
    return found.map((steps) => steps.map((s, i) => ({id: s.id, via: steps[(i + 1) % steps.length].via})));
  }

  function find(cards, relate, anchorId, options) {
    const maxLen = (options && options.maxLen) || (globalThis.CrankRules && globalThis.CrankRules.LOOP_MAX_LEN) || 4;
    const byId = new Map(cards.map((c) => [c.id, c]));
    if (!byId.has(anchorId)) return [];
    const adj = adjacency(cards, relate);
    const out = [];
    for (const steps of cycles(adj, anchorId, maxLen)) {
      const members = new Set(steps.map((s) => s.id));
      const closed = steps.some((s) => s.via && s.via.kind === "resets") || steps.every((s) => s.via && s.via.kind === "fires");
      /* The events this cycle causes, and who outside it listens for them. */
      const events = new Set();
      for (const s of steps) for (const ev of byId.get(s.id).causes || []) if (LOOP_EVENTS.has(ev)) events.add(ev);
      const payoffs = [];
      for (const c of cards) {
        if (members.has(c.id)) continue;
        const hit = (c.triggers || []).filter((ev) => events.has(ev));
        if (!hit.length) continue;
        const converts = (c.causes || []).includes("life-loss") || (c.produces || []).some((p) => PAYOFF_PRODUCE.has(p));
        if (!converts) continue;
        payoffs.push({id: c.id, name: c.name, on: hit[0], says: EVENT[hit[0]] || hit[0], rank: Number.isFinite(c.rank) ? c.rank : Infinity});
      }
      payoffs.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
      out.push({
        steps: steps.map((s) => ({id: s.id, name: byId.get(s.id).name, via: s.via})),
        closed,
        payoffs: payoffs.slice(0, 6),
        length: steps.length
      });
    }
    /* Shortest and closed first: the two-card engine before the four-card chain. */
    out.sort((a, b) => Number(b.closed) - Number(a.closed) || a.length - b.length || a.steps.map((s) => s.name).join().localeCompare(b.steps.map((s) => s.name).join()));
    return out;
  }

  /* The sentence a loop reads as: "Krenko → feeds creatures → Goblin Bombardment → a creature
     dying → Thornbite Staff → untaps → Krenko". */
  function sentence(loop) {
    const parts = [];
    loop.steps.forEach((s) => { parts.push(s.name + " → " + (s.via ? s.via.says : "") + " → "); });
    return parts.join("") + loop.steps[0].name;
  }

  return {LOOP_EVENTS, edgesOf, adjacency, find, sentence};
});
