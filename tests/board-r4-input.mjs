/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';import {readFileSync,mkdirSync} from 'node:fs';import path from 'node:path';import {openBrowser,ROOT} from './uat/browser-runner.mjs';
const {browser,base,stub,close}=await openBrowser({name:'board-r4-input',flag:'GEOMETRY_REQUIRED'});
const sample=JSON.parse(readFileSync(path.join(ROOT,'docs/reference/replit-sample-views.json'),'utf8')).views[13];
const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('</head>','<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(c,m)=>{assert.ok(c,m);checks++;};
const land=(id,tapped=false)=>({cardId:id,name:'Island',owner:0,controller:0,types:['Land'],keywords:[],faceDown:false,tapped,counters:{},power:null,toughness:null,damage:0,attachments:[]});
function fixture(){const v=structuredClone(sample);v.revision=8000;v.state.combat=null;v.state.phase='MAIN1';v.state.players[0].zones.Battlefield.cards=[land(9001)];v.decision={id:'priority:input',kind:'priority',mode:'one',min:1,max:1,title:'Your priority',options:[{index:0,act:'pass',label:'Pass priority'},{index:1,act:'activate-mana',label:'Island',cardId:9001,detail:'{U}'}]};return v;}
async function open(mode,width=1440,touch=false,v=fixture()){
 const context=await browser.newContext({viewport:{width,height:width<500?844:900},reducedMotion:'reduce',serviceWorkers:'block',hasTouch:touch,isMobile:touch});await context.addInitScript(mode=>{localStorage.setItem('cm-board-view',mode);localStorage.setItem('crankmagic-audio-muted','true');(globalThis.CrankFeatures||=[]).push(C=>{globalThis.__r4Act=(name,data)=>C.actions[name]({dataset:data});});},mode);
 const page=await context.newPage();if(stub)await stub(page);const sent=[],errors=[];let socket,current=v;
 page.on('pageerror',e=>errors.push(e.message));await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:'text/html',body:html}));await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:'input@example.com'}}));await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
 const table={tableId:'r4input01',phase:'playing',matchId:v.matchId,away:[],blockers:[],rules:{},seats:v.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===v.seat?'human':'ai',you:p.playerId===v.seat,occupied:true,ready:true,mat:'felt'}))};
 await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));await page.routeWebSocket(/\/api\/tables\/r4input01\/connect$/,s=>{socket=s;s.onMessage(m=>sent.push(JSON.parse(m)));s.send(JSON.stringify({type:'view',view:v}));});
 await page.goto(`${base}/index.html#table?id=r4input01`);await page.locator('.cm-mat [data-card="9001"]').first().waitFor();
 return {page,context,sent,errors,get current(){return current;},feed:async change=>{const next=structuredClone(current);change(next);next.revision++;current=next;socket.send(JSON.stringify({type:'receipt',receipt:{}}));socket.send(JSON.stringify({type:'view',view:next}));await page.waitForTimeout(100);}};
}
const card=id=>`.cm-mat[data-seat="0"] .cm-bcard[data-action="board-card"][data-card="${id}"]`;
try{
 for(const mode of ['table','focus','full']){
  const f=await open(mode),{page,context,sent,errors}=f;const island=page.locator(card(9001)).first();await island.evaluate(el=>globalThis.__originalCard=el);await island.click();
  ok(await page.locator('#cm-card-menu').isVisible(),`${mode}: single click opens readable card menu`);eq(sent.filter(s=>s.type==='act').length,0,`${mode}: single click sends nothing`);ok(await page.evaluate(()=>__originalCard.isConnected),`${mode}: opening menu preserves the actual first-click card node`);
  await page.keyboard.press('Escape');await island.dblclick();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[1]],`${mode}: native two-click sequence taps once`);
  await f.feed(v=>{v.state.players[0].zones.Battlefield.cards[0].tapped=true;v.state.players[0].mana=[{color:'U',amount:1}];v.decision.options[1]={index:1,act:'undo-mana',label:'Untap Island',cardId:9001};});
  await island.click();const oldMenu=await page.locator('#cm-card-menu [data-action=board-card-menu-do]').evaluate(el=>({...el.dataset}));await page.keyboard.press('Escape');await island.dblclick();eq(sent.filter(s=>s.type==='act').length,2,`${mode}: native double click untaps unspent mana exactly once`);
  await f.feed(v=>{v.state.players[0].zones.Battlefield.cards[0].tapped=true;v.state.players[0].mana=[];v.decision.options=[v.decision.options[0]];});
  await page.evaluate(data=>__r4Act('board-card-menu-do',data),oldMenu);await island.dblclick();eq(sent.filter(s=>s.type==='act').length,2,`${mode}: spent mana and stale untap menu cannot act`);
  await f.feed(v=>{v.state.players[0].zones.Battlefield.cards.push({...land(9002),name:'Plains',undoable:true});v.canUndo=true;v.undoablePlay={cardId:9002,name:'Island',kind:'land'};v.decision.options.push({index:1,act:'undo-play',label:'Undo Island',cardId:9002});});
  const slot=page.locator('.cm-card-slot[data-card-slot="9002"]').first(),height=await slot.evaluate(el=>el.offsetHeight);await page.mouse.move(2,2);ok(await slot.locator('[data-action=board-offered-undo]').evaluate(el=>getComputedStyle(el).opacity==='0'),`${mode}: Undo stays hidden before hover or focus`);await slot.hover();const undo=slot.locator('[data-action=board-offered-undo]');ok(await undo.evaluate(el=>getComputedStyle(el).opacity==='1'),`${mode}: hover reveals Undo`);eq(await slot.evaluate(el=>el.offsetHeight),height,`${mode}: Undo overlay changes no row height`);eq(await slot.locator('button button').count(),0,`${mode}: Undo is a sibling control`);
  const stale=await undo.evaluate(el=>({...el.dataset}));await f.feed(v=>{v.decision.options[1]={index:1,act:'cast',label:'Other spell',cardId:9999};v.canUndo=false;});await page.evaluate(data=>__r4Act('board-offered-undo',data),stale);eq(sent.filter(s=>s.type==='act').length,2,`${mode}: stale Undo index cannot cast another current option`);eq(await page.locator('[data-action=board-offered-undo]').count(),0,`${mode}: locked-in card has no Undo drawer`);
  await f.feed(v=>{v.decision.options[1]={index:1,act:'undo-play',label:'Undo Island',cardId:9002};v.canUndo=true;});await slot.hover();await slot.locator('[data-action=board-offered-undo]').click();eq(sent.filter(s=>s.type==='act').length,3,`${mode}: current offered Undo binds once`);
  if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`r4-input-${mode}.png`)});}
  eq(errors,[],`${mode}: no browser errors`);await context.close();
 }
 {
  const v=fixture();v.state.players[0].zones.Battlefield.cards[0].tapped=true;v.decision.options[1]={index:1,act:'undo-mana',label:'Untap Island',cardId:9001};const {page,context,sent}=await open('focus',390,true,v);
  await page.locator('[data-action=board-stage-rail]').tap();await page.locator(card(9001)).tap();ok(await page.locator('#cm-card-menu').isVisible(),'native phone tap exposes every offered action');await page.locator('#cm-card-menu [data-action=board-card-menu-do]').tap();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[1]],'phone uses legal untap menu without double-tap requirement');await context.close();
 }
}finally{await close();}
console.log(`board-r4-input: ${checks} checks passed`);
