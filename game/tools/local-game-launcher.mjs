import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,createWriteStream,existsSync} from 'node:fs';
import {resolve,dirname,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../contracts/deck-snapshot.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
let running=null;
export function liveStatus(){
  if(!running)return {status:'idle'};
  let status={...running};delete status.child;
  for(const file of ['live-status.json','error.json','summary.json'])if(existsSync(resolve(running.directory,file)))status={...status,...JSON.parse(readFileSync(resolve(running.directory,file))),...(file==='error.json'?{status:'error'}:{})};
  if(running.child.exitCode!==null&&!existsSync(resolve(running.directory,'summary.json')))status.status=running.status;
  return status;
}
export async function launchLocalGame(pod){
  if(running?.child&&running.child.exitCode===null)throw Error('A standalone match is already running. Finish or close its Forge window first.');
  const forge=resolve(root,'../forge'),jdk=resolve(root,'../commander-runtime/jdk-17.0.20.1+1'),lock=JSON.parse(readFileSync(resolve(root,'game/engine-adapter/forge.lock.json')));
  const commit=execFileSync('git',['-c',`safe.directory=${forge.replaceAll('\\','/')}`,'-C',forge,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  if(commit!==lock.commit)throw Error('Pinned Forge revision mismatch');
  const jar=resolve(forge,`forge-gui-desktop/target/forge-gui-desktop-${lock.version}-jar-with-dependencies.jar`),classes=resolve(root,'game/.local/classes');mkdirSync(classes,{recursive:true});
  const sources=['ForgeProbe.java','ForgeLocalGame.java'].map(f=>resolve(root,'game/engine-adapter/src/crankmagic',f));
  execFileSync(resolve(jdk,'bin/javac.exe'),['-encoding','UTF-8','-cp',jar,'-d',classes,...sources],{encoding:'utf8',windowsHide:true});
  const directory=resolve(root,'game/.local/games',new Date().toISOString().replace(/[^\w-]/g,'-')),profile=resolve(directory,'forge-profile');mkdirSync(profile,{recursive:true});
  writeFileSync(resolve(directory,'pod.json'),JSON.stringify(pod,null,2));
  writeFileSync(resolve(directory,'card-mechanics.json'),JSON.stringify({schema:'CommanderMatchMechanics@1',podHash:pod.podHash,seats:pod.seats.map(s=>({seatId:s.seatId,...s.mechanics}))},null,2));
  writeFileSync(resolve(directory,'manifest.json'),JSON.stringify({engineCommit:commit,jarHash:sha256(readFileSync(jar)),adapterHashes:sources.map(f=>[f,sha256(readFileSync(f))]),mode:'human-vs-native-ai',apiPilots:false,measured:false},null,2));
  const args=['-Xmx2g','-Djava.awt.headless=false',`-Duser.home=${profile}`,`-Dcrankmagic.forgeAssets=${resolve(forge,'forge-gui').replaceAll('\\','/')}/`,'-cp',[classes,jar].join(delimiter),'crankmagic.ForgeLocalGame',resolve(directory,'pod.json'),directory];
  // Match the pinned desktop launcher's Java 17 reflective-access requirements.
  const pom=readFileSync(resolve(forge,'forge-gui-desktop/pom.xml'),'utf8');
  const opens=pom.match(/<addopen.java.args>([^<]+)<\/addopen.java.args>/)?.[1];
  if(!opens)throw Error('Pinned Forge desktop module flags are missing');
  const moduleArgs=opens.trim().split(/\s+/);
  if(moduleArgs.length%2||moduleArgs.some((v,i)=>i%2?!/^[\w.]+\/[\w.]+=ALL-UNNAMED$/.test(v):v!=='--add-opens'))throw Error('Unexpected Forge desktop module flags');
  const child=spawn(resolve(jdk,'bin/java.exe'),[...moduleArgs,...args],{cwd:forge,windowsHide:true,env:{...process.env,APPDATA:profile,LOCALAPPDATA:profile},stdio:['ignore','pipe','pipe']});
  const log=createWriteStream(resolve(directory,'console.log'));child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  running={status:'starting',directory,pid:child.pid,child,startedAt:new Date().toISOString()};
  child.on('error',e=>{running.status='error';running.error=e.message;log.end();});
  child.on('exit',code=>{running.status=code===0?'closed':'error';running.exitCode=code;log.end();});
  return liveStatus();
}
