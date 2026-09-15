import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMatchReport,loadMatchReport,saveMatchFeedback} from '../tools/match-report.mjs';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

const pod={schema:'CommanderPodPack@1',matchId:'match-one',podHash:'pod-hash',settings:{bracket:3},seats:[
  {seatId:0,name:'Rob',kind:'human',sourceDeck:{kind:'crankmagic-library',deckId:'deck:live:D2',deckVersion:12},deck:{name:'Chulane',gameplayHash:'deck-hash',commanders:[{name:'Chulane'}]},pilot:{kind:'human'}},
  {seatId:1,name:'Krenko',kind:'ai',deck:{name:'Goblins',commanders:[{name:'Krenko'}]},pilot:{kind:'api',difficultyRequested:4}}
]};
const state={gameOver:true,turn:9,players:[{playerId:0,name:'Rob',health:{status:'won',life:7,poison:0,commanderDamageMax:12}},{playerId:1,name:'Krenko',health:{status:'out',lossReason:'LifeReachedZero',life:0}}]};
const telemetry={counts:{spells:6,manaChanges:7,battlefieldDeaths:4},cards:[{cardId:7,name:'Engine card',owner:0,controller:0,spells:1,abilities:2,triggers:3,countersAdded:0}],chains:[],repeatedAbilityRuns:[],combats:[],outcomes:[],integrity:{complete:true},scope:'safe'};

test('completed match report preserves exact source deck provenance and safe performance evidence',()=>{
  const report=buildMatchReport({pod,state,telemetry,viewerSeatId:0,completedAt:'2026-09-15T02:00:00.000Z'});
  assert.equal(report.schema,'CrankMagicOnlineMatchReport@1');assert.equal(report.deck.source.deckId,'deck:live:D2');assert.equal(report.deck.source.deckVersion,12);
  assert.equal(report.outcome,'win');assert.equal(report.finish,1);assert.equal(report.deckSignals.mostActive[0].score,6);assert.equal(report.opponents[0].difficulty,4);
  assert.doesNotMatch(JSON.stringify(report),/library order|Secret hand|api key/i);
});

test('reports refuse unfinished rules-engine state and flag incomplete journals before deck advice',()=>{
  assert.throws(()=>buildMatchReport({pod,state:{...state,gameOver:false},telemetry,viewerSeatId:0}),/not completed/);
  const report=buildMatchReport({pod,state,telemetry:{...telemetry,integrity:{complete:false}},viewerSeatId:0});
  assert.equal(report.deckSignals.recommendations[0].kind,'instrumentation');
});

test('solo feedback is validated and atomically persisted beside the private match record',()=>{
  const directory=mkdtempSync(resolve(tmpdir(),'crankmagic-solo-feedback-')),report=buildMatchReport({pod,state,telemetry,viewerSeatId:0});
  const result=saveMatchFeedback(directory,report,{matchId:'match-one',rating:4,deckRating:3,experienceRating:5,notes:'Try more early interaction.'},()=>1000);
  assert.equal(result.accepted,true);const stored=JSON.parse(readFileSync(resolve(directory,'feedback-seat-0.json')));assert.equal(stored.deckRating,3);assert.equal(stored.notes,'Try more early interaction.');
  assert.throws(()=>saveMatchFeedback(directory,report,{matchId:'wrong',rating:4,deckRating:3,experienceRating:5,notes:''}),/Invalid/);
});

test('reports cap telemetry collections and retain the engine completion timestamp',()=>{
  const oversized={...telemetry,chains:Array.from({length:1002},(_,i)=>({i})),combats:Array.from({length:502},(_,i)=>({i}))};
  const capped=buildMatchReport({pod,state,telemetry:oversized,viewerSeatId:0,completedAt:'2026-09-15T02:00:00.000Z'});
  assert.equal(capped.telemetry.chains.length,1000);assert.equal(capped.telemetry.combats.length,500);assert.equal(capped.telemetry.truncated.chains,true);
  const directory=mkdtempSync(resolve(tmpdir(),'crankmagic-report-time-'));
  writeFileSync(resolve(directory,'pod.json'),JSON.stringify(pod));writeFileSync(resolve(directory,'seat-0.json'),JSON.stringify(state));writeFileSync(resolve(directory,'events.ndjson'),'');writeFileSync(resolve(directory,'summary.json'),JSON.stringify({completedAt:'2026-09-15T03:04:05.000Z'}));
  const first=loadMatchReport(directory,0),second=loadMatchReport(directory,0);assert.equal(first.completedAt,'2026-09-15T03:04:05.000Z');assert.equal(second.completedAt,first.completedAt);
});
