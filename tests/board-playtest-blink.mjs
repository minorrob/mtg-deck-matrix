/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* ROB-210: browser Confirm packets applied to actual saved-card rooms, with no manufactured decision/state.
   Repeated 60-card fixture decks/storage copies are setup, not G3/G5 Commander-load acceptance evidence. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {memoryStorage,createMatchStore} from "../game/engine/storage.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {startRoom,openRoom,basicCards,leastAnswer} from "../game/room/room.mjs";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
import {GameRoom} from "../cloud/game-room.mjs";

let checks=0,serial=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
const BRAGO="Brago, King Eternal",THASSA="Thassa, Deep-Dwelling",JUMPER="Claim Jumper";
const index=loadCardIndex(),cards=name=>index.definition(name)??basicCards(name);
const field=(v,seat)=>v.state.players[seat].zones.Battlefield.cards;
const lands=(v,seat)=>field(v,seat).filter(c=>c.types.includes("Land"));
const request=(v,answer)=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...answer});
async function prepare(source){
  const storage=memoryStorage(),matchId=source===BRAGO?"blink-ui-brago":"blink-ui-thassa";
  const room=await startRoom({storage,cards,matchId,seed:`native-${matchId}`,pod:{passEmpty:true,passStack:true,passAfterCast:true,pooledTaps:true,sourceChoices:true,seats:[
    {seatId:"p0",name:"Rob",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>[source,JUMPER,"Plains","Island","Plains","Island"][n%6])},
    {seatId:"p1",name:"Maya",pilot:"human",commander:[],cards:Array(60).fill("Forest")} ]}});
  for(let n=0;n<2400;n++){
    const v=room.view(room.waitingOn),d=v.decision;if(!d)throw new Error(`Native ${source} fixture ended before its blink question`);
    const active=field(v,0),holder=active.find(c=>c.name===source),jumper=active.find(c=>c.name===JUMPER);
    if(v.seat===0&&holder&&jumper&&lands(v,1).length>lands(v,0).length&&d.sourceId===holder.cardId&&d.id.startsWith("choose-targets:")&&d.mode==="many"&&d.max>0)
      return {storage,matchId,view:v,source};
    let answer=null;
    if(d.id.startsWith("declare-attackers:")){
      const attacker=source===BRAGO&&holder&&jumper&&lands(v,1).length>lands(v,0).length?d.options.find(o=>o.cardId===holder.cardId):null;
      answer={indices:attacker?[attacker.index]:[]};
    }else{
      let option=d.options.find(o=>/keep/i.test(o.label)&&!o.act);
      if(!option&&v.seat===0){
        const ownLands=lands(v,0),wanted=["Plains","Island"].find(name=>ownLands.filter(c=>c.name===name).length<2&&d.options.some(o=>o.act==="play-land"&&o.label===name));
        option=wanted?d.options.find(o=>o.act==="play-land"&&o.label===wanted):null;
        if(!option)option=d.options.find(o=>o.act==="cast"&&((o.label===source&&!holder)||(o.label===JUMPER&&!jumper)));
        if(!option&&/Search for a Plains card/.test(d.title))option=d.options.find(o=>o.label==="No");
      }else if(!option)option=d.options.find(o=>o.act==="play-land");
      option??=d.options.find(o=>o.act==="pass");
      answer=option?{indices:[option.index]}:leastAnswer(d);
    }
    await room.act(v.seatId,request(v,answer));
  }
  throw new Error(`Native ${source} fixture exceeded its explicit decision bound`);
}
async function copiedRoom(prepared){
  const storage=memoryStorage();
  for(const key of await prepared.storage.list())await storage.put(key,await prepared.storage.get(key));
  return {storage,room:await openRoom({storage,cards,matchId:prepared.matchId}),store:createMatchStore(storage,prepared.matchId)};
}
const prepared=[await prepare(BRAGO),await prepare(THASSA)];
const {browser,base,stub,close}=await openBrowser({name:"board-playtest-blink",flag:"GEOMETRY_REQUIRED"});
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE="blinkui01";
async function pick(page,index){
  const direct=page.locator(`#cm-board-decision [data-action=board-option][data-index="${index}"]`).first();
  if(await direct.count()){await direct.click();return;}
  for(const group of await page.locator("#cm-board-decision [data-action=board-option-same]").all()){
    if((await group.getAttribute("data-same")??"").split(",").map(Number).includes(index)){await group.click();return;}
  }
  throw new Error(`No visible native option ${index}`);
}
async function exercise(prepared,mode,selection,findPlains){
  const {room,store}=await copiedRoom(prepared),initial=room.view("p0"),old=initial.decision.id;
  const originalLandCount=lands(initial,0).length,oldJumper=field(initial,0).find(c=>c.name===JUMPER).cardId;
  const before=await store.readJournal(),packets=[],serverErrors=[],pageErrors=[];
  const table={tableId:TABLE,phase:"playing",matchId:prepared.matchId,away:[],blockers:[],youAreHost:true,rules:{},
    seats:initial.state.players.map((p,i)=>({seatId:`p${i}`,name:p.name,kind:"human",you:i===0,occupied:true,ready:true,mat:"felt"}))};
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
  try{
    await context.addInitScript(m=>{localStorage.setItem("cm-board-view",m);localStorage.setItem("crankmagic-audio-muted","true");},mode);
    const page=await context.newPage();if(stub)await stub(page);
    page.on("pageerror",e=>pageErrors.push(e.message));
    await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
    await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"rob@example.com"}}));
    await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
    await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
    let queue=Promise.resolve();
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`),ws=>{
      /* Reuse the actual production dispatcher: act strips only type; check gets the real checked/refused response. */
      const socket={send:text=>{const reply=JSON.parse(text);if(reply.type==="refused")serverErrors.push(reply.error);ws.send(text);}};
      const host=Object.assign(Object.create(GameRoom.prototype),{room,load:async()=>room,
        ctx:{getTags:()=>["p0"],getWebSockets:()=>[socket],storage:{setAlarm:async()=>{}}}});
      ws.onMessage(raw=>{
        const packet=JSON.parse(raw);if(packet.type==="act")packets.push(packet);
        queue=queue.then(()=>host.webSocketMessage(socket,raw));
      });
      ws.send(JSON.stringify({type:"view",view:initial}));
    });
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board-decision").waitFor({state:"visible",timeout:20000});
    const settle=async(mark)=>{
      for(let n=0;n<100&&packets.length===mark;n++)await page.waitForTimeout(50);
      eq(packets.length,mark+1,`${mode}/${prepared.source}: the actual browser sends exactly one Confirm request`);
      await queue;eq(serverErrors,[],"the actual room accepts the browser's unmodified selection");
      await page.waitForTimeout(200);
    };
    const confirm=()=>page.locator("#cm-board-decision [data-action=board-confirm]").first();
    const submit=async(indices)=>{
      const mark=packets.length;for(const i of indices)await pick(page,i);
      ok(await confirm().isEnabled(),"the native counted question enables Confirm for its legal selection");
      await confirm().click();await settle(mark);
    };
    const wanted=selection.map(name=>initial.decision.options.find(o=>o.label===name).index);
    await submit(wanted);
    eq([...packets[0].indices].sort(),[...wanted].sort(),"the actual network packet contains the selected native target indices");
    if(selection.includes(JUMPER)){
      let v=room.view("p0");ok(/Search for a Plains card/.test(v.decision?.title??""),"actual blink reentry reaches Claim Jumper's real optional search");
      const yes=v.decision.options.find(o=>o.label==="Yes").index,mark=packets.length;
      await pick(page,yes);
      await page.waitForTimeout(50);
      if(packets.length===mark){await confirm().click();}
      await settle(mark);
      v=room.view("p0");eq([v.decision.min,v.decision.max],[0,1],"the browser now shows the actual zero-or-one Plains search");
      ok(v.decision.options.every(o=>/^Plains/.test(o.label)),"the real library search offers Plains cards rather than manufactured sample Islands");
      await submit(findPlains?[v.decision.options[0].index]:[]);
      v=room.view("p0");
      if(/Search for a Plains card/.test(v.decision?.title??"")){
        const no=v.decision.options.find(o=>o.label==="No").index,mark=packets.length;
        await pick(page,no);await page.waitForTimeout(50);if(packets.length===mark)await confirm().click();await settle(mark);
      }
      ok(field(room.view("p0"),0).find(c=>c.name===JUMPER).cardId!==oldJumper,"the accepted browser blink really created the new Claim Jumper object");
    }
    const final=room.view("p0"),point=await store.latestCheckpoint(),added=(await store.readJournal()).slice(before.length);
    eq(lands(final,0).length,originalLandCount+(findPlains?1:0),"actual browser search moves exactly the chosen number of lands");
    eq(added.filter(e=>e.kind==="GameEventShuffle").length,selection.includes(JUMPER)?1:0,"actual search/fail-to-find shuffles once; zero-target blink never searches");
    eq([point.state.awaiting?.kind??null,point.state.stack.length],[null,0],"the real browser-driven blink/search chain completes with no stuck decision or stack");
    ok(final.decision?.id!==old,"the old native target question has really advanced");
    eq(pageErrors,[],"the native-backed browser flow has no page errors");
  }catch(error){
    const point=await store.latestCheckpoint(),v=room.view("p0");
    error.message+=`\nNative ${mode}/${prepared.source}/${selection.join("+")||"none"}: ${JSON.stringify({phase:point.state.phase,priority:point.state.priorityPlayer,awaiting:point.state.awaiting?.kind??null,
      stack:point.state.stack.map(e=>e.name??e.cardId??e.stackId),decision:v.decision?.title??null,packets:packets.map(p=>({kind:p.kind,indices:p.indices})),serverErrors,pageErrors})}`;
    throw error;
  }finally{await context.close();}
}
try{
  for(const mode of ["focus","full"]){
    await exercise(prepared[0],mode,[],false);
    await exercise(prepared[0],mode,[JUMPER],true);
    await exercise(prepared[0],mode,[BRAGO,JUMPER],false);
    await exercise(prepared[1],mode,[],false);
    await exercise(prepared[1],mode,[JUMPER],true);
  }
  console.log(`board-playtest-blink: ${checks} checks; real saved-card rooms accept browser Confirm through blink, reentry and Plains search`);
}finally{await close();}
