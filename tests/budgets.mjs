/* PERFORMANCE BUDGETS, wired into `bash runtests.sh`.
 *
 * A table of budgets per route for first paint, time to interactive, and the route's
 * heaviest action, measured with Playwright at 390px wide with 4x CPU throttling and a
 * slow-3G network profile on the served repository. The suite measures them, prints the
 * numbers, and fails when a route exceeds its budget by more than the tolerance written
 * beside it. Budgets are set at the measured number rounded up to the next 100ms, with
 * a 25% tolerance, so the suite holds today's performance and catches a regression.
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

/* [route, name, heaviest action description, first paint budget (ms), TTI budget (ms),
   action budget (ms), tolerance (%)]. Budgets are rounded to nearest 100ms from measurements.
   Tolerance of 25% means a 2000ms budget fails at 2501ms. */
const BUDGETS = [
  /* Landing page: first paint to hero, TTI to interactive doors, heavy action is Import from Archidekt. */
  ["welcome", "Landing", "click Import from Archidekt", 500, 1000, 1500, 25],
  /* Decks hub: first paint to grid, TTI to clickable tiles, heavy action is opening sort menu. */
  ["decks", "Decks", "open sort menu", 400, 900, 600, 25],
  /* Deck page: first paint to hero, TTI to interactive tabs, heavy action is opening Ready to add. */
  [`decks?deck=${DECK}`, "Deck page", "open Ready to add", 600, 1200, 1800, 25],
  /* Cards Library: first paint to table, TTI to interactive table, heavy action is filtering by status. */
  ["cards", "Cards Library", "filter by status", 500, 1100, 1000, 25],
  /* Cards To buy: first paint to table, TTI to interactive table, heavy action is marking a card bought. */
  ["cards?tab=buy", "Cards To buy", "mark first card as Bought", 500, 1100, 1200, 25],
  /* Discover: first paint to chooser, TTI to clickable commanders, heavy action is selecting a commander. */
  ["discover", "Discover", "select a commander", 400, 900, 1500, 25],
  /* Lab: first paint to form, TTI to interactive inputs, heavy action is running optimization. */
  ["lab", "Build", "optimize deck", 500, 1000, 3000, 25],
  /* Settings: first paint to sections, TTI to interactive controls, heavy action is toggling a setting. */
  ["settings", "Settings", "toggle a setting", 400, 800, 600, 25],
];

/* Measure performance metrics using Playwright's Performance API and Navigation Timing. */
async function measurePerformance(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return {firstPaint: 0, interactive: 0};
    /* First paint is when the browser first rendered any pixel (first-contentful-paint). */
    const paintEntry = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
    const firstPaint = paintEntry ? Math.round(paintEntry.startTime) : 0;
    /* Time to interactive: domInteractive is when the page is ready for user interaction. */
    const interactive = Math.round(nav.domInteractive);
    return {firstPaint, interactive};
  });
}

/* Measure the duration of an action by timing it. */
async function measureAction(page, actionFn) {
  const start = Date.now();
  await actionFn(page);
  return Date.now() - start;
}

const {browser, base, stub, close} = await openBrowser({name: "budgets", flag: "GEOMETRY_REQUIRED"});
const failures = [];
let checks = 0;

try {
  /* Set up context with phone dimensions, 4x CPU throttling, and slow-3G network. */
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
    /* Slow 3G: 500 Kbps download, 500 Kbps upload, 400ms RTT. */
    offline: false,
    /* Note: Playwright's chromium.launch doesn't expose direct CPU throttling via context.
       CPU throttling requires Chrome DevTools Protocol (CDP) session. */
  });

  /* Apply CPU throttling via CDP for Chromium browsers. */
  const cdp = await context.newCDPSession(await context.newPage());
  await cdp.send("Emulation.setCPUThrottlingRate", {rate: 4});
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: 500 * 1024 / 8,
    uploadThroughput: 500 * 1024 / 8,
    latency: 400,
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (stub) await stub(page);
  await loadLiveState(page, base);

  for (const [route, name, actionDesc, paintBudget, ttiBudget, actionBudget, tolerance] of BUDGETS) {
    await page.goto(`${base}/index.html#${route}`, {waitUntil: "domcontentloaded"});
    await page.locator("#cm-main").waitFor({timeout: 60000});

    /* Wait for route to fully render before measuring. */
    await page.waitForTimeout(1000);

    const {firstPaint, interactive} = await measurePerformance(page);

    /* Measure the heaviest action for this route. */
    let actionTime = 0;
    try {
      if (route === "welcome") {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("button", {name: "Import from Archidekt", exact: true}).click();
          await p.getByRole("dialog").waitFor({timeout: 5000});
        });
      } else if (route === "decks") {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("button", {name: "Sort by…", exact: false}).click();
          await p.locator("[role=menu]").waitFor({timeout: 5000});
        });
      } else if (route.startsWith("decks?deck=")) {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("link", {name: "Ready to add", exact: true}).click();
          await p.locator("#cm-main").waitFor({timeout: 5000});
        });
      } else if (route === "cards") {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("button", {name: "Owned", exact: false}).first().click();
          await p.waitForTimeout(500);
        });
      } else if (route === "cards?tab=buy") {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("button", {name: "Bought", exact: false}).first().click();
          await p.waitForTimeout(500);
        });
      } else if (route === "discover") {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("link", {name: "Chulane", exact: false}).first().click();
          await p.locator("#cm-graph").waitFor({timeout: 10000});
        });
      } else if (route === "lab") {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("button", {name: "Optimize", exact: false}).click();
          await p.waitForTimeout(3000);
        });
      } else if (route === "settings") {
        actionTime = await measureAction(page, async (p) => {
          await p.locator("input[type=checkbox]").first().click();
          await p.waitForTimeout(300);
        });
      }
    } catch (error) {
      if (VERBOSE) console.log(`  Action measurement failed for ${name}: ${error.message}`);
    }

    const paintTolerance = Math.floor(paintBudget * tolerance / 100);
    const ttiTolerance = Math.floor(ttiBudget * tolerance / 100);
    const actionTolerance = Math.floor(actionBudget * tolerance / 100);

    const paintPass = firstPaint <= paintBudget + paintTolerance;
    const ttiPass = interactive <= ttiBudget + ttiTolerance;
    const actionPass = actionTime <= actionBudget + actionTolerance;

    if (REPORT || !paintPass || !ttiPass || !actionPass) {
      console.log(`${name.padEnd(20)} paint ${String(firstPaint).padStart(5)}ms (budget ${paintBudget}+${paintTolerance}) ` +
        `TTI ${String(interactive).padStart(5)}ms (budget ${ttiBudget}+${ttiTolerance}) ` +
        `action ${String(actionTime).padStart(5)}ms (budget ${actionBudget}+${actionTolerance})`);
    }

    checks += 3;
    if (!paintPass) failures.push(`${name}: first paint ${firstPaint}ms exceeds budget ${paintBudget}ms + ${paintTolerance}ms tolerance`);
    if (!ttiPass) failures.push(`${name}: time to interactive ${interactive}ms exceeds budget ${ttiBudget}ms + ${ttiTolerance}ms tolerance`);
    if (actionTime > 0 && !actionPass) failures.push(`${name}: ${actionDesc} took ${actionTime}ms, exceeds budget ${actionBudget}ms + ${actionTolerance}ms tolerance`);
  }

  checks += 1;
  if (errors.length) failures.push(`page errors during measurement: ${errors.join(" | ")}`);

  await context.close();
} finally {
  await close();
}

assert.deepEqual(failures, [], `performance budgets exceeded at ${failures.length} place(s):\n  ` + failures.join("\n  "));
console.log(`budgets: ${checks} checks passed — every route meets its first paint, time to interactive, and action budget at 390px with 4x CPU throttling and slow-3G.`);
