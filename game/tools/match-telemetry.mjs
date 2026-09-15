import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {publicStack} from './public-stack.mjs';

// Never return raw journal payloads: they include draws, private choices and library order.
export function summarizeEvents(events,visibleCards){
  const known=new Map(visibleCards.filter(c=>c.name&&!c.faceDown).map(c=>[c.cardId,c]));
  const counts={lands:0,stackEntries:0,spells:0,abilities:0,triggers:0,taps:0,countersAdded:0,proliferateChoices:0};
  let classified=events.some(e=>e.kind==='manifest'&&e.data?.telemetryVersion>=2),proliferateInstrumented=classified;const recent=[],cards=new Map(),damage=new Map();
  const combats=new Map(),eventMeta=new Map();let phase='';
  for(const e of events){
    if(e.data?.phase)phase=e.data.phase;
    if(e.kind==='GameEventTurnPhase')phase=e.data?.fields?.phase||phase;
    eventMeta.set(e.eventId,{phase,kind:e.kind});
    if(e.kind==='combat-state'){const c=e.data?.combat;if(c?.attacks?.length&&/DECLARE_ATTACKERS|DECLARE_BLOCKERS/.test(phase))combats.set(c.turn,c);continue;}
    const f=e.data?.fields||{},kind=e.kind;let source,actor,label,metric;
    if(['GameEventPlayerPoisoned','GameEventManaPool','GameEventAttackersDeclared','GameEventBlockersDeclared'].includes(kind)){
      const player=f.receiver||f.player||f.defendingPlayer;let message;
      if(kind==='GameEventPlayerPoisoned')message=`Poison ${f.oldValue} → ${f.oldValue+f.amount}`;
      else if(kind==='GameEventManaPool')message=`Mana pool ${String(f.mode).toLowerCase()} · ${(f.colors||[]).filter(c=>['WHITE','BLUE','BLACK','RED','GREEN','COLORLESS'].includes(c)).join(', ')}`;
      else{const found=new Set();function visit(value){if(!value||typeof value!=='object')return;if(known.has(value.cardId))found.add(known.get(value.cardId).name);if(Array.isArray(value))value.forEach(visit);else Object.values(value).forEach(visit);}visit(f.attackersMap||f.blockers);message=(kind==='GameEventAttackersDeclared'?'Attackers declared':'Blockers declared')+(found.size?' · '+[...found].join(', '):'');}
      if(Number.isInteger(player?.playerId))recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:player.name||'Player',playerId:player.playerId,label:message});continue;
    }
    if(kind==='GameEventShuffle'){if(Number.isInteger(f.player?.playerId))recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:f.player.name||'Player',playerId:f.player.playerId,label:'Library shuffled'});continue;}
    if(kind==='GameEventTurnPhase'||kind==='GameEventPlayerLivesChanged'){
      const player=kind==='GameEventTurnPhase'?f.playerTurn:f.player;
      if(Number.isInteger(player?.playerId))recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:player.name||'Player',playerId:player.playerId,label:kind==='GameEventTurnPhase'?String(f.phase).replaceAll('_',' ').toLowerCase():`Life ${f.oldLives} → ${f.newLives}`});continue;
    }
    if(kind==='GameEventLandPlayed'){source=f.land;actor=f.player?.playerId;label='Land played';metric='lands';}
    else if(kind==='GameEventCardChangeZone'){
      source=f.card;actor=f.to?.player?.playerId??f.from?.player?.playerId;const from=f.from?.zoneType,to=f.to?.zoneType;
      if(from==='Library'&&to==='Hand')continue;
      label=from==='Battlefield'&&to==='Graveyard'?'Died · battlefield → graveyard':to==='Battlefield'?'Entered battlefield':from==='Battlefield'?`Left battlefield → ${to||'ceased to exist'}`:`${from||'Created'} → ${to||'ceased to exist'}`;
      const hit=damage.get(source?.cardId);if(from==='Battlefield'&&hit?.turn===e.data?.turn)label+=` · earlier this turn: ${hit.amount} damage from ${hit.name}`;
    }
    else if(kind==='GameEventCardDamaged'){source=f.card;const name=known.get(f.source?.cardId)?.name||'a source';label=`${f.amount} damage from ${name}`;damage.set(source?.cardId,{amount:f.amount,name,turn:e.data?.turn});}
    else if(kind==='GameEventPlayerDamaged'){source=f.source;actor=f.target?.playerId;label=`${f.amount} ${f.combat?'combat ':''}${f.infect?'infect ':''}damage to ${f.target?.name||'a player'}`;}
    else if(kind==='GameEventCardTapped'){source=f.card;label=f.tapped?'Tapped':'Untapped';if(f.tapped)metric='taps';}
    else if(kind==='GameEventSpellResolved'){source=f.spell?.host;label=f.hasFizzled?'Resolved without effect':'Resolved';}
    else if(kind==='GameEventCardCounters'&&f.newValue!==f.oldValue){source=f.card;label=`${Math.abs(f.newValue-f.oldValue)} counters ${f.newValue>f.oldValue?'added':'removed'}`;if(f.newValue>f.oldValue)metric='countersAdded';}
    else if(kind==='GameEventSpellAbilityCast'){source=f.sa?.host;actor=f.si?.actor?.playerId;label='Spell / ability on stack';metric='stackEntries';if(typeof f.sa?.isSpell==='boolean'){classified=true;label=f.sa.isSpell?'Spell cast':f.si?.isTrigger?'Triggered ability':'Activated ability';}}
    else if(kind==='mechanic-choice-completed'&&e.data?.mechanic==='Proliferate'&&e.data.playerId===0){counts.proliferateChoices++;proliferateInstrumented=true;recent.push({id:e.eventId,turn:e.data.turn,cardId:null,name:'Proliferate',playerId:0,label:'Selection completed'});continue;}
    else continue;
    const card=known.get(source?.cardId);if(!card||source?.faceDown)continue;
    if(kind==='GameEventPlayerDamaged'&&f.combat&&card.commander)label+=' · commander damage';
    if(kind==='GameEventSpellAbilityCast'&&typeof f.targetDescription==='string'){const targets=[...f.targetDescription.matchAll(/\((\d+)\)/g)].map(m=>known.get(Number(m[1]))?.name).filter(Boolean);if(targets.length)label+=' · targeting '+[...new Set(targets)].join(', ');}
    const n=metric==='countersAdded'?f.newValue-f.oldValue:1;if(metric)counts[metric]+=n;
    if(kind==='GameEventSpellAbilityCast'&&typeof f.sa?.isSpell==='boolean')counts[f.sa.isSpell?'spells':f.si?.isTrigger?'triggers':'abilities']++;
    const row=cards.get(card.cardId)||{cardId:card.cardId,name:card.name,owner:card.owner,controller:card.controller,lands:0,stackEntries:0,spells:0,abilities:0,triggers:0,taps:0,countersAdded:0,proliferateChoices:0};if(metric)row[metric]+=n;
    if(kind==='GameEventSpellAbilityCast'&&typeof f.sa?.isSpell==='boolean')row[f.sa.isSpell?'spells':f.si?.isTrigger?'triggers':'abilities']++;
    cards.set(card.cardId,row);
    recent.push({id:e.eventId,turn:e.data?.turn??null,phase,kind,cardId:card.cardId,name:card.name,playerId:actor??card.controller,label});
  }
  return {counts,classified,proliferateInstrumented,combats:[...combats.values()],cards:[...cards.values()],recent:recent.reverse().map(row=>({...eventMeta.get(row.id),...row})),scope:'Observed public events and your revealed cards; raw private journal data is excluded.'};
}
const cache=new Map();
export function matchTelemetry(directory,state){
  const file=resolve(directory,'events.ndjson'),size=statSync(file).size;let entry=cache.get(directory);
  if(!entry||entry.size!==size){const lines=readFileSync(file,'utf8').split('\n');lines.pop();const events=[];for(const line of lines){try{events.push(JSON.parse(line));}catch{}}entry={size,events,known:entry?.known||new Map(),accepted:entry?.accepted||[],last:entry?.last||0};cache.set(directory,entry);}
  const visible=new Map();for(const p of state.players)for(const zone of Object.values(p.zones))for(const c of zone.cards)if(c.name&&!c.faceDown)visible.set(c.cardId,c);
  for(const event of entry.events){if(event.sequence<=entry.last)continue;entry.last=event.sequence;
    const f=event.data?.fields||{},source=f.land||f.card||f.sa?.host||f.spell?.host||f.source;
    // Rebuild public identities even after a token has disappeared or the browser reloads.
    const publicZones=['Battlefield','Graveyard','Exile','Command','Stack'];
    const announced=event.kind==='GameEventCardChangeZone'&&(publicZones.includes(f.from?.zoneType)||publicZones.includes(f.to?.zoneType))||event.kind==='GameEventSpellAbilityCast'||event.kind==='GameEventLandPlayed';
    if(announced&&source?.name&&source.faceDown===false){const playerId=f.to?.player?.playerId??f.from?.player?.playerId??f.si?.actor?.playerId??f.player?.playerId;entry.known.set(source.cardId,{...source,...entry.known.get(source.cardId),...visible.get(source.cardId),...(Number.isInteger(playerId)?{controller:playerId}: {})});}
    if(['combat-state','manifest','mechanic-choice-completed','GameEventTurnPhase','GameEventPlayerLivesChanged','GameEventShuffle','GameEventPlayerPoisoned','GameEventManaPool','GameEventAttackersDeclared','GameEventBlockersDeclared'].includes(event.kind))entry.accepted.push(event);
    else if(source&&!source.faceDown&&(visible.has(source.cardId)||entry.known.has(source.cardId))){if(visible.has(source.cardId))entry.known.set(source.cardId,visible.get(source.cardId));entry.accepted.push(event);}
  }
  return {...summarizeEvents(entry.accepted,[...entry.known.values()]),stack:publicStack(entry.events)};
}
