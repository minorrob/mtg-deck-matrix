import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream, openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve, dirname, delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256,canonical} from '../contracts/deck-snapshot.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg=>{const i=arg.indexOf('=');return i<0?[arg.slice(2),true]:[arg.slice(2,i),arg.slice(i+1)];}));
const recovery=args.resume?resolve(args.resume):null;
const prior=recovery?JSON.parse(readFileSync(resolve(recovery,'run.json'))):null;
const pendingDecision=recovery?JSON.parse(readFileSync(resolve(recovery,'pending.json'))):null;
if(recovery) {args.bridge=true;args.seed=prior.seed;args.pod=resolve(recovery,'pod.json');args.replay=resolve(recovery,'rng-prefix.json');}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
if(!args.forge || !args.java) throw new Error('Required: --forge=path-to-pinned-source --java=path-to-jdk');
const forge=resolve(args.forge), jdk=resolve(args.java);
const lock=JSON.parse(readFileSync(resolve(root,'game/engine-adapter/forge.lock.json')));
const gitArgs=['-c',`safe.directory=${forge.replaceAll('\\','/')}`,'-C',forge];
const commit=execFileSync('git',[...gitArgs,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(commit!==lock.commit) throw new Error(`Forge revision mismatch: expected ${lock.commit}, got ${commit}`);
const jar=resolve(forge,`forge-gui-desktop/target/forge-gui-desktop-${lock.version}-jar-with-dependencies.jar`);
const run=String(args.run||new Date().toISOString().replaceAll(/[^\w-]/g,'-'));
if(!/^[\w-]+$/.test(run)) throw new Error('Run name must be letters, digits, underscores or hyphens');
const out=resolve(root,'game/.local/runs',run);
if(existsSync(out)) throw new Error('Run directory already exists; use another --run name');
const classes=resolve(root,'game/.local/classes');mkdirSync(classes,{recursive:true});
const source=resolve(root,'game/engine-adapter/src/crankmagic/ForgeProbe.java');
const extension=process.platform==='win32'?'.exe':'';
const compile=spawnSync(resolve(jdk,'bin/javac'+extension),['-encoding','UTF-8','-cp',jar,'-d',classes,source],{encoding:'utf8',windowsHide:true});
if(compile.status!==0 || compile.error || compile.stderr?.includes('exception has occurred')) throw new Error(compile.error?.message || compile.stderr || 'Adapter compilation failed');
mkdirSync(out,{recursive:true});
const profile=resolve(out,'forge-profile'); mkdirSync(profile,{recursive:true});
const pod=resolve(args.pod||resolve(root,'game/.local/pod/pod.json'));
writeFileSync(resolve(out,'pod.json'),readFileSync(pod));
const seed=String(args.seed||'220');
const turns=Number(args.turns||'80');
if(!Number.isSafeInteger(turns) || turns<1 || turns>1000) throw new Error('turns must be 1–1000');
const timeoutSeconds=Number(args.timeout||180);
if(!Number.isFinite(timeoutSeconds)||timeoutSeconds<=0) throw new Error('Invalid timeout');
const manifest={schema:'CommanderProbeRun@1',engineCommit:commit,engineJarSha256:sha256(readFileSync(jar)),
  adapterSourceSha256:sha256(readFileSync(source)),seed,turnLimit:turns,podSha256:sha256(readFileSync(pod)),
  measured:false,decisionCoverage:'starting-player-only',pilot:'forge-native-uncertified',nativeAiTimeout:'whole-process-watchdog-only',createdAt:new Date().toISOString()};
if(prior) for(const k of ['engineJarSha256','engineCommit','adapterSourceSha256','podSha256']) if(prior[k]!==manifest[k]) throw new Error('Recovery provenance mismatch: '+k);
writeFileSync(resolve(out,'run.json'),JSON.stringify(manifest,null,2)+'\n');
const javaArgs=['-Xmx2g','-Djava.awt.headless=true',`-Duser.home=${profile}`,`-Dcrankmagic.forgeAssets=${resolve(forge,'forge-gui').replaceAll('\\','/')}/`,
  '-cp',[classes,jar].join(delimiter),'crankmagic.ForgeProbe',pod,out,seed,String(turns),args.replay?resolve(args.replay):'-'];
if(args.bridge) javaArgs.push('bridge');
if(recovery) javaArgs.unshift('-Dcrankmagic.rngPrefix=true');
const child=spawn(resolve(jdk,'bin/java'+extension),javaArgs,{cwd:forge,windowsHide:true,
  env:{...process.env,APPDATA:profile,LOCALAPPDATA:profile},stdio:['pipe','pipe','pipe']});
const log=createWriteStream(resolve(out,'console.log')); let pending='',rejections=0,decisions=0,timedOut=false,paused=false,recoveryMatched=false,protocolError=null;
child.stderr.on('data',data=>log.write(data));
child.stdout.on('data',data=>{
  log.write(data); pending+=data.toString('utf8'); let i;
  while((i=pending.indexOf('\n'))>=0){
    const line=pending.slice(0,i).trim();pending=pending.slice(i+1);
    if(line.startsWith('COMMANDER_DECISION ')) {
      const d=JSON.parse(line.slice('COMMANDER_DECISION '.length));decisions++;
      if(args['pause-before-answer']) {
        const fd=openSync(resolve(out,'pending.json'),'wx');try{writeFileSync(fd,JSON.stringify(d,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
        paused=true;child.kill();continue;
      }
      if(pendingDecision) {
        recoveryMatched=canonical(pendingDecision)===canonical(d);
        if(!recoveryMatched) {protocolError='Recovered decision differs from the saved pending choice';child.kill();continue;}
      }
      const answer={decisionId:d.decisionId,stateVersion:d.stateVersion,optionId:d.options[0].optionId};
      // Exercise fail-closed behavior with stale and illegal replies before the valid scripted reply.
      child.stdin.write(JSON.stringify({...answer,stateVersion:-1})+'\n');
      child.stdin.write(JSON.stringify({...answer,optionId:'not-offered'})+'\n');
      child.stdin.write(JSON.stringify(answer)+'\n');
    } else if(line.startsWith('COMMANDER_REJECT ')) rejections++;
    else if(line.startsWith('COMMANDER_RESULT ')) console.log(line.slice('COMMANDER_RESULT '.length));
  }
});
const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutSeconds*1000);
const code=await new Promise((accept,reject)=>{child.on('error',reject);child.on('close',accept);});
clearTimeout(timer);await new Promise(r=>log.end(r));
writeFileSync(resolve(out,'driver.json'),JSON.stringify({code,timedOut,paused,recoveryMatched,decisions,rejections,finishedAt:new Date().toISOString()},null,2)+'\n');
if(paused) {console.log(`Saved unresolved opening choice: ${out}`);process.exit(0);}
if(protocolError) throw new Error(protocolError);
if(timedOut) throw new Error(`Engine exceeded ${timeoutSeconds}s; run is incomplete, never a measured draw. See ${out}`);
if(code!==0) throw new Error(`Engine exited ${code}. See ${resolve(out,'console.log')}`);
if(!existsSync(resolve(out,'summary.json'))) throw new Error('Engine exited without a result');
if(args.bridge && (decisions!==1 || rejections!==2)) throw new Error('Decision validation probe failed');
console.log(`Probe artifacts: ${out}`);
