import {defaultPlaymat,validPlaymat,resolvePlaymat} from '../ui/playmats.mjs';
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomInt,randomUUID} from 'node:crypto';
import {snapshotLibraryDeck,canonical,sha256} from '../contracts/deck-snapshot.mjs';
import {parseMoxfieldTwoColumn} from '../contracts/moxfield-import.mjs';
import {compatibility} from './ai-compatibility.mjs';
import {OPENAI_MODELS} from './windows-credential.mjs';
const require=createRequire(import.meta.url),Builder=require('../../draft-builder.js'),Sources=require('../../deck-sources.js');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),read=p=>JSON.parse(readFileSync(resolve(root,p)));
const state=read('data/live-state.json').payload.state,cardFile=read('data/cards.json'),identities=read('game/fixtures/live-identities.json').cards;
const byName=new Map(cardFile.cards.map(c=>[c.name,{...c,id:c.oracleId}]));
for(const c of Object.values(state.cards))byName.set(c.name,{...c,...byName.get(c.name),oracleId:byName.get(c.name)?.oracleId||c.oracleId||identities[c.name]?.oracleId});
const definitionCache=resolve(root,'game/.local/card-definitions.json');
if(existsSync(definitionCache))for(const [name,c]of Object.entries(JSON.parse(readFileSync(definitionCache))))byName.set(name,{...byName.get(name),...c});
for(const [name,c]of byName)byName.set(name,{...c,id:c.oracleId||name,verified:!!c.oracleId&&!!c.legalities});
const facts=Object.fromEntries([...byName].map(([name,c])=>[name,{...c,normal:c.image,small:c.imageSmall}]));
const variants=read('data/archive/variants.json').variants,rungs=read('data/archive/rung-lists.json').variants;
const decks=[];
for(const d of Object.values(state.decks).filter(d=>!d.archived)){
  const snap=snapshotLibraryDeck(state,d.id,{facts,identities,sourceRevision:'local-setup-catalog',capturedAt:cardFile.generatedAt});
  decks.push({id:d.id,name:d.name,source:'library',commander:snap.commanders[0].name,rows:[...snap.commanders,...snap.library],commanders:snap.commanders.map(c=>c.name),snapshot:snap});
}
for(const v of variants)for(const [rung,rows]of Object.entries(rungs[v.id]||{}))decks.push({id:`archive:${v.id}:${rung}`,name:`${v.name} · ${rung}`,source:'preloaded',commander:v.commander,commanders:[v.commander],rows,variantId:v.id,rung});
const number=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
export function assess(deck,config){
  const problems=[],rows=deck.rows.map(c=>({...byName.get(c.name),...c,price:number(byName.get(c.name)?.price)}));
  const count=rows.reduce((n,c)=>n+c.quantity,0);if(count!==100)problems.push(`Expected 100 cards; found ${count}`);
  const unknown=rows.filter(c=>c.price===null);const cost=rows.reduce((n,c)=>n+(c.price||0)*c.quantity,0);
  if(unknown.length)problems.push(`Missing prices: ${unknown.map(c=>c.name).join(', ')}`);
  if(cost>config.maxCost)problems.push(`$${cost.toFixed(2)} exceeds the $${config.maxCost} table cap`);
  const gc=rows.reduce((n,c)=>n+(c.gameChanger?c.quantity:0),0),cap=config.bracket<=2?0:config.bracket===3?3:Infinity;
  if(gc>cap)problems.push(`${gc} Game Changers exceed bracket ${config.bracket}'s cap`);
  const missing=rows.filter(c=>!c.oracleId);if(missing.length)problems.push(`Unresolved identities: ${missing.map(c=>c.name).join(', ')}`);
  return {ok:!problems.length,problems,total:count,cost:Math.round(cost*100)/100,gameChangers:gc,priceAsOf:cardFile.generatedAt};
}
export async function importWorkshopDeck(input){
  if(input?.schema!=='CrankMagicDeckHandoff@1'||typeof input.name!=='string'||input.name.length>180||!Array.isArray(input.rows)||input.rows.length>100||!Array.isArray(input.commanders)||input.commanders.length<1||input.commanders.length>2)throw Error('Invalid CrankMagic deck snapshot');
  if(input.sourceDeckId!==undefined&&(typeof input.sourceDeckId!=='string'||!input.sourceDeckId||input.sourceDeckId.length>300))throw Error('Invalid source deck identity');
  if(input.sourceRevision!==undefined&&(!Number.isSafeInteger(input.sourceRevision)||input.sourceRevision<0))throw Error('Invalid source deck revision');
  if(input.sourceDeckVersion!==undefined&&(!Number.isSafeInteger(input.sourceDeckVersion)||input.sourceDeckVersion<1))throw Error('Invalid source deck version');
  const rows=[...input.rows,...input.commanders.map(name=>({name,quantity:1}))];
  if(rows.some(c=>typeof c.name!=='string'||!c.name.trim()||c.name.length>200||!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>100)||rows.reduce((n,c)=>n+c.quantity,0)!==100)throw Error('Your snapshot must contain exactly 100 cards including commander(s)');
  if(new Set(input.commanders).size!==input.commanders.length||input.rows.some(c=>input.commanders.includes(c.name)))throw Error('Commander appears twice in the snapshot');
  const merged=new Map();for(const row of rows)merged.set(row.name,(merged.get(row.name)||0)+row.quantity);
  const normalized=[...merged].map(([name,quantity])=>({name,quantity}));await hydrate(normalized);
  const d={id:`handoff:${randomUUID()}`,source:'library',name:input.name,commander:input.commanders[0],commanders:[...input.commanders],rows:normalized,sourceDeckId:input.sourceDeckId||null,sourceRevision:input.sourceRevision??null,sourceDeckVersion:input.sourceDeckVersion??null};
  d.snapshot=snapshot(d);decks.push(d);
  return {id:d.id,name:d.name,commander:d.commander,deckHash:d.snapshot.gameplayHash};
}
export function setupCatalog(){return {schema:'CommanderSetupCatalog@1',variantCount:variants.length,rungCount:decks.filter(d=>d.source==='preloaded').length,priceAsOf:cardFile.generatedAt,
  commanders:[...byName.values()].filter(c=>c.isCommander||c.commander||decks.some(d=>d.commander===c.name)).map(c=>({name:c.name,image:c.image,colors:c.colorIdentity||[]})).sort((a,b)=>a.name.localeCompare(b.name)),
  decks:decks.map(d=>({id:d.id,name:d.name,source:d.source,commander:d.commander,rung:d.rung||null,...assess(d,{bracket:5,maxCost:10000})})),
  defaults:{bracket:3,maxCost:225,humans:1,ais:3,seats:[{seatId:0,kind:'human',deckId:'deck:live:D2',source:'library',commanderMode:'selected',commander:'Chulane, Teller of Tales',name:'Rob'},...['D6','D3','D5'].map((id,i)=>({seatId:i+1,kind:'ai',deckId:`deck:live:${id}`,source:'library',commanderMode:'selected',commander:decks.find(d=>d.id.endsWith(':'+id))?.commander,name:['Krenko','Atraxa','Shadrix'][i],nativeProfile:'Default',difficulty:3}))]}};}
export function validateSetup(c){
  if(!c||!Number.isInteger(c.bracket)||c.bracket<1||c.bracket>5)throw Error('Select a bracket from 1–5');
  if(!Number.isFinite(c.maxCost)||c.maxCost<1||c.maxCost>10000)throw Error('Deck cost cap must be $1–$10,000');
  if(!Number.isInteger(c.humans)||c.humans<1||c.humans>4||!Number.isInteger(c.ais)||c.ais<0||c.ais>3||c.humans+c.ais<2||c.humans+c.ais>4)throw Error('Commander needs 2–4 total players with at least one human');
  if(!Array.isArray(c.seats)||c.seats.length!==c.ais+c.humans)throw Error('Seat count does not match the selected player counts');
  for(const [i,s]of c.seats.entries()){
    if(s.seatId!==i||!['library','preloaded','lab','archidekt'].includes(s.source)||!['selected','random'].includes(s.commanderMode))throw Error('Invalid seat or deck source');
    const kind=s.kind||(i<c.humans?'human':'ai');if(kind!==(i<c.humans?'human':'ai'))throw Error('Seat type does not match player counts');
    const validModel=s.aiProvider==='openai'?OPENAI_MODELS.includes(s.aiModel):s.aiProvider==='anthropic'?s.aiModel==='claude-haiku-4-5-20251001':s.aiModel===undefined||s.aiModel===null;
    if(kind==='ai'&&(!['Default','Cautious','Reckless'].includes(s.nativeProfile)||!Number.isInteger(s.difficulty)||s.difficulty<1||s.difficulty>5||![undefined,null,'openai','anthropic'].includes(s.aiProvider)||!validModel))throw Error('Invalid AI profile, provider, model, or difficulty');
    if(typeof s.name!=='string'||s.name.length>100||/[\r\n]/.test(s.name))throw Error('Invalid player name');
  }
}
function snapshot(d){
  if(d.snapshot)return d.snapshot;
  const cards={},slots=[];for(const row of d.rows){const c=byName.get(row.name);if(!c?.oracleId)throw Error(`Cannot resolve ${row.name}`);cards[c.id]={...c};slots.push({cardId:c.id,quantity:row.quantity,purpose:'main'});}
  const model={id:d.id,name:d.name,version:1,commanders:d.commanders.map(n=>byName.get(n)?.id),slots};
  return snapshotLibraryDeck({decks:[model],cards},d.id,{facts,identities,sourceRevision:d.source,capturedAt:new Date().toISOString()});
}
async function hydrate(rows){
  const missing=[...new Set(rows.map(c=>c.name))].filter(name=>!byName.get(name)?.oracleId||!byName.get(name)?.oracleText);
  if(!missing.length)return;
  const saved=existsSync(definitionCache)?JSON.parse(readFileSync(definitionCache)):{};
  for(let i=0;i<missing.length;i+=75){
    const batch=missing.slice(i,i+75),response=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'CrankMagic-Local-Commander/0.1','Accept':'application/json'},body:JSON.stringify({identifiers:batch.map(name=>identities[name]?.scryfallId?{id:identities[name].scryfallId}:{name:name.split(' // ')[0]})}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(`Card mechanics lookup failed: HTTP ${response.status}`);const result=await response.json();
    for(const name of batch){const c=result.data?.find(c=>c.oracle_id===byName.get(name)?.oracleId||c.name===name||c.card_faces?.[0]?.name===name.split(' // ')[0]);if(!c)throw Error(`Card definition unresolved: ${name}`);
      const old=byName.get(name)||{},art=c.image_uris||c.card_faces?.[0]?.image_uris||{};
      const def={...old,name,oracleId:c.oracle_id,id:c.oracle_id,verified:true,typeLine:c.type_line,oracleText:c.oracle_text||c.card_faces?.map(f=>`${f.name}: ${f.oracle_text||''}`).join('\n')||'',keywords:c.keywords||[],colorIdentity:c.color_identity||[],legalities:c.legalities,price:old.price??number(c.prices?.usd),image:art.normal,imageSmall:art.small,isCommander:old.isCommander||/Legendary.*Creature/.test(c.type_line),definitionSource:`https://api.scryfall.com/cards/${c.id}`,definitionCapturedAt:new Date().toISOString(),faces:c.card_faces||[]};
      byName.set(name,def);facts[name]={...def,normal:def.image,small:def.imageSmall};saved[name]=def;
    }
  }
  mkdirSync(dirname(definitionCache),{recursive:true});writeFileSync(definitionCache,JSON.stringify(saved,null,2));
}
function mechanicsSnapshot(deck){
  const cards=[...deck.commanders,...deck.library].map(row=>{const c=byName.get(row.name);return {oracleId:row.oracleId,name:row.name,quantity:row.quantity,typeLine:c.typeLine,oracleText:c.oracleText||'',faces:c.faces||[],keywords:c.keywords||[],mechanics:c.mechanics||[],causes:c.causes||[],produces:c.produces||[],triggers:c.triggers||[],source:c.definitionSource||'data/cards.json + live-state catalog',capturedAt:c.definitionCapturedAt||cardFile.generatedAt,interpretation:'printed/cached capabilities; not evidence of fired mechanics'};});
  const value={schema:'CommanderCardMechanics@1',deckHash:deck.gameplayHash,cards};return {...value,hash:sha256(canonical(value))};
}
async function getJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'},redirect:'error'});if(!r.ok)throw Error(`Deck service returned HTTP ${r.status}`);const text=await r.text();if(text.length>8_000_000)throw Error('Deck response is too large');return JSON.parse(text);}
async function archidekt(s,c){
  let ids=[];
  if(s.archidektUrl){const u=new URL(s.archidektUrl);if(u.protocol!=='https:'||!['archidekt.com','www.archidekt.com'].includes(u.hostname)||!/^\/decks\/\d+/.test(u.pathname))throw Error('Use an HTTPS Archidekt deck URL');ids=[u.pathname.match(/\/decks\/(\d+)/)[1]];}
  else{const url=new URL('https://archidekt.com/api/decks/v3/');url.search=new URLSearchParams({commanderName:s.commander,deckFormat:'3',pageSize:'12',orderBy:'-updatedAt'});const result=await getJSON(url);ids=(result.results||[]).slice(0,12).map(d=>d.id);}
  const rejected=[];
  for(const id of ids){
    try{const json=await getJSON(`https://archidekt.com/api/decks/${id}/`),parsed=Sources.fromArchidekt(json,{url:`https://archidekt.com/decks/${id}`});
      if(!parsed.commander.includes(s.commander))throw Error('Commander does not match');
      const d={id:`archidekt:${id}`,name:parsed.name,source:'archidekt',commanders:parsed.commander,commander:s.commander,rows:parsed.cards.map(x=>({name:x.name,quantity:x.quantity})),url:parsed.sourceUrl};
      await hydrate(d.rows);const check=assess(d,c);if(!check.ok)throw Error(check.problems.join('; '));return d;
    }catch(e){rejected.push(`${id}: ${e.message}`);}
  }
  throw Error(`No verified Archidekt match in ${ids.length} candidates. ${rejected.slice(0,2).join(' ')} Choose another source or supply a deck URL.`);
}
async function prepareSeat(request,config,seed){
    const s={...request},kind=s.kind||(s.seatId<config.humans?'human':'ai');if(!['human','ai'].includes(kind))throw Error('Unknown seat type');s.kind=kind;if(s.playmat!==undefined&&!validPlaymat(s.playmat))throw Error('Unknown playmat');s.playmatChoice=s.playmat||defaultPlaymat(s.seatId);s.playmat=resolvePlaymat(s.playmatChoice,seed,s.seatId).id;let d;
    if(['library','preloaded'].includes(s.source)){
      let eligible=decks.filter(d=>d.source===s.source&&assess(d,config).ok);
      if(s.commanderMode==='selected')eligible=eligible.filter(d=>d.commander===s.commander);
      if(s.commanderMode==='selected'&&s.deckId){d=eligible.find(d=>d.id===s.deckId);if(!d)throw Error(`${s.name}: selected deck does not match commander, bracket, or budget. ${decks.find(d=>d.id===s.deckId)?assess(decks.find(d=>d.id===s.deckId),config).problems.join('; '):''}`);}
      else{const names=[...new Set(eligible.map(d=>d.commander))];if(!names.length)throw Error(`${s.name}: no eligible commander/deck for these constraints`);const commander=names[randomInt(names.length)],pool=eligible.filter(d=>d.commander===commander);d=pool[randomInt(pool.length)];}
      s.commander=d.commander;
    }else{
      if(s.commanderMode==='random'){const pool=[...byName.values()].filter(c=>c.isCommander&&number(c.price)!==null&&c.price<config.maxCost&&c.legalities?.commander==='legal');if(!pool.length)throw Error('No commander pool fits this budget');s.commander=pool[randomInt(pool.length)].name;}
      if(s.source==='archidekt')d=await archidekt(s,config);
      else{const commander=byName.get(s.commander);if(!commander)throw Error('Commander is not in the local card catalog');const pool=[...byName.values()],built=Builder.build({commanders:[commander],cards:pool,seed,definition:{budget:config.maxCost,bracketCeiling:config.bracket,perCardCap:null,fitBracket:true}}),idx=new Map(pool.map(c=>[c.id,c]));d={id:`lab:${randomUUID()}`,source:'lab',name:`${s.commander} · Lab starting list`,commanders:[s.commander],commander:s.commander,rows:built.slots.map(r=>({name:idx.get(r.cardId)?.name,quantity:r.quantity})),notes:built.issues};}
    }
    await hydrate(d.rows);const check=assess(d,config);if(!check.ok)throw Error(`${s.name}: ${check.problems.join('; ')}`);
    const frozen=snapshot(d),mechanics=mechanicsSnapshot(frozen);
    s.aiCompatibility=compatibility(frozen,resolve(root,'../forge'));
    const pilot=kind==='ai'?{kind:s.aiProvider?'api':'forge-native',profile:s.nativeProfile,difficultyRequested:s.difficulty,difficultyApplied:s.difficulty,provider:s.aiProvider||null,model:s.aiModel||null}:{kind:'human'};
    const sourceDeck={kind:d.source==='library'?'crankmagic-library':d.source,deckId:d.sourceDeckId||frozen.deckId||null,deckVersion:d.sourceDeckVersion??frozen.deckVersion??null,sourceRevision:d.sourceRevision??frozen.source?.revision??null};
    return {...s,engineController:kind==='human'||s.aiProvider?'browser':'native-ai',deck:frozen,sourceDeck,mechanics,check,sourceUrl:d.url||null,sourceNotes:d.notes||[],pilot};
}
export async function prepareGuestDeck(member,input,settings){
  if(!member||!Number.isSafeInteger(member.seatId)||member.seatId<0||member.seatId>3)throw Error('Human seat required');
  if(!settings||!Number.isInteger(settings.bracket)||!Number.isFinite(settings.maxCost))throw Error('Table rules required');
  let request={seatId:member.seatId,kind:'human',name:String(input?.name||`Player ${member.seatId+1}`).slice(0,100),commanderMode:'selected',playmat:input?.playmat};
  if(input?.source==='upload'){
    const parsed=parseMoxfieldTwoColumn(input.csv,{name:input.name||`Player ${member.seatId+1} deck`}),created=await importWorkshopDeck(parsed);request={...request,source:'library',deckId:created.id,commander:created.commander};
  }else if(input?.source==='crankmagic'){
    const created=await importWorkshopDeck(input.handoff);request={...request,source:'library',deckId:created.id,commander:created.commander};
  }else if(input?.source==='preloaded'||(input?.source==='library'&&member.seatId===0))request={...request,source:input.source,deckId:input.deckId,commander:input.commander};
  else if(['lab','archidekt'].includes(input?.source))request={...request,source:input.source,commander:input.commander,archidektUrl:input.archidektUrl};
  else throw Error('Choose a CrankMagic deck, upload, preloaded deck, Deck Lab deck, or Archidekt deck');
  const seed=randomInt(1,2147483647),seat=await prepareSeat(request,{...settings,humans:Math.max(member.seatId+1,settings.humans||1)},seed);
  return {id:`deck-version:${randomUUID()}`,validated:true,commander:seat.deck.commanders.map(c=>c.name).join(' + '),snapshot:seat,deckHash:seat.deck.gameplayHash,createdAt:new Date().toISOString()};
}
export async function prepareSetup(config){
  validateSetup(config);const seed=randomInt(1,2147483647),seats=[];
  for(const request of config.seats)seats.push(await prepareSeat(request,config,seed));
  return podPack(config,seed,seats);
}
function podPack(config,seed,seats){return {schema:'CommanderPodPack@1',capturedAt:new Date().toISOString(),seed,settings:config,seats,podHash:sha256(canonical({seed,bracket:config.bracket,maxCost:config.maxCost,seats:seats.map(s=>({seatId:s.seatId,deckHash:s.deck.gameplayHash,mechanicsHash:s.mechanics.hash,pilot:s.pilot}))})),measured:false,bracketStatus:'catalog-count-check; strategy agreement and engine legality still required',priceAsOf:cardFile.generatedAt};}
export async function prepareLobby(config){
  validateSetup(config);const seed=randomInt(1,2147483647),seats=[];
  for(const request of config.seats){const kind=request.kind||(request.seatId<config.humans?'human':'ai');if(kind==='ai'||request.seatId===0)seats.push(await prepareSeat(request,config,seed));}
  return {...podPack(config,seed,seats),schema:'CommanderLobbyPack@1',reservedHumanSeats:config.seats.filter(s=>(s.kind||(s.seatId<config.humans?'human':'ai'))==='human'&&s.seatId!==0).map(s=>({seatId:s.seatId,name:s.name}))};
}
