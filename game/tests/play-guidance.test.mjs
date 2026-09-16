import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendedActions,combatTotals} from '../ui/play-guidance.mjs';
const player=(id,hand=[],battlefield=[])=>({playerId:id,name:'Seat '+id,health:{life:30,status:'active'},zones:{Hand:{cards:hand},Command:{cards:[]},Battlefield:{cards:battlefield}}});

test('invited players receive coaching for their own turn and private hand',()=>{
 const state={turnPlayerId:2,phase:'MAIN1',stackSize:0,players:[player(0),player(2,[{cardId:22,name:'Forest',typeLine:'Basic Land'}])]};
 Object.defineProperty(state.players[0].zones,'Hand',{get(){throw Error('Host private hand read');}});
 assert.equal(recommendedActions(state,{cardActions:{22:'Play land'}},[],2)[0].cardId,22);
 assert.deepEqual(recommendedActions({...state,turnPlayerId:0},{},[],2),[]);
});
test('coaching is phase aware and does not read opposing hands or libraries',()=>{
 const state={turnPlayerId:0,phase:'MAIN1',stackSize:0,players:[player(0,[{cardId:1,name:'Forest',typeLine:'Basic Land'}]),player(1)]};
 Object.defineProperty(state.players[1].zones,'Hand',{get(){throw Error('Private opponent hand read');}});
 assert.match(recommendedActions(state,{cardActions:{1:'Play land'}})[0].title,/Forest/);
 assert.match(recommendedActions(state,{choice:{mode:'draw'}})[0].title,/Draw/);
 state.turnPlayerId=1;assert.deepEqual(recommendedActions(state,{}),[]);
});
test('coaching respects pending stack choices and engine-offered actions',()=>{
 const state={turnPlayerId:0,phase:'MAIN1',stackSize:2,players:[player(0,[{cardId:1,name:'Counterspell',typeLine:'Instant'},{cardId:2,name:'Unavailable',typeLine:'Instant'}])]};
 const advice=recommendedActions(state,{cardActions:{1:'Cast spell'}});assert.equal(advice[1].cardId,1);assert.doesNotMatch(JSON.stringify(advice),/Unavailable/);
 assert.equal(recommendedActions(state,{choice:{title:'Choose targets',mode:'many'}}).length,1);
});
test('combat power distinguishes defenders, infect, commander and already-blocked attackers',()=>{
 const rows=[{attacker:{power:4,commander:true,keywords:['infect','double strike']},defender:{kind:'player',id:1,name:'A'},blocked:false,blockers:[]},{attacker:{power:3},defender:{kind:'player',id:1,name:'A'},blocked:true,blockers:[]},{attacker:{power:2},defender:{kind:'player',id:2,name:'B'},blocked:false,blockers:[{cardId:9}]}];
 assert.deepEqual(combatTotals(rows).map(x=>[x.id,x.power,x.unblockedPower,x.commanderPower,x.infectPower]),[[1,7,4,4,4],[2,2,0,0,0]]);
});
test('flying and ground power partition the attack while trample remains overlapping',()=>{
 const defender={kind:'player',id:0,name:'Rob'};
 const rows=[{power:10,keywords:['flying','trample']},{power:5,keywords:['trample']},{power:5}].map(attacker=>({attacker,defender,blockers:[],blocked:false}));
 const [total]=combatTotals(rows);
 assert.deepEqual([total.power,total.flyingPower,total.groundPower,total.tramplePower],[20,10,10,15]);
});
