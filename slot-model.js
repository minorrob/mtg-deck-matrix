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

  /* ---------------- the four measured builds ----------------
   * Five rungs appear on a slot, but only four of them are whole-deck builds that
   * the simulation ever measured, and data/rung-lists.json pins exactly those four.
   * Enhance is deliberately absent: it is a set of optional per-slot substitutions
   * layered on Tuned, not a hundred anyone ran games with.
   *
   * The chains are NOT cumulative in the obvious way. Max layers on Tuned, but Fun
   * branches straight off Base -- it is the same deck asked a different question,
   * not Tuned with jokes added. These are the same chains tests/lineup-compliance.mjs
   * composes against the pinned lists, which is what makes "apply this rung" and
   * "the hundred we measured" the same thing.
   */
  const BUILD_RUNGS = ["base", "tuned", "fun", "max"];
  const RUNG_CHAIN = {
    base: [],
    tuned: ["required", "tuned2"],
    fun: ["funTuned"],
    max: ["required", "tuned2", "upgrade", "enhance", "enhance2", "max", "max2"]
  };

  /* Compare ranks variants on three stages; the Deck page offers four rungs. Maxed
     lands on max and Base on base. Compare has no Fun stage, so everything else is
     Tuned -- which is also what an unseeded deck would already have defaulted to. */
  function rungForStage(stage) {
    const n = Number(stage) || 2;
    return n === 1 ? "base" : n === 3 ? "max" : "tuned";
  }

  /**
   * The selection that IS this rung, for every slot at once, regardless of whether
   * a single card has been bought. ownedOptional and capabilityOption items are
   * offers layered on top of a finished rung, never part of the rung itself, so
   * they are excluded here exactly as lib.mjs and the compliance test exclude them.
   */
  function selectionForRung(plan, rung) {
    let selection = Lineup.canonicalizeSelection(plan, Object.assign(Lineup.emptySelection(), {
      shell: (plan.startingShell || []).map((item) => String(item.id))
    }));
    (RUNG_CHAIN[rung] || []).forEach((bucket) => {
      (plan[bucket] || [])
        .filter((item) => !item.ownedOptional && !item.capabilityOption)
        .forEach((item) => { selection = Lineup.applyChoice(plan, selection, item.id); });
    });
    return selection;
  }

  /* Composing a rung walks applyChoice once per item and each call rebuilds the
     lineup model, so the four signatures cost ~40ms together -- once per render, on
     every pick, which is felt. Plans are stable objects for the life of the page,
     so the answer is cached against the plan itself. */
  const signatureCache = new WeakMap();
  function rungSignatures(plan) {
    let cached = signatureCache.get(plan);
    if (!cached) {
      cached = {};
      BUILD_RUNGS.forEach((rung) => { cached[rung] = selectionSignature(selectionForRung(plan, rung)); });
      signatureCache.set(plan, cached);
    }
    return cached;
  }

  /* Which other whole-deck builds are literally the same hundred as this one. Today
     Max collapses onto Tuned for most variants, because their Tier 3 cards are filed
     as offers rather than as the rung. The UI says so out loud rather than letting
     the button look broken. */
  function rungTwins(plan, rung) {
    const signatures = rungSignatures(plan);
    return BUILD_RUNGS.filter((other) => other !== rung && signatures[other] === signatures[rung]);
  }

  function selectionSignature(selection) {
    const ids = [];
    Lineup.ARRAY_KEYS.forEach((key) => {
      ((selection && selection[key]) || []).forEach((id) => ids.push(String(id)));
    });
    return ids.sort().join("|");
  }

  /**
   * Which rung the deck is currently standing on, or null once it has been hand
   * edited away from all four. Derived rather than remembered: a stored "you chose
   * Tuned" would keep claiming Tuned after a single slot was changed underneath it.
   *
   * `preferred` is the last rung the reader actually clicked. Two rungs can be the
   * same hundred -- Max and Tuned are, on most variants -- and in that case the
   * honest answer is the one they asked for, not whichever sorts first.
   */
  function activeRung(plan, selection, preferred) {
    const signature = selectionSignature(selection);
    const signatures = rungSignatures(plan);
    const matches = BUILD_RUNGS.filter((rung) => signatures[rung] === signature);
    if (!matches.length) return null;
    return matches.includes(preferred) ? preferred : matches[0];
  }

  /**
   * The ladder is a chain, not a five-way comparison. Base states the slot's job;
   * Tuned improves on Base's fit to the deck's strategy; Enhance improves on what
   * Tuned already fixed. Fun and Max are their own axes and answer to the slot,
   * not to the rung below them. So each heading names its actual predecessor.
   */
  function rungHeading(rung, name, predecessorName, authored) {
    const card = name || "this card";
    const prev = predecessorName;
    if (rung === "base") return authored ? "What this slot does" : "What the Base card does · its own rules text";
    if (!authored) return `What ${card} does · no rung note written yet`;
    if (rung === "tuned") return prev ? `How ${card} fits the strategy better than ${prev}` : `How ${card} fits the strategy`;
    if (rung === "enhance") return prev ? `How ${card} improves on ${prev}'s fit` : `How ${card} improves the slot`;
    if (rung === "fun") return `What makes ${card} fun`;
    if (rung === "max") return `How ${card} maximizes Tier 3`;
    if (rung === "alt") return `Why ${card} as the alternate commander`;
    return `Why ${card}`;
  }

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

  /* Where a card physically is. Owning a card and having it sleeved in this deck's
     box are different facts: there are six boxes, and one copy sits in exactly one
     of them. PLACE.ACTIVE means "in this deck's box"; PLACE.OWNED means "in hand,
     but in another box or loose on the bench". */
  const PLACE = {ACTIVE: "active", OWNED: "owned", ORDERED: "ordered", BUY: "buy", EMPTY: "empty"};

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
  /**
   * Where a card physically sits at a vendor's table. This is not a store name and
   * not a stored field - a seller shelves by price, so it falls straight out of the
   * price. Coarser than the price band on purpose: the band tells you which dollar
   * drawer, this tells you which container to walk to.
   */
  const SPOTS = ["Bulk bin", "Boxes", "Binder", "Case"];
  function vendorSpot(price) {
    const band = priceBand(price);
    if (band === null) return null;
    if (band === "<$1") return "Bulk bin";
    if (band === "$7-15") return "Binder";
    if (band === "$15+") return "Case";
    return "Boxes";               // the $1 through $6 drawers
  }

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
    // A plan price of exactly 0 is missing data wearing a zero, not a free card:
    // the set includes City of Traitors and Cabal Ritual. Let the catalog answer.
    if (own !== null && own !== 0) return own;
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
      const nameById = new Map(entries.map((e) => [e.id, e.item && e.item.name]));
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
          predecessorName: nameById.get(e.predecessorId) || (shell && shell.item ? shell.item.name : null),
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
        // A slot's identity is its shell card, not whatever rung is picked right
        // now. Deriving the type from the pick re-filed the row into a different
        // group on almost every pick -- thirteen of fourteen slots measured, moving
        // up to 2,900px -- so choosing a card made the open pane appear to slam
        // shut when it had only been carried somewhere else on the page. The name,
        // price, location and rung badge all still follow the pick; only where the
        // row LIVES is anchored, because that is the part the reader is holding on
        // to while they compare candidates.
        type: shell && shell.item && shell.item.isCommander ? "Commander" : cardType((shell && shell.item) || {}),
        isBasic: isBasicLand(shell && shell.item),
        quantity: pick ? pick.quantity : face.quantity,
        filled: !!pick,
        pick: pick ? {
          rung: pick.rung, entryId: pick.entryId, name: pick.name,
          price: pick.price, ceiling: pick.ceiling, band: priceBand(pick.price),
          why: pick.why, whySource: pick.whySource, predecessorName: pick.predecessorName,
          quantity: pick.quantity
        } : null,
        acquisition: name ? acquisitionOf(owned, name, pick.quantity) : ACQ.NONE,
        spot: pick ? vendorSpot(pick.price) : null,
        rungs
      });
    });

    rows.sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type), bi = TYPE_ORDER.indexOf(b.type);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      // Sorted on the shell name for the same reason: alphabetical by the card
      // currently showing would re-order the list under the reader's cursor every
      // time they tried a candidate.
      return String(a.shellName).localeCompare(String(b.shellName));
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
            band: priceBand(slot.pick.price), spot: vendorSpot(slot.pick.price),
            type: slot.type, isBasic: slot.isBasic,
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
    BUILD_RUNGS, RUNG_CHAIN, rungForStage, selectionForRung, selectionSignature, activeRung, rungTwins,
    PRICE_BANDS, priceBand,
    ACQUISITION: ACQ, PLACE, ownedKey, normalizeOwned, ownedCount, acquisitionOf,
    SPOTS, vendorSpot, rungHeading,
    TYPE_ORDER, cardType, isBasicLand, whyFor, whyText, whySource,
    deckSlots, shopRows
  };
});
