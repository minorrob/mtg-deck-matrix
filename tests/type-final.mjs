/* r3's "TYPE (FINAL)", AS A READER SEES IT (R3.1, docs/design/2026-09-25-redesign-r3/INTAKE.md).
 *
 * tests/design-tokens.mjs holds the tokens to the designer's files. This suite holds what those tokens
 * are for, in a real page with the committed library restored:
 *
 *   - headings are Satoshi Black 900, and the 900 file really loads (a missing file would fall back to
 *     700 or a system face with no error anywhere);
 *   - the deck title, a hero, is Young Serif where it is 48px or larger, and Satoshi 900 where it is
 *     not, because r3 keeps the serif to headlines of 48px and up;
 *   - no other text on the page is Young Serif.
 *
 * Needs Playwright and Chromium, like tests/browser-geometry.mjs; GEOMETRY_REQUIRED=1 (CI) turns a
 * missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

const {browser, base, stub, close} = await openBrowser({name: "type-final", flag: "GEOMETRY_REQUIRED"});
try {
  for (const width of [1400, 1136, 390]) {
    const phone = width <= 640;
    const context = await browser.newContext({viewport: {width, height: phone ? 844 : 900}, isMobile: phone, hasTouch: phone});
    const page = await context.newPage();
    if (stub) await stub(page);
    await loadLiveState(page, base);
    const deck = await page.evaluate(() => document.querySelector('[data-action="deck"][data-deck]')?.dataset.deck || "");
    ok(deck, `the restored library has a deck to open at ${width}px`);
    await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(deck)}`);
    await page.locator(".cm-deck-hero-copy h1").waitFor({timeout: 30000});
    await page.evaluate(() => document.fonts.ready);

    const title = await page.$eval(".cm-deck-hero-copy h1", (h) => {
      const s = getComputedStyle(h);
      return {family: s.fontFamily, weight: s.fontWeight, size: parseFloat(s.fontSize)};
    });
    if (title.size >= 48) {
      ok(/^["']?Young Serif/.test(title.family) && title.weight === "400", `at ${width}px the deck title is ${title.size}px, so it is the hero face; found ${title.family} ${title.weight}`);
      ok(await page.evaluate(() => document.fonts.check('400 56px "Young Serif"')), `Young Serif's file loaded at ${width}px`);
    } else {
      ok(/^Satoshi/.test(title.family) && title.weight === "900", `at ${width}px the deck title is ${title.size}px, under 48, so it is Satoshi 900; found ${title.family} ${title.weight}`);
    }

    const heading = await page.$eval("#matrix-v2 h2", (h) => { const s = getComputedStyle(h); return {family: s.fontFamily, weight: s.fontWeight, tracking: s.letterSpacing, size: parseFloat(s.fontSize)}; });
    ok(/^Satoshi/.test(heading.family) && heading.weight === "900", `a section heading is Satoshi 900 at ${width}px; found ${heading.family} ${heading.weight}`);
    ok(Math.abs(parseFloat(heading.tracking) - heading.size * -0.035) < 0.3, `and it is tracked at -.035em (${heading.tracking} on ${heading.size}px)`);
    ok(await page.evaluate(() => document.fonts.check("900 24px Satoshi")), `Satoshi 900's file loaded at ${width}px`);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replace(/["']/g, "")} ${f.weight}`));
    ok(loaded.includes("Satoshi 900"), `the Satoshi 900 face is the one that loaded, not a synthesized bold (${loaded.join(", ")})`);

    const serifElsewhere = await page.evaluate(() => [...document.querySelectorAll("#matrix-v2 *")]
      .filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .filter((n) => /Young Serif/.test(getComputedStyle(n).fontFamily))
      .filter((n) => !n.closest(".cm-deck-hero-copy h1") || parseFloat(getComputedStyle(n).fontSize) < 48)
      .map((n) => `${n.tagName.toLowerCase()}.${[...n.classList].join(".")} ${getComputedStyle(n).fontSize}`));
    assert.deepEqual(serifElsewhere, [], `Young Serif is only for heroes of 48px and up; also found on: ${serifElsewhere.join(", ")}`);
    checks++;
    await context.close();
  }
} finally {
  await close();
}
console.log(`type-final: ${checks} checks passed — headings are Satoshi 900 at -.035em, and Young Serif appears only on the deck title where it is 48px or larger.`);
