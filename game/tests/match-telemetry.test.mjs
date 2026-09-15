import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeEvents,matchTelemetry,parseJournal} from '../tools/match-telemetry.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const visible=[{cardId:1,name:'Public permanent',owner:0,controller:0},{cardId:2,name:null,faceDown:true,owner:1,controller:1}];
const event=(kind,fields,sequence=1)=>({kind,eventId:`event:${sequence}`,data:{turn:2,fields}});
test('Forge unblocked sentinel is not reported as a creature blocking itself',()=>{
 const attacker={cardId:1},blocker={cardId:3};
 const fields={defendingPlayer:{playerId:1,name:'Krenko'},blockers:[{key:{playerId:1},value:[{key:attacker,value:[attacker]}]}]};
 assert.match(summarizeEvents([event('GameEventBlockersDeclared',fields)],visible).recent[0].label,/Public permanent · no blockers/);
 fields.blockers[0].value[0].value=[blocker];
 assert.match(summarizeEvents([event('GameEventBlockersDeclared',fields)],[...visible,{cardId:3,name:'Goblin token'}]).recent[0].label,/Public permanent blocked by Goblin token/);
});
test('telemetry excludes hidden sources, private draws and raw descriptions',()=>{
  const result=summarizeEvents([
    event('GameEventSpellAbilityCast',{sa:{host:{cardId:2,name:'Secret morph'},description:'Secret library card'},si:{actor:{playerId:1}}}),
    event('GameEventDraw',{card:{cardId:99,name:'Secret draw'}}),
    event('GameEventCardTapped',{card:{cardId:1},tapped:true})],visible);
  assert.equal(result.counts.taps,1);assert.equal(result.counts.stackEntries,0);assert.equal(result.recent.length,1);assert.doesNotMatch(JSON.stringify(result),/Secret/);
});
test('departed tokens retain damage and graveyard history after a reload',()=>{
  const dir=mkdtempSync(join(tmpdir(),'commander-log-'));
  const token={cardId:420,name:'Inkling Token',faceDown:false},spell={cardId:140,name:'Cinder Strike',faceDown:false};
  const events=[event('GameEventCardChangeZone',{card:token,from:null,to:{zoneType:'Battlefield',player:{playerId:0}}},1),event('GameEventSpellAbilityCast',{sa:{host:spell,isSpell:true},si:{actor:{playerId:1}},targetDescription:'[Inkling Token (420)]'},2),event('GameEventCardDamaged',{card:token,source:spell,amount:4},3),event('GameEventCardChangeZone',{card:token,from:{zoneType:'Battlefield',player:{playerId:0}},to:{zoneType:'Graveyard',player:{playerId:0}}},4),event('GameEventCardChangeZone',{card:{cardId:999,name:'Secret draw',faceDown:false},from:{zoneType:'Library'},to:{zoneType:'Hand',player:{playerId:1}}},5)];
  try{writeFileSync(join(dir,'events.ndjson'),events.map((e,i)=>JSON.stringify({...e,sequence:i+1})).join('\n')+'\n');const result=matchTelemetry(dir,{players:[]});assert.equal(result.recent.length,4);assert.match(result.recent[0].label,/graveyard.*4 damage from Cinder Strike/);assert.match(result.recent[2].label,/targeting Inkling Token/);assert.doesNotMatch(JSON.stringify(result),/Secret draw/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('empty combat and an opening-hand reshuffle are explained in history',()=>{
 const player={playerId:3,name:'Shadrix'},result=summarizeEvents([
  {...event('GameEventShuffle',{player},1),data:{turn:0,fields:{player}}},
  {...event('GameEventShuffle',{player},2),data:{turn:0,fields:{player}}},
  event('GameEventAttackersDeclared',{player,attackersMap:[]},3)
 ],visible);
 assert.deepEqual(result.recent.map(row=>row.label),['No attackers declared','Opening hand reshuffled','Library shuffled']);
 assert.equal(result.counts.shuffles,2);
});
test('telemetry caches are isolated by viewer seat',()=>{
  const dir=mkdtempSync(join(tmpdir(),'commander-private-log-')),privateCard={cardId:71,name:'Seat zero private card',faceDown:false,owner:0,controller:0};
  try{
    writeFileSync(join(dir,'events.ndjson'),JSON.stringify({...event('GameEventCardTapped',{card:privateCard,tapped:true}),sequence:1})+'\n');
    const own=matchTelemetry(dir,{players:[{zones:{Hand:{cards:[privateCard]}}}]},0);assert.equal(own.recent[0].name,privateCard.name);
    const other=matchTelemetry(dir,{players:[{zones:{Hand:{cards:[]}}}]},1);assert.equal(other.recent.length,0);assert.doesNotMatch(JSON.stringify(other),/Seat zero private/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('tap, counter and classified trigger events remain distinct',()=>{
  const result=summarizeEvents([
    event('GameEventCardTapped',{card:{cardId:1},tapped:true}),event('GameEventCardTapped',{card:{cardId:1},tapped:false}),
    event('GameEventCardCounters',{card:{cardId:1},oldValue:2,newValue:5}),
    event('GameEventSpellAbilityCast',{sa:{host:{cardId:1},isSpell:false},si:{actor:{playerId:0},isTrigger:true}})],visible);
  assert.equal(result.counts.taps,1);assert.equal(result.counts.countersAdded,3);assert.equal(result.counts.triggers,1);assert.equal(result.cards[0].triggers,1);assert.equal(result.counts.abilities,0);
});
test('older journals do not invent trigger or proliferate counts from card text',()=>{
  const result=summarizeEvents([event('GameEventSpellAbilityCast',{sa:{host:{cardId:1},description:'Proliferate.'},si:{actor:{playerId:0}}})],visible);
  assert.equal(result.counts.stackEntries,1);assert.equal(result.classified,false);assert.equal(result.proliferateInstrumented,false);
});
test('history includes phase, life and resolution without copying hidden descriptions',()=>{
  const result=summarizeEvents([
    event('GameEventTurnPhase',{playerTurn:{playerId:0,name:'Rob'},phase:'MAIN1'}),
    event('GameEventPlayerLivesChanged',{player:{playerId:0,name:'Rob'},oldLives:40,newLives:41}),
    event('GameEventSpellResolved',{spell:{host:{cardId:1},description:'Secret'},stackDescription:'Secret',hasFizzled:false}),
    event('GameEventCardTapped',{card:{cardId:1,faceDown:true,name:'Secret'},tapped:true})],visible);
  assert.deepEqual(result.recent.map(e=>e.label),['Resolved','Life 40 → 41','main1']);
  assert.equal(result.counts.taps,0);assert.doesNotMatch(JSON.stringify(result),/Secret|undefined/);
});

test('combat recap retains assignments and actual damage types after combat ends',()=>{
  const attacker={cardId:1,name:'Commander',power:4,commander:true,keywords:['infect']};
  const combat={turn:2,attacks:[{attacker,defender:{kind:'player',id:1,name:'Krenko'},blockers:[{cardId:2,name:'Blocker'}],blocked:true}]};
  const result=summarizeEvents([{kind:'combat-state',eventId:'combat:1',data:{turn:2,phase:'COMBAT_DECLARE_BLOCKERS',combat}}, {...event('GameEventPlayerDamaged',{source:{cardId:1},target:{playerId:1,name:'Krenko'},amount:2,combat:true,infect:true},2),data:{turn:2,phase:'COMBAT_DAMAGE',fields:{source:{cardId:1},target:{playerId:1,name:'Krenko'},amount:2,combat:true,infect:true}}}, {kind:'combat-state',eventId:'combat:3',data:{turn:2,phase:'COMBAT_END',combat:{turn:2,attacks:[]}}}], [attacker]);
  assert.equal(result.combats[0].attacks[0].blockers[0].name,'Blocker');assert.match(result.recent[0].label,/2 combat infect damage to Krenko.*commander/);assert.equal(result.recent[0].phase,'COMBAT_DAMAGE');
});

test('cancelled unaffordable casts remain visible as failed attempts',()=>{
  const result=summarizeEvents([{kind:'browser-cast-cancelled',eventId:'cancel:1',data:{turn:2,phase:'MAIN1',playerId:0,card:{cardId:1,name:'Public permanent',faceDown:false},cost:'{U}{G}'}}],visible);
  assert.equal(result.counts.cancelledCasts,1);assert.equal(result.cards[0].cancelledCasts,1);assert.match(result.recent[0].label,/Cast cancelled.*required \{U\}\{G\}/);
});

test('cast chains retain exact resolution links and repeated activity is evidence, not an invented infinite loop',()=>{
  const cast=n=>({...event('GameEventSpellAbilityCast',{sa:{abilityId:77,host:{cardId:1},isSpell:false},si:{actor:{playerId:0},isTrigger:true}},n),eventId:`event:${n}`,sequence:n});
  const resolved={...event('GameEventSpellResolved',{spell:{host:{cardId:1}},hasFizzled:false},4),eventId:'event:4',sequence:4,data:{turn:2,castEventId:'event:1',fields:{spell:{host:{cardId:1}},hasFizzled:false}}};
  const result=summarizeEvents([cast(1),cast(2),cast(3),resolved],visible);
  assert.equal(result.chains[0].resolutionEventId,'event:4');assert.equal(result.chains[0].status,'resolved');assert.equal(result.repeatedAbilityRuns[0].count,3);assert.equal(result.repeatedAbilityRuns[0].confirmedLoop,false);assert.equal(result.counts.resolutions,1);
});

test('journal integrity reports malformed lines, missing sequences and duplicate identities',()=>{
  const parsed=parseJournal([JSON.stringify({...event('GameEventTurnPhase',{},1),sequence:1}),'{bad',JSON.stringify({...event('GameEventTurnPhase',{},3),sequence:3}),JSON.stringify({...event('GameEventTurnPhase',{},3),sequence:3})].join('\n')+'\n');
  assert.equal(parsed.events.length,3);assert.deepEqual(parsed.integrity.invalidLines,[2]);assert.deepEqual(parsed.integrity.sequenceGaps,[{after:1,before:3}]);assert.deepEqual(parsed.integrity.duplicateSequences,[3]);assert.deepEqual(parsed.integrity.duplicateEventIds,['event:3']);assert.equal(parsed.integrity.complete,false);
});

test('final health state records rules-engine loss causes without recomputing thresholds',()=>{
  const dir=mkdtempSync(join(tmpdir(),'commander-outcome-log-'));
  try{writeFileSync(join(dir,'events.ndjson'),JSON.stringify({...event('GameEventGameOutcome',{},1),sequence:1})+'\n');const result=matchTelemetry(dir,{players:[{playerId:0,name:'Rob',life:0,health:{status:'out',lossReason:'LifeReachedZero',life:0,poison:0,commanderDamageMax:3},zones:{Battlefield:{cards:[]}}}]});assert.equal(result.outcomes[0].lossReason,'LifeReachedZero');assert.equal(result.outcomes[0].status,'out');assert.equal(result.integrity.complete,true);}finally{rmSync(dir,{recursive:true,force:true});}
});
