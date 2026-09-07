import {chromium,launchOptions,packageRoot,qaRoot} from './environment.mjs';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=packageRoot;
const browser=await chromium.launch(launchOptions);
let checks=0;const errors=[];const ok=(value,label)=>{assert.ok(value,label);checks++;};
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
 const commanders={atraxa:["Atraxa, Praetors' Voice",'End-step trigger.'],krenko:['Krenko, Mob Boss','Activated ability.'],shadrix:['Shadrix Silverquill','Combat trigger.']};
 for(const width of [320,390,736,1024,1440])for(const system of ['light','dark']){
  await page.setViewportSize({width,height:1100});await page.emulateMedia({colorScheme:system,reducedMotion:'reduce'});
  await page.goto(pathToFileURL(root+'/mtg-facelift-mockup.html').href);
  const frame=page.frames()[1];await frame.evaluate(()=>document.fonts.ready);
  ok(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)==='dark','Export shell stays dark');
  ok(await frame.locator('#matrix-v2').evaluate(e=>getComputedStyle(e).colorScheme)==='dark','Product stays dark under '+system+' OS appearance');
  ok(await frame.locator('#v-theme,.v-study').count()===0,'Theme selector and header study text removed');
  const button=frame.locator('#v-user-functions-button'),menu=frame.locator('#v-user-functions-menu');
  await button.click();ok(await menu.isVisible(),'User Functions opens');
  const bounds=await menu.boundingBox();ok(bounds.x>=0&&bounds.x+bounds.width<=width,'Menu stays in viewport');
  ok(await menu.locator('button').count()===7&&await menu.locator('[data-user-function=undo]').isDisabled(),'Admin actions and Excel present; unavailable undo disabled');
  await page.keyboard.press('Escape');ok(!await menu.isVisible()&&await button.evaluate(e=>e===document.activeElement),'Escape restores focus');
  for(const action of ['export','import','excel','default','reset','clear']){
   await button.click();await menu.locator(`[data-user-function=${action}]`).click();
   ok((await frame.locator('#v-dialog').innerText()).includes('Design preview only.'),'Operation clearly a preview: '+action);
   await frame.locator('[data-dialog-close]').click();
  }
  for(const [deck,[name,ability]] of Object.entries(commanders)){
   await frame.locator('[data-view=decks]').click();await frame.locator('#v-open-'+deck).click();
   const card=frame.locator('.v-commander-card');await card.evaluate(e=>e.decode());
   ok((await card.getAttribute('alt')).includes(name)&&await card.evaluate(e=>e.naturalWidth===312&&e.naturalHeight===435),'Correct full card loads offline: '+deck);
   const notes=await frame.locator('.v-commander-notes').innerText();
   ok(!notes.includes('Attributes.')&&!notes.includes('Mana cost.')&&/\d\/\d/.test(notes)&&notes.includes(ability)&&notes.includes('How to use'),'Compact stats, ability and use statement: '+deck);
   ok(await frame.locator('#v-about-commander-title').innerText()==='About the Commander','Requested heading');
   const composition=await frame.locator('.v-composition-panel').boundingBox(),about=await frame.locator('.v-commander-panel').boundingBox();
   if(width===1440)ok(Math.abs(composition.y-about.y)<2&&composition.x+composition.width<about.x,'Commander beside Composition');
   else ok(about.y>=composition.y+composition.height,'Responsive summary stack');
   ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   await frame.locator('#v-overview-cards').click();ok(await frame.locator('#v-collection-group').inputValue()==='deck:'+deck[0].toUpperCase()+deck.slice(1),'Deck collection scope retained');
  }
  if(system==='dark'&&[390,1440].includes(width)){
   await frame.locator('[data-view=decks]').click();await frame.locator('#v-open-atraxa').click();
   await frame.locator('.v-overview-summary').screenshot({path:qaRoot+`/commander-overview-${width}.png`});
   await button.click();await frame.locator('.v-top').scrollIntoViewIfNeeded();
   await page.screenshot({path:qaRoot+`/user-functions-${width}.png`});
  }
 }
 ok(!errors.length,'No runtime errors: '+errors.join('; '));
 const result={checks,passed:true,offline:true,widths:[320,390,736,1024,1440],systemAppearances:['light','dark'],productTheme:'dark',errors};
 writeFileSync(qaRoot+'/crankmagic-overview-qa.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
