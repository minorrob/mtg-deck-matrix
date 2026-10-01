/* THE TABLE'S SEA: a slow field seen from above, drawn behind a lobby seat.
 *
 * A seat's quadrant is filled by the element that says what the seat is doing -- mist for an
 * empty chair, wheat for an invitation out, ocean while a deck resolves, leaves when the player
 * is ready, fire when something is wrong. That is the design's legend: the status pill names the
 * state in words and the element says it at a glance from across the room, so four seats can be
 * read without reading four labels (DELTA-play-and-implementation.md, B.1).
 *
 * Ported from the designer's screens/table-sea.js, which is an ES module. This app has no build
 * step and loads classic scripts, so it exposes CrankSea on the global instead of exporting, and
 * takes one fixed element per canvas rather than cycling: a seat's element means something, so it
 * must not drift to another while the reader is looking at it. The cycling version is what the
 * game board's tabletop wants later, and `order` is kept for it.
 *
 * The palette below is the designer's, and it is deliberately NOT read from the tokens: these are
 * pictures of water, wheat and fire, not surfaces of the app, and they read the same in both
 * themes because a lit hearth is a lit hearth on cream as on slate. tests/design-tokens.mjs
 * exempts this file by name for that reason.
 *
 * Honors prefers-reduced-motion: the field is painted once and never animated. `still: true` asks for the same
 * whatever the setting (the game board's tabletop, for now: Rob, 2026-09-30, "make it static"), and paints the
 * field at its first moment, so the same element at the same size is the same picture every time it is drawn.
 */
(function (root) {
  "use strict";
  const ELEMENTS = {
    mist:  {a: [214, 216, 220], b: [170, 178, 190], c: [236, 238, 242], speed: .06, scale: 1.6, streak: .2,  warp: .9},
    ocean: {a: [22, 58, 84],    b: [46, 104, 132],  c: [90, 150, 168],  speed: .09, scale: 1.2, streak: .35, warp: 1.2},
    leaves:{a: [46, 74, 40],    b: [104, 140, 64],  c: [178, 190, 96],  speed: .13, scale: 2.6, streak: .45, warp: 1.3},
    fire:  {a: [78, 22, 14],    b: [168, 64, 26],   c: [228, 140, 52],  speed: .14, scale: 1.0, streak: .15, warp: 1.6},
    wheat: {a: [176, 140, 70],  b: [210, 176, 96],  c: [236, 214, 150], speed: .12, scale: 2.0, streak: .7,  warp: .6},
    bog:   {a: [34, 44, 30],    b: [62, 78, 50],    c: [104, 118, 76],  speed: .05, scale: 1.4, streak: .25, warp: 1.1},
  };

  /* Which element a seat's state wears (DELTA B.1). One name per state, and an unknown state
     gets mist rather than nothing, because an unfilled quadrant is what mist means. */
  const FOR_STATE = {
    empty: "mist", invited: "wheat", pending: "wheat", deck: "ocean", ready: "leaves", error: "fire",
  };
  const elementFor = (state) => FOR_STATE[state] || "mist";

  function startSea(canvas, options) {
    const o = options || {};
    const width = o.width || 320, height = o.height || 200;
    const opacity = o.opacity === undefined ? .55 : o.opacity;
    const cycleSeconds = o.cycleSeconds || 24, fadeSeconds = o.fadeSeconds || 6;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return function () {};
    const W = 128, H = Math.max(8, Math.round(128 * height / width));
    const off = document.createElement("canvas"); off.width = W; off.height = H;
    const octx = off.getContext("2d"), img = octx.createImageData(W, H);
    canvas.width = width; canvas.height = height; ctx.imageSmoothingEnabled = true;

    /* One fixed element, or a cycle through `order` when the caller asks for one. */
    const names = o.element ? [o.element] : (o.order || Object.keys(ELEMENTS));
    let idx = names.length === 1 ? 0 : Math.floor(Math.random() * names.length);
    let next = names.length === 1 ? 0 : (idx + 1 + Math.floor(Math.random() * (names.length - 1))) % names.length;
    /* THE PAGE'S CLOCK, not the canvas's own (Rob, 2026-09-29: the background "playing ... for about a second then
       jumping back to the beginning"): the lobby redrew every two seconds and each new canvas began at zero. Read from
       the page's clock, a canvas that replaces another carries on from the same moment, so a redraw never shows. */
    const clock = () => (root.performance && root.performance.now ? root.performance.now() : Date.now()) / 1000;
    let time = clock(), last = 0, frame = 0, elapsed = 0;
    let reduced = false;
    const fixed = !!o.still;
    const still = () => { if (fixed) return true; try { return root.CrankMotion ? root.CrankMotion.reduced() : matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
    reduced = still();

    /* Layered sines with a warp term: cheap, smooth, and it looks like a fluid seen from above. */
    const field = (x, y, t, e) => {
      const s = e.scale, st = e.streak;
      const wx = Math.sin(y * .9 * s + t * .7) * e.warp, wy = Math.cos(x * .7 * s - t * .5) * e.warp * (1 - st);
      const v = Math.sin((x + wx) * 1.3 * s + t) + Math.sin((y + wy) * (1.9 - st) * s - t * .8)
        + .5 * Math.sin((x + y * (1 - st)) * 2.7 * s + t * 1.3) + .35 * Math.sin((x * 3.1 - y * 1.7 * (1 - st)) * s - t * .9);
      return (v + 2.85) / 5.7;
    };
    const mix = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);

    function paint(t) {
      const cur = ELEMENTS[names[idx]] || ELEMENTS.mist, nxt = ELEMENTS[names[next]] || cur;
      const k = names.length === 1 ? 0 : Math.max(0, Math.min(1, (elapsed - (cycleSeconds - fadeSeconds)) / fadeSeconds));
      const A = mix(cur.a, nxt.a, k), B = mix(cur.b, nxt.b, k), C = mix(cur.c, nxt.c, k);
      const e = {
        speed: cur.speed + (nxt.speed - cur.speed) * k, scale: cur.scale + (nxt.scale - cur.scale) * k,
        streak: cur.streak + (nxt.streak - cur.streak) * k, warp: cur.warp + (nxt.warp - cur.warp) * k,
      };
      const d = img.data; let i = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = field(x / W * 4, y / H * 4 * (H / W) * 1.6, t * e.speed * 4, e);
        const col = v < .5 ? mix(A, B, v * 2) : mix(B, C, (v - .5) * 2);
        d[i++] = col[0]; d[i++] = col[1]; d[i++] = col[2]; d[i++] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.globalAlpha = opacity; ctx.clearRect(0, 0, width, height); ctx.drawImage(off, 0, 0, width, height);
      /* A vignette, so the edges read as a mat rather than as a screen. */
      const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .3, width / 2, height / 2, Math.max(width, height) * .75);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.35)");
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
      canvas.dataset.element = names[idx];
      canvas.dataset.t = t.toFixed(2);
    }

    const tick = (now) => {
      if (!last) last = now;
      const dt = Math.min(now - last, 100) / 1000; last = now;
      time = clock(); elapsed += dt;
      if (names.length > 1 && elapsed >= cycleSeconds) {
        idx = next; next = (idx + 1 + Math.floor(Math.random() * (names.length - 1))) % names.length; elapsed = 0;
      }
      paint(time);
      /* Reduce motion turned on mid-cycle stops here, on the frame just painted. */
      frame = still() ? 0 : requestAnimationFrame(tick);
    };
    paint(fixed ? 0 : time);
    if (!reduced) frame = requestAnimationFrame(tick);
    const wake = () => { if (!frame && !still()) { last = 0; frame = requestAnimationFrame(tick); } };
    const unhear = root.CrankMotion ? root.CrankMotion.onChange(wake) : function () {};
    return function () { cancelAnimationFrame(frame); unhear(); };
  }

  root.CrankSea = {startSea, elementFor, ELEMENTS};
})(typeof globalThis !== "undefined" ? globalThis : this);
