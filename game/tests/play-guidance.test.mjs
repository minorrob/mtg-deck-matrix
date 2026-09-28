import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendedActions,combatTotals,incomingAt} from '../ui/play-guidance.mjs';
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

test('what is coming at one seat, and of what kind', () => {
  const atk = (name, power, keywords, defenderId, blockers = []) =>
    ({attacker: {cardId: name.length, name, power, toughness: power, keywords}, defender: {kind: 'player', id: defenderId, name: 'Seat ' + defenderId}, blocked: blockers.length > 0, blockers});
  const attacks = [
    atk('Odric', 3, ['first strike'], 0),
    atk('Serra', 4, ['flying', 'deathtouch'], 0),
    atk('Hornet', 2, ['infect'], 1),          // a different seat entirely
    atk('Walls', 5, ['trample'], 0, [{cardId: 9}]),
  ];
  const me = incomingAt(attacks, 0);
  assert.equal(me.attackers.length, 3, 'only the attacks aimed at this seat');
  assert.equal(me.total.power, 12, '3 + 4 + 5');
  assert.equal(me.total.unblockedPower, 7, 'the blocked 5 does not count as incoming');
  assert.equal(me.total.flyingPower, 4);
  assert.deepEqual(me.keywords, ['deathtouch', 'first strike', 'flying', 'trample'],
    'the keywords that change what the damage does, not just how much');
  assert.equal(me.firstStrike, true);
  assert.equal(me.deathtouch, true);
  assert.equal(incomingAt(attacks, 3).total, null, 'a seat nobody is attacking');
  assert.deepEqual(incomingAt([], 0).attackers, []);
});

/* Rob, 2026-09-21: "There are definitely more damage types than just those. Have to consider
 * first strike, double strike, and similar." Double strike is the one that is arithmetic rather
 * than labeling -- it deals its power in the first-strike step and again in the normal step, so
 * a raw power total is simply wrong about how much is coming. */
test('double strike is counted twice, because it hits twice', () => {
  const atk = (name, power, keywords, blockers = []) =>
    ({attacker: {cardId: name.length, name, power, toughness: power, keywords}, defender: {kind: 'player', id: 0, name: 'You'}, blocked: blockers.length > 0, blockers});
  const one = incomingAt([atk('Mirran Crusader', 2, ['double strike'])], 0);
  assert.equal(one.total.power, 2, 'raw power is still raw power');
  assert.equal(one.potential, 4, 'but 2 power with double strike deals 4');
  assert.equal(one.unblockedPotential, 4);
  assert.equal(one.firstStrike, true, 'double strike includes a first-strike step');

  const blocked = incomingAt([atk('Mirran Crusader', 2, ['double strike'], [{cardId: 9}])], 0);
  assert.equal(blocked.potential, 4, 'the attack is still worth 4');
  assert.equal(blocked.unblockedPotential, 0, 'but none of it is currently getting through');

  /* Keywords arrive from the engine; nothing here may depend on their casing. */
  const shouty = incomingAt([atk('Loud', 3, ['Double Strike', 'DEATHTOUCH'])], 0);
  assert.equal(shouty.potential, 6);
  assert.equal(shouty.deathtouch, true);
  assert.deepEqual(shouty.keywords, ['deathtouch', 'double strike']);
});
