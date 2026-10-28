/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB-29 AND ROB-169 ON THE BOARD (Oct 20, 2026).
 *
 * The commander tax: a commander in the command zone carries the room's `commanderTax` (game/engine/projection.mjs),
 * and the board shows it at the card's top-right, as Rob asked, and says it with the card's name. Partners: the command
 * zone draws every card in it, so the second partner can be seen, inspected and cast from the pile. A castable commander
 * is lit like a castable card in hand; its native menu stages Cast, then W14's primary binds the single offered action.
 *
 * A look at another player's hand (the `handLook` decision, mode `ack`, game/engine/script/effects/asking.mjs): the
 * cards it is about are drawn above OK, each opens Card zoom, and OK answers it with nothing chosen.
 *
 * Each in Full, Table and Focus at 1280x720 and the phone at 390x844, hit-tested with elementFromPoint (a Playwright
 * click proves no reach). GEOMETRY_REQUIRED=1 refuses a missing browser.
 *   node tests/board-commander-hand.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
const {browser, base, stub, close} = await openBrowser({name: "board-commander-hand", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TYMNA = 81001, KRAUM = 81002;
/* Why Tymna can't be cast now (ROB-24): the room's words on its own card, which nothing offered plays. */
const TYMNA_WHY = "It costs 4 mana, the commander tax included, and you can make 3 now.";
const commander = (cardId, name, tax) => ({cardId, name, owner: 0, controller: 0, faceDown: false, tapped: false, damage: 0, counters: {},
  types: ["Creature"], power: tax === 2 ? 0 : 4, toughness: tax === 2 ? 2 : 4, keywords: [], commander: true, commanderTax: tax});
function commanderView() {
  const v = structuredClone(sample);
  v.revision = 30000;
  v.state.players[0].zones.Command = {count: 2, hiddenCount: 0, cards: [{...commander(TYMNA, "Tymna the Weaver", 2), why: TYMNA_WHY}, commander(KRAUM, "Kraum, Ludevic's Opus", 0)]};
  v.decision = {id: "priority:25:3:900", title: "Your priority", mode: "one", min: 1, max: 1, kind: "priority",
    options: [{index: 0, label: "Pass priority", act: "pass"}, {index: 1, label: "Kraum, Ludevic's Opus", act: "cast", cardId: KRAUM}]};
  return v;
}
function handLookView() {
  const v = structuredClone(sample);
  v.revision = 30001;
  v.decision = {id: "handLook:2:25", title: "Peek: you look at AI 2's hand", mode: "ack", min: 0, max: 0,
    options: [{index: 0, label: "Lightning Bolt", cardId: 91001}, {index: 1, label: "Counterspell", cardId: 91002}]};
  return v;
}
async function fixture(view, width, height, mode) {
  const frames = [], context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table: {tableId: "cmdr0001", phase: "playing", matchId: view.matchId, away: [],
    seats: view.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: "human", mat: "felt", you: p.playerId === view.seat}))}, now: Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/cmdr0001\/connect$/, (ws) => {ws.onMessage((data) => frames.push(JSON.parse(data))); ws.send(JSON.stringify({type: "view", view}));});
  await page.goto(`${base}/index.html#table?id=cmdr0001`);
  await page.locator("#cm-board").waitFor();
  await page.waitForTimeout(400);
  return {page, context, frames, errors};
}
/* Reached where a person would press it: the element itself is under the point, inside the window. */
async function reach(page, selector, [fx, fy] = [0.5, 0.5]) {
  return page.locator(selector).first().evaluate((el, [fx, fy]) => {
    const r = el.getBoundingClientRect(), x = r.x + r.width * fx, y = r.y + r.height * fy;
    return {ok: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && el.contains(document.elementFromPoint(x, y)), x, y};
  }, [fx, fy]);
}
const acts = (frames) => frames.filter((f) => f.type === "act");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
try {
  for (const [width, height, mode] of [[1280, 720, "full"], [1280, 720, "table"], [1280, 720, "focus"], [390, 844, "focus"]]) {
    const where = `${mode} ${width}x${height}`;
    /* ---- the commander tax and partners ---- */
    {
      const {page, context, frames, errors} = await fixture(commanderView(), width, height, mode);
      const pile = `[data-zone="command"]`, tymna = `${pile} .cm-bcard[data-card="${TYMNA}"]`, kraum = `${pile} .cm-bcard[data-card="${KRAUM}"]`;
      ok(await page.locator(tymna).count() === 1 && await page.locator(kraum).count() === 1 && await page.locator(tymna).evaluate((el, k) => !!el.closest('[data-zone="command"]').querySelector(`.cm-bcard[data-card="${k}"]`), KRAUM), `${where}: both partners are drawn, together in the command zone`);
      ok((await page.locator(`${tymna} .cm-bcard-tax`).innerText()).trim() === "+2", `${where}: Tymna's tax badge says +2`);
      ok((await page.locator(`${kraum} .cm-bcard-tax`).innerText()).trim() === "+0", `${where}: Kraum's tax badge says +0`);
      ok(/commander tax 2/.test(await page.locator(tymna).getAttribute("aria-label")), `${where}: the tax is said with Tymna's name`);
      /* Measured in the card's own layout, before any transform: the phone's board is turned 90 degrees and Full's table tilted. */
      const badge = await page.locator(`${tymna} .cm-bcard-tax`).evaluate((b) => {const c = b.closest(".cm-bcard"); return {right: c.clientWidth - b.offsetLeft - b.offsetWidth, top: b.offsetTop, w: c.clientWidth, px: parseFloat(getComputedStyle(b).fontSize)};});
      ok(badge.right < badge.w * 0.2 && badge.top < badge.w * 0.2 && badge.px >= 10, `${where}: the badge sits at the card's top-right, at 10px or more (${JSON.stringify(badge)})`);
      const apart = await page.locator(tymna).evaluate((el) => {const b = el.querySelector('.cm-bcard-tax'), n = el.querySelector('.cm-bcard-name'); return n.offsetLeft + n.offsetWidth <= b.offsetLeft + 0.5 || n.offsetTop + n.offsetHeight <= b.offsetTop + 0.5;});
      ok(apart, `${where}: the badge never lies over the name`);
      ok(await page.locator(kraum).evaluate((el) => el.classList.contains("is-bright")), `${where}: castable Kraum is lit`);
      ok(!(await page.locator(tymna).evaluate((el) => el.classList.contains("is-bright"))), `${where}: Tymna, with nothing to do, is not`);
      ok((await page.locator(tymna).getAttribute("aria-label")).endsWith(`. ${TYMNA_WHY}`), `${where}: and says why, with her name (ROB-24)`);
      const k = await reach(page, kraum), t = await reach(page, tymna, [0.3, 0.15]);
      ok(k.ok, `${where}: Kraum takes the pointer`);
      ok(t.ok, `${where}: Tymna's uncovered top takes the pointer`);
      /* Current native path (Rob, 2026-10-27): the card, then its row -- two presses -- and a row that asks nothing more is sent at once. */
      await page.mouse.click(k.x, k.y);
      const cast = '#cm-card-menu [data-action="board-card-menu-do"][data-index="1"]';
      await page.locator(cast).waitFor();
      ok(acts(frames).length === 0, `${where}: opening Kraum's native menu sends no action`);
      const castAt = await reach(page, cast);
      ok(castAt.ok, `${where}: Kraum's Cast offer takes the pointer`);
      await page.mouse.click(castAt.x, castAt.y);
      await page.waitForTimeout(100);
      ok(acts(frames).length === 1 && acts(frames)[0].choiceId === "priority:25:3:900" && JSON.stringify(acts(frames)[0].indices) === "[1]", `${where}: exactly one action casts Kraum from the command zone (${JSON.stringify(acts(frames))})`);
      ok(!errors.length, `${where}: no page error (${errors.join(" | ")})`);
      await context.close();
    }
    /* ---- why Tymna can't be cast now (ROB-24): shown where her options would be, once she is picked ---- */
    {
      const {page, context, errors} = await fixture(commanderView(), width, height, mode);
      const t = await reach(page, `[data-zone="command"] .cm-bcard[data-card="${TYMNA}"]`, [0.3, 0.15]);
      await page.mouse.click(t.x, t.y);
      await page.waitForTimeout(400);
      await page.locator('#cm-card-menu .cm-card-menu-none').waitFor();
      const said = await page.locator('#cm-card-menu .cm-card-menu-none').innerText();
      ok(said.endsWith(TYMNA_WHY), `${where}: Tymna's native menu gives the authoritative reason she can't be cast (${JSON.stringify(said)})`);
      ok(errors.length === 0, `${where}: no page errors`);
      await context.close();
    }
    /* ---- a look at another player's hand ---- */
    {
      const {page, context, frames, errors} = await fixture(handLookView(), width, height, mode);
      const shown = "#cm-board-decision .cm-board-shown";
      ok(await page.locator(`${shown} [data-card="91001"]`).count() === 1 && await page.locator(`${shown} [data-card="91002"]`).count() === 1, `${where}: the hand looked at is drawn, both cards`);
      ok(/Lightning Bolt/.test(await page.locator(`${shown} [data-card="91001"]`).getAttribute("aria-label")), `${where}: each card is named`);
      ok((await reach(page, `${shown} [data-card="91002"]`)).ok, `${where}: a shown card takes the pointer`);
      const zoomAt = await reach(page, `${shown} [data-card="91001"]`);
      await page.mouse.click(zoomAt.x, zoomAt.y);
      await page.locator("#cm-card-inspector").waitFor({timeout: 5000});
      ok(/Lightning Bolt/.test(await page.locator("#cm-card-inspector").innerText()), `${where}: a shown card opens read-only inspection`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("#cm-card-inspector"), null, {timeout: 5000});
      const okAt = await reach(page, '#cm-board-decision [data-action="board-confirm"]');
      ok(okAt.ok, `${where}: OK takes the pointer`);
      await page.mouse.click(okAt.x, okAt.y);
      await page.waitForTimeout(300);
      ok(acts(frames).some((f) => f.choiceId === "handLook:2:25" && JSON.stringify(f.indices) === "[]"), `${where}: OK answers the look with nothing chosen`);
      ok(!errors.length, `${where}: no page error (${errors.join(" | ")})`);
      await context.close();
    }
    console.log(`  ok  ${where}`);
  }
} finally {await close();}
console.log(`board-commander-hand: ${checks} checks passed -- the commander tax at its top-right and said, both partners drawn, lit and castable from the pile; a look at a hand drawn, zoomable and answered; in Full, Table, Focus and on the phone, by elementFromPoint`);
