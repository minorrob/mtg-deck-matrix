/* A planned hundred is a demand, never proof of a hundred owned cards.
 *
 * The old catalog projection inferred In Hand from deck quantities. This model
 * keeps deck slots separate from physical/pending lots. A lot has one allocation
 * and one physical location; partial operations split it first. A reassignment
 * changes its allocation, never its last confirmed box. Every operation is pure
 * and validated before the IndexedDB repository is allowed to commit it.
 *
 * No simulator, network, storage or DOM. Both browsers and Node use these rules.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CrankCollection=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  /* 'wanted' is a card you mean to buy with no order placed and no vendor chosen -- the note
     you make at a convention table. 'watching' is the rung below it: a card you are keeping
     an eye on, an upgrade you might get to, with no intent to buy declared yet. Both are a
     plan, not a copy: never physical, never eligible for a build, never reserved to a slot;
     each becomes ordered or owned by the same 'source' correction the other kinds use, and
     a reserved copy corrected down to either gives its deck the requirement back. */
  const VERSION=1, SOURCES=['owned','ordered','incoming','wanted','watching'], PLANNED=['wanted','watching'], PURPOSES=['main','upgrade','bracket'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const text=(value,max=500)=>String(value??'').trim().slice(0,max);
  const quantity=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw Error('Quantity must be a whole number between 1 and 1,000,000.');return n;};
  const ensure=(condition,message)=>{if(!condition)throw Error(message);};
  const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,2047}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
  /* THE FOUR PILES EVERY COLLECTION ALREADY HAS. A new library opened on an empty Groups
     tab asks the reader to invent a filing system before they own a card, and the answer
     is the same four every time: what is in the deck, what is on the bench, what is going
     out, what is coming in. They start empty and delete like any other group -- these are
     a starting point, not a schema. The preference flag is what makes deleting them stick:
     a library that has already been offered them is never offered them again. */
  const STARTER_GROUPS=[['group:main-deck','Main Deck'],['group:bench','Bench'],
    ['group:to-trade','To Trade'],['group:to-buy','To Buy']];
  const starterGroups=()=>STARTER_GROUPS.map(([id,name])=>({id,name,entries:[],createdAt:null}));
  function empty(){return {schemaVersion:VERSION,revision:0,cards:{},decks:[],lots:[],groups:starterGroups(),reports:[],games:[],advice:[],imports:[],preferences:{starterGroups:true},legacy:null,createdAt:null,updatedAt:null};}
  const deck=(s,id)=>{const d=s.decks.find(d=>d.id===id);ensure(d,'Deck not found. Reload and try again.');return d;};
  const slot=(s,did,sid)=>{const d=deck(s,did),r=d.slots.find(r=>r.id===sid);ensure(r,'That deck slot no longer exists.');return r;};
  const lot=(s,id)=>{const r=s.lots.find(r=>r.id===id);ensure(r,'That card record no longer exists.');return r;};
  const group=(s,id)=>{const g=s.groups.find(g=>g.id===id);ensure(g,'Collection group not found.');return g;};
  const card=(s,id)=>{const c=Object.hasOwn(s.cards,id)?s.cards[id]:null;ensure(c,'Resolve the card identity first.');return c;};
  function print(raw={}){return {id:text(raw.id,100),set:text(raw.set,30).toLowerCase(),collector:text(raw.collector,40),finish:text(raw.finish,30),language:text(raw.language,30),condition:text(raw.condition,50),signed:!!raw.signed,altered:!!raw.altered};}
  function compatible(l,r){return l.cardId===r.cardId&&Object.entries(r.printing||{}).every(([k,v])=>!v||l.printing?.[k]===v);}
  function countFor(s,did,sid){return s.lots.filter(l=>l.allocation?.deckId===did&&l.allocation.slotId===sid).reduce((n,l)=>n+l.quantity,0);}
  const shortfall=(s,d,r)=>Math.max(0,r.quantity-countFor(s,d.id,r.id));
  function physical(l){return l.source==='owned'?(l.location?.kind==='deck'?'In deck box':'Bench'):PLANNED.includes(l.source)?'Not acquired':'Not received';}
  function inDeck(s,l){return l.source==='owned'&&l.allocation&&l.location?.kind==='deck'&&l.location.deckId===l.allocation.deckId&&!deck(s,l.allocation.deckId).archived;}
  function counters(s){const result={owned:0,ordered:0,incoming:0,wanted:0,watching:0,toBuy:0,inDeck:0,sellTrade:0};for(const l of s.lots){result[l.source]+=l.quantity;if(inDeck(s,l))result.inDeck+=l.quantity;if(l.source==='owned'&&l.offer!=='none')result.sellTrade+=l.quantity;}for(const d of s.decks.filter(d=>d.status==='final'&&!d.archived))for(const r of d.slots.filter(r=>r.committed))result.toBuy+=shortfall(s,d,r);return result;}
  /* READY MEANS YOU COULD PLAY IT TONIGHT. It used to mean every copy had been confirmed
     into its physical box one card at a time, so a deck you had finished buying still read
     "In progress" and "0 in deck" -- the number under the deck had stopped describing the
     deck. Owning the hundred and reserving it here is what makes a deck playable. Which box
     the cards are actually sitting in is a separate fact, and `placed` still carries it. */
  /* THE SAME HUNDRED, CUT THE WAY A BUILD NIGHT CUTS IT. `owned` says what you have; it
     does not say where. 72 owned and 55 in the box is 17 cards to go and find, and that
     figure was never computed anywhere -- so the deck page could not say "17 to pull" and
     the pull sheet had nothing to list. The segments below add it without moving a single
     existing key: inBox is `placed` under the name the UI uses; pullFromBench and
     pullFromOtherBox are owned, reserved copies sitting somewhere else; remove is a copy in
     this deck's box that the list no longer asks for. The three money figures follow the
     same rule as everything else here: a price is the catalog's, `paid` is per copy, and a
     copy with no price contributes nothing rather than a guess. */
  function readiness(s,d){const rows=d.slots.filter(r=>r.purpose==='main'),target=rows.reduce((n,r)=>n+r.quantity,0);let owned=0,ordered=0,incoming=0,placed=0,pullFromBench=0,pullFromOtherBox=0,paid=0,marketValue=0;
    for(const l of s.lots.filter(l=>l.allocation?.deckId===d.id&&rows.some(r=>r.id===l.allocation.slotId))){if(l.source==='owned')owned+=l.quantity;if(l.source==='ordered')ordered+=l.quantity;if(l.source==='incoming')incoming+=l.quantity;
      if(inDeck(s,l))placed+=l.quantity;else if(l.source==='owned'){if(l.location?.kind==='deck')pullFromOtherBox+=l.quantity;else pullFromBench+=l.quantity;}
      if(Number.isFinite(l.paid))paid+=l.paid*l.quantity;if(l.source==='owned'){const c=s.cards[l.cardId];if(c&&Number.isFinite(c.price))marketValue+=c.price*l.quantity;}}
    const remove=s.lots.filter(l=>l.source==='owned'&&l.location?.kind==='deck'&&l.location.deckId===d.id&&l.allocation?.deckId!==d.id).reduce((n,l)=>n+l.quantity,0);
    let costToFinish=0;if(d.status==='final'&&!d.archived)for(const r of rows){const need=shortfall(s,d,r),c=s.cards[r.cardId];if(need&&c&&Number.isFinite(c.price))costToFinish+=c.price*need;}
    return {target,owned,ordered,incoming,placed,toBuy:Math.max(0,target-owned-ordered-incoming),ready:d.status==='final'&&!d.archived&&target===100&&owned===target,boxed:target>0&&placed===target,
      inBox:placed,pullFromBench,pullFromOtherBox,remove,costToFinish:Math.round(costToFinish*100)/100,paid:Math.round(paid*100)/100,marketValue:Math.round(marketValue*100)/100};}
  /* A DECK'S GROUP IS A NAME FOR THE DECK, NOT A SECOND COPY OF IT. Filing every card of a
     hundred-card deck into its group would store the same hundred cards twice and leave two
     lists to keep in step -- which is how a deck ends up disagreeing with itself. So a row
     that belongs to a deck simply reports that deck's group as one of its groups. Filter the
     Collection to "Krenko goes wide" and you get the deck: its reserved copies, its ordered
     ones and its outstanding To buy requirements, always current, stored once. */
  const withDeckGroup=(s,row)=>{const d=row.deckId?s.decks.find(x=>x.id===row.deckId):null;
    return d&&d.groupId&&!row.groupIds.includes(d.groupId)?{...row,groupIds:[...row.groupIds,d.groupId]}:row;};
  function projection(s){const rows=s.lots.map(l=>withDeckGroup(s,{...clone(l),recordId:l.id,kind:'lot',card:card(s,l.cardId),deckId:l.allocation?.deckId||'',purpose:l.allocation?slot(s,l.allocation.deckId,l.allocation.slotId).purpose:'',placement:inDeck(s,l)?'In deck box':l.allocation?'Reserved':l.source==='owned'?'Bench':'Unassigned',physical:physical(l)}));for(const d of s.decks.filter(d=>d.status==='final'&&!d.archived))for(const r of d.slots.filter(r=>r.committed)){const need=shortfall(s,d,r);if(need)rows.push(withDeckGroup(s,{recordId:`need:${d.id}:${r.id}`,kind:'need',deckId:d.id,slotId:r.id,cardId:r.cardId,card:card(s,r.cardId),source:'to-buy',quantity:need,purpose:r.purpose,printing:clone(r.printing||{}),placement:'Reserved',physical:'Not acquired',offer:'none',groupIds:[]}));}return rows;}
  function eligibility(s,l,options={}){if(l.source==='watching')return {eligible:false,reason:'Watching, not acquired'};if(l.source==='wanted')return {eligible:false,reason:'Not acquired'};if(l.offer==='held')return {eligible:false,reason:'Held for a pending deal'};if(l.source==='ordered'&&!options.includeOrdered)return {eligible:false,reason:'Not received'};if(l.source==='incoming'&&!options.includeIncoming)return {eligible:false,reason:'Incoming trade'};if(l.offer==='available'&&options.includeSellTrade===false)return {eligible:false,reason:'Sell / Trade excluded'};const donor=l.allocation?deck(s,l.allocation.deckId):null;if(donor?.locked&&!options.donorDecks?.includes(donor.id))return {eligible:false,reason:'Locked deck'};if(l.location?.kind==='deck'&&!options.includeInDeck)return {eligible:false,reason:'In another deck box'};if(l.allocation&&!options.includeReserved)return {eligible:false,reason:'Reserved for another deck'};return {eligible:true,reason:'Available in this build pool'};}
  function validate(s){
    ensure(s&&s.schemaVersion===VERSION,'Unsupported collection schema.');ensure(Number.isSafeInteger(s.revision)&&s.revision>=0,'Invalid collection revision.');
    for(const k of ['decks','lots','groups','reports','games','advice','imports'])ensure(Array.isArray(s[k]),`Missing ${k} records.`);
    ensure(s.cards&&typeof s.cards==='object'&&!Array.isArray(s.cards),'Missing card identities.');
    ensure(s.preferences&&typeof s.preferences==='object'&&!Array.isArray(s.preferences),'Invalid preferences.');for(const k of ['columns','shopColumns','comparisonPicks','dismissedSuggestions','dismissedTips'])if(s.preferences[k]!==undefined)ensure(Array.isArray(s.preferences[k])&&s.preferences[k].every(x=>typeof x==='string'),'Invalid saved view preference.');const all=new Set();const id=(r,label)=>{ensure(r&&safeId(r.id),`Invalid ${label} ID.`);ensure(!all.has(r.id),`Duplicate record ID: ${r.id}`);all.add(r.id);};
    for(const [key,c] of Object.entries(s.cards)){ensure(safeId(key)&&c.id===key,'Invalid card identity.');ensure(typeof c.name==='string'&&c.name.trim()&&c.name.length<=250,'Invalid card name.');}
    for(const d of s.decks){id(d,'deck');ensure(['draft','final'].includes(d.status),'Invalid deck state.');ensure(Array.isArray(d.slots)&&Array.isArray(d.commanders)&&Array.isArray(d.versions),'Invalid deck structure.');ensure(typeof d.name==='string'&&d.name.trim()&&d.name.length<=160,'A deck needs a valid name.');defaultDefinition(d.definition);ensure(typeof d.archived==='boolean'&&typeof d.locked==='boolean','Invalid deck flags.');if(d.groupId)group(s,d.groupId);for(const r of d.slots){id(r,'slot');ensure(typeof r.quantity==='number','Stored quantities must be numbers.');quantity(r.quantity);card(s,r.cardId);ensure(PURPOSES.includes(r.purpose),'Invalid card purpose.');ensure(typeof r.committed==='boolean'&&(r.purpose!=='main'||r.committed),'Invalid slot commitment.');if(r.purpose!=='main'){ensure(d.slots.some(x=>x.id===r.replaces&&x.purpose==='main'),'An option must reference a main-deck slot.');if(r.purpose==='bracket')ensure(Number.isInteger(r.targetBracket)&&r.targetBracket>d.definition.baseBracket&&r.targetBracket<=d.definition.bracketCeiling,'Bracket option is outside the deck definition.');}}for(const cid of d.commanders)card(s,cid);}
    for(const l of s.lots){id(l,'lot');card(s,l.cardId);ensure(typeof l.quantity==='number','Stored quantities must be numbers.');quantity(l.quantity);ensure(l.printing&&typeof l.printing==='object'&&!Array.isArray(l.printing),'Invalid printing record.');ensure(l.paid===null||Number.isFinite(l.paid)&&l.paid>=0,'Invalid purchase cost.');ensure(l.paidSource===undefined||['catalog','receipt','typed'].includes(l.paidSource),'Invalid paid source.');if(l.order!==undefined){ensure(l.order&&typeof l.order==='object'&&safeId(l.order.id)&&typeof l.order.vendor==='string'&&typeof l.order.ref==='string','Invalid order record.');ensure(l.order.shipShare===undefined||Number.isFinite(l.order.shipShare)&&l.order.shipShare>=0,'Invalid shipping share.');}if(l.source==='owned')ensure(l.location&&['bench','deck'].includes(l.location.kind),'Invalid owned-card location.');ensure(SOURCES.includes(l.source),'Invalid acquisition source.');ensure(['none','available','held'].includes(l.offer),'Invalid Sell / Trade state.');ensure(Array.isArray(l.groupIds)&&new Set(l.groupIds).size===l.groupIds.length,'Invalid group membership.');for(const gid of l.groupIds)group(s,gid);if(l.source!=='owned')ensure(!l.location&&l.offer==='none','Unreceived cards cannot have physical placement or an outgoing offer.');if(l.location?.kind==='deck')deck(s,l.location.deckId);if(l.allocation){const d=deck(s,l.allocation.deckId),r=slot(s,d.id,l.allocation.slotId);ensure(!d.archived&&d.status==='final','Only finalized, unarchived decks can reserve cards.');ensure(r.committed,'This optional card is a suggestion, not a commitment.');ensure(compatible(l,r),'The allocated printing does not match the deck requirement.');ensure(l.offer!=='held','A deal-held copy cannot also be allocated to a deck.');}}
    for(const d of s.decks)for(const r of d.slots)ensure(countFor(s,d.id,r.id)<=r.quantity,'A deck slot is over-allocated.');
    for(const g of s.groups){id(g,'group');ensure(typeof g.name==='string'&&g.name.trim()&&Array.isArray(g.entries),'Invalid collection group.');for(const r of g.entries){id(r,'group entry');card(s,r.cardId);ensure(typeof r.quantity==='number','Stored quantities must be numbers.');quantity(r.quantity);}}
    for(const r of [...s.reports,...s.games,...s.advice])id(r,'evidence');ensure(s.lots.length<=50000,'This library exceeds the supported record limit.');return s;
  }
  function defaultDefinition(raw={}){const d={baseBracket:2,bracketCeiling:3,budget:null,perCardCap:null,mechanics:[],playStyle:'Balanced',speed:3,competitiveness:3,saltiness:3,restrictions:'',reuse:{includeSellTrade:true},...clone(raw)};ensure(Number.isInteger(d.baseBracket)&&d.baseBracket>=1&&d.baseBracket<=5,'Choose a bracket from 1 to 5.');ensure(Number.isInteger(d.bracketCeiling)&&d.bracketCeiling>=d.baseBracket&&d.bracketCeiling<=5,'The bracket ceiling must include the base bracket.');for(const k of ['speed','competitiveness','saltiness'])ensure(Number.isInteger(d[k])&&d[k]>=1&&d[k]<=5,`Choose ${k} from 1 to 5.`);for(const k of ['budget','perCardCap'])ensure(d[k]===null||(Number.isFinite(d[k])&&d[k]>=0),`Invalid ${k}.`);ensure(Array.isArray(d.mechanics)&&d.mechanics.every(x=>typeof x==='string'),'Invalid mechanics.');ensure(d.reuse&&typeof d.reuse==='object'&&!Array.isArray(d.reuse),'Invalid reuse preferences.');return d;}
  function legality(s,d){
    const issues=[],main=d.slots.filter(r=>r.purpose==='main'),total=main.reduce((n,r)=>n+r.quantity,0);if(total!==100)issues.push(`The main list contains ${total} cards; Commander requires 100 including the commander configuration.`);
    if(d.commanders.length<1||d.commanders.length>2)issues.push('Select one legal commander or a legal two-commander configuration.');
    if(new Set(d.commanders).size!==d.commanders.length)issues.push('Commander identities must be distinct.');const leaders=d.commanders.map(cid=>card(s,cid)),colors=new Set(leaders.flatMap(c=>c.colorIdentity||[]));
    for(const c of leaders){if(!c.commander||!c.verified)issues.push(`${c.name}: commander eligibility is unverified.`);if(!main.some(r=>r.cardId===c.id&&r.quantity===1))issues.push(`${c.name} must appear once in the main list.`);}
    if(leaders.length===2){const [a,b]=leaders,oa=a.oracleText||'',ob=b.oracleText||'';const generic=[a,b].every(c=>(c.keywords||[]).includes('Partner'));const friends=[a,b].every(c=>(c.keywords||[]).includes('Friends forever'));const background=(/Choose a Background/i.test(oa)&&/Legendary Enchantment.*Background/i.test(b.typeLine||''))||(/Choose a Background/i.test(ob)&&/Legendary Enchantment.*Background/i.test(a.typeLine||''));const doctors=(/Doctor's companion/i.test(oa)&&/Time Lord Doctor/i.test(b.typeLine||''))||(/Doctor's companion/i.test(ob)&&/Time Lord Doctor/i.test(a.typeLine||''));const named=oa.toLowerCase().includes('partner with '+b.name.toLowerCase())&&ob.toLowerCase().includes('partner with '+a.name.toLowerCase());if(!(generic||friends||background||doctors||named))issues.push('This two-commander pairing has not been verified as legal.');}
    const counts=new Map();for(const r of main){const c=card(s,r.cardId);counts.set(c.id,(counts.get(c.id)||0)+r.quantity);if(!c.verified||c.legalities?.commander!=='legal')issues.push(`${c.name}: Commander legality must be verified.`);if((c.colorIdentity||[]).some(x=>!colors.has(x)))issues.push(`${c.name} is outside the commander color identity.`);}
    for(const [cid,n] of counts){const c=card(s,cid),o=c.oracleText||'';let allowed=/\bBasic\b/.test(c.typeLine||'')||/any number of cards named/i.test(o)?Infinity:1;const words={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9};const m=o.match(/up to (two|three|four|five|six|seven|eight|nine|\d+) cards named/i);if(m)allowed=words[m[1].toLowerCase()]||Number(m[1]);if(n>allowed)issues.push(`${c.name} exceeds its allowed number of copies.`);}
    return [...new Set(issues)];
  }
  function definitionIssues(s,d){
    const issues=[],def=d.definition,rows=d.slots.filter(r=>r.purpose==='main');
    if(def.budget===null&&def.perCardCap===null)return issues;
    let total=0,unknown=0;
    for(const r of rows){const c=card(s,r.cardId);if(!Number.isFinite(c.price)||c.price<0){unknown+=r.quantity;continue;}total+=c.price*r.quantity;if(def.perCardCap!==null&&c.price>def.perCardCap)issues.push(`${c.name} exceeds the per-card price cap.`);}
    if(unknown)issues.push(`${unknown} copies have no price estimate. Verify prices or explicitly remove the cap in Deck Definition.`);
    if(def.budget!==null&&total>def.budget)issues.push(`Indicative list total $${total.toFixed(2)} exceeds the $${def.budget.toFixed(2)} cap. Edit Deck Definition to change your limit.`);
    return issues;
  }
  function acceptance(s,d){return [...legality(s,d),...definitionIssues(s,d)];}
  function apply(current,command){
    validate(current);ensure(command&&safeId(command.id),'Every change needs a unique operation ID.');const s=clone(current),c=clone(command),now=c.at||new Date().toISOString();let serial=0,summary='';const id=prefix=>`${prefix}:${c.id}:${++serial}`;
    function addCard(raw){ensure(raw&&safeId(raw.id),'Invalid card identity.');s.cards[raw.id]={...s.cards[raw.id],...clone(raw),name:text(raw.name,250)};return card(s,raw.id);}
    function split(l,n){n=quantity(n??l.quantity);ensure(n<=l.quantity,'That quantity exceeds the available copies.');if(n===l.quantity)return l;const part={...clone(l),id:id('lot'),quantity:n};l.quantity-=n;s.lots.push(part);return part;}
    function warning(l){if(l.allocation||l.location?.kind==='deck'||l.offer==='held')ensure(c.confirmed===true,'Review and confirm the affected deck, physical location or pending deal before changing this copy.');}
    function version(d){d.versions.push({id:id('version'),at:now,slots:clone(d.slots),commanders:[...d.commanders],definition:clone(d.definition)});d.version=(d.version||0)+1;}
    /* THE SAME COPY, NOT A SECOND ROW.
     Recording another Sol Ring you already own made a second lot, and the table drew two
     rows that were identical down to the punctuation -- which reads as a bug even though
     the model was faithful. A lot is a *purchase*, but a reader looking at the roster is
     counting *copies*, so two records that differ in nothing become one record of two.
     Everything that could make them genuinely different keeps them apart: a different
     print, a different source, a different box, a different price, a group, a deck slot,
     a pending deal. An allocated copy is spoken for, so it is never a merge target. */
  function sameCopy(raw,groupId){
    if(!raw||!raw.cardId)return null;
    const want=print(raw.printing), source=raw.source||'owned';
    const location=source!=='owned'?null:clone(raw.location||{kind:'bench',box:''});
    const paid=raw.paid??null, notes=text(raw.notes,5000);
    const groups=groupId?[group(s,groupId).id]:[];
    const alike=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
    return s.lots.find(l=>l.cardId===raw.cardId&&l.source===source&&!l.allocation&&l.offer==='none'
      &&alike(l.printing,want)&&alike(l.location,location)
      &&(l.paid??null)===paid&&l.notes===notes&&alike([...l.groupIds].sort(),[...groups].sort()))||null;
  }

  function newLot(raw){card(s,raw.cardId);const l={id:raw.id||id('lot'),cardId:raw.cardId,quantity:quantity(raw.quantity),source:raw.source||'owned',printing:print(raw.printing),location:raw.source&&raw.source!=='owned'?null:clone(raw.location||{kind:'bench',box:''}),allocation:null,offer:'none',groupIds:[],notes:text(raw.notes,5000),paid:raw.paid??null,acquiredAt:now,provenance:clone(raw.provenance||{type:c.type,operation:c.id})};if(Number.isFinite(l.paid))stampPaid(l,l.paid,raw.paidSource);s.lots.push(l);return l;}
    /* WHAT WAS PAID, AND HOW WE KNOW. `paid` is per copy. paidSource says whether the figure is
       the catalog's sheet price stamped by a one-tap Bought, a receipt, or something typed;
       paidAt is when it was recorded, which is what the season's pool counts against. */
    function orderRecord(raw={}){return {id:raw.id,vendor:text(raw.vendor,100),ref:text(raw.ref,100),expectedBy:text(raw.expectedBy,40),placedAt:raw.placedAt||now,...(raw.shipShare!==undefined?{shipShare:raw.shipShare}:{})};}
    function stampPaid(l,amount,how){ensure(amount===null||Number.isFinite(amount)&&amount>=0,'Purchase cost must be a nonnegative number or unknown.');l.paid=amount;if(amount===null){delete l.paidSource;delete l.paidAt;return;}l.paidSource=['catalog','receipt','typed'].includes(how)?how:'typed';l.paidAt=now;}
    function allocate(l,d,r,n){ensure(!PLANNED.includes(l.source),'A wanted or watched card is a plan to buy, not a copy. Mark it Ordered or Owned before reserving it.');ensure(!d.archived&&d.status==='final','Finalize this deck before reserving copies.');ensure(compatible(l,r),'That printing does not match this requirement.');ensure(l.offer!=='held','Release the pending deal before assigning this copy.');const amount=quantity(n??Math.min(l.quantity,shortfall(s,d,r)));ensure(amount<=shortfall(s,d,r),'That slot is already fulfilled.');const part=split(l,amount);part.allocation={deckId:d.id,slotId:r.id};return part;}
    /* A DECK CAN BE ATTACHED TO A COLLECTION GROUP, and this is what the attachment does:
       when two copies could fill the same requirement, the one already filed under the
       deck's group is reserved first. Owned still beats unreceived -- the group only breaks
       a tie, so attaching a group can never reserve a copy that was not eligible anyway. */
    const filedFor=(l,d)=>d.groupId&&l.groupIds.includes(d.groupId)?0:1;
    function satisfy(d,only){for(const r of d.slots.filter(r=>r.committed&&(!only||r.id===only))){for(const l of [...s.lots].sort((a,b)=>(a.source==='owned'?0:1)-(b.source==='owned'?0:1)||filedFor(a,d)-filedFor(b,d))){if(!shortfall(s,d,r))break;if(PLANNED.includes(l.source)||l.allocation||l.offer==='held'||l.location?.kind==='deck'||l.offer==='available'&&d.definition.reuse?.includeSellTrade===false||!compatible(l,r)||l.keepBench)continue;allocate(l,d,r,Math.min(l.quantity,shortfall(s,d,r)));}}}
    function release(l,destination){l.allocation=null;if(destination==='bench'){l.keepBench=true;return;}if(l.source!=='owned'||l.offer==='held')return;for(const d of s.decks.filter(d=>d.status==='final'&&!d.archived&&(!destination||d.id===destination)).sort((a,b)=>(a.priority||0)-(b.priority||0)||a.createdAt.localeCompare(b.createdAt))){for(const r of d.slots.filter(r=>r.committed)){const need=shortfall(s,d,r);if(!need||!compatible(l,r)||l.offer==='available'&&d.definition.reuse?.includeSellTrade===false)continue;const n=Math.min(l.quantity,need),part=allocate(l,d,r,n);if(part===l)return;}}}
    function rows(raw){return raw.map(r=>({id:r.id||id('slot'),cardId:r.cardId,quantity:quantity(r.quantity),purpose:r.purpose||'main',committed:(!r.purpose||r.purpose==='main')?true:!!r.committed,printing:clone(r.printing||{}),replaces:r.replaces||'',targetBracket:r.targetBracket??null,pinned:!!r.pinned,notes:text(r.notes,3000)}));}
    switch(c.type){
      case 'batch':{ensure(Array.isArray(c.commands)&&c.commands.length<=100,'Invalid compound operation.');let next=s;for(const [i,part] of c.commands.entries()){ensure(part.type!=='batch','Nested compound operations are not supported.');next=apply(next,{...part,id:c.id+':'+i,at:now}).state;}Object.assign(s,next);summary=text(c.summary,500)||'Saved compound change';break;}
      case 'acceptOption':{const d=deck(s,c.deckId),option=slot(s,d.id,c.slotId);ensure(option.purpose!=='main','Choose a linked option.');const parent=slot(s,d.id,option.replaces);ensure(parent.quantity===option.quantity,'The option quantity must match the replaced main slot.');version(d);const old=s.lots.filter(l=>l.allocation?.deckId===d.id&&l.allocation.slotId===parent.id),reserved=s.lots.filter(l=>l.allocation?.deckId===d.id&&l.allocation.slotId===option.id);for(const l of [...old,...reserved])l.allocation=null;const previous=parent.cardId;parent.cardId=option.cardId;parent.printing=clone(option.printing);d.slots=d.slots.filter(r=>r.id!==option.id);if(d.commanders.includes(previous))d.commanders=d.commanders.map(id=>id===previous?parent.cardId:id);ensure(!d.archived,'Restore the deck first.');const issues=d.status==='final'?acceptance(s,d):[];ensure(!issues.length,issues.join('\n'));for(const l of old)release(l,c.destination);if(d.status==='final'){for(const l of reserved)allocate(l,d,parent,l.quantity);satisfy(d,parent.id);}summary='Accepted the linked option and preserved its reserved copies';break;}
      case 'verifyIdentity':{const old=card(s,c.cardId);ensure(c.confirmed===true,'Review the exact identity correction first.');ensure(c.card&&c.card.verified&&c.card.legalities?.commander==='legal','Choose a verified Commander-legal catalog identity.');const next=addCard(c.card);for(const d of s.decks){if(!d.slots.some(r=>r.cardId===old.id)&&!d.commanders.includes(old.id))continue;version(d);for(const r of d.slots)if(r.cardId===old.id)r.cardId=next.id;d.commanders=d.commanders.map(id=>id===old.id?next.id:id);if(d.status==='final'){const issues=acceptance(s,d);ensure(!issues.length,issues.join('\n'));}}for(const l of s.lots)if(l.cardId===old.id)l.cardId=next.id;for(const g of s.groups)for(const r of g.entries)if(r.cardId===old.id)r.cardId=next.id;summary=`Verified ${old.name} as ${next.name}; quantities and exact printings preserved`;break;}
      case 'pin':{const d=deck(s,c.deckId),r=slot(s,d.id,c.slotId);ensure(!d.archived,'Restore the deck first.');r.pinned=!!c.pinned;summary=`${r.pinned?'Pinned':'Unpinned'} ${card(s,r.cardId).name} in ${d.name}`;break;}
      case 'cards': for(const raw of c.cards||[])addCard(raw);summary='Saved verified card data and supplemental identities';break;
      /* EVERY DECK HAS A COLLECTION GROUP, AND IT IS MADE WITH THE DECK. A deck without one
         was a deck whose cards had no home in the Collection: you could filter to the deck,
         but the group -- the thing you file copies into and hand to someone -- had to be
         created and attached by hand, and most never were. Passing groupId names an existing
         group instead (the uploaded-a-list road); passing it as null opts out deliberately. */
      case 'createDeck':{for(const raw of c.cards||[])addCard(raw);
        const deckName=text(c.name,160)||'Untitled deck';
        const own=c.groupId===undefined?{id:id('group'),name:deckName,entries:[],createdAt:now}:null;
        if(own)s.groups.push(own);
        const d={id:c.deckId||id('deck'),name:deckName,commanders:[...(c.commanders||[])],slots:rows(c.slots||[]),definition:defaultDefinition(c.definition),status:'draft',archived:false,locked:false,version:1,versions:[],createdAt:now,notes:text(c.notes,5000),priority:s.decks.length,groupId:own?own.id:(c.groupId?group(s,c.groupId).id:null)};
        s.decks.push(d);summary=`Created planned deck: ${d.name}`+(own?` and its collection group`:'');break;}
      case 'editDeck':{const d=deck(s,c.deckId);ensure(!d.archived,'Restore the archived deck first.');if(c.name!==undefined){const was=d.name;d.name=text(c.name,160);const g=d.groupId?s.groups.find(x=>x.id===d.groupId):null;if(g&&g.name===was)g.name=d.name;}if(c.definition)d.definition=defaultDefinition(c.definition);if(c.notes!==undefined)d.notes=text(c.notes,5000);if(c.groupId!==undefined)d.groupId=c.groupId?group(s,c.groupId).id:null;if(c.commanders){ensure(d.status==='draft','Use a reviewed commander replacement for a finalized list.');d.commanders=[...c.commanders];}if(c.slots){ensure(d.status==='draft','Use a reviewed replacement for a finalized list.');d.slots=rows(c.slots);}summary=`Updated ${d.name}`;break;}
      case 'finalize':{const d=deck(s,c.deckId);ensure(!d.archived,'Restore the deck first.');ensure(d.status==='draft','This deck is already finalized.');const issues=acceptance(s,d);ensure(!issues.length,issues.join('\n'));d.status='final';version(d);satisfy(d);summary=`Finalized ${d.name}; reserved available copies without creating ownership`;break;}
      case 'lock':{const d=deck(s,c.deckId);d.locked=!!c.locked;summary=`${d.locked?'Locked':'Unlocked'} ${d.name}`;break;}
      case 'archive':{const d=deck(s,c.deckId);ensure(!d.archived,'Deck already archived.');d.archived=true;version(d);for(const l of [...s.lots].filter(l=>l.allocation?.deckId===d.id))release(l,c.destination);summary=`Archived ${d.name}; released allocations and retained actual box locations`;break;}
      case 'restoreDeck':{const d=deck(s,c.deckId);d.archived=false;d.status='draft';d.locked=false;summary=`Restored ${d.name} as a draft for availability review`;break;}
      /* PERMANENT DELETION, and only of an archived deck. Archiving is the reversible step
         and it already released every allocation, so by the time a deck can be deleted no
         lot is reserved for it. What can still point at it: a lot's PHYSICAL location (the
         copies are in that deck box on the shelf), which goes back to the bench because the
         box no longer exists as a plan; the deck's reports, advice and games, which describe
         an exact list that is being erased; and two preferences. All of it goes, because
         "permanently" is the word the button uses. */
      case 'deleteDeck':{const d=deck(s,c.deckId);ensure(d.archived,'Archive the deck first; only an archived deck can be deleted permanently.');ensure(c.confirmed===true,'Confirm permanent deletion.');
        for(const l of s.lots){if(l.allocation?.deckId===d.id)l.allocation=null;if(l.location?.kind==='deck'&&l.location.deckId===d.id)l.location={kind:'bench',box:''};}
        s.decks=s.decks.filter(x=>x.id!==d.id);
        /* The group made with the deck goes with the deck -- but only if nothing else is
           using it: no other deck attached, no planned entries, no copies filed by hand. */
        if(d.groupId&&!s.decks.some(x=>x.groupId===d.groupId)){const g=s.groups.find(x=>x.id===d.groupId);
          if(g&&!g.entries.length&&!s.lots.some(l=>l.groupIds.includes(g.id))){s.groups=s.groups.filter(x=>x.id!==g.id);}}
        for(const k of ['reports','advice','games'])s[k]=s[k].filter(r=>r.deckId!==d.id);
        if(Array.isArray(s.preferences.comparisonPicks))s.preferences.comparisonPicks=s.preferences.comparisonPicks.filter(x=>x!==d.id);
        if(s.preferences.lastLabRun?.deckId===d.id)delete s.preferences.lastLabRun;
        summary=`Deleted ${d.name} permanently, with its reports, advice and game log`;break;}
      case 'acquire':{for(const raw of c.cards||[])addCard(raw);const same=c.deckId?null:sameCopy(c.lot,c.groupId);if(same){same.quantity=quantity(same.quantity+quantity(c.lot.quantity));summary=`Recorded ${quantity(c.lot.quantity)} more ${same.source} ${card(s,same.cardId).name} — ${same.quantity} in that record now`;break;}const l=newLot(c.lot);if(c.groupId)l.groupIds.push(group(s,c.groupId).id);if(c.deckId)allocate(l,deck(s,c.deckId),slot(s,c.deckId,c.slotId),l.quantity);summary=`Recorded ${l.quantity} ${l.source} ${card(s,l.cardId).name}`;break;}
      case 'importLots':{ensure(text(c.batchId,200),'An import needs a batch identifier.');if(s.imports.some(b=>b.id===c.batchId))return {state:current,summary:'This batch was already imported.',duplicate:true};for(const raw of c.cards||[])addCard(raw);for(const raw of c.lots||[]){const l=newLot(raw);if(c.groupId)l.groupIds.push(group(s,c.groupId).id);}s.imports.push({id:c.batchId,at:now,mode:c.mode||'acquisitions',rows:c.lots.length,source:text(c.source,500)});summary=`Imported ${c.lots.length} reviewed inventory rows`;break;}
      case 'source':{let l=lot(s,c.lotId);ensure(SOURCES.includes(c.source),'Choose Owned, Ordered, Incoming trade, Wanted or Watching.');if((l.source==='owned'&&c.source!=='owned')||(l.allocation&&PLANNED.includes(c.source)))warning(l);l=split(l,c.quantity);l.source=c.source;if(l.source==='owned'){l.location=l.location||{kind:'bench',box:''};l.receivedAt=now;}else {l.location=null;l.offer='none';}if(c.paid!==undefined&&!Number.isFinite(l.paid))stampPaid(l,c.paid,c.paidSource);
        /* Below Ordered a record is a plan again, and a plan holds no reservation: the deck's requirement goes back to To buy. */
        if(PLANNED.includes(l.source))l.allocation=null;summary=`Corrected acquisition to ${c.source}: ${card(s,l.cardId).name}`;break;}
      case 'allocate':{let l=lot(s,c.lotId);warning(l);l=split(l,c.quantity);l.allocation=null;if(l.offer==='held')ensure(false,'Cancel the pending deal before transferring the copy.');allocate(l,deck(s,c.deckId),slot(s,c.deckId,c.slotId),l.quantity);summary='Reserved copies; physical location unchanged';break;}
      case 'place':{let l=lot(s,c.lotId);ensure(l.source==='owned','Record receipt or purchase before putting this card in a deck.');if(l.location?.kind==='deck'&&l.location.deckId!==c.deckId)warning(l);l=split(l,c.quantity);if(c.deckId){const d=deck(s,c.deckId);ensure(!d.archived,'Archived decks cannot receive cards.');if(l.allocation?.deckId!==d.id){warning(l);l.allocation=null;const r=c.slotId?slot(s,d.id,c.slotId):d.slots.find(r=>compatible(l,r)&&shortfall(s,d,r)>=l.quantity);ensure(r,'This deck has no matching unfulfilled requirement. Choose a replacement or acquire a second copy.');allocate(l,d,r,l.quantity);}l.location={kind:'deck',deckId:d.id,box:text(c.box,300)||d.name};}else l.location={kind:'bench',box:text(c.box,300)};summary=`Confirmed physical placement: ${c.deckId?deck(s,c.deckId).name:'Bench'}`;break;}
      /* THE SAME CHANGE, TO A HANDFUL OF RECORDS. Coming back from a convention with eleven
         cards to mark received meant eleven dialogs, eleven revisions and eleven things to
         undo, so nobody did it and the library drifted. One command, one receipt, one undo.
         Each record goes through the same guards its single-record command uses -- and if
         one refuses, the whole batch refuses, because a partly applied batch is a state
         nobody asked for and nobody can see. */
      case 'bulk':{
        ensure(Array.isArray(c.lotIds)&&c.lotIds.length,'Select at least one card record.');
        ensure(c.lotIds.length<=500,'Change at most 500 records at once.');
        ensure(new Set(c.lotIds).size===c.lotIds.length,'A record cannot appear twice in one batch.');
        let copies=0;
        for(const lotId of c.lotIds){
          const l=lot(s,lotId);copies+=l.quantity;
          if(c.op==='source'){ensure(SOURCES.includes(c.source),'Choose Owned, Ordered, Incoming trade, Wanted or Watching.');if((l.source==='owned'&&c.source!=='owned')||(l.allocation&&PLANNED.includes(c.source)))warning(l);l.source=c.source;if(l.source==='owned'){l.location=l.location||{kind:'bench',box:''};l.receivedAt=now;}else{l.location=null;l.offer='none';}if(PLANNED.includes(l.source))l.allocation=null;
            /* A batch may stamp each copy's sheet price as what was paid, where nothing was recorded yet. */
            if(c.paidByLot&&Object.hasOwn(c.paidByLot,lotId)&&!Number.isFinite(l.paid))stampPaid(l,c.paidByLot[lotId],c.paidSource);}
          else if(c.op==='place'){const d=deck(s,c.deckId);ensure(!d.archived,'Archived decks cannot receive cards.');ensure(l.source==='owned','Record receipt or purchase before putting this card in a deck.');ensure(l.allocation?.deckId===d.id,`${card(s,l.cardId).name} is not reserved for ${d.name}. Reserve it first, or put it in the deck it is reserved for.`);if(l.location?.kind==='deck'&&l.location.deckId!==d.id)warning(l);l.location={kind:'deck',deckId:d.id,box:text(c.box,300)||d.name};}
          else if(c.op==='bench'){ensure(l.source==='owned','Record receipt or purchase before moving this card.');if(l.location?.kind==='deck')warning(l);l.location={kind:'bench',box:text(c.box,300)};}
          else if(c.op==='release'){warning(l);release(l,'bench');}
          else if(c.op==='offer'){ensure(l.source==='owned','Only owned copies can be offered.');ensure(['none','available','held'].includes(c.offer),'Invalid Sell / Trade state.');if(c.offer==='held'){warning(l);l.allocation=null;}l.offer=c.offer;}
          else ensure(false,'Unknown bulk operation.');
        }
        const what=c.op==='source'?`Marked ${c.source}`:c.op==='place'?`Put in ${deck(s,c.deckId).name}`:c.op==='bench'?'Moved to the bench':c.op==='release'?'Released to To buy':c.offer==='none'?'Cleared Sell / Trade':c.offer==='held'?'Held for a pending deal':'Offered for Sell / Trade';
        summary=`${what}: ${c.lotIds.length} record${c.lotIds.length===1?'':'s'}, ${copies} cop${copies===1?'y':'ies'}`;break;}
      case 'release':{let l=lot(s,c.lotId);warning(l);l=split(l,c.quantity);release(l,c.destination||'bench');summary='Released allocation; retained the actual physical location';break;}
      case 'swap':{const d=deck(s,c.deckId),r=slot(s,d.id,c.slotId);ensure(!d.archived,'Restore the archived deck first.');for(const raw of c.cards||[])addCard(raw);card(s,c.cardId);version(d);const released=s.lots.filter(l=>l.allocation?.deckId===d.id&&l.allocation.slotId===r.id);for(const l of released)l.allocation=null;r.cardId=c.cardId;r.printing=clone(c.printing||{});r.pinned=!!c.pinned;if(c.commander)d.commanders=d.commanders.map(cid=>cid===c.commander?c.cardId:cid);const issues=d.status==='final'?acceptance(s,d):[];ensure(!issues.length,issues.join('\n'));for(const l of released)release(l,c.destination);if(d.status==='final'){if(c.lotId){let l=lot(s,c.lotId);warning(l);l=split(l,Math.min(l.quantity,shortfall(s,d,r)));l.allocation=null;allocate(l,d,r,l.quantity);}satisfy(d,r.id);}summary=`Replaced a slot in ${d.name}; ownership unchanged`;break;}
      case 'option':{const d=deck(s,c.deckId);ensure(!d.archived,'Restore the deck first.');const parent=slot(s,d.id,c.replaces);ensure(parent.purpose==='main','Choose a main-deck slot.');for(const raw of c.cards||[])addCard(raw);const [r]=rows([{...c.option,committed:!!c.reserve,replaces:parent.id,purpose:c.option.purpose||'upgrade'}]);ensure(r.purpose!=='main','An option is separate from the main hundred.');d.slots.push(r);if(d.status==='final'&&c.reserve)satisfy(d,r.id);summary='Saved a linked upgrade or bracket option outside the main hundred';break;}
      case 'removeOption':{const d=deck(s,c.deckId),r=slot(s,d.id,c.slotId);ensure(r.purpose!=='main','Replace a main slot instead.');const releaseLots=s.lots.filter(l=>l.allocation?.deckId===d.id&&l.allocation.slotId===r.id);d.slots=d.slots.filter(x=>x.id!==r.id);for(const l of releaseLots)release(l,c.destination);summary='Removed an optional commitment';break;}
      case 'fulfill':{const d=deck(s,c.deckId);ensure(d.status==='final'&&!d.archived,'Finalize an available deck first.');satisfy(d);summary=`Reserved eligible unassigned copies for ${d.name}`;break;}
      case 'offer':{let l=lot(s,c.lotId);ensure(l.source==='owned','Only owned copies can be offered.');l=split(l,c.quantity);if(c.offer==='held'){warning(l);l.allocation=null;}ensure(['none','available','held'].includes(c.offer),'Invalid offer state.');l.offer=c.offer;summary=`Updated Sell / Trade: ${card(s,l.cardId).name}`;break;}
      /* A COUNT IS A NUMBER YOU CAN BE WRONG ABOUT. Ordering four and receiving three used
         to mean disposing of one, which is a different sentence about a different event.
         Setting the count says what is true now. Lowering it is still a loss of copies, so
         it asks the same confirmation every other shrinking change asks; the slot it was
         filling recomputes its shortfall from the lots, so nothing else has to be told. */
      case 'quantity':{const l=lot(s,c.lotId),next=quantity(c.quantity);
        if(next<l.quantity)warning(l);
        l.quantity=next;summary=`${card(s,l.cardId).name}: ${next} ${l.source}`;break;}
      case 'dispose':{let l=lot(s,c.lotId);ensure(l.source==='owned','Only owned copies can leave the library.');warning(l);l=split(l,c.quantity);s.lots=s.lots.filter(x=>x.id!==l.id);summary=`Recorded ${text(c.reason,60)||'disposition'} of ${l.quantity} ${card(s,l.cardId).name}`;break;}
      case 'removePending':{const l=lot(s,c.lotId);ensure(l.source!=='owned','Use a recorded disposition for owned cards.');warning(l);const part=split(l,c.quantity);s.lots=s.lots.filter(x=>x.id!==part.id);summary='Cancelled a pending acquisition; any deck requirement is still visible';break;}
      /* AN ORDER IS ONE THING YOU DID, NOT EIGHTY-FIVE. Eighty-five ticked rows and one dialog --
         vendor, reference, shipping, expected date -- become eighty-five ordered copies that all
         carry the same order record, each with its share of the shipping and the sheet price
         stamped as paid where nothing was recorded. The order id is the handle the Orders tab
         uses: Arrived → bench is one command over it, one revision, one undo. A receipt is a
         list of (copy, price) corrections marked `receipt`, and touches only the lines it names. */
      case 'order':{ensure(Array.isArray(c.lotIds)&&c.lotIds.length,'Tick at least one card to order.');ensure(c.lotIds.length<=500,'Order at most 500 records at once.');
        const record=orderRecord({...c.order,id:c.order&&c.order.id||id('order')}),copies=c.lotIds.reduce((n,lid)=>n+lot(s,lid).quantity,0),ship=Number.isFinite(c.shipping)&&c.shipping>0?c.shipping:0;
        for(const lid of c.lotIds){const l=lot(s,lid);ensure(l.source!=='owned','An owned copy is not on order.');if(l.allocation&&PLANNED.includes(l.source))warning(l);l.source='ordered';l.location=null;l.offer='none';l.order={...record,shipShare:Number.isFinite(record.shipShare)?record.shipShare:Math.round(ship/copies*10000)/10000};if(c.paidByLot&&Object.hasOwn(c.paidByLot,lid)&&!Number.isFinite(l.paid))stampPaid(l,c.paidByLot[lid],c.paidSource||'catalog');}
        summary=`Ordered ${copies} cop${copies===1?'y':'ies'} from ${record.vendor||'a vendor'}${record.ref?' · '+record.ref:''}`;break;}
      case 'orderArrived':{const lots=s.lots.filter(l=>l.order&&l.order.id===c.orderId&&l.source!=='owned');ensure(lots.length,'Every copy on that order has already arrived.');for(const l of lots){l.source='owned';l.location={kind:'bench',box:''};l.receivedAt=now;}summary=`Arrived: ${lots.reduce((n,l)=>n+l.quantity,0)} copies to the bench, reservations kept`;break;}
      case 'editOrder':{const lots=s.lots.filter(l=>l.order&&l.order.id===c.orderId);ensure(lots.length,'That order no longer has any copies.');for(const l of lots)l.order=orderRecord({...l.order,...(c.order||{}),id:c.orderId,shipShare:l.order.shipShare});summary='Updated the order';break;}
      case 'receipt':{ensure(Array.isArray(c.lines)&&c.lines.length,'A receipt needs at least one line.');let changed=0;for(const line of c.lines){const l=lot(s,line.lotId);ensure(Number.isFinite(line.paid)&&line.paid>=0,'A receipt line needs a price.');if(l.paid!==line.paid||l.paidSource!=='receipt'){stampPaid(l,line.paid,'receipt');changed++;}}summary=`Receipt applied to ${changed} cop${changed===1?'y':'ies'} record${changed===1?'':'s'}`;break;}
      case 'editLot':{const l=lot(s,c.lotId);if(c.printing)l.printing=print(c.printing);if(c.notes!==undefined)l.notes=text(c.notes,5000);if(c.paid!==undefined&&c.paid!==l.paid)stampPaid(l,c.paid,c.paidSource);if(c.keepBench!==undefined)l.keepBench=!!c.keepBench;summary='Updated copy details';break;}
      case 'createGroup':{s.groups.push({id:c.groupId||id('group'),name:text(c.name,100)||'New group',entries:[],createdAt:now});summary='Created Collection group';break;}
      case 'renameGroup':{group(s,c.groupId).name=text(c.name,100);summary='Renamed Collection group';break;}
      /* A list can declare its commander after the fact too -- an import into an existing
         group, or a correction. Same validation: the card must be one we hold. */
      case 'groupCommander':{const g=group(s,c.groupId);if(c.commanderCardId){card(s,c.commanderCardId);g.commanderCardId=c.commanderCardId;}else delete g.commanderCardId;summary='Recorded the list commander';break;}
      case 'deleteGroup':{group(s,c.groupId);s.groups=s.groups.filter(g=>g.id!==c.groupId);for(const l of s.lots)l.groupIds=l.groupIds.filter(g=>g!==c.groupId);for(const d of s.decks)if(d.groupId===c.groupId)d.groupId=null;summary='Removed the group; owned copies remain in the library';break;}
      case 'groupLots':{group(s,c.groupId);for(const lid of c.lotIds){const l=lot(s,lid);if(c.moveFrom)l.groupIds=l.groupIds.filter(g=>g!==c.moveFrom);if(!l.groupIds.includes(c.groupId))l.groupIds.push(c.groupId);}summary='Updated group membership without changing ownership';break;}
      case 'moveGroupEntries':{const from=group(s,c.from),to=group(s,c.to);ensure(from.id!==to.id,'Choose a different destination group.');for(const entryId of c.entryIds){const entry=from.entries.find(r=>r.id===entryId);ensure(entry,'That planned entry no longer exists.');to.entries.push({...clone(entry),id:c.copy?id('entry'):entry.id});if(!c.copy)from.entries=from.entries.filter(r=>r.id!==entryId);}summary=`${c.copy?'Copied':'Moved'} planned entries to ${to.name}; ownership unchanged`;break;}
      /* A planned entry is fulfilled or abandoned a few copies at a time: no quantity means the
         whole entry goes, a quantity takes that many off it and removes it only at zero. */
      case 'removeGroupEntries':{const g=group(s,c.groupId);ensure(Array.isArray(c.entryIds)&&c.entryIds.length,'Choose at least one planned entry.');let removed=0;for(const entryId of c.entryIds){const entry=g.entries.find(r=>r.id===entryId);ensure(entry,'That planned entry no longer exists.');const n=c.quantity===undefined?entry.quantity:quantity(c.quantity);ensure(n<=entry.quantity,'That quantity exceeds the planned entry.');removed+=n;if(n===entry.quantity)g.entries=g.entries.filter(r=>r.id!==entryId);else entry.quantity-=n;}summary=`Removed ${removed} planned cop${removed===1?'y':'ies'} from ${g.name}; ownership unchanged`;break;}
      /* A LIST BECOMES COPIES, AT A STATUS. A draft saved from the Lab is a hundred plans and no
         copies, and the reader who already owns forty of them -- or has just ordered the other
         sixty -- should be able to say so for the whole list rather than card by card. Each
         chosen slot gets one copy record at the given status, filed under the deck's group so
         the Collection shows it with the deck; on a finalized deck the copies are reserved to
         their slots as well, at the shortfall and no more. Copies already filed under the group
         for the same card count towards a draft's slot, so saying it twice does not double the
         library. `quantities` names a count per slot for the one-card case. */
      case 'acquireSlots':{const d=deck(s,c.deckId);ensure(!d.archived,'Restore the archived deck first.');ensure(SOURCES.includes(c.source),'Choose Owned, Ordered, Incoming trade, Wanted or Watching.');const chosen=d.slots.filter(r=>r.committed&&(!c.slotIds||c.slotIds.includes(r.id)));ensure(chosen.length,'Choose at least one card in the list.');let made=0;
        for(const r of chosen){const filed=d.groupId?s.lots.filter(l=>l.cardId===r.cardId&&!l.allocation&&l.groupIds.includes(d.groupId)).reduce((n,l)=>n+l.quantity,0):0;
          const n=c.quantities&&c.quantities[r.id]!==undefined?quantity(c.quantities[r.id]):d.status==='final'?shortfall(s,d,r):Math.max(0,r.quantity-filed);if(n<1)continue;
          const l=newLot({cardId:r.cardId,quantity:n,source:c.source,printing:clone(r.printing||{}),...(c.paidBySlot&&Number.isFinite(c.paidBySlot[r.id])?{paid:c.paidBySlot[r.id],paidSource:c.paidSource}:{})});if(d.groupId)l.groupIds.push(d.groupId);if(c.order)l.order=orderRecord(c.order);
          if(d.status==='final'&&!PLANNED.includes(c.source)){const can=shortfall(s,d,r);if(can>0)allocate(l,d,r,Math.min(n,can));}made+=n;}
        ensure(made>0,'Every chosen card already has copies recorded for this deck.');summary=`Recorded ${made} cop${made===1?'y':'ies'} as ${c.source} for ${d.name}`;break;}
      case 'groupEntries':{const g=group(s,c.groupId);for(const raw of c.cards||[])addCard(raw);if(c.batchId&&s.imports.some(b=>b.id===c.batchId))return {state:current,summary:'This batch was already imported.',duplicate:true};const entries=rows(c.entries||[]).map(r=>({...r,id:id('entry')}));g.entries=c.replace?entries:g.entries.concat(entries);
        /* The commander the imported list declared. Recorded here rather than on
           createGroup because the cards are added a few lines above this one -- on
           createGroup the identity does not exist yet and validation would reject it. */
        if(c.commanderCardId){card(s,c.commanderCardId);g.commanderCardId=c.commanderCardId;}if(c.batchId)s.imports.push({id:c.batchId,at:now,mode:'draft',rows:entries.length});summary='Saved a draft list; no ownership or reservations created';break;}
      case 'spreadsheetEdits':{ensure(c.baseRevision===s.revision,'The collection changed since this spreadsheet was exported. Resolve the revision conflict before importing edits.');for(const edit of c.edits){const l=lot(s,edit.id);if(edit.quantity!==undefined){warning(l);l.quantity=quantity(edit.quantity);}if(edit.notes!==undefined)l.notes=text(edit.notes,5000);if(edit.printing)l.printing=print(edit.printing);if(edit.offer!==undefined){ensure(edit.offer!=='held','Record pending deals in the application.');l.offer=edit.offer;}if(edit.box!==undefined){ensure(l.location?.kind!=='deck','Use Put in deck or Move to bench to change deck placement.');if(l.source==='owned')l.location={kind:'bench',box:text(edit.box,300)};}}summary=`Applied ${c.edits.length} reviewed spreadsheet edits`;break;}
      case 'game':{const d=deck(s,c.deckId);const g={id:c.gameId||id('game'),deckId:d.id,deckVersion:d.version,at:c.playedAt||now,outcome:c.outcome,turns:c.turns===null?null:quantity(c.turns),opponents:text(c.opponents,2000),notes:text(c.notes,5000),seat:c.seat??null,definition:clone(d.definition)};ensure(['win','loss','draw','unfinished'].includes(g.outcome),'Choose the game outcome.');s.games.push(g);summary=`Logged ${g.outcome} for ${d.name}`;break;}
      case 'report':{const d=deck(s,c.deckId);ensure(c.report&&typeof c.report.protocol==='string'&&c.report.deckFingerprint,'Reports need protocol and exact-list provenance.');const measured=c.report.origin==='measured';s.reports.push({...clone(c.report),id:id('report'),deckId:d.id,importedAt:now,origin:measured?'measured':'imported'});summary=measured?'Recorded a measured simulation report':'Imported a versioned report; no simulation executed';break;}
      case 'advice':{const d=deck(s,c.deckId);ensure(c.advice&&c.advice.deckFingerprint&&typeof c.advice.text==='string','Advice needs list provenance and text.');s.advice.push({...clone(c.advice),id:id('advice'),deckId:d.id,importedAt:now});summary='Imported an advice pack';break;}
      case 'preferences':s.preferences={...s.preferences,...clone(c.values)};summary='Saved view preferences';break;
      case 'legacy':s.legacy=clone(c.legacy);summary='Saved legacy reconciliation information without asserting ownership';break;
      default:throw Error('Unknown collection operation: '+c.type);
    }
    s.revision=current.revision+1;s.createdAt=s.createdAt||now;s.updatedAt=now;validate(s);
    // A sale must retain the exact printing after its owned row has gone. The
    // same receipt exposes automatic reallocations instead of hiding them in
    // a prose summary. Unchanged records do not inflate the journal.
    const receipt=l=>l?{id:l.id,cardId:l.cardId,quantity:l.quantity,source:l.source,printing:l.printing,allocation:l.allocation,location:l.location,offer:l.offer}:null;
    const before=new Map(current.lots.map(l=>[l.id,l])),after=new Map(s.lots.map(l=>[l.id,l])),effects=[];
    for(const lid of new Set([...before.keys(),...after.keys()])){const a=receipt(before.get(lid)),b=receipt(after.get(lid));if(JSON.stringify(a)!==JSON.stringify(b))effects.push({id:lid,before:a,after:b});}
    return {state:s,summary,event:{id:c.id,type:c.type,at:now,revision:s.revision,summary,operation:c,effects}};
  }
  function fingerprint(d){return JSON.stringify({commanders:[...d.commanders].sort(),slots:d.slots.filter(r=>r.purpose==='main').map(r=>[r.cardId,r.quantity]).sort((a,b)=>a[0].localeCompare(b[0]))});}
  /* THE ORDERS, READ BACK: one row per order id across the lots that carry it. */
  function orders(s){const by=new Map();for(const l of s.lots){if(!l.order)continue;const o=by.get(l.order.id)||{id:l.order.id,vendor:l.order.vendor,ref:l.order.ref,expectedBy:l.order.expectedBy,placedAt:l.order.placedAt,lots:[],copies:0,arrived:0,paid:0,shipping:0};o.lots.push(l);o.copies+=l.quantity;if(l.source==='owned')o.arrived+=l.quantity;if(Number.isFinite(l.paid))o.paid+=l.paid*l.quantity;o.shipping+=(l.order.shipShare||0)*l.quantity;by.set(o.id,o);}return [...by.values()].map(o=>({...o,paid:Math.round(o.paid*100)/100,shipping:Math.round(o.shipping*100)/100})).sort((a,b)=>String(b.placedAt).localeCompare(String(a.placedAt)));}
  return {VERSION,SOURCES,PLANNED,empty,starterGroups,clone,text,quantity,print,compatible,validate,apply,defaultDefinition,legality,definitionIssues,projection,counters,readiness,eligibility,fingerprint,shortfall,deck,slot,lot,inDeck,orders};
});
