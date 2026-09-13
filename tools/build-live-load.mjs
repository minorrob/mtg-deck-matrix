#!/usr/bin/env node
/* THE WORKBOOK IS THE TRUTH FOR CARDS; THE FILE IS THE TRUTH FOR EVERYTHING ELSE.
 *
 *   node tools/build-live-load.mjs "Treys MtG Master v13.xlsx"            # -> data/live-load.json
 *   node tools/build-live-load.mjs                                         # the newest data/source/*Master*.xlsx
 *   node tools/build-live-load.mjs [workbook] --check                      # report and diff; exit 1 if the file is stale
 *   node tools/build-live-load.mjs <workbook> --adjust plans.json          # replace per-deck options/planned lists
 *   node tools/build-live-load.mjs <workbook> --scryfall cache.json        # resolve names against a Scryfall dump too
 *
 * The Master sheet of Rob's workbook carries, per card, how many he owns (Own), how many are
 * still to buy (Buy Count), how many are on order (Ordered), the price ($ Each), the target
 * count in each of the six decks (D1-T .. D6-T) and the count physically in each deck box
 * (D1-A .. D6-A). Columns are found by their header names, not their letters, so the sheet
 * can grow a column without breaking this; the letters Rob quotes (P, Q, S, W-AB, AE-AJ)
 * are checked and reported when they move. Python reads the workbook (tools/read-sheet-rows.py,
 * openpyxl) and this file does the arithmetic, so the names it writes are the catalog's
 * exact names and the file it writes is the one tools/build-live-state.mjs reads.
 *
 * What each part of the file is derived from:
 *   decks[].cards    the D-T column, every row with a target; sums to 100 or the build stops
 *   owned.inDeck     the D-A column: what is physically in that box, whether or not the
 *                    v13 target still lists it (the state builder benches the strays with a note)
 *   owned.bench      Own minus everything in boxes
 *   ordered          ONLY copies still in flight. The Ordered column is a history of orders,
 *                    received ones included, so a copy counts as in flight when the decks
 *                    still need it after Own, or when nothing is owned and nothing targets it
 *                    (a card ordered for a plan, not a list). Everything else was received.
 *   buy              Buy Count with the price; checked against Own, Ordered and the targets
 *   upgrades         the Upgrade Path sheet, every row that names a tier, a deck and a card
 *   commanders       the Deck Lists sheet (Status = Commander) or a Decks sheet (Deck, Commander, Name)
 *   names, definitions, notes, options, planned   carried from the committed file per deck;
 *                    --adjust replaces the two working lists for the decks it names. An option
 *                    must be in the hundred and a planned card must not be; the ones that are
 *                    not are reported and left out rather than written wrong.
 *
 * Nothing is ever written back to the workbook. */
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {bundledLookup, describe, SOURCE} from './build-live-state.mjs';
const require=createRequire(import.meta.url);
const Model=require('../collection-model.js'),Live=require('./live-load.js');

const READ=fileURLToPath(new URL('./read-sheet-rows.py',import.meta.url));
const DECKS=['D1','D2','D3','D4','D5','D6'];
const EXPECTED={own:'P',buy:'Q',ordered:'S',t:['W','X','Y','Z','AA','AB'],a:['AE','AF','AG','AH','AI','AJ']};
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
const letter=i=>{let s='';for(i=i+1;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(64+((i-1)%26)+1)+s;return s;};
const byName=(a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'});
const money=n=>'$'+n.toFixed(2);
const few=(list,n=12)=>list.length>n?list.slice(0,n).join('; ')+`; … and ${list.length-n} more`:list.join('; ');

function sheet(workbook,name){
  try{return JSON.parse(execFileSync('python3',[READ,workbook,name],{maxBuffer:64<<20,stdio:['ignore','pipe','pipe']}).toString('utf8'));}
  catch(err){const text=String(err.stderr||err.message);if(/KeyError/.test(text))return null;throw Error(`Could not read sheet "${name}" from ${workbook}: ${text.trim().split('\n').pop()}`);}
}
const int=(v,where)=>{if(v===null||v===undefined||v==='')return 0;const n=Number(v);ensure(Number.isInteger(n)&&n>=0,`${where}: "${v}" is not a whole number.`);return n;};
const cash=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.round(n*100)/100:null;};

export async function importWorkbook(workbook,{prior=null,adjust=null,scryfall=null,now=new Date()}={}){
  const notes=[];
  const lookup=await bundledLookup({scryfall});
  const unresolved=new Set();
  const canon=name=>{const c=lookup(name);if(!c){unresolved.add(name);return name;}return c.name;};

  /* MASTER. Header row is the one whose first cell is "Card"; every column is found by name. */
  const master=sheet(workbook,'Master');ensure(master,'The workbook has no Master sheet.');
  const h=master.findIndex(r=>r[0]==='Card');ensure(h>=0,'Master: no header row starting with "Card".');
  const H=master[h],col=name=>{const i=H.indexOf(name);ensure(i>=0,`Master: no "${name}" column in the header row.`);return i;};
  const cols={name:col('Card'),own:col('Own'),buy:col('Buy Count'),ordered:col('Ordered'),price:col('$ Each'),t:DECKS.map(d=>col(d+'-T')),a:DECKS.map(d=>col(d+'-A'))};
  const moved=[];for(const [k,v] of Object.entries(EXPECTED)){const got=Array.isArray(v)?cols[k].map(letter):letter(cols[k]);if(JSON.stringify(got)!==JSON.stringify(v))moved.push(`${k}: ${[].concat(got).join(',')} (expected ${[].concat(v).join(',')})`);}
  if(moved.length)notes.push('Master columns are not where the last workbook had them; headers were used instead: '+moved.join('; '));
  const cards=[],seen=new Map(),ignored=[],merged=[];
  for(const [i,r] of master.slice(h+1).entries()){
    const raw=r[cols.name];if(raw===null||raw===undefined||String(raw).trim()==='')continue;
    const where=`Master row ${h+2+i} (${String(raw).trim()})`;
    const rec={raw:String(raw).trim(),own:int(r[cols.own],where),buy:int(r[cols.buy],where),ordered:int(r[cols.ordered],where),price:cash(r[cols.price]),t:cols.t.map(c=>int(r[c],where)),a:cols.a.map(c=>int(r[c],where))};
    rec.sumT=rec.t.reduce((n,x)=>n+x,0);rec.sumA=rec.a.reduce((n,x)=>n+x,0);
    if(!rec.own&&!rec.ordered&&!rec.buy&&!rec.sumT&&!rec.sumA){ignored.push(rec.raw);continue;}
    ensure(rec.sumA<=rec.own,`${where}: ${rec.sumA} copies are in deck boxes but only ${rec.own} owned.`);
    rec.name=canon(rec.raw);
    /* Two rows, one card: a flavor-name print (Vayne Carudas Solidor) beside the card it is
       (Fynn, the Fangbearer). The collection counts copies of a card, so the rows add up. */
    const key=Live.fold(rec.name);
    if(seen.has(key)){const first=seen.get(key);first.own+=rec.own;first.buy+=rec.buy;first.ordered+=rec.ordered;first.t=first.t.map((n,k)=>n+rec.t[k]);first.a=first.a.map((n,k)=>n+rec.a[k]);first.sumT+=rec.sumT;first.sumA+=rec.sumA;first.price=first.price??rec.price;merged.push(`${rec.raw} into ${first.raw}`);continue;}
    seen.set(key,rec);cards.push(rec);
  }
  for(const [i,id] of DECKS.entries()){const total=cards.reduce((n,c)=>n+c.t[i],0);ensure(total===100,`${id}: the target column sums to ${total}, not 100. Fix the workbook before building.`);}
  if(merged.length)notes.push('Rows that are printings of one card were added together: '+merged.join('; '));
  if(ignored.length)notes.push(`${ignored.length} Master row${ignored.length===1?'':'s'} with no copies, no order, nothing to buy and no target were ignored: ${few(ignored)}`);

  /* COMMANDERS from the Deck Lists sheet when it is there; the committed file otherwise. */
  const lists=sheet(workbook,'Deck Lists'),commanders={},deckNames={};
  if(lists){const lh=lists.findIndex(r=>r[0]==='Deck');if(lh>=0){const LH=lists[lh],dC=LH.indexOf('Deck'),cC=LH.indexOf('Card'),sC=LH.indexOf('Status');for(const r of lists.slice(lh+1))if(r[sC]==='Commander'&&r[dC])commanders[String(r[dC])]=canon(String(r[cC]).trim());}}
  const deckSheet=sheet(workbook,'Decks');
  if(deckSheet){const dh=deckSheet.findIndex(r=>String(r[0]||'').trim()==='Deck');if(dh>=0){const DH=deckSheet[dh].map(x=>String(x||'').trim()),dC=DH.indexOf('Deck'),cC=DH.indexOf('Commander'),nC=DH.indexOf('Name');
    for(const r of deckSheet.slice(dh+1)){const id=String(r[dC]||'').trim();if(!DECKS.includes(id))continue;if(cC>=0&&r[cC])commanders[id]=canon(String(r[cC]).trim());if(nC>=0&&r[nC])deckNames[id]=String(r[nC]).trim();}}}
  const priorDeck=id=>prior?.decks?.find(d=>d.id===id)||null;

  /* DECKS. */
  const targetOf={},decks=DECKS.map((id,i)=>{
    const p=priorDeck(id),commander=commanders[id]||p?.commander;ensure(commander,`${id}: no commander found in the Deck Lists sheet or the committed file.`);
    const rows=cards.filter(c=>c.t[i]).map(c=>[c.name,c.t[i]]).sort(byName);targetOf[id]=new Map(rows.map(([n,q])=>[Live.fold(n),q]));
    if(p&&Live.fold(p.commander)!==Live.fold(commander))notes.push(`${id}: commander changed from ${p.commander} to ${commander}.`);
    return {id,name:deckNames[id]||p?.name||`${id} ${commander}`,commander,definition:p?.definition||{baseBracket:3,bracketCeiling:3,playStyle:'Balanced'},notes:p?.notes||'',cards:rows};
  });

  /* COPIES. */
  const inDeck={};for(const [i,id] of DECKS.entries())inDeck[id]=cards.filter(c=>c.a[i]).map(c=>[c.name,c.a[i]]).sort(byName);
  const bench=cards.filter(c=>c.own-c.sumA>0).map(c=>[c.name,c.own-c.sumA]).sort(byName);
  const ordered=[],received=[],noHome=[],buyIssues=[];
  for(const c of cards){
    const need=Math.max(0,c.sumT-c.own),forDecks=Math.min(c.ordered,need),forPlans=(!c.own&&!c.sumT)?c.ordered:0,inFlight=forDecks+forPlans;
    if(inFlight)ordered.push([c.name,inFlight]);
    if(c.ordered>inFlight)received.push(`${c.name} ×${c.ordered-inFlight}`);
    if(forPlans)noHome.push(`${c.name} ×${forPlans}`);
    const expected=Math.max(0,c.sumT-c.own-forDecks);
    if(c.buy!==expected)buyIssues.push(`${c.name}: Buy Count says ${c.buy}, but targets ${c.sumT} − owned ${c.own} − ordered ${forDecks} = ${expected}`);
  }
  ordered.sort(byName);
  const buy=cards.filter(c=>c.buy).map(c=>[c.name,c.buy,c.price]).sort(byName);
  if(received.length)notes.push(`${received.length} Ordered entr${received.length===1?'y was':'ies were'} already received (Own covers the targets) and are not in flight: ${few(received)}`);
  if(noHome.length)notes.push(`Ordered with nothing owned and no deck targeting it, kept as in flight: ${few(noHome)}`);
  if(buyIssues.length)notes.push('Buy Count disagrees with Own/Ordered/targets on '+buyIssues.length+' row(s): '+few(buyIssues));

  /* UPGRADE PATH. A row counts when it names a tier, a card and a deck. */
  const up=sheet(workbook,'Upgrade Path');let upgrades=prior?.upgrades||[];
  if(up){
    upgrades=[];const dupe=new Set();
    for(const r of up){
      const tier=Number(r[1]),card=r[3],deck=String(r[6]||'');
      if(!Number.isInteger(tier)||typeof card!=='string'||!card.trim()||!DECKS.includes(deck))continue;
      const name=canon(card.trim()),replaces=r[7]?canon(String(r[7]).trim()):'';
      if(!targetOf[deck].has(Live.fold(replaces))){notes.push(`Upgrade Path: ${name} (${deck}) comes in for "${replaces||'(none)'}", which is not in the ${deck} target; left out.`);continue;}
      if(targetOf[deck].has(Live.fold(name))){notes.push(`Upgrade Path: ${name} is already in the ${deck} target; left out.`);continue;}
      const key=deck+'|'+Live.fold(name);if(dupe.has(key))continue;dupe.add(key);
      upgrades.push({deck,card:name,replaces,tier,price:cash(r[4]),why:typeof r[8]==='string'?r[8].trim():''});
    }
  }else notes.push('No Upgrade Path sheet; the committed upgrades were kept.');
  const upgradeKeys=new Set(upgrades.map(u=>u.deck+'|'+Live.fold(u.card)));

  /* THE TWO WORKING LISTS PER DECK. A "CrankMagic Plans" sheet in the workbook (Deck, Kind,
     Card, Why; Kind is Option or Planned) is the owner's own place for them; an --adjust file
     overrides it for the decks it names; the committed file is what carries them otherwise. */
  const listed=x=>typeof x==='string'?{card:x,why:''}:{card:String(x.card||'').trim(),why:String(x.why||'').trim(),...(x.quantity?{quantity:x.quantity}:{})};
  const plansSheet=sheet(workbook,'CrankMagic Plans'),fromSheet={};
  if(plansSheet){const ph=plansSheet.findIndex(r=>String(r[0]||'').trim()==='Deck');
    if(ph>=0){const PH=plansSheet[ph].map(x=>String(x||'').trim()),dC=PH.indexOf('Deck'),kC=PH.indexOf('Kind'),cC=PH.indexOf('Card'),wC=PH.indexOf('Why');
      for(const r of plansSheet.slice(ph+1)){const deck=String(r[dC]||'').trim(),kind=String(r[kC]||'').trim().toLowerCase(),card=String(r[cC]||'').trim();if(!DECKS.includes(deck)||!card)continue;
        const list=/^opt/.test(kind)?'options':/^(plan|add|in)/.test(kind)?'planned':null;if(!list){notes.push(`CrankMagic Plans: ${card} (${deck}) has Kind "${r[kC]}"; use Option or Planned.`);continue;}
        (fromSheet[deck]||={options:[],planned:[]})[list].push({card,why:wC>=0?String(r[wC]||'').trim():''});}}}
  for(const d of decks){
    const p=priorDeck(d.id),a=adjust?.[d.id],sh=fromSheet[d.id];
    const source=a?{options:a.options||[],planned:a.planned||[],from:'the adjustments file'}:sh?{...sh,from:'the CrankMagic Plans sheet'}:{options:p?.options||[],planned:p?.planned||[],from:'the committed file'};
    const options=[],planned=[];
    for(const raw of source.options){const o=listed(raw);o.card=canon(o.card);
      if(!targetOf[d.id].has(Live.fold(o.card))){notes.push(`${d.id}: ${o.card} cannot be flagged Option; it is not in the ${d.id} hundred (from ${source.from}).`);continue;}
      if(options.some(x=>Live.fold(x.card)===Live.fold(o.card)))continue;options.push(o);}
    for(const raw of source.planned){const o=listed(raw);o.card=canon(o.card);
      if(targetOf[d.id].has(Live.fold(o.card))){notes.push(`${d.id}: ${o.card} is already in the ${d.id} hundred, so it is a target, not a plan (from ${source.from}).`);continue;}
      if(upgradeKeys.has(d.id+'|'+Live.fold(o.card))){const u=upgrades.find(u=>u.deck===d.id&&Live.fold(u.card)===Live.fold(o.card));notes.push(`${d.id}: ${o.card} is already on the Upgrade Path for ${d.id} (comes in for ${u.replaces}), so it is attached there rather than planned twice.`);continue;}
      if(planned.some(x=>Live.fold(x.card)===Live.fold(o.card)))continue;planned.push(o);}
    if(options.length)d.options=options;if(planned.length)d.planned=planned;
  }
  ensure(!unresolved.size,`${unresolved.size} name${unresolved.size===1?'':'s'} could not be resolved against the catalog: ${[...unresolved].join('; ')}. Fix the spelling in the workbook (exact Scryfall names) or pass --scryfall with a dump that has them.`);

  const doc={format:Live.FORMAT,version:Live.VERSION,savedAt:now.toISOString().replace(/\.\d{3}Z$/,'Z'),workbook:basename(workbook),
    note:"Rob's live collection, built by tools/build-live-load.mjs from the Master workbook; CrankMagic → User Functions → Load Live reads this file. Card names are exact Scryfall names (double-faced cards use 'Front // Back'). decks[].cards is the 100-card target; owned.inDeck is what is physically in each deck box; owned.bench is everything else owned; ordered is in flight; buy is the outstanding shopping list; upgrades are optional ceiling cards with the slot each replaces; decks[].options are cards in the hundred flagged as the first to swap out; decks[].planned are cards meant to come into the deck that are not in its hundred yet. Rebuild from the workbook rather than editing quantities here; names, definitions, notes, options and planned lists are carried over per deck.",
    decks,owned:{inDeck,bench},ordered,buy,upgrades};
  Live.check(doc);
  const built=Live.build(doc,{Model,lookup});
  return {doc,notes,built};
}

/* The newest Master under data/source/, by the version in its name (v13 after v3). */
export async function newestWorkbook(){
  const dir=new URL('../data/source/',import.meta.url);
  const books=(await readdir(dir)).filter(f=>/Master.*\.xlsx$/i.test(f)&&!f.startsWith('~$')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  ensure(books.length,'No *Master*.xlsx under data/source/ and no workbook named.');
  return fileURLToPath(new URL(books[books.length-1],dir));
}
/* Same collection, ignoring the timestamp: what --check compares. */
export const same=(a,b)=>JSON.stringify({...a,savedAt:null})===JSON.stringify({...b,savedAt:null});

/* WHAT CHANGED, PER DECK, AGAINST THE COMMITTED FILE. Every line here should trace to a
   change Rob asked for; a difference he did not report goes back to him before the commit. */
export function diff(prior,doc){
  if(!prior)return ['No committed live-load.json to compare against.'];
  const lines=[],map=rows=>new Map(rows.map(r=>[Live.fold(r[0]),r]));
  const delta=(label,a,b)=>{const A=map(a),B=map(b),out=[],inn=[];for(const [k,r] of A)if(!B.has(k)||B.get(k)[1]!==r[1])out.push(`${r[0]} ${r[1]}${B.has(k)?'→'+B.get(k)[1]:''}`);for(const [k,r] of B)if(!A.has(k))inn.push(`${r[0]} ${r[1]}`);if(out.length||inn.length)lines.push(`  ${label}: −${out.length} +${inn.length}`+(out.length?`\n    out/changed: ${out.join('; ')}`:'')+(inn.length?`\n    in: ${inn.join('; ')}`:''));else lines.push(`  ${label}: unchanged`);};
  for(const d of doc.decks){const p=prior.decks.find(x=>x.id===d.id);lines.push(`${d.id} ${d.name}`);if(!p){lines.push('  new deck');continue;}
    delta('target',p.cards,d.cards);delta('in the box',prior.owned.inDeck[d.id]||[],doc.owned.inDeck[d.id]||[]);
    const names=list=>(list||[]).map(x=>typeof x==='string'?x:x.card).join('; ')||'none';
    if(names(p.options)!==names(d.options))lines.push(`  options: ${names(d.options)}`);if(names(p.planned)!==names(d.planned))lines.push(`  planned: ${names(d.planned)}`);}
  lines.push('Whole collection');delta('bench',prior.owned.bench,doc.owned.bench);delta('ordered',prior.ordered,doc.ordered);delta('buy',prior.buy,doc.buy);
  const cost=rows=>rows.reduce((n,r)=>n+(Number.isFinite(r[2])?r[1]*r[2]:0),0);lines.push(`  buy list: ${doc.buy.reduce((n,r)=>n+r[1],0)} copies, ${money(cost(doc.buy))} (was ${prior.buy.reduce((n,r)=>n+r[1],0)} copies, ${money(cost(prior.buy))})`);
  const uk=u=>u.deck+'|'+Live.fold(u.card);const pu=new Set(prior.upgrades.map(uk)),nu=new Set(doc.upgrades.map(uk));lines.push(`  upgrades: ${doc.upgrades.length} (−${[...pu].filter(k=>!nu.has(k)).length} +${[...nu].filter(k=>!pu.has(k)).length})`);
  return lines;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;},check=args.includes('--check');
  const positional=args.filter((a,i)=>!a.startsWith('--')&&!['--adjust','--scryfall','--out'].includes(args[i-1]));
  const out=flag('--out')?pathToFileURL(flag('--out')):SOURCE;
  try{
    const workbook=positional[0]||await newestWorkbook();
    const prior=await readFile(out,'utf8').then(JSON.parse).catch(()=>null);
    const adjust=flag('--adjust')?JSON.parse(await readFile(flag('--adjust'),'utf8')):null;
    const scryfall=flag('--scryfall')?JSON.parse(await readFile(flag('--scryfall'),'utf8')):null;
    const {doc,notes,built}=await importWorkbook(workbook,{prior,adjust,scryfall});
    console.log(`live-load from ${doc.workbook}: ${doc.decks.length} decks · ${doc.owned.bench.length} bench rows · ${doc.ordered.length} ordered rows · ${doc.buy.length} buy rows · ${doc.upgrades.length} upgrades · options ${doc.decks.reduce((n,d)=>n+(d.options||[]).length,0)} · planned ${doc.decks.reduce((n,d)=>n+(d.planned||[]).length,0)}`);
    for(const n of notes)console.log('  note: '+n);
    console.log(diff(prior,doc).join('\n'));
    console.log(describe(built));
    if(!check){await writeFile(out,JSON.stringify(doc,null,1)+'\n');console.log(`Wrote ${fileURLToPath(out)}`);}
    else if(prior&&same(prior,doc))console.log(`${fileURLToPath(out)} is up to date with ${doc.workbook}.`);
    else{console.error(`live-load: ${fileURLToPath(out)} is ${prior?'stale against':'missing for'} ${doc.workbook}; run without --check to rebuild it.`);process.exit(1);}
  }catch(err){console.error('live-load: '+err.message);process.exit(1);}
}
