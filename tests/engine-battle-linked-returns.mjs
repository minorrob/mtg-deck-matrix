/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 610.3d, 614.12a, 101.4: simultaneous linked returns remain outside the battlefield through every entry choice. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {afterResolving} from "../game/engine/rules/priority.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {entryCounterResult, entryCounterProgressFrame} from "../game/engine/rules/entry-characteristics.mjs";

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
    progress=>progress.counts.loyalty=99,progress=>progress.kinds.push("shield"),progress=>progress.applied.loyalty.push(progress.applied.loyalty[0])]){
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

assert.deepEqual(failures,[],failures.join("\n"));
console.log(`engine-battle-linked-returns: ${checks} checks; actual simultaneous return preflight`);
