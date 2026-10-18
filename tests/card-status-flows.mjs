/* THE CARD STATUS, CHANGED FROM THE SCREENS (Rob, 2026-10-18; docs/card-states.md).
 *
 * In a real page with the committed library restored, each of the moves Rob asked for, driven the way a reader would:
 *
 *   1. A row's Status cell opens its own menu (Use, then Ownership), not the card; Quantity and Paid are text.
 *   2. An Upgrade names the card it would replace: a candidate filed in D4's group becomes an option on the deck, and
 *      nothing in the box changes.
 *   3. Reserving that Upgrade makes the card it replaces the Substitute holding its seat, and the Upgrade a Reserved
 *      card to buy.
 *   4. It arrives: Bought makes it Loading, and putting it in brings the Substitute out to the Bench in the same change.
 *   5. Reserve for another deck takes a copy from one box for another: it stays where it is, Reserved for the other
 *      deck, and its old deck's seat goes to To buy -- held by that same copy until it moves.
 *   6. A Bench copy offered for sale reads Sell; Edit changes its quantity.
 *   7. The card panel's Change status opens the same menu; the chips beside it open nothing.
 *   8. The Collection group select keeps clear of Group rows by, at 1400 and at 390 wide, and the row menu is dense.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
const require = createRequire(import.meta.url), M = require("../collection-model.js");

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const D1 = "deck:live:D1", D2 = "deck:live:D2", D4 = "deck:live:D4";

const {browser, base, stub, close} = await openBrowser({name: "card-status-flows", flag: "GEOMETRY_REQUIRED"});
const stateOf = (page) => page.evaluate(async () => { const r = await CrankRepository.open(); try { return await r.getState(); } finally { r.close(); } });
const settle = (page) => page.waitForFunction(() => document.querySelector("#cm-roster-table .cm-table"));
const revisionOf = async (page) => (await stateOf(page)).revision;
/* Wait for the change to be written, or fail with what the dialog refused. */
const changed = async (page, before) => {
  const refused = await page.waitForFunction(async (b) => { const err = document.querySelector("#cm-dialog[open] .cm-error:not([hidden])"); if (err && err.textContent.trim()) return err.textContent.trim(); const r = await CrankRepository.open(); try { return (await r.getState()).revision > b ? "ok" : false; } finally { r.close(); } }, before, {timeout: 30000}).then((h) => h.jsonValue());
  assert.equal(refused, "ok", `the change was refused: ${refused}`);
};
const statusCell = (page, record) => page.locator(`#cm-roster-table tr[data-record="${record}"] td.cm-col-status .cm-cell-menu`);
const menuItem = (page, text) => page.locator(".cm-row-menu:popover-open button", {hasText: text}).first();

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => { globalThis.__cm = C; }));
  await loadLiveState(page, base);

  /* 1. The Status cell is a menu of its own. */
  await page.goto(`${base}/index.html#cards?deck=${encodeURIComponent(D4)}`);
  await settle(page);
  let st = await stateOf(page);
  const entry = st.groups.find((g) => g.id === st.decks.find((d) => d.id === D4).groupId).entries[0];
  ok(entry, "D4's group holds a candidate filed before Upgrades named what they replace");
  const entryRecord = `entry:${st.decks.find((d) => d.id === D4).groupId}:${entry.id}`;
  await page.locator(".cm-fpage-size, [name=pageSize]").first().selectOption?.("all").catch(() => {});
  const cell = statusCell(page, entryRecord);
  if (!(await cell.count())) { await page.locator("#cm-roster-query").fill(st.cards[entry.cardId].name); await page.waitForTimeout(400); }
  ok(/Upgrade/.test(await statusCell(page, entryRecord).innerText()) && /choose what it replaces/.test(await statusCell(page, entryRecord).innerText()), "the candidate reads Upgrade, asking what it replaces");
  await statusCell(page, entryRecord).click();
  await page.locator(".cm-row-menu:popover-open").waitFor();
  eq(await page.$$eval(".cm-row-menu:popover-open .cm-menu-section", (ps) => ps.map((p) => p.textContent)), ["Use", "Ownership"], "the Status cell opens the Use moves, then the Ownership ladder");
  eq(await page.locator("#cm-dialog[open]").count(), 0, "and not the card");
  ok(!(await page.$$eval(".cm-row-menu:popover-open .cm-rung", (bs) => bs.map((b) => b.dataset.label))).some((l) => /^(To sell|Trade)$/.test(l)), "the Ownership ladder never offers To sell or Trade: they follow the Sell and Trade uses (Rob, 2026-10-18)");
  ok(await page.$$eval("#cm-roster-table td.cm-col-quantity, #cm-roster-table td.cm-col-paid", (tds) => tds.every((td) => !td.querySelector(".cm-cell-edit, input"))), "Quantity and Paid are text, not fields");

  /* 2. Choose what it replaces: it becomes an option on D4, naming a card in the box, and the box does not change. */
  const boxBefore = M.deckStatus(st, st.decks.find((d) => d.id === D4)).deckTotal;
  await menuItem(page, "Choose what it replaces").click();
  await page.locator("#cm-dialog[open] select[name=seat]").waitFor();
  const seat = await page.$eval("#cm-dialog select[name=seat]", (s) => [...s.options].find((o) => o.value && / · Final$/.test(o.textContent))?.value);
  ok(seat, "the dialog lists the deck's cards to replace");
  await page.selectOption("#cm-dialog select[name=seat]", seat);
  let rev = await revisionOf(page);
  await page.locator("#cm-dialog button[type=submit]").click();
  await changed(page, rev);
  st = await stateOf(page);
  const deck4 = () => st.decks.find((d) => d.id === D4);
  const option = deck4().slots.find((r) => r.cardId === entry.cardId && r.purpose === "upgrade");
  const replaced = deck4().slots.find((r) => r.id === seat);
  ok(option && option.replaces === seat && !option.committed, `${st.cards[entry.cardId].name} is an Upgrade for D4 that would replace ${st.cards[replaced.cardId].name}`);
  ok(!st.groups.find((g) => g.id === deck4().groupId).entries.some((r) => r.id === entry.id), "and it left the group, so it is one record");
  const replacedLot = st.lots.find((l) => l.allocation?.deckId === D4 && l.allocation.slotId === seat && l.location?.kind === "deck");
  eq(M.stateReader(st)({...replacedLot, kind: "lot"}).use, "final", "the card it would replace stays Final: an Upgrade changes nothing in the box");
  eq(M.deckStatus(st, deck4()).deckTotal, boxBefore, "and the box holds what it held");

  /* 3. Reserve it: the replaced card stands in, the Upgrade is Reserved and to buy. */
  const optionRecord = `plan:${D4}:${option.id}`;
  await page.goto(`${base}/index.html#cards?deck=${encodeURIComponent(D4)}`);
  await settle(page);
  await page.locator("#cm-roster-query").fill(st.cards[entry.cardId].name);
  await statusCell(page, optionRecord).waitFor({timeout: 15000});
  await statusCell(page, optionRecord).click();
  await menuItem(page, "Reserve it").click();
  await page.locator("#cm-dialog[open] button[type=submit]").waitFor();
  rev = await revisionOf(page);
  await page.locator("#cm-dialog button[type=submit]").click();
  await changed(page, rev);
  st = await stateOf(page);
  const read = M.stateReader(st), need = M.projection(st).find((r) => r.kind === "need" && r.deckId === D4 && r.cardId === entry.cardId);
  ok(need, "the Upgrade is now a seat on D4's list");
  const needSt = read(need);
  eq([needSt.use, needSt.ownership, needSt.replaces], ["reserved", "buy", replaced.cardId], "Reserved, to buy, replacing the card it named");
  const subSt = read({...st.lots.find((l) => l.id === replacedLot.id), kind: "lot"});
  eq([subSt.use, subSt.holds], ["substitute", entry.cardId], `${st.cards[replaced.cardId].name} stays in the box as the Substitute holding its seat`);
  eq(M.deckStatus(st, deck4()).deckTotal, boxBefore, "and the box still holds what it held");

  /* 4. It arrives: Bought, then put in; the substitute comes out to the Bench in the same change. */
  await page.goto(`${base}/index.html#cards?tab=buy`);
  await settle(page);
  await page.locator("#cm-roster-query, #cm-shop-query").first().fill(st.cards[entry.cardId].name).catch(() => {});
  await page.waitForTimeout(400);
  const buyBtn = page.locator(`#cm-roster-table tr[data-record="${need.recordId}"] [data-action=shop-buy]`);
  if (await buyBtn.count()) {
    rev = await revisionOf(page);
    await buyBtn.click();
    if (await page.locator("#cm-dialog[open] button[type=submit]").count()) await page.locator("#cm-dialog button[type=submit]").click();
    await changed(page, rev);
    st = await stateOf(page);
    const bought = st.lots.find((l) => l.cardId === entry.cardId && l.allocation?.deckId === D4);
    ok(bought && bought.source === "owned", "Bought: the copy is owned and claimed by D4's seat");
    eq(M.stateLabel(M.stateReader(st)({...bought, kind: "lot"})), "Loading", "and it is Loading");
    await page.goto(`${base}/index.html#cards?deck=${encodeURIComponent(D4)}`);
    await settle(page);
    await page.locator("#cm-roster-query").fill(st.cards[entry.cardId].name);
    await page.locator(`#cm-roster-table tr[data-record="${bought.id}"] [data-action=place-now]`).waitFor({timeout: 15000});
    rev = await revisionOf(page);
    await page.locator(`#cm-roster-table tr[data-record="${bought.id}"] [data-action=place-now]`).click();
    await changed(page, rev);
    st = await stateOf(page);
    eq(M.stateReader(st)({...st.lots.find((l) => l.cardId === entry.cardId && l.allocation?.deckId === D4), kind: "lot"}).use, "final", "put in, it is Final");
    eq(st.lots.find((l) => l.id === replacedLot.id).location.kind, "bench", `and ${st.cards[replaced.cardId].name} went to the Bench in the same change`);
    eq(M.deckStatus(st, deck4()).deckTotal, boxBefore, "the box still holds its hundred");
  } else ok(false, "the To buy tab offers Bought on the Reserved card");

  /* 5. Reserve for another deck: a Final copy in D1's box, for D2. */
  st = await stateOf(page);
  /* A colorless card, so D2's color identity takes it; one D2's list does not name already. */
  const colorless = await page.evaluate((ids) => ids.filter((id) => { const c = globalThis.__cm?.card?.(id) || null; return c && !(c.colorIdentity || []).length && !/Basic/.test(c.typeLine || "") && !/Land/.test(c.typeLine || ""); }), st.lots.map((l) => l.cardId));
  const d1lot = st.lots.find((l) => colorless.includes(l.cardId) && l.source === "owned" && l.quantity === 1 && l.allocation?.deckId === D1 && l.location?.kind === "deck" && l.location.deckId === D1 && !st.decks.find((d) => d.id === D1).commanders.includes(l.cardId) && !st.decks.find((d) => d.id === D2).slots.some((r) => r.cardId === l.cardId));
  ok(d1lot, `a colorless Final copy in D1 that D2's list does not name (${colorless.length} colorless cards known)`);
  await page.goto(`${base}/index.html#cards?deck=${encodeURIComponent(D1)}`);
  await settle(page);
  await page.locator("#cm-roster-query").fill(st.cards[d1lot.cardId].name);
  await statusCell(page, d1lot.id).waitFor({timeout: 15000});
  await statusCell(page, d1lot.id).click();
  await menuItem(page, "Reserve for another deck").click();
  await page.locator("#cm-dialog[open] select[name=deck]").waitFor();
  await page.selectOption("#cm-dialog select[name=deck]", D2);
  const d2seat = await page.$eval("#cm-dialog select[name=seat]", (s) => [...s.options].find((o) => o.value && o.value !== "new" && /Final, becomes its Substitute/.test(o.textContent))?.value);
  ok(d2seat, "D2's Final cards are offered to replace");
  await page.selectOption("#cm-dialog select[name=seat]", d2seat);
  eq(await page.$eval("#cm-dialog select[name=copy]", (s) => s.value), d1lot.id, "the copy in D1 is the one chosen");
  ok(await page.$eval("#cm-dialog [name=replaceDonor]", (c) => c.checked), "and a replacement for D1 goes on To buy unless unticked");
  rev = await revisionOf(page);
  await page.locator("#cm-dialog button[type=submit]").click();
  await changed(page, rev);
  st = await stateOf(page);
  const moved = st.lots.find((l) => l.cardId === d1lot.cardId && l.allocation?.deckId === D2);
  ok(moved && moved.location.deckId === D1, "the copy is claimed by D2 and still sits in D1's box");
  eq(M.stateReader(st, D2)({...moved, kind: "lot"}).use, "reserved", "from D2 it is Reserved, in D1");
  eq(M.stateReader(st, D2)({...moved, kind: "lot"}).from, D1, "and says where it is");
  const d1need = M.projection(st).find((r) => r.kind === "need" && r.deckId === D1 && r.cardId === d1lot.cardId);
  eq([M.stateReader(st)(d1need).use, M.stateReader(st)(d1need).replaces], ["reserved", d1lot.cardId], "D1's seat goes to To buy, held by that same copy until it moves");
  eq(M.deckStatus(st, st.decks.find((d) => d.id === D1)).deckTotal, 100, "and D1's box still holds its hundred");

  /* 6. A Bench copy offered for sale reads Sell; Edit changes its quantity. */
  const bench = st.lots.find((l) => l.source === "owned" && l.quantity === 1 && M.stateReader(st)({...l, kind: "lot"}).use === "bench");
  await page.goto(`${base}/index.html#cards`);
  await settle(page);
  await page.locator("#cm-roster-query").fill(st.cards[bench.cardId].name);
  await statusCell(page, bench.id).waitFor({timeout: 15000});
  await statusCell(page, bench.id).click();
  await menuItem(page, "Offer to sell").click();
  await page.locator("#cm-dialog[open] button[type=submit]").waitFor();
  rev = await revisionOf(page);
  await page.locator("#cm-dialog button[type=submit]").click();
  await changed(page, rev);
  await page.waitForFunction((id) => /Sell/.test(document.querySelector(`#cm-roster-table tr[data-record="${id}"] td.cm-col-status`)?.textContent || ""), bench.id, {timeout: 15000});
  st = await stateOf(page);
  eq([st.lots.find((l) => l.id === bench.id).offer, st.lots.find((l) => l.id === bench.id).offerKind], ["available", "sell"], "it is offered, for sale, and its row reads Sell");
  eq(M.stateReader(st)({...st.lots.find((l) => l.id === bench.id), kind: "lot"}).ownership, "sell", "and its ownership is To sell, set by the use, not chosen");
  await statusCell(page, bench.id).click();
  await page.locator(".cm-row-menu:popover-open").waitFor();
  const rungs = await page.$$eval(".cm-row-menu:popover-open .cm-rung", (bs) => bs.map((b) => [b.dataset.label, b.disabled]));
  eq(rungs.filter(([, d]) => d), [["To sell", true]], "the Ownership section shows To sell as the current rung, locked");
  ok(!rungs.some(([l, d]) => !d && /^(To sell|Trade)$/.test(l)), "and offers neither To sell nor Trade to choose");
  await page.keyboard.press("Escape");
  await page.locator(`#cm-roster-table tr[data-record="${bench.id}"] [data-action=row-actions]`).click();
  await page.locator(".cm-row-menu:popover-open button", {hasText: /^Edit$/}).click();
  await page.locator("#cm-dialog[open] input[name=quantity]").fill("2");
  rev = await revisionOf(page);
  await page.locator("#cm-dialog button[type=submit]").click();
  await changed(page, rev);
  eq((await stateOf(page)).lots.find((l) => l.id === bench.id).quantity, 2, "Edit (it was Edit print & details) changes the quantity");

  /* 7. The card panel: Change status opens the same menu. */
  await page.locator(`#cm-roster-table tr[data-record="${bench.id}"] .cm-card-name`).first().click();
  await page.locator("#cm-dialog[open] .cm-standing").waitFor();
  await page.locator("#cm-dialog .cm-standing [data-action=card-status]").click();
  await page.locator(".cm-row-menu:popover-open").waitFor();
  ok((await page.$$eval(".cm-row-menu:popover-open .cm-menu-section", (ps) => ps.map((p) => p.textContent))).includes("Ownership"), "the card panel's Change status opens the row's menu");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"));

  /* 8. Geometry: the toolbar's two selects never overlap; the row menu's entries are lines, not bands. */
  for (const width of [1400, 390]) {
    await page.setViewportSize({width, height: 900});
    await page.goto(`${base}/index.html#cards`);
    await settle(page);
    const box = await page.evaluate(() => { const a = document.querySelector("select[name=groupPick]")?.getBoundingClientRect(), b = document.querySelector("select[name=groupBy]")?.getBoundingClientRect(); return a && b ? {a: [a.left, a.right, a.top, a.bottom], b: [b.left, b.right, b.top, b.bottom]} : null; });
    ok(box, `both selects are on the page at ${width}`);
    const overlap = box.a[0] < box.b[1] && box.b[0] < box.a[1] && box.a[2] < box.b[3] && box.b[2] < box.a[3];
    ok(!overlap, `at ${width} wide the Collection group select and Group rows by do not overlap (${JSON.stringify(box)})`);
  }
  await page.setViewportSize({width: 1400, height: 900});
  await page.goto(`${base}/index.html#cards`);
  await settle(page);
  await page.locator("#cm-roster-table [data-action=row-actions]").first().click();
  const heights = await page.$$eval(".cm-row-menu:popover-open > button", (bs) => bs.map((b) => b.getBoundingClientRect().height));
  ok(heights.length > 2 && heights.every((h) => h <= 34), `the row menu's entries are dense (${heights.map((h) => Math.round(h)).join(", ")} px)`);
  await context.close();
} finally {
  await close();
}
console.log(`card-status-flows: ${checks} checks passed — Upgrade, Reserve, arrival, another deck's copy, Sell, Edit, the card panel and the toolbar, from the screens.`);
