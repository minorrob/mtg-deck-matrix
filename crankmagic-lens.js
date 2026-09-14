/* THE ROLE LENS: a deck and a role, side by side with what could fill it.
 *
 * Phase D of docs/crankmagic-discover-loop-plan.md. Pick a deck, pick a role -- Removal,
 * Board wipe, Protection, Loop, Tutor, Ramp, Draw -- and read two lists: the deck's own cards
 * that carry the role, counted against the house minimum, and the candidates that could join
 * them: the bench, the buy list, the deck's linked upgrades and the commander's co-play
 * neighbours, none of them already in the hundred, all inside the deck's colour identity,
 * ranked by how often the commander's real decks run them, then owned before ordered before
 * not owned, price shown.
 *
 * PURE. No DOM, no state of its own: the caller hands it the library state, the deck, the
 * role and three lookups (the card record, the commander's co-play row, ownership), and gets
 * back plain rows. crankmagic-discover.js draws them; tests/crankmagic-lens.mjs holds the
 * answers on the committed live state. The one write the lens offers -- Swap for... -- is a
 * command it BUILDS and the app commits: an uncommitted option on the replaced slot, the same
 * `option` command the deck page's Replacements & options uses, so nothing here changes a
 * finalized list directly.
 *
 * The minimums are the rules module's (crankmagic-rules.js ROLE_MINIMUMS), not literals here,
 * so the lens, the Lab's targets and any warning elsewhere read one number. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankLens = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const rules = () => (typeof globalThis !== "undefined" && globalThis.CrankRules) || null;
  const minimums = () => (rules() && rules().ROLE_MINIMUMS) || {removal: 8, wipe: 2, ramp: 10, draw: 10};

  /* The seven lenses, in the order the plan lists them. `roles` are the classifier's role ids
     a card must carry (any of them); `min` is the house minimum, or null where the house has
     none and the count is shown plain. */
  const LENSES = [
    {id: "Removal",    roles: ["removal"],                       minKey: "removal"},
    {id: "Board wipe", roles: ["wipe"],                          minKey: "wipe"},
    {id: "Protection", roles: ["protection"],                    minKey: null},
    {id: "Loop",       roles: ["untap", "copy", "blink", "sac-outlet"], minKey: null},
    {id: "Tutor",      roles: ["tutor"],                         minKey: null},
    {id: "Ramp",       roles: ["ramp"],                          minKey: "ramp"},
    {id: "Draw",       roles: ["draw"],                          minKey: "draw"}
  ];
  const lensOf = (id) => LENSES.find((l) => l.id === id || l.id.toLowerCase() === String(id || "").toLowerCase()) || null;
  const minimumOf = (l) => (l && l.minKey && Number.isFinite(minimums()[l.minKey]) ? minimums()[l.minKey] : null);

  const rolesOf = (card) => (card && Array.isArray(card.roles) ? card.roles : []);
  const carried = (card, l) => rolesOf(card).filter((r) => l.roles.includes(r));
  const inside = (card, identity) => {
    if (!identity) return true;
    const ci = (card && card.colorIdentity) || [];
    return ci.every((c) => identity.has(c));
  };
  const price = (card) => (card && Number.isFinite(card.price) ? card.price : null);
  const OWN_ORDER = {owned: 0, ordered: 1, none: 2};

  /* What the library holds of a card, for the ranking: an owned copy that no deck has
     reserved beats an ordered one beats nothing. */
  function holdings(state) {
    const by = new Map();
    for (const l of (state && state.lots) || []) {
      const cur = by.get(l.cardId) || {owned: 0, free: 0, ordered: 0, watching: 0};
      if (l.source === "owned") { cur.owned += l.quantity; if (!l.allocation && l.offer !== "held") cur.free += l.quantity; }
      else if (l.source === "ordered") cur.ordered += l.quantity;
      else cur.watching += l.quantity;
      by.set(l.cardId, cur);
    }
    return by;
  }

  /* The lens over one deck. `deps.cardOf(id)` is the app's C.card; `deps.coPlay(oracleId)`
     returns the commander's co-play row as a Map oracleId -> {inclusion, synergy, decks} (or
     null when the pairs are not loaded); `deps.byOracle(oracleId)` resolves a neighbour to a
     catalog card (or null). */
  function lens(state, deck, lensId, deps) {
    const l = lensOf(lensId);
    if (!l || !deck) return null;
    const cardOf = (id) => (deps && deps.cardOf ? deps.cardOf(id) : (state && state.cards && state.cards[id]) || null);
    const main = (deck.slots || []).filter((r) => r.purpose === "main");
    const inDeck = new Set(main.map((r) => r.cardId));
    const commander = deck.commanders && deck.commanders.length ? cardOf(deck.commanders[0]) : null;
    const identity = commander ? new Set(commander.colorIdentity || []) : null;

    const have = [];
    for (const r of main) {
      const c = cardOf(r.cardId);
      const roles = carried(c, l);
      if (!roles.length) continue;
      have.push({slotId: r.id, cardId: r.cardId, name: c.name, quantity: r.quantity, roles, price: price(c), pinned: !!r.pinned, option: !!r.option});
    }
    have.sort((a, b) => a.name.localeCompare(b.name));
    const count = have.reduce((n, h) => n + h.quantity, 0);
    const min = minimumOf(l);

    /* Candidates, one row per card whatever the sources. */
    const held = holdings(state);
    const co = deps && deps.coPlay && commander && commander.oracleId ? deps.coPlay(commander.oracleId) : null;
    const pool = new Map();
    const offer = (c, source) => {
      if (!c || !c.id || inDeck.has(c.id)) return;
      const roles = carried(c, l);
      if (!roles.length || !inside(c, identity)) return;
      const cur = pool.get(c.id) || {cardId: c.id, oracleId: c.oracleId || "", name: c.name, roles, price: price(c), sources: [], owned: "none", coPlay: null};
      if (!cur.sources.includes(source)) cur.sources.push(source);
      pool.set(c.id, cur);
    };
    for (const [cardId, h] of held) {
      if (h.free > 0) offer(cardOf(cardId), "bench");
      else if (h.ordered > 0) offer(cardOf(cardId), "ordered");
      else if (h.watching > 0) offer(cardOf(cardId), "buy");
    }
    for (const r of (deck.slots || []).filter((r) => r.purpose !== "main")) offer(cardOf(r.cardId), "upgrade");
    if (co && deps.byOracle) for (const oid of co.keys()) offer(deps.byOracle(oid), "played");

    const rows = [...pool.values()];
    for (const row of rows) {
      const h = held.get(row.cardId);
      row.owned = h && h.free > 0 ? "owned" : h && h.ordered > 0 ? "ordered" : "none";
      const e = co && row.oracleId ? co.get(row.oracleId) : null;
      row.coPlay = e ? {inclusion: e.inclusion, synergy: e.synergy, decks: e.decks} : null;
    }
    rows.sort((a, b) => ((b.coPlay ? b.coPlay.inclusion : -1) - (a.coPlay ? a.coPlay.inclusion : -1))
      || (OWN_ORDER[a.owned] - OWN_ORDER[b.owned])
      || ((a.price === null ? Infinity : a.price) - (b.price === null ? Infinity : b.price))
      || a.name.localeCompare(b.name));

    return {lens: l.id, roles: l.roles, deck: {id: deck.id, name: deck.name, status: deck.status}, commander: commander ? {id: commander.id, name: commander.name} : null,
      have, count, min, under: min !== null && count < min, candidates: rows};
  }

  /* The one write: a linked, uncommitted upgrade option on the replaced slot. The app commits
     it; the model keeps the hundred as it was. */
  function swapCommand(deck, slotId, card, lensId) {
    const slot = (deck.slots || []).find((r) => r.id === slotId && r.purpose === "main");
    if (!slot) throw Error("Choose a main-deck slot to swap out.");
    return {type: "option", deckId: deck.id, replaces: slot.id, cards: [card],
      option: {cardId: card.id, quantity: slot.quantity, purpose: "upgrade", optionWhy: `Role lens · ${lensId}`}, reserve: false};
  }

  return {LENSES, lensOf, minimumOf, lens, swapCommand, holdings};
});
