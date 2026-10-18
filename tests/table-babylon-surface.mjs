/* ROB-52 / ROB-100: real meshes share the DOM camera; graphics never owns room actions. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {openBrowser} from './uat/browser-runner.mjs';
const {browser,close}=await openBrowser({name:'table-babylon-surface',flag:'GEOMETRY_REQUIRED'});
const server=spawn(process.execPath,['tools/play-tabletop-preview.mjs'],{env:{...process.env,PREVIEW_PORT:'0',PREVIEW_HAND_SIZE:'9'},stdio:['ignore','pipe','pipe']});
try {
  const address=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('preview startup timed out')),15000);
    server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});
    server.once('error',reject);server.stderr.on('data',d=>reject(Error(String(d))));
  });
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'}),errors=[],acts=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framesent',f=>{try{const m=JSON.parse(f.payload);if(m.type==='act')acts.push(m);}catch{}}));
  const ready=()=>page.waitForFunction(()=>CrankStage.inspect()?.renderer==='babylon'&&!CrankStage.inspect().lost);
  const camera=async()=>{if(!await page.locator('[data-stage-style=table]').count())await page.locator('[data-action=board-camera]').click();};
  const view=async(name)=>{if(!await page.locator('.cm-stage-camera [data-action=board-view]').count())await page.locator('[data-action=board-camera]').click();await page.locator(`.cm-stage-camera [data-view=${name}]`).click();};
  await page.goto(`${address}/index.html#table?id=tablepreview01`);await ready();
  assert.equal(await page.locator('.cm-stage-canvas').evaluate(el=>el.tabIndex),-1,'the decorative renderer never enters the keyboard order');
  assert.equal(await page.evaluate(()=>CrankStage.inspect().design),'medieval-banded','Rob\'s default remains medieval-banded');
  await page.evaluate(()=>globalThis.__savedStageCanvas=document.querySelector('.cm-stage-canvas'));
  for(const [width,height] of [[1024,768],[1280,720],[1400,900]]) {
    await page.setViewportSize({width,height});await camera();
    for(const tilt of [0,40,60])for(const zoom of [60,100,120]) {
      await page.locator('[data-stage-camera=tilt]').fill(String(tilt));await page.locator('[data-stage-camera=zoom]').fill(String(zoom));
      const measured=await page.evaluate(({tilt,zoom})=>{
        const r=document.querySelector('.cm-stage-region').getBoundingClientRect(),g=CrankStage.geometry(r.width,r.height,{tilt,zoom,seats:3}),info=CrankStage.inspect();
        return {info,expected:[g.front,...g.rear].map(r=>r.quad)};
      },{tilt,zoom});
      assert.equal(measured.info.projected.length,4);
      for(let i=0;i<4;i++)for(let j=0;j<8;j++)assert.ok(Math.abs(measured.info.projected[i][j]-measured.expected[i][j])<.15,`${width}/${tilt}/${zoom}: actual mesh corner ${i}/${j} meets DOM projection`);
    }
  }
  await page.setViewportSize({width:1280,height:720});await camera();
  await page.locator('[data-stage-camera=tilt]').fill('40');await page.locator('[data-stage-camera=zoom]').fill('100');
  const designs=await page.locator('[data-stage-style=table] option').evaluateAll(es=>es.map(e=>e.value));
  assert.equal(designs.length,7);
  for(const design of designs) {
    await page.locator('[data-stage-style=table]').selectOption(design);await ready();
    const info=await page.evaluate(()=>CrankStage.inspect());
    assert.equal(info.design,design,'Camera selects the real mesh design');
    for(const part of ['top','side','leg'])assert.ok(info.parts.some(p=>p.part===part&&p.vertices>=24),`${design} has a physical ${part}`);
    if(design==='glass-future')assert.ok(info.parts.some(p=>p.part==='top'&&p.alpha<1),'glass stays translucent');
    if(design==='medieval-banded')assert.ok(info.parts.filter(p=>p.part==='band').length>=4,'oak carries four iron straps');
    const hits=await page.evaluate(()=>{
      const engine=BABYLON.Engine.Instances.at(-1),scene=engine.scenes[0],parts=new Set();
      for(let x=10;x<engine.getRenderWidth();x+=30)for(let y=engine.getRenderHeight()*.55;y<engine.getRenderHeight();y+=10){const hit=scene.pick(x,y,m=>!!m.metadata?.part);if(hit?.pickedMesh)parts.add(hit.pickedMesh.metadata.part);}
      return [...parts];
    });
    assert.ok(hits.some(p=>['side','leg','edge','band'].includes(p)),`${design}: screen rays see more than a flat top`);
    const obstructed=await page.evaluate(()=>{
      const engine=BABYLON.Engine.Instances.at(-1),scene=engine.scenes[0],canvas=document.querySelector('.cm-stage-canvas'),ratio=engine.getRenderWidth()/canvas.clientWidth,misses=[];
      CrankStage.inspect().projected.forEach((q,i)=>{for(const u of [.03,.5,.97])for(const v of [.03,.5,.97]){
        const x=((q[0]*(1-u)+q[2]*u)*(1-v)+(q[6]*(1-u)+q[4]*u)*v)*ratio,y=((q[1]*(1-u)+q[3]*u)*(1-v)+(q[7]*(1-u)+q[5]*u)*v)*ratio;
        const mesh=scene.pick(x,y,m=>!!m.metadata?.part||m.name.startsWith('mat '))?.pickedMesh;
        if(mesh?.name!==`mat ${i}`&&mesh?.name!==`mat art ${i}`)misses.push({i,u,v,hit:mesh?.name});
      }});return misses;
    });
    assert.deepEqual(obstructed,[],`${design}: table rails and rivets never cover a mat`);
  }
  await page.locator('[data-stage-style=table]').selectOption('medieval-banded');await ready();
  await page.locator('[data-stage-style=background]').selectOption('forest');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(150);
  const forest=await page.locator('.cm-stage-atmosphere').screenshot();await page.waitForTimeout(220);
  assert.notDeepEqual(await page.locator('.cm-stage-atmosphere').screenshot(),forest,'Forest retains its peripheral motion');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);
  const stillForest=await page.locator('.cm-stage-atmosphere').screenshot();await page.waitForTimeout(220);
  assert.deepEqual(await page.locator('.cm-stage-atmosphere').screenshot(),stillForest,'reduced motion stills the decorative canvas');
  await page.locator('[data-stage-style=background]').selectOption('clouds');
  assert.notDeepEqual(await page.locator('.cm-stage-atmosphere').screenshot(),stillForest,'Cloud sea retains its own artwork');
  await page.locator('[data-stage-style=background]').selectOption('volcano');
  assert.equal(await page.locator('.cm-stage-atmosphere').count(),0,'Volcano uses its existing video');
  await page.locator('[data-action=board-camera]').click();
  await screenshot(page,'rob-52-babylon-1280x720',[['H01','.cm-stage-top'],['TB01','.cm-stage-canvas'],['T05','.cm-stage-front'],['T08','.cm-stage-front [data-zone=lands]'],['T11','.cm-stage-hand']]);
  const resources=await page.evaluate(()=>CrankStage.inspect());
  for(let i=0;i<3;i++){await view('table');assert.equal(await page.locator('.cm-stage-canvas').count(),0);await view('full');await ready();}
  assert.equal(await page.evaluate(()=>document.querySelector('.cm-stage-canvas')===globalThis.__savedStageCanvas),true,'one context survives visits');
  const after=await page.evaluate(()=>CrankStage.inspect());
  assert.equal(await page.evaluate(()=>BABYLON.Engine.Instances.at(-1).scenes.length),1,'leaving Full disposes its previous scene');
  for(const key of ['meshes','materials','textures'])assert.equal(after[key],resources[key],`${key} do not accumulate across visits`);
  await camera();await page.locator('[data-stage-style=table]').selectOption('glass-future');await page.reload();await ready();
  assert.equal(await page.evaluate(()=>CrankStage.inspect().design),'glass-future','the actual design survives reload');
  // Exercise the native context extension, not a synthetic event with an intact GPU context.
  assert.equal(await page.evaluate(()=>{const c=document.querySelector('.cm-stage-canvas'),gl=c.getContext('webgl2')||c.getContext('webgl');globalThis.__loss=gl.getExtension('WEBGL_lose_context');if(!__loss)return false;__loss.loseContext();return true;}),true);
  await page.locator('.cm-stage-region[data-renderer=fallback]').waitFor();
  assert.ok(await page.locator('.cm-stage-error').innerText(),'graphics failure is readable');
  const cards=page.locator('.cm-stage-front .cm-bcard');assert.ok(await cards.count()>0);await cards.first().focus();
  assert.equal(await cards.first().evaluate(el=>el===document.activeElement),true,'card keyboard controls survive graphics loss');
  await screenshot(page,'rob-52-context-fallback',[['H01','.cm-stage-top'],['T05','.cm-stage-front']]);
  await page.evaluate(()=>__loss.restoreContext());await ready();
  await page.waitForFunction(()=>!document.querySelector('.cm-stage-error').textContent);
  assert.equal(await page.locator('.cm-stage-canvas').isVisible(),true,'context restoration shows the surface');
  await page.setViewportSize({width:390,height:844});await page.locator('#cm-board[data-phone=portrait]').waitFor();
  assert.equal(await page.locator('.cm-stage-canvas').count(),0,'this slice preserves the DOM phone board');
  await screenshot(page,'rob-52-phone-baseline',[['P01','#cm-board']]);
  assert.deepEqual(acts,[],'renderer and camera changes never submit game actions');assert.deepEqual(errors,[]);
  const failed=await browser.newPage({viewport:{width:1280,height:720}});
  await failed.route('**/vendor/babylon.min.js*',r=>r.abort());await failed.goto(`${address}/index.html#table?id=tablepreview01`);
  await failed.locator('.cm-stage-region[data-renderer=fallback]').waitFor();
  assert.ok(await failed.locator('.cm-stage-front .cm-bcard').count()>0,'failed engine download leaves readable cards');
  await failed.unroute('**/vendor/babylon.min.js*');
  await failed.locator('[data-action=board-camera]').click();await failed.locator('[data-view=table]').click();
  await failed.locator('[data-action=board-camera]').click();await failed.locator('[data-view=full]').click();
  await failed.waitForFunction(()=>CrankStage.inspect()?.renderer==='babylon');await failed.close();
  const missingArt=await browser.newPage({viewport:{width:1280,height:720}});
  await missingArt.route('**/assets/playmats/*',r=>r.abort());await missingArt.goto(`${address}/index.html#table?id=tablepreview01`);
  await missingArt.waitForFunction(()=>CrankStage.inspect()?.renderer==='babylon');await missingArt.waitForTimeout(500);
  const fallbackPixel=await missingArt.evaluate(()=>{
    const source=document.querySelector('.cm-stage-canvas'),copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;
    const ctx=copy.getContext('2d');ctx.drawImage(source,0,0);const q=CrankStage.inspect().projected[0],ratio=source.width/source.clientWidth;
    return [...ctx.getImageData(Math.round((q[0]+q[2]+q[4]+q[6])/4*ratio),Math.round((q[1]+q[3]+q[5]+q[7])/4*ratio),1,1).data];
  });
  assert.ok(fallbackPixel[1]>fallbackPixel[0]&&fallbackPixel[1]>45,`failed art keeps a readable green mat: ${fallbackPixel}`);await missingArt.close();
  console.log('table-babylon-surface: 27 camera combinations, seven physical designs, persistence, resource lifecycle, real context loss/recovery, failed load/retry, DOM phone and no game actions passed');
} finally {server.kill();await close();}
async function screenshot(page,name,ids) {
  if(process.env.PLAY_SCREENSHOTS!=='1')return;
  mkdirSync('docs/play-overhaul/screenshots',{recursive:true});await page.waitForTimeout(500);
  await page.evaluate(ids=>{for(const [id,sel] of ids){const r=document.querySelector(sel).getBoundingClientRect(),b=document.createElement('b');b.dataset.proofId=id;b.textContent=id;b.style.cssText=`position:fixed;left:${Math.max(0,r.x)}px;top:${Math.max(0,r.y)}px;z-index:99999;background:white;color:black;font:12px monospace;pointer-events:none`;document.body.append(b);}},ids);
  await page.screenshot({path:`docs/play-overhaul/screenshots/${name}.png`});await page.locator('[data-proof-id]').evaluateAll(es=>es.forEach(e=>e.remove()));
}
