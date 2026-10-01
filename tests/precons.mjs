/* START FROM A PRECON (R3.10b; INTAKE row R3.10, decision M1 · 4).
 *
 * data/precons.json is every Commander precon Wizards has published, built from MTGJSON by tools/build-precons.mjs,
 * whose own --check holds the file to its promises offline (tests/generators.mjs runs it). This is the reader's side,
 * in a real page:
 *
 *   1. The landing page's "Start from a precon" and the New deck wizard's "From a precon" open one picker: every
 *      precon, newest first, each with its commander(s), colors, set and a US date ("Releases" before it is out).
 *   2. It searches by deck, commander or set code, partners included.
 *   3. A choice comes in as a list in the app's own import, commander first, named after the deck, a hundred cards,
 *      to review before anything is saved.
 *   4. A precon holding a card banned since it was printed says so before the review.
 *   5. The file is fetched only when the picker opens, once.
 *   6. (Rob, 2026-10-01) A deck made from a precon -- marked as one when it is made, or recognized by its collection
 *      group named after the newest release's precon and led by its commander -- is bought as one product: the header
 *      says which precon; Save, with one question and two buttons, stands for Finalize; Acquire reads Buy the precon,
 *      the $ Price and one Buy the Precon (Amazon), no buy list or orders; The hundred drops each card's To buy for
 *      one Buy the Precon; the Cost card and the Next line say the same. A deck that is not a precon is untouched.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const data = JSON.parse(readFileSync(new URL("../data/precons.json", import.meta.url), "utf8"));
const latest = JSON.parse(readFileSync(new URL("../data/precons-latest.json", import.meta.url), "utf8"));
const byId = new Map(data.decks.map((d) => [d.id, d]));
const us = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {month: "short", day: "numeric", year: "numeric"});

const {browser, base, stub, close} = await openBrowser({name: "precons", flag: "GEOMETRY_REQUIRED"});
const fresh = async () => {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const fetched = [];
  page.on("request", (r) => { if (/\/data\/precons\.json/.test(r.url())) fetched.push(r.url()); });
  return {context, page, fetched};
};
const rows = (page) => page.$$eval("#cm-precon-list .cm-precon", (bs) => bs.map((b) => ({id: b.dataset.precon, text: b.innerText.replace(/\s+/g, " ").trim(), pips: b.querySelectorAll(".cm-pip").length})));
const search = async (page, text) => { await page.locator("#cm-precon-q").fill(text); await page.waitForTimeout(150); return rows(page); };

try {
  {
    const {context, page, fetched} = await fresh();
    await page.goto(`${base}/index.html`);
    await page.locator(".cm-landing [data-action=start-precon]").waitFor({timeout: 60000});
    await page.waitForTimeout(800);
    eq(fetched.length, 0, "the precon list is not fetched until the picker opens");

    /* 0. New from Wizards (Rob, 2026-09-30): the newest release's precons on the landing page, from the small file. */
    await page.locator("#cm-landing-precons:not([hidden]) .cm-precon-chip").first().waitFor({timeout: 30000});
    const chips = await page.$$eval("#cm-landing-precons .cm-precon-chip", (bs) => bs.map((b) => ({id: b.dataset.precon, text: b.innerText.replace(/\s+/g, " ").trim(), pips: b.querySelectorAll(".cm-pip").length})));
    eq(chips.map((c) => c.id), latest.decks.map((d) => d.id), `the landing page offers the newest release's precons, ${latest.decks.length} of them, from data/precons-latest.json`);
    ok(chips.every((c, i) => c.text.startsWith(latest.decks[i].name) && c.pips === new Set(latest.decks[i].commander.flatMap((x) => x.colorIdentity)).size), "each chip names the deck and its commander's colors");
    const head = (await page.locator("#cm-landing-precons .cm-precon-latest-head").innerText()).replace(/\s+/g, " ");
    ok(/New from Wizards/i.test(head) && latest.decks.every((d) => head.includes(d.setName)) && head.includes(us(latest.releaseDate)), `the strip names the sets and the US date: "${head}"`);
    eq(fetched.length, 0, "and still the full list was not fetched");
    const fracture = latest.decks.find((d) => /Reality Fracture/.test(d.setName)) || latest.decks[0];
    await page.locator(`#cm-landing-precons [data-precon="${fracture.id}"]`).click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    eq(await page.inputValue("#cm-dialog input[name=name]"), fracture.name, `one click starts it: ${fracture.name} (${fracture.setName}) is in the review, named`);
    eq((await page.$eval("#cm-dialog textarea[name=text]", (t) => t.value)).split("\n").reduce((n, l) => n + Number(l.split(" ")[0]), 0), 100, "a hundred cards");
    eq(fetched.length, 1, "the full list was fetched for it, once");
    await page.keyboard.press("Escape");
    fetched.length = 0;

    /* 1. The picker. */
    await page.locator(".cm-landing [data-action=start-precon]").click();
    await page.locator("#cm-precon-list .cm-precon").first().waitFor({timeout: 30000});
    eq((await page.locator("#cm-dialog[open] h2").first().textContent()).trim(), "Start from a precon", "the landing page's Start from a precon opens the picker");
    eq((await page.locator("#cm-precon-n").innerText()).trim(), `${data.decks.length} of ${data.decks.length} Commander precons, newest first`, "it says how many there are");
    const first = await rows(page);
    eq(first.map((r) => r.id).slice(0, 5), data.decks.slice(0, 5).map((d) => d.id), "newest first");
    eq(first.length, 60, "sixty at a time, with a word to narrow the search for the rest");
    const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`, top = byId.get(first[0].id);  /* the reader's calendar date, as the app reads it */
    ok(first[0].text.includes(`${top.code} · ${top.releaseDate > today ? "Releases " : ""}${us(top.releaseDate)}`), `each row says its set and a US date: "${first[0].text}"`);
    ok(first.every((r) => r.pips === new Set(byId.get(r.id).commander.flatMap((c) => c.colorIdentity)).size), "and its commander's colors");

    /* 2. Search, partners included. */
    const doctor = await search(page, "sarah jane");
    ok(doctor.length >= 1 && doctor.every((r) => /Sarah Jane Smith/.test(r.text)) && doctor.some((r) => / \+ /.test(r.text)), "a partner is found by either name, and the row names both");
    eq((await search(page, "WOC")).map((r) => r.id).sort(), data.decks.filter((d) => d.code === "WOC").map((d) => d.id).sort(), "a set code finds that set's precons");
    eq(await search(page, "no such precon anywhere"), [], "and nothing is nothing");
    ok(/No precon matches/.test(await page.locator("#cm-precon-list").innerText()), "said so");

    /* 3. A choice. */
    const pick = data.decks.find((d) => d.commander.length === 1 && !d.notInUniverse);
    await search(page, pick.commander[0].name);
    await page.locator(`#cm-precon-list [data-precon="${pick.id}"]`).click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    eq((await page.locator("#cm-dialog[open] h2").first().textContent()).trim(), "Import cards or a deck list", "a choice opens the app's own import, to review before saving");
    const lines = (await page.$eval("#cm-dialog textarea[name=text]", (t) => t.value)).split("\n");
    eq(lines[0], `1 ${pick.commander[0].name}`, "the commander first");
    eq(lines.reduce((n, l) => n + Number(l.split(" ")[0]), 0), 100, "a hundred cards");
    eq(await page.inputValue("#cm-dialog input[name=name]"), pick.name, "named after the precon");
    eq(fetched.length, 0, "the list was not fetched again (it was cached by the click above)");
    await page.keyboard.press("Escape");

    /* 4. A card banned since it was printed. */
    const banned = data.decks.find((d) => d.notInUniverse && d.notInUniverse.includes("Dockside Extortionist"));
    ok(banned, "the committed list has a precon holding a card banned since (Dockside Extortionist)");
    await page.locator(".cm-landing [data-action=start-precon]").click();
    await page.locator("#cm-precon-list .cm-precon").first().waitFor({timeout: 30000});
    await search(page, banned.name);
    await page.locator(`#cm-precon-list [data-precon="${banned.id}"]`).click();
    await page.waitForFunction(() => document.querySelector("#cm-dialog[open] textarea[name=text]"), null, {timeout: 30000});
    ok(/Dockside Extortionist.*banned since it was printed/.test(await page.locator("#cm-notice").innerText()), "a precon with a banned card says so before the review");
    eq(fetched.length, 0, "and the list was not fetched again");
    await context.close();
  }
  /* 1. The New deck wizard's From a precon. */
  {
    const {context, page} = await fresh();
    await page.goto(`${base}/index.html#decks`);
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
    await page.locator(".cm-page-head [data-action=new-deck]").click();
    await page.locator("#cm-dialog [data-action=start-precon]").click();
    await page.locator("#cm-precon-list .cm-precon").first().waitFor({timeout: 30000});
    eq((await page.locator("#cm-dialog[open] h2").first().textContent()).trim(), "Start from a precon", "New deck offers From a precon, the same picker");
    await page.keyboard.press("Escape");
    await page.locator("#cm-precon-latest:not([hidden]) .cm-precon-chip").first().waitFor({timeout: 30000});
    eq(await page.$$eval("#cm-precon-latest .cm-precon-chip", (bs) => bs.map((b) => b.dataset.precon)), latest.decks.map((d) => d.id), "the Decks hub carries the same New from Wizards strip");
    /* Rob, 2026-09-30: on the Decks page, the pointer on a precon shows its commander's card, and moving off puts it away. */
    await page.locator("#cm-precon-latest .cm-precon-chip").first().hover();
    await page.locator(".cm-hover-art:not([hidden]) img[src]").waitFor({timeout: 10000});
    const pop = await page.evaluate(() => {const box = document.querySelector(".cm-hover-art"), chip = document.querySelector("#cm-precon-latest .cm-precon-chip"), r = box.getBoundingClientRect(), c = chip.getBoundingClientRect(); return {card: chip.dataset.card, src: box.querySelector("img").getAttribute("src"), beside: r.left >= c.right - 1 || r.right <= c.left + 1, w: Math.round(r.width)};});
    ok(pop.card === latest.decks[0].commander[0].name && pop.src && pop.beside && pop.w >= 300, `the pointer on a precon shows its commander's card beside it, ${pop.w}px (${pop.card})`);
    await page.mouse.move(5, 5);
    await page.locator(".cm-hover-art").waitFor({state: "hidden", timeout: 5000});
    ok(true, "and it goes when the pointer moves off the precon");
    await context.close();
  }
  /* 6. A PRECON'S OWN PATH. */
  {
    const {context, page} = await fresh();
    await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
    await loadLiveState(page, base);
    await page.goto(`${base}/index.html#decks`);
    await page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
    const fracture = byId.get("MultiverseReforged_FRC"), angels = byId.get("CallingAllAngels_FDC");
    const made = await page.evaluate(async ([fr, an]) => {const C = globalThis.__cm;
      const deckOf = async (p, deckId, marker) => {
        const names = [...p.commander.map((c) => c.name), ...p.cards.map(([n]) => n)];
        const cards = names.map((n) => C.catalog.exact(n)).filter(Boolean);
        const gid = "group:" + deckId;
        await C.commit({type: "createGroup", groupId: gid, name: p.name}, {renderView: false});
        const lead = cards.find((c) => c.name === p.commander[0].name);
        const slots = [{cardId: lead.id, quantity: 1}, ...p.cards.map(([n, q]) => ({cardId: (C.catalog.exact(n) || {}).id, quantity: q})).filter((r) => r.cardId)];
        await C.commit({type: "createDeck", deckId, name: lead.name + " deck", commanders: [lead.id], groupId: gid, slots, cards, ...(marker ? {precon: marker} : {})}, {renderView: false});
        return C.state.decks.find((d) => d.id === deckId);
      };
      const a = await deckOf(fr, "deck:fracture");
      const b = await deckOf(an, "deck:angels", {id: an.id, name: an.name, setName: an.setName});
      let bad = "";
      try {await C.commit({type: "createDeck", deckId: "deck:bad", name: "Bad", commanders: [a.commanders[0]], slots: [], precon: {id: "", name: "x"}}, {renderView: false});} catch (err) {bad = err.message;}
      return {aMarker: a.precon || null, bMarker: b.precon || null, badPrecon: (C.state.decks.find((d) => d.id === "deck:bad") || {}).precon ?? null, bad};}, [fracture, angels]);
    eq([made.aMarker, made.bMarker], [null, {id: angels.id, name: angels.name, setName: angels.setName || ""}], "a deck made with the precon's marker keeps it; one made without it carries none");
    eq(made.badPrecon, null, "and a marker with no id is not stored" + (made.bad ? ` (${made.bad})` : ""));
    /* Recognized by its group and commander: the newest release's Multiverse Reforged, led by Jace. */
    await page.goto(`${base}/index.html#decks?deck=deck%3Afracture`);
    await page.locator(".cm-deck-hero .cm-precon-badge").waitFor({timeout: 30000});
    eq((await page.locator(".cm-deck-hero .cm-precon-badge").innerText()).trim(), "Precon · Multiverse Reforged", "the deck made from Multiverse Reforged is recognized by its group and commander, and the header says so");
    const hero = await page.locator(".cm-deck-hero").innerText();
    ok(/\bSave\b/.test(hero) && !/Finalize/.test(hero), "Save stands where Finalize did");
    const cost = await page.evaluate(() => {const c = document.querySelector(".cm-bento-cost"); return c ? {text: c.innerText, href: c.querySelector("[data-precon-buy]")?.href || ""} : null;});
    ok(cost && /\$49\.99/.test(cost.text) && /\$ Price/i.test(cost.text) && /amazon\.com\/dp\/B0GXC9SDV9/.test(cost.href), `the Overview's Cost card reads the $49.99 list price, with Buy the Precon (${cost && cost.href})`);
    ok(/buy the precon/i.test(await page.locator(".cm-deck-next, .cm-bento-next").first().innerText().catch(() => "")), "and the Next line says to buy the precon");
    await page.getByRole("tab", {name: /^Acquire/}).click();
    await page.locator("#cm-sec-acquire.cm-acquire-precon").waitFor({timeout: 15000});
    const acq = await page.evaluate(() => {const s = document.getElementById("cm-sec-acquire"); const t = s.innerText;
      return {buy: [...s.querySelectorAll("a, button")].map((x) => [x.textContent.trim(), x.getAttribute("href") || ""]), text: t, tab: document.querySelector("[data-tab=acquire]").innerText.trim()};});
    eq(acq.buy, [["Buy the Precon", "https://www.amazon.com/dp/B0GXC9SDV9"]], "Acquire offers one thing: Buy the Precon, to the precon on Amazon");
    ok(/Buy the precon/.test(acq.text) && /\$49\.99/.test(acq.text) && /\$ Price/i.test(acq.text), "it reads Buy the precon and the $ Price, $49.99");
    ok(!/Track what this deck needs|View orders|buy list shows|To buy|Ordered|to finish/i.test(acq.text), `and none of the buy list's words: no To buy, Ordered, $ to finish, View orders or the sentence under them (${acq.text.replace(/\s+/g, " ")})`);
    eq(acq.tab, "Acquire", "the Acquire tab carries no count of singles to buy");
    await page.getByRole("tab", {name: /^The hundred/}).click();
    await page.locator("#cm-sec-cards").waitFor({timeout: 15000});
    const hundred = await page.evaluate(() => {const s = document.getElementById("cm-sec-cards");
      return {head: [...s.querySelectorAll(".cm-deck-cards-head .cm-actions > *")].map((x) => x.textContent.trim()), toBuy: [...s.querySelectorAll(".cm-deck-flags")].filter((f) => /To buy/.test(f.textContent)).length, rows: s.querySelectorAll(".cm-deck-list li").length};});
    eq(hundred.head, ["View deck cards", "Export deck list", "Buy the Precon"], "The hundred's head: View deck cards, Export deck list, and Buy the Precon beside them");
    ok(hundred.rows > 50 && hundred.toBuy === 0, `and no card of its ${hundred.rows} rows says To buy: the precon brings them`);
    ok(/buy the precon for the \d+ cards you do not own/.test(await page.locator("#cm-sec-cards .cm-deck-playable").innerText()), "and the playable line says to buy the precon for the cards not owned");
    /* Save: one question, two buttons, and the deck is saved. */
    await page.getByRole("tab", {name: /^Overview/}).click();
    await page.locator(".cm-deck-hero").getByRole("button", {name: "Save", exact: true}).click();
    await page.locator("#cm-dialog[open] .cm-precon-save").waitFor({timeout: 10000});
    const dlg = await page.evaluate(() => {const d = document.querySelector("#cm-dialog[open]"); return {title: d.querySelector("#cm-dialog-title")?.textContent.trim(), buttons: [...d.querySelectorAll("button")].map((x) => x.textContent.trim()).filter((t) => t && t !== "×"), text: d.innerText.replace(/\s+/g, " ").trim()};});
    eq([dlg.title, dlg.buttons.filter((t) => t !== "Close")], ["Confirm save deck to your decks?", ["Cancel", "Confirm Changes"]], "Save asks one question, Confirm save deck to your decks?, with Cancel and Confirm Changes");
    ok(!/reserved|buy list|Scryfall|planned|owned/i.test(dlg.text), `and nothing else: ${dlg.text}`);
    await page.locator("#cm-dialog[open]").getByRole("button", {name: "Confirm Changes"}).click();
    const after = await page.waitForFunction(() => {const d = globalThis.__cm.state.decks.find((x) => x.id === "deck:fracture"); const n = document.querySelector("#cm-notice"); return d.status === "final" ? "final" : (n && !n.hidden && n.textContent.trim()) ? "refused: " + n.textContent.trim() : null;}, null, {timeout: 15000}).then((h) => h.jsonValue());
    eq(after, "final", "Confirm Changes saves the deck, as Finalize did");
    await page.waitForFunction(() => /Saved .* to your decks/.test(document.querySelector("#cm-notice")?.textContent || ""), null, {timeout: 10000});
    ok(true, "and says it was saved to your decks, not finalized");
    await page.goto(`${base}/index.html#decks`);
    await page.goto(`${base}/index.html#decks?deck=deck%3Afracture`);
    await page.locator(".cm-deck-hero .cm-precon-badge").waitFor({timeout: 30000});
    const saved = await page.evaluate(() => {const h = document.querySelector(".cm-deck-hero"); return {buy: [...h.querySelectorAll("[data-precon-buy]")].length, list: /Buy list/.test(h.innerText)};});
    eq(saved, {buy: 1, list: false}, "saved, the header offers Buy the Precon where a deck's Buy list would be");
    /* Marked when made, with no link recorded: the price is a dash, and Buy the Precon searches Amazon for it. */
    await page.goto(`${base}/index.html#decks?deck=deck%3Aangels&tab=acquire`);
    await page.locator("#cm-sec-acquire.cm-acquire-precon").waitFor({timeout: 30000});
    const ang = await page.evaluate(() => {const s = document.getElementById("cm-sec-acquire"); return {text: s.innerText, href: s.querySelector("[data-precon-buy]").href};});
    ok(/—/.test(ang.text) && /amazon\.com\/s\?k=/.test(ang.href) && /Calling%20All%20Angels/.test(ang.href), `a precon with no recorded link shows a dash for its price and searches Amazon for it (${ang.href})`);
    /* A deck that is not a precon is untouched. */
    await page.goto(`${base}/index.html#decks?deck=deck%3Alive%3AD1&tab=acquire`);
    await page.locator("#cm-sec-acquire").waitFor({timeout: 30000});
    const d1 = await page.evaluate(() => ({precon: !!document.querySelector(".cm-precon-badge, .cm-acquire-precon, [data-precon-buy]"), text: document.getElementById("cm-sec-acquire").innerText}));
    ok(!d1.precon && /Buy list/.test(d1.text) && /View orders/.test(d1.text), "Rob's D1, not a precon, keeps its buy list and orders");
    await context.close();
  }
} finally {
  await close();
}
console.log(`precons: ${checks} checks passed — ${data.decks.length} Commander precons, newest first, searchable, each coming in as a hundred-card list to review.`);
