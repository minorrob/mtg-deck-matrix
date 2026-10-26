/* THE TABLE'S GRAPHICS (Rob, 2026-10-25): "I also want to increase the game's resolution dramatically. I'd like this to be
   an option in settings. The lava background shouldn't be so zoomed in by default either ... the table material/skin looks
   like an 8-bit graphic. I want 32-bit graphics in this game as a minimum" and "the skin on the tables should have much
   more detail to them; look like a more realistic cartoon."

     1. Resolution: 150% of the screen's pixels by default where a graphics card draws (100% where the browser draws WebGL
        in software, as here), the canvas really drawn at that many pixels (it had been drawn at 1x whatever the scaling
        said); dithered.
     2. The setting, in the table's Settings window: 50% to 200%, previewed as it moves, put back by Cancel, kept by its
        change and Save, and still there after a reload; and in Settings › Play, with the same value.
     3. The backdrop whole: the video at its 16:9 as large as the stage allows without cropping, its poster blurred behind.
        And its resolution (Rob, 2026-10-26: "Maintain resolution in line with settings selection with 2k at max
        resolution"): of the heights kept (tools/stage-backdrops.mjs), the smallest that fills the backdrop at the kept
        setting, never over 1440; changed when the setting is kept, not while it is previewed, the clip keeping its place.
     4. Every table design's skins: painted at 2048 (4096 at 175% and over), mipmapped, anisotropic, 32-bit RGBA, each
        holding more colors than an 8-bit palette's 256, with relief maps and inked edges.
     5. Painted off the page: every skin in the worker (crankmagic-stage-paint.js), none on the page. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
import {writeCatalog} from "../tools/stage-backdrops.mjs";
import {copyFileSync,mkdtempSync,rmSync} from "node:fs";
import os from "node:os";
/* The list tools/stage-backdrops.mjs writes is still between its markers in crankmagic-stage.js. */
{const dir=mkdtempSync(path.join(os.tmpdir(),"backdrops-")),copy=path.join(dir,"stage.js");copyFileSync(path.join(ROOT,"crankmagic-stage.js"),copy);
  writeCatalog(copy,[{id:"x-test",name:"X",poster:"p.jpg",video:{720:"x-720.webm"}}]);
  assert.match(readFileSync(copy,"utf8"),/\/\* backdrops:begin \*\/\n  const BACKDROPS=\[\{id:"x-test",name:"X",poster:"p\.jpg",video:\{720:"x-720\.webm"\}\}\];\n  \/\* backdrops:end \*\/\n  const appearances = Object\.freeze\(\{backgrounds: BACKDROPS,/,"the backdrop tool rewrites the stage's list between its markers");
  rmSync(dir,{recursive:true});}
const {browser,base,stub,close}=await openBrowser({name:"board-graphics",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const table={tableId:"gfxfixture01",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
const DESIGNS=["medieval-banded","colonial-inlay","glass-future","tavern-plank","felt-card","stone-dais","obsidian-glass"];
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const context=await browser.newContext({viewport:{width:1830,height:830},reducedMotion:"reduce",serviceWorkers:"block"});
await context.addInitScript(()=>{if(location.protocol!=="about:"&&!sessionStorage.getItem("gfx-started")){sessionStorage.setItem("gfx-started","1");localStorage.setItem("cm-board-view","full");localStorage.setItem("crankmagic-audio-muted","true");}});
const page=await context.newPage();if(stub)await stub(page);
const errors=[];page.on("pageerror",x=>errors.push(x.message));
await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"gfx@example.com"}}));
await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
/* The backdrop with byte ranges, as Cloudflare serves it (the test server sends whole files, which a video cannot seek). */
await page.route(/\/assets\/environments\/[^/?]+\.webm(\?.*)?$/,r=>{
  const body=readFileSync(path.join(ROOT,new URL(r.request().url()).pathname.slice(1))),m=/bytes=(\d+)-(\d*)/.exec(r.request().headers().range||"");
  if(!m)return r.fulfill({status:200,contentType:"video/webm",headers:{"accept-ranges":"bytes"},body});
  const a=Number(m[1]),b=m[2]?Math.min(Number(m[2]),body.length-1):body.length-1;
  return r.fulfill({status:206,contentType:"video/webm",headers:{"accept-ranges":"bytes","content-range":`bytes ${a}-${b}/${body.length}`},body:body.subarray(a,b+1)});
});
await page.routeWebSocket(/\/api\/tables\/gfxfixture01\/connect$/,ws=>{ws.send(JSON.stringify({type:"view",view:sample}));});
/* A fresh page each time (the same address with only its hash would not load again). */
const open=async()=>{await page.goto("about:blank");await page.goto(`${base}/index.html#table?id=gfxfixture01`);await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor({timeout:60000});};
const painted=()=>page.waitForFunction(()=>CrankStage.diagnostics().graphics?.painted===true,null,{timeout:90000});
const gfx=()=>page.evaluate(()=>CrankStage.diagnostics().graphics);
const ratioNow=async()=>{const g=await gfx();return Math.round(g.canvas[0]/g.css[0]*100)/100;};
/* The ratio once it has settled (a window's close event, a redraw), up to two seconds. */
const ratio=async(want)=>{let r=await ratioNow();for(let i=0;want!==undefined&&r!==want&&i<20;i++){await page.waitForTimeout(100);r=await ratioNow();}return r;};
try{
  /* 1. The default. */
  await open();
  let g=await gfx();
  eq(g.resolution,g.software?100:150,`the default resolution is 150% of the screen's pixels where a graphics card draws, 100% where the browser draws in software (here: ${g.software?"software":"a graphics card"}, ${g.resolution}%)`);
  /* The rest at 150%, the default a graphics card gets. */
  await page.evaluate(()=>localStorage.setItem("cm-stage-resolution","150"));await open();g=await gfx();
  eq(await ratio(1.5),1.5,`and the canvas is drawn at it: ${g.canvas.join("×")} for a ${g.css.join("×")} stage`);
  ok(g.dither,"dithered, so smooth light does not band");

  /* 2. The table's Settings window. */
  await page.locator("[data-action=board-profile]").click();await page.locator("[data-action=board-tools]").click();
  const slider=page.locator("#cm-board-tools [data-stage-resolution]");
  await slider.waitFor();
  eq([await slider.getAttribute("min"),await slider.getAttribute("max"),await slider.inputValue()],["50","200","150"],"Settings has Graphics resolution, 50% to 200%, at 150%");
  await slider.evaluate(el=>{el.value="200";el.dispatchEvent(new Event("input",{bubbles:true}));});
  eq(await ratio(2),2,"dragged to 200%, the table is drawn at twice the screen's pixels at once");
  eq(await page.evaluate(()=>localStorage.getItem("cm-stage-resolution")),"150","a preview is not kept");
  await page.locator(".cm-play-settings-foot [data-action=close]").click();
  eq(await ratio(1.5),1.5,"Cancel puts it back");
  await page.locator("[data-action=board-profile]").click();await page.locator("[data-action=board-tools]").click();
  await slider.evaluate(el=>{el.value="50";el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));});
  eq(await ratio(.5),.5,"at its least, 50%: half the screen's pixels");
  await slider.evaluate(el=>{el.value="100";el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));});
  eq((await page.locator("#cm-board-tools [data-stage-resolution] + output").innerText()).trim(),"100%","its reading follows it");
  await page.locator("[data-action=board-settings-save]").click();
  eq([await ratio(1),await page.evaluate(()=>localStorage.getItem("cm-stage-resolution"))],[1,"100"],"Save keeps 100%, on this device");
  await open();
  eq(await ratio(1),1,"and a reload draws at it");
  await page.goto(`${base}/index.html#settings`);
  const there=page.locator("#cm-main [data-stage-resolution]");await there.waitFor({timeout:20000});
  eq(await there.inputValue(),"100","Settings › Play has the same slider, at the kept value");
  await page.evaluate(()=>localStorage.setItem("cm-stage-resolution","150"));

  /* 3. The backdrop whole. */
  await open();
  const fit=await page.evaluate(()=>{const env=document.querySelector(".cm-stage-environment"),v=env.querySelector("video"),a=env.getBoundingClientRect(),b=v.getBoundingClientRect();return {env:[a.width,a.height],video:[b.width,b.height],behind:getComputedStyle(env,"::before").backgroundImage,inside:b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1};});
  ok(fit.inside&&Math.abs(fit.video[0]/fit.video[1]-16/9)<.01,`the backdrop is shown whole, at 16:9 inside the stage (${fit.video.map(Math.round).join("×")} in ${fit.env.map(Math.round).join("×")})`);
  ok(Math.abs(fit.video[1]-fit.env[1])<2||Math.abs(fit.video[0]-fit.env[0])<2,"as large as the stage allows");
  const first=await page.evaluate(()=>{const b=CrankStage.appearances.backgrounds[0];return {id:b.id,poster:b.poster,video:Object.values(b.video)};});
  ok(fit.behind.includes(first.poster.split("?")[0]),"its poster, blurred, fills what is left");
  /* 3b. Its resolution follows the setting, 2K at the most. A stage 1000 pixels high, a screen of pixel ratio 1. */
  const tiers=await page.evaluate(()=>{const all={video:{720:"a",1080:"b",1440:"c",2160:"d"}},one={video:{720:"a"}},box={width:1830,height:1000};
    return {all:[50,70,100,110,150,200].map(p=>CrankStage.backdropLines(all,box,p)),one:[50,200].map(p=>CrankStage.backdropLines(one,box,p)),
      wide:CrankStage.backdropLines(all,{width:1280,height:1000},100),none:CrankStage.backdropLines({},box,100),dpr:devicePixelRatio};});
  eq(tiers.dpr,1,"the screen's pixel ratio here is 1");
  eq(tiers.all,[720,720,1080,1440,1440,1440],"at 50% and 70% the 720 lines, at 100% the 1080, at 110% and over the 1440: never the 2160 (2K at the most)");
  eq(tiers.one,[720,720],"a backdrop kept at 720 only plays it at every setting");
  eq(tiers.wide,720,"a stage narrower than 16:9 needs only the height its width allows (1280 wide: 720)");
  eq(tiers.none,null,"a backdrop with no video has no height");
  let bd=await page.evaluate(()=>CrankStage.diagnostics().backdrop);
  ok(bd.id===first.id&&first.video.includes(bd.src),`the first backdrop plays by default, one of its kept files (${bd.src} at ${bd.lines} lines)`);
  /* Three heights of the same clip (the query alone tells them apart), then the setting moved. */
  const tiered=async()=>{await page.evaluate(()=>{const b=CrankStage.appearances.backgrounds[0],src=Object.values(b.video)[0];b.video={720:src+"&h=720",1080:src+"&h=1080",1440:src+"&h=1440"};});};
  const lines=async want=>{let d;for(let i=0;i<30;i++){d=await page.evaluate(()=>CrankStage.diagnostics().backdrop);if(d.lines===want)break;await page.waitForTimeout(100);}return d;};
  await tiered();await page.evaluate(()=>CrankStage.setResolution(50));
  bd=await lines(720);eq([bd.lines,/&h=720$/.test(bd.src)],[720,true],"at 50% the 720-line file plays");
  await page.waitForFunction(()=>document.querySelector(".cm-stage-environment video").readyState>=1,null,{timeout:20000});
  await page.evaluate(()=>{const v=document.querySelector(".cm-stage-environment video");v.currentTime=v.duration/2;});
  const placed=await page.evaluate(()=>document.querySelector(".cm-stage-environment video").currentTime);
  await page.evaluate(()=>CrankStage.previewResolution(200));await page.waitForTimeout(300);
  eq((await page.evaluate(()=>CrankStage.diagnostics().backdrop)).lines,720,"a preview of 200% leaves the video as it is");
  await page.evaluate(()=>CrankStage.setResolution(200));
  bd=await lines(1440);eq([bd.lines,/&h=1440$/.test(bd.src)],[1440,true],"kept at 200%, the 1440-line file (2K) plays");
  await page.waitForFunction(()=>document.querySelector(".cm-stage-environment video").readyState>=1,null,{timeout:20000});
  const kept=await page.waitForFunction(at=>{const v=document.querySelector(".cm-stage-environment video");return Math.abs(v.currentTime-at)<.25&&v.currentTime;},placed,{timeout:20000}).then(h=>h.jsonValue()).catch(()=>page.evaluate(()=>document.querySelector(".cm-stage-environment video").currentTime));
  ok(placed>1&&Math.abs(kept-placed)<.25,`and the clip keeps its place across the change (${placed.toFixed(2)} s, then ${Number(kept).toFixed(2)} s)`);
  await page.evaluate(()=>localStorage.setItem("cm-stage-resolution","150"));

  /* 4 and 5. Every design's skins, painted off the page. */
  for(const id of DESIGNS){
    await page.evaluate(id=>localStorage.setItem("cm-stage-table",id),id);
    await open();
    await painted();
    const where=await page.evaluate(()=>CrankTables.painting());
    g=await gfx();
    eq(g.design,id,`${id}: built`);
    const skins=g.textures.filter(t=>!/ relief| glow/.test(t.name));
    ok(skins.length&&Math.max(...skins.map(t=>t.width))>=2048,`${id}: its largest skin is ${Math.max(...skins.map(t=>t.width))} px`);
    ok(g.textures.every(t=>t.mips&&t.aniso>=8),`${id}: every texture mipmapped and anisotropic`);
    ok(g.textures.every(t=>t.bits===32),`${id}: every texture 32-bit (RGBA, 8 bits a channel)`);
    ok(skins.every(t=>t.colors>256),`${id}: and each skin holds more colors than an 8-bit palette could (${skins.map(t=>t.colors).join(", ")} sampled; a palette holds 256)`);
    ok(g.bumps>0&&g.inked>0,`${id}: relief on ${g.bumps} parts and inked edges on ${g.inked}`);
    ok(where.worker>0&&where.page===0,`${id}: painted off the page, in the worker (${where.worker} skins there, ${where.page} on the page)`);
  }
  /* At 175% and over the skins are 4096. */
  await page.evaluate(()=>{localStorage.setItem("cm-stage-resolution","200");localStorage.setItem("cm-stage-table","glass-future");});
  await open();await painted();
  g=await gfx();
  eq([g.size,await ratio(2)],[4096,2],"at 200% the skins are painted at 4096 and the table drawn at twice the screen's pixels");
  eq(errors,[],"no page errors");
  console.log(`board-graphics: ${checks} checks passed — the table drawn at 150% of the screen's pixels by default, 50% to 200% in Settings, previewed, put back and kept; the backdrop whole, at the height the setting calls for, 2K at most; every design's skins painted off the page at 2048 or 4096 in full color, mipmapped, with relief and inked edges.`);
}finally{await context.close();await close();}
