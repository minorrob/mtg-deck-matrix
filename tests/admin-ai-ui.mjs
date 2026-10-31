/* THE OWNER'S ADMIN PANES in the browser (ROB-338; crankmagic-admin-ai.js, crankmagic-admin.js).
 *
 *   hidden     a General or Insider account, and an administrator who is not the owner, see neither pane (no nav link, no menu
 *              entry) and a deep link to one fetches nothing from the owner's routes
 *   AI model   the owner sees what is in force and the API's list (only the models CrankMagic allows can be chosen; the others
 *              say why not), chooses one (a PUT with the app's header), sees it in force, and Undo puts the old one back
 *   refusal    a refusal from the Worker is shown, and nothing in the page claims a change
 *   AI-only    the owner makes a table with only AI seats (observe: true, private, Normal, no person's seat, no AI on Claude),
 *              its AI seats get decks from the lobby's own routine, and the browser goes to the table
 *   phone      the panes fit a phone without page-level horizontal scrolling
 * The Worker is stood in for here; tests/admin-ai-model.mjs and tests/admin-ai-table.mjs prove its half.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {openBrowser,ROOT} from './uat/browser-runner.mjs';
let checks=0;const ok=(value,message)=>{checks++;assert.ok(value,message);};const eq=(a,b,message)=>{checks++;assert.deepEqual(a,b,message);};
const {browser,base,stub,close}=await openBrowser({name:'admin-ai-ui',flag:'GEOMETRY_REQUIRED'});
const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('<head>','<head><meta name="crankmagic-accounts" content="on">');
const LIST=[
  {id:'claude-haiku-5-5',name:'Claude Haiku 5.5',allowed:true},{id:'claude-sonnet-5-5',name:'Claude Sonnet 5.5',allowed:true},
  {id:'claude-opus-5',name:'Claude Opus 5',allowed:false,reason:'CrankMagic does not use this model: it is dearer than the models Rob allows (claude-haiku-5-5 and claude-sonnet-5-5).'}];
/* A Worker for the model setting that keeps what it is told, as the real one does. */
function modelWorker(){
  const s={model:'claude-haiku-5-5',source:'default',previous:null,calls:[],refuse:null};
  const answer=()=>({owner:true,model:{id:s.model,source:s.source},previous:s.previous,default:'claude-haiku-5-5',updatedAt:s.previous?'2026-10-31T18:00:00.000Z':null,storage:'ready',
    models:LIST.map(m=>({...m,current:m.id===s.model}))});
  return {state:s,handle:async route=>{
    const r=route.request(),p=new URL(r.url()).pathname;s.calls.push({method:r.method(),path:p,headers:r.headers(),body:r.postData()});
    if(s.refuse&&r.method()!=='GET')return route.fulfill({status:422,json:{error:s.refuse}});
    if(r.method()==='PUT'){const m=JSON.parse(r.postData()).model;s.previous=s.model;s.model=m;s.source='stored';}
    if(p.endsWith('/undo')){const was=s.model;s.model=s.previous;s.previous=was;}
    return route.fulfill({json:answer()});}};
}
async function session({admin,group}){
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),page=await context.newPage();if(stub)await stub(page);
  const worker=modelWorker(),tables=[],other=[];
  await page.route('**/index.html*',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.route('**/api/me',r=>r.fulfill({json:{email:'someone@example.test',head:null,admin,group}}));
  await page.route('**/api/library',r=>r.fulfill({json:{head:null}}));
  await page.route('**/api/social/me',r=>r.fulfill({json:{name:'Someone',email:'someone@example.test',canInvite:false}}));
  await page.route('**/api/admin/ai-model**',worker.handle);
  await page.route('**/api/admin',r=>{other.push(r.request().url());return r.fulfill({json:{readOnly:true,features:[],invitationsEnabled:false}});});
  await page.route('**/api/tables**',r=>{
    const req=r.request(),p=new URL(req.url()).pathname;tables.push({method:req.method(),path:p,body:req.postData()});
    if(req.method()==='POST'&&p==='/api/tables')return r.fulfill({status:201,json:{table:{tableId:'obstable0001',phase:'selecting',youAreHost:true,observe:true,seats:[0,1,2].map(seatId=>({seatId,kind:'ai',name:`AI ${seatId+1}`,occupied:true}))}}});
    if(p.endsWith('/known'))return r.fulfill({json:{unknown:[]}});
    if(p.endsWith('/rules')||p.endsWith('/deck'))return r.fulfill({json:{table:{}}});
    return r.fulfill({status:404,json:{error:'stood in'}});});
  return {context,page,worker,tables,other};
}
const ownerCalls=x=>x.worker.state.calls.length;
try{
  /* HIDDEN from anyone but the owner. */
  for(const [name,admin,group] of [['a General account',false,'general'],['an Insider',false,'insider'],['an administrator who is not the owner',true,'insider']]){
    const x=await session({admin,group}),{page}=x;
    await page.goto(base+'/index.html#admin?section=ai-model');
    if(admin)await page.getByRole('heading',{name:'Overview'}).waitFor();else await page.getByRole('heading',{name:'Administrator access required'}).waitFor();
    eq(await page.getByRole('link',{name:'AI model'}).count()+await page.getByRole('link',{name:'AI-only game'}).count(),0,`${name}: no AI model or AI-only game link`);
    ok(await page.locator('[data-admin-ai-model],[data-admin-ai-game]').count()===0,`${name}: no pane in the page`);
    eq(ownerCalls(x),0,`${name}: a deep link to the pane fetched nothing from the owner's routes`);
    await page.goto(base+'/index.html#admin?section=ai-game');
    await page.waitForTimeout(300);
    eq([ownerCalls(x),await page.locator('[data-admin-ai-game]').count()],[0,0],`${name}: nor does the AI-only game's deep link show it`);
    await x.context.close();
  }

  /* THE OWNER's AI MODEL pane. */
  const x=await session({admin:true,group:'owner'}),page=x.page;
  await page.goto(base+'/index.html#admin');
  await page.locator('.cm-admin-nav').getByRole('link',{name:'AI model',exact:true}).waitFor();
  ok(await page.locator('.cm-admin-nav').getByRole('link',{name:'AI-only game',exact:true}).count()===1,'the owner has both panes in the Admin navigation');
  eq(ownerCalls(x),0,'and the owner\'s routes are asked nothing until a pane is opened');
  await page.locator('.cm-admin-nav').getByRole('link',{name:'AI model',exact:true}).click();
  await page.getByRole('heading',{name:'AI model',exact:true}).waitFor();
  const text=()=>page.locator('[data-admin-ai-model]').innerText();
  ok(await text().then(t=>t.includes('In use: Claude Haiku 5.5 (claude-haiku-5-5)')&&t.includes('the built-in default')),'the model in force, and where it came from');
  const rowOf=async name=>page.locator('[data-admin-ai-model] tbody tr').filter({hasText:name});
  eq(await (await rowOf('Claude Opus 5')).getByRole('button').count(),0,'a model CrankMagic does not allow has no button');
  ok(await (await rowOf('Claude Opus 5')).innerText().then(t=>t.includes('CrankMagic does not use this model')),'and says why');
  eq(await (await rowOf('Claude Haiku 5.5')).getByRole('button').count(),0,'the model in use has no button either');
  ok(await page.getByRole('button',{name:/^Undo/}).count()===0&&await text().then(t=>t.includes('Nothing to undo')),'nothing to undo before a change');

  x.worker.state.refuse='The models API does not list that model for this key. Nothing was changed.';
  await (await rowOf('Claude Sonnet 5.5')).getByRole('button',{name:'Use this model'}).click();
  await page.locator('#cm-admin-ai-status').filter({hasText:'does not list that model'}).waitFor();
  ok(await text().then(t=>t.includes('In use: Claude Haiku 5.5')),'a refusal is shown, and the model in use is still the old one');
  x.worker.state.refuse=null;
  x.worker.state.calls.length=0;

  await (await rowOf('Claude Sonnet 5.5')).getByRole('button',{name:'Use this model'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-admin-ai-model]')?.innerText.includes('In use: Claude Sonnet 5.5'));
  const put=x.worker.state.calls.find(c=>c.method==='PUT');
  eq([put.path,JSON.parse(put.body),put.headers['x-crankmagic'],put.headers['content-type']],['/api/admin/ai-model',{model:'claude-sonnet-5-5'},'sync','application/json'],'the change is a PUT of the chosen model, with the app\'s header');
  ok(await text().then(t=>t.includes('your choice here')),'the pane now reads the new model from the Worker, as stored');
  await page.getByRole('button',{name:'Undo: go back to claude-haiku-5-5'}).waitFor();
  await page.getByRole('button',{name:'Undo: go back to claude-haiku-5-5'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-admin-ai-model]')?.innerText.includes('In use: Claude Haiku 5.5'));
  ok(x.worker.state.calls.some(c=>c.method==='POST'&&c.path==='/api/admin/ai-model/undo'),'Undo is one POST, and the old model is in force again');

  /* THE AI-ONLY GAME pane. */
  await page.locator('.cm-admin-nav').getByRole('link',{name:'AI-only game',exact:true}).click();
  await page.getByRole('heading',{name:'AI-only game',exact:true}).waitFor();
  ok(await page.locator('[data-admin-ai-game]').innerText().then(t=>t.includes('you decide nothing')&&t.includes('spends nothing')),'it says you observe, decide nothing, and that nothing is spent');
  eq(await page.locator('#cm-admin-ai-seats option').allInnerTexts(),['2','3','4'],'two to four AI seats');
  eq(await page.locator('#cm-admin-ai-seats').inputValue(),'2','two by default: the narrowest table');
  await page.locator('#cm-admin-ai-seats').selectOption('3');
  await page.getByRole('button',{name:'Make the table and watch'}).click();
  await page.waitForFunction(()=>location.hash.startsWith('#table'));
  const made=x.tables.find(t=>t.method==='POST'&&t.path==='/api/tables'),body=JSON.parse(made.body);
  eq([body.observe,body.privacy,body.seats.length,body.seats.every(s=>s.kind==='ai'&&s.level==='normal')],[true,'private',3,true],'it asks for an observed table: private, three AI seats at Normal, none of them a person or the AI on Claude');
  ok(!body.seats.some(s=>s.level==='llm'||s.kind==='human'),'no seat on Claude and no person\'s seat');
  ok(x.tables.some(t=>t.path==='/api/tables/obstable0001/rules'),'the rules are saved as the lobby saves them');
  ok(x.tables.some(t=>t.path==='/api/tables/obstable0001/known'),'and the AI seats\' decks are chosen by the lobby\'s own routine');
  eq(x.tables.filter(t=>t.method==='POST'&&t.path.endsWith('/deck')).map(t=>JSON.parse(t.body).seatId).sort(),[0,1,2],'each AI seat is given a deck');
  eq(await page.evaluate(()=>location.hash),'#table?id=obstable0001','the browser goes to the table');

  /* THE PHONE. */
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/index.html#admin?section=ai-model');
  await page.getByRole('heading',{name:'AI model',exact:true}).waitFor();
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the AI model pane fits a phone without page-level horizontal scrolling');
  await page.goto(base+'/index.html#admin?section=ai-game');
  await page.getByRole('heading',{name:'AI-only game',exact:true}).waitFor();
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'and so does the AI-only game pane');
  await x.context.close();
}finally{await close();}
console.log(`admin-ai-ui: ${checks} checks passed — the owner's AI model and AI-only game panes appear for the owner alone, change and undo the model through the Worker's routes, and make an AI-only table.`);
