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
  function geometry(width, height, {tilt = 40, zoom = 100, seats = 3, rotation = 0, pan = null, look = null, reach = 0} = {}) {
    const w=Math.max(1,width), h=Math.max(1,height), angle=clamp(tilt,0,60)*Math.PI/180;
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
    const margin=22,gap=20,count = clamp(seats,1,3),rearY=18,rearH=base*.24,rearW=(w-margin*2-gap*(count-1))/count;
    const rear=Array.from({length:seats},(_,i)=>surface({x:margin+i*(rearW+gap),y:rearY,width:rearW,height:rearH}));
    const frontY=rearY+rearH+22,front=surface({x:margin,y:frontY,width:w-margin*2,height:planeHeight-frontY-18});
    return {width:w,height:h,planeHeight,base,cy,reach:reachPx,reachMost,sx,sy,ox,oy,angle,yaw,distance,focal,screenY,pan:at,
      camera:{eye,yaw:turn,pitch,right,up,ahead},project,unproject,quad,rear,front};
  }
  const appearances = Object.freeze({backgrounds: [{id:"volcano",name:"Volcano",video:"assets/environments/volcano.webm?v=1",poster:"assets/environments/volcano-poster.jpg?v=1"},{id:"forest",name:"Forest"},{id:"clouds",name:"Cloud sea"}],
    /* The table designs (Rob, 2026-10-17; ROB-100): the same catalog the Babylon lab builds as 3D objects
       (ui-prototypes/babylon/tables.js). The live Babylon stage uses the prototype's procedural geometry. Older saved choices map on. */
    tables: [
      {id:"medieval-banded",name:"Medieval oak, iron bands",slab:0x2a1a0f,top:0x5a3f28,edge:0x3a3d44,look:"bands"},
      {id:"colonial-inlay",name:"Colonial lacquered mahogany",slab:0x3a1410,top:0x6b2a1a,edge:0xe4c98a,look:"inlay"},
      {id:"glass-future",name:"Futuristic glass",slab:0x7c8a95,top:0x9fc8d8,edge:0x5fd8ff,look:"glass"},
      {id:"tavern-plank",name:"Tavern planks",slab:0x261710,top:0x795238,edge:0xc8ae77,look:"planks",legacy:"wooden"},
      {id:"felt-card",name:"Card-room felt",slab:0x2b1a12,top:0x1f6b3a,edge:0x3a2418,look:"felt"},
      {id:"stone-dais",name:"Carved stone dais",slab:0x3e4240,top:0x727572,edge:0x9a9d98,look:"speckle",legacy:"stone"},
      {id:"obsidian-glass",name:"Volcanic obsidian",slab:0x0b0a0d,top:0x1a1720,edge:0xff7a2a,look:"ember",legacy:"obsidian"}]});
  const DEFAULT_TABLE = "medieval-banded";
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
  function setResolution(pct){const n=resStep(pct);previewRes=null;try{localStorage.setItem(RES_KEY,String(n));}catch{/* drawn, not remembered */}applyResolution();return n;}
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
      .then(()=>script('crankmagic-stage-tables.js?v=3',()=>root.CrankTables)).catch(error=>{library=null;throw error;});
    return library;
  }
  function environment(s) {
    const scene=appearances.backgrounds.find(x=>x.id===(s.opts.background || 'volcano')), board=s.host.closest('.cm-board');
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
    if(s.video.getAttribute('src')!==scene.video){s.video.poster=scene.poster;s.video.src=scene.video;s.environment.style.setProperty('--env-poster',`url("${scene.poster}")`);}
    if(s.environment.parentElement!==board)board.prepend(s.environment);
    if(s.opts.reduced || document.hidden)s.video.pause();else if(s.video.paused)s.video.play().catch(()=>{});
  }
  function fail(s, message) {
    if (current!==s) return;
    s.host.dataset.renderer='fallback';s.canvas?.remove();
    s.opts.onError?.(`${message} Your cards and decisions are still available.`);
  }
  function mount(host, opts={}) {
    if (current) {current.host=host;current.opts=opts;if(current.canvas&&current.engine&&!current.lostContext)host.prepend(current.canvas);environment(current);return current.ready;}
    const s=current={host,opts};environment(s);
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
  function sharpness(r){
    const q=r.quad,edge=(a,b)=>Math.hypot(q[b]-q[a],q[b+1]-q[a+1]);
    const mag=Math.max(edge(0,2)/r.width,edge(6,4)/r.width,edge(0,6)/r.height,edge(2,4)/r.height);
    return mag<=1.05?1:clamp(Math.ceil(mag*resNow()/100-.05),2,4);
  }
  /* k changes only once the camera has settled: laying a mat out again mid-motion would cost the motion its frames. */
  function position(el,r) {
    if(!el||!r)return;
    const want=sharpness(r),k=Number(el.dataset.sharp)||want,m=r.matrix.map((v,i)=>i<8?v/k:v);
    clearTimeout(el.sharpLater);
    if(want!==k)el.sharpLater=setTimeout(()=>{if(!el.isConnected||!current?.box)return;el.dataset.sharp=String(want);place(current);},250);
    Object.assign(el.style,{left:'0px',top:'0px',width:`${r.width*k}px`,height:`${r.height*k}px`,transformOrigin:'0 0',transform:`matrix3d(${m.join(',')})`});
    el.style.setProperty('--mat-zoom',String(k));el.dataset.sharp=String(k);
  }
  function layout(box,opts={}) {
    if(!current)return;
    const s=current;s.box={width:box.width,height:box.height};s.opts={...s.opts,...opts};environment(s);
    return place(s);
  }
  /* The DOM surfaces and the Babylon camera, from one geometry: at every layout, and at every frame of a camera motion. */
  function place(s) {
    root.CrankTables?.hold?.();
    const g=geometry(s.box.width,s.box.height,{...s.opts,look:s.pose,seats:Math.max(0,(s.opts.mats||[]).length-1)});
    s.view=g;
    for(const [i,el] of [...s.host.querySelectorAll('.cm-stage-rear')].entries()) {position(el,g.rear[i]);if(g.rear[i])el.style.setProperty('--rear-card',`${Math.max(18,(g.rear[i].height-28)/4.8)}px`);}
    position(s.host.querySelector('.cm-stage-front'),g.front);
    s.host.style.setProperty('--stage-card',`${Math.floor(clamp((g.front.height-64)/5.5,24,112)*1.3*(1+.8*(clamp(s.opts.cards??100,70,200)-100)/100))}px`);
    if(s.engine&&!s.lostContext){if(s.host.firstChild!==s.canvas)s.host.prepend(s.canvas);paint(s,g);}return g;
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
     The timing is unchanged. The admin panel is to carry this and its kin as settings. */
  const LOOK={turn:[0,.6],lean:[.2,.8],pitch:[.4,1],read:[.6,1],strength:.5};
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const phase=(t,[a,b])=>ease(clamp((t-a)/(b-a),0,1));
  function aim(g,P) {
    const eye=g.camera.eye, u=clamp((P[0]-g.pan.x)/(g.width/2),-1,1), v=clamp((-P[2]-g.pan.y)/(g.base/2),-1,1), r=Math.min(1,Math.hypot(u,v));
    const lean=[.3*(P[0]-eye[0]),-.06*eye[1]*r,.25*(P[2]+g.pan.y)], leaned=eye.map((n,i)=>n+lean[i]);
    const k=.06+.1*r, read=leaned.map((n,i)=>k*(P[i]-n)), d=P.map((n,i)=>n-leaned[i]-read[i]);
    const f=LOOK.strength;
    return {lean:lean.map(n=>n*f),read:read.map(n=>n*f),yaw:f*Math.atan2(d[0],d[2]),pitch:f*(Math.atan2(-d[1],Math.hypot(d[0],d[2]))-g.camera.pitch),r,ms:250+400*r,point:P};
  }
  const mix=(a,b,k)=>({...b,lean:a.lean.map((n,i)=>n+(b.lean[i]-n)*k),read:a.read.map((n,i)=>n+(b.read[i]-n)*k),yaw:a.yaw+(b.yaw-a.yaw)*k,pitch:a.pitch+(b.pitch-a.pitch)*k,ms:a.ms+(b.ms-a.ms)*k});
  // A new hold while the last one is still easing back turns toward the new place over 150 ms, rather than jumping.
  const aimNow=(L,now)=>L.from&&now-L.since<150?mix(L.from,L.aim,ease(clamp((now-L.since)/150,0,1))):L.aim;
  function pose(a,t) {
    const l=phase(t,LOOK.lean),k=phase(t,LOOK.read);
    return {x:a.lean[0]*l+a.read[0]*k,y:a.lean[1]*l+a.read[1]*k,z:a.lean[2]*l+a.read[2]*k,yaw:a.yaw*phase(t,LOOK.turn),pitch:a.pitch*phase(t,LOOK.pitch)};
  }
  function tick(s,now) {
    const L=s.look;if(!L||current!==s)return;
    L.raf=null;
    const dt=Math.max(0,now-L.last),a=aimNow(L,now);L.last=Math.max(L.last,now);
    L.t=s.opts.reduced?(L.dir>0?1:0):clamp(L.t+L.dir*dt/a.ms,0,1);
    s.pose=L.t>0?pose(a,L.t):null;
    if(s.box)place(s);
    if(L.t===0&&L.dir<0){s.look=null;return;}
    if(L.t===1&&L.dir>0&&!(L.from&&now-L.since<150))return;
    L.raf=requestAnimationFrame(n=>tick(s,n));
  }
  /** Start the head look at a viewport point. Returns the motion's length and reach, or null off the table's plane. */
  function look(clientX,clientY) {
    const s=current;if(!s?.box)return null;
    const box=s.host.getBoundingClientRect(),g=geometry(s.box.width,s.box.height,{...s.opts,look:null});
    const hit=g.unproject(clientX-box.left,clientY-box.top);if(!hit)return null;
    const target=aim(g,hit.world),now=performance.now(),L=s.look;
    // The clock starts now, not at the next frame; a motion still running keeps its frames.
    s.look=L?{...L,from:aimNow(L,now),since:now,aim:target,dir:1,last:now,started:now,back:null}:{aim:target,t:0,dir:1,from:null,since:now,last:now,started:now,back:null};
    if(s.opts.reduced)tick(s,now);else if(!s.look.raf)s.look.raf=requestAnimationFrame(n=>tick(s,n));
    return {ms:target.ms,r:target.r,point:hit};
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
    const s=current;if(!s?.engine||!s.geometry)return {renderer:s?.host.dataset.renderer||'unmounted'};
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
      look:s.look?{t:s.look.t,dir:s.look.dir,ms:s.look.aim.ms,r:s.look.aim.r,clock:s.look.last,started:s.look.started,back:s.look.back,at:g.project(...planeOf(g,s.look.aim.point))}:null,
      center:[g.width/2,g.screenY],front:{shown,matrix:g.front.matrix,height:g.front.height,quad:g.front.quad},rear:g.rear.map(r=>({height:r.height,width:r.width})),
      length:{base:g.base,reach:g.reach,most:g.reachMost,plane:g.planeHeight,built:s.tableDepth*50,scale:s.table.root.scaling.z,builds:s.builds},
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
  root.CrankStage=Object.freeze({geometry,carousel,appearances,tableDesign,DEFAULT_TABLE,mount,layout,unmount,diagnostics,look,unlook,pick,
    resolution,previewResolution,setResolution,RESOLUTION:Object.freeze({key:RES_KEY,min:RES_MIN,max:RES_MAX,default:RES_DEFAULT})});
})(globalThis);
