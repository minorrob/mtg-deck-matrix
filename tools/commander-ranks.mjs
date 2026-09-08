/* Commander rank is not Scryfall's EDHREC card rank. Keep a separately dated
 * public popularity snapshot for Play Lab. Never writes simulator input files.
 * Run: node tools/commander-ranks.mjs; then bump its asset URL and manifest. */
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),base='https://json.edhrec.com/pages/';
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
await fs.writeFile(new URL('data/commander-ranks.json',root),JSON.stringify({generatedAt:new Date().toISOString(),source:'https://edhrec.com/commanders',period,pages,note:'Commander popularity, not card inclusion rank or power. Combined commander pairs retain their combined identity.',cards:rows},null,2)+'\n');
console.log(`Saved ${rows.length} commander ranks (${period}) from ${pages.length} public pages.`);
