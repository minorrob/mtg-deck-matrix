/* THE PLAY SCREEN, MADE CONSISTENT (Rob, 2026-10-27). One browser walk over the 3D table at 1863 x 902 with both drawers open, asserting what he asked for
   and what was found when the screen was measured, so the next restyle cannot undo it unseen:
     1. Both drawers start at the ribbon, not below the Next step row ("Left and right drawers don't go all the way to the top ribbon").
     2. No poison counter on the ribbon, a table label or a seat card ("a poison counter up in the top left (remove)"); Table vitals keeps it.
     3. A seat's state is a colored dot with its word on hover, never a row of its own ("Colored dot with the word on hover").
     4. A seat card in Boards is two rows of one height, and its life reads as the words around it, not a large bold number.
     5. The table's corner handles draw nothing and still resize ("I don't want circles on the corners ... I just want the functionality there").
     6. The ribbon's controls share one height; each drawer tab holds its own label and hangs from the top of its drawer, narrow.
     7. Neither drawer scrolls sideways; the Actions body shows no bar while it fits.
     8. A pop-up is as wide as its content ("Make the pop-up windows properly sized for the content they include").
     9. The action buttons over the table are about 15% smaller than they were (49px high, 17px type), their type held at the HUD's 15px floor.
    10. A land is played from a screen of its name, its picture, Play and Cancel (board-r4-decisions covers that screen's contents). */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-r5-visual",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[3];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"r5fixture01",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const near=(a,b,t,m)=>{assert.ok(Math.abs(a-b)<=t,`${m} (${a} against ${b})`);checks++};
const context=await browser.newContext({viewport:{width:1863,height:902},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{localStorage.setItem("cm-board-view","full");localStorage.setItem("crankmagic-audio-muted","true");});
const page=await context.newPage();if(stub)await stub(page);
const errors=[];page.on("pageerror",x=>errors.push(x.message));
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"r5@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
await page.route(/\/assets\/environments\/[^/?]+\.webm(\?.*)?$/,r=>{
  const body=readFileSync(path.join(ROOT,new URL(r.request().url()).pathname.slice(1))),m=/bytes=(\d+)-(\d*)/.exec(r.request().headers().range||"");
  if(!m)return r.fulfill({status:200,contentType:"video/webm",headers:{"accept-ranges":"bytes"},body});
  const a=Number(m[1]),b=m[2]?Math.min(Number(m[2]),body.length-1):body.length-1;
  return r.fulfill({status:206,contentType:"video/webm",headers:{"accept-ranges":"bytes","content-range":`bytes ${a}-${b}/${body.length}`},body:body.subarray(a,b+1)});
});
await page.routeWebSocket(/\/api\/tables\/r5fixture01\/connect$/,ws=>{ws.send(JSON.stringify({type:"view",view:sample}));});
await page.goto(`${base}/index.html#table?id=r5fixture01`);
await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor({timeout:60000});
await page.waitForTimeout(1500);
await page.evaluate(()=>{for(const sel of ['[data-action="board-stage-rail"][aria-expanded="false"]','[data-action="board-stage-side"][aria-expanded="false"]'])document.querySelector(sel)?.click();});
await page.waitForTimeout(1800);

const m=await page.evaluate(()=>{
  const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}};
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],cs=(e,p)=>getComputedStyle(e)[p];
  const top=q(".cm-stage-top"),rail=q(".cm-stage-rail"),side=q(".cm-stage-side");
  const seatCards=qa(".cm-stage-rail .cm-seat-header").map(h=>{const st=h.querySelector(".cm-seat-state"),hand=h.querySelector(".cm-seat-hand"),v=h.querySelector(".cm-vitals"),w=h.querySelector(".cm-state-word");return {h:R(h),dot:R(st),word:{text:w.textContent.trim(),box:R(w)},dotAfter:getComputedStyle(st,"::before").backgroundColor,hand:R(hand),handFs:cs(hand,"fontSize"),lifeFs:cs(v.querySelector("b"),"fontSize"),lifeW:cs(v.querySelector("b"),"fontWeight"),handW:cs(hand,"fontWeight"),vit:R(v)}});
  const tabs=qa(".cm-drawer-tab").map(t=>{const lab=t.querySelector(".cm-tab-label"),cnt=t.querySelector(".cm-tab-count");return {box:R(t),label:R(lab),count:cnt&&R(cnt),side:t.classList.contains("cm-stage-right")?"right":"left"}});
  const ctl=qa(".cm-stage-top .cm-table-menu>button,.cm-stage-top .cm-stage-camera>button,.cm-stage-top .v-button,.cm-stage-top .cm-profile-avatar").map(e=>({t:(e.textContent.trim()||e.getAttribute("aria-label")||"").slice(0,10),h:R(e).h}));
  const dec=q("#cm-board-decision");
  return {
    viewport:[innerWidth,innerHeight],ribbon:R(top),rail:R(rail),side:R(side),
    poison:qa("#cm-board *").filter(e=>e.children.length===0&&/☠/.test(e.textContent)&&getComputedStyle(e).display!=="none").map(e=>e.className.toString()),
    poisonClass:qa(".cm-vitals-poison").length,
    seatCards,tabs,ctl,
    corners:qa(".cm-stage-corner").map(c=>({w:R(c).w,h:R(c).h,bg:cs(c,"backgroundColor"),shadow:cs(c,"boxShadow"),border:cs(c,"borderTopWidth"),cursor:cs(c,"cursor"),opacity:cs(c,"opacity")})),
    railOx:cs(rail,"overflowX"),sideOx:cs(side,"overflowX"),railXover:rail.scrollWidth>rail.clientWidth,sideXover:side.scrollWidth>side.clientWidth,
    decision:dec&&{ox:cs(dec,"overflowX"),fits:dec.scrollHeight<=dec.clientHeight+1,h:dec.clientHeight},
    heading:q('.cm-stage-rail .cm-stage-module[data-module="actions"]>header h3')?.textContent.replace(/[▾▸▴◂]/g,"").trim(),
    actions:qa(".cm-stage-actions .v-button").map(b=>({h:R(b).h,fs:parseFloat(cs(b,"fontSize"))}))
  };
});

/* 1. */
near(m.rail.t,m.ribbon.b,1.5,"the left drawer starts at the ribbon's foot");
near(m.side.t,m.ribbon.b,1.5,"the right drawer starts at the ribbon's foot");
near(m.rail.b,m.viewport[1],1.5,"and the left drawer runs to the window's foot");
/* 2. */
eq(m.poison,[],"no poison counter is drawn on the ribbon, a table label or a seat card");
eq(m.poisonClass,0,"and no element carries the poison class");
/* 3 and 4. */
ok(m.seatCards.length>=3,"Boards lists every seat");
for(const c of m.seatCards){
  near(c.dot.w,10,1,`${c.word.text}: the state is a 10px dot`);
  ok(c.word.text.length>2&&c.word.box.w<=2,`${c.word.text}: its word is in the page and not seen`);
  ok(c.dot.t<c.vit.t-4,`${c.word.text}: the dot is on the card's first row, not a row of its own`);
}
near(Math.max(...m.seatCards.map(c=>c.h.h))-Math.min(...m.seatCards.map(c=>c.h.h)),0,1,"every seat card is the same height");
for(const c of m.seatCards){eq([c.lifeFs,c.lifeW],[c.handFs,c.handW],"life reads at the size and weight of the hand count beside it");}
/* the word on hover */
await page.locator(".cm-stage-rail .cm-seat-state").first().hover({force:true});
await page.waitForTimeout(150);
const hover=await page.evaluate(()=>{const w=document.querySelector(".cm-stage-rail .cm-seat-state .cm-state-word").getBoundingClientRect();return {w:w.width,h:w.height,fs:parseFloat(getComputedStyle(document.querySelector(".cm-stage-rail .cm-seat-state .cm-state-word")).fontSize)}});
ok(hover.w>30&&hover.h>10&&hover.fs>=15,`hovering the dot shows its word at the HUD's size (${Math.round(hover.w)} x ${Math.round(hover.h)}, ${hover.fs}px)`);
await page.mouse.move(900,500);
/* 5. */
eq(m.corners.length,4,"the table has four corner handles");
for(const c of m.corners){ok(c.w>=22&&c.h>=22&&/nwse|nesw/.test(c.cursor),"a corner handle is a 22px target with its resize cursor");ok(c.shadow==="none"&&c.bg==="rgba(0, 0, 0, 0)"&&c.border==="0px","and draws nothing");}
/* 6. */
const heights=m.ctl.map(c=>Math.round(c.h));ok(heights.length>=5&&new Set(heights).size===1,`the ribbon's controls share one height (${m.ctl.map(c=>c.t+" "+Math.round(c.h)).join(", ")})`);
eq(m.tabs.length,2,"there are two drawer tabs");
for(const t of m.tabs){
  ok(t.label.l>=t.box.l-1&&t.label.r<=t.box.r+1&&t.label.t>=t.box.t-1&&t.label.b<=t.box.b+1,`${t.side} tab: its label is inside it`);
  if(t.count)ok(t.count.l>=t.box.l-1&&t.count.r<=t.box.r+1&&t.count.b<=t.box.b+1,`${t.side} tab: its count is inside it`);
  ok(t.box.w<=44,`${t.side} tab: narrow (${Math.round(t.box.w)}px)`);
  near(t.box.t,m.ribbon.b,1.5,`${t.side} tab: hangs from the top of its drawer`);
}
/* 7. */
eq([m.railOx,m.sideOx],["hidden","hidden"],"neither drawer scrolls sideways");
eq([m.railXover,m.sideXover],[false,false],"and neither has anything wider than itself");
ok(m.decision&&m.decision.ox==="hidden"&&m.decision.fits,"the Actions body has no vertical bar while its content fits");
eq(m.heading,"Actions","the first section is called Actions");
/* 9. */
ok(m.actions.length>=1&&m.actions.every(b=>b.h<=43&&b.fs>=15),`the action buttons are 42px high with 15px type (${m.actions.map(b=>Math.round(b.h)+"/"+b.fs).join(", ")})`);
/* 8. */
await page.evaluate(()=>document.querySelector('[data-action="send-feedback"]').click());
await page.waitForTimeout(700);
const dlg=await page.evaluate(()=>{const d=document.querySelector("dialog[open]"),f=d.querySelector("form"),r=d.getBoundingClientRect(),fr=f.getBoundingClientRect();return {w:r.width,form:fr.width,innerW:r.width-50};});
ok(dlg.w<=640&&dlg.form>=dlg.innerW-60,`the feedback pop-up is as wide as its form, with no empty column (${Math.round(dlg.w)}px for a ${Math.round(dlg.form)}px form)`);
eq(errors,[],"no page errors");
await close();
console.log(`board-r5-visual: ${checks} checks passed — drawers from the ribbon, no poison pills, a status dot with its word on hover, two-row seat cards with plain life, invisible corner handles, one ribbon height, hung tabs with their labels inside, no sideways scrolling, pop-ups sized to content, smaller action buttons.`);
