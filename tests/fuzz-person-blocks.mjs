/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* A simulated person drafts through the same public check as a board; actual refusals remain fatal strict evidence. */
import assert from "node:assert/strict";
import {createState,addObject} from "../game/engine/state/index.mjs";
import {blockers} from "../game/engine/rules/combat.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {person,PERSON_TRIES,playSafely,verdict} from "../tools/fuzz-live.mjs";

let checks=0;
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks+=1;};
const ok=(actual,message)=>{assert.ok(actual,message);checks+=1;};
const fixture=(required=false)=>{
  const state=createState({matchId:"draft-blocks",seed:"draft-blocks",players:[{name:"Rob"},{name:"Maya"}]});
  const on=(seat,card,more={})=>addObject(state,{card,types:["Creature"],power:2,toughness:2,owner:seat,controller:seat,...more},"battlefield");
  const brute=on(0,"Menace attacker",{keywords:["Menace"],...(required?{abilities:[{id:"must",kind:"static",rule:"must-be-blocked",affects:{what:"permanent",self:true}}]}:{})});
  const bear=on(0,"Other attacker");
  for(let i=0;i<3;i+=1)on(1,`Blocker${i}`);
  state.combat={attackingPlayerId:0,defenders:[1],firstStrike:false,attacks:[brute,bear].map(attacker=>({attacker,defender:1,blocked:false,blockers:[]}))};
  state.awaiting={kind:"declare-blockers",player:1};
  return {state,brute};
};
let rejected=0,nonempty=0,menaceBlocked=0;
for(const required of [false,true]){
  const {state,brute}=fixture(required),choice=blockers.choice(state,state.awaiting),before=hashState(state);
  for(let seed=0;seed<48;seed+=1){
    const checked=[];
    const checkDraft=draft=>{
      eq(draft.choiceId,choice.id,"each draft names the exact current native question");
      const native=blockers.check(state,state.awaiting,draft.indices);
      checked.push([...draft.indices]);
      eq(hashState(state),before,"checking a candidate cannot change native state");
      return {open:true,ok:native.reasons.length===0,reasons:native.reasons};
    };
    const answerer=person(`blocks-${required}-${seed}`),answer=answerer(choice,1,null,{checkDraft});
    eq(blockers.check(state,state.awaiting,answer.indices).reasons,[],"only a fully legal declaration is returned for submission");
    eq(answer.indices,checked.at(-1),"the accepted candidate is submitted unchanged");
    eq(answerer.blockDraftsRejected,checked.length-1,"every rejected private draft is separately counted");
    const again=person(`blocks-${required}-${seed}`)(choice,1,null,{checkDraft});
    eq(again,answer,"the same stream and native checks reproduce the exact declaration");
    const picked=choice.options.filter(option=>answer.indices.includes(option.index));
    if(required)ok(picked.filter(option=>option.attackerId===brute).length>=2,"required Menace blocking stays satisfied");
    const committed=structuredClone(state);
    blockers.resolve(committed,committed.awaiting,answer.indices);
    eq(committed.combat.attacks.find(attack=>attack.attacker===brute).blockers.length,picked.filter(option=>option.attackerId===brute).length,"the exact returned Menace declaration actually commits through native rules");
    rejected+=answerer.blockDraftsRejected;
    nonempty+=Number(answer.indices.length>0);
    menaceBlocked+=Number(picked.some(option=>option.attackerId===brute));
  }
}
ok(rejected>0,"the native witness reaches illegal random Menace drafts before preflight resampling");
ok(nonempty>0&&menaceBlocked>0,"the person still submits actual blocks, including legal two-block Menace sets");
{
  const {state}=fixture(),choice=blockers.choice(state,state.awaiting),before=hashState(state);
  assert.throws(()=>person("expired")(choice,1,null,{checkDraft:()=>({open:false,ok:false,reasons:["stale"]})}),/question expired/);checks+=1;
  let attempts=0;
  assert.throws(()=>person("no-draft")(choice,1,null,{checkDraft:()=>{attempts+=1;return {open:true,ok:false,reasons:["native draft refusal"]};}}),/could not draft legal blockers/);checks+=1;
  eq(attempts,PERSON_TRIES,"draft exhaustion fails explicitly instead of submitting a known illegal fallback");
  eq(hashState(state),before,"stale/exhausted drafts leave the real game unchanged");
}

/* Actual room producer wiring, accepted tape replay, and a submitted bad envelope that must remain a game failure. */
const decks=[{commander:["Rograkh, Son of Rohgahh"],cards:Array(12).fill("Mountain")},{commander:["Chulane, Teller of Tales"],cards:Array(12).fill("Plains")}];
for(const injectBad of [false,true]){
  let requests=0,probed=0,injected=false;
  const answerer=seed=>{
    const normal=person(seed);
    return (decision,turn,view,context)=>{
      requests+=1;
      eq(typeof context?.checkDraft,"function","the actual room producer always supplies its read-only draft check");
      if(injectBad&&!injected){injected=true;return {kind:"answer",choiceId:decision.id,indices:[999999]};}
      const answer=normal(decision,turn,view,context);
      if(decision.kind==="priority"){
        eq(context.checkDraft({choiceId:"expired-native-question",indices:[]}).open,false,"producer check is bound to the actual live room/question");
        eq(context.checkDraft({choiceId:decision.id,indices:answer.indices}).ok,true,"the current public answer checks through that exact room and actor");
        probed+=1;
      }
      return answer;
    };
  };
  const {game,exception}=await playSafely({decks,seed:27,cards:tableCards,humans:[0],levels:[null,"normal"],people:answerer,replay:true,leaks:true,strictRefusals:true,matchId:`checked-person-${injectBad}`});
  if(injectBad){
    assert.match(exception,/Invalid selection/);checks+=1;
    eq(game,undefined,"an actually submitted invalid envelope is never replaced by a clean preflight answer");
    continue;
  }
  eq(exception,undefined,"the normal real-room game has no exception");
  eq(game.status,"finished","the real bounded fixture game finishes");
  ok(requests>0&&probed>0,"real person decisions exercise the public check wiring");
  eq(game.personRefused.length,0,"the normal game has no actual refused answer");
  eq(game.replay.same,true,"accepted real-room tape replays identically");
  eq(game.leaks,[],"no hidden-card leak is introduced");
  eq(verdict(game).clean,true,"the real no-refusal replay passes strict verdict");
  eq(verdict({...game,personRefused:[{reason:"actual submitted native refusal"}]}).clean,false,"strict refusal policy remains active after checked-person play");
}
console.log(`fuzz-person-blocks: ${checks} checks passed; native joint declarations, read-only preflight, replay and strict refusal retention`);
