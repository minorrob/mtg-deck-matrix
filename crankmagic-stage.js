/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * The live Full view's ground only. Cards, seat controls, hand and decisions remain DOM.
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
    /* The approved table catalog (Rob, 2026-10-17; ROB-100); older saved choices map on. */
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
    if (!library) library = (async () => {
      for (const [src, ready] of [["vendor/babylon.min.js?v=9", () => root.BABYLON], ["crankmagic-stage-tables.js?v=1", () => root.CrankTables], ["crankmagic-stage-babylon.js?v=1", () => root.CrankStageBabylon]]) {
        if (ready()) continue;
        await new Promise((resolve, reject) => {
          const script = document.createElement('script'); script.src = src;
          script.onload = resolve;
          script.onerror = () => {script.remove(); reject(new Error('The tabletop graphics could not load.'));};
          document.head.append(script);
        });
      }
    })().catch(error => {library = null; throw error;});
    return library;
  }
  // Keep the one context across board redraws; scene resources are released on leaving Full.
  let current = null, generation = 0, kept = null;
  function environment(s) {
    const scene=appearances.backgrounds.find(x=>x.id===(s.opts.background || 'volcano')), board=s.host.closest('.cm-board');
    s.host.classList.toggle('has-video',!!scene?.video);
    if(!board || !scene?.video){s.environment?.remove();s.video?.pause();return;}
    if(!s.environment){
      s.environment=document.createElement('div');s.environment.className='cm-stage-environment';s.environment.setAttribute('aria-hidden','true');
      s.video=document.createElement('video');s.video.muted=true;s.video.defaultMuted=true;s.video.loop=true;s.video.playsInline=true;s.video.preload='metadata';s.video.setAttribute('tabindex','-1');s.environment.append(s.video);
    }
    if(s.video.getAttribute('src')!==scene.video){s.video.poster=scene.poster;s.video.src=scene.video;}
    if(s.environment.parentElement!==board)board.prepend(s.environment);
    if(s.opts.reduced || document.hidden)s.video.pause();else if(s.video.paused)s.video.play().catch(()=>{});
  }
  function mount(host, opts = {}) {
    if (current) {current.host = host; current.opts = opts; if (current.app) host.prepend(current.app.canvas); environment(current); return current.ready;}
    const state = current = {host, opts, app: null, box: null, textures: new Map(), pending: new Set(), frame: null, stamp: ++generation};
    state.unhear = root.CrankMotion?.onChange(() => {state.opts.reduced = root.CrankMotion.reduced(); environment(state); if (state.box) paint(state);});
    state.visibility=()=>{environment(state);if(state.box)paint(state);};document.addEventListener("visibilitychange",state.visibility);
    environment(state);
    state.ready = load().then(() => {
      if (current !== state) return;
      if (!kept) kept = root.CrankStageBabylon.create(
        () => {if (current) {current.host.dataset.renderer = 'fallback'; current.opts.onError?.('Graphics interrupted. The readable board is still available.');}},
        () => {if (current?.box) {paint(current); current.opts.onError?.('');}});
      state.app = kept;
      state.host.prepend(kept.canvas);
      if (state.box) paint(state);
      state.opts.onError?.('');
    }).catch((error) => {if (current === state) {state.host.dataset.renderer = 'fallback'; state.opts.onError?.(error.message);}});
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
    const o = s.opts, g = geometry(s.box.width, s.box.height, {tilt: o.tilt, zoom: o.zoom, seats: (o.mats || []).length - 1});
    root.CrankStageBabylon.paint(s.app, g, o, tableDesign(o.table));
    s.host.dataset.renderer = s.app.lost ? 'fallback' : 'webgl';
  }
  function unmount() {
    const s = current; current = null; generation++;
    if (!s) return;
    cancelAnimationFrame(s.frame); s.unhear?.();s.video?.pause();s.environment?.remove();if(s.visibility)document.removeEventListener("visibilitychange",s.visibility);
    if (s.app) root.CrankStageBabylon.clear(s.app);

  }
  root.CrankStage = Object.freeze({geometry, carousel, appearances, tableDesign, DEFAULT_TABLE, mount, layout, unmount, inspect: () => root.CrankStageBabylon?.inspect(current?.app) || null});
})(globalThis);
