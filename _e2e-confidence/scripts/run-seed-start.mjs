import http from "http";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { randomUUID } from "crypto";
const root = "C:/Users/robmi/OneDrive/Documents/My Games/MtG/work/commander-phase-c";
const PKG = root + "/_e2e-confidence";
const Ws = createRequire(PKG + "/scripts/raw-matrix-a.mjs")(path.join(PKG, "lib/ws"));
const BASIC = /^(plains|island|swamp|mountain|forest|wastes)$/i;
function seatFromLive(state, deckId, name) {
  const d = Object.values(state.decks).find((x) => x.id === deckId);
  const nameOf = (cardId) => (state.cards[cardId] && state.cards[cardId].name) || "";
  const commanders = (d.commanders || []).map(nameOf).filter(Boolean).map((n) => ({ name: n }));
  const cmdSet = new Set(commanders.map((c) => c.name.toLowerCase()));
  const cards = [];
  for (const slot of d.slots || []) {
    if (slot.purpose && slot.purpose !== "main") continue;
    const n = nameOf(slot.cardId);
    if (!n || cmdSet.has(n.toLowerCase())) continue;
    const qty = Number(slot.quantity) || 1;
    const existing = cards.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) existing.quantity += qty;
    else cards.push({ name: n, quantity: qty, basic: BASIC.test(n) });
  }
  return { kind: "library", deckId, name, commanders, cards };
}
function httpJson(url){return new Promise((resolve,reject)=>{http.get(url,res=>{const c=[];res.on("data",d=>c.push(d));res.on("end",()=>resolve(JSON.parse(Buffer.concat(c).toString())));}).on("error",reject);});}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const state=JSON.parse(fs.readFileSync(root+"/data/live-state.json","utf8")).payload.state;
const seats=[
  seatFromLive(state,"deck:live:D2","Rob"),
  seatFromLive(state,"deck:live:D6","Krenko"),
  seatFromLive(state,"deck:live:D3","Atraxa"),
  seatFromLive(state,"deck:live:D5","Shadrix"),
];
const lobby={bracket:3,cap:"",host:{seat:seats[0],ready:true},hostBuildDef:null,opponents:seats.slice(1).map(seat=>({role:"ai",ready:true,seat,guestName:"",guestEmail:"",inviteId:randomUUID()})),rulesConfirmed:{bracket:3,cap:""}};
const list=(await httpJson("http://127.0.0.1:9222/json/list"));
const page=list.find(t=>t.type==="page"&&/8768/.test(t.url));
const ws=new Ws(page.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.once("open",r);ws.once("error",j);});
let mid=0; const pending=new Map();
ws.on("message",raw=>{const m=JSON.parse(String(raw)); if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id); if(m.error)reject(new Error(m.error.message)); else resolve(m.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++mid;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(expression)=>{const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,userGesture:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value;};
await send("Runtime.enable"); await send("Page.enable");
await evaluate(`(() => { localStorage.setItem('cm-lobby', ${JSON.stringify(JSON.stringify(lobby))}); location.hash='game'; location.reload(); return true; })()`);
await sleep(6000);
// close dialogs / tour overlays
await evaluate(`(() => {
  document.querySelectorAll('[data-action="close"],[data-action="tour-close"],dialog[open] button').forEach(b=>{ try{b.click();}catch{} });
  const c=document.querySelector('[data-action="lobby-confirm-rules"]');
  if (c && !/Confirmed/i.test(c.textContent||'')) c.click();
  return true;
})()`);
await sleep(800);
const dump=await evaluate(`(() => {
  const all=[...document.querySelectorAll('button,[data-action]')].map(b=>({a:b.getAttribute('data-action'),t:(b.textContent||'').trim().slice(0,50),d:!!b.disabled})).filter(x=>/lobby|start|ready|confirm/i.test((x.a||'')+x.t));
  const start=document.querySelector('[data-action="lobby-start"]');
  const htmlHasStart=/lobby-start|Start the game|Not ready/i.test(document.body.innerHTML);
  return { all, start: start?{t:(start.textContent||'').trim(),d:!!start.disabled}:null, htmlHasStart, main:(document.querySelector('#cm-main,main')||document.body).innerText.slice(-800) };
})()`);

console.log(JSON.stringify(dump,null,2));
if (!dump.start || dump.start.d) { console.log("NO_START"); ws.close(); process.exit(2); }
const click = await evaluate(`(() => { const b=document.querySelector('[data-action="lobby-start"]'); b.click(); return {ok:true,text:(b.textContent||'').trim()}; })()`);
console.log("CLICK", click);
const report = { notices: [], live: null, startClick: click, after: dump };
let live = null;
const deadline = Date.now() + 240000;
while (Date.now() < deadline) {
  const notices = await evaluate(`([...document.querySelectorAll('#cm-notice,.cm-toast,[role=status],.cm-notice')].map(n=>(n.textContent||'').trim()).filter(Boolean).slice(0,12))`);
  report.notices = notices;
  live = await httpJson("http://127.0.0.1:8768/api/live");
  report.live = live;
  console.log(new Date().toISOString(), "status=", live && live.status, "notices=", notices);
  if ((notices||[]).some(t => /This lobby is G0|lobby is G0/i.test(t))) { report.g0 = true; break; }
  const st = live && live.status;
  if (st === "ready" || st === "playing" || st === "starting") break;
  if (st === "error" || st === "failed" || st === "incomplete" || (live && live.error)) break;
  if ((notices||[]).some(t => /exceeds|Missing prices|prepare failed|Start failed|error/i.test(t))) break;
  await sleep(2000);
}
let verdict;
if (report.g0) verdict = "FAIL blocker:G0_STUB";
else if (live && (live.status === "ready" || live.status === "playing")) verdict = "PASS CONFIDENT — /api/live status=" + live.status;
else if (live && live.status === "starting") verdict = "PASS PARTIAL — /api/live status=starting";
else verdict = "FAIL — status=" + (live && live.status) + " notices=" + JSON.stringify(report.notices) + " err=" + (live && (live.error || live.message));
const OUT = PKG + "/out";
fs.mkdirSync(OUT, { recursive: true });
const runDir = OUT + "/matrix-A-seed-" + Date.now();
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(runDir + "/report.json", JSON.stringify(report, null, 2));
fs.writeFileSync(runDir + "/VERDICT.txt", verdict + "\n");
fs.writeFileSync(OUT + "/VERDICT-LATEST.txt", verdict + "\n\n" + JSON.stringify(report, null, 2) + "\n");
console.log("\n==== VERDICT ====\n" + verdict);
ws.close();
process.exit(/PASS/.test(verdict) ? 0 : 2);
