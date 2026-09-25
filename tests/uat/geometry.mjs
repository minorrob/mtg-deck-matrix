/* THE GEOMETRY PASS, PINNED.
 *
 * Every layout check in this project's history was a throwaway script in a scratch
 * directory: measure the header at 390, read the numbers, delete the file. That is how
 * the wordmark came to paint across the two header buttons on every phone for weeks --
 * it was checked once, at one width, before the rule that broke it existed.
 *
 * These are the properties those throwaway scripts were always testing, written down where
 * they run on every commit:
 *
 *   1. No page scrolls sideways. A phone that scrolls horizontally has lost a control
 *      off the right edge, and the reader has no way to know what.
 *   2. No control on a touch screen is under 32px tall. Anything smaller is a tap that
 *      misses, and the reader blames themselves.
 *   3. Nothing in the rail paints over anything else in it. The wordmark, the nav, the
 *      library note and the Menu button each get their own box and stay inside it.
 *
 * REWRITTEN FOR THE RAIL (Track V.3, the implementation guide's step 2). The shell used to be
 * a full-width header bar over a 168px sidebar, and checks 3 to 5 measured that bar: the
 * wordmark against the header buttons, the header's own bottom edge, a clipped name. The
 * Gallery shell has no header -- the wordmark, the aether mist and the four header buttons all
 * moved into a 216px rail, and Menu at its foot. So those checks are rewritten rather than
 * deleted: the same three properties, asked of the rail. The wordmark can still be clipped, it
 * can still collide with what is under it, and the rail can still push the page sideways; those
 * are the failures this file exists to catch and they all still exist, in a new place.
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
/* The guide's rail width. Below this the rail becomes a top row and the number does not apply. */
const RAIL = 216;

/* Measured in the page, in one pass, because a round trip per element across six widths
   and four pages is a minute of latency for numbers the browser already has. */
function measure(minTap) {
  const box = (el) => {const r = el.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom)};};
  const visible = (el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const name = (el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30) || el.getAttribute("aria-label") || el.className || el.tagName;

  const controls = [...document.querySelectorAll("#matrix-v2 button, #matrix-v2 a[href], #matrix-v2 select, #matrix-v2 summary")]
    .filter(visible)
    .map((el) => ({name: name(el), h: Math.round(el.getBoundingClientRect().height), tag: el.tagName}));

  const rail = document.querySelector("#matrix-v2 .cm-sidebar");
  const brand = document.querySelector("#matrix-v2 .v-brand");
  const nav = document.querySelector("#matrix-v2 .v-nav-links");
  const note = document.querySelector("#matrix-v2 .cm-nav-note");
  const menu = document.querySelector("#matrix-v2 .cm-rail-menu");
  const main = document.querySelector("#matrix-v2 #cm-main");

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
    /* A control whose middle is past the right edge cannot be clicked at all, by a person or by
       a test -- and it does not necessarily widen the document, so the sideways-scroll check
       above can pass while a button is unreachable. That is exactly how the rail's Menu came to
       sit at x=362..405 in a 375px viewport. Measure the controls, not just the page.
       A wide table that scrolls inside its own box is not this bug: its headers are reached by
       scrolling the table, which is what that container is for. So a control is only counted
       when nothing between it and the page scrolls sideways. */
    offscreen: (() => {
      const scrollable = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if ((o === "auto" || o === "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
        }
        return false;
      };
      return [...document.querySelectorAll("#matrix-v2 button, #matrix-v2 a[href], #matrix-v2 select")]
        .filter(visible)
        .map((el) => ({name: name(el), box: box(el), scrolls: scrollable(el)}))
        .filter((c) => !c.scrolls && (c.box.x + c.box.w / 2 > window.innerWidth || c.box.x + c.box.w / 2 < 0))
        .map((c) => `${c.name}@${c.box.x}..${c.box.right}`);
    })(),
    /* The header bar is gone in the Gallery shell. Its absence is a property, not an
       accident: if it comes back, something has re-added a second place for chrome. */
    hasHeaderBar: !!document.querySelector("#matrix-v2 .v-top"),
    rail: {
      rail: rail ? box(rail) : null,
      brand: brand ? box(brand) : null,
      nav: nav ? box(nav) : null,
      note: note && visible(note) ? box(note) : null,
      menu: menu && visible(menu) ? box(menu) : null,
      main: main ? box(main) : null,
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
        checks += 5;

        if (m.overflow > 1) fail(`${where}: the page scrolls sideways by ${m.overflow}px, so something is off the right edge`);
        if (m.uneven.length) fail(`${where}: buttons in one row differ in height — ${m.uneven.slice(0, 3).join(", ")}`);
        if (m.hasHeaderBar) fail(`${where}: the .v-top header bar is back; the Gallery shell puts the brand and its menu in the rail`);
        if (m.offscreen.length) fail(`${where}: ${m.offscreen.length} control(s) have their middle past the viewport edge and cannot be clicked — ${m.offscreen.slice(0, 3).join(", ")}`);

        if (phone && m.small.length) {
          fail(`${where}: ${m.small.length} control(s) under ${MIN_TAP}px tall — ${m.small.slice(0, 4).map((c) => `${c.name}@${c.h}px`).join(", ")}`);
        }

        const r = m.rail;
        if (!r.rail || !r.brand || !r.nav) {
          fail(`${where}: the rail is missing its box, its wordmark or its nav`);
        } else if (phone) {
          /* On a phone the rail is a top row above the content, not a column beside it. */
          if (r.main && r.rail.bottom > r.main.y + 1) fail(`${where}: the rail still sits beside the content at phone width (rail bottom ${r.rail.bottom}, main top ${r.main.y})`);
        } else {
          if (Math.abs(r.rail.w - RAIL) > 1) fail(`${where}: the rail is ${r.rail.w}px wide; the guide's shell is ${RAIL}px`);
          if (r.main && r.main.x < r.rail.right - 1) fail(`${where}: the content starts at x=${r.main.x}, inside the rail which ends at ${r.rail.right}`);

          /* The three properties the old header checks were really about, asked of the rail:
             the wordmark is inside its column, it does not paint over the nav under it, and
             nothing in the rail runs past the rail's own edges. */
          if (r.brand.right > r.rail.right + 1) fail(`${where}: the wordmark ends at x=${r.brand.right} and the rail ends at ${r.rail.right}, so it runs out of its column`);
          if (r.brand.bottom > r.nav.y + 1) fail(`${where}: the wordmark ends at y=${r.brand.bottom} and the nav begins at y=${r.nav.y}, so it paints across it`);
          if (r.brandClipped > 0) fail(`${where}: the wordmark is cut off by ${r.brandClipped}px — the name does not fit the rail`);

          /* Menu lives at the foot of the rail: below the nav, inside the rail, and never
             over the library note. */
          if (!r.menu) {
            fail(`${where}: the rail has no Menu control; Take a Tour, Share, Send Feedback and User Functions live under it now`);
          } else {
            if (r.menu.y < r.nav.bottom - 1) fail(`${where}: Menu is at y=${r.menu.y}, above the nav which ends at ${r.nav.bottom}; it belongs at the rail's foot`);
            if (r.menu.right > r.rail.right + 1) fail(`${where}: Menu runs past the rail's right edge (${r.menu.right} vs ${r.rail.right})`);
            if (r.menu.bottom > r.rail.bottom + 1) fail(`${where}: Menu runs past the rail's bottom edge (${r.menu.bottom} vs ${r.rail.bottom})`);
          }
        }
        log(`  ${where}: overflow ${m.overflow}px, ${m.small.length} small control(s), rail ${r.rail ? r.rail.w : "?"}px, menu at ${r.menu ? r.menu.y : "—"}`);
      }
      /* 4. A dialog opens at the top and never scrolls sideways (UAT M-13, M-14). The tour is the
            one dialog every fresh library has; its head is sticky and pulled to the edges with
            negative margins, which is exactly the shape that once drew a horizontal scrollbar on
            every dialog in the app. Take a Tour is under Menu now, so the menu opens first. */
      await page.goto(`${base}/index.html#decks`);
      await page.locator("#cm-main").waitFor({timeout: 30000});
      checks += 2;
      try {
        /* Take a Tour lives under Menu now, so the menu opens first. Both clicks are inside the
           pass's own error handling: a control that cannot be reached is a geometry failure and
           belongs in the report with its width, not as a thrown timeout that hides every width
           after it. */
        await page.locator(".cm-rail-menu").first().click({timeout: 8000});
        await page.locator('[data-action="tour"]').first().click({timeout: 8000});
        await page.locator("#cm-dialog[open]").waitFor({timeout: 10000});
        const dialog = await page.evaluate(() => { const d = document.querySelector("#cm-dialog"); return {sideways: d.scrollWidth - d.clientWidth, top: d.scrollTop}; });
        if (dialog.sideways > 1) fail(`at ${width}px: the dialog scrolls sideways by ${dialog.sideways}px with nothing to scroll`);
        if (dialog.top > 0) fail(`at ${width}px: the dialog opened scrolled down by ${dialog.top}px, so its top is under the sticky title`);
        await page.keyboard.press("Escape");
      } catch (error) {
        fail(`at ${width}px: Take a Tour could not be reached through the rail's Menu — ${String(error.message || error).split("\n")[0]}`);
      }


      if (errors.length) fail(`at ${width}px the page raised ${errors.length} error(s): ${errors.slice(0, 2).join(" | ")}`);
      checks += 1;
    } finally {
      await context.close();
    }
  }
  return {checks, failures};
}
