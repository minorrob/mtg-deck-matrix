import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivePoller} from '../ui/live-poll.mjs';
const until=async check=>{const deadline=Date.now()+2000;while(!check()){assert.ok(Date.now()<deadline,'Timed out');await new Promise(r=>setTimeout(r,3));}};

test('a failed read reconnects and applies the next authoritative view',async t=>{
  let reads=0;const applied=[],errors=[];
  const poller=createLivePoller({read:async()=>{if(++reads===1)throw TypeError('Failed to fetch');return {revision:reads};},apply:v=>applied.push(v),onError:(e,state)=>errors.push(state),interval:()=>5,retryDelay:()=>5});
  t.after(()=>poller.stop());await poller.start();await until(()=>applied.length);
  assert.equal(errors.length,1);assert.equal(errors[0].fatal,false);assert.equal(applied[0].revision,2);assert.equal(poller.isRunning(),true);
});

test('a revoked session stops reconnect attempts and surfaces the access error',async()=>{
  let reads=0,reported;const poller=createLivePoller({read:async()=>{reads++;throw Object.assign(Error('Seat membership expired'),{status:403});},apply:()=>assert.fail(),onError:(error,state)=>{reported={error,state};},retryDelay:()=>1});
  await poller.start();await new Promise(r=>setTimeout(r,15));assert.equal(reads,1);assert.equal(poller.isRunning(),false);assert.equal(reported.state.fatal,true);assert.match(reported.error.message,/expired/);
});

test('a late result from a closed match cannot replace the next match',async t=>{
  let resolveOld,signal,reads=0;const applied=[];
  const poller=createLivePoller({read:async s=>{reads++;if(reads===1){signal=s;return new Promise(r=>{resolveOld=r;});}return {matchId:'new'};},apply:v=>applied.push(v),onError:()=>assert.fail(),interval:()=>1000});
  t.after(()=>poller.stop());const old=poller.start();await until(()=>resolveOld);poller.stop();assert.equal(signal.aborted,true);
  await poller.start();resolveOld({matchId:'old'});await old;assert.deepEqual(applied,[{matchId:'new'}]);
});

test('repeated starts keep one polling loop',async t=>{
  let reads=0;const poller=createLivePoller({read:async()=>++reads,apply:()=>{},onError:()=>assert.fail(),interval:()=>1000});
  t.after(()=>poller.stop());await Promise.all([poller.start(),poller.start(),poller.start()]);assert.equal(reads,1);
});
