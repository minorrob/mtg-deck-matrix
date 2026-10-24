#!/usr/bin/env node
/* THE STATUS-AXES PROPOSAL, PROVED ON DATA (October 18, 2026).

   Reads the committed backup (data/live-state.json) through the production model
   (collection-model.js) and prints, per deck, what the three screens show today and what
   the proposed three axes would show. Then builds Rob's worked example -- a hundred with
   90 of the list in the box, 10 substitutes holding 10 seats whose cards are to buy, and 4
   cards watched for the deck -- and prints both readings of it.

   Nothing here writes. `useOf` below is a prototype of the derivation the proposal asks to
   approve; it reads only fields the model already stores.

   Run: node docs/design/2026-10-18-status-axes/prove.mjs            (table)
        node docs/design/2026-10-18-status-axes/prove.mjs --json     (for the proposal page) */
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const require=createRequire(import.meta.url);
const M=require(path.join(root,'collection-model.js'));

/* ---------------- TODAY: the three readings the screens make ---------------- */

/* The Library, scoped to a deck: crankmagic-collection.js rows(), the deck branch. A deck's
   own rows, the substitutes standing in its box, and every Bench copy in the library. */
function libraryToday(s,deckId){
  const read=M.stateReader(s),rows=M.projection(s).filter(r=>r.deckId===deckId||r.standInDeckId===deckId||(r.kind==='lot'&&r.source==='owned'&&r.placement==='Bench'));
  const by={};let records=0,copies=0,reserveButtons=0;
  for(const r of rows){const label=M.stateLabel(read(r));by[label]=(by[label]||0)+r.quantity;records++;copies+=r.quantity;
    if(r.kind==='lot'&&r.source==='owned'&&!r.allocation&&r.location?.kind!=='deck')reserveButtons++;}
  return {records,copies,byLabel:by,reserveButtons};
}
/* The deck page's hundred: crankmagic-decks.js cardsTab() status(slot), its own derivation. */
function hundredToday(s,d){
  const rows=M.projection(s).filter(r=>r.deckId===d.id&&r.purpose==='main'),bySlot=new Map();
  for(const r of rows){const k=r.kind==='need'?r.slotId:r.allocation?.slotId;if(!k)continue;(bySlot.get(k)||bySlot.set(k,[]).get(k)).push(r);}
  const sum=(l,f)=>l.filter(f).reduce((n,r)=>n+r.quantity,0),by={};
  for(const slot of d.slots.filter(r=>r.purpose==='main')){const rs=bySlot.get(slot.id)||[];
    const label=sum(rs,r=>r.kind==='need')?'To buy':sum(rs,r=>r.kind==='lot'&&r.source==='ordered')?'Ordered':sum(rs,r=>r.kind==='lot'&&r.source==='owned'&&r.placement!=='Physical deck')?'To add':'Target';
    by[label]=(by[label]||0)+slot.quantity;}
  return by;
}

/* ---------------- PROPOSED: three axes, one function ---------------- */

/* useOf(record, ctx) -> {ownership, use, deckId, play, pairedWith, from}
   ownership  Watch | To buy | Ordered | Own | To sell | Trade        (the copy's lifecycle)
   use        Final | Substitute | Reserved | Bench | Sell | Trade | Unowned   (what it is for)
   play       In deck | Loading | To load | ''                          (system, never set by hand)
   A record is a copy (lot) or a deck's unmet seat (need). Every screen asks this, and nothing
   else spells a status. */
function context(s){
  const decks=new Map(s.decks.filter(d=>!d.archived).map(d=>[d.id,d])),groups=new Map();
  for(const d of decks.values())if(d.groupId)groups.set(d.groupId,d.id);
  return {decks,groups};
}
function useOf(r,ctx){
  const out=(ownership,use,deckId='',play='',extra={})=>({ownership,use,deckId,play,pairedWith:'',from:'',...extra});
  if(r.kind==='need')return out('To buy','Reserved',r.deckId,'To load',{pairedWith:r.heldBy||''});
  /* A deck's uncommitted option, or a planned entry filed in a deck's group: watched for that deck. */
  if(r.kind==='option')return out('Watch','Unowned',r.deckId);
  if(r.kind==='entry')return out(r.groupId===M.WANT_LIST?'To buy':'Watch','Unowned',ctx.groups.get(r.groupId)||'');
  if(r.kind!=='lot')return out('Watch','Unowned');
  const owned=r.source==='owned',loc=r.location||{},alloc=r.allocation||null;
  const ownership=r.source==='watching'?'Watch':r.source==='ordered'?'Ordered':r.offer==='available'?(r.offerKind==='sell'?'To sell':'Trade'):r.offer==='held'?'Trade':'Own';
  if(owned&&(ownership==='To sell'||ownership==='Trade'))return out(ownership,ownership==='To sell'?'Sell':'Trade');
  if(owned&&loc.kind==='deck'){
    /* In a box: its own list card there is Final; anything else there is a Substitute. A copy
       physically in one deck and claimed by another is that deck's Reserved card, from here. */
    if(alloc&&alloc.deckId===loc.deckId)return out('Own','Final',loc.deckId,'In deck');
    return out('Own','Substitute',loc.deckId,'In deck',{pairedWith:r.standInFor||'',claimedBy:alloc?.deckId||''});
  }
  if(alloc){
    /* Claimed by a deck and not in its box. Not owned: Reserved and To load. Owned, on the
       Bench: Loading -- it only has to be put in (today's "To add"). */
    if(!owned)return out(ownership,'Reserved',alloc.deckId,'To load');
    return out('Own','Final',alloc.deckId,'Loading');
  }
  /* For no deck. A watched copy filed in a deck's group is being considered for that deck. */
  const considering=(r.groupIds||[]).map(g=>ctx.groups.get(g)).find(Boolean)||'';
  if(!owned)return out(ownership,'Unowned',considering);
  return out('Own','Bench',considering);
}
/* The deck's view: every record filed with the deck, in four buckets, two totals and a Play status. */
function records(s){
  const rows=M.projection(s);
  for(const d of s.decks.filter(d=>!d.archived))for(const r of d.slots.filter(r=>!r.committed))rows.push({kind:'option',deckId:d.id,slotId:r.id,cardId:r.cardId,quantity:r.quantity});
  for(const g of s.groups)for(const e of g.entries)rows.push({kind:'entry',groupId:g.id,cardId:e.cardId,quantity:e.quantity});
  return rows;
}
function deckView(s,d,ctx){
  const rows=records(s),mine=[];
  for(const r of rows){const u=useOf(r,ctx);
    const claimedHere=u.claimedBy===d.id;   /* in another box, Reserved for this deck */
    if(u.deckId===d.id||claimedHere)mine.push({r,u:claimedHere?{...u,use:'Reserved',deckId:d.id,from:u.deckId,play:'To load'}:u});}
  const q=f=>mine.filter(f).reduce((n,x)=>n+x.r.quantity,0);
  const final=q(x=>x.u.use==='Final'),loading=q(x=>x.u.use==='Final'&&x.u.play==='Loading'),sub=q(x=>x.u.use==='Substitute');
  const toBuy=q(x=>x.u.use==='Reserved'&&x.u.ownership==='To buy'),ordered=q(x=>x.u.use==='Reserved'&&x.u.ownership==='Ordered'),fromDeck=q(x=>x.u.use==='Reserved'&&x.u.from);
  const watching=q(x=>x.u.ownership==='Watch'),benchFor=q(x=>x.u.use==='Bench');
  const listSize=d.slots.filter(r=>r.purpose==='main').reduce((n,r)=>n+r.quantity,0);
  const inBox=final-loading+sub;
  /* Playable: the box holds the hundred (Final + Substitute); swaps waiting are a note, not a
     state. Loading: the box is short and owned cards cover every empty seat -- they only have to
     be put in. To load: a seat waits on a card not in hand (to buy, ordered, another deck's). */
  const play=listSize&&inBox>=listSize?'Playable':listSize&&inBox+loading>=listSize?'Loading':'To load';
  return {deck:d.name,list:listSize,final,finalInBox:final-loading,loading,substitute:sub,reserved:{toBuy,ordered,fromAnotherDeck:fromDeck},watching:watching+benchFor,benchConsidered:benchFor,
    deckTotal:inBox,groupTotal:final+sub+toBuy+ordered+fromDeck+watching+benchFor,play};
}

/* ---------------- Rob's worked example ---------------- */
function example(){
  let s=M.empty();s.revision=1;
  const card=i=>({id:'card:x'+i,name:'Example card '+i,typeLine:'Creature — Spirit',manaCost:'{1}',manaValue:1,colorIdentity:[],oracleText:'',mechanics:[],keywords:[],shipped:false});
  for(let i=0;i<124;i++)s.cards['card:x'+i]={...card(i)};
  s.groups.push({id:'group:ex',name:'D1 Example',template:'commander',entries:[],createdAt:null});
  const slots=[];for(let i=0;i<100;i++)slots.push({id:'slot:'+i,cardId:'card:x'+i,quantity:1,purpose:'main',committed:true,printing:{},replaces:'',targetBracket:null,pinned:false,option:false,optionWhy:'',notes:''});
  s.decks.push({id:'deck:ex',name:'D1 Example',status:'final',archived:false,commanders:['card:x0'],slots,groupId:'group:ex',definition:M.defaultDefinition({}),versions:[],createdAt:'2026-10-18',priority:0});
  const lot=(i,extra)=>({id:'lot:'+i,cardId:'card:x'+i,quantity:1,source:'owned',printing:M.print({}),location:{kind:'bench',box:''},allocation:null,offer:'none',groupIds:[],notes:'',paid:null,acquiredAt:'2026-10-18',provenance:{type:'example'},...extra});
  /* 90 of the list in the box. */
  for(let i=0;i<90;i++)s.lots.push(lot(i,{location:{kind:'deck',deckId:'deck:ex',box:'D1'},allocation:{deckId:'deck:ex',slotId:'slot:'+i}}));
  /* 10 substitutes in the box, each holding one of the 10 seats whose card is not owned. */
  for(let i=0;i<10;i++)s.lots.push(lot(100+i,{location:{kind:'deck',deckId:'deck:ex',box:'D1'},standInFor:'slot:'+(90+i)}));
  /* 4 watched for the deck. 10 Bench copies elsewhere in the library, for no deck. */
  for(let i=0;i<4;i++)s.lots.push(lot(110+i,{source:'watching',location:null,groupIds:['group:ex']}));
  for(let i=0;i<10;i++)s.lots.push(lot(114+i,{}));
  return s;
}

/* ---------------- report ---------------- */
const backup=JSON.parse(readFileSync(path.join(root,'data/live-state.json'),'utf8'));
const live=M.migrate(backup.payload.state);
const report={source:'data/live-state.json ('+backup.note.split(' by ')[0]+')',decks:[],example:null};
for(const s of [live,example()]){
  const ctx=context(s),out=[];
  for(const d of s.decks.filter(d=>!d.archived)){
    out.push({deck:d.name,today:{library:libraryToday(s,d.id),hundred:hundredToday(s,d),playable:M.readiness(s,d).playable,sleeved:M.readiness(s,d).sleeved},proposed:deckView(s,d,ctx)});
  }
  if(s===live)report.decks=out;else report.example=out[0];
}
if(process.argv.includes('--json')){console.log(JSON.stringify(report,null,1));process.exit(0);}
const fmt=o=>Object.entries(o).map(([k,v])=>`${k} ${v}`).join(' · ');
for(const x of [...report.decks,{...report.example,deck:'EXAMPLE '+report.example.deck}]){
  const t=x.today,p=x.proposed;
  console.log(`\n${x.deck}`);
  console.log(`  TODAY   Library "Deck:" filter  ${t.library.records} records, ${t.library.copies} copies; ${fmt(t.library.byLabel)}; Reserve… buttons ${t.library.reserveButtons}`);
  console.log(`          The hundred             ${fmt(t.hundred)}`);
  console.log(`          Deck tile               ${t.playable?'playable':'not playable'} (${t.sleeved} in the box)`);
  console.log(`  PROPOSED Final ${p.finalInBox}${p.loading?` (+${p.loading} loading)`:''} · Substitute ${p.substitute} · Reserved: to buy ${p.reserved.toBuy}, ordered ${p.reserved.ordered}, from another deck ${p.reserved.fromAnotherDeck} · Watching ${p.watching}${p.benchConsidered?` (${p.benchConsidered} owned, on the Bench)`:''}`);
  console.log(`          Deck total ${p.deckTotal} / ${p.list} · Group total ${p.groupTotal} · Play: ${p.play}`);
}
