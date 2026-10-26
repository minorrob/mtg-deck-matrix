/* Lock's asynchronous feedback and the real toast's revision-bound Undo callback. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const decks=readFileSync(new URL('../crankmagic-decks.js',import.meta.url),'utf8'),app=readFileSync(new URL('../crankmagic-app.js',import.meta.url),'utf8');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
{
  let release,reads=0,review;
  const deck={id:'d1',name:'Test'},C={state:{},notice:text=>{C.lastNotice=text;},review:(...args)=>{review=args;}};
  const x={C,actions:{},M:{deck:()=>deck,definitionIssues:()=>[],readiness:()=>({toBuy:46})},note:String,e:String,refreshLegality:()=>{reads++;return new Promise(resolve=>{release=resolve;});}};
  vm.runInNewContext(decks.slice(decks.indexOf('actions.finalize='),decks.indexOf('actions.lock=')),x);
  const attrs=new Map(),button={textContent:'Lock list',disabled:false,dataset:{deck:'d1'},getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  const pending=x.actions.finalize(button);
  ok(button.disabled&&attrs.get('aria-busy')==='true'&&button.textContent==='Checking the list…','Lock gives immediate disabled busy feedback before the network answers');
  await x.actions.finalize(button);ok(reads===1,'repeated activation while checking makes only one legality request');
  release(true);await pending;
  ok(!button.disabled&&!attrs.has('aria-busy')&&button.textContent==='Lock list','the checking state is cleaned up when review opens');
  ok(review[2].type==='finalize'&&review[2].deckId==='d1','review retains the real finalize command');
  await review[3].after();ok(C.lastNotice==='Locked · 46 to buy','the committed lock reports the current common readiness count');
}
function toast(){
  let click,storedRevision=7,undoCalls=0;const attrs={},el={replaceChildren(){},append(){},classList:{toggle(){}},hidden:false};
  const x={actions:{},state:{revision:7},undoRevision:7,undoAt:Date.now(),Date,noticeTimer:null,committing:false,$:()=>el,document:{createElement:()=>({addEventListener:(event,fn)=>{click=fn;}})},clearTimeout(){},setTimeout:()=>1,render:async()=>{},repo:{undo:async expected=>{undoCalls++;if(expected!==storedRevision)throw Error('Another tab changed the library.');storedRevision--;return {revision:storedRevision};}}};
  vm.runInNewContext(app.slice(app.indexOf('function notice('),app.indexOf('/* A NEW VERSION')),x);
  vm.runInNewContext(app.slice(app.indexOf('actions.undo='),app.indexOf('actions.history=')),x);
  x.notice('Locked · 46 to buy');const original=click;return {x,original,stored:()=>storedRevision,externalSave:()=>storedRevision++,calls:()=>undoCalls};
}
{
  const t=toast();await t.original();ok(t.stored()===6&&t.calls()===1,'the lock toast undoes its own current revision');
}
{
  const t=toast();t.x.state.revision=8;t.externalSave();await t.original();
  ok(t.stored()===8&&t.calls()===0,'an old toast refuses after an intervening local change');
}
{
  const t=toast();t.externalSave();await t.original();
  ok(t.stored()===8&&t.calls()===1,'a concurrent tab save is protected by the repository expected-revision check');
}
console.log(`lock-feedback: ${checks} checks passed; asynchronous busy feedback and transaction-bound Undo.`);
