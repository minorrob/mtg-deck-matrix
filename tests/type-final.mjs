/* r4's TYPE, AS A READER SEES IT (docs/design/2026-10-25-redesign-r4, Rob 2026-10-25).
 *
 * tests/design-tokens.mjs holds the tokens to the designer's files. This suite holds what those tokens are for, in a
 * real page with the committed library restored. The faces come from Rob's reference, "Concept B · Table Companion":
 *
 *   - names are Cinzel 600: the deck title (a hero) at every width; Cinzel's file really loads;
 *   - the app is still CrankMagic, its wordmark in the mock-up's face (Rob, 2026-10-26): Cinzel 600 capitals in gilt;
 *   - the work is Lato: h2 at 700, body at 400, and both Lato files really load (a missing file falls back to a
 *     system face with no error anywhere);
 *   - nothing on the page is Satoshi or Young Serif any more, and Barlow Condensed is only the callout word.
 *
 * The three widths run in the default skin, Sapphire & Obsidian. Needs Playwright and Chromium, like
 * tests/browser-geometry.mjs; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
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
    if (width === 1400) ok(await page.evaluate(() => document.getElementById("matrix-v2").dataset.palette) === "sapphire-obsidian", "with no theme chosen, the page is Sapphire & Obsidian");

    const title = await page.$eval(".cm-deck-hero-copy h1", (h) => { const s = getComputedStyle(h); return {family: s.fontFamily, weight: s.fontWeight, caps: s.textTransform}; });
    ok(/^["']?Cinzel/.test(title.family) && title.weight === "600", `at ${width}px the deck title is Cinzel 600; found ${title.family} ${title.weight}`);
    ok(title.caps === "none", `and it keeps its own case (Cinzel makes the capitals); found ${title.caps}`);
    ok(await page.evaluate(() => document.fonts.check("600 40px Cinzel")), `Cinzel 600's file loaded at ${width}px`);

    const brand = await page.$eval("#matrix-v2 .v-brand", (b) => { const s = getComputedStyle(b); return {family: s.fontFamily, caps: s.textTransform, fill: s.webkitTextFillColor, color: s.color}; }).catch(() => ({}));
    ok(/^["']?Cinzel/.test(brand.family || "") && brand.caps === "uppercase", `the CrankMagic wordmark is Cinzel capitals at ${width}px; found ${brand.family} ${brand.caps}`);
    ok(brand.fill === brand.color && brand.color !== "rgba(0, 0, 0, 0)", `in a solid gilt, not a clipped sheen (${brand.color})`);

    const h2 = await page.$eval("#matrix-v2 h2", (h) => { const s = getComputedStyle(h); return {family: s.fontFamily, weight: s.fontWeight}; });
    ok(/^["']?Lato/.test(h2.family) && h2.weight === "700", `a section heading is Lato 700 at ${width}px; found ${h2.family} ${h2.weight}`);
    const body = await page.$eval("#matrix-v2", (m) => getComputedStyle(m).fontFamily);
    ok(/^["']?Lato/.test(body), `body text is Lato at ${width}px; found ${body}`);
    ok(await page.evaluate(() => document.fonts.check("400 14px Lato") && document.fonts.check("700 14px Lato")), `Lato 400 and 700 loaded at ${width}px`);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replace(/["']/g, "")} ${f.weight}`));
    ok(["Cinzel 600", "Lato 400", "Lato 700"].every((f) => loaded.includes(f)), `the real faces loaded, not synthesized ones (${loaded.join(", ")})`);

    const retired = await page.evaluate(() => [...document.querySelectorAll("#matrix-v2 *")]
      .filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .filter((n) => /Satoshi|Young Serif|CrankOxanium/.test(getComputedStyle(n).fontFamily))
      .map((n) => `${n.tagName.toLowerCase()}.${[...n.classList].join(".")}`));
    assert.deepEqual(retired, [], `no text is set in a retired face; found on: ${retired.join(", ")}`);
    checks++;
    const barlow = await page.evaluate(() => [...document.querySelectorAll("#matrix-v2 *")]
      .filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
      .filter((n) => /Barlow Condensed/.test(getComputedStyle(n).fontFamily) && !n.closest(".cm-callout-word")).length);
    ok(barlow === 0, `and no page text is Barlow Condensed outside the callout word (${barlow})`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`type-final: ${checks} checks passed. Names are Cinzel 600 (the deck title), the work is Lato 400 and 700, both self-hosted and loaded, the CrankMagic wordmark is Cinzel capitals in gilt, and no retired face is left on the page.`);
