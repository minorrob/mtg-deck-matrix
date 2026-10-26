/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-board.js',import.meta.url),'utf8'),logic=source.slice(source.indexOf('  async function ask_('),source.indexOf('  function banner()',source.indexOf('  async function ask_(')));
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
for(const stale of ['account','match','table','none']) {
 let owner='alice',table='table1',resolve;const coach={thread:[],typing:false,asked:0},view={matchId:'m1'},notices=[];
 const ctx=vm.createContext({coach,view,coachGate:{key:'alice|table1',available:true},coachKey:()=>`${owner}|${table}`,tableId:table,stepNow:()=> 'Turn 1',handShared:()=>false,drawCoach:()=>{},say:x=>notices.push(x),fetch:()=>new Promise(r=>resolve=r)});vm.runInContext(logic+';globalThis.ask=ask_;',ctx);
 const pending=ctx.ask('What next?');if(stale==='account')owner='bob';if(stale==='table')table='table2';if(stale==='match')view.matchId='m2';resolve({ok:true,status:200,type:'basic',json:async()=>({answer:'Only Alice should see this reply.'})});await pending;
 eq(coach.typing,false,`${stale}: request releases typing state`);eq(coach.thread.filter(x=>x.from==='coach').length,stale==='none'?1:0,`${stale}: only same account/table/match adopts reply`);eq(notices.length,stale==='none'?1:0,`${stale}: stale answer is not announced`);
}
console.log(`board-coach-context: ${checks} checks passed`);
