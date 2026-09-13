#!/usr/bin/env node
/* A Scryfall dump for every card the Load Live file names, in the shape build-live-state.mjs
 * takes with --scryfall: a JSON object keyed by exact card name, holding raw Scryfall card
 * objects. The bundled catalog knows every Commander-legal card by name, colour and type,
 * but for a couple of hundred of Rob's cards it has no rules text, price or image; this
 * fills them in so the library the app loads is complete offline.
 *
 *   node tools/scryfall-cache.mjs [--out cache.json] [live-load.json]
 *
 * Best effort by design: a name Scryfall does not answer for is listed and skipped, and a
 * network failure exits non-zero with nothing written, so the caller can build without it. */
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),Live=require('./live-load.js');
const UA={'User-Agent':'MtgDeckMatrix/1.0 (+https://github.com/minorrob/mtg-deck-matrix)',Accept:'application/json','Content-Type':'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export async function fetchCache(names){
  const cache={},missing=[];
  for(let i=0;i<names.length;i+=75){
    const batch=names.slice(i,i+75);
    const res=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:UA,body:JSON.stringify({identifiers:batch.map(name=>({name:Live.front(name)}))})});
    if(!res.ok)throw Error(`Scryfall responded ${res.status}`);
    const data=await res.json();
    for(const c of data.data||[])cache[c.name]=c;
    for(const nf of data.not_found||[])missing.push(nf.name);
    await sleep(130);
  }
  return {cache,missing};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const args=process.argv.slice(2),at=args.indexOf('--out'),out=at>=0?args[at+1]:'scryfall-cache.json';
  const source=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--out')[0]||new URL('../data/live-load.json',import.meta.url);
  try{
    const doc=JSON.parse(await readFile(source,'utf8'));
    const {cache,missing}=await fetchCache(Live.names(doc));
    await writeFile(out,JSON.stringify(cache));
    console.log(`scryfall-cache: ${Object.keys(cache).length} cards written to ${out}`+(missing.length?`; not on Scryfall by that name: ${missing.join('; ')}`:''));
  }catch(err){console.error('scryfall-cache: '+err.message);process.exit(1);}
}
