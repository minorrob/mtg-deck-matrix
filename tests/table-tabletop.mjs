/* Tabletop geometry and browser interaction; see tests/uat/browser-runner.mjs. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const scope = {console};
vm.runInNewContext(readFileSync(new URL("../crankmagic-stage.js", import.meta.url), "utf8"), scope);
for (const width of [1024, 1280, 1400]) for (const tilt of [0, 18, 35]) for (const zoom of [85, 110]) {
  const g = scope.CrankStage.geometry(width, 550, {tilt, zoom, seats: 3});
  assert.equal(g.rear.length, 3);
  assert.ok(g.front.y > g.rear[0].y + g.rear[0].height, "the viewed mat stays in front of the back row");
  for (const r of [...g.rear, g.front]) {
    const corners = [[0,0],[r.width,0],[r.width,r.height],[0,r.height]];
    corners.forEach(([x,y],i) => {
      const m=r.matrix, denominator=m[3]*x+m[7]*y+m[15];
      const px=(m[0]*x+m[4]*y+m[12])/denominator, py=(m[1]*x+m[5]*y+m[13])/denominator;
      assert.ok(Math.abs(px-r.quad[i*2])<.001 && Math.abs(py-r.quad[i*2+1])<.001, "DOM corners and canvas mat corners share exactly the same projection");
      assert.ok(px>=0 && px<=width && py>=0 && py<=550, "projected mat stays inside the viewport");
    });
    const far=r.quad[2]-r.quad[0], near=r.quad[4]-r.quad[6];
    assert.ok(tilt===0 ? Math.abs(far-near)<.001 : far<near, "tilt changes the shared perspective, with a flat zero endpoint");
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= 550, "interactive mats fit at every camera endpoint");
  }
}
console.log("table-tabletop: geometry passed");

// The browser proof runs against the same cloud board, on isolated recorded room views.
import {spawn} from "node:child_process";
import {openBrowser} from "./uat/browser-runner.mjs";
const {browser, close} = await openBrowser({name:"table-tabletop", flag:"GEOMETRY_REQUIRED"});
const server = spawn(process.execPath, ["tools/play-tabletop-preview.mjs"], {env:{...process.env,PREVIEW_PORT:"0"}, stdio:["ignore","pipe","pipe"]});
try {
  const address = await Promise.race([
    new Promise((resolve,reject)=>{server.stdout.on("data",d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`);});server.once("error",reject);server.stderr.on("data",d=>reject(new Error(String(d))));}),
    new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error("preview startup timed out")),10000);t.unref();})
  ]);
  const page = await browser.newPage({viewport:{width:1400,height:900}}), errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`${address}/index.html#table?id=tablepreview01`);
  await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
  assert.equal(await page.locator('.cm-stage-rear').count(),3,"all other seats sit across the back");
  await page.evaluate(()=>{globalThis.__canvas = document.querySelector('.cm-stage-canvas');});
  const before = await page.locator('.cm-stage-region').boundingBox();
  await page.getByRole('button',{name:'Toggle table panel',exact:true}).click();
  assert.deepEqual(await page.locator('.cm-stage-region').boundingBox(),before,"the panel overlays rather than resizing the board");
  await page.getByRole('button',{name:'Close table panel',exact:true}).click();
  await page.locator('.cm-stage-seat-label').first().click();
  assert.match(await page.locator('.cm-stage-hand .cm-board-hand').getAttribute('aria-label'),/Friend's hand, 7 cards/);
  assert.equal(await page.locator('.cm-stage-hand .is-back').count(),7);
  assert.equal(await page.locator('.cm-stage-hand [data-card]').count(),0,"no opponent card identity is introduced by rotation");
  await page.getByRole('button',{name:'My board',exact:true}).click();
  assert.equal(await page.locator('.cm-stage-hand .cm-board-hand').getAttribute('aria-label'),'Your hand');
  assert.equal(await page.evaluate(()=>globalThis.__canvas===document.querySelector('.cm-stage-canvas')),true,"the same graphics context survives redraw and rotation");
  await page.getByRole('button',{name:'Camera',exact:false}).click();
  for(const width of [1400,1280,1024]) {
    await page.setViewportSize({width,height:768});
    for(const [tilt,zoom] of [[0,85],[35,110]]) {
      await page.getByRole('slider',{name:'Table tilt',exact:true}).fill(String(tilt));
      await page.getByRole('slider',{name:'Table zoom',exact:true}).fill(String(zoom));
      const boxes = await page.locator('.cm-stage-front, .cm-stage-rear, .cm-stage-hand').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
      for(const r of boxes) assert.ok(r.x>=0 && r.y>=0 && r.right<=width+1 && r.bottom<=769,`interactive region fits at ${width}, tilt ${tilt}, zoom ${zoom}`);
      assert.equal(await page.locator('canvas.cm-stage-canvas').count(),1);
      const alignment = await page.evaluate(() => {
        const host=document.querySelector('.cm-stage-region'), r=host.getBoundingClientRect();
        const tilt=Number(document.querySelector('[data-stage-camera="tilt"]').value), zoom=Number(document.querySelector('[data-stage-camera="zoom"]').value);
        const geometry=CrankStage.geometry(r.width,r.height,{tilt,zoom,seats:3});
        const regions=[document.querySelector('.cm-stage-front'),...document.querySelectorAll('.cm-stage-rear')];
        const matrices=regions.map((el,i)=> {
          const actual=new DOMMatrix(getComputedStyle(el).transform).toFloat64Array();
          return Array.from(actual).every((v,j)=>Math.abs(v-[geometry.front,...geometry.rear][i].matrix[j])<.001);
        });
        const front=regions[0], card=front.querySelector('.cm-bcard:not(.is-tapped)'), inverse=new DOMMatrix(getComputedStyle(front).transform).inverse();
        const corners=[[0,0],[card.offsetWidth,0],[card.offsetWidth,card.offsetHeight],[0,card.offsetHeight]].map(([x,y])=>{
          const probe=document.createElement('i');probe.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none`;
          card.append(probe);const box=probe.getBoundingClientRect();probe.remove();
          const p=new DOMPoint(box.x-r.x,box.y-r.y).matrixTransform(inverse);return {x:p.x/p.w,y:p.y/p.w};
        });
        // Undoing the mat's camera must recover an ordinary rectangular card.
        const rectangular=Math.abs(corners[0].y-corners[1].y)<.1 && Math.abs(corners[2].y-corners[3].y)<.1 && Math.abs(corners[0].x-corners[3].x)<.1 && Math.abs(corners[1].x-corners[2].x)<.1;
        return {matrices,rectangular,hand:getComputedStyle(document.querySelector('.cm-stage-hand')).transform};
      });
      assert.ok(alignment.matrices.every(Boolean), 'all four DOM mats use the same projection as their canvas surfaces');
      assert.equal(alignment.rectangular,true,'cards lie on the same perspective plane as their mat');
      assert.equal(alignment.hand,'none','the hand remains upright outside the tabletop camera');
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(300);
  const still = await page.locator('canvas.cm-stage-canvas').screenshot();
  await page.waitForTimeout(200);
  assert.deepEqual(await page.locator('canvas.cm-stage-canvas').screenshot(),still,'enabling reduced motion leaves the ground static');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('#cm-board')?.dataset.phone);
  assert.equal(await page.locator('canvas.cm-stage-canvas').count(),0,"phone uses the existing DOM board");
  await page.setViewportSize({width:1400,height:900});
  await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
  assert.equal(await page.locator('canvas.cm-stage-canvas').count(),1,"returning to desktop mounts one surface");
  assert.deepEqual(errors,[],"no uncaught browser errors");
  console.log('table-tabletop: browser passed (four seats, private backs, persistent canvas, camera bounds, overlays, phone fallback)');
} finally {server.kill();await close();}
