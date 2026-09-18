import http from "http";
import path from "path";
import { createRequire } from "module";
const PKG = "C:/Users/robmi/OneDrive/Documents/My Games/MtG/work/commander-phase-c/_e2e-confidence";
const Ws = createRequire(PKG + "/scripts/raw-matrix-a.mjs")(path.join(PKG, "lib/ws"));
function httpJson(url){return new Promise((resolve,reject)=>{http.get(url,res=>{const c=[];res.on("data",d=>c.push(d));res.on("end",()=>resolve(JSON.parse(Buffer.concat(c).toString())));}).on("error",reject);});}
const list=await httpJson("http://127.0.0.1:9222/json/list");
const page=list.find(t=>t.type==="page"&&/8768/.test(t.url));
const ws=new Ws(page.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.once("open",r);ws.once("error",j);});
let id=0; const pending=new Map();
ws.on("message",raw=>{const m=JSON.parse(String(raw)); if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id); if(m.error)reject(new Error(m.error.message)); else resolve(m.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method,params}));});
const evaluate=async(expression)=>{const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value;};
await send("Runtime.enable");
const dump=await evaluate(`(() => {
  const lob = JSON.parse(localStorage.getItem('cm-lobby')||'null');
  const L = window.CrankLobby || window.L;
  let table = null;
  try {
    if (L && L.table) {
      const seats = [];
      if (lob.host && lob.host.seat) seats.push(Object.assign({}, lob.host.seat, {you:true, ready:!!lob.host.ready}));
      (lob.opponents||[]).forEach(o => { if (o && o.role!=='unused' && o.seat) seats.push(Object.assign({}, o.seat, {you:false, ready:!!o.ready, role:o.role})); });
      table = L.table({ bracket: lob.bracket, gameChangers: lob.cap===''?undefined:lob.cap, seats, seed:'', fixedSeating:false });
    }
  } catch (e) { table = { err: String(e && e.message || e) }; }
  const btns = [...document.querySelectorAll('button,[data-action]')].filter(b => /start|ready|confirm|seat/i.test((b.textContent||'')+(b.getAttribute('data-action')||''))).map(b => ({
    action: b.getAttribute('data-action'), text: (b.textContent||'').trim().slice(0,80), disabled: !!b.disabled
  }));
  return {
    rulesConfirmed: lob && lob.rulesConfirmed,
    tableReady: table && table.ready,
    tableWhy: table && table.why,
    tableChecks: table && table.checks,
    tableErr: table && table.err,
    hasCrankLobby: !!window.CrankLobby,
    btns,
    main: (document.querySelector('#cm-main,main')||document.body).innerText.slice(0,1200),
  };
})()`);
console.log(JSON.stringify(dump,null,2));
ws.close();