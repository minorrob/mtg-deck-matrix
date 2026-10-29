/* ROB-26 direct blocking: private drafts, authoritative checks, stale responses and pointer reach. */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
const {browser, base, stub, close} = await openBrowser({name:"board-direct-blocking",flag:"GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const original = structuredClone(sample);
original.revision = 20000;
original.seat=1;original.seatId="s1";original.waitingOn="s1";
delete original.yourTurn;
original.state.turn=29;
for(const p of original.state.players) p.zones.Hand.cards=[];
original.state.players[original.seat].zones.Hand.count=0;
original.state.phase = "COMBAT_DECLARE_BLOCKERS";
original.state.turnId = "turn:29";
original.state.combat = {attackingPlayerId:0,defenders:[1,2],attacks:[]};
const permanent=(cardId,name,owner,extra={})=>({cardId,name,owner,controller:owner,faceDown:false,tapped:false,damage:0,counters:{},types:["Creature"],power:2,toughness:2,keywords:[],commander:false,...extra});
for(const p of original.state.players) p.zones.Battlefield.cards=[];
original.state.players[0].zones.Battlefield.cards=[permanent(72001,"Savannah Lions",0),permanent(72002,"Wind Drake",0),permanent(72003,"Other attacker",0)];
original.state.players[1].zones.Battlefield.cards=[permanent(72011,"Grizzly Bears",1),permanent(72012,"Reach creature",1),permanent(72013,"Multiple blocker",1),permanent(72014,"Tapped creature",1,{tapped:true})];
original.state.combat.attacks=[72001,72002,72003].map((attacker,i)=>({attacker,defender:i===2?2:1,blocked:false,blockers:[]}));
original.decision={id:"declare-blockers:29:1",mode:"many",min:0,max:5,title:"Declare blockers",
 legalBlocks:[{blocker:72011,attackers:[72001]},{blocker:72012,attackers:[72001,72002]},{blocker:72013,attackers:[72001,72002]}],
 options:[[72011,72001],[72012,72001],[72012,72002],[72013,72001],[72013,72002]].map(([cardId,attackerId],index)=>({index,cardId,attackerId,label:`Block #${attackerId} with #${cardId}`}))};
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const errors=[];
async function fixture(width,height,mode="full",tall=false){
  let current=structuredClone(original), socket, hold=false;
  const reply = (f, overrides={}) => socket.send(JSON.stringify({type:"checked", choiceId:f.choiceId, ok:true, open:true, reasons:[], ...overrides}));
  const frames=[], context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",serviceWorkers:"block"});
  await context.addInitScript(mode=>{localStorage.setItem("cm-board-view",mode);localStorage.setItem("crankmagic-audio-muted","true");globalThis.__blockClicks=[];document.addEventListener('click',event=>{const el=event.target.closest?.('[data-action]');if(el)__blockClicks.push({...el.dataset});},true);},mode);
  const page=await context.newPage();
  /* TALL TEXT (Oct 20): CI's Linux fonts set lines taller than a Windows desktop's, and at 1280x720 that alone pushed No
     blocks and Confirm below the window in Focus (run 39468706080). The tall cases set every line twice its height, so
     the question held to the window is proved on any machine, not only where the fonts happen to be tall. */
  if(tall) await page.addInitScript(()=>document.addEventListener("DOMContentLoaded",()=>{const s=document.createElement("style");s.textContent="*{line-height:2!important}";document.head.append(s);}));
  if(stub) await stub(page);
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"combat@example.com"}}));
  await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
  await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table:{tableId:"combat01",phase:"playing",matchId:current.matchId,away:[],seats:current.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:"human",mat:"felt",you:p.playerId===current.seat}))},now:Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/combat01\/connect$/,ws=>{socket=ws;ws.onMessage(data=>{const f=JSON.parse(data);frames.push(f);if(f.type==="check"&&!hold) reply(f);});ws.send(JSON.stringify({type:"view",view:current}));});
  await page.goto(`${base}/index.html#table?id=combat01`);
  await page.locator(".cm-combat-row").first().waitFor();
  const publish=async change=>{change(current);socket.send(JSON.stringify({type:"view",view:current}));await page.waitForTimeout(150);};
  return {page,context,frames,publish,reply,hold:()=>{hold=true;}, release:()=>{hold=false;}, drop:()=>socket.close(), emit:f=>socket.send(JSON.stringify(f))};
}
async function point(page,selector){
  const el=page.locator(selector).first();
  const reached=await el.evaluate(el=>{
    const r=el.getBoundingClientRect();
    return [[.5,.5],[.2,.2],[.8,.8]].every(([fx,fy])=>{
      const x=r.x+r.width*fx,y=r.y+r.height*fy;
      return x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&el.contains(document.elementFromPoint(x,y));
    });
  });
  if(!reached){mkdirSync(path.join(ROOT,'work'),{recursive:true});await page.screenshot({path:path.join(ROOT,"work/blocking-failure.png")});console.log(selector,await el.evaluate(el=>{const r=el.getBoundingClientRect(),parents=[];for(let p=el.parentElement;p&&parents.length<10;p=p.parentElement){const s=getComputedStyle(p);parents.push({node:p.className,y:p.getBoundingClientRect().top,h:p.getBoundingClientRect().height,scroll:p.scrollTop,overflow:s.overflow,position:s.position,top:s.top});}return {rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,600),clicks:globalThis.__blockClicks.slice(-12),parents}}));}
  assert.ok(reached,`${selector} receives the pointer without scrolling hidden overflow`);
  const r=await el.boundingBox();
  return {x:r.x+r.width/2,y:r.y+r.height/2};
}
async function shot(page,name){
  if(!process.env.UAT_SHOTS) return;
  mkdirSync(process.env.UAT_SHOTS,{recursive:true});
  await page.evaluate(()=>{
    const badge=document.createElement("div");badge.id="combat-proof";badge.textContent="B26 - Private blocks - objects #72001-72014";
    badge.style.cssText="position:fixed;left:4px;bottom:4px;padding:4px;background:#102425;color:white;font:11px system-ui;z-index:9999;pointer-events:none";
    document.body.append(badge);
  });
  await page.screenshot({path:path.join(process.env.UAT_SHOTS,name+".png")});
}
const pair=i=>`[data-action="board-block-pair"][data-index="${i}"]`;
const send='[data-action="board-send-blockers"]';
const pause=page=>page.waitForTimeout(100);
async function press(page,sel){
  const el=page.locator(sel).first();
  if(await el.evaluate(el=>!!el.closest('.cm-board-options'))){
    const box=page.locator('#cm-board-decision .cm-board-options');
    for(let n=0;n<64;n++){
      const hit=await el.evaluate(el=>{const r=el.getBoundingClientRect();return [[.5,.5],[.2,.2],[.8,.8]].every(([x,y])=>el.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)));});
      if(hit)break;
      const r=await box.boundingBox();await page.mouse.move(Math.min(innerWidthSafe(page),r.x+r.width/2),Math.min(650,Math.max(50,r.y+r.height/2)));
      const dir=await el.evaluate(el=>{const r=el.getBoundingClientRect(),b=el.closest('.cm-board-options').getBoundingClientRect();return r.y+r.height*.2<b.y?-1:1;});
      await page.mouse.wheel(0,dir*80);await pause(page);
    }
  }
  const p=await point(page,sel);await page.mouse.click(p.x,p.y);await pause(page);
}
function innerWidthSafe(page){return page.viewportSize().width-5;}
async function show(page,id){
  const active=page.locator('.cm-block-draft');
  const drawer=page.locator('#cm-actions-drawer');
  const open=await drawer.evaluate(el=>el.classList.contains('is-open'));
  if(open && Number(await active.getAttribute('data-active-attacker'))===id)return;
  if(open && await page.locator('#cm-board[data-phone]').count()) {
    await page.locator('[data-action="board-stage-rail"]').click();await pause(page);
  }
  const control=page.locator(`[data-action="board-block-attacker"][data-attacker="${id}"]`);
  const row=page.locator('.cm-combat-groups');
  for(let n=0;n<20;n++){
    const r=await control.boundingBox(),b=await row.boundingBox();
    if(r.x>=b.x&&r.x+r.width<=b.x+b.width)break;
    await page.locator(`.cm-combat-scroll[data-by="${r.x<b.x?'-1':'1'}"]`).click();await pause(page);
  }
  await control.click();await pause(page);
}
async function settle(page,id,none=false){await press(page,`[data-action="${none?'board-block-attacker-none':'board-block-attacker-confirm'}"][data-attacker="${id}"]`);}
async function noBlocks(page){for(const id of [72001,72002]){await show(page,id);await settle(page,id,true);}}
async function enabled(page){await page.locator(send+':not([disabled])').waitFor();}
let cases=0;
try {
 for(const [width,height,mode,tall=false] of [[1024,768,"full"],[1280,720,"full"],[1400,900,"full"],[1280,720,"table"],[1280,720,"focus"],[390,844,"focus"],[1280,720,"table",true],[1280,720,"focus",true]]){
  if(process.env.BLOCK_CASE&&process.env.BLOCK_CASE!==`${mode}-${width}${tall?'-tall':''}`)continue;
  cases++;
  const {page,context,frames,publish,reply,hold,release,drop,emit}=await fixture(width,height,mode,tall);
  const where=`${mode} ${width}x${height}${tall?' tall text':''}`;console.log(where);
  await pause(page);
  assert.deepEqual(frames.filter(f=>f.type==='check').map(f=>f.indices),[[]],where+': initial no-block draft checked');
  assert.equal(await page.locator(send).isDisabled(),true,'a valid empty check does not settle attackers for the person');
  await show(page,72001);
  assert.equal(await page.locator('[data-block-object="72014"]').count(),0,'tapped creature has no legal pairs');
  assert.equal(await page.locator(pair(0)).count(),1,'one offered control for the exact legal pair');
  assert.equal(await page.locator(pair(2)).count(),0,'another attacker is absent from this desk');
  hold();await press(page,pair(0));
  assert.equal(await page.locator(send).isDisabled(),true,'unchecked draft cannot send');
  let checks=frames.filter(f=>f.type==='check');
  reply(checks.at(-1),{ok:false,reasons:['Savannah Lions has menace and needs another blocker.','An additional room reason.']});await pause(page);
  assert.match(await page.locator('.cm-block-status').innerText(),/menace.*another blocker[\s\S]*additional room reason/,'all engine reasons shown');
  assert.equal(await page.locator(send).isDisabled(),true,'invalid draft cannot send');
  assert.equal(await page.locator('.cm-combat [data-combat-role="Blocker"]').count(),0,'private draft is not public combat');
  await press(page,pair(1));checks=frames.filter(f=>f.type==='check');const old=checks.at(-1);
  await show(page,72002);await press(page,pair(2));
  assert.equal(frames.filter(f=>f.type==='check').length,checks.length,'only one check in flight');
  reply(old);await pause(page);
  assert.equal(await page.locator(send).isDisabled(),true,'a valid old draft cannot authorize edited blocks');
  const newer=frames.filter(f=>f.type==='check').at(-1);assert.deepEqual(newer.indices,[0,1,2],'queued check uses complete latest draft');
  reply(newer,{ok:false,reasons:['Reach creature can block only one attacker.']});await pause(page);
  await press(page,pair(2));reply(frames.filter(f=>f.type==='check').at(-1));await pause(page);
  await settle(page,72002,true);reply(frames.filter(f=>f.type==='check').at(-1));await pause(page);
  await show(page,72001);await settle(page,72001);await enabled(page);
  assert.equal(frames.filter(f=>f.type==='act').length,0,'selection and per-attacker confirmation publish nothing');
  if(width===1280&&mode==='full')await shot(page,'r4-blocking-1280x720');
  if(width===390)await shot(page,'r4-blocking-390x844');
  if(tall&&mode==='focus')await shot(page,'r4-blocking-focus-tall');
  await press(page,send);assert.deepEqual(frames.filter(f=>f.type==='act').at(-1).indices,[0,1],'Send publishes exact blockers');
  assert.equal(frames.filter(f=>f.type==='act').length,1,'exactly one game action');
  emit({type:'receipt',receipt:{}});await pause(page);assert.equal(await page.locator(send).isDisabled(),true,'receipt cannot reopen submitted draft');
  release();await publish(v=>{v.revision++;v.decision.id+=':next';});await pause(page);
  assert.equal(await page.locator('[data-draft-blocker]').count(),0,'new decision clears previous draft');
  await show(page,72001);await press(page,pair(3));await settle(page,72001);
  await show(page,72002);await press(page,pair(4));await settle(page,72002);await enabled(page);
  assert.deepEqual(frames.filter(f=>f.type==='check').at(-1).indices,[3,4],'server can accept one creature on multiple attackers');
  await press(page,pair(4));await show(page,72001);await press(page,pair(3));await pause(page);
  assert.equal(await page.locator('[data-draft-blocker]').count(),0,'a second press removes each pair');
  hold();await press(page,pair(3));const stale=frames.filter(f=>f.type==='check').at(-1);
  await publish(v=>{v.matchId+='-rematch';});reply(stale);await pause(page);
  assert.equal(await page.locator(send).isDisabled(),true,'old match validation cannot enable Send');
  assert.equal(await page.locator('[data-draft-blocker]').count(),0,'same-ID new match clears draft');
  reply(frames.filter(f=>f.type==='check').at(-1));await pause(page);release();
  if(width===1280&&mode==='full'){
    await show(page,72001);hold();await press(page,pair(3));const previous=frames.filter(f=>f.type==='check').at(-1);
    await publish(v=>{v.decision.options=v.decision.options.filter(o=>o.index!==3);v.decision.legalBlocks.find(b=>b.blocker===72013).attackers=[72002];});
    reply(previous);await pause(page);assert.equal(await page.locator(send).isDisabled(),true,'same-ID changed legal pairs invalidate old permission');
    assert.equal(await page.locator('[data-draft-blocker]').count(),0,'changed legal pairs discard draft');
    reply(frames.filter(f=>f.type==='check').at(-1));await pause(page);release();await noBlocks(page);await enabled(page);
    const n=frames.filter(f=>f.type==='check').length;hold();drop();
    await page.waitForFunction(()=>document.querySelector('[data-action="board-send-blockers"]')?.disabled);
    await page.waitForTimeout(1300);assert.ok(frames.filter(f=>f.type==='check').length>n,'reconnect requests fresh check');
    assert.equal(await page.locator(send).isDisabled(),true,'old socket permission never survives reconnect');
    emit({type:'refused',of:'check',error:'The table could not check the draft.'});await pause(page);
    await show(page,72001);assert.match(await page.locator('.cm-block-status').innerText(),/could not check/,'transport refusal shown privately');
    release();await press(page,'[data-action="board-block-retry"]');await pause(page);
  }
  await show(page,72001);const candidate=page.locator(pair(0));await candidate.focus();await page.keyboard.press('Enter');await pause(page);
  assert.equal(await candidate.getAttribute('aria-pressed'),'true','keyboard drafts exact legal pair');
  assert.equal(await candidate.evaluate(el=>document.activeElement===el),true,'focus survives draft and check redraws');
  await noBlocks(page);await enabled(page);
  assert.equal(frames.filter(f=>f.type==='act').length,1,'Don\'t block remains local');
  if(width===1280&&mode==='full'){
    const beforePairs=frames.filter(f=>f.type==='check').length;
    hold();await publish(v=>{
      const removed=v.decision.options.find(o=>o.index===0);
      v.decision.options=v.decision.options.filter(o=>o.index!==0);
      v.decision.legalBlocks=v.decision.legalBlocks.map(b=>b.blocker===removed.cardId?{...b,attackers:b.attackers.filter(id=>id!==removed.attackerId)}:b);
    });
    assert.equal(await page.locator(send).isDisabled(),true,'empty draft cannot keep validation after legal pairs change');
    assert.equal(frames.filter(f=>f.type==='check').length,beforePairs+1,'empty legal-pair update requests fresh validation');
    reply(frames.filter(f=>f.type==='check').at(-1));await pause(page);
    assert.equal(await page.locator(send).isDisabled(),true,'changed pairs require explicit attacker choices again');
    release();await noBlocks(page);await enabled(page);
    assert.equal(frames.filter(f=>f.type==='act').length,1,'settling changed pairs stays local until Send');
    const checksBefore=frames.filter(f=>f.type==='check').length;
    hold();await publish(v=>{v.matchId+='-empty-draft-rematch';});
    assert.equal(await page.locator(send).isDisabled(),true,'an empty draft cannot reuse permission from another match');
    assert.equal(frames.filter(f=>f.type==='check').length,checksBefore+1,'same-ID empty rematch requests its own validation');
    assert.deepEqual(frames.filter(f=>f.type==='check').at(-1).indices,[],'the fresh match validates its own empty draft');
    reply(frames.filter(f=>f.type==='check').at(-1));await pause(page);
    assert.equal(await page.locator(send).isDisabled(),true,'new match still requires each attacker to be explicitly settled');
    release();await noBlocks(page);await enabled(page);
    assert.equal(frames.filter(f=>f.type==='act').length,1,'settling the empty rematch remains private until Send');
  }
  await press(page,send);assert.deepEqual(frames.filter(f=>f.type==='act').at(-1).indices,[],'Send no blocks uses empty answer');
  if(width===1280&&mode==='full'){
    await publish(v=>{v.revision++;v.decision.id+=':crowded';const attackers=Array.from({length:14},(_,i)=>73000+i),blockers=Array.from({length:14},(_,i)=>74000+i);
      v.state.players[0].zones.Battlefield.cards=attackers.map(id=>permanent(id,'Savannah Lions',0));v.state.combat.attacks=attackers.map(attacker=>({attacker,defender:1,blocked:false,blockers:[]}));v.state.players[1].zones.Battlefield.cards=blockers.map(id=>permanent(id,'Grizzly Bears',1));v.decision.legalBlocks=blockers.map(blocker=>({blocker,attackers}));v.decision.options=blockers.flatMap((cardId,b)=>attackers.map((attackerId,a)=>({index:b*14+a,cardId,attackerId,label:cardId+' blocks '+attackerId})));});
    await show(page,73013);const choices=page.locator('#cm-board-decision .cm-board-options');await press(page,pair(195));
    assert.ok(await choices.evaluate(el=>el.scrollTop)>0,'crowded blockers reached through real wheel scroll');
    assert.equal(await page.locator(pair(195)).getAttribute('aria-pressed'),'true','last blocker stays selected and reachable');await point(page,pair(195));
    assert.equal(await page.locator(send).isDisabled(),true,'one settled attacker cannot authorize the crowded set');
    await show(page,73000);assert.equal(await page.locator(pair(0)).count(),1,'another attacker displays its own legal choices');
    await publish(v=>{v.matchId+='-fresh';});await pause(page);assert.equal(await choices.evaluate(el=>el.scrollTop),0,'new match resets crowded choice scroll');
  }
  await context.close();
 }
 assert.ok(cases>0,'BLOCK_CASE must name an exercised layout');assert.deepEqual(errors,[],'no browser errors');console.log('board-direct-blocking: PASS ('+cases+' layouts; private settlements, authoritative checks, serial/stale responses, capacities, retry, keyboard and real pointer reach; crowded choices in full1280)');
}finally{await close();}
