/* THE CARDS A QUESTION OFFERS FROM OUT OF SIGHT, ON THE STACK (Rob, 2026-10-25: "When I'm presented with a card I can't see
   (e.g. a scry card), it should be on the stack and that should be the way to see it. However, the card that triggered the
   scry remains on the stack ... graveyard, multiple cards in either stack, cards in a player's graveyard or library ...
   when multiple cards to choose from, it should use the shuffle visual ... to carousel through the card stack").

   Against seat-projected frames; no rules are simulated:
     1. Scry 1 while Kasmina's ability is on the stack: the scried card is in front of On the Stack, ◇, the ability behind
        it as #1; Inspect card opens the scried card, read from the question's words.
     2. Three cards from a library search: the pile's click carousels through all three, then the ability.
     3. A target in another player's graveyard: in front, said as theirs.
     4. A question about permanents only, and priority with cards in hand: nothing added.
     5. A question with an empty stack: the module still shows the offered card. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-stack-choices",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"stackfixture1",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{localStorage.setItem("cm-board-view","focus");localStorage.setItem("crankmagic-audio-muted","true");});
const page=await context.newPage();if(stub)await stub(page);
const sent=[],errors=[];let sock,revision=sample.revision;
page.on("pageerror",x=>errors.push(x.message));
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"stack@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
await page.routeWebSocket(/\/api\/tables\/stackfixture1\/connect$/,ws=>{sock=ws;ws.onMessage(m=>sent.push(JSON.parse(m)));ws.send(JSON.stringify({type:"view",view:sample}));});
await page.goto(`${base}/index.html#table?id=stackfixture1`);await page.locator("#cm-board .cm-stage-top").waitFor();
const show=async(decision,stack)=>{const v=structuredClone(sample);v.revision=++revision;v.state.stack=stack;v.decision=decision;sock.send(JSON.stringify({type:"view",view:v}));await page.waitForTimeout(200);};
const me=sample.state.players[sample.seat],friend=sample.state.players.find(p=>p.playerId!==sample.seat&&p.zones.Graveyard.cards.length);
const kasmina=[{stackId:71,name:"Kasmina, Enigma Sage",playerId:sample.seat,kind:"ability"}];
const list=()=>page.$$eval(".cm-module-stack .cm-stack-summary",bs=>bs.map(b=>({pos:b.querySelector(".cm-stack-position").textContent,name:b.querySelector("strong").textContent,who:b.querySelector("span").textContent,choice:b.classList.contains("is-choice"),pressed:b.getAttribute("aria-pressed")})));
const front=()=>page.locator('.cm-module-stack .cm-stack-card[data-stack-depth="0"] .cm-bcard-name').innerText();
try{
  if(!await page.locator(".cm-stage-side.is-open").count()) await page.locator(".cm-stage-right").click();

  /* 1. Scry 1 under Kasmina's +2. */
  await show({id:"scry:900",kind:"choice",title:"Scry 1: choose any to put on the bottom",mode:"many",min:0,max:1,options:[{index:0,label:"Interplanar Beacon",cardId:900}]},kasmina);
  await page.locator(".cm-module-stack").waitFor();
  let rows=await list();
  eq(rows.map(r=>[r.pos,r.name,r.choice]),[["◇","Interplanar Beacon",true],["#1","Kasmina, Enigma Sage",false]],"the scried card is in front of On the Stack, ◇, the ability behind it as #1");
  eq(rows[0].pressed,"true","and the scried card is the one shown");
  eq(await front(),"Interplanar Beacon","the pile's front card is the scried card, not the ability that asked");
  ok(/^◇ 1 to choose/.test(await page.locator(".cm-stack-order-note").innerText()),"the note says one card is to choose, in a glyph");
  const before=sent.filter(x=>x.type==="act").length;
  await page.locator('.cm-module-stack [data-action="board-inspect"]').click();
  eq((await page.locator("#cm-card-inspector h3").innerText()).trim(),"Interplanar Beacon","Inspect card opens the scried card to read");
  eq(sent.filter(x=>x.type==="act").length,before,"looking at it sends nothing");
  await page.keyboard.press("Escape");

  /* 2. Three from a library search: the pile carousels through them, then the ability. */
  await show({id:"search:901,902,903",kind:"choice",title:"Search your library for a card",mode:"one",min:1,max:1,options:[{index:0,label:"Island",cardId:901},{index:1,label:"Sol Ring",cardId:902},{index:2,label:"Counterspell",cardId:903}]},kasmina);
  eq(await front(),"Island","a new question puts its first card in front");
  const seen=[await front()];
  for(let i=0;i<3;i++){await page.locator(".cm-module-stack .cm-stack-pile").click();await page.waitForTimeout(80);seen.push(await front());}
  eq(seen,["Island","Sol Ring","Counterspell","Kasmina, Enigma Sage"],"a click on the pile carousels through every offered card, then the stack");
  await page.locator(".cm-module-stack .cm-stack-pile").click();await page.waitForTimeout(80);
  eq(await front(),"Island","and comes back round to the first");
  ok((await page.locator(".cm-module-stack .cm-stack-pile").getAttribute("aria-label")).startsWith("Island, card 1 of 3 to choose from"),"the pile says which card of how many it shows");
  eq(sent.filter(x=>x.type==="act").length,before,"browsing them sends nothing");

  /* 3. A target in another player's graveyard. */
  const grave=friend.zones.Graveyard.cards[0];
  await show({id:"targets:g",kind:"targets",title:"Choose target card in a graveyard",mode:"one",min:1,max:1,options:[{index:0,label:grave.name,cardId:grave.cardId},{index:1,label:me.zones.Battlefield.cards[0].name,cardId:me.zones.Battlefield.cards[0].cardId}]},kasmina);
  rows=await list();
  eq(rows.filter(r=>r.choice).map(r=>[r.name,r.who]),[[grave.name,`${friend.name}'s graveyard`]],"a graveyard card is in front, said as whose graveyard; a permanent on the table is not added");

  /* 4. Nothing to add: permanents only, and priority. */
  await show({id:"targets:p",kind:"targets",title:"Choose target permanent",mode:"one",min:1,max:1,options:[{index:0,label:me.zones.Battlefield.cards[0].name,cardId:me.zones.Battlefield.cards[0].cardId}]},kasmina);
  eq((await list()).map(r=>r.choice),[false],"a question about a permanent on the table adds nothing");
  const hand=me.zones.Hand.cards[0];
  await show({id:"prio",kind:"priority",title:"Your priority",mode:"one",options:[{index:0,act:"cast",label:`Cast ${hand.name}`,cardId:hand.cardId},{index:1,act:"pass",label:"Pass"}]},kasmina);
  eq((await list()).map(r=>r.choice),[false],"priority adds nothing");

  /* 5. An empty stack: the offered card is still there to see. */
  await show({id:"scry:904",kind:"choice",title:"Scry 1: choose any to put on the bottom",mode:"many",min:0,max:1,options:[{index:0,label:"Arcane Signet",cardId:904}]},[]);
  eq((await list()).map(r=>[r.pos,r.name]),[["◇","Arcane Signet"]],"with the stack empty, the module still shows the offered card");
  eq(errors,[],"no page errors");
  console.log(`board-stack-choices: ${checks} checks passed — a card a question offers from a library, a graveyard or a hidden hand is in front of On the Stack, ◇, ahead of the ability that asked; the pile carousels through several; permanents and priority add nothing.`);
}finally{await context.close();await close();}
