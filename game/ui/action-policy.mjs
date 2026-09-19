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

export function mayAutoPassPriority(view,viewerPlayerId,yieldTurn=null,holdResponsesTurn=null){
  const state=view.state||{},ui=view.ui||{};
  // Passing priority is the default while somebody else acts. A player who wants
  // to keep instant-speed interaction available deliberately holds this turn.
  if(state.gameOver||state.turnPlayerId===viewerPlayerId||state.priorityPlayerId!==viewerPlayerId||ui.actionInFlight||ui.choice||ui.nativeFallback||ui.ok!=='OK'||!ui.okEnabled||!/^Priority:/m.test(ui.prompt||''))return false;
  if(holdResponsesTurn===state.turn)return false;
  return true;
}

/* SKIP TO THE END OF YOUR OWN TURN.
 *
 * mayAutoPassPriority above is for somebody else's turn: it deliberately refuses while you are the
 * turn player, because passing your own priority without being asked would play your turn for you.
 * That left nothing for the common case in a four-player game -- your main phase is done, you have
 * nothing to hold up, and there are still several steps of "Priority:" between you and the next
 * player. Everyone clicks through them every turn.
 *
 * So this is opt-in and single-turn: it applies only to the turn the player asked for it on, and
 * `skipTurn` is cleared when the turn changes. It stops for anything that is a real decision --
 * a choice, a native fallback, an action still resolving -- and it stops when the stack is not
 * empty, because something waiting to resolve is the moment you might want to respond. Nothing
 * here decides anything: it presses the same OK the player would have pressed.
 */
export function maySkipToEndOfTurn(view,viewerPlayerId,skipTurn=null){
  const state=view.state||{},ui=view.ui||{};
  if(state.gameOver||skipTurn===null||skipTurn!==state.turn)return false;
  if(state.priorityPlayerId!==viewerPlayerId)return false;
  if(ui.actionInFlight||ui.choice||ui.nativeFallback)return false;
  if(ui.ok!=='OK'||!ui.okEnabled||!/^Priority:/m.test(ui.prompt||''))return false;
  if(Number(state.stackSize)>0)return false;
  return true;
}
