import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';

export function inspectScript(text){
  const flags=[...text.matchAll(/^AI:RemoveDeck:(All|Random|NonCommander)\s*$/gm)].map(m=>m[1]);
  return {nativeAiWarning:flags.includes('All'),randomDeckWarning:flags.includes('Random'),nonCommanderOnly:flags.includes('NonCommander'),
    abilities:[...text.matchAll(/(?:AB|DB)\$ ([A-Za-z]+)/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i),
    hints:text.split(/\r?\n/).filter(l=>/AILogic|AI:RemoveDeck/.test(l))};
}
export function compatibility(deck,forgeRoot){
  const cards=[...deck.commanders,...deck.library].map(c=>{
    const file=c.name.toLowerCase().replaceAll('-',' ').replaceAll(/[^a-z0-9 ]/g,'').trim().replaceAll(/ +/g,'_')+'.txt';
    const path=resolve(forgeRoot,'forge-gui/res/cardsfolder',file[0],file);
    if(!existsSync(path))return {name:c.name,oracleId:c.oracleId,status:'script-location-unresolved'};
    return {name:c.name,oracleId:c.oracleId,status:'definition-found',...inspectScript(readFileSync(path,'utf8')),script:`forge-gui/res/cardsfolder/${file[0]}/${file}`};
  });
  return {schema:'CrankMagicAiCompatibility@1',deckHash:deck.gameplayHash,cards,
    warnings:cards.filter(c=>c.nativeAiWarning).map(c=>c.name),
    interpretation:'RemoveDeck:All excludes proactive casting and activation candidates in the pinned native AI. Definitions and mandatory triggers can still work. No cards removed from the deck.'};
}
