/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Unregistered proposed Play regression: actual native room/socket/check dispatch, never manufactured view choices.
   --prepare-only runs native fixture checks without starting a browser. --candidate serves the unapplied two-line UI
   proposal only to this test context; production crankmagic-board.js remains untouched. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "../../../../tests/uat/browser-runner.mjs";
import {GameRoom} from "../../../../cloud/game-room.mjs";
import {snoopRoom,mainAndFund,killSnoop,verifyNativeSnoop} from "./SNOOP-ROOM-FIXTURE.mjs";
import {candidateBoard} from "./SNOOP-RENDERER-PROPOSAL.mjs";
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
if(process.argv.includes("--prepare-only")){
 await verifyNativeSnoop();console.log("Snoop browser proposal: native held draw, public next top, real paid Goblin cast and source departure verified; browser not started");
}else{
 const {browser,base,stub,close}=await openBrowser({name:"board-playtest-snoop-proposal",flag:"GEOMETRY_REQUIRED"});
 const candidate=process.argv.includes("--candidate"),html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
 try{
  for(const mode of ["table","focus","full"]){
   const fixture=await snoopRoom(),{room,store,first,second,third}=fixture,contexts=[],pages=[],sockets=[],packets=[],errors=[],refusals=[];let queue=Promise.resolve();
   const host=Object.assign(Object.create(GameRoom.prototype),{room,load:async()=>room,ctx:{getTags:s=>[s.seatId],getWebSockets:()=>sockets,storage:{setAlarm:async()=>{}}}});
   try{
    for(const seat of [0,1]){
     const seatId=`p${seat}`,context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});contexts.push(context);
     await context.addInitScript(m=>{localStorage.setItem("cm-board-view",m);localStorage.setItem("crankmagic-audio-muted","true");},mode);
     const page=await context.newPage();pages.push(page);if(stub)await stub(page);page.on("pageerror",e=>errors.push(e.message));
     const table={tableId:"snoopui01",phase:"playing",matchId:fixture.matchId,away:[],blockers:[],youAreHost:seat===0,rules:{},seats:room.view(seatId).state.players.map((p,i)=>({seatId:`p${i}`,name:p.name,kind:"human",you:i===seat,occupied:true,ready:true,mat:"felt"}))};
     await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
     await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"rob@example.com"}}));await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
     if(candidate)await page.route(`${base}/crankmagic-board.js*`,r=>r.fulfill({contentType:"text/javascript",body:candidateBoard(readFileSync(path.join(ROOT,"crankmagic-board.js"),"utf8"))}));
     await page.routeWebSocket(new RegExp("/api/tables/snoopui01/connect$"),ws=>{
      const socket={seatId,send:text=>{const frame=JSON.parse(text);if(frame.type==="refused")refusals.push(frame.error);ws.send(text);}};sockets.push(socket);
      ws.onMessage(raw=>{const frame=JSON.parse(raw);if(frame.type==="act")packets.push({seatId,...frame});queue=queue.then(()=>host.webSocketMessage(socket,raw));});
      ws.send(JSON.stringify({type:"view",view:room.view(seatId)}));
     });
     await page.goto(`${base}/index.html#table?id=snoopui01`);await page.locator("#cm-board .cm-mat").first().waitFor({state:"visible",timeout:20000});
     if(mode==="full"){await page.locator('[data-engine="babylon"][data-renderer="webgl"]').waitFor({state:"visible",timeout:20000});ok(true,"the shared mat is mounted in the actual Babylon WebGL 3D path");}
    }
    const library=(page,seat)=>page.locator(`#cm-board .cm-mat[data-seat="${seat}"] [data-zone="library"]`).first();
    const shown=async(id,name)=>{for(const page of pages){const top=library(page,0).locator(`.cm-bcard[data-card="${id}"]`);await top.waitFor({state:"visible",timeout:15000});ok((await top.getAttribute("aria-label")).includes(name),`${mode}: both viewers see the native revealed top ${name}`);eq(await library(page,1).locator("[data-card]").count(),0,`${mode}: the other library stays unseen`);}};
    const waitPacket=async(mark)=>{for(let n=0;n<100&&packets.length===mark;n++)await pages[0].waitForTimeout(50);eq(packets.length,mark+1,"one native UI action produces one socket act");await queue;eq(refusals,[],"the production dispatcher accepts the unchanged browser action");await pages[0].waitForTimeout(250);};
    await shown(first,"Mogg Fanatic");eq(room.watch().state.players[0].zones.Library.cards[0].cardId,first,"spectator projection receives the same public top, never an unseen library");
    eq(await library(pages[0],0).locator(`[data-card="${first}"]`).getAttribute("data-action"),"board-draw","a revealed own top retains the actual held-draw action");
    ok((await library(pages[0],0).locator(`[data-card="${first}"]`).getAttribute("aria-label")).startsWith("Draw card: "),"the visible held top still announces its draw action");
    eq(await library(pages[1],0).locator(`[data-card="${first}"]`).getAttribute("data-action"),"board-card","another viewer can inspect the public top without drawing for its owner");
    const hand=room.view("p0").state.players[0].zones.Hand.count,mark=packets.length;await library(pages[0],0).locator(`[data-card="${first}"]`).click();await waitPacket(mark);
    eq(room.view("p0").state.players[0].zones.Hand.count,hand+1,"held-draw click enters the actual native draw handler once");await shown(second,"Goblin Instigator");eq(room.view("p1").state.players[0].zones.Hand.cards,[],"the opponent's hand projection remains hidden after the known top is drawn");
    await mainAndFund(room);host.broadcast();await pages[0].waitForTimeout(250);
    const top=library(pages[0],0).locator(`[data-card="${second}"]`);eq(await top.getAttribute("data-action"),"board-card","after the draw, a new top uses normal native card actions");
    await top.click();const cast=pages[0].locator(`#cm-card-menu [data-action="board-card-menu-do"][data-act="cast"][data-card="${second}"]`);await cast.waitFor({state:"visible",timeout:10000});
    const castMark=packets.length;await cast.click();await waitPacket(castMark);await shown(third,"Mountain");
    ok(room.view("p0").state.players[0].zones.Battlefield.cards.some(c=>c.name==="Goblin Instigator"),"the real top Goblin was cast and resolved using actual funded mana");
    eq((await store.readJournal()).filter(e=>e.kind==="GameEventSpellAbilityCast"&&e.data.fields.card.name==="Goblin Instigator").length,1,"native journal records exactly one actual Goblin cast");
    await library(pages[0],0).locator(`[data-card="${third}"]`).click();eq(await pages[0].locator('#cm-card-menu [data-action="board-card-menu-do"][data-act="cast"]').count(),0,"Snoop does not make the next Mountain castable");
    await pages[0].keyboard.press("Escape");await killSnoop(fixture);host.broadcast();await pages[0].waitForTimeout(350);
    for(const page of pages){eq(await library(page,0).locator("[data-card]").count(),0,"after actual Bolt removes Snoop, the formerly public library becomes a back again");eq(await library(page,1).locator("[data-card]").count(),0,"the other library remains unseen throughout");}
    eq(room.watch().state.players[0].zones.Library.cards,[],"spectator projection also loses top visibility when the actual source dies");eq(errors,[],"the native-backed browser contexts report no page errors");
   }finally{for(const context of contexts)await context.close();}
  }
  console.log(`Snoop proposed browser: ${checks} checks; ${candidate?"candidate bytes only":"current production renderer"}, actual held draw, paid top cast, refresh and public/hidden libraries`);
 }finally{await close();}
}
