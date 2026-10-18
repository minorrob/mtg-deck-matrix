/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * Full's physical surface. Card controls and game actions stay in the DOM board.
 * Babylon.js 9.30.0 is pinned; redistribution license: vendor/BABYLON-LICENSE.txt.
 */
(function (root) {
  'use strict';
  function create(onLost, onRestored) {
    const B = root.BABYLON, canvas = document.createElement('canvas');
    canvas.className = 'cm-stage-canvas'; canvas.setAttribute('aria-hidden', 'true');
    const engine = new B.Engine(canvas, true, {alpha: true, stencil: true, preserveDrawingBuffer: true, audioEngine: false}, false);
    // Babylon normally adds a canvas tab stop; this surface has no independent controls.
    engine.canvasTabIndex = -1; canvas.tabIndex = -1;
    engine.setHardwareScalingLevel(1 / Math.min(root.devicePixelRatio || 1, 1.5));
    const atmosphere = document.createElement('canvas'); atmosphere.setAttribute('aria-hidden', 'true');
    atmosphere.className = 'cm-stage-atmosphere'; atmosphere.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    const app = {canvas, atmosphere, engine, scene: null, signature: '', lost: false, frame: null};
    app.render = () => {
      cancelAnimationFrame(app.frame);
      const tick = () => {
        if (!app.scene || app.lost || !canvas.isConnected) return;
        app.scene.render();
        if (!app.scene.isReady()) app.frame = requestAnimationFrame(tick);
      };
      app.frame = requestAnimationFrame(tick);
    };
    engine.onContextLostObservable.add(() => {app.lost = true; canvas.hidden = true; onLost();});
    engine.onContextRestoredObservable.add(() => {app.lost = false; canvas.hidden = false; onRestored();});
    return app;
  }
  function clear(app) {
    cancelAnimationFrame(app.frame); app.frame = null;
    cancelAnimationFrame(app.ambientFrame);
    app.scene?.dispose(); app.scene = null; app.signature = ''; app.canvas.remove(); app.atmosphere.remove();
  }
  // Preserve the existing Forest/cloud artwork and peripheral motes independently of the 3D surface.
  function atmosphere(app, g, opts) {
    cancelAnimationFrame(app.ambientFrame);
    const canvas = app.atmosphere, scene = opts.background || 'volcano';
    if (scene === 'volcano') {canvas.remove(); return;}
    app.canvas.parentElement?.prepend(canvas); canvas.width = g.width; canvas.height = g.height;
    const base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
    const ctx = base.getContext('2d'); ctx.fillStyle = scene === 'forest' ? '#101e19' : '#243f53'; ctx.fillRect(0, 0, g.width, g.height);
    if (scene === 'forest') {
      for (let i = 0; i < 24; i++) {const x = (i * .071 % 1) * g.width; ctx.fillStyle = i % 2 ? '#294b35cc' : '#162d29cc'; ctx.beginPath(); ctx.moveTo(x - 55, g.height); ctx.lineTo(x - 11, 0); ctx.lineTo(x + 9, 0); ctx.lineTo(x + 65, g.height); ctx.fill();}
      for (let i = 0; i < 14; i++) {ctx.fillStyle = '#497b4a21'; ctx.beginPath(); ctx.ellipse((i * .173 % 1) * g.width, g.height * (i % 3) * .12, 150, 85, 0, 0, Math.PI * 2); ctx.fill();}
    } else for (let i = 0; i < 30; i++) {ctx.fillStyle = '#d4e6e20b'; ctx.beginPath(); ctx.ellipse((i * .137 % 1) * g.width, (i * .217 % 1) * g.height, 180, 50, 0, 0, Math.PI * 2); ctx.fill();}
    const output = canvas.getContext('2d'); let last = -1;
    const frame = (time = 0) => {
      if (!canvas.isConnected) return;
      if (last < 0 || time - last > 32) {
        last = time; output.clearRect(0, 0, canvas.width, canvas.height); output.drawImage(base, 0, 0);
        if (!opts.reduced) for (let i = 0; i < 24; i++) {
          const x = (i * .137 % 1) * g.width, y = ((i * .217 + time / 120000) % 1) * g.height;
          if (x < g.ox || x > g.width - g.ox || y < g.oy || y > g.quad[5] + 20) {output.fillStyle = '#bbe5b08c'; output.beginPath(); output.arc(x, y, 1.5, 0, Math.PI * 2); output.fill();}
        }
      }
      if (!opts.reduced && !document.hidden) app.ambientFrame = requestAnimationFrame(frame);
    };
    frame();
  }
  function paint(app, g, opts, design) {
    if (app.lost) return;
    const B = root.BABYLON, units = Math.max(g.width, g.height) / 25;
    const signature = JSON.stringify([g.width, g.height, design.id, opts.mats]);
    if (signature !== app.signature) {
      app.scene?.dispose();
      const scene = app.scene = new B.Scene(app.engine);
      scene.detachControl();
      scene.clearColor = new B.Color4(0, 0, 0, 0);
      const camera = new B.FreeCamera('table camera', B.Vector3.Zero(), scene);
      camera.minZ = .1; camera.maxZ = 200; scene.activeCamera = camera;
      const sky = new B.HemisphericLight('table sky', new B.Vector3(0, 1, 0), scene); sky.intensity = .95;
      sky.groundColor = new B.Color3(.17, .2, .22);
      const key = new B.DirectionalLight('table key', new B.Vector3(.3, -1, .5), scene); key.intensity = .8;
      const table = root.CrankTables.build(B, scene, design.id, {width: g.width / units, depth: g.planeHeight / units});
      // Every design's highest trim sits below the mats; DOM and mat projection meet at zero.
      const highest = Math.max(...table.parts.map(p => {p.computeWorldMatrix(true); return p.getBoundingInfo().boundingBox.maximumWorld.y;}));
      table.root.position.y = -highest - .015;
      const hw = g.width / units / 2, hd = g.planeHeight / units / 2;
      app.edge = B.MeshBuilder.CreateLines('phase edge', {points: [[-hw,hd],[hw,hd],[hw,-hd],[-hw,-hd],[-hw,hd]].map(([x,z]) => new B.Vector3(x, .02, z))}, scene);
      app.edge.alpha = .85; app.edge.isPickable = false;
      app.table = table; app.mats = [];
      [g.front, ...g.rear].forEach((r, i) => {
        const mesh = B.MeshBuilder.CreateGround('mat ' + i, {width: r.width / units, height: r.height / units}, scene);
        mesh.position.set((r.x + r.width / 2 - g.width / 2) / units, 0, (g.planeHeight / 2 - r.y - r.height / 2) / units);
        mesh.isPickable = false;
        const material = new B.StandardMaterial('mat ' + i, scene);
        material.disableLighting = true; material.diffuseColor = new B.Color3(0, 0, 0);
        material.emissiveColor = B.Color3.FromHexString(i ? '#21403b' : '#294942');
        material.alpha = .8;
        mesh.material = material; app.mats.push(mesh);
        const id = opts.mats?.[i];
        if (id && /^[a-z][a-z0-9-]+$/.test(id) && !['felt', 'forge', 'cavern', 'sea', 'night'].includes(id)) {
          // Keep a real backing while the image loads, and after a failed request.
          const art = mesh.clone('mat art ' + i); art.position.y = .001; art.setEnabled(false);
          const face = new B.StandardMaterial('mat art ' + i, scene);
          face.disableLighting = true; face.diffuseColor = new B.Color3(0, 0, 0); face.emissiveColor = new B.Color3(0, 0, 0);
          face.alpha = i ? .68 : .74; art.material = face;
          const texture = new B.Texture(`assets/playmats/${id}.webp`, scene, false, true, B.Texture.TRILINEAR_SAMPLINGMODE,
            () => queueMicrotask(() => {if (app.scene === scene) {face.emissiveTexture = texture; art.setEnabled(true); app.render();}}),
            () => queueMicrotask(() => {if (app.scene === scene) {texture.dispose(); app.render();}}));
        }
      });
      app.signature = signature;
    }
    const scene = app.scene, camera = scene.activeCamera, distance = 2.5 * Math.max(g.width, g.height) / units;
    app.edge.color = B.Color3.FromInts(...[16,8,0].map(shift => ((opts.combat ? 0xf0a963 : opts.instant ? 0x8ecbff : design.edge) >> shift) & 255));
    app.engine.setSize(Math.round(g.width * Math.min(root.devicePixelRatio || 1, 1.5)), Math.round(g.height * Math.min(root.devicePixelRatio || 1, 1.5)));
    camera.position.set(0, distance * Math.cos(g.angle), -distance * Math.sin(g.angle));
    camera.upVector.set(0, Math.sin(g.angle), Math.cos(g.angle)); camera.setTarget(B.Vector3.Zero());
    const focal = g.sx * distance * units;
    const projection = B.Matrix.PerspectiveFovLH(2 * Math.atan(g.height / (2 * focal)), g.width / g.height, .1, 200);
    projection.setRowFromFloats(2, 0, .14, projection.m[10], projection.m[11]);
    camera.freezeProjectionMatrix(projection);
    atmosphere(app, g, opts); scene.render(); app.render();
    app.geometry = g; app.units = units;
  }
  function inspect(app) {
    if (!app?.scene || !app.geometry) return null;
    const B = root.BABYLON, g = app.geometry, scene = app.scene;
    const project = (point, matrix) => {
      const p = B.Vector3.Project(point, matrix, scene.getTransformMatrix(), new B.Viewport(0, 0, g.width, g.height));
      return [p.x, p.y];
    };
    return {renderer: 'babylon', design: app.table.design.id, lost: app.lost,
      projected: app.mats.map(mesh => {const points = mesh.getVerticesData(B.VertexBuffer.PositionKind); return [0, 1, 3, 2].flatMap(i => project(B.Vector3.FromArray(points, i * 3), mesh.computeWorldMatrix(true)));}),
      parts: app.table.parts.filter(p => p.metadata?.part).map(p => ({part: p.metadata.part, vertices: p.getTotalVertices(), alpha: p.material?.alpha ?? 1})),
      meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length};
  }
  root.CrankStageBabylon = Object.freeze({create, clear, paint, inspect, license: 'vendor/BABYLON-LICENSE.txt'});
})(globalThis);
