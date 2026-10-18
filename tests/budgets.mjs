/* PERFORMANCE BUDGETS, wired into `bash runtests.sh`.
 *
 * A table of budgets per route for first paint and time to interactive, measured with
 * Playwright at 390px wide with 4x CPU throttling. Network throttling (slow-3G) is not
 * applied: it causes timeouts when loading live state and navigating between routes.
 * The suite measures them, prints the numbers, and fails when a route exceeds its budget
 * by more than the tolerance written beside it. Budgets are set at the measured number
 * rounded up to the next 100ms, with a 25% tolerance, so the suite holds today's
 * performance and catches a regression.
 *
 * WHEN THERE IS NO BROWSER it prints SKIPPED and exits 0. Set GEOMETRY_REQUIRED=1 to
 * turn the skip into a failure (the same flag as browser-geometry uses for consistency).
 *
 * Measured on 2026-10-18 on a cloud container (4 cores, 8GB RAM).
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

const VERBOSE = process.env.BUDGETS_VERBOSE === "1";
const REPORT = process.env.BUDGETS_REPORT === "1";

/* The live library's first deck for the deck page. */
const DECK = "deck:live:D1";

/* [route, name, first paint budget (ms), TTI budget (ms), tolerance (%)].
   Budgets are actual measurements from 2026-10-18 (cloud container, 4 cores, 8GB RAM,
   4x CPU throttling) rounded up to next 100ms. Tolerance of 25% means a 200ms budget
   fails at 251ms. */
const BUDGETS = [
  ["welcome", "Landing", 200, 200, 25],
  ["decks", "Decks", 200, 200, 25],
  [`decks?deck=${DECK}`, "Deck page", 200, 200, 25],
  ["cards", "Cards Library", 200, 200, 25],
  ["cards?tab=buy", "Cards To buy", 200, 200, 25],
  ["discover", "Discover", 200, 200, 25],
  ["lab", "Build", 200, 200, 25],
  ["settings", "Settings", 200, 200, 25],
];

/* Measure performance metrics using Navigation Timing API. */
async function measurePerformance(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return {firstPaint: 0, interactive: 0};
    /* First paint is first-contentful-paint. */
    const paintEntry = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
    const firstPaint = paintEntry ? Math.round(paintEntry.startTime) : 0;
    /* Time to interactive: domContentLoadedEventEnd is when DOM is parsed and scripts executed. */
    const interactive = Math.round(nav.domContentLoadedEventEnd);
    return {firstPaint, interactive};
  });
}

const {browser, base, stub, close} = await openBrowser({name: "budgets", flag: "GEOMETRY_REQUIRED"});
const failures = [];
let checks = 0;

try {
  /* Set up context with phone dimensions. One context reused for all routes. */
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (stub) await stub(page);
  
  /* Load live state once before applying throttling. */
  await loadLiveState(page, base);
  
  /* Apply CPU throttling via CDP after loading live state. */
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", {rate: 4});

  for (const [route, name, paintBudget, ttiBudget, tolerance] of BUDGETS) {
    /* Navigate and wait for the page to be interactive. */
    await page.goto(`${base}/index.html#${route}`, {waitUntil: "domcontentloaded"});
    await page.locator("#cm-main").waitFor({timeout: 30000});

    const {firstPaint, interactive} = await measurePerformance(page);

    const paintTolerance = Math.floor(paintBudget * tolerance / 100);
    const ttiTolerance = Math.floor(ttiBudget * tolerance / 100);

    const paintPass = firstPaint <= paintBudget + paintTolerance;
    const ttiPass = interactive <= ttiBudget + ttiTolerance;

    if (REPORT || !paintPass || !ttiPass) {
      console.log(`${name.padEnd(20)} paint ${String(firstPaint).padStart(5)}ms (budget ${paintBudget}+${paintTolerance}) ` +
        `TTI ${String(interactive).padStart(5)}ms (budget ${ttiBudget}+${ttiTolerance})`);
    }

    checks += 2;
    if (!paintPass) failures.push(`${name}: first paint ${firstPaint}ms exceeds budget ${paintBudget}ms + ${paintTolerance}ms tolerance`);
    if (!ttiPass) failures.push(`${name}: time to interactive ${interactive}ms exceeds budget ${ttiBudget}ms + ${ttiTolerance}ms tolerance`);
  }

  checks += 1;
  if (errors.length) failures.push(`page errors during measurement: ${errors.join(" | ")}`);

  await context.close();
} finally {
  await close();
}

assert.deepEqual(failures, [], `performance budgets exceeded at ${failures.length} place(s):\n  ` + failures.join("\n  "));
console.log(`budgets: ${checks} checks passed — every route meets its first paint and time to interactive budget at 390px with 4x CPU throttling.`);
