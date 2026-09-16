import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setupCatalog,prepareSetup,prepareLobby,importWorkshopDeck} from './setup-catalog.mjs';
import {launchLocalGame,liveStatus,livePod,browserBridge,browserBridgeForSeat,resumeLocalGame,closeLocalGame} from './local-game-launcher.mjs';
import {createGuestGateway} from '../server/guest-gateway.mjs';
import {createLocalTableRuntime,restoreLocalTableRuntime} from '../server/local-table-runtime.mjs';
import {createApiPilotRunner} from './ai-pilot.mjs';
import {createOpenAIChoiceProvider,createAnthropicChoiceProvider} from './api-choice-provider.mjs';
import {loadMatchReport,saveMatchFeedback} from './match-report.mjs';
import {DEFAULT_OPENAI_MODEL,OPENAI_MODELS,loadOpenAiCredential} from './windows-credential.mjs';
if(process.env.COMMANDER_RESUME)try{await resumeLocalGame(process.env.COMMANDER_RESUME);}catch{console.warn('Previous Forge match is unavailable. Game logs are retained; open Game setup to start a new match.');}
const port=Number(process.env.COMMANDER_PORT||8768);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
const authority='127.0.0.1:'+port,origin='http://'+authority;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const guestPort=Number(process.env.COMMANDER_GUEST_PORT||8769),guestHost=process.env.COMMANDER_GUEST_BIND||'127.0.0.1';
if(!Number.isInteger(guestPort)||guestPort<1024||guestPort>65535)throw Error('Invalid guest port');
const files=new Map([['/',['game/ui/review.html','text/html']],['/review.css',['game/ui/review.css','text/css']],['/review.mjs',['game/ui/review.mjs','text/javascript']],['/match.json',['game/.local/review/match.json','application/json']]]);
files.set('/playmats.mjs',['game/ui/playmats.mjs','text/javascript']);
files.set('/live-poll.mjs',['game/ui/live-poll.mjs','text/javascript']);
files.set('/mana-status.mjs',['game/ui/mana-status.mjs','text/javascript']);
files.set('/play-guidance.mjs',['game/ui/play-guidance.mjs','text/javascript']);
files.set('/action-policy.mjs',['game/ui/action-policy.mjs','text/javascript']);
files.set('/card-layout.mjs',['game/ui/card-layout.mjs','text/javascript']);
for(const name of ['moonlit-tree','golden-lotus','sunlit-familiar','shadow-forest','mountain-horizon','spirit-warrior','violet-bloom'])files.set('/playmats/'+name+'.png',['game/ui/assets/playmats/'+name+'.png','image/png']);
files.set('/mats.css',['game/ui/mats.css','text/css']);
files.set('/rob-playmat.png',['game/ui/assets/rob-playmat.png','image/png']);
files.set('/setup.mjs',['game/ui/setup.mjs','text/javascript']);
files.set('/setup.css',['game/ui/setup.css','text/css']);
files.set('/online.css',['game/ui/online.css','text/css']);
files.set('/handoff.mjs',['game/ui/handoff.mjs','text/javascript']);
files.set('/crankmagic-logo.webp',['assets/crankmagic/crankmagic-logo-wand-v3-256.webp','image/webp']);
files.set('/crankmagic-online-overview.html',['game/docs/crankmagic-online-overview.html','text/html']);
files.set('/ui/assets/playmats/mountain-horizon.png',['game/ui/assets/playmats/mountain-horizon.png','image/png']);
for(const name of ['commander-chulane','commander-atraxa','commander-krenko'])files.set('/assets/crankmagic/'+name+'.webp',['assets/crankmagic/'+name+'.webp','image/webp']);
const publicPaths=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'ls-files'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(p=>/^(?:[^/]+\.(?:js|css|html)|(?:assets|data)\/.*\.(?:json|png|webp|jpg|svg|woff2|txt))$/.test(p));
publicPaths.push('crankmagic-online.js','crankmagic-online.css');
const mime={js:'text/javascript',css:'text/css',html:'text/html',json:'application/json',png:'image/png',webp:'image/webp',jpg:'image/jpeg',svg:'image/svg+xml',woff2:'font/woff2',txt:'text/plain'};
for(const path of publicPaths)files.set('/app/'+path,[path,mime[path.split('.').at(-1)]]);
files.set('/app/',['index.html','text/html']);
const guestAssets=new Map([
  ...['guest.html','guest.mjs','guest.css','review.html','review.mjs','review.css','setup.mjs','setup.css','online.css','mats.css','playmats.mjs','mana-status.mjs','play-guidance.mjs','live-poll.mjs','action-policy.mjs','card-layout.mjs','handoff.mjs'].map(name=>[name,`game/ui/${name}`]),
  ['crankmagic-logo.webp','assets/crankmagic/crankmagic-logo-wand-v3-256.webp'],['rob-playmat.png','game/ui/assets/rob-playmat.png'],
  ['card-classify.js','card-classify.js'],['crankmagic-facets.js','crankmagic-facets.js'],['crankmagic-qr.js','crankmagic-qr.js'],['cards.json','data/cards.json'],['graph.json','data/graph.json'],
  ...['moonlit-tree','golden-lotus','sunlit-familiar','shadow-forest','mountain-horizon','spirit-warrior','violet-bloom'].map(name=>[`playmat:${name}`,`game/ui/assets/playmats/${name}.png`])
]);
const storedOpenAiSession=loadOpenAiCredential();
let aiSession=storedOpenAiSession,soloPilotRunner=null,soloPilotMonitor=null;
function apiSeats(value){return (value?.seats||[]).filter(s=>s.kind==='ai'&&(s.pilot?.kind==='api'||s.aiProvider)).map(s=>({seatId:s.seatId,provider:s.pilot?.provider||s.aiProvider,model:s.pilot?.model||s.aiModel}));}
function requireAiSession(value){const seats=apiSeats(value);if(!seats.length)return seats;if(!aiSession)throw Error('Enter the AI API key before using API-controlled opponents');for(const seat of seats)if(seat.provider!==aiSession.provider||seat.model!==aiSession.model)throw Error('The prepared AI provider or model no longer matches the configured API session');return seats;}
function createPilots(pod){
  const selected=requireAiSession(pod),seats=pod.seats.filter(s=>selected.some(x=>x.seatId===s.seatId));if(!seats.length)return null;
  const providers=new Map();for(const seat of seats){const factory=aiSession.provider==='anthropic'?createAnthropicChoiceProvider:createOpenAIChoiceProvider;providers.set(seat.seatId,factory({apiKey:aiSession.key,model:aiSession.model,maxCalls:Math.max(1,seat.pilot.difficultyRequested*150)}));}
  const directory=liveStatus().directory,eventFile=directory&&resolve(directory,'ai-pilot.ndjson');return createApiPilotRunner({seats,bridge:browserBridgeForSeat,providerForSeat:seat=>providers.get(seat.seatId),onEvent:event=>{if(eventFile)appendFileSync(eventFile,JSON.stringify({schema:'CrankMagicAIPilotEvent@1',at:new Date().toISOString(),matchId:pod.matchId,...event})+'\n');}});
}
function stopSoloPilots(){soloPilotRunner?.stop();soloPilotRunner=null;if(soloPilotMonitor)clearInterval(soloPilotMonitor);soloPilotMonitor=null;}
function startSoloPilots(pod){stopSoloPilots();soloPilotRunner=createPilots(pod);if(!soloPilotRunner)return false;soloPilotMonitor=setInterval(()=>{const state=liveStatus();if(state.matchId!==pod.matchId||['error','closed','finished','incomplete'].includes(state.status))stopSoloPilots();},1000);soloPilotMonitor.unref?.();return true;}
async function armSoloPilots(pod){if(!apiSeats(pod).length)return false;const deadline=Date.now()+240000;while(Date.now()<deadline){const state=liveStatus();if(state.matchId===pod.matchId&&['ready','playing'].includes(state.status))return startSoloPilots(pod);if(['error','closed','incomplete'].includes(state.status))return false;await new Promise(resolve=>setTimeout(resolve,300));}return false;}
const runtimeOptions={directory:resolve(root,'game/.local/tables'),bridge:browserBridgeForSeat,launch:launchLocalGame,status:liveStatus,createPilots,report:async(seatId,matchId)=>{const engine=liveStatus();if(engine.matchId!==matchId||!engine.directory)throw Error('The completed engine record does not match this table');try{return loadMatchReport(engine.directory,seatId);}catch(error){const view=await browserBridgeForSeat(seatId,'view');return loadMatchReport(engine.directory,seatId,view.state);}}};
let tableRuntime=null,hostInvitations=[];
try{tableRuntime=restoreLocalTableRuntime(runtimeOptions);if(tableRuntime){await tableRuntime.recover();const table=tableRuntime.view(),engine=liveStatus();if(table.phase==='playing'&&(!['starting','ready','playing'].includes(engine.status)||table.matchId!==engine.matchId)){tableRuntime.abandon();tableRuntime=null;console.warn('An interrupted multiplayer table was closed. Its game logs remain available.');}}}
catch(error){tableRuntime=null;console.warn('Multiplayer table recovery needs attention: '+error.message);}
const guestService={};for(const method of ['authenticate','join','table','deck','ready','heartbeat','exit','rematch','view','action','report','feedback'])guestService[method]=(...args)=>{if(!tableRuntime)throw Object.assign(Error('This table is not accepting players'),{status:409});return tableRuntime.guest[method](...args);};
const guestGateway=createGuestGateway({host:guestHost,port:guestPort,publicOrigin:process.env.COMMANDER_GUEST_PUBLIC_ORIGIN||undefined,service:guestService,readPublicFile:async name=>{const path=guestAssets.get(name);if(!path)throw Error('Unknown public file');return readFile(resolve(root,path));}});
const guestInfo=await guestGateway.listen();
const remoteGuestsAvailable=/^https:\/\//.test(guestInfo.origin);
const token=randomUUID(),prepared=new Map();let preparing=false,launching=false;
createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(pathname.startsWith('/api/')){
    if(req.headers.host!==authority)return reply(403,{error:'Use the local 127.0.0.1 address'});
    // Public launch checks reveal no session token, deck, or engine position.
    if(pathname==='/api/health'){
      if(['https://minorrob.github.io','http://localhost:'+port].includes(req.headers.origin)){
        res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
        res.setHeader('Vary','Origin');
        res.setHeader('Access-Control-Allow-Methods','GET');
        res.setHeader('Access-Control-Allow-Private-Network','true');
      }
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(req.method==='GET')return reply(200,{product:'CrankMagic Online',protocol:1,guestGateway:true});
      return reply(405,{error:'Read-only health check'});
    }
    if(req.method==='GET'&&pathname==='/api/setup')return reply(200,{...setupCatalog(),token,guestOrigin:guestInfo.origin,aiCredential:{openaiAvailable:!!storedOpenAiSession,source:storedOpenAiSession?.source||null,defaultModel:DEFAULT_OPENAI_MODEL}});
    if(req.method==='GET'&&pathname==='/api/live')return reply(200,liveStatus());
    if(req.method==='GET'&&pathname==='/api/game-view'){try{await tableRuntime?.poll();return reply(200,await browserBridge('view'));}catch(e){return reply(409,{error:e.message});}}
    if(req.method==='GET'&&pathname==='/api/match-report'){try{const engine=liveStatus();if(!engine.directory)throw Error('No completed match report is available');return reply(200,tableRuntime?await tableRuntime.report():loadMatchReport(engine.directory,0));}catch(e){return reply(409,{error:e.message});}}
    if(req.method==='GET'&&pathname==='/api/table'){
      if(req.headers['x-commander-token']!==token)return reply(403,{error:'Invalid local session'});
      try{if(!tableRuntime)throw Error('No multiplayer lobby is open');await tableRuntime.poll();return reply(200,{table:tableRuntime.view(),invitations:hostInvitations,guestOrigin:guestInfo.origin});}catch(e){return reply(409,{error:e.message});}
    }
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-commander-token']!==token)return reply(403,{error:'Invalid local session'});
    try{
      let text='';for await(const chunk of req){text+=chunk;if(text.length>64000)throw Error('Setup request too large');}const body=JSON.parse(text);text='';
      if(pathname==='/api/game-action')return reply(200,await browserBridge('action',body));
      if(pathname==='/api/ai-pilots/prompt'){
        if(!soloPilotRunner)throw Error('No API-controlled AI player is running in this local game');
        const result=soloPilotRunner.nudge(Number.isInteger(body.seatId)?body.seatId:null);
        if(!result.prompted)throw Error('That AI seat is not running');
        return reply(200,{ok:true,...result});
      }
      if(pathname==='/api/match-feedback'){const engine=liveStatus();if(!engine.directory)throw Error('No completed match report is available');return reply(200,tableRuntime?await tableRuntime.feedback(body):saveMatchFeedback(engine.directory,loadMatchReport(engine.directory,0),body));}
      if(pathname==='/api/ai-session'){
        if(!['openai','anthropic'].includes(body.provider))throw Error('Choose a supported provider');
        const allowed=body.provider==='openai'?new Set(OPENAI_MODELS):new Set(['claude-haiku-4-5-20251001']);if(!allowed.has(body.model))throw Error('Choose a supported AI model');
        const stored=body.provider==='openai'&&body.useStoredCredential===true?storedOpenAiSession:null;
        if(!stored&&(typeof body.key!=='string'||body.key.length<20||body.key.length>1000))throw Error(body.provider==='openai'?'The Windows OpenAI credential is unavailable; restart CrankMagic Online or enter a key':'Enter the AI API key');
        aiSession={provider:body.provider,model:body.model,key:stored?.key||body.key,source:stored?.source||'memory-entry'};body.key='';let pilotRearmed=false;const active=liveStatus(),table=tableRuntime?.view();
        if(table?.phase==='playing'&&table.matchId===active.matchId&&['ready','playing'].includes(active.status))pilotRearmed=!!tableRuntime.armPilots().length;
        else if(['ready','playing'].includes(active.status))pilotRearmed=startSoloPilots(livePod());
        return reply(200,{configured:true,provider:aiSession.provider,model:aiSession.model,source:aiSession.source,pilotRearmed});
      }
      if(pathname==='/api/close-game'){stopSoloPilots();const value=await closeLocalGame();if(tableRuntime){tableRuntime.abandon();tableRuntime=null;hostInvitations=[];}return reply(200,value);}
      if(pathname==='/api/import-deck')return reply(200,await importWorkshopDeck(body));
      if(pathname==='/api/prepare'){
        requireAiSession(body);if(preparing)throw Error('A deck preparation is already running');preparing=true;
        try{const pod=body.humans>1?await prepareLobby(body):await prepareSetup(body),id=randomUUID();prepared.clear();prepared.set(id,pod);return reply(200,{id,pod});}finally{preparing=false;}
      }
      if(pathname==='/api/start'){
        if(launching)throw Error('Launch already in progress');const pod=prepared.get(body.id);if(!pod)throw Error('Prepare and review this pod before starting');requireAiSession(pod);launching=true;
        try{
          if(pod.schema==='CommanderLobbyPack@1'){
            if(pod.reservedHumanSeats.length&& !remoteGuestsAvailable)throw Error('Remote guests are unavailable. Restart CrankMagic Online with Remote Guests enabled before creating a human lobby.');
            if(tableRuntime&&!['selecting','rematch'].includes(tableRuntime.view().phase))throw Error('Finish the current multiplayer table before opening another');
            tableRuntime?.close();tableRuntime=createLocalTableRuntime({...runtimeOptions,lobby:pod});
            await tableRuntime.ready(true);hostInvitations=pod.reservedHumanSeats.map(({seatId})=>{const issued=tableRuntime.invite(seatId,14_400_000);return {seatId,expiresIn:issued.expiresIn,link:`${guestInfo.origin}/#table=${encodeURIComponent(issued.tableId)}&invite=${encodeURIComponent(issued.invite)}`};});
            prepared.delete(body.id);return reply(200,{lobby:true,table:tableRuntime.view(),invitations:hostInvitations,guestOrigin:guestInfo.origin});
          }
          await launchLocalGame(pod);prepared.delete(body.id);await armSoloPilots(livePod());return reply(200,liveStatus());
        }finally{launching=false;}
      }
      if(pathname==='/api/lobby-ready'){if(!tableRuntime)throw Error('No multiplayer lobby is open');await tableRuntime.ready(body.ready===true);return reply(200,{table:tableRuntime.view()});}
      if(pathname==='/api/lobby-deck'){if(!tableRuntime)throw Error('No multiplayer lobby is open');const value=await tableRuntime.deck(body);return reply(200,{table:value.table});}
      if(pathname==='/api/lobby-rematch'){if(!tableRuntime)throw Error('No multiplayer lobby is open');await tableRuntime.rematch(body.accept===true);return reply(200,{table:tableRuntime.view()});}
      if(pathname==='/api/lobby-invite'){
        if(!remoteGuestsAvailable)throw Error('Remote guests are unavailable. Restart CrankMagic Online with Remote Guests enabled before creating an invitation.');
        if(!tableRuntime)throw Error('No multiplayer lobby is open');const issued=tableRuntime.invite(body.seatId,14_400_000),value={seatId:issued.seatId,expiresIn:issued.expiresIn,link:`${guestInfo.origin}/#table=${encodeURIComponent(issued.tableId)}&invite=${encodeURIComponent(issued.invite)}`};hostInvitations=hostInvitations.filter(x=>x.seatId!==value.seatId);hostInvitations.push(value);return reply(200,value);
      }
      if(pathname==='/api/lobby-close'){if(!tableRuntime)throw Error('No multiplayer lobby is open');if(!['selecting','rematch'].includes(tableRuntime.view().phase))throw Error('Finish the active match before closing its table');tableRuntime.abandon();tableRuntime=null;hostInvitations=[];return reply(200,{closed:true});}
      return reply(404,{error:'Unknown operation'});
    }catch(e){return reply(400,{error:e.message});}
  }
  const entry=files.get(pathname);
  if(req.method!=='GET'||!entry){res.writeHead(404);res.end();return;}
  try {const body=await readFile(resolve(root,entry[0]));res.writeHead(200,{'Content-Type':entry[1]+'; charset=utf-8','Cache-Control':'no-store',
    ...(pathname.startsWith('/app/')?{}:{'Content-Security-Policy':pathname==='/crankmagic-online-overview.html'
      ?"default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-ancestors 'self'"
      :"default-src 'self'; img-src 'self' https://cards.scryfall.io; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'self'"})});res.end(body);}
  catch{res.writeHead(404);res.end('Build the local replay preview first.');}
}).listen(port,'127.0.0.1',()=>{console.log('Commander replay preview: '+origin);console.log('CrankMagic guest gateway: '+guestInfo.origin);});
