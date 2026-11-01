/* ROB-26 slice 1: confirmed combat, object identity and pointer reach, without deciding blocks. */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
const {browser, base, stub, close} = await openBrowser({name:"board-combat-display",flag:"GEOMETRY_REQUIRED"});
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
for(let i=0;i<6;i++){
  original.state.players[0].zones.Battlefield.cards.push(permanent(70001+i,"Savannah Lions",0));
  original.state.combat.attacks.push({attacker:70001+i,defender:i<3?1:2,blocked:i===3,blockers:i===3?[70011,70012]:[],...(i===3?{planeswalker:70021}:{})});
}
original.state.players[2].zones.Battlefield.cards.push(permanent(70011,"Runeclaw Bear",2),permanent(70012,"SECRET FACE",2,{faceDown:true}),permanent(70021,"Garruk Wildspeaker",2,{types:["Planeswalker"],power:null,toughness:null,counters:{loyalty:3}}));
original.state.players[1].zones.Battlefield.cards.push(permanent(70013,"Grizzly Bears",1));
original.decision={id:"declare-blockers:29:1",kind:"declare-blockers",mode:"many",min:0,max:1,title:"Declare blockers",legalBlocks:[{blocker:70013,attackers:[70001]}],options:[{index:0,label:"Grizzly Bears blocks Savannah Lions",cardId:70013,attackerId:70001}]};
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const errors=[];
async function fixture(width,height,mode="full"){
  let current=structuredClone(original), socket;
  const frames=[], context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",serviceWorkers:"block"});
  await context.addInitScript(mode=>{localStorage.setItem("cm-board-view",mode);localStorage.setItem("crankmagic-audio-muted","true");},mode);
  const page=await context.newPage();
  if(stub) await stub(page);
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"combat@example.com"}}));
  await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
  await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table:{tableId:"combat01",phase:"playing",matchId:current.matchId,away:[],seats:current.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:"human",mat:"felt",you:p.playerId===current.seat}))},now:Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/combat01\/connect$/,ws=>{socket=ws;ws.onMessage(data=>frames.push(JSON.parse(data)));ws.send(JSON.stringify({type:"view",view:current}));});
  await page.goto(`${base}/index.html#table?id=combat01`);
  await page.locator(".cm-combat-row").first().waitFor();
  const publish=async change=>{change(current);current.revision++;socket.send(JSON.stringify({type:"view",view:current}));await page.waitForTimeout(150);};
  return {page,context,frames,publish};
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
  if(!reached)console.log(selector,JSON.stringify(await el.evaluate(el=>{const r=el.getBoundingClientRect(),parents=[];for(let p=el.parentElement;p&&parents.length<6;p=p.parentElement)parents.push({node:p.className,rect:p.getBoundingClientRect().toJSON(),overflow:getComputedStyle(p).overflow});return {rect:r.toJSON(),hits:[[.5,.5],[.2,.2],[.8,.8]].map(([x,y])=>document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.outerHTML.slice(0,300)),parents};}),null,2));
  assert.ok(reached,`${selector} receives the pointer without scrolling hidden overflow`);
  const r=await el.boundingBox();
  return {x:r.x+r.width/2,y:r.y+r.height/2};
}
async function shot(page,name){
  if(!process.env.UAT_SHOTS) return;
  mkdirSync(process.env.UAT_SHOTS,{recursive:true});
  await page.evaluate(()=>{
    const badge=document.createElement("div");badge.id="combat-proof";badge.textContent="C26 · Combat · objects #70001–70021";
    badge.style.cssText="position:fixed;left:4px;bottom:4px;padding:4px;background:#102425;color:white;font:11px system-ui;z-index:9999;pointer-events:none";
    document.body.append(badge);
  });
  await page.screenshot({path:path.join(process.env.UAT_SHOTS,name+".png")});
}
async function inspectPoint(page,id) {
  const selector=`.cm-r4-combat .cm-combat-thumb-inspect[data-card="${id}"]`;
  /* the picture heads the pop-up's own list (ROB-319), which a person scrolls back up to; that list only, never hidden overflow */
  await page.evaluate(()=>{const list=document.querySelector('.cm-required-popup #cm-board-decision>.cm-board-options');if(list)list.scrollTop=0;});
  for(let n=0;n<12;n++) {
    const box=await page.locator(selector).first().boundingBox(),row=await page.locator('.cm-combat-groups').boundingBox();
    if(box && box.x>=row.x && box.x+box.width<=row.x+row.width)break;
    const by=box?.x<row.x?'-1':'1';await page.locator(`.cm-combat-scroll[data-by="${by}"]`).click();await page.waitForTimeout(60);
  }
  return point(page,selector);
}
/* The card's inspection (C.modal, #cm-dialog): since ROB-319 the combat question is a dialog too, the pop-up. */
const inspection=page=>page.locator("#cm-dialog[open]");
try{
  for(const [width,height,mode] of [[1024,768,"full"],[1280,720,"full"],[1400,900,"full"],[1280,720,"table"],[1280,720,"focus"],[390,844,"focus"]]){
    const {page,context,frames,publish}=await fixture(width,height,mode);
    const where=`${mode} ${width}x${height}`, strip=page.locator(".cm-combat");
    console.log(where);
    assert.equal(await strip.count(),1,`${where}: one shared combat picture`);
    assert.deepEqual(await strip.locator(".cm-combat-row").evaluateAll(els=>[...new Set(els.map(el=>el.dataset.combatDefender))]),["1","2"],`${where}: distinct defender identities remain explicit in one row`);
    assert.equal(await strip.locator('[data-combat-role="Attacker"]').count(),6,`${where}: same-name attackers remain separate objects`);
    assert.equal(await strip.locator('[data-combat-attacker="70004"]').getAttribute("data-combat-target"),"70021",`${where}: planeswalker target uses its object ID`);
    assert.equal(await strip.locator('[data-combat-attacker="70004"] [data-combat-role="Blocker"]').count(),2,`${where}: both confirmed blockers shown`);
    assert.doesNotMatch(await strip.innerText(),/SECRET FACE|damage will/,`${where}: no hidden identity or promised damage`);
    /* On the phone the question is the centered pop-up (ROB-319; the desktop docks it above the board), and the blocker is reached
       as its tile there, not through the Actions drawer, which steps aside while the pop-up owns the sequence. */
    if(width<600) {const tile='.cm-required-popup [data-action=board-block-pair][data-block-object="70013"]';await page.locator(tile).first().scrollIntoViewIfNeeded();await point(page,tile);}
    /* Declaring blockers is the pop-up's (ROB-319), and the combat picture is in it, over the table: nothing is drawn over the
       picture, so every control in it can be reached. (It had its own room above the board, the shell's 188px combat row; docking
       the pop-up there, Rob's call of 2026-10-30, left the hand over the mat in Table and Focus, and waits for a wireframe:
       2026-10-31.) */
    if(width>=1024){
      const over=await strip.evaluate(el=>{const r=el.getBoundingClientRect();return [[.5,.5],[.1,.2],[.9,.2]].map(([fx,fy])=>document.elementFromPoint(r.x+r.width*fx,r.y+r.height*fy)).filter(h=>!h||!h.closest('.cm-required-popup')).map(h=>h?h.className:'nothing');});
      assert.ok(await strip.evaluate(el=>!!el.closest('.cm-required-popup')),`${where}: the combat picture is in the question's pop-up`);
      assert.deepEqual(over,[],`${where}: and nothing is drawn over it`);
    }
    if(width>=1024){
      for(const id of [70004,70021,70011,70012]) await inspectPoint(page,id);
      const face=await inspectPoint(page,70012);
      await page.mouse.click(face.x,face.y);
      assert.doesNotMatch(await inspection(page).innerText(),/SECRET FACE/,`${where}: inspecting a face-down object keeps its identity private`);
      assert.equal(await inspection(page).locator("img").count(),0,`${where}: the hidden face is never requested`);
      await page.getByRole("button",{name:"Close",exact:true}).last().click();
    }
    const publicBefore=await strip.locator('[data-combat-role="Blocker"]').count();
    if(width>600){
      await page.locator('[data-action="board-block-pair"][data-index="0"]').click();
      assert.equal(await strip.locator('[data-combat-role="Blocker"]').count(),publicBefore,`${where}: local block pairs do not become public confirmed assignments`);
      assert.equal(await strip.locator('[data-draft-blocker="70013"]').count(),1,`${where}: draft is explicitly local to this seat`);
      assert.equal(frames.filter(f=>f.type==='act').length,0,`${where}: selection and local draft send no answer`);
    }
    const p=await inspectPoint(page,70001);
    await page.mouse.click(p.x,p.y);
    await inspection(page).waitFor();
    assert.match(await inspection(page).innerText(),/Object #70001/,`${where}: inspect identifies the exact same-name object`);
    assert.equal(frames.filter(f=>f.type==="act").length,0,`${where}: inspection never plays a card or assigns a block`);
    await page.getByRole("button",{name:"Close",exact:true}).last().click();
    const list=page.locator(".cm-combat-groups");
    /* r4 W06 supersedes wrapping: all assignments stay in one row with native horizontal navigation. */
    if(width>=1000){
      let combat;
      await publish(v=>{combat=structuredClone(v.state.combat);v.state.combat.attacks=v.state.combat.attacks.filter(a=>a.planeswalker===undefined).map(a=>({...a,defender:1}));});
      const lay=await list.evaluate(g=>{const rows=[...g.querySelectorAll('.cm-combat-row')].map(r=>r.getBoundingClientRect());return {sameLine:rows.length>1&&Math.abs(rows[0].top-rows[1].top)<1,wrapped:rows.some(r=>r.top>rows[0].top+1),sideways:g.scrollWidth>g.clientWidth+1,rows:rows.length};});
      assert.ok(lay.sameLine&&!lay.wrapped&&lay.sideways,`${where}: one row keeps complete horizontal navigation (${JSON.stringify(lay)})`);
      await publish(v=>{v.state.combat=combat;});
    }
    const r=await list.boundingBox();
    const horizontal=await list.evaluate(el=>el.scrollWidth>el.clientWidth);
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
    await page.mouse.wheel(horizontal?3000:0,horizontal?0:3000);await page.waitForTimeout(150);
    const scroll=await list.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
    assert.ok(scroll.x>0||scroll.y>0,`${where}: crowded combat can actually scroll`);
    await publish(()=>{});
    assert.deepEqual(await list.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop})),scroll,`${where}: room refresh keeps the scrolled combat`);
    await list.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});
    if(width===1280&&mode==="full") await shot(page,"rob-26-combat-1280x720");
    if(width===390) await shot(page,"rob-26-combat-390x844");
    await publish(v=>{
      v.state.players[2].zones.Battlefield.cards=v.state.players[2].zones.Battlefield.cards.filter(c=>![70011,70012,70021].includes(c.cardId));
      // Put an old identity in a private zone: combat must not use it to name a missing object.
      v.state.players[2].zones.Hand.cards.push(permanent(70021,"SECRET IN HAND",2));
    });
    assert.match(await strip.locator('[data-combat-attacker="70004"]').innerText(),/Blocked · no blockers remain/,`${where}: removed blockers do not make the attacker unblocked`);
    assert.match(await strip.innerText(),/Attacked permanent left the battlefield/,`${where}: missing planeswalker is explicit`);
    assert.doesNotMatch(await strip.innerText(),/SECRET IN HAND/,`${where}: no private-zone lookup`);
    await publish(v=>{v.state.players[0].zones.Battlefield.cards=v.state.players[0].zones.Battlefield.cards.filter(c=>c.cardId!==70001);});
    assert.equal(await strip.locator('[data-combat-attacker="70001"]').count(),0,`${where}: removed attacker has no stale row`);
    await publish(v=>{v.state.combat=null;v.state.phase="MAIN2";});
    assert.equal(await strip.count(),0,`${where}: combat end removes the picture`);
    assert.equal(await page.locator("#cm-board[data-combat]").count(),0,`${where}: reserved space removed with combat`);
    await context.close();
  }
  assert.deepEqual(errors,[],"no browser errors");
  console.log("board-combat-display: PASS (public IDs, targets, blockers, private drafts, removal, inspection, scrolling, desktop and phone pointer reach)");
}finally{await close();}
