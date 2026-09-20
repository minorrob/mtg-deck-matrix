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
  ["decks", "Decks"],
  ["cards", "Cards"],
  ["cards?tab=buy", "Cards · To buy"],
  ["lab", "Build"],
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
        checks += 4;

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
          // The name is never cut: crankmagic-brand.js steps the wordmark down until it fits
          // its column, so a clipped wordmark means that fit is not running or cannot succeed.
          if (h.brandClipped > 0) {
            fail(`${where}: the wordmark is cut off by ${h.brandClipped}px — the name does not fit its column`);
          }
        }
        log(`  ${where}: overflow ${m.overflow}px, ${m.small.length} small control(s), wordmark ${h.brand ? h.brand.right : "?"} vs buttons ${h.menu ? h.menu.x : "?"}`);
      }
      /* 4. A dialog opens at the top and never scrolls sideways (UAT M-13, M-14). The tour is the
            one dialog every fresh library has; its head is sticky and pulled to the edges with
            negative margins, which is exactly the shape that once drew a horizontal scrollbar on
            every dialog in the app. */
      await page.goto(`${base}/index.html#decks`);
      await page.locator("#cm-main").waitFor({timeout: 30000});
      await page.locator('[data-action="tour"]').first().click();
      await page.locator("#cm-dialog[open]").waitFor({timeout: 10000});
      const dialog = await page.evaluate(() => { const d = document.querySelector("#cm-dialog"); return {sideways: d.scrollWidth - d.clientWidth, top: d.scrollTop}; });
      checks += 2;
      if (dialog.sideways > 1) fail(`at ${width}px: the dialog scrolls sideways by ${dialog.sideways}px with nothing to scroll`);
      if (dialog.top > 0) fail(`at ${width}px: the dialog opened scrolled down by ${dialog.top}px, so its top is under the sticky title`);
      await page.keyboard.press("Escape");

      /* 5. On a desktop the sidebar's sticky nav never rides over the note beneath it, however
            far the page is scrolled (UAT M-12): the note starts at or below the nav's bottom. */
      if (!phone && width >= 1024) {
        await page.goto(`${base}/index.html#lab`);
        await page.locator("#cm-main").waitFor({timeout: 30000});
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(150);
        const side = await page.evaluate(() => { const nav = document.querySelector(".cm-sidebar .v-nav-links"), note = document.querySelector(".cm-sidebar .cm-nav-note"); if (!nav || !note) return null; const a = nav.getBoundingClientRect(), b = note.getBoundingClientRect(); return {navBottom: a.bottom, noteTop: b.top, noteShown: b.height > 0}; });
        checks += 1;
        if (side && side.noteShown && side.navBottom > side.noteTop + 1) fail(`at ${width}px: the sidebar nav (bottom ${Math.round(side.navBottom)}) paints over the library note (top ${Math.round(side.noteTop)}) when scrolled`);
      }

      if (errors.length) fail(`at ${width}px the page raised ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
      checks += 1;
    } finally {
      await context.close();
    }
  }
  return {checks, failures};
}
