/* One native account popover: grouped actions, verified gates, keyboard and shared-anchor behavior. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser,ROOT} from './uat/browser-runner.mjs';
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++;},eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const {browser,base,stub,close}=await openBrowser({name:'account-menu-r4',flag:'GEOMETRY_REQUIRED'});
const shots=process.env.UAT_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
try{
  for(const test of [{name:'signed-out',signed:false,admin:false,width:1440,theme:'dark'},{name:'signed-in-phone',signed:true,admin:false,width:390,theme:'bronze-dark'},{name:'admin-light',signed:true,admin:true,width:1440,theme:'light'}]){
    const context=await browser.newContext({viewport:{width:test.width,height:900},serviceWorkers:'block'}),page=await context.newPage();if(stub)await stub(page);
    await page.addInitScript(()=>(globalThis.CrankFeatures||=[]).push(C=>{globalThis.__menuC=C;}));
    const html=readFileSync(path.join(ROOT,'index.html'),'utf8').replace('<head>','<head><meta name="crankmagic-accounts" content="on">');
    await page.route('**/index.html*',r=>r.fulfill({contentType:'text/html',body:html}));
    const writes=[];
    await page.route('**/api/**',r=>{const req=r.request(),p=new URL(req.url()).pathname;if(req.method()!=='GET')writes.push(p);
      if(p==='/api/me')return r.fulfill({status:test.signed?200:401,json:test.signed?{email:'reader@example.test',admin:test.admin}:{error:'Signed out'}});
      if(p==='/api/library')return r.fulfill({json:{head:req.method()==='GET'?null:{id:'fixture-head',savedAt:new Date().toISOString(),revision:JSON.parse(req.postData()||'{}').revision}}});
      if(p==='/api/social/me')return r.fulfill({status:test.signed?200:401,json:test.signed?{name:'Reader',email:'reader@example.test',canInvite:test.admin}:{error:'Signed out'}});
      return r.fulfill({status:503,json:{error:'External/account changes are blocked in this isolated menu test.'}});
    });
    await page.goto(base+'/index.html#decks');await page.waitForFunction(()=>globalThis.__menuC?.accountMenuOpen&&document.querySelector('.cm-decks-stages,.cm-decks-empty'));
    await page.evaluate(async()=>{await Promise.all([__menuC.adminReady,__menuC.sharingReady]);});
    await page.waitForFunction(signed=>document.querySelector('#cm-account').textContent.includes(signed?'Signed in as':'Signed out'),test.signed);
    const trigger=page.locator('#cm-user-functions'),menu=page.locator('#cm-user-menu');
    await trigger.click();await page.locator('#cm-user-menu:popover-open').waitFor();
    eq(await menu.locator(':scope > .cm-menu-group').evaluateAll(groups=>groups.filter(g=>!g.hidden).map(g=>g.getAttribute('aria-label'))),test.signed?['You','This device','Your data','Skin','Help','Careful','Sign out']:['You','This device','Your data','Skin','Help','Careful'],test.name+' has ordered visible groups');
    eq(await menu.getAttribute('role'),null,'native account controls do not claim an unimplemented ARIA menu role');
    eq(await menu.locator('[role=menuitem]').count(),0,'buttons retain native keyboard semantics');
    eq(await menu.getByRole('button',{name:'Settings',exact:true}).count(),1,'Settings appears once');
    eq(await menu.locator('[data-action=account-sign-in]').count(),test.signed?0:1,'sign-in follows account state');
    eq(await menu.locator('[data-action=account-sync]').count(),test.signed?1:0,'manual sync is offered only to signed-in accounts');
    eq(await menu.locator('[data-action=account-sign-out]').count(),test.signed?1:0,'Sign out follows account state');
    eq(await menu.locator('[data-admin-link]').count(),test.admin?1:0,'Admin follows the verified administrator flag');
    eq(await menu.locator('[data-action=invite-crankmagic]').count(),test.admin?1:0,'Invite keeps its separate verified permission gate');
    if(test.admin)ok(await menu.locator('[data-admin-link]').evaluate(n=>n.closest('.cm-menu-group').getAttribute('aria-label')==='You'),'Admin is in You, before the standalone Sign out');
    eq(await trigger.getAttribute('aria-expanded'),'true','the actual invoker exposes expanded state');
    ok(await page.evaluate(()=>__menuC.accountMenuOpen()&&document.getElementById('cm-user-menu').contains(document.activeElement)),'opening focuses a native control in the shared node');
    const focused=await page.evaluate(()=>document.activeElement.dataset.action);await page.keyboard.press('Tab');
    ok(await page.evaluate(old=>document.getElementById('cm-user-menu').contains(document.activeElement)&&document.activeElement.dataset.action!==old,focused),'Tab moves through native controls');
    await page.evaluate(()=>{globalThis.__menuDraftChanges=0;document.addEventListener('keydown',e=>{if(e.key==='Escape')globalThis.__menuDraftChanges++;});});
    await page.keyboard.press('Escape');
    eq(await page.evaluate(()=>({open:__menuC.accountMenuOpen(),draft:__menuDraftChanges,focus:document.activeElement.id})),{open:false,draft:0,focus:'cm-user-functions'},'menu Escape closes, restores focus and never reaches later draft handlers');
    eq(await trigger.getAttribute('aria-expanded'),'false','closed invoker exposes collapsed state');
    await page.evaluate(()=>{const anchor=document.createElement('button');anchor.id='fixture-board-avatar';anchor.textContent='Board account';anchor.style='position:fixed;right:8px;top:8px;z-index:100';document.body.append(anchor);anchor.focus();__menuC.openAccountMenu(anchor);});
    await page.locator('#cm-user-menu:popover-open').waitFor();
    eq(await page.locator('#cm-user-menu').count(),1,'board-like anchor opens the same single menu node');
    eq(await page.locator('#fixture-board-avatar').getAttribute('aria-expanded'),'true','programmatic shared opener gets actual expanded state');
    const fit=await menu.evaluate(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};});
    ok(fit.left>=0&&fit.top>=0&&fit.right<=fit.width&&fit.bottom<=fit.height,'menu fits the viewport from a right-edge anchor');
    await page.evaluate(()=>__menuC.closeAccountMenu());
    eq(await page.evaluate(()=>document.activeElement.id),'fixture-board-avatar','explicit shared close restores the captured alternate anchor');
    await page.locator('#fixture-board-avatar').evaluate(n=>n.remove());
    await trigger.click();await page.locator('#cm-user-menu:popover-open').waitFor();
    await page.mouse.click(test.width-5,895);await page.waitForFunction(()=>!__menuC.accountMenuOpen());
    eq(await trigger.getAttribute('aria-expanded'),'false','native light-dismiss updates the actual trigger state');
    await trigger.click();await menu.locator('[data-theme-skin=bronze-basalt]').click();
    await page.waitForFunction(()=>document.getElementById('matrix-v2').dataset.palette==='bronze-basalt');
    await trigger.click();await menu.locator('[data-theme-mode=light]').click();
    await page.waitForFunction(()=>document.getElementById('matrix-v2').dataset.palette==='bronze-basalt'&&document.getElementById('matrix-v2').dataset.theme==='light');
    await trigger.click();
    eq(await menu.locator('[data-theme-skin=bronze-basalt]').getAttribute('aria-pressed'),'true','Skin selection remains accessible and functional');
    eq(await menu.locator('[data-theme-mode=light]').getAttribute('aria-pressed'),'true','register selection remains accessible and functional');
    await menu.locator('[data-action=reset-all]').click();await page.locator('#cm-dialog form.cm-destructive').waitFor();
    ok(await page.getByLabel('Type RESET to confirm').count()===1,'Careful invokes the existing typed RESET confirmation');
    eq(writes.filter(p=>p!=='/api/library'),[],'opening/canceling menu controls writes no account, mail, Admin or AI state');
    await page.locator('#cm-dialog [data-action=close]').first().click();
    await page.evaluate(async theme=>{await __menuC.actions['set-theme']({dataset:{themeChoice:theme}});},test.theme==='dark'?'sapphire-obsidian':test.theme==='light'?'sapphire-obsidian-light':'bronze-basalt');
    await trigger.click();await page.locator('#cm-user-menu:popover-open').waitFor();
    const contrast=await menu.locator('[data-action=reset-all]').evaluate(n=>{const c=document.createElement('canvas').getContext('2d'),rgb=css=>{c.clearRect(0,0,1,1);c.fillStyle=css;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data];},lum=a=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),L=[lum(rgb(getComputedStyle(n).color)),lum(rgb(getComputedStyle(n.closest('.cm-menu-group')).backgroundColor))].sort((a,b)=>b-a);return (L[0]+.05)/(L[1]+.05);});
    ok(contrast>=4.5,'Careful text has 4.5:1 contrast on its actual group background');
    if(shots){await page.screenshot({path:path.join(shots,'account-menu-'+test.name+'.png')});await menu.evaluate(n=>{n.scrollTop=n.scrollHeight;});await page.screenshot({path:path.join(shots,'account-menu-'+test.name+'-foot.png')});}
    await context.close();
  }
  // Both entry documents ship the same static groups; runtime account slots preserve their gates.
  for(const entry of ['index.html','crankmagic.html']){const html=readFileSync(path.join(ROOT,entry),'utf8');ok(html.includes('class="cm-menu cm-account-menu" popover="auto"')&&html.includes('aria-label="Careful"')&&html.includes('id="cm-account-device"'),entry+' contains the canonical native menu structure');}
}finally{await close();}
console.log(`account-menu-r4: ${checks} checks passed; one grouped native popover, gated actions, shared anchors and keyboard/focus.`);
