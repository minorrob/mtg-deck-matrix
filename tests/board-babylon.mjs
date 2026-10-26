/* Live stage adapter: real rendered projection, bounded resources, failure recovery and lounge entry. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {openBrowser} from './uat/browser-runner.mjs';
const {browser,close}=await openBrowser({name:'board-babylon',flag:'GEOMETRY_REQUIRED'});
const server=spawn(process.execPath,['tools/play-tabletop-preview.mjs'],{env:{...process.env,PREVIEW_PORT:'0',PREVIEW_FRAME:'0'},stdio:['ignore','pipe','pipe']});
let checks=0;
const ok=(test,message)=>{assert.ok(test,message);checks++;};
try{
  const base=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=String(d).match(/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`);});server.stderr.on('data',d=>reject(Error(String(d))));server.on('error',reject);});
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  await page.addInitScript(()=>localStorage.setItem('cm-stage-rotation','75'));
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/index.html#table?id=tablepreview01`);
  await page.locator('[data-engine=babylon]').waitFor();
  const align=async(label)=>{
    const d=await page.evaluate(()=>CrankStage.diagnostics());
    ok(['top','side','leg'].every(part=>d.parts.includes(part)),`${label}: real table meshes, including sides and base`);
    ok(Math.max(...d.quad.map((n,i)=>Math.abs(n-d.domQuad[i])))<.03,`${label}: Babylon surface and DOM hit areas agree to .03px: ${JSON.stringify(d)}`);
    return d;
  };
  await align('opening hands, before a phase exists');
  ok((await page.locator('#cm-notice').textContent()||'').indexOf('startsWith')<0,'opening hands do not report a phase error');
  // Return to the established populated-board fixture for the interaction checks below.
  for(let n=0;n<13;n++)await page.request.post(`${base}/preview/frame`,{data:'1'});
  await page.reload();await page.locator('[data-engine=babylon]').waitFor();
  await align('initial');
  ok(await page.locator('.cm-stage-canvas').getAttribute('tabindex')==='-1','decorative canvas is not an extra keyboard stop');
  const hand=await page.locator('.cm-stage-fan-slot .cm-bcard').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,h:innerHeight,w:innerWidth,card:getComputedStyle(el).width,tray:el.closest('.cm-stage-hand').style.cssText};}));
  ok(hand.every(r=>r.top>=0&&r.bottom<=r.h&&r.left>=0&&r.right<=r.w),`the default hand includes every card bottom edge: ${JSON.stringify(hand)}`);
  const ground=await page.evaluate(()=>{
    const r=document.querySelector('.cm-stage-region').getBoundingClientRect();
    for(let y=r.top+20;y<r.bottom-20;y+=20)for(let x=r.left+5;x<r.right-100;x+=20)
      if(document.elementFromPoint(x,y)?.matches('.cm-stage-canvas, .cm-stage-region'))return {x,y};
  });
  ok(ground,'empty ground can be reached without touching a card');
  const beforeDrag=await page.evaluate(()=>CrankStage.diagnostics());
  await page.mouse.move(ground.x,ground.y);await page.mouse.down();await page.mouse.move(ground.x+80,ground.y,{steps:5});await page.mouse.up();
  const afterHorizontal=await page.evaluate(()=>CrankStage.diagnostics());
  ok(afterHorizontal.quad.every((v,i)=>Math.abs(v-beforeDrag.quad[i])<.03),'horizontal ground dragging does not rotate the table');
  await page.mouse.move(ground.x,ground.y);await page.mouse.down();await page.mouse.move(ground.x,ground.y+20,{steps:5});await page.mouse.up();
  ok(Number(await page.evaluate(()=>localStorage.getItem('cm-board-tilt-v3')))===2,'vertical ground dragging adjusts and saves tilt (10 to 2 from the floor: the camera 40 to 44 degrees)');
  await align('ground drag');
  ok(await page.locator('.cm-stage-canvas').getAttribute('tabindex')==='-1','pointer movement does not reintroduce a canvas tab stop');
  await page.getByRole('button',{name:'Camera',exact:false}).click();
  const slide=async(name,value)=>{await page.getByRole('slider',{name,exact:true}).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);};
  ok(await page.getByRole('slider',{name:'Table rotation',exact:true}).count()===0,'camera has tilt without a rotation control');
  for(const tilt of [0,20,40,60]){await slide('Table tilt',tilt);await align(`tilt ${tilt}`);}
  await slide('Table tilt',0);
  const flat=await page.evaluate(()=>CrankStage.diagnostics());
  ok(Math.abs(flat.quad[1]-flat.quad[3])<.03&&Math.abs(flat.quad[5]-flat.quad[7])<.03,'a stored rotation from an older session cannot cant the table');
  await slide('Table tilt',10);
  const initial=await align('reset');
  for(let n=0;n<4;n++)for(const design of ['obsidian-glass','medieval-banded']){
    await page.getByLabel('Table design',{exact:true}).selectOption(design);
    const d=await align(design);
    ok(d.materials<=initial.materials+3&&d.textures<=initial.textures+2,'changing designs disposes obsolete materials and textures');
  }
  const shots=process.env.UAT_SHOTS;
  if(shots){mkdirSync(shots,{recursive:true});
    await page.getByRole('button',{name:'Camera',exact:false}).click();
    await page.screenshot({path:path.join(shots,'babylon-oak-1280.png')});
    await page.getByRole('button',{name:'Camera',exact:false}).click();
    await page.getByLabel('Table design',{exact:true}).selectOption('obsidian-glass');
    await page.getByRole('button',{name:'Camera',exact:false}).click();
    await page.screenshot({path:path.join(shots,'babylon-obsidian-1280.png')});
  }
  // The camera moved by hand keeps the one projection (tests/board-3d-camera.mjs): the wheel's zoom toward the pointer, a
  // held right button's head look, and back.
  const stageBox=await page.locator('.cm-stage-region').boundingBox();
  await page.mouse.move(stageBox.x+stageBox.width*.35,stageBox.y+stageBox.height*.6);await page.mouse.wheel(0,-200);await page.waitForTimeout(300);
  ok((await align('wheel zoom')).pan.x!==0,'the wheel zooms toward the pointer');
  await page.mouse.down({button:'right'});await page.waitForFunction(()=>CrankStage.diagnostics().look?.t===1,null,{polling:'raf',timeout:5000});
  await align('head look, held');
  await page.mouse.up({button:'right'});await page.waitForFunction(()=>CrankStage.diagnostics().look===null,null,{polling:'raf',timeout:5000});
  await align('head look, let go');
  // Your side of the table lengthened (tests/board-hand-table.mjs): the table built at rest stretched while it is dragged,
  // then built at its new length, the DOM plane on it both ways; and back.
  const lengthen=(reach,live)=>page.evaluate(([reach,live])=>{CrankStage.layout(document.querySelector('.cm-stage-region').getBoundingClientRect(),{reach,live});},[reach,live]);
  await lengthen(.2,true);
  const dragged=await align('your side lengthened, mid-drag');
  await lengthen(.2,false);
  const lengthened=await align('your side lengthened');
  ok(dragged.length.scale>1&&lengthened.length.scale===1&&lengthened.length.reach>0&&lengthened.length.reach===dragged.length.reach,`stretched while dragged, built at its length after (${JSON.stringify([dragged.length,lengthened.length])})`);
  await lengthen(0,false);
  ok((await align('your side back')).length.reach===0,'and back to the length it always had');
  ok(await page.evaluate(()=>document.querySelector('.cm-stage-canvas').getAttribute('tabindex'))==='-1','the camera by hand leaves no canvas tab stop');
  ok(await page.evaluate(()=>{const canvas=document.querySelector('.cm-stage-canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');globalThis.__contextLoss=gl.getExtension('WEBGL_lose_context');return !!__contextLoss;}),'browser can exercise real GPU context loss');
  await page.evaluate(()=>__contextLoss.loseContext());
  await page.locator('[data-renderer=fallback]').waitFor();
  ok(await page.locator('.cm-stage-front .cm-bcard').count()>0,'context loss leaves readable card controls');
  await page.evaluate(()=>__contextLoss.restoreContext());
  await page.locator('[data-engine=babylon][data-renderer=webgl]').waitFor();await align('restored');
  ok((await page.locator('.cm-stage-error').innerText())==='','restoring graphics clears the old failure message');
  for(let n=0;n<3;n++){
    await page.goto(`${base}/index.html#game`);await page.locator('#cm-play-home').waitFor();
    ok(await page.evaluate(()=>BABYLON.Engine.Instances.length===0),'leaving the board disposes its engine and listeners');
    ok(await page.locator('#cm-table-new').count()===0,'Play opens the lounge, not the New table form');
    await page.getByRole('button',{name:'Resume your table',exact:true}).click();await page.locator('[data-engine=babylon]').waitFor();
    await align('re-entry');
  }
  await page.goto(`${base}/index.html#game`);await page.locator('#cm-play-home').waitFor();
  await page.locator('#cm-play-invite').fill('https://evil.example/api/join/tablepreview01/token');
  await page.getByRole('button',{name:'Open invitation',exact:true}).click();
  ok((await page.locator('#cm-play-join-error').innerText()).includes('complete CrankMagic invitation'),'invalid invitation stays in lounge with recovery instruction');
  await page.locator('#cm-play-invite').fill('');
  for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'lounge fits viewport');
    if(shots)await page.screenshot({path:path.join(shots,`lounge-${viewport.width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'New table',exact:true}).click();await page.locator('#cm-table-new').waitFor();
  ok(true,'New table remains an explicit action');
  const failed=await browser.newPage({viewport:{width:1280,height:720}});
  await failed.route('**/vendor/babylon.js*',route=>route.abort());
  await failed.goto(`${base}/index.html#table?id=tablepreview01`);await failed.locator('[data-renderer=fallback]').waitFor();
  ok(await failed.locator('.cm-stage-front .cm-bcard').count()>0,'blocked renderer download preserves cards');
  ok((await failed.locator('.cm-stage-error').innerText()).includes('decisions are still available'),'graphics error explains continued gameplay');
  ok(errors.length===0,`no uncaught runtime errors: ${errors.join('; ')}`);
  console.log(`board-babylon: ${checks} checks passed`);
}finally{server.kill();await close();}
