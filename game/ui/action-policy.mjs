export function validateActionRevision(observedRevision,fresh,kind,guarded=false){
  if(!guarded&&fresh.revision!==observedRevision)throw Error('The decision changed while you were acting. Review the updated board and choose again.');
  if(fresh.ui.actionInFlight&&kind!=='answer')throw Error('Your previous action is still resolving. Please wait for the updated choice.');
}

export function paymentMayAutoResolve(ui,pendingCast=false,approvedPayment=null){
  if(ui.ok!=='Auto')return false;
  const paymentId=ui.payment?.abilityId??ui.prompt;
  if(approvedPayment!==null&&approvedPayment===paymentId)return true;
  // Updated engines identify the origin; unknown origins fail closed.
  if(Object.hasOwn(ui,'payment'))return ui.payment?.automaticEligible===true;
  // An older running adapter can only inherit an explicit outstanding cast.
  return pendingCast;
}

export function mayAutoPassPriority(view,viewerPlayerId,yieldTurn=null){
  const state=view.state||{},ui=view.ui||{};
  if(state.gameOver||state.turnPlayerId===viewerPlayerId||state.priorityPlayerId!==viewerPlayerId||ui.actionInFlight||ui.choice||ui.nativeFallback||ui.ok!=='OK'||!ui.okEnabled||!/^Priority:/m.test(ui.prompt||''))return false;
  if((state.stackSize??state.stack?.length??0)>0)return false;
  if(yieldTurn===state.turn)return true;
  if(state.phase==='END_OF_TURN')return false;
  return !(String(state.phase).startsWith('COMBAT')&&state.combat?.attacks?.length);
}
