import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setupCatalog,prepareSetup,importWorkshopDeck} from './setup-catalog.mjs';
import {launchLocalGame,liveStatus,browserBridge,resumeLocalGame} from './local-game-launcher.mjs';
if(process.env.COMMANDER_RESUME)await resumeLocalGame(process.env.COMMANDER_RESUME);
const port=Number(process.env.COMMANDER_PORT||8768);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
const authority='127.0.0.1:'+port,origin='http://'+authority;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const files=new Map([['/',['game/ui/review.html','text/html']],['/review.css',['game/ui/review.css','text/css']],['/review.mjs',['game/ui/review.mjs','text/javascript']],['/match.json',['game/.local/review/match.json','application/json']]]);
files.set('/playmats.mjs',['game/ui/playmats.mjs','text/javascript']);
files.set('/mana-status.mjs',['game/ui/mana-status.mjs','text/javascript']);
for(const name of ['moonlit-tree','golden-lotus','sunlit-familiar','shadow-forest','mountain-horizon','spirit-warrior','violet-bloom'])files.set('/playmats/'+name+'.png',['game/ui/assets/playmats/'+name+'.png','image/png']);
files.set('/mats.css',['game/ui/mats.css','text/css']);
files.set('/rob-playmat.png',['game/ui/assets/rob-playmat.png','image/png']);
files.set('/setup.mjs',['game/ui/setup.mjs','text/javascript']);
files.set('/setup.css',['game/ui/setup.css','text/css']);
files.set('/online.css',['game/ui/online.css','text/css']);
files.set('/handoff.mjs',['game/ui/handoff.mjs','text/javascript']);
files.set('/crankmagic-logo.webp',['assets/crankmagic/crankmagic-logo-wand-v3-256.webp','image/webp']);
const publicPaths=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'ls-files'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(p=>/^(?:[^/]+\.(?:js|css|html)|(?:assets|data)\/.*\.(?:json|png|webp|jpg|svg|woff2|txt))$/.test(p));
publicPaths.push('crankmagic-online.js','crankmagic-online.css');
const mime={js:'text/javascript',css:'text/css',html:'text/html',json:'application/json',png:'image/png',webp:'image/webp',jpg:'image/jpeg',svg:'image/svg+xml',woff2:'font/woff2',txt:'text/plain'};
for(const path of publicPaths)files.set('/app/'+path,[path,mime[path.split('.').at(-1)]]);
files.set('/app/',['index.html','text/html']);
const token=randomUUID(),prepared=new Map();let preparing=false,launching=false;
createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(pathname.startsWith('/api/')){
    if(req.headers.host!==authority)return reply(403,{error:'Use the local 127.0.0.1 address'});
    if(req.method==='GET'&&pathname==='/api/setup')return reply(200,{...setupCatalog(),token});
    if(req.method==='GET'&&pathname==='/api/live')return reply(200,liveStatus());
    if(req.method==='GET'&&pathname==='/api/game-view'){try{return reply(200,await browserBridge('view'));}catch(e){return reply(409,{error:e.message});}}
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-commander-token']!==token)return reply(403,{error:'Invalid local session'});
    try{
      let text='';for await(const chunk of req){text+=chunk;if(text.length>64000)throw Error('Setup request too large');}const body=JSON.parse(text);
      if(pathname==='/api/game-action')return reply(200,await browserBridge('action',body));
      if(pathname==='/api/import-deck')return reply(200,await importWorkshopDeck(body));
      if(pathname==='/api/prepare'){
        if(preparing)throw Error('A deck preparation is already running');preparing=true;
        try{const pod=await prepareSetup(body),id=randomUUID();prepared.clear();prepared.set(id,pod);return reply(200,{id,pod});}finally{preparing=false;}
      }
      if(pathname==='/api/start'){
        if(launching)throw Error('Launch already in progress');const pod=prepared.get(body.id);if(!pod)throw Error('Prepare and review this pod before starting');launching=true;
        try{const status=await launchLocalGame(pod);prepared.delete(body.id);return reply(200,status);}finally{launching=false;}
      }
      return reply(404,{error:'Unknown operation'});
    }catch(e){return reply(400,{error:e.message});}
  }
  const entry=files.get(pathname);
  if(req.method!=='GET'||!entry){res.writeHead(404);res.end();return;}
  try {const body=await readFile(resolve(root,entry[0]));res.writeHead(200,{'Content-Type':entry[1]+'; charset=utf-8','Cache-Control':'no-store',
    ...(pathname.startsWith('/app/')?{}:{'Content-Security-Policy':"default-src 'self'; img-src 'self' https://cards.scryfall.io; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'self'"})});res.end(body);}
  catch{res.writeHead(404);res.end('Build the local replay preview first.');}
}).listen(port,'127.0.0.1',()=>console.log('Commander replay preview: '+origin));
