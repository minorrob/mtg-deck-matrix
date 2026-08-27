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
  /**
   * Two facts, one line: whether you have assigned this slot to this deck, and where the
   * card actually is.
   *
   * They are independent. Ticking the box is a decision about the deck list -- "this card
   * is the one filling this job" -- and it says nothing about whether the card is sleeved,
   * on a truck, or still on a shelf in a shop. It used to say something: ticking wrote the
   * card into the ownership ledger as in-hand so the row would stop reading "to buy",
   * which meant an ordered card ticked and then unticked came back as "Owned, no box"
   * rather than "Ordered", and the ledger briefly held one physical copy twice, once as
   * held and once as on order. The tick no longer touches the ledger at all; the label
   * carries both facts instead, so nothing is hidden and nothing is invented.
   *
   * The kind still follows acquisition, because that is what the tally and the shopping
   * list are counting: a card on order is not in the box yet, however firmly it is spoken
   * for.
   */
  function locationOf(ctx, name, quantity, thisDeckId, slotId) {
    const acq = Slot.acquisitionOf(ctx.owned, name, quantity);
    const assigned = Boolean(slotId && (ctx.active || {})[slotId]);
    if (acq === Slot.ACQUISITION.NONE) {
      return {kind: "buy", glyph: assigned ? "◐" : "○", label: assigned ? "Assigned · to buy" : "To buy", assigned};
    }
    if (acq === Slot.ACQUISITION.ORDERED) {
      return {kind: "ordered", glyph: "⧖", label: assigned ? "Assigned · ordered" : "Ordered", assigned};
    }
    if (acq === Slot.ACQUISITION.PARTIAL) {
      return {kind: "ordered", glyph: "⧖", label: assigned ? "Assigned · partly here" : "Partly here", assigned};
    }
    /* You own it -- but do you own a copy this deck can have? What another deck has boxed
       is gone as far as this one is concerned, and with one Sol Ring across five decks
       that is the normal case rather than the edge one. */
    const need = Math.max(1, Number(quantity) || 1);
    const holds = assigned
      ? (ctx.claimHeld ? ctx.claimHeld(name) : true)          // this deck's claim was served
      : (ctx.spareCopies ? ctx.spareCopies(name) >= need : true);  // a copy is still free
    if (holds) {
      return assigned
        ? {kind: "active", glyph: "●", label: "In the box", assigned}
        : {kind: "bench", glyph: "◇", label: "Owned, no box", assigned};
    }
    const holder = (ctx.boxes || {})[Slot.ownedKey(name)];
    const whose = holder && holder !== thisDeckId ? ((ctx.deckLabels || {})[holder] || holder) : "";
    // Every copy is spoken for, so this deck needs one of its own. Ticking the box is
    // still allowed -- it is a plan, not a claim -- and the shortfall counts as to-buy,
    // which is the same copy the Shop is already asking you to buy.
    if (assigned) {
      return {kind: "buy", glyph: "◐", label: whose ? `Assigned · another copy needed (${whose} has yours)` : "Assigned · another copy needed", assigned, deck: holder};
    }
    return {kind: "other", glyph: "◆", label: whose ? `In ${whose}'s box` : "Owned, no box", deck: holder, assigned};
  }

  /* What a card cost. A price you typed into the slot's Paid box is the real number and
     wins; the target price is an estimate standing in until you have one. Everything that
     shows or sorts by cost goes through here, so the row and the sort can never disagree
     about which figure they are using. */
  function costOf(ctx, pick) {
    if (!pick) return {value: 0, paid: false};
    const paid = ctx.paidFor ? ctx.paidFor(pick.name) : null;
    return paid === null ? {value: Number(pick.price) || 0, paid: false} : {value: Number(paid), paid: true};
  }

  function meta(ctx, name) { return (ctx.cards || {})[Lineup.normalizeName(name)] || {}; }
  function cardTypeOf(ctx, name) { return Slot.cardType(meta(ctx, name)); }
  function rarityKey(ctx, name) { return RARITY_KEY[meta(ctx, name).rarity] || "C"; }
  function isLegendary(ctx, name) { return /^Legendary\b/.test(meta(ctx, name).typeLine || ""); }

  /* ---------------- the card pane ---------------- */
  function previewMarkup(ctx, name, loc, price) {
    const m = meta(ctx, name);
    const rk = rarityKey(ctx, name);
    const img = m.image
      ? `<img class="dp-art" src="${esc(Slot.cardImage(m.image, "normal"))}" alt="${esc(name)}" loading="lazy">`
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
      ["Target", `<span class="dp-num">${money(price)}</span>`],
      /* What it cost, not what it is worth. Editable here because this is where you are
         looking at the card; the same number appears on the Shop row you bought it on. */
      ["Paid", `<span class="dp-paid${ctx.paidFor && ctx.paidFor(name) === null ? "" : " is-set"}">
        <input type="text" inputmode="decimal" data-dp-paid="${esc(Slot.ownedKey(name))}"
          value="${ctx.paidFor && ctx.paidFor(name) !== null ? Number(ctx.paidFor(name)).toFixed(2) : ""}"
          placeholder="—" aria-label="What you paid for ${esc(name)}"></span>`]
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
    /* Rows are grouped by the slot's shell so they never jump when the rung changes, which
       means a group heading is about the JOB, not about what is filling it today. When the
       card in the slot is a different type from the group it sits in, the row has to say
       so, or counting Lands by eye misses a land filed under Enchantment. */
    const realType = pick ? cardTypeOf(ctx, name) : null;
    const misfiled = pick && realType && realType !== slot.type && !slot.isBasic;
    /* A row that stands for several cards says how many of them you can actually field.
       "Forest ×7" is seven cards, not one, and the number worth knowing is how many of the
       Forests you own are still going spare once the other decks have taken theirs. */
    const cost = costOf(ctx, pick);
    const pool = pick && ctx.availableFor ? ctx.availableFor(name) : null;
    const stock = pick && ctx.ownedTotal ? ctx.ownedTotal(name) : null;
    const sub = slot.isBasic
      ? `Basic land${pool === null ? "" : ` · ${pool} of your ${stock === null ? pool : stock} still free${
          pool < slot.quantity ? ` · ${slot.quantity - pool} short` : ""}`}`
      : (pick && pick.rung !== "base" && slot.shellName !== name)
        ? `${misfiled ? `${esc(realType)} · ` : ""}↔ replaces ${esc(slot.shellName)}`
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
          ${pick ? `<span class="dp-num${loc.kind === "buy" ? " is-buy" : ""}${cost.paid ? " is-paid" : ""}"${
            cost.paid ? ` title="What you paid. Target was ${money(pick.price)}."` : ""
          }>${money(cost.value)}</span>` : ""}
          <span class="dp-loc is-${loc.kind}"><span class="dp-g">${loc.glyph}</span>${esc(loc.label)}</span>
          <span class="dp-of">${slot.isBasic && stock !== null
            /* On a basic-land row the rung count is always "1 of 1", which says nothing.
               The copies are the fact worth showing: twelve of the ninety-one Plains you
               own are in this deck. Every other row keeps the rung count. */
            ? `${slot.quantity} of ${stock}`
            : `${pick ? 1 : 0} of ${count}`}</span>
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
  /**
   * The three cards you already own that would most plausibly do this slot's job.
   *
   * The dropdown below this lists everything loose, alphabetically, which is the right
   * tool when you know what you are looking for and the wrong one when you are sitting
   * behind a pile of cards asking "does anything here go in this hole". So the slot
   * answers that question itself: same job, same shape, same cost, ranked, with the
   * reasoning shown rather than implied.
   *
   * Two gates before anything is offered.
   *
   * The slot has to actually need a card. A slot holding something already in your hand
   * does not want alternatives -- the card is there, on the table, in front of you. So
   * this appears on the slots where it can change what you do: the ones holding a card
   * you would have to go and buy, and the ones holding nothing at all. Everywhere else
   * it stays out of the way, which is what lets it be worth noticing when it appears.
   *
   * And what the slot is FOR is read from the card standing in it, falling back to the
   * card the slot was built around when it is empty. The pick is what is on screen and
   * what a suggestion would displace; ranking against the shell instead offers creature
   * swaps for a slot visibly holding a removal spell.
   */
  function fitsMarkup(ctx, slot, deckId, pool) {
    if (!Slot.slotFit || !(pool || []).length) return "";
    const here = slot.pick
      ? locationOf(ctx, slot.pick.name, slot.pick.quantity, deckId, slot.slotId)
      : null;
    if (here && here.kind !== "buy") return "";
    const shell = meta(ctx, (slot.pick && slot.pick.name) || slot.shellName || "");
    if (!shell.typeLine) return "";
    const target = {
      type: Slot.cardType(shell),
      manaValue: Slot.manaValueOf(shell),
      roles: Slot.cardRoles(shell)
    };
    const identity = ctx.identity || [];
    const ranked = pool
      // Colour is a gate, not a score: a card outside the commander's identity is illegal
      // here, and an illegal suggestion is worse than no suggestion.
      .filter((card) => (card.colorIdentity || []).every((color) => identity.indexOf(color) >= 0))
      .map((card) => ({card, fit: Slot.slotFit(card, target)}))
      /* When the slot's own card is FOR something -- removal, ramp, a finisher -- a
         suggestion has to share that. Without this the list fills with "also a creature,
         same cost", which is true of forty cards and useful about none of them. Where the
         shell has no role to share (a vanilla body, a utility land), shape and cost are
         the best signal there is, and the fallback shows those instead. */
      .filter((row) => row.fit.score > 0 && (!target.roles.length || row.fit.shared.length))
      .sort((a, b) => b.fit.score - a.fit.score || a.card.name.localeCompare(b.card.name))
      .slice(0, 3);
    if (!ranked.length) return "";
    const sid = esc(slot.slotId);
    return `<div class="dp-fits">
      <p class="dp-fits-lab">Cards you own that would do this slot's job</p>
      <div class="dp-fits-row">${ranked.map(({card, fit}) => `
        <button type="button" class="dp-fit" data-dp-fit="${sid}|${esc(card.name)}"
          title="Put ${esc(card.name)} in this slot">
          <span class="dp-fit-nm">${esc(face(card.name))}</span>
          <span class="dp-fit-why">${esc(fit.reasons.join(" · ") || "fits the slot")}</span>
        </button>`).join("")}</div>
    </div>`;
  }

  function manualBoxMarkup(ctx, slot, deckId) {
    /* Not on the commander. Every other slot holds a card the deck was built to want;
       the commander slot holds the card the deck was built FROM -- its colour identity,
       its plan, its legality all follow from it. The box used to appear here like
       anywhere else, and picking what it added left the deck at a hundred cards with no
       commander in them, which is not a Commander deck at all. */
    if (slot.type === "Commander") return "";
    const existing = slot.rungs.filter((r) => r.rung === "manual");
    // Anything already on offer in this slot, by any rung, is not offered again.
    const taken = (c) => slot.rungs.some((r) => Slot.ownedKey(r.name) === Slot.ownedKey(c.name));
    const yard = (ctx.salvage || []).filter((c) => !taken(c));
    // Owned copies another deck lists but is not holding. Same standing as the yard, in
    // its own group so each one can say which deck it is sitting in.
    const loose = (ctx.freeCards || []).filter((c) => !taken(c)
      && !yard.some((y) => Slot.ownedKey(y.name) === Slot.ownedKey(c.name)));
    const total = yard.length + loose.length;
    const option = (c, suffix) => `<option value="${esc(c.name)}">${esc(c.name)}${
      c.typeLine ? ` · ${esc(String(c.typeLine).split(" —")[0])}` : ""}${suffix || ""}</option>`;
    const sid = esc(slot.slotId);
    return `<div class="dp-manual" data-dp-manual="${sid}">
      ${fitsMarkup(ctx, slot, deckId, yard.concat(loose))}
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
        <span>or a card you already own${total ? ` · ${total}` : ""}</span>
        <select data-dp-manual-salvage="${sid}" aria-label="Choose a card you already own for this slot"${total ? "" : " disabled"}>
          <option value="">${total ? "Choose a card you already own…" : "Nothing loose to put here"}</option>
          ${yard.length ? `<optgroup label="On the bench">${yard.map((c) => option(c)).join("")}</optgroup>` : ""}
          ${loose.length ? `<optgroup label="Owned, but no deck is holding it">${
            loose.map((c) => option(c, ` · listed in ${esc(c.fromDeck || "another deck")}`)).join("")}</optgroup>` : ""}
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
  /* ---------------- search and filter ----------------
   * Eighty-five rows is too many to scan for one card. The search reads the card in the
   * slot, every rung it could hold, and the card the slot was built around, so looking
   * for a card finds the slot it could go in even when it is not the one showing.
   */
  /* Three questions about a slot, each with its own dropdown, because each is a separate
     fact and they compose.

       WHERE   which pile the copy is physically in -- this box, the bench, another deck's
               box -- the six-value reading the row itself shows.
       STATUS  what the card's situation is: you have it, it is in the post, or it is
               still to buy.
       ACTIVE  whether this deck has claimed the slot.

     Where is the finest-grained of the three and the other two are coarser cuts across
     it, so they are kept apart rather than folded together: "everything I own that is not
     in this box" is a Status question that no single Where value answers. */
  const WHERE_LABEL = {
    active: "In the box", bench: "Owned, no box", other: "In another box",
    ordered: "Ordered", buy: "To buy", hole: "Empty slot"
  };
  function slotWhere(ctx, slot, deckId) {
    if (!slot.pick) return "hole";
    return locationOf(ctx, slot.pick.name, slot.pick.quantity, deckId, slot.slotId).kind;
  }

  const STATUS_LABEL = {buy: "To buy", owned: "Owned", ordered: "Ordered", hole: "Empty slot"};
  const STATUS_ORDER = ["owned", "ordered", "buy", "hole"];
  const ACTIVE_LABEL = {active: "Active", inactive: "Inactive"};

  function slotStatus(ctx, slot, deckId) {
    if (!slot.pick) return "hole";
    const kind = locationOf(ctx, slot.pick.name, slot.pick.quantity, deckId, slot.slotId).kind;
    if (kind === "buy" || kind === "ordered") return kind;
    // active, bench and other all mean the same thing about the card: you have a copy.
    return "owned";
  }
  function slotActive(ctx, slot) {
    return (ctx.active || {})[slot.slotId] ? "active" : "inactive";
  }

  function slotMatches(ctx, slot, deckId, f) {
    if (f.type && f.type !== "all" && slot.type !== f.type) return false;
    if (f.rung && f.rung !== "all" && !slot.rungs.some((r) => r.rung === f.rung)) return false;
    if (f.where && f.where !== "all" && slotWhere(ctx, slot, deckId) !== f.where) return false;
    if (f.status && f.status !== "all" && slotStatus(ctx, slot, deckId) !== f.status) return false;
    if (f.active && f.active !== "all" && slotActive(ctx, slot) !== f.active) return false;
    const query = String(f.query || "").trim().toLowerCase();
    if (!query) return true;
    const haystack = [slot.shellName, slot.pick && slot.pick.name, ...slot.rungs.map((r) => r.name)]
      .filter(Boolean)
      .concat([meta(ctx, slot.pick ? slot.pick.name : slot.shellName).typeLine || ""])
      .join(" ").toLowerCase();
    return haystack.indexOf(query) >= 0;
  }

  function filterMarkup(ctx, slots, shown) {
    const f = ctx.filters || {};
    const active = (f.query || "").trim() !== ""
      || ["type", "rung", "where", "status", "active"].some((k) => f[k] && f[k] !== "all");
    const types = Slot.TYPE_ORDER.filter((t) => slots.some((s) => s.type === t));
    const rungs = Slot.RUNG_ORDER.filter((r) => slots.some((s) => s.rungs.some((x) => x.rung === r)));
    // Only the values this deck actually has, so a dropdown never offers an empty result.
    const wheres = Object.keys(WHERE_LABEL).filter((w) => slots.some((s) => slotWhere(ctx, s, ctx.deckId) === w));
    const states = STATUS_ORDER.filter((k) => slots.some((s) => slotStatus(ctx, s, ctx.deckId) === k));
    const actives = ["active", "inactive"].filter((k) => slots.some((s) => slotActive(ctx, s) === k));
    const select = (key, label, options, allLabel) => `<label class="dp-f"><span>${esc(label)}</span>
      <select data-dp-filter="${key}">
        <option value="all">${esc(allLabel || "All")}</option>
        ${options.map(([value, text]) => `<option value="${esc(value)}"${
          (f[key] || "all") === value ? " selected" : ""}>${esc(text)}</option>`).join("")}
      </select></label>`;
    // Group by is not a filter -- it hides nothing -- so it carries no "All" and is never
    // counted as an active filter that the Clear button would reset.
    const grouper = `<label class="dp-f"><span>Group by</span>
      <select data-dp-filter="groupBy">
        ${GROUP_BY.map(([value, text]) => `<option value="${esc(value)}"${
          (f.groupBy || "type") === value ? " selected" : ""}>${esc(text)}</option>`).join("")}
      </select></label>
    <label class="dp-f"><span>Sort by</span>
      <select data-dp-filter="sortBy">
        ${SORT_BY.map(([value, text]) => `<option value="${esc(value)}"${
          (f.sortBy || "") === value ? " selected" : ""}>${esc(text)}</option>`).join("")}
      </select></label>`;
    return `<div class="dp-filters" role="search">
      <label class="dp-f dp-f-q"><span>Search</span>
        <input type="search" id="dp-q" value="${esc(f.query || "")}" placeholder="Card, rung, or type…"
          aria-label="Search this deck's slots"></label>
      ${select("type", "Type", types.map((t) => [t, t]))}
      ${select("rung", "Rung", rungs.map((r) => [r, RUNG_LABEL[r] || r]))}
      ${select("where", "Where", wheres.map((w) => [w, WHERE_LABEL[w]]))}
      ${select("status", "Status", states.map((k) => [k, STATUS_LABEL[k]]))}
      ${select("active", "Active", actives.map((k) => [k, ACTIVE_LABEL[k]]), "All")}
      ${grouper}
      <span class="dp-f-count">${shown === slots.length
        ? `${plural(slots.length, "slot")}`
        : `${shown} of ${plural(slots.length, "slot")}`}</span>
      ${active ? `<button type="button" class="dp-f-clear" data-dp-filter-clear>Clear</button>` : ""}
    </div>`;
  }

  /* ---------------- ready to sleeve? ----------------
   * The question you are actually asking with the cards in front of you: is this a legal
   * hundred, and can it cast itself. Both answers already existed -- compliance-model has
   * ruled on legality since the beginning, and the mana rules are the engine's own -- they
   * were just never shown on the page where you are holding the cards.
   */
  const PIP = {W: "◐", U: "◉", B: "●", R: "◆", G: "◈"};

  function readyMarkup(ctx, slots) {
    const cards = ctx.deckCards || [];
    if (!cards.length) return "";
    const rules = ctx.complianceFor ? ctx.complianceFor(cards) : null;
    const mana = Slot.manaHealth(cards);
    const problems = rules ? (rules.tier3 || []) : [];
    const warnings = rules ? (rules.compositionWarnings || []) : [];
    const gc = rules ? (rules.selectedGameChangers || []).length : 0;

    // Only the colours the deck actually asks for. Sources for a colour it never casts --
    // an any-colour rock in a two-colour deck credits all five -- are noise on the row.
    const colors = Slot.MANA_COLORS.filter((c) => mana.pips[c] > 0);
    const manaChips = colors.map((c) => {
      const thin = mana.thin.indexOf(c) >= 0;
      return `<span class="dp-mana${thin ? " is-thin" : ""}" title="${
        mana.sources[c]} source${mana.sources[c] === 1 ? "" : "s"} for ${mana.pips[c]} ${c} pip${
        mana.pips[c] === 1 ? "" : "s"}${thin ? " — thin" : ""}">${PIP[c]} <b class="dp-num">${
        mana.sources[c]}</b>/${mana.pips[c]}</span>`;
    }).join("");

    const verdict = problems.length
      ? `<b>${plural(problems.length, "rule problem")}</b>`
      : `<b>Legal</b> at Bracket 3${gc ? ` · ${plural(gc, "Game Changer")}` : ""}`;

    return `<details class="dp-ready${problems.length ? " is-bad" : mana.thin.length ? " is-warn" : " is-ok"}">
      <summary>
        <span class="dp-ready-v">${problems.length ? "⚠" : "✓"} ${verdict}</span>
        <span class="dp-ready-m">${manaChips}</span>
        <span class="dp-ready-c"><b class="dp-num">${mana.lands}</b> lands · avg cost <b class="dp-num">${
          mana.averageValue.toFixed(1)}</b></span>
      </summary>
      <div class="dp-ready-body">
        ${problems.length ? `<ul class="dp-ready-list">${problems.slice(0, 8).map((p) =>
          `<li><b>${esc(p.card)}</b> ${esc(p.rule)}${p.detail ? ` <i>${esc(p.detail)}</i>` : ""}</li>`).join("")}</ul>`
          : `<p class="dp-ready-note">Nothing in this hundred breaks a Bracket 3 rule: one commander, a hundred cards, singleton outside the basics, every colour inside the commander's identity, and no more than three Game Changers.</p>`}
        ${mana.thin.length ? `<p class="dp-ready-note"><b>Thin on ${
          mana.thin.join(", ")}.</b> A colour wants roughly a third of the deck's lands behind it before its pips stop stranding cards in hand. Counted over lands and rocks alike, weighted by how many copies each slot holds.</p>` : ""}
        ${warnings.length ? `<ul class="dp-ready-list">${warnings.slice(0, 5).map((w) =>
          `<li>${esc(typeof w === "string" ? w : (w.rule || w.card || ""))}</li>`).join("")}</ul>` : ""}
      </div>
    </details>`;
  }

  /* How the rows are stacked. Type is the default because it is how a deck is built and
     how a physical box is sorted; Rarity is how a binder is sorted; Status is how a
     shopping trip is sorted. None is the answer to "just show me the list" -- it returns
     one nameless group, and the renderer leaves off the heading rather than drawing a
     box around every row in the deck. */
  const GROUP_BY = [["type", "Type"], ["rarity", "Rarity"], ["status", "Status"], ["none", "None"]];
  /* Sorting happens inside each group, never across them, so choosing a sort never
     silently undoes the grouping. Deck order is kept as the default because it is the
     order the plan was written in, and losing it would leave no way back. */
  const SORT_BY = [["", "Deck order"], ["name", "Name A–Z"], ["name-desc", "Name Z–A"],
                   ["cost-desc", "Cost high–low"], ["cost", "Cost low–high"]];
  function sortSlots(ctx, rows, sortBy) {
    if (!sortBy) return rows;
    const name = (s) => face((s.pick && s.pick.name) || s.shellName || "").toLowerCase();
    // An empty slot has no card and so no cost; it sorts to the end either way rather
    // than pretending to be free.
    const cost = (s) => (s.pick ? costOf(ctx, s.pick).value * Math.max(1, Number(s.pick.quantity) || 1) : -1);
    const out = rows.slice();
    if (sortBy === "name") out.sort((a, b) => name(a).localeCompare(name(b)));
    else if (sortBy === "name-desc") out.sort((a, b) => name(b).localeCompare(name(a)));
    else if (sortBy === "cost") out.sort((a, b) => cost(a) - cost(b) || name(a).localeCompare(name(b)));
    else if (sortBy === "cost-desc") out.sort((a, b) => cost(b) - cost(a) || name(a).localeCompare(name(b)));
    return out;
  }
  const RARITY_LABEL = {M: "Mythic", R: "Rare", S: "Special", B: "Bonus", U: "Uncommon", C: "Common"};
  const RARITY_ORDER = ["M", "R", "S", "B", "U", "C"];

  function groupSlots(slots, groupBy, ctx, deckId) {
    if (!slots.length) return [];
    if (groupBy === "none") return [[null, slots]];
    const by = new Map();
    const push = (k, s) => { if (!by.has(k)) by.set(k, []); by.get(k).push(s); };
    if (groupBy === "rarity") {
      slots.forEach((s) => push(s.pick ? rarityKey(ctx, s.pick.name) : "C", s));
      return RARITY_ORDER.filter((k) => by.has(k)).map((k) => [RARITY_LABEL[k], by.get(k)]);
    }
    if (groupBy === "status") {
      slots.forEach((s) => push(slotStatus(ctx, s, deckId), s));
      return STATUS_ORDER.filter((k) => by.has(k)).map((k) => [STATUS_LABEL[k], by.get(k)]);
    }
    slots.forEach((s) => push(s.type, s));
    return Slot.TYPE_ORDER.filter((t) => by.has(t)).map((t) => [t, by.get(t)]);
  }

  /**
   * Buckets are mutually exclusive and sum to the card count, so the header can be
   * checked by eye. Sleeved and to-buy are NOT complements: a card can be ordered
   * (paid for, in transit, unsleevable) or owned but sitting elsewhere, and leaving
   * those out is what makes "100 - 77 sleeved" fail to equal "22 to buy".
   */
  function totals(ctx, slots, deckId) {
    const t = {cards: 0, active: 0, ordered: 0, owned: 0, buy: 0, buyValue: 0, holes: 0,
               claimed: 0, activeLands: 0, activeOther: 0};
    slots.forEach((s) => {
      if (!s.pick) { t.holes += 1; return; }
      const qty = s.pick.quantity;
      t.cards += qty;
      const loc = locationOf(ctx, s.pick.name, qty, deckId, s.slotId);
      /* Lands are split out of what is IN THE BOX, not out of the deck. "35/100 cards in
         the box" beside "36 lands" invited the obvious question -- 36 of what? -- because
         one number was about the box and the other about the whole deck. These two add up
         to the 35. Counted by the card in the slot, not by the slot: identity is anchored
         to the shell so rows stay put when the rung changes, which leaves land slots
         holding creatures and enchantment slots holding lands. */
      if (loc.kind === "active") {
        if (cardTypeOf(ctx, s.pick.name) === "Land") t.activeLands += qty;
        else t.activeOther += qty;
      }
      /* Four buckets, and every one of them is about the CARD: is it in this box, held
         somewhere else, in the post, or still to be bought. They are mutually exclusive
         and sum to the card count, so the line can be checked by eye.

         Assignment deliberately does not get a bucket of its own. It had one, and once
         every slot was ticked that bucket swallowed the other three -- a deck with
         fifty-seven cards in the post and two left to buy reported "0 to buy $0.00",
         which reads as nothing outstanding when the truth is fifty-nine cards short.
         What ticking does is already visible here: an owned card moves between "in the
         box" and "owned, not in this box". For a card you do not have yet, the tick
         changes the row's label and the claim count in the header, not where the card
         is, because a tick cannot make a card arrive. */
      if (loc.kind === "active") t.active += qty;
      else if (loc.kind === "ordered") t.ordered += qty;
      else if (loc.kind === "buy") { t.buy += qty; t.buyValue += (s.pick.price || 0) * qty; }
      else t.owned += qty;   // in hand, but in another box or loose
      // What the deck has claimed, counted alongside rather than inside the buckets, so
      // ticking any row -- including one you cannot hold yet -- still moves a number.
      if (loc.assigned) t.claimed += qty;
    });
    return t;
  }

  function render(host, ctx) {
    if (!host) return;
    const deckId = ctx.deckId;
    const slots = ctx.slots;
    const t = totals(ctx, slots, deckId);
    // The tally above counts the whole deck; the list below shows what the filter left.
    const visible = slots.filter((slot) => slotMatches(ctx, slot, deckId, ctx.filters || {}));
    const open = ctx.openSlot || null;
    host.innerHTML = `
      <div class="dp-head">
        <div class="dp-head-top">
          <div><h2>${esc(ctx.deckTitle)}</h2>
          <p class="dp-sub">${esc(ctx.commander || "")}${ctx.colors ? " · " + esc(ctx.colors) : ""}${
            ctx.variantId ? " · variant " + esc(ctx.variantId) : ""}</p></div>
        </div>
        <div class="dp-stats-row">
          <!-- Cards, not rows. Eighty-five rows hold a hundred cards because the basics
               collapse into one row each, so "85/85 slots filled" answered a question
               nobody asked and hid the one that matters: how much of this deck is
               actually sleeved. -->
          <span class="dp-stat${t.active === t.cards && t.cards ? " is-ok" : " is-warn"}"><b class="dp-num">${t.active}/${t.cards}</b> cards in the box${
            t.holes ? ` · ${plural(t.holes, "slot")} still to fill` : ""}</span>
          <span class="dp-stat"><b class="dp-num">${t.activeLands}</b> lands</span>
          <span class="dp-stat"><b class="dp-num">${t.activeOther}</b> non-lands</span>
          <span class="dp-stat"><b class="dp-num">${t.claimed}/${t.cards + t.holes}</b> claimed</span>
        </div>
        <div class="dp-tally" role="group" aria-label="Where all ${t.cards + t.holes} cards are">
          <span class="dp-tally-t"><b class="dp-num">${t.cards + t.holes}</b> cards</span><span class="dp-tally-op">=</span>
          <span class="dp-tally-b is-deck"><b class="dp-num">${t.active}</b> in the box</span>
          ${t.owned ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-bench"><b class="dp-num">${t.owned}</b> owned, not in this box</span>` : ""}
          ${t.ordered ? `<span class="dp-tally-op">+</span><span class="dp-tally-b is-ordered"><b class="dp-num">${t.ordered}</b> ordered, not here yet</span>` : ""}
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
        <!-- Every box at once. Deselect is what was asked for; select is here because a
             one-way door that costs eighty-five clicks to walk back is not a control, it
             is a trap. Neither touches the selection -- only which slots are claimed. -->
        <div class="dp-claim" role="group" aria-label="Claim or release every slot">
          <span class="dp-rank-lab">All boxes</span>
          <button type="button" class="dp-rank-b" data-dp-claim="all"
            ${t.claimed === t.cards + t.holes ? "disabled" : ""}>Select all</button>
          <button type="button" class="dp-rank-b" data-dp-claim="none"
            ${t.claimed ? "" : "disabled"}>Deselect all</button>
        </div>
      </div>
      ${readyMarkup(ctx, slots)}
      ${filterMarkup(ctx, slots, visible.length)}
      ${visible.length ? "" : '<p class="dp-empty">No slot in this deck matches that.</p>'}
      ${groupSlots(visible, (ctx.filters || {}).groupBy || "type", ctx, deckId).map(([label, rows]) => {
        const body = sortSlots(ctx, rows, (ctx.filters || {}).sortBy || "")
          .map((s) => slotMarkup(ctx, s, deckId, open)).join("");
        // Group by None: the rows are the list, with nothing to collapse them into.
        if (!label) return `<section class="dp-grp" data-open="1"><div class="dp-grp-body">${body}</div></section>`;
        const isOpen = (ctx.openGroups || {})[label] !== false;
        const buys = rows.filter((s) => s.pick && locationOf(ctx, s.pick.name, s.pick.quantity, deckId).kind === "buy").length;
        const qty = rows.reduce((n, s) => n + (s.pick ? s.pick.quantity : 0), 0);
        return `<section class="dp-grp" data-open="${isOpen ? 1 : 0}">
          <button class="dp-grp-h" data-dp-grp="${esc(label)}" aria-expanded="${isOpen}">
            <span class="dp-car">▶</span><span class="dp-grp-nm">${esc(label)}</span>
            <span class="dp-grp-ct">${plural(qty, "card")}${buys ? " · " + buys + " to buy" : ""}</span>
          </button>
          <div class="dp-grp-body">${body}</div>
        </section>`;
      }).join("")}`;
  }

  return {render, previewMarkup, locationOf, groupSlots, totals, RARITY_KEY};
});
