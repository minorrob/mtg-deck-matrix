/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser,ROOT} from './uat/browser-runner.mjs';
const {browser,base,stub,close}=await openBrowser({name:'board-r4-decisions',flag:'GEOMETRY_REQUIRED'});
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
// R4 safety and visual acceptance retained against the new conditional popup, rather than its retired drawer layout.
const choose=(p,index)=>p.locator(`[data-action=board-flow-choice][data-indices~="${index}"]`).click();
const confirm='[data-action=board-flow-confirm]';
try{
 for(const [mode,width,skin] of [['table',1440,'sapphire-obsidian'],['focus',1440,'sapphire-obsidian-light'],['full',1440,'bronze-basalt'],['focus',390,'sapphire-obsidian']]){
  const {page,context,errors,sent,posts}=await open(mode,width,skin);
  eq(await page.locator('.cm-required-popup').count(),1,`${mode}: mandatory target question owns one popup`);
  eq(await page.locator('.cm-stage-module[data-module=actions]').count(),0,`${mode}: no duplicate Actions drawer`);
  eq(await page.locator('.cm-flow-lands').getAttribute('open'),null,`${mode}: lands remain folded after other targets`);
  ok((await page.locator('[data-action=board-flow-choice]').allTextContents()).some(t=>t.includes('Keith')),`${mode}: targets identify their controller`);
  await page.evaluate(()=>__r4Confirm());eq(sent.filter(s=>s.type==='act').length,0,`${mode}: generic Confirm cannot bypass an incomplete flow`);
  await choose(page,0);
  eq(sent.filter(s=>s.type==='act').length,0,`${mode}: selection is only a draft`);
  eq(await primary(page),['Confirm'],`${mode}: exactly one binding primary`);
  ok((await page.locator('.cm-choice-review').textContent()).includes("Smuggler's Copter"),`${mode}: review names the target`);
  ok(await page.locator('.cm-choice-review .cm-flow-thumb').isVisible(),`${mode}: review pictures the target`);
  await page.locator('.cm-flow-inspect').click();await page.locator('#cm-dialog[open]').waitFor();
  ok((await page.locator('#cm-dialog').textContent()).includes('Reclamation Sage'),`${mode}: source is one press from inspection`);
  await page.locator('#cm-dialog [data-action=close]').last().click();
  await page.locator('[data-action=board-flow-back]').click();eq(await page.locator(confirm).count(),0,`${mode}: Back restores conditional choices`);
  await choose(page,0);await page.locator('[data-action=board-flow-cancel]').click();
  eq(await page.locator('.cm-required-popup').count(),1,`${mode}: Cancel cannot skip a required game question`);
  eq(await page.locator('.cm-stage-module[data-module=actions]').count(),0,`${mode}: Cancel does not move to drawer`);
  await page.locator('[data-action=board-flow-resume]').click();await choose(page,0);
  const unreadable=await page.locator('.cm-choice-flow h2,.cm-choice-review li>span').evaluateAll(es=>es.map(el=>{const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};let b=el;while(b && getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)')b=b.parentElement;const f=lum(getComputedStyle(el).color),bg=lum(getComputedStyle(b).backgroundColor);return {text:el.textContent,ratio:(Math.max(f,bg)+.05)/(Math.min(f,bg)+.05)};}).filter(r=>r.ratio<4.5));
  eq(unreadable,[],`${mode}/${skin}: decision text has readable contrast`);
  const button=page.locator(confirm);await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();ok(box.y>=0&&box.y+box.height<=(width<500?844:900),`${mode}: binding press fits viewport`);
  ok(await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`${mode}: pointer reaches binding press`);
  eq(posts,[],`${mode}: draft and inspection make no POST`);
  if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`r4-layered-${mode}-${width}.png`)});}
  await button.evaluate(el=>el.dataset.revision='998');await button.click();eq(sent.filter(s=>s.type==='act').length,0,`${mode}: stale element revision cannot submit`);
  await button.evaluate(el=>el.dataset.revision='999');await button.click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[0]],`${mode}: Confirm submits original target index once`);
  eq(errors,[],`${mode}: no browser errors`);await context.close();
 }
 {
  const {page,context,sent}=await open('focus',1440,'sapphire-obsidian',fixture(true));
  const decline=page.locator('[data-action=board-flow-choice]',{hasText:'Do not destroy'});
  eq(await decline.count(),1,'optional effect retains its explicit decline choice');await decline.click();await page.locator(confirm).click();
  eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[4]],'decline submits its original legal index');await context.close();
 }
 {
  const v=fixture();v.decision={id:'priority:single',title:'Your priority',kind:'priority',mode:'one',min:1,max:1,options:[{index:0,act:'pass',label:'Pass priority'},{index:1,act:'play-land',label:'Seachrome Coast',cardId:9004}]};
  Object.assign(v.state.players[0].zones.Battlefield.cards.find(c=>c.cardId===9004),{name:'Seachrome Coast',types:['Land']});
  for(const skin of ['sapphire-obsidian','sapphire-obsidian-light']){
   const {page,context,sent}=await open('full',1440,skin,v);await page.locator('[data-action=board-choose][data-card="9004"]').click();
   eq(await page.locator('[data-action=board-flow-choice]').count(),0,'sole legal action is auto-selected');
   eq(await page.locator('.cm-flow-card').count(),1,'single action has one source image');
   eq(await page.locator('.cm-choice-flow h2').textContent(),'Seachrome Coast','single action names its card');
   eq(sent.filter(s=>s.type==='act').length,0,'sole action still awaits confirmation');
   await page.locator(confirm).click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[1]],'sole action preserves its original index');await context.close();
  }
 }
 {
  const v=fixture();Object.assign(v.state.players[0].zones.Battlefield.cards.find(c=>c.cardId===9001),{name:'Studious First-Year',preparedSpell:{cardId:9011,name:'Rampant Growth',manaCost:'{1}{G}'}});v.state.players[0].zones.Exile.cards.push(art(9011,'Rampant Growth',0,['Sorcery']));
  v.decision={id:'priority:prepared',title:'Your priority',kind:'priority',mode:'one',min:1,max:1,options:[{index:0,act:'pass',label:'Pass priority'},{index:1,act:'cast',label:'Rampant Growth',cardId:9011,preparedFrom:9001}]};
  const {page,context,sent}=await open('focus',1440,'sapphire-obsidian',v);await page.locator('.cm-bcard[data-card="9001"]').first().focus();await page.keyboard.press('Shift+F10');
  eq(await page.locator('.cm-choice-flow h2').textContent(),'Rampant Growth','prepared creature opens its separate spell in the popup');
  eq(sent.filter(s=>s.type==='act').length,0,'prepared casting uses the same confirmation framework');await page.locator(confirm).click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[1]],'prepared cast preserves the legal index');await context.close();
 }
 {
  const v=fixture();v.decision={id:'trigger-targets:combinations',sourceId:9001,title:'Choose two targets',mode:'one',min:1,max:1,options:[
   {index:0,label:'Copter and Sol Ring',targetGroups:[{targets:[{kind:'object',id:9002,controllerId:1},{kind:'object',id:9003,controllerId:2}]}]},
   {index:1,label:'Copter and Your artifact',targetGroups:[{targets:[{kind:'object',id:9002,controllerId:1},{kind:'object',id:9004,controllerId:0}]}]}]};
  const {page,context,sent}=await open('focus',1440,'sapphire-obsidian',v);
  const labels=await page.locator('[data-action=board-flow-choice]').allTextContents();
  eq(labels.map(t=>t.trim()),['Sol Ring · Maya','Your artifact · You'],'common first target is automatic; only remaining distinct targets appear');
  await choose(page,1);ok((await page.locator('.cm-choice-review').textContent()).includes("Smuggler's Copter"),'automatic target remains visible in confirmation');
  await page.locator(confirm).click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[1]],'combination submits only the original legal combination');await context.close();
 }
 {
  const {page,context}=await open('focus',390);await choose(page,0);
  await page.locator('[data-action=board-camera]').click();await page.locator('.cm-stage-camera [data-play-hud]').evaluate(el=>{el.value='200';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('[data-action=board-camera]').click();
  for(const selector of ['.cm-choice-flow h2',confirm,'[data-action=board-flow-cancel]']){const e=page.locator(selector);await e.scrollIntoViewIfNeeded();const r=await e.boundingBox();ok(r.y>=0&&r.y+r.height<=844,`phone 200%: ${selector} wholly reachable`);}
  await context.close();
 }
}finally{await close();}
console.log(`board-r4-decisions: ${checks} checks passed`);
