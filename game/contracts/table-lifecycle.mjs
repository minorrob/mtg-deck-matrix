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
  for (const seat of seated) {
    if (!seat.connected) blockers.push({seatId: seat.seatId, reason: 'not connected'});
    else if (!seat.deckVersion) blockers.push({seatId: seat.seatId, reason: 'no validated deck'});
    else if (!seat.ready) blockers.push({seatId: seat.seatId, reason: 'not ready'});
  }
  return blockers;
}

/** Pure authoritative table transitions. Transport authenticates actor; clients never set time/IDs. */
export function createTable({tableId,seats,settings}) {
  if(!tableId||seats.length<2||seats.length>4||!seats.some(s=>s.kind==='human'))throw Error('A table needs 2–4 seats and a human');
  if(seats.some((s,i)=>s.seatId!==i||!['human','ai'].includes(s.kind)))throw Error('Invalid seats');
  return {schema:'CrankMagicTable@1',tableId,revision:0,phase:'selecting',generation:0,countdownAt:null,rematchAt:null,launchId:null,matchId:null,...(settings?{settings:structuredClone(settings)}:{}),
    seats:seats.map(s=>({...s,occupied:s.kind==='ai'||!!s.occupied,connected:s.kind==='ai'||!!s.occupied,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:false}))};
}
export function transitionTable(previous,event,{now,launchId}={}) {
  if(!Number.isSafeInteger(now))throw Error('Authoritative clock required');
  if(event.revision!==previous.revision)throw Error('Stale table revision');
  const t=structuredClone(previous),seat=t.seats.find(s=>s.seatId===event.seatId);
  const editable=()=>{if(!['selecting','countdown'].includes(t.phase))throw Error('Table is not selecting decks');};
  const member=()=>{if(!seat?.occupied)throw Error('Seat is unoccupied');};
  const cancel=()=>{t.countdownAt=null;if(t.phase==='countdown')t.phase='selecting';};
  switch(event.type){
    case 'join':editable();if(!seat||seat.kind!=='human'||seat.occupied)throw Error('Seat unavailable');Object.assign(seat,{occupied:true,connected:true,ready:false,rematch:null,disconnectedAt:null,conceded:false});cancel();break;
    case 'deck':editable();member();if(!event.deckVersion)throw Error('Validated deck version required');seat.deckVersion=event.deckVersion;seat.ready=false;cancel();break;
    case 'ready':editable();member();if(!seat.deckVersion||!seat.connected)throw Error('Connected seat and validated deck required');seat.ready=!!event.ready;cancel();break;
    case 'disconnect':member();seat.connected=false;seat.ready=false;seat.disconnectedAt=now;cancel();break;
    case 'reconnect':member();seat.connected=true;seat.disconnectedAt=null;break;
    case 'exit':case 'expire':
      member();if(seat.kind!=='human')throw Error('AI does not exit through membership');
      if(event.type==='expire'&&(seat.connected||seat.disconnectedAt===null||now-seat.disconnectedAt<60000))throw Error('Reconnect grace has not expired');
      if(['playing','starting'].includes(t.phase))throw Error('Resolve active-match departure through engine policy first');
      Object.assign(seat,{occupied:false,connected:false,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:false});cancel();break;
    case 'concede':
      member();if(seat.kind!=='human'||t.phase!=='playing')throw Error('No active human player can concede');
      Object.assign(seat,{occupied:false,connected:false,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:true});break;
    case 'countdown': {
      if(t.phase!=='selecting')throw Error('Table is not selecting decks');
      const blockers=countdownBlockers(t);
      if(blockers.length)throw Error('Every seat must be ready');
      t.phase='countdown';t.countdownAt=now+10000;break;
    }
    case 'tick':
      if(t.phase!=='countdown'||now<t.countdownAt)throw Error('Countdown has not completed');
      if(!launchId)throw Error('Launch identity required');t.phase='starting';t.launchId=launchId;t.generation++;t.countdownAt=null;break;
    case 'engine-started':
      if(t.phase!=='starting'||event.launchId!==t.launchId||!event.matchId)throw Error('Wrong engine launch');
      t.phase='playing';t.matchId=event.matchId;break;
    case 'engine-failed':
      if(t.phase!=='starting'||event.launchId!==t.launchId)throw Error('Wrong engine launch');
      t.phase='selecting';t.launchId=null;t.seats.forEach(s=>s.ready=false);break;
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
        Object.assign(s,{occupied:false,connected:false,ready:false,deckVersion:null,rematch:null,disconnectedAt:null,conceded:false});
      }
      t.phase='selecting';t.launchId=null;t.matchId=null;t.rematchAt=null;break;
    }
    default:throw Error('Unknown table transition');
  }
  t.revision++;return t;
}
