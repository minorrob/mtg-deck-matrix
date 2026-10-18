import {readFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {openBrowser} from '../../tests/uat/browser-runner.mjs';
const phoneTemplate=readFileSync(new URL('./phone-view.js',import.meta.url),'utf8');
const currentJS=readFileSync('crankmagic-board.js','utf8');
const start='  function phoneView() {',end='  /* THE COACH (the handoff';
assert.ok(currentJS.includes(start)&&currentJS.includes(end),'the production insertion boundaries are present');
let candidateJS=currentJS.slice(0,currentJS.indexOf(start))+phoneTemplate+currentJS.slice(currentJS.indexOf(end));
const handHint='Hover to read · click to choose · 1–${Math.min(9, n) || 1} keys · Space or ✕ to put it away · bright = castable now';
assert.ok(candidateJS.includes(handHint));
candidateJS=candidateJS.replace(handHint,'${phone() ? "Swipe to browse · tap a card to inspect · bright = playable now" : `'+handHint+'`}');
const candidateCSS=readFileSync('crankmagic-stage.css','utf8')+'\n'+readFileSync(new URL('./phone-layout.css',import.meta.url),'utf8');
assert.ok(candidateJS.includes('cm-phone-battlefield')&&candidateCSS.includes('height:100dvh'));
const {browser,close}=await openBrowser({name:'rob18-preview',flag:'GEOMETRY_REQUIRED'});
const server=spawn(process.execPath,['tools/play-tabletop-preview.mjs'],{env:{...process.env,PREVIEW_PORT:'0',PREVIEW_HAND_SIZE:'9'},stdio:['ignore','pipe','pipe']});
mkdirSync('work/rob18',{recursive:true});
try {
  const address=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`);});server.once('error',reject);});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[],sent=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framesent',event=>{try{sent.push(JSON.parse(event.payload));}catch{}}));
  await page.route('**/crankmagic-board.js?*',r=>r.fulfill({contentType:'text/javascript',body:candidateJS}));
  await page.route('**/crankmagic-stage.css?*',r=>r.fulfill({contentType:'text/css',body:candidateCSS}));
  await page.goto(`${address}/index.html#table?id=tablepreview01`);
  await page.locator('.cm-phone-battlefield').waitFor();
  for(const [width,height] of [[390,844],[844,390]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(150);
    const geometry=await page.locator('#cm-board').evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),transform:getComputedStyle(el).transform,view:el.dataset.view,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
    assert.equal(geometry.transform,'none');assert.equal(geometry.view,'focus');
    assert.equal(geometry.rect.width,width);assert.equal(geometry.rect.height,height);
    assert.equal(geometry.scrollWidth,geometry.clientWidth,'phone shell fits without sideways scrolling');
    await screenshot(`${width}x${height}`);
    await page.locator('[data-action=board-camera]').tap();
    assert.equal(await page.locator('[data-action=board-view], [data-stage-camera=tilt]').count(),0,'fixed Focus phone offers neither view switching nor Tilt');
    await screenshot(`${width}x${height}-camera`);
    await page.locator('[data-action=board-camera]').tap();
    await page.locator('[data-action=board-show-hand]').tap();
    const dialog=await page.locator('.cm-hand-show').boundingBox(),pill=await page.locator('.cm-phone-pill').boundingBox();
    assert.ok(dialog.y>=pill.y+pill.height,'the hand drawer leaves the turn controls visible');
    const closeButton=page.getByRole('button',{name:'Put the hand away'}),closeBox=await closeButton.boundingBox();
    assert.ok(closeBox.width>=44&&closeBox.height>=44,'the hand close control has a 44px touch target');
    await screenshot(`${width}x${height}-hand`);
    const fan=page.locator('.cm-hand-fan'),box=await fan.boundingBox(),cdp=await page.context().newCDPSession(page);
    const x=box.x+box.width*.8,y=box.y+Math.min(60,box.height/2);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let n=1;n<=6;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-box.width*.6*n/6,y}]});await page.waitForTimeout(35);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();
    assert.ok(await fan.evaluate(el=>el.scrollLeft)>0,'a native touch swipe browses the hand');
    assert.equal(await page.locator('.cm-hand-show.is-held').count(),0,'swiping does not select a card');
    await closeButton.tap();
    await page.locator('.cm-hand-show').waitFor({state:'detached'});
    console.log(JSON.stringify({width,height,geometry}));
  }
  await page.setViewportSize({width:1280,height:720});
  await page.locator('#cm-board[data-shell=shared]').waitFor();
  assert.equal(await page.locator('.cm-phone-battlefield').count(),0,'the phone prototype does not replace the desktop board');
  await screenshot('1280x720-desktop-baseline');
  assert.deepEqual(errors,[]);
  assert.ok(sent.every(frame=>frame.type!=='act'),'layout exploration never sends a game action');
  async function screenshot(name) {
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(500);
    await page.evaluate(()=>Promise.all([...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0;}).map(img=>img.decode().catch(()=>{}))));
    await page.evaluate(()=>{for(const [id,sel] of [['P01','.cm-phone-rail'],['P02','.cm-phone-pill'],['P03','.cm-phone-battlefield'],['P04','.cm-phone-seats'],['H01','.cm-stage-top'],['T10','.cm-stage-camera']]){const el=document.querySelector(sel);if(!el)continue;const r=el.getBoundingClientRect(),b=document.createElement('b');b.dataset.proofId=id;b.textContent=id;b.style.cssText=`position:fixed;left:${r.x}px;top:${r.y}px;z-index:99999;background:white;color:black;font:12px monospace;pointer-events:none`;document.body.append(b);}});
    await page.screenshot({path:`work/rob18/${name}.png`});
    await page.locator('[data-proof-id]').evaluateAll(els=>els.forEach(el=>el.remove()));
  }
} finally {server.kill();await close();}
