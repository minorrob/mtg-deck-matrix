/* Table designs: cartoon renditions of real tables, built from a design record (Rob, 2026-10-17; Linear ROB-100).
   Each design is a named 3D object: a top with an edge profile, a side treatment, and a base. buildTable() returns a
   root node whose meshes are tagged metadata.part so a check can prove the sides and the base exist and are visible.
   Everything is procedural (MeshBuilder primitives and painted textures); no downloaded assets. Shared production table geometry.

   PAINTED DETAIL (Rob, 2026-10-25: "the table material/skin looks like an 8-bit graphic. I want 32-bit graphics in this
   game as a minimum" and "the skin on the tables should have much more detail to them; look like a more realistic
   cartoon"). The skins were 1024-pixel canvases of a few hundred strokes, stretched over a 25-unit top with no mipmaps,
   so they shimmered and banded. Now each surface is painted pixel by pixel in full 32-bit RGBA from layered noise: wood
   has its rings, long fibers, knots, planks with dark seams and a lit bevel; granite its speckle, feldspar and veins;
   felt its nap; leather its pebble and stitching; iron its hammering and rust; obsidian its ember veins, which glow.
   The tones are softly stepped -- a painted, cartoon look -- and a normal map from the same paint gives every grain and
   seam relief under the light. Textures are mipmapped with anisotropic filtering, so they stay crisp at a glancing
   angle, and the box edges are inked. `quality` (from the Graphics resolution setting, crankmagic-stage.js) sets the
   size: 1024 on a phone, 2048, or 4096 at the top of the slider. Painted once a page per design and size: a resize, a
   longer table or a camera move reuses the paint. */
(() => {
  'use strict';
  const designs = Object.freeze([
    {id: 'study', name: 'Study - walnut', reads: 'walnut top, fine brass edge, tapered walnut legs', thickness: .45, base: 'tapered', edge: 'brass', side: 'walnut', legacy: null},
    {id: 'medieval-banded', name: 'Medieval oak, iron bands', reads: 'thick plank top, riveted iron straps over the edge, trestle legs', thickness: .8, base: 'trestle', edge: 'straight', side: 'bands', legacy: null},
    {id: 'colonial-inlay', name: 'Colonial lacquered mahogany', reads: 'glossy top, apron with a light inlay band, turned legs', thickness: .35, base: 'turned', edge: 'bullnose', side: 'inlay', legacy: null},
    {id: 'glass-future', name: 'Futuristic glass', reads: 'semi-transparent frosted top with a lit edge, brushed frame, pedestal', thickness: .18, base: 'pedestal', edge: 'lit', side: 'frame', legacy: null},
    {id: 'tavern-plank', name: 'Tavern planks', reads: 'rough planks with gaps and breadboard ends, A-frame legs', thickness: .5, base: 'aframe', edge: 'straight', side: 'planks', legacy: 'wooden'},
    {id: 'felt-card', name: 'Card-room felt', reads: 'green felt inset in a padded leather rail, tapered legs', thickness: .45, base: 'tapered', edge: 'rail', side: 'leather', legacy: null},
    {id: 'stone-dais', name: 'Carved stone dais', reads: 'granite slab, chamfered edge, carved frieze, plinth', thickness: .7, base: 'plinth', edge: 'chamfer', side: 'frieze', legacy: 'stone'},
    {id: 'obsidian-glass', name: 'Volcanic obsidian', reads: 'black glass with ember veins and a lava-glass edge, pedestal', thickness: .4, base: 'pedestal', edge: 'ember', side: 'glass', legacy: 'obsidian'},
  ]);
  const byId = Object.fromEntries(designs.map(d => [d.id, d]));
  /* An older preference (wooden / stone / obsidian) maps to the design that replaced it. */
  const resolve = id => byId[id] || designs.find(d => d.legacy === id) || byId['study'];

  /* ---- The paint comes from crankmagic-stage-paint.js, in a worker. ---- */
  let worker = null, seq = 0, onPage = null;
  const waiting = new Map();
  /* The same painter on the page, for where a worker cannot start. */
  function pagePainter() {
    if (globalThis.CrankPaint) return Promise.resolve(globalThis.CrankPaint);
    return onPage ||= new Promise((resolve, reject) => {
      const el = document.createElement('script'); el.src = PAINT_SRC;
      el.onload = () => (globalThis.CrankPaint ? resolve(globalThis.CrankPaint) : reject(new Error('The table paint did not load.')));
      el.onerror = () => {onPage = null; el.remove(); reject(new Error('The table paint could not load.'));};
      document.head.append(el);
    });
  }
  const PAINT_SRC = 'crankmagic-stage-paint.js?v=1';
  function painter() {
    if (worker !== null) return worker;
    try {
      worker = new Worker(PAINT_SRC);
      worker.onmessage = (ev) => {const w = waiting.get(ev.data.id); waiting.delete(ev.data.id); if (w) (ev.data.error ? w.onPage() : w.resolve(ev.data.r));};
      worker.onerror = () => {worker = false; const all = [...waiting.values()]; waiting.clear(); for (const w of all) w.onPage();};
    } catch {worker = false;}
    return worker;
  }
  /* Where each skin was painted: in the worker, or on the page where no worker could start. */
  const painting = {worker: 0, page: 0};
  /* One skin at a time, and none while the table moves (hold, from crankmagic-stage.js at every layout and camera frame):
     a camera's motion keeps the processor, and the skins resume once it has settled. */
  const queue = [], afterHold = [];
  let busy = null, held = false, heldUntil = null;
  /* What a finished skin does to the scene (its textures, a shader built again) waits for stillness too. */
  const whenStill = (fn) => (held ? afterHold.push(fn) : fn());
  function pump() {
    if (busy || held || !queue.length) return;
    const job = busy = queue.shift(), {recipe, resolve, reject} = job, done = () => {if (busy === job) busy = null; pump();};
    const onPage = () => pagePainter().then((api) => {painting.page++; resolve(api.paint(recipe)); done();}, (e) => {reject(e); done();}), w = painter();
    if (!w) return onPage();
    const id = job.id = ++seq; waiting.set(id, {resolve: (r) => {painting.worker++; resolve(r); done();}, onPage}); w.postMessage({id, recipe});
  }
  /* The table moved: a skin being painted in the worker is stopped at once and put back first in line, and painting
     resumes `ms` after the last motion. */
  function hold(ms = 400) {
    held = true; clearTimeout(heldUntil);
    if (busy?.id && waiting.has(busy.id) && worker) {waiting.delete(busy.id); worker.terminate(); worker = null; queue.unshift(busy); busy = null; painting.stopped = (painting.stopped || 0) + 1;}
    heldUntil = setTimeout(() => {held = false; for (const fn of afterHold.splice(0)) fn(); pump();}, ms);
  }
  function paintOff(recipe) {
    return new Promise((resolve, reject) => {queue.push({recipe, resolve, reject}); pump();});
  }

  /* Painted once a page per design and size (a promise per skin); building another design lets the last one's paint go. */
  const painted = new Map();
  let paintedFor = null;
  const sizeOf = (quality, reduced) => (reduced ? 1024 : quality >= 3 ? 4096 : quality <= 1 ? 1024 : 2048);

  function build(B, scene, id, {width = 25, depth = 23, reduced = false, shadows = null, quality = 2, onPainted = null} = {}) {
    const design = resolve(id), root = new B.TransformNode('table ' + design.id, scene), parts = [];
    const TOP = -.225;                                   // the top surface: mats sit just above it
    const S = sizeOf(quality, reduced), S2 = S / 2, S4 = S / 4;
    if (paintedFor !== `${design.id}:${S}`) {painted.clear(); paintedFor = `${design.id}:${S}`;}
    /* A skin: its recipe for the painter, and the plain color the part wears until the paint arrives. */
    const paint = (key, kind, w, h, o = {}, flat = '#808080') => {if (!painted.has(key)) painted.set(key, paintOff({kind, w, h, o})); return {key, flat, done: painted.get(key)};};
    const textures = [], pending = [];
    let alive = true;
    const raw = (name, img) => {
      const t = B.RawTexture.CreateRGBATexture(img.data, img.w, img.h, scene, true, false, B.Texture.TRILINEAR_SAMPLINGMODE);
      /* How many colors it holds, over a sample of up to 65,536 of its pixels: a proof that it is full color, not a palette. */
      const seen = new Set(), N = img.w * img.h;
      for (let k = 0; k < Math.min(N, 65536); k++) {const i = N <= 65536 ? k : Math.floor((k * 2654435761 >>> 0) / 4294967296 * N); seen.add(img.data[i * 4] << 16 | img.data[i * 4 + 1] << 8 | img.data[i * 4 + 2]);}
      t.name = `${design.id} ${name}`; t.anisotropicFilteringLevel = 16; t.metadata = {painted: true, width: img.w, height: img.h, colors: seen.size};
      textures.push(t); return t;
    };
    const color = h => B.Color3.FromHexString(h);
    const mat = (name, hexColor, {rough = .8, alpha = 1, emissive = null, skin = null, bump = .55, metal = false} = {}) => {
      const m = new B.StandardMaterial(`${design.id} ${name}`, scene);
      m.diffuseColor = color(hexColor); m.specularColor = new B.Color3(1 - rough, 1 - rough, 1 - rough);
      m.specularPower = metal ? 96 : 12 + (1 - rough) * 90;
      if (alpha < 1) {m.alpha = alpha; m.transparencyMode = B.Material.MATERIAL_ALPHABLEND; m.backFaceCulling = false;}
      if (emissive) m.emissiveColor = color(emissive);
      if (skin) {
        m.diffuseColor = color(skin.flat);
        pending.push(skin.done.then((r) => new Promise((applied) => whenStill(() => {
          if (alive) {
            m.diffuseColor = new B.Color3(1, 1, 1); m.diffuseTexture = raw(name, r.img);
            if (bump) {m.bumpTexture = raw(name + ' relief', r.bump); m.bumpTexture.level = bump;}
            if (r.img.glow) {m.emissiveTexture = raw(name + ' glow', r.img.glow); m.emissiveColor = new B.Color3(1, 1, 1);}
          }
          applied();
        }))));
      }
      return m;
    };
    let seed = 11; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    /* The ink: a cartoon's line along a solid part's edges. */
    const inkOf = (material) => material.alpha >= 1 && !/^(obsidian|lava glass|lit edge)$/.test(material.name.slice(design.id.length + 1));
    const add = (mesh, part, material, {pickable = false, cast = true, receive = true, ink = true} = {}) => {
      mesh.parent = root; mesh.material = material; mesh.isPickable = pickable; mesh.receiveShadows = receive; mesh.metadata = {part, design: design.id};
      if (ink && inkOf(material) && mesh.enableEdgesRendering) {mesh.enableEdgesRendering(.95); mesh.edgesWidth = reduced ? 1.5 : 2.5; mesh.edgesColor = new B.Color4(.06, .04, .03, .55);}
      if (cast && shadows) shadows.addShadowCaster(mesh); parts.push(mesh); return mesh;
    };
    const box = (name, w, h, d, x, y, z, part, material) => {const m = add(B.MeshBuilder.CreateBox(name, {width: w, height: h, depth: d}, scene), part, material); m.position.set(x, y, z); return m;};
    const cyl = (name, dTop, dBottom, h, x, y, z, part, material, tess = 24) => {const m = add(B.MeshBuilder.CreateCylinder(name, {diameterTop: dTop, diameterBottom: dBottom, height: h, tessellation: tess}, scene), part, material, {ink: false}); m.position.set(x, y, z); return m;};
    const t = design.thickness, topY = TOP - t / 2, under = TOP - t;    // the underside of the top
    const legH = reduced ? 2.2 : 6, floor = under - legH;              // phones see no floor; legs are short

    if (design.id === 'study') {
      // r4 Study: actual walnut geometry and paint, independent of the backdrop or skin.
      const walnut = mat('walnut', '#3a2414', {rough: .72, skin: paint('walnut', 'wood', S, S, {base: '#3a2414', light: '#67462c', dark: '#21140c', planks: 5, knots: 1, rings: 8, seed: 101}, '#3a2414')});
      const legs = mat('walnut legs', '#302015', {rough: .8, skin: paint('walnut legs', 'wood', S4, S4, {base: '#302015', light: '#503821', dark: '#1c120b', rings: 6, seed: 102}, '#302015')});
      const brass = mat('brass', '#a98b4a', {rough: .55, metal: true});
      box('walnut top', width, t, depth, 0, topY, 0, 'top', walnut);
      for (const [w,d,x,z] of [[width,.045,0,depth/2],[width,.045,0,-depth/2],[.045,depth,width/2,0],[.045,depth,-width/2,0]])
        box('fine brass edge', w, .045, d, x, TOP-.075, z, 'edge', brass);
      for (const [w,d,x,z] of [[width-1,.2,0,depth/2-.6],[width-1,.2,0,-depth/2+.6],[.2,depth-1,width/2-.6,0],[.2,depth-1,-width/2+.6,0]])
        box('walnut apron', w, .65, d, x, under-.325, z, 'side', legs);
      if (!reduced) for (const x of [-1,1]) for (const z of [-1,1]) {
        const lx=x*(width/2-.75), lz=z*(depth/2-.75);
        cyl('tapered walnut leg', .6, .35, legH, lx, under-legH/2, lz, 'leg', legs);
        cyl('brass foot', .36, .36, .18, lx, floor+.09, lz, 'leg', brass);
      }
    } else if (design.id === 'medieval-banded') {
      const oak = mat('oak', '#ffffff', {rough: .85, skin: paint('oak', 'wood', S, S, {base: '#5a3d26', light: '#a07a4c', dark: '#24150b', planks: 5, knots: 2, rings: 6, seed: 21}, '#5a3d26')});
      const oakLeg = mat('oak leg', '#ffffff', {rough: .9, skin: paint('oak leg', 'wood', S4, S4, {base: '#523721', light: '#94704a', dark: '#1f120a', rings: 5, seed: 22}, '#523721')});
      const ironM = mat('iron', '#ffffff', {rough: .55, metal: true, skin: paint('iron', 'iron', S4, S4 / 4, {}, '#3a3c42'), bump: .8});
      const rivet = mat('rivet', '#55585e', {rough: .4, metal: true});
      box('top', width, t, depth, 0, topY, 0, 'top', oak);
      /* Four iron straps: over the top, down both long sides, riveted. */
      for (const i of [-1.5, -.5, .5, 1.5]) {
        const x = i * width / 4.6, sw = .55;
        box('strap over', sw, .05, depth + .06, x, TOP + .025, 0, 'band', ironM);
        box('strap front', sw, t + .08, .08, x, topY, depth / 2 + .04, 'side', ironM);
        box('strap back', sw, t + .08, .08, x, topY, -depth / 2 - .04, 'side', ironM);
        for (const z of [-depth / 2 + .5, -depth / 4, 0, depth / 4, depth / 2 - .5]) add(B.MeshBuilder.CreateSphere('rivet', {diameter: .16, segments: 8}, scene), 'rivet', rivet, {ink: false}).position.set(x, TOP + .05, z);
      }
      if (!reduced) for (const x of [-width / 3.2, width / 3.2]) {   // trestles: two sloped legs and a foot each
        for (const s of [-1, 1]) {const leg = box('trestle leg', .6, legH, .9, x, under - legH / 2, s * depth / 5, 'leg', oakLeg); leg.rotation.x = s * .22;}
        box('trestle foot', .9, .35, depth * .62, x, floor + .18, 0, 'leg', oakLeg);
      }
      if (!reduced) box('stretcher', width / 1.5, .4, .5, 0, floor + 1.4, 0, 'leg', oakLeg);
    } else if (design.id === 'colonial-inlay') {
      const mahoganySkin = paint('mahogany', 'wood', S, S, {base: '#6a2a1a', light: '#a4492c', dark: '#2a0d08', rings: 9, knots: 0, seed: 31, gloss: 1}, '#6a2a1a');
      const mahogany = mat('mahogany', '#ffffff', {rough: .22, skin: mahoganySkin, bump: .35});
      const inlay = mat('inlay', '#ffffff', {rough: .3, skin: paint('inlay', 'inlay', S2, S2, {}, '#4b1c12')});
      box('top', width, t, depth, 0, topY, 0, 'top', mahogany);
      box('bullnose', width + .24, t * .6, depth + .24, 0, topY - t * .1, 0, 'edge', mahogany);   // the rounded lip, as a lip
      const ah = 1.1, ay = under - ah / 2;                                                       // the apron with the inlay band
      box('apron front', width - 1.4, ah, .22, 0, ay, depth / 2 - .8, 'side', inlay);
      box('apron back', width - 1.4, ah, .22, 0, ay, -depth / 2 + .8, 'side', inlay);
      box('apron left', .22, ah, depth - 1.4, -width / 2 + .8, ay, 0, 'side', inlay);
      box('apron right', .22, ah, depth - 1.4, width / 2 - .8, ay, 0, 'side', inlay);
      if (!reduced) for (const x of [-1, 1]) for (const z of [-1, 1]) {   // turned legs: a stack of a block, a bulb and a taper
        const lx = x * (width / 2 - .9), lz = z * (depth / 2 - .9);
        box('leg block', .7, 1.2, .7, lx, under - ah - .6, lz, 'leg', mahogany);
        add(B.MeshBuilder.CreateSphere('leg bulb', {diameter: .95, segments: 16}, scene), 'leg', mahogany, {ink: false}).position.set(lx, under - ah - 1.6, lz);
        cyl('leg taper', .62, .3, legH - 2.4, lx, under - ah - 2.1 - (legH - 2.4) / 2, lz, 'leg', mahogany);
      }
    } else if (design.id === 'glass-future') {
      const glass = mat('frosted glass', '#ffffff', {rough: .05, alpha: .55, skin: paint('frost', 'frost', S, S, {}, '#bfe3f2'), bump: .2});
      const lit = mat('lit edge', '#5fd8ff', {rough: .2, emissive: '#2fb8ff', alpha: .9});
      const steel = mat('brushed metal', '#ffffff', {rough: .3, metal: true, skin: paint('brushed', 'brushed', S4, S4, {}, '#9aa3ad'), bump: .4});
      box('top', width, t, depth, 0, topY, 0, 'top', glass).material.backFaceCulling = false;
      for (const [w, d, x, z] of [[width + .1, .12, 0, depth / 2], [width + .1, .12, 0, -depth / 2], [.12, depth + .1, width / 2, 0], [.12, depth + .1, -width / 2, 0]]) box('lit edge', w, t + .04, d, x, topY, z, 'edge', lit);
      for (const [w, d, x, z] of [[width - 2, .3, 0, depth / 2 - 1.2], [width - 2, .3, 0, -depth / 2 + 1.2], [.3, depth - 2, width / 2 - 1.2, 0], [.3, depth - 2, -width / 2 + 1.2, 0]]) box('frame', w, .3, d, x, under - .15, z, 'side', steel);
      if (!reduced) {cyl('pedestal', 2.6, 1.8, legH - .6, 0, under - (legH - .6) / 2 - .3, 0, 'leg', steel, 48); cyl('base', 9, 10, .35, 0, floor + .18, 0, 'leg', steel, 64);}
    } else if (design.id === 'tavern-plank') {
      const planks = 7, pw = depth / planks, gap = .12, ratio = Math.max(4, Math.round((width - 1.2) / (pw - gap)));
      const ph = Math.max(64, 2 ** Math.round(Math.log2(S / ratio)));
      const tones = [['#6a4a2c', '#ad8657', '#22150b'], ['#5f4024', '#a07a4c', '#1d120a'], ['#72502f', '#b48d5b', '#26170c']];
      for (let i = 0; i < planks; i++) {
        const [base, light, dark] = tones[i % 3];
        const wood_ = mat('plank ' + i, '#ffffff', {rough: .95, skin: paint('plank ' + i, 'wood', S, ph, {base, light, dark, rings: 4, knots: 1, seed: 40 + i}, base)});
        box('plank', width - 1.2, t - rand() * .08, pw - gap, 0, topY, -depth / 2 + pw * (i + .5), 'top', wood_);
      }
      const ends = mat('breadboard', '#ffffff', {rough: .9, skin: paint('breadboard', 'wood', S2, S2, {base: '#5e4126', light: '#9c774b', dark: '#1a0f08', rings: 6, seed: 48}, '#5e4126')});
      box('breadboard left', .6, t, depth, -width / 2 + .3, topY, 0, 'edge', ends);
      box('breadboard right', .6, t, depth, width / 2 - .3, topY, 0, 'edge', ends);
      box('apron', width - 1.2, .5, .25, 0, under - .25, depth / 2 - .9, 'side', ends);
      box('apron back', width - 1.2, .5, .25, 0, under - .25, -depth / 2 + .9, 'side', ends);
      if (!reduced) for (const x of [-width / 3, width / 3]) {for (const s of [-1, 1]) {const leg = box('a-frame leg', .5, legH, .7, x, under - legH / 2, s * depth / 6, 'leg', ends); leg.rotation.x = s * .3;} box('a-frame beam', .5, .4, depth / 2, x, under - legH * .55, 0, 'leg', ends);}
    } else if (design.id === 'felt-card') {
      const leatherM = mat('leather', '#ffffff', {rough: .65, skin: paint('leather', 'leather', S2, S4 / 2, {}, '#4a2c1c')});
      const feltM = mat('felt', '#ffffff', {rough: 1, skin: paint('felt', 'felt', S, S, {}, '#1f6b3a'), bump: .3});
      const frame = mat('frame wood', '#ffffff', {rough: .5, skin: paint('frame wood', 'wood', S4, S4, {base: '#3a2216', light: '#6a4127', dark: '#140a06', rings: 6, knots: 0, seed: 51, gloss: 1}, '#3a2216')});
      const railW = 1.6, r = railW / 2;
      box('wood frame', width, t, depth, 0, topY, 0, 'top', frame);
      add(B.MeshBuilder.CreateGround('felt', {width: width - railW * 2, height: depth - railW * 2}, scene), 'top', feltM, {ink: false}).position.set(0, TOP + .005, 0);
      for (const [w, d, x, z] of [[width - railW * 2, railW, 0, depth / 2 - r], [width - railW * 2, railW, 0, -depth / 2 + r], [railW, depth - railW * 2, width / 2 - r, 0], [railW, depth - railW * 2, -width / 2 + r, 0]]) {
        const rail = box('rail', w, .32, d, x, TOP + .16, z, 'edge', leatherM); rail.scaling.y = 1;
      }
      for (const x of [-1, 1]) for (const z of [-1, 1]) cyl('rail corner', railW, railW, .32, x * (width / 2 - r), TOP + .16, z * (depth / 2 - r), 'edge', leatherM, 32);
      box('side front', width, .9, .2, 0, under - .45, depth / 2 - .1, 'side', leatherM); box('side back', width, .9, .2, 0, under - .45, -depth / 2 + .1, 'side', leatherM);
      box('side left', .2, .9, depth, -width / 2 + .1, under - .45, 0, 'side', leatherM); box('side right', .2, .9, depth, width / 2 - .1, under - .45, 0, 'side', leatherM);
      if (!reduced) for (const x of [-1, 1]) for (const z of [-1, 1]) cyl('tapered leg', .8, .4, legH, x * (width / 2 - 1.3), under - .9 - legH / 2, z * (depth / 2 - 1.3), 'leg', frame, 24);
    } else if (design.id === 'stone-dais') {
      const graniteM = mat('granite', '#ffffff', {rough: .8, skin: paint('granite', 'granite', S, S, {}, '#6f7370'), bump: .7});
      const friezeM = mat('frieze', '#ffffff', {rough: .9, skin: paint('frieze', 'frieze', S2, S2 / 4, {}, '#5c605d')});
      box('top', width - .6, t * .55, depth - .6, 0, TOP - t * .275, 0, 'top', graniteM);
      box('chamfer', width, t * .45, depth, 0, under + t * .225, 0, 'edge', graniteM);
      const fh = 1.2;
      box('frieze front', width - .2, fh, .3, 0, under - fh / 2, depth / 2 - .15, 'side', friezeM); box('frieze back', width - .2, fh, .3, 0, under - fh / 2, -depth / 2 + .15, 'side', friezeM);
      box('frieze left', .3, fh, depth - .2, -width / 2 + .15, under - fh / 2, 0, 'side', friezeM); box('frieze right', .3, fh, depth - .2, width / 2 - .15, under - fh / 2, 0, 'side', friezeM);
      if (!reduced) {box('plinth', width - 3, legH - 1.6, depth - 3, 0, under - fh - (legH - 1.6) / 2, 0, 'leg', graniteM); box('plinth foot', width + 1, .5, depth + 1, 0, floor + .25, 0, 'leg', graniteM);}
    } else if (design.id === 'obsidian-glass') {
      const obsidianM = mat('obsidian', '#ffffff', {rough: .08, skin: paint('obsidian', 'obsidian', S, S, {}, '#151219'), bump: .45});
      const lava = mat('lava glass', '#ff7a2a', {rough: .2, emissive: '#c8400a', alpha: .85});
      const basalt = mat('basalt', '#ffffff', {rough: .9, skin: paint('basalt', 'granite', S4, S4, {seed: 14, base: '#2a282e'}, '#2a282e'), bump: .8});
      box('top', width, t, depth, 0, topY, 0, 'top', obsidianM);
      for (const [w, d, x, z] of [[width + .1, .16, 0, depth / 2], [width + .1, .16, 0, -depth / 2], [.16, depth + .1, width / 2, 0], [.16, depth + .1, -width / 2, 0]]) box('ember edge', w, t + .02, d, x, topY, z, 'edge', lava);
      box('skirt front', width - .4, .7, .25, 0, under - .35, depth / 2 - .3, 'side', basalt); box('skirt back', width - .4, .7, .25, 0, under - .35, -depth / 2 + .3, 'side', basalt);
      if (!reduced) {cyl('pedestal', 3, 5, legH - .8, 0, under - .7 - (legH - .8) / 2, 0, 'leg', basalt, 8); box('base', 10, .5, 9, 0, floor + .25, 0, 'leg', basalt);}
    }
    /* Each skin, as it arrives; the stage draws again (onPainted), since it draws only when asked. */
    const table = {root, design, parts, textures, size: S, painted: false};
    table.ready = Promise.allSettled(pending).then(() => {if (alive) {table.painted = true; onPainted?.(table);}});
    for (const p of pending) p.then(() => {if (alive) onPainted?.(table, false);}, () => {});
    return Object.assign(table, {dispose() {
      alive = false;
      const materials=new Set(parts.map(p=>p.material).filter(Boolean));
      for(const p of parts){shadows?.removeShadowCaster(p);p.dispose();}
      for(const material of materials)material.dispose(false,true);
      root.dispose();
    }});
  }
  globalThis.CrankTables = Object.freeze({designs, resolve, build, hold, painting: () => ({...painting, queued: queue.length, held})});
})();
