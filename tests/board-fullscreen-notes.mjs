/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   ROB'S FULLSCREEN NOTES ON THE BOARD (Oct 21, 2026; crankmagic-board.js, crankmagic-stage.css).

     1. Clicking or double-clicking a card stages its action in every view; confirmation plays it once.
     2. The r4 click map supersedes take-back double click: a just-played land returns through its offered Undo drawer;
        a single click immediately opens the read-only action menu; a native second click activates mana.
     3. In every view (3D, Focus and Table are one HUD) the pass, Resolve all and Skip to end stand large over the table, at its top, not in the strip.
     4. Each card another seat casts or plays is held up at the side for ten seconds, or until its ✕: never your own, never
        twice for one event, three at most, nothing from a view of a game seen for the first time.
     5. Settings: Hold priority after I cast and Skip my priority if no response possible, each a checkbox of its own size,
        the words bold as the Card size label is; turning Skip off tells the room (`prefer`, askStack).
     6. Camera's Cards and Zoom go to 200% in every view; the commander tax sits below the card's title bar.

   Table and Focus are the 3D view's HUD on a flat stage (Rob, 2026-10-28): every note is proved in all three views. In 3D the drawers lie over
   the table, so the card steps shut the left drawer first.

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
  for (const mode of ["full", "focus", "table"]) {
    const {page, context, errors, sent, acts, show} = await board(mode);
    /* The hand is one tray (.cm-stage-fan) in every view now; the old Table/Focus hand row (.cm-board-hand) is gone. */
    const hand = `.cm-stage-fan .cm-bcard[data-card='${ISLAND}']`;
    /* The drawers are the top layer (Rob, 2026-10-28) and move nothing. Table and Focus keep their boards clear of them, but the 3D view's
       mat runs under them: its leftmost land stack lies under the open left drawer at 1440 wide (a pointer finds the drawer there), so in 3D a
       player shuts the drawer to reach it, as this suite does for the card steps below, and opens it again after. */
    const drawer = async (name, open) => {await page.evaluate(([n, o]) => {const t = document.querySelector(`[data-action="${n}"]`); if (t && (t.getAttribute("aria-expanded") === "true") !== o) t.click();}, [name, open]); await page.waitForTimeout(900);};
    /* A new decision opens the Actions drawer again (its tab shows has-decision), so it is shut again after each new view in 3D. */
    const clear = () => mode === "full" ? drawer("board-stage-rail", false) : null;
    await clear();
    /* ---- 1. a double-click stages one action; only confirmation plays it ---- */
    await page.locator(hand).dblclick();
    await page.waitForTimeout(500);
    eq(acts(), [], `${mode}: a double-click stages the land without playing it`);
    await binding(page).click();
    await page.waitForTimeout(100);
    eq(acts(), [[1]], `${mode}: confirming plays the staged Island once`);
    /* ---- 2. r4: the authoritative legacy take-back is the card's Undo drawer. */
    await show(played());sent.length=0;
    const playedSelector=`#cm-board .cm-bcard[data-action=board-card]:is([data-card='${PLAYED}'],[data-land-members='${PLAYED}'],[data-land-members^='${PLAYED},'],[data-land-members$=',${PLAYED}'],[data-land-members*=',${PLAYED},'])`,playedCard=page.locator(playedSelector).first();await clear();await playedCard.scrollIntoViewIfNeeded();
    /* The real pointer, moved onto the card's center: Playwright's hover() refuses a card whose own Undo drawer (64x24px, shown by this very hover) lies over it, as it does over Table's cards at 1440x900 (16px wide); the pointer stays where it is and the drawer is then pressed. */
    {const bb=await playedCard.boundingBox();await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.waitForTimeout(150);}
    const undo=page.locator(`[data-action=board-offered-undo][data-card='${PLAYED}']`).first();await undo.click();
    eq(acts(),[[2]],`${mode}: the actual offered Undo rewinds the land play once`);
    await show(played());sent.length=0;await clear();
    const after=await page.evaluate(id=>{const start=performance.now();document.querySelector(id).dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));return document.getElementById('cm-card-menu')?performance.now()-start:null;},playedSelector);
    ok(after!==null && after<280,`${mode}: single click opens the read-only menu without a 300ms wait (${after}ms)`);eq(acts(),[],`${mode}: reading the card menu sends nothing`);
    await page.locator(`#cm-card-menu [data-act=activate-mana][data-card='${PLAYED}']`).click();
    /* Rob, 2026-10-27, standing rule: the card, then its row, are two clicks already; a third step to confirm is not asked. */
    for(let i=0;i<125&&!acts().length;i++)await page.waitForTimeout(20);
    eq(acts(),[[1]],`${mode}: a mana row taps it for mana at once, with no second press in Actions`);
    /* the pointer's press leaves the focus on the card; a pop-up held beside the focused card is put away by design (focusin), so the next step starts with the focus off it */
    await page.evaluate(()=>document.activeElement?.blur());
    if (mode === "full") await drawer("board-stage-rail", true);
    {
      /* ---- 3. the actions, large, over the table (the same pop-up in every view) ---- */
      const bar = await page.evaluate(() => {
        const el = document.querySelector(".cm-stage-actions"), region = document.querySelector(".cm-stage-region").getBoundingClientRect(), r = el.getBoundingClientRect();
        /* The pop-up stands in the middle of what the open drawers leave seen (the left drawer's edge to the right drawer's), clear of the turn box. */
        const rail = document.querySelector(".cm-stage-rail.is-open"), side = document.querySelector(".cm-stage-side.is-open"), cap = document.querySelector(".cm-stage-caption")?.getBoundingClientRect();
        const seenL = rail ? rail.getBoundingClientRect().right : region.left, seenR = side ? side.getBoundingClientRect().left : region.right;
        return {inRegion: !!el.closest(".cm-stage-region"), words: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()), tall: Math.min(...[...el.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height)),
          font: parseFloat(getComputedStyle(el.querySelector("button")).fontSize), center: Math.abs(r.left + r.width / 2 - (seenL + seenR) / 2), top: r.top - region.top, underDrawer: r.left < seenL - 1 || r.right > seenR + 1, overBox: !!cap && r.left < cap.right && r.right > cap.left && r.top < cap.bottom && r.bottom > cap.top,
          strip: document.querySelectorAll(".cm-stage-top [data-action=board-pass], .cm-stage-top .cm-full-pill [data-action=board-skip]").length};
      });
      ok(bar.inRegion && bar.words.includes("Next step") && bar.words.includes("Skip to end"), `${mode}: Next step and Skip to end stand over the table (${bar.words.join(", ")})`);
      /* Reduced about 12% once (49px, 17px), and a further 15% or so at Rob's word on 2026-10-27: 42px high, the type held at the HUD's 15px floor. */
      ok(bar.tall >= 41 && bar.tall <= 43 && bar.font === 15, `${mode}: actions reduced about 15% more while retaining readable targets (${Math.round(bar.tall)}px tall, ${bar.font}px words)`);
      /* Was "centered in the window"; the drawers lie over the stage, so the pop-up is centered between them (app change of 2026-10-28), never under a drawer nor over the turn box. */
      ok(bar.center < 4 && bar.top < 40, `${mode}: at the top of the table, centered between the drawers (${Math.round(bar.center)}px off center, ${Math.round(bar.top)}px down)`);
      ok(!bar.underDrawer && !bar.overBox, `${mode}: and under no drawer, over no turn box (${JSON.stringify({underDrawer: bar.underDrawer, overBox: bar.overBox})})`);
      eq(bar.strip, 0, `${mode}: and not in the strip as well`);
    }
    {
      /* ---- 4. what the other seats play, held up ---- */
      const plays = structuredClone(played()); plays.revision = ++rev; plays.decision = null;
      plays.events = [{eventId: "event:9001", kind: "cast", player: 1, card: {cardId: 9001, name: "Lightning Bolt"}, stackId: 1},
        {eventId: "event:9002", kind: "land", player: 2, card: {cardId: 9002, name: "Mountain"}},
        {eventId: "event:9003", kind: "cast", player: 0, card: {cardId: 9003, name: "Rime Chill"}, stackId: 2},
        {eventId: "event:9004", kind: "cast", player: 3, card: {cardId: 9004, name: null}, stackId: 3}];
      await show(plays);
      ok(await page.locator('[data-action=board-stage-rail]').evaluate(el=>{const r=el.getBoundingClientRect();return [[.15,.2],[.5,.5],[.85,.8]].every(([x,y])=>el.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)));}),`${mode}: previews leave the drawer disclosure natively reachable`);

      if (mode !== "full") {
        /* Table and Focus: the previews of the others' plays stand just past the open left drawer (its tab included), over the flat stage, and
           never over the drawer or its tab. The old Focus case that fitted the whole preview into the gap beside the mat (.cm-board-stage
           .cm-board-mat) is gone with that mat: a flat board is the stage's, and the 310px gutter that keeps boards clear of the drawer is
           narrower than the preview, so a preview is held up over the stage's left edge, as in 3D. */
        // Hold previews while collecting screenshots; expiration is exercised below with the next event batch.
        for(const pop of await page.locator('.cm-play-pop').all())await pop.dispatchEvent('mouseenter');
        if (!await page.locator('.cm-stage-rail.is-open').count()) await page.locator('[data-action=board-stage-rail]').evaluate(el=>el.click());
        for (const width of [2240, 1280]) {
          await page.setViewportSize({width, height:900});
          await page.waitForTimeout(300);
          const gap = await page.evaluate(() => {
            const rail=document.querySelector('.cm-stage-rail.is-open').getBoundingClientRect(),tab=document.querySelector('.cm-stage-left').getBoundingClientRect(),pop=document.querySelector('.cm-play-pop').getBoundingClientRect();
            return {drawer:Math.max(rail.right,tab.right),left:pop.left,right:pop.right,width:pop.width};
          });
          ok(gap.left>=gap.drawer-1,`${mode} ${width}: preview never covers the open drawer or its tab (${JSON.stringify(gap)})`);
          ok(await page.locator('[data-action=board-stage-rail]').evaluate(el=>{const r=el.getBoundingClientRect();return [[.15,.2],[.5,.5],[.85,.8]].every(([x,y])=>el.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)));}),`${mode} ${width}: preview leaves the drawer disclosure natively reachable`);
          ok(gap.left>=gap.drawer+10&&gap.left<=gap.drawer+14&&gap.right<=width-8,`${mode} ${width}: it stands just past the drawer, inside the window (${JSON.stringify(gap)})`);
          if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`played-card-gap-${mode}-${width}.png`)});}
        }
        await page.locator('[data-action=board-stage-rail]').evaluate(el=>el.click());
        await page.waitForTimeout(300);
        const collapsed=await page.evaluate(()=>{const p=document.querySelector('.cm-play-pop').getBoundingClientRect();const edge=document.querySelector('.cm-stage-left').getBoundingClientRect().right;return !document.querySelector('.cm-stage-rail.is-open')&&p.left>=edge+10&&p.left<=edge+14&&p.right<=innerWidth-8;});
        ok(collapsed,`${mode}: the folded drawer puts previews at the edge without covering drawer controls`);
        await page.setViewportSize({width:1440,height:900});
      }
      const shown = () => page.evaluate(() => [...document.querySelectorAll("#cm-board-plays .cm-play-pop")].map((el) => el.getAttribute("aria-label")));
      const first = await shown();
      eq(first.sort(), ["AI 2 played Mountain", "Friend cast Lightning Bolt"], `${mode}: the cards the others cast and played are held up, with who; never your own, never a face-down one (${JSON.stringify(first)})`);
      await show({...structuredClone(plays), revision: ++rev});
      eq((await shown()).length, 2, `${mode}: a view that repeats its events shows them no second time`);
      const more = {...structuredClone(plays), revision: ++rev, events: [5, 6, 7, 8].map((n) => ({eventId: `event:91${n}`, kind: "cast", player: 1, card: {cardId: 9100 + n, name: `Spell ${n}`}, stackId: n}))};
      await show(more);
      ok((await shown()).length === 3 && (await shown())[0] === "Friend cast Spell 8", `${mode}: three at most, the newest first (${JSON.stringify(await shown())})`);
      await page.locator("#cm-board-plays .cm-play-pop").first().locator(".cm-play-close").click();
      eq((await shown()).length, 2, `${mode}: its ✕ puts one away`);
      const fit = await page.evaluate(() => [...document.querySelectorAll("#cm-board-plays .cm-play-pop")].every((el) => {const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight;}));
      ok(fit, `${mode}: they fit in the window`);
      /* The pointer on one holds it (it was left over the column by the ✕); off them, they go after their ten seconds. */
      await page.mouse.move(720, 450);
      await page.waitForTimeout(10800);
      eq((await shown()).length, 0, `${mode}: and after ten seconds they are gone by themselves`);
    }
    {
      /* ---- 6. the tabletop's sizes: Camera's Cards (the old "Board cards" row-bar control lives here now) and Zoom, in every view ---- */
      await page.locator("[data-action=board-camera]").click();
      const ranges = await page.evaluate(() => ["cards", "zoom"].map((k) => document.querySelector(`[data-stage-camera="${k}"]`)?.max));
      eq(ranges, ["200", "200"], `${mode}: the tabletop's Cards and Zoom go to 200%`);
      await page.locator("[data-stage-camera=cards]").fill("200");
      await page.locator("[data-stage-camera=zoom]").fill("200");
      await page.waitForTimeout(300);
      eq(errors, [], `${mode}: at 200% no page error`);
      await page.locator("[data-action=board-camera]").click();
    }
    /* ---- 5. Settings: the two choices ---- */
    await page.locator("[data-action=board-table-menu]").click();
    await page.locator("#cm-table-menu [data-action=board-tools]").click();
    await page.locator("#cm-dialog [role=tab][data-tab=gameplay]").click();
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
  /* ---- the commander tax below the title bar, in every view ---- */
  for (const view of ["focus", "table", "full"]) {
    const v = structuredClone(sample);
    const me = v.state.players[v.seat], cmd = me.zones.Command.cards[0] || null;
    if (cmd) cmd.commanderTax = 2;
    else me.zones.Command = {count: 1, cards: [{cardId: 777, name: "Quintorius, Loremaster", types: ["Creature"], power: 4, toughness: 5, commander: true, commanderTax: 2, owner: v.seat, controller: v.seat, counters: {}}]};
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, view);
    const page = await context.newPage();
    if (stub) await stub(page);
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => ws.send(JSON.stringify({type: "view", view: v})));
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator(".cm-bcard-tax").first().waitFor({state: "attached", timeout: 20000});
    const tax = await page.evaluate(() => {const t = document.querySelector(".cm-bcard-tax").getBoundingClientRect(), c = document.querySelector(".cm-bcard-tax").closest(".cm-bcard").getBoundingClientRect(); return (t.top - c.top) / c.height;});
    const taxShown = await page.locator(".cm-bcard-tax").first().isVisible();   /* legible or absent (Rob, 2026-10-29): a board of cards too small for it shows none */
    if (taxShown) ok(tax >= 0.1, `${view}: the commander tax sits below the card's title bar, clear of its mana cost (${Math.round(tax * 100)}% down the card)`);
    else ok(await page.locator(".cm-bcard-tax").first().evaluate((el) => !!el.closest("[data-tiny]")), `${view}: the commander tax is absent only on a board of cards too small for it`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`board-fullscreen-notes: ${checks} checks passed -- card actions reviewed and confirmed in every view, a land just played taken back by its offered Undo drawer, the actions large over the table in every view, the others' plays held up for ten seconds, the two priority choices, Camera's Cards and Zoom to 200%, the commander tax below the title bar.`);
