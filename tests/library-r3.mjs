/* r3's LIBRARY (R3.6; wireframes 36-library-list, 41-filters-dialog, 42-columns-dialog, 43-add-cards).
 *
 * In a real page with the committed library restored:
 *
 *   1. Filters is a dialog: chips for type, color, status and deck, ranges for mana value and price.
 *      It works on a draft. Its button counts the records the draft would show, and after Show the
 *      page counts the same number. Every row left then really is red, at mana value 3 or less, and
 *      priced within the range, judged from the library's own card records, not from the page.
 *      Closing it any other way changes nothing. Clear all empties the draft. A deck chip moves the
 *      address to that deck.
 *   2. Columns is one list: Card and Status are always shown, Card stays first, the rest reorder by
 *      the arrows or by dragging the grip. The table draws them in that order, the saved preference
 *      holds it, and the CSV export follows it. Reset puts the defaults back. A column set saved
 *      without Status gains it.
 *   3. Add cards is the head's primary, and sits last. The picker takes a name or a pasted list; a
 *      list opens the import filled in, as copies you own. The copies dialog says where they land,
 *      counts on its button, and the copies do land on the Bench, reserved for no deck.
 *   4. On a phone the count cards show their whole figures, and the Filters dialog fits the screen.
 *   5. No dialog's sticky head covers its first line.
 *   7. Each count card filters the table to exactly what it counts: the copies under it add up to its
 *      figure, the other cards keep theirs, and a second click lets every row back. On a phone the
 *      page brings the table up below the top bar, since the table sits a screen below the cards.
 *   8. A row shows the card's name first and its mana after; on a phone the name keeps its room.
 *   9. W1: with one row per card, a card of two prints is priced at the dearest and opens to list each print, its value
 *      and where it is; a card of one print opens nothing and keeps the catalog's price.
 *   6. INTAKE §3's Library items still stand: the ticked-rows bar, group bands, collection groups, the
 *      Sheet's editable cells and the Table view's piles.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
import {createRequire} from "node:module";
const M = createRequire(import.meta.url)("../collection-model.js");

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "library-r3", flag: "GEOMETRY_REQUIRED"});
const LIB = `${base}/index.html#cards`;
/* The page's own record count, from the paging line or the status line above the table. */
const records = (page) => page.$eval("#cm-roster-table", (t) => { const m = (t.querySelector(".cm-paging span, .cm-status-line")?.textContent || "").match(/([\d,]+) records?/); return m ? Number(m[1].replace(/,/g, "")) : -1; });
const promised = (page) => page.$eval("#cm-fd-show", (b) => { const m = b.textContent.match(/Show ([\d,]+) records?/); return m ? Number(m[1].replace(/,/g, "")) : -1; });
const heads = (page) => page.$$eval(".cm-table thead th[class*=cm-col-]", (ths) => ths.map((th) => [...th.classList].find((c) => c.startsWith("cm-col-")).slice(7)));
/* The library as stored, judged here in Node: the page's security policy (rightly) refuses eval. */
const stateOf = (page) => page.evaluate(async () => { const r = await CrankRepository.open(); try { const s = await r.getState(); return {cards: s.cards, lots: s.lots, decks: s.decks.map((d) => ({id: d.id, name: d.name, archived: !!d.archived})), preferences: s.preferences, groups: s.groups}; } finally { r.close(); } });
const opened = async (page, name) => { await page.locator("#cm-dialog[open]").waitFor(); eq(await page.locator("#cm-dialog-title").textContent(), name, `the dialog is ${name}`); };
const settle = (page) => page.waitForFunction(() => document.querySelector("#cm-roster-table .cm-table"));
/* Columns is in the View menu (ROB-358). */
const openColumns = async (page) => { await page.locator("[data-action=view-menu]").click(); await page.locator(".cm-row-menu [data-action=roster-columns]").click(); };

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block", acceptDownloads: true});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.goto(LIB);
  await settle(page);

  /* 3, first: the band (ROB-358; Rob, 2026-11-01: "no more than a total of 10 clickable items above the red line"). */
  const controls = () => page.$$eval(".cm-band button, .cm-band input, .cm-band select, .cm-band a", (els) => els.filter((e) => e.getClientRects().length).length);
  eq(await controls(), 10, "the band is ten clickables at rest");
  eq(await page.$$eval(".cm-band [role=tab]", (ts) => ts.map((t) => t.textContent.replace(/\s+/g, " ").trim().replace(/[\d,]+$/, "").trim())), ["Library", "To buy", "Orders"], "the tabs are the title: Library, To buy, Orders");
  ok(await page.$eval(".cm-band [data-action=add-card]", (b) => b.classList.contains("primary")), "Add cards is the primary, one click");
  ok((await page.$eval(".cm-band", (b) => b.getBoundingClientRect().height)) < 140, "and the band is under 140 px tall at 1400");
  eq(await page.locator(".cm-kpi, .cm-batch-bar, .cm-toolbar").count(), 0, "the eight count cards, the toolbar and the old bar are gone from the page");

  /* 7. THE COUNTS ARE THE GROUP MENU'S CHIPS (Rob, 2026-11-01: "wouldn't that give a dropdown to select one of those three"). They
     partition the copies, each one selects, and a second press lets every row back. */
  const copiesShown = () => page.$eval("#cm-roster-table", (t) => { const m = (t.querySelector(".cm-paging span, .cm-status-line")?.textContent || "").match(/([\d,]+) cop(?:y|ies)/); return m ? Number(m[1].replace(/,/g, "")) : -1; });
  const figures = async () => { await page.locator("[data-action=group-menu]").click(); const f = await page.$$eval(".cm-show-chip", (cs) => cs.map((c) => ({key: c.dataset.show, label: c.textContent.replace(/[\d,]+\s*$/, "").trim(), n: Number(c.querySelector("b").textContent.replace(/,/g, ""))}))); await page.keyboard.press("Escape"); return f; };
  const cardsBefore = await figures(), recordsBefore = await records(page);
  eq(cardsBefore.map((f) => f.label), ["All", "Boxed", "Reserved", "Upgrade", "Bench"], "the chips are All, then Boxed, Reserved, Upgrade and Bench (a state nobody holds is not offered)");
  {
    const stored = await page.evaluate(async () => { const r = await CrankRepository.open(); try { return await r.getState(); } finally { r.close(); } });
    const recs = M.records(stored), all = recs.reduce((n, r) => n + (r.quantity || 1), 0);
    eq(cardsBefore[0].n, all, `All is every copy the Library shows (${all})`);
    eq(cardsBefore.slice(1).reduce((n, f) => n + f.n, 0), all, "and the other chips add up to it: they partition the copies");
  }
  for (const [i, f] of cardsBefore.entries()) {
    if (!i) continue;
    await page.locator("[data-action=group-menu]").click();
    await page.locator(`.cm-show-chip[data-show=${f.key}]`).click();
    await page.waitForFunction(() => /cop(y|ies)/.test(document.querySelector("#cm-roster-table .cm-paging span, #cm-roster-table .cm-status-line")?.textContent || ""));
    eq(await copiesShown(), f.n, `${f.label}: the copies under the chip add up to its figure, ${f.n}`);
    eq(await page.$eval(".cm-fchip", (c) => c.textContent.replace(/\s+/g, " ").replace("✕", "").trim()), `Count: ${f.label}`, `${f.label}: a chip names it`);
    eq(await figures(), cardsBefore, `${f.label}: the other chips keep their figures`);
    await page.locator("[data-action=group-menu]").click();
    await page.locator(`.cm-show-chip[data-show=${f.key}]`).click();
    await page.waitForFunction(() => !document.querySelector(".cm-fchip"));
    eq(await records(page), recordsBefore, `${f.label}: a second press lets every row back`);
  }
  /* Two figures judged from the library as stored, not from the page's rule. */
  {
    const st = await stateOf(page), sum = (f) => st.lots.filter(f).reduce((n, l) => n + l.quantity, 0);
    const final = sum((l) => l.source === "owned" && l.allocation && l.location?.kind === "deck" && l.location.deckId === l.allocation.deckId);
    const subs = sum((l) => l.source === "owned" && l.location?.kind === "deck" && l.allocation?.deckId !== l.location.deckId && (l.offer || "none") === "none");
    eq(cardsBefore[1].n, final + subs, "Boxed is every owned copy in a deck's box: the deck's own cards, and the stand-ins in them");
    /* The model needs the whole library -- deck groups and slots -- which stateOf trims, so it reads the stored one whole. */
    const readStored = M.stateReader(await page.evaluate(async () => { const r = await CrankRepository.open(); try { return await r.getState(); } finally { r.close(); } }));
    eq(cardsBefore[4].n, sum((l) => readStored({...l, kind: "lot"}).use === "bench"), "the Bench is what the model calls the Bench: owned, for no deck, not offered");
    ok(sum((l) => readStored({...l, kind: "lot"}).use === "bench") <= sum((l) => l.source === "owned" && !l.allocation && l.location?.kind !== "deck"), "and never more than the owned copies no deck claims and no box holds");
  }

  /* 8. The name first, then its mana (Rob, 2026-09-25: "Put the card name first then mana symbols"). */
  const nameFirst = await page.$$eval("#cm-roster-table tr[data-card] td.cm-col-name", (tds) => tds.map((td) => { const n = td.querySelector(".cm-card-name"), m = td.querySelector(".cm-row-mana, .cm-row-land"); return !m || !!(n.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  ok(nameFirst.length > 20 && nameFirst.every(Boolean), `in every row the card's name comes before its mana (${nameFirst.filter(Boolean).length} of ${nameFirst.length})`);

  /* 9. The card status on the rows (docs/card-states.md, 2026-10-18): every pill is a word from the vocabulary, the
     Filters dialog offers those words and two ownership readings, and "Loading" finds exactly the owned copies Ready to
     add lists, each with its note. */
  const VOCAB = M.STATE_LABELS;
  const pills = await page.$$eval("#cm-roster-table td.cm-col-status .cm-pill", (ps) => ps.map((p) => p.textContent.trim()));
  ok(pills.length > 20 && pills.every((p) => VOCAB.includes(p)), `every Status pill is a card-state word: ${[...new Set(pills.filter((p) => !VOCAB.includes(p)))].join(", ")}`);
  await page.getByRole("button", {name: /^Filters/}).click();
  await opened(page, "Filters");
  eq(await page.$$eval("#cm-dialog [data-fd=status]", (bs) => bs.map((b) => b.textContent)), ["Final", "Substitute", "Reserved", "Upgrade", "Bench", "Sell", "Trade", "Watch", "To buy", "To Buy · Ordered", "Own (any)", "To buy (any)"], "the Filters dialog's Status chips are the card status words, then two ownership readings");
  await page.keyboard.press("Escape");
  /* Reserved is more than one page of rows, so the list is read whole. */
  await page.evaluate(async () => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "preferences", values: {pageSize: "all"}}, s.revision); } finally { r.close(); } });
  await page.reload();
  await settle(page);
  await page.getByRole("button", {name: /^Filters/}).click();
  await opened(page, "Filters");
  await page.locator("[data-fd=status][data-value='Reserved']").click();
  await page.locator("#cm-fd-show").click();
  await page.waitForFunction(() => /Status: Reserved/.test(document.getElementById("cm-filter-chips")?.textContent || ""));
  const toAdd = await page.$$eval("#cm-roster-table tr[data-card]", (trs) => trs.map((tr) => ({pill: tr.querySelector("td.cm-col-status .cm-pill")?.textContent.trim(), badge: !!tr.querySelector("td.cm-col-status .cm-badge-final"), q: Number(tr.querySelector("td.cm-col-quantity")?.textContent.trim() || 1)})));
  {
    const st = await stateOf(page), five = st.lots.filter((l) => l.source === "owned" && l.allocation && !(l.location?.kind === "deck" && l.location.deckId === l.allocation.deckId) && !(l.location?.kind === "deck")).reduce((n, l) => n + l.quantity, 0);
    /* The filter also keeps a copy sitting in another deck's box that a deck has claimed (the model's old Reserved reading): a Substitute there. */
    ok(toAdd.length > 0 && toAdd.every((r) => r.pill === "Reserved" || r.pill === "Substitute") && toAdd.filter((r) => r.pill === "Reserved").length > toAdd.length / 2, "Reserved shows Reserved pills: the seats to buy, and the owned copies waiting to be boxed (and the copies other decks have claimed)");
    const owned = toAdd.filter((r) => r.badge);
    ok(owned.length > 0, "and the owned copies waiting outside their box each say what to do");
    eq(owned.reduce((n, r) => n + r.q, 0), five, `exactly the ${five} copies reserved for a deck and not in any deck's box, judged from the stored lots`);
  }
  await page.locator("#cm-filter-chips [data-action=clear-filters]").click();
  await settle(page);
  await page.evaluate(async () => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "preferences", values: {pageSize: 60}}, s.revision); } finally { r.close(); } });
  await page.reload();
  await settle(page);
  /* The To buy tab holds the decks' needs, and the To Buy list beside them: what no deck needs (R3.7). The rebuilt
     library's list is empty -- it only ever repeated the needs -- so a list entry and its Bought are proved in
     tests/explore-r3.mjs, where one is added. */
  await page.goto(`${base}/index.html#cards?tab=buy`);
  await settle(page);
  {
    const st = await stateOf(page), list = st.groups.find((g) => g.id === "group:to-buy").entries.reduce((n, r) => n + r.quantity, 0);
    const tabN = await page.$eval(".cm-cards-tabs [data-tab=buy] small", (x) => Number(x.textContent.replace(/,/g, "")));
    const needs = await page.evaluate(async () => { const r = await CrankRepository.open(); try { return CrankCollection.projection(await r.getState()).filter((x) => x.kind === "need").reduce((n, x) => n + x.quantity, 0); } finally { r.close(); } });
    eq(tabN, needs + list, `the To buy tab counts the decks' ${needs} needed copies and the To Buy list's ${list}`);
    eq(list, 0, "and the To Buy list repeats none of the needs");
    /* Each Reserved row wears its note beside the pill, whole: the Status cell wraps rather than cutting it off. */
    const cut = await page.$$eval("#cm-roster-table td.cm-col-status", (tds) => tds.map((td) => { const c = td.getBoundingClientRect(), b = td.querySelector(".cm-badge-upgrade, .cm-badge-reserved"); if (!b) return null; const r = b.getBoundingClientRect(); return {inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.bottom <= c.bottom + 0.5, text: b.textContent}; }).filter(Boolean));
    ok(cut.length > 0 && cut.every((x) => x.inside && /(replaces|empty seat)/.test(x.text)), `every note on the To buy tab shows whole inside its Status cell (${cut.length})`);
  }
  await page.goto(LIB);
  await settle(page);

  /* 1. Filters. */
  const all = await records(page);
  ok(all > 100, `the library shows its records (${all})`);
  ok(!(await page.$("#cm-filter-host, .cm-filter-panel")), "no filter panel is drawn into the page");
  await page.getByRole("button", {name: /^Filters/}).click();
  await opened(page, "Filters");
  eq(await page.$$eval("#cm-dialog legend", (ls) => ls.map((l) => l.textContent)), ["Type", "Color", "Status", "Deck", "Mana value", "Price"], "type, color, status and deck chips, then the mana value and price ranges");
  eq(await promised(page), all, "with nothing chosen the button promises every record the page shows");
  const head = await page.evaluate(() => { const d = document.getElementById("cm-dialog"); return {head: d.querySelector(".cm-dialog-head").getBoundingClientRect().bottom, first: d.querySelector("legend").getBoundingClientRect().top}; });
  ok(head.first >= head.head, `5. the sticky head clears the dialog's first line: ${JSON.stringify(head)}`);

  await page.locator("[data-fd=color][data-value=R]").click();
  eq(await page.locator("[data-fd=color][data-value=R]").getAttribute("aria-pressed"), "true", "the Red chip is pressed");
  const red = await promised(page);
  ok(red > 0 && red < all, `and the button's count falls to the red records (${red} of ${all})`);
  eq(await records(page), all, "while the page behind has not changed: nothing applies until Show");
  await page.locator("[data-fd=color][data-value=R]").click();
  eq(await promised(page), all, "pressing the chip again lets go of it");
  await page.locator("[data-fd=color][data-value=R]").click();
  await page.fill("#cm-dialog [name=max]", "3");
  await page.fill("#cm-dialog [name=priceMin]", "0.25");
  await page.fill("#cm-dialog [name=price]", "5");
  const narrow = await promised(page);
  ok(narrow > 0 && narrow < red, `mana value up to 3 and price $0.25 to $5 narrow it further (${narrow})`);

  /* Escape leaves the page as it was. */
  await page.keyboard.press("Escape");
  await page.locator("#cm-dialog[open]").waitFor({state: "detached"}).catch(() => {});
  ok(!(await page.$("#cm-dialog[open]")), "Escape closes the dialog");
  eq(await records(page), all, "and applies nothing");
  eq(await page.locator(".cm-fchip").count(), 0, "no filter chip appeared");

  /* Show applies the draft. */
  await page.getByRole("button", {name: /^Filters/}).click();
  await opened(page, "Filters");
  eq(await page.$$eval("#cm-dialog [aria-pressed=true]", (bs) => bs.length), 0, "the dialog reopens on the page's filters, not the draft that was dropped");
  await page.locator("[data-fd=color][data-value=R]").click();
  await page.fill("#cm-dialog [name=max]", "3");
  await page.fill("#cm-dialog [name=priceMin]", "0.25");
  await page.fill("#cm-dialog [name=price]", "5");
  eq(await promised(page), narrow, "the same draft promises the same count");
  await page.locator("#cm-fd-show").click();
  await page.waitForFunction((n) => { const t = document.querySelector("#cm-roster-table .cm-paging span, #cm-roster-table .cm-status-line"); return t && t.textContent.includes(n.toLocaleString("en-US") + " record"); }, narrow);
  eq(await records(page), narrow, `after Show the page counts exactly what the button promised (${narrow})`);
  eq(await page.$eval("[data-action=roster-filters]", (b) => b.textContent.trim()), "Filters 4", "the Filters button counts the four filters on");
  eq((await page.$$eval(".cm-fchip", (cs) => cs.map((c) => c.textContent.replace(/\s+/g, " ").replace("✕", "").trim()))).sort(), ["Color: Red", "Max mana value: 3", "Max price: $5.00", "Min price: $0.25"], "and each shows as a chip, the prices in dollars");

  /* Every row left is what was asked for, judged from the library's card records. */
  const shown = await page.$$eval("#cm-roster-table tr[data-card]", (trs) => trs.map((tr) => tr.dataset.card));
  ok(shown.length > 0, "the page shows rows");
  /* The card facts come from the model's projection, the card as the library resolves it, not from the view's filter code. */
  const facts = await page.evaluate(async (ids) => { const r = await CrankRepository.open(); try { const s = await r.getState(), by = {};
      /* Plan and draft rows are not copies, so the projection would not resolve their cards; a probe copy of each lets it. */
      const probe = {...s, lots: [...s.lots, ...[...new Set(ids)].map((id, i) => ({id: "probe:" + i, cardId: id, quantity: 1, source: "owned", printing: {}, location: {kind: "bench", box: ""}, allocation: null, offer: "none", groupIds: []}))]};
      for (const row of CrankCollection.projection(probe)) if (row.card) by[row.cardId] = {red: (row.card.colorIdentity || []).includes("R"), mv: row.card.manaValue, price: row.card.price}; return ids.map((id) => by[id] ? {id, ...by[id]} : {id, missing: true}); } finally { r.close(); } }, shown);
  const verdict = facts;
  ok(verdict.every((v) => !v.missing), "every row's card is in the library");
  ok(verdict.every((v) => v.red), `every row is red: ${verdict.filter((v) => !v.red).map((v) => v.id).slice(0, 3)}`);
  ok(verdict.every((v) => v.mv !== null && v.mv <= 3), `every row is mana value 3 or less: ${JSON.stringify(verdict.filter((v) => !(v.mv <= 3)).slice(0, 2))}`);
  ok(verdict.every((v) => v.price !== null && v.price >= 0.25 && v.price <= 5), `every row is priced $0.25 to $5: ${JSON.stringify(verdict.filter((v) => !(v.price >= 0.25 && v.price <= 5)).slice(0, 2))}`);

  /* Clear all, in the dialog, empties the draft. */
  await page.getByRole("button", {name: /^Filters/}).click();
  await opened(page, "Filters");
  eq(await page.locator("[data-fd=color][data-value=R]").getAttribute("aria-pressed"), "true", "the dialog opens on the filters in force");
  eq(await page.inputValue("#cm-dialog [name=priceMin]"), "0.25", "ranges included");
  await page.locator("[data-fd-clear]").click();
  eq(await page.$$eval("#cm-dialog [aria-pressed=true]", (bs) => bs.length), 0, "Clear all lets go of every chip");
  eq(await page.inputValue("#cm-dialog [name=max]"), "", "and empties the ranges");
  eq(await promised(page), all, "so the button promises everything again");

  /* A deck chip moves to that deck. */
  const decksNow = (await stateOf(page)).decks;
  const deck = decksNow.find((d) => !d.archived && /^D6\b/.test(d.name)) || decksNow.find((d) => !d.archived);
  await page.locator(`[data-fd=deck][data-value="${deck.id}"]`).click();
  const forDeck = await promised(page);
  await page.locator("#cm-fd-show").click();
  await page.waitForFunction((id) => decodeURIComponent(location.hash).includes(`deck=${id}`), deck.id);
  await settle(page);
  ok(decodeURIComponent(page.url()).includes(`deck=${deck.id}`), `the deck chip put ${deck.name} in the address`);
  await page.waitForFunction((n) => document.querySelector(".cm-band-group-name")?.textContent.includes(n), deck.name, {timeout: 30000});
  ok((await page.locator(".cm-band-group-name").innerText()).includes(deck.name), "and the Group menu's button names the deck's group");
  eq(await records(page), forDeck, `and counts what the button promised for it (${forDeck})`);
  await page.goto(LIB);
  await settle(page);

  /* 2. Columns. */
  await openColumns(page);
  await opened(page, "Columns");
  const order = () => page.$$eval("#cm-col-list .cm-col-row", (ls) => ls.map((l) => l.dataset.col));
  eq((await order())[0], "name", "Card is first");
  ok(await page.$eval("#cm-col-list [data-col=name] input", (i) => i.checked && i.disabled), "Card cannot be hidden");
  ok(await page.$eval("#cm-col-list [data-col=status] input", (i) => i.checked && i.disabled), "nor can Status");
  eq(await page.locator("#cm-col-list [data-col=name] [data-move]").count(), 0, "and Card has no arrows: it stays first");
  const before = await order();
  const from = before.indexOf("paid");
  await page.locator("#cm-col-list [data-col=paid] [data-move='-1']").click();
  await page.locator("#cm-col-list [data-col=paid] [data-move='-1']").click();
  eq((await order()).indexOf("paid"), from - 2, "the up arrow moves Paid up, twice");
  await page.locator("#cm-col-list [data-col=type] [data-move='-1']").click();
  eq((await order())[0], "name", "and nothing moves above Card");
  /* Drag Quantity's grip above Type. */
  const grip = await page.locator("#cm-col-list [data-col=quantity] [data-grip]").boundingBox();
  const target = await page.locator("#cm-col-list [data-col=type]").boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, target.y + 4, {steps: 12});
  await page.mouse.up();
  const dragged = await order();
  ok(dragged.indexOf("quantity") < dragged.indexOf("type") && dragged[0] === "name", `dragging the grip put Quantity above Type: ${dragged.slice(0, 6).join(", ")}`);
  await page.locator("#cm-col-list [data-col=color] input").check();
  const want = (await order()).filter((k) => k === "name" || k === "status" || ["type", "deck", "quantity", "paid", "color"].includes(k));
  await page.getByRole("button", {name: "Done", exact: true}).click();
  await page.locator("#cm-dialog[open]").waitFor({state: "detached"}).catch(() => {});
  await settle(page);
  eq(await heads(page), want, `the table draws the columns in that order: ${want.join(", ")}`);
  eq((await stateOf(page)).preferences.columns, want, "and the preference holds the order");

  /* The CSV follows the same order. */
  await page.getByRole("button", {name: /^More/}).first().click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", {name: "Export view", exact: true}).click()]);
  const csv = fs.readFileSync(await download.path(), "utf8").replace(/^﻿/, "");
  const labels = {name: "Card", type: "Type", status: "Status", deck: "Deck", quantity: "Quantity", paid: "Paid", color: "Color"};
  eq(csv.split(/\r?\n/)[0].split(",").map((h) => h.replace(/^"|"$/g, "")), want.map((k) => labels[k]), "the CSV export's columns come in the same order");

  /* Reset puts back the defaults; nothing is saved until Done. */
  await openColumns(page);
  await opened(page, "Columns");
  eq((await order()).slice(0, want.length), want, "the dialog reopens in the saved order");
  await page.getByRole("button", {name: "Reset", exact: true}).click();
  eq((await order()).slice(0, 6), ["name", "type", "status", "deck", "quantity", "paid"], "Reset restores the default order");
  eq(await page.$$eval("#cm-col-list input:checked", (is) => is.map((i) => i.name)), ["name", "type", "status", "deck", "quantity", "paid"], "and the default set");
  await page.keyboard.press("Escape");
  eq((await stateOf(page)).preferences.columns, want, "closing without Done saves nothing");

  /* A set saved without Status gains it. */
  await page.evaluate(async () => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "preferences", values: {columns: ["name", "type", "deck"]}}, s.revision); } finally { r.close(); } });
  await page.reload();
  await settle(page);
  eq(await heads(page), ["name", "type", "status", "deck"], "a saved set without Status shows it after Type");

  /* 3. Add cards. */
  await page.getByRole("button", {name: "Add cards", exact: true}).click();
  await opened(page, "Add cards");
  eq(await page.locator("#cm-dialog label", {has: page.locator("#cm-card-query")}).evaluate((l) => l.firstChild.textContent), "Search by name, or paste a list", "the picker asks for a name or a list");
  const paste = (text) => page.$eval("#cm-card-query", (input, t) => { const dt = new DataTransfer(); dt.setData("text/plain", t); input.dispatchEvent(new ClipboardEvent("paste", {clipboardData: dt, bubbles: true, cancelable: true})); }, text);
  await paste("Sol Ring");
  eq(await page.locator("#cm-dialog-title").textContent(), "Add cards", "one pasted line stays a search");
  await paste("1 Sol Ring\n2 Arcane Signet\n");
  await page.waitForFunction(() => document.getElementById("cm-dialog-title")?.textContent === "Import cards or a deck list");
  eq(await page.inputValue("#cm-dialog textarea[name=text]"), "1 Sol Ring\n2 Arcane Signet\n", "a pasted list opens the import with it filled in");
  eq(await page.inputValue("#cm-dialog select[name=mode]"), "owned", "as copies you own");
  await page.keyboard.press("Escape");

  const bench = async (page) => { const s = await stateOf(page); const id = Object.values(s.cards).find((c) => c.name === "Sol Ring")?.id; const mine = s.lots.filter((l) => l.cardId === id && l.source === "owned"); const n = (f) => mine.filter(f).reduce((k, l) => k + l.quantity, 0); return {id, bench: n((l) => !l.allocation && l.location?.kind === "bench"), reserved: n((l) => !!l.allocation), all: n(() => true)}; };
  const was = await bench(page);
  await page.getByRole("button", {name: "Add cards", exact: true}).click();
  await opened(page, "Add cards");
  await page.fill("#cm-card-query", "Sol Ring");
  await page.locator("[data-pick-card]", {hasText: "Sol Ring"}).first().click();
  await opened(page, "Add copies of Sol Ring");
  ok(/New copies you own land on the Bench, reserved for no deck/.test(await page.locator("#cm-dialog .cm-copy-where").textContent()), "the dialog says where new copies land");
  eq(await page.locator("#cm-dialog [type=submit]").textContent(), "Add 1 copy", "its button counts one copy");
  await page.locator("#cm-dialog [data-copy=more]").click();
  eq(await page.locator("#cm-dialog [type=submit]").textContent(), "Add 2 copies", "and two, after one more");
  await page.locator("#cm-dialog [type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"));
  const now = await bench(page);
  eq(now.all - was.all, 2, "two copies of Sol Ring were recorded as owned");
  eq(now.bench - was.bench, 2, "both on the Bench");
  eq(now.reserved, was.reserved, "and neither reserved for a deck");
  /* §3, what must not be lost: the Library's other surfaces still stand after the restyle. */
  await page.goto(LIB);
  await settle(page);
  await page.locator("#cm-roster-table .cm-row-tick").first().check();
  ok(await page.locator(".cm-band-clear").isVisible(), "§3: ticking a row brings up the ticked-rows bar, the band's second row");
  await page.locator(".cm-band-clear").click();
  await page.locator("[data-action=view-menu]").click();
  await page.locator(".cm-row-menu [data-action=band-arrange][data-by=deck]").click();
  await page.waitForFunction(() => document.querySelector("#cm-roster-table .cm-group-row"));
  ok(await page.locator("#cm-roster-table .cm-group-row").first().isVisible(), "§3: Group rows by draws a group band over the rows");
  await page.locator("[data-action=group-menu]").click();
  ok((await page.locator(".cm-row-menu .cm-menu-row").count()) > 1, "§3: the collection groups are offered");
  await page.keyboard.press("Escape");
  await page.goto(`${base}/index.html#cards?view=sheet`);
  await page.locator(".cm-sheet-cell").first().waitFor();
  ok((await page.locator(".cm-sheet-cell").count()) > 10, "§3: the Sheet draws its editable cells");
  await page.goto(`${base}/index.html#cards?view=tabletop`);
  await page.locator(".cm-tt-pile").first().waitFor();
  ok((await page.locator(".cm-tt-pile").count()) > 1, "§3: the Table view draws its piles");

  /* 9. W1: A CARD'S PRINTS IN ITS ONE ROW (docs/plan-to-done-2026-09-30.md). With one row per card, Generous Gift's row
     -- a $0.72 Modern Horizons on the bench and a $5.24 Secret Lair foil in D1's box, as the sync placed them (Rob:
     the dearest print is the deck's) -- is priced at the dearest, and opens to list both, each with its value and
     where it is. A card of one print keeps the catalog's price and opens nothing. */
  await page.evaluate(async () => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "preferences", values: {foldPrints: true, columns: ["name", "status", "price"]}}, s.revision); } finally { r.close(); } });
  await page.goto(LIB);
  await page.reload();
  await settle(page);
  const rowOf = (name) => page.locator("#cm-roster-table tr.cm-row-card", {has: page.locator(".cm-card-name", {hasText: new RegExp(`^${name}`)})}).first();
  await page.fill("#cm-roster-query", "Generous Gift");
  await rowOf("Generous Gift").waitFor();
  const gift = rowOf("Generous Gift"), giftPrice = (await gift.locator("td.cm-col-price").innerText()).trim();
  ok(giftPrice === "$5.24" && /dearest of its 2 prints/.test(await gift.locator("td.cm-col-price .cm-price").getAttribute("title")), `the one row is priced at the dearest of its prints: ${giftPrice}`);
  const toggle = gift.locator("[data-prints-toggle]");
  ok((await toggle.innerText()).trim() === "2 prints ▸" && (await toggle.getAttribute("aria-expanded")) === "false", "and says it holds two prints, closed");
  await toggle.click();
  const printRows = await page.locator("#cm-roster-table .cm-print-rows .cm-prints li").allInnerTexts();
  const flat = printRows.map((t) => t.replace(/\s+/g, " ").trim());
  ok(flat.length === 2 && /^Secret Lair Drop · #R 2534 · Foil · Rudy Siswanto \$5\.24 1 in D1 Quintorius Spirits$/.test(flat[0]) && /^Modern Horizons \$0\.72 1 in Bench$/.test(flat[1]),
    `opened, it lists each print, dearest first: set, number, foil, artist, value, and where it is (${flat.join(" | ")})`);
  ok(await page.locator("#cm-roster-table [data-prints-toggle][aria-expanded=true]").count() === 1 && page.url().endsWith("#cards"), "opening it keeps the page where it is (the row still does not open the card)");
  await page.locator("#cm-roster-table [data-prints-toggle]").click();
  eq(await page.locator("#cm-roster-table .cm-print-rows").count(), 0, "and a second click closes it");
  await page.fill("#cm-roster-query", "Evolving Wilds");
  await rowOf("Evolving Wilds").waitFor();
  const wilds = rowOf("Evolving Wilds");
  ok(await wilds.locator("[data-prints-toggle]").count() === 0 && !(await wilds.locator("td.cm-col-price .cm-price").getAttribute("title")), "a card of one print (five Evolving Wilds, all the one print) opens nothing and keeps the catalog's price");
  await page.fill("#cm-roster-query", "");
  await context.close();

  /* 4. A phone. */
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await loadLiveState(small, base);
  await small.goto(LIB);
  await settle(small);
  /* A cell that ellipsizes replaces an inline box that runs past its edge with a bare "…", so the name's box has to end inside the cell. */
  const names = await small.$$eval("#cm-roster-table tr[data-card] td.cm-col-name", (tds) => tds.map((td) => { const b = td.querySelector(".cm-card-name").getBoundingClientRect(), c = td.getBoundingClientRect(), pr = parseFloat(getComputedStyle(td).paddingRight); return {name: td.querySelector(".cm-card-name").textContent, fits: b.right <= c.right - pr + 1 && b.width > 20}; }));
  ok(names.length > 20 && names.every((n) => n.fits), `8. on a phone every name is shown, never swapped for a bare ellipsis: ${JSON.stringify(names.filter((n) => !n.fits).slice(0, 4).map((n) => n.name))}`);
  /* The band on a phone (ROB-358): ten controls, none past the window's edge, no sideways scroll; the Group menu fits and its chips select. */
  const bandFit = await small.evaluate(() => { const bd = document.querySelector(".cm-band"), cs = [...bd.querySelectorAll("button, input")].filter((c) => c.getClientRects().length); return {n: cs.length, out: cs.filter((c) => { const r = c.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5; }).length, sw: document.documentElement.scrollWidth, w: innerWidth}; });
  ok(bandFit.n === 10 && bandFit.out === 0 && bandFit.sw <= bandFit.w, `on a phone the band is ten controls, all inside the window, with no sideways scroll: ${JSON.stringify(bandFit)}`);
  await small.locator("[data-action=group-menu]").click();
  const menuFit = await small.evaluate(() => { const m = document.querySelector(".cm-row-menu").getBoundingClientRect(); return {left: m.left, right: m.right, w: innerWidth}; });
  ok(menuFit.left >= 0 && menuFit.right <= menuFit.w, `and the Group menu fits it: ${JSON.stringify(menuFit)}`);
  await small.locator(".cm-show-chip[data-show=boxed]").click();
  await small.waitForFunction(() => /cop(y|ies)/.test(document.querySelector("#cm-roster-table .cm-status-line")?.textContent || ""));
  await small.evaluate(() => scrollTo(0, 0));
  await small.getByRole("button", {name: /^Filters/}).click();
  await opened(small, "Filters");
  const fit = await small.evaluate(() => { const d = document.getElementById("cm-dialog"), r = d.getBoundingClientRect(); return {left: r.left, right: r.right, sw: d.scrollWidth, cw: d.clientWidth}; });
  ok(fit.left >= 0 && fit.right <= 390 && fit.sw <= fit.cw, `and the Filters dialog fits the screen: ${JSON.stringify(fit)}`);
  await phone.close();
} finally {
  await close();
}
console.log(`library-r3: ${checks} checks passed — Filters as a dialog with MV and price, Columns reorder with Card and Status locked, Add cards landing on the Bench.`);
