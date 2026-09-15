import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,createWriteStream,existsSync} from 'node:fs';
import {resolve,dirname,delimiter,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../contracts/deck-snapshot.mjs';
import {matchTelemetry} from './match-telemetry.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
let running=null;
export async function resumeLocalGame(directory){
  const base=resolve(root,'game/.local/games'),target=resolve(directory),path=relative(base,target);
  if(!path||path.startsWith('..')||isAbsolute(path))throw Error('Resume directory is outside the local games folder');
  const connection=JSON.parse(readFileSync(resolve(target,'browser-bridge.json')));
  if(!Number.isInteger(connection.port)||connection.port<1||connection.port>65535)throw Error('Invalid bridge port');
  const response=await fetch(`http://127.0.0.1:${connection.port}/view`,{headers:{'X-CrankMagic-Bridge':connection.token},signal:AbortSignal.timeout(3000)});
  if(!response.ok||!(await response.json()).state?.players?.length)throw Error('The recorded engine is no longer available');
  running={status:'playing',directory:target,resumed:true};
}
export function liveStatus(){
  if(!running)return {status:'idle'};
  let status={...running};delete status.child;
  for(const file of ['live-status.json','error.json','summary.json'])if(existsSync(resolve(running.directory,file)))status={...status,...JSON.parse(readFileSync(resolve(running.directory,file))),...(file==='error.json'?{status:'error'}:{})};
  if(running.child&&running.child.exitCode!==null&&!existsSync(resolve(running.directory,'summary.json')))status.status=running.status;
  return status;
}
export async function launchLocalGame(pod){
  if(running?.resumed){try{await browserBridge('view');throw Error('The resumed match is still running. Finish it before launching another.');}catch(error){if(!['closed','finished'].includes(liveStatus().status))throw error;}}
  if(running?.child&&running.child.exitCode===null)throw Error('A standalone match is already running. Finish or close its Forge window first.');
  const forge=resolve(root,'../forge'),jdk=resolve(root,'../commander-runtime/jdk-17.0.20.1+1'),lock=JSON.parse(readFileSync(resolve(root,'game/engine-adapter/forge.lock.json')));
  const commit=execFileSync('git',['-c',`safe.directory=${forge.replaceAll('\\','/')}`,'-C',forge,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  if(commit!==lock.commit)throw Error('Pinned Forge revision mismatch');
  const jar=resolve(forge,`forge-gui-desktop/target/forge-gui-desktop-${lock.version}-jar-with-dependencies.jar`),classes=resolve(root,'game/.local/classes');mkdirSync(classes,{recursive:true});
  const sources=['ForgeProbe.java','ForgeLocalGame.java','ForgeBrowserBridge.java'].map(f=>resolve(root,'game/engine-adapter/src/crankmagic',f));
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
export async function browserBridge(operation,body){
  const state=liveStatus();if(!state.directory||(!running.resumed&&(!running.child||running.child.exitCode!==null)))throw Error('No local game is running');
  const file=resolve(state.directory,'browser-bridge.json');if(!existsSync(file))throw Error('This match uses the earlier desktop adapter. Start a new match to use browser controls.');
  const connection=JSON.parse(readFileSync(file));if(!Number.isSafeInteger(connection.port)||connection.port<1||connection.port>65535)throw Error('Invalid local bridge');
  const response=await fetch(`http://127.0.0.1:${connection.port}/${operation}`,{method:body?'POST':'GET',headers:{'X-CrankMagic-Bridge':connection.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Engine action failed');
  if(operation==='view'&&value.state?.players){
    const pod=JSON.parse(readFileSync(resolve(state.directory,'pod.json'))),facts=new Map();
    for(const s of pod.seats)for(const c of [...s.deck.commanders,...s.deck.library])facts.set(c.name,c);
    for(const p of value.state.players)for(const z of Object.values(p.zones))for(const c of z.cards){const fact=facts.get(c.name);if(fact){c.art=fact.art?.normal;c.typeLine=fact.typeLine;}}
    value.pod={seats:[pod.seats[0]]};value.matchId=pod.podHash;value.appearance=pod.seats.map(s=>({seatId:s.seatId,playmat:s.playmat,playmatChoice:s.playmatChoice}));
    value.telemetry=matchTelemetry(state.directory,value.state);
    const rules=new Map(pod.seats.flatMap(s=>(s.mechanics?.cards||[]).map(c=>[c.name,c])));
    for(const p of value.state.players)for(const z of Object.values(p.zones))for(const c of z.cards)if(c.name&&!c.faceDown){c.oracleText=rules.get(c.name)?.oracleText||'';c.colorIdentity=facts.get(c.name)?.colorIdentity||[];}
    value.state.stack=value.telemetry.stack.map(item=>({...item,...(!item.faceDown&&item.name?{art:facts.get(item.name)?.art?.normal,typeLine:facts.get(item.name)?.typeLine}: {})}));
  }
  return value;
}
