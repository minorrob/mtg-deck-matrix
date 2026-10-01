/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT THE ENGINE ACTUALLY HAS TO IMPLEMENT, COUNTED RATHER THAN GUESSED.
 *
 * docs/engine/PLAN.md section 12.4. This walks Forge card scripts and COUNTS THE CONSTRUCTS they
 * use across four pools -- Rob's seven decks, his whole library, the most-played 80% of Commander cards
 * (data/engine/top-cards.json, the ones to have loaded before any table asks), and every card Forge ships --
 * so the engine plan is scoped from a measurement instead of an impression. It is what produced
 * the figure the pivot decision rested on: the seven decks need 64 distinct effect APIs, and the
 * top 30 of those cover 90% of their 477 cards.
 *
 * IT READS FORGE AND COPIES NOTHING. The output is counts and names of constructs, which is a
 * measurement of a pool, not a translation of anyone's code. No script text is stored. That
 * distinction is the clean-room rule in docs/engine/ADR-001-own-engine.md and it is the reason
 * this file may exist at all.
 *
 * LOCAL ONLY. CI has no Forge, so nothing in the suite runs this; its OUTPUT is committed instead
 * (game/docs/engine-inventory.json) and that is what the plan and the tests read. Run it again
 * when the decks or the library move:
 *
 *   node game/tools/engine-inventory.mjs [--out <path>]
 */
import {readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const R=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const F=process.env.CRANKMAGIC_FORGE_ROOT||resolve(R,'../forge');
if(!existsSync(F)){console.error('This tool needs Forge as a measurement source. Set CRANKMAGIC_FORGE_ROOT, or clone Forge to '+F+'.');process.exit(2);}
const outArg=process.argv.indexOf('--out');
const OUT=outArg>0&&process.argv[outArg+1]?process.argv[outArg+1]:resolve(R,'game/docs/engine-inventory.json');
const {buildForgeCardIndex}=await import(new URL('../contracts/forge-card-index.mjs', import.meta.url));
const index=buildForgeCardIndex(F);
const BS=String.fromCharCode(92);
function parseScript(text){
  const out={apis:new Set(),triggers:new Set(),statics:new Set(),replacements:new Set(),keywords:new Set(),costs:new Set(),lines:0,params:new Set(),amounts:new Set()};
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line) continue; out.lines++;
    for(const m of line.matchAll(/\b(AB|SP|DB)\$\s*([A-Za-z0-9]+)/g)) out.apis.add(m[2]);
    let m;
    if((m=line.match(/^T:Mode\$\s*([A-Za-z0-9]+)/))) out.triggers.add(m[1]);
    if((m=line.match(/^S:Mode\$\s*([A-Za-z0-9]+)/))) out.statics.add(m[1]);
    if((m=line.match(/^R:Event\$\s*([A-Za-z0-9]+)/))) out.replacements.add(m[1]);
    if((m=line.match(/^K:([A-Za-z][A-Za-z ']*?)(?::|$| \d)/))) out.keywords.add(m[1].trim());
    for(const c of line.matchAll(/Cost\$\s*([^|]+)/g)) for(const tok of c[1].trim().split(/\s+/)){ const t=tok.replace(/<.*$/,'').replace(/^[0-9]+$/,'GENERIC').replace(/^[WUBRGCXPS]$/,'MANA').replace(/^[WUBRG]\/[WUBRGP]$/,'MANA'); if(t) out.costs.add(t);}
    for(const p of line.matchAll(/\b([A-Z][A-Za-z0-9]+)\$/g)) out.params.add(p[1]);
    /* WHAT AN AMOUNT COUNTS, by the kind's name alone -- Valid (things matching a description), xPaid, CardCounters,
       Devotion -- so coverage can say which counts a card needs (engine-constructs.mjs FORGE_COUNTS). */
    for(const a of line.matchAll(/Count\$([A-Za-z]+)/g)) out.amounts.add(a[1]);
  }
  return out;
}
/* THE OPTIONS AND CONDITIONS a card's abilities carry -- "unless a player pays", an amount the game counts, a condition,
   "only once each turn", "up to N targets" -- which Forge writes as parameters rather than as effects or triggers. Kept
   per card, by name only, so coverage and the catalog can count them (engine-constructs.mjs FORGE_OPTIONS). */
const OPTION_PARAMS=new Set(['UnlessCost','Count','ConditionPresent','ConditionCompare','ConditionCheckSVar','ConditionSVarCompare','ConditionDefined','Condition',
  'CheckSVar','IsPresent','SVarCompare','PresentCompare','ActivationLimit','ActivationPhases','TargetMin','TargetMax','MayPlay','Duration','Optional','OptionalDecider',
  'RememberObjects','RememberChanged','Imprint']);
function tally(pool){
  const dims=['apis','triggers','statics','replacements','keywords','costs','params','amounts'];
  const counts=Object.fromEntries(dims.map(d=>[d,{}]));
  let vanilla=0, missing=[], perCard={};
  for(const [name,script] of pool){
    if(!script){missing.push(name);continue;}
    const p=parseScript(readFileSync(join(F,script),'utf8'));
    if(!p.apis.size&&!p.triggers.size&&!p.statics.size&&!p.replacements.size) vanilla++;
    perCard[name]={apis:[...p.apis],triggers:[...p.triggers],statics:[...p.statics],replacements:[...p.replacements],keywords:[...p.keywords],options:[...p.params].filter(k=>OPTION_PARAMS.has(k)).sort(),counts:[...p.amounts].sort()};
    for(const d of dims) for(const v of p[d]) counts[d][v]=(counts[d][v]||0)+1;
  }
  const sorted=Object.fromEntries(dims.map(d=>[d,Object.entries(counts[d]).sort((a,b)=>b[1]-a[1])]));
  return {cards:pool.size,missing,vanilla,distinct:Object.fromEntries(dims.map(d=>[d,sorted[d].length])),counts:sorted,perCard};
}
const state=JSON.parse(readFileSync(R+'/data/live-state.json','utf8')).payload.state;
const decks=Object.values(state.decks).filter(d=>!d.archived);
const deckPool=new Map(); const deckNames=[];
for(const d of decks){deckNames.push({name:d.name,cards:d.slots.filter(s=>s.purpose==='main').reduce((n,s)=>n+s.quantity,0)});
  for(const s of d.slots){const n=state.cards[s.cardId]?.name; if(!n) continue; const r=index.resolve(n); deckPool.set(n,r?r.script:null);}}
const cj=JSON.parse(readFileSync(R+'/data/cards.json','utf8'));
const arr=Array.isArray(cj)?cj:(cj.cards||cj.records||Object.values(cj).find(v=>Array.isArray(v))||Object.values(cj));
const libPool=new Map();
for(const c of arr){const n=c?.name; if(!n) continue; const r=index.resolve(n); libPool.set(n,r?r.script:null);}
/* The most-played cards that make up 80% of Commander decks (game/tools/engine-top-cards.mjs). */
const topPool=new Map();
for(const c of JSON.parse(readFileSync(R+'/data/engine/top-cards.json','utf8')).cards){const r=index.resolve(c.name); topPool.set(c.name,r?r.script:null);}
const allPool=new Map();
(function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name); if(e.isDirectory()) walk(p); else if(e.name.endsWith('.txt')) allPool.set(p,p.slice(F.length+1).split(BS).join('/'));}})(join(F,'forge-gui/res/cardsfolder'));
const A=tally(deckPool), B=tally(libPool), C=tally(allPool), D=tally(topPool);
function coverage(perCard, ranked){const order=ranked.map(([k])=>k);const res=[];for(const n of [10,20,30,40,50,60,80,100,120]){const set=new Set(order.slice(0,n));let ok=0,tot=0;for(const c of Object.values(perCard)){tot++;if(c.apis.every(a=>set.has(a)))ok++;}res.push([n,ok,tot]);}return res;}
const summary={decks:deckNames,deckPool:{cards:A.cards,missing:A.missing,vanilla:A.vanilla,distinct:A.distinct},libraryPool:{cards:B.cards,missing:B.missing.length,missingSample:B.missing.slice(0,20),vanilla:B.vanilla,distinct:B.distinct},forgeAll:{cards:C.cards,vanilla:C.vanilla,distinct:C.distinct},topPool:{cards:D.cards,missing:D.missing.length,missingSample:D.missing.slice(0,20),vanilla:D.vanilla,distinct:D.distinct},
  libCoverageByTopApis:coverage(B.perCard,B.counts.apis),deckCoverageByTopApis:coverage(A.perCard,A.counts.apis)};
console.log(JSON.stringify(summary,null,1));
for(const [label,T] of [['DECK',A],['LIBRARY',B]]) for(const d of ['apis','triggers','statics','replacements','keywords','costs']) console.log(`\n=== ${label} ${d} (${T.counts[d].length}) ===\n`+T.counts[d].map(([k,v])=>k+':'+v).join(' '));
console.log('\n=== FORGE ALL apis top 80 ===\n'+C.counts.apis.slice(0,80).map(([k,v])=>k+':'+v).join(' '));
console.log('\n=== FORGE ALL keywords top 60 ===\n'+C.counts.keywords.slice(0,60).map(([k,v])=>k+':'+v).join(' '));
delete C.perCard;
mkdirSync(dirname(OUT),{recursive:true});
writeFileSync(OUT,JSON.stringify({summary,deck:A,library:B,top:D,forge:C},null,1));
