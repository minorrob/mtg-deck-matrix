/* A NEW VERSION WAITS UNTIL YOU SAY (docs/app-walkthrough-plan-2026-09-19.md §9.4, M-18; docs/plan-to-100.md M10).
 *
 * A service worker that took over mid-session would leave an open page fetching `?v=` URLs its new lists no longer
 * carry. So a new version installs and waits; the page says "A new version of CrankMagic is ready" with Reload, and
 * the notice stays until answered; only the click lets the new worker take over, and the page reloads when it has.
 *
 * The test registers the worker under the next release's `?v=` on the same scope, which is what a deploy's new pin does.
 * Needs Playwright (GEOMETRY_REQUIRED=1 makes its absence a failure).
 */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser} from "./uat/browser-runner.mjs";

const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

const {browser, base, stub, close} = await openBrowser({name: "sw-update", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: "allow"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.goto(`${base}/index.html#decks`);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, {timeout: 60000});
  ok(true, "the first visit installs the worker and it takes the page");

  /* The deploy: the page is still open when the next release's pin arrives -- the same scope, a new `?v=`, which the
     browser installs as the next version of this worker. */
  await page.evaluate(() => { globalThis.__before = true; });
  await page.evaluate(async () => { await navigator.serviceWorker.register("crankmagic-sw.js?v=next-release", {scope: "./"}); });
  const toast = page.locator("#cm-notice", {hasText: "A new version of CrankMagic is ready."});
  await toast.waitFor({timeout: 60000});
  ok(await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); return Boolean(reg.waiting) && globalThis.__before === true; }), "the new version installs and waits, and the page is not reloaded under you");
  await page.waitForTimeout(8000);
  ok(await toast.isVisible(), "the notice stays past the usual seven seconds, until it is answered");
  if (SHOTS) await page.screenshot({path: path.join(SHOTS, "new-version-ready-1280.png")});

  await Promise.all([page.waitForEvent("load", {timeout: 60000}), toast.locator("button", {hasText: "Reload"}).click()]);
  ok(await page.evaluate(() => globalThis.__before === undefined), "Reload lets the new worker take over, and the page reloads");
  ok(await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !reg.waiting && Boolean(reg.active); }), "and nothing is left waiting");
  await context.close();
} finally {
  await close();
}
console.log(`sw-update: ${checks} checks passed — a new version installs and waits, says so until answered, and takes over only on Reload.`);
