import http from "http";
import path from "path";
import { createRequire } from "module";
const PKG = "C:/Users/robmi/OneDrive/Documents/My Games/MtG/work/commander-phase-c/_e2e-confidence";
const Ws = createRequire(PKG + "/scripts/raw-matrix-a.mjs")(path.join(PKG, "lib/ws"));
function httpJson(url){return new Promise((r,j)=>http.get(url,res=>{const c=[];res.on("data",d=>c.push(d));res.on("end",()=>r(JSON.parse(Buffer.concat(c).toString())));}).on("error",j));}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function attach(){const list=await httpJson("http://127.0.0.1:9222/json/list");const page=list.find(t=>t.type==="page"&&/8768/.test(t.url));const ws=new Ws(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once("open",r);ws.once("error",j);});let id=0;const pending=new Map();ws.on("message",raw=>{const m=JSON.parse(String(raw));if(m.id&&pending.has(m.id)){const{resolve,reject}=pending.get(m.id);pending.delete(m.id);if(m.error)reject(new Error(m.error.message));else resolve(m.result);}});const send=(m,p={})=>new Promise((resolve,reject)=>{const mid=++id;pending.set(mid,{resolve,reject});ws.send(JSON.stringify({id:mid,method:m,params:p}));});const evaluate=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};await send("Runtime.enable");await send("Page.enable");return {ws,send,evaluate};}
let {ws,send,evaluate}=await attach();
await evaluate(`(() => { try { caches && caches.keys && caches.keys().then(ks => ks.forEach(k => caches.delete(k))); } catch {} return true; })()`);
await send("Page.reload", { ignoreCache: true });
await sleep(2000);
await send("Page.navigate", { url: "http://127.0.0.1:8768/app/index.html?cb=" + Date.now() + "#play?seat=uat9" });
await sleep(5000);
try { ws.close(); } catch {}
({ws,send,evaluate}=await attach());
const play = await evaluate(`(() => ({
  hash: location.hash,
  pin: [...document.querySelectorAll('script[src]')].map(s=>s.src).find(s=>/game\\.js/.test(s||'')),
  hasPlayView: !!(window.C && C.views && typeof C.views.play === 'function'),
  title: (document.querySelector('#cm-main h1, #cm-main h2, .cm-page-title') || {}).textContent,
  text: (document.querySelector('#cm-main,main')||document.body).innerText.slice(0,350),
  isDecks: /Build it\\. Make it yours/i.test(document.body.innerText),
  isGuestLobby: /Your seat|Guest invite|seat lobby/i.test(document.body.innerText),
}))()`);
console.log(JSON.stringify(play,null,2));
ws.close();