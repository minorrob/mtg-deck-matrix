/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import Flow from '../crankmagic-choice-flow.js';
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const node=(key,value)=>({key,value,label:String(value)});
const context={match:'test',revision:5,seat:0,choice:'priority:5'};
function leaves(flow) {
  const s=Flow.step(flow);
  if(s.status==='confirm')return [Flow.answer(flow,context).indices[0]];
  assert.equal(s.status,'choose');
  return s.choices.flatMap(c=>leaves(Flow.select(flow,c.id)));
}
const rows=[{index:10,label:'Protect',path:[node('mode','Protect'),node('target',11),node('mana',21)]},
  {index:30,label:'Protect',path:[node('mode','Protect'),node('target',12),node('mana',22)]},
  {index:90,label:'Draw',path:[node('mode','Draw'),node('mana',21)]}];
let flow=Flow.create(rows,context);
eq(Flow.step(flow).choices.map(x=>x.label),['Protect','Draw'],'first layer hides targets and mana');
eq(Flow.answer(flow,context),null,'no incomplete answer');
flow=Flow.select(flow,Flow.step(flow).choices[0].id);
eq(Flow.step(flow).choices.map(x=>x.label),['11','12'],'mode reveals only its targets');
flow=Flow.select(flow,Flow.step(flow).choices[0].id);
eq(Flow.step(flow).trail.at(-1).automatic,true,'one payment is selected automatically');
eq(Flow.answer(flow,context),{indices:[10]},'confirmation returns exact sparse index');
eq(Flow.answer(flow,{...context,revision:6}),null,'stale revision refused');
eq(Flow.answer(flow,{...context,match:'other'}),null,'different match refused');
eq(Flow.answer(flow,{...context,seat:1}),null,'different seat refused');
eq(Flow.step(Flow.back(flow)).choices.map(x=>x.label),['11','12'],'back removes target and dependent mana');
eq(leaves(Flow.create(rows,context)).sort((a,b)=>a-b),[10,30,90],'all and only original leaves');
eq(leaves(Flow.create([{index:0,label:'A',path:[]},{index:1,label:'B',path:[]}],context)),[0,1],'identical paths preserve both original actions');
eq(leaves(Flow.create([{index:0,label:'Done',path:[]},{index:1,label:'More',path:[node('next','More')]}],context)),[0,1],'short branch alongside deeper branch');
assert.throws(()=>Flow.select(flow,'not offered'));checks++;
eq(Flow.step({...flow,selections:[...flow.selections,'stale']}).status,'invalid','invalid extra answer cannot commit');
eq(leaves(Flow.create([{index:4,label:'A',path:[node('$answer',1),node('target',2)]},{index:8,label:'B',path:[node('$answer',1),node('target',3)]}],context)),[4,8],'caller node keys cannot masquerade as terminal answers');
let seed=20261029;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for(let run=0;run<200;run++){
 const options=Array.from({length:1+random(80)},(_,i)=>({index:i*3+1,label:`Choice ${i}`,path:Array.from({length:random(7)},(_,d)=>node(`layer:${d}`,random(5)))}));
 eq(leaves(Flow.create(options,context)).sort((a,b)=>a-b),options.map(o=>o.index),'seeded ragged-tree reachability');
}
console.log(`choice-flow: ${checks} checks passed (200 seeded conditional trees)`);
