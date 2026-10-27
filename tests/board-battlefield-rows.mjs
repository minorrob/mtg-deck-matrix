/* THE BATTLEFIELD'S ROWS ARE DEFAULTS (Rob, 2026-10-27: "allow the player to move cards in any row on the battlefield to other rows on the battlefield. We don't
   lock in creatures, etc. to first row and artifacts, etc. to second row. We default play them there, but players can drag them to where they want them").
   A creature dragged to the artifacts row stays there through the next view and a reload; an artifact dragged to the creatures row, likewise; a card dropped on
   bare battlefield beside one row goes to the other; a land never leaves its own row. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-battlefield-rows",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE="rowsfixture01";
const table={tableId:TABLE,phase:"playing",matchId:sample.matchId,away:[],blockers:[],youAreHost:true,rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true,ready:true}))};
let checks=0;const ok=(c,m)=>{assert.ok(c,m);checks++;};
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{if(!localStorage.getItem("cm-board-view"))localStorage.setItem("cm-board-view","focus");localStorage.setItem("crankmagic-audio-muted","true");});
const page=await context.newPage();if(stub)await stub(page);
const errors=[];let sock=null;page.on("pageerror",e=>errors.push(e.message));
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"rows@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`),ws=>{sock=ws;ws.send(JSON.stringify({type:"view",view:sample}));});
await page.goto(`${base}/index.html#table?id=${TABLE}`);
await page.locator("#cm-board [data-card-section]").first().waitFor({timeout:20000});
await page.waitForTimeout(400);
const rowOf=name=>page.evaluate(n=>{const el=[...document.querySelectorAll("#cm-board .cm-board-mat.is-you [data-arrange-card]")].find(e=>e.getAttribute("aria-label")?.startsWith(n)||e.textContent.includes(n));return el?.closest("[data-card-section]")?.dataset.cardSection.split(":")[1]||null;},name);
/* a drag, as the browser makes it: dragstart on the card, then dragover and drop where it lands */
const drag=(name,toRow,bare=false)=>page.evaluate(([n,row,bare])=>{
  const card=[...document.querySelectorAll("#cm-board .cm-board-mat.is-you [data-arrange-card]")].find(e=>e.getAttribute("aria-label")?.startsWith(n)||e.textContent.includes(n)),dt=new DataTransfer();
  card.dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:dt}));
  const sec=document.querySelector(`#cm-board .cm-board-mat.is-you [data-card-section$=":${row}"]`),spot=bare?sec.closest("[data-zone=battlefield]"):sec,r=spot.getBoundingClientRect();
  const at={bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.left+(bare?r.width-6:6),clientY:r.top+(bare?r.height-6:6)};
  spot.dispatchEvent(new DragEvent("dragover",at));spot.dispatchEvent(new DragEvent("drop",at));
},[name,toRow,bare]);
ok(await rowOf("Thrummingbird")==="creatures"&&await rowOf("Everflowing Chalice")==="others","by default a creature stands in the first row and an artifact in the second");
await drag("Thrummingbird","others");await page.waitForTimeout(250);
ok(await rowOf("Thrummingbird")==="others","a creature dragged to the second row stays in it");
await drag("Everflowing Chalice","creatures");await page.waitForTimeout(250);
ok(await rowOf("Everflowing Chalice")==="creatures","an artifact dragged to the first row stays in it");
sock.send(JSON.stringify({type:"view",view:{...structuredClone(sample),revision:sample.revision+1}}));await page.waitForTimeout(400);
ok(await rowOf("Thrummingbird")==="others"&&await rowOf("Everflowing Chalice")==="creatures","and both stay through the next view");
await page.reload();await page.locator("#cm-board [data-card-section]").first().waitFor({timeout:20000});await page.waitForTimeout(400);
ok(await rowOf("Thrummingbird")==="others"&&await rowOf("Everflowing Chalice")==="creatures","and through a reload");
const lands=await page.evaluate(()=>[...document.querySelectorAll("#cm-board .cm-board-mat.is-you [data-card-section$=':lands'] [data-arrange-card]")].length);
await drag("Island","creatures");await page.waitForTimeout(250);
ok(await page.evaluate(()=>[...document.querySelectorAll("#cm-board .cm-board-mat.is-you [data-card-section$=':lands'] [data-arrange-card]")].length)===lands,"a land dropped on a battlefield row does not leave the lands");
ok(errors.length===0,`no page errors (${errors.join("; ")})`);
await close();
console.log(`board-battlefield-rows: ${checks} checks passed — the rows are defaults: a creature and an artifact each dragged to the other row stay there through the next view and a reload; a land stays in its own.`);
