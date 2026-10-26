/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE 3D CAMERA BY HAND, AND A CARD'S MENU (Rob, Oct 25, 2026; crankmagic-stage.js, crankmagic-board.js,
   crankmagic-stage.css).

     1. The wheel zooms the 3D table toward the pointer, the Camera's Zoom slider following and the zoom kept on this
        device -- except over a row of cards that scrolls, which still scrolls; ⌘/Ctrl with the wheel zooms there too,
        and ⌘/Ctrl + and − still size the cards.
     2. A mat dragged with the left button moves the view across the table, the place taken hold of staying under the
        pointer; dragging the empty table still tilts it. ⌖ Center puts the view back.
     3. A right button held (200 ms) anywhere on the table -- a card, a mat, the bare table -- looks at the place: the
        head turns, the shoulders lean, the head pitches down, until the place is about halfway to the center of the view, in 0.25 s +
        0.40 s·r (the farthest about 0.65 s); let go, the same motion backward from wherever it reached, to exactly the
        resting camera. Reduced motion jumps. The DOM cards stay on the Babylon table through every frame of it.
     4. A quick right click on a card, in every view, shows what it can do: the card to read (🔍 and its name), then each
        offer of the room's for it as a glyph and the fewest words, nothing the room did not offer. A row stages the
        choice; the Menu key and Shift+F10 open it from the keyboard; Escape closes it, back to the card. The browser's
        own menu never opens on the 3D table.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-3d-camera.mjs
*/
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-3d-camera", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "camera0001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
/* The room's offers for this turn: the sample's own (play the Island, untap the Chalice) and three more of the kinds the room
   sends (docs/ui-lane/gameplay-anchor.md): a spell with its targets and what pays for it, and a land's mana. */
const ISLAND = 524, RIME = 453, CHALICE = 461, TOWER = 502, PROFT = 526;
const view = structuredClone(sample);
view.decision.options.push(
  {index: 3, label: "Rime Chill", act: "cast", cardId: RIME, detail: "→ up to two targets · tapping Island, Access Tunnel"},
  {index: 4, label: "Command Tower", act: "activate-mana", cardId: TOWER, detail: "{U}"},
  {index: 5, label: "Command Tower", act: "activate-mana", cardId: TOWER, detail: "{G}"});
const offered = (id) => view.decision.options.filter((o) => o.cardId === id).map((o) => o.index);
const SHOTS = process.env.UAT_SHOTS;

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (${a} against ${b}, within ${tol})`);

async function board(mode, {width = 1440, height = 900, reduced = false} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: reduced ? "reduce" : "no-preference", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [], sent = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  let sock = null;
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.onMessage((m) => sent.push(JSON.parse(m))); ws.send(JSON.stringify({type: "view", view}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator(`#cm-board .cm-bcard[data-card='${ISLAND}']`).first().waitFor({timeout: 20000});
  if (mode === "full") await page.locator("[data-engine=babylon][data-renderer=webgl]").waitFor({timeout: 20000});
  await page.waitForTimeout(300);
  /* Every browser menu asked for, and whether the board kept it shut. */
  await page.evaluate(() => {globalThis.__menus = []; addEventListener("contextmenu", (e) => __menus.push({open: !e.defaultPrevented, table: !!e.target.closest?.(".cm-stage-region")}));});
  const acts = () => sent.filter((x) => x.type === "act").map((x) => x.indices);
  /* The room's answer to a play: here, the same offers again at a new revision. */
  let revision = view.revision;
  const again = async () => {sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view: {...structuredClone(view), revision: ++revision}})); await page.waitForTimeout(350);};
  return {page, context, errors, sent, acts, again};
}
const diag = (page) => page.evaluate(() => CrankStage.diagnostics());
/* The Babylon table and the DOM surfaces, one projection: the table's corners as Babylon draws them against the DOM's, and
   the front mat's matrix3d as the browser applied it against the geometry's. */
const misalign = (d) => Math.max(...d.quad.map((n, i) => Math.abs(n - d.domQuad[i])));
const mismatrix = (d) => Math.max(...d.front.shown.map((n, i) => Math.abs(n - d.front.matrix[i])));

try {
  /* ================= the 3D table ================= */
  const {page, context, errors, acts, again} = await board("full");
  const rest = await diag(page);
  ok(misalign(rest) < .03 && mismatrix(rest) < .001, `at rest the DOM and Babylon tables agree (${misalign(rest)}px)`);
  const region = await page.locator(".cm-stage-region").boundingBox();
  /* A point of each kind: the bare table (tilts), a mat with no card or row under it (pans). */
  const spots = await page.evaluate(() => {
    const r = document.querySelector(".cm-stage-region").getBoundingClientRect(), found = {};
    for (let y = r.top + 20; y < r.bottom - 20; y += 9) for (let x = r.left + 20; x < r.right - 20; x += 9) {
      const el = document.elementFromPoint(x, y);
      if (!found.ground && el?.matches(".cm-stage-canvas, .cm-stage-region")) found.ground = {x, y};
      if (!found.mat && el?.closest(".cm-stage-front .cm-mat") && !el.closest(".cm-bcard, button, a, [role=button], [data-zone-scroll], [draggable=true]") && x > r.left + r.width * .3 && y > r.top + r.height * .45) found.mat = {x, y};
    }
    return found;
  });
  ok(spots.ground && spots.mat, `the bare table and a bare place on the mat can both be reached (${JSON.stringify(spots)})`);

  /* ---- 1. the wheel zooms, toward the pointer ---- */
  const zoomSlider = () => page.getByRole("slider", {name: "Table zoom", exact: true});
  await page.getByRole("button", {name: "Camera", exact: false}).click();
  eq(await zoomSlider().inputValue(), "100", "the zoom starts at 100%");
  const point = {x: region.x + region.width * .7, y: region.y + region.height * .55};
  const beforePick = await page.evaluate(({x, y}) => CrankStage.pick(x, y).world, point);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(400);
  const zoomed = Number(await zoomSlider().inputValue());
  ok(zoomed > 120 && zoomed <= 200, `the wheel up zooms in, the slider following (${zoomed}%)`);
  /* kept a moment after the wheel stops, as the slider keeps it when let go */
  ok(await page.waitForFunction((v) => localStorage.getItem("cm-board-zoom-v2") === v, String(zoomed), {timeout: 3000}).then(() => true, () => false), "and the zoom is kept on this device, as the slider keeps it");
  const afterPick = await page.evaluate(({x, y}) => CrankStage.pick(x, y).world, point);
  ok(Math.hypot(afterPick[0] - beforePick[0], afterPick[2] - beforePick[2]) < 1, `the place under the pointer stays under it: the wheel zooms toward it (${JSON.stringify([beforePick, afterPick])})`);
  const z = await diag(page);
  ok(misalign(z) < .03 && mismatrix(z) < .001, `zoomed, the DOM and Babylon tables still agree (${misalign(z)}px)`);
  await page.mouse.wheel(0, 2400);
  await page.waitForTimeout(400);
  eq(await zoomSlider().inputValue(), "60", "the wheel down zooms out to the slider's least, 60%");
  await zoomSlider().fill("100");
  await page.locator("[data-action=board-camera-center]").click();
  eq((await diag(page)).pan, {x: 0, y: 0}, "⌖ Center puts the view back over the table's center");
  const centered = await diag(page);
  ok(centered.domQuad.every((n, i) => Math.abs(n - rest.domQuad[i]) < 1e-6), "and at 100% the table is exactly where it rested");
  /* Over a row of cards that scrolls the wheel scrolls it, as it did; with Ctrl it zooms. */
  await page.getByRole("slider", {name: "Tabletop card size", exact: true}).fill("200");
  await page.getByRole("button", {name: "Camera", exact: false}).click();
  const row = page.locator(".cm-stage-front [data-zone-scroll]").first();
  ok(await row.count() === 1, "at the largest card size a row of the mat scrolls");
  const rowBox = await row.boundingBox(), inRow = {x: rowBox.x + rowBox.width / 2, y: rowBox.y + Math.min(rowBox.height / 2, 40)};
  ok(await page.evaluate(({x, y}) => !!document.elementFromPoint(x, y).closest("[data-zone-scroll]"), inRow), "the pointer is over the row");
  const scrolled = () => row.evaluate((el) => el.scrollTop + el.scrollLeft), tableAt = async () => (await diag(page)).domQuad;
  const quadWas = await tableAt();
  await page.mouse.move(inRow.x, inRow.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  ok(await scrolled() > 0, "over the row the wheel scrolls the row");
  eq(await tableAt(), quadWas, "and does not zoom the table");
  const rowAt = await scrolled();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await page.waitForTimeout(400);
  ok(JSON.stringify(await tableAt()) !== JSON.stringify(quadWas) && await page.waitForFunction(() => Number(localStorage.getItem("cm-board-zoom-v2")) > 100, null, {timeout: 3000}).then(() => true, () => false), "with Ctrl the wheel over the row zooms the table");
  eq(await scrolled(), rowAt, "and leaves the row where it was");
  /* ⌘/Ctrl + and − still size the cards, not the table. */
  const scale = () => page.evaluate(() => getComputedStyle(document.getElementById("cm-board")).getPropertyValue("--card-scale") || document.documentElement.style.getPropertyValue("--card-scale"));
  const zoomBefore = await page.evaluate(() => localStorage.getItem("cm-board-zoom-v2"));
  const cardsBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => /card-scale/.test(k))));
  await page.locator("#cm-board .cm-stage-caption").evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+=");
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => /card-scale/.test(k)))) !== cardsBefore, "Ctrl + still sizes the cards");
  eq(await page.evaluate(() => localStorage.getItem("cm-board-zoom-v2")), zoomBefore, "and leaves the table's zoom alone");
  await page.keyboard.press("Control+-");
  void scale;
  await page.getByRole("button", {name: "Camera", exact: false}).click();
  await page.getByRole("slider", {name: "Tabletop card size", exact: true}).fill("100");
  await zoomSlider().fill("100");

  /* ---- 2. a mat drags the view; the bare table still tilts ---- */
  await page.locator("[data-action=board-camera-center]").click();
  await page.getByRole("button", {name: "Camera", exact: false}).click();
  const tiltWas = await page.evaluate(() => localStorage.getItem("cm-board-tilt-v2"));
  const grab = await page.evaluate(({x, y}) => CrankStage.pick(x, y).world, spots.mat);
  await page.mouse.move(spots.mat.x, spots.mat.y);
  await page.mouse.down();
  await page.mouse.move(spots.mat.x - 140, spots.mat.y - 30, {steps: 8});
  await page.mouse.up();
  const panned = await diag(page);
  ok(panned.pan.x > 40, `dragging a mat to the left moves the view to the right (${JSON.stringify(panned.pan)})`);
  const held = await page.evaluate(({x, y}) => CrankStage.pick(x, y).world, {x: spots.mat.x - 140, y: spots.mat.y - 30});
  ok(Math.hypot(held[0] - grab[0], held[2] - grab[2]) < 1.5, `the place taken hold of stays under the pointer (${JSON.stringify([grab, held])})`);
  eq(await page.evaluate(() => localStorage.getItem("cm-board-tilt-v2")), tiltWas, "dragging a mat does not tilt the table");
  ok(misalign(panned) < .03 && mismatrix(panned) < .001, `moved, the DOM and Babylon tables still agree (${misalign(panned)}px)`);
  eq(acts(), [], "dragging a mat plays nothing");
  await page.mouse.move(spots.ground.x, spots.ground.y);
  await page.mouse.down();
  await page.mouse.move(spots.ground.x, spots.ground.y + 20, {steps: 5});
  await page.mouse.up();
  eq(await page.evaluate(() => localStorage.getItem("cm-board-tilt-v2")), "44", "dragging the bare table still tilts it, as before");
  eq((await diag(page)).pan, panned.pan, "and does not move the view");
  await page.getByRole("button", {name: "Camera", exact: false}).click();
  await page.getByRole("slider", {name: "Table tilt", exact: true}).fill("40");
  await page.locator("[data-action=board-camera-center]").click();
  await page.getByRole("button", {name: "Camera", exact: false}).click();
  const home = await diag(page);
  ok(home.camera.position.every((n, i) => Math.abs(n - rest.camera.position[i]) < 1e-9), "centered again, the camera is back where it rested");

  /* ---- 3. a right button held looks at the place ---- */
  /* Every frame recorded in the page: the motion's progress and the time the stage computed it at (its own clock, the
     frame's), the camera Babylon drew with, how far the DOM table is from the Babylon one, and when the button went down
     and came up. Timing is read from the motion's clock, not from how often this machine manages a frame: a container
     with no GPU draws the table about ten times a second. */
  await page.evaluate(() => {
    globalThis.__frames = [];
    addEventListener("pointerdown", (e) => {if (e.button === 2) globalThis.__down = performance.now();}, true);
    addEventListener("pointerup", (e) => {if (e.button === 2) globalThis.__up = performance.now();}, true);
    const loop = (now) => {
      const d = CrankStage.diagnostics(), l = d.look;
      __frames.push({now, t: l ? l.t : null, dir: l?.dir, ms: l?.ms, r: l?.r, at: l?.at, clock: l?.clock, started: l?.started, back: l?.back, center: d.center, position: d.camera.position, rotation: d.camera.rotation,
        mis: Math.max(...d.quad.map((n, i) => Math.abs(n - d.domQuad[i]))), mm: Math.max(...d.front.shown.map((n, i) => Math.abs(n - d.front.matrix[i])))});
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const frames = async () => page.evaluate(() => {const f = __frames; globalThis.__frames = []; return {f, down: globalThis.__down, up: globalThis.__up};});
  /* A place on the table (plane fractions), on the screen as the camera rests. */
  const place = (fx, fy) => page.evaluate(([fx, fy]) => {
    const r = document.querySelector(".cm-stage-region").getBoundingClientRect(), g = CrankStage.geometry(r.width, r.height, {tilt: 40, zoom: 100, seats: 3});
    const [x, y] = g.project(g.width * fx, g.planeHeight * fy);return {x: r.left + x, y: r.top + y};
  }, [fx, fy]);
  const same = (a, b) => a.position.every((n, i) => Math.abs(n - b.position[i]) < 1e-9) && a.rotation.every((n, i) => Math.abs(n - b.rotation[i]) < 1e-9);
  const atRest = {position: rest.camera.position, rotation: rest.camera.rotation};
  async function look(spot, {release = "end", label} = {}) {
    await frames();
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down({button: "right"});
    if (release === "half") await page.waitForFunction(() => (CrankStage.diagnostics().look?.t ?? 0) >= .3, null, {timeout: 4000, polling: "raf"});
    else {
      if (label && SHOTS) {await page.waitForFunction(() => (CrankStage.diagnostics().look?.t ?? 0) >= .45, null, {timeout: 4000, polling: "raf"}); await page.screenshot({path: path.join(SHOTS, `head-look-${label}-midway.png`)});}
      await page.waitForFunction(() => CrankStage.diagnostics().look?.t === 1, null, {timeout: 4000, polling: "raf"});
      await page.waitForTimeout(150);
      if (label && SHOTS) await page.screenshot({path: path.join(SHOTS, `head-look-${label}-held.png`)});
    }
    const forward = await frames();
    await page.mouse.up({button: "right"});
    await page.waitForFunction(() => CrankStage.diagnostics().look === null, null, {timeout: 4000, polling: "raf"});
    /* And until the recorder has a frame drawn after the look ended: on a slow runner frames come 250 ms and more apart,
       and a fixed wait could stop on a frame from before the last step home. */
    await page.waitForFunction(() => __frames.length && __frames.at(-1).t === null, null, {timeout: 4000, polling: "raf"});
    await page.waitForTimeout(150);
    const back = await frames();
    const moving = forward.f.filter((x) => x.t > 0), turned = back.f.filter((x) => x.dir === -1);
    return {forward, back, moving, start: moving[0], reached: moving.find((x) => x.t === 1), turned, release: turned[0]?.back, last: back.f.at(-1)};
  }
  /* The motion keeps time: every frame on its way is exactly where its clock says (t = elapsed / its length), from the
     moment the hold was recognized; and backward from the moment it was let go, from where it had reached. */
  const onTime = (m) => m.moving.filter((x) => x.dir === 1 && x.t < 1).every((x) => Math.abs(x.clock - x.t * x.ms - x.started) < 1);
  const backOnTime = (m) => m.turned.filter((x) => x.t > 0).every((x) => Math.abs(x.t - (m.release.t - (x.clock - m.release.at) / x.ms)) < 1e-6);
  const far = await place(.93, .86), close_ = await place(.53, .55);
  for (const [name, spot] of [["far", far], ["near", close_]]) ok(await page.evaluate(({x, y}) => {const el = document.elementFromPoint(x, y); return !!el.closest(".cm-stage-region") && !el.closest(".cm-stage-camera, .cm-board-ask, .cm-stage-actions");}, spot), `the ${name} place is on the table, under no overlay`);
  if (SHOTS) await page.screenshot({path: path.join(SHOTS, "head-look-rest.png")});
  const a = await look(far, {label: "far"});
  const waited = a.start.started - a.forward.down;
  ok(waited >= 195 && waited < 400, `the look starts once the button has been held 200 ms (${Math.round(waited)} ms)`);
  near(a.start.ms, 650, 1, "a place at the far corner is the farthest (r = 1) and takes 0.65 s");
  ok(a.moving.filter((x) => x.t < 1).length >= 3 && onTime(a), `the far motion keeps time from the hold: there in 0.65 s, never more than 0.7 s (${a.moving.length} frames)`);
  ok(a.moving.every((x, i) => i === 0 || x.t >= a.moving[i - 1].t), "it moves one way while held");
  const mid = a.moving.reduce((best, x) => Math.abs(x.t - .5) < Math.abs(best.t - .5) ? x : best), end = a.reached;
  ok(mid.t > .2 && mid.t < .8, `a frame halfway through (t ${mid.t.toFixed(2)})`);
  ok(mid.rotation[1] > 0 && mid.rotation[1] < end.rotation[1], `halfway the head has turned part of the way toward the right (yaw ${mid.rotation[1].toFixed(4)} of ${end.rotation[1].toFixed(4)})`);
  ok(mid.rotation[0] >= rest.camera.rotation[0] && mid.rotation[0] < end.rotation[0], `halfway it has pitched part of the way down (${mid.rotation[0].toFixed(4)} of ${end.rotation[0].toFixed(4)}, at rest ${rest.camera.rotation[0].toFixed(4)})`);
  ok(end.position[0] > rest.camera.position[0] && end.position[1] < rest.camera.position[1], `the shoulders lean toward the place and lower the eye (${JSON.stringify(end.position)} from ${JSON.stringify(rest.camera.position)})`);
  /* A glance, about half (Rob, Oct 25): the place ends about halfway from where it was to the center of the view. */
  const off = (x) => Math.hypot(x.at[0] - x.center[0], x.at[1] - x.center[1]), glance = (m) => off(m.reached) / off(m.moving[0]);
  ok(glance(a) > .3 && glance(a) < .7, `at the end the place held is about halfway to the center of the view (${Math.round(off(a.moving[0]))}px → ${Math.round(off(end))}px)`);
  const all = [...a.forward.f, ...a.back.f];
  ok(Math.max(...all.map((x) => x.mis)) < .05 && Math.max(...all.map((x) => x.mm)) < .001, `through every frame the DOM cards stay on the Babylon table (${Math.max(...all.map((x) => x.mis)).toFixed(4)}px; ${all.length} frames)`);
  ok(Math.abs(a.release.at - a.back.up) < 60 && a.release.t === 1, `let go, it turns back at once (${Math.round(a.release.at - a.back.up)} ms after the button came up)`);
  ok(a.turned.length >= 3 && backOnTime(a), "running the same motion backward, in the same time");
  ok(a.turned.every((x, i) => i === 0 || x.t <= a.turned[i - 1].t), "backward all the way");
  ok(same(a.last, atRest), "and it ends exactly at the resting camera");
  const d0 = await diag(page);
  ok(d0.domQuad.every((n, i) => Math.abs(n - rest.domQuad[i]) < 1e-9), "with the DOM table exactly where it rested");
  /* A nearer place, a shorter motion. */
  const b = await look(close_);
  ok(b.start.r < .3 && b.start.ms < 400 && b.start.ms < a.start.ms - 200, `a place near the centerline is a shorter motion (${Math.round(b.start.ms)} ms, r ${b.start.r.toFixed(2)}, against ${a.start.ms} ms)`);
  ok(onTime(b) && backOnTime(b), "and keeps its own time there and back");
  ok(off(b.reached) < off(b.moving[0]) && (off(b.moving[0]) < 20 || (glance(b) > .3 && glance(b) < .7)), `ending with that place about halfway to the center of the view (${Math.round(off(b.moving[0]))}px → ${Math.round(off(b.reached))}px)`);
  ok(same(b.last, atRest), "and it too comes back exactly");
  /* Let go partway: backward from there, in the time it took to get there. */
  const c = await look(far, {release: "half"});
  ok(c.release.t >= .3 && c.release.t < 1, `let go partway (at ${c.release.t.toFixed(2)})`);
  ok(c.turned.length >= 2 && backOnTime(c), `it comes back from where it was, not from the end: ${Math.round(c.release.t * 650)} ms`);
  ok(same(c.last, atRest), "to exactly the resting camera");
  /* Held on a card: it looks, and the card's menu does not open; a quick press on the card does not look. */
  const proft = page.locator(`.cm-stage-front .cm-bcard[data-card='${PROFT}']`);
  const onProft = await page.evaluate((id) => {
    const r = document.querySelector(`.cm-stage-front .cm-bcard[data-card='${id}']`).getBoundingClientRect();
    for (let y = r.top + r.height / 2; y < r.bottom; y += 4) for (let x = r.left + r.width / 2; x < r.right; x += 4) if (document.elementFromPoint(x, y)?.closest(".cm-bcard")?.dataset.card === String(id)) return {x, y};
    return null;
  }, PROFT);
  ok(onProft, "a point on Proft itself, as the pointer finds it");
  const dHold = await look(onProft);
  ok(dHold.reached && same(dHold.last, atRest), "held on a card, the camera looks at it, and back");
  eq(await page.locator("#cm-card-menu").count(), 0, "and the card's menu does not open");
  await frames();
  await proft.click({button: "right"});
  await page.locator("#cm-card-menu").waitFor({timeout: 2000});
  await page.waitForTimeout(300);
  ok((await frames()).f.every((x) => x.t === null), "a quick right click on a card does not move the camera");

  /* ---- 4. a card's menu: what it can do, in shorthand ---- */
  const menu = page.locator("#cm-card-menu");
  const readMenu = () => menu.evaluate((m) => ({label: m.getAttribute("aria-label"), role: m.getAttribute("role"),
    card: [...(m.querySelector("[data-action=board-card-menu-view]")?.children || [])].map((n) => n.textContent).join(" ") || null,
    rows: [...m.querySelectorAll("[data-action=board-card-menu-do]")].map((r) => ({index: Number(r.dataset.index), text: [...r.children].map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim(), said: r.getAttribute("aria-label"), mana: r.querySelectorAll(".cm-mana img, .cm-mana svg").length})),
    none: m.querySelector(".cm-card-menu-none")?.textContent.trim() || null, focused: document.activeElement?.closest("#cm-card-menu") ? document.activeElement.getAttribute("aria-label") : null}));
  let m = await readMenu();
  eq([m.role, m.card, m.rows, m.none], ["menu", "🔍 Proft, Consulting Detective", [], "∅ No actions now"], "a card the room offers nothing for says so in three words, and still opens to read");
  ok(/no actions now/.test(m.label), `and its menu says so to a reader (${m.label})`);
  await page.keyboard.press("Escape");
  ok(await menu.count() === 0, "Escape closes it");
  const cardOn = (id, where = ".cm-stage-fan") => page.locator(`${where} .cm-bcard[data-card='${id}']`).first();
  await cardOn(ISLAND).click({button: "right"});
  m = await readMenu();
  eq(m.rows.map((r) => r.index), offered(ISLAND), "the Island's menu lists the one thing the room offers for it");
  eq([m.card, m.rows[0].text, m.rows[0].said, m.focused], ["🔍 Island", "⤓ Play", "Play Island", "Play Island"], "as ⤓ Play under the card's name, said in full, the focus on it");
  await page.keyboard.press("ArrowUp");
  eq((await readMenu()).focused, "Read Island", "the arrows move between the card and its offers");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  ok(await menu.count() === 0, "choosing an offer closes the menu");
  await page.locator("#cm-board-decision [data-action=board-confirm]").waitFor({timeout: 3000});
  eq(acts(), [], "and stages it, as a click on the card does: nothing is sent yet");
  await page.locator("#cm-board-decision [data-action=board-confirm]").click();
  for (let i = 0; i < 100 && !acts().length; i += 1) await page.waitForTimeout(20);
  eq(acts(), [[1]], "Confirm plays it, once");
  /* The view a played land leaves is not this test's business: the offers come back as they were. */
  await again();
  await cardOn(RIME).click({button: "right"});
  m = await readMenu();
  eq(m.rows.map((r) => r.index), offered(RIME), "Rime Chill's menu lists only its own offer");
  eq(m.rows[0].text, "✦ Cast → up to two targets · ↷ Island, Access Tunnel", "✦ Cast, then where it goes and what it taps, in shorthand");
  eq(m.rows[0].said, "Cast Rime Chill → up to two targets · tapping Island, Access Tunnel", "and in full to a reader");
  await page.keyboard.press("Escape");
  await cardOn(TOWER, ".cm-stage-front").click({button: "right"});
  m = await readMenu();
  eq(m.rows.map((r) => r.index), offered(TOWER), "the Command Tower's menu lists its two ways of making mana");
  ok(m.rows.every((r) => r.text.startsWith("↷") && r.mana === 1), `each a tap and the mana it makes, as a symbol (${JSON.stringify(m.rows)})`);
  await page.keyboard.press("Escape");
  await cardOn(CHALICE, ".cm-stage-front").click({button: "right"});
  m = await readMenu();
  eq([m.rows.map((r) => r.index), m.rows[0]?.text], [offered(CHALICE), "↶ Untap"], "the Chalice's: ↶ Untap");
  /* The card, to read, at one press. */
  await menu.locator("[data-action=board-card-menu-view]").click();
  await page.locator("#cm-card-inspector").waitFor({timeout: 3000});
  ok((await page.locator("#cm-card-inspector h3").innerText()).includes("Everflowing Chalice"), "🔍 and the name open the card to read");
  await page.locator("[data-action=board-inspect-close]").click();
  /* From the keyboard: the Menu key or Shift+F10 on the card with the focus; Escape goes back to the card. */
  await cardOn(RIME).focus();
  await page.keyboard.press("Shift+F10");
  await menu.waitFor({timeout: 2000});
  eq((await readMenu()).focused, "Cast Rime Chill → up to two targets · tapping Island, Access Tunnel", "Shift+F10 opens the focused card's menu, on its first offer");
  await page.keyboard.press("Escape");
  eq(await page.evaluate(() => document.activeElement?.dataset.card), String(RIME), "Escape puts the focus back on the card");
  await page.keyboard.press("ContextMenu");
  await menu.waitFor({timeout: 2000});
  eq((await readMenu()).rows.map((r) => r.index), offered(RIME), "and so does the Menu key");
  await page.mouse.click(5, 5);
  ok(await menu.count() === 0, "a press anywhere else puts it away");
  eq(acts(), [[1]], "opening and reading menus plays nothing more");
  if (SHOTS) {await cardOn(TOWER, ".cm-stage-front").click({button: "right"}); await page.screenshot({path: path.join(SHOTS, "card-menu-3d.png")}); await page.keyboard.press("Escape");}
  await page.keyboard.press("Escape");
  const menus = await page.evaluate(() => __menus);
  ok(menus.length > 0 && menus.every((m) => !m.open), `the browser's own menu never opens on the 3D table (${menus.length} asked)`);
  eq(acts(), [[1]], "looking plays nothing: the one act sent is the Island confirmed above");
  ok(!errors.length, `no page error (${errors.join(" | ")})`);
  await context.close();

  /* The card's menu in the other views, where a right click is only ever a click. */
  for (const mode of ["focus", "table"]) {
    const {page, context, errors, acts} = await board(mode);
    const menu = page.locator("#cm-card-menu");
    await page.locator(`.cm-board-hand .cm-bcard[data-card='${ISLAND}']`).click({button: "right"});
    await menu.waitFor({timeout: 2000});
    const rows = await menu.locator("[data-action=board-card-menu-do]").evaluateAll((els) => els.map((r) => Number(r.dataset.index)));
    eq(rows, offered(ISLAND), `${mode}: a right click on the Island shows the room's one offer for it`);
    eq(await menu.locator("[data-action=board-card-menu-view]").getAttribute("aria-label"), "Read Island", `${mode}: and the card, to read`);
    ok(await menu.evaluate((m) => {const r = m.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;}), `${mode}: the menu is inside the window`);
    await page.keyboard.press("Escape");
    ok(await menu.count() === 0, `${mode}: Escape closes it`);
    const menus = await page.evaluate(() => __menus);
    ok(menus.length === 1 && !menus[0].open, `${mode}: the browser's own menu stays shut on a card`);
    eq(acts(), [], `${mode}: nothing played`);
    if (SHOTS && mode === "focus") {await page.locator(`.cm-board-hand .cm-bcard[data-card='${RIME}']`).click({button: "right"}); await page.screenshot({path: path.join(SHOTS, "card-menu-focus.png")});}
    ok(!errors.length, `${mode}: no page error (${errors.join(" | ")})`);
    await context.close();
  }

  /* Reduced motion: the look jumps there and back. */
  {
    const {page, context, errors} = await board("full", {reduced: true});
    await page.evaluate(() => {globalThis.__seen = []; const loop = () => {const d = CrankStage.diagnostics(); if (d.look) __seen.push(d.look.t); requestAnimationFrame(loop);}; requestAnimationFrame(loop);});
    const r = await page.locator(".cm-stage-region").boundingBox();
    await page.mouse.move(r.x + r.width * .85, r.y + r.height * .6);
    await page.mouse.down({button: "right"});
    await page.waitForTimeout(400);
    const held = await diag(page);
    eq(held.look?.t, 1, "with reduced motion the held look is there at once");
    ok((await page.evaluate(() => __seen)).every((t) => t === 1), "with no frame in between");
    await page.mouse.up({button: "right"});
    await page.waitForTimeout(50);
    const back = await diag(page);
    ok(back.look === null && same(back.camera, atRest), "and let go, it is back at once, exactly");
    ok(!errors.length, `reduced motion: no page error (${errors.join(" | ")})`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`board-3d-camera: ${checks} checks passed`);
