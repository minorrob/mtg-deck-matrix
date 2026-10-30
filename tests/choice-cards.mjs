/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import Flow from '../crankmagic-choice-flow.js';
import {loadCardIndex,loadCardScenarios} from '../game/tools/engine-cards.mjs';
import {runScenario} from '../game/engine/cards/scenario.mjs';
import {legalActions,applyAction} from '../game/engine/rules/actions.mjs';
import {awaitingChoice} from '../game/engine/rules/turn.mjs';
import {decisionPath} from '../game/room/decision-path.mjs';
import {describeDecision} from '../game/room/decision.mjs';
import {projectFor} from '../game/engine/projection.mjs';
const index=loadCardIndex(),catalog=loadCardScenarios();
const representatives=['Vigorbloom Charm','Boros Charm','Austere Command','Shadrix Silverquill','Aetheric Amplifier',
 'Brago, King Eternal','Plumb the Forbidden','Force of Will','Village Rites','Swords to Plowshares',
 'Reclamation Sage','Bala Ged Recovery // Bala Ged Sanctuary','Dig Through Time','Gather Courage','Martial Coup','Purphoros\'s Intervention','Eldrazi Confluence','Moment of Reckoning','Collective Effort','Monstrous Onslaught','Ponder'];
const selected=representatives.map(name=>{const entry=catalog.find(c=>c.scenarios.card===name);assert.ok(entry,`Representative exists: ${name}`);return entry;});
let seed=20261029;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const pool=catalog.filter(c=>!selected.includes(c) && c.scenarios.scenarios.length);
const sampled=Array.from({length:32},()=>pool.splice(random(pool.length),1)[0]);
let checks=0,scenarios=0,decisions=0,leaves=0;const kinds=new Set(),collisions=[];
function verify(state) {
 let actions=null,choice=awaitingChoice(state);
 if(!choice && state.priorityPlayer!==null){actions=legalActions(state,state.priorityPlayer);choice={id:'priority:test',kind:'priority',mode:'one',min:1,max:1,options:actions.map((a,index)=>({index,label:a.label || a.kind,act:a.kind,cardId:a.objectId}))};}
 if(!choice?.options?.length)return;
 const original=JSON.stringify(state),d=describeDecision(state,choice,actions,projectFor(state,state.awaiting?.player ?? state.priorityPlayer ?? 0));
 assert.equal(JSON.stringify(state),original,'projection never changes game state');checks++;
 assert.deepEqual(d.options.map(o=>o.index),choice.options.map(o=>o.index));checks++;
 if(!['one','boolean','index'].includes(d.mode))return;
 decisions++;
 const context={match:state.matchId,revision:1,seat:state.awaiting?.player ?? state.priorityPlayer,choice:d.id};
 const groups=new Map();for(const o of d.options){const key=JSON.stringify(o.decisionPath);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o.index);}
 for(const ids of groups.values())if(ids.length>1 && collisions.length<12)collisions.push({choice:d.id,actions:ids.map(id=>actions?.[id] || d.options.find(o=>o.index===id))});
 const flow=Flow.create(d.options.map(o=>({index:o.index,label:o.label,path:o.decisionPath})),context);
 const found=[];
 function walk(f){const s=Flow.step(f);s.trail.forEach(n=>kinds.add(n.kind));if(s.status==='confirm'){found.push(Flow.answer(f,context).indices[0]);return;}assert.equal(s.status,'choose');for(const c of s.choices)walk(Flow.select(f,c.id));}
 walk(flow);leaves+=found.length;
 assert.deepEqual(found.sort((a,b)=>a-b),d.options.map(o=>o.index).sort((a,b)=>a-b),'exact legal leaf equivalence');checks++;
 return d;
}
for(const entry of [...selected,...sampled]){
 for(const scenario of entry.scenarios.scenarios){
  runScenario(scenario,index.definition,entry.scenarios.fixtures || {});scenarios++;checks++;
  // Observe the real states before and after each scripted decision, including pending costs and triggers.
  for(let i=0;i<=scenario.steps.length;i++){
   const {state}=runScenario({...scenario,steps:scenario.steps.slice(0,i),expect:[]},index.definition,entry.scenarios.fixtures || {});
   verify(state);
  }
 }
}
// Vigorbloom: real legal modes, two separate fight targets, and more than one mana source/payment.
const setup=[{seat:0,zone:'hand',cards:['Vigorbloom Charm']},
 {seat:0,zone:'battlefield',cards:['Forest','Forest','Plains','Sunpetal Grove','Bear','Llanowar Elves']},
 {seat:1,zone:'battlefield',cards:['Bear','Llanowar Elves']}];
const {state}=runScenario({name:'Layered Vigorbloom',pooledTaps:true,xTaps:true,setup,steps:[]},index.definition,selected[0].scenarios.fixtures);
const actions=legalActions(state,0).filter(a=>a.kind==='cast');
const choice={id:'priority:vigorbloom',kind:'priority',mode:'one',min:1,max:1,options:actions.map((a,index)=>({index,label:a.label,cardId:a.objectId,act:a.kind}))};
const d=describeDecision(state,choice,actions,projectFor(state,0));
const ctx={match:'vigorbloom',revision:1,seat:0,choice:d.id};
const initial=Flow.step(Flow.create(d.options.map(o=>({index:o.index,label:o.label,path:o.decisionPath})),ctx));
assert.equal(initial.choices.length,3,'Vigorbloom starts with exactly three modes');checks++;
assert.ok(initial.choices.every(c=>c.kind==='mode'),'first choice is mode only');checks++;
const fight=actions.find(a=>a.modes?.[0]===2);assert.ok(fight);checks++;
applyAction(state,0,fight);
const payment=verify(state);
assert.equal(payment?.cost,'mana','cast asks which mana sources to tap');checks++;
assert.ok(payment.options.every(o=>o.decisionPath.some(n=>n.kind==='mana-source')),'payment has structured sources');checks++;
assert.ok(payment.options.every(o=>o.decisionPath.some(n=>n.kind==='mana')),'payment preserves output and spending');checks++;
assert.ok(payment.options.some(o=>o.decisionPath.find(n=>n.key==='mana-payment')?.reviewLabel===''),'fully sourced payment does not repeat its total in review');checks++;
assert.deepEqual(collisions,[],'representative and sampled actions have distinct structured paths');checks++;
const extra=decisionPath({objects:{1:{card:'Forest'}},players:[]},{cost:'mana'},{taps:[{id:1,color:'G'}],payment:{mana:{G:1,U:1},life:2}},null,null).at(-1);
assert.equal(extra.reviewLabel,'{U} and 2 life','only additional pool spending and life remain in review');checks++;
assert.equal(extra.label,'{U}{G} and 2 life','original full payment label remains unchanged');checks++;
const surplus=decisionPath({objects:{1:{card:'Azorius Signet'}},players:[]},{cost:'mana'},{taps:[{id:1,color:'W:1+U:1'}],payment:{mana:{W:1},life:0}},null,null).at(-1);
assert.equal(surplus.reviewLabel,'{W}','surplus output keeps the chosen color spent visible');checks++;
const surplusOther=decisionPath({objects:{1:{card:'Azorius Signet'}},players:[]},{cost:'mana'},{taps:[{id:1,color:'W:1+U:1'}],payment:{mana:{U:1},life:0}},null,null).at(-1);
assert.equal(surplusOther.reviewLabel,'{U}','different spending from the same output remains distinguishable');checks++;
const report={seed:20261029,representatives,sampled:sampled.map(x=>x.scenarios.card),scenarios,decisions,leaves,checks,kinds:[...kinds].sort(),collisions};
if(process.env.CHOICE_REPORT){mkdirSync(path.dirname(process.env.CHOICE_REPORT),{recursive:true});writeFileSync(process.env.CHOICE_REPORT,JSON.stringify({report,vigorbloom:{state:projectFor(state,0),decision:d,payment}},null,2));}
console.log(JSON.stringify(report,null,2));
