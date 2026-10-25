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
     (toward +x) and `pitch` (down). */
  function geometry(width, height, {tilt = 40, zoom = 100, seats = 3, rotation = 0, pan = null, look = null} = {}) {
    const w=Math.max(1,width), h=Math.max(1,height), angle=clamp(tilt,0,60)*Math.PI/180;
    const yaw=clamp(rotation,-180,180)*Math.PI/180, c=Math.cos(yaw), q=Math.sin(yaw);
    const planeHeight=h*.88, sx=.902*clamp(zoom,60,200)/100, sy=sx*Math.cos(angle);
    const cx=w/2, cy=planeHeight/2, screenY=h*.43, distance=Math.max(w,h)*2.5, focal=sx*distance;
    const at={x:clamp(pan?.x,-cx,cx),y:clamp(pan?.y,-cy,cy)}, L=look||{};
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
    const margin=22,gap=20,count = clamp(seats,1,3),rearY=18,rearH=planeHeight*.24,rearW=(w-margin*2-gap*(count-1))/count;
    const rear=Array.from({length:seats},(_,i)=>surface({x:margin+i*(rearW+gap),y:rearY,width:rearW,height:rearH}));
    const frontY=rearY+rearH+22,front=surface({x:margin,y:frontY,width:w-margin*2,height:planeHeight-frontY-18});
    return {width:w,height:h,planeHeight,sx,sy,ox,oy,angle,yaw,distance,focal,screenY,pan:at,
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
      .then(()=>script('crankmagic-stage-tables.js?v=2',()=>root.CrankTables)).catch(error=>{library=null;throw error;});
    return library;
  }
  function environment(s) {
    const scene=appearances.backgrounds.find(x=>x.id===(s.opts.background || 'volcano')), board=s.host.closest('.cm-board');
    s.host.classList.toggle('has-video',!!scene?.video);
    if(!board || !scene?.video){s.environment?.remove();s.video?.pause();return;}
    if(!s.environment){
      s.environment=document.createElement('div');s.environment.className='cm-stage-environment';s.environment.setAttribute('aria-hidden','true');
      s.video=document.createElement('video');s.video.muted=true;s.video.defaultMuted=true;s.video.loop=true;s.video.playsInline=true;s.video.preload='metadata';s.video.setAttribute('tabindex','-1');s.environment.append(s.video);
      s.visibility=()=>environment(s);document.addEventListener('visibilitychange',s.visibility);
    }
    if(s.video.getAttribute('src')!==scene.video){s.video.poster=scene.poster;s.video.src=scene.video;}
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
      s.engine.setHardwareScalingLevel(1/Math.min(root.devicePixelRatio||1,1.5));
      s.scene=new B.Scene(s.engine);s.scene.detachControl();s.scene.clearColor=new B.Color4(0,0,0,0);
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
  function position(el,r) {
    if(!el||!r)return;
    Object.assign(el.style,{left:'0px',top:'0px',width:`${r.width}px`,height:`${r.height}px`,transformOrigin:'0 0',transform:`matrix3d(${r.matrix.join(',')})`});
  }
  function layout(box,opts={}) {
    if(!current)return;
    const s=current;s.box={width:box.width,height:box.height};s.opts={...s.opts,...opts};environment(s);
    return place(s);
  }
  /* The DOM surfaces and the Babylon camera, from one geometry: at every layout, and at every frame of a camera motion. */
  function place(s) {
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
    s.engine.setSize(g.width,g.height);
    const key=[tableDesign(s.opts.table).id,g.width,g.planeHeight].join(':');
    if(s.tableKey!==key){
      s.table?.dispose();
      s.table=root.CrankTables.build(B,s.scene,tableDesign(s.opts.table).id,{width:g.width/unit,depth:g.planeHeight/unit});
      s.table.root.position.y=.225;s.tableKey=key;
    }
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
     motion (CrankMotion) jumps to either end. */
  const LOOK={turn:[0,.6],lean:[.2,.8],pitch:[.4,1],read:[.6,1]};
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const phase=(t,[a,b])=>ease(clamp((t-a)/(b-a),0,1));
  function aim(g,P) {
    const eye=g.camera.eye, u=clamp((P[0]-g.pan.x)/(g.width/2),-1,1), v=clamp((-P[2]-g.pan.y)/(g.planeHeight/2),-1,1), r=Math.min(1,Math.hypot(u,v));
    const lean=[.3*(P[0]-eye[0]),-.06*eye[1]*r,.25*(P[2]+g.pan.y)], leaned=eye.map((n,i)=>n+lean[i]);
    const k=.06+.1*r, read=leaned.map((n,i)=>k*(P[i]-n)), d=P.map((n,i)=>n-leaned[i]-read[i]);
    return {lean,read,yaw:Math.atan2(d[0],d[2]),pitch:Math.atan2(-d[1],Math.hypot(d[0],d[2]))-g.camera.pitch,r,ms:250+400*r,point:P};
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
  const planeOf=(g,P)=>{const c=Math.cos(g.yaw),q=Math.sin(g.yaw),Y=-P[2];return [c*P[0]+q*Y+g.width/2,-q*P[0]+c*Y+g.planeHeight/2];};
  // Presentation diagnostics only: no cards, decisions, credentials, or room state.
  function diagnostics() {
    const s=current;if(!s?.engine||!s.geometry)return {renderer:s?.host.dataset.renderer||'unmounted'};
    const B=root.BABYLON,g=s.geometry,world=s.table.root.computeWorldMatrix(true);
    const corners=[[0,0],[g.width,0],[g.width,g.planeHeight],[0,g.planeHeight]].flatMap(([x,y])=>{
      const p=B.Vector3.Project(new B.Vector3((x-g.width/2)/50,-.225,(g.planeHeight/2-y)/50),world,s.scene.getTransformMatrix(),new B.Viewport(0,0,g.width,g.height));return [p.x,p.y];
    });
    const front=s.host.querySelector('.cm-stage-front'),shown=front?Array.from(new DOMMatrix(getComputedStyle(front).transform).toFloat64Array()):null;
    return {renderer:'babylon',meshes:s.scene.meshes.length,parts:[...new Set(s.table.parts.map(p=>p.metadata.part))],materials:s.scene.materials.length,textures:s.scene.textures.length,quad:corners,domQuad:g.quad,
      camera:{position:s.camera.position.asArray(),rotation:s.camera.rotation.asArray()},pan:{...g.pan},
      look:s.look?{t:s.look.t,dir:s.look.dir,ms:s.look.aim.ms,r:s.look.aim.r,clock:s.look.last,started:s.look.started,back:s.look.back,at:g.project(...planeOf(g,s.look.aim.point))}:null,
      center:[g.width/2,g.screenY],front:{shown,matrix:g.front.matrix}};
  }
  function unmount() {
    const s=current;current=null;if(!s)return;
    if(s.look?.raf)cancelAnimationFrame(s.look.raf);
    s.unhear?.();s.video?.pause();s.environment?.remove();if(s.visibility)document.removeEventListener('visibilitychange',s.visibility);
    if(s.canvas){s.canvas.removeEventListener('webglcontextlost',s.lost);s.canvas.remove();}
    s.scene?.dispose();s.engine?.dispose();
  }
  root.CrankStage=Object.freeze({geometry,carousel,appearances,tableDesign,DEFAULT_TABLE,mount,layout,unmount,diagnostics,look,unlook,pick});
})(globalThis);
