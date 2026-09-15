import test from 'node:test';
import assert from 'node:assert/strict';
import {assertEngineFieldsPreserved} from '../tools/check-bridge-parity.mjs';
const engine={revision:12,state:{players:[{zones:{Battlefield:{count:1,cards:[{cardId:7,tapped:true,power:4}]}}}],stackSize:1},ui:{choice:{id:'target',options:[{index:0,label:'A'},{index:1,label:'B'}]}}};
test('artwork enrichment preserves all authoritative fields',()=>{
 const browser=structuredClone(engine);browser.state.players[0].zones.Battlefield.cards[0].art='local-art';browser.telemetry={events:[]};
 assert.doesNotThrow(()=>assertEngineFieldsPreserved(engine,browser));
});
test('parity check detects dropped, altered and reordered engine data',()=>{
 for(const mutate of [v=>delete v.state.stackSize,v=>v.state.players[0].zones.Battlefield.cards[0].tapped=false,v=>v.ui.choice.options.reverse(),v=>v.ui.choice.options.pop()]){
  const browser=structuredClone(engine);mutate(browser);assert.throws(()=>assertEngineFieldsPreserved(engine,browser));
 }
});
