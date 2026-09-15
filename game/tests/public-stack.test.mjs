import test from 'node:test';
import assert from 'node:assert/strict';
import {publicStack} from '../tools/public-stack.mjs';
const event=(kind,fields,sequence=1)=>({kind,sequence,data:{fields}});
const card={cardId:66,name:'Sol Ring',faceDown:false};
test('a card stays visible from announcement through casting and leaves on resolution',()=>{
  const events=[event('GameEventZone',{zoneType:'Stack',mode:'Added',card})];
  assert.equal(publicStack(events)[0].stage,'casting');
  events.push(event('GameEventSpellAbilityCast',{sa:{host:card,isSpell:true,abilityId:8},si:{stackId:2,actor:{playerId:0}}},2));
  events.push(event('GameEventZone',{zoneType:'Stack',mode:'Added',card},3));
  assert.equal(publicStack(events).length,1);assert.equal(publicStack(events)[0].stage,'stack');
  events.push(event('GameEventSpellResolved',{spell:{host:card,abilityId:8}},4));
  assert.deepEqual(publicStack(events),[]);
});
test('cancelled casts and countered abilities do not remain as phantom cards',()=>{
  assert.deepEqual(publicStack([event('GameEventZone',{zoneType:'Stack',mode:'Added',card}),event('GameEventZone',{zoneType:'Stack',mode:'Removed',card})]),[]);
  assert.deepEqual(publicStack([event('GameEventSpellAbilityCast',{sa:{host:card,isSpell:false,abilityId:8},si:{stackId:2,isTrigger:true}}),event('GameEventSpellRemovedFromStack',{sa:{abilityId:8}})]),[]);
});
test('hidden card identities and private descriptions are excluded',()=>{
  const result=publicStack([event('GameEventDraw',{card:{name:'Secret draw'}}),event('GameEventSpellAbilityCast',{sa:{host:{...card,name:'Secret morph',faceDown:true},description:'Secret choice',isSpell:true,abilityId:8},si:{stackId:2}})]);
  assert.equal(result[0].name,null);assert.doesNotMatch(JSON.stringify(result),/Secret/);
});
test('a trigger zone notification does not invent a casting permanent',()=>{
  assert.deepEqual(publicStack([event('GameEventZone',{zoneType:'Stack',mode:'Added',card,sa:{isSpell:false}})]),[]);
});

test('stack targets preserve exact identities and hide private target names',()=>{
  const result=publicStack([event('GameEventSpellAbilityCast',{sa:{host:card,isSpell:true,abilityId:8},si:{stackId:2,targets:[
    {kind:'card',cardId:7,name:'Beetleback Chief',hidden:false},
    {kind:'card',cardId:8,name:'Private name',hidden:true,description:'Private description'},
    {kind:'player',playerId:1,name:'Opponent'}
  ]}})]);
  assert.deepEqual(result[0].targets,[{kind:'card',cardId:7,name:'Beetleback Chief',hidden:false},{kind:'card',cardId:8,name:null,hidden:true},{kind:'player',playerId:1,name:'Opponent'}]);
  assert.doesNotMatch(JSON.stringify(result),/Private/);
});
