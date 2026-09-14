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
 * `mount(host, model, hooks)` draws the mat: the slate, the dot grid, the ledge, the slots,
 * the placards -- the agreed mock-up (docs/mockups/tabletop-piles.html) -- and nothing else
 * in TB1: opening a pile (TB2) and dragging to one (TB3) come after.
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
  const cardFace = (row, {ghost = false, cls = ""} = {}) => {
    const c = (row && row.card) || {};
    /* The small print of the picture (Scryfall's 146px) is what a 64px card needs; the normal
       size is fetched only when a card is laid out large (TB2). */
    const src = c.image ? String(c.image).replace("cards.scryfall.io/normal/", "cards.scryfall.io/small/") : "";
    const art = src ? ` style="--art:url('${esc(src)}')"` : "";
    return `<div class="cm-tt-card${ghost ? " is-ghost" : ""}${cls ? " " + cls : ""}" data-record="${esc(row && row.recordId)}" data-n="${esc(c.name || "")}"${art}><span class="cm-tt-name">${esc(c.name || "")}</span></div>`;
  };
  const placard = (label, count, sub) => `<div class="cm-tt-placard"><strong>${esc(label)}</strong> · ${count.toLocaleString()}${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;

  /* How many group piles each arch holds, outer first: a full arch, then one two piles
     narrower inside it, and so on; the sizes sum to n and no pile is on two arches. */
  function arcsOf(n, perArc) {
    const sizes = []; let left = Math.max(0, n | 0);
    while (left > 0) { const size = Math.min(left, Math.max(3, (perArc | 0) - 2 * sizes.length)); sizes.push(size); left -= size; }
    return sizes;
  }

  /* Draw the table at rest into `host`. The geometry is computed from the host's width: the
     bench ledge along the back, the group piles on a semicircle, the status piles in a row
     down front. Every pile is a button (opening one is TB2); the placard says its count. */
  function mount(host, model, hooks = {}) {
    if (!host) return null;
    const width = Math.max(320, host.clientWidth || 960), narrow = width < 760;
    const PILE_W = 74, PILE_H = 130 /* the stack and its placard */, ROW = 150;
    const stackHeight = (n) => Math.min(14, Math.ceil(Math.sqrt(Math.max(0, n))) * 1.5);
    const pile = (p, x, y, kind) => {
      const n = p.count, h = stackHeight(n);
      const faces = p.top ? cardFace(p.top, {ghost: p.ghost || (kind === "group" && p.rows.length && p.rows.every(isGhost))}) : "";
      const title = p.folded ? `${p.label}: ${p.bands.join(", ")}` : p.label;
      return `<button type="button" class="cm-tt-pile cm-tt-${kind}${n ? "" : " is-empty"}" data-action="tabletop-pile" data-pile="${esc(p.id)}" style="left:${x}px;top:${y}px;--stack:${h}px" title="${esc(title)}" aria-label="${esc(title)}, ${n} card${n === 1 ? "" : "s"}"><span class="cm-tt-slot"></span><span class="cm-tt-stack">${faces}</span>${placard(p.label, n, "")}</button>`;
    };
    /* The Bench along the back: a fan of as many cards as the ledge is wide, and a count of
       the rest. */
    const rail = model.bench, railH = narrow ? 112 : 118;
    const fanCount = Math.max(0, Math.min(rail.rows.length, narrow ? Math.floor((width - 60) / 24) : Math.floor((width - 220) / 26)));
    const railHTML = `<div class="cm-tt-rail"><div class="cm-tt-placard cm-tt-rail-placard"><strong>${esc(rail.label)}</strong> · ${rail.count.toLocaleString()}<small>owned, in no deck</small></div><button type="button" class="cm-tt-fan" data-action="tabletop-pile" data-pile="bench" aria-label="Bench, ${rail.count} cards">${rail.rows.slice(0, fanCount).map((r) => cardFace(r, {cls: "cm-tt-fanned"})).join("")}${rail.rows.length > fanCount ? `<span class="cm-tt-more">+${(rail.rows.length - fanCount).toLocaleString()}</span>` : ""}</button></div>`;
    const groups = model.groupPiles, gN = groups.length, sts = model.statusPiles, sN = sts.length;
    const perRow = Math.max(3, Math.floor((width - 32) / 96)), span = (width - 32 - PILE_W) / Math.max(1, perRow - 1);
    let groupHTML = "", statusHTML = "", pickTop, height;
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
         where a laid-out pile and the selection will sit (TB2). */
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
    const legend = `${model.total.toLocaleString()} cards on the table · ${model.ghosts.toLocaleString()} ghost${model.ghosts === 1 ? "" : "s"} (ordered, to buy, a draft list — not held) · ${sN} status piles · ${gN} ${esc(model.groupings.find(([k]) => k === model.groupBy)[1].toLowerCase())} piles`;
    host.innerHTML = `<div class="cm-tt-mat" style="height:${height}px">${railHTML}<div class="cm-tt-group-pick" style="top:${pickTop}px"><label>Group piles by <select name="tabletopGroupBy" aria-label="Group piles by">${model.groupings.map(([k, l]) => `<option value="${esc(k)}"${k === model.groupBy ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label></div>${groupHTML}${statusHTML}<div class="cm-tt-legend">${legend}</div></div>`;
    if (hooks.onGroupBy) { const sel = host.querySelector("select[name=tabletopGroupBy]"); if (sel) sel.addEventListener("change", () => hooks.onGroupBy(sel.value)); }
    return {width, height, piles: sN + gN + 1};
  }

  return {GROUPINGS, TYPE_ORDER, BENCH, GHOST, isGhost, primaryType, bandOf, bandOrder, arcsOf, table, mount};
});
