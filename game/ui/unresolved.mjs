/* THE UNKNOWN-CARD SWAP (readiness plan C.1, Trey's scope §3.3: "type + searchable name + hover art").
 *
 * B.2 made an unresolvable card a refusal: a seat whose list names a card Forge has no script for
 * cannot be prepared, and the refusal travels with the list -- {name, quantity, reason, suggestions}
 * -- through both the host API and the guest gateway. Until now the page printed the sentence and
 * left the person to re-read their list. This module turns the refusal into a swap: one row per
 * unknown card, with what Forge suggested prefilled, a search over the catalog by name that shows
 * the type line and the art on hover, and one button that re-submits the same deck with the swaps.
 * The seat builder applies them before Forge is consulted (applyReplacements in setup-catalog.mjs).
 *
 * Two halves, as connection.mjs: describeUnresolved() and searchCatalog() are arithmetic a Node
 * suite holds; renderSwapPanel() draws through an element factory it is handed.
 */

const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 /]+/g, " ").replace(/\s+/g, " ").trim();

/* The refusal as rows the page can draw: one per unknown name, with the best prefill. */
export function describeUnresolved(unresolved, options = {}) {
  const rows = (Array.isArray(unresolved) ? unresolved : []).map((u, i) => {
    const name = String((u && u.name) || "").trim();
    const suggestions = Array.isArray(u && u.suggestions) ? u.suggestions.map((s) => String(s).trim()).filter(Boolean) : [];
    return {index: i, name, quantity: Math.max(1, Number(u && u.quantity) || 1), reason: String((u && u.reason) || "This engine has no card script by that name"),
      suggestions, prefill: suggestions[0] || "", to: suggestions[0] || ""};
  }).filter((r) => r.name);
  const seatName = options.seatName ? String(options.seatName) : "";
  const headline = rows.length === 0 ? "Every card resolved."
    : `${seatName ? seatName + ": " : ""}Forge does not recognize ${rows.length} card${rows.length === 1 ? "" : "s"}. Choose a replacement for each, then validate again.`;
  return {rows, headline, complete: rows.length > 0 && rows.every((r) => r.to)};
}

/* Replacement pairs for the server, from the rows as the reader left them. Empty when any row is
   still blank, so the button can stay disabled rather than sending half a swap. */
export function replacementsOf(rows) {
  const out = [];
  for (const r of rows) { const to = String(r.to || "").trim(); if (!to) return []; out.push({from: r.name, to}); }
  return out;
}

/* A search over the catalog the host already serves (data/cards.json): prefix on any word first,
   then substring, Commander-legal only, at most `limit`. Each hit carries what the row shows: the
   type line and the art to hover. */
export function searchCatalog(cards, query, {limit = 8, colorIdentity = null} = {}) {
  const q = fold(query);
  if (!q) return [];
  const identity = Array.isArray(colorIdentity) ? new Set(colorIdentity.map((x) => String(x).toUpperCase())) : null;
  const legal = (c) => !c.legalities || !c.legalities.commander || c.legalities.commander === "legal";
  const inside = (c) => !identity || (c.colorIdentity || []).every((x) => identity.has(String(x).toUpperCase()));
  const starts = [], within = [];
  for (const c of cards) {
    if (!c || !c.name || !legal(c) || !inside(c)) continue;
    const f = fold(c.name);
    if (f === q) { starts.unshift(c); continue; }
    if (f.startsWith(q) || f.split(" ").some((w) => w.startsWith(q))) starts.push(c);
    else if (f.includes(q)) within.push(c);
    if (starts.length > limit * 4) break;
  }
  return starts.concat(within).slice(0, limit).map((c) => ({name: c.name, typeLine: c.typeLine || "", manaCost: c.manaCost || "", image: c.imageSmall || c.image || "", price: c.price ?? null}));
}

/* Load the catalog once per page; the host and the guest gateway both serve it at this path. */
let catalogPromise = null;
export function loadCatalog(url = "/app/data/cards.json", fetcher = (typeof fetch === "function" ? fetch : null)) {
  if (!catalogPromise) {
    if (!fetcher) return Promise.resolve([]);
    catalogPromise = fetcher(url).then((r) => { if (!r.ok) throw Error(`Catalog HTTP ${r.status}`); return r.json(); }).then((j) => (j && Array.isArray(j.cards) ? j.cards : [])).catch(() => { catalogPromise = null; return []; });
  }
  return catalogPromise;
}

/* Elements, through a factory: el(tag, className, text) -> node with append(), addEventListener()
   and the usual properties. The browser hands in document.createElement; the suite hands in a fake.
   `onSubmit(replacements)` is called with the pairs when every row has a choice. `cards` is the
   catalog to search (an array, or a promise of one). */
export function renderSwapPanel(unresolved, options = {}) {
  const el = typeof options.el === "function" ? options.el
    : (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const d = describeUnresolved(unresolved, options);
  const panel = el("section", "swap-panel");
  panel.append(el("h2", "swap-title", "Cards Forge does not have"));
  panel.append(el("p", "swap-headline", d.headline));
  const list = el("ul", "swap-rows");
  const submit = el("button", "swap-submit primary", "Validate with these swaps");
  submit.type = "button";
  const sync = () => { submit.disabled = !d.rows.every((r) => String(r.to || "").trim()); };
  let cards = Array.isArray(options.cards) ? options.cards : [];
  const ready = options.cards && typeof options.cards.then === "function" ? options.cards.then((c) => { cards = c; }) : Promise.resolve();
  for (const row of d.rows) {
    const item = el("li", "swap-row");
    const head = el("div", "swap-from");
    head.append(el("strong", "swap-name", `${row.quantity > 1 ? row.quantity + "× " : ""}${row.name}`));
    head.append(el("small", "swap-reason", row.reason));
    item.append(head);
    const field = el("div", "swap-to");
    const input = el("input", "swap-input");
    input.type = "text"; input.value = row.to; input.placeholder = "Type a card name"; input.setAttribute("aria-label", `Replacement for ${row.name}`);
    input.setAttribute("autocomplete", "off");
    const hits = el("ul", "swap-hits"); hits.hidden = true;
    const art = el("img", "swap-art"); art.alt = ""; art.hidden = true; art.loading = "lazy";
    const chosen = el("small", "swap-chosen", row.to ? `Forge suggests ${row.to}` : "");
    const pick = (hit) => { row.to = hit.name; input.value = hit.name; chosen.textContent = `${hit.name} · ${hit.typeLine}`; hits.hidden = true; hits.replaceChildren(); if (hit.image) { art.src = hit.image; art.hidden = false; } sync(); };
    const showHits = () => {
      const found = searchCatalog(cards, input.value, {limit: 8, colorIdentity: options.colorIdentity || null});
      hits.replaceChildren();
      for (const hit of found) {
        const li = el("li", "swap-hit");
        const btn = el("button", "swap-hit-pick", ""); btn.type = "button";
        btn.append(el("span", "swap-hit-name", hit.name), el("span", "swap-hit-type", hit.typeLine));
        btn.addEventListener("click", () => pick(hit));
        btn.addEventListener("mouseenter", () => { if (hit.image) { art.src = hit.image; art.hidden = false; } });
        btn.addEventListener("focus", () => { if (hit.image) { art.src = hit.image; art.hidden = false; } });
        li.append(btn); hits.append(li);
      }
      hits.hidden = found.length === 0;
    };
    input.addEventListener("input", () => { row.to = input.value.trim(); chosen.textContent = ""; sync(); ready.then(showHits); });
    input.addEventListener("focus", () => ready.then(showHits));
    input.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { hits.hidden = true; } });
    if (row.suggestions.length) {
      const sug = el("div", "swap-suggestions");
      for (const s of row.suggestions.slice(0, 4)) { const b = el("button", "swap-suggestion", s); b.type = "button"; b.addEventListener("click", () => { row.to = s; input.value = s; chosen.textContent = `Forge suggests ${s}`; sync(); ready.then(() => { const hit = searchCatalog(cards, s, {limit: 1})[0]; if (hit && hit.image) { art.src = hit.image; art.hidden = false; } }); }); sug.append(b); }
      field.append(sug);
    }
    field.append(input, hits, chosen);
    item.append(field, art);
    list.append(item);
  }
  panel.append(list);
  submit.addEventListener("click", () => { const pairs = replacementsOf(d.rows); if (pairs.length && typeof options.onSubmit === "function") options.onSubmit(pairs); });
  sync();
  panel.append(submit);
  return panel;
}
