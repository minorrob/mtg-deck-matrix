import http from "http";
import path from "path";
import { createRequire } from "module";
const PKG="C:/Users/robmi/OneDrive/Documents/My Games/MtG/work/commander-phase-c/_e2e-confidence";
const Ws=createRequire(PKG+"/scripts/raw-matrix-a.mjs")(path.join(PKG,"lib/ws"));
function httpJson(url){return new Promise((r,j)=>http.get(url,res=>{const c=[];res.on("data",d=>c.push(d));res.on("end",()=>r(JSON.parse(Buffer.concat(c).toString())));}).on("error",j));}
const list=await httpJson("http://127.0.0.1:9222/json/list");
const page=list.find(t=>t.type==="page"&&/8768/.test(t.url));
const ws=new Ws(page.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.once("open",r);ws.once("error",j);});
let id=0;const pending=new Map();
ws.on("message",raw=>{const m=JSON.parse(String(raw));if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);if(m.error)reject(new Error(m.error.message));else resolve(m.result);}});
const send=(m,p={})=>new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method:m,params:p}));});
const evaluate=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
await send("Runtime.enable");
const dump=await evaluate(`(() => {
  const decks=(window.C&&C.state&&C.state.decks)||[];
  return {n:decks.length, ids:decks.slice(0,20).map(d=>d.id), sample:decks[0]&&Object.keys(decks[0]), live:decks.filter(d=>String(d.id||'').includes('live')).map(d=>d.id)};
})()`);
console.log(JSON.stringify(dump,null,2));
ws.close();