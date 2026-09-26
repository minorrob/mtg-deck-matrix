/* R3.9: EVERY CARD IS 5:7 (INTAKE row R3.9; the design system's card ratio).
 *
 * One token, --card-ratio (5/7, crankmagic-design.css), shapes every card surface in the app, and each is sized by
 * its width: the height follows from the ratio. Checked two ways:
 *
 *   1. In the stylesheet: no card surface carries another ratio (488/680, 63/88) or a fixed height, and each named
 *      surface takes its aspect from the token.
 *   2. In a real page, with the committed library: each surface as drawn measures 5:7 to within a pixel, on the
 *      landing page, the Decks fan, the deck page, the card inspector, the hover preview, Explore, and the Table
 *      view's piles, open pile (the picture above the caption, which was cropped to about 0.93) and stage.
 *
 * The one exception, said where it is: the Play lobby's seat card is sized by the quadrant's height, because the
 * table is a stage of fixed proportion and the height is what the card must fit (tests/wireframe-conformance.mjs).
 * It is 5:7 all the same.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };
const RATIO = 5 / 7;

/* 1. The stylesheet. */
const css = readFileSync(new URL("../crankmagic.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = readFileSync(new URL("../crankmagic-design.css", import.meta.url), "utf8");
ok(/--card-ratio:5\/7;/.test(tokens), "the design tokens define --card-ratio as 5/7");
eq(css.match(/aspect-ratio:(488\/680|63\/88|5\/7)/g) || [], [], "no card surface spells its own ratio: every one reads --card-ratio");
const SURFACES = [".cm-card-thumb", ".cm-inspector-art>img", ".cm-swap-card>img", ".cm-commander>img", ".cm-deck-hero-card img", ".cm-fan-card", ".cm-door-fan i",
  ".cm-card-view-art", ".cm-pop-noart", ".cm-hover-art", ".cm-load-art", ".cm-load-preview img", ".cm-trade-card img", ".cm-trade-noart", ".cm-seat-card",
  ".cm-lobby-art", ".cm-lobby-art-fallback", ".cm-lobby-art-pop-card", ".cm-lobby-summary-art", ".cm-landing-card", ".cm-landing-vis-plan img",
  ".cm-tt-card", ".cm-tt-stack", ".cm-tt-draw-stack .cm-tt-card", ".cm-tt-tray-slot .cm-tt-card"];
const rulesOf = (sel) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, s]) => s.split(",").some((x) => x.trim().replace(/^#matrix-v2(\.cm-stage)? /, "") === sel)).map(([, , body]) => body);
for (const sel of SURFACES) {
  const bodies = rulesOf(sel);
  ok(bodies.some((b) => /aspect-ratio:var\(--card-ratio\)/.test(b)), `${sel} takes its shape from --card-ratio`);
  /* A fixed height beside a width would override the ratio; the seat card is the one surface sized by height. */
  if (sel !== ".cm-seat-card") ok(!bodies.some((b) => /(^|;)height:\d+px/.test(b)), `${sel} is sized by its width, with no fixed height`);
}

/* 2. As drawn. offsetWidth and offsetHeight are the layout box, before any turn a fan gives it. */
const {browser, base, stub, close} = await openBrowser({name: "cards-57", flag: "GEOMETRY_REQUIRED"});
const measure = (page, selector) => page.$$eval(selector, (els) => els.filter((el) => el.offsetWidth > 0).map((el) => [el.offsetWidth, el.offsetHeight]));
const is57 = ([w, h]) => Math.abs(h - w / RATIO) <= 1;
const expect57 = async (page, selector, what) => {
  const boxes = await measure(page, selector);
  ok(boxes.length > 0, `${what}: drawn (${boxes.length})`);
  const off = boxes.filter((b) => !is57(b));
  eq(off.slice(0, 3), [], `${what} measure 5:7 to within a pixel (${boxes.slice(0, 3).map(([w, h]) => `${w}×${h}`).join(", ")})`);
};

try {
  /* A fresh browser: the landing page, then Decks with no decks and its fan. */
  {
    const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
    const page = await context.newPage();
    if (stub) await stub(page);
    await page.goto(`${base}/index.html`);
    await page.locator(".cm-landing-card").first().waitFor({timeout: 60000});
    await expect57(page, ".cm-landing-card, .cm-landing-vis-plan img", "the landing page's cards");
    await page.goto(`${base}/index.html#decks`);
    await page.locator(".cm-fan-card").first().waitFor({timeout: 30000});
    await expect57(page, ".cm-fan-card", "the Decks fan");
    await context.close();
  }
  /* The committed library. */
  for (const [vw, vh, tag] of [[1400, 900, "desktop"], [390, 844, "phone"]]) {
    const context = await browser.newContext({viewport: {width: vw, height: vh}, serviceWorkers: "block"});
    const page = await context.newPage();
    if (stub) await stub(page);
    await loadLiveState(page, base);
    await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent("deck:live:D4")}&tab=hundred`);
    await page.locator(".cm-deck-hero-card img").waitFor({timeout: 30000});
    await expect57(page, ".cm-deck-hero-card img", `${tag}: the deck page's commander`);
    await page.locator(".cm-deck-cards li .cm-card-name").first().click();
    await page.locator("#cm-dialog .cm-inspector-art>img").waitFor({timeout: 30000});
    await expect57(page, "#cm-dialog .cm-inspector-art>img", `${tag}: the card inspector`);
    await page.keyboard.press("Escape");
    await page.goto(`${base}/index.html#discover`);
    await page.locator(".cm-door-fan i").first().waitFor({timeout: 30000});
    await expect57(page, ".cm-door-fan i", `${tag}: Explore's commander fans`);
    if (tag === "desktop") {
      await page.goto(`${base}/index.html#cards`);
      await page.locator("#cm-roster-table .cm-table .cm-card-name").first().waitFor({timeout: 30000});
      await page.locator("#cm-roster-table .cm-table .cm-card-name").first().hover();
      await page.locator(".cm-hover-art").waitFor({state: "visible", timeout: 10000});
      await expect57(page, ".cm-hover-art", `${tag}: the hover preview`);
    }
    /* The Table view: piles on the mat, an open pile's cards (their picture, above the caption), and the stage. */
    await page.goto(`${base}/index.html#cards?view=tabletop`);
    await page.locator("[data-pile^='status:']").first().waitFor({timeout: 30000});
    await expect57(page, ".cm-tt-pile:not(.is-empty) .cm-tt-stack > .cm-tt-card", `${tag}: the Table view's piles`);
    for (const size of ["S", "M", "L"]) {
      if (!(await page.locator(".cm-tt-grid .cm-tt-card").count())) { await page.locator("[data-pile='status:Target'], [data-pile^='status:']").first().click(); await page.locator(".cm-tt-grid .cm-tt-card").first().waitFor({timeout: 30000}); }
      await page.$eval(`[data-tt=size][data-size=${size}]`, (b) => b.click());  /* the drawer slides in; a real click waits on it forever */
      await page.locator(`.cm-tt-grid .cm-tt-card.is-${size}`).first().waitFor({timeout: 30000});
      const faces = await page.$$eval(`.cm-tt-grid .cm-tt-card.is-${size}`, (els) => els.slice(0, 12).map((el) => { const b = getComputedStyle(el, "::before"); return [el.offsetWidth, el.offsetHeight - parseFloat(b.bottom) - parseFloat(b.top)]; }));
      ok(faces.length > 0 && faces.every(is57), `${tag}: an open pile's pictures at size ${size} are whole 5:7 faces, not crops (${faces.slice(0, 2).map(([w, h]) => `${w}×${Math.round(h)}`).join(", ")})`);
    }
    await page.$eval(".cm-tt-grid .cm-tt-card", (c) => c.click());
    await page.locator(".cm-tt-solo").waitFor({timeout: 30000});
    await expect57(page, ".cm-tt-solo", `${tag}: the card on the stage`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`cards-57: ${checks} checks passed — one --card-ratio (5:7) shapes every card surface, each sized by its width, and every card drawn measures 5:7.`);
