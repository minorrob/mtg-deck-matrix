import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
const F='C:/Users/robmi/CrankMagic/forge';
const files=[];(function walk(d){for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.txt'))files.push(p);}})(join(F,'forge-gui/res/cardsfolder'));
const per=[];const count={apis:{},tr:{},st:{},re:{},kw:{}};
for(const p of files){const t=readFileSync(p,'utf8');const c={apis:new Set(),tr:new Set(),st:new Set(),re:new Set(),kw:new Set()};
  for(const raw of t.split(/\r?\n/)){const l=raw.trim();let m;
    for(const x of l.matchAll(/\b(AB|SP|DB)\$\s*([A-Za-z0-9]+)/g))c.apis.add(x[2]);
    if((m=l.match(/^T:Mode\$\s*([A-Za-z0-9]+)/)))c.tr.add(m[1]);
    if((m=l.match(/^S:Mode\$\s*([A-Za-z0-9]+)/)))c.st.add(m[1]);
    if((m=l.match(/^R:Event\$\s*([A-Za-z0-9]+)/)))c.re.add(m[1]);
    if((m=l.match(/^K:([A-Za-z][A-Za-z ']*?)(?::|$| \d)/)))c.kw.add(m[1].trim());}
  for(const k of Object.keys(count))for(const v of c[k])count[k][v]=(count[k][v]||0)+1;per.push(c);}
const rank=k=>Object.entries(count[k]).sort((a,b)=>b[1]-a[1]);
function vocab(nApis,minOther){const v={apis:new Set(rank('apis').slice(0,nApis).map(([k])=>k))};for(const k of ['tr','st','re','kw'])v[k]=new Set(rank(k).filter(([,c])=>c>=minOther).map(([x])=>x));
  const inSet=per.filter(c=>Object.keys(v).every(k=>[...c[k]].every(x=>v[k].has(x))));
  return {apis:nApis,minOther,sizes:{triggers:v.tr.size,statics:v.st.size,replacements:v.re.size,keywords:v.kw.size},cards:inSet.length,pct:(inSet.length/per.length*100).toFixed(1)};}
for(const [n,m] of [[40,20],[40,10],[40,5],[80,10],[80,5],[80,1],[192,1]])console.log(JSON.stringify(vocab(n,m)));
