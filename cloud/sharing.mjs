/* Live, scoped sharing. The existing library CAS protects both local-device and collaborator edits.
   Only explicit projections cross the permission boundary; backups, preferences and purchase details never do. */
import '../collection-model.js';
import '../collection-exchange.js';
import {createLibrary, Conflict} from './library.mjs';
import {ADVISE_CARDS,ADVISE_FIELDS} from './advise-cards.mjs';
import {mailReady,sendMail} from './mail.mjs';
import {admitAddress} from './access-invites.mjs';
const M = globalThis.CrankCollection, E = globalThis.CrankExchange;
export class ShareError extends Error {constructor(message, status=400){super(message);this.status=status;}}
// Keep the original game/library identity stable when its verified sign-in address changes.
export async function sharedIdentity(db,email){const row=await db.prepare('SELECT i.active,u.email AS canonical FROM account_identities i JOIN users u ON u.id=i.user_id WHERE i.email=?').bind(email).first();return row?row.active?row.canonical:null:email;}
const fail=(message,status=400)=>{throw new ShareError(message,status);};
const str=(s,max)=>typeof s==='string'&&s.trim().length<=max?s.trim():fail('Enter a shorter value.');
const email=s=>{const v=str(s,254).toLowerCase();return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)?v:fail('Enter a valid email address.');};
const role=r=>['reviewer','collaborator'].includes(r)?r:fail('Choose Reviewer or Collaborator.');
const card=c=>c?{id:c.id,name:c.name,oracleId:c.oracleId||null,typeLine:c.typeLine||'',manaCost:c.manaCost||'',image:c.image||null}:null;
const encode=async data=>{const copy=await E.backup(data);const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(copy)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return {body:btoa(binary),checksum:copy.checksum,revision:data.state.revision};};
async function decode(body){const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,parts=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24*1024*1024){await reader.cancel();fail('This library is too large to share. Export a smaller library.',413);}parts.push(value);}return E.readBackup(await new Blob(parts).text());}
export function sharing(db,env,{now=()=>new Date().toISOString(),fetchImpl=fetch}={}){
  const library=createLibrary(db,{now}),q=(sql,...args)=>db.prepare(sql).bind(...args);
  const all=async(sql,...args)=>(await q(sql,...args).all()).results;
  async function profile(person){
    await q("INSERT INTO profiles(user_id,name,avatar,updated_at) VALUES (?,'','',?) ON CONFLICT(user_id) DO NOTHING",person.id,now()).run();
    const p=await q('SELECT name,avatar,email FROM profiles WHERE user_id=?',person.id).first();
    return {...p,id:person.id,email:p.email||person.email,canInvite:String(person.id)===String(env.INVITE_ADMIN_ID||''),emailReady:mailReady(env)};
  }
  async function snapshot(owner){const head=await library.head(owner);if(!head)fail('Sync your library to the cloud before sharing it.',409);const version=await library.version(owner,head.id);return {head,data:await decode(version.body)};}
  async function permitted(id,person,write=false,owner=false){
    const s=await q('SELECT s.*,p.name AS owner_name FROM shares s LEFT JOIN profiles p ON p.user_id=s.owner_id WHERE s.id=?',id).first();
    if(!s)fail('This shared item is unavailable.',404);
    const grant=await q('SELECT role FROM share_grants WHERE share_id=? AND user_id=?',id,person.id).first();
    const mine=s.owner_id===person.id;
    const access=mine?'owner':grant?.role==='collaborator'||s.public_role==='collaborator'?'collaborator':grant?.role||s.public_role;
    if(!access)fail('This shared item is unavailable.',404);
    if((owner&&!mine)||(write&&!['owner','collaborator'].includes(access)))fail('Only the owner can manage access; Collaborators can edit the shared content.',403);
    /* HOW THE PERSON REACHES IT (the Decks requirements' FLT-6, 2026-10-23): their own, a grant to them, or public only. A
       grant wins over public, so a deck shared with someone and also made public reads as theirs to see either way. */
    return {...s,access,via:mine?'owner':grant?'grant':'public'};
  }
  function project(s,state){
    if(s.kind==='deck'){
      const d=state.decks.find(x=>x.id===s.source_id&&!x.archived);if(!d)fail('The owner removed or archived this deck.',404);
      const slots=d.slots.filter(x=>x.purpose==='main');
      const ids=new Set([...d.commanders,...slots.map(x=>x.cardId)]);
      return {name:d.name,notes:d.notes||'',description:d.description||'',commanders:d.commanders.map(id=>card(state.cards[id])),cards:[...ids].map(id=>card(state.cards[id])),slots:slots.map(x=>({id:x.id,cardId:x.cardId,quantity:x.quantity})),bracket:d.definition?.bracket||3};
    }
    return {name:'Library',cards:Object.values(state.cards).map(card),lots:state.lots.map(l=>({id:l.id,cardId:l.cardId,quantity:l.quantity,source:l.source,assigned:!!l.allocation||l.location?.kind==='deck'}))};
  }
  async function read(id,person){const s=await permitted(id,person),{head,data}=await snapshot(s.owner_id);return {id:s.id,kind:s.kind,owner:s.owner_name||'CrankMagic player',access:s.access,via:s.via,head:head.id,content:project(s,data.state)};}
  async function list(person,kind){
    if(!['deck','library'].includes(kind))fail('Choose decks or libraries.');
    const rows=await all(`SELECT s.id FROM shares s WHERE s.kind=? AND s.owner_id<>? AND (s.public_role IS NOT NULL OR EXISTS(SELECT 1 FROM share_grants g WHERE g.share_id=s.id AND g.user_id=?)) ORDER BY s.id LIMIT 200`,kind,person.id,person.id);
    const items=[];for(const s of rows){try{items.push(await read(s.id,person));}catch(e){if(e.status!==404)throw e;}}return {items};
  }
  async function settings(person,kind,source){
    if(!['deck','library'].includes(kind))fail('Choose a deck or library.');
    const sourceId=kind==='library'?'library':str(source,150);
    const s=await q('SELECT * FROM shares WHERE owner_id=? AND kind=? AND source_id=?',person.id,kind,sourceId).first();
    if(!s)return {id:null,revision:0,publicRole:null,grants:[]};
    return {id:s.id,revision:s.revision,publicRole:s.public_role,grants:await all('SELECT g.user_id AS id,g.role,COALESCE(p.email,u.email) AS email,p.name FROM share_grants g JOIN users u ON u.id=g.user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE g.share_id=?',s.id)};
  }
  async function queue(person,to,subject,text){const id=crypto.randomUUID();await q('INSERT INTO share_mail(id,actor_id,recipient,subject,text,created_at) VALUES (?,?,?,?,?,?)',id,person.id,to,subject,text,now()).run();return id;}
  async function delivery(person,id){
    const row=await q('SELECT * FROM share_mail WHERE id=? AND actor_id=?',id,person.id).first();if(!row)fail('Message unavailable.',404);
    if(row.status==='sent')return {id,status:'sent'};
    if(!mailReady(env))return {id,status:'pending',error:'Email sending is not configured. Sharing is saved; use Retry notification after setup.'};
    const at=now(),cutoff=new Date(Date.parse(at)-23*60*60*1000).toISOString(),stale=new Date(Date.parse(at)-120000).toISOString();
    if(row.attempts>0&&(!row.first_attempt_at||row.first_attempt_at<=cutoff))return {id,status:row.status,error:'The safe email retry window expired. Ask the administrator to check delivery before sending again.'};
    const claim=await q("UPDATE share_mail SET status='sending',attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),last_attempt_at=? WHERE id=? AND (status IN ('pending','failed') OR (status='sending' AND last_attempt_at<?)) AND attempts<5 AND (attempts=0 OR first_attempt_at>?)",at,at,id,stale,cutoff).run();
    if(!claim.meta.changes)return {id,status:row.status,error:'This message is already being sent or needs administrator review.'};
    try {const sent=await sendMail(env,row,fetchImpl);await q("UPDATE share_mail SET status='sent',message_id=?,text='' WHERE id=?",sent.messageId,id).run();return {id,status:'sent'};}
    catch {await q("UPDATE share_mail SET status='failed' WHERE id=?",id).run();return {id,status:'failed',error:'Sharing is saved, but the email could not be sent. Retry notification.'};}
  }
  async function save(person,input,origin){
    const kind=input.kind,sourceId=kind==='library'?'library':str(input.sourceId,150);
    const before=await settings(person,kind,sourceId),{data}=await snapshot(person.id);
    const title=project({kind,source_id:sourceId},data.state).name;
    if(before.revision!==input.revision)fail('Sharing changed in another window. Reopen it before saving.',409);
    if(!Array.isArray(input.grants)||input.grants.length>50)fail('Share with up to 50 registered users.');
    const grants=[];for(const g of input.grants){const user=await q('SELECT u.id,COALESCE(p.email,u.email) AS email FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?',g.id).first();if(!user||user.id===person.id||user.email.startsWith('service:'))fail('Select another registered user from the suggestions.');if(grants.some(x=>x.id===user.id))fail('Each person can appear only once.');grants.push({...user,role:role(g.role)});}
    const publicRole=input.publicRole===null?null:role(input.publicRole),id=before.id||crypto.randomUUID();
    // A guarded write plus a constraint failure rolls back the whole batch if another window wins.
    const token=crypto.randomUUID();
    const statements=[q(`INSERT INTO shares(id,owner_id,kind,source_id,public_role,revision) VALUES (?,?,?,?,?,1) ON CONFLICT(owner_id,kind,source_id) DO UPDATE SET public_role=excluded.public_role,revision=shares.revision+1 WHERE shares.revision=?`,id,person.id,kind,sourceId,publicRole,before.revision)];
    // D1 serializes the transaction; assert the CAS changed a row before touching grants.
    statements.push(q("INSERT INTO share_cas_guard(id,ok) VALUES (?,changes())",token));
    statements.push(q('DELETE FROM share_grants WHERE share_id=?',id));
    for(const g of grants)statements.push(q('INSERT INTO share_grants(share_id,user_id,role) VALUES (?,?,?)',id,g.id,g.role));
    statements.push(q('DELETE FROM share_cas_guard WHERE id=?',token));
    try{await db.batch(statements);}catch(e){if(/constraint|unique/i.test(e.message))fail('Sharing changed in another window. Reopen it before saving.',409);throw e;}
    const mail=[];for(const g of grants){if(before.grants.some(x=>x.id===g.id&&x.role===g.role))continue;const mid=await queue(person,g.email,`${title} shared with you`,`${(await profile(person)).name||'A CrankMagic player'} shared ${title} with you as a ${g.role==='collaborator'?'Collaborator':'Reviewer'}.\n\nOpen CrankMagic: ${origin}/api/auth/login?to=${encodeURIComponent('#shared?item='+id+'&kind='+kind)}\n\n${kind==='deck'?'You can also choose this deck in Play.':''}`);mail.push(await delivery(person,mid));}
    return {settings:await settings(person,kind,sourceId),mail};
  }
  async function edit(person,id,input){
    const s=await permitted(id,person,true),{head,data}=await snapshot(s.owner_id);
    if(input.head!==head.id)fail('This item changed since you opened it. Reload it before editing; your changes were not saved.',409);
    const c=input.command||{};let command;
    if(s.kind==='deck'){
      if(c.type==='editDeck')command={type:'editDeck',deckId:s.source_id,name:str(c.name,160),notes:str(c.notes||'',5000)};
      else if(c.type==='target'){
        let chosen=data.state.cards[c.cardId]||Object.values(data.state.cards).find(x=>x.name===c.cardName);
        if(!chosen){const row=ADVISE_CARDS[c.cardName];if(!row)fail('This card is not in the verified catalog. Ask the owner to add it to their library first.');const facts=Object.fromEntries(ADVISE_FIELDS.map((key,i)=>[key,row[i]]));chosen={id:'card:'+facts.oracleId,name:c.cardName,oracleId:facts.oracleId,typeLine:facts.typeLine,colorIdentity:[...(facts.colorIdentity||'')],manaValue:facts.manaValue,verified:true,legalities:{commander:facts.legal===1?'legal':'not_legal'}};}
        command={type:'target',deckId:s.source_id,cardId:chosen.id,cards:[chosen],purpose:'main',quantity:c.quantity};
      }
      else fail('Choose a card from the owner’s library to edit this deck.');
    }else if(c.type==='quantity'&&data.state.lots.some(x=>x.id===c.lotId))command={type:'quantity',lotId:c.lotId,quantity:c.quantity,confirmed:c.confirmed===true};
    else fail('Choose a library record to edit.');
    let result;try{result=M.apply(data.state,{...command,id:crypto.randomUUID(),at:now()});}catch(e){fail(e.message);}
    const history=[...(data.history||[]),{id:crypto.randomUUID(),type:'shared-edit',at:now(),summary:result.summary}].slice(-2000);
    try{await library.save(s.owner_id,{...await encode({state:result.state,history}),parent:head.id,device:'Shared editing'});}catch(e){if(e instanceof Conflict)fail('The owner or another Collaborator saved first. Reload and try your edit again.',409);throw e;}
    return read(id,person);
  }
  async function emailDeck(person,input,origin){
    let s,item;if(input.id){s=await permitted(input.id,person,false,true);item=await read(s.id,person);if(s.kind!=='deck')fail('Choose a deck to email.');}else{s={id:null,kind:'deck',source_id:str(input.sourceId,150)};item={content:project(s,(await snapshot(person.id)).data.state)};}
    const to=email(input.email),c=item.content,counts=new Map();for(const slot of c.slots){const name=c.cards.find(x=>x.id===slot.cardId)?.name;if(name)counts.set(name,(counts.get(name)||0)+slot.quantity);}
    const text=`${c.name}\n\nCommanders: ${c.commanders.map(x=>x.name).join(' + ')}\n\n${[...counts].map(([n,q])=>`${q} ${n}`).join('\n')}\n\nShared deck: ${origin}/api/auth/login?to=${encodeURIComponent(s.id?'#shared?item='+s.id:'#shared')}\nA deck email is a list copy. Signing in and permission are required to open the live shared deck.`;
    return delivery(person,await queue(person,to,`CrankMagic deck: ${c.name}`,text));
  }
  async function admit(to){
    await admitAddress(db,env,to,{now,fetchImpl,fail});
  }
  return {profile,list,read,settings,save,edit,queue,delivery,emailDeck,
    async requestEmail(person,input,origin){
      if(!mailReady(env)||env.SHARING_ENABLED!=='on')fail('Verified email changes need the sharing service and email delivery configured. Your current address is unchanged.',503);
      const to=email(input.email),current=await profile(person);
      if(to===current.email)fail('This is already your email address.');
      if(await q('SELECT id FROM users WHERE email=? UNION SELECT user_id AS id FROM profiles WHERE email=? UNION SELECT user_id AS id FROM account_identities WHERE email=?',to,to,to).first())fail('That address is already associated with an account. Use another address or contact support.',409);
      const token=crypto.randomUUID()+crypto.randomUUID(),hash=await E.hash(token),expires=new Date(Date.parse(now())+1800000).toISOString();
      await db.batch([q('DELETE FROM profile_email_changes WHERE user_id=?',person.id),q('INSERT INTO profile_email_changes(token_hash,user_id,email,expires_at) VALUES (?,?,?,?)',hash,person.id,to,expires)]);
      const sent=await delivery(person,await queue(person,to,'Verify your CrankMagic email address',`Confirm your new email address within 30 minutes while signed in to your current CrankMagic account:\n\n${origin}/api/auth/login?to=${encodeURIComponent('#verify-email?token='+token)}\n\nIf you did not request this change, ignore this email. Your current sign-in has not changed.`));
      if(sent.status!=='sent')fail(sent.error||'Verification could not be sent. Your address is unchanged.',503);return {sent:true};
    },
    async confirmEmail(person,input){
      const hash=await E.hash(str(input.token,100));
      const pending=await q('SELECT email FROM profile_email_changes WHERE token_hash=? AND user_id=? AND expires_at>?',hash,person.id,now()).first();if(!pending)fail('This verification expired or belongs to another account. Request a new verification.',400);
      if(await q('SELECT id FROM users WHERE email=? UNION SELECT user_id AS id FROM profiles WHERE email=? UNION SELECT user_id AS id FROM account_identities WHERE email=?',pending.email,pending.email,pending.email).first())fail('That address now belongs to an account. Request another address.',409);
      await admit(pending.email);const previous=(await profile(person)).email,guard=crypto.randomUUID();
      await db.batch([q('DELETE FROM profile_email_changes WHERE token_hash=? AND user_id=? AND expires_at>?',hash,person.id,now()),q('INSERT INTO share_cas_guard(id,ok) VALUES (?,changes())',guard),q('INSERT INTO account_identities(email,user_id,active) VALUES (?,?,0) ON CONFLICT(email) DO UPDATE SET active=0',previous,person.id),q('INSERT INTO account_identities(email,user_id,active) VALUES (?,?,1)',pending.email,person.id),q('UPDATE profiles SET email=?,updated_at=? WHERE user_id=?',pending.email,now(),person.id),q('DELETE FROM share_cas_guard WHERE id=?',guard)]);
      return {email:pending.email,signOut:true};
    },
    async search(person,query){const term=str(query||'',100);if(term.length<3)return {users:[]};const pattern=term.replace(/[\\%_]/g,'\\$&')+'%';return {users:await all("SELECT u.id,COALESCE(p.email,u.email) AS email,COALESCE(p.name,'') AS name FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id<>? AND u.email NOT LIKE 'service:%' AND (COALESCE(p.email,u.email) LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\') ORDER BY p.name,u.email LIMIT 8",person.id,pattern,pattern)};},
    async updateProfile(person,input){const name=str(input.name,80),avatar=str(input.avatar||'',120000);if(avatar&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar))fail('Choose a PNG, JPEG or WebP profile picture.');await profile(person);await q('UPDATE profiles SET name=?,avatar=?,updated_at=? WHERE user_id=?',name,avatar,now(),person.id).run();return profile(person);},
    async invite(person,input,origin){
      if(String(person.id)!==String(env.INVITE_ADMIN_ID||''))fail('Only the CrankMagic administrator can invite new accounts.',403);
      const to=email(input.email),name=str(input.name,80),canonical=await sharedIdentity(db,to);if(canonical===null)fail('That sign-in address was retired. Invite the person at their current address.',409);if(!name)fail('Enter the invited person’s name.');
      if(!mailReady(env)||!env.ACCESS_INVITE_TOKEN||!env.ACCESS_INVITE_APP_IDS||!env.CLOUDFLARE_ACCOUNT_ID)fail('Invitations need email delivery and Access invitation permissions configured by the administrator.',503);
      await q("INSERT INTO account_invitations(email,name,invited_by,created_at,status) VALUES (?,?,?,?,'pending') ON CONFLICT(email) DO UPDATE SET name=excluded.name",to,name,person.id,now()).run();
      const prior=await q('SELECT status FROM account_invitations WHERE email=?',to).first();
      if(prior.status!=='admitted'){
        await admit(to);
        await q("UPDATE account_invitations SET status='admitted' WHERE email=?",to).run();
      }
      const invited=await library.user(canonical);await profile(invited);await q("UPDATE profiles SET name=? WHERE user_id=? AND name=''",name,invited.id).run();
      return delivery(person,await queue(person,to,'You are invited to CrankMagic',`Hi ${name},\n\nYou are invited to CrankMagic. Sign in with this email address to use your profile, build decks and play.\n\n${origin}/api/auth/login?to=%23welcome`));
    }
  };
}
export async function social(request,env,person,deps={}){
  const url=new URL(request.url),path=url.pathname.slice('/api/social'.length),method=request.method;
  const service=sharing(env.DB,env,deps);let input;
  if(method!=='GET'){const reader=request.body?.getReader();let bytes=0,parts=[];if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>180000){await reader.cancel();fail('That request is too large.',413);}parts.push(value);}try{input=JSON.parse(await new Blob(parts).text());}catch{fail('Send a JSON request.');}}
  if(path==='/me'&&method==='GET')return service.profile(person);
  if(path==='/profile'&&method==='PUT')return service.updateProfile(person,input);
  if(path==='/profile/email'&&method==='POST')return service.requestEmail(person,input,url.origin);
  if(path==='/profile/email/confirm'&&method==='POST')return service.confirmEmail(person,input);
  if(path==='/users'&&method==='GET')return service.search(person,url.searchParams.get('q'));
  if(path==='/shares'&&method==='GET')return service.list(person,url.searchParams.get('kind')||'deck');
  if(path==='/settings'&&method==='GET')return service.settings(person,url.searchParams.get('kind'),url.searchParams.get('source'));
  if(path==='/settings'&&method==='PUT')return service.save(person,input,url.origin);
  if(path==='/email'&&method==='POST')return service.emailDeck(person,input,url.origin);
  if(path==='/invite'&&method==='POST')return service.invite(person,input,url.origin);
  if(path==='/notify'&&method==='POST')return service.delivery(person,input.id);
  const item=/^\/shares\/([\da-f-]{36})$/.exec(path);
  if(item&&method==='GET')return service.read(item[1],person);
  if(item&&method==='PATCH')return service.edit(person,item[1],input);
  fail('No such sharing endpoint.',404);
}
