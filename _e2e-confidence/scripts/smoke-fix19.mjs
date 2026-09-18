import http from "http";
import path from "path";
import { createRequire } from "module";
const PKG = "C:/Users/robmi/OneDrive/Documents/My Games/MtG/work/commander-phase-c/_e2e-confidence";
const Ws = createRequire(PKG + "/scripts/raw-matrix-a.mjs")(path.join(PKG, "lib/ws"));
function httpJson(url){return new Promise((r,j)=>http.get(url,res=>{const c=[];res.on("data",d=>c.push(d));res.on("end",()=>{try{r(JSON.parse(Buffer.concat(c).toString()))}catch{r({raw:Buffer.concat(c).toString()})}});}).on("error",j));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function attach(){const list=await httpJson("http://127.0.0.1:9222/json/list");const page=list.find(t=>t.type==="page"&&/8768/.test(t.url));const ws=new Ws(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once("open",r);ws.once("error",j);});let id=0;const pending=new Map();ws.on("message",raw=>{const m=JSON.parse(String(raw));if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);if(m.error)reject(new Error(m.error.message));else resolve(m.result);}});const send=(m,p={})=>new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method:m,params:p}));});const evaluate=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};await send("Runtime.enable");await send("Page.enable");return {ws,send,evaluate};}
let {ws,send,evaluate}=await attach();
await send("Page.navigate",{url:"http://127.0.0.1:8768/app/#play?seat=testseat"});
await sleep(4000);
try{ws.close()}catch{}
({ws,send,evaluate}=await attach());
const play = await evaluate(`(() => ({hash:location.hash,pin:[...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src')).find(s=>/game\\.js/.test(s||'')),title:(document.querySelector('h1,h2,.cm-page-head')||{}).textContent,body:(document.querySelector('#cm-main,main')||document.body).innerText.slice(0,400),isDecks:/Build it\\. Make it yours/i.test(document.body.innerText)}))()`);
console.log("PLAY", JSON.stringify(play,null,2));
await send("Page.navigate",{url:"http://127.0.0.1:8768/app/#game"});
await sleep(3500);
try{ws.close()}catch{}
({ws,send,evaluate}=await attach());
const lib = await evaluate(`(async () => {
  const pin=[...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src')).find(s=>/game\\.js/.test(s||''));
  const c=document.querySelector('[data-action="lobby-confirm-rules"]');
  if(c&&!/Confirmed/i.test(c.textContent||'')) c.click();
  await new Promise(r=>setTimeout(r,300));
  const btn=document.querySelector('[data-action="lobby-host-deck"]');
  if(!btn) return {pin,err:'no seat btn'};
  btn.click();
  await new Promise(r=>setTimeout(r,1500));
  const sel=document.querySelector('[name=deckId]');
  const opts=sel?[...sel.options].map(o=>({v:o.value,t:(o.textContent||'').trim()})): [];
  return {pin, live:opts.filter(o=>String(o.v).startsWith('deck:live:')), sample:opts.slice(0,10)};
})()`);
console.log("LIB", JSON.stringify(lib,null,2));
ws.close();