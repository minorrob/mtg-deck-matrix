import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActionRevision,paymentMayAutoResolve,mayAutoPassPriority} from '../ui/action-policy.mjs';
test('a stale browser click cannot silently adopt a new engine revision',()=>{
 assert.throws(()=>validateActionRevision(10,{revision:11,ui:{}},'ok'),/decision changed/);
 assert.doesNotThrow(()=>validateActionRevision(10,{revision:10,ui:{}},'ok'));
 assert.throws(()=>validateActionRevision(10,{revision:10,ui:{actionInFlight:true}},'card'),/previous action/);
 assert.doesNotThrow(()=>validateActionRevision(10,{revision:10,ui:{actionInFlight:true}},'answer'));
});

test('opponent priority flows automatically unless the player explicitly holds responses for that turn',()=>{
 const view={state:{turn:3,turnPlayerId:1,priorityPlayerId:2,phase:'COMBAT_END',stackSize:1,combat:{attacks:[{attacker:{cardId:1}}]}},ui:{prompt:'Priority: Guest',ok:'OK',okEnabled:true}};
 assert.equal(mayAutoPassPriority(view,2),true);
 assert.equal(mayAutoPassPriority({...view,state:{...view.state,phase:'END_OF_TURN'}},2),true);
 assert.equal(mayAutoPassPriority(view,2,null,3),false);
 assert.equal(mayAutoPassPriority({...view,ui:{...view.ui,choice:{id:'end-trigger'}}},2),false);
 assert.equal(mayAutoPassPriority(view,0),false);
 assert.equal(mayAutoPassPriority({...view,state:{...view.state,turnPlayerId:2}},2),false);
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
