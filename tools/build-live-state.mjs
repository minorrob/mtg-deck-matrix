/* The saved state, from the file a person can edit.
 *
 *   node tools/build-live-state.mjs                       # data/live-load.json -> data/live-state.json
 *   node tools/build-live-state.mjs --check               # build and report, write nothing
 *   node tools/build-live-state.mjs --scryfall cache.json # enrich identities from a Scryfall dump
 *
 * data/live-load.json is the owner's collection in the owner's words (deck targets, what
 * is in each box, the bench, orders, the buy list, the upgrades). This turns it into
 * data/live-state.json: a complete CrankMagic backup -- the same format "Save a backup
 * file" writes and "Restore from a backup file" reads, checksum and all -- so the app
 * needs nothing new to load it. Every name is resolved against the bundled catalog, the
 * library is built through the collection model (tools/live-load.js), and the result is
 * validated before it is written. A --scryfall file (a JSON object keyed by card name,
 * holding raw Scryfall card objects) fills in rules text, prices and images for the
 * identities the bundled universe knows only as rows.
 *
 * Exit code 1 when the file cannot build at all. Issues that still build (a deck left as
 * a draft, a buy-list disagreement) are printed and the exit code stays 0. */
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const Catalog=require('../card-catalog.js'),Model=require('../collection-model.js'),Exchange=require('../collection-exchange.js'),Scryfall=require('../scryfall-client.js'),Live=require('./live-load.js');

export const SOURCE=new URL('../data/live-load.json',import.meta.url), TARGET=new URL('../data/live-state.json',import.meta.url);

export async function bundledLookup({scryfall=null}={}){
  const read=async f=>JSON.parse(await readFile(new URL('../data/'+f,import.meta.url),'utf8'));
  const universe=await read('commander-universe.json'),cards=await read('cards.json'),flavors=await read('flavor-names.json');
  const byName=new Map(),add=raw=>{const prior=byName.get(Catalog.folded(raw.name));const next=Catalog.normalize(raw,prior||{});byName.set(Catalog.folded(next.name),next);return next;};
  for(const [name,ci,rarity,mv,type,rank,commander] of universe.cards)add({name,ci,rarity,mv,type,rank,commander:!!commander,verified:true,legalities:{commander:'legal'},updatedAt:universe.generatedAt});
  for(const c of cards.cards)add(c);
  if(scryfall){const stamp=new Date().toISOString();for(const raw of Object.values(scryfall)){if(!raw||raw.object!=='card')continue;add({...Scryfall.normalizeCard(raw),verified:true,source:'Scryfall exact name',updatedAt:stamp});}}
  /* A REBUILD NEVER LOSES A PRICE THE COMMITTED FILE HAD. The bundled catalog prices about
     four in five of the live cards; the rest were priced by a Scryfall fetch handed to this
     tool once with --scryfall. A rebuild run without that file used to drop those prices --
     124 of them, and the Shop's total with them -- so the committed state is read first and
     every price it carries is kept unless the run brings a fresher one. */
  try{const prior=JSON.parse(await readFile(TARGET,'utf8'));const cards=prior&&prior.payload&&prior.payload.state&&prior.payload.state.cards||{};
    for(const c of Object.values(cards)){if(!Number.isFinite(c.price))continue;const have=byName.get(Catalog.folded(c.name));if(have&&!Number.isFinite(have.price))add({...have,price:c.price,priceUpdated:c.priceUpdated||have.priceUpdated,priceSource:c.priceSource||have.priceSource,cheapestSet:c.cheapestSet||have.cheapestSet,printings:c.printings||have.printings});}}
  catch{/* No committed file yet: nothing to carry forward. */}
  const alias=new Map();for(const [flavor,name] of flavors.cards||[]){const c=byName.get(Catalog.folded(name));if(c&&!byName.has(Catalog.folded(flavor)))alias.set(Catalog.folded(flavor),c);}
  const byFront=new Map();for(const c of byName.values()){const f=Catalog.folded(Live.front(c.name));if(f!==Catalog.folded(c.name)&&!byFront.has(f))byFront.set(f,c);}
  return name=>{const k=Catalog.folded(name);return byName.get(k)||alias.get(k)||byFront.get(k)||null;};
}

export async function buildFile(source=SOURCE,{scryfall=null}={}){
  const doc=JSON.parse(await readFile(source,'utf8'));
  const lookup=await bundledLookup({scryfall});
  const built=Live.build(doc,{Model,lookup});
  const backup=await Exchange.backup({state:built.state,history:[]});
  backup.note=`Built from data/live-load.json (saved ${doc.savedAt||'undated'}) by tools/build-live-state.mjs. Restore it in CrankMagic with User Functions → Restore from a backup file, or Load Live.`;
  return {...built,doc,backup};
}

export function describe({summary,issues}){
  const lines=[`live-state: ${summary.decks} decks · ${summary.cards} identities · ${summary.lots} copy records · ${summary.owned} owned (${summary.inDeck} in deck boxes) · ${summary.ordered} ordered · ${summary.toBuy} to buy · ${summary.upgrades} upgrades`];
  for(const r of summary.readiness)lines.push(`  ${r.deck}: ${r.status} · owned ${r.owned}/${r.target} · ordered ${r.ordered} · to buy ${r.toBuy} · ${r.ready?'READY':'not ready'}`);
  if(issues.length){lines.push(`${issues.length} issue${issues.length===1?'':'s'}:`);for(const i of issues)lines.push('  - '+i);}else lines.push('No issues.');
  return lines.join('\n');
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const args=process.argv.slice(2),check=args.includes('--check'),at=args.indexOf('--scryfall');
  const scryfall=at>=0?JSON.parse(await readFile(args[at+1],'utf8')):null;
  const positional=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--scryfall');
  try{
    const out=await buildFile(positional[0]?pathToFileURL(positional[0]):SOURCE,{scryfall});
    console.log(describe(out));
    if(!check){await writeFile(TARGET,JSON.stringify(out.backup)+'\n');console.log(`Wrote ${TARGET.pathname} (checksum ${out.backup.checksum.slice(0,12)}…)`);}
  }catch(err){console.error('live-state: '+err.message);process.exit(1);}
}
