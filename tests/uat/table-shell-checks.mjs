import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';

export async function checkTableShell(page) {
  const camera = async () => {if (!await page.locator('[data-stage-camera="zoom"]').count()) await page.locator('[data-action="board-camera"]').click();};
  const slider = async (key, value) => page.locator(`[data-stage-camera="${key}"]`).evaluate((el, n) => {el.value=String(n);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  const shot = async (name, labels) => {
    if (!process.env.UAT_SHOTS) return;
    await mkdir(process.env.UAT_SHOTS,{recursive:true});
    await page.evaluate(entries => {
      for(const [selector,id] of entries){const target=document.querySelector(selector);if(!target)continue;const r=target.getBoundingClientRect(),label=document.createElement('span');label.className='shell-test-id';label.textContent=id;label.style.cssText=`position:fixed;z-index:9999;pointer-events:none;left:${Math.max(2,r.left+3)}px;top:${Math.max(2,r.top+3)}px;background:#fff000;color:#101010;font:bold 12px system-ui;padding:2px 4px;border:1px solid black`;document.body.append(label);}
    },labels);
    await page.screenshot({path:path.join(process.env.UAT_SHOTS,name+'.png')});
    await page.locator('.shell-test-id').evaluateAll(els=>els.forEach(el=>el.remove()));
  };
  await page.setViewportSize({width:1400,height:900});
  for(const mode of ['table','focus','full']) {
    await camera();await page.locator(`.cm-stage-camera [data-view="${mode}"]`).click();
    await page.waitForFunction(m=>document.querySelector('#cm-board').dataset.view===m,mode);
    assert.equal(await page.locator('.cm-stage-top').count(),1,'one shared header');
    assert.equal(await page.locator('.cm-stage-top [data-action="board-profile"]').count(),1,'profile remains in the header');
    assert.equal(await page.locator('[data-action="board-view"]').count(),3,'all desktop views switch through Camera');
    assert.equal(await page.locator('[data-stage-camera="tilt"]').count(),mode==='full'?1:0,'Tilt only in Full');
    assert.equal(await page.locator('.cm-board-pane').count(),0,'no competing legacy seat sidebar');
    if (!await page.locator('.cm-stage-side.is-open').count()) await page.locator('[data-action="board-stage-side"]').last().click();
    const checkEdges=async()=>{
      const boxes=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {pane:r('.cm-stage-side').toJSON(),camera:r('.cm-stage-camera').toJSON(),handle:r('.cm-stage-right').toJSON(),height:innerHeight};});
      assert.ok(boxes.camera.right<=boxes.pane.left+1,'Camera follows drawer');
      assert.ok(Math.abs(boxes.handle.right-boxes.pane.left)<1,'collapse tab stays on outside edge');
      assert.ok(Math.abs(boxes.pane.bottom-boxes.height)<1,'drawer extends to screen bottom');
    };
    await checkEdges();
    if(mode!=='full') {
      const resize=page.locator('[data-drag="drawer-right"]'), before=(await page.locator('.cm-stage-side').boundingBox()).width;
      await resize.focus();await resize.press('ArrowLeft');
      assert.ok((await page.locator('.cm-stage-side').boundingBox()).width>before,'keyboard widens drawer');
      await checkEdges();
      await resize.press('ArrowRight');
      const select=mode==='table'?'.cm-board-slot .cm-mat':'.cm-board-stage .cm-mat';
      await slider('zoom',60);const small=(await page.locator(select).first().boundingBox()).width;
      await slider('zoom',120);const large=(await page.locator(select).first().boundingBox()).width;
      assert.ok(large>small*1.5,`${mode} zoom visibly grows the mat`);
      await slider('zoom',100);
      const card=page.locator(`${select} .cm-bcard`).first();
      await slider('cards',70);const smallCard=(await card.boundingBox()).width;
      await slider('cards',150);assert.ok((await card.boundingBox()).width>smallCard*1.5,`${mode} card slider grows cards`);
      await slider('cards',100);
      await shot('shell-'+mode,[['.cm-stage-top','H01'],['.cm-stage-camera','C01'],['.cm-stage-side','D02'],[select,'B01']]);
    } else assert.equal(await page.locator('[data-drag^="drawer-"]').count(),0,'Full retains fixed drawer widths');
  }
  for(const size of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);await page.waitForFunction(()=>!!document.querySelector('#cm-board').dataset.phone);
    await camera();
    assert.equal(await page.locator('#cm-board').getAttribute('data-view'),'focus');
    assert.equal(await page.locator('[data-action="board-view"],[data-stage-camera="tilt"]').count(),0,'mobile has no alternate views or Tilt');
    const native=await page.locator('#cm-board').evaluate(el=>({transform:getComputedStyle(el).transform,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}));
    assert.equal(native.transform,'none','portrait never rotates the whole interface');
    if(size.width===390){
      const broken=await page.addStyleTag({content:'.cm-board[data-phone="portrait"]{transform:rotate(90deg)!important}'});
      const rotated=await page.locator('#cm-board').evaluate(el=>getComputedStyle(el).transform);
      assert.throws(()=>assert.equal(rotated,'none'),'the native-orientation check catches a rotated board');
      await broken.evaluate(el=>el.remove());
    }
    assert.equal(Math.round(native.w),size.width);assert.equal(Math.round(native.h),size.height);
    await slider('zoom',60);const small=(await page.locator('.cm-phone-battlefield>.cm-mat').boundingBox()).width;
    await slider('zoom',120);assert.ok((await page.locator('.cm-phone-battlefield>.cm-mat').boundingBox()).width>small*1.5);
    await slider('zoom',100);await page.locator('[data-action="board-camera"]').click();
    await shot('shell-mobile-'+(size.width===390?'portrait':'landscape'),[['.cm-phone-rail','M01'],['.cm-stage-camera','C01'],['.cm-phone-seats','M02'],['.cm-phone-battlefield','B01'],['.cm-phone-ask','A01']]);
  }
}
