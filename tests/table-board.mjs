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
 *             something to do; the draw its own beat, Draw a card; Resolve naming the spell on the stack, the strip
 *             saying you may respond; Pass on another's turn; both boards following, the step ribbon with them.
 *   Views     the game fills the window. Table (identical 16:9 boards sized to the window, you at the foot, the
 *             Library pile drawn, the logo between them opening Table vitals), Focus (the mat the largest 16:9
 *             beside the pane, the hand docked over its foot), Full screen (the whole window; the other seat across
 *             the top; a picked card large at the side; ⟳ walks the big board round the table); ⎋ leaves; the view
 *             is remembered on the device. Skip to end passes the rest of a turn by itself.
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
 *   Record    once it is over, Download your record (M8b): this is not a playtest table, so it is Rob's own seat's
 *             view and the history, with no seed and nothing of Maya's hand.
 *   Shape     one 48px strip; 5:7 cards sized by width, hand larger than the mat's; no sideways scroll.
 *   B1        Rob's board walk of 2026-09-30 (docs/plan-to-done-2026-09-30.md, PR B1): Full screen asks for the whole
 *             document, so Table vitals and the Coach are seen in it, the Coach docked under the log; the Tools menu's
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

/* THE SERVER, HERE. Each player's deck has cards only they own by name, so a leak can be looked for. Its creatures cost
   one mana, so a land played leaves something to do (B5: a step with nothing to do passes by itself). */
const ROB_INSTANT = (name) => {const m = /^Rob Secret (\d+)$/.exec(name); return !!m && Number(m[1]) % 4 === 2;};
/* Every other one of Rob's spells is an instant at two mana: once he has two lands, he may respond on another player's
   turn, and his button then reads Pass (B5, item 10). */
const cards = (name) => basicCards(name) ?? (ROB_INSTANT(name) ? {types: ["Instant"], manaCost: "{2}"} : {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}"});
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
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  if (method === "GET" && held[email]) await held[email].promise;
  if (method !== "GET") writes.push({path: url.pathname, header: req.headers()["x-crankmagic"], type: req.headers()["content-type"]});
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => object.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
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
      if (r.status !== 101) {server.closed = true; ws.close({code: 1008, reason: "refused"});}
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
  /* The app's own handle, for reading what the library holds once a game is filed. */
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
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
/* The words as written (A1): Moss & Iron sets headings in capitals, so a read turns text-transform off for its own
   instant and reads innerText, line breaks and all. */
const text = (page, sel) => page.locator(sel).first().evaluate((el) => { const s = document.createElement("style"); s.textContent = "*{text-transform:none!important}"; document.head.append(s); const t = el.innerText; s.remove(); return t; });
const waitText = (page, sel, re, timeout = 20000) => page.waitForFunction(([s, src]) => { const el = document.querySelector(s); if (!el) return false; const st = document.createElement("style"); st.textContent = "*{text-transform:none!important}"; document.head.append(st); const t = el.innerText; st.remove(); return new RegExp(src).test(t); }, [sel, re.source], {timeout});
const views = (email) => frames[email].map((f) => JSON.parse(f)).filter((f) => f.view).map((f) => f.view);

try {
  /* THE TABLE, set up through the server as the lobby would: Rob hosts, Maya joins, both ready, it starts. */
  await call("/table/create", ROB, {tableId: TABLE, hostName: "Rob", seats: [{kind: "human", name: "Maya"}]});
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
  await rob.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  await maya.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  ok(routes[ROB].length === 1 && routes[MAYA].length === 1, "the lobby hands each page to the board, and each opens one socket to the table");
  eq([heardBy[ROB].length, heardBy[MAYA].length], [0, 0], "and nothing of the sound is fetched before the first press on the board (a browser would refuse to play it)");
  eq(await rob.page.locator(".cm-board-tile .cm-board-tile-name").allInnerTexts(), ["You · Rob", "Maya"], "the pane holds every seat, yours first here");
  /* Found rendering B1's fixture: the library holds only your own cards, so everyone else's were fetched from Scryfall one
     request each, and a full board is refused faster than it is answered. The shipped card records draw them. */
  const pic = await rob.page.evaluate(() => {const C = globalThis.__cm, mine = new Set(C.cards().map((c) => c.name)), other = C.catalog.all().map((c) => C.catalog.exact(c.name)).find((c) => c && c.image && c.image.startsWith("https://cards.scryfall.io/") && !mine.has(c.name)); return other ? {name: other.name, image: other.image, drawn: C.board.pictureOf(other.name)} : null;});
  ok(pic && pic.drawn === pic.image && !/api.scryfall.com/.test(pic.drawn), `a card no library holds (${pic && pic.name}) is drawn from the shipped card records, not a request to Scryfall per card`);

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
  /* B8: the first press (Keep) armed the sound: the pack's index, and the game's bed. */
  ok(await heard(ROB, "sound-index.json") && await heard(ROB, "bgm/bgm_game_aether_voyage.mp3"), `the first press on the board starts the sound: the pack's index and the game's bed (${heardBy[ROB].join(", ")})`);

  /* HIDDEN: nothing of the other seat's hand or library, in anything the room sent. */
  /* A frame leaks when it names one of the owner's cards that was never made public (`open`: the ones cast in the open). */
  const leaks = (email, owner, open = []) => frames[email].filter((f) => (f.match(new RegExp(`${owner} Secret [0-9]+`, "g")) || []).some((n) => !open.includes(n))).length;
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
  /* B5, item 11: turn 1's upkeep and its draw step (the first player's first draw is skipped, CR 103.8a) have nothing
     to do in them, so they pass by themselves, and the table opens in main 1. */
  await active.page.locator(".cm-board-hand .cm-bcard.is-bright").first().waitFor({timeout: 20000});
  ok(/Main 1/.test(await text(active.page, ".cm-board-step")), `the empty upkeep and draw step pass by themselves: turn 1 opens in main 1, where there is something to do (${(await text(active.page, ".cm-board-step")).trim()})`);
  await waitText(active.page, ".cm-board-band", /Upkeep, Draw step: nothing to do/);
  ok((await active.page.locator(".cm-board-band li.is-quiet").first().innerText()).includes("Upkeep, Draw step: nothing to do"), "and the history says so, in one quieter line: Upkeep, Draw step: nothing to do");
  /* B5, item 10: on your own turn with the stack empty, the button says what passing will do. */
  eq((await text(active.page, ".cm-board-strip [data-action=board-pass]")).trim(), "Next step", "on your own turn, with the stack empty, the button reads Next step");
  eq((await text(active.page, ".cm-board-waiting")).trim(), "", "and the strip does not say Your priority beside it: the button carries it");
  /* B6, item 14: THE HAND TRAY. The count beside the ✋, and the hand by type, castable now over in hand -- the same
     fact that lights a card. */
  const trayOf = (page, seat, email) => page.evaluate(([seat, state]) => {
    const kind = (c) => !c ? "Other" : c.types.includes("Land") ? "Land" : c.types.includes("Instant") || (c.keywords || []).some((k) => /^flash$/i.test(k)) ? "Instant" : c.types.includes("Creature") ? "Creature" : "Other";
    const byId = new Map(state.players[seat].zones.Hand.cards.map((c) => [String(c.cardId), c])), want = {Land: [0, 0], Creature: [0, 0], Instant: [0, 0], Other: [0, 0]};
    for (const el of document.querySelectorAll(".cm-board-hand .cm-board-hand-cards .cm-bcard")) {const k = kind(byId.get(el.dataset.card)); want[k][1] += 1; if (el.classList.contains("is-bright")) want[k][0] += 1;}
    return {count: (document.querySelector(".cm-board-hand .cm-board-hand-count") || {}).textContent, cards: document.querySelectorAll(".cm-board-hand .cm-board-hand-cards .cm-bcard").length,
      shown: Object.fromEntries([...document.querySelectorAll(".cm-board-hand-types li")].map((li) => [li.dataset.type, li.querySelector("b").textContent])),
      want: Object.fromEntries(Object.entries(want).map(([k, [x, y]]) => [k, `${x}/${y}`])), words: document.querySelector(".cm-board-hand").innerText};
  }, [seat, views(email).at(-1).state]);
  const tray1 = await trayOf(active.page, activeSeat, active === rob ? ROB : MAYA);
  ok(tray1.count === String(tray1.cards) && !/Hand ·|Bright = /.test(tray1.words), `the tray gives the hand's count beside the ✋ (${tray1.count}), and neither "Hand · n" nor "Bright = you can use it now"`);
  eq(Object.keys(tray1.shown), ["Land", "Creature", "Instant", "Other"], "and the hand by type: Land, Creature, Instant, Other");
  eq(tray1.shown, tray1.want, `each castable now over in hand, the same count the lit cards give (${Object.entries(tray1.shown).map(([k, v]) => `${k} ${v}`).join(" · ")})`);
  ok(/^([1-9])\/\1$/.test(tray1.shown.Land) && /^0\//.test(tray1.shown.Creature) && /^0\//.test(tray1.shown.Instant), "in main 1 with the land drop unused every land can be played now, and nothing can be cast until there is mana");
  const brightLand = active.page.locator(".cm-board-hand .cm-bcard.is-bright", {hasText: land}).first();
  ok(await brightLand.count() === 1, `with priority in main 1, a ${land} in the hand is bright: it can be played now`);
  ok(await active.page.locator(".cm-board-hand .cm-bcard.is-dim").count() > 0, "and the cards that cannot be used now are dimmed");
  ok(await active.page.locator(".cm-board-ask #cm-board-decision").count() === 0, "priority floats nothing over the board: its cards are bright");
  await active.page.click("[data-action=board-also]");
  const also = await text(active.page, "#cm-board-decision");
  ok(new RegExp(`Play ${land}`).test(also) && !/Pass priority/.test(also) && (also.match(new RegExp(`Play ${land}`, "g")) || []).length === 1, `You can also ▾ says what else can be done, each kind once, Pass left to the strip: "${also.replace(/\s+/g, " ").trim()}"`);
  await active.page.click("[data-action=board-also]");
  const ink = await active.page.evaluate(() => {const el = document.querySelector(".cm-board-hand .cm-bcard .cm-bcard-name"); return getComputedStyle(el).color;});
  eq(ink, "rgb(31, 28, 24)", "a card's name is printed in the card's own dark ink, not the mat's light one");
  await shot(active.page, "board-priority-" + (active === rob ? "1400" : "1280"));
  await brightLand.click();
  await waitText(active.page, ".cm-board-lands", /Lands · 1/);
  ok(/land drop used/i.test(await text(active.page, ".cm-board-mat .cm-board-chip")), "tapping it plays it: Lands · 1, the land drop used (the reminder under the Lands says so)");
  ok(await heard(active === rob ? ROB : MAYA, "sfx/sfx_play_land.mp3"), "and it sounds as a land played (the pack's land voice)");
  await other.page.click(`.cm-board-tile[data-seat='${activeSeat}'] [data-action=board-focus]`);
  await waitText(other.page, ".cm-board-lands", /Lands · 1/);
  ok((await text(other.page, ".cm-board-lands")).includes(land), "the other board shows the same land, now public");
  /* With the land down there is its mana, and a creature it could pay for: Next step passes, and taps nothing. */
  await active.page.click("[data-action=board-also]");
  ok(/Tap for mana/.test(await text(active.page, "#cm-board-decision")), "the land played, You can also ▾ offers its mana");
  await active.page.click("[data-action=board-also]");
  await active.page.click("[data-action=board-pass]");
  /* B5, items 10 and 11: one click, and the steps with nothing to do in them pass by themselves -- combat, with no
     creature to attack with -- landing on main 2, where the creature could still be cast. */
  await waitText(active.page, ".cm-board-step", /Main 2/);
  eq(await active.page.locator(".cm-board-lands .cm-bcard.is-tapped").count(), 0, "Next step hands priority on, and taps nothing");
  ok(/Main 2/.test(await text(active.page, ".cm-board-step")) && (await text(active.page, ".cm-board-strip [data-action=board-pass]")).trim() === "Next step",
    "one click of Next step lands on the next step with something to do: main 2");
  await waitText(active.page, ".cm-board-band", /Beginning of combat, Declare attackers, End of combat: nothing to do/);
  ok(true, "and the combat steps it passed through, empty, say so in one line: Beginning of combat, Declare attackers, End of combat: nothing to do");

  /* HISTORY: the table's history, public, newest first; a band on the Focus mat, and History ▾ with a filter. */
  const who = active === rob ? "Rob" : "Maya";
  await waitText(other.page, ".cm-board-band", new RegExp(`${who} played ${land}`));
  const bandRows = await other.page.locator(".cm-board-band li").allInnerTexts();
  ok(bandRows[0].includes("nothing to do") && bandRows[1].includes(`${who} played ${land}`), `the history band on the mat says it, newest first: "${who} played ${land}", under the empty steps after it (${bandRows.slice(0, 2).join(" | ")})`);
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
  await active.page.click(".cm-board-strip [data-action=board-history]");
  await active.page.click("#cm-board-history .cm-history-filter");
  ok(await active.page.locator("#cm-board-history").count() === 1, "a press inside History ▾ (its filter) keeps it open");
  await active.page.click(".cm-board-mat .cm-mat-name");
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
  await rob.page.click("[data-action=board-menu]");
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
  await rob.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  ok(await rob.page.locator("#cm-game-on").count() === 0 && routes[ROB].length === robSockets, "Game on brings the board back, on the same socket, and puts itself away");
  await rob.page.click("[data-action=board-menu]");
  await rob.page.click("#cm-board-nav a[href='#decks']");
  await rob.page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
  await rob.page.click(".cm-sidebar a[data-nav=game]");
  await rob.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  ok(/^#table\?id=/.test(await rob.page.evaluate(() => location.hash)) && routes[ROB].length === robSockets, "Play opens straight onto the game, on the same socket");
  ok(awayFrames() === awayBefore && !/Dropped/.test(await text(maya.page, ".cm-board-tile[data-seat='0'] .cm-board-tile-flag")), "and through all of it the room never marked Rob's seat away");

  /* THE THREE VIEWS. Table: both boards at once, you at the foot, the logo between them opening Table vitals. */
  await rob.page.click("[data-action=board-view][data-view=table]");
  await rob.page.locator(".cm-board-table .cm-seatboard").nth(1).waitFor();
  const tableGeo = await rob.page.evaluate(() => {
    const box = (q) => document.querySelector(q).getBoundingClientRect();
    const mine = box(".cm-seatboard.is-you"), theirs = box(".cm-seatboard:not(.is-you)"), center = box(".cm-board-center"), host = box("#cm-board");
    const ring = getComputedStyle(document.querySelector(".cm-seatboard.is-you")).boxShadow;
    const table = document.querySelector(".cm-board-table").getBoundingClientRect(), tray = box(".cm-board-hand");
    return {mineBelow: mine.top >= theirs.bottom, ring: /2px/.test(ring), same: Math.abs(mine.width - theirs.width) < 1 && Math.abs(mine.height - theirs.height) < 1,
      ratio: Math.round(mine.width / mine.height * 100) / 100, fits: mine.width <= table.width && theirs.top >= table.top - 1 && mine.bottom <= table.bottom + 1,
      largest: Math.min(table.width, (table.height - parseFloat(getComputedStyle(document.querySelector(".cm-board-table")).rowGap)) / 2 * 16 / 9) - mine.width < 2,
      whole: host.left === 0 && host.top === 0 && host.width === innerWidth && host.height === innerHeight,
      library: document.querySelectorAll(".cm-seatboard [data-zone=library]").length, trayBelow: tray.top >= mine.bottom,
      logo: (document.querySelector(".cm-board-center img") || {}).src || "",
      centerBetween: center.top < mine.top && center.bottom > theirs.bottom, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth};
  });
  ok(tableGeo.whole, "the game fills the window: the board is the whole viewport, the rail under it");
  ok(tableGeo.mineBelow && tableGeo.ring, "Table view: Rob's board at the foot in a brass ring, Maya's above");
  ok(tableGeo.same && Math.abs(tableGeo.ratio - 1.78) < 0.02 && tableGeo.fits && tableGeo.largest, `the boards are identical 16:9 (${tableGeo.ratio}), the largest that fit the tabletop`);
  ok(tableGeo.library === 2 && tableGeo.trayBelow, "each board draws its Library pile, and the hand sits along the foot below the boards");
  ok(tableGeo.centerBetween && tableGeo.sideways === 0 && /logo-wand/.test(tableGeo.logo), "the wand logo sits in the gap between the boards, and nothing scrolls sideways");
  ok((await text(rob.page, `.cm-seatboard[data-seat='${activeSeat}']`)).includes(land), "the land played is on its owner's board in the Table view too");
  await shot(rob.page, "board-table-1400");
  await rob.page.click(".cm-board-center");
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
  await rob.page.locator(".cm-seatboard:not(.is-you) [data-action=board-vitals]").click();
  await rob.page.locator(".cm-table-vitals").waitFor();
  ok(true, "any seat's vitals pill opens Table vitals too");
  await rob.page.keyboard.press("Escape");

  /* B4, THE TABLE VIEW'S SHAPE (docs/plan-to-done-2026-09-30.md, items 3-9). Still: the sea is painted once. */
  const seaAt = () => rob.page.evaluate(() => {const c = document.querySelector(".cm-board-table > .cm-board-sea"), f = document.querySelector(".cm-board-table > .cm-board-fan"); return {t: c ? c.dataset.t : null, fan: f ? getComputedStyle(f).transitionDuration : null};});
  const sea1 = await seaAt();
  await rob.page.waitForTimeout(1200);
  const sea2 = await seaAt();
  ok(sea1.t === "0.00" && sea2.t === "0.00" && (sea2.fan === null || sea2.fan === "0s"), `the tabletop is still: the sea painted once, at its first moment, and does not move (${sea1.t} → ${sea2.t})${sea2.fan === null ? "" : "; the fan does not fade"}`);
  /* The life counter at the true center: a slice per seat in its own color, each seat's life on its own side. */
  const pie = await rob.page.evaluate(() => {
    const el = document.querySelector(".cm-board-table > .cm-board-pie"), r = el.getBoundingClientRect(), tbl = document.querySelector(".cm-board-table").getBoundingClientRect();
    const theirs = document.querySelector(".cm-board-table .cm-seatboard:not(.is-you)").getBoundingClientRect(), mine = document.querySelector(".cm-board-table .cm-seatboard.is-you").getBoundingClientRect();
    const mid = r.top + r.height / 2, bg = getComputedStyle(el).backgroundImage;
    const life = (seat) => document.querySelector(`.cm-board-table .cm-seatboard[data-seat='${seat}'] .cm-vitals b`).textContent;
    const totals = [...el.querySelectorAll(".cm-board-pie-life")].map((b) => {const q = b.getBoundingClientRect(); return {seat: b.dataset.seat, n: b.textContent, above: q.top + q.height / 2 < mid, pill: life(b.dataset.seat)};});
    return {dx: r.left + r.width / 2 - (tbl.left + tbl.width / 2), dy: mid - (theirs.bottom + mine.top) / 2, conic: /conic-gradient/.test(bg), colors: new Set(bg.match(/(rgba?|color|oklab|oklch|lab)\([^)]*\)/g) || []).size,
      totals, logo: !!el.querySelector(".cm-board-center img"), round: Math.abs(r.width - r.height) < 1};
  });
  ok(Math.abs(pie.dx) < 2 && Math.abs(pie.dy) < 2 && pie.round && pie.logo, `the life counter sits at the true center, between the rows and across the middle, the logo in it (${pie.dx.toFixed(1)}, ${pie.dy.toFixed(1)})`);
  ok(pie.conic && pie.colors >= 2 && pie.totals.length === 2 && pie.totals.every((t) => t.n === t.pill) && pie.totals.find((t) => t.seat === "1").above && !pie.totals.find((t) => t.seat === "0").above,
    `a slice per seat, each its own color, its life on it: Maya's on the top half over her board, Rob's on the bottom (${pie.totals.map((t) => `${t.seat}:${t.n}`).join(", ")}; ${pie.colors} colors)`);
  /* The pile cards on top of their frames, over the frame's lines; the reminder below the Lands. */
  const pileOver = (page, q) => page.evaluate((sel) => {
    const f = document.querySelector(sel), c = f.querySelector(".cm-bcard"), fr = f.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const hit = document.elementFromPoint(fr.left + fr.width / 2, fr.top + 0.5);
    return {crosses: cr.left < fr.left && cr.right > fr.right && cr.top < fr.top, over: !!hit && c.contains(hit), by: [Math.round((fr.left - cr.left) * 10) / 10, Math.round((cr.right - fr.right) * 10) / 10]};
  }, q);
  const libT = await pileOver(rob.page, ".cm-board-table .cm-seatboard.is-you [data-zone=library]");
  ok(libT.crosses && libT.over, `the Library's card sits on top of its frame, over its lines, not inside it (${libT.by.join("px, ")}px past the sides)`);
  const chip = await rob.page.evaluate(() => {const m = document.querySelector(".cm-board-table .cm-seatboard.is-you"), l = m.querySelector("[data-zone=lands]"), c = m.querySelector(".cm-board-chip"), lr = l.getBoundingClientRect(), cr = c.getBoundingClientRect();
    return {inside: l.contains(c), below: cr.top - lr.bottom, right: Math.abs(cr.right - lr.right), text: c.textContent};});
  ok(!chip.inside && chip.below >= 0 && chip.below < 8 && chip.right < 2, `the mana and land-drop reminder sits directly outside and below the Lands frame, at its right ("${chip.text}", ${chip.below.toFixed(1)}px below)`);
  /* The bar between the rows: dragged down, Maya's row grows and Rob's gives way; both stay 16:9. */
  const geoT = () => rob.page.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect(), theirs = r(".cm-board-table .cm-seatboard:not(.is-you)"), mine = r(".cm-board-table .cm-seatboard.is-you");
    const pie = r(".cm-board-table > .cm-board-pie"), bar = r(".cm-board-rowbar");
    return {tw: theirs.width, th: theirs.height, mw: mine.width, mh: mine.height, trayTop: r(".cm-board-hand").top, hand: parseFloat(getComputedStyle(document.querySelector(".cm-board-hand .cm-board-hand-cards .cm-bcard")).width),
      centered: Math.abs(pie.top + pie.height / 2 - (theirs.bottom + mine.top) / 2) < 2 && Math.abs(bar.top + bar.height / 2 - (theirs.bottom + mine.top) / 2) < 2};
  });
  const rowsKept = () => rob.page.evaluate(() => localStorage.getItem("cm-board-rows"));
  const even = await geoT();
  const rowGrip = await rob.page.locator(".cm-board-rowbar [data-drag=rows]").boundingBox();
  await rob.page.mouse.move(rowGrip.x + 40, rowGrip.y + rowGrip.height / 2);
  await rob.page.mouse.down();
  await rob.page.mouse.move(rowGrip.x + 40, rowGrip.y + rowGrip.height / 2 + 40, {steps: 4});
  await rob.page.mouse.move(rowGrip.x + 40, rowGrip.y + rowGrip.height / 2 + 80, {steps: 4});
  await rob.page.mouse.up();
  const dragged = await geoT(), share = Number(await rowsKept());
  ok(dragged.tw > even.tw + 20 && dragged.mw < even.mw - 20 && Math.abs(dragged.tw / dragged.th - 16 / 9) < 0.02 && Math.abs(dragged.mw / dragged.mh - 16 / 9) < 0.02 && share > 0.55 && dragged.centered,
    `the bar between the rows drags: 80px down, Maya's row grows and Rob's gives way, both still 16:9, the bar and the life counter kept between them (${even.tw.toFixed(0)} → ${dragged.tw.toFixed(0)}px over ${even.mw.toFixed(0)} → ${dragged.mw.toFixed(0)}px; share ${share})`);
  await rob.page.click("[data-action=board-view][data-view=focus]");
  await rob.page.locator(".cm-board-mat").waitFor();
  const libF = await pileOver(rob.page, ".cm-board-mat [data-zone=library]");
  ok(libF.crosses && libF.over, `on the Focus mat too, the Library's card is on top of its frame (${libF.by.join("px, ")}px past the sides)`);
  await rob.page.click("[data-action=board-view][data-view=table]");
  await rob.page.locator(".cm-board-table .cm-seatboard").nth(1).waitFor();
  const redrawn = await geoT();
  ok(Math.abs(redrawn.tw - dragged.tw) < 1 && Math.abs(redrawn.mw - dragged.mw) < 1 && Number(await rowsKept()) === share, "and the share is remembered on the device: the Table view drawn again keeps the rows as they were left");
  await rob.page.focus(".cm-board-rowbar [data-drag=rows]");
  for (let i = 0; i < 20; i += 1) await rob.page.keyboard.press("ArrowUp");
  const keyed = await geoT(), low = Number(await rowsKept());
  ok(low === 0.3 && keyed.tw < keyed.mw && (await rob.page.getAttribute(".cm-board-rowbar [data-drag=rows]", "aria-valuenow")) === "30", `the arrow keys move it too, and it stops at 30% of the height (${low})`);
  for (let i = 0; i < 10; i += 1) await rob.page.keyboard.press("ArrowDown");
  const back = await geoT();
  ok(Number(await rowsKept()) === 0.5 && Math.abs(back.tw - back.mw) < 1 && Math.abs(back.tw - even.tw) < 1, "and back at half, the boards are identical again");
  /* The bar atop the hand tray: dragged up, the hand's cards grow and every board gives way alike. */
  const trayGrip = await rob.page.locator(".cm-board-traybar [data-drag=hand]").boundingBox();
  await rob.page.mouse.move(trayGrip.x + 40, trayGrip.y + trayGrip.height / 2);
  await rob.page.mouse.down();
  await rob.page.mouse.move(trayGrip.x + 40, trayGrip.y + trayGrip.height / 2 - 20, {steps: 3});
  await rob.page.mouse.move(trayGrip.x + 40, trayGrip.y + trayGrip.height / 2 - 40, {steps: 3});
  await rob.page.mouse.up();
  const grown = await geoT(), handOut = (await text(rob.page, ".cm-board-traybar output")).trim();
  ok(grown.hand > even.hand * 1.2 && grown.tw < even.tw - 10 && Math.abs(grown.tw - grown.mw) < 1 && Math.abs(grown.th - grown.mh) < 1 && grown.trayTop < even.trayTop - 20 && /^1[2-9]\d%$/.test(handOut),
    `the bar atop the hand tray drags: 40px up, the hand's cards grow (${even.hand.toFixed(0)} → ${grown.hand.toFixed(0)}px, ${handOut}) and every board gives way alike (${even.tw.toFixed(0)} → ${grown.tw.toFixed(0)}px, still identical)`);
  /* The three card sizes: the board's and the hand's each their own; Tools sets both to its value. */
  const sizes = () => rob.page.evaluate(() => {
    const land = document.querySelector(".cm-board-table [data-zone=lands] .cm-bcard"), board = land.closest(".cm-seatboard"), host = getComputedStyle(document.getElementById("cm-board"));
    return {board: parseFloat(getComputedStyle(land).width) / board.getBoundingClientRect().width, hand: parseFloat(getComputedStyle(document.querySelector(".cm-board-hand .cm-board-hand-cards .cm-bcard")).width),
      scopes: [host.getPropertyValue("--board-scale").trim(), host.getPropertyValue("--hand-scale").trim()], outs: [...document.querySelectorAll("#cm-board .cm-board-scale output")].map((o) => o.textContent)};
  });
  await rob.page.locator(".cm-board-traybar [data-board-scale=hand]").fill("100");
  const s100 = await sizes();
  await rob.page.locator(".cm-board-rowbar [data-board-scale=board]").fill("80");
  const sBoard = await sizes();
  ok(Math.abs(sBoard.board / s100.board - 0.8) < 0.03 && Math.abs(sBoard.hand - s100.hand) < 0.5 && sBoard.scopes[0] === "0.8" && sBoard.outs[0] === "80%",
    `Board cards, on the bar between the rows, sizes the boards' cards alone (to ${(sBoard.board / s100.board * 100).toFixed(0)}%; the hand stays ${sBoard.hand.toFixed(0)}px)`);
  await rob.page.locator(".cm-board-traybar [data-board-scale=hand]").fill("130");
  const sHand = await sizes();
  ok(Math.abs(sHand.hand / s100.hand - 1.3) < 0.02 && Math.abs(sHand.board - sBoard.board) < 0.0005 && sHand.scopes[1] === "1.3" && sHand.outs[1] === "130%",
    `Hand cards, on the tray's bar, sizes the hand's cards alone (${s100.hand.toFixed(0)} → ${sHand.hand.toFixed(0)}px; the boards' cards keep their size on their boards)`);
  await rob.page.click("[data-action=board-tools]");
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("120");
  const sTools = await sizes();
  ok(sTools.scopes.join() === "1.2,1.2" && sTools.outs.join() === "120%,120%" && Math.abs(sTools.board / s100.board - 1.2) < 0.03 && Math.abs(sTools.hand / s100.hand - 1.2) < 0.02,
    `Tools is the table's card size, and moving it sets Board cards and Hand cards to its value (${sTools.outs.join(", ")})`);
  await rob.page.locator("#cm-board-tools [data-card-scale]").fill("100");
  await rob.page.click("[data-action=board-tools]");
  eq((await sizes()).outs, ["100%", "100%"], "and back to 100%, all three agree");
  await rob.page.locator(".cm-seatboard:not(.is-you) [data-action=board-focus]").click();
  await rob.page.locator(".cm-board-mat").waitFor();
  ok(/Maya's hand/.test(await text(rob.page, ".cm-board-mat")) && await rob.page.getAttribute("#cm-board", "data-view") === "focus", "⤢ Focus on Maya's board puts it on the mat, in the Focus view");
  await rob.page.click(".cm-board-tile[data-seat='0'] [data-action=board-focus]");

  /* B7, item 15: THE PANE'S DIVIDER. Dragged wider, the tiles grow with it, and past 300px each is a miniature of that
     seat's real board; the mat stays the largest 16:9 beside it; the width is remembered. */
  const paneGeo = () => rob.page.evaluate(() => {
    const pane = document.querySelector(".cm-board-pane").getBoundingClientRect(), mat = document.querySelector(".cm-board-mat").getBoundingClientRect(), main = document.querySelector(".cm-board-main").getBoundingClientRect(), tray = document.querySelector(".cm-board-main > .cm-board-hand").getBoundingClientRect();
    const tile = document.querySelector(".cm-board-tile[data-seat='1']"), mine = document.querySelector(".cm-board-tile[data-seat='0']");
    return {pane: Math.round(pane.width), tile: Math.round(tile.getBoundingClientRect().width), mini: document.querySelectorAll(".cm-board-tile.is-mini .cm-board-mini .cm-mat[data-fit=mini]").length,
      robLands: mine.querySelectorAll(".cm-board-mini [data-zone=lands] .cm-bcard").length, inert: !!tile.querySelector(".cm-board-mini[inert]"),
      matW: mat.width, largest: Math.min(main.width - 16, (main.height - 8 - 8 - tray.height) * 16 / 9) - mat.width < 2, ratio: Math.round(mat.width / mat.height * 100) / 100};
  });
  const pane0 = await paneGeo();
  const paneGrip = await rob.page.locator(".cm-board-panegrip [data-drag=pane]").boundingBox();
  await rob.page.mouse.move(paneGrip.x + paneGrip.width / 2, paneGrip.y + 200);
  await rob.page.mouse.down();
  await rob.page.mouse.move(paneGrip.x + paneGrip.width / 2 + 100, paneGrip.y + 200, {steps: 4});
  await rob.page.mouse.move(paneGrip.x + paneGrip.width / 2 + 200, paneGrip.y + 200, {steps: 4});
  await rob.page.mouse.up();
  const pane1 = await paneGeo();
  ok(pane0.pane === 168 && Math.abs(pane1.pane - 368) <= 2 && pane1.tile > pane0.tile + 150 && pane1.matW < pane0.matW && pane1.largest && Math.abs(pane1.ratio - 1.78) < 0.02,
    `the divider between the pane and the mat drags: 200px right, the pane ${pane0.pane} → ${pane1.pane}px, the tiles growing with it, the mat still the largest 16:9 beside it`);
  ok(pane0.mini === 0 && pane1.mini === 2 && pane1.robLands >= 1 && pane1.inert, `and past 300px each tile is a miniature of that seat's board, cards and all (the Forest on Rob's: ${pane1.robLands}), only to look at`);
  await shot(rob.page, "pane-miniatures-1400");
  await rob.page.locator(".cm-board-tile[data-seat='1'] .cm-board-tile-main").click();
  await rob.page.waitForFunction(() => /Maya's hand/.test(document.querySelector(".cm-board-mat")?.innerText || ""), null, {timeout: 5000});
  ok(true, "a miniature is still the tile: a click on it puts that seat's board on the mat");
  await rob.page.locator(".cm-board-tile[data-seat='0'] .cm-board-tile-main").click();
  await rob.page.click("[data-action=board-view][data-view=table]");
  await rob.page.click("[data-action=board-view][data-view=focus]");
  await rob.page.locator(".cm-board-mat").waitFor();
  const pane2 = await paneGeo();
  ok(pane2.pane === pane1.pane && pane2.mini === 2 && Number(await rob.page.evaluate(() => localStorage.getItem("cm-board-pane"))) === pane1.pane, "and the width is remembered on the device: the Focus view drawn again keeps it");
  await rob.page.focus(".cm-board-panegrip [data-drag=pane]");
  for (let i = 0; i < 10; i += 1) await rob.page.keyboard.press("ArrowLeft");
  const pane3 = await paneGeo();
  ok(pane3.pane === pane1.pane - 200 && pane3.mini === 0, `the arrow keys move it too, 20px a press: back to ${pane3.pane}px, and the tiles are plain tiles again`);

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
  /* B7, item 18: Full screen's side column has the same bar between its card and its log: dragged up, the card keeps
     5:7 in the smaller share and the log below gets the room. */
  const sideGeo = () => maya.page.evaluate(() => {const c = document.querySelector("#cm-full-pick .cm-bcard").getBoundingClientRect(), log = document.querySelector(".cm-full-side .cm-board-band").getBoundingClientRect(); return {w: c.width, ratio: Math.round(c.width / c.height * 1000) / 1000, log: log.height};});
  const sg0 = await sideGeo();
  const sideGrip = await maya.page.locator(".cm-full-side [data-drag=side]").boundingBox();
  await maya.page.mouse.move(sideGrip.x + 30, sideGrip.y + sideGrip.height / 2);
  await maya.page.mouse.down();
  await maya.page.mouse.move(sideGrip.x + 30, sideGrip.y + sideGrip.height / 2 - 80, {steps: 4});
  await maya.page.mouse.move(sideGrip.x + 30, sideGrip.y + sideGrip.height / 2 - 160, {steps: 4});
  await maya.page.mouse.up();
  const sg1 = await sideGeo();
  ok(sg1.w < sg0.w - 20 && Math.abs(sg1.ratio - 5 / 7) < 0.01 && sg1.log > sg0.log + 100, `Full screen's side column has the same divider: 160px up, the card ${sg0.w.toFixed(0)} → ${sg1.w.toFixed(0)}px, still 5:7, the log ${sg0.log.toFixed(0)} → ${sg1.log.toFixed(0)}px`);
  await maya.page.evaluate(() => localStorage.removeItem("cm-board-split:side"));
  await maya.page.click("[data-action=board-view][data-view=focus][aria-label='Leave full screen']");
  await maya.page.locator(".cm-board-strip").waitFor();
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "focus", "⎋ leaves Full screen for Focus");
  await maya.page.click("[data-action=board-view][data-view=full]");
  await maya.page.locator(".cm-full-rail").waitFor();
  const pillClear = await maya.page.evaluate(() => {const pill = document.querySelector(".cm-full-pill").getBoundingClientRect(), first = document.querySelector(".cm-full-mine .cm-seatboard-body").getBoundingClientRect(); return first.top >= pill.bottom;});
  ok(pillClear, "the step and Pass pill sits over her board without covering its first row");
  await maya.page.click(".cm-full-rail [data-action=board-rotate]");
  await maya.page.locator(".cm-full-mine .cm-seatboard[data-seat='0']").waitFor();
  ok(/Viewing Rob/.test(await text(maya.page, ".cm-full-viewing")) && await maya.page.locator(".cm-full-others .cm-seatboard.is-you").count() === 1 && await maya.page.locator(".cm-full-mine .cm-board-hand .cm-bcard").count() > 0, "⟳ walks the big board round the table: Rob's board large, hers across the top, her own hand still along the foot");
  ok(!(await maya.page.content()).includes("Rob Secret"), "and nothing of his hand came with it");
  /* B7, item 20: rotated to another seat, the tray shows that seat's hand as the backs of its cards, Rob's art in the
     seat's color (tan, here, for a commander no library knows), as many as he holds and never a face. */
  const backs = await maya.page.evaluate(() => {
    const tray = document.querySelector(".cm-full-mine .cm-board-hand"), cards = [...tray.querySelectorAll(".cm-bcard")];
    return {backs: tray.classList.contains("is-backs"), n: cards.length, all: cards.every((c) => c.classList.contains("is-back") && !c.dataset.card), art: getComputedStyle(cards[0]).backgroundImage, label: tray.getAttribute("aria-label"),
      pile: getComputedStyle(document.querySelector(".cm-full-mine [data-zone=library] .cm-bcard")).backgroundImage};
  });
  const robHandCount = views(MAYA).at(-1).state.players[0].zones.Hand.count;
  ok(backs.backs && backs.n === robHandCount && backs.all && /card-back-tan\.webp/.test(backs.art), `the tray shows Rob's hand as ${backs.n} backs, as many as he holds (${robHandCount}), in Rob's card back, and not one face ("${backs.label}")`);
  ok(/card-back-tan\.webp/.test(backs.pile), "and his library is drawn with the same back");
  await shot(maya.page, "rotated-backs-1280");
  await maya.page.click(".cm-full-viewing [data-action=board-focus]");
  await maya.page.locator(".cm-full-mine .cm-seatboard.is-you").waitFor();
  ok(true, "My board brings hers back");
  await maya.page.keyboard.press("Escape");
  await maya.page.locator(".cm-board-strip").waitFor();
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "focus", "and so does Escape");

  /* Where the browser will, Full screen asks it for the whole screen, and gives it back on the way out. B1, item 22: it
     asks for the whole DOCUMENT -- a browser shows only the fullscreen element's own subtree, and the Coach and the
     app's dialogs live beside the board -- so Table vitals and the Coach are seen in it. */
  await rob.page.click("[data-action=board-view][data-view=full]");
  await rob.page.waitForFunction(() => document.fullscreenElement === document.documentElement, null, {timeout: 10000});
  ok(true, "where the browser allows it, Full screen is the whole screen, asked for the whole document");
  const seenAt = (page, sel) => page.evaluate((q) => {const el = document.querySelector(q); if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(60, r.height / 2)); return r.width > 0 && !!hit && !!hit.closest(q);}, sel);
  await rob.page.click(".cm-full-side .cm-full-vitals [data-action=board-vitals]");
  await rob.page.locator("#cm-dialog[open] .cm-table-vitals").waitFor();
  ok(await seenAt(rob.page, "#cm-dialog[open]"), "in the browser's full screen, Table vitals is seen over the game");
  await rob.page.click("#cm-dialog[open] .cm-form-footer [data-action=close]");
  await rob.page.click(".cm-full-rail [aria-label='CrankMagic Coach']");
  await rob.page.locator("#cm-board-coach:not([hidden]) .cm-coach-input").waitFor();
  const docked = await rob.page.evaluate(() => {
    const c = document.getElementById("cm-board-coach").getBoundingClientRect(), side = document.querySelector(".cm-full-side").getBoundingClientRect(), band = document.querySelector(".cm-full-side .cm-board-band").getBoundingClientRect(), host = document.getElementById("cm-board").getBoundingClientRect();
    return {col: Math.abs(c.left - side.left) < 1 && Math.abs(c.width - side.width) < 1, under: c.top >= band.bottom - 0.5 && c.top >= side.bottom, lower: c.top > host.top + host.height * 0.45 && c.bottom <= host.bottom + 0.5, width: Math.round(c.width)};
  });
  ok(await seenAt(rob.page, "#cm-board-coach") && docked.col && docked.under && docked.lower, `and the Coach is seen, in the side column's lower half under the log (${docked.width}px), not a slide-over`);
  await shot(rob.page, "coach-full-1400");
  await rob.page.click("#cm-board-coach [aria-label='Close the Coach']");
  /* B1, item 23: the rail squares its own buttons, not the ones in the menus it opens. */
  await rob.page.click(".cm-full-rail [aria-label='Tools']");
  await rob.page.locator("#cm-board-tools").waitFor();
  const toolsMenu = await rob.page.evaluate(() => {
    const bs = [...document.querySelectorAll("#cm-board-tools .v-button")].map((el) => ({r: el.getBoundingClientRect(), clipped: el.scrollWidth > el.clientWidth + 1}));
    const overlap = bs.some((a, i) => bs.some((b, j) => j > i && a.r.left < b.r.right - 1 && b.r.left < a.r.right - 1 && a.r.top < b.r.bottom - 1 && b.r.top < a.r.bottom - 1));
    return {n: bs.length, overlap, clipped: bs.filter((x) => x.clipped).length, narrow: bs.filter((x) => x.r.width <= 40).length};
  });
  ok(toolsMenu.n >= 4 && !toolsMenu.overlap && !toolsMenu.clipped && !toolsMenu.narrow, `in Full screen the Tools menu's ${toolsMenu.n} buttons are whole: none overlaps another, none is squared or clipped`);
  await shot(rob.page, "tools-full-1400");
  await rob.page.click(".cm-full-rail [aria-label='Tools']");
  await rob.page.click("[aria-label='Leave full screen']");
  await rob.page.waitForFunction(() => !document.fullscreenElement, null, {timeout: 10000});
  ok(true, "and ⎋ gives the screen back");

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

  /* SKIP TO END: the active player's board passes for them from here to the turn's end, by itself. */
  await active.page.click("[data-action=board-skip]");
  ok(/Skipping/.test(await text(active.page, "[data-action=board-skip]")), "Skip to end says it is skipping");
  await waitText(active.page, ".cm-board-waiting", new RegExp(`Waiting on ${active === rob ? "Maya" : "Rob"}`), 10000);
  ok(true, "and the board passed priority for them, unasked");
  /* B5, item 13: THE DRAW, ITS OWN BEAT. Turn 2 opens on the other player's draw step and one button, Draw a card; their
     hand waits for the click, and the click draws. */
  const drawButton = other.page.locator(".cm-board-strip [data-action=board-draw]:not([disabled])");
  await drawButton.waitFor({timeout: 20000});
  const handBefore = await other.page.locator(".cm-board-hand .cm-bcard").count();
  const drawStrip = {turn: await text(other.page, ".cm-board-turn"), step: (await text(other.page, ".cm-board-step")).trim(), label: (await drawButton.innerText()).trim(),
    passes: await other.page.locator(".cm-board-strip [data-action=board-pass]").count(), floats: await other.page.locator(".cm-board-ask #cm-board-decision").count()};
  ok(/Turn 2/.test(drawStrip.turn) && drawStrip.step === "Draw" && drawStrip.label === "Draw a card" && drawStrip.passes === 0 && drawStrip.floats === 0,
    `turn 2 opens in the draw step on one button, Draw a card, with nothing floated over the board (${drawStrip.step}: "${drawStrip.label}")`);
  await other.page.waitForTimeout(400);
  eq(await other.page.locator(".cm-board-hand .cm-bcard").count(), handBefore, "and the hand waits for the click: nothing is drawn unasked");
  await shot(other.page, "draw-beat-" + (other === rob ? "1400" : "1280"));
  await drawButton.click();
  await other.page.waitForFunction((n) => document.querySelectorAll(".cm-board-hand .cm-bcard").length === n + 1, handBefore, {timeout: 10000});
  ok(true, "the click draws the card: the hand is one larger");
  ok(await heard(other === rob ? ROB : MAYA, "sfx/sfx_event_draw.mp3"), "and the draw is heard");
  /* Both boards follow into turn 2, and the room asked only where there was something to do (items 10 and 11). */
  await waitText(rob.page, ".cm-board-turn", /Turn 2/);
  await waitText(maya.page, ".cm-board-turn", /Turn 2/);
  const askedIn = new Set([...views(ROB), ...views(MAYA)].filter((v) => v.decision && v.state.turn >= 1 && v.state.turn <= 2).map((v) => v.state.phase));
  ok(["MAIN1", "MAIN2", "DRAW"].every((p) => askedIn.has(p)) && [...askedIn].every((p) => ["MAIN1", "MAIN2", "DRAW"].includes(p)),
    `Next step walks the steps into turn 2, on both boards, and the room asked someone only where there was something to do (${[...askedIn].join(", ")}); the rest passed by themselves`);
  ok((await text(active.page, "[data-action=board-skip]")).trim() === "Skip to end", "at the turn's end Skip to end puts itself away");
  eq(await rob.page.locator(".cm-board-mat .cm-board-ribbon li.is-now").count() + await maya.page.locator(".cm-board-mat .cm-board-ribbon li.is-now").count(), 1, "the step ribbon lights the current step on the active player's own board");

  /* CARD SIZE: the app's slider, in Tools; ⌘/Ctrl − steps it. */
  const handWidth = (page) => page.evaluate(() => document.querySelector(".cm-board-hand .cm-bcard").getBoundingClientRect().width);
  const w100 = await handWidth(rob.page);
  await rob.page.click("[data-action=board-tools]");
  ok(/60% – 160%/.test(await text(rob.page, "#cm-board-tools .cm-board-size")), "Tools carries the card-size slider, 60% to 160%");
  /* B8: Tools › Sound, the pack's three settings: the effects and the music as sliders, and a mute, remembered. */
  eq(await rob.page.locator("#cm-board-tools [data-board-sound]").evaluateAll((els) => els.map((el) => [el.dataset.boardSound, el.min, el.max, el.value])), [["sfx", "0", "100", "50"], ["bgm", "0", "100", "18"]], "Tools › Sound: Effects at 50% and Music at 18%, each a slider from 0 to 100%");
  await rob.page.locator("#cm-board-tools [data-board-sound=sfx]").fill("30");
  await rob.page.click("#cm-board-tools [data-action=board-mute]");
  const soundKept = await rob.page.evaluate(() => [localStorage.getItem("crankmagic-audio-sfx"), localStorage.getItem("crankmagic-audio-muted")]);
  ok(soundKept[0] === "0.3" && soundKept[1] === "true" && /turn on/.test(await text(rob.page, "#cm-board-tools [data-action=board-mute]")), `moving Effects and pressing Mute are remembered on the device (${soundKept.join(", ")})`);
  await rob.page.click("#cm-board-tools [data-action=board-mute]");
  await rob.page.locator("#cm-board-tools [data-board-sound=sfx]").fill("50");
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
  const peekBox = await rob.page.evaluate(() => {const r = document.querySelector("#cm-board-peek .cm-bcard").getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), innerWidth / 2, innerHeight / 2];});
  ok(Math.round(peekWidth) === 400 && Math.abs(peekBox[0] - peekBox[2]) < 2 && Math.abs(peekBox[1] - peekBox[3]) < 2 && (await text(rob.page, "#cm-board-peek")).includes(robCardName), `a card under the pointer shows large at the center of the screen, 400px (${robCardName})`);
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
  /* B1, item 17: the Panel reads a tapped card upright, with a small Tapped mark, and no "Card" heading over it. */
  await second.page.click("[data-action=board-also]");
  await second.page.locator(".cm-board-also [data-action=board-option]", {hasText: "Tap for mana"}).first().click();
  await second.page.locator(".cm-board-mat .cm-board-lands .cm-bcard.is-tapped").first().waitFor({timeout: 10000});
  /* B6: the mana in the pool, the creatures in hand are castable now, and the tray says so. */
  await second.page.locator(".cm-board-hand .cm-bcard.is-bright").first().waitFor({timeout: 10000});
  const tray2 = await trayOf(second.page, secondSeat, second === rob ? ROB : MAYA);
  ok(/^([1-9])\/\1$/.test(tray2.shown.Creature) && /^0\//.test(tray2.shown.Land) && JSON.stringify(tray2.shown) === JSON.stringify(tray2.want),
    `with mana in the pool the tray reads Creature ${tray2.shown.Creature}, the land drop spent reads Land ${tray2.shown.Land}, and it agrees with the lit cards`);
  await second.page.click("[data-action=board-panel]");
  await second.page.locator(".cm-board-mat .cm-board-lands .cm-bcard.is-tapped").first().click();
  await second.page.locator(".cm-board-panel .cm-panel-card .cm-bcard").waitFor();
  const panelCard = await second.page.evaluate(() => {
    const el = document.querySelector(".cm-board-panel .cm-panel-card .cm-bcard"), r = el.getBoundingClientRect(), onMat = document.querySelector(".cm-board-mat .cm-board-lands .cm-bcard.is-tapped");
    return {transform: getComputedStyle(el).transform, tall: r.height > r.width, mark: ((el.querySelector(".cm-bcard-mark.is-state") || {}).textContent || "").trim(), label: el.getAttribute("aria-label"),
      heading: [...document.querySelectorAll(".cm-board-panel h3")].map((h) => h.textContent.trim()), matTurned: getComputedStyle(onMat).transform !== "none"};
  });
  ok(panelCard.tall && panelCard.transform === "none" && panelCard.mark === "Tapped" && /tapped/.test(panelCard.label) && panelCard.matTurned, `the Panel shows the tapped ${secondLand} upright with a small Tapped mark, while it lies turned on the mat`);
  ok(!panelCard.heading.includes("Card"), `and no "Card" heading over it (${panelCard.heading.join(", ")})`);
  await shot(second.page, "panel-tapped-" + (second === rob ? "1400" : "1280"));
  /* B7, item 18: THE PANEL'S DIVIDER. Dragged down, the card takes more of the column and grows, 5:7; the history below
     shows less; the share is remembered. */
  const panelGeo = () => second.page.evaluate(() => ({card: document.querySelector(".cm-board-panel .cm-panel-card .cm-bcard").getBoundingClientRect().width,
    hist: document.querySelector(".cm-board-panel .cm-panel-history").getBoundingClientRect().height, ratio: (() => {const r = document.querySelector(".cm-board-panel .cm-panel-card .cm-bcard").getBoundingClientRect(); return Math.round(r.width / r.height * 1000) / 1000;})()}));
  const pg0 = await panelGeo();
  const splitGrip = await second.page.locator(".cm-board-panel [data-drag=panel]").boundingBox();
  await second.page.mouse.move(splitGrip.x + 40, splitGrip.y + splitGrip.height / 2);
  await second.page.mouse.down();
  await second.page.mouse.move(splitGrip.x + 40, splitGrip.y + splitGrip.height / 2 + 60, {steps: 4});
  await second.page.mouse.move(splitGrip.x + 40, splitGrip.y + splitGrip.height / 2 + 120, {steps: 4});
  await second.page.mouse.up();
  const pg1 = await panelGeo(), panelShare = Number(await second.page.evaluate(() => localStorage.getItem("cm-board-split:panel")));
  ok(pg1.card > pg0.card + 20 && pg1.hist < pg0.hist - 60 && Math.abs(pg1.ratio - 5 / 7) < 0.01 && panelShare > 0.5,
    `the divider under the Panel's card drags: 120px down, the card ${pg0.card.toFixed(0)} → ${pg1.card.toFixed(0)}px wide, still 5:7, the history below ${pg0.hist.toFixed(0)} → ${pg1.hist.toFixed(0)}px (share ${panelShare})`);
  await second.page.click("[data-action=board-panel]");
  await second.page.click("[data-action=board-panel]");
  await second.page.locator(".cm-board-mat .cm-board-lands .cm-bcard.is-tapped").first().click();
  await second.page.locator(".cm-board-panel .cm-panel-card .cm-bcard").waitFor();
  const pg2 = await panelGeo();
  ok(Math.abs(pg2.card - pg1.card) < 1, "and the share is remembered on the device: the Panel opened again keeps it");
  await second.page.focus(".cm-board-panel [data-drag=panel]");
  for (let i = 0; i < 30; i += 1) await second.page.keyboard.press("ArrowUp");
  ok(Number(await second.page.evaluate(() => localStorage.getItem("cm-board-split:panel"))) === 0.2 && (await panelGeo()).card < pg0.card, "the arrow keys move it too, and it stops at a fifth of the column");
  await second.page.evaluate(() => localStorage.removeItem("cm-board-split:panel"));
  await second.page.click("[data-action=board-panel]");

  /* B5, items 10 and 12: A SPELL ON THE STACK. With the mana, the creature in hand is bright; cast, the button names what
     passing will do -- Resolve and the spell's name -- on the caster's board and then on the other's, whose strip says
     what is on the stack and that they may respond. */
  const toCast = second.page.locator(".cm-board-hand .cm-bcard.is-bright").first(), castName = (await toCast.getAttribute("aria-label")).split(/[,:]/)[0];
  await toCast.click();
  await waitText(second.page, ".cm-board-strip [data-action=board-pass]", new RegExp(`Resolve ${castName}`));
  eq((await text(second.page, ".cm-board-waiting")).trim(), "You may respond", `cast, ${castName} is on the stack: the caster's button reads Resolve ${castName}, and the strip says they may respond`);
  await second.page.click(".cm-board-strip [data-action=board-pass]");
  const firstBoard = second === rob ? maya : rob;
  await waitText(firstBoard.page, ".cm-board-strip [data-action=board-pass]", new RegExp(`Resolve ${castName}`));
  const secondName = second === rob ? "Rob" : "Maya", firstName_ = second === rob ? "Maya" : "Rob";
  eq((await text(firstBoard.page, ".cm-board-waiting")).trim(), `${secondName}'s first main phase · you may respond`, `on the other board the button reads Resolve ${castName}, and the strip says whose step it is and that they may respond`);
  ok(new RegExp(`Waiting on ${firstName_}`).test(await text(second.page, ".cm-board-waiting")), "and the caster's strip says who the table waits on");
  await shot(firstBoard.page, "resolve-" + (firstBoard === rob ? "1400" : "1280"));
  await firstBoard.page.click(".cm-board-strip [data-action=board-pass]");
  await waitText(second.page, ".cm-board-mat .cm-board-field", new RegExp(castName));
  ok(true, `and it resolves: ${castName} is on the battlefield`);
  ok(await heard(ROB, "sfx/sfx_cast_creature.mp3") && await heard(MAYA, "sfx/sfx_cast_creature.mp3"), "the creature cast is heard at both boards, as a creature summoned");
  /* B5, items 10 and 12: ANOTHER PLAYER'S TURN. Rob plays a land on turn 3, which gives him the two mana for an instant;
     on Maya's turn 4 he may respond in her upkeep, his button reads Pass, and his strip says whose step it is. */
  for (let i = 0; i < 80 && !/Turn 4/.test(await text(rob.page, ".cm-board-turn")); i += 1) {
    let acted = false;
    for (const who of [rob, maya]) {
      const draw = who.page.locator(".cm-board-strip [data-action=board-draw]:not([disabled])");
      if (await draw.count()) {await draw.click(); await who.page.waitForTimeout(250); acted = true; continue;}
      const forest = who.page.locator(".cm-board-hand .cm-bcard.is-bright", {hasText: "Forest"}).first();
      if (who === rob && await forest.count()) {await forest.click(); await who.page.waitForTimeout(250); acted = true; continue;}
      const pass = who.page.locator(".cm-board-strip [data-action=board-pass]:not([disabled])");
      if (await pass.count()) {await pass.click(); await who.page.waitForTimeout(200); acted = true;}
    }
    if (!acted) await rob.page.waitForTimeout(250);
  }
  await rob.page.locator(".cm-board-strip [data-action=board-pass]:not([disabled])").waitFor({timeout: 20000});
  const theirTurn = {turn: await text(rob.page, ".cm-board-turn"), label: (await text(rob.page, ".cm-board-strip [data-action=board-pass]")).trim(), says: (await text(rob.page, ".cm-board-waiting")).trim()};
  ok(/Turn 4 · Maya/.test(theirTurn.turn) && theirTurn.label === "Pass" && /^Maya's upkeep · you may respond$/.test(theirTurn.says),
    `on another player's turn, with the stack empty and an instant he can pay for, Rob's button reads Pass, and the strip says "${theirTurn.says}"`);
  await shot(rob.page, "their-turn-1400");
  ok(await heard(ROB, "sfx/sfx_event_your_turn.mp3"), "and Rob's own turn 3 was announced to him as his turn");

  /* SHAPE, at both widths. */
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    const g = await who.page.evaluate(() => {
      const strip = document.querySelector(".cm-board-strip").getBoundingClientRect();
      const ratio = (el) => {const r = el.getBoundingClientRect(); return r.width / r.height;};
      const mat = [...document.querySelectorAll(".cm-board-mat .cm-bcard:not(.is-tapped)")], hand = [...document.querySelectorAll(".cm-board-hand .cm-bcard")];
      const board = document.querySelector(".cm-board-mat").getBoundingClientRect(), main = document.querySelector(".cm-board-main").getBoundingClientRect();
      const tray = document.querySelector(".cm-board-hand").getBoundingClientRect(), lands = document.querySelector(".cm-board-mat .cm-board-lands").getBoundingClientRect();
      return {strip: Math.round(strip.height), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ratios: [...mat, ...hand].map(ratio).map((x) => Math.round(x * 1000) / 1000),
        matWidth: mat.length ? mat[0].getBoundingClientRect().width : 0, handWidth: hand.length ? hand[0].getBoundingClientRect().width : 0,
        boardRatio: Math.round(board.width / board.height * 100) / 100, largest: Math.min(main.width - 16, (main.height - 8 - 8 - tray.height) * 16 / 9) - board.width < 2,
        docked: tray.top >= board.bottom - 0.5 && tray.top <= board.bottom + 12 && tray.bottom <= main.bottom + 0.5 && Math.abs(tray.width - board.width) < 1, clear: lands.bottom <= tray.top + 1};
    });
    ok(g.strip === 48 && g.sideways === 0, `at ${width} the strip is one 48px line (${g.strip}) and nothing scrolls sideways (${g.sideways})`);
    ok(Math.abs(g.boardRatio - 1.78) < 0.02 && g.largest, `at ${width} the Focus mat is 16:9 (${g.boardRatio}), the largest that fits beside the pane with the hand's row beneath it`);
    ok(g.docked && g.clear, `at ${width} the hand's tray is a full row under the mat, as wide as it, inside the window (B1, item 25), and the Lands stay clear of it`);
    ok(g.ratios.length && g.ratios.every((r) => Math.abs(r - 5 / 7) < 0.01), `at ${width} every card is 5:7 (${[...new Set(g.ratios)].join(", ")})`);
    ok(g.handWidth > g.matWidth || !g.matWidth, `at ${width} the hand's cards are larger than the mat's (${g.handWidth} > ${g.matWidth})`);
  }

  /* B1, item 25: THE HAND IS WHOLE in every view -- Table, Focus, Full screen, and Full screen once the browser's own
     full screen is left -- at 1400 (Rob, whose browser gives the whole screen) and at 1280 (Maya, whose does not). */
  const handWhole = (page) => page.evaluate(() => {
    const cards = [...document.querySelectorAll(".cm-board-hand .cm-bcard")], tray = document.querySelector(".cm-board-hand").getBoundingClientRect();
    return {n: cards.length, whole: cards.length > 0 && cards.every((c) => {const r = c.getBoundingClientRect(); return r.bottom <= innerHeight + 0.5 && r.bottom <= tray.bottom + 0.5 && r.top >= 0;}), last: Math.round(cards.at(-1).getBoundingClientRect().bottom), h: innerHeight, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth};
  });
  for (const [who, width] of [[rob, 1400], [maya, 1280]]) {
    await who.page.mouse.move(2, 2);
    const seen = [];
    for (const v of ["table", "focus", "full", "full-left"]) {
      if (v === "full-left") {await who.page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await who.page.waitForFunction(() => !document.fullscreenElement, null, {timeout: 10000}); await who.page.waitForTimeout(300);}
      else {await who.page.click(`[data-action=board-view][data-view=${v}]`); await who.page.locator(v === "full" ? ".cm-full-rail" : v === "table" ? ".cm-board-table" : ".cm-board-mat").waitFor();}
      if (v === "full" && who === rob) await who.page.waitForFunction(() => !!document.fullscreenElement, null, {timeout: 10000});
      const h = await handWhole(who.page);
      seen.push(`${v} ${h.last}/${h.h}`);
      ok(h.whole && h.sideways === 0, `at ${width}, ${v === "full-left" ? "Full screen after the browser's is left" : v}: every card of the hand is whole inside the window (${h.n} cards, the last ends at ${h.last} of ${h.h})`);
    }
    await shot(who.page, `hand-whole-full-${width}`);
    await who.page.click("[data-action=board-view][data-view=focus]");
    await who.page.locator(".cm-board-mat").waitFor();
  }

  /* B1, items 21 and 24: the history opens from a clock wherever it is offered, never ☰ (the menu's) or ⌕; the Coach is
     its own glyph, the same wherever it is named, and ✦ is nowhere. */
  await rob.page.click("[data-action=board-tools]");
  const glyphs = await rob.page.evaluate(() => {
    const svg = (el) => (el.querySelector("svg.cm-icon") || {}).outerHTML || "";
    const hist = [...document.querySelectorAll("#cm-board [data-action=board-history]")], coachEls = [...document.querySelectorAll("#cm-board [data-action=board-coach]")];
    return {hist: hist.length, histSame: hist.every((el) => svg(el) && svg(el) === svg(hist[0])), histText: hist.map((el) => el.textContent).join(""),
      coach: coachEls.length, coachSame: coachEls.every((el) => svg(el) && svg(el) === svg(coachEls[0])), differ: svg(hist[0]) !== svg(coachEls[0]), star: document.getElementById("cm-board").innerHTML.includes("✦")};
  });
  ok(glyphs.hist >= 2 && glyphs.histSame && !/[☰⌕]/.test(glyphs.histText), `the strip's History ▾ and the band's button open the history from the same clock (${glyphs.hist} places), not ☰ or ⌕`);
  ok(glyphs.coach >= 2 && glyphs.coachSame && glyphs.differ && !glyphs.star, `the pane's Coach and Tools › Recommended actions carry the Coach's own glyph (${glyphs.coach} places), and ✦ is nowhere on the board`);
  await rob.page.click("[data-action=board-tools]");
  await rob.page.click("[data-action=board-view][data-view=full]");
  await rob.page.locator(".cm-full-rail").waitFor();
  const rail = await rob.page.evaluate(() => {const svg = (q) => (document.querySelector(q + " svg.cm-icon") || {}).outerHTML || ""; return {hist: svg(".cm-full-rail [data-action=board-history]"), coach: svg(".cm-full-rail [data-action=board-coach]"), band: svg(".cm-full-side [data-action=board-history]"), text: document.querySelector(".cm-full-rail").textContent};});
  ok(rail.hist && rail.hist === rail.band && rail.coach && rail.coach !== rail.hist && !/[☰✦]/.test(rail.text), "Full screen's rail: the clock for the history, the Coach's glyph for the Coach, neither ☰ nor ✦");
  await rob.page.click("[aria-label='Leave full screen']");
  await rob.page.locator(".cm-board-mat").waitFor();

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
  ok(onTop, "in Full screen, the Coach's glyph in the rail opens it, above the game");
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
  /* asked: to pass, or (B5) to draw */
  const mayaAsk = ".cm-phone-pill [data-action=board-pass]:not([disabled]), .cm-phone-pill [data-action=board-draw]:not([disabled])";
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

  /* END: Tools › End game, two taps; both boards say so; back to the table. B2: Rob is on Decks when it ends -- his rail
     says the game is over, his socket stays open, and Game over brings him to the result. */
  await rob.page.click("[data-action=board-menu]");
  await rob.page.click("#cm-board-nav a[href='#decks']");
  await rob.page.getByRole("heading", {name: "Decks", level: 1}).waitFor({timeout: 30000});
  await rob.page.locator("#cm-game-on").waitFor({timeout: 10000});
  await maya.page.click("[data-action=board-tools]");
  await maya.page.click("#cm-board-tools [data-action=board-end]");
  eq((await text(maya.page, "#cm-board-tools [data-action=board-end][data-confirm='1']")).trim(), "End for everyone · keep the record", "End game in Tools asks a second tap first, naming what it does");
  await shot(maya.page, "board-end-1280");
  await maya.page.click("#cm-board-tools [data-action=board-end][data-confirm='1']");
  await rob.page.waitForFunction(() => /Game over/.test(document.getElementById("cm-game-on")?.textContent || ""), null, {timeout: 15000});
  ok(!routes[ROB].at(-1).server.closed, "the game ended with Rob on Decks: his rail says Game over, and his socket stays open (a table takes no new one once its game is over)");
  await rob.page.click("#cm-game-on");
  await waitText(rob.page, ".cm-board-over", /ended early/);
  await waitText(maya.page, ".cm-board-over", /ended early/);
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
  await waitText(rob.page, "#cm-notice", /unfinished game is filed under D1 Quintorius Spirits's record/, 10000);
  ok(true, "and the board says where it went: filed under D1's record");

  /* THE RECORD (M8b): not a playtest table, so each person downloads their own seat's. */
  const [download] = await Promise.all([rob.page.waitForEvent("download", {timeout: 15000}), rob.page.click(".cm-board-over [data-action=board-record]")]);
  const rec = JSON.parse(readFileSync(await download.path(), "utf8"));
  eq([download.suggestedFilename(), rec.kind, rec.seatId, rec.playtest, "seed" in rec, "tape" in rec], [`CrankMagic-${rec.matchId}-your-record.json`, "seat", "s0", false, false, false], "the game over, Download your record gives Rob his own seat's record: no seed, no tape");
  /* The one card of Maya's in it is the creature she cast (B5), public since it was cast. */
  const mayaNamed = new Set(JSON.stringify(rec).match(/Maya Secret \d+/g) || []);
  ok([...mayaNamed].every((n) => n === castName) && rec.history.length > 0, `with the table's history and nothing of Maya's hidden cards (of hers, only ${[...mayaNamed].join(", ") || "none"}, cast in the open)`);
  await waitText(rob.page, "#cm-notice", /Your record is downloaded/, 10000);
  eq(await rob.page.locator("#cm-notice .cm-toast-action").count(), 0, "and the board says what was downloaded, with no Undo: the download changed nothing");
  await shot(rob.page, "board-record-1400");

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
  await waitText(rob.page, "#cm-table-game", /The game is over/);
  ok(!(await rob.page.locator("#cm-board").count()), "Back to the table puts the board away, and the lobby says the game is over");

  /* THE RECORD READS IT BACK, on the deck's page: one game, unfinished, marked as played at a table. */
  await rob.page.goto(`${base}/index.html#decks?deck=${encodeURIComponent("deck:live:D1")}`);
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

  eq([leaks(MAYA, "Rob"), leaks(ROB, "Maya", [castName])], [0, 0], `across the whole game, no frame to either named a card of the other's hand or library, history included (${frames[MAYA].length + frames[ROB].length} frames; ${castName} was cast in the open)`);
  eq(writes.filter((w) => w.header !== "play" || !/^application\/json/.test(w.type || "")), [], `every one of the board's ${writes.length} writes carried Play's header and JSON`);
  await rob.context.close(); await maya.context.close();
} finally {
  await close();
}
console.log(`table-board: ${checks} checks passed — a real game between two browsers over the table's socket: hidden hands, Keep, empty steps passing by themselves, a land tapped from the hand, Next step, the draw its own beat, Resolve and Pass, a refusal in words, a dropped socket reopened, End game's second tap.`);
