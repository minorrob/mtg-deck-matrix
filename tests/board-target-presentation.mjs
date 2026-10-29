/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const code=readFileSync(new URL('../crankmagic-board.js',import.meta.url),'utf8');
const helpers=code.slice(code.indexOf('  const visibleSpell ='),code.indexOf('  let targetPage ='));
const heading=code.slice(code.indexOf('  function targetHeading('),code.indexOf('  function targetReview('));
const cards=[{cardId:1,name:'Unrelated commander',types:['Creature'],controller:0},{cardId:50,name:'Pinger',types:['Creature'],controller:1}];
const view={seat:0,state:{stack:[{stackId:1,cardId:50,name:'Pinger',kind:'ability',playerId:1,faceDown:false}]}};
const ctx=vm.createContext({view,isYou:i=>view.spectator!==true&&i===view.seat,findCard:id=>cards.find(c=>c.cardId===id)||null,players:()=>[{playerId:0,name:'Rob'},{playerId:1,name:'Keith'}],nameOf:id=>id===0?'You':'Keith',e:String});
vm.runInContext(helpers+heading+';globalThis.read={targetCard,targetName,targetHeading};',ctx);let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const t={kind:'ability',id:1,controllerId:1};
eq(ctx.read.targetCard(t).cardId,50,'ability stack id never resolves an unrelated object with the same id');
eq(ctx.read.targetName(t),'Pinger ability','ability wording remains explicit');
eq(ctx.read.targetCard({kind:'object',id:1}).cardId,1,'ordinary object identity remains unchanged');
const d={id:'trigger-targets:9',title:'Counter target activated ability?',options:[]},o={effect:'Counter',targetGroups:[{index:0,effect:'Counter',targets:[t]}]};
assert.match(ctx.read.targetHeading(d,o),/Counter Keith's Pinger ability/);checks++;
assert.match(ctx.read.targetHeading({...d,sourceId:1},o),/Counter Keith's Pinger ability/);checks++;
cards.pop();eq(ctx.read.targetCard(t),null,'departed source has no substitute art or new-zone lookup');
view.state.stack=[];eq(ctx.read.targetCard(t),null,'missing ability does not fall through to object namespace');assert.match(ctx.read.targetHeading(d,o),/Counter target activated ability/);checks++;
console.log(`board-target-presentation: ${checks} checks passed`);
