/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* ROB-210: actual saved cards, actual combat/priority/trigger/target/search continuations. No rewritten card text. */
import assert from "node:assert/strict";
import {createState,addObject,cardsIn} from "../game/engine/state/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice,resolveAwaiting,advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {applyAction,legalActions} from "../game/engine/rules/actions.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {collectTriggers,openTriggers} from "../game/engine/rules/trigger.mjs";
import {controllerOf} from "../game/engine/rules/layers.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {hashState} from "../game/engine/journal.mjs";
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex(),BRAGO="Brago, King Eternal",JUMPER="Claim Jumper",THASSA="Thassa, Deep-Dwelling";
const fixture={Rock:{types:["Artifact"],manaCost:"{2}"},Bearer:{types:["Creature"],manaCost:"{1}",power:1,toughness:1}};
const card=name=>{const c=index.definition(name);assert.ok(c,`saved definition missing: ${name}`);return {...c,card:name};};
const named=(s,name)=>s.zones.battlefield.filter(id=>s.objects[id].card===name);
function start({name="Brago audit",source=BRAGO,attacker=BRAGO,lands=5}={}){
  const setup=[{seat:0,zone:"battlefield",cards:[source,JUMPER,"Rock","Forest",...(attacker===source?[]:[attacker])]},
    {seat:1,zone:"battlefield",cards:Array(lands).fill("Forest")}];
  const steps=source===THASSA?[{to:{turn:1,phase:"END_OF_TURN"}}]:[{attack:[attacker]},{to:{turn:1,phase:"COMBAT_DAMAGE"}}];
  const out=runScenario({name,seats:4,library:["Wastes","Plains","Savannah","Forest"],setup,steps},index.definition,fixture);
  return {state:out.state,events:out.events,rng:createRng(name)};
}
function answer(game,labels){
  game.state=JSON.parse(JSON.stringify(game.state));game.rng=createRng("restored",game.rng.checkpoint());
  const c=awaitingChoice(game.state);
  ok(c,"the actual continued game has the expected pending question after JSON restoration");
  const indices=labels.map(label=>{const o=c.options.find(o=>o.label===label);assert.ok(o,`not offered: ${label}; ${c.options.map(o=>o.label).join(", ")}`);return o.index;});
  game.events.push(...resolveAwaiting(game.state,indices,null,game.rng));
}
function settleStack(game){
  for(let n=0;n<32&&!game.state.awaiting&&game.state.stack.length;n++)game.events.push(...passPriority(game.state,null,game.rng).events);
  ok(game.state.awaiting||game.state.stack.length===0,"actual four-seat priority reaches the next choice or finishes the stack");
  return awaitingChoice(game.state);
}
const searches=g=>g.events.filter(e=>e.kind==="GameEventShuffle");

for(const selection of [[],[JUMPER],[BRAGO,JUMPER,"Rock"]]){
  const game=start({name:`Brago ${selection.length} actual targets`}),s=game.state,c=awaitingChoice(s);
  eq(s.players[1].life,38,"actual Brago combat damage hit the defending player");
  ok(game.events.some(e=>e.kind==="GameEventPlayerDamaged"&&e.data.fields.combat&&e.data.fields.source.name===BRAGO),"the real combat damage event, not a fabricated trigger, opened Brago's blink");
  eq([c.min,c.max],[0,3],"any number targets the three real own nonland permanents");
  eq(c.options.map(o=>o.label).sort(),[BRAGO,JUMPER,"Rock"].sort(),"own Forest and opposing permanents are excluded");
  const before=hashState(s);
  assert.throws(()=>resolveAwaiting(s,[9999],null,game.rng),/Invalid selection/);checks++;
  eq(hashState(s),before,"invalid actual blink selection changes no state");
  const original=Object.fromEntries(selection.map(name=>[name,named(s,name)[0]]));
  const library=cardsIn(s,"library",0).length;
  answer(game,selection);settleStack(game);
  if(selection.includes(JUMPER)){
    answer(game,["No"]);answer(game,["No"]);
    for(const name of selection)ok(named(game.state,name)[0]!==original[name],`${name} is a new object after the actual blink`);
    if(selection.includes(BRAGO))eq(game.state.objects[named(game.state,BRAGO)[0]].tapped,false,"Brago returning with the selected group is untapped");
  }
  eq(cardsIn(game.state,"library",0).length,library,"declining both real Claim Jumper searches moves no library cards");
  eq(searches(game).length,0,"declining the real searches never shuffles");
  eq(game.state.awaiting,null,"zero, one or several targets finish without a stuck question");
  eq(game.state.stack.length,0,"the real trigger chain finishes its stack");
}

for(const lands of [2,5]){
  const game=start({name:`Brago search gap ${lands}`,lands}),library=cardsIn(game.state,"library",0).length;
  const old=named(game.state,JUMPER)[0];game.state.objects[old].counters["+1/+1"]=2;game.state.objects[old].damage=1;
  answer(game,[JUMPER]);settleStack(game);
  const fresh=named(game.state,JUMPER)[0];
  eq([fresh!==old,game.state.objects[fresh].damage,game.state.objects[fresh].counters],[true,0,{}],"actual reentry forgets the old object's damage and counters");
  answer(game,["Yes"]);
  let c=awaitingChoice(game.state);
  eq([c.min,c.max],[0,1],"Claim Jumper's real search is optional, not a blink target prompt");
  ok(c.options.some(o=>o.label==="Savannah"),"the actual Plains search permits a nonbasic Plains card");
  ok(!c.options.some(o=>o.label==="Forest"),"a Forest lacking Plains is excluded from the actual search");
  answer(game,["Plains"]);
  if(lands===5){answer(game,["Yes"]);answer(game,["Savannah"]);}
  eq(cardsIn(game.state,"library",0).length,library-(lands===5?2:1),"actual conditional searches find only the number the land gap permits");
  for(const name of lands===5?["Plains","Savannah"]:["Plains"])eq(game.state.objects[named(game.state,name)[0]].tapped,true,`${name} actually enters tapped`);
  eq(searches(game).length,1,"the real blink-then-search chain shuffles exactly once");
  eq([game.state.awaiting,game.state.stack.length],[null,0],"parity suppresses the repeated search and the actual chain completes");
}
{
  const game=start({name:"Brago fail to find"});const library=cardsIn(game.state,"library",0).length;
  answer(game,[JUMPER]);settleStack(game);answer(game,["Yes"]);answer(game,[]);answer(game,["No"]);
  eq(cardsIn(game.state,"library",0).length,library,"legal zero-card search finds nothing");
  eq(searches(game).length,1,"choosing to search still shuffles after a legal fail to find");
  eq(game.state.awaiting,null,"zero-card search continues the actual remaining instructions");
}
for(const selection of [[],[JUMPER]]){
  const game=start({name:`Thassa ${selection.length}`,source:THASSA,lands:2});
  const c=awaitingChoice(game.state);eq([c.min,c.max],[0,1],"Thassa's actual up-to-one trigger has the intended cardinality");
  const old=named(game.state,JUMPER)[0];answer(game,selection);settleStack(game);
  if(selection.length){answer(game,["Yes"]);answer(game,["Plains"]);ok(named(game.state,JUMPER)[0]!==old,"up-to-one blink really reenters before searching");}
  else eq(named(game.state,JUMPER)[0],old,"zero up-to-one targets leave the original creature untouched");
  eq([game.state.awaiting,game.state.stack.length],[null,0],"the actual up-to-one chain finishes without a stuck prompt");
}
{
  const game=start({name:"Only Brago's combat hit triggers",attacker:"Bearer"});
  eq(game.state.players[1].life,39,"another creature actually deals combat damage while Brago is present");
  eq([game.state.awaiting,game.state.stack.length],[null,0],"another creature's combat hit does not trigger Brago");
  const events=runEffect(game.state,{effect:"dealDamage",amount:2,toPlayer:1},{controller:0,source:named(game.state,BRAGO)[0]});
  collectTriggers(game.state,events);openTriggers(game.state);
  eq([game.state.awaiting,game.state.stack.length],[null,0],"Brago's actual noncombat damage does not trigger its combat blink");
}
for(const [spell,expected] of [["Cloudshift",0],["Ephemerate",1]]){
  const s=createState({matchId:`blink-${spell}`,seed:"blink",players:["A","B","C","D"].map(name=>({name}))});
  s.turn=5;s.phase="MAIN1";s.stepIndex=3;s.activePlayer=0;s.priorityPlayer=0;s.pendingTriggers=[];s.players[0].manaPool.W=1;
  const old=addObject(s,{...card(JUMPER),owner:1,controller:1},"battlefield");
  runEffect(s,{effect:"gainControl",targets:[old],toPlayer:0},{controller:0,source:null});
  eq(controllerOf(s,old),0,"the real control effect gives the other owner's creature to the caster");
  const source=addObject(s,{...card(spell),owner:0,controller:0},"hand",0);
  const action=legalActions(s,0).find(a=>a.kind==="cast"&&a.objectId===source&&a.targets?.[0]?.id===old);
  ok(action,"the saved single-target blink is actually offered against the controlled creature");
  const game={state:s,events:applyAction(s,0,action),rng:createRng(spell)};settleStack(game);
  const fresh=named(s,JUMPER)[0];
  eq([fresh!==old,controllerOf(s,fresh),s.objects[fresh].owner],[true,expected,1],`${spell} honors its actual your-control versus owner's-control wording`);
}
{
  const name="Actual Flickerwisp delayed reentry search";
  const out=runScenario({name,seats:4,library:["Wastes","Plains","Savannah"],setup:[
    {seat:0,zone:"battlefield",cards:["Plains","Plains","Plains",JUMPER]},
    {seat:0,zone:"hand",cards:["Flickerwisp"]},{seat:1,zone:"battlefield",cards:Array(5).fill("Forest")}],
    steps:[{tap:"Plains"},{tap:"Plains"},{tap:"Plains"},{cast:"Flickerwisp"},{resolve:true},{choose:[JUMPER]},{resolve:true}]},index.definition);
  const game={state:JSON.parse(JSON.stringify(out.state)),events:out.events,rng:createRng(name)};
  eq(named(game.state,JUMPER),[],"actual Flickerwisp leaves the target exiled until the next end step");
  eq(cardsIn(game.state,"exile",0).map(id=>game.state.objects[id].card),[JUMPER],"the actual delayed return tracks its exiled card through JSON restoration");
  const library=cardsIn(game.state,"library",0).length;
  for(let n=0;n<160&&game.state.phase!=="END_OF_TURN";n++){
    if(game.state.awaiting){
      ok(["declare-attackers","declare-blockers"].includes(game.state.awaiting.kind),"only routine combat declarations interrupt the real end-step clock");
      game.events.push(...resolveAwaiting(game.state,[],null,game.rng));
    }else if(game.state.priorityPlayer===null)game.events.push(...advance(game.state));
    else game.events.push(...passPriority(game.state,null,game.rng).events);
  }
  eq(game.state.phase,"END_OF_TURN","the native game clock reaches the delayed return's end step");
  settleStack(game);answer(game,["Yes"]);answer(game,["Plains"]);answer(game,["Yes"]);answer(game,["Savannah"]);
  eq(cardsIn(game.state,"library",0).length,library-2,"delayed reentry really reaches both conditional Plains searches");
  eq([named(game.state,JUMPER).length,searches(game).length,game.state.awaiting,game.state.stack.length],[1,1,null,0],"actual delayed blink, reentry, search and shuffle finish exactly once");
}
console.log(`engine-playtest-blink: ${checks} checks; actual saved blink cards, combat triggers, zero/one/several, reentry and Plains search chains`);
