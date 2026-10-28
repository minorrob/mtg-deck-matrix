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
  eq(await page.locator('.cm-stage-rail .cm-stage-module[data-module="actions"]').count(),1,"one left Actions module in each view");
  eq(await page.locator('.cm-stage-rail nav[aria-label="Boards"]').count(),1,"Boards lives beside Actions");
  eq(await page.locator('#cm-board-decision').count(),1,"no duplicate decision prompt");
  await page.locator('[data-action="board-camera"]').click();
  eq(await page.locator('[data-action="board-view"][data-view="full"]').getAttribute("title"),"3D","3D label replaces Full screen");
  await page.locator('[data-action="board-camera"]').click();
  const target=page.locator(`.cm-bcard[data-card="${id}"]`).filter({has:page.locator('img')}).first();
  await target.hover();await page.locator('#cm-board-peek').waitFor();
  eq(sent.filter(x=>x.type==="act").length,0,"hover inspection does not act");
  await target.click({button:"right"});await page.locator('#cm-card-menu [data-action=board-card-menu-view]').click();await page.locator('#cm-card-inspector').waitFor();
  await target.hover();await page.waitForTimeout(450);
  eq(await page.locator('#cm-board-peek').count(),0,'pinned inspection suppresses a duplicate preview over the board');
  eq(sent.filter(x=>x.type==="act").length,0,"pinned inspection does not act");
  /* Rob, 2026-10-28: drawers (and the inspector, which lies at the right edge) are the TOP LAYER. The old guarantee "the game surface stays
     clear of Actions and inspector" is superseded: the stage is the window's whole width and does not move for either; they lie over it
     (a pointer at their edge finds them), and in Table and Focus the boards keep clear of where the drawers and inspector lie. */
  const bounds=await page.evaluate(()=>{
   const host=document.querySelector('#cm-board'),R=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)};};
   const rail=host.querySelector('.cm-stage-rail').getBoundingClientRect(),inspect=host.querySelector('#cm-card-inspector').getBoundingClientRect();
   const at=(x,y)=>document.elementFromPoint(x,y);
   return {rail:rail.right,inspect:inspect.left,region:R(host.querySelector('.cm-stage-region')),hand:R(host.querySelector('.cm-stage-hand')),
    slots:[...host.querySelectorAll('.cm-stage-slot,.cm-stage-rear')].map(R),
    railOver:!!at(rail.left+20,rail.bottom-30)?.closest('.cm-stage-rail'),inspectOver:!!at(inspect.left+20,inspect.bottom-30)?.closest('#cm-card-inspector')};
  });
  ok(bounds.railOver&&bounds.inspectOver,"Actions and the inspector lie over the stage (they are what a pointer finds at their edge)");
  ok(bounds.region.x===0&&bounds.region.w===1440&&bounds.hand.x===0&&bounds.hand.w===1440,`the stage and the hand stay the window's whole width with Actions and the inspector open (${JSON.stringify(bounds.region)})`);
  if(mode!=='full') for(const b of bounds.slots) ok(b.x>=bounds.rail-1&&b.x+b.w<=bounds.inspect+1&&b.w>0,`${mode}: a board stays clear of Actions and the inspector (${b.x}..${b.x+b.w} within ${bounds.rail}..${bounds.inspect})`);
  const shut=await (async()=>{await page.keyboard.press('Escape');await page.locator('#cm-card-inspector').waitFor({state:'detached'});return page.evaluate(()=>{const R=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)};};return {region:R(document.querySelector('.cm-stage-region')),hand:R(document.querySelector('.cm-stage-hand')),slots:[...document.querySelectorAll('.cm-stage-slot,.cm-stage-rear')].map(R)};});})();
  eq(shut.region,bounds.region,"opening the inspector does not move the stage");
  eq(shut.hand,bounds.hand,"opening the inspector does not move the hand");
  if(mode!=='full') eq(shut.slots,bounds.slots,`${mode}: opening the inspector does not move a board`);
  if(mode==='full') {
   const fit=await page.evaluate(()=>{const r=document.querySelector('.cm-stage-hand').getBoundingClientRect();return [...document.querySelectorAll('.cm-stage-fan-slot')].every(el=>{const c=el.getBoundingClientRect();return c.left>=r.left-1&&c.right<=r.right+1;});});
   ok(fit,'3D hand stays inside the space remaining beside both panes');
  }
  eq(await page.locator('#cm-card-inspector').count(),0,"Escape closes inspection only");
  eq(await page.locator('#cm-board').getAttribute('data-view'),mode,"Escape does not change view preference");
  await page.locator('[data-action="board-actions-toggle"]').click();
  ok(await page.locator('#cm-decision-slot #cm-board-decision').isVisible(),"collapsed Actions retains an actionable pending decision");
  await page.locator('[data-action="board-actions-open"]').click();
  await page.locator('.cm-stage-left').click();
  ok(await page.locator('#cm-decision-slot #cm-board-decision').isVisible(),"closed drawer keeps the pending choice reachable");
  await page.locator('[data-action="board-actions-open"]').click();
 }
 // A draft remains the same question while inspecting and switching views.
 const choice=structuredClone(sample);choice.revision=++revision;
 choice.decision={id:"r2-targets",kind:"targets",title:"Choose two creatures",mode:"many",min:2,max:2,options:[{index:0,label:"First creature",cardId:id},{index:1,label:"Second creature",cardId:id+1}]};
 await show(choice);
 await page.locator('#cm-board-decision [data-index="0"]').click();
 await change(page,"focus");
 eq(await page.locator('#cm-board-decision [data-index="0"]').getAttribute('aria-pressed'),'true','selection survives view switch');
 await page.locator(`.cm-stage-fan .cm-bcard[data-card="${id}"]`).click({button:"right"});await page.locator('#cm-card-menu [data-action=board-card-menu-view]').click();
 eq(await page.locator('#cm-board-decision [data-index="0"]').getAttribute('aria-pressed'),'true','inspection preserves draft');
 await page.keyboard.press("Escape");
 const newer=structuredClone(choice);newer.revision=++revision;newer.decision.id="r2-new-targets";await show(newer);
 eq(await page.locator('#cm-board-decision [data-index="0"]').getAttribute('aria-pressed'),'false','a new question clears the old draft');
 // Touch inspection must consume the click synthesized after the hold.
 const touch=structuredClone(sample);touch.revision=++revision;
 touch.decision={id:'r2-touch',kind:'priority',mode:'one',title:'Your priority',options:[{index:0,act:'cast',label:'Cast this card',cardId:id}]};
 await show(touch);
 await page.locator(`.cm-stage-fan .cm-bcard[data-card="${id}"]`).dispatchEvent('pointerdown',{pointerType:'touch',clientX:700,clientY:750});
 await page.locator('#cm-card-inspector').waitFor();
 await page.locator(`.cm-stage-fan .cm-bcard[data-card="${id}"]`).dispatchEvent('click',{detail:1});await page.waitForTimeout(100);
 eq(sent.filter(x=>x.type==='act').length,0,'long-press follow-up click cannot play a card');
 eq(await page.locator('.cm-action-review').count(),0,'long-press follow-up click cannot select an action either');
 await page.keyboard.press('Escape');
 // Selection is private until an explicit confirmation, in every view.
 const ways=structuredClone(sample);ways.revision=++revision;
 ways.decision={id:'r2-ways',kind:'priority',mode:'one',title:'Your priority',options:[{index:0,act:'cast',label:'Cast first way',cardId:id,detail:'→ Maya · tapping Forest'},{index:1,act:'cast',label:'Cast second way',cardId:id,detail:'→ Rook · tapping Island'}]};
 for(const mode of ['table','focus','full']) {
  ways.revision=++revision;ways.decision.id='r2-ways-'+mode;await show(structuredClone(ways));await change(page,mode);
  const before=sent.filter(x=>x.type==='act').length;
  await page.locator(`.cm-stage-fan .cm-bcard[data-card="${id}"]`).first().click();
  eq(await page.locator('#cm-dialog[open]').count(),0,'card action choices do not cover the board');
  await page.locator('#cm-board-decision [data-index="1"]').click();
  eq(sent.filter(x=>x.type==='act').length,before,'selecting a target/payment offer sends nothing');
  ok((await page.locator('#cm-board-decision [data-index="1"][aria-pressed="true"]').innerText()).includes('Rook · tapping Island'),'the outlined option names the exact target and payment offer');
  ok((await page.locator('.cm-action-summary').textContent()).includes('Rook · tapping Island'),'a screen reader is told the selection');
  /* Symbols first (Rob, 2026-10-25): no box restating the selection, no paragraph about what Confirm does; Confirm and
     Clear side by side. */
  const desk=await page.evaluate(()=>{const r=document.querySelector('.cm-action-review'),s=r.querySelector('.cm-action-summary').getBoundingClientRect(),[c,x]=[...r.querySelectorAll('.cm-decide-actions>button')];const a=c.getBoundingClientRect(),z=x.getBoundingClientRect();return {p:r.querySelectorAll('p').length,seen:s.width>1||s.height>1,words:[...r.querySelectorAll('.cm-decide-actions>button')].map(b=>b.innerText.trim()),row:Math.abs(a.top-z.top)<2&&z.left>=a.right};});
  ok(desk.p===0&&!desk.seen,`no visible summary or explanation under the options (${desk.p} paragraphs, summary seen ${desk.seen})`);
  eq(desk.words,['✦ Cast Spell','Back','Cancel'],'r4 names the binding action and both draft exits');
  ok(desk.row,'binding action and Back sit side by side');
  /* The drawer's open/shut is a thin chevron with no fill, and the drawer's scrollbar a faint track, never white. */
  const quiet=await page.evaluate(()=>{const t=document.querySelector('[data-action="board-actions-toggle"]'),r=t.getBoundingClientRect(),cs=getComputedStyle(t),back=document.querySelector('.cm-board-back'),d=document.querySelector('#cm-board-decision').getBoundingClientRect();return {w:r.width,h:r.height,bg:cs.backgroundColor,glyph:/[▸▾]/.test(t.textContent),module:t.classList.contains('cm-module-toggle'),back:back?Math.round(back.getBoundingClientRect().left-d.left):null,bar:getComputedStyle(document.querySelector('.cm-stage-rail')).scrollbarColor};});
  /* The 3D HUD's drawers (Table and Focus now share them): the open/shut control is the module's own header row, a thin line of title and
     chevron glyph (▸ ▾) with no fill, as every other module's. The old standalone 24px svg chevron no longer exists; its guarantee, a quiet
     unfilled control that is not a button-sized block, is kept as: one line high (at most 24px), unfilled, carrying the chevron glyph. */
  ok(quiet.h<=24&&quiet.glyph&&quiet.module&&/rgba\(0, 0, 0, 0\)|transparent/.test(quiet.bg),`the Actions toggle is a thin unfilled header row with a chevron (${quiet.w}×${quiet.h}, ${quiet.bg})`);
  eq(quiet.back,0,'All actions is a small link at the left edge');
  ok(!/255, 255, 255\)|#fff\b|white/i.test(quiet.bar)&&quiet.bar!=='auto',`the drawer's scrollbar is quiet (${quiet.bar})`);
  /* Rob, 2026-10-25: "Don't need both. Inspection pane should be within the left drawer." */
  ok(await page.locator('.cm-stage-rail #cm-board-decision .cm-action-card img').count()===1,'the source card is read in the Actions desk during review');
  eq(await page.locator('#cm-card-inspector').count(),0,'and no second inspection pane opens on the right');
  /* Rob, 2026-10-25: "Even when an action to decide on a selected card, my on-hover for any card should still work". */
  await page.mouse.move(2,2);await page.locator(`.cm-stage-fan .cm-bcard[data-card="${id}"]`).first().hover();
  await page.locator('#cm-board-peek').waitFor({timeout:3000});
  ok(true,'while an action is being decided, the hover still pops the card up');
  await page.mouse.move(2,2);
  await page.locator('[data-action="board-reset"]').click();
  eq(sent.filter(x=>x.type==='act').length,before,'clearing draft sends nothing');
  await page.locator('#cm-board-decision [data-index="0"]').click();
  await page.locator('#cm-board-decision [data-action="board-confirm"]').click();
  eq(sent.filter(x=>x.type==='act').at(-1).indices,[0],'confirmation submits only selected authoritative index');
  await show({...structuredClone(ways),revision:++revision,decision:{...ways.decision,id:'r2-reset-'+mode}});
  eq(await page.locator('#cm-card-inspector').count(),0,'automatic action inspection releases space after the game advances');
 }
 const payment=structuredClone(sample);payment.revision=++revision;payment.decision={id:`choose-cost:${id}`,kind:'choice',mode:'one',title:'Choose what to tap',options:[{index:0,label:'Forest and Island'},{index:1,label:'Forest and Sol Ring'}]};
 await show(payment);
 const beforePay=sent.filter(x=>x.type==='act').length;
 await page.locator('#cm-board-decision [data-index="1"]').click();
 eq(sent.filter(x=>x.type==='act').length,beforePay,'payment is not sent on selection');
 ok((await page.locator('#cm-board-decision [data-index="1"][aria-pressed="true"]').innerText()).includes('Forest and Sol Ring'),'payment sources shown for review, outlined');
 await page.locator('[data-action=board-profile]').click();
 await page.locator('[data-action=board-tools]').click();await page.keyboard.press('Escape');
 await page.locator('#cm-board-tools').waitFor({state:'detached',timeout:3000});
 eq(await page.locator('#cm-board-tools').count(),0,'Escape closes the foremost Settings menu');
 eq(await page.locator('.cm-stage-rail #cm-board-decision .cm-action-card').count(),1,'closing Settings preserves the card being reviewed, in the Actions desk');
 await page.keyboard.press('Escape');
 const moved=structuredClone(payment);moved.revision=++revision;await show(moved);
 eq(await page.locator('#cm-board-decision [data-action="board-confirm"]').count(),0,'a revision invalidates the old payment selection even with the same question ID');
 eq(sent.filter(x=>x.type==='act').length,beforePay,'new revision cannot commit the old payment');
 // An inspection must stop exposing an expired private reveal.
 const privateView=structuredClone(sample);privateView.revision=++revision;privateView.decision={id:'r2-reveal',kind:'choice',mode:'ack',title:'Look at this card',options:[{index:0,cardId:999999,label:'Forest'}]};
 await show(privateView);await page.locator('#cm-board-decision [data-action="board-zoom-open"]').click();
 ok((await page.locator('#cm-card-inspector').innerText()).includes('Forest'),'authorized private reveal can be inspected');
 const expired=structuredClone(sample);expired.revision=++revision;await show(expired);
 eq(await page.locator('#cm-card-inspector img').count(),0,'expired private reveal cannot remain in inspector');
 await page.locator('[data-action="board-inspect-close"]').click();
 // Face-down identity comes only from the seat projection, as for ordinary card rendering.
 await change(page,"table");
 const known=structuredClone(sample);known.revision=++revision;
 const knownCard=known.state.players[known.seat].zones.Hand.cards.find(c=>c.cardId===id);knownCard.faceDown=true;
 await show(known);await page.locator(`.cm-stage-fan .cm-bcard[data-card="${id}"]`).click({button:'right'});await page.locator('#cm-card-menu [data-action=board-card-menu-view]').click();
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
 eq(sent.filter(x=>x.type==='act').length,beforePay,'browsing public references does not send a game action');
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
