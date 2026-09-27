/* THE CLOUD BOARD (M5; crankmagic-board.js), a real game between two browsers.
 *
 * Rob at 1400 and Maya at 1280 sit at one table. Behind their pages, /api/tables is answered by the real table
 * (the GameTable object over game/room/table.mjs) as each of them, and each page's own WebSocket to
 * /api/tables/<id>/connect is carried to that same object: the frames each page receives are exactly what the
 * room sends that seat, and are kept here to be read.
 *
 *   Open      the lobby hands the page to the board once the game is on; both boards open over the socket.
 *   Hidden    Maya's frames never carry a card of Rob's hand or library, only its count; nor his hers.
 *   Decide    the opening hand's Keep; a land played from the hand by tapping it (bright = you can use it);
 *             Pass priority through the steps into turn 2, both boards following, the step ribbon with them.
 *   Views     Table (both boards, you at the foot, the logo opening Table vitals), Focus, Full screen (the whole
 *             window; a picked card large at the side); ⎋ leaves; the view is remembered on the device.
 *   Hand      the card-size slider and Ctrl −; a card shown large under the pointer, and in Card zoom on a right
 *             click; Show hand: Space fans it, a number holds a card up, Escape puts it back, Enter plays it.
 *   Coach     the chat panel over the right edge (the shell): prompts, a stub reply that says so, Shift+Enter,
 *             a draft kept through a view, Clear chat, Escape; from the pane, Tools and Full screen's rail.
 *   Phones    Focus only: the 52px rail, the 112px seat strip, the pill; a seat tapped and ‹ ›; snapping back when
 *             asked; ✋ at a readable size; held upright, the surface turned a quarter; back at a desk, the desk board.
 *   Refused   an answer the room refuses is said in words, and the board takes the room's view.
 *   Dropped   a socket that closes is reopened; the other player is told who dropped, and it clears when
 *             they are back.
 *   End       Tools › End game asks a second tap, then both boards say it was ended early; back to the table.
 *   Shape     one 48px strip; 5:7 cards sized by width, hand larger than the mat's; no sideways scroll.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
import {basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

/* THE SERVER, HERE. Each player's deck has cards only they own by name, so a leak can be looked for. */
const cards = (name) => basicCards(name) ?? {types: ["Creature"], power: 2, toughness: 2, manaCost: "{2}"};
const ROB = "rob@example.com", MAYA = "maya@example.com";
let clock = Date.parse("2026-09-26T22:00:00Z");
const map = new Map(), live = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; live.push(s);}, getWebSockets: () => live.filter((s) => !s.closed), getTags: (s) => s.tags};
const object = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "tableboard01";
const call = async (p, email, body) => (await object.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json();
const deck = (who, land) => ({name: `${who}'s deck`, commander: [`${who} General`], cards: [...Array(40)].map((_, i) => i % 2 ? land : `${who} Secret ${i}`)});

/* One queue for everything the object is asked, as a Durable Object runs one request at a time. */
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const writes = [];
/* A person's table reads can be held, so the room's socket is the only way news can reach them. */
const held = {};
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  if (method === "GET" && held[email]) await held[email].promise;
  if (method !== "GET") writes.push({path: url.pathname, header: req.headers()["x-crankmagic"], type: req.headers()["content-type"]});
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => object.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}

/* THE SOCKET, CARRIED. The page's WebSocket is answered here: its server end is a socket the object accepts
   through its real /connect route (the platform's two pieces stood in for), and every frame either way is kept. */
const frames = {[ROB]: [], [MAYA]: []}, routes = {[ROB]: [], [MAYA]: []};
function carry(email) {
  return (ws) => {
    const server = {tags: null, closed: false, send(f) {if (!this.closed) {frames[email].push(f); ws.send(f);}}, close() {this.closed = true;}};
    routes[email].push({ws, server});
    serial(async () => {
      object.socketPair = () => [{}, server];
      object.upgraded = () => ({status: 101});
      const r = await object.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": email}}));
      if (r.status !== 101) ws.close({code: 1008, reason: "refused"});
    });
    ws.onMessage((message) => serial(() => object.webSocketMessage(server, message)));
    ws.onClose(() => serial(async () => {if (!server.closed) {server.closed = true; await object.webSocketClose(server, 1001);}}));
  };
}
/* The room ends a socket, as a network would: the page sees it close, the room sees its seat's last one go. */
async function dropSocket(email) {
  const {ws, server} = routes[email].at(-1);
  await serial(async () => {server.closed = true; await object.webSocketClose(server, 1006);});
  await ws.close({code: 1006, reason: "gone"});
}

const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const {browser, base, stub, close} = await openBrowser({name: "table-board", flag: "GEOMETRY_REQUIRED"});
async function person(email, viewport, {fullscreen = true} = {}) {
  const context = await browser.newContext({viewport, serviceWorkers: "block"});
  const page = await context.newPage();
  /* A browser that will not give a page the whole screen (a phone's, or one set so): the view must fill the window by itself. */
  if (!fullscreen) await page.addInitScript(() => Object.defineProperty(Document.prototype, "fullscreenEnabled", {get: () => false}));
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/tables**`, (r) => answer(r, email));
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry(email));
  await page.goto("about:blank");
  return {context, page};
}
const text = (page, sel) => page.locator(sel).first().innerText();
const waitText = (page, sel, re, timeout = 20000) => page.waitForFunction(([s, src]) => new RegExp(src).test(document.querySelector(s)?.innerText || ""), [sel, re.source], {timeout});
const views = (email) => frames[email].map((f) => JSON.parse(f)).filter((f) => f.view).map((f) => f.view);

try {
  /* THE TABLE, set up through the server as the lobby would: Rob hosts, Maya joins, both ready, it starts. */
  await call("/table/create", ROB, {tableId: TABLE, hostName: "Rob", seats: [{kind: "human", name: "Maya"}]});
  await call("/table/join", MAYA, {code: (await call("/table/invite", ROB, {seatId: 1})).invite.code});
  await call("/table/deck", ROB, {seatId: 0, deck: deck("Rob", "Forest")});
  await call("/table/deck", MAYA, {seatId: 1, deck: deck("Maya", "Island")});
  await call("/table/ready", ROB, {ready: true}); await call("/table/ready", MAYA, {ready: true});
  await call("/table/mat", ROB, {mat: "forge"});
  await call("/table/start", ROB, {});
  clock += 10000; await object.alarm();

  const rob = await person(ROB, {width: 1400, height: 900});
  const maya = await person(MAYA, {width: 1280, height: 800}, {fullscreen: false});

  /* OPEN */
  await rob.page.goto(`${base}/index.html#table?id=${TABLE}`);
  await maya.page.goto(`${base}/index.html#table?id=${TABLE}`);
  await rob.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  await maya.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  ok(routes[ROB].length === 1 && routes[MAYA].length === 1, "the lobby hands each page to the board, and each opens one socket to the table");
  eq(await rob.page.locator(".cm-board-tile .cm-board-tile-name").allInnerTexts(), ["You · Rob", "Maya"], "the pane holds every seat, yours first here");

  /* DECIDE: the opening hands. Whoever is asked keeps, until nobody is. */
  await waitText(rob.page, "#cm-board-decision", /Keep this hand\?/);
  const robHand = await rob.page.locator(".cm-board-hand .cm-bcard").count();
  eq(robHand, 7, "Rob's hand is seven cards, drawn face up for him");
  ok(/Maya.*waiting|Waiting on Rob/i.test(await text(maya.page, ".cm-board-waiting")), `Maya is told who the table waits on: "${await text(maya.page, ".cm-board-waiting")}"`);
  for (let round = 0; round < 6; round += 1) {
    let kept = false;
    for (const who of [rob, maya]) {
      const keep = who.page.locator("#cm-board-decision [data-action=board-option]", {hasText: "Keep"});
      if (await keep.count()) {await keep.click(); kept = true; await who.page.waitForTimeout(300);}
    }
    if (!kept && !(await rob.page.locator("#cm-board-decision", {hasText: "Keep this hand"}).count()) && !(await maya.page.locator("#cm-board-decision", {hasText: "Keep this hand"}).count())) break;
  }
  await rob.page.waitForFunction(() => /Turn 1/.test(document.querySelector(".cm-board-turn")?.innerText || ""), null, {timeout: 20000});
  ok(true, "both keep, and turn 1 begins on both boards");

  /* HIDDEN: nothing of the other seat's hand or library, in anything the room sent. */
  const leaks = (email, owner) => frames[email].filter((f) => f.includes(`${owner} Secret`)).length;
  eq([leaks(MAYA, "Rob"), leaks(ROB, "Maya")], [0, 0], `no frame to either player named a card of the other's hand or library (${frames[MAYA].length + frames[ROB].length} frames read)`);
  await maya.page.click(".cm-board-tile[data-seat='0'] [data-action=board-focus]");
  ok(/Rob's hand · 7/.test(await text(maya.page, ".cm-board-mat")), "Maya can look at Rob's board, and sees his hand as a count");
  const mats = await maya.page.evaluate(() => {const m = document.querySelector(".cm-board-mat"); return [m.dataset.mat, getComputedStyle(m).backgroundImage.includes("radial-gradient")];});
  ok(mats[0] === "forge" && mats[1], "and it is drawn on Rob's mat, the forge");
  await maya.page.click(".cm-board-tile[data-seat='1'] [data-action=board-focus]");
  const own = await maya.page.evaluate(() => {const m = document.querySelector(".cm-board-mat"); return [m.dataset.mat, getComputedStyle(m).backgroundImage];});
  await maya.page.click(".cm-board-tile[data-seat='0'] [data-action=board-focus]");
  const robs = await maya.page.evaluate(() => getComputedStyle(document.querySelector(".cm-board-mat")).backgroundImage);
  ok(own[0] === "felt" && own[1] !== robs, "her own board is on felt, and looks it");
  await serial(() => call("/table/mat", MAYA, {mat: "night"}));
  await rob.page.click(".cm-board-tile[data-seat='1'] [data-action=board-focus]");
  await rob.page.waitForFunction(() => document.querySelector(".cm-board-mat")?.dataset.mat === "night", null, {timeout: 10000});
  ok(true, "a mat changed mid-game reaches the other board");
  await rob.page.click(".cm-board-tile[data-seat='0'] [data-action=board-focus]");
  ok(!(await maya.page.content()).includes("Rob Secret"), "and her page holds none of his cards by name");
  await maya.page.click(".cm-board-tile[data-seat='1'] [data-action=board-focus]");

  /* DECIDE: the active player plays a land by tapping it in the hand. */
  const active = /Turn 1 · You/.test(await text(rob.page, ".cm-board-turn")) ? rob : maya, other = active === rob ? maya : rob;
  const activeSeat = active === rob ? 0 : 1, land = active === rob ? "Forest" : "Island";
  /* Turn 1 opens in the upkeep, where nothing in a hand can be played: both pass until the active player's main 1. */
  for (let i = 0; i < 30 && !(await active.page.locator(".cm-board-hand .cm-bcard.is-bright").count()); i += 1) {
    for (const who of [active, other]) {
      const pass = who.page.locator("[data-action=board-pass]:not([disabled])");
      if (await pass.count()) {await pass.click(); await who.page.waitForTimeout(200);}
    }
    await active.page.waitForTimeout(150);
  }
  ok(/Main 1/.test(await text(active.page, ".cm-board-step")), `Pass priority takes the table to main 1 (${(await text(active.page, ".cm-board-step")).trim()})`);
  const brightLand = active.page.locator(".cm-board-hand .cm-bcard.is-bright", {hasText: land}).first();
  ok(await brightLand.count() === 1, `with priority in main 1, a ${land} in the hand is bright: it can be played now`);
  ok(await active.page.locator(".cm-board-hand .cm-bcard.is-dim").count() > 0, "and the cards that cannot be used now are dimmed");
  const also = await text(active.page, "#cm-board-decision");
  ok(new RegExp(`Play ${land}`).test(also) && !/Pass priority/.test(also) && (also.match(new RegExp(`Play ${land}`, "g")) || []).length === 1, `the panel says what else can be done, each kind once, Pass left to the strip: "${also.replace(/\s+/g, " ").trim()}"`);
  const ink = await active.page.evaluate(() => {const el = document.querySelector(".cm-board-hand .cm-bcard .cm-bcard-name"); return getComputedStyle(el).color;});
  eq(ink, "rgb(31, 28, 24)", "a card's name is printed in the card's own dark ink, not the mat's light one");
  await shot(active.page, "board-priority-" + (active === rob ? "1400" : "1280"));
  await brightLand.click();
  await waitText(active.page, ".cm-board-lands", /Lands · 1/);
  ok(/land drop used/.test(await text(active.page, ".cm-board-lands")), "tapping it plays it: Lands · 1, the land drop used");
  await other.page.click(`.cm-board-tile[data-seat='${activeSeat}'] [data-action=board-focus]`);
  await waitText(other.page, ".cm-board-lands", /Lands · 1/);
  ok((await text(other.page, ".cm-board-lands")).includes(land), "the other board shows the same land, now public");
  /* With the land down there are two things to do, pass or tap it for mana: Pass priority passes. */
  ok(/Tap for mana/.test(await text(active.page, "#cm-board-decision")), "the land played, the panel offers its mana");
  await active.page.click("[data-action=board-pass]");
  await waitText(active.page, ".cm-board-waiting", new RegExp(`Waiting on ${active === rob ? "Maya" : "Rob"}`));
  eq(await active.page.locator(".cm-board-lands .cm-bcard.is-tapped").count(), 0, "Pass priority hands priority on, and taps nothing");

  /* HISTORY: the table's history, public, newest first; a band on the Focus mat, and History ▾ with a filter. */
  const who = active === rob ? "Rob" : "Maya";
  await waitText(other.page, ".cm-board-band", new RegExp(`${who} played ${land}`));
  ok((await other.page.locator(".cm-board-band li").first().innerText()).includes(`${who} played ${land}`), `the history band on the mat says it, newest first: "${who} played ${land}"`);
  await active.page.click("[data-action=board-history]");
  await active.page.locator("#cm-board-history").waitFor();
  const rows = await active.page.locator("#cm-board-history .cm-history-list li").allInnerTexts();
  ok(rows.some((r) => /^Turn 1 · /.test(r)) && rows.some((r) => new RegExp(`${who} drew 7 cards`).test(r)), `History ▾ holds the turns and the opening draws, uncounted cards unnamed (${rows.length} lines)`);
  ok(rows.findIndex((r) => r.includes(`played ${land}`)) < rows.findIndex((r) => /drew 7 cards/.test(r)), "newest first");
  ok(/Start$/.test(rows.find((r) => /drew 7 cards/.test(r)).trim()), "what happened before turn 1 is marked Start");
  await active.page.fill("#cm-board-history .cm-history-filter", land);
  const shown = await active.page.locator("#cm-board-history .cm-history-list li:not([hidden])").allInnerTexts();
  ok(shown.length >= 1 && shown.every((r) => r.includes(land)), `the filter keeps only the lines that match (${shown.length})`);
  /* A view arrives while the filter is being typed in: the filter keeps its focus, its words and its caret. */
  const otherPass = other.page.locator("[data-action=board-pass]:not([disabled])");
  const before = views(active === rob ? ROB : MAYA).length;
  if (await otherPass.count()) await otherPass.click();
  await active.page.waitForTimeout(600);
  const kept = await active.page.evaluate(() => {const el = document.activeElement; return el && el.matches("[data-board-history-filter]") ? [el.value, el.selectionStart] : null;});
  ok(views(active === rob ? ROB : MAYA).length > before && kept && kept[0] === land && kept[1] === land.length, `a view arriving mid-filter leaves the filter as it was (${JSON.stringify(kept)})`);
  await shot(active.page, "board-history-" + (active === rob ? "1400" : "1280"));
  await active.page.keyboard.press("Escape");
  await active.page.locator("#cm-board-history").waitFor({state: "detached"});
  ok(true, "Escape closes it");

  /* THE THREE VIEWS. Table: both boards at once, you at the foot, the logo between them opening Table vitals. */
  await rob.page.click("[data-action=board-view][data-view=table]");
  await rob.page.locator(".cm-board-table .cm-seatboard").nth(1).waitFor();
  const tableGeo = await rob.page.evaluate(() => {
    const box = (q) => document.querySelector(q).getBoundingClientRect();
    const mine = box(".cm-seatboard.is-you"), theirs = box(".cm-seatboard:not(.is-you)"), center = box(".cm-board-center");
    return {mineBelow: mine.top >= theirs.bottom, border: getComputedStyle(document.querySelector(".cm-seatboard.is-you")).borderTopWidth,
      centerBetween: center.top < mine.top && center.bottom > theirs.bottom, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth};
  });
  ok(tableGeo.mineBelow && tableGeo.border === "2px", `Table view: Rob's board at the foot in brass (${tableGeo.border}), Maya's above`);
  ok(tableGeo.centerBetween && tableGeo.sideways === 0, "the logo sits in the gap between the boards, and nothing scrolls sideways");
  ok((await text(rob.page, `.cm-seatboard[data-seat='${activeSeat}']`)).includes(land), "the land played is on its owner's board in the Table view too");
  await shot(rob.page, "board-table-1400");
  await rob.page.click(".cm-board-center");
  await rob.page.locator(".cm-table-vitals").waitFor();
  const vitalsRows = await rob.page.locator(".cm-table-vitals [role=row]").allInnerTexts();
  const flat = vitalsRows.map((r) => r.replace(/\s+/g, " ").trim());
  ok(flat[0] === "You Maya" && flat[1] === "Life 40 40" && flat[2] === "Poison 0 / 10 0 / 10", `Table vitals: every seat's life and poison (${flat.slice(0, 3).join(" | ")})`);
  ok(flat.includes("From Rob General — 0 / 21") && flat.includes("From Maya General 0 / 21 —"), `and each commander's damage to every other seat, its own seat "—" (${flat.slice(3).join(" | ")})`);
  await shot(rob.page, "table-vitals-1400");
  await rob.page.keyboard.press("Escape");
  await rob.page.locator(".cm-seatboard:not(.is-you) [data-action=board-vitals]").click();
  await rob.page.locator(".cm-table-vitals").waitFor();
  ok(true, "any seat's vitals pill opens Table vitals too");
  await rob.page.keyboard.press("Escape");
  await rob.page.locator(".cm-seatboard:not(.is-you) [data-action=board-focus]").click();
  await rob.page.locator(".cm-board-mat").waitFor();
  ok(/Maya's hand/.test(await text(rob.page, ".cm-board-mat")) && await rob.page.getAttribute("#cm-board", "data-view") === "focus", "⤢ Focus on Maya's board puts it on the mat, in the Focus view");
  await rob.page.click(".cm-board-tile[data-seat='0'] [data-action=board-focus]");

  /* Full screen: the page is the game's; a card picked shows large at the side with what it can do; ⎋ leaves. */
  await maya.page.click("[data-action=board-view][data-view=full]");
  await maya.page.locator(".cm-full-rail").waitFor();
  const fullGeo = await maya.page.evaluate(() => {const r = document.getElementById("cm-board").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), innerWidth, innerHeight, document.documentElement.scrollWidth - document.documentElement.clientWidth];});
  ok(fullGeo[0] === 0 && fullGeo[1] === 0 && fullGeo[2] === fullGeo[4] && fullGeo[3] === fullGeo[5] && fullGeo[6] === 0, `Full screen takes the whole window by itself where the browser gives no full screen (${fullGeo.slice(0, 4).join(",")} of ${fullGeo[4]}×${fullGeo[5]})`);
  ok(await maya.page.locator(".cm-full-others .cm-seatboard").count() === 1 && await maya.page.locator(".cm-full-mine .cm-seatboard.is-you").count() === 1, "the other seat across the top, hers across the foot");
  ok(/played (Forest|Island)/.test(await text(maya.page, ".cm-full-side .cm-board-band")), "and the history in the side column");
  const firstHand = maya.page.locator(".cm-board-hand .cm-bcard").first(), firstName = (await firstHand.getAttribute("aria-label")).split(/[,:]/)[0];
  await firstHand.click();
  await maya.page.locator(".cm-full-pick").waitFor();
  ok((await maya.page.getAttribute(".cm-full-pick", "aria-label")) === firstName, `a card picked shows large at the side (${firstName}), and picking it does nothing else`);
  await shot(maya.page, "board-full-1280");
  await maya.page.click("[data-action=board-view][data-view=focus][aria-label='Leave full screen']");
  await maya.page.locator(".cm-board-strip").waitFor();
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "focus", "⎋ leaves Full screen for Focus");
  await maya.page.click("[data-action=board-view][data-view=full]");
  await maya.page.locator(".cm-full-rail").waitFor();
  const pillClear = await maya.page.evaluate(() => {const pill = document.querySelector(".cm-full-pill").getBoundingClientRect(), first = document.querySelector(".cm-full-mine .cm-seatboard-body").getBoundingClientRect(); return first.top >= pill.bottom;});
  ok(pillClear, "the step and Pass pill sits over her board without covering its first row");
  await maya.page.keyboard.press("Escape");
  await maya.page.locator(".cm-board-strip").waitFor();
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "focus", "and so does Escape");

  /* Where the browser will, Full screen asks it for the whole screen, and gives it back on the way out. */
  await rob.page.click("[data-action=board-view][data-view=full]");
  await rob.page.waitForFunction(() => document.fullscreenElement && document.fullscreenElement.id === "cm-board", null, {timeout: 10000});
  await rob.page.click("[aria-label='Leave full screen']");
  await rob.page.waitForFunction(() => !document.fullscreenElement, null, {timeout: 10000});
  ok(true, "where the browser allows it, Full screen is the whole screen, and ⎋ gives it back");

  /* The view is remembered on this device: Table, then a reload, and it is still Table. */
  await rob.page.click("[data-action=board-view][data-view=table]");
  await rob.page.reload();
  await rob.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  await rob.page.locator(".cm-board-table").waitFor({timeout: 20000});
  ok(await rob.page.getAttribute("#cm-board", "data-view") === "table", "the view chosen is the view Rob comes back to");
  await rob.page.click("[data-action=board-view][data-view=focus]");
  await other.page.click(`.cm-board-tile[data-seat='${1 - activeSeat}'] [data-action=board-focus]`);

  /* REFUSED: an answer to a question already gone is refused, in words, and the board takes the room's view. */
  const {server} = routes[active === rob ? ROB : MAYA].at(-1);
  const stale = views(active === rob ? ROB : MAYA).at(-1);
  await serial(() => object.webSocketMessage(server, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: stale.revision - 1, kind: "answer", choiceId: "gone", indices: [0]})));
  await active.page.locator("#cm-notice").filter({hasText: /./}).first().waitFor({timeout: 10000});
  ok((await text(active.page, "#cm-notice")).length > 5, `a refused answer is said: "${(await text(active.page, "#cm-notice")).trim()}"`);

  /* DECIDE: Pass priority, whoever holds it, until turn 2; both boards follow. */
  const seenSteps = new Set();
  for (let i = 0; i < 80; i += 1) {
    if (/Turn 2/.test(await text(rob.page, ".cm-board-turn"))) break;
    let passed = false;
    for (const who of [rob, maya]) {
      const pass = who.page.locator("[data-action=board-pass]:not([disabled])");
      if (await pass.count()) {
        seenSteps.add((await text(who.page, ".cm-board-step")).trim());
        await pass.click(); passed = true;
        await who.page.waitForTimeout(150);
      }
      const other = who.page.locator("#cm-board-decision [data-action=board-option]").first();
      if (!passed && !(await who.page.locator("[data-action=board-pass]:not([disabled])").count()) && await other.count() && !(await who.page.locator("#cm-board-decision [data-action=board-confirm]").count())) {await other.click(); passed = true;}
      const confirm = who.page.locator("#cm-board-decision [data-action=board-confirm]:not([disabled])");
      if (!passed && await confirm.count()) {await confirm.click(); passed = true;}
    }
    if (!passed) await rob.page.waitForTimeout(250);
  }
  await waitText(rob.page, ".cm-board-turn", /Turn 2/);
  await waitText(maya.page, ".cm-board-turn", /Turn 2/);
  ok(seenSteps.size >= 3, `Pass priority walks the steps (${[...seenSteps].join(", ")}) into turn 2, on both boards`);
  eq(await rob.page.locator(".cm-board-mat .cm-board-ribbon li.is-now").count() + await maya.page.locator(".cm-board-mat .cm-board-ribbon li.is-now").count(), 1, "the step ribbon lights the current step on the active player's own board");

  /* CARD SIZE: the app's slider, in Tools; ⌘/Ctrl − steps it. */
  const handWidth = (page) => page.evaluate(() => document.querySelector(".cm-board-hand .cm-bcard").getBoundingClientRect().width);
  const w100 = await handWidth(rob.page);
  await rob.page.click("[data-action=board-tools]");
  ok(/60% – 160%/.test(await text(rob.page, "#cm-board-tools .cm-board-size")), "Tools carries the card-size slider, 60% to 160%");
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("140");
  const w140 = await handWidth(rob.page);
  ok(Math.abs(w140 / w100 - 1.4) < 0.02, `the slider sizes the hand's cards as it moves (${w100.toFixed(0)}px → ${w140.toFixed(0)}px at 140%)`);
  await rob.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await rob.page.keyboard.press("Control+Minus");
  const w130 = await handWidth(rob.page);
  ok(Math.abs(w130 / w100 - 1.3) < 0.02, `and Ctrl − steps it down by ten (${w130.toFixed(0)}px at 130%)`);
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("100");
  await rob.page.click("[data-action=board-tools]");

  /* CARD ZOOM: held under the pointer, a card shows large; a right click opens it with what it can do. */
  const robCard = rob.page.locator(".cm-board-hand .cm-bcard").first(), robCardName = (await robCard.getAttribute("aria-label")).split(/[,:]/)[0];
  await robCard.hover();
  await rob.page.locator("#cm-board-peek .cm-bcard").waitFor({timeout: 5000});
  const peekWidth = await rob.page.evaluate(() => document.querySelector("#cm-board-peek .cm-bcard").getBoundingClientRect().width);
  ok(Math.round(peekWidth) === 320 && (await text(rob.page, "#cm-board-peek")).includes(robCardName), `a card under the pointer shows large, 320px (${robCardName})`);
  await rob.page.mouse.move(5, 5);
  await rob.page.locator("#cm-board-peek").waitFor({state: "detached", timeout: 5000});
  await robCard.click({button: "right"});
  await rob.page.locator("#cm-dialog[open] .cm-board-zoom").waitFor();
  ok((await text(rob.page, "#cm-dialog[open]")).includes(robCardName), "a right click opens it in Card zoom");
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-dialog[open]").waitFor({state: "detached"}).catch(() => {});
  await rob.page.evaluate(() => {
    const el = document.querySelector(".cm-board-hand .cm-bcard"), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", {pointerType: "touch", bubbles: true, clientX: r.left + 10, clientY: r.top + 10}));
  });
  await rob.page.locator("#cm-dialog[open] .cm-board-zoom").waitFor({timeout: 3000});
  ok(true, "a long press opens Card zoom, on a touch screen");
  await rob.page.keyboard.press("Escape");

  /* SHOW HAND: turn 2's player reaches main 1 and plays a land from the fanned hand, by its number and Enter. */
  const second = other, secondLand = second === rob ? "Forest" : "Island", secondSeat = second === rob ? 0 : 1;
  for (let i = 0; i < 30 && !(await second.page.locator(".cm-board-hand .cm-bcard.is-bright").count()); i += 1) {
    for (const who of [second, active]) {
      const pass = who.page.locator("[data-action=board-pass]:not([disabled])");
      if (await pass.count()) {await pass.click(); await who.page.waitForTimeout(200);}
    }
  }
  await second.page.evaluate(() => document.activeElement && document.activeElement.blur());
  for (let i = 0; i < 3; i += 1) await second.page.keyboard.press("Control+Equal");   /* 130%: a fan that would not fit at 132px apart */
  ok(Math.abs(await second.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--card-scale").trim()) - 1.3) < 0.001, "Ctrl + steps the card size up by ten");
  await second.page.keyboard.press(" ");
  await second.page.locator(".cm-hand-show .cm-hand-fan").waitFor();
  const fanned = await second.page.locator(".cm-hand-slot").count();
  ok(/Your hand · \d+/.test(await text(second.page, ".cm-hand-show h2")) && fanned === await second.page.locator(".cm-board-hand .cm-bcard").count(), `Space fans the hand over the dimmed board (${fanned} cards)`);
  const turns = await second.page.evaluate(() => [...document.querySelectorAll(".cm-hand-slot")].map((el) => {const m = new DOMMatrix(getComputedStyle(el).transform); return Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10;}));
  ok(turns.every((t, k) => Math.abs(t - (k - (turns.length - 1) / 2) * 5) < 0.2), `each card in the fan is turned 5° from the next (${turns.join("°, ")}°)`);
  const inside = await second.page.evaluate(() => [...document.querySelectorAll(".cm-hand-slot .cm-bcard")].every((el) => {const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;}));
  ok(inside, "and the whole fan stays on the screen, at 130% too, the cards drawn closer");
  await shot(second.page, "hand-fan-" + (second === rob ? "1400" : "1280"));
  const labels = await second.page.locator(".cm-hand-slot .cm-bcard").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  const key = String(labels.findIndex((l) => l.startsWith(secondLand)) + 1);
  await second.page.keyboard.press(key);
  await second.page.locator(".cm-hand-show.is-held").waitFor();
  ok(new RegExp(`Play ${secondLand} · Enter`).test(await text(second.page, ".cm-hand-acts")), `its number holds the ${secondLand} up, with what it can do`);
  await shot(second.page, "hand-held-" + (second === rob ? "1400" : "1280"));
  await second.page.keyboard.press("Escape");
  await second.page.locator(".cm-hand-show:not(.is-held) .cm-hand-fan").waitFor();
  ok(true, "Escape puts it back in the fan");
  await second.page.keyboard.press(key);
  await second.page.keyboard.press("Enter");
  await second.page.locator(".cm-hand-show").waitFor({state: "detached"});
  await second.page.click(`.cm-board-tile[data-seat='${secondSeat}'] [data-action=board-focus]`);
  await waitText(second.page, ".cm-board-lands", /Lands · 1/);
  ok((await text(second.page, ".cm-board-lands")).includes(secondLand), "Enter plays it: the hand is put away and the land is down");
  for (let i = 0; i < 3; i += 1) await second.page.keyboard.press("Control+Minus");

  /* SHAPE, at both widths. */
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    const g = await who.page.evaluate(() => {
      const strip = document.querySelector(".cm-board-strip").getBoundingClientRect();
      const ratio = (el) => {const r = el.getBoundingClientRect(); return r.width / r.height;};
      const mat = [...document.querySelectorAll(".cm-board-mat .cm-bcard:not(.is-tapped)")], hand = [...document.querySelectorAll(".cm-board-hand .cm-bcard")];
      return {strip: Math.round(strip.height), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ratios: [...mat, ...hand].map(ratio).map((x) => Math.round(x * 1000) / 1000),
        matWidth: mat.length ? mat[0].getBoundingClientRect().width : 0, handWidth: hand.length ? hand[0].getBoundingClientRect().width : 0};
    });
    ok(g.strip === 48 && g.sideways === 0, `at ${width} the strip is one 48px line (${g.strip}) and nothing scrolls sideways (${g.sideways})`);
    ok(g.ratios.length && g.ratios.every((r) => Math.abs(r - 5 / 7) < 0.01), `at ${width} every card is 5:7 (${[...new Set(g.ratios)].join(", ")})`);
    ok(g.handWidth > g.matWidth || !g.matWidth, `at ${width} the hand's cards are larger than the mat's (${g.handWidth} > ${g.matWidth})`);
  }

  /* THE COACH: a chat panel over the right edge; the shell, with a stub reply that says so. */
  const matWidth = () => rob.page.evaluate(() => Math.round(document.querySelector(".cm-board-mat").getBoundingClientRect().width));
  const matBefore = await matWidth();
  await rob.page.click(".cm-board-coach-open");
  await rob.page.locator("#cm-board-coach:not([hidden]) .cm-coach-input").waitFor();
  const coachBox = await rob.page.evaluate(() => {const r = document.getElementById("cm-board-coach").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.right), innerWidth];});
  ok(coachBox[0] === 400 && coachBox[1] === coachBox[2] && await matWidth() === matBefore, `the Coach slides over the right edge, 400px, and the mat keeps its width (${matBefore}px)`);
  ok(/Sees your board, hand and the table · turn \d+/.test(await text(rob.page, "#cm-coach-context")), "it says what it sees, and the turn");
  await rob.page.click("[data-action=board-coach-ask][data-q=\"What's my best play?\"]");
  ok(await rob.page.locator(".cm-coach-msg.is-typing").count() === 1, "a suggested prompt is asked, and the Coach shows it is typing");
  await rob.page.locator(".cm-coach-msg.is-coach:not(.is-typing)").waitFor({timeout: 5000});
  const thread = await rob.page.locator(".cm-coach-thread li").allInnerTexts();
  ok(/^Turn \d+ · /.test(thread[0].trim()) && thread[1].trim() === "What's my best play?" && /not switched on yet/.test(thread[2]), `the thread: a turn divider, the question, and the stub's honest reply (${thread[0].trim()})`);
  await rob.page.fill(".cm-coach-input", "Who's the threat?");
  await rob.page.press(".cm-coach-input", "Shift+Enter");
  await rob.page.type(".cm-coach-input", "and why");
  ok((await rob.page.inputValue(".cm-coach-input")).includes("\n"), "Shift+Enter is a new line");
  await rob.page.press(".cm-coach-input", "Enter");
  await rob.page.locator(".cm-coach-msg.is-you").nth(1).waitFor();
  eq((await rob.page.locator(".cm-coach-msg.is-you").nth(1).innerText()).trim(), "Who's the threat?\nand why", "Enter sends it");
  await rob.page.fill(".cm-coach-input", "a draft");
  await rob.page.focus(".cm-coach-input");
  const viewsBefore = views(ROB).length;
  await serial(async () => object.broadcast());
  await rob.page.waitForTimeout(500);
  ok(views(ROB).length > viewsBefore && await rob.page.inputValue(".cm-coach-input") === "a draft" && await rob.page.evaluate(() => document.activeElement.matches(".cm-coach-input")), "a view arriving mid-sentence leaves the draft, and the focus, where they were");
  await shot(rob.page, "coach-1400");
  await rob.page.click(".cm-coach-more summary");
  await rob.page.click("[data-action=board-coach-clear]");
  ok(await rob.page.locator(".cm-coach-msg").count() === 0, "⋯ › Clear chat empties the thread");
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-board-coach[hidden]").waitFor({state: "attached"});
  ok(true, "Escape closes the Coach");
  await rob.page.click("[data-action=board-tools]");
  await rob.page.click("#cm-board-tools [data-action=board-coach]");
  await rob.page.locator("#cm-board-coach:not([hidden])").waitFor();
  await rob.page.click("#cm-board-coach [aria-label='Close the Coach']");
  await rob.page.locator("#cm-board-coach[hidden]").waitFor({state: "attached"});
  ok(true, "Tools › Recommended actions opens it too, and ✕ closes it");
  await maya.page.click("[data-action=board-view][data-view=full]");
  await maya.page.click(".cm-full-rail [aria-label='CrankMagic Coach']");
  await maya.page.locator("#cm-board-coach:not([hidden])").waitFor();
  const onTop = await maya.page.evaluate(() => {const r = document.getElementById("cm-board-coach").getBoundingClientRect(); const el = document.elementFromPoint(r.left + 20, r.top + 60); return !!el && !!el.closest("#cm-board-coach");});
  ok(onTop, "in Full screen, ✦ in the rail opens it, above the game");
  await maya.page.keyboard.press("Escape");
  await maya.page.click("[data-action=board-view][data-view=focus][aria-label='Leave full screen']");

  /* DROPPED: the room ends Rob's socket; his board reconnects; Maya is told, then the table says he is back. */
  const socketsBefore = routes[ROB].length;
  let release; held[MAYA] = {promise: new Promise((r) => {release = r;})};
  await dropSocket(ROB);
  await waitText(maya.page, ".cm-board-tile[data-seat='0'] .cm-board-tile-flag", /Dropped · back by/, 10000);
  ok(true, "Maya is told at once that Rob dropped, and until when, by the room over her socket (her table reads held)");
  delete held[MAYA]; release();
  await rob.page.waitForFunction(() => document.querySelector(".cm-board-strip") && !document.querySelector(".cm-board-conn"), null, {timeout: 20000});
  ok(routes[ROB].length === socketsBefore + 1, "Rob's board opens a new socket by itself, and the room sends his view again");
  await maya.page.waitForFunction(() => !/Dropped/.test(document.querySelector(".cm-board-tile[data-seat='0'] .cm-board-tile-flag")?.innerText || ""), null, {timeout: 20000});
  ok(true, "and once he is back, Maya's board stops saying so");

  /* PHONES: Maya's screen becomes a phone held sideways. Focus only: the rail, her board, the seat strip, the pill. */
  await maya.page.click("[data-action=board-view][data-view=table]");   /* her desk's view, which the phone must leave be */
  await maya.page.setViewportSize({width: 844, height: 390});
  await maya.page.locator("#cm-board[data-phone=landscape] .cm-phone-rail").waitFor({timeout: 10000});
  const phoneGeo = await maya.page.evaluate(() => {
    const w = (q) => Math.round(document.querySelector(q).getBoundingClientRect().width), board = document.getElementById("cm-board").getBoundingClientRect();
    return {rail: w(".cm-phone-rail"), seats: w(".cm-phone-seats"), board: [Math.round(board.width), Math.round(board.height)], views: document.querySelectorAll("#cm-board [data-action=board-view]").length,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, seatCount: document.querySelectorAll(".cm-phone-seat").length};
  });
  ok(phoneGeo.rail === 52 && phoneGeo.seats === 112 && phoneGeo.board[0] === 844 && phoneGeo.board[1] === 390 && phoneGeo.sideways === 0, `on a phone held sideways: the 52px rail, the 112px seat strip, the board the whole screen (${phoneGeo.board.join("×")})`);
  ok(phoneGeo.views === 0 && phoneGeo.seatCount === 2, "Focus is the only view, and the strip holds every seat");
  const badge = Number(await text(maya.page, ".cm-phone-badge"));
  const mayaHand = views(MAYA).at(-1).state.players[1].zones.Hand.count;
  eq(badge, mayaHand, `✋ carries the hand's count (${badge})`);
  await maya.page.click(".cm-phone-seat[data-seat='0']");
  await waitText(maya.page, ".cm-phone-pill", /Viewing Rob/);
  ok(await maya.page.locator(".cm-phone-center .cm-seatboard[data-seat='0']").count() === 1, "a seat tapped puts that board on the screen, and the pill says whose");
  await maya.page.click(".cm-phone-pill [data-action=board-focus]");
  await maya.page.locator(".cm-phone-center .cm-seatboard.is-you").waitFor();
  await maya.page.click("[data-action=board-rotate][data-by='1']");
  await maya.page.locator(".cm-phone-center .cm-seatboard[data-seat='0']").waitFor();
  ok(true, "My board goes back to hers, and › goes round to the next seat");
  await maya.page.click("[data-action=board-rotate][data-by='-1']");
  const askShare = await maya.page.evaluate(() => {const a = document.querySelector(".cm-phone-ask"); return a && a.children.length ? a.getBoundingClientRect().height / innerHeight : 0;});
  ok(askShare < 0.35, `what she is asked sits over the board's foot without covering most of it (${Math.round(askShare * 100)}% of the height)`);
  await shot(maya.page, "phone-landscape");
  /* When the room asks her something, the board snaps back to hers, wherever she was looking. */
  let snapped = false;
  for (let i = 0; i < 30 && !snapped; i += 1) {
    const mayaAsked = await maya.page.locator(".cm-phone-pill [data-action=board-pass]:not([disabled])").count();
    if (mayaAsked) {await maya.page.click(".cm-phone-pill [data-action=board-pass]"); await maya.page.waitForTimeout(250); continue;}
    if (!(await maya.page.locator(".cm-phone-center .cm-seatboard[data-seat='0']").count())) await maya.page.click(".cm-phone-seat[data-seat='0']");
    const robPass = rob.page.locator("[data-action=board-pass]:not([disabled])");
    if (!(await robPass.count())) {await rob.page.waitForTimeout(250); continue;}
    await robPass.click();
    await maya.page.waitForTimeout(500);
    if (await maya.page.locator(".cm-phone-pill [data-action=board-pass]:not([disabled])").count()) snapped = await maya.page.locator(".cm-phone-center .cm-seatboard.is-you").count() === 1;
  }
  ok(snapped, "looking at Rob's board when the room asks her, the board snaps back to hers");
  /* ✋: the hand at a readable size; a card tapped is held up with what it can do; Back to hand. */
  await maya.page.click(".cm-phone-icon[aria-label='Your hand']");
  await maya.page.locator("#cm-board .cm-hand-show .cm-hand-fan").waitFor();
  const phoneCard = await maya.page.evaluate(() => Math.round(document.querySelector(".cm-hand-slot .cm-bcard").getBoundingClientRect().width));
  ok(phoneCard === 110, `✋ opens the hand over the board, its cards 110px (${phoneCard})`);
  await maya.page.locator(".cm-hand-slot .cm-bcard").first().click();
  await maya.page.locator(".cm-hand-show.is-held").waitFor();
  await shot(maya.page, "phone-hand");
  await maya.page.click(".cm-hand-acts [data-action=board-hand-back]");
  await maya.page.click("[data-action=board-hand-close]");
  /* Held upright, the game surface is turned a quarter: landscape still, no screen asking to turn the phone. */
  await maya.page.setViewportSize({width: 390, height: 844});
  await maya.page.locator("#cm-board[data-phone=portrait]").waitFor({timeout: 10000});
  const upright = await maya.page.evaluate(() => {
    const r = document.getElementById("cm-board").getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(document.getElementById("cm-board")).transform);
    return {box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], turn: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth};
  });
  ok(upright.turn === 90 && upright.box.join() === "0,0,390,844" && upright.sideways === 0, `held upright, the surface is turned 90° and still fills the screen (${upright.box.join(",")})`);
  await shot(maya.page, "phone-upright");
  await maya.page.setViewportSize({width: 1280, height: 800});
  await maya.page.locator("#cm-board:not([data-phone]) .cm-board-strip").waitFor({timeout: 10000});
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "table", "back at a desk, the desk board again, in the view she left it in: seats tapped on the phone changed nothing there");
  await maya.page.click("[data-action=board-view][data-view=focus]");

  /* END: Tools › End game, two taps; both boards say so; back to the table. */
  await maya.page.click("[data-action=board-tools]");
  await maya.page.click("#cm-board-tools [data-action=board-end]");
  eq((await text(maya.page, "#cm-board-tools [data-action=board-end][data-confirm='1']")).trim(), "End for everyone · keep the record", "End game in Tools asks a second tap first, naming what it does");
  await shot(maya.page, "board-end-1280");
  await maya.page.click("#cm-board-tools [data-action=board-end][data-confirm='1']");
  await waitText(rob.page, ".cm-board-over", /ended early/);
  await waitText(maya.page, ".cm-board-over", /ended early/);
  ok(/record is kept/.test(await text(rob.page, ".cm-board-over")), "both boards say it was ended early, nobody lost, and the record is kept");
  await shot(rob.page, "board-over-1400");
  await rob.page.click("[data-action=board-leave]");
  await waitText(rob.page, "#cm-table-game", /The game is over/);
  ok(!(await rob.page.locator("#cm-board").count()), "Back to the table puts the board away, and the lobby says the game is over");

  eq([leaks(MAYA, "Rob"), leaks(ROB, "Maya")], [0, 0], `across the whole game, no frame to either named a card of the other's hand or library, history included (${frames[MAYA].length + frames[ROB].length} frames)`);
  eq(writes.filter((w) => w.header !== "play" || !/^application\/json/.test(w.type || "")), [], `every one of the board's ${writes.length} writes carried Play's header and JSON`);
  await rob.context.close(); await maya.context.close();
} finally {
  await close();
}
console.log(`table-board: ${checks} checks passed — a real game between two browsers over the table's socket: hidden hands, Keep, a land tapped from the hand, Pass priority into turn 2, a refusal in words, a dropped socket reopened, End game's second tap.`);
