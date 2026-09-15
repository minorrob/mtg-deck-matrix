import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {publicStack} from './public-stack.mjs';

// Never return raw journal payloads: they include draws, private choices and library order.
export function summarizeEvents(events,visibleCards){
  const known=new Map(visibleCards.filter(c=>c.name&&!c.faceDown).map(c=>[c.cardId,c]));
  const counts={lands:0,stackEntries:0,spells:0,abilities:0,triggers:0,taps:0,countersAdded:0,proliferateChoices:0};
  let classified=events.some(e=>e.kind==='manifest'&&e.data?.telemetryVersion>=2),proliferateInstrumented=classified;const recent=[],cards=new Map();
  for(const e of events){
    const f=e.data?.fields||{},kind=e.kind;let source,actor,label,metric;
    if(kind==='GameEventShuffle'){if(Number.isInteger(f.player?.playerId))recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:f.player.name||'Player',playerId:f.player.playerId,label:'Library shuffled'});continue;}
    if(kind==='GameEventTurnPhase'||kind==='GameEventPlayerLivesChanged'){
      const player=kind==='GameEventTurnPhase'?f.playerTurn:f.player;
      if(Number.isInteger(player?.playerId))recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:player.name||'Player',playerId:player.playerId,label:kind==='GameEventTurnPhase'?String(f.phase).replaceAll('_',' ').toLowerCase():`Life ${f.oldLives} → ${f.newLives}`});continue;
    }
    if(kind==='GameEventLandPlayed'){source=f.land;actor=f.player?.playerId;label='Land played';metric='lands';}
    else if(kind==='GameEventCardTapped'){source=f.card;label=f.tapped?'Tapped':'Untapped';if(f.tapped)metric='taps';}
    else if(kind==='GameEventSpellResolved'){source=f.spell?.host;label=f.hasFizzled?'Resolved without effect':'Resolved';}
    else if(kind==='GameEventCardCounters'&&f.newValue>f.oldValue){source=f.card;label=`${f.newValue-f.oldValue} counters added`;metric='countersAdded';}
    else if(kind==='GameEventSpellAbilityCast'){source=f.sa?.host;actor=f.si?.actor?.playerId;label='Spell / ability on stack';metric='stackEntries';if(typeof f.sa?.isSpell==='boolean'){classified=true;label=f.sa.isSpell?'Spell cast':f.si?.isTrigger?'Triggered ability':'Activated ability';}}
    else if(kind==='mechanic-choice-completed'&&e.data?.mechanic==='Proliferate'&&e.data.playerId===0){counts.proliferateChoices++;proliferateInstrumented=true;recent.push({id:e.eventId,turn:e.data.turn,cardId:null,name:'Proliferate',playerId:0,label:'Selection completed'});continue;}
    else continue;
    const card=known.get(source?.cardId);if(!card||source?.faceDown)continue;
    const n=metric==='countersAdded'?f.newValue-f.oldValue:1;if(metric)counts[metric]+=n;
    if(kind==='GameEventSpellAbilityCast'&&typeof f.sa?.isSpell==='boolean')counts[f.sa.isSpell?'spells':f.si?.isTrigger?'triggers':'abilities']++;
    const row=cards.get(card.cardId)||{cardId:card.cardId,name:card.name,owner:card.owner,controller:card.controller,lands:0,stackEntries:0,spells:0,abilities:0,triggers:0,taps:0,countersAdded:0,proliferateChoices:0};if(metric)row[metric]+=n;
    if(kind==='GameEventSpellAbilityCast'&&typeof f.sa?.isSpell==='boolean')row[f.sa.isSpell?'spells':f.si?.isTrigger?'triggers':'abilities']++;
    cards.set(card.cardId,row);
    recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:card.cardId,name:card.name,playerId:actor??card.controller,label});
  }
  return {counts,classified,proliferateInstrumented,cards:[...cards.values()],recent:recent.slice(-80).reverse(),scope:'Publicly visible sources and your revealed cards; raw private journal data is excluded.'};
}
const cache=new Map();
export function matchTelemetry(directory,state){
  const file=resolve(directory,'events.ndjson'),size=statSync(file).size;let entry=cache.get(directory);
  if(!entry||entry.size!==size){const lines=readFileSync(file,'utf8').split('\n');lines.pop();const events=[];for(const line of lines){try{events.push(JSON.parse(line));}catch{}}entry={size,events,known:entry?.known||new Map(),accepted:entry?.accepted||[],last:entry?.last||0};cache.set(directory,entry);}
  const visible=new Map();for(const p of state.players)for(const zone of Object.values(p.zones))for(const c of zone.cards)if(c.name&&!c.faceDown)visible.set(c.cardId,c);
  for(const event of entry.events){if(event.sequence<=entry.last)continue;entry.last=event.sequence;
    const f=event.data?.fields||{},source=f.land||f.card||f.sa?.host||f.spell?.host;
    if(['manifest','mechanic-choice-completed','GameEventTurnPhase','GameEventPlayerLivesChanged','GameEventShuffle'].includes(event.kind))entry.accepted.push(event);
    else if(source&&!source.faceDown&&visible.has(source.cardId)){entry.known.set(source.cardId,visible.get(source.cardId));entry.accepted.push(event);}
  }
  return {...summarizeEvents(entry.accepted,[...entry.known.values()]),stack:publicStack(entry.events)};
}
