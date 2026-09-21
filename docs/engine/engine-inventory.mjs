import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const R='C:/Users/robmi/CrankMagic/repo', F='C:/Users/robmi/CrankMagic/forge';
const OUT='C:/Users/robmi/AppData/Local/Temp/claude/C--Users-robmi/7acc4d27-5580-4f28-8270-45cd9335ebe1/scratchpad/inventory.json';
const {buildForgeCardIndex}=await import('file:///C:/Users/robmi/CrankMagic/repo/game/contracts/forge-card-index.mjs');
const index=buildForgeCardIndex(F);
const BS=String.fromCharCode(92);
function parseScript(text){
  const out={apis:new Set(),triggers:new Set(),statics:new Set(),replacements:new Set(),keywords:new Set(),costs:new Set(),lines:0,params:new Set()};
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
  }
  return out;
}
function tally(pool){
  const dims=['apis','triggers','statics','replacements','keywords','costs','params'];
  const counts=Object.fromEntries(dims.map(d=>[d,{}]));
  let vanilla=0, missing=[], perCard={};
  for(const [name,script] of pool){
    if(!script){missing.push(name);continue;}
    const p=parseScript(readFileSync(join(F,script),'utf8'));
    if(!p.apis.size&&!p.triggers.size&&!p.statics.size&&!p.replacements.size) vanilla++;
    perCard[name]={apis:[...p.apis],triggers:[...p.triggers],statics:[...p.statics],replacements:[...p.replacements],keywords:[...p.keywords]};
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
const allPool=new Map();
(function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name); if(e.isDirectory()) walk(p); else if(e.name.endsWith('.txt')) allPool.set(p,p.slice(F.length+1).split(BS).join('/'));}})(join(F,'forge-gui/res/cardsfolder'));
const A=tally(deckPool), B=tally(libPool), C=tally(allPool);
function coverage(perCard, ranked){const order=ranked.map(([k])=>k);const res=[];for(const n of [10,20,30,40,50,60,80,100,120]){const set=new Set(order.slice(0,n));let ok=0,tot=0;for(const c of Object.values(perCard)){tot++;if(c.apis.every(a=>set.has(a)))ok++;}res.push([n,ok,tot]);}return res;}
const summary={decks:deckNames,deckPool:{cards:A.cards,missing:A.missing,vanilla:A.vanilla,distinct:A.distinct},libraryPool:{cards:B.cards,missing:B.missing.length,missingSample:B.missing.slice(0,20),vanilla:B.vanilla,distinct:B.distinct},forgeAll:{cards:C.cards,vanilla:C.vanilla,distinct:C.distinct},
  libCoverageByTopApis:coverage(B.perCard,B.counts.apis),deckCoverageByTopApis:coverage(A.perCard,A.counts.apis)};
console.log(JSON.stringify(summary,null,1));
for(const [label,T] of [['DECK',A],['LIBRARY',B]]) for(const d of ['apis','triggers','statics','replacements','keywords','costs']) console.log(`\n=== ${label} ${d} (${T.counts[d].length}) ===\n`+T.counts[d].map(([k,v])=>k+':'+v).join(' '));
console.log('\n=== FORGE ALL apis top 80 ===\n'+C.counts.apis.slice(0,80).map(([k,v])=>k+':'+v).join(' '));
console.log('\n=== FORGE ALL keywords top 60 ===\n'+C.counts.keywords.slice(0,60).map(([k,v])=>k+':'+v).join(' '));
delete C.perCard;
writeFileSync(OUT,JSON.stringify({summary,deck:A,library:B,forge:C},null,1));
