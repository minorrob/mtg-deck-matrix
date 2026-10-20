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
  await context.addInitScript(mode=>{localStorage.setItem("cm-board-view",mode);localStorage.setItem("crankmagic-audio-muted","true");},mode);
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
  if(!reached){await page.screenshot({path:path.join(ROOT,"work/blocking-failure.png")});console.log(selector,await el.evaluate(el=>{const r=el.getBoundingClientRect();return {rect:r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,600)}}));}
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
const select=id=>`[data-action="board-block-select"][data-block-object="${id}"]`;
const pair=i=>`[data-action="board-block-pair"][data-index="${i}"]`;
const confirm='[data-action="board-confirm"]';
const pause=page=>page.waitForTimeout(100);
async function press(page,sel){
  // Actual wheel input, never a Playwright click that scrolls hidden overflow.
  const el=page.locator(sel).first();
  if(await el.evaluate(el=>!!el.closest('.cm-board-options'))){
    const box=page.locator('#cm-board-decision .cm-board-options');
    for(let n=0;n<16;n++){
      const hit=await el.evaluate(el=>{const r=el.getBoundingClientRect();return [[.5,.5],[.2,.2],[.8,.8]].every(([x,y])=>el.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)));});
      if(hit) break;
      const r=await box.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
      const dir=await el.evaluate(el=>{const r=el.getBoundingClientRect(),b=el.closest('.cm-board-options').getBoundingClientRect();return document.querySelector('.cm-board[data-phone]')?(r.x+r.width*.2<b.x?1:-1):(r.y+r.height*.2<b.y?-1:1);});
      await page.mouse.wheel(0,dir*20);await pause(page);
    }
  }
  const p=await point(page,sel);await page.mouse.click(p.x,p.y);await pause(page);}
async function enabled(page){await page.locator(confirm+':not([disabled])').waitFor();}
try {
 for(const [width,height,mode,tall=false] of [[1024,768,"full"],[1280,720,"full"],[1400,900,"full"],[1280,720,"table"],[1280,720,"focus"],[390,844,"focus"],[1280,720,"table",true],[1280,720,"focus",true]]){
  if(process.env.BLOCK_CASE && process.env.BLOCK_CASE!==`${mode}-${width}${tall?"-tall":""}`) continue;
  const {page,context,frames,publish,reply,hold,release,drop,emit}=await fixture(width,height,mode,tall);
  const where=`${mode} ${width}x${height}${tall?" tall text":""}`;console.log(where);
  await enabled(page);
  assert.deepEqual(frames.filter(f=>f.type==='check').map(f=>f.indices),[[]],where+': initial no-block draft checked');
  assert.equal(await page.locator(select(72014)).count(),0,'tapped creature has no legal pairs');
  assert.equal(await page.locator(select(72011)).count(),1,'one control per blocker');
  // Select directly on the mat; test the separate tile route too, below.
  const mat=width<600?'.cm-phone-center .cm-mat':'.cm-mat';
  await press(page,mode==="full" ? `${mat} [data-card="72011"]` : select(72011));
  assert.equal(await page.locator(select(72011)).getAttribute('aria-pressed'),'true','mat click selects blocker instead of sending an answer');
  assert.equal(await page.locator('.cm-block-tiles[aria-label="Legal attackers"] button').count(),1,'only authoritative legal attackers offered');
  assert.equal(await page.locator('[data-action="board-block-pair"][data-block-object="72003"]').count(),0,'attacker at another seat absent');
  hold();await press(page,pair(0));
  assert.equal(await page.locator(confirm).isDisabled(),true,'unchecked draft cannot confirm');
  let checks=frames.filter(f=>f.type==='check');
  reply(checks.at(-1),{ok:false,reasons:["Savannah Lions has menace and needs another blocker.","An additional room reason."]});await pause(page);
  assert.match(await page.locator('.cm-block-status').innerText(),/menace.*another blocker[\s\S]*additional room reason/,'all engine reasons shown');
  assert.equal(await page.locator(confirm).isDisabled(),true,'invalid draft cannot confirm');
  assert.equal(await page.locator('.cm-combat [data-combat-role="Blocker"]').count(),0,'private draft is not public combat');
  await press(page,select(72012));await press(page,pair(1));
  checks=frames.filter(f=>f.type==='check');const old=checks.at(-1);
  // Edit while one check is in flight: no parallel checks, no stale permission.
  await press(page,pair(2));
  assert.equal(frames.filter(f=>f.type==='check').length,checks.length,'only one check in flight');
  reply(old);await pause(page);
  assert.equal(await page.locator(confirm).isDisabled(),true,'a valid old draft cannot authorize edited blocks');
  const newer=frames.filter(f=>f.type==='check').at(-1);
  assert.deepEqual(newer.indices,[0,1,2],'queued check uses the complete latest draft');
  reply(newer,{ok:false,reasons:['Reach creature can block only one attacker.']});await pause(page);
  await press(page,pair(2));reply(frames.filter(f=>f.type==='check').at(-1));await enabled(page);
  assert.equal(frames.filter(f=>f.type==='act').length,0,'no selection publishes an answer');
  if(width===1280&&mode==='full') await shot(page,'rob-26-blocking-1280x720');
  if(width===390) await shot(page,'rob-26-blocking-390x844');
  if(tall&&mode==='focus') await shot(page,'rob-26-blocking-1280x720-focus-tall');
  await press(page,confirm);
  assert.deepEqual(frames.filter(f=>f.type==='act').at(-1).indices,[0,1],'explicit Confirm sends both blockers once');
  assert.equal(frames.filter(f=>f.type==='act').length,1,'exactly one game action');
  emit({type:'receipt',receipt:{}});await pause(page);
  assert.equal(await page.locator(confirm).isDisabled(),true,'receipt before next view cannot reopen the submitted draft');
  // Fresh decision clears private drafts. Expanded blocking capacity is accepted, not guessed by the board.
  release();await publish(v=>{v.revision++;v.decision.id+=':next';});await enabled(page);
  assert.equal(await page.locator('[data-draft-blocker]').count(),0,'new decision clears previous draft');
  await press(page,select(72013));await press(page,pair(3));await press(page,pair(4));await enabled(page);
  assert.deepEqual(frames.filter(f=>f.type==='check').at(-1).indices,[3,4],'engine can accept one creature on multiple attackers');
  await press(page,'[data-action="board-block-clear"]');await enabled(page);
  assert.equal(await page.locator('[data-draft-blocker]').count(),0,'clear selected blocker removes all its pairs');
  // Same-ID new match and same-ID changed options must discard a pending response.
  hold();await press(page,pair(3));const stale=frames.filter(f=>f.type==='check').at(-1);
  await publish(v=>{v.matchId+='-rematch';});
  reply(stale);await pause(page);
  assert.equal(await page.locator(confirm).isDisabled(),true,'old match validation never enables Confirm');
  assert.equal(await page.locator('[data-draft-blocker]').count(),0,'same-ID new match clears the draft');
  reply(frames.filter(f=>f.type==='check').at(-1));await enabled(page);
  release();
  if(width===1280&&mode==='full'){
    await press(page,select(72013));hold();await press(page,pair(3));const previous=frames.filter(f=>f.type==='check').at(-1);
    await publish(v=>{v.decision.options=v.decision.options.filter(o=>o.index!==3);v.decision.legalBlocks.find(b=>b.blocker===72013).attackers=[72002];});
    reply(previous);await pause(page);
    assert.equal(await page.locator(confirm).isDisabled(),true,'same-ID changed legal pairs invalidate old permission');
    assert.equal(await page.locator('[data-draft-blocker]').count(),0,'changed legal pairs discard stale draft');
    reply(frames.filter(f=>f.type==='check').at(-1));await enabled(page);
    const n=frames.filter(f=>f.type==='check').length;drop();
    await page.waitForFunction(()=>document.querySelector('[data-action="board-confirm"]')?.disabled);
    await page.waitForTimeout(1300);
    assert.ok(frames.filter(f=>f.type==='check').length>n,'reconnect requests a fresh check even with the same view');
    assert.equal(await page.locator(confirm).isDisabled(),true,'old socket permission never survives reconnect');
    emit({type:'refused',of:'check',error:'The table could not check the draft.'});await pause(page);
    assert.match(await page.locator('.cm-block-status').innerText(),/could not check/,'check transport refusal shown privately');
    release();await press(page,'[data-action="board-block-retry"]');await enabled(page);
  }
  // List fallback remains keyboard accessible and shares validation; No blocks is explicit, never auto submits.
  await page.locator('.cm-block-list summary').focus();await page.keyboard.press('Enter');await pause(page);
  const fallback=page.locator('.cm-block-list [data-index="0"]');await fallback.focus();await page.keyboard.press('Enter');await enabled(page);
  assert.equal(await page.locator('[data-draft-blocker="72011"]').count(),1,'keyboard list drafts the same pair');
  assert.equal(await fallback.evaluate(el=>document.activeElement===el),true,'keyboard focus survives draft and check redraws');
  await press(page,'[data-action="board-block-none"]');await enabled(page);
  assert.equal(frames.filter(f=>f.type==='act').length,1,'No blocks still needs confirmation');
  await press(page,confirm);assert.deepEqual(frames.filter(f=>f.type==='act').at(-1).indices,[],'confirm no blocks sends empty answer');
  if(width===1280&&mode==='full'){
    await publish(v=>{
      v.revision++;v.decision.id+=':crowded';
      const attackers=Array.from({length:14},(_,i)=>73000+i), blockers=Array.from({length:14},(_,i)=>74000+i);
      v.state.players[0].zones.Battlefield.cards=attackers.map(id=>permanent(id,'Savannah Lions',0));
      v.state.combat.attacks=attackers.map(attacker=>({attacker,defender:1,blocked:false,blockers:[]}));
      v.state.players[1].zones.Battlefield.cards=blockers.map(id=>permanent(id,'Grizzly Bears',1));
      v.decision.legalBlocks=blockers.map(blocker=>({blocker,attackers}));
      v.decision.options=blockers.flatMap((cardId,b)=>attackers.map((attackerId,a)=>({index:b*14+a,cardId,attackerId,label:`#${cardId} blocks #${attackerId}`})));
    });await enabled(page);
    const blockerRow=page.locator('.cm-block-tiles[aria-label="Choose a blocker"]');
    async function across(row,delta){const r=await row.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.wheel(delta,0);await pause(page);}
    await across(blockerRow,10000);const bx=await blockerRow.evaluate(el=>el.scrollLeft);assert.ok(bx>0,'crowded blockers really scroll');
    await press(page,select(74013));
    assert.equal(await blockerRow.evaluate(el=>el.scrollLeft),bx,'selecting a later blocker preserves its row position');
    const attackerRow=page.locator('.cm-block-tiles[aria-label="Legal attackers"]');
    await across(attackerRow,10000);const ax=await attackerRow.evaluate(el=>el.scrollLeft);assert.ok(ax>0,'crowded attackers really scroll');
    await press(page,pair(195));await enabled(page);
    assert.equal(await attackerRow.evaluate(el=>el.scrollLeft),ax,'selection and asynchronous validation preserve attacker row position');
    await across(blockerRow,-10000);await press(page,select(74000));
    assert.equal(await attackerRow.evaluate(el=>el.scrollLeft),0,'different blocker starts its attacker row at the beginning');
    await publish(v=>{v.matchId+='-fresh';});await enabled(page);
    assert.equal(await blockerRow.evaluate(el=>el.scrollLeft),0,'new match does not inherit crowded row position');
  }
  await context.close();
 }
 assert.deepEqual(errors,[],'no browser errors');
 console.log('board-direct-blocking: PASS (direct pairs, private drafts, full reasons, serial checks, stale match, capacity, clearing, keyboard and real pointer reach in six layouts, and in Table and Focus at tall text)');
} finally {await close();}
