import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable,transitionTable} from '../contracts/table-lifecycle.mjs';
import {SeatAccess} from '../contracts/seat-access.mjs';
const initial=()=>createTable({tableId:'table-a',seats:[{seatId:0,kind:'human',occupied:true},{seatId:1,kind:'human'},{seatId:2,kind:'ai'}]});
test('ready countdown is invalidated by edits; one launch; unanimous rematch retains seats and reselects decks',()=>{
  let t=initial();const go=(event,now=0)=>t=transitionTable(t,{...event,revision:t.revision},{now,launchId:'launch-1'});
  go({type:'join',seatId:1});for(let seatId=0;seatId<3;seatId++){go({type:'deck',seatId,deckVersion:'deck-'+seatId});go({type:'ready',seatId,ready:true});}
  go({type:'countdown'});assert.equal(t.countdownAt,10000);assert.throws(()=>go({type:'tick'},9999));
  go({type:'deck',seatId:1,deckVersion:'new-deck'});assert.equal(t.phase,'selecting');assert.throws(()=>go({type:'countdown'}));
  go({type:'ready',seatId:1,ready:true});go({type:'countdown'});go({type:'tick'},10000);assert.throws(()=>go({type:'tick'},10001));
  assert.throws(()=>go({type:'engine-started',launchId:'other',matchId:'match'}));go({type:'engine-started',launchId:'launch-1',matchId:'match'});
  assert.throws(()=>go({type:'deck',seatId:1,deckVersion:'bad'}));go({type:'completed',matchId:'match'});
  go({type:'rematch-vote',seatId:0,accept:true});assert.throws(()=>go({type:'next-selection'}),/Waiting/);
  go({type:'rematch-vote',seatId:1,accept:true});go({type:'next-selection'});assert.equal(t.phase,'selecting');assert.ok(t.seats.every(s=>s.occupied&&!s.ready));assert.equal(t.seats[1].deckVersion,'new-deck');
});
test('disconnect cancels readiness; grace precedes release; stale updates rejected',()=>{
  let t=initial();const go=(event,now)=>t=transitionTable(t,{...event,revision:t.revision},{now});
  go({type:'disconnect',seatId:0},100);assert.throws(()=>go({type:'expire',seatId:0},60099));
  go({type:'reconnect',seatId:0},200);assert.equal(t.seats[0].ready,false);assert.throws(()=>go({type:'expire',seatId:0},90000));
  go({type:'disconnect',seatId:0},100000);go({type:'expire',seatId:0},160000);assert.equal(t.seats[0].occupied,false);
  assert.throws(()=>transitionTable(t,{type:'join',seatId:0,revision:0},{now:160000}),/Stale/);
});
test('an active human can concede without changing another seat',()=>{
  let t=initial();const go=(event,now=0)=>t=transitionTable(t,{...event,revision:t.revision},{now,launchId:'launch-1'});
  go({type:'join',seatId:1});for(let seatId=0;seatId<3;seatId++){go({type:'deck',seatId,deckVersion:'deck-'+seatId});go({type:'ready',seatId,ready:true});}
  go({type:'countdown'});go({type:'tick'},10000);go({type:'engine-started',launchId:'launch-1',matchId:'match'});go({type:'concede',seatId:1},10001);
  assert.equal(t.seats[1].occupied,false);assert.equal(t.seats[1].conceded,true);assert.equal(t.seats[0].occupied,true);assert.equal(t.phase,'playing');
});
test('invitations are single-use, scoped, revocable and never let the caller choose another seat',()=>{
  const access=new SeatAccess(),context={tableId:'a',generation:0,now:0};
  const first=access.invite({...context,seatId:1});const second=access.invite({...context,seatId:1});
  assert.throws(()=>access.redeem(second,{...context,now:undefined,claim:()=>{}}));
  assert.throws(()=>access.redeem(second,{...context,claim:()=>{throw Error('Seat occupied');}}),/occupied/);
  assert.throws(()=>access.redeem(first,{...context,claim:()=>{}}));let claimed;
  const session=access.redeem(second,{...context,claim:seat=>claimed=seat});assert.equal(claimed,1);
  assert.equal(access.authorize(session,context).seatId,1);assert.throws(()=>access.authorize(session,{...context,tableId:'b'}));
  assert.throws(()=>access.redeem(second,{...context,claim:()=>{}}));access.release('a',1);assert.throws(()=>access.authorize(session,context));
  const expired=access.invite({...context,seatId:2,ttl:1});assert.throws(()=>access.redeem(expired,{...context,now:1,claim:()=>{}}));
});
