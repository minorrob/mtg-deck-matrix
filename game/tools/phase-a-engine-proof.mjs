/** Real-engine transport proof, not browser UAT or a completed game. Uses synthetic legal decks. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomInt} from 'node:crypto';
import {launchLocalGame,closeLocalGame} from './local-game-launcher.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function runEngineProof({provider}={}) {
  const commander={name:'Krenko, Mob Boss',quantity:1,oracleId:'fixture-krenko'},land={name:'Mountain',quantity:99,oracleId:'fixture-mountain'};
  const pod={schema:'CommanderPodPack@1',podHash:randomUUID(),seed:randomInt(2147483647),testFixture:true,
    seats:Array.from({length:4},(_,seatId)=>({seatId,name:'Proof seat '+seatId,nativeProfile:'Default',engineController:seatId<3?'browser':'native-ai',deck:{name:'Synthetic basic-land Commander proof',commanders:[commander],library:[land]},mechanics:{cards:[]}}))};
  const started=await launchLocalGame(pod),directory=started.directory;
  const result={schema:'CrankMagicPhaseAProof@1',syntheticDecks:true,completedGame:false,passed:false,landPlayedBy:[],drawConfirmedBy:[],viewsChecked:0,provider:provider?'configured':'fixture',directory};
  const connections=[],lastSent=new Map(),played=new Set();let providerUsed=false;
  const request=async(seat,operation,body,overrideToken)=>{
    const c=connections[seat];const r=await fetch(`http://127.0.0.1:${c.port}/${operation}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-CrankMagic-Bridge':overrideToken??c.token},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
    return {ok:r.ok,value:await r.json()};
  };
  try {
    const deadline=Date.now()+240000;
    while(Date.now()<deadline){
      if(existsSync(resolve(directory,'error.json')))throw Error('Forge error: '+readFileSync(resolve(directory,'error.json'),'utf8'));
      for(let seat=0;seat<3;seat++)if(!connections[seat]){const path=resolve(directory,seat?'seats/'+seat+'/browser-bridge.json':'browser-bridge.json');if(existsSync(path))connections[seat]=JSON.parse(readFileSync(path));}
      if(connections.filter(Boolean).length<3){await delay(300);continue;}
      for(let seat=0;seat<3;seat++){
        const {ok,value:v}=await request(seat,'view');assert.ok(ok);assert.equal(v.viewerSeatId,seat);
        if(!v.state.players?.length)continue;
        assert.equal(v.viewerPlayerId,seat);result.viewsChecked++;
        for(const p of v.state.players){
          assert.equal(p.zones.Library.cards.length,0,'Library order leaked');
          if(p.playerId!==seat)assert.equal(p.zones.Hand.cards.length,0,'Other seat hand leaked');
        }
        if(!result.tokenIsolation){for(let recipient=0;recipient<3;recipient++)for(let sender=0;sender<3;sender++)if(recipient!==sender)assert.equal((await request(recipient,'view',null,connections[sender].token)).ok,false);result.tokenIsolation=true;}
        const ui=v.ui;if(ui.nativeFallback)throw Error('Native fallback: '+ui.nativeFallback);
        if(ui.actionInFlight||lastSent.get(seat)===v.revision)continue;
        const mine=v.state.players.find(p=>p.playerId===seat);let action;
        if(ui.choice){
          const c=ui.choice;
          if(c.mode==='damage')throw Error('Unexpected damage choice in foundation proof');
          const indices=c.options.slice(0,c.min).map(o=>o.index);
          action={kind:'answer',choiceId:c.id,...(c.mode==='integer'?{value:c.min}:{indices})};
          if(c.mode==='draw'&&!result.drawConfirmedBy.includes(seat))result.drawConfirmedBy.push(seat);
          if(provider&&!providerUsed&&c.mode==='one'&&c.min===1&&c.max===1&&c.options.length){
            const selected=await provider({seatId:seat,revision:v.revision,choice:c,observation:v.state});
            assert.ok(c.options.some(o=>o.index===selected),'Provider chose unavailable option');
            action.indices=[selected];providerUsed=true;result.providerDecision=true;
          }
        } else if(v.state.turn===0&&/Who would you like to start/.test(ui.prompt))action={kind:'player',targetId:0};
        else if(/Mulligan/i.test(ui.inputType)&&ui.okEnabled)action={kind:'ok'};
        else if(v.state.turnPlayerId===seat&&v.state.priorityPlayerId===seat&&v.state.phase==='MAIN1'&&!played.has(seat)){
          const card=mine.zones.Hand.cards.find(c=>c.typeLine?.includes('Land'));
          if(card&&ui.cardActions?.[card.cardId]){
            if(provider&&!providerUsed){
              const candidates=mine.zones.Hand.cards.filter(c=>c.typeLine?.includes('Land')&&ui.cardActions?.[c.cardId]);
              const choice={id:randomUUID(),mode:'one',min:1,max:1,title:'Choose a land to play in this synthetic integration test',options:candidates.map((c,index)=>({index,label:c.name,cardId:c.cardId}))};
              const selected=await provider({seatId:seat,revision:v.revision,choice,observation:v.state});assert.ok(choice.options.some(o=>o.index===selected));
              action={kind:'card',targetId:candidates[selected].cardId};providerUsed=true;result.providerDecision=true;
            }else action={kind:'card',targetId:card.cardId};
            played.add(seat);
          }
          else if(ui.okEnabled)action={kind:'ok'};
        } else if(ui.okEnabled)action={kind:'ok'};
        for(const id of played){if(v.state.players.find(p=>p.playerId===id)?.zones.Battlefield.cards.some(c=>c.typeLine?.includes('Land'))&&!result.landPlayedBy.includes(id))result.landPlayedBy.push(id);}
        result.nativeAiLandPlayed=v.state.players.find(p=>p.playerId===3)?.zones.Battlefield.cards.some(c=>c.typeLine?.includes('Land'))||false;
        if(v.state.turn>=5&&result.nativeAiLandPlayed&&result.landPlayedBy.length===3&&result.drawConfirmedBy.length===3&&(!provider||providerUsed)){
          result.passed=true;result.turn=v.state.turn;result.provider=provider?'live-or-injected-see-run-label':'not-used';return result;
        }
        if(action){const body={...action,actionId:randomUUID(),revision:v.revision};const r=await request(seat,'action',body);
          if(r.ok){lastSent.set(seat,v.revision);const retry=await request(seat,'action',body);assert.deepEqual(retry.value,r.value,'Retry changed receipt');}
          else {if(action.kind==='card')played.delete(seat);if(!/board changed|decision|Button is unavailable/i.test(r.value.error))throw Error(r.value.error);}
        }
      }
      await delay(100);
    }
    throw Error('Proof timeout; '+JSON.stringify(result));
  } catch(error) {
    result.error=error.message;throw error;
  } finally {
    try {await closeLocalGame();result.engineClosed=true;}
    catch(error){const wasPassing=result.passed;result.passed=false;result.engineClosed=false;result.closeError=error.message;if(wasPassing)throw error;}
    finally {writeFileSync(resolve(directory,'phase-a-result.json'),JSON.stringify(result,null,2));}
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runEngineProof().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
