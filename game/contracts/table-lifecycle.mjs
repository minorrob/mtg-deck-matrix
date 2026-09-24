/* WHY A TABLE IS NOT STARTING, as one list.
 *
 * The countdown rule and the screen that explains the countdown rule were separate pieces of code
 * saying the same thing, which is how a lobby ends up refusing to start while every seat on it
 * looks ready. The transition below consumes this, so what blocks the table and what the players
 * are told about it cannot drift apart.
 *
 * An EMPTY chair is not an unready player: seats empty out when somebody exits, when a reconnect
 * grace runs out, and when a rematch drops the people who said no. */
export function countdownBlockers(table) {
  const seated = table.seats.filter(s => s.occupied);
  const blockers = [];
  if (seated.length < 2) blockers.push({seatId: null, reason: 'A game needs at least two seats'});
  if (!seated.some(s => s.kind === 'human')) blockers.push({seatId: null, reason: 'A game needs a human'});
  /* A chair nobody has sat in YET is not the same as one somebody left. With a live invitation
     out, the table used to count down and launch before the guest opened their link: the host
     readies, the AI seats are ready from birth, and an unoccupied seat is not judged. Waiting is
     the whole point of having invited them; withdrawing the invitation releases the table. */
  for (const seat of table.seats) {
    if (seat.invited && !seat.occupied) blockers.push({seatId: seat.seatId, reason: 'invitation sent, not joined yet'});
  }
  /* A human seat nobody was ever invited to is NOT judged here (U-09, 2026-09-23). It is refused
     when the host presses start -- see `unfilledHumanSeats` below -- because it is an instruction
     to one person about one action, and this list is read continuously to describe the table at
     rest, where a chair still to be filled is perfectly normal. */
  for (const seat of seated) {
    if (!seat.connected) blockers.push({seatId: seat.seatId, reason: 'not connected'});
    else if (!seat.deckVersion) blockers.push({seatId: seat.seatId, reason: 'no validated deck'});
    else if (!seat.ready) blockers.push({seatId: seat.seatId, reason: 'not ready'});
  }
  return blockers;
}

/**
 * Human seats nobody was invited to — checked when the host presses start, not continuously.
 *
 * Rob, 2026-09-23, offered "wait for them" or "start without them" and choosing neither: "If I
 * never invited them and then I press start game then I should get a pop-up saying you haven't
 * invited anybody to the seat but marked it as human. Remove the seat assignment or change it to
 * AI to start the game." A standing rule the same day: where human behavior would break the game,
 * do not allow it, and tell the person how to proceed.
 *
 * NOT IN `countdownBlockers`, deliberately. That list is read continuously to describe the table,
 * and a table at rest with chairs still to fill is perfectly normal — putting this there made a
 * fresh four-seat table report an error for existing as a four-seat table. This fires on the one
 * action it is about.
 *
 * `released` is what separates a chair the host never thought about from one the table emptied
 * normally: a withdrawn invitation, somebody leaving, a reconnect grace running out, or a rematch
 * decline. `invited` alone could not carry that — it is a plain boolean that `uninvited` sets back
 * to false, so "I took it back" and "I never sent one" looked identical.
 */
export function unfilledHumanSeats(table) {
  return table.seats.filter(s => s.kind === 'human' && !s.occupied && !s.invited && !s.released);
}

/** Pure authoritative table transitions. Transport authenticates actor; clients never set time/IDs. */
export function createTable({tableId,seats,settings}) {
  if(!tableId||seats.length<2||seats.length>4||!seats.some(s=>s.kind==='human'))throw Error('A table needs 2–4 seats and a human');
  if(seats.some((s,i)=>s.seatId!==i||!['human','ai'].includes(s.kind)))throw Error('Invalid seats');
  return {schema:'CrankMagicTable@1',tableId,revision:0,phase:'selecting',generation:0,countdownAt:null,rematchAt:null,launchId:null,matchId:null,launchError:null,...(settings?{settings:structuredClone(settings)}:{}),
    seats:seats.map(s=>({...s,occupied:s.kind==='ai'||!!s.occupied,connected:s.kind==='ai'||!!s.occupied,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:false,invited:false,released:false}))};
}
export function transitionTable(previous,event,{now,launchId}={}) {
  if(!Number.isSafeInteger(now))throw Error('Authoritative clock required');
  if(event.revision!==previous.revision)throw Error('Stale table revision');
  const t=structuredClone(previous),seat=t.seats.find(s=>s.seatId===event.seatId);
  const editable=()=>{if(!['selecting','countdown'].includes(t.phase))throw Error('Table is not selecting decks');};
  const member=()=>{if(!seat?.occupied)throw Error('Seat is unoccupied');};
  const cancel=()=>{t.countdownAt=null;if(t.phase==='countdown')t.phase='selecting';};
  switch(event.type){
    case 'join':editable();if(!seat||seat.kind!=='human'||seat.occupied)throw Error('Seat unavailable');Object.assign(seat,{occupied:true,connected:true,ready:false,rematch:null,disconnectedAt:null,conceded:false,invited:false});cancel();break;
    /* The host sent a link, or took it back. Only the transport knows an invitation was minted;
       the table needs to know so the countdown waits for whoever it was sent to. */
    case 'invited':if(!seat||seat.kind!=='human')throw Error('Only a human seat is invited');seat.invited=true;seat.released=false;cancel();break;
    /* Withdrawing is the host acting on the seat -- "start without them" -- so it releases the
       table as it always has, and the never-invited block above does not then re-catch it. */
    case 'uninvited':if(!seat)throw Error('No such seat');seat.invited=false;seat.released=true;break;
    case 'deck':editable();member();if(!event.deckVersion)throw Error('Validated deck version required');seat.deckVersion=event.deckVersion;seat.ready=false;cancel();break;
    case 'ready':editable();member();if(!seat.deckVersion||!seat.connected)throw Error('Connected seat and validated deck required');seat.ready=!!event.ready;cancel();break;
    case 'disconnect':member();seat.connected=false;seat.ready=false;seat.disconnectedAt=now;cancel();break;
    case 'reconnect':member();seat.connected=true;seat.disconnectedAt=null;break;
    case 'exit':case 'expire':
      member();if(seat.kind!=='human')throw Error('AI does not exit through membership');
      if(event.type==='expire'&&(seat.connected||seat.disconnectedAt===null||now-seat.disconnectedAt<60000))throw Error('Reconnect grace has not expired');
      if(['playing','starting'].includes(t.phase))throw Error('Resolve active-match departure through engine policy first');
      /* Released: somebody sat here and left. That is the table acting normally, not a chair the
         host never thought about, so it must not raise the never-invited popup. The comment at the
         top of this file names all three -- exit, reconnect grace, rematch decline. */
      Object.assign(seat,{occupied:false,connected:false,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:false,released:true});cancel();break;
    case 'concede':
      member();if(seat.kind!=='human'||t.phase!=='playing')throw Error('No active human player can concede');
      Object.assign(seat,{occupied:false,connected:false,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:true,released:true});break;
    case 'countdown': {
      if(t.phase!=='selecting')throw Error('Table is not selecting decks');
      /* Checked before readiness, because it is the more useful thing to be told: "every seat must
         be ready" about a chair nobody is sitting in sends the host looking for a player. */
      const unfilled=unfilledHumanSeats(t);
      if(unfilled.length)throw Error(unfilled.map(s=>
        `${s.name?`${s.name}'s seat`:`Seat ${s.seatId+1}`} is marked as a human but nobody has been invited to it`)
        .join('. ')+'. Remove the seat assignment or change it to AI to start the game');
      const blockers=countdownBlockers(t);
      if(blockers.length)throw Error('Every seat must be ready');
      t.phase='countdown';t.countdownAt=now+10000;break;
    }
    case 'tick':
      if(t.phase!=='countdown'||now<t.countdownAt)throw Error('Countdown has not completed');
      if(!launchId)throw Error('Launch identity required');t.phase='starting';t.launchId=launchId;t.generation++;t.countdownAt=null;t.launchError=null;break;
    case 'engine-started':
      if(t.phase!=='starting'||event.launchId!==t.launchId||!event.matchId)throw Error('Wrong engine launch');
      t.phase='playing';t.matchId=event.matchId;break;
    /* AN AI SEAT KEEPS ITS READINESS HERE, BECAUSE NOTHING CAN EVER GIVE IT BACK.
     *
     * Clearing every seat used to end the table for good: readiness is granted to an AI seat when
     * the table is built and nowhere else but a rematch, and an AI seat has nobody to press its
     * button. A UAT on 2026-09-22 watched an invited guest join, choose a deck, press Ready and
     * then wait nine minutes on two bots that could never become ready again. `completed`, below,
     * already knew a reset has to treat AI seats differently.
     *
     * The humans do re-confirm. A launch that failed is worth a person looking at before it is
     * tried again, and now there is something to look at: the reason travels with the event
     * instead of being written to an outbox nobody publishes. */
    case 'engine-failed':
      if(t.phase!=='starting'||event.launchId!==t.launchId)throw Error('Wrong engine launch');
      t.phase='selecting';t.launchId=null;t.launchError=event.error?String(event.error):'The rules engine did not start';
      t.seats.forEach(s=>s.ready=s.kind==='ai');break;
    case 'completed':
      if(t.phase!=='playing'||event.matchId!==t.matchId)throw Error('Wrong completed match');
      // The clock the rematch deadline is measured from, so waiting on an answer is bounded.
      t.phase='rematch';t.rematchAt=now;t.seats.forEach(s=>{s.ready=false;s.rematch=s.kind==='ai'?true:null;});break;
    case 'rematch-vote':
      member();if(t.phase!=='rematch'||seat.kind!=='human'||!seat.connected)throw Error('No rematch vote available');seat.rematch=!!event.accept;break;
    // Nobody has to answer. A player who closed the laptop on a loss, or who is simply slow, used
    // to hold the whole table in 'rematch' with no way out but closing it, because the next round
    // required every occupied human to vote yes. Silence is now a decline, once the clock says so.
    case 'rematch-deadline':
      if(t.phase!=='rematch')throw Error('No rematch is pending');
      t.seats.forEach(s=>{if(s.kind==='human'&&s.occupied&&(s.rematch===null||!s.connected))s.rematch=false;});break;
    case 'next-selection': {
      if(t.phase!=='rematch')throw Error('No rematch is pending');
      // Everyone who was asked has answered -- or the deadline answered for them.
      if(t.seats.some(s=>s.kind==='human'&&s.occupied&&s.rematch===null))throw Error('Waiting for other players');
      const staying=t.seats.filter(s=>s.rematch===true&&(s.kind==='ai'||(s.occupied&&s.connected)));
      if(!staying.some(s=>s.kind==='human'))throw Error('Nobody is staying for another game');
      if(staying.length<2)throw Error('Another game needs at least two seats');
      // The seats that declined are released here rather than carried into the next table, where
      // an empty chair nobody can fill would block the countdown exactly as the unanimity rule did.
      for(const s of t.seats){
        if(s.rematch===true&&(s.kind==='ai'||(s.occupied&&s.connected))){s.ready=false;s.rematch=null;continue;}
        Object.assign(s,{occupied:false,connected:false,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:false,released:true});
      }
      t.phase='selecting';t.launchId=null;t.matchId=null;t.rematchAt=null;break;
    }
    default:throw Error('Unknown table transition');
  }
  t.revision++;return t;
}
