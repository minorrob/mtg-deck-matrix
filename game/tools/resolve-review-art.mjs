import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const state=JSON.parse(readFileSync(resolve(root,'data/live-state.json'))).payload.state;
const publicNames=new Set(Object.values(state.cards).map(c=>c.name));
const review=JSON.parse(readFileSync(resolve(root,'game/.local/review/match.json')));
const missing=new Set();
for(const f of review.frames) for(const p of f.players) for(const z of Object.values(p.zones)) for(const c of z.cards) {
  if(!c.art&&!c.token&&c.name) missing.add(c.name);
}
const cards={};
for(const name of missing) {
  if(!publicNames.has(name)) throw new Error('Only the committed public deck fixture can use this resolver: '+name);
  const sourceUrl='https://api.scryfall.com/cards/named?exact='+encodeURIComponent(name);
  const r=await fetch(sourceUrl,{headers:{'User-Agent':'CrankMagicCommander/0.1 (personal public-fixture artwork resolver)',Accept:'application/json'}});
  if(!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const c=await r.json();
  if(c.name!==name||!c.oracle_id) throw new Error('Card identity mismatch: '+name);
  cards[name]={name,oracleId:c.oracle_id,scryfallId:c.id,normal:c.image_uris?.normal||c.card_faces?.[0]?.image_uris?.normal,
    typeLine:c.type_line,sourceUrl,fetchedAt:new Date().toISOString()};
  console.log(name);
  await new Promise(r=>setTimeout(r,125));
}
writeFileSync(resolve(root,'game/fixtures/review-art.json'),JSON.stringify({schema:'CommanderArtworkCache@1',cards},null,2)+'\n');
