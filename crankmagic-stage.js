/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * The live Babylon table. Cards, seat controls, hand and decisions remain accessible DOM.
 * One geometry model positions both the canvas mats and the DOM content.
 */
(function (root) {
  "use strict";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
  /* THE CAMERA (Rob, 2026-10-25: the wheel zooms, a mat drags the view across the table, a held right button "looks" at
     a place). One pinhole camera in table pixels -- x to the right, y up, z away from the viewer, the table's center at
     the origin -- gives the Babylon camera and every DOM surface's matrix3d, so the cards stay on the table whatever the
     camera does. At rest it is the camera this file always had: `tilt` from straight down, `zoom` its focal length, the
     table's center at 43% of the height. `pan` moves the point it looks at across the table ({x, y} in plane pixels, y
     toward the viewer); `look` is the head-look's offset from there: the eye moved by {x, y, z} and turned by `yaw`
     (toward +x) and `pitch` (down).
     THE PERSON'S SIDE, LENGTHENED (Rob, 2026-10-25: "expand the table (and their mat size automatically in proportion)
     ... to increase / decrease the length of the table on their side ... all the way down, underneath the hand's cards,
     to the padding at the screen edge"). `reach` is how much longer the table runs on the near side, as a share of its
     resting length `base`. The far side, the opponents' mats and the camera stay where they are -- the table's resting
     center (cx, cy) is still the world's origin -- and the front mat grows by the same length, its cards with it
     (place's --stage-card). The longest is the one whose near edge, seen by the resting camera at this tilt and 100%,
     lies REACH_PAD px above the bottom of the screen (`reachMost`): zooming or moving the view never shortens the table.
     The shortest is the length it always had, where the front mat's captions are already at 10px. */
  const REACH_PAD=8;
  function geometry(width, height, {tilt = 40, zoom = 100, seats = 3, rotation = 0, pan = null, look = null, reach = 0, rearMin = 0} = {}) {
    const w=Math.max(1,width), h=Math.max(1,height), angle=clamp(tilt,0,TILT_LIMIT)*Math.PI/180;
    const yaw=clamp(rotation,-180,180)*Math.PI/180, c=Math.cos(yaw), q=Math.sin(yaw);
    const base=h*.88, sx=.902*clamp(zoom,60,200)/100, sy=sx*Math.cos(angle);
    const cx=w/2, cy=base/2, screenY=h*.43, distance=Math.max(w,h)*2.5, focal=sx*distance;
    /* The resting camera's ray through the bottom of the screen less the pad, down the middle of the view, meets the
       table's plane at world depth Z: the farthest the near edge may come toward the viewer. */
    const rest=Math.PI/2-angle, b0=(h-REACH_PAD-screenY)/(.902*distance), ry=-Math.sin(rest)-b0*Math.cos(rest), rz=Math.cos(rest)-b0*Math.sin(rest);
    const edgeZ=ry<0?-distance*Math.sin(angle)+(distance*Math.cos(angle)/-ry)*rz:-Infinity;
    const reachMost=Math.max(0,Math.min(base,c*-edgeZ+cy-base)), reachPx=Math.min(reachMost,clamp(reach,0,1)*base);
    const planeHeight=base+reachPx;
    const at={x:clamp(pan?.x,-cx,cx),y:clamp(pan?.y,-cy,cy+reachPx)}, L=look||{};
    const eye=[at.x+(L.x||0),distance*Math.cos(angle)+(L.y||0),-at.y-distance*Math.sin(angle)+(L.z||0)];
    const turn=L.yaw||0, pitch=Math.PI/2-angle+(L.pitch||0), ct=Math.cos(turn), st=Math.sin(turn), cp=Math.cos(pitch), sp=Math.sin(pitch);
    const right=[ct,0,-st], up=[st*sp,cp,ct*sp], ahead=[st*cp,-sp,ct*cp];
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    // A point of the table (plane pixels, the table turned by `rotation`) in the world, and a world point on the screen,
    // homogeneous, over the resting distance (so the center's w is 1 at rest).
    const world=(x,y)=>{const X=x-cx,Y=y-cy;return [c*X-q*Y,0,-(q*X+c*Y)];};
    const toScreen=p=>{const d=[p[0]-eye[0],p[1]-eye[1],p[2]-eye[2]],xc=dot(right,d),yc=dot(up,d),zc=dot(ahead,d);
      return [(cx*zc+focal*xc)/distance,(screenY*zc-focal*yc)/distance,zc/distance];};
    const project=(x,y)=>{const [X,Y,W]=toScreen(world(x,y));return [X/W,Y/W];};
    function surface(r) {
      const o=toScreen(world(r.x,r.y)), u=toScreen(world(r.x+1,r.y)), v=toScreen(world(r.x,r.y+1));
      return {...r,matrix:[u[0]-o[0],u[1]-o[1],0,u[2]-o[2],v[0]-o[0],v[1]-o[1],0,v[2]-o[2],0,0,1,0,o[0],o[1],0,o[2]],
        quad:[...project(r.x,r.y),...project(r.x+r.width,r.y),...project(r.x+r.width,r.y+r.height),...project(r.x,r.y+r.height)]};
    }
    /* The table point under a screen point (relative to the stage), or null where the ray misses the table's plane. */
    function unproject(px,py) {
      const a=(px-cx)/focal,b=(py-screenY)/focal,ray=[0,1,2].map(i=>ahead[i]+a*right[i]-b*up[i]);
      if(ray[1]>=-1e-9)return null;
      const k=-eye[1]/ray[1],X=eye[0]+k*ray[0],Z=eye[2]+k*ray[2],Y=-Z;
      return {x:c*X+q*Y+cx,y:-q*X+c*Y+cy,world:[X,0,Z]};
    }
    const quad=[...project(0,0),...project(w,0),...project(w,planeHeight),...project(0,planeHeight)], [ox,oy]=quad;
    const margin=22,gap=20,count = clamp(seats,1,3),rearY=18,rearH=Math.min(Math.max(base*.24,Number(rearMin)||0),Math.max(base*.24,planeHeight-90)),rearW=(w-margin*2-gap*(count-1))/count;
    const rear=Array.from({length:seats},(_,i)=>surface({x:margin+i*(rearW+gap),y:rearY,width:rearW,height:rearH}));
    const frontY=rearY+rearH+22,front=surface({x:margin,y:frontY,width:w-margin*2,height:planeHeight-frontY-18});
    return {width:w,height:h,planeHeight,base,cy,reach:reachPx,reachMost,sx,sy,ox,oy,angle,yaw,distance,focal,screenY,pan:at,
      camera:{eye,yaw:turn,pitch,right,up,ahead},project,unproject,quad,rear,front};
  }
  /* THE FLAT TABLE (Rob, 2026-10-28: Table and Focus are the 3D view's HUD and functions without the canvas). Both lay their boards on a plane at no tilt and
     set them as the 3D view's are -- one matrix each -- so the same zoom (the wheel, Camera's slider) and pan (a drag across the table) move them and the cards
     stay sharp. TABLE: every seat's board the same 16:9, two across and two down (side by side for two; two over one for three), the largest that fits above the
     hand. FOCUS: the others' boards in a row across the back, and the seat looked at the largest 16:9 that fits between them and the hand. `reserve` is the foot of
     the stage the hand's tray covers; `gapX` and `gapY` what lies between boards (Table's life counter sits over the crossing). */
  /* THE GAME FITS THE WINDOW (Rob, 2026-10-28, a standing rule: "No scrolling down to see more of the game. The game always fits the visible window"): every board is the
     largest that fits, however small the window; nothing here makes the stage taller than it. */
  const GRID_MARGIN=10, GRID_GAP=12;
  function flatGeometry(width, height, {mode = "table", zoom = 100, pan = null, seats = 4, reserve = 0, top = 0, gapX = GRID_GAP, gapY = GRID_GAP, padL = 0, capB = 0, stripMin = 0, inL = 0, inR = 0, labelH = 0, youArea = "", youScale = 1, edge = GRID_MARGIN} = {}) {
    const w=Math.max(1,width), h=Math.max(1,height), n=clamp(seats,1,4), z=clamp(zoom,60,200)/100;
    const roomW=w-GRID_MARGIN*2-padL-inL-inR, roomH=Math.max(60,h-top-reserve-GRID_MARGIN*2);
    const cx=w/2, cy=top+(h-top-reserve)/2, at={x:clamp(pan?.x,-w,w),y:clamp(pan?.y,-h,h)};
    const view=(x,y)=>[cx+(x-cx-at.x)*z,cy+(y-cy-at.y)*z];
    function surface(r) {
      const [ox,oy]=view(r.x,r.y);
      return {...r,matrix:[z,0,0,0,0,z,0,0,0,0,1,0,ox,oy,0,1],
        quad:[ox,oy,ox+r.width*z,oy,ox+r.width*z,oy+r.height*z,ox,oy+r.height*z]};
    }
    const unproject=(px,py)=>{const x=(px-cx)/z+cx+at.x,y=(py-cy)/z+cy+at.y;return {x,y,world:[x-w/2,0,-(y-h/2)]};};
    const common={flat:true,width:w,height:h,planeHeight:h,base:h,cy:h/2,reach:0,reachMost:0,sx:z,sy:z,angle:0,yaw:0,distance:1,focal:1,screenY:cy,pan:at,center:[cx,cy],
      camera:{eye:[0,1,0],yaw:0,pitch:Math.PI/2,right:[1,0,0],up:[0,0,1],ahead:[0,-1,0]},project:view,unproject,quad:[...view(0,0),...view(w,0),...view(w,h),...view(0,h)]};
    if(mode==="focus"){
      /* The others go across the back, or -- where the window is wide and not tall -- in a column at the right, whichever lets the board looked at be larger. Each is a 16:9
         board of its own with its name above it (labelH). */
      const others=Math.max(0,n-1), x1=GRID_MARGIN+padL+inL, between=others?GRID_GAP:0;
      const rhStrip=others?Math.round(clamp(roomH*.15,64,120)):0, stripH=others?labelH+rhStrip:0;
      let availStrip=Math.max(60,roomH-stripH-between), bigY=top+GRID_MARGIN+stripH+between, bigPad=(bigY>=capB?0:padL)+inL;
      const stripY=top+GRID_MARGIN, wide=(pad)=>w-GRID_MARGIN*2-pad-inR;
      /* the caption (top left) is cleared by the strip, and by the board looked at only where it reaches down to it */
      const bigW=wide(bigPad), bwStrip=Math.max(60,Math.floor(Math.min(bigW,availStrip*16/9)));
      const colW=others?Math.floor(Math.min((w-x1-inR-GRID_MARGIN)*.27,((roomH-(labelH+GRID_GAP)*(others-1))/others-labelH)*16/9)):0;
      const colRoom=w-x1-inR-GRID_MARGIN-colW-between, bwCol=others?Math.max(60,Math.floor(Math.min(colRoom,roomH*16/9))):0;
      if(others&&bwCol>bwStrip*1.08){
        const bh=Math.round(bwCol*9/16), usedW=bwCol+between+colW, left=Math.round(x1+Math.max(0,(w-x1-inR-GRID_MARGIN-usedW)/2));
        const rh=Math.round(colW*9/16), usedH=(labelH+rh)*others+GRID_GAP*(others-1), y0=Math.round(top+GRID_MARGIN+Math.max(0,(roomH-usedH)/2));
        const rear=Array.from({length:others},(_,i)=>surface({x:left+bwCol+between,y:y0+i*(labelH+rh+GRID_GAP)+labelH,width:colW,height:rh}));
        const big={x:left,y:Math.round(top+GRID_MARGIN+Math.max(0,(roomH-bh)/2)),width:bwCol,height:bh};
        return {...common,focus:true,column:true,labelH,rear,front:surface(big),board:{width:bwCol,height:bh,column:colW}};
      }
      const bw=bwStrip, bh=Math.round(bw*9/16);
      const big={x:Math.round(bigPad+GRID_MARGIN+(bigW-bw)/2),y:Math.round(bigY+Math.max(0,(availStrip-bh)/2)),width:bw,height:bh};
      const rw=others?Math.floor(Math.min((roomW-GRID_GAP*(others-1))/others,rhStrip*16/9)):0, rh=Math.round(rw*9/16), usedW=rw*others+GRID_GAP*Math.max(0,others-1), x0=Math.round(padL+inL+GRID_MARGIN+(roomW-usedW)/2);
      const rear=Array.from({length:others},(_,i)=>surface({x:x0+i*(rw+GRID_GAP),y:stripY+labelH,width:rw,height:rh}));
      return {...common,focus:true,labelH,rear,front:surface(big),board:{width:bw,height:bh,strip:stripH}};
    }
    const cols=n===1?1:2, rows=n<=2?1:2;
    /* Where each seat sits, by its area letter (a top left, b top right, c bottom left, d bottom right; three seats put the third across the foot, two side by side). Every
       board is the same 16:9 but yours (youArea), which is youScale larger, and each has its name above it (labelH). */
    const areas={1:["a"],2:["a","b"],3:["a","b","c"],4:["a","b","c","d"]}[n];
    const cell={a:[0,0],b:[1,0],c:n===3?[.5,1]:[0,1],d:[1,1]};
    const kOf=a=>a===youArea?youScale:1;
    const rowK=[...Array(rows).keys()].map(r=>Math.max(...areas.filter(a=>cell[a][1]===r).map(kOf)));
    const k0=Math.max(1,...areas.filter(a=>cell[a][0]===0).map(kOf)), k1=cols>1?Math.max(1,...areas.filter(a=>cell[a][0]===1).map(kOf)):0;
    const unitsW=k0+k1, unitsH=rowK.reduce((x,y)=>x+y,0)*9/16, uW=w-edge*2-inL-inR;
    const fitFor=(left,above)=>Math.max(60,Math.floor(Math.min((uW-left-gapX*(cols-1))/unitsW,(Math.max(60,h-above-reserve-GRID_MARGIN*2)-labelH*rows-gapY*(rows-1))/unitsH)));
    /* The turn box (top left) is cleared the way that leaves the larger boards: they start to its right, or below it. */
    const choices=[{left:padL,up:top,fit:fitFor(padL,top)}];
    if(padL) {const below=Math.max(top,capB); choices.push({left:0,up:below,fit:fitFor(0,below)});}
    const best=choices.reduce((a,c)=>c.fit>a.fit*1.05?c:a,choices[0]);
    const fit=best.fit, shift=best.left, ceil=best.up;
    const bw=fit, bh=Math.round(fit*9/16), colW0=bw*k0, colW1=bw*k1, usedW=colW0+(cols>1?gapX+colW1:0);
    const usedH=Math.round(bh*rowK.reduce((x,y)=>x+y,0))+labelH*rows+gapY*(rows-1);
    const roomW2=uW-shift, roomH2=Math.max(60,h-ceil-reserve-GRID_MARGIN*2);
    const x0=Math.round(shift+inL+edge+(roomW2-usedW)/2), y0=Math.round(ceil+GRID_MARGIN+Math.max(0,(roomH2-usedH)/2));
    const rowTop=[y0];for(let r=1;r<rows;r++)rowTop.push(rowTop[r-1]+labelH+Math.round(bh*rowK[r-1])+gapY);
    const rect=area=>{
      const [c,r]=cell[area]||cell.a, wd=Math.round(bw*kOf(area)), hd=Math.round(wd*9/16);
      const cx=c===.5?x0+usedW/2:c===0?x0+colW0/2:x0+colW0+gapX+colW1/2;
      return {x:Math.round(cx-wd/2),y:rowTop[r]+labelH,width:wd,height:hd};
    };
    return {...common,grid:true,labelH,rear:[],front:null,board:{width:bw,height:bh,gapX,gapY,x:x0,y:y0,cols,rows,usedW,usedH},rect,surface,slot:area=>surface(rect(area)),mid:view(x0+usedW/2,y0+usedH/2)};
  }
  /* The backdrops: each video at up to three heights, 720, 1080 and 1440 lines, never more than its source (environment,
     backdropLines). The list between the markers is written by tools/stage-backdrops.mjs from a folder of videos. */
  /* THE FLOOR EACH BACKDROP SITS ON (Rob, 2026-10-27: "I want true 0 degree angle to the slope of the floor that it sits on ... the
     measured angle of the floor in the video"). The angle the video's floor is seen at, in degrees above the line of sight, near
     where the table stands: read from the horizon and the floor's span in each clip's first frame (a camera of about a 35-degree
     lens). ESTIMATES, to be corrected by eye here; the camera tilt that lies the table flat on it is 90 less this. A backdrop not
     listed (one added by tools/stage-backdrops.mjs) is taken at FLOOR_DEFAULT. */
  const FLOOR_ELEVATION = {"studious-retreat": 16, "japanese-samurai": 13, "dwarven-king": 14, "goblin-stronghold": 21, "golden-fields": 12, "island": 16}, FLOOR_DEFAULT = 15;
  const TILT_LIMIT = 80;
  const floorTilt = id => 90 - (FLOOR_ELEVATION[id] ?? FLOOR_DEFAULT);
  /* backdrops:begin */
  const BACKDROPS=[{id:"dwarven-king",name:"Dwarven King",poster:"assets/environments/dwarven-king-poster.jpg?v=ce56fc00",video:{720:"assets/environments/dwarven-king-720.webm?v=46fb486e",1080:"assets/environments/dwarven-king-1080.webm?v=f69c5735",1440:"assets/environments/dwarven-king-1440.webm?v=3a8afdcd"}},{id:"goblin-stronghold",name:"Goblin Stronghold",poster:"assets/environments/goblin-stronghold-poster.jpg?v=8bbf2db7",video:{720:"assets/environments/goblin-stronghold-720.webm?v=fae2bd14",1080:"assets/environments/goblin-stronghold-1080.webm?v=d706bdee",1440:"assets/environments/goblin-stronghold-1440.webm?v=0f0c9a66"}},{id:"golden-fields",name:"Golden Fields",poster:"assets/environments/golden-fields-poster.jpg?v=696fd3b1",video:{720:"assets/environments/golden-fields-720.webm?v=9e675296",1080:"assets/environments/golden-fields-1080.webm?v=e560ca38",1440:"assets/environments/golden-fields-1440.webm?v=a45b2556"}},{id:"island",name:"Island",poster:"assets/environments/island-poster.jpg?v=aacadaee",video:{720:"assets/environments/island-720.webm?v=55ace2f6"}},{id:"japanese-samurai",name:"Japanese Samurai",poster:"assets/environments/japanese-samurai-poster.jpg?v=fb02fadd",video:{720:"assets/environments/japanese-samurai-720.webm?v=aff25dba",1080:"assets/environments/japanese-samurai-1080.webm?v=7e2c32d4",1440:"assets/environments/japanese-samurai-1440.webm?v=0c57e8dc"}},{id:"studious-retreat",name:"Studious Retreat",poster:"assets/environments/studious-retreat-poster.jpg?v=e8810c3d",video:{720:"assets/environments/studious-retreat-720.webm?v=58ecd5e8",1080:"assets/environments/studious-retreat-1080.webm?v=0ecd0017",1440:"assets/environments/studious-retreat-1440.webm?v=ad87c4e2"}}];
  /* backdrops:end */
  const appearances = Object.freeze({backgrounds: BACKDROPS,
    /* The table designs (Rob, 2026-10-17; ROB-100): the same catalog the Babylon lab builds as 3D objects
       (ui-prototypes/babylon/tables.js). The live Babylon stage uses the prototype's procedural geometry. Older saved choices map on. */
    tables: [
      {id:"study",name:"Study - walnut",slab:0x26170e,top:0x3a2414,edge:0xa98b4a,look:"walnut"},
      {id:"medieval-banded",name:"Medieval oak, iron bands",slab:0x2a1a0f,top:0x5a3f28,edge:0x3a3d44,look:"bands"},
      {id:"colonial-inlay",name:"Colonial lacquered mahogany",slab:0x3a1410,top:0x6b2a1a,edge:0xe4c98a,look:"inlay"},
      {id:"glass-future",name:"Futuristic glass",slab:0x7c8a95,top:0x9fc8d8,edge:0x5fd8ff,look:"glass"},
      {id:"tavern-plank",name:"Tavern planks",slab:0x261710,top:0x795238,edge:0xc8ae77,look:"planks",legacy:"wooden"},
      {id:"felt-card",name:"Card-room felt",slab:0x2b1a12,top:0x1f6b3a,edge:0x3a2418,look:"felt"},
      {id:"stone-dais",name:"Carved stone dais",slab:0x3e4240,top:0x727572,edge:0x9a9d98,look:"speckle",legacy:"stone"},
      {id:"obsidian-glass",name:"Volcanic obsidian",slab:0x0b0a0d,top:0x1a1720,edge:0xff7a2a,look:"ember",legacy:"obsidian"}]});
  const DEFAULT_TABLE = "study";
  /** The design a saved or offered id names: a current id, an older id (wooden, stone, obsidian) or nothing at all. */
  function tableDesign(id) {
    const list = appearances.tables;
    return list.find(x => x.id === id) || list.find(x => x.legacy === id) || list.find(x => x.id === DEFAULT_TABLE);
  }
  function carousel(count, start = 0, limit = 7) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    return Array.from({length:Math.min(n,limit)},(_,i)=>((start+i)%n+n)%n);
  }
  let library=null, current=null;
  /* THE GRAPHICS RESOLUTION (Rob, 2026-10-25: "I also want to increase the game's resolution dramatically. I'd like this
     to be an option in settings"). The table is drawn at `resolution` percent of the screen's own pixels: 150% by default
     (each CSS pixel drawn 1.5 times over on each axis on an ordinary screen, then smoothed down), from 50% for a weak
     graphics card to 200%, never past 4 drawn pixels per CSS pixel. A fact about this device, kept in localStorage like a
     size; set in Settings › Play and in the table's Settings window, where it previews as it is dragged and Cancel puts it
     back. At 175% and over the table's skins are painted at 4096 pixels (crankmagic-stage-tables.js, quality). Until
     2026-10-25 every frame was sized to the stage's CSS pixels, whatever the scaling said: a 1x drawing on every screen. */
  const RES_KEY='cm-stage-resolution', RES_DEFAULT=150, RES_MIN=50, RES_MAX=200;
  const resStep=n=>clamp(Math.round(Number(n)/10)*10,RES_MIN,RES_MAX);
  /* Where the browser draws WebGL in software (no graphics card in use: SwiftShader, llvmpipe), 150% would cost the table
     its frames, so the default there is 100%; a value chosen in Settings is always kept. Asked once a page. */
  let soft=null;
  function softwareGL(){
    if(soft!==null)return soft;soft=false;
    try{const c=document.createElement('canvas'),gl=c.getContext('webgl2')||c.getContext('webgl'),x=gl&&gl.getExtension('WEBGL_debug_renderer_info');
      soft=!!gl&&/swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(x?x.UNMASKED_RENDERER_WEBGL:gl.RENDERER)));gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{/* unknown: a graphics card */}
    return soft;
  }
  const resDefault=()=>softwareGL()?100:RES_DEFAULT;
  function resolution(){let v=null;try{v=localStorage.getItem(RES_KEY);}catch{/* no storage: the default */}return v===null||!Number.isFinite(Number(v))?resDefault():resStep(v);}
  let previewRes=null;
  const resNow=()=>previewRes??resolution();
  const pixelRatio=()=>Math.min(4,(root.devicePixelRatio||1)*resNow()/100);
  /* The skins' size follows the kept setting, not a preview: a drag across 175% does not set the painter going. */
  /* Where the browser draws in software, the machine's processor does everything: by default its skins are painted at
     1024. A resolution chosen in Settings gets the skins it calls for, on any machine. */
  const chosen=()=>{try{return localStorage.getItem(RES_KEY)!==null;}catch{return false;}};
  const quality=()=>!chosen()&&softwareGL()?1:resolution()>=175?3:2;
  function applyResolution(){const s=current;if(s?.engine&&!s.lostContext){s.engine.setHardwareScalingLevel(1/pixelRatio());if(s.box)paint(s);}return resNow();}
  /** Preview a resolution without keeping it (a slider being dragged); null goes back to the one kept. */
  function previewResolution(pct){previewRes=pct===null||pct===undefined?null:resStep(pct);return applyResolution();}
  /** Keep a resolution on this device and draw at it. */
  function setResolution(pct){const n=resStep(pct);previewRes=null;try{localStorage.setItem(RES_KEY,String(n));}catch{/* drawn, not remembered */}applyResolution();if(current)environment(current);return n;}
  /* Its slider, wherever it is drawn (Settings › Play, the table's Settings window): one handler, here. */
  const resWords=(el,n)=>{el.value=String(n);el.setAttribute('aria-valuetext',`${n}%`);const out=el.parentElement?.querySelector('output');if(out)out.textContent=`${n}%`;};
  if(root.document){
    document.addEventListener('input',ev=>{const el=ev.target.closest?.('[data-stage-resolution]');if(el)resWords(el,previewResolution(el.value));});
    document.addEventListener('change',ev=>{const el=ev.target.closest?.('[data-stage-resolution]');if(el)resWords(el,setResolution(el.value));});
  }
  function script(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const el=document.createElement('script');el.src=src;
      el.onload=()=>ready()?resolve():reject(new Error('Table graphics did not initialize.'));
      el.onerror=()=>{el.remove();reject(new Error('Table graphics could not load.'));};document.head.append(el);
    });
  }
  function load() {
    if (!library) library=script('vendor/babylon.js?v=9.30.0',()=>root.BABYLON)
      .then(()=>script('crankmagic-stage-tables.js?v=4',()=>root.CrankTables)).catch(error=>{library=null;throw error;});
    return library;
  }
  /* THE BACKDROP'S RESOLUTION (Rob, 2026-10-26: "Maintain resolution in line with settings selection with 2k at max
     resolution"): the video played is the smallest kept that fills the height it is shown at in drawn pixels -- the
     stage's height, or its width at 16:9 where the stage is wider than that (the video covers the stage, cropped top and
     bottom), times the screen's pixel ratio, times the kept Graphics resolution -- and never more than 1440 lines (2K). A slider being dragged previews the table only; the video follows the setting when it is kept. */
  /* Where the browser draws WebGL in software the video is decoded by the same processor: with no resolution chosen, the
     backdrop stays at 720 lines there (a 1080 one took the table's frames on Actions' runners), as the skins stay at
     1024. A resolution chosen in Settings gets the backdrop it calls for, on any machine. */
  const BACKDROP_MAX=1440, backdropMax=()=>!chosen()&&softwareGL()?720:BACKDROP_MAX;
  function backdropLines(scene,box,pct=resolution()){
    const kept=Object.keys(scene?.video||{}).map(Number).sort((a,b)=>a-b),most=backdropMax();
    if(!kept.length)return null;
    const lines=kept[0]<=most?kept.filter(n=>n<=most):kept.slice(0,1);
    const w=box?.width||root.innerWidth||1280,h=box?.height||root.innerHeight||720;
    const need=Math.max(h,w*9/16)*(root.devicePixelRatio||1)*pct/100;
    return lines.find(n=>n>=need)??lines.at(-1);
  }
  function environment(s) {
    if(s.opts.flat){s.environment?.remove();s.video?.pause();return;}
    const list=appearances.backgrounds,scene=list.find(x=>x.id===s.opts.background)||list[0], board=s.host.closest('.cm-board');
    s.host.classList.toggle('has-video',!!scene?.video);
    /* THE BACKDROP WHOLE (Rob, 2026-10-25: "The lava background shouldn't be so zoomed in by default ... use much more of
       it"): the video is shown whole (crankmagic-stage.css), not cropped to cover a wide stage, and what is left at the
       sides is its own poster, blurred, so the frame's edges melt into it rather than stopping at a bar. */
    if(!board || !scene?.video){s.environment?.remove();s.video?.pause();return;}
    if(!s.environment){
      s.environment=document.createElement('div');s.environment.className='cm-stage-environment';s.environment.setAttribute('aria-hidden','true');
      s.video=document.createElement('video');s.video.muted=true;s.video.defaultMuted=true;s.video.loop=true;s.video.playsInline=true;s.video.preload='metadata';s.video.setAttribute('tabindex','-1');s.environment.append(s.video);
      s.visibility=()=>environment(s);document.addEventListener('visibilitychange',s.visibility);
    }
    const lines=backdropLines(scene,s.box),src=scene.video[lines];
    if(s.video.getAttribute('src')!==src){
      /* A change of height alone keeps the clip's place, so a kept setting or a larger window does not restart it. */
      const at=s.backdrop===scene.id?s.video.currentTime:0;
      s.video.poster=scene.poster;s.video.src=src;s.backdrop=scene.id;s.environment.dataset.lines=String(lines);
      if(at)s.video.addEventListener('loadedmetadata',()=>{s.video.currentTime=at;},{once:true});
      s.environment.style.setProperty('--env-poster',`url("${scene.poster}")`);
    }
    if(s.environment.parentElement!==board)board.prepend(s.environment);
    if(s.opts.reduced || document.hidden)s.video.pause();else if(s.video.paused)s.video.play().catch(()=>{});
  }
  function fail(s, message) {
    if (current!==s) return;
    s.host.dataset.renderer='fallback';s.canvas?.remove();
    s.opts.onError?.(`${message} Your cards and decisions are still available.`);
  }
  function mount(host, opts={}) {
    /* A stage that was a canvas and is now flat (or the other way) is a new stage. */
    if (current && !!current.opts.flat !== !!opts.flat) unmount();
    if (current) {current.host=host;current.opts=opts;if(current.canvas&&current.engine&&!current.lostContext)host.prepend(current.canvas);environment(current);return current.ready;}
    const s=current={host,opts};
    /* FLAT (Table and Focus): the geometry and the DOM surfaces of the 3D view, no canvas, no backdrop video -- the board's own flat ground shows. */
    if (opts.flat) {s.ready=Promise.resolve();s.host.dataset.renderer='flat';s.host.dataset.engine='flat';return s.ready;}
    environment(s);
    s.unhear=root.CrankMotion?.onChange(()=>{s.opts.reduced=root.CrankMotion.reduced();environment(s);});
    s.ready=load().then(()=>{
      if(current!==s)return;
      const B=root.BABYLON,canvas=s.canvas=document.createElement('canvas');
      canvas.className='cm-stage-canvas';canvas.setAttribute('aria-hidden','true');
      s.engine=new B.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,alpha:true},true);
      s.engine.canvasTabIndex=-1;
      canvas.tabIndex=-1; // Babylon defaults to a tab stop; keyboard controls live in the DOM Camera menu.
      s.engine.setHardwareScalingLevel(1/pixelRatio());
      s.scene=new B.Scene(s.engine);s.scene.detachControl();s.scene.clearColor=new B.Color4(0,0,0,0);
      /* Full color, no banding: the painted skins are 32-bit, and a dither of one step hides the bands a smooth gradient of
         light leaves in an 8-bit-per-channel frame. */
      s.scene.imageProcessingConfiguration.ditheringEnabled=true;s.scene.imageProcessingConfiguration.ditheringIntensity=1/255;
      s.camera=new B.FreeCamera('table camera',new B.Vector3(0,40,-30),s.scene);
      s.camera.minZ=.1;s.camera.maxZ=200;s.scene.activeCamera=s.camera;
      const fill=new B.HemisphericLight('sky',new B.Vector3(0,1,0),s.scene);fill.intensity=.95;fill.groundColor=new B.Color3(.12,.09,.07);
      const sun=new B.DirectionalLight('key',new B.Vector3(.3,-1,.5),s.scene);sun.position=new B.Vector3(-8,16,-12);sun.intensity=2;
      s.lost=event=>{event.preventDefault();s.lostContext=true;fail(s,'Graphics interrupted.');};
      s.restored=()=>{if(current===s)s.scene.executeWhenReady(()=>{if(current!==s)return;s.lostContext=false;s.host.prepend(canvas);paint(s);});};
      canvas.addEventListener('webglcontextlost',s.lost);
      s.engine.onContextRestoredObservable.add(s.restored);
      s.host.prepend(canvas);if(s.box)paint(s);
      s.scene.executeWhenReady(()=>{if(current===s&&!s.lostContext)paint(s);});
    }).catch(error=>{s.scene?.dispose();s.engine?.dispose();s.engine=null;fail(s,error.message);});
    return s.ready;
  }
  /* SHARP CARDS ON THE MATS (Rob, 2026-10-25: "Note how blurry the cards on the mat are as compared to cards in the hand.
     When I zoom in, the resolution should be sharp and high enough that the text can become easily readable on the
     board."). A mat is DOM, laid out flat and set on the table by a perspective matrix, and the browser paints such a
     layer at its own CSS size and then magnifies that picture: a card near the camera, or with the camera zoomed in, was a
     blown-up thumbnail (tests/board-card-sharpness.mjs measured 15% of its picture's fine detail, the hand 53%). Each mat
     is now laid out `k` times larger -- its content zoomed by k (crankmagic-stage.css, --mat-zoom) -- and its matrix
     shrinks it back by k, so it is painted with k times the pixels a side. k is the most the camera magnifies the mat
     (the longest edge of its drawn quad over its own length) times the Graphics resolution (150% by default), rounded
     up, from 2 to 4; the browser already paints for the screen's own pixel density. A mat drawn no larger than itself
     (the opponents' at rest) stays at 1: painting it larger only to shrink it would lose detail. */
  /* How much a mat is magnified on screen: above 1 it is nearer than its layout size, below 1 the perspective has shrunk it. */
  function magnification(r){
    const q=r.quad,edge=(a,b)=>Math.hypot(q[b]-q[a],q[b+1]-q[a+1]);
    return Math.max(edge(0,2)/r.width,edge(6,4)/r.width,edge(0,6)/r.height,edge(2,4)/r.height);
  }
  /* How much of its size text on a mat keeps: the smaller of how far the width and the height have been drawn down (the tilt squashes the
     height, the perspective the width), never above 1. */
  function legibility(r){
    const q=r.quad,edge=(a,b)=>Math.hypot(q[b]-q[a],q[b+1]-q[a+1]);
    return Math.min((edge(0,2)+edge(6,4))/2/r.width,(edge(0,6)+edge(2,4))/2/r.height);
  }
  function sharpness(r){
    const mag=magnification(r);
    return mag<=1.05?1:clamp(Math.ceil(mag*resNow()/100-.05),2,4);
  }
  /* k changes only once the camera has settled: laying a mat out again mid-motion would cost the motion its frames. */
  function position(el,r) {
    if(!el||!r)return;
    const want=sharpness(r),k=Number(el.dataset.sharp)||want,m=r.matrix.map((v,i)=>i<8?v/k:v);
    clearTimeout(el.sharpLater);
    if(want!==k)el.sharpLater=setTimeout(()=>{if(!el.isConnected||!current?.box)return;el.dataset.sharp=String(want);place(current);},250);
    Object.assign(el.style,{left:'0px',top:'0px',width:`${r.width*k}px`,height:`${r.height*k}px`,transformOrigin:'0 0',transform:`matrix3d(${m.join(',')})`});
    el.style.setProperty('--mat-zoom',String(k));el.style.setProperty('--mat-mag',String(Math.max(.4,Math.min(1,legibility(r)))));el.dataset.sharp=String(k);
  }
  function layout(box,opts={}) {
    if(!current)return;
    const s=current;s.box={width:box.width,height:box.height};s.opts={...s.opts,...opts};environment(s);
    return place(s);
  }
  /* The DOM surfaces and the Babylon camera, from one geometry: at every layout, and at every frame of a camera motion. */
  function place(s) {
    if(s.opts.flat)return placeFlat(s);
    for(const el of s.host.querySelectorAll('.cm-stage-slot,.cm-stage-rear')){el.removeAttribute('data-tiny');el.removeAttribute('data-tight');}   /* the flat views' marks do not follow a board into 3D */
    root.CrankTables?.hold?.();
    const g=geometry(s.box.width,s.box.height,{...s.opts,look:s.pose,seats:Math.max(0,(s.opts.mats||[]).length-1)});
    s.view=g;
    for(const [i,el] of [...s.host.querySelectorAll('.cm-stage-rear')].entries()) {position(el,g.rear[i]);if(g.rear[i])el.style.setProperty('--rear-card',`${Math.max(18,(g.rear[i].height-28)/4.8)}px`);}
    position(s.host.querySelector('.cm-stage-front'),g.front);
    s.host.style.setProperty('--stage-card',`${Math.floor(clamp((g.front.height-64)/5.5,24,112)*1.3*(1+.8*(clamp(s.opts.cards??100,70,200)-100)/100))}px`);
    if(s.engine&&!s.lostContext){if(s.host.firstChild!==s.canvas)s.host.prepend(s.canvas);paint(s,g);}return g;
  }
  /* The flat stage (Table and Focus): the boards laid out by flatGeometry, set by one matrix each. A board's own layout is computed at the size it is drawn (--row-w, --mat-w). */
  function placeFlat(s) {
    const o=s.opts, cards=1+.8*(clamp(o.cards??100,70,200)-100)/100, seatsN=(o.mats||[]).length;
    const g=flatGeometry(s.box.width,s.box.height,{mode:o.grid?"table":"focus",zoom:o.zoom,pan:o.pan,seats:seatsN,reserve:o.reserve||0,top:o.top||0,gapX:o.gapX,gapY:o.gapY,padL:o.padL||0,capB:o.capB||0,stripMin:o.stripMin||0,inL:o.inL||0,inR:o.inR||0,labelH:o.labelH||0,youArea:o.youArea||"",youScale:o.youScale||1,edge:o.edge??GRID_MARGIN});
    s.view=g;
    const hudScale=parseFloat(getComputedStyle(s.host).getPropertyValue('--hud-scale'))||1;   /* the text size the person chose: a badge needs room for it */
    const size=(el,r)=>{
      el.style.setProperty('--row-w',`${r.width}px`);el.style.setProperty('--mat-w',`${r.width}px`);el.style.setProperty('--mat-h',`${r.height}px`);el.style.setProperty('--board-scale',String(cards));
      el.style.setProperty('--rear-card',`${Math.max(12,(r.height-16)/3.6)}px`);   /* a rear board is a whole mat in its own 16:9: two card rows and the divider stand in it, none cut off */
      /* A board's cards are no larger than its two pairs of piles can stand in its height: a pile is a card (5:7) and its caption, and Focus keeps a band of History between the pairs. */
      const head=el.querySelector('.cm-mat-head')?.offsetHeight||0, band=el.querySelector('.cm-board-band')?64:0;
      /* ...nor larger than the field and the lands can each stand a row of in what is left (two rows of 1.72 cards, and their labels, about 84px). */
      const chip=el.querySelector('.cm-board-chip')?.offsetHeight||0, piles=Math.floor(((r.height-head-14-band-chip)/2-26)/1.4), rows=Math.floor((r.height-head-24-84-chip)/3.44);
      /* A board this small has no room for its zones' captions: the cards and piles keep the height. */
      el.toggleAttribute('data-tight',r.height<200);
      el.style.setProperty("--bc-cap",`${Math.max(16,Math.min(piles,rows)*Math.min(cards,1))*Math.max(cards,1)}px`);   /* the cap is the size that fits; Camera's Cards scales it either way (larger cards scroll in their zone) */
      /* A card under 30px wide (times the text size chosen) on the page has no room for a badge at the text floor: the board says so, and its badges stand down (crankmagic-stage.css). */
      const smallest=Math.min(...[...el.querySelectorAll('.cm-bcard')].map(c=>c.offsetWidth)),shown=el.offsetWidth?el.getBoundingClientRect().width/el.offsetWidth:1;el.toggleAttribute('data-tiny',smallest*shown<30*hudScale);   /* as drawn: the board's matrix scales it */
    };
    if(g.grid){
      for(const el of s.host.querySelectorAll('.cm-stage-slot')){const r=g.slot(el.dataset.area);position(el,r);size(el,r);}
      s.host.style.setProperty('--mid-x',`${g.mid[0]}px`);s.host.style.setProperty('--mid-y',`${g.mid[1]}px`);
    } else {
      for(const [i,el] of [...s.host.querySelectorAll('.cm-stage-rear')].entries()){if(g.rear[i]){position(el,g.rear[i]);size(el,g.rear[i]);}}
      const front=s.host.querySelector('.cm-stage-slot');if(front){position(front,g.front);size(front,g.front);}
    }
    return g;
  }
  function paint(s,given) {
    if(current!==s||!s.engine||!s.box)return;
    const B=root.BABYLON,g=given||geometry(s.box.width,s.box.height,{...s.opts,look:s.pose}),unit=50;
    /* Drawn at the resolution's pixels, shown at the stage's CSS size (crankmagic-stage.css sizes the canvas). */
    const ratio=pixelRatio();s.engine.setSize(Math.round(g.width*ratio),Math.round(g.height*ratio));
    const q=quality(),design=tableDesign(s.opts.table).id,key=[design,g.width,g.planeHeight,q].join(':');
    /* While the person's side is being stretched (opts.live) the table already built is stretched to the new length,
       not built again at every move; it is built at its length when the stretch is let go. */
    if(s.tableKey!==key&&!(s.opts.live&&s.table&&s.tableKey.startsWith(`${design}:${g.width}:`))){
      s.table?.dispose();
      /* Its skins are painted off the page and arrive after it stands (crankmagic-stage-paint.js): drawn again as each does. */
      s.table=root.CrankTables.build(B,s.scene,design,{width:g.width/unit,depth:g.planeHeight/unit,quality:q,
        onPainted:()=>{if(current===s&&s.engine&&!s.lostContext)s.scene.executeWhenReady(()=>{if(current===s&&!s.lostContext)s.scene.render();});}});
      s.table.root.position.y=.225;s.tableKey=key;s.tableDepth=g.planeHeight/unit;s.builds=(s.builds||0)+1;
    }
    // Its center is the plane's: half the added length nearer the viewer than the resting center.
    const near=g.reach/2/unit;
    s.table.root.scaling.z=g.planeHeight/unit/s.tableDepth;s.table.root.position.x=-Math.sin(g.yaw)*near;s.table.root.position.z=-Math.cos(g.yaw)*near;
    s.table.root.rotation.y=g.yaw;
    // The geometry's own camera in Babylon's units: its eye, and its turn and pitch as Babylon's yaw and pitch, no roll.
    const {eye,yaw,pitch}=g.camera;
    s.camera.position.set(eye[0]/unit,eye[1]/unit,eye[2]/unit);s.camera.rotation.set(pitch,yaw,0);
    const projection=B.Matrix.PerspectiveFovLH(2*Math.atan(g.height/(2*g.focal)),g.width/g.height,.1,200);
    projection.m[9]=.14; // center the tabletop at 43% of the available height, above the hand
    s.camera.freezeProjectionMatrix(projection);s.scene.render();
    s.geometry=g;s.host.dataset.renderer='webgl';s.host.dataset.engine='babylon';s.opts.onReady?.();
  }
  /* THE HEAD LOOK (Rob, 2026-10-25): "If I wanted to look at cards on the right side of my board in real life, I would
     turn my head slightly to center that section of the cards in my view, then I would tilt my shoulders slightly in that
     direction AND slightly tilt my head down ... then I would look down slightly to read." The place held is P on the
     table. u is its offset across the board from the centerline (of the half width), v its depth from where the camera
     looks at rest (of the half depth), and r = min(1, hypot(u, v)) how far out it is. Three motions overlap as a person's
     do, each eased in and out (cubic):
       - the head turns toward P first (0-60% of the time);
       - the shoulders lean toward it (20-80%): the eye moves 30% of the way across to P and a quarter of the way in
         depth, and drops by 6% of its height at r = 1, lowering the angle onto that part of the table;
       - the head pitches down (40-100%), so P ends at the center of the view, and leans in to read (60-100%): the eye
         goes 6% + 10%·r of the rest of the way toward P.
     It takes 0.25 s + 0.40 s·r, so the farthest places take about 0.65 s. Letting go runs the same motion backward from
     wherever it has reached -- a release halfway takes half the time -- and ends exactly at the resting camera. Reduced
     motion (CrankMotion) jumps to either end.
     SOFTER, A GLANCE (Rob, 2026-10-25: "softer, about half"): every part of the motion -- the turn, the lean, the pitch and
     the read -- is `LOOK.strength` (one half) of what would center P exactly, so P ends halfway to the center of the view.
     The timing is unchanged. Admin › General carries the strength on this device.
     UP, THEN OVER, THEN CLOSER (Rob, 2026-10-26: "the camera should move (not look) up slightly as a head would when getting
     ready to lean over, then the zoom that occurs when looking down at the end should be a bit more, maybe 25-35% more"):
       - the eye rises first, straight up, without turning to look: 2% of its height over the table at r = 1 (1% at the
         centerline), in by 35% of the time and given back by 90% as the shoulders carry it over and down;
       - the read goes 30% farther toward P (`readBy`), so the place held is drawn about a third larger at the end.
     THE HEAD TURNS WITH THE POINTER (Rob, 2026-10-26: "if I move the mouse while still holding ... it should 'turn the
     head', the camera with the direction and distance of the mouse from the original place clicked"): while the look is
     held, the pointer's offset from the place pressed turns the head by the angle that offset spans in the view (atan of
     the offset over the focal length), across for yaw and down for pitch, so what was under the pointer comes toward where
     it was pressed. It follows with a head's lag (`steerMs`, 80 ms), never past 34 degrees aside or the near horizon above,
     nor past straight down; letting go takes it home with the rest of the motion. */
  const LOOK={turn:[0,.6],rise:[0,.35,.9],lean:[.2,.8],pitch:[.4,1],read:[.6,1],strength:.5,riseBy:.02,readBy:1.3,steerMs:80,steerYaw:.6,steerLow:.17,forward:.12,dropBy:.06};
  /* Admin › General carries the strength (0 to 1, kept on the device as cm-look-strength); unset, the half Rob chose. */
  const lookStrength=()=>{try{const v=localStorage.getItem('cm-look-strength'),n=Number(v);return v!==null&&v!==''&&n>=0&&n<=1?n:LOOK.strength;}catch{return LOOK.strength;}};
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const phase=(t,[a,b])=>ease(clamp((t-a)/(b-a),0,1));
  function aim(g,P) {
    const eye=g.camera.eye, u=clamp((P[0]-g.pan.x)/(g.width/2),-1,1), v=clamp((-P[2]-g.pan.y)/(g.base/2),-1,1), r=Math.min(1,Math.hypot(u,v));
    /* LEANING OVER THE TABLE (Rob, 2026-10-28: "the camera should move forward over the table a bit, leaning over the table, to look down at the held spot"):
       the eye goes forward toward the place held, whatever side of the table it is on, by `LOOK.forward` of the way (more for a far place), and drops with it. */
    const lean=[.3*(P[0]-eye[0]),-(.06+LOOK.dropBy*r)*eye[1],LOOK.forward*(.5+.5*r)*(P[2]-eye[2])], leaned=eye.map((n,i)=>n+lean[i]);
    const k=(.06+.1*r)*LOOK.readBy, read=leaned.map((n,i)=>k*(P[i]-n)), d=P.map((n,i)=>n-leaned[i]-read[i]);
    const f=lookStrength();
    return {lean:lean.map(n=>n*f),read:read.map(n=>n*f),yaw:f*Math.atan2(d[0],d[2]),pitch:f*(Math.atan2(-d[1],Math.hypot(d[0],d[2]))-g.camera.pitch),rise:LOOK.riseBy*eye[1]*(.5+.5*r),r,ms:250+400*r,point:P};
  }
  const mix=(a,b,k)=>({...b,lean:a.lean.map((n,i)=>n+(b.lean[i]-n)*k),read:a.read.map((n,i)=>n+(b.read[i]-n)*k),yaw:a.yaw+(b.yaw-a.yaw)*k,pitch:a.pitch+(b.pitch-a.pitch)*k,rise:a.rise+(b.rise-a.rise)*k,ms:a.ms+(b.ms-a.ms)*k});
  // A new hold while the last one is still easing back turns toward the new place over 150 ms, rather than jumping.
  const aimNow=(L,now)=>L.from&&now-L.since<150?mix(L.from,L.aim,ease(clamp((now-L.since)/150,0,1))):L.aim;
  // The rise: up by 35% of the time, back by 90%.
  const lift=t=>phase(t,[LOOK.rise[0],LOOK.rise[1]])-phase(t,[LOOK.rise[1],LOOK.rise[2]]);
  function pose(a,t,turned=null) {
    const l=phase(t,LOOK.lean),k=phase(t,LOOK.read),h=ease(clamp(t,0,1));
    return {x:a.lean[0]*l+a.read[0]*k,y:a.lean[1]*l+a.read[1]*k+(a.rise||0)*lift(t),z:a.lean[2]*l+a.read[2]*k,
      yaw:a.yaw*phase(t,LOOK.turn)+(turned?.yaw||0)*h,pitch:a.pitch*phase(t,LOOK.pitch)+(turned?.pitch||0)*h};
  }
  /** The head look's pose at progress t toward a table point (world), for a geometry at rest: what the motion draws. */
  const headPose=(g,world,t,turned=null)=>pose(aim(g,world),t,turned);
  function tick(s,now) {
    const L=s.look;if(!L||current!==s)return;
    L.raf=null;
    const dt=Math.max(0,now-L.last),a=aimNow(L,now);L.last=Math.max(L.last,now);
    L.t=s.opts.reduced?(L.dir>0?1:0):clamp(L.t+L.dir*dt/a.ms,0,1);
    /* The turn the pointer asks for, followed with a head's lag. */
    if(L.steer){const q=s.opts.reduced?1:1-Math.exp(-dt/LOOK.steerMs),w=L.turned;L.turned={yaw:w.yaw+(L.steer.yaw-w.yaw)*q,pitch:w.pitch+(L.steer.pitch-w.pitch)*q};}
    s.pose=L.t>0?pose(a,L.t,L.turned):null;
    if(s.box)place(s);
    if(L.t===0&&L.dir<0){s.look=null;return;}
    const turning=L.steer&&(Math.abs(L.steer.yaw-L.turned.yaw)>1e-6||Math.abs(L.steer.pitch-L.turned.pitch)>1e-6);
    if(L.t===1&&L.dir>0&&!(L.from&&now-L.since<150)&&!turning)return;
    L.raf=requestAnimationFrame(n=>tick(s,n));
  }
  /** Start the head look at a viewport point. Returns the motion's length and reach, or null off the table's plane. */
  function look(clientX,clientY) {
    const s=current;if(!s?.box||s.opts.flat)return null;
    const box=s.host.getBoundingClientRect(),g=geometry(s.box.width,s.box.height,{...s.opts,look:null});
    const hit=g.unproject(clientX-box.left,clientY-box.top);if(!hit)return null;
    const target=aim(g,hit.world),now=performance.now(),L=s.look;
    // The clock starts now, not at the next frame; a motion still running keeps its frames.
    s.look=L?{...L,from:aimNow(L,now),since:now,aim:target,dir:1,last:now,started:now,back:null}:{aim:target,t:0,dir:1,from:null,since:now,last:now,started:now,back:null};
    if(s.opts.reduced)tick(s,now);else if(!s.look.raf)s.look.raf=requestAnimationFrame(n=>tick(s,n));
    return {ms:target.ms,r:target.r,point:hit};
  }
  /** While held: turn the head by the pointer's offset (px) from the place pressed. */
  function steer(dx,dy) {
    const s=current,L=s?.look;if(!L||L.dir<0||!s.box)return;
    const g=geometry(s.box.width,s.box.height,{...s.opts,look:null}),down=g.camera.pitch+L.aim.pitch;
    L.steer={yaw:clamp(Math.atan2(dx,g.focal),-LOOK.steerYaw,LOOK.steerYaw),pitch:clamp(Math.atan2(dy,g.focal),LOOK.steerLow-down,Math.PI/2-down)};
    L.turned??={yaw:0,pitch:0};
    const now=performance.now();
    if(s.opts.reduced)tick(s,now);else if(!L.raf){L.last=Math.max(L.last,now);L.raf=requestAnimationFrame(n=>tick(s,n));}
  }
  /** Let go: the same motion backward, from wherever it has reached. */
  function unlook() {
    const s=current,L=s?.look;if(!L)return;
    const now=performance.now();L.dir=-1;L.last=now;L.back={at:now,t:L.t};
    if(s.opts.reduced)tick(s,now);else if(!L.raf)L.raf=requestAnimationFrame(n=>tick(s,n));
  }
  /** The table point under a viewport point as the stage is drawn now: plane pixels, and the world point. */
  function pick(clientX,clientY) {
    const s=current;if(!s?.view)return null;
    const box=s.host.getBoundingClientRect();return s.view.unproject(clientX-box.left,clientY-box.top);
  }
  const planeOf=(g,P)=>{const c=Math.cos(g.yaw),q=Math.sin(g.yaw),Y=-P[2];return [c*P[0]+q*Y+g.width/2,-q*P[0]+c*Y+g.cy];};
  // Presentation diagnostics only: no cards, decisions, credentials, or room state.
  function diagnostics() {
    const s=current;if(s?.opts.flat)return {renderer:'flat',grid:!!s.view?.grid,focus:!!s.view?.focus,board:s.view?.board||null,pan:s.view?{...s.view.pan}:null,view:s.view};
    if(!s?.engine||!s.geometry)return {renderer:s?.host.dataset.renderer||'unmounted'};
    const B=root.BABYLON,g=s.geometry,world=s.table.root.computeWorldMatrix(true);
    /* The corners of the table top as it was built (its own size, before any stretch), through the transform Babylon
       draws it with: where the mesh really is, against where the DOM's plane is. */
    const W=g.width/100,D=s.tableDepth/2;
    const corners=[[-W,D],[W,D],[W,-D],[-W,-D]].flatMap(([x,z])=>{
      const p=B.Vector3.Project(new B.Vector3(x,-.225,z),world,s.scene.getTransformMatrix(),new B.Viewport(0,0,g.width,g.height));return [p.x,p.y];
    });
    /* The projection the DOM draws: its transform after the scale(k) of a mat laid out k times larger (sharpness). */
    const front=s.host.querySelector('.cm-stage-front'),k=Number(front?.dataset.sharp||1),shown=front?Array.from(new DOMMatrix(getComputedStyle(front).transform).toFloat64Array()).map((v,i)=>i<8?v*k:v):null;
    return {renderer:'babylon',meshes:s.scene.meshes.length,parts:[...new Set(s.table.parts.map(p=>p.metadata.part))],materials:s.scene.materials.length,textures:s.scene.textures.length,quad:corners,domQuad:g.quad,
      camera:{position:s.camera.position.asArray(),rotation:s.camera.rotation.asArray()},pan:{...g.pan},
      look:s.look?{t:s.look.t,dir:s.look.dir,ms:s.look.aim.ms,r:s.look.aim.r,clock:s.look.last,started:s.look.started,back:s.look.back,at:g.project(...planeOf(g,s.look.aim.point)),
        rise:s.look.aim.rise,steer:s.look.steer?{...s.look.steer}:null,turned:s.look.turned?{...s.look.turned}:null}:null,
      center:[g.width/2,g.screenY],front:{shown,matrix:g.front.matrix,height:g.front.height,quad:g.front.quad},rear:g.rear.map(r=>({height:r.height,width:r.width})),
      length:{base:g.base,reach:g.reach,most:g.reachMost,plane:g.planeHeight,built:s.tableDepth*50,scale:s.table.root.scaling.z,builds:s.builds},
      backdrop:{id:s.backdrop??null,lines:s.environment?.dataset.lines?Number(s.environment.dataset.lines):null,src:s.video?.getAttribute('src')??null},
      graphics:{resolution:resNow(),software:softwareGL(),ratio:pixelRatio(),canvas:[s.canvas.width,s.canvas.height],css:[s.canvas.clientWidth,s.canvas.clientHeight],dither:s.scene.imageProcessingConfiguration.ditheringEnabled,
        design:s.table.design.id,size:s.table.size,painted:s.table.painted,inked:s.table.parts.filter(p=>p.edgesRenderer).length,
        textures:s.table.textures.map(t=>({name:t.name,width:t.metadata.width,height:t.metadata.height,colors:t.metadata.colors,bits:t.format===B.Engine.TEXTUREFORMAT_RGBA&&t.textureType===B.Engine.TEXTURETYPE_UNSIGNED_BYTE?32:0,mips:!t.noMipmap,aniso:t.anisotropicFilteringLevel})),
        bumps:s.table.parts.filter(p=>p.material?.bumpTexture).length,parts:s.table.parts.length}};
  }
  function unmount() {
    const s=current;current=null;if(!s)return;
    if(s.look?.raf)cancelAnimationFrame(s.look.raf);
    s.unhear?.();s.video?.pause();s.environment?.remove();if(s.visibility)document.removeEventListener('visibilitychange',s.visibility);
    if(s.canvas){s.canvas.removeEventListener('webglcontextlost',s.lost);s.canvas.remove();}
    s.scene?.dispose();s.engine?.dispose();
  }
  root.CrankStage=Object.freeze({geometry,flatGeometry,floorTilt,TILT_LIMIT,carousel,appearances,backdropLines,tableDesign,DEFAULT_TABLE,mount,layout,unmount,diagnostics,look,steer,unlook,headPose,pick,
    resolution,previewResolution,setResolution,RESOLUTION:Object.freeze({key:RES_KEY,min:RES_MIN,max:RES_MAX,default:RES_DEFAULT})});
})(globalThis);
