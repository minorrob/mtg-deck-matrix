#!/usr/bin/env node
/* A PROBE OF THE TABLETOP'S FULL SCREEN, for the accessibility walk's author (the UI lane, 2026-10-17): the board
 * fixture (tools/board-fixture.mjs) with a four-seat table played to --turn, then one page at each --sizes that opens
 * Full screen and prints, as PROBE lines, what tests/a11y-board.mjs will ask about: the words' colors and plates, the
 * profile menu and Settings, the table panel, and what throws when the views are switched. It saved the walk's author
 * a ten-minute suite run per question; add a say() for the next question.
 *
 *   node docs/ui-lane/tools/probe-tabletop.mjs --out <dir> [--sizes 1280x800,1400x900] [--turn 10]
 *
 * Needs Playwright and Chromium as the browser suites do, from the repository root.
 */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState} from "/home/user/mtg-deck-matrix/tests/uat/browser-runner.mjs";
import {basicCards} from "/home/user/mtg-deck-matrix/game/room/room.mjs";
import {GameTable} from "/home/user/mtg-deck-matrix/cloud/game-room.mjs";

const ROOT = "/home/user/mtg-deck-matrix";
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
await call("/table/mat", {mat: process.env.SHOT_MAT || "sky-citadel"});
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
    page.on("pageerror", (err) => console.log("PAGE ERROR", String(err).slice(0, 300)));
    page.on("console", (m) => {if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 300));});
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


    page.on("pageerror", (err) => console.log("PAGE ERROR STACK", String(err.stack || err).slice(0, 600)));
    if (process.env.PROBE_THEME) await page.evaluate((t) => document.querySelector(`[data-action=set-theme][data-theme-choice=${t}]`).click(), process.env.PROBE_THEME);
    await page.click("[data-action=board-view][data-view=full]");
    await page.locator(".cm-stage-top").waitFor();
    await page.waitForTimeout(1200);
    const say = (k, v) => console.log("PROBE", k, JSON.stringify(v));
    const dump = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => el.getBoundingClientRect().width > 0).slice(0, 4).map((el) => {
      const st = getComputedStyle(el), trail = []; let bg = null;
      for (let n = el; n && n.id !== "cm-board"; n = n.parentElement) {const s = getComputedStyle(n); trail.push(String(n.className || n.tagName).split(" ").slice(0, 2).join(".")); if (!bg && s.backgroundColor !== "rgba(0, 0, 0, 0)") bg = `${String(n.className).split(" ")[0]}:${s.backgroundColor}`;}
      const r = el.getBoundingClientRect();
      return {text: el.textContent.trim().slice(0, 24), color: st.color, size: st.fontSize, weight: st.fontWeight, bg, inMat: !!el.closest(".cm-mat"), trail: trail.slice(0, 7).join(" < "), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]};
    }), sel);
    say("caption", await dump(".cm-stage-caption span, .cm-stage-caption b"));
    say("seat-small", await dump(".cm-stage-rear .cm-stage-seat-label small"));
    say("names", await dump("#cm-board .cm-bcard-name"));
    say("secret", await page.evaluate(() => [...document.querySelectorAll("#cm-board *")].filter((el) => el.children.length === 0 && /Secret/.test(el.textContent) && el.getBoundingClientRect().width > 0).slice(0, 3).map((el) => {const t = []; for (let n = el; n && n.id !== "cm-board"; n = n.parentElement) t.push(String(n.className || n.tagName).split(" ").slice(0, 2).join(".")); const r = el.getBoundingClientRect(); return {text: el.textContent.trim().slice(0, 30), trail: t.slice(0, 8).join(" < "), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], color: getComputedStyle(el).color, size: getComputedStyle(el).fontSize};})));
    say("renderer", await page.evaluate(() => ({r: document.querySelector(".cm-stage-region") && document.querySelector(".cm-stage-region").dataset.renderer, err: document.querySelector(".cm-stage-error") && document.querySelector(".cm-stage-error").textContent})));
    /* leave Full screen through the Screen View popout, as the suite now does, and see what throws */
    await page.click(".cm-stage-top [data-action=board-profile]");
    await page.click(".cm-profile-menu [data-action=board-screen-menu]");
    await page.locator(".cm-screen-popout").waitFor();
    await page.click("[data-action=board-view][data-view=focus]");
    await page.locator(".cm-board-mat").waitFor();
    await page.waitForTimeout(1500);
    await page.click("[data-action=board-view][data-view=full]");
    await page.locator(".cm-stage-top").waitFor();
    await page.waitForTimeout(1500);
    await page.click(".cm-stage-top [data-action=board-profile]");
    await page.click(".cm-profile-menu [data-action=board-screen-menu]");
    await page.click("[data-action=board-view][data-view=table]");
    await page.locator(".cm-board-table").waitFor();
    await page.waitForTimeout(1500);
    say("done-switching", true);
    await page.screenshot({path: path.join(OUT, `probe-${width}x${height}.png`)});
    await context.close();
  }
} finally {
  await close();
}
writeFileSync(path.join(OUT, "measure.json"), JSON.stringify(report, null, 1) + "\n");
for (const [name, m] of Object.entries(report.shots)) console.log(`  ${name.padEnd(20)} hand whole: ${m.handWhole ? "yes" : "NO "} · last card bottom ${m.lastCard ? m.lastCard.bottom : "-"} of ${m.window[1]} · boards ${m.boards.length}`);
console.log(`board-fixture: ${Object.keys(report.shots).length} shots in ${OUT}`);
process.exit(0);
