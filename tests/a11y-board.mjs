/* THE ACCESSIBILITY PASS: WCAG 2.1 AA ON THE BOARD AND THE LOBBY (docs/plan-to-done-2026-09-30.md, Part 5's G-A list
 * and Part 6's UI/UX paragraph), measured in a real browser on a real table.
 *
 * A four-seat game -- Rob at 1400x900 in the default dark theme (Moss & Iron), Maya at 1280x800 in the light one (Felt &
 * Cream), two AIs -- played a few turns through the board's own controls (tests/uat/board-person.mjs), behind the pages
 * the real table (cloud/game-room.mjs) and its socket, as tests/table-board.mjs sets one up.
 *
 *   Contrast    1.4.3 and 1.4.11. Every word on the board and in the lobby, read from PIXELS: the screen with the words
 *               shown and again with every word hidden (text-shadows off in both, so a shadow counts for nothing); the
 *               pixels a word's glyphs change are its glyphs, and the hidden screen's pixels under them are what is
 *               behind it -- its backing, the scrim, the artwork. Its computed color, composited over each, must reach
 *               4.5:1 (3:1 for large text, and for a glyph that is a symbol rather than a word) at the WORST glyph
 *               pixel: a backing is there to cover the art under every glyph, so one glyph over the art is a failure,
 *               not noise (the 1st and 5th percentiles are reported beside it). Over every mat the board offers (the
 *               five it draws and Rob's 25 artworks), in Focus, Table and Full screen, in both themes; the board's
 *               chrome in the other two themes too. A disabled control is exempt (1.4.3's inactive components), and a
 *               color emoji is a picture, read for its button instead. The focus ring is read the same way: focused
 *               against unfocused, along rays out of the control's edge, at least one ring pixel on each ray 3:1 from
 *               what was there.
 *   Focus       2.4.3, 2.4.7, 2.1.1, 2.1.2. Tab, in each view, walks the board in reading order and reaches every control
 *               on it, each with a ring and none covered; nothing behind the board takes the focus; a view arriving
 *               keeps the focus where it was; a menu closed by Escape gives it back to its button; the modal pop-ups
 *               (Show hand, the app's dialogs) hold it while open and give it back when they close, the board redrawn
 *               or not. The lobby likewise.
 *   Keys        2.1.1. The keys the board's handlers bind, read from crankmagic-board.js, are the keys Help documents,
 *               and each does what Help says.
 *   Labels      1.1.1, 4.1.2. Every card's accessible name (the browser's own, over CDP) is its name and what is shown
 *               on it: tapped, power and toughness, damage, counters, attacking or blocking, chosen, selected,
 *               face-down; and no name, label or text anywhere on a page carries a card that seat may not see.
 *   Announced   4.1.2, 4.1.3. One polite status region, outside the redrawn board, says each question the room asks
 *               (and the turns that went by, the card shown large); the question's own panel is named by it; a modal
 *               pop-up is role=dialog, aria-modal, named.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure. A11Y_SHOTS=<dir>
 * writes a screenshot of each view measured.
 */
import assert from "node:assert/strict";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {inflateSync} from "node:zlib";
import {openBrowser, legendaryNames} from "./uat/browser-runner.mjs";
import {boardPerson} from "./uat/board-person.mjs";
import {basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {MATS} from "../game/room/table.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const failures = [];
/* Every check is counted and a failing one recorded, so one run names every place that is wrong, not the first. */
/* A11Y_FAIL_FAST=1 stops at the first (for a breaks run, where one failure is all that is asked). */
const FAIL_FAST = process.env.A11Y_FAIL_FAST === "1";
const ok = (c, m) => {checks += 1; if (!c) {failures.push(m); if (FAIL_FAST) throw Object.assign(new Error(m), {counted: true});}};
const VERBOSE = process.env.A11Y_VERBOSE === "1", T0 = Date.now();
const lap = (what) => {if (VERBOSE) console.log(`  ${((Date.now() - T0) / 1000).toFixed(1)} s  ${what}  (${spent.words[1]} screens read, ${(spent.words[0] / 1000).toFixed(1)} s; ${spent.rings[1]} rings, ${(spent.rings[0] / 1000).toFixed(1)} s)`);};
const SHOTS = process.env.A11Y_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

/* ---- the table: the real one, each person's deck holding cards only they own by name ---- */
const legendary = (name) => (legendaryNames().has(name) || / General$/.test(name) ? {supertypes: ["Legendary"]} : {});
const cards = (name) => basicCards(name) ?? {types: ["Creature"], ...legendary(name), power: 2, toughness: 2, manaCost: "{1}"};
const ROB = "rob@example.com", MAYA = "maya@example.com";
let clock = Date.parse("2026-10-11T12:00:00Z");
const map = new Map(), live = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; live.push(s);}, getWebSockets: () => live.filter((s) => !s.closed), getTags: (s) => s.tags};
const object = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "a11ytable01";
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const call = async (p, email, body) => (await serial(() => object.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})})))).json();
const DECKS = {Rob: "Forest", Maya: "Island", Nina: "Mountain", Theo: "Plains"};
const deckOf = (who) => ({name: `${who}'s deck`, commander: [`${who} General`], cards: [...Array(40)].map((_, i) => i % 2 ? DECKS[who] : `${who} Secret ${i}`)});
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => object.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
/* Each page's socket, carried to the table's /connect, every frame kept. */
const frames = {[ROB]: [], [MAYA]: []}, routes = {[ROB]: [], [MAYA]: []};
function carry(email) {
  return (ws) => {
    const server = {tags: null, closed: false, send(f) {if (!this.closed) {frames[email].push(f); ws.send(f);}}, close() {this.closed = true;}};
    routes[email].push({ws, server});
    serial(async () => {
      object.socketPair = () => [{}, server];
      object.upgraded = () => ({status: 101});
      const r = await object.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": email}}));
      if (r.status !== 101) {server.closed = true; ws.close({code: 1008, reason: "refused"});}
    });
    ws.onMessage((message) => serial(() => object.webSocketMessage(server, message)));
    ws.onClose(() => serial(async () => {if (!server.closed) {server.closed = true; await object.webSocketClose(server, 1001);}}));
  };
}
const views = (email) => frames[email].map((f) => JSON.parse(f)).filter((f) => f.view).map((f) => f.view);
const lastFrame = (email) => JSON.parse(frames[email].filter((f) => JSON.parse(f).view).at(-1));
/* A view handed to one page as the room would (its own revision, so the real one handed back after is taken again). */
const hand = (email, frame) => routes[email].at(-1).ws.send(JSON.stringify(frame));

const CARD_ART = readFileSync(path.join(ROOT, "assets", "playmats", "sky-tree-thumb.webp"));
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const {browser, base, stub, close} = await openBrowser({name: "a11y-board", flag: "GEOMETRY_REQUIRED"});
async function person(email, viewport) {
  const context = await browser.newContext({viewport, serviceWorkers: "block"});
  const page = await context.newPage();
  /* The browser's own full screen is not asked for (it moves the window under a measurement); Full screen the view
     fills the window by itself, as it does where a browser will not (tests/table-board.mjs walks the other). */
  await page.addInitScript(() => Object.defineProperty(Document.prototype, "fullscreenEnabled", {get: () => false}));
  if (stub) await stub(page);
  /* A card's picture is opaque, as the real ones are, so its printed name is under it as it is in play (the shared stub's
     one translucent pixel would leave the frame's name showing through, to be read for a contrast no player sees). */
  await page.route("**://cards.scryfall.io/**", (r) => r.fulfill({status: 200, contentType: "image/webp", body: CARD_ART}));
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  await page.route(`${base}/api/ai/**`, (r) => r.fulfill({status: 503, json: {error: "The Coach is not switched on here yet."}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/tables**`, (r) => answer(r, email));
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry(email));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.__cdp = await context.newCDPSession(page);
  return {context, page, email, errors, cdp: page.__cdp};
}
const theme = (page, choice) => page.evaluate((t) => document.querySelector(`[data-action=set-theme][data-theme-choice=${t}]`).click(), choice);
const view = async (page, v) => {
  await page.click(`[data-action=board-view][data-view=${v}]`);
  await page.locator(v === "full" ? ".cm-full-rail" : v === "table" ? ".cm-board-table" : ".cm-board-mat").waitFor();
  await page.waitForTimeout(120);
};
/* Rest the pointer where nothing reacts to it (a card under it would be shown large). */
const rest = async (page) => {const s = page.viewportSize(); await page.mouse.move(s.width - 2, s.height - 2);};

/* ---- CONTRAST, FROM PIXELS ---- */
/* A screenshot's pixels, read here rather than in the page (no dependency: Chromium's PNG is 8-bit, not interlaced). */
function decodePng(buf) {
  let p = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString("latin1", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") {w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12] !== 0) throw Error("a screenshot that is not an 8-bit, non-interlaced PNG");}
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  const bpp = {2: 3, 6: 4}[type];
  if (!bpp) throw Error(`a screenshot PNG of color type ${type}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y += 1) {
    const at = y * (stride + 1), f = raw[at];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = raw[at + 1 + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;}
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x += 1) {const o = (y * w + x) * 4, i = x * bpp; out[o] = cur[i]; out[o + 1] = cur[i + 1]; out[o + 2] = cur[i + 2]; out[o + 3] = 255;}
    [prev, cur] = [cur, prev];
  }
  return {w, h, data: out};
}
/* The screen, through the page's own DevTools session with the fast PNG encoder (lossless still; seven times quicker than
   the default on this shared machine), the clip in the viewport's pixels. */
async function capture(page, clip = null, save = "") {
  const at = clip ? await page.evaluate(() => [scrollX, scrollY]) : [0, 0];
  const {data} = await page.__cdp.send("Page.captureScreenshot", {format: "png", optimizeForSpeed: true, ...(clip ? {clip: {x: clip.x + at[0], y: clip.y + at[1], width: clip.width, height: clip.height, scale: 1}} : {})});
  const png = Buffer.from(data, "base64");
  if (SHOTS && save) writeFileSync(path.join(SHOTS, `${save.replace(/[^a-z0-9-]+/gi, "-").slice(0, 80)}.png`), png);
  return decodePng(png);
}
/* Held still while it is read: no transition, no animation, and no animation frame -- the seas are canvases drawn a
   frame at a time, and a sea that moved between the two screens would be read as glyphs. The frames asked for meanwhile
   are drawn after. */
async function hold(page) {
  const style = await page.addStyleTag({content: STILL});
  await page.evaluate(() => {
    if (globalThis.__held) return;
    const raf = globalThis.requestAnimationFrame, queue = [];
    globalThis.__held = {raf, queue};
    globalThis.requestAnimationFrame = (cb) => {queue.push(cb); return queue.length;};
  });
  return async () => {
    await page.evaluate(() => {const h = globalThis.__held; if (!h) return; globalThis.requestAnimationFrame = h.raf; delete globalThis.__held; for (const cb of h.queue) h.raf.call(globalThis, cb);});
    await style.evaluate((el) => el.remove());
  };
}
/* WCAG 2.1's relative luminance. */
const LIN = Array.from({length: 256}, (_, v) => {v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;});
const lin = (v) => (Number.isInteger(v) && v >= 0 && v < 256 ? LIN[v] : ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const STILL = "*,*::before,*::after{transition:none!important;animation-play-state:paused!important;caret-color:transparent!important;text-shadow:none!important}#cm-notice{display:none!important}";
const HIDE = "*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important}";
/* A glyph that is a picture (a color emoji) has no ink color to read: its button is read instead. */
const EMOJI = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+$/u;
async function wordsContrast(page, scope, label = "") {
  await page.evaluate(() => {const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur();});
  /* every picture on the screen loaded first (one arriving between the two screens would read as glyphs), then held still
     -- before the words are found, so each is where it is drawn */
  await page.waitForFunction(() => [...document.images].every((i) => {const r = i.getBoundingClientRect(); return i.complete || r.bottom < 0 || r.top > innerHeight || r.width === 0;}), null, {timeout: 5000}).catch(() => {});
  const thaw = await hold(page);
  const items = await page.evaluate(({scope, emoji}) => {
    const out = [], vw = innerWidth, vh = innerHeight, EMOJI = new RegExp(emoji, "u");
    const one = document.createElement("canvas"); one.width = one.height = 1;
    const ox = one.getContext("2d", {willReadFrequently: true});
    for (const root of document.querySelectorAll(scope)) for (const el of [root, ...root.querySelectorAll("*")]) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own.length || el.closest(".cm-sr-only, script, style, option, [inert]")) continue;
      /* 1.4.3: text in an inactive (disabled) control has no contrast requirement */
      if (el.closest(":disabled, [aria-disabled=true]")) continue;
      const words = own.map((n) => n.textContent.trim()).join(" ");
      if (EMOJI.test(words)) continue;
      const st = getComputedStyle(el);
      if (st.visibility !== "visible" || st.display === "none") continue;
      let op = 1;
      for (let n = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
      if (op < 0.02) continue;
      /* words kept for a screen reader alone (a box of a pixel, clipped away) are not on the screen to be read */
      const box = el.getBoundingClientRect();
      if ((st.overflowX !== "visible" || st.clipPath !== "none") && (box.width <= 2 || box.height <= 2)) continue;
      /* the boxes the text can paint in: its line boxes, clipped by its own box and the ancestors that clip it (none above
         a fixed box) */
      let clip = {l: 0, t: 0, r: vw, b: vh};
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.overflowX !== "visible" || s.overflowY !== "visible" || s.clipPath !== "none") {const b = n.getBoundingClientRect(); clip = {l: Math.max(clip.l, b.left), t: Math.max(clip.t, b.top), r: Math.min(clip.r, b.right), b: Math.min(clip.b, b.bottom)};}
        if (s.position === "fixed") break;
      }
      const rects = [];
      /* the words' own glyphs: a color emoji among them (the vitals' ☠) is a picture in its own colors, not ink, and is
         left out of the boxes read */
      const runs = own.flatMap((n) => [...n.textContent.matchAll(/[^\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/gu)].filter((m) => m[0].trim()).map((m) => [n, m.index, m.index + m[0].length]));
      for (const [n, from, to] of runs) {
        const r = document.createRange(); r.setStart(n, from); r.setEnd(n, to);
        for (const b of r.getClientRects()) {
          const x = {l: Math.max(clip.l, b.left - 1), t: Math.max(clip.t, b.top - 1), r: Math.min(clip.r, b.right + 1), b: Math.min(clip.b, b.bottom + 1)};
          if (x.r - x.l >= 1 && x.b - x.t >= 1) rects.push([Math.floor(x.l), Math.floor(x.t), Math.ceil(x.r), Math.ceil(x.b)]);
        }
      }
      if (!rects.length) continue;
      /* the ink as painted: its color, through every brightness() filter over it (a card dimmed is dimmed, words and all) */
      let bright = 1;
      for (let n = el; n; n = n.parentElement) for (const m of getComputedStyle(n).filter.matchAll(/brightness\(([\d.]+)\)/g)) bright *= Number(m[1]);
      ox.clearRect(0, 0, 1, 1); ox.fillStyle = "rgb(1, 2, 3)"; ox.fillStyle = st.color; ox.fillRect(0, 0, 1, 1);
      const [cr, cg, cb, ca] = ox.getImageData(0, 0, 1, 1).data, rgba = [Math.min(255, cr * bright), Math.min(255, cg * bright), Math.min(255, cb * bright), ca / 255];
      const size = parseFloat(st.fontSize), weight = Number(st.fontWeight) || 400, symbol = !/[\p{L}\p{N}]/u.test(words);
      const where = el.closest(".cm-mat") ? "mat" : el.closest(".cm-board-hand") ? "hand" : el.closest(".cm-board-strip, .cm-full-pill, .cm-phone-pill") ? "strip"
        : el.closest(".cm-board-pane, .cm-full-side, .cm-full-rail") ? "side" : el.closest(".cm-board-table") ? "table" : el.closest(".cm-lobby-seat") ? "seat" : el.closest(".cm-table-center") ? "rules" : "page";
      out.push({text: words.slice(0, 40), cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || el.tagName).slice(0, 40) || el.tagName,
        where, rgba, op, need: symbol || size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5, rects, nodes: own,
        /* on top where it is drawn (not under a card's picture, say): what is at its middle is it, or holds it */
        seen: (() => {const [l, t, rr, bb] = rects[0], hit = document.elementFromPoint((l + rr) / 2, (t + bb) / 2); return !!hit && (el.contains(hit) || hit.contains(el));})(),
        trail: [...function* () {for (let n = el.parentElement; n && n !== root; n = n.parentElement) yield String(n.className || n.tagName).split(" ")[0];}()].slice(0, 6).join("<")});
    }
    /* and every other word on the page, read for nothing but where it lies (a word under the fanned hand's veil, an
       icon in another's pill): its pixels are no measured word's glyphs */
    const others = [], measured = new Set(out.flatMap((o) => o.nodes));
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim() || measured.has(n)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) if (b.width >= 1 && b.height >= 1 && b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh) others.push([Math.floor(b.left - 1), Math.floor(b.top - 1), Math.ceil(b.right + 1), Math.ceil(b.bottom + 1)]);
    }
    /* the pictures drawn in currentColor (an icon beside the words) go with the words when they are hidden: their boxes too */
    for (const svg of document.querySelectorAll("svg")) {const b = svg.getBoundingClientRect(); if (b.width && b.height && b.right > 0 && b.bottom > 0 && b.left < vw && b.top < vh) others.push([Math.floor(b.left - 1), Math.floor(b.top - 1), Math.ceil(b.right + 1), Math.ceil(b.bottom + 1)]);}
    return {items: out.map(({nodes, ...o}) => o), others};
  }, {scope, emoji: EMOJI.source}).then(({items, others}) => {items.others = others; return items;});
  await page.waitForTimeout(40);
  const shown = await capture(page, null, process.env.A11Y_DEBUG && label.includes(process.env.A11Y_DEBUG) ? `words ${label}` : "");
  const hide = await page.addStyleTag({content: HIDE});
  await page.waitForTimeout(60);
  const bare = await capture(page);
  await hide.evaluate((el) => el.remove());
  await thaw();
  const A = shown.data, B = bare.data, round = (x) => Math.round(x * 100) / 100;
  /* A pixel inside two words' boxes (a card's name across its neighbor's in the fanned hand, a pill drawn over another's
     words) cannot be said to be either's glyph: it is read for neither. */
  const cover = new Uint8Array(shown.w * shown.h);
  for (const [l, t, rr, bb] of [...items.flatMap((it) => it.rects), ...items.others]) for (let y = Math.max(0, t); y < Math.min(bb, shown.h); y += 1) for (let x = Math.max(0, l); x < Math.min(rr, shown.w); x += 1) if (cover[y * shown.w + x] < 255) cover[y * shown.w + x] += 1;
  return items.map((it) => {
    const [r, g, bl, al] = it.rgba, alpha = al * it.op, ratios = [];
    let low = null;
    for (const [l, t, rr, bb] of it.rects) for (let y = t; y < Math.min(bb, shown.h); y += 1) for (let x = l; x < Math.min(rr, shown.w); x += 1) {
      const i = (y * shown.w + x) * 4;
      if (cover[y * shown.w + x] > 1) continue;
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) < 24) continue;   /* no glyph here */
      const R = B[i], G = B[i + 1], Bc = B[i + 2];
      /* a glyph of THIS word moves the pixel from what is behind toward its ink, by the share of it the glyph covers; a
         change any other way (a word behind a veil, a picture in currentColor) is not its glyph */
      const ink = [r * alpha + R * (1 - alpha), g * alpha + G * (1 - alpha), bl * alpha + Bc * (1 - alpha)], shares = [];
      for (let c = 0; c < 3; c += 1) if (Math.abs(ink[c] - B[i + c]) >= 12) shares.push((A[i + c] - B[i + c]) / (ink[c] - B[i + c]));
      if (!shares.length || shares.some((s) => s < -0.15 || s > 1.35) || shares.reduce((a, s) => a + s, 0) / shares.length < 0.3) continue;
      const L1 = lum(r * alpha + R * (1 - alpha), g * alpha + G * (1 - alpha), bl * alpha + Bc * (1 - alpha)), L2 = lum(R, G, Bc);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (!low || ratio < low.ratio) low = {ratio, x, y, shown: [A[i], A[i + 1], A[i + 2]], bare: [R, G, Bc]};
      ratios.push(ratio);
    }
    /* A word on top of the screen whose glyphs change nothing is its ground's own color: read against that ground. */
    let flat = false;
    if (!ratios.length && it.seen) {
      const ground = [[], [], []];
      for (const [l, t, rr, bb] of it.rects) for (let y = t; y < Math.min(bb, shown.h); y += 1) for (let x = l; x < Math.min(rr, shown.w); x += 1) {const i = (y * shown.w + x) * 4; if (cover[y * shown.w + x] <= 1) for (let c = 0; c < 3; c += 1) ground[c].push(B[i + c]);}
      if (ground[0].length) {
        const [R, G, Bc] = ground.map((v) => v.sort((p, q) => p - q)[v.length >> 1]);
        const L1 = lum(r * alpha + R * (1 - alpha), g * alpha + G * (1 - alpha), bl * alpha + Bc * (1 - alpha)), L2 = lum(R, G, Bc);
        ratios.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
        flat = true;
        if (process.env.A11Y_DEBUG && ratios[0] < it.need) console.log("  debug flat", it.text, it.cls, it.trail, JSON.stringify({rgba: it.rgba, op: it.op, rects: it.rects, ground: [R, G, Bc], n: ground[0].length}));
      }
    }
    if (process.env.A11Y_DEBUG && low && low.ratio < it.need) console.log("  debug", it.text, it.cls, it.trail, JSON.stringify({rgba: it.rgba, op: it.op, rects: it.rects, low}));
    ratios.sort((x, y) => x - y);
    const at = (q) => round(ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * q))]);
    return {text: it.text, cls: it.cls, where: it.where, need: it.need, glyphs: flat ? 0 : ratios.length, flat, worst: ratios.length ? round(ratios[0]) : null, p01: ratios.length ? at(0.01) : null, p05: ratios.length ? at(0.05) : null};
  });
}
/* The worst word of each kind, kept for the report. */
const worstSeen = new Map();
const kindOf = (w) => `${w.where} ${w.cls.split(" ")[0]}`;
const spent = {words: [0, 0], rings: [0, 0]};
async function readWords(page, scope, label, {min = 6} = {}) {
  const t = Date.now(), words = await wordsContrast(page, scope, label);
  spent.words[0] += Date.now() - t; spent.words[1] += 1;
  const read = words.filter((w) => w.glyphs > 0 || w.flat), low = read.filter((w) => w.worst < w.need);
  for (const w of read) {const k = kindOf(w), was = worstSeen.get(k); if (!was || w.worst < was.worst) worstSeen.set(k, {...w, label});}
  ok(read.length >= min && !low.length, `${label}: every word reads at 4.5:1 (3:1 large) at its worst glyph pixel (${read.length} read${low.length ? `; under: ${low.sort((x, y) => x.worst - y.worst).slice(0, 8).map((w) => `"${w.text}" (.${w.cls}, ${w.where}) ${w.worst} of ${w.need}`).join("; ")}` : `; the lowest ${read.sort((x, y) => x.worst / x.need - y.worst / y.need)[0]?.worst}`})`);
  return words;
}

/* THE FOCUS RING, from pixels: the control focused against the control unfocused, along rays out of its edge. */
async function ringContrast(page, selector, label = "") {
  const el = page.locator(selector).first();
  if (!await el.count()) return null;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const box = await el.boundingBox();
  if (!box) return null;
  const vp = page.viewportSize(), PAD = 10;
  const clip = {x: Math.max(0, Math.floor(box.x - PAD)), y: Math.max(0, Math.floor(box.y - PAD))};
  clip.width = Math.min(vp.width, Math.ceil(box.x + box.width + PAD)) - clip.x; clip.height = Math.min(vp.height, Math.ceil(box.y + box.height + PAD)) - clip.y;
  await page.waitForFunction(() => [...document.images].every((i) => {const r = i.getBoundingClientRect(); return i.complete || r.bottom < 0 || r.top > innerHeight || r.width === 0;}), null, {timeout: 5000}).catch(() => {});
  const thaw = await hold(page);
  await page.evaluate(() => {const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur();});
  await page.waitForTimeout(40);
  const A = await capture(page, clip, label && `ring ${label} before`);
  await page.keyboard.press("Shift");   /* the last input a key, so the focus is drawn as a keyboard's */
  await el.focus();
  await page.waitForTimeout(40);
  const B = await capture(page, clip, label && `ring ${label} after`);
  await thaw();
  const change = (x, y) => {
    if (x < 0 || y < 0 || x >= A.w || y >= A.h) return 0;
    const i = (y * A.w + x) * 4, a = lum(A.data[i], A.data[i + 1], A.data[i + 2]), b = lum(B.data[i], B.data[i + 1], B.data[i + 2]);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const l = Math.round(box.x - clip.x), t = Math.round(box.y - clip.y), r = Math.round(l + box.width), bt = Math.round(t + box.height), rays = [];
  const ray = (x, y, dx, dy) => {let best = 0; for (let d = -2; d <= 8; d += 1) best = Math.max(best, change(Math.round(x + dx * d), Math.round(y + dy * d))); rays.push(best);};
  for (let x = l + 6; x <= r - 6; x += 3) {ray(x, t, 0, -1); ray(x, bt, 0, 1);}
  for (let y = t + 6; y <= bt - 6; y += 3) {ray(l, y, -1, 0); ray(r, y, 1, 0);}
  rays.sort((x, y) => x - y);
  const okRays = rays.filter((c) => c >= 3).length;
  return {rays: rays.length, share: rays.length ? Math.round(okRays / rays.length * 100) / 100 : 0, p10: rays.length ? Math.round(rays[Math.floor(rays.length * 0.1)] * 100) / 100 : 0};
}
const ringsSeen = [];
async function readRing(page, selector, label) {
  const t = Date.now(), r = await ringContrast(page, selector, label);
  spent.rings[0] += Date.now() - t; spent.rings[1] += 1;
  if (!r) {ok(false, `${label}: ${selector} is on the page to be focused`); return;}
  ringsSeen.push({label, ...r});
  ok(r.rays >= 8 && r.share >= 0.9, `${label}: the focus ring stands 3:1 from what is under it on ${Math.round(r.share * 100)}% of its edge (${r.rays} rays; the 10th percentile ${r.p10})`);
}

/* ---- the browser's own accessibility tree, over CDP ---- */
async function axOf(who, selector) {
  const {result} = await who.cdp.send("Runtime.evaluate", {expression: `Array.from(document.querySelectorAll(${JSON.stringify(selector)}))`});
  const {result: props} = await who.cdp.send("Runtime.getProperties", {objectId: result.objectId, ownProperties: true});
  const out = [];
  for (const p of props.filter((x) => /^\d+$/.test(x.name))) {
    const {nodes} = await who.cdp.send("Accessibility.getPartialAXTree", {objectId: p.value.objectId, fetchRelatives: false});
    const n = nodes.find((x) => !x.ignored) || nodes[0] || {};
    const prop = (k) => ((n.properties || []).find((x) => x.name === k) || {}).value?.value;
    out.push({role: n.role?.value || "", name: n.name?.value || "", ignored: !!n.ignored, modal: prop("modal") === true, live: prop("live") || ""});
  }
  await who.cdp.send("Runtime.releaseObject", {objectId: result.objectId});
  return out;
}
/* Every string the page could say: its markup (text and attributes) and every name, description and value in the tree. */
async function everythingSaid(who) {
  const {nodes} = await who.cdp.send("Accessibility.getFullAXTree");
  const tree = nodes.flatMap((n) => [n.name?.value, n.description?.value, n.value?.value]).filter((s) => typeof s === "string" && s).join("\n");
  return `${await who.page.content()}\n${tree}`;
}

/* ---- THE TAB WALK ---- */
/* Which part of the board an element is in, in the words the order is checked in. */
function regionOf() {
  return (el) => {
    if (!el || el === document.body || el === document.documentElement) return "none";
    if (!el.closest("#cm-board")) return `outside:${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className || "").split(" ")[0]}`;
    const slot = el.closest(".cm-board-slot");
    if (slot) return `board-${slot.dataset.area}`;
    for (const [q, name] of [[".cm-hand-show", "fan"], [".cm-board-strip", "strip"], [".cm-full-rail", "rail"], [".cm-board-pane", "seats"], [".cm-board-panegrip", "seats"], [".cm-full-pill", "pill"], [".cm-full-others", "others"],
      [".cm-board-ask", "ask"], [".cm-board-hand", "hand"], [".cm-board-rowbar", "rowbar"], [".cm-board-pie", "counter"], [".cm-full-side", "side"], [".cm-full-mine", "board"], [".cm-board-stage", "board"], [".cm-board-panel", "panel"]]) if (el.closest(q)) return name;
    return `board:${el.className}`;
  };
}
/* Tab from the top of the document: a blur leaves the browser's starting point where the focus was, so a control at the
   very start is focused and taken away, and the next Tab goes to the first control there is. */
const fromTheTop = (page) => page.evaluate(() => {const t = document.createElement("button"); document.body.prepend(t); t.focus(); t.remove(); window.scrollTo(0, 0);});
async function tabWalk(page, max = 260) {
  await fromTheTop(page);
  const stops = [];
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press("Tab");
    const s = await page.evaluate((src) => {
      const region = eval(src)(), el = document.activeElement;
      if (!el || el === document.body) return {region: "none"};
      if (!el.dataset.a11yStop) el.dataset.a11yStop = String(Math.random()).slice(2);
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
      const st = getComputedStyle(el);
      const ring = (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) >= 2) || /(^|,)\s*[a-z(].*?0px 0px 0px [2-9]/.test(st.boxShadow);
      const covered = !hit || !(el === hit || el.contains(hit));
      return {region: region(el), id: el.dataset.a11yStop, what: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) + (covered ? ` under ${hit ? String(hit.className || hit.tagName).slice(0, 30) : "nothing: off the screen"}` : ""), covered, ring, w: r.width, h: r.height};
    }, `(${regionOf.toString()})`);
    /* round again (the same control, or back to where it began after the rest): the walk is done */
    if (s.id && stops.some((x) => x.id === s.id)) break;
    if (stops.length > 3 && s.region === stops[0].region && stops.at(-1).region !== s.region && stops.some((x) => x.region !== s.region && x.region !== "none")) break;
    stops.push(s);
  }
  return stops;
}
/* Every control a person could press on the board as it stands: shown, enabled, not inert. */
const controlsOn = (page) => page.evaluate(() => {
  const sel = "button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
  return [...document.querySelectorAll(`#cm-board :is(${sel})`)].filter((el) => {
    if (el.disabled || el.closest("[inert], [hidden], details:not([open]) > :not(summary)")) return false;
    const r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility === "visible";
  }).map((el) => {if (!el.dataset.a11yStop) el.dataset.a11yStop = String(Math.random()).slice(2); return {id: el.dataset.a11yStop, what: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40)};});
});
const runs = (stops) => stops.map((s) => s.region).filter((r, i, a) => r !== a[i - 1]);

/* ---- the board's keys, as its handlers bind them ---- */
function boundKeys(source) {
  const keys = new Set();
  const handlers = [...source.matchAll(/addEventListener\("keydown",[\s\S]*?\n {2}\}\);/g)].map((m) => m[0]);
  for (const h of handlers) {
    for (const m of h.matchAll(/event\.key === "([^"]+)"/g)) keys.add(m[1]);
    for (const m of h.matchAll(/\[((?:"[^"]+",?\s*)+)\]\.includes\(event\.key\)/g)) for (const k of m[1].matchAll(/"([^"]+)"/g)) keys.add(k[1]);
    if (/\/\^\[1-9\]\$\/\.test\(event\.key\)/.test(h)) for (let n = 1; n <= 9; n += 1) keys.add(String(n));
    if (/event\.ctrlKey \|\| event\.metaKey/.test(h)) {keys.add("Ctrl"); keys.add("⌘");}
    if (/event\.shiftKey/.test(h)) keys.add("Shift");
  }
  return {keys, handlers: handlers.length};
}
/* A key as Help writes it on its <kbd>. */
const KBD = {" ": "Space", "=": "+", "_": "−", "-": "−", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→"};

try {
  /* THE TABLE, set up through the server as the lobby would: Rob hosts, Maya joins, two AIs; mats chosen. */
  await call("/table/create", ROB, {tableId: TABLE, hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "ai", name: "Nina"}, {kind: "ai", name: "Theo"}]});
  await call("/table/join", MAYA, {code: (await call("/table/invite", ROB, {seatId: 1})).invite.code});
  await call("/table/deck", ROB, {seatId: 0, deck: deckOf("Rob")});
  await call("/table/deck", MAYA, {seatId: 1, deck: deckOf("Maya")});
  await call("/table/deck", ROB, {seatId: 2, deck: deckOf("Nina")});
  await call("/table/deck", ROB, {seatId: 3, deck: deckOf("Theo")});
  await call("/table/mat", ROB, {mat: "white-sanctum"});
  const rob = await person(ROB, {width: 1400, height: 900});
  const maya = await person(MAYA, {width: 1280, height: 800});

  /* ---------------- THE LOBBY ---------------- */
  await rob.page.goto(`${base}/index.html#table?id=${TABLE}`);
  await rob.page.locator(".cm-cloud-table .cm-lobby-seat[data-seat='3']").waitFor({timeout: 60000});
  await rob.page.waitForTimeout(800);
  for (const t of ["moss-iron", "felt-cream"]) {
    await theme(rob.page, t);
    await rob.page.waitForTimeout(500);
    await rest(rob.page);
    await shot(rob.page, `lobby-${t}`);
    await readWords(rob.page, "#cm-main", `the lobby, ${t}`, {min: 20});
    /* the seats' seas move: read them again a moment later, so one frame of them is not the whole proof */
    await rob.page.waitForTimeout(1200);
    await readWords(rob.page, ".cm-cloud-table", `the lobby a moment later, ${t}`, {min: 20});
  }
  await theme(rob.page, "moss-iron");
  {
    const stops = await (async () => {
      await fromTheTop(rob.page);
      const out = [];
      for (let i = 0; i < 80; i += 1) {
        await rob.page.keyboard.press("Tab");
        const s = await rob.page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return {at: "none"};
          if (!el.dataset.a11yStop) el.dataset.a11yStop = String(Math.random()).slice(2);
          const seat = el.closest(".cm-lobby-seat"), st = getComputedStyle(el);
          return {id: el.dataset.a11yStop, at: seat ? `seat ${Number(seat.dataset.seat) + 1}` : el.closest(".cm-table-center") ? "rules" : el.closest(".cm-page-head") ? "head" : el.closest(".cm-sidebar") ? "rail" : el.closest("#cm-main") ? "page" : "outside",
            ring: st.outlineStyle !== "none" && parseFloat(st.outlineWidth) >= 2, what: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)};
        });
        out.push(s);
        if (out.length > 3 && s.id && out.findIndex((x) => x.id === s.id) < out.length - 1) break;
      }
      return out;
    })();
    const order = stops.map((s) => s.at).filter((r) => r !== "none" && r !== "outside" && r !== "rail").filter((r, i, a) => r !== a[i - 1]);
    const seats = order.filter((r) => r.startsWith("seat")), ascending = seats.every((r, i) => i === 0 || Number(r.slice(5)) > Number(seats[i - 1].slice(5)));
    ok(order[0] === "head" && order.at(-1) === "rules" && seats.length >= 3 && ascending && order.length === seats.length + 2,
      `the lobby's Tab order is its reading order: the page's head, the seats in their order, each once, then the table's rules and Start (${order.join(" → ")})`);
    const controls = await rob.page.evaluate(() => [...document.querySelectorAll("#cm-main :is(button, a[href], input, select)")].filter((el) => !el.disabled && el.getBoundingClientRect().width > 0).map((el) => el.dataset.a11yStop || "unreached"));
    ok(controls.every((id) => stops.some((s) => s.id === id)), `and Tab reaches every control in the lobby (${controls.filter((id) => !stops.some((s) => s.id === id)).length} of ${controls.length} not reached)`);
    const ringless = stops.filter((s) => s.id && s.at !== "outside" && !s.ring);
    ok(!ringless.length, `and every one shows a focus ring (${ringless.map((s) => s.what).slice(0, 5).join(", ") || "all"})`);
  }
  await readRing(rob.page, ".cm-lobby-seat[data-seat='0'] [data-action=table-mat]", "the lobby, Choose mat over the sea");
  await readRing(rob.page, "[data-action=table-start]", "the lobby, Start on the table's panel");
  /* A DIALOG FROM THE LOBBY, by the keyboard: it is a modal dialog named by its title, it holds the focus, and closing it
     gives the focus back to the button that opened it -- even when the lobby was drawn again underneath (Maya readies). */
  {
    /* the lobby drawn again (Maya readies) keeps the focus where it was */
    await rob.page.keyboard.press("Shift");
    await rob.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-mat]").focus();
    await call("/table/ready", MAYA, {ready: true});
    await rob.page.evaluate((id) => globalThis.__cm.tableApi.refresh(id), TABLE);
    await rob.page.waitForTimeout(200);
    const kept = await rob.page.evaluate(() => {const el = document.activeElement; return el && el.matches("[data-action=table-mat]") ? "Choose mat" : el ? `${el.tagName} ${(el.textContent || "").trim().slice(0, 20)}` : "none";});
    const redrawn = await rob.page.evaluate(() => /Ready/.test(document.querySelector(".cm-lobby-seat[data-seat='1'] header")?.textContent || ""));
    ok(redrawn && kept === "Choose mat", `the lobby drawn again (Maya ready: ${redrawn}) keeps the focus on the control it was on (${kept})`);
    await rob.page.keyboard.press("Enter");
    await rob.page.locator("#cm-dialog[open]").waitFor();
    const [d] = await axOf(rob, "#cm-dialog");
    ok(d && d.role === "dialog" && d.modal && /^choose mat$/i.test(d.name), `Choose mat opens a modal dialog, named (${JSON.stringify(d)})`);
    /* the browser's own toolbar is between the last control and the first (the document's body, here): not the page */
    const inside = [];
    for (let i = 0; i < 40; i += 1) {await rob.page.keyboard.press("Tab"); inside.push(await rob.page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest("#cm-dialog")));}
    ok(inside.every(Boolean), `and Tab stays inside it while it is open (${inside.filter((x) => !x).length} of ${inside.length} presses left it)`);
    await call("/table/ready", MAYA, {ready: false});
    await rob.page.evaluate((id) => globalThis.__cm.tableApi.refresh(id), TABLE);
    await rob.page.waitForTimeout(300);
    await rob.page.keyboard.press("Escape");
    await rob.page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 5000});
    /* the dialog's close event is a task after it closes: a moment for it */
    await rob.page.waitForFunction(() => document.activeElement && document.activeElement.matches("[data-action=table-mat]"), null, {timeout: 2000}).catch(() => {});
    const back = await rob.page.evaluate(() => {const el = document.activeElement; return el && el.matches("[data-action=table-mat]") ? "Choose mat" : el ? `${el.tagName} ${el.className} ${(el.textContent || "").trim().slice(0, 20)}` : "none";});
    ok(back === "Choose mat", `Escape closes it, and the focus is back on Choose mat though the lobby was drawn again under it (${back})`);
  }
  /* THE COUNTDOWN is said once a second, not four times: its number is written only when it changes. */
  {
    await call("/table/ready", MAYA, {ready: true});
    await call("/table/ready", ROB, {ready: true});
    await call("/table/start", ROB, {});
    await rob.page.evaluate((id) => globalThis.__cm.tableApi.refresh(id), TABLE);
    await rob.page.locator("#cm-table-seconds").waitFor();
    const writes = await rob.page.evaluate(() => new Promise((done) => {
      const el = document.getElementById("cm-table-seconds"); let n = 0;
      const mo = new MutationObserver((list) => {n += list.length;}); mo.observe(el, {childList: true, characterData: true, subtree: true});
      setTimeout(() => {mo.disconnect(); done(n);}, 2100);
    }));
    ok(writes <= 3, `the countdown's live number changes at most once a second (${writes} changes in 2.1 s)`);
    const [region] = await axOf(rob, ".cm-table-count");
    ok(region && region.live === "polite", `and it is a polite live region (${JSON.stringify(region)})`);
  }

  lap("the lobby");
  /* ---------------- THE BOARD ---------------- */
  clock += 10000; await serial(() => object.alarm());
  await rob.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 60000});
  await maya.page.goto(`${base}/index.html#table?id=${TABLE}`);
  await maya.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 60000});
  await theme(maya.page, "felt-cream");
  /* A few turns, through the boards' own controls, the AIs played by the house pilots on the table's alarm. */
  const alarm = setInterval(() => {if (object.room?.continuing) serial(() => object.alarm());}, 50);
  const people = [[rob, 0], [maya, 1]].map(([who, seat]) => boardPerson({page: who.page, seat, cards, current: () => views(who.email).at(-1)}));
  const turnOf = () => (views(ROB).at(-1) || {state: {turn: 0}}).state.turn;
  for (let i = 0; i < 4000 && turnOf() < 10; i += 1) {
    const moved = (await people[0]()) | (await people[1]());
    if (!moved) await rob.page.waitForTimeout(100);
  }
  for (let i = 0; i < 300 && object.room?.continuing; i += 1) await rob.page.waitForTimeout(50);
  clearInterval(alarm);
  ok(turnOf() >= 10, `a four-seat game is played to turn ${turnOf()} through the boards`);
  const onField = (email) => views(email).at(-1).state.players.flatMap((p) => p.zones.Battlefield.cards).length;
  ok(onField(ROB) >= 8, `with permanents on the boards (${onField(ROB)})`);

  lap("the game played");
  const matOf = (page, seat) => page.evaluate((s) => document.querySelector(`#cm-board .cm-mat[data-seat='${s}']`)?.dataset.mat, seat);
  const focusSeat = async (page, seat) => {await page.click(`.cm-board-tile[data-seat='${seat}'] [data-action=board-focus]`); await page.waitForFunction((s) => document.querySelector(".cm-board-mat")?.dataset.seat === String(s), seat);};
  /* ---- 2. FOCUS ORDER ---- */
  const EXPECT = {
    /* Focus: the strip, the seats, the board, what the room asks, the hand */
    focus: ["strip", "seats", "board", "ask", "hand"],
    /* Table: the strip, the boards as they sit (top row left to right, then the bottom), the bar, the life counter, the hand */
    table: ["strip", "board-a", "board-b", "board-c", "board-d", "rowbar", "counter", "ask", "hand"],
    /* Full screen: the rail, the others, the pill, your board, your hand, the side column */
    full: ["rail", "others", "pill", "board", "hand", "side"],
  };
  for (const who of [rob, maya]) {
    const page = who.page, w = page.viewportSize().width;
    for (const v of ["focus", "table", "full"]) {
      await view(page, v);
      await rest(page);
      const stops = await tabWalk(page), order = runs(stops).filter((r) => r !== "none");
      const want = EXPECT[v].filter((r) => order.includes(r) || r !== "ask");
      const inOrder = order.filter((r) => !r.startsWith("outside")).join(" → ") === want.join(" → ");
      ok(inOrder, `at ${w}, ${v}: Tab walks the board in reading order, each part once (${order.join(" → ")}; wanted ${want.join(" → ")})`);
      const outside = stops.filter((s) => s.region.startsWith("outside"));
      ok(!outside.length, `at ${w}, ${v}: nothing behind the board takes the focus (${outside.map((s) => s.region + " " + s.what).slice(0, 4).join("; ") || "none"})`);
      const all = await controlsOn(page), missed = all.filter((c) => !stops.some((s) => s.id === c.id));
      ok(all.length >= 10 && !missed.length, `at ${w}, ${v}: Tab reaches every control on the board (${all.length - missed.length} of ${all.length}${missed.length ? `; not: ${missed.slice(0, 5).map((c) => c.what).join(", ")}` : ""})`);
      const ringless = stops.filter((s) => s.id && !s.region.startsWith("outside") && !s.ring), covered = stops.filter((s) => s.id && s.covered);
      ok(!ringless.length, `at ${w}, ${v}: every control shows a focus ring when Tab reaches it (${ringless.slice(0, 5).map((s) => s.what).join(", ") || "all"})`);
      ok(!covered.length, `at ${w}, ${v}: and none is covered by something else while it has the focus (${covered.slice(0, 5).map((s) => `${s.what} (${s.region})`).join(", ") || "none"})`);
    }
    await view(page, "focus");
  }
  /* In the seat pane, whose turn it is (the brass mark) covers nothing of a tile's own words: its vitals, its flag. */
  for (const who of [rob, maya]) {
    const clash = await who.page.evaluate(() => [...document.querySelectorAll(".cm-board-pane .cm-board-tile")].flatMap((tile) => {
      const mark = tile.querySelector(":scope > .cm-board-turn-mark");
      if (!mark) return [];
      const m = mark.getBoundingClientRect();
      return [...tile.querySelectorAll(".cm-vitals, .cm-board-tile-flag:not(:empty), .cm-board-tile-name")].filter((el) => {const r = el.getBoundingClientRect(); return r.width && m.left < r.right - 0.5 && r.left < m.right - 0.5 && m.top < r.bottom - 0.5 && r.top < m.bottom - 0.5;}).map((el) => `${tile.dataset.seat}: ${el.className}`);
    }));
    const marks = await who.page.locator(".cm-board-pane .cm-board-turn-mark").count();
    ok(marks === 1 && !clash.length, `at ${who.page.viewportSize().width}, the turn mark in the seat pane covers none of its tile's words (${marks} mark; ${clash.join(", ") || "clear"})`);
  }
  /* the focus ring, measured, on each kind of control */
  for (const [who, t] of [[rob, "dark"], [maya, "light"]]) {
    const page = who.page;
    await rest(page);
    for (const [sel, what] of [["[data-action=board-tools]", "a strip button"], ["[data-action=board-view][data-view=table]", "the view switch"], [".cm-board-tile-main", "a seat's tile"],
      [".cm-board-mat .cm-vitals", "the vitals pill on the mat"], [".cm-board-hand .cm-bcard", "a card in the hand"], ["[data-drag=hand]", "the hand's divider"], ["[data-board-scale=hand]", "the hand's slider"],
      [".cm-board-band [data-action=board-history]", "the history band's clock"], [".cm-board-showhand", "Show hand"]]) await readRing(page, sel, `${t}: ${what}`);
    await view(page, "table");
    for (const [sel, what] of [[".cm-seatboard [data-action=board-focus]", "⤢ Focus on a board"], [".cm-board-center", "the life counter's logo"], ["[data-drag=rows]", "the rows' divider"]]) await readRing(page, sel, `${t}: ${what}`);
    /* the rows' bar lifts over the life counter for its grip's ring alone: with its card-size slider focused, a click on
       the counter's logo still reaches the logo */
    await page.keyboard.press("Shift");
    await page.locator(".cm-board-rowbar [data-board-scale=board]").focus();
    const reach = await page.evaluate(() => {
      const c = document.querySelector(".cm-board-center"), r = c && c.getBoundingClientRect();
      if (!r) return "no logo";
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && c.contains(hit) ? "" : `${hit ? String(hit.className || hit.tagName).split(" ")[0] : "nothing"} is over it`;
    });
    ok(!reach, `${t}: with Board cards' slider focused, a click on the life counter's logo reaches it (${reach || "it does"})`);
    await view(page, "focus");
  }
  /* A VIEW ARRIVING keeps the focus where it was: the board is drawn again, and the same card still has it. */
  for (const who of [rob, maya]) {
    const page = who.page, card = page.locator(".cm-board-mat .cm-board-field .cm-bcard").first(), id = await card.getAttribute("data-card");
    await page.keyboard.press("Shift");
    await card.focus();
    const before = views(who.email).length;
    await serial(async () => object.broadcast());
    await page.waitForFunction((n) => true, before);
    await page.waitForTimeout(400);
    const kept = await page.evaluate(() => {const el = document.activeElement; return el && el.matches(".cm-bcard") ? el.dataset.card : el ? el.tagName : "none";});
    ok(views(who.email).length > before && kept === id, `a view arriving redraws the board and the focus stays on the same card (${kept} for ${id})`);
  }
  /* A MENU closed by Escape gives the focus back to its button; one opened by the keyboard is entered by Tab. */
  for (const [action, inside] of [["board-tools", "#cm-board-tools"], ["board-menu", "#cm-board-nav"], ["board-steps", "#cm-board-steps"]]) {
    const page = rob.page, opener = page.locator(`.cm-board-strip [data-action=${action}]`).first();
    await page.keyboard.press("Shift");
    await opener.focus();
    await page.keyboard.press("Enter");
    await page.locator(inside).waitFor();
    const expanded = await page.locator(`.cm-board-strip [data-action=${action}]`).first().getAttribute("aria-expanded");
    /* one with controls in it is the next thing Tab reaches (the steps hold only words: there is nothing to go to) */
    const controls = await page.evaluate((q) => !!document.querySelector(q).querySelector("button, a[href], input, select, textarea"), inside);
    await page.keyboard.press("Tab");
    const entered = !controls || await page.evaluate((q) => !!document.activeElement.closest(q), inside);
    await page.keyboard.press("Escape");
    await page.locator(inside).waitFor({state: "detached"});
    const back = await page.evaluate((a) => !!document.activeElement.matches(`[data-action=${a}]`), action);
    ok(expanded === "true" && entered && back, `${action}: Enter opens it and says so (aria-expanded ${expanded}), Tab goes into it (${entered}), Escape closes it with the focus back on its button (${back})`);
  }
  /* What each is, said as it is: Tools a group of controls, ☰ the pages' navigation -- neither an ARIA menu, whose items
     would want the arrow keys they do not take. */
  {
    const page = rob.page;
    await page.click(".cm-board-strip [data-action=board-tools]");
    const [toolsAx] = await axOf(rob, "#cm-board-tools");
    await page.click(".cm-board-strip [data-action=board-menu]");
    const [navAx] = await axOf(rob, "#cm-board-nav");
    const menus = await page.evaluate(() => document.querySelectorAll("#cm-board [role=menu], #cm-board [role=menuitem]").length);
    await page.keyboard.press("Escape");
    ok(toolsAx && toolsAx.role === "group" && /^tools$/i.test(toolsAx.name) && navAx && navAx.role === "navigation" && menus === 0,
      `Tools is a named group and ☰ a navigation region, and nothing on the board claims to be an ARIA menu (${JSON.stringify([toolsAx, navAx, menus])})`);
    /* Full screen's rail opens Tools the same way */
    await view(page, "full");
    const gear = page.locator(".cm-full-rail [data-action=board-tools]");
    await page.keyboard.press("Shift");
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.locator("#cm-board-tools").waitFor();
    const said = await page.locator(".cm-full-rail [data-action=board-tools]").getAttribute("aria-expanded");
    await page.keyboard.press("Escape");
    await page.locator("#cm-board-tools").waitFor({state: "detached"});
    const back = await page.evaluate(() => document.activeElement.matches(".cm-full-rail [data-action=board-tools]"));
    ok(said === "true" && back, `Full screen's ⚙ says it opened Tools (aria-expanded ${said}), and Escape gives the focus back to it (${back})`);
    await view(page, "focus");
  }
  {
    const page = rob.page, opener = page.locator(".cm-board-strip [data-action=board-history]");
    await page.keyboard.press("Shift");
    await opener.focus();
    await page.keyboard.press("Enter");
    await page.locator("#cm-board-history").waitFor();
    const inFilter = await page.evaluate(() => document.activeElement.matches("[data-board-history-filter]"));
    const said = await page.locator(".cm-board-strip [data-action=board-history]").getAttribute("aria-expanded");
    await page.keyboard.press("Escape");
    await page.locator("#cm-board-history").waitFor({state: "detached"});
    const back = await page.evaluate(() => document.activeElement.matches("[data-action=board-history]"));
    ok(inFilter && said === "true" && back, `History ▾: Enter opens it on its filter (${inFilter}) and says so (aria-expanded ${said}), Escape closes it with the focus back on History ▾ (${back})`);
  }
  /* SHOW HAND is a modal pop-up: it takes the focus, holds it, and gives it back to ✋ when it closes. */
  for (const who of [rob, maya]) {
    const page = who.page;
    await page.keyboard.press("Shift");
    await page.locator(".cm-board-showhand").focus();
    await page.keyboard.press("Enter");
    await page.locator(".cm-hand-show").waitFor();
    const [d] = await axOf(who, ".cm-hand-show");
    const inside = [];
    for (let i = 0; i < 24; i += 1) {await page.keyboard.press("Tab"); inside.push(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest(".cm-hand-show")));}
    ok(d && d.role === "dialog" && d.modal && /hand/i.test(d.name) && inside.every(Boolean), `Show hand is a modal dialog, named (${JSON.stringify(d)}), and Tab stays in it (${inside.filter((x) => !x).length} of ${inside.length} left it)`);
    await serial(async () => object.broadcast());
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.locator(".cm-hand-show").waitFor({state: "detached"});
    ok(await page.evaluate(() => document.activeElement.matches(".cm-board-showhand")), "and Escape puts it away, a view arriving meanwhile, with the focus back on ✋");
  }
  /* THE APP'S DIALOG over the board: Table vitals, opened from a seat's vitals by the keyboard, the board drawn again under
     it; it is modal and named, and closing it gives the focus back to the vitals it came from. */
  {
    const page = rob.page;
    await page.keyboard.press("Shift");
    await page.locator(".cm-board-mat .cm-vitals").focus();
    await page.keyboard.press("Enter");
    await page.locator("#cm-dialog[open] .cm-table-vitals").waitFor();
    const [d] = await axOf(rob, "#cm-dialog");
    await serial(async () => object.broadcast());
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 5000});
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches(".cm-board-mat .cm-vitals"), null, {timeout: 2000}).catch(() => {});
    const back = await page.evaluate(() => document.activeElement.matches(".cm-board-mat .cm-vitals"));
    ok(d && d.role === "dialog" && d.modal && /^table vitals$/i.test(d.name) && back, `Table vitals is a modal dialog, named (${JSON.stringify(d)}); Escape gives the focus back to the vitals it came from, the board drawn again meanwhile (${back})`);
  }

  lap("the focus");
  /* ---- 3. THE KEYS, bound and documented ---- */
  {
    const source = readFileSync(path.join(ROOT, "crankmagic-board.js"), "utf8"), {keys, handlers} = boundKeys(source);
    const page = rob.page;
    await page.click("[data-action=board-menu]");
    await page.click("#cm-board-nav [data-action=page-help]");
    await page.locator("#cm-dialog[open] .cm-help-keys").waitFor();
    const helpKeys = new Set(await page.locator("#cm-dialog[open] .cm-help-keys kbd").allTextContents());
    /* "1–9" in Help is every digit between */
    for (const m of (await page.locator("#cm-dialog[open] .cm-help-keys").innerHTML()).matchAll(/<kbd>(\d)<\/kbd>\s*[–-]\s*<kbd>(\d)<\/kbd>/g)) for (let n = Number(m[1]); n <= Number(m[2]); n += 1) helpKeys.add(String(n));
    const helpText = (await page.locator("#cm-dialog[open] .cm-help-keys").innerText()).replace(/\s+/g, " ");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"));
    if (await page.locator("#cm-board-nav").count()) await page.keyboard.press("Escape");
    const bound = new Set([...keys].map((k) => KBD[k] || k));
    const undocumented = [...bound].filter((k) => !helpKeys.has(k)), unbound = [...helpKeys].filter((k) => !bound.has(k) && !["Tab"].includes(k));
    ok(handlers >= 2 && bound.size >= 15, `the board's key handlers are read (${handlers} handlers, ${bound.size} keys: ${[...bound].join(" ")})`);
    ok(!undocumented.length, `every key the board binds is in Help (${undocumented.join(", ") || "all"} missing)`);
    ok(!unbound.length, `and every key Help names is bound, or is the browser's Tab (${unbound.join(", ") || "none"} unbound)`);
    for (const [phrase, why] of [[/Space.{0,80}(fans|shows) your hand/i, "Space fans the hand"], [/1.{0,3}9.{0,60}holds/i, "1-9 hold a card up"], [/Enter.{0,60}(first|does)/i, "Enter does the held card's first thing"],
      [/Escape/i, "Escape steps back"], [/You can also/i, "Escape closes You can also"], [/Coach/i, "Escape and Enter in the Coach"], [/Shift.{0,4}Enter/i, "Shift+Enter in the Coach"], [/10%/, "the size step"], [/two boards side by side|side by side/i, "the side-by-side bar's ← →"]]) ok(phrase.test(helpText), `Help says it: ${why}`);
    /* and each does what Help says */
    await view(page, "focus");
    await page.evaluate(() => {const a = document.activeElement; if (a && a !== document.body) a.blur();});
    await page.keyboard.press(" ");
    ok(await page.locator(".cm-hand-show:not(.is-held)").count() === 1, "Space, nothing focused, fans the hand");
    await page.keyboard.press("2");
    const heldName = await page.locator(".cm-hand-show.is-held").getAttribute("aria-label").catch(() => "");
    const second = (views(ROB).at(-1).state.players[0].zones.Hand.cards[1] || {}).name;
    ok(!!second && heldName === `${second}, held`, `2 holds the second card up (${heldName})`);
    await page.keyboard.press("Escape");
    ok(await page.locator(".cm-hand-show:not(.is-held)").count() === 1, "Escape puts a held card back in the fan");
    await page.keyboard.press(" ");
    ok(await page.locator(".cm-hand-show").count() === 0, "and Space, in the fan, puts the hand away");
    const size = await page.evaluate(() => globalThis.__cm.cardScale());
    await page.keyboard.press("Control+=");
    const up = await page.evaluate(() => globalThis.__cm.cardScale());
    await page.keyboard.press("Control+-");
    const down = await page.evaluate(() => globalThis.__cm.cardScale());
    ok(up === Math.min(size + 10, (await page.evaluate(() => globalThis.__cm.cardScaleRange()))[1]) && down === size, `Ctrl + and Ctrl − step the card size by 10% (${size} → ${up} → ${down})`);
    /* Asked at priority with a card in hand to cast (Rob's own view, the question in it): You can also ▾ by the keyboard,
       Escape closing it onto its button; and in the fanned hand, Enter presses the button that has the focus. */
    {
      const real = lastFrame(ROB), asked = structuredClone(real), mine = asked.view.state.players[0].zones.Hand.cards;
      const at = Math.max(0, mine.findIndex((c) => c.name && !c.types.includes("Land"))), castable = mine[at];
      asked.view.decision = {id: "a11y:priority", kind: "priority", mode: "one", title: "Your priority", options: [{index: 0, act: "pass", label: "Pass priority"}, {index: 1, act: "cast", label: castable.name, cardId: castable.cardId}]};
      asked.view.waitingOn = asked.view.seatId;
      hand(ROB, asked);
      await page.locator(".cm-board-strip [data-action=board-also]").waitFor({timeout: 5000});
      await page.keyboard.press("Shift");
      await page.locator(".cm-board-strip [data-action=board-also]").focus();
      await page.keyboard.press("Enter");
      await page.locator(".cm-board-also").waitFor();
      const said = await page.locator(".cm-board-strip [data-action=board-also]").getAttribute("aria-expanded");
      await page.keyboard.press("Escape");
      const closed = await page.locator(".cm-board-also").count() === 0, back = await page.evaluate(() => document.activeElement.matches("[data-action=board-also]"));
      ok(said === "true" && closed && back, `You can also ▾ says it is open (aria-expanded ${said}); Escape closes it (${closed}) with the focus back on it (${back})`);
      /* the card that can be cast keeps its bright ring inside the focus ring */
      await page.keyboard.press("Shift");
      await page.locator(`.cm-board-hand .cm-bcard.is-bright[data-card="${castable.cardId}"]`).focus();
      const glow = await page.evaluate((id) => getComputedStyle(document.querySelector(`.cm-board-hand .cm-bcard[data-card="${id}"]`)).boxShadow, castable.cardId);
      ok(/7px/.test(glow), `a card that can be used keeps its bright ring inside the focus ring (${glow})`);
      await page.evaluate(() => {const a = document.activeElement; if (a && a !== document.body) a.blur();});
      await page.keyboard.press(" ");
      await page.keyboard.press(String(at + 1));
      await page.locator(".cm-hand-show.is-held").waitFor();
      const first = await page.evaluate(() => document.activeElement.matches("[data-action=board-hand-do]"));
      await page.locator(".cm-hand-acts [data-action=board-hand-back]").focus();
      await page.keyboard.press("Enter");
      const fanned = await page.locator(".cm-hand-show:not(.is-held)").count() === 1;
      ok(first && fanned, `held, the card's first way to use it has the focus (${first}); Enter on Back to hand presses Back to hand, not the first way (${fanned})`);
      await page.keyboard.press("Escape");
      await page.locator(".cm-hand-show").waitFor({state: "detached"});
      hand(ROB, real);
      await page.waitForTimeout(300);
    }
    await page.click(".cm-board-strip [data-action=board-panel]");
    await page.keyboard.press("Escape");
    ok(await page.locator(".cm-board-panel").count() === 0, "Escape closes the Panel");
    await view(page, "full");
    await page.evaluate(() => {const a = document.activeElement; if (a && a !== document.body) a.blur();});
    await page.keyboard.press("Escape");
    ok(await page.locator(".cm-board-mat").count() === 1, "Escape leaves Full screen for Focus");
    const grip = page.locator("[data-drag=hand]"), was = Number(await grip.getAttribute("aria-valuenow"));
    await grip.focus();
    await page.keyboard.press("ArrowUp");
    ok(Number(await page.locator("[data-drag=hand]").getAttribute("aria-valuenow")) === was + 5, "↑ on the hand's divider grows the hand");
    await page.keyboard.press("ArrowDown");
    const pane = page.locator("[data-drag=pane]"), paneWas = Number(await pane.getAttribute("aria-valuenow"));
    await pane.focus();
    await page.keyboard.press("ArrowRight");
    ok(Number(await page.locator("[data-drag=pane]").getAttribute("aria-valuenow")) === paneWas + 20, "→ on the seat pane's edge widens it");
    await page.keyboard.press("ArrowLeft");
  }

  lap("the keys");
  /* ---- 4. EVERY CARD SAYS WHAT IS SHOWN ON IT, AND NOTHING HIDDEN ---- */
  {
    /* A board with everything a card can show on it: the room's own last view to each, with a creature of Rob's
       attacking Maya, blocked by one of hers; damage and counters; one of Maya's creatures face down -- Maya's own view
       carrying its name for her (CR 708.5), Rob's not. */
    const robFrame = lastFrame(ROB), mayaFrame = lastFrame(MAYA);
    const creatures = (v, seat) => v.state.players[seat].zones.Battlefield.cards.filter((c) => c.types.includes("Creature") && c.name && !c.commander);
    const rv = structuredClone(robFrame), mv = structuredClone(mayaFrame);
    const [att] = creatures(rv.view, 0), [blk, fd] = creatures(rv.view, 1).length >= 2 ? creatures(rv.view, 1) : [creatures(rv.view, 1)[0], null];
    ok(att && blk && fd, `there are creatures to set it up with (Rob ${creatures(rv.view, 0).length}, Maya ${creatures(rv.view, 1).length})`);
    /* a name no frame has carried but this one, so finding it anywhere is the board saying it */
    const secret = "Maya Hidden Morph";
    for (const v of [rv.view, mv.view]) {
      v.state.combat = {attackingPlayerId: 0, defenders: [1], attacks: [{attacker: att.cardId, defender: 1, blocked: true, blockers: [blk.cardId]}]};
      for (const p of v.state.players) for (const c of p.zones.Battlefield.cards) {
        if (c.cardId === att.cardId) {c.tapped = true; c.damage = 1; c.counters = {"+1/+1": 2};}
        if (fd && c.cardId === fd.cardId) Object.assign(c, {name: null, faceDown: true, types: ["Creature"], power: 2, toughness: 2, ...(v === mv.view ? {faceDownName: secret} : {})});
      }
    }
    hand(ROB, rv); hand(MAYA, mv);
    for (const [who, t] of [[rob, "Rob"], [maya, "Maya"]]) {
      await who.page.waitForFunction(() => !!document.querySelector("#cm-board .cm-bcard[aria-label*='attacking']"), null, {timeout: 5000}).catch(() => {});
      await view(who.page, "focus");
      await focusSeat(who.page, 0);
      const said = await axOf(who, `.cm-board-mat .cm-bcard[data-card="${att.cardId}"]`);
      ok(said.length === 1 && said[0].role === "button" && /, tapped\b/.test(said[0].name) && /4\/4|2\/2/.test(said[0].name) && /1 damage/.test(said[0].name) && /2 \+1\/\+1 counters/.test(said[0].name) && (t === "Rob" ? /attacking Maya/ : /attacking you/).test(said[0].name) && /blocked/.test(said[0].name),
        `${t}'s board: the attacker is said with its state -- tapped, power and toughness, damage, counters, attacking whom, blocked ("${said[0] && said[0].name}")`);
      await focusSeat(who.page, 1);
      const blocker = await axOf(who, `.cm-board-mat .cm-bcard[data-card="${blk.cardId}"]`), down = fd ? await axOf(who, `.cm-board-mat [data-card="${fd.cardId}"]`) : [];
      ok(blocker.length === 1 && new RegExp(`blocking ${att.name}`).test(blocker[0].name), `${t}'s board: the blocker says whom it blocks ("${blocker[0] && blocker[0].name}")`);
      ok(down.length === 1 && /^Face-down (card|creature)/.test(down[0].name) && !down[0].name.includes(secret) && ["button", "img"].includes(down[0].role), `${t}'s board: the face-down creature is a face-down card and nothing more, to its owner too (${JSON.stringify(down[0])})`);
      const marks = await who.page.evaluate((id) => [...document.querySelectorAll(`.cm-board-mat .cm-bcard[data-card="${id}"] .cm-bcard-mark`)].map((m) => m.innerText.trim()), blk.cardId);
      ok(marks.some((m) => /^Blocking/.test(m)), `${t}'s board: and the blocker shows it, too (${marks.join(", ")})`);
      ok(!(await everythingSaid(who)).includes(secret), `${t}'s page says the face-down card's name nowhere: not in its markup, any label, or the accessibility tree`);
    }
    /* Full screen: the card picked is said to be selected; a card chosen in a many-of question is said to be chosen. */
    await view(rob.page, "full");
    await rob.page.click(`.cm-full-mine .cm-bcard[data-card="${att.cardId}"]`);
    const picked = await axOf(rob, `.cm-full-mine .cm-bcard[data-card="${att.cardId}"]`);
    ok(picked.length === 1 && /, selected\b/.test(picked[0].name), `Full screen: the card picked to read is said to be selected ("${picked[0] && picked[0].name}")`);
    await view(rob.page, "focus");
    hand(ROB, robFrame); hand(MAYA, mayaFrame);
    await rob.page.waitForTimeout(300);
    /* A many-of question: a card tapped to choose it is said to be chosen, and focused it keeps its chosen glow inside the
       focus ring. */
    {
      const page = rob.page, asked = structuredClone(robFrame), mine = creatures(asked.view, 0).filter((c) => c.cardId !== att.cardId).slice(0, 2);
      asked.view.decision = {id: "a11y:many", kind: "choice", mode: "many", min: 0, max: 2, title: "Choose any number of creatures", options: mine.map((c, index) => ({index, label: c.name, cardId: c.cardId}))};
      asked.view.waitingOn = asked.view.seatId;
      hand(ROB, asked);
      await focusSeat(page, 0);
      const pick = page.locator(`.cm-board-mat .cm-bcard[data-card="${mine[0].cardId}"]`);
      await pick.click();
      await page.locator(`.cm-board-mat .cm-bcard.is-picked[data-card="${mine[0].cardId}"]`).waitFor({timeout: 5000});
      const [said] = await axOf(rob, `.cm-board-mat .cm-bcard[data-card="${mine[0].cardId}"]`);
      await page.keyboard.press("Shift");
      await page.locator(`.cm-board-mat .cm-bcard[data-card="${mine[0].cardId}"]`).focus();
      const glow = await page.evaluate((id) => getComputedStyle(document.querySelector(`.cm-board-mat .cm-bcard[data-card="${id}"]`)).boxShadow, mine[0].cardId);
      ok(said && /, chosen\b/.test(said.name) && /7px/.test(glow), `a card chosen for a many-of question is said to be chosen ("${said && said.name}"), and keeps its glow inside the focus ring (${glow})`);
      hand(ROB, robFrame);
      await page.waitForTimeout(300);
    }
    /* HIDDEN: nothing of another seat's hand or library, nor any library's, in anything either page says. */
    for (const [who, other, otherEmail] of [[maya, "Rob", ROB], [rob, "Maya", MAYA]]) {
      const ownView = views(otherEmail).at(-1), mine = ownView.state.players[other === "Rob" ? 0 : 1];
      const open = new Set([...["Battlefield", "Graveyard", "Exile", "Command"].flatMap((z) => mine.zones[z].cards.map((c) => c.name)), ...views(otherEmail).flatMap((v) => (v.history || []).map((l) => l.text))].filter(Boolean).join("\n").match(new RegExp(`${other} Secret \\d+`, "g")) || []);
      const hidden = deckOf(other).cards.filter((n) => n.startsWith(`${other} Secret`) && !open.has(n));
      const said = await everythingSaid(who), leaked = hidden.filter((n) => new RegExp(`\\b${n}\\b`).test(said));
      ok(hidden.length >= 10 && !leaked.length, `${who === maya ? "Maya" : "Rob"}'s page names none of ${other}'s hidden cards anywhere -- markup, labels, the accessibility tree (${hidden.length} watched${leaked.length ? "; said: " + leaked.join(", ") : ""})`);
    }
  }

  lap("the labels");
  /* ---- 5. THE POP-UP ANNOUNCED ---- */
  {
    const page = rob.page;
    const region = await axOf(rob, "#cm-board-said");
    ok(region.length === 1 && region[0].live === "polite" && ["status", "log"].includes(region[0].role), `the board has one polite status region of its own (${JSON.stringify(region)})`);
    const inBoard = await axOf(rob, "#cm-board [aria-live], #cm-board [role=status], #cm-board [role=alert]");
    ok(!inBoard.length, `and no live region inside the board it draws again with every view, which a reader would hear twice or not at all (${inBoard.length})`);
    const node = await page.evaluate(() => {const el = document.getElementById("cm-board-said"); if (!el) return false; el.__probe = 1; return !!el.parentElement && !el.closest("#cm-board");});
    /* A question arrives: the room asks Rob to choose (handed his own view, with the question in it). */
    const real = lastFrame(ROB), asked = structuredClone(real);
    const options = asked.view.state.players[0].zones.Battlefield.cards.filter((c) => c.name).slice(0, 2).map((c, index) => ({index, label: c.name, cardId: c.cardId}));
    asked.view.decision = {id: "a11y:question", kind: "choice", mode: "one", title: "Choose a permanent to return to its owner's hand", options};
    asked.view.waitingOn = asked.view.seatId;
    hand(ROB, asked);
    await page.locator("#cm-board-decision").waitFor({timeout: 5000});
    const said = await page.evaluate(() => document.getElementById("cm-board-said")?.textContent || "");
    const same = await page.evaluate(() => document.getElementById("cm-board-said")?.__probe === 1);
    const [panel] = await axOf(rob, "#cm-board-decision");
    ok(node && same && /Choose a permanent to return to its owner's hand/.test(said) && options.every((o) => said.includes(o.label)), `a question that opens is said in it, with its choices ("${said}"), by the same region, kept through the redraw (${same})`);
    ok(panel && panel.name === "Choose a permanent to return to its owner's hand" && ["dialog", "group", "region"].includes(panel.role), `and the question's own panel is named by it (${JSON.stringify(panel)})`);
    /* turns that went by are said too */
    const later = structuredClone(real);
    later.view.state.turn += 2;
    hand(ROB, later);
    await page.waitForFunction(() => /went by/.test(document.getElementById("cm-board-said")?.textContent || ""), null, {timeout: 5000}).catch(() => {});
    ok(/went by/.test(await page.evaluate(() => document.getElementById("cm-board-said")?.textContent || "")), "turns that went by are said in it");
    hand(ROB, real);
    await page.waitForTimeout(300);
    /* the card shown large under the pointer is said in it */
    await view(page, "focus");
    const card = page.locator(".cm-board-mat .cm-board-field .cm-bcard").first(), name = (await card.getAttribute("aria-label")).split(/[,:]/)[0];
    await card.hover();
    await page.locator("#cm-board-peek").waitFor({timeout: 5000});
    ok((await page.evaluate(() => document.getElementById("cm-board-said")?.textContent || "")).includes(`Showing ${name}`), `the card shown large under the pointer is said in it (${name})`);
    await rest(page);
    /* the Coach's reply is said in it too (its thread is drawn anew with each message), and the page has no other live
       region than it and the app's own notices */
    await page.click(".cm-board-coach-open");
    await page.locator("#cm-board-coach .cm-coach-input").waitFor();
    await page.click("#cm-board-coach [data-action=board-coach-ask]");
    await page.waitForFunction(() => /^The Coach: /.test(document.getElementById("cm-board-said")?.textContent || ""), null, {timeout: 10000}).catch(() => {});
    const reply = await page.evaluate(() => document.getElementById("cm-board-said")?.textContent || "");
    const regions = await page.evaluate(() => [...document.querySelectorAll("[aria-live], [role=status], [role=alert], [role=log]")].map((el) => el.id || el.className));
    ok(/^The Coach: The Coach is not switched on here yet\.?$/.test(reply), `the Coach's reply is said in it ("${reply}")`);
    ok(JSON.stringify(regions.sort()) === JSON.stringify(["cm-board-said", "cm-notice"]), `and the page's only live regions are the board's and the app's notices (${regions.join(", ")})`);
    await page.keyboard.press("Escape");
  }

  lap("the announcements");
  /* ---- 1. CONTRAST over every mat, in every view, in both themes (last: it is the long one) ---- */
  for (let i = 0; i < MATS.length; i += 2) {
    const a = MATS[i], b = MATS[i + 1] || MATS[0];
    await call("/table/mat", ROB, {mat: a});
    await call("/table/mat", MAYA, {mat: b});
    for (const who of [rob, maya]) {
      await who.page.evaluate((id) => globalThis.__cm.tableApi.refresh(id), TABLE);
      await view(who.page, "focus");
    }
    /* Each mat in Focus (the largest), in Table beside the other (both pages, so both themes), and on Rob's Full screen;
       the board's chrome -- the strip, the pane, the tray, the side column -- read whole the first time round. */
    const all = i === 0;
    lap(`the ${a} and ${b} mats`);
    for (const [who, me, mine, theirs, t] of [[rob, 0, a, b, "dark"], [maya, 1, b, a, "light"]]) {
      const page = who.page, w = page.viewportSize().width;
      await focusSeat(page, me);
      ok(await matOf(page, me) === mine, `${t}: the board is drawn on the ${mine} mat`);
      await rest(page);
      await readWords(page, all ? "#cm-board" : "#cm-board .cm-board-stage", `${t} at ${w}, Focus, the ${mine} mat`);
      if (all) await shot(page, `focus-${t}`);
      await readRing(page, ".cm-board-mat .cm-board-field .cm-bcard:not(.is-selected)", `${t} at ${w}, a card on the ${mine} mat`);
      if (all && who === rob) await readRing(page, ".cm-board-mat .cm-bcard.is-selected", `${t} at ${w}, the card picked to read, on the ${mine} mat`);
      await view(page, "table");
      await rest(page);
      await readWords(page, all ? "#cm-board" : "#cm-board .cm-board-table", `${t} at ${w}, Table, the ${mine} and ${theirs} mats`);
      if (all) await shot(page, `table-${t}`);
      if (i === 2 && who === rob) await shot(page, `table-${t}-2`);
      if (all || who === rob) {
        await view(page, "full");
        await rest(page);
        await readWords(page, all ? "#cm-board" : "#cm-board .cm-full-center", `${t} at ${w}, Full screen, the ${mine} and ${theirs} mats`);
        if (all) await shot(page, `full-${t}`);
        if (i === 2) await shot(page, `full-${t}-2`);
      }
      await view(page, "focus");
    }
  }
  lap("the mats");
  /* the board's own chrome in the other two themes, on Rob's page */
  for (const t of ["brass-slate", "steel-cobalt"]) {
    await theme(rob.page, t);
    await rob.page.waitForTimeout(400);
    for (const v of ["focus", "table", "full"]) {
      await view(rob.page, v);
      await rest(rob.page);
      await readWords(rob.page, "#cm-board", `${t}, ${v}`);
    }
    await view(rob.page, "focus");
  }
  await theme(rob.page, "moss-iron");
  await rob.page.waitForTimeout(400);
  /* the pop-ups over the board: Tools, History, Show hand */
  for (const [who, t] of [[rob, "dark"], [maya, "light"]]) {
    const page = who.page;
    await page.click("[data-action=board-tools]");
    await readWords(page, "#cm-board-tools", `${t}: Tools`, {min: 4});
    await page.click("[data-action=board-tools]");
    await page.click(".cm-board-strip [data-action=board-history]");
    await readWords(page, "#cm-board-history", `${t}: History`, {min: 3});
    await page.keyboard.press("Escape");
    await page.click("[data-action=board-show-hand]");
    await page.locator(".cm-hand-show").waitFor();
    await rest(page);
    await readWords(page, ".cm-hand-show", `${t}: Show hand`, {min: 3});
    await page.keyboard.press("Escape");
    await page.locator(".cm-hand-show").waitFor({state: "detached"});
  }

  lap("the other themes and the pop-ups");
  for (const who of [rob, maya]) ok(!who.errors.length, `${who.email}'s page threw nothing (${who.errors.slice(0, 3).join(" | ")})`);
} catch (error) {
  /* a step that could not run is a failure too, said with the ones before it */
  if (!error.counted) failures.push(`the walk stopped: ${String(error && error.stack || error).split("\n").slice(0, 3).join(" ")}`);
} finally {
  await close();
}

/* THE REPORT: the worst word of each kind, and the rings. */
const worst = [...worstSeen.values()].sort((a, b) => a.worst / a.need - b.worst / b.need);
if (process.env.A11Y_VERBOSE === "1") {
  for (const w of worst) console.log(`  ${w.worst.toFixed(2)} (p01 ${w.p01}, p05 ${w.p05}) of ${w.need}  ${w.where} .${w.cls} "${w.text}" -- ${w.label}`);
  for (const r of ringsSeen.sort((a, b) => a.share - b.share).slice(0, 12)) console.log(`  ring ${r.share} (p10 ${r.p10}) ${r.label}`);
}
assert.deepEqual(failures, [], `the accessibility pass failed at ${failures.length} place(s):\n  ` + failures.join("\n  "));
console.log(`a11y-board: ${checks} checks passed — every word on the board and in the lobby at 4.5:1 from its pixels over all ${MATS.length} mats in both themes (the lowest ${worst[0] ? `${worst[0].worst} of ${worst[0].need}, ${worst[0].where} .${worst[0].cls}` : "-"}), the focus rings at 3:1, Tab in reading order through every control with nothing trapped, the keys as bound in Help, every card said with its state and nothing hidden, the questions announced.`);
