import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createTable} from '../contracts/table-lifecycle.mjs';
import {canonical,sha256} from '../contracts/deck-snapshot.mjs';
import {prepareGuestDeck,setupCatalog} from '../tools/setup-catalog.mjs';
import {TableBroker} from './table-broker.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function saveRuntime(file,value){mkdirSync(dirname(file),{recursive:true});const temp=file+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2));renameSync(temp,file);}
export function createLocalTableRuntime({directory,lobby,tableId=randomUUID(),bridge,launch,status=()=>({status:'idle'}),clock=()=>Date.now(),resolveGuestDeck=prepareGuestDeck,createPilots,report,activePod:restoredPod=null}){
  if(lobby?.schema!=='CommanderLobbyPack@1')throw Error('Prepared lobby required');
  const settings={bracket:lobby.settings.bracket,maxCost:lobby.settings.maxCost,humans:lobby.settings.humans,ais:lobby.settings.ais};
  const initialDeckVersions={},preparedBySeat=new Map(lobby.seats.map(seat=>[seat.seatId,seat]));
  const seats=lobby.settings.seats.map(request=>{
    const kind=request.kind||(request.seatId<settings.humans?'human':'ai'),prepared=preparedBySeat.get(request.seatId),id=prepared?`prepared:${request.seatId}:${prepared.deck.gameplayHash}`:null;
    if(prepared)initialDeckVersions[id]={id,validated:true,commander:prepared.deck.commanders.map(c=>c.name).join(' + '),snapshot:prepared,deckHash:prepared.deck.gameplayHash,createdAt:lobby.capturedAt};
    return {seatId:request.seatId,kind,name:request.name,occupied:kind==='ai'||request.seatId===0,commander:prepared?.deck.commanders.map(c=>c.name).join(' + '),deckVersion:id};
  });
  const table=createTable({tableId,seats,settings});for(const seat of table.seats){const source=seats[seat.seatId];if(source.deckVersion)seat.deckVersion=source.deckVersion;if(source.commander)seat.commander=source.commander;if(seat.kind==='ai')seat.ready=true;}
  const catalog={decks:setupCatalog().decks.filter(d=>d.source==='preloaded'&&d.ok).map(({id,name,commander,cost,gameChangers})=>({id,name,commander,cost,gameChangers}))};
  const activeFile=resolve(directory,'active.json');let activePod=restoredPod;saveRuntime(activeFile,{schema:'CrankMagicLocalTableRuntime@1',tableId,lobby,activePod,closed:false});let timer,runtime,pilotRunner;
  const broker=new TableBroker({file:resolve(directory,table.tableId+'.json'),table,clock,catalog,initialDeckVersions,report,
    resolveDeck:(member,input)=>resolveGuestDeck(member,input,settings),bridge,
    launch:async({table,decks,launchId,matchId})=>{
      const finalSeats=table.seats.map(seat=>decks[seat.deckVersion]?.snapshot);if(finalSeats.some(s=>!s))throw Error('A validated seat deck is missing');
      const pod={...lobby,schema:'CommanderPodPack@1',matchId,seats:finalSeats,podHash:sha256(canonical({seed:lobby.seed,launchId,matchId,seats:finalSeats.map(s=>({seatId:s.seatId,deckHash:s.deck.gameplayHash,mechanicsHash:s.mechanics.hash,pilot:s.pilot}))}))};activePod=pod;saveRuntime(activeFile,{schema:'CrankMagicLocalTableRuntime@1',tableId,lobby,activePod,closed:false});
      let engine=status();if(engine.matchId!==matchId||!['starting','ready','playing'].includes(engine.status))await launch(pod);
      const deadline=Date.now()+240000;while(Date.now()<deadline){engine=status();if(engine.matchId===matchId&&['ready','playing'].includes(engine.status)){pilotRunner?.stop();pilotRunner=createPilots?.(pod)||null;return matchId;}if(['error','closed','incomplete'].includes(engine.status))throw Error(engine.error||`Forge stopped during launch (${engine.status})`);await delay(300);}throw Error('Forge did not become ready within four minutes');
    }});
  async function launchWhenDue(){
    let current=broker.hostView();
    if(current.phase==='countdown'&&clock()>=current.countdownAt){await broker.tick();current=broker.hostView();}
    if(current.phase==='starting')await broker.processOutbox();
    current=broker.hostView();
    if(current.phase==='playing'&&status().status==='finished'){pilotRunner?.stop();pilotRunner=null;await broker.complete(current.matchId);}
    return broker.hostView();
  }
  async function scheduleIfReady(){
    let current=broker.hostView();
    if(current.phase==='selecting'&&current.seats.every(s=>s.occupied&&s.connected&&s.ready&&s.deckVersion))current=await runtime.start();
    return current;
  }
  const guest={
    authenticate:capability=>broker.authenticate(capability),
    join:input=>broker.join(input),
    async table(member){await runtime.poll();return broker.table(member);},
    deck:(member,input)=>broker.deck(member,input),
    async ready(member,input){await broker.ready(member,input);await scheduleIfReady();return broker.table(member);},
    heartbeat:(member,input)=>broker.heartbeat(member,input),
    exit:(member,input)=>broker.exit(member,input),
    async rematch(member,input){const result=await broker.rematch(member,input);if(result.table.phase==='selecting'){for(const seat of result.table.seats.filter(s=>s.kind==='ai'))await broker.ready({seatId:seat.seatId},{ready:true});}await scheduleIfReady();return broker.table(member);},
    async view(member){await runtime.poll();return broker.view(member);},action:(member,input)=>broker.action(member,input),report:member=>broker.report(member),feedback:(member,input)=>broker.feedback(member,input)
  };
  runtime={
    broker,
    guest,
    invite(seatId,ttl){return broker.invite(seatId,ttl);},
    view(){return broker.hostView();},
    async deck(input){return broker.deck({seatId:0},input);},
    async ready(ready){await broker.hostReady(ready);return scheduleIfReady();},
    async rematch(accept){const result=await broker.rematch({seatId:0},{accept});if(result.table.phase==='selecting'){for(const seat of result.table.seats.filter(s=>s.kind==='ai'))await broker.ready({seatId:seat.seatId},{ready:true});}await scheduleIfReady();return broker.hostView();},
    report(){return broker.report({seatId:0});},feedback(input){return broker.feedback({seatId:0},input);},
    async start(){
      const table=await broker.beginCountdown(),delay=Math.max(0,table.countdownAt-clock());clearTimeout(timer);timer=setTimeout(async()=>{try{await launchWhenDue();}catch{/* Lobby polling reports a cancelled countdown or launch failure. */}},delay);return table;
    },
    async poll(){await broker.disconnectExpired();return launchWhenDue();},
    async recover(){const current=broker.hostView();if(current.phase==='countdown'){const delay=Math.max(0,current.countdownAt-clock());clearTimeout(timer);timer=setTimeout(async()=>{try{await launchWhenDue();}catch{}},delay);}if(current.phase==='starting')await launchWhenDue();return current;},
    pilotStatus(){return pilotRunner?.status()||[];},
    armPilots(){if(!activePod)throw Error('This table has no active match to pilot');const engine=status();if(engine.matchId!==activePod.matchId||!['ready','playing'].includes(engine.status))throw Error('The active Forge match is not ready');pilotRunner?.stop();pilotRunner=createPilots?.(activePod)||null;return runtime.pilotStatus();},
    abandon(){clearTimeout(timer);pilotRunner?.stop();saveRuntime(activeFile,{schema:'CrankMagicLocalTableRuntime@1',tableId,lobby,activePod,closed:true});},
    close(){clearTimeout(timer);pilotRunner?.stop();}
  };
  return runtime;
}

export function restoreLocalTableRuntime(options){
  const file=resolve(options.directory,'active.json');if(!existsSync(file))return null;const saved=JSON.parse(readFileSync(file));if(saved.schema!=='CrankMagicLocalTableRuntime@1'||saved.closed)return null;return createLocalTableRuntime({...options,lobby:saved.lobby,tableId:saved.tableId,activePod:saved.activePod||null});
}
