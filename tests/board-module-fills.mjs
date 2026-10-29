/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   A DRAWER MODULE GIVEN MORE HEIGHT FILLS IT (ROB-206, Luke's playtest of 2026-10-28; BUG-04; crankmagic-stage.css).

   Luke: "extending a drawer takes a moment before the module inside refreshes to the new size." Measured: the module's box
   follows the handle in the very frame (width and height both), but the list inside did not: History is a band fixed at 240px
   and Chat's list is capped, so the box grew and the list stayed, empty space under it, and it never caught up (1.2 seconds on,
   the same). A module with a height of its own now lets its list use all of it.

     1. History: after the module is made taller, the list is as tall as the box (less its padding), in the next frame.
     2. Chat: the same.
     3. It follows every step, not only the first, and shrinks back with the box.
     4. The drawer's width is not delayed: every module's width follows in the next frame (what it always did).

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-module-fills.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-module-fills", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "fill001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const PAD = 20; /* the body's padding (8px a side) and a little for a border */

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1100}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript(() => {localStorage.setItem("cm-board-view", "focus"); localStorage.setItem("crankmagic-audio-muted", "true");});
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {ws.send(JSON.stringify({type: "view", view: sample}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator("#cm-board").waitFor({timeout: 20000});
  await page.waitForTimeout(600);
  await page.locator("button.cm-stage-right[data-action=board-stage-side]").click();
  await page.waitForTimeout(900);

  const nextFrame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  /* A module's box and its list, the frame after a change. */
  const sizes = (id) => page.evaluate((mid) => {
    const body = document.querySelector(`#cm-stack-drawer .cm-stage-module[data-module="${mid}"] > .cm-module-body`);
    const list = body.firstElementChild;
    return {body: Math.round(body.getBoundingClientRect().height), list: Math.round(list.getBoundingClientRect().height)};
  }, id);
  const bar = (id) => page.locator(`#cm-stack-drawer .cm-stage-module[data-module="${id}"] [data-drag="modh"]`);

  for (const id of ["history", "chat"]) {
    await bar(id).focus();
    for (let step = 1; step <= 3; step++) {
      await page.keyboard.press("ArrowDown");
      await nextFrame();
      const s = await sizes(id);
      ok(s.list >= s.body - PAD, `${id}: after step ${step} the list uses the module's height (list ${s.list} of box ${s.body})`);
    }
    await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
    await nextFrame();
    const back = await sizes(id);
    ok(back.list <= back.body, `${id}: made shorter again, the list is no taller than the box (${back.list} of ${back.body})`);
    ok(back.list >= back.body - PAD, `${id}: and still fills it (${back.list} of ${back.body})`);
  }

  /* the width was never delayed */
  const widths = async () => page.evaluate(() => ({drawer: Math.round(document.querySelector("#cm-stack-drawer").getBoundingClientRect().width), mods: [...document.querySelectorAll("#cm-stack-drawer .cm-stage-module")].map((m) => Math.round(m.getBoundingClientRect().width))}));
  await page.locator('#cm-board [data-drag="panelw"]').focus();
  await page.keyboard.press("ArrowLeft");
  await nextFrame();
  const w = await widths();
  ok(w.mods.every((m) => m >= w.drawer - 40), `the drawer's width reaches every module in the next frame (${w.drawer}: ${w.mods.join(",")})`);
  ok(errors.length === 0, `no page error (${errors[0] || "none"})`);
  await context.close();
  console.log(`board-module-fills: ${checks} checks passed -- a module given more height lets History and Chat use it, step by step, and the drawer's width reaches every module at once.`);
} finally {
  await close();
}
