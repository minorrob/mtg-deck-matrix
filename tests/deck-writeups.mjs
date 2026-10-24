/* THE DECK WRITE-UPS (requirements DPG-1 to DPG-9; Rob, 2026-10-23). A deck carries a short description for its header
 * and a How to play guide of four to six steps for Overview, in place of the Excel text the 10-21 backup put in its
 * notes. This suite needs no workbook (tests/live-load.mjs checks the write-ups against the decks the workbook builds):
 *
 *   1. data/deck-writeups-2026-10-23.json: 34 decks, each within the limits, its commanders among the cards it names;
 *   2. data/deck-reference-2026-10-21.json: a hash for the same 34 decks;
 *   3. the model: createDeck and editDeck take both fields, and anything over the limits is refused in plain words,
 *      never cut short; a stored deck over them fails validation;
 *   4. Apply deck write-ups: a write-up finds its deck by id, then by name; notes still equal to the backup's text are
 *      cleared and edited notes stay; it is one batch, so one Undo; run again, it has nothing to do.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),M=require('../collection-model.js');
let checks=0;const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m);},ok=(c,m)=>{checks++;assert.ok(c,m);},
  refuses=(f,re)=>{checks++;assert.throws(f,re);};
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const W=read('../data/deck-writeups-2026-10-23.json'),H=read('../data/deck-reference-2026-10-21.json');
const sha=t=>createHash('sha256').update(t,'utf8').digest('hex');

/* 1. The file. */
const IDS='D1 D2 D3 D4 D5 D6 D7 S1-D1 S1-D2 S1-D3 S1-D4 S1-D5 S1-D6 S2-D1 S2-D2 S2-D3 S2-D4 S2-D5 S2-D6 G0-D1 G0-D2 G0-D3 G0-D4 G1-D1 G1-D2 G1-D3 G1-D4 CJ1 CJ2 CJ3 CJ4 CJ5 HG1 HG2'.split(' ');
eq(W.schema,'deck-writeups@1');eq(Object.keys(W.decks),IDS);
for(const [id,w] of Object.entries(W.decks)){
  ok(w.name.startsWith(id+' '),`${id}: its name starts with its id`);
  eq(M.writeup(w),{description:w.description,howToPlay:w.howToPlay},`${id}: within the limits, nothing trimmed`);
  ok(w.description.length<=300&&w.howToPlay.length>=4&&w.howToPlay.length<=6&&w.howToPlay.every(x=>x.length<=150));
  ok(Array.isArray(w.commanders)&&w.commanders.length>=1&&w.commanders.every(c=>w.named.includes(c)),`${id}: names its commanders`);
  ok(new Set(w.named).size===w.named.length,`${id}: names each card once`);
}
/* 2. The hashes. */
eq(H.schema,'deck-reference-hashes@1');eq(Object.keys(H.decks).sort(),[...IDS].sort());ok(Object.values(H.decks).every(h=>/^[0-9a-f]{64}$/.test(h)));

/* 3. The model. */
const run=(s,c)=>M.apply(s,{id:'c'+(++serial),at:'2026-10-23T12:00:00.000Z',...c}).state;let serial=0;
const card=(id,name)=>({id,name});
const lib=()=>{let s=M.empty();
  s=run(s,{type:'createDeck',deckId:'deck:live:D1',name:'D1 Atraxa',commanders:['card:atraxa'],cards:[card('card:atraxa',"Atraxa, Praetors' Voice")],slots:[{cardId:'card:atraxa',quantity:1}],notes:'Planeswalker loyalty, the Excel text.'});
  s=run(s,{type:'createDeck',deckId:'deck:mine',name:'D2 Chulane',commanders:['card:chulane'],cards:[card('card:chulane','Chulane, Teller of Tales')],slots:[{cardId:'card:chulane',quantity:1}],notes:'My own words about Chulane.'});
  s=run(s,{type:'createDeck',deckId:'deck:live:D3',name:'D3 Ezuri',commanders:['card:ezuri'],cards:[card('card:ezuri','Ezuri, Claw of Progress')],slots:[{cardId:'card:ezuri',quantity:1}]});
  return s;};
const steps=n=>Array.from({length:n},(_,i)=>`Step ${i+1}.`);
{let s=lib();
  s=run(s,{type:'editDeck',deckId:'deck:live:D3',description:'  Ezuri grows the team.  ',howToPlay:['  One. ',' ','Two.','Three.','Four.']});
  const d=M.deck(s,'deck:live:D3');eq(d.description,'Ezuri grows the team.');eq(d.howToPlay,['One.','Two.','Three.','Four.'],'trimmed, blank lines dropped');
  refuses(()=>run(s,{type:'editDeck',deckId:'deck:live:D3',description:'x'.repeat(301)}),/A description is 300 characters at most; this one is 301\./);
  refuses(()=>run(s,{type:'editDeck',deckId:'deck:live:D3',howToPlay:steps(3)}),/How to play is 4 to 6 steps; this one has 3\./);
  refuses(()=>run(s,{type:'editDeck',deckId:'deck:live:D3',howToPlay:steps(7)}),/How to play is 4 to 6 steps; this one has 7\./);
  refuses(()=>run(s,{type:'editDeck',deckId:'deck:live:D3',howToPlay:[...steps(4),'y'.repeat(151)]}),/Each How to play step is 150 characters at most; step 5 is 151\./);
  refuses(()=>run(s,{type:'createDeck',name:'Too long',description:'z'.repeat(400)}),/A description is 300 characters at most/);
  eq(M.deck(s,'deck:live:D3').description,'Ezuri grows the team.','a refused edit changes nothing');
  ok(run(s,{type:'editDeck',deckId:'deck:live:D3',description:'x'.repeat(300),howToPlay:steps(6)}),'the limits themselves are allowed');
  const cleared=run(s,{type:'editDeck',deckId:'deck:live:D3',description:'',howToPlay:[]});eq([M.deck(cleared,'deck:live:D3').description,M.deck(cleared,'deck:live:D3').howToPlay],['',[]],'a deck may have none');
  const made=run(s,{type:'createDeck',deckId:'deck:new',name:'New',description:'A new deck.',howToPlay:steps(4)});eq(M.deck(made,'deck:new').howToPlay,steps(4));
  /* A stored deck over the limits -- a backup edited by hand -- does not restore. */
  const bad=M.clone(s);bad.decks.find(x=>x.id==='deck:live:D3').howToPlay=steps(2);refuses(()=>M.validate(bad),/How to play is 4 to 6 steps/);
  const bad2=M.clone(s);bad2.decks.find(x=>x.id==='deck:live:D3').description='q'.repeat(301);refuses(()=>M.validate(bad2),/A description is 300 characters at most/);
  M.validate(M.empty());ok(true,'a deck without either field still validates');
}

/* 4. Apply deck write-ups. D1 is found by id and its notes are still the backup's; "D2 Chulane" is found by its name
   and its notes are the owner's; D3 is archived; the other 31 have no deck in this library. */
{let s=lib();s=run(s,{type:'archive',deckId:'deck:live:D3'});
  const hashes={decks:{...H.decks,D1:sha('Planeswalker loyalty, the Excel text.')}};
  const noteHash=new Map(s.decks.filter(d=>d.notes).map(d=>[d.id,sha(d.notes)]));
  const plan=M.writeupPlan(s,W,hashes,noteHash);
  eq(plan.matched.map(m=>[m.id,m.deckId,m.clearNotes,m.keptNotes]),[['D1','deck:live:D1',true,false],['D2','deck:mine',false,true]]);
  eq(plan.unmatched.length,32);ok(plan.unmatched.find(u=>u.id==='D3').why.includes('archived'));ok(plan.unmatched.find(u=>u.id==='HG2').why.startsWith('No deck'));
  eq(plan.command.type,'batch','one batch, so one Undo');eq(plan.command.commands.length,2);
  const before=s.revision;const after=run(s,plan.command);eq(after.revision,before+1,'one revision');
  const d1=M.deck(after,'deck:live:D1'),d2=M.deck(after,'deck:mine');
  eq([d1.description,d1.howToPlay,d1.notes],[W.decks.D1.description,W.decks.D1.howToPlay,''],'D1: the write-up in, the Excel notes out');
  eq([d2.description,d2.notes],[W.decks.D2.description,'My own words about Chulane.'],'D2: the write-up in, the owner\'s notes kept');
  eq(M.deck(after,'deck:live:D3').description,undefined,'an archived deck is left alone');
  const again=M.writeupPlan(after,W,hashes,new Map(after.decks.filter(d=>d.notes).map(d=>[d.id,sha(d.notes)])));
  eq([again.todo.length,again.command],[0,null],'applied once, there is nothing left to apply');
  /* An older D6 that leads with another commander keeps its own words. */
  let o=lib();o=run(o,{type:'createDeck',deckId:'deck:live:D6',name:'D6 Shadrix',commanders:['card:shadrix'],cards:[card('card:shadrix','Shadrix Silverquill')],slots:[{cardId:'card:shadrix',quantity:1}]});
  const other=M.writeupPlan(o,{decks:{D6:W.decks.D6}},hashes,new Map());eq(other.matched.length,0);eq(other.unmatched[0].why,'D6 Shadrix leads with Shadrix Silverquill; this write-up is for Krenko, Mob Boss.');
  /* Two decks named "D1 …" and neither with the id: it is not guessed. */
  let t=M.empty();for(const [i,n] of ['D1 Atraxa','D1 Atraxa (copy)'].entries())t=run(t,{type:'createDeck',deckId:'deck:x'+i,name:n});
  const twin=M.writeupPlan(t,{decks:{D1:W.decks.D1}},hashes,new Map());eq([twin.matched.length,twin.unmatched[0].why],[0,'2 decks are named "D1 …"']);
}
console.log(`deck-writeups: ${checks} checks passed; 34 write-ups within their limits, refused in plain words past them, and applied once in one batch.`);
