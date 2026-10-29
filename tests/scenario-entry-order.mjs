/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex,loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {scenarioBehaviorFailure} from "../game/tools/ability-proof.mjs";
const index=loadCardIndex();
const names=new Set(["Ichormoon Gauntlet","Nesting Grounds","Tidus, Yuna's Guardian"]);
let checks=0, repaired=0;
for(const {scenarios:file} of loadCardScenarios()) if(names.has(file.card)) for(const scenario of file.scenarios) {
  runScenario(scenario,index.definition,file.fixtures??{}); checks++;
  const at=scenario.steps.findIndex(step=>step.expect?.some(e=>e.asks?.options?.includes("Effect: This creature enters with a flying counter on it.")));
  if(at<0)continue;
  const before=runScenario({...scenario,steps:scenario.steps.slice(0,at),expect:[]},index.definition,file.fixtures??{});
  assert.equal(before.state.awaiting?.kind,"rule-operation"); checks++;
  assert.equal(before.state.zones.battlefield.some(id=>before.state.objects[id].card==="Bird"),false,"the Bird is not allocated before its entry replacement order is chosen"); checks++;
  let failure;
  try {runScenario({...scenario,steps:[...scenario.steps.slice(0,at),{tap:"Forest"}],expect:[]},index.definition,file.fixtures??{});} catch(e){failure=e;}
  assert.match(failure?.message??"",/answer rule-operation before taking another action/); checks++;
  assert.equal(failure.scenarioAssertion.kind,"question-offer"); checks++;
  assert.equal(scenarioBehaviorFailure(failure,scenario),false,"an unanswered prompt cannot earn ability credit"); checks++;
  const other=structuredClone(scenario), selected=other.steps[at+1].choose[0];
  other.steps[at+1].choose=[selected.includes("flying")?"Effect: This creature enters with a +1/+1 counter on it.":"Effect: This creature enters with a flying counter on it."];
  // The counter-description label follows insertion order; choose the same Bird in either explicit branch.
  for(const step of other.steps) if(step.choose) step.choose=step.choose.map(label=>selected.includes("flying")
    ?label.replace("Bird (1 flying, 1 +1/+1)","Bird (1 +1/+1, 1 flying)")
    :label.replace("Bird (1 +1/+1, 1 flying)","Bird (1 flying, 1 +1/+1)"));
  runScenario(other,index.definition,file.fixtures??{}); checks++;
  repaired++;
}
assert.equal(repaired,5);checks++;
console.log(`scenario-entry-order: ${checks} checks; all saved expectations preserved, both explicit entry orders finish and missing answers earn no proof`);
