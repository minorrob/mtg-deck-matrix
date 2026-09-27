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
async function person(email, viewport) {
  const context = await browser.newContext({viewport, serviceWorkers: "block"});
  const page = await context.newPage();
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
  await call("/table/start", ROB, {});
  clock += 10000; await object.alarm();

  const rob = await person(ROB, {width: 1400, height: 900});
  const maya = await person(MAYA, {width: 1280, height: 800});

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
  ok(fullGeo[0] === 0 && fullGeo[1] === 0 && fullGeo[2] === fullGeo[4] && fullGeo[3] === fullGeo[5] && fullGeo[6] === 0, `Full screen takes the whole window (${fullGeo.slice(0, 4).join(",")} of ${fullGeo[4]}×${fullGeo[5]})`);
  ok(await maya.page.locator(".cm-full-others .cm-seatboard").count() === 1 && await maya.page.locator(".cm-full-mine .cm-seatboard.is-you").count() === 1, "the other seat across the top, hers across the foot");
  const firstHand = maya.page.locator(".cm-board-hand .cm-bcard").first(), firstName = (await firstHand.getAttribute("aria-label")).split(/[,:]/)[0];
  await firstHand.click();
  await maya.page.locator(".cm-full-pick").waitFor();
  ok((await maya.page.getAttribute(".cm-full-pick", "aria-label")) === firstName, `a card picked shows large at the side (${firstName}), and picking it does nothing else`);
  await shot(maya.page, "board-full-1280");
  await maya.page.click("[data-action=board-view][data-view=focus][aria-label='Leave full screen']");
  await maya.page.locator(".cm-board-strip").waitFor();
  ok(await maya.page.getAttribute("#cm-board", "data-view") === "focus", "⎋ leaves Full screen for Focus");

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

  eq(writes.filter((w) => w.header !== "play" || !/^application\/json/.test(w.type || "")), [], `every one of the board's ${writes.length} writes carried Play's header and JSON`);
  await rob.context.close(); await maya.context.close();
} finally {
  await close();
}
console.log(`table-board: ${checks} checks passed — a real game between two browsers over the table's socket: hidden hands, Keep, a land tapped from the hand, Pass priority into turn 2, a refusal in words, a dropped socket reopened, End game's second tap.`);
