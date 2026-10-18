/* ROB-99: exercise the shared desktop shell through the recorded public fixture.
 * A missing Camera, duplicate header, unreachable control, or a drawer that moves
 * its board must fail. Phone is recorded as the unchanged baseline for ROB-18.
 * GEOMETRY_REQUIRED=1 makes missing Chromium a failure; no live account is used.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {openBrowser} from './uat/browser-runner.mjs';
const {browser,close}=await openBrowser({name:'table-shared-shell',flag:'GEOMETRY_REQUIRED'});
const server=spawn(process.execPath,['tools/play-tabletop-preview.mjs'],{env:{...process.env,PREVIEW_PORT:'0',PREVIEW_HAND_SIZE:'9'},stdio:['ignore','pipe','pipe']});
let page;
try {
  const address=await new Promise((resolve,reject)=>{
    server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`);});
    server.once('error',reject);server.stderr.on('data',d=>reject(Error(String(d))));
  });
  page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${address}/index.html#table?id=tablepreview01`);
  await page.locator('.cm-stage-region').waitFor();
  for(const width of [1280,1400,1024]) {
  await page.setViewportSize({width,height:720});
  for(const view of ['full','table','focus']) {
    if(!await page.locator('.cm-stage-camera [data-action=board-view]').count()) await page.locator('[data-action=board-camera]').click();
    await page.locator(`.cm-stage-camera [data-action=board-view][data-view=${view}]`).focus();
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('[data-action=board-camera]').evaluate(el=>el===document.activeElement),'switching view returns keyboard focus to Camera');
    assert.equal(await page.locator('#cm-board > header').count(),1,'one shared header');
    assert.equal(await page.locator('.cm-stage-top [data-action=board-profile]').count(),1,'one profile control');
    await page.locator('[data-action=board-camera]').click();
    assert.equal(await page.locator('.cm-stage-camera [data-action=board-view]').count(),3,'Camera offers every desktop view');
    assert.equal(await page.locator('[data-stage-camera=tilt]').count(),view==='full'?1:0,'Tilt only in Full');
    if(width===1280) await screenshot(page,view+'-camera');
    await page.locator('[data-action=board-camera]').click();
    const surface=page.locator(view==='full'?'.cm-stage-region':view==='table'?'.cm-board-table':'.cm-board-stage');
    const before=await surface.boundingBox();assert.ok(before.width>0&&before.height>0,'board has visible area');
    for(const [control,drawer] of [['.cm-stage-left','.cm-stage-rail'],['.cm-stage-right','.cm-stage-side']]) {
      await page.locator(control).click();
      assert.ok(await page.locator(drawer).isVisible(),'drawer opens');
      assert.deepEqual(await surface.boundingBox(),before,'drawers never change the board geometry');
      if(width===1280) await screenshot(page,`${view}-${drawer==='.cm-stage-side'?'right':'left'}-drawer`);
      if(drawer==='.cm-stage-side' && view!=='full') {
        const grip=page.locator('.cm-stage-side [data-drag=panelw]'),old=await page.locator(drawer).boundingBox();
        await grip.focus();await page.keyboard.press('ArrowLeft');
        const resized=await page.locator(drawer).boundingBox();
        assert.ok(resized.width>old.width,'the right drawer retains keyboard resizing');
        assert.deepEqual(await surface.boundingBox(),before,'resizing the drawer leaves its board alone');
        assert.equal(Number(await page.evaluate(()=>localStorage.getItem('cm-board-panel-w'))),Number(await grip.getAttribute('aria-valuenow')),'drawer width is remembered');
        await page.keyboard.press('ArrowRight');
        if(width===1280) {
          const edge=await grip.boundingBox();
          await page.mouse.move(edge.x+edge.width/2,edge.y+40);await page.mouse.down();
          await page.mouse.move(edge.x+edge.width/2-40,edge.y+40,{steps:4});await page.mouse.up();
          assert.ok((await page.locator(drawer).boundingBox()).width>=old.width+39,'the exposed drawer edge drags with the pointer');
          assert.deepEqual(await surface.boundingBox(),before,'dragging the drawer leaves its board alone');
          await grip.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
        }
      }
      await page.locator(control).click();
      await page.locator(drawer).waitFor({state:'hidden'});
      assert.equal(await page.locator(drawer).getAttribute('inert'),'','closed drawer is inert');
    }
    const header=await page.locator('.cm-stage-top').boundingBox();assert.ok(header.x>=0&&header.x+header.width<=width+1,'header fits');
    for(const action of ['board-menu','board-history','board-tools']) {
      await page.locator('[data-action=board-profile]').click();
      await page.locator(`.cm-profile-menu [data-action=${action}]`).click();
      const menu=page.locator('.cm-profile-menu .cm-board-menu'),box=await menu.boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=width+1,'profile pop-ups fit without sideways scrolling');
      await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    }
    assert.equal(await page.locator('#cm-board').evaluate(el=>el.scrollLeft),0,'opening utilities never scrolls the shell sideways');
    if(view==='focus') {
      await page.locator('[data-action=board-profile]').click();
      await page.locator('.cm-board-showhand').focus();await page.keyboard.press('Enter');
      await page.locator('.cm-hand-show').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.cm-hand-show').waitFor({state:'detached',timeout:2000});
      assert.ok(await page.locator('.cm-board-showhand').evaluate(el=>el===document.activeElement),'hand closes before the profile behind it and returns focus');
      await page.keyboard.press('Escape');
    }
    await screenshot(page,view+(width===1280?'':`-${width}`));
  }
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#cm-board[data-phone=portrait]').waitFor();
  assert.equal(await page.locator('#cm-board').getAttribute('data-shell'),null,'desktop shell does not leak into phone');
  await screenshot(page,'phone-baseline');
  assert.deepEqual(errors,[],'no page errors');
  console.log('table-shared-shell: shared headers, Camera, Tilt, overlay drawers and phone boundary passed');
} catch(error) {
  if(page){mkdirSync('work',{recursive:true});await page.screenshot({path:'work/shared-shell-failure.png'});console.error(await page.locator('#cm-board').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),html:el.innerHTML.slice(0,500)})));}
  throw error;
} finally {server.kill();await close();}
async function screenshot(page,name) {
  if(!process.env.UAT_SHOTS)return;
  mkdirSync(process.env.UAT_SHOTS,{recursive:true});
  await page.evaluate(()=>{
    for(const [id,selector] of [['H01','.cm-stage-top'],['T10','.cm-stage-camera'],['T12','.cm-stage-left'],['T13','.cm-stage-right'],['T20','.cm-profile-avatar'],['P01','.cm-phone-center']]) {
      const el=document.querySelector(selector);if(!el)continue;const r=el.getBoundingClientRect(),badge=document.createElement('b');
      badge.dataset.proofId=id;badge.textContent=id;badge.style.cssText=`position:fixed;left:${Math.max(0,r.x)}px;top:${Math.max(0,r.y)}px;background:#fff;color:#000;font:10px monospace;z-index:99999;pointer-events:none`;document.body.append(badge);
    }
  });
  await page.screenshot({path:`${process.env.UAT_SHOTS}/rob-99-${name}.png`});
  await page.locator('[data-proof-id]').evaluateAll(es=>es.forEach(e=>e.remove()));
}
