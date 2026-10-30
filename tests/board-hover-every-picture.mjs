/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   ANY CARD PICTURE POPS UP LARGE ON HOVER (ROB-318; Rob, 2026-10-29, mid-game: "anywhere a card image is shown the on-hover to
   show a bigger image of the card is active"; crankmagic-board.js `peekPicture`).

   A card on the mat, in an option or in the hand already had its hover (by card number). A picture with no card number of its
   own did not: a seat's commander, the card on top of the stack, an opponent's play held up for ten seconds, the picture in a
   card's menu. They share one rule now: a card picture on the board shows itself at the pop-up's size from its own source.

     1. A seat's commander art (the seat card in the Boards list).
     2. The card on top of the stack.
     3. An opponent's play, held up for ten seconds.
     4. The picture in a card's menu.
     5. A card on the mat still has its own hover (unchanged).
     6. Nothing pops up over itself: the pop-up's own picture, and no hover left behind when the pointer leaves.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-hover-every-picture.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-hover-every-picture", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13], stacked = views[33];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "everypic1";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
let checks = 0, rev = 950000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

try {
  for (const mode of ["table", "focus", "full"]) {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
    const page = await context.newPage();
    if (stub) await stub(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let sock = null;
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.route(/^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, (r) => r.fulfill({contentType: "image/png", body: PIXEL}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.send(JSON.stringify({type: "view", view: sample}));});
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(700);
    const send = async (view) => {view.revision = ++rev; sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(600);};
    const hoverCenter = async (locator) => {
      const box = await locator.boundingBox();
      await page.mouse.move(2, 2);
      await page.mouse.move(box.x + box.width / 2 - 3, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(800);
    };
    const peeked = () => page.$$eval("#cm-board-peek img", (is) => is.map((i) => i.getAttribute("src")));
    const reach = (sel) => page.evaluate((s) => {
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (r.width > 8 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && el.contains(document.elementFromPoint(x, y))) return true;
      }
      return false;
    }, sel);

    /* ---- 1. a seat's commander ---- */
    await send(structuredClone(sample));
    const portrait = page.locator(".cm-seat-portrait img").first();
    ok(await portrait.count() > 0 && await reach(".cm-seat-portrait img"), `${mode}: a seat's commander art is drawn and the pointer can reach it`);
    await hoverCenter(portrait);
    ok((await peeked()).includes(await portrait.getAttribute("src")), `${mode}: hovering a seat's commander art shows it large`);
    await page.mouse.move(2, 2); await page.waitForTimeout(500);
    ok((await peeked()).length === 0, `${mode}: and it is gone when the pointer leaves`);

    /* ---- 2. the card on top of the stack ---- */
    await send(structuredClone(stacked));
    if (!(await page.locator("#cm-stack-drawer.is-open").count())) await page.locator("button.cm-stage-right[data-action=board-stage-side]").click();
    await page.waitForTimeout(700);
    const pile = page.locator(".cm-stack-pile").first(), top = page.locator(".cm-stack-pile .cm-stack-card:not(.is-back) img").first();
    ok(await top.count() > 0 && await reach(".cm-stack-pile"), `${mode}: a card on the stack is drawn and the pointer can reach it`);
    await hoverCenter(pile);
    ok((await peeked()).includes(await top.getAttribute("src")), `${mode}: hovering the stack's pile shows its front card large`);
    await page.mouse.move(2, 2); await page.waitForTimeout(500);
    ok((await peeked()).length === 0, `${mode}: and it goes when the pointer leaves`);

    /* ---- 3. an opponent's play, held up for ten seconds ---- */
    const play = structuredClone(sample);
    play.events = [{eventId: 777001, kind: "cast", player: 1, card: {name: "Sol Ring"}}];
    await send(play);
    const held = page.locator("#cm-board-plays .cm-play-card img").first();
    ok(await held.count() === 1, `${mode}: an opponent's cast is held up`);
    await hoverCenter(held);
    ok((await peeked()).includes(await held.getAttribute("src")), `${mode}: hovering the held-up play shows it larger`);
    await page.mouse.move(2, 2); await page.waitForTimeout(500);
    ok((await peeked()).length === 0, `${mode}: and the larger one goes when the pointer leaves`);

    /* ---- 4. the picture in a card's menu ---- */
    await send(structuredClone(sample));
    const target = await page.evaluate(() => {
      for (const b of document.querySelectorAll("#cm-board button.cm-bcard[data-card]")) {
        const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (r.width > 20 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y)?.closest("button.cm-bcard[data-card]") === b) return {x, y};
      }
      return null;
    });
    await page.mouse.move(target.x, target.y);
    await page.mouse.click(target.x, target.y, {button: "right"});
    const menuPic = page.locator("#cm-card-menu .cm-card-menu-card img").first();
    await menuPic.waitFor({timeout: 5000});
    await hoverCenter(menuPic);
    ok((await peeked()).includes(await menuPic.getAttribute("src")), `${mode}: hovering the picture in a card's menu shows it large`);
    await page.keyboard.press("Escape"); await page.mouse.move(2, 2); await page.waitForTimeout(400);

    /* ---- 5. a card on the mat keeps its own hover ---- */
    await send(structuredClone(sample));
    const mat = await page.evaluate(() => {
      for (const b of document.querySelectorAll("#cm-board button.cm-bcard[data-card]")) {
        const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (r.width > 20 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y)?.closest("button.cm-bcard[data-card]") === b) return {x, y};
      }
      return null;
    });
    ok(mat, `${mode}: a card on the mat can be reached`);
    await page.mouse.move(mat.x - 3, mat.y); await page.mouse.move(mat.x, mat.y); await page.waitForTimeout(800);
    ok((await peeked()).length === 1, `${mode}: a card on the mat still pops up (one picture)`);
    await page.mouse.move(2, 2); await page.waitForTimeout(500);

    /* ---- 6. nothing pops up over itself ---- */
    await page.mouse.move(mat.x, mat.y); await page.waitForTimeout(800);
    const own = page.locator("#cm-board-peek img").first();
    if (await own.count()) {
      const b = await own.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(800);
      ok((await page.locator("#cm-board-peek").count()) <= 1, `${mode}: the pop-up does not pop up over itself`);
    }
    /* ---- 7. every picture on a screen: attackers, blockers, targets, a search, a cost, the stack, a priority offer ---- */
    {
      const missed = [];
      let walked = 0;
      for (const [name, idx] of Object.entries({attackers: 8, blockers: 21, targets: 23, search: 15, cost: 6, stack: 33, priority: 13})) {
        const v = structuredClone(views[idx]);
        v.matchId = sample.matchId; v.decision = {...v.decision, id: `${v.decision.id}:${rev + 1}`};
        await send(v);
        if (idx === 33 && !(await page.locator("#cm-stack-drawer.is-open").count())) await page.locator("button.cm-stage-right[data-action=board-stage-side]").click();
        await page.waitForTimeout(500);
        const pics = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll("#cm-board img[src*='scryfall.'], #cm-board-plays img[src*='scryfall.']").forEach((img, n) => {
            if (img.closest(".cm-board-peek, #cm-stack-peek, #cm-card-inspector, .cm-full-pick, .cm-panel-card, .cm-zoom")) return;
            const r = img.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
            if (r.width < 12 || r.height < 12 || x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
            const top = document.elementFromPoint(x, y);
            if (!top) return;
            const reaches = img.contains(top) || img.closest("button,a,[data-peek-card],.cm-bcard")?.contains(top);
            if (!reaches) return;
            img.dataset.walk = String(n);
            out.push({n, x, y, where: [...(img.closest(".cm-bcard, button, li, section, div")?.classList ?? [])].slice(0, 3).join("."), src: img.getAttribute("src")});
          });
          return out;
        });
        for (const p of pics.slice(0, 14)) {
          await page.mouse.move(2, 2); await page.waitForTimeout(120);
          await page.mouse.move(p.x - 2, p.y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(700);
          walked += 1;
          if (!(await peeked()).length) missed.push(`${name}: ${p.where || "?"}`);
        }
        await page.mouse.move(2, 2); await page.waitForTimeout(300);
      }
      ok(walked >= 10, `${mode}: every picture on seven kinds of screen was walked (${walked})`);
      ok(missed.length === 0, `${mode}: every card picture pops up large on hover (missed: ${[...new Set(missed)].join(" | ") || "none"})`);
    }

    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-hover-every-picture: ${checks} checks passed -- a seat's commander art, the stack's top card, an opponent's held-up play and a card's menu picture show themselves large on hover, a card on the mat keeps its hover, and nothing pops up over itself.`);
} finally {
  await close();
}
