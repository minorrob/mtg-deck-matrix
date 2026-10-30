/* ROB-28: the browser sends a room policy, never a stream of local passes.
 * Controlled socket frames hold acknowledgments and refusals independently of
 * the button. Room semantics are exercised by room-yield-turn.mjs; these checks
 * prove presentation, two tabs, reconnect, and pointer reach without scrolling
 * a hidden overflow into view. GEOMETRY_REQUIRED=1 requires Chromium.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
import path from "node:path";

const {browser, base, stub, close} = await openBrowser({name:"board-yield", flag:"GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8"));
let current = structuredClone(sample.views[13]);
current.revision = 10000;
current.state.turnPlayerId = (current.seat + 1) % current.state.players.length;
current.state.turn = 8;
current.state.turnId = "turn:8";
delete current.yourTurn;
current.mayYield = true;
current.decision = {id:"priority:yield-test", kind:"priority", mode:"one", title:"Your priority",
  options:[{index:0, act:"pass", label:"Pass priority"}]};
const incoming = [], sockets = [], pageErrors = [];
const table = () => ({tableId:"yieldtest01", phase:"playing", matchId:current.matchId, away:[],
  seats:current.state.players.map(p=>({seatId:p.playerId, name:p.name, kind:"human", mat:"felt", you:p.playerId===current.seat}))});
const html = readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",
  '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const tick = async page => {await page.waitForTimeout(180);};
function publish(patch = {}) {
  current = {...current, ...patch, revision:current.revision+1};
  for (const socket of sockets) if (!socket.closed) socket.ws.send(JSON.stringify({type:"view",view:current}));
}
async function open(context) {
  const page = await context.newPage();
  page.on("pageerror", error=>pageErrors.push(error.message));
  if (stub) await stub(page);
  await page.route(`${base}/index.html*`, r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route(`${base}/api/me`, r=>r.fulfill({json:{email:"yield@example.com"}}));
  await page.route(`${base}/api/library**`, r=>r.fulfill({json:{head:null}}));
  await page.route(`${base}/api/tables**`, r=>r.fulfill({json:{table:table(),now:Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/yieldtest01\/connect$/, ws=>{
    const socket = {ws,closed:false,page}; sockets.push(socket);
    ws.onMessage(data=>incoming.push(JSON.parse(data)));
    ws.onClose(()=>{socket.closed=true;});
    ws.send(JSON.stringify({type:"view",view:current}));
  });
  await page.goto(`${base}/index.html#table?id=yieldtest01`);
  try {await page.locator("#cm-board [data-action=board-skip]").first().waitFor({timeout:15000});}
  catch(error) {console.error((await page.locator("body").innerText()).slice(-2500));throw error;}
  return page;
}
const control = page=>page.locator("#cm-board [data-yield-control]").first();
const button = page=>control(page).locator("button");
async function hit(page) {
  const box = await button(page).boundingBox();
  assert.ok(box && box.x>=0 && box.y>=0 && box.x+box.width<=page.viewportSize().width && box.y+box.height<=page.viewportSize().height,
    "Yield fits inside the actual viewport");
  assert.ok(await button(page).evaluate(el=>{
    const r=el.getBoundingClientRect();
    return [.25,.5,.75].every(x=>el.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height/2)));
  }), "Yield receives pointer hits without scrollIntoView");
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await tick(page);
}
try {
  const context = await browser.newContext({viewport:{width:1280,height:720}, reducedMotion:"reduce",serviceWorkers:"block"});
  await context.addInitScript(()=>{localStorage.setItem("cm-board-view","full");localStorage.setItem("crankmagic-audio-muted","true");});
  const page = await open(context);
  page.setDefaultTimeout(5000);
  assert.equal(await button(page).innerText(),"Yield this turn");
  assert.match(await control(page).innerText(),/Pass all priority; still choose/);
  await hit(page);
  assert.deepEqual(incoming.filter(x=>x.type==="yield"),[{type:"yield",on:true}],"Yield sends the room frame once");
  assert.equal(incoming.filter(x=>x.type==="act").length,0,"no local priority answers");
  assert.equal(await button(page).innerText(),"Requesting yield…");
  assert.equal(await button(page).getAttribute("aria-pressed"),"false","not active before acknowledgment");
  assert.ok(await button(page).isDisabled(),"duplicate start blocked while pending");
  publish({yielding:true,mayYield:undefined,decision:null});
  await tick(page);
  assert.equal(await button(page).innerText(),"Stop yielding");
  assert.equal(await button(page).getAttribute("aria-pressed"),"true");
  assert.match(await control(page).innerText(),/turn 8/,"active turn is named");
  const other = await open(context);
  assert.equal(await button(other).getAttribute("aria-pressed"),"true","a second tab reads the room policy");
  const required = {id:"required:may",kind:"choose",mode:"boolean",title:"Use this optional effect?",
    options:[{index:0,label:"Yes"},{index:1,label:"No"}]};
  publish({decision:required,state:{...current.state,stack:[{stackId:8001,cardId:8001,name:"Test spell",playerId:1,kind:"spell",stage:"waiting",targets:[]}]}});
  await tick(page);
  assert.equal(await control(page).count(),0,"required popup hides the optional yield control");
  assert.equal(incoming.filter(x=>x.type==="act").length,0,"no choice answered for the player");
  await page.locator('[data-action=board-flow-choice][data-indices~="1"]').click();
  await page.locator('[data-action=board-flow-confirm]').click();
  await tick(page);
  assert.deepEqual(incoming.filter(x=>x.type==="act").at(-1).indices,[1],"the player's optional choice is sent");
  publish({decision:null});
  await tick(page);
  assert.equal(await button(page).getAttribute("aria-pressed"),"true","yield policy survives the required choice");
  await hit(page);
  assert.deepEqual(incoming.filter(x=>x.type==="yield").at(-1),{type:"yield",on:false});
  assert.equal(await button(page).innerText(),"Stopping yield…");
  assert.equal(await button(page).getAttribute("aria-pressed"),"true","Stop waits for the room acknowledgment");
  publish({yielding:undefined,mayYield:true});
  await tick(page);
  assert.equal(await button(other).getAttribute("aria-pressed"),"false","another tab sees Stop");
  await hit(page);
  sockets[0].ws.send(JSON.stringify({type:"refused",of:"yield",error:"Wait for the current action to finish.",view:current}));
  await tick(page);
  assert.equal(await button(page).innerText(),"Yield this turn","refusal clears pending state");
  assert.ok(await button(page).isEnabled(),"refusal can be retried");
  publish({yielding:true,mayYield:undefined});
  await tick(page);
  await page.reload();
  await page.locator("#cm-board").waitFor({timeout:15000});
  await button(page).waitFor().catch(async error=>{console.error("YIELD RELOAD",pageErrors,await page.locator("body").innerText());throw error;});
  assert.equal(await button(page).getAttribute("aria-pressed"),"true","reload restores acknowledged yield");
  const yieldingFrames = incoming.filter(x=>x.type==="yield").length;
  const liveSocket = sockets.findLast(s=>s.page===page && !s.closed);
  liveSocket.closed = true; liveSocket.ws.close();
  await tick(page);
  assert.ok(await button(page).isDisabled(),"disconnected state cannot claim a Stop request");
  assert.match(await control(page).innerText(),/state unconfirmed/);
  await page.waitForFunction(()=>!document.querySelector("[data-yield-control] button")?.disabled);
  assert.equal(incoming.filter(x=>x.type==="yield").length,yieldingFrames,"reconnect never replays Yield");
  assert.equal(await button(page).getAttribute("aria-pressed"),"true","fresh reconnect view restores policy");
  publish({yielding:undefined,mayYield:true,state:{...current.state,turn:9,turnId:"turn:9",extraTurn:true}});
  await tick(page);
  assert.equal(await button(page).getAttribute("aria-pressed"),"false","same player's extra turn expires yield");
  for (const [width,height] of [[1024,768],[1280,720],[1400,900],[390,844]]) {
    await page.setViewportSize({width,height});
    await tick(page);
    await hit(page);
    publish({yielding:true,mayYield:undefined});
    await tick(page);
    if (process.env.UAT_SHOTS && (width===1280 || width===390)) {
      mkdirSync(process.env.UAT_SHOTS,{recursive:true});
      await control(page).evaluate(el=>{document.querySelector("[data-proof-tag]")?.remove();const r=el.getBoundingClientRect(),tag=document.createElement("b");tag.dataset.proofTag="Y01";tag.textContent="Y01";tag.style.cssText=`position:fixed;left:${Math.max(0,r.left-28)}px;top:${r.top}px;z-index:99999;background:#fff;color:#000;padding:2px;font:11px sans-serif;pointer-events:none`;document.body.append(tag);});
      await page.screenshot({path:path.join(process.env.UAT_SHOTS,`rob-28-yield-${width}x${height}.png`)});
    }
    await hit(page);
    publish({yielding:undefined,mayYield:true});
    await tick(page);
  }
  publish({mayYield:undefined,state:{...current.state,turnPlayerId:current.seat}});
  await tick(page);
  assert.equal(await control(page).count(),0,"own turn offers no Yield");
  publish({state:{...current.state,turnPlayerId:(current.seat+1)%current.state.players.length}});
  await tick(page);
  assert.equal(await control(page).count(),0,"legacy games do not invent permission to yield");
  publish({mayYield:true,status:"finished",result:{reason:"ended early",endedBy:"s0"}});
  await tick(page);
  assert.equal(await control(page).count(),0,"finished games have no Yield");
  assert.deepEqual(pageErrors,[],"neither tab throws a browser error");
  console.log("board-yield: PASS (room frames, acknowledgment, choices, refusal, tabs, reload, expiry, pointer reach)");
} finally {await close();}
