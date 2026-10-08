/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A NATURAL GAME END THROUGH TWO BROWSERS, using confirmed card definitions.
 *
 * D5 Shadrix (default) or REAL_DECK_ID=D2 Chulane at all four seats: two browser users at 1400x900 and 1280x720, two house pilots.
 * The host creates the table, invites the second user, and both choose decks and become ready.
 * Browser users take the house pilot's suggestions over their own visible state and offered
 * choices, exclusively through UI controls. Reload preserves a pending decision; both sessions
 * must see the same natural end, every frame must hide other hands/libraries, and no AI answer
 * may have been refused over the whole match.
 *
 * This is an isolated GameTable/Chromium harness. HTTP and WebSocket messages are carried to
 * the real table in this process. It does not prove workerd, Cloudflare Access or network latency.
 * Card art/network responses use browser-runner's fixtures; card rules use tableCards, never
 * vanilla stand-ins. The real library and online accounts are untouched.
 *
 * node tests/uat/real-deck-game.mjs
 * REAL_DECK_ID=D2 selects the committed Chulane list; this never uses an external backup.
 * REAL_DECKS_REQUIRED=1 refuses a missing browser; UAT_SHOTS=<dir> saves each end screen.
 * This deliberate full-game acceptance run is outside the regular suite inventory.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState, ROOT} from "./browser-runner.mjs";
import {basicCards} from "../../game/room/room.mjs";
import {GameTable, tableCards} from "../../cloud/game-room.mjs";
import {build, worktreeSource} from "../../tools/release-pages.mjs";
import {joinLocation} from "../../cloud/worker.mjs";
import {boardPerson} from "./board-person.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1; console.log(`  ok  ${m}`);};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1; console.log(`  ok  ${m}`);};
const DECK_ID = process.env.REAL_DECK_ID || "D5";
assert.ok(/^(D2|D5)$/.test(DECK_ID), "REAL_DECK_ID must be D2 or D5, the completed committed deck lists");
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};

/* ---- the committed library, with the table's confirmed definitions ---- */
const library = JSON.parse(readFileSync(path.join(ROOT, "data", "live-state.json"), "utf8")).payload.state;
const DECKS = library.decks.filter((d) => /^deck:live:D[1-7]$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id));
const cards = tableCards;

/* ---- the tables: one GameTable object each, as the Worker gives every table its own ---- */
const ROB = "rob@example.com", MAYA = "maya@example.com";
let clock = Date.parse("2026-09-30T20:00:00Z");
const objects = new Map(), frames = {[ROB]: [], [MAYA]: []}, sent = {};   /* sent[tableId][email:seat]: the deck the lobby sent */
let nextId = 0, queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const objectCtx = () => {
  const map = new Map(), sockets = [];
  return {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
};
const tableFor = (id) => {if (!objects.has(id)) objects.set(id, new GameTable(objectCtx(), {}, {cards, now: () => clock})); return objects.get(id);};
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables(?:\/([a-z0-9]+)(?:\/([a-z]+))?)?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const [, given, action] = m;
  const body = method === "GET" ? undefined : req.postData() || "{}";
  if (action === "deck") {const b = JSON.parse(body); ((sent[given] ||= {})[`${email}:${b.seatId}`] = b.deck);}
  let id = given, internal = action ? `/table/${action}` : "/table", payload = body;
  if (!given) {id = `journey${String(++nextId).padStart(4, "0")}`; internal = "/table/create"; payload = JSON.stringify({...JSON.parse(body), tableId: id});}
  const r = await serial(() => tableFor(id).fetch(new Request(`https://table.internal${internal}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(payload !== undefined ? {body: payload} : {})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
/* The page's socket, carried to its table's object through the real /connect route; every frame kept. */
function carry(email) {
  return (ws) => {
    const id = /\/api\/tables\/([a-z0-9]+)\/connect/.exec(ws.url())[1], object = tableFor(id);
    const server = {tags: null, closed: false, send(f) {if (!this.closed) {frames[email].push({id, f}); ws.send(f);}}, close() {this.closed = true;}};
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
const viewsAt = (email, id) => frames[email].filter((x) => x.id === id).map((x) => JSON.parse(x.f)).filter((f) => f.view).map((f) => f.view);

/* The page staging ships, marked for Play in the cloud (as tests/table-lobby.mjs serves it). */
const PAGE = build({source: worktreeSource(), profileName: "cloud-staging"}).built.get("index.html").toString("utf8");
const alarms = [];
const {browser, base, stub, close} = await openBrowser({name: "real-deck-game", flag: "REAL_DECKS_REQUIRED"});
async function person(email, viewport, {fullscreen = true} = {}) {
  const context = await browser.newContext({viewport, serviceWorkers: "block", acceptDownloads: true});
  const page = await context.newPage();
  if (!fullscreen) await page.addInitScript(() => Object.defineProperty(Document.prototype, "fullscreenEnabled", {get: () => false}));
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: PAGE}));
  /* The app at "/", where an invitation's link comes back to (cloud/worker.mjs, joinLocation). */
  await page.route((url) => url.origin === base && url.pathname === "/", (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: PAGE}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/tables**`, (r) => answer(r, email));
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry(email));
  await page.goto("about:blank");
  return {context, page, email};
}
const text = (page, sel) => page.locator(sel).first().evaluate((el) => {const s = document.createElement("style"); s.textContent = "*{text-transform:none!important}"; document.head.append(s); const t = el.innerText; s.remove(); return t;});
const waitText = (page, sel, re, timeout = 20000) => page.waitForFunction(([s, src]) => {const el = document.querySelector(s); if (!el) return false; const st = document.createElement("style"); st.textContent = "*{text-transform:none!important}"; document.head.append(st); const t = el.innerText; st.remove(); return new RegExp(src).test(t);}, [sel, re.source], {timeout});

/* Choose a deck by its name in the lobby's dialog (the library's own decks, as a person sees them). */
async function chooseDeck(page, seat, name) {
  await page.click(`.cm-lobby-seat[data-seat='${seat}'] [data-action=table-deck]`);
  await page.locator(".cm-table-deck").first().waitFor();
  const names = await page.locator(".cm-table-deck strong").allInnerTexts();
  const at = names.findIndex((n) => n.trim() === name);
  assert.ok(at >= 0, `the deck "${name}" is offered in Choose a deck (${names.join(", ")})`);
  await page.locator(".cm-table-deck").nth(at).click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 15000}).catch(async () => {
    throw Error(`choosing "${name}" left the dialog open: ${await page.locator("#cm-table-deck-error").innerText().catch(() => "")}`);
  });
}

/* ---- one table, end to end ---- */
async function journey(n, rob, maya, [robDeck, mayaDeck, ninaDeck, theoDeck]) {
  console.log(`real-deck-game: table ${n} -- ${[robDeck, mayaDeck, ninaDeck, theoDeck].map((d) => d.name).join(" · ")}`);
  /* LOBBY: New table, a person and two AIs. */
  await rob.page.goto(`${base}/index.html#table`);
  await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
  await rob.page.fill("#cm-table-new [name=hostName]", "Rob");
  await rob.page.fill("#cm-table-new [name=name2]", "Maya");
  await rob.page.selectOption("#cm-table-new [name=kind3]", "ai");
  await rob.page.fill("#cm-table-new [name=name3]", "Nina");
  await rob.page.selectOption("#cm-table-new [name=kind4]", "ai");
  await rob.page.fill("#cm-table-new [name=name4]", "Theo");
  await rob.page.click("[data-action=table-create]");
  await rob.page.waitForFunction(() => /#table\?id=journey\d+/.test(location.hash), null, {timeout: 20000});
  const id = /#table\?id=(journey\d+)/.exec(await rob.page.evaluate(() => location.hash))[1];
  await rob.page.locator(".cm-cloud-table .cm-lobby-seat[data-seat='3']").waitFor({timeout: 20000});
  eq((await rob.page.locator(".cm-cloud-table .cm-lobby-seat h3").allTextContents()).map((t) => t.trim()), ["Seat 1 · You", "Seat 2 · Maya", "Seat 3 · AI", "Seat 4 · AI"], `table ${n}: New table seats Rob, Maya to invite, and two AIs`);
  await chooseDeck(rob.page, 0, robDeck.name);
  await chooseDeck(rob.page, 2, ninaDeck.name);
  await chooseDeck(rob.page, 3, theoDeck.name);
  await waitText(rob.page, ".cm-lobby-seat[data-seat='3'] header", /Ready/);
  ok(true, `table ${n}: Rob brings ${robDeck.name} from his library, and chooses the AIs' (${ninaDeck.name}, ${theoDeck.name}); an AI with a deck is ready`);
  /* INVITE: the link, opened in the second browser session. */
  await rob.page.click(".cm-lobby-seat[data-seat='1'] [data-action=table-invite]");
  await rob.page.locator("#cm-table-link").waitFor();
  const link = await rob.page.inputValue("#cm-table-link");
  await rob.page.keyboard.press("Escape");
  await maya.page.goto(joinLocation(new URL(link.replace(/^https?:\/\/[^/]+/, base))));   /* the Worker's answer to the link */
  await maya.page.waitForFunction(() => /#table\?id=/.test(location.hash), null, {timeout: 30000});
  await maya.page.locator(".cm-cloud-table .cm-lobby-seat").first().waitFor({timeout: 30000});
  eq((await maya.page.locator(".cm-lobby-seat[data-seat='1'] h3").textContent()).trim(), "Seat 2 · You", `table ${n}: Maya opens the invite in her separate session and lands on her seat`);
  await chooseDeck(maya.page, 1, mayaDeck.name);
  await maya.page.locator(".cm-lobby-seat[data-seat='1'] [data-action=table-ready]").click();
  await waitText(rob.page, ".cm-lobby-seat[data-seat='1'] header", /Ready/);
  await rob.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-ready]").click();
  await waitText(rob.page, "#cm-table-launch", /Everyone is ready/);
  await rob.page.click("[data-action=table-start]");
  await rob.page.locator("#cm-table-seconds").waitFor();
  clock += 10000;
  await serial(() => tableFor(id).alarm());
  await rob.page.locator("#cm-board .cm-board-strip").waitFor({timeout: 30000});
  await maya.page.locator("#cm-board").waitFor({timeout: 30000});
  ok(true, `table ${n}: Maya brings ${mayaDeck.name}; everyone is ready; the countdown runs out and both pages are the board`);

  const alarm = setInterval(() => {if(tableFor(id).room?.continuing) serial(() => tableFor(id).alarm());}, 50);
  alarms.push(alarm);
  const current = person => viewsAt(person.email, id).at(-1);
  const people = [[rob,0],[maya,1]].map(([person,seat]) => boardPerson({page: person.page, seat, cards: tableCards, current: () => current(person)}));
  let actions = 0, reloaded = false;
  async function answer(person, seat) {
    if (!await people[seat]()) return false;
    actions++;
    if(actions%25===0) console.log(`${DECK_ID} browser: ${actions} actions, turn ${current(person).state.turn}`);
    return true;
  }
  for(let i=0;i<3000;i++) {
    if(current(rob)?.status==='finished' && current(maya)?.status==='finished') break;
    if(!reloaded && actions>=30) {
      const before=current(rob);
      await rob.page.reload(); await rob.page.locator('#cm-board').waitFor({timeout:30000});
      await rob.page.waitForTimeout(300);
      const after=current(rob);
      eq(after.revision,before.revision,'reload reconnects to the same authoritative revision');
      eq(after.decision?.id,before.decision?.id,'reload preserves the pending question');
      reloaded=true;
    }
    const moved=(await answer(rob,0)) | (await answer(maya,1));
    if(!moved) await rob.page.waitForTimeout(100);
  }
  const result=current(rob);
  eq(result.status,'finished',`real ${DECK_ID} game finishes naturally`);
  eq(current(maya).status,'finished','second browser sees the same natural end');
  assert.notEqual(result.result?.reason,'ended early');
  eq(current(maya).result,result.result,'separate browser sessions agree on result');
  ok(reloaded,'reconnect exercised during a pending game');
  for(const [person,seat] of [[rob,0],[maya,1]]) {
    const views=viewsAt(person.email,id);
    ok(views.every(v=>v.state.players.every((p,s)=>s===seat || ['Hand','Library'].every(z=>(p.zones[z]?.cards??[]).every(c=>!c.name)))),`seat ${seat}: all ${views.length} frames hide other hands and libraries`);
    await person.page.locator('.cm-board-over').waitFor({timeout:10000});
    await shot(person.page,`${DECK_ID.toLowerCase()}-natural-end-seat${seat}`);
  }
  const room=tableFor(id).room;
  console.log(JSON.stringify({checks,actions,turns:result.state.turn,result:result.result,refusals:room.refusals},null,2));
  eq(room.refusals.total,0,'AI answers were never refused during the whole match');
  clearInterval(alarm);
  return id;
}
try {
  const deck=DECKS.find(d=>d.id===`deck:live:${DECK_ID}`); assert.ok(deck);
  const rob=await person(ROB,{width:1400,height:900});
  const maya=await person(MAYA,{width:1280,height:720});
  await journey(1,rob,maya,[deck,deck,deck,deck]);
} finally {for (const alarm of alarms) clearInterval(alarm); await close();}
console.log(`${DECK_ID} real browser: ${checks} checks passed`);
process.exit(0);