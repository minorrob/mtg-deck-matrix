/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   PLAY SETTINGS, BACKGROUND AND TABLE DESIGN ARE IN THE TABLE MENU, NOT UNDER CAMERA (ROB-220, Luke's playtest of 2026-10-28; SET-01).

   Luke could not find backgrounds, or the drawer modules (which live inside Play settings), without being walked to them:
   both were under Camera, which is the view's own (seats, tilt, zoom, sizes). Rob: they belong in the Table top menu.

     1. Table ▾ holds Play settings, and in 3D the Background and Table design pickers.
     2. Camera ▾ holds none of them.
     3. Play settings opens from Table ▾ and holds Set Side Drawer Modules.
     4. A Background chosen in Table ▾ is applied.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-table-menu-settings.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-table-menu-settings", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "tmenu001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

async function board(mode) {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
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
  return {page, context, errors};
}

try {
  for (const mode of ["full", "focus", "table"]) {
    const {page, context, errors} = await board(mode);
    const threeD = mode === "full";

    await page.locator("[data-action=board-table-menu]").click();
    ok(await page.locator("#cm-table-menu [data-action=board-tools]").count() === 1, `${mode}: Table ▾ holds Play settings`);
    ok(await page.locator("#cm-table-menu [data-stage-style=background]").count() === (threeD ? 1 : 0), `${mode}: and the Background picker ${threeD ? "in 3D" : "only where there is a 3D scene"}`);
    ok(await page.locator("#cm-table-menu [data-stage-style=table]").count() === (threeD ? 1 : 0), `${mode}: and the Table design picker likewise`);

    await page.locator("[data-action=board-camera]").click();
    ok(await page.locator(".cm-stage-camera [data-action=board-tools]").count() === 0, `${mode}: Camera ▾ no longer holds Play settings`);
    ok(await page.locator(".cm-stage-camera [data-stage-style]").count() === 0, `${mode}: nor Background or Table design`);
    ok(await page.locator(".cm-stage-camera [data-stage-camera=zoom]").count() === 1, `${mode}: Camera keeps its own controls`);

    await page.locator("[data-action=board-table-menu]").click();
    if (threeD) {
      const other = await page.$$eval("#cm-table-menu [data-stage-style=background] option", (os) => os.map((o) => o.value).find((v) => v !== document.querySelector("#cm-table-menu [data-stage-style=background]").value));
      await page.locator("#cm-table-menu [data-stage-style=background]").selectOption(other);
      await page.waitForTimeout(400);
      if (!await page.locator("#cm-table-menu").count()) await page.locator("[data-action=board-table-menu]").click();
      ok(await page.locator("#cm-table-menu [data-stage-style=background]").inputValue() === other, `${mode}: a Background chosen in Table ▾ is taken (${other})`);
    }
    await page.locator("#cm-table-menu [data-action=board-tools]").click();
    await page.locator("#cm-dialog[open] #cm-board-tools").waitFor({timeout: 5000});
    ok(await page.locator("#cm-board-tools [data-action=board-modules-settings]").count() === 1, `${mode}: Play settings opens from Table ▾ and holds Set Side Drawer Modules`);
    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-table-menu-settings: ${checks} checks passed -- Play settings, Background and Table design are in the Table menu, Camera holds none of them, and Play settings still reaches the drawer modules.`);
} finally {
  await close();
}
