/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createController} from "../game/engine/controller.mjs";
import {hashState} from "../game/engine/journal.mjs";
let checks=0,serial=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const original={id:"trigger-targets:41",title:"Required native mode and targets",mode:"one",min:1,max:1,options:[{index:0,label:"Native variant"}]};
let controller=createController();controller.offer(original);
const child=(id="child:1",canBack=false)=>({id,title:"Private child",mode:"one",min:1,max:1,options:[{index:0,label:"A"},{index:1,label:"B"}],
 cancellation:{allowed:true,kind:"close-refinement",returnsPriority:false},
 refinement:{schema:"CrankDecisionRefinement@1",originalChoiceId:original.id,originalSignature:hashState(original),canBack}});
const input=(choice,extra={})=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:controller.revision,choiceId:choice.id,indices:[0],...extra});
ok(typeof controller.answerRefinement==="function","the server can validate a private refinement while preserving its live native question");
const native=structuredClone(controller.checkpoint().pending),first=child(),request=input(first),before=controller.revision;
let outcome=controller.answerRefinement(()=>first,request);
eq([outcome.changed,outcome.answer.indices,controller.revision],[true,[0],before+1],"one private acceptance advances revision once and returns the validated answer");
eq(controller.pending,native,"the original native question stays byte-identical after child acceptance");eq(controller.answered,null,"the original native question has no invented answer");
const after=controller.checkpoint();let generated=false;
outcome=controller.answerRefinement(()=>{generated=true;throw new Error("expired child");},request);
eq([outcome.changed,generated],[false,false],"a retry is deduplicated before even generating a now-expired child");eq(controller.checkpoint(),after,"a retry changes neither revision nor caches nor original question");
assert.throws(()=>controller.answerRefinement(()=>{throw new Error("must not generate");},{...request,indices:[1]}),/reused with different content/);checks++;
eq(controller.checkpoint(),after,"conflicting action-ID payload is atomic");
controller=createController(JSON.parse(JSON.stringify(controller.checkpoint())));
outcome=controller.answerRefinement(()=>{throw new Error("do not generate after JSON");},request);eq(outcome.changed,false,"receipt and full payload dedupe survive JSON restore");
for(const [label,choice,extra,pattern]of [
 ["stale revision",child(),{revision:controller.revision-1},/board changed/],
 ["wrong child",child(),{choiceId:"another-child"},/expired/],
 ["forged Back",child(),{back:true},/Back/],
 ["invalid selection",child(),{indices:[42]},/Invalid selection/],
 ["refused Cancel",{...child(),cancellation:{allowed:false}},{cancel:true},/Cancel is unavailable/i],
 ["wrong original",{...child(),refinement:{...child().refinement,originalChoiceId:"another-native-question"}},{},/native|expired/i],
 ["changed native signature",{...child(),refinement:{...child().refinement,originalSignature:"old"}},{},/native|changed|expired/i]
]){const point=controller.checkpoint();assert.throws(()=>controller.answerRefinement(()=>choice,input(choice,extra)),pattern,label);checks++;eq(controller.checkpoint(),point,`${label} preserves the original pending/answered and all revision/receipt state`);}
const next=child("child:2",true),back=input(next,{back:true,indices:[]});outcome=controller.answerRefinement(()=>next,back);
eq(outcome.answer.back,true,"server-produced Back permission is validated without consuming the native question");eq(controller.pending,native,"Back preserves the original native pending question");
const closing=child("child:3"),cancel=input(closing,{kind:"cancel",indices:[]});outcome=controller.answerRefinement(()=>closing,cancel);
eq(outcome.answer.cancel,true,"child Cancel is translated by the normal controller validation");eq(controller.pending,native,"closing a child has not canceled the required original question");
controller.answer(input(original));controller.take();const closed=controller.checkpoint();
assert.throws(()=>controller.answerRefinement(()=>child(),input(child())),/expired|native/i);checks++;eq(controller.checkpoint(),closed,"an expired original native question cannot be resurrected by a child");
outcome=controller.answerRefinement(()=>{throw new Error("expired native must not generate child");},cancel);eq(outcome.changed,false,"accepted child retry still works after the original native question was consumed");eq(controller.checkpoint(),closed,"expired-stage retry changes nothing");
{
 const owned=createController();owned.offer(original);const choice=child("owned-child"),request={...input(choice),revision:owned.revision};
 owned.answerRefinement(()=>choice,request,0);const before=owned.checkpoint(),restored=createController(JSON.parse(JSON.stringify(before)));
 assert.throws(()=>restored.refinementReceipt(request,1),/another seat/);checks++;eq(restored.checkpoint(),before,"wrong-seat cached replay preserves original question, revision and caches");
 ok(restored.refinementReceipt(request,0)?.accepted,"server actor receipt ownership survives JSON independently of the room's shorter receipt window");
 assert.throws(()=>restored.answerRefinement(()=>{throw new Error("must not generate");},request,1),/another seat/);checks++;
}
{
 const live=createController();live.offer(original);const choice=child("replayed-close"),raw={...input(choice,{kind:"cancel",indices:[]}),revision:live.revision};
 const accepted=live.answerRefinement(()=>choice,raw,0),replayed=createController({revision:20});replayed.offer(original);
 replayed.answerRefinement(()=>choice,{...raw,revision:replayed.revision},0,{rawRequest:raw,canonicalAnswer:accepted.answer,actor:0});
 const before=replayed.checkpoint();ok(replayed.refinementReceipt(raw,0)?.accepted,"an original accepted typed Cancel retry remains accepted after its translated tape answer replays");
 eq(replayed.checkpoint(),before,"a cached raw replay retry changes no original question, revision or cache");
}
{
 const live=createController();live.offer(original);const choice={...child("replayed-player"),options:[{index:0,label:"Rob",playerId:0},{index:1,label:"Maya",playerId:1}]};
 const raw={kind:"player",actionId:input(choice).actionId,revision:live.revision,choiceId:choice.id,targetId:1},accepted=live.answerRefinement(()=>choice,raw,0);
 eq(accepted.answer.indices,[1],"the actual typed player request translates through its current private choice");
 const fresh=()=>{const c=createController({revision:30});c.offer(original);return c;};
 const replayed=fresh();let generations=0;
 replayed.answerRefinement(()=>{generations++;return choice;},{...raw,revision:replayed.revision},0,{rawRequest:raw,canonicalAnswer:accepted.answer,actor:0});
 eq(generations,1,"trusted replay validates its current native-linked private choice exactly once");eq(replayed.pending,original,"raw payload restoration never changes the original native question");
 let restored=createController(JSON.parse(JSON.stringify(replayed.checkpoint()))),before=restored.checkpoint();
 ok(restored.refinementReceipt(raw,0)?.accepted,"the original typed player payload remains the same receipt after replay and JSON");
 assert.throws(()=>restored.refinementReceipt({...raw,targetId:0},0),/different content/i);checks++;
 assert.throws(()=>restored.refinementReceipt(raw,1),/another seat/i);checks++;eq(restored.checkpoint(),before,"conflicting/foreign replay retries leave all native/controller data unchanged");
 for(const [label,change]of [
  ["forged server actor",r=>({...r,actor:1})],
  ["forged raw action",r=>({...r,rawRequest:{...r.rawRequest,actionId:input(choice).actionId}})],
  ["forged canonical action",r=>({...r,canonicalAnswer:{...r.canonicalAnswer,actionId:input(choice).actionId}})],
  ["forged raw choice",r=>({...r,rawRequest:{...r.rawRequest,choiceId:"another-child"}})],
  ["forged canonical choice",r=>({...r,canonicalAnswer:{...r.canonicalAnswer,choiceId:"another-child"}})],
  ["forged original revision",r=>({...r,rawRequest:{...r.rawRequest,revision:999}})],
  ["raw extra data",r=>({...r,rawRequest:{...r.rawRequest,extraClaim:true}})],
  ["different canonical player",r=>({...r,canonicalAnswer:{...r.canonicalAnswer,targetId:0,indices:[0]}})],
  ["different canonical kind",r=>({...r,canonicalAnswer:{...r.canonicalAnswer,kind:"cancel"}})]
 ]){
  const c=fresh(),point=c.checkpoint(),binding=change({rawRequest:raw,canonicalAnswer:accepted.answer,actor:0});
  assert.throws(()=>c.answerRefinement(()=>choice,{...raw,revision:c.revision},0,binding),/replay/i,label);checks++;eq(c.checkpoint(),point,`${label} refuses before changing native pending, revision or receipts`);
 }
 const c=fresh(),spoofed={...raw,revision:c.revision,refinementInput:{schema:"CrankPrivateRefinementInput@1",actor:1,request:{...raw,kind:"cancel"}}};
 const normal=c.answerRefinement(()=>choice,spoofed,0);eq(normal.answer.indices,[1],"a client-supplied metadata-shaped field cannot activate the trusted replay path");ok(c.refinementReceipt(spoofed,0)?.accepted,"normal acceptance caches the actual outer client payload and server actor");
 restored.answer({kind:"answer",actionId:input(original).actionId,revision:restored.revision,choiceId:original.id,indices:[0]});restored.take();before=restored.checkpoint();
 const retry=restored.answerRefinement(()=>{throw new Error("expired child must not regenerate");},raw,0);eq(retry.changed,false,"original raw typed retry works after replayed native question expiry");eq(restored.checkpoint(),before,"expired replay retry restores no native question or state");
 const unknown={...raw,actionId:input(choice).actionId};assert.throws(()=>restored.answerRefinement(()=>choice,{...unknown,revision:restored.revision},0,{rawRequest:unknown,canonicalAnswer:{...accepted.answer,actionId:unknown.actionId},actor:0}),/native.*expired/i);checks++;eq(restored.checkpoint(),before,"an unknown replay input cannot bind a receipt after its original question expired");
}
console.log(`engine-refinement-controller: ${checks} checks; live native question preserved, atomic child validation and persistent receipt dedupe`);
