/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   ROB'S FULLSCREEN NOTES ON THE BOARD (Oct 21, 2026; crankmagic-board.js, crankmagic-stage.css).

     1. Clicking or double-clicking a card stages its action in every view; confirmation plays it once.
     2. The r4 click map supersedes take-back double click: a just-played land returns through its offered Undo drawer;
        a single click immediately opens the read-only action menu; a native second click activates mana.
     3. In Full screen the pass, Resolve all and Skip to end stand large over the table, at its top, not in the strip.
     4. Each card another seat casts or plays is held up at the side for ten seconds, or until its ✕: never your own, never
        twice for one event, three at most, nothing from a view of a game seen for the first time.
     5. Settings: Hold priority after I cast and Skip my priority if no response possible, each a checkbox of its own size,
        the words bold as the Card size label is; turning Skip off tells the room (`prefer`, askStack).
     6. The tabletop's Cards and Zoom go to 200%; the commander tax sits below the card's title bar.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-fullscreen-notes.mjs
*/
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-fullscreen-notes", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "notes0001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const ISLAND = 524, PLAYED = 600;

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const binding = page => page.locator('#cm-board-decision [data-action=board-confirm]:visible:not([disabled]),#cm-board-decision [data-action=board-direct]:visible:not([disabled])');

async function board(mode, {width = 1440, height = 900} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [], sent = [];
  let sock = null;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.onMessage((m) => sent.push(JSON.parse(m))); ws.send(JSON.stringify({type: "view", view: sample}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator(`#cm-board .cm-bcard[data-card='${ISLAND}']`).first().waitFor({timeout: 20000});
  await page.waitForTimeout(300);
  const show = async (view) => {sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(350);};
  const acts = () => sent.filter((x) => x.type === "act").map((x) => x.indices);
  return {page, context, errors, sent, acts, show};
}
/* The view after Rob's Island is played: it is on his battlefield as #600, untapped, with a tap and its take-back offered. */
let rev = sample.revision;
function played() {
  const v = structuredClone(sample);
  v.revision = ++rev;
  const me = v.state.players[v.seat], island = me.zones.Hand.cards.find((c) => c.cardId === ISLAND);
  me.zones.Hand.cards = me.zones.Hand.cards.filter((c) => c !== island); me.zones.Hand.count -= 1;
  me.zones.Battlefield.cards.push({...island, cardId: PLAYED, controller: v.seat, owner: v.seat, tapped: false}); me.zones.Battlefield.count += 1;
  v.decision = {...v.decision, id: `priority:25:3:${rev}`, options: [{index: 0, label: "Pass priority", act: "pass"}, {index: 1, label: "Island", act: "activate-mana", cardId: PLAYED},
    {index: 2, label: "Return Island to your hand", act: "undo-land", cardId: PLAYED, detail: "your land drop back"}]};
  return v;
}

try {
  for (const mode of ["full", "focus"]) {
    const {page, context, errors, sent, acts, show} = await board(mode);
    const hand = mode === "full" ? `.cm-stage-fan .cm-bcard[data-card='${ISLAND}']` : `.cm-board-hand .cm-bcard[data-card='${ISLAND}']`;
    /* ---- 1. a double-click stages one action; only confirmation plays it ---- */
    await page.locator(hand).dblclick();
    await page.waitForTimeout(500);
    eq(acts(), [], `${mode}: a double-click stages the land without playing it`);
    await binding(page).click();
    await page.waitForTimeout(100);
    eq(acts(), [[1]], `${mode}: confirming plays the staged Island once`);
    /* ---- 2. r4: the authoritative legacy take-back is the card's Undo drawer. */
    await show(played());sent.length=0;
    const playedSelector=`#cm-board .cm-bcard[data-action=board-card]:is([data-card='${PLAYED}'],[data-land-members='${PLAYED}'],[data-land-members^='${PLAYED},'],[data-land-members$=',${PLAYED}'],[data-land-members*=',${PLAYED},'])`,playedCard=page.locator(playedSelector).first();await playedCard.scrollIntoViewIfNeeded();await playedCard.hover();
    const undo=page.locator(`[data-action=board-offered-undo][data-card='${PLAYED}']`).first();await undo.click();
    eq(acts(),[[2]],`${mode}: the actual offered Undo rewinds the land play once`);
    await show(played());sent.length=0;
    const after=await page.evaluate(id=>{const start=performance.now();document.querySelector(id).dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));return document.getElementById('cm-card-menu')?performance.now()-start:null;},playedSelector);
    ok(after!==null && after<280,`${mode}: single click opens the read-only menu without a 300ms wait (${after}ms)`);eq(acts(),[],`${mode}: reading the card menu sends nothing`);
    await page.locator(`#cm-card-menu [data-act=activate-mana][data-card='${PLAYED}']`).click();eq(acts(),[],`${mode}: selecting a mana row stages its binding action`);
    await binding(page).click();
    for(let i=0;i<125&&!acts().length;i++)await page.waitForTimeout(20);
    eq(acts(),[[1]],`${mode}: the binding press taps it for mana once`);
    if (mode === "full") {
      /* ---- 3. the actions, large, over the table ---- */
      const bar = await page.evaluate(() => {
        const el = document.querySelector(".cm-stage-actions"), region = document.querySelector(".cm-stage-region").getBoundingClientRect(), r = el.getBoundingClientRect();
        return {inRegion: !!el.closest(".cm-stage-region"), words: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()), tall: Math.min(...[...el.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height)),
          font: parseFloat(getComputedStyle(el.querySelector("button")).fontSize), center: Math.abs(r.left + r.width / 2 - (region.left + region.width / 2)), top: r.top - region.top,
          strip: document.querySelectorAll(".cm-stage-top [data-action=board-pass], .cm-stage-top .cm-full-pill [data-action=board-skip]").length};
      });
      ok(bar.inRegion && bar.words.includes("Next step") && bar.words.includes("Skip to end"), `full: Next step and Skip to end stand over the table (${bar.words.join(", ")})`);
      ok(bar.tall >= 48 && bar.tall <= 50 && bar.font === 17, `full: actions reduced about 12% while retaining readable targets (${Math.round(bar.tall)}px tall, ${bar.font}px words)`);
      ok(bar.center < 4 && bar.top < 40, `full: at the top of the table, centered (${Math.round(bar.center)}px off center, ${Math.round(bar.top)}px down)`);
      eq(bar.strip, 0, "full: and not in the strip as well");
    }
    {
      /* ---- 4. what the other seats play, held up ---- */
      const plays = structuredClone(played()); plays.revision = ++rev; plays.decision = null;
      plays.events = [{eventId: "event:9001", kind: "cast", player: 1, card: {cardId: 9001, name: "Lightning Bolt"}, stackId: 1},
        {eventId: "event:9002", kind: "land", player: 2, card: {cardId: 9002, name: "Mountain"}},
        {eventId: "event:9003", kind: "cast", player: 0, card: {cardId: 9003, name: "Rime Chill"}, stackId: 2},
        {eventId: "event:9004", kind: "cast", player: 3, card: {cardId: 9004, name: null}, stackId: 3}];
      await show(plays);
      if (mode === "focus") {
        // Hold previews while collecting screenshots; expiration is exercised below with the next event batch.
        for(const pop of await page.locator('.cm-play-pop').all())await pop.dispatchEvent('mouseenter');
        if (!await page.locator('.cm-stage-rail.is-open').count()) await page.locator('[data-action=board-stage-rail]').evaluate(el=>el.click());
        for (const width of [2240, 1280]) {
          await page.setViewportSize({width, height:900});
          await page.waitForTimeout(100);
          const gap = await page.evaluate(() => {
            const drawer={right:Math.max(...[...document.querySelectorAll('.cm-board-pane, .cm-stage-rail.is-open')].map(e=>e.getBoundingClientRect().right))},mat=document.querySelector('.cm-board-stage .cm-board-mat').getBoundingClientRect(),pop=document.querySelector('.cm-play-pop').getBoundingClientRect();
            return {drawer:drawer.right,mat:mat.left,left:pop.left,right:pop.right,width:pop.width};
          });
          ok(gap.right <= gap.mat-10,`focus ${width}: preview keeps the play area clear (${JSON.stringify(gap)})`);
          if(width===2240)ok(gap.left>=gap.drawer+10,'focus: a wide gap holds the previews without covering the open drawer');
          else ok(gap.mat-gap.drawer<gap.width&&gap.left<gap.drawer,'focus: only a gap narrower than the preview makes it overlap the drawer');
          if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`played-card-gap-${width}.png`)});}
        }
        let low=1280,high=2240,edge;
        for(let n=0;n<11;n++){
          const width=Math.round((low+high)/2);await page.setViewportSize({width,height:900});
          edge=await page.evaluate(()=>{dispatchEvent(new Event('resize'));const d={right:Math.max(...[...document.querySelectorAll('.cm-board-pane, .cm-stage-rail.is-open')].map(e=>e.getBoundingClientRect().right))},m=document.querySelector('.cm-board-stage .cm-board-mat').getBoundingClientRect(),p=document.querySelector('.cm-play-pop').getBoundingClientRect();return {space:m.left-d.right-p.width,left:p.left,drawer:d.right};});
          if(edge.space>=4&&edge.space<=12)break;
          if(edge.space<4)low=width+1;else high=width-1;
        }
        ok(edge.space>=0&&edge.space<24&&edge.left>=edge.drawer,'focus: a card that fits without the preferred margin still clears the drawer');
        await page.locator('[data-action=board-pane]').evaluate(el=>el.click());
        const collapsed=await page.evaluate(()=>{const p=document.querySelector('.cm-play-pop').getBoundingClientRect(),m=document.querySelector('.cm-board-stage .cm-board-mat').getBoundingClientRect();return p.left>=8&&p.right<m.left;});
        ok(collapsed,'focus: collapsing the drawer recomputes the preview position');
        await page.setViewportSize({width:1440,height:900});
      }
      const shown = () => page.evaluate(() => [...document.querySelectorAll("#cm-board-plays .cm-play-pop")].map((el) => el.getAttribute("aria-label")));
      const first = await shown();
      eq(first.sort(), ["AI 2 played Mountain", "Friend cast Lightning Bolt"], `full: the cards the others cast and played are held up, with who; never your own, never a face-down one (${JSON.stringify(first)})`);
      await show({...structuredClone(plays), revision: ++rev});
      eq((await shown()).length, 2, "full: a view that repeats its events shows them no second time");
      const more = {...structuredClone(plays), revision: ++rev, events: [5, 6, 7, 8].map((n) => ({eventId: `event:91${n}`, kind: "cast", player: 1, card: {cardId: 9100 + n, name: `Spell ${n}`}, stackId: n}))};
      await show(more);
      ok((await shown()).length === 3 && (await shown())[0] === "Friend cast Spell 8", `full: three at most, the newest first (${JSON.stringify(await shown())})`);
      await page.locator("#cm-board-plays .cm-play-pop").first().locator(".cm-play-close").click();
      eq((await shown()).length, 2, "full: its ✕ puts one away");
      const fit = await page.evaluate(() => [...document.querySelectorAll("#cm-board-plays .cm-play-pop")].every((el) => {const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight;}));
      ok(fit, "full: they fit in the window");
      /* The pointer on one holds it (it was left over the column by the ✕); off them, they go after their ten seconds. */
      await page.mouse.move(720, 450);
      await page.waitForTimeout(10800);
      eq((await shown()).length, 0, "full: and after ten seconds they are gone by themselves");
    }
    if (mode === "full") {
      /* ---- 6. the tabletop's sizes ---- */
      await page.locator("[data-action=board-camera]").click();
      const ranges = await page.evaluate(() => ["cards", "zoom"].map((k) => document.querySelector(`[data-stage-camera="${k}"]`)?.max));
      eq(ranges, ["200", "200"], "full: the tabletop's Cards and Zoom go to 200%");
      await page.locator("[data-stage-camera=cards]").fill("200");
      await page.locator("[data-stage-camera=zoom]").fill("200");
      await page.waitForTimeout(300);
      eq(errors, [], "full: at 200% no page error");
      await page.locator("[data-action=board-camera]").click();
    }
    /* ---- 5. Settings: the two choices ---- */
    await page.locator("[data-action=board-camera]").click();
    await page.locator(".cm-stage-camera [data-action=board-tools]").click();
    const boxes = await page.evaluate(() => [...document.querySelectorAll(".cm-board-hold")].map((l) => {
      const box = l.querySelector("input").getBoundingClientRect(), words = getComputedStyle(l.querySelector("span"));
      return {text: l.textContent.trim(), w: Math.round(box.width), h: Math.round(box.height), weight: Number(words.fontWeight), size: parseFloat(words.fontSize), checked: l.querySelector("input").checked};
    }));
    eq(boxes.map((b) => [b.text, b.checked]), [["Hold priority after I cast", false], ["Skip my priority if no response possible", true]], `${mode}: both choices, Skip on by default`);
    ok(boxes.every((b) => b.w <= 20 && b.h <= 20 && b.weight >= 700 && b.size >= 12), `${mode}: each a checkbox of its own size, the words bold (${JSON.stringify(boxes)})`);
    sent.length = 0;
    await page.locator("[data-board-skip-empty]").uncheck();
    await page.waitForTimeout(200);
    eq(sent.filter((x) => x.type === "prefer").map((x) => x.askStack), [true], `${mode}: turned off, the room is told: ask me whenever anything is on the stack`);
    ok(!errors.length, `${mode}: no page error (${errors.join(" | ")})`);
    await context.close();
  }
  /* ---- the commander tax below the title bar ---- */
  {
    const v = structuredClone(sample);
    const me = v.state.players[v.seat], cmd = me.zones.Command.cards[0] || null;
    if (cmd) cmd.commanderTax = 2;
    else me.zones.Command = {count: 1, cards: [{cardId: 777, name: "Quintorius, Loremaster", types: ["Creature"], power: 4, toughness: 5, commander: true, commanderTax: 2, owner: v.seat, controller: v.seat, counters: {}}]};
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript(() => {localStorage.setItem("cm-board-view", "focus"); localStorage.setItem("crankmagic-audio-muted", "true");});
    const page = await context.newPage();
    if (stub) await stub(page);
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => ws.send(JSON.stringify({type: "view", view: v})));
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator(".cm-bcard-tax").first().waitFor({timeout: 20000});
    const tax = await page.evaluate(() => {const t = document.querySelector(".cm-bcard-tax").getBoundingClientRect(), c = document.querySelector(".cm-bcard-tax").closest(".cm-bcard").getBoundingClientRect(); return (t.top - c.top) / c.height;});
    ok(tax >= 0.1, `the commander tax sits below the card's title bar, clear of its mana cost (${Math.round(tax * 100)}% down the card)`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`board-fullscreen-notes: ${checks} checks passed -- card actions reviewed and confirmed in every view, a land just played taken back by its offered Undo drawer, the actions large over the table in Full screen, the others' plays held up for ten seconds, the two priority choices, the tabletop to 200%, the commander tax below the title bar.`);
