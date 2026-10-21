/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CALLOUTS NEVER OVER A QUESTION (Rob's one-person, three-AI table, Oct 21).
 *
 * The solo-vs-AI run's screens: "LIFE -1" and "LIFE -3" laid over Discard 1 card's options, and "YOUR TURN" over the
 * turns-gone-by panel. The callouts lie over the table (crankmagic-board.js, placeCallouts); a question asked of you is
 * read first. With a question's panel on screen and a new view earning callouts, the callout layer is below the panel, or
 * above it, or out of sight -- never over it -- and once the question is answered it is back in its own place. And a
 * callout is seen: on the phone the board lay over the layer, so none ever showed there.
 *
 * In Full, Table and Focus at 1280x720 and the phone at 390x844. GEOMETRY_REQUIRED=1 refuses a missing browser; SHOTS=<dir>
 * saves each view as the callouts are shown.
 *   node tests/board-callouts-place.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import {readFileSync, mkdirSync} from "node:fs";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-callouts-place", flag: "GEOMETRY_REQUIRED"});
const SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
/* Discard 1 card, asked of the person, on another player's turn. */
function askedView() {
  const v = structuredClone(sample);
  v.revision = 40000;
  v.seat = 0; v.seatId = "s0"; v.waitingOn = "s0";
  v.state.turnPlayerId = 1; v.state.activePlayer = 1; v.state.phase = "MAIN1"; v.state.combat = null; v.state.stack = [];
  const hand = v.state.players[0].zones.Hand.cards.filter((c) => c.name).slice(0, 6);
  v.decision = {id: "choose-discard:31", title: "Discard 1 card", kind: "choose", mode: "one", min: 1, max: 1,
    options: hand.map((c, index) => ({index, label: c.name, cardId: c.cardId}))};
  return v;
}
/* The next view: the same question, every player's life moved -- four LIFE callouts and more coming than are read at once. */
function lifeMoved(v, revision) {
  const n = structuredClone(v);
  n.revision = revision;
  n.state.players.forEach((p, i) => {p.health.life -= 1 + i; p.life = p.health.life;});
  return n;
}
async function fixture(view, width, height, mode) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let socket = null;
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table: {tableId: "cal00001", phase: "playing", matchId: view.matchId, away: [],
    seats: view.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === view.seat ? "human" : "ai", mat: "felt", you: p.playerId === view.seat}))}, now: Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/cal00001\/connect$/, (ws) => {socket = ws; ws.send(JSON.stringify({type: "view", view}));});
  await page.goto(`${base}/index.html#table?id=cal00001`);
  await page.locator("#cm-board").waitFor();
  await page.waitForTimeout(400);
  return {page, context, errors, send: (v) => socket.send(JSON.stringify({type: "view", view: v}))};
}
/* The callout layer and the question's panel, as they lie in the window now. */
const lie = (page) => page.evaluate(() => {
  const box = (el) => {if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? {top: r.top, bottom: r.bottom, left: r.left, right: r.right} : null;};
  const layer = document.getElementById("cm-board-callouts");
  const shown = !!layer && layer.children.length > 0 && getComputedStyle(layer).visibility !== "hidden" && !layer.classList.contains("is-hidden");
  return {shown, count: layer ? layer.children.length : 0, layer: box(layer), ask: box(document.querySelector("#cm-board-decision[data-choice-id]")), top: layer ? layer.style.top : ""};
});
const overlaps = (a, b) => !!a && !!b && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right;
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
try {
  for (const [width, height, mode] of [[1280, 720, "focus"], [1280, 720, "table"], [1280, 720, "full"], [390, 844, "focus"]]) {
    const where = `${mode} ${width}x${height}`;
    const view = askedView();
    const {page, context, errors, send} = await fixture(view, width, height, mode);
    /* In Full the question may sit in a drawer: open it where the board says it is asked. */
    if (!(await page.locator("#cm-board-decision[data-choice-id]").count())) {
      const open = page.locator('[data-action="board-decision-open"], [data-module-open="actions"], [data-action="board-also"]').first();
      if (await open.count()) {await open.click(); await page.waitForTimeout(200);}
    }
    ok(await page.locator("#cm-board-decision[data-choice-id]").count() === 1, `${where}: Discard 1 card is asked`);
    send(lifeMoved(view, 40001));
    await page.locator("#cm-board-callouts .cm-callout").first().waitFor({timeout: 5000});
    /* Read through the callouts as they come: each moment, the layer is never over the question. */
    /* Seen, not only there: the topmost thing at the callout's middle is the callout (the layer takes no pointer, so it is
       asked to for this one look). */
    const onTop = await page.evaluate(() => {
      const layer = document.getElementById("cm-board-callouts"), el = layer && layer.querySelector(".cm-callout");
      if (!el) return null;
      layer.style.pointerEvents = "auto";
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      layer.style.pointerEvents = "";
      return {top: !!hit && layer.contains(hit), hit: hit ? hit.className : null};
    });
    ok(onTop && onTop.top, `${where}: the callout is on top of the board, seen (${JSON.stringify(onTop)})`);
    let seen = 0, over = null, moved = false;
    for (let t = 0; t < 24; t++) {
      const now = await lie(page);
      if (now.shown && !seen && SHOTS) await page.screenshot({path: path.join(SHOTS, `callouts-${mode}-${width}x${height}.png`)});
      if (now.shown) seen += 1;
      if (now.top) moved = true;
      if (now.shown && overlaps(now.layer, now.ask)) {over = now; break;}
      await page.waitForTimeout(100);
    }
    ok(over === null, `${where}: the callouts never lie over the question${over ? ` (layer ${JSON.stringify(over.layer)}, question ${JSON.stringify(over.ask)})` : ""}`);
    ok(seen > 0 || moved, `${where}: and they are called out still, out of its way (${seen} moments shown)`);
    /* Answered, the question gone: the layer is back in its own place. */
    const answered = lifeMoved(view, 40002);
    answered.decision = null; answered.waitingOn = "s1";
    send(answered);
    await page.waitForFunction(() => !document.querySelector("#cm-board-decision[data-choice-id]"), null, {timeout: 5000});
    await page.waitForTimeout(300);
    const after = await lie(page);
    ok(after.top === "", `${where}: with no question, the layer is back in its own place (top "${after.top}")`);
    ok(errors.length === 0, `${where}: no page errors (${errors.join(" | ")})`);
    await context.close();
  }
} finally {await close();}
console.log(`board-callouts-place: ${checks} checks passed -- with a question on screen, the callouts lie below it, above it or out of sight, never over it, and are back in their own place once it is answered; in Full, Table, Focus and on the phone.`);
