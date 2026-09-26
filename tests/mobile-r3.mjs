/* MOBILE (R3.12; INTAKE row R3.12, wireframes mobile-decks, mobile-library, mobile-explore, mobile-deck-detail).
 *
 * Rob's library at 390 × 844, the phone the wireframes draw (and 320, the narrowest), in a real page:
 *
 *   Shell     the rail is a top row: the four pages in one line at the top, and no page scrolls sideways.
 *   Decks     the tiles stack, one to a row, as landscape posters, and every tile's reading is whole.
 *   Library   its actions are one row at the foot that scrolls sideways, Add cards first; the page makes room for
 *             it. At 1400 they stay in the head.
 *   Explore   the doors stack.
 *   Deck      the action row is one row at the foot that scrolls sideways, each label whole (CW-MOB-02); the
 *             commander's card follows the card-size slider, and at both ends of the phone's range (60% and 130%)
 *             it is legible and leaves the deck's name in the first screen (AGENTS.md, "Sizes are sliders").
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const W = 390, H = 844;

const {browser, base, stub, close} = await openBrowser({name: "mobile-r3", flag: "GEOMETRY_REQUIRED"});
/* What a phone reader sees of a page: its sideways scroll, and the rail's four links. */
const shell = (page) => page.evaluate(() => {
  const links = [...document.querySelectorAll("a, button")].filter((a) => ["Decks", "Library", "Explore", "Play"].includes(a.textContent.trim()) && a.closest("nav, header, .cm-rail, #cm-rail") && a.getBoundingClientRect().width).map((a) => a.getBoundingClientRect());
  return {sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, tops: links.map((r) => Math.round(r.top)), bottom: Math.max(...links.map((r) => r.bottom)), n: links.length};
});
/* A row of buttons pinned to the foot: where it sits, whether it is one line, what it holds, and whether any label is cut. */
const footRow = (page, sel) => page.$eval(sel, (bar) => {
  const r = bar.getBoundingClientRect(), kids = [...bar.children].filter((k) => k.getBoundingClientRect().width).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);  /* as the reader sees them, left to right */
  return {position: getComputedStyle(bar).position, top: r.top, bottom: r.bottom, height: r.height, width: r.width,
    lines: new Set(kids.map((k) => Math.round(k.getBoundingClientRect().top))).size, labels: kids.map((k) => k.textContent.trim().replace(/\s+/g, " ")),
    first: kids[0] && kids[0].dataset.action, primary: kids[0] && kids[0].classList.contains("primary"),
    cut: kids.filter((k) => k.scrollWidth > k.clientWidth + 1).map((k) => k.textContent.trim()), scrolls: bar.scrollWidth > bar.clientWidth, overflowX: getComputedStyle(bar).overflowX};
});
const settle = async (page, hash, sel) => { await page.goto(`${base}/index.html${hash}`); await page.locator(sel).first().waitFor({timeout: 60000}); await page.waitForTimeout(600); };

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  /* At 1400 first: the Library's actions are in its head, not at the foot. */
  await settle(page, "#cards", "#cm-roster-table");
  eq(await page.$eval(".cm-page-head .cm-actions:has(>[data-action=roster-more])", (x) => getComputedStyle(x).position), "static", "at 1400 the Library's actions stay in its head");

  await page.setViewportSize({width: W, height: H});
  const deckId = await page.evaluate(async () => { const r = await CrankRepository.open(); try { return (await r.getState()).decks.find((d) => !d.archived).id; } finally { r.close(); } });

  /* Decks. */
  await settle(page, "#decks", ".cm-deck-tile");
  const top = await shell(page);
  ok(top.n === 4 && new Set(top.tops).size === 1 && top.bottom < 80, `the rail is a top row: the four pages in one line at the top (${JSON.stringify(top)})`);
  eq(top.sideways, 0, "Decks does not scroll sideways");
  const tiles = await page.$$eval(".cm-deck-grid .cm-deck-tile", (ts) => ts.map((t) => { const r = t.getBoundingClientRect(); return {left: Math.round(r.left), width: r.width, height: r.height, cut: [...t.querySelectorAll(".cm-tile-caption>span")].some((s) => s.scrollWidth > s.clientWidth + 1)}; }));
  const grid = await page.$eval(".cm-deck-grid", (g) => g.getBoundingClientRect().width);
  ok(tiles.length >= 6 && new Set(tiles.map((t) => t.left)).size === 1 && tiles.every((t) => Math.abs(t.width - grid) < 1), `the tiles stack, one to a row, the width of the page (${tiles.length} at ${Math.round(grid)}px)`);
  ok(tiles.every((t) => t.height < t.width), "each is a landscape poster, so a phone shows more than one deck at a time");
  ok(tiles.every((t) => !t.cut), "and every tile's reading is whole, not cut to an ellipsis");

  /* Library. */
  await settle(page, "#cards", "#cm-roster-table");
  eq((await shell(page)).sideways, 0, "the Library does not scroll sideways; its table scrolls in its own box");
  const lib = await footRow(page, ".cm-page-head .cm-actions:has(>[data-action=roster-more])");
  ok(lib.position === "fixed" && Math.abs(lib.bottom - H) < 1 && lib.width === W, `its actions are a row pinned to the foot, the width of the phone (${JSON.stringify(lib)})`);
  eq([lib.lines, lib.overflowX], [1, "auto"], "one row, which scrolls sideways when it must");
  eq([lib.first, lib.primary], ["add-card", true], "Add cards first, the primary");
  eq(lib.cut, [], "every label whole");
  const pad = await page.$eval("#cm-main", (m) => parseFloat(getComputedStyle(m).paddingBottom));
  ok(pad >= lib.height, `the page makes room for it, so its foot is not under the row (${pad}px for a ${Math.round(lib.height)}px row)`);
  /* At 320, the narrowest phone the geometry suite walks, the four no longer fit: still one row, scrolled sideways. */
  await page.setViewportSize({width: 320, height: H}); await page.waitForTimeout(300);
  const narrow = await footRow(page, ".cm-page-head .cm-actions:has(>[data-action=roster-more])");
  eq([narrow.lines, narrow.scrolls, narrow.cut], [1, true, []], "at 320, where the four do not fit, it stays one row and scrolls sideways, every label whole");
  await page.setViewportSize({width: W, height: H}); await page.waitForTimeout(300);
  await page.locator(".cm-page-head [data-action=roster-more]").scrollIntoViewIfNeeded();
  const more = await page.$eval(".cm-page-head [data-action=roster-more]", (x) => x.getBoundingClientRect().toJSON());
  ok(more.left >= 0 && more.right <= W, "and its last button, More, can be brought into view");

  /* Explore. */
  await settle(page, "#discover", ".cm-explore-door");
  eq((await shell(page)).sideways, 0, "Explore does not scroll sideways");
  const doors = await page.$$eval(".cm-explore-door", (ds) => ds.map((d) => Math.round(d.getBoundingClientRect().left)));
  ok(doors.length >= 2 && new Set(doors).size === 1, "its doors stack");

  /* Deck detail, at both ends of the phone's card-size range. */
  for (const scale of [60, 130]) {
    await page.evaluate((v) => localStorage.setItem("cm-card-scale", String(v)), scale);
    await settle(page, `#decks?deck=${encodeURIComponent(deckId)}`, ".cm-deck-hero h1");
    await page.reload(); await page.locator(".cm-deck-hero h1").waitFor({timeout: 60000});  /* the scale is read when the page loads */
    await page.locator(".cm-deck-hero-card img").waitFor({timeout: 30000});
    await page.waitForTimeout(400);
    /* The card's own width (offsetWidth): it is tilted 3°, so its bounding box is a little wider than the card. */
    const hero = await page.evaluate(() => ({card: {...document.querySelector(".cm-deck-hero-card img").getBoundingClientRect().toJSON(), width: document.querySelector(".cm-deck-hero-card img").offsetWidth}, name: document.querySelector(".cm-deck-hero h1").getBoundingClientRect().toJSON(), bar: document.querySelector(".cm-action-bar").getBoundingClientRect().top}));
    ok(Math.abs(hero.card.width - 132 * scale / 100) < 2, `at ${scale}% the commander's card follows the slider: ${Math.round(hero.card.width)}px, 132px × ${scale}%`);
    ok(hero.card.width >= 79 && hero.card.right <= W, `at ${scale}% it is legible and fits the phone`);
    ok(hero.name.bottom <= hero.bar, `at ${scale}% the deck's name is in the first screen, above the action row (name ends ${Math.round(hero.name.bottom)}, row starts ${Math.round(hero.bar)})`);
    eq((await shell(page)).sideways, 0, `at ${scale}% the deck page does not scroll sideways`);
  }
  const bar = await footRow(page, ".cm-action-bar");
  ok(bar.position === "fixed" && Math.abs(bar.bottom - H) < 1, "the deck's actions are a row pinned to the foot");
  eq([bar.lines, bar.overflowX], [1, "auto"], "one row that scrolls sideways, in place of equal shares");
  eq(bar.cut, [], `every label whole, none cut to "Ma…" (${bar.labels.join(" | ")})`);
  await context.close();
} finally {
  await close();
}
console.log(`mobile-r3: ${checks} checks passed — at 390 the rail is a top row, Decks stack, the Library's and the deck's actions are one row at the foot, Explore's doors stack, and the deck's card follows the slider.`);
