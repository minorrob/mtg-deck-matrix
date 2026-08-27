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

  /** Double-faced names are unusable in a sentence; the front face is the card. */
  function face(name) { return String(name || "").split(" // ")[0]; }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, (ch) =>
      ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[ch]));
  }
  /**
   * Mana and tap symbols, drawn rather than spelled. Card text is written in
   * symbols and reads as nonsense without them -- "{T}: Add {G}" is not a
   * sentence -- and 785 of the 1,754 cards in the catalog carry at least one in
   * their rules text, so this is most of the pane, not a corner case.
   *
   * Takes text that has ALREADY been escaped: esc leaves braces alone, so the
   * token scan is safe to run afterwards, and running it first would let card
   * text smuggle markup through.
   */
  function withSymbols(escaped) {
    return String(escaped == null ? "" : escaped).replace(/\{([^}]{1,6})\}/g, (whole, token) => {
      const code = token.toUpperCase().replace(/\//g, "").replace(/[^A-Z0-9\u221E]/g, "");
      if (!code) return whole;
      return `<img class="mana-symbol" src="https://svgs.scryfall.io/card-symbols/${
        encodeURIComponent(code)}.svg" alt="${esc(whole)}" title="${esc(whole)}">`;
    });
  }

  function manaHtml(cost) {
    const value = String(cost || "").trim();
    if (!value) return "\u2014";
    // A cost with no braces at all is not a cost this can draw; show the words.
    if (!/\{[^}]+\}/.test(value)) return esc(value);
    return `<span class="mana-cost" aria-label="Mana cost ${esc(value)}">${withSymbols(esc(value))}</span>`;
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
  /**
   * Owning a card and having it in this deck's box are different facts. There are
   * six boxes and one copy lives in exactly one of them, so the box checkbox - not
   * a guess about which deck claimed it first - decides "active".
   */
  function locationOf(ctx, name, quantity, thisDeckId, slotId) {
    const acq = Slot.acquisitionOf(ctx.owned, name, quantity);
    if (acq === Slot.ACQUISITION.NONE) return {kind: "buy", glyph: "○", label: "To buy"};
    if (acq === Slot.ACQUISITION.ORDERED) return {kind: "ordered", glyph: "⧖", label: "Ordered"};
    if (slotId && (ctx.active || {})[slotId]) return {kind: "active", glyph: "●", label: "In the box"};
    const holder = (ctx.boxes || {})[Slot.ownedKey(name)];
    if (holder && holder !== thisDeckId) {
      return {kind: "other", glyph: "◆", label: "In " + ((ctx.deckLabels || {})[holder] || holder) + "'s box", deck: holder};
    }
    return {kind: "bench", glyph: "◇", label: "Owned, no box"};
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
      ["Mana", manaHtml(m.manaCost)],
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
      ${m.oracleText ? `<p class="dp-oracle">${
        withSymbols(esc(m.oracleText)).replace(/\n/g, "<br>")}</p>` : ""}
      <p class="dp-hint">Point at any rung to preview it here.</p>`;
  }

  /* ---------------- a candidate tile ----------------
   * A hand-added card is the only kind that can leave a slot again, so it is the only
   * one that carries a control to do it. The button is a sibling of the tile rather
   * than a child, because a button inside a button is not markup a browser will honour.
   */
  function manualTileMarkup(ctx, slot, rung, deckId) {
    return `<span class="dp-tile-wrap">${tileMarkup(ctx, slot, rung, deckId, false)}<button type="button"
      class="dp-tile-return" data-dp-manual-return="${esc(slot.slotId)}|${esc(rung.entryId)}"
      title="Take ${esc(rung.name)} out of this slot and put it back on the bench"
      aria-label="Send ${esc(rung.name)} back to the bench">↩</button></span>`;
  }

  function tileMarkup(ctx, slot, rung, deckId, owned) {
    const loc = locationOf(ctx, rung.name, rung.quantity, deckId, rung.selected ? slot.slotId : null);
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
    const loc = pick ? locationOf(ctx, name, pick.quantity, deckId, slot.slotId)
                     : {kind: "buy", glyph: "○", label: "needs a card"};
    // Ticking the box is a claim about the physical world, and the app's ownership
    // data is not a better authority on that than the person holding the cards. It
    // used to be disabled for anything not already marked owned, which locked the
    // box on every card the ledger had not caught up with -- commanders included.
    // The tick now stands on its own and app.js marks the card in hand to match, so
    // the tally still adds up instead of reading "in the box" and "to buy" at once.
    const inBox = !!(ctx.active || {})[slot.slotId];
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
          ${inBox ? "checked" : ""} ${pick ? "" : "disabled"}
          aria-label="${esc(name)} is in this deck's box">
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

  /* ---------------- the Manual box ----------------
   * Every slot gets one, shaped like the card that would sit there. Two ways in: a
   * TCGplayer link, or a card already sitting in the Salvage yard. Submit resolves it,
   * writes it to this variant as a Manual rung on this slot, and pulls it out of Salvage
   * when that is where it came from. A slot that already holds a manual card shows that
   * card as a rung tile like any other, and the box turns into a way to replace it.
   */
  function manualBoxMarkup(ctx, slot, deckId) {
    const existing = slot.rungs.filter((r) => r.rung === "manual");
    const yard = (ctx.salvage || []).filter((c) => !existing.some((e) => Slot.ownedKey(e.name) === Slot.ownedKey(c.name)));
    const sid = esc(slot.slotId);
    return `<div class="dp-manual" data-dp-manual="${sid}">
      <div class="dp-manual-hd">
        <span class="dp-rung is-manual">Manual</span>
        <span class="dp-manual-ttl">${existing.length ? "Add another card to this slot" : "Put your own card in this slot"}</span>
        <button type="button" class="dp-manual-go" data-dp-manual-submit="${sid}" title="Load this card into the slot">Submit</button>
      </div>
      <label class="dp-manual-f">
        <span>TCGplayer link</span>
        <input type="url" inputmode="url" placeholder="https://www.tcgplayer.com/product/…"
          data-dp-manual-url="${sid}" aria-label="TCGplayer link for a card to put in this slot">
      </label>
      <label class="dp-manual-f">
        <span>or a card from Salvage${yard.length ? ` · ${yard.length}` : ""}</span>
        <select data-dp-manual-salvage="${sid}" aria-label="Choose a card from the Salvage yard for this slot"${yard.length ? "" : " disabled"}>
          <option value="">${yard.length ? "Choose a card you already own…" : "Salvage is empty"}</option>
          ${yard.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}${c.typeLine ? ` · ${esc(String(c.typeLine).split(" —")[0])}` : ""}</option>`).join("")}
        </select>
      </label>
      <p class="dp-manual-note" data-dp-manual-status="${sid}">Fill in one of the two. A manual card carries no simulation evidence, so its measured fields read n/a.</p>
    </div>`;
  }

  function candidateMarkup(ctx, slot, deckId) {
    const rungs = slot.rungs.filter((r) => r.rung !== "transfer");
    const base = rungs.find((r) => r.rung === "base");
    const pick = slot.pick;
    const shown = pick ? rungs.find((r) => r.entryId === pick.entryId) : rungs[0];
    const parts = [];
    if (base && base.why) {
      parts.push(`<div class="dp-why-part"><span class="dp-why-k">${
        esc(Slot.rungHeading("base", face(base.name), null, base.whySource === "authored"))
      }</span>${esc(base.why)}</div>`);
    }
    if (pick && pick.rung !== "base" && pick.why) {
      // Each rung answers to the one it replaced, not to the other four.
      parts.push(`<div class="dp-why-part"><span class="dp-why-k">${
        esc(Slot.rungHeading(pick.rung, face(pick.name), face(pick.predecessorName), pick.whySource === "authored"))
      }</span>${esc(pick.why)}</div>`);
    }
    if (!pick) parts.push('<div class="dp-why-part"><span class="dp-why-k">This slot is empty</span>Pick a rung, or slot a card you already own.</div>');

    const prevLoc = shown ? locationOf(ctx, shown.name, shown.quantity, deckId) : null;
    return `<div class="dp-cand"><div class="dp-cand-wrap"><div>
        <p class="dp-lab">The ${plural(rungs.length, "rung")} for this slot</p>
        <div class="dp-row">${rungs.map((r) => (r.rung === "manual"
          ? manualTileMarkup(ctx, slot, r, deckId)
          : tileMarkup(ctx, slot, r, deckId, false))).join("")}</div>
        ${parts.length ? `<div class="dp-why">${parts.join("")}</div>` : ""}
        ${manualBoxMarkup(ctx, slot, deckId)}
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
    const t = {cards: 0, active: 0, ordered: 0, owned: 0, buy: 0, buyValue: 0, holes: 0, lands: 0};
    slots.forEach((s) => {
      if (!s.pick) { t.holes += 1; return; }
      const qty = s.pick.quantity;
      t.cards += qty;
      if (s.type === "Land") t.lands += qty;
      const loc = locationOf(ctx, s.pick.name, qty, deckId, s.slotId);
      if (loc.kind === "active") t.active += qty;
      else if (loc.kind === "ordered") t.ordered += qty;
      else if (loc.kind === "buy") { t.buy += qty; t.buyValue += (s.pick.price || 0) * qty; }
      else t.owned += qty;   // in hand, but in another box or loose
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
          <span class="dp-stat${t.holes ? " is-warn" : " is-ok"}"><b class="dp-num">${slots.length - t.holes}/${slots.length}</b> slots filled${
            t.holes ? ` · ${plural(t.holes, "card")} still to choose` : ""}</span>
          <span class="dp-stat"><b class="dp-num">${t.lands}</b> lands</span>
        </div>
        <div class="dp-tally" role="group" aria-label="Where all ${t.cards + t.holes} cards are">
          <span class="dp-tally-t"><b class="dp-num">${t.cards + t.holes}</b> cards</span><span class="dp-tally-op">=</span>
          <span class="dp-tally-b is-deck"><b class="dp-num">${t.active}</b> in the box</span>
          ${t.owned ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-bench"><b class="dp-num">${t.owned}</b> owned, not in this box</span>` : ""}
          ${t.ordered ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-ordered"><b class="dp-num">${t.ordered}</b> ordered</span>` : ""}
          <span class="dp-tally-op">+</span><span class="dp-tally-b is-buy"><b class="dp-num">${t.buy}</b> to buy ${money(t.buyValue)}</span>
          ${t.holes ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-hole"><b class="dp-num">${t.holes}</b> empty ${t.holes === 1 ? "slot" : "slots"}</span>` : ""}
        </div>
        <div class="dp-rank" role="group" aria-label="Set every slot to one rung">
          <span class="dp-rank-lab">Rank order</span>
          ${(ctx.buildRungs || []).map((rung) => `<button type="button" class="dp-rank-b${
            ctx.rung === rung ? " is-on" : ""}" data-dp-rung="${esc(rung)}" aria-pressed="${ctx.rung === rung}">${
            esc(RUNG_LABEL[rung] || rung)}</button>`).join("")}
          ${ctx.rung
            ? ((ctx.rungTwins || []).length
              ? `<span class="dp-rank-note">same hundred as ${
                  ctx.rungTwins.map((r) => esc((ctx.rungLabels || {})[r] || r)).join(" and ")
                } — nothing on this deck changes between them yet</span>`
              : "")
            : '<span class="dp-rank-note">this deck matches no whole rung — pick one to set every slot at once</span>'}
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
