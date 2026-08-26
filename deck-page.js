/**
 * Deck page - the collapsed view that replaces Calibrate and Decks.
 *
 * One row per slot. A slot expands in place into its ladder: the five rungs, plus
 * the cards you already own that would fit, each badged with where the physical
 * copy actually is. The right third previews whichever candidate you point at.
 *
 * Reads through slot-model.js so the Shop page can read the same projection.
 * Renders into a host element; owns no storage. The caller supplies state and
 * persists it.
 */
(function (root, factory) {
  "use strict";
  const req = (typeof module === "object" && module.exports && typeof require === "function") ? require : null;
  const Slot = req ? req("./slot-model.js") : root && root.MtgSlotModel;
  const Lineup = req ? req("./lineup-model.js") : root && root.MtgLineupModel;
  const api = factory(Slot, Lineup);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDeckPage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Slot, Lineup) {
  "use strict";

  if (!Slot || !Lineup) throw new Error("Deck page requires the slot and lineup models");

  const RARITY_KEY = {common: "C", uncommon: "U", rare: "R", special: "S", mythic: "M", bonus: "B"};
  const RUNG_LABEL = Slot.RUNG_LABEL;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, (ch) =>
      ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[ch]));
  }
  function money(n) {
    return Number.isFinite(Number(n)) ? "$" + Number(n).toFixed(2) : "—";
  }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  /* ---------------- where the physical copy is ----------------
   * Five states, carried by glyph shape rather than colour so they never collide
   * with the rung ramp. "Ordered" is the one the old model could not express:
   * paid for, not here, cannot be sleeved.
   */
  function locationOf(ctx, name, quantity, thisDeckId) {
    const acq = Slot.acquisitionOf(ctx.owned, name, quantity);
    if (acq === Slot.ACQUISITION.NONE) return {kind: "buy", glyph: "○", label: "To buy"};
    if (acq === Slot.ACQUISITION.ORDERED) return {kind: "ordered", glyph: "⧖", label: "Ordered"};
    const holder = (ctx.assignments || {})[Slot.ownedKey(name)];
    if (holder && holder !== thisDeckId) {
      return {kind: "other", glyph: "◆", label: "In " + (ctx.deckLabels?.[holder] || holder), deck: holder};
    }
    if (holder === thisDeckId) return {kind: "deck", glyph: "●", label: "In deck"};
    return {kind: "bench", glyph: "◇", label: "Bench"};
  }

  function meta(ctx, name) { return (ctx.cards || {})[Lineup.normalizeName(name)] || {}; }
  function rarityKey(ctx, name) { return RARITY_KEY[meta(ctx, name).rarity] || "C"; }
  function isLegendary(ctx, name) { return /^Legendary\b/.test(meta(ctx, name).typeLine || ""); }

  /* ---------------- the card pane ---------------- */
  function previewMarkup(ctx, name, loc, price) {
    const m = meta(ctx, name);
    const rk = rarityKey(ctx, name);
    const img = m.image
      ? `<img class="dp-art" src="${esc(m.image)}" alt="${esc(name)}" loading="lazy">`
      : `<div class="dp-art dp-art-blank"><span>${esc(name)}</span></div>`;
    const rows = [
      ["Mana", m.manaCost ? esc(m.manaCost) : "—"],
      ["Type", esc(m.typeLine || "—")],
      ["Mechanics", (m.keywords && m.keywords.length) ? esc(m.keywords.join(" · ")) : "—"],
      ["Rarity", `<span class="dp-rar"><span class="dp-sw" style="--rar:var(--rar-${rk})"></span>${
        esc((m.rarity || "common").replace(/^./, (c) => c.toUpperCase()))}${
        isLegendary(ctx, name) ? ' ♛ Legendary' : ""}</span>`],
      ["Set", esc(m.setName || "—")],
      ["Where", `<span class="dp-loc is-${loc.kind}"><span class="dp-g">${loc.glyph}</span>${esc(loc.label)}</span>`],
      ["Target", `<span class="dp-num">${money(price)}</span>`]
    ];
    return `<div class="dp-face" style="--rar:var(--rar-${rk})">${img}</div>
      <ul class="dp-stats">${rows.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join("")}</ul>
      ${m.oracleText ? `<p class="dp-oracle">${esc(m.oracleText)}</p>` : ""}
      <p class="dp-hint">Point at any rung to preview it here.</p>`;
  }

  /* ---------------- a candidate tile ---------------- */
  function tileMarkup(ctx, slot, rung, deckId, owned) {
    const loc = locationOf(ctx, rung.name, rung.quantity, deckId);
    const rk = rarityKey(ctx, rung.name);
    return `<button class="dp-tile" style="--rar:var(--rar-${rk})"
        title="${esc((meta(ctx, rung.name).rarity || "common"))}"
        data-dp-pick="${esc(slot.slotId)}|${esc(rung.entryId)}"
        data-dp-prev="${esc(slot.slotId)}|${esc(rung.name)}|${loc.kind}|${rung.price == null ? "" : rung.price}"
        aria-pressed="${rung.selected}">
      <span class="dp-tile-top">
        <span class="dp-rung is-${owned ? "owned" : rung.rung}">${owned ? "Owned" : (RUNG_LABEL[rung.rung] || rung.rung)}</span>
        ${isLegendary(ctx, rung.name) ? '<span class="dp-crown" title="Legendary">♛</span>' : ""}
      </span>
      <span class="dp-tile-nm">${esc(rung.name)}</span>
      <span class="dp-tile-ft">
        <span class="dp-loc is-${loc.kind}"><span class="dp-g">${loc.glyph}</span>${esc(loc.label)}</span>
        <span class="dp-num">${money(rung.price)}</span>
      </span></button>`;
  }

  /* ---------------- one slot row ---------------- */
  function slotMarkup(ctx, slot, deckId, openId) {
    const open = openId === slot.slotId;
    const pick = slot.pick;
    const name = pick ? pick.name : "— empty —";
    const loc = pick ? locationOf(ctx, name, pick.quantity, deckId) : {kind: "buy", glyph: "○", label: "needs a card"};
    const canSleeve = pick && (loc.kind === "deck" || loc.kind === "bench" || loc.kind === "other");
    const sleeved = !!(ctx.sleeved || {})[slot.slotId];
    const count = slot.rungs.length;
    // When a rung has displaced the Base card, the sub-line's job is to name what
    // was displaced. Otherwise it is dead space, so give it the card's type line.
    const sub = slot.isBasic
      ? `Basic land · one row, ${slot.quantity} cards`
      : (pick && pick.rung !== "base" && slot.shellName !== name)
        ? `↔ replaces ${esc(slot.shellName)}`
        : esc(meta(ctx, name).typeLine || "");

    return `<div class="dp-slot" data-dp-slot="${esc(slot.slotId)}" data-open="${open ? 1 : 0}">
      <div class="dp-slot-h">
        <input class="dp-box" type="checkbox" data-dp-box="${esc(slot.slotId)}"
          ${sleeved ? "checked" : ""} ${canSleeve ? "" : "disabled"}
          aria-label="${esc(name)} is sleeved in the deck">
        <button class="dp-main" data-dp-expand="${esc(slot.slotId)}" aria-expanded="${open}">
          <span class="dp-l1">
            <span class="dp-nm${pick ? "" : " is-hole"}">${esc(name)}</span>
            ${slot.quantity > 1 && pick ? `<span class="dp-qty dp-num">×${slot.quantity}</span>` : ""}
            <span class="dp-rung is-${pick ? pick.rung : "none"}">${pick ? (RUNG_LABEL[pick.rung] || pick.rung) : "Empty"}</span>
            ${pick && isLegendary(ctx, name) ? '<span class="dp-crown">♛</span>' : ""}
          </span>
          <span class="dp-l2">${sub}</span>
        </button>
        <div class="dp-r">
          ${pick ? `<span class="dp-num${loc.kind === "buy" ? " is-buy" : ""}">${money(pick.price)}</span>` : ""}
          <span class="dp-loc is-${loc.kind}"><span class="dp-g">${loc.glyph}</span>${esc(loc.label)}</span>
          <span class="dp-of">${pick ? 1 : 0} of ${count}</span>
        </div>
      </div>
      ${open ? candidateMarkup(ctx, slot, deckId) : ""}
    </div>`;
  }

  function candidateMarkup(ctx, slot, deckId) {
    const rungs = slot.rungs.filter((r) => r.rung !== "transfer");
    const base = rungs.find((r) => r.rung === "base");
    const pick = slot.pick;
    const shown = pick ? rungs.find((r) => r.entryId === pick.entryId) : rungs[0];
    const parts = [];
    if (base && base.why) {
      // Only claim to state the slot's thesis when someone actually wrote one.
      const heading = base.whySource === "authored"
        ? "What this slot does · from Base"
        : "What the Base card does · its own rules text";
      parts.push(`<div class="dp-why-part"><span class="dp-why-k">${heading}</span>${esc(base.why)}</div>`);
    }
    if (pick && pick.rung !== "base" && pick.why) {
      const heading = pick.whySource === "authored"
        ? `Why ${esc(pick.name)} over the other ${rungs.length - 1}`
        : `What ${esc(pick.name)} does · no rung note written yet`;
      parts.push(`<div class="dp-why-part"><span class="dp-why-k">${heading}</span>${esc(pick.why)}</div>`);
    }
    if (!pick) parts.push('<div class="dp-why-part"><span class="dp-why-k">This slot is empty</span>Pick a rung, or slot a card you already own.</div>');

    const prevLoc = shown ? locationOf(ctx, shown.name, shown.quantity, deckId) : null;
    return `<div class="dp-cand"><div class="dp-cand-wrap"><div>
        <p class="dp-lab">The ${plural(rungs.length, "rung")} for this slot</p>
        <div class="dp-row">${rungs.map((r) => tileMarkup(ctx, slot, r, deckId, false)).join("")}</div>
        ${parts.length ? `<div class="dp-why">${parts.join("")}</div>` : ""}
      </div>
      <aside class="dp-prev" id="dp-prev-${esc(slot.slotId)}">${
        shown ? previewMarkup(ctx, shown.name, prevLoc, shown.price) : ""}</aside>
    </div></div>`;
  }

  /* ---------------- groups and the page ---------------- */
  function groupSlots(slots) {
    const by = new Map();
    slots.forEach((s) => {
      if (!by.has(s.type)) by.set(s.type, []);
      by.get(s.type).push(s);
    });
    return Slot.TYPE_ORDER.filter((t) => by.has(t)).map((t) => [t, by.get(t)]);
  }

  /**
   * Buckets are mutually exclusive and sum to the card count, so the header can be
   * checked by eye. Sleeved and to-buy are NOT complements: a card can be ordered
   * (paid for, in transit, unsleevable) or owned but sitting elsewhere, and leaving
   * those out is what makes "100 - 77 sleeved" fail to equal "22 to buy".
   */
  function totals(ctx, slots, deckId) {
    const t = {cards: 0, sleeved: 0, ordered: 0, elsewhere: 0, buy: 0, buyValue: 0, holes: 0, lands: 0};
    slots.forEach((s) => {
      if (!s.pick) { t.holes += 1; return; }
      const qty = s.pick.quantity;
      t.cards += qty;
      if (s.type === "Land") t.lands += qty;
      const loc = locationOf(ctx, s.pick.name, qty, deckId);
      const isSleeved = !!(ctx.sleeved || {})[s.slotId] && loc.kind !== "buy" && loc.kind !== "ordered";
      if (isSleeved) t.sleeved += qty;
      else if (loc.kind === "ordered") t.ordered += qty;
      else if (loc.kind === "buy") { t.buy += qty; t.buyValue += (s.pick.price || 0) * qty; }
      else t.elsewhere += qty;
    });
    return t;
  }

  function render(host, ctx) {
    if (!host) return;
    const deckId = ctx.deckId;
    const slots = ctx.slots;
    const t = totals(ctx, slots, deckId);
    const open = ctx.openSlot || null;
    host.innerHTML = `
      <div class="dp-head">
        <div class="dp-head-top">
          <div><h2>${esc(ctx.deckTitle)}</h2>
          <p class="dp-sub">${esc(ctx.commander || "")}${ctx.colors ? " · " + esc(ctx.colors) : ""}${
            ctx.variantId ? " · variant " + esc(ctx.variantId) : ""}</p></div>
        </div>
        <div class="dp-stats-row">
          <span class="dp-stat${t.holes ? " is-warn" : " is-ok"}"><b class="dp-num">${t.cards}</b> cards in ${plural(slots.length, "slot")}</span>
          <span class="dp-stat"><b class="dp-num">${t.lands}</b> lands</span>
        </div>
        <div class="dp-tally" role="group" aria-label="Where all ${t.cards + t.holes} cards are">
          <span class="dp-tally-t"><b class="dp-num">${t.cards + t.holes}</b> cards</span><span class="dp-tally-op">=</span>
          <span class="dp-tally-b is-deck"><b class="dp-num">${t.sleeved}</b> sleeved</span>
          ${t.elsewhere ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-bench"><b class="dp-num">${t.elsewhere}</b> owned elsewhere</span>` : ""}
          ${t.ordered ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-ordered"><b class="dp-num">${t.ordered}</b> ordered</span>` : ""}
          <span class="dp-tally-op">+</span><span class="dp-tally-b is-buy"><b class="dp-num">${t.buy}</b> to buy ${money(t.buyValue)}</span>
          ${t.holes ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-hole"><b class="dp-num">${t.holes}</b> empty ${t.holes === 1 ? "slot" : "slots"}</span>` : ""}
        </div>
        <div class="dp-collapse">
          <div class="dp-cstep is-done"><b>25</b>5 variants × 5 rungs</div>
          <div class="dp-cstep is-done"><b>5</b>rungs, variant ${esc(ctx.variantId || "")} chosen</div>
          <div class="dp-cstep is-now"><b>1</b>calibrated — the other 4 stay one click away</div>
        </div>
      </div>
      ${groupSlots(slots).map(([type, rows]) => {
        const isOpen = (ctx.openGroups || {})[type] !== false;
        const buys = rows.filter((s) => s.pick && locationOf(ctx, s.pick.name, s.pick.quantity, deckId).kind === "buy").length;
        const qty = rows.reduce((n, s) => n + (s.pick ? s.pick.quantity : 0), 0);
        return `<section class="dp-grp" data-open="${isOpen ? 1 : 0}">
          <button class="dp-grp-h" data-dp-grp="${esc(type)}" aria-expanded="${isOpen}">
            <span class="dp-car">▶</span><span class="dp-grp-nm">${esc(type)}</span>
            <span class="dp-grp-ct">${plural(qty, "card")}${buys ? " · " + buys + " to buy" : ""}</span>
          </button>
          <div class="dp-grp-body">${rows.map((s) => slotMarkup(ctx, s, deckId, open)).join("")}</div>
        </section>`;
      }).join("")}`;
  }

  return {render, previewMarkup, locationOf, groupSlots, totals, RARITY_KEY};
});
