/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Manual density acceptance, not the joined feature journey or live-table legality proof.
 * node tests/uat/r4-live-density.mjs
 * Optional UAT_BASE=<local built site>; eventual staging requires UAT_DENSITY_STAGING=1 after the release gate.
 * UAT_BACKUP=<local backup>, UAT_DENSITY_OUT=<outside every Git checkout>.
 * Defaults: a locally served staging-profile build, fresh browser contexts, copied native backup, six cases.
 * No real accounts, cloud writes, mail, provider calls, persistent profile, HAR, video or trace.
 * Card pictures use the existing offline stub: screenshots prove density and geometry, not real-art acceptance.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {ROOT,findPlaywright,launchBrowser} from './browser-runner.mjs';
import {stubNetwork} from './scryfall-stub.mjs';
const require=createRequire(import.meta.url),E=require('../../collection-exchange.js');
const STAGING='https://staging.crankmagic.com';
export const THEMES=['sapphire-obsidian','sapphire-obsidian-light','bronze-basalt'];
export function summaryOf(s){return {decks:s.decks.filter(d=>!d.archived).length,groups:s.groups.length,lots:s.lots.length,cards:Object.keys(s.cards).length,deckCards:s.decks.filter(d=>!d.archived).map(d=>d.slots.reduce((n,x)=>n+x.quantity,0)).sort((a,b)=>a-b)};}
export function requestPolicy(raw,method,base){const url=new URL(raw),origin=new URL(base).origin;
  if(url.origin===origin&&url.pathname==='/api/tables/known'&&method==='POST')return 'local-capability';
  if(!['GET','HEAD'].includes(method))return 'deny-write';
  if(url.origin!==origin)return 'deny-external';
  if(url.pathname.startsWith('/api/'))return 'local-api';
  return 'asset';
}
export function accessHeaders(original,raw,base,{id,secret}={}){const headers=Object.fromEntries(Object.entries(original).filter(([key])=>!/^cf-access-client-(id|secret)$/i.test(key)));
  if(new URL(base).origin===STAGING&&new URL(raw).origin===STAGING&&id&&secret){headers['cf-access-client-id']=id;headers['cf-access-client-secret']=secret;}
  return headers;
}
export function privateOutput(target){let ancestor=path.resolve(target);while(!existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('No artifact parent');ancestor=parent;}
  try{execFileSync('git',['-C',realpathSync(ancestor),'rev-parse','--show-toplevel'],{stdio:'pipe'});}catch(error){if(error.status===128&&/not a git repository/i.test(String(error.stderr)))return path.resolve(target);throw Error('Cannot verify artifact isolation');}
  throw Error('Density artifacts must be outside every Git checkout');
}
export function anonymousLabel(original,kind,index){const words=String(original||'').trim().split(/\s+/).filter(Boolean);
  if(!words.length)return `Fixture ${kind} ${index}`;
  return words.map((word,position)=>{const length=Array.from(word).length,seed=position===0?`${kind}${index}fixture`:'samplefixture';return Array.from({length},(_,i)=>seed[i%seed.length]).join('');}).join(' ');
}
async function copyFixture(source,out){const payload=await E.readBackup(readFileSync(source,'utf8')),s=structuredClone(payload.state),before=summaryOf(s);
  // Keep cards, quantities, prints, allocations and statuses. Rename current deck/group labels and clear deck/lot notes and paid costs.
  // This is still a private fixture copy: the outside-Git artifact rule applies to the complete backup and every capture.
  s.decks.forEach((d,i)=>{d.name=anonymousLabel(d.name,'Deck',i+1);d.notes='';if('description'in d)d.description='';});
  s.groups.forEach((g,i)=>{g.name=anonymousLabel(g.name,'Group',i+1);});
  s.lots.forEach(l=>{l.notes='';l.paid=null;});
  const backup=await E.backup({state:s,history:[]}),copy=path.join(out,'native-restore-fixture.json');
  writeFileSync(copy,JSON.stringify(backup));const verified=await E.readBackup(readFileSync(copy,'utf8'));
  assert.deepEqual(summaryOf(verified.state),before,'The fixture copy retains its density');
  return {copy,expected:before};
}
async function localSite(){const {build,worktreeSource}=await import('../../tools/release-pages.mjs');const {built,problems}=build({source:worktreeSource(),profileName:'cloud-staging'});
  assert.deepEqual(problems,[],'Local staging-profile build verifies');
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.webm':'video/webm','.mp3':'audio/mpeg'};
  const server=createServer((req,res)=>{let key=new URL(req.url,'http://fixture.local').pathname.slice(1)||'index.html';if(!built.has(key)&&!path.extname(key))key+='.html';const body=built.get(key);if(!body){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':types[path.extname(key)]||'application/octet-stream','cache-control':'no-store'}).end(body);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {base:`http://crankmagic.localhost:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
async function restore(page,base,copy){await page.goto(`${base}/index.html#decks`);await page.getByRole('heading',{name:'Decks',level:1,exact:true}).waitFor({timeout:60000});
  await page.evaluate(()=>{location.hash='#settings';});await page.getByRole('heading',{name:'Settings',level:1}).waitFor();await page.getByRole('button',{name:'Restore from a backup file',exact:true}).click();
  await page.getByLabel('CrankMagic JSON backup').setInputFiles(copy);await page.getByRole('button',{name:'Validate backup',exact:true}).click();
  await page.getByLabel('Type RESTORE to replace the library').fill('RESTORE');await page.getByRole('button',{name:'Restore reviewed backup',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
}
async function inspect(page,scope){await page.evaluate(()=>document.fonts.ready);return page.locator(scope).evaluate(root=>{
  const issues=[],visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
  if(document.documentElement.scrollWidth>innerWidth+2)issues.push('page-horizontal-overflow');
  for(const el of root.querySelectorAll('h1,h2,[role=tab],button,a,input,textarea,select')){
    if(!visible(el)||el.closest('.cm-sr-only'))continue;const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    if((el.matches('h1,h2,[role=tab]'))&&parseFloat(s.fontSize)<12)issues.push('representative-text-below-12px');
    if(el.matches('button,input,textarea,select')&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')&&!el.getAttribute('title')&&!el.textContent.trim()&&!el.labels?.length&&!el.querySelector('img[alt]:not([alt=""])'))issues.push('unnamed-control');
    if(el.matches('h1,h2')&&(r.left< -2||r.right>innerWidth+2))issues.push('heading-outside-viewport');
  }
  const primary=[...root.querySelectorAll('.v-button.primary,.cm-btn--primary')].filter(visible);
  if(primary.length>1)issues.push('multiple-visible-primary-actions');
  return {issues:[...new Set(issues)],primary:primary.length,primaryActions:primary.map(el=>el.dataset.action||el.tagName.toLowerCase())};
});}
export async function run(){const source=process.env.UAT_BACKUP||path.join(ROOT,'data/live-state.json');
  const out=privateOutput(process.env.UAT_DENSITY_OUT||mkdtempSync(path.join(os.tmpdir(),'crankmagic-r4-density-')));mkdirSync(out,{recursive:true});
  const sourceDigest=createHash('sha256').update(readFileSync(source)).digest('hex');
  const {copy,expected}=await copyFixture(source,out);let local=null,base=(process.env.UAT_BASE||'').replace(/\/+$/,'');
  if(base){const url=new URL(base);if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('UAT_BASE must be an origin');
    const loopback=url.protocol==='http:'&&(url.hostname.endsWith('.localhost')||['localhost','127.0.0.1'].includes(url.hostname));
    if(!loopback&&!(url.origin===STAGING&&process.env.UAT_DENSITY_STAGING==='1'))throw Error('Only local fixtures or explicitly gated staging are allowed');
    base=url.origin;
  }else{local=await localSite();base=local.base;}
  let browser;try{const pwPath=findPlaywright();if(!pwPath)throw Error('Playwright is required');const pw=await import(path.isAbsolute(pwPath)?pathToFileURL(pwPath).href:pwPath);browser=await launchBrowser(pw);}catch(error){await local?.close();throw error;}
  const harnessCommit=execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),cases=[];let checks=0,servedRelease=null;
  try{for(const width of [1440,390])for(const theme of THEMES){const result={width,theme,screens:[],issues:[],blockedWrites:0,unavailableCapabilityReads:0,externalBlocked:0,pageErrors:0};let step='profile',page;
    const context=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block',acceptDownloads:false});
    try{
      await context.route('**/*',async route=>{const req=route.request(),policy=requestPolicy(req.url(),req.method(),base);
        if(policy==='local-capability'){result.unavailableCapabilityReads++;return route.fulfill({status:503,json:{error:'Engine-known availability is deliberately unavailable in this density fixture.'}});}
        if(policy==='deny-write'){result.blockedWrites++;return route.fulfill({status:403,json:{error:'Writes are disabled in this isolated acceptance profile.'}});}
        if(policy==='deny-external'){result.externalBlocked++;return route.abort('blockedbyclient');}
        if(policy==='local-api'){const endpoint=new URL(req.url()).pathname;
          if(endpoint==='/api/me')return route.fulfill({status:401,json:{error:'Isolated fixture; no account.'}});
          if(endpoint==='/api/library')return route.fulfill({json:{head:null}});
          if(endpoint.startsWith('/api/ai-'))return route.fulfill({json:{open:false}});
          return route.fulfill({status:403,json:{error:'Online services are disabled in this fixture.'}});
        }
        const headers=accessHeaders(req.headers(),req.url(),base,{id:process.env.CF_ACCESS_CLIENT_ID,secret:process.env.CF_ACCESS_CLIENT_SECRET});
        if(new URL(base).origin===STAGING){try{const response=await route.fetch({headers,maxRedirects:0});return route.fulfill({response});}catch{return route.fulfill({status:502,body:'Staging asset read unavailable.'});}}
        return route.continue({headers});
      });
      await context.routeWebSocket('**/*',socket=>socket.close());
      await context.addInitScript(()=>{(globalThis.CrankFeatures||=[]).push(C=>{globalThis.__r4Density={summary:()=>({decks:C.state.decks.filter(d=>!d.archived).length,groups:C.state.groups.length,lots:C.state.lots.length,cards:Object.keys(C.state.cards).length,deckCards:C.state.decks.filter(d=>!d.archived).map(d=>d.slots.reduce((n,x)=>n+x.quantity,0)).sort((a,b)=>a-b)}),representative:()=>[...C.state.decks].filter(d=>!d.archived).sort((a,b)=>b.slots.length-a.slots.length)[0]?.id,theme:t=>C.actions['set-theme']({dataset:{themeChoice:t}}),build:id=>C.actions['define-deck']({dataset:{deck:id}})};});});
      page=await context.newPage();page.on('pageerror',()=>result.pageErrors++);await stubNetwork(page);
      step='native-restore';await restore(page,base,copy);await page.waitForFunction(()=>globalThis.__r4Density?.summary().decks>0);
      assert.deepEqual(await page.evaluate(()=>__r4Density.summary()),expected,'Native restore retains saved density');checks++;
      const metadata=await page.evaluate(()=>fetch('/version.json').then(r=>r.ok?r.json():null).catch(()=>null));
      if(metadata&&/^[a-f0-9]{7,40}$/i.test(metadata.commit||''))servedRelease={commit:metadata.commit,profile:['cloud-staging','cloud-production','pages'].includes(metadata.profile)?metadata.profile:null};else result.issues.push({screen:'release',code:'release-metadata-unavailable'});
      step='theme';await page.evaluate(t=>__r4Density.theme(t),theme);const deckId=await page.evaluate(()=>__r4Density.representative());
      const capture=async(name,scope='#cm-main')=>{step=name;await page.locator(scope).waitFor();const observed=await inspect(page,scope);checks++;result.issues.push(...observed.issues.map(code=>({screen:name,code})));result.screens.push({name,primary:observed.primary,primaryActions:observed.primaryActions});await page.screenshot({animations:'disabled',path:path.join(out,`${width}-${theme}-${name}.png`)});};
      await capture('decks');assert.equal(await page.locator('[data-deck-tile]').count(),expected.decks,'Saved deck tiles match restored decks');checks++;
      await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(deckId)}`);await page.locator('.cm-deck-hero').waitFor({timeout:45000});await capture('deck');
      await page.locator('[data-action=deck-tab][data-tab=hundred]').click();await page.waitForFunction(()=>new URLSearchParams(location.hash.split('?')[1]).get('tab')==='hundred');await capture('hundred');
      await page.evaluate(id=>__r4Density.build(id),deckId);await page.locator('#cm-dialog.cm-flow-dialog[open]').waitFor();await capture('build','#cm-dialog');await page.keyboard.press('Escape');await page.locator('#cm-dialog').waitFor({state:'hidden'});
      await page.locator('[data-action=deck-tab][data-tab=acquire]').click();await page.waitForFunction(()=>new URLSearchParams(location.hash.split('?')[1]).get('tab')==='acquire');await capture('acquire');
      await page.goto(`${base}/index.html#cards`);await page.getByRole('heading',{name:'Library',level:1,exact:true}).waitFor({timeout:30000});await capture('library');
      const focusable=page.locator('#cm-main button:visible,#cm-main a:visible,#cm-main input:visible').first();await focusable.focus();await page.keyboard.press('Tab');
      const focus=await page.evaluate(()=>{const el=document.activeElement,s=getComputedStyle(el);return {visible:el!==document.body&&el.getClientRects().length>0,ring:parseFloat(s.outlineWidth)>0&&s.outlineStyle!=='none'||s.boxShadow!=='none'};});checks++;if(!focus.visible||!focus.ring)result.issues.push({screen:'library',code:'keyboard-focus-not-visible'});
      await page.goto(`${base}/index.html#playHome`);await page.locator('#cm-play-home').waitFor({timeout:30000});await capture('play-home');
      assert.deepEqual(await page.evaluate(()=>__r4Density.summary()),expected,'Browsing and Build preview retain fixture density');checks++;
      if(result.blockedWrites)result.issues.push({screen:'network',code:'unexpected-write-attempt'});if(result.pageErrors)result.issues.push({screen:'runtime',code:'page-exception'});
    }catch(error){result.issues.push({screen:step,code:error.name==='AssertionError'?'assertion-failed':'step-failed',errorType:error.name});if(page)await page.screenshot({animations:'disabled',path:path.join(out,`${width}-${theme}-failure.png`)}).catch(()=>{});}
    finally{await context.close();cases.push(result);console.log(`r4-live-density: ${width}/${theme}: ${result.screens.length} screens, ${result.issues.length} findings`);}
  }}finally{await browser.close();await local?.close();}
  const sourceUnchanged=createHash('sha256').update(readFileSync(source)).digest('hex')===sourceDigest;checks++;
  if(!sourceUnchanged)cases.push({width:null,theme:null,screens:[],issues:[{screen:'fixture',code:'source-fixture-changed'}]});
  const report={schema:'CrankR4DensityAcceptance@1',sourceUnchanged,harnessCommit,servedRelease,base:new URL(base).origin,expected,checks,cases,limits:['Offline card-image placeholders; not real-art acceptance.','No joined game, provider, mail, account sync, service worker or live-table legality exercised.','Representative geometry/control names/focus checks, not a full accessibility audit.']};
  writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2));
  console.log(`r4-live-density: ${checks} checks, ${cases.reduce((n,c)=>n+c.issues.length,0)} findings; local artifacts ${out}`);
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const report=await run();process.exitCode=report.cases.some(c=>c.issues.length)?1:0;}catch(error){console.error(`r4-live-density: setup failed (${error.name}); no fixture or credential contents printed.`);process.exitCode=1;}}
