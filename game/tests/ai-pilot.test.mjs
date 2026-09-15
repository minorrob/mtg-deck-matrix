import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPilotCandidates,compactPilotObservation,publicThreatAssessment,createApiPilotRunner} from '../tools/ai-pilot.mjs';

const player=(playerId,name,cards=[],hand=[])=>({playerId,name,life:40,health:{life:40,poison:0},mana:[],zones:{Hand:{count:hand.length,cards:hand},Library:{count:90,cards:[]},Battlefield:{count:cards.length,cards},Graveyard:{count:0,cards:[]},Exile:{count:0,cards:[]},Command:{count:1,cards:[]}}});
const view={revision:7,state:{turn:3,phase:'MAIN1',turnPlayerId:1,priorityPlayerId:1,stack:[],players:[player(0,'Host',[{cardId:10,name:'Anointed Procession',typeLine:'Enchantment',oracleText:'If an effect would create one or more tokens under your control, it creates twice that many instead.'}]),player(1,'AI',[],[{cardId:20,name:'Naturalize',typeLine:'Instant',oracleText:'Destroy target artifact or enchantment.'}])]},ui:{prompt:'Priority:',ok:'OK',okEnabled:true,cancel:'End Turn',cancelEnabled:true,cardActions:{20:'Cast Naturalize'},selectables:[],highlightedPlayers:[],actionInFlight:false}};

test('difficulty scales public engine attention without reading hidden opposing zones',()=>{
  assert.deepEqual(publicThreatAssessment(view.state,1,1),[]);assert.equal(publicThreatAssessment(view.state,1,3)[0].name,'Anointed Procession');assert.ok(publicThreatAssessment(view.state,1,5)[0].score>publicThreatAssessment(view.state,1,3)[0].score);
  const observation=compactPilotObservation(view,1,4);assert.equal(observation.own.hand[0].name,'Naturalize');assert.equal(observation.opponents[0].handCount,0);assert.equal(observation.opponents[0].hand,undefined);
});
test('pilot candidates are exact engine actions for cards, choices, allocations and draws',()=>{
  const actions=buildPilotCandidates(view,1,3);assert.ok(actions.some(c=>c.action.kind==='card'&&c.action.targetId===20));assert.ok(actions.some(c=>c.action.kind==='ok'));
  const draw=buildPilotCandidates({...view,ui:{choice:{id:'draw',mode:'draw',min:0,max:0,options:[]}}},1,3);assert.deepEqual(draw[0].action,{kind:'answer',choiceId:'draw',indices:[]});
  const amount=buildPilotCandidates({...view,ui:{choice:{id:'a',mode:'amount',total:4,minEach:1,options:[{index:0,label:'A',max:3},{index:1,label:'B',max:3}]}}},1,3);assert.ok(amount.length);assert.equal(amount[0].action.amounts.reduce((a,b)=>a+b,0),4);
});

test('starting-player prompts include the pilot itself while opponent targeting does not',()=>{
  const base={revision:4,state:{players:[{playerId:0,name:'Host',zones:{}},{playerId:1,name:'Pilot',zones:{}},{playerId:2,name:'Guest',zones:{}}]},ui:{inputType:'InputSelectEntitiesFromList',okEnabled:false,cancelEnabled:false,selectables:[],cardActions:{},highlightedPlayers:[]}};
  const start=buildPilotCandidates({...base,ui:{...base.ui,prompt:'Choose the starting player'}},1,3).map(c=>c.action.targetId);
  assert.deepEqual(start,[0,1,2]);
  const forgeCoinToss=buildPilotCandidates({...base,ui:{...base.ui,prompt:'Pilot, you have won the coin toss.\n\nWho would you like to start this game? (Click on the portrait.)'}},1,3).map(c=>c.action.targetId);
  assert.deepEqual(forgeCoinToss,[0,1,2]);
  const stale=buildPilotCandidates({...base,ui:{...base.ui,inputType:'',prompt:'Pilot, you have won the coin toss.\n\nWho would you like to start this game? (Click on the portrait.)'}},1,3);
  assert.deepEqual(stale,[]);
  const target=buildPilotCandidates({...base,ui:{...base.ui,prompt:'Choose an opponent to attack'}},1,3).map(c=>c.action.targetId);
  assert.deepEqual(target,[0,2]);
});
test('an empty priority pass bypasses the model',()=>{
  const pass=buildPilotCandidates({...view,ui:{prompt:'Priority: AI\nTurn: 1 (AI)\nPhase: Upkeep',inputType:'InputPassPriority',ok:'OK',okEnabled:true,cancelEnabled:false,cardActions:{},selectables:[],highlightedPlayers:[],actionInFlight:false}},1,3);
  assert.equal(pass.length,1);assert.equal(pass[0].action.kind,'ok');assert.equal(pass[0].automatic,true);
});
test('a failed cast is not offered again during the same turn',()=>{
  const failed={...view,telemetry:{recent:[{kind:'browser-cast-cancelled',turn:3,cardId:20}]}};
  const actions=buildPilotCandidates(failed,1,3);assert.equal(actions.some(c=>c.action.kind==='card'&&c.action.targetId===20),false);assert.ok(actions.some(c=>c.action.kind==='ok'));
  const nextTurn=buildPilotCandidates({...failed,state:{...failed.state,turn:4}},1,3);assert.ok(nextTurn.some(c=>c.action.kind==='card'&&c.action.targetId===20));
});
test('standalone mana abilities are reserved for automatic spell payment',()=>{
  const manaView=structuredClone(view),ai=manaView.state.players[1];
  ai.zones.Battlefield.cards=[
    {cardId:30,name:'Mountain',typeLine:'Basic Land — Mountain',oracleText:'({T}: Add {R}.)'},
    {cardId:31,name:'Llanowar Elves',typeLine:'Creature — Elf Druid',oracleText:'{T}: Add {G}.'},
    {cardId:32,name:'Utility Rock',typeLine:'Artifact',oracleText:'{T}: Add one mana of any color.\n{3}, {T}: Draw a card.'}
  ];
  manaView.ui.cardActions={30:'activate ability',31:'activate ability',32:'activate ability'};
  const actions=buildPilotCandidates(manaView,1,3);
  assert.equal(actions.some(c=>c.action.targetId===30),false);
  assert.equal(actions.some(c=>c.action.targetId===31),false);
  assert.equal(actions.some(c=>c.action.targetId===32),true);

  const abilityChoice={...manaView,ui:{...manaView.ui,cardActions:{},choice:{id:'ability',mode:'one',min:1,max:1,options:[{index:0,label:'{T}: Add {C}.'},{index:1,label:'{3}, {T}: Draw a card.'}]}}};
  const choices=buildPilotCandidates(abilityChoice,1,3);
  assert.equal(choices.some(c=>/Add \{C\}/.test(c.label)),false);
  assert.equal(choices.some(c=>/Draw a card/.test(c.label)),true);
});
test('the pilot observation carries Forge mana costs for affordability decisions',()=>{
  const costed=structuredClone(view);costed.state.players[1].zones.Hand.cards[0].manaCost='{1}{G}';
  assert.equal(compactPilotObservation(costed,1,3).own.hand[0].manaCost,'{1}{G}');
});
test('runner uses the provider selection and keeps seat identity and revision on the bridge action',async()=>{
  const calls=[];let delivered=false;const runner=createApiPilotRunner({seats:[{seatId:1,pilot:{difficultyRequested:3}}],pollMs:5,providerForSeat:()=>async()=>0,bridge:async(seat,operation,body)=>{calls.push([seat,operation,body]);if(operation==='view')return delivered?{...view,revision:8,ui:{actionInFlight:true}}:view;delivered=true;return {accepted:true};}});
  await new Promise(resolve=>setTimeout(resolve,30));runner.stop();await runner.done;const action=calls.find(x=>x[1]==='action');assert.equal(action[0],1);assert.equal(action[2].revision,7);assert.match(action[2].actionId,/^[a-f\d-]{36}$/i);
});
