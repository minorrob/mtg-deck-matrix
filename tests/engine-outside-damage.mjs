/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createState,addObject} from "../game/engine/state/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions,applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice,resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {ruleReplacementCandidates,applyRuleReplacement,consumeDamageReplacements} from "../game/engine/rules/replacement.mjs";
import {controllerOf} from "../game/engine/rules/layers.mjs";
import {manaTriggered} from "../game/engine/rules/trigger.mjs";
const cards=loadCardIndex();let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const state=()=>{const s=createState({matchId:"outside-damage",seed:"outside-damage",players:["Rob","Maya","Trey","Lee"].map(name=>({name}))});s.turn=1;s.phase="MAIN1";s.activePlayer=0;s.priorityPlayer=0;return s;};
const on=(s,o,owner=0,controller=owner)=>addObject(s,{...o,owner,controller},"battlefield",null);
const card=name=>({...cards.definition(name),card:name});
const reefWith=(s,then,cost={})=>{const definition=card("Shivan Reef");definition.abilities=structuredClone(definition.abilities);Object.assign(definition.abilities[1],cost,{then});return on(s,definition);};
const change=(s,name,change,owner=0)=>on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"damage",toPlayer:0},change}]},owner);
const answer=(s,name)=>{const c=awaitingChoice(s),i=c.options.findIndex(o=>o.label.startsWith(name));assert.ok(i>=0,JSON.stringify(c));return resolveAwaiting(s,[i]);};
const activate=(s,id)=>applyAction(s,0,legalActions(s,0).find(a=>a.kind==="activate-mana"&&a.objectId===id&&a.mana?.R===1));
for(const [first,damage] of [["Add two",9],["Fiery Emancipation",5]]){
  let s=state();const reef=on(s,card("Shivan Reef"));on(s,card("Fiery Emancipation"));change(s,"Add two",{add:2});
  const events=activate(s,reef);
  eq([s.awaiting.kind,s.awaiting.player,s.players[0].life,s.players[0].manaPool.R,s.objects[reef].tapped],["rule-operation",0,40,1,true]);
  const before=JSON.stringify(s);assert.throws(()=>resolveAwaiting(s,[99]),/Invalid selection/);checks++;eq(JSON.stringify(s),before,"invalid input does not alter a pending event");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,first));
  eq([s.awaiting,s.players[0].life,s.players[0].manaPool.R,s.stack.length],[null,40-damage,1,0]);
  eq(events.filter(e=>e.kind==="GameEventManaPool").length,1,"produce mana once across reload");
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>e.data.fields.amount),[damage]);
}
{
  let s=state();const reef=on(s,card("Shivan Reef"));const triple=change(s,"Triple",{multiply:3},1);change(s,"Add two",{add:2},2);change(s,"Add one",{add:1},3);
  const events=activate(s,reef);events.push(...answer(s,"Triple"));
  eq(s.players[0].life,40,"an applied replacement still waits for the final event");
  events.push(...concede(s,1));eq(s.objects[triple],undefined);
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Add two"));
  eq(s.players[0].life,34,"already applied tripling survives its holder's concession");
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>e.data.fields.amount),[6]);
}
{
  let s=state();const reef=on(s,card("Shivan Reef"));change(s,"Triple",{multiply:3});change(s,"Add two",{add:2});
  const shield=on(s,{card:"Finite shield",types:["Artifact"],abilities:[{id:"finite",kind:"replacement",text:"Prevent the next 3 damage to you.",watches:{event:"damage",toPlayer:"controller"},prevent:3}]});
  const events=activate(s,reef);events.push(...answer(s,"Add two"));
  eq([s.players[0].life,s.objects[shield].abilities[0].prevent],[40,3],"ordering spends no finite shield");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Triple"));
  eq([s.players[0].life,s.objects[shield].abilities[0].prevent],[34,0]);
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>e.data.fields.amount),[6]);
}
{
  const s=state();const shield=on(s,{card:"Finite shield",types:["Artifact"],abilities:[{id:"finite",kind:"replacement",watches:{event:"damage",toPlayer:"controller"},prevent:3}]});
  const p={event:"damage",toPlayer:0,sourceId:null,amount:2};const before=JSON.stringify(s);
  const next=applyRuleReplacement(s,p,ruleReplacementCandidates(s,p)[0].key);
  eq(JSON.stringify(s),before,"a single saved replacement is side-effect free until commit");
  eq(next.amount,0);eq(next.damageConsumption,[{kind:"finite",holder:shield,ability:"finite",amount:2}]);
  consumeDamageReplacements(s,next);eq(s.objects[shield].abilities[0].prevent,1);
}
for (const allocation of [[3,0],[0,3],[1,2],[2,1]]) {
  let s=state();const definition=card("Shivan Reef");
  definition.abilities=structuredClone(definition.abilities);
  definition.abilities[1].then=[{effect:"damageEach",selector:{what:"permanent",types:["Creature"]},dealt:3,who:"you"}];
  const reef=on(s,definition),a=on(s,{card:"First dealer",types:["Creature"],power:1,toughness:4}),b=on(s,{card:"Second dealer",types:["Creature"],power:1,toughness:4});
  const shield=on(s,{card:"Shared shield",types:["Artifact"],abilities:[{id:"finite",kind:"replacement",text:"Prevent the next 3 damage to you.",watches:{event:"damage",toPlayer:"controller"},prevent:3}]});
  const events=activate(s,reef),choice=awaitingChoice(s);
  eq([choice.mode,choice.total,choice.options.map(o=>o.max),s.players[0].life,s.objects[shield].abilities[0].prevent],["amount",3,[3,3],40,3],"simultaneous hits offer a real allocation before consuming a shield");
  const before=JSON.stringify(s);
  for (const bad of [[3,3],[-1,4],[1,1],[0.5,2.5],[3],null]) {assert.throws(()=>resolveAwaiting(s,[],bad),/Invalid selection/);checks++;}
  eq(JSON.stringify(s),before,"invalid allocations do not consume a question or a shield");
  s=JSON.parse(before);events.push(...resolveAwaiting(s,[],allocation));
  eq([s.awaiting,s.players[0].life,s.objects[shield].abilities[0].prevent,s.players[0].manaPool.R],[null,37,0,1]);
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>[e.data.fields.source.cardId,e.data.fields.amount]),[[a,3-allocation[0]],[b,3-allocation[1]]].filter(([,n])=>n>0),"the affected player's allocation determines each actual source's damage");
}
{
  let s=state();const definition=card("Shivan Reef");definition.abilities=structuredClone(definition.abilities);definition.abilities[1].sacrificeSelf=true;
  const reef=on(s,definition,1,0);
  change(s,"Triple",{multiply:3});change(s,"Add two",{add:2});
  on(s,{card:"Mana observer",types:["Artifact"],abilities:[{id:"provenance",kind:"static",condition:{spentFrom:{types:["Land"]}}},{id:"observe",kind:"triggered",trigger:{on:"GameEventPlayerDamaged",sourceYours:true,noncombat:true},effects:[{effect:"gainLife",amount:1}]}]});
  for (const [name,to] of [["Exile cost","exile"],["Return cost","hand"]]) on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"zone-change",from:"battlefield",to:"graveyard",filter:{types:["Land"]}},change:{to}}]});
  const events=activate(s,reef);
  eq([s.awaiting.kind,s.players[0].life,s.players[0].manaPool.R,s.objects[reef].tapped,s.objects[reef].zone],["rule-operation",40,0,true,"battlefield"],"replacement choice for a sacrifice cost precedes mana and damage");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Exile cost"));
  eq([s.objects[reef],s.players[0].manaPool.R,s.players[0].life,s.awaiting.kind],[undefined,1,40,"rule-operation"]);
  eq(s.players[0].manaRiders.map(r=>[r.source,r.from.cardId,r.from.controller,r.from.types]),[[reef,reef,0,["Land"]]],"mana provenance keeps the exact departed source and its derived controller");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Triple"));
  eq(s.players[0].life,35);
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>[e.data.fields.source.cardId,e.data.fields.source.controller,e.data.fields.amount]),[[reef,0,5]],"damage from the sacrificed borrowed source uses its matching LKI");
  eq(events.filter(e=>e.kind==="GameEventManaPool").map(e=>[e.data.fields.source.cardId,e.data.fields.source.controller]),[[reef,0]],"moving costs keep original mana source attribution");
  eq(events.filter(e=>e.data?.fields?.sacrificed).map(e=>e.data.fields.sacrificer),[0]);
  eq(s.stack.map(e=>e.abilityId),["observe"],"a source-you-control damage trigger sees derived departure control once");
}
{
  let s=state();const definition=card("Shivan Reef");definition.abilities=structuredClone(definition.abilities);
  const source=on(s,{card:"Borrowed dealer",types:["Creature"],power:1,toughness:4},3);
  definition.abilities[1].then=[{effect:"damageEach",selector:{what:"permanent",named:"Borrowed dealer"},dealt:1,who:"you"}];
  const reef=on(s,definition);
  on(s,{card:"Control layer",types:["Enchantment"],abilities:[{id:"control",kind:"static",layer:2,affects:{ids:[source]},apply:{controller:1}}]},2);
  on(s,{card:"Source observer",types:["Artifact"],abilities:[{id:"wrong-controller",kind:"triggered",trigger:{on:"GameEventPlayerDamaged",sourceYours:true},effects:[{effect:"gainLife",amount:1}]}]},1);
  change(s,"Triple",{multiply:3});change(s,"Add two",{add:2});change(s,"Add one",{add:1});
  eq(controllerOf(s,source),1);
  const events=activate(s,reef);events.push(...answer(s,"Triple"));
  s=JSON.parse(JSON.stringify(s));events.push(...concede(s,2));eq(controllerOf(s,source),3);
  s=JSON.parse(JSON.stringify(s));events.push(...concede(s,3));eq(s.objects[source],undefined);
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Add two"));
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>[e.data.fields.source.cardId,e.data.fields.source.controller,e.data.fields.amount]),[[source,3,6]],"departure captures control after an earlier unrelated holder left");
  eq(s.stack.length,0,"a surviving former controller gets no damage trigger from stale control");
}
{
  let s=state();const reef=reefWith(s,[{effect:"gainLife",amount:2},{effect:"branch",if:{handEmpty:true},then:[
    {effect:"repeatFor",each:"player",effects:[{effect:"dealDamage",amount:1,who:"that player"}]}]},
    {effect:"putCounter",targets:[-1],counter:"charge",count:1}]);
  // The suffix must address the exact original source after the nested questions.
  s.objects[reef].abilities[1].then[2].targets=[reef];
  for (const [name,change] of [["Triple",{multiply:3}],["Add two",{add:2}]]) on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"damage"},change}]});
  const events=activate(s,reef);eq(s.players[0].life,42,"prefix life gain completes before nested damage asks");
  for(let player=0;player<4;player++) {
    eq(s.awaiting.player,player,"each affected player owns the nested replacement choice");
    s=JSON.parse(JSON.stringify(s));events.push(...answer(s,player%2 ? "Add two":"Triple"));
  }
  eq(s.players.map(p=>p.life),[37,31,35,31]);eq(s.objects[reef].counters.charge,1,"suffix resolves once after all nested questions");
  eq(events.filter(e=>e.kind==="GameEventManaPool").length,1);
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>e.data.fields.amount),[5,9,5,9]);
}
{
  let s=state();const reef=reefWith(s,[{effect:"dealDamage",amount:1,who:"you"},{effect:"dealDamage",amount:2,who:"you"}]);
  change(s,"Triple",{multiply:3});change(s,"Add two",{add:2});
  s.effects=[{id:"once",rule:"prevent-damage",players:[0],next:true,apply:{},until:"end-of-turn",sourceController:0,name:"Once"}];
  const events=activate(s,reef);eq(s.effects.length,1,"asking leaves a next-use shield intact");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Once"));
  eq([s.players[0].life,s.effects.length,s.awaiting.player],[40,0,0],"only the first settled hit consumes the next-use shield");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Triple"));
  eq(s.players[0].life,32);eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>e.data.fields.amount),[8]);
}
{
  let s=state();const reef=on(s,card("Shivan Reef")),target=on(s,{card:"Redirect target",types:["Creature"],power:1,toughness:20},1);
  const aura=on(s,card("Pariah"));
  s.objects[aura].attachedTo=target;s.objects[target].attachments.push(aura);
  change(s,"Add two",{add:2});
  for (const [name,change] of [["Card triple",{multiply:3}],["Card add",{add:2}]]) on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"damage",toCard:{named:"Redirect target"}},change}]});
  const events=activate(s,reef);events.push(...answer(s,"Pariah"));
  eq(s.awaiting.player,1,"redirection transfers the next real ordering choice to the card's controller");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Card add"));
  eq([s.players[0].life,s.objects[target].damage],[40,9]);
  eq(events.filter(e=>e.kind==="GameEventCardDamaged").map(e=>[e.data.fields.card.cardId,e.data.fields.amount]),[[target,9]]);
  eq(s.objects[aura].attachedTo,target);
}
{
  let s=state();const target=on(s,{card:"Shielded target",types:["Creature"],power:1,toughness:20,counters:{shield:1}}),a=on(s,{card:"Dealer a",types:["Creature"],power:1,toughness:4}),b=on(s,{card:"Dealer b",types:["Creature"],power:1,toughness:4});
  s.objects[target].counters.shield=1;
  const reef=reefWith(s,[{effect:"damageEach",selector:{anyOf:[{what:"permanent",named:"Dealer a"},{what:"permanent",named:"Dealer b"}]},dealt:3,targets:[target]}]);
  const events=activate(s,reef);
  eq([s.objects[target].damage,s.objects[target].counters.shield],[0,0],"one shield counter prevents all simultaneous damage to its permanent");
  eq(events.filter(e=>e.kind==="GameEventCardCounters"&&e.data.fields.type==="shield").length,1);
  eq(events.filter(e=>e.kind==="GameEventCardDamaged").length,0);
}
for (const leaving of ["actor","recipient"]) {
  let s=state();const target=on(s,{card:"Recipient",types:["Creature"],power:1,toughness:20},1);
  const reef=reefWith(s,[{effect:"dealDamage",amount:1,targets:[target]},{effect:"gainLife",amount:2}]);
  for (const [name,change] of [["Triple",{multiply:3}],["Add two",{add:2}]]) on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"damage"},change}]});
  const events=activate(s,reef);eq(s.awaiting.player,1);
  s=JSON.parse(JSON.stringify(s));events.push(...concede(s,leaving==="actor" ? 0:1));
  if(s.awaiting) events.push(...answer(s,"Triple"));
  eq(events.filter(e=>e.kind==="GameEventCardDamaged").length,0,"departure never redirects an abandoned hit to a different recipient");
  eq([s.awaiting,s.ruleOperation],[null,undefined]);
  eq(s.players[0].life,leaving==="actor" ? 40:42,"only a surviving actor completes the remaining suffix");
}
{
  let s=state();const definition=card("Swamp");definition.abilities=structuredClone(definition.abilities);definition.abilities[0].sacrificeSelf=true;
  const swamp=on(s,definition),revenant=on(s,card("Nirkana Revenant"));
  for (const [name,to] of [["Exile cost","exile"],["Return cost","hand"]]) on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"zone-change",from:"battlefield",to:"graveyard",filter:{subtypes:["Swamp"]}},change:{to}}]});
  const events=applyAction(s,0,legalActions(s,0).find(a=>a.kind==="activate-mana"&&a.objectId===swamp));
  eq([s.awaiting.kind,s.players[0].manaPool.B],["rule-operation",0]);
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Exile cost"));
  eq([s.objects[swamp],s.players[0].manaPool.B,s.awaiting],[undefined,2,null],"a real Nirkana Revenant sees the Swamp tapped for mana even after its sacrifice cost moved it");
  const mana=events.filter(e=>e.kind==="GameEventManaPool");
  eq(mana.map(e=>[e.data.fields.source.cardId,e.data.fields.produced]),[[swamp,{B:1}],[revenant,{B:1}]],"base and triggered mana each happen once with exact source IDs");
  eq(manaTriggered(s,mana[0],{cardId:swamp+99,types:["Land"],subtypes:["Swamp"],controller:0}),[],"another object's snapshot cannot satisfy the moved mana source filter");
}
{
  let s=state();const reef=reefWith(s,[{effect:"dealDamage",amount:1,who:[1]}],{sacrificeSelf:true});
  s.objects[reef].keywords=["Infect","Lifelink"];
  for(const [name,change] of [["Triple",{multiply:3}],["Add two",{add:2}]]) on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"damage",source:{types:["Land"]}},change}]});
  const events=activate(s,reef);eq(s.awaiting.player,1,"source filters read the matching departed land");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Triple"));
  eq([s.players[0].life,s.players[1].life,s.players[1].poison],[45,40,5],"departed source retains infect and lifelink as damage is dealt");
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>[e.data.fields.source.cardId,e.data.fields.infect,e.data.fields.amount]),[[reef,true,5]]);
}
{
  const s=state(),source=on(s,{card:"Borrowed lifelinker",types:["Creature"],power:1,toughness:4,keywords:["Lifelink"]},3);
  s.effects=[{id:"borrowed",layer:2,timestamp:1,affects:{ids:[source]},apply:{controller:1}}];
  const reef=reefWith(s,[{effect:"damageEach",selector:{what:"permanent",named:"Borrowed lifelinker"},dealt:2,who:"you"}]);
  const events=activate(s,reef);
  eq(s.players.map(p=>p.life),[38,42,40,40],"a live source's derived controller receives its lifelink life");
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>e.data.fields.source.controller),[1]);
}
{
  let s=state();const a=on(s,{card:"First simultaneous dealer",types:["Creature"],power:1,toughness:4}),b=on(s,{card:"Second simultaneous dealer",types:["Creature"],power:1,toughness:4});
  const reef=reefWith(s,[{effect:"damageEach",selector:{what:"permanent",types:["Creature"]},dealt:1,who:"you"}]);
  change(s,"Triple",{multiply:3});
  const shield=on(s,{card:"Shared finite shield",types:["Artifact"],abilities:[{id:"finite",kind:"replacement",text:"Prevent the next 3 damage to you.",watches:{event:"damage",toPlayer:"controller"},prevent:3}]});
  const events=activate(s,reef);
  for (const source of [a,b]) {
    const choice=awaitingChoice(s),index=choice.options.findIndex(o=>o.label.startsWith("Triple")&&o.label.includes(s.objects[source].card));
    assert.ok(index>=0,"the affected player can apply a modifier to either simultaneous source before allocating a shared shield");checks++;
    s=JSON.parse(JSON.stringify(s));events.push(...resolveAwaiting(s,[index]));
  }
  eq([s.awaiting.choice.mode,s.awaiting.choice.options.map(o=>o.max),s.objects[shield].abilities[0].prevent],["amount",[3,3],3]);
  s=JSON.parse(JSON.stringify(s));events.push(...resolveAwaiting(s,[],[0,3]));
  eq([s.players[0].life,s.objects[shield].abilities[0].prevent],[37,0]);
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").map(e=>[e.data.fields.source.cardId,e.data.fields.amount]),[[a,3]],"both modifiers can precede the prevention allocated to the second source alone");
}
{
  let s=state();const target=on(s,{card:"Changing controller target",types:["Creature"],power:1,toughness:20});
  on(s,{card:"Temporary controller",types:["Enchantment"],abilities:[{id:"control",kind:"static",layer:2,affects:{ids:[target]},apply:{controller:1}}]},2);
  const reef=reefWith(s,[{effect:"dealDamage",amount:1,targets:[target]}]);
  for(const [name,change] of [["Triple",{multiply:3}],["Add two",{add:2}]]) on(s,{card:name,types:["Enchantment"],abilities:[{id:name,kind:"replacement",text:name,watches:{event:"damage"},change}]});
  const events=activate(s,reef);eq(s.awaiting.player,1);
  s=JSON.parse(JSON.stringify(s));events.push(...concede(s,2));eq(controllerOf(s,target),0);
  eq([s.awaiting?.player,s.objects[target].damage],[0,0],"a former controller's question is replaced by the newly affected player's real choice");
  s=JSON.parse(JSON.stringify(s));events.push(...answer(s,"Add two"));eq(s.objects[target].damage,9);
}
for (const departing of [2,3]) {
  let s=state();on(s,{card:"Allocation dealer a",types:["Creature"],power:1,toughness:4});on(s,{card:"Allocation dealer b",types:["Creature"],power:1,toughness:4});
  const reef=reefWith(s,[{effect:"damageEach",selector:{what:"permanent",types:["Creature"]},dealt:3,who:"you"}]);
  const shield=on(s,{card:"Departing shield",types:["Artifact"],abilities:[{id:"finite",kind:"replacement",watches:{event:"damage",toPlayer:0},prevent:3}]},2);
  const events=activate(s,reef);eq(s.awaiting.choice.mode,"amount");
  s=JSON.parse(JSON.stringify(s));events.push(...concede(s,departing));
  if (departing===3) {
    eq([s.awaiting.choice.mode,s.objects[shield].abilities[0].prevent],["amount",3],"an unrelated departure rebuilds the saved allocation without spending it");
    s=JSON.parse(JSON.stringify(s));events.push(...resolveAwaiting(s,[],[1,2]));eq(s.players[0].life,37);
  } else eq([s.awaiting,s.players[0].life,s.objects[shield]],[null,34,undefined],"a departing unchosen shield cannot supply an invented allocation");
  eq(events.filter(e=>e.kind==="GameEventManaPool").length,1);
}
console.log(`engine-outside-damage: ${checks} checks passed; actual mana damage choices, reload, holder departure and deferred shields`);



