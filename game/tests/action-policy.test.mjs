import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActionRevision,paymentMayAutoResolve} from '../ui/action-policy.mjs';
test('a stale browser click cannot silently adopt a new engine revision',()=>{
 assert.throws(()=>validateActionRevision(10,{revision:11,ui:{}},'ok'),/decision changed/);
 assert.doesNotThrow(()=>validateActionRevision(10,{revision:10,ui:{}},'ok'));
 assert.throws(()=>validateActionRevision(10,{revision:10,ui:{actionInFlight:true}},'card'),/previous action/);
 assert.doesNotThrow(()=>validateActionRevision(10,{revision:10,ui:{actionInFlight:true}},'answer'));
});
test('automatic mana cannot approve optional triggered payments',()=>{
 const echo={ok:'Auto',prompt:'Pay echo',payment:{abilityId:3,automaticEligible:false,triggered:true}};
 assert.equal(paymentMayAutoResolve(echo,true),false);
 assert.equal(paymentMayAutoResolve(echo,false,3),true);
 assert.equal(paymentMayAutoResolve({...echo,payment:{...echo.payment,abilityId:4}},false,3),false);
 assert.equal(paymentMayAutoResolve({ok:'Auto',payment:{automaticEligible:true}}),true);
 assert.equal(paymentMayAutoResolve({ok:'Auto',payment:null},true),false);
 assert.equal(paymentMayAutoResolve({ok:'OK',payment:{automaticEligible:true}},true),false);
});
