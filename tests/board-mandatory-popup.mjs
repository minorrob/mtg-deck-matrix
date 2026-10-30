/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   WHAT THE PLAYER MUST RESOLVE POPS UP FRONT AND CENTER; WHAT IS OPTIONAL STAYS IN THE ACTIONS PANE
   (ROB-208, Luke's playtest of 2026-10-28; UX-01; crankmagic-board.js `mandatory`).

   Rob and Luke agreed the rule. Luke preferred the pop-up he saw when the pane was shut: more obvious, "you have to resolve
   this". Until now a question went to the pop-up only when the pane was closed; with the pane open it was one more thing in it.

     1. A target, a search, a modal choice, a cost, a scry: in the pop-up (#cm-decision-slot), never in the Actions pane, with
        the pane open; the pane says something is waiting, once, and does not repeat the question.
     2. A priority offer, and the combat declarations (declare attackers and blockers, which have their own strip), stay in the
        pane and are not in the pop-up.
     3. The pop-up is where a person looks: inside the window, centered across it, not under a drawer.
     4. It can be answered there: a pick is taken, and Confirm sends the answer.
     5. With the pane shut the question is in the pop-up as before.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-mandatory-popup.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-mandatory-popup", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "popup0001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const MUST = {targets: 23, search: 15, modal: 18, cost: 6, scry: 31};
const STAYS = {priority: 13, attackers: 8};
let checks = 0, rev = 970000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

try {
  for (const mode of ["focus", "full", "table"]) {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
    const page = await context.newPage();
    if (stub) await stub(page);
    const sent = [], errors = [];
    let sock = null;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.onMessage((m) => sent.push(JSON.parse(m))); ws.send(JSON.stringify({type: "view", view: sample}));});
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(700);
    const ask = async (idx) => {
      const v = structuredClone(views[idx]);
      v.matchId = sample.matchId; v.revision = ++rev; v.decision = {...v.decision, id: `${v.decision.id}:${rev}`};
      sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view: v}));
      await page.waitForTimeout(600);
    };
    const where = () => page.evaluate(() => ({
      pane: !!document.querySelector("#cm-actions-drawer #cm-board-decision"),
      popup: !!document.querySelector("#cm-decision-slot #cm-board-decision"),
      paneOpen: !!document.querySelector("#cm-actions-drawer.is-open"),
      pending: document.querySelector("#cm-actions-drawer .cm-board-pending")?.textContent?.trim() || "",
    }));

    for (const [name, idx] of Object.entries(MUST)) {
      await ask(idx);
      const w = await where();
      ok(w.paneOpen, `${mode}: ${name}: the Actions pane is open`);
      ok(w.popup && !w.pane, `${mode}: ${name}: the question is in the pop-up, not in the pane (pop-up ${w.popup}, pane ${w.pane})`);
      ok(w.pending.length > 0 && w.pending.length < 60, `${mode}: ${name}: the pane says it is waiting, briefly ("${w.pending}")`);
    }
    for (const [name, idx] of Object.entries(STAYS)) {
      await ask(idx);
      const w = await where();
      ok(w.pane && !w.popup, `${mode}: ${name}: stays in the pane (pane ${w.pane}, pop-up ${w.popup})`);
    }

    /* where it is, and that it can be answered */
    await ask(MUST.search);
    const box = await page.evaluate(() => {
      const r = document.querySelector("#cm-decision-slot #cm-board-decision").getBoundingClientRect();
      const left = document.querySelector("#cm-actions-drawer").getBoundingClientRect().right;
      return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, drawerRight: left, w: innerWidth, h: innerHeight};
    });
    ok(box.left >= 0 && box.right <= box.w && box.top >= 0 && box.bottom <= box.h, `${mode}: the pop-up is inside the window`);
    ok(Math.abs(box.cx - box.w / 2) <= 120, `${mode}: and centered across it (${Math.round(box.cx)} of ${box.w / 2})`);
    ok(box.left >= box.drawerRight - 1, `${mode}: and not under the open Actions drawer`);
    await page.locator("#cm-decision-slot [data-action=board-option], #cm-decision-slot [data-action=board-option-same]").first().click();
    const before = sent.filter((x) => x.type === "act").length;
    await page.locator("#cm-decision-slot [data-action=board-confirm]").first().click();
    await page.waitForTimeout(400);
    ok(sent.filter((x) => x.type === "act").length === before + 1, `${mode}: a pick is taken in the pop-up and Confirm sends the answer`);

    /* in a short window the pop-up scrolls inside itself and its answering row stays in view */
    await page.setViewportSize({width: 1440, height: 520});
    await page.waitForTimeout(500);
    await ask(MUST.targets);
    const foot = await page.evaluate(() => {
      const q = document.querySelector("#cm-decision-slot #cm-board-decision"), f = q.querySelector("[data-action=board-confirm]");
      q.scrollTop = 0;
      const r = f.getBoundingClientRect(), b = q.getBoundingClientRect();
      return {long: q.scrollHeight > q.clientHeight, inView: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 && r.bottom <= innerHeight};
    });
    ok(foot.long, `${mode}: at 520px tall the question is longer than the pop-up`);
    ok(foot.inView, `${mode}: and its Confirm is in view without scrolling`);
    await page.setViewportSize({width: 1440, height: 900});
    await page.waitForTimeout(400);

    /* the pane shut: the same, as before */
    await ask(MUST.targets);
    await page.locator("#cm-actions-drawer [data-action=board-panel], button.cm-stage-left[data-action=board-stage-rail]").first().click({timeout: 3000}).catch(() => {});
    await page.waitForTimeout(400);
    ok((await where()).popup, `${mode}: with the pane shut the question is in the pop-up too`);
    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-mandatory-popup: ${checks} checks passed -- what must be resolved pops up front and center, with the pane open or shut; a priority offer and the combat declarations stay in the Actions pane.`);
} finally {
  await close();
}
