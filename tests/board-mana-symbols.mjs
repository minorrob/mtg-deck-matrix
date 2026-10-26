/* A MANA ABILITY IS ITS SYMBOLS (Rob, 2026-10-25, a screenshot of Command Tower's four "Tap for mana: Command Tower {W}"
   buttons: "we should show a button for each of the mana options as their mana symbol(s). This should allow ... 4 mana
   symbol buttons in a single row under the image").

   On the sample table, Rob's Access Tunnel offered four ways to tap for mana and one other ability:
     1. In Actions (a click on the land): the four are one row of symbol buttons, each its symbol and no words on screen,
        its whole sentence its accessible name; the other ability stays a worded button. One pressed stages it, Confirm
        sends that one.
     2. In Card Preview (the land hovered): the same row under the picture.
     3. A mana ability whose way is not mana alone stays words. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-mana-symbols",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"manafixture01",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const land=sample.state.players[sample.seat].zones.Battlefield.cards.find(c=>c.types.includes("Land"));
land.tapped=false;
const COLORS=["{W}","{U}","{B}","{G}"];
const decision=(details=COLORS)=>({id:"prio-mana",kind:"priority",mode:"one",title:"Your priority",options:[
  ...details.map((d,index)=>({index,act:"activate-mana",label:land.name,cardId:land.cardId,detail:d})),
  {index:details.length,act:"activate",label:`${land.name}: target creature can't be blocked`,cardId:land.cardId},
  {index:details.length+1,act:"pass",label:"Pass"}]});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{localStorage.setItem("cm-board-view","focus");localStorage.setItem("crankmagic-audio-muted","true");});
const page=await context.newPage();if(stub)await stub(page);
const sent=[],errors=[];let sock,revision=sample.revision;
page.on("pageerror",x=>errors.push(x.message));
const first=structuredClone(sample);first.decision=decision();
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"mana@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
await page.routeWebSocket(/\/api\/tables\/manafixture01\/connect$/,ws=>{sock=ws;ws.onMessage(m=>sent.push(JSON.parse(m)));ws.send(JSON.stringify({type:"view",view:first}));});
await page.goto(`${base}/index.html#table?id=manafixture01`);await page.locator("#cm-board .cm-stage-top").waitFor();
const row=(scope)=>page.$$eval(`${scope} .cm-mana-row .cm-mana-tap`,bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {label:b.getAttribute("aria-label"),words:b.innerText.trim(),symbols:b.querySelectorAll(".cm-mana :is(img,svg)").length,top:Math.round(r.top),w:r.width};}));
try{
  const onTable=page.locator(`.cm-board-mat .cm-bcard[data-card="${land.cardId}"]`).first();
  /* 1. Actions, after a click on the land. */
  await onTable.click();
  await page.locator(".cm-stage-rail #cm-board-decision .cm-mana-row").waitFor();
  let taps=await row(".cm-stage-rail #cm-board-decision");
  eq(taps.map(t=>t.label),COLORS.map(c=>`Tap for mana: ${land.name} ${c}`),"in Actions the four mana abilities are four buttons, each named in full for a reader");
  ok(taps.every(t=>t.words===""&&t.symbols===1),"each shows its mana symbol and no words");
  ok(new Set(taps.map(t=>t.top)).size===1,`and the four sit in a single row (${taps.map(t=>t.top).join(", ")})`);
  ok(taps.every(t=>t.w<=80),"each is a small button");
  ok(await page.locator(".cm-stage-rail #cm-board-decision [data-action=board-option]",{hasText:"can't be blocked"}).count()===1,"the land's other ability stays a worded button");
  const before=sent.filter(x=>x.type==="act").length;
  await page.locator('.cm-stage-rail #cm-board-decision .cm-mana-tap[data-index="2"]').click();
  eq(await page.locator('.cm-stage-rail #cm-board-decision .cm-mana-tap[data-index="2"]').getAttribute("aria-pressed"),"true","pressing {B} selects it, outlined");
  eq(sent.filter(x=>x.type==="act").length,before,"and sends nothing yet");
  await page.locator(".cm-stage-rail #cm-board-decision [data-action=board-confirm]").click();
  eq(sent.filter(x=>x.type==="act").at(-1)?.indices,[2],"Confirm sends the {B} ability");
  await page.keyboard.press("Escape");
  /* 2. Card Preview, the land hovered. */
  const v2=structuredClone(sample);v2.revision=++revision;v2.decision=decision();sock.send(JSON.stringify({type:"view",view:v2}));await page.waitForTimeout(200);
  if(!await page.locator(".cm-stage-side.is-open").count()) await page.locator(".cm-stage-right").click();
  await onTable.hover();
  await page.locator("#cm-full-pick .cm-mana-row").waitFor({timeout:5000});
  taps=await row("#cm-full-pick");
  ok(taps.length===4&&new Set(taps.map(t=>t.top)).size===1&&taps.every(t=>t.words===""),"in Card Preview the same four symbols sit in one row under the picture");
  const under=await page.$eval("#cm-full-pick",s=>s.querySelector(".cm-mana-row").getBoundingClientRect().top>=s.querySelector(".cm-bcard").getBoundingClientRect().bottom-1);
  ok(under,"under the image");
  /* 3. Not mana alone: words. */
  const v3=structuredClone(sample);v3.revision=++revision;v3.decision=decision(["{W}","{U}","{B}","Pay 1 life: {G}"]);sock.send(JSON.stringify({type:"view",view:v3}));await page.waitForTimeout(200);
  await page.mouse.move(5,5);await onTable.hover();
  await page.locator("#cm-full-pick .cm-mana-row").waitFor({timeout:5000});
  eq((await row("#cm-full-pick")).length,3,"a way that is more than mana alone is not in the row");
  ok(await page.locator("#cm-full-pick [data-action=board-option]",{hasText:"Pay 1 life"}).count()===1,"and stays a worded button");
  eq(errors,[],"no page errors");
  console.log(`board-mana-symbols: ${checks} checks passed — a land's mana abilities are one row of mana-symbol buttons, in Actions and in Card Preview, each named in full for a reader, staged by a press and sent by Confirm.`);
}finally{await context.close();await close();}
