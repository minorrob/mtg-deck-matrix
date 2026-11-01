/* THE BIG CARD BESIDE THE QUESTION, NEVER OVER IT (ROB-385; Rob, 2026-11-01: "The hover preview should be on the same plane as the
   pop-up, so it should get pushed to whichever side of the pop-up (of the 4 sides) has the available width between browser edge
   and pop-up edge; favoring the left, then right, then bottom; we won't use the top. If all 3 of those sides are not wide enough,
   use the largest width side (or height in the bottom side distance) and resize the image to fit with minimal padding, but retain
   the card's aspect ratio."). The pop-up review's solo run found the hover's big card drawn in the middle of the screen, over
   ROB-319's required pop-up and its answers (Keep/Mulligan, targets, mana to tap).

   On the sample table, Everflowing Chalice asks what to tap for it in the required pop-up; an option's card is hovered:
     1. 1400x900: the left of the pop-up has the room; the card goes there at its size.
     2. 1400x900 with the pop-up drawn to the left of the middle: the right has the room, the left not; it goes right.
     3. 900x1700: neither side has the room, below has; it goes below.
     4. 1000x700 and 900x1400: no side holds it whole; it goes to the side where it can be largest (left, then below), made
        smaller to fit, its shape kept.
   Each time: the card and the pop-up do not overlap, the card is inside the window, and never above the pop-up.
   GEOMETRY_REQUIRED=1 refuses a missing browser; SHOTS=<dir> saves each case.
     node tests/board-peek-beside-popup.mjs */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
const {browser, base, stub, close} = await openBrowser({name: "board-peek-beside-popup", flag: "GEOMETRY_REQUIRED"});
const SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table = {tableId: "peekbeside1", phase: "playing", matchId: sample.matchId, away: [], blockers: [], rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", mat: "felt", you: p.playerId === sample.seat}))};
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks++;};
const view = structuredClone(sample);
view.decision = {sourceId: 461, id: "choose-cost:461", kind: "choice", title: "Everflowing Chalice: what to tap for it", mode: "one", min: 1, max: 1, options: [
  {index: 0, label: "Access Tunnel", cardId: 459}, {index: 1, label: "Island", cardId: 469}, {index: 2, label: "Command Tower", cardId: 502}]};
for (const id of [459, 469, 502]) view.state.players[view.seat].zones.Battlefield.cards.find((c) => c.cardId === id).tapped = false;
/* [width, height, the side expected, whether at full size, the pop-up drawn off the middle] */
const CASES = [[1400, 900, "left", true, false], [1400, 900, "right", true, true], [900, 1700, "below", true, false], [1000, 700, "left", false, false], [900, 1400, "below", false, false]];
try {
  for (const [width, height, side, whole, shifted] of CASES) {
    const where = `${width}x${height}${shifted ? ", pop-up left of the middle" : ""}`;
    const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript(() => {localStorage.setItem("cm-board-view", "focus"); localStorage.setItem("crankmagic-audio-muted", "true");});
    const page = await context.newPage(); if (stub) await stub(page);
    const errors = []; page.on("pageerror", (x) => errors.push(x.message));
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "peek@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.routeWebSocket(/\/api\/tables\/peekbeside1\/connect$/, (ws) => {ws.send(JSON.stringify({type: "view", view}));});
    await page.goto(`${base}/index.html#table?id=peekbeside1`);
    const desk = page.locator('.cm-required-popup #cm-board-decision[data-choice-id="choose-cost:461"]');
    await desk.waitFor({timeout: 10000});
    /* The pop-up is centered; drawn to the left of the middle, the right is the side with the room. */
    if (shifted) await page.evaluate(() => document.querySelector(".cm-required-popup").style.setProperty("left", "calc(50% - 300px)", "important"));
    await desk.locator('[data-action="board-flow-choice"][data-indices~="0"]').hover();
    await page.locator("#cm-board-peek .cm-bcard").waitFor({state: "attached", timeout: 3000});
    await page.waitForTimeout(50);
    const at = await page.evaluate(() => {
      const box = (el) => {const r = el.getBoundingClientRect(); return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height};};
      const peek = document.getElementById("cm-board-peek"), card = peek.querySelector(".cm-bcard");
      /* The card's own size: what the stylesheet gives it with nothing set on it. */
      const set = card.style.getPropertyValue("--bc"); card.style.removeProperty("--bc");
      const natural = card.getBoundingClientRect().width; if (set) card.style.setProperty("--bc", set);
      return {side: peek.dataset.side || "", card: box(card), natural, popup: box(document.querySelector(".cm-required-popup")), set,
        name: (peek.querySelector(".cm-bcard-name")?.textContent || "").trim()};
    });
    if (SHOTS) await page.screenshot({path: path.join(SHOTS, `peek-${side}-${width}x${height}.png`)});
    const {card: c, popup: p} = at;
    ok(at.name === "Access Tunnel", `${where}: the option's card is shown (${at.name})`);
    ok(at.side === side, `${where}: it goes ${side} of the pop-up (went "${at.side}")`);
    ok(c.right <= p.left || c.left >= p.right || c.bottom <= p.top || c.top >= p.bottom, `${where}: the card and the pop-up do not overlap (card ${JSON.stringify(c)}, pop-up ${JSON.stringify(p)})`);
    ok(c.bottom > p.top, `${where}: never above the pop-up (card's foot ${Math.round(c.bottom)}, pop-up's top ${Math.round(p.top)})`);
    ok(c.left >= 0 && c.top >= 0 && c.right <= width && c.bottom <= height, `${where}: the card is inside the window (${JSON.stringify(c)})`);
    ok(Math.abs(c.width / c.height - 5 / 7) < .01, `${where}: the card keeps its shape (${(c.width / c.height).toFixed(3)}, a card is ${(5 / 7).toFixed(3)})`);
    if (whole) ok(at.set === "" && Math.abs(c.width - at.natural) < 1, `${where}: at its own size (${Math.round(c.width)}px wide, its own ${Math.round(at.natural)}px)`);
    else {
      ok(at.set !== "" && c.width < at.natural - 1, `${where}: made smaller to fit (${Math.round(c.width)}px wide of its own ${Math.round(at.natural)}px, --bc ${at.set})`);
      /* ...as large as the room, with only the gap and the edge's few pixels to spare */
      const room = side === "left" ? p.left : side === "right" ? width - p.right : height - p.bottom;
      ok(room - (side === "below" ? c.height : c.width) <= 24, `${where}: and no smaller than the room needs (${Math.round(room)}px of room, ${Math.round(side === "below" ? c.height : c.width)}px used)`);
    }
    ok(errors.length === 0, `${where}: no page errors (${errors.join(" | ")})`);
    await context.close();
  }
  console.log(`board-peek-beside-popup: ${checks} checks passed -- with a required pop-up up, the hover's big card goes beside it (left, then right, then below, never above), made smaller to fit with its shape kept when no side holds it whole, never over the question.`);
} finally {await close();}
