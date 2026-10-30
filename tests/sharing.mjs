import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {sharing,ShareError,sharedIdentity} from '../cloud/sharing.mjs';
import {createLibrary} from '../cloud/library.mjs';
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
for(const f of ['0001_accounts','0002_ai','0003_sharing','0004_mail_retries','0005_access_invites','0011_invitations'])raw.exec(readFileSync(new URL('../cloud/migrations/'+f+'.sql',import.meta.url),'utf8'));
let snapshotReads=0;
const stmt=(sql,args=[])=>({bind:(...v)=>stmt(sql,v),first:async()=>{if(sql.includes(', s.body FROM snapshots'))snapshotReads++;return raw.prepare(sql).get(...args)||null},all:async()=>({results:raw.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}}),sync:()=>({meta:{changes:Number(raw.prepare(sql).run(...args).changes)}})});
const db={prepare:s=>stmt(s),batch:async list=>{raw.exec('BEGIN');try{const out=list.map(x=>x.sync());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};
const M=globalThis.CrankCollection,E=globalThis.CrankExchange,lib=createLibrary(db);
const owner=await lib.user('owner@example.com'),reviewer=await lib.user('reviewer@example.com'),writer=await lib.user('writer@example.com'),stranger=await lib.user('stranger@example.com');
let state=M.empty();const apply=(type,args)=>state=M.apply(state,{type,id:crypto.randomUUID(),...args}).state;
apply('cards',{cards:[{id:'leader',name:'Leader',commander:true,verified:true,typeLine:'Legendary Creature',colorIdentity:[],legalities:{commander:'legal'}},{id:'wastes',name:'Wastes',verified:true,typeLine:'Basic Land',colorIdentity:[],legalities:{commander:'legal'}}]});
apply('createDeck',{deckId:'deck:one',name:'Shared Test',commanders:['leader'],slots:[{cardId:'leader',quantity:1},{cardId:'wastes',quantity:99}]});
apply('acquire',{lot:{id:'owned',cardId:'wastes',quantity:5,paid:17,notes:'PRIVATE PURCHASE'}});
apply('preferences',{values:{privateSecret:'PRIVATE PREFERENCE'}});
const backup=await E.backup({state,history:[]});await lib.save(owner.id,{parent:null,revision:state.revision,device:'Test',checksum:backup.checksum,body:gzipSync(JSON.stringify(backup)).toString('base64')});
let sent=[],failMail=false,requests=[];
let clock=Date.now();const now=()=>new Date(clock).toISOString();
const mailFetch=async (url,args)=>{assert.equal(url,'https://api.resend.com/emails');requests.push(args);if(failMail)throw Error('offline');sent.push(JSON.parse(args.body));return Response.json({id:crypto.randomUUID()});};
const env={INVITE_ADMIN_ID:String(owner.id),RESEND_API_KEY:'test-only'};
const svc=sharing(db,env,{fetchImpl:mailFetch,now,cacheProjections:false});let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};const ok2=(c,m)=>{assert.ok(c,m);checks++;};const rejects=async(fn,status)=>{await assert.rejects(fn,e=>e instanceof ShareError&&e.status===status);checks++;};
await svc.updateProfile(writer,{name:'Will Player',avatar:''});await svc.profile(owner);
eq((await svc.search(owner,'Wi')).users.length,0,'minimum search length');eq((await svc.search(owner,'Will')).users[0].id,writer.id,'name search');eq((await svc.search(owner,'writer@')).users[0].id,writer.id,'email search');eq((await svc.search(owner,'%%%')).users.length,0,'wildcards are literal');
let result=await svc.save(owner,{kind:'deck',sourceId:'deck:one',revision:0,publicRole:null,grants:[{id:reviewer.id,role:'reviewer'},{id:writer.id,role:'collaborator'}]},'https://example.com');const id=result.settings.id;
eq(sent.length,2,'one notification per new recipient');eq(sent[0].from,'CrankMagic <invite@crankmagic.com>','verified sender domain');
eq((await svc.list(stranger,'deck')).items.length,0,'private item not listed');await rejects(()=>svc.read(id,stranger),404);
let item=await svc.read(id,reviewer);eq(item.access,'reviewer','review role');eq(item.via,'grant','reached through a grant to them');eq((await svc.read(id,owner)).via,'owner','the owner reads their own');eq(item.content.slots.reduce((s,x)=>s+x.quantity,0),100,'complete playable list');
eq(JSON.stringify(item).includes('PRIVATE'),false,'no inventory notes or preferences');
await rejects(()=>svc.edit(reviewer,id,{head:item.head,command:{type:'editDeck',name:'Hijacked'}}),403);
const updated=await svc.edit(writer,id,{head:item.head,command:{type:'editDeck',name:'Edited with permission',notes:'New strategy'}});eq(updated.content.name,'Edited with permission','collaborator edits owner item');
await rejects(()=>svc.edit(writer,id,{head:item.head,command:{type:'editDeck',name:'Stale'}}),409);
await rejects(()=>svc.edit(writer,id,{head:updated.head,command:{type:'deleteDeck'}}),400);
const quantity=await svc.edit(writer,id,{head:updated.head,command:{type:'target',cardId:'wastes',quantity:98}});eq(quantity.content.slots.find(x=>x.cardId==='wastes').quantity,98,'quantity uses model rules');
await rejects(()=>svc.emailDeck(writer,{id,email:'friend@example.com'},'https://example.com'),403);
result=await svc.save(owner,{kind:'deck',sourceId:'deck:one',revision:1,publicRole:'reviewer',grants:[]},'https://example.com');
eq((await svc.list(stranger,'deck')).items.length,1,'public deck available');eq((await svc.list(stranger,'deck')).items[0].via,'public','a stranger reaches it only because it is public');await rejects(()=>svc.edit(writer,id,{head:quantity.head,command:{type:'editDeck',name:'No longer writer'}}),403);
await rejects(()=>svc.save(owner,{kind:'deck',sourceId:'deck:one',revision:1,publicRole:'collaborator',grants:[]},'https://example.com'),409);
result=await svc.save(owner,{kind:'deck',sourceId:'deck:one',revision:2,publicRole:'collaborator',grants:[]},'https://example.com');eq((await svc.read(id,stranger)).access,'collaborator','explicit public editing');
result=await svc.save(owner,{kind:'deck',sourceId:'deck:one',revision:3,publicRole:null,grants:[]},'https://example.com');await rejects(()=>svc.read(id,stranger),404);
const library=await svc.save(owner,{kind:'library',sourceId:'library',revision:0,publicRole:null,grants:[{id:writer.id,role:'collaborator'},{id:reviewer.id,role:'reviewer'}]},'https://example.com');const li=await svc.read(library.settings.id,writer);eq(JSON.stringify(li).includes('PRIVATE'),false,'library projection excludes private metadata');eq(li.content.lots[0].paid,undefined,'paid amounts private');
// ROB-37: the library has its own permission boundary; deck grants prove nothing about it.
eq(Object.keys(li.content).sort(),['cards','lots','name'],'shared library contains only its scoped projection');
eq(Object.keys(li.content.lots[0]).sort(),['assigned','cardId','id','quantity','source'],'shared lots exclude prices, notes and private location details');
eq((await svc.list(reviewer,'library')).items.length,1,'Reviewer discovers explicitly shared library');
eq((await svc.list(stranger,'library')).items.length,0,'stranger cannot discover private library');
await rejects(()=>svc.read(li.id,stranger),404);
const beforeDenied=await lib.head(owner.id);
await rejects(()=>svc.edit(reviewer,li.id,{head:li.head,command:{type:'quantity',lotId:'owned',quantity:1}}),403);
await rejects(()=>svc.edit(stranger,li.id,{head:li.head,command:{type:'quantity',lotId:'owned',quantity:1}}),404);
await rejects(()=>svc.edit(writer,li.id,{head:li.head,command:{type:'quantity',lotId:'not-the-owners-lot',quantity:1}}),400);
await rejects(()=>svc.edit(writer,li.id,{head:li.head,command:{type:'editDeck',name:'Outside the library grant'}}),400);
await rejects(()=>svc.edit(writer,li.id,{head:li.head,command:{type:'quantity',lotId:'owned',quantity:1.5}}),400);
eq(await lib.head(owner.id),beforeDenied,'refused library commands never create an owner revision');
const changed=await svc.edit(writer,li.id,{head:li.head,command:{type:'quantity',lotId:'owned',quantity:6}});eq(changed.content.lots[0].quantity,6,'library collaborator edits quantity');
await rejects(()=>svc.edit(writer,li.id,{head:li.head,command:{type:'quantity',lotId:'owned',quantity:7}}),409);
eq((await svc.read(li.id,reviewer)).content.lots[0].quantity,6,'stale save leaves the accepted quantity intact');
eq(await lib.head(writer.id),null,'reading and editing a share never imports owner inventory into recipient library');
await svc.save(owner,{kind:'library',revision:1,publicRole:'reviewer',grants:[]},'https://example.com');
eq((await svc.read(li.id,stranger)).access,'reviewer','public library admits signed-in readers');
await rejects(()=>svc.edit(writer,li.id,{head:changed.head,command:{type:'quantity',lotId:'owned',quantity:7}}),403);
await svc.save(owner,{kind:'library',revision:2,publicRole:null,grants:[]},'https://example.com');
await rejects(()=>svc.read(li.id,writer),404);
await rejects(()=>svc.edit(writer,li.id,{head:changed.head,command:{type:'quantity',lotId:'owned',quantity:7}}),404);
eq((await svc.list(reviewer,'library')).items.length,0,'revoked library disappears from recipient catalog');
failMail=true;const mail=await svc.emailDeck(owner,{id,email:'friend@example.com'},'https://example.com');eq(mail.status,'failed','delivery failure reported');failMail=false;eq((await svc.delivery(owner,mail.id)).status,'sent','retry delivers');const count=sent.length;await svc.delivery(owner,mail.id);eq(sent.length,count,'sent messages not resent');await rejects(()=>svc.delivery(stranger,mail.id),404);
/* ROB-320 (Rob, 2026-10-30): anyone signed in may invite now, so a stranger reaches the same configuration check the owner does (it was a 403 before). Who may grant AI, and the five-person cap, are tests/invite-settings.mjs. */await rejects(()=>svc.invite(stranger,{name:'New',email:'new@example.com'},'https://example.com'),503);await rejects(()=>svc.invite(owner,{name:'New',email:'new@example.com'},'https://example.com'),503);
let admissions=[];const policyId='11111111-1111-1111-1111-111111111111',appId='00000000-0000-0000-0000-000000000000';
let accessPolicy={id:policyId,reusable:true,app_count:1,name:'Invited',decision:'allow',include:[{group:{id:'existing-group'}}],require:[{login_method:{id:'existing-provider'}}],exclude:[{email:{email:'blocked@example.com'}}],session_duration:'12h'};
const accessEnv={...env,SHARING_ENABLED:'on',ACCESS_INVITE_TOKEN:'test-only',ACCESS_INVITE_APP_IDS:appId,ACCESS_INVITE_POLICY_ID:policyId,CLOUDFLARE_ACCOUNT_ID:'0'.repeat(32),INVITE_CAP:'99'/* these checks are about admission; the cap is tests/invitations.mjs */};
let failAccess=false,holdAccess=null;
const accessFetch=async(url,args)=>{
  if(url==='https://api.resend.com/emails')return mailFetch(url,args);
  assert.equal(args.redirect,'manual');assert.ok(args.signal instanceof AbortSignal);
  if(failAccess)return Response.json({success:false},{status:403});
  if(holdAccess)await holdAccess;
  if(url.endsWith(`/apps/${appId}`)){assert.equal(args.method,'GET');return Response.json({success:true,result:{policies:[{id:policyId}]}});}
  assert.ok(url.endsWith(`/access/policies/${policyId}`),'only configured reusable policy is writable');
  if(args.method==='PUT'){const body=JSON.parse(args.body);admissions.push(body);accessPolicy={...accessPolicy,...body};}
  else assert.equal(args.method,'GET');
  return Response.json({success:true,result:accessPolicy});
};
const ready=sharing(db,accessEnv,{now,fetchImpl:accessFetch});
eq((await ready.invite(owner,{name:'New Player',email:'new@example.com'},'https://example.com')).status,'sent','invitation after admission');eq(admissions[0].include,[{group:{id:'existing-group'}},{email:{email:'new@example.com'}}],'only invited address added; existing group preserved');
eq([admissions[0].require,admissions[0].exclude,admissions[0].session_duration],[accessPolicy.require,accessPolicy.exclude,'12h'],'invitation preserves policy restrictions');
await ready.invite(owner,{name:'New Player',email:'new@example.com'},'https://example.com');eq(admissions.length,1,'retry does not add another policy');
const sentBeforeFailure=sent.length;failAccess=true;
await rejects(()=>ready.invite(owner,{name:'Rejected',email:'rejected@example.com'},'https://example.com'),502);failAccess=false;
eq(sent.length,sentBeforeFailure,'Access failure sends no invitation');
eq(raw.prepare('SELECT count(*) AS n FROM access_invite_locks').get().n,0,'failed admission releases its lock');
accessPolicy.app_count=2;await rejects(()=>ready.invite(owner,{name:'Wrong app',email:'wrong@example.com'},'https://example.com'),503);accessPolicy.app_count=1;
let releaseAccess;holdAccess=new Promise(r=>releaseAccess=r);
const firstInvite=ready.invite(owner,{name:'Concurrent One',email:'one@example.com'},'https://example.com');
while(!raw.prepare('SELECT count(*) AS n FROM access_invite_locks').get().n)await new Promise(r=>setTimeout(r,0));
await rejects(()=>ready.invite(owner,{name:'Concurrent Two',email:'two@example.com'},'https://example.com'),409);
releaseAccess();holdAccess=null;await firstInvite;
await ready.invite(owner,{name:'Concurrent Two',email:'two@example.com'},'https://example.com');
eq(accessPolicy.include.filter(r=>r.email).map(r=>r.email.email),['new@example.com','one@example.com','two@example.com'],'concurrent retry preserves both invitations');
await rejects(()=>svc.updateProfile(owner,{name:'X',avatar:'https://evil.example/pixel'}),400);
const beforeEmailSettings=await svc.settings(owner,'deck','deck:one');
await svc.emailDeck(owner,{sourceId:'deck:one',email:'copy@example.com'},'https://example.com');
eq(await svc.settings(owner,'deck','deck:one'),beforeEmailSettings,'Email Deck does not save unsaved permissions');
await ready.requestEmail(owner,{email:'changed@example.com'},'https://example.com');
const link=mailLink(sent.at(-1).text);
function mailLink(text){const match=text.match(/https:\/\/example.com\/api\/auth\/login\?to=(\S+)/);return new URLSearchParams(decodeURIComponent(match[1]).split('?')[1]).get('token');}
await rejects(()=>ready.confirmEmail(writer,{token:link}),400);
await ready.confirmEmail(owner,{token:link});
eq(await sharedIdentity(db,'owner@example.com'),null,'old sign-in retired');
eq(await sharedIdentity(db,'changed@example.com'),'owner@example.com','new sign-in preserves game and library identity');
eq((await ready.profile(owner)).email,'changed@example.com','profile reflects verified address');
await rejects(()=>ready.confirmEmail(owner,{token:link}),400);
eq((await ready.read(id,owner)).access,'owner','ownership survives email change');
eq((await svc.profile(owner)).emailReady,true,'Resend key enables email readiness');
eq((await sharing(db,{}).profile(owner)).emailReady,false,'missing key disables readiness');
eq(requests[0].headers.authorization,'Bearer test-only','secret used only in provider authorization');
eq(requests[0].redirect,'manual','credentials cannot follow redirects');
eq(requests[0].signal instanceof AbortSignal,true,'provider call has timeout');
const retryId=await svc.queue(owner,'retry@example.com','Retry test','Exact same payload');
failMail=true;await svc.delivery(owner,retryId);const failedRequest=requests.at(-1);failMail=false;
await svc.delivery(owner,retryId);eq(requests.at(-1).headers['Idempotency-Key'],failedRequest.headers['Idempotency-Key'],'retry keeps provider idempotency key');
eq(failedRequest.headers['Idempotency-Key'],`crankmagic-mail/${retryId}`,'provider key is the persisted outbox identity');
eq(requests.at(-1).body,failedRequest.body,'retry keeps exact content');
eq(raw.prepare('SELECT text FROM share_mail WHERE id=?').get(retryId).text,'','accepted content erased from outbox');
const expired=await svc.queue(owner,'retry@example.com','Expired retry','Never duplicate');failMail=true;await svc.delivery(owner,expired);failMail=false;clock+=24*60*60*1000;
const beforeExpired=requests.length;eq((await svc.delivery(owner,expired)).status,'failed','expired retry stays failed');eq(requests.length,beforeExpired,'no resend after provider idempotency expiration');
const interrupted=await svc.queue(owner,'retry@example.com','Interrupted','Recover safely');
raw.prepare("UPDATE share_mail SET status='sending',attempts=1,first_attempt_at=?,last_attempt_at=? WHERE id=?").run(now(),now(),interrupted);
eq((await svc.delivery(owner,interrupted)).status,'sending','active request cannot be duplicated');clock+=121000;
eq((await svc.delivery(owner,interrupted)).status,'sent','interrupted request can recover within safe window');
for(const reply of [()=>Response.json({error:'private provider data'},{status:429}),()=>Response.json({error:'bad sender'},{status:422}),()=>Response.json({})]){
  const failedSvc=sharing(db,env,{now,fetchImpl:async()=>reply()}),mid=await failedSvc.queue(owner,'retry@example.com','Failure','Test');
  const result=await failedSvc.delivery(owner,mid);eq(result.status,'failed','invalid provider response never accepted');eq(JSON.stringify(result).includes('private provider'),false,'provider data stays private');
}
// A shared-deck list must not decode a large collection once for every deck in it.
const loadOwner=await lib.user('load-owner@example.com');
let loadState=M.empty();
const loadApply=(type,args)=>loadState=M.apply(loadState,{type,id:crypto.randomUUID(),...args}).state;
loadApply('cards',{cards:[...Object.values(state.cards),...Array.from({length:1400},(_,i)=>({id:`load-card-${i}`,name:`Collection card ${i}`,typeLine:'Artifact',verified:true}))]});
for(let i=0;i<100;i++)loadApply('createDeck',{deckId:`load-deck-${i}`,name:`Load deck ${i}`,commanders:['leader'],slots:[{cardId:'leader',quantity:1},{cardId:'wastes',quantity:99}]});
async function saveLoadState(){const b=await E.backup({state:loadState,history:[]}),head=await lib.head(loadOwner.id);await lib.save(loadOwner.id,{parent:head?.id||null,revision:loadState.revision,device:'Test',checksum:b.checksum,body:gzipSync(JSON.stringify(b)).toString('base64')});}
await saveLoadState();
const loadIds=[];
for(let i=0;i<100;i++){
 const shared=await svc.save(loadOwner,{kind:'deck',sourceId:`load-deck-${i}`,revision:0,publicRole:'reviewer',grants:[]},'https://example.com');loadIds.push(shared.settings.id);
 if(i===9||i===99){
  snapshotReads=0;const listed=await svc.list(stranger,'deck');
  eq(listed.items.length,i+1,`${i+1} shared decks returned completely`);
  eq(snapshotReads,1,`${i+1} decks load their owner's full library only once`);
  eq(listed.items.map(x=>x.id),[...loadIds].sort(),'list order remains share-id order');
  eq(listed.items.every(x=>x.content.slots.reduce((n,slot)=>n+slot.quantity,0)===100),true,'every shared deck is complete');
 }
}
loadApply('editDeck',{deckId:'load-deck-0',name:'Fresh owner edit'});await saveLoadState();
snapshotReads=0;eq((await svc.list(stranger,'deck')).items.find(x=>x.id===loadIds[0]).content.name,'Fresh owner edit','later list reads fresh owner edits');eq(snapshotReads,1,'snapshot reuse ends with its list request');
await svc.save(loadOwner,{kind:'deck',sourceId:'load-deck-0',revision:1,publicRole:null,grants:[]},'https://example.com');
eq((await svc.list(stranger,'deck')).items.some(x=>x.id===loadIds[0]),false,'revocation applies on next list');await rejects(()=>svc.read(loadIds[0],stranger),404);
// Interleaved share IDs from different owners still use one snapshot per owner and keep public order.
await svc.save(owner,{kind:'deck',sourceId:'deck:one',revision:4,publicRole:'reviewer',grants:[]},'https://example.com');
snapshotReads=0;const mixed=await svc.list(stranger,'deck');eq(snapshotReads,2,'different owners load only their own library once');eq(mixed.items.length,100,'both owners retain their visible decks');eq(mixed.items.map(x=>x.id),mixed.items.map(x=>x.id).sort(),'grouping owners does not change visible order');
eq(mixed.items.find(x=>x.id===id).content.name,'Edited with permission','another owner never receives the cached first owner data');
// Projection memoization never caches authority or whole private libraries.
const memoDb={...db},cached=sharing(memoDb,env,{fetchImpl:mailFetch,now});
snapshotReads=0;const cold=await cached.list(stranger,'deck');eq(cold.items.length,100,'cold cached list remains complete');
eq(snapshotReads,2,'cold list decodes once per owner');
snapshotReads=0;const warm=await sharing(memoDb,env,{fetchImpl:mailFetch,now}).list(stranger,'deck');
eq(warm,cold,'another request receives the same authorized projections');eq(snapshotReads,0,'warm list does not decode full owner libraries');
const visibleId=loadIds[1];const visible=await cached.read(visibleId,stranger);visible.content.name='Caller mutation';
eq((await cached.read(visibleId,stranger)).content.name,'Load deck 1','returned data cannot mutate shared cache');
loadApply('editDeck',{deckId:'load-deck-1',name:'Fresh cached edit'});await saveLoadState();
snapshotReads=0;eq((await cached.read(visibleId,stranger)).content.name,'Fresh cached edit','new snapshot bypasses prior cached content immediately');eq(snapshotReads,1,'fresh head is decoded and validated');
snapshotReads=0;await cached.read(id,stranger);eq(snapshotReads,1,'projection entry bound evicts the least recently used version');
await svc.save(loadOwner,{kind:'deck',sourceId:'load-deck-1',revision:1,publicRole:null,grants:[{id:reviewer.id,role:'reviewer'}]},'https://example.com');
await rejects(()=>cached.read(visibleId,stranger),404);eq((await cached.read(visibleId,reviewer)).access,'reviewer','cached content still requires a current grant');
eq((await cached.list(stranger,'deck')).items.some(x=>x.id===visibleId),false,'revoked item is absent from warm list');
const scopedDb={...db};snapshotReads=0;await sharing(scopedDb,env,{fetchImpl:mailFetch,now}).read(id,stranger);eq(snapshotReads,1,'different database binding does not reuse another cache');
const damaged=await E.backup({state:loadState,history:[]});damaged.payload.state.decks[1].name='Unchecked change';
const oldHead=await lib.head(loadOwner.id);await lib.save(loadOwner.id,{parent:oldHead.id,revision:loadState.revision,device:'Test',checksum:damaged.checksum,body:gzipSync(JSON.stringify(damaged)).toString('base64')});
await assert.rejects(()=>cached.read(visibleId,reviewer),/checksum/);checks++;

/* ONE INVITATION, BOTH SIGN-INS (Rob, 2026-10-26): staging and production are each admitted and read back before the
   email goes, the email is HTML with a text twin, and Admin › General reports the setup as yes or no. */
{
  const {inviteTargets}=await import('../cloud/access-invites.mjs');
  const apps=['aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002'],policies=['bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002'];
  eq(inviteTargets({ACCESS_INVITE_APP_IDS:apps.join(', '),ACCESS_INVITE_POLICY_ID:policies.join(',')}),[{app:apps[0],policy:policies[0]},{app:apps[1],policy:policies[1]}],'the two lists are read in pairs');
  eq(inviteTargets({ACCESS_INVITE_APP_IDS:apps.join(','),ACCESS_INVITE_POLICY_ID:policies[0]}),[],'lists of different lengths configure nothing');
  eq(inviteTargets({ACCESS_INVITE_APP_IDS:'not-a-uuid',ACCESS_INVITE_POLICY_ID:policies[0]}),[],'a malformed id configures nothing');
  const names=['CrankMagic staging','CrankMagic Accounts'],domains=['staging.crankmagic.com','crankmagic.com/api/*'];
  const state=policies.map(id=>({id,reusable:true,app_count:1,name:'Invited',decision:'allow',include:[{email:{email:'rob@example.com'}}]}));
  const writes=[];let refuse=null;const mail=[];
  const fetch2=async(url,args)=>{
    if(url==='https://api.resend.com/emails'){const body=JSON.parse(args.body);mail.push(body);return Response.json({id:crypto.randomUUID()});}
    const app=apps.findIndex(a=>url.endsWith('/apps/'+a));if(app>=0)return Response.json({success:true,result:{name:names[app],domain:domains[app],policies:[{id:policies[app]}]}});
    const i=policies.findIndex(p=>url.endsWith('/policies/'+p));assert.ok(i>=0,'only the configured policies are called');
    if(args.method==='PUT'){if(refuse===i)return Response.json({success:false},{status:403});writes.push(i);state[i]={...state[i],...JSON.parse(args.body)};}
    return Response.json({success:true,result:state[i]});
  };
  const env2={...accessEnv,ACCESS_INVITE_APP_IDS:apps.join(','),ACCESS_INVITE_POLICY_ID:policies.join(','),INVITE_LINK_ORIGIN:'https://crankmagic.com',AI_EVERYONE:'on'};
  const both=sharing(db,env2,{now,fetchImpl:fetch2});
  refuse=1;
  await assert.rejects(()=>both.invite(owner,{name:'Half Way',email:'half@example.com'},'https://staging.example'),e=>e instanceof ShareError&&e.status===502&&/Already admitted: staging\.crankmagic\.com\./.test(e.message));checks++;
  eq(mail.length,0,'production refused: no email goes, and the refusal names what was already admitted');
  refuse=null;
  const r=await both.invite(owner,{name:'Half Way',email:'half@example.com'},'https://staging.example');
  eq(r.status,'sent','sent once both confirm');
  eq(r.access,[{app:apps[0],name:names[0],domain:domains[0],added:false},{app:apps[1],name:names[1],domain:domains[1],added:true}],'each application confirms the address; staging already had it from the refused try');
  eq(state.map(p=>p.include.filter(x=>x.email).map(x=>x.email.email)),[['rob@example.com','half@example.com'],['rob@example.com','half@example.com']],'the address is on both policies');
  eq(writes,[0,1],'each policy is written once');
  await both.invite(owner,{name:'Half Way',email:'half@example.com'},'https://staging.example');
  eq(writes.length,2,'sending again reads both policies and writes neither');
  const m=mail[0];
  eq([m.subject,m.from],['You are invited to CrankMagic','CrankMagic <invite@crankmagic.com>'],'the invitation subject and sender');
  ok2(m.html.includes('Hi Half Way,')&&m.html.includes('href="https://crankmagic.com/api/auth/login?to=%23welcome"')&&/^<!doctype html>/.test(m.html),'the email is HTML, with the name and the production sign-in link');
  ok2(!/\{\{\w+\}\}/.test(m.html),'every template token is filled');
  ok2(m.html.includes('src="https://crankmagic.com/assets/crankmagic/'),'its pictures come from production’s public pages, never staging');
  ok2(m.text.endsWith('\n\nhttps://crankmagic.com/api/auth/login?to=%23welcome')&&m.text.startsWith('Hi Half Way,'),'and it has a plain-text twin');
  mail.length=0;
  await both.invite(owner,{name:'<b>Eve</b> & "Co"',email:'eve@example.com'},'https://staging.example');
  ok2(mail[0].html.includes('Hi &lt;b&gt;Eve&lt;/b&gt; &amp; &quot;Co&quot;,')&&!mail[0].html.includes('<b>Eve</b>'),'the name is escaped in the HTML');
  /* a retry draws the HTML again from the stored text and the invitation's name */
  const failing=sharing(db,env2,{now,fetchImpl:async(url,args)=>url==='https://api.resend.com/emails'?Response.json({},{status:500}):fetch2(url,args)});
  const pending=await failing.invite(owner,{name:'Later',email:'later@example.com'},'https://staging.example');
  eq(pending.status,'failed','an email that fails is reported');mail.length=0;
  eq((await both.delivery(owner,pending.id)).status,'sent','and its retry is sent');
  ok2(mail[0].html?.includes('Hi Later,')&&mail[0].html.includes('https://crankmagic.com/api/auth/login?to=%23welcome'),'the retry is HTML too');
  await rejects(()=>both.admin(stranger,'https://staging.example'),403);
  const status=await both.admin(owner,'https://staging.example');
  eq([status.emailReady,status.accessReady,status.accessTargets,status.linkOrigin,status.aiEveryone],[true,true,2,'https://crankmagic.com',true],'Admin › General reports the setup');
  ok2(status.invitations.total>=4&&status.invitations.admitted>=4,'and counts the invitations');
  ok2(!JSON.stringify(status).includes('test-only')&&!JSON.stringify(status).includes('@'),'and carries no secret and no address');
  eq((await both.profile(owner)).isAdmin,true,'the administrator’s profile says so');eq((await both.profile(stranger)).isAdmin,false,'nobody else’s does');
}
// The shared service also rejects a service principal even when its database id equals the owner.
let rejectedAdminQueries=0;
const forbiddenDb={prepare(){rejectedAdminQueries++;throw new Error('A denied administrator must not reach storage.');}};
const adminGate=sharing(forbiddenDb,env,{fetchImpl:mailFetch,now,cacheProjections:false});
for(const person of [{...owner,email:'service:test'},{...owner,service:true}]){
  await rejects(()=>adminGate.admin(person,'https://example.com'),403);
  await rejects(()=>adminGate.invite(person,{name:'Friend',email:'friend@example.com'},'https://example.com'),403);
}
eq(rejectedAdminQueries,0,'service principals with the owner id perform no invitation-admin reads or invitation writes');
console.log(`sharing: ${checks} checks passed — live permissions, revocation, public access, concurrent edits, privacy, notification retry and owner-only invitations.`);
