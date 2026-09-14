/* THE TO TRADE LIST, PUBLISHED AS A LINK (backlog #200; docs/crankmagic-persistent-plan.md
 * puts the hosted version under Phase 5, "what accounts unlock" -- this is the version that
 * needs no account and no server, so it works today from GitHub Pages).
 *
 * WHAT IT IS. The copies a reader has marked Sell / Trade, and whatever is filed in the
 * To Trade collection group, become one link: the list itself, deflated and base64url-encoded
 * in the hash (`#trade?d=...`), with the reader's name, a way to reach them and a note. Anyone
 * who opens the link sees the cards with their pictures and can ask about one or several
 * from their own mail client. Nothing is stored anywhere: the link IS the publication, and a
 * new list is a new link. The QR code is offered only when the link fits the one this app
 * draws (crankmagic-qr.js stops at version 10); a long list is a link to copy or e-mail.
 *
 * TWO HALVES. `listFrom(state)`, `pack`, `unpack`, `link` and `qrFits` are pure and tested in
 * Node (CompressionStream is in Node 22 and every current browser); the view and the Share
 * menu action are the DOM half. A visitor's copy of the app has an empty library, so the page
 * reads only the link: pictures come from the shipped record where one exists and from
 * Scryfall's named-card image otherwise, the same fallback the catalog uses. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) { root.CrankTrade = api; (root.CrankFeatures ||= []).push(api.feature); }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 1, APP_URL = "https://minorrob.github.io/mtg-deck-matrix/";
  const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const isTradeGroup = (g) => g && (g.id === "group:to-trade" || fold(g.name) === "to trade");

  /* THE LIST. Owned copies offered for Sell / Trade (`offer: "available"`; a pending deal,
     `held`, is not on offer), plus every copy record filed in the To Trade group, plus the
     group's own planned entries; one row per card and printing, quantities summed. */
  function listFrom(state, {cardOf} = {}) {
    const groups = (state.groups || []).filter(isTradeGroup), gids = new Set(groups.map((g) => g.id));
    const card = (id) => (cardOf ? cardOf(id) : null) || (state.cards || {})[id] || {name: id};
    const rows = new Map();
    const add = (cardId, quantity, printing, price, why) => {
      const c = card(cardId) || {}; const name = c.name || cardId;
      const key = fold(name) + "|" + [printing?.set, printing?.collector, printing?.finish].map((x) => x || "").join("/");
      const row = rows.get(key) || {name, quantity: 0, price: Number.isFinite(c.price) ? c.price : null, set: printing?.set || "", collector: printing?.collector || "", finish: printing?.finish || "", why: new Set()};
      row.quantity += Number(quantity) || 0; if (row.price == null && Number.isFinite(price)) row.price = price; row.why.add(why); rows.set(key, row);
    };
    for (const l of state.lots || []) {
      const offered = l.source === "owned" && l.offer === "available", filed = (l.groupIds || []).some((id) => gids.has(id));
      if (offered || filed) add(l.cardId, l.quantity, l.printing, null, offered ? "offered" : "filed");
    }
    for (const g of groups) for (const e of g.entries || []) add(e.cardId, e.quantity, e.printing, null, "planned");
    const cards = [...rows.values()].map((r) => ({...r, why: [...r.why].sort()})).sort((a, b) => a.name.localeCompare(b.name));
    return {cards, count: cards.reduce((n, r) => n + r.quantity, 0), groups: groups.map((g) => g.name)};
  }

  /* THE WIRE FORM. Tuples, not objects, because every byte is in the hash; deflate-raw, then
     base64url with no padding so the hash needs no escaping. */
  const b64u = (bytes) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); };
  const unb64u = (text) => { const s = atob(String(text).replaceAll("-", "+").replaceAll("_", "/") + "===".slice((text.length + 3) % 4)); return Uint8Array.from(s, (ch) => ch.charCodeAt(0)); };
  async function pipe(bytes, stream) { const out = new Blob([bytes]).stream().pipeThrough(stream); return new Uint8Array(await new Response(out).arrayBuffer()); }
  async function pack(list, {from = "", contact = "", note = "", when = new Date()} = {}) {
    const day = when instanceof Date && !isNaN(when) ? when.toISOString().slice(0, 10) : String(when || "");
    const body = {v: VERSION, f: String(from).slice(0, 80), c: String(contact).slice(0, 200), n: String(note).slice(0, 500), d: day,
      cards: (list.cards || []).map((r) => [r.name, Number(r.quantity) || 1, Number.isFinite(r.price) ? Math.round(r.price * 100) / 100 : null, r.set || "", r.collector || "", r.finish || ""])};
    const raw = new TextEncoder().encode(JSON.stringify(body));
    return b64u(await pipe(raw, new CompressionStream("deflate-raw")));
  }
  async function unpack(text) {
    try {
      const raw = await pipe(unb64u(String(text || "").trim()), new DecompressionStream("deflate-raw"));
      const body = JSON.parse(new TextDecoder().decode(raw));
      if (!body || body.v !== VERSION || !Array.isArray(body.cards)) return null;
      return {from: String(body.f || ""), contact: String(body.c || ""), note: String(body.n || ""), day: String(body.d || ""),
        cards: body.cards.filter((t) => Array.isArray(t) && t[0]).map((t) => ({name: String(t[0]), quantity: Math.max(1, Number(t[1]) || 1), price: Number.isFinite(t[2]) ? t[2] : null, set: String(t[3] || ""), collector: String(t[4] || ""), finish: String(t[5] || "")}))};
    } catch (e) { return null; }
  }
  const link = (packed, base = APP_URL) => `${base}#trade?d=${packed}`;
  /* crankmagic-qr.js draws up to version 10; at level M that is about 213 bytes of text. */
  const QR_MAX = 213;
  const qrFits = (url) => new TextEncoder().encode(String(url)).length <= QR_MAX;
  const contactHref = (contact, subject, body) => { const c = String(contact || "").trim(); if (!c) return ""; if (/^https?:\/\//i.test(c)) return c; const addr = c.replace(/^mailto:/i, ""); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) ? `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : ""; };
  const imageFor = (name, record) => (record && record.image) || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;

  /* ------------------------------------------------------------------ the DOM half */
  function feature(C) {
    const {esc: e, button: b, note, field: f, actions, views, $} = C;
    const money = (n) => (n == null ? "" : "$" + Number(n).toFixed(2));
    const record = (name) => { try { return C.catalog && typeof CrankCatalog !== "undefined" ? C.catalog.get(CrankCatalog.key(name)) : null; } catch (err) { return null; } };
    /* THE PAGE A VISITOR SEES. Only the link is read; the library on this device is not. */
    views.trade = async (params) => {
      const list = await unpack(params.get("d"));
      if (!list) { C.main.innerHTML = C.pageHead("A trade list") + note("This link does not carry a trade list, or it was cut short when it was copied. Ask the person who sent it for the link again.", true); return; }
      const who = list.from || "Someone", subject = (name) => `About your ${name}`;
      const ask = (names) => contactHref(list.contact, names.length === 1 ? subject(names[0]) : `About ${names.length} cards on your trade list`, `Hi ${who},\n\nI saw your CrankMagic trade list and I am interested in:\n${names.map((n) => "- " + n).join("\n")}\n\n`);
      const cards = list.cards.map((r, i) => { const rec = record(r.name); return `<li class="cm-trade-card" data-index="${i}"><label class="cm-trade-tick"><input type="checkbox" data-trade-tick="${i}" aria-label="Tick ${e(r.name)}"></label><img src="${e(imageFor(r.name, rec))}" alt="" loading="lazy"><div class="cm-trade-facts"><strong>${e(r.name)}</strong><span>${r.quantity > 1 ? `×${r.quantity} · ` : ""}${[r.set && r.set.toUpperCase(), r.collector && "#" + r.collector, r.finish].filter(Boolean).join(" · ") || "any print"}${r.price != null ? ` · ${money(r.price)}` : ""}</span>${ask([r.name]) ? `<a class="cm-text-button" href="${e(ask([r.name]))}" rel="noopener">Ask about this card</a>` : ""}</div></li>`; }).join("");
      C.main.innerHTML = C.pageHead(`${e(who)}’s trade list`, list.contact && ask(["these cards"]) ? `<a class="v-button" id="cm-trade-ask-many" href="${e(ask(list.cards.map((r) => r.name)))}" rel="noopener">Ask about the ticked cards</a>` : "")
        + `<p class="cm-status-line">${list.cards.length} card${list.cards.length === 1 ? "" : "s"} · ${list.cards.reduce((n, r) => n + r.quantity, 0)} cop${list.cards.reduce((n, r) => n + r.quantity, 0) === 1 ? "y" : "ies"}${list.day ? ` · published ${e(list.day)}` : ""}${list.contact ? "" : " · no way to reply was given, so this is a list to read"}</p>`
        + (list.note ? `<p class="cm-trade-note">${e(list.note)}</p>` : "")
        + `<ul class="cm-trade-grid">${cards}</ul>`
        + note("This page is the link itself: nothing here is stored on a server, and the list is what it was the day it was published. Prices are the publisher’s own notes. CrankMagic keeps your own library at " + APP_URL + ".");
      /* A picture that does not arrive (offline, or a name Scryfall does not answer for) leaves the card's initials, not a broken icon. */
      C.main.addEventListener("error", (ev) => { const img = ev.target; if (!img.matches || !img.matches(".cm-trade-card img")) return; const name = img.closest(".cm-trade-card")?.querySelector("strong")?.textContent || ""; const d = document.createElement("div"); d.className = "cm-trade-noart"; d.textContent = name.split(/[\s,]+/).filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join(""); img.replaceWith(d); }, true);
      const many = $("#cm-trade-ask-many");
      if (many) C.main.addEventListener("change", (ev) => { if (!ev.target.matches("[data-trade-tick]")) return; const picked = [...C.main.querySelectorAll("[data-trade-tick]:checked")].map((el) => list.cards[Number(el.dataset.tradeTick)].name); many.href = ask(picked.length ? picked : list.cards.map((r) => r.name)); many.textContent = picked.length ? `Ask about ${picked.length} ticked card${picked.length === 1 ? "" : "s"}` : "Ask about the ticked cards"; });
    };
    /* PUBLISH, from the Share menu. The name, the contact and the note are remembered as
       preferences so the next list is one click; the list itself is read fresh each time. */
    actions["share-trade"] = async () => {
      const list = listFrom(C.state, {cardOf: (id) => C.card(id) || record(id)});
      const p = C.state.preferences.trade || {};
      if (!list.count) { C.modal("Publish your To Trade list", note("Nothing is on offer yet. Mark a copy Sell / Trade from its row menu or the ticked-rows bar, or file cards in the To Trade collection group, then publish.") + `<div class="cm-actions">${b("Open the Cards page", "trade-cards")}</div>`); return; }
      C.form("Publish your To Trade list", `<div class="cm-full">${note(`${list.count} cop${list.count === 1 ? "y" : "ies"} of ${list.cards.length} card${list.cards.length === 1 ? "" : "s"}: ${e(list.cards.slice(0, 5).map((r) => r.name).join(", "))}${list.cards.length > 5 ? ` and ${list.cards.length - 5} more` : ""}. The link carries the list itself; anyone with it can read the cards and ask you about them from their own mail client.`)}</div>`
        + f("Your name", "from", p.from || "", 'maxlength="80" required') + f("How to reach you (e-mail address or a link)", "contact", p.contact || "", 'maxlength="200"') + f("A note for readers (optional)", "note", p.note || "", 'maxlength="500"'),
        async (v) => {
          await C.commit({type: "preferences", values: {trade: {from: v.from, contact: v.contact, note: v.note}}}, {renderView: false});
          const packed = await pack(list, {from: v.from, contact: v.contact, note: v.note}), url = link(packed);
          C.modal("Your trade list link", `<p class="cm-trade-link"><a href="${e(url)}" rel="noopener">${e(url.length > 90 ? url.slice(0, 88) + "…" : url)}</a></p><p class="cm-muted">${url.length.toLocaleString()} characters · ${list.cards.length} card${list.cards.length === 1 ? "" : "s"}. A new list is a new link; this one stays what it is.</p><div class="cm-actions">${b("Copy link", "trade-copy", {url})}${b("Open the page", "trade-open", {d: packed})}<a class="v-button" href="mailto:?subject=${encodeURIComponent("My trade list on CrankMagic")}&body=${encodeURIComponent("Have a look at what I have to trade: " + url)}">Share by e-mail</a>${qrFits(url) ? b("Show a QR code", "trade-qr", {url}) : ""}</div>${qrFits(url) ? "" : note("Too long for a QR code this app draws; copy the link or e-mail it.")}`);
        }, "Make the link");
    };
    const closeDialog = () => { if (actions.close) actions.close(); };
    actions["trade-cards"] = () => { closeDialog(); C.go("cards", {group: "group:to-trade"}); };
    actions["trade-copy"] = async (el) => { try { await navigator.clipboard.writeText(el.dataset.url); C.notice("Link copied."); } catch (err) { C.notice("Copying did not work in this browser. Select the link and copy it by hand.", true); } };
    actions["trade-open"] = (el) => { closeDialog(); C.go("trade", {d: el.dataset.d}); };
    actions["trade-qr"] = (el) => { if (typeof CrankQR === "undefined") throw Error("The QR code module has not loaded yet. Try again in a moment."); C.modal("Scan to open the trade list", `<div class="cm-qr"><div class="cm-qr-code">${CrankQR.svg(el.dataset.url, {label: "QR code that opens the trade list"})}</div></div>`); };
  }

  return {VERSION, APP_URL, QR_MAX, listFrom, pack, unpack, link, qrFits, contactHref, imageFor, feature};
});
