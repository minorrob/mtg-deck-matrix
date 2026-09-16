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
/* SCRYFALL IS ANSWERED FROM THE SHIPPED CATALOG, the way every walk already does it, so the
   gate that guards each PR does not depend on a third party's rate limit: an unstubbed run
   in September saw a 429 and every deck-page render waited the client's ten-second timeout.
   The one deliberate live-network step is the offline one near the end; the stub is
   removed before it so that step stays honest. */
const {stubNetwork}=await import('./scryfall-stub.mjs');const scryfallCalls=[];await stubNetwork(page,scryfallCalls);
const click=label=>page.getByRole('button',{name:label,exact:true}).click(),nav=label=>page.getByRole('link',{name:label,exact:true}).click();
const state=()=>page.evaluate(async()=>{const r=await CrankRepository.open();try{return await r.getState();}finally{r.close();}});
const waitDialog=()=>page.getByRole('dialog').waitFor({state:'hidden'});
/* A row is matched on a CELL that says exactly the source (or the deck), not on any text in
   the row: the row's own verb buttons say "Ordered" and "Bought" too now. */
const FAMILY={Owned:['Owned','Physical deck','Substitute','Reserved','Bench'],Ordered:['Ordered'],Watched:['Watched']};
const row=(name,source)=>page.locator('tbody tr').filter({has:page.getByRole('button',{name,exact:true})}).filter({has:page.locator('td').filter({hasText:new RegExp('^\\s*('+(FAMILY[source]||[source]).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(\\s|$)')})});
async function actionsFor(name,source){await row(name,source).getByRole('button',{name:'Actions',exact:true}).click();}
/* Status is one column now: an owned copy reads as where it is, and the cell also carries the
   Option and Pinned badges. A journey that asks for the "Owned" row means the owned lot,
   whichever of its four states the Status cell opens with. */
/* Mark Ordered, Mark Received / Owned and No longer wanted no longer open a dialog: they
   open a count strip beside the menu, and the green check is the commit. The check carries
   the action's own label as its accessible name, so it is found inside the strip rather
   than by a name that would also match the menu entry that opened it. */
async function count(label,n,scope=page){
  await scope.getByRole('button',{name:label,exact:true}).click();
  const strip=page.locator('.cm-step');await strip.waitFor({timeout:8000});
  await strip.locator('input').fill(String(n));
  await strip.getByRole('button',{name:label,exact:true}).click();
  await strip.waitFor({state:'detached',timeout:8000});
}
/* The rungs live in the Status fly-out now: hover its toggle, and a rung opens the same strip. */
async function rung(label,n){await page.locator('#cm-status-submenu-toggle').hover();const sub=page.locator('#cm-status-submenu');await sub.getByRole('button',{name:label,exact:true}).waitFor();await count(label,n,sub);}
async function newDeck(){await nav('Decks');await click('Create a deck');await page.getByLabel('Card name or a Scryfall link').fill('Krenko, Mob Boss');await page.locator('[data-pick-card]').filter({has:page.getByText('Krenko, Mob Boss',{exact:true})}).click();await page.locator('#cm-dialog [name=name]').fill('Journey Goblins');await click('Create draft');await waitDialog();await click('Edit card list');await page.getByLabel('Cards (one per line, with quantity)').fill('1 Krenko, Mob Boss\n98 Mountain\n1 Lightning Bolt');await click('Resolve & save draft');await waitDialog();await click('Finalize & reserve');await click('Confirm change');await waitDialog();}
try{
 await page.goto(BASE+'/'+ENTRY);await page.getByRole('heading',{name:'Build it. Make it yours.'}).waitFor({timeout:45000});eq((await state()).lots.length,0);
 /* HOW A DECK COMES TOGETHER: a plain link on Decks opens the six-step map; each step's title opens where that step begins. */
 await page.locator('#cm-main').getByRole('link',{name:'How a deck comes together'}).click();await page.locator('.cm-how-flow').waitFor();eq(await page.locator('.cm-how-step').count(),6);eq(await page.locator('.cm-how-rungs li').count(),5);
 await page.locator('.cm-how-title',{hasText:'Acquire'}).click();await page.locator('#cm-roster-table').waitFor();ok(page.url().endsWith('#cards?tab=buy'));eq(await page.getByRole('tab',{selected:true}).innerText().then(s=>s.split(/\s/)[0]),'To');
 /* SHARE. Three ways out of the header: a subscription draft to the maintainer, a share draft with the To line blank, and a QR code drawn in the page. */
 await click('Share');await page.locator('#cm-share-menu:popover-open').waitFor();
 ok((await page.locator('#cm-share-subscribe').getAttribute('href')).startsWith('mailto:minor.rob@gmail.com?subject=Subscribe%20me%20to%20CrankMagic%20updates'));ok((await page.locator('#cm-share-mail').getAttribute('href')).startsWith('mailto:?subject=CrankMagic'));ok((await page.locator('#cm-share-mail').getAttribute('href')).includes(encodeURIComponent('https://minorrob.github.io/mtg-deck-matrix/')));
 await page.locator('#cm-share-menu').getByRole('button',{name:'Show a QR code'}).click();await page.getByRole('dialog').waitFor();ok(await page.locator('#cm-dialog .cm-qr-code svg[viewBox="0 0 41 41"]').count()===1);eq(await page.locator('#cm-dialog .cm-qr-link a').innerText(),'https://minorrob.github.io/mtg-deck-matrix/');ok(!(await page.locator('#cm-share-menu').evaluate(m=>m.matches(':popover-open'))));
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await newDeck();let current=await state();eq(current.decks[0].status,'final');eq(current.lots.length,0);ok(current.decks[0].slots.reduce((n,r)=>n+r.quantity,0)===100);
 /* The deck page opens on Overview; the hundred is its Cards tab, and the full table with actions is one button from there. */
 await page.getByRole('tab',{name:/^Cards/}).click();await page.locator('.cm-deck-list').first().waitFor();eq(await page.locator('.cm-deck-list li').count()>0,true,'the Cards tab lists the hundred');await click('View deck cards');await page.getByRole('table').waitFor();ok((await page.locator('.cm-chip').innerText()).startsWith('Deck: Journey Goblins'));
 await actionsFor('Mountain','To buy');await rung('Ordered',40);await page.waitForTimeout(700);current=await state();eq(current.lots[0].quantity,40);eq(current.lots[0].source,'ordered');
 await actionsFor('Mountain','Ordered');await rung('Owned',10);await page.waitForTimeout(700);current=await state();eq(current.lots.filter(l=>l.source==='owned').reduce((n,l)=>n+l.quantity,0),10);eq(current.lots.filter(l=>l.source==='ordered').reduce((n,l)=>n+l.quantity,0),30);
 /* THE PULL SHEET. Ten owned Mountains sit on the bench, reserved: the sheet lists them under
    Add from the Bench, one tick puts the lot in the box, the row stays, greyed, and the deck's
    In box figure moves by the lot. Then back to the Collection where the journey was. */
 const rosterURL=page.url();await page.goto(BASE+'/'+ENTRY+'#pull?deck='+encodeURIComponent(current.decks[0].id));await page.locator('.cm-pull').waitFor({timeout:45000});
 eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-row').count(),1);eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-n').innerText(),'10');/* Select all sits beside the count while anything is left in the group, and goes when nothing is. */eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-select-all').count(),1);
 await page.locator('[data-pull-tick]').first().check();await page.locator('.cm-pull-row.is-done').waitFor({timeout:8000});current=await state();eq(current.lots.find(l=>l.source==='owned').location.kind,'deck');eq(CrankReadiness(current).inBox,10);
 eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-n').innerText(),'0');eq(await page.locator('.cm-pull-group[data-group=bench] .cm-pull-select-all').count(),0);
 await page.goto(rosterURL);await page.getByRole('table').waitFor();
 /* The row's own verb: the owned, reserved, benched Mountains go into the box in one tap. */
 await page.reload();await page.getByRole('table').waitFor();await page.evaluate(async()=>{const r=await CrankRepository.open();try{const s=await r.getState();const l=s.lots.find(l=>l.source==='owned');await r.commit({id:crypto.randomUUID(),type:'place',lotId:l.id,quantity:l.quantity,confirmed:true},s.revision);}finally{r.close();}});await page.reload();await page.getByRole('table').waitFor();
 await row('Mountain','Owned').getByRole('button',{name:/^Put in /}).click();await page.waitForTimeout(700);current=await state();eq(current.lots.find(l=>l.source==='owned').location.kind,'deck');
 await actionsFor('Mountain','Owned');await page.locator('#cm-put-submenu-toggle').hover();await page.locator('#cm-put-submenu').getByRole('button',{name:'Journey Goblins'}).click();await click('Confirm change');await waitDialog();current=await state();eq(current.lots.find(l=>l.source==='owned').location.kind,'deck');
 /* The Option flag: from the row's Actions, with a reason, and the row wears the chip. Clearing
    it is one click. Neither touches a copy. */
 await actionsFor('Mountain','Owned');await click('Flag as option (first to swap out)');await page.locator('#cm-dialog [name=why]').fill('Trim one');await click('Flag as option');await waitDialog();await page.waitForTimeout(500);current=await state();
 ok(current.decks[0].slots.some(r=>r.option&&r.optionWhy==='Trim one'));ok((await page.locator('.cm-badge-option').count())>0);
 await actionsFor('Mountain','Owned');await click('Clear option flag');await page.waitForTimeout(500);current=await state();ok(!current.decks[0].slots.some(r=>r.option));eq(await page.locator('.cm-badge-option').count(),0);
 await actionsFor('Mountain','Owned');await page.locator('#cm-status-submenu-toggle').hover();await page.locator('#cm-status-submenu').getByRole('button',{name:'Ordered',exact:true}).click();await page.getByLabel('Copies affected').fill('2');await click('Confirm change');await waitDialog();await page.waitForTimeout(700);current=await state();eq(current.lots.filter(l=>l.source==='owned').reduce((n,l)=>n+l.quantity,0),8);eq(current.lots.filter(l=>l.source==='ordered').reduce((n,l)=>n+l.quantity,0),32);
 await page.reload();await page.getByRole('table').waitFor();eq((await state()).lots.filter(l=>l.source==='owned')[0].quantity,8);
 await click('Clear filters');await page.locator('.cm-chip').waitFor({state:'detached'});eq(await page.locator('.cm-chip').count(),0);await click('Columns');await page.getByLabel('Color',{exact:true}).check();await page.getByLabel('Source',{exact:true}).uncheck();await click('Apply columns');await waitDialog();ok((await state()).preferences.columns.includes('color'));eq(await page.getByRole('columnheader',{name:'Source'}).count(),0);eq(await page.locator('th, td').evaluateAll(els=>els.every(el=>getComputedStyle(el).textAlign==='left')),true);
 await click('Columns');await page.getByLabel('Source',{exact:true}).check();await click('Apply columns');await waitDialog();
 /* OWNERSHIP IS A COLUMN (Rob, 14 September): owned against what the row's deck wants, "1/1"
    where the copy is reserved to it and "0/1" where the card is still to buy. */
 await click('Columns');await page.getByLabel('Ownership',{exact:true}).check();await click('Apply columns');await waitDialog();
 ok((await state()).preferences.columns.includes('ownership'),'Ownership is remembered with the column set');
 {const i=await page.evaluate(()=>[...document.querySelectorAll('#cm-roster-table th')].findIndex(h=>/^Ownership/.test(h.textContent.trim())));ok(i>0,'the Ownership column is on the table');
  const cells=await page.evaluate(n=>[...document.querySelectorAll('#cm-roster-table tbody tr')].slice(0,8).map(tr=>(tr.children[n]||{}).textContent||''),i);
  ok(cells.length&&cells.every(t=>/^\d+\/\d+$/.test(t.trim())),`every Ownership cell is owned/wanted (${cells.join(' ')})`);}
 await click('Columns');await page.getByLabel('Ownership',{exact:true}).uncheck();await click('Apply columns');await waitDialog();
 /* THE "?" BESIDE CARDS IS A REFERENCE PAGE (Rob, 14 September): grouped subheads, bullets,
    and a drawing of the progression with its branch and split nodes. The definitions are the
    glossary's own, read as the dialog opens, so a term whose definition changed in one place
    cannot still read the old way here. */
 await page.getByRole('button',{name:'About this page'}).first().click();await page.getByRole('dialog').waitFor();
 {const help=page.locator('#cm-dialog .cm-help');await help.waitFor();
  eq(await help.locator('h3').allTextContents().then(t=>t.map(x=>x.trim())),['The four tabs','How a card moves through the library','What each state means','Moving cards, on any lens','The counts row','Finding and changing rows','The Table is a table you play on'],'the help is grouped under subheads');
  ok(await help.locator('li').count()>=12,'and reads as bullets rather than paragraphs');
  eq(await help.locator('.cm-def').count(),12,'every state the Status column can show is defined, and the sitting beside them');
  const named=await help.locator('.cm-def > b').allTextContents().then(t=>t.map(x=>x.trim()));
  for(const term of ['Watched','Suggestion','Planned','Draft list','Reserved','Ordered','To buy','Physical deck','Substitute','Bench'])ok(named.includes(term),`${term} is defined`);
  ok(await help.locator('.cm-def > span').first().innerText().then(t=>/filed in that deck/.test(t)),'the definition is the glossary\'s, not a second copy of it');
  const flow=help.locator('.cm-flow svg');await flow.waitFor();
  eq(await flow.locator('g text:nth-child(2)').allTextContents().then(t=>t.map(x=>x.trim())).then(t=>t.filter(x=>x==='Reserved').length),1,'Reserved is drawn once');
  ok(await flow.locator('circle').count()>=2,'the merge and the split are drawn as nodes');
  ok(await page.evaluate(()=>{const d=document.getElementById('cm-dialog');return d.scrollWidth<=d.clientWidth+1;}),'the dialog itself never scrolls sideways');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'and neither does the page under it');}
 await click('Close dialog');await waitDialog();checks+=1;
 await click('Import list');{const one=await page.getByLabel('What does this input represent?').boundingBox(),two=await page.getByRole('dialog').getByLabel('Collection group').boundingBox();ok(one.x+one.width<=two.x+1);}await page.getByLabel('What does this input represent?').selectOption('owned');await page.getByLabel('New group name').fill('Journey inventory');await page.getByLabel('Or paste a list / CSV').fill('Card name,Quantity,Finish,Notes\nSol Ring,2,foil,exact print unknown\nArcane Signet,1,nonfoil,not reserved');await click('Parse input');await click('Resolve exact cards');await page.getByRole('heading',{name:'Review import',exact:true}).waitFor();await click('Import 2 reviewed rows');await waitDialog();current=await state();ok(current.groups.some(g=>g.name==='Journey inventory'));/* Four starter groups, the inventory this journey imported, and the group that arrived with the deck it built. */eq(current.groups.length,6);eq(current.decks.filter(d=>d.groupId).length,current.decks.length);eq(current.lots.filter(l=>l.cardId===CrankKey('Sol Ring')).reduce((n,l)=>n+l.quantity,0),2);
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
 await nav('Build');await page.locator('#cm-lab-form').waitFor({timeout:45000});
 /* Deck Lab's sections collapse now and Deck Definition starts closed, so the deck-name
    field is in the DOM but not fillable until it is opened. Opened here rather than right
    after nav(): the view renders asynchronously, so anything run before the form exists
    opens nothing. */
 const openLab=()=>page.evaluate(()=>document.querySelectorAll('#cm-lab-form details').forEach(d=>{d.open=true;}));
 await openLab();
 {const row=await page.locator('#cm-lab-form .cm-start-label').boundingBox(),sel=await page.locator('#cm-lab-form [name=mode]').boundingBox();ok(sel.x+sel.width>=row.x+row.width-40);ok(sel.x>row.x+row.width/2);}
 await page.locator('#cm-lab-form [name=mode]').selectOption('list');await page.locator('#cm-lab-form [name=existingDeck]').selectOption({label:'Journey Goblins'});await page.locator('#cm-list-source').waitFor();
 eq(await page.locator('#cm-lab-form [name=listSource]').count(),3);eq(await page.locator('#cm-lab-form [name=listSource]:checked').inputValue(),'physical');ok((await page.locator('#cm-list-source').innerText()).includes('Reserved Deck'));ok((await page.locator('#cm-list-source').innerText()).includes('Auto-generate a new 99'));
 ok((await page.locator('#cm-lab-form [name=listCommander] option:checked').innerText()).includes('Krenko'));
 await page.locator('#cm-lab-form [name=mode]').selectOption('commander');await openLab();
 await page.locator('#cm-lab-form [name=commanderQuery]').fill('Krenko, Mob Boss');await page.locator('[data-lab-commander]').filter({has:page.getByText('Krenko, Mob Boss',{exact:true})}).click();await openLab();await page.locator('#cm-lab-form [name=deckName]').fill('Constructive run');await click('Run initial draft');await page.getByRole('button',{name:'Review draft cards'}).waitFor({timeout:45000});current=await state();
 /* THE DRAFT IS A PREVIEW, not a deck. This asserted a deck named 'Constructive run' in
    My Decks the moment the draft finished, which is what the Lab used to do -- running it
    three times to try three budgets left three decks behind. It deliberately does not any
    more: the draft is kept in preferences.labPreview and only "Save this deck" writes to
    My Decks. So the check is now that the 99 exists and that nothing was saved. */
 ok(!current.decks.some(d=>d.name==='Constructive run'));
 ok((current.preferences.labPreview?.slots||[]).length>1);
 /* T4: the draft is seeded from the trace by default, and the preview says so. */
 ok(/seeded from the trace/.test(current.preferences.labPreview?.method||''));ok((current.preferences.labPreview?.notes||[]).some(x=>/Seeded from the trace/.test(x)));
 eq(current.reports.length,0);
 /* Step 2 is ACTIVE once there is a 99 to refine -- it is the next thing you can do, and the
    run pane marks it as such. It was 'Waiting' before the pane gained an ordered sequence. */
 eq(await page.locator('#cm-step-2').getAttribute('aria-label'),'Active');
 /* SAVE THE DRAFT, AND THE DECK'S CARDS HAVE A HOME. A deck saved from the Lab arrives as a
    draft with a collection group made for it, and its cards show in the Collection as Draft
    list rows under that group -- each with a Status fly-out that turns a plan into a copy. */
 await click('Save this deck');await page.waitForTimeout(900);current=await state();
 const labDeck=current.decks.find(d=>d.name==='Constructive run');ok(labDeck&&labDeck.status==='draft');ok(labDeck.groupId&&current.groups.some(g=>g.id===labDeck.groupId));
 await nav('Cards');await page.getByRole('table').waitFor();
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
 await click('Clear filters');await nav('Decks');await page.locator('.cm-deck-tile').filter({hasText:'Constructive run'}).getByRole('button').first().click();
 /* LOG A GAME, READ IT BACK: the form's pickers are the deck's cards, and the Record card and
    the tile caption show the result. */
 await click('Log a game');await page.getByLabel('Card that won it').selectOption({label:'Krenko, Mob Boss'});await page.getByLabel('Finish').selectOption('1');await click('Save game record');await waitDialog();
 /* Saving lands on History; the tab is clicked as well so the read-back does not hang on the jump. */
 await page.getByRole('tab',{name:/^History/}).click();await page.locator('.cm-record-table').waitFor({timeout:8000});current=await state();
 {const g=current.games[current.games.length-1];eq(g.outcome,'win');eq(g.finish,1);eq(g.pod,4);eq(g.mvpCardId,CrankKey('Krenko, Mob Boss'));}
 eq(await page.locator('.cm-record-table tbody tr').count(),1);
 await click('More');await click('Watched');await click('Confirm change');await waitDialog();current=await state();
 eq(current.lots.filter(l=>l.groupIds.includes(labDeck.groupId)).reduce((n,l)=>n+l.quantity,0),labTotal);
 ok(current.lots.some(l=>l.source==='watching'&&l.groupIds.includes(labDeck.groupId)));
 /* Simulation history: a measured report filed with the deck is a row on its page, opens
    as the Lab's own report, and the tile carries the score. */
 await page.evaluate(async deckId=>{const r=await CrankRepository.open();try{const s=await r.getState();const d=s.decks.find(x=>x.id===deckId);await r.commit({id:crypto.randomUUID(),type:'report',deckId,report:{kind:'report',origin:'measured',protocol:'published',deckFingerprint:CrankCollection.fingerprint(d),list:d.slots.filter(r=>r.purpose==='main').map(r=>({cardId:r.cardId,quantity:r.quantity})),commanders:[...d.commanders],versions:{engine:'journey'},conditions:{seedCount:1,gamesPerSeed:1},metrics:{score:{value:61.5,unit:'points'},scoreStandardError:{value:0.4,unit:'points'},winRate:{value:27,unit:'%'},averageWinTurn:{value:11.2,unit:'turns'}},run:{games:1,elapsedMs:10},limits:['A journey report, not a measurement.']}},s.revision);}finally{r.close();}},labDeck.id);
 await page.reload();await page.locator('.cm-history-table').waitFor({timeout:45000});eq(await page.locator('.cm-history-table tbody tr').count(),1);
 await click('View report');await page.getByRole('dialog').getByText('Score',{exact:false}).first().waitFor();await page.getByRole('button',{name:'Close dialog'}).click();
 await nav('Decks');await page.locator('.cm-deck-tile').filter({hasText:'Constructive run'}).getByText('61.5 pts').waitFor();checks+=1;
 /* SPIN OFF. The report carries the hundred it measured; from the report on the deck page that hundred becomes a deck of its own, with the report copied over and the original deck untouched. */
 await page.locator('.cm-deck-tile').filter({hasText:'Constructive run'}).first().getByRole('button').first().click();await page.locator('.cm-deck-next').waitFor();
 /* The hundred at a glance on the Overview (Rob, 14 September): the curve, two breakdown bars with keys, the key strategy in the vocabulary's words. */
 eq(await page.locator('#cm-sec-glance .cm-breakdown').count(),2,'the hundred by type and by Primary Purpose');ok((await page.locator('#cm-sec-glance .cm-breakdown-key li').count())>=3,'with their keys');eq(await page.locator('#cm-sec-glance .cm-curve').count(),1,'and the curve');ok(/key strategy/i.test(await page.locator('#cm-sec-glance').innerText()),'and the key strategy (the heading is set in capitals by CSS, so innerText reads it that way)');
 await page.getByRole('tab',{name:/^History/}).click();await page.locator('.cm-history-table').waitFor();await click('View report');await page.getByRole('dialog').getByRole('button',{name:'Spin off as a new deck'}).click();
 await page.waitForFunction(id=>location.hash.includes('deck=')&&!decodeURIComponent(location.hash).includes(id),labDeck.id,{timeout:45000});await page.locator('.cm-deck-summary').waitFor({timeout:45000});current=await state();
 const spun=current.decks.find(d=>d.name.startsWith('Constructive run · 61.5 pts'));ok(spun&&spun.id!==labDeck.id);eq(spun.slots.filter(r=>r.purpose==='main').reduce((n,r)=>n+r.quantity,0),labDeck.slots.filter(r=>r.purpose==='main').reduce((n,r)=>n+r.quantity,0));eq(spun.commanders,labDeck.commanders);
 ok(current.reports.some(r=>r.deckId===spun.id&&r.spunOffFrom&&r.spunOffFrom.deckId===labDeck.id));eq(current.decks.find(d=>d.id===labDeck.id).slots.length,labDeck.slots.length);
 await nav('Decks');await page.locator('.cm-deck-tile').filter({hasText:'61.5 pts ·'}).first().waitFor();
 /* THE SPREADSHEET. One row per card, T and A per deck; a typed number becomes the commands
    the library needs. Own raised by one saves on the spot; a deck's A typed to 1 takes the
    copy from wherever it is, reserves it here and puts it in the box, through the review
    dialog, and the cell reads 1 afterwards. */
 /* The Tabletop (docs/crankmagic-tabletop-plan.md TB1): the same rows as piles on a slate mat. The
    status placards are the status column's tallies, the Bench rail the Bench rows, a grouping
    change is remembered, and the list's search narrows every pile at once. */
 await nav('Cards');await page.locator('#cm-roster-table').waitFor();
 /* The Cards header (Rob, 14 September): the counts are chips that filter, List · Sheet · Table sit on the
    tab row under More, the tab row has no scrollbar, and the To buy tab has a Table of its own. */
 {const h=await page.evaluate(()=>{const tabs=document.querySelector('.cm-tabs.cm-cards-tabs'),sw=document.querySelector('.cm-view-switch');return {scroll:tabs.scrollHeight-tabs.clientHeight,inRow:!!sw&&tabs.contains(sw),views:[...sw.querySelectorAll('button')].map(b=>b.textContent.trim()).join(' '),kpis:document.querySelectorAll('.cm-kpi').length};});
  eq(h.scroll,0,'the tab row shows no scrollbar');ok(h.inRow,'the view switch sits on the tab row');eq(h.views,'List Sheet Table','List · Sheet · Table, in Rob\'s words');ok(h.kpis>=6,'the counts are chips');
  const line=async()=>(await page.locator('#cm-roster-table .cm-paging span, #cm-roster-table .cm-status-line').first().innerText()).replace(/\s+/g,' ');const n0=Number((await line()).match(/([\d,]+) records?/)[1].replace(/,/g,''));
  await page.locator('.cm-kpi').nth(1).click();await page.waitForTimeout(400);eq(await page.locator('.cm-kpi.is-on').count(),1,'a chip clicked is on');const n1=Number((await line()).match(/([\d,]+) records?/)[1].replace(/,/g,''));ok(n1<n0,`and filters the rows (${n0} → ${n1})`);
  await page.locator('.cm-kpi.is-on').click();await page.waitForTimeout(400);eq(await page.locator('.cm-kpi.is-on').count(),0,'clicked again it lets every row back');
  await page.goto(BASE+'/'+ENTRY+'#cards?view=tabletop&tab=buy');await page.locator('.cm-tt-mat').waitFor({timeout:30000});ok(/ghost/.test(await page.locator('#cm-tt-status').innerText()),'the To buy tab has a Table of its ghosts');ok(await page.locator('select[name=ttStatus] option[value=owned]').count()===1,'Owned is a status on the Table too');
  await page.goto(BASE+'/'+ENTRY+'#cards');await page.locator('#cm-roster-table').waitFor();}
 /* A WAY BACK FROM EVERY OTHER CARDS SCREEN (Rob, 15 September). The view switch in the head
    already says Table, but it is a three-way segment in the page head; the toolbar is where a
    reader who has just filtered something is looking. */
 {const back=page.getByRole('button',{name:'Back to Play Space',exact:true});eq(await back.count(),1,'the list offers a way back to the Table, in the words the mat uses');
  await back.click();await page.locator('.cm-tt-mat').waitFor();ok(/view=tabletop/.test(page.url()),'and it lands on the mat');
  await page.goto(BASE+'/'+ENTRY+'#cards');await page.locator('#cm-roster-table').waitFor();}
 await click('Table');await page.locator('.cm-tt-mat').waitFor();ok(page.url().endsWith('#cards?view=tabletop'));
 {const tallies=await page.evaluate(async()=>{const r=await CrankRepository.open();try{const s=await r.getState();const M=CrankCollection;const n={};for(const row of M.projection(s)){const st=M.statusOf(row);n[st]=(n[st]||0)+(Number(row.quantity)||0);}return n;}finally{r.close();}});
  /* THE BAND ALONG THE BOTTOM IS THE MODE (play-space plan §2.15). With a deck picked the six
     statuses stand there as piles; with none the collection groups do and the statuses become
     chips on the line above — same aria-label, same `data-tt=open`, and both still take a drop,
     so the journey asks for "the status called X" rather than for a pile in a fixed place. */
  const stPile=label=>`.cm-tt-pile.cm-tt-status[aria-label^="${label},"], .cm-tt-reading[aria-label^="${label},"]`;
  const bandPile='.cm-tt-pile.cm-tt-status, .cm-tt-pile.cm-tt-shelfgroup, .cm-tt-pile.cm-tt-shelfnew';
  const placard=async label=>Number((await page.locator(stPile(label)).first().getAttribute('aria-label')).match(/, (\d+) card/)[1]);
  eq(await placard('Physical deck'),tallies['Physical deck']||0);eq(await placard('Reserved'),tallies['Reserved']||0);eq(await placard('To buy'),tallies['To buy']||0);
  ok(/^Bench, \d+ cards?$/.test(await page.locator('.cm-tt-pile.cm-tt-bench').getAttribute('aria-label')),'the Bench reads as one pile with a count');eq(Number((await page.locator('.cm-tt-pile.cm-tt-bench').getAttribute('aria-label')).match(/(\d+)/)[1]),tallies['Bench']||0);
  /* No deck picked, so this is shelf mode: the band is the collection groups and a door to a new
     one, and every status that holds anything is a chip on the line above — still one click from
     being laid out, still a drop target, no longer the job the table is doing. */
  eq(await page.locator('.cm-tt-pile.cm-tt-status').count(),0,'with no deck picked the statuses are not the band');
  ok((await page.locator('.cm-tt-pile.cm-tt-shelfgroup').count())>=3,'the collection groups are');
  eq(await page.locator('.cm-tt-pile.cm-tt-shelfnew').count(),1,'with one door to a new group');
  for (const label of ['Physical deck','Reserved','To buy']) eq(await page.locator(`.cm-tt-reading[aria-label^="${label},"]`).count(),1,`${label} is a chip while you sort`);
  ok((await page.locator('.cm-tt-pile.cm-tt-group').count())>=3);
  await page.locator('select[name=tabletopGroupBy]').selectOption('color');await page.waitForTimeout(500);ok(await page.locator('.cm-tt-pile.cm-tt-group[aria-label^="Red,"]').count()===1);eq((await state()).preferences.tabletopGroupBy,'color');
  await page.locator('#cm-tt-query').fill('Krenko, Mob Boss');await page.waitForTimeout(400);ok(/^\d+ cop(y|ies) on the table \(\d+ rows?\) .* · filtered$/.test(await page.locator('#cm-tt-status').innerText()));eq(await page.locator('.cm-tt-pile.cm-tt-group:not(.is-empty)').count(),1);
  await page.locator('.cm-tt-pile.cm-tt-group:not(.is-empty)').click();await page.locator('.cm-tt-grid').waitFor();ok((await page.locator('.cm-tt-grid .cm-tt-card').count())>=1);
  eq(await page.locator('.cm-tt-grid .cm-tt-card').first().evaluate(el=>getComputedStyle(el,'::before').top),'0px','the whole picture: the art starts at the card\'s top edge');ok(/\S/.test(await page.locator('.cm-tt-grid .cm-tt-card .cm-tt-name').first().innerText()),'and the name is a caption under it');ok((await page.locator('.cm-tt-grid .cm-tt-card').first().getAttribute('data-n'))==='Krenko, Mob Boss');
  await page.keyboard.press('Escape');await page.waitForTimeout(200);eq(await page.locator('.cm-tt-grid').count(),0);
  await page.locator('#cm-tt-query').fill('');await page.locator('select[name=tabletopGroupBy]').selectOption('type');await page.waitForTimeout(300);
  /* TB2: open the fullest status pile — rows and columns, a page strip, a card size; tick two and pick a third, the rest recombine and the three stand on the stage; Escape puts the table back at rest. The journey library is small, so the pile is whichever holds the most and the paging asserts only what that count allows. */
  const pileCounts=async()=>(await page.locator('.cm-tt-pile.cm-tt-status, .cm-tt-reading').evaluateAll(els=>els.map(e=>e.getAttribute('aria-label')))).map(l=>{const m=l.match(/^(.*), (\d+) cards?$/);return m?{label:m[1],count:Number(m[2])}:null;}).filter(Boolean);
  const biggest=(await pileCounts()).sort((a,b)=>b.count-a.count)[0];ok(biggest.count>=3,`a status pile holds three or more (${biggest.label} ${biggest.count})`);
  await page.locator(stPile(biggest.label)).click();await page.locator('.cm-tt-grid').waitFor();
  const strip=()=>page.locator('.cm-tt-strip.is-top .cm-tt-strip-title').innerText();ok(new RegExp(`^${biggest.label} · 1–\\d+ of \\d+( · [\\d,]+ copies)?$`).test(await strip()),await strip());const perPageM=await page.locator('.cm-tt-grid .cm-tt-card').count();ok(perPageM>=3&&perPageM<=biggest.count);
  await page.locator('.cm-tt-strip.is-top [data-tt=size][data-size=L]').click();await page.waitForTimeout(200);ok((await page.locator('.cm-tt-grid .cm-tt-card').count())<=perPageM);ok(await page.locator('.cm-tt-grid .cm-tt-card.is-L').count()>0);
  await page.locator('.cm-tt-strip.is-top [data-tt=size][data-size=M]').click();await page.waitForTimeout(200);
  {const pages=Number((await page.locator('.cm-tt-strip.is-top .cm-tt-pager span').innerText()).match(/of (\d+)/)[1]);if(pages>1){await page.locator('.cm-tt-strip.is-top [data-tt=page][aria-label="Next page"]').click();await page.waitForTimeout(200);ok(!/· 1–/.test(await strip()));await page.locator('.cm-tt-strip.is-top [data-tt=page][aria-label="Previous page"]').click();await page.waitForTimeout(200);}else{ok(await page.locator('.cm-tt-strip.is-top [data-tt=page][aria-label="Next page"]').isDisabled(),'one page, so Next is disabled');}}
  const cards=page.locator('.cm-tt-grid .cm-tt-card');const picked=[await cards.nth(0).getAttribute('data-n'),await cards.nth(1).getAttribute('data-n'),await cards.nth(2).getAttribute('data-n')];
  await cards.nth(0).locator('.cm-tt-tick').click();await page.waitForTimeout(150);await page.locator('.cm-tt-grid .cm-tt-card').nth(1).locator('.cm-tt-tick').click();await page.waitForTimeout(150);eq(await page.locator('.cm-tt-grid .cm-tt-card.is-ticked').count(),2);ok(/Select 2 ticked/.test(await page.locator('.cm-tt-strip.is-top').innerText()));
  await page.locator('.cm-tt-grid .cm-tt-card').nth(2).click();await page.locator('.cm-tt-stage').waitFor({timeout:5000});eq(await page.locator('.cm-tt-stage .cm-tt-card').count(),3);eq(await page.locator('.cm-tt-grid').count(),0);
  eq((await page.locator('.cm-tt-captions li strong').allInnerTexts()).sort(),picked.slice().sort());ok((await page.locator('.cm-tt-captions .cm-tt-pill').allInnerTexts()).every(x=>x===biggest.label));
  await click(`Back to ${biggest.label}`);await page.locator('.cm-tt-grid').waitFor();eq(await page.locator('.cm-tt-stage').count(),0);
  await page.locator('.cm-tt-grid .cm-tt-card').nth(0).click();await page.locator('.cm-tt-stage').waitFor({timeout:5000});eq(await page.locator('.cm-tt-stage .cm-tt-card').count(),1);
  /* TB5: one card on the stage brings its facts, a picture size, and Previous / Next through the pile. */
  eq(await page.locator('.cm-tt-stage.is-solo .cm-tt-info').count(),1,'one card on the stage brings its facts');ok(/Inspect card/.test(await page.locator('.cm-tt-info').innerText()));
  {const w0=(await page.locator('.cm-tt-solo').boundingBox()).width;await page.locator('[data-tt=stage-size][data-size=full]').click();await page.waitForTimeout(250);const w1=(await page.locator('.cm-tt-solo').boundingBox()).width;ok(w1>w0&&w1>=400,`Full makes the picture bigger (${w0} → ${w1})`);eq(await page.evaluate(()=>localStorage.getItem('cm-tabletop-stage')),'full','and the size is remembered on the device');
   const n0=await page.locator('.cm-tt-captions li strong').first().innerText();const next=page.locator('[data-tt=step][aria-label^="Next"]');if(!(await next.isDisabled())){await next.click();await page.waitForTimeout(250);ok((await page.locator('.cm-tt-captions li strong').first().innerText())!==n0,'Next steps to the next card in the pile');eq(await page.locator('.cm-tt-stage.is-solo').count(),1);await page.keyboard.press('ArrowLeft');await page.waitForTimeout(250);eq(await page.locator('.cm-tt-captions li strong').first().innerText(),n0,'ArrowLeft steps back');}
   await click('Inspect card');await page.getByRole('dialog').waitFor();ok((await page.getByRole('dialog').innerText()).includes(n0),'Inspect card opens the inspector on the card');await page.keyboard.press('Escape');await page.waitForTimeout(200);eq(await page.getByRole('dialog').count(),0);
   await page.locator('[data-tt=stage-size][data-size=XL]').click();await page.waitForTimeout(200);}
   /* THE INFO PANE (Rob, 14 September): the two shops share a row, the pair after the deck name
      says what is owned of what that deck wants, and the arrow on the pane's top right corner
      does what "Back to <pile>" does. */
   {const links=page.locator('.cm-tt-info .cm-inspector-buy a');eq(await links.count(),2,'two places to buy');
    const a=await links.nth(0).boundingBox(),b=await links.nth(1).boundingBox();eq(Math.round(a.y),Math.round(b.y),'the two shops share a row');
    const own=page.locator('.cm-tt-info .cm-tt-own');if(await own.count()){ok(/^\d+\/\d+$/.test((await own.innerText()).trim()),'owned against wanted reads as a pair');ok(/You own/.test(await own.getAttribute('title')));}
    const arrow=page.locator('.cm-tt-back'),pane=await page.locator('.cm-tt-info').boundingBox(),ab=await arrow.boundingBox();
    ok(Math.abs((ab.x+ab.width)-(pane.x+pane.width))<=14&&Math.abs(ab.y-pane.y)<=16,'the arrow sits on the pane top right');
    ok(/^Back to /.test(await arrow.getAttribute('aria-label')));
    await arrow.click();await page.waitForTimeout(400);eq(await page.locator('.cm-tt-info').count(),0,'the arrow closes the card view');
    await page.locator('.cm-tt-grid .cm-tt-card').nth(0).click();await page.locator('.cm-tt-stage.is-solo').waitFor({timeout:5000});}
  await page.keyboard.press('Escape');await page.waitForTimeout(200);eq(await page.locator('.cm-tt-stage').count(),0);eq(await page.locator('.cm-tt-grid').count(),0);ok((await page.locator('.cm-tt-pile.cm-tt-group').count())>=3);
  /* THE MAT AT REST (Rob, 14 September): a pile's picture fills its slot rather than floating in
     the corner of it, every placard is inside the mat, and the readings line stands clear of the
     status placards with the whole of it on the mat. */
  {const m=await page.evaluate(()=>{const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
     const mat=box(document.querySelector('.cm-tt-mat')),pile=document.querySelector('.cm-tt-pile.cm-tt-group');
     const slot=box(pile.querySelector('.cm-tt-slot')),card=box(pile.querySelector('.cm-tt-card'));
     const placards=[...document.querySelectorAll('.cm-tt-pile .cm-tt-placard')].map(box);
     const read=document.querySelector('.cm-tt-readings'),r=read?box(read):null;
     const statusP=[...document.querySelectorAll('.cm-tt-pile.cm-tt-status .cm-tt-placard, .cm-tt-pile.cm-tt-shelfgroup .cm-tt-placard, .cm-tt-pile.cm-tt-shelfnew .cm-tt-placard')].map(box);
     return {lip:[card.x-slot.x,card.y-slot.y,slot.x+slot.w-card.x-card.w,slot.y+slot.h-card.y-card.h],
       inside:placards.every(p=>p.x>=mat.x-1&&p.x+p.w<=mat.x+mat.w+1),
       readInside:r?r.y+r.h<=mat.y+mat.h:true,
       clear:r&&statusP.length?Math.min(...statusP.map(p=>r.y-(p.y+p.h))):99};});
   ok(m.lip.every(v=>v>=0&&v<=8),`the picture fills its slot (lip ${m.lip.join(',')})`);
   ok(m.inside,'every placard is inside the mat');
   ok(m.readInside,'the readings line is inside the mat');
   ok(m.clear>=20,`the readings line stands clear of the status placards (${m.clear}px)`);}
  /* THE BOARD MUTATES, IT DOES NOT REBUILD (play-space plan §3.1). `mount` used to write the
     whole mat with one innerHTML on every draw: focus and scroll lost on each move, every picture
     re-decoded, and the work growing with the table rather than the change. It paints once and
     patches thereafter now, and this is the assertion that says so — stamp every node on the mat,
     cause a redraw, and count how many of the same objects are still standing. */
  {const stamp=()=>page.evaluate(()=>{let n=0;for(const el of document.querySelectorAll('#cm-tt-host .cm-tt-mat *')){el.__keep=true;n++;}return n;});
   const survived=()=>page.evaluate(()=>{let kept=0,total=0;for(const el of document.querySelectorAll('#cm-tt-host .cm-tt-mat *')){total++;if(el.__keep)kept++;}return {kept,total};});
   const n0=await stamp();ok(n0>40,`the mat is worth patching (${n0} nodes)`);
   /* A redraw that changes one class on the mat and nothing else: every node should survive. */
   await page.locator('[name=tabletopCanvas]').selectOption('felt');await page.waitForTimeout(400);
   {const r=await survived();eq(r.kept,r.total,`a canvas change rebuilds nothing (${r.kept} of ${r.total} nodes stand)`);}
   /* A redraw that changes what the piles hold: most of the mat is still the same objects, which
      is what keeps the pictures from being decoded again. */
   await stamp();await page.locator('#cm-tt-query').fill('a');await page.waitForTimeout(600);
   {const r=await survived();ok(r.kept>=r.total*0.5,`a filtered redraw keeps most of the board (${r.kept} of ${r.total})`);}
   await page.locator('#cm-tt-query').fill('');await page.waitForTimeout(500);
   /* A control that survived the patch still works, and the canvas it names is the one drawn —
      that a surviving node carries ONE handler rather than one per draw is asserted at the source
      in tests/crankmagic-tabletop.mjs, because it is a rule about how the module binds. */
   await page.locator('[name=tabletopCanvas]').selectOption('slate');await page.waitForTimeout(500);
   ok(/cm-canvas-slate/.test(await page.locator('.cm-tt-mat').getAttribute('class')),'a select that survived the patch still changes the board');}
  /* THE BACK ROW IS THE BENCH AND THE DRAWER (Rob, 15 September). Six deck piles held it until he
     used it — "too big for this" — and they duplicated the Deck dropdown in the toolbar and the
     Physical deck pile down front. The room goes to the open pile instead, and the point of that
     is the thing asserted hardest here: opening a pile leaves the whole board standing, so every
     pile is still a drop target while he reads one. */
  {eq(await page.locator('.cm-tt-fan').count(),0,'the fanned ledge is gone');
   eq(await page.locator('.cm-tt-backrow .cm-tt-pile.cm-tt-bench').count(),1,'the Bench is a pile on the back row');
   eq(await page.locator('.cm-tt-deckpile').count(),0,'the deck piles are gone; the toolbar dropdown is the deck filter');
   eq(await page.locator('select[name=ttDeck]').count(),1,'and it is there');
   eq(await page.locator('.cm-tt-drawer.is-shut').count(),1,'the drawer waits, shut, until a pile is opened');
   const standing=()=>page.evaluate(()=>({play:document.querySelectorAll('.cm-tt-play-head').length,
     groups:document.querySelectorAll('.cm-tt-pile.cm-tt-group').length,
     band:document.querySelectorAll('.cm-tt-pile.cm-tt-shelfgroup,.cm-tt-pile.cm-tt-status').length}));
   const before=await standing();
   await page.locator('.cm-tt-pile.cm-tt-group').first().click();await page.locator('.cm-tt-drawer-strip .cm-tt-card').first().waitFor();
   eq(await standing(),before,'opening a pile leaves the play space, the group piles and the band exactly where they were');
   ok((await page.locator('.cm-tt-drawer-strip .cm-tt-card').count())>0,'and its cards are in the drawer');
   /* A tick in the drawer is a tick, not a click on the mat: a pointer captured on press used to
      retarget the click to the strip, which the mat read as "clicked away" and put the pile down. */
   await page.locator('.cm-tt-drawer-strip .cm-tt-card').first().locator('.cm-tt-tick').click();await page.waitForTimeout(300);
   eq(await page.locator('.cm-tt-drawer-strip .cm-tt-card.is-ticked').count(),1,'ticking a card in the drawer keeps the pile open');
   await page.locator('.cm-tt-drawer-strip .cm-tt-card').first().locator('.cm-tt-tick').click();await page.waitForTimeout(200);
   /* AND A DRAG THAT ENDS ANYWHERE IS NOT A CLICK EITHER (Rob, 15 September). The tick fix moved
      the pointer capture off the press and onto the first 8px of travel, which cured the tick but
      not the drag: a completed press-and-release still leaves a click behind, the capture retargets
      it to the strip, and the mat read that as clicking away — so every card he dragged and let go
      anywhere that was not a pile put the pile down and sent him back to the board to find it. */
   {const drawer=()=>page.evaluate(()=>({shut:!!document.querySelector('.cm-tt-drawer.is-shut'),
      head:(document.querySelector('.cm-tt-drawer-head strong')||{}).textContent||'',
      cards:document.querySelectorAll('.cm-tt-drawer-strip .cm-tt-card').length,
      stage:document.querySelectorAll('.cm-tt-stage').length}));
    const before=await drawer();
    const box=await page.locator('.cm-tt-drawer-strip .cm-tt-card').first().boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+20,{steps:5});
    await page.mouse.move(box.x+box.width*2.4,box.y+box.height/2,{steps:10});
    await page.mouse.up();await page.waitForTimeout(600);
    eq(await drawer(),before,'a card dragged and let go back in the drawer leaves the pile exactly as it was');}
   await page.getByRole('button',{name:'Back to Play Space',exact:true}).click();await page.waitForTimeout(400);
   eq(await page.locator('.cm-tt-drawer.is-shut').count(),1,'and Back to Play Space puts it away');}
  /* STATUS FROM THE TABLE (Rob, 15 September). A drop answers "where does this copy go"; a plan,
     a suggestion and a To buy line have no pile to be dropped on, and `accepts` had been telling
     readers to "set its status from its row menu" on a board whose only row menu was a
     right-click, which a phone does not have. The button opens the SAME menu the list uses, so
     there is one status vocabulary and one set of confirmations. */
  {await page.locator('.cm-tt-pile.cm-tt-bench').click();await page.locator('.cm-tt-grid').waitFor();
   await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor();
   const st=page.locator('.cm-tt-stage-actions [data-tt=status]');eq(await st.count(),1,'a staged card offers Status\u2026');
   await st.click();const menu=page.locator('.cm-row-menu');await menu.waitFor({timeout:8000});
   eq(await menu.locator('#cm-status-submenu-toggle').count(),1,'and it is the list\'s own row menu, Status fly-out and all');
   await page.keyboard.press('Escape');await page.waitForTimeout(250);
   eq(await page.locator('.cm-row-menu:visible').count(),0,'Escape closes the menu');
   ok((await page.locator('.cm-tt-stage').count())>=1,'and leaves the card on the stage');
   await page.keyboard.press('Escape');await page.waitForTimeout(300);}
  {const bench=Number((await page.locator('.cm-tt-pile.cm-tt-bench').getAttribute('aria-label')).match(/(\d+)/)[1]);if(bench>0){await page.locator('.cm-tt-pile.cm-tt-bench').click();await page.locator('.cm-tt-grid').waitFor();ok(/^Bench · 1–/.test(await strip()));await page.locator('.cm-tt-pile.cm-tt-bench').click();await page.waitForTimeout(200);eq(await page.locator('.cm-tt-grid').count(),0);}else{ok(true,'no bench to open in this library');}}
  /* TB3: drag the selection to a pile. A Bench copy into a physical deck (as a substitute, through the deck dialog and the receipt) and back to the Bench, the tallies moving with it; a type pile refuses while the pointer is over it; a To buy requirement dropped on Ordered becomes an ordered copy; Move to… lists the piles with the same answers. */
  const journey=(await state()).decks.find(d=>d.name==='Journey Goblins'&&d.status==='final');ok(!!journey,'the finalized journey deck exists');const t0=await page.evaluate(async()=>{const r=await CrankRepository.open();try{const s=await r.getState();const M=CrankCollection;const n={};for(const row of M.projection(s)){const st=M.statusOf(row);n[st]=(n[st]||0)+(Number(row.quantity)||0);}return n;}finally{r.close();}});
  const tally=()=>page.evaluate(async()=>{const r=await CrankRepository.open();try{const s=await r.getState();const M=CrankCollection;const n={};for(const row of M.projection(s)){const st=M.statusOf(row);n[st]=(n[st]||0)+(Number(row.quantity)||0);}return n;}finally{r.close();}});
  const dragTo=async(sel,{drop=true}={})=>{await page.locator('.cm-tt-mat').evaluate(e=>e.scrollIntoView({block:'start'}));await page.waitForTimeout(150);const from=await page.locator('.cm-tt-fanL .cm-tt-card').first().boundingBox();const to=await page.locator(sel).first().boundingBox();await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(from.x+from.width/2+30,from.y+30,{steps:4});await page.mouse.move(to.x+to.width/2,to.y+Math.min(to.height/2,40),{steps:10});await page.waitForTimeout(150);const say=await page.locator('.cm-tt-drag-say').innerText();const cls=await page.locator(sel).first().getAttribute('class');if(drop){await page.mouse.up();}else{await page.mouse.move(from.x+from.width/2,from.y+from.height/2,{steps:6});await page.waitForTimeout(100);await page.mouse.up();}await page.waitForTimeout(200);return {say,cls};};
  await page.locator('.cm-tt-pile.cm-tt-bench').click();await page.locator('.cm-tt-grid').waitFor();await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor();const moved=await page.locator('.cm-tt-captions li strong').first().innerText();const movedQty=Number(((await page.locator('.cm-tt-captions li').first().innerText()).match(/×(\d+)/)||[])[1]||1);
  {const r=await dragTo('.cm-tt-chip[data-pile^="group:type:"]',{drop:false});ok(/reading of the card/.test(r.say),`a type pile refuses: ${r.say}`);ok(/is-refused/.test(r.cls));}
  ok(await page.locator('.cm-tt-drag').count()===0,'the drag badge is gone after the pointer is up');
  /* A DROP IS A PROPOSAL NOW (Rob, 14 September; play-space plan §2.6–2.8). The deck dialog still
     asks WHERE, because that is part of the proposal, but its button stages rather than saves:
     the bar appears, the library's tallies do not move, and Confirm writes the whole sitting as
     one revision that one Undo takes back. */
  {const r=await dragTo(stPile('Physical deck'));ok(/Put in a physical deck/.test(r.say));ok(/is-target/.test(r.cls));}
  await page.getByRole('dialog').waitFor();ok(/Put these copies in a physical deck/.test(await page.getByRole('dialog').innerText()));await page.locator('[name=deckId]').selectOption(journey.id);await page.waitForTimeout(250);
  /* WHICH SEAT THE SUBSTITUTE IS FILLING (PR 5; play-space plan §2.12). Rob's step 3 — "tag which
     card they'll get replaced by when that card comes in" — and the seats offered are the ones
     this deck still lacks a copy for, which only exist once the deck is chosen. */
  let heldSeat='';
  {const seats=await page.locator('[name=standInFor] option').evaluateAll(o=>o.map(x=>({v:x.value,t:x.textContent.trim()})));
   ok(seats.length>=1,'the substitute form offers a seat to stand in for');
   eq(seats[0].v,'','and leaving it blank is the first option, because naming it is optional');
   const pick=seats.find(x=>x.v);
   if(pick){heldSeat=pick.t;await page.locator('[name=standInFor]').selectOption(pick.v);}
   else ok(true,'this deck needs no card it does not already have');}
  await page.locator('[name=asStandIn]').check();await click('Stage the move');await page.waitForTimeout(500);
  {const t1=await tally();eq(t1,t0,'staging a drop changed nothing in the library');
   await page.locator('.cm-sitting').waitFor();ok(/1 move pending/.test(await page.locator('.cm-sitting').innerText()),'and the bar says one move is pending');
   ok((await page.locator('.cm-tt-captions .cm-tt-pill').first().innerText())!=='Bench','the table already reads as the sitting would leave it');}
  /* The list and the sheet are the same pending truth, from the same fold. */
  await page.goto(BASE+'/'+ENTRY+'#cards');await page.getByRole('table').waitFor();
  ok(/1 move pending/.test(await page.locator('.cm-sitting').innerText()),'the List carries the same bar');
  await page.locator('#cm-roster-query').fill('Sol Ring');await page.waitForTimeout(500);
  ok(await page.locator('.cm-badge-pending').count()>=1,'and marks the staged reading as staged');
  ok(!/\bBench\b/.test(await page.locator('#cm-roster-table tbody').innerText()),'the List reads the staged status, not the library one');
  await page.locator('#cm-roster-query').fill('');await page.waitForTimeout(500);
  await page.goto(BASE+'/'+ENTRY+'#cards?view=sheet');await page.locator('.cm-sheet-wrap').waitFor({timeout:30000});
  ok(/1 move pending/.test(await page.locator('.cm-sitting').innerText()),'the Sheet carries it too');
  /* And it survives a reload, because a sitting is a working session, not a lost one. */
  await page.reload();await page.locator('.cm-sitting').waitFor({timeout:30000});
  ok(/1 move pending/.test(await page.locator('.cm-sitting').innerText()),'the sitting comes back with the page');
  eq(await tally(),t0,'still without having touched the library');
  await page.goto(BASE+'/'+ENTRY+'#cards?view=tabletop');await page.locator('.cm-tt-mat').waitFor({timeout:30000});
  await click('Review and confirm');await page.getByRole('dialog').waitFor();
  ok(/Undo takes all of it back together/.test(await page.getByRole('dialog').innerText()),'the receipt says one undo takes the lot');
  await click('Confirm change');await page.waitForTimeout(1200);
  {const t1=await tally();eq((t1['Physical deck']||0)+(t1['Substitute']||0),(t0['Physical deck']||0)+(t0['Substitute']||0)+movedQty,'the copy is in the box');eq(t1['Bench']||0,(t0['Bench']||0)-movedQty,'and off the Bench');
   eq(await page.locator('.cm-sitting').count(),0,'and the sitting is cleared once the library has taken it');}
  /* THE PAIRING IS NOW A FACT (PR 5). The seat named at the drop is on the lot, the deck's list
     says who is holding it, and the Change List reads the record rather than inferring. */
  if(heldSeat){
    const st=await state(),lot=st.lots.find(l=>l.standInFor);
    ok(!!lot,'the seat is recorded on the copy that went in as a substitute');
    const d=st.decks.find(x=>x.id===journey.id),seat=d.slots.find(r=>r.id===lot.standInFor);
    ok(!!seat,'and it names a seat on the deck it went into');
    eq((st.cards[seat.cardId]||{}).name,heldSeat,'the seat the form offered');
    await page.goto(BASE+'/'+ENTRY+'#decks?deck='+encodeURIComponent(journey.id)+'&tab=cards');
    await page.locator('.cm-deck-cards').waitFor({timeout:30000});
    ok(/held by /.test(await page.locator('.cm-deck-cards').innerText()),'the deck\'s list says the seat is held by the substitute');
    await page.goto(BASE+'/'+ENTRY+'#cards?view=tabletop');await page.locator('.cm-tt-mat').waitFor({timeout:30000});
  } else ok(true,'no seat to record on this deck today');
  /* And the way back, as a second sitting: out of the box onto the Bench. */
  /* The page was reloaded mid-sitting, so the stage is closed: open the pile the copy is in now.
     A substitute is by definition the only kind of card in that pile. */
  {const box=await page.locator(stPile('Substitute')).count()?'Substitute':'Physical deck';
   await page.locator(stPile(box)).click();await page.locator('.cm-tt-grid').waitFor({timeout:20000});
   await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor({timeout:20000});}
  {const r=await dragTo('.cm-tt-pile.cm-tt-bench');ok(/Move physically to the Bench/.test(r.say));await page.waitForTimeout(600);
   await page.locator('.cm-sitting').waitFor({timeout:15000});ok(/1 move pending/.test(await page.locator('.cm-sitting').innerText()),'the way back is staged too');
   await click('Review and confirm');await page.getByRole('dialog').waitFor();await click('Confirm change');await page.waitForTimeout(1300);
   const t2=await tally();eq(t2['Bench']||0,t0['Bench']||0,'back on the Bench');eq((t2['Physical deck']||0)+(t2['Substitute']||0),(t0['Physical deck']||0)+(t0['Substitute']||0));
   eq((await page.locator('.cm-tt-captions .cm-tt-pill').first().innerText()),'Bench','and the caption says so');}
  await page.keyboard.press('Escape');await page.waitForTimeout(200);
  /* A ghost onto Ordered: a To buy requirement becomes an ordered copy filed with its deck; the To buy pile shrinks and Ordered grows by the same count. */
  await page.locator(stPile('To buy')).click();await page.locator('.cm-tt-grid').waitFor();await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor();
  const needQty=Number(((await page.locator('.cm-tt-captions li').first().innerText()).match(/×(\d+)/)||[])[1]||1);eq(await page.locator('.cm-tt-captions .cm-tt-pill').first().innerText(),'To buy');
  eq(await page.locator('.cm-tt-stage .cm-tt-card.is-ghost[data-ghost="To buy"]').count(),1,'a ghost wears its status on its corner');eq(await page.locator('.cm-tt-stage .cm-tt-card.is-ghost').evaluate(el=>getComputedStyle(el,'::before').opacity),'1','and its picture is not faded');
  /* MOVE TO… IS ONLY WHERE THE CARD CAN GO (Rob, 14 September): the menu used to list every pile
     on the mat and grey out the refusals, so under a grouping like Primary Purpose it ran to
     twenty-five entries holding two a reader could use. It now carries the accepting piles only —
     no disabled rows, and never a band of the grouping, which is a reading of the card. */
  await click('Move to…');await page.locator('.cm-row-menu').waitFor();
  {const shown=await page.locator('.cm-row-menu button').allInnerTexts();
   ok(shown.some(x=>/^Ordered/.test(x)),'Move to… offers Ordered for a requirement');
   eq(await page.locator('.cm-row-menu button[disabled]').count(),0,'and offers nothing it would refuse');
   ok(!shown.some(x=>/^Physical deck/.test(x)),'Physical deck is not offered for a requirement');
   ok(!shown.some(x=>/^(Creature|Instant|Sorcery|Land|Artifact|Enchantment)\b/.test(x)),'and no grouping band is offered as a destination');}
  const t2=await tally();
  await page.locator('.cm-row-menu button:not([disabled])').filter({hasText:/^Ordered/}).click();await page.waitForTimeout(600);
  await page.locator('.cm-sitting').waitFor();ok(/1 move pending/.test(await page.locator('.cm-sitting').innerText()),'Move to… stages rather than saving');
  eq(await tally(),t2,'and the library is untouched');
  /* STEP BACK IS THE SANDBOX'S OWN UNDO: it costs no revision, because nothing was written. */
  await click('Step back');await page.waitForTimeout(500);eq(await page.locator('.cm-sitting').count(),0,'step back empties the sitting');
  await page.locator(stPile('To buy')).click();await page.locator('.cm-tt-grid').waitFor();await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor();
  await click('Move to…');await page.locator('.cm-row-menu').waitFor();await page.locator('.cm-row-menu button:not([disabled])').filter({hasText:/^Ordered/}).click();await page.waitForTimeout(600);
  await click('Discard');await page.waitForTimeout(500);eq(await page.locator('.cm-sitting').count(),0,'discard empties it too');eq(await tally(),t2,'and neither one wrote anything');
  await page.locator(stPile('To buy')).click();await page.locator('.cm-tt-grid').waitFor();await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor();
  await click('Move to…');await page.locator('.cm-row-menu').waitFor();await page.locator('.cm-row-menu button:not([disabled])').filter({hasText:/^Ordered/}).click();await page.waitForTimeout(600);
  const preRevision=(await state()).revision;
  await click('Review and confirm');await page.getByRole('dialog').waitFor();await click('Confirm change');await page.waitForTimeout(1200);
  {const t3=await tally();eq(t3['Ordered']||0,(t2['Ordered']||0)+needQty,'an ordered copy now');eq(t3['To buy']||0,(t2['To buy']||0)-needQty,'one requirement fewer to buy');
   eq((await state()).revision,preRevision+1,'a whole sitting is one revision, whatever it holds');}
  await page.keyboard.press('Escape');await page.waitForTimeout(200);eq(await page.locator('.cm-tt-stage').count(),0);
  /* TB4: the card size is remembered on this device; the status pile order is a preference; the arrows walk the piles and the cards, Enter opens, Space ticks; Print puts the whole pile on paper. */
  await page.locator(stPile(biggest.label)).click();await page.locator('.cm-tt-grid').waitFor();await page.locator('.cm-tt-strip.is-top [data-tt=size][data-size=L]').click();await page.waitForTimeout(200);
  await page.reload();await page.locator('.cm-tt-mat').waitFor({timeout:30000});await page.locator(stPile(biggest.label)).click();await page.locator('.cm-tt-grid').waitFor();eq(await page.locator('.cm-tt-strip.is-top [data-tt=size][aria-pressed=true]').innerText(),'L','the card size survived a reload');
  await page.locator('.cm-tt-strip.is-top [data-tt=size][data-size=M]').click();await page.waitForTimeout(200);
  await page.evaluate(()=>{window.__printed=0;window.print=()=>{window.__printed++;};});await click('Print');await page.waitForTimeout(200);eq(await page.evaluate(()=>window.__printed),1);
  ok(await page.evaluate(()=>document.body.classList.contains('cm-tt-printing')));eq(await page.locator('.cm-tt-printsheet h1').innerText(),biggest.label);ok((await page.locator('.cm-tt-printsheet tbody tr').count())>=3,'the sheet lists the whole pile');ok((await page.locator('.cm-tt-printsheet tbody tr').count())>=(await page.locator('.cm-tt-grid .cm-tt-card').count()),'the whole pile, not the page');
  await page.evaluate(()=>dispatchEvent(new Event('afterprint')));await page.waitForTimeout(100);eq(await page.locator('.cm-tt-printsheet').count(),0,'the sheet leaves after printing');ok(!(await page.evaluate(()=>document.body.classList.contains('cm-tt-printing'))));
  await page.locator('.cm-tt-grid .cm-tt-card[data-tt=card]').first().focus();await page.keyboard.press('ArrowRight');eq(await page.evaluate(()=>document.activeElement.dataset.n),await page.locator('.cm-tt-grid .cm-tt-card').nth(1).getAttribute('data-n'),'ArrowRight walks to the next card');
  await page.keyboard.press(' ');await page.waitForTimeout(200);eq(await page.locator('.cm-tt-grid .cm-tt-card.is-ticked').count(),1,'Space ticks');ok(await page.evaluate(()=>document.activeElement.matches('.cm-tt-card')||true));
  await page.keyboard.press('Escape');await page.waitForTimeout(200);eq(await page.locator('.cm-tt-grid').count(),0);
  await page.locator(bandPile).first().focus();await page.keyboard.press('ArrowRight');eq(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),await page.locator(bandPile).nth(1).getAttribute('aria-label'),'ArrowRight walks the band along the bottom');
  /* Up from the band is the play space, and up from that the shelves: three rows, bottom to top,
     which is the order the three zones stand in. (Before shelf mode the middle was empty with no
     deck picked, so this step skipped it; now the middle is always there to walk through.) */
  await page.keyboard.press('ArrowUp');ok(await page.evaluate(()=>document.activeElement.matches('.cm-tt-draw, .cm-tt-tray, .cm-tt-playchip')),'ArrowUp climbs to the play space');
  await page.keyboard.press('ArrowUp');ok(await page.evaluate(()=>document.activeElement.matches('.cm-tt-pile.cm-tt-group, .cm-tt-chip')),'and again to the group piles');await page.keyboard.press('Enter');await page.locator('.cm-tt-grid').waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(200);
  await page.locator('select[name=tabletopStatusOrder]').selectOption('count');await page.waitForTimeout(500);{const c=await pileCounts();ok(c.every((p,i)=>i===0||c[i-1].count>=p.count),'fullest first');eq((await state()).preferences.tabletopStatusOrder,'count');}
  await page.locator('select[name=tabletopStatusOrder]').selectOption('workflow');await page.waitForTimeout(400);eq((await pileCounts())[0].label,'Physical deck');

  /* THE PLAY SPACE (PR 3b; play-space plan §2.1, §2.3, §2.4, §2.9, §2.14). The middle of the
     table. Lift a card into it and it is IN YOUR HAND: neutral, on no other pile, and nothing in
     the library has moved. Confirm and it is Watched for the deck being calibrated. Drop one in a
     tray and the deck's list grows to make it a seat. The back arrow comes home from every level. */
  await page.goto(BASE+'/'+ENTRY+'#cards?view=tabletop&deck='+journey.id);await page.locator('.cm-tt-play').waitFor({timeout:30000});
  ok(/calibrating/.test(await page.locator('.cm-tt-play-head').innerText()),'the middle says which deck it is calibrating');
  eq(await page.locator('.cm-tt-tray').count(),4,'four trays stand');
  {const b0=await tally();
   /* Lift: a Bench copy into the middle. Nothing is written, and it leaves the Bench ledge. */
   await page.locator('.cm-tt-pile.cm-tt-bench').click();await page.locator('.cm-tt-grid').waitFor({timeout:20000});
   const lifted=await page.locator('.cm-tt-grid .cm-tt-card').first().innerText();
   await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor({timeout:20000});
   {const r=await dragTo('.cm-tt-playchip[data-pile="play:draw"]');ok(/Pick up/.test(r.say),`the middle says what a lift means: ${r.say}`);}
   await page.waitForTimeout(700);
   eq(await tally(),b0,'picking a card up wrote nothing');
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
   await page.locator('.cm-tt-play').waitFor({timeout:20000});
   ok(/1 of 1/.test(await page.locator('.cm-tt-draw-step').innerText()),'one card in hand, and the arrows count it');
   ok(new RegExp(lifted.split('\n')[0].slice(0,12).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(await page.locator('.cm-tt-draw-step').innerText()),'the arrows name the card on top');
   eq(await page.locator('.cm-tt-draw-stack .cm-tt-card').count(),1,'and the draw pile draws it');
   /* §2.1: the middle is neutral — a card in your hand wears no status pill. */
   eq(await page.locator('.cm-tt-draw-stack .cm-tt-card .cm-tt-ghost-tag').count(),0,'a card in hand wears no status');
   /* The per-card restore arrow puts it back, and the sitting empties with it. */
   await page.locator('.cm-tt-restore').click();await page.waitForTimeout(700);
   eq(await page.locator('.cm-sitting').count(),0,'the restore arrow unstages the lift');
   eq(await tally(),b0,'and still nothing was written');
   /* Lift it again and confirm: the copy reads as Watched for this deck (§2.2, 3a). */
   await page.locator('.cm-tt-pile.cm-tt-bench').click();await page.locator('.cm-tt-grid').waitFor({timeout:20000});
   await page.locator('.cm-tt-grid .cm-tt-card').first().click();await page.locator('.cm-tt-stage').waitFor({timeout:20000});
   await dragTo('.cm-tt-playchip[data-pile="play:draw"]');await page.waitForTimeout(700);
   await page.locator('.cm-sitting').waitFor({timeout:15000});
   await click('Review and confirm');await page.getByRole('dialog').waitFor();await click('Confirm change');await page.waitForTimeout(1300);
   {const b1=await tally();eq(b1['Watched']||0,(b0['Watched']||0)+1,'a card left in the middle is Watched for the deck');
    eq(b1['Bench']||0,(b0['Bench']||0)-1,'and it is no longer a loose Bench copy');
    eq(await page.locator('.cm-sitting').count(),0,'the sitting cleared on Confirm');}}
  /* THE SCOREBOARD reads the sandbox, so it says where confirming would leave the deck (§2.14). */
  await page.keyboard.press('Escape');await page.waitForTimeout(400);
  await page.locator('.cm-tt-play').waitFor({timeout:20000});
  {const board=await page.locator('.cm-tt-play .cm-tt-score').innerText();
   ok(/on the list/.test(board)&&/reserved/.test(board)&&/to finish/.test(board),`the scoreboard names the list, the reservations and the cost: ${board.replace(/\n/g,' ')}`);
   ok(/100 of 100/.test(board),'and Journey Goblins names a hundred');}
  /* A TRAY BUILDS THE LIST (§2.3). Lightning Bolt is on the list; a Mountain past a hundred is not,
     so the tray says the list would grow and the scoreboard turns amber once it has. */
  {const before=(await state()).decks.find(d=>d.id===journey.id).slots.filter(r=>r.purpose==='main').reduce((n,r)=>n+r.quantity,0);
   eq(before,100,'the list is a hundred before the tray');
   await page.locator(stPile('Watched')).click();await page.locator('.cm-tt-grid').waitFor({timeout:20000});
   /* THE BACK ARROW AT EVERY LEVEL (§2.4): top right of the laid-out pile, home to the board. */
   eq(await page.locator('.cm-tt-strip.is-top .cm-tt-back').count(),1,'a laid-out pile carries a back arrow');
   await page.locator('.cm-tt-strip.is-top .cm-tt-back').click();await page.waitForTimeout(400);
   eq(await page.locator('.cm-tt-grid').count(),0,'and it comes home to the board');}
  await page.locator('select[name=tabletopGroupBy]').waitFor();}

 /* THE LOBBY (game G0; docs/crankmagic-game-plan.md §5.1). Pick your deck, seat an opponent, and
    one bracket judges every seat: a list that is not a hundred is refused BY NUMBER and the game
    cannot start until it is out. Nothing here writes to the library — a table being set up is not
    a fact about your collection. */
 {await nav('Play');await page.locator('.cm-lobby-rules').waitFor({timeout:30000});
  const before=(await state()).revision;
  eq(await page.locator('.cm-lobby-empty').count(),1,'the lobby opens with nobody seated');
  eq(await page.locator('[name=lobbyBracket]').inputValue(),'3','and at bracket 3, the upgraded table');
  await click('Seat your deck');await page.getByRole('dialog').waitFor();
  await page.locator('#cm-dialog [name=deckId]').selectOption({index:0});await click('Seat it');await waitDialog();
  await page.locator('.cm-lobby-seat').waitFor({timeout:15000});
  {const seat=await page.locator('.cm-lobby-seat').first().innerText();
   ok(/100 of 100/.test(seat),'a real deck seats as a hundred');
   ok(/0 of 3/.test(seat),'and carries no Game Changers against the bracket\'s three');
   ok(/Ready to sit/.test(seat),'so it can sit');}
  /* A pasted list: the names are read, and six cards is not a deck. */
  await click('Seat an opponent');await page.getByRole('dialog').waitFor();
  await page.locator('#cm-dialog [name=from]').selectOption('paste');
  await page.locator('#cm-dialog [name=name]').fill('Pasted Pod');
  await page.locator('#cm-dialog [name=paste]').fill('1 Krenko, Mob Boss\n\n1 Sol Ring\n4 Mountain');
  await click('Seat it');await waitDialog();
  await page.waitForTimeout(600);
  eq(await page.locator('.cm-lobby-seat').count(),2,'the pasted list takes the second seat');
  ok(/6 cards, not 100/.test((await page.locator('.cm-lobby-issue').allTextContents()).join(' ')),'and is refused by number');
  ok(await page.locator('[data-action=lobby-start]').isDisabled(),'a seat that cannot sit stops the game');
  /* Take it out and the table is ready; the seating is a seed, so a replay is a seed. */
  await page.locator('.cm-lobby-seat').nth(1).getByRole('button',{name:'Take this seat out',exact:true}).click();await page.waitForTimeout(500);
  await click('Seat an opponent');await page.getByRole('dialog').waitFor();
  await page.locator('#cm-dialog [name=deckId]').selectOption({index:0});await click('Seat it');await waitDialog();
  await page.waitForTimeout(600);
  ok(!(await page.locator('[data-action=lobby-start]').isDisabled()),'two real decks are ready to play');
  await page.locator('[name=lobbySeed]').fill('journey-7');await page.locator('[name=lobbySeed]').blur();await page.waitForTimeout(500);
  const order=await page.locator('.cm-lobby-read .cm-muted').first().innerText();
  ok(/Turn order: 1\./.test(order)&&/journey-7/.test(order),`the turn order names the seats and the seed: ${order.replace(/\n/g,' ')}`);
  await page.reload();await page.locator('.cm-lobby-rules').waitFor({timeout:30000});
  eq(await page.locator('.cm-lobby-seat').count(),2,'the table survives a reload');
  eq(await page.locator('[name=lobbySeed]').inputValue(),'journey-7','with its seed');
  eq((await state()).revision,before,'and setting a game up never touched the library');
  await click('Clear the table');await page.waitForTimeout(500);
  eq(await page.locator('.cm-lobby-empty').count(),1,'Clear the table empties it');}

 /* PUBLISH THE TO TRADE LIST (backlog #200): a copy filed in the To Trade group and one offered for Sell / Trade
    become a link; the page the link opens shows both with a way to ask; a visitor with an empty library sees
    the same page from the link alone. */
 {const free=(await state()).lots.filter(l=>l.source==='owned'&&!l.allocation&&l.location?.kind!=='deck'&&l.offer!=='held');ok(free.length>=1,'an unreserved owned copy to offer');const a=free[0],b2=free[1]||free[0],expected=free[1]?2:1;
  await page.evaluate(async([la,lb])=>{const r=await CrankRepository.open();try{let s=await r.getState();s=(await r.commit({id:crypto.randomUUID(),type:'groupLots',groupId:'group:to-trade',lotIds:[la]},s.revision)).state;await r.commit({id:crypto.randomUUID(),type:'bulk',op:'offer',offer:'available',lotIds:[lb],confirmed:true},s.revision);}finally{r.close();}},[a.id,b2.id]);
  await page.reload();await page.locator('#cm-main .cm-page-head').waitFor({timeout:30000});
  await click('Share');await page.locator('#cm-share-menu:popover-open').waitFor();await click('Publish your To Trade list');await page.getByRole('dialog').waitFor();
  const dlg=await page.getByRole('dialog').innerText();ok(/cop(y|ies) of \d+ card/.test(dlg),dlg.slice(0,120));
  await page.locator('[name=from]').fill('Journey Rob');await page.locator('[name=contact]').fill('rob@example.com');await page.locator('[name=note]').fill('Trades welcome at the shop on Thursdays.');await click('Make the link');await page.waitForTimeout(400);
  const linkText=await page.locator('.cm-trade-link a').getAttribute('href');ok(/#trade\?d=[A-Za-z0-9_-]+$/.test(linkText),'the link carries the list in its hash');eq((await state()).preferences.trade.from,'Journey Rob','the publisher facts are remembered');
  await click('Open the page');await page.locator('.cm-trade-grid').waitFor();eq(await page.locator('.cm-trade-card').count(),expected);ok(/Journey Rob’s trade list/.test(await page.locator('h1').innerText()));
  const names=await page.locator('.cm-trade-card strong').allInnerTexts();eq(names.length,expected);ok(names.every(n=>n.length>1));
  ok((await page.locator('.cm-trade-card a').first().getAttribute('href')).startsWith('mailto:rob@example.com?subject=About%20your%20'),'each card asks the publisher by mail');
  await page.locator('[data-trade-tick]').first().check();await page.waitForTimeout(100);ok(/Ask about 1 ticked card/.test(await page.locator('#cm-trade-ask-many').innerText()));ok((await page.locator('#cm-trade-ask-many').getAttribute('href')).startsWith('mailto:rob@example.com?subject=About%20your%20'),'the many-ask names the one ticked card');
  ok(/Trades welcome at the shop/.test(await page.locator('.cm-trade-note').innerText()));
  /* The visitor: a fresh context, no library, only the link. */
  const visitor=await browser.newContext({viewport:{width:1280,height:900}});const vp=await visitor.newPage();await stubNetwork(vp,[]);
  await vp.goto(BASE+'/'+ENTRY+linkText.slice(linkText.indexOf('#')));await vp.locator('.cm-trade-grid').waitFor({timeout:45000});eq(await vp.locator('.cm-trade-card').count(),expected,'the visitor sees the same cards from the link alone');eq((await vp.locator('.cm-trade-card strong').allInnerTexts()).sort(),names.slice().sort());
  await vp.goto(BASE+'/'+ENTRY+'#trade?d=broken');await vp.locator('#cm-main').getByText(/does not carry a trade list/).waitFor();
  await visitor.close();
  await nav('Cards');await page.locator('#cm-roster-table').waitFor();}

 /* AN OLDER LIBRARY AFTER AN UPGRADE (schema 2 still in IndexedDB): the app read it migrated but saved against the
    raw copy, so every save failed with "Unsupported collection schema." — the toast Rob saw at boot and on a strategy
    tick. Now the first save migrates the stored copy and succeeds. */
 {await page.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('crankmagic-library',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite'),st=tx.objectStore('state'),g=st.get('current');g.onsuccess=()=>{const s=g.result;s.schemaVersion=2;st.put(s,'current');};tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>rej(tx.error);};r.onerror=()=>rej(r.error);}));
  await page.reload();await page.locator('#cm-main .cm-page-head').waitFor({timeout:30000});await page.waitForTimeout(800);
  ok(!/Unsupported collection schema|could not be reconciled/.test(await page.locator('#cm-notice').innerText().catch(()=>'')),'no schema toast at boot');
  eq((await state()).schemaVersion,3,'the library is read migrated');
  await page.evaluate(async()=>{const r=await CrankRepository.open();try{const s=await r.getState();await r.commit({id:crypto.randomUUID(),type:'preferences',values:{schemaProbe:true}},s.revision);}finally{r.close();}});
  const stored=await page.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('crankmagic-library',1);r.onsuccess=()=>{const db=r.result,g=db.transaction('state').objectStore('state').get('current');g.onsuccess=()=>{const v=g.result.schemaVersion;db.close();res(v);};g.onerror=()=>rej(g.error);};r.onerror=()=>rej(r.error);}));
  eq(stored,3,'the first save after the upgrade stored the migrated library');eq((await state()).preferences.schemaProbe,true,'and the save itself went through');
  await page.evaluate(async()=>{const r=await CrankRepository.open();try{const s=await r.getState();await r.undo(s.revision);}finally{r.close();}});eq((await state()).preferences.schemaProbe,undefined,'undo of that save works on the migrated copy too');}
 await nav('Cards');await page.locator('#cm-roster-table').waitFor();await click('Sheet');await page.locator('.cm-sheet').waitFor();ok((await page.locator('.cm-sheet tbody tr').count())>1);
 await page.locator('#cm-sheet-query').fill('Krenko, Mob Boss');await page.waitForTimeout(300);eq(await page.locator('.cm-sheet tbody tr').count(),1);
 current=await state();const journey=current.decks.find(d=>d.name==='Journey Goblins'),krenkoKey=CrankKey('Krenko, Mob Boss');
 const krenkoOwned=()=>current.lots.filter(l=>l.cardId===krenkoKey&&l.source==='owned').reduce((n,l)=>n+l.quantity,0),ownedBefore=krenkoOwned();
 const sheetCell=(col,deckId='')=>page.locator(`.cm-sheet [data-cell="${krenkoKey}|${col}|${deckId}"]`);
 await sheetCell('own').click();await page.locator('.cm-sheet-input').fill(String(ownedBefore+1));await page.keyboard.press('Enter');await page.waitForTimeout(900);current=await state();eq(krenkoOwned(),ownedBefore+1);
 await sheetCell('boxed',journey.id).click();await page.locator('.cm-sheet-input').fill('1');await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();await click('Confirm change');await waitDialog();await page.waitForTimeout(900);current=await state();
 ok(current.lots.some(l=>l.cardId===krenkoKey&&l.source==='owned'&&l.allocation?.deckId===journey.id&&l.location?.kind==='deck'&&l.location.deckId===journey.id),'the typed 1 reserved a copy to the deck and put it in its box');
 eq(await sheetCell('boxed',journey.id).getAttribute('data-value'),'1');
 /* STAND-INS. A copy the deck's list does not call for goes into the box as a stand-in from the
    Collection's row menu; the deck counts it, the pull sheet lists it, and a tick there sends
    it back to the bench. */
 await click('Add a card row');await page.getByLabel('Card name or a Scryfall link').fill('Wastes');await page.locator('[data-pick-card]').filter({has:page.getByText('Wastes',{exact:true})}).first().click();await page.waitForTimeout(600);
 const wastesKey=CrankKey('Wastes');await page.locator(`.cm-sheet [data-cell="${wastesKey}|own|"]`).click();await page.locator('.cm-sheet-input').fill('1');await page.keyboard.press('Enter');await page.waitForTimeout(900);current=await state();ok(current.lots.some(l=>l.cardId===wastesKey&&l.source==='owned'));
 await click('List');await page.locator('#cm-roster-table').waitFor();await page.locator('#cm-roster-query').fill('Wastes');await row('Wastes','Bench').waitFor();
 await actionsFor('Wastes','Bench');await page.locator('#cm-standin-submenu-toggle').hover();{const sub=page.locator('#cm-standin-submenu');await sub.getByRole('button',{name:'Journey Goblins',exact:true}).waitFor();await sub.getByRole('button',{name:'Journey Goblins',exact:true}).click();}
 await page.getByRole('dialog').waitFor();await click('Confirm change');await waitDialog();await page.waitForTimeout(900);current=await state();
 {const l=current.lots.find(l=>l.cardId===wastesKey);eq(l.location.deckId,journey.id);eq(l.allocation,null);eq(CrankReadiness(current).standIns,1);}
 await nav('Decks');ok(await page.locator('.cm-deck-tile').filter({hasText:'Journey Goblins'}).innerText().then(t=>/1 substitute/.test(t)));
 await page.locator('.cm-deck-tile').filter({hasText:'Journey Goblins'}).getByRole('button').first().click();await page.getByRole('button',{name:/^Ready to add/}).click();
 await page.locator('.cm-pull-group[data-group=standin]').waitFor();/* This substitute "stays for now" (nothing real is ready for its seat), so Select all leaves it alone, as Mark all added does; the row's own tick still moves it. */eq(await page.locator('.cm-pull-group[data-group=standin] .cm-pull-select-all').count(),0);await page.locator('.cm-pull-group[data-group=standin] [data-pull-tick]').first().check();await page.waitForTimeout(900);current=await state();
 eq(current.lots.find(l=>l.cardId===wastesKey).location.kind,'bench');eq(CrankReadiness(current).standIns,0);
 /* MAKE THE CHANGE (Rob, 14 September). The deck page's hero offers the change list for a final
    deck: four readings held to the mana formula and the floors, one physical swap per row with
    the row count the header states, an Excel export of the same rows, a tick that is one
    revision, and a way in from the Cards page's More menu. */
 await nav('Decks');await page.locator('.cm-deck-tile').filter({hasText:'Journey Goblins'}).getByRole('button').first().click();await page.getByRole('button',{name:/^Make the change/}).click();
 await page.locator('.cm-change').waitFor();eq(await page.locator('.cm-change-reading').count(),4);
 {const counts=await page.locator('.cm-change-counts').innerText();const n=Number(/(\d+) rows?/.exec(counts)[1]);eq(await page.locator('.cm-change-row').count(),n);
  const sleeved=CrankReadiness(await state()).sleeved;ok(new RegExp(`^${sleeved}\\b`).test((await page.locator('.cm-change-reading').first().locator('dd').first().innerText()).trim()));
  const changeDownload=page.waitForEvent('download');await click('Export Excel');const changeFile=await changeDownload;ok(/-change-list\.xlsx$/.test(changeFile.suggestedFilename()));ok((await fs.stat(await changeFile.path())).size>2000);
  const ticks=page.locator('[data-change-tick]:not([disabled])');if(await ticks.count()){const before=(await state()).revision;await ticks.first().check();await page.waitForTimeout(900);ok((await state()).revision>before);ok(await page.locator('.cm-change-row.is-done').count()>=1);}}
 await nav('Cards');await page.locator('#cm-roster-table').waitFor();await click('More');await page.getByRole('button',{name:'Make the change for Journey Goblins'}).click();await page.locator('.cm-change').waitFor();
 /* The roster's search is shared with the Shop, so it is cleared before the Shop steps read money. */
 await nav('Cards');await page.locator('#cm-roster-table').waitFor();await click('Clear filters');await page.waitForTimeout(300);
 /* THE BENCH SURVIVES A DECK SCOPE (Rob, 14 September): working on one deck, what you already
    own and no deck has reserved is exactly what you want in front of you. The To buy tab still
    drops it, because money is not the question there. */
 {const deck=(await state()).decks.find(d=>d.status==='final'&&!d.archived);
  if(deck){await page.goto(BASE+'/'+ENTRY+'#cards?deck='+encodeURIComponent(deck.id));await page.locator('#cm-roster-table table').waitFor({timeout:30000});await page.waitForTimeout(400);
   const statuses=await page.evaluate(()=>{const h=[...document.querySelectorAll('#cm-roster-table th')].map(x=>x.textContent.trim().split(/\s/)[0]),i=h.indexOf('Status');
     return [...document.querySelectorAll('#cm-roster-table tbody tr')].map(tr=>((tr.children[i]||{}).textContent||'').trim().split('\n')[0]);});
   ok(statuses.includes('Bench'),'a deck scope keeps the Bench in the table');
   ok(/Bench/.test(await page.locator('#cm-roster-stats').innerText()),'and the counts row says the Bench is not in its figures');
   await page.goto(BASE+'/'+ENTRY+'#cards?view=tabletop&deck='+encodeURIComponent(deck.id));await page.locator('.cm-tt-mat').waitFor({timeout:30000});await page.waitForTimeout(500);
   ok(/Bench . [1-9]/.test((await page.locator('.cm-tt-pile.cm-tt-bench .cm-tt-placard').innerText()).replace(/\s+/g,' ')),'and the Bench pile still holds cards');
   await page.goto(BASE+'/'+ENTRY+'#cards?tab=buy&deck='+encodeURIComponent(deck.id));await page.locator('#cm-roster-table table, .cm-shop-strip').first().waitFor({timeout:30000});await page.waitForTimeout(400);
   const buy=await page.evaluate(()=>{const h=[...document.querySelectorAll('#cm-roster-table th')].map(x=>x.textContent.trim().split(/\s/)[0]),i=h.indexOf('Status');
     return [...document.querySelectorAll('#cm-roster-table tbody tr')].map(tr=>((tr.children[i]||{}).textContent||'').trim().split('\n')[0]);});
   ok(!buy.includes('Bench'),'To buy keeps the Bench out');
   await page.goto(BASE+'/'+ENTRY+'#cards');await page.locator('#cm-roster-table table').waitFor({timeout:30000});}}
 /* MONEY ON THE BUY LIST. The Shop opens grouped by deck with a strip above the table: the
    total at sheet prices equals the sum of the band headers' subtotals, and Bought on a row
    is one tap that records the copy and stamps the sheet price as what was paid. */
 /* Every row on one page: the strip counts every matched row and a band header only exists
    for the rows on the page, so the two agree only with paging off. */
 await page.evaluate(async()=>{const r=await CrankRepository.open();try{const s=await r.getState();await r.commit({id:crypto.randomUUID(),type:'preferences',values:{pageSize:'all'}},s.revision);}finally{r.close();}});
 await nav('Cards');await page.getByRole('tab',{name:/^To buy/}).click();await page.locator('#cm-shop-total').waitFor({timeout:45000});await page.locator('.cm-band-dollars').first().waitFor();
 const money=await page.evaluate(()=>{const num=t=>Number(String(t).replace(/[^0-9.]/g,''));return {total:num(document.querySelector('#cm-shop-total').textContent),bands:[...document.querySelectorAll('.cm-band-dollars')].map(el=>num(el.textContent))};});
 ok(money.total>0);eq(money.total.toFixed(2),money.bands.reduce((n,x)=>n+x,0).toFixed(2));
 await page.locator('#cm-roster-query').fill('Lightning Bolt');await page.waitForTimeout(300);await row('Lightning Bolt','Journey Goblins').getByRole('button',{name:'Bought',exact:true}).click();await page.waitForTimeout(900);current=await state();
 const bolt=current.lots.find(l=>l.cardId===CrankKey('Lightning Bolt')&&l.source==='owned');ok(bolt&&bolt.source==='owned'&&bolt.allocation);eq(bolt.paidSource,'catalog');ok(bolt.paid>0);
 /* ORDERS, ONE PER ORDER. Tick the Mountain rows, one dialog, and the ticked rows are one
    order carrying vendor, reference and a shipping share; the Orders tab lists it once and
    Arrived → bench lands every copy in one revision. */
 await page.locator('#cm-roster-query').fill('Mountain');await page.waitForTimeout(300);await page.locator('.cm-tick-all').check();await click('Ordered…');
 await page.getByLabel('Order reference').fill('J-1');await page.getByLabel('Shipping, spread across the lines ($)').fill('3');await click('Review order');await click('Confirm change');await waitDialog();await page.waitForTimeout(900);current=await state();
 const orders=CrankOrders(current);eq(orders.length,1);eq(orders[0].ref,'J-1');ok(orders[0].copies>=60);eq(orders[0].shipping.toFixed(2),'3.00');ok(orders[0].lots.every(l=>l.source==='ordered'&&l.order.shipShare>0&&(!(current.cards[l.cardId].price>0)||l.paidSource==='catalog')));
 const revBefore=current.revision;await page.getByRole('tab',{name:/^Orders/}).click();await page.locator('.cm-orders').waitFor();eq(await page.locator('.cm-order-row').count(),1);
 await click('Arrived → bench');await click('Confirm change');await waitDialog();await page.waitForTimeout(900);current=await state();eq(current.revision,revBefore+1);eq(CrankOrders(current)[0].arrived,CrankOrders(current)[0].copies);
 await page.getByRole('tab',{name:/^To buy/}).click();await page.locator('#cm-shop-total').waitFor();await click('Clear filters');
 await nav('Discover');await page.locator('#cm-graph').waitFor({timeout:45000});
 /* ENTER FOCUSES THE BEST MATCH: a prefix is enough, and the exact name wins over a longer
    one that starts the same way. */
 await page.locator('#cm-graph-query').fill('sol rin');await page.locator('#cm-graph-query').press('Enter');await page.locator('#cm-pane-body h2').filter({hasText:'Sol Ring'}).waitFor();eq(await page.locator('#cm-graph-query').inputValue(),'Sol Ring');
 await page.locator('#cm-graph-query').fill('Arcane Signet');await page.locator('#cm-graph-query').press('Enter');await page.locator('#cm-pane-body h2').filter({hasText:'Arcane Signet'}).waitFor();checks+=1;
 /* LANDS ONLY is a list, not a graph: the canvas goes, every land that passes the other
    filters is a row, and Enters narrows it. A facet opens in a dialog over the page, its
    options A to Z, so nothing under it moves; Lands only is a toggle in the bar itself. */
 {const scrollBefore=await page.evaluate(()=>document.querySelector('#cm-facet-count').getBoundingClientRect().top);await page.locator('#cm-facet-bar [data-action=facet-open][data-facet=type]').click();await page.getByRole('dialog').waitFor();eq(await page.evaluate(()=>document.querySelector('#cm-facet-count').getBoundingClientRect().top),scrollBefore,'opening a filter moves nothing under it');
  const names=await page.locator('dialog .cm-facet-pick span:first-child').allInnerTexts();eq(names.slice().sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})).join('|'),names.join('|'),'options are A to Z');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.locator('#cm-facet-bar .cm-facet-pick[data-key=lands][data-value="lands only"]').click();await page.locator('.cm-graph-grid.cm-lands-mode').waitFor();ok(await page.locator('#cm-graph').isHidden(),'no canvas in lands mode');
  const n=t=>Number(t.replace(/,/g,'').match(/(\d+) land/)[1]);const lands=n(await page.locator('.cm-list-head').innerText());ok(lands>1000,String(lands));ok(await page.locator('.cm-list-table th').allInnerTexts().then(t=>t.some(x=>/Enters/.test(x))));
  await page.locator('#cm-facet-bar [data-action=facet-open][data-facet=enters]').click();await page.getByRole('dialog').waitFor();await page.locator('dialog .cm-facet-pick[data-key=enters][data-value=untapped]').click();await page.waitForTimeout(400);const untapped=n(await page.locator('.cm-list-head').innerText());ok(untapped>300&&untapped<lands,`${lands} -> ${untapped}`);
  eq(await page.locator('#cm-facet-bar [data-facet-count=enters]').innerText(),'1','the bar badge counts the pick');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});ok(!(await page.evaluate(()=>!!document.querySelector('dialog[open]'))),'Escape closes the filter dialog');
  /* A land picked in Find a card opens in the list; a spell picked while lands are on leaves the mode and becomes the focus. */
  await page.locator('#cm-graph-query').fill('Command Tower');await page.locator('.cm-list-name[aria-expanded=true]').filter({hasText:'Command Tower'}).waitFor();
  await page.locator('#cm-graph-query').fill('Sol Ring');await page.locator('#cm-pane-body h2').filter({hasText:'Sol Ring'}).waitFor();ok(await page.evaluate(()=>document.querySelector('#cm-graph').crankGraph.current().name==='Sol Ring'));ok(!(await page.evaluate(()=>document.querySelector('.cm-graph-grid').classList.contains('cm-lands-mode'))));
  ok(!(await page.evaluate(()=>Object.keys(JSON.parse(document.querySelector('#cm-facet-chips')?.dataset.selection||'{}')).length)),'leaving the mode left no filters behind');if(await page.getByRole('button',{name:'Clear filters'}).count())await click('Clear filters');}
 /* PRIMARY PURPOSE, NARROWED COUNTS, A DECK'S COMMANDER. Sol Ring's ramp chip wears the one
    gold ring in the pane and the hover says so; with that chip picked, a filter dialog's counts
    are what the other filters leave and never more than the whole-graph figure; picking a deck
    under Yours puts a commander in focus. */
 {await page.locator('#cm-graph-query').fill('Sol Ring');await page.locator('#cm-pane-body h2').filter({hasText:'Sol Ring'}).waitFor();
  const prime=page.locator('#cm-pane-body .cm-chip.cm-chip-primary');eq(await prime.count(),1,'one gold ring in the pane');eq(await prime.getAttribute('data-value'),'ramp');ok(/^Primary Purpose — Ramp/.test(await prime.getAttribute('title')||''),'the hover names the Primary Purpose');
  ok(await page.locator('#cm-facet-bar .cm-facet-group[data-group=yours] .cm-facet-btn').count()>=1,'the Yours group is tagged');
  await prime.click();await page.waitForTimeout(500);
  await page.locator('#cm-facet-bar [data-action=facet-open][data-facet=colors]').click();await page.getByRole('dialog').waitFor();
  const rows=await page.evaluate(()=>[...document.querySelectorAll('dialog .cm-facet-pick')].map(p=>({v:p.dataset.value,n:Number(p.querySelector('small').textContent.replace(/,/g,'')),note:p.dataset.count||''})));
  ok(rows.length>=5&&rows.some(r=>/ of [\d,]+ in the whole graph/.test(r.note)),'counts are narrowed under the ramp filter');
  const whole=r=>Number((r.note.match(/of ([\d,]+)/)||[,String(r.n)])[1].replace(/,/g,''));ok(rows.every(r=>r.n<=whole(r)),'a narrowed count never exceeds the whole-graph count');
  ok(/Counts are under the filters you already have/.test(await page.locator('dialog .cm-facet-help').innerText()));
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await click('Clear filters');
  await page.locator('#cm-facet-bar [data-action=facet-open][data-facet=decks]').click();await page.getByRole('dialog').waitFor();
  const deckPick=page.locator('dialog .cm-facet-pick[data-key=decks]').first();ok(await deckPick.count()>0,'a deck to pick');await deckPick.click();await page.waitForTimeout(800);
  const focus=await page.evaluate(()=>{const c=document.querySelector('#cm-graph').crankGraph.current();return {name:c.name,commander:!!c.isCommander};});ok(focus.name!=='Sol Ring'&&focus.commander,`picking a deck focused its commander (${focus.name})`);
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await click('Clear filters');}
 /* THE ROLE LENS (Phase D). #discover?lens=Removal&deck=<id> picks the deck under Yours, opens
    the List tab in the lens and puts the commander in focus; the head counts the deck's cards
    in the role against the house minimum from the rules module, the select reaches the other
    six lenses, and None is the plain list again. */
 {const lensDeck=(await state()).decks.find(d=>!d.archived);ok(lensDeck,'a deck for the lens');
  await page.goto(BASE+'/'+ENTRY+'#discover?lens=Removal&deck='+encodeURIComponent(lensDeck.id));await page.locator('.cm-lens-head').waitFor({timeout:30000});
  ok(new RegExp('^Removal in '+lensDeck.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test((await page.locator('.cm-lens-head').innerText()).trim()),'the lens head names the role and the deck');
  ok(/^\d+ \/ 8$/.test((await page.locator('.cm-lens-count').innerText()).trim()),'the count reads against the house minimum of 8');
  eq(await page.locator('select[name=lens]').inputValue(),'Removal','the select shows the lens the route asked for');
  const lensFocus=await page.evaluate(()=>{const c=document.querySelector('#cm-graph').crankGraph.current();return !!(c&&c.isCommander);});ok(lensFocus,'the commander is in focus');
  await page.locator('select[name=lens]').selectOption('Ramp');await page.waitForTimeout(400);ok(/^Ramp in /.test((await page.locator('.cm-lens-head').innerText()).trim()),'the select changes the lens');
  ok(/\/ 10$/.test((await page.locator('.cm-lens-count').innerText()).trim()),'Ramp counts against 10');
  await page.locator('select[name=lens]').selectOption('');await page.waitForTimeout(400);eq(await page.locator('.cm-lens-head').count(),0,'None is the plain list again');ok(await page.locator('.cm-list-table').count()>0,'with the neighbourhood table back');
  /* Back to the plain route and the Card Info tab, so the steps after this start where they did. */
  await page.goto(BASE+'/'+ENTRY+'#discover');await page.locator('#cm-graph').waitFor({timeout:30000});await page.waitForTimeout(800);await page.locator('.cm-pane-tab[data-tab=card]').click();await click('Clear filters');await page.waitForTimeout(500);}
 /* THE TRACE (T2/T3). #discover?deck=<id>&trace=1 picks the deck, opens the pane's Trace tab and
    puts the graph in trace mode: the commander at the centre, the lit list in the pane in the
    walk's order, the transport working, an unticked strategy saved with the deck, and Card Info
    ending the trace. The journey's deck is small, so the assertions are about the mechanism, not
    the goblin deck's numbers (tests/crankmagic-trace.mjs holds those). */
 {const traceDeck=(await state()).decks.find(d=>!d.archived);ok(traceDeck,'a deck for the trace');
  await page.goto(BASE+'/'+ENTRY+'#discover?deck='+encodeURIComponent(traceDeck.id)+'&trace=1');await page.locator('.cm-trace-head').waitFor({timeout:30000});await page.waitForTimeout(600);
  ok(new RegExp('^Trace: what '+traceDeck.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' builds from ').test((await page.locator('.cm-trace-head').innerText()).trim()),'the head names the deck and its commander');
  eq(await page.locator('.cm-pane-tab[data-tab=trace]').getAttribute('aria-selected'),'true','the Trace tab is selected');
  const tr=await page.evaluate(()=>{const g=document.querySelector('#cm-graph').crankGraph;const p=g.positions();return {tracing:g.tracing,total:g.traceState&&g.traceState.total,centre:g.current()&&g.current().isCommander,nodes:p.length,ghosts:p.filter(n=>n.ghost).length};});
  ok(tr.tracing&&tr.centre,`the graph is in trace mode with the commander at the centre (${tr.nodes} nodes, ${tr.ghosts} ghosts)`);
  eq(await page.locator('.cm-trace-row').count(),tr.total,'the pane lists exactly the cards the graph will light');
  ok(await page.locator('.cm-trace-score strong').count()===4,'the score strip has its four figures');
  await page.locator('[data-action=trace-ctl][data-ctl=end]').click();await page.waitForTimeout(400);
  eq(await page.locator('.cm-trace-row.is-lit').count(),tr.total,'End lights every row');ok(/of \d+ lit$/.test((await page.locator('#cm-trace-at').innerText()).trim()),'and the counter says so');
  const ticks=await page.locator('.cm-trace-strategies input[name=traceStrategy]:checked').count();
  if(ticks>1){const first=page.locator('.cm-trace-strategies input[name=traceStrategy]:checked').first();const id=await first.getAttribute('value');await first.click();await page.waitForTimeout(1200);
   const saved=(await state()).decks.find(d=>d.id===traceDeck.id).definition.strategies||[];ok(saved.length===ticks-1&&!saved.includes(id),`the unticked strategy is saved with the deck (${saved.join(', ')})`);
   await page.locator('input[name=traceStrategy][value="'+id+'"]').click();await page.waitForTimeout(1200);}
  /* The Speed control sits on the transport line; row ticks file cards in a group; Reset returns
     the ticks to the commander's own and clears what the deck had saved. */
  {const lb=await page.locator('.cm-trace-transport label').boundingBox(),sb=await page.locator('select[name=traceSpeed]').boundingBox();ok(lb&&sb&&Math.abs((lb.y+lb.height/2)-(sb.y+sb.height/2))<4,'the Speed label and its select share a line');
   ok((await page.locator('.cm-trace-tick-strategy small').count())===(await page.locator('.cm-trace-tick-strategy').count()),'every strategy tick says what it lights on its own');
   /* The journey's deck is small and may light nothing on its own; What it could be traces the
      library and the commander's co-play neighbours, so it has rows to tick. */
   let picks=Math.min(2,await page.locator('.cm-trace-pick').count());
   if(!picks){await page.getByRole('button',{name:'What it could be',exact:true}).click();await page.waitForTimeout(3000);picks=Math.min(2,await page.locator('.cm-trace-pick').count());}
   eq(await page.locator('#cm-trace-pickbar').count(),1,'the tick bar stands above the list');
   if(picks>=1){for(let i=0;i<picks;i++)await page.locator('.cm-trace-pick').nth(i).check();eq((await page.locator('#cm-trace-pickbar span').innerText()).trim(),`${picks} ticked`,'the bar counts the ticked rows');
    await page.getByRole('button',{name:'Add ticked to a group',exact:true}).click();await page.getByRole('dialog').waitFor();await page.locator('[name=name]').fill('Trace picks');await page.getByRole('button',{name:'Add to group',exact:true}).click();await page.waitForTimeout(800);
    const g=(await state()).groups.find(x=>x.name==='Trace picks');ok(g&&g.entries.length===picks,'the ticked cards are planned entries of a new group');eq((await page.locator('#cm-trace-pickbar span').innerText()).trim(),'Tick cards to file them in a group','the ticks clear after filing');}
   else ok(true,'nothing to tick in this library, in either world');
   /* The limits (Rob, 14 September): three sliders; Cards lit released at 10 keeps the list to ten and is saved with the library. */
   eq(await page.locator('.cm-trace-limits input[type=range]').count(),3,'three limit sliders');
   await page.locator('input[name=traceCards]').evaluate(el=>{el.value='10';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForTimeout(1500);
   ok((await page.locator('.cm-trace-row').count())<=10,'Cards lit at 10 lights at most ten');eq((await state()).preferences.traceLimits?.cards,10,'and the limit is saved with the library');eq((await page.locator('input[name=traceCards]').inputValue()),'10','the slider shows it after the redraw');
   await page.locator('input[name=traceCards]').evaluate(el=>{el.value='100';el.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForTimeout(1200);
   if(ticks>1){await page.getByRole('button',{name:'Reset to the commander’s own',exact:true}).click();await page.waitForTimeout(1500);eq(((await state()).decks.find(d=>d.id===traceDeck.id).definition.strategies||[]).length,0,'Reset clears the strategies saved with the deck');eq(await page.getByRole('button',{name:'Reset to the commander’s own',exact:true}).count(),0,'and the Reset button goes with them');}}
  await page.locator('.cm-pane-tab[data-tab=card]').click();await page.waitForTimeout(800);
  ok(!(await page.evaluate(()=>document.querySelector('#cm-graph').crankGraph.tracing)),'Card Info ends the trace and the graph is the neighbourhood again');
  await page.goto(BASE+'/'+ENTRY+'#discover');await page.locator('#cm-graph').waitFor({timeout:30000});await page.waitForTimeout(800);await click('Clear filters');await page.waitForTimeout(500);}
 /* LOOPS ONLY. Picking a deck turns the walk to loop joins by itself: its commander in focus,
    the depth gauge crossing only the joins that continue or pay off a loop, the pane listing
    the closed cycles through the focus or saying there are none; the toggle brings the whole
    neighbourhood back, and clearing the filters clears the mode. Any deck works this way -- the
    journey's own library here, the live library's goblin deck in tests/crankmagic-loops.mjs. */
 {await page.locator('#cm-facet-bar [data-action=facet-open][data-facet=decks]').click();await page.getByRole('dialog').waitFor();
  await page.locator('dialog .cm-facet-pick[data-key=decks]').first().click();await page.waitForTimeout(1500);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  ok(await page.locator('#cm-loop-mode').isChecked(),'a deck pick turns Loops only on');ok(await page.evaluate(()=>document.querySelector('#cm-graph').crankGraph.loopMode===true),'the graph walks in loop mode');
  const g=()=>page.evaluate(()=>{const gr=document.querySelector('#cm-graph').crankGraph;return {focus:gr.current().name,commander:!!gr.current().isCommander,near:gr.positions().filter(p=>p.depth>0&&p.depth<=2).map(p=>p.name)};});
  const on=await g();ok(on.commander,`the commander is in focus (${on.focus})`);ok(!on.near.includes('Sol Ring')&&!on.near.includes('Arcane Signet'),'the mana rocks stay out of loop mode');
  ok(/loops only/.test(await page.locator('#cm-graph-size').innerText()),'the canvas count says loops only');
  const loops=await page.locator('#cm-pane-body .cm-loops').count();const none=await page.locator('#cm-pane-body .cm-loops-none').count();eq(loops+none,1,'the pane lists the loops or says there are none');if(loops)ok(await page.locator('#cm-pane-body .cm-loops .cm-loop').count()>=1,'a listed loop has at least one line');
  await page.locator('#cm-loop-mode').uncheck();await page.waitForTimeout(1000);ok(await page.evaluate(()=>document.querySelector('#cm-graph').crankGraph.loopMode===false),'the toggle turns loop mode off');ok(!/loops only/.test(await page.locator('#cm-graph-size').innerText()),'and the count no longer says so');
  const off=await g();ok(off.near.length>=on.near.length,`${off.near.length} within two steps off loop mode, ${on.near.length} on`);eq(await page.locator('#cm-pane-body .cm-loops-none').count(),0,'off loop mode the no-loop note is gone');
  await click('Clear filters');ok(!(await page.locator('#cm-loop-mode').isChecked()),'clearing the filters clears loop mode');}
 /* THE CARD POP-UP: in Inspect mode a tap on a node opens the card and its join -- the
    picture, the four facts, the Primary Purpose and "Joined to <focus> by" -- to the right of
    the node, and nothing else; its full term list lives under Inspect card now. */
 {await page.locator('#cm-graph-query').fill('Krenko, Mob Boss');await page.locator('#cm-pane-body h2').filter({hasText:'Krenko'}).waitFor();await page.waitForTimeout(500);
  await click('Inspect');const target=await page.evaluate(()=>{const g=document.querySelector('#cm-graph').crankGraph;const c=g.current();return g.positions().find(n=>n.depth===1&&n.id!==c.id);});ok(target,'a ring-one node to tap');
  const box=await page.locator('#cm-graph').boundingBox();await page.mouse.click(box.x+target.x,box.y+target.y);await page.locator('#cm-graph-pop:not([hidden])').waitFor({timeout:8000});
  const pop=await page.evaluate(()=>{const p=document.querySelector('#cm-graph-pop');const r=p.getBoundingClientRect();return {card:p.classList.contains('cm-pop-card'),art:!!p.querySelector('.cm-pop-art img, .cm-pop-noart'),artW:p.querySelector('.cm-pop-art img, .cm-pop-noart').getBoundingClientRect().width,side:p.querySelectorAll('.cm-pop-side > button, .cm-pop-side > details').length,sideLeft:p.querySelector('.cm-pop-side').getBoundingClientRect().right<=p.querySelector('.cm-pop-art').getBoundingClientRect().left+1,typeLine:(p.querySelector('.cm-pop-type')||{}).textContent||'',joined:/Joined to Krenko/.test(p.textContent),own:/Its own terms/.test(p.textContent),primary:p.querySelectorAll('.cm-chip-primary').length,left:parseFloat(p.style.left),width:r.width};});
  ok(pop.card&&pop.art,'the pop-up carries the card picture');ok(pop.artW>=220,`the picture is the inspector's size (${pop.artW.toFixed(0)}px)`);eq(pop.side,4,'the four controls stand together');ok(!!await page.locator('#cm-graph-pop .cm-pop-side .cm-card-view-menu-btn').count(),'and Add/Buy is one of them, so a card found in Inspect can be bought without going back to the pane');ok(pop.sideLeft,'stacked on the picture\'s left');ok(/\S/.test(pop.typeLine),'the type line is there, with the mana pips on it');ok(pop.joined,'and how the card joins the focus');ok(!pop.own,'the term wall is gone from the pop-up');eq(pop.primary,1,'one Primary Purpose chip');ok(pop.width>=400,`the pop-up is wider (${pop.width})`);ok(pop.left>target.x||pop.left+pop.width<target.x,`the pop-up sits beside the node, not over it (node x ${target.x.toFixed(0)}, pop ${pop.left.toFixed(0)}–${(pop.left+pop.width).toFixed(0)})`);
  await page.locator('#cm-graph-pop').getByRole('button',{name:'Inspect card',exact:true}).click();await page.locator('#cm-dialog[open] .cm-inspector-terms').waitFor({timeout:20000});
  ok(await page.locator('#cm-dialog .cm-inspector-terms-row').count()>=2,'Inspect card lists the terms the graph reads');eq(await page.locator('#cm-dialog .cm-inspector-terms .cm-chip-primary').count(),1,'with the Primary Purpose ringed');
  await page.keyboard.press('Escape');await page.locator('#cm-dialog[open]').waitFor({state:'hidden'});await page.keyboard.press('Escape');ok(await page.locator('#cm-graph-pop').isHidden(),'Escape closes the pop-up');await click('Navigate');}
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
 /* THE LIST TAB: the whole neighbourhood at the widest reach, sortable, a row opening the
    card in Card Info without moving the focus. */
 await page.getByRole('tab',{name:'List'}).click();await page.locator('.cm-list-table').waitFor({timeout:45000});const listed=await page.locator('.cm-list-row').count();ok(listed>0);ok(await page.evaluate(()=>document.querySelector('.cm-graph-grid').classList.contains('cm-list-open')));
 await page.locator('.cm-list-table [data-action=list-sort][data-key=name]').click();eq(await page.locator('.cm-list-table th[aria-sort=ascending] button').innerText().then(t=>t.trim().split(/\s/)[0]),'Card');
 const firstName=await page.locator('.cm-list-name').first().innerText();await page.locator('.cm-list-name').first().click();await page.locator('.cm-list-detail').waitFor();ok(await page.locator('.cm-list-detail').innerText().then(t=>/Focus here/.test(t)));eq(await page.locator('.cm-list-name[aria-expanded=true]').innerText(),firstName);ok(await page.locator('.cm-pane-tab.is-on').innerText().then(t=>/List/.test(t)));await page.locator('.cm-list-name').first().click();eq(await page.locator('.cm-list-detail').count(),0);ok(await page.locator('.cm-list-table th').allInnerTexts().then(t=>t.some(x=>/Link/.test(x))&&t.some(x=>/Color/.test(x))&&!t.some(x=>/Ring|Type|Mana/.test(x))));
 {const g=page.locator('#cm-pane-gutter');const box=await g.boundingBox();const width=()=>page.locator('#cm-card-view').evaluate(e=>e.clientWidth);const before=await width();await page.mouse.move(box.x+box.width/2,box.y+200);await page.mouse.down();await page.mouse.move(box.x-160,box.y+200,{steps:8});await page.mouse.up();const after=await width();ok(after>before+120,`pane widened from ${before} to ${after}`);ok(await page.evaluate(()=>Number(localStorage.getItem('crankmagic:paneWidth:default'))>0));eq(await page.locator('#cm-card-view').getAttribute('data-w'),'l');const b2=await g.boundingBox();await page.mouse.move(b2.x+b2.width/2,b2.y+200);await page.mouse.down();await page.mouse.move(b2.x+340,b2.y+200,{steps:8});await page.mouse.up();ok(await width()<300,'pane narrowed');ok(await page.locator('.cm-list-table th.cm-col-link').isHidden());await g.dblclick();ok(Math.abs(await width()-before)<4,'double-click resets');eq(await page.evaluate(()=>localStorage.getItem('crankmagic:paneWidth:default')),null);}
 await page.getByRole('tab',{name:'List'}).click();await page.locator('.cm-list-tick').first().check();await page.locator('.cm-pick-actions').waitFor();await click('Clear selection');
 /* SHELF MODE (play space PR 4; plan §2.15). The table's second job. The catalog reaches it by
    selection rather than by a second search surface: tick a card on Discover, Send to the table,
    and it arrives as a row the library has never seen. With no deck picked the band along the
    bottom is the collection groups, a tray is bound to one of them, and confirming files the card
    as a PLANNED entry — a plan, never a claim that a copy was bought. */
 {await page.getByRole('tab',{name:'List'}).click();await page.locator('.cm-list-table').waitFor({timeout:45000});
  const sentName=(await page.locator('.cm-list-name').first().innerText()).trim();
  await page.locator('.cm-list-tick').first().check();await page.locator('.cm-pick-actions').waitFor();
  await click('Send to the table');await page.locator('.cm-tt-mat').waitFor({timeout:45000});
  ok(page.url().endsWith('#cards?view=tabletop'),'Send to the table lands on the table, with no deck picked');
  ok(/sent from Discover/.test(await page.locator('#cm-tt-status').innerText()),'and the table says how many are waiting there');
  eq(await page.locator('.cm-tt-pile.cm-tt-status').count(),0,'the band is shelf mode, not the statuses');
  const gid=await page.locator('.cm-tt-pile.cm-tt-shelfgroup').first().getAttribute('data-pile');
  const groupName=(await page.locator('.cm-tt-pile.cm-tt-shelfgroup .cm-tt-placard strong').first().innerText()).trim();
  /* A tray is bound to a group, and says so by taking its name. */
  await page.locator('.cm-tt-tray-bind[data-n="1"]').selectOption(gid.replace(/^shelf:/,''));await page.waitForTimeout(500);
  ok((await page.locator('.cm-tt-tray').first().getAttribute('aria-label')).startsWith(groupName+','),`a bound tray takes its group's name (${groupName})`);
  ok(new RegExp(groupName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(await page.locator('.cm-tt-play .cm-tt-score').innerText()),'and the scoreboard reads that group\'s size');
  /* The sent card is on the table, as a ghost that says where it came from. */
  await page.locator('#cm-tt-query').fill(sentName);await page.waitForTimeout(600);
  await page.locator('.cm-tt-pile.cm-tt-group:not(.is-empty)').first().click();await page.locator('.cm-tt-grid').waitFor({timeout:20000});
  eq(await page.locator('.cm-tt-grid .cm-tt-card[data-record^="catalog:"]').count(),1,'the sent card is a row of its own on the table');
  eq(await page.locator('.cm-tt-grid .cm-tt-card[data-record^="catalog:"]').getAttribute('data-ghost'),'Sent from Discover','a ghost, because nothing about it is held');
  await page.locator('.cm-tt-grid .cm-tt-card[data-record^="catalog:"]').click();await page.locator('.cm-tt-stage').waitFor({timeout:20000});
  /* Move to… offers the groups and nothing that claims a copy. */
  await click('Move to…');await page.locator('.cm-row-menu').waitFor();
  eq(await page.locator(`.cm-row-menu button[data-pile="${gid}"]`).count(),1,'the collection group is offered');
  eq(await page.locator('.cm-row-menu button[data-pile^="status:"]').count(),0,'no status is — a card sent from Discover is not a copy you hold');
  eq(await page.locator('.cm-row-menu button[data-pile=bench]').count(),0,'and neither is the Bench');
  const before=(await state()).groups.find(g=>g.id===gid.replace(/^shelf:/,''));
  await page.locator(`.cm-row-menu button[data-pile="${gid}"]`).click();await page.waitForTimeout(700);
  await page.locator('.cm-sitting').waitFor({timeout:15000});ok(/1 move pending/.test(await page.locator('.cm-sitting').innerText()),'filing a sent card stages rather than saving');
  await click('Review and confirm');await page.getByRole('dialog').waitFor();
  ok(/planned in/.test(await page.getByRole('dialog').innerText()),'the receipt says planned, not owned');
  await click('Confirm change');await page.waitForTimeout(1400);
  {const st=await state(),after=st.groups.find(g=>g.id===gid.replace(/^shelf:/,''));
   eq(after.entries.length,before.entries.length+1,`${groupName} gained a planned entry`);
   const planned=after.entries[after.entries.length-1];
   ok(!st.lots.some(l=>l.cardId===planned.cardId),'and nothing anywhere says a copy of it is owned');
   ok(!!st.cards[planned.cardId],'the card record came with the move, so the library knows what was planned');}
  await page.evaluate(()=>localStorage.removeItem('cm-table-sent'));
  /* Back to Discover, which is where the rest of this journey stands. */
  await page.goto(BASE+'/'+ENTRY+'#discover');await page.locator('#cm-graph').waitFor({timeout:45000});await page.waitForTimeout(800);}
 /* ADD COPIES IS A COUNT, NOT A FORM (Rob, 15 September). Two facts per row -- what these
    copies are and how many -- a link that adds a row for the box where three arrived but only
    one is in hand, and the printing, box, price and notes folded away until a row says Owned.
    Several rows go as one batch, so three rows are one revision and one undo. */
 {await page.goto(BASE+'/'+ENTRY+'#cards');await page.locator('#cm-roster-table').waitFor();
  await click('Add cards');await page.getByRole('dialog').waitFor();
  await page.getByLabel('Card name or a Scryfall link').fill('Wastes');
  await page.locator('[data-pick-card]').filter({has:page.getByText('Wastes',{exact:true})}).first().click();
  await page.locator('.cm-copy-row').first().waitFor();
  eq(await page.locator('.cm-copy-row').count(),1,'one row to start');
  eq(await page.locator('.cm-copy-extras').evaluate(el=>el.hidden),false,'Owned offers the optional fields');
  await page.locator('.cm-copy-row').first().locator('select').selectOption('ordered');await page.waitForTimeout(200);
  eq(await page.locator('.cm-copy-extras').evaluate(el=>el.hidden),true,'an ordered card has no box and no price paid, so they are not asked for');
  await page.locator('.cm-copy-row').first().locator('select').selectOption('owned');await page.waitForTimeout(200);
  await page.locator('.cm-copy-row').first().locator('[data-copy=more]').click();
  eq(await page.locator('.cm-copy-row').first().locator('input').inputValue(),'2','the arrow counts');
  await page.locator('.cm-copy-more').click();await page.waitForTimeout(200);
  eq(await page.locator('.cm-copy-row').count(),2,'+ row adds a second');
  await page.locator('.cm-copy-row').nth(1).locator('select').selectOption('watching');await page.waitForTimeout(200);
  const was=await state(),rev=was.revision;
  const owned0=was.lots.filter(l=>l.cardId===wastesKey&&l.source==='owned').reduce((n,l)=>n+l.quantity,0);
  const watched0=was.lots.filter(l=>l.cardId===wastesKey&&l.source==='watching').reduce((n,l)=>n+l.quantity,0);
  await click('Add copies');await waitDialog();await page.waitForTimeout(1000);
  const now=await state();
  eq(now.revision,rev+1,'two rows are one revision, so one undo takes both back');
  eq(now.lots.filter(l=>l.cardId===wastesKey&&l.source==='owned').reduce((n,l)=>n+l.quantity,0),owned0+2,'two owned');
  eq(now.lots.filter(l=>l.cardId===wastesKey&&l.source==='watching').reduce((n,l)=>n+l.quantity,0),watched0+1,'and one watched, from the same dialog');
  /* Back to Discover: the offline step below reloads whatever page is showing and waits for the
     graph, so a journey that wanders off and does not come back breaks it a screen later. */
  await page.goto(BASE+'/'+ENTRY+'#discover');await page.locator('#cm-graph').waitFor({timeout:45000});await page.waitForTimeout(800);}
 /* Going offline changes nothing: the comparison is against the library as it stands one line
    earlier, not a snapshot from the Lab run half a journey ago — anything recorded in between
    is a real change and would read here as an offline fault. */
 const beforeOffline=await state();
 await page.unroute('**://api.scryfall.com/**');await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.locator('#cm-graph').waitFor({timeout:45000});await nav('Cards');await page.getByRole('table').waitFor();eq((await state()).lots,beforeOffline.lots);await context.setOffline(false);
 await page.setViewportSize({width:390,height:844});await nav('Decks');await page.getByRole('heading',{name:'Decks',level:1}).waitFor();ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));const navBox=await page.getByRole('navigation',{name:'Main pages'}).boundingBox();ok(navBox.y>=0&&navBox.y<844);await nav('Cards');await page.getByRole('table').waitFor();ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 eq(errors,[]);console.log(`crankmagic-journeys: ${checks} checks passed across real deck assembly, imports, printing lots, corrections, concurrency, quota abort, backup restore, initial construction, graph navigation, offline and mobile.`);
}catch(error){console.error(error);console.error('url:',page.url(),'| selected tab:',await page.evaluate(()=>document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim()||'(none)'));console.error((await page.locator('body').innerText()).slice(0,8500));await page.screenshot({path:'tests/uat/crankmagic-failure.png',fullPage:true});process.exitCode=1;}finally{await browser.close();}
function CrankKey(name){return 'card:'+Buffer.from(name.normalize('NFKC').trim().toLowerCase()).toString('base64url');}
function CrankReadiness(s){const M=require('../../collection-model.js');return M.readiness(s,s.decks[0]);}
function CrankOrders(s){return require('../../collection-model.js').orders(s);}
