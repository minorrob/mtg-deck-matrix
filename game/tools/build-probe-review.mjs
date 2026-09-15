import {readFileSync,writeFileSync,mkdirSync,createReadStream,existsSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DIFFICULTIES} from '../contracts/pilot-policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const run=resolve(process.argv[2]||resolve(root,'game/.local/runs/health-full-42'));
const facts=JSON.parse(readFileSync(resolve(root,'data/card-facts.json'))).cards;
for(const fixture of ['live-identities.json','review-art.json']) {
  const file=resolve(root,'game/fixtures',fixture);
  if(existsSync(file)) for(const [name,f] of Object.entries(JSON.parse(readFileSync(file)).cards)) facts[name]={...facts[name],...f};
}
const pod=JSON.parse(readFileSync(resolve(run,'pod.json'))),summary=JSON.parse(readFileSync(resolve(run,'summary.json')));
const frames=[],log=[];let lastTurn=-1;
for await(const line of createInterface({input:createReadStream(resolve(run,'events.ndjson')),crlfDelay:Infinity})) {
  const e=JSON.parse(line);
  if(e.kind==='projection' && e.data.state) {
    const s=structuredClone(e.data.state);
    for(const p of s.players) for(const [zone,z] of Object.entries(p.zones)) {
      // This review exports public battlefields and seat 0's hand only. It is not a general visibility engine.
      if(zone==='Library'||(zone==='Hand'&&p.playerId!==0)) {z.cards=[];z.hiddenCount=z.count;continue;}
      z.cards=z.cards.filter(c=>!c.engineEffect && c.name!=='Commander Effect');
      if(zone==='Command') z.count=z.cards.length;
      for(const c of z.cards) {
        if(c.faceDown) {c.name=null;delete c.power;delete c.toughness;}
        const f=facts[c.name]||facts[c.name?.split(' // ')[0]];
        c.art=f?.normal||null;c.typeLine=f?.typeLine||'';
      }
    }
    frames.push({...s,eventId:e.eventId,sequence:e.sequence});lastTurn=s.turn;
  } else if(['GameEventSpellAbilityCast','GameEventSpellResolved','GameEventPlayerDamaged','GameEventPlayerPoisoned','GameEventLandPlayed'].includes(e.kind)) {
    log.push({eventId:e.eventId,sequence:e.sequence,turn:e.data.turn||lastTurn,kind:e.kind,fields:e.data.fields});
  }
}
if(!frames.length) throw new Error('No recorded board frames');
const out=resolve(root,'game/.local/review');mkdirSync(out,{recursive:true});
const data={schema:'CommanderReview@1',title:'CrankMagic Commander',preview:true,pod,summary,frames,log,difficulties:DIFFICULTIES,
  note:'Recorded engine game. All four seats used Forge-native AI for this proof. Human play and API pilots are not connected yet.'};
writeFileSync(resolve(out,'match.json'),JSON.stringify(data));
console.log(JSON.stringify({frames:frames.length,logEntries:log.length,out},null,2));
