import {existsSync,readFileSync,renameSync,statSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {matchTelemetry} from './match-telemetry.mjs';

const clone=value=>structuredClone(value);
const safeText=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
const REPORT_LIMITS=Object.freeze({chains:1000,repeatedAbilityRuns:250,combats:500,cards:1000,outcomes:4});
const bounded=(value,key)=>clone((Array.isArray(value)?value:[]).slice(-REPORT_LIMITS[key]));

function activityScore(card){
  return ['lands','spells','abilities','triggers','taps','countersAdded'].reduce((n,key)=>n+(Number(card[key])||0),0);
}
function recommendations(telemetry){
  if(!telemetry.integrity?.complete)return [{kind:'instrumentation',confidence:'high',text:'Repair the journal gaps before using this match to change the deck.'}];
  const items=[];
  if(telemetry.counts.spells<3)items.push({kind:'consistency',confidence:'low',text:'Few spells were observed resolving from this deck. Compare opening mana, mulligan, and draw access across more games before replacing cards.'});
  if(telemetry.counts.manaChanges===0)items.push({kind:'mana',confidence:'low',text:'No mana-pool changes were captured. Verify mana instrumentation before drawing a mana-base conclusion.'});
  if(telemetry.counts.battlefieldDeaths>3)items.push({kind:'resilience',confidence:'medium',text:'Several permanents left the battlefield for graveyards. Review protection, recursion, and the removal that caused those losses.'});
  if(telemetry.repeatedAbilityRuns.length)items.push({kind:'engine',confidence:'medium',text:'Repeated same-turn abilities were observed. Review those sequences for an engine, bottleneck, or interaction point; repetition alone does not prove a loop.'});
  if(!items.length)items.push({kind:'sample',confidence:'low',text:'Keep this match as evidence and compare it with later games before making a card change.'});
  return items;
}

/** Build the owner-safe record attached to one exact deck version. */
export function buildMatchReport({pod,state,telemetry,viewerSeatId,completedAt=new Date().toISOString()}){
  if(pod?.schema!=='CommanderPodPack@1'||!Array.isArray(pod.seats))throw Error('Match pod is unavailable');
  if(!state?.gameOver||!Array.isArray(state.players))throw Error('The rules engine has not completed this game');
  const seat=pod.seats.find(item=>item.seatId===viewerSeatId),player=state.players.find(item=>item.playerId===viewerSeatId);
  if(!seat||!player)throw Error('The completed match does not contain this seat');
  const outcome=player.health?.status==='won'?'win':player.health?.status==='out'?'loss':'draw';
  const active=[...(telemetry.cards||[])].filter(card=>card.owner===viewerSeatId||card.controller===viewerSeatId).sort((a,b)=>activityScore(b)-activityScore(a)||String(a.name).localeCompare(String(b.name))).slice(0,12).map(card=>({cardId:card.cardId,name:safeText(card.name,200),score:activityScore(card),spells:card.spells||0,abilities:card.abilities||0,triggers:card.triggers||0,countersAdded:card.countersAdded||0}));
  const opponents=pod.seats.filter(item=>item.seatId!==viewerSeatId).map(item=>({seatId:item.seatId,name:safeText(item.name,100),kind:item.kind,commanders:item.deck.commanders.map(card=>safeText(card.name,200)),difficulty:item.kind==='ai'?item.pilot?.difficultyRequested??null:null,controller:item.kind==='ai'?item.pilot?.kind??null:'human'}));
  const aiAssessments=pod.seats.filter(item=>item.kind==='ai').map(item=>{const result=state.players.find(player=>player.playerId===item.seatId),cards=(telemetry.cards||[]).filter(card=>card.owner===item.seatId||card.controller===item.seatId).sort((a,b)=>activityScore(b)-activityScore(a)).slice(0,5);const observed=cards.reduce((n,card)=>n+activityScore(card),0);return {schema:'CrankMagicAiMatchAssessment@1',seatId:item.seatId,difficulty:item.pilot?.difficultyRequested??null,outcome:result?.health?.status==='won'?'win':result?.health?.status==='out'?'loss':'draw',rating:result?.health?.status==='won'?5:observed>=8?4:observed>=4?3:2,summary:observed?`Observed ${observed} public deck actions across ${cards.length} leading cards.`:'No public card activity was attributable to this AI seat.',mostActive:cards.map(card=>({name:safeText(card.name,200),score:activityScore(card)})),evidence:'Deterministic rules-log assessment; no claim about hidden choices or subjective experience.'};});
  const source=seat.sourceDeck||{kind:seat.deck.source?.kind||'match-snapshot',deckId:seat.deck.deckId||null,deckVersion:seat.deck.deckVersion??null,sourceRevision:seat.deck.source?.revision||null};
  const truncated=Object.fromEntries(Object.entries(REPORT_LIMITS).map(([key,limit])=>[key,Array.isArray(telemetry[key])&&telemetry[key].length>limit]));
  return {schema:'CrankMagicOnlineMatchReport@1',matchId:pod.matchId,podHash:pod.podHash,completedAt,seatId:viewerSeatId,
    deck:{name:safeText(seat.deck.name,180),gameplayHash:seat.deck.gameplayHash,source:clone(source)},outcome,finish:outcome==='win'?1:null,podSize:pod.seats.length,turns:Number.isSafeInteger(state.turn)?state.turn:null,bracket:pod.settings?.bracket??null,opponents,
    health:{status:player.health?.status||null,lossReason:player.health?.lossReason||null,life:player.health?.life??player.life??null,poison:player.health?.poison??null,commanderDamageMax:player.health?.commanderDamageMax??null},
    telemetry:{counts:clone(telemetry.counts),chains:bounded(telemetry.chains,'chains'),repeatedAbilityRuns:bounded(telemetry.repeatedAbilityRuns,'repeatedAbilityRuns'),combats:bounded(telemetry.combats,'combats'),cards:bounded(telemetry.cards,'cards'),outcomes:bounded(telemetry.outcomes,'outcomes'),integrity:clone(telemetry.integrity),scope:safeText(telemetry.scope,1000),limits:REPORT_LIMITS,truncated},
    deckSignals:{mostActive:active,recommendations:recommendations(telemetry),evidence:'Observed match events for this exact deck snapshot. Hidden information and raw private choices are excluded.'},tableFeedback:{ai:aiAssessments}};
}

export function loadMatchReport(directory,viewerSeatId,stateOverride=null){
  const podFile=resolve(directory,'pod.json'),seatFile=resolve(directory,`seat-${viewerSeatId}.json`),summaryFile=resolve(directory,'summary.json');
  if(!existsSync(podFile))throw Error('The match deck record is unavailable');
  const pod=JSON.parse(readFileSync(podFile));
  const state=stateOverride||(existsSync(seatFile)?JSON.parse(readFileSync(seatFile)):null);
  if(!state)throw Error('The final rules-engine state is not ready');
  const summary=existsSync(summaryFile)?JSON.parse(readFileSync(summaryFile)):null,sourceFile=existsSync(summaryFile)?summaryFile:existsSync(seatFile)?seatFile:podFile;
  const completedAt=typeof summary?.completedAt==='string'&&!Number.isNaN(Date.parse(summary.completedAt))?summary.completedAt:new Date(statSync(sourceFile).mtimeMs).toISOString();
  return buildMatchReport({pod,state,telemetry:matchTelemetry(directory,state,viewerSeatId),viewerSeatId,completedAt});
}

export function saveMatchFeedback(directory,report,input,clock=()=>Date.now()){
  if(report?.schema!=='CrankMagicOnlineMatchReport@1'||input?.matchId!==report.matchId||!Number.isInteger(input.rating)||input.rating<1||input.rating>5||!Number.isInteger(input.deckRating)||input.deckRating<1||input.deckRating>5||!Number.isInteger(input.experienceRating)||input.experienceRating<1||input.experienceRating>5||typeof input.notes!=='string'||input.notes.length>4000)throw Error('Invalid game feedback');
  const record={schema:'CrankMagicMatchFeedback@1',matchId:report.matchId,seatId:report.seatId,rating:input.rating,deckRating:input.deckRating,experienceRating:input.experienceRating,notes:input.notes,submittedAt:new Date(clock()).toISOString()},file=resolve(directory,`feedback-seat-${report.seatId}.json`),temp=file+'.tmp';writeFileSync(temp,JSON.stringify(record,null,2));renameSync(temp,file);return {accepted:true,seatId:report.seatId,receivedSeatIds:[report.seatId],complete:true};
}
