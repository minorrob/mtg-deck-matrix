/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Linked exile, turn-bounded free casting and Quintorius's stack-to-library rider.
 * CR 400.7, 601.2, 607.2a, 611.2a, 903.9b. Isolated states, never user saves. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runScenario} from '../game/engine/cards/scenario.mjs';
import {loadCardIndex} from '../game/tools/engine-cards.mjs';
import {legalActions,applyAction} from '../game/engine/rules/actions.mjs';
import {addObject} from '../game/engine/state/index.mjs';
import {moveOne,moveZone,mayPlay} from '../game/engine/script/effects/zones.mjs';
import {beginResolution} from '../game/engine/script/resolution.mjs';
import {awaitingChoice,resolveAwaiting} from '../game/engine/rules/turn.mjs';
import {resolveTop} from '../game/engine/rules/stack.mjs';
import {collectTriggers} from '../game/engine/rules/trigger.mjs';
import {compileScript} from '../game/engine/cards/index.mjs';
import {compileSelector} from '../game/engine/script/filter.mjs';
const index=loadCardIndex(), Q='Quintorius, Loremaster', M='Maralen, Fae Ascendant';
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const gift={types:['Instant'],manaCost:'{2}{U}',colors:['U'],spell:{id:'gift',text:'Gain 1 life.',targets:[],effects:[{effect:'gainLife',amount:1}]}};
const FIX={Gift:gift,Zero:{...gift,manaCost:''},Relic:{types:['Artifact'],manaCost:'{1}',colors:[]},Elf:{types:['Creature'],subtypes:['Elf'],manaCost:'{1}',power:2,toughness:2},Faerie:{types:['Creature'],subtypes:['Faerie'],manaCost:'{1}',power:2,toughness:2},Bear:{types:['Creature'],subtypes:['Bear'],manaCost:'{2}',power:2,toughness:2},
 Recall:{...gift,spell:{id:'recall',text:'Return target creature.',targets:[{what:'permanent',types:['Creature']}],effects:[{effect:'moveZone',targets:{target:0},to:'hand'}]}}};
const at=(seat,zone,...cards)=>({seat,zone,cards});
const table=(setup=[])=>runScenario({name:'isolated exile rules',setup},index.definition,FIX).state;
const put=(s,name,zone='battlefield',seat=0,more={})=>addObject(s,{...(FIX[name]??index.definition(name)),card:name,owner:seat,controller:seat,...more},zone,['battlefield','exile'].includes(zone)?null:seat);
const named=(s,name,zone)=>Object.values(s.objects).find(o=>o.card===name&&o.zone===zone)?.id;
const offers=(s,name,seat=0)=>legalActions(s,seat).filter(a=>a.kind==='cast'&&a.label===name);
const link=(s,source,name,seat=1)=>{const id=put(s,name,'library',seat);moveZone(s,{targets:[id],to:'exile',link:true},{controller:0,source});return named(s,name,'exile');};
const grant=(s,id,more={})=>mayPlay(s,{targets:[id],spellsOnly:true,free:true,graveyardToLibraryBottom:true,...more},{controller:0});
const cast=(s,name)=>{const a=offers(s,name)[0];assert.ok(a,`no ${name} cast`);applyAction(s,0,a);return s.stack.at(-1);};
for(const slug of ['quintorius-loremaster','maralen-fae-ascendant']){
 const d=JSON.parse(fs.readFileSync(new URL(`../game/engine/cards/${slug[0]}/${slug}.scenarios.json`,import.meta.url)));
 for(const scenario of d.scenarios)eq(runScenario(scenario,index.definition,d.fixtures).passed.length>=3,true,scenario.name);
}
// Free casting is a real alternative cost; normal timing and mandatory additional costs remain.
for(const name of ['Gift','Zero']){
 const s=table(),id=put(s,name,'exile',1);grant(s,id);
 eq(offers(s,name).map(a=>a.free),[true],`${name} cast without mana, including no mana cost`);
 const e=cast(s,name);eq(e.graveyardToLibraryBottom,true,'chosen permission records its rider');
 const events=resolveTop(s);eq(s.players[0].life,41,'spell resolves for caster');
 eq(s.objects[s.zones.library[1].at(-1)].card,name,'card on bottom of owner library');
 eq(events.find(e=>e.kind==='GameEventCardChangeZone').data.fields.to.player.playerId,1,'zone event names owner');
 eq(Object.values(s.players[0].manaPool).every(v=>v===0),true,'no mana manufactured or spent');
}
{
 const s=table(),id=put(s,'Relic','exile',1);grant(s,id);cast(s,'Relic');resolveTop(s);
 const relic=named(s,'Relic','battlefield');eq(s.objects[relic].controller,0,'stolen permanent enters under caster control');
 moveOne(s,relic,'graveyard',[]);eq(named(s,'Relic','graveyard')!==undefined,true,'rider does not follow the resolved permanent');
}
{
 const s=table(),id=put(s,'Relic','exile');grant(s,id);s.activePlayer=1;
 eq(offers(s,'Relic').length,0,'permission does not grant flash');
 s.activePlayer=0;const other=put(s,'Gift','exile');grant(s,other);const effectIds=s.effects.map(e=>e.id);eq(new Set(effectIds).size,effectIds.length,'separate permissions have distinct ids');
 s.priorityPlayer=1;eq(offers(s,'Gift',1).length,0,'permission belongs to grantee only');
}
for(const to of ['graveyard','hand','exile']){
 const s=table(),id=put(s,'Gift','exile',1);grant(s,id);const e=cast(s,'Gift');
 moveOne(s,e.objectId,to,[]);eq(named(s,'Gift',to==='graveyard'?'library':to)!==undefined,true,`explicit stack move ${to} has correct destination`);
}
for(const to of [undefined,'top','exile']){
 const s=table(),id=put(s,'Gift','exile',1);grant(s,id);const e=cast(s,'Gift');
 beginResolution(s,[{effect:'counterSpell',spells:[e.objectId],...(to?{to}:{})}],{controller:1});
 eq(named(s,'Gift',to==='exile'?'exile':'library')!==undefined,true,`counter to ${to??'graveyard'}`);
 if(to!=='exile')eq(s.objects[s.zones.library[1][to==='top'?0:s.zones.library[1].length-1]].card,'Gift','top override versus bottom rider');
}
{
 const s=table(),target=put(s,'Bear'),id=put(s,'Recall','exile',1);grant(s,id);cast(s,'Recall');moveOne(s,target,'graveyard',[]);
 const events=resolveTop(s);eq(s.objects[s.zones.library[1].at(-1)].card,'Recall','all targets illegal still goes to owner bottom');
 eq(events.at(-1).data.fields.hasFizzled,true,'fizzle remains correctly reported');
}
// Owner, not caster, decides a commander replacement, including a fizzle; continuation survives JSON reload.
for(const mode of ['counter','move','fizzle'])for(const yes of [true,false]){
 let s=table(),target=put(s,'Bear'),id=put(s,mode==='fizzle'?'Recall':'Gift','exile',1,{commander:true});grant(s,id);
 const e=cast(s,mode==='fizzle'?'Recall':'Gift');
 if(mode==='fizzle'){moveOne(s,target,'graveyard',[]);resolveTop(s);}else beginResolution(s,[mode==='counter'?{effect:'counterSpell',spells:[e.objectId]}:{effect:'moveZone',targets:[e.objectId],to:'graveyard'}],{controller:0});
 eq(s.awaiting.player,1,'owner is asked before commander enters library');
 if(mode==='fizzle')eq(s.stack.length,1,'resolving spell remains visible until its owner answers');
 eq(awaitingChoice(s).options[1].label,'Let it go to your library','destination label is accurate');
 s=JSON.parse(JSON.stringify(s));const events=resolveAwaiting(s,[yes?0:1]);
 eq(named(s,mode==='fizzle'?'Recall':'Gift',yes?'command':'library')!==undefined,true,'owner decision applied after reload');
 eq(Boolean(s.awaiting||s.resolving||s.finishingSpell),false,'no unfinished continuation');
 if(mode==='fizzle')eq(events.filter(e=>e.kind==='GameEventSpellResolved').map(e=>e.data.fields.hasFizzled),[true],'fizzle emitted once after decision');
}
// Maralen: one Elf/Faerie counts once, opponents/old exiles/unlinked cards never count.
{
 const s=table([at(0,'battlefield',M)]),source=named(s,M,'battlefield');link(s,source,'Gift');
 eq(offers(s,'Gift').length,0,'Maralen itself is one permanent despite both subtypes');
 put(s,'Elf');eq(offers(s,'Gift').length,0,'two is less than mana value three');
 const faerie=put(s,'Faerie','battlefield',1);eq(offers(s,'Gift').length,0,'opponent Faerie excluded');
 (s.effects??=[]).push({id:'borrow',layer:2,timestamp:1,affects:{ids:[faerie]},apply:{controller:0}});
 eq(offers(s,'Gift').map(a=>a.free),[true],'layered controller counts third Elf/Faerie');
 s.effects=[];put(s,'Relic','battlefield',0,{types:['Kindred','Artifact'],subtypes:['Faerie']});
 eq(offers(s,'Gift').length,1,'a noncreature Kindred Faerie also counts');
 const id=named(s,'Gift','exile');s.objects[id].exiledTurn=s.turn-1;eq(offers(s,'Gift').length,0,'prior-turn linked exile unavailable');
 s.objects[id].exiledTurn=s.turn;delete s.links[source];eq(offers(s,'Gift').length,0,'unlinked exile unavailable');
}
{
 const s=table([at(0,'battlefield',M)]),source=named(s,M,'battlefield');link(s,source,'Relic');link(s,source,'Zero');
 cast(s,'Relic');resolveTop(s);eq(offers(s,'Zero').length,0,'one spell spends the turn limit');
 s.turn++;s.objects[named(s,'Zero','exile')].exiledTurn=s.turn;s.activePlayer=1;s.priorityPlayer=0;
 eq(offers(s,'Zero').length,1,'resets on every turn, including opponent turn');
 const old=source;const gy=moveOne(s,source,'graveyard',[]);const fresh=moveOne(s,gy,'battlefield',[]);
 eq(old!==fresh,true,'returning Maralen is a different object');eq(offers(s,'Zero').length,0,'new Maralen cannot use old links');
}
// Trigger eligibility, including a changed source and noncreature kindred; owner is irrelevant.
for(const [name,seat,extra,want] of [['Elf',0,{},1],['Faerie',0,{},1],['Elf',1,{},0],['Bear',0,{},0],['Relic',0,{types:['Kindred','Artifact'],subtypes:['Elf']},1]]){
 const s=table([at(0,'battlefield',M)]),events=[];moveOne(s,put(s,name,'hand',seat,extra),'battlefield',events);collectTriggers(s,events);
 eq(s.pendingTriggers.length,want,`Maralen watches ${name} seat ${seat}`);
}
// Quintorius's actual activation: linked target, Spirit sacrifice, tap and mana cost.
{
 const s=table([at(0,'battlefield',Q,'Mountain','Plains','Wastes')]),source=named(s,Q,'battlefield');link(s,source,'Gift',0);
 const spirit=put(s,'Bear','battlefield',0,{card:'Spirit',subtypes:['Spirit']});s.players[0].manaPool={R:1,W:1,C:1};
 const a=legalActions(s,0).find(a=>a.kind==='activate'&&a.objectId===source);assert.ok(a,'Quintorius activation offered');
 applyAction(s,0,a);eq(s.objects[source].tapped,true,'activation taps commander');eq(Boolean(s.objects[spirit]),false,'Spirit sacrificed as cost');
 moveOne(s,source,'graveyard',[]);resolveTop(s);eq(offers(s,'Gift').length,1,'resolved permission survives source departure');
 cast(s,'Gift');resolveTop(s);eq(s.objects[s.zones.library[0].at(-1)].card,'Gift','activated free spell goes to bottom');
}
// An Adventure is weighed as that spell, not its main face; exile permission cannot be reused as Adventure.
for(const [frontCost,adventureCost,expected] of [['{5}','{1}',true],['{1}','{5}',false]]){
 const s=table([at(0,'battlefield',M)]),source=named(s,M,'battlefield');
 const main={card:'Walker',types:['Creature'],manaCost:frontCost,power:2,toughness:2};
 const adv={...gift,card:'Journey',manaCost:adventureCost,subtypes:['Adventure']};
 const id=put(s,'Bear','library',1,{...main,adventurer:{main,adventure:adv}});
 moveZone(s,{targets:[id],to:'exile',link:true},{controller:0,source});
 const actions=offers(s,'Journey');eq(actions.length>0,expected,'Adventure uses its own mana value');
 if(expected){applyAction(s,0,actions[0]);resolveTop(s);eq(offers(s,'Journey').length,0,'Adventure permission cannot loop the Adventure');}
}
// A resolved trigger still links to its old source after it leaves; a later source cannot claim it.
{
 const s=table([at(0,'battlefield',M)]),source=named(s,M,'battlefield');
 const oldCard=put(s,'Gift','library',1);moveOne(s,source,'graveyard',[]);
 moveZone(s,{targets:[oldCard],to:'exile',link:true},{controller:0,source:null,lastKnown:{cardId:source,name:M}});
 eq(s.links[source].length,1,'last known source retains its link');
 eq(s.objects[s.links[source][0]].exiledTurn,s.turn,'linked exile records the turn');
 eq(offers(s,'Gift').length,0,'departed static source grants no permission');
}
// A free permission and a paid permission are separate reviewable choices, each with its own rider.
{
 const s=table(),id=put(s,'Gift','exile');grant(s,id);mayPlay(s,{targets:[id],spellsOnly:true},{controller:0});s.players[0].manaPool={U:3};
 const choices=offers(s,'Gift');eq(choices.map(a=>Boolean(a.free)).sort(),[false,true],'free and paid permissions are distinct');
 eq(choices.every(a=>a.via!==undefined),true,'ambiguous offers carry exact permission identity');
 applyAction(s,0,choices.find(a=>!a.free));eq(s.stack.at(-1).graveyardToLibraryBottom,undefined,'paid choice does not inherit other permission rider');
}
// A static permission follows the source's current controller and current abilities.
{
 const s=table([at(0,'battlefield',M)]),source=named(s,M,'battlefield');link(s,source,'Zero');
 s.effects=[{id:'borrow-source',layer:2,timestamp:1,affects:{ids:[source]},apply:{controller:1}}];
 eq(offers(s,'Zero').length,0,'former controller loses static permission');
 s.priorityPlayer=1;eq(offers(s,'Zero',1).length,1,'new layered controller gains static permission');
 s.effects.push({id:'humble',layer:6,timestamp:2,affects:{ids:[source]},apply:{removeAllAbilities:true}});
 eq(offers(s,'Zero',1).length,0,'lost abilities remove static permission');
 s.effects=[];s.priorityPlayer=0;eq(offers(s,'Zero').length,1,'ending effects restores permission');
}
// No-mana-cost spells may be cast for free; a land is never a spell (CR 305.9).
for(const source of ['Darksteel Monolith','Omniscience']){
 const s=table([at(0,'battlefield',source),at(0,'hand','Forest')]);
 eq(offers(s,'Forest').length,0,`${source} cannot cast a land`);
 eq(legalActions(s,0).filter(a=>a.kind==='play-land'&&a.label==='Forest').length,1,'ordinary land play remains available');
}
// A later turn cannot reuse Quintorius's permission, and free casting still pays additional costs.
{
 const d=JSON.parse(fs.readFileSync(new URL('../game/engine/cards/q/quintorius-loremaster.scenarios.json',import.meta.url)));
 const scenario=structuredClone(d.scenarios[1]);scenario.steps=scenario.steps.slice(0,-2);scenario.steps.push({to:{turn:5,phase:'MAIN1'}});scenario.expect=[];
 const s=runScenario(scenario,index.definition,d.fixtures).state;
 eq(offers(s,'Harmonize').length,0,'Quintorius grant expired before the next own turn');
}
{
 const s=table(),id=put(s,'Village Rites','exile');grant(s,id);
 eq(offers(s,'Village Rites').length,0,'mandatory sacrifice still needed for free spell');
 put(s,'Bear');eq(offers(s,'Village Rites').length>0,true,'sacrifice available makes free spell possible');
}
{
 const s=table(),id=put(s,'Gift','exile');grant(s,id);grant(s,id);s.effects.shift();grant(s,id);
 eq(new Set(s.effects.map(e=>e.id)).size,s.effects.length,'expiring an earlier permission cannot collide with a later id');
}
// A granted static permission is active even when the permanent had no printed play-from ability.
{
 const s=table(),source=put(s,'Relic');link(s,source,'Zero');
 const permission=index.definition(M).abilities.find(a=>a.kind==='static'&&a.rule==='play-from');
 s.effects=[{id:'grant-play',layer:6,timestamp:1,affects:{ids:[source]},apply:{addAbilities:[permission]}}];
 eq(offers(s,'Zero').length,1,'layer-granted exile permission is offered');
 s.effects=[];eq(offers(s,'Zero').length,0,'ending grant removes the permission');
}
// Closed grammar rejects invented flags; the broad MayPlay catalog construct is deliberately still uncredited.
for(const [key,value] of [['free',false],['graveyardToLibraryBottom',false]]){
 const d=JSON.parse(fs.readFileSync(new URL('../game/engine/cards/q/quintorius-loremaster.json',import.meta.url)));d.abilities[2].effects[0][key]=value;
 eq(compileScript(d).problems.length>0,true,`reject unsupported mayPlay ${key}`);
 const m=JSON.parse(fs.readFileSync(new URL('../game/engine/cards/m/maralen-fae-ascendant.json',import.meta.url)));m.abilities[2][key]=value;
 eq(compileScript(m).problems.length>0,true,`reject unsupported static ${key}`);
}
assert.throws(()=>compileSelector({exiledThisTurn:false}));checks++;
console.log(`engine-exile-commanders: ${checks} checks passed`);
