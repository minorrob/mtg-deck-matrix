/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareAdvice,changedDeckSummaries,acceptAdvice} from '../cloud/advice-contract.mjs';
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const throws=(fn,re)=>{assert.throws(fn,re);checks++;};
const rejects=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const source={kind:'summary',ownerId:'account-a',subjectId:'deck-a',revision:2,policyVersion:'rules-1/measure-1',
 cards:[{id:'sol-ring',name:'Sol Ring',quantity:1}],facts:[{id:'lands',text:'36 lands measured from the current main list.'}],
 email:'private@example.test',apiKey:'never-transmit',lots:[{price:19}],opponentHand:[{name:'Hidden card'}]};
const before=JSON.stringify(source),task=await prepareAdvice(source);
eq(JSON.stringify(source),before,'preparation never mutates the library input');
eq(/account-a|private@example|never-transmit|Hidden card|price/.test(JSON.stringify(task.input)),false,'only bounded facts/cards are provider input; owner identity and unrelated private fields are absent');
eq(Object.isFrozen(task.input.cards[0]),true,'prepared evidence is immutable');
const reply={summary:'A measured starting point.',findings:[{kind:'suggestion',text:'Review the land count against the deck plan.',evidenceIds:['lands'],cardIds:['sol-ring']}]};
const accepted=acceptAdvice(task,reply,task);
eq(accepted.label,'AI interpretation','prose is labeled as interpretation');
eq(accepted.suggestedOptionId,null,'summary cannot apply a change');
eq(Object.isFrozen(accepted.findings[0].evidenceIds),true,'accepted citations are immutable');
for(const field of ['ownerId','subjectId','revision','policyVersion']){
 const changed={...source,[field]:field==='revision'?3:source[field]+'-changed'};
 const current=await prepareAdvice(changed);eq(current.cacheKey!==task.cacheKey,true,`${field} invalidates cached advice`);
 throws(()=>acceptAdvice(task,reply,current),/Stale/);
}
for(const changed of [{cards:[{id:'sol-ring',name:'Sol Ring',quantity:2}]},{facts:[{id:'lands',text:'35 lands measured from the current main list.'}]}]){
 const current=await prepareAdvice({...source,...changed});eq(current.cacheKey!==task.cacheKey,true,'changed content invalidates even an unchanged revision');
}
const two={...source,cards:[...source.cards,{id:'forest',name:'Forest',quantity:36}],facts:[...source.facts,{id:'curve',text:'Measured average mana value: 3.1.'}]};
eq((await prepareAdvice(two)).cacheKey,(await prepareAdvice({...two,cards:[...two.cards].reverse(),facts:[...two.facts].reverse()})).cacheKey,'cosmetic row order does not spend again');
eq(changedDeckSummaries([task,task],[task.cacheKey]),[],'unchanged and already summarized decks skipped');
eq(changedDeckSummaries([task,task]),[task],'duplicates coalesced in a daily batch');
const other=await prepareAdvice({...source,subjectId:'deck-b'});eq(changedDeckSummaries([task,other],[],1),[task],'batch work bounded');
throws(()=>changedDeckSummaries([task],[],0),/batch limit/);
for(const response of [{...reply,apply:{deleteDeck:true}},{...reply,findings:[{...reply.findings[0],evidenceIds:['invented-event']}]},{...reply,findings:[{...reply.findings[0],cardIds:['unknown-card']}]},{...reply,suggestedOptionId:'delete'},{...reply,findings:[]},{...reply,findings:[{...reply.findings[0],evidenceIds:[]}]}])throws(()=>acceptAdvice(task,response,task),/Unexpected|Ungrounded|Unavailable|grounded/);
const live=await prepareAdvice({...source,kind:'live',subjectId:'game-a/seat-0',options:[{id:'revision2/pass',label:'Pass priority'}]});
eq(acceptAdvice(live,{...reply,suggestedOptionId:'revision2/pass'},live).suggestedOptionId,'revision2/pass','live help can suggest a current engine-offered option');
throws(()=>changedDeckSummaries([live]),/summary batch/);
throws(()=>acceptAdvice(live,{...reply,suggestedOptionId:'cast-made-up'},live),/Unavailable/);
const nextDecision=await prepareAdvice({...source,kind:'live',subjectId:'game-a/seat-0',options:[{id:'revision2/draw',label:'Draw'}]});
throws(()=>acceptAdvice(live,reply,nextDecision),/Stale/);
const rec=await prepareAdvice({...source,kind:'recommendations',eligibleCards:[{id:'forest',name:'Forest'}]});
eq(acceptAdvice(rec,{...reply,findings:[{...reply.findings[0],cardIds:['forest']}]},rec).findings[0].cardIds,['forest'],'recommendations restricted to deterministically eligible candidates');
const critique=await prepareAdvice({...source,kind:'critique',subjectId:'game-a/seat-0',facts:[{id:'event-17',text:'Turn 4: passed with one mana available.'}]});
throws(()=>acceptAdvice(critique,reply,critique),/Ungrounded/);
eq(acceptAdvice(critique,{...reply,findings:[{...reply.findings[0],evidenceIds:['event-17']}]},critique).findings.length,1,'critique cites the visible recorded event');
for(const changed of [{kind:'apply'},{facts:[]},{cards:[{...source.cards[0],quantity:-1}]},{cards:[...source.cards,...source.cards]},{facts:[...source.facts,...source.facts]},{options:[{id:'pass',label:'Pass'}]},{eligibleCards:[{id:'forest',name:'Forest'}]},{kind:'live',options:[]}])await rejects(()=>prepareAdvice({...source,...changed}),/Unknown|needs|Invalid|Duplicate|Only/);
await rejects(()=>prepareAdvice({...source,facts:Array.from({length:80},(_,i)=>({id:String(i),text:'界'.repeat(400)}))}),/byte budget/);
const code=readFileSync(new URL('../cloud/advice-contract.mjs',import.meta.url),'utf8');
eq(/\bfetch\s*\(|setInterval\s*\(|applyAction\s*\(|process\.env/.test(code),false,'preparation contract contains no provider transport, timer, engine action or credential lookup');
eq(JSON.stringify(source),before,'acceptance never edits the original library snapshot');
console.log(`advice-contract: ${checks} checks passed; no provider calls or state writes`);
