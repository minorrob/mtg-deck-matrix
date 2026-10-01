/* THE DECK ADVISOR'S BRIEF (AI-4, docs/plan-to-done-2026-09-30.md): the page a low-cost model reasons over.
 *
 * "The agent is code; the model judges." Everything a sound change needs -- what the deck is, what it has too little
 * of, which cards could come in, what may not leave -- is worked out here, deterministically, from the person's own
 * library; the model is asked only to choose among the candidates and say why, in a fixed shape, and an answer naming
 * anything that was not in the brief is not shown (checkAnswer). This file builds the brief and checks the answer; the
 * Worker route that sends it (POST /api/ai/advise) is AI-4's second half, behind the door (docs/ai-door.md).
 *
 * TWO READINGS OF "THE HUNDRED":
 *   list  the deck's list (its target), each card with where its copy is -- the product's reading;
 *   box   what is physically in the deck's box: the list's cards that are there, and the substitutes holding the
 *         other seats -- the eval's reading, since Rob's workbook already holds his intent as Target against Actual
 *         (the Dn-Buy upgrades): run on the box, a sound advisor names the upgrades he would make himself.
 *
 * WHAT IS NEVER IN IT: a price paid, a person's address, another person's library, a lot's or a record's id, anything
 * about a hidden card at a table. Prices are the catalog's market prices; ranks are EDHREC's.
 *
 * PURE and UMD, like collection-model.js: Node's tests and the Worker require it; nothing here touches the page. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankAdvise = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* The roles the brief counts, the role lens's seven (crankmagic-lens.js), with the house minimums where there are
     some (crankmagic-rules.js ROLE_MINIMUMS). */
  const ROLES = [
    {id: "Removal", roles: ["removal"], min: 8}, {id: "Board wipe", roles: ["wipe"], min: 2}, {id: "Ramp", roles: ["ramp"], min: 10},
    {id: "Draw", roles: ["draw"], min: 10}, {id: "Protection", roles: ["protection"], min: null},
    {id: "Loop", roles: ["untap", "copy", "blink", "sac-outlet"], min: null}, {id: "Tutor", roles: ["tutor"], min: null}];
  /* Game changers a bracket allows (crankmagic-lobby.js BRACKETS): none at 1 and 2, three at 3, any above. */
  const GC_CAP = {1: 0, 2: 0, 3: 3, 4: Infinity, 5: Infinity};
  const LIMIT = 30;

  const isLand = (c) => /\bLand\b/.test((c && c.typeLine) || "");
  const price = (c) => (c && Number.isFinite(c.price) ? Math.round(c.price * 100) / 100 : null);
  const rank = (c) => (c && Number.isFinite(c.rank) ? c.rank : null);
  const rolesOf = (c) => ROLES.filter((r) => ((c && c.roles) || []).some((x) => r.roles.includes(x))).map((r) => r.id);

  /* THE HUNDRED, as rows: {name, quantity, roles, state, price, rank}, and the cards counted for the roles. */
  function hundredOf(state, deck, cardOf, basis) {
    const main = (deck.slots || []).filter((r) => r.purpose === "main");
    const lots = state.lots || [];
    const inBox = (l) => l.source === "owned" && l.location && l.location.kind === "deck" && l.location.deckId === deck.id;
    const rows = [], counted = [];
    const push = (card, quantity, st, extra = {}) => {
      rows.push({name: card.name, quantity, roles: rolesOf(card), state: st, price: price(card), rank: rank(card), ...extra});
      counted.push({card, quantity});
    };
    for (const r of main) {
      const card = cardOf(r.cardId);
      if (!card) continue;
      const mine = lots.filter((l) => l.allocation && l.allocation.deckId === deck.id && l.allocation.slotId === r.id);
      const boxed = mine.filter(inBox).reduce((n, l) => n + l.quantity, 0), elsewhere = mine.filter((l) => l.source === "owned" && !inBox(l)).reduce((n, l) => n + l.quantity, 0);
      const ordered = mine.filter((l) => l.source === "ordered").reduce((n, l) => n + l.quantity, 0);
      const standIns = lots.filter((l) => inBox(l) && l.standInFor === r.id && !(l.allocation && l.allocation.deckId === deck.id));
      if (basis === "box") {
        if (boxed) push(card, boxed, "In the box");
        for (const l of standIns) {const sub = cardOf(l.cardId); if (sub) push(sub, l.quantity, `Substitute, holding ${card.name}'s seat`, {holds: card.name});}
        const empty = r.quantity - boxed - standIns.reduce((n, l) => n + l.quantity, 0);
        if (empty > 0) rows.push({name: card.name, quantity: empty, roles: rolesOf(card), state: "Empty seat: to buy", price: price(card), rank: rank(card), empty: true});
      } else {
        const held = standIns.reduce((n, l) => n + l.quantity, 0);
        const st = boxed >= r.quantity ? "In the box" : held ? `Not in the box yet; ${standIns.map((l) => (cardOf(l.cardId) || {}).name).filter(Boolean).join(", ")} holds the seat`
          : elsewhere ? "Owned, not in the box" : ordered ? "Ordered" : "To buy";
        push(card, r.quantity, st, r.pinned ? {kept: true} : {});
      }
    }
    return {rows, counted};
  }

  /* The role counts over the cards that are counted, weakest first: under the minimum by the most, then the rest. */
  function rolesCount(counted) {
    return ROLES.map((r) => {
      const count = counted.reduce((n, {card, quantity}) => n + (rolesOf(card).includes(r.id) ? quantity : 0), 0);
      return {role: r.id, count, min: r.min, short: r.min === null ? 0 : Math.max(0, r.min - count)};
    }).sort((a, b) => b.short - a.short || (a.min === null) - (b.min === null) || a.role.localeCompare(b.role));
  }

  /* The box reading's seats not filled by their own card: those a substitute holds, and the empty ones. */
  function seatsOf(state, deck, rows, cardOf) {
    const want = new Set(rows.filter((r) => r.holds || r.empty).map((r) => r.holds || r.name));
    return (deck.slots || []).filter((r) => r.purpose === "main" && want.has((cardOf(r.cardId) || {}).name));
  }
  function curveOf(counted) {
    const curve = {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7+": 0};
    let lands = 0;
    for (const {card, quantity} of counted) {
      if (isLand(card)) {lands += quantity; continue;}
      const mv = Number.isFinite(card.manaValue) ? card.manaValue : 0;
      curve[mv >= 7 ? "7+" : String(Math.max(0, Math.floor(mv)))] += quantity;
    }
    return {curve, lands};
  }

  /* THE CANDIDATES, found by code: the bench, To buy (the list's missing cards and the To buy group), Watching, and
     only when asked the commander's co-play neighbors the person does not own; inside the identity, not already
     counted, priced within the per-card cap unless owned, scored by the short roles they fill, then co-play, owned
     before not, rank and price. */
  function candidatesOf(state, deck, cardOf, {counted, roles, identity, perCardCap, allowUnowned, coPlay, byOracle, commander, limit, seats}) {
    const have = new Set(counted.map(({card}) => card.id));
    const short = new Set(roles.filter((r) => r.short > 0).map((r) => r.role));
    const pool = new Map();
    const offer = (card, source, seat = false) => {
      if (!card || !card.id || have.has(card.id) || (isLand(card) && !seat)) return;
      if (identity && !(card.colorIdentity || []).every((c) => identity.has(c))) return;
      const cur = pool.get(card.id) || {card, sources: new Set()};
      cur.sources.add(source);
      pool.set(card.id, cur);
    };
    for (const l of state.lots || []) {
      if (l.source === "owned" && !l.allocation && !(l.location && l.location.kind === "deck")) offer(cardOf(l.cardId), "Bench");
      else if (l.source === "ordered" && !l.allocation) offer(cardOf(l.cardId), "Ordered");
      else if (l.source === "watching") offer(cardOf(l.cardId), "Watching");
    }
    for (const d of state.decks || []) for (const r of d.slots || []) {
      if (d.id === deck.id && r.purpose !== "main") offer(cardOf(r.cardId), "To buy");
      if (d.id !== deck.id) continue;
      const got = (state.lots || []).filter((l) => l.allocation && l.allocation.deckId === d.id && l.allocation.slotId === r.id && l.source === "owned").reduce((n, l) => n + l.quantity, 0);
      if (r.purpose === "main" && got < r.quantity) offer(cardOf(r.cardId), "To buy");
    }
    for (const g of state.groups || []) if (g.id === "group:to-buy") for (const r of g.entries || []) offer(cardOf(r.cardId), "To buy");
    /* The box reading's seats: each seat's own card, wherever its copy is -- reserved on the bench, ordered, or to buy
       -- lands too, since a land can be the card a seat is for. */
    for (const r of seats || []) {
      const mine = (state.lots || []).filter((l) => l.allocation && l.allocation.deckId === deck.id && l.allocation.slotId === r.id);
      offer(cardOf(r.cardId), mine.some((l) => l.source === "owned") ? "Bench" : mine.some((l) => l.source === "ordered") ? "Ordered" : "To buy", true);
    }
    const co = coPlay && commander && commander.oracleId ? coPlay(commander.oracleId) : null;
    if (allowUnowned && co && byOracle) for (const oid of co.keys()) offer(byOracle(oid), "Not owned");
    const rows = [];
    for (const {card, sources} of pool.values()) {
      const owned = sources.has("Bench") || sources.has("Ordered");
      const p = price(card);
      if (!owned && Number.isFinite(perCardCap) && p !== null && p > perCardCap) continue;
      const fills = rolesOf(card), shortFills = fills.filter((r) => short.has(r));
      const edge = co && card.oracleId ? co.get(card.oracleId) : null;
      rows.push({name: card.name, roles: fills, fills: shortFills, source: [...sources].sort().join(", "), price: p, rank: rank(card),
        coPlay: edge ? Math.round(edge.inclusion * 1000) / 1000 : null, gameChanger: !!card.gameChanger, owned});
    }
    rows.sort((a, b) => b.fills.length - a.fills.length || (b.coPlay ?? -1) - (a.coPlay ?? -1) || (b.owned - a.owned)
      || (a.rank ?? Infinity) - (b.rank ?? Infinity) || (a.price ?? Infinity) - (b.price ?? Infinity) || a.name.localeCompare(b.name));
    /* In the box reading the deck's own seats' cards are always offered, past the limit if need be, in their ranked
       place and unmarked: which candidate a seat is for is the model's to judge. */
    const seatNames = new Set((seats || []).map((r) => (cardOf(r.cardId) || {}).name));
    return rows.filter((r, i) => i < limit || seatNames.has(r.name));
  }

  /**
   * The brief for one deck. `cardOf(id)` joins a library card to its record (the app's C.card); `coPlay(oracleId)` and
   * `byOracle(oracleId)` are optional (the commander's co-play row, and a neighbor's record), as the role lens takes them.
   */
  function buildBrief({state, deckId, cardOf, coPlay = null, byOracle = null, ask = "", allowUnowned = false, basis = "list", limit = LIMIT}) {
    const deck = (state.decks || []).find((d) => d.id === deckId);
    if (!deck) throw new Error("There is no such deck in this library.");
    const commanders = (deck.commanders || []).map(cardOf).filter(Boolean);
    const identity = commanders.length ? new Set(commanders.flatMap((c) => c.colorIdentity || [])) : null;
    const def = deck.definition || {};
    const {rows, counted} = hundredOf(state, deck, cardOf, basis === "box" ? "box" : "list");
    const roles = rolesCount(counted);
    const ceiling = Number.isInteger(def.bracketCeiling) ? def.bracketCeiling : Number.isInteger(def.baseBracket) ? def.baseBracket : null;
    const gcHave = counted.reduce((n, {card, quantity}) => n + (card.gameChanger ? quantity : 0), 0);
    const perCardCap = Number.isFinite(def.perCardCap) ? def.perCardCap : null;
    return {
      schema: "CrankAdviseBrief@1", basis: basis === "box" ? "box" : "list",
      deck: {name: deck.name, commanders: commanders.map((c) => c.name), identity: identity ? ["W", "U", "B", "R", "G"].filter((c) => identity.has(c)) : [],
        bracket: {base: Number.isInteger(def.baseBracket) ? def.baseBracket : null, ceiling}, playStyle: def.playStyle || "",
        mechanics: Array.isArray(def.mechanics) ? def.mechanics.slice(0, 12) : [], strategies: Array.isArray(def.strategies) ? def.strategies.slice(0, 12) : []},
      measure: {roles, ...curveOf(counted), cards: counted.reduce((n, x) => n + x.quantity, 0)},
      hundred: rows,
      candidates: candidatesOf(state, deck, cardOf, {counted, roles, identity, perCardCap, allowUnowned, coPlay, byOracle, commander: commanders[0], limit,
        seats: basis === "box" ? seatsOf(state, deck, rows, cardOf) : null}),
      constraints: {budget: Number.isFinite(def.budget) ? def.budget : null, perCardCap, gameChangers: {have: gcHave, cap: ceiling === null ? null : GC_CAP[ceiling] ?? null},
        keep: [...commanders.map((c) => c.name), ...rows.filter((r) => r.kept).map((r) => r.name)], ask: String(ask || "").trim().slice(0, 300), unowned: !!allowUnowned},
    };
  }

  /* THE ANSWER'S SHAPE (structured output): swaps out of the hundred for candidates, what to keep, a summary. */
  const ANSWER_SCHEMA = {type: "object", additionalProperties: false, required: ["changes", "keep", "summary"], properties: {
    changes: {type: "array", maxItems: 10, items: {type: "object", additionalProperties: false, required: ["out", "in", "role", "why"],
      properties: {out: {type: "string"}, in: {type: "string"}, role: {type: "string"}, why: {type: "string"}}}},
    keep: {type: "array", maxItems: 10, items: {type: "string"}}, summary: {type: "string"}}};

  /* GROUNDING IS A GATE: a change is shown only when its card out is in the hundred and not kept, and its card in is a
     candidate; the rest are returned as ungrounded, for the call log. */
  function checkAnswer(brief, answer) {
    const out = new Set(brief.hundred.filter((r) => !r.empty).map((r) => r.name)), keep = new Set(brief.constraints.keep), inn = new Set(brief.candidates.map((c) => c.name));
    const changes = [], ungrounded = [];
    for (const c of (answer && Array.isArray(answer.changes)) ? answer.changes : []) {
      if (c && out.has(c.out) && !keep.has(c.out) && inn.has(c.in) && c.out !== c.in) changes.push({out: c.out, in: c.in, role: String(c.role || ""), why: String(c.why || "").slice(0, 400)});
      else ungrounded.push(c);
    }
    return {ok: ungrounded.length === 0, changes, ungrounded, keep: ((answer && answer.keep) || []).filter((n) => out.has(n)), summary: String((answer && answer.summary) || "").slice(0, 800)};
  }

  /* THE RUBRIC (the eval): the swaps a deck's owner would make, and those he would refuse. From the library itself, the
     box reading's substitutes and the seats they hold are his own intent (the workbook's Target against Actual). */
  function rubricOf(state, cardOf) {
    const out = {};
    for (const d of state.decks || []) {
      const sound = [];
      for (const l of state.lots || []) {
        if (!l.standInFor || l.source !== "owned" || !(l.location && l.location.kind === "deck" && l.location.deckId === d.id)) continue;
        const r = (d.slots || []).find((x) => x.id === l.standInFor);
        const sub = cardOf(l.cardId), want = r && cardOf(r.cardId);
        if (sub && want) sound.push({out: sub.name, in: want.name});
      }
      if (sound.length) out[d.id] = {deck: d.name, sound: sound.sort((a, b) => a.out.localeCompare(b.out)), refuse: []};
    }
    return out;
  }
  /* A score for one deck's answer against its rubric: a sound swap scores, a refused one costs, the rest are neither. */
  function score(rubric, checked) {
    const sound = new Set((rubric.sound || []).map((s) => s.out + "→" + s.in)), soundIn = new Set((rubric.sound || []).map((s) => s.in));
    const refuse = new Set((rubric.refuse || []).map((s) => s.out + "→" + s.in));
    let hits = 0, near = 0, refused = 0;
    for (const c of checked.changes) {const k = c.out + "→" + c.in; if (sound.has(k)) hits++; else if (refuse.has(k)) refused++; else if (soundIn.has(c.in)) near++;}
    return {hits, near, refused, ungrounded: checked.ungrounded.length, proposed: checked.changes.length, possible: sound.size};
  }

  return {ROLES, GC_CAP, LIMIT, buildBrief, checkAnswer, rubricOf, score, ANSWER_SCHEMA};
});
