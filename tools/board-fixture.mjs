#!/usr/bin/env node
/* THE BOARD AT FOUR SEATS, AT REAL SIZES: the before-and-after renders for any change to the Play board.
 *
 *   node tools/board-fixture.mjs --out <dir> [--sizes 1280x720,1400x900,1920x1080,2560x1080] [--turn 17]
 *
 * Rob's standing rule for the Play screens (2026-09-29): replicate the wireframes, then verify at real sizes before
 * reporting. This is that verification's fixture. It is a REAL four-seat table -- the GameTable object over
 * game/room/table.mjs, as tests/table-board.mjs runs it -- with Rob in seat 1 and three house pilots, each bringing
 * one of Rob's first four decks (data/live-load.json) by their real card names, so the boards carry real cards and
 * real pictures. The engine knows only basic lands, so for this fixture a creature is its printed power and
 * toughness, anything else a vanilla permanent of its type, each at a generic cost of its mana value (at most 4).
 * Rob's seat is played here in Node by a plain policy (keep; play a land; tap and cast what it can; otherwise pass) until
 * the table reaches --turn on Rob's own main phase with priority; then each size opens the page over the table's
 * socket, with Rob's library restored as a signed-in Rob has it, and photographs Table, Focus and Full screen, and
 * Full screen again after the browser's fullscreen is left.
 *
 * Each shot is <dir>/<view>-<width>x<height>.png, and <dir>/measure.json records what a screenshot cannot show
 * exactly: the window, the hand tray and its last card's bottom edge against the window, and the boards' boxes.
 *
 * Needs Playwright and Chromium (as the browser suites do) and the network for the cards' pictures.
 */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "../tests/uat/browser-runner.mjs";
import {basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), flag = (name, fallback) => {const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback;};
const OUT = path.resolve(flag("--out", path.join(ROOT, "shots", "board-fixture")));
const SIZES = flag("--sizes", "1280x720,1400x900,1920x1080,2560x1080").split(",").map((s) => s.split("x").map(Number));
const TURN = Number(flag("--turn", "17"));
mkdirSync(OUT, {recursive: true});

/* THE CARDS: the four decks' real names, drawn as the fixture's vanilla permanents. */
const records = new Map(JSON.parse(readFileSync(path.join(ROOT, "data", "cards.json"), "utf8")).cards.map((c) => [c.name, c]));
const live = JSON.parse(readFileSync(path.join(ROOT, "data", "live-load.json"), "utf8"));
const PERMANENT = ["Creature", "Artifact", "Enchantment", "Planeswalker"];
const num = (v, d) => (/^\d+$/.test(String(v ?? "")) ? Number(v) : d);
function cards(name) {
  const basic = basicCards(name);
  if (basic) return basic;
  const r = records.get(name);
  if (!r) return null;
  const types = PERMANENT.filter((t) => (r.typeLine || "").includes(t));
  if (!types.length) return null;
  const cost = `{${Math.min(4, Math.max(1, Math.round(r.manaValue || 1)))}}`;
  /* Legendary as printed, so a commander is one the table seats (CR 903.3). */
  const legendary = /\bLegendary\b/.test(r.typeLine || "") ? {supertypes: ["Legendary"]} : {};
  return types.includes("Creature") ? {types: ["Creature"], ...legendary, power: num(r.power, 2), toughness: num(r.toughness, 2), manaCost: cost} : {types: [types[0]], ...legendary, manaCost: cost};
}
const BASIC = {W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest"};
function deckFor(d) {
  const lead = records.get(d.commander), colors = (lead && lead.colorIdentity || ["G"]).filter((c) => BASIC[c]);
  const spells = d.cards.map(([n]) => n).filter((n) => n !== d.commander && !basicCards(n) && cards(n));
  const lands = [...Array(40)].map((_, i) => BASIC[colors[i % colors.length]]);
  const list = [];
  for (let i = 0; list.length < 99; i += 1) list.push(i % 5 < 2 ? lands[i % lands.length] : spells[i % spells.length]);
  return {name: d.name, commander: [d.commander], cards: list, source: {deckId: `deck:live:${d.id}`, deckVersion: 2}};
}

/* THE TABLE, as tests/table-board.mjs stands it up: storage in a Map, one request at a time, the socket carried. */
const ROB = "rob@example.com";
let clock = Date.parse("2026-09-30T20:00:00Z");
const map = new Map(), sockets = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
const object = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "boardfixture01";
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const call = (p, body) => serial(async () => (await object.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json());
async function socket(onFrame) {
  const server = {tags: null, closed: false, send(f) {if (!this.closed) onFrame(f);}, close() {this.closed = true;}};
  await serial(async () => {
    object.socketPair = () => [{}, server];
    object.upgraded = () => ({status: 101});
    await object.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));
  });
  return server;
}

await call("/table/create", {tableId: TABLE, hostName: "Rob", seats: [{kind: "ai", name: "Nina"}, {kind: "ai", name: "Theo"}, {kind: "ai", name: "Maya"}]});
for (const [seatId, d] of live.decks.slice(0, 4).entries()) await call("/table/deck", {seatId, deck: deckFor(d)});
await call("/table/ready", {ready: true});
await call("/table/mat", {mat: "forge"});
await call("/table/start", {});
clock += 10000; await serial(() => object.alarm());

/* ROB'S SEAT, PLAYED HERE: keep, a land a turn, the first thing that can be cast, otherwise pass; attack and block
   with nothing. It stops on Rob's own main phase of --turn, with priority. */
let latest = null;
const node = await socket((f) => {const x = JSON.parse(f); if (x.view) latest = x.view;});
const there = (v) => v.state.turn >= TURN && v.state.turnPlayerId === v.seat && v.state.phase === "MAIN1" && v.decision && v.decision.kind === "priority";
for (let i = 0; i < 4000 && latest && latest.status !== "finished"; i += 1) {
  const v = latest, d = v.decision;
  if (!d) {await serial(async () => object.broadcast()); if (latest === v) break; continue;}
  if (there(v)) {
    const land = d.options.find((o) => o.act === "play-land");
    if (!land || v.state.players[v.seat].landsPlayed) break;
  }
  let indices;
  if (d.kind === "priority") {
    const me = v.state.players[v.seat], land = !me.landsPlayed && d.options.find((o) => o.act === "play-land"), cast = d.options.find((o) => o.act === "cast");
    const spells = me.zones.Hand.cards.some((c) => c.name && !c.types.includes("Land")), tap = spells && d.options.find((o) => o.act === "activate-mana");
    indices = [(land || cast || tap || d.options.find((o) => o.act === "pass") || d.options[0]).index];
  } else if (d.mode === "many") indices = d.options.slice(0, d.min).map((o) => o.index);
  else if (d.mode === "order") indices = d.options.map((o) => o.index);
  else if (d.mode === "ack") indices = [];
  else indices = [(d.options.find((o) => /^Keep|^No\b|^Don't/i.test(o.label)) || d.options[0]).index];
  const payload = d.mode === "damage" || d.mode === "amount" ? {amounts: d.options.map((_, k) => (k === 0 ? d.total : 0))} : {indices};
  await serial(() => object.webSocketMessage(node, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, ...payload})));
}
if (!latest || !there(latest)) console.log(`board-fixture: stopped at turn ${latest && latest.state.turn}, ${latest && latest.state.phase}; photographing that`);
const counts = latest.state.players.map((p) => `${p.name}: ${p.zones.Battlefield.cards.length} permanents, hand ${p.zones.Hand.count}`).join(" · ");
console.log(`board-fixture: turn ${latest.state.turn}, ${latest.state.phase} · ${counts}`);

/* THE PAGE, at each size, over the same table. */
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const {browser, base, close} = await openBrowser({name: "board-fixture", flag: "BOARD_FIXTURE_REQUIRED"});
async function answer(route) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => object.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
function carry(ws) {
  const server = {tags: null, closed: false, send(f) {if (!this.closed) ws.send(f);}, close() {this.closed = true;}};
  serial(async () => {
    object.socketPair = () => [{}, server];
    object.upgraded = () => ({status: 101});
    await object.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));
  });
  ws.onMessage(() => {});   /* photographs only: nothing the page sends is played */
  ws.onClose(() => {server.closed = true;});
}
const measure = () => {
  const box = (el) => {if (!el) return null; const r = el.getBoundingClientRect(); return {x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom)};};
  const hand = [...document.querySelectorAll(".cm-board-hand .cm-bcard")];
  return {window: [innerWidth, innerHeight], tray: box(document.querySelector(".cm-board-hand")), lastCard: box(hand.at(-1)),
    handWhole: hand.every((c) => c.getBoundingClientRect().bottom <= innerHeight + 0.5),
    boards: [...document.querySelectorAll("#cm-board .cm-mat")].map(box), fullscreen: !!document.fullscreenElement};
};
const report = {turn: latest.state.turn, phase: latest.state.phase, shots: {}};
try {
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({viewport: {width, height}, serviceWorkers: "block"});
    const page = await context.newPage();
    if (process.env.BOARD_FIXTURE_DEBUG) page.on("requestfailed", (r) => console.log("failed", r.url().slice(0, 90), r.failure() && r.failure().errorText));
    await loadLiveState(page, base);   /* Rob's library, as a signed-in Rob has it: his four decks' cards carry their records */
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: ROB}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, answer);
    await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry);
    await page.goto("about:blank");   /* a fresh document, so the page is the one with Play in the cloud switched on */
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board .cm-board-strip").waitFor({timeout: 60000});
    for (const view of ["table", "focus", "full", "full-left"]) {
      if (view === "full-left") {await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await page.waitForTimeout(400);}
      else {await page.click(`[data-action=board-view][data-view=${view}]`); await page.locator(view === "full" ? ".cm-full-rail" : view === "table" ? ".cm-board-table" : ".cm-board-mat").waitFor();}
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(700);
      const name = `${view}-${width}x${height}`;
      await page.screenshot({path: path.join(OUT, `${name}.png`)});
      report.shots[name] = await page.evaluate(measure);
      if (process.env.BOARD_FIXTURE_DEBUG) console.log(name, await page.evaluate(() => [...document.querySelectorAll("#cm-board .cm-bcard")].map((c) => { const i = c.querySelector("img"); return i ? (i.complete ? i.naturalWidth : "loading") : "none"; }).join(",")));
    }
    await context.close();
  }
} finally {
  await close();
}
writeFileSync(path.join(OUT, "measure.json"), JSON.stringify(report, null, 1) + "\n");
for (const [name, m] of Object.entries(report.shots)) console.log(`  ${name.padEnd(20)} hand whole: ${m.handWhole ? "yes" : "NO "} · last card bottom ${m.lastCard ? m.lastCard.bottom : "-"} of ${m.window[1]} · boards ${m.boards.length}`);
console.log(`board-fixture: ${Object.keys(report.shots).length} shots in ${OUT}`);
process.exit(0);
