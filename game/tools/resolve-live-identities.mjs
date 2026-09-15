import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const state = JSON.parse(readFileSync(resolve(root,'data/live-state.json'))).payload.state;
const refs = new Set(Object.values(state.decks).flatMap(d=>d.slots.filter(s=>s.purpose==='main').map(s=>s.cardId)));
const cards = {};
for (const id of refs) {
  const ref = state.cards[id];
  if (ref.oracleId) continue;
  const url = 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(ref.name);
  const response = await fetch(url, {headers:{'User-Agent':'CrankMagicCommander/0.1 (personal local deck identity resolver)', Accept:'application/json'}});
  if (!response.ok) throw new Error(`${ref.name}: Scryfall ${response.status}`);
  const c = await response.json();
  if (!c.oracle_id || c.name !== ref.name) throw new Error(`Exact Oracle identity not confirmed: ${ref.name}`);
  cards[ref.name] = {name:c.name, oracleId:c.oracle_id, scryfallId:c.id, sourceUrl:url,
    fetchedAt:new Date().toISOString(), colorIdentity:c.color_identity, typeLine:c.type_line,
    normal:c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null,
    faces:(c.card_faces||[]).map(f=>({name:f.name,normal:f.image_uris?.normal||null}))};
  console.log(ref.name + ': ' + c.oracle_id);
  await new Promise(r=>setTimeout(r,125));
}
const out = resolve(root,'game/fixtures');
mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'live-identities.json'),JSON.stringify({schema:'CommanderIdentityCache@1',cards},null,2)+'\n');
