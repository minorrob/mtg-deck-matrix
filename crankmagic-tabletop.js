/* THE TABLETOP: the collection as piles on a table (docs/crankmagic-tabletop-plan.md).
 *
 * The Cards page has a list and a sheet; this is the view where the cards are cards. Every
 * pile is a query the model already answers: the status piles down front are the model's
 * own status vocabulary (M.STATUS) in its order, the Bench is the rail along the back, and
 * the group piles behind the status piles are one grouping at a time -- type, colour, deck,
 * collection group, mechanic, role, Primary Purpose, mana value, price band -- the same
 * readers the list groups by (crankmagic-groupings.js) plus four the table adds.
 *
 * TWO HALVES. `table(rows, options)` is PURE: it takes the projection rows the Cards page
 * already builds (status on each, filters applied by the caller) and returns the piles with
 * their rows and counts, so tests/crankmagic-tabletop.mjs can hold the piles to the list.
 * `mount(host, model, hooks, ui)` draws the mat: the slate, the dot grid, the ledge, the slots,
 * the placards -- the agreed mock-up (docs/mockups/tabletop-piles.html) -- and, from TB2, a
 * pile laid out in rows and columns with pages and a card size, ticks and a selection that
 * stands on the centre of the mat once the rest recombine (`pileOrder`, `layout` are pure);
 * from TB3 the selection drags onto a pile under the drop-target contract (`accepts`, pure),
 * and the Move to… button lists the piles for a phone.
 *
 * Ghost cards are rows that are not copies yet -- ordered, to buy, a draft list -- drawn as
 * dashed outlines, never counted as held. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankTabletop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const G = () => (typeof globalThis !== "undefined" && globalThis.CrankGroupings) || null;
  const R = () => (typeof globalThis !== "undefined" && globalThis.CrankRules) || null;
  const CL = () => (typeof globalThis !== "undefined" && globalThis.MtgCardClassify) || null;
  const BENCH = "Bench";
  const GHOST = new Set(["Ordered", "Watched", "To buy", "Draft list", "Suggestion", "Planned"]);
  /* The Card type piles are the eight primary types, a reader's order: an Artifact Creature
     is on the Creature pile, a Legendary Land on the Land pile. The list groups by the whole
     type line (thirty bands on the live library); a table has room for eight piles. */
  const TYPE_ORDER = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"];
  function primaryType(typeLine) {
    const front = String(typeLine || "").split("\u2014")[0];
    if (/\bCreature\b/.test(front)) return "Creature";
    if (/\bLand\b/.test(front)) return "Land";
    for (const ty of TYPE_ORDER) if (front.includes(ty)) return ty;
    const rest = front.replace(/\b(Legendary|Basic|Snow|Kindred|World|Token|Ongoing)\b/g, "").trim();
    return rest || "No card type";
  }

  /* The groupings the dropdown offers: the list's shared five, then the table's own. */
  const GROUPINGS = [
    ["type", "Card type"], ["color", "Color"], ["deck", "Deck"], ["groups", "Collection group"],
    ["mechanic", "Mechanic"], ["role", "Role"], ["purpose", "Primary Purpose"], ["mv", "Mana value"], ["price", "Price band"]
  ];
  const isGhost = (r) => GHOST.has(r.status);

  /* One row's band under a grouping. The shared keys go through the groupings module so the
     table and the list agree word for word; the table's own readers live here. */
  function bandOf(r, key, value) {
    const c = r.card || {};
    const g = G();
    if (key === "type") return primaryType(c.typeLine);
    if (key === "color" || key === "deck" || key === "groups") return g ? g.label(r, key, value) : value(r, key);
    if (key === "mechanic") return (c.mechanics && c.mechanics[0]) || (c.keywords && c.keywords[0]) || "No mechanic";
    if (key === "role") return (c.roles && c.roles.find((x) => !["creatures", "lands", "artifacts", "enchantments", "instants", "sorceries", "planeswalkers"].includes(x))) || "No role";
    if (key === "purpose") { const cl = CL(); const p = cl && cl.purposeOf ? cl.purposeOf(c) : null; return p && p.label ? p.label : "No purpose read"; }
    if (key === "mv") { const mv = Number(c.manaValue); return Number.isFinite(mv) ? (mv >= 7 ? "7+" : String(mv)) : "No cost"; }
    if (key === "price") { const r2 = R(); if (!r2) return "Unpriced"; const p = Number(c.price); if (!Number.isFinite(p) || p <= 0) return "Unpriced"; const band = r2.BANDS.find(([id]) => id === r2.bandOf(p)); return band ? band[1] : "Unpriced"; }
    return value(r, key);
  }
  /* A sort key for the band, so piles come out in a reader's order: statuses in the model's
     order, colours in WUBRG, mana values numerically, price bands cheapest first, the rest by
     name with "No …" last. */
  function bandOrder(key, band, statusOrder) {
    const g = G();
    if (key === "type") { const at = TYPE_ORDER.indexOf(band); return String(at < 0 ? TYPE_ORDER.length : at).padStart(2, "0"); }
    if (key === "color" && g) { const at = g.COLOR_PILE.indexOf(band); return String(at < 0 ? g.COLOR_PILE.length : at).padStart(2, "0"); }
    if (key === "mv") return band === "7+" ? "07" : band === "No cost" ? "99" : String(Number(band)).padStart(2, "0");
    if (key === "price") { const r2 = R(); const at = r2 ? r2.BANDS.findIndex(([, l]) => l === band) : -1; return String(at < 0 ? 9 : at); }
    if (/^No /.test(band)) return "￿" + band;
    return String(band);
  }

  /* THE TABLE. rows: projection rows with `status` (the caller reads M.statusOf and filters).
     options.groupBy: a GROUPINGS key; options.value(row, key): the list's column reader;
     options.statuses: M.STATUS; options.statusOrder: M.statusOrder. */
  function table(rows, options = {}) {
    const statuses = options.statuses || [];
    const value = options.value || ((r, k) => (r.card ? r.card[k] : undefined));
    const groupBy = options.groupBy && GROUPINGS.some(([k]) => k === options.groupBy) ? options.groupBy : "type";
    const byStatus = new Map();
    for (const r of rows || []) { const s = r.status || "Unassigned"; if (!byStatus.has(s)) byStatus.set(s, []); byStatus.get(s).push(r); }
    const count = (list) => list.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
    const bench = byStatus.get(BENCH) || [];
    const order = statuses.length ? statuses.map((s) => s.label) : [...byStatus.keys()];
    const statusPiles = order.filter((label) => label !== BENCH).map((label) => {
      const list = (byStatus.get(label) || []).slice().sort((a, b) => String(a.card && a.card.name).localeCompare(String(b.card && b.card.name)));
      const meta = statuses.find((s) => s.label === label) || {};
      return {id: "status:" + (meta.id || label), kind: "status", label, tone: meta.tone || "", rows: list, count: count(list), ghost: GHOST.has(label), top: list[0] || null};
    });
    for (const [label, list] of byStatus) if (label !== BENCH && !statusPiles.some((p) => p.label === label)) statusPiles.push({id: "status:" + label, kind: "status", label, tone: "", rows: list, count: count(list), ghost: GHOST.has(label), top: list[0] || null});
    const groups = new Map();
    const none = "No " + GROUPINGS.find(([k]) => k === groupBy)[1].toLowerCase();
    for (const r of rows || []) { let band = bandOf(r, groupBy, value); if (band === undefined || band === null || String(band).trim() === "") band = none; if (!groups.has(band)) groups.set(band, []); groups.get(band).push(r); }
    let groupPiles = [...groups.entries()].map(([band, list]) => ({id: "group:" + groupBy + ":" + band, kind: "group", key: groupBy, label: band, rows: list, count: count(list), ghosts: list.filter(isGhost).length, top: list[0] || null, order: bandOrder(groupBy, band, options.statusOrder)}))
      .sort((a, b) => a.order.localeCompare(b.order) || a.label.localeCompare(b.label));
    /* A table has room for so many piles. Past options.maxGroupPiles the smallest bands fold
       into one Other pile at the end, which says which bands it holds; every copy stays on
       exactly one pile. Mechanic and role can run to dozens of bands on a real library. */
    const max = Number(options.maxGroupPiles) || 0;
    if (max >= 2 && groupPiles.length > max) {
      const kept = new Set(groupPiles.slice().sort((a, b) => b.count - a.count || a.order.localeCompare(b.order)).slice(0, max - 1).map((p) => p.label));
      const rest = groupPiles.filter((p) => !kept.has(p.label)), list = rest.flatMap((p) => p.rows);
      groupPiles = [...groupPiles.filter((p) => kept.has(p.label)), {id: "group:" + groupBy + ":__other", kind: "group", key: groupBy, label: "Other", rows: list, count: count(list), ghosts: list.filter(isGhost).length, top: list[0] || null, order: "\uffff\uffff", folded: rest.length, bands: rest.map((p) => p.label)}];
    }
    const benchSorted = bench.slice().sort((a, b) => String(a.card && a.card.name).localeCompare(String(b.card && b.card.name)));
    return {
      groupBy, groupings: GROUPINGS,
      bench: {id: "bench", kind: "bench", label: BENCH, rows: benchSorted, count: count(benchSorted), top: benchSorted[0] || null},
      statusPiles, groupPiles,
      total: count(rows || []), rows: (rows || []).length, ghosts: (rows || []).filter(isGhost).length
    };
  }

  /* ------------------------------------------------------------------ the mat (DOM) */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const cardFace = (row, {ghost = false, cls = "", size = "", tick = false, checked = false, style = "", big = false} = {}) => {
    const c = (row && row.card) || {};
    /* The small print of the picture (Scryfall's 146px) is what a 64px card needs; a card laid
       out large or standing on the stage takes the normal size. */
    const src = c.image ? (big ? String(c.image) : String(c.image).replace("cards.scryfall.io/normal/", "cards.scryfall.io/small/")) : "";
    const art = src ? `--art:url('${esc(src)}');` : "";
    return `<div class="cm-tt-card${ghost ? " is-ghost" : ""}${size ? " is-" + size : ""}${checked ? " is-ticked" : ""}${cls ? " " + cls : ""}" data-record="${esc(row && row.recordId)}" data-n="${esc(c.name || "")}"${(art || style) ? ` style="${art}${style}"` : ""}${tick ? ` data-tt="card" role="button" tabindex="0" aria-label="${esc(c.name || "")}"` : ""}>${tick ? `<span class="cm-tt-tick" data-tt="tick" role="checkbox" aria-checked="${checked ? "true" : "false"}" aria-label="Tick ${esc(c.name || "")}" tabindex="0"></span>` : ""}<span class="cm-tt-name">${esc(c.name || "")}</span></div>`;
  };
  const placard = (label, count, sub) => `<div class="cm-tt-placard"><strong>${esc(label)}</strong> · ${count.toLocaleString()}${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;

  /* How many group piles each arch holds, outer first: a full arch, then one two piles
     narrower inside it, and so on; the sizes sum to n and no pile is on two arches. */
  function arcsOf(n, perArc) {
    const sizes = []; let left = Math.max(0, n | 0);
    while (left > 0) { const size = Math.min(left, Math.max(3, (perArc | 0) - 2 * sizes.length)); sizes.push(size); left -= size; }
    return sizes;
  }

  /* ------------------------------------------------------------------ TB2: lay out, page, select */
  const SIZES = {S: {w: 64, h: 90, gap: 10}, M: {w: 96, h: 134, gap: 12}, L: {w: 140, h: 196, gap: 14}};
  const sizeOf = (s) => (SIZES[s] ? s : "M");
  const mvOf = (r) => { const v = r && r.card ? r.card.manaValue : null; const n = v === null || v === undefined || v === "" ? NaN : Number(v); return Number.isFinite(n) ? n : 99; };
  const nameOf = (r) => String((r && r.card && r.card.name) || "");
  const orderedAt = (r) => String((r && r.order && (r.order.placed || r.order.date || r.order.orderedAt)) || (r && (r.orderedAt || r.createdAt)) || "");
  /* A pile's natural order (plan §2.1): mana value then name; the Bench by name; Ordered by
     the order's date. */
  function pileOrder(pile) {
    const rows = ((pile && pile.rows) || []).slice();
    if (!pile) return rows;
    if (pile.kind === "bench") return rows.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    if (pile.label === "Ordered") return rows.sort((a, b) => orderedAt(a).localeCompare(orderedAt(b)) || nameOf(a).localeCompare(nameOf(b)));
    return rows.sort((a, b) => mvOf(a) - mvOf(b) || nameOf(a).localeCompare(nameOf(b)));
  }
  /* One page of a laid-out pile: as many columns as the width holds at the card size, `rowsFit`
     rows to a page, the page clamped; `label` is the page strip's words. Pure, so the test can
     hold the pages to the pile. */
  function layout(pile, {width = 960, size = "M", page = 0, rowsFit = 3, inset = 16} = {}) {
    const sz = SIZES[sizeOf(size)], rows = pileOrder(pile), total = rows.length, copies = Number(pile && pile.count) || rows.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
    const cols = Math.max(1, Math.floor((width - inset * 2 + sz.gap) / (sz.w + sz.gap)));
    const perPage = cols * Math.max(1, rowsFit | 0), pages = Math.max(1, Math.ceil(total / perPage));
    const p = Math.min(Math.max(0, page | 0), pages - 1), from = p * perPage, to = Math.min(total, from + perPage);
    const cards = rows.slice(from, to).map((row, i) => ({row, x: inset + (i % cols) * (sz.w + sz.gap), y: Math.floor(i / cols) * (sz.h + sz.gap), index: from + i}));
    const lines = Math.max(1, Math.ceil(cards.length / cols));
    return {cards, cols, lines, perPage, pages, page: p, from, to, total, size: sizeOf(size), w: sz.w, h: sz.h, gap: sz.gap, height: lines * (sz.h + sz.gap) - sz.gap,
      copies, label: total ? `${(from + 1).toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}${copies !== total ? ` · ${copies.toLocaleString()} copies` : ""}` : "Nothing on this pile"};
  }
  const findPile = (model, id) => (id === "bench" ? model.bench : [...model.statusPiles, ...model.groupPiles].find((p) => p.id === id) || null);
  const rowsById = (model) => { const m = new Map(); for (const p of [model.bench, ...model.statusPiles]) for (const r of p.rows) m.set(r.recordId, r); return m; };

  /* The recombine (plan §2.2): the cards not selected slide back into their pile, transforms
     only, sixty at most in motion and the rest fading; reduced motion skips it. Resolves when
     the caller may redraw. */
  function recombine(host, keep) {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cards = [...host.querySelectorAll(".cm-tt-grid .cm-tt-card[data-record]")].filter((el) => !keep.has(el.dataset.record));
    const home = host.querySelector(".cm-tt-home");
    if (reduced || !cards.length || !home) return Promise.resolve();
    const h = home.getBoundingClientRect();
    cards.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      el.style.transition = "transform .42s cubic-bezier(.4,0,.2,1), opacity .42s";
      el.style.pointerEvents = "none";
      if (i < 60) el.style.transform = `translate(${Math.round(h.left + h.width / 2 - (r.left + r.width / 2))}px, ${Math.round(h.top + h.height / 2 - (r.top + r.height / 2))}px) scale(.5) rotate(${(i % 2 ? 1 : -1) * 4}deg)`;
      el.style.opacity = i < 60 ? ".12" : "0";
    });
    return new Promise((resolve) => setTimeout(resolve, 470));
  }

  /* ------------------------------------------------------------------ TB3: drag to a pile */
  /* THE DROP-TARGET CONTRACT (plan §4). accepts(pile, rows) says what dropping `rows` on `pile`
     would do -- as an action id the view turns into the model's command, with the words the
     drag's label and the Move to… menu show -- or why the pile is not a target. Pure, so the
     test can hold it to the library's rows. Actions: source:<owned|ordered|watching> (copy
     records change source; a To buy requirement or a draft-list row becomes a copy filed with
     its deck), place (into a physical deck), standin (into a deck as a substitute), bench
     (physically to the Bench), reserve (for a deck), release (the requirement back to To buy),
     group (file into a collection group). A suggestion or a planned card is never a copy here:
     its status is set from its row menu. */
  const isLot = (r) => !!r && r.kind === "lot";
  const isPlan = (r) => !!r && (r.kind === "need" || r.kind === "draft");
  const inBox = (r) => !!(r && r.location && r.location.kind === "deck");
  function accepts(pile, rows) {
    const list = (rows || []).filter(Boolean);
    const no = (why) => ({ok: false, why});
    const yes = (action, label, why = "") => ({ok: true, action, label, why});
    if (!pile) return no("Not a pile.");
    if (!list.length) return no("Nothing is selected.");
    const lots = list.filter(isLot), plans = list.filter(isPlan), others = list.length - lots.length - plans.length;
    const owned = lots.filter((r) => r.source === "owned");
    const NOT_COPY = "A suggestion or a planned card is not a copy; set its status from its row menu.";
    if (pile.kind === "bench" || pile.label === BENCH) {
      if (others) return no(NOT_COPY);
      if (owned.length === lots.length && !plans.length) return yes("bench", "Move physically to the Bench", owned.some(inBox) ? "Takes a copy out of its physical deck; asks first." : "Records the Bench as where the copies are; reservations are untouched.");
      return yes("source:owned", "Record as owned copies on the Bench", "An ordered or watched copy becomes owned; a To buy requirement or a draft-list row becomes an owned copy filed with its deck.");
    }
    if (pile.kind === "status") {
      switch (pile.label) {
        case "Physical deck":
          if (others || plans.length || lots.some((r) => r.source !== "owned")) return no("Only an owned copy goes into a physical deck; drop it on the Bench first to record it as owned.");
          return yes("place", "Put in a physical deck", "Asks which deck; a copy the list does not call for is refused unless substitutes are allowed.");
        case "Substitute":
          if (others || plans.length || lots.some((r) => r.source !== "owned")) return no("Only an owned copy can stand in for another card.");
          return yes("standin", "Put in a physical deck as a substitute", "Asks which deck; goes in without a reservation, and Ready to add asks for it back when the real card is ready.");
        case "Reserved":
          if (others || plans.length || lots.some((r) => r.source === "watching")) return no("Only an owned or ordered copy can be reserved for a deck.");
          return yes("reserve", "Reserve for a deck", "Asks which deck; only a deck whose list calls for the card and still lacks it.");
        case "Ordered":
          if (others) return no(NOT_COPY);
          return yes("source:ordered", "Mark as Ordered", lots.some((r) => r.source === "owned" && (r.allocation || inBox(r))) ? "An owned copy in a box or reserved loses that; asks first." : "A To buy requirement or a draft-list row becomes an ordered copy filed with its deck.");
        case "Watched":
          if (others) return no(NOT_COPY);
          if (plans.some((r) => r.kind === "need")) return no("A To buy requirement cannot be Watched; it is what a deck asks for.");
          return yes("source:watching", "Mark as Watched", "A watched card is one you are considering, not a copy; a reservation is released.");
        case "To buy":
          if (others || plans.length || !lots.length || lots.some((r) => !r.allocation)) return no("To buy is what a deck asks for; only a reserved copy can be released to send its requirement back.");
          return yes("release", "Release the reservation → To buy", "The copy stays owned in the same place; the deck's requirement returns to To buy.");
        default:
          return no(`${pile.label} is a reading of a deck's plan, not a place a card can be put.`);
      }
    }
    if (pile.kind === "group") {
      if (pile.key === "groups") {
        if (pile.folded || /^No /.test(pile.label)) return no("Choose a named group.");
        if (others || plans.length) return no("Only copy records are filed in a group; a plan is filed with its deck.");
        return lots.length ? yes("group", `File in ${pile.label}`, "Nothing leaves a group it is already in.") : no("Nothing here is a copy record.");
      }
      if (pile.key === "deck") {
        if (pile.folded || /^No /.test(pile.label)) return no("Choose a deck pile.");
        if (others || plans.length || !lots.length || lots.some((r) => r.source === "watching")) return no("Only an owned or ordered copy can be reserved for a deck.");
        return yes("reserve", `Reserve for ${pile.label}`, "Only if the deck's list calls for the card and still lacks it.");
      }
      return no(`A ${pile.label} pile is a reading of the card, not a place it can go.`);
    }
    return no("Not a target.");
  }

  /* Draw the table into `host`. The geometry is computed from the host's width. Three states,
     read from `ui`: at rest (TB1: the ledge, the arches, the status row); a pile OPEN (its
     cards in rows and columns on the stage with a page strip, the other group piles as a shelf
     of placards along the back, the status piles still down front); a SELECTION (the chosen
     cards on the centre of the stage, large, with their facts beneath). Clicks reach the
     caller through hooks: onOpen(pileId|null), onPage(n), onSize(S|M|L), onTick(recordId),
     onSelect([recordId]), onClear(), onMenu(recordId, element), onGroupBy(key),
     onDrop(pileId, [recordId]) when the selection is dropped on an accepting pile,
     onMoveTo([recordId], element) for the Move to… button. */
  function mount(host, model, hooks = {}, ui = {}) {
    if (!host) return null;
    const width = Math.max(320, host.clientWidth || 960), narrow = width < 760;
    const PILE_W = 74, PILE_H = 130 /* the stack and its placard */, ROW = 150;
    const openPile = ui.open ? findPile(model, ui.open) : null;
    const selection = ui.selection instanceof Set ? ui.selection : new Set(ui.selection || []);
    const ticked = ui.ticked instanceof Set ? ui.ticked : new Set(ui.ticked || []);
    const byId = selection.size ? rowsById(model) : null;
    const selected = selection.size ? [...selection].map((id) => byId.get(id)).filter(Boolean) : [];
    const mode = selected.length ? "selected" : openPile ? "open" : "rest";
    const homeId = mode === "selected" ? ui.from || ui.open : mode === "open" ? ui.open : null;
    const stackHeight = (n) => Math.min(14, Math.ceil(Math.sqrt(Math.max(0, n))) * 1.5);
    const pile = (p, x, y, kind) => {
      const n = p.count, h = stackHeight(n), isOpen = p.id === homeId;
      const faces = p.top ? cardFace(p.top, {ghost: p.ghost || (kind === "group" && p.rows.length && p.rows.every(isGhost))}) : "";
      const title = p.folded ? `${p.label}: ${p.bands.join(", ")}` : p.label;
      return `<button type="button" class="cm-tt-pile cm-tt-${kind}${n ? "" : " is-empty"}${isOpen ? " is-open cm-tt-home" : ""}" data-tt="open" data-pile="${esc(p.id)}" aria-pressed="${isOpen ? "true" : "false"}" style="left:${x}px;top:${y}px;--stack:${h}px" title="${esc(title)}" aria-label="${esc(title)}, ${n} card${n === 1 ? "" : "s"}"><span class="cm-tt-slot"></span><span class="cm-tt-stack">${faces}</span>${placard(p.label, n, "")}</button>`;
    };
    /* The Bench along the back: a fan of as many cards as the ledge is wide, and a count of
       the rest. */
    const rail = model.bench, railH = narrow ? 112 : 118, benchOpen = homeId === "bench";
    const fanCount = Math.max(0, Math.min(rail.rows.length, narrow ? Math.floor((width - 60) / 24) : Math.floor((width - 220) / 26)));
    const railHTML = `<div class="cm-tt-rail${benchOpen ? " is-open" : ""}"><div class="cm-tt-placard cm-tt-rail-placard"><strong>${esc(rail.label)}</strong> · ${rail.count.toLocaleString()}<small>owned, in no deck</small></div><button type="button" class="cm-tt-fan${benchOpen ? " cm-tt-home" : ""}" data-tt="open" data-pile="bench" aria-pressed="${benchOpen ? "true" : "false"}" aria-label="Bench, ${rail.count} cards">${rail.rows.slice(0, fanCount).map((r) => cardFace(r, {cls: "cm-tt-fanned"})).join("")}${rail.rows.length > fanCount ? `<span class="cm-tt-more">+${(rail.rows.length - fanCount).toLocaleString()}</span>` : ""}</button></div>`;
    const groups = model.groupPiles, gN = groups.length, sts = model.statusPiles, sN = sts.length;
    const perRow = Math.max(3, Math.floor((width - 32) / 96)), span = (width - 32 - PILE_W) / Math.max(1, perRow - 1);
    const groupPick = (top) => `<div class="cm-tt-group-pick" style="top:${top}px"><label>Group piles by <select name="tabletopGroupBy" aria-label="Group piles by">${model.groupings.map(([k, l]) => `<option value="${esc(k)}"${k === model.groupBy ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label></div>`;
    let body = "", height = 0, stageHTML = "";
    if (mode === "rest") {
      let groupHTML = "", statusHTML = "", pickTop;
      if (narrow) {
        /* The phone (plan §3): the status piles first as rows under the ledge, then the grouping
           and its piles; a strip is a grid here, because a grid says how many there are. */
        const statusTop = railH + 24;
        statusHTML = sts.map((p, i) => pile(p, Math.round(16 + (i % perRow) * span), statusTop + Math.floor(i / perRow) * ROW, "status")).join("");
        pickTop = statusTop + Math.ceil(sN / perRow) * ROW + 4;
        const groupTop = pickTop + 48;
        groupHTML = groups.map((p, i) => pile(p, Math.round(16 + (i % perRow) * span), groupTop + Math.floor(i / perRow) * ROW, "group")).join("");
        height = groupTop + Math.ceil(gN / perRow) * ROW + 86;
      } else {
        /* The semicircle: the group piles along an arch whose feet stand beside the status row
           and whose crown is at the back under the grouping control, spaced evenly across the
           chord so no two piles share a column. More piles than one arch holds go on a second
           arch inside the first, and a third inside that. The inside of the arch is the stage
           where a laid-out pile and the selection sit. */
        const GAP = 112, arcTop = 200, cx = width / 2, chord = width - 64 - PILE_W;
        const perArc = Math.max(3, Math.floor(chord / GAP) + 1);
        const arcs = arcsOf(gN, perArc).map((size, k, sizes) => groups.slice(sizes.slice(0, k).reduce((a, b) => a + b, 0), sizes.slice(0, k + 1).reduce((a, b) => a + b, 0)));
        let bottom = arcTop;
        arcs.forEach((list, k) => {
          const rx = Math.max(120, chord / 2 - k * 110), ry = Math.min(200, Math.max(70, rx * .36)), top = arcTop + k * 140, n = list.length;
          list.forEach((p, i) => {
            const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;  /* -1 at the left foot, 0 at the crown, 1 at the right foot */
            const x = cx + u * rx - PILE_W / 2, y = top + ry * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
            bottom = Math.max(bottom, y + PILE_H);
            groupHTML += pile(p, Math.round(x), Math.round(y), "group");
          });
        });
        pickTop = 146;
        const statusTop = Math.round(bottom + 36), sSpan = (width - 32 - PILE_W) / Math.max(1, sN - 1);
        statusHTML = sts.map((p, i) => pile(p, Math.round(16 + i * sSpan), statusTop, "status")).join("");
        height = statusTop + ROW + 44;
      }
      body = groupPick(pickTop) + groupHTML + statusHTML;
    } else {
      /* A pile open, or a selection: the group piles become a shelf of placards along the back
         (the open one lit), the stage takes the middle, the status piles keep the front. */
      const shelfTop = railH + 22;
      const shelfHTML = `<div class="cm-tt-shelf" style="top:${shelfTop}px"><label class="cm-tt-shelf-pick">Group piles by <select name="tabletopGroupBy" aria-label="Group piles by">${model.groupings.map(([k, l]) => `<option value="${esc(k)}"${k === model.groupBy ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>${groups.map((p) => `<button type="button" class="cm-tt-chip${p.id === homeId ? " is-open cm-tt-home" : ""}${p.count ? "" : " is-empty"}" data-tt="open" data-pile="${esc(p.id)}" aria-pressed="${p.id === homeId ? "true" : "false"}" title="${esc(p.folded ? p.label + ": " + p.bands.join(", ") : p.label)}">${esc(p.label)} · ${p.count.toLocaleString()}</button>`).join("")}</div>`;
      const chipRows = Math.max(1, Math.ceil((gN * 132 + 200) / (width - 32)));
      const stageTop = shelfTop + 44 + (chipRows - 1) * 34 + 12;
      let stageH;
      if (mode === "open") {
        const vh = Number(ui.viewportHeight) || 900;
        const sz = SIZES[sizeOf(ui.size)];
        const rowsFit = narrow ? 4 : Math.min(6, Math.max(2, Math.floor((vh - 330) / (sz.h + sz.gap))));
        const l = layout(openPile, {width, size: ui.size, page: ui.page, rowsFit});
        const strip = (pos) => `<div class="cm-tt-strip is-${pos}"><span class="cm-tt-strip-title"><strong>${esc(openPile.label)}</strong> · ${l.label}</span><span class="cm-tt-seg" role="group" aria-label="Card size">${["S", "M", "L"].map((s) => `<button type="button" data-tt="size" data-size="${s}" aria-pressed="${l.size === s ? "true" : "false"}" title="Card size ${s}">${s}</button>`).join("")}</span><span class="cm-tt-pager"><button type="button" data-tt="page" data-page="${l.page - 1}" ${l.page === 0 ? "disabled" : ""} aria-label="Previous page">‹</button><span>Page ${l.page + 1} of ${l.pages}</span><button type="button" data-tt="page" data-page="${l.page + 1}" ${l.page >= l.pages - 1 ? "disabled" : ""} aria-label="Next page">›</button></span>${ticked.size ? `<button type="button" class="cm-tt-primary" data-tt="select-ticked">Select ${ticked.size} ticked</button>` : ""}<button type="button" data-tt="open" data-pile="${esc(openPile.id)}" aria-label="Close ${esc(openPile.label)}">Close</button></div>`;
        const stripH = narrow ? 84 : 44;
        const grid = `<div class="cm-tt-grid" style="top:${stageTop + stripH}px;height:${l.height}px" data-size="${l.size}">${l.cards.map(({row, x, y}) => cardFace(row, {ghost: isGhost(row), size: l.size, tick: true, checked: ticked.has(row.recordId), big: l.size === "L", style: `left:${x}px;top:${y}px;`})).join("") || `<p class="cm-tt-empty">${esc(l.label)}</p>`}</div>`;
        stageHTML = `<div class="cm-tt-stage-strip" style="top:${stageTop}px">${strip("top")}</div>${grid}` + (narrow && l.pages > 1 ? `<div class="cm-tt-stage-strip" style="top:${stageTop + stripH + l.height + 8}px">${strip("bottom")}</div>` : "");
        stageH = stripH + Math.max(l.height, 60) + (narrow && l.pages > 1 ? stripH + 8 : 0);
      } else {
        /* The selection (plan §2.2): on the centre of the mat, fanned if more than one, large,
           with name, status, price and deck beneath. */
        const L = SIZES.L, n = selected.length, step = Math.min(L.w * .72, Math.max(28, (width - 64 - L.w) / Math.max(1, n - 1)));
        const fanW = L.w + step * (n - 1), x0 = Math.max(16, (width - fanW) / 2);
        const say = hooks.describe || ((r) => ({status: r.status || "", price: r.card && r.card.price != null ? "$" + Number(r.card.price).toFixed(2) : "", deck: ""}));
        const fan = selected.map((r, i) => { const d = say(r) || {}; return cardFace(r, {ghost: isGhost(r), size: "L", big: true, cls: "cm-tt-chosen", style: `left:${Math.round(x0 + i * step)}px;top:${Math.round(Math.abs(i - (n - 1) / 2) * 6)}px;transform:rotate(${((i - (n - 1) / 2) * 3).toFixed(1)}deg);z-index:${i + 1};`}) + ""; }).join("");
        const captions = `<ul class="cm-tt-captions">${selected.map((r) => { const d = say(r) || {}; return `<li><strong>${esc(nameOf(r))}</strong>${d.status ? ` <span class="cm-tt-pill${isGhost(r) ? " is-ghost" : ""}">${esc(d.status)}</span>` : ""}${d.price ? ` <span>${esc(d.price)}</span>` : ""}${d.deck ? ` <span class="cm-tt-muted">${esc(d.deck)}</span>` : ""}${(Number(r.quantity) || 1) > 1 ? ` <span class="cm-tt-muted">×${r.quantity}</span>` : ""}</li>`; }).join("")}</ul>`;
        const from = homeId ? findPile(model, homeId) : null;
        const capH = Math.min(6, n) * 24 + 16;
        stageHTML = `<div class="cm-tt-stage" style="top:${stageTop}px;height:${L.h + 30 + capH + 48}px"><div class="cm-tt-fanL" style="height:${L.h + 24}px">${fan}</div>${captions}<div class="cm-tt-stage-actions"><span class="cm-tt-muted">${n} selected · drag onto a pile, or</span><button type="button" data-tt="moveto" class="cm-tt-primary">Move to…</button>${from ? `<button type="button" data-tt="back" data-pile="${esc(from.id)}">Back to ${esc(from.label)}</button>` : ""}<button type="button" data-tt="clear">Clear selection</button></div></div>`;
        stageH = L.h + 30 + capH + 48;
      }
      const statusTop = stageTop + stageH + 34, sSpan = narrow ? span : (width - 32 - PILE_W) / Math.max(1, sN - 1);
      const statusHTML = narrow ? sts.map((p, i) => pile(p, Math.round(16 + (i % perRow) * span), statusTop + Math.floor(i / perRow) * ROW, "status")).join("") : sts.map((p, i) => pile(p, Math.round(16 + i * sSpan), statusTop, "status")).join("");
      height = statusTop + (narrow ? Math.ceil(sN / perRow) : 1) * ROW + (narrow ? 86 : 44);
      body = shelfHTML + stageHTML + statusHTML;
    }
    const legend = `${model.total.toLocaleString()} cards on the table · ${model.ghosts.toLocaleString()} ghost${model.ghosts === 1 ? "" : "s"} (ordered, to buy, a draft list — not held) · ${sN} status piles · ${gN} ${esc(model.groupings.find(([k]) => k === model.groupBy)[1].toLowerCase())} piles`;
    host.innerHTML = `<div class="cm-tt-mat is-${mode}" tabindex="-1" style="height:${height}px">${railHTML}${body}<div class="cm-tt-legend">${legend}</div></div>`;
    /* Clicks, keys and the context menu, delegated once per draw. */
    const sel = host.querySelector("select[name=tabletopGroupBy]"); if (sel && hooks.onGroupBy) sel.addEventListener("change", () => hooks.onGroupBy(sel.value));
    host.onclick = (ev) => {
      const t = ev.target.closest("[data-tt]");
      if (!t) { if (mode !== "rest" && ev.target.closest(".cm-tt-mat") && !ev.target.closest("button, select, label, .cm-tt-card, .cm-tt-strip, .cm-tt-stage")) hooks.onClear && hooks.onClear(); return; }
      const kind = t.dataset.tt;
      if (kind === "open") { hooks.onOpen && hooks.onOpen(t.dataset.pile === homeId && mode !== "selected" ? null : t.dataset.pile); }
      else if (kind === "back") { hooks.onOpen && hooks.onOpen(t.dataset.pile); }
      else if (kind === "page") { hooks.onPage && hooks.onPage(Number(t.dataset.page)); }
      else if (kind === "size") { hooks.onSize && hooks.onSize(t.dataset.size); }
      else if (kind === "tick") { ev.stopPropagation(); hooks.onTick && hooks.onTick(t.closest(".cm-tt-card").dataset.record); }
      else if (kind === "card") { const id = t.dataset.record; if (ev.shiftKey) { hooks.onTick && hooks.onTick(id); return; } const ids = new Set(ticked); ids.add(id); recombine(host, ids).then(() => hooks.onSelect && hooks.onSelect([...ids])); }
      else if (kind === "select-ticked") { const ids = new Set(ticked); recombine(host, ids).then(() => hooks.onSelect && hooks.onSelect([...ids])); }
      else if (kind === "clear") { hooks.onClear && hooks.onClear(); }
      else if (kind === "moveto") { hooks.onMoveTo && hooks.onMoveTo(selected.map((r) => r.recordId), t); }
    };
    /* DRAG THE SELECTION (plan §2.3). Pointer down on the fan and a small badge follows the
       pointer; the pile under it lights as a target or a refusal with the contract's words;
       up on a target hands the drop to the caller, anywhere else the selection stays. Pointer
       events, so a mouse, a pen and a finger all work; a touch that has not moved eight
       pixels is a tap. */
    if (mode === "selected" && hooks.onDrop) {
      const fan = host.querySelector(".cm-tt-fanL"); let drag = null;
      const clearMarks = () => host.querySelectorAll(".is-target, .is-refused").forEach((el) => el.classList.remove("is-target", "is-refused"));
      fan.addEventListener("pointerdown", (ev) => {
        if ((ev.button !== undefined && ev.button !== 0) || !ev.target.closest(".cm-tt-card")) return;
        ev.preventDefault(); try { fan.setPointerCapture(ev.pointerId); } catch (e) { /* capture is a courtesy */ }
        drag = {id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, el: null, over: null, ok: false, moved: false};
      });
      fan.addEventListener("pointermove", (ev) => {
        if (!drag || ev.pointerId !== drag.id) return;
        if (!drag.moved) {
          if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 8) return;
          drag.moved = true; host.classList.add("is-dragging");
          drag.el = document.createElement("div"); drag.el.className = "cm-tt-drag"; drag.el.innerHTML = `<span class="cm-tt-drag-count">${selected.length}</span><span class="cm-tt-drag-say"></span>`; document.body.append(drag.el);
        }
        drag.el.style.left = ev.clientX + "px"; drag.el.style.top = ev.clientY + "px";
        const under = document.elementFromPoint(ev.clientX, ev.clientY), pileEl = under && under.closest("[data-tt=open][data-pile]");
        const id = pileEl ? pileEl.dataset.pile : null;
        if (id !== drag.over) {
          clearMarks(); drag.over = id; drag.ok = false;
          const say = drag.el.querySelector(".cm-tt-drag-say");
          if (pileEl) { const a = accepts(findPile(model, id), selected); pileEl.classList.add(a.ok ? "is-target" : "is-refused"); say.textContent = a.ok ? a.label : a.why; say.className = "cm-tt-drag-say " + (a.ok ? "is-ok" : "is-no"); drag.ok = a.ok; }
          else { say.textContent = ""; say.className = "cm-tt-drag-say"; }
        }
      });
      const end = (ev) => {
        if (!drag || ev.pointerId !== drag.id) return;
        const d = drag; drag = null; host.classList.remove("is-dragging"); if (d.el) d.el.remove(); clearMarks();
        if (d.moved && d.over && d.ok && ev.type === "pointerup") hooks.onDrop(d.over, selected.map((r) => r.recordId));
      };
      fan.addEventListener("pointerup", end); fan.addEventListener("pointercancel", end);
    }
    host.onkeydown = (ev) => {
      if (ev.key === "Escape" && mode !== "rest") { ev.preventDefault(); hooks.onClear && hooks.onClear(); }
      else if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches(".cm-tt-card[data-tt=card], .cm-tt-tick")) { ev.preventDefault(); ev.target.click(); }
    };
    host.oncontextmenu = (ev) => { const c = ev.target.closest(".cm-tt-card[data-record]"); if (c && hooks.onMenu && (mode !== "rest")) { ev.preventDefault(); hooks.onMenu(c.dataset.record, c); } };
    return {width, height, piles: sN + gN + 1, mode};
  }

  return {GROUPINGS, TYPE_ORDER, BENCH, GHOST, SIZES, isGhost, primaryType, bandOf, bandOrder, arcsOf, pileOrder, layout, findPile, accepts, table, mount};
});
