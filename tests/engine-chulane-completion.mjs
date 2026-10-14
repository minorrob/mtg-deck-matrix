/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* D2: Guardian Project's intervening name check, Yavimaya Dryad's recipient and forestwalk,
 * and Claim Jumper's two independent optional searches. CR 603.4, 608.2h, 702.14, 701.23. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState, addObject, cardsIn} from '../game/engine/state/index.mjs';
import {conditionHolds, conditionProblems} from '../game/engine/script/condition.mjs';
import {collectTriggers} from '../game/engine/rules/trigger.mjs';
import {pushAbility, resolveTop} from '../game/engine/rules/stack.mjs';
import {awaitingChoice, resolveAwaiting} from '../game/engine/rules/turn.mjs';
import {beginResolution} from '../game/engine/script/resolution.mjs';
import {moveOne} from '../game/engine/script/effects/zones.mjs';
import {canBlockAttacker} from '../game/engine/keywords/combat.mjs';
import {createRng} from '../game/engine/rng.mjs';
import {runScenario} from '../game/engine/cards/scenario.mjs';
import {loadCardIndex} from '../game/tools/engine-cards.mjs';
let checks = 0;
const eq = (a,b,m) => {assert.deepEqual(a,b,m); checks++;};
const index = loadCardIndex(), rng = createRng('chulane');
const table = () => createState({matchId:'d2',seed:'d2',players:['Rob','Maya','Trey','Sam'].map(name=>({name}))});
const card = name => { const definition = index.definition(name); assert.ok(definition, `missing definition: ${name}`); return {...definition,card:name}; };
const bear = {card:'Sprout',types:['Creature'],power:2,toughness:2};
const put = (s,o,zone='battlefield',seat=0) => addObject(s,{...o,owner:seat,controller:seat},zone,['battlefield','exile'].includes(zone)?null:seat);
const lands = (s,n,seat=0) => Array.from({length:n},()=>put(s,card('Forest'),'battlefield',seat));
const unique = (s,id) => conditionHolds(s,{uniqueCreatureName:true},{controller:0,about:{card:id}});
const answer = (s,labels) => resolveAwaiting(s,labels.map(label=>awaitingChoice(s).options.find(o=>o.label===label).index),null,rng);
const arrival = (s,o,seat=0) => {const events=[];const id=moveOne(s,put(s,o,'hand',seat),'battlefield',events);collectTriggers(s,events);return id;};
const stackTrigger = (s,t=s.pendingTriggers.shift()) => pushAbility(s,{sourceId:t.source.cardId,controller:t.controller,abilityId:t.abilityId,kind:'trigger',script:t.script,about:t.about});
for (const name of ['Guardian Project','Yavimaya Dryad','Claim Jumper']) {
 const slug=name.toLowerCase().replaceAll(' ','-');const doc=JSON.parse(fs.readFileSync(new URL(`../game/engine/cards/${slug[0]}/${slug}.scenarios.json`,import.meta.url)));
 for(const scenario of doc.scenarios) eq(runScenario(scenario,index.definition,doc.fixtures).passed.length>0,true,`${name}: ${scenario.name}`);
}
eq(conditionProblems({uniqueCreatureName:true}),[],'name predicate admitted');
eq(conditionProblems({uniqueCreatureName:false}).length>0,true,'false is not an unimplemented inverse');
eq(unique(table(),999),false,'missing subject without last known information fails closed');
// Only another controlled creature or a creature card in your graveyard shares the name.
for(const [zone,seat,extra,expected] of [
 ['battlefield',0,{},false],['battlefield',1,{},true],['battlefield',0,{types:['Artifact']},true],
 ['battlefield',0,{token:true},false],['graveyard',0,{},false],['graveyard',1,{},true],
 ['graveyard',0,{types:['Instant']},true],['graveyard',0,{token:true},true],['hand',0,{},true],['exile',0,{},true]]){
 const s=table(),id=put(s,bear);put(s,{...bear,...extra},zone,seat);eq(unique(s,id),expected,`${zone}, seat ${seat}, ${JSON.stringify(extra)}`);
}
{
 const s=table(),id=put(s,bear),other=put(s,bear,'battlefield',1);
 s.effects=[{id:'steal',layer:2,timestamp:1,affects:{ids:[other]},apply:{controller:0}}];
 eq(unique(s,id),false,'layered control, not ownership');
 s.effects=[{id:'type',layer:4,timestamp:1,affects:{ids:[other]},apply:{addTypes:['Creature']}}];
 s.objects[other].types=['Artifact'];s.objects[other].controller=0;
 eq(unique(s,id),false,'layered creature type');
 s.objects[id].card=null;s.objects[other].card=null;
 eq(unique(s,id),true,'two nameless creatures do not share a name');
}
for(const [extra,seat,expected] of [[{},0,1],[{token:true},0,0],[{},1,0]]){
 const s=table();put(s,card('Guardian Project'));arrival(s,{...bear,...extra},seat);
 eq(s.pendingTriggers.length,expected,'only your nontoken creature triggers Project');
}
for(const where of ['battlefield','graveyard']){
 const s=table();put(s,card('Guardian Project'));arrival(s,bear);put(s,card('Forest'),'library');
 stackTrigger(s);put(s,bear,where);resolveTop(s,null,rng);
 eq(cardsIn(s,'hand',0).length,0,`name check repeated on resolution after duplicate enters ${where}`);
}
for(const zone of ['graveyard','exile']){
 const s=table(),project=put(s,card('Guardian Project')),id=arrival(s,bear);put(s,card('Forest'),'library');
 stackTrigger(s);moveOne(s,project,'graveyard',[]);moveOne(s,id,zone,[]);
 eq(s.stack[0].about.was.name,'Sprout','departed subject keeps its last name on the stack');
 resolveTop(s,null,rng);eq(cardsIn(s,'hand',0).length,zone==='exile'?1:0,'source gone: subject in graveyard prevents draw, exile does not');
}
{
 const s=table();put(s,card('Guardian Project'));const id=arrival(s,bear);
 s.objects[id].card='Changed';moveOne(s,id,'exile',[]);
 eq(s.pendingTriggers[0].about.was.name,'Changed','pending trigger remembers departure name, not arrival name');
 put(s,{...bear,card:'Changed'},'graveyard');stackTrigger(s);resolveTop(s,null,rng);
 eq(cardsIn(s,'hand',0).length,0,'last name is compared on resolution');
}
// A searched land belongs to its owner but its recipient governs entry replacements and triggers.
{
 const s=table();lands(s,3,1);
 const gift={card:'Gift Forest',types:['Land'],subtypes:['Forest'],abilities:[{id:'entry',kind:'replacement',text:'x',watches:{event:'enters',who:'self',unless:{controls:{what:'permanent',types:['Land']},min:3}},change:{entersTapped:true}}]};
 put(s,gift,'library');put(s,card('Island'),'library');
 for(const seat of [0,1])put(s,{card:`Watcher ${seat}`,types:['Enchantment'],abilities:[{id:'watch',kind:'triggered',trigger:{on:'GameEventCardChangeZone',to:'Battlefield',who:'any',filter:{types:['Land'],controller:'you'}},effects:[{effect:'gainLife',amount:1}]}]},'battlefield',seat);
 beginResolution(s,[{effect:'chooseCard',zone:'library',selector:{types:['Land'],subtypes:['Forest']},to:'battlefield',controller:1,shuffle:true}],{controller:0},rng);
 eq(awaitingChoice(s).options.map(o=>o.label),['Gift Forest'],'nonbasic Forest included; Island excluded');
 const events=answer(s,['Gift Forest']);const id=s.zones.battlefield.find(id=>s.objects[id].card==='Gift Forest');
 eq([s.objects[id].owner,s.objects[id].controller,s.objects[id].tapped],[0,1,false],'recipient has three lands for entry replacement; ownership stays with searcher');
 collectTriggers(s,events);eq(s.pendingTriggers.map(t=>t.controller),[1],'only recipient landfall triggers');
 eq(events.find(e=>e.kind==='GameEventCardChangeZone').data.fields.to.player.playerId,1,'arrival event names recipient');
 eq(events.filter(e=>e.kind==='GameEventShuffle').length,1,'searcher shuffles once');
}
{
 const s=table(),host=put(s,bear,'battlefield',1);
 const aura=put(s,{card:'Gift Aura',types:['Enchantment'],subtypes:['Aura'],enchant:{what:'permanent',types:['Creature'],controller:'you'}},'hand');
 const moved=moveOne(s,aura,'battlefield',[],{controller:1});
 eq(moved!==null,true,'an Aura uses its recipient to find a legal host as it enters');
 eq(s.objects[moved].controller,1,'gift Aura enters controlled by recipient');
 const counters=put(s,{...bear,card:'Counter Gift',abilities:[{id:'entry',kind:'replacement',watches:{event:'enters',who:'self'},change:{entersWithCounters:{counter:'+1/+1',count:1}}}]},'library');
 put(s,card('Branching Evolution'),'battlefield',1);
 const arrived=moveOne(s,counters,'battlefield',[],{controller:1});
 eq(s.objects[arrived].counters['+1/+1'],2,'recipient controls it before entry counter replacements');
 void host;
}
// Forestwalk follows the actual defender, including a planeswalker attack; any other opponent is irrelevant.
{
 const s=table(),attacker=put(s,card('Yavimaya Dryad')),blocker=put(s,bear,'battlefield',1),forest=put(s,card('Forest'),'battlefield',2);
 s.combat={attacks:[{attacker,defender:1,planeswalker:123}]};
 eq(canBlockAttacker(s,blocker,attacker),true,'third player Forest does not stop blocks');
 s.effects=[{id:'steal',layer:2,timestamp:1,affects:{ids:[forest]},apply:{controller:1}}];
 eq(canBlockAttacker(s,blocker,attacker),false,'actual defender controls Forest through a layer, even attacking their planeswalker');
 s.effects=[];s.objects[forest].controller=1;s.objects[forest].types=['Artifact'];
 eq(canBlockAttacker(s,blocker,attacker),true,'Forest subtype without Land type is insufficient');
 s.effects=[{id:'land',layer:4,timestamp:1,affects:{ids:[forest]},apply:{addTypes:['Land']}}];
 eq(canBlockAttacker(s,blocker,attacker),false,'land type added through layer is honored');
 s.objects[forest].subtypes=['Island'];eq(canBlockAttacker(s,blocker,attacker),true,'Island is no Forest');
 s.effects.push({id:'forest',layer:4,timestamp:2,affects:{ids:[forest]},apply:{setSubtypes:['Forest']}});
 eq(canBlockAttacker(s,blocker,attacker),false,'Forest subtype added through layer is honored');
 s.objects[attacker].keywords=[];eq(canBlockAttacker(s,blocker,attacker),true,'without Forestwalk the blocker is legal');
}
const jumper = index.definition('Claim Jumper').abilities.find(a=>a.kind==='triggered');
for(const counts of [[3,2,2,2],[3,3,3,3],[3,2,4,2]]){
 const s=table();counts.forEach((n,seat)=>lands(s,n,seat));arrival(s,card('Claim Jumper'));
 eq(s.pendingTriggers.length,counts[2]===4?1:0,'compare each opponent, not combined lands; equality insufficient');
}
{
 const s=table();lands(s,1);const opp=lands(s,2,1);arrival(s,card('Claim Jumper'));stackTrigger(s);
 moveOne(s,opp[0],'graveyard',[]);resolveTop(s,null,rng);
 eq(Boolean(s.awaiting),false,'intervening land count rechecked before first optional search');
}
for(const choices of [[['No'],['No']],[['Yes'],[],['No']],[['No'],['Yes'],[]],[['Yes'],[],['Yes'],[]]]){
 let s=table();lands(s,1);lands(s,3,1);put(s,card('Plains'),'library');
 beginResolution(s,jumper.effects,{controller:0},rng);const events=[];
 for(const labels of choices){s=JSON.parse(JSON.stringify(s));events.push(...answer(s,labels));}
 eq(Boolean(s.awaiting),false,'independent may decisions complete across save/reload');
 eq(events.filter(e=>e.kind==='GameEventShuffle').length,choices.length===2?0:1,'shuffle exactly once if either searched, including fail to find');
 eq(cardsIn(s,'library',0).length,1,'failing to find does not move cards');
}
console.log(`engine-chulane-completion: ${checks} checks passed`);
