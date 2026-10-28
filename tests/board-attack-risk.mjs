/* WHAT AN ATTACK RISKS, ON ITS BUTTON (Rob, 2026-10-25: "If they have a creature with power equal to or greater than the
   toughness of one of my attackers, that action button for that attacker should be red ... If the creature I can action has
   power lower than ... all of the target opponent's creatures, it should have a yellow ... indication that it will not
   result in killing [one] on its own.").

   The sample table (docs/reference/replit-sample-views.json, view 13), Rob attacking:
     Proft 2/2, Thrummingbird 1/1 flying, Faerie Formation 5/4 flying.
     AI 2 untapped: Walking Bulwark 0/3, Pir 1/1, Surly Farrier 2/2 (no flyer).   AI 3 untapped: Kor Skyfisher 2/3 flying.
     Friend: no creatures.
   So: Proft → AI 2 red (Surly), kills Pir; Proft → AI 3 red and yellow (Skyfisher); Thrummingbird → AI 2 nothing (no
   flyer to block it); Thrummingbird → AI 3 red and yellow; Faerie → AI 3 nothing; anything → Friend nothing. With Pir and
   Surly tapped, Proft → AI 2 is yellow alone (only the 0/3 can block). Deathtouch kills any blocker; indestructible dies
   to none. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-attack-risk",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"riskfixture01",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{localStorage.setItem("cm-board-view","focus");localStorage.setItem("crankmagic-audio-muted","true");});
const page=await context.newPage();if(stub)await stub(page);
const errors=[];let sock,revision=sample.revision;
page.on("pageerror",x=>errors.push(x.message));
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"risk@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
await page.routeWebSocket(/\/api\/tables\/riskfixture01\/connect$/,ws=>{sock=ws;ws.send(JSON.stringify({type:"view",view:sample}));});
await page.goto(`${base}/index.html#table?id=riskfixture01`);await page.locator("#cm-board .cm-stage-top").waitFor();
const names={485:"Thrummingbird",526:"Proft, Consulting Detective",545:"Faerie Formation"},seats={1:"Friend",2:"AI 2",3:"AI 3"};
const attackers=[485,526,545];
const decision=()=>{const options=[];for(const id of attackers)for(const d of [1,2,3])options.push({index:options.length,label:`${names[id]} → ${seats[d]}`,cardId:id,defenderId:d});return {id:"declare-attackers:risk"+revision,kind:"attackers",title:"Declare attackers",mode:"many",min:0,max:options.length,options};};
const show=async(edit=()=>{})=>{const v=structuredClone(sample);v.revision=++revision;v.decision=decision();edit(v);sock.send(JSON.stringify({type:"view",view:v}));await page.waitForTimeout(200);};
const marks=()=>page.$$eval("#cm-board-decision [data-action=board-option]",bs=>Object.fromEntries(bs.map(b=>[b.textContent.replace(/[☠⊘]/g,"").replace(/ (could die to|kills no blocker)[^;]*;/g,"").trim(),(b.classList.contains("is-risk-die")?"red":"")+(b.classList.contains("is-risk-weak")?"yellow":"")]))) ;
const card=(v,id)=>v.state.players.flatMap(p=>p.zones.Battlefield.cards).find(c=>c.cardId===id);
try{
  await show();
  await page.locator("#cm-board-decision [data-action=board-option]").first().waitFor();
  let m=await marks();
  eq([m["Proft, Consulting Detective → AI 2"],m["Proft, Consulting Detective → AI 3"],m["Proft, Consulting Detective → Friend"]],["red","redyellow",""],"Proft: red at AI 2 (a 2/2 can kill it), red and yellow at AI 3 (Kor Skyfisher 2/3), nothing at Friend (no creatures)");
  eq([m["Thrummingbird → AI 2"],m["Thrummingbird → AI 3"]],["","redyellow"],"a flyer is marked only by what can block it: nothing at AI 2 (no flyer or reach), red and yellow at AI 3");
  eq([m["Faerie Formation → AI 2"],m["Faerie Formation → AI 3"]],["",""],"Faerie Formation 5/4 risks nothing at AI 3: the 2/3 cannot kill it, and it kills the 2/3");
  const proft=page.locator("#cm-board-decision [data-action=board-option]",{hasText:"Proft, Consulting Detective → AI 2"});
  eq(await proft.locator(".cm-risk.is-die").getAttribute("title"),"Could die: Surly Farrier 2/2","red says which blocker could kill it, on hover");
  ok((await proft.textContent()).includes("could die to Surly Farrier"),"and a screen reader hears it");
  const look=await proft.evaluate(b=>({shadow:getComputedStyle(b).boxShadow,glyph:getComputedStyle(b.querySelector(".cm-risk")).color}));
  ok(/rgb\(224, 83, 63\)/.test(look.shadow)&&/rgb\(255, 138, 122\)/.test(look.glyph),`the red is seen: an edge and the ☠ (${look.shadow}; ${look.glyph})`);
  await show((v)=>{for(const id of [535,537])card(v,id).tapped=true;});
  m=await marks();
  eq(m["Proft, Consulting Detective → AI 2"],"yellow","with Pir and Surly tapped, only Walking Bulwark 0/3 can block Proft: yellow alone, it kills nothing and nothing kills it");
  await show((v)=>{card(v,526).keywords=["Deathtouch"];});
  m=await marks();
  eq(m["Proft, Consulting Detective → AI 3"],"red","a deathtouch attacker kills any blocker: no yellow");
  await show((v)=>{card(v,526).keywords=["Indestructible"];});
  m=await marks();
  eq(m["Proft, Consulting Detective → AI 3"],"yellow","an indestructible attacker dies to none: no red");
  /* Not an attack: no marks. */
  const v=structuredClone(sample);v.revision=++revision;v.decision={id:"targets:x",kind:"targets",title:"Choose target creature",mode:"one",min:1,max:1,options:[{index:0,label:"Proft, Consulting Detective",cardId:526,defenderId:2}]};sock.send(JSON.stringify({type:"view",view:v}));await page.waitForTimeout(200);
  eq(await page.locator("#cm-board-decision .cm-risk").count(),0,"a question that is not declaring attackers is never marked");
  eq(errors,[],"no page errors");
  console.log(`board-attack-risk: ${checks} checks passed — an attack option is red (☠) when a creature that could block it could kill it, yellow (⊘) when it could kill none of them alone, by flying, reach, deathtouch, indestructible and tapped blockers.`);
}finally{await context.close();await close();}
