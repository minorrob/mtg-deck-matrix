import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadForgeCardIndex} from '../contracts/forge-card-index.mjs';

export function inspectScript(text){
  const flags=[...text.matchAll(/^AI:RemoveDeck:(All|Random|NonCommander)\s*$/gm)].map(m=>m[1]);
  return {nativeAiWarning:flags.includes('All'),randomDeckWarning:flags.includes('Random'),nonCommanderOnly:flags.includes('NonCommander'),
    abilities:[...text.matchAll(/(?:AB|DB)\$ ([A-Za-z]+)/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i),
    hints:text.split(/\r?\n/).filter(l=>/AILogic|AI:RemoveDeck/.test(l))};
}

/* Which cards this engine knows, and what its own AI says about them.
 *
 * This used to guess a cardsfolder filename from the printed name. It resolves through the card
 * index now, so a card is reported missing only when Forge genuinely has no script for it -- and
 * `unresolved` is the list the caller must refuse to seat, not a warning to log and forget. */
export function compatibility(deck,forgeRoot){
  const loaded=loadForgeCardIndex(forgeRoot);
  const rows=[...deck.commanders,...deck.library];
  if(!loaded.available){
    return {schema:'CrankMagicAiCompatibility@1',deckHash:deck.gameplayHash,checked:false,reason:loaded.reason,
      cards:rows.map(c=>({name:c.name,oracleId:c.oracleId,status:'engine-unavailable'})),warnings:[],unresolved:[],
      interpretation:'Forge card scripts could not be read, so no card was checked against the engine.'};
  }
  const cards=rows.map(c=>{
    const hit=loaded.index.resolve(c.name);
    if(!hit)return {name:c.name,oracleId:c.oracleId,quantity:c.quantity,status:'not-in-engine',
      suggestions:loaded.index.suggest(c.name)};
    let text='';
    try{text=readFileSync(resolve(forgeRoot,hit.script),'utf8');}
    catch{return {name:c.name,oracleId:c.oracleId,quantity:c.quantity,status:'script-unreadable',script:hit.script};}
    return {name:c.name,oracleId:c.oracleId,quantity:c.quantity,status:'definition-found',matchedBy:hit.matchedBy,
      ...inspectScript(text),script:hit.script};
  });
  return {schema:'CrankMagicAiCompatibility@1',deckHash:deck.gameplayHash,checked:true,reason:null,cards,
    warnings:cards.filter(c=>c.nativeAiWarning).map(c=>c.name),
    unresolved:cards.filter(c=>c.status!=='definition-found').map(c=>({name:c.name,quantity:c.quantity||1,
      reason:c.status==='not-in-engine'?'This engine has no card script by that name':'Forge has the card but its script could not be read',
      suggestions:c.suggestions||[]})),
    interpretation:'RemoveDeck:All excludes proactive casting and activation candidates in the pinned native AI. Definitions and mandatory triggers can still work. No cards removed from the deck.'};
}
