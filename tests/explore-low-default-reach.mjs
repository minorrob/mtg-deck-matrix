/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   EXPLORE OPENS ON ITS STRONGEST RELATIONSHIPS ONLY (ROB-217, Luke's playtest of 2026-10-28; DB-04).

   Explore opened at depth 2, breadth 12: a focused card with its neighbours and theirs, a crowded first view. Luke found it
   overloaded. The first view now reaches one hop and the eight strongest neighbours; the sliders still go up to 3 and 30.

     1. The depth and breadth sliders open at 1 and 8, and their read-outs say so.
     2. The graph is drawn at that reach: no card sits further than one hop from the focus.
     3. The sliders still widen it: depth 3 and breadth 30 are reachable and the read-outs follow.

   (The Trace chains panel and the Select / Inspect / Navigate modes are Rob's design call, left open on the issue.)

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/explore-low-default-reach.mjs
*/
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const {browser, base, stub, close} = await openBrowser({name: "explore-low-default-reach", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {(globalThis.CrankFeatures ||= []).push(() => {const mount = CrankGraph.mount; CrankGraph.mount = function (...args) {const g = mount.apply(this, args); globalThis.__graph = g; return g;};});});
  await loadLiveState(page, base);
  await page.goto(`${base}/index.html#discover?commander=${encodeURIComponent("Giada, Font of Hope")}`);
  await page.locator("#cm-depth").waitFor({timeout: 60000});
  await page.waitForTimeout(1500);

  /* ---- 1. the sliders open low ---- */
  const read = () => page.evaluate(() => ({depth: document.querySelector("#cm-depth").value, breadth: document.querySelector("#cm-breadth").value, depthOut: document.querySelector("#cm-depth-out").textContent, breadthOut: document.querySelector("#cm-breadth-out").textContent}));
  eq(await read(), {depth: "1", breadth: "8", depthOut: "1", breadthOut: "8"}, "Explore opens at depth 1 and breadth 8");

  /* ---- 2. and draws at that reach ---- */
  await page.waitForFunction(() => globalThis.__graph?.positions().length > 1, null, {timeout: 30000});
  const rows = await page.evaluate(() => globalThis.__graph.positions().map((n) => n.depth));
  ok(rows.length >= 2, `the graph drew neighbours (${rows.length} cards), so the next check can fail`);
  ok(Math.max(...rows) <= 1 && rows.length <= 9, `the first view draws the focus and at most eight neighbours, one hop out (${rows.length} cards)`);

  /* ---- 3. the sliders still widen it ---- */
  await page.locator("#cm-depth").fill("3");
  await page.locator("#cm-breadth").fill("30");
  eq(await read(), {depth: "3", breadth: "30", depthOut: "3", breadthOut: "30"}, "the sliders still reach depth 3 and breadth 30");

  eq(errors, [], "no page error");
  await context.close();
  console.log(`explore-low-default-reach: ${checks} checks passed -- Explore opens at depth 1 and breadth 8 and the sliders still widen it.`);
} finally {
  await close();
}
