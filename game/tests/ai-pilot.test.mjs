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
  const withYield=buildPilotCandidates({...view,ui:{prompt:'Priority: AI',inputType:'InputPassPriority',ok:'OK',okEnabled:true,cancel:'End Turn',cancelEnabled:true,cardActions:{}}},1,3);
  assert.equal(withYield.length,1);assert.equal(withYield[0].automatic,true);
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

  const abilityChoice={...manaView,ui:{...manaView.ui,cardActions:{},choice:{id:'ability',title:'Choose an ability',mode:'one',min:1,max:1,options:[{index:0,label:'{T}: Add {C}.'},{index:1,label:'{3}, {T}: Draw a card.'}]}}};
  const choices=buildPilotCandidates(abilityChoice,1,3);
  assert.equal(choices.some(c=>/Add \{C\}/.test(c.label)),false);
  assert.equal(choices.some(c=>/Draw a card/.test(c.label)),true);
});
test('the pilot observation carries Forge mana costs for affordability decisions',()=>{
  const costed=structuredClone(view);costed.state.players[1].zones.Hand.cards[0].manaCost='{1}{G}';
  assert.equal(compactPilotObservation(costed,1,3).own.hand[0].manaCost,'{1}{G}');
});
test('seat-scoped hidden-zone choices retain exposed card mechanics without leaking hidden zones',()=>{
  const tutor=structuredClone(view);
  tutor.state.players[0].zones.Hand={count:7,cards:[]};
  tutor.state.players[0].zones.Library={count:82,cards:[]};
  tutor.ui.cardActions={};
  tutor.ui.selectables=[901,902];
  tutor.ui.selectableCards=[
    {cardId:901,name:'Swords to Plowshares',manaCost:'{W}',typeLine:'Instant',oracleText:'Exile target creature.'},
    {cardId:902,name:'Sol Ring',manaCost:'{1}',typeLine:'Artifact',oracleText:'{T}: Add {C}{C}.'}
  ];
  const candidates=buildPilotCandidates(tutor,1,4);
  assert.match(candidates.find(c=>c.action.targetId===901).label,/Swords to Plowshares.*Instant.*Exile target creature/);
  assert.match(candidates.find(c=>c.action.targetId===902).label,/Sol Ring.*Artifact.*Add \{C\}\{C\}/);
  const observation=compactPilotObservation(tutor,1,4);
  assert.deepEqual(observation.offeredCards,tutor.ui.selectableCards);
  assert.equal(observation.opponents[0].handCount,7);
  assert.equal(observation.opponents[0].hand,undefined);
  assert.equal(observation.opponents[0].library,undefined);
});
test('runner uses the provider selection and keeps seat identity and revision on the bridge action',async()=>{
  const calls=[];let delivered=false;const runner=createApiPilotRunner({seats:[{seatId:1,pilot:{difficultyRequested:3}}],pollMs:5,providerForSeat:()=>async()=>0,bridge:async(seat,operation,body)=>{calls.push([seat,operation,body]);if(operation==='view')return delivered?{...view,revision:8,ui:{actionInFlight:true}}:view;delivered=true;return {accepted:true};}});
  await new Promise(resolve=>setTimeout(resolve,30));runner.stop();await runner.done;const action=calls.find(x=>x[1]==='action');assert.equal(action[0],1);assert.equal(action[2].revision,7);assert.match(action[2].actionId,/^[a-f\d-]{36}$/i);
});

test('all offered tutor targets and terminal controls remain reachable at every difficulty',()=>{
  const tutor={...view,ui:{prompt:'Select a library card',inputType:'InputSelectEntitiesFromList',selectables:Array.from({length:35},(_,i)=>100+i),ok:'OK',okEnabled:true,cancel:'Cancel',cancelEnabled:true,highlightedCards:[131]}};
  for(let level=1;level<=5;level++){
    const actions=buildPilotCandidates(tutor,1,level);
    assert.equal(actions.filter(c=>c.action.kind==='card').length,35);
    assert.ok(actions.some(c=>c.action.kind==='ok'));assert.ok(actions.some(c=>c.action.kind==='cancel'));
  }
  assert.deepEqual(compactPilotObservation(tutor,1).decision.selectedCardIds,[131]);
  assert.deepEqual(buildPilotCandidates({...tutor,state:{...view.state,gameOver:true}},1),[]);
});

test('required effect choices containing mana text are not filtered as standalone activations',()=>{
  const modal={...view,ui:{choice:{id:'mode',title:'Choose an effect',mode:'one',min:1,max:1,options:[{index:0,label:'Add {G}.'}]}}};
  assert.equal(buildPilotCandidates(modal,1)[0].action.indices[0],0);
});

const until=async check=>{const end=Date.now()+2500;while(!check()){assert.ok(Date.now()<end,'Pilot did not reach expected state');await new Promise(r=>setTimeout(r,5));}};
const seat={seatId:1,pilot:{difficultyRequested:3}};

test('a queued receipt is not completion and the pilot waits for Forge before acting again',async t=>{
  let current=structuredClone(view),reads=0;const actions=[],events=[];
  const runner=createApiPilotRunner({seats:[seat],pollMs:5,onEvent:e=>events.push(e),providerForSeat:()=>async()=>0,bridge:async(_,operation,body)=>{
    if(operation==='view'){reads++;return structuredClone(current);}
    actions.push(body);current.revision++;current.ui.lastAction={id:body.actionId,status:'pending'};return {accepted:true};
  }});t.after(async()=>{runner.stop();await runner.done;});
  await until(()=>reads>=6);assert.equal(actions.length,1);assert.equal(events.some(e=>e.kind==='ai-action-completed'),false);
  current.ui={lastAction:{id:actions[0].actionId,status:'completed'}};current.revision++;
  await until(()=>events.some(e=>e.kind==='ai-action-completed'));assert.equal(actions.length,1);
});

test('an asynchronously rejected action is reported and not retried for the unchanged decision',async t=>{
  let current=structuredClone(view);const actions=[],events=[];
  const runner=createApiPilotRunner({seats:[seat],pollMs:5,onEvent:e=>events.push(e),providerForSeat:()=>async()=>0,bridge:async(_,operation,body)=>{
    if(operation==='view')return structuredClone(current);
    actions.push(body);current.revision++;
    current.ui.lastAction={id:body.actionId,status:actions.length===1?'error':'completed',message:'Card is not visible'};
    if(actions.length===2)current.ui={lastAction:current.ui.lastAction};
    return {accepted:true};
  }});t.after(async()=>{runner.stop();await runner.done;});
  await until(()=>events.some(e=>e.kind==='ai-action-completed'));
  assert.equal(actions.length,2);assert.equal(actions[0].kind,'card');assert.equal(actions[1].kind,'ok');
  assert.ok(events.some(e=>e.kind==='ai-action-rejected'&&e.message==='Card is not visible'));
});

test('an ambiguous transport failure retries the exact action ID and payload',async t=>{
  let current=structuredClone(view);const actions=[];
  const runner=createApiPilotRunner({seats:[seat],pollMs:5,providerForSeat:()=>async()=>0,bridge:async(_,operation,body)=>{
    if(operation==='view')return structuredClone(current);
    actions.push(body);
    if(actions.length===1)throw new TypeError('fetch failed');
    current={...current,revision:8,ui:{lastAction:{id:body.actionId,status:'completed'}}};return {accepted:true};
  }});t.after(async()=>{runner.stop();await runner.done;});
  await until(()=>actions.length===2);assert.deepEqual(actions[1],actions[0]);
});

test('stop cancels in-flight provider work and prevents a late action',async()=>{
  let release,request,started=false;const actions=[];
  const runner=createApiPilotRunner({seats:[seat],pollMs:5,providerForSeat:()=>async value=>{request=value;started=true;return new Promise(r=>{release=r;});},bridge:async(_,operation,body)=>{if(operation==='view')return view;actions.push(body);}});
  await until(()=>started);runner.stop();assert.equal(request.signal.aborted,true);release(0);await runner.done;assert.equal(actions.length,0);
});

test('failed provider attempts consume the budget and use a declared fallback',async t=>{
  let current=structuredClone(view);const events=[];
  const runner=createApiPilotRunner({seats:[seat],pollMs:5,onEvent:e=>events.push(e),providerForSeat:()=>async()=>{throw Error('Provider timeout');},bridge:async(_,operation,body)=>{
    if(operation==='view')return current;current={...current,revision:8,ui:{lastAction:{id:body.actionId,status:'completed'}}};return {accepted:true};
  }});t.after(async()=>{runner.stop();await runner.done;});
  await until(()=>events.some(e=>e.kind==='ai-action-completed'));assert.equal(runner.status()[0].providerCalls,1);
  assert.ok(events.some(e=>e.kind==='ai-action-submitted'&&e.source==='bounded-local-fallback'));
});

test('nudge cancels a stalled model request and immediately uses the bounded local fallback',async t=>{
  let started=false,request;const actions=[],events=[];
  const runner=createApiPilotRunner({seats:[seat],pollMs:5,onEvent:event=>events.push(event),providerForSeat:()=>async value=>{request=value;started=true;return new Promise((_,reject)=>value.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));},bridge:async(_,operation,body)=>{
    if(operation==='view')return view;actions.push(body);return {accepted:true};
  }});t.after(async()=>{runner.stop();await runner.done;});
  await until(()=>started);assert.deepEqual(runner.nudge(1),{prompted:1,waitingForForge:0});await until(()=>actions.length===1);
  assert.equal(request.signal.aborted,true);assert.ok(events.some(event=>event.kind==='ai-pilot-prompted'&&event.action==='cancelled-model-request'));assert.ok(events.some(event=>event.kind==='ai-action-submitted'&&event.source==='bounded-local-fallback'));
});
