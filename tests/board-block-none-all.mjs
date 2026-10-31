/* ROB-333: one control, "No blocks at all", answers every attacker slot with no block and sends in ONE activation.
   Rob, 2026-10-30: he had to press "No block" or "Confirm" once per attacker slot. The per-slot buttons stay for mixed answers.
   Proved at three attackers on the person's seat, in Table, Focus and 3D (full) at desktop size and in the phone layout:
   present with a legal blocker, absent with none; one press sends exactly one act whose indices are [] after the table's
   check of the empty draft; a drafted pair is cleared by it; a refused check sends nothing; reachable by keyboard. */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
const {browser, base, stub, close} = await openBrowser({name:"board-block-none-all",flag:"GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const original = structuredClone(sample);
original.revision = 21000;
original.seat=1;original.seatId="s1";original.waitingOn="s1";
delete original.yourTurn;
original.state.turn=31;
for(const p of original.state.players) p.zones.Hand.cards=[];
original.state.players[original.seat].zones.Hand.count=0;
original.state.phase = "COMBAT_DECLARE_BLOCKERS";
original.state.turnId = "turn:31";
original.state.combat = {attackingPlayerId:0,defenders:[1],attacks:[]};
const permanent=(cardId,name,owner,extra={})=>({cardId,name,owner,controller:owner,faceDown:false,tapped:false,damage:0,counters:{},types:["Creature"],power:2,toughness:2,keywords:[],commander:false,...extra});
for(const p of original.state.players) p.zones.Battlefield.cards=[];
const ATTACKERS=[73001,73002,73003];
original.state.players[0].zones.Battlefield.cards=ATTACKERS.map((id,i)=>permanent(id,["Savannah Lions","Wind Drake","Grizzly Bears"][i],0));
original.state.players[1].zones.Battlefield.cards=[permanent(73011,"Reach creature",1),permanent(73012,"Second blocker",1)];
original.state.combat.attacks=ATTACKERS.map(attacker=>({attacker,defender:1,blocked:false,blockers:[]}));
const legal=[{blocker:73011,attackers:ATTACKERS},{blocker:73012,attackers:[73001,73002]}];
const optionsFor=l=>l.flatMap(b=>b.attackers.map(attackerId=>({cardId:b.blocker,attackerId}))).map((o,index)=>({index,...o,label:`Block #${o.attackerId} with #${o.cardId}`}));
original.decision={id:"declare-blockers:31:1",mode:"many",min:0,max:5,title:"Declare blockers",legalBlocks:legal,options:optionsFor(legal)};
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const errors=[];
async function fixture(width,height,mode,{noLegal=false}={}){
  const current=structuredClone(original);
  if(noLegal){current.decision.legalBlocks=[];current.decision.options=[];}
  const state={refuse:false};
  const frames=[], context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",serviceWorkers:"block"});
  await context.addInitScript(mode=>{localStorage.setItem("cm-board-view",mode);localStorage.setItem("crankmagic-audio-muted","true");},mode);
  const page=await context.newPage();
  if(stub) await stub(page);
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"combat@example.com"}}));
  await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
  await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table:{tableId:"combat02",phase:"playing",matchId:current.matchId,away:[],seats:current.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:"human",mat:"felt",you:p.playerId===current.seat}))},now:Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/combat02\/connect$/,ws=>{ws.onMessage(data=>{const f=JSON.parse(data);frames.push(f);
    if(f.type==="check") ws.send(JSON.stringify({type:"checked",choiceId:f.choiceId,ok:!state.refuse,open:true,reasons:state.refuse?["The table refuses this draft."]:[]}));});
    ws.send(JSON.stringify({type:"view",view:current}));});
  await page.goto(`${base}/index.html#table?id=combat02`);
  await page.locator(".cm-combat-row").first().waitFor();
  return {page,context,frames,state};
}
const all='[data-action="board-block-none-all"]';
const acts=frames=>frames.filter(f=>f.type==="act");
const pause=page=>page.waitForTimeout(250);
let cases=0;
try {
 for(const [width,height,mode] of [[1280,720,"full"],[1280,720,"table"],[1280,720,"focus"],[390,844,"focus"]]){
  cases++;
  const where=`${mode} ${width}x${height}`;console.log(where);
  /* Absent when no blocker is legal for any attacker. */
  {
    const {page,context}=await fixture(width,height,mode,{noLegal:true});await pause(page);
    assert.equal(await page.locator(all).count(),0,where+': no control when no blocker is legal');
    await context.close();
  }
  /* A mixed answer through the per-slot buttons is still possible (they are not replaced). */
  const {page,context,frames,state}=await fixture(width,height,mode);await pause(page);
  assert.equal(await page.locator('.cm-combat-row').count(),3,where+': three attacker slots');
  assert.equal(await page.locator(all).count(),1,where+': exactly one control');
  assert.equal(await page.locator('[data-action="board-block-attacker-none"]').count(),1,where+': the per-slot No block button remains');
  assert.equal(await page.locator('[data-action="board-block-attacker-confirm"]').count(),1,where+': the per-slot Confirm button remains');
  assert.equal(await page.locator(all).getAttribute("aria-label"),"No blockers on any attacker",where+': a whole accessible name');
  assert.equal(await page.locator('[data-action="board-send-blockers"]').isDisabled(),true,where+': Send waits while slots are unsettled');
  /* It is on the screen: its center receives the pointer (no hidden overflow) and it keeps inside the window. */
  const reach=await page.locator(all).evaluate(el=>{const r=el.getBoundingClientRect();return {inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  assert.deepEqual(reach,{inside:true,hit:true},where+': the control is inside the window and reaches the pointer');
  if(process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.UAT_SHOTS,`block-none-all-${mode}-${width}.png`)});}
  /* A drafted pair is cleared by it: draft one block first through the per-slot desk. */
  await page.locator('[data-action="board-block-attacker"][data-attacker="73001"]').first().click();await pause(page);
  await page.locator('[data-action="board-block-pair"][data-index="0"]').first().click();await pause(page);
  assert.equal(await page.locator('[data-action="board-block-pair"][data-index="0"]').first().getAttribute("aria-pressed"),"true",where+': a pair is drafted');
  assert.equal(acts(frames).length,0,where+': drafting sends nothing');
  /* A refused check sends nothing. */
  state.refuse=true;
  await page.locator(all).click();await pause(page);
  assert.equal(acts(frames).length,0,where+': a refused check of the empty draft sends nothing');
  state.refuse=false;
  /* One activation, from the keyboard, sends one empty answer. */
  await page.locator(all).focus();
  await page.keyboard.press("Enter");await pause(page);
  assert.equal(acts(frames).length,1,where+': exactly one act after one activation');
  const act=acts(frames)[0];
  assert.deepEqual([act.type,act.kind,act.choiceId,act.indices],["act","answer","declare-blockers:31:1",[]],where+': the empty block set answers the declare-blockers decision');
  assert.equal(frames.filter(f=>f.type==="check").at(-1).indices.length,0,where+': the table checked the empty draft before it was sent');
  await context.close();
 }
 /* The same press with no pair drafted (the draft is already empty and already checked) is also one act. */
 {
  const {page,context,frames}=await fixture(1280,720,"table");await pause(page);
  await page.locator(all).click();await pause(page);
  assert.equal(acts(frames).length,1,'an untouched draft: one activation, one act');
  assert.deepEqual(acts(frames)[0].indices,[],'an untouched draft sends no pairs');
  await context.close();
 }
 assert.deepEqual(errors,[],'no browser errors');
 console.log(`board-block-none-all: PASS (${cases} layouts x 3 attackers: control present, absent with no legal blocker, one activation sends [], keyboard, refused check sends nothing, per-slot buttons remain)`);
}finally{await close();}
