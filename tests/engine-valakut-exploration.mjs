/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* ROB-226: actual printed cards and explicit actions; an exile permission must retain normal native funding. */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks=0;
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks+=1;};
const ok=(actual,message)=>{assert.ok(actual,message);checks+=1;};
const index=loadCardIndex(), god="Purphoros, God of the Forge";
const at=(seat,zone,...cards)=>({seat,zone,cards});
const run=(name,setup,library,steps)=>runScenario({name,setup,library,steps},index.definition,{}, {explicitChoices:true}).state;
const tap=(card,i=0)=>({tap:card,source:{zone:"battlefield",index:i}});
const offers=(state,name)=>legalActions(state,0).filter(a=>a.label===name&&["cast","play-land"].includes(a.kind));
const names=(state,zone)=>(zone==="graveyard"?state.zones[zone].flat():state.zones[zone]).map(id=>state.objects[id].card);
const publicExile=state=>projectFor(state,0).players[0].zones.Exile.cards.map(c=>c.name);
const setup=[at(0,"battlefield","Valakut Exploration","Mountain","Mountain","Mountain"),at(0,"hand","Mountain")];
const start=[{play:"Mountain"},{resolve:true}];
const opening=run("Valakut offers actual Purphoros using untapped Mountains",setup,[god],start);
eq(publicExile(opening),[god],"the real landfall trigger exiles the reported card");
eq(opening.players[0].manaPool.R,0,"the reported premise has no floating red mana");
eq(opening.zones.battlefield.filter(id=>opening.objects[id].card==="Mountain"&&!opening.objects[id].tapped).length,4,"four physical untapped Mountains can fund the spell");
eq(offers(opening,god).map(a=>a.from),["exile"],"Purphoros must be offered from Exile before manually tapping lands");
const cast=run("Valakut funds actual Purphoros from Exile",setup,[god],[...start,{cast:god,source:{zone:"exile",index:0}}]);
eq(cast.awaiting,null,"the sole legal four-of-four funding payment commits without inventing a human choice");
eq(cast.stack.map(s=>s.name),[god],"the actual permitted spell reaches the stack");
eq(cast.zones.battlefield.filter(id=>cast.objects[id].card==="Mountain"&&cast.objects[id].tapped).length,4,"the cast actually taps all four required sources");
eq(cast.players[0].manaPool.R,0,"the actual four-mana cost is paid");
eq(publicExile(cast),[],"the cast card leaves Exile");
const resolved=run("Valakut actual Purphoros resolves",setup,[god],[...start,{cast:god,source:{zone:"exile",index:0}},{resolve:true}]);
ok(names(resolved,"battlefield").includes(god),"the reported permanent actually resolves");
eq(resolved.stack.length,0,"resolution finishes");

/* A second landfall before the end step must not discard the first card's independent permission. */
const multiSetup=[at(0,"battlefield","Valakut Exploration","Mountain","Mountain","Mountain","Island","Forest"),at(0,"hand","Mountain","Mountain","Growth Spiral")];
const multiSteps=[{play:"Mountain",source:{zone:"hand",index:0}},{resolve:true},tap("Island"),tap("Forest"),{cast:"Growth Spiral"},{resolve:true},{choose:["Mountain"]},{resolve:true}];
const multiLibrary=[god,"Wastes","Raging Goblin"];
const multi=run("Valakut successive permissions",multiSetup,multiLibrary,multiSteps);
eq(publicExile(multi),[god,"Raging Goblin"],"two real landfall triggers retain both exact exile cards");
ok(offers(multi,god).some(a=>a.from==="exile"),"the earlier Purphoros remains available after the next exile");
ok(offers(multi,"Raging Goblin").some(a=>a.from==="exile"),"the next Goblin is independently available");
const godSteps=[...multiSteps,...[0,1,2,3].map(i=>tap("Mountain",i)),{cast:god,source:{zone:"exile",index:0}},{resolve:true}];
const first=run("Valakut next card survives first cast",multiSetup,multiLibrary,godSteps);
eq(publicExile(first),["Raging Goblin"],"casting the first card removes only that physical card");
ok(offers(first,"Raging Goblin").some(a=>a.from==="exile"),"the second card remains available after Purphoros resolves");
const both=run("Valakut both spells and actual God trigger",multiSetup,multiLibrary,[...godSteps,tap("Mountain",4),{cast:"Raging Goblin",source:{zone:"exile",index:0}},{resolve:true},{resolve:true}]);
eq(names(both,"battlefield").filter(n=>n===god||n==="Raging Goblin"),[god,"Raging Goblin"],"both actual exiled cards resolve");
eq(both.players[1].life,38,"the actual Purphoros trigger deals two when the Goblin enters");

/* The permission does not bypass normal timing or land-play limits. */
const end=[...start,{to:{turn:1,phase:"END_OF_TURN"}}];
const endGod=run("Valakut sorcery timing remains enforced",setup,[god],end);
ok(endGod.stack.length>0,"the end-step removal trigger is pending");
eq(publicExile(endGod),[god],"the card is still physically exiled before removal resolves");
eq(offers(endGod,god),[],"an enchantment spell cannot be cast in the end step merely because it is exiled");
const endBolt=run("Valakut instant response window",setup,["Lightning Bolt"],end);
ok(offers(endBolt,"Lightning Bolt").some(a=>a.from==="exile"),"an instant remains castable before the end-step trigger resolves");
const response=run("Valakut actual instant response",setup,["Lightning Bolt"],[...end,tap("Mountain"),{cast:"Lightning Bolt",source:{zone:"exile",index:0},targets:[{player:1}]},{resolve:true},{resolve:true}]);
eq(response.players[1].life,37,"the instant response actually resolves for three");
eq(response.stack.length,0,"the linked end-step trigger then resolves");
const endUnused=run("Valakut unused card removal",setup,[god],[...end,{resolve:true}]);
eq(publicExile(endUnused),[],"the end-step trigger removes the unused linked card");
ok(names(endUnused,"graveyard").includes(god),"the unused actual card moves to the graveyard");
eq(endUnused.players[1].life,39,"one unused exiled card causes exactly one damage");
const land=run("Valakut cannot grant a second land play",setup,["Mountain"],start);
eq(publicExile(land),["Mountain"],"the actual land is revealed in Exile");
eq(offers(land,"Mountain"),[],"the already-used land play remains spent");
console.log(`engine-valakut-exploration: ${checks} checks passed`);
