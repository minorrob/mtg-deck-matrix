/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * r4 D1: decisions stay usable when a drawer folds, HUD sizing is a device preference,
 * and the table's destructive actions require confirmation. The room view is a fixture;
 * this suite proves rendering and requests, not engine legality.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-r4-shell", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks++;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks++;};
const shotRoot = process.env.UAT_SHOTS;
if (shotRoot) mkdirSync(shotRoot, {recursive:true});

async function open(mode, width, skin = "sapphire-obsidian", opening = false) {
  const sample = structuredClone(views[opening ? 0 : 13]), tableId = "r4shell01", posts = [], errors = [];
  const table = {tableId, phase:"playing", matchId:sample.matchId, away:[], blockers:[], youAreHost:true, rules:{},
    seats:sample.state.players.map(p => ({seatId:p.playerId,name:p.name,kind:p.playerId === sample.seat ? "human":"ai",you:p.playerId === sample.seat,occupied:true,ready:true,mat:"felt"}))};
  const context = await browser.newContext({viewport:{width,height:width < 500 ? 844 : 900}, reducedMotion:"reduce", serviceWorkers:"block"});
  await context.addInitScript(({mode,skin}) => {localStorage.setItem("cm-board-view",mode);localStorage.setItem("crankmagic-audio-muted","true");(globalThis.CrankFeatures ||= []).push(C => {globalThis.__r4Commit = c => C.commit(c);globalThis.__r4Live=()=>C.board.live();});}, {mode,skin});
  const page = await context.newPage(); if (stub) await stub(page);
  page.on("pageerror", e => errors.push(e.message));
  await page.route(`${base}/index.html*`, r => r.fulfill({contentType:"text/html",body:html}));
  await page.route(`${base}/api/me`, r => r.fulfill({json:{email:"rob@example.com"}}));
  await page.route(`${base}/api/library**`, r => r.fulfill({json:{head:null}}));
  await page.route(`${base}/api/tables**`, r => {if(r.request().method() === "POST") posts.push(new URL(r.request().url()).pathname); return r.fulfill({json:{table,now:Date.now()}});});
  await page.routeWebSocket(new RegExp(`/api/tables/${tableId}/connect$`), ws => ws.send(JSON.stringify({type:"view",view:sample})));
  await page.goto(`${base}/index.html#table?id=${tableId}`);
  await page.locator("#cm-board.cm-study .cm-seat-header").first().waitFor({timeout:20000});
  if (skin !== "sapphire-obsidian") await page.evaluate(async theme => {await globalThis.__r4Commit({type:"preferences",values:{theme}});}, skin);
  return {page,context,errors,posts,sample};
}

async function wholeRows(page,label) {
  const clipped=await page.evaluate(() => {
    const fails=[];
    const areas=[...document.querySelectorAll('#cm-board .cm-mat-grid,.cm-phone-battlefield,.cm-board-field,[data-card-section]')];
    const saved=areas.map(el=>[el,el.scrollTop,el.scrollLeft]);
    for(const card of document.querySelectorAll('#cm-board [data-card-section] .cm-bcard')) {
      if(!card.getClientRects().length)continue;
      if(card.classList.contains('is-tapped')){
        const m=new DOMMatrix(getComputedStyle(card).transform),angle=Math.atan2(m.b,m.a)*180/Math.PI;
        if(Math.abs(angle-30)>.2)fails.push({card:card.dataset.card,angle});
        continue; // EX17 keeps the slot unchanged and explicitly permits rotated corners to tuck under neighbors.
      }
      card.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
      const r=card.getBoundingClientRect();
      for(let a=card.parentElement;a && !a.matches('#cm-board');a=a.parentElement) {
        const css=getComputedStyle(a);if(!/(auto|scroll|hidden|clip)/.test(css.overflowY))continue;
        const b=a.getBoundingClientRect();
        if(r.top < b.top-2 || r.bottom > b.bottom+2) {fails.push({card:card.dataset.card,ancestor:a.className,cardH:Math.round(r.height),viewportH:Math.round(b.height),top:Math.round(r.top-b.top),bottom:Math.round(r.bottom-b.bottom)});break;}
      }
    }
    for(const [el,y,x] of saved){el.scrollTop=y;el.scrollLeft=x;}
    return fails;
  });
  eq(clipped,[],`${label}: every battlefield/land card is wholly scroll-reachable`);
}

try {
  for (const [mode,width,skin] of [["table",1440,"sapphire-obsidian"],["focus",1440,"sapphire-obsidian-light"],["full",1440,"bronze-basalt"],["focus",390,"sapphire-obsidian"]]) {
    const {page,context,errors} = await open(mode,width,skin);
    if (shotRoot) await page.screenshot({path:path.join(shotRoot,`r4-shell-${mode}-${width}-100.png`)});
    eq(await page.locator(".cm-sidebar").evaluate(el => [el.inert,el.getAttribute("aria-hidden")]), [true,"true"], `${mode}/${width}: covered navigation is inaccessible`);
    ok(await page.locator("#cm-board .cm-mat").count() > 0, `${mode}: seats retain their mats`);
    const live=await page.evaluate(()=>globalThis.__r4Live());
    eq(live.seats.map(s=>s.life),[40,26,40,43],`${mode}: live summary reports public life`);
    ok(live.seats.every(s=>Object.keys(s).sort().join(',')==='commanders,life,name,seatId'),`${mode}: live summary contains only public seat fields`);
    const order = await page.locator("#cm-board .cm-seat-header").first().evaluate(el => [...el.children].map(n => n.classList[0]));
    eq(order,["cm-seat-portrait","cm-seat-identity","cm-vitals","cm-seat-hand","cm-seat-state"], `${mode}/${width}: one seat header structure`);
    eq(await page.locator('.cm-seat-portrait img').evaluateAll(images => images.filter(img => img.complete && !img.naturalWidth).length),0,`${mode}: unavailable portraits use initials rather than broken images`);
    const chrome = await page.evaluate(() => [...document.querySelectorAll('#cm-board .cm-stage-top .cm-board-ribbon li,#cm-board .cm-stage-top .v-button,#cm-board .cm-board-hand-types li span,#cm-board .cm-board-group>h3,#cm-board .cm-mat-label,#cm-board .cm-phone-pill .cm-board-step,#cm-board .cm-phone-badge')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => ({text:el.textContent.trim(),size:parseFloat(getComputedStyle(el).fontSize)})).filter(x => x.size < 15));
    eq(chrome,[],`${mode}/${width}: visible board chrome is at least 15px, independent of card art`);
    const primaries = await page.locator('#cm-board .v-button.primary:not([disabled]),#cm-board .cm-btn--primary:not([disabled])').evaluateAll(es => es.filter(el => el.getClientRects().length && !el.closest('[inert]') && getComputedStyle(el).visibility !== 'hidden').map(el => el.textContent.trim()));
    eq(primaries.length,1,`${mode}/${width}: priority has one enabled primary (${primaries.join(', ')})`);
    const menu = await page.locator('[data-action=board-table-menu]').boundingBox(), camera = await page.locator('[data-action=board-camera]').boundingBox();
    ok(Math.abs(menu.y-camera.y) <= 5 && menu.x+menu.width <= camera.x+2,`${mode}/${width}: Table sits beside Camera`);
    await wholeRows(page,`${mode}/${width}/100`);
    const life = await page.locator("#cm-board .cm-seat-header .cm-vitals>b").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    ok(life >= 28, `${mode}/${width}: life is readable (${life}px)`);
    await page.locator('[data-action="board-stage-rail"]').click();
    eq(await page.locator('[data-action="board-stage-rail"]').getAttribute("aria-expanded"),"false", `${mode}: folding is announced`);
    ok(await page.locator("#cm-decision-slot #cm-board-decision").isVisible(), `${mode}/${width}: folded decision is still actionable`);
    eq(await page.locator("#cm-actions-drawer #cm-board-decision").count(),0, `${mode}: the decision is not duplicated`);
    await page.locator('[data-action="board-camera"]').click();
    const slider = page.locator(".cm-stage-camera [data-play-hud]");
    await slider.evaluate(el => {el.value="175";el.dispatchEvent(new Event("input",{bubbles:true}));});
    eq(await page.locator("#cm-board").evaluate(el => el.style.getPropertyValue("--hud-scale")),"1.75", `${mode}: HUD previews continuously`);
    eq(await page.evaluate(() => localStorage.getItem("cm-play-hud-scale")),null, `${mode}: preview does not save`);
    await slider.evaluate(el => el.dispatchEvent(new Event("change",{bubbles:true})));
    eq(await page.evaluate(() => localStorage.getItem("cm-play-hud-scale")),"175", `${mode}: release saves on this device`);
    await slider.evaluate(el => {el.value="200";el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));});
    await page.locator('[data-action="board-camera"]').click();
    if (width >= 500) {
      const header = await page.locator('.cm-stage-top').boundingBox();
      const children = await page.locator('.cm-stage-top').evaluate(el => [...el.children].filter(n => n.getClientRects().length && !n.matches('.cm-combat')).map(n => {const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
      ok(children.every(r => r.left >= -1 && r.right <= width+1 && r.top >= header.y-1 && r.bottom <= header.y+header.height+1),`${mode}: all top-bar content fits its HUD-sized row at 200%`);
    }
    await wholeRows(page,`${mode}/${width}/200`);
    const overlaps = await page.locator('.cm-board-field').evaluateAll(fields => fields.flatMap(field => {const label=field.querySelector(':scope>.cm-mat-label');if(!label || !label.getClientRects().length)return [];const r=label.getBoundingClientRect();return [...field.querySelectorAll('.cm-board-group>h3')].filter(h=>{const b=h.getBoundingClientRect();return r.left<b.right && r.right>b.left && r.top<b.bottom && r.bottom>b.top;}).map(h=>h.textContent);}));
    eq(overlaps,[],`${mode}/${width}: zone captions do not overlap group headings at 200%`);
    const lastChoice = page.locator('#cm-decision-slot button:not([disabled])').last();
    await lastChoice.scrollIntoViewIfNeeded();
    const lastBox = await lastChoice.boundingBox();
    ok(lastBox && lastBox.y >= 0 && lastBox.y + lastBox.height <= (width < 500 ? 792 : 900) + 1, `${mode}/${width}: last decision control remains reachable at 200%`);
    if (shotRoot) await page.screenshot({path:path.join(shotRoot,`r4-shell-${mode}-${width}-200.png`)});
    if(width < 500) {
      const lands=page.locator('.cm-phone-battlefield .cm-board-lands>.cm-mat-label'); await lands.scrollIntoViewIfNeeded();
      const landBox=await lands.boundingBox(), viewport=await page.locator('.cm-phone-battlefield').boundingBox();
      ok(landBox.y >= viewport.y-1 && landBox.y+landBox.height <= viewport.y+viewport.height+1,'phone: Lands is scroll-reachable at 200%');
      if(shotRoot) await page.screenshot({path:path.join(shotRoot,'r4-shell-phone-lands-200.png')});
    }
    await page.locator('[data-action="board-camera"]').click();
    await page.locator('.cm-stage-camera [data-play-hud]').evaluate(el => {el.value="100";el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));});
    await page.keyboard.press("Escape");
    await page.evaluate(() => document.querySelector('[data-action="board-stage-side"]').click());
    const header = page.locator('.cm-stage-module[data-module="history"]>header .cm-module-toggle');
    await header.focus(); await page.keyboard.press("Enter");
    eq(await header.getAttribute("aria-expanded"),"false", `${mode}: Enter folds a module`);
    await page.keyboard.press("Space");
    eq(await header.getAttribute("aria-expanded"),"true", `${mode}: Space unfolds it`);
    eq(await page.locator(".cm-module-drag").count(),0, `${mode}: six-dot handles are retired`);
    if (shotRoot) await page.screenshot({path:path.join(shotRoot,`r4-shell-${mode}-${width}.png`)});
    eq(errors,[],`${mode}/${width}: no page errors`);
    await context.close();
  }
  {
    const {page,context,posts,errors} = await open("focus",1440);
    await page.locator('[data-action="board-table-menu"]').click();
    await page.locator('#cm-table-menu [data-action="board-concede"]').click();
    eq(posts.filter(p => p.endsWith("/concede")).length,0,"opening Concede confirmation sends nothing");
    await page.locator('#cm-dialog [data-action="close"]').last().click();
    eq(posts.filter(p => p.endsWith("/concede")).length,0,"Cancel keeps the game intact");
    await page.locator('#cm-table-menu [data-action="board-concede"]').click();
    await page.locator('#cm-dialog [data-action="board-concede"][data-confirm="1"]').click();
    await page.waitForFunction(() => !document.querySelector('#cm-dialog[open]') && !document.getElementById('cm-table-menu'));
    eq(posts.filter(p => p.endsWith("/concede")).length,1,"only the explicit confirmation concedes once");
    await page.mouse.move(3,3); await page.waitForTimeout(350);
    await page.keyboard.press("Escape");
    ok(await page.locator("#cm-table-menu").isVisible(),"Escape from the board opens Table");
    await page.keyboard.press("Escape");
    eq(await page.locator("#cm-table-menu").count(),0,"Escape closes the open Table menu first");
    await page.evaluate(() => CrankBoard.countdown(document.getElementById("cm-board"),3));
    eq(await page.locator(".cm-countdown-callout").textContent(),"3","the lobby shares the countdown treatment");
    await page.evaluate(() => CrankBoard.countdown(document.getElementById("cm-board"),null));
    eq(await page.locator(".cm-countdown-callout").count(),0,"ending a countdown restores the surface");
    eq(errors,[],"table actions raise no page errors");
    await context.close();
  }
  {
    const {page,context,errors} = await open("focus",1440,"sapphire-obsidian",true);
    ok(await page.locator("#cm-decision-slot [data-action=board-opening-hand]").count() >= 2,"opening hand offers Keep and Mulligan in the decision slot");
    eq(await page.locator("#cm-actions-drawer #cm-board-decision").count(),0,"opening hand is rendered once");
    eq(errors,[],"opening hand raises no page errors");
    await context.close();
  }
} finally {await close();}
console.log(`board-r4-shell: ${checks} checks passed -- shared headers, persistent decisions, device HUD sizing, keyboard disclosures and confirmed table actions.`);
