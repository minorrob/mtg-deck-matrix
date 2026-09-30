#!/usr/bin/env node
/* LIFT AN ANIMATION OFF A PAINTED CHECKERBOARD, ONTO BLACK, AS A LOOPING WEBM.
 *
 *   node tools/lift-checkerboard-video.mjs <clip.mp4> <out-base> [--fade 8] [--bitrate 1400000]
 *       writes <out-base>.webm (VP9, the art on black, looping without a seam) and <out-base>-poster.webp (its first frame)
 *
 * Rob's landing animation (2026-09-30, design/art-source/landing/) came as an MP4 with the transparency checkerboard
 * painted in, like the still (tools/lift-checkerboard.mjs, whose header has the method). A transparent video that every
 * browser plays does not exist -- VP9 with alpha is not transparent in Safari, and an animated WebP of four seconds is
 * about ten megabytes -- so the art is lifted onto BLACK instead: the page draws it with mix-blend-mode: screen, under
 * which black is exactly the page behind it, on the dark themes (the light theme keeps the still).
 *
 * In Microsoft Edge (the H.264 clip needs its decoder; Playwright's Chromium has none), through Playwright:
 *
 *   1. the clip is played slowly and every frame read as it is painted (headless Edge does not seek these files);
 *   2. the first pass measures the grid (the borders' edges, as the still's tool does) and where the art reaches across
 *      all frames, for one fixed crop;
 *   3. the second pass keys each frame (color-to-alpha per cell, the soft parts smoothed across two cells) and draws it
 *      premultiplied, which is the art over black, anything within a few levels of black made black and the border
 *      faded to it, so neither the encoder's blocks nor the crop's edge can be seen under screen blending;
 *   4. the loop is made seamless: the first --fade frames are held back and cross-faded into the last ones, so the clip
 *      ends on what it begins with;
 *   5. WebCodecs encodes VP9 and a small writer here puts it in WebM (EBML: one track, one cluster, simple blocks).
 *
 * The frame rate is the clip's. Nothing is uploaded; it runs on the machine. */
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {findPlaywright} from "../tests/uat/browser-runner.mjs";

const args = process.argv.slice(2), flag = (n, d) => {const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d;};
const [clip, outBase] = args.filter((a, i) => !a.startsWith("--") && !["--fade", "--bitrate"].includes(args[i - 1]));
if (!clip || !outBase) { console.error("usage: node tools/lift-checkerboard-video.mjs <clip.mp4> <out-base> [--fade 8] [--bitrate 1400000]"); process.exit(2); }
const entry = findPlaywright();
if (!entry) { console.error("lift-checkerboard-video: Playwright is not installed"); process.exit(1); }
const pw = await import(path.isAbsolute(entry) ? pathToFileURL(entry).href : entry);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
const browser = await chromium.launch({channel: "msedge"}).catch((e) => { console.error("lift-checkerboard-video: needs Microsoft Edge for the clip's H.264 (" + e.message.split("\n")[0] + ")"); process.exit(1); });
const page = await browser.newPage();
await page.route("http://lift.localhost/**", (r) => r.request().url().endsWith(".mp4") ? r.fulfill({body: readFileSync(clip), contentType: "video/mp4"}) : r.fulfill({body: "<html><body></body></html>", contentType: "text/html"}));
await page.goto("http://lift.localhost/");   /* a .localhost origin is a secure context, which WebCodecs needs */
const out = await page.evaluate(async ({fade, bitrate}) => {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.src = "http://lift.localhost/clip.mp4"; document.body.append(video);
  await new Promise((r) => {video.oncanplay = r;});
  const W = video.videoWidth, H = video.videoHeight, grab = new OffscreenCanvas(W, H), gx = grab.getContext("2d", {willReadFrequently: true});
  /* Every frame, in order, handed to `each` as it is painted: at a quarter speed, so none is skipped. */
  const play = (each, region = [0, 0, W, H]) => new Promise((done) => {
    let last = -1, n = 0;
    const cb = (now, meta) => {
      if (meta.mediaTime !== last) {last = meta.mediaTime; gx.drawImage(video, 0, 0); each(gx.getImageData(...region).data, n++, meta.mediaTime);}
      if (video.ended) return done(n);
      video.requestVideoFrameCallback(cb);
    };
    video.currentTime = 0; video.playbackRate = 0.25; video.requestVideoFrameCallback(cb); video.onended = () => setTimeout(() => done(n), 30); video.play();
  });

  /* THE GRID and the two checker colors, from the first frame's borders (the still's tool, verbatim in method). */
  let grid = null;
  const measure = (d) => {
    const g = (x, y) => {const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3;};
    const edges = (n, at) => {const e = []; let prev = at(0) > 162.5; for (let i = 1; i < n; i++) {const v = at(i) > 162.5; if (v !== prev) e.push(i); prev = v;} return e;};
    const pick = (a, b) => a.length === b.length ? a.map((v, i) => (v + b[i]) / 2) : a;
    const xb = pick(edges(W, (i) => g(i, 3)), edges(W, (i) => g(i, H - 4))), yb = pick(edges(H, (i) => g(3, i)), edges(H, (i) => g(W - 4, i)));
    const table = (n, bounds) => {const cell = new Int32Array(n), dist = new Float32Array(n); let k = 0; for (let i = 0; i < n; i++) {while (k < bounds.length && i >= bounds[k]) k++; cell[i] = k; dist[i] = Math.min(k < bounds.length ? Math.abs(bounds[k] - i) : 1e9, k > 0 ? Math.abs(i - bounds[k - 1]) : 1e9);} return {cell, dist};};
    const mean = (x0, y0, x1, y1) => {const s = [0, 0, 0]; let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {const i = (y * W + x) * 4; s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++;} return s.map((v) => v / n);};
    const cells = []; for (let k = 0; k + 1 < xb.length && cells.length < 12; k++) {const x0 = Math.ceil(xb[k]) + 2, x1 = Math.floor(xb[k + 1]) - 2, y0 = yb[0] > 6 ? 2 : Math.ceil(yb[0]) + 2, y1 = yb[0] > 6 ? Math.floor(yb[0]) - 2 : Math.floor(yb[1]) - 2; if (x1 > x0 && y1 > y0) cells.push(mean(x0, y0, x1, y1));}
    const lum = (c) => (c[0] + c[1] + c[2]) / 3, sorted = [...cells].sort((a, b) => lum(a) - lum(b)), half = Math.floor(sorted.length / 2);
    const avg = (list) => [0, 1, 2].map((k) => list.reduce((n, c) => n + c[k], 0) / list.length);
    const cellW = xb.length > 2 ? (xb[xb.length - 1] - xb[0]) / (xb.length - 1) : 17;
    return {tx: table(W, xb), ty: table(H, yb), L: avg(sorted.slice(sorted.length - half)), D: avg(sorted.slice(0, half)), lightAt00: g(2, 2) > 162.5, rad: Math.max(3, Math.round(cellW)), cells: [xb.length, yb.length]};
  };
  /* THE KEY, over a region read at (x0, y0), w by h: the premultiplied color of each pixel over black, the soft parts
     smoothed across two cells. */
  const key = (d, x0, y0, w, h) => {
    const {tx, ty, L, D, lightAt00, rad} = grid, n = w * h;
    const A = new Float32Array(n), R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x0 + x, Y = y0 + y, i = (y * w + x) * 4, P = [d[i], d[i + 1], d[i + 2]], even = ((tx.cell[X] + ty.cell[Y]) % 2 === 0), base = (even === lightAt00) ? L : D;
      const cands = (tx.dist[X] < 2.5 || ty.dist[Y] < 2.5) ? [0, .2, .4, .6, .8, 1].map((t) => L.map((v, k) => v * t + D[k] * (1 - t))) : [base];
      let best = 1, bestB = base;
      for (const C of cands) {let a = 0; for (let k = 0; k < 3; k++) {const q = P[k] > C[k] ? (P[k] - C[k]) / (255 - C[k]) : (C[k] - P[k]) / C[k]; if (q > a) a = q;} if (a < best) {best = a; bestB = C;}}
      const j = y * w + x;
      if (best < 0.06) continue;
      A[j] = best; R[j] = bestB[0] * best + (P[0] - bestB[0]); G[j] = bestB[1] * best + (P[1] - bestB[1]); B[j] = bestB[2] * best + (P[2] - bestB[2]);
    }
    const blur = (src) => {const t = new Float32Array(n), o = new Float32Array(n);
      for (let y = 0; y < h; y++) {let s = 0; const row = y * w; for (let x = -rad; x <= rad; x++) s += src[row + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) {t[row + x] = s / (2 * rad + 1); s += src[row + Math.min(w - 1, x + rad + 1)] - src[row + Math.max(0, x - rad)];}}
      for (let x = 0; x < w; x++) {let s = 0; for (let y = -rad; y <= rad; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) {o[y * w + x] = s / (2 * rad + 1); s += t[Math.min(h - 1, y + rad + 1) * w + x] - t[Math.max(0, y - rad) * w + x];}}
      return o;};
    const bA = blur(blur(A)), bR = blur(blur(R)), bG = blur(blur(G)), bB = blur(blur(B));
    const rgba = new Uint8ClampedArray(n * 4), FLOOR = 8;
    for (let j = 0; j < n; j++) {
      const a = A[j], wgt = Math.max(0, Math.min(1, (0.97 - a) / 0.42)), oa = a * (1 - wgt) + bA[j] * wgt;
      rgba[j * 4 + 3] = 255;
      if (oa < 0.035) continue;
      const k = (oa - 0.035) / 0.965 / oa;   /* the faintest haze dropped, the rest scaled to keep its color */
      /* and whatever is left within a few levels of black made black: under screen blending black is exactly the page,
         while near-black haze and the encoder's blocks would show as faint gray squares on a bright screen */
      /* and the frame's border fades to black, so the crop's edge is never a line on the page */
      const x = j % w, y = (j - x) / w, edge = Math.min(1, x / EDGE, (w - 1 - x) / EDGE, y / EDGE, (h - 1 - y) / EDGE);
      for (let c = 0; c < 3; c++) {const v = ([R, G, B][c][j] * (1 - wgt) + [bR, bG, bB][c][j] * wgt) * k * edge; rgba[j * 4 + c] = v <= FLOOR ? 0 : (v - FLOOR) * 255 / (255 - FLOOR);}
    }
    return rgba;   /* premultiplied, opaque: the art over black */
  };

  /* PASS 1: the grid, and one crop that holds the art in every frame -- its strong parts: a faint sparkle far out would
     make the frame wide and the art small on the page, and the edge fade below takes whatever haze the crop cuts. */
  const STRONG = 150, EDGE = 32;
  let minX = W, minY = H, maxX = 0, maxY = 0, fps = 0, times = [];
  const frames1 = await play((d, n, t) => {
    times.push(t);
    if (!grid) grid = measure(d);
    const {tx, ty, L, D, lightAt00} = grid;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4, base = (((tx.cell[x] + ty.cell[y]) % 2 === 0) === lightAt00) ? L : D;
      if (tx.dist[x] < 2.5 || ty.dist[y] < 2.5) continue;
      if (Math.abs(d[i] - base[0]) + Math.abs(d[i + 1] - base[1]) + Math.abs(d[i + 2] - base[2]) > STRONG) {if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;}
    }
  });
  fps = Math.round((frames1 - 1) / (times[times.length - 1] - times[0]));
  const m = EDGE;
  minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(W - 1, maxX + m); maxY = Math.min(H - 1, maxY + m);
  const cw = (maxX - minX + 1) & ~1, ch = (maxY - minY + 1) & ~1;   /* VP9 wants even sides */

  /* PASS 2: key, hold back the first `fade` frames, cross-fade them into the last ones, encode. */
  const chunks = [], held = [], canvas = new OffscreenCanvas(cw, ch), cx = canvas.getContext("2d");
  const encoder = new VideoEncoder({output: (chunk) => {const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); chunks.push({t: chunk.timestamp, key: chunk.type === "key", data: b});}, error: (e) => {throw e;}});
  encoder.configure({codec: "vp09.00.10.08", width: cw, height: ch, bitrate, framerate: fps, latencyMode: "quality"});
  const frameUs = Math.round(1e6 / fps), total = frames1, body = total - fade;
  let written = 0, poster = null;
  const put = async (rgba) => {
    cx.putImageData(new ImageData(rgba, cw, ch), 0, 0);
    if (!poster) poster = await canvas.convertToBlob({type: "image/webp", quality: 0.85});
    const vf = new VideoFrame(canvas, {timestamp: written * frameUs, duration: frameUs});
    encoder.encode(vf, {keyFrame: written % (fps * 2) === 0}); vf.close(); written++;
  };
  /* The frames are only copied while the clip plays -- the crop, raw -- and keyed afterward, so no frame is skipped. */
  const raw = [];
  const frames2 = await play((d) => {raw.push(new Uint8ClampedArray(d));}, [minX, minY, cw, ch]);
  if (frames2 !== total) throw Error(`the second pass read ${frames2} frames and the first ${total}`);
  for (let n = 0; n < total; n++) {
    const rgba = key(raw[n], minX, minY, cw, ch); raw[n] = null;
    if (n < fade) {held.push(rgba); continue;}
    if (n >= body) {const j = n - body, w = (j + 1) / (fade + 1), h = held[j]; for (let k = 0; k < rgba.length; k += 4) {rgba[k] = rgba[k] * (1 - w) + h[k] * w; rgba[k + 1] = rgba[k + 1] * (1 - w) + h[k + 1] * w; rgba[k + 2] = rgba[k + 2] * (1 - w) + h[k + 2] * w;}}
    await put(rgba);
  }
  await encoder.flush(); encoder.close();

  /* THE WEBM: EBML header, then a segment of info, one video track and one cluster of simple blocks. */
  const enc = new TextEncoder();
  const vint = (n) => {for (let len = 1; len <= 8; len++) if (n < 2 ** (7 * len) - 1) {const b = new Uint8Array(len); let v = n; for (let i = len - 1; i >= 0; i--) {b[i] = v & 0xff; v = Math.floor(v / 256);} b[0] |= 0x80 >> (len - 1); return b;} throw Error("too large");};
  const idBytes = (id) => {const b = []; let v = id; while (v > 0) {b.unshift(v & 0xff); v = Math.floor(v / 256);} return new Uint8Array(b);};
  const cat = (parts) => {const n = parts.reduce((s, p) => s + p.length, 0), o = new Uint8Array(n); let k = 0; for (const p of parts) {o.set(p, k); k += p.length;} return o;};
  const el = (id, payload) => cat([idBytes(id), vint(payload.length), payload]);
  const uint = (id, v) => {const b = []; let x = v; do {b.unshift(x & 0xff); x = Math.floor(x / 256);} while (x > 0); return el(id, new Uint8Array(b));};
  const str = (id, s) => el(id, enc.encode(s));
  const flt = (id, v) => {const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b);};
  const ebml = el(0x1A45DFA3, cat([uint(0x4286, 1), uint(0x42F7, 1), uint(0x42F2, 4), uint(0x42F3, 8), str(0x4282, "webm"), uint(0x4287, 4), uint(0x4285, 2)]));
  const durationMs = written * 1000 / fps;
  const info = el(0x1549A966, cat([uint(0x2AD7B1, 1000000), str(0x4D80, "CrankMagic tools/lift-checkerboard-video.mjs"), str(0x5741, "CrankMagic"), flt(0x4489, durationMs)]));
  const tracks = el(0x1654AE6B, el(0xAE, cat([uint(0xD7, 1), uint(0x73C5, 1), uint(0x83, 1), str(0x86, "V_VP9"), uint(0x23E383, frameUs * 1000), el(0xE0, cat([uint(0xB0, cw), uint(0xBA, ch)]))])));
  const blocks = chunks.map((c) => {const t = Math.round(c.t / 1000); const head = new Uint8Array(4); head[0] = 0x81; head[1] = (t >> 8) & 0xff; head[2] = t & 0xff; head[3] = c.key ? 0x80 : 0x00; return el(0xA3, cat([head, c.data]));});
  const cluster = el(0x1F43B675, cat([uint(0xE7, 0), ...blocks]));
  const webm = cat([ebml, el(0x18538067, cat([info, tracks, cluster]))]);
  const b64 = (u) => {let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s);};
  return {w: W, h: H, fps, frames: total, written, fade, crop: [minX, minY, cw, ch], cells: grid.cells, rad: grid.rad, webm: b64(webm), poster: b64(new Uint8Array(await poster.arrayBuffer()))};
}, {fade: Number(flag("--fade", 8)), bitrate: Number(flag("--bitrate", 1400000))});
writeFileSync(outBase + ".webm", Buffer.from(out.webm, "base64"));
writeFileSync(outBase + "-poster.webp", Buffer.from(out.poster, "base64"));
console.log(`lift-checkerboard-video: ${out.w}x${out.h} at ${out.fps} fps, ${out.frames} frames read, ${out.written} written (the first ${out.fade} faded into the last), grid ${out.cells.join("x")} (cell ${out.rad}px), crop ${out.crop.join(",")}; wrote ${outBase}.webm (${Math.round(Buffer.from(out.webm, "base64").length / 1024)} KB) and ${outBase}-poster.webp`);
await browser.close();
