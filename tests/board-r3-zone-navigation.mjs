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
  await page.locator("#cm-board[data-view]").waitFor({timeout: 20000});
  await page.waitForTimeout(300);
  const show = async (view) => {sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(350);};
  const acts = () => sent.filter((x) => x.type === "act").map((x) => x.indices);
  return {page, context, errors, sent, acts, show};
}

try {
 for (const [mode,width,height] of [['focus',1280,720],['table',1280,720],['full',1280,720],['focus',390,844]]) {
  const {page,context,errors,acts,show}=await board(mode,{width,height});
  const v=structuredClone(sample);v.revision+=100;
  for(const player of v.state.players){
   player.zones.Battlefield.cards=Array.from({length:100},(_,i)=>({cardId:10000+player.playerId*1000+i,name:i<20?'Grizzly Bears':i<40?'Sol Ring':'Island',types:[i<20?'Creature':i<40?'Artifact':'Land'],owner:player.playerId,controller:player.playerId,tapped:false,counters:{},token:false,...(i<20?{power:2,toughness:2}:{})}));player.zones.Battlefield.count=100;
  }
  await show(v);
  const key=`${v.seat}:lands`,land=page.locator(`[data-zone-scroll="${key}"]`).first();
  await land.waitFor({timeout:3000});
  ok(await land.evaluate(el=>el.scrollWidth>el.clientWidth+10),`${mode}/${width}: crowded lands overflow at normal size`);
  const before=acts().length;
  await land.focus();await page.keyboard.press('Home');
  await land.hover();await page.mouse.wheel(0,450);await page.waitForTimeout(100);
  ok(await land.evaluate(el=>el.scrollLeft>0),`${mode}/${width}: wheel reaches later lands`);
  const others=await page.locator('[data-zone-scroll]').evaluateAll(els=>els.filter(e=>!e.dataset.zoneScroll.endsWith(':lands')).map(e=>e.scrollLeft));
  ok(others.every(x=>x===0),'land navigation leaves other zones alone');
  await land.focus();await page.keyboard.press('End');
  ok(await land.evaluate(el=>Math.abs(el.scrollLeft-(el.scrollWidth-el.clientWidth))<2),'End reaches last land');
  const pos=await land.evaluate(el=>el.scrollLeft);await show({...v,revision:v.revision+1});
  ok(Math.abs(await land.evaluate(el=>el.scrollLeft)-pos)<2,'incoming revision preserves the zone position');
  if(width>800){
   for(const target of [mode==='table'?'focus':'table',mode]){await page.locator('[data-action=board-camera]').click();await page.locator(`[data-action=board-view][data-view="${target}"]`).click();await page.waitForTimeout(100);}
   ok(Math.abs(await land.evaluate(el=>el.scrollLeft)-pos)<2,'returning to a view restores its own zone position');
  }
  ok(await land.evaluate(el=>{const last=el.querySelector('[data-card-section]')?.lastElementChild||el.lastElementChild;const a=el.getBoundingClientRect(),b=last.getBoundingClientRect();return b.right>a.left&&b.left<a.right;}),'last card is horizontally reachable');

  await land.focus();await page.keyboard.press('Home');eq(await land.evaluate(el=>el.scrollLeft),0,'Home returns to first land');
  await page.keyboard.press('PageDown');ok(await land.evaluate(el=>el.scrollLeft>0),'PageDown explores the zone');
  eq(acts().length,before,'navigation never submits a game action');
  eq(await land.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none','no visible scrollbar');
  await land.focus();await page.keyboard.press('End');
  // Find real blank space, so the drag cannot begin on a card or a control.
  const blank=await land.evaluate(el=>{const b=el.getBoundingClientRect();for(let y=b.top+2;y<b.bottom-2;y+=4)for(let x=b.left+12;x<b.right-12;x+=12){const hit=document.elementFromPoint(x,y);if(hit&&el.contains(hit)&&!hit.closest('button,a,input,select,textarea,[role=button]'))return{x,y};}return null;});
  if(blank){await page.mouse.move(blank.x,blank.y);await page.mouse.down();await page.mouse.move(blank.x+80,blank.y,{steps:8});await page.mouse.up();ok(await land.evaluate(el=>el.scrollLeft)<pos-10,'blank-space drag scrolls the zone');}
  else throw Error(`${mode}/${width}: no reachable blank space for drag`);
  eq(acts().length,before,'drag does not act');eq(errors,[],'no browser errors');
  mkdirSync(path.join(ROOT,'work/r3-zone-proof'),{recursive:true});await page.screenshot({path:path.join(ROOT,`work/r3-zone-proof/${mode}-${width}.png`)});
  await context.close();
 }
} finally {await close();}
console.log(`board-r3-zone-navigation: ${checks} checks passed`);
