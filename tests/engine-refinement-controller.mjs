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
console.log(`engine-refinement-controller: ${checks} checks; live native question preserved, atomic child validation and persistent receipt dedupe`);
