import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActionRevision,paymentMayAutoResolve,mayAutoPassPriority,maySkipToEndOfTurn,engineIsWorking,firstDrawSkipped} from '../ui/action-policy.mjs';
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

/* "Skip to end" covers the case auto-pass deliberately will not: your own turn, main phase done,
 * several steps of empty priority between you and the next player. Every player clicks through
 * those every turn. */
const ownTurn=(over={})=>({revision:4,state:{turn:7,turnPlayerId:2,priorityPlayerId:2,stackSize:0,...over.state},
  ui:{ok:'OK',okEnabled:true,prompt:'Priority: Main phase 2',...over.ui}});

test('skip to end passes your own empty priority, only on the turn you asked for',()=>{
  assert.equal(maySkipToEndOfTurn(ownTurn(),2,7),true);
  assert.equal(maySkipToEndOfTurn(ownTurn(),2,null),false,'it is opt-in');
  assert.equal(maySkipToEndOfTurn(ownTurn(),2,6),false,'and it expires with the turn it was asked for');
  assert.equal(maySkipToEndOfTurn(ownTurn(),3,7),false,'somebody else holds priority');
});

test('skip to end stops for anything that is actually a decision',()=>{
  assert.equal(maySkipToEndOfTurn(ownTurn({ui:{choice:{id:'trigger'}}}),2,7),false,'a choice');
  assert.equal(maySkipToEndOfTurn(ownTurn({ui:{actionInFlight:true}}),2,7),false,'an action still resolving');
  assert.equal(maySkipToEndOfTurn(ownTurn({ui:{nativeFallback:true}}),2,7),false,'a prompt only Forge can draw');
  assert.equal(maySkipToEndOfTurn(ownTurn({ui:{okEnabled:false}}),2,7),false,'nothing to press');
  assert.equal(maySkipToEndOfTurn(ownTurn({ui:{ok:'Auto',prompt:'Pay mana cost'}}),2,7),false,'a payment is not a pass');
  assert.equal(maySkipToEndOfTurn(ownTurn({state:{gameOver:true}}),2,7),false,'the game is over');
  // Something waiting to resolve is exactly the moment a player might want to respond.
  assert.equal(maySkipToEndOfTurn(ownTurn({state:{stackSize:1}}),2,7),false,'a non-empty stack');
});

/* THE STALL ROB HIT AT UNTAP.
 *
 * A prompt stays on the screen after it has been answered -- the bridge only replaces it when
 * Forge sends the next `showPromptMessage`. So between two decisions the board still holds a
 * "Priority: <you>" string that has already been spent, and `/^Priority:/` on its own reads that
 * spent prompt as a live decision of yours.
 *
 * Forge does say which it is, in ForgeBrowserBridge.view(): `inputType` is the class name of the
 * input actually queued for this seat, and the empty string when the queue is empty. That is the
 * fact to stand on, not the prompt text -- and CR 502 is why the untap step is where a player
 * notices: "No player receives priority during the untap step."
 */
const working=(over={})=>({state:{turn:1,turnPlayerId:0,priorityPlayerId:null,phase:'UNTAP',stackSize:0,...over.state},
  ui:{prompt:'Priority: Rob\nTurn: 1 (Rob)\nPhase: Untap',ok:'OK',okEnabled:false,inputType:'',choice:null,...over.ui}});

test('a spent prompt with no input queued is the engine working, not a decision',()=>{
  assert.equal(engineIsWorking(working()),true);
  assert.equal(engineIsWorking(working({ui:{inputType:'InputPassPriority',okEnabled:true}})),false,'a queued input is a real decision');
  assert.equal(engineIsWorking(working({ui:{choice:{id:'trigger'}}})),false,'a choice is a real decision');
  assert.equal(engineIsWorking(working({ui:{nativeFallback:'Finish in the engine window'}})),false,'Forge is asking elsewhere');
  assert.equal(engineIsWorking(working({ui:{actionInFlight:true}})),false,'our own action is still resolving');
  assert.equal(engineIsWorking(working({state:{gameOver:true}})),false,'the game is over');
});

test('an adapter that does not name its input fails closed',()=>{
  const {inputType,...silent}=working().ui;
  assert.equal(engineIsWorking({...working(),ui:silent}),false,'never invent a stall from a field the adapter never sent');
  void inputType;
});

/* CR 103.8a: "In a two-player game, the player who plays first skips the draw step of their first
 * turn." There is NO equivalent clause for ordinary multiplayer, so this must ask how many players
 * are at the table before it says anything. ForgeBrowserBridge encodes the same condition when it
 * decides whether to offer the draw-step card. */
test('the skipped first draw is explained only where the rule actually applies',()=>{
  const heads={state:{turn:1,turnPlayerId:0,players:[{playerId:0},{playerId:1}]}};
  assert.equal(firstDrawSkipped(heads,0),true);
  assert.equal(firstDrawSkipped(heads,1),false,'only the player who went first skips it');
  assert.equal(firstDrawSkipped({state:{...heads.state,turn:2}},0),false,'only on their first turn');
  const pod={state:{turn:1,turnPlayerId:0,players:[{playerId:0},{playerId:1},{playerId:2},{playerId:3}]}};
  assert.equal(firstDrawSkipped(pod,0),false,'a four-player pod draws, including whoever goes first');
});
