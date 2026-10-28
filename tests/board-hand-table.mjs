/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE HAND SIZED BY THE WHEEL, AND YOUR SIDE OF THE TABLE LENGTHENED (Rob, Oct 25, 2026; crankmagic-board.js,
   crankmagic-stage.js, crankmagic-stage.css).

     1. "When cursor is over cards in players hand and they scroll, the hand card's size should increase or decrease."
        Over your own hand -- 3D's fan, the tray in Focus and Table, the phone's hand -- the wheel up grows its cards and
        down shrinks them, continuously, through Hand cards (cm-board-scale:hand): its sliders follow at once, the size is
        kept on this device a moment after the wheel stops, and is there after a reload. It is held between the slider's
        ends, the smallest with no word under 10px, the largest inside the window. It comes before 3D's zoom (the wheel
        elsewhere on the table still zooms) and a row's scroll; Shift with the wheel still scrolls a hand too wide (3D's
        fan turns to its next cards; the phone's hand scrolls); ⌘/Ctrl with the wheel leaves the hand alone.
     2. "Player can expand the table (and their mat size automatically in proportion) by ctrl-left-click, hold and pull or
        push ... to increase / decrease the length of the table on their side ... all the way down, underneath the hand's
        cards, to the padding at the screen edge." In 3D, Ctrl + the left button dragged down lengthens your side, your
        mat by the same length and its cards with it, the seats across the table and the camera unchanged; up shortens
        it, never shorter than it always was; its near edge stops 8px above the screen's foot. Through every frame the
        DOM table is on the Babylon one. Kept on this device; Ctrl + double-click, or ↕ in Camera at 100%, puts it back.
        Ctrl held shows ↕. A plain drag still moves the view (a mat) or tilts it (the bare table); a held right button
        still looks; nothing is played.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-hand-table.mjs
*/
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-hand-table", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "handtable01";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const ISLAND = 524;
/* The sample's hand of four, or one of ten (copies of its cards), for a fan that shows seven at a time. */
function viewOf(hand) {
  const v = structuredClone(sample), zone = v.state.players[v.seat].zones.Hand;
  for (let i = 0; zone.cards.length < hand; i += 1) zone.cards.push({...zone.cards[i % 4], cardId: 95000 + i});
  zone.count = zone.cards.length;
  return v;
}
const SHOTS = process.env.UAT_SHOTS;
if (SHOTS) mkdirSync(SHOTS, {recursive: true});

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (${a} against ${b}, within ${tol})`);
const settle = (page, ms = 120) => page.waitForTimeout(ms);

async function board(mode, {width = 1440, height = 900, hand = 4, init = {}, ready = `#cm-board .cm-bcard[data-card='${ISLAND}']`} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript(([m, init]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
  }, [mode, init]);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [], sent = [], view = viewOf(hand);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {ws.onMessage((m) => sent.push(JSON.parse(m))); ws.send(JSON.stringify({type: "view", view}));});
  const open = async () => {
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator(ready).first().waitFor({timeout: 20000});
    if (mode === "full") await page.locator("[data-engine=babylon][data-renderer=webgl]").waitFor({timeout: 20000});
    await page.waitForTimeout(300); await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await page.evaluate(() => {globalThis.__menus = []; addEventListener("contextmenu", (e) => __menus.push(!e.defaultPrevented));});
  };
  await open();
  const acts = () => sent.filter((x) => x.type === "act");
  return {page, context, errors, acts, reload: async () => {await page.reload(); await page.locator(ready).first().waitFor({timeout: 20000}); if (mode === "full") await page.locator("[data-engine=babylon][data-renderer=webgl]").waitFor({timeout: 20000}); await page.waitForTimeout(300); await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}); await page.evaluate(() => {globalThis.__menus = []; addEventListener("contextmenu", (e) => __menus.push(!e.defaultPrevented));});}};
}
const diag = (page) => page.evaluate(() => CrankStage.diagnostics());
const misalign = (d) => Math.max(...d.quad.map((n, i) => Math.abs(n - d.domQuad[i])));
const mismatrix = (d) => Math.max(...d.front.shown.map((n, i) => Math.abs(n - d.front.matrix[i])));
const stored = (page, k) => page.evaluate((k) => localStorage.getItem(k), k);
/* The hand's cards as drawn: the first one's width, every word's size (a name under its picture too: it shows when the picture does not), and whether they are inside the window. */
const handNow = (page, cards) => page.evaluate((sel) => {
  const els = [...document.querySelectorAll(sel)], boxes = els.map((el) => el.getBoundingClientRect());
  const words = els.flatMap((el) => [...el.querySelectorAll("*")].filter((n) => n.childNodes.length && [...n.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim()) && n.getClientRects().length));
  return {width: els[0]?.offsetWidth || 0, count: els.length, fonts: words.map((n) => parseFloat(getComputedStyle(n).fontSize)),
    top: Math.min(...boxes.map((r) => r.top)), bottom: Math.max(...boxes.map((r) => r.bottom)), left: Math.min(...boxes.map((r) => r.left)), right: Math.max(...boxes.map((r) => r.right)),
    first: els[0]?.closest("[data-hand-index]")?.dataset.handIndex ?? null, h: innerHeight, w: innerWidth};
}, cards);
const slider = (page, sel) => page.evaluate((sel) => {const el = document.querySelector(sel); return el ? {value: Number(el.value), min: Number(el.min), max: Number(el.max), out: el.parentElement.querySelector("output")?.textContent, said: el.getAttribute("aria-valuetext")} : null;}, sel);
/* A point in the middle of a card of the hand, as the pointer finds it. */
const onHand = async (page, sel) => {
  const scan = () => page.evaluate((sel) => {
  for (const el of [...document.querySelectorAll(sel)].reverse()) {const r = el.getBoundingClientRect(); for (const [fx, fy] of [[.5, .6], [.5, .3], [.3, .5]]) {const x = r.left + r.width * fx, y = r.top + r.height * fy; if (x > 0 && y > 0 && x < innerWidth && y < innerHeight && el.contains(document.elementFromPoint(x, y))) return {x, y};}}
  return null;
}, sel);
  let point=await scan();
  if(!point && await page.locator(sel).count()){await page.locator(sel).last().scrollIntoViewIfNeeded();point=await scan();}
  return point;
};
/* The wheel turned over a point, or over a card of a hand (a selector) found again at every notch, as the cards move. */
async function wheel(page, at, dy, times = 1, {dx = 0} = {}) {
  for (let i = 0; i < times; i += 1) {
    const p = typeof at === "string" ? await onHand(page, at) : at;
    assert.ok(p, `a point to turn the wheel over (${at})`);
    await page.mouse.move(p.x, p.y); await page.mouse.wheel(dx, dy); await page.waitForTimeout(40);
  }
  await settle(page);
}

try {
  /* ================= 1. the 3D hand ================= */
  {
    const {page, context, errors, acts, reload} = await board("full", {hand: 4});
    const FAN = ".cm-stage-fan .cm-stage-fan-slot .cm-bcard", HAND = '.cm-stage-camera [data-board-scale="hand"]';
    const rest = await diag(page), at0 = await handNow(page, FAN);
    /* the size it always had at 100%: the formula this change replaced, over the tray as CSS sizes it */
    const before = await page.evaluate(() => {const t = document.querySelector(".cm-stage-hand"); return Math.round(Math.max(70, Math.min(190, (Math.max(220, Math.min(330, innerHeight * .34)) - 24) * 5 / 7, (t.clientWidth - 110) / 6.1)));});
    eq(at0.width, before, `at 100% the fan's cards are the size they always were (${before}px)`);
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    eq((await slider(page, HAND))?.value, 100, "Camera has ✋ Hand cards at 100%");
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    let spot = await onHand(page, FAN);
    ok(spot, "a point on a card of the fan");
    await wheel(page, FAN, -100);
    const up1 = await handNow(page, FAN);
    ok(up1.width > at0.width * 1.06 && up1.width < at0.width * 1.15, `one notch up grows the hand's cards (${at0.width} → ${up1.width}px)`);
    eq(await stored(page, "cm-board-scale:hand"), null, "shown at once, not yet kept while the wheel may still turn");
    ok(await page.waitForFunction(() => Number(localStorage.getItem("cm-board-scale:hand")) > 100, null, {timeout: 2000}).then(() => true, () => false), "and kept on this device once it stops");
    const z1 = await diag(page);
    ok(z1.quad.every((n, i) => Math.abs(n - rest.quad[i]) < 1e-6) && await stored(page, "cm-board-zoom-v2") === null, "the wheel over the hand does not zoom the table");
    spot = await onHand(page, FAN);
    await wheel(page, FAN, -100, 3);
    const up4 = await handNow(page, FAN);
    ok(up4.width > up1.width * 1.2, `more notches, larger again: continuous, not steps (${up1.width} → ${up4.width}px)`);
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    let s = await slider(page, HAND);
    ok(s.value > 130 && s.out === `${s.value}%` && s.said === `${s.value}%`, `✋ in Camera follows (${JSON.stringify(s)})`);
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    if (SHOTS) await page.screenshot({path: path.join(SHOTS, "hand-wheel-3d-larger.png")});
    /* clamped at the slider's ends, the largest inside the window, the smallest legible */
    spot = await onHand(page, FAN);
    await wheel(page, FAN, -400, 8);
    await page.waitForTimeout(400);
    const big = await handNow(page, FAN), top = await page.evaluate(() => document.querySelector(".cm-stage-top").getBoundingClientRect().bottom);
    eq(Number(await stored(page, "cm-board-scale:hand")), 160, "the wheel up stops at the slider's most, 160%");
    ok(big.width >= before * 1.55 && big.top > top && big.left >= 0 && big.right <= big.w && big.top + (big.bottom - big.top) * .5 < big.h, `at its largest the hand is inside the window (${JSON.stringify(big)})`);
    ok(big.fonts.every((f) => f >= 10), `with every word on it 10px or more (${Math.min(...big.fonts)}px)`);
    spot = await onHand(page, FAN);
    await wheel(page, FAN, 400, 16);
    await page.waitForTimeout(400);
    const small = await handNow(page, FAN);
    eq(Number(await stored(page, "cm-board-scale:hand")), 60, "the wheel down stops at the slider's least, 60%");
    ok(small.width >= 84 && small.width < at0.width * .7, `at its smallest the cards are smaller but not under 84px (${small.width}px)`);
    ok(small.fonts.length > 0 && small.fonts.every((f) => f >= 10), `and every word on them is still 10px or more (${small.fonts.join(", ")})`);
    /* a size between, remembered after a reload */
    spot = await onHand(page, FAN);
    await wheel(page, FAN, -100, 5);
    await page.waitForTimeout(400);
    const kept = Number(await stored(page, "cm-board-scale:hand")), keptW = (await handNow(page, FAN)).width;
    await reload();
    eq((await handNow(page, FAN)).width, keptW, `the hand comes back at its size after a reload (${kept}%, ${keptW}px)`);
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    eq((await slider(page, HAND)).value, kept, "and so does ✋");
    /* ✋ moved by hand sizes the fan too: one value */
    await page.locator(HAND).fill("100");
    eq((await handNow(page, FAN)).width, before, "✋ at 100% puts the fan back as it was");
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    /* the wheel elsewhere on the table still zooms */
    const region = await page.locator(".cm-stage-region").boundingBox();
    const bare = await page.evaluate(() => {const r = document.querySelector(".cm-stage-region").getBoundingClientRect(); for (let y = r.top + 20; y < r.bottom - 20; y += 9) for (let x = r.left + r.width * .3; x < r.right - 20; x += 9) if (document.elementFromPoint(x, y)?.matches(".cm-stage-canvas, .cm-stage-region")) return {x, y}; return null;});
    await wheel(page, bare, -200);
    ok(await page.waitForFunction(() => Number(localStorage.getItem("cm-board-zoom-v2")) > 100, null, {timeout: 2000}).then(() => true, () => false), "the wheel over the table, not the hand, still zooms it");
    eq((await handNow(page, FAN)).width, before, "and leaves the hand alone");
    /* ⌘/Ctrl with the wheel over the hand is not the hand's */
    await page.evaluate(() => {globalThis.__wheels = []; addEventListener("wheel", (e) => __wheels.push(e.defaultPrevented));});
    spot = await onHand(page, FAN);
    await page.mouse.move(spot.x, spot.y);
    await page.keyboard.down("Control"); await page.mouse.wheel(0, -100); await page.keyboard.up("Control");
    await settle(page);
    eq([(await handNow(page, FAN)).width, await page.evaluate(() => __wheels)], [before, [false]], "Ctrl + wheel over the hand leaves its size alone and the wheel to the browser");
    eq(acts(), [], "nothing played");
    ok(!errors.length, `no page error (${errors.join(" | ")})`);
    await context.close();
  }
  /* A smaller window, where 60% of the fan's old size would be under 84px: it stops at 84px, its names at 10px. */
  {
    const {page, context, errors} = await board("full", {width: 1100, height: 700, hand: 4});
    const FAN = ".cm-stage-fan .cm-stage-fan-slot .cm-bcard";
    const at0 = await handNow(page, FAN);
    ok(at0.width * .6 < 84, `at 1100×700 the fan is ${at0.width}px at 100%, so 60% of it would be under 84px`);
    await wheel(page, FAN, 400, 12);
    const small = await handNow(page, FAN);
    eq([small.width, await page.waitForFunction(() => localStorage.getItem("cm-board-scale:hand") === "60", null, {timeout: 2000}).then(() => 60, () => null)], [84, 60], "at 60% it stops at 84px");
    ok(small.fonts.length > 0 && small.fonts.every((f) => f >= 10), `and every word on it is 10px or more (${small.fonts.join(", ")})`);
    ok(!errors.length, `no page error (${errors.join(" | ")})`);
    await context.close();
  }
  /* Ten cards: the fan shows as many as fit, never fewer than seven (Rob, Oct 26: "Increase cards in hand dynamically
     based on zoom"), and Shift + wheel turns it. */
  {
    const {page, context, errors} = await board("full", {hand: 10});
    const FAN = ".cm-stage-fan .cm-stage-fan-slot .cm-bcard";
    const was = await handNow(page, FAN);
    ok(was.count >= 7 && was.count < 10 && was.first === "0", `ten cards: the fan shows as many as fit at this size, never fewer than seven, from the first (${was.count})`);
    let spot = await onHand(page, FAN);
    await page.mouse.move(spot.x, spot.y);
    await page.keyboard.down("Shift"); await page.mouse.wheel(0, 100); await page.keyboard.up("Shift");
    await settle(page, 300);
    const turned = await handNow(page, FAN);
    eq([turned.first, turned.width], ["1", was.width], "Shift + wheel turns the fan to the next card, its size unchanged");
    spot = await onHand(page, FAN);
    await wheel(page, FAN, 0, 1, {dx: -100});
    eq((await handNow(page, FAN)).first, "0", "a sideways wheel turns it back");
    /* smaller, more of them fit: at the least, all ten */
    await wheel(page, FAN, 400, 12);
    await settle(page, 300);
    eq((await handNow(page, FAN)).count, 10, "made smaller, more fit: at the least size all ten show");
    await wheel(page, FAN, -400, 12);
    await settle(page, 300);
    /* at the largest, seven still fit across the window: the fan closes up, each card's name still showing */
    spot = await onHand(page, FAN);
    await wheel(page, FAN, -400, 8);
    const wide = await handNow(page, FAN);
    const step = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".cm-stage-fan")).getPropertyValue("--fan-step")));
    ok(wide.left >= 0 && wide.right <= wide.w && step >= wide.width * .4 - .5, `at 160% seven cards stay inside the window, each showing ${Math.round(step / wide.width * 100)}% of itself (${JSON.stringify(wide)})`);
    const arrows = await page.evaluate(() => [...document.querySelectorAll(".cm-stage-hand-arrow")].map((a) => {const r = a.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)];}));
    ok(arrows.length === 2 && arrows[0][0] >= 0 && arrows[1][1] <= wide.w && arrows[0][1] <= wide.left + 12 && arrows[1][0] >= wide.right - 12, `and its ‹ › stay beside it, inside the window (${JSON.stringify(arrows)})`);
    /* STACKED LEFT OVER RIGHT (Rob, 2026-10-26: "The left side of each card should be under the next card"): the leftmost card
       is on top and each card's left edge is under the card to its left, so each name begins past where the card to its
       left ends, and the first card's name is whole. */
    await page.mouse.move(2, 2); await settle(page, 200);   /* the pointer off the fan: a hovered card rises to the top on purpose */
    const stack = await page.evaluate(() => {
      const slots = [...document.querySelectorAll(".cm-stage-fan-slot")];
      const z = slots.map((el) => Number(getComputedStyle(el).zIndex));
      /* In the card's own frame (before the fan's rotation): the card to the left covers the first (width - step) of it. */
      const step = parseFloat(getComputedStyle(document.querySelector(".cm-stage-fan")).getPropertyValue("--fan-step"));
      const starts = slots.map((el) => {const name = el.querySelector(".cm-bcard-name"); return [name.offsetLeft, el.offsetWidth];});
      return {z, firstWhole: starts[0][0] <= starts[0][1] * .1, restPast: starts.slice(1).every(([left, width]) => left >= width - step + 8)};
    });
    ok(stack.z.every((v, i) => i === 0 || v < stack.z[i - 1]), `the fan stacks left over right: the leftmost card on top (${stack.z.join(" > ")})`);
    ok(stack.firstWhole && stack.restPast, `each card's name begins past where the card to its left ends; the first card's is whole (${JSON.stringify(stack)})`);
    ok(!errors.length, `no page error (${errors.join(" | ")})`);
    await context.close();
  }

  /* ================= 2. Focus and Table ================= */
  for (const mode of ["focus", "table"]) {
    const {page, context, errors, reload} = await board(mode, {hand: 4});
    const CARDS = ".cm-board-hand .cm-board-hand-cards .cm-bcard", BAR = '.cm-board-traybar [data-board-scale="hand"]';
    const at0 = await handNow(page, CARDS), mat0 = await page.evaluate(() => document.querySelector(".cm-board-mat .cm-bcard, .cm-board-table .cm-bcard")?.offsetWidth);
    let spot = await onHand(page, CARDS);
    ok(spot, `${mode}: a point on a card of the hand`);
    await wheel(page, CARDS, -100, 2);
    const up = await handNow(page, CARDS), bar = await slider(page, BAR);
    ok(up.width > at0.width * 1.12, `${mode}: the wheel up over the hand grows its cards (${at0.width} → ${up.width}px)`);
    ok(bar.value > 110 && bar.out === `${bar.value}%`, `${mode}: the tray's Hand cards follows (${JSON.stringify(bar)})`);
    eq(await page.evaluate(() => document.querySelector(".cm-board-mat .cm-bcard, .cm-board-table .cm-bcard")?.offsetWidth), mat0, `${mode}: the boards' cards keep their size`);
    ok(await page.waitForFunction((v) => localStorage.getItem("cm-board-scale:hand") === String(v), bar.value, {timeout: 2000}).then(() => true, () => false), `${mode}: kept on this device`);
    spot = await onHand(page, CARDS);
    await wheel(page, CARDS, 400, 12);
    await page.waitForTimeout(400);
    const small = await handNow(page, CARDS);
    eq((await slider(page, BAR)).value, 60, `${mode}: down to the slider's least, 60%`);
    ok(small.fonts.length > 0 && small.fonts.every((f) => f >= 10), `${mode}: at its smallest no word on the hand is under 10px, the names a picture covers included (${small.fonts.join(", ")})`);
    spot = await onHand(page, CARDS);
    await wheel(page, CARDS, -400, 12);
    await page.waitForTimeout(400);
    const big = await handNow(page, CARDS);
    eq((await slider(page, BAR)).value, 160, `${mode}: up to the slider's most, 160%`);
    ok(big.left >= 0 && big.right <= big.w + 1, `${mode}: at its largest the hand is no wider than the window (${big.left}–${big.right} of ${big.w})`);
    spot = await onHand(page, CARDS);
    await wheel(page, CARDS, 100, 3);
    await page.waitForTimeout(400);
    const kept = (await slider(page, BAR)).value, keptW = (await handNow(page, CARDS)).width;
    await reload();
    eq([(await slider(page, BAR)).value, (await handNow(page, CARDS)).width], [kept, keptW], `${mode}: after a reload the hand and its slider are where the wheel left them (${kept}%)`);
    /* the wheel elsewhere on the board is not the hand's */
    const field = await page.evaluate(() => {const r = document.querySelector(".cm-board-mat, .cm-board-table").getBoundingClientRect(); return {x: r.left + r.width * .5, y: r.top + 40};});
    await wheel(page, field, -100, 2);
    eq((await slider(page, BAR)).value, kept, `${mode}: the wheel over the board leaves the hand's size alone`);
    if (SHOTS && mode === "focus") await page.screenshot({path: path.join(SHOTS, "hand-wheel-focus.png")});
    ok(!errors.length, `${mode}: no page error (${errors.join(" | ")})`);
    await context.close();
  }
  /* The phone's hand: the wheel sizes it; Shift + wheel scrolls it, as it overflows. */
  {
    const {page, context, errors} = await board("focus", {width: 390, height: 844, hand: 10, ready: "#cm-board[data-phone] .cm-phone-battlefield"});
    await page.locator("#cm-board[data-phone]").waitFor();
    await page.getByRole("button", {name: "Your hand", exact: true}).click();
    const SLOT = ".cm-hand-show .cm-hand-fan .cm-bcard";
    await page.locator(SLOT).first().waitFor();
    const at0 = await handNow(page, SLOT);
    let spot = await onHand(page, SLOT);
    await wheel(page, SLOT, -100, 2);
    const up = await handNow(page, SLOT);
    ok(up.width > at0.width * 1.12, `phone: the wheel up over the hand grows its cards (${at0.width} → ${up.width}px)`);
    ok(await page.waitForFunction(() => Number(localStorage.getItem("cm-board-scale:hand")) > 110, null, {timeout: 2000}).then(() => true, () => false), "phone: kept on this device");
    const fan = page.locator(".cm-hand-show .cm-hand-fan");
    spot = await onHand(page, SLOT);
    await page.mouse.move(spot.x, spot.y);
    await page.keyboard.down("Shift"); await page.mouse.wheel(0, 200); await page.keyboard.up("Shift");
    await settle(page, 300);
    ok(await fan.evaluate((el) => el.scrollLeft) > 0, "phone: Shift + wheel scrolls a hand too wide for the screen");
    eq((await handNow(page, SLOT)).width, up.width, "phone: and leaves its size alone");
    ok(!errors.length, `phone: no page error (${errors.join(" | ")})`);
    await context.close();
  }

  /* ================= 3. your side of the table, lengthened ================= */
  {
    const {page, context, errors, acts, reload} = await board("full", {hand: 4});
    const region = await page.locator(".cm-stage-region").boundingBox();
    const rest = await diag(page);
    eq([rest.length.reach, rest.length.scale], [0, 1], "at first the table is the length it always was");
    ok(misalign(rest) < .03 && mismatrix(rest) < .001, `and the DOM and Babylon tables agree (${misalign(rest)}px)`);
    if (SHOTS) await page.screenshot({path: path.join(SHOTS, "table-default.png")});
    const spots = await page.evaluate(() => {
      const r = document.querySelector(".cm-stage-region").getBoundingClientRect(), found = {};
      for (let y = r.top + 20; y < r.top + r.height * .6; y += 9) for (let x = r.left + 20; x < r.right - 20; x += 9) {
        const el = document.elementFromPoint(x, y);
        if (!found.ground && el?.matches(".cm-stage-canvas, .cm-stage-region")) found.ground = {x, y};
        if (!found.mat && el?.closest(".cm-stage-front .cm-mat") && !el.closest(".cm-bcard, button, a, [role=button], [data-zone-scroll], [draggable=true]") && x > r.left + r.width * .3 && y > r.top + r.height * .4) found.mat = {x, y};
        if (!found.card && el?.closest(".cm-stage-front .cm-bcard[data-card]") && y > r.top + r.height * .35) found.card = {x, y, id: el.closest(".cm-bcard").dataset.card};
      }
      return found;
    });
    ok(spots.ground && spots.mat && spots.card, `the bare table, a bare place on your mat and a card on it can all be reached (${JSON.stringify(spots)})`);
    /* Ctrl held: ↕ */
    const cursor = (p) => page.evaluate(({x, y}) => getComputedStyle(document.elementFromPoint(x, y)).cursor, p);
    await page.mouse.move(spots.mat.x, spots.mat.y);
    const plain = await cursor(spots.mat);
    await page.keyboard.down("Control");
    await page.mouse.move(spots.mat.x + 1, spots.mat.y);
    eq([await cursor(spots.mat), await cursor(spots.card), await cursor(spots.ground)], ["ns-resize", "ns-resize", "ns-resize"], "Ctrl held over the table: the pointer is ↕, on the mat, a card and the bare table");
    await page.keyboard.up("Control");
    await page.mouse.move(spots.mat.x, spots.mat.y);
    eq(await cursor(spots.mat), plain, `and let go, it is the mat's again (${plain})`);
    /* Ctrl + drag down: longer, every frame aligned */
    const tiltWas = await stored(page, "cm-board-tilt-v4"), cardWas = await page.evaluate(() => getComputedStyle(document.querySelector(".cm-stage-region")).getPropertyValue("--stage-card"));
    await page.evaluate(() => {globalThis.__frames = []; const loop = () => {const d = CrankStage.diagnostics(); if (d.length) __frames.push({reach: d.length.reach, scale: d.length.scale, builds: d.length.builds, mis: Math.max(...d.quad.map((n, i) => Math.abs(n - d.domQuad[i]))), mm: Math.max(...d.front.shown.map((n, i) => Math.abs(n - d.front.matrix[i])))}); globalThis.__raf = requestAnimationFrame(loop);}; loop();});
    await page.mouse.move(spots.mat.x, spots.mat.y);
    await page.keyboard.down("Control");
    await page.mouse.down();
    await page.mouse.move(spots.mat.x, spots.mat.y + 60, {steps: 6});
    await page.waitForTimeout(150);
    const mid = await diag(page);
    eq(await page.evaluate(() => document.getElementById("cm-board").dataset.stretch), "on", "while it is dragged the board says so (↕ everywhere on it)");
    ok(mid.length.reach > 30 && mid.length.scale > 1 && mid.length.builds === rest.length.builds, `mid-drag the table is longer, the table built at rest stretched rather than built again (${JSON.stringify(mid.length)})`);
    ok(misalign(mid) < .05 && mismatrix(mid) < .001, `and the DOM and Babylon tables agree mid-drag (${misalign(mid).toFixed(4)}px)`);
    await page.mouse.move(spots.mat.x, spots.mat.y + 120, {steps: 6});
    await page.mouse.up();
    await page.keyboard.up("Control");
    await page.waitForTimeout(200);
    const frames = await page.evaluate(() => {cancelAnimationFrame(__raf); return __frames;});
    const longer = await diag(page);
    ok(frames.length >= 5 && Math.max(...frames.map((f) => f.mis)) < .05 && Math.max(...frames.map((f) => f.mm)) < .001, `through every frame of the drag the DOM cards stay on the Babylon table (${frames.length} frames, ${Math.max(...frames.map((f) => f.mis)).toFixed(4)}px)`);
    ok(longer.length.reach > mid.length.reach && longer.length.scale === 1 && longer.length.builds === rest.length.builds + 1, `let go, it is longer still and built once at its length (${JSON.stringify(longer.length)})`);
    /* the pointer crossed about as much table as the table grew: the plane under the pointer, before and after */
    const crossed = await page.evaluate(([a, b]) => CrankStage.pick(b.x, b.y).y - CrankStage.pick(a.x, a.y).y, [spots.mat, {x: spots.mat.x, y: spots.mat.y + 120}]);
    near(longer.length.reach, crossed, 1, "it grew by as much table as the pointer crossed");
    near(longer.front.height - rest.front.height, longer.length.reach, .01, "your mat is longer by the same length");
    eq(longer.rear, rest.rear, "the seats across the table keep their size");
    ok(longer.camera.position.every((n, i) => n === rest.camera.position[i]) && longer.quad.slice(0, 4).every((n, i) => Math.abs(n - rest.quad[i]) < .05), "the camera and the table's far edge stay where they were");
    ok(misalign(longer) < .03 && mismatrix(longer) < .001, `and after it the DOM and Babylon tables agree (${misalign(longer)}px)`);
    const cardNow = await page.evaluate(() => getComputedStyle(document.querySelector(".cm-stage-region")).getPropertyValue("--stage-card"));
    ok(parseFloat(cardNow) > parseFloat(cardWas), `the mat's cards grow with it (${cardWas} → ${cardNow})`);
    eq([longer.pan, await stored(page, "cm-board-tilt-v4")], [{x: 0, y: 0}, tiltWas], "Ctrl + drag neither moves the view nor tilts it");
    ok(Number(await stored(page, "cm-stage-reach-v1")) > 0, "the length is kept on this device");
    let length = await slider(page, ".cm-stage-camera [data-stage-length]");
    eq(length, null, "(Camera is shut)");
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    length = await slider(page, ".cm-stage-camera [data-stage-length]");
    eq([length.min, length.value, length.out], [100, 100 + Math.round(longer.length.reach / longer.length.base * 100), `${length.value}%`], `↕ in Camera follows (${JSON.stringify(length)})`);
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    /* down past the screen's foot: it stops with its near edge 8px above it, under the hand's cards */
    await page.mouse.move(spots.mat.x, spots.mat.y);
    await page.keyboard.down("Control");
    await page.mouse.down();
    await page.mouse.move(spots.mat.x, region.y + region.height + 300, {steps: 10});
    await page.mouse.up();
    await page.keyboard.up("Control");
    await page.waitForTimeout(200);
    const longest = await diag(page), handTop = (await handNow(page, ".cm-stage-fan .cm-stage-fan-slot .cm-bcard")).top - region.y;
    near(longest.length.reach, longest.length.most, 1e-6, "dragged past the screen's foot, it stops at its longest");
    near(Math.max(longest.domQuad[5], longest.domQuad[7]), region.height - 8, .5, "its near edge 8px above the bottom of the screen");
    ok(longest.domQuad[5] > handTop + 100, `under the hand's cards (the edge at ${Math.round(longest.domQuad[5])}px, the cards from ${Math.round(handTop)}px)`);
    ok(misalign(longest) < .03 && mismatrix(longest) < .001, `the DOM and Babylon tables agree at its longest (${misalign(longest)}px)`);
    const fonts = await page.evaluate(() => [...document.querySelectorAll(".cm-stage-front *")].filter((n) => [...n.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim()) && n.getClientRects().length).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    ok(fonts.length && fonts.every((f) => f >= 10), `every word on your mat is 10px or more (${Math.min(...fonts)}px)`);
    if (SHOTS) await page.screenshot({path: path.join(SHOTS, "table-stretched-to-the-foot.png")});
    /* remembered */
    const keptReach = await stored(page, "cm-stage-reach-v1");
    await reload();
    const after = await diag(page);
    near(after.length.reach / after.length.base, Number(keptReach), 1e-3, `after a reload your side is as long as you left it (${keptReach})`);
    ok(misalign(after) < .03 && mismatrix(after) < .001 && after.length.scale === 1, `and built at that length, aligned (${misalign(after)}px)`);
    /* a plain drag on the mat still moves the view; on the bare table it still tilts; a held right button still looks */
    const matSpot = await page.evaluate(() => {
      const r = document.querySelector(".cm-stage-region").getBoundingClientRect();
      for (let y = r.top + r.height * .45; y < r.top + r.height * .62; y += 7) for (let x = r.left + r.width * .3; x < r.right - 40; x += 9) {const el = document.elementFromPoint(x, y); if (el?.closest(".cm-stage-front .cm-mat") && !el.closest(".cm-bcard, button, a, [role=button], [data-zone-scroll], [draggable=true]")) return {x, y};}
      return null;
    });
    await page.mouse.move(matSpot.x, matSpot.y); await page.mouse.down(); await page.mouse.move(matSpot.x - 120, matSpot.y, {steps: 6}); await page.mouse.up();
    const panned = await diag(page);
    ok(panned.pan.x > 40 && Math.abs(panned.length.reach - after.length.reach) < 1e-6, `a plain drag on the mat still moves the view, the length unchanged (${JSON.stringify(panned.pan)})`);
    ok(misalign(panned) < .03, `aligned (${misalign(panned)}px)`);
    /* (No ⌖ Center since Oct 26: Camera's Reset puts every camera setting back, the length too.) Dragged back, the view
       is where it was. */
    await page.mouse.move(matSpot.x - 120, matSpot.y); await page.mouse.down(); await page.mouse.move(matSpot.x, matSpot.y, {steps: 6}); await page.mouse.up();
    const back = await diag(page);
    ok(Math.abs(back.pan.x) < 1 && Math.abs(back.length.reach - after.length.reach) < 1e-6, `dragged back, the view is where it was and the length unchanged (${JSON.stringify(back.pan)})`);
    await page.mouse.move(spots.ground.x, spots.ground.y); await page.mouse.down(); await page.mouse.move(spots.ground.x, spots.ground.y + 20, {steps: 5}); await page.mouse.up();
    eq(await stored(page, "cm-board-tilt-v4"), "32", "a plain drag on the bare table still tilts it (40 to 32 from the floor)");
    const tilted = await diag(page);
    ok(misalign(tilted) < .03 && mismatrix(tilted) < .001, `tilted, the long table is still aligned (${misalign(tilted)}px)`);
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    await page.getByRole("slider", {name: "Table tilt", exact: true}).fill("40");
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    await page.mouse.move(region.x + region.width * .8, region.y + region.height * .55);
    await page.mouse.down({button: "right"});
    ok(await page.waitForFunction(() => CrankStage.diagnostics().look?.t === 1, null, {timeout: 4000, polling: "raf"}).then(() => true, () => false), "a held right button still looks");
    ok(misalign(await diag(page)) < .05, "the long table aligned while it looks");
    await page.mouse.up({button: "right"});
    await page.waitForFunction(() => CrankStage.diagnostics().look === null, null, {timeout: 4000, polling: "raf"});
    /* Ctrl + drag up: shorter, never shorter than it always was */
    await page.mouse.move(spots.mat.x, spots.mat.y + 40);
    await page.keyboard.down("Control");
    await page.mouse.down();
    await page.mouse.move(spots.mat.x, spots.mat.y - 40, {steps: 5});
    await page.waitForTimeout(100);
    const shorter = await diag(page);
    ok(shorter.length.reach < after.length.reach && shorter.length.reach > 0, `dragged up it is shorter (${Math.round(after.length.reach)} → ${Math.round(shorter.length.reach)}px)`);
    await page.mouse.move(spots.mat.x, region.y + 5, {steps: 8});
    await page.mouse.up();
    await page.keyboard.up("Control");
    await page.waitForTimeout(200);
    const least = await diag(page);
    eq([least.length.reach, least.front.height, Number(await stored(page, "cm-stage-reach-v1"))], [0, rest.front.height, 0], "up past where it began, it stops at the length it always had");
    ok(least.domQuad.every((n, i) => Math.abs(n - rest.domQuad[i]) < 1e-6), "exactly the table it was");
    /* Ctrl + drag on a card is the table's: the card is not picked, played or dragged; no menu opens */
    const selectedWas = await page.evaluate(() => document.querySelector(".cm-board-ask")?.textContent || "");
    await page.mouse.move(spots.card.x, spots.card.y);
    await page.keyboard.down("Control");
    await page.mouse.down();
    await page.mouse.move(spots.card.x, spots.card.y + 70, {steps: 6});
    await page.mouse.up();
    await page.keyboard.up("Control");
    await page.waitForTimeout(250);
    ok((await diag(page)).length.reach > 20, "Ctrl + drag that starts on a card lengthens the table too");
    eq([await page.evaluate(() => document.querySelector(".cm-board-ask")?.textContent || ""), await page.locator("#cm-card-menu").count(), acts()], [selectedWas, 0, []], "and the card is not picked, no menu opens, nothing is played");
    /* Ctrl + double-click: back */
    await page.mouse.move(spots.ground.x, spots.ground.y);
    await page.keyboard.down("Control");
    await page.mouse.dblclick(spots.ground.x, spots.ground.y);
    await page.keyboard.up("Control");
    await page.waitForTimeout(200);
    eq([(await diag(page)).length.reach, await stored(page, "cm-stage-reach-v1")], [0, "0"], "Ctrl + double-click puts the length back");
    /* ↕ in Camera: the same length, by slider or keys, back to 100% */
    await page.getByRole("button", {name: "Camera", exact: false}).click();
    const L = page.getByRole("slider", {name: "Table length on your side", exact: true});
    await L.focus(); for (let i = 0; i < 10; i += 1) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const keyed = await diag(page);
    near(keyed.length.reach / keyed.length.base, .1, 1e-6, "→ on ↕ lengthens your side a percent at a time");
    ok(keyed.length.scale === 1 && misalign(keyed) < .03, "built at its length and aligned");
    await L.fill("100");
    eq([(await diag(page)).length.reach, await stored(page, "cm-stage-reach-v1")], [0, "0.0000"], "↕ at 100% is the length it always had");
    ok((await page.evaluate(() => __menus)).every((open) => !open), "the browser's own menu never opened");
    eq(acts(), [], "nothing was played");
    ok(!errors.length, `no page error (${errors.join(" | ")})`);
    await context.close();
  }
  /* The hand enlarged and the table at its longest, together, for the record. */
  if (SHOTS) {
    const {page, context} = await board("full", {hand: 7, init: {"cm-board-scale:hand": "140", "cm-stage-reach-v1": "1"}});
    await page.screenshot({path: path.join(SHOTS, "hand-140-table-longest.png")});
    await context.close();
  }
} finally {
  await close();
}
console.log(`board-hand-table: ${checks} checks passed`);
