/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE ACTIONS PANE HAS ONE SCROLL REGION PER DECISION (ROB-201, Luke's playtest of 2026-10-28; BUG-03; crankmagic-stage.css).

   Luke "couldn't find the scrollable sub-panels inside the Actions pane", and dragging the drawer taller revealed nothing new.
   ROB-319 moves required sequences into the popup, while optional offers remain in the drawer.
   Both surfaces keep one scrolling owner. The popup's choice list scrolls; its source and confirmation
   remain fixed. Every sample decision checks exclusive routing, no nested scrollers, and containment.
   Taller windows expose at least as much content and retain reachable confirmation.

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
const SHAPES = {targets: 23, search: 15, modal: 18, priority: 13, cost: 6, attackers: 8, scry: 31};
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

/* Optional offers scroll in the drawer; required questions scroll their choices in the popup. */
const regions = page => page.evaluate(() => {
  const root=document.querySelector('#cm-board-decision'),popup=root?.closest('.cm-required-popup');
  if(!root)return null;
  const scrolls=el=>/(auto|scroll)/.test(getComputedStyle(el).overflowY);
  const owner=popup?root.querySelector(':scope > .cm-board-options'):document.querySelector('#cm-actions-drawer');
  const inside=[root,...root.querySelectorAll('*')].filter(scrolls);
  const between=[];for(let el=root.parentElement;el&&el!==owner&&el!==popup;el=el.parentElement)if(scrolls(el))between.push(el);
  return {popup:!!popup,inside:inside.length,ownerScrolls:!!owner&&scrolls(owner),between:between.length,
    duplicate:!!popup&&!!document.querySelector('.cm-stage-module[data-module=actions]'),
    hidden:owner?Math.max(0,owner.scrollHeight-owner.clientHeight):0,height:owner?.clientHeight,
    over:root.scrollHeight-root.clientHeight};
});
try {
  for(const mode of ['focus','full']){
    const short=await open(mode,700);
    for(const [name,idx] of Object.entries(SHAPES)){
      await short.ask(idx);const r=await regions(short.page);
      ok(r,`${mode}: ${name}: question is present`);
      ok(r.popup===(name!=='priority'),`${mode}: ${name}: required popup versus optional drawer`);
      ok(!r.duplicate,`${mode}: ${name}: no simultaneous Actions module`);
      ok(r.inside===(r.popup?1:0),`${mode}: ${name}: exactly one scrolling owner, no nested scrollers (${JSON.stringify(r)})`);
      ok(r.between===0&&r.ownerScrolls,`${mode}: ${name}: no additional scrolling parent`);
      if(r.popup)ok(r.over<=2,`${mode}: ${name}: popup content fits its frame (${r.over}px)`);
    }
    await short.ask(SHAPES.targets);const small=await regions(short.page);
    const foot=await short.page.evaluate(()=>{
      const popup=document.querySelector('.cm-required-popup'),btn=popup.querySelector('[data-action=board-confirm],.cm-board-decision-foot button');
      if(!btn)return null;const d=popup.getBoundingClientRect(),b=btn.getBoundingClientRect();
      return {within:b.top>=d.top-1&&b.bottom<=d.bottom+1&&b.bottom<=innerHeight};
    });
    ok(foot?.within,`${mode}: confirmation stays visible without scrolling`);
    await short.context.close();
    const tall=await open(mode,1100);await tall.ask(SHAPES.targets);const large=await regions(tall.page);
    ok(large.height>=small.height&&large.hidden<=small.hidden,`${mode}: a taller window shows at least as much content`);
    ok(large.over<=2,`${mode}: taller popup keeps its controls within its frame`);
    await tall.context.close();
  }
  console.log(`board-actions-one-scroll: ${checks} checks passed -- one scrolling owner, exclusive routing and reachable confirmation in drawer or popup.`);
}finally{await close();}
