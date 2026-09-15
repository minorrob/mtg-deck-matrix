import assert from 'node:assert/strict';
import {readFileSync, createReadStream, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
const [original,replay]=process.argv.slice(2).map(p=>resolve(p));
if(!original||!replay) throw new Error('Usage: node game/tools/verify-forge-probe.mjs original-run replay-run');
const read=(dir,name)=>JSON.parse(readFileSync(resolve(dir,name),'utf8'));
const a=read(original,'summary.json'),b=read(replay,'summary.json');
for(const field of ['engineCommit','eventCount','eventKinds','rngDraws','projectionHash','projectionSequenceHash','status']) assert.deepEqual(a[field],b[field],`Replay diverged: ${field}`);
const ar=read(original,'run.json'),br=read(replay,'run.json');
for(const field of ['engineCommit','engineJarSha256','adapterSourceSha256','podSha256','turnLimit']) assert.equal(ar[field],br[field],`Run provenance differs: ${field}`);
assert.deepEqual(read(original,'projection-hashes.json'),read(replay,'projection-hashes.json'),'Every diagnostic projection must match');
assert.deepEqual(read(original,'rng.json'),read(replay,'rng.json'));
assert.equal(b.rngTapeFullyConsumed,true);
assert.ok(a.rngDraws>0);
assert.ok(a.eventKinds.GameEventSpellAbilityCast>0);
assert.ok(a.eventKinds.GameEventManaPool>0);
assert.ok(a.eventKinds.GameEventCardChangeZone>0);
assert.ok(a.eventKinds.GameEventAttackersDeclared>0);
assert.ok(a.eventKinds.GameEventPlayerPriority>0);
assert.equal(a.measured,false);
const casts=new Set();let resolved=0,linked=0;const firstHands=new Map();
for await(const line of createInterface({input:createReadStream(resolve(original,'events.ndjson')),crlfDelay:Infinity})) {
  const e=JSON.parse(line);
  if(e.kind==='GameEventSpellAbilityCast') casts.add(e.eventId);
  if(e.kind==='GameEventSpellResolved') {resolved++; if(casts.has(e.data.castEventId)) linked++;}
  if(e.kind==='projection' && e.data.state) for(const p of e.data.state.players) {
    if(!firstHands.has(p.playerId) && p.zones.Hand.count===7) firstHands.set(p.playerId,p.zones);
  }
}
for(const [seat,zones] of firstHands) {
  assert.equal(zones.Library.count,92,`Seat ${seat}: opening seven must leave 92 in its library`);
  const ids=[...zones.Hand.cards,...zones.Library.cards].map(c=>c.cardId);
  assert.equal(new Set(ids).size,99,`Seat ${seat}: hand and library must be disjoint instances`);
}
assert.equal(firstHands.size,4,'Saw opening seven for all four actual decks');
for(let seat=0;seat<4;seat++) {
  const view=read(original,`seat-${seat}.json`);
  for(const p of view.players) {
    // The chosen fixture has no reveal effects active at its checkpoint. Reveals need separate tests.
    assert.equal(p.zones.Library.cards.length,0,'No library identities/order in seat observations');
    if(p.playerId!==seat) assert.equal(p.zones.Hand.cards.length,0,'No opponent hand identities in seat observations');
    else assert.equal(p.zones.Hand.cards.length,p.zones.Hand.count,'Own hand is visible');
  }
}
const evidence={schema:'CommanderReplayEvidence@1',passed:true,engineCommit:a.engineCommit,
  randomDraws:a.rngDraws,projections:read(original,'projection-hashes.json').length,
  events:a.eventCount,resolved,linkedCastEvents:linked,openingHandsChecked:4,seatViewsChecked:4,
  limits:['Diagnostic projections are not full restorable states.','Native AI is rerun, not a complete decision-tape replay.',
    'Visibility check covers this fixture; reveal, face-down and control-changing paths need separate certification.'],measured:false};
writeFileSync(resolve(replay,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
