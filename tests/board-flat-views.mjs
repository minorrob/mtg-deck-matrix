/* TABLE AND FOCUS ARE THE 3D VIEW'S HUD ON A FLAT STAGE (Rob, 2026-10-28), in a real Chromium on the recorded room views of
 * docs/reference/replit-sample-views.json (the cloud board over a stubbed socket, as tests/uat/browser-runner.mjs stands it in):
 *
 *   1. One HUD: the header, the turn box, the action pop-up, the Camera and Table menus and the drawers are the same in Table, Focus and 3D;
 *      the header carries no End turn or Skip to end (the pop-up over the stage has them).
 *   2. The drawers are the top layer: opening or closing either moves neither the stage nor the hand nor a board, in all three views; a drawer
 *      lies over the stage (its edge is what a pointer finds), and a flat view's boards keep clear of where the drawers lie.
 *   3. Table: every seat's board the same 16:9, none under a drawer, none over another. Focus: the board looked at 16:9 with the others behind it.
 *   4. The 3D view's zoom and pan move the flat boards: the wheel zooms, a drag across the table pans, Camera's slider zooms.
 *   5. Chat is a default module of the right drawer.
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-flat-views", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[5];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table = {tableId: "r5fixture01", phase: "playing", matchId: sample.matchId, away: [], blockers: [], rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true}))};
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

async function open(mode, width, height) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage(); if (stub) await stub(page);
  const errors = []; page.on("pageerror", (x) => errors.push(x.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "r5@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.route(/\/assets\/environments\/[^/?]+\.webm(\?.*)?$/, (r) => r.abort());
  await page.routeWebSocket(/\/api\/tables\/r5fixture01\/connect$/, (ws) => {ws.send(JSON.stringify({type: "view", view: sample}));});
  await page.goto(`${base}/index.html#table?id=r5fixture01`);
  await page.locator("#cm-board .cm-stage-top").first().waitFor({timeout: 60000});
  await page.waitForTimeout(1200);
  await page.evaluate(() => {for (const sel of ['[data-action="board-stage-rail"][aria-expanded="false"]', '[data-action="board-stage-side"][aria-expanded="false"]']) document.querySelector(sel)?.click();});
  await page.waitForTimeout(1200);
  return {page, context, errors};
}
const rects = (page) => page.evaluate(() => {
  const R = (e) => {const b = e.getBoundingClientRect(); return {x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height)};};
  const one = (s) => {const e = document.querySelector(s); return e ? R(e) : null;};
  return {region: one(".cm-stage-region"), hand: one(".cm-stage-hand"), fan: one(".cm-stage-fan"), rail: one(".cm-stage-rail.is-open"), side: one(".cm-stage-side.is-open"),
    boards: [...document.querySelectorAll(".cm-stage-slot > .cm-mat, .cm-stage-slot.cm-stage-big")].map(R), slots: [...document.querySelectorAll(".cm-stage-slot, .cm-stage-rear")].map(R)};
});
const toggle = async (page, action) => {await page.evaluate((a) => document.querySelector(`[data-action="${a}"]`)?.click(), action); await page.waitForTimeout(900);};
const hud = (page) => page.evaluate(() => ({
  top: !!document.querySelector(".cm-stage-top"), caption: !!document.querySelector(".cm-stage-caption"), actions: !!document.querySelector(".cm-stage-actions"),
  camera: !!document.querySelector('[data-action="board-camera"]'), menu: !!document.querySelector(".cm-table-menu, [data-action=\"board-table-menu\"]"),
  rail: !!document.querySelector(".cm-stage-rail"), side: !!document.querySelector(".cm-stage-side"),
  headerText: document.querySelector(".cm-stage-top")?.textContent || "", popup: document.querySelector(".cm-stage-actions")?.textContent || "",
  modules: [...document.querySelectorAll(".cm-stage-module")].map((m) => m.dataset.module)}));

const results = {};
for (const mode of ["table", "focus", "full"]) {
  const {page, context, errors} = await open(mode, 1440, 900);
  const h = results[mode] = await hud(page);
  ok(h.top && h.caption && h.actions && h.camera && h.rail && h.side, `${mode}: the header, turn box, action pop-up, Camera and both drawers are drawn`);
  ok(!/End turn|Skip to end/i.test(h.headerText), `${mode}: the header carries no End turn or Skip to end`);
  ok(/Next step|Skip to end|End turn/i.test(h.popup), `${mode}: the action pop-up over the stage carries the turn's buttons`);
  ok(h.modules.includes("chat"), `${mode}: Chat is a default module of the drawers`);

  /* the drawers move nothing */
  const both = await rects(page);
  ok(both.rail && both.side, `${mode}: both drawers are open to begin with`);
  await toggle(page, "board-stage-rail");
  const noRail = await rects(page);
  await toggle(page, "board-stage-side");
  const none = await rects(page);
  for (const [name, a] of [["with the left drawer shut", noRail], ["with both shut", none]]) {
    eq(a.region, both.region, `${mode}: the stage does not move ${name}`);
    eq(a.hand, both.hand, `${mode}: the hand does not move ${name}`);
    eq(a.fan, both.fan, `${mode}: the hand's cards do not move ${name}`);
    if (mode !== "full") eq(a.slots, both.slots, `${mode}: no board moves ${name}`);
  }
  ok(both.region.x === 0 && both.region.w === 1440, `${mode}: the stage is the window's whole width`);
  ok(both.hand.x === 0 && both.hand.w === 1440, `${mode}: the hand is the window's whole width`);
  await toggle(page, "board-stage-rail"); await toggle(page, "board-stage-side");
  const over = await page.evaluate(() => {
    const rail = document.querySelector(".cm-stage-rail.is-open").getBoundingClientRect(), side = document.querySelector(".cm-stage-side.is-open").getBoundingClientRect();
    const at = (x, y) => document.elementFromPoint(x, y);
    return {left: !!at(rail.left + 40, rail.top + rail.height - 30)?.closest(".cm-stage-rail"), right: !!at(side.left + 40, side.top + side.height - 30)?.closest(".cm-stage-side")};
  });
  ok(over.left && over.right, `${mode}: a drawer lies over the stage and the hand (it is what a pointer finds at its edge)`);

  if (mode !== "full") {
    const g = await rects(page), left = g.rail.x + g.rail.w, right = g.side.x;
    for (const b of g.slots) ok(b.x >= left && b.x + b.w <= right, `${mode}: a board lies between the drawers (${b.x}..${b.x + b.w} within ${left}..${right})`);
    if (mode === "table") {
      eq(g.slots.length, 4, "table: four boards for four seats");
      for (const b of g.slots) {
        ok(Math.abs(b.w * 9 / 16 - b.h) <= 1.5, `table: a board is 16:9 (${b.w}x${b.h})`);
        ok(Math.abs(b.w - g.slots[0].w) <= 1 && Math.abs(b.h - g.slots[0].h) <= 1, "table: every board is the same size");
      }
      for (const [i, a] of g.slots.entries()) for (const b of g.slots.slice(i + 1)) ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, "table: no board lies over another");
      for (const b of g.slots) ok(b.y + b.h <= g.hand.y + g.hand.h && b.y >= g.region.y, "table: a board lies inside the stage");
    } else {
      const big = g.slots.find((s) => s.w === Math.max(...g.slots.map((x) => x.w)));
      ok(Math.abs(big.w * 9 / 16 - big.h) <= 1.5, `focus: the board looked at is 16:9 (${big.w}x${big.h})`);
      ok(g.slots.length === 4 && g.slots.filter((s) => s.y + s.h <= big.y + 2).length === 3, "focus: the three others lie behind it");
    }
    /* nothing of a board is cut off inside its own board: its cards and piles keep to it */
    const cut = await page.evaluate(() => [...document.querySelectorAll(".cm-stage-slot .cm-mat")].filter((m) => m.scrollHeight > m.clientHeight + 1).map((m) => `${m.dataset.seat}:${m.scrollHeight}>${m.clientHeight}`));
    eq(cut, [], `${mode}: no board's content runs past its own edge`);
  }
  ok(errors.length === 0, `${mode}: no page error (${errors.join("; ")})`);
  await context.close();
}
eq(results.table.modules, results.full.modules, "the same drawer modules in Table and 3D");
eq(results.focus.modules, results.full.modules, "the same drawer modules in Focus and 3D");
eq(results.table.headerText.replace(/\s+/g, " "), results.full.headerText.replace(/\s+/g, " "), "the header reads the same in Table and 3D");
eq(results.focus.headerText.replace(/\s+/g, " "), results.full.headerText.replace(/\s+/g, " "), "the header reads the same in Focus and 3D");
eq(results.table.popup.replace(/\s+/g, " "), results.full.popup.replace(/\s+/g, " "), "the action pop-up reads the same in Table and 3D");

/* zoom and pan, the 3D view's, on the flat boards */
for (const mode of ["table", "focus"]) {
  const {page, context} = await open(mode, 1440, 900);
  /* a board is drawn at its sharp size and set by one matrix to the zoom: what is seen is the board's width on the page */
  const first = () => page.evaluate(() => {const b = document.querySelector(".cm-stage-slot").getBoundingClientRect(); return {w: b.width, x: b.left, y: b.top};});
  const w0 = (await first()).w;
    const at = await page.evaluate(() => {const r = document.querySelector(".cm-stage-region").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height * 0.45];});
  await page.mouse.move(at[0], at[1]); await page.mouse.wheel(0, -400); await page.waitForTimeout(500);
  const b = await first(); ok(b.w > w0 * 1.05, `${mode}: the wheel over the stage zooms the boards in (${b.w} from ${w0})`);
  await page.mouse.wheel(0, 900); await page.waitForTimeout(500);
  const c = await first(); ok(c.w < b.w, `${mode}: and out again`);
  await page.evaluate(() => document.querySelector('[data-action="board-camera"]')?.click()); await page.waitForTimeout(400);
  const zoom = page.locator('[data-stage-camera="zoom"]'); ok(await zoom.count() === 1, `${mode}: Camera has the zoom slider`);
  await zoom.evaluate((el) => {el.value = "150"; el.dispatchEvent(new Event("input", {bubbles: true}));}); await page.waitForTimeout(500);
  const d = await first(); ok(Math.abs(d.w / w0 - 1.5) < .02, `${mode}: Camera's zoom slider sets the scale (${d.w / w0})`);
  /* a drag across the table moves it, as in 3D: from empty mat, not from a card, a button or a handle */
  await zoom.evaluate((el) => {el.value = "100"; el.dispatchEvent(new Event("input", {bubbles: true}));}); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-action="board-camera"]')?.click()); await page.waitForTimeout(300);
  const pt = await page.evaluate(() => {for (const m of document.querySelectorAll(".cm-stage-slot .cm-mat")) {const r = m.getBoundingClientRect();
    for (let y = r.top + 4; y < r.bottom - 4; y += 6) for (let x = r.left + 4; x < r.right - 4; x += 6) {const el = document.elementFromPoint(x, y);
      if (el && m.contains(el) && !el.closest(".cm-bcard, button, a, [role=button], [data-zone-scroll], [data-drag], [draggable=true]")) return [x, y];}} return null;});
  ok(pt, `${mode}: there is empty mat to drag from`);
  const p0 = await first();
  await page.mouse.move(pt[0], pt[1]); await page.mouse.down(); await page.mouse.move(pt[0] - 90, pt[1] - 40, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(400);
  const p1 = await first(); ok(p1.x < p0.x - 60 && p1.y < p0.y - 20, `${mode}: a drag across the table pans the boards (${p0.x},${p0.y} to ${p1.x},${p1.y})`);
  await context.close();
}
console.log(`board-flat-views: ${checks} checks passed — one HUD in Table, Focus and 3D, the drawers over a stage that never moves, Table's boards identical 16:9, zoom and pan on the flat boards, Chat a default module`);
await close();
