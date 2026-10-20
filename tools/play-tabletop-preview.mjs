/* Local, isolated recorded-view preview. Never shipped; no cloud or library writes. */
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Playwright is a development-only dependency already used by the browser suites.
const {wsServer} = require(path.join(path.dirname(require.resolve("playwright-core/package.json")), "lib/utilsBundle.js"));
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8"));
let index = Number(process.env.PREVIEW_FRAME || 13), revision = 10000;
const sockets = new Set();
const current = () => {
  const v=structuredClone(sample.views[index]);v.revision=revision;
  // Explicit synthetic crowded-hand fixture for the browser suite; never used by the default preview.
  if(process.env.PREVIEW_HAND_SIZE){const hand=v.state.players[v.seat].zones.Hand,target=Number(process.env.PREVIEW_HAND_SIZE);while(hand.cards.length<target)hand.cards.push({...hand.cards[0],cardId:90000+hand.cards.length});hand.count=hand.cards.length;}
  // Explicit synthetic long-decision fixture for the browser suite: a search across most of a library, as Diabolic Tutor
  // makes in Rob's D5 (Teysa Karlov), its options that deck's own card names.
  if(process.env.PREVIEW_OPTIONS&&v.decision?.options?.length){
    const names=JSON.parse(readFileSync(path.join(ROOT,"tests/fixtures/shared-staging-decks.json"),"utf8")).decks.find(d=>d.id==="shared:D5").cards;
    v.decision.options=Array.from({length:Number(process.env.PREVIEW_OPTIONS)},(_,i)=>({index:i,label:names[i%names.length],cardId:91000+i}));
  }
  return v;
};
// Rob's art mats by seat; PREVIEW_MATS (comma-separated, by seat) seats others, such as the drawn ones, for the browser suite.
const mats = (process.env.PREVIEW_MATS || "falls-tree,cloud-wolf,sand-lion,ember-serpent").split(",");
const table = () => ({tableId: "tablepreview01", phase: "playing", matchId: current().matchId, away: [], seats: current().state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: "human", mat: mats[p.playerId], you: p.playerId === current().seat}))});
const boot = `localStorage.setItem('cm-board-view','full');localStorage.setItem('crankmagic-audio-muted','true');
(globalThis.CrankFeatures ||= []).push(C => {globalThis.__preview = C;const bar=document.createElement('div');bar.className='cm-preview-controls';bar.style.cssText='position:fixed;bottom:4px;right:8px;z-index:100;background:#102425ed;color:#e1f4e6;padding:5px 10px;border:1px solid #72a087;border-radius:8px;font:11px system-ui;display:flex;gap:10px;align-items:center';bar.innerHTML='<span>${process.env.PREVIEW_HAND_SIZE ? "Synthetic crowded hand" : "Recorded game"} · isolated preview</span><button data-record-step="-1">Previous state</button><button data-record-step="1">Next state</button>';document.body.append(bar);bar.addEventListener('click',e=>{const b=e.target.closest('[data-record-step]');if(b)fetch('/preview/frame',{method:'POST',body:b.dataset.recordStep});});});`;
const mime = {".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".png":"image/png", ".svg":"image/svg+xml", ".woff2":"font/woff2", ".mp3":"audio/mpeg"};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (value, status = 200) => {res.writeHead(status, {"content-type":"application/json", "cache-control":"no-store"});res.end(JSON.stringify(value));};
  if (url.pathname === "/preview/frame" && req.method === "POST") {
    let body = ""; for await (const c of req) body += c;
    index = Math.max(0, Math.min(sample.views.length - 1, index + (Number(body) < 0 ? -1 : 1))); revision++;
    for (const ws of sockets) if (ws.readyState === 1) ws.send(JSON.stringify({type:"view",view:current()}));
    return json({index});
  }
  if (url.pathname === "/preview-bootstrap.js") {res.writeHead(200,{"content-type":"text/javascript"});return res.end(boot);}
  if (url.pathname === "/api/me") return json({email:"preview@example.com"});
  if (url.pathname.startsWith("/api/library")) return json({head:null});
  if (url.pathname.startsWith("/api/tables")) return json({table:table(),now:Date.now()});
  if (req.method !== "GET") return json({error:"This preview never writes to the cloud."}, 405);
  try {
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    if (rel.split("/").some(p => p.startsWith(".")) || /^(?:docs|tools|tests|game|cloud|work)\//.test(rel)) throw Error("not public");
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) throw Error("not public");
    let body = readFileSync(file);
    if (rel === "index.html") body = body.toString().replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"><script src="/preview-bootstrap.js"></script></head>');
    res.writeHead(200,{"content-type":mime[path.extname(file)] || "application/octet-stream", "cache-control":"no-store"}); res.end(body);
  } catch {res.writeHead(404).end("Not found");}
});
const wss = new wsServer({server});
wss.on("connection", ws => {sockets.add(ws);ws.send(JSON.stringify({type:"view",view:current()}));ws.on("close",()=>sockets.delete(ws));ws.on("message",()=>ws.send(JSON.stringify({type:"refused",error:"Recorded preview: use Previous state or Next state. Live-game controls are tested separately.",view:current()})));});
const port = Number(process.env.PREVIEW_PORT || 4387);
server.listen(port,"127.0.0.1",()=>console.log(`Tabletop preview: http://localhost:${server.address().port}/index.html#table?id=tablepreview01`));
