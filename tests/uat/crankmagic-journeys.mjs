/* Production journeys use real Chromium + native IndexedDB, never a mocked
 * storage facade. The test-only context has an isolated browser profile. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require(process.env.UAT_PLAYWRIGHT||'playwright');
const BASE=process.env.UAT_BASE||'http://localhost:8790',ENTRY=process.env.CRANK_ENTRY||'index.html';
const browser=await chromium.launch({headless:true,...(process.env.UAT_CHROME?{executablePath:process.env.UAT_CHROME}:process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=x=>{assert.ok(x);checks++;};
const context=await browser.newContext({viewport:{width:1440,height:980},acceptDownloads:true}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const click=label=>page.getByRole('button',{name:label,exact:true}).click(),nav=label=>page.getByRole('link',{name:label,exact:true}).click();
const state=()=>page.evaluate(async()=>{const r=await CrankRepository.open();try{return await r.getState();}finally{r.close();}});
const waitDialog=()=>page.getByRole('dialog').waitFor({state:'hidden'});
const row=(name,source)=>page.locator('tbody tr').filter({has:page.getByRole('button',{name,exact:true})}).filter({hasText:source});
async function actionsFor(name,source){await row(name,source).getByRole('button',{name:'Actions',exact:true}).click();}
/* Mark Ordered, Mark Received / Owned and No longer wanted no longer open a dialog: they
   open a count strip beside the menu, and the green check is the commit. The check carries
   the action's own label as its accessible name, so it is found inside the strip rather
   than by a name that would also match the menu entry that opened it. */
async function count(label,n){
  await page.getByRole('button',{name:label,exact:true}).click();
  const strip=page.locator('.cm-step');await strip.waitFor({timeout:8000});
  await strip.locator('input').fill(String(n));
  await strip.getByRole('button',{name:label,exact:true}).click();
  await strip.waitFor({state:'detached',timeout:8000});
}
/* The rungs live in the Status fly-out now: hover its toggle, and a rung opens the same strip. */
async function rung(label,n){await page.locator('#cm-status-submenu-toggle').hover();await page.locator('#cm-status-submenu').getByRole('button',{name:label,exact:true}).waitFor();await count(label,n);}
async function newDeck(){await nav('My Decks');await click('Create a deck');await page.getByLabel('Card name or a Scryfall link').fill('Krenko, Mob Boss');await page.locator('[data-pick-card]').filter({has:page.getByText('Krenko, Mob Boss',{exact:true})}).click();await page.locator('#cm-dialog [name=name]').fill('Journey Goblins');await click('Create draft');await waitDialog();await click('Edit card list');await page.getByLabel('Cards (one per line, with quantity)').fill('1 Krenko, Mob Boss\n98 Mountain\n1 Lightning Bolt');await click('Resolve & save draft');await waitDialog();await click('Finalize & reserve');await click('Confirm change');await waitDialog();}
try{
 await page.goto(BASE+'/'+ENTRY);await page.getByRole('heading',{name:'Build it. Make it yours.'}).waitFor({timeout:45000});eq((await state()).lots.length,0);
 await newDeck();let current=await state();eq(current.decks[0].status,'final');eq(current.lots.length,0);ok(current.decks[0].slots.reduce((n,r)=>n+r.quantity,0)===100);
 await click('View deck cards');await page.getByRole('table').waitFor();eq(await page.locator('.cm-chip').innerText(),'Deck: Journey Goblins');
 await actionsFor('Mountain','To buy');await rung('Ordered',40);await page.waitForTimeout(700);current=await state();eq(current.lots[0].quantity,40);eq(current.lots[0].source,'ordered');
 await actionsFor('Mountain','Ordered');await rung('Owned',10);await page.waitForTimeout(700);current=await state();eq(current.lots.filter(l=>l.source==='owned').reduce((n,l)=>n+l.quantity,0),10);eq(current.lots.filter(l=>l.source==='ordered').reduce((n,l)=>n+l.quantity,0),30);
 /* THE PULL SHEET. Ten owned Mountains sit on the bench, reserved: the sheet lists them under
    Pull from bench, one tick puts the lot in the box, the row stays, greyed, and the deck's
    In box figure moves by the lot. Then back to the Collection where the journey was. */
 const rosterURL=page.url();await page.goto(BASE+'/'+ENTRY+'#pull?deck='+encodeURIComponent(current.decks[0].id));await page.locator('.cm-pull').waitFor({timeout:45000});
 eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-row').count(),1);eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-n').innerText(),'10');
 await page.locator('[data-pull-tick]').first().check();await page.locator('.cm-pull-row.is-done').waitFor({timeout:8000});current=await state();eq(current.lots.find(l=>l.source==='owned').location.kind,'deck');eq(CrankReadiness(current).inBox,10);
 eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-n').innerText(),'0');
 await page.goto(rosterURL);await page.getByRole('table').waitFor();
 await actionsFor('Mountain','Owned');await page.locator('#cm-put-submenu-toggle').hover();await page.locator('#cm-put-submenu').getByRole('button',{name:'Journey Goblins'}).click();await click('Confirm change');await waitDialog();current=await state();eq(current.lots.find(l=>l.source==='owned').location.kind,'deck');
 await actionsFor('Mountain','Owned');await page.locator('#cm-status-submenu-toggle').hover();await page.locator('#cm-status-submenu').getByRole('button',{name:'Ordered',exact:true}).click();await page.getByLabel('Copies affected').fill('2');await click('Confirm change');await waitDialog();await page.waitForTimeout(700);current=await state();eq(current.lots.filter(l=>l.source==='owned').reduce((n,l)=>n+l.quantity,0),8);eq(current.lots.filter(l=>l.source==='ordered').reduce((n,l)=>n+l.quantity,0),32);
 await page.reload();await page.getByRole('table').waitFor();eq((await state()).lots.filter(l=>l.source==='owned')[0].quantity,8);
 await click('Clear filters');await page.locator('.cm-chip').waitFor({state:'detached'});eq(await page.locator('.cm-chip').count(),0);await click('Columns');await page.getByLabel('Color',{exact:true}).check();await page.getByLabel('Source',{exact:true}).uncheck();await click('Apply columns');await waitDialog();ok((await state()).preferences.columns.includes('color'));eq(await page.getByRole('columnheader',{name:'Source'}).count(),0);eq(await page.locator('th, td').evaluateAll(els=>els.every(el=>getComputedStyle(el).textAlign==='left')),true);
 await click('Columns');await page.getByLabel('Source',{exact:true}).check();await click('Apply columns');await waitDialog();
 await click('Import list / library');await page.getByLabel('What does this input represent?').selectOption('owned');await page.getByLabel('New group name').fill('Journey inventory');await page.getByLabel('Or paste a list / CSV').fill('Card name,Quantity,Finish,Notes\nSol Ring,2,foil,exact print unknown\nArcane Signet,1,nonfoil,not reserved');await click('Parse input');await click('Resolve exact cards');await page.getByRole('heading',{name:'Review import',exact:true}).waitFor();await click('Import 2 reviewed rows');await waitDialog();current=await state();ok(current.groups.some(g=>g.name==='Journey inventory'));/* Four starter groups, the inventory this journey imported, and the group that arrived with the deck it built. */eq(current.groups.length,6);eq(current.decks.filter(d=>d.groupId).length,current.decks.length);eq(current.lots.filter(l=>l.cardId===CrankKey('Sol Ring')).reduce((n,l)=>n+l.quantity,0),2);
 await click('Clear filters');await actionsFor('Sol Ring','Owned');await click('Sell / Trade');await page.getByLabel('Copies affected').fill('1');await page.getByLabel('Availability',{exact:true}).selectOption('available');await click('Confirm change');await waitDialog();current=await state();eq(current.lots.filter(l=>l.offer==='available').reduce((n,l)=>n+l.quantity,0),1);eq(current.lots.filter(l=>l.cardId===CrankKey('Sol Ring')).reduce((n,l)=>n+l.quantity,0),2);
 // A native transaction must reject stale expected revisions, even with two
 // simultaneous callers outside the application UI.
 const conflict=await page.evaluate(async()=>{const a=await CrankRepository.open(),b=await CrankRepository.open(),s=await a.getState();try{const result=await Promise.allSettled([a.commit({type:'preferences',id:crypto.randomUUID(),values:{testConcurrent:'a'}},s.revision),b.commit({type:'preferences',id:crypto.randomUUID(),values:{testConcurrent:'b'}},s.revision)]);return result.map(r=>r.status).sort();}finally{a.close();b.close();}});eq(conflict,['fulfilled','rejected']);
 await page.reload();await page.getByRole('table').waitFor();
 // An injected quota failure exercises the actual transaction abort path.
 const quota=await page.evaluate(async()=>{const repo=await CrankRepository.open(),s=await repo.getState(),put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='state')throw new DOMException('Test quota','QuotaExceededError');return put.apply(this,args);};let message='';try{await repo.commit({type:'preferences',id:crypto.randomUUID(),values:{notSaved:true}},s.revision);}catch(e){message=e.message;}finally{IDBObjectStore.prototype.put=put;}const after=await repo.getState();repo.close();return {message,unchanged:JSON.stringify(s)===JSON.stringify(after)};});ok(quota.message.includes('Storage is full'));ok(quota.unchanged);
 await click('User Functions');const backupDownload=page.waitForEvent('download');await click('Save a backup file');const backupFile=await (await backupDownload).path(),backup=JSON.parse(await fs.readFile(backupFile,'utf8'));eq(backup.format,'crankmagic-backup');ok(backup.checksum.length===64);const expected=backup.payload.state;
 await click('User Functions');const xlsxDownload=page.waitForEvent('download');await click('Export as Excel');const xlsxPath=await (await xlsxDownload).path();ok((await fs.stat(xlsxPath)).size>5000);
 await click('User Functions');await click('Clear all data');await page.getByLabel('Type CLEAR to confirm').fill('CLEAR');await click('Clear local data');await waitDialog();eq((await state()).lots.length,0);
 await click('User Functions');await click('Restore from a backup file');await page.getByLabel('CrankMagic JSON backup').setInputFiles(backupFile);await click('Validate backup');await page.getByLabel('Type RESTORE to replace the library').fill('RESTORE');await click('Restore reviewed backup');await waitDialog();current=await state();eq(current.lots,expected.lots);eq(current.decks,expected.decks);eq(current.groups,expected.groups);
 await nav('Deck Lab');await page.locator('#cm-lab-form').waitFor({timeout:45000});
 /* Deck Lab's sections collapse now and Deck Definition starts closed, so the deck-name
    field is in the DOM but not fillable until it is opened. Opened here rather than right
    after nav(): the view renders asynchronously, so anything run before the form exists
    opens nothing. */
 const openLab=()=>page.evaluate(()=>document.querySelectorAll('#cm-lab-form details').forEach(d=>{d.open=true;}));
 await openLab();
 await page.locator('#cm-lab-form [name=commanderQuery]').fill('Krenko, Mob Boss');await page.locator('[data-lab-commander]').filter({has:page.getByText('Krenko, Mob Boss',{exact:true})}).click();await openLab();await page.locator('#cm-lab-form [name=deckName]').fill('Constructive run');await click('Run initial draft');await page.getByRole('button',{name:'Review draft cards'}).waitFor({timeout:45000});current=await state();
 /* THE DRAFT IS A PREVIEW, not a deck. This asserted a deck named 'Constructive run' in
    My Decks the moment the draft finished, which is what the Lab used to do -- running it
    three times to try three budgets left three decks behind. It deliberately does not any
    more: the draft is kept in preferences.labPreview and only "Save this deck" writes to
    My Decks. So the check is now that the 99 exists and that nothing was saved. */
 ok(!current.decks.some(d=>d.name==='Constructive run'));
 ok((current.preferences.labPreview?.slots||[]).length>1);
 eq(current.reports.length,0);
 /* Step 2 is ACTIVE once there is a 99 to refine -- it is the next thing you can do, and the
    run pane marks it as such. It was 'Waiting' before the pane gained an ordered sequence. */
 eq(await page.locator('#cm-step-2').getAttribute('aria-label'),'Active');
 /* SAVE THE DRAFT, AND THE DECK'S CARDS HAVE A HOME. A deck saved from the Lab arrives as a
    draft with a collection group made for it, and its cards show in the Collection as Draft
    list rows under that group -- each with a Status fly-out that turns a plan into a copy. */
 await click('Save this deck');await page.waitForTimeout(900);current=await state();
 const labDeck=current.decks.find(d=>d.name==='Constructive run');ok(labDeck&&labDeck.status==='draft');ok(labDeck.groupId&&current.groups.some(g=>g.id===labDeck.groupId));
 await nav('Collection');await page.getByRole('table').waitFor();
 await page.locator('select[name=groupPick]').selectOption(labDeck.groupId);await page.locator('.cm-chip').filter({hasText:'Group: Constructive run'}).waitFor();
 ok((await page.locator('tbody tr.cm-row-card').count())>1);
 const labTotal=labDeck.slots.filter(r=>r.purpose==='main').reduce((n,r)=>n+r.quantity,0);
 await page.locator('#cm-roster-query').fill('Krenko');await row('Krenko, Mob Boss','Draft list').waitFor();
 await actionsFor('Krenko, Mob Boss','Draft list');await rung('Owned',1);await page.waitForTimeout(900);current=await state();
 const krenko=current.lots.find(l=>l.source==='owned'&&l.groupIds.includes(labDeck.groupId));ok(krenko&&krenko.quantity===1);
 eq(await row('Krenko, Mob Boss','Draft list').count(),0);
 /* Grouped by deck, every band folds and unfolds from its heading. */
 await page.locator('#cm-roster-query').fill('');await page.waitForTimeout(300);
 await page.locator('select[name=groupBy]').selectOption('deck');const band=page.locator('.cm-group-toggle').first();await band.waitFor();
 await band.click();eq(await band.getAttribute('aria-expanded'),'false');
 await click('Collapse all groups');await click('Expand all groups');eq(await page.locator('.cm-group-toggle').first().getAttribute('aria-expanded'),'true');
 await page.locator('select[name=groupBy]').selectOption('');
 /* The whole draft at a status, from the deck page: every remaining card becomes a Wanted
    copy filed with the deck, so the group now holds the hundred as copies. */
 await click('Clear filters');await nav('My Decks');await page.locator('.cm-deck-tile').filter({hasText:'Constructive run'}).getByRole('button').first().click();
 await click('Card status');await click('Wanted');await click('Confirm change');await waitDialog();current=await state();
 eq(current.lots.filter(l=>l.groupIds.includes(labDeck.groupId)).reduce((n,l)=>n+l.quantity,0),labTotal);
 ok(current.lots.some(l=>l.source==='wanted'&&l.groupIds.includes(labDeck.groupId)));
 /* Simulation history: a measured report filed with the deck is a row on its page, opens
    as the Lab's own report, and the tile carries the score. */
 await page.evaluate(async deckId=>{const r=await CrankRepository.open();try{const s=await r.getState();const d=s.decks.find(x=>x.id===deckId);await r.commit({id:crypto.randomUUID(),type:'report',deckId,report:{kind:'report',origin:'measured',protocol:'published',deckFingerprint:CrankCollection.fingerprint(d),versions:{engine:'journey'},conditions:{seedCount:1,gamesPerSeed:1},metrics:{score:{value:61.5,unit:'points'},scoreStandardError:{value:0.4,unit:'points'},winRate:{value:27,unit:'%'},averageWinTurn:{value:11.2,unit:'turns'}},run:{games:1,elapsedMs:10},limits:['A journey report, not a measurement.']}},s.revision);}finally{r.close();}},labDeck.id);
 await page.reload();await page.locator('.cm-history-table').waitFor({timeout:45000});eq(await page.locator('.cm-history-table tbody tr').count(),1);
 await click('View report');await page.getByRole('dialog').getByText('Score',{exact:false}).first().waitFor();await page.getByRole('button',{name:'Close dialog'}).click();
 await nav('My Decks');await page.locator('.cm-deck-tile').filter({hasText:'Constructive run'}).getByText('61.5 pts').waitFor();checks+=1;
 /* MONEY ON THE BUY LIST. The Shop opens grouped by deck with a strip above the table: the
    total at sheet prices equals the sum of the band headers' subtotals, and Bought on a row
    is one tap that records the copy and stamps the sheet price as what was paid. */
 await nav('Shop');await page.locator('#cm-shop-total').waitFor({timeout:45000});
 const money=await page.evaluate(()=>{const num=t=>Number(String(t).replace(/[^0-9.]/g,''));return {total:num(document.querySelector('#cm-shop-total').textContent),bands:[...document.querySelectorAll('.cm-band-dollars')].map(el=>num(el.textContent))};});
 ok(money.total>0);eq(money.total.toFixed(2),money.bands.reduce((n,x)=>n+x,0).toFixed(2));
 await page.locator('#cm-roster-query').fill('Lightning Bolt');await page.waitForTimeout(300);await row('Lightning Bolt','Journey Goblins').getByRole('button',{name:'Bought',exact:true}).click();await page.waitForTimeout(900);current=await state();
 const bolt=current.lots.find(l=>l.cardId===CrankKey('Lightning Bolt'));ok(bolt&&bolt.source==='owned'&&bolt.allocation);eq(bolt.paidSource,'catalog');ok(bolt.paid>0);
 const afterLab=await state();
 await nav('Discover');await page.locator('#cm-graph').waitFor({timeout:45000});
 /* GRAPH NAVIGATION, through the controls the graph actually has now. This used to scroll to
    zoom and click a row in a neighbours list; that list was removed when the graph gained
    node and edge pop-ups, and #cm-graph-neighbors has not existed since -- the only trace
    left was a dead .cm-neighbors block in the stylesheet. Focus a card, then go Back, which
    is the same journey through the controls that replaced it. */
 await click('Search catalog / link');
 await page.getByLabel('Card name or a Scryfall link').fill('Sol Ring');
 await page.locator('[data-pick-card]').filter({has:page.getByText('Sol Ring',{exact:true})}).first().click();
 /* The card panel names whatever the graph is focused on, and the route carries it -- both
    are what actually change on a focus. The node count is not: it stays at whatever the ring
    holds, so asserting on it proved nothing and timed out waiting for a change that never
    comes. */
 await page.locator('#cm-card-view').getByText('Sol Ring',{exact:false}).first().waitFor({timeout:45000});
 ok(page.url().includes('card='));
 await click('Back');checks+=1;
 await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.locator('#cm-graph').waitFor({timeout:45000});await nav('Collection');await page.getByRole('table').waitFor();eq((await state()).lots,afterLab.lots);await context.setOffline(false);
 await page.setViewportSize({width:390,height:844});await nav('My Decks');await page.getByRole('heading',{name:'Build it. Make it yours.'}).waitFor();ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));const navBox=await page.getByRole('navigation',{name:'Main pages'}).boundingBox();ok(navBox.y>=0&&navBox.y<844);await nav('Collection');await page.getByRole('table').waitFor();ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 eq(errors,[]);console.log(`crankmagic-journeys: ${checks} checks passed across real deck assembly, imports, printing lots, corrections, concurrency, quota abort, backup restore, initial construction, graph navigation, offline and mobile.`);
}catch(error){console.error(error);console.error((await page.locator('body').innerText()).slice(0,8500));await page.screenshot({path:'tests/uat/crankmagic-failure.png',fullPage:true});process.exitCode=1;}finally{await browser.close();}
function CrankKey(name){return 'card:'+Buffer.from(name.normalize('NFKC').trim().toLowerCase()).toString('base64url');}
function CrankReadiness(s){const M=require('../../collection-model.js');return M.readiness(s,s.decks[0]);}
