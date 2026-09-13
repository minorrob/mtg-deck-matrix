/* LOAD LIVE: the library as a file you can edit by hand.
 *
 * A backup is the app's own export -- checksummed, revision-stamped, and unreadable by a
 * person who wants to change one quantity. data/live-load.json is the opposite: a small
 * JSON document written in the words the owner uses (deck targets, what is in each box,
 * what is on the bench, what is ordered, what is left to buy, which upgrades exist), kept
 * in the repository, edited in a text editor and committed. Load Live reads that file and
 * REBUILDS the whole library from it, through the same collection model every other
 * change goes through, so a hand-edited file can never produce a state the app itself
 * could not have reached.
 *
 * What the file says and what the library shows, one to one:
 *   decks[].cards        the 100-card target, finalized, one main slot per card
 *   owned.inDeck[D]      owned copies in that deck's box: reserved to the deck, located in it
 *   owned.bench          owned copies on the bench; reserved to whichever deck still needs them
 *   ordered              copies in flight; reserved after owned copies, never located
 *   buy                  the outstanding shopping list, filed under the To Buy group with prices
 *   upgrades             ceiling cards, filed under an "Upgrade Path" group AND attached to the
 *                        deck slot each one replaces, as an uncommitted upgrade option
 *   decks[].options      cards in the hundred flagged Option: the first to come out when a swap
 *                        is needed. A flag on the slot, nothing else changes
 *   decks[].planned      cards meant to come INTO the deck that are not in its hundred yet:
 *                        filed as Planned entries in the deck's own group, or, when a free copy
 *                        already exists (ordered, on the bench), that copy is filed in the group
 *   ordered/bench rows   may carry a third element, a deck id, to file the copy in that deck's
 *                        group -- "this one is for D4" -- without it being in the deck's list
 *
 * Every deck owns a collection group named after it (the app's rule since every deck got one);
 * the group ids are fixed (group:live:D1 ...) so a rebuild never duplicates them.
 *
 * The buy list is never turned into copies. A finalized deck's unfilled slots are what the
 * app already calls To buy, so the shopping list in the file is checked against the
 * shortfalls the model derives -- a disagreement is reported, not papered over.
 *
 * The password is a courtesy latch, not security: the file is public in the repository,
 * and so is this constant. It exists so a visitor cannot replace a library by accident. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CrankLiveLoad=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='crankmagic-live-load', VERSION=1, PASSWORD='treycmload1', GROUP_UPGRADES='group:live:upgrades', GROUP_TO_BUY='group:to-buy';
  const BASICS={'Plains':'W','Island':'U','Swamp':'B','Mountain':'R','Forest':'G','Wastes':''},PLANNED_SOURCES=['wanted','watching'];
  const fold=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
  const front=s=>String(s||'').split(' // ')[0];
  const ensure=(ok,message)=>{if(!ok)throw Error(message);};
  const isQty=n=>Number.isSafeInteger(n)&&n>=1&&n<=1000;
  const pair=(row,where)=>{ensure(Array.isArray(row)&&typeof row[0]==='string'&&row[0].trim()&&isQty(row[1]),`${where}: each row must be ["Card name", quantity].`);return [row[0].trim(),row[1]];};
  const forDeck=(row,where,ids)=>{pair(row,where);ensure(row[2]===undefined||row[2]===null||(typeof row[2]==='string'&&ids.has(row[2])),`${where}: ${row[0]} names unknown deck ${row[2]} in its third element.`);return row[2]||'';};
  /* The owner's two working lists per deck, accepted as bare names or as {card, why}. */
  const listed=(x,where)=>{const o=typeof x==='string'?{card:x}:x;ensure(o&&typeof o.card==='string'&&o.card.trim(),`${where}: every row needs a card.`);ensure(o.quantity===undefined||isQty(o.quantity),`${where}: ${o.card} has an invalid quantity.`);return {card:o.card.trim(),why:typeof o.why==='string'?o.why.trim():'',quantity:o.quantity||1};};

  /* The document's shape, before any card is looked up. Errors here are about the file. */
  function check(doc){
    ensure(doc&&typeof doc==='object'&&!Array.isArray(doc),'Not a live-load document.');
    ensure(doc.format===FORMAT,`Expected format "${FORMAT}", found "${doc.format}".`);
    ensure(doc.version===VERSION,`Unsupported live-load version ${doc.version}.`);
    ensure(Array.isArray(doc.decks)&&doc.decks.length,'decks must be a nonempty array.');
    const ids=new Set();
    for(const d of doc.decks){
      ensure(d&&typeof d.id==='string'&&/^[A-Za-z0-9_-]{1,20}$/.test(d.id),'Every deck needs a short id such as "D1".');
      ensure(!ids.has(d.id),`Duplicate deck id ${d.id}.`);ids.add(d.id);
      ensure(typeof d.name==='string'&&d.name.trim(),`${d.id}: deck needs a name.`);
      ensure(typeof d.commander==='string'&&d.commander.trim(),`${d.id}: deck needs a commander.`);
      ensure(Array.isArray(d.cards)&&d.cards.length,`${d.id}: cards must be a nonempty array.`);
      for(const row of d.cards)pair(row,d.id);
      const total=d.cards.reduce((n,r)=>n+r[1],0);ensure(total===100,`${d.id}: target lists ${total} cards; Commander needs exactly 100 including the commander.`);
      ensure(d.cards.some(r=>fold(r[0])===fold(d.commander)&&r[1]===1),`${d.id}: the commander must appear once in its own card list.`);
      const seen=new Set();for(const [n] of d.cards){ensure(!seen.has(fold(n)),`${d.id}: ${n} is listed twice; merge the rows.`);seen.add(fold(n));}
      ensure(d.options===undefined||Array.isArray(d.options),`${d.id}: options must be an array.`);ensure(d.planned===undefined||Array.isArray(d.planned),`${d.id}: planned must be an array.`);
      for(const o of d.options||[]){const {card}=listed(o,d.id+'.options');ensure(seen.has(fold(card)),`${d.id}: option ${card} is not in the deck's hundred; an Option flag goes on a card that is in the list.`);}
      for(const p of d.planned||[]){const {card}=listed(p,d.id+'.planned');ensure(!seen.has(fold(card)),`${d.id}: planned card ${card} is already in the deck's hundred; a plan is for a card that is not yet in it.`);}
    }
    ensure(doc.owned&&typeof doc.owned==='object','owned must be an object with inDeck and bench.');
    ensure(doc.owned.inDeck&&typeof doc.owned.inDeck==='object'&&!Array.isArray(doc.owned.inDeck),'owned.inDeck must map deck id to rows.');
    for(const [id,rows] of Object.entries(doc.owned.inDeck)){ensure(ids.has(id),`owned.inDeck names unknown deck ${id}.`);ensure(Array.isArray(rows),`owned.inDeck.${id} must be an array.`);for(const row of rows)pair(row,'owned.inDeck.'+id);}
    ensure(Array.isArray(doc.owned.bench),'owned.bench must be an array.');for(const row of doc.owned.bench)forDeck(row,'owned.bench',ids);
    ensure(Array.isArray(doc.ordered),'ordered must be an array.');for(const row of doc.ordered)forDeck(row,'ordered',ids);
    ensure(Array.isArray(doc.buy),'buy must be an array.');for(const row of doc.buy){pair(row,'buy');ensure(row[2]===undefined||row[2]===null||(Number.isFinite(row[2])&&row[2]>=0),`buy: ${row[0]} has an invalid price.`);}
    ensure(Array.isArray(doc.upgrades),'upgrades must be an array.');
    for(const u of doc.upgrades){ensure(u&&typeof u.card==='string'&&u.card.trim(),'upgrades: every row needs a card.');ensure(ids.has(u.deck),`upgrades: ${u.card} names unknown deck ${u.deck}.`);}
    return true;
  }

  /* Every distinct name the document mentions, in first-seen order. */
  function names(doc){
    const out=[],seen=new Set(),add=n=>{const k=fold(n);if(k&&!seen.has(k)){seen.add(k);out.push(String(n).trim());}};
    for(const d of doc.decks){add(d.commander);for(const [n] of d.cards)add(n);for(const p of d.planned||[])add(listed(p,d.id).card);}
    for(const rows of Object.values(doc.owned.inDeck))for(const [n] of rows)add(n);
    for(const [n] of doc.owned.bench)add(n);for(const [n] of doc.ordered)add(n);for(const [n] of doc.buy)add(n);
    for(const u of doc.upgrades){add(u.card);if(u.replaces)add(u.replaces);}
    return out;
  }

  /* A basic land the catalog knows only as "Land" would fail the copies rule. The rules
     text for a basic is not in doubt, so the identity is completed here rather than
     refused. Nothing else about a card is ever guessed. */
  function completeBasic(c){
    if(!(c.name in BASICS)||/\bBasic\b/.test(c.typeLine||''))return c;
    const colour=BASICS[c.name];
    return {...c,typeLine:`Basic Land — ${c.name}`,oracleText:c.oracleText||(colour?`({T}: Add {${colour}}.)`:'({T}: Add {C}.)'),colorIdentity:c.colorIdentity&&c.colorIdentity.length?c.colorIdentity:(colour?[colour]:[])};
  }

  /* Build a complete collection state from the document.
   *   lookup(name) -> card identity (already normalized by the catalog) or null
   * Returns {state, issues, summary}. Missing identities are fatal: a library with a
   * hole in it is not a library. Anything that keeps a deck from finalizing is reported
   * per deck and the deck is left as a draft, so the rest of the load still lands. */
  function build(doc,{Model,lookup,savedAt}={}){
    ensure(Model&&typeof Model.apply==='function','The collection model is required.');
    check(doc);
    const issues=[],stamp=savedAt||doc.savedAt||new Date().toISOString(),provenance={type:'live load',source:'data/live-load.json',savedAt:stamp};
    const cards=new Map(),missing=[];
    for(const name of names(doc)){const c=lookup(name);if(c)cards.set(fold(name),completeBasic(c));else missing.push(name);}
    ensure(!missing.length,`${missing.length} card name${missing.length===1?'':'s'} could not be resolved: ${missing.slice(0,12).join('; ')}${missing.length>12?'; …':''}. Fix the spelling in the file (use the exact Scryfall name).`);
    const idOf=name=>cards.get(fold(name)).id;
    let s=Model.empty(),n=0;
    const run=cmd=>{const r=Model.apply(s,{id:'live:'+(++n),at:stamp,...cmd});s=r.state;return r;};
    run({type:'cards',cards:[...new Map([...cards.values()].map(c=>[c.id,c])).values()]});
    const deckIds={},slotOf={},groupOf={};
    run({type:'preferences',values:{deckGroups:true}});
    for(const d of doc.decks){
      const deckId='deck:live:'+d.id,groupId='group:live:'+d.id;deckIds[d.id]=deckId;groupOf[d.id]=groupId;
      const slots=d.cards.map(([name,qty])=>({id:`slot:live:${d.id}:${idOf(name).slice(5)}`,cardId:idOf(name),quantity:qty,purpose:'main'}));
      run({type:'createGroup',groupId,name:d.name});
      run({type:'createDeck',deckId,name:d.name,commanders:[idOf(d.commander)],slots,definition:d.definition||{},notes:d.notes||'',groupId});
      slotOf[d.id]=new Map(slots.map(r=>[r.cardId,r.id]));
      try{run({type:'finalize',deckId});}catch(err){issues.push(`${d.name} stays a draft: ${err.message}`);}
      for(const o of d.options||[]){const {card,why}=listed(o,d.id+'.options');run({type:'flag',deckId,slotId:slotOf[d.id].get(idOf(card)),option:true,why});}
    }
    /* Upgrades: the group Rob asked for, and the linked option the deck page already knows. */
    if(doc.upgrades.length){
      run({type:'createGroup',groupId:GROUP_UPGRADES,name:'Upgrade Path'});
      const entries=[];
      for(const u of doc.upgrades){
        const noteText=[u.deck,u.replaces?`replaces ${u.replaces}`:'',u.tier!==undefined?`tier ${u.tier}`:'',Number.isFinite(u.price)?`$${u.price.toFixed(2)}`:'',u.why||''].filter(Boolean).join(' · ');
        entries.push({cardId:idOf(u.card),quantity:1,notes:noteText});
        const deckId=deckIds[u.deck],replaces=u.replaces?slotOf[u.deck].get(idOf(u.replaces)):null;
        if(!replaces){issues.push(`Upgrade ${u.card} (${u.deck}): "${u.replaces||'(none)'}" is not in that deck's target, so it is filed in the group only.`);continue;}
        try{run({type:'option',deckId,replaces,option:{cardId:idOf(u.card),quantity:1,purpose:'upgrade',notes:noteText,tier:Number.isInteger(u.tier)?u.tier:null,why:u.why||'',price:Number.isFinite(u.price)?u.price:null}});}
        catch(err){issues.push(`Upgrade ${u.card} (${u.deck}) could not be attached to its slot: ${err.message}`);}
      }
      run({type:'groupEntries',groupId:GROUP_UPGRADES,replace:true,entries});
    }
    if(doc.buy.length&&s.groups.some(g=>g.id===GROUP_TO_BUY)){
      run({type:'groupEntries',groupId:GROUP_TO_BUY,replace:true,entries:doc.buy.map(([name,qty,price])=>({cardId:idOf(name),quantity:qty,notes:Number.isFinite(price)?`$${price.toFixed(2)} each`:''}))});
    }
    /* Copies. Built directly, then validated as a whole: eight hundred commands that each
       clone the library would spend seconds proving what one validation proves. */
    const state=Model.clone(s);let serial=0;
    const lot=(cardId,quantity,source,location,notes,groupId)=>{const l={id:'lot:live:'+(++serial),cardId,quantity,source,printing:Model.print({}),location,allocation:null,offer:'none',groupIds:groupId?[groupId]:[],notes:notes||'',paid:null,acquiredAt:stamp,provenance:{...provenance}};if(source!=='owned')l.location=null;state.lots.push(l);return l;};
    const deckOf=id=>state.decks.find(d=>d.id===id);
    const allocated=(d,r)=>state.lots.filter(l=>l.allocation&&l.allocation.deckId===d.id&&l.allocation.slotId===r.id).reduce((k,l)=>k+l.quantity,0);
    const shortfall=(d,r)=>Math.max(0,r.quantity-allocated(d,r));
    for(const d of doc.decks){
      const deck=deckOf(deckIds[d.id]);
      for(const [name,qty] of doc.owned.inDeck[d.id]||[]){
        const cardId=idOf(name),slotId=slotOf[d.id].get(cardId),r=slotId?deck.slots.find(x=>x.id===slotId):null;
        let inBox=0;
        if(r&&deck.status==='final'){inBox=Math.min(qty,shortfall(deck,r));if(inBox)lot(cardId,inBox,'owned',{kind:'deck',deckId:deck.id,box:deck.name}).allocation={deckId:deck.id,slotId};}
        const rest=qty-inBox;
        if(rest)lot(cardId,rest,'owned',{kind:'bench',box:`From the ${d.id} box`},r?'':`Not in the ${d.id} target; move it to the bench.`);
      }
    }
    for(const [name,qty,forId] of doc.owned.bench)lot(idOf(name),qty,'owned',{kind:'bench',box:''},'',forId?groupOf[forId]:'');
    for(const [name,qty,forId] of doc.ordered)lot(idOf(name),qty,'ordered',null,'',forId?groupOf[forId]:'');
    /* Reserve bench and ordered copies for the decks that still need them, in file order:
       the first deck in the file is the first deck served. Owned before ordered, always. */
    for(const d of doc.decks){
      const deck=deckOf(deckIds[d.id]);if(deck.status!=='final')continue;
      for(const r of deck.slots.filter(r=>r.committed)){
        let need=shortfall(deck,r);if(!need)continue;
        const pool=state.lots.filter(l=>l.cardId===r.cardId&&!l.allocation&&l.source!=='wanted').sort((a,b)=>(a.source==='owned'?0:1)-(b.source==='owned'?0:1));
        for(const l of pool){
          if(!need)break;
          const take=Math.min(need,l.quantity);
          let part=l;
          if(take<l.quantity){part={...Model.clone(l),id:'lot:live:'+(++serial),quantity:take};l.quantity-=take;state.lots.push(part);}
          part.allocation={deckId:deck.id,slotId:r.id};need-=take;
        }
      }
    }
    /* Planned cards. A copy that is already free -- ordered and unreserved, or spare on the
       bench -- is filed in the deck's group and stands for the plan; what no copy covers is
       a Planned entry in that group, with the owner's reason as its note. */
    let entrySerial=0,plannedCount=0;
    for(const d of doc.decks){
      const g=state.groups.find(x=>x.id===groupOf[d.id]);
      for(const p of d.planned||[]){
        const {card,why,quantity}=listed(p,d.id+'.planned'),cardId=idOf(card);let left=quantity;plannedCount+=quantity;
        for(const l of state.lots.filter(l=>l.cardId===cardId&&!l.allocation&&!PLANNED_SOURCES.includes(l.source)).sort((a,b)=>(a.source==='owned'?1:0)-(b.source==='owned'?1:0))){
          if(!left)break;
          let part=l;
          if(l.quantity>left){part={...Model.clone(l),id:'lot:live:'+(++serial),quantity:left};l.quantity-=left;state.lots.push(part);}
          if(!part.groupIds.includes(g.id))part.groupIds.push(g.id);
          if(why&&!part.notes)part.notes=`${d.id}: ${why}`;
          left-=part.quantity;
        }
        if(left)g.entries.push({id:'entry:live:'+(++entrySerial),cardId,quantity:left,purpose:'main',committed:true,printing:{},replaces:'',targetBracket:null,pinned:false,option:false,optionWhy:'',tier:null,why:'',price:null,notes:why});
      }
    }
    state.revision=s.revision+1;state.updatedAt=stamp;state.createdAt=state.createdAt||stamp;
    Model.validate(state);
    /* The file's shopping list against the model's own arithmetic. */
    const wanted=new Map();for(const [name,qty] of doc.buy)wanted.set(idOf(name),(wanted.get(idOf(name))||0)+qty);
    const needed=new Map();for(const deck of state.decks.filter(d=>d.status==='final'))for(const r of deck.slots.filter(r=>r.committed)){const k=shortfall(deck,r);if(k)needed.set(r.cardId,(needed.get(r.cardId)||0)+k);}
    for(const [cardId,qty] of needed)if((wanted.get(cardId)||0)!==qty)issues.push(`${state.cards[cardId].name}: the decks still need ${qty} but the buy list says ${wanted.get(cardId)||0}.`);
    for(const [cardId,qty] of wanted)if(!needed.has(cardId))issues.push(`${state.cards[cardId].name}: on the buy list (${qty}) but no finalized deck is short of it.`);
    const counters=Model.counters(state),readiness=state.decks.map(d=>({deck:d.name,status:d.status,...Model.readiness(state,d)}));
    const options=doc.decks.reduce((n,d)=>n+(d.options||[]).length,0);
    return {state,issues,summary:{decks:state.decks.length,cards:Object.keys(state.cards).length,lots:state.lots.length,...counters,upgrades:doc.upgrades.length,buyRows:doc.buy.length,options,planned:plannedCount,readiness}};
  }
  return {FORMAT,VERSION,PASSWORD,GROUP_UPGRADES,check,names,build,fold,front,completeBasic};
});
