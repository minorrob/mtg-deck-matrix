/* CARDS ON THE TABLE ARE AS SHARP AS THE HAND'S (Rob, 2026-10-25, a screenshot of 3D: "Note how blurry the cards on the
   mat are as compared to cards in the hand. When I zoom in, the resolution should be sharp and high enough that the text
   can become easily readable on the board. This should be a check for you that needs to pass as part of the resolution
   improvements.").

   A card image with real small print (tests/fixtures/sharp-card.png, 488×680, the size of Scryfall's "normal") stands in
   for every card. In 3D, at 100% and at the camera's closest zoom, the largest card on your mat and on an opponent's is
   cropped from the screen, and its fine detail -- the share of its contrast that a copy at half its on-screen size loses
   -- is measured against the same picture drawn flat at the same size. A card drawn from a bitmap the size of its CSS box
   and then magnified by the perspective has almost none (its detail is all coarse); a sharp one keeps most. Each must keep
   at least 60% of the flat drawing's fine detail, and the hand's card is measured the same way for comparison. At 150%,
   the Graphics resolution a graphics card gets by default (crankmagic-stage.js). */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser,ROOT} from "./uat/browser-runner.mjs";
const {browser,base,stub,close}=await openBrowser({name:"board-card-sharpness",flag:"GEOMETRY_REQUIRED"});
const sample=JSON.parse(readFileSync(path.join(ROOT,"docs/reference/replit-sample-views.json"),"utf8")).views[13];
const html=readFileSync(path.join(ROOT,"index.html"),"utf8").replace("</head>",'<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const CARD=readFileSync(path.join(ROOT,"tests/fixtures/sharp-card.png")),CARD64=`data:image/png;base64,${CARD.toString("base64")}`;
const table={tableId:"sharpfixture1",phase:"playing",matchId:sample.matchId,away:[],blockers:[],rules:{},seats:sample.state.players.map(p=>({seatId:p.playerId,name:p.name,kind:p.playerId===sample.seat?"human":"ai",you:p.playerId===sample.seat,occupied:true}))};
const KEEP=Number(process.env.SHARP_KEEP||.6);
let checks=0;
const ok=(c,m)=>{assert.ok(c,m);checks++};
async function measure(zoom){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",serviceWorkers:"block"});
  await context.addInitScript(z=>{localStorage.setItem("cm-board-view","full");localStorage.setItem("crankmagic-audio-muted","true");localStorage.setItem("cm-board-zoom-v2",String(z));localStorage.setItem("cm-board-tilt-v4","42.631579");/* the camera at exactly 40 degrees on the first backdrop (floor 76 from straight down): this measure is sensitive to the angle */localStorage.setItem("cm-stage-resolution","150");},zoom);
  const page=await context.newPage();if(stub)await stub(page);
  await page.route("**://cards.scryfall.io/**",r=>r.fulfill({status:200,contentType:"image/png",body:CARD}));
  await page.route("**://api.scryfall.com/cards/named**",r=>r.fulfill({status:200,contentType:"image/png",body:CARD}));
  await page.route(`${base}/index.html*`,r=>r.fulfill({contentType:"text/html",body:html}));
  await page.route(`${base}/api/me`,r=>r.fulfill({json:{email:"sharp@example.com"}}));
  await page.route(`${base}/api/library**`,r=>r.fulfill({json:{head:null}}));
  await page.route(`${base}/api/tables**`,r=>r.fulfill({json:{table,now:Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/sharpfixture1\/connect$/,ws=>{ws.send(JSON.stringify({type:"view",view:sample}));});
  await page.goto(`${base}/index.html#table?id=sharpfixture1`);await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor({timeout:60000});
  await page.waitForFunction(()=>[...document.querySelectorAll(".cm-stage-front .cm-bcard img, .cm-stage-rear .cm-bcard img, .cm-stage-fan .cm-bcard img")].some(i=>i.complete&&i.naturalWidth>100),null,{timeout:20000});
  await page.mouse.move(2,450);await page.waitForTimeout(700);
  /* The largest card wholly on screen in each place, by its drawn box, inset from its frame. */
  const boxes=await page.evaluate(()=>{
    /* Upright (not tapped, so not turned) and wholly in view: no drawer, hand or other card over any of nine points. */
    const pick=(sel)=>{let best=null;for(const img of document.querySelectorAll(sel)){const card=img.closest(".cm-bcard");if(!(img.naturalWidth>100)||card.matches(".is-tapped"))continue;const r=img.getBoundingClientRect();if(r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)continue;
      let clear=true;for(const fx of [.12,.5,.88])for(const fy of [.12,.5,.88]){const hit=document.elementFromPoint(r.left+r.width*fx,r.top+r.height*fy);if(!hit||!card.contains(hit))clear=false;}
      if(clear&&(!best||r.width*r.height>best.width*best.height))best={x:r.left,y:r.top,width:r.width,height:r.height,css:img.offsetWidth};}return best;};
    return {mat:pick(".cm-stage-front .cm-bcard img"),rear:pick(".cm-stage-rear .cm-bcard img"),hand:pick(".cm-stage-fan .cm-bcard img")};
  });
  const out={};
  for(const [k,b] of Object.entries(boxes)){
    if(!b)continue;
    const i=.18,clip={x:Math.round(b.x+b.width*i),y:Math.round(b.y+b.height*.55),width:Math.round(b.width*(1-2*i)),height:Math.round(b.height*.3)};
    const shot=(await page.screenshot({clip})).toString("base64");
    /* Fine detail: the share of the contrast a copy at half size loses, of the screen's crop and of the card's own picture
       drawn flat at the crop's size (the same part of it: 55% to 85% down, 18% in from each side). */
    out[k]={...await page.evaluate(async([shot,card,clip,i])=>{
      const load=(src)=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;});
      const fine=(draw,w,h)=>{const c=new OffscreenCanvas(w,h),x=c.getContext("2d");x.imageSmoothingQuality="high";draw(x);const a=x.getImageData(0,0,w,h).data;
        const s=new OffscreenCanvas(Math.max(1,w>>1),Math.max(1,h>>1)),y=s.getContext("2d");y.imageSmoothingQuality="high";y.drawImage(c,0,0,s.width,s.height);
        const u=new OffscreenCanvas(w,h),z=u.getContext("2d");z.imageSmoothingQuality="high";z.drawImage(s,0,0,w,h);const b=z.getImageData(0,0,w,h).data;
        let lost=0,all=0,m=0;for(let p=0;p<a.length;p+=4)m+=a[p]+a[p+1]+a[p+2];m/=a.length/4;
        for(let p=0;p<a.length;p+=4){const L=a[p]+a[p+1]+a[p+2],B=b[p]+b[p+1]+b[p+2];lost+=(L-B)**2;all+=(L-m)**2;}return lost/all;};
      const s=await load("data:image/png;base64,"+shot),c=await load(card);
      const screen=fine((x)=>x.drawImage(s,0,0),clip.width,clip.height);
      const flat=fine((x)=>x.drawImage(c,c.width*i,c.height*.55,c.width*(1-2*i),c.height*.3,0,0,clip.width,clip.height),clip.width,clip.height);
      return {screen,flat};
    },[shot,CARD64,clip,i]),onScreen:Math.round(b.width),css:b.css};
    out[k].keeps=out[k].screen/out[k].flat;
  }
  await context.close();
  return out;
}
try{
  for(const zoom of [100,200]){
    const m=await measure(zoom);
    console.log(`zoom ${zoom}%: ${Object.entries(m).map(([k,v])=>`${k} ${v.onScreen}px on screen (${v.css}px CSS) keeps ${Math.round(v.keeps*100)}% of the flat picture's fine detail`).join("; ")}`);
    ok(m.mat&&m.hand,`zoom ${zoom}%: a card on your mat and one in your hand are on screen`);
    ok(m.mat.keeps>=KEEP,`zoom ${zoom}%: the card on your mat, ${m.mat.onScreen}px wide, keeps ${Math.round(m.mat.keeps*100)}% of its picture's fine detail (at least ${KEEP*100}%; the hand's keeps ${Math.round(m.hand.keeps*100)}%)`);
    if(m.rear)ok(m.rear.keeps>=KEEP,`zoom ${zoom}%: a card on an opponent's mat, ${m.rear.onScreen}px wide, keeps ${Math.round(m.rear.keeps*100)}% (at least ${KEEP*100}%)`);
  }
  console.log(`board-card-sharpness: ${checks} checks passed — in 3D, at 100% and at the closest zoom, the cards on the mats keep their picture's fine print as the hand's do.`);
}finally{await close();}
