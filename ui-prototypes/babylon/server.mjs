import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const sample = JSON.parse(await readFile(path.join(ROOT, 'docs/reference/replit-sample-views.json'), 'utf8'));
const names=new Set(sample.views.flatMap(v=>v.state.players.flatMap(p=>Object.entries(p.zones).filter(([z])=>z!=='Library'&&(z!=='Hand'||p.playerId===v.seat)).flatMap(([,z])=>(z.cards||[]).filter(c=>!c.faceDown).map(c=>c.name)))));
const artCache=path.join(HERE,'node_modules','.card-art');
await mkdir(artCache,{recursive:true});
const pending=new Map();let queue=Promise.resolve();
async function cardArt(name){
  const file=path.join(artCache,createHash('sha256').update(name).digest('hex')+'.jpg');
  try{return await readFile(file);}catch{}
  if(!pending.has(name)){
    const task=queue.then(async()=>{
      // Serialize cache misses to respect the card image provider's rate limits.
      await new Promise(r=>setTimeout(r,125));
      const response=await fetch('https://api.scryfall.com/cards/named?exact='+encodeURIComponent(name)+'&format=image&version=normal',{headers:{'User-Agent':'CrankMagic-Tabletop-Prototype/1.0','Accept':'image/jpeg'},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Card art unavailable');
      const bytes=Buffer.from(await response.arrayBuffer());await writeFile(file,bytes);return bytes;
    });
    queue=task.catch(()=>{});pending.set(name,task);
  }
  return pending.get(name);
}
const files = new Map(['index.html','table.js','tables.js','table.css'].map(n=>['/'+n,path.join(HERE,n)]));
files.set('/',path.join(HERE,'index.html'));
files.set('/engine.js',path.join(HERE,'node_modules/babylonjs/babylon.js'));
for(const n of ['dwarven-king-1080.webm','dwarven-king-poster.jpg']) files.set('/assets/environments/'+n,path.join(ROOT,'assets/environments',n));
for(const n of ['falls-tree','cloud-wolf','sand-lion','ember-serpent']) files.set('/assets/playmats/'+n+'.webp',path.join(ROOT,'assets/playmats',n+'.webp'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webm':'video/webm','.jpg':'image/jpeg','.webp':'image/webp'};
export function previewServer() {
  return createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET') return res.writeHead(405).end('Read-only recorded preview');
    if(url.pathname.startsWith('/art/')){
      let name;try{name=decodeURIComponent(url.pathname.slice(5));}catch{return res.writeHead(400).end();}
      if(!names.has(name))return res.writeHead(404).end();
      try{const bytes=await cardArt(name);return res.writeHead(200,{'Content-Type':'image/jpeg'}).end(bytes);}catch{return res.writeHead(404).end();}
    }
    if(url.pathname==='/view') {
      const frame=Math.min(sample.views.length-1,Math.max(0,Number(url.searchParams.get('frame') ?? 13)|0));
      const view=structuredClone(sample.views[frame]);
      // Only the projected view crosses the boundary. Never fill hidden cards from another seat.
      for(const p of view.state.players) for(const [zone,data] of Object.entries(p.zones)) {
        if(zone==='Library'||(zone==='Hand'&&p.playerId!==view.seat)) data.cards=[];
      }
      return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({view,frame,total:sample.views.length}));
    }
    const file=files.get(url.pathname);
    if(!file) return res.writeHead(404).end('Not found');
    try {
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(body);
    } catch {res.writeHead(404).end('Missing preview asset. Run node ui-prototypes/babylon/setup.mjs first.');}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=previewServer();
  server.listen(Number(process.env.BABYLON_PORT||4391),process.env.BABYLON_HOST||'127.0.0.1',()=>console.log(`Babylon preview: http://127.0.0.1:${server.address().port}/`));
}
