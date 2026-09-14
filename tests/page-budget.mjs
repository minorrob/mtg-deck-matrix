/* THE PAGE BUDGET, wired into `bash runtests.sh`.
 *
 * The simplification of September 2026 took every page's framing stack (eyebrow, tagline,
 * subline), its duplicated figures and its explainer prose off the screen and put the
 * explanations behind one "?" per page. Trims like that grow back a sentence at a time,
 * each one reasonable, until the deck page is 1,300 words again. So the budget is a test:
 * for every page, on the committed live library, at a desktop and a phone width, it counts
 *
 *   words      -- visible words before the page's first table, list or canvas: the header,
 *                 the figures, the toolbar, the notes; everything a reader crosses to reach
 *                 the content,
 *   controls   -- visible buttons, links, selects and folds in that same stretch,
 *   explainer  -- words of that stretch that sit in notes, sublines, captions and muted
 *                 asides rather than in headings, figures or controls,
 *
 * and holds each under the number written beside the page below. The numbers are the
 * measurement on the day the trim shipped (Decks 17 words, the deck page 77 — 38 once it
 * became five tabs, its boundary the progress card — the Cards Library 63, its To buy tab 28)
 * with a little headroom, not aspirations: a page that needs
 * more has to say so here, in the diff, where a reviewer sees it.
 *
 * WHEN THERE IS NO BROWSER it prints SKIPPED and exits 0 (see tests/uat/browser-runner.mjs);
 * PAGE_BUDGET_REQUIRED=1 turns the skip into a failure, and CI sets it. PAGE_BUDGET_REPORT=1
 * prints every measurement, which is how the numbers below were read.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const REPORT = process.env.PAGE_BUDGET_REPORT === "1";

/* The live library's first deck is the deck page and the Ready to add page the budget reads. */
const DECK = "deck:live:D1";

/* [route, name, boundary, {desktop budgets}, {phone budgets}]. The boundary is the first
   table, list or canvas of the page; words and controls are counted before it in document
   order. Budgets are words / controls / explainer words. */
const PAGES = [
  ["decks", "Decks", ".cm-deck-grid", [24, 8, 4], [24, 8, 4]],
  /* Deck page (14 September): Make the change (n) joins the hero for a final deck — the change
     list Rob asked for needs a way in from the deck itself; 44 → 48 words, 14 → 15 controls. */
  [`decks?deck=${DECK}`, "Deck page", ".cm-deck-summary", [48, 15, 4], [48, 15, 4]],
  /* Cards (14 September): the seven count chips are buttons now — Rob asked for the counts to
     filter — and List · Sheet · Table sit on the tab row of every tab; 22 → 26, 10 → 11. */
  ["cards", "Cards · Library", "#cm-roster-table table", [76, 26, 16], [76, 26, 16]],
  ["cards?tab=buy", "Cards · To buy", "#cm-roster-table table, .cm-shop-strip", [40, 18, 8], [16, 10, 4]],
  ["cards?view=sheet", "Cards · Sheet", "#cm-sheet-table table", [46, 16, 20], [46, 16, 20]],
  ["lab", "Build", "#cm-lab-results", [90, 16, 40], [90, 16, 40]],
  /* Discover's facet bar is still 25 chips in four rows; folding it into one Filters
     control is the next round's work, so its budget is today's reading, not the rule. */
  ["discover", "Discover", "#cm-graph", [330, 40, 14], [330, 40, 14]],
  [`pull?deck=${DECK}`, "Ready to add", ".cm-pull-group", [48, 8, 4], [48, 8, 4]],
  ["how", "How a deck comes together", ".cm-how-flow", [14, 3, 2], [14, 3, 2]],
  ["cards?tab=orders", "Cards · Orders", ".cm-orders, .cm-table", [24, 11, 4], [24, 11, 4]],
];
const WIDTHS = [[1400, "desktop", 3], [390, "phone", 4]];

/* Measured in the page, in one pass. `before` is document order: an element counts when
   it precedes the boundary and is not inside it; when the boundary is missing the page is
   reported whole and the check fails, because a number without its boundary means nothing. */
function measure(boundarySel) {
  const main = document.querySelector("#cm-main");
  const boundary = boundarySel ? main.querySelector(boundarySel) : null;
  const visible = (el) => {const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";};
  const before = (el) => !boundary || (!boundary.contains(el) && Boolean(boundary.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING));
  const skip = "script,style,template,select,option,[hidden],[aria-hidden=true],[popover]";
  const explainers = ".cm-note,.cm-status-line,small,.cm-muted,.cm-sub,.cm-tile-caption,.cm-stats-scope";
  let words = 0, explainer = 0;
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !before(el) || el.closest(skip) || !visible(el)) continue;
    const w = (n.textContent.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    words += w;
    if (el.closest(explainers)) explainer += w;
  }
  const controls = [...main.querySelectorAll("button,a[href],select,summary,input:not([type=hidden])")]
    .filter((el) => before(el) && !el.closest("[popover]") && visible(el))
    .map((el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 32));
  return {words, explainer, controls: controls.length, names: controls, boundary: Boolean(boundary)};
}

const {browser, base, stub, close} = await openBrowser({name: "page-budget", flag: "PAGE_BUDGET_REQUIRED"});
const failures = [];
let checks = 0;
const pad = (s, n) => String(s).padEnd(n);
try {
  for (const [width, kind, at] of WIDTHS) {
    const phone = width < 640;
    const context = await browser.newContext({viewport: {width, height: 820}, hasTouch: phone, isMobile: phone});
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (stub) await stub(page);
    await loadLiveState(page, base);
    for (const [route, name, boundary, ...budgets] of PAGES) {
      const [maxWords, maxControls, maxExplainer] = budgets[at - 3];
      await page.goto(`${base}/index.html#${route}`);
      await page.locator("#cm-main").waitFor({timeout: 30000});
      /* The view swaps its own contents in; wait for its boundary rather than measuring a
         loading panel. A page without one on this data is reported as such. */
      await page.locator(boundary).first().waitFor({timeout: 60000}).catch(() => {});
      await page.waitForTimeout(250);
      const m = await page.evaluate(measure, boundary);
      const line = `${pad(name, 26)} ${pad(kind, 8)} words ${pad(m.words, 4)} controls ${pad(m.controls, 3)} explainer ${pad(m.explainer, 3)}`;
      if (REPORT) console.log(line + (m.boundary ? "" : "  (no boundary)") + `\n    controls: ${m.names.join(" | ")}`);
      checks += 3;
      if (!m.boundary) failures.push(`${name} at ${width}px has no ${boundary} to measure up to`);
      if (m.words > maxWords) failures.push(`${name} at ${width}px: ${m.words} words before the ${boundary}, budget ${maxWords}`);
      if (m.controls > maxControls) failures.push(`${name} at ${width}px: ${m.controls} controls before the ${boundary}, budget ${maxControls} (${m.names.join(", ")})`);
      if (m.explainer > maxExplainer) failures.push(`${name} at ${width}px: ${m.explainer} explainer words before the ${boundary}, budget ${maxExplainer}`);
    }
    checks += 1;
    if (errors.length) failures.push(`page errors at ${width}px: ${errors.join(" | ")}`);
    await context.close();
  }
} finally {
  await close();
}
assert.deepEqual(failures, [], `the pages have grown past their budgets at ${failures.length} place(s):\n  ` + failures.join("\n  "));
console.log(`page-budget: ${checks} checks passed — every page opens under its word, control and explainer budget at 1400 and 390.`);
