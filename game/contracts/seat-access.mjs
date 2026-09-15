import {randomBytes,createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
/** Local broker primitive. Only hash records are persistable; never serialize capabilities to logs. */
export class SeatAccess {
  #invites=new Map();#sessions=new Map();
  invite({tableId,seatId,generation,now,ttl=600000}){
    if(!tableId||!Number.isSafeInteger(seatId)||seatId<0||seatId>3||!Number.isSafeInteger(generation)||!Number.isSafeInteger(now)||!Number.isSafeInteger(ttl)||ttl<=0)throw Error('Invalid invitation');
    // One current invite per seat generation; reissuing revokes earlier unclaimed invites.
    for(const [key,v]of this.#invites)if(v.tableId===tableId&&v.seatId===seatId)this.#invites.delete(key);
    const code=randomBytes(32).toString('base64url');this.#invites.set(hash(code),{tableId,seatId,generation,expiresAt:now+ttl});return code;
  }
  redeem(code,{tableId,generation,now,claim}){
    if(typeof code!=='string'||!Number.isSafeInteger(now)||typeof claim!=='function')throw Error('Invalid invitation');const key=hash(code),v=this.#invites.get(key);
    if(!v||v.tableId!==tableId||v.generation!==generation||v.expiresAt<=now)throw Error('Invitation expired or unavailable');
    // Claim callback must be synchronous and durable in the eventual broker transaction.
    claim(v.seatId);this.#invites.delete(key);const capability=randomBytes(32).toString('base64url');
    this.#sessions.set(hash(capability),{tableId,seatId:v.seatId,generation});return capability;
  }
  authorize(capability,{tableId,generation}){
    if(typeof capability!=='string')throw Error('Seat session required');const v=this.#sessions.get(hash(capability));
    if(!v||v.tableId!==tableId||v.generation!==generation)throw Error('Invalid seat session');return {...v};
  }
  release(tableId,seatId){for(const map of [this.#invites,this.#sessions])for(const [key,v]of map)if(v.tableId===tableId&&v.seatId===seatId)map.delete(key);}
}
