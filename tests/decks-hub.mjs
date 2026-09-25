/* r3's DECKS HUB (R3.4; wireframe 16-decks-hub, INTAKE row R3.4).
 *
 * In a real page with the committed library restored:
 *
 *   1. The head is the design's: Compare, then New deck as the primary; Compare waits for two ticks.
 *   2. Stage chips (All · Building · Playable · Complete, and Defining only when a deck is being defined)
 *      filter the tiles to that stage, and say so when none match.
 *   3. The sort is "Closest to finished" by default -- the fewest copies to buy, on order or standing in
 *      -- and also Name and Recently changed, which reads the change journal.
 *   4. Both live in the address, so Back undoes a choice and a link carries it; nothing is stored.
 *   5. Show archived sits in the bar, beside the sort.
 *
 * Every expected order is computed here from the library itself (CrankCollection.readiness and the
 * journal), never copied from the page, so the page cannot agree with itself by accident.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "decks-hub", flag: "GEOMETRY_REQUIRED"});
const tiles = (page) => page.$$eval(".cm-deck-grid [data-action=deck][data-deck]", (bs) => bs.map((b) => b.dataset.deck));
const facts = (page) => page.evaluate(async () => {
  const r = await CrankRepository.open();
  try {
    const s = await r.getState(), history = await r.history();
    const last = {};
    for (const row of history) { const id = row.operation && row.operation.deckId; if (id && !(id in last)) last[id] = row.at || ""; }
    return s.decks.filter((d) => !d.archived).map((d) => {
      const x = CrankCollection.readiness(s, d);
      return {id: d.id, name: d.name, createdAt: d.createdAt, changed: last[d.id] || d.createdAt || "",
        left: (x.toBuy || 0) + (x.ordered || 0) + (x.standIns || 0),
        stage: d.status === "draft" ? "defining" : x.complete ? "complete" : x.playable ? "playable" : "building"};
    });
  } finally { r.close(); }
});
const byName = (a, b) => a.name.localeCompare(b.name, "en-US", {numeric: true});
/* A render replaces #cm-main's content, so a marker planted before a navigation is gone once the new page
   has drawn. Waiting for the grid alone raced: the page before's "No complete decks" satisfied it. */
const mark = (page) => page.evaluate(() => { const i = document.createElement("i"); i.id = "decks-hub-stale"; i.hidden = true; document.getElementById("cm-main").append(i); });
const settle = (page) => page.waitForFunction(() => !document.getElementById("decks-hub-stale") && document.querySelector(".cm-deck-grid, .cm-decks-none"));
const go = async (page, act) => { await mark(page); await act(); await settle(page); };

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await settle(page);

  /* 1. The head. */
  eq(await page.$$eval(".cm-page-head .cm-actions > .v-button", (bs) => bs.map((b) => b.textContent.trim())), ["Compare", "New deck"], "the head holds Compare, then New deck");
  ok(await page.$eval(".cm-page-head [data-action=new-deck]", (b) => b.classList.contains("primary")), "and New deck is the primary");
  ok(await page.$eval(".cm-page-head [data-action=compare-decks]", (b) => b.disabled), "Compare waits for two ticked decks");

  /* 2 and 3. The default: every live deck, closest to finished first. */
  const all = await facts(page);
  eq(await page.$$eval(".cm-decks-stages a", (as) => as.map((a) => a.textContent)), ["All", "Building", "Playable", "Complete"],
    "the stage chips are the design's (Defining appears only when a deck is being defined)");
  eq(await page.$eval(".cm-decks-stages [aria-current=true]", (a) => a.textContent), "All", "All is the chip in force");
  eq(await page.$eval("#cm-decks-sort", (s) => s.value), "closest", "and the sort is Closest to finished");
  const closest = [...all].sort((a, b) => a.left - b.left || byName(a, b)).map((d) => d.id);
  eq(await tiles(page), closest, `closest to finished first, by copies to buy, on order or standing in: ${[...all].sort((a, b) => a.left - b.left || byName(a, b)).map((d) => `${d.name} ${d.left}`).join(", ")}`);
  ok(new Set(all.map((d) => d.left)).size > 1, "and the decks really differ in what is left, so the order proves something");

  /* The Playable chip. */
  await go(page, () => page.locator(".cm-decks-stages a", {hasText: "Playable"}).click());
  ok(/stage=playable/.test(page.url()), "the chip is in the address");
  const playable = all.filter((d) => d.stage === "playable");
  eq((await tiles(page)).sort(), playable.map((d) => d.id).sort(), `Playable shows exactly the ${playable.length} playable decks`);
  ok(playable.length > 0, "and there are some");
  ok(await page.$$eval(".cm-deck-tile .cm-pill", (ps) => ps.every((p) => /Playable/.test(p.textContent))), "each wears the Playable badge");

  /* Back undoes it: the choice is in the address. */
  await go(page, () => page.goBack());
  ok(!/stage=/.test(page.url()), "Back took the chip out of the address");
  eq(await tiles(page), closest, "Back returns to every deck, in the same order");

  /* A stage with no decks says so, with the way back. */
  const complete = all.filter((d) => d.stage === "complete");
  await go(page, () => page.evaluate(() => { location.hash = "#decks?stage=complete"; }));
  if (complete.length === 0) {
    ok(/No complete decks right now/.test(await page.locator("#cm-main").innerText()), "Complete, with none complete, says so rather than showing an empty grid");
    await go(page, () => page.getByRole("link", {name: "Show all"}).click());
    eq((await tiles(page)).length, all.length, "and Show all brings every deck back");
  } else eq((await tiles(page)).sort(), complete.map((d) => d.id).sort(), "Complete shows exactly the complete decks");

  /* Name. */
  await go(page, () => page.selectOption("#cm-decks-sort", "name"));
  ok(/sort=name/.test(page.url()), "the sort is in the address");
  eq(await tiles(page), [...all].sort(byName).map((d) => d.id), "Name sorts by the deck's name");

  /* Recently changed: change the deck that sorts last by name, and it comes first. */
  const target = [...all].sort(byName).at(-1);
  await page.evaluate(async (id) => {
    const r = await CrankRepository.open();
    try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "editDeck", deckId: id, notes: "Changed by the decks-hub suite."}, s.revision); } finally { r.close(); }
  }, target.id);
  await go(page, () => page.evaluate(() => { location.hash = "#decks?sort=recent"; }));
  const recent = [...(await facts(page))].sort((a, b) => String(b.changed).localeCompare(String(a.changed)) || byName(a, b)).map((d) => d.id);
  eq(await tiles(page), recent, "Recently changed follows the change journal");
  eq((await tiles(page))[0], target.id, `and the deck just changed (${target.name}) comes first`);
  eq(await page.$eval(".cm-decks-stages [aria-current=true]", (a) => a.getAttribute("href")), "#decks?sort=recent", "a stage chip keeps the sort in force");

  /* 5. Show archived is in the bar. */
  ok(await page.locator(".cm-decks-bar #cm-show-archived").isVisible(), "Show archived sits in the bar, beside the sort");
  ok(!(await page.$(".cm-deck-footlinks #cm-show-archived")), "and no longer in the footer");
  await context.close();

  /* A phone: the bar wraps inside the screen. */
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await loadLiveState(small, base);
  await settle(small);
  const bar = await small.$eval(".cm-decks-bar", (b) => { const r = b.getBoundingClientRect(); return {left: r.left, right: r.right}; });
  ok(bar.left >= 0 && bar.right <= 390 && await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `on a phone the bar wraps inside the screen: ${JSON.stringify(bar)}`);
  await phone.close();
} finally {
  await close();
}
console.log(`decks-hub: ${checks} checks passed — Compare and New deck in the head, stage chips and three sorts from the library's own facts, all in the address.`);
