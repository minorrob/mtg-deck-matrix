/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * The live Babylon table. Cards, seat controls, hand and decisions remain accessible DOM.
 * One geometry model positions both the canvas mats and the DOM content.
 */
(function (root) {
  "use strict";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
  // The DOM and Babylon use the same pinhole camera, including table rotation.
  function geometry(width, height, {tilt = 40, zoom = 100, seats = 3, rotation = 0} = {}) {
    const w=Math.max(1,width), h=Math.max(1,height), angle=clamp(tilt,0,60)*Math.PI/180;
    const yaw=clamp(rotation,-180,180)*Math.PI/180, c=Math.cos(yaw), q=Math.sin(yaw);
    const planeHeight=h*.88, sx=.902*clamp(zoom,60,200)/100, sy=sx*Math.cos(angle);
    const cx=w/2, cy=planeHeight/2, screenY=h*.43, distance=Math.max(w,h)*2.5;
    const depth=-Math.sin(angle)/distance, a=depth*q, b=depth*c;
    const project=(x,y)=>{const X=x-cx,Y=y-cy,d=1+a*X+b*Y;return [cx+sx*(c*X-q*Y)/d,screenY+sy*(q*X+c*Y)/d];};
    function surface(r) {
      const X=r.x-cx,Y=r.y-cy,d=1+a*X+b*Y;
      return {...r,matrix:[sx*c+cx*a,sy*q+screenY*a,0,a,-sx*q+cx*b,sy*c+screenY*b,0,b,0,0,1,0,
        cx*d+sx*(c*X-q*Y),screenY*d+sy*(q*X+c*Y),0,d],
        quad:[...project(r.x,r.y),...project(r.x+r.width,r.y),...project(r.x+r.width,r.y+r.height),...project(r.x,r.y+r.height)]};
    }
    const quad=[...project(0,0),...project(w,0),...project(w,planeHeight),...project(0,planeHeight)], [ox,oy]=quad;
    const margin=22,gap=20,count = clamp(seats,1,3),rearY=18,rearH=planeHeight*.24,rearW=(w-margin*2-gap*(count-1))/count;
    const rear=Array.from({length:seats},(_,i)=>surface({x:margin+i*(rearW+gap),y:rearY,width:rearW,height:rearH}));
    const frontY=rearY+rearH+22,front=surface({x:margin,y:frontY,width:w-margin*2,height:planeHeight-frontY-18});
    return {width:w,height:h,planeHeight,sx,sy,ox,oy,angle,yaw,distance,quad,rear,front};
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
      .then(()=>script('crankmagic-stage-tables.js?v=1',()=>root.CrankTables)).catch(error=>{library=null;throw error;});
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
    const g=geometry(box.width,box.height,{...s.opts,seats:Math.max(0,(s.opts.mats||[]).length-1)});
    for(const [i,el] of [...s.host.querySelectorAll('.cm-stage-rear')].entries()) {position(el,g.rear[i]);if(g.rear[i])el.style.setProperty('--rear-card',`${Math.max(18,(g.rear[i].height-28)/4.8)}px`);}
    position(s.host.querySelector('.cm-stage-front'),g.front);
    s.host.style.setProperty('--stage-card',`${Math.floor(clamp((g.front.height-64)/5.5,24,112)*1.3*(1+.8*(clamp(opts.cards??100,70,200)-100)/100))}px`);
    if(s.engine&&!s.lostContext){s.host.prepend(s.canvas);paint(s);}return g;
  }
  function paint(s) {
    if(current!==s||!s.engine||!s.box)return;
    const B=root.BABYLON,g=geometry(s.box.width,s.box.height,s.opts),unit=50;
    s.engine.setSize(g.width,g.height);
    const key=[tableDesign(s.opts.table).id,g.width,g.planeHeight].join(':');
    if(s.tableKey!==key){
      s.table?.dispose();
      s.table=root.CrankTables.build(B,s.scene,tableDesign(s.opts.table).id,{width:g.width/unit,depth:g.planeHeight/unit});
      s.table.root.position.y=.225;s.tableKey=key;
    }
    s.table.root.rotation.y=g.yaw;
    const angle=Math.max(.000001,g.angle),d=g.distance/unit;
    s.camera.position.set(0,d*Math.cos(angle),-d*Math.sin(angle));s.camera.setTarget(B.Vector3.Zero());
    const projection=B.Matrix.PerspectiveFovLH(2*Math.atan(g.height/(2*g.sx*g.distance)),g.width/g.height,.1,200);
    projection.m[9]=.14; // center the tabletop at 43% of the available height, above the hand
    s.camera.freezeProjectionMatrix(projection);s.scene.render();
    s.geometry=g;s.host.dataset.renderer='webgl';s.host.dataset.engine='babylon';s.opts.onReady?.();
  }
  // Presentation diagnostics only: no cards, decisions, credentials, or room state.
  function diagnostics() {
    const s=current;if(!s?.engine||!s.geometry)return {renderer:s?.host.dataset.renderer||'unmounted'};
    const B=root.BABYLON,g=s.geometry,world=s.table.root.computeWorldMatrix(true);
    const corners=[[0,0],[g.width,0],[g.width,g.planeHeight],[0,g.planeHeight]].flatMap(([x,y])=>{
      const p=B.Vector3.Project(new B.Vector3((x-g.width/2)/50,-.225,(g.planeHeight/2-y)/50),world,s.scene.getTransformMatrix(),new B.Viewport(0,0,g.width,g.height));return [p.x,p.y];
    });return {renderer:'babylon',meshes:s.scene.meshes.length,parts:[...new Set(s.table.parts.map(p=>p.metadata.part))],materials:s.scene.materials.length,textures:s.scene.textures.length,quad:corners,domQuad:g.quad};
  }
  function unmount() {
    const s=current;current=null;if(!s)return;
    s.unhear?.();s.video?.pause();s.environment?.remove();if(s.visibility)document.removeEventListener('visibilitychange',s.visibility);
    if(s.canvas){s.canvas.removeEventListener('webglcontextlost',s.lost);s.canvas.remove();}
    s.scene?.dispose();s.engine?.dispose();
  }
  root.CrankStage=Object.freeze({geometry,carousel,appearances,tableDesign,DEFAULT_TABLE,mount,layout,unmount,diagnostics});
})(globalThis);
