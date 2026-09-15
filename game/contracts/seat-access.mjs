import {randomBytes,createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** Local broker primitive. Only hash records are persistable; never serialize capabilities to logs. */
export class SeatAccess {
  #invites=new Map();#sessions=new Map();
  constructor(state){
    if(state){
      if(state.schema!=='CrankMagicSeatAccess@1'||!Array.isArray(state.invites)||!Array.isArray(state.sessions))throw Error('Invalid seat access state');
      this.#invites=new Map(state.invites.map(([key,value])=>[key,structuredClone(value)]));
      this.#sessions=new Map(state.sessions.map(([key,value])=>[key,structuredClone(value)]));
    }
  }
  invite({tableId,seatId,generation,now,ttl=600000}){
    if(!tableId||!Number.isSafeInteger(seatId)||seatId<0||seatId>3||!Number.isSafeInteger(generation)||!Number.isSafeInteger(now)||!Number.isSafeInteger(ttl)||ttl<=0)throw Error('Invalid invitation');
    // One current invite per seat generation; reissuing revokes earlier unclaimed invites.
    for(const [key,v]of this.#invites)if(v.tableId===tableId&&v.seatId===seatId)this.#invites.delete(key);
    const code=randomBytes(32).toString('base64url');this.#invites.set(hash(code),{tableId,seatId,generation,expiresAt:now+ttl});return code;
  }
  redeem(code,{tableId,generation,generationForSeat,now,claim}){
    if(typeof code!=='string'||!Number.isSafeInteger(now)||typeof claim!=='function'||(generationForSeat!==undefined&&typeof generationForSeat!=='function'))throw Error('Invalid invitation');const key=hash(code),v=this.#invites.get(key);
    const expected=generationForSeat?generationForSeat(v?.seatId):generation;
    if(!v||v.tableId!==tableId||v.generation!==expected||v.expiresAt<=now)throw Error('Invitation expired or unavailable');
    // Claim callback must be synchronous and durable in the eventual broker transaction.
    claim(v.seatId);this.#invites.delete(key);const capability=randomBytes(32).toString('base64url');
    this.#sessions.set(hash(capability),{tableId,seatId:v.seatId,generation:v.generation});return capability;
  }
  authorize(capability,{tableId,generation}){
    if(typeof capability!=='string')throw Error('Seat session required');const v=this.#sessions.get(hash(capability));
    if(!v||v.tableId!==tableId||v.generation!==generation)throw Error('Invalid seat session');return {...v};
  }
  resolve(capability,{tableId}){
    if(typeof capability!=='string')throw Error('Seat session required');const v=this.#sessions.get(hash(capability));
    if(!v||v.tableId!==tableId)throw Error('Invalid seat session');return {...v};
  }
  release(tableId,seatId){for(const map of [this.#invites,this.#sessions])for(const [key,v]of map)if(v.tableId===tableId&&v.seatId===seatId)map.delete(key);}
  snapshot(){return {schema:'CrankMagicSeatAccess@1',invites:[...this.#invites].map(([key,value])=>[key,{...value}]),sessions:[...this.#sessions].map(([key,value])=>[key,{...value}])};}
}
