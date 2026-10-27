/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-board.js',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf('  async function fileResult('),source.indexOf('  function send(payload)'));
let checks=0; const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const record={schema:'CrankMagicTableResult@1',id:'game:table:m1:s0',tableId:'t1',matchId:'m1',seatId:'s0',source:{deckId:'d1',deckVersion:4},playedAt:'2026-10-26T12:00:00.000Z',outcome:'win',finishReason:'last standing',finishRank:1,turns:8,pod:2,seat:1,ai:true,opponents:[{seatId:'s1',name:'Maya',commanders:['Meren'],ai:true}]};
function setup({records=[record],expected=true,failOnce=false,writerFalseOnce=false}={}) {
  const commands=[],timers=[],notices=[],reads=[],forwarded=[];
  const view={matchId:'m1',seatId:'s0',seat:0,status:'finished',state:{turn:8},seats:[{pilot:'human'},{pilot:'house'}],...(expected?{resultRecordExpected:true}:{})};
  let account='rob@example.com';
  const C={signedInAs:()=>account,state:{decks:[{id:'d1',name:'Test deck'}],games:[]},notice:(...a)=>notices.push(a),commit:async c=>{commands.push(c);if(failOnce){failOnce=false;throw {retryable:true,message:'offline'};}C.state.games.push({id:c.gameId});}};
  const table={tableId:'t1',seats:[{you:true,source:{deckId:'d1',deckVersion:4}},{name:'Maya',kind:'ai',deck:{commander:['Meren']}}]};
  const context=vm.createContext({C,table,tableId:table.tableId,view,resultEpoch:0,filed:new Set(),outcomeOf:()=>({outcome:'win',reason:'last standing'}),tableApi:()=>({fileResult:async(r,c)=>{forwarded.push({record:r,context:c});if(writerFalseOnce){writerFalseOnce=false;return false;}await C.commit({gameId:r.id,playedAt:r.playedAt,outcome:r.outcome,finish:r.finishRank,turns:r.turns,pod:r.pod,seat:r.seat,table:{deckVersion:r.source.deckVersion}});return true;},tableUrl:id=>'/api/tables/'+id,api:async(method,url)=>{reads.push([method,url]);return {table:{gameRecord:records.shift()}};}}),setTimeout:fn=>timers.push(fn)});
  vm.runInContext(implementation+';globalThis.run=fileResult',context);
  return {run:()=>context.run(view),commands,timers,notices,reads,forwarded,C,context,setAccount:v=>account=v};
}
{
  const t=setup();await t.run();eq(t.reads.length,1,'refresh before first write');eq(t.commands.length,1,'one result written');
  eq(t.forwarded[0].record,record,'verified record forwarded intact to shared writer');eq(JSON.parse(JSON.stringify(t.forwarded[0].context)),{account:'rob@example.com',tableId:'t1',matchId:'m1',seatId:'s0'},'shared writer receives captured owner and context');
  const c=t.commands[0];eq([c.gameId,c.playedAt,c.outcome,c.finish,c.turns,c.pod,c.seat],['game:table:m1:s0',record.playedAt,'win',1,8,2,1],'stable identity and server values');
  eq(c.table.deckVersion,4,'deck provenance preserved');await t.run();eq(t.commands.length,1,'duplicate view cannot write twice');
}
{
  const t=setup({records:[undefined,record]});await t.run();eq(t.commands.length,0,'pending new summary never uses client date');eq(t.timers.length,1,'pending summary schedules retry');await t.timers.shift()();eq(t.commands[0].playedAt,record.playedAt,'retry forwards dated summary to writer');
}
{
  const t=setup({records:[{...record,seatId:'s1'},record]});await t.run();eq(t.commands.length,0,'another seat summary is rejected');await t.timers.shift()();eq(t.commands.length,1,'correct seat can subsequently file');
}
{
  const t=setup({records:[{...record,matchId:'older'},record]});await t.run();eq(t.commands.length,0,'another match summary is rejected');await t.timers.shift()();eq(t.commands.length,1,'correct match subsequently files');
}
{
  const t=setup({records:[undefined],expected:false});await t.run();eq(t.commands.length,1,'legacy table retains fallback');assert.ok(!Number.isNaN(Date.parse(t.commands[0].playedAt)));checks++;
}
{
  const t=setup({records:[record,record],failOnce:true});await t.run();eq(t.C.state.games.length,0,'failed commit is not success');eq(t.timers.length,1,'retryable commit schedules retry');await t.timers.shift()();eq(t.C.state.games.length,1,'retry commits once');eq(t.commands[1].playedAt,record.playedAt,'retry preserves authoritative time');
}
{
  const t=setup({records:[undefined,record]});await t.run();t.context.tableId='t2';t.context.resultEpoch++;
  await t.timers.shift()();eq(t.commands.length,0,'switching tables drops reserved finished retry');
}
{
  const t=setup({records:[undefined,record]});await t.run();t.setAccount('maya@example.com');
  await t.timers.shift()();eq(t.commands.length,0,'switching accounts drops reserved retry despite matching deck id');
}
{
  const t=setup();let resolve;t.context.tableApi=()=>({tableUrl:id=>'/api/tables/'+id,api:()=>new Promise(r=>resolve=r)});
  const run=t.run();t.setAccount('maya@example.com');resolve({table:{gameRecord:record}});await run;
  eq(t.commands.length,0,'account switch during GET cannot write into new library');
}
{
  const t=setup();let resolve;t.context.tableApi=()=>({tableUrl:id=>'/api/tables/'+id,api:()=>new Promise(r=>resolve=r)});
  const run=t.run();t.context.view={...t.context.view,matchId:'m2'};resolve({table:{gameRecord:record}});await run;
  eq(t.commands.length,0,'rematch during GET discards stale summary');
}
{
  const t=setup({records:[undefined,record]});await t.run();t.context.attached=false;await t.timers.shift()();
  eq(t.commands.length,1,'mere detach retains valid finished retry');
}
{
  const t=setup({records:[record,record],writerFalseOnce:true});await t.run();eq(t.commands.length,0,'shared writer false does not claim success');eq(t.timers.length,1,'valid context retries a failed shared write');await t.timers.shift()();eq(t.commands.length,1,'shared write retry eventually files once');
}
console.log(`board-result-bridge: ${checks} checks passed`);
