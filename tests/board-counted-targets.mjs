/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* A COUNTED TARGET'S CONFIRM (Rob, 2026-10-28): Sword of Hearth and Home's "exile up to one target creature you own" showed "1 chosen"
 * and a Confirm that did nothing. A single target is reviewed (Next) before it is sent; a counted one (mode many, "up to one",
 * "any number") has no review, so its Confirm sends what is picked -- one, several, or none when none is allowed. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser,ROOT} from './uat/browser-runner.mjs';
const {browser,base,stub,close}=await openBrowser({name:'board-r4-decisions',flag:'GEOMETRY_REQUIRED'});
const sample=JSON.parse(readFileSync(path.join(ROOT,'docs/reference/replit-sample-views.json'),'utf8')).views[13];
const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('</head>','<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(c,m)=>{assert.ok(c,m);checks++;};
const art=(id,name,controller,types=['Artifact'])=>({cardId:id,name,owner:controller,controller,types,faceDown:false,tapped:false,counters:{},power:null,toughness:null,keywords:[]});
async function open(mode,width,skin='sapphire-obsidian',v=fixture()){
 const context=await browser.newContext({viewport:{width,height:width<500?844:900},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(({mode,skin})=>{localStorage.setItem('cm-board-view',mode);localStorage.setItem('crankmagic-audio-muted','true');(globalThis.CrankFeatures||=[]).push(C=>{globalThis.__r4Commit=c=>C.commit(c);globalThis.__r4Confirm=()=>C.actions["board-confirm"]();});},{mode,skin});
 const page=await context.newPage();if(stub)await stub(page);const errors=[],sent=[],posts=[];let ws;
 page.on('pageerror',e=>errors.push(e.message));await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:'text/html',body:html}));await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:'rob@example.com'}}));await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
 const table={tableId:'r4desk01',phase:'playing',matchId:v.matchId,away:[],blockers:[],youAreHost:true,rules:{},seats:v.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===v.seat?'human':'ai',you:p.playerId===v.seat,occupied:true,ready:true,mat:'felt'}))};
 await page.route(`${base}/api/tables**`,r=>{if(r.request().method()==='POST')posts.push(new URL(r.request().url()).pathname);return r.fulfill({json:{table,now:Date.now()}});});await page.routeWebSocket(/\/api\/tables\/r4desk01\/connect$/,s=>{ws=s;s.onMessage(m=>sent.push(JSON.parse(m)));s.send(JSON.stringify({type:'view',view:v}));});
 await page.goto(`${base}/index.html#table?id=r4desk01`);await page.locator('#cm-board-decision').waitFor();if(skin!=='sapphire-obsidian')await page.evaluate(t=>__r4Commit({type:'preferences',values:{theme:t}}),skin);
 return {page,context,errors,sent,posts,feed:next=>ws.send(JSON.stringify({type:'view',view:next}))};}
const primary=page=>page.locator('#cm-board .v-button.primary:not([disabled]),#cm-board .cm-btn--primary:not([disabled])').evaluateAll(es=>es.filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden').map(e=>e.textContent.trim()));

function counted(){const v=structuredClone(sample);v.revision=999;
 v.state.players[0].zones.Battlefield.cards.push(art(9001,'Bear',0,['Creature']),art(9002,'Elvish Visionary',0,['Creature']));
 v.decision={id:'choose-targets:2:0',sourceId:9001,title:'Sword of Hearth and Home: choose up to one target',mode:'many',min:0,max:1,options:[
  {index:0,label:'Bear',cardId:9001,affected:9001,controllerId:0,effect:'Exile',target:{kind:'object',id:9001}},
  {index:1,label:'Elvish Visionary',cardId:9002,affected:9002,controllerId:0,effect:'Exile',target:{kind:'object',id:9002}}]};return v;}
const acts=sent=>sent.filter(s=>s.type==='act');
try{
 {
  const {page,context,sent}=await open('focus',1440,'sapphire-obsidian',counted());
  await page.locator('[data-action=board-option][data-index="1"]').click();
  ok(/1 chosen/.test(await page.locator('#cm-board-decision').innerText()),'one creature is chosen');
  eq(await page.locator('[data-action=board-confirm]:not([disabled])').count(),1,'Confirm is enabled');
  await page.locator('[data-action=board-confirm]').click();await page.waitForTimeout(300);
  eq(acts(sent).length,1,'Confirm sends the answer');eq(JSON.stringify(acts(sent)[0]).includes('[1]'),true,'it is the creature that was picked');
  await context.close();
 }
 {
  const {page,context,sent}=await open('focus',1440,'sapphire-obsidian',counted());
  await page.locator('[data-action=board-confirm]').click();await page.waitForTimeout(300);
  eq(acts(sent).length,1,'with "up to one", choosing none and pressing Confirm sends the answer');eq(JSON.stringify(acts(sent)[0]).includes('[]'),true,'an empty answer');
  await context.close();
 }
}finally{await close();}
console.log(`board-counted-targets: ${checks} checks passed`);
