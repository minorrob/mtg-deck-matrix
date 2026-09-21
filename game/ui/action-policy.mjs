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

/* IS ANYBODY BEING ASKED ANYTHING RIGHT NOW?
 *
 * Rob, 2026-09-21: "Very dumb that we are stuck on 'Untap' the first round for each player. No one
 * will have lands out yet because they hadn't played yet, but I am still stuck on waiting to untap
 * things."
 *
 * He was not stuck. CR 502: "No player receives priority during the untap step." The engine was
 * moving on by itself and the board was telling him it was his action, because a prompt STAYS ON
 * SCREEN after it has been answered -- ForgeBrowserBridge replaces `prompt` only when Forge sends
 * the next showPromptMessage. So `/^Priority:/` matched a string that had already been spent, the
 * board said "Your action", and the button under it was dead because `okEnabled` is ANDed with
 * whether an input is actually queued.
 *
 * The fact to stand on is the one Forge supplies: `inputType` is the class name of the input
 * queued for this seat, and the empty string when the queue is empty. An older adapter that never
 * sends the field gets no stall invented on its behalf -- the same fail-closed rule
 * paymentMayAutoResolve uses above.
 */
export function engineIsWorking(view){
  const state=view.state||{},ui=view.ui||{};
  if(state.gameOver)return false;
  if(ui.choice||ui.nativeFallback||ui.actionInFlight)return false;
  if(!Object.hasOwn(ui,'inputType'))return false;
  if(ui.inputType!=='')return false;
  return ui.okEnabled!==true;
}

/* DID THE RULES JUST TAKE A DRAW AWAY, AND WAS THAT CORRECT?
 *
 * CR 103.8a: "In a two-player game, the player who plays first skips the draw step of their first
 * turn." There is no equivalent clause for ordinary multiplayer, so the table's size decides this
 * and nothing else may. ForgeBrowserBridge.event() gates its draw-step card on exactly the same
 * condition; this is the UI's side of that gate, so the player is told why instead of watching a
 * card fail to arrive.
 *
 * In a four-player pod this is always false. If a starting player ever fails to draw there, the
 * bug is in the engine or the adapter -- not here, and not correct.
 */
export function firstDrawSkipped(view,viewerPlayerId){
  const state=view.state||{};
  return state.turn===1&&(state.players||[]).length===2&&state.turnPlayerId===viewerPlayerId;
}
