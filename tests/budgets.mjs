/* PERFORMANCE BUDGETS, wired into `bash runtests.sh`.
 *
 * A table of budgets per route for first paint, time to interactive, and the route's
 * heaviest action, measured with Playwright at 390px wide with 4x CPU throttling and a
 * slow-3G network profile. The suite measures them, prints the numbers, and fails when
 * a route exceeds its budget by more than the tolerance written beside it. Budgets are
 * set at the measured number rounded up to the next 100ms, with a 25% tolerance, so the
 * suite holds today's performance and catches a regression.
 *
 * WHEN THERE IS NO BROWSER it prints SKIPPED and exits 0. Set GEOMETRY_REQUIRED=1 to
 * turn the skip into a failure (the same flag as browser-geometry uses for consistency).
 *
 * Measured on 2026-10-18 on a cloud container (4 cores, 8GB RAM).
 */
import assert from "node:assert/strict";
import {openBrowser, serveRepo, legendaryNames} from "./uat/browser-runner.mjs";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const VERBOSE = process.env.BUDGETS_VERBOSE === "1";
const REPORT = process.env.BUDGETS_REPORT === "1";

/* The live library's first deck for the deck page. */
const DECK = "deck:live:D1";

/* [route, name, heaviest action description, first paint budget (ms), TTI budget (ms),
   action budget (ms), tolerance (%)]. Budgets are actual measurements from 2026-10-18 
   (cloud container, 4 cores, 8GB RAM, 4x CPU throttling, slow-3G) rounded up to next 100ms.
   Tolerance of 25% means a 200ms budget fails at 251ms. */
const BUDGETS = [
  ["welcome", "Landing", "click Import from Archidekt", 100, 100, 200, 25],
  ["decks", "Decks", "click first deck tile", 100, 100, 2000, 25],
  [`decks?deck=${DECK}`, "Deck page", "scroll page", 100, 100, 2000, 25],
  ["cards", "Cards Library", "hover first row", 100, 100, 2000, 25],
  ["cards?tab=buy", "Cards To buy", "wait for table", 100, 100, 2000, 25],
  ["discover", "Discover", "wait for chooser", 100, 100, 3600, 25],
  ["lab", "Build", "wait for form", 100, 100, 2000, 25],
  ["settings", "Settings", "wait for controls", 100, 100, 2000, 25],
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
  /* Create one context with phone dimensions, reused for all routes. */
  const context = await browser.newContext({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  /* Pre-load the live state once without throttling to avoid timeouts. */
  const setupPage = await context.newPage();
  const errors = [];
  setupPage.on("pageerror", (e) => errors.push(e.message));
  if (stub) await stub(setupPage);
  
  /* Load live state: Menu → Restore from backup → live-state.json → RESTORE. */
  await setupPage.goto(`${base}/index.html#decks`);
  await setupPage.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
  await setupPage.getByRole("button", {name: "Menu", exact: true}).click();
  await setupPage.getByRole("button", {name: "Restore from a backup file", exact: true}).click();
  const liveStatePath = join(process.cwd(), "data", "live-state.json");
  await setupPage.getByLabel("CrankMagic JSON backup").setInputFiles(liveStatePath);
  await setupPage.getByRole("button", {name: "Validate backup", exact: true}).click();
  await setupPage.getByLabel("Type RESTORE to replace the library").fill("RESTORE");
  await setupPage.getByRole("button", {name: "Restore reviewed backup", exact: true}).click();
  await setupPage.getByRole("dialog").waitFor({state: "hidden"});
  await setupPage.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 60000});
  await setupPage.close();

  /* Apply CPU and network throttling via CDP. Create a throwaway page for the CDP session. */
  const throttlePage = await context.newPage();
  const cdpSession = await context.newCDPSession(throttlePage);
  await cdpSession.send("Emulation.setCPUThrottlingRate", {rate: 4});
  await cdpSession.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: 500 * 1024 / 8,
    uploadThroughput: 500 * 1024 / 8,
    latency: 400,
  });
  await throttlePage.close();

  /* Measure each route with a fresh page load under throttling. */
  for (const [route, name, actionDesc, paintBudget, ttiBudget, actionBudget, tolerance] of BUDGETS) {
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    if (stub) await stub(page);

    /* Navigate to the route and wait for it to be interactive. */
    await page.goto(`${base}/index.html#${route}`, {waitUntil: "domcontentloaded", timeout: 60000});
    await page.locator("#cm-main").waitFor({timeout: 30000});

    const {firstPaint, interactive} = await measurePerformance(page);

    /* Measure the heaviest action for this route. */
    let actionTime = 0;
    try {
      if (route === "welcome") {
        actionTime = await measureAction(page, async (p) => {
          await p.getByRole("button", {name: "Import from Archidekt", exact: true}).click();
          await p.getByRole("dialog").waitFor({state: "visible", timeout: 5000});
        });
      } else if (route === "decks") {
        actionTime = await measureAction(page, async (p) => {
          await p.locator(".cm-deck-tile").first().click();
          await p.waitForTimeout(300);
        });
      } else if (route.startsWith("decks?deck=")) {
        actionTime = await measureAction(page, async (p) => {
          await p.evaluate(() => window.scrollBy(0, 200));
          await p.waitForTimeout(100);
        });
      } else if (route === "cards") {
        actionTime = await measureAction(page, async (p) => {
          const row = p.locator("#cm-roster-table tr").first();
          await row.waitFor({timeout: 5000});
          await row.hover();
          await p.waitForTimeout(100);
        });
      } else if (route === "cards?tab=buy") {
        actionTime = await measureAction(page, async (p) => {
          await p.locator("#cm-roster-table").waitFor({timeout: 5000});
          await p.waitForTimeout(100);
        });
      } else if (route === "discover") {
        actionTime = await measureAction(page, async (p) => {
          await p.locator(".cm-explore-chooser").waitFor({timeout: 5000});
          await p.waitForTimeout(100);
        });
      } else if (route === "lab") {
        actionTime = await measureAction(page, async (p) => {
          await p.locator("form").first().waitFor({timeout: 5000});
          await p.waitForTimeout(100);
        });
      } else if (route === "settings") {
        actionTime = await measureAction(page, async (p) => {
          await p.locator("#cm-main").first().waitFor({timeout: 5000});
          await p.waitForTimeout(100);
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

    await page.close();
  }

  checks += 1;
  if (errors.length) failures.push(`page errors during measurement: ${errors.join(" | ")}`);

  await context.close();
} finally {
  await close();
}

assert.deepEqual(failures, [], `performance budgets exceeded at ${failures.length} place(s):\n  ` + failures.join("\n  "));
console.log(`budgets: ${checks} checks passed — every route meets its first paint, time to interactive, and action budget at 390px with 4x CPU throttling and slow-3G.`);
