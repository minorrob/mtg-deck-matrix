/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * The preview's ground only. Cards, seat controls, hand and decisions remain DOM.
 * One geometry model positions both the canvas mats and the DOM content.
 */
(function (root) {
  "use strict";
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
  function geometry(width, height, {tilt = 18, zoom = 100, seats = 3} = {}) {
    const w = Math.max(1, width), h = Math.max(1, height), t = clamp(tilt, 0, 35) / 35;
    const z = clamp(zoom, 85, 110) / 100;
    const top = h * (.10 + t * .035), bottom = h * .98;
    const inset = w * (.08 + t * .10 - (z - 1) * .2);
    const near = w * (.08 - t * .065 - (z - 1) * .2);
    const quad = [inset, top, w - inset, top, w - near, bottom, near, bottom];
    // One projective plane drives every mat texture and its DOM descendants.
    // At zero tilt this is affine; increasing tilt narrows the far edge.
    const farWidth = w - inset * 2, nearWidth = w - near * 2;
    const depth = farWidth / nearWidth - 1;
    const A = farWidth / w, B = ((1 + depth) * near - inset) / h;
    const E = ((1 + depth) * bottom - top) / h, D = depth / h;
    function surface(r) {
      const denominator = 1 + D * r.y;
      const a = A / denominator, b = B / denominator, c = (inset + A * r.x + B * r.y) / denominator;
      const e = E / denominator, f = (top + E * r.y) / denominator, d = D / denominator;
      const point = (x, y) => [(a * x + b * y + c) / (1 + d * y), (e * y + f) / (1 + d * y)];
      return {...r, matrix: [a,0,0,0,b,e,0,d,0,0,1,0,c,f,0,1],
        quad: [...point(0,0), ...point(r.width,0), ...point(r.width,r.height), ...point(0,r.height)]};
    }
    const rearY = 12, rearH = Math.max(48, h * .24 - 12);
    const margin = 18, count = clamp(seats, 1, 3), gap = 18;
    const rearW = (w - margin * 2 - gap * (count - 1)) / count;
    const rear = Array.from({length: seats}, (_, i) => surface({x: margin + i * (rearW + gap), y: rearY, width: rearW, height: rearH}));
    const frontY = rearY + rearH + 26;
    const front = surface({x: margin, y: frontY, width: w - margin * 2, height: Math.max(1, h - frontY - 16)});
    return {width: w, height: h, quad, rear, front};
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
  let current = null, generation = 0;
  function mount(host, opts = {}) {
    if (current) {current.host = host; current.opts = opts; if (current.app) host.prepend(current.app.canvas); return current.ready;}
    const state = current = {host, opts, app: null, box: null, textures: new Map(), pending: new Set(), frame: null, stamp: ++generation};
    state.unhear = root.CrankMotion?.onChange(() => {state.opts.reduced = root.CrankMotion.reduced(); if (state.box) paint(state);});
    state.ready = load().then(async (P) => {
      if (current !== state) return;
      await P.Assets.init({preferences: {preferWorkers: false}});
      const app = new P.Application();
      await app.init({preference: "webgl", backgroundAlpha: 0, antialias: true, resolution: Math.min(root.devicePixelRatio || 1, 1.5), autoDensity: true, autoStart: false});
      if (current !== state) {app.destroy(true, {children: true}); return;}
      state.app = app;
      app.canvas.className = "cm-stage-canvas"; app.canvas.setAttribute("aria-hidden", "true");
      app.canvas.addEventListener("webglcontextlost", (event) => {event.preventDefault(); state.opts.onError?.("Graphics interrupted. The readable board is still available.");});
      app.canvas.addEventListener("webglcontextrestored", () => {if (current === state && state.box) paint(state);});
      state.host.prepend(app.canvas);
      if (state.box) paint(state);
    }).catch((error) => {if (current === state) state.opts.onError?.(error.message);});
    return state.ready;
  }
  function layout(box, opts = {}) {
    if (!current) return;
    current.box = box; current.opts = {...current.opts, ...opts};
    const g = geometry(box.width, box.height, {tilt: opts.tilt, zoom: opts.zoom, seats: (opts.mats || []).length - 1});
    for (const [i, el] of [...current.host.querySelectorAll(".cm-stage-rear")].entries()) position(el, g.rear[i]);
    position(current.host.querySelector(".cm-stage-front"), g.front);
    current.host.style.setProperty("--stage-card", `${Math.floor(clamp(g.front.height / 2.65, 48, 112) * clamp(opts.zoom ?? 100, 85, 110) / 100)}px`);
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
    bg.rect(0, 0, g.width, g.height).fill(0x071719);
    // The first environment is a quiet procedural forest; final scene artwork follows this preview.
    for (let i = 0; i < 22; i++) {
      const x = (i * .071 % 1) * g.width, y = g.height * (.02 + (i % 4) * .025);
      bg.poly([x - 80, g.height, x - 13, y, x + 14, y, x + 100, g.height]).fill({color: i % 2 ? 0x163b37 : 0x0c292b, alpha: .55});
    }
    for (let i = 7; i >= 1; i--) bg.ellipse(g.width * .5, g.height * .17, g.width * .10 * i, g.height * .055 * i).fill({color: 0x75ac8a, alpha: .018});
    const edge = o.combat ? 0xf0a963 : o.instant ? 0x8ecbff : 0x77c8ad;
    const slab = new P.Graphics(); app.stage.addChild(slab);
    const dropped = g.quad.map((v, i) => i % 2 ? v + 12 : v);
    slab.poly(dropped).fill(0x061010).stroke({color: 0x214443, width: 2});
    slab.poly(g.quad).fill(0x132b29).stroke({color: edge, width: 2, alpha: .85});
    for (let i = 3; i > 0; i--) slab.poly(g.quad).stroke({color: edge, width: i * 5, alpha: .018});
    const rects = [g.front, ...g.rear];
    rects.forEach((r, i) => {
      const mat = new P.Graphics(); app.stage.addChild(mat);
      mat.poly(r.quad).fill({color: i ? 0x21403b : 0x294942, alpha: .8}).stroke({color: edge, width: 1, alpha: i ? .2 : .4});
      const id = o.mats?.[i];
      if (id && /^[a-z][a-z0-9-]+$/.test(id) && !["felt", "forge", "cavern", "sea", "night"].includes(id)) {
        const url = `assets/playmats/${id}.webp`;
        const texture = s.textures.get(url);
        if (texture) {
          const mesh = new P.PerspectiveMesh({texture, x0: r.quad[0], y0: r.quad[1], x1: r.quad[2], y1: r.quad[3], x2: r.quad[4], y2: r.quad[5], x3: r.quad[6], y3: r.quad[7]});
          mesh.alpha = i ? .24 : .32; app.stage.addChild(mesh);
        } else if (!s.pending.has(url)) {
          s.pending.add(url);
          P.Assets.load(url).then((texture) => {if (current === s) {s.textures.set(url, texture); paint(s);}}).catch(() => {});
        }
      }
    });
    const motes = new P.Graphics(); app.stage.addChild(motes);
    let last = -1;
    const frame = (time = 0) => {
      if (current !== s) return;
      if (time - last > 32 || last < 0) {
        last = time; motes.clear();
        if (!o.reduced) for (let i = 0; i < 24; i++) {
          const x = (i * .137 % 1) * g.width;
          const y = ((i * .217 + time / 120000) % 1) * g.height;
          // Keep decorative light outside the cards' main area.
          if (x < g.width * .06 || x > g.width * .94 || y < g.height * .09) motes.circle(x, y, 1.5).fill({color: 0xbbe5b0, alpha: .45});
        }
        app.render();
      }
      if (!o.reduced && !document.hidden) s.frame = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(s.frame); frame();
    s.host.dataset.renderer = "webgl";
  }
  function unmount() {
    const s = current; current = null; generation++;
    if (!s) return;
    cancelAnimationFrame(s.frame); s.unhear?.();
    s.app?.destroy(true, {children: true});
  }
  root.CrankStage = Object.freeze({geometry, mount, layout, unmount});
})(globalThis);
