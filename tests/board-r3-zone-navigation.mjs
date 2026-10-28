/* Crowded-board zone navigation: recorded projections, real browser input, in Table, Focus and 3D (the 3D HUD, flat in the first two). */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-r3-zone-navigation", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "notes0001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const ISLAND = 524, PLAYED = 600;

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

async function board(mode, {width = 1440, height = 900, failedArt = false} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  if (failedArt) await page.route('**://cards.scryfall.io/**', route => route.abort());
  const errors = [], sent = [];
  let sock = null;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.onMessage((m) => sent.push(JSON.parse(m))); ws.send(JSON.stringify({type: "view", view: sample}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator("#cm-board[data-view]").waitFor({timeout: 20000});
  await page.waitForTimeout(300);
  /* A phone opens Actions (a decision waits) over the whole board: the drawers are the top layer, so a player reads the board by shutting them, as here. */
  if (await page.locator('#cm-board[data-phone]').count()) {await page.evaluate(() => {for (const t of document.querySelectorAll('[data-action="board-stage-rail"][aria-expanded="true"], [data-action="board-stage-side"][aria-expanded="true"]')) t.click();}); await page.waitForTimeout(300);}
  const show = async (view) => {sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(350);};
  const acts = () => sent.filter((x) => x.type === "act").map((x) => x.indices);
  return {page, context, errors, sent, acts, show};
}

try {
 // A crowded battlefield wraps whole cards; planeswalkers share the leading creature group.
 for(const mode of ['focus','table','full']) {
  const {page,context,show,acts}=await board(mode,{width:1440,height:900});
  ok(await page.locator('.cm-bcard-count').evaluateAll(els=>els.length>0&&els.filter(el=>el.getBoundingClientRect().width>0).every(el=>parseFloat(getComputedStyle(el).fontSize)>=10)),`${mode}: pile counts stay at least 10px on every mat`);
  const island=page.locator('.cm-bcard[data-card="469"]').first();
  await island.locator('img').evaluate(async img=>{if(!img.complete)await new Promise(resolve=>img.addEventListener('load',resolve,{once:true}));});
  eq(await island.locator('.cm-bcard-name').evaluate(el=>getComputedStyle(el).visibility),'hidden',`${mode}: loaded artwork replaces the painted fallback name`);
  ok((await island.getAttribute('aria-label')).includes('Island'),`${mode}: loaded artwork keeps the card's accessible name`);
  const v=structuredClone(sample);v.revision+=200;
  for(const player of v.state.players){
   player.zones.Battlefield.cards=Array.from({length:60},(_,i)=>({cardId:20000+player.playerId*1000+i,name:i===19?'Jace Beleren':i<20?'Grizzly Bears':i<40?'Sol Ring':'Island',types:[i===19?'Planeswalker':i<20?'Creature':i<40?'Artifact':'Land'],owner:player.playerId,controller:player.playerId,tapped:false,counters:{},token:false,...(i<19?{power:2,toughness:2}:{})}));player.zones.Battlefield.count=60;
  }
  await show(v);
  const cards=page.locator(`[data-card-section="${v.seat}:creatures"]`).first();
  eq(await cards.locator('[data-card]').count(),20,`${mode}: creatures and planeswalkers lead the battlefield`);
  ok(await cards.evaluate(el=>new Set([...el.children].map(c=>c.offsetTop)).size>1),`${mode}: crowded creatures form multiple rows`);
  ok(await cards.evaluate(el=>{const a=el.children[0],b=el.children[1];return a.offsetTop!==b.offsetTop||b.offsetLeft>=a.offsetLeft+a.offsetWidth;}),`${mode}: whole cards do not overlap`);
  const field=page.locator(`[data-zone-scroll="${v.seat}:battlefield"]`).first();
  ok(await field.evaluate(el=>{const c=el.querySelector('[data-card]'),a=el.getBoundingClientRect(),b=c.getBoundingClientRect();return b.top>=a.top && b.bottom<=a.bottom+1;}),`${mode}: first card is fully visible at rest`);
  ok(await field.evaluate(el=>{const a=el.getBoundingClientRect();return [...el.querySelectorAll('[data-card-section] > [data-card]')].some(c=>{const b=c.getBoundingClientRect();return b.top<a.bottom-6 && b.bottom>a.bottom;});}),`${mode}: next row peeks into view (of whichever group is next: Table's small board fits all the creatures in two rows, so the cue is the first row of the next group)`);
  await field.focus();await page.keyboard.press('End');
  ok(await field.evaluate(el=>{const c=el.querySelector('[data-card-section$=others]').lastElementChild,a=el.getBoundingClientRect(),b=c.getBoundingClientRect();return b.bottom<=a.bottom+1&&b.top>=a.top;}),`${mode}: final other permanent is fully reachable`);
  const fieldPosition=await field.evaluate(el=>el.scrollTop);v.revision+=1;await show(v);
  ok(Math.abs(await field.evaluate(el=>el.scrollTop)-fieldPosition)<2,'battlefield position survives a room update');
  eq(acts().length,0,'row navigation sends no game action');
  mkdirSync(path.join(ROOT,'work/r3-zone-proof'),{recursive:true});
  await field.focus();await page.keyboard.press('Home');
  await page.screenshot({path:path.join(ROOT,`work/r3-zone-proof/rows-${mode}.png`)});
  v.state.players[v.seat].zones.Battlefield.cards[0].tapped=true;v.revision+=1;await show(v);
  const tapped=cards.locator('.is-tapped').first();
  ok(await tapped.evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return Math.abs(Math.atan2(m.b,m.a)*180/Math.PI-30)<.1;}),`${mode}: a tapped card rotates 30 degrees`);
  /* EX17 (r4: "Tapping rotates within the same slot; corners may tuck under adjacent cards", spacing's default is zero gap): since 2026-10-26 a tapped
     card keeps its own grid slot and its 30 degree corner tucks under the neighbor, so "no cover at all" no longer holds in ANY view (3D
     included; it failed on main before the flat views, with the same message). What is kept: the slot is unchanged (the neighbor is not pushed,
     it sits exactly one card's width on), and the tuck is the rotation's own corner only, a fixed share of the card of at most 34%, the strip
     the card's name already keeps clear of (CSS: a tapped card's name wraps at right:34%). For w x h = 5:7, (w cos30 + h sin30 - w) / 2 = 28.3% of w. */
  const tuck=await cards.evaluate(el=>{const all=[...el.children],a=all[0],b=all[1],ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();const t=a.style.transform;a.style.transform='none';const rn=a.getBoundingClientRect();a.style.transform=t;
   /* the corner's reach past its own untilted slot, as a share of the neighbor's width, both as drawn (3D foreshortens the table, so a flat 28.3% would not hold there) */
   return {slot:b.offsetLeft-a.offsetLeft-a.offsetWidth,same:a.offsetWidth===b.offsetWidth&&a.offsetTop===b.offsetTop,into:Math.max(0,ra.right-rn.right)/rb.width,gap:Math.round((rb.left-rn.right)*10)/10};});
  ok(tuck.same&&tuck.slot===0,`${mode}: a tapped card keeps its slot, so its neighbor is not moved (slot gap ${tuck.slot})`);
  ok(tuck.into>0&&tuck.into<=.34,`${mode}: a tapped card's corner tucks into its neighbor by at most 34% of the neighbor's width (${Math.round(tuck.into*1000)/10}%, drawn gap ${tuck.gap}px)`);

  await context.close();
 }
 for (const [mode,width,height] of [['focus',1280,720],['table',1280,720],['full',1280,720]]) {
  const {page,context,errors,acts,show}=await board(mode,{width,height});
  /* identical lands join one physical stack (r4 C2), so a crowded lands zone needs lands that differ: each of these 60 Islands carries a different number of charge counters (the name stays one whose art loads) */
  const v=structuredClone(sample);v.revision+=100;
  for(const player of v.state.players){
   player.zones.Battlefield.cards=Array.from({length:100},(_,i)=>({cardId:10000+player.playerId*1000+i,name:i<20?'Grizzly Bears':i<40?'Sol Ring':'Island',types:[i<20?'Creature':i<40?'Artifact':'Land'],owner:player.playerId,controller:player.playerId,tapped:i>=40 && i%2===1,counters:i>=40?{charge:i}:{},token:false,...(i<20?{power:2,toughness:2}:{})}));player.zones.Battlefield.count=100;
  }
  await show(v);
  const key=`${v.seat}:lands`,land=page.locator(`[data-zone-scroll="${key}"]`).first();
  await land.waitFor({timeout:3000});
  ok(await land.evaluate(el=>el.scrollHeight>el.clientHeight+10),`${mode}/${width}: crowded lands overflow at normal size`);
  ok(await land.evaluate(el=>{const c=el.querySelector('[data-card]'),a=el.getBoundingClientRect(),b=c.getBoundingClientRect();return b.top>=a.top-1&&b.bottom<=a.bottom+1;}),`${mode}/${width}: first land is fully visible at rest`);
  const before=acts().length;
  const handBefore=await page.locator(width<800?'.cm-phone-pill':'.cm-stage-hand,.cm-board-main>.cm-board-hand,#cm-board>.cm-board-hand').first().boundingBox();
  await land.focus();await page.keyboard.press('Home');
  await land.hover();await page.mouse.wheel(0,450);await page.waitForTimeout(100);
  ok(await land.evaluate(el=>el.scrollTop>0),`${mode}/${width}: wheel reaches later lands`);
  const others=await page.locator('[data-zone-scroll]').evaluateAll(els=>els.filter(e=>!e.dataset.zoneScroll.endsWith(':lands')).map(e=>e.scrollTop));
  ok(others.every(x=>x===0),'land navigation leaves other zones alone');
  await land.focus();await page.keyboard.press('End');
  ok(await land.evaluate(el=>Math.abs(el.scrollTop-(el.scrollHeight-el.clientHeight))<2),'End reaches last land');
  const pos=await land.evaluate(el=>el.scrollTop);await show({...v,revision:v.revision+1});
  ok(Math.abs(await land.evaluate(el=>el.scrollTop)-pos)<2,'incoming revision preserves the zone position');
  if(width>800){
   for(const target of [mode==='table'?'focus':'table',mode]){await page.locator('[data-action=board-camera]').click();await page.locator(`[data-action=board-view][data-view="${target}"]`).click();await page.waitForTimeout(100);}
   ok(Math.abs(await land.evaluate(el=>el.scrollTop)-pos)<2,'returning to a view restores its own zone position');
  }
  /* The last card is a tapped one. Flat views: its whole rotated outline is inside the zone (1px). 3D draws the table in perspective and the lands zone
     is one row tall, so a rotated card's outline can lie a few pixels past the zone's edge: there its untilted slot must be inside (1px) and only the
     rotation's own corner tips, at most (h cos30 + w sin30 - h) / 2 of the slot, may lie outside it. */
  ok(await land.evaluate((el,flat)=>{const last=el.querySelector('[data-card-section]')?.lastElementChild||el.lastElementChild;const a=el.getBoundingClientRect(),b=last.getBoundingClientRect();
    const t=last.style.transform;last.style.transform='none';const n=last.getBoundingClientRect();last.style.transform=t;const hang=flat?1:Math.max(1,(n.height*Math.cos(Math.PI/6)+n.width/2-n.height)/2);
    return n.bottom<=a.bottom+1&&n.top>=a.top-1&&b.bottom<=a.bottom+hang&&b.top>=a.top-hang;},mode!=='full'),`${mode}/${width}: last tapped card is fully reachable`);

  await land.focus();await page.keyboard.press('Home');eq(await land.evaluate(el=>el.scrollTop),0,'Home returns to first land');
  await page.keyboard.press('PageDown');ok(await land.evaluate(el=>el.scrollTop>0),'PageDown explores the zone');
  eq(acts().length,before,'navigation never submits a game action');
  eq(await land.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none','no visible scrollbar');
  await land.focus();await page.keyboard.press('End');
  // Find real blank space, so the drag cannot begin on a card or a control.
  const blank=await land.evaluate(el=>{const b=el.getBoundingClientRect();for(let y=b.top+2;y<b.bottom-2;y+=4)for(let x=b.left+12;x<b.right-12;x+=12){const hit=document.elementFromPoint(x,y);if(hit&&el.contains(hit)&&!hit.closest('button,a,input,select,textarea,[role=button]'))return{x,y};}return null;});
  if(blank){await page.mouse.move(blank.x,blank.y);await page.mouse.down();await page.mouse.move(blank.x,blank.y+80,{steps:8});await page.mouse.up();ok(await land.evaluate(el=>el.scrollTop)<pos-10,'blank-space drag scrolls the zone');}
  else throw Error(`${mode}/${width}: no reachable blank space for drag`);
  eq(acts().length,before,'drag does not act');eq(errors,[],'no browser errors');
  eq(await page.locator(width<800?'.cm-phone-pill':'.cm-stage-hand,.cm-board-main>.cm-board-hand,#cm-board>.cm-board-hand').first().boundingBox(),handBefore,'zone navigation leaves the hand stationary');
  mkdirSync(path.join(ROOT,'work/r3-zone-proof'),{recursive:true});await page.screenshot({path:path.join(ROOT,`work/r3-zone-proof/${mode}-${width}.png`)});
  for(const endpoint of ['Home','End']) {
   await page.locator('[data-action=board-camera]').click();
   /* the row bar's Board cards control moved into Camera (Cards) with the 3D HUD, in every view */
   const slider=page.locator('[data-stage-camera=cards]').first();
   await slider.focus();await page.keyboard.press(endpoint);
   eq(await slider.inputValue(),await slider.getAttribute(endpoint==='Home'?'min':'max'),`${mode}/${width}: card slider reaches ${endpoint}`);
   await page.locator('[data-action=board-camera]').click();
   const target=page.locator(`[data-card-section="${key}"] [data-card]`).last();
   await target.focus();
   ok(await target.evaluate(el=>{const z=el.closest('[data-zone-scroll]'),a=z.getBoundingClientRect(),b=el.getBoundingClientRect();return b.bottom>a.top&&b.top<a.bottom&&b.right>a.left&&b.left<a.right;}),`${mode}/${width}: last land remains reachable at ${endpoint}`);
   eq(await target.locator('img').evaluate(el=>getComputedStyle(el).objectFit),'contain','the complete card image is fitted without cropping');
  }
  eq(acts().length,before,'sizing and keyboard inspection never act');
  await context.close();
 }
 const phone=await board('focus',{width:844,height:390});
 const frame=phone.page.locator('.cm-phone-battlefield');
 const bounds=await frame.boundingBox();
 await phone.page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
 for(let i=0;i<8;i++){await phone.page.mouse.wheel(0,400);await phone.page.waitForTimeout(80);}
 ok(await frame.evaluate(el=>el.scrollTop>0),'phone: wheel reaches the outer frame past a card zone boundary');
 const library=frame.locator('[data-zone="library"]');
 ok(await library.evaluate(el=>{const b=el.getBoundingClientRect();return !!document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('[data-zone="library"]');}),'phone: library is reachable after scrolling through card zones');
 await phone.context.close();
 const failed=await board('focus',{failedArt:true});
 const fallback=failed.page.locator('.cm-bcard[data-card="469"]').first();
 await fallback.locator('img').waitFor({state:'detached'});
 eq(await fallback.locator('.cm-bcard-name').evaluate(el=>getComputedStyle(el).visibility),'visible','failed artwork retains a visible fallback name');
 eq(await fallback.locator('.cm-bcard-name').innerText(),'Island','failed artwork names the actual card');
 ok((await fallback.getAttribute('aria-label')).includes('Island'),'failed artwork preserves the accessible name too');
 await failed.context.close();
 /* LAST, because it fails today on an app defect that predates this suite's migration (same numbers on the commit before Table and Focus became
    flat HUD views): `.cm-mat-zone.cm-board-lands` keeps `overflow:hidden` and its phone height (clamp 22dvh), while phone CSS makes every card section
    full height with no scroller of its own, so lands past the first ~217px are clipped and no scroll reaches them (60 different lands: the zone's
    scrollHeight 1138 against clientHeight 217, the last land at y 1200 of an 844px screen).
    A portrait phone has no zone of its own to scroll (CSS: on a phone every zone is its full height and the board frame scrolls, so a thumb never
    meets a scroller inside a scroller). The same guarantees are proved on the frame: crowded lands overflow it, a wheel reaches the last land,
    no scrolling acts, the card-size slider's ends keep the last land reachable, and the phone's hand pill stays put. */
 {
  const {page,context,errors,acts,show}=await board('focus',{width:390,height:844});
  const v=structuredClone(sample);v.revision+=100;
  for(const player of v.state.players){
   player.zones.Battlefield.cards=Array.from({length:100},(_,i)=>({cardId:10000+player.playerId*1000+i,name:i<20?'Grizzly Bears':i<40?'Sol Ring':'Island',types:[i<20?'Creature':i<40?'Artifact':'Land'],owner:player.playerId,controller:player.playerId,tapped:i>=40 && i%2===1,counters:i>=40?{charge:i}:{},token:false,...(i<20?{power:2,toughness:2}:{})}));player.zones.Battlefield.count=100;
  }
  await show(v);
  const frame=page.locator('.cm-phone-battlefield'),key=`${v.seat}:lands`;
  eq(await page.locator('[data-zone-scroll]').count(),0,'phone/390: no zone is a scroller of its own');
  ok(await frame.evaluate(el=>el.scrollHeight>el.clientHeight+10),'phone/390: crowded lands overflow the frame at normal size');
  const before=acts().length,pill=await page.locator('.cm-phone-pill').first().boundingBox(),box=await frame.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  for(let i=0;i<60;i++){await page.mouse.wheel(0,400);await page.waitForTimeout(40);}
  ok(await frame.evaluate(el=>Math.abs(el.scrollTop-(el.scrollHeight-el.clientHeight))<2),'phone/390: the wheel reaches the end of the frame');
  const last=page.locator(`[data-card-section="${key}"] [data-card]`).last();
  ok(await last.evaluate(el=>{const f=el.closest('.cm-phone-battlefield').getBoundingClientRect(),b=el.getBoundingClientRect();return b.bottom<=f.bottom+1&&b.top>=f.top-1&&b.width>0;}),'phone/390: the last land is fully inside the frame at its end');
  for(const endpoint of ['Home','End']) {
   await page.locator('[data-action=board-camera]').click();
   const slider=page.locator('[data-stage-camera=cards]').first();
   await slider.focus();await page.keyboard.press(endpoint);
   eq(await slider.inputValue(),await slider.getAttribute(endpoint==='Home'?'min':'max'),`phone/390: card slider reaches ${endpoint}`);
   await page.locator('[data-action=board-camera]').click();
   await last.scrollIntoViewIfNeeded();
   ok(await last.evaluate(el=>{const f=el.closest('.cm-phone-battlefield').getBoundingClientRect(),b=el.getBoundingClientRect();return b.bottom>f.top&&b.top<f.bottom&&b.right>f.left&&b.left<f.right;}),`phone/390: last land remains reachable at ${endpoint}`);
  }
  eq(acts().length,before,'phone/390: scrolling and sizing never act');
  eq(await page.locator('.cm-phone-pill').first().boundingBox(),pill,'phone/390: scrolling the frame leaves the hand pill stationary');
  eq(errors,[],'phone/390: no browser errors');
  await context.close();
 }
} finally {await close();}
console.log(`board-r3-zone-navigation: ${checks} checks passed`);
