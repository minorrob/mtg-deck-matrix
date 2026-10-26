/* The real table setup action: preserve a created table on failure and assign only verified public lists. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-table.js',import.meta.url),'utf8');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
function setup({failRules=false,unknown=[],failDeck=false,cloud=false}={}){
  const requests=[],notices=[],navigations=[],storage=new Map();let rulesFailed=false;
  const values={hostName:'Rob',kind2:'ai',name2:'Easy AI',kind3:'ai-easy',name3:'Other AI',kind4:'none',name4:'',startingLife:'30',bracketLimit:'3',deck:''};
  const table={tableId:'table123456',phase:'selecting',youAreHost:true,seats:[{seatId:0,kind:'human',occupied:true},{seatId:1,kind:'ai',occupied:true,name:'Easy AI',deck:null},{seatId:2,kind:'ai',occupied:true,name:'Other AI',deck:null}]};
  const form={values,elements:Object.fromEntries(Object.keys(values).map(k=>[k,{focus(){},setAttribute(){}}]))};
  const document={addEventListener(){},getElementById:id=>id==='cm-table-new'?form:{textContent:''},querySelector:selector=>cloud&&selector.startsWith('meta[')?{content:selector.includes('crankmagic-play')?'cloud':'on'}:null};
  const precon=id=>({id,name:'Public '+id,commander:[{name:'Commander '+id}],cards:[['Commander '+id,1],['Basic '+id,99]]});
  const C={esc:String,button:()=>'',card:id=>({name:id}),actions:{close(){}},views:{},HELP:{},state:{decks:[],games:[],preferences:{}},board:{close(){C.disconnected=true;},wants:()=>true,show(){}},render:async()=>{},signedInAs:()=> 'rob@example.test',go:(view,params)=>navigations.push({view,params}),notice:(text,error,options)=>notices.push({text,error,options})};
  const context={CrankFeatures:[],performance,URLSearchParams,CrankAssets:{preconsLatest:'/latest',precons:'/precons',expect:v=>v},document,location:{origin:'https://example.test'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},FormData:class{constructor(f){return Object.entries(f.values)[Symbol.iterator]();}},fetch:async(path,init={})=>{
    const body=init.body?JSON.parse(init.body):null;requests.push({path,body});
    if(path==='/latest')return Response.json({decks:[{id:'one'},{id:'two'}]});
    if(path==='/precons')return Response.json({decks:[precon('one'),precon('two')]});
    if(path==='/api/tables')return Response.json({table});
    if(path.endsWith('/rules')&&failRules&&!rulesFailed){rulesFailed=true;return Response.json({error:'Rules temporarily unavailable.'},{status:503});}
    if(path.endsWith('/known'))return Response.json({unknown});
    if(path.endsWith('/deck')&&failDeck)return Response.json({error:'Above this bracket.'},{status:409});
    return Response.json({table});
  }};
  vm.runInNewContext(source,context);context.CrankFeatures[0](C);return {C,context,requests,notices,navigations,storage,values,table};
}
{
  const x=setup();await x.C.actions['table-create']();
  const api=x.requests.filter(r=>r.path.startsWith('/api/'));
  assert.deepEqual(api.map(r=>r.path),['/api/tables','/api/tables/table123456/rules','/api/tables/table123456/known','/api/tables/table123456/deck','/api/tables/table123456/deck']);checks++;
  ok(api[1].body.startingLife===30&&api[1].body.bracketLimit===3,'setup saves the requested rules before verifying or readying AI decks');
  ok(api[3].body.deck.name==='Public one'&&api[4].body.deck.name==='Public two','AI seats receive distinct deterministic public precons through the existing deck command');
  ok(api.slice(3).every(r=>r.body.deck.cards.length===99&&r.body.deck.commander.length===1),'only complete 100-card lists are assigned');
}
{
  const x=setup({failRules:true});await x.C.actions['table-create']();
  ok(x.requests.length===2&&!x.requests.some(r=>r.path.endsWith('/deck')),'a rules failure assigns no auto-ready AI deck');
  ok(x.storage.get('crankmagic-play-seat')==='table123456'&&x.navigations.at(-1).params.id==='table123456','the created table remains recoverable');
  const retry=x.notices.at(-1).options.action;ok(retry.label==='Retry rules','the failure offers the missing operation as its retry');await retry.run();
  ok(x.requests.filter(r=>r.path==='/api/tables').length===1,'retry never creates a duplicate table');
  ok(x.requests.filter(r=>r.path.endsWith('/rules')).length===2&&x.requests.filter(r=>r.path.endsWith('/deck')).length===2,'retry saves the rules and finishes the same table setup');
}
{
  const x=setup({unknown:['Basic one','Basic two']});await x.C.actions['table-create']();
  ok(!x.requests.some(r=>r.path.endsWith('/deck')),'unsupported public lists are never assigned');
  ok(x.notices.at(-1).error&&x.notices.at(-1).text.includes('no public precon is fully known'),'an unavailable playable list has an honest persistent explanation');
}
{
  const x=setup({failDeck:true});await x.C.actions['table-create']();
  ok(x.notices.at(-1).error&&x.notices.at(-1).text.includes('Above this bracket.'),'the server bracket refusal stays visible instead of pretending the AI has a deck');
  ok(x.requests.every(r=>!r.path.includes('/ai-seat')&&!r.path.includes('/advise')&&!r.path.includes('/sharing')),'automatic selection spends no AI calls and reads no private deck lists');
}
{
  const x=setup();await Promise.all([x.C.actions['table-create'](),x.C.actions['table-create']()]);
  ok(x.requests.filter(r=>r.path==='/api/tables').length===1,'a repeated setup activation while its request is pending creates one table');
}
{
  const x=setup();x.table.seats[1].deck={name:'Already chosen'};await x.C.actions['table-create']();
  ok(x.requests.filter(r=>r.path.endsWith('/deck')).every(r=>r.body.seatId===2),'automatic assignment never overwrites a seat that already has a deck');
}
{
  const x=setup({unknown:null});await x.C.actions['table-create']();
  ok(!x.requests.some(r=>r.path.endsWith('/deck'))&&x.notices.at(-1).error,'a malformed verification reply is a recoverable failure, never an assumed playable deck');
}
{
  const x=setup();x.storage.set('crankmagic-play-seat','table123456');await x.C.actions['play-leave-confirm']({dataset:{table:'table123456'}});
  ok(x.C.disconnected&&x.storage.get('crankmagic-play-seat')==='table123456','Leave disconnects but preserves the saved table shortcut');
  ok(x.requests.length===0,'Leave invents no seat-release endpoint');
  await x.notices.at(-1).options.action.run();ok(x.navigations.at(-1).params.id==='table123456','Return after leaving resumes the same table');
}
{
  const x=setup(),saved=[];x.C.state.decks.push({id:'own-deck',version:2});
  x.table.gameRecord={schema:'CrankMagicTableResult@1',id:'game:table:table123456g1:0',tableId:'table123456',matchId:'table123456g1',seatId:0,source:{deckId:'own-deck',deckVersion:1},playedAt:'2026-10-26T12:00:00Z',outcome:'win',finishReason:'Last player standing',finishRank:1,turns:8,pod:2,seat:1,bracket:3,opponents:[{commanders:['Public commander']}],ai:false};
  x.C.commit=async command=>{saved.push(command);x.C.state.games.push({id:command.gameId,deckId:command.deckId});};
  await x.C.tableApi.refresh(x.table.tableId);await x.C.tableApi.refresh(x.table.tableId);
  ok(saved.length===1&&saved[0].gameId===x.table.gameRecord.id,'repeated result reads file once under the stable match and seat identity');
  ok(saved[0].type==='game'&&saved[0].table.schema==='CrankMagicTableResult@1'&&saved[0].table.deckVersion===1&&saved[0].finish===1,'automatic filing preserves the existing model command and played deck version');
  x.table.gameRecord={...x.table.gameRecord,id:'game:table:table123456g2:0',source:{deckId:'missing-local-deck',deckVersion:1}};await x.C.tableApi.refresh(x.table.tableId);
  ok(saved.length===1&&x.C.state.decks.length===1,'a result for an unavailable local deck never creates or imports a foreign deck');
}
{
  const x=setup(),saved=[];let release;const gate=new Promise(resolve=>{release=resolve;});x.C.state.decks.push({id:'own',version:3});
  const r={schema:'CrankMagicTableResult@1',id:'game:table:table123456g2:0',tableId:'table123456',matchId:'table123456g2',seatId:0,source:{deckId:'own',deckVersion:2},playedAt:'2026-10-26T12:00:00Z',outcome:'loss',turns:5,pod:2,seat:1,ai:false,finishRank:null,bracket:null,finishReason:'Conceded',opponents:[{commanders:['Public opponent'],privateHand:['Hidden card']}],privateZones:{library:['Hidden library']}};
  const context={account:'rob@example.test',tableId:r.tableId,matchId:r.matchId,seatId:r.seatId};
  x.C.commit=async command=>{saved.push(command);await gate;x.C.state.games.push({id:command.gameId,deckId:command.deckId});};
  const board=x.C.tableApi.fileResult(r,context),lobby=x.C.tableApi.fileResult(r,context);ok(saved.length===1,'concurrent board and lobby observations share a single in-flight commit');release();
  ok((await board)&&(await lobby),'both observers receive the same saved result');
  ok(!JSON.stringify(saved[0]).includes('Hidden')&&!JSON.stringify(saved[0]).includes('private'),'the account command copies only allowlisted public result fields');
  ok(!await x.C.tableApi.fileResult({...r,id:'arbitrary'},context),'a noncanonical result ID cannot be filed');
  ok(!await x.C.tableApi.fileResult(r,{...context,seatId:1}),'the supplied source context must match the record seat');
  ok(!await x.C.tableApi.fileResult(r,{...context,account:'other@example.test'}),'an abandoned account observation cannot file into the active library');
  x.C.state.decks[0].archived=true;ok(!await x.C.tableApi.fileResult(r,context),'an archived source deck is never selected as a current filing target');
}
{
  const x=setup({cloud:true}),slot=(cardId,quantity)=>({cardId,quantity,purpose:'main'});
  const one={id:'one',name:'One known commander',commanders:['Leader'],slots:[slot('Leader',1)]};
  const single={id:'single',name:'Single commander',commanders:['Leader'],slots:[slot('Leader',1),slot('Basic',99)]};
  const partners={id:'partners',name:'Two commanders',commanders:['Partner A','Partner B'],slots:[slot('Partner A',1),slot('Partner B',1),slot('Basic',98)]};
  ok(await x.C.play.count([one])===0,'a known one-card commander shell is Building and never counted as playable');
  ok(await x.C.play.count([single])===1,'a complete single-commander hundred uses serialized quantities without double-counting its commander');
  ok(await x.C.play.count([partners])===1,'a complete partner hundred includes both commanders exactly once');
  ok(await x.C.play.count([{...single,archived:true}])===0,'an archived hundred is not offered for play');
}
{
  const x=setup();let release,drawn=false;const gate=new Promise(resolve=>{release=resolve;});
  x.context.fetch=async()=>{await gate;return Response.json({table:x.table});};x.C.board.show=()=>{drawn=true;};
  const pending=x.C.tableApi.refresh(x.table.tableId);x.C.signedInAs=()=> 'other@example.test';release();await pending;
  ok(!drawn,'a table response from an abandoned account cannot redraw the new account page');
}
for(const change of['navigation','same-deck rerender','deck version','none']){
  const x=setup({cloud:true}),d={id:'own',version:1,name:'Own deck',commanders:['Leader'],slots:[{cardId:'Leader',quantity:1,purpose:'main'},{cardId:'Basic',quantity:99,purpose:'main'}]};x.C.state.decks.push(d);
  let route={view:'decks',params:new URLSearchParams({deck:d.id})},demoted=0,release;const gate=new Promise(resolve=>{release=resolve;}),old={isConnected:true,dataset:{deck:d.id},innerHTML:'Original line',classList:{toggle(){}},hidden:false},next={textContent:'Original next',dataset:{nextDefault:'Original next'}};let line=old;
  x.C.route=()=>route;x.C.M={readiness:()=>({complete:true})};const originalGet=x.context.document.getElementById,originalQuery=x.context.document.querySelector;
  x.context.document.getElementById=id=>id==='cm-deck-play'?line:originalGet(id);x.context.document.querySelector=selector=>selector==='#cm-deck-next .cm-bento-next-line'?next:originalQuery(selector);x.context.document.querySelectorAll=()=>[{classList:{remove(){demoted++;},add(){}},dataset:{}}];x.context.fetch=async()=>{await gate;return Response.json({unknown:[]});};
  const pending=x.C.play.deck(d);
  if(change==='navigation')route={view:'decks',params:new URLSearchParams({deck:'another'})};
  if(change==='same-deck rerender'){old.isConnected=false;line={...old,isConnected:true,innerHTML:'New current line'};}
  if(change==='deck version')x.C.state.decks[0]={...d,version:2};
  release();await pending;
  if(change==='none')ok(old.innerHTML.includes('Playable at the table')&&demoted>0,'a current same-version deck still receives its valid readiness and action styling');
  else ok(old.innerHTML==='Original line'&&next.textContent==='Original next'&&demoted===0,`a delayed readiness result after ${change} cannot mutate any deck or current Next/primary state`);
}
console.log(`table-setup: ${checks} checks passed; ordered setup, reconnect recovery and idempotent owner result filing.`);
