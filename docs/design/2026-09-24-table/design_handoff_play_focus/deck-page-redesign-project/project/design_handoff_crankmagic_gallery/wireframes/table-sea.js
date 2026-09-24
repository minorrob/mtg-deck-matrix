// The table's "sea": a slow field seen from above — mist, ocean, leaves, fire, wheat, bog — drawn
// on a low-res canvas and scaled up, cycling randomly between elements with a long crossfade.
// Subtle by design: it sits behind the seats, never over them. Honors prefers-reduced-motion.
const ELEMENTS = {
  mist:  {a:[214,216,220], b:[170,178,190], c:[236,238,242], speed:.06, scale:1.6, streak:.2, warp:.9},
  ocean: {a:[22,58,84],   b:[46,104,132],  c:[90,150,168],  speed:.09, scale:1.2, streak:.35, warp:1.2},
  leaves:{a:[46,74,40],   b:[104,140,64],  c:[178,190,96],  speed:.13, scale:2.6, streak:.45, warp:1.3},
  fire:  {a:[78,22,14],   b:[168,64,26],   c:[228,140,52],  speed:.14, scale:1.0, streak:.15, warp:1.6},
  wheat: {a:[176,140,70], b:[210,176,96],  c:[236,214,150], speed:.12, scale:2.0, streak:.7,  warp:.6},
  bog:   {a:[34,44,30],   b:[62,78,50],    c:[104,118,76],  speed:.05, scale:1.4, streak:.25, warp:1.1},
};
export function startSea(canvas, {width=320, height=200, cycleSeconds=24, fadeSeconds=6, opacity=.55, order} = {}) {
  const ctx = canvas.getContext('2d'); if (!ctx) return () => {};
  const W = 128, H = Math.max(8, Math.round(128 * height / width));
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const octx = off.getContext('2d'), img = octx.createImageData(W, H);
  canvas.width = width; canvas.height = height; ctx.imageSmoothingEnabled = true;
  const names = order || Object.keys(ELEMENTS);
  let idx = Math.floor(Math.random() * names.length), next = (idx + 1 + Math.floor(Math.random() * (names.length - 1))) % names.length;
  let time = 0, last = 0, frame = 0, elapsed = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const field = (x, y, t, e) => {
    // Layered sines with a warp term: cheap, smooth, looks like a fluid seen from above.
    const s = e.scale, st = e.streak;
    const wx = Math.sin(y * .9 * s + t * .7) * e.warp, wy = Math.cos(x * .7 * s - t * .5) * e.warp * (1 - st);
    let v = Math.sin((x + wx) * 1.3 * s + t) + Math.sin((y + wy) * (1.9 - st) * s - t * .8)
          + .5 * Math.sin((x + y * (1 - st)) * 2.7 * s + t * 1.3) + .35 * Math.sin((x * 3.1 - y * 1.7 * (1 - st)) * s - t * .9);
    return (v + 2.85) / 5.7; // ~0..1
  };
  const mix = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);
  function paint(t) {
    const cur = ELEMENTS[names[idx]], nxt = ELEMENTS[names[next]];
    const k = Math.max(0, Math.min(1, (elapsed - (cycleSeconds - fadeSeconds)) / fadeSeconds)); // crossfade at the end of a cycle
    const A = mix(cur.a, nxt.a, k), B = mix(cur.b, nxt.b, k), C = mix(cur.c, nxt.c, k);
    const e = {speed: cur.speed + (nxt.speed - cur.speed) * k, scale: cur.scale + (nxt.scale - cur.scale) * k, streak: cur.streak + (nxt.streak - cur.streak) * k, warp: cur.warp + (nxt.warp - cur.warp) * k};
    const d = img.data; let i = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = field(x / W * 4, y / H * 4 * (H / W) * 1.6, t * e.speed * 4, e);
      const col = v < .5 ? mix(A, B, v * 2) : mix(B, C, (v - .5) * 2);
      d[i++] = col[0]; d[i++] = col[1]; d[i++] = col[2]; d[i++] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.globalAlpha = opacity; ctx.clearRect(0, 0, width, height); ctx.drawImage(off, 0, 0, width, height);
    // Vignette so the edges read as a mat, not a screen.
    const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .3, width / 2, height / 2, Math.max(width, height) * .75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)'); ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    canvas.dataset.element = names[idx]; canvas.dataset.nextElement = names[next];
  }
  const tick = now => {
    if (!last) last = now; const dt = Math.min(now - last, 100) / 1000; last = now;
    time += dt; elapsed += dt;
    if (elapsed >= cycleSeconds) { idx = next; next = (idx + 1 + Math.floor(Math.random() * (names.length - 1))) % names.length; elapsed = 0; }
    paint(time); frame = requestAnimationFrame(tick);
  };
  paint(0); if (!reduced) frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
