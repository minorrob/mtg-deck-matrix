/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-board.js',import.meta.url),'utf8'),logic=source.slice(source.indexOf('  function landKey('),source.indexOf('  function landStack('));
const ctx=vm.createContext({});vm.runInContext(logic+';globalThis.test={landKey,landGroups};',ctx);let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const base={cardId:1,name:'Mountain',types:['Land'],tapped:false,counters:{},attachments:[],owner:0,controller:0};
const group=cards=>ctx.test.landGroups(cards).map(g=>Array.from(g,c=>c.cardId));
eq(JSON.parse(JSON.stringify(group([base,{...base,cardId:2,tapped:true,printing:'other'}]))),[[1,2]],'tap and printing do not split identical physical lands');
for(const delta of [{attachments:[99]},{token:true},{counters:{charge:1}},{types:['Land','Creature'],power:2,toughness:2},{controller:1},{faceDown:true}])eq(group([base,{...base,...delta,cardId:2}]).length,2,'different public permanent state stays separate');
eq(ctx.test.landKey({...base,counters:{a:1,b:2}}),ctx.test.landKey({...base,counters:{b:2,a:1}}),'public object key order does not create a false difference');
eq(group([base,{...base,cardId:2,tapped:true},{...base,cardId:3}])[0].join(','),'1,2,3','original physical member ordering survives taps');
console.log(`board-land-identity: ${checks} checks passed`);
