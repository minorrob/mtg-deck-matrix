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
  assert.ok(await el.evaluate(el=>{
    const r=el.getBoundingClientRect();
    return [[.5,.5],[.2,.2],[.8,.8]].every(([fx,fy])=>{
      const x=r.x+r.width*fx,y=r.y+r.height*fy;
      return x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&el.contains(document.elementFromPoint(x,y));
    });
  }),`${selector} receives the pointer without scrolling hidden overflow`);
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
try{
  for(const [width,height,mode] of [[1024,768,"full"],[1280,720,"full"],[1400,900,"full"],[1280,720,"table"],[1280,720,"focus"],[390,844,"focus"]]){
    const {page,context,frames,publish}=await fixture(width,height,mode);
    const where=`${mode} ${width}x${height}`, strip=page.locator(".cm-combat");
    assert.equal(await strip.count(),1,`${where}: one shared combat picture`);
    assert.deepEqual(await strip.locator(".cm-combat-group").evaluateAll(els=>els.map(el=>el.dataset.combatDefender)),["1","2"],`${where}: distinct defenders stay grouped`);
    assert.equal(await strip.locator('[data-combat-role="Attacker"]').count(),6,`${where}: same-name attackers remain separate objects`);
    assert.equal(await strip.locator('[data-combat-attacker="70004"]').getAttribute("data-combat-target"),"70021",`${where}: planeswalker target uses its object ID`);
    assert.equal(await strip.locator('[data-combat-attacker="70004"] [data-combat-role="Blocker"]').count(),2,`${where}: both confirmed blockers shown`);
    assert.doesNotMatch(await strip.innerText(),/SECRET FACE|Unblocked|damage will/,`${where}: no hidden identity or promised damage`);
    if(width<600) await point(page,'.cm-phone-center .cm-mat [data-card="70013"]');
    if(width>=1024){
      for(const id of [70004,70021,70011,70012]) await point(page,`.cm-combat [data-card="${id}"]`);
      const face=await point(page,'.cm-combat [data-card="70012"]');
      await page.mouse.click(face.x,face.y);
      assert.doesNotMatch(await page.getByRole("dialog").innerText(),/SECRET FACE/,`${where}: inspecting a face-down object keeps its identity private`);
      assert.equal(await page.getByRole("dialog").locator("img").count(),0,`${where}: the hidden face is never requested`);
      await page.getByRole("button",{name:"Close",exact:true}).last().click();
    }
    const before=await strip.innerText();
    if(width>600){
      const p=await point(page,'[data-action="board-option"][data-index="0"]');await page.mouse.click(p.x,p.y);
      assert.equal(await strip.innerText(),before,`${where}: an unfinished block draft stays out of the confirmed picture`);
      await point(page,'[data-action="board-confirm"]');
      assert.equal(frames.filter(f=>f.type==="act").length,0,`${where}: draft selection sends no answer`);
    }
    const p=await point(page,'.cm-combat [data-card="70001"]');
    await page.mouse.click(p.x,p.y);
    await page.getByRole("dialog").waitFor();
    assert.match(await page.getByRole("dialog").innerText(),/Object #70001/,`${where}: inspect identifies the exact same-name object`);
    assert.equal(frames.filter(f=>f.type==="act").length,0,`${where}: inspection never plays a card or assigns a block`);
    await page.getByRole("button",{name:"Close",exact:true}).last().click();
    const list=page.locator(".cm-combat-groups");
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
    assert.match(await strip.innerText(),/Object #70021 left the battlefield/,`${where}: missing planeswalker is explicit`);
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
