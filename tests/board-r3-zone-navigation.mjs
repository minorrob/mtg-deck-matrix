/* Crowded-board zone navigation: recorded projections, real browser input. */
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
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
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
  ok(await field.evaluate(el=>{const a=el.getBoundingClientRect();return [...el.querySelector('[data-card-section]').children].some(c=>{const b=c.getBoundingClientRect();return b.top<a.bottom-6 && b.bottom>a.bottom;});}),`${mode}: next row peeks into view`);
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
  ok(await cards.evaluate(el=>{const all=[...el.children],a=all[0].getBoundingClientRect(),b=all[1].getBoundingClientRect();return a.right<=b.left+1||a.bottom<=b.top+1;}),`${mode}: tapped cards have room without covering a neighbor`);

  await context.close();
 }
 for (const [mode,width,height] of [['focus',1280,720],['table',1280,720],['full',1280,720],['focus',390,844]]) {
  const {page,context,errors,acts,show}=await board(mode,{width,height});
  const v=structuredClone(sample);v.revision+=100;
  for(const player of v.state.players){
   player.zones.Battlefield.cards=Array.from({length:100},(_,i)=>({cardId:10000+player.playerId*1000+i,name:i<20?'Grizzly Bears':i<40?'Sol Ring':'Island',types:[i<20?'Creature':i<40?'Artifact':'Land'],owner:player.playerId,controller:player.playerId,tapped:i>=40 && i%2===1,counters:{},token:false,...(i<20?{power:2,toughness:2}:{})}));player.zones.Battlefield.count=100;
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
  ok(await land.evaluate(el=>{const last=el.querySelector('[data-card-section]')?.lastElementChild||el.lastElementChild;const a=el.getBoundingClientRect(),b=last.getBoundingClientRect();return b.bottom<=a.bottom+1&&b.top>=a.top-1;}),'last tapped card is fully reachable');

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
   const slider=page.locator(mode==='full'?'[data-stage-camera=cards]':'[data-board-scale=board]').first();
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
} finally {await close();}
console.log(`board-r3-zone-navigation: ${checks} checks passed`);
