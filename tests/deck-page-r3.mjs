/* r3's DECK PAGE, FIRST HALF (R3.5a; wireframes 29-deck-more-menu, 31-deck-guide, 11-mobile-deck-detail).
 *
 * In a real page with the committed library restored:
 *
 *   1. "Full guide and SWOT" opens Guide & SWOT as a dialog, in place: the address does not move (the first
 *      look's rule), and the dialog holds the strategy, the deck's notes, the four SWOT quarters and the
 *      recommendations. They are no longer printed at the foot of the Overview.
 *   2. The More menu leads with the design's order -- Measure, Trace in Explore, Guide & SWOT, Export /
 *      print, Compare with…, then Rename and Archive -- and still carries everything it did before.
 *      Guide & SWOT from another tab opens the Overview and the dialog; Compare with… ticks the deck.
 *   3. On an archived deck the menu offers Restore and a red Delete deck….
 *   4. On a phone the action bar is one row that scrolls sideways: every label whole, Make the change
 *      included, and the hero no longer repeats it.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "deck-page-r3", flag: "GEOMETRY_REQUIRED"});
const DECK = "deck:live:D6";
const openDeck = async (page, tab = "") => { await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(DECK)}${tab ? "&tab=" + tab : ""}`); await page.locator(".cm-deck-hero h1").waitFor({timeout: 30000}); };
const menuEntries = (page) => page.$$eval(".cm-menu:popover-open button, .cm-menu:popover-open p", (els) => els.map((el) => (el.tagName === "P" ? "§" : "") + (el.querySelector(".cm-rung-label")?.textContent || el.textContent).trim()));

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);

  /* 1. Guide & SWOT, in place. */
  await openDeck(page);
  await page.locator(".cm-plays-grid").waitFor({timeout: 30000});
  ok(!(await page.$("#cm-main #cm-sec-swot")) && !(await page.$("#cm-main #cm-sec-guide")), "the guide and the SWOT are no longer printed at the foot of the Overview");
  ok(await page.locator("#cm-sec-commander").isVisible(), "About the Commander stays on the page");
  const before = page.url();
  await page.getByRole("button", {name: "Full guide and SWOT", exact: true}).click();
  await page.locator("#cm-dialog.cm-guide-modal").waitFor();
  eq(await page.locator("#cm-dialog-title").textContent(), "Guide & SWOT · Krenko Goblins", "the dialog is titled for the deck, without its filing number");
  eq(page.url(), before, "and the address does not move: the link stays on the deck");
  const inside = await page.evaluate(() => ({
    strategy: Boolean(document.querySelector("#cm-dialog #cm-sec-guide")), notes: /Your notes/.test(document.querySelector("#cm-dialog").textContent),
    quarters: [...document.querySelectorAll("#cm-dialog .cm-swot > div h3")].map((h) => h.textContent),
    recommend: Boolean(document.querySelector('#cm-dialog [data-action="deck-suggestions"]'))}));
  ok(inside.strategy && inside.notes && inside.recommend, `the dialog holds the strategy, the notes and the recommendations: ${JSON.stringify(inside)}`);
  eq(inside.quarters.length, 4, `and the four SWOT quarters: ${inside.quarters.join(", ")}`);
  await page.locator("#cm-dialog").getByRole("button", {name: "Close", exact: true}).click();
  await page.locator("#cm-dialog").waitFor({state: "hidden"});

  /* 2. The More menu's order. */
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").waitFor();
  const entries = await menuEntries(page);
  eq(entries.slice(0, 8), ["§This deck", "Measure", "Trace in Explore", "Guide & SWOT", "Export / print", "Compare with…", "Rename & edit definition", "Archive"],
    "the More menu leads with the design's order");
  ok(entries.includes("Change the collection group") || entries.includes("Attach a collection group"), "and still carries the collection group entry (Change or Attach, as the deck has one or not)");
  for (const kept of ["Reserve available copies", "Recommendations", "Reports & advice", "About this page"])
    ok(entries.some((x) => x === kept || x.startsWith(kept)), `and still carries ${kept}`);
  ok(entries.some((x) => /^Upgrades \(\d+\)$/.test(x)), "and Upgrades with its count");
  eq(entries.at(-1), "About this page", "About this page is last");
  await page.keyboard.press("Escape");

  /* Guide & SWOT from another tab: the Overview draws, then the dialog opens. */
  await openDeck(page, "hundred");
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").getByRole("button", {name: "Guide & SWOT"}).click();
  await page.locator("#cm-dialog.cm-guide-modal #cm-sec-swot").waitFor({timeout: 30000});
  ok(!/tab=hundred/.test(page.url()), "from The hundred, Guide & SWOT goes to the Overview and opens the dialog");
  await page.keyboard.press("Escape");

  /* Compare with…: this deck is ticked on Decks. */
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").getByRole("button", {name: "Compare with…"}).click();
  await page.locator(".cm-deck-grid").waitFor();
  ok(await page.$eval(`input[data-action=compare-pick][data-deck="${DECK}"]`, (i) => i.checked), "Compare with… lands on Decks with this deck ticked");
  ok(/Tick another deck to compare with Krenko Goblins/.test(await page.locator("#cm-notice").innerText()), "and says what to do next");

  /* 3. An archived deck: Restore, and a red Delete deck…. */
  await page.evaluate(async (id) => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "archive", deckId: id, confirmed: true}, s.revision); } finally { r.close(); } }, DECK);
  await openDeck(page);
  await page.locator(".cm-deck-hero").getByRole("button", {name: /^More/}).click();
  await page.locator(".cm-menu:popover-open").waitFor();
  const archived = await menuEntries(page);
  ok(archived.includes("Restore as draft") && archived.includes("Delete deck…") && !archived.includes("Archive") && !archived.includes("Measure"), `an archived deck offers Restore and Delete, not Archive or Measure: ${archived.slice(0, 9).join(" | ")}`);
  ok(await page.$eval(".cm-menu:popover-open [data-action=delete-deck]", (b) => b.classList.contains("cm-danger")), "and Delete deck… is red");
  await page.keyboard.press("Escape");
  await context.close();

  /* 4. A phone: one row, sideways, every label whole. */
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await loadLiveState(small, base);
  await openDeck(small);
  await small.locator(".cm-action-bar").waitFor();
  const bar = await small.$eval(".cm-action-bar", (nav) => {
    const bs = [...nav.querySelectorAll(".v-button")].map((b) => ({label: b.textContent.trim(), top: Math.round(b.getBoundingClientRect().top), whole: b.scrollWidth <= b.clientWidth + 1}));
    return {bs, scrolls: nav.scrollWidth > nav.clientWidth, overflowX: getComputedStyle(nav).overflowX};
  });
  ok(new Set(bar.bs.map((b) => b.top)).size === 1, `the bar is one row: ${bar.bs.map((b) => b.label).join(" · ")}`);
  ok(bar.bs.every((b) => b.whole), `every label is whole, none cut to an ellipsis: ${JSON.stringify(bar.bs.filter((b) => !b.whole))}`);
  ok(bar.bs.some((b) => /^Make the change/.test(b.label)), "Make the change rides in the bar");
  ok(bar.overflowX === "auto" && bar.scrolls, `and the row scrolls sideways when it is wider than the screen (overflow ${bar.overflowX})`);
  ok(!(await small.locator(".cm-deck-hero [data-action=deck-change]").isVisible()), "the hero no longer repeats Make the change on a phone");
  ok(await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "and the page itself does not scroll sideways");
  await phone.close();
} finally {
  await close();
}
console.log(`deck-page-r3: ${checks} checks passed — Guide & SWOT as a dialog in place, the More menu in the design's order with nothing lost, and a phone action bar of whole labels in one sideways row.`);
