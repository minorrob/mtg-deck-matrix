/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* D7 Faeries: event-stable draw ordinals, current target characteristics and stack X. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,addObject} from '../game/engine/state/index.mjs';
import {draw as stepDraw,advance,STEPS} from '../game/engine/rules/turn.mjs';
import {draw,moveOne} from '../game/engine/script/effects/zones.mjs';
import {collectTriggers} from '../game/engine/rules/trigger.mjs';
import {pushAbility,pushSpell,resolveTop} from '../game/engine/rules/stack.mjs';
import {compileSelector} from '../game/engine/script/filter.mjs';
import {compileScript} from '../game/engine/cards/index.mjs';
import {runScenario} from '../game/engine/cards/scenario.mjs';
import {loadCardIndex} from '../game/tools/engine-cards.mjs';
const cards=loadCardIndex(),F='Faerie Mastermind',S='Spellstutter Sprite',G='Gilt-Leaf Winnower';
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const table=()=>createState({matchId:'faeries',seed:'faeries',players:['Rob','Maya','Trey','Sam'].map(name=>({name}))});
const put=(s,name,zone='battlefield',seat=0,extra={})=>addObject(s,{...cards.definition(name),card:name,owner:seat,controller:seat,...extra},zone,['battlefield','exile'].includes(zone)?null:seat);
const library=(s,seat,n=6)=>Array.from({length:n},()=>put(s,'Wastes','library',seat));
const trigger=(s,source,ability,targets)=>pushAbility(s,{sourceId:source,controller:0,abilityId:ability.id,kind:'trigger',script:ability,targets});
for(const slug of ['faerie-mastermind','spellstutter-sprite','gilt-leaf-winnower']){
 const d=JSON.parse(fs.readFileSync(new URL(`../game/engine/cards/${slug[0]}/${slug}.scenarios.json`,import.meta.url)));
 for(const scenario of d.scenarios)eq(runScenario(scenario,cards.definition,d.fixtures).passed.length,3,scenario.name);
}
{
 const s=table();put(s,F);library(s,1);
 const events=draw(s,{count:3},{controller:1});eq(events.map(e=>e.data.fields.drawNumber),[1,2,3],'multi-draw has individual ordinals');
 collectTriggers(s,events);eq(s.pendingTriggers.length,1,'second of three draws triggers once despite final count three');
 eq(s.pendingTriggers[0].controller,0,'Mastermind controller draws');
}
for(const seat of [0,1,2,3]){
 const s=table();put(s,F);library(s,seat);const events=[];stepDraw(s,seat,events);events.push(...draw(s,{count:1},{controller:seat}));
 eq(events.map(e=>e.data.fields.drawNumber),[1,2],'turn draw and effect draw share a count');
 collectTriggers(s,events);eq(s.pendingTriggers.length,seat===0?0:1,'only opponents trigger it, including third/fourth players');
}
{
 let s=table();put(s,F);library(s,1);stepDraw(s,1,[]);s=JSON.parse(JSON.stringify(s));
 collectTriggers(s,draw(s,{count:1},{controller:1}));eq(s.pendingTriggers.length,1,'second draw recognized after reload');
 s.pendingTriggers=[];for(const p of s.players)p.drawnThisTurn=2;s.turn=1;s.activePlayer=0;s.stepIndex=STEPS.length-1;s.phase='CLEANUP';advance(s);
 eq(s.players.map(p=>p.drawnThisTurn),[0,0,0,0],'all players reset on each turn, not just active player');
 library(s,2);const events=draw(s,{count:2},{controller:2});collectTriggers(s,events);eq(s.pendingTriggers.length,1,'next turn second draw triggers anew');
}
{
 const s=table();library(s,1);draw(s,{count:2},{controller:1});put(s,F);
 collectTriggers(s,draw(s,{count:1},{controller:1}));eq(s.pendingTriggers.length,0,'entering after second draw does not make third a second');
 const searchEvents=[];moveOne(s,s.zones.library[1][0],'hand',searchEvents);collectTriggers(s,searchEvents);
 eq(s.players[1].drawnThisTurn,3,'putting a card into hand is not a draw');eq(s.pendingTriggers.length,0,'search-to-hand does not trigger a draw watcher');
}
{
 const s=table();put(s,F);library(s,1,1);const events=draw(s,{count:3},{controller:1});
 eq(events.map(e=>e.data.fields.drawNumber),[1],'empty draws have no ordinal/event');eq(s.players[1].drawnThisTurn,1,'only actual draw counted');
 eq(s.players[1].drewFromEmpty,true,'empty-library loss remains recorded');collectTriggers(s,events);eq(s.pendingTriggers.length,0,'failed second draw does not trigger');
 const e=[];stepDraw(s,1,e);eq(s.players[1].drawnThisTurn,1,'empty draw step does not increase count');
}
{
 const s=table();put(s,F);library(s,1,1);
 addObject(s,{card:'Draw redirection fixture',types:['Enchantment'],owner:0,controller:0,
  abilities:[{id:'redirect',kind:'replacement',watches:{event:'zone-change',from:'library',to:'hand'},change:{to:'exile'}}]},'battlefield');
 const events=draw(s,{count:1},{controller:1});collectTriggers(s,events);
 eq(s.zones.exile.length,1,'replacement moved the card to exile');
 eq(s.players[1].drawnThisTurn??0,0,'replaced hand entry does not advance draw ordinal');
 eq(events.some(e=>e.data?.fields?.drawn),false,'replacement event is not relabeled as a draw');
}
// Spellstutter targets and resolution use current Faerie permanents, with X valued on the stack.
const sprite=cards.definition(S).abilities.find(a=>a.kind==='triggered');
const spell=(s,mana,x=0)=>pushSpell(s,put(s,'Wastes','hand',1,{card:'Test spell',types:['Sorcery'],manaCost:mana}),{controller:1,x});
const fits=(s,source,e)=>compileSelector(sprite.targets[0])(s,e.objectId,{controller:0,source});
{
 const s=table(),source=put(s,S),e=spell(s,'{X}{U}',2);eq(fits(s,source,e),false,'X=2 plus U costs three mana value');
 const own=put(s,F);eq(fits(s,source,e),false,'two Faeries are insufficient');const enemy=put(s,F,'battlefield',1);eq(fits(s,source,e),false,'opponent Faerie excluded');
 s.effects=[{id:'borrow',layer:2,timestamp:1,affects:{ids:[enemy]},apply:{controller:0}}];eq(fits(s,source,e),true,'layered controller counts third Faerie');
 s.effects=[];put(s,'Wastes','battlefield',0,{types:['Kindred','Enchantment'],subtypes:['Faerie']});eq(fits(s,source,e),true,'noncreature Faerie counts too');
 const gy=moveOne(s,e.objectId,'graveyard',[]);eq(compileSelector({what:'card',zone:'graveyard',manaValue:{exactly:1}})(s,gy,{controller:0}),true,'X is zero after leaving stack');
 void own;
}
for(const removeSource of [true,false]){
 const s=table(),source=put(s,S),other=put(s,F),e=spell(s,'{2}');trigger(s,source,sprite,[{kind:'object',id:e.objectId}]);
 moveOne(s,removeSource?source:other,'graveyard',[]);const events=resolveTop(s);
 eq(s.stack.some(x=>x.objectId===e.objectId),true,'Faerie departure makes target illegal before resolution');
 eq(events.at(-1).data.fields.hasFizzled,true,'invalid target fizzles, including with Sprite gone');
}
{
 const s=table(),source=put(s,S),e=spell(s,'{1}');trigger(s,source,sprite,[{kind:'object',id:e.objectId}]);resolveTop(s);
 eq(s.stack.length,0,'legal spell countered');eq(s.zones.graveyard[1].length,1,'countered card in owner graveyard');
}
// Winnower accepts either direction of inequality, rejects Elves/changelings/noncreatures, and rereads layers.
const winnower=cards.definition(G).abilities.find(a=>a.kind==='triggered');
for(const [power,toughness,extra,want] of [[1,2,{},true],[3,2,{},true],[2,2,{},false],[0,0,{},false],[-1,0,{},true],[2,3,{subtypes:['Elf']},false],[2,3,{keywords:['Changeling']},false],[2,3,{types:['Artifact']},false]]){
 const s=table(),source=put(s,G),id=put(s,'Wastes','battlefield',1,{types:['Creature'],subtypes:['Human'],power,toughness,...extra});
 eq(compileSelector(winnower.targets[0])(s,id,{controller:0,source}),want,`target ${power}/${toughness} ${JSON.stringify(extra)}`);
}
{
 const s=table(),source=put(s,G),id=put(s,'Wastes','battlefield',1,{types:['Creature'],subtypes:['Human'],power:1,toughness:2});
 trigger(s,source,winnower,[{kind:'object',id}]);s.effects=[{id:'equal',layer:7,sublayer:'b',timestamp:1,affects:{ids:[id]},apply:{setPower:2,setToughness:2}}];
 const events=resolveTop(s);eq(s.objects[id]?.zone,'battlefield','now equal target is not destroyed');eq(events.at(-1).data.fields.hasFizzled,true,'equality is checked on resolution');
}
for(const bad of [0,-1,2.5,'2']){
 const d=JSON.parse(fs.readFileSync(new URL('../game/engine/cards/f/faerie-mastermind.json',import.meta.url)));d.abilities[2].trigger.nthThisTurn=bad;
 eq(compileScript(d).problems.length>0,true,'invalid draw ordinal rejected');
}
assert.throws(()=>compileSelector({unequalPowerToughness:false}));checks++;
console.log(`engine-faerie-interactions: ${checks} checks passed`);
