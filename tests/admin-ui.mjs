/* The Admin client reads only verified server state and never invents write controls. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../crankmagic-admin.js',import.meta.url),'utf8');
let checks=0;const ok=(value,message)=>{checks++;assert.ok(value,message);};
function setup({enabled=true,admin=false,section='home',responses={}}={}){
  const requests=[],slots=[];let currentView='admin',params=new URLSearchParams(section==='home'?'':{section});
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const menu={querySelector:()=>slots.at(-1)||null,append:x=>slots.push(x),addEventListener:()=>{}};
  const document={querySelector:()=>({content:enabled?'on':'off'}),getElementById:()=>menu,createElement:()=>({dataset:{},innerHTML:'',remove(){slots.splice(slots.indexOf(this),1);}})};
  const context={CrankFeatures:[],document,URLSearchParams,Date,fetch:async(path,options)=>{requests.push({path,options});const answer=responses[path]??(path==='/api/me'?{admin}:{readOnly:true,features:[],invitationsEnabled:false});return Response.json(typeof answer==='function'?await answer():answer);}};
  vm.runInNewContext(source,context);
  const C={esc:e,button:(label,action)=>`<button data-action="${action}">${e(label)}</button>`,actions:{},views:{},main:{innerHTML:''},pageHead:title=>`<h1>${e(title)}</h1>`,route:()=>({view:currentView,params}),render:()=>C.views.admin()};
  context.CrankFeatures[0](C);
  return {C,requests,slots,setView:view=>{currentView=view;},setSection:s=>{params=new URLSearchParams({section:s});}};
}
{
  const x=setup({enabled:false});await x.C.adminReady;await x.C.views.admin();
  ok(x.requests.length===0,'a copy with accounts disabled makes no account or admin request');
  ok(x.C.main.innerHTML.includes('Administrator access required'),'disabled accounts do not reveal admin pages');
}
{
  const x=setup();await x.C.adminReady;await x.C.views.admin();
  ok(x.requests.every(r=>r.path==='/api/me'),'a non-admin never requests admin data');
  ok(x.C.adminMenu()===''&&x.slots.length===0,'a non-admin gets no Admin row');
}
{
  const x=setup({admin:true,section:'features',responses:{'/api/admin/features':{features:[{key:'SHARING',value:'off',defaultValue:'off',source:'Code default'}]}}});await x.C.adminReady;await x.C.views.admin();
  ok(x.C.adminMenu().includes('#admin'),'the verified administrator gets an Admin row');
  ok(x.C.main.innerHTML.includes('SHARING')&&x.C.main.innerHTML.includes('Code default'),'feature current value, code default and source are visible');
  ok(!/type="checkbox"|<select|Reset/.test(x.C.main.innerHTML),'read-only features have no pretend edit or reset controls');
  ok(x.requests.every(r=>!r.options.method||r.options.method==='GET'),'the Admin UI makes no mutation request');
  ok(x.requests.every(r=>r.options.credentials==='same-origin'&&r.options.redirect==='manual'&&r.options.cache==='no-store'),'requests preserve authenticated private no-cache behavior');
  x.setSection('people');await x.C.views.admin();ok(x.C.main.innerHTML.includes('No invitations yet.'),'an empty invite list has an honest empty state');
  x.setSection('health');await x.C.views.admin();ok(x.C.main.innerHTML.includes('Release details unavailable.'),'missing release metadata is not invented');
}
{
  const x=setup({admin:true,section:'people',responses:{'/api/admin/invites':{invites:[{email:'<person>',name:'<script>',createdAt:'2026-10-26T12:00:00Z',status:'admitted',deliveryStatus:'failed'}],next:{before:'2026-10-25',after:'cursor'}}}});await x.C.adminReady;await x.C.views.admin();
  ok(!x.C.main.innerHTML.includes('<script>')&&x.C.main.innerHTML.includes('&lt;script&gt;'),'invitation names are escaped');
  ok(x.C.main.innerHTML.includes('admitted')&&x.C.main.innerHTML.includes('failed'),'admission and delivery states stay separate');
  ok(x.C.main.innerHTML.includes('More invitations')&&x.C.main.innerHTML.includes('after=cursor'),'the server pagination cursor is preserved');
  ok(!x.C.main.innerHTML.includes('Resend')&&!x.C.main.innerHTML.includes('Revoke'),'no unsupported invitation mutations are offered');
}
{
  let resolveIdentity,reads=0;
  const x=setup({admin:true,responses:{'/api/me':()=>++reads===1?{admin:true}:new Promise(resolve=>{resolveIdentity=resolve;})}});
  await x.C.adminReady;const pending=x.C.views.admin();x.setView('decks');x.C.main.innerHTML='Deck page';resolveIdentity({admin:true});await pending;
  ok(x.C.main.innerHTML==='Deck page','a delayed identity response cannot overwrite the page navigated to');
  ok(x.requests.every(r=>r.path==='/api/me'),'the abandoned Admin view requests no privileged data');
}
{
  const oldTZ=process.env.TZ;process.env.TZ='America/New_York';
  try{const x=setup({admin:true,section:'health',responses:{'/api/admin/health':{release:{commit:'abc',profile:'cloud-staging',date:'2026-10-26'}}}});await x.C.adminReady;await x.C.views.admin();
    ok(x.C.main.innerHTML.includes('10/26/2026')&&!x.C.main.innerHTML.includes('10/25/2026'),'a date-only release stays on its calendar date in the US timezone');
  }finally{if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;}
}
{
  const pending=[];
  const x=setup({admin:true,section:'features',responses:{'/api/admin/features':()=>new Promise(resolve=>pending.push(resolve))}});await x.C.adminReady;
  const older=x.C.views.admin();while(pending.length<1)await new Promise(resolve=>setTimeout(resolve,0));
  x.setView('decks');x.C.main.innerHTML='Deck page';x.setView('admin');const newer=x.C.views.admin();while(pending.length<2)await new Promise(resolve=>setTimeout(resolve,0));
  pending[1]({features:[{key:'NEW_VALUE',value:'on',defaultValue:'off',source:'Worker configuration'}]});await newer;
  pending[0]({features:[{key:'OLD_VALUE',value:'off',defaultValue:'off',source:'Code default'}]});await older;
  ok(x.C.main.innerHTML.includes('NEW_VALUE')&&!x.C.main.innerHTML.includes('OLD_VALUE'),'returning to the same Admin route rejects an older response resolved last');
}
{
  const x=setup({responses:{'/api/me':()=>{throw Error('Connection unavailable.');}}});await x.C.adminReady;await x.C.views.admin();
  ok(x.C.main.innerHTML.includes('Connection unavailable.')&&x.C.main.innerHTML.includes('Retry'),'an account read failure has a recoverable error rather than a false permission diagnosis');
  ok(x.requests.every(r=>r.path==='/api/me'),'a failed identity read never requests privileged data');
}
console.log(`admin-ui: ${checks} checks passed; verified identity, read-only views, privacy and setup states.`);
