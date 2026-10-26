/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
 * THE TABLE'S PAINT (Rob, 2026-10-25: "the table material/skin looks like an 8-bit graphic. I want 32-bit graphics in this
 * game as a minimum" and "the skin on the tables should have much more detail to them; look like a more realistic
 * cartoon"). Every skin of crankmagic-stage-tables.js is painted here, pixel by pixel, in full 32-bit RGBA from layered
 * noise: wood has its rings, long fibers, knots, planks with dark seams and a lit bevel; granite its speckle, feldspar and
 * veins; felt its nap; leather its pebble and stitching; iron its hammering and rust; obsidian its ember veins, which glow.
 * Tones are softly stepped -- a painted, cartoon look -- and a normal map from the same paint gives every grain and seam
 * relief under the light.
 *
 * It runs as a Web Worker, so a 2048- or 4096-pixel skin is painted without holding the page: the table stands in its
 * plain colors and takes its skins when they are done. The page's policy admits workers from this origin only, so this
 * is a file of its own. Where a worker cannot start, the same file is loaded as a script and paints on the page
 * (globalThis.CrankPaint). A recipe in, {img, bump} out: {kind, w, h, o}.
 */
(() => {
  'use strict';
  /* ---- The painter: value noise on a 256-cell lattice, its fractal sum, and a pixel loop into RGBA. ---- */
  const CELLS = 256, M = CELLS - 1;
  function noiseOf(seed) {
    const L = new Float32Array(CELLS * CELLS); let s = (seed * 2654435761) >>> 0 || 1;
    for (let i = 0; i < L.length; i++) {s = (s * 1664525 + 1013904223) >>> 0; L[i] = s / 4294967296;}
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const r0 = (yi & M) * CELLS, r1 = ((yi + 1) & M) * CELLS, a = L[r0 + (xi & M)], b = L[r0 + ((xi + 1) & M)], c = L[r1 + (xi & M)], d = L[r1 + ((xi + 1) & M)];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    n.fbm = (x, y, oct = 4) => {let t = 0, amp = .5, f = 1, sum = 0; for (let i = 0; i < oct; i++) {t += amp * n(x * f + i * 17.3, y * f + i * 9.1); sum += amp; f *= 2.03; amp *= .5;} return t / sum;};
    return n;
  }
  /* A slow field (a fractal's broad swells, a vein's course) is sampled on a coarse grid and read back smoothly between
     its points: the same look as computing it at every pixel, at a fraction of the cost. `step` is the grid's spacing in
     pixels. Only the fine detail -- a fiber, a speckle, the nap -- is computed per pixel. */
  function field(w, h, step, fn) {
    const gw = Math.ceil(w / step) + 2, gh = Math.ceil(h / step) + 2, g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * step, j * step);
    return (x, y) => {
      const fx = x / step, fy = y / step, i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * gw + i;
      const a = g[k], b = g[k + 1], c = g[k + gw], d = g[k + gw + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  const smooth = (a, b, x) => {const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t);};
  /* The cartoon step: a tone pulled part of the way toward the nearest of `steps` levels, so shading reads as painted bands. */
  const toon = (v, steps = 6, k = .25) => v * (1 - k) + Math.round(v * steps) / steps * k;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  /* Fill w x h from fn(x, y, out) -> out[0..2] in 0..255; an outline `ink` px wide darkens the edge, as a cartoon's line. */
  /* Every surface also carries a fine tone of its own, ±2.5% a pixel: paint, not a flat fill, and every channel's full
     range used rather than a few steps of it. */
  function pixels(w, h, fn, {ink = 0} = {}) {
    const data = new Uint8ClampedArray(w * h * 4), out = [0, 0, 0];
    let r = 2463534242;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      fn(x, y, out);
      r ^= r << 13; r ^= r >>> 17; r ^= r << 5;
      let k = 1 + ((r >>> 0) / 4294967296 - .5) * .05;
      if (ink) {const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e < ink) k *= .45 + .55 * e / ink;}
      /* and each channel its own small drift, as pigment does: hue, not only light, varies across a surface. */
      r ^= r << 13; r ^= r >>> 17; r ^= r << 5; const jr = 1 + (((r >>> 0) & 255) / 255 - .5) * .06, jg = 1 + (((r >>> 8) & 255) / 255 - .5) * .06, jb = 1 + (((r >>> 16) & 255) / 255 - .5) * .06;
      const i = (y * w + x) * 4; data[i] = out[0] * k * jr; data[i + 1] = out[1] * k * jg; data[i + 2] = out[2] * k * jb; data[i + 3] = 255;
    }
    return {w, h, data};
  }
  /* Relief from the paint itself: darker is lower (a grain line, a seam, a carved cut), as a tangent-space normal map. */
  function normals({w, h, data}, strength = 2.5) {
    const lum = new Float32Array(w * h), out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < lum.length; i++) lum[i] = (data[i * 4] * .3 + data[i * 4 + 1] * .59 + data[i * 4 + 2] * .11) / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = lum[y * w + (x ? x - 1 : x)], r = lum[y * w + (x < w - 1 ? x + 1 : x)], u = lum[(y ? y - 1 : y) * w + x], d = lum[(y < h - 1 ? y + 1 : y) * w + x];
      const nx = (l - r) * strength, ny = (u - d) * strength, k = 1 / Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
      out[i] = (nx * k * .5 + .5) * 255; out[i + 1] = (ny * k * .5 + .5) * 255; out[i + 2] = (k * .5 + .5) * 255; out[i + 3] = 255;
    }
    return {w, h, data: out};
  }
  /* Through a canvas, for what is drawn rather than computed: the inlay's Greek key, the frieze's carving. */
  function drawOver(img, draw) {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(img.w, img.h) : Object.assign(document.createElement('canvas'), {width: img.w, height: img.h});
    const ctx = c.getContext('2d'); ctx.putImageData(new ImageData(img.data, img.w, img.h), 0, 0); draw(ctx, img.w, img.h);
    return {w: img.w, h: img.h, data: ctx.getImageData(0, 0, img.w, img.h).data};
  }

  /* ---- The surfaces ---- */
  /* Wood: rings across each plank's width, wobbling along its length; long fibers; a knot or two; planks parted by a dark
     seam with a lit bevel above it and a shadow below. */
  function wood(w, h, {base, light, dark, planks = 1, knots = 2, rings = 7, seed = 1, gloss = 0}) {
    const n = noiseOf(seed), D = hex(dark), Lt = hex(light), Bs = hex(base), ph = h / planks;
    const tone = Array.from({length: planks}, (_, p) => .86 + .26 * n(p * 3.7 + .5, 1.3));
    const knotsOf = Array.from({length: planks}, (_, p) => Array.from({length: knots}, (_, k) => ({x: n(p * 5.1 + k * 2.3, 7.7), y: .25 + .5 * n(p * 1.9, k * 4.4 + 2), r: .025 + .03 * n(k + p, 3.3)})).filter((_, k) => n(p * 2.2 + k, 9.9) > .35));
    const aspect = w / ph, st = Math.max(4, Math.round(w / 256));
    const at = (y) => {const p = Math.min(planks - 1, Math.floor(y / ph)); return [p, (y - p * ph) / ph];};
    const warp = field(w, h, st, (x, y) => {const [p, yp] = at(Math.min(h - 1, y)), u = x / w; return n.fbm(u * 5 + p * 7.3, yp * 1.5 + p, 4) * 2.4 + n.fbm(u * 1.2, p * 3.1, 3) * 1.6;});
    const broad = field(w, h, st, (x, y) => {const [p, yp] = at(Math.min(h - 1, y)); return n.fbm(x / w * 3, yp * 3 + p, 3);});
    return pixels(w, h, (x, y, out) => {
      const p = Math.min(planks - 1, Math.floor(y / ph)), yp = (y - p * ph) / ph, u = x / w;
      let g = yp * rings + warp(x, y);
      let core = 0;
      for (const k of knotsOf[p]) {const dx = (u - k.x) * aspect, dy = yp - k.y, d = Math.hypot(dx, dy * 1.6); g += k.r * 2.4 / (d + .05); if (d < k.r) core = Math.max(core, 1 - d / k.r);}
      const ring = g - Math.floor(g), late = smooth(0, .14, ring) * (1 - smooth(.5, 1, ring));
      const fiber = n(x / 140 + p * 11, y / 1.7);
      let v = toon(.18 + .5 * late + .22 * fiber + .1 * broad(x, y), 6, .22);
      let c = mix(D, Lt, Math.min(1, v));
      c = mix(c, Bs, .35);
      const hue = broad(x, y) - .5; c = [c[0] * (1 + hue * .12), c[1], c[2] * (1 - hue * .16)];   // warmer and cooler stretches
      c = mix(c, D, core * .85);
      let k = tone[p] * (.94 + .1 * (1 - y / h)) * (1 + gloss * .12 * Math.pow(broad(x, y), 3));
      if (planks > 1) {const e = Math.min(yp, 1 - yp) * ph; if (e < 2.2) k *= .22; else if (yp < .5 && e < 6) k *= 1.2; else if (yp > .5 && e < 6) k *= .78;}
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    }, {ink: Math.max(3, w / 400)});
  }
  /* Granite: gray from a slow fbm, black and white speckle, pink feldspar, a few pale veins. */
  function granite(w, h, {seed = 3, base = '#6f7370', ink = true} = {}) {
    const n = noiseOf(seed), G = hex(base), s = w / 1024, st = Math.max(4, Math.round(8 * s));
    const swell = field(w, h, st, (x, y) => n.fbm(x / (170 * s), y / (170 * s), 5)), course = field(w, h, st, (x, y) => Math.abs(n.fbm(x / (420 * s) + 9, y / (420 * s), 4) * 2 - 1));
    return pixels(w, h, (x, y, out) => {
      const a = swell(x, y), c = n(x / (2.2 * s), y / (2.2 * s)), b = n(x / (7 * s) + 50, y / (7 * s));
      let col = mix(mix(G, [40, 43, 42], .5), mix(G, [178, 180, 174], .4), toon(a, 5, .2));
      if (c > .83) col = mix(col, [22, 22, 24], .85); else if (c < .1) col = mix(col, [232, 230, 222], .8); else if (b > .8 && a > .45) col = mix(col, [176, 128, 116], .55);
      const vein = course(x, y); if (vein < .025) col = mix(col, [214, 214, 206], .6 * (1 - vein / .025));
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
    }, {ink: ink ? Math.max(4, w / 256) : 0});
  }
  /* Felt: the nap (a fine, short noise), a slow mottle, and a center worn lighter than the edges. */
  function felt(w, h, {seed = 5, base = '#1f6b3a'} = {}) {
    const n = noiseOf(seed), F = hex(base), s = w / 1024, mottle = field(w, h, Math.max(4, Math.round(8 * s)), (x, y) => n.fbm(x / (220 * s), y / (220 * s), 4));
    return pixels(w, h, (x, y, out) => {
      const nap = n(x / (1.1 * s), y / (1.1 * s)), mot = mottle(x, y), dx = x / w - .5, dy = y / h - .5, wear = 1 - Math.min(1, Math.hypot(dx, dy) * 1.6);
      const k = toon(.78 + .14 * mot + .1 * wear, 8, .15) + (nap - .5) * .12;
      out[0] = F[0] * k; out[1] = F[1] * k; out[2] = F[2] * k;
    });
  }
  /* Leather: pebbled grain, a darker mottle, and a stitched seam inset from every edge. */
  function leather(w, h, {seed = 7, base = '#5a3622'} = {}) {
    const n = noiseOf(seed), Lb = hex(base), s = Math.min(w, h) / 512, inset = Math.round(12 * s), dash = Math.round(16 * s);
    const mottle = field(w, h, 4, (x, y) => n.fbm(x / (120 * s), y / (120 * s), 3));
    return pixels(w, h, (x, y, out) => {
      const peb = 1 - Math.abs(n(x / (4 * s), y / (4 * s)) * 2 - 1), mot = mottle(x, y);
      let k = toon(.72 + .22 * mot, 6, .2) * (.86 + .2 * peb) * (.9 + .16 * (1 - y / h));
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      let col = Lb;
      if (Math.abs(e - inset) < 1.6 * s && ((x + y) % dash) < dash * .6) {col = [226, 205, 160]; k = 1;}
      out[0] = col[0] * k; out[1] = col[1] * k; out[2] = col[2] * k;
    }, {ink: Math.max(2, 3 * s)});
  }
  /* Iron: hammered dents and a little rust. Brushed metal: fine streaks along its length. */
  function iron(w, h, {seed = 9} = {}) {
    const n = noiseOf(seed), rusty = field(w, h, 4, (x, y) => n.fbm(x / 90 + 3, y / 90, 4));
    return pixels(w, h, (x, y, out) => {
      const dent = n.fbm(x / 18, y / 18, 3), rust = smooth(.66, .8, rusty(x, y));
      const col = mix(mix([34, 36, 41], [104, 108, 116], toon(dent, 5, .25)), [122, 62, 30], rust * .7);
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
    }, {ink: 3});
  }
  function brushed(w, h, {seed = 11, base = '#9aa3ad'} = {}) {
    const n = noiseOf(seed), C = hex(base);
    const swell = field(w, h, 4, (x, y) => n.fbm(x / 120, y / 120, 3));
    return pixels(w, h, (x, y, out) => {const k = .82 + .2 * n(x / 300, y / .9) + .06 * swell(x, y); out[0] = C[0] * k; out[1] = C[1] * k; out[2] = C[2] * k;}, {ink: 3});
  }
  /* Obsidian: black glass with a slow sheen and ember veins along the ridges of a fractal; the veins alone, to glow. */
  function obsidian(w, h, {seed = 13} = {}) {
    const n = noiseOf(seed), s = w / 1024, glow = new Uint8ClampedArray(w * h * 4), st = Math.max(2, Math.round(3 * s));
    const sheenOf = field(w, h, st * 3, (x, y) => n.fbm(x / (260 * s), y / (260 * s), 4)), ridge = field(w, h, st, (x, y) => 1 - Math.abs(n.fbm(x / (240 * s) + 4, y / (240 * s), 5) * 2 - 1));
    const img = pixels(w, h, (x, y, out) => {
      const sheen = sheenOf(x, y), r = ridge(x, y), vein = smooth(.9, .975, r);
      const base = mix([9, 8, 13], [44, 38, 58], toon(sheen * sheen, 5, .25)), hot = mix([200, 60, 10], [255, 170, 60], smooth(.96, 1, r));
      const col = mix(base, hot, vein);
      out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
      const i = (y * w + x) * 4; glow[i] = hot[0] * vein; glow[i + 1] = hot[1] * vein; glow[i + 2] = hot[2] * vein; glow[i + 3] = 255;
    }, {ink: Math.max(3, w / 400)});
    img.glow = {w, h, data: glow};
    return img;
  }
  /* Frosted glass: a pale tint with soft streaks. */
  function frost(w, h, {seed = 15} = {}) {
    const n = noiseOf(seed), s = w / 1024;
    const streak = field(w, h, 4, (x, y) => n.fbm(x / (90 * s), y / (300 * s), 4));
    return pixels(w, h, (x, y, out) => {const k = .86 + .14 * streak(x, y); out[0] = 191 * k; out[1] = 227 * k; out[2] = 242 * k;});
  }


  /* Drawn over the paint: the colonial apron's Greek key in gold, and the dais's carved frieze, cut and lit from above. */
  function inlay(w, h, o) {
    return drawOver(wood(w, h, {base: '#4b1c12', light: '#7c3220', dark: '#22090a', rings: 6, knots: 0, seed: 32, ...o}), (ctx, n) => {
      const key = (dx, dy, style, lw) => {
        ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.lineJoin = 'miter';
        ctx.strokeRect(n * .04 + dx, n * .3 + dy, n * .92, n * .4);
        ctx.beginPath();
        for (let x = n * .06; x < n * .9; x += n * .0625) {ctx.moveTo(x + dx, n * .62 + dy); ctx.lineTo(x + dx, n * .4 + dy); ctx.lineTo(x + n * .039 + dx, n * .4 + dy); ctx.lineTo(x + n * .039 + dx, n * .55 + dy); ctx.lineTo(x + n * .016 + dx, n * .55 + dy); ctx.lineTo(x + n * .016 + dx, n * .47 + dy);}
        ctx.stroke();
      };
      const u = n / 1024;
      key(3 * u, 3 * u, 'rgba(20,6,2,.8)', 9 * u); key(0, 0, '#d9b874', 7 * u); key(-1.2 * u, -1.2 * u, 'rgba(255,240,200,.55)', 2 * u);
    });
  }
  function frieze(w, h, o) {
    return drawOver(granite(w, h, {seed: 4, base: '#5c605d', ink: false, ...o}), (ctx, W, H) => {
      const u = H / 128, cut = (dx, dy, style, lw) => {ctx.strokeStyle = style; ctx.lineWidth = lw; for (let x = 0; x < W; x += H) {ctx.beginPath(); ctx.arc(x + H / 2 + dx, H / 2 + dy, H * .34, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(x + H * .16 + dx, H * .1 + dy, H * .68, H * .8);}};
      cut(0, 2 * u, 'rgba(225,225,215,.5)', 5 * u); cut(0, -2 * u, 'rgba(10,12,12,.75)', 5 * u); cut(0, 0, '#3a3e3c', 4 * u);
    });
  }
  const KINDS = {wood, granite, felt, leather, iron, brushed, obsidian, frost, inlay, frieze};
  function paint({kind, w, h, o = {}, relief = 2.5}) {
    const img = KINDS[kind](w, h, o);
    return {img, bump: normals(img, relief)};
  }
  const api = Object.freeze({paint, kinds: Object.keys(KINDS)});
  if (typeof document === 'undefined' && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.onmessage = (ev) => {
      const {id, recipe} = ev.data || {};
      try {
        const r = paint(recipe), moved = [r.img.data.buffer, r.bump.data.buffer];
        if (r.img.glow) moved.push(r.img.glow.data.buffer);
        self.postMessage({id, r}, moved);
      } catch (error) {self.postMessage({id, error: String(error && error.message || error)});}
    };
  } else globalThis.CrankPaint = api;
})();
