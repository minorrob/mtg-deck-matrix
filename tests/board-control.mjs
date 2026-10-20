/* ROB-171: controller placement and ownership references against current public room fields.
 * The missing ROB-172 provenance contract is deliberately not fabricated by this fixture. */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-control",flag:"GEOMETRY_REQUIRED"});
const original=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
original.revision=30000; original.seat=0; original.seatId="s0"; original.decision=null;
original.state.combat={attacks:[]}; original.state.phase="MAIN1"; original.state.turnPlayerId=1;
delete original.yourTurn;
for(const p of original.state.players){p.name=["Alex","Blair","Casey","Drew"][p.playerId];p.zones.Battlefield={count:0,cards:[]};p.zones.Hand.cards=[];}
original.state.players[0].zones.Hand.count=0;
const permanent=(cardId,name,owner,controller,extra={})=>({cardId,name,owner,controller,faceDown:false,tapped:false,damage:0,counters:{},types:["Creature"],power:2,toughness:2,keywords:[],commander:false,...extra});
original.state.players[0].zones.Battlefield={count:3,cards:[
  permanent(71001,"Grizzly Bears",0,1),
  permanent(71002,"Forest",0,1,{types:["Land"],power:null,toughness:null}),
  permanent(71003,null,0,1,{faceDown:true,faceDownName:"SECRET IDENTITY"})
]};
original.state.players[1].zones.Battlefield={count:1,cards:[permanent(71004,"Grizzly Bears",1,1)]};
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const errors=[];
async function fixture(width,height,mode="full",seat=0,scale=100){
  let current=structuredClone(original),socket;
  current.seat=seat;current.seatId=`s${seat}`;current.state.players[seat].zones.Hand.count=0;
  const frames=[],context=await browser.newContext({viewport:{width,height},hasTouch:width<600,reducedMotion:"reduce",serviceWorkers:"block"});
  await context.addInitScript(({mode,scale})=>{
    localStorage.setItem("cm-board-view",mode);localStorage.setItem("crankmagic-audio-muted","true");
    localStorage.setItem("cm-board-scale:board",String(scale));
    // A saved per-account module layout, set before board registration, not a product-code override.
    globalThis.CrankFeatures=[C=>{C.state.preferences={...C.state.preferences,play:{sidePane:{version:2,owner:"control@example.com",left:[],right:["resources","counter"]}}};}];
  },{mode,scale});
  const page=await context.newPage();if(stub)await stub(page);
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"control@example.com"}}));
  await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
  await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table:{tableId:"control01",phase:"playing",matchId:current.matchId,away:[],seats:current.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:"human",mat:"felt",you:p.playerId===seat}))},now:Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/control01\/connect$/,ws=>{socket=ws;ws.onMessage(data=>frames.push(JSON.parse(data)));ws.send(JSON.stringify({type:"view",view:current}));});
  await page.goto(`${base}/index.html#table?id=control01`);
  await page.locator(".cm-mat").first().waitFor();
  const publish=async change=>{change(current);current.revision++;socket.send(JSON.stringify({type:"view",view:current}));await page.waitForTimeout(180);};
  return {page,context,frames,publish};
}
async function point(page,selector){
  const el=page.locator(selector).first();
  assert.ok(await el.evaluate(el=>{const r=el.getBoundingClientRect();return [[.5,.5],[.25,.25],[.75,.75]].every(([fx,fy])=>{const x=r.x+r.width*fx,y=r.y+r.height*fy;return x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&el.contains(document.elementFromPoint(x,y));});}),`${selector}: reachable without Playwright scrolling overflow:hidden`);
  const r=await el.boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};
}
async function shot(page,width,height){
  if(!process.env.UAT_SHOTS)return;
  mkdirSync(process.env.UAT_SHOTS,{recursive:true});
  await page.evaluate(()=>{const b=document.createElement("div");b.textContent="C171 · Control · #71001–71004 · ownership-only slice";b.style.cssText="position:fixed;left:4px;bottom:4px;padding:4px;background:#102425;color:white;font:11px system-ui;z-index:9999;pointer-events:none";document.body.append(b);});
  await page.screenshot({path:path.join(process.env.UAT_SHOTS,`rob-171-control-${width}x${height}.png`)});
}
try{
  for(const [width,height,mode] of [[1024,768,"full"],[1280,720,"full"],[1400,900,"full"],[1280,720,"table"],[1280,720,"focus"],[390,844,"focus"]]){
    const {page,context,frames,publish}=await fixture(width,height,mode);
    const owner=page.locator('.cm-mat[data-seat="0"]'),controller=page.locator('.cm-mat[data-seat="1"]');
    assert.equal(await owner.locator('[data-card="71001"]').count(),0,"owner has no playable copy");
    assert.equal(await owner.locator(".cm-control-ghost").count(),3,"one ownership ghost per controlled permanent");
    assert.equal(await owner.locator('[data-control-card="71002"]').count(),1,"land retains an ownership reference");
    if(await controller.count()){
      assert.equal(await controller.locator('[data-card="71001"]').count(),1,"current controller has exactly one real object");
      assert.equal(await controller.locator('[data-card="71002"]').count(),1,"controlled land moves too");
      assert.match(await controller.locator('[data-card="71001"]').getAttribute("class"),/is-controlled/);
      assert.equal(await controller.locator('[data-card="71004"].is-controlled').count(),0,"same-name owned card is distinct and unmarked");
      assert.equal(await controller.locator('[data-card="71001"] .cm-control-label').innerText(),"Owner: You");
    }
    assert.doesNotMatch(await page.locator("#cm-board").innerHTML(),/SECRET IDENTITY/,"neither reference nor card leaks a permitted face-down identity");
    const selector='.cm-mat[data-seat="0"] [data-control-card="71001"]',ghost=page.locator(selector);
    assert.equal(await ghost.getAttribute("data-card"),null,"reference is outside all game-card handlers");
    assert.equal(await ghost.getAttribute("draggable"),null,"reference cannot be reordered as a game object");
    const contrast=await ghost.locator(".cm-bcard-name").evaluate(el=>{
      const s=getComputedStyle(el), luminance=color=>{
        const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
        return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      }, a=luminance(s.color), b=luminance(s.backgroundColor);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(contrast>=4.5,"fallback ghost name remains readable against its opaque background");
    const p=await point(page,selector);await page.mouse.move(p.x,p.y);
    await page.locator("#cm-control-peek").waitFor();
    assert.match(await page.locator("#cm-control-peek").innerText(),/Controlled by Blair · Owned by You/);
    assert.match(await page.locator("#cm-control-peek").innerText(),/Return condition unavailable/,"unknown duration is not invented");
    if(mode==="full"&&width===1280||width===390)await shot(page,width,height);
    await page.keyboard.press("Escape");assert.equal(await page.locator("#cm-control-peek").count(),0,"Escape dismisses hover");
    const faceGhost=owner.locator('[data-control-card="71003"]');
    await faceGhost.focus();
    await publish(v=>{v.state.players[0].zones.Battlefield.cards[1].tapped=true;});
    assert.equal(await page.evaluate(()=>document.activeElement.id),"cm-control-ref-71003","a redraw preserves the exact ghost's keyboard focus");
    assert.match(await page.locator("#cm-control-peek").innerText(),/Face-down card/);
    await ghost.focus();await page.locator("#cm-control-peek").waitFor();
    await page.keyboard.press("Enter");await page.getByRole("dialog").waitFor();
    assert.match(await page.getByRole("dialog").innerText(),/Object #71001/);
    assert.equal(frames.filter(f=>f.type==="act").length,0,"ghost hover and keyboard inspect never answer a decision");
    await publish(v=>{v.state.players[0].zones.Battlefield.cards[0].controller=2;});
    assert.match(await page.getByRole("dialog").innerText(),/Controlled by Casey/,"open details follow the authoritative re-steal");
    await page.getByRole("button",{name:"Close",exact:true}).last().click();
    assert.equal(await owner.locator('[data-control-card="71001"] .cm-control-label').innerText(),"With Casey");
    if(await page.locator('.cm-mat[data-seat="2"]').count())assert.equal(await page.locator('.cm-mat[data-seat="2"] [data-card="71001"]').count(),1);
    const next=await point(page,selector);
    if(width<600)await page.touchscreen.tap(next.x,next.y);else await page.mouse.click(next.x,next.y);
    assert.equal(frames.filter(f=>f.type==="act").length,0,"pointer/touch ghost inspection cannot submit an answer");
    await publish(v=>{v.state.players[0].zones.Battlefield.cards[0].controller=0;});
    assert.match(await page.getByRole("dialog").innerText(),/now controlled by its owner/);
    assert.equal(await owner.locator('[data-control-card="71001"]').count(),0,"return removes the ghost");
    assert.equal(await owner.locator('[data-card="71001"]:not(.is-controlled)').count(),1,"returned real object has no foreign marker");
    await publish(v=>{v.state.players[0].zones.Battlefield.cards=v.state.players[0].zones.Battlefield.cards.filter(c=>c.cardId!==71001);});
    assert.match(await page.getByRole("dialog").innerText(),/no longer on this battlefield/,"removed objects cannot leave stale details");
    assert.equal(await owner.locator('[data-card="71001"],[data-control-card="71001"]').count(),0);
    await publish(v=>{v.matchId+="-next";v.state.players[0].zones.Battlefield.cards.push(permanent(71001,"Grizzly Bears",0,1));});
    assert.match(await page.getByRole("dialog").innerText(),/no longer on this battlefield/,"a new match reusing an object ID cannot replace an old inspection");
    await page.getByRole("button",{name:"Close",exact:true}).last().click();
    await context.close();
    console.log(`Control: ${mode} ${width}x${height} passed`);
  }
  // Rejoining as the controller must place the object from the first frame, without local event history.
  const {page,context,publish}=await fixture(1280,720,"full",1);
  await point(page,'.cm-mat[data-seat="1"] [data-card="71001"]');
  assert.equal(await page.locator('.cm-mat[data-seat="1"] [data-card="71001"] .cm-control-label').innerText(),"Owner: Alex");
  assert.match(await page.locator(".cm-resources").innerText(),/Forest/,"controlled lands enter the controller's resources");
  const counts=await page.locator(".cm-module-counts").evaluateAll(els=>els.map(el=>Object.fromEntries([...el.querySelectorAll("dl>div")].map(row=>[row.querySelector("dt").textContent,Number(row.querySelector("dd").textContent)]))));
  assert.equal(counts[0].Creatures,0,"owner's counts exclude the ghosts");
  assert.equal(counts[1].Creatures,3,"controller counts the real creatures including a face-down one");
  await publish(v=>{v.decision={id:"control-legal:1",kind:"priority",mode:"one",title:"Your priority",options:[71001,71004].map((id,index)=>({index,act:"activate",label:"Activate Grizzly Bears",cardId:id}))};});
  const controlled=page.locator('.cm-mat[data-seat="1"] [data-card="71001"].is-bright'),owned=page.locator('.cm-mat[data-seat="1"] [data-card="71004"].is-bright');
  assert.equal(await controlled.count(),1,"room legal actions still highlight the controlled object");
  assert.equal(await controlled.evaluate(el=>getComputedStyle(el).boxShadow),await owned.evaluate(el=>getComputedStyle(el).boxShadow),"ownership marker must preserve the existing legal-action glow");
  await context.close();
  for(const [width,height,mode,scale] of [[1400,900,"full",60],[1400,900,"full",160],[390,844,"focus",60],[390,844,"focus",130]]){
    const {page,context}=await fixture(width,height,mode,0,scale);
    const el=page.locator('[data-control-card="71001"] .cm-control-label');
    assert.ok(await el.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=10),"ownership label keeps the required font minimum at both card-size endpoints");
    const p=await point(page,'[data-control-card="71001"]');
    await page.mouse.move(p.x,p.y);await page.locator("#cm-control-peek").waitFor();
    assert.match(await page.locator("#cm-control-peek").innerText(),/Controlled by Blair/,"full controller name remains readable at either endpoint");
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log("Changed-control placement, ownership ghosts, identity privacy and pointer reach passed.");
}finally{await close();}
