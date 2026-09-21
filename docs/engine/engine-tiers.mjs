import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
const F='C:/Users/robmi/CrankMagic/forge';
const files=[];(function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.txt'))files.push(p);}})(join(F,'forge-gui/res/cardsfolder'));
const per=[];const apiCount={};
for(const p of files){const t=readFileSync(p,'utf8');const c={apis:new Set(),tr:new Set(),st:new Set(),re:new Set(),kw:new Set()};
  for(const raw of t.split(/\r?\n/)){const l=raw.trim();let m;
    for(const x of l.matchAll(/\b(AB|SP|DB)\$\s*([A-Za-z0-9]+)/g))c.apis.add(x[2]);
    if((m=l.match(/^T:Mode\$\s*([A-Za-z0-9]+)/)))c.tr.add(m[1]);
    if((m=l.match(/^S:Mode\$\s*([A-Za-z0-9]+)/)))c.st.add(m[1]);
    if((m=l.match(/^R:Event\$\s*([A-Za-z0-9]+)/)))c.re.add(m[1]);
    if((m=l.match(/^K:([A-Za-z][A-Za-z ']*?)(?::|$| \d)/)))c.kw.add(m[1].trim());}
  for(const a of c.apis)apiCount[a]=(apiCount[a]||0)+1;per.push(c);}
const rank=Object.entries(apiCount).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
function tier(n){const s=new Set(rank.slice(0,n));const cards=per.filter(c=>[...c.apis].every(a=>s.has(a)));
  const cnt=k=>{const m={};for(const c of cards)for(const v of c[k])m[v]=(m[v]||0)+1;return Object.entries(m).sort((a,b)=>b[1]-a[1]);};
  const closure=(k)=>{const r=cnt(k);let acc=0;const out=[];for(const [v,c] of r){out.push(v);}return {distinct:r.length,ge20:r.filter(([,c])=>c>=20).length,ge5:r.filter(([,c])=>c>=5).length};};
  return {n,cards:cards.length,pct:(cards.length/per.length*100).toFixed(1),triggers:closure('tr'),statics:closure('st'),replacements:closure('re'),keywords:closure('kw')};}
console.log(JSON.stringify([tier(40),tier(80),tier(192)],null,1));
console.log('TOP40',rank.slice(0,40).join(' '));console.log('NEXT40',rank.slice(40,80).join(' '));console.log('REST',rank.slice(80).length,rank.slice(80).join(' '));
