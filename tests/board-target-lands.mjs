/* LANDS LAST, FOLDED (Rob, 2026-10-25, a screenshot of "Choose targets for Oath of Teferi" listing Island, Forest and
   Command Tower above Kasmina: "When being given action options that target cards, if the rules allow lands (e.g.
   permanents), always show lands after every other option under a subheader, "lands" and by default have it collapsed.").

   On the sample table (Rob's Access Tunnel, two Islands, Command Tower, Everflowing Chalice, Thrummingbird, Proft):
     1. A question of targets for one permanent: the others first, then a "Lands" group, shut, saying 4; opened, its lands
        are options like any; the group stays open through a redraw, and while a land is picked; a new question shuts it.
     2. The same for a question of several targets.
     3. Targets that are all lands: shown as they are, no group.
     4. A cost's question (what to tap): its lands stay in view, no group. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-target-lands",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"landsfixture1",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const NAMES={459:"Access Tunnel",461:"Everflowing Chalice",469:"Island",483:"Island",485:"Thrummingbird",502:"Command Tower",526:"Proft, Consulting Detective"};
const options=(ids)=>ids.map((id,index)=>({index,label:NAMES[id],cardId:id,target:{kind:"object",id}}));
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{localStorage.setItem("cm-board-view","focus");localStorage.setItem("crankmagic-audio-muted","true");});
const page=await context.newPage();if(stub)await stub(page);
const errors=[];page.on("pageerror",x=>errors.push(x.message));
let sock,revision=sample.revision;
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"lands@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
await page.routeWebSocket(/\/api\/tables\/landsfixture1\/connect$/,ws=>{sock=ws;ws.send(JSON.stringify({type:"view",view:sample}));});
await page.goto(`${base}/index.html#table?id=landsfixture1`);await page.locator("#cm-board .cm-stage-top, #cm-board .cm-board-top").first().waitFor();
const show=async(decision)=>{const v=structuredClone(sample);v.revision=++revision;v.decision=decision;sock.send(JSON.stringify({type:"view",view:v}));await page.waitForTimeout(250);};
const D=".cm-stage-rail #cm-board-decision";
const read=()=>page.evaluate((D)=>{const d=document.querySelector(D),g=d.querySelector(".cm-board-lands-group"),words=(b)=>b.textContent.replace(/\s+/g," ").trim();
  const before=[...d.querySelectorAll(".cm-board-options > [data-action^=board-option], .cm-board-options > .cm-board-same")].map(words);
  return {before,group:!!g,open:g?.open??null,summary:g?words(g.querySelector("summary")):null,inside:g?[...g.querySelectorAll("[data-action^=board-option]")].map(words):[],last:g?g===d.querySelector(".cm-board-options").lastElementChild:null};},D);
try{
  /* 1. */
  const mixed=[459,485,469,526,502,483,461];
  await show({id:"choose-targets:900:0",kind:"targets",title:"Choose a target permanent",mode:"one",min:1,max:1,options:options(mixed)});
  let r=await read();
  eq(r.before,["Thrummingbird","Proft, Consulting Detective","Everflowing Chalice"],"every option that is not a land comes first, in the room's order");
  ok(r.group&&r.last,"then a Lands group, after everything else");
  eq([r.open,r.summary],[false,"Lands 4"],"shut by default, saying how many");
  eq(r.inside.sort(),["Access Tunnel","Command Tower","Island","Island"],"inside, the lands");
  await page.locator(`${D} .cm-board-lands-group > summary`).click();
  ok((await read()).open,"a click opens it");
  await show({id:"choose-targets:900:0",kind:"targets",title:"Choose a target permanent",mode:"one",min:1,max:1,options:options(mixed)});
  ok((await read()).open,"and it stays open as the board redraws the same question");
  await page.locator(`${D} .cm-board-lands-group [data-action^=board-option]`,{hasText:"Command Tower"}).click();
  r=await read();
  ok(r.open&&await page.locator(`${D} .cm-board-lands-group [aria-pressed=true]`).count()===1,"a land picked from it is shown picked, the group open");
  await show({id:"choose-targets:901:0",kind:"targets",title:"Choose another target permanent",mode:"one",min:1,max:1,options:options(mixed)});
  eq((await read()).open,false,"a new question starts with the lands shut again");
  /* 2. */
  await show({id:"choose-targets:902:0",kind:"targets",title:"Choose up to three target permanents",mode:"many",min:0,max:3,options:options(mixed)});
  r=await read();
  eq([r.before,r.group,r.open,r.summary],[["Thrummingbird","Proft, Consulting Detective","Everflowing Chalice"],true,false,"Lands 4"],"a question of several targets folds its lands the same way");
  /* 3. */
  await show({id:"choose-targets:903:0",kind:"targets",title:"Choose a target land",mode:"one",min:1,max:1,options:options([459,469,502])});
  r=await read();
  eq([r.group,r.before.length],[false,3],"targets that are all lands are shown as they are");
  /* 4. */
  await show({id:"choose-cost:461",kind:"choice",title:"Everflowing Chalice: what to tap for it",mode:"one",min:1,max:1,options:[459,469,502,461].map((id,index)=>({index,label:NAMES[id],cardId:id}))});
  r=await read();
  eq([r.group,r.before.length],[false,4],"a cost's question keeps its lands in view");
  eq(errors,[],"no page errors");
  console.log(`board-target-lands: ${checks} checks passed — in a question of targets, lands come after every other option in a Lands group shut by default, open while one is picked; all-land targets and a cost's question are shown as they are.`);
}finally{await context.close();await close();}
