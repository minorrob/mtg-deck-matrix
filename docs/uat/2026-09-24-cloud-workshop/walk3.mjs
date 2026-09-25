import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const BASE='https://crankmagic.com/';
const ROOT='/workspace/uat-2026-09-24-cloud-workshop';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitReady(page){for(let i=0;i<90;i++){if(!(await page.locator('text=Opening your library').count())){await sleep(600);return;}await sleep(400);}}
async function dismiss(page){for(let i=0;i<4;i++){await page.keyboard.press('Escape').catch(()=>{});const c=page.locator('dialog[open] .cm-dialog-close').first();if(await c.count())await c.click({force:true}).catch(()=>{});await sleep(150);}}
async function shot(page,dir,name){await page.screenshot({path:path.join(dir,`${name}.png`),fullPage:false});}

async function run(label,viewport){
  const dir=path.join(ROOT,'evidence',label);
  const log=[]; const consoleErrs=[]; const pageErrs=[]; const failed=[];
  const browser=await chromium.launch({executablePath:'/opt/google/chrome/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport,hasTouch:label==='mobile',isMobile:label==='mobile'});
  const page=await context.newPage();
  page.on('console',m=>{if(m.type()==='error')consoleErrs.push(m.text());});
  page.on('pageerror',e=>pageErrs.push(String(e.message||e)));
  page.on('response',res=>{if(res.status()>=400){const u=res.url(); if(!/cloudflare|favicon/i.test(u))failed.push({status:res.status(),url:u.slice(0,180)});}});

  // recreate deck quickly for this fresh profile
  await page.goto(BASE+'#decks',{waitUntil:'domcontentloaded',timeout:90000});
  await waitReady(page); await dismiss(page);
  await page.getByRole('button',{name:'New deck'}).click({force:true}); await sleep(600);
  await page.locator('[data-action="wizard-create"]').click({force:true}); await sleep(800);
  // pick Atraxa from list (visible in popular)
  const atr=page.locator('dialog[open] button, dialog[open] [data-action]').filter({hasText:/Atraxa/i}).first();
  if(await atr.count()){await atr.click({force:true});}
  else {
    const inp=page.locator('dialog[open] input').first();
    await inp.fill("Atraxa"); await sleep(1000);
    await page.locator('dialog[open] button:has-text("Atraxa")').first().click({force:true}).catch(()=>page.keyboard.press('Enter'));
  }
  await sleep(800);
  const name=page.locator('dialog[open] input[name="name"]');
  if(await name.count()) await name.fill('UAT-CW-2026-09-24-Atraxa');
  await page.locator('dialog[open] button:has-text("Create draft")').click({force:true});
  await sleep(1500); await dismiss(page);
  await shot(page,dir,'24d-deck-ready');

  // open deck detail
  await page.locator('text=Atraxa').first().click({force:true}).catch(()=>{});
  await sleep(1200); await shot(page,dir,'24e-deck-open');
  const deckText=await page.evaluate(()=>document.body.innerText.slice(0,2000));
  log.push('deckDetail:'+deckText.slice(0,400));

  // help ?
  const help=page.locator('button:has-text("?"), [aria-label*="help" i], .cm-help').first();
  if(await help.count()&&await help.isVisible()){await help.click({force:true}); await sleep(600); await shot(page,dir,'10b-help'); await dismiss(page); log.push('help opened');}

  // Import via wizard
  await page.goto(BASE+'#decks'); await waitReady(page); await dismiss(page);
  await page.getByRole('button',{name:'New deck'}).first().click({force:true}); await sleep(500);
  await page.locator('[data-action="wizard-import"]').click({force:true}); await sleep(800);
  await shot(page,dir,'30c-import-path');
  const importText=await page.evaluate(()=>(document.querySelector('dialog[open]')?.innerText||'').slice(0,600));
  log.push('import:'+importText.slice(0,300));
  await dismiss(page);

  // Library
  await page.goto(BASE+'#cards'); await waitReady(page); await sleep(700); await shot(page,dir,'50d-library');
  for(const tab of ['Library','To buy','Orders']){
    const t=page.getByRole('button',{name:tab}).or(page.locator(`[role=tab]:has-text("${tab}")`)).first();
    if(await t.count()){await t.click({force:true}).catch(()=>{}); await sleep(400); await shot(page,dir,`52b-${tab.replace(/\s/g,'-').toLowerCase()}`);}
  }
  for(const v of ['List','Sheet','Table']){
    const b=page.getByRole('button',{name:v}).first();
    if(await b.count()&&await b.isVisible().catch(()=>false)){await b.click({force:true}); await sleep(400); await shot(page,dir,`51c-${v.toLowerCase()}`);}
  }
  // Add card
  const add=page.getByRole('button',{name:/Add/i}).first();
  if(await add.count()&&await add.isVisible().catch(()=>false)){
    await add.click({force:true}); await sleep(700); await shot(page,dir,'50e-add');
    const inp=page.locator('dialog[open] input').first();
    if(await inp.count()){
      await inp.fill('Sol Ring'); await sleep(1000);
      const sug=page.locator('dialog[open] button:has-text("Sol Ring")').first();
      if(await sug.count()) await sug.click({force:true});
      await sleep(800); await shot(page,dir,'56c-card');
      for(const lab of ['Wanted','To buy','Owned','Add to library','Add']){
        const w=page.locator(`dialog[open] button:has-text("${lab}")`).first();
        if(await w.count()&&await w.isVisible().catch(()=>false)){await w.click({force:true}); await sleep(500); await shot(page,dir,'57c-acquire'); break;}
      }
    }
    await dismiss(page);
  }
  // search if present
  const search=page.locator('input[type=search], input[placeholder*="Search" i]').first();
  if(await search.count()&&await search.isVisible().catch(()=>false)){await search.fill('Sol'); await sleep(700); await shot(page,dir,'53b-search');}

  // Explore
  await page.goto(BASE+'#discover'); await waitReady(page); await sleep(1000); await shot(page,dir,'60c-explore');
  const exploreDump=await page.evaluate(()=>{
    const doors=[...document.querySelectorAll('[data-action],button,a')].map(b=>({t:(b.textContent||'').replace(/\s+/g,' ').trim().slice(0,90),a:b.getAttribute('data-action')||'',vis:!!(b.offsetParent||b.getClientRects().length)}))
      .filter(x=>x.vis && (/explore|commander|card|role|gap|deck/i.test(x.t+x.a))).slice(0,25);
    return {text:document.body.innerText.slice(0,800),doors};
  });
  log.push('explore:'+JSON.stringify(exploreDump).slice(0,800));
  // click a door
  const door=page.locator('[data-action*="explore"], .cm-explore-door').first();
  if(await door.count()){await door.click({force:true}); await sleep(900); await shot(page,dir,'61d-door');}
  else {
    const byCmd=page.getByRole('button',{name:/commander/i}).first();
    if(await byCmd.count()){await byCmd.click({force:true}); await sleep(900); await shot(page,dir,'61d-door');}
  }
  const inp2=page.locator('dialog[open] input, input[type=search]').first();
  if(await inp2.count()&&await inp2.isVisible().catch(()=>false)){
    await inp2.fill('Atraxa'); await sleep(900);
    const s=page.locator('button:has-text("Atraxa")').first();
    if(await s.count()) await s.click({force:true}); else await page.keyboard.press('Enter');
    await sleep(2000); await shot(page,dir,'61e-scoped');
  }
  const canvas=page.locator('#cm-main canvas, main canvas, canvas').first();
  if(await canvas.count()){
    const box=await canvas.boundingBox();
    if(box){await page.mouse.click(box.x+box.width*0.45, box.y+box.height*0.45); await sleep(700);}
    await shot(page,dir,'62c-graph');
  }

  // Play detail text
  await page.goto(BASE+'#game'); await waitReady(page); await sleep(700); await shot(page,dir,'05c-play');
  const play=await page.evaluate(()=>(document.querySelector('#cm-main,main')||document.body).innerText.slice(0,1000));
  log.push('play:'+play.slice(0,500));

  // Account/menu
  await page.goto(BASE+'#decks'); await waitReady(page);
  const menu=page.getByRole('button',{name:/Menu/i}).or(page.locator('button:has-text("☰")')).first();
  if(await menu.count()&&await menu.isVisible().catch(()=>false)){await menu.click({force:true}); await sleep(500); await shot(page,dir,'11b-menu');}
  const sign=page.locator('button:has-text("Sign"), button:has-text("Account"), [data-action*="account"]').first();
  if(await sign.count()&&await sign.isVisible().catch(()=>false)){await sign.click({force:true}); await sleep(700); await shot(page,dir,'11c-account'); const at=await page.evaluate(()=>(document.querySelector('dialog[open]')?.innerText||document.body.innerText).slice(0,500)); log.push('account:'+at); await dismiss(page);}

  // How a deck
  const how=page.locator('a:has-text("How a deck"), button:has-text("How a deck")').first();
  if(await how.count()){await how.click({force:true}); await sleep(1000); await shot(page,dir,'44-how-deck'); log.push('how:'+ (await page.evaluate(()=>document.body.innerText.slice(0,300))));}

  // geometry mobile
  const geo=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight}));
  log.push('geo:'+JSON.stringify(geo));

  // UK check full
  const uk=[...new Set((await page.evaluate(()=>document.body.innerText)).match(/\b(colour|colours|organise|organised|organisation|centre|centres|catalogue|catalogues|favour|favourite|aluminium|defence|licence|practise|travelling|modelling)\b/gi)||[])];
  log.push('uk:'+uk.join(','));

  await browser.close();
  const out={label,log,consoleErrs:consoleErrs.slice(0,40),pageErrs,failed:failed.slice(0,30),geo,uk};
  fs.writeFileSync(path.join(ROOT,`raw3-${label}.json`),JSON.stringify(out,null,2));
  console.log(label,'done', 'errs',pageErrs.length,consoleErrs.length,'failed',failed.length,'uk',uk);
  return out;
}
await run('desktop',{width:1280,height:800});
await run('mobile',{width:390,height:844});
