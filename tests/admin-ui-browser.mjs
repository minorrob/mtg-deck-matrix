/* Admin's actual entry-point registration, private views and phone fit in Chromium. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser,ROOT} from './uat/browser-runner.mjs';
let checks=0;const ok=(value,message)=>{checks++;assert.ok(value,message);};
const {browser,base,stub,close}=await openBrowser({name:'admin-ui-browser',flag:'GEOMETRY_REQUIRED'});
const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('<head>','<head><meta name="crankmagic-accounts" content="on">');
const shots=process.env.UAT_SHOTS;
async function session(admin){const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),page=await context.newPage();if(stub)await stub(page);const privileged=[];
  await page.route('**/index.html*',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.route('**/api/me',r=>r.fulfill({json:{email:'owner@example.test',head:null,admin}}));
  await page.route('**/api/library',r=>r.fulfill({json:{head:null}}));
  await page.route('**/api/social/me',r=>r.fulfill({json:{name:'Owner',email:'owner@example.test',canInvite:false}}));
  await page.route('**/api/admin**',r=>{privileged.push(r.request().url());const p=new URL(r.request().url()).pathname;
    const value=p.endsWith('/features')?{readOnly:true,features:[{key:'SHARING',value:'off',defaultValue:'off',source:'Code default'}]}:p.endsWith('/invites')?{readOnly:true,invites:[{name:'Test player',email:'player@example.test',createdAt:'2026-10-26T12:00:00Z',status:'admitted',deliveryStatus:'failed'}],next:null}:p.endsWith('/spend')?{readOnly:true,since:'2026-10-25T12:00:00Z',until:'2026-10-26T12:00:00Z',calls:4,spentCents:125,capCents:500}:p.endsWith('/health')?{readOnly:true,release:{commit:'test-source',profile:'cloud-staging',date:'2026-10-26'}}:{readOnly:true,features:[],invitationsEnabled:false};return r.fulfill({status:admin?200:403,json:admin?value:{error:'Administrator access required.'}});});
  return {context,page,privileged};}
try{
  const ordinary=await session(false);await ordinary.page.goto(base+'/index.html#admin?section=people');await ordinary.page.getByRole('heading',{name:'Administrator access required'}).waitFor();
  ok(ordinary.privileged.length===0,'a non-admin deep link never fetches private admin data');ok(await ordinary.page.locator('[data-admin-link]').count()===0,'ordinary account has no Admin menu row');await ordinary.context.close();
  const x=await session(true),page=x.page;await page.goto(base+'/index.html#admin?section=features');await page.getByRole('heading',{name:'Feature switches',exact:true}).waitFor();
  ok(await page.locator('.cm-admin-nav').count()===1,'the real entry point registers the Admin module');ok(await page.locator('.cm-table').innerText().then(t=>t.includes('SHARING')&&t.includes('Code default')),'feature values and their code defaults render');
  ok(await page.locator('#cm-main input,#cm-main select').count()===0,'read-only feature flags cannot be edited');
  if(shots){mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'admin-features-1440.png'),fullPage:true});}
  await page.getByRole('link',{name:'People and invites',exact:true}).click();await page.getByRole('cell',{name:'player@example.test',exact:true}).waitFor();
  const row=await page.locator('.cm-table tbody tr').innerText();ok(row.includes('admitted')&&row.includes('failed'),'admission and email delivery remain separate');
  await page.getByRole('link',{name:'AI spend',exact:true}).click();await page.getByRole('heading',{name:'AI spend · last 24 hours',exact:true}).waitFor();ok(await page.locator('#cm-main').innerText().then(t=>t.includes('$1.25')&&t.includes('4 calls')),'rolling spend reads as dollars and calls');
  await page.setViewportSize({width:390,height:844});await page.getByRole('link',{name:'Release and health',exact:true}).click();await page.getByRole('definition').filter({hasText:'test-source'}).waitFor();
  ok(await page.locator('#cm-main').innerText().then(t=>t.includes('10/26/2026')),'a release calendar date keeps its US date');ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin fits the phone without page-level horizontal scrolling');
  if(shots)await page.screenshot({path:path.join(shots,'admin-health-390.png'),fullPage:true});await x.context.close();
}finally{await close();}
console.log(`admin-ui-browser: ${checks} checks passed; actual routing, authorization-aware reads and phone fit.`);
