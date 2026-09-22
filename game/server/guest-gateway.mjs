import {createServer} from 'node:http';

const securityHeaders={
  'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'self'; img-src 'self' https://cards.scryfall.io data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff'
};
const routes=new Map([
  ['POST /table/join',['join',65536,false]],
  ['GET /table',['table',0,true]],
  ['POST /table/deck',['deck',1_500_000,true]],
  ['POST /table/ready',['ready',8192,true]],
  ['POST /table/heartbeat',['heartbeat',1024,true]],
  ['POST /table/exit',['exit',8192,true]],
  ['POST /table/rematch',['rematch',8192,true]],
  ['GET /match/view',['view',0,true]],
  ['GET /match/report',['report',0,true]],
  ['POST /match/action',['action',65536,true]],
  ['POST /match/feedback',['feedback',32768,true]]
]);
const publicFiles=new Map([
  ['/',['text/html; charset=utf-8','guest.html']],
  ['/guest.mjs',['text/javascript; charset=utf-8','guest.mjs']],
  ['/guest.css',['text/css; charset=utf-8','guest.css']],
  ['/connection.mjs',['text/javascript; charset=utf-8','connection.mjs']],
  ['/unresolved.mjs',['text/javascript; charset=utf-8','unresolved.mjs']],
  ['/play',['text/html; charset=utf-8','review.html']],
  ['/guest-play-boot.js',['text/javascript; charset=utf-8','guest-play-boot.js']],
  ['/play-entry.mjs',['text/javascript; charset=utf-8','play-entry.mjs']],
  ['/guest-live.mjs',['text/javascript; charset=utf-8','guest-live.mjs']],
  ['/live-poll.mjs',['text/javascript; charset=utf-8','live-poll.mjs']],
  ['/review.mjs',['text/javascript; charset=utf-8','review.mjs']],
  ['/review.css',['text/css; charset=utf-8','review.css']],
  ['/app/crankmagic-design.css',['text/css; charset=utf-8','crankmagic-design.css']],
  ['/setup.mjs',['text/javascript; charset=utf-8','setup.mjs']],
  ['/setup.css',['text/css; charset=utf-8','setup.css']],
  ['/online.css',['text/css; charset=utf-8','online.css']],
  ['/mats.css',['text/css; charset=utf-8','mats.css']],
  ['/playmats.mjs',['text/javascript; charset=utf-8','playmats.mjs']],
  ['/mana-status.mjs',['text/javascript; charset=utf-8','mana-status.mjs']],
  ['/play-guidance.mjs',['text/javascript; charset=utf-8','play-guidance.mjs']],
  ['/action-policy.mjs',['text/javascript; charset=utf-8','action-policy.mjs']],
  ['/table-notices.mjs',['text/javascript; charset=utf-8','table-notices.mjs']],
  ['/card-onboarding.mjs',['text/javascript; charset=utf-8','card-onboarding.mjs']],
  ['/play-audio-rules.mjs',['text/javascript; charset=utf-8','play-audio-rules.mjs']],
  ['/card-layout.mjs',['text/javascript; charset=utf-8','card-layout.mjs']],
  ['/handoff.mjs',['text/javascript; charset=utf-8','handoff.mjs']],
  ['/crankmagic-logo.webp',['image/webp','crankmagic-logo.webp']],
  ['/rob-playmat.png',['image/png','rob-playmat.png']],
  ['/app/card-classify.js',['text/javascript; charset=utf-8','card-classify.js']],
  ['/app/crankmagic-facets.js',['text/javascript; charset=utf-8','crankmagic-facets.js']],
  ['/app/crankmagic-qr.js',['text/javascript; charset=utf-8','crankmagic-qr.js']],
  ['/app/data/cards.json',['application/json; charset=utf-8','cards.json']],
  ['/app/data/graph.json',['application/json; charset=utf-8','graph.json']],
  ...['moonlit-tree','golden-lotus','sunlit-familiar','shadow-forest','mountain-horizon','spirit-warrior','violet-bloom'].map(name=>[`/playmats/${name}.png`,['image/png',`playmat:${name}`]])
]);

/* The play-audio pack. Registered from the pack's own index rather than a second hand-written
   list: a sound the gateway does not serve is silence for every remote player, and a list that
   has to be kept in step with the host's is a list that will not be. */
export function registerPlayAudio(names){
  for(const name of names){
    const type=name.endsWith('.json')?'application/json; charset=utf-8':'audio/mpeg';
    publicFiles.set('/audio/'+name,[type,'audio/'+name]);
  }
}
function bearer(req){const value=req.headers.authorization||'';return value.startsWith('Bearer ')?value.slice(7):'';}
async function body(req,limit){
  const declared=Number(req.headers['content-length']||0);if(declared>limit)throw Object.assign(Error('Request is too large'),{status:413});
  let size=0,text='';for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error('Request is too large'),{status:413});text+=chunk;}
  try{return text?JSON.parse(text):{};}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
}

/** Public game gateway. Its service receives server-resolved membership, never client seat IDs. */
export function createGuestGateway({host='127.0.0.1',port=0,publicOrigin,webOrigin,service,readPublicFile}){
  if(!service||typeof readPublicFile!=='function')throw Error('Guest gateway service and public reader required');
  /* The one web lobby this gateway will answer, if any. Validated the same way publicOrigin is:
     scheme and host only, so a path or a query cannot smuggle anything past the comparison. */
  if(webOrigin){
    const parsed=new URL(webOrigin);
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('Web lobby origin must contain only scheme and host');
    webOrigin=parsed.origin;
  }
  let authority;
  const limits=new Map();
  function allow(key,max,windowMs=60000){const now=Date.now(),old=limits.get(key);if(!old||now-old.started>=windowMs){limits.set(key,{started:now,count:1});return true;}if(old.count>=max)return false;old.count++;return true;}
  const server=createServer(async(req,res)=>{
    /* A named web lobby is told, per response, that it may read what it asked for. Any other
       origin gets no such header and the browser keeps the body from it. */
    const from=req.headers.origin;
    const shared=!!webOrigin&&from===webOrigin;
    const cors=shared?{'Access-Control-Allow-Origin':webOrigin,'Vary':'Origin'}:{};
    const reply=(status,value,type='application/json; charset=utf-8')=>{res.writeHead(status,{...securityHeaders,...cors,'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(value):value);};
    if(req.method==='OPTIONS'){
      if(!shared)return reply(404,{error:'Not found'});
      res.writeHead(204,{...securityHeaders,...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});
      return res.end();
    }
    if(req.headers.host!==authority)return reply(403,{error:'Wrong guest gateway host'});
    const url=new URL(req.url,'http://gateway.invalid'),key=`${req.method} ${url.pathname}`,route=routes.get(key);
    /* A trycloudflare address is new every session, so a web lobby holding one has to be able
       to ask whether it still answers. Public on purpose, and it discloses nothing. */
    if(req.method==='GET'&&url.pathname==='/health')return reply(200,{product:'CrankMagic Online',protocol:1,gateway:true});
    if(!route){
      const file=publicFiles.get(url.pathname);if(req.method!=='GET'||!file)return reply(404,{error:'Not found'});
      try{return reply(200,await readPublicFile(file[1]),file[0]);}catch{return reply(404,{error:'Not found'});}
    }
    if(req.method==='POST'&&from!==publicOrigin&&!shared)return reply(403,{error:'Wrong request origin'});
    try{
      const [method,limit,secured]=route,member=secured?await service.authenticate(bearer(req)):null;
      const rateKey=secured?`${member.tableId}:${member.seatId}:${member.generation}:${method}`:`join:${req.socket.remoteAddress}`;
      if(!allow(rateKey,method==='action'?90:method==='view'?180:method==='join'?20:120))throw Object.assign(Error('Too many requests. Wait a moment and try again.'),{status:429});
      const payload=req.method==='POST'?await body(req,limit):{};
      const value=await service[method](secured?member:payload,secured?payload:{request:req});
      return reply(method==='join'?201:200,value);
    // An unresolved-card refusal carries its list to the guest, who is the one who has to swap.
    }catch(error){return reply(Number.isSafeInteger(error.status)?error.status:400,{error:error.publicMessage||error.message||'Request failed',...(Array.isArray(error.unresolved)?{unresolved:error.unresolved}:{})});}
  });
  return {
    async listen(){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});const address=server.address();publicOrigin??=`http://${host}:${address.port}`;const parsed=new URL(publicOrigin);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('Guest public origin must contain only scheme and host');authority=parsed.host;return {host,port:address.port,origin:publicOrigin};},
    async close(){if(!server.listening)return;await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  };
}

export const GUEST_ROUTE_KEYS=Object.freeze([...routes.keys()]);
