/* Required release journeys: new production workflows and all retained legacy
 * measurement/migration regression journeys. Every child must actually pass. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const name of ['crankmagic-journeys.mjs','crankmagic-recovery.mjs','legacy-journeys.mjs']){
  const run=spawnSync(process.execPath,[fileURLToPath(new URL(name,import.meta.url)),...process.argv.slice(2)],{stdio:'inherit',env:process.env});
  if(run.status!==0){console.error('Browser release gate failed:',name,run.error?.message||'');process.exit(run.status||1);}
}
console.log('All production and retained legacy browser journeys passed.');
