/* THE DRAWERS' PARTS, SIZED BY HAND (Rob, 2026-10-26, urgent: "When declaring attackers in Play, the card image can't be
   resized and the bottom selection options I can't see to select ... It can be fixed by an existing desire to make the
   height of the modules grab-n-drag up and down to increase/decrease their height. Also, make the width of the right side
   drawer adjustable in the same way the left side drawer is.").

   In the 3D view at 1366x768, the sample table, Rob declaring attackers (nine choices) with Proft open on the desk:
     1. Every choice can be reached: the options keep room under the card and scroll, and the question never runs past
        the drawer.
     2. The card's size: a bar under it, dragged down grows it, up shrinks it, the arrow keys too; kept on the device.
     3. A module's height: a bar under each module (Actions on the left, every module on the right), dragged down grows
        it -- the Actions module tall enough shows all nine choices with nothing to scroll -- kept through a reload, and a
        double click gives it back its own height.
     4. The right drawer's width: a bar at its left edge, as the left drawer's at its right; dragged left widens it, the
        arrow keys too, kept on the device. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-drawer-sizes",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"sizesfixture1",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
const names={485:"Thrummingbird",526:"Proft, Consulting Detective",545:"Faerie Formation"},seats={1:"Friend",2:"AI 2",3:"AI 3"};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const near=(a,b,tol,m)=>ok(Math.abs(a-b)<=tol,`${m} (${Math.round(a)} against ${Math.round(b)})`);
const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{if(location.protocol!=="about:"&&!sessionStorage.getItem("sizes-started")){sessionStorage.setItem("sizes-started","1");localStorage.setItem("cm-board-view","full");localStorage.setItem("crankmagic-audio-muted","true");}});
const page=await context.newPage();if(stub)await stub(page);
const errors=[];page.on("pageerror",x=>errors.push(x.message));
let sock,revision=sample.revision;
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"sizes@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
await page.routeWebSocket(/\/api\/tables\/sizesfixture1\/connect$/,ws=>{sock=ws;ws.send(JSON.stringify({type:"view",view:sample}));});
const options=[];for(const id of [485,526,545])for(const d of [1,2,3])options.push({index:options.length,label:`${names[id]} → ${seats[d]}`,cardId:id,defenderId:d});
const D=".cm-stage-rail #cm-board-decision";
const open=async()=>{
  await page.goto("about:blank");await page.goto(`${base}/index.html#table?id=sizesfixture1`);await page.locator("#cm-board .cm-stage-top").waitFor();
  const v=structuredClone(sample);v.revision=++revision;v.decision={id:"declare-attackers:sizes",kind:"attackers",title:"Declare attackers",mode:"many",min:0,max:options.length,options};
  sock.send(JSON.stringify({type:"view",view:v}));await page.locator(`${D} [data-action=board-option]`).first().waitFor();
  /* Proft opened on the desk, as a click on it does. */
  await page.locator(".cm-stage-front .cm-bcard",{hasText:"Proft"}).first().click({force:true});
  await page.locator(".cm-stage-rail .cm-action-card").waitFor();await page.mouse.move(5,400);await page.waitForTimeout(300);
};
const box=(sel)=>page.evaluate((sel)=>{const x=document.querySelector(sel);if(!x)return null;const b=x.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,width:b.width,left:b.left,right:b.right,scroll:x.scrollHeight,client:x.clientHeight};},sel);
/* A bar dragged by dy (down) or dx (right), from its middle. */
const dragBy=async(sel,dx,dy)=>{const g=page.locator(sel).first();await g.scrollIntoViewIfNeeded();const b=await g.boundingBox();const x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx/2,y+dy/2,{steps:4});await page.mouse.move(x+dx,y+dy,{steps:4});await page.mouse.up();await page.waitForTimeout(150);};
try{
  await open();
  /* 1. */
  const rail=await box(".cm-stage-rail"),dec=await box(D),opts=await box(`${D} > .cm-board-options`),card=await box(".cm-stage-rail .cm-action-card");
  ok(card.height>=150,`the card is read at the top of the desk (${Math.round(card.width)}×${Math.round(card.height)})`);
  ok(opts.height>=120,`the options keep room for two or three choices under it (${Math.round(opts.height)}px)`);
  ok(dec.bottom<=rail.bottom+1,`and the question ends inside the drawer (${Math.round(dec.bottom)} of ${Math.round(rail.bottom)})`);
  const reach=[];
  for(const o of options){const b=page.locator(`${D} [data-action=board-option]`,{hasText:o.label}).first();await b.scrollIntoViewIfNeeded();const r=await b.boundingBox(),inside=await box(`${D} > .cm-board-options`);reach.push(r&&r.y>=inside.top-1&&r.y+r.height<=inside.bottom+1&&r.y+r.height<=768);}
  eq(reach.filter(Boolean).length,9,"every one of the nine choices can be brought into view and pressed");
  await page.locator(`${D} [data-action=board-option]`,{hasText:"Faerie Formation → AI 3"}).click();
  ok(await page.locator(`${D} [data-action=board-option][aria-pressed=true]`,{hasText:"Faerie Formation → AI 3"}).count()===1,"the last choice, pressed, is picked");
  /* 2. */
  const g2=".cm-stage-rail [data-drag=deskcard]";
  ok(await page.locator(g2).count()===1,"a bar under the card sizes it");
  await dragBy(g2,0,70);
  let c2=await box(".cm-stage-rail .cm-action-card");
  near(c2.height,card.height+70,3,"dragged down 70px, the card is 70px taller");
  await dragBy(g2,0,-140);
  c2=await box(".cm-stage-rail .cm-action-card");
  near(c2.height,card.height-70,3,"dragged up 140px, 70px shorter than it began");
  await page.locator(g2).focus();await page.keyboard.press("ArrowDown");
  const c3=await box(".cm-stage-rail .cm-action-card");
  near(c3.height,c2.height+14*7/5,2,"↓ makes it a step larger");
  const keptW=await page.evaluate(()=>localStorage.getItem("cm-board-desk-card"));
  near(Number(keptW),c3.height*5/7,1,`its size is kept on the device (${keptW}px wide)`);
  /* 3. */
  const g3='.cm-stage-rail [data-drag=modh][data-module-id="actions"]';
  ok(await page.locator(g3).count()===1,"a bar under the Actions module sizes its height");
  ok(await page.locator(".cm-stage-side [data-drag=modh]").count()>=3,"and one under every module in the right drawer");
  const body0=await box('.cm-stage-rail .cm-stage-module[data-module="actions"]>.cm-module-body');
  await dragBy(g3,0,400);
  const body1=await box('.cm-stage-rail .cm-stage-module[data-module="actions"]>.cm-module-body'),o1=await box(`${D} > .cm-board-options`);
  near(body1.height,body0.height+400,4,"dragged down 400px, the Actions module is 400px taller");
  ok(o1.scroll<=o1.client+1,`and all nine choices show, nothing to scroll (${o1.scroll} in ${o1.client})`);
  ok((await box(".cm-stage-rail")).scroll>(await box(".cm-stage-rail")).client,"the drawer scrolls to what is below it");
  await open();
  const body2=await box('.cm-stage-rail .cm-stage-module[data-module="actions"]>.cm-module-body');
  near(body2.height,body1.height,2,"the height is kept through a reload");
  near((await box(".cm-stage-rail .cm-action-card")).height,c3.height,2,"and so is the card's size");
  await page.locator(g3).scrollIntoViewIfNeeded();await page.locator(g3).dblclick();await page.waitForTimeout(150);
  const body3=await box('.cm-stage-rail .cm-stage-module[data-module="actions"]>.cm-module-body');
  near(body3.height,body0.height,4,"a double click gives the module back its own height");
  eq(await page.evaluate(()=>JSON.parse(localStorage.getItem("cm-board-module-h")||"{}").actions),undefined,"and forgets the one kept");
  await page.locator(g3).focus();await page.keyboard.press("ArrowDown");
  near((await box('.cm-stage-rail .cm-stage-module[data-module="actions"]>.cm-module-body')).height,body3.height+20,3,"↓ makes it a step taller");
  /* 4. */
  await page.locator("[data-action=board-stage-side]").last().click();
  await page.locator(".cm-stage-side.is-open").waitFor();await page.waitForTimeout(400);
  const g4=".cm-stage-side [data-drag=panelw]";
  ok(await page.locator(g4).isVisible(),"the right drawer has a bar at its left edge");
  const side0=await box(".cm-stage-side");
  await dragBy(g4,-100,0);
  const side1=await box(".cm-stage-side");
  near(side1.width,side0.width+100,3,"dragged left 100px, the right drawer is 100px wider");
  near(side1.right,side0.right,1,"its right edge stays at the window's");
  await page.locator(g4).focus();await page.keyboard.press("ArrowLeft");
  near((await box(".cm-stage-side")).width,side1.width+20,2,"← widens it a step, as the left drawer's → does");
  near(Number(await page.evaluate(()=>localStorage.getItem("cm-board-panel-w"))),side1.width+20,2,"its width is kept on the device");
  const h0=await box('.cm-stage-side .cm-stage-module[data-module="history"]>.cm-module-body');
  await dragBy('.cm-stage-side [data-drag=modh][data-module-id="history"]',0,80);
  near((await box('.cm-stage-side .cm-stage-module[data-module="history"]>.cm-module-body')).height,h0.height+80,4,"a module in the right drawer, dragged, is that much taller");
  eq(errors,[],"no page errors");
  console.log(`board-drawer-sizes: ${checks} checks passed — declaring attackers with a card open, every choice is in reach; the card, each module's height and the right drawer's width are dragged by hand and kept.`);
}finally{await context.close();await close();}
