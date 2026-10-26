/* The real table setup action: preserve a created table on failure and assign only verified public lists. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-table.js',import.meta.url),'utf8');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
function setup({failRules=false,unknown=[],failDeck=false}={}){
  const requests=[],notices=[],navigations=[],storage=new Map();let rulesFailed=false;
  const values={hostName:'Rob',kind2:'ai',name2:'Easy AI',kind3:'ai-easy',name3:'Other AI',kind4:'none',name4:'',startingLife:'30',bracketLimit:'3',deck:''};
  const table={tableId:'table123456',phase:'selecting',youAreHost:true,seats:[{seatId:0,kind:'human',occupied:true},{seatId:1,kind:'ai',occupied:true,name:'Easy AI',deck:null},{seatId:2,kind:'ai',occupied:true,name:'Other AI',deck:null}]};
  const form={values,elements:Object.fromEntries(Object.keys(values).map(k=>[k,{focus(){},setAttribute(){}}]))};
  const document={addEventListener(){},getElementById:id=>id==='cm-table-new'?form:{textContent:''},querySelector:()=>null};
  const precon=id=>({id,name:'Public '+id,commander:[{name:'Commander '+id}],cards:[['Commander '+id,1],['Basic '+id,99]]});
  const C={esc:String,button:()=>'',actions:{close(){}},views:{},HELP:{},state:{decks:[],games:[],preferences:{}},board:{close(){C.disconnected=true;}},render:async()=>{},signedInAs:()=> 'rob@example.test',go:(view,params)=>navigations.push({view,params}),notice:(text,error,options)=>notices.push({text,error,options})};
  const context={CrankFeatures:[],CrankAssets:{preconsLatest:'/latest',precons:'/precons',expect:v=>v},document,location:{origin:'https://example.test'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},FormData:class{constructor(f){return Object.entries(f.values)[Symbol.iterator]();}},fetch:async(path,init={})=>{
    const body=init.body?JSON.parse(init.body):null;requests.push({path,body});
    if(path==='/latest')return Response.json({decks:[{id:'one'},{id:'two'}]});
    if(path==='/precons')return Response.json({decks:[precon('one'),precon('two')]});
    if(path==='/api/tables')return Response.json({table});
    if(path.endsWith('/rules')&&failRules&&!rulesFailed){rulesFailed=true;return Response.json({error:'Rules temporarily unavailable.'},{status:503});}
    if(path.endsWith('/known'))return Response.json({unknown});
    if(path.endsWith('/deck')&&failDeck)return Response.json({error:'Above this bracket.'},{status:409});
    return Response.json({table});
  }};
  vm.runInNewContext(source,context);context.CrankFeatures[0](C);return {C,requests,notices,navigations,storage,values,table};
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
console.log(`table-setup: ${checks} checks passed; real setup action, ordered rules, public decks, recoverable failure.`);
