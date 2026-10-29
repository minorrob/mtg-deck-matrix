/* THE HOVER NEVER LOCKS (Rob, 2026-10-25, a screenshot of "Sol Ring: what to tap for it": "I need to take the action ...
   and select a mana. In this instance, I don't remember what Interplanar Beacon does, so I want to go and hover over it
   to pop-up the card. I can't. I'm locked into Sol Ring."). A question about one card pinned it in the inspector, and an
   open inspection silenced every hover. Now the card asked about is read in the Actions desk, and the hover works for
   every card, on the table and in the question's own options, in every view.

   On the sample table, Everflowing Chalice asks what to tap for it (choose-cost:461), offering Access Tunnel, an Island
   and Command Tower:
     1. Chalice is read in the Actions desk; no inspector opens on the right.
     2. Hovering another card on the table (Command Tower, Proft) pops it up; so does hovering Chalice itself.
     3. Hovering the option "Access Tunnel" pops that land up; leaving it puts it away; the keyboard's focus does the same.
     4. With a card pinned by 🔍 (Proft), any other card (Faerie Formation) still pops up on a hover. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-hover-during-choice",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"hoverfixture1",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const view=structuredClone(sample);
view.decision={id:"choose-cost:461",kind:"choice",title:"Everflowing Chalice: what to tap for it",mode:"one",min:1,max:1,options:[
  {index:0,label:"Access Tunnel",cardId:459},{index:1,label:"Island",cardId:469},{index:2,label:"Command Tower",cardId:502}]};
for(const id of [459,469,502])view.state.players[view.seat].zones.Battlefield.cards.find(c=>c.cardId===id).tapped=false;
try{
  for(const mode of ["full","focus","table"]){
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
    await context.addInitScript(m=>{localStorage.setItem("cm-board-view",m);localStorage.setItem("crankmagic-audio-muted","true");},mode);
    const page=await context.newPage();if(stub)await stub(page);
    const errors=[];page.on("pageerror",x=>errors.push(x.message));
    await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
    await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"hover@example.com"}}));
    await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
    await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
    await page.routeWebSocket(/\/api\/tables\/hoverfixture1\/connect$/,ws=>{ws.send(JSON.stringify({type:"view",view}));});
    await page.goto(`${base}/index.html#table?id=hoverfixture1`);await page.locator("#cm-board .cm-stage-top, #cm-board .cm-board-top").first().waitFor();
    const desk=page.locator('.cm-stage-rail #cm-board-decision[data-choice-id="choose-cost:461"]');
    await desk.waitFor({timeout:10000});
    const peeked=async()=>{await page.locator("#cm-board-peek .cm-bcard-name").waitFor({state:"attached",timeout:3000});return (await page.locator("#cm-board-peek .cm-bcard-name").textContent()).trim();};
    const away=async()=>{await page.mouse.move(2,450);await page.waitForFunction(()=>!document.getElementById("cm-board-peek"),null,{timeout:3000});};
    /* The pointer moved to a point where that card is the one on top (cards on a 3D mat overlap), as a person would. */
    const onTable=(id)=>({hover:async()=>{
      const at=await page.evaluate((id)=>{for(const el of document.querySelectorAll(`.cm-mat .cm-bcard[data-card="${id}"]`)){const r=el.getBoundingClientRect();for(let fy=.15;fy<.9;fy+=.1)for(let fx=.15;fx<.9;fx+=.1){const x=r.left+r.width*fx,y=r.top+r.height*fy,h=document.elementFromPoint(x,y);if(h&&h.closest(".cm-bcard")===el)return {x,y};}}return null;},id);
      assert.ok(at,`${mode}: card ${id} is somewhere on top on the table`);await page.mouse.move(at.x,at.y,{steps:4});},
      click:async(o)=>{const at=await page.evaluate((id)=>{const el=document.querySelector(`.cm-mat .cm-bcard[data-card="${id}"]`);const r=el.getBoundingClientRect();for(let fy=.15;fy<.9;fy+=.1)for(let fx=.15;fx<.9;fx+=.1){const x=r.left+r.width*fx,y=r.top+r.height*fy,h=document.elementFromPoint(x,y);if(h&&h.closest(".cm-bcard")===el)return {x,y};}return null;},id);await page.mouse.click(at.x,at.y,o);}});

    /* 1. */
    eq(await desk.locator(".cm-action-card .cm-bcard-name").textContent().then(t=>t.trim()),"Everflowing Chalice",`${mode}: the card asked about is read in the Actions desk`);
    eq(await page.locator("#cm-card-inspector").count(),0,`${mode}: no inspector opens on the right`);
    /* 2. */
    /* Whichever of these is on top in this view (in Table, Command Tower can lie under the other lands). */
    const NAMES={502:"Command Tower",526:"Proft, Consulting Detective",545:"Faerie Formation",485:"Thrummingbird"};
    const shown=[];
    for(const id of [502,526,545,485]){
      const top=await page.evaluate((id)=>[...document.querySelectorAll(`.cm-mat .cm-bcard[data-card="${id}"]`)].some(el=>{const r=el.getBoundingClientRect();for(let fy=.15;fy<.9;fy+=.1)for(let fx=.15;fx<.9;fx+=.1){const h=document.elementFromPoint(r.left+r.width*fx,r.top+r.height*fy);if(h&&h.closest(".cm-bcard")===el)return true;}return false;}),id);
      if(!top)continue;
      await away();await onTable(id).hover();shown.push(await peeked());
    }
    ok(shown.length>=2,`${mode}: two or more other cards on the table to hover (${shown.length})`);
    eq(shown,[502,526,545,485].map(id=>NAMES[id]).filter(n=>shown.includes(n)),`${mode}: while Chalice's question is open, hovering any other card on the table pops it up (${shown.join(", ")})`);
    const chalice=await page.evaluate(()=>[...document.querySelectorAll('.cm-mat .cm-bcard[data-card="461"]')].some(el=>{const r=el.getBoundingClientRect();for(let fy=.15;fy<.9;fy+=.1)for(let fx=.15;fx<.9;fx+=.1){const h=document.elementFromPoint(r.left+r.width*fx,r.top+r.height*fy);if(h&&h.closest(".cm-bcard")===el)return true;}return false;}));
    if(chalice){await away();await onTable(461).hover();eq(await peeked(),"Everflowing Chalice",`${mode}: and Chalice itself`);}
    /* 3. */
    await away();await desk.locator('[data-action="board-option"][data-index="0"]').hover();
    eq(await peeked(),"Access Tunnel",`${mode}: hovering the option "Access Tunnel" pops that land up`);
    await away();
    ok(true,`${mode}: leaving it puts it away`);
    await desk.locator('[data-action="board-option"][data-index="2"]').focus();
    eq(await peeked(),"Command Tower",`${mode}: the keyboard's focus on an option shows its card too`);
    await page.locator("body").focus();await page.evaluate(()=>document.activeElement?.blur());
    /* 4. */
    /* A card's menu: a right click in 3D; in Table and Focus a click on the card's upper part (the hover's quick tab lies under its foot), at a point the browser says is the card's. A right click on a card of the flat mat does not open it (docs/ACTIVE.md, reported). */
    await away();await onTable(526).click(mode==="full"?{button:"right"}:{});await page.locator("#cm-card-menu [data-action=board-card-menu-view]").click();
    await page.locator("#cm-card-inspector").waitFor();
    await away();await onTable(545).hover();
    eq(await peeked(),"Faerie Formation",`${mode}: with Proft pinned by 🔍, another card (Faerie Formation) still pops up on a hover`);
    eq(errors,[],`${mode}: no page errors`);
    await context.close();
  }
  console.log(`board-hover-during-choice: ${checks} checks passed — with a card's question open, the card asked about is read in Actions, and the hover pops up any card, on the table or named in an option, in 3D, Focus and Table.`);
}finally{await close();}
