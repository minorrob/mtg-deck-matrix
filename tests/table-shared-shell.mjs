/* ROB-99: exercise the shared desktop shell through the recorded public fixture.
 * A missing Camera, duplicate header, unreachable control, or a drawer that moves the stage or hides a board must fail.
 * Table and Focus are the 3D view's HUD on a flat stage (Rob, 2026-10-28): the drawers are the TOP LAYER over a stage that is the window's whole
 * width, so opening either (Actions included) moves nothing, and the flat views keep their boards clear of where the drawers lie. Phone is recorded as the unchanged baseline for ROB-18.
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
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
    assert.ok(await page.locator('[data-action=board-camera]').evaluate(el=>el===document.activeElement),'switching view returns keyboard focus to Camera');
    assert.equal(await page.locator('#cm-board > header').count(),1,'one shared header');
    assert.equal(await page.locator('.cm-stage-top [data-action=board-profile]').count(),1,'one profile control');
    await page.locator('[data-action=board-camera]').click();
    assert.equal(await page.locator('.cm-stage-camera [data-action=board-view]').count(),3,'Camera offers every desktop view');
    assert.equal(await page.locator('[data-stage-camera=tilt]').count(),view==='full'?1:0,'Tilt only in Full');
    if(width===1280) await screenshot(page,view+'-camera');
    await page.locator('[data-action=board-camera]').click();
    if(await page.locator('.cm-stage-rail').isVisible()) await page.locator('.cm-stage-left').click();
    const surface=page.locator('.cm-stage-region');
    const slots=()=>page.evaluate(()=>[...document.querySelectorAll('.cm-stage-slot,.cm-stage-rear')].map(e=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];}));
    const before=await surface.boundingBox(),slotsBefore=await slots();assert.ok(before.width>0&&before.height>0,'board has visible area');
    assert.equal(slotsBefore.length,view==='full'?3:4,'a flat view draws its four boards; 3D its three other seats as tiles over the canvas');
    for(const [control,drawer] of [['.cm-stage-left','.cm-stage-rail'],['.cm-stage-right','.cm-stage-side']]) {
      await page.locator(control).click();
      assert.ok(await page.locator(drawer).isVisible(),'drawer opens');
      /* Actions used to reserve space beside the board (the stage and the boards moved over for it). Drawers are the top layer now: the stage, the hand and
         every board stay exactly where they were, the drawer lies over them (a pointer at its edge finds it), and a flat view's boards sit clear of it. */
      assert.deepEqual(await surface.boundingBox(),before,drawer==='.cm-stage-rail'?'Actions lies over the stage and does not move it':'optional right drawer keeps board geometry');
      assert.deepEqual(await slots(),slotsBefore,'a drawer moves no board');
      /* (a point near the drawer's top: the recorded preview's own control bar floats over the foot of the right drawer) */
      const lies=await page.evaluate(d=>{const r=document.querySelector(d).getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+30);return {over:!!hit?.closest(d),left:r.left,right:r.right};},drawer);
      assert.ok(lies.over,'the drawer is the top layer: it is what a pointer finds over the stage');
      if(view!=='full'&&drawer==='.cm-stage-rail') assert.ok(slotsBefore.every(b=>b[0]>=lies.right-1),`Actions: the boards keep clear of it (${JSON.stringify(slotsBefore.map(b=>b[0]))} from ${lies.right})`);
      if(width===1280) await screenshot(page,`${view}-${drawer==='.cm-stage-side'?'right':'left'}-drawer`);
      if(drawer==='.cm-stage-side' && view!=='full') {
        const grip=page.locator('.cm-stage-side [data-drag=panelw]'),old=await page.locator(drawer).boundingBox();
        /* Rob's Oct 18 report (Codex's fix, ROB-98's PR): the drawer's gray resize line sat 17px inside its edge, over its
           modules. It is drawn on the drawer's edge. */
        const edge=await grip.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el,'::before');return r.x+parseFloat(s.left)+(s.transform==='none'?0:new DOMMatrix(s.transform).m41);});
        assert.ok(Math.abs(edge-old.x)<=2,`the resize line follows the drawer edge, not its modules (${edge} vs ${old.x})`);
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
      const settings=action==='board-tools';
      if(settings){
        await page.locator('[data-action=board-table-menu]').click();
        await page.locator('#cm-table-menu [data-action=board-tools]').click();
      }else{
        await page.locator('[data-action=board-table-menu]').click();
        await page.locator(`#cm-table-menu [data-action=${action}]`).click();
      }
      /* r4 places Pages/History under Table and the game settings window under Camera.
         The shared account Settings action navigates to the app Settings page. */
      const menu=page.locator(settings?'#cm-dialog[open]':action==='board-menu'?'#cm-board-nav':'#cm-board-history');
      await menu.waitFor({state:'visible'});const box=await menu.boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=width+1,'utility pop-ups fit without sideways scrolling');
      if(settings) assert.ok(box.y>=0&&box.y+box.height<=721,'the Settings window fits the browser top to bottom');
      await page.keyboard.press('Escape');
      await menu.waitFor({state:'hidden'});
      if(settings&&await page.locator('[data-action=board-camera]').getAttribute('aria-expanded')==='true')await page.locator('[data-action=board-camera]').click();
    }
    assert.equal(await page.locator('#cm-board').evaluate(el=>el.scrollLeft),0,'opening utilities never scrolls the shell sideways');
    if(view==='focus') {
      await page.locator('[data-action=board-profile]').click();
      await page.locator('#cm-user-menu:popover-open').waitFor();
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('[data-action=board-profile]').evaluate(el=>el===document.activeElement),'account Escape restores the actual board invoker');
      /* The Focus row's "Show hand" drawer is gone (the hand is the stage's fan in every view). Its guarantee, that Escape closes what the hand opened and
         returns the keyboard to where it was, is proved on the fan: Enter on a card opens its menu, Escape closes it and the card has the focus again. */
      const first=page.locator('.cm-stage-fan .cm-bcard').first();
      await first.focus();const label=await first.getAttribute('aria-label');
      await page.keyboard.press('Enter');
      await page.locator('#cm-card-menu').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#cm-card-menu').waitFor({state:'detached',timeout:2000});
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),label,'hand Escape closes the card menu and returns focus to the card');
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
  if(page){mkdirSync('work',{recursive:true});await page.screenshot({path:'work/shared-shell-failure.png'});console.error({url:page.url(),board:await page.locator('#cm-board').count()?await page.locator('#cm-board').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),html:el.innerHTML.slice(0,500)})):null});}
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
