/* Commander rank is not Scryfall's EDHREC card rank. Keep a separately dated
 * public popularity snapshot for Play Lab. Never writes simulator input files.
 * Run: node tools/commander-ranks.mjs; then bump its asset URL and manifest.
 *      node tools/commander-ranks.mjs --check   validate the committed file, fetch nothing */
import fs from 'node:fs/promises';
import {stamp} from './lib/envelope.mjs';
import {report, readData} from '../schema/index.mjs';
const FILE='data/commander-ranks.json';
const root=new URL('../',import.meta.url),base='https://json.edhrec.com/pages/';
if(process.argv.includes('--check')){
  const data=readData(FILE),rows=data.cards||[];
  const sorted=rows.every((c,i)=>!i||rows[i-1].rank<=c.rank),unique=new Set(rows.map(c=>c.name)).size===rows.length;
  if(!sorted||!unique){console.error(`${FILE}: rows must be sorted by rank and unique by name`);process.exit(1);}
  process.exit(report(FILE,data)?0:1);
}
let url=new URL('commanders/year.json',base),rows=[],pages=[],period='';
for(let page=0;page<10&&url;page++){
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw Error(`${url}: HTTP ${response.status}`);
  const data=await response.json(),list=data.container?.json_dict?.cardlists?.[0]||data;
  if(!Array.isArray(list.cardviews))throw Error('EDHREC ranking schema changed; prior snapshot is intact.');
  period=period||list.header;pages.push(url.href);
  rows.push(...list.cardviews.map(c=>({name:c.name,rank:c.rank,decks:c.num_decks,url:new URL(c.url,'https://edhrec.com').href})));
  url=list.more?new URL(list.more,base):null;
  if(url&&url.origin!==new URL(base).origin)throw Error('Unexpected pagination host.');
  if(url)await new Promise(r=>setTimeout(r,200));
}
rows=rows.filter(c=>c.rank<=1000).sort((a,b)=>a.rank-b.rank);
if(rows.length<100||rows.some(c=>!c.name||!Number.isInteger(c.rank)||!Number.isInteger(c.decks))||new Set(rows.map(c=>c.name)).size!==rows.length)throw Error('Invalid commander ranks; prior snapshot is intact.');
const out=stamp('commander-ranks@1','tools/commander-ranks.mjs',{source:'https://edhrec.com/commanders',period,pages,note:'Commander popularity, not card rank: the thousand most-played commanders of the year on EDHREC, kept as a separately dated public snapshot for the Lab. Refreshed by tools/commander-ranks.mjs.',cards:rows},{count:rows.length});
await fs.writeFile(new URL(FILE,root),JSON.stringify(out,null,2)+'\n');
console.log(`Saved ${rows.length} commander ranks (${period}) from ${pages.length} public pages.`);
