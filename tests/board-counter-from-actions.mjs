/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   A COUNTERSPELL IS OFFERED AND WORKS FROM THE ACTIONS PANE AS FROM THE CARD (ROB-203, Luke's playtest of 2026-10-28; BUG-07).

   Luke said the game "wouldn't let me" counter a spell; it worked through the shortcut under the card and then the blue
   Counter button. The issue asked for the test to be run once the pane was rebuilt (ROB-201, ROB-208), since one run on the old
   pane might not hold. The engine's side is proved by game/engine/cards/c/counterspell.scenarios.json (Counterspell is offered
   at priority with the spell on the stack as its target, and not when nothing is on it). This is the board's: with a spell on
   the stack and a Counterspell offered,

     1. the Actions pane lists "Cast Counterspell" and the card in the hand says so;
     2. pressing it in the pane stages it in the pop-up (ROB-319: starting an action gives the pop-up the sequence; Counterspell,
        Confirm, Cancel, nothing sent), and Confirm sends the offer's index (never anything else);
     3. pressing the card in the hand and then Confirm sends the same answer;
     4. the pane does not offer it when the engine does not (nothing on the stack);

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-counter-from-actions.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-counter-from-actions", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "ctr0001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
let checks = 0, rev = 990000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

/* A priority offer with a spell on the stack, and Counterspell in the hand, as the room sends it. */
function offer({withStack = true, withCounter = true} = {}) {
  const v = structuredClone(sample);
  const card = v.state.players[v.seat].zones.Hand.cards.find((c) => c.name) ?? v.state.players[v.seat].zones.Hand.cards[0];
  Object.assign(card, {name: "Counterspell", types: ["Instant"]});
  v.state.stack = withStack ? [{stackId: 90, cardId: 999, name: "Grizzly Bears", kind: "spell", playerId: 1, faceDown: false, stage: "waiting", targets: []}] : [];
  v.state.stackSize = v.state.stack.length;
  v.revision = ++rev;
  v.decision = {id: `priority:90:${rev}`, title: "Your priority", mode: "one", min: 1, max: 1, kind: "priority", options: [
    {index: 0, label: "Pass priority", act: "pass"},
    ...(withCounter ? [{index: 1, label: "Counterspell", act: "cast", cardId: card.cardId, detail: "counter target spell"}] : [])]};
  return {v, cardId: card.cardId};
}

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
    const show = async (view) => {sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(700);};
    const acts = () => sent.filter((x) => x.type === "act");

    /* 1 and 2: from the Actions pane */
    const first = offer();
    await show(first.v);
    const listed = "#cm-actions-drawer [data-action=board-option], #cm-actions-drawer [data-action=board-choose]";
    ok(await page.locator(listed, {hasText: "Cast Counterspell"}).count() === 1, `${mode}: the Actions pane lists Cast Counterspell`);
    ok((await page.$$eval("#cm-board button.cm-bcard", (bs) => bs.map((b) => b.getAttribute("aria-label")))).some((l) => /Counterspell: Cast Counterspell/.test(l)), `${mode}: and the card in the hand says it can be cast`);
    await page.locator(listed, {hasText: "Cast Counterspell"}).click();
    const confirm = page.locator(".cm-required-popup [data-action=board-flow-confirm]").first();
    await confirm.waitFor({timeout: 5000});
    const staged = await page.evaluate(() => ({title: document.querySelector(".cm-required-popup h2")?.textContent || "", cancel: !!document.querySelector(".cm-required-popup [data-action=board-flow-cancel]"),
      pane: document.querySelectorAll(".cm-stage-module[data-module=actions]").length}));
    ok(acts().length === 0 && staged.title.includes("Counterspell") && staged.cancel && staged.pane === 0, `${mode}: pressing it only stages it in the pop-up (Counterspell, Confirm and Cancel; the pane steps aside; nothing sent) ${JSON.stringify(staged)}`);
    await confirm.click();
    await page.waitForTimeout(400);
    ok(acts().length === 1 && JSON.stringify(acts()[0].indices) === "[1]", `${mode}: its Cast button sends the offer's index (${JSON.stringify(acts().map((a) => a.indices))})`);
    ok(acts()[0].choiceId === first.v.decision.id, `${mode}: for that question`);

    /* 3: from the card in the hand */
    const second = offer();
    await show(second.v);
    await page.locator(`#cm-board button.cm-bcard[data-card="${second.cardId}"]`).first().click();
    const confirm2 = page.locator(".cm-required-popup [data-action=board-flow-confirm]").first();
    await confirm2.waitFor({timeout: 5000});
    await confirm2.click();
    await page.waitForTimeout(400);
    ok(acts().length === 2 && JSON.stringify(acts()[1].indices) === "[1]", `${mode}: pressing the card in the hand and then Cast sends the same answer (${JSON.stringify(acts().map((a) => a.indices))})`);

    /* 4: not offered when the engine does not offer it */
    await show(offer({withStack: false, withCounter: false}).v);
    ok(await page.locator(`${listed}, .cm-required-popup [data-action=board-flow-confirm]`, {hasText: /Counterspell|Confirm/}).count() === 0, `${mode}: with nothing on the stack and no offer, the pane does not invent one`);

    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-counter-from-actions: ${checks} checks passed -- a Counterspell the engine offers is listed in the Actions pane and on the card, and confirming from either sends the same answer; nothing is offered that the engine did not.`);
} finally {
  await close();
}
