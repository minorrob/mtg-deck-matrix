import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeEvents} from '../tools/match-telemetry.mjs';
const visible=[{cardId:1,name:'Public permanent',owner:0,controller:0},{cardId:2,name:null,faceDown:true,owner:1,controller:1}];
const event=(kind,fields,sequence=1)=>({kind,eventId:`event:${sequence}`,data:{turn:2,fields}});
test('telemetry excludes hidden sources, private draws and raw descriptions',()=>{
  const result=summarizeEvents([
    event('GameEventSpellAbilityCast',{sa:{host:{cardId:2,name:'Secret morph'},description:'Secret library card'},si:{actor:{playerId:1}}}),
    event('GameEventDraw',{card:{cardId:99,name:'Secret draw'}}),
    event('GameEventCardTapped',{card:{cardId:1},tapped:true})],visible);
  assert.equal(result.counts.taps,1);assert.equal(result.counts.stackEntries,0);assert.equal(result.recent.length,1);assert.doesNotMatch(JSON.stringify(result),/Secret/);
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
