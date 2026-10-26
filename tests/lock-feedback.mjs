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
  let storedRevision=7,undoCalls=0;const timers=[];
  class Element{constructor(tag='div'){this.tagName=tag;this.childNodes=[];this.dataset={};this.attributes={};this.style={};this.hidden=false;this.className='';this.handlers={};this.classList={toggle:(name,on)=>{const set=new Set(this.className.split(' ').filter(Boolean));on?set.add(name):set.delete(name);this.className=[...set].join(' ');}};}append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.childNodes.push(node);}}replaceChildren(...nodes){for(const node of this.childNodes)node.parentElement=null;this.childNodes=[];this.append(...nodes);}remove(){if(this.parentElement)this.parentElement.childNodes=this.parentElement.childNodes.filter(n=>n!==this);this.parentElement=null;}setAttribute(k,v){this.attributes[k]=v;}addEventListener(event,fn){this.handlers[event]=fn;}closest(){for(let n=this;n;n=n.parentElement)if(n.className.split(' ').includes('cm-toast'))return n;return null;}getBoundingClientRect(){return {height:60};}querySelector(){return all(this).find(n=>n.dataset.undoRevision!==undefined)||null;}}
  const all=node=>node.childNodes.flatMap(child=>[child,...all(child)]),body=new Element(),el=new Element();el.id='cm-notice';el.className='cm-toast';el.hidden=true;body.append(el);
  const find=id=>all(body).find(n=>n.id===id)||null;
  const x={actions:{},state:{revision:7},undoRevision:7,undoAt:Date.now(),Date,noticeTimer:null,committing:false,$:s=>find(s.slice(1)),document:{createElement:tag=>new Element(tag),querySelectorAll:()=>all(body).filter(n=>n.dataset.undoRevision!==undefined)},clearTimeout:t=>{if(t)t.cleared=true;},setTimeout:(fn,delay)=>{const t={fn,delay};timers.push(t);return t;},render:async()=>{},repo:{undo:async expected=>{undoCalls++;if(expected!==storedRevision)throw Error('Another tab changed the library.');storedRevision--;return {revision:storedRevision};}}};
  vm.runInNewContext(app.slice(app.indexOf('function notice('),app.indexOf('/* A NEW VERSION')),x);
  vm.runInNewContext(app.slice(app.indexOf('actions.undo='),app.indexOf('actions.history=')),x);
  x.notice('Locked · 46 to buy',false,{undo:true});const original=el.childNodes.find(n=>n.textContent==='Undo').handlers.click;return {x,el,find,timers,original,stored:()=>storedRevision,externalSave:()=>storedRevision++,calls:()=>undoCalls};
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
{
  const t=toast();ok(t.timers.length===0,'a transaction-owned Undo has no seven-second timer');
  t.x.notice('Link copied.');const pinned=t.find('cm-undo-notice');
  ok(pinned?.querySelector('[data-undo-revision]')&&t.el.childNodes.every(n=>n.textContent!=='Undo'),'an unrelated success keeps the original receipt separately and gets no arbitrary global Undo');
  t.timers.at(-1).fn();ok(t.el.hidden&&!pinned.hidden,'the ordinary success times out while the applicable Undo remains');
  t.x.state.revision=8;t.x.invalidateUndoNotice();ok(!t.find('cm-undo-notice'),'an intervening revision removes the stale pinned Undo');
}
{
  const t=toast();t.x.notice('Could not save.',true);const before=t.timers.length;
  ok(t.el.attributes.role==='alert'&&t.el.attributes['aria-live']==='assertive'&&before===0,'errors use alert semantics without an eighteen-second timer');
  await t.el.childNodes.find(n=>n.attributes['aria-label']==='Dismiss error notice').handlers.click();
  ok(t.el.hidden&&t.stored()===7,'Dismiss closes an error without changing the library');
}
{
  const t=toast();let dismissed=0;t.x.notice('A new version is ready.',false,{stay:true,dismiss:()=>{dismissed++;},dismissLabel:'Dismiss update notice'});
  const buttons=t.el.childNodes.filter(n=>n.tagName==='button');ok(buttons.length===1,'an explicit caller dismissal is not duplicated');await buttons[0].handlers.click();ok(dismissed===1,'the update caller retains its own session-suppression callback');
}
console.log(`lock-feedback: ${checks} checks passed; asynchronous busy feedback and transaction-bound Undo.`);
