/* R2's shared interactions against seat-projected room frames. No rules are simulated here. */
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-r2-actions-inspection",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"r2fixture01",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true,ready:true,mat:"felt"}))};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
async function setup(saved){
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
 await context.addInitScript(saved=>{if(saved)localStorage.setItem("cm-board-view",saved);localStorage.setItem("crankmagic-audio-muted","true");},saved);
 const page=await context.newPage();if(stub)await stub(page);
 const sent=[],errors=[];let sock,current=structuredClone(sample);
 page.on("pageerror",e=>errors.push(e.message));
 await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
 await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"r2@example.com"}}));
 await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
 await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
 await page.routeWebSocket(/\/api\/tables\/r2fixture01\/connect$/,ws=>{sock=ws;ws.onMessage(m=>sent.push(JSON.parse(m)));ws.send(JSON.stringify({type:"view",view:current}));});
 await page.goto(`${base}/index.html#table?id=r2fixture01`);await page.locator("#cm-board .cm-stage-top").waitFor();
 return {page,context,sent,errors,show:async v=>{current=v;sock.send(JSON.stringify({type:"view",view:v}));await page.waitForTimeout(150);}};
}
async function change(page,mode){await page.locator('[data-action="board-camera"]').click();await page.locator(`[data-action="board-view"][data-view="${mode}"]`).click();await page.waitForTimeout(100);}
try{
 for(const saved of [undefined,"table","focus","full","invalid"]){
  const {page,context}=await setup(saved);
  eq(await page.locator("#cm-board").getAttribute("data-view"),["table","focus","full"].includes(saved)?saved:"full","new/invalid preferences use 3D, valid preferences survive");
  await context.close();
 }
 const {page,context,sent,errors,show}=await setup();
 const id=sample.state.players[sample.seat].zones.Hand.cards.at(-1).cardId;
 let revision=sample.revision;
 for(const mode of ["full","focus","table"]){
  console.log(`Checking ${mode}`);
  await change(page,mode);
  eq(await page.evaluate(()=>localStorage.getItem("cm-board-view")),mode,"explicit view selection is remembered");
  eq(await page.locator('.cm-stage-rail [data-module="actions"]').count(),1,"one left Actions module in each view");
  eq(await page.locator('.cm-stage-rail nav[aria-label="Boards"]').count(),1,"Boards lives beside Actions");
  eq(await page.locator('#cm-board-decision').count(),1,"no duplicate decision prompt");
  await page.locator('[data-action="board-camera"]').click();
  eq(await page.locator('[data-action="board-view"][data-view="full"]').getAttribute("title"),"3D","3D label replaces Full screen");
  await page.locator('[data-action="board-camera"]').click();
  const target=page.locator(`.cm-bcard[data-card="${id}"]`).filter({has:page.locator('img')}).first();
  await target.hover();await page.locator('#cm-board-peek').waitFor();
  eq(sent.filter(x=>x.type==="act").length,0,"hover inspection does not act");
  await target.click({button:"right"});await page.locator('#cm-card-inspector').waitFor();
  await target.hover();await page.waitForTimeout(450);
  eq(await page.locator('#cm-board-peek').count(),0,'pinned inspection suppresses a duplicate preview over the board');
  eq(sent.filter(x=>x.type==="act").length,0,"pinned inspection does not act");
  const bounds=await page.evaluate(()=>{
   const host=document.querySelector('#cm-board'),rail=host.querySelector('.cm-stage-rail').getBoundingClientRect(),surface=host.querySelector('.cm-stage-region,.cm-board-stage,.cm-board-tabletop').getBoundingClientRect(),inspect=host.querySelector('#cm-card-inspector').getBoundingClientRect();
   return {rail:rail.right,left:surface.left,right:surface.right,inspect:inspect.left,width:surface.width};
  });
  ok(bounds.left>=bounds.rail-1&&bounds.right<=bounds.inspect+1&&bounds.width>300,"game surface stays clear of Actions and inspector");
  if(mode==='full') {
   const fit=await page.evaluate(()=>{const r=document.querySelector('.cm-stage-hand').getBoundingClientRect();return [...document.querySelectorAll('.cm-stage-fan-slot')].every(el=>{const c=el.getBoundingClientRect();return c.left>=r.left-1&&c.right<=r.right+1;});});
   ok(fit,'3D hand stays inside the space remaining beside both panes');
  }
  await page.keyboard.press("Escape");eq(await page.locator('#cm-card-inspector').count(),0,"Escape closes inspection only");
  eq(await page.locator('#cm-board').getAttribute('data-view'),mode,"Escape does not change view preference");
  await page.locator('[data-action="board-actions-toggle"]').click();
  ok((await page.locator('.cm-stage-rail').innerText()).includes('Your choice is waiting'),"collapsed Actions retains pending state");
  await page.locator('[data-action="board-actions-open"]').click();
  await page.locator('.cm-stage-left').click();
  ok((await page.locator('[data-action="board-actions-open"]').innerText()).includes('pending'),"closed drawer retains a reachable choice handle");
  await page.locator('[data-action="board-actions-open"]').click();
 }
 // A draft remains the same question while inspecting and switching views.
 const choice=structuredClone(sample);choice.revision=++revision;
 choice.decision={id:"r2-targets",kind:"targets",title:"Choose two creatures",mode:"many",min:2,max:2,options:[{index:0,label:"First creature",cardId:id},{index:1,label:"Second creature",cardId:id+1}]};
 await show(choice);
 await page.locator('#cm-board-decision [data-index="0"]').click();
 await change(page,"focus");
 eq(await page.locator('#cm-board-decision [data-index="0"]').getAttribute('aria-pressed'),'true','selection survives view switch');
 await page.locator(`.cm-board-hand .cm-bcard[data-card="${id}"]`).click({button:"right"});
 eq(await page.locator('#cm-board-decision [data-index="0"]').getAttribute('aria-pressed'),'true','inspection preserves draft');
 await page.keyboard.press("Escape");
 const newer=structuredClone(choice);newer.revision=++revision;newer.decision.id="r2-new-targets";await show(newer);
 eq(await page.locator('#cm-board-decision [data-index="0"]').getAttribute('aria-pressed'),'false','a new question clears the old draft');
 // Touch inspection must consume the click synthesized after the hold.
 const touch=structuredClone(sample);touch.revision=++revision;
 touch.decision={id:'r2-touch',kind:'priority',mode:'one',title:'Your priority',options:[{index:0,act:'cast',label:'Cast this card',cardId:id}]};
 await show(touch);
 await page.locator(`.cm-board-hand .cm-bcard[data-card="${id}"]`).dispatchEvent('pointerdown',{pointerType:'touch',clientX:700,clientY:750});
 await page.locator('#cm-card-inspector').waitFor();
 await page.locator(`.cm-board-hand .cm-bcard[data-card="${id}"]`).dispatchEvent('click',{detail:1});await page.waitForTimeout(100);
 eq(sent.filter(x=>x.type==='act').length,0,'long-press follow-up click cannot play a card');
 await page.keyboard.press('Escape');
 // Existing card-action dialogs cannot submit stale choices after a new projection.
 const ways=structuredClone(sample);ways.revision=++revision;
 ways.decision={id:'r2-ways',kind:'priority',mode:'one',title:'Your priority',options:[{index:0,act:'cast',label:'Cast first way',cardId:id},{index:1,act:'activate',label:'Activate second way',cardId:id}]};
 await show(ways);await page.locator(`.cm-board-hand .cm-bcard[data-card="${id}"]`).click();
 await page.locator('#cm-dialog[open] [data-action="board-zoom-do"]').first().waitFor();
 const moved=structuredClone(ways);moved.revision=++revision;moved.decision.id='r2-new-ways';await show(moved);
 await page.locator('#cm-dialog[open] [data-action="board-zoom-do"]').first().click();await page.waitForTimeout(100);
 eq(sent.filter(x=>x.type==='act').length,0,'stale action dialog cannot submit a choice against a new question');
 // An inspection must stop exposing an expired private reveal.
 const privateView=structuredClone(sample);privateView.revision=++revision;privateView.decision={id:'r2-reveal',kind:'choice',mode:'ack',title:'Look at this card',options:[{index:0,cardId:999999,label:'Forest'}]};
 await show(privateView);await page.locator('#cm-board-decision [data-action="board-zoom-open"]').click();
 ok((await page.locator('#cm-card-inspector').innerText()).includes('Forest'),'authorized private reveal can be inspected');
 const expired=structuredClone(sample);expired.revision=++revision;await show(expired);
 eq(await page.locator('#cm-card-inspector img').count(),0,'expired private reveal cannot remain in inspector');
 await page.locator('[data-action="board-inspect-close"]').click();
 // Face-down identity comes only from the seat projection, as for ordinary card rendering.
 const known=structuredClone(sample);known.revision=++revision;
 const knownCard=known.state.players[known.seat].zones.Hand.cards.find(c=>c.cardId===id);knownCard.faceDown=true;
 await show(known);await page.locator(`.cm-board-hand .cm-bcard[data-card="${id}"]`).click({button:'right'});
 ok((await page.locator('#cm-card-inspector').innerText()).includes(knownCard.name),'authorized face-down identity remains inspectable');
 const concealed=structuredClone(known);concealed.revision=++revision;concealed.state.players[concealed.seat].zones.Hand.cards.find(c=>c.cardId===id).name=null;
 await show(concealed);eq(await page.locator('#cm-card-inspector img').count(),0,'redacted face-down identity is removed from inspection');
 await page.keyboard.press('Escape');
 // Structured public references use the same read-only inspector.
 const reference=structuredClone(sample);reference.revision=++revision;
 reference.state.stack=[{stackId:71001,name:'Lightning Bolt',playerId:1}];
 reference.events=[{eventId:'r2-event',kind:'land',player:1,card:{cardId:71002,name:'Forest'}}];
 await show(reference);await page.locator('.cm-stage-right').click();
 await page.locator('[data-action="board-inspect"][data-kind="stack"]').click();
 ok((await page.locator('#cm-card-inspector').innerText()).includes('Lightning Bolt'),'stack card uses the shared inspector');
 await page.keyboard.press('Escape');
 await page.locator('[data-action="board-inspect"][data-kind="event"]').click();
 ok((await page.locator('#cm-card-inspector').innerText()).includes('Forest'),'structured history card uses the shared inspector');
 eq(sent.filter(x=>x.type==='act').length,0,'browsing public references does not send a game action');
 await page.keyboard.press('Escape');await page.locator('.cm-stage-right').click();
 await change(page,'full');await page.reload();await page.locator('.cm-stage-region').waitFor();
 eq(await page.locator('#cm-board').getAttribute('data-view'),'full','saved 3D preference survives reload');
 mkdirSync(path.join(ROOT,'work/r2-proof'),{recursive:true});
 for(const mode of ['full','focus','table']){await change(page,mode);await page.screenshot({path:path.join(ROOT,`work/r2-proof/${mode}.png`)});}
 await page.setViewportSize({width:390,height:844});await page.locator('#cm-board[data-phone]').waitFor();
 eq(await page.locator('#cm-board').getAttribute('data-view'),'focus','phone keeps its Focus layout');
 eq(await page.evaluate(()=>localStorage.getItem('cm-board-view')),'table','phone fallback does not overwrite desktop preference');
 eq(errors,[],'no page errors');await context.close();
 console.log(`board-r2-actions-inspection: ${checks} checks passed`);
}finally{await close();}
