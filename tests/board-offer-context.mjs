/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-board.js',import.meta.url),'utf8');
const logic=source.slice(source.indexOf('  const offerData ='),source.indexOf('  const undoOffer ='));
const view={revision:10,matchId:'m1',decision:{id:'priority:1',options:[{index:1,act:'undo-mana',cardId:44},{index:2,act:'undo-play',cardId:45}]}};
const sent=[],ctx=vm.createContext({view,sending:false,socket:{readyState:1},e:String,send:x=>sent.push(x)});vm.runInContext(logic+';globalThis.test={offerData,currentOffer,bindOffer,clear:()=>offeredPending=null};',ctx);
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const data=ctx.test.offerData(view.decision.options[0]);eq(ctx.test.currentOffer(data).cardId,44,'current act and physical card identity resolve');eq(ctx.test.bindOffer(data),true,'current legal untap binds');eq(sent[0].indices[0],1,'original authoritative index is used');eq(ctx.test.bindOffer(data),false,'receipt alone cannot reopen the exact bound offer');ctx.test.clear();
for(const [key,value] of [['revision','9'],['choice','old-choice'],['match','other-match'],['act','cast'],['card','45'],['index','2']])eq(ctx.test.bindOffer({...data,[key]:value}),false,`stale or mismatched ${key} refuses`);
view.revision=11;view.decision.options=[{index:1,act:'cast',cardId:99}];eq(ctx.test.bindOffer(data),false,'an old untap index cannot cast a new unrelated card');eq(sent.length,1,'refused stale offers send nothing');
console.log(`board-offer-context: ${checks} checks passed`);
