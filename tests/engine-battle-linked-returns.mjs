/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 610.3d, 614.12a, 101.4: simultaneous linked returns remain outside the battlefield through every entry choice. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {beginRuleOperation, answerRuleOperation} from "../game/engine/rules/operations.mjs";
import {entryCounterResult, entryCounterProgressFrame} from "../game/engine/rules/entry-characteristics.mjs";
import {freezeSbaReturnBatch, reopenPreparedSbaReturn, validateSbaReturnFirstEntry, pendingSbaReturnEvents} from "../game/engine/rules/sba-move-results.mjs";

let checks = 0;
const failures = [];
const eq = (a,b,why) => {assert.deepEqual(a,b,why); checks++;};
const run = (name,fn) => {try {fn();} catch(error) {failures.push(`${name}: ${error.message}`);}};
const mirror = compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/c/clever-impersonator.json",import.meta.url))));
eq(mirror.problems,[],"the actual saved Clever Impersonator compiles without a new card definition");
const fresh = ({reverse=false,existing=false}={}) => {
  const state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});
  Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=["First Return Battle","Second Return Battle"].map(card=>{
    const id=put({card,types:["Battle"],defense:0});state.objects[id].protector=0;return id;
  });
  const bear=addObject(state,{card:"Returning Four Bear",types:["Creature"],power:4,toughness:4,owner:0,controller:0},"exile");
  const clone=addObject(state,{...mirror.definition,card:"Clever Impersonator",owner:0,controller:0},"exile");
  const old=existing?put({card:"Existing Two Bear",types:["Creature"],power:2,toughness:2}):null;
  const exiled=reverse?[clone,bear]:[bear,clone];
  state.exiledUntil=sources.map((source,index)=>({source,exiled:exiled[index]}));
  return {state,sources,bear,clone,old};
};

for(const reverse of [false,true]) for(const existing of [false,true]) run(`source order ${reverse}, existing ${existing}`,()=>{
  const {state,sources,bear,clone,old}=fresh({reverse,existing});
  const events=afterResolving(state,[]);
  for(let step=0;state.awaiting&&step<20;step++){
    const choice=awaitingChoice(state);
    eq([state.objects[bear]?.zone,state.objects[clone]?.zone],["exile","exile"],"every returning sibling stays in its actual old zone until all simultaneous entry choices finish");
    eq(sources.map(id=>state.objects[id]),[undefined,undefined],"both source Battles actually left in the base cohort before any return question");
    if(choice.id.startsWith("sba-linked-order:")){
      events.push(...resolveAwaiting(state,choice.options.map((_,index)=>index).reverse()));
      continue;
    }
    eq(choice.id.startsWith("entering-copy:"),true,"the only remaining decision is the actual native copy replacement");
    eq(choice.options.filter(option=>option.copyOf!==null).map(option=>option.copyOf),existing?[old]:[],"a Clone may copy the already-existing permanent, never the simultaneously returning sibling");
    events.push(...resolveAwaiting(state,[choice.options.findIndex(option=>option.copyOf===(existing?old:null))]));
  }
  eq(state.awaiting,null,"every actual entry decision completes without granting a default replacement");
  const cloneChange=events.find(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===clone);
  const bearChange=events.find(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===bear);
  eq([!!cloneChange,!!bearChange],[true,true],"both actual old exile identities produce one native return event");
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===clone).length,1,"the physical Clone returns once");
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===bear).length,1,"the physical Bear returns once");
  if(existing) eq([state.objects[cloneChange.data.fields.becomes]?.power,state.objects[cloneChange.data.fields.becomes]?.toughness],[2,2],"the explicit copy uses the legal old Bear rather than the returning 4/4");
  else eq(state.zones.graveyard[0].some(id=>state.objects[id].card==="Clever Impersonator"),true,"with no legal copy the actual 0/0 reaches its next SBA after returning");
});

run("completed counter prefix rechecks a newly live source",()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});
  Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=["Counter Return A","Counter Return B"].map(card=>{const id=put({card,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const cards=["First Counter Return","Second Counter Return"].map(card=>addObject(state,{card,types:["Planeswalker"],loyalty:3,owner:0,controller:0},"exile"));
  const more=(card,named,change)=>put({card,types:["Enchantment"],abilities:[{id:card,kind:"static",rule:"more-counters",affects:{what:"permanent",controller:"you",named},counter:"loyalty",...change}]});
  const prefix=more("First Applied Plus One","First Counter Return",{plus:1});
  more("Second Plus One","Second Counter Return",{plus:1});more("Second Doubler","Second Counter Return",{times:2});
  const gate=put({owner:1,controller:1,card:"Counter Return Gate",types:["Enchantment"]});
  const season=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/d/doubling-season.json",import.meta.url))));
  eq(season.problems,[],"the actual saved counter modifier compiles");
  const doubling=addObject(state,{...season.definition,card:"Doubling Season",owner:0,controller:0},"exile");
  state.exiledUntil=[...sources.map((source,index)=>({source,exiled:cards[index]})),{source:gate,exiled:doubling}];
  afterResolving(state,[]);
  resolveAwaiting(state,awaitingChoice(state).options.map((_,index)=>index));
  eq(awaitingChoice(state).id.startsWith(`entry-counters:${cards[1]}:`),true,"the second return's actual counter choice waits after the first plan completed");
  eq(cards.map(id=>state.objects[id].zone),["exile","exile"],"neither planeswalker enters while a sibling counter choice remains");
  const first=Object.values(state.ruleOperation.entryCounterResults).find(result=>result.objectId===cards[0]);
  eq([first.raw.loyalty,first.counters.loyalty],[3,4],"the first native plan really applied its +1 prefix before the later question");
  eq([first.progress.operation,first.progress.objectId,first.progress.player,first.progress.raw.loyalty,first.progress.counts.loyalty,first.progress.applied.loyalty.length],
    [state.ruleOperation.serial,cards[0],0,3,4,1],"the native result preserves its exact bound completed count and one applied replacement identity");
  for(const corrupt of [progress=>progress.operation++,progress=>progress.objectId=cards[1],progress=>progress.player=1,
    progress=>progress.returnBatchId="forged",progress=>progress.sourceCohortId="forged",progress=>progress.raw.loyalty=99,
    progress=>progress.counts.loyalty=99,progress=>progress.kinds.push("shield"),progress=>progress.complete="forged",
    progress=>progress.generation=-1,progress=>progress.entryApplied.push(42),progress=>progress.applied.loyalty.push(progress.applied.loyalty[0])]){
    const copy=JSON.parse(JSON.stringify(state)), row=Object.values(copy.ruleOperation.entryCounterResults).find(result=>result.objectId===cards[0]);
    corrupt(row.progress);
    assert.throws(()=>resolveAwaiting(copy,[0]),/native|progress|binding/);checks++;
    eq(cards.map(id=>copy.objects[id]?.zone),["exile","exile"],"a forged operation, batch, source, object or player binding cannot commit either actual return");
  }
  state=JSON.parse(JSON.stringify(state));
  concede(state,1);
  for(let step=0;state.awaiting&&step<20;step++){
    const choice=awaitingChoice(state);
    eq(choice.options.some(option=>option.cardId===prefix),false,"a still-present already-applied +1 modifier cannot be offered again after reload and concession");
    resolveAwaiting(state,[0]);
  }
  const returned=state.zones.battlefield.find(id=>state.objects[id].card==="First Counter Return");
  eq(state.objects[returned].counters.loyalty,8,"the saved four-counter prefix receives the newly live Doubling Season once before any sibling commits");
});

run("historical count receipts preserve their established API",()=>{
  const state=JSON.parse(JSON.stringify({ruleOperation:{serial:4,frames:[],entryCounterResults:{"4:1":{objectId:17,player:0,raw:{loyalty:3},counters:{loyalty:4}}}}}));
  const prepared={counterResult:"4:1",entering:{counters:{loyalty:4}}};
  const before=JSON.stringify(state);
  eq(entryCounterResult(state,prepared,17,0),{loyalty:4},"a historical serialized receipt needs no new optional progress fields for the old read API");
  eq(JSON.stringify(state),before,"reading the old count shape does not rewrite or opt it into a new continuation");
  assert.throws(()=>entryCounterProgressFrame(state,prepared,17,0,"forged"),/native|progress|binding/);checks++;
  eq(entryCounterResult(state,prepared,17,0,{consume:true}),{loyalty:4},"the old consume API retains its exact counter result");
  assert.throws(()=>entryCounterResult(state,prepared,17,0),/matching internal/);checks++;
});

run("committed native entry costs precede every returning watcher",()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});
  Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=[0,1,2].map(index=>{const id=put({card:`Cost Return Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const ability=id=>({id,kind:"triggered",text:"Whenever you lose life, gain 1 life.",trigger:{on:"GameEventPlayerLivesChanged",loser:"you",batch:true},effects:[{effect:"gainLife",amount:1}]});
  put({card:"Existing Life Watcher",types:["Enchantment"],abilities:[ability("old-life")]});
  const garden=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/t/temple-garden.json",import.meta.url))));
  eq(garden.problems,[],"the actual saved life-payment entry card compiles");
  const land=addObject(state,{...garden.definition,card:"Temple Garden",owner:0,controller:0},"exile");
  const watcher=addObject(state,{card:"Returning Life Watcher",types:["Creature"],power:2,toughness:2,owner:0,controller:0,abilities:[ability("returned-life")]},"exile");
  const clone=addObject(state,{...mirror.definition,card:"Clever Impersonator",owner:0,controller:0},"exile");
  const ids=[land,watcher,clone];state.exiledUntil=sources.map((source,index)=>({source,exiled:ids[index]}));
  afterResolving(state,[]);
  resolveAwaiting(state,awaitingChoice(state).options.map((_,index)=>index));
  const cost=awaitingChoice(state);
  eq(cost.options.some(option=>option.pay===true),true,"the actual native entry offers its real life cost before all returns");
  const paid=resolveAwaiting(state,[cost.options.findIndex(option=>option.pay===true)]);
  eq([state.players[0].life,awaitingChoice(state).id.startsWith("entering-copy:")],[38,true],"the first real cost remains paid while a later sibling asks its copy decision");
  eq(ids.map(id=>state.objects[id]?.zone),["exile","exile","exile"],"no returning object moved after the committed cost and before the later decision");
  eq(paid.filter(event=>event.kind==="GameEventPlayerLivesChanged").length,1,"the committed native cost prefix is reported once before the later question");
  state=JSON.parse(JSON.stringify(state));concede(state,2);
  const finished=resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.copyOf===null)]);
  eq(state.players[0].life,38,"reload and independent concession cannot snapshot-rollback the real paid cost");
  eq(state.players[2].lost,true,"the independent outside concession remains authoritative after the saved entry resumes");
  eq(finished.filter(event=>event.kind==="GameEventPlayerLivesChanged").length,0,"finishing the returns does not replay the already-reported cost prefix");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="old-life").length,1,"the already-existing watcher sees the native paid life once");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="returned-life").length,0,"a watcher returning afterward cannot see a life payment made before it entered");
});

for(const hostsPresent of [false,true])for(const reverse of [false,true])run(`Aura preflight hosts ${hostsPresent} order ${reverse}`,()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});
  Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=[0,1].map(index=>{const id=put({card:`Aura Return Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const hosts=hostsPresent?[put({card:"First Legal Host",types:["Creature"],power:2,toughness:2,keywords:["Shroud"]}),
    put({card:"Second Legal Host",types:["Creature"],power:3,toughness:3})]:[];
  if(hostsPresent){
    const protectedCard=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/b/black-knight.json",import.meta.url))));
    eq(protectedCard.problems,[],"the actual protection-from-white control compiles");
    put({...protectedCard.definition,card:"Black Knight"});
  }
  const script=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/p/pacifism.json",import.meta.url))));
  eq(script.problems,[],"the actual saved Aura compiles");
  const aura=addObject(state,{...script.definition,card:"Pacifism",owner:0,controller:0},"exile");
  const bear=addObject(state,{card:"Aura Sibling Bear",types:["Creature"],power:4,toughness:4,owner:0,controller:0},"exile");
  state.exiledUntil=[{source:sources[0],exiled:aura},{source:sources[1],exiled:bear}];
  const events=afterResolving(state,[]), order=awaitingChoice(state).options.map((_,index)=>index);
  events.push(...resolveAwaiting(state,reverse?order.reverse():order));
  if(hostsPresent){
    const choice=awaitingChoice(state);
    eq(choice?.id.startsWith("sba-return-enchant:"),true,"an Aura's attachment is a native pre-entry choice rather than a first-host default");
    eq([state.objects[aura]?.zone,state.objects[bear]?.zone],["exile","exile"],"all returning objects stay out while the attachment is chosen");
    eq(choice.options.map(option=>option.cardId).sort((a,b)=>a-b),hosts.sort((a,b)=>a-b),"all existing legal hosts are offered, including Shroud, without the simultaneous sibling");
    state=JSON.parse(JSON.stringify(state));
    const before=JSON.stringify(state);assert.throws(()=>resolveAwaiting(state,[2]),/Invalid selection/);checks++;
    eq(JSON.stringify(state),before,"an invalid attachment answer leaves every saved preflight decision unchanged");
    events.push(...resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.cardId===hosts[1])]));
    const arrived=events.find(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===aura)?.data.fields.becomes;
    eq(state.objects[arrived]?.attachedTo,hosts[1],"the actual Aura enters attached to the explicitly chosen second host once");
  }else{
    eq(state.objects[aura]?.zone,"exile","with no existing legal host the Aura remains its original exile object");
    eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===aura).length,0,"the prevented/no-move Aura emits no fictitious entry or new identity");
  }
  eq(state.zones.battlefield.filter(id=>state.objects[id].card==="Aura Sibling Bear").length,1,"the independently returning Bear enters once in either chosen planning order");
});

run("new entering modifier preserves an already paid native prefix",()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=[0,1].map(index=>{const id=put({card:`Entering Return Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const script={schema:"CrankCardScript@1",source:"hand",identity:{name:"Paid Creature Return",oracleId:"smoke-paid-creature-return",types:["Creature"],manaCost:"{0}",power:2,toughness:2},
    oracleText:"As this creature enters, you may pay 2 life. If you don't, it enters tapped.",abilities:[{kind:"replacement",text:"As this creature enters, you may pay 2 life. If you don't, it enters tapped.",watches:{event:"enters",who:"self"},change:{entersTapped:true,unlessPay:{life:2}}}]};
  const first=compileScript(script);eq(first.problems,[],"the generic life-payment entry fixture compiles without a final card");
  const cards=[addObject(state,{...first.definition,card:script.identity.name,owner:0,controller:0},"exile"),
    addObject(state,{card:"Waiting Entry Walker",types:["Planeswalker"],loyalty:3,owner:0,controller:0},"exile")];
  for(const [card,change]of [["Entry Plus One",{plus:1}],["Entry Doubler",{times:2}]])put({card,types:["Enchantment"],abilities:[{id:card,kind:"static",rule:"more-counters",affects:{what:"permanent",named:"Waiting Entry Walker",controller:"you"},counter:"loyalty",...change}]});
  const gate=put({owner:2,controller:2,card:"Entering Modifier Gate",types:["Enchantment"]});
  const authority=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/a/authority-of-the-consuls.json",import.meta.url))));eq(authority.problems,[],"the actual new entering modifier compiles");
  const modifier=addObject(state,{...authority.definition,card:"Authority of the Consuls",owner:1,controller:1},"exile");
  state.exiledUntil=[...sources.map((source,index)=>({source,exiled:cards[index]})),{source:gate,exiled:modifier}];
  afterResolving(state,[]);resolveAwaiting(state,awaitingChoice(state).options.map((_,index)=>index));
  resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.pay===true)]);
  eq([state.players[0].life,awaitingChoice(state).id.startsWith(`entry-counters:${cards[1]}:`)],[38,true],"the first actual entry cost is committed before the later counter question");
  state=JSON.parse(JSON.stringify(state));concede(state,2);
  for(let step=0;state.awaiting&&step<20;step++){
    const choice=awaitingChoice(state);eq(choice.options.some(option=>option.pay===true),false,"the old paid replacement is never re-offered while new sources are checked");
    resolveAwaiting(state,[0]);
  }
  const returned=state.zones.battlefield.find(id=>state.objects[id].card===script.identity.name);
  eq([state.players[0].life,state.objects[returned].tapped],[38,true],"the newly live entering modifier applies without replaying or undoing the earlier paid prefix");
});

/* CR 614.5, 616.1f-g: a newly applicable containing entry replacement precedes the unanswered counter choice;
   the earlier applied counter prefix remains committed. These numbers describe this fixture's chosen order. */
for(const secondTotal of [9,10])for(const askGrant of [false,true])run(`parent grant after counter prefix ${secondTotal}, choice ${askGrant}`,()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=[0,1].map(index=>{const id=put({card:`Grant Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const ids=["First Grant Walker","Second Grant Walker"].map(card=>addObject(state,{card,types:["Planeswalker"],loyalty:3,owner:0,controller:0},"exile"));
  const doubling=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/d/doubling-season.json",import.meta.url))));
  eq(doubling.problems,[],"the counter order uses the actual loaded doubler");put({...doubling.definition,card:"Doubling Season"});
  put({card:"Second Counter Plus One",types:["Enchantment"],abilities:[{id:"second-plus",kind:"static",rule:"more-counters",counter:"loyalty",plus:1,affects:{what:"permanent",controller:"you",named:"Second Grant Walker"}}]});
  const gate=put({owner:2,controller:2,card:"New Entry Grant Gate",types:["Enchantment"]});
  const grant=addObject(state,{card:"New Entry Loyalty Grant",types:["Enchantment"],owner:0,controller:0,abilities:[{id:"entry-grant",kind:"replacement",watches:{event:"enters",filter:{types:["Planeswalker"],controller:"you"}},
    change:{entersWithCounters:{counter:"loyalty",count:1},...(askGrant?{entersTapped:true,unlessPay:{life:2}}:{})}}]},"exile");
  state.exiledUntil=[...sources.map((source,index)=>({source,exiled:ids[index]})),{source:gate,exiled:grant}];
  afterResolving(state,[]);resolveAwaiting(state,awaitingChoice(state).options.map((_,index)=>index));
  const oldQuestion=awaitingChoice(state).id,first=Object.values(state.ruleOperation.entryCounterResults).find(row=>row.objectId===ids[0]);
  eq([first.raw.loyalty,first.counters.loyalty],[3,6],"the first doubler has actually applied before the later pending question");
  state=JSON.parse(JSON.stringify(state));concede(state,2);
  if(askGrant){
    const partial=Object.entries(state.ruleOperation.entryCounterResults).find(([,row])=>row.progress?.complete===false);
    eq(!!partial,true,"the containing replacement's actual life question holds a partial counter receipt");
    const [key,row]=partial,prepared={counterResult:key,entering:{counters:row.counters}};
    for(const options of [{},{consume:true},{allowPartial:true}]){
      const before=JSON.stringify(state);assert.throws(()=>entryCounterResult(state,prepared,row.objectId,row.player,options),/matching internal/);checks++;
      eq(JSON.stringify(state),before,"a partial receipt cannot be read or consumed as a completed return, including a caller flag");
    }
    const forged=JSON.parse(JSON.stringify(state)),parent=forged.ruleOperation.frames.find(frame=>frame.kind==="sba-linked-returns");
    forged.ruleOperation.frames=forged.ruleOperation.frames.slice(0,forged.ruleOperation.frames.indexOf(parent)+1);
    parent.stage="ready";const batch=forged.ruleOperation.sbaReturnBatches[parent.returnBatchId];batch.phase="counters";
    for(const member of batch.members)member.counterReady=true;
    assert.throws(()=>freezeSbaReturnBatch(forged,parent),/completed choices/);checks++;
    eq(ids.map(id=>forged.objects[id]?.zone),["exile","exile"],"pretending every sibling is ready cannot freeze or commit a partial counter result");
    for(let step=0;state.awaiting&&!awaitingChoice(state).id.startsWith("entry-counters:")&&step<10;step++){
      eq(ids.map(id=>state.objects[id]?.zone),["exile","exile"],"neither return commits during a newly discovered real entry cost");
      state=JSON.parse(JSON.stringify(state));resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.pay===true)]);
    }
  }
  const choice=awaitingChoice(state);
  eq(choice.options.map(option=>option.puts).sort((a,b)=>a-b),[9,10],"the new parent grant changes the unanswered contained counter event before either legal order is chosen");
  eq(choice.id!==oldQuestion,true,"the refreshed question has a new identity after the containing event changes");
  eq(ids.map(id=>state.objects[id]?.zone),["exile","exile"],"the changed counter event is still pre-entry for both objects");
  state=JSON.parse(JSON.stringify(state));
  const before=JSON.stringify(state);assert.throws(()=>resolveAwaiting(state,[2]),/Invalid selection/);checks++;
  eq(JSON.stringify(state),before,"invalid selection cannot commit or mutate the refreshed counter event");
  resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.puts===secondTotal)]);
  const actual=ids.map((id,index)=>state.zones.battlefield.find(next=>state.objects[next].card===`${index?"Second":"First"} Grant Walker`));
  eq(actual.map(id=>state.objects[id]?.counters.loyalty),[7,secondTotal],"the first double stays committed and the new parent grant is appended exactly once; the second uses the explicitly chosen order");
  eq(state.players[0].life,askGrant?36:40,"new real entry costs occur exactly once and completed costs remain authoritative");
  eq(state.awaiting,null,"all refreshed choices finish before priority returns");
});

const lateReturn = ({kind="zone",dual=false,back=false,discardFirst=false,graveChoices=false}={}) => {
  const state=createState({players:[{name:"A"},{name:"B"},{name:"C"},{name:"D"}]});Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=[0,1].map(index=>{const id=put({card:`Late Return Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const ids=["First Late Walker","Second Late Walker"].map(card=>addObject(state,{card,types:["Planeswalker"],loyalty:3,owner:0,controller:0},"exile"));
  const doubling=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/d/doubling-season.json",import.meta.url))));
  eq(doubling.problems,[],"late redirect uses the actual loaded doubler");put({...doubling.definition,card:"Doubling Season"});
  put({card:"Second Late Plus One",types:["Enchantment"],abilities:[{id:"second-late-plus",kind:"static",rule:"more-counters",counter:"loyalty",plus:1,affects:{what:"permanent",controller:"you",named:"Second Late Walker"}}]});
  if(back){
    put({card:"First Existing Exile Redirect",types:["Enchantment"],abilities:[{id:"old-exile",kind:"replacement",watches:{event:"zone-change",from:"exile",to:"battlefield",filter:{what:"card",zone:"exile",named:"First Late Walker"}},change:{to:"exile"}}]});
    state.objects[ids[0]].abilities=[{id:"first-real-entry",kind:"replacement",watches:{event:"enters",who:"self"},change:{entersTapped:true,unlessPay:{life:2}}}];
    if(discardFirst){
      state.objects[ids[0]].abilities[0].text="Pay two life before return.";
      const mox=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/m/mox-diamond.json",import.meta.url))));
      eq(mox.problems,[],"the actual loaded native discard-instead entry condition compiles");
      state.objects[ids[0]].abilities.push({...mox.definition.abilities.find(ability=>ability.kind==="replacement"),id:"first-discard-entry"});
      addObject(state,{card:"Actual Discard Land",types:["Land"],owner:0,controller:0},"hand",0);
    }
    if(graveChoices)for(const to of ["hand","exile"])put({card:`Final Redirect ${to}`,types:["Enchantment"],abilities:[{id:`final-${to}`,kind:"replacement",watches:{event:"zone-change",from:"exile",to:"graveyard",filter:{what:"card",zone:"exile",named:"First Late Walker"}},change:{to}}]});
  }
  const gate=put({owner:2,controller:2,card:"New Late Modifier Gate",types:["Enchantment"]});
  const modifiers=(dual?["hand","exile"]:["exile"]).map((to,index)=>addObject(state,{card:`Late Modifier ${to}`,types:["Enchantment"],owner:index?1:0,controller:index?1:0,
    abilities:[{id:`late-${to}`,kind:"replacement",watches:kind==="entry"?{event:"enters",filter:{named:"First Late Walker",controller:"you"}}
      :{event:"zone-change",from:"exile",to:back?"exile":"battlefield",filter:{what:"card",zone:"exile",named:"First Late Walker"}},
      change:kind==="entry"?{discardInstead:{types:["Land"]}}:{to:back?"battlefield":to,then:[{effect:"gainLife",amount:1}]}}]},"exile"));
  state.exiledUntil=[...sources.map((source,index)=>({source,exiled:ids[index]})),...modifiers.map(exiled=>({source:gate,exiled}))];
  const events=afterResolving(state,[]);events.push(...resolveAwaiting(state,awaitingChoice(state).options.map((_,index)=>index)));
  if(!back)eq(Object.values(state.ruleOperation.entryCounterResults).find(row=>row.objectId===ids[0]).counters.loyalty,6,"the earlier prepared entry really holds its applied counter prefix before redirect");
  else eq(Object.values(state.ruleOperation.entryCounterResults??{}).some(row=>row.objectId===ids[0]),false,"the initial modified exile event has no invented entry or counter result");
  return {state,ids,events};
};

for(const kind of ["entry","zone"])run(`new ${kind} replacement redirects an earlier prepared return`,()=>{
  let {state,ids,events}=lateReturn({kind});state=JSON.parse(JSON.stringify(state));events.push(...concede(state,2));
  for(let step=0;state.awaiting&&step<20;step++){
    eq(ids.map(id=>state.objects[id]?.zone),["exile","exile"],"new live replacements finish while both original return objects remain outside the battlefield");
    state=JSON.parse(JSON.stringify(state));events.push(...resolveAwaiting(state,[0]));
  }
  const change=events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===ids[0]);
  eq(change.length,1,"the original returning object has one actual native redirected event");
  eq(change[0].data.fields.to.zoneType,kind==="entry"?"Graveyard":"Exile","the native entry or zone replacement controls the actual final destination");
  eq(change[0].data.fields.enteredAs,undefined,"a redirected return never produces a battlefield arrival");
  eq(state.objects[ids[0]],undefined,"graveyard movement and CR400.8 re-exile both retire the old identity");
  const zone=kind==="entry"?state.zones.graveyard[0]:state.zones.exile;
  const newId=zone.find(id=>state.objects[id].card==="First Late Walker");
  eq(newId!==ids[0],true,"the real destination holds a new identity even when exile remains exile");
  eq(state.objects[newId]?.counters,{},"the abandoned prospective loyalty placement does not leak counters onto a redirected card");
  eq(events.filter(event=>event.kind==="GameEventCardCounters").map(event=>event.data.fields.newValue),[7],"only the independently returning second walker reports its actual counter placement");
  eq(state.players[0].life,kind==="zone"?41:40,"the applicable native replacement followup runs once after a real redirected event");
  eq(state.awaiting,null,"redirected return and remaining sibling finish their native continuation");
});

for(const destination of ["hand","exile","departed-exile"])run(`late redirect choices ${destination}`,()=>{
  let {state,ids,events}=lateReturn({dual:true});events.push(...concede(state,2));
  events.push(...resolveAwaiting(state,[0]));
  eq(awaitingChoice(state).id.startsWith(`zone-replacements:${ids[0]}:`),true,"two newly live redirects require the native affected player's actual replacement question");
  eq(ids.map(id=>state.objects[id]?.zone),["exile","exile"],"no prepared sibling commits before the late replacement answer");
  const frame=state.ruleOperation.frames.at(-1),parent=state.ruleOperation.frames.at(-2),batch=state.ruleOperation.sbaReturnBatches[parent.returnBatchId];
  const oldKey=frame.reopenReturn;
  for(const corrupt of [child=>child.reopenReturn="forged",child=>child.returnBatchId="forged",child=>child.proposal.objectId=ids[1],
    child=>child.proposal.from="hand",child=>child.preparedCounterResult="forged"]){
    const copy=JSON.parse(JSON.stringify(state));corrupt(copy.ruleOperation.frames.at(-1));
    assert.throws(()=>resolveAwaiting(copy,[0]),/native|internal/);checks++;
    eq(ids.map(id=>copy.objects[id]?.zone),["exile","exile"],"forged batch/key/object/from/counter receipts cannot commit a return");
  }
  assert.throws(()=>reopenPreparedSbaReturn(state,parent,ids[0]),/native/);checks++;
  state=JSON.parse(JSON.stringify(state));
  const before=JSON.stringify(state);assert.throws(()=>resolveAwaiting(state,[2]),/Invalid selection/);checks++;
  eq(JSON.stringify(state),before,"an invalid late replacement answer preserves the complete native continuation");
  if(destination==="departed-exile")events.push(...concede(state,1));
  else events.push(...resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.label.includes(`Late Modifier ${destination}`))]));
  for(let step=0;state.awaiting&&step<20;step++)events.push(...resolveAwaiting(state,[0]));
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===ids[0]).map(event=>event.data.fields.to.zoneType),
    [destination==="exile"?"Exile":"Hand"],"the explicit legal answer, or surviving live candidate after concession, determines the actual destination");
  eq([state.players[0].life,state.players[1].life],destination==="exile"?[40,41]:[41,40],"the actual chosen modifier controller receives its followup once; no other controller gains life");
  eq(events.filter(event=>event.kind==="GameEventCardCounters").map(event=>event.data.fields.newValue),[7],"late redirects never emit the discarded first entry's prospective counters");
  eq(state.ruleOperation,undefined,"the native return operation completes once after its replacement answer");
  assert.throws(()=>reopenPreparedSbaReturn(state,{...parent,stage:"zone-recheck"},ids[0]),/internal|native/);checks++;
  eq(oldKey.startsWith(`${batch.operation}:sba-return-move:`),true,"the recheck consumed an actual operation-bound preparation rather than a caller skip flag");
});

run("ordinary same-exile move keeps its established CR400.8 identity",()=>{
  const state=createState({players:[{name:"A"},{name:"B"}]}),events=[];
  const old=addObject(state,{card:"Ordinary Exile Identity",types:["Artifact"],owner:0,controller:0},"exile");
  const moved=moveOne(state,old,"exile",events);
  eq([state.objects[old],state.objects[moved]?.zone,moved!==old],[undefined,"exile",true],"ordinary re-exile creates a new object without return-ledger or skip flags");
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone").map(event=>[event.data.fields.from.zoneType,event.data.fields.to.zoneType,event.data.fields.enteredAs]),
    [["Exile","Exile",undefined]],"ordinary re-exile is one native event and no battlefield entry");
});

run("late native zone replacement starts its first actual entering child",()=>{
  let {state,ids,events}=lateReturn({back:true});state=JSON.parse(JSON.stringify(state));events.push(...concede(state,2));
  events.push(...resolveAwaiting(state,[0]));
  eq(awaitingChoice(state).options.some(option=>option.pay===true),true,"a late redirect to battlefield starts the actual first native entering replacement");
  eq(ids.map(id=>state.objects[id]?.zone),["exile","exile"],"no intermediate fictitious re-exile or battlefield move occurs while the first entry question waits");
  const entry=state.ruleOperation.frames.at(-1),move=state.ruleOperation.frames.at(-2),parent=state.ruleOperation.frames.at(-3);
  eq(move.proposal.applied.length,2,"the old exile modifier and new battlefield redirect each apply once to the saved event");
  eq(!!entry.entryProgressParent,false,"this is a first native entry, not a replay of an earlier entry receipt");
  validateSbaReturnFirstEntry(state,entry);checks++;
  for(const corrupt of [copy=>copy.ruleOperation.frames.at(-3).recheckingZoneId=ids[1],
    copy=>copy.ruleOperation.frames.at(-2).reopenReturn="forged",
    copy=>copy.ruleOperation.frames.at(-2).proposal.applied=[]]){
    const copy=JSON.parse(JSON.stringify(state));corrupt(copy);
    assert.throws(()=>validateSbaReturnFirstEntry(copy,copy.ruleOperation.frames.at(-1)),/native|internal/);checks++;
    assert.throws(()=>resolveAwaiting(copy,[0]),/native|internal/);checks++;
    eq(ids.map(id=>copy.objects[id]?.zone),["exile","exile"],"a forged first-entry parent/key/applied-zone prefix cannot commit either sibling");
  }
  state=JSON.parse(JSON.stringify(state));events.push(...resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.pay===true)]));
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===ids[0]).map(event=>event.data.fields.to.zoneType),["Battlefield"],"the final native event enters once with no intermediate false exile event");
  const first=state.zones.battlefield.find(id=>state.objects[id].card==="First Late Walker");
  eq([first!==ids[0],state.objects[first]?.counters.loyalty,state.objects[first]?.tapped,state.players[0].life],[true,6,false,39],"the actual first entry pays2 once, places its first doubled loyalty once and runs the selected redirect followup once");
  eq(events.filter(event=>event.kind==="GameEventCardCounters").map(event=>event.data.fields.newValue),[6,7],"only the two actual completed entries report their final counters");
  assert.throws(()=>validateSbaReturnFirstEntry(state,entry),/native/);checks++;
  assert.throws(()=>reopenPreparedSbaReturn(state,parent,ids[0]),/native|internal/);checks++;
});

run("new watcher after committed cost via concession",()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});
  Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=[0,1,2].map(index=>{const id=put({card:`Cost Return Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const ability=id=>({id,kind:"triggered",text:"Whenever you lose life, gain 1 life.",trigger:{on:"GameEventPlayerLivesChanged",loser:"you",batch:true},effects:[{effect:"gainLife",amount:1}]});
  put({card:"Existing Life Watcher",types:["Enchantment"],abilities:[ability("old-life")]});
  const garden=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/t/temple-garden.json",import.meta.url))));
  eq(garden.problems,[],"the actual saved life-payment entry card compiles");
  put({card:"Departing Owned Life Source",types:["Enchantment"],owner:2,controller:0,abilities:[ability("surviving-life-controller")]});
  put({card:"Losing Life Controller Source",types:["Enchantment"],owner:0,controller:2,abilities:[{...ability("losing-life-controller"),trigger:{on:"GameEventPlayerLivesChanged",batch:true}}]});
  const land=addObject(state,{...garden.definition,card:"Temple Garden",owner:0,controller:0},"exile");
  const watcher=addObject(state,{card:"Returning Life Watcher",types:["Creature"],power:2,toughness:2,owner:0,controller:0,abilities:[ability("returned-life")]},"exile");
  const clone=addObject(state,{...mirror.definition,card:"Clever Impersonator",owner:0,controller:0},"exile");
  const ids=[land,watcher,clone];state.exiledUntil=sources.map((source,index)=>({source,exiled:ids[index]}));
  const gate=put({card:"External Watcher Gate",types:["Enchantment"],owner:2,controller:2});
  const external=addObject(state,{card:"External Returned Life Watcher",types:["Enchantment"],owner:0,controller:0,abilities:[ability("external-returned-life")]},"exile");
  state.exiledUntil.push({source:gate,exiled:external});
  afterResolving(state,[]);
  resolveAwaiting(state,awaitingChoice(state).options.map((_,index)=>index));
  const cost=awaitingChoice(state);
  eq(cost.options.some(option=>option.pay===true),true,"the actual native entry offers its real life cost before all returns");
  const paid=resolveAwaiting(state,[cost.options.findIndex(option=>option.pay===true)]);
  eq([state.players[0].life,awaitingChoice(state).id.startsWith("entering-copy:")],[38,true],"the first real cost remains paid while a later sibling asks its copy decision");
  eq(ids.map(id=>state.objects[id]?.zone),["exile","exile","exile"],"no returning object moved after the committed cost and before the later decision");
  eq(paid.filter(event=>event.kind==="GameEventPlayerLivesChanged").length,1,"the committed native cost prefix is reported once before the later question");
  const originalLength=state.ruleOperation.events.length,reported=state.ruleOperation.reported;
  const firstPrefix=pendingSbaReturnEvents(state),again=pendingSbaReturnEvents(state);
  eq(firstPrefix,again,"overlapping native prefix requests preserve the actual append-only operation event list");
  eq([state.ruleOperation.events.length,state.ruleOperation.reported],[originalLength,reported],"canonical receipt marking cannot splice or renumber the reported prefix");
  const corrupt=JSON.parse(JSON.stringify(state));corrupt.ruleOperation.frames.find(frame=>frame.kind==="sba-linked-returns").returnBatchId="forged";
  assert.throws(()=>pendingSbaReturnEvents(corrupt),/native|internal/);checks++;
  state=JSON.parse(JSON.stringify(state));concede(state,2);
  pendingSbaReturnEvents(state);state=JSON.parse(JSON.stringify(state));
  const finished=resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.copyOf===null)]);
  eq(state.players[0].life,38,"reload and independent concession cannot snapshot-rollback the real paid cost");
  eq(state.players[2].lost,true,"the independent outside concession remains authoritative after the saved entry resumes");
  eq(finished.filter(event=>event.kind==="GameEventPlayerLivesChanged").length,0,"finishing the returns does not replay the already-reported cost prefix");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="old-life").length,1,"the already-existing watcher sees the native paid life once");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="returned-life").length,0,"a watcher returning afterward cannot see a life payment made before it entered");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="external-returned-life").length,0,"a watcher arriving during the outside concession cannot observe a prior committed cost");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="surviving-life-controller").length,1,"a now-departed source preserves its earlier actual trigger for a surviving controller");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="losing-life-controller").length,0,"a departed controller leaves no queued trigger from its earlier source");

});

run("new watcher after committed cost via devour",()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});
  Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const sources=[0,1,2].map(index=>{const id=put({card:`Cost Return Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const ability=id=>({id,kind:"triggered",text:"Whenever you lose life, gain 1 life.",trigger:{on:"GameEventPlayerLivesChanged",loser:"you",batch:true},effects:[{effect:"gainLife",amount:1}]});
  put({card:"Existing Life Watcher",types:["Enchantment"],abilities:[ability("old-life")]});
  const garden=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/t/temple-garden.json",import.meta.url))));
  eq(garden.problems,[],"the actual saved life-payment entry card compiles");
  const land=addObject(state,{...garden.definition,card:"Temple Garden",owner:0,controller:0},"exile");
  const watcher=addObject(state,{card:"Devour Return",types:["Creature"],power:2,toughness:2,owner:0,controller:0,abilities:[{id:"return-devour",kind:"replacement",watches:{event:"enters",who:"self"},change:{devour:{amount:1,of:{types:["Creature"]}}}}]},"exile");
  const clone=addObject(state,{...mirror.definition,card:"Clever Impersonator",owner:0,controller:0},"exile");
  const ids=[land,watcher,clone];state.exiledUntil=sources.map((source,index)=>({source,exiled:ids[index]}));
  const gate=put({card:"External Watcher Gate",types:["Creature"],power:2,toughness:2,owner:0,controller:0});
  const external=addObject(state,{card:"External Returned Life Watcher",types:["Enchantment"],owner:0,controller:0,abilities:[ability("external-returned-life")]},"exile");
  state.exiledUntil.push({source:gate,exiled:external});
  afterResolving(state,[]);
  resolveAwaiting(state,awaitingChoice(state).options.map((_,index)=>index));
  const cost=awaitingChoice(state);
  eq(cost.options.some(option=>option.pay===true),true,"the actual native entry offers its real life cost before all returns");
  const paid=resolveAwaiting(state,[cost.options.findIndex(option=>option.pay===true)]);
  eq(state.players[0].life,38,"the earlier native life payment remains committed before the later devour cost");
  resolveAwaiting(state,[0]);
  eq(awaitingChoice(state).id.startsWith("entering-copy:"),true,"the later sibling's real copy question follows the real sacrifice cost");
  eq(ids.map(id=>state.objects[id]?.zone),["exile","exile","exile"],"no returning object moved after the committed cost and before the later decision");
  eq(paid.filter(event=>event.kind==="GameEventPlayerLivesChanged").length,1,"the committed native cost prefix is reported once before the later question");
  state=JSON.parse(JSON.stringify(state));
  const finished=resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.copyOf===null)]);
  eq(state.players[0].life,38,"reload and independent concession cannot snapshot-rollback the real paid cost");

  eq(finished.filter(event=>event.kind==="GameEventPlayerLivesChanged").length,0,"finishing the returns does not replay the already-reported cost prefix");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="old-life").length,1,"the already-existing watcher sees the native paid life once");

  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="external-returned-life").length,0,"a watcher arriving from an actual later devour sacrifice cannot observe the prior committed life cost");

});

run("return owner leaves during its first late entry question",()=>{
  const {state,ids,events}=lateReturn({back:true});events.push(...concede(state,2));events.push(...resolveAwaiting(state,[0]));
  eq(awaitingChoice(state).options.some(option=>option.pay===true),true,"the owner's real first entering cost is still unanswered");
  events.push(...concede(state,0));
  eq(ids.map(id=>state.objects[id]),[undefined,undefined],"the departing owner's old exile objects leave the game and cannot be resurrected by saved entry receipts");
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&ids.includes(event.data.fields.card?.cardId)&&event.data.fields.enteredAs!==undefined).length,0,"owner departure never commits an already prepared battlefield arrival");
  eq(events.filter(event=>event.kind==="GameEventCardCounters").length,0,"no planned counters are journaled for an owner who leaves before any return");
  eq(state.players[0].life,40,"the unanswered two-life cost is never paid for the departing owner");
  eq(state.ruleOperation,undefined,"all expired return members finish without leaving a reusable native receipt");
});

const reachFirstDiscard = ({graveChoices=false}={}) => {
  const result=lateReturn({back:true,discardFirst:true,graveChoices}),{state,events}=result;
  events.push(...concede(state,2));events.push(...resolveAwaiting(state,[0]));
  const order=awaitingChoice(state);
  eq(order.id.startsWith("entry-order:"),true,"the first native entry orders its two actual replacements explicitly");
  events.push(...resolveAwaiting(state,[order.options.findIndex(option=>option.label.includes("Pay two life"))]));
  events.push(...resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.pay===true)]));
  eq(state.players[0].life,38,"the real first-entry cost is committed before the later discard condition");
  eq(awaitingChoice(state).options.some(option=>option.discard===null),true,"the actual loaded condition explicitly offers declining the land discard");
  return result;
};

for(const accept of [false,true])run(`first late entry completes or redirects with committed cost ${accept}`,()=>{
  let {state,ids,events}=reachFirstDiscard();state=JSON.parse(JSON.stringify(state));
  events.push(...resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>accept?option.discard!==null:option.discard===null)]));
  for(let step=0;state.awaiting&&step<20;step++)events.push(...resolveAwaiting(state,[0]));
  const moves=events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===ids[0]);
  eq(moves.map(event=>event.data.fields.to.zoneType),[accept?"Battlefield":"Graveyard"],"the actual first-child entry outcome forwards through the same native event with no intermediate false zone change");
  eq(state.objects[ids[0]],undefined,"both completed and redirected outcomes produce their proper final new identity");
  eq(events.filter(event=>event.kind==="GameEventCardCounters").map(event=>event.data.fields.newValue),accept?[6,7]:[7],"only actual battlefield entries emit their once-only final counters");
  eq(state.players[0].life,39,"the earlier real two-life cost stays paid once and the already-bound zone followup occurs once");
  eq(state.zones.graveyard[0].filter(id=>state.objects[id].card==="Actual Discard Land").length,accept?1:0,"only accepting the native discard cost moves the actual land card once");
  eq(state.awaiting,null,"both native child outcomes finish before granting priority");
});

for(const destination of ["hand","exile"])run(`first-child redirect receipt survives final choice ${destination}`,()=>{
  let {state,ids,events}=reachFirstDiscard({graveChoices:true});
  events.push(...resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.discard===null)]));
  eq(awaitingChoice(state).id.startsWith(`zone-replacements:${ids[0]}:`),true,"the actual redirected event still offers both remaining genuine zone replacements");
  const move=state.ruleOperation.frames.at(-1),entryKey=move.entryProgress;
  eq(!!state.ruleOperation.sbaEntryProgress[entryKey],true,"the exact first-child receipt survives the saved native zone continuation");
  eq(move.proposal.applied.length,2,"the applied exile and battlefield replacements remain in the same proposal before the final choice");
  for(const corrupt of [copy=>copy.ruleOperation.frames.at(-1).entryProgress="forged",
    copy=>copy.ruleOperation.sbaEntryProgress[entryKey].operation++,copy=>copy.ruleOperation.sbaEntryProgress[entryKey].sourceCohortId="forged",
    copy=>copy.ruleOperation.sbaEntryProgress[entryKey].objectId=ids[1],copy=>copy.ruleOperation.sbaEntryProgress[entryKey].result.entering.to="hand",
    copy=>copy.ruleOperation.frames.at(-2).recheckingZoneId=ids[1]]){
    const copy=JSON.parse(JSON.stringify(state));corrupt(copy);
    assert.throws(()=>resolveAwaiting(copy,[0]),/native|internal/);checks++;
    eq(ids.map(id=>copy.objects[id]?.zone),["exile","exile"],"a forged child receipt or parent cannot move either saved sibling or bypass its real replacement question");
  }
  state=JSON.parse(JSON.stringify(state));
  const before=JSON.stringify(state);assert.throws(()=>resolveAwaiting(state,[2]),/Invalid selection/);checks++;
  eq(JSON.stringify(state),before,"invalid final replacement selection preserves paid cost and every saved child receipt");
  events.push(...resolveAwaiting(state,[awaitingChoice(state).options.findIndex(option=>option.label.includes(`Final Redirect ${destination}`))]));
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===ids[0]).map(event=>event.data.fields.to.zoneType),[destination==="hand"?"Hand":"Exile"],"the selected remaining replacement controls the single final move");
  eq(events.filter(event=>event.kind==="GameEventCardCounters").map(event=>event.data.fields.newValue),[7],"redirecting the first child never journals its abandoned prospective counters");
  eq(state.players[0].life,39,"overlapping zone replacements never repeat or undo the earlier real payment or followup");
});

/* Generic followup fixture: actual supported native replacement/createToken/linked-return operations.
   No saved-card execution credit is claimed for this custom death watcher. */
run("base deaths precede an actual followup-created watcher",()=>{
  const state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const watch=id=>({id,kind:"triggered",text:"Whenever a creature dies, gain 1 life.",
    trigger:{on:"GameEventCardChangeZone",from:"Battlefield",to:"Graveyard",who:"any",filter:{types:["Creature"]}},effects:[{effect:"gainLife",amount:1}]});
  const first=put({card:"Callback Birth Battle",types:["Battle"],defense:0,protector:0});
  const second=put({card:"Callback Link Battle",types:["Battle"],defense:0,protector:0});
  const bear=put({card:"Actual Callback Dead Bear",types:["Creature"],power:2,toughness:2});state.objects[bear].damage=2;
  put({card:"Existing Callback Watcher",types:["Enchantment"],abilities:[watch("callback-old")]});
  put({card:"Native Callback Replacement",types:["Enchantment"],abilities:[{id:"callback-replacement",kind:"replacement",
    watches:{event:"zone-change",from:"battlefield",to:"graveyard",filter:{named:"Callback Birth Battle"}},change:{to:"exile",then:[{effect:"createToken",count:1,
      token:{name:"Followup Callback Watcher",types:["Enchantment"],abilities:[watch("callback-new")]}}]}}]});
  const elf=addObject(state,{card:"Callback Linked Elf",types:["Creature"],subtypes:["Elf"],power:2,toughness:2,owner:0,controller:0},"exile");
  state.exiledUntil=[{source:second,exiled:elf}];
  const events=afterResolving(state,[]);
  const newborn=state.zones.battlefield.filter(id=>state.objects[id].token&&state.objects[id].abilities?.some(ability=>ability.id==="callback-new"));
  eq(newborn.length,1,"the supported replacement followup actually creates its new watcher before linked-return preflight");
  eq(events.filter(event=>event.kind==="GameEventCardChangeZone"&&event.data.fields.card.cardId===elf&&event.data.fields.enteredAs!==undefined).length,1,"the actual linked Elf returns once after all source callbacks");
  eq([state.objects[first],state.objects[second],state.objects[bear]],[undefined,undefined,undefined],"the simultaneous base identities really departed before callback birth and linked return");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="callback-old").length,1,"the existing watcher sees the one actual base creature death once");
  eq([...state.stack,...state.pendingTriggers].filter(entry=>entry.abilityId==="callback-new").length,0,"a watcher actually born in a preflight callback cannot see the earlier committed base death");
});

for(const total of [5,6])run(`two loaded Mimics share an ability ID, second counter order ${total}`,()=>{
  let state=createState({players:[{name:"A"},{name:"B"},{name:"C"}]});Object.assign(state,{phase:"MAIN1",turn:1,activePlayer:0,priorityPlayer:0});
  const put=object=>addObject(state,{owner:0,controller:0,...object},"battlefield");
  const mimic=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/m/metallic-mimic.json",import.meta.url))));
  eq(mimic.problems,[],"the actual saved Metallic Mimic definition compiles");
  for(let index=0;index<2;index++){
    const old=addObject(state,{...mimic.definition,card:"Metallic Mimic",owner:0,controller:0},"hand",0);
    beginRuleOperation(state,{kind:"move-one",id:old,to:"battlefield"});
    for(let step=0;state.awaiting&&step<10;step++){
      const choice=awaitingChoice(state),elf=choice.options.findIndex(option=>option.chosen==="Elf");
      answerRuleOperation(state,[elf>=0?elf:0]);
    }
    eq(state.ruleOperation,undefined,"each real Mimic finishes its native entering operation");
  }
  const holders=state.zones.battlefield.filter(id=>state.objects[id].card==="Metallic Mimic");
  eq(holders.map(id=>state.objects[id].chosen),["Elf","Elf"],"both actual Mimics made the real entering Elf choice");
  eq(new Set(holders).size,2,"the same printed modifier belongs to two physically distinct sources");
  state=JSON.parse(JSON.stringify(state));
  const sources=[0,1].map(index=>{const id=put({card:`Shared-ID Source ${index}`,types:["Battle"],defense:0});state.objects[id].protector=0;return id;});
  const ids=["First Shared-ID Elf","Second Shared-ID Elf"].map(card=>addObject(state,{card,types:["Creature"],subtypes:["Elf"],power:2,toughness:2,owner:0,controller:0},"exile"));
  const season=compileScript(JSON.parse(readFileSync(new URL("../game/engine/cards/d/doubling-season.json",import.meta.url))));eq(season.problems,[],"the real loaded counter doubler compiles");put({...season.definition,card:"Doubling Season"});
  put({card:"Second Counter Plus One",types:["Enchantment"],abilities:[{id:"second-plus",kind:"static",rule:"more-counters",counter:"+1/+1",plus:1,affects:{what:"permanent",controller:"you",named:"Second Shared-ID Elf"}}]});
  state.exiledUntil=sources.map((source,index)=>({source,exiled:ids[index]}));
  const events=afterResolving(state,[]);
  for(let step=0;state.awaiting&&step<30;step++){
    const choice=awaitingChoice(state),counter=choice.id.startsWith("entry-counters:");
    if(counter){
      const entry=Object.values(state.ruleOperation.sbaEntryProgress).find(row=>row.objectId===ids[0]);
      const result=Object.values(state.ruleOperation.entryCounterResults).find(row=>row.objectId===ids[0]);
      eq(entry.frame.proposal.applied,["a2","a2"],"two legitimate loaded modifiers share the same bare ability ID");
      eq(new Set(entry.frame.proposal.appliedBy).size,2,"the native entry prefix distinguishes their holder-plus-ability identities");
      eq(result.progress.entryApplied,entry.frame.proposal.appliedBy,"counter continuation binds to that exact canonical entry identity prefix");
      const copy=JSON.parse(JSON.stringify(state)),bad=Object.values(copy.ruleOperation.entryCounterResults).find(row=>row.objectId===ids[0]);
      bad.progress.entryApplied[1]=bad.progress.entryApplied[0];
      assert.throws(()=>resolveAwaiting(copy,[0]),/native|prefix/);checks++;
      eq(ids.map(id=>copy.objects[id]?.zone),["exile","exile"],"duplicating one holder-plus-ability key still cannot commit either native return");
    }
    const answer=choice.mode==="order"?choice.options.map((_,index)=>index):[counter?choice.options.findIndex(option=>option.puts===total):0];
    state=JSON.parse(JSON.stringify(state));events.push(...resolveAwaiting(state,answer));
  }
  eq(state.awaiting,null,"every real shared-ID replacement and counter choice completes");
  eq(["First Shared-ID Elf","Second Shared-ID Elf"].map(card=>state.objects[state.zones.battlefield.find(id=>state.objects[id].card===card)]?.counters["+1/+1"]),[4,total],"each actual Mimic grants once and the explicit second counter order remains authoritative");
  eq(events.filter(event=>event.kind==="GameEventCardCounters").map(event=>event.data.fields.newValue),[4,total],"only actual final placements are journaled once per returning Elf");
});

assert.deepEqual(failures,[],failures.join("\n"));
console.log(`engine-battle-linked-returns: ${checks} checks; actual simultaneous return preflight`);
