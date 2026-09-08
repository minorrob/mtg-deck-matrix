/* Required release journeys: new production workflows and all retained legacy
 * measurement/migration regression journeys. Every child must actually pass. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
/* The geometry pass runs through tests/browser-geometry.mjs, which serves the repo
   itself on its own port and is also picked up by runtests.sh. Required here: a release
   gate that skips a check because a browser was missing is not a gate. */
const gate=spawnSync(process.execPath,[fileURLToPath(new URL('../browser-geometry.mjs',import.meta.url))],{stdio:'inherit',env:{...process.env,GEOMETRY_REQUIRED:'1'}});
if(gate.status!==0){console.error('Browser release gate failed: browser-geometry.mjs',gate.error?.message||'');process.exit(gate.status||1);}
/* tour-walk is the only check that can prove a tour step points at anything: the content
   test (tests/tour.mjs) proves the selectors PARSE, and a selector that parses and matches
   nothing is exactly the bug that reaches a reader. */
for(const name of ['crankmagic-journeys.mjs','crankmagic-recovery.mjs','legacy-journeys.mjs','tour-walk.mjs']){
  const run=spawnSync(process.execPath,[fileURLToPath(new URL(name,import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',env:process.env});
  if(run.status!==0){console.error('Browser release gate failed:',name,run.error?.message||'');process.exit(run.status||1);}
}
console.log('All production and retained legacy browser journeys passed.');
