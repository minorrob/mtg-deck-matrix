import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {previewServer} from './server.mjs';
import {openBrowser} from '../../tests/uat/browser-runner.mjs';
const session=await openBrowser({name:'Babylon tabletop',flag:'GEOMETRY_REQUIRED'});
if(!session)process.exit(0);
const {browser,close}=session;
const server=previewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const snapshot=(page,id)=>page.evaluate(id=>tabletopLab.snapshot().find(c=>c.id===id),id);
const sleep=page=>page.waitForTimeout(450);
let count=0;function check(condition,message){assert.ok(condition,message);count++;}
async function load(page){await page.goto(base);await page.waitForFunction(()=>globalThis.tabletopLab);await sleep(page);}
async function drag(page,id,dx,dy=0){const before=await snapshot(page,id);await page.mouse.move(before.screen.x,before.screen.y);await page.mouse.down();await page.mouse.move(before.screen.x+dx,before.screen.y+dy,{steps:9});await sleep(page);const lifted=await snapshot(page,id);await page.mouse.up();await sleep(page);return{before,lifted,after:await snapshot(page,id)};}
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
  const source=await page.evaluate(()=>JSON.stringify(tabletopLab.view));
  let result=await drag(page,'K545',120,0);
  check(result.lifted.position.y>.4,'Pointer drag physically lifts the mesh');
  check(result.after.position.x>result.before.position.x+.5,'Pointer drag changes the card position');
  check(result.after.position.y<.1,'Release settles the card onto its mat');
  check(Math.abs(result.after.position.z-result.before.position.z)<.36,'Reorder stays inside its row');
  await page.locator('#tap').click();await sleep(page);check((await snapshot(page,'K545')).tapped,'Tap rotates the selected battlefield card');
  await page.locator('#inspect').click();check(await page.locator('#inspection').isVisible(),'Inspect opens readable card');
  check((await page.locator('#inspection-image').getAttribute('src')).startsWith('data:image/'),'Inspection uses the loaded texture, including fallback');
  await page.keyboard.press('Escape');await sleep(page);check((await snapshot(page,'K545')).position.y<.1,'Inspection returns card to table');
  await page.locator('#return').click();await sleep(page);check(Math.abs((await snapshot(page,'K545')).position.x-result.before.position.x)<.1,'Return restores exact recorded position');
  result=await drag(page,'K545',0,180);check(result.after.goal.z>=result.after.bounds.zmin,'Drag cannot move a creature into the next section');
  check(await page.evaluate(old=>JSON.stringify(tabletopLab.view)===old,source),'Local taps and moves never mutate authoritative projection');
  await page.locator('#camera-toggle').click();
  for(const zoom of [60,180]){await page.locator('#zoom').fill(String(zoom));await page.locator('#zoom').dispatchEvent('input');check(await page.locator('#zoom-value').textContent()===zoom+'%','Zoom endpoint '+zoom);}
  for(const tilt of [0,60]){await page.locator('#tilt').fill(String(tilt));await page.locator('#tilt').dispatchEvent('input');check(await page.locator('#tilt-value').textContent()===tilt+'°','Tilt endpoint '+tilt);}
  await page.locator('#tilt').fill('40');await page.locator('#tilt').dispatchEvent('input');await page.locator('#home-camera').click();await page.locator('#camera-toggle').click();
  await page.locator('#seats button').nth(1).click();await sleep(page);check(await page.evaluate(()=>tabletopLab.snapshot().filter(c=>c.zone==='Hand').every(c=>c.hidden&&c.name===null)),'Other seats only expose card backs');
  const opponent=await snapshot(page,'K487');await page.mouse.click(opponent.screen.x,opponent.screen.y);check(await page.locator('#tap').isDisabled(),'Opponent tap is disabled');
  result=await drag(page,'K487',75);check(Math.abs(result.before.position.x-result.after.position.x)<.01,'Opponent cards cannot be rearranged');
  await page.locator('#seats button').first().click();await page.locator('#next').click();await page.waitForFunction(()=>tabletopLab.frame===14);check(await page.evaluate(()=>tabletopLab.view.revision)!==JSON.parse(source).revision,'Next recording loads existing game state');
  await page.locator('#previous').click();await page.waitForFunction(()=>tabletopLab.frame===13);await sleep(page);
  await page.locator('#card-list summary').click();await page.getByRole('button',{name:/K526 ·/}).click();await page.locator('#table').focus();await page.keyboard.press('ArrowRight');await sleep(page);check((await snapshot(page,'K526')).goal.x>-4.65,'Keyboard movement works');await page.keyboard.press('Enter');check(await page.locator('#inspection').isVisible(),'Keyboard inspection works');await page.keyboard.press('Escape');
  await page.locator('#reset').click();await sleep(page);await page.waitForFunction(()=>tabletopLab.snapshot().filter(c=>!c.hidden&&c.player===0).every(c=>c.artReady),{timeout:90000});await page.screenshot({path:'docs/play-overhaul/screenshots/babylon-desktop.png'});
  const selected=await snapshot(page,'K526');await page.mouse.move(selected.screen.x,selected.screen.y);await page.mouse.down();await page.mouse.move(selected.screen.x+60,selected.screen.y,{steps:8});await sleep(page);await page.screenshot({path:'docs/play-overhaul/screenshots/babylon-picked-up.png'});await page.mouse.up();await page.locator('#inspect').click();await sleep(page);await page.screenshot({path:'docs/play-overhaul/screenshots/babylon-inspect.png'});await page.keyboard.press('Escape');
  check(errors.length===0,'No browser exceptions: '+errors.join(', '));
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const phone=await context.newPage();await load(phone);
  check(await phone.evaluate(()=>tabletopLab.focused),'Touch device uses fixed Focused view');await phone.locator('#camera-toggle').tap();check(!await phone.locator('#tilt').isVisible(),'Mobile has no Tilt or view switch');await phone.locator('#camera-toggle').tap();
  const cdp=await context.newCDPSession(phone);let card=await snapshot(phone,'K526');const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y])=>({x,y,id:1}))});
  await touch('touchStart',[[card.screen.x,card.screen.y]]);await touch('touchMove',[[card.screen.x+35,card.screen.y]]);await sleep(phone);check((await snapshot(phone,'K526')).position.y>.4,'Touch drag lifts card');await touch('touchEnd',[]);await sleep(phone);check((await snapshot(phone,'K526')).position.x>card.position.x+.3,'Touch drag moves card');
  await phone.locator('#tap').tap();check((await snapshot(phone,'K526')).tapped,'Touch Tap button rotates card');await phone.locator('#inspect').tap();check(await phone.locator('#inspection').isVisible(),'Touch Inspect opens');await phone.locator('#close-inspection').tap();
  card=await snapshot(phone,'K526');await touch('touchStart',[[card.screen.x,card.screen.y]]);await phone.waitForTimeout(650);await touch('touchEnd',[]);check(await phone.locator('#inspection').isVisible(),'Long press inspects without tapping');await phone.locator('#close-inspection').tap();
  await phone.locator('#reset').tap();await sleep(phone);await phone.waitForFunction(()=>tabletopLab.snapshot().filter(c=>!c.hidden).every(c=>c.artReady),{timeout:90000});
  card=await snapshot(phone,'K526');await touch('touchStart',[[card.screen.x,card.screen.y]]);await touch('touchMove',[[card.screen.x+35,card.screen.y]]);await touch('touchCancel',[]);await sleep(phone);check(Math.abs((await snapshot(phone,'K526')).position.x-card.position.x)<.1,'Canceled touch restores the original position');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:600,id:1},{x:240,y:600,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:100,y:600,id:1},{x:270,y:600,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});check(Number(await phone.locator('#zoom').inputValue())>130,'Two-finger pinch zooms the camera');
  await phone.locator('#reset').tap();await sleep(phone);await phone.screenshot({path:'docs/play-overhaul/screenshots/babylon-mobile.png'});
  await phone.setViewportSize({width:844,height:390});await sleep(phone);check(await phone.evaluate(()=>tabletopLab.focused),'Touch landscape stays Focused');await phone.screenshot({path:'docs/play-overhaul/screenshots/babylon-mobile-landscape.png'});
  check((await fetch(base+'/../../AGENTS.md')).status===404,'Server never exposes repository files');check((await fetch(base+'/view',{method:'POST'})).status===405,'Server refuses all mutations');
  await phone.emulateMedia({reducedMotion:'reduce'});await phone.waitForFunction(()=>document.querySelector('#environment').paused);check(await phone.locator('#environment').evaluate(v=>v.paused),'Reduced motion pauses the video');
  const broken=await browser.newPage({viewport:{width:1440,height:1000}});const script=await readFile(new URL('./table.js',import.meta.url),'utf8');await broken.route('**/table.js',route=>route.fulfill({contentType:'text/javascript',body:script.replace('function moveCard(c,p){','function moveCard(c,p){return;')}));await load(broken);const mutation=await drag(broken,'K545',120);
  let rejected=false;try{assert.ok(mutation.after.position.x>mutation.before.position.x+.5,'movement assertion');}catch{rejected=true;}check(rejected,'Negative proof: disabling movement makes the position assertion fail');
  console.log(`PASS Babylon desktop + touch: ${count} checks; movement mutation rejected.`);
}finally{server.close();await close();}
