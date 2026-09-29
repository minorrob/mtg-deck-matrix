/* A START THAT NEVER ENDS SAYS SO (Rob, 2026-09-29, on a work computer with a VPN: the page "stays stuck on Opening
 * your library ... loading local records and the public card catalog, but it never stops"). crankmagic-app.js.
 *
 *   Held     the card catalog's download is held, as a VPN or a work filter scanning it can hold it: after the
 *            watchdog's time the placeholder says what is happening and what to do, and offers Reload
 *   Waiting  it keeps waiting: when the download lands, the app opens as usual and the note goes with the placeholder
 *   Reload   Reload reloads the page
 *   Normal   a start that finishes shows no note
 *
 * The watchdog's time is CRANK_SLOW_START_MS here (2 seconds), 15 seconds in the app.
 */
import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

const {browser, base, stub, close} = await openBrowser({name: "slow-start", flag: "GEOMETRY_REQUIRED"});
if (browser) try {
  const context = await browser.newContext({viewport: {width: 1280, height: 860}, serviceWorkers: "block"});
  await context.addInitScript(() => {globalThis.CRANK_SLOW_START_MS = 2000;});
  const page = await context.newPage();
  if (stub) await stub(page);
  /* HELD: the catalog's download does not answer until we let it. */
  let release;
  const held = new Promise((r) => {release = r;});
  await page.route(/data\/cards\.json/, async (route) => {await held; await route.fallback();});
  await page.goto(`${base}/index.html#decks`, {waitUntil: "domcontentloaded"});
  await page.locator(".cm-starting-slow").waitFor({timeout: 15000});
  const note = await page.locator(".cm-starting-slow").textContent();
  ok(/taking longer than it should/.test(note) && /VPN or a work network/.test(note) && /still trying/.test(note), "held, the start says it is taking too long, that a VPN or a work network can hold the download, and that it is still trying");
  ok(await page.getByRole("button", {name: "Reload", exact: true}).isVisible(), "and offers Reload");
  await shot(page, "slow-start-1280");
  /* WAITING: the download lands, and the app opens as usual. */
  release();
  await page.locator(".cm-starting").waitFor({state: "detached", timeout: 60000});
  ok(!(await page.locator(".cm-starting-slow").count()), "it kept waiting: when the download landed the app opened and the note went with the placeholder");
  /* RELOAD. */
  let again;
  const second = new Promise((r) => {again = r;});
  await page.unroute(/data\/cards\.json/);
  await page.route(/data\/cards\.json/, async (route) => {await second; await route.fallback();});
  await page.reload({waitUntil: "domcontentloaded"});
  await page.locator(".cm-starting-slow").waitFor({timeout: 15000});
  const [nav] = await Promise.all([page.waitForEvent("framenavigated", {timeout: 15000}), page.getByRole("button", {name: "Reload", exact: true}).click()]);
  ok(nav === page.mainFrame(), "Reload reloads the page");
  again();
  /* NORMAL: a start that finishes shows no note. */
  await page.unroute(/data\/cards\.json/);
  await page.goto(`${base}/index.html#decks`, {waitUntil: "domcontentloaded"});
  await page.locator(".cm-starting").waitFor({state: "detached", timeout: 60000});
  await page.waitForTimeout(2500);
  ok(!(await page.locator(".cm-starting-slow").count()), "a start that finishes shows no note, even after the watchdog's time");
  await context.close();
} finally {
  await close();
}
console.log(`slow-start: ${checks} checks passed — a start held by the network says so and offers Reload, keeps waiting, and a normal start shows nothing.`);
