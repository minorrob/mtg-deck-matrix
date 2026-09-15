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
 * and the Move to… button lists the piles for a phone; TB4 adds the keyboard (arrows among
 * the piles and the cards, Space ticks, Enter chooses, PageUp and PageDown turn), the status
 * pile order and the card size as preferences, and a pile on paper (`printSheet`, pure).
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
  /* SHELF MODE'S IMPORT (plan §2.15, PR 4). A card ticked on Discover and sent over arrives as a
     row the library has never seen: no copy, no lot, no deck asking for it. It is a ghost like
     every other not-held row, and it says where it came from rather than pretending to a status. */
  const SENT = "Sent from Discover";
  const GHOST = new Set(["Ordered", "Watched", "To buy", "Draft list", "Suggestion", "Planned", SENT]);
  /* The status piles a card can be dropped on — accepts() below has a case for each. The rest
     (Draft list, Suggestion, Planned, Unassigned) are readings of a deck's plan, not places a
     card can be put; the mat shows those as chips to lay out, not as piles (Rob, 14 September). */
  const TARGET = new Set(["Physical deck", "Substitute", "Reserved", "Ordered", "Watched", "To buy"]);
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
  function table(all, options = {}) {
    const statuses = options.statuses || [];
    const value = options.value || ((r, k) => (r.card ? r.card[k] : undefined));
    const groupBy = options.groupBy && GROUPINGS.some(([k]) => k === options.groupBy) ? options.groupBy : "type";
    /* A CARD ON THE PLAY SPACE IS IN YOUR HAND, so it leaves the shelves and the status piles
       rather than standing in two places at once (plan §2.1). The play space is built from the
       whole table first, and everything it holds comes out of what follows. */
    const playModel = play(all, options.play);
    const rows = playModel && playModel.seats.size ? (all || []).filter((r) => !playModel.seats.has(r.recordId)) : all;
    const byStatus = new Map();
    for (const r of rows || []) { const s = r.status || "Unassigned"; if (!byStatus.has(s)) byStatus.set(s, []); byStatus.get(s).push(r); }
    const count = (list) => list.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
    const bench = byStatus.get(BENCH) || [];
    const order = statuses.length ? statuses.map((s) => s.label) : [...byStatus.keys()];
    const statusPiles = order.filter((label) => label !== BENCH).map((label) => {
      const list = (byStatus.get(label) || []).slice().sort((a, b) => String(a.card && a.card.name).localeCompare(String(b.card && b.card.name)));
      const meta = statuses.find((s) => s.label === label) || {};
      return {id: "status:" + (meta.id || label), kind: "status", label, tone: meta.tone || "", rows: list, count: count(list), ghost: GHOST.has(label), target: TARGET.has(label), top: list[0] || null};
    });
    for (const [label, list] of byStatus) if (label !== BENCH && !statusPiles.some((p) => p.label === label)) statusPiles.push({id: "status:" + label, kind: "status", label, tone: "", rows: list, count: count(list), ghost: GHOST.has(label), target: TARGET.has(label), top: list[0] || null});
    /* options.statusSort: "workflow" (the model's order, the default) or "count" (fullest first,
       the workflow order breaking ties) -- a reader's preference the view remembers. */
    if (options.statusSort === "count") statusPiles.sort((a, b) => b.count - a.count);
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
    /* THE DESTINATIONS SHELF MODE PUTS ALONG THE BOTTOM (plan §2.15): the collection groups that
       exist, and a door to a new one. They are the same kind of object the status band holds --
       a pile with a count and a top card -- so the drag, the keyboard, the lay-out and the print
       need nothing new. Only what a drop MEANS changes, and that is `accepts`'s business.
       `options.play.groupOf(row)` is the caller's answer to "which groups is this row filed in",
       the same shape as `seatOf`: the module lays the band out, the caller knows the library. */
    let shelfPiles = [];
    if (playModel && playModel.mode === "shelf" && playModel.groups.length) {
      const groupOf = typeof (options.play || {}).groupOf === "function" ? options.play.groupOf : () => [];
      const held = new Map(playModel.groups.map((g) => [g.id, []]));
      for (const r of rows || []) for (const id of groupOf(r) || []) if (held.has(id)) held.get(id).push(r);
      shelfPiles = playModel.groups.map((g) => {
        const list = held.get(g.id).sort((a, b) => String(a.card && a.card.name).localeCompare(String(b.card && b.card.name)));
        return {id: "shelf:" + g.id, kind: "shelfgroup", groupId: g.id, label: g.name, rows: list, count: count(list), ghosts: list.filter(isGhost).length, top: list[0] || null, target: true};
      });
      shelfPiles.push({id: "shelf:new", kind: "shelfnew", label: "New group…", rows: [], count: 0, top: null, target: true});
    }
    const benchSorted = bench.slice().sort((a, b) => String(a.card && a.card.name).localeCompare(String(b.card && b.card.name)));
    return {
      groupBy, groupings: GROUPINGS, statusSort: options.statusSort === "count" ? "count" : "workflow",
      bench: {id: "bench", kind: "bench", label: BENCH, rows: benchSorted, count: count(benchSorted), top: benchSorted[0] || null},
      statusPiles, groupPiles, shelfPiles, play: playModel,
      total: count(all || []), rows: (all || []).length, ghosts: (all || []).filter(isGhost).length
    };
  }

  /* ------------------------------------------------------------------ PR 3b: the play space */
  /* THE MIDDLE OF THE TABLE (plan §2.1, §2.3, §2.4, §2.9). A draw pile and up to four trays,
     built the same way every other pile is -- so a click lays one out, a drag drops onto one,
     `accepts` says what a drop would mean, and the keyboard walks them. One table, one kind of
     object, no second implementation.

     `options.play.seatOf(row)` is the caller's answer to "where is this card on the play space",
     and the caller reads it off the sandbox: "hand" for a card in the middle, "tray:1".."tray:4"
     for one in a tray, "" for everything else. A card on the play space is IN YOUR HAND, so it
     comes out of the shelves and the status piles rather than standing in two places at once.

     THE DRAW PILE IS A NUMBER, NOT THREE HUNDRED PICTURES (§2.9): `top` is the six faces the mat
     draws from `at`, the index the arrows step, and `count` is the rest. */
  const TRAYS_MAX = 4;
  const HAND = "In hand";
  const DRAW_FACES = 6;
  function play(rows, spec) {
    if (!spec || typeof spec.seatOf !== "function") return null;
    const trays = Math.max(1, Math.min(TRAYS_MAX, Number(spec.trays) || 1));
    const deck = spec.deck && spec.deck.id ? {id: String(spec.deck.id), name: String(spec.deck.name || "this deck"), groupId: spec.deck.groupId || ""} : null;
    /* THE TABLE'S TWO JOBS (plan §2.15). A deck is picked or it is not, and that one fact is the
       mode: with a deck the destinations are the six statuses and a tray reserves; without one
       the destinations are the collection groups and a tray fills the group it is bound to.
       Everything else -- the zones, the canvas, the draw pile, the arrows, the sandbox, Confirm
       -- is the same object doing the same thing, which is the test of whether the design is one
       table or two. The piles carry the mode because `accepts` is pure and sees only a pile. */
    const mode = deck ? "deck" : "shelf";
    const groups = (spec.groups || []).filter((g) => g && g.id).map((g) => ({id: String(g.id), name: String(g.name || "Group")}));
    const byGroup = new Map(groups.map((g) => [g.id, g]));
    /* Which group each tray is filling, the reader's binding, remembered by the caller. */
    const trayGroups = Array.from({length: trays}, (v, i) => byGroup.get(String((spec.trayGroups || [])[i] || "")) || null);
    const hand = [], inTray = Array.from({length: trays}, () => []), seats = new Map();
    for (const r of rows || []) {
      const seat = String(spec.seatOf(r) || "");
      if (!seat) continue;
      if (seat === "hand") { hand.push(r); seats.set(r.recordId, "hand"); continue; }
      const n = Number(String(seat).split(":")[1]);
      if (!Number.isInteger(n) || n < 1 || n > trays) continue;
      inTray[n - 1].push(r); seats.set(r.recordId, "tray:" + n);
    }
    const byName = (list) => list.slice().sort((a, b) => String(a.card && a.card.name).localeCompare(String(b.card && b.card.name)));
    const copies = (list) => list.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
    const held = byName(hand);
    const at = held.length ? Math.max(0, Math.min(held.length - 1, Number(spec.at) || 0)) : 0;
    /* The faces the mat draws: `at` on top, the five behind it, wrapping, so the arrows step a
       stack rather than paging a list. */
    const faces = held.length ? Array.from({length: Math.min(DRAW_FACES, held.length)}, (v, i) => held[(at + i) % held.length]) : [];
    return {
      deck, mode, groups, trays, trayGroups, seats, at,
      draw: {id: "play:draw", kind: "play", mode, label: HAND, rows: held, count: copies(held), top: faces[0] || null, faces, target: true},
      trayPiles: inTray.map((list, i) => { const sorted = byName(list), g = trayGroups[i]; return {id: "play:tray:" + (i + 1), kind: "tray", mode, tray: i + 1, group: g, label: mode === "shelf" ? (g ? g.name : "Tray " + (i + 1)) : "Tray " + (i + 1), rows: sorted, count: copies(sorted), top: sorted[0] || null, target: true}; }),
      count: copies(held) + inTray.reduce((n, list) => n + copies(list), 0),
    };
  }
  /* Every pile the play space owns, for findPile and the keyboard. */
  const playPiles = (model) => (model && model.play ? [model.play.draw, ...model.play.trayPiles] : []);

  /* ------------------------------------------------------------------ the mat (DOM) */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  /* What a ghost's corner says: its status, shortened where the word is long. */
  const GHOST_TAG = {"Draft list": "Draft", Suggestion: "Suggested"};
  const cardFace = (row, {ghost = false, cls = "", size = "", tick = false, checked = false, style = "", big = false} = {}) => {
    const c = (row && row.card) || {};
    /* The small print of the picture (Scryfall's 146px) is what a 64px card needs; a card laid
       out large or standing on the stage takes the normal size. The picture is the whole card
       (Rob, 14 September): the face is the printed card, the caption under it in a laid-out
       grid is a courtesy, and a card with no picture shows its name in the frame instead. */
    const src = c.image ? (big ? String(c.image) : String(c.image).replace("cards.scryfall.io/normal/", "cards.scryfall.io/small/")) : "";
    const art = src ? `--art:url('${esc(src)}');` : "";
    const tag = ghost ? ` data-ghost="${esc(GHOST_TAG[row && row.status] || (row && row.status) || "Not held")}"` : "";
    return `<div class="cm-tt-card${ghost ? " is-ghost" : ""}${src ? "" : " no-art"}${size ? " is-" + size : ""}${checked ? " is-ticked" : ""}${cls ? " " + cls : ""}" data-record="${esc(row && row.recordId)}" data-n="${esc(c.name || "")}"${tag}${(art || style) ? ` style="${art}${style}"` : ""}${tick ? ` data-tt="card" role="button" tabindex="0" aria-label="${esc(c.name || "")}"` : ""}>${tick ? `<span class="cm-tt-tick" data-tt="tick" role="checkbox" aria-checked="${checked ? "true" : "false"}" aria-label="Tick ${esc(c.name || "")}" tabindex="0"></span>` : ""}<span class="cm-tt-name">${esc(c.name || "")}</span></div>`;
  };
  /* `count === null` prints the name alone: the New group tile is a door, not a pile, and
     "New group… · 0" reads as an empty pile rather than as somewhere to drop a card. */
  const placard = (label, count, sub) => `<div class="cm-tt-placard"><strong>${esc(label)}</strong>${count === null || count === undefined ? "" : ` · ${count.toLocaleString()}`}${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;

  /* How many group piles each arch holds, outer first: a full arch, then one two piles
     narrower inside it, and so on; the sizes sum to n and no pile is on two arches. */
  function arcsOf(n, perArc) {
    const sizes = []; let left = Math.max(0, n | 0);
    while (left > 0) { const size = Math.min(left, Math.max(3, (perArc | 0) - 2 * sizes.length)); sizes.push(size); left -= size; }
    return sizes;
  }

  /* ------------------------------------------------------------------ TB6: the board's three zones */
  /* WHERE THE SOURCE PILES STAND (Rob, 14 September; docs/crankmagic-playspace-plan.md §2.5).
     The group piles are shelves down either side of the table with the play space between them,
     and they are filled a column at a time, alternating: the first column on the left, the second
     on the right, the third on the left again, and so on -- so a grouping with four piles stands
     two and two rather than four deep on one side.

     The sides GROW BY THE COLUMNS THEY NEED and no further. Most groupings make five to eight
     piles, which is one column a side; only Role, Mechanic and Primary Purpose reach for a
     second or a third. Three columns a side costs about 620px, which leaves a 1250px window no
     usable middle, so `columnsFor` is capped by the width as well as by the count, and the tail
     beyond what the shelves hold folds into the last pile the way the model already folds it.

     Pure, so the test can hold the order and the arithmetic without a browser. */
  /* THE CANVAS (Rob, 14 September): four tables to work on, every one drawn in CSS rather than
     fetched — the page's content policy admits no external images, and shipping someone else's
     table art, or the game's own, is a licensing problem rather than a design one. Whatever is
     chosen, the three zones keep their own surfaces on top of it, so a card's contrast never
     depends on the background. */
  const CANVASES = [["slate", "Slate"], ["felt", "Green felt"], ["celestial", "Celestial"], ["parchment", "Parchment"]];
  const canvasOf = (v) => (CANVASES.some(([k]) => k === v) ? v : "slate");

  const SHELF = {pileW: 74, pileH: 150, gutter: 26, minMiddle: 560, maxRows: 4, maxColumns: 3};
  /* How many rows a column holds at this height, and how many columns each side may take at
     this width: never so many that the play space in the middle drops under `minMiddle`. */
  function shelfShape(count, {width = 1200, height = 560, rows = 0} = {}) {
    const perColumn = Math.max(1, Math.min(SHELF.maxRows, rows || Math.max(1, Math.floor(height / SHELF.pileH))));
    const fits = Math.max(0, Math.floor((width - SHELF.minMiddle) / (2 * (SHELF.pileW + SHELF.gutter))));
    const columnsPerSide = Math.max(1, Math.min(SHELF.maxColumns, fits));
    const wanted = Math.ceil(Math.max(0, count) / perColumn);
    const columns = Math.max(1, Math.min(columnsPerSide * 2, wanted));
    return {perColumn, columns, columnsPerSide, left: Math.ceil(columns / 2), right: Math.floor(columns / 2), holds: columns * perColumn};
  }
  /* One seat per pile, in the order the piles come: column 0 left, column 1 right, column 2 left…
     Piles past what the shelves hold get seat `null`, and the caller folds them. */
  function shelfSeats(count, options = {}) {
    const shape = shelfShape(count, options), seats = [];
    for (let i = 0; i < Math.max(0, count); i += 1) {
      const column = Math.floor(i / shape.perColumn);
      if (column >= shape.columns) { seats.push(null); continue; }
      seats.push({side: column % 2 === 0 ? "left" : "right", column: Math.floor(column / 2), row: i % shape.perColumn});
    }
    return {shape, seats};
  }

  /* ------------------------------------------------------------------ TB2: lay out, page, select */
  const SIZES = {S: {w: 64, h: 90, gap: 10, cap: 14}, M: {w: 96, h: 134, gap: 12, cap: 18}, L: {w: 140, h: 196, gap: 14, cap: 20}};
  /* The one card on the stage: the picture at the size the reader chose, up to Scryfall's
     normal print (488 × 680), narrowed to the mat where the mat is narrower. */
  const STAGE = {L: {w: 140, h: 196}, XL: {w: 244, h: 341}, XXL: {w: 366, h: 512}, full: {w: 488, h: 680}};
  const stageOf = (s) => (STAGE[s] ? s : "XL");
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
    const pitch = sz.h + sz.cap + sz.gap;  /* the picture, its caption, the gap */
    const cards = rows.slice(from, to).map((row, i) => ({row, x: inset + (i % cols) * (sz.w + sz.gap), y: Math.floor(i / cols) * pitch, index: from + i}));
    const lines = Math.max(1, Math.ceil(cards.length / cols));
    return {cards, cols, lines, perPage, pages, page: p, from, to, total, size: sizeOf(size), w: sz.w, h: sz.h, gap: sz.gap, cap: sz.cap, height: lines * pitch - sz.gap,
      copies, label: total ? `${(from + 1).toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}${copies !== total ? ` · ${copies.toLocaleString()} copies` : ""}` : "Nothing on this pile"};
  }
  const findPile = (model, id) => (id === "bench" ? model.bench : [...model.statusPiles, ...model.groupPiles, ...(model.shelfPiles || []), ...playPiles(model)].find((p) => p.id === id) || null);
  const rowsById = (model) => { const m = new Map(); for (const p of [model.bench, ...model.statusPiles, ...playPiles(model)]) for (const r of p.rows) m.set(r.recordId, r); return m; };

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
  /* A row sent over from Discover: a card, not a copy. It can be planned into a group and
     nothing else, because every other destination on the table is a claim about a copy. */
  const isCatalog = (r) => !!r && r.kind === "catalog";
  const inBox = (r) => !!(r && r.location && r.location.kind === "deck");
  const shelfWhy = (lots, cats, name) => (lots.length && cats.length
    ? `Your copies are filed in ${name}; the cards you hold no copy of join it as planned entries.`
    : cats.length ? `Planned entries on ${name}. Nothing here says you own a copy.`
      : "Nothing leaves a group it is already in.");
  function accepts(pile, rows) {
    const list = (rows || []).filter(Boolean);
    const no = (why) => ({ok: false, why});
    const yes = (action, label, why = "") => ({ok: true, action, label, why});
    if (!pile) return no("Not a pile.");
    if (!list.length) return no("Nothing is selected.");
    const lots = list.filter(isLot), plans = list.filter(isPlan), cats = list.filter(isCatalog);
    const others = list.length - lots.length - plans.length - cats.length;
    const owned = lots.filter((r) => r.source === "owned");
    const NOT_COPY = "A suggestion or a planned card is not a copy; set its status from its row menu.";
    const NOT_HELD = "A card sent from Discover is not a copy you hold; file it in a collection group and it becomes a planned entry.";
    const NOT_MINE = "Only a card record is filed in a group; a deck's plan is filed with its deck.";
    if (pile.kind === "bench" || pile.label === BENCH) {
      if (others) return no(NOT_COPY);
      if (cats.length) return no(NOT_HELD);
      if (owned.length === lots.length && !plans.length) return yes("bench", "Move physically to the Bench", owned.some(inBox) ? "Takes a copy out of its physical deck; asks first." : "Records the Bench as where the copies are; reservations are untouched.");
      return yes("source:owned", "Record as owned copies on the Bench", "An ordered or watched copy becomes owned; a To buy requirement or a draft-list row becomes an owned copy filed with its deck.");
    }
    if (pile.kind === "status") {
      if (cats.length) return no(NOT_HELD);
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
    /* THE PLAY SPACE'S TWO DESTINATIONS (plan §2.1, §2.3). The middle takes any copy: picking a
       card up is the one gesture that is always allowed, because it commits to nothing. A tray
       takes an owned copy and BUILDS THE LIST, which is why its words say so -- the drag's label
       is the only warning a reader gets before the receipt. */
    if (pile.kind === "play") {
      if (others || plans.length) return no("A suggestion or a planned card is not a copy you can pick up; it is a line on a list.");
      /* SHELF MODE'S MIDDLE STAGES NOTHING (plan §2.15: "a card left in the middle at Confirm
         means nothing — it goes back where it came from"). With no deck there is nothing the
         card is being considered FOR, so lifting it records no move at all: it is view state,
         and "it goes back where it came from" is simply that nothing was ever staged. In deck
         mode the same gesture DOES mean something — Watched for that deck — so there it stays
         a staged move. One gesture, two honest meanings, decided by the one fact that differs. */
      if (pile.mode === "shelf") {
        if (!lots.length && !cats.length) return no("Nothing here is a card you can pick up.");
        return yes("lift", "Pick up — in hand", "Nothing is staged and nothing changes: a card in your hand here means nothing until you put it in a group.");
      }
      if (cats.length) return no(NOT_HELD);
      if (!lots.length) return no("Nothing here is a copy record.");
      if (lots.some((r) => r.source === "watching")) return no("A watched card is one you are considering, not a copy you can pick up.");
      const held = lots.filter((r) => r.allocation || inBox(r)).length;
      return yes("hold", "Pick up — in hand", held ? `Lets go of ${held === lots.length ? "" : held + " "}whatever holds ${held === 1 ? "the copy" : "the copies"} and keeps ${held === 1 ? "it" : "them"} in view for this deck.` : "Keeps the copy in view for this deck. Nothing is reserved and nothing leaves a box.");
    }
    if (pile.kind === "tray") {
      if (others || plans.length) return no("A tray holds cards; a suggestion or a planned card is a line on a list.");
      /* A TRAY IN SHELF MODE IS A GROUP BUCKET (plan §2.15). It fills the group it is bound to,
         which is the same drop the band along the bottom takes -- the tray is only the place you
         pile them up while you decide. Unbound it refuses, because a bucket with no name on it
         cannot say where its cards are going. */
      if (pile.mode === "shelf") {
        if (!pile.group) return no("Choose which group this tray is filling first.");
        if (!lots.length && !cats.length) return no("Nothing here is a card that can go in a group.");
        return yes("shelf", `${pile.group.name} — fill the tray`, shelfWhy(lots, cats, pile.group.name));
      }
      if (cats.length) return no(NOT_HELD);
      if (!lots.length) return no("Nothing here is a copy record.");
      if (lots.some((r) => r.source !== "owned")) return no("A tray reserves a copy you hold; record an ordered card as arrived first.");
      return yes("tray", `${pile.label} — on the list and reserved`, "Adds the card to this deck's list where the list does not name it yet, then reserves your copy for that seat.");
    }
    /* THE BOTTOM BAND IN SHELF MODE (plan §2.15): the collection groups, and a door to a new one.
       One drop can mix copies you hold with cards you do not -- the whole point of sorting the
       shelf against the catalog -- so the action is one word and the caller splits by row: a copy
       is filed, a card is planned. */
    if (pile.kind === "shelfgroup") {
      if (others || plans.length) return no(NOT_MINE);
      if (!lots.length && !cats.length) return no("Nothing here is a card record.");
      return yes("shelf", `File in ${pile.label}`, shelfWhy(lots, cats, pile.label));
    }
    if (pile.kind === "shelfnew") {
      if (others || plans.length) return no(NOT_MINE);
      if (!lots.length && !cats.length) return no("Nothing here is a card record.");
      return yes("shelfnew", "File in a new group…", "Asks for a name and makes the group at once — a group is a fact, not a move — then stages the filings like every other move.");
    }
    if (pile.kind === "group") {
      if (pile.key === "groups") {
        if (pile.folded || /^No /.test(pile.label)) return no("Choose a named group.");
        if (others || plans.length) return no(NOT_MINE);
        if (!lots.length && !cats.length) return no("Nothing here is a card record.");
        return yes(cats.length ? "shelf" : "group", `File in ${pile.label}`, shelfWhy(lots, cats, pile.label));
      }
      if (pile.key === "deck") {
        if (pile.folded || /^No /.test(pile.label)) return no("Choose a deck pile.");
        if (cats.length) return no(NOT_HELD);
        if (others || plans.length || !lots.length || lots.some((r) => r.source === "watching")) return no("Only an owned or ordered copy can be reserved for a deck.");
        return yes("reserve", `Reserve for ${pile.label}`, "Only if the deck's list calls for the card and still lacks it.");
      }
      return no(`A ${pile.label} pile is a reading of the card, not a place it can go.`);
    }
    return no("Not a target.");
  }

  /* ------------------------------------------------------------------ TB4: the print sheet */
  /* A laid-out pile on paper: the whole pile, not the page on screen -- name, type, mana
     value, status, price, deck and copies, in the pile's natural order, with the count and
     the day. Pure HTML; the view puts it on the page for window.print() and takes it away. */
  function printSheet(pile, {describe, now = new Date(), library = ""} = {}) {
    const rows = pileOrder(pile), say = describe || ((r) => ({status: r.status || "", price: "", deck: ""}));
    const copies = rows.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
    const day = now instanceof Date && !isNaN(now) ? now.toISOString().slice(0, 10) : String(now);
    const tr = rows.map((r, i) => { const c = r.card || {}, d = say(r) || {}; return `<tr><td>${i + 1}</td><td>${esc(c.name || "")}</td><td>${esc(c.typeLine || "")}</td><td>${c.manaValue === null || c.manaValue === undefined || c.manaValue === "" ? "" : esc(c.manaValue)}</td><td>${esc(d.status || "")}</td><td>${esc(d.price || "")}</td><td>${esc(d.deck || "")}</td><td>${Number(r.quantity) || 1}</td></tr>`; }).join("");
    return `<section class="cm-tt-printsheet"><h1>${esc(pile ? pile.label : "")}</h1><p>${rows.length.toLocaleString()} card${rows.length === 1 ? "" : "s"} · ${copies.toLocaleString()} cop${copies === 1 ? "y" : "ies"}${library ? ` · ${esc(library)}` : ""} · ${esc(day)}</p><table><thead><tr><th>#</th><th>Card</th><th>Type</th><th>MV</th><th>Status</th><th>Price</th><th>Deck</th><th>Copies</th></tr></thead><tbody>${tr}</tbody></table></section>`;
  }

  /* Draw the table into `host`. The geometry is computed from the host's width. Three states,
     read from `ui`: at rest (TB1: the ledge, the arches, the status row); a pile OPEN (its
     cards in rows and columns on the stage with a page strip, the other group piles as a shelf
     of placards along the back, the status piles still down front); a SELECTION (the chosen
     cards on the centre of the stage, large, with their facts beneath). Clicks reach the
     caller through hooks: onOpen(pileId|null), onPage(n), onSize(S|M|L), onTick(recordId),
     onSelect([recordId]), onClear(), onMenu(recordId, element), onGroupBy(key),
     onDrop(pileId, [recordId]) when the selection is dropped on an accepting pile,
     onMoveTo([recordId], element) for the Move to… button, and for the play space (PR 3b)
     onDrawAt(index), onTrays(1..4) and onRestore([recordId] | null for all). */
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
      const door = p.kind === "shelfnew";
      return `<button type="button" class="cm-tt-pile cm-tt-${kind}${n ? "" : " is-empty"}${isOpen ? " is-open cm-tt-home" : ""}" data-tt="open" data-pile="${esc(p.id)}" aria-pressed="${isOpen ? "true" : "false"}" style="left:${x}px;top:${y}px;--stack:${h}px" title="${esc(door ? "Drop cards here to make a group for them" : title)}" aria-label="${esc(title)}${door ? "" : `, ${n} card${n === 1 ? "" : "s"}`}"><span class="cm-tt-slot">${door ? "<span class=\"cm-tt-newmark\" aria-hidden=\"true\">+</span>" : ""}</span><span class="cm-tt-stack">${faces}</span>${placard(p.label, door ? null : n, "")}</button>`;
    };
    /* The Bench along the back: a fan of as many cards as the ledge is wide, and a count of
       the rest. */
    const rail = model.bench, benchShut = ui.bench === "shut", railH = benchShut ? 46 : narrow ? 112 : 118, benchOpen = homeId === "bench";
    const fanCount = Math.max(0, Math.min(rail.rows.length, narrow ? Math.floor((width - 60) / 24) : Math.floor((width - 220) / 26)));
    /* The ledge folds to its placard on request (Rob, 14 September) and stays folded on this
       device; folded, the Bench is still a pile — the chip lays it out. */
    const fanHTML = benchShut ? `<span class="cm-tt-more">Lay out</span>` : `${rail.rows.slice(0, fanCount).map((r) => cardFace(r, {cls: "cm-tt-fanned"})).join("")}${rail.rows.length > fanCount ? `<span class="cm-tt-more">+${(rail.rows.length - fanCount).toLocaleString()}</span>` : ""}`;
    const railHTML = `<div class="cm-tt-rail${benchOpen ? " is-open" : ""}${benchShut ? " is-shut" : ""}"><div class="cm-tt-placard cm-tt-rail-placard"><strong>${esc(rail.label)}</strong> · ${rail.count.toLocaleString()}<small>owned, in no deck</small></div><button type="button" class="cm-tt-rail-toggle" data-tt="bench-toggle" aria-expanded="${benchShut ? "false" : "true"}" aria-label="${benchShut ? "Show the Bench's cards" : "Hide the Bench's cards"}">${benchShut ? "Show" : "Hide"}</button><button type="button" class="cm-tt-fan${benchOpen ? " cm-tt-home" : ""}" data-tt="open" data-pile="bench" aria-pressed="${benchOpen ? "true" : "false"}" aria-label="Bench, ${rail.count} cards">${fanHTML}</button></div>`;
    const groups = model.groupPiles, gN = groups.length;
    /* THE BAND ALONG THE BOTTOM IS THE MODE (plan §2.15). With a deck picked it is the six
       statuses a card can be put into; with none it is the collection groups and a door to a new
       one, and EVERY status pile that holds something moves up to the line of chips -- still one
       click from being laid out, no longer a place to drop a card, because in shelf mode it is
       not one. Nothing else about the table changes: same zones, same canvas, same middle, same
       Confirm. That is the test of whether this is one table doing two jobs or two tables. */
    const shelf = !!(model.play && model.play.mode === "shelf" && (model.shelfPiles || []).length);
    /* The status piles that take a drop stand as piles; the readings of a plan that hold
       anything are chips on a line under them, to lay out and look at. */
    const sts = shelf ? model.shelfPiles : model.statusPiles.filter((p) => p.target !== false), sN = sts.length;
    const readings = shelf ? model.statusPiles.filter((p) => p.count > 0) : model.statusPiles.filter((p) => p.target === false && p.count > 0);
    const bandKind = (p) => (shelf ? p.kind : "status");
    /* THE READINGS LINE (Rob, 14 September): the Suggestion chip sat 11px under the status
       placards, on a row whose height was budgeted at one line -- a second line, or one more
       reading than the mat is wide, ran past the mat's edge and `overflow:hidden` ate it. So
       the line is measured: the sentence plus every chip over the width it has, and the mat
       grows to whatever that comes to. READ_GAP stands it clear of the placards above. */
    const READ_GAP = 26;
    const readWidth = (shelf ? 480 : 310) + readings.reduce((n, p) => n + Math.min(170, String(p.label).length * 7 + 46) + 8, 0);
    const readLines = readings.length ? Math.max(1, Math.ceil(readWidth / Math.max(240, width - 32))) : 0;
    const readH = readings.length ? readLines * 26 + 14 : 0;
    const readingsHTML = (top) => readings.length ? `<div class="cm-tt-readings" style="top:${top}px"><span>${shelf ? "The statuses — lay one out to look at it. In shelf mode the places to put a card are your groups:" : "Readings of a plan, not places for a card — lay one out to look:"}</span>${readings.map((p) => `<button type="button" class="cm-tt-chip cm-tt-reading${p.id === homeId ? " is-open cm-tt-home" : ""}" data-tt="open" data-pile="${esc(p.id)}" aria-pressed="${p.id === homeId ? "true" : "false"}" aria-label="${esc(p.label)}, ${p.count} card${p.count === 1 ? "" : "s"}">${esc(p.label)} · ${p.count.toLocaleString()}</button>`).join("")}</div>` : "";
    const perRow = Math.max(3, Math.floor((width - 32) / 96)), span = (width - 32 - PILE_W) / Math.max(1, perRow - 1);
    const groupSelect = `<select name="tabletopGroupBy" aria-label="Group piles by">${model.groupings.map(([k, l]) => `<option value="${esc(k)}"${k === model.groupBy ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    /* A grouping's name is a term as well: what "Primary Purpose" or "Price band" means is a
       question a reader has while choosing one, not afterwards. */
    const groupingTerm = () => { const found = model.groupings.find(([k]) => k === model.groupBy); return found ? term(found[1]) : ""; };
    const orderSelect = `<select name="tabletopStatusOrder" aria-label="Status pile order"><option value="workflow"${model.statusSort === "count" ? "" : " selected"}>Workflow order</option><option value="count"${model.statusSort === "count" ? " selected" : ""}>Fullest first</option></select>`;
    /* Every control names a term the glossary defines, so the words on the table can be asked
       about where they are read (Rob, 14 September). `hooks.term(text)` is the caller's glossary;
       without one the label is printed plain. */
    const term = (text) => (hooks.term ? hooks.term(text) : esc(text));
    /* ------------------------------------------------------------ PR 3b: the middle, drawn */
    /* THE DRAW PILE, THE TRAYS AND THE SCOREBOARD (plan §2.1, §2.3, §2.4, §2.9, §2.14). Between
       the shelves, in the space the three zones left for it. The draw pile is the cards in your
       hand: six faces and a count, never three hundred pictures. The arrows UNDER it step the
       stack one card at a time, which is what makes flipping a control a finger can find rather
       than a gesture to discover -- and a click on the pile itself lays it out, the same meaning
       a click has on every other pile of the table.

       The trays are Reserved (§2.3), and their words say what that costs: a tray builds the
       deck's list. The counter beside them is 1-4, because four is as many hands as a table has.

       The scoreboard is the caller's -- the same `readiness` the deck page reads, computed on the
       sandbox's preview, so it shows where the reader WILL be if they confirm rather than where
       they are (§2.14). This module lays it out and colours it; it does not do the arithmetic. */
    const PLAY = {drawW: 96, drawH: 134, trayW: 78, trayH: 110, gap: 12};
    const score = Array.isArray(ui.score) ? ui.score : [];
    function playHTML(x, y, w) {
      const P = model.play;
      if (!P) return {html: "", height: 0};
      const head = `<div class="cm-tt-play-head"><strong>The play space</strong>${P.deck ? `<span>calibrating <b>${esc(P.deck.name)}</b></span>` : shelf ? `<span>sorting the shelf into <b>collection groups</b></span>` : `<span class="cm-tt-muted">no deck picked</span>`}${P.count ? `<button type="button" class="cm-tt-restore-all" data-tt="restore-all">Restore all ${P.count}</button>` : ""}</div>`;
      if (!P.deck && !shelf) {
        const html = `<div class="cm-tt-play" style="left:${x}px;top:${y}px;width:${w}px;height:136px">${head}<p class="cm-tt-play-invite">Pick a deck at the top of the table and the middle becomes its play space: lift cards here to consider them, drop them in a tray to put them on the list, and confirm once. With no deck it sorts the shelf into collection groups instead — make a group on the Cards list and the band along the bottom becomes your groups.</p></div>`;
        return {html, height: 136};
      }
      const at = P.at, n = P.draw.rows.length, on = n ? P.draw.rows[at] : null;
      /* Six faces, the front one last so it sits on top, each stepped back and up a little. */
      const faces = P.draw.faces.map((r, i) => cardFace(r, {cls: "cm-tt-drawn", style: `left:${(P.draw.faces.length - 1 - i) * 7}px;top:${(P.draw.faces.length - 1 - i) * 5}px;z-index:${P.draw.faces.length - i};`})).reverse().join("");
      const drawOpen = homeId === "play:draw";
      const pileBtn = `<button type="button" class="cm-tt-draw${n ? "" : " is-empty"}${drawOpen ? " is-open cm-tt-home" : ""}" data-tt="open" data-pile="play:draw" aria-pressed="${drawOpen ? "true" : "false"}" aria-label="In hand, ${n} card${n === 1 ? "" : "s"}${n ? "; lay them out" : ""}"><span class="cm-tt-slot"></span><span class="cm-tt-draw-stack">${faces || `<span class="cm-tt-draw-empty">Drag a card here to pick it up</span>`}</span></button>`;
      /* The per-card restore arrow (§2.1): the card on top of the stack goes back where it came
         from. It is the arrow, not a menu, because putting one card down is one gesture. */
      const restore = on ? `<button type="button" class="cm-tt-restore" data-tt="restore-one" data-record="${esc(on.recordId)}" title="Put ${esc(nameOf(on))} back where it came from" aria-label="Put ${esc(nameOf(on))} back where it came from">&#8634;</button>` : "";
      const step = (to, label, glyph) => `<button type="button" data-tt="draw-step" data-at="${to}" ${n > 1 ? "" : "disabled"} aria-label="${label}">${glyph}</button>`;
      const arrows = `<div class="cm-tt-draw-step">${step((at - 1 + Math.max(1, n)) % Math.max(1, n), "Previous card in hand", "&#8249;")}<span>${n ? `${esc(nameOf(on))} <small>${at + 1} of ${n}</small>` : "nothing in hand"}</span>${step((at + 1) % Math.max(1, n), "Next card in hand", "&#8250;")}</div>`;
      const trayBtn = (t) => {
        const open = homeId === t.id, top = t.rows[0];
        return `<button type="button" class="cm-tt-tray${t.count ? "" : " is-empty"}${open ? " is-open cm-tt-home" : ""}" data-tt="open" data-pile="${esc(t.id)}" aria-pressed="${open ? "true" : "false"}" aria-label="${esc(t.label)}, ${t.count} card${t.count === 1 ? "" : "s"}"><span class="cm-tt-tray-slot">${top ? cardFace(top, {cls: "cm-tt-trayed"}) : ""}${t.count > 1 ? `<span class="cm-tt-tray-more">+${t.count - 1}</span>` : ""}</span><span class="cm-tt-tray-name">${esc(t.label)}${t.count ? ` · ${t.count}` : ""}</span></button>`;
      };
      /* A TRAY IN SHELF MODE IS BOUND TO A GROUP (plan §2.15: "the trays mean members of a group
         you are assembling"). The binding is the reader's, so it is a select under the tray rather
         than a rule -- four groups side by side is the whole gesture of sorting a shelf. */
      const bindSel = (t) => `<select class="cm-tt-tray-bind" data-tt="tray-group" data-n="${t.tray}" aria-label="Which group tray ${t.tray} is filling"><option value="">Group…</option>${P.groups.map((g) => `<option value="${esc(g.id)}"${t.group && t.group.id === g.id ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select>`;
      const trays = shelf
        ? `<div class="cm-tt-trays is-shelf">${P.trayPiles.map((t) => `<div class="cm-tt-tray-cell">${trayBtn(t)}${bindSel(t)}</div>`).join("")}</div>`
        : `<div class="cm-tt-trays">${P.trayPiles.map(trayBtn).join("")}</div>`;
      const counter = `<div class="cm-tt-tray-count" role="group" aria-label="How many trays"><button type="button" data-tt="trays" data-n="${P.trays - 1}" ${P.trays > 1 ? "" : "disabled"} aria-label="One tray fewer">&#8249;</button><span>${P.trays} tray${P.trays === 1 ? "" : "s"}</span><button type="button" data-tt="trays" data-n="${P.trays + 1}" ${P.trays < TRAYS_MAX ? "" : "disabled"} aria-label="One tray more">&#8250;</button></div>`;
      const board = score.length ? `<div class="cm-tt-score" role="status">${score.map((f) => `<span class="cm-tt-score-fig${f.tone ? " is-" + f.tone : ""}"${f.why ? ` title="${esc(f.why)}"` : ""}><b>${esc(f.value)}</b> ${esc(f.label)}</span>`).join("")}</div>` : "";
      const height = 30 + PLAY.drawH + 34 + PLAY.trayH + 26 + 30 + (board ? 38 : 0) + (shelf ? 36 : 0);
      const html = `<div class="cm-tt-play" style="left:${x}px;top:${y}px;width:${w}px;height:${height}px">${head}<div class="cm-tt-draw-wrap">${pileBtn}${restore}</div>${arrows}${trays}${counter}${board}</div>`;
      return {html, height};
    }
    /* THE PLAY SPACE WHEN THE STAGE HAS THE MIDDLE. A card is dragged from the selection on the
       stage, and the stage stands where the play space stands -- so with a pile laid out or a
       card chosen, the middle's destinations become a row of chips above the status band. Same
       ids, same `accepts`, same drop: the drag can always reach the hand and the trays, which is
       the whole point of picking a card up. */
    function playBar(y, w) {
      const P = model.play;
      /* Not on a phone: the play space is not offered there at all (plan §2.5), so its
         destinations must not appear only because a card happens to be selected. */
      if (!P || narrow || (!P.deck && !shelf)) return {html: "", height: 0};
      const chip = (p, label) => `<button type="button" class="cm-tt-playchip${p.count ? "" : " is-empty"}${p.id === homeId ? " is-open cm-tt-home" : ""}" data-tt="open" data-pile="${esc(p.id)}" aria-pressed="${p.id === homeId ? "true" : "false"}" aria-label="${esc(label)}, ${p.count} card${p.count === 1 ? "" : "s"}">${esc(label)}${p.count ? ` · ${p.count}` : ""}</button>`;
      const board = score.length ? `<span class="cm-tt-score is-bar">${score.map((f) => `<span class="cm-tt-score-fig${f.tone ? " is-" + f.tone : ""}"${f.why ? ` title="${esc(f.why)}"` : ""}><b>${esc(f.value)}</b> ${esc(f.label)}</span>`).join("")}</span>` : "";
      const lines = Math.max(1, Math.ceil((200 + (P.trays + 1) * 110 + score.length * 120) / Math.max(280, w - 24)));
      const height = lines * 34 + 12;
      const html = `<div class="cm-tt-playbar" style="top:${y}px;height:${height}px"><span class="cm-tt-playbar-say">The play space</span>${chip(P.draw, HAND)}${P.trayPiles.map((t) => chip(t, t.label)).join("")}${P.count ? `<button type="button" class="cm-tt-restore-all" data-tt="restore-all">Restore all ${P.count}</button>` : ""}${board}</div>`;
      return {html, height};
    }
    const canvasSelect = `<select name="tabletopCanvas" data-tt="canvas" aria-label="Choose canvas">${CANVASES.map(([k, l]) => `<option value="${k}"${k === canvasOf(ui.canvas) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const groupPick = (top) => `<div class="cm-tt-group-pick" style="top:${top}px"><label>${term("Group piles by")} ${groupSelect}</label><label>${term("Status piles")} ${orderSelect}</label><label>Choose canvas ${canvasSelect}</label></div>`;
    let body = "", height = 0, stageHTML = "";
    if (mode === "rest") {
      let groupHTML = "", statusHTML = "", pickTop;
      if (narrow) {
        /* The phone (plan §3): the status piles first as rows under the ledge, then the grouping
           and its piles; a strip is a grid here, because a grid says how many there are. */
        const statusTop = railH + 24;
        statusHTML = sts.map((p, i) => pile(p, Math.round(16 + (i % perRow) * span), statusTop + Math.floor(i / perRow) * ROW, bandKind(p))).join("") + readingsHTML(statusTop + Math.ceil(sN / perRow) * ROW + READ_GAP);
        pickTop = statusTop + Math.ceil(sN / perRow) * ROW + READ_GAP + readH + 8;
        const groupTop = pickTop + 48;
        groupHTML = groups.map((p, i) => pile(p, Math.round(16 + (i % perRow) * span), groupTop + Math.floor(i / perRow) * ROW, "group")).join("");
        height = groupTop + Math.ceil(gN / perRow) * ROW + 86;
      } else {
        /* THE THREE ZONES (Rob, 14 September; docs/crankmagic-playspace-plan.md §2.11). The group
           piles were an arch across the middle of the mat, which put the sources where the play
           space has to be and made them read as the same kind of object as the destinations along
           the bottom. They are shelves down both sides now -- columns filled left, right, left,
           growing by the columns they need (§2.5) -- with the play space between them and the
           destinations in their own band at the foot. Sources, workspace, destinations: three
           surfaces, three roles, legible before a word is read. */
        pickTop = 146;
        /* The pick row's three labelled selects come to about 740px; where the mat is narrower
           than that they wrap, and the shelves and the play space have to start below however
           many lines that takes -- the same measured-not-assumed rule the readings line follows. */
        const pickLines = Math.max(1, Math.ceil(740 / Math.max(280, width - 32)));
        const shelfTop = 196 + (pickLines - 1) * 34;
        const room = Math.max(300, (Number(ui.viewportHeight) || 900) - 430);
        const {shape, seats} = shelfSeats(gN, {width, height: room});
        const colW = SHELF.pileW + SHELF.gutter;
        const used = (side) => seats.reduce((n, x) => (x && x.side === side ? Math.max(n, x.column + 1) : n), 0);
        const leftW = used("left") * colW, rightW = used("right") * colW;
        groups.forEach((p, i) => {
          const seat = seats[i];
          if (!seat) return;  /* past what the shelves hold; the model has already folded the tail */
          const x = seat.side === "left" ? 16 + seat.column * colW : width - 16 - SHELF.pileW - seat.column * colW;
          groupHTML += pile(p, Math.round(x), shelfTop + seat.row * SHELF.pileH, "group");
        });
        const rows = Math.min(shape.perColumn, Math.max(1, Math.ceil(Math.min(gN, shape.holds) / Math.max(1, shape.columns))));
        const shelfH = Math.max(SHELF.pileH, rows * SHELF.pileH);
        /* The shelves' own surfaces, behind the piles, so each zone says what it is. */
        const zonesHTML = (leftW ? `<div class="cm-tt-zone is-left" style="top:${shelfTop - 16}px;left:6px;width:${leftW + 10}px;height:${shelfH + 12}px" aria-hidden="true"></div>` : "")
          + (rightW ? `<div class="cm-tt-zone is-right" style="top:${shelfTop - 16}px;right:6px;width:${rightW + 10}px;height:${shelfH + 12}px" aria-hidden="true"></div>` : "");
        /* THE MIDDLE IS THE SPACE THE SHELVES LEFT (PR 3b). It stands between the two zones and
           takes whichever is taller for the band below, so the destinations never ride up over
           the trays. */
        const midX = 16 + leftW + (leftW ? 12 : 0), midW = Math.max(300, width - 32 - leftW - rightW - (leftW ? 12 : 0) - (rightW ? 12 : 0));
        const laid = playHTML(midX, shelfTop - 16, midW);
        groupHTML += laid.html;
        const statusTop = Math.round(shelfTop + Math.max(shelfH, laid.height - 16) + 40);
        /* Six statuses fit one row at any width the play space is offered at; a shelf of groups
           does not, so the band wraps and grows rather than squeezing the piles into each other. */
        const bandRows = Math.max(1, Math.ceil(sN / perRow));
        const EDGE = Math.min(96, Math.max(16, Math.round((width - 32 - PILE_W) / 12)));
        const sSpan = bandRows > 1 ? span : (width - 2 * EDGE - PILE_W) / Math.max(1, sN - 1);
        statusHTML = `<div class="cm-tt-band" style="top:${statusTop - 22}px;height:${bandRows * ROW + READ_GAP + readH + 12}px" aria-hidden="true"></div>`
          + sts.map((p, i) => pile(p, bandRows > 1 ? Math.round(16 + (i % perRow) * span) : Math.round(EDGE + i * sSpan), statusTop + (bandRows > 1 ? Math.floor(i / perRow) * ROW : 0), bandKind(p))).join("") + readingsHTML(statusTop + bandRows * ROW + READ_GAP);
        height = statusTop + bandRows * ROW + READ_GAP + readH + 30;
        groupHTML = zonesHTML + groupHTML;
      }
      body = groupPick(pickTop) + groupHTML + statusHTML;
    } else {
      /* A pile open, or a selection: the group piles become a shelf of placards along the back
         (the open one lit), the stage takes the middle, the status piles keep the front. */
      const shelfTop = railH + 22;
      const shelfHTML = `<div class="cm-tt-shelf" style="top:${shelfTop}px"><label class="cm-tt-shelf-pick">Group piles by ${groupSelect}</label>${groups.map((p) => `<button type="button" class="cm-tt-chip${p.id === homeId ? " is-open cm-tt-home" : ""}${p.count ? "" : " is-empty"}" data-tt="open" data-pile="${esc(p.id)}" aria-pressed="${p.id === homeId ? "true" : "false"}" title="${esc(p.folded ? p.label + ": " + p.bands.join(", ") : p.label)}">${esc(p.label)} · ${p.count.toLocaleString()}</button>`).join("")}</div>`;
      const chipRows = Math.max(1, Math.ceil((gN * 132 + 200) / (width - 32)));
      const stageTop = shelfTop + 44 + (chipRows - 1) * 34 + 12;
      let stageH;
      if (mode === "open") {
        const vh = Number(ui.viewportHeight) || 900;
        const sz = SIZES[sizeOf(ui.size)];
        const rowsFit = narrow ? 4 : Math.min(6, Math.max(2, Math.floor((vh - 330) / (sz.h + sz.gap))));
        const l = layout(openPile, {width, size: ui.size, page: ui.page, rowsFit});
        const strip = (pos) => `<div class="cm-tt-strip is-${pos}"><span class="cm-tt-strip-title"><strong>${esc(openPile.label)}</strong> · ${l.label}</span><span class="cm-tt-seg" role="group" aria-label="Card size">${["S", "M", "L"].map((s) => `<button type="button" data-tt="size" data-size="${s}" aria-pressed="${l.size === s ? "true" : "false"}" title="Card size ${s}">${s}</button>`).join("")}</span><span class="cm-tt-pager"><button type="button" data-tt="page" data-page="${l.page - 1}" ${l.page === 0 ? "disabled" : ""} aria-label="Previous page">‹</button><span>Page ${l.page + 1} of ${l.pages}</span><button type="button" data-tt="page" data-page="${l.page + 1}" ${l.page >= l.pages - 1 ? "disabled" : ""} aria-label="Next page">›</button></span>${ticked.size ? `<button type="button" class="cm-tt-primary" data-tt="select-ticked">Select ${ticked.size} ticked</button>` : ""}<button type="button" data-tt="print" data-pile="${esc(openPile.id)}" title="Print the whole pile as a list">Print</button><button type="button" class="cm-tt-back is-strip" data-tt="open" data-pile="${esc(openPile.id)}" title="Back to the table" aria-label="Back to the table from ${esc(openPile.label)}">&#8592;</button></div>`;
        const stripH = narrow ? 84 : 44;
        const grid = `<div class="cm-tt-grid" style="top:${stageTop + stripH}px;height:${l.height}px" data-size="${l.size}" data-cols="${l.cols}">${l.cards.map(({row, x, y}) => cardFace(row, {ghost: isGhost(row), size: l.size, tick: true, checked: ticked.has(row.recordId), big: l.size === "L", style: `left:${x}px;top:${y}px;`})).join("") || `<p class="cm-tt-empty">${esc(l.label)}</p>`}</div>`;
        stageHTML = `<div class="cm-tt-stage-strip" style="top:${stageTop}px">${strip("top")}</div>${grid}` + (narrow && l.pages > 1 ? `<div class="cm-tt-stage-strip" style="top:${stageTop + stripH + l.height + 8}px">${strip("bottom")}</div>` : "");
        stageH = stripH + Math.max(l.height, 60) + (narrow && l.pages > 1 ? stripH + 8 : 0);
      } else if (selected.length === 1) {
        /* ONE CARD ON THE STAGE (Rob, 14 September): the whole picture at the size the reader
           chose, its facts beside it from the same record the inspector reads, and Previous /
           Next through the pile it came from — pick a deck, pick a card, read it, file it, next. */
        const r = selected[0], say = hooks.describe || ((x) => ({status: x.status || "", price: x.card && x.card.price != null ? "$" + Number(x.card.price).toFixed(2) : "", deck: ""})), d = say(r) || {};
        const Z = STAGE[stageOf(ui.stageSize)], w = Math.min(Z.w, width - 32), h = Math.round(w * 680 / 488);
        const side = width - w - 48 >= 300, panelW = side ? width - w - 48 : width - 32, panelH = side ? h : 380;  /* under the picture on a phone: tall enough for the facts and the two buttons */
        const from = homeId ? findPile(model, homeId) : null, order = from ? pileOrder(from) : [], at = order.findIndex((x) => x.recordId === r.recordId);
        const prev = at > 0 ? order[at - 1] : null, next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
        const caption = `<ul class="cm-tt-captions"><li><strong>${esc(nameOf(r))}</strong>${d.status ? ` <span class="cm-tt-pill${isGhost(r) ? " is-ghost" : ""}">${esc(d.status)}</span>` : ""}${d.price ? ` <span>${esc(d.price)}</span>` : ""}${d.deck ? ` <span class="cm-tt-muted">${esc(d.deck)}</span>` : ""}${d.ownership ? ` <span class="cm-tt-own"${d.ownershipWhy ? ` title="${esc(d.ownershipWhy)}"` : ""}>${esc(d.ownership)}</span>` : ""}${(Number(r.quantity) || 1) > 1 ? ` <span class="cm-tt-muted">×${r.quantity}</span>` : ""}</li></ul>`;
        const sizeSeg = `<span class="cm-tt-seg" role="group" aria-label="Picture size">${[["L", "Card"], ["XL", "Larger"], ["XXL", "Large"], ["full", "Full"]].map(([k, l]) => `<button type="button" data-tt="stage-size" data-size="${k}" aria-pressed="${stageOf(ui.stageSize) === k ? "true" : "false"}" title="Picture ${k === "full" ? "at full size" : "size " + k}">${l}</button>`).join("")}</span>`;
        const stepBtn = (row, dir, label) => `<button type="button" data-tt="step" data-record="${esc(row ? row.recordId : "")}" ${row ? "" : "disabled"} aria-label="${dir} card in ${esc(from ? from.label : "the pile")}">${label}</button>`;
        const actH = narrow ? 176 : width < 1180 ? 84 : 48;  /* the action row wraps to four lines on a phone, two on a narrow mat */
        stageH = (side ? h : h + 12 + panelH) + 24 + actH;
        stageHTML = `<div class="cm-tt-stage is-solo" style="top:${stageTop}px;height:${stageH}px"><div class="cm-tt-fanL is-solo" style="left:16px;top:12px;width:${w}px;height:${h}px">${cardFace(r, {ghost: isGhost(r), big: true, cls: "cm-tt-chosen cm-tt-solo", style: `left:0;top:0;width:${w}px;height:${h}px;`})}</div><div class="cm-tt-info" style="${side ? `left:${w + 32}px;top:12px;width:${panelW}px;height:${h}px` : `left:16px;top:${h + 24}px;width:${panelW}px;height:${panelH}px`}">${caption}${hooks.detail ? hooks.detail(r) || "" : ""}</div>${from ? `<button type="button" class="cm-tt-back" data-tt="back" data-pile="${esc(from.id)}" style="${side ? `left:${w + 32 + panelW - 38}px;top:20px` : `left:${16 + panelW - 38}px;top:${h + 32}px`}" title="Back to ${esc(from.label)}" aria-label="Back to ${esc(from.label)}">&#8592;</button>` : ""}<div class="cm-tt-stage-actions is-solo">${sizeSeg}${stepBtn(prev, "Previous", "‹ Previous")}${stepBtn(next, "Next", "Next ›")}<span class="cm-tt-muted">${from && at >= 0 ? `${at + 1} of ${order.length} in ${esc(from.label)} · ` : ""}drag onto a pile, or</span><button type="button" data-tt="moveto" class="cm-tt-primary">Move to…</button><button type="button" data-tt="clear">Clear selection</button></div></div>`;
      } else {
        /* The selection (plan §2.2): on the centre of the mat, fanned if more than one, large,
           with name, status, price and deck beneath. */
        const L = SIZES.L, n = selected.length, step = Math.min(L.w * .72, Math.max(28, (width - 64 - L.w) / Math.max(1, n - 1)));
        const fanW = L.w + step * (n - 1), x0 = Math.max(16, (width - fanW) / 2);
        const say = hooks.describe || ((r) => ({status: r.status || "", price: r.card && r.card.price != null ? "$" + Number(r.card.price).toFixed(2) : "", deck: ""}));
        const fan = selected.map((r, i) => { const d = say(r) || {}; return cardFace(r, {ghost: isGhost(r), size: "L", big: true, cls: "cm-tt-chosen", style: `left:${Math.round(x0 + i * step)}px;top:${Math.round(Math.abs(i - (n - 1) / 2) * 6)}px;transform:rotate(${((i - (n - 1) / 2) * 3).toFixed(1)}deg);z-index:${i + 1};`}) + ""; }).join("");
        const captions = `<ul class="cm-tt-captions">${selected.map((r) => { const d = say(r) || {}; return `<li><strong>${esc(nameOf(r))}</strong>${d.status ? ` <span class="cm-tt-pill${isGhost(r) ? " is-ghost" : ""}">${esc(d.status)}</span>` : ""}${d.price ? ` <span>${esc(d.price)}</span>` : ""}${d.deck ? ` <span class="cm-tt-muted">${esc(d.deck)}</span>` : ""}${d.ownership ? ` <span class="cm-tt-own"${d.ownershipWhy ? ` title="${esc(d.ownershipWhy)}"` : ""}>${esc(d.ownership)}</span>` : ""}${(Number(r.quantity) || 1) > 1 ? ` <span class="cm-tt-muted">×${r.quantity}</span>` : ""}</li>`; }).join("")}</ul>`;
        const from = homeId ? findPile(model, homeId) : null;
        const capH = Math.min(6, n) * 24 + 16;
        /* A BACK ARROW AT EVERY LEVEL (plan §2.4): the laid-out pile, the selection and the single
           card each carry one, in the same corner, and it is the ONLY way back -- the "Back to
           <pile>" button that used to sit in the action row beside it said the same thing twice,
           which is one control too many for a gesture the plan wanted to be one place. */
        const backArrow = from ? `<button type="button" class="cm-tt-back is-corner" data-tt="back" data-pile="${esc(from.id)}" title="Back to ${esc(from.label)}" aria-label="Back to ${esc(from.label)}">&#8592;</button>` : "";
        stageHTML = `<div class="cm-tt-stage" style="top:${stageTop}px;height:${L.h + 30 + capH + 48}px">${backArrow}<div class="cm-tt-fanL" style="height:${L.h + 24}px">${fan}</div>${captions}<div class="cm-tt-stage-actions"><span class="cm-tt-muted">${n} selected · drag onto a pile, or</span><button type="button" data-tt="moveto" class="cm-tt-primary">Move to…</button><button type="button" data-tt="clear">Clear selection</button></div></div>`;
        stageH = L.h + 30 + capH + 48;
      }
      const bar = playBar(stageTop + stageH + 12, width - 32);
      const statusTop = stageTop + stageH + 34 + bar.height, sSpan = narrow ? span : (width - 32 - PILE_W) / Math.max(1, sN - 1);
      const statusRows = narrow ? Math.ceil(sN / perRow) : 1;
      const statusHTML = (narrow ? sts.map((p, i) => pile(p, Math.round(16 + (i % perRow) * span), statusTop + Math.floor(i / perRow) * ROW, bandKind(p))).join("") : sts.map((p, i) => pile(p, Math.round(16 + i * sSpan), statusTop, bandKind(p))).join("")) + readingsHTML(statusTop + statusRows * ROW);
      height = statusTop + statusRows * ROW + readH + (narrow ? 86 : 44);
      body = shelfHTML + stageHTML + bar.html + statusHTML;
    }
    const legend = `${model.total.toLocaleString()} cards on the table · ${model.ghosts.toLocaleString()} ghost${model.ghosts === 1 ? "" : "s"} (ordered, to buy, a draft list — not held) · ${shelf ? `${sN - 1} collection group${sN === 2 ? "" : "s"}` : `${sN} status piles`} · ${gN} ${esc(model.groupings.find(([k]) => k === model.groupBy)[1].toLowerCase())} piles`;
    host.innerHTML = `<div class="cm-tt-mat is-${mode} cm-canvas-${canvasOf(ui.canvas)}" tabindex="-1" style="height:${height}px">${railHTML}${body}<div class="cm-tt-legend">${legend}</div></div>`;
    /* Clicks, keys and the context menu, delegated once per draw. */
    const sel = host.querySelector("select[name=tabletopGroupBy]"); if (sel && hooks.onGroupBy) sel.addEventListener("change", () => hooks.onGroupBy(sel.value));
    const ord = host.querySelector("select[name=tabletopStatusOrder]"); if (ord && hooks.onStatusOrder) ord.addEventListener("change", () => hooks.onStatusOrder(ord.value));
    const can = host.querySelector("select[name=tabletopCanvas]"); if (can && hooks.onCanvas) can.addEventListener("change", () => hooks.onCanvas(can.value));
    for (const bind of host.querySelectorAll("select[data-tt=tray-group]")) bind.addEventListener("change", () => hooks.onTrayGroup && hooks.onTrayGroup(Number(bind.dataset.n) || 1, bind.value));
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
      else if (kind === "print") { hooks.onPrint && hooks.onPrint(t.dataset.pile); }
      else if (kind === "bench-toggle") { hooks.onBench && hooks.onBench(benchShut); }
      else if (kind === "stage-size") { hooks.onStageSize && hooks.onStageSize(t.dataset.size); }
      else if (kind === "step") { if (t.dataset.record) hooks.onStep && hooks.onStep(t.dataset.record); }
      /* The play space (PR 3b). Stepping the draw pile is a view change and never leaves the
         module's caller a decision; the other three are the caller's, because they unstage. */
      else if (kind === "draw-step") { hooks.onDrawAt && hooks.onDrawAt(Number(t.dataset.at) || 0); }
      else if (kind === "trays") { hooks.onTrays && hooks.onTrays(Number(t.dataset.n) || 1); }
      else if (kind === "restore-one") { hooks.onRestore && hooks.onRestore([t.dataset.record]); }
      else if (kind === "restore-all") { hooks.onRestore && hooks.onRestore(null); }
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
    /* THE KEYBOARD (plan TB4). Among the piles the arrows walk a row (the ledge, the group
       piles or their shelf, the status piles) and step between rows; Enter opens the focused
       pile (it is a button). In a laid-out pile the arrows walk the cards, Home and End jump,
       PageUp and PageDown turn the page, Space ticks the card and Enter chooses it. Escape is
       the table at rest. */
    const focusables = (list) => list.filter((el) => el && !el.hidden);
    const pileRows = () => [focusables([host.querySelector(".cm-tt-fan")]), focusables([...host.querySelectorAll(".cm-tt-pile.cm-tt-group, .cm-tt-chip")]), focusables([...host.querySelectorAll(".cm-tt-draw, .cm-tt-tray, .cm-tt-playchip")]), focusables([...host.querySelectorAll(".cm-tt-pile.cm-tt-status, .cm-tt-pile.cm-tt-shelfgroup, .cm-tt-pile.cm-tt-shelfnew, .cm-tt-reading")])].filter((row) => row.length);
    host.onkeydown = (ev) => {
      const el = ev.target;
      if (ev.key === "Escape" && mode !== "rest") { ev.preventDefault(); hooks.onClear && hooks.onClear(); return; }
      if (mode === "selected" && selected.length === 1 && (ev.key === "ArrowLeft" || ev.key === "ArrowRight") && !(el.matches && el.matches("input, select, textarea, [data-tt=open]"))) {
        const btn = host.querySelector(`.cm-tt-stage-actions [data-tt=step][aria-label^="${ev.key === "ArrowLeft" ? "Previous" : "Next"}"]`);
        if (btn && !btn.disabled) { ev.preventDefault(); btn.click(); }
        return;
      }
      if (el.matches && el.matches(".cm-tt-tick") && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); el.click(); return; }
      if (el.matches && el.matches(".cm-tt-card[data-tt=card]")) {
        const cards = [...host.querySelectorAll(".cm-tt-grid .cm-tt-card[data-tt=card]")], i = cards.indexOf(el), cols = Number(host.querySelector(".cm-tt-grid")?.dataset.cols) || 1;
        const go = (j) => { const c = cards[Math.max(0, Math.min(cards.length - 1, j))]; if (c) c.focus({preventScroll: false}); };
        if (ev.key === "Enter") { ev.preventDefault(); el.click(); }
        else if (ev.key === " ") { ev.preventDefault(); hooks.onTick && hooks.onTick(el.dataset.record); }
        else if (ev.key === "ArrowRight") { ev.preventDefault(); go(i + 1); }
        else if (ev.key === "ArrowLeft") { ev.preventDefault(); go(i - 1); }
        else if (ev.key === "ArrowDown") { ev.preventDefault(); go(i + cols); }
        else if (ev.key === "ArrowUp") { ev.preventDefault(); go(i - cols); }
        else if (ev.key === "Home") { ev.preventDefault(); go(0); }
        else if (ev.key === "End") { ev.preventDefault(); go(cards.length - 1); }
        else if (ev.key === "PageDown") { ev.preventDefault(); hooks.onPage && hooks.onPage((ui.page | 0) + 1); }
        else if (ev.key === "PageUp") { ev.preventDefault(); hooks.onPage && hooks.onPage(Math.max(0, (ui.page | 0) - 1)); }
        return;
      }
      if (el.matches && el.matches("[data-tt=open]") && /^Arrow/.test(ev.key)) {
        const rows = pileRows(); const r = rows.findIndex((row) => row.includes(el)); if (r < 0) return;
        const i = rows[r].indexOf(el); let target = null;
        if (ev.key === "ArrowRight") target = rows[r][Math.min(rows[r].length - 1, i + 1)];
        else if (ev.key === "ArrowLeft") target = rows[r][Math.max(0, i - 1)];
        else if (ev.key === "ArrowDown") { const row = rows[Math.min(rows.length - 1, r + 1)]; target = row[Math.min(row.length - 1, Math.round(i * (row.length - 1) / Math.max(1, rows[r].length - 1)))]; }
        else if (ev.key === "ArrowUp") { const row = rows[Math.max(0, r - 1)]; target = row[Math.min(row.length - 1, Math.round(i * (row.length - 1) / Math.max(1, rows[r].length - 1)))]; }
        if (target && target !== el) { ev.preventDefault(); target.focus({preventScroll: false}); }
      }
    };
    host.oncontextmenu = (ev) => { const c = ev.target.closest(".cm-tt-card[data-record]"); if (c && hooks.onMenu && (mode !== "rest")) { ev.preventDefault(); hooks.onMenu(c.dataset.record, c); } };
    return {width, height, piles: sN + gN + 1, readings: readings.length, mode};
  }

  return {GROUPINGS, TYPE_ORDER, BENCH, GHOST, TARGET, SIZES, STAGE, SHELF, CANVASES, TRAYS_MAX, HAND, SENT, DRAW_FACES, canvasOf, shelfShape, shelfSeats, isGhost, primaryType, bandOf, bandOrder, arcsOf, pileOrder, layout, findPile, playPiles, play, accepts, printSheet, table, mount};
});
