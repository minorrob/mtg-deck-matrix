import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,renameSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {SeatAccess} from '../contracts/seat-access.mjs';
import {transitionTable} from '../contracts/table-lifecycle.mjs';

const safeClone=value=>structuredClone(value);
const ACTION_KEYS=new Set(['matchId','actionId','revision','kind','choiceId','targetId','indices','value','amounts','skip','text','cancel']);
function validateAction(input){
  if(!input||Object.keys(input).some(key=>!ACTION_KEYS.has(key)))throw Error('Unknown action field');
  if(typeof input.matchId!=='string'||!input.matchId||typeof input.actionId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(input.actionId)||!Number.isSafeInteger(input.revision)||input.revision<0||!['ok','cancel','card','player','answer'].includes(input.kind))throw Error('Invalid action envelope');
  if(['card','player'].includes(input.kind)&&!Number.isSafeInteger(input.targetId))throw Error('Action target required');
  if(input.kind==='answer'&&typeof input.choiceId!=='string')throw Error('Choice identity required');
  for(const key of ['indices','amounts'])if(input[key]!==undefined&&(!Array.isArray(input[key])||input[key].length>256||input[key].some(n=>!Number.isSafeInteger(n)||n<0)))throw Error('Invalid action selection');
  if(input.value!==undefined&&(!Number.isSafeInteger(input.value)||Math.abs(input.value)>1_000_000))throw Error('Invalid action value');
  if(input.skip!==undefined&&typeof input.skip!=='boolean')throw Error('Invalid action skip');
  if(input.cancel!==undefined&&typeof input.cancel!=='boolean')throw Error('Invalid action cancel');
  if(input.text!==undefined&&(typeof input.text!=='string'||input.text.length>1000))throw Error('Invalid action text');
}
function publicTable(table,member){
  return {...safeClone(table),seats:table.seats.map(seat=>({seatId:seat.seatId,kind:seat.kind,name:seat.name,occupied:seat.occupied,connected:seat.connected,ready:seat.ready,rematch:seat.rematch,
    ...(seat.commander?{commander:seat.commander}:{}),...(seat.seatId===member.seatId?{deckVersion:seat.deckVersion}: {})}))};
}

/** Durable single-table coordinator. Forge remains the match authority. */
export class TableBroker{
  #file;#state;#access;#clock;#bridge;#launch;#resolveDeck;#catalog;#report;
  constructor({file,table,clock=()=>Date.now(),bridge,launch,resolveDeck,catalog,report,initialDeckVersions={}}){
    if(!file||!table||typeof bridge!=='function')throw Error('Table broker configuration required');
    this.#file=resolve(file);this.#clock=clock;this.#bridge=bridge;this.#launch=launch;this.#resolveDeck=resolveDeck;this.#catalog=catalog;this.#report=report;
    if(existsSync(this.#file)){
      const loaded=JSON.parse(readFileSync(this.#file));if(loaded.schema!=='CrankMagicBroker@1'||loaded.table.tableId!==table.tableId)throw Error('Stored table does not match');loaded.feedback??=[];loaded.lastMatchId??=null;loaded.matchSeats??={};this.#state=loaded;this.#access=new SeatAccess(loaded.access);
    }else{
      this.#state={schema:'CrankMagicBroker@1',table:safeClone(table),membershipEpochs:table.seats.map(()=>0),presence:{},deckSnapshots:safeClone(initialDeckVersions),outbox:[],feedback:[],lastMatchId:null,matchSeats:{}};this.#access=new SeatAccess();this.#save();
    }
  }
  #save(){mkdirSync(dirname(this.#file),{recursive:true});this.#state.access=this.#access.snapshot();const temp=this.#file+'.tmp';writeFileSync(temp,JSON.stringify(this.#state,null,2));renameSync(temp,this.#file);}
  #transition(event,extra={}){this.#state.table=transitionTable(this.#state.table,{...event,revision:this.#state.table.revision},{now:this.#clock(),...extra});this.#save();return this.#state.table;}
  hostView(){return safeClone(this.#state.table);}
  invite(seatId,ttl=600000){const seat=this.#state.table.seats[seatId];if(!seat||seat.kind!=='human'||seat.occupied)throw Error('Seat unavailable');const code=this.#access.invite({tableId:this.#state.table.tableId,seatId,generation:this.#state.membershipEpochs[seatId],now:this.#clock(),ttl});this.#save();return {tableId:this.#state.table.tableId,seatId,invite:code,expiresIn:ttl};}
  async join(input){
    if(!input||input.tableId!==this.#state.table.tableId||typeof input.invite!=='string')throw Object.assign(Error('Invitation required'),{status:401});
    const table=safeClone(this.#state.table),access=new SeatAccess(this.#access.snapshot());let claimed;
    const capability=access.redeem(input.invite,{tableId:table.tableId,generationForSeat:seatId=>this.#state.membershipEpochs[seatId],now:this.#clock(),claim:seatId=>{claimed=seatId;this.#state.table=transitionTable(table,{type:'join',seatId,revision:table.revision},{now:this.#clock()});}});
    this.#access=access;this.#state.presence[claimed]={lastSeen:this.#clock()};this.#save();
    return {schema:'CrankMagicSeatSession@1',tableId:table.tableId,seatId:claimed,capability};
  }
  async authenticate(capability){
    let member;try{member=this.#access.resolve(capability,{tableId:this.#state.table.tableId});}catch(error){throw Object.assign(error,{status:401});}
    if(member.generation!==this.#state.membershipEpochs[member.seatId]||!this.#state.table.seats[member.seatId]?.occupied)throw Object.assign(Error('Invalid seat session'),{status:401});
    return {...member,capability};
  }
  async table(member){const matchId=this.#state.table.matchId||this.#state.lastMatchId;return {table:publicTable(this.#state.table,member),feedbackReceived:!!this.#state.feedback.find(item=>item.matchId===matchId&&item.seatId===member.seatId),...(this.#catalog?{catalog:safeClone(this.#catalog)}:{})};}
  async deck(member,input){
    if(typeof this.#resolveDeck!=='function')throw Error('Host deck validation is unavailable');
    const version=await this.#resolveDeck(member,safeClone(input));if(!version||typeof version.id!=='string'||!version.validated||!version.snapshot)throw Error('Validated deck version required');
    this.#state.deckSnapshots[version.id]=safeClone(version);const table=this.#transition({type:'deck',seatId:member.seatId,deckVersion:version.id});
    table.seats[member.seatId].commander=version.commander;this.#save();return {table:publicTable(table,member)};
  }
  async ready(member,input){const table=this.#transition({type:'ready',seatId:member.seatId,ready:input?.ready===true});return {table:publicTable(table,member)};}
  async heartbeat(member){
    const seat=this.#state.table.seats[member.seatId];if(!seat.connected)this.#transition({type:'reconnect',seatId:member.seatId});
    // Game views already poll frequently. Persist presence at most every ten
    // seconds, rather than rewriting the table for every board refresh.
    if(seat.connected&&this.#clock()-(this.#state.presence[member.seatId]?.lastSeen??-Infinity)<10000)return {connected:true,revision:this.#state.table.revision};
    this.#state.presence[member.seatId]={lastSeen:this.#clock()};this.#save();return {connected:true,revision:this.#state.table.revision};
  }
  async exit(member){
    if(this.#state.table.phase==='starting')throw Error('Wait for the game to finish opening before leaving the table');
    if(this.#state.table.phase==='playing'){await this.#bridge(member.seatId,'concede',{});this.#transition({type:'concede',seatId:member.seatId});}
    else this.#transition({type:'exit',seatId:member.seatId});
    this.#access.release(this.#state.table.tableId,member.seatId);this.#state.membershipEpochs[member.seatId]++;delete this.#state.presence[member.seatId];this.#save();return {exited:true,conceded:this.#state.table.phase==='playing'};
  }
  async rematch(member,input){let table=this.#transition({type:'rematch-vote',seatId:member.seatId,accept:input?.accept===true});if(table.seats.filter(s=>s.kind==='human'&&s.occupied).every(s=>s.connected&&s.rematch===true))table=this.#transition({type:'next-selection',seatId:member.seatId});return {table:publicTable(table,member)};}
  async view(member){if(!['playing','rematch'].includes(this.#state.table.phase))throw Error('No match is active');const value=await this.#bridge(member.seatId,'view');if(value.viewerSeatId!==member.seatId||value.viewerPlayerId!==member.seatId)throw Object.assign(Error('Engine returned the wrong private view'),{status:502});return value;}
  async action(member,input){validateAction(input);if(this.#state.table.phase!=='playing'||input.matchId!==this.#state.table.matchId)throw Error('Wrong or inactive match');const {matchId,...action}=input;return this.#bridge(member.seatId,'action',action);}
  async forcePass(member){
    if(this.#state.table.phase!=='playing')throw Error('No active match is available to force-pass');
    return this.#bridge(member.seatId,'force-pass',{});
  }
  async report(member){const matchId=this.#state.table.matchId||this.#state.lastMatchId;if(!matchId||typeof this.#report!=='function')throw Error('No completed match report is available');return this.#report(member.seatId,matchId);}
  async feedback(member,input){
    const matchId=this.#state.table.matchId||this.#state.lastMatchId;
    if(!matchId||input?.matchId!==matchId||!Number.isInteger(input.rating)||input.rating<1||input.rating>5||typeof input.notes!=='string'||input.notes.length>4000)throw Error('Invalid game feedback');
    for(const key of ['deckRating','experienceRating'])if(input[key]!==undefined&&(!Number.isInteger(input[key])||input[key]<1||input[key]>5))throw Error('Invalid game feedback rating');
    const deckVersion=this.#state.matchSeats[matchId]?.find(seat=>seat.seatId===member.seatId)?.deckVersion||null;
    const record={schema:'CrankMagicMatchFeedback@1',matchId,seatId:member.seatId,deckVersion,rating:input.rating,deckRating:input.deckRating??input.rating,experienceRating:input.experienceRating??input.rating,notes:input.notes,submittedAt:new Date(this.#clock()).toISOString()};
    const index=this.#state.feedback.findIndex(item=>item.matchId===matchId&&item.seatId===member.seatId);if(index>=0)this.#state.feedback[index]=record;else this.#state.feedback.push(record);this.#save();
    const expected=this.#state.matchSeats[matchId]?.filter(seat=>seat.kind==='human'&&seat.occupied).map(seat=>seat.seatId)||[];
    const received=this.#state.feedback.filter(item=>item.matchId===matchId).map(item=>item.seatId);return {accepted:true,seatId:member.seatId,receivedSeatIds:received,complete:expected.every(id=>received.includes(id))};
  }
  async hostReady(ready){const table=this.#transition({type:'ready',seatId:0,ready:ready===true});return this.hostView();}
  async beginCountdown(){return this.#transition({type:'countdown',seatId:0});}
  async tick(){
    const launchId=randomUUID(),matchId=randomUUID(),table=this.#transition({type:'tick',seatId:0}, {launchId});this.#state.outbox.push({kind:'launch',launchId,matchId,status:'pending'});this.#save();return table;
  }
  async processOutbox(){
    const item=this.#state.outbox.find(x=>x.status==='pending'||x.status==='running');if(!item)return null;if(typeof this.#launch!=='function')throw Error('No match launcher configured');
    item.status='running';this.#save();try{const matchId=await this.#launch({table:safeClone(this.#state.table),decks:safeClone(this.#state.deckSnapshots),launchId:item.launchId,matchId:item.matchId});if(matchId!==item.matchId)throw Error('Launcher returned the wrong match identity');item.status='done';this.#transition({type:'engine-started',seatId:0,launchId:item.launchId,matchId});return matchId;}
    catch(error){item.status='failed';item.error=String(error.message||error);this.#transition({type:'engine-failed',seatId:0,launchId:item.launchId});throw error;}
  }
  async complete(matchId){this.#state.lastMatchId=matchId;this.#state.matchSeats[matchId]=safeClone(this.#state.table.seats);this.#save();return this.#transition({type:'completed',seatId:0,matchId});}
  async disconnectExpired(){
    const now=this.#clock();for(const seat of this.#state.table.seats.filter(s=>s.kind==='human'&&s.occupied&&s.seatId!==0)){
      const last=this.#state.presence[seat.seatId]?.lastSeen??now;if(seat.connected&&now-last>=30000)this.#transition({type:'disconnect',seatId:seat.seatId});
      else if(!seat.connected&&seat.disconnectedAt!==null&&now-seat.disconnectedAt>=60000){
        if(this.#state.table.phase==='playing'){await this.#bridge(seat.seatId,'concede',{});this.#transition({type:'concede',seatId:seat.seatId});}
        else if(this.#state.table.phase!=='starting')this.#transition({type:'expire',seatId:seat.seatId});else continue;
        this.#access.release(this.#state.table.tableId,seat.seatId);this.#state.membershipEpochs[seat.seatId]++;delete this.#state.presence[seat.seatId];this.#save();
      }
    }
    return this.hostView();
  }
}
