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
try{
 for(const [mode,width,skin] of [['table',1440,'sapphire-obsidian'],['focus',1440,'sapphire-obsidian-light'],['full',1440,'bronze-basalt'],['focus',390,'sapphire-obsidian']]){
  const {page,context,errors,sent,posts}=await open(mode,width,skin);eq(await page.locator('[data-action=board-draft-cancel],[data-action=board-decline]').count(),0,`${mode}: mandatory question has no fake escape before a draft exists`);eq(await page.locator('.cm-target-controller>h3').allTextContents(),['Keith','Maya','You'],`${mode}: controllers grouped with You last`);
  eq(await page.locator('.cm-target-controller details').first().getAttribute('open'),null,`${mode}: Lands starts folded inside its owner`);
  await page.locator('[data-action=board-option][data-index="0"]').click();eq(await page.locator('[data-wf=W15]').count(),1,`${mode}: target stays in grouped picker until Next`);eq(sent.filter(s=>s.type==='act').length,0,`${mode}: Next remains a local step`);await page.evaluate(()=>__r4Confirm());eq(sent.filter(s=>s.type==='act').length,0,`${mode}: generic confirm cannot bypass local Next`);eq(await page.locator('[data-forward=true]').count(),1,`${mode}: picker has one logical forward action`);ok(!(await page.locator('[data-action=board-target-next]').getAttribute('class')).includes('primary'),`${mode}: compact Next does not pretend to be the binding primary`);await page.locator('[data-action=board-target-next]').click();eq(await page.locator('[data-wf=T04]').textContent(),"Destroy Keith's Smuggler's Copter?",`${mode}: one-target possessive task`);
  ok(await page.locator('[data-wf=desk-target-1-M03] .cm-bcard').isVisible(),`${mode}: affected card is large and visible`);
  const reviewGap=await page.evaluate(()=>document.querySelector('.cm-target-link').getBoundingClientRect().top-document.querySelector('.cm-steps').getBoundingClientRect().bottom);ok(reviewGap>=-1&&reviewGap<=64,`${mode}: no empty option spacer before target diagram (${Math.round(reviewGap)}px)`);
  eq(await primary(page),['Destroy'],`${mode}: target question has one primary`);eq(sent.filter(s=>s.type==='act').length,0,`${mode}: preview sends nothing`);eq(posts,[],`${mode}: picker and Next make no POST request`);
  await page.locator('[data-action=board-reset]').click();eq(await page.locator('[data-wf=W15]').count(),1,`${mode}: Change target restores grouped choices`);
  await page.locator('[data-action=board-option][data-index="0"]').click();await page.locator('[data-action=board-target-next]').click();await page.locator('[data-action=board-draft-cancel]').click();eq(await page.locator('#cm-board-decision').count(),1,`${mode}: Cancel clears only the unsent draft of mandatory question`);eq(await page.locator('[data-wf=W15]').count(),1,`${mode}: Cancel restores grouped choices`);eq(await page.locator('.cm-action-review').count(),0,`${mode}: Cancel removes the unsent review`);
  await page.locator('[data-action=board-option][data-index="0"]').click();await page.locator('[data-action=board-target-next]').click();
  const unreadable=await page.locator('.cm-pick strong,[data-wf=T04],.cm-target-arrow small,.cm-steps li,.cm-consequence').evaluateAll(es=>es.map(el=>{const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};let b=el;while(b && getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)')b=b.parentElement;const f=lum(getComputedStyle(el).color),bg=lum(getComputedStyle(b).backgroundColor);return {text:el.textContent,ratio:(Math.max(f,bg)+.05)/(Math.min(f,bg)+.05)};}).filter(r=>r.ratio<4.5));
  eq(unreadable,[],`${mode}/${skin}: actual decision text has readable contrast`);
  if(width<500) {
    const heading=page.locator('[data-wf=T04]');await heading.scrollIntoViewIfNeeded();const r=await heading.boundingBox(),drawer=await page.locator('#cm-actions-drawer').boundingBox();
    ok(r.y>=drawer.y-1 && r.y+r.height<=drawer.y+drawer.height+1,'phone question remains fully scroll-reachable');
    if(process.env.UAT_SHOTS)await page.screenshot({path:path.join(process.env.UAT_SHOTS,'r4-desk-W01-phone-question.png')});
  }
  const button=page.locator('[data-wf=C02]');await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();ok(box.y>=0&&box.y+box.height<=(width<500?794:900),`${mode}/${width}: binding press reachable (${JSON.stringify(box)})`);
  if(width<500)ok(await button.evaluate(el=>{const r=el.getBoundingClientRect();return [r.y+r.height/2,r.bottom-2].every(y=>el.contains(document.elementFromPoint(r.x+r.width/2,y)));}), 'phone binding action is not covered by the drawer tabs');
  if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.mouse.move(3,3);await page.waitForTimeout(360);await page.screenshot({path:path.join(process.env.UAT_SHOTS,`r4-desk-W01-${mode}-${width}.png`)});}
  await button.click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[0]],`${mode}: one verb press sends exact legal index once`);
  eq(errors,[],`${mode}: no page errors`);await context.close();
 }
 {
  const {page,context,sent}=await open('focus',1440,'sapphire-obsidian',fixture(true));await page.locator('[data-action=board-option][data-index="0"]').click();await page.locator('[data-action=board-target-next]').click();eq(await page.locator('[data-action=board-decline]').textContent(),"Don't destroy",'may choice uses explicit decline words');await page.locator('[data-action=board-decline]').click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[4]],'decline uses existing legal no-effect index');await context.close();
 }
 {
  const v=fixture();v.state.players[1].zones.Battlefield.cards.push(...[9006,9007,9008,9009].map((id,i)=>art(id,['Clock','Mirror','Map','Signet'][i],1)));v.decision={id:'priority:multi',title:'Your priority',kind:'priority',mode:'one',min:1,max:1,options:[{index:0,act:'pass',label:'Pass priority'},{index:1,act:'activate',label:'Reclamation Sage',cardId:9001,targetGroups:[{index:0,effect:'Destroy',targets:[9002,9006,9007,9008,9009].map(id=>({kind:'object',id,controllerId:1}))},{index:1,effect:'Tap',targets:[{kind:'object',id:9003,controllerId:2}]},{index:2,effect:'Exile',targets:[{kind:'object',id:9004,controllerId:0}]}]}]};
  const {page,context}=await open('focus',1440,'sapphire-obsidian',v);await page.locator('[data-action=board-option][data-index="1"]').click();eq(await page.locator('.cm-target-quadrant').count(),3,'three effects keep three quadrants');eq(await page.locator('.cm-target-source').count(),1,'three-effect source occupies its own centered region');const stack=page.locator('[data-action=board-target-cycle]').first();eq(await stack.locator('.cm-target-layer').count(),4,'five-target stack paints at most four layers');await stack.click();eq(await page.locator('.cm-target-stack img').first().getAttribute('alt'),'Clock','cycling changes actual top card');ok((await page.locator('.cm-target-quadrant p').first().textContent()).includes('2 of 5'),'click cycles visible top');await page.keyboard.press('Enter');ok((await page.locator('.cm-target-quadrant p').first().textContent()).includes('3 of 5'),'Enter cycles visible top');await page.keyboard.press('Space');ok((await page.locator('.cm-target-quadrant p').first().textContent()).includes('4 of 5'),'Space cycles visible top');eq(await stack.locator('img').evaluate(e=>getComputedStyle(e).animationName),'none','reduced motion cycles instantly');eq((await primary(page)).length,1,'multi-target review has one actual primary');await context.close();
 }

 {
  const v=fixture();Object.assign(v.state.players[0].zones.Battlefield.cards.find(c=>c.cardId===9004),{name:'Seachrome Coast',types:['Land']});v.decision={id:'priority:single',title:'Your priority',kind:'priority',mode:'one',min:1,max:1,options:[{index:0,act:'pass',label:'Pass priority'},{index:1,act:'play-land',label:'Seachrome Coast',cardId:9004}]};
  for(const skin of ['sapphire-obsidian','sapphire-obsidian-light']) {
   const {page,context,sent}=await open('full',1440,skin,v);
   const colors=await page.locator('.cm-stage-actions .v-button.primary').evaluate(el=>{const s=getComputedStyle(el);const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const f=lum(s.color),b=lum(s.backgroundColor);return {fg:s.color,bg:s.backgroundColor,ratio:(Math.max(f,b)+.05)/(Math.min(f,b)+.05)};});
   ok(colors.ratio>=4.5,`${skin}: actual Full priority action contrast ${colors.ratio.toFixed(2)} (${colors.fg}/${colors.bg})`);
   await page.locator('[data-action=board-option][data-index="1"]').click();eq(await page.locator('#cm-board-decision .cm-board-options').count(),0,'single action has no option row');
   eq(await primary(page),['Play Seachrome Coast'],'single action names the card it plays on its binding press (Rob, 2026-10-27: "Play Island")');
   eq(await page.locator('#cm-board-decision[data-wf="W14"]').evaluate(el=>({name:el.querySelector('h2')?.textContent.trim(),images:el.querySelectorAll('.cm-bcard').length,buttons:[...el.querySelectorAll('.cm-decide-actions button')].map(b=>b.textContent.trim()),target:/target/i.test(el.textContent),pick:el.querySelectorAll('.cm-pick').length})),{name:'Seachrome Coast',images:1,buttons:['Play Seachrome Coast','Cancel'],target:false,pick:0},'a land: its name once, its image once, Play and Cancel, and no target or second picture');await page.locator('[data-action=board-direct]').evaluate(el=>el.dataset.revision='998');await page.locator('[data-action=board-direct]').click();eq(sent.filter(s=>s.type==='act').length,0,'stale binding revision sends nothing');await page.locator('[data-action=board-direct]').evaluate(el=>el.dataset.revision='999');await page.locator('[data-action=board-direct]').click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[1]],'single action sends actual index directly');await context.close();
  }
 }

 {
  const v=fixture();Object.assign(v.state.players[0].zones.Battlefield.cards.find(c=>c.cardId===9001),{name:'Studious First-Year',preparedSpell:{cardId:9011,name:'Rampant Growth',manaCost:'{1}{G}'}});v.state.players[0].zones.Exile.cards.push(art(9011,'Rampant Growth',0,['Sorcery']));
  v.decision={id:'priority:prepared',title:'Your priority',kind:'priority',mode:'one',min:1,max:1,options:[{index:0,act:'pass',label:'Pass priority'},{index:1,act:'cast',label:'Rampant Growth',cardId:9011,preparedFrom:9001}]};
  const {page,context,sent}=await open('focus',1440,'sapphire-obsidian',v);const creature=page.locator('.cm-bcard[data-card="9001"]').first();await creature.focus();await page.keyboard.press('Shift+F10');
  eq(await page.locator('#cm-card-menu [data-index="1"]').count(),1,'prepared creature menu includes separate inset cast offer');await page.locator('#cm-card-menu [data-index="1"]').click();eq(sent.filter(s=>s.type==='act').length,0,'prepared menu selection is still a private draft');await page.locator('[data-action=board-direct]').click();eq(sent.filter(s=>s.type==='act').map(s=>s.indices),[[1]],'prepared inset sends actual cast option index');await context.close();
 }

 {
  const {page,context}=await open('focus',390);await page.locator('[data-action=board-option][data-index="0"]').click();await page.locator('[data-action=board-target-next]').click();
  await page.locator('[data-action=board-camera]').click();await page.locator('.cm-stage-camera [data-play-hud]').evaluate(el=>{el.value='200';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await page.locator('[data-action=board-camera]').click();
  for(const selector of ['[data-wf=T04]','[data-wf=C02]','[data-action=board-draft-cancel]']){const e=page.locator(selector);await e.scrollIntoViewIfNeeded();const r=await e.boundingBox();ok(r.y>=0&&r.y+r.height<=794,`phone 200%: ${selector} wholly reachable`);}
  await context.close();
 }

 {
  const v=fixture();v.decision={id:'trigger-targets:combinations',sourceId:9001,title:'Choose two targets',mode:'one',min:1,max:1,options:[
   {index:0,label:'Copter and Sol Ring',cardId:9001,controllerId:0,targetGroups:[{index:0,effect:'Destroy',targets:[{kind:'object',id:9002,controllerId:1},{kind:'object',id:9003,controllerId:2}]}]},
   {index:1,label:'Copter and Your artifact',cardId:9001,controllerId:0,targetGroups:[{index:0,effect:'Destroy',targets:[{kind:'object',id:9002,controllerId:1},{kind:'object',id:9004,controllerId:0}]}]}]};
  const {page,context}=await open('focus',1440,'sapphire-obsidian',v);
  const labels=await page.locator('#cm-board-decision [data-action=board-option]').evaluateAll(es=>es.map(el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()));
  eq(labels,['Copter and Sol Ring','Copter and Your artifact'],'different trigger target combinations retain their visible wording rather than source name');
  await context.close();
 }
}finally{await close();}
console.log(`board-r4-decisions: ${checks} checks passed`);
