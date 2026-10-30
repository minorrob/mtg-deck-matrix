/* THE CLOUD BOARD (M5; crankmagic-board.js), a real game between two browsers.
 *
 * Rob at 1400 and Maya at 1280 sit at one table. Behind their pages, /api/tables is answered by the real table
 * (the GameTable object over game/room/table.mjs) as each of them, and each page's own WebSocket to
 * /api/tables/<id>/connect is carried to that same object: the frames each page receives are exactly what the
 * room sends that seat, and are kept here to be read.
 *
 *   Open      the lobby hands the page to the board once the game is on; both boards open over the socket.
 *   Hidden    Maya's frames never carry a card of Rob's hand or library, only its count; nor his hers.
 *   Decide    the opening hand's Keep; turn 1's empty upkeep and draw passing by themselves, and saying so; a land
 *             played from the hand by tapping it (bright = you can use it); Next step landing on the next step with
 *             something to do; the draw by itself, no click; a cast's bounded Undo window, then an explicit pass and the other board's
 *             Resolve naming the spell on the stack, its strip saying they may respond; Hold priority after I cast, the
 *             caster asked again first; Pass on another's turn; whose turn it is marked in the side pane; both boards
 *             following, the step ribbon with them; the card shown large put away by a press, Escape or a redraw.
 *   Views     the game fills the window. Table (identical 16:9 boards sized to the window, you at the foot, the
 *             Library pile drawn, the logo between them opening Table vitals), Focus (the mat the largest 16:9
 *             beside the pane, the hand docked over its foot), Full screen (the whole window; the other seat across
 *             the top; a card inspected through its Read menu; ⟳ walks the big board round the table); ⎋ leaves; the view
 *             is remembered on the device. Skip to end passes the rest of a turn by itself.
 *   Hand      the card-size slider and Ctrl −; a card shown large under the pointer, and in Card zoom on a right
 *             click; Show hand: Space fans it, a number holds a card up, Escape puts it back, Enter plays it.
 *   Coach     the chat panel over the right edge (the shell): prompts, a stub reply that says so, Shift+Enter,
 *             a draft kept through a view, Clear chat, ⋯ kept open and focused through the reply, Escape; from the
 *             pane, Tools and Full screen's rail.
 *   Phones    Focus only, native either way up (ROB-18): the 52px rail, the seats (a 110px column sideways), the pill;
 *             a seat tapped and Camera's ◀ ▶; snapping back when asked; ✋ a drawer from the bottom, at a readable size;
 *             held upright, never turned; back at a desk, the desk board.
 *   Refused   an answer the room refuses is said in words, and the board takes the room's view.
 *   Dropped   a socket that closes is reopened; the other player is told who dropped, and it clears when
 *             they are back.
 *   End       Tools › End game asks a second tap, then both boards say it was ended early; back to the table.
 *   Record    once it is over, Download your record (M8b): this is not a playtest table, so it is Rob's own seat's
 *             view and the history, with no seed and nothing of Maya's hand.
 *   Shape     one 58px shared header; 5:7 cards sized by width, hand larger than the mat's; no sideways scroll.
 *   B1        Rob's board walk of 2026-09-30 (docs/plan-to-done-2026-09-30.md, PR B1): Full screen asks for the whole
 *             document, so Table vitals and the Coach are seen in it, with space reserved for Coach beside the board; the Tools menu's
 *             buttons whole in Full screen; the clock opens the history everywhere and the Coach is its own glyph;
 *             History closes on a press outside it; the Panel reads a tapped card upright; the hand's cards whole in
 *             Table, Focus, Full screen and Full screen after the browser's is left, at 1400 and at 1280; a card no
 *             library holds is drawn from the shipped card records.
 *   B2        leaving the board does not lose the game: Decks and back by the rail's Game on, and again by Play, on one
 *             socket, the seat never marked away.
 *   B5        the turn's words and beats (docs/plan-to-done-2026-09-30.md, items 10-13), in the Decide lines above.
 *   B8        the sound (Rob's pack, crankmagic-audio.js): nothing fetched before the first press on the board; then the
 *             game's bed, a land played, a draw, a creature cast (on both boards), your turn; Tools › Sound's sliders
 *             and mute, remembered.
 *   B7        Focus and Full screen (items 15, 18, 20): the seat pane's divider dragged, by the arrow keys too,
 *             remembered, and the tiles miniatures of their boards past the width; the Panel's divider and Full
 *             screen's side column's, the card to read growing with its share; Rob's card backs, the library's and,
 *             rotated to another seat in Full screen, that seat's hand as backs in its color, never a face.
 *   B6        the hand tray (item 14): the count beside the ✋; the hand by type -- Land, Creature, Instant, Other -- as
 *             castable now over in hand, agreeing with the cards lit; castable again once the mana is there.
 *   B4        the Table view's shape: the tabletop still; the bar between the rows dragged (and by the arrow keys), the
 *             rows' share remembered; the bar atop the hand tray growing the hand and shrinking every board alike; the
 *             pile cards on top of their frames; the mana reminder below the Lands; the life counter's slices and
 *             totals at the true center; a heart and a skull in Table vitals; the board's and the hand's own card
 *             sizes, and Tools setting both.
 *   A11y      the accessibility pass (Part 6): every word on a mat at 4.5:1 over a white mat, in Focus and Table; every
 *             card's label saying its state; Tab walking the strip, the boards, the hand; the pop-up announced; Keys
 *             and help from ☰; Escape closing Tools and the menu.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState, legendaryNames} from "./uat/browser-runner.mjs";
import {basicCards, RoomError} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proofPages=[], tableGeometryProof=[];
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

/* THE SERVER, HERE. Each player's deck has cards only they own by name, so a leak can be looked for. Its creatures cost
   one mana, so a land played leaves something to do (B5: a step with nothing to do passes by itself). */
const ROB_INSTANT = (name) => {const m = /^Rob Secret (\d+)$/.exec(name); return !!m && Number(m[1]) % 4 === 2;};
/* Every other one of Rob's spells is an instant at two mana: once he has two lands, he may respond on another player's
   turn, and his button then reads Pass (B5, item 10). */
/* A commander is a legendary creature (CR 903.3): the library's own commanders, and each seat's General here. */
const legendary = (name) => (legendaryNames().has(name) || / General$/.test(name) ? {supertypes: ["Legendary"]} : {});
const cards = (name) => basicCards(name) ?? (ROB_INSTANT(name) ? {types: ["Instant"], manaCost: "{2}"} : {types: ["Creature"], ...legendary(name), power: 2, toughness: 2, manaCost: "{1}"});
const ROB = "rob@example.com", MAYA = "maya@example.com";
let clock = Date.parse("2026-09-26T22:00:00Z");
const map = new Map(), live = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; live.push(s);}, getWebSockets: () => live.filter((s) => !s.closed), getTags: (s) => s.tags};
const object = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "tableboard01";
const call = async (p, email, body) => (await object.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json();
const deck = (who, land, source) => ({name: `${who}'s deck`, commander: [`${who} General`], cards: [...Array(40)].map((_, i) => i % 2 ? land : `${who} Secret ${i}`), source});
/* Each brings a deck of the library both pages restore (data/live-state.json): Rob his D1, Maya her D2. */
const ROB_DECK = {deckId: "deck:live:D1", deckVersion: 2}, MAYA_DECK = {deckId: "deck:live:D2", deckVersion: 2};

/* One queue for everything the object is asked, as a Durable Object runs one request at a time. */
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const writes = [];
/* A person's table reads can be held, so the room's socket is the only way news can reach them. */
const held = {};
/* ...and one read, once answered, can be kept on the way back, as a slow network keeps it: it lands after newer news. */
const late = {};
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  if (method === "GET" && held[email]) await held[email].promise;
  if (method !== "GET") writes.push({path: url.pathname, header: req.headers()["x-crankmagic"], type: req.headers()["content-type"]});
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => object.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  const body = await r.text();
  if (method === "GET" && !m[2] && late[email]) {const kept = late[email]; delete late[email]; kept.answered(); await kept.promise;}
  return route.fulfill({status: r.status, contentType: "application/json", body});
}

/* THE SOCKET, CARRIED. The page's WebSocket is answered here: its server end is a socket the object accepts
   through its real /connect route (the platform's two pieces stood in for), and every frame either way is kept. */
const frames = {[ROB]: [], [MAYA]: []}, routes = {[ROB]: [], [MAYA]: []}, sent = {[ROB]: [], [MAYA]: []};
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
    ws.onMessage((message) => {sent[email].push(message); return serial(() => object.webSocketMessage(server, message));});
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
/* What the board sends the Coach, as each person asked (AI-6: their AI Coach settings may withhold the hand). */
const coachAsked = [];
async function person(email, viewport, {fullscreen = true} = {}) {
  const context = await browser.newContext({viewport, serviceWorkers: "block"});
  const page = await context.newPage();
  let coachReplyGate = null;
  // This suite exercises a returning Focus player; R2 separately verifies new-device 3D.
  await page.addInitScript(() => {if (!localStorage.getItem("cm-board-view")) localStorage.setItem("cm-board-view", "focus");});proofPages.push(page);
  await page.addInitScript(() => {
    globalThis.__uatBoardGestures = [];
    for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
      const el = event.target.closest?.('#cm-board [data-action]');
      if (!event.isTrusted || !el) return;
      globalThis.__uatBoardGestures.push({type, action: el.dataset.action, tag: event.target.tagName});
      globalThis.__uatBoardGestures = globalThis.__uatBoardGestures.slice(-8);
    }, true);
  });
  /* A browser that will not give a page the whole screen (a phone's, or one set so): the view must fill the window by itself. */
  if (!fullscreen) await page.addInitScript(() => Object.defineProperty(Document.prototype, "fullscreenEnabled", {get: () => false}));
  if (stub) await stub(page);
  /* The app's own handle, for reading what the library holds once a game is filed. */
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  /* Explicitly enable the Coach shell. Its question transport then refuses without calling a provider;
     a small delay exposes typing and preserves the existing refusal/payload checks. */
  await page.route(`${base}/api/ai-coach`, (r) => r.fulfill({json: {open: true}}));
  await page.route(`${base}/api/ai/coach`, async (r) => {coachAsked.push(JSON.parse(r.request().postData() || "{}")); if (coachReplyGate) await coachReplyGate; await new Promise((go) => setTimeout(go, 300)); r.fulfill({status: 503, json: {error: "The Coach is not switched on here yet."}});});
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/tables**`, (r) => answer(r, email));
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry(email));
  await page.goto("about:blank");
  return {context, page, holdCoachReply() {let release; coachReplyGate = new Promise(go => {release = go;}); return () => {coachReplyGate = null; release();};}};
}
/* The words as written (A1): Moss & Iron sets headings in capitals, so a read turns text-transform off for its own
   instant and reads innerText, line breaks and all. */
const text = (page, sel) => page.locator(sel).first().evaluate((el) => { const s = document.createElement("style"); s.textContent = "*{text-transform:none!important}"; document.head.append(s); const t = el.innerText; s.remove(); return t; });
const waitText = (page, sel, re, timeout = 20000) => page.waitForFunction(([s, src, flags]) => { const el = document.querySelector(s); if (!el) return false; const st = document.createElement("style"); st.textContent = "*{text-transform:none!important}"; document.head.append(st); const t = el.innerText; st.remove(); return new RegExp(src, flags).test(t); }, [sel, re.source, re.flags], {timeout});
/* The hand is the stage's fan in every view (the legacy .cm-board-hand row is gone from Table and Focus). */
const HAND = ".cm-stage-fan .cm-bcard";
/* The lands zone is drawn without its "Lands · n" caption (a stack says ×n instead): n is read from the lands themselves. */
const waitLands = (page, n, timeout = 20000) => page.waitForFunction((want) => [...document.querySelectorAll(".cm-board-lands")].some((z) => [...z.querySelectorAll(":scope > .cm-board-cards > *, :scope > .cm-board-cards > .cm-land-stack")].reduce((k, el) => k + (Number(/×(\d+)/.exec(el.querySelector?.(".cm-land-count")?.textContent || "")?.[1]) || 1), 0) === want), n, {timeout});
/* The flat stage lays itself out a moment after a view is chosen (fonts, the hand's fan, a transition): measure it once it has held still two frames running. */
const stageSettled = (page) => page.waitForFunction(() => {
  const k = [...document.querySelectorAll(".cm-stage-slot,.cm-stage-rear,.cm-stage-hand,.cm-stage-fan-slot")].map((e) => {const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 10)).join();}).join("|") + getComputedStyle(document.querySelector(".cm-seatboard.is-you, .cm-board-mat") || document.body).boxShadow, same = k === globalThis.__stageKey;
  globalThis.__stageKey = k; return same;
}, null, {polling: "raf", timeout: 8000});
/* What the strip says (the element is not drawn while it has nothing to say). */
const stripSays = async (page) => (await page.locator(".cm-board-waiting").count()) ? (await text(page, ".cm-board-waiting")).trim() : "";
const views = (email) => frames[email].map((f) => JSON.parse(f)).filter((f) => f.view).map((f) => f.view);

try {
  /* THE TABLE, set up through the server as the lobby would: Rob hosts, Maya joins, both ready, it starts. */
  await call("/table/create", ROB, {tableId: TABLE, hostName: "Rob", seats: [{kind: "human", name: "Maya"}]});
  /* Every spell asked about, as before ROB-102: this suite plays the respond-to-a-spell board (Resolve <spell>, the stack
     box), which the stack passed for a player with no answer would skip. The rule's own proof is tests/game-table.mjs. */
  await call("/table/rules", ROB, {passStack: false});
  await call("/table/join", MAYA, {code: (await call("/table/invite", ROB, {seatId: 1})).invite.code});
  await call("/table/deck", ROB, {seatId: 0, deck: deck("Rob", "Forest", ROB_DECK)});
  await call("/table/deck", MAYA, {seatId: 1, deck: deck("Maya", "Island", MAYA_DECK)});
  await call("/table/ready", ROB, {ready: true}); await call("/table/ready", MAYA, {ready: true});
  await call("/table/mat", ROB, {mat: "forge"});
  await call("/table/start", ROB, {});
  clock += 10000; await object.alarm();

  const rob = await person(ROB, {width: 1400, height: 900});
  const maya = await person(MAYA, {width: 1280, height: 800}, {fullscreen: false});
  /* B8: every clip each page asks for, by its path under assets/audio/. */
  const heardBy = {[ROB]: [], [MAYA]: []};
  for (const [email, who] of [[ROB, rob], [MAYA, maya]]) who.page.on("request", (r) => {const u = r.url(); if (u.includes("/assets/audio/")) heardBy[email].push(u.split("/assets/audio/")[1].split("?")[0]);});
  const heard = async (email, name, ms = 10000) => {for (let t = 0; t < ms; t += 100) {if (heardBy[email].some((u) => u.endsWith(name))) return true; await new Promise((r) => setTimeout(r, 100));} return false;};

  /* OPEN */
  await rob.page.goto(`${base}/index.html#table?id=${TABLE}`);
  await maya.page.goto(`${base}/index.html#table?id=${TABLE}`);
  await rob.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  await maya.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  ok(routes[ROB].length === 1 && routes[MAYA].length === 1, "the lobby hands each page to the board, and each opens one socket to the table");
  eq([heardBy[ROB].length, heardBy[MAYA].length], [0, 0], "and nothing of the sound is fetched before the first press on the board (a browser would refuse to play it)");
  eq([...await rob.page.locator(".cm-stage-top .cm-seat-header .cm-mat-name").allInnerTexts(), ...await rob.page.locator(".cm-stage-rear .cm-stage-boardname").allInnerTexts()], ["You · Rob", "Maya"], "the page holds every seat, yours first here: yours in the header over the board looked at, the other seat's board (its name above it) behind it");
  /* Found rendering B1's fixture: the library holds only your own cards, so everyone else's were fetched from Scryfall one
     request each, and a full board is refused faster than it is answered. The shipped card records draw them. */
  const pic = await rob.page.evaluate(() => {const C = globalThis.__cm, mine = new Set(C.cards().map((c) => c.name)), other = C.catalog.all().map((c) => C.catalog.exact(c.name)).find((c) => c && c.image && c.image.startsWith("https://cards.scryfall.io/") && !mine.has(c.name)); return other ? {name: other.name, image: other.image, drawn: C.board.pictureOf(other.name)} : null;});
  ok(pic && pic.drawn === pic.image && !/api.scryfall.com/.test(pic.drawn), `a card no library holds (${pic && pic.name}) is drawn from the shipped card records, not a request to Scryfall per card`);

  /* DECIDE: the opening hands. Whoever is asked keeps, until nobody is. */
  await waitText(rob.page, "#cm-board-decision", /Your opening hand/);
  const robHand = await rob.page.locator(HAND).count();
  eq(robHand, 7, "Rob's hand is seven cards, drawn face up for him");
  ok(/Maya.*waiting|Waiting on Rob/i.test(await text(maya.page, ".cm-board-waiting")), `Maya is told who the table waits on: "${await text(maya.page, ".cm-board-waiting")}"`);
  for (let round = 0; round < 6; round += 1) {
    let kept = false;
    for (const who of [rob, maya]) {
      const keep = who.page.locator("#cm-board-decision [data-action=board-opening-hand]", {hasText: "Keep"});
      if (await keep.count()) {await keep.click(); kept = true; await who.page.waitForTimeout(300);}
    }
    if (!kept && !(await rob.page.locator("#cm-board-decision", {hasText: "Your opening hand"}).count()) && !(await maya.page.locator("#cm-board-decision", {hasText: "Your opening hand"}).count())) break;
  }
  await waitText(rob.page, ".cm-board-turn", /turn 1/i);
  ok(true, "both keep, and turn 1 begins on both boards");
  /* B8: the first press (Keep) armed the sound: the pack's index, and the game's bed. */
  ok(await heard(ROB, "sound-index.json") && await heard(ROB, "bgm/bgm_game_aether_voyage.mp3"), `the first press on the board starts the sound: the pack's index and the game's bed (${heardBy[ROB].join(", ")})`);

  /* HIDDEN: nothing of the other seat's hand or library, in anything the room sent. */
  /* A frame leaks when it names one of the owner's cards that was never made public (`open`: the ones cast in the open). */
  const leaks = (email, owner, open = []) => frames[email].filter((f) => (f.match(new RegExp(`${owner} Secret [0-9]+`, "g")) || []).some((n) => !open.includes(n))).length;
  eq([leaks(MAYA, "Rob"), leaks(ROB, "Maya")], [0, 0], `no frame to either player named a card of the other's hand or library (${frames[MAYA].length + frames[ROB].length} frames read)`);
  await lookAt(maya.page, 0);
  /* (The board looked at is the big one, its name plain text above it; another seat's hand, a count, is read from its Boards module tile.) */
  ok((await text(maya.page, ".cm-stage-big .cm-stage-boardname")).trim() === "Rob" && (await text(maya.page, ".cm-board-tile:not(.is-you) .cm-seat-hand")).trim() === "7 in hand", "Maya can look at Rob's board, and sees his hand as a count");
  const mats = await maya.page.evaluate(() => {const m = document.querySelector(".cm-stage-big .cm-mat"); return [m.dataset.mat, getComputedStyle(m).backgroundImage.includes("radial-gradient")];});
  ok(mats[0] === "forge" && mats[1], "and it is drawn on Rob's mat, the forge");
  await lookAt(maya.page, 1);
  const own = await maya.page.evaluate(() => {const m = document.querySelector(".cm-stage-big .cm-mat"); return [m.dataset.mat, getComputedStyle(m).backgroundImage];});
  await lookAt(maya.page, 0);
  const robs = await maya.page.evaluate(() => getComputedStyle(document.querySelector(".cm-stage-big .cm-mat")).backgroundImage);
  ok(own[0] === "felt" && own[1] !== robs, "her own board is on felt, and looks it");
  await serial(() => call("/table/mat", MAYA, {mat: "night"}));
  await lookAt(rob.page, 1);
  await rob.page.waitForFunction(() => document.querySelector(".cm-stage-big .cm-mat")?.dataset.mat === "night", null, {timeout: 10000});
  ok(true, "a mat changed mid-game reaches the other board");
  await lookAt(rob.page, 0);
  ok(!(await maya.page.content()).includes("Rob Secret"), "and her page holds none of his cards by name");
  await lookAt(maya.page, 1);

  /* DECIDE: the active player plays a land by tapping it in the hand. */
  const active = /; your \d/.test(await rob.page.locator(".cm-board-turn").getAttribute("title")) ? rob : maya, other = active === rob ? maya : rob;
  const activeSeat = active === rob ? 0 : 1, land = active === rob ? "Forest" : "Island";
  /* B5, item 11: turn 1's upkeep has nothing to do in it, so it passes by itself; the first player of a two-player game
     has no draw step on turn 1 (CR 103.8a); and the table opens in main 1. */
  await active.page.locator(HAND + ".is-bright").first().waitFor({timeout: 20000});
  ok(/Main 1/.test(await phaseText(active.page)), `the empty upkeep passes by itself, and there is no draw step: turn 1 opens in main 1, where there is something to do (${(await phaseText(active.page)).trim()})`);
  await waitText(active.page, ".cm-board-band", /Upkeep: nothing to do/);
  ok((await active.page.locator(".cm-board-band li.is-quiet").first().innerText()).includes("Upkeep: nothing to do"), "and the history says so, in one quieter line: Upkeep: nothing to do");
  /* B5, item 10: on your own turn with the stack empty, the button says what passing will do. */
  eq((await text(active.page, ".cm-stage-actions [data-action=board-pass]")).trim(), "Next step", "on your own turn, with the stack empty, the button reads Next step");
  eq((await stripSays(active.page)), "", "and the strip does not say Your priority beside it: the button carries it");
  /* Rob, 2026-10-11 ("It says we are on turn 3, but I only played one land"): the game's turn counts every player's, and
     on your own the strip says which of yours it is. */
  /* The turn box (the HUD's caption) reads TURN n; whose turn it is is the ringed life row beside it ("You · Rob"), and on your own the title says which of yours. */
  const turnWho = (page) => page.evaluate(() => document.querySelector(".cm-stage-caption .cm-stage-life.is-turn")?.textContent || "");
  ok(/^turn 1$/i.test((await text(active.page, ".cm-board-turn")).trim()) && /; your 1st turn$/.test(await active.page.locator(".cm-board-turn").getAttribute("title")) && /^You/.test(await turnWho(active.page)) && !/your/.test(await text(other.page, ".cm-board-turn")) && !/; your/.test(await other.page.locator(".cm-board-turn").getAttribute("title")) && !/^You/.test(await turnWho(other.page)),
    `on your own turn the box says which of yours it is: "${(await text(active.page, ".cm-board-turn")).trim()}", ringed "${await turnWho(active.page)}"; on another's, only whose (${(await text(other.page, ".cm-board-turn")).trim()}, ringed "${await turnWho(other.page)}")`);
  /* B6, item 14: THE HAND. The count beside the hand's label, and the hand by type, castable now over in hand -- the same fact that lights a card.
     The legacy tray's by-type strip (Land / Creature / Instant / Other, each castable over in hand) is gone with the row (the hand is the stage's fan,
     whose label reads "Your hand · n"): the by-type reading is taken from the lit cards themselves, which are what that strip counted. */
  const trayOf = (page, seat, email) => page.evaluate(([seat, state]) => {
    const kind = (c) => !c ? "Other" : c.types.includes("Land") ? "Land" : c.types.includes("Instant") || (c.keywords || []).some((k) => /^flash$/i.test(k)) ? "Instant" : c.types.includes("Creature") ? "Creature" : "Other";
    const byId = new Map(state.players[seat].zones.Hand.cards.map((c) => [String(c.cardId), c])), want = {Land: [0, 0], Creature: [0, 0], Instant: [0, 0], Other: [0, 0]};
    for (const el of document.querySelectorAll(".cm-stage-fan .cm-bcard")) {const k = kind(byId.get(el.dataset.card)); want[k][1] += 1; if (el.classList.contains("is-bright")) want[k][0] += 1;}
    return {count: (/·\s*(\d+)/.exec(document.querySelector(".cm-stage-hand-label")?.textContent || "") || [])[1], cards: document.querySelectorAll(".cm-stage-fan .cm-bcard").length,
      want: Object.fromEntries(Object.entries(want).map(([k, [x, y]]) => [k, `${x}/${y}`])), words: document.querySelector(".cm-stage-hand").innerText};
  }, [seat, views(email).at(-1).state]);
  const tray1 = await trayOf(active.page, activeSeat, active === rob ? ROB : MAYA);
  ok(tray1.count === String(tray1.cards) && !/Bright = /.test(tray1.words), `the hand's label gives its count (${tray1.count}) and no "Bright = you can use it now" legend`);
  eq(Object.keys(tray1.want), ["Land", "Creature", "Instant", "Other"], "and the hand reads by type: Land, Creature, Instant, Other");
  ok(/^([1-9])\/\1$/.test(tray1.want.Land) && /^0\//.test(tray1.want.Creature) && /^0\//.test(tray1.want.Instant), `in main 1 with the land drop unused every land can be played now (lit), and nothing can be cast until there is mana (${Object.entries(tray1.want).map(([k, v]) => `${k} ${v}`).join(" · ")})`);
  const brightLand = active.page.locator(HAND + ".is-bright", {hasText: land}).first();
  ok(await brightLand.count() === 1, `with priority in main 1, a ${land} in the hand is bright: it can be played now`);
  ok(await active.page.locator(HAND + ".is-dim").count() > 0, "and the cards that cannot be used now are dimmed");
  ok(await active.page.locator(".cm-board-ask #cm-board-decision").count() === 0, "priority floats nothing over the board: its cards are bright");
  await rail(active.page, true);
  const also = await text(active.page, "#cm-board-decision");
  ok(new RegExp(`Play ${land}`).test(also) && !/Pass priority/.test(also) && (also.match(new RegExp(`Play ${land}`, "g")) || []).length === 1, `Actions says what else can be done, each kind once, Pass left to the strip: "${also.replace(/\s+/g, " ").trim()}"`);
  await rail(active.page, false);
  const ink = await active.page.evaluate(() => {const el = document.querySelector(".cm-stage-fan .cm-bcard .cm-bcard-name"); return getComputedStyle(el).color;});
  eq(ink, "rgb(31, 28, 24)", "a card's name is printed in the card's own dark ink, not the mat's light one");
  await shot(active.page, "board-priority-" + (active === rob ? "1400" : "1280"));
  await useCardOffer(active.page, brightLand, "play-land");
  await waitLands(active.page, 1);
  /* The board says what mana is open and whether the land drop is used: the chip at the foot of your own mat in Table (the Focus mat is drawn without its header's resources now,
     so the view is Table's for this reading and Focus again after). */
  await chooseView(active.page, "table"); await active.page.locator(".cm-mat.is-you .cm-board-chip").waitFor({timeout: 10000});
  const dropSaid = await text(active.page, ".cm-mat.is-you .cm-board-chip");
  await chooseView(active.page, "focus"); await active.page.locator(".cm-stage-big").waitFor({timeout: 10000});
  ok(/land drop used/i.test(dropSaid), "tapping it plays it: one land on the board, the land drop used (the board says so)");
  ok(await heard(active === rob ? ROB : MAYA, "sfx/sfx_play_land.mp3"), "and it sounds as a land played (the pack's land voice)");
  await lookAt(other.page, activeSeat);
  await waitLands(other.page, 1);
  ok(await other.page.locator('.cm-board-lands').getByRole('button',{name:new RegExp(`^${land}(?:,|:|$)`)}).count()>0, "the other board shows the same land, now public");
  /* With the land down there is its mana, and a creature it could pay for: Next step passes, and taps nothing. */
  await rail(active.page, true);
  ok(/Tap for mana/.test(await text(active.page, "#cm-board-decision")), "the land played, Actions offers its mana");
  await rail(active.page, false);
  /* UNTAP, ITS MANA UNSPENT (Rob, 2026-10-11: "I clicked it to see what happens. It tapped it ... I should also be able to
     click the card to untap it again"): a click on the land taps it; the room offers it back (game/room/room.mjs,
     `untapMana`), so it stays lit, says Untap, and a second click puts it upright, its mana gone from the pool. */
  const matLand = active.page.locator(".cm-board-lands .cm-bcard", {hasText: land}).first();
  await useCardOffer(active.page, matLand, "activate-mana");
  await active.page.locator(".cm-board-lands .cm-bcard.is-tapped.is-bright").first().waitFor({timeout: 10000});
  const tappedView = views(active === rob ? ROB : MAYA).at(-1), untap = tappedView.decision.options.find((o) => o.act === "undo-mana");
  ok(untap && untap.label === `Untap ${land}` && (tappedView.state.players[activeSeat].mana || []).length === 1 && /Untap/.test(await matLand.getAttribute("aria-label")),
    `a click on the land taps it for mana, and it stays lit, offered back: "${untap?.label}", its mana in the pool`);
  await useCardOffer(active.page, matLand, "undo-mana");
  await active.page.waitForFunction(() => !document.querySelector(".cm-board-lands .cm-bcard.is-tapped"), null, {timeout: 10000});
  const untapped = views(active === rob ? ROB : MAYA).at(-1);
  ok((untapped.state.players[activeSeat].mana || []).length === 0 && !untapped.decision.options.some((o) => o.act === "undo-mana") && untapped.state.phase === "MAIN1",
    "a second click untaps it: upright, the pool empty, nothing to take back, and still main 1");
  await active.page.click("[data-action=board-pass]");
  /* B5, items 10 and 11: one click, and the steps with nothing to do in them pass by themselves -- combat, with no
     creature to attack with -- landing on main 2, where the creature could still be cast. */
  await waitPhase(active.page, /Main 2/);
  eq(await active.page.locator(".cm-board-lands .cm-bcard.is-tapped").count(), 0, "Next step hands priority on, and taps nothing");
  ok(/Main 2/.test(await phaseText(active.page)) && (await text(active.page, ".cm-stage-actions [data-action=board-pass]")).trim() === "Next step",
    "one click of Next step lands on the next step with something to do: main 2");
  await waitText(active.page, ".cm-board-band", /Beginning of combat, Declare attackers, End of combat: nothing to do/);
  ok(true, "and the combat steps it passed through, empty, say so in one line: Beginning of combat, Declare attackers, End of combat: nothing to do");

  /* HISTORY: the table's history, public, newest first; a band on the Focus mat, and History ▾ with a filter. */
  const who = active === rob ? "Rob" : "Maya";
  await waitText(other.page, ".cm-board-band", new RegExp(`${who} played ${land}`));
  const bandRows = await other.page.locator(".cm-board-band li").allInnerTexts();
  ok(bandRows[0].includes("nothing to do") && bandRows[1] === `${who} untapped ${land}, its mana unspent` && bandRows[2].includes(`${who} played ${land}`),
    `the history band on the mat says it, newest first: "${who} played ${land}", then the land untapped, under the empty steps after it (${bandRows.slice(0, 3).join(" | ")})`);
  await utility(active.page,"board-history");
  await active.page.locator("#cm-board-history").waitFor();
  const rows = await active.page.locator("#cm-board-history .cm-history-list li").allInnerTexts();
  ok(rows.some((r) => /^Turn 1 · /.test(r)) && rows.some((r) => new RegExp(`${who} drew 7 cards`).test(r)), `History ▾ holds the turns and the opening draws, uncounted cards unnamed (${rows.length} lines)`);
  ok(rows.findIndex((r) => r.includes(`played ${land}`)) < rows.findIndex((r) => /drew 7 cards/.test(r)), "newest first");
  ok(/Start$/.test(rows.find((r) => /drew 7 cards/.test(r)).trim()), "what happened before turn 1 is marked Start");
  await active.page.fill("#cm-board-history .cm-history-filter", land);
  const shown = await active.page.locator("#cm-board-history .cm-history-list li:not([hidden])").allInnerTexts();
  ok(shown.length >= 1 && shown.every((r) => r.includes(land)), `the filter keeps only the lines that match (${shown.length})`);
  /* A view arrives while the filter is being typed in: the filter keeps its focus, its words and its caret. */
  const before = views(active === rob ? ROB : MAYA).length;
  await serial(async () => object.broadcast());
  await active.page.waitForTimeout(600);
  const kept = await active.page.evaluate(() => {const el = document.activeElement; return el && el.matches("[data-board-history-filter]") ? [el.value, el.selectionStart] : null;});
  ok(views(active === rob ? ROB : MAYA).length > before && kept && kept[0] === land && kept[1] === land.length, `a view arriving mid-filter leaves the filter as it was (${JSON.stringify(kept)})`);
  await shot(active.page, "board-history-" + (active === rob ? "1400" : "1280"));
  await active.page.keyboard.press("Escape");
  await active.page.locator("#cm-board-history").waitFor({state: "detached"});
  ok(true, "Escape closes it");
  /* B1, item 16: a press anywhere outside it closes it too; a press inside it does not. */
  await utility(active.page,"board-history");
  await active.page.click("#cm-board-history .cm-history-filter");
  ok(await active.page.locator("#cm-board-history").count() === 1, "a press inside History ▾ (its filter) keeps it open");
  await active.page.locator(".cm-board-mat").click({position: {x: 3, y: 3}});
  await active.page.locator("#cm-board-history").waitFor({state: "detached", timeout: 3000});
  ok(true, "a press outside it, on the mat, closes it");
  await active.page.click(".cm-board-band [data-action=board-history]");
  await active.page.locator("#cm-board-history").waitFor();
  await active.page.mouse.click(Math.round((await active.page.viewportSize()).width / 2), Math.round((await active.page.viewportSize()).height / 2));
  await active.page.locator("#cm-board-history").waitFor({state: "detached", timeout: 3000});
  ok(true, "the band's clock opens the same drop-down, and a press on the board closes it");

  /* B2, item 19: LEAVING THE BOARD DOES NOT LOSE THE GAME. Rob goes to Decks from the board's menu and comes back by the
     rail's chip; goes again and comes back by Play. One socket all along, and the room never marks his seat away. */
  const robSockets = routes[ROB].length, awayFrames = () => frames[MAYA].filter((f) => /"type":"away"/.test(f)).length, awayBefore = awayFrames();
  await utility(rob.page,"board-menu");
  await rob.page.click("#cm-board-nav a[href='#decks']");
  await rob.page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
  await rob.page.locator("#cm-game-on").waitFor({timeout: 10000});
  ok(/Game on\s*Turn \d+\s*Return/.test(await rob.page.locator("#cm-game-on").textContent()) && await rob.page.locator(".cm-sidebar #cm-game-on").isVisible(), `on Decks the rail says the game is on (${(await rob.page.locator("#cm-game-on").textContent()).trim()})`);
  ok(routes[ROB].length === robSockets && !routes[ROB].at(-1).server.closed, "and the board's socket stayed open: the same one");
  const viewsAway = views(ROB).length;
  await serial(async () => object.broadcast());
  await rob.page.waitForTimeout(500);
  ok(views(ROB).length > viewsAway && await rob.page.locator("#cm-game-on").count() === 1, "the room's views still reach Rob's page while he is on Decks");
  await shot(rob.page, "game-on-decks-1400");
  await rob.page.click("#cm-game-on");
  await rob.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  ok(await rob.page.locator("#cm-game-on").count() === 0 && routes[ROB].length === robSockets, "Game on brings the board back, on the same socket, and puts itself away");
  await utility(rob.page,"board-menu");
  await rob.page.click("#cm-board-nav a[href='#decks']");
  await rob.page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
  await rob.page.click(".cm-sidebar a[data-nav=game]");
  await rob.page.locator('#cm-play-home').waitFor({timeout:30000});
  ok(routes[ROB].length === robSockets, "Play's lounge preserves the live socket while showing Resume");
  await rob.page.getByRole('button',{name:'Resume game',exact:true}).click();
  await rob.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  ok(/^#table\?id=/.test(await rob.page.evaluate(() => location.hash)) && routes[ROB].length === robSockets, "Resume from Play returns to the game, on the same socket");
  ok(awayFrames() === awayBefore && !/Dropped/.test(await text(maya.page, ".cm-board-tile[data-seat='0'] .cm-seat-state")), "and through all of it the room never marked Rob's seat away");   /* (a seat's state is read from its Boards module tile now: no header over the board says it) */

  /* THE THREE VIEWS. Table: every seat's board at once, each the same 16:9, yours at the right of the pair here, the logo between them opening
     Table vitals. Since 2026-10-28 Table is the 3D view's HUD on a flat stage: the boards are laid out by CrankStage.flatGeometry inside the stage (the
     window's whole width, the drawers over it), so the old "rows" (the largest boards that fit in two columns, native scrolling past them) are gone:
     the boards are as large as the stage gives and the window never scrolls them. */
  await chooseView(rob.page,"table");
  await rob.page.locator(".cm-stage-slot .cm-seatboard").nth(1).waitFor();
  await stageSettled(rob.page);
  const tableGeo = await rob.page.evaluate(() => {
    const box = (q) => document.querySelector(q).getBoundingClientRect();
    const mine = box(".cm-stage-slot .cm-seatboard.is-you"), theirs = box(".cm-stage-slot .cm-seatboard:not(.is-you)"), host = box("#cm-board"), hand = box(".cm-stage-hand"), region = box(".cm-stage-region");
    const ring = getComputedStyle(document.querySelector(".cm-seatboard.is-you")).boxShadow, hostStyle = getComputedStyle(document.getElementById("cm-board"));
    const gutL = parseFloat(hostStyle.getPropertyValue("--gut-l")) || 0, gutR = parseFloat(hostStyle.getPropertyValue("--gut-r")) || 0;
    const across = mine.left >= theirs.right - 1 && Math.abs(mine.top - theirs.top) < 1, down = mine.top >= theirs.bottom - 1 && Math.abs(mine.left - theirs.left) < 1;
    return {mineRight: across || down, across, ring: ring !== "none" && /\dpx/.test(ring), same: Math.abs(mine.width / theirs.width - 1.12) < 0.02 && Math.abs(mine.height / theirs.height - 1.12) < 0.02,   /* yours is 12% larger, both the same 16:9 */
      ratio: Math.round(mine.width / mine.height * 100) / 100, fits: mine.right <= region.right - gutR + 1 && theirs.left >= region.left + gutL - 1 && mine.top >= region.top - 1 && mine.bottom <= hand.bottom + 1,
      whole: host.left === 0 && host.top === 0 && host.width === innerWidth && host.height === innerHeight,
      library: document.querySelectorAll(".cm-seatboard [data-zone=library]").length, trayBelow: hand.bottom <= innerHeight + 1 && hand.left === region.left && hand.width === region.width && mine.bottom <= hand.bottom + 1,
      gap: across ? mine.left - theirs.right : mine.top - theirs.bottom, dial: document.querySelectorAll(".cm-board-pie, .cm-board-center").length, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth};
  });
  const initialRows = await rob.page.evaluate(tableFacts);
  ok(tableGeo.whole, "the game fills the window: the board is the whole viewport, the rail under it");
  ok(tableGeo.mineRight && tableGeo.ring, `Table view: two boards, one beside the other or one over the other, Rob's last (${tableGeo.across ? "on the right" : "below"}) in a ring, Maya's first`);
  ok(tableGeo.same && tableGeo.fits && Math.abs(tableGeo.ratio - 16 / 9) < 0.02 && initialRows.valid && initialRows.same, `the boards are each 16:9 (${tableGeo.ratio}), yours 12% larger than the other seat's, whole and between the drawers' gutters, with their cards 5:7 (${JSON.stringify(initialRows.boards.map((b) => [Math.round(b.width), Math.round(b.height)]))})`);
  ok(tableGeo.library === 2 && tableGeo.trayBelow, "each board draws its Library pile, and the hand sits along the foot of the window, the stage's whole width, no board reaching below it");
  /* The life counter with the wand logo at the true center is gone (Rob, 2026-10-28: the turn box top left has the life, names and priority; Table vitals open from a vitals pill): the boards meet with only a hair between them, nothing sits there. */
  ok(tableGeo.dial === 0 && tableGeo.gap >= 0 && tableGeo.gap <= 12 && tableGeo.sideways === 0, `the boards meet with only a hair between them (${Math.round(tableGeo.gap)}px) and no dial lies over it, and nothing scrolls sideways`);
  await verifyTableAccess(rob.page, initialRows);
  /* R12 (the plan review, X8): AT 1280x720 THE CAPTIONS ARE WORDS, NOT A PILE-UP. With Board cards at its smallest the
     Table view's piles are narrowest, and their captions ran into each other ("CommandExile 0", "Library 9Grave...")
     under AGENTS.md's 10px floor. Every pile caption, zone name and heading is 10px or larger, whole and clear of its
     neighbors; a pile too narrow for its name shows its count, and still names its zone to a screen reader and on hover. */
  {
    await rob.page.locator('[data-action=board-camera]').click();
    const was = rob.page.viewportSize(), slider = rob.page.locator(".cm-stage-camera [data-stage-camera=cards]");
    eq(await rob.page.locator('[data-stage-camera=cards]').count(), 1, 'two-seat Table also keeps Board cards only in Camera');
    await rob.page.setViewportSize({width: 1280, height: 720});
    const before = await slider.inputValue(), lo = await slider.getAttribute("min");
    await slider.fill(lo);
    await rob.page.waitForTimeout(250);
    const m = await rob.page.evaluate(() => {
      const shown = (el) => {const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.display !== "none" && st.visibility !== "hidden";};
      const texts = [...document.querySelectorAll(".cm-stage-slot .cm-mat .cm-board-pile figcaption > *, .cm-stage-slot .cm-mat .cm-mat-label, .cm-stage-slot .cm-mat .cm-board-group h3, .cm-stage-slot .cm-mat .cm-board-chip, .cm-stage-slot .cm-mat .cm-board-empty")].filter(shown);
      const small = texts.map((el) => [el.textContent.trim(), parseFloat(getComputedStyle(el).fontSize)]).filter(([, f]) => f < 10);
      const cut = texts.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
      let overlaps = 0;
      for (const mat of document.querySelectorAll(".cm-stage-slot .cm-mat")) {
        const parts = [...mat.querySelectorAll(".cm-board-pile figcaption > *")].filter(shown).map((c) => c.getBoundingClientRect());
        for (let i = 0; i < parts.length; i += 1) for (let j = i + 1; j < parts.length; j += 1) {
          const a = parts[i], b = parts[j];
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps += 1;
        }
      }
      const piles = [...document.querySelectorAll(".cm-stage-slot .cm-board-pile")];
      const named = piles.length > 0 && piles.every((p) => /^(Command|Exile|Library|Graveyard), \d+$/.test(p.getAttribute("aria-label") || "") && p.getAttribute("title") === p.getAttribute("aria-label"));
      return {count: texts.length, small, cut, overlaps, named};
    });
    ok(m.count >= 8 && !m.small.length && !m.cut.length && m.overlaps === 0,
      `R12: at 1280x720, Board cards at its smallest, every caption, zone name and heading in the Table view is 10px or larger, whole and clear of the next (${m.count} read; under 10px ${JSON.stringify(m.small)}; cut ${JSON.stringify(m.cut)}; overlapping ${m.overlaps})`);
    ok(m.named, "and each pile still names its zone and count, to a screen reader and on hover");
    await slider.fill(before);
    await rob.page.locator('[data-action=board-camera]').click();
    const smallerRows = await rob.page.evaluate(tableFacts);
    ok(smallerRows.valid && smallerRows.same, "at 1280x720 the boards keep their 16:9 and their size");
    await verifyTableAccess(rob.page, smallerRows);
    await rob.page.setViewportSize({width:1280,height:600});
    await rob.page.waitForTimeout(400);
    const shortRows=await rob.page.evaluate(tableFacts);
    ok(shortRows.valid&&shortRows.same,'at 1280x600 the boards keep their 16:9 and their size');
    await verifyTableAccess(rob.page,shortRows);
    await rob.page.setViewportSize(was);
  }
  ok(await rob.page.locator(`.cm-seatboard[data-seat='${activeSeat}']`).getByRole('button',{name:new RegExp(`^${land}(?:,|:|$)`)}).count()>0, "the land played is on its owner's board in the Table view too");
  await shot(rob.page, "board-table-1400");
  await rob.page.locator(".cm-stage-top [data-action=board-vitals]").click();
  await rob.page.locator(".cm-table-vitals").waitFor();
  const vitalsRows = await rob.page.locator(".cm-table-vitals [role=row]").allInnerTexts();
  const flat = vitalsRows.map((r) => r.replace(/\s+/g, " ").trim());
  ok(flat[0] === "You Maya" && flat[1] === "♥ 40 40" && flat[2] === "☠ 0 / 10 0 / 10", `Table vitals: every seat's life and poison (${flat.slice(0, 3).join(" | ")})`);
  const vitalsHeads = await rob.page.locator(".cm-table-vitals [role=rowheader]").evaluateAll((els) => els.map((el) => [el.getAttribute("aria-label"), el.textContent.trim()]));
  ok(vitalsHeads[0][0] === "Life" && vitalsHeads[1][0] === "Poison" && vitalsHeads.slice(2).every(([name, t]) => name === null && /^From /.test(t)),
    `a heart names life and a skull and crossbones poison, each named for a screen reader; commander damage has no icon (${vitalsHeads.map(([n, t]) => n || t).join(" | ")})`);
  ok(flat.includes("From Rob General — 0 / 21") && flat.includes("From Maya General 0 / 21 —"), `and each commander's damage to every other seat, its own seat "—" (${flat.slice(3).join(" | ")})`);
  await shot(rob.page, "table-vitals-1400");
  await rob.page.keyboard.press("Escape");
  /* A board has no header or vitals pill over it any more (Rob, 2026-10-28: a name in plain text above the mat), so another seat's pill is gone; Table vitals' other door is
     Settings, General's Table vitals button, which leaves Settings and opens the same sheet. */
  /* With Actions shut the pending choice floats over the stage; open, it is in the drawer and the stage is free. */
  await rail(rob.page, true);
  await utility(rob.page, "board-tools");
  await rob.page.locator("#cm-dialog [data-action=board-vitals]").click();
  await rob.page.locator(".cm-table-vitals").waitFor();
  ok(await rob.page.locator(".cm-table-vitals [role=row]").count() >= 3, "Settings' Table vitals button opens Table vitals too, every seat's in it");
  await rob.page.keyboard.press("Escape");

  /* THE BARS TOWARD 21 (CR 903.10a; the plan review's C1, 2026-10-03). The tally is kept under the commander's key, the
     same in every zone (game/engine/rules/commander.mjs), and the projection gives the commander card that key, so the
     board says whose commander dealt it -- one row per commander, and a key whose card is out of sight still names its
     owner. Shown by handing the board views with a tally in them (no creature attacks in this game), then taking it away. */
  const plainView = object.room.view;
  const mayaGeneral = Object.values(plainView("s0").state.players[1].zones).flatMap((z) => z.cards).find((c) => c.name === "Maya General");
  ok(/^1:\d+$/.test(mayaGeneral?.commanderKey ?? ""), `Maya's commander, as Rob sees it, carries its key, her seat first (${mayaGeneral?.commanderKey})`);
  object.room.view = (seatId) => {const v = plainView(seatId); v.state.players[0].health.commanderDamage = {[mayaGeneral.commanderKey]: 11, "1:9999": 4}; return v;};
  object.broadcast();
  await rob.page.locator(".cm-stage-top .cm-seat-header[data-seat-header='0'] .cm-vitals-bar").nth(1).waitFor();
  const bars = await rob.page.locator(".cm-stage-top .cm-seat-header[data-seat-header='0'] .cm-vitals-bar").evaluateAll((els) => els.map((el) => el.getAttribute("title")));
  eq(bars, ["Maya: 11 of 21", "Maya: 4 of 21"], "Rob's vitals draw a bar for each commander that dealt him combat damage, each in its owner's name -- the one out of sight too");
  await rob.page.locator(".cm-stage-top [data-action=board-vitals]").click();
  await rob.page.locator(".cm-table-vitals").waitFor();
  const tallied = (await rob.page.locator(".cm-table-vitals [role=row]").allInnerTexts()).map((r) => r.replace(/\s+/g, " ").trim());
  ok(tallied.includes("From Maya General 11 / 21 —") && tallied.includes("From Maya's commander, out of sight 4 / 21 —") && tallied.includes("From Rob General — 0 / 21"),
    `Table vitals: the damage from Maya's commander under its name, the one out of sight under hers (${tallied.slice(3).join(" | ")})`);
  await rob.page.keyboard.press("Escape");
  object.room.view = plainView;
  object.broadcast();
  await rob.page.waitForFunction(() => !document.querySelector(".cm-stage-top .cm-seat-header[data-seat-header='0'] .cm-vitals-bar"));

  /* B4, THE TABLE VIEW'S SHAPE (docs/plan-to-done-2026-09-30.md, items 3-9). Still: the tabletop does not move by itself. The painted sea (a canvas
     drawn once) and the hand's fade belonged to the old tabletop; the flat stage has neither, so stillness is read from what is there: no board or
     pile of the stage moves of itself over a second and a canvas is not drawn behind it. */
  const seaAt = () => rob.page.evaluate(() => ({slots: JSON.stringify([...document.querySelectorAll(".cm-stage-slot")].map((e) => {const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height];})), canvas: document.querySelectorAll(".cm-stage-region canvas, .cm-board-sea").length,
    caption: JSON.stringify(document.querySelector(".cm-stage-caption").getBoundingClientRect().toJSON())}));
  const sea1 = await seaAt();
  await rob.page.waitForTimeout(1200);
  const sea2 = await seaAt();
  ok(sea1.slots === sea2.slots && sea1.caption === sea2.caption && sea1.canvas === 0 && sea2.canvas === 0, `the tabletop is still: no board or the turn box moves of itself, and no canvas is drawn (${sea1.canvas} → ${sea2.canvas})`);
  /* The life counter at the true center (a slice per seat) is the turn box top left now (Rob, 2026-10-28): each seat's life, yours first, whose turn it is
     ringed, and a dot where the priority is; the same numbers as the seats' vitals pills. */
  const box = await rob.page.evaluate(() => {
    const rows = [...document.querySelectorAll(".cm-stage-caption .cm-stage-life")], life = (seat) => document.querySelector(`.cm-seat-header[data-seat-header='${seat}'] .cm-vitals b`).textContent;
    const turn = document.querySelector(".cm-stage-caption").getBoundingClientRect(), mats = [...document.querySelectorAll(".cm-stage-slot")].map((e) => e.getBoundingClientRect());
    return {rows: rows.map((r) => ({text: r.textContent.replace(/\s+/g, " ").trim(), n: r.querySelector("b").textContent, turn: r.classList.contains("is-turn"), prio: !!r.querySelector(".cm-stage-life-prio:not(.is-off)")})), pills: [life(0), life(1)],
      clear: mats.every((m) => turn.right <= m.left + 1 || turn.bottom <= m.top + 1), pie: document.querySelectorAll(".cm-board-pie").length};
  });
  ok(box.rows.length === 2 && /^You · Rob/.test(box.rows[0].text) && /^Maya/.test(box.rows[1].text) && box.rows[0].n === box.pills[0] && box.rows[1].n === box.pills[1] && box.rows.filter((r) => r.turn).length === 1 && box.rows.filter((r) => r.prio).length === 1 && box.pie === 0,
    `the turn box gives each seat's life, yours first, the seat to play ringed and the priority's dot on one (${box.rows.map((r) => `${r.text}${r.turn ? " ◉" : ""}${r.prio ? " •" : ""}`).join(" | ")}), the numbers the vitals pills show (${box.pills.join(", ")})`);
  ok(box.clear, "and the turn box is not drawn over a board");
  /* The pile cards on top of their frames, over the frame's lines; the reminder below the Lands. */
  const pileOver = (page, q) => page.evaluate((sel) => {
    const f = document.querySelector(sel), c = f.querySelector(".cm-bcard"), fr = f.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const hit = document.elementFromPoint(fr.left + fr.width / 2, fr.top + 0.5);
    /* Rob, 2026-10-28: the piles are the aspect ratio of the card -- the frame is one card (5:7) and its card fills it */
    return {crosses: cr.left <= fr.left + 1.5 && cr.right >= fr.right - 1.5 && cr.top <= fr.top + 1.5 && Math.abs(fr.width / fr.height - 5 / 7) < .04, over: !!hit && c.contains(hit), by: [Math.round((fr.left - cr.left) * 10) / 10, Math.round((cr.right - fr.right) * 10) / 10]};
  }, q);
  const libT = await pileOver(rob.page, ".cm-board-table .cm-seatboard.is-you [data-zone=library]");
  ok(libT.crosses && libT.over, `the Library's frame is the shape of a card (5:7) and its card fills it (${libT.by.join("px, ")}px past the sides)`);
  const chip = await rob.page.evaluate(() => {const m = document.querySelector(".cm-board-table .cm-seatboard.is-you"), l = m.querySelector("[data-zone=lands]"), c = m.querySelector(".cm-board-chip"), lr = l.getBoundingClientRect(), cr = c.getBoundingClientRect();
    return {inside: l.contains(c), below: cr.top - lr.bottom, right: Math.abs(cr.right - lr.right), text: c.textContent};});
  ok(!chip.inside && chip.below >= 0 && chip.below < 8 && chip.right < 2, `the mana and land-drop reminder sits directly outside and below the Lands frame, at its right ("${chip.text}", ${chip.below.toFixed(1)}px below)`);
  /* The bar between the boards (the rows' share, dragged or keyed) is gone with the rows. Its closest equivalent on the flat stage is Camera's Zoom: it
     sizes the boards alike, each still 16:9, still a pair; it is remembered on the device and kept when Table is drawn again, and
     the arrow keys move it to its end. */
  const geoT = () => rob.page.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect(), theirs = r(".cm-stage-slot .cm-seatboard:not(.is-you)"), mine = r(".cm-stage-slot .cm-seatboard.is-you");
    const hand = r(".cm-stage-hand"), host = document.getElementById("cm-board");
    return {tw: theirs.width, th: theirs.height, mw: mine.width, mh: mine.height, trayTop: hand.top, hand: parseFloat(getComputedStyle(document.querySelector(".cm-stage-fan .cm-bcard")).width),
      side: (theirs.right <= mine.left + 1 && Math.abs(theirs.top - mine.top) < 1) || (theirs.bottom <= mine.top + 1 && Math.abs(theirs.left - mine.left) < 1), scrolls: host.scrollHeight - host.clientHeight};
  });
  const zoomKept = () => rob.page.evaluate(() => localStorage.getItem("cm-board-zoom-v2"));
  const cameraIs = async (open) => {if ((await rob.page.locator(".cm-stage-camera [data-stage-camera=zoom]").count() === 1) !== open) await rob.page.locator("[data-action=board-camera]").click();};
  const even = await geoT(), evenRows = await rob.page.evaluate(tableFacts);
  await cameraIs(true);
  const zoom = rob.page.locator(".cm-stage-camera [data-stage-camera=zoom]");
  await zoom.fill("130"); await rob.page.waitForTimeout(300);
  const dragged = await geoT(), share = Number(await zoomKept()), draggedRows = await rob.page.evaluate(tableFacts);
  ok(dragged.tw > even.tw * 1.25 && dragged.mw > even.mw * 1.25 && Math.abs(dragged.mw / dragged.tw - 1.12) < 0.02 && draggedRows.valid && share === 130 && dragged.side,
    `Camera's Zoom to 130%: both boards grow alike (yours still 12% larger) and stay 16:9, still a pair, one beside the other or over it (${even.tw.toFixed(0)} → ${dragged.tw.toFixed(0)}px over ${even.mw.toFixed(0)} → ${dragged.mw.toFixed(0)}px; kept ${share})`);
  await cameraIs(false);
  await chooseView(rob.page,"focus");
  await rob.page.locator(".cm-board-mat").waitFor();
  const libF = await pileOver(rob.page, ".cm-board-mat [data-zone=library]");
  ok(libF.crosses && libF.over, `on the Focus mat too, the Library's card is on top of its frame (${libF.by.join("px, ")}px past the sides)`);
  await chooseView(rob.page,"table");
  await rob.page.locator(".cm-stage-slot .cm-seatboard").nth(1).waitFor();
  const redrawn = await geoT();
  ok((await rob.page.evaluate(tableFacts)).valid, "redrawing Table preserves its boards at 16:9");
  ok(Math.abs(redrawn.tw - dragged.tw) < 1 && Math.abs(redrawn.mw - dragged.mw) < 1 && Number(await zoomKept()) === share, "and the zoom is remembered on the device: the Table view drawn again keeps the boards as they were left");
  await cameraIs(true);
  await zoom.focus();
  for (let i = 0; i < 20; i += 1) await rob.page.keyboard.press("ArrowLeft");
  const keyed = await geoT(), low = Number(await zoomKept());
  ok(low === 110 && keyed.tw < dragged.tw && keyed.tw > even.tw && (await zoom.getAttribute("aria-valuenow") ?? await zoom.inputValue()) === "110", `the arrow keys move it too, a step a press (${low}%)`);
  await rob.page.keyboard.press("Home");
  const floor = Number(await zoomKept());
  ok(floor === Number(await zoom.getAttribute("min")) && (await geoT()).tw < even.tw, `and it stops at the least the scale allows (${floor}%)`);
  await zoom.fill("100"); await rob.page.waitForTimeout(300);
  const back = await geoT();
  await cameraIs(false);
  await verifyTableAccess(rob.page, await rob.page.evaluate(tableFacts));
  ok(Number(await zoomKept()) === 100 && Math.abs(back.mw / back.tw - 1.12) < 0.02 && Math.abs(back.tw - even.tw) < 1, "and back at 100%, the boards are as they began");
  /* The bar atop the hand tray (the hand's card size, dragged up) is gone too: Camera's Hand cards (✋) slider is the hand's size. Grown, the hand's
     cards grow and every board keeps its size and the hand its place (Rob, 2026-10-09: "Card hand size should never decrease the board size"). */
  await cameraIs(true);
  const handSlider = rob.page.locator(".cm-stage-camera [data-board-scale=hand]");
  await handSlider.fill("140"); await rob.page.waitForTimeout(300);
  const grown = await geoT(), handOut = (await handSlider.evaluate((el) => el.parentElement.querySelector("output").textContent)).trim();
  ok(grown.hand > even.hand * 1.2 && Math.abs(grown.tw - even.tw) < 1 && Math.abs(grown.mw - even.mw) < 1 && Math.abs(grown.trayTop - even.trayTop) < 1 && evenRows.valid && /^1[2-9]\d%$/.test(handOut),
    `Camera's Hand cards drags up: the hand's cards grow (${even.hand.toFixed(0)} → ${grown.hand.toFixed(0)}px, ${handOut}), every board keeps its size (${even.tw.toFixed(0)} → ${grown.tw.toFixed(0)}px) and the hand its place`);
  /* The three card sizes: the board's and the hand's each their own; Tools sets both to its value. A board's cards are bounded by the room on its mat (--bc-cap: they never
     outgrow it, and Camera's Cards below 100% shrinks them under it), and Table's two boards leave a card at 1400x900 already at that bound from 100%: no slider
     travel is left above it. The slider's growth is read on Focus, whose one board has the room (cards grow from 70% to about 140% and stop at the bound). */
  await cameraIs(true); await chooseView(rob.page,"focus"); await rob.page.locator(".cm-stage-big").waitFor(); await cameraIs(true);
  const sizes = () => rob.page.evaluate(() => {
    const land = document.querySelector(".cm-stage-slot .cm-board-lands .cm-bcard"), board = land.closest(".cm-mat"), slot = board.closest(".cm-stage-slot"), host = getComputedStyle(document.getElementById("cm-board"));
    const badges=[...board.querySelectorAll('.cm-bcard-pt,.cm-bcard-count,.cm-bcard-tax')].filter(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden');
    const fits=badges.every(b=>{const r=b.getBoundingClientRect(),c=b.closest('.cm-bcard').getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1&&b.scrollWidth<=b.clientWidth+1;});
    const out = (sel) => document.querySelector(sel)?.closest('label').querySelector('output').textContent ?? null;
    return {cardW: land.getBoundingClientRect().width, cap: parseFloat(getComputedStyle(board).getPropertyValue("--bc-cap")), badgeFits:badges.length>0&&fits,board: parseFloat(getComputedStyle(land).width) / board.getBoundingClientRect().width, hand: parseFloat(getComputedStyle(document.querySelector(".cm-stage-fan .cm-bcard")).width),
      scopes: [slot.style.getPropertyValue("--board-scale").trim(), host.getPropertyValue("--hand-scale").trim()], outs: [out('#cm-board [data-stage-camera="cards"]'), out('#cm-board [data-board-scale="hand"]')]};
  });
  await handSlider.fill("100");
  const boardSlider=rob.page.locator('.cm-stage-camera [data-stage-camera=cards]'),loScale=Number(await boardSlider.getAttribute('min')),sliderMax=Number(await boardSlider.getAttribute('max')),upper=140,middle=Math.round((loScale+upper)/2);
  await boardSlider.fill(String(loScale));const naturalLow=await sizes();
  await boardSlider.fill(String(middle));const naturalMid=await sizes();
  await boardSlider.fill(String(upper));const naturalUpper=await sizes();
  const firstSlope=(naturalMid.board-naturalLow.board)/(middle-loScale),lastSlope=(naturalUpper.board-naturalMid.board)/(upper-middle);
  ok([naturalLow,naturalMid,naturalUpper].every(v=>v.badgeFits)&&firstSlope>0&&lastSlope>0&&Math.abs(firstSlope-lastSlope)<.00005&&Math.abs(naturalLow.hand-naturalUpper.hand)<.5,
    'the native Card Scale range has useful positive natural growth, with any constant readability offset, and leaves Hand cards unchanged');
  /* Past that the room is the limit: at the slider's end a card is no larger than the board's room for it (and no smaller than at 140%). */
  await boardSlider.fill(String(sliderMax));const naturalMax=await sizes();
  ok(naturalMax.cardW<=naturalMax.cap+.5&&naturalMax.cardW>=naturalUpper.cardW-.5&&Math.abs(naturalMax.hand-naturalLow.hand)<.5,
    `and at the slider's end a card is no larger than the room its board leaves (${naturalMax.cardW.toFixed(1)}px of ${naturalMax.cap.toFixed(1)}px)`);
  await boardSlider.fill('100');
  const s100 = await sizes();
  await rob.page.locator(".cm-stage-camera [data-stage-camera=cards]").fill("80");
  const sBoard = await sizes();
  /* (The stage maps the slider to a board's scale with the readable-caption offset, 1 + 0.8 x (value - 100)/100: 80% is 0.84, 120% is 1.16; the hand's scale is the slider's value as is.) */
  const boardFactor=sBoard.board/s100.board,boardScaleFits=sBoard.board>=naturalLow.board&&sBoard.board<s100.board;
  ok(sBoard.badgeFits&&boardScaleFits && Math.abs(sBoard.hand - s100.hand) < 0.5 && sBoard.scopes[0] === "0.84" && sBoard.outs[0] === "80%",
    `Board cards, in Camera, sizes the boards' cards alone (to ${(sBoard.board / s100.board * 100).toFixed(0)}%; the hand stays ${sBoard.hand.toFixed(0)}px)`);
  await rob.page.locator(".cm-stage-camera [data-board-scale=hand]").fill("130");
  const sHand = await sizes();
  ok(Math.abs(sHand.hand / s100.hand - 1.3) < 0.02 && Math.abs(sHand.board - sBoard.board) < 0.0005 && sHand.scopes[1] === "1.3" && sHand.outs[1] === "130%",
    `Hand cards, in Camera, sizes the hand's cards alone (${s100.hand.toFixed(0)} → ${sHand.hand.toFixed(0)}px; the boards' cards keep their size on their boards)`);
  await utility(rob.page,"board-tools","video");
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("120");
  const sTools = await sizes(), toolsOut = await rob.page.locator("#cm-board-tools [data-card-scale]").evaluate((el) => el.parentElement.querySelector("output").textContent);
  /* Opening Play settings closes Camera (Hand cards and Cards live in it), so the two sliders' values are read from the cards and, below, from Camera reopened. */
  const toolsScaleFits=sTools.board>s100.board&&sTools.board<=naturalUpper.board;
  ok(sTools.badgeFits&&sTools.scopes.join() === "1.16,1.2" && toolsOut === "120%" && toolsScaleFits && Math.abs(sTools.hand / s100.hand - 1.2) < 0.02,
    `Tools is the table's card size, and moving it sets Board cards and Hand cards to its value (${toolsOut}; cards ${sTools.scopes.join(", ")})`);
  await rob.page.click("#cm-dialog [data-action=board-settings-save]");
  await cameraIs(true);
  eq((await sizes()).outs, ["120%", "120%"], "and Camera shows Cards and Hand cards at Tools' value");
  await cameraIs(false);
  await utility(rob.page,"board-tools","video");
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("100");
  await rob.page.click("#cm-dialog [data-action=board-settings-save]");
  await cameraIs(true);
  eq((await sizes()).outs, ["100%", "100%"], "and back to 100%, all three agree");
  await boardSlider.fill("100");
  await rob.page.locator('[data-action=board-camera]').click();
  await chooseView(rob.page,"table"); await cameraIs(false); await rob.page.locator(".cm-stage-slot .cm-seatboard").nth(1).waitFor();
  await rob.page.locator(".cm-stage-slot:not(.is-you) .cm-seatboard").first().dblclick({position: {x: 4, y: 4}});   /* a double click on a board focuses it (Rob, 2026-10-28; the Focus button is gone) */
  await rob.page.locator(".cm-stage-big").waitFor();
  ok((await text(rob.page, ".cm-stage-big .cm-stage-boardname")).trim() === "Maya" && /^\d+ in hand$/.test((await text(rob.page, ".cm-board-tile:not(.is-you) .cm-seat-hand")).trim()) && await rob.page.getAttribute("#cm-board", "data-view") === "focus", "a double click on Maya's board puts it on the mat in the Focus view, her name above it and her hand count in the Boards module");
  await lookAt(rob.page, 0);

  /* B7, item 15: THE PANE'S DIVIDER. Dragged wider, the tiles grow with it, and past 400px each is a miniature of that
     seat's real board; the mat stays the largest 16:9 beside it; the width is remembered. */
  /* The Boards module of the left drawer is the old seat pane; its divider still drags it wider and past 400px each tile is a miniature. The drawer is the
     top layer now, so widening it moves nothing: the mat keeps its place and size (it no longer gives way beside the pane). */
  await rail(rob.page, true);
  const paneGeo = () => rob.page.evaluate(() => {
    const pane = document.querySelector(".cm-stage-rail").getBoundingClientRect(), mat = document.querySelector(".cm-stage-big .cm-mat").getBoundingClientRect(), big = document.querySelector(".cm-stage-big").getBoundingClientRect();
    const tile = document.querySelector(".cm-board-tile[data-seat='1']"), mine = document.querySelector(".cm-board-tile[data-seat='0']");
    return {pane: Math.round(pane.width), tile: Math.round(tile.getBoundingClientRect().width), mini: document.querySelectorAll(".cm-board-tile.is-mini .cm-board-mini .cm-mat[data-fit=mini]").length,
      robLands: mine.querySelectorAll(".cm-board-mini [data-zone=lands] .cm-bcard").length, inert: !!tile.querySelector(".cm-board-mini[inert]"),
      matBox: [mat.x, mat.y, mat.width, mat.height].map((n) => Math.round(n * 10) / 10), matW: mat.width, bigBox: [big.x, big.y, big.width, big.height].map((n) => Math.round(n * 10) / 10), ratio: Math.round(big.width / big.height * 100) / 100};
  });
  const pane0 = await paneGeo();
  const paneGrip = await rob.page.locator(".cm-board-panegrip [data-drag=pane]").boundingBox();
  await rob.page.mouse.move(paneGrip.x + paneGrip.width / 2, paneGrip.y + 200);
  await rob.page.mouse.down();
  await rob.page.mouse.move(paneGrip.x + paneGrip.width / 2 + 100, paneGrip.y + 200, {steps: 4});
  await rob.page.mouse.move(paneGrip.x + paneGrip.width / 2 + 200, paneGrip.y + 200, {steps: 4});
  await rob.page.mouse.up();
  const pane1 = await paneGeo();
  ok(pane0.pane === 270 && Math.abs(pane1.pane - 470) <= 2 && pane1.tile > pane0.tile + 150 && pane1.bigBox[0] >= pane1.pane - 1 && pane1.bigBox[2] <= pane0.bigBox[2] && Math.abs(pane1.ratio - 16 / 9) < 0.02,
    `the divider of the Boards drawer drags: 200px right, the drawer ${pane0.pane} → ${pane1.pane}px, the tiles growing with it, and the board looked at gives way to the wider drawer's gutter, staying 16:9 and clear of it (${JSON.stringify(pane0.bigBox)} → ${JSON.stringify(pane1.bigBox)}); opening or closing the drawer moves nothing, only its width does`);
  ok(pane0.mini === 0 && pane1.mini === 2 && pane1.robLands >= 1 && pane1.inert, `and past 400px each tile is a miniature of that seat's board, cards and all (the Forest on Rob's: ${pane1.robLands}), only to look at`);
  await shot(rob.page, "pane-miniatures-1400");
  await rob.page.locator(".cm-board-tile[data-seat='1'] .cm-board-tile-main").click();
  await rob.page.waitForFunction(() => document.querySelector(".cm-stage-big .cm-stage-boardname")?.textContent.trim() === "Maya", null, {timeout: 5000});   /* (the board looked at is named in plain text above it) */
  ok(true, "a miniature is still the tile: a click on it puts that seat's board on the mat");
  await rob.page.locator(".cm-board-tile[data-seat='0'] .cm-board-tile-main").click();
  await chooseView(rob.page,"table");
  await chooseView(rob.page,"focus");
  await rob.page.locator(".cm-board-mat").waitFor();
  const pane2 = await paneGeo();
  ok(pane2.pane === pane1.pane && pane2.mini === 2 && Number(await rob.page.evaluate(() => localStorage.getItem("cm-board-pane"))) === pane1.pane, "and the width is remembered on the device: the Focus view drawn again keeps it");
  await rob.page.focus(".cm-board-panegrip [data-drag=pane]");
  for (let i = 0; i < 10; i += 1) await rob.page.keyboard.press("ArrowLeft");
  const pane3 = await paneGeo();
  ok(pane3.pane === pane1.pane - 200 && pane3.mini === 0, `the arrow keys move it too, 20px a press: back to ${pane3.pane}px, and the tiles are plain tiles again`);
  /* The drawers lie over the hand, so the Boards drawer is put away before the hand is used. */
  await rail(rob.page, false);

  const fullTools = async page => {
    await page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
    if(!await page.locator('.cm-stage-rail').isVisible()) await page.locator('.cm-stage-left[data-action=board-stage-rail]').click();
    if(!await page.locator('.cm-stage-side').isVisible()) await page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  };
  /* Full screen: the page is the game's; a card picked shows large at the side with what it can do; ⎋ leaves. */
  await chooseView(maya.page,"full"); await placeModule(maya.page, "Table Vitals", "Right"); await fullTools(maya.page);
  await maya.page.locator(".cm-stage-rail").waitFor();
  const fullGeo = await maya.page.evaluate(() => {const r = document.getElementById("cm-board").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), innerWidth, innerHeight, document.documentElement.scrollWidth - document.documentElement.clientWidth];});
  ok(fullGeo[0] === 0 && fullGeo[1] === 0 && fullGeo[2] === fullGeo[4] && fullGeo[3] === fullGeo[5] && fullGeo[6] === 0, `Full screen takes the whole window by itself where the browser gives no full screen (${fullGeo.slice(0, 4).join(",")} of ${fullGeo[4]}×${fullGeo[5]})`);
  ok(await maya.page.locator(".cm-stage-rear .cm-seatboard").count() === 1 && await maya.page.locator(".cm-full-mine .cm-seatboard.is-you").count() === 1, "the other seat across the top, hers across the foot");
  const backRow = await maya.page.evaluate(() => {const w = (s) => parseFloat(getComputedStyle(document.querySelector(s)).width); return {rear: w(".cm-stage-rear"), front: w(".cm-stage-front")};});
  ok(Math.abs(backRow.rear - backRow.front) < 1, `the one other seat spans the whole back row, as wide as her own mat (${Math.round(backRow.rear)} of ${Math.round(backRow.front)}px), not a third of it`);
  ok(await maya.page.locator('[data-action=board-3d], [data-action=board-stage]').count()===0, "Full screen always uses the tabletop; there is no 3D toggle");
  await maya.page.getByRole('button',{name:'Camera',exact:false}).click();
  await maya.page.getByRole('slider',{name:'Table tilt',exact:true}).fill('90');
  const flatPlane=await maya.page.locator('.cm-stage-front').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return Math.abs(m.m11-m.m22)<.001;});
  ok(flatPlane,"90 degrees, perpendicular to the floor, gives a flat, undistorted table");
  await maya.page.getByRole('slider',{name:'Table tilt',exact:true}).fill('40');
  await maya.page.getByRole('button',{name:'Camera',exact:false}).click();
  await shot(maya.page,"board-full-3d-1280");
  ok(/played (Forest|Island)/.test(await text(maya.page, ".cm-stage-side .cm-stage-module[data-module=history] .cm-board-band")), "and the history in the side column");
  /* The drawers lie over the hand (top layer), so the first card a pointer can reach is the first one not under a drawer. */
  const handReach = await maya.page.evaluate(() => [...document.querySelectorAll(".cm-stage-fan .cm-bcard")].findIndex((c) => {const r = c.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && c.contains(hit);}));
  ok(handReach >= 0, `a hand card is reachable beside the open drawers (the ${handReach + 1}th)`);
  const firstHand = maya.page.locator(".cm-stage-fan .cm-bcard").nth(handReach), firstName = (await firstHand.getAttribute("aria-label")).split(/[,:]/)[0];
  const firstReadRevision = views(MAYA).at(-1).revision, firstReadSends = sent[MAYA].length;
  await firstHand.click();
  await maya.page.locator('#cm-card-menu [data-action=board-card-menu-view]').click();
  await maya.page.locator('#cm-card-inspector .cm-bcard').waitFor();
  eq((await text(maya.page, '#cm-card-inspector h3')).trim(), firstName, `Read shows the chosen card large (${firstName})`);
  eq([views(MAYA).at(-1).revision, sent[MAYA].length], [firstReadRevision, firstReadSends], 'reading the hand card neither sends an action nor changes the game');
  await shot(maya.page, "board-full-1280");
  /* The independent History module stays present while the shared read-only inspector is open. */
  const sideRatio=await maya.page.locator('#cm-card-inspector .cm-bcard').evaluate(el=>{const r=el.getBoundingClientRect();return r.width/r.height;});
  ok(Math.abs(sideRatio-5/7)<.01 && await maya.page.locator('.cm-stage-module[data-module="history"]').count()===1,
    "the real-game inspector keeps its card aspect while the independently arranged History module remains present");
  await maya.page.locator('#cm-card-inspector [data-action=board-inspect-close]').click();
  await chooseView(maya.page,"focus");
  await maya.page.locator(".cm-stage-top").waitFor();
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "focus", "⎋ leaves Full screen for Focus");
  /* THE HOVER CARD IS READ AT FULL SIZE, WITHIN THE WINDOW (was: no taller than the mat, Rob, 2026-10-11). The cap to the mat's height (--peek-max, set by
     the old Focus and Table layouts) is superseded: the flat stage's boards are small by design (here her mat is 16:9 at about 180px tall), and a hover card
     held to that would be a thumbnail nobody can read, against "every card reference is one press from the card itself, to see it large and read it"
     (AGENTS.md). Its closest equivalent: the card is its normal 320px wide (448 tall; the pop-up is 20% smaller since 2026-10-28, was 400 by 560) where the window has room, and the window's room (80px to spare) where it has not. */
  await maya.page.hover(".cm-stage-fan .cm-bcard[data-card]");
  await maya.page.locator("#cm-board-peek .cm-bcard").waitFor({timeout: 5000});
  const peekCap = await maya.page.evaluate(() => {const p = document.querySelector("#cm-board-peek .cm-bcard").getBoundingClientRect(), m = document.querySelector(".cm-stage-big .cm-mat").getBoundingClientRect(); return {peek: Math.round(p.height), mat: Math.round(m.height), w: Math.round(p.width), win: innerHeight};});
  ok(Math.abs(peekCap.peek-Math.min(448,(peekCap.win-80)))<2&&Math.abs(peekCap.w-Math.min(320,(peekCap.win-80)*5/7))<2, `the hover card is read at its normal 320px width cap, and within the window (${peekCap.peek}px tall in ${peekCap.win}px; ${peekCap.w}px wide; her mat is ${peekCap.mat}px)`);
  await maya.page.mouse.move(2, 2);
  await maya.page.locator("#cm-board-peek").waitFor({state: "detached", timeout: 5000});
  /* THE CALLOUTS (the Replit brief's overlay): Tools › Try the callouts shows the grammar on demand, at most three at
     once, in a layer beside the board that a view's repaint leaves alone. */
  await utility(maya.page,"board-tools","general");
  await maya.page.click("[data-action=board-callout-demo]");
  await maya.page.locator(".cm-callout").first().waitFor({timeout: 3000});
  await maya.page.waitForTimeout(1500);
  const called = await maya.page.evaluate(() => ({n: document.querySelectorAll("#cm-board-callouts .cm-callout").length, words: [...document.querySelectorAll("#cm-board-callouts .cm-callout-word")].map((w) => w.textContent.trim()), outside: !document.getElementById("cm-board").contains(document.getElementById("cm-board-callouts")), hidden: document.getElementById("cm-board-callouts").getAttribute("aria-hidden")}));
  ok(called.n >= 1 && called.n <= 3 && called.words.some((w) => /YOUR TURN|INCOMING|HIT/.test(w)) && called.outside && called.hidden === "true", `the callouts show, three at most (${called.n}: ${called.words.join(", ")}), beside the board and not read aloud`);
  await maya.page.waitForFunction(() => !document.querySelector("#cm-board-callouts .cm-callout"), null, {timeout: 20000});
  await chooseView(maya.page,"full"); await fullTools(maya.page);
  await maya.page.locator(".cm-stage-rail").waitFor();
  const pillClear = await maya.page.evaluate(() => {const controls = document.querySelector(".cm-stage-actions") || document.querySelector(".cm-stage-top"), pill = controls.getBoundingClientRect(), first = document.querySelector(".cm-full-mine .cm-seatboard-body").getBoundingClientRect(); return pill.height > 0 && first.top >= pill.bottom;});
  ok(pillClear, "the rendered turn controls stay above her board without covering its first row");
  await maya.page.getByRole("button",{name:"Camera",exact:false}).click();
  await maya.page.getByRole("button",{name:"Next seat",exact:true}).click();
  await maya.page.getByRole("button",{name:"Camera",exact:false}).click();
  await maya.page.locator(".cm-full-mine .cm-seatboard[data-seat='0']").waitFor();
  ok(/Viewing Rob/.test(await text(maya.page, ".cm-full-viewing")) && await maya.page.locator(".cm-stage-rear .cm-seatboard.is-you").count() === 1 && await maya.page.locator(".cm-stage-fan .cm-bcard").count() > 0, "⟳ walks the big board round the table: Rob's board large, hers across the top, his hand backs along the foot");
  ok(!(await maya.page.content()).includes("Rob Secret"), "and nothing of his hand came with it");
  /* B7, item 20: rotated to another seat, the tray shows that seat's hand as the backs of its cards, Rob's art in the
     seat's color (tan, here, for a commander no library knows), as many as he holds and never a face. */
  const backs = await maya.page.evaluate(() => {
    const tray = document.querySelector(".cm-stage-fan"), cards = [...tray.querySelectorAll(".cm-bcard")];
    return {backs: tray.classList.contains("is-backs"), n: cards.length, all: cards.every((c) => c.classList.contains("is-back") && !c.dataset.card), art: getComputedStyle(cards[0]).backgroundImage, label: tray.getAttribute("aria-label"),
      pile: getComputedStyle(document.querySelector(".cm-full-mine [data-zone=library] .cm-bcard")).backgroundImage};
  });
  const robHandCount = views(MAYA).at(-1).state.players[0].zones.Hand.count;
  ok(backs.backs && backs.n === Math.min(7,robHandCount) && backs.all && /card-back-tan\.webp/.test(backs.art), `the tray shows Rob's hand as ${backs.n} backs, as many as he holds (${robHandCount}), in Rob's card back, and not one face ("${backs.label}")`);
  ok(/card-back-tan\.webp/.test(backs.pile), "and his library is drawn with the same back");
  await shot(maya.page, "rotated-backs-1280");
  await maya.page.click(".cm-full-viewing [data-action=board-focus]");
  await maya.page.locator(".cm-full-mine .cm-seatboard.is-you").waitFor();
  ok(true, "My board brings hers back");
  const escapeRevision=views(MAYA).at(-1).revision, escapeSends=sent[MAYA].length;
  await maya.page.keyboard.press("Escape");
  await maya.page.locator('#cm-table-menu').waitFor();
  ok(true, 'Escape from your own board opens Table, as the r4 escape order specifies');
  await maya.page.keyboard.press("Escape");
  await maya.page.locator('#cm-table-menu').waitFor({state:'detached'});
  for (const side of ['left','right']) {
    const drawer = side==='left'?'.cm-stage-rail':'.cm-stage-side';
    if(await maya.page.locator(drawer+'.is-open').count()) await maya.page.locator('.cm-stage-'+side+'[data-action]').click();
  }
  eq(await maya.page.locator('.cm-stage-side.is-open, .cm-stage-rail.is-open').count(),0,'native drawer tabs collapse both shared drawers');
  eq([views(MAYA).at(-1).revision,sent[MAYA].length],[escapeRevision,escapeSends],'Table Escape and native drawer collapse do not submit a game answer or change its view');
  await maya.page.locator(".cm-stage-top").waitFor();
  eq(await maya.page.getAttribute("#cm-board", "data-view"), "full", "Escape keeps the selected 3D view");
  await chooseView(maya.page,"focus");

  /* Where the browser will, Full screen asks it for the whole screen, and gives it back on the way out. B1, item 22: it
     asks for the whole DOCUMENT -- a browser shows only the fullscreen element's own subtree, and the Coach and the
     app's dialogs live beside the board -- so Table vitals and the Coach are seen in it. */
  await chooseView(rob.page,"full"); await placeModule(rob.page, "Table Vitals", "Right"); await fullTools(rob.page);
  eq(await rob.page.evaluate(() => document.fullscreenElement), null, "3D does not commandeer browser full-screen");
  /* Whose turn it is, on that seat's line of the side column's vitals (Rob, 2026-10-09). */
  const fullTurn = await rob.page.evaluate(() => [...document.querySelectorAll(".cm-full-vitals .cm-board-turn-mark")].map((m) => ({seat: m.closest("[data-seat]").dataset.seat, said: m.getAttribute("aria-label"), ringed: m.closest(".is-turn") !== null})));
  const turnNow = views(ROB).at(-1).state.turnPlayerId;
  eq(fullTurn, [{seat: String(turnNow), said: turnNow === 0 ? "Your turn" : "Maya's turn", ringed: true}], `in Full screen the side column marks whose turn it is, on that seat's vitals alone (${JSON.stringify(fullTurn)})`);
  const seenAt = (page, sel) => page.evaluate((q) => {const el = document.querySelector(q); if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(60, r.height / 2)); return r.width > 0 && !!hit && !!hit.closest(q);}, sel);
  await rob.page.click(".cm-stage-side .cm-full-vitals [data-action=board-vitals]");
  await rob.page.locator("#cm-dialog[open] .cm-table-vitals").waitFor();
  ok(await seenAt(rob.page, "#cm-dialog[open]"), "in 3D, Table vitals is seen over the game");
  await rob.page.click("#cm-dialog[open] .cm-form-footer [data-action=close]");
  const beforeFullCoach=await rob.page.locator(".cm-stage-region").boundingBox();
  await fullCoach(rob.page);
  await rob.page.locator("#cm-board-coach:not([hidden]) .cm-coach-input").waitFor();
  const docked = await rob.page.evaluate(() => {
    const c = document.getElementById("cm-board-coach").getBoundingClientRect(), board = document.querySelector(".cm-stage-region").getBoundingClientRect(), header = document.querySelector(".cm-stage-top").getBoundingClientRect(), host = document.getElementById("cm-board").getBoundingClientRect();
    return {module:document.getElementById("cm-board").dataset.coach === "module",board:{x:board.x,y:board.y,width:board.width,height:board.height},reserved: board.right <= c.left + 1, aligned: c.left >= host.left && c.right <= host.right + 1 && c.top >= header.bottom - 1, contained: c.width >= 240 && c.bottom <= host.bottom + 0.5, width: Math.round(c.width)};
  });
  ok(docked.module
    ? Object.entries(beforeFullCoach).every(([key,n])=>Math.abs(docked.board[key]-n)<1)
    : await seenAt(rob.page,"#cm-board-coach")&&docked.reserved&&docked.aligned&&docked.contained,
    `the Coach preserves board geometry as a module overlay, or reserves a separate standalone area (${docked.width}px)`);
  await verifyCoachUsable(rob.page);
  await shot(rob.page, "coach-full-1400");
  await rob.page.click("#cm-board-coach [aria-label='Close the Coach']");
  /* B1, item 23: the rail squares its own buttons, not the ones in the menus it opens. */
  await utility(rob.page,"board-tools");
  await rob.page.locator("#cm-board-tools").waitFor();
  await settingsSection(rob.page, "general");
  const toolsMenu = await rob.page.evaluate(() => {
    const bs = [...document.querySelectorAll("#cm-board-tools .cm-tabbed-panel:not([hidden]) .v-button")].map((el) => ({r: el.getBoundingClientRect(), clipped: el.scrollWidth > el.clientWidth + 1}));
    const overlap = bs.some((a, i) => bs.some((b, j) => j > i && a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1));
    return {n: bs.length, overlap, clipped: bs.filter((x) => x.clipped).length, narrow: bs.filter((x) => x.r.width <= 40).length};
  });
  ok(toolsMenu.n >= 4 && !toolsMenu.overlap && !toolsMenu.clipped && !toolsMenu.narrow, `in Full screen the Tools menu's ${toolsMenu.n} buttons are whole: none overlaps another, none is squared or clipped`);
  eq(await rob.page.locator("#cm-board-tools [data-action=ai-settings]").count(), 1, "and among them AI Coach settings…, the same panel as Settings' (AI-6)");
  await shot(rob.page, "tools-full-1400");
  await rob.page.keyboard.press("Escape");
  await chooseView(rob.page,"focus");
  await rob.page.waitForFunction(() => !document.fullscreenElement, null, {timeout: 10000});
  ok(true, "switching view does not enter browser full-screen");

  /* The view is remembered on this device: Table, then a reload, and it is still Table. */
  await chooseView(rob.page,"table");
  await rob.page.reload();
  await rob.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  await rob.page.locator(".cm-board-table").waitFor({timeout: 20000});
  ok(await rob.page.getAttribute("#cm-board", "data-view") === "table", "the view chosen is the view Rob comes back to");
  await chooseView(rob.page,"focus");
  await rail(other.page, true);
  await lookAt(other.page, 1 - activeSeat);

  /* END TURN (Rob, 2026-10-11: "passing the turn to the next player should always require player confirmation, never
     happen automatically"): Next step from main 2 lands on the end step, with nothing to do in it, and asks; the button
     says what passing will do there. */
  await active.page.click("[data-action=board-pass]");
  await waitText(active.page, ".cm-stage-actions [data-action=board-pass]", /^End turn$/);
  const ending = views(active === rob ? ROB : MAYA).at(-1);
  ok(ending.state.phase === "END_OF_TURN" && ending.state.turn === 1 && ending.decision.options.find((o) => o.act === "pass").endsTurn === true && /^End/.test((await phaseText(active.page)).trim()),
    `the end step of your own turn asks you, nothing to do in it: the button reads End turn (${(await phaseText(active.page)).trim()})`);
  await active.page.waitForTimeout(800);
  ok(views(active === rob ? ROB : MAYA).at(-1).state.turn === 1 && (await text(active.page, ".cm-stage-actions [data-action=board-pass]")).trim() === "End turn", "and the turn waits there for the click");

  /* REFUSED: an answer to a question already gone is refused, in words, and the board takes the room's view. */
  const {server} = routes[active === rob ? ROB : MAYA].at(-1);
  const stale = views(active === rob ? ROB : MAYA).at(-1);
  await serial(() => object.webSocketMessage(server, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: stale.revision - 1, kind: "answer", choiceId: "gone", indices: [0]})));
  await active.page.locator("#cm-notice").filter({hasText: /./}).first().waitFor({timeout: 10000});
  ok((await text(active.page, "#cm-notice")).length > 5, `a refused answer is said: "${(await text(active.page, "#cm-notice")).trim()}"`);

  /* SKIP TO END: the active player's board passes for them from here to the turn's end, by itself. "Skipping" is on the
     button only that long, and it is short: the board passes a moment after the click, the room runs the pass to turn 2
     in one step, and the button puts itself away. A read slower than that saw "Skip to end" again (a busy machine,
     2026-10-02). So the room is held while the button is read, and the label is waited for, not read once. */
  let resume; const roomHeld = new Promise((r) => {resume = r;});
  serial(() => roomHeld);
  await active.page.click("[data-action=board-skip]");
  await waitText(active.page, "[data-action=board-skip]", /Skipping · stop/, 10000);
  ok(true, "Skip to end says it is skipping");
  resume();
  await waitText(active.page, ".cm-board-waiting", new RegExp(`Waiting on ${active === rob ? "Maya" : "Rob"}`), 10000);
  ok(true, "and the board passed priority for them, unasked");
  /* DRAW CARD (Linear ROB-102 and ROB-24): the Oct 15 playtest's confirmed decisions reverse Oct 9's draw by itself
     ("label the pending draw action Draw card"). Turn 2's draw step waits for the other player: their button reads Draw
     card, their library is lit as the same button, and their hand is unchanged until they say so. The library clicked
     where a pointer reaches it draws one card, and the turn goes on to the first thing there is to do. */
  await waitText(other.page, ".cm-board-turn", /turn 2/i, 20000);
  const drawButton = other.page.locator(".cm-stage-actions [data-action=board-draw]:not([disabled])");
  await drawButton.waitFor({timeout: 20000});
  const otherViews = views(other === rob ? ROB : MAYA), otherSeat = otherViews.at(-1).seat;
  /* Read afresh each time: `views` is a copy of the frames so far. */
  const handNow = () => views(other === rob ? ROB : MAYA).at(-1).state.players[otherSeat].zones.Hand.count, handBefore = handNow();
  ok((await drawButton.innerText()).trim() === "Draw card" && otherViews.at(-1).decision && otherViews.at(-1).decision.kind === "draw"
    && otherViews.at(-1).state.phase === "DRAW" && await active.page.locator("[data-action=board-draw]").count() === 0,
    "turn 2's draw step waits for its player: their button reads Draw card, and the other board has nothing to draw");
  await shot(other.page, "draw-card-" + (other === rob ? "1400" : "1280"));
  const library = other.page.locator("button.cm-bcard[data-action=board-draw]");
  ok(await library.count() === 1 && /^Draw card: your library, \d+$/.test(await library.getAttribute("aria-label")),
    `and their library is the same button, lit ("${await library.getAttribute("aria-label")}")`);
  await library.scrollIntoViewIfNeeded();
  const reach = await library.evaluate((el) => {const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y); return {x, y, reached: !!hit && el.contains(hit)};});
  ok(reach.reached, `which a pointer reaches where it is drawn (${Math.round(reach.x)}, ${Math.round(reach.y)})`);
  await other.page.mouse.click(reach.x, reach.y);
  /* and the pointer taken off the board, or the hand fanned later opens with its last card under it, hovered upright */
  await other.page.mouse.move(1, 1);
  await waitPhase(other.page, /^\s*Main 1\s*$/, 20000);
  await other.page.waitForFunction(() => !document.querySelector("[data-action=board-draw]"), null, {timeout: 10000}).catch(() => {});
  ok(handNow() === handBefore + 1 && await other.page.locator("[data-action=board-draw]").count() === 0,
    `one click on the library draws one card (${handBefore} → ${handNow()}), and the board is on to Main 1`);
  ok(/^turn 2$/i.test((await text(other.page, ".cm-board-turn")).trim()) && /^You/.test(await turnWho(other.page)) && /; your 1st turn$/.test(await other.page.locator(".cm-board-turn").getAttribute("title")), `the game's turn 2 is the other player's first: "${(await text(other.page, ".cm-board-turn")).trim()}"`);
  ok(await heard(other === rob ? ROB : MAYA, "sfx/sfx_event_draw.mp3"), "and the draw is heard");
  /* Both boards follow into turn 2, and the room asked only where there was something to do (items 10 and 11). */
  await waitText(rob.page, ".cm-board-turn", /turn 2/i);
  await waitText(maya.page, ".cm-board-turn", /turn 2/i);
  const askedIn = new Set([...views(ROB), ...views(MAYA)].filter((v) => v.decision && v.state.turn >= 1 && v.state.turn <= 2).map((v) => v.state.phase));
  ok(["DRAW", "MAIN1", "MAIN2", "END_OF_TURN"].every((p) => askedIn.has(p)) && [...askedIn].every((p) => ["DRAW", "MAIN1", "MAIN2", "END_OF_TURN"].includes(p)),
    `Next step walks the steps into turn 2, on both boards, and the room asked someone only where there was something to do, for Draw card, and at the end of their own turn (${[...askedIn].join(", ")}); the rest passed by themselves`);
  /* X8c, HOLD PRIORITY / YIELD: at the turn's end the switch puts itself away, and on the next player's turn the same
     switch is Yield this turn; Tools says what it does, and that until then you hold priority. */
  ok((await text(active.page, "[data-action=board-skip]")).trim() === "Yield this turn", "at the turn's end Skip to end puts itself away, and on the next player's turn it is Yield this turn");
  ok((await text(other.page, "[data-action=board-skip]")).trim() === "Skip to end", "while on that player's own board it is still Skip to end");
  await utility(active.page,"board-tools","gameplay");
  const yieldHelp = await text(active.page, "#cm-board-tools .cm-board-yield-help");
  ok(new RegExp(`Yield this turn passes all your priority for the rest of ${active === rob ? "Maya" : "Rob"}'s turn`).test(yieldHelp) && /required decisions/.test(yieldHelp) && /after the room acknowledges/.test(yieldHelp),
    `Tools explains room Yield, required decisions, and acknowledged cancellation ("${yieldHelp.trim().slice(0, 90)}…")`);
  await active.page.click("#cm-dialog .cm-dialog-close");
  /* ROB-28: cross the real GameTable socket seam, not only the controlled
     acknowledgment fixture. The other person still owns this main-phase choice. */
  const yieldingEmail = active === rob ? ROB : MAYA, peerEmail = other === rob ? ROB : MAYA;
  await active.page.locator(".cm-stage-actions [data-action=board-skip]").click();
  await waitText(active.page, ".cm-stage-actions [data-action=board-skip]", /Stop yielding/, 10000);
  eq(views(yieldingEmail).at(-1).yielding, true, "the real room acknowledges Yield from the board");
  ok(!views(peerEmail).at(-1).yielding, "the other person's view does not disclose the yield policy");
  await active.page.locator(".cm-stage-actions [data-action=board-skip]").click();
  await waitText(active.page, ".cm-stage-actions [data-action=board-skip]", /Yield this turn/, 10000);
  eq(sent[yieldingEmail].map(f => JSON.parse(f)).filter(f => f.type === "yield"), [{type:"yield",on:true},{type:"yield",on:false}],
    "Start and Stop reach the real room as explicit policy frames");
  eq(await rob.page.locator(".cm-stage-top .cm-board-ribbon li.is-now").count() + await maya.page.locator(".cm-stage-top .cm-board-ribbon li.is-now").count(), 2, "the step ribbon in each strip lights exactly one step, on every turn");

  /* CARD SIZE: the app's slider, in Tools; ⌘/Ctrl − steps it. */
  const handWidth = (page) => page.evaluate(() => document.querySelector(".cm-stage-fan .cm-bcard").getBoundingClientRect().width);
  const w100 = await handWidth(rob.page);
  await utility(rob.page,"board-tools","video");
  ok(/60% – 160%/.test(await text(rob.page, "#cm-board-tools .cm-board-size")), "Tools carries the card-size slider, 60% to 160%");
  /* B8: Tools › Sound, the pack's three settings: the effects and the music as sliders, and a mute, remembered. */
  await settingsSection(rob.page, "audio");
  eq(await rob.page.locator("#cm-board-tools [data-board-sound]").evaluateAll((els) => els.map((el) => [el.dataset.boardSound, el.min, el.max, el.value])), [["sfx", "0", "100", "50"], ["bgm", "0", "100", "18"]], "Tools › Sound: Effects at 50% and Music at 18%, each a slider from 0 to 100%");
  await rob.page.locator("#cm-board-tools [data-board-sound=sfx]").fill("30");
  await rob.page.click("#cm-board-tools [data-action=board-mute]");
  const soundKept = await rob.page.evaluate(() => [localStorage.getItem("crankmagic-audio-sfx"), localStorage.getItem("crankmagic-audio-muted")]);
  ok(soundKept[0] === "0.3" && soundKept[1] === "true" && /turn on/.test(await text(rob.page, "#cm-board-tools [data-action=board-mute]")), `moving Effects and pressing Mute are remembered on the device (${soundKept.join(", ")})`);
  await rob.page.click("#cm-board-tools [data-action=board-mute]");
  await rob.page.locator("#cm-board-tools [data-board-sound=sfx]").fill("50");
  await settingsSection(rob.page, "video");
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("140");
  const w140 = await handWidth(rob.page);
  ok(Math.abs(w140 / w100 - 1.4) < 0.02, `the slider sizes the hand's cards as it moves (${w100.toFixed(0)}px → ${w140.toFixed(0)}px at 140%)`);
  await rob.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await rob.page.keyboard.press("Control+Minus");
  const w130 = await handWidth(rob.page);
  ok(Math.abs(w130 / w100 - 1.3) < 0.02, `and Ctrl − steps it down by ten (${w130.toFixed(0)}px at 130%)`);
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("100");
  /* The accessibility pass: Escape closes Tools, as it closes every menu on the board. */
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-board-tools").waitFor({state: "detached", timeout: 5000});
  ok(true, "Escape closes Tools");

  /* CARD ZOOM: held under the pointer, a card shows large; a right click opens it with what it can do. */
  const robCard = rob.page.locator(".cm-stage-fan .cm-bcard").first(), robCardName = (await robCard.getAttribute("aria-label")).split(/[,:]/)[0];
  await rail(rob.page, false);
  /* the refused answer's notice, still up from above, lies over the foot of the hand until it is dismissed */
  if (await rob.page.locator("#cm-notice button").count()) await rob.page.locator("#cm-notice button").first().click();
  await robCard.hover();
  await rob.page.locator("#cm-board-peek .cm-bcard").waitFor({timeout: 5000});
  const peekWidth = await rob.page.evaluate(() => document.querySelector("#cm-board-peek .cm-bcard").getBoundingClientRect().width);
  const peekBox = await rob.page.evaluate(() => {const r = document.querySelector("#cm-board-peek .cm-bcard").getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), innerWidth / 2, innerHeight / 2];});
  ok(Math.round(peekWidth) === 320 && Math.abs(peekBox[0] - peekBox[2]) < 2 && (await rob.page.locator('#cm-board-peek .cm-bcard').getAttribute('aria-label')).includes(robCardName) && Math.abs(peekBox[1] - peekBox[3]) < 2, `a card under the pointer shows large at the center of the screen, 320px (the pop-up is 20% smaller since 2026-10-28) (${robCardName})`);
  /* The accessibility pass: the pop-up is said as well as shown, by the board's one polite status region beside the board
     (tests/a11y-board.mjs), its picture not read twice. */
  const peekSaid = await rob.page.evaluate(() => {const p = document.getElementById("cm-board-peek"), s = document.getElementById("cm-board-said"); return {hidden: p.getAttribute("aria-hidden"), role: s && s.getAttribute("role"), live: s && s.getAttribute("aria-live"), said: s ? s.textContent : "", beside: !!s && !s.closest("#cm-board")};});
  ok(peekSaid.hidden === "true" && peekSaid.role === "status" && peekSaid.live === "polite" && peekSaid.said === `Showing ${robCardName}` && peekSaid.beside, `and a screen reader is told: "${peekSaid.said}", politely, the picture itself hidden from it (${JSON.stringify(peekSaid)})`);
  await rob.page.mouse.move(5, 5);
  await rob.page.locator("#cm-board-peek").waitFor({state: "detached", timeout: 5000});
  /* Rob, 2026-10-09: ending the game left a card shown large, "I couldn't click off of it" -- the board redrawn under a
     still pointer, the card never left. Now a press anywhere puts it away, Escape does, and a redraw that leaves no such
     card under the pointer does. */
  await robCard.hover();
  await rob.page.locator("#cm-board-peek .cm-bcard").waitFor({timeout: 5000});
  await rob.page.dispatchEvent(".cm-stage-top", "pointerdown", {bubbles: true});
  await rob.page.locator("#cm-board-peek").waitFor({state: "detached", timeout: 2000});
  ok(true, "a press anywhere puts the card shown large away, the pointer never having left the card");
  await rob.page.mouse.move(5, 5);
  await robCard.hover();
  await rob.page.locator("#cm-board-peek .cm-bcard").waitFor({timeout: 5000});
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-board-peek").waitFor({state: "detached", timeout: 2000});
  ok(true, "and so does Escape");
  await rob.page.mouse.move(5, 5);
  await rob.page.waitForTimeout(400);
  /* The card gone from under the still pointer while it waits to be shown large -- the hand taken off the page, as a
     redraw does -- is never shown: nothing of it is under the pointer. */
  await robCard.hover();
  await rob.page.evaluate(() => document.querySelector("#cm-board .cm-stage-hand").remove());
  await rob.page.waitForTimeout(700);
  eq(await rob.page.locator("#cm-board-peek").count(), 0, "and a card taken from under the still pointer before it is shown large is never shown: nothing waits to be clicked off");
  await rob.page.click('[data-action=board-camera]');
  await rob.page.focus(".cm-stage-camera [data-action=board-view][data-view=table]");
  await rob.page.keyboard.press("Enter");
  await rob.page.locator(".cm-stage-slot .cm-seatboard").nth(1).waitFor();
  await rob.page.mouse.move(5, 5);
  await chooseView(rob.page,"focus");
  await rob.page.locator(".cm-board-mat").waitFor();
  await robCard.click({button: "right"});
  await rob.page.locator("#cm-card-menu [data-action=board-card-menu-view]").click();
  await rob.page.locator("#cm-card-inspector").waitFor();
  ok((await text(rob.page, "#cm-card-inspector")).includes(robCardName), "a right click opens the card's menu, and its 🔍 pins read-only inspection");
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-dialog[open]").waitFor({state: "detached"}).catch(() => {});
  await rob.page.evaluate(() => {
    const el = document.querySelector(".cm-stage-fan .cm-bcard"), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", {pointerType: "touch", bubbles: true, clientX: r.left + 10, clientY: r.top + 10}));
  });
  await rob.page.locator("#cm-card-inspector").waitFor({timeout: 3000});
  ok(true, "a long press pins read-only inspection, on a touch screen");
  await rob.page.keyboard.press("Escape");

  /* SHOW HAND: turn 2's player reaches main 1 and plays a land from the fanned hand, by its number and Enter. */
  const second = other, secondLand = second === rob ? "Forest" : "Island", secondSeat = second === rob ? 0 : 1;
  for (let i = 0; i < 30 && !(await second.page.locator(".cm-stage-fan .cm-bcard.is-bright").count()); i += 1) {
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
  /* the stage's hand shows a window of the hand (seven cards, with arrows to cycle); Space fans all of it, as many as its label says */
  const handCount = Number((/·\s*(\d+)/.exec(await text(second.page, ".cm-stage-hand-label")) || [])[1]);
  ok(/Your hand · \d+/.test(await text(second.page, ".cm-hand-show h2")) && fanned === handCount, `Space fans the hand over the dimmed board (${fanned} cards)`);
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
  await bindSelection(second.page);
  await lookAt(second.page, secondSeat);
  await waitLands(second.page, 1);
  ok(await second.page.locator('.cm-board-lands').getByRole('button',{name:new RegExp(`^${secondLand}(?:,|:|$)`)}).count()>0, "Enter plays it: the hand is put away and the land is down");
  for (let i = 0; i < 3; i += 1) await second.page.keyboard.press("Control+Minus");
  /* B1, item 17: the Panel reads a tapped card upright, with a small Tapped mark, and no "Card" heading over it. */
  await rail(second.page, true);
  await second.page.locator(".cm-stage-rail [data-action=board-choose]", {hasText: "Tap for mana"}).first().click();
  await bindSelection(second.page);
  await second.page.locator(".cm-board-mat .cm-board-lands .cm-bcard.is-tapped").first().waitFor({timeout: 10000});
  /* The accessibility pass: a tapped card says so. */
  const tappedSaid = await second.page.locator(".cm-board-mat .cm-board-lands .cm-bcard.is-tapped").first().getAttribute("aria-label");
  ok(/^(Forest|Island), tapped/.test(tappedSaid), `a tapped land says so: "${tappedSaid}"`);
  /* B6: the mana in the pool, the creatures in hand are castable now, and the lit cards say so. */
  await second.page.locator(".cm-stage-fan .cm-bcard.is-bright").first().waitFor({timeout: 10000});
  const tray2 = await trayOf(second.page, secondSeat, second === rob ? ROB : MAYA);
  ok(/^([1-9])\/\1$/.test(tray2.want.Creature) && /^0\//.test(tray2.want.Land),
    `with mana in the pool the lit cards read Creature ${tray2.want.Creature}, and the land drop spent reads Land ${tray2.want.Land}`);

  /* A spell on the stack: the room first preserves its bounded Undo window. Explicitly passing it
     ends that window and gives the other board its actual response opportunity and named Resolve. */
  const toCast = second.page.locator(".cm-stage-fan .cm-bcard.is-bright").first(), castName = (await toCast.getAttribute("aria-label")).split(/[,:]/)[0];
  const secondEmail = second === rob ? ROB : MAYA, casterSeen = views(secondEmail).length;
  await useCardOffer(second.page, toCast, "cast");
  const firstBoard = second === rob ? maya : rob;
  for (let i = 0; i < 100 && !views(secondEmail).at(-1).decision?.options.some(o => o.act === 'undo-play'); i += 1) await second.page.waitForTimeout(50);
  const afterCast = views(secondEmail).at(-1);
  ok(afterCast.state.stack.length === 1 && afterCast.decision?.options.some(o => o.act === 'undo-play'), 'the caster receives the server-authorized Undo window while the spell is on the stack');
  await second.page.locator('.cm-stage-actions [data-action=board-pass]:not([disabled])').click();
  await waitText(firstBoard.page, ".cm-stage-actions [data-action=board-pass]", new RegExp(`Resolve ${castName}`));
  const secondName = second === rob ? "Rob" : "Maya", firstName_ = second === rob ? "Maya" : "Rob";
  await waitText(second.page, ".cm-board-waiting", new RegExp(`Waiting on ${firstName_}`), 10000);
  ok(views(secondEmail).slice(casterSeen).some(v=>v.decision?.options.some(o=>o.act==='undo-play'))&&!views(secondEmail).at(-1).decision?.options.some(o=>o.act==='undo-play'),
    `the acknowledged pass closes the caster's Undo window before the opponent resolves ${castName}`);
  eq((await stripSays(firstBoard.page)), `${secondName}'s first main phase · you may respond`, `on the other board the button reads Resolve ${castName}, and the strip says whose step it is and that they may respond`);
  /* All desktop views use the same inspectable stack pile and ordered list. Browsing it never sends a game action. */
  if(!await firstBoard.page.locator('.cm-stage-side.is-open').count()) await firstBoard.page.locator('.cm-stage-right').click();
  const stackCard=firstBoard.page.locator('.cm-module-stack .cm-stack-card[data-stack-depth="0"]');
  await stackCard.waitFor();
  eq((await stackCard.locator('.cm-bcard-name').innerText()).trim(),castName,'the stack shows the actual spell while it resolves');
  const summary=firstBoard.page.locator('.cm-stack-summary').first(),pile=firstBoard.page.locator('.cm-stack-pile');
  const revBeforeBrowse=views(firstBoard===rob?ROB:MAYA).at(-1).revision;
  await summary.click();await summary.focus();await firstBoard.page.keyboard.press('Enter');
  ok((await pile.getAttribute('aria-label')).startsWith(castName+', stack position 1'),'pointer and keyboard browsing identify the selected spell');
  eq(views(firstBoard===rob?ROB:MAYA).at(-1).revision,revBeforeBrowse,'browsing the stack never changes the game');
  const picture=await stackCard.boundingBox();ok(picture.width>=150&&picture.height>picture.width,'the stack picture remains readable and upright');
  await firstBoard.page.locator('.cm-stage-right[data-action=board-stage-side]').click();
  eq(await firstBoard.page.locator('.cm-stage-side.is-open').count(),0,'the native Stack tab puts the stack drawer away');
  /* The caster view has also acknowledged the pass before its Undo offer is inspected above. */
  ok(true, "and the caster's strip says who the table waits on");
  await shot(firstBoard.page, "resolve-" + (firstBoard === rob ? "1400" : "1280"));
  await chooseView(firstBoard.page,"full");
  await firstBoard.page.locator('.cm-stage-region[data-renderer="webgl"]').waitFor();
  /* In Full screen the pass stands large over the table, not in the strip (Rob's fullscreen notes, Oct 21). */
  await firstBoard.page.click('.cm-stage-actions [data-action=board-pass]');
  await waitText(second.page, ".cm-board-mat .cm-board-field", new RegExp(castName));
  ok(true, "the tabletop resolves a spell through the real room and the other browser receives its permanent");
  await fullTools(firstBoard.page);
  await chooseView(firstBoard.page,"focus");
  ok(true, `and it resolves: ${castName} is on the battlefield`);
  ok(await heard(ROB, "sfx/sfx_cast_creature.mp3") && await heard(MAYA, "sfx/sfx_cast_creature.mp3"), "the creature cast is heard at both boards, as a creature summoned");
  /* THE PANEL, a tapped land in it -- here, once its mana is spent on the creature: a land just tapped, its mana unspent,
     untaps on a click (room.mjs, untapMana), and this one is only shown. */
  await utility(second.page,'board-tools','general');
  await second.page.locator('[data-action=board-modules-settings]').click();
  await second.page.getByRole('radio',{name:'Resources: Right',exact:true}).check();
  await second.page.getByRole('button',{name:'Save drawer modules',exact:true}).click();
  /* (arranging the drawers' modules may change how much room the boards keep clear of them; opening a drawer must not) */
  await second.page.waitForTimeout(300);
  if(await second.page.locator('.cm-stage-side.is-open').count()) await second.page.locator('.cm-stage-right').click();
  await second.page.locator('.cm-stage-side.is-open').waitFor({state:'detached'});
  const beforeDrawer=await second.page.locator('.cm-board-mat').boundingBox();
  await second.page.locator('.cm-stage-right').click();
  await second.page.locator('.cm-stage-side.is-open').waitFor();
  eq(await second.page.locator('.cm-board-mat').boundingBox(),beforeDrawer,'the Stack drawer overlays without changing the mat before standalone inspection opens');
  const inspectedRevision = views(secondEmail).at(-1).revision, inspectedSends = sent[secondEmail].length;
  await second.page.locator('.cm-board-mat .cm-board-lands .cm-bcard.is-tapped').first().click();
  await second.page.locator('#cm-card-menu [data-action=board-card-menu-view]').click();
  await second.page.locator('#cm-card-inspector .cm-bcard').waitFor();
  const resources = await second.page.evaluate(() => {
    const lands = [...document.querySelectorAll(".cm-board-mat .cm-board-lands .cm-bcard[data-card]")], up = lands.filter((c) => !c.classList.contains("is-tapped")).length;
    const row = document.querySelector(".cm-stage-module[data-module=resources] .cm-res-list[aria-label='Your lands by name'] li"), types = [...document.querySelectorAll(".cm-stage-module[data-module=resources] .cm-res-list[aria-label='Your hand by type'] li")].map((li) => li.textContent.replace(/\s+/g, " ").trim());
    const hand = document.querySelectorAll(".cm-stage-fan .cm-bcard[data-card]").length, inHand = types.reduce((n, t) => n + Number(t.split("/").pop()), 0);
    return {row: row ? `${row.querySelector("span").textContent.trim()} ${row.querySelector("b").textContent.trim()}` : "", up, all: lands.length, types, hand, inHand, label: document.querySelector(".cm-stage-module[data-module=resources]").getAttribute("aria-label")};});
  ok(resources.row === `${secondLand} ${resources.up}/${resources.all}` && resources.inHand === resources.hand && resources.types[0].startsWith("Land"),
    `Turn Resources lists the lands by name as the mat has them (${resources.row}) and the hand by type adding up to the hand (${resources.inHand} of ${resources.hand}: ${resources.types.join(", ")})`);
  const panelCard = await second.page.evaluate(() => {
    const el = document.querySelector("#cm-card-inspector .cm-bcard"), r = el.getBoundingClientRect(), onMat = document.querySelector(".cm-board-mat .cm-board-lands .cm-bcard.is-tapped");
    return {transform: getComputedStyle(el).transform, tall: r.height > r.width, mark: ((el.querySelector(".cm-bcard-mark.is-state") || {}).textContent || "").trim(), label: el.getAttribute("aria-label"),
      heading: [...document.querySelectorAll("#cm-card-inspector h3")].map((h) => h.textContent.trim()), matTurned: getComputedStyle(onMat).transform !== "none"};
  });
  ok(panelCard.tall && panelCard.transform === "none" && panelCard.mark === "Tapped" && /tapped/.test(panelCard.label) && panelCard.matTurned, `Read shows the tapped ${secondLand} upright with a small Tapped mark, while it lies turned on the mat`);
  ok(!panelCard.heading.includes("Card"), `and no "Card" heading over it (${panelCard.heading.join(", ")})`);
  eq([views(secondEmail).at(-1).revision, sent[secondEmail].length], [inspectedRevision, inspectedSends], 'reading the spent tapped land neither sends an action nor changes the game');
  await shot(second.page, "panel-tapped-" + (second === rob ? "1400" : "1280"));
  await second.page.locator('#cm-card-inspector [data-action=board-inspect-close]').click();
  await second.page.locator('.cm-stage-right').click();
  await second.page.locator('.cm-stage-side').waitFor({state:'hidden'});
  /* B5, items 10 and 12: ANOTHER PLAYER'S TURN. Rob plays a land on turn 3, which gives him the two mana for an instant;
     on Maya's turn 4 he may respond in her upkeep, his button reads Pass, and his strip says whose step it is. */
  for (let i = 0; i < 80 && !/turn 4/i.test(await text(rob.page, ".cm-board-turn")); i += 1) {
    let acted = false;
    for (const who of [rob, maya]) {
      const draw = who.page.locator(".cm-stage-actions [data-action=board-draw]:not([disabled])");
      if (await draw.count()) {await draw.click(); await who.page.waitForTimeout(250); acted = true; continue;}
      const forest = who.page.locator(".cm-stage-fan .cm-bcard.is-bright", {hasText: "Forest"}).first();
      if (who === rob && await forest.count()) {await useCardOffer(who.page, forest, "play-land"); await who.page.waitForTimeout(250); acted = true; continue;}
      const pass = who.page.locator(".cm-stage-actions [data-action=board-pass]:not([disabled])");
      if (await pass.count()) {await pass.click(); await who.page.waitForTimeout(200); acted = true;}
    }
    if (!acted) await rob.page.waitForTimeout(250);
  }
  await rob.page.locator(".cm-stage-actions [data-action=board-pass]:not([disabled])").waitFor({timeout: 20000});
  const theirTurn = {turn: `${(await text(rob.page, ".cm-board-turn")).trim()} · ${await turnWho(rob.page)}`, label: (await text(rob.page, ".cm-stage-actions [data-action=board-pass]")).trim(), says: (await stripSays(rob.page))};
  ok(/^turn 4 · Maya/i.test(theirTurn.turn) && theirTurn.label === "Pass" && /^Maya's upkeep · you may respond$/.test(theirTurn.says),
    `on another player's turn, with the stack empty and an instant he can pay for, Rob's button reads Pass, and the strip says "${theirTurn.says}"`);
  await shot(rob.page, "their-turn-1400");
  ok(await heard(ROB, "sfx/sfx_event_your_turn.mp3"), "and Rob's own turn 3 was announced to him as his turn");
  /* WHOSE TURN IT IS, on that seat's card in Focus's side pane (Rob, 2026-10-09: "Icon on the Card in the left or right
     side pane"): Maya's tile ringed and marked, and only hers. */
  const tileTurn = await rob.page.evaluate(() => [...document.querySelectorAll(".cm-board-pane .cm-board-tile.is-turn .cm-seat-header.is-turn")].map((m) => ({seat: m.closest(".cm-board-tile").dataset.seat, said: m.querySelector(".cm-seat-state").textContent, ringed: getComputedStyle(m.querySelector(".cm-seat-portrait")).boxShadow !== "none"})));
  eq(tileTurn, [{seat: "1", said: "Maya's turn", ringed: true}], `in Focus, Maya's tile in the side pane is marked as hers to play, and no other (${JSON.stringify(tileTurn)})`);
  /* STOP AT EVERY STEP OF MY TURN (Settings; Rob, 2026-10-11): kept with the preferences, and told to the room by the board.
     A room that does not take it (here, made to refuse: the AI seats playing on would) is not a notice, and the board does
     not say it again at the same point of the game -- else each refusal's view would send it again, for good -- but once
     the game moves on. */
  const prefersSent = () => sent[ROB].map((m) => JSON.parse(m)).filter((f) => f.type === "prefer");
  const prefers0 = prefersSent().length, robRoom = object.room, robPrefer = robRoom.prefer;
  robRoom.prefer = async () => {throw new RoomError(409, "The AI players are still taking their turns. Your way of playing can be changed once they stop.");};
  await rob.page.evaluate(() => __cm.commit({type: "preferences", values: {play: {stepByStep: true}}}, {renderView: false}));
  for (let i = 0; i < 3; i += 1) {await serial(async () => object.broadcast()); await rob.page.waitForTimeout(300);}
  eq([prefersSent().slice(prefers0).length, views(ROB).at(-1).stepByStep ?? false, /way of playing/.test(await text(rob.page, "#cm-notice"))], [1, false, false],
    "a way of playing the room refuses is sent once at that point of the game, and said nowhere");
  robRoom.prefer = robPrefer;
  /* HOLD PRIORITY AFTER I CAST (Tools): holding stays the caster's choice (CR 117.3c), kept on this device and sent with
     the cast. Rob passes Maya's upkeep, and she says Draw card in her draw step; in her main phase she turns it on and casts a creature: she is asked again first,
     Resolve and its name, and then Rob, who holds an instant, may respond. */
  const holdCast = maya.page.locator(".cm-stage-fan .cm-bcard.is-bright[aria-label*='Cast']").first();
  for (let i = 0; i < 40 && !(await holdCast.count()); i += 1) {
    const robPass = rob.page.locator(".cm-stage-actions [data-action=board-pass]:not([disabled])");
    if (await robPass.count()) await robPass.click();
    const mayaDraw = maya.page.locator(".cm-stage-actions [data-action=board-draw]:not([disabled])");
    if (await mayaDraw.count()) await mayaDraw.click();
    await rob.page.waitForTimeout(250);
  }
  await holdCast.waitFor({timeout: 20000});
  const heldName = (await holdCast.getAttribute("aria-label")).split(/[,:]/)[0];
  await utility(maya.page,"board-tools","gameplay");
  await maya.page.check("#cm-board-tools [data-board-hold]");
  /* The choice says itself, with no paragraph explaining it (Rob, Oct 21: "We don't want to directly state everything as
     written out instruction to end users"). */
  await maya.page.locator("#cm-board-tools [data-board-hold]:checked").waitFor({timeout: 5000});
  await maya.page.click("#cm-dialog [data-action=board-settings-save]");
  eq(await maya.page.evaluate(() => localStorage.getItem("cm-board-hold")), "on", "Tools' Hold priority after I cast is kept on the device once saved");
  const sentBefore = sent[MAYA].length;
  await useCardOffer(maya.page, maya.page.locator(".cm-stage-fan .cm-bcard.is-bright[aria-label*='Cast']").first(), "cast");
  await waitText(maya.page, ".cm-stage-actions [data-action=board-pass]", new RegExp(`Resolve ${heldName}`));
  const castFrame = sent[MAYA].slice(sentBefore).map((m) => JSON.parse(m)).find((f) => f.type === "act");
  ok(castFrame && castFrame.hold === true, `with it on, Maya's cast of ${heldName} says hold, and she is asked again before anyone: Resolve ${heldName}`);
  await maya.page.click(".cm-stage-actions [data-action=board-pass]");
  await waitText(rob.page, ".cm-stage-actions [data-action=board-pass]", new RegExp(`Resolve ${heldName}`));
  await rob.page.click(".cm-stage-actions [data-action=board-pass]");
  await waitText(maya.page, ".cm-board-mat .cm-board-field", new RegExp(heldName));
  ok(true, `then Rob may respond, passes, and ${heldName} resolves onto her battlefield`);
  await maya.page.evaluate(() => localStorage.removeItem("cm-board-hold"));
  for (let i = 0; i < 40 && !views(ROB).at(-1).stepByStep; i += 1) await rob.page.waitForTimeout(100);
  eq([prefersSent().slice(prefers0).map((f) => f.stepByStep), views(ROB).at(-1).stepByStep], [[true, true], true],
    "once the game moved on, it was told again, once, and Rob's view says it back");
  ok(!views(MAYA).at(-1).stepByStep, "and it is his alone: Maya's view does not carry it");
  await rob.page.evaluate(() => __cm.commit({type: "preferences", values: {play: {stepByStep: false}}}, {renderView: false}));
  await serial(async () => object.broadcast());
  for (let i = 0; i < 40 && views(ROB).at(-1).stepByStep; i += 1) await rob.page.waitForTimeout(100);
  await serial(async () => object.broadcast());
  await rob.page.waitForTimeout(300);
  eq([prefersSent().slice(prefers0).map((f) => f.stepByStep), views(ROB).at(-1).stepByStep ?? false], [[true, true, false], false], "turned off, the same: told once, and the view says it is off");

  /* Crowded lands keep base slots and neighbor positions unchanged when cards tap 30 degrees; corners may overlap. */
  await lookAt(rob.page, 0);
  const crowded=await rob.page.evaluate(()=>{
    // Settle the responsive mode before adding layout-only copies, then measure in one task.
    dispatchEvent(new Event('resize'));
    const source=document.querySelector('.cm-board-mat .cm-board-lands .cm-board-cards'),first=source.querySelector('.cm-bcard');
    const copies=[];for(let i=0;i<29;i++){const c=first.cloneNode(true);c.classList.add('is-copy');c.classList.remove('is-tapped');c.style.setProperty('transition','none','important');source.append(c);copies.push(c);}
    dispatchEvent(new Event('resize'));
    const row=document.querySelector('.cm-board-mat .cm-board-lands .cm-board-cards'),kids=[...row.children],slots=()=>kids.map(c=>[c.offsetLeft,c.offsetTop,c.offsetWidth,c.offsetHeight]),before=slots();
    copies.forEach((c,i)=>{if(i%2===1)c.classList.add('is-tapped');});dispatchEvent(new Event('resize'));
    const stable=JSON.stringify(before)===JSON.stringify(slots());row.scrollTop=row.scrollHeight;
    const raster=el=>{const parent=el.offsetParent,p=parent.getBoundingClientRect(),top=p.top+parent.clientTop+el.offsetTop-parent.scrollTop,left=p.left+parent.clientLeft+el.offsetLeft-parent.scrollLeft;return {top,left,bottom:top+el.offsetHeight,right:left+el.offsetWidth};};
    const r=row.getBoundingClientRect(),last=kids.at(-1).getBoundingClientRect(),tap=copies.find(c=>c.classList.contains('is-tapped'));
    const matrix=new DOMMatrixReadOnly(getComputedStyle(tap).transform);
    return {rowTop:r.top,rowBottom:r.bottom,lastTop:last.top,lastBottom:last.bottom,scrollTop:row.scrollTop,rows:new Set(kids.map(c=>c.offsetTop)).size,overflow:getComputedStyle(row).overflowY,scrolls:row.scrollHeight>row.clientHeight+1,
      lastSeen:last.bottom<=r.bottom+1&&last.top>=r.top-1,
      stable,cut:kids.some(c=>{const b=raster(c);return b.left<r.left-1||b.right>r.right+1;}),angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI};
  });
  ok(crowded.rows>1,'crowded lands form multiple whole-card rows');
  ok(crowded.stable&&!crowded.cut,'tapping preserves exact slots, neighbor positions and unrotated raster fit; rotated corners may overlap');
  ok(Math.abs(crowded.angle-30)<.1,'tapped cards rotate 30 degrees');
  ok(crowded.overflow==='auto'&&crowded.scrolls&&crowded.lastSeen,`the final crowded land is fully reachable: ${JSON.stringify(crowded)}`);
  await serial(async () => object.broadcast());
  await rob.page.waitForFunction(() => !document.querySelector(".cm-board-lands .is-copy"), null, {timeout: 10000});

  /* SHAPE, at both widths. */
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    await stageSettled(who.page);
    /* The hand is fixed over the foot of the window and the stage scrolls under it when the board (at least 560px wide in Focus) is taller than the room above the
       hand: so "under the board" is read at the end of the scroll, where the board has come up clear of the hand. */
    await who.page.evaluate(() => {const h = document.getElementById("cm-board"); h.scrollTop = h.scrollHeight;});
    await who.page.waitForTimeout(250);
    const g = await who.page.evaluate(() => {
      const strip = document.querySelector(".cm-stage-top").getBoundingClientRect();
      /* a card's own shape: its layout box (the hand's cards are fanned, turned, so their drawn outline is not 5:7) */
      const ratio = (el) => {const c = getComputedStyle(el); return parseFloat(c.width) / parseFloat(c.height);};   /* computed, so not rounded to whole pixels: a 16px card would read 0.727 */
      const mat = [...document.querySelectorAll(".cm-board-mat .cm-bcard:not(.is-tapped)")], hand = [...document.querySelectorAll(".cm-stage-fan .cm-bcard")];
      const board = document.querySelector(".cm-board-mat").getBoundingClientRect(), region = document.querySelector(".cm-stage-region").getBoundingClientRect();
      const tray = document.querySelector(".cm-stage-hand").getBoundingClientRect(), lands = document.querySelector(".cm-board-mat .cm-board-lands").getBoundingClientRect();
      const groups=[...document.querySelector(".cm-stage-top").children].filter(e=>e.offsetWidth&&e.offsetHeight&&getComputedStyle(e).position!=="absolute").map(e=>{const r=e.getBoundingClientRect();return r.y+r.height/2;});
      return {oneRow:Math.max(...groups)-Math.min(...groups)<2,strip: Math.round(strip.height), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ratios: [...mat, ...hand].map(ratio).map((x) => Math.round(x * 1000) / 1000),
        matWidth: mat.length ? parseFloat(getComputedStyle(mat[0]).width) : 0, handWidth: hand.length ? parseFloat(getComputedStyle(hand[0]).width) : 0,
        boardRatio: Math.round(board.width / board.height * 100) / 100,
        /* the hand's tray is the stage's whole width at the window's foot; its cards and label (the tray's own box reaches a little up behind them) lie under the board */
        docked: Math.min(...hand.map((c) => c.getBoundingClientRect().top), document.querySelector(".cm-stage-hand-label").getBoundingClientRect().top) >= board.bottom - 0.5 && tray.bottom <= innerHeight + 1 && tray.left === region.left && tray.width === region.width, clear: lands.bottom <= tray.top + 1};
    });
    await who.page.evaluate(() => {document.getElementById("cm-board").scrollTop = 0;});
    const focusRows=await who.page.evaluate(tableFacts);
    tableGeometryProof.push({...focusRows,proof:'Focus shape'});if(SHOTS)writeFileSync(path.join(SHOTS,'table-row-geometry.json'),JSON.stringify(tableGeometryProof,null,2));
    ok(g.oneRow&&g.strip>=58&&g.sideways===0, `at ${width} the HUD is one aligned measured row (${g.strip}px) and nothing scrolls sideways`);
    ok(focusRows.valid&&Math.abs(g.boardRatio - 16 / 9) < 0.02, `at ${width} Focus keeps the board looked at 16:9 (${g.boardRatio}), with its cards 5:7: ${JSON.stringify(focusRows.boards.map((x) => [Math.round(x.width), Math.round(x.height)]))}`);
    ok(focusRows.largest, `at ${width} the board looked at is the largest on the stage, the other seats behind it smaller (${Math.round(focusRows.boards[0].width)}px against ${JSON.stringify(focusRows.rears)})`);
    ok(g.docked && g.clear, `at ${width} the hand's tray is the stage's whole width along the window's foot and, the stage scrolled to its end, lies under the board with the Lands clear of it`);
    ok(g.ratios.length && g.ratios.every((r) => Math.abs(r - 5 / 7) < 0.01), `at ${width} every card is 5:7 (${[...new Set(g.ratios)].join(", ")})`);
    ok(g.handWidth > g.matWidth || !g.matWidth, `at ${width} the hand's cards are larger than the mat's (${g.handWidth} > ${g.matWidth})`);
  }

  /* THE HAND NEVER TAKES THE BOARD'S ROOM, in Focus too (Rob, 2026-10-09): Hand cards at its largest, the mat keeps its size and place and the hand's
     tray its own. (The hand used to run on below the window with the board scrolling down to it; the flat stage does not scroll, so the check is that
     the cards grow and nothing else of the stage moves.) */
  for (const v of ["focus"]) {
    const at = () => rob.page.evaluate(() => {const m = document.querySelector(".cm-board-mat").getBoundingClientRect(), t = document.querySelector(".cm-stage-hand").getBoundingClientRect(), c = [...document.querySelectorAll(".cm-stage-fan .cm-bcard")].map((el) => el.getBoundingClientRect());
      return {w: Math.round(m.width), h: Math.round(m.height), x: Math.round(m.x), y: Math.round(m.y), tray: [t.x, t.y, t.width, t.height].map(Math.round), card: c.length ? Math.round(c[0].width) : 0, left: Math.min(...c.map((r) => r.left)), right: Math.max(...c.map((r) => r.right))};});
    await rail(rob.page, false);
    await cameraIs(true);
    const before = await at();
    const hi = Number(await rob.page.locator(".cm-stage-camera [data-board-scale=hand]").getAttribute("max"));
    await rob.page.locator(".cm-stage-camera [data-board-scale=hand]").first().fill(String(hi));
    await rob.page.waitForTimeout(300);
    const big = await at();
    ok(big.card > before.card * 1.2 && big.w === before.w && big.h === before.h && big.x === before.x && big.y === before.y && big.tray[1] + big.tray[3] === before.tray[1] + before.tray[3] && big.tray[3] >= before.tray[3],   /* the hand is 3D's fan: its tray grows upward from the same foot, over the boards, never shrinking them */
      `Focus: Hand cards at ${hi}%, the hand's cards grow (${before.card} → ${big.card}px), the board keeps its size and place (${before.w}×${before.h} at ${before.x},${before.y} → ${big.w}×${big.h} at ${big.x},${big.y}) and the tray grows upward from its own foot`);
    await rob.page.evaluate(() => {localStorage.removeItem("cm-board-scale:hand");});
    await rob.page.locator(".cm-stage-camera [data-board-scale=hand]").first().fill(String(await rob.page.evaluate(() => Math.round(globalThis.__cm.cardScale()))));
    await cameraIs(false);
  }

  /* TURNS THAT WENT BY, put away by themselves (Rob, 2026-10-09: "I shouldn't have to acknowledge every stage"). Two
     players never let whole turns go by unseen, so Rob's board is handed his own last view as if two turns had: the note
     shows, goes by itself within seconds with nothing pressed, and the real view, handed back, is the board again. */
  {
    const lastFrame = JSON.parse(frames[ROB].filter((f) => JSON.parse(f).view).at(-1)), later = structuredClone(lastFrame);
    later.view.state.turn += 2;
    const carrier = routes[ROB].at(-1).ws;
    carrier.send(JSON.stringify(later));
    await rob.page.locator("section.cm-board-went").waitFor({timeout: 5000});
    const shownAt = Date.now();
    await rob.page.locator("section.cm-board-went").waitFor({state: "detached", timeout: 9000});
    const lasted = Date.now() - shownAt;
    ok(lasted > 3000 && lasted < 8000, `turns that went by are said, then put away by themselves after a few seconds, nothing pressed (${(lasted / 1000).toFixed(1)} s)`);
    carrier.send(JSON.stringify(lastFrame));
    await waitText(rob.page, ".cm-board-turn", new RegExp(`turn ${lastFrame.view.state.turn}$`, "i"));
  }

  /* THE ACCESSIBILITY PASS (docs/plan-to-done-2026-09-30.md Part 6). WORDS OVER ARTWORK: a mat can be any picture, so
     every word on one is read against the worst of them, plain white under everything the word sits on -- its own
     backing and every one between it and the mat, their opacity counted -- and must reach 4.5:1. */
  /* EVERY CARD SAYS ITS STATE: a creature its power and toughness. */
  const creatureSaid = await rob.page.evaluate(() => [...document.querySelectorAll("#cm-board .cm-bcard")].map((el) => el.getAttribute("aria-label")).find((l) => /, [0-9]+\/[0-9]+/.test(l || "")) || "");
  ok(/, [0-9]+\/[0-9]+/.test(creatureSaid), `a creature says its power and toughness: "${creatureSaid}"`);
  const overWhite = (page) => page.evaluate(() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 1;
    const cx = cv.getContext("2d", {willReadFrequently: true});
    const rgba = (css) => {cx.clearRect(0, 0, 1, 1); cx.fillStyle = "rgb(1, 2, 3)"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255];};
    const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
    const lum = (c) => {const [r, g, b] = c.map((v) => {v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;}); return 0.2126 * r + 0.7152 * g + 0.0722 * b;};
    const seen = [];
    for (const mat of document.querySelectorAll("#cm-board .cm-mat")) {
      for (const el of mat.querySelectorAll("*")) {
        if (el.closest(".cm-bcard, .cm-sr-only, svg") || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const r = el.getBoundingClientRect(), st = getComputedStyle(el);
        if (!r.width || !r.height || st.visibility === "hidden") continue;
        const chain = [];
        for (let n = el; n && n !== mat; n = n.parentElement) chain.push(n);
        const opacity = (i) => chain.slice(i).reduce((p, n) => p * Number(getComputedStyle(n).opacity), 1);
        let base = [255, 255, 255];
        for (let i = chain.length - 1; i >= 0; i -= 1) {const [r0, g0, b0, a0] = rgba(getComputedStyle(chain[i]).backgroundColor); base = over([r0, g0, b0, a0 * opacity(i)], base);}
        const [r1, g1, b1, a1] = rgba(st.color), ink = over([r1, g1, b1, a1 * opacity(0)], base);
        const L = [lum(ink), lum(base)].sort((x, y) => y - x);
        seen.push({text: el.textContent.trim().slice(0, 24), cls: String(el.className || el.tagName).slice(0, 30), ratio: Math.round((L[0] + 0.05) / (L[1] + 0.05) * 100) / 100});
      }
    }
    return seen.sort((x, y) => x.ratio - y.ratio);
  });
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    for (const v of ["focus", "table"]) {
      await chooseView(who.page,v);
      await who.page.locator(v === "table" ? ".cm-board-table" : ".cm-board-mat").waitFor();
      const words = await overWhite(who.page), low = words.filter((w) => w.ratio < 4.5), worst = (low.length ? low : words.slice(0, 3)).map((w) => `"${w.text}" (${w.cls}) ${w.ratio}`).join(", ");
      ok(words.length >= 6 && words[0].ratio >= 4.5, `at ${width}, ${v === "table" ? "Table" : "Focus"}: every word on a mat reads at 4.5:1 or better over a white mat (${words.length} read; the lowest ${worst})`);
    }
    await chooseView(who.page,"focus");
    await who.page.locator(".cm-board-mat").waitFor();
  }
  /* EVERY CARD SAYS ITS STATE: its name, tapped, its power and toughness, its damage and counters, as the card shows them. */
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    const cards = await who.page.evaluate(() => [...document.querySelectorAll("#cm-board button.cm-bcard")].map((el) => {
      const l = el.getAttribute("aria-label") || "", name = (el.querySelector(".cm-bcard-name")?.textContent || "").trim(), pt = (el.querySelector(".cm-bcard-pt")?.textContent || "").trim();
      const marks = [...el.querySelectorAll(".cm-bcard-mark:not(.is-state)")].map((m) => m.textContent.trim());
      return {l, tapped: el.classList.contains("is-tapped"), said: l.startsWith(name) && (!el.classList.contains("is-tapped") || /, tapped\b/.test(l)) && (!pt || l.includes(pt)) && marks.every((m) => l.includes(m))};
    }));
    const unsaid = cards.filter((c) => !c.said).map((c) => c.l);
    ok(cards.length >= 8 && !unsaid.length, `at ${width} every card's label says what the card shows (${cards.length} cards${unsaid.length ? "; not said: " + unsaid.join(" | ") : ""})`);
  }
  /* THE TAB ORDER: the strip, then the boards, then the hand; nothing jumps the queue with a tabindex above zero. */
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    await who.page.evaluate(() => {document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);});
    // Start at the first header control; Camera intentionally retains focus after a view switch.
    await who.page.locator('.cm-stage-top button').first().focus();
    const order = [], reached = {board: new Set(), hand: new Set()};
    for (let i = 0; i < 200; i += 1) {
      await who.page.keyboard.press("Tab");
      const [at, cardId] = await who.page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return ["none", ""];
        if (!el.closest("#cm-board")) return ["page", ""];
        /* the stage (the boards, the seat labels over them, the turn box and the action pop-up) is "board"; the drawers and their tabs come after the hand */
        const at = el.closest(".cm-stage-top") ? "strip" : el.closest(".cm-stage-hand") ? "hand" : el.closest(".cm-stage-region") ? "board" : el.closest(".cm-stage-rail,.cm-stage-side,.cm-stage-handle") ? "drawers" : "other " + (el.getAttribute("aria-label") || el.className);
        return [at, el.matches(".cm-bcard") ? el.dataset.card || "" : ""];
      });
      if (cardId && reached[at]) reached[at].add(cardId);
      if (order.at(-1) !== at) order.push(at);
      if (order.includes("hand") && at !== "hand" && at !== "drawers") break;
    }
    const board = order.filter((r) => r !== "page" && r !== "none");
    const runs = (r) => board.filter((x) => x === r).length;
    const cardsIn = await who.page.evaluate(() => [".cm-stage-region", ".cm-stage-hand"].map((q) => document.querySelectorAll(`${q} button.cm-bcard`).length));
    ok(board[0] === "strip" && board.indexOf("strip") < board.indexOf("board") && board.indexOf("board") < board.indexOf("hand") && ["strip", "board", "hand"].every((r) => runs(r) === 1),
      `at ${width} Tab walks the strip, then the boards (the stage), then the hand, each once, the drawers after them (${board.join(" → ")})`);
    ok(cardsIn[1] > 0 && reached.board.size === cardsIn[0] && reached.hand.size === cardsIn[1], `at ${width} and on the way it reaches every card on the stage's boards (${reached.board.size} of ${cardsIn[0]}) and in the hand (${reached.hand.size} of ${cardsIn[1]})`);
    eq(await who.page.evaluate(() => [...document.querySelectorAll("#cm-board [tabindex]")].filter((el) => Number(el.getAttribute("tabindex")) > 0).length), 0, `at ${width} nothing on the board takes a tabindex above zero`);
  }
  /* KEYS AND HELP, from the board's menu: the table's help, the keys among it. Escape then steps back out of the menu. */
  await rob.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await utility(rob.page,"board-help");
  await rob.page.locator("#cm-dialog [data-action=help-tab][data-tab=keys]").click();
  await rob.page.locator("#cm-dialog[open] .cm-help-keys").waitFor();
  const keys = await rob.page.locator("#cm-dialog[open] .cm-help-keys kbd").allTextContents();
  ok((await rob.page.locator("#cm-dialog-title").textContent()) === "Help — Play: the table and the board" && ["Tab", "Space", "Enter", "Escape", "1", "9", "+", "↑", "←"].every((k) => keys.includes(k)),
    `Table › Help opens the table's help with the keys (${[...new Set(keys)].join(" ")})`);
  await rob.page.click("#cm-dialog [data-action=close]");
  await rob.page.locator("#cm-dialog[open]").waitFor({state: "detached"}).catch(() => {});
  await rob.page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 5000});
  ok(await rob.page.locator("#cm-table-menu").count() === 1, "closing Help leaves the board where it was, the Table menu still open");
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-table-menu").waitFor({state: "detached", timeout: 5000});
  ok(true, "and Escape closes the Table menu");

  /* B1, item 25: THE HAND IS WHOLE in every view -- Table, Focus, Full screen, and Full screen once the browser's own
     full screen is left -- at 1400 (Rob, whose browser gives the whole screen) and at 1280 (Maya, whose does not). */
  const handWhole = async (page) => {
    const focusHand=page.locator('#cm-board[data-view=focus] .cm-board-main>.cm-board-hand');
    if(await focusHand.count())await focusHand.scrollIntoViewIfNeeded();
    return page.evaluate(() => {
    const cards = [...document.querySelectorAll(".cm-stage-fan .cm-bcard, .cm-stage-fan .cm-bcard")], tray = document.querySelector(".cm-board-hand, .cm-stage-fan").getBoundingClientRect();
    return {n: cards.length, whole: cards.length > 0 && cards.every((c) => {const r = c.getBoundingClientRect(); return r.bottom <= innerHeight + (document.querySelector(".cm-stage-fan") ? 40 : .5) && r.bottom <= tray.bottom + (document.querySelector(".cm-stage-fan") ? 28 : .5) && r.top >= 0;}), last: Math.round(cards.at(-1).getBoundingClientRect().bottom), h: innerHeight, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth};
  });};
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    await who.page.mouse.move(2, 2);
    const seen = [];
    for (const v of ["table", "focus", "full", "full-left"]) {
      if (v === "full-left") {await who.page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await who.page.waitForFunction(() => !document.fullscreenElement, null, {timeout: 10000}); await who.page.waitForTimeout(300);}
      else {await chooseView(who.page,v); if(v==="full")await fullTools(who.page); await who.page.locator(v === "full" ? ".cm-stage-rail" : v === "table" ? ".cm-board-table" : ".cm-board-mat").waitFor();}
      if (v === "full" && who === rob) eq(await who.page.evaluate(() => !!document.fullscreenElement), false, "3D stays independent of browser full-screen");
      const h = await handWhole(who.page);
      seen.push(`${v} ${h.last}/${h.h}`);
      ok(h.whole && h.sideways === 0, `at ${width}, ${v === "full-left" ? "Full screen after the browser's is left" : v}: the hand fits the window, with intentional bottom clipping in Full screen (${h.n} cards, the last ends at ${h.last} of ${h.h})`);
    }
    await shot(who.page, `hand-whole-full-${width}`);
    await chooseView(who.page,"focus");
    await who.page.locator(".cm-board-mat").waitFor();
  }

  /* B1, items 21 and 24: the history opens from a clock wherever it is offered, never ☰ (the menu's) or ⌕; the Coach is
     its own glyph, the same wherever it is named, and ✦ is nowhere. */
  /* History keeps its glyph on the board; Play settings supplies Recommended actions. */
  const histGlyphs = await rob.page.evaluate(() => [...document.querySelectorAll("#cm-board [data-action=board-history]")].map((el) => [(el.querySelector("svg.cm-icon") || {}).outerHTML || "", el.textContent]));
  await utility(rob.page,"board-tools");
  const glyphs = await rob.page.evaluate((histGlyphs) => {
    const svg = (el) => (el.querySelector("svg.cm-icon") || {}).outerHTML || "";
    const hist = histGlyphs.map(([g]) => g), coachEls = [...document.querySelectorAll("#cm-board [data-action=board-coach], #cm-board-tools [data-action=board-coach]")].filter(el=>el.querySelector("svg.cm-icon"));
    return {hist: hist.length, histSame: hist.every((g) => g && g === hist[0]), histText: histGlyphs.map(([, t]) => t).join(""),
      coach: coachEls.length, coachSame: coachEls.every((el) => svg(el) && svg(el) === svg(coachEls[0])), differ: hist[0] !== svg(coachEls[0]), star: document.getElementById("cm-board").innerHTML.includes("✦") || document.getElementById("cm-dialog").innerHTML.includes("✦")};
  }, histGlyphs);
  ok(glyphs.hist >= 2 && glyphs.histSame && !/[☰⌕]/.test(glyphs.histText), `the strip's History ▾ and the band's button open the history from the same clock (${glyphs.hist} places), not ☰ or ⌕`);
  ok(glyphs.coach >= 2 && glyphs.coachSame && glyphs.differ && !glyphs.star, `the icon-bearing Coach controls share their own glyph (${glyphs.coach} places), and ✦ is nowhere on the board: ${JSON.stringify(glyphs)}`);
  await rob.page.click("#cm-dialog .cm-dialog-close");
  await chooseView(rob.page,"full"); await fullTools(rob.page);
  await rob.page.locator(".cm-stage-rail").waitFor();
  ok(await rob.page.locator('.cm-stage-rail [data-action="board-rotate"], .cm-stage-rail [data-action="board-view"], .cm-stage-rail [data-action="board-tools"]').count()===0,
    "Full screen removes the legacy seat, settings and separate view buttons from the drawer");
  await chooseView(rob.page,"focus");
  await rob.page.locator(".cm-board-mat").waitFor();

  /* THE COACH: its module overlays; standalone mode reserves a column. Settle native font/layout work before comparing geometry. */
  await rob.page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  await rob.page.waitForFunction(()=>{const r=document.querySelector(".cm-board-mat").getBoundingClientRect(),next=[r.x,r.y,r.width,r.height].join(","),same=next===globalThis.__uatStableCoachMat;globalThis.__uatStableCoachMat=next;return same;},null,{polling:"raf",timeout:5000});
  const matWidth = () => rob.page.evaluate(() => Math.round(document.querySelector(".cm-board-mat").getBoundingClientRect().width));
  const matBefore = await matWidth(), beforeFocusCoach=await rob.page.locator(".cm-board-mat").boundingBox(),focusScrollBefore=await rob.page.evaluate(()=>document.scrollingElement.scrollTop);   /* (Focus has no scroller of its own now; the page is what scrolls) */
  await rail(rob.page, true);
  await rob.page.click(".cm-board-coach-open");
  await rob.page.locator("#cm-board-coach:not([hidden]) .cm-coach-input").waitFor();
  const coachBox = await rob.page.evaluate(() => {const r = document.getElementById("cm-board-coach").getBoundingClientRect(), mat = document.querySelector(".cm-board-mat").getBoundingClientRect(), drawer = document.querySelector(".cm-stage-side").getBoundingClientRect(); return {scroll:document.scrollingElement.scrollTop,module:document.getElementById("cm-board").dataset.coach === "module",width:r.width,right:r.right,edge:innerWidth,drawerContained:r.left>=drawer.left && r.right<=drawer.right+1,drawer:{x:drawer.x,y:drawer.y,width:drawer.width,height:drawer.height},clear:mat.right<=r.left+1,mat: {x:mat.x,y:mat.y,width:mat.width,height:mat.height},visible:r.bottom<=innerHeight+1};});
  /* Opening the module repaints the seat strip, moving its mat top by 5px even after font/RAF settlement.
     The overlay contract preserves the mat's horizontal placement, size and user scroll; composer access is checked below. */
  ok(coachBox.width>=240 && coachBox.right<=coachBox.edge && (coachBox.module
    ? coachBox.drawerContained&&["x","width","height"].every(key=>Math.abs(coachBox.mat[key]-beforeFocusCoach[key])<1)&&coachBox.scroll===focusScrollBefore
    : coachBox.clear&&coachBox.visible&&await matWidth()<=matBefore),
    `the Focus Coach uses its actual module-overlay or standalone-reserved layout (${Math.round(coachBox.width)}px): ${JSON.stringify({before:beforeFocusCoach,scrollBefore:focusScrollBefore,after:coachBox})}`);
  await verifyCoachUsable(rob.page);
  ok(/Sees your board, hand and the table · turn \d+/.test(await text(rob.page, "#cm-coach-context")), "it says what it sees, and the turn");
  await openCoachQuestions(rob.page);
  await rob.page.click("[data-action=board-coach-ask][data-q=\"What's my best play?\"]");
  ok(await rob.page.locator(".cm-coach-msg.is-typing").count() === 1, "a suggested prompt is asked, and the Coach shows it is typing");
  await rob.page.locator(".cm-coach-msg.is-coach:not(.is-typing)").waitFor({timeout: 5000});
  const thread = await rob.page.locator(".cm-coach-thread li").allInnerTexts();
  ok(/^Turn \d+ · /.test(thread[0].trim()) && thread[1].trim() === "What's my best play?" && /not switched on here yet/.test(thread[2]), `the thread: a turn divider, the question, and the door's honest reply while the Coach is shut (${thread[0].trim()})`);
  await rob.page.fill(".cm-coach-input", "Who's the threat?");
  await rob.page.press(".cm-coach-input", "Shift+Enter");
  await rob.page.type(".cm-coach-input", "and why");
  ok((await rob.page.inputValue(".cm-coach-input")).includes("\n"), "Shift+Enter is a new line");
  await rob.page.press(".cm-coach-input", "Enter");
  await rob.page.locator(".cm-coach-msg.is-you").nth(1).waitFor();
  eq((await rob.page.locator(".cm-coach-msg.is-you").nth(1).innerText()).trim(), "Who's the threat?\nand why", "Enter sends it");
  ok(coachAsked.length >= 2 && coachAsked.every((b) => b.hand === undefined && typeof b.tableId === "string"), "the board sends the Coach the table and the question, the hand not withheld by default");
  /* AI-6: set to "My board only", the Coach says so, and its question withholds the hand. */
  await rob.page.locator(".cm-coach-msg.is-typing").waitFor({state: "detached", timeout: 10000});
  await rob.page.evaluate(() => __cm.commit({type: "preferences", values: {aiCoach: {coachSees: "board"}}}, {renderView: false}));
  await rob.page.fill(".cm-coach-input", "What now?");
  await rob.page.press(".cm-coach-input", "Enter");
  await rob.page.locator(".cm-coach-msg.is-you").nth(2).waitFor();
  await rob.page.waitForFunction(() => /your hand withheld/.test(document.getElementById("cm-coach-context")?.textContent || ""), null, {timeout: 10000});
  ok(true, "set to the board only, the Coach says it sees the board and the table, the hand withheld");
  eq(coachAsked.at(-1).hand, false, "and asks with the hand withheld");
  await rob.page.locator(".cm-coach-msg.is-typing").waitFor({state: "detached", timeout: 10000});
  await rob.page.evaluate(() => __cm.commit({type: "preferences", values: {aiCoach: {coachSees: "hand"}}}, {renderView: false}));
  await rob.page.fill(".cm-coach-input", "a draft");
  await rob.page.focus(".cm-coach-input");
  const draftFacts=()=>rob.page.evaluate(()=>{const input=document.querySelector('.cm-coach-input'),drawer=input?.closest('.cm-stage-side,.cm-stage-rail'),active=document.activeElement;return {draft:input?.value,focused:active===input,active:{tag:active?.tagName,action:active?.dataset.action,class:active?.className},drawerScroll:drawer?.scrollTop,input:input?.getBoundingClientRect().toJSON(),mainScroll:document.querySelector('.cm-board-main')?.scrollTop};});
  const viewsBefore = views(ROB).length, draftBefore=await draftFacts();
  await serial(async () => object.broadcast());
  await rob.page.waitForTimeout(500);
  const draftAfter=await draftFacts(),draftProof={viewsBefore,viewsAfter:views(ROB).length,lastFrame:{revision:views(ROB).at(-1)?.revision,matchId:views(ROB).at(-1)?.matchId,decisionId:views(ROB).at(-1)?.decision?.id},before:draftBefore,after:draftAfter};
  if(SHOTS)writeFileSync(path.join(SHOTS,'coach-draft-redraw.json'),JSON.stringify(draftProof,null,2));
  ok(views(ROB).length > viewsBefore && draftAfter.draft === "a draft" && draftAfter.focused, `a view arriving mid-sentence leaves the draft, and the focus, where they were: ${JSON.stringify(draftProof)}`);
  await shot(rob.page, "coach-1400");
  await rob.page.click(".cm-coach-more summary");
  await rob.page.click("[data-action=board-coach-clear]");
  ok(await rob.page.locator(".cm-coach-msg").count() === 0, "⋯ › Clear chat empties the thread");
  const moreOpen = () => rob.page.evaluate(() => document.querySelector("#cm-board-coach .cm-coach-more").open);
  ok(!await moreOpen(), "and closes ⋯");
  /* Hold only the injected transport reply, so real native disclosure and prompt clicks can establish
     focus deterministically before it arrives. The actual board redraw must keep that focus. */
  const focusOn = (q) => rob.page.evaluate((q) => document.activeElement.matches(`#cm-board-coach .cm-coach-more ${q}`), q);
  await openCoachQuestions(rob.page);
  let releaseReply = rob.holdCoachReply();
  await rob.page.locator('#cm-board-coach [data-action=board-coach-ask]').first().click();
  await rob.page.locator('#cm-board-coach .cm-coach-more summary').click();
  const staged = await rob.page.evaluate(() => ({typing: document.querySelectorAll('.cm-coach-msg.is-typing').length, open: document.querySelector('#cm-board-coach .cm-coach-more').open, focus: document.activeElement.matches('#cm-board-coach .cm-coach-more summary')}));
  ok(staged.typing === 1 && staged.open && staged.focus, "⋯ opened, and focused, while the Coach is typing");
  releaseReply();
  await rob.page.locator(".cm-coach-msg.is-coach:not(.is-typing)").waitFor({timeout: 5000});
  ok(await moreOpen() && await rob.page.locator("[data-action=board-coach-clear]").isVisible(), "the reply lands and ⋯ stays open, Clear chat still in it");
  const replyFocus=await rob.page.evaluate(()=>{const active=document.activeElement,more=document.querySelector('#cm-board-coach .cm-coach-more'),drawer=more?.closest('.cm-stage-side,.cm-stage-rail');return {active:{tag:active?.tagName,class:active?.className,action:active?.dataset.action},summaryFocused:active===more?.querySelector('summary'),open:more?.open,drawerScroll:drawer?.scrollTop};});
  if(SHOTS)writeFileSync(path.join(SHOTS,'coach-more-reply-focus.json'),JSON.stringify(replyFocus,null,2));
  ok(await focusOn("summary"), `and the focus stays on ⋯: ${JSON.stringify(replyFocus)}`);
  await openCoachQuestions(rob.page);
  releaseReply = rob.holdCoachReply();
  await rob.page.locator('#cm-board-coach [data-action=board-coach-ask]').first().click();
  await rob.page.locator('#cm-board-coach [data-action=board-coach-clear]').focus();
  const staged2 = await rob.page.evaluate(() => ({typing: document.querySelectorAll('.cm-coach-msg.is-typing').length, focus: document.activeElement.matches('#cm-board-coach [data-action=board-coach-clear]')}));
  ok(staged2.typing === 1 && staged2.focus, "Clear chat has the focus while the Coach is typing again");
  releaseReply();
  await rob.page.locator(".cm-coach-msg.is-typing").waitFor({state: "detached", timeout: 5000});
  ok(await moreOpen() && await focusOn("[data-action=board-coach-clear]"), "the reply lands and the focus stays on Clear chat");
  await rob.page.keyboard.press("Enter");
  ok(await rob.page.locator(".cm-coach-msg").count() === 0 && !await moreOpen(), "Clear chat from the menu that stayed open empties the thread, and closes ⋯");
  ok(await focusOn("summary"), "and the focus goes back to ⋯");
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-board-coach[hidden]").waitFor({state: "attached"});
  ok(true, "Escape closes the Coach");
  eq(await matWidth(), matBefore, "closing Coach restores the mat's available width");
  await utility(rob.page,"board-tools","general");
  await rob.page.click("#cm-board-tools [data-action=board-coach]");
  await rob.page.locator("#cm-board-coach:not([hidden])").waitFor();
  await rob.page.click("#cm-board-coach [aria-label='Close the Coach']");
  await rob.page.locator("#cm-board-coach[hidden]").waitFor({state: "attached"});
  ok(true, "Tools › Recommended actions opens it too, and ✕ closes it");
  await chooseView(maya.page,"full"); await fullTools(maya.page);
  await fullCoach(maya.page);
  await maya.page.locator("#cm-board-coach:not([hidden])").waitFor();
  const onTop = await maya.page.evaluate(() => {const r = document.getElementById("cm-board-coach").getBoundingClientRect(); const el = document.elementFromPoint(r.left + 20, r.top + 60); return !!el && !!el.closest("#cm-board-coach");});
  ok(onTop, "in Full screen, the Coach's glyph in the rail opens it, above the game");
  await maya.page.keyboard.press("Escape");
  await chooseView(maya.page,"focus");

  /* DROPPED: the room ends Rob's socket; his board reconnects; Maya is told, then the table says he is back. */
  const socketsBefore = routes[ROB].length, robFlag = ".cm-board-tile[data-seat='0'] .cm-seat-state";
  /* One of Maya's reads (her table is read every two seconds) is answered by the room before Rob drops, and kept on
     the way back until the room has told her he dropped. Her board counts the reads it is handed, so the check below
     knows that one has landed. */
  await maya.page.evaluate(() => {const board = globalThis.__cm.board, show = board.show; board.show = function (...a) {globalThis.__shown = (globalThis.__shown || 0) + 1; return show.apply(this, a);};});
  let lateGo; const lateAnswered = new Promise((answered) => {late[MAYA] = {answered, promise: new Promise((go) => {lateGo = go;})};});
  await Promise.race([lateAnswered, new Promise((_, no) => setTimeout(() => no(new Error("Maya's table was not read within 10 s")), 10000))]);
  let release; held[MAYA] = {promise: new Promise((r) => {release = r;})};
  await dropSocket(ROB);
  await waitText(maya.page, robFlag, /Dropped · back by/, 10000).catch(async (error) => {
    /* What Maya's board showed instead, and what her socket had brought: a timeout here says why. */
    const flag = await maya.page.evaluate((q) => document.querySelector(q)?.innerText ?? "(no flag)", robFlag);
    const last = frames[MAYA].slice(-6).map((f) => {try {const j = JSON.parse(f); return j.type + (j.seatId ? ` ${j.seatId}` : "");} catch {return "?";}});
    throw new Error(`Maya was not told Rob dropped: her flag reads "${flag}"; her last frames: ${last.join(", ")}; sockets Rob ${routes[ROB].length}, Maya ${routes[MAYA].length} (${error.message})`);
  });
  ok(true, "Maya is told at once that Rob dropped, and until when, by the room over her socket (her table reads held)");
  const reads = await maya.page.evaluate(() => globalThis.__shown || 0);
  lateGo();
  await maya.page.waitForFunction((n) => (globalThis.__shown || 0) > n, reads, {timeout: 10000});
  ok(/Dropped · back by/.test(await text(maya.page, robFlag)), "and the read the room answered before he dropped, landing after it told her, leaves that up: the room's word is the newer (newest wins)");
  delete held[MAYA]; release();
  await rob.page.waitForFunction(() => document.querySelector(".cm-stage-top") && !document.querySelector(".cm-board-conn"), null, {timeout: 20000});
  ok(routes[ROB].length === socketsBefore + 1, "Rob's board opens a new socket by itself, and the room sends his view again");
  await maya.page.waitForFunction(() => !/Dropped/.test(document.querySelector(".cm-board-tile[data-seat='0'] .cm-seat-state")?.innerText || ""), null, {timeout: 20000});
  ok(true, "and once he is back, Maya's board stops saying so");

  /* PHONES (Linear ROB-18; Rob, Oct 18: "the upright Focused phone layout"): Maya's screen becomes a phone held sideways.
     Focus only: the rail along the top, the seats a column at the right, the pill, her battlefield, what she is asked. */
  await chooseView(maya.page,"table");   /* her desk's view, which the phone must leave be */
  await maya.page.setViewportSize({width: 844, height: 390});
  await maya.page.locator("#cm-board[data-phone=landscape] .cm-phone-rail").waitFor({timeout: 10000});
  const phoneGeo = await maya.page.evaluate(() => {
    const w = (q) => Math.round(document.querySelector(q).getBoundingClientRect().width), board = document.getElementById("cm-board").getBoundingClientRect();
    const h = (q) => Math.round(document.querySelector(q).getBoundingClientRect().height);
    return {rail: h(".cm-phone-rail"), seats: w(".cm-phone-seats"), board: [Math.round(board.width), Math.round(board.height)], views: document.querySelectorAll("#cm-board [data-action=board-view]").length,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, seatCount: document.querySelectorAll(".cm-phone-seat").length};
  });
  ok(phoneGeo.rail === 52 && phoneGeo.seats === 110 && phoneGeo.board[0] === 844 && phoneGeo.board[1] === 390 && phoneGeo.sideways === 0, `on a phone held sideways: the 52px rail along the top, the seats a 110px column, the board the whole screen (${phoneGeo.board.join("×")})`);
  ok(phoneGeo.views === 0 && phoneGeo.seatCount === 2, "Focus is the only view, and the strip holds every seat");
  /* A drawer opened on the desktop stays open across resize. Close it through its native spine before
     exercising the phone battlefield beneath it; an overlaid drawer correctly receives its own wheel. */
  for(const action of ['board-stage-rail','board-stage-side']){const tab=maya.page.locator(`.cm-drawer-tab[data-action="${action}"]`);if(await tab.count()&&await tab.getAttribute('aria-expanded')==='true')await tab.click();}
  /* The battlefield and its lands at full width, scrolling within their own frame down to the piles, the pill and what
     she is asked staying where they are. */
  /* scrolled as a person scrolls it, by the wheel over it: a script's scrollTop moves even a frame that can't scroll */
  const fieldBox = await maya.page.locator(".cm-phone-battlefield").boundingBox(), pillTop = (await maya.page.locator(".cm-phone-pill").boundingBox()).y;
  const phoneWheelBefore=await maya.page.evaluate(point=>{
    const field=document.querySelector('.cm-phone-battlefield'),center=document.querySelector('.cm-phone-center'),mat=field.querySelector('.cm-mat'),hit=document.elementFromPoint(point.x,point.y);
    globalThis.__uatPhoneWheel=[];document.addEventListener('wheel',event=>{const facts={target:{tag:event.target.tagName,class:event.target.className},zone:event.target.closest('[data-zone-scroll]')?.dataset.zoneScroll,deltaY:event.deltaY,x:event.clientX,y:event.clientY};globalThis.__uatPhoneWheel.push(facts);setTimeout(()=>facts.prevented=event.defaultPrevented,0);},{capture:true});
    return {point,hit:{tag:hit?.tagName,class:hit?.className,inField:!!hit&&field.contains(hit)},field:{rect:field.getBoundingClientRect().toJSON(),client:field.clientHeight,scroll:field.scrollHeight,overflow:getComputedStyle(field).overflowY},center:center.getBoundingClientRect().toJSON(),mat:mat.getBoundingClientRect().toJSON()};
  },{x:fieldBox.x+fieldBox.width/2,y:fieldBox.y+fieldBox.height/2});
  await maya.page.mouse.move(fieldBox.x + fieldBox.width / 2, fieldBox.y + fieldBox.height / 2);
  for (let i = 0; i < 6; i += 1) {await maya.page.mouse.wheel(0, 400); await maya.page.waitForTimeout(80);}
  const scrolled = await maya.page.evaluate((pill) => {
    const field = document.querySelector(".cm-phone-battlefield"), lib = field.querySelector(".cm-board-pile[data-zone=library]").getBoundingClientRect(), box = field.getBoundingClientRect();
    const hit = document.elementFromPoint(lib.left + lib.width / 2, Math.min(lib.top + lib.height / 2, box.bottom - 4));
    return {scrolls: field.scrollTop > 0, reached: !!hit && !!hit.closest(".cm-board-pile[data-zone=library]"),
      offset:field.scrollTop,library:lib.toJSON(),field:box.toJSON(),wheels:globalThis.__uatPhoneWheel,
      still: Math.round(document.querySelector(".cm-phone-pill").getBoundingClientRect().top) === Math.round(pill)};
  }, pillTop);
  await maya.page.evaluate(() => {document.querySelector(".cm-phone-battlefield").scrollTop = 0;});
  await maya.page.mouse.move(1, 1);
  if(SHOTS)writeFileSync(path.join(SHOTS,'phone-wheel-access.json'),JSON.stringify({before:phoneWheelBefore,after:scrolled},null,2));
  ok(scrolled.scrolls && scrolled.reached && scrolled.still, `her battlefield scrolls under the wheel within its frame, down to her library, the pill staying put (${JSON.stringify({before:phoneWheelBefore,after:scrolled})})`);
  const badge = Number(await text(maya.page, ".cm-phone-badge"));
  const mayaHand = views(MAYA).at(-1).state.players[1].zones.Hand.count;
  eq(badge, mayaHand, `✋ carries the hand's count (${badge})`);
  await maya.page.click(".cm-phone-seat[data-seat='0']");
  await waitText(maya.page, ".cm-phone-pill", /Viewing Rob/);
  ok(await maya.page.locator(".cm-phone-center .cm-seatboard[data-seat='0']").count() === 1, "a seat tapped puts that board on the screen, and the pill says whose");
  await maya.page.click(".cm-phone-pill [data-action=board-focus]");
  await maya.page.locator(".cm-phone-center .cm-seatboard.is-you").waitFor();
  await maya.page.click(".cm-stage-camera [data-action=board-camera]");
  ok(await maya.page.locator(".cm-stage-camera [data-action=board-view], .cm-stage-camera [data-stage-camera=tilt]").count() === 0, "Camera on a phone has no view switch and no Tilt");
  await maya.page.click(".cm-stage-camera [data-action=board-rotate][data-by='1']");
  await maya.page.locator(".cm-phone-center .cm-seatboard[data-seat='0']").waitFor();
  ok(true, "My board goes back to hers, and Camera's ▶ goes round to the next seat");
  await maya.page.click(".cm-stage-camera [data-action=board-rotate][data-by='-1']");
  await maya.page.click(".cm-stage-camera [data-action=board-camera]");
  const askShare = await maya.page.evaluate(() => {const a = document.querySelector(".cm-phone-ask"); return a && a.children.length ? a.getBoundingClientRect().height / innerHeight : 0;});
  ok(askShare > 0 && askShare < 0.35, `what she is asked sits under her battlefield, in view, without taking most of the screen (${Math.round(askShare * 100)}% of the height)`);
  /* However much it holds -- a main phase with ten ways to play covered 46% -- it stops at a third and scrolls within. */
  const capped = await maya.page.evaluate(() => {
    const a = document.querySelector(".cm-phone-ask"), filler = Object.assign(document.createElement("div"), {style: "flex:none;height:600px"});
    a.append(filler);
    const share = a.getBoundingClientRect().height / innerHeight, scrolls = a.scrollHeight > a.clientHeight;
    filler.remove();
    return {share, scrolls};
  });
  ok(capped.share <= 0.34 && capped.scrolls, `and filled past it, it stops at a third of the phone's height (${Math.round(capped.share * 100)}%) and scrolls within`);
  await shot(maya.page, "phone-landscape");
  /* When the room asks her something, the board snaps back to hers, wherever she was looking. */
  let snapped = false;
  /* asked: to pass, to draw (a game with the held draw), or to confirm a choice -- her attackers, none picked */
  const mayaAsk = ".cm-phone-pill [data-action=board-pass]:not([disabled]), .cm-phone-pill [data-action=board-draw]:not([disabled]), .cm-phone-ask [data-action=board-confirm]:not([disabled])";
  for (let i = 0; i < 30 && !snapped; i += 1) {
    const mayaAsked = await maya.page.locator(mayaAsk).count();
    if (mayaAsked) {await maya.page.locator(mayaAsk).first().click(); await maya.page.waitForTimeout(250); continue;}
    if (!(await maya.page.locator(".cm-phone-center .cm-seatboard[data-seat='0']").count())) await maya.page.click(".cm-phone-seat[data-seat='0']");
    const robPass = rob.page.locator("[data-action=board-pass]:not([disabled])");
    if (!(await robPass.count())) {await rob.page.waitForTimeout(250); continue;}
    await robPass.click();
    await maya.page.waitForTimeout(500);
    if (await maya.page.locator(mayaAsk).count()) snapped = await maya.page.locator(".cm-phone-center .cm-seatboard.is-you").count() === 1;
  }
  ok(snapped, "looking at Rob's board when the room asks her, the board snaps back to hers");
  /* ✋: the hand at a readable size; a card tapped is held up with what it can do; Back to hand. */
  await maya.page.click(".cm-phone-icon[aria-label='Your hand']");
  await maya.page.locator("#cm-board .cm-hand-show .cm-hand-fan").waitFor();
  const phoneHand = await maya.page.evaluate(() => {const drawer = document.querySelector(".cm-hand-show").getBoundingClientRect(), pill = document.querySelector(".cm-phone-pill").getBoundingClientRect();
    return {card: Math.round(document.querySelector(".cm-hand-slot .cm-bcard").getBoundingClientRect().width), bottom: Math.round(drawer.bottom), top: Math.round(drawer.top), pill: Math.round(pill.bottom)};});
  ok(phoneHand.card === 110 && phoneHand.bottom === 390 && phoneHand.top >= phoneHand.pill, `✋ opens the hand as a drawer from the bottom, below the pill, its cards 110px (${phoneHand.card}; ${phoneHand.top}-${phoneHand.bottom}, the pill to ${phoneHand.pill})`);
  await maya.page.locator(".cm-hand-slot .cm-bcard").first().click();
  await maya.page.locator(".cm-hand-show.is-held").waitFor();
  await shot(maya.page, "phone-hand");
  await maya.page.click(".cm-hand-acts [data-action=board-hand-back]");
  await maya.page.click("[data-action=board-hand-close]");
  /* Held upright, the board is upright too (ROB-18): never turned, the seats a row beneath the rail. */
  await maya.page.setViewportSize({width: 390, height: 844});
  await maya.page.locator("#cm-board[data-phone=portrait]").waitFor({timeout: 10000});
  const upright = await maya.page.evaluate(() => {
    const r = document.getElementById("cm-board").getBoundingClientRect(), m = new DOMMatrix(getComputedStyle(document.getElementById("cm-board")).transform);
    const seats = document.querySelector(".cm-phone-seats").getBoundingClientRect(), rail = document.querySelector(".cm-phone-rail").getBoundingClientRect();
    return {box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], turn: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      row: seats.top >= rail.bottom - 1 && Math.round(seats.width) >= 370};
  });
  ok(upright.turn === 0 && upright.box.join() === "0,0,390,844" && upright.sideways === 0 && upright.row, `held upright, the board is upright and fills the screen, the seats a row beneath the rail (${upright.box.join(",")}, turned ${upright.turn}°)`);
  await shot(maya.page, "phone-upright");
  await maya.page.setViewportSize({width: 1280, height: 800});
  await maya.page.locator("#cm-board:not([data-phone]) .cm-stage-top").waitFor({timeout: 10000});
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "table", "back at a desk, the desk board again, in the view she left it in: seats tapped on the phone changed nothing there");
  await chooseView(maya.page,"focus");

  /* END: Tools › End game, two taps; both boards say so; back to the table. B2: Rob is on Decks when it ends -- his rail
     says the game is over, his socket stays open, and Game over brings him to the result. */
  await utility(rob.page,"board-menu");
  await rob.page.click("#cm-board-nav a[href='#decks']");
  await rob.page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
  await rob.page.locator("#cm-game-on").waitFor({timeout: 10000});
  /* NEVER BEHIND THE GAME: callouts still waiting when the game ends -- Try the callouts' eight, here -- are cleared with
     the ones on screen, so nothing from before covers the game-over panel; the game's end is the last word. */
  await utility(maya.page,"board-tools","general");
  await maya.page.click("[data-action=board-callout-demo]");
  await maya.page.locator(".cm-callout").first().waitFor({timeout: 3000});
  await utility(maya.page,"board-tools","gameplay");
  await maya.page.click("#cm-board-tools [data-action=board-end]");
  eq((await text(maya.page, "#cm-board-tools [data-action=board-end][data-confirm='1']")).trim(), "End for everyone · keep the record", "End game in Tools asks a second tap first, naming what it does");
  await shot(maya.page, "board-end-1280");
  await maya.page.click("#cm-board-tools [data-action=board-end][data-confirm='1']");
  await rob.page.waitForFunction(() => /Game over/.test(document.getElementById("cm-game-on")?.textContent || ""), null, {timeout: 15000});
  ok(!routes[ROB].at(-1).server.closed, "the game ended with Rob on Decks: his rail says Game over, and his socket stays open (a table takes no new one once its game is over)");
  await rob.page.click("#cm-game-on");
  await waitText(rob.page, ".cm-board-over", /ended early/);
  await waitText(maya.page, ".cm-board-over", /ended early/);
  const calledOut = () => maya.page.evaluate(() => [...document.querySelectorAll("#cm-board-callouts .cm-callout-word")].map((w) => w.textContent.trim()));
  const atEnd = await calledOut();
  await maya.page.waitForTimeout(1500);
  const after = await calledOut();
  ok([...atEnd, ...after].every((w) => w === "GAME OVER"), `at the game's end the callouts still waiting are cleared: only GAME OVER (${JSON.stringify(atEnd)}, then ${JSON.stringify(after)})`);
  ok(/record is kept/.test(await text(rob.page, ".cm-board-over")), "both boards say it was ended early, nobody lost, and the record is kept");
  await shot(rob.page, "board-over-1400");

  /* FILED: each person's own result, under the deck of their own library they brought, once. */
  const tableGames = (page) => page.evaluate(() => globalThis.__cm.state.games.filter((g) => g.table).map((g) => ({id: g.id, deckId: g.deckId, outcome: g.outcome, seatId: g.table.seatId, ai: g.table.ai, deckVersion: g.deckVersion, pod: g.pod, notes: g.notes})));
  for (const who of [rob, maya]) await who.page.waitForFunction(() => globalThis.__cm.state.games.some((g) => g.table), null, {timeout: 15000});
  const matchId = views(ROB).at(-1).matchId, robGames = await tableGames(rob.page), mayaGames = await tableGames(maya.page);
  eq(robGames.map(({id, deckId, outcome, seatId, ai, deckVersion, pod}) => ({id, deckId, outcome, seatId, ai, deckVersion, pod})),
    [{id: `game:table:${matchId}:s0`, deckId: "deck:live:D1", outcome: "unfinished", seatId: "s0", ai: false, deckVersion: 2, pod: 2}],
    "Rob's game is filed once, under the D1 he brought, as unfinished: it was ended early");
  eq(mayaGames.map(({id, deckId, outcome}) => ({id, deckId, outcome})), [{id: `game:table:${matchId}:s1`, deckId: "deck:live:D2", outcome: "unfinished"}],
    "Maya's is filed in her own library, under her D2, for her seat alone");
  ok(!robGames.some((g) => g.deckId === "deck:live:D2") && /ended early/.test(robGames[0].notes), "nothing of Maya's game reached the host's library, and the record says why it ended");

  /* THE RECORD (M8b): not a playtest table, so each person downloads their own seat's. */
  const [download] = await Promise.all([rob.page.waitForEvent("download", {timeout: 15000}), rob.page.click(".cm-board-over [data-action=board-record]")]);
  const rec = JSON.parse(readFileSync(await download.path(), "utf8"));
  eq([download.suggestedFilename(), rec.kind, rec.seatId, rec.playtest, "seed" in rec, "tape" in rec], [`CrankMagic-${rec.matchId}-your-record.json`, "seat", "s0", false, false, false], "the game over, Download your record gives Rob his own seat's record: no seed, no tape");
  /* The cards of Maya's in it are the creatures she cast (B5, and the one cast holding priority), public since cast. */
  const mayaNamed = new Set(JSON.stringify(rec).match(/Maya Secret \d+/g) || []);
  ok([...mayaNamed].every((n) => n === castName || n === heldName) && rec.history.length > 0, `with the table's history and nothing of Maya's hidden cards (of hers, only ${[...mayaNamed].join(", ") || "none"}, cast in the open)`);
  await waitText(rob.page, "#cm-notice", /Your record is downloaded/, 10000);
  eq(await rob.page.locator("#cm-notice .cm-toast-action").count(), 0, "and the board says what was downloaded, with no Undo: the download changed nothing");
  await shot(rob.page, "board-record-1400");
  /* SEND FEEDBACK NAMES THE GAME (G-E; the feedback loop, CrankFeedback@1): a person's report says which game, where in it
     and which release, so it can be replayed from the record -- and never a card of anyone's hand. */
  const heldGame = await rob.page.evaluate(() => globalThis.__cm.board.held());
  eq([heldGame.matchId, heldGame.over, typeof heldGame.turn, typeof heldGame.step, heldGame.seat, typeof heldGame.lastLine, ["Table", "Focus", "3D"].includes(heldGame.view)], [matchId, true, "number", "string", "Rob", "string", true],
    `the board says what it holds for a report: the match, that it is over, the turn and step, the seat's name, the last history line and the view (${heldGame.step}; "${heldGame.lastLine}"; ${heldGame.view})`);
  const report = await rob.page.evaluate(() => globalThis.__cm.feedback.draft({text: "x"}));
  eq([report.game.matchId, report.game.tableId, report.page.view, report.build.commit], [matchId, heldGame.tableId, heldGame.view, "unreleased"], "the report carries the game and the view the board holds, and this page is no release");
  ok(!JSON.stringify(report).includes("Maya Secret") && !/hand|library/i.test(JSON.stringify(Object.keys(report.game))), "and nothing of anyone's hand, by construction: the report has no field for one");
  ok(await rob.page.locator("#cm-board .cm-stage-profile [data-action=send-feedback][aria-label='Send feedback']").count() === 1, "the board's profile strip carries the feedback glyph");
  const mail = async (page) => decodeURIComponent((await page.evaluate(() => globalThis.__cm.feedbackLink())).split("body=")[1]);
  const said = await mail(rob.page);
  ok(said.includes(`Game: ${matchId}, turn `) && said.includes(", over\n") && /\nVersion: not a release\n/.test(said), "and the mailto a local copy falls back to still names the game and the release");

  /* Views of the ended game keep arriving while the board is open (anyone's End, an away frame, a mat): each is
     read again, and the result is still filed once. */
  const viewsAtEnd = views(ROB).length;
  await serial(async () => object.broadcast());
  for (let i = 0; i < 50 && !(views(ROB).length > viewsAtEnd); i += 1) await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 800));
  ok(views(ROB).length > viewsAtEnd && views(ROB).at(-1).status === "finished", "the ended game's view reaches the board again");
  eq((await tableGames(rob.page)).length, 1, "and the same result is not filed twice");
  const outcomes = await rob.page.evaluate(() => {
    const o = globalThis.__cm.board.outcomeOf, base = {seatId: "s0", departures: {}, result: null, status: "playing"};
    const at = (x) => {const r = o({...base, ...x}); return r && r.outcome;};
    return [at({status: "finished", result: {winner: "s0", reason: "last one standing"}}), at({status: "finished", result: {winner: "s2", reason: "last one standing"}}),
      at({status: "finished", result: {winner: null, reason: "everyone lost at once"}}), at({departures: {s0: "conceded"}}), at({departures: {s0: "timed-out"}}),
      at({status: "finished", result: {winner: null, reason: "ended early", endedBy: "s1"}}), at({departures: {s1: "conceded"}}), at({})];
  });
  eq(outcomes, ["win", "loss", "draw", "loss", "unfinished", "unfinished", null, null],
    "what the board files: a win, a loss, a draw; a concession is a loss; running out of time or an early end is unfinished; someone else leaving, or the game going on, files nothing yet");
  await rob.page.click("[data-action=board-leave]");
  await waitText(rob.page, "#cm-table-game", /Play again\?|The game is over/);
  ok(!(await rob.page.locator("#cm-board").count()), "Back to the table puts the board away, and the lobby says the game is over");

  /* CH-86 exposes the authoritative result persistently in the lobby, replacing the legacy board-only toast.
     Follow its native Review link to the exact deck/game rather than navigating around the handoff. */
  const reviewGame=rob.page.getByRole('link',{name:'Review this game',exact:true});
  await reviewGame.waitFor();
  const reviewQuery=new URLSearchParams((await reviewGame.getAttribute('href')).split('?')[1]);
  eq([reviewQuery.get('deck'),reviewQuery.get('game')],['deck:live:D1',`game:table:${matchId}:s0`],"the persistent result names the source deck and exact game to review");
  /* THE RECORD READS IT BACK, on the deck's page: one game, unfinished, marked as played at a table. */
  await reviewGame.click();
  await rob.page.locator("#cm-sec-record .cm-record-table").waitFor({timeout: 30000});
  const row = (await rob.page.locator("#cm-sec-record .cm-record-table tbody tr").allInnerTexts());
  ok(row.length === 1 && /unfinished/.test(row[0]) && /Table/.test(row[0]) && !/\bAI\b/.test(row[0]), `D1's Record reads the game back: unfinished, played at a table, no AI (${row[0].replace(/\s+/g, " ").trim()})`);
  await rob.page.locator("#cm-sec-record").scrollIntoViewIfNeeded();
  await shot(rob.page, "record-table-game-1400");
  /* A game with an AI in it says so, so a win over the house pilot never passes for one over friends. */
  const committed = await rob.page.evaluate(() => globalThis.__cm.commit({type: "game", gameId: "game:table:aitable1g1:s0", deckId: "deck:live:D3", outcome: "win", pod: 4, finish: 1,
    table: {schema: "CrankMagicTableResult@1", tableId: "aitable1", matchId: "aitable1g1", seatId: "s0", ai: true, reason: "last one standing", deckVersion: 2}}, {renderView: false}).then(() => "", (error) => error.message));
  eq(committed, "", "a table result with an AI seat is taken by the library");
  await rob.page.goto(`${base}/index.html#decks?deck=${encodeURIComponent("deck:live:D3")}`);
  await rob.page.waitForFunction(() => /Atraxa/.test(document.querySelector(".cm-deck-hero h1")?.textContent || "") && document.querySelector("#cm-sec-record .cm-record-table"), null, {timeout: 30000});
  const aiRow = (await rob.page.locator("#cm-sec-record .cm-record-table tbody tr").allInnerTexts())[0] || "";
  await rob.page.locator("#cm-sec-record").scrollIntoViewIfNeeded();
  await shot(rob.page, "record-ai-game-1400");
  ok(/win/.test(aiRow) && /Table/.test(aiRow) && /\bAI\b/.test(aiRow), `a table game with an AI seat is badged AI on the Record (${aiRow.replace(/\s+/g, " ").trim()})`);

  eq([leaks(MAYA, "Rob"), leaks(ROB, "Maya", [castName, heldName])], [0, 0], `across the whole game, no frame to either named a card of the other's hand or library, history included (${frames[MAYA].length + frames[ROB].length} frames; ${castName} was cast in the open)`);
  eq(writes.filter((w) => w.header !== "play" || !/^application\/json/.test(w.type || "")), [], `every one of the board's ${writes.length} writes carried Play's header and JSON`);
  const away = await maya.page.evaluate(() => {globalThis.__cm.board.close(); return [globalThis.__cm.board.held(), globalThis.__cm.feedback.draft({text: "x"}).game, decodeURIComponent(globalThis.__cm.feedbackLink().split("body=")[1])];});
  ok(away[0] === null && away[1] === undefined && !away[2].includes("Game:") && /Where I was: /.test(away[2]), "and with no game on the board, neither the report nor the mail names one");
  await rob.context.close(); await maya.context.close();
} catch(error) {
  console.error(`table-board stopped after ${checks} checks`);
  mkdirSync(SHOTS || "work",{recursive:true});
  for(let i=0;i<proofPages.length;i++){const p=proofPages[i];if(!p.isClosed()){await p.screenshot({path:path.join(SHOTS || "work", `table-board-failure-${i}.png`)});console.error(await p.locator("#cm-board").evaluate(el=>({view:el.dataset,rect:el.getBoundingClientRect().toJSON(),hand:el.querySelector(".cm-board-hand")?.getBoundingClientRect().toJSON(),gestures:globalThis.__uatBoardGestures,historyCalls:globalThis.__uatHistoryCalls,historyAfterClick:globalThis.__uatHistoryAfterClick,history:[...el.querySelectorAll("#cm-board-history")].map(h=>({rect:h.getBoundingClientRect().toJSON(),display:getComputedStyle(h).display,visibility:getComputedStyle(h).visibility}))})).catch(()=>null));}}
  throw error;
} finally {
  await close();
}
console.log(`table-board: ${checks} checks passed — a real game between two browsers over the table's socket: hidden hands, Keep, empty steps passing by themselves, a land tapped from the hand, Next step, Draw card from the button or the library, a cast's Undo window and one that holds, Resolve and Pass, a refusal in words, a dropped socket reopened, End game's second tap.`);


async function dismissAccount(page) {
  if (await page.locator('#cm-user-menu:popover-open').count()) await page.keyboard.press('Escape');
}
/* The seat the page is looking at is the big board in Focus; each of the others is a tile behind it. Double click it to look at it (a seat
   already looked at has no tile to press, as it has no pane tile in the old pane). */
async function lookAt(page, seat) {
  if (await page.locator(`.cm-stage-big[data-seat='${seat}']`).count()) return;
  await page.locator(`.cm-stage-rear[data-seat='${seat}'] .cm-mat`).dblclick({position: {x: 4, y: 4}});   /* a double click on a board focuses it (Rob, 2026-10-28) */
  await page.locator(`.cm-stage-big[data-seat='${seat}']`).waitFor({timeout: 10000});
}
/* Actions is the left drawer; the old row's "board-actions-open" toggle opened and shut it. */
async function rail(page, open) {
  const t = page.locator("[data-action=board-stage-rail]");
  if ((await t.getAttribute("aria-expanded")) !== String(open)) await t.click();
  await page.waitForTimeout(150);
}
async function chooseView(page, view) {
  await dismissAccount(page);
  if (!await page.locator('.cm-stage-camera [data-action=board-view]').count()) await page.locator('[data-action=board-camera]').click();
  await page.locator('.cm-stage-camera [data-action=board-view][data-view="'+view+'"]').click();
}
async function utility(page, action, section = "general") {
  await dismissAccount(page);
  if (action === 'board-tools') {
    if (!await page.locator('#cm-board-tools').isVisible()) {
      if (!await page.locator('#cm-table-menu [data-action=board-tools]').count()) await page.locator('[data-action=board-table-menu]').click();
      await page.locator('#cm-table-menu [data-action=board-tools]').click();
    }
    await settingsSection(page, section);
  } else if (action === 'board-help') {
    if (!await page.locator('#cm-table-menu').count()) await page.locator('[data-action=board-table-menu]').click();
    await page.locator('#cm-table-menu [data-action=page-help][data-help=table]').click();
  } else if (action === 'board-menu') {
    if (!await page.locator('#cm-table-menu [data-action=board-menu]').count()) await page.locator('[data-action=board-table-menu]').click();
    await page.locator('#cm-table-menu [data-action=board-menu]').click();
  } else {
    if (action === 'board-history') await page.evaluate(() => {
      if (globalThis.__uatHistoryHooked) return;
      globalThis.__uatHistoryHooked = true; globalThis.__uatHistoryCalls = 0;
      const run = __cm.actions['board-history'];
      __cm.actions['board-history'] = (...args) => {globalThis.__uatHistoryCalls++; return run(...args);};
    });
    await page.locator('#cm-board [data-action="'+action+'"]:visible').first().click();
    if (action === 'board-history') await page.evaluate(() => {
      const h = document.getElementById('cm-board-history');
      globalThis.__uatHistoryAfterClick = {calls: globalThis.__uatHistoryCalls, count: document.querySelectorAll('#cm-board-history').length, rect: h?.getBoundingClientRect().toJSON(), display: h && getComputedStyle(h).display};
    });
  }
}
async function settingsSection(page, section) {
  await page.locator(`#cm-dialog [role=tab][data-tab=${section}]`).click();
}
async function placeModule(page, label, side) {
  await utility(page, 'board-tools');
  await page.locator('[data-action=board-modules-settings]').click();
  await page.getByRole('radio', {name: label+': '+side, exact: true}).check();
  await page.getByRole('button', {name: 'Save drawer modules', exact: true}).click();
}
async function fullCoach(page) {
  await utility(page, 'board-tools');
  await page.locator('#cm-board-tools [data-action="board-coach"]').click();
}
async function bindSelection(page) {
  const binding = page.locator('#cm-board-decision [data-action=board-direct]:visible:not([disabled]), #cm-board-decision [data-action=board-confirm]:visible:not([disabled]), #cm-board-decision [data-action=board-flow-confirm]:visible:not([disabled])');
  await binding.first().waitFor();
  eq(await binding.count(), 1, 'the reviewed choice has one enabled binding control');
  await binding.click();
  if (await page.locator('[data-action=board-inspect-close]').count()) await page.locator('[data-action=board-inspect-close]').click();
}
async function useCardOffer(page, card, act) {
  await card.click();
  if(!['undo-mana','undo-land','undo-play'].includes(act)){
    const choice=page.locator('[data-action=board-flow-choice]');
    for(let n=0;await choice.count();n++){ok(n<100,'card flow terminates');await choice.first().click();}
    await page.locator('[data-action=board-flow-confirm]').click();return;
  }
  const offered = page.locator('#cm-card-menu [data-action=board-card-menu-do][data-act="'+act+'"]');
  eq(await offered.count(), 1, 'the selected card offers exactly one '+act+' action');
  await offered.click();
  /* Rob, 2026-10-27: a row that asks nothing more is sent by the press itself; only an offer needing a target is staged for its binding press (both casts here are creatures with none). */
  if (!['undo-mana', 'undo-land', 'undo-play', 'play-land', 'activate-mana', 'cast'].includes(act)) await bindSelection(page);
}
async function openCoachQuestions(page) {
  const questions = page.locator('#cm-board-coach .cm-coach-questions');
  if (!await questions.evaluate(el => el.open)) await questions.locator('summary').click();
}

/* Geometry oracle from unrotated card layout, independent of the renderer's row-minimum formula.
   Tapping may overlap corners; it never increases a slot or moves neighboring cards. */
function tableFacts() {
  /* Table: every board; Focus: the board looked at (the others are tiles behind it, measured by their own check). */
  const focus = document.getElementById('cm-board').dataset.view === 'focus';
  const slots = [...document.querySelectorAll(focus ? '.cm-stage-big' : '.cm-stage-slot')], mats = slots.map((el) => el.querySelector(':scope > .cm-mat')).filter(Boolean);
  const boards = mats.map((mat) => {
    const r = mat.getBoundingClientRect(), cards = [...mat.querySelectorAll('.cm-bcard')], zones = [...mat.querySelectorAll('.cm-board-field,.cm-board-lands')];
    return {seat: mat.dataset.seat, you: mat.classList.contains('is-you'), width: r.width, height: r.height, ratio: Math.abs(r.width * 9 / 16 - r.height) <= 1.5,
      cards: cards.length > 0 && cards.every((c) => Math.abs(c.offsetWidth / c.offsetHeight - 5 / 7) < .02),
      inside: zones.every((z) => {const q = z.getBoundingClientRect(); return q.top >= r.top - 1 && q.bottom <= r.bottom + 1 && q.left >= r.left - 1 && q.right <= r.right + 1;})};
  });
  const host = document.getElementById('cm-board'), rears = [...document.querySelectorAll('.cm-stage-rear')].map((e) => e.getBoundingClientRect().width);
  return {mode: focus ? 'focus' : 'table', boards, valid: boards.length === slots.length && boards.length > 0 && boards.every((b) => b.ratio && b.cards && b.inside), /* Table: the other seats' boards are identical and yours is 12% larger in both directions (Rob, 2026-10-28); Focus has the one. */
    same: (() => {const others = boards.filter((b) => !b.you), mine = boards.filter((b) => b.you); return others.every((b) => Math.abs(b.width - others[0].width) < 1 && Math.abs(b.height - others[0].height) < 1) && mine.every((b) => !others.length || (Math.abs(b.width / others[0].width - 1.12) < 0.02 && Math.abs(b.height / others[0].height - 1.12) < 0.02));})(),
    largest: boards.length > 0 && rears.every((w) => boards[0].width >= w - 1), rears: rears.map(Math.round),
    horizontal: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, scrolls: host.scrollHeight > host.clientHeight + 1};
}
/* Table's boards are as large as the stage gives; when a pair is taller than the window the page scrolls (#cm-board is the scroller, the hand, turn box and
   drawers staying in the window). Every board is then reachable by scrolling: each Lands row lies whole in the window at the scroll that brings it there,
   and is what a pointer finds at its middle. */
async function verifyTableAccess(page, facts) {
  const proof = {...facts}; tableGeometryProof.push(proof);
  if (SHOTS) writeFileSync(path.join(SHOTS, 'table-row-geometry.json'), JSON.stringify(tableGeometryProof, null, 2));
  ok(facts.horizontal, 'the Table boards never introduce horizontal overflow');
  const size = page.viewportSize();
  /* With Actions shut, a question you hold is raised as the pop-up over the table (the stage's ask(), above the boards by design, z-index over them); with Actions open it sits in
     that drawer, which lies over no board's gutter. A pointer reaching the Lands row is measured with the question in the drawer, then Actions is put back as it was. */
  const popped = await page.locator(".cm-stage-region #cm-board-decision").count();
  if (popped) {await rail(page, true); await page.locator(".cm-stage-region #cm-board-decision").waitFor({state: "detached", timeout: 3000});}
  const reached = await page.evaluate(() => {
    const host = document.getElementById('cm-board'), found = [];
    for (const zone of document.querySelectorAll('.cm-stage-slot .cm-board-lands')) {
      let good = false;
      for (const at of [0, host.scrollHeight - host.clientHeight]) {
        host.scrollTop = at;
        const r = zone.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1 && !!hit && zone.contains(hit)) {good = true; break;}
      }
      found.push(good);
    }
    host.scrollTop = 0;
    return found;
  });
  ok(reached.length > 0 && reached.every(Boolean), `each complete Lands row is in the window, at the top or after scrolling down, and reaches the pointer (${size.width}x${size.height}: ${JSON.stringify(reached)}; the stage ${facts.scrolls ? "scrolls" : "fits"})`);
  proof.landsReached = reached;
  if (popped) await rail(page, false);
}

async function verifyCoachUsable(page) {
  try {
    await page.waitForFunction(()=>{
      const input=document.querySelector('#cm-board-coach .cm-coach-input');if(!input||document.activeElement!==input)return false;
      const r=input.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;
    },null,{timeout:5000});
  } catch(error) {
    const failure=await page.evaluate(()=>{
      const panel=document.getElementById('cm-board-coach'),input=panel?.querySelector('.cm-coach-input'),drawer=panel?.closest('.cm-stage-side,.cm-stage-rail'),active=document.activeElement;
      return {mode:document.getElementById('cm-board')?.dataset.coach,dialogOpen:!!document.querySelector('#cm-dialog[open]'),focus:{tag:active?.tagName,action:active?.dataset.action,class:active?.className},focused:active===input,input:input?.getBoundingClientRect().toJSON(),panel:panel?.getBoundingClientRect().toJSON(),drawer:drawer?.getBoundingClientRect().toJSON(),drawerScroll:drawer?.scrollTop};
    });
    if(SHOTS)writeFileSync(path.join(SHOTS,'coach-open-failure.json'),JSON.stringify(failure,null,2));
    error.message+='; Coach open facts: '+JSON.stringify(failure);throw error;
  }
  const facts=await page.locator('#cm-board-coach').evaluate(panel=>{
    const input=panel.querySelector('.cm-coach-input'),thread=panel.querySelector('.cm-coach-thread'),questions=panel.querySelector('.cm-coach-questions>summary'),head=panel.querySelector('.cm-coach-head');
    const root=document.getElementById('cm-board'),module=root.dataset.coach==='module',drawer=panel.closest('.cm-stage-side,.cm-stage-rail');
    const inputRect=input.getBoundingClientRect(),p=panel.getBoundingClientRect(),t=thread.getBoundingClientRect(),q=questions.getBoundingClientRect(),h=head.getBoundingClientRect(),d=drawer?.getBoundingClientRect();
    const at=document.elementFromPoint(inputRect.x+inputRect.width/2,inputRect.y+inputRect.height/2);
    return {module,drawerOpen:!module||!!drawer?.classList.contains('is-open'),width:p.width,
      contained:inputRect.left>=0&&inputRect.right<=innerWidth+1&&inputRect.top>=0&&inputRect.bottom<=innerHeight+1&&(!module||(inputRect.left>=d.left&&inputRect.right<=d.right+1&&inputRect.top>=d.top&&inputRect.bottom<=d.bottom+1)),
      inputHit:!!at&&(input===at||input.contains(at)),focused:document.activeElement===input,
      internals:t.top>=h.bottom-1&&t.bottom<=inputRect.top+1&&q.top>=t.top-1&&q.bottom<=inputRect.top+1&&t.width>0&&t.height>0};
  });
  ok(facts.width>=240&&facts.drawerOpen&&facts.contained&&facts.inputHit&&facts.focused&&facts.internals,
    `explicit Coach open exposes and focuses the real composer with thread and Questions in its actual drawer: ${JSON.stringify(facts)}`);
}

function phaseText(page){return page.locator('.cm-board-step').first().evaluate(el=>el.getAttribute('title')||el.innerText);}
function waitPhase(page,re,timeout=20000){return page.waitForFunction(src=>{const el=document.querySelector('.cm-board-step');return !!el&&new RegExp(src).test(el.getAttribute('title')||el.innerText);},re.source,{timeout});}
