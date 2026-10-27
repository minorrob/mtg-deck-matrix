/* Tabletop geometry and browser interaction; see tests/uat/browser-runner.mjs. */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import vm from "node:vm";
const scope = {console};
vm.runInNewContext(readFileSync(new URL("../crankmagic-stage.js", import.meta.url), "utf8"), scope);
for (const width of [1024, 1280, 1400]) for (const tilt of [0, 40, 60]) for (const zoom of [60, 120]) {
  const g = scope.CrankStage.geometry(width, 550, {tilt, zoom, seats: 3});
  assert.equal(g.rear.length, 3);
  assert.ok(g.front.y > g.rear[0].y + g.rear[0].height, "the viewed mat stays in front of the back row");
  for (const r of [...g.rear, g.front]) {
    const corners = [[0,0],[r.width,0],[r.width,r.height],[0,r.height]];
    corners.forEach(([x,y],i) => {
      const m=r.matrix, denominator=m[3]*x+m[7]*y+m[15];
      const px=(m[0]*x+m[4]*y+m[12])/denominator, py=(m[1]*x+m[5]*y+m[13])/denominator;
      assert.ok(Math.abs(px-r.quad[i*2])<.001 && Math.abs(py-r.quad[i*2+1])<.001, "DOM corners and canvas mat corners share exactly the same projection");
      if (zoom === 60) assert.ok(px>=0 && px<=width && py>=0 && py<=550, "zoomed-out mats stay inside the viewport");
    });
    const far=r.quad[2]-r.quad[0], near=r.quad[4]-r.quad[6];
    assert.ok(tilt === 0 ? Math.abs(far-near)<.001 : near>far, "near edges grow naturally with the shared camera perspective");
    assert.ok(tilt === 0 ? Math.abs(r.matrix[5]-r.matrix[0])<.001 && r.matrix[7]===0 : r.matrix[7]<0, "zero is flat; tilted mats and cards use physical depth");
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= width && r.y + r.height <= 550, "interactive mats fit at every camera endpoint");
  }
}
assert.deepEqual(Array.from(scope.CrankStage.carousel(9,8)),[8,0,1,2,3,4,5]);
assert.deepEqual(Array.from(scope.CrankStage.carousel(9,-1)),[8,0,1,2,3,4,5]);
assert.equal(scope.CrankStage.carousel(0).length,0);
for (const tilt of [0, 10, 27, 40, 60]) {
  const a=scope.CrankStage.geometry(1400,750,{tilt,zoom:100}), b=scope.CrankStage.geometry(1400,750,{tilt:40,zoom:100});
  assert.equal(a.sx,b.sx,'tilt never compensates by shrinking the board width');
}
const normal=scope.CrankStage.geometry(1400,750,{tilt:40,zoom:100});
assert.ok(Math.abs(normal.sx-.82*1.1)<1e-10,'new 100% zoom equals the previous 110% scale');
assert.ok(Math.abs(scope.CrankStage.geometry(1400,750,{zoom:60}).sx/normal.sx-.6)<1e-10,'60% zoom is not clamped to the old minimum');
const enlarged=scope.CrankStage.geometry(1400,750,{tilt:40,zoom:120});
assert.ok(enlarged.quad[6]<0 && enlarged.quad[4]>1400,'120% zoom allows table edges outside the frame');
console.log("table-tabletop: rigid-plane geometry and wrapping hand passed");

// Exercise the production preference boundary without a game or network.
const boardSource=readFileSync(new URL('../crankmagic-board.js',import.meta.url),'utf8');
const preferenceCode=boardSource.slice(boardSource.indexOf('  let paneEditing ='),boardSource.indexOf('  const camera ='));
const prefs={preferences:{play:{overlay:37,sidePane:{version:2,owner:'another@example.com',left:['history'],right:['stack']}}}};
const prefScope={C:{state:prefs,signedInAs:()=> 'player@example.com',notice(){},async commit(command){prefs.preferences={...prefs.preferences,...command.values};}},draw(){}};
vm.createContext(prefScope);vm.runInContext(preferenceCode,prefScope);
const layout=()=>JSON.parse(JSON.stringify(vm.runInContext('paneLayout()',prefScope)));
assert.deepEqual(layout(),{left:['actions'],right:['stack','history','coach']},'another account gets the r4 default without inheriting the saved owner layout');
await vm.runInContext('savePaneModules({left:["history"],right:["stack","table"]})',prefScope);
assert.deepEqual(layout(),{left:['actions','history'],right:['stack','table']},'saving preserves drawer placement and ordering');
assert.equal(prefs.preferences.play.overlay,37,'saving modules does not replace unrelated Play settings');
prefs.preferences.play.sidePane.right.push('history','unknown');
assert.deepEqual(layout(),{left:['actions','history'],right:['stack','table']},'duplicate and unknown modules cannot create ambiguous controls');
console.log('table-tabletop: profile ownership, placement, order and preference preservation passed');
if(process.env.TABLETOP_PURE_ONLY==='1')process.exit(0);

// The browser proof runs against the same cloud board, on isolated recorded room views.
import {spawn} from "node:child_process";
import {openBrowser} from "./uat/browser-runner.mjs";
const {browser, close} = await openBrowser({name:"table-tabletop", flag:"GEOMETRY_REQUIRED"});
const server = spawn(process.execPath, ["tools/play-tabletop-preview.mjs"], {env:{...process.env,PREVIEW_PORT:"0",PREVIEW_HAND_SIZE:"24"}, stdio:["ignore","pipe","pipe"]});
try {
  const address = await Promise.race([
    new Promise((resolve,reject)=>{server.stdout.on("data",d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`);});server.once("error",reject);server.stderr.on("data",d=>reject(new Error(String(d))));}),
    new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error("preview startup timed out")),10000);t.unref();})
  ]);
  const page = await browser.newPage({viewport:{width:1400,height:900}}), errors=[];
  // Real account serialization and sync, with an isolated HTTP store instead of a live account.
  const libraries = new Map(); let version=0;
  async function accountRoutes(p,email='preview@example.com') {
    await p.route('**/api/me',r=>r.fulfill({json:{email}}));
    // Explicit enabled Coach fixture: no provider or live account request is made.
    await p.route('**/api/ai-coach',r=>r.fulfill({json:{open:true}}));
    await p.route('**/api/ai/coach',r=>r.fulfill({json:{answer:'Isolated recorded-view fixture.'}}));
    await p.route('**/api/library**',async r=>{
      const stored=libraries.get(email), req=r.request();
      if(req.method()==='PUT') {
        const upload=req.postDataJSON(), head={id:`test${++version}`,savedAt:new Date().toISOString(),device:'Browser proof',revision:upload.revision};
        libraries.set(email,{head,version:{...head,...upload}});return r.fulfill({json:{head}});
      }
      return r.fulfill({json:req.url().includes('/versions/')?{version:stored?.version}:{head:stored?.head||null}});
    });
  }
  await accountRoutes(page);
  const MODULE_IDS=['history','coach','counter','resources','mana','stack','inspect','table','recommended','chat'];
  const MODULE_TITLES=['History','AI Coach','Counter-Intel','Resources','Mana Pool','On the Stack','Card Preview','Table Vitals','Recommended Actions','Chat','Actions'];
  const openDrawerSettings=async(p=page)=>{
    if(!await p.locator('#cm-board .cm-stage-camera>div').count())await p.locator('#cm-board [data-action=board-camera]').first().click();
    await p.locator('#cm-board [data-action=board-tools]').click();
    await p.getByRole('button',{name:'Set Side Drawer Modules',exact:true}).click();
    await p.locator('#cm-drawer-settings').waitFor();
  };
  const setModules=async({left=[],right=[]})=>{
    await openDrawerSettings();
    for(const id of MODULE_IDS)await page.locator(`input[name="module-${id}"][value="${left.includes(id)?'left':right.includes(id)?'right':'none'}"]`).check();
    await page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  };
  page.on("pageerror",e=>errors.push(e.message));
  /* Rob's art mats, one to a seat, the viewed seat's in front: each seat's mat draws that seat's own picture, cropped to
     the mat (cover), never stretched, and at full strength, with nothing tinted over it (Rob, 2026-10-18). The preview
     seats his art by seat: falls-tree, cloud-wolf, sand-lion, ember-serpent. */
  const seatArt=['falls-tree','cloud-wolf','sand-lion','ember-serpent'];
  const matArt=()=>page.evaluate(()=>{
    // Background layers split at top-level commas; a layer over the picture is clear when every color in it has no alpha.
    const layers=s=>{const out=[];let depth=0,from=0;[...s].forEach((c,i)=>{if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&!depth){out.push(s.slice(from,i).trim());from=i+1;}});out.push(s.slice(from).trim());return out;};
    const clear=layer=>[...layer.matchAll(/(rgba?|color)\(([^()]*)\)/g)].every(([,fn,args])=>fn==='color'?/\/\s*0(\.0+)?\s*$/.test(args):fn==='rgba'&&Number(args.split(',')[3])===0);
    return [document.querySelector('.cm-stage-front'),...document.querySelectorAll('.cm-stage-rear')].map(el=>{
      const m=el.querySelector('.cm-mat[data-mat]'), style=getComputedStyle(m), images=layers(style.backgroundImage), at=images.findIndex(l=>/playmats\//.test(l));
      return {seat:Number(m.dataset.seat), you:m.classList.contains('is-you'), mat:m.dataset.mat, art:/playmats\/([a-z0-9-]+)\.webp/.exec(images[at]||'')?.[1]||null,
        size:at<0?null:layers(style.backgroundSize)[at], clear:at>=0 && images.slice(0,at).every(clear)};
    });
  });
  const ownArt=(seats,message)=>{
    for(const s of seats) {
      assert.equal(s.art,seatArt[s.seat],`${message}: seat ${s.seat}'s mat draws its own picture (${s.mat})`);
      assert.equal(s.size,'cover',`${message}: seat ${s.seat}'s picture is cropped to its mat, never stretched`);
      assert.ok(s.clear,`${message}: seat ${s.seat}'s picture is at full strength, with no wash over it`);
    }
  };
  await page.goto(`${address}/index.html#table?id=tablepreview01`);
  await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
  assert.equal(await page.locator('[data-action="board-3d"], [data-action="board-stage"]').count(),0,'Full screen has no 3D switch');
  if(await page.locator('.cm-stage-rail.is-open').count()) await page.locator('.cm-stage-left').click();
  const fanIndices=()=>page.locator('.cm-stage-fan-slot').evaluateAll(els=>els.map(el=>Number(el.dataset.handIndex)));
  await page.waitForFunction(()=>document.querySelectorAll('.cm-stage-fan-slot').length>=9);
  const shown=(await fanIndices()).length;
  assert.ok(shown>=9&&shown<24,'the wide responsive hand shows at least nine and this crowded fixture needs paging');
  assert.deepEqual(await fanIndices(),Array.from({length:shown},(_,i)=>i),'the fitted hand begins at its first own card');
  await page.getByRole('button',{name:'Previous hand card',exact:true}).click();
  assert.deepEqual(await fanIndices(),[23,...Array.from({length:shown-1},(_,i)=>i)],'previous wraps to the final own card at current fitted capacity');
  await page.getByRole('button',{name:'Next hand card',exact:true}).click();
  assert.deepEqual(await fanIndices(),Array.from({length:shown},(_,i)=>i),'next wraps back through the start');
  assert.equal(await page.locator('.cm-stage-rear').count(),3,"all other seats sit across the back");
  /* Rob's later direct instruction allows native hand/fan overlap over Lands and board at any zoom.
     Keep every physical land represented and hit-test 10%, 25% and 45% down each representative face:
     uncovered points must reach that land; actual hand cards/arrows may intercept, and are counted explicitly.
     Every hand card must still have a native reachable hover point. Other obstructions remain failures. */
  await page.emulateMedia({reducedMotion:'reduce'});
  const away=async()=>{await page.mouse.move(3,65);await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('#cm-board').scrollTop=0;});await page.waitForTimeout(100);};
  const landCoverage={sampled:0,uncovered:0,allowedHandOverlaps:0,cases:[]};
  const landPoints=()=>page.evaluate(()=>{
    const result={sampled:0,uncovered:0,allowedHandOverlaps:[],blocked:[]};
    for(const card of document.querySelectorAll('.cm-stage-front .cm-board-lands .cm-bcard')){
      const r=card.getBoundingClientRect();
      for(const fraction of [.1,.25,.45]){
        const x=r.x+r.width/2,y=r.y+r.height*fraction,hit=document.elementFromPoint(x,y);result.sampled++;
        if(hit===card||card.contains(hit)){result.uncovered++;continue;}
        const point={land:(card.getAttribute('aria-label')||'a land').split(/[,:]/)[0],fraction,x,y,cardRect:r.toJSON(),hitRect:hit?.getBoundingClientRect().toJSON()||null,hit:hit?.outerHTML.slice(0,280)||null};
        const hand=hit?.closest('.cm-stage-hand .cm-bcard, .cm-stage-hand .cm-stage-hand-arrow');
        if(hand)result.allowedHandOverlaps.push(point);else result.blocked.push(point);
      }
    }
    return result;
  });
  const assertLandAccess=async message=>{
    const result=await landPoints();
    if(result.blocked.length&&process.env.UAT_SHOTS){mkdirSync(process.env.UAT_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.UAT_SHOTS}/tabletop-land-access-failure.png`});}
    assert.deepEqual(result.blocked,[],message);
    assert.equal(result.sampled,result.uncovered+result.allowedHandOverlaps.length,'every sampled point is accounted for by an actual land hit or an allowed native hand overlap');
    landCoverage.sampled+=result.sampled;landCoverage.uncovered+=result.uncovered;landCoverage.allowedHandOverlaps+=result.allowedHandOverlaps.length;
    landCoverage.cases.push({state:message,sampled:result.sampled,uncovered:result.uncovered,allowedHandOverlaps:result.allowedHandOverlaps.length});
  };
  for(const [width,height] of [[1400,900],[1024,768],[1280,720]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(200);await away();
    const lands=await page.locator('.cm-stage-front .cm-board-lands .cm-bcard').evaluateAll(cards=>cards.flatMap(c=>(c.dataset.landMembers||c.dataset.card).split(',')).sort());
    assert.deepEqual(lands,['459','469','483','502','527'],`${width}x${height}: all five physical lands remain represented by singleton faces or canonical grouped members`);
    await assertLandAccess(`${width}x${height}: uncovered land points are reached at rest`);
    for(const hand of await page.locator('.cm-stage-fan-slot .cm-bcard').all()) {
      await away();
      const name=(await hand.getAttribute('aria-label')||'a hand card').split(/[,:]/)[0];
      const point=await hand.evaluate(el=>{const r=el.getBoundingClientRect();for(const fy of [.15,.3,.5,.7])for(const fx of [.15,.3,.5,.7]){const x=r.x+r.width*fx,y=r.y+r.height*fy;if(y>=innerHeight-5)continue;const hit=document.elementFromPoint(x,y);if(hit===el||el.contains(hit))return{x,y};}return null;});
      assert.ok(point,`${width}x${height}: ${name} in the fan has a point a pointer reaches`);
      await page.mouse.move(point.x,point.y);await page.waitForTimeout(50);
      await assertLandAccess(`${width}x${height}: with ${name} hovered, uncovered land points remain reached`);
    }
  }
  assert.ok(landCoverage.uncovered>0,'the matrix actually exercised uncovered land points rather than accepting only overlap');
  console.log('table-tabletop: land pointer coverage '+JSON.stringify(landCoverage));
  await away();await page.emulateMedia({reducedMotion:null});
  await page.setViewportSize({width:1400,height:900});await page.waitForTimeout(200);
  await page.evaluate(()=>{globalThis.__canvas = document.querySelector('.cm-stage-canvas');});
  const before = await page.locator('.cm-stage-region').boundingBox();
  await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  assert.deepEqual(await page.locator('.cm-stage-region').boundingBox(),before,"the panel overlays rather than resizing the board");
  const own=await matArt();
  assert.deepEqual(own.map(s=>s.seat).toSorted(),[0,1,2,3],"all four seats' mats are on the table");
  assert.deepEqual(own.map(s=>s.you),[true,false,false,false],"your own mat is in front");
  ownArt(own,"Full screen");
  /* A drawn mat (felt, forge, cavern, sea, night) keeps in Full screen the pattern it has in every other view (Rob,
     2026-10-17). Two more tables seat all five, the second beside art mats. */
  const drawnMats=['felt','forge','cavern','sea','night'];
  for(const mats of ['felt,forge,cavern,sea','night,falls-tree,sand-lion,cloud-wolf']) {
    const drawn=spawn(process.execPath,["tools/play-tabletop-preview.mjs"],{env:{...process.env,PREVIEW_PORT:"0",PREVIEW_MATS:mats},stdio:["ignore","pipe","pipe"]});
    try {
      const at=await Promise.race([
        new Promise((resolve,reject)=>{drawn.stdout.on("data",d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`);});drawn.once("error",reject);}),
        new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error("preview startup timed out")),10000);t.unref();})
      ]);
      const look=await browser.newPage({viewport:{width:1400,height:900}});look.on("pageerror",e=>errors.push(e.message));
      await look.goto(`${at}/index.html#table?id=tablepreview01`);await look.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
      // The pattern each mat has outside the tabletop: the same mat, drawn again beside the stage in the same board.
      const shown=await look.evaluate(()=>[document.querySelector('.cm-stage-front'),...document.querySelectorAll('.cm-stage-rear')].map(el=>{
        const m=el.querySelector('.cm-mat[data-mat]'), probe=document.createElement('section');
        probe.className=m.className;probe.dataset.mat=m.dataset.mat;document.getElementById('cm-board').append(probe);
        const own=getComputedStyle(probe).backgroundImage;probe.remove();
        return {mat:m.dataset.mat,image:getComputedStyle(m).backgroundImage,own};
      }));
      const drawnSeats=shown.filter(s=>drawnMats.includes(s.mat));
      assert.equal(drawnSeats.length,mats.split(',').filter(id=>drawnMats.includes(id)).length,`every drawn mat of ${mats} is seated`);
      for(const {mat,image,own:pattern} of drawnSeats) assert.ok(image!=='none' && image===pattern,`the drawn ${mat} mat shows its own pattern in Full screen, not a plain table (${image.slice(0,48)})`);
      await look.close();
    } finally {drawn.kill();}
  }
  // Full Camera now lives in the shared header. Drawers begin below the measured
  // header/actions row; their opening must preserve access, not move Camera sideways.
  const reachable=async(selector,label)=>{
    const result=await page.locator(selector).evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {inside:r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
        hits:[.2,.5,.8].map(f=>{const hit=document.elementFromPoint(r.left+r.width*f,r.top+r.height/2);return hit===el||el.contains(hit);})};
    });
    assert.ok(result.inside&&result.hits.every(Boolean),`${label} fits and takes the pointer at three points: ${JSON.stringify(result)}`);
  };
  for(const width of [1400,1024]) {
    await page.setViewportSize({width,height:800});
    for(const opened of [true,false]) {
      if(Boolean(await page.locator('.cm-stage-side.is-open').count())!==opened){
        if(await page.locator('.cm-stage-camera>div').count())await page.locator('[data-action=board-camera]').click();
        await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
      }
      for(const expanded of [false,true]) {
        if(Boolean(await page.locator('.cm-stage-camera>div').count())!==expanded)await page.locator('[data-action=board-camera]').click();
        await reachable('[data-action=board-camera]',`${width}: Camera with Stack ${opened?'open':'closed'} and popup ${expanded?'open':'closed'}`);
        if(opened) {
          const edges=await page.evaluate(()=>{
            const r=s=>document.querySelector(s).getBoundingClientRect();
            return {bottom:r('.cm-stage-side').bottom,top:r('.cm-stage-side').top,header:r('.cm-stage-top').bottom,actions:r('.cm-stage-actions').bottom};
          });
          assert.equal(Math.round(edges.bottom),800,'right pane reaches the bottom through the hand area');
          assert.ok(edges.top>=Math.max(edges.header,edges.actions),`right pane starts below the actual shared header and action row: ${JSON.stringify(edges)}`);
        }
        if(expanded) {
          const popup=await page.locator('.cm-stage-camera>div').boundingBox();
          assert.ok(popup.x>=0&&popup.y>=0&&popup.x+popup.width<=width&&popup.y+popup.height<=800,'Camera popup fits the viewport beside either drawer state');
          await page.locator('[data-action=board-camera-reset]').scrollIntoViewIfNeeded();
          await reachable('[data-action=board-camera-reset]','Camera Reset');
          await reachable('[data-stage-camera=tilt]','Camera Tilt');
          await page.locator('[data-action=board-tools]').scrollIntoViewIfNeeded();
          await reachable('[data-action=board-tools]','Play settings after native popup scrolling');
        } else {
          for(const button of await page.locator('.cm-stage-actions button:enabled').all()) {
            const action=await button.getAttribute('data-action');
            await reachable(`.cm-stage-actions [data-action="${action}"]`,`enabled ${action} with Stack ${opened?'open':'closed'}`);
          }
        }
      }
    }
    await page.locator('[data-action=board-camera]').click();
    await page.locator('[data-action=board-stage-rail]').first().click();
    const rail=await page.locator('.cm-stage-rail').boundingBox();
    assert.equal(Math.round(rail.y+rail.height),800,'left pane also reaches the bottom');
    await page.locator('[data-action=board-stage-rail]').first().click();
    await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  }
  await page.setViewportSize({width:1400,height:900});
  await page.waitForFunction(()=>globalThis.__preview?.signedInAs?.());
  await page.evaluate(async()=>{
    await __preview.commit({type:'createDeck',name:'Pane persistence fixture',deckId:'deck:pane-proof'},{renderView:false});
    await __preview.commit({type:'preferences',values:{play:{overlay:37,stepByStep:true}}},{renderView:false});
  });
  const moduleOrder=()=>page.locator('.cm-stage-side .cm-stage-module').evaluateAll(els=>els.map(el=>el.dataset.module));
  await setModules({right:['history','counter','stack','inspect','table']});
  if(!await page.locator('.cm-stage-side.is-open').count())await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  assert.deepEqual(await moduleOrder(),['stack','history','counter','inspect','table'],'Settings preserves existing module order and appends newly enabled modules');
  await page.getByRole('button',{name:'Remove Card Preview',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-module="inspect"]'));
  await page.getByRole('button',{name:'Remove Counter-Intel',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('[data-module="counter"]'));
  await page.getByRole('button',{name:'Move Table Vitals up',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.cm-stage-side .cm-stage-module')[1]?.dataset.module==='table');
  assert.deepEqual(await moduleOrder(),['stack','table','history']);
  // Current Settings explicitly promises native arrow controls, not an invisible drag handle.
  for(let i=0;i<2;i++){
    const up=page.getByRole('button',{name:'Move History up',exact:true});await up.focus();await up.press('Enter');
    await page.waitForFunction(n=>Array.from(document.querySelectorAll('.cm-stage-side .cm-stage-module')).findIndex(el=>el.dataset.module==='history')===n,1-i);
  }
  assert.deepEqual(await moduleOrder(),['history','stack','table'],'native keyboard order controls can bring History to the front');
  for(let i=0;i<2;i++) {
    await page.getByRole('button',{name:'Move History down',exact:true}).click();
    await page.waitForFunction(n=>Array.from(document.querySelectorAll('.cm-stage-side .cm-stage-module')).findIndex(el=>el.dataset.module==='history')===n,i+1);
  }
  assert.deepEqual(await moduleOrder(),['stack','table','history']);
  assert.equal(await page.evaluate(()=>__preview.state.preferences.play.overlay),37,'layout saves preserve other Play preferences');
  await page.evaluate(()=>__preview.actions['account-sync']());
  assert.ok(libraries.get('preview@example.com')?.version.body,'account sync sends the saved preferences in its actual backup');
  await page.reload();await page.locator('.cm-stage-canvas').waitFor();
  await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  assert.deepEqual(await moduleOrder(),['stack','table','history'],'layout survives reloading the game');
  const second=await browser.newPage({viewport:{width:1400,height:900}});await accountRoutes(second);
  await second.goto(`${address}/index.html#table?id=tablepreview01`);
  await second.waitForFunction(()=>globalThis.__preview?.state.preferences?.play?.sidePane?.right?.[0]==='stack');
  await second.locator('.cm-stage-canvas').waitFor();
  await second.locator('.cm-stage-right[data-action=board-stage-side]').click();
  assert.deepEqual(await second.locator('.cm-stage-side .cm-stage-module').evaluateAll(els=>els.map(el=>el.dataset.module)),['stack','table','history'],'a fresh browser restores the account layout through cloud sync');
  await second.close();
  // Another player using this browser must not inherit this account's pane.
  await accountRoutes(page,'other@example.com');await page.reload();await page.locator('.cm-stage-canvas').waitFor();
  await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  assert.deepEqual(await moduleOrder(),['stack','history','coach'],'a different profile gets the r4 default without another owner layout');
  await accountRoutes(page);await page.reload();await page.locator('.cm-stage-canvas').waitFor();
  await page.locator('[data-action=account-keep-cloud]').click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  await openDrawerSettings();
  for(const id of MODULE_IDS) await page.locator(`input[name="module-${id}"][value="${['table','inspect','stack','history','counter'].includes(id)?'right':'none'}"]`).check();
  await page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  assert.equal(await page.locator('.cm-module-add, [data-action=board-module-add], [data-action=board-module-reset]').count(),0,'drawer configuration uses Settings without taking module space');
  assert.equal(await page.locator('.cm-stage-rail [data-action="board-tools"]').count(),0,'Settings is no longer in the left drawer');
  /* Skip to end stands over the table in Full screen (Rob's fullscreen notes, Oct 21), the profile at the strip's right. */
  const profile=await page.locator('#cm-board [data-action=board-profile]').first().boundingBox(), skip=await page.locator('.cm-stage-actions [data-action="board-skip"]').boundingBox();
  assert.ok(profile.x>skip.x && profile.y<58 && skip.y>=58,'profile control sits at the right of the top strip, Skip to end over the table below it');
  await openDrawerSettings();
  await page.getByRole('radio',{name:'History: Left',exact:true}).check();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.locator('.cm-stage-rail [data-module="history"]').count(),0,'Cancel does not change drawer placement');
  await openDrawerSettings();
  await page.getByRole('radio',{name:'History: Left',exact:true}).check();
  await page.getByRole('radio',{name:'Counter-Intel: None',exact:true}).check();
  await page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  if(!await page.locator('.cm-stage-rail.is-open').count()) await page.locator('[data-action=board-stage-rail]').first().click();
  assert.equal(await page.locator('.cm-stage-rail .cm-stage-module[data-module="history"]').count(),1,'radio moves History into the left drawer');
  assert.equal(await page.locator('.cm-stage-module[data-module="counter"]').count(),0,'None hides Counter-Intel');
  for(const open of [true,false]) {
    const edges=await page.evaluate((open)=>{
      const r=s=>document.querySelector(s).getBoundingClientRect();
      return {left:open?r('.cm-stage-rail').right:r('#cm-board').left,leftArrow:r('.cm-stage-left').left,right:open?r('.cm-stage-side').left:r('#cm-board').right,rightArrow:r('.cm-stage-right').right};
    },open);
    assert.ok(Math.abs(edges.left-edges.leftArrow)<1 && Math.abs(edges.right-edges.rightArrow)<1,`handles stay attached to drawer edges when ${open?'open':'collapsed'}`);
    if(open){await page.locator('[data-action=board-stage-rail]').first().click();await page.locator('.cm-stage-right[data-action=board-stage-side]').click();}
  }
  await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  await openDrawerSettings();
  for(const id of MODULE_IDS) await page.locator(`input[name="module-${id}"][value="${['table','inspect','stack','history','counter'].includes(id)?'right':'none'}"]`).check();
  await page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  await page.waitForFunction(()=>document.querySelectorAll('.cm-stage-rail .cm-stage-module').length===1);
  await page.evaluate(()=>{globalThis.__canvas=document.querySelector('.cm-stage-canvas');});
  await page.locator('#cm-stack-drawer > header [data-action=board-stage-side]').click();
  await page.locator('.cm-stage-seat-label').first().click();
  assert.match(await page.locator('.cm-stage-fan').getAttribute('aria-label'),/Friend's hand, 7 cards/);
  const turned=await matArt();
  assert.ok(turned[0].seat!==own[0].seat && !turned[0].you && turned.some(s=>s.you),"viewing another seat brings that seat's mat to the front, and yours goes to the back");
  ownArt(turned,"Viewing Friend");
  assert.equal(await page.locator('.cm-stage-hand .is-back').count(),7);
  assert.equal(await page.locator('.cm-stage-hand [data-card]').count(),0,"no opponent card identity is introduced by rotation");
  await page.locator('.cm-stage-region').getByRole('button',{name:'My board',exact:true}).click();
  assert.equal(await page.locator('.cm-stage-fan').getAttribute('aria-label'),'Your hand');
  assert.equal(await page.evaluate(()=>globalThis.__canvas===document.querySelector('.cm-stage-canvas')),true,"the same graphics context survives redraw and rotation");
  await page.getByRole('button',{name:'Camera',exact:false}).click();
  assert.equal(await page.getByRole('slider',{name:'Table tilt',exact:true}).inputValue(),'10');
  for(const name of ['Table tilt','Table zoom','Tabletop card size']) {
    const slider=page.getByRole('slider',{name,exact:true}), box=await slider.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width+20,box.y+box.height/2,{steps:12});await page.mouse.up();
    assert.equal(await slider.inputValue(),await slider.getAttribute('max'),`${name} reaches maximum with pointer dragging`);
    await page.mouse.move(box.x+box.width-5,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x-20,box.y+box.height/2,{steps:12});await page.mouse.up();
    assert.equal(await slider.inputValue(),await slider.getAttribute('min'),`${name} reaches minimum with pointer dragging`);
  }
  /* A backdrop other than the default (the list is whatever tools/stage-backdrops.mjs last wrote). */
  const background=page.getByRole('combobox',{name:'Background',exact:true}),other=await background.locator('option').nth(1).getAttribute('value');
  await background.selectOption(other);
  const designs=page.getByRole('combobox',{name:'Table design',exact:true});
  assert.equal(await designs.locator('option').count(),8,'the Camera offers Study and the seven preserved table designs');
  await designs.selectOption('stone-dais');
  assert.equal(await background.inputValue(),other,'background is independent of the table design');
  assert.equal(await page.evaluate(()=>localStorage.getItem('cm-stage-table')),'stone-dais','the table design is remembered on this device');
  assert.equal(await page.evaluate(()=>CrankStage.tableDesign('stone').id),'stone-dais','an older saved choice (stone) maps onto its design');
  assert.equal(await page.evaluate(()=>CrankStage.tableDesign(null).id),'study','no saved choice means the default walnut Study');
  for(const width of [1400,1280,1024]) {
    await page.setViewportSize({width,height:768});
    /* Straight down (90 from the floor) zoomed out, and the most slanted (0) zoomed in. */
    for(const [tilt,zoom] of [[90,60],[0,120]]) {
      await page.getByRole('slider',{name:'Tabletop card size',exact:true}).fill(tilt===90?'70':'150');
      await page.getByRole('slider',{name:'Table tilt',exact:true}).fill(String(tilt));
      await page.getByRole('slider',{name:'Table zoom',exact:true}).fill(String(zoom));
      const boxes = await page.locator('.cm-stage-front, .cm-stage-rear').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
      if(zoom===60) for(const r of boxes) assert.ok(r.x>=0 && r.y>=0 && r.right<=width+1 && r.bottom<=805,`interactive region fits at ${width}, tilt ${tilt}, zoom ${zoom}`);
      assert.equal(await page.locator('canvas.cm-stage-canvas').count(),1);
      const controls = await page.locator('.cm-stage-top button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};}));
      assert.ok(controls.every(r=>r.left>=0 && r.right<=width+1), 'top controls fit beside the turn ribbon');
      const fan = await page.locator('.cm-stage-fan .cm-bcard, .cm-stage-hand-arrow').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
      assert.ok(fan.every(r=>r.x>=0 && r.right<=width+1 && r.y>=0 && r.bottom<=805),'hand remains within screen width with only its bottoms clipping below the window');
      const alignment = await page.evaluate(() => {
        const host=document.querySelector('.cm-stage-region'), r=host.getBoundingClientRect();
        /* The slider is the angle to the floor; the camera's tilt from straight down is half of what it lacks of 90. */
        const tilt=(90-Number(document.querySelector('[data-stage-camera="tilt"]').value))/2, zoom=Number(document.querySelector('[data-stage-camera="zoom"]').value);
        const geometry=CrankStage.geometry(r.width,r.height,{tilt,zoom,seats:3});
        const regions=[document.querySelector('.cm-stage-front'),...document.querySelectorAll('.cm-stage-rear')];
        const matrices=regions.map((el,i)=> {
          /* A mat laid out k times larger for sharpness (crankmagic-stage.js, sharpness) carries the matrix shrunk by k:
             its transform after the scale(k) of its layout is the geometry's. */
          const actual=new DOMMatrix(getComputedStyle(el).transform).toFloat64Array(),k=Number(el.dataset.sharp||1);
          return Array.from(actual).every((v,j)=>Math.abs((j<8?v*k:v)-[geometry.front,...geometry.rear][i].matrix[j])<.01);
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
  // Cards is independent of the camera: its new 100% baseline grows another 40% at 150%.
  await page.getByRole('slider',{name:'Tabletop card size',exact:true}).fill('100');
  const cardSize=()=>page.locator('.cm-stage-front .cm-bcard').first().evaluate(el=>el.offsetWidth);
  const baseCard=await cardSize();
  await page.getByRole('slider',{name:'Tabletop card size',exact:true}).fill('150');
  assert.ok(Math.abs(await cardSize()/baseCard-1.4)<.03,'150% Cards grows physical card width by about 40%');
  // The Camera is a fact about this screen: letting go of each slider keeps it on this device, and a reload reads it back.
  const keptCamera={'Table tilt':'27','Table zoom':'83','Tabletop card size':'121'};
  for(const [name,value] of Object.entries(keptCamera)) await page.getByRole('slider',{name,exact:true}).fill(value);
  await page.reload();await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
  await page.getByRole('button',{name:'Camera',exact:false}).click();
  for(const [name,value] of Object.entries(keptCamera)) assert.equal(await page.getByRole('slider',{name,exact:true}).inputValue(),value,`${name} is kept on this device through a reload`);
  assert.ok(await page.evaluate(()=>{
    const r=document.querySelector('.cm-stage-region').getBoundingClientRect(), g=CrankStage.geometry(r.width,r.height,{tilt:(90-27)/2,zoom:83,seats:3});
    return Array.from(new DOMMatrix(getComputedStyle(document.querySelector('.cm-stage-front')).transform).toFloat64Array()).every((v,j)=>Math.abs(v-g.front.matrix[j])<.01);
  }),'and the table is drawn again at the kept tilt and zoom');
  await page.getByRole('slider',{name:'Tabletop card size',exact:true}).fill('100');
  await page.getByRole('slider',{name:'Table tilt',exact:true}).fill('10');
  await page.getByRole('slider',{name:'Table zoom',exact:true}).fill('100');
  if(await page.locator('.cm-stage-rail.is-open').count()) await page.locator('.cm-stage-left').click();
  const handEdges=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('.cm-stage-hand .cm-bcard')].map(e=>e.getBoundingClientRect());
    return {bottoms:cards.map(r=>r.bottom),top:Math.min(...cards.map(r=>r.top)),board:document.querySelector('.cm-stage-front').getBoundingClientRect().bottom,h:innerHeight};
  });
  assert.ok(handEdges.bottoms.every(y=>y>=handEdges.h-32 && y<=handEdges.h),`the full hand remains near the screen edge without cropping card bottoms: ${JSON.stringify(handEdges)}`);
  assert.ok(handEdges.top<handEdges.board,'the hand overlaps the table front at the default camera');
  await openDrawerSettings();
  const titles=await page.locator('#cm-drawer-settings tbody th').allTextContents();
  assert.deepEqual(titles,MODULE_TITLES);
  for(const title of ['AI Coach','Chat']) await page.getByRole('radio',{name:`${title}: Left`,exact:true}).check();
  await page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  assert.equal(await page.locator('.cm-stage-rail.is-open').count(),1,'saving optional modules leaves Actions open for the current decision');
  assert.equal(await page.locator('.cm-stage-rail #cm-board-decision').count(),1,'Actions contains the actual decision');
  assert.equal(await page.locator('#cm-board-decision').count(),1,'Actions has no duplicate floating decision');
  assert.equal(await page.locator('[data-action="board-also"]').count(),0,'the fixed Actions module suppresses the optional-actions popup');
  assert.equal(await page.locator('.cm-stage-rail [data-action="board-rotate"], .cm-stage-rail [data-action="board-view"]').count(),0,'legacy seat and view buttons are removed from the drawer');
  if(!await page.locator('.cm-stage-camera [data-action=board-view]').count()) await page.locator('[data-action=board-camera]').click();
  assert.deepEqual(await page.locator('.cm-stage-camera [data-action=board-view]').evaluateAll(es=>es.map(e=>e.dataset.view)),['table','focus','full']);
  await page.locator('.cm-stage-camera [data-view=full]').click();
  await page.getByRole('button',{name:'Open AI Coach',exact:true}).click();
  await page.locator('.cm-stage-rail #cm-board-coach .cm-coach-input').fill('Keep this draft while moving modules');
  await page.getByRole('button',{name:'Move AI Coach down',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.cm-module-coach-host #cm-board-coach'));
  assert.equal(await page.locator('#cm-board-coach .cm-coach-input').inputValue(),'Keep this draft while moving modules','moving the Coach preserves its draft');
  assert.match(await page.locator('.cm-stage-module[data-module="chat"]').innerText(),/not connected yet/,'Chat does not pretend to send shared messages');
  await page.getByRole('button',{name:'Close the Coach',exact:true}).click();
  await openDrawerSettings();
  for(const title of ['AI Coach','Chat']) await page.getByRole('radio',{name:`${title}: None`,exact:true}).check();
  await page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  assert.equal(await page.locator('.cm-stage-rail [data-module="actions"]').count(),1,'Actions stays available when optional modules are hidden');
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
  await page.setViewportSize({width:1400,height:900});
  for(const [selector,action] of [['.cm-stage-rail','board-stage-rail'],['.cm-stage-side','board-stage-side']]) if(await page.locator(`${selector}.is-open`).count()) await page.locator(`.cm-stage-handle[data-action=${action}]`).click();
  if(!await page.getByRole('combobox',{name:'Background',exact:true}).count()) await page.getByRole('button',{name:'Camera',exact:false}).click();
  await page.getByRole('combobox',{name:'Background',exact:true}).selectOption({index:0});
  await page.getByRole('button',{name:'Camera',exact:false}).click();
  const row=page.locator('.cm-stage-front [data-card-section$=":others"]');
  const order=()=>row.locator('[data-arrange-card]').evaluateAll(els=>els.map(el=>el.dataset.card));
  const originalOrder=await order();assert.ok(originalOrder.length>=2);
  const dropBox=await row.locator('[data-arrange-card]').first().boundingBox();
  await row.locator('[data-arrange-card]').nth(1).dragTo(row.locator('[data-arrange-card]').first(),{targetPosition:{x:dropBox.width/2-5,y:dropBox.height/2}});
  assert.deepEqual((await order()).slice(0,2),[originalOrder[1],originalOrder[0]],'dragging snaps cards into order within their section');
  await row.locator('[data-arrange-card]').first().focus();await row.locator('[data-arrange-card]').first().press('Alt+ArrowRight');
  assert.deepEqual(await order(),originalOrder,'keyboard ordering gives the same arrangement control');
  await row.locator('[data-arrange-card]').nth(1).focus();await row.locator('[data-arrange-card]').nth(1).press('Alt+ArrowLeft');
  const arranged=await order();
  const lands=page.locator('.cm-stage-front [data-card-section$=":lands"] [data-arrange-card]');
  await row.locator('[data-arrange-card]').first().dragTo(lands.first());
  assert.deepEqual(await order(),arranged,'dragging into a different section cannot move a card');
  await page.reload();await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
  assert.deepEqual(await order(),arranged,'arrangement survives reloading the game');
  await page.waitForFunction(()=>document.querySelector('.cm-stage-environment video')?.readyState>=2);
  assert.ok(await page.locator('.cm-stage-environment video').evaluate(v=>v.muted&&v.loop&&v.paused),'the silent background is paused for reduced motion');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.waitForFunction(()=>document.querySelector('.cm-stage-environment video')?.currentTime>0);
  await page.evaluate(()=>globalThis.__backgroundVideo=document.querySelector('.cm-stage-environment video'));
  await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  assert.ok(await page.evaluate(()=>__backgroundVideo===document.querySelector('.cm-stage-environment video')),'redrawing drawers preserves the video element');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('.cm-stage-environment video')?.paused);
  console.log('table-tabletop: camera, drawers, arrangement and video passed');
  // An actual recorded two-entry stack: newest resolves first, every entry gets a readable image.
  for(let i=0;i<20;i++) await page.request.post(`${address}/preview/frame`,{data:'1'});
  await openDrawerSettings();
  for(const id of MODULE_IDS) await page.locator(`input[name="module-${id}"][value="${id==='stack'?'left':id==='inspect'?'right':'none'}"]`).check();
  await page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
  for(const [selector,action] of [['.cm-stage-rail','board-stage-rail'],['.cm-stage-side','board-stage-side']]) if(!await page.locator(`${selector}.is-open`).count()) await page.locator(`.cm-stage-handle[data-action=${action}]`).click();
  await page.locator('.cm-stage-hand .cm-bcard').first().focus();await page.locator('.cm-stage-hand .cm-bcard').first().press('Enter');await page.mouse.move(700,20);
  assert.deepEqual(await page.locator('.cm-stack-summary strong').allTextContents(),['Intruder Alarm','Dundoolin Weaver'],'stack entries are in resolution order');
  assert.deepEqual(await page.locator('.cm-stack-position').allTextContents(),['#1','#2'],'each entry has its own stack position');
  assert.equal(await page.locator('.cm-stack-pile').count(),1,'one overlapping pile represents the whole stack');
  assert.equal(await page.locator('.cm-module-stack-row').count(),0,'no separate card rows');
  for(const width of [1400,1024]) {
    await page.setViewportSize({width,height:900});
    const size=await page.evaluate(()=>{
      const r=e=>e.getBoundingClientRect(),preview=r(document.querySelector('.cm-full-pick .cm-bcard')),card=r(document.querySelector('[data-stack-depth="0"]')),text=r(document.querySelector('.cm-stack-list')),image=r(document.querySelector('.cm-stack-image')),row=document.querySelector('.cm-stack-browser');
      return {dw:card.width-preview.width,dh:card.height-preview.height,fraction:text.width/(text.width+image.width),overflow:row.scrollWidth-row.clientWidth};
    });
    assert.ok(Math.abs(size.dw)<.5&&Math.abs(size.dh)<.5&&Math.abs(size.fraction-.25)<.01&&size.overflow<2,'pile front matches Card Preview with a wrapping 25% name list');
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('.cm-stack-summary').nth(1).click();
  assert.match(await page.locator('.cm-stack-pile').getAttribute('aria-label'),/Dundoolin Weaver/,'a card name brings that card to the front');
  assert.ok(await page.locator('.cm-stack-pile').evaluate(el=>el.getAnimations({subtree:true}).length)>0,'selection animates cards cycling through the pile');
  await page.waitForTimeout(400);
  await page.locator('.cm-stack-pile').click();await page.waitForTimeout(400);
  assert.match(await page.locator('.cm-stack-pile').getAttribute('aria-label'),/Intruder Alarm/,'clicking the pile cycles and wraps');
  assert.deepEqual(await page.locator('.cm-stack-position').allTextContents(),['#1','#2'],'browsing does not change resolution order');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('.cm-stack-summary').nth(1).focus();await page.locator('.cm-stack-summary').nth(1).press('Enter');
  assert.equal(await page.locator('.cm-stack-pile').evaluate(el=>el.getAnimations({subtree:true}).length),0,'reduced motion changes the shown card without animation');
  console.log('table-tabletop: stack geometry and focus passed');
  // Prove the size check rejects the former small stack thumbnails, then restore.
  const brokenSize=await page.addStyleTag({content:'.cm-stage-module .cm-stack-card{--bc:96px!important}'});
  const mismatched=await page.evaluate(()=>Math.abs(document.querySelector('.cm-stack-card').getBoundingClientRect().width-document.querySelector('.cm-full-pick .cm-bcard').getBoundingClientRect().width));
  assert.throws(()=>assert.ok(mismatched<.5),'a deliberately undersized stack card fails the matching-size assertion');
  await brokenSize.evaluate(el=>el.remove());
  /* A long decision in Full screen can be finished by a person (2026-10-19): "Search your library" (frame 15) with 60 of
     D5's card names, as a tutor across most of a library offers, and a stress list of 150 that is longer than the table at
     every size. The title, the count and Confirm stay on screen; the wheel scrolls the options; the last option and Confirm
     are pressed where a person sees them. Reach is hit-tested by hand: Playwright's own click scrolls inside clipped boxes. */
  const reach=(p,selector)=>p.evaluate(selector=>{
    const el=selector==='last'?[...document.querySelectorAll('#cm-board-decision .cm-board-options>*')].at(-1):document.querySelector(selector);
    const byHand=n=>/(auto|scroll)/.test(getComputedStyle(n).overflowX+getComputedStyle(n).overflowY);
    for(let n=el.parentElement;n;n=n.parentElement) if(!byHand(n)&&n!==document.scrollingElement){n.scrollTop=0;n.scrollLeft=0;}
    const r=el.getBoundingClientRect();
    const reached=[[.5,.5],[.12,.2],[.88,.2],[.12,.8],[.88,.8]].every(([fx,fy])=>{
      const x=r.left+r.width*fx,y=r.top+r.height*fy,at=x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&document.elementFromPoint(x,y);
      return !!at&&(at===el||el.contains(at));
    });
    return {reached,x:r.left+r.width/2,y:r.top+r.height/2,top:r.top,bottom:r.bottom};
  },selector);
  let clearBelow=0;
  const choiceShot=async(p,name)=>{
    if(!process.env.UAT_SHOTS) return;
    mkdirSync(process.env.UAT_SHOTS,{recursive:true});
    await p.evaluate(()=>{
      const label=document.createElement('div');
      label.id='choice-proof-label';
      label.textContent='C01 · Choice list';
      label.style.cssText='position:fixed;top:4px;left:4px;z-index:9999;background:#142824;color:white;padding:4px;font:12px system-ui;pointer-events:none';
      document.body.append(label);
    });
    await p.screenshot({path:`${process.env.UAT_SHOTS}/${name}.png`});
    await p.locator('#choice-proof-label').evaluate(el=>el.remove());
  };
  for(const count of [60,150]) {
    const long=spawn(process.execPath,["tools/play-tabletop-preview.mjs"],{env:{...process.env,PREVIEW_PORT:"0",PREVIEW_FRAME:"15",PREVIEW_OPTIONS:String(count)},stdio:["ignore","pipe","pipe"]});
    try {
      const at=await Promise.race([
        new Promise((resolve,reject)=>{long.stdout.on("data",d=>{const m=String(d).match(/http:\/\/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`);});long.once("error",reject);}),
        new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error("preview startup timed out")),10000);t.unref();})
      ]);
      for(const [width,height] of [[1024,768],[1280,720],[1400,900]]) {
        console.log(`table-tabletop: checking ${count} options at ${width}x${height}`);
        const p=await browser.newPage({viewport:{width,height}}), sent=[], where=`${count} options at ${width}x${height}`;
        let roomSocket, latestView;
        await p.routeWebSocket(/\/api\/tables\//,ws=>{
          roomSocket=ws;
          const server=ws.connectToServer();
          server.onMessage(message=>{
            const frame=JSON.parse(String(message));
            if(frame.view) latestView=frame.view;
            ws.send(message);
          });
        });
        p.on("pageerror",e=>errors.push(e.message));
        p.on("websocket",ws=>ws.on("framesent",f=>sent.push(String(f.payload))));
        await p.goto(`${at}/index.html#table?id=tablepreview01`);
        await p.waitForFunction(n=>document.querySelectorAll('.cm-stage-rail #cm-board-decision .cm-board-options>button').length===n,count);
        const title='#cm-board-decision>h2', tally='#cm-board-decision .cm-board-decision-foot>.cm-muted', confirm='#cm-board-decision [data-action="board-confirm"]';
        for(const s of [title,tally,confirm]) assert.ok((await reach(p,s)).reached,`${where}: ${s} is on screen and takes the pointer`);
        const list=await p.evaluate(()=>{const o=document.querySelector('#cm-board-decision .cm-board-options'),r=o.getBoundingClientRect(),first=o.firstElementChild.getBoundingClientRect(),h=document.querySelector('#cm-board-decision>h2').getBoundingClientRect();
          return {x:r.left+r.width/2,y:r.top+Math.min(r.height/2,60),over:o.scrollHeight-o.clientHeight,top:first.top-r.top,left:first.left-r.left,under:first.left-h.left};});
        if(count===150) assert.ok(list.over>40,`${where}: the stress list is longer than the table, so its scroll is exercised (${list.over}px)`);
        assert.ok(list.top>=2.5&&list.left>=2.5,`${where}: a chosen option's outline is whole at the list's edges (${list.top}, ${list.left})`);
        assert.ok(Math.abs(list.under)<.5,`${where}: the options start under the title, as they do in every view (${list.under})`);
        await p.mouse.move(list.x,list.y);
        /* Wheel until the list is at its end, each turn waited for (ROB-173): stopping when two readings matched stopped early under CI load, a turn not yet landed. A list that cannot scroll stops at once, and the assertion below says so. */
        const scrollOf=()=>p.evaluate(()=>{const o=document.querySelector('#cm-board-decision .cm-board-options');return {top:o.scrollTop,end:o.scrollTop>=o.scrollHeight-o.clientHeight-1};});
        for(let i=0;i<60;i++){const was=await scrollOf();if(was.end)break;await p.mouse.wheel(0,300);if(!await p.waitForFunction(t=>document.querySelector('#cm-board-decision .cm-board-options').scrollTop!==t,was.top,{timeout:3000}).then(()=>true,()=>false))break;}
        const last=await reach(p,'last');
        const scrollBefore=await p.locator('#cm-board-decision .cm-board-options').evaluate(el=>el.scrollTop);
        assert.ok(last.reached,`${where}: the wheel brings the last option into reach (${Math.round(last.top)}-${Math.round(last.bottom)})`);
        for(const s of [title,tally,confirm]) assert.ok((await reach(p,s)).reached,`${where}: with the list scrolled, ${s} stays on screen`);
        await p.mouse.click(last.x,last.y);
        await p.waitForFunction(n=>document.querySelector(`#cm-board-decision [data-index="${n}"]`)?.getAttribute('aria-pressed')==='true',count-1);
        assert.match(await p.locator(tally).innerText(),/^1 chosen/,`${where}: the last option is chosen`);
        const kept=async label=>{
          assert.equal(await p.locator('#cm-board-decision .cm-board-options').evaluate(el=>el.scrollTop),scrollBefore,`${where}: ${label} keeps the scroll position`);
          assert.ok((await reach(p,'last')).reached,`${where}: ${label} keeps the last option under the pointer`);
        };
        await kept('selecting');
        await p.mouse.click(last.x,last.y);
        await p.waitForFunction(n=>document.querySelector(`#cm-board-decision [data-index="${n}"]`)?.getAttribute('aria-pressed')==='false',count-1);
        await kept('deselecting');
        await p.mouse.click(last.x,last.y);
        await p.waitForFunction(n=>document.querySelector(`#cm-board-decision [data-index="${n}"]`)?.getAttribute('aria-pressed')==='true',count-1);
        await kept('selecting again');
        if(count===150&&width===1280) await choiceShot(p,'rob-165-choice-1280x720');
        const press=await reach(p,confirm);
        assert.ok(press.reached,`${where}: Confirm is in reach once an option is chosen`);
        await p.mouse.click(press.x,press.y);
        for(let i=0;i<50&&!sent.some(s=>s.includes('"kind":"answer"'));i++) await p.waitForTimeout(50);
        const answer=sent.map(s=>JSON.parse(s)).find(f=>f.kind==='answer');
        assert.deepEqual(answer&&{choiceId:answer.choiceId,indices:answer.indices},{choiceId:'chooseCard:0:29:21',indices:[count-1]},`${where}: Confirm sends the last option as the answer`);
        /* Under a decision shorter than the table, the table takes the pointer: the box is no taller than what it holds. */
        const below=await p.evaluate(()=>{const d=document.querySelector('#cm-board-decision').getBoundingClientRect(),r=document.querySelector('.cm-stage-region').getBoundingClientRect(),y=d.bottom+24;
          return r.bottom-d.bottom<40?null:!document.elementFromPoint((d.left+d.right)/2,y).closest('.cm-board-ask');});
        if(below!==null){clearBelow++;assert.ok(below,`${where}: the table just below the decision takes the pointer, not the decision's box`);}
        // Same-sized fresh questions and matches must not inherit this list's old position.
        for(const boundary of ['decision','match']) {
          const next=structuredClone(latestView);
          if(boundary==='decision') next.decision.id+=':next';
          else next.matchId+=':next';
          next.revision++;
          latestView=next;
          roomSocket.send(JSON.stringify({type:'view',view:next}));
          await p.waitForFunction(({id,match})=>{const d=document.querySelector('#cm-board-decision');return d?.dataset.choiceId===id&&d.dataset.matchId===match;},{id:next.decision.id,match:next.matchId});
          assert.equal(await p.locator('#cm-board-decision .cm-board-options').evaluate(el=>el.scrollTop),0,`${where}: a new ${boundary} opens at the top`);
          await p.mouse.move(list.x,list.y);
          await p.mouse.wheel(0,10000);
          await p.waitForTimeout(100);
          if(count===150) assert.ok(await p.locator('#cm-board-decision .cm-board-options').evaluate(el=>el.scrollTop>0),`${where}: reset check starts from a genuinely scrolled list`);
        }
        await p.close();
      }
      if(count===150&&process.env.UAT_SHOTS) {
        const phone=await browser.newPage({viewport:{width:390,height:844}});
        phone.on('pageerror',e=>errors.push(e.message));
        await phone.goto(`${at}/index.html#table?id=tablepreview01`);
        await phone.waitForSelector('#cm-board-decision .cm-board-options');
        await choiceShot(phone,'rob-165-choice-390x844');
        await phone.close();
      }
    } finally {long.kill();}
  }
  assert.ok(clearBelow>0,'the table under a short decision was hit-tested at one size at least');
  assert.deepEqual(errors,[],"no uncaught browser errors");
  console.log('table-tabletop: browser passed (four seats, private backs, persistent canvas, camera bounds, overlays, phone fallback)');
} finally {server.kill();await close();}
