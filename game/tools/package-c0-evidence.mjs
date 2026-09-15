import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../contracts/deck-snapshot.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=path=>JSON.parse(readFileSync(resolve(root,path)));
const run='game/.local/runs/health-full-42',replay='game/.local/runs/health-replay-42';
const coverage=read(run+'/coverage.json');
const proof={schema:'CommanderC0Evidence@1',packagedAt:new Date().toISOString(),
  run:read(run+'/run.json'),result:read(run+'/summary.json'),
  replayRun:read(replay+'/run.json'),replayResult:read(replay+'/summary.json'),verification:read(replay+'/verification.json'),
  coverage:{definitionsFound:coverage.cards.filter(c=>c.status==='definition-found').length,
    missing:coverage.cards.filter(c=>c.status!=='definition-found'),decks:coverage.decks,abilityCoverage:'unverified'},
  rules:read('game/.local/rules/loss-rules.json'),
  recovery:{pending:read('game/.local/runs/pending-opening-220/driver.json'),resumed:read('game/.local/runs/resumed-opening-220/driver.json'),scope:'starting-player-only'},
  adapterSourceSha256:sha256(readFileSync(resolve(root,'game/engine-adapter/src/crankmagic/ForgeProbe.java'))),
  measured:false,releaseGate:'not-passed'};
const out=resolve(root,'game/evidence');mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'c0-proof.json'),JSON.stringify(proof,null,2)+'\n');
console.log('Wrote compact C0 evidence; raw journals remain local.');
