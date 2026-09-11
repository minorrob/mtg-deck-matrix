/* THE GEOMETRY PASS, PINNED.
 *
 * Every layout check in this project's history was a throwaway script in a scratch
 * directory: measure the header at 390, read the numbers, delete the file. That is how
 * the wordmark came to paint across the two header buttons on every phone for weeks --
 * it was checked once, at one width, before the rule that broke it existed.
 *
 * These are the three properties those throwaway scripts were always testing, written
 * down where they run on every commit:
 *
 *   1. No page scrolls sideways. A phone that scrolls horizontally has lost a control
 *      off the right edge, and the reader has no way to know what.
 *   2. No control on a touch screen is under 32px tall. Anything smaller is a tap that
 *      misses, and the reader blames themselves.
 *   3. Nothing in the header paints over anything else in it. The wordmark, the subline
 *      and the two buttons each get their own box and stay inside it.
 *
 * Exported rather than run, so both `tests/browser-geometry.mjs` (which runtests.sh
 * picks up) and `tests/uat/journeys.mjs` (the release gate) drive the same code.
 */

/* The widths are the real ones, not round numbers: the four commonest phones, a small
   tablet, and a desktop. 320 is the narrowest screen still in use and the width every
   overflow bug shows up at first. */
export const WIDTHS = [320, 375, 390, 430, 768, 1400];
export const PAGES = [
  ["decks", "My Decks"],
  ["collection", "Collection"],
  ["shop", "Shop"],
  ["lab", "Deck Lab"],
];
const PHONE = 640;
const MIN_TAP = 32;

/* Measured in the page, in one pass, because a round trip per element across six widths
   and four pages is a minute of latency for numbers the browser already has. */
function measure(minTap) {
  const box = (el) => {const r = el.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom)};};
  const visible = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const name = (el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) || el.getAttribute("aria-label") || el.className || el.tagName;

  const controls = [...document.querySelectorAll("#matrix-v2 button, #matrix-v2 a[href], #matrix-v2 select, #matrix-v2 summary")]
    .filter(visible)
    .map((el) => ({name: name(el), h: Math.round(el.getBoundingClientRect().height), tag: el.tagName}));

  const brand = document.querySelector("#matrix-v2 .v-brand");
  const sub = document.querySelector("#matrix-v2 .v-brand-subline");
  const menu = document.querySelector("#matrix-v2 .cm-user-menu");
  const top = document.querySelector("#matrix-v2 .v-top");

  /* Every .v-button in one row is the same height as its neighbours: the button scale is
     three sizes, and a row that mixes them is the 43/29/36 finding coming back. */
  const uneven = [];
  for (const row of document.querySelectorAll("#matrix-v2 .cm-actions, #matrix-v2 .cm-toolbar, #matrix-v2 .cm-batch-bar, #matrix-v2 .cm-shop-bar")) {
    const hs = [...row.querySelectorAll(":scope > .v-button")].filter(visible).map((el) => Math.round(el.getBoundingClientRect().height));
    if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 1) uneven.push(`${name(row)} (${hs.join("/")})`);
  }

  return {
    uneven,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    innerWidth: window.innerWidth,
    small: controls.filter((c) => c.h < minTap),
    header: {
      top: top ? box(top) : null,
      brand: brand ? box(brand) : null,
      sub: sub ? box(sub) : null,
      menu: menu ? box(menu) : null,
      // The wordmark is nowrap; if its own content is wider than its box it is clipped,
      // which is correct, but a positive number here means the words are being cut off.
      brandClipped: brand ? brand.scrollWidth - brand.clientWidth : 0,
    },
  };
}

/* Runs the pass and returns every failure it found rather than throwing on the first, so
   one run tells you every width that is wrong instead of the first one. */
export async function geometryPass({browser, base, widths = WIDTHS, pages = PAGES, stub, log = () => {}}) {
  const failures = [];
  let checks = 0;
  const fail = (message) => failures.push(message);

  for (const width of widths) {
    const phone = width <= PHONE;
    const context = await browser.newContext({viewport: {width, height: 820}, hasTouch: phone, isMobile: phone});
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (stub) await stub(page);
    try {
      await page.goto(`${base}/index.html`);
      await page.getByRole("heading", {name: "Build it. Make it yours."}).waitFor({timeout: 60000});

      for (const [hash, label] of pages) {
        await page.goto(`${base}/index.html#${hash}`);
        await page.locator("#cm-main").waitFor({timeout: 30000});
        // The view swaps its own contents in; wait for the placeholder to go rather than
        // measuring the loading panel and calling the layout sound.
        await page.locator(".cm-starting").waitFor({state: "detached", timeout: 30000}).catch(() => {});
        const m = await page.evaluate(measure, MIN_TAP);
        const where = `${label} at ${width}px`;
        checks += 3;

        if (m.overflow > 1) fail(`${where}: the page scrolls sideways by ${m.overflow}px, so something is off the right edge`);
        if (m.uneven.length) fail(`${where}: buttons in one row differ in height — ${m.uneven.slice(0, 3).join(", ")}`);

        if (phone && m.small.length) {
          fail(`${where}: ${m.small.length} control(s) under ${MIN_TAP}px tall — ${m.small.slice(0, 4).map((c) => `${c.name}@${c.h}px`).join(", ")}`);
        }

        const h = m.header;
        if (!h.brand || !h.menu) {
          fail(`${where}: the header is missing its wordmark or its buttons`);
        } else {
          if (h.brand.right > h.menu.x + 1) {
            fail(`${where}: the wordmark ends at x=${h.brand.right} and the buttons begin at x=${h.menu.x}, so it paints across them`);
          }
          if (h.sub && h.sub.right > h.menu.x + 1) {
            fail(`${where}: the subline ends at x=${h.sub.right} and the buttons begin at x=${h.menu.x}`);
          }
          if (h.top && (h.brand.bottom > h.top.bottom + 1 || h.menu.bottom > h.top.bottom + 1)) {
            fail(`${where}: header content runs past the bar's own bottom edge`);
          }
        }
        log(`  ${where}: overflow ${m.overflow}px, ${m.small.length} small control(s), wordmark ${h.brand ? h.brand.right : "?"} vs buttons ${h.menu ? h.menu.x : "?"}`);
      }
      if (errors.length) fail(`at ${width}px the page raised ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
      checks += 1;
    } finally {
      await context.close();
    }
  }
  return {checks, failures};
}
