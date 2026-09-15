import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {publicStack} from './public-stack.mjs';

// Never return raw journal payloads: they include draws, private choices and library order.
export function summarizeEvents(events,visibleCards,viewerSeatId=0){
  const known=new Map(visibleCards.filter(c=>c.name&&!c.faceDown).map(c=>[c.cardId,c]));
  const counts={lands:0,stackEntries:0,spells:0,abilities:0,triggers:0,resolutions:0,fizzles:0,cancelledCasts:0,taps:0,countersAdded:0,proliferateChoices:0,zoneDepartures:0,battlefieldDeaths:0,damageEvents:0,lifeChanges:0,poisonChanges:0,manaChanges:0,shuffles:0};
  let classified=events.some(e=>e.kind==='manifest'&&e.data?.telemetryVersion>=2),proliferateInstrumented=classified;const recent=[],cards=new Map(),damage=new Map();
  const combats=new Map(),eventMeta=new Map(),chains=new Map(),activity=new Map(),pregameShuffles=new Map();let phase='';
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
      else if(kind==='GameEventAttackersDeclared'){const assignments=[];for(const entry of Array.isArray(f.attackersMap)?f.attackersMap:[]){const target=Number.isInteger(entry.key?.playerId)?entry.key.name:known.get(entry.key?.cardId)?.name;for(const card of entry.value||[]){const name=known.get(card.cardId)?.name;if(name)assignments.push(name+' → '+(target||'defender'));}}message=assignments.length?'Attackers declared · '+assignments.join('; '):'No attackers declared';}
      else{const assignments=[];for(const defender of Array.isArray(f.blockers)?f.blockers:[])for(const entry of defender.value||[]){const attacker=known.get(entry.key?.cardId)?.name;if(!attacker)continue;const blockers=(entry.value||[]).filter(c=>c.cardId!==entry.key.cardId).map(c=>known.get(c.cardId)?.name).filter(Boolean);assignments.push(attacker+(blockers.length?' blocked by '+blockers.join(' + '):' · no blockers'));}message='Blockers declared'+(assignments.length?' · '+assignments.join('; '):' · assignment details unavailable');}
      if(kind==='GameEventPlayerPoisoned')counts.poisonChanges++;else if(kind==='GameEventManaPool')counts.manaChanges++;
      if(Number.isInteger(player?.playerId))recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:player.name||'Player',playerId:player.playerId,label:message});continue;
    }
    if(kind==='GameEventShuffle'){
      counts.shuffles++;
      if(Number.isInteger(f.player?.playerId)){
        const opening=e.data?.turn===0,count=pregameShuffles.get(f.player.playerId)||0;
        recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:f.player.name||'Player',playerId:f.player.playerId,label:opening&&count?'Opening hand reshuffled':'Library shuffled'});
        if(opening)pregameShuffles.set(f.player.playerId,count+1);
      }
      continue;
    }
    if(kind==='GameEventTurnPhase'||kind==='GameEventPlayerLivesChanged'){
      if(kind==='GameEventPlayerLivesChanged')counts.lifeChanges++;
      const player=kind==='GameEventTurnPhase'?f.playerTurn:f.player;
      if(Number.isInteger(player?.playerId))recent.push({id:e.eventId,turn:e.data?.turn??null,cardId:null,name:player.name||'Player',playerId:player.playerId,label:kind==='GameEventTurnPhase'?String(f.phase).replaceAll('_',' ').toLowerCase():`Life ${f.oldLives} → ${f.newLives}`});continue;
    }
    if(kind==='browser-cast-cancelled'){source=e.data?.card;actor=e.data?.playerId;label='Cast cancelled · payment failed'+(e.data?.cost?' · required '+e.data.cost:'');metric='cancelledCasts';}
    else if(kind==='GameEventLandPlayed'){source=f.land;actor=f.player?.playerId;label='Land played';metric='lands';}
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
    else if(kind==='mechanic-choice-completed'&&e.data?.mechanic==='Proliferate'&&e.data.playerId===viewerSeatId){counts.proliferateChoices++;proliferateInstrumented=true;recent.push({id:e.eventId,turn:e.data.turn,cardId:null,name:'Proliferate',playerId:viewerSeatId,label:'Selection completed'});continue;}
    else continue;
    const card=known.get(source?.cardId);
    if(kind==='GameEventPlayerDamaged'&&(!card||source?.faceDown)){counts.damageEvents++;recent.push({id:e.eventId,turn:e.data?.turn??null,phase,kind,cardId:null,name:'Damage',playerId:actor,label});continue;}
    if(!card||source?.faceDown)continue;
    if(kind==='GameEventCardChangeZone'&&f.from?.zoneType==='Battlefield'){counts.zoneDepartures++;if(f.to?.zoneType==='Graveyard')counts.battlefieldDeaths++;}
    if(kind==='GameEventCardDamaged'||kind==='GameEventPlayerDamaged')counts.damageEvents++;
    if(kind==='GameEventSpellResolved'){counts.resolutions++;if(f.hasFizzled)counts.fizzles++;}
    if(kind==='GameEventPlayerDamaged'&&f.combat&&card.commander)label+=' · commander damage';
    if(kind==='GameEventSpellAbilityCast'&&typeof f.targetDescription==='string'){const targets=[...f.targetDescription.matchAll(/\((\d+)\)/g)].map(m=>known.get(Number(m[1]))?.name).filter(Boolean);if(targets.length)label+=' · targeting '+[...new Set(targets)].join(', ');}
    const n=metric==='countersAdded'?f.newValue-f.oldValue:1;if(metric)counts[metric]+=n;
    if(kind==='GameEventSpellAbilityCast'&&typeof f.sa?.isSpell==='boolean')counts[f.sa.isSpell?'spells':f.si?.isTrigger?'triggers':'abilities']++;
    const row=cards.get(card.cardId)||{cardId:card.cardId,name:card.name,owner:card.owner,controller:card.controller,lands:0,stackEntries:0,spells:0,abilities:0,triggers:0,cancelledCasts:0,taps:0,countersAdded:0,proliferateChoices:0};if(metric)row[metric]+=n;
    if(kind==='GameEventSpellAbilityCast'&&typeof f.sa?.isSpell==='boolean')row[f.sa.isSpell?'spells':f.si?.isTrigger?'triggers':'abilities']++;
    cards.set(card.cardId,row);
    if(kind==='GameEventSpellAbilityCast'){
      const activityKind=typeof f.sa?.isSpell==='boolean'?(f.sa.isSpell?'spell':f.si?.isTrigger?'trigger':'ability'):'stack entry',signature=[e.data?.turn??null,card.cardId,f.sa?.abilityId??'',activityKind].join(':');activity.set(signature,{turn:e.data?.turn??null,cardId:card.cardId,name:card.name,kind:activityKind,count:(activity.get(signature)?.count||0)+1});
      chains.set(e.eventId,{castEventId:e.eventId,turn:e.data?.turn??null,phase,cardId:card.cardId,name:card.name,playerId:actor??card.controller,kind:activityKind,status:'on stack',resolutionEventId:null});
    }
    if(kind==='GameEventSpellResolved'&&e.data?.castEventId&&chains.has(e.data.castEventId)){const chain=chains.get(e.data.castEventId);chain.status=f.hasFizzled?'resolved without effect':'resolved';chain.resolutionEventId=e.eventId;}
    recent.push({id:e.eventId,relatedEventId:e.data?.castEventId||null,turn:e.data?.turn??null,phase,kind,cardId:card.cardId,name:card.name,playerId:actor??card.controller,label});
  }
  const repeatedAbilityRuns=[...activity.values()].filter(item=>item.count>=3).sort((a,b)=>b.count-a.count||a.cardId-b.cardId).map(item=>({...item,confirmedLoop:false,note:'Repeated activity in one turn; the log does not claim an infinite loop.'}));
  return {counts,classified,proliferateInstrumented,combats:[...combats.values()],chains:[...chains.values()],repeatedAbilityRuns,cards:[...cards.values()],recent:recent.reverse().map(row=>({...eventMeta.get(row.id),...row})),scope:'Observed public events and your revealed cards; raw private journal data is excluded. Repeated activity is evidence, not a claim that a loop was infinite.'};
}
export function parseJournal(text){
  const lines=String(text).split('\n'),events=[],invalidLines=[];if(lines.at(-1)==='')lines.pop();
  for(let index=0;index<lines.length;index++){if(!lines[index].trim())continue;try{events.push(JSON.parse(lines[index]));}catch{invalidLines.push(index+1);}}
  const sequences=events.map(e=>e.sequence).filter(Number.isSafeInteger),seenSequences=new Set(),seenIds=new Set(),duplicateSequences=[],duplicateEventIds=[],sequenceGaps=[];
  for(const event of events){if(Number.isSafeInteger(event.sequence)){if(seenSequences.has(event.sequence))duplicateSequences.push(event.sequence);seenSequences.add(event.sequence);}if(typeof event.eventId==='string'){if(seenIds.has(event.eventId))duplicateEventIds.push(event.eventId);seenIds.add(event.eventId);}}
  const ordered=[...seenSequences].sort((a,b)=>a-b);for(let i=1;i<ordered.length;i++)if(ordered[i]!==ordered[i-1]+1)sequenceGaps.push({after:ordered[i-1],before:ordered[i]});
  return {events,integrity:{schema:'CrankMagicJournalIntegrity@1',parsedEvents:events.length,invalidLines,firstSequence:ordered[0]??null,lastSequence:ordered.at(-1)??null,sequenceGaps,duplicateSequences:[...new Set(duplicateSequences)],duplicateEventIds:[...new Set(duplicateEventIds)],complete:invalidLines.length===0&&sequenceGaps.length===0&&duplicateSequences.length===0&&duplicateEventIds.length===0}};
}
const cache=new Map();
export function matchTelemetry(directory,state,viewerSeatId=0){
  if(!Number.isSafeInteger(viewerSeatId)||viewerSeatId<0||viewerSeatId>3)throw Error('Invalid telemetry viewer');
  const file=resolve(directory,'events.ndjson'),size=statSync(file).size,key=directory+'\0'+viewerSeatId;let entry=cache.get(key);
  if(!entry||entry.size!==size){const parsed=parseJournal(readFileSync(file,'utf8'));entry={size,events:parsed.events,integrity:parsed.integrity,known:entry?.known||new Map(),accepted:entry?.accepted||[],last:entry?.last||0};cache.set(key,entry);}
  const visible=new Map();for(const p of state.players||[])for(const zone of Object.values(p?.zones||{}))for(const c of zone?.cards||[])if(c.name&&!c.faceDown)visible.set(c.cardId,c);
  for(const event of entry.events){if(event.sequence<=entry.last)continue;entry.last=event.sequence;
    const f=event.data?.fields||{},source=f.land||f.card||f.sa?.host||f.spell?.host||f.source||(event.kind==='browser-cast-cancelled'?event.data?.card:null);
    // Rebuild public identities even after a token has disappeared or the browser reloads.
    const publicZones=['Battlefield','Graveyard','Exile','Command','Stack'];
    const announced=event.kind==='GameEventCardChangeZone'&&(publicZones.includes(f.from?.zoneType)||publicZones.includes(f.to?.zoneType))||event.kind==='GameEventSpellAbilityCast'||event.kind==='GameEventLandPlayed';
    if(announced&&source?.name&&source.faceDown===false){const playerId=f.to?.player?.playerId??f.from?.player?.playerId??f.si?.actor?.playerId??f.player?.playerId;entry.known.set(source.cardId,{...source,...entry.known.get(source.cardId),...visible.get(source.cardId),...(Number.isInteger(playerId)?{controller:playerId}: {})});}
    if(['combat-state','manifest','mechanic-choice-completed','browser-cast-cancelled','GameEventTurnPhase','GameEventPlayerLivesChanged','GameEventPlayerDamaged','GameEventShuffle','GameEventPlayerPoisoned','GameEventManaPool','GameEventAttackersDeclared','GameEventBlockersDeclared','GameEventGameOutcome'].includes(event.kind))entry.accepted.push(event);
    else if(source&&!source.faceDown&&(visible.has(source.cardId)||entry.known.has(source.cardId))){if(visible.has(source.cardId))entry.known.set(source.cardId,visible.get(source.cardId));entry.accepted.push(event);}
  }
  const outcomes=state.players.map(p=>({playerId:p.playerId,name:p.name,status:p.health?.status||'active',lossReason:p.health?.lossReason||null,life:p.health?.life??p.life,poison:p.health?.poison??null,commanderDamageMax:p.health?.commanderDamageMax??null}));
  return {...summarizeEvents(entry.accepted,[...entry.known.values()],viewerSeatId),integrity:entry.integrity,outcomes,stack:publicStack(entry.events)};
}
