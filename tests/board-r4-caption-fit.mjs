/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';import {readFileSync,mkdirSync} from 'node:fs';import path from 'node:path';import {openBrowser,ROOT} from './uat/browser-runner.mjs';import {tableClearance,phoneChromeContrast,cardBadgeBounds} from './uat/r4-play-clearance.mjs';
const {browser,base,stub,close}=await openBrowser({name:'board-r4-caption-fit',flag:'GEOMETRY_REQUIRED'});
const sample=JSON.parse(readFileSync(path.join(ROOT,'docs/reference/replit-sample-views.json'),'utf8')).views[13];
const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('</head>','<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok=(c,m)=>{assert.ok(c,m);checks++;};
const land=(id,tapped=false)=>({cardId:id,name:'Island',owner:0,controller:0,types:['Land'],keywords:[],faceDown:false,tapped,counters:{},power:null,toughness:null,damage:0,attachments:[]});
function fixture(seats=4){const v=structuredClone(sample);v.revision=8000;v.state.combat=null;v.state.phase='MAIN1';v.state.players[0].zones.Battlefield.cards=[land(9001)];v.decision={id:'priority:input',kind:'priority',mode:'one',min:1,max:1,title:'Your priority',options:[{index:0,act:'pass',label:'Pass priority'},{index:1,act:'activate-mana',label:'Island',cardId:9001,detail:'{U}'}]};v.state.players=v.state.players.slice(0,seats);v.seats=v.seats.slice(0,seats);return v;}
async function open(mode,width=1440,touch=false,v=fixture(),hud=100){
 const context=await browser.newContext({viewport:{width,height:width<500?844:900},reducedMotion:'reduce',serviceWorkers:'block',hasTouch:touch,isMobile:touch});await context.addInitScript(({mode,hud})=>{localStorage.setItem('cm-play-hud-scale',String(hud));localStorage.setItem('cm-board-view',mode);localStorage.setItem('crankmagic-audio-muted','true');(globalThis.CrankFeatures||=[]).push(C=>{globalThis.__r4Act=(name,data)=>C.actions[name]({dataset:data});});},{mode,hud});
 const page=await context.newPage();if(stub)await stub(page);const sent=[],errors=[];let socket,current=v;
 page.on('pageerror',e=>errors.push(e.message));await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:'text/html',body:html}));await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:'input@example.com'}}));await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
 const table={tableId:'r4input01',phase:'playing',matchId:v.matchId,away:[],blockers:[],rules:{},seats:v.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===v.seat?'human':'ai',you:p.playerId===v.seat,occupied:true,ready:true,mat:'felt'}))};
 await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));await page.routeWebSocket(/\/api\/tables\/r4input01\/connect$/,s=>{socket=s;s.onMessage(m=>sent.push(JSON.parse(m)));s.send(JSON.stringify({type:'view',view:v}));});
 await page.goto(`${base}/index.html#table?id=r4input01`);await page.locator('.cm-mat [data-card="9001"]').first().waitFor();
 return {page,context,sent,errors,get current(){return current;},feed:async change=>{const next=structuredClone(current);change(next);next.revision++;current=next;socket.send(JSON.stringify({type:'receipt',receipt:{}}));socket.send(JSON.stringify({type:'view',view:next}));await page.waitForTimeout(100);}};
}
const card=id=>`.cm-mat[data-seat="0"] .cm-bcard[data-action="board-card"][data-card="${id}"]`;
const roots='.cm-stage-top,.cm-mat-head,.cm-seat-header,.cm-mat-label,.cm-board-group>h3,.cm-board-chip,.cm-board-decision,.cm-board-hand-side,.cm-r4-combat,.cm-other-seats,.cm-stage-handle,.cm-bcard-pt,.cm-bcard-count,.cm-bcard-tax,.cm-land-count,.cm-undo-drawer,.cm-vitals-poison';
const failures=[];let scenarios=0;
try{
 for(const mode of ['table','focus','full'])for(const hud of [100,200])for(const width of [1440,390])for(const seats of mode==='table'&&width===1440?[2,3,4]:[4]) {
  if(process.env.CAPTION_CASE && process.env.CAPTION_CASE!==`${mode}-${width}-${hud}`)continue;
  scenarios++;
  const f=await open(mode,width,false,fixture(seats),hud),{page,context,errors}=f;
  await page.evaluate(choice=>__r4Act('set-theme',{themeChoice:choice}),mode==='focus'?'bronze-basalt-light':mode==='full'?'chalk-coal':'sapphire-obsidian');
  if(width<500)await page.locator('[data-action=board-stage-rail]').click();
  const problems=await page.evaluate(({roots,floor})=>[...document.querySelectorAll(`#cm-board ${roots.split(',').join(',#cm-board ')}`)].flatMap(root=>[root,...root.querySelectorAll('*')]).filter((el,i,all)=>all.indexOf(el)===i&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!el.closest('[hidden],[inert],.cm-sr-only,.cm-board-peek,.cm-bcard-name,.cm-coach-head,.cm-coach-questions,.cm-stage-camera,.cm-profile-avatar,.cm-seat-portrait')&&!(el.parentElement?.matches('.cm-stage-handle')&&el.tagName==='B')&&el.getClientRects().length&&getComputedStyle(el).visibility==='visible').map(el=>({text:el.textContent.trim().slice(0,70),size:parseFloat(getComputedStyle(el).fontSize),cls:el.className})).filter(x=>x.size<floor-.1),{roots,floor:15*hud/100});
  if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`r4-caption-${mode}-${width}-${hud}-s${seats}.png`)});}
  const clearance=await tableClearance(page);if(clearance.length)failures.push({case:`${mode}/${width}/${hud}/${seats}seats`,clearance});else checks++;
  const badgeClips=await cardBadgeBounds(page);if(badgeClips.length)failures.push({case:`${mode}/${width}/${hud}/${seats}seats`,badgeClips});else checks++;
  if(width<500){const contrast=await phoneChromeContrast(page);eq(contrast.filter(x=>x.ratio<x.minimum),[],`${mode}/${hud}: actual composited phone turn text and native icon strokes are readable`);eq(contrast.length,3,`${mode}/${hud}: every real phone chrome contrast target measured`);}
  if(mode==='table'&&width===1440){
   if(hud===200)ok(await page.locator('.cm-stage-top').evaluate(el=>{const children=[...el.children].filter(e=>e.getClientRects().length&&e.offsetWidth&&getComputedStyle(e).position!=='absolute');const centers=children.map(e=>{const r=e.getBoundingClientRect();return r.y+r.height/2;});return Math.max(...centers)-Math.min(...centers)<2;}),'1440/HUD200: every top-level HUD group remains on one line');
   eq(await page.locator('.cm-stage-self .cm-vitals>b').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),28*hud/100,`${hud}/${seats}: shared SeatHeader life retains its vital token`);
   const rows=await page.locator('.cm-board-table .cm-mat').evaluateAll(mats=>mats.flatMap(mat=>[...mat.querySelectorAll('.cm-board-field,.cm-board-lands')].flatMap(zone=>{const card=zone.querySelector('.cm-bcard'),label=zone.querySelector(':scope>.cm-mat-label');if(!card)return [];const z=zone.getBoundingClientRect(),r=card.getBoundingClientRect(),l=label.getBoundingClientRect();return r.bottom>z.bottom-2||r.top<l.bottom-1?[{seat:mat.dataset.seat,zone:zone.dataset.zone,card:{top:r.top,bottom:r.bottom},viewport:{top:z.top,bottom:z.bottom},labelBottom:l.bottom}]:[];})));
   eq(rows,[],`${hud}/${seats}: default battlefield and lands each contain a whole first card row`);
   eq(await page.locator('.cm-board-table').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,`${hud}/${seats}: Table does not overflow horizontally`);
  }
  if(problems.length)failures.push({case:`${mode}/${width}/${hud}/${seats}seats`,text:problems});else checks++;
  const own=page.locator('.cm-mat[data-seat="0"] .cm-bcard[data-card="9001"]').first();await own.scrollIntoViewIfNeeded();const reachable=await own.evaluate(el=>{const r=el.getBoundingClientRect(),at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===at||el.contains(at);});if(!reachable)failures.push({case:`${mode}/${width}/${hud}/${seats}seats`,geometry:'card unreachable after scrolling'});else checks++;
  if(process.env.UAT_SHOTS&&mode==='table'&&width===1440)await page.screenshot({path:path.join(process.env.UAT_SHOTS,`r4-caption-${mode}-${width}-${hud}-s${seats}-own-row.png`)});
  eq(errors,[],`${mode}/${width}/${hud}/${seats}seats: no browser errors`);await context.close();
 }
 eq(failures,[],'actual endpoint typography and geometry audit');
}finally{await close();}
console.log(`board-r4-caption-fit: ${checks} checks passed across ${scenarios} scenarios`);
