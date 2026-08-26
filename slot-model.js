/**
 * Slot model - the one projection the Deck page and the Shop page both read.
 *
 * A deck is ~100 slots. Each slot is a ladder of candidates chained by `replaces`,
 * which lineup-model.js already resolves into slot groups. This module turns those
 * groups into the row shape the UI renders, collapses the twelve storage array keys
 * down to the five rungs a person actually sees, and owns the two vocabularies that
 * were previously duplicated across the four pages: price bands and ownership state.
 *
 * Pure. No DOM, no storage, no fetch.
 */
(function (root, factory) {
  "use strict";
  const lineup = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./lineup-model.js")
    : root && root.MtgLineupModel;
  const api = factory(lineup);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgSlotModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup) {
  "use strict";

  if (!Lineup) throw new Error("Slot model requires the lineup model");

  /* ---------------- rungs ----------------
   * Twelve storage keys, five rungs on screen. The -2 ladders fold into their parent
   * rung exactly as the Calibrate page already labels them, so nothing new is invented
   * here; this is the single place that mapping now lives.
   */
  const RUNG_ORDER = ["base", "tuned", "enhance", "fun", "max"];
  const RUNG_BY_KIND = {
    shell: "base",
    tuned: "tuned", required: "tuned", tuned2: "tuned",
    upgrade: "enhance", enhance: "enhance",
    max: "max", enhance2: "max", max2: "max",
    funTuned: "fun", funMax: "fun",
    altTuned: "alt", altMax: "alt",
    transfer: "transfer"
  };
  const RUNG_LABEL = {base: "Base", tuned: "Tuned", enhance: "Enhance", fun: "Fun", max: "Max", alt: "Alt", transfer: "Borrowed"};
  function rungOf(kind) { return RUNG_BY_KIND[kind] || "base"; }

  /* ---------------- price bands ----------------
   * These are physical drawers at a vendor table, not a computed histogram, so the
   * list is fixed and every band exists whether or not anything falls in it today.
   */
  const PRICE_BANDS = ["<$1", "$1", "$2", "$3", "$4", "$5", "$6", "$7-15", "$15+"];
  function priceBand(price) {
    // An unpriced card has no drawer. A genuinely free one belongs in the cheap drawer,
    // so null/undefined/"" must not coerce their way to 0.
    if (price === null || price === undefined || price === "") return null;
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) return null;
    if (p < 1) return "<$1";
    if (p < 7) return "$" + Math.floor(p);
    if (p < 15) return "$7-15";
    return "$15+";
  }

  /* ---------------- ownership ----------------
   * Money spent is not a card in hand. One key replaces `found` + `boughtQuantities`
   * and adds the state that was missing: ordered and in transit.
   */
  const ACQ = {NONE: "Not in hand", ORDERED: "Ordered", PARTIAL: "Partly here", HAND: "In hand"};

  function ownedKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /** Migrate the legacy pair into the new shape. Lossless: found+qty becomes inHand. */
  function normalizeOwned(state) {
    const out = {};
    const found = (state && state.found) || {};
    const qty = (state && state.boughtQuantities) || {};
    const existing = (state && state.owned) || {};
    Object.keys(existing).forEach((k) => {
      const v = existing[k] || {};
      out[k] = {inHand: Math.max(0, Number(v.inHand) || 0), ordered: Math.max(0, Number(v.ordered) || 0)};
    });
    Object.keys(found).forEach((k) => {
      if (!found[k] || out[k]) return;
      out[k] = {inHand: Math.max(1, Number(qty[k]) || 1), ordered: 0};
    });
    Object.keys(qty).forEach((k) => {
      if (out[k]) return;
      const n = Number(qty[k]) || 0;
      if (n > 0) out[k] = {inHand: n, ordered: 0};
    });
    return out;
  }

  function ownedCount(owned, name) {
    const rec = (owned || {})[ownedKey(name)] || {};
    return {inHand: Math.max(0, Number(rec.inHand) || 0), ordered: Math.max(0, Number(rec.ordered) || 0)};
  }

  function acquisitionOf(owned, name, quantity) {
    const need = Math.max(1, Number(quantity) || 1);
    const {inHand, ordered} = ownedCount(owned, name);
    if (inHand >= need) return ACQ.HAND;
    if (inHand > 0) return ACQ.PARTIAL;
    if (ordered > 0) return inHand + ordered >= need ? ACQ.ORDERED : ACQ.PARTIAL;
    return ACQ.NONE;
  }

  /* ---------------- card facts ---------------- */
  const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
  const TYPE_ORDER = ["Commander", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Land", "Other"];

  function cardType(item) {
    const line = String((item && item.typeLine) || "");
    if (/\bLand\b/i.test(line)) return "Land";
    if (/\bCreature\b/i.test(line)) return "Creature";
    if (/\bPlaneswalker\b/i.test(line)) return "Planeswalker";
    if (/\bBattle\b/i.test(line)) return "Battle";
    if (/\bArtifact\b/i.test(line)) return "Artifact";
    if (/\bEnchantment\b/i.test(line)) return "Enchantment";
    if (/\bInstant\b/i.test(line)) return "Instant";
    if (/\bSorcery\b/i.test(line)) return "Sorcery";
    return "Other";
  }
  function isBasicLand(item) {
    return BASICS.has(Lineup.normalizeName((item && item.name) || ""));
  }

  /**
   * Why this rung, not the others. Base states what the slot is for; the other four
   * each answer their own question against it. Fields already exist per item in
   * buy-plans.json - this only decides which one a rung speaks with.
   */
  /**
   * Where a rung's rationale came from. Base cards carry no authored `purpose` in
   * buy-plans.json, so the UI must not claim to be stating the slot's thesis when
   * all it has is the card's own rules text. Authoring real Base copy is a content
   * task; until then the label has to tell the truth about what it is showing.
   */
  function whySource(rung, item, cards) {
    if (whyFor(rung, item)) return "authored";
    const fact = cards ? cards[Lineup.normalizeName(item && item.name)] : null;
    const oracle = (fact && fact.oracleText) || (item && item.oracleText);
    return oracle ? "oracle" : "none";
  }
  function whyText(rung, item, cards) {
    const authored = whyFor(rung, item);
    if (authored) return authored;
    const fact = cards ? cards[Lineup.normalizeName(item && item.name)] : null;
    return (fact && fact.oracleText) || (item && item.oracleText) || "";
  }

  function whyFor(rung, item) {
    if (!item) return "";
    const pick = (...keys) => {
      for (const k of keys) { const v = item[k]; if (typeof v === "string" && v.trim()) return v.trim(); }
      return "";
    };
    if (rung === "base") return pick("purpose", "whyPrimary", "why");
    if (rung === "enhance") return pick("whyOptional", "purpose", "why");
    if (rung === "max") return pick("maxReason", "whyOptional", "purpose");
    return pick("purpose", "whyPrimary", "why", "alternateReason");
  }

  /** null/undefined/"" must not coerce to 0 - Number(null) is 0, and a card priced
   *  at $0.00 is a very different claim from a card whose price we do not know. */
  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function priceOf(item, cards) {
    const own = num(item && item.price);
    if (own !== null) return own;
    // Starting-shell items frequently carry no price of their own, so fall back to
    // the baked catalog before giving up. Without this a deck's "to buy" total
    // silently reads its own base cards as free.
    const fact = cards ? cards[Lineup.normalizeName(item && item.name)] : null;
    return fact ? num(fact.price) : null;
  }
  function ceilingOf(item) { return num(item && item.ceiling); }

  /* ---------------- the projection ----------------
   * One row per slot, carrying every rung so the UI can drill sideways without
   * another lookup, and the selected rung marked. Slots with no selection are
   * returned as holes rather than dropped, because a hole is a real state.
   */
  function deckSlots(plan, selection, options) {
    const opts = options || {};
    const owned = opts.owned || {};
    const model = Lineup.buildModel(plan, opts.extraCandidates || []);
    const selected = new Set();
    Lineup.ARRAY_KEYS.forEach((key) => {
      ((selection && selection[key]) || []).forEach((id) => selected.add(String(id)));
    });

    const rows = [];
    model.groups.forEach((entries, slotId) => {
      const shell = entries.find((e) => e.kind === "shell") || entries[0];
      const rungs = entries
        .filter((e) => !(e.item && e.item.isFlexibleSlot))
        .map((e) => ({
          rung: rungOf(e.kind),
          kind: e.kind,
          entryId: e.id,
          name: e.item.name,
          quantity: Math.max(1, Number(e.item.quantity) || 1),
          price: priceOf(e.item, opts.cards),
          ceiling: ceilingOf(e.item),
          replaces: e.item.replaces || null,
          isCommander: !!e.item.isCommander,
          gameChanger: !!e.item.gameChanger,
          why: whyText(rungOf(e.kind), e.item, opts.cards),
          whySource: whySource(rungOf(e.kind), e.item, opts.cards),
          selected: selected.has(e.id)
        }))
        .sort((a, b) => {
          const ai = RUNG_ORDER.indexOf(a.rung), bi = RUNG_ORDER.indexOf(b.rung);
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        });

      if (!rungs.length) return;
      const pick = rungs.find((r) => r.selected) || null;
      const face = pick || rungs[0];
      const name = pick ? pick.name : null;
      rows.push({
        slotId,
        shellName: shell && shell.item ? shell.item.name : face.name,
        type: shell && shell.item && shell.item.isCommander ? "Commander" : cardType((face && model.byId.get(face.entryId).item) || {}),
        isBasic: isBasicLand(face && model.byId.get(face.entryId).item),
        quantity: pick ? pick.quantity : face.quantity,
        filled: !!pick,
        pick: pick ? {
          rung: pick.rung, entryId: pick.entryId, name: pick.name,
          price: pick.price, ceiling: pick.ceiling, band: priceBand(pick.price),
          why: pick.why, whySource: pick.whySource, quantity: pick.quantity
        } : null,
        acquisition: name ? acquisitionOf(owned, name, pick.quantity) : ACQ.NONE,
        rungs
      });
    });

    rows.sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type), bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return String(a.pick ? a.pick.name : a.shellName).localeCompare(String(b.pick ? b.pick.name : b.shellName));
    });
    return rows;
  }

  /**
   * The same rows re-keyed for shopping: one line per card name, merged across every
   * deck, quantities summed. Basics collapse here the opposite way they do on the
   * Deck page - Forest x25 across six decks instead of Forest x11 in one.
   */
  function shopRows(decks, owned) {
    const map = new Map();
    (decks || []).forEach((deck) => {
      (deck.slots || []).forEach((slot) => {
        if (!slot.pick) return;
        const key = ownedKey(slot.pick.name);
        let row = map.get(key);
        if (!row) {
          row = {
            key, name: slot.pick.name, price: slot.pick.price, ceiling: slot.pick.ceiling,
            band: priceBand(slot.pick.price), type: slot.type, isBasic: slot.isBasic,
            quantity: 0, decks: [], rungs: []
          };
          map.set(key, row);
        }
        row.quantity += slot.pick.quantity;
        if (row.decks.indexOf(deck.id) < 0) row.decks.push(deck.id);
        if (row.rungs.indexOf(slot.pick.rung) < 0) row.rungs.push(slot.pick.rung);
      });
    });
    return Array.from(map.values()).map((row) => {
      const {inHand, ordered} = ownedCount(owned, row.name);
      row.inHand = Math.min(inHand, row.quantity);
      row.ordered = Math.min(ordered, Math.max(0, row.quantity - row.inHand));
      row.need = Math.max(0, row.quantity - row.inHand - row.ordered);
      row.acquisition = acquisitionOf(owned, row.name, row.quantity);
      return row;
    });
  }

  return {
    RUNG_ORDER, RUNG_LABEL, RUNG_BY_KIND, rungOf,
    PRICE_BANDS, priceBand,
    ACQUISITION: ACQ, ownedKey, normalizeOwned, ownedCount, acquisitionOf,
    TYPE_ORDER, cardType, isBasicLand, whyFor, whyText, whySource,
    deckSlots, shopRows
  };
});
