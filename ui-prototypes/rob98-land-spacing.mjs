import {mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {openBrowser} from '../tests/uat/browser-runner.mjs';
const {browser,close}=await openBrowser({name:'rob98-preview',flag:'GEOMETRY_REQUIRED'});
const server=spawn(process.execPath,['tools/play-tabletop-preview.mjs'],{env:{...process.env,PREVIEW_PORT:'0',PREVIEW_HAND_SIZE:'9'},stdio:['ignore','pipe','pipe']});
mkdirSync('work/rob98',{recursive:true});
const results=[];
try {
  const address=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Preview server did not start')),30000);
    server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timeout);resolve(`http://127.0.0.1:${m[1]}`);}});
    server.once('error',reject);
  });
  const page=await browser.newPage({viewport:{width:1400,height:900},reducedMotion:'reduce'});
  await page.goto(`${address}/index.html#table?id=tablepreview01`);
  await page.locator('.cm-stage-front .cm-bcard').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[1400,900],[1024,768],[1280,720]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(200);
    for(const padding of [0,48,72,96]) {
      const style=padding ? await page.addStyleTag({content:`.cm-stage-front>.cm-mat{padding-bottom:${padding}px}`}) : null;
      await page.mouse.move(3,65);await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('#cm-board').scrollTop=0;});await page.waitForTimeout(100);
      const measure=()=>page.evaluate(()=>[...document.querySelectorAll('.cm-stage-front .cm-board-lands .cm-bcard')].map(card=>{
        const r=card.getBoundingClientRect();
        const hits=[.1,.25,.45].map(f=>{const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height*f);return {fraction:f,clear:hit===card||card.contains(hit),cover:hit?.closest('.cm-bcard')?.getAttribute('aria-label')||hit?.className};});
        return {name:card.getAttribute('aria-label'),rect:r.toJSON(),hits};
      }));
      const rest=await measure(),hovers=[];
      for(const hand of await page.locator('.cm-stage-fan-slot .cm-bcard').all()) {
        await page.mouse.move(3,65);
        const point=await hand.evaluate(el=>{const r=el.getBoundingClientRect();for(const fy of [.15,.3,.5,.7])for(const fx of [.15,.3,.5,.7]){const x=r.x+r.width*fx,y=r.y+r.height*fy;if(y>=innerHeight-5)continue;const hit=document.elementFromPoint(x,y);if(hit===el||el.contains(hit))return{x,y};}return null;});
        if(!point)throw Error('No visible hover point for '+await hand.getAttribute('aria-label'));
        await page.mouse.move(point.x,point.y);await page.waitForTimeout(50);
        hovers.push({hand:await hand.getAttribute('aria-label'),lands:await measure()});
      }
      const failures=rest.flatMap(x=>x.hits.filter(h=>!h.clear)).length+hovers.flatMap(x=>x.lands.flatMap(l=>l.hits.filter(h=>!h.clear))).length;
      results.push({width,height,padding,failures,rest,hovers});
      await page.mouse.move(3,65);
      await page.evaluate(()=>{
        for(const [id,sel] of [['T08','.cm-stage-front .cm-board-lands'],['T11','.cm-stage-fan']]){
          const r=document.querySelector(sel).getBoundingClientRect(),badge=document.createElement('b');badge.dataset.proofId=id;badge.textContent=id;badge.style.cssText=`position:fixed;left:${r.x}px;top:${r.y}px;z-index:99999;background:white;color:black;font:12px monospace;pointer-events:none`;document.body.append(badge);
        }
      });
      await page.screenshot({path:`work/rob98/${width}x${height}-padding-${padding}.png`});
      await page.locator('[data-proof-id]').evaluateAll(es=>es.forEach(e=>e.remove()));
      await style?.evaluate(el=>el.remove());
      console.log(JSON.stringify({width,height,padding,lands:rest.length,failures}));
    }
  }
  writeFileSync('work/rob98/results.json',JSON.stringify(results,null,2));
  assert.ok(results.filter(r=>r.padding===48).every(r=>r.failures===0),'48px candidate clears every sampled upper-half point at rest and through every hovered hand card');
  assert.ok(results.some(r=>r.padding===0&&r.width===1280&&r.failures>0),'removing the candidate spacing reproduces the obstruction at 1280x720');
} finally {server.kill();await close();}
