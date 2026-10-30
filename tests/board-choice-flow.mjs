/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser,ROOT} from './uat/browser-runner.mjs';
import {loadCardIndex} from '../game/tools/engine-cards.mjs';
import {runScenario} from '../game/engine/cards/scenario.mjs';
import {legalActions,applyAction} from '../game/engine/rules/actions.mjs';
import {awaitingChoice,resolveAwaiting} from '../game/engine/rules/turn.mjs';
import {describeDecision} from '../game/room/decision.mjs';
import {projectFor} from '../game/engine/projection.mjs';
const {browser,base,stub,close}=await openBrowser({name:'board-choice-flow',flag:'GEOMETRY_REQUIRED'});
const catalog=loadCardIndex();
const sample=JSON.parse(readFileSync(path.join(ROOT,'docs/reference/replit-sample-views.json'),'utf8')).views[13];
const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('</head>','<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(c,m)=>{assert.ok(c,m);checks++;};
const fixtures={'Grizzly Bears':{types:['Creature'],power:2,toughness:2,manaCost:'{2}'}};
function game(){return runScenario({name:'Browser Vigorbloom',pooledTaps:true,xTaps:true,setup:[
 {seat:0,zone:'hand',cards:['Vigorbloom Charm']},
 {seat:0,zone:'battlefield',cards:['Forest','Forest','Plains','Sunpetal Grove','Grizzly Bears','Llanowar Elves']},
 {seat:1,zone:'battlefield',cards:['Grizzly Bears','Llanowar Elves']}],steps:[]},catalog.definition,fixtures).state;}
function viewed(state,revision=1){
 const v=structuredClone(sample);v.revision=revision;v.seat=0;v.state=projectFor(state,0);v.status='playing';
 const actions=state.awaiting?null:legalActions(state,0);
 const choice=awaitingChoice(state) || {id:`priority:${revision}`,kind:'priority',mode:'one',min:1,max:1,options:actions.map((a,index)=>({index,label:a.label || a.kind,cardId:a.objectId,act:a.kind}))};
 v.decision=describeDecision(state,choice,actions,v.state);return {v,actions};
}
async function open(v,mode,width,height){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(mode=>{localStorage.setItem('cm-board-view',mode);localStorage.setItem('crankmagic-audio-muted','true');},mode);
 const page=await context.newPage();page.setDefaultTimeout(15000);if(stub)await stub(page);
 if(process.env.UAT_ART_DIR)await page.route('**://api.scryfall.com/cards/named*',r=>{const u=new URL(r.request().url());if(u.searchParams.get('format')!=='image')return r.fallback();const name=u.searchParams.get('exact');try{return r.fulfill({contentType:'image/jpeg',body:readFileSync(path.join(process.env.UAT_ART_DIR,name+'.jpg'))});}catch{return r.fallback();}});const errors=[],sent=[];let socket;
 if(process.env.UAT_ART_DIR){
  const records=JSON.parse(readFileSync(path.join(ROOT,'data/cards.json'),'utf8')).cards;
  await page.route('**://cards.scryfall.io/**',r=>{const id=new URL(r.request().url()).pathname.split('/').at(-1).split('.')[0];const card=records.find(c=>c.image?.includes(id));try{return r.fulfill({contentType:'image/jpeg',body:readFileSync(path.join(process.env.UAT_ART_DIR,card.name+'.jpg'))});}catch{return r.fallback();}});
 }
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:'text/html',body:html}));
 await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:'rob@example.com'}}));
 await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
 const table={tableId:'layered01',phase:'playing',matchId:v.matchId,away:[],blockers:[],youAreHost:true,rules:{},seats:v.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===0?'human':'ai',you:p.playerId===0,occupied:true,ready:true,mat:'felt'}))};
 await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
 await page.routeWebSocket(/\/api\/tables\/layered01\/connect$/,s=>{socket=s;s.onMessage(m=>sent.push(JSON.parse(m)));s.send(JSON.stringify({type:'view',view:v}));});
 await page.goto(`${base}/index.html#table?id=layered01`);await page.locator('#cm-board').waitFor();
 return {page,context,errors,sent,feed:next=>socket.send(JSON.stringify({type:'view',view:next}))};
}
const shot=async(page,name)=>{if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.mouse.move(3,3);await page.screenshot({path:path.join(process.env.UAT_SHOTS,name+'.png')});}};
const exclusive=async page=>{eq(await page.locator('#cm-decision-slot #cm-board-decision').count(),1,'one popup decision');eq(await page.locator('.cm-stage-module[data-module=actions]').count(),0,'drawer Actions module absent throughout sequence');};
try{
 for(const [mode,width,height] of [['table',1280,720],['full',1920,1080],['focus',390,844]]){
  const state=game(),{v,actions}=viewed(state),cardId=v.decision.options.find(o=>o.act==='cast').cardId;
  const {page,context,errors,sent,feed}=await open(v,mode,width,height);
  // Hover previews also use the live region; record announcements rather than sampling after one overwrites it.
  await page.evaluate(()=>{globalThis.__flowAnnouncements=[];new MutationObserver(()=>__flowAnnouncements.push(document.querySelector('#cm-board-said').textContent)).observe(document.querySelector('#cm-board-said'),{childList:true,subtree:true,characterData:true});});
  await page.locator(`[data-action=board-choose][data-card="${cardId}"]`).first().click();
  await exclusive(page);
  const buttons=page.locator('[data-action=board-flow-choice]');
  eq(await buttons.count(),3,'exactly three modes, not target/payment products');
  ok(!(await buttons.allTextContents()).some(x=>/Forest|Sunpetal/.test(x)),'mana not shown at mode step');
  const announcements=await page.evaluate(()=>__flowAnnouncements);
  ok(announcements.some(text=>text.includes('fights')&&!/Forest|Sunpetal/.test(text)),`screen reader hears the current mode layer only: ${JSON.stringify(announcements)}`);
  await shot(page,`vigorbloom-modes-${mode}-${width}`);
  await buttons.filter({hasText:'fights'}).click();
  eq(await buttons.count(),2,'fight first asks which of your two creatures');
  await shot(page,`vigorbloom-target-${mode}-${width}`);
  await buttons.first().click();
  eq(await buttons.count(),2,'then asks which opposing creature');
  await buttons.first().click();
  eq(await sent.filter(s=>s.type==='act').length,0,'no action before confirmation');
  await page.locator('[data-action=board-flow-back]').click();eq(await buttons.count(),2,'Back restores opposing targets');
  await buttons.last().click();
  await page.locator('[data-action=board-flow-confirm]').click();
  await page.waitForFunction(()=>document.querySelector('[data-action=board-flow-confirm]')?.disabled===true);
  const first=sent.find(s=>s.type==='act');ok(first,'confirm sends action');
  const chosen=actions[first.indices[0]];eq(chosen.modes,[2],'original engine fight mode selected');
  applyAction(state,0,chosen);
  const next=viewed(state,2);eq(next.v.decision.cost,'mana','engine asks payment next');feed(next.v);
  await page.waitForFunction(()=>document.querySelector('#cm-board-decision')?.dataset.choiceId?.startsWith('choose-cost:'));
  await exclusive(page);
  await shot(page,`vigorbloom-mana-${mode}-${width}`);
  let guard=0;while(await buttons.count()){ok(++guard<20,'finite mana sequence');await buttons.first().click();}
  const confirm=page.locator('[data-action=board-flow-confirm]');await confirm.scrollIntoViewIfNeeded();
  const bounds=await confirm.boundingBox();ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width && bounds.y+bounds.height<=height,'confirmation fits viewport');
  eq(await page.locator('.cm-choice-review [data-kind=mana]').count(),0,'mana sources are not repeated as a Pay total');
  await shot(page,`vigorbloom-confirm-${mode}-${width}`);
  await confirm.click();
  await page.waitForTimeout(40);
  const second=sent.filter(s=>s.type==='act')[1];ok(second,'payment confirmation sends one answer');
  resolveAwaiting(state,second.indices);
  eq(state.stack.at(-1)?.name,'Vigorbloom Charm','engine accepts selected payment and puts spell on stack');
  const draw=viewed(state,3).v;draw.decision={id:'draw:3',kind:'draw',title:'Draw a card',mode:'one',min:1,max:1,options:[{index:0,label:'Draw a card'}]};feed(draw);
  await page.locator('button[data-action=board-draw]:not(.cm-bcard)').waitFor().catch(async error=>{console.log('DRAW DEBUG',mode,errors,await page.locator('#cm-board').innerText());await shot(page,'draw-debug-'+mode);throw error;});
  eq(await page.locator('.cm-required-popup').count(),0,'completed sequence clears popup before the draw step');
  await page.locator('button[data-action=board-draw]:not(.cm-bcard)').click();
  eq(errors,[],`${mode}: no browser errors`);
  await context.close();
 }
 // Cancel a proposed spell makes no request and restores only the optional drawer.
 {
  const {v}=viewed(game()),{page,context,sent}=await open(v,'table',1280,720);
  const id=v.decision.options.find(o=>o.act==='cast').cardId;
  await page.locator(`[data-action=board-choose][data-card="${id}"]`).first().click();
  await page.locator('[data-action=board-flow-cancel]').click();
  eq(sent.filter(s=>s.type==='act').length,0,'Cancel sends no action');
  eq(await page.locator('.cm-required-popup').count(),0,'Cancel closes unsubmitted sequence');
  eq(await page.locator('.cm-stage-module[data-module=actions]').count(),1,'optional drawer restored');
  await context.close();
 }
 // Required questions never return to the optional drawer, including Cancel and a sole legal answer.
 {
  const {v}=viewed(game());v.decision={id:'effect:sole',title:'Draw a card',mode:'one',min:1,max:1,options:[{index:7,label:'Draw a card'}]};
  const {page,context,sent,feed}=await open(v,'table',1280,720);
  await page.locator('[data-action=board-flow-confirm]').waitFor();await exclusive(page);
  await page.locator('[data-action=board-flow-cancel]').focus();await page.keyboard.press('Tab');
  eq(await page.locator('[data-action=board-flow-confirm]').evaluate(el=>el===document.activeElement),true,'Tab stays within required popup');
  eq(sent.filter(s=>s.type==='act').length,0,'sole answer awaits confirmation');
  await page.locator('[data-action=board-flow-cancel]').click();await exclusive(page);
  await page.locator('[data-action=board-flow-resume]').click();
  await page.locator('[data-action=board-flow-confirm]').click();await page.waitForTimeout(40);
  eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[7]],'sole answer uses original sparse index');
  const next=structuredClone(v);next.revision=3;next.decision={id:'choose-targets:optional',title:'Choose any number of creatures',mode:'many',min:0,max:2,options:[{index:0,label:'Grizzly Bears'},{index:1,label:'Llanowar Elves'}]};feed(next);
  await page.locator('[data-action=board-option]').first().waitFor();await exclusive(page);
  await page.locator('[data-action=board-confirm]').click();await page.waitForTimeout(40);
  eq(sent.filter(s=>s.type==='act').at(-1).indices,[],'zero remains a real choice for any number');
  await context.close();
 }
 // Attackers are chosen once each; their defenders appear only after choosing the creature.
 {
  const {v}=viewed(game()),creatures=v.state.players[0].zones.Battlefield.cards.filter(c=>c.types.includes('Creature'));
  v.state.players.push({...structuredClone(v.state.players[1]),playerId:2,name:'Third player'});
  v.decision={id:'declare-attackers:1',title:'Declare attackers',mode:'many',min:0,max:2,exclusiveBy:'cardId',options:creatures.flatMap((c,i)=>[1,2].map((id,j)=>({index:i*2+j,label:`${c.name} → ${id}`,cardId:c.cardId,defenderId:id})))};
  const {page,context,sent}=await open(v,'table',1280,720);
  await page.locator('[data-action=board-flow-attacker]').first().waitFor();await exclusive(page);
  eq(await page.locator('[data-action=board-flow-attacker]').count(),2,'one row per attacking creature');
  await page.locator('[data-action=board-flow-attacker]').first().click();
  eq(await page.locator('[data-action=board-flow-choice]').count(),2,'defenders are a separate conditional layer');
  await page.locator('[data-action=board-flow-choice]').first().click();await page.locator('[data-action=board-flow-confirm]').click();
  eq(sent.filter(s=>s.type==='act').length,0,'per-creature confirmation stays a draft');
  eq(await page.locator('[data-action=board-flow-attacker][aria-pressed=true]').count(),1,'assignment shown on creature');
  await shot(page,'attackers-table-1280');
  await page.locator('[data-action=board-confirm]').click();await page.waitForTimeout(40);
  eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[0]],'whole attack submits original indices once');
  await context.close();
 }
}finally{await close();}
console.log(`board-choice-flow: ${checks} checks passed`);
