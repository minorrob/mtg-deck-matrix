/** Pure authoritative table transitions. Transport authenticates actor; clients never set time/IDs. */
export function createTable({tableId,seats,settings}) {
  if(!tableId||seats.length<2||seats.length>4||!seats.some(s=>s.kind==='human'))throw Error('A table needs 2–4 seats and a human');
  if(seats.some((s,i)=>s.seatId!==i||!['human','ai'].includes(s.kind)))throw Error('Invalid seats');
  return {schema:'CrankMagicTable@1',tableId,revision:0,phase:'selecting',generation:0,countdownAt:null,launchId:null,matchId:null,...(settings?{settings:structuredClone(settings)}:{}),
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
    case 'countdown':
      if(t.phase!=='selecting'||!t.seats.every(s=>s.occupied&&s.connected&&s.ready&&s.deckVersion))throw Error('Every seat must be ready');
      t.phase='countdown';t.countdownAt=now+5000;break;
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
      t.phase='rematch';t.seats.forEach(s=>{s.ready=false;s.rematch=s.kind==='ai'?true:null;});break;
    case 'rematch-vote':
      member();if(t.phase!=='rematch'||seat.kind!=='human'||!seat.connected)throw Error('No rematch vote available');seat.rematch=!!event.accept;break;
    case 'next-selection':
      if(t.phase!=='rematch'||!t.seats.filter(s=>s.kind==='human'&&s.occupied).every(s=>s.connected&&s.rematch===true)||!t.seats.some(s=>s.kind==='human'&&s.occupied))throw Error('Waiting for other players');
      t.phase='selecting';t.launchId=null;t.matchId=null;t.seats.forEach(s=>{s.ready=false;s.rematch=null;});break;
    default:throw Error('Unknown table transition');
  }
  t.revision++;return t;
}
