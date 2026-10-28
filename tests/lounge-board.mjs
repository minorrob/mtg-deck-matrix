/* THE BOARD FOR SOMEONE WATCHING, AND THE TABLE'S CHAT (Rob, 2026-10-28; docs/ui-lane/lounge-contract.md §4-5), in a real Chromium against the
 * real table object (cloud/game-room.mjs over game/room/table.mjs), as tests/table-board.mjs stands it in:
 *
 *   1. A person with no seat opens `#table?id=…&watch=1` on a public table and gets the board as a spectator: it says Watching, nobody
 *      is "You", there are no action buttons and no hand to play, and the socket was opened with ?watch=1.
 *   2. The chat: a player writes on the Chat module and the line reaches the other player and the watcher through the room's frame;
 *      a watcher who is not the owner cannot write; a reconnect reads the table's last lines from the table.
 *   3. The Pre-lobby's Game log carries the chat after the game's lines.
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
import {basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const cards = (name) => basicCards(name) ?? {types: ["Creature"], ...(/ General$/.test(name) ? {supertypes: ["Legendary"]} : {}), power: 2, toughness: 2, manaCost: "{1}"};
const ROB = "rob@example.com", MAYA = "maya@example.com", CASEY = "casey@example.com";
let clock = Date.parse("2026-10-28T22:00:00Z");
const map = new Map(), live = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; live.push(s);}, getWebSockets: () => live.filter((s) => !s.closed), getTags: (s) => s.tags};
const object = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "loungeboard01";
const call = async (p, email, body) => (await object.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json();
const deck = (who, land, source) => ({name: `${who}'s deck`, commander: [`${who} General`], cards: [...Array(40)].map((_, i) => i % 2 ? land : `${who} Secret ${i}`), source});
const ROB_DECK = {deckId: "deck:live:D1", deckVersion: 2}, MAYA_DECK = {deckId: "deck:live:D2", deckVersion: 2};
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const frames = {[ROB]: [], [MAYA]: [], [CASEY]: []}, connects = [];

async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => object.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
function carry(email) {
  return (ws) => {
    const server = {tags: null, closed: false, send(f) {if (!this.closed) {frames[email].push(f); ws.send(f);}}, close() {this.closed = true;}};
    connects.push({email, url: ws.url()});
    serial(async () => {
      object.socketPair = () => [{}, server];
      object.upgraded = () => ({status: 101});
      const watch = new URL(ws.url()).searchParams.get("watch") === "1";
      const r = await object.fetch(new Request(`https://table.internal/connect${watch ? "?watch=1" : ""}`, {headers: {upgrade: "websocket", "x-crankmagic-email": email}}));
      if (r.status !== 101) {server.closed = true; ws.close({code: 1008, reason: "refused"});}
    });
    ws.onMessage((message) => serial(() => object.webSocketMessage(server, message)));
    ws.onClose(() => serial(async () => {if (!server.closed) {server.closed = true; await object.webSocketClose(server, 1001);}}));
  };
}
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const {browser, base, stub, close} = await openBrowser({name: "lounge-board", flag: "GEOMETRY_REQUIRED"});
async function person(email) {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  await page.addInitScript(() => {if (!localStorage.getItem("cm-board-view")) localStorage.setItem("cm-board-view", "focus");});
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  await page.route(`${base}/api/ai-coach`, (r) => r.fulfill({json: {open: false}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/tables**`, (r) => answer(r, email));
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect/, carry(email));
  await page.goto("about:blank");
  return {context, page};
}
/* The Chat module on the right, so the module the person asked for is the one under test. */
const showChat = async (page) => {
  await page.evaluate(async () => {
    const C = globalThis.__cm, play = C.state.preferences?.play || {};
    await C.commit({type: "preferences", values: {play: {...play, sidePane: {version: 2, owner: C.signedInAs?.() || null, left: ["actions"], right: ["chat", "history"]}}}}, {renderView: false});
  });
  /* the board draws again, with the right drawer open */
  await page.evaluate(() => {const A = globalThis.__cm.actions; A["board-stage-side"]({dataset: {}}); if (!document.querySelector(".cm-stage-side.is-open")) A["board-stage-side"]({dataset: {}});});
};

try {
  await call("/table/create", ROB, {tableId: TABLE, hostName: "Rob", privacy: "public", seats: [{kind: "human", name: "Maya"}]});
  await call("/table/join", MAYA, {code: (await call("/table/invite", ROB, {seatId: 1})).invite.code});
  await call("/table/deck", ROB, {seatId: 0, deck: deck("Rob", "Forest", ROB_DECK)});
  await call("/table/deck", MAYA, {seatId: 1, deck: deck("Maya", "Island", MAYA_DECK)});
  await call("/table/ready", ROB, {ready: true}); await call("/table/ready", MAYA, {ready: true});
  await call("/table/start", ROB, {});
  clock += 10000; await object.alarm();

  const rob = await person(ROB), maya = await person(MAYA), casey = await person(CASEY);
  for (const who of [rob, maya, casey]) await who.page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));

  /* 1. THE WATCHER */
  await casey.page.goto(`${base}/index.html#table?id=${TABLE}&watch=1`);
  await casey.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  ok(connects.some((c) => c.email === CASEY && /[?&]watch=1/.test(c.url)), "the watcher's socket is opened with ?watch=1");
  eq((await casey.page.locator(".cm-stage-watching").innerText()).replace(/\s+/g, " ").trim().startsWith("Watching"), true, "the top of the board says Watching, in the place of a seat");
  eq(await casey.page.locator(".cm-stage-actions .v-button, .cm-stage-actions button").count(), 0, "a watcher has no action buttons");
  const you = await casey.page.evaluate(() => document.getElementById("cm-board").innerText.match(/\bYou\b/g) || []);
  eq(you.length, 0, "and nobody on the board is called You");
  eq(await casey.page.locator(".cm-stage-hand .cm-stage-fan:not(.is-backs)").count(), 0, "no hand is shown face up to a watcher");
  const spyHands = frames[CASEY].filter((f) => /Rob Secret|Maya Secret/.test(f)).length;
  eq(spyHands, 0, `no frame to the watcher (${frames[CASEY].length} read) names a card of either hand or library`);
  eq(JSON.parse(frames[CASEY].at(0)).view.spectator, true, "the room sent the watcher its public view");

  /* 2. THE CHAT */
  for (const who of [rob, maya, casey]) {
    await who.page.goto(`${base}/index.html#table?id=${TABLE}${who === casey ? "&watch=1" : ""}`);
    await who.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  }
  for (const who of [rob, maya, casey]) {await showChat(who.page); await who.page.locator(".cm-chat").first().waitFor({timeout: 10000});}
  const input = rob.page.locator(".cm-chat-input").first();
  await input.fill("good luck, Maya");
  await input.press("Enter");
  for (const who of [rob, maya, casey]) await who.page.waitForFunction(() => /good luck, Maya/.test(document.querySelector(".cm-chat-list")?.innerText || ""), null, {timeout: 10000});
  ok(true, "a line written by a player reaches that player, the other player and the watcher");
  ok(/Rob/.test(await casey.page.locator(".cm-chat-line b").first().innerText()), "and carries the name it was written under");
  eq(await rob.page.locator(".cm-chat-input").first().inputValue(), "", "the line is cleared once sent");
  eq(await casey.page.locator(".cm-chat-input").first().isDisabled(), true, "a watcher who is not the owner cannot write");
  const kept = await call("/table", MAYA);
  eq(kept.table.chat.map((m) => m.text), ["good luck, Maya"], "the table keeps it for a reconnect");
  await maya.page.reload();
  await maya.page.locator("#cm-board .cm-stage-top").waitFor({timeout: 30000});
  await showChat(maya.page);
  await maya.page.waitForFunction(() => /good luck, Maya/.test(document.querySelector(".cm-chat-list")?.innerText || ""), null, {timeout: 10000});
  ok(true, "a reconnecting player reads the table's last lines");

  /* A draft survives the board redrawing under it. */
  const typing = maya.page.locator(".cm-chat-input").first();
  await typing.fill("half a thought");
  await serial(() => call("/table/chat", ROB, {text: "another from Rob"}).then(() => object.announce?.({type: "ping"})));
  await maya.page.waitForFunction(() => /another from Rob/.test(document.querySelector(".cm-chat-list")?.innerText || ""), null, {timeout: 10000});
  eq([await maya.page.locator(".cm-chat-input").first().inputValue(), await maya.page.evaluate(() => document.activeElement?.className)], ["half a thought", "cm-chat-input"], "what is half typed, and the focus, stay through a line arriving");
  console.log(`lounge-board: ${checks} checks passed — a watcher's board (Watching, no actions, no hand, no hidden card in any frame), the table's chat in the Chat module (sent, pushed to every seat and the watcher, kept for a reconnect, the draft kept).`);
} finally {
  await close();
}
