/* ROB-97: Camera owns Board cards; no size control crosses Table's life dial. Table is the 3D view's HUD on a flat stage (Rob, 2026-10-28): Camera's
 * Cards slider ([data-stage-camera=cards], the old row bar's Board cards control) sizes the cards, the hand's size is Camera's Hand cards (✋) slider,
 * and the page itself scrolls (the Table viewport has no scroll of its own). */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {openBrowser} from './uat/browser-runner.mjs';
const {browser,close}=await openBrowser({name:'table-camera-layout',flag:'GEOMETRY_REQUIRED'});
const server=spawn(process.execPath,['tools/play-tabletop-preview.mjs'],{env:{...process.env,PREVIEW_PORT:'0',PREVIEW_HAND_SIZE:'9'},stdio:['ignore','pipe','pipe']});
const shots='docs/play-overhaul/screenshots';
try {
  const address=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('preview startup timed out')),15000);
    server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});
    server.once('error',reject);server.stderr.on('data',d=>reject(Error(String(d))));
  });
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${address}/index.html#table?id=tablepreview01`);
  await page.locator('[data-action=board-camera]').click();
  await page.locator('[data-action=board-view][data-view=table]').click();
  for(const [width,height] of [[1024,768],[1280,720],[1400,900]]) {
    await page.setViewportSize({width,height});
    await page.locator('[data-action=board-camera]').click();
    assert.equal(await page.locator('[data-stage-camera=cards]').count(),1,'Board cards exists only in Camera, never in the row bar');
    assert.equal(await page.locator('[data-board-scale=board]').count(),0,'the row bar\'s old Board cards control is gone');
    const slider=page.locator('.cm-stage-camera [data-stage-camera=cards]');
    assert.ok(await slider.isVisible(),'the Camera slider is reachable');
    const card=page.locator('.cm-stage-slot .cm-board-lands .cm-bcard').first();
    const size=()=>card.evaluate(el=>el.getBoundingClientRect().width);
    const before=await size();
    await slider.fill('80');
    assert.ok(await size()<before-1,'Camera changes battlefield card size continuously, preserving the EX16 readable-caption offset');
    await slider.focus();await page.keyboard.press('ArrowRight');
    assert.equal(await slider.inputValue(),'81','keyboard adjusts the same continuous slider');
    assert.equal(await page.evaluate(()=>localStorage.getItem('cm-stage-card-size-v2')),'81','the adjustment is saved on this device');
    // The recorded preview intentionally starts in Full on every load; choose Table again.
    await page.reload();await page.locator('[data-action=board-camera]').click();
    await page.locator('[data-action=board-view][data-view=table]').click();
    await page.locator('[data-action=board-camera]').click();
    assert.equal(await slider.inputValue(),'81','Camera retains the saved size after reload');
    await slider.fill('100');
    const measures=await page.evaluate(()=>{
      const dial=document.querySelector('.cm-board-pie').getBoundingClientRect();
      return [...document.querySelectorAll('.cm-stage-camera label')].map(el=>{
        const r=el.getBoundingClientRect();return {label:el.innerText,visible:r.width>0&&r.height>0,fits:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight,overlap:r.x<dial.right&&r.right>dial.x&&r.y<dial.bottom&&r.bottom>dial.y};
      });
    });
    assert.ok(measures.length>=2&&measures.every(x=>x.visible&&x.fits&&!x.overlap),'all sliders fit and their boxes stay clear of the life dial');
    await screenshot(page,`rob-97-${width}x${height}`,[['T10','.cm-stage-camera'],['M02','.cm-board-pie']]);
    await page.locator('[data-action=board-camera]').click();
    assert.equal(await page.locator('[data-stage-camera=cards]').count(),0,'closed Camera leaves no duplicate board slider');
    /* The hand's size is Camera's Hand cards (✋) slider now, not the old row bar's (Table has no row bar). */
    await page.locator('[data-action=board-camera]').click();
    const hand=page.locator('.cm-stage-camera [data-board-scale=hand]');
    await hand.fill(await hand.getAttribute('max'));
    await page.locator('[data-action=board-camera]').click();
    /* The Table viewport has no scroll of its own any more: the page scrolls. */
    assert.equal(await page.locator('#cm-board').evaluate(el=>getComputedStyle(el).overflowY!=='auto'&&getComputedStyle(el).overflowY!=='scroll'),true,'Table has no scroller of its own');
    const scrolled=await page.evaluate(()=>{scrollTo(0,80);return document.scrollingElement.scrollTop;});
    assert.ok(scrolled>0,'the page makes a real scrolling Table fixture');
    assert.ok(await page.locator('[data-action=board-camera]').evaluate(el=>{
      const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.y>=0&&r.bottom<=innerHeight&&(hit===el||el.contains(hit));
    }),'Camera stays reachable at the top of the window while the page scrolls');
    await page.locator('[data-action=board-camera]').click();
    assert.ok(await slider.isVisible(),'a scrolled Table can open its sizing controls');
    await screenshot(page,`rob-97-${width}x${height}-scrolled`,[['T10','.cm-stage-camera'],['M02','.cm-board-pie']]);
    await page.locator('[data-action=board-camera]').click();
    await page.locator('[data-action=board-camera]').click();
    await hand.fill('100');await page.locator('[data-action=board-camera]').click();await page.evaluate(()=>scrollTo(0,0));
  }
  /* Focus has the same Cards slider in Camera. At 1920x1080 the focused board has room, and the slider sizes its cards continuously there (below
     about 1600 wide the board's room, --bc-cap, is under the 35px readable-caption minimum and the slider is inert in Focus too: see the Table check). */
  await page.setViewportSize({width:1920,height:1080});
  await page.locator('[data-action=board-camera]').click();
  await page.locator('[data-action=board-view][data-view=focus]').click();
  await page.locator('[data-action=board-camera]').click();
  {
    const slider=page.locator('.cm-stage-camera [data-stage-camera=cards]');
    await slider.fill('100');
    const card=page.locator('.cm-stage-slot.cm-stage-big .cm-board-lands .cm-bcard').first();
    const size=()=>card.evaluate(el=>el.getBoundingClientRect().width);
    const before=await size();
    await slider.fill('80');
    assert.ok(await size()<before-1,`Focus: Camera's Cards slider changes battlefield card size continuously (${before} to ${await size()})`);
    await slider.fill('100');
  }
  await page.locator('[data-action=board-camera]').click();
  await page.setViewportSize({width:390,height:844});
  await page.locator('#cm-board[data-phone=portrait]').waitFor();
  await screenshot(page,'rob-97-phone-baseline',[['P01','#cm-board']]);
  assert.deepEqual(errors,[],'no browser errors');
  console.log('table-camera-layout: Camera ownership, card sizing (Table and Focus), keyboard, reload, dial separation at 1024/1280/1400 and phone baseline passed');
} finally {server.kill();await close();}
async function screenshot(page,name,ids) {
  if(process.env.PLAY_SCREENSHOTS!=='1')return;
  mkdirSync(shots,{recursive:true});
  await page.evaluate(ids=>{for(const [id,sel] of ids){const r=document.querySelector(sel).getBoundingClientRect(),b=document.createElement('b');b.dataset.proofId=id;b.textContent=id;b.style.cssText=`position:fixed;left:${Math.max(0,r.x)}px;top:${Math.max(0,r.y)}px;z-index:99999;background:white;color:black;font:12px monospace;pointer-events:none`;document.body.append(b);}},ids);
  await page.screenshot({path:`${shots}/${name}.png`});
  await page.locator('[data-proof-id]').evaluateAll(els=>els.forEach(el=>el.remove()));
}
