/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   NO NATIVE TOOLTIP OVER A CARD ON THE MAT (ROB-202, Luke's playtest of 2026-10-28; BUG-06; crankmagic-board.js `card`).

   Luke: "the tooltip sits at the cursor, right over the type line and rules text, so you can't read what kind of creature a
   card is." A card on the battlefield carried a `title` ("Drag within this section to reorder; Shift + Alt + Left or Right
   works with a keyboard", or "Targeted by ..."). The browser draws a `title` at the pointer, on the card, and the page cannot
   move it. The card shows itself large in its own pop-up (the hover), away from the pointer's card, and what the title said
   is kept where it does not cover anything:

     1. No card button on the mat has a `title`, in Table, Focus or 3D.
     2. A card that can be reordered still says how, to a screen reader (`aria-description`), and a targeted card still says by
        what in its name.
     3. Hovering a card still pops the card up.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-card-no-native-tooltip.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-card-no-native-tooltip", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "notip001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

try {
  for (const mode of ["table", "focus", "full"]) {
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
    await page.waitForTimeout(900);

    const cards = await page.$$eval("#cm-board button.cm-bcard[data-card]", (bs) => bs.map((b) => ({title: b.getAttribute("title"), desc: b.getAttribute("aria-description"), arrange: b.dataset.arrangeCard === "true", label: b.getAttribute("aria-label")})));
    ok(cards.length > 3, `${mode}: the mat has cards to hover (${cards.length})`);
    ok(cards.every((c) => !c.title), `${mode}: no card button carries a native title (${cards.filter((c) => c.title).map((c) => c.title.slice(0, 40)).join(" | ") || "none"})`);
    const reorderable = cards.filter((c) => c.arrange);
    if (reorderable.length) ok(reorderable.every((c) => /reorder/.test(c.desc || "")), `${mode}: a card that can be reordered still says how, to a screen reader`);
    ok(cards.every((c) => c.label), `${mode}: every card keeps its name`);

    /* A card the pointer can actually reach: not under a drawer or another card. */
    const at = await page.evaluate(() => {
      for (const b of document.querySelectorAll("#cm-board button.cm-bcard[data-card]")) {
        const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (r.width > 20 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y)?.closest("button.cm-bcard[data-card]") === b) return {x, y};
      }
      return null;
    });
    ok(at, `${mode}: a card the pointer can reach`);
    await page.mouse.move(at.x - 3, at.y);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(900);
    ok(await page.locator("#cm-board-peek").count() === 1, `${mode}: hovering a card still pops it up`);
    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-card-no-native-tooltip: ${checks} checks passed -- no card on the mat carries a native tooltip, a reorderable card still says how to a screen reader, and the hover still pops the card up.`);
} finally {
  await close();
}
