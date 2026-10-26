/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-board.js',import.meta.url),'utf8'),logic=source.slice(source.indexOf('  const canAsk ='),source.indexOf('  function banner()',source.indexOf('  async function ask_(')));
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
for(const stale of ['account','match','table','none']) {
 let owner='alice',table='table1',resolve;const coach={thread:[],typing:false,asked:0},view={matchId:'m1'},notices=[];
 const ctx=vm.createContext({coach,view,coachGate:{key:'alice|table1',available:true},coachKey:()=>`${owner}|${table}`,tableId:table,stepNow:()=> 'Turn 1',handShared:()=>false,drawCoach:()=>{},say:x=>notices.push(x),fetch:()=>new Promise(r=>resolve=r)});vm.runInContext(logic+';globalThis.ask=ask_;',ctx);
 const pending=ctx.ask('What next?');if(stale==='account')owner='bob';if(stale==='table')table='table2';if(stale==='match')view.matchId='m2';resolve({ok:true,status:200,type:'basic',json:async()=>({answer:'Only Alice should see this reply.'})});await pending;
 eq(coach.typing,false,`${stale}: request releases typing state`);eq(coach.thread.filter(x=>x.from==='coach').length,stale==='none'?1:0,`${stale}: only same account/table/match adopts reply`);eq(notices.length,stale==='none'?1:0,`${stale}: stale answer is not announced`);
}

{
 let submit,resolve,requests=0;const coach={thread:[],typing:false,asked:0},input={value:'First question'},view={matchId:'m1'},start=source.indexOf('  document.addEventListener("submit", (event) => {',source.indexOf('actions["board-coach-clear"]')),submitSource=source.slice(start,source.indexOf('  /* HISTORY',start));
 const ctx=vm.createContext({coach,view,coachGate:{key:'alice|table1',available:true},coachKey:()=> 'alice|table1',tableId:'table1',stepNow:()=> 'Turn 1',handShared:()=>false,drawCoach(){},say(){},document:{addEventListener:(_,fn)=>submit=fn},fetch:()=>{requests++;return new Promise(r=>resolve=r);}});vm.runInContext(logic+submitSource,ctx);
 const event={preventDefault(){},target:{matches:()=>true,querySelector:()=>input}};submit(event);eq(input.value,'','accepted first question clears its submitted text');input.value='Follow-up draft while pending';submit(event);eq(requests,1,'pending submit does not make a duplicate provider request');eq(input.value,'Follow-up draft while pending','pending submit preserves editable follow-up draft');resolve({ok:true,status:200,type:'basic',json:async()=>({answer:'First reply'})});await new Promise(r=>setImmediate(r));eq(input.value,'Follow-up draft while pending','reply preserves the pending follow-up draft');
}
for(const failure of ['response','rejection']) {
 const a=source.indexOf('  function probeCoach()'),probeSource=source.slice(a,source.indexOf('  function drawCoach()',a)),pending=[];
 const ctx=vm.createContext({coachGate:{key:null,available:false},coachInput:null,coach:{thread:[],typing:false,asked:0},coachKey:()=> 'alice|table1',drawCoach(){},fetch:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});vm.runInContext(probeSource+';globalThis.probe=probeCoach;',ctx);
 ctx.probe();vm.runInContext('coachInput=null;coachGate={key:null,available:false};coach.thread=[];coach.typing=false;coach.asked++;',ctx);ctx.probe();pending[1].resolve({ok:true,json:async()=>({open:true})});await new Promise(r=>setImmediate(r));eq(ctx.coachGate.available,true,`${failure}: fresh same-table capability is enabled`);if(failure==='response')pending[0].resolve({ok:false,status:503});else pending[0].reject(new Error('old probe failed'));await new Promise(r=>setImmediate(r));eq(ctx.coachGate.available,true,`${failure}: old same-key capability cannot overwrite fresh probe`);
}
console.log(`board-coach-context: ${checks} checks passed`);
