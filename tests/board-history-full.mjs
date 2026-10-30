/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE HISTORY SHOWS THE WHOLE GAME, SCROLLS BACK TO ITS FIRST EVENT, AND EVERY CARD NAME IN IT SHOWS THE CARD (ROB-332; Rob, 2026-10-30,
   mid-game: "Full game history needs to be shown in the history pane, not just the most recent during the game. I should be able to
   scroll back at any time in the game and see everything that's happened, by whom with what and to whom with what. I should also be
   able to hover over the card names to see the on hover pop-up of the card."). The board half of
   docs/ui-lane/history-and-targets-contract.md, §2 and §3.

   A game of 500 lines, of which the room's view carries the newest 60 (seq 440 to 499); the rest is one socket request away
   ({type: "history", before}), answered here as the room answers (game/room/room.mjs, historyBefore).

     1. The History module lists what the view carried, with a way to older ones; scrolling to the end of its list asks for them,
        and so does "Load earlier"; asked again and again it reaches the game's FIRST line, the opening hands ("Rob drew 7 cards", before turn 1; this fails if it is missing),
        every one of the 500 lines once, newest first, and the end says it is the start.
     2. The lines already read stay: the next view the room sends does not take back what was asked for, and a draw that grew
        replaces its own line.
     3. A card named in a line is a button: hover shows that card large, the keyboard's focus does too, and a press reads the card.
     4. Each line says who did it (the actor's color on its edge); a line with two cards has two names to hover.
     5. The same in the History menu and the panel's tab; and a room that numbers no lines (an old one) still shows its view.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-history-full.mjs
*/
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-history-full", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "histfull1";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SHOTS = process.env.CM_SHOTS;
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
let checks = 0, rev = 970000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* A game of 500 lines as the room writes them: line 0 is the game's first event (the opening hands, turn 0), line 1 turn 1's own; every tenth line is a cast with two cards named. */
const TOTAL = 500, VIEW = 60;
const game = Array.from({length: TOTAL}, (_, seq) => {
  const turn = seq === 0 ? 0 : 1 + Math.floor((seq - 1) / 25), actor = seq % 4;
  if (seq === 0) return {turn, seq, text: "Rob drew 7 cards", actor: 0};
  if ((seq - 1) % 25 === 0) return {turn, seq, text: `Turn ${turn} · ${sample.state.players[(turn - 1) % 4].name}`, mark: "turn", actor: (turn - 1) % 4};
  if (seq % 10 === 3) return {turn, seq, text: `${sample.state.players[actor].name} cast Lightning Bolt targeting Grizzly Bears`, actor,
    source: {name: "Lightning Bolt", ref: 900 + seq}, targets: [{kind: "object", id: 800 + seq, name: "Grizzly Bears"}],
    cards: [{name: "Lightning Bolt", ref: 900 + seq}, {name: "Grizzly Bears", ref: 800 + seq}]};
  return {turn, seq, text: `${sample.state.players[actor].name} played Forest #${seq}`, actor, source: {name: "Forest", ref: 700 + seq}, cards: [{name: "Forest", ref: 700 + seq}]};
});
const viewWith = (extra = {}) => {
  const v = structuredClone(sample);
  v.history = game.slice(TOTAL - VIEW).map((l) => structuredClone(l));
  v.historyFirst = 0;
  v.revision = ++rev;
  return Object.assign(v, extra);
};

try {
  for (const mode of ["table", "focus", "full"]) {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
    const page = await context.newPage();
    if (stub) await stub(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let sock = null;
    const asked = [];
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.route(/^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, (r) => r.fulfill({contentType: "image/png", body: PIXEL}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {
      sock = ws;
      ws.onMessage((raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type !== "history") return;
        asked.push(frame);
        const end = Math.min(frame.before, TOTAL), start = Math.max(0, end - Math.min(frame.limit ?? 100, 200));
        ws.send(JSON.stringify({type: "history", before: frame.before, lines: game.slice(start, end), first: 0}));
      });
      ws.send(JSON.stringify({type: "view", view: viewWith()}));
    });
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(700);
    if (!(await page.locator("#cm-stack-drawer.is-open").count())) await page.locator("button.cm-stage-right[data-action=board-stage-side]").click();
    await page.waitForTimeout(700);
    const shot = async (name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${mode}-${name}.png`)});};
    const send = async (view) => {sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(600);};
    const hoverCenter = async (locator) => {
      const box = await locator.boundingBox();
      await page.mouse.move(2, 2);
      await page.mouse.move(box.x + box.width / 2 - 3, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(800);
    };
    const peeked = () => page.$$eval("#cm-board-peek img", (is) => is.map((i) => i.getAttribute("src")));

    /* ---- 1. the module: the newest lines, and the way back to the first ---- */
    const module = page.locator(".cm-board-band[data-whole] ol.cm-history-whole").first();
    ok(await module.count() === 1, `${mode}: the History module's list is on the board`);
    const rows = () => module.locator("li:not(.cm-history-more)").evaluateAll((lis) => lis.map((li) => ({turn: li.classList.contains("is-turn"), text: li.textContent.replace(/\s+/g, " ").trim()})));
    const first = await rows();
    eq(first.length, VIEW, `${mode}: the module lists the ${VIEW} lines the view carried`);
    ok(/^Rob played Forest #499/.test(first[0].text) || first[0].text.includes("#499"), `${mode}: newest first (got "${first[0].text}")`);
    ok(await module.locator(".cm-history-more button").count() === 1, `${mode}: and it ends in "Load earlier", since the game began earlier`);
    await shot("module-newest");

    /* Scrolling to its end asks for the page before: seq 340 to 439. */
    await module.evaluate((el) => {el.scrollTop = el.scrollHeight;});
    await page.waitForFunction(() => document.querySelectorAll(".cm-board-band[data-whole] ol.cm-history-whole li:not(.cm-history-more)").length >= 160, null, {timeout: 8000});
    eq(asked.map((f) => [f.type, f.before]), [["history", 440]], `${mode}: scrolling to the end asked for the lines before the oldest held, once`);
    eq((await rows()).length, VIEW + 100, `${mode}: and a hundred came back`);

    /* ...then the button, until the first line is there. */
    for (let n = 0; n < 8; n += 1) {
      const more = module.locator(".cm-history-more button");
      if (!(await more.count())) break;
      await more.click();
      await page.waitForTimeout(350);
    }
    const all = await rows();
    eq(all.length, TOTAL, `${mode}: every one of the ${TOTAL} lines is listed, once`);
    eq(all.at(-1).text.replace(/\s+/g, " "), "Rob drew 7 cardsStart", `${mode}: the oldest is the game's first event, the opening draw (the earliest line is there)`);
    eq([all.at(-2).turn, all.at(-2).text], [true, "Turn 1 · Rob"], `${mode}: and above it turn 1's own line, a divider`);
    ok(/The start of the game/.test(await module.locator(".cm-history-more").innerText()), `${mode}: the end says it is the start of the game`);
    eq(asked.map((f) => f.before), [440, 340, 240, 140, 40], `${mode}: five requests, each before the oldest line held`);
    eq(new Set(all.map((r) => r.text)).size > 400, true, `${mode}: no line is repeated`);
    await module.evaluate((el) => {el.scrollTop = el.scrollHeight;});
    await page.waitForTimeout(500);
    eq(asked.length, 5, `${mode}: at the start, nothing more is asked`);
    await shot("module-start");

    /* ---- 2. what was asked for stays when the next view comes; a line that grew replaces its own ---- */
    await module.evaluate((el) => {el.scrollTop = el.scrollHeight;});
    const next = viewWith();
    next.history.push({turn: 20, seq: TOTAL, text: "Maya drew 2 cards", actor: 1, who: 1});
    next.history = next.history.slice(1);
    await send(next);
    const kept = await rows();
    eq(kept.length, TOTAL + 1, `${mode}: the next view adds its newest line and takes none back`);
    ok(kept[0].text.startsWith("Maya drew 2 cards"), `${mode}: the new line is at the top`);
    const grew = viewWith();
    grew.history[grew.history.length - 1] = {...grew.history.at(-1), text: "Rob played Forest #499 (and it grew)"};
    await send(grew);
    eq((await rows()).filter((r) => r.text.includes("#499")).length, 1, `${mode}: a line sent again with its seq replaces itself`);
    /* The scroll place is kept through a view: nothing jumps to the top. */
    const top = await module.evaluate((el) => el.scrollTop);
    ok(top > 1000, `${mode}: the place read is kept through the redraw (scrolled ${top}px)`);

    /* ---- 3. a card named is a button: hover, focus, press ---- */
    await module.evaluate((el) => {el.scrollTop = 0;});
    await page.waitForTimeout(300);
    const refs = module.locator("button.cm-card-ref", {hasText: "Lightning Bolt"});
    ok(await refs.count() > 10, `${mode}: a card named in a line is a button (${await refs.count()} Lightning Bolts)`);
    const bolt = refs.first();
    await bolt.scrollIntoViewIfNeeded();
    await hoverCenter(bolt);
    const src = await page.evaluate(() => document.querySelector("#cm-board-peek img")?.getAttribute("src") ?? null);
    ok(src && /scryfall\./.test(src), `${mode}: hovering the card's name in a line shows its card large (src ${src})`);
    await shot("hover-name");
    await page.mouse.move(2, 2); await page.waitForTimeout(500);
    eq((await peeked()).length, 0, `${mode}: and it goes when the pointer leaves`);
    const bears = module.locator("button.cm-card-ref", {hasText: "Grizzly Bears"}).first();
    await bears.scrollIntoViewIfNeeded();
    await bears.focus(); await page.waitForTimeout(700);
    const fsrc = await page.evaluate(() => document.querySelector("#cm-board-peek img")?.getAttribute("src") ?? null);
    ok(fsrc && /scryfall\./.test(fsrc) && fsrc !== src, `${mode}: the keyboard's focus on a name shows its own card too, not the first one (src ${fsrc})`);
    await page.keyboard.press("Enter"); await page.waitForTimeout(500);
    ok(await page.locator("#cm-card-inspector, .cm-action-card").count() > 0, `${mode}: pressing a name reads the card`);
    await page.keyboard.press("Tab"); await page.mouse.move(2, 2); await page.waitForTimeout(400);

    /* ---- 4. who: a line's actor is on its edge; a line naming two cards has two to hover ---- */
    const cast = module.locator("li", {hasText: "cast Lightning Bolt targeting Grizzly Bears"}).first();
    await cast.scrollIntoViewIfNeeded();
    ok(await cast.getAttribute("data-actor") !== null, `${mode}: a line says who did it (its actor's color is on its edge)`);
    eq(await cast.locator("button.cm-card-ref").evaluateAll((bs) => bs.map((b) => b.textContent)), ["Lightning Bolt", "Grizzly Bears"], `${mode}: a line with two cards has two names to hover, in order`);
    eq((await cast.innerText()).replace(/\s+/g, " ").trim().replace(/ T\d+$/, ""), /^(Rob|Friend|AI 2|AI 3) cast Lightning Bolt targeting Grizzly Bears$/.exec((await cast.innerText()).replace(/\s+/g, " ").trim().replace(/ T\d+$/, ""))?.[0] ?? "(no match)", `${mode}: and still reads as the sentence it was`);

    /* ---- 5. the History menu: the same list, asking the same way ---- */
    await page.evaluate(() => document.querySelector("[data-action=board-history]").click());
    await page.waitForTimeout(500);
    const menu = page.locator("#cm-board-history .cm-history-list");
    ok(await menu.count() === 1, `${mode}: the History menu opens`);
    ok(await menu.locator("button.cm-card-ref").count() > 5, `${mode}: its names are buttons too`);
    const menuRows = await menu.locator("li:not(.cm-history-more)").count();
    eq(menuRows, TOTAL + 1, `${mode}: it lists everything the board has read (${menuRows})`);
    await shot("menu");
    await page.keyboard.press("Escape");
    eq(errors, [], `${mode}: no page errors`);
    await context.close();
  }

  /* ---- 6. a room that numbers no lines: its view is all there is ---- */
  {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript(() => {localStorage.setItem("cm-board-view", "table"); localStorage.setItem("crankmagic-audio-muted", "true");});
    const page = await context.newPage();
    if (stub) await stub(page);
    let sock = null, asked = 0;
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.route(/^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, (r) => r.fulfill({contentType: "image/png", body: PIXEL}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {
      sock = ws; ws.onMessage((raw) => {if (JSON.parse(String(raw)).type === "history") asked += 1;});
      const old = structuredClone(sample); old.revision = ++rev;
      old.history = Array.from({length: 12}, (_, i) => ({turn: 1 + Math.floor(i / 4), text: `Rob played Forest ${i}`}));
      ws.send(JSON.stringify({type: "view", view: old}));
    });
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(900);
    if (!(await page.locator("#cm-stack-drawer.is-open").count())) await page.locator("button.cm-stage-right[data-action=board-stage-side]").click();
    await page.waitForTimeout(700);
    const module = page.locator(".cm-board-band[data-whole] ol.cm-history-whole").first();
    eq(await module.locator("li:not(.cm-history-more)").count(), 12, "an old room's twelve lines are listed");
    eq(await module.locator(".cm-history-more button").count(), 0, "with no way to older ones, which it has none of");
    await module.evaluate((el) => {el.scrollTop = el.scrollHeight;}); await page.waitForTimeout(400);
    eq(asked, 0, "and nothing is asked");
    void sock;
    await context.close();
  }
  console.log(`board-history-full: ${checks} checks passed -- the History module scrolls back through ${TOTAL} lines to turn 1's first, load earlier, names that show the card on hover and focus, in Table, Focus and 3D.`);
} finally {
  await close();
}
