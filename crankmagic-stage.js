/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * The preview's ground only. Cards, seat controls, hand and decisions remain DOM.
 * One geometry model positions both the canvas mats and the DOM content.
 */
(function (root) {
  "use strict";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
  // One pinhole-camera homography for the physical table, mats and DOM cards.
  function geometry(width, height, {tilt = 40, zoom = 100, seats = 3} = {}) {
    const w = Math.max(1, width), h = Math.max(1, height), angle = clamp(tilt, 0, 60) * Math.PI / 180;
    const planeHeight = h * .88, cosine = Math.cos(angle), sx = .902 * clamp(zoom,60,120) / 100, sy = sx * cosine;
    const cx=w/2, cy=planeHeight/2, screenY=h*.43, depth=-Math.sin(angle)/(Math.max(w,h)*2.5);
    const project=(x,y)=>{const d=1+depth*(y-cy);return [cx+sx*(x-cx)/d,screenY+sy*(y-cy)/d];};
    function surface(r) {
      const tx=sx*(r.x-cx)+cx*(1+depth*(r.y-cy)), ty=sy*(r.y-cy)+screenY*(1+depth*(r.y-cy));
      return {...r, matrix:[sx,0,0,0,cx*depth,sy+screenY*depth,0,depth,0,0,1,0,tx,ty,0,1+depth*(r.y-cy)],
        quad:[...project(r.x,r.y),...project(r.x+r.width,r.y),...project(r.x+r.width,r.y+r.height),...project(r.x,r.y+r.height)]};
    }
    const quad=[...project(0,0),...project(w,0),...project(w,planeHeight),...project(0,planeHeight)], [ox,oy]=quad;
    const margin = 22, gap = 20, count = clamp(seats,1,3), rearY = 18, rearH = planeHeight * .24;
    const rearW = (w - margin * 2 - gap * (count - 1)) / count;
    const rear = Array.from({length:seats},(_,i)=>surface({x:margin+i*(rearW+gap),y:rearY,width:rearW,height:rearH}));
    const frontY = rearY + rearH + 22;
    const front = surface({x:margin,y:frontY,width:w-margin*2,height:planeHeight-frontY-18});
    return {width:w,height:h,planeHeight,sx,sy,ox,oy,angle,quad,rear,front};
  }
  const appearances = Object.freeze({backgrounds: [{id:"volcano",name:"Volcano",video:"assets/environments/volcano.webm?v=1",poster:"assets/environments/volcano-poster.jpg?v=1"},{id:"forest",name:"Forest"},{id:"clouds",name:"Cloud sea"}],
    /* The table designs (Rob, 2026-10-17; ROB-100): the same catalog the Babylon lab builds as 3D objects
       (ui-prototypes/babylon/tables.js). Until that renderer reaches the live board, this 2D stage paints each as a flat
       fallback: the slab's side, the top, the edge, and a hint of the side treatment (`look`). Older saved choices map on. */
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
  let library = null;
  function load() {
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "vendor/pixi.min.js?v=8.11.0";
      script.onload = () => {
        const compat = document.createElement("script"); compat.src = "vendor/pixi-csp.min.js?v=8.11.0";
        compat.onload = () => resolve(root.PIXI);
        compat.onerror = () => {library = null; reject(new Error("The tabletop compatibility module could not load."));};
        document.head.append(compat);
      };
      script.onerror = () => {script.remove(); library = null; reject(new Error("The tabletop graphics could not load."));};
      document.head.append(script);
    });
    return library;
  }
  /* One Application, kept across Full screen's visits and never destroyed: Pixi 8's accessibility system leaves its
     window listeners (keydown, mousemove) behind on destroy, and the next Tab or mouse move reaches a renderer set to
     null (tests/a11y-board.mjs, the page throws nothing). Leaving Full screen empties the stage and detaches the canvas. */
  let current = null, generation = 0, kept = null;
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
  function mount(host, opts = {}) {
    if (current) {current.host = host; current.opts = opts; if (current.app) host.prepend(current.app.canvas); environment(current); return current.ready;}
    const state = current = {host, opts, app: null, box: null, frame: null, stamp: ++generation};
    state.unhear = root.CrankMotion?.onChange(() => {state.opts.reduced = root.CrankMotion.reduced(); environment(state); if (state.box) paint(state);});
    environment(state);
    state.ready = load().then(async (P) => {
      if (current !== state) return;
      let app = kept;
      if (!app) {
        await P.Assets.init({preferences: {preferWorkers: false}});
        app = new P.Application();
        await app.init({preference: "webgl", backgroundAlpha: 0, antialias: true, resolution: Math.min(root.devicePixelRatio || 1, 1.5), autoDensity: true, autoStart: false});
        kept = app;
        app.canvas.className = "cm-stage-canvas"; app.canvas.setAttribute("aria-hidden", "true");
        app.canvas.addEventListener("webglcontextlost", (event) => {event.preventDefault(); current?.opts.onError?.("Graphics interrupted. The readable board is still available.");});
        app.canvas.addEventListener("webglcontextrestored", () => {if (current && current.box) paint(current);});
      }
      if (current !== state) return;
      state.app = app;
      state.host.prepend(app.canvas);
      if (state.box) paint(state);
    }).catch((error) => {if (current === state) state.opts.onError?.(error.message);});
    return state.ready;
  }
  function layout(box, opts = {}) {
    if (!current) return;
    current.box = box; current.opts = {...current.opts, ...opts};environment(current);
    const g = geometry(box.width, box.height, {tilt: opts.tilt, zoom: opts.zoom, seats: (opts.mats || []).length - 1});
    for (const [i, el] of [...current.host.querySelectorAll(".cm-stage-rear")].entries()) {position(el, g.rear[i]); el.style.setProperty("--rear-card", `${Math.max(18, (g.rear[i].height-28)/4.8)}px`);}
    position(current.host.querySelector(".cm-stage-front"), g.front);
    current.host.style.setProperty("--stage-card", `${Math.floor(clamp((g.front.height - 64) / 5.5, 24, 112) * 1.3 * (1 + .8 * (clamp(opts.cards ?? 100, 70, 150) - 100) / 100))}px`);
    if (current.app) {current.host.prepend(current.app.canvas); paint(current);}
    return g;
  }
  function position(el, r) {
    if (!el || !r) return;
    Object.assign(el.style, {left: "0px", top: "0px", width: `${r.width}px`, height: `${r.height}px`, transformOrigin: "0 0", transform: `matrix3d(${r.matrix.join(",")})`});
  }
  function paint(s) {
    if (current !== s || !s.app || !s.box) return;
    const P = root.PIXI, app = s.app, o = s.opts;
    const g = geometry(s.box.width, s.box.height, {tilt: o.tilt, zoom: o.zoom, seats: (o.mats || []).length - 1});
    app.renderer.resize(g.width, g.height);
    for (const child of app.stage.removeChildren()) child.destroy({children: true});
    const bg = new P.Graphics(); app.stage.addChild(bg);
    const scene = o.background || "volcano", design = tableDesign(o.table), material = design.id;
    const videoScene=!!appearances.backgrounds.find(x=>x.id===scene)?.video;
    if(!videoScene) bg.rect(0,0,g.width,g.height).fill(scene === "volcano" ? 0x191216 : scene === "clouds" ? 0x243f53 : 0x101e19);
    if (!videoScene && scene === "volcano") {
      // A replaceable procedural environment until the host's background loops are supplied.
      for (let i=5;i>0;i--) bg.ellipse(g.width*.5,g.height*.85,g.width*.11*i,g.height*.08*i).fill({color:0xee620a,alpha:.025});
      for (let i=0;i<19;i++) {
        const x=(i*.137%1)*g.width, y=(i*.233%1)*g.height;
        bg.poly([x-80,y+95,x-48,y-35,x+22,y-68,x+92,y+20,x+48,y+100]).fill(i%2?0x2b2528:0x211e22).stroke({color:0x55413a,width:2,alpha:.5});
        if(i%2===0) for (const [width,color,alpha] of [[16,0xe33b05,.15],[7,0xe45b08,.5],[2,0xffbb42,.9]]) bg.moveTo(x-80,y+95).lineTo(x-48,y-35).lineTo(x+22,y-68).stroke({width,color,alpha});
      }
    } else if (!videoScene && scene === "forest") {
      for (let i=0;i<24;i++) {const x=(i*.071%1)*g.width;bg.poly([x-55,g.height,x-11,0,x+9,0,x+65,g.height]).fill({color:i%2?0x294b35:0x162d29,alpha:.8});}
      for (let i=0;i<14;i++) bg.ellipse((i*.173%1)*g.width,g.height*(i%3)*.12,150,85).fill({color:0x497b4a,alpha:.13});
    } else if (!videoScene) {
      for (let i=0;i<30;i++) bg.ellipse((i*.137%1)*g.width,(i*.217%1)*g.height,180,50).fill({color:0xd4e6e2,alpha:.045});
    }
    const edge = o.combat ? 0xf0a963 : o.instant ? 0x8ecbff : design.edge;
    const thickness = 5 + Math.sin(g.angle)*24;
    for(let i=5;i>0;i--) bg.poly(g.quad.map((n,j)=>j%2?n+18+i*5:n)).fill({color:0x000000,alpha:.065});
    const slab = new P.Graphics(); app.stage.addChild(slab);
    slab.poly(g.quad.map((n,j)=>j%2?n+thickness:n)).fill(design.slab).stroke({color:0x080c0b,width:2});
    const plane = new P.Container();
    const top = new P.Graphics();plane.addChild(top);
    top.roundRect(0,0,g.width,g.planeHeight,28).fill({color:design.top,alpha:design.look==="glass"?.62:1}).stroke({color:edge,width:design.look==="glass"?5:3,alpha:design.look==="glass"?1:.85});
    const wood = ["planks","bands","inlay"].includes(design.look);
    if(wood) {
      for(let i=1;i<32;i++){const y=i*g.planeHeight/32;top.moveTo(10,y).bezierCurveTo(g.width*.3,y-9,g.width*.68,y+12,g.width-10,y+3).stroke({color:i%3?0x3a2218:0xb08a5b,width:i%3?1:2,alpha:.35});}
      for(let i=1;i<5;i++)top.moveTo(i*g.width/5,5).lineTo(i*g.width/5,g.planeHeight-5).stroke({color:0x2b1d15,width:2,alpha:.6});
    } else if(design.look === "speckle") {
      for(let i=0;i<35;i++){const x=(i*.137%1)*g.width,y=(i*.217%1)*g.planeHeight;top.moveTo(x,y).lineTo(x+38,y+15).lineTo(x+57,y+12).stroke({color:0xc7c9bf,width:1,alpha:.15});}
    }
    /* The side treatment, flat: four riveted straps across the oak, a light inlay band on the mahogany, a leather rail
       around the felt, ember veins through the obsidian. The glass top is translucent (above) with a lit edge. */
    if(design.look === "bands") for(let i=1;i<=4;i++){const x=i*g.width/5-7;top.rect(x,0,14,g.planeHeight).fill({color:0x2a2c30,alpha:.9});for(let k=1;k<6;k++)top.circle(x+7,k*g.planeHeight/6,3).fill(0x8a8e96);}
    if(design.look === "inlay") top.roundRect(16,16,g.width-32,g.planeHeight-32,18).stroke({color:0xe4c98a,width:4,alpha:.9});
    if(design.look === "felt") {top.roundRect(0,0,g.width,g.planeHeight,28).stroke({color:0x3a2418,width:26,alpha:1});top.roundRect(13,13,g.width-26,g.planeHeight-26,18).stroke({color:0x5a3a28,width:2,alpha:.8});}
    if(design.look === "ember") for(let i=0;i<9;i++){let x=(i*.137%1)*g.width,y=(i*.217%1)*g.planeHeight;top.moveTo(x,y);for(let k=0;k<5;k++){x+=((i*7+k*13)%11-5)*14;y+=((i*5+k*3)%9-4)*12;top.lineTo(x,y);}top.stroke({color:i%2?0xff6a1a:0xff3d00,width:2,alpha:.5});}
    top.roundRect(7,7,g.width-14,g.planeHeight-14,22).stroke({color:edge,width:1,alpha:.4});
    s.surfaceTexture?.destroy(true);
    s.surfaceTexture=P.RenderTexture.create({width:g.width,height:g.planeHeight,resolution:1});
    app.renderer.render({container:plane,target:s.surfaceTexture,clear:true});plane.destroy({children:true});
    app.stage.addChild(new P.PerspectiveMesh({texture:s.surfaceTexture,x0:g.quad[0],y0:g.quad[1],x1:g.quad[2],y1:g.quad[3],x2:g.quad[4],y2:g.quad[5],x3:g.quad[6],y3:g.quad[7]}));
    const rects = [g.front, ...g.rear];
    // Each seat's mat, art or drawn, is the DOM's (crankmagic-stage.css): cropped to its seat, never stretched (Rob, 2026-10-18).
    rects.forEach((r, i) => {
      const mat = new P.Graphics(); app.stage.addChild(mat);
      mat.poly(r.quad).fill({color: i ? 0x21403b : 0x294942, alpha: .8}).stroke({color: edge, width: 1, alpha: i ? .2 : .4});
    });
    const motes = new P.Graphics(); app.stage.addChild(motes);
    let last = -1;
    const frame = (time = 0) => {
      if (current !== s) return;
      if (time - last > 32 || last < 0) {
        last = time; motes.clear();
        if (!o.reduced && !videoScene) for (let i = 0; i < 24; i++) {
          const x = (i * .137 % 1) * g.width;
          const y = ((i * .217 + time / 120000) % 1) * g.height;
          // Keep decorative light outside the cards' main area.
          if (x < g.ox || x > g.width-g.ox || y < g.oy || y > g.quad[5]+20) motes.circle(x, y, scene === "volcano" ? 2 : 1.5).fill({color: scene === "volcano" ? 0xffad47 : 0xbbe5b0, alpha: .55});
        }
        app.render();
      }
      if (!o.reduced && !document.hidden && !videoScene) s.frame = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(s.frame); frame();
    s.host.dataset.renderer = "webgl";
  }
  function unmount() {
    const s = current; current = null; generation++;
    if (!s) return;
    cancelAnimationFrame(s.frame); s.unhear?.();s.video?.pause();s.environment?.remove();if(s.visibility)document.removeEventListener("visibilitychange",s.visibility);
    if (s.app) {for (const child of s.app.stage.removeChildren()) child.destroy({children: true}); s.app.canvas.remove();}
    s.surfaceTexture?.destroy(true);
  }
  root.CrankStage = Object.freeze({geometry, carousel, appearances, tableDesign, DEFAULT_TABLE, mount, layout, unmount});
})(globalThis);
