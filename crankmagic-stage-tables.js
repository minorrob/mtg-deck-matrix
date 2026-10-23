/* Table designs: cartoon renditions of real tables, built from a design record (Rob, 2026-10-17; Linear ROB-100).
   Each design is a named 3D object: a top with an edge profile, a side treatment, and a base. buildTable() returns a
   root node whose meshes are tagged metadata.part so a check can prove the sides and the base exist and are visible.
   Everything is procedural (MeshBuilder primitives and DynamicTexture paint); no downloaded assets. Shared production table geometry. */
(() => {
  'use strict';
  const designs = Object.freeze([
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
  const resolve = id => byId[id] || designs.find(d => d.legacy === id) || byId['tavern-plank'];

  function build(B, scene, id, {width = 25, depth = 23, reduced = false, shadows = null} = {}) {
    const design = resolve(id), root = new B.TransformNode('table ' + design.id, scene), parts = [];
    const TOP = -.225;                                   // the top surface: mats sit just above it
    const color = h => B.Color3.FromHexString(h);
    const mat = (name, hex, {rough = .8, alpha = 1, emissive = null, texture = null, metal = false} = {}) => {
      const m = new B.StandardMaterial(`${design.id} ${name}`, scene);
      m.diffuseColor = color(hex); m.specularColor = new B.Color3(1 - rough, 1 - rough, 1 - rough);
      if (metal) m.specularPower = 96;
      if (alpha < 1) {m.alpha = alpha; m.transparencyMode = B.Material.MATERIAL_ALPHABLEND; m.backFaceCulling = false;}
      if (emissive) m.emissiveColor = color(emissive);
      if (texture) m.diffuseTexture = texture;
      return m;
    };
    const paint = (name, size, fn) => {const t = new B.DynamicTexture(`${design.id} ${name}`, {width: size, height: size}, scene, false); fn(t.getContext(), size); t.update(); return t;};
    let seed = 11; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const add = (mesh, part, material, {pickable = false, cast = true, receive = true} = {}) => {
      mesh.parent = root; mesh.material = material; mesh.isPickable = pickable; mesh.receiveShadows = receive; mesh.metadata = {part, design: design.id};
      if (cast && shadows) shadows.addShadowCaster(mesh); parts.push(mesh); return mesh;
    };
    const box = (name, w, h, d, x, y, z, part, material) => {const m = add(B.MeshBuilder.CreateBox(name, {width: w, height: h, depth: d}, scene), part, material); m.position.set(x, y, z); return m;};
    const cyl = (name, dTop, dBottom, h, x, y, z, part, material, tess = 24) => {const m = add(B.MeshBuilder.CreateCylinder(name, {diameterTop: dTop, diameterBottom: dBottom, height: h, tessellation: tess}, scene), part, material); m.position.set(x, y, z); return m;};
    const t = design.thickness, topY = TOP - t / 2, under = TOP - t;    // the underside of the top
    const legH = reduced ? 2.2 : 6, floor = under - legH;              // phones see no floor; legs are short

    /* Wood grain, planks and inlay are painted once per design. */
    const grain = (base, light, dark, planks = 0) => paint('grain', 1024, (ctx, n) => {
      ctx.fillStyle = base; ctx.fillRect(0, 0, n, n);
      for (let i = 0; i < 2200; i++) {const y = rand() * n; ctx.beginPath(); ctx.strokeStyle = rand() > .5 ? light : dark; ctx.globalAlpha = rand() * .22; ctx.lineWidth = rand() * 2.2 + .3; ctx.moveTo(0, y); for (let x = 0; x <= n; x += 24) ctx.lineTo(x, y + Math.sin(x / 120 + y) * 3 + Math.sin(x / 37) * .7); ctx.stroke();}
      ctx.globalAlpha = 1;
      for (let p = 1; p < planks; p++) {ctx.fillStyle = 'rgba(8,4,2,.75)'; ctx.fillRect(0, p * n / planks - 3, n, 6);}
    });

    if (design.id === 'medieval-banded') {
      const oak = mat('oak', '#ffffff', {rough: .9, texture: grain('#4a3321', '#8a6a44', '#1c110a', 5)});
      const iron = mat('iron', '#2a2c30', {rough: .55, metal: true}), rivet = mat('rivet', '#55585e', {rough: .4, metal: true});
      box('top', width, t, depth, 0, topY, 0, 'top', oak);
      /* Four iron straps: over the top, down both long sides, riveted. */
      for (const i of [-1.5, -.5, .5, 1.5]) {
        const x = i * width / 4.6, sw = .55;
        box('strap over', sw, .05, depth + .06, x, TOP + .025, 0, 'band', iron);
        box('strap front', sw, t + .08, .08, x, topY, depth / 2 + .04, 'side', iron);
        box('strap back', sw, t + .08, .08, x, topY, -depth / 2 - .04, 'side', iron);
        for (const z of [-depth / 2 + .5, -depth / 4, 0, depth / 4, depth / 2 - .5]) add(B.MeshBuilder.CreateSphere('rivet', {diameter: .16, segments: 6}, scene), 'rivet', rivet).position.set(x, TOP + .05, z);
      }
      if (!reduced) for (const x of [-width / 3.2, width / 3.2]) {   // trestles: two sloped legs and a foot each
        for (const s of [-1, 1]) {const leg = box('trestle leg', .6, legH, .9, x, under - legH / 2, s * depth / 5, 'leg', oak); leg.rotation.x = s * .22;}
        box('trestle foot', .9, .35, depth * .62, x, floor + .18, 0, 'leg', oak);
      }
      if (!reduced) box('stretcher', width / 1.5, .4, .5, 0, floor + 1.4, 0, 'leg', oak);
    } else if (design.id === 'colonial-inlay') {
      const mahogany = mat('mahogany', '#ffffff', {rough: .25, texture: grain('#5a2316', '#8a3a24', '#2a0d08')});
      const inlay = mat('inlay', '#ffffff', {rough: .35, texture: paint('inlay', 1024, (ctx, n) => {
        ctx.fillStyle = '#4b1c12'; ctx.fillRect(0, 0, n, n);
        ctx.strokeStyle = '#e4c98a'; ctx.lineWidth = 10; ctx.strokeRect(40, n * .3, n - 80, n * .4);
        ctx.lineWidth = 7; ctx.beginPath();                      // a Greek key band along the apron
        for (let x = 60; x < n - 60; x += 64) {ctx.moveTo(x, n * .62); ctx.lineTo(x, n * .4); ctx.lineTo(x + 40, n * .4); ctx.lineTo(x + 40, n * .55); ctx.lineTo(x + 16, n * .55); ctx.lineTo(x + 16, n * .47);}
        ctx.stroke();
      })});
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
        add(B.MeshBuilder.CreateSphere('leg bulb', {diameter: .95, segments: 10}, scene), 'leg', mahogany).position.set(lx, under - ah - 1.6, lz);
        cyl('leg taper', .62, .3, legH - 2.4, lx, under - ah - 2.1 - (legH - 2.4) / 2, lz, 'leg', mahogany);
      }
    } else if (design.id === 'glass-future') {
      const glass = mat('frosted glass', '#bfe3f2', {rough: .05, alpha: .55});
      const lit = mat('lit edge', '#5fd8ff', {rough: .2, emissive: '#2fb8ff', alpha: .9});
      const brushed = mat('brushed metal', '#9aa3ad', {rough: .3, metal: true});
      box('top', width, t, depth, 0, topY, 0, 'top', glass).material.backFaceCulling = false;
      for (const [w, d, x, z] of [[width + .1, .12, 0, depth / 2], [width + .1, .12, 0, -depth / 2], [.12, depth + .1, width / 2, 0], [.12, depth + .1, -width / 2, 0]]) box('lit edge', w, t + .04, d, x, topY, z, 'edge', lit);
      for (const [w, d, x, z] of [[width - 2, .3, 0, depth / 2 - 1.2], [width - 2, .3, 0, -depth / 2 + 1.2], [.3, depth - 2, width / 2 - 1.2, 0], [.3, depth - 2, -width / 2 + 1.2, 0]]) box('frame', w, .3, d, x, under - .15, z, 'side', brushed);
      if (!reduced) {cyl('pedestal', 2.6, 1.8, legH - .6, 0, under - (legH - .6) / 2 - .3, 0, 'leg', brushed, 32); cyl('base', 9, 10, .35, 0, floor + .18, 0, 'leg', brushed, 48);}
    } else if (design.id === 'tavern-plank') {
      const planks = 7, pw = depth / planks, gap = .12;
      for (let i = 0; i < planks; i++) {
        const wood = mat('plank ' + i, '#ffffff', {rough: .95, texture: grain(['#5c4126', '#55391f', '#634727'][i % 3], '#9b7a4f', '#1d120a')});
        box('plank', width - 1.2, t - rand() * .08, pw - gap, 0, topY, -depth / 2 + pw * (i + .5), 'top', wood);
      }
      const ends = mat('breadboard', '#ffffff', {rough: .9, texture: grain('#4e3620', '#8c6b45', '#1a0f08')});
      box('breadboard left', .6, t, depth, -width / 2 + .3, topY, 0, 'edge', ends);
      box('breadboard right', .6, t, depth, width / 2 - .3, topY, 0, 'edge', ends);
      box('apron', width - 1.2, .5, .25, 0, under - .25, depth / 2 - .9, 'side', ends);
      box('apron back', width - 1.2, .5, .25, 0, under - .25, -depth / 2 + .9, 'side', ends);
      if (!reduced) for (const x of [-width / 3, width / 3]) {for (const s of [-1, 1]) {const leg = box('a-frame leg', .5, legH, .7, x, under - legH / 2, s * depth / 6, 'leg', ends); leg.rotation.x = s * .3;} box('a-frame beam', .5, .4, depth / 2, x, under - legH * .55, 0, 'leg', ends);}
    } else if (design.id === 'felt-card') {
      const leather = mat('leather', '#3a2418', {rough: .7}), felt = mat('felt', '#1f6b3a', {rough: 1}), wood = mat('frame wood', '#2b1a12', {rough: .6});
      const railW = 1.6, r = railW / 2;
      box('wood frame', width, t, depth, 0, topY, 0, 'top', wood);
      add(B.MeshBuilder.CreateGround('felt', {width: width - railW * 2, height: depth - railW * 2}, scene), 'top', felt).position.set(0, TOP + .005, 0);
      for (const [w, d, x, z] of [[width - railW * 2, railW, 0, depth / 2 - r], [width - railW * 2, railW, 0, -depth / 2 + r], [railW, depth - railW * 2, width / 2 - r, 0], [railW, depth - railW * 2, -width / 2 + r, 0]]) {
        const rail = box('rail', w, .32, d, x, TOP + .16, z, 'edge', leather); rail.scaling.y = 1;
      }
      for (const x of [-1, 1]) for (const z of [-1, 1]) cyl('rail corner', railW, railW, .32, x * (width / 2 - r), TOP + .16, z * (depth / 2 - r), 'edge', leather, 20);
      box('side front', width, .9, .2, 0, under - .45, depth / 2 - .1, 'side', leather); box('side back', width, .9, .2, 0, under - .45, -depth / 2 + .1, 'side', leather);
      box('side left', .2, .9, depth, -width / 2 + .1, under - .45, 0, 'side', leather); box('side right', .2, .9, depth, width / 2 - .1, under - .45, 0, 'side', leather);
      if (!reduced) for (const x of [-1, 1]) for (const z of [-1, 1]) cyl('tapered leg', .8, .4, legH, x * (width / 2 - 1.3), under - .9 - legH / 2, z * (depth / 2 - 1.3), 'leg', wood, 12);
    } else if (design.id === 'stone-dais') {
      const granite = mat('granite', '#ffffff', {rough: .85, texture: paint('speckle', 1024, (ctx, n) => {ctx.fillStyle = '#6f7370'; ctx.fillRect(0, 0, n, n); for (let i = 0; i < 9000; i++) {ctx.fillStyle = rand() > .5 ? '#9a9d98' : '#3e4240'; ctx.globalAlpha = rand() * .5; ctx.fillRect(rand() * n, rand() * n, rand() * 4 + 1, rand() * 4 + 1);} ctx.globalAlpha = 1;})});
      const frieze = mat('frieze', '#ffffff', {rough: .9, texture: paint('frieze', 1024, (ctx, n) => {ctx.fillStyle = '#5c605d'; ctx.fillRect(0, 0, n, n); ctx.strokeStyle = '#2b2f2d'; ctx.lineWidth = 12; for (let x = 0; x < n; x += 128) {ctx.beginPath(); ctx.arc(x + 64, n / 2, 44, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(x + 20, n / 2 - 70, 88, 140);}})});
      box('top', width - .6, t * .55, depth - .6, 0, TOP - t * .275, 0, 'top', granite);
      box('chamfer', width, t * .45, depth, 0, under + t * .225, 0, 'edge', granite);
      const fh = 1.2;
      box('frieze front', width - .2, fh, .3, 0, under - fh / 2, depth / 2 - .15, 'side', frieze); box('frieze back', width - .2, fh, .3, 0, under - fh / 2, -depth / 2 + .15, 'side', frieze);
      box('frieze left', .3, fh, depth - .2, -width / 2 + .15, under - fh / 2, 0, 'side', frieze); box('frieze right', .3, fh, depth - .2, width / 2 - .15, under - fh / 2, 0, 'side', frieze);
      if (!reduced) {box('plinth', width - 3, legH - 1.6, depth - 3, 0, under - fh - (legH - 1.6) / 2, 0, 'leg', granite); box('plinth foot', width + 1, .5, depth + 1, 0, floor + .25, 0, 'leg', granite);}
    } else if (design.id === 'obsidian-glass') {
      const obsidian = mat('obsidian', '#0b0a0d', {rough: .08, emissive: '#1a0804', texture: paint('veins', 1024, (ctx, n) => {ctx.fillStyle = '#0d0b10'; ctx.fillRect(0, 0, n, n); for (let i = 0; i < 26; i++) {ctx.strokeStyle = i % 2 ? '#ff6a1a' : '#ff3d00'; ctx.globalAlpha = .55; ctx.lineWidth = rand() * 3 + 1; ctx.beginPath(); let x = rand() * n, y = rand() * n; ctx.moveTo(x, y); for (let k = 0; k < 12; k++) {x += (rand() - .5) * 160; y += (rand() - .5) * 160; ctx.lineTo(x, y);} ctx.stroke();} ctx.globalAlpha = 1;})});
      const lava = mat('lava glass', '#ff7a2a', {rough: .2, emissive: '#c8400a', alpha: .85});
      const basalt = mat('basalt', '#1b1a1e', {rough: .9});
      box('top', width, t, depth, 0, topY, 0, 'top', obsidian);
      for (const [w, d, x, z] of [[width + .1, .16, 0, depth / 2], [width + .1, .16, 0, -depth / 2], [.16, depth + .1, width / 2, 0], [.16, depth + .1, -width / 2, 0]]) box('ember edge', w, t + .02, d, x, topY, z, 'edge', lava);
      box('skirt front', width - .4, .7, .25, 0, under - .35, depth / 2 - .3, 'side', basalt); box('skirt back', width - .4, .7, .25, 0, under - .35, -depth / 2 + .3, 'side', basalt);
      if (!reduced) {cyl('pedestal', 3, 5, legH - .8, 0, under - .7 - (legH - .8) / 2, 0, 'leg', basalt, 8); box('base', 10, .5, 9, 0, floor + .25, 0, 'leg', basalt);}
    }
    return {root, design, parts, dispose() {
      const materials=new Set(parts.map(p=>p.material).filter(Boolean));
      for(const p of parts){shadows?.removeShadowCaster(p);p.dispose();}
      for(const material of materials)material.dispose(false,true);
      root.dispose();
    }};
  }
  globalThis.CrankTables = Object.freeze({designs, resolve, build});
})();
