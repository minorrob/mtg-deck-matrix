/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE ACTIONS PANE HAS ONE SCROLL REGION PER DECISION (ROB-201, Luke's playtest of 2026-10-28; BUG-03; crankmagic-stage.css).

   Luke "couldn't find the scrollable sub-panels inside the Actions pane", and dragging the drawer taller revealed nothing new.
   Measured on every kind of question (since ROB-208 the pane holds a priority offer and the combat declarations; the rest are the pop-up's): the question sat inside THREE scrolling boxes, the drawer, the decision's own section and
   its list of options (a target list was 164px tall of 259, scrolling by itself), each capped by a rule of its own. Now the
   drawer is the one: the question and its options take the height they need and the drawer scrolls them, so a taller drawer
   shows more, and the row that answers (Confirm, Don't) stays in reach at the foot.

     1. In the pane no box inside the question scrolls, for a target list, a library search, a modal choice, a priority offer,
        a cost, declare attackers and a scry; now the priority offer and declare attackers.
     2. Nothing between the question and the drawer scrolls either: exactly one region scrolls, the drawer.
     3. A taller window shows more: at 1000px a question that was cut at 700px is whole, with nothing hidden.
     4. The answering row stays in view when the question is longer than the drawer.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-actions-one-scroll.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-actions-one-scroll", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "onescroll1";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
/* What the pane holds since ROB-208: a priority offer and the combat declarations. A question the player must resolve is the pop-up's
   (tests/board-mandatory-popup.mjs), which has one scroll region of its own. */
const SHAPES = {priority: 13, attackers: 8};
let checks = 0, rev = 810000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

async function open(mode, height) {
  const context = await browser.newContext({viewport: {width: 1440, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  let sock = null;
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.send(JSON.stringify({type: "view", view: sample}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator("#cm-board").waitFor({timeout: 20000});
  await page.waitForTimeout(700);
  const ask = async (idx) => {
    const v = structuredClone(views[idx]);
    v.matchId = sample.matchId; v.revision = ++rev; v.decision = {...v.decision, id: `${v.decision.id}:${rev}`};
    sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view: v}));
    await page.waitForTimeout(600);
  };
  return {page, context, ask};
}

/* What scrolls, around and inside the question. */
const regions = (page) => page.evaluate(() => {
  const root = document.querySelector("#cm-actions-drawer #cm-board-decision");
  if (!root) return null;
  const scrolls = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  const label = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + [...el.classList].slice(0, 2).join(".");
  const inside = [root, ...root.querySelectorAll("*")].filter(scrolls).map(label);
  const between = [];
  for (let el = root.parentElement; el && el.id !== "cm-actions-drawer"; el = el.parentElement) if (scrolls(el)) between.push(label(el));
  const drawer = document.querySelector("#cm-actions-drawer");
  return {inside, between, drawerScrolls: scrolls(drawer), hidden: drawer.scrollHeight - drawer.clientHeight};
});

try {
  for (const mode of ["focus", "full"]) {
    const short = await open(mode, 700);
    for (const [name, idx] of Object.entries(SHAPES)) {
      await short.ask(idx);
      const r = await regions(short.page);
      ok(r, `${mode}: ${name}: the question is in the Actions pane`);
      ok(r.inside.length === 0, `${mode}: ${name}: nothing inside the question scrolls by itself (${r.inside.join(", ") || "none"})`);
      ok(r.between.length === 0, `${mode}: ${name}: nothing between the question and the drawer scrolls (${r.between.join(", ") || "none"})`);
      ok(r.drawerScrolls, `${mode}: ${name}: the drawer is the one that scrolls`);
    }
    /* the foot stays in reach when the question is longer than the drawer */
    await short.ask(SHAPES.attackers);
    const foot = await short.page.evaluate(() => {
      const drawer = document.querySelector("#cm-actions-drawer"), btn = drawer.querySelector("#cm-board-decision [data-action=board-confirm], #cm-board-decision .cm-board-decision-foot button");
      if (!btn) return null;
      drawer.scrollTop = 0;
      const d = drawer.getBoundingClientRect(), b = btn.getBoundingClientRect();
      return {within: b.top >= d.top - 1 && b.bottom <= d.bottom + 1, long: drawer.scrollHeight > drawer.clientHeight};
    });
    ok(foot && foot.long, `${mode}: the combat declaration is longer than the drawer at 700px`);
    ok(foot.within, `${mode}: and its answering row is in view without scrolling`);
    await short.context.close();

    const tall = await open(mode, 1100);
    await tall.ask(SHAPES.attackers);
    const t = await tall.page.evaluate(() => {
      const drawer = document.querySelector("#cm-actions-drawer"), q = drawer.querySelector("#cm-board-decision");
      drawer.scrollTop = 0;
      const d = drawer.getBoundingClientRect(), r = q.getBoundingClientRect();
      return {top: Math.round(r.top - d.top), over: Math.round(r.bottom - d.bottom)};
    });
    ok(t.over <= 1, `${mode}: a taller window shows the whole combat declaration, foot and all (${t.over}px past the drawer's end)`);
    await tall.context.close();
  }
  console.log(`board-actions-one-scroll: ${checks} checks passed -- in the Actions pane the drawer is the one scroll region for every kind of question, a taller window shows more, and the answering row stays in view.`);
} finally {
  await close();
}
