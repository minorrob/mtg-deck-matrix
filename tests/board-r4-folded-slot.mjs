/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser,ROOT} from './uat/browser-runner.mjs';
const {browser,base,stub,close}=await openBrowser({name:'board-r4-folded-slot',flag:'GEOMETRY_REQUIRED'});
const sample=JSON.parse(readFileSync(path.join(ROOT,'docs/reference/replit-sample-views.json'),'utf8')).views[13];
const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('</head>','<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(c,m)=>{assert.ok(c,m);checks++;};
const art=(id,name,controller,types=['Artifact'])=>({cardId:id,name,owner:controller,controller,types,faceDown:false,tapped:false,counters:{},power:null,toughness:null,keywords:[]});
function fixture(optional=false){const v=structuredClone(sample);v.revision=999;v.state.players[1].name='Keith';v.state.players[2].name='Maya';
 v.state.players[0].zones.Battlefield.cards.push(art(9001,'Reclamation Sage',0,['Creature']),art(9004,'Your artifact',0));
 v.state.players[1].zones.Battlefield.cards.push(art(9002,"Smuggler's Copter",1),art(9005,'Forest',1,['Land']));v.state.players[2].zones.Battlefield.cards.push(art(9003,'Sol Ring',2));
 v.decision={id:'trigger-targets:9001',sourceId:9001,title:'Reclamation Sage: choose one target',mode:'one',min:1,max:1,optional,options:[{index:0,label:"Smuggler's Copter (Keith's)",cardId:9002,affected:9002,controllerId:1,effect:'Destroy',target:{kind:'object',id:9002}},{index:1,label:"Sol Ring (Maya's)",cardId:9003,affected:9003,controllerId:2,effect:'Destroy',target:{kind:'object',id:9003}},{index:2,label:'Your artifact',cardId:9004,affected:9004,controllerId:0,effect:'Destroy',target:{kind:'object',id:9004}},{index:3,label:'Forest',cardId:9005,affected:9005,controllerId:1,effect:'Destroy',target:{kind:'object',id:9005}}]};
 if(optional)v.decision.options.push({index:4,label:'Do not destroy',decline:true,optional:true});return v;}
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
async function hit(page,el,label,width){await el.scrollIntoViewIfNeeded();const box=await el.boundingBox();ok(box.y>=0&&box.y+box.height<=(width<500?794:900),`${label}: full control above viewport/tab boundary ${JSON.stringify(box)}`);const misses=await el.evaluate(el=>{const r=el.getBoundingClientRect();return [[.15,.2],[.5,.5],[.85,.8]].flatMap(([x,y])=>{const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return el.contains(hit)?[]:[{point:[r.x+r.width*x,r.y+r.height*y],hit:hit?.outerHTML.slice(0,180)}];});});ok(misses.length===0,`${label}: actual three-point pointer hit ${JSON.stringify({box,misses})}`);}
async function fold(page,kind){if(kind==='module'){const button=page.locator('.cm-stage-module[data-module=actions] [data-action=board-actions-toggle]');if(await button.getAttribute('aria-expanded')==='true')await button.click();}else{const button=page.locator('[data-action=board-stage-rail]');if(await button.getAttribute('aria-expanded')==='true')await button.click();}}
try{
 for(const [mode,width] of [['table',1440],['focus',1440],['full',1440],['focus',390]])for(const hud of [100,200])for(const kind of ['drawer','module']){
  if(process.env.SLOT_CASE && process.env.SLOT_CASE!==`${mode}-${width}-${hud}-${kind}`)continue;
  const {page,context,sent,errors}=await open(mode,width,mode==='focus'?'bronze-basalt-light':mode==='full'?'chalk-coal':'sapphire-obsidian');const label=`${mode}/${width}/${hud}/${kind}`;
  if(hud===200){await page.locator('[data-action=board-camera]').click();await page.locator('[data-play-hud]').evaluate(el=>{el.value='200';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('[data-action=board-camera]').click();}
  if(width<500)await page.waitForFunction(()=>{const n=document.getElementById('cm-notice');return !n||n.hidden||!n.textContent.includes('Saved view preferences');},null,{timeout:10000});
  await page.locator('[data-action=board-option][data-index="0"]').click();await page.locator('[data-action=board-target-next]').click();await fold(page,kind);
  eq(await page.locator('#cm-decision-slot [data-wf=T04]').textContent(),"Destroy Keith's Smuggler's Copter?",`${label}: exact selected target remains in folded slot`);eq(await page.locator('#cm-actions-drawer #cm-board-decision').count(),0,`${label}: decision has one rendered host`);
  if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.locator('#cm-decision-slot [data-wf=T04]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.UAT_SHOTS,`r4-slot-${mode}-${width}-${hud}-${kind}-question.png`)});}
  await hit(page,page.locator('#cm-decision-slot [data-wf=C02]'),`${label}/bind`,width);await hit(page,page.locator('#cm-decision-slot [data-action=board-reset]'),`${label}/change target`,width);eq(sent.filter(s=>s.type==='act').length,0,`${label}: folding and scroll never submit`);
  await page.locator('#cm-decision-slot [data-action=board-reset]').click();eq(await page.locator('[data-wf=W15]').count(),1,`${label}: native way back returns actual target picker`);await hit(page,page.locator('[data-action=board-option][data-index="0"]'),`${label}/returned picker`,width);await page.locator('[data-action=board-option][data-index="0"]').click();await page.locator('[data-action=board-target-next]').click();await fold(page,kind);const bind=page.locator('#cm-decision-slot [data-wf=C02]');await hit(page,bind,`${label}/final bind`,width);
  if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`r4-slot-${mode}-${width}-${hud}-${kind}.png`)});}await bind.click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[0]],`${label}: one native binding press sends exact offered target once`);eq(errors,[],`${label}: no browser errors`);await context.close();
 }
}finally{await close();}
console.log(`board-r4-folded-slot: ${checks} checks passed`);
