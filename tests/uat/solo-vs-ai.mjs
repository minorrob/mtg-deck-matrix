/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ONE PERSON AGAINST THREE AIs, THROUGH THE REAL BOARD (Rob's play test, Oct 19-20, 2026; Linear ROB-163, ROB-164).
 *
 * One browser user at 1280x720 sets up New table with seats 2-4 as "An AI · Normal", chooses every seat's deck from the
 * lobby's Shared decks (Rob's six staging decks, tests/fixtures/shared-staging-decks.json), presses Ready and Start, and
 * plays to the end. The person takes the house pilot's suggestions, exclusively through the board's own controls
 * (board-person.mjs). A reload mid-game must return the same revision and the same pending question; no frame may name
 * an AI's hand or library; no AI answer may be refused over the whole match. When the person loses, the room ends the
 * game (no person is left), so "a real ending" is either a winner or that.
 *
 * Adapted from tests/uat/real-deck-game.mjs: the same in-process GameTable carrier (it does not prove workerd, Access
 * or network latency), and outside the regular suite inventory, like it.
 *
 *   node tests/uat/solo-vs-ai.mjs     three tables: D1 v D2 D3 D4, D5 v D6 D1 D2, D6 v D3 D4 D5 (the person first)
 *   GAMES=1  VIEWPORT=1400x900  SHOTS=<dir>  REAL_DECKS_REQUIRED=1 (refuses a missing browser)
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState, ROOT} from "./browser-runner.mjs";
import {GameTable, tableCards} from "../../cloud/game-room.mjs";
import {build, worktreeSource} from "../../tools/release-pages.mjs";
import {boardPerson} from "./board-person.mjs";
import {replayRecord} from "../../tools/playtest-triage.mjs";
import {checkLeaks} from "../../tools/fuzz-live.mjs";
const REPO = ROOT;

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1; console.log(`  ok  ${m}`);};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1; console.log(`  ok  ${m}`);};
const SHOTS = process.env.SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const [VW, VH] = (process.env.VIEWPORT || "1280x720").split("x").map(Number);
const PODS = [["shared:D1", "shared:D2", "shared:D3", "shared:D4"], ["shared:D5", "shared:D6", "shared:D1", "shared:D2"], ["shared:D6", "shared:D3", "shared:D4", "shared:D5"]]
  .slice(0, Number(process.env.GAMES || 3));
const shared = JSON.parse(readFileSync(path.join(REPO, "tests/fixtures/shared-staging-decks.json"), "utf8")).decks;
const nameOf = (id) => shared.find((d) => `shared:${d.id}` === id || d.id === id)?.name ?? id;

const ROB = "rob@example.com";
let clock = Date.parse("2026-10-19T20:00:00Z");
const objects = new Map(), frames = {[ROB]: []};
let nextId = 0, queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const objectCtx = () => {
  const map = new Map(), sockets = [];
  return {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
};
/* A playtest table, as staging's are (PLAYTEST_TABLES): its record is the whole game. */
const tableFor = (id) => {if (!objects.has(id)) objects.set(id, new GameTable(objectCtx(), {PLAYTEST_TABLES: "on"}, {cards: tableCards, now: () => clock})); return objects.get(id);};
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables(?:\/([a-z0-9]+)(?:\/([a-z]+))?)?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const [, given, action] = m;
  const body = method === "GET" ? undefined : req.postData() || "{}";
  let id = given, internal = action ? `/table/${action}` : "/table", payload = body;
  if (!given) {id = `solo${String(++nextId).padStart(4, "0")}`; internal = "/table/create"; payload = JSON.stringify({...JSON.parse(body), tableId: id});}
  const r = await serial(() => tableFor(id).fetch(new Request(`https://table.internal${internal}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(payload !== undefined ? {body: payload} : {})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
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

const PAGE = build({source: worktreeSource(), profileName: "cloud-staging"}).built.get("index.html").toString("utf8");
const alarms = [];
const {browser, base, stub, close} = await openBrowser({name: "solo-vs-ai", flag: "REAL_DECKS_REQUIRED"});
async function person(email, viewport) {
  const context = await browser.newContext({viewport, serviceWorkers: "block", acceptDownloads: true});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: PAGE}));
  await page.route((url) => url.origin === base && url.pathname === "/", (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: PAGE}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/tables**`, (r) => answer(r, email));
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry(email));
  await page.goto("about:blank");
  return {context, page, email};
}
const waitText = (page, sel, re, timeout = 20000) => page.waitForFunction(([s, src]) => {const el = document.querySelector(s); if (!el) return false; const st = document.createElement("style"); st.textContent = "*{text-transform:none!important}"; document.head.append(st); const t = el.innerText; st.remove(); return new RegExp(src).test(t);}, [sel, re.source], {timeout});

/* Choose one of Rob's Shared decks in the lobby's dialog, once the table has said it can play every card. */
async function chooseShared(page, seat, sharedId) {
  await page.click(`.cm-lobby-seat[data-seat='${seat}'] [data-action=table-deck]`);
  const button = page.locator(`.cm-table-deck[data-shared-deck="${sharedId}"]`);
  await button.waitFor({timeout: 15000});
  await page.waitForFunction((id) => {const b = document.querySelector(`.cm-table-deck[data-shared-deck="${id}"]`); return b && !b.disabled && /Ready to play/.test(b.textContent);}, sharedId, {timeout: 20000});
  await button.click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 15000}).catch(async () => {
    throw Error(`choosing ${sharedId} left the dialog open: ${await page.locator("#cm-table-deck-error").innerText().catch(() => "")}`);
  });
}

async function journey(n, rob, pod) {
  const names = pod.map(nameOf);
  console.log(`solo-vs-ai: table ${n} -- Rob ${names[0]} v AI ${names.slice(1).join(", ")}`);
  await rob.page.goto(`${base}/index.html#table`);
  await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
  await rob.page.fill("#cm-table-new [name=hostName]", "Rob");
  for (const [seat, who] of [[2, "Nina"], [3, "Theo"], [4, "Ivy"]]) {
    await rob.page.selectOption(`#cm-table-new [name=kind${seat}]`, "ai");
    await rob.page.fill(`#cm-table-new [name=name${seat}]`, who);
  }
  await rob.page.click("[data-action=table-create]");
  await rob.page.waitForFunction(() => /#table\?id=solo\d+/.test(location.hash), null, {timeout: 20000});
  const id = /#table\?id=(solo\d+)/.exec(await rob.page.evaluate(() => location.hash))[1];
  await rob.page.locator(".cm-cloud-table .cm-lobby-seat[data-seat='3']").waitFor({timeout: 20000});
  eq((await rob.page.locator(".cm-cloud-table .cm-lobby-seat h3").allTextContents()).map((t) => t.trim()),
    ["Seat 1 · You", "Seat 2 · AI · Normal", "Seat 3 · AI · Normal", "Seat 4 · AI · Normal"], `table ${n}: New table seats Rob and three Normal AIs`);
  for (const [seat, deck] of pod.entries()) await chooseShared(rob.page, seat, deck);
  await waitText(rob.page, ".cm-lobby-seat[data-seat='3'] header", /Ready/);
  ok(true, `table ${n}: each seat's Shared deck chosen in the lobby (${names.join(", ")}); the AIs are ready`);
  await rob.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-ready]").click();
  await waitText(rob.page, "#cm-table-launch", /Everyone is ready/);
  await rob.page.click("[data-action=table-start]");
  await rob.page.locator("#cm-table-seconds").waitFor();
  clock += 10000;
  await serial(() => tableFor(id).alarm());
  await rob.page.locator("#cm-board").waitFor({timeout: 30000});
  ok(true, `table ${n}: Ready, Start, the countdown runs out, and the page is the board`);
  if (SHOTS) await rob.page.screenshot({path: path.join(SHOTS, `table${n}-start.png`)});

  const alarm = setInterval(() => {if (tableFor(id).room?.continuing) serial(() => tableFor(id).alarm());}, 50);
  alarms.push(alarm);
  const current = () => viewsAt(rob.email, id).at(-1);
  const act = boardPerson({page: rob.page, seat: 0, cards: tableCards, current});
  let actions = 0, reloaded = false, combatFrames = 0;
  const started = Date.now();
  for (let i = 0; i < 6000; i++) {
    if (current()?.status === "finished") break;
    if (!reloaded && actions >= 30) {
      const before = current();
      await rob.page.reload(); await rob.page.locator("#cm-board").waitFor({timeout: 30000});
      await rob.page.waitForTimeout(300);
      const after = current();
      eq(after.revision, before.revision, `table ${n}: reload reconnects to the same authoritative revision`);
      eq(after.decision?.id, before.decision?.id, `table ${n}: reload preserves the pending question`);
      reloaded = true;
    }
    // A human decision holds the room still: compare the displayed assignments with the real engine's view.
    const snapshot=current();
    if(snapshot?.decision && snapshot.state.combat?.attacks.length){
      const publicIds=new Set(snapshot.state.players.flatMap(p=>p.zones.Battlefield.cards.map(c=>c.cardId)));
      const expected=snapshot.state.combat.attacks.filter(a=>publicIds.has(a.attacker)).map(a=>({
        attacker:a.attacker,target:String(a.planeswalker??`seat:${a.defender}`),
        blockers:a.blocked?a.blockers.filter(id=>publicIds.has(id)):[]
      })).sort((a,b)=>a.attacker-b.attacker);
      await rob.page.waitForFunction(ids=>JSON.stringify([...document.querySelectorAll('.cm-combat-row')].map(el=>Number(el.dataset.combatAttacker)).sort((a,b)=>a-b))===JSON.stringify(ids),expected.map(a=>a.attacker));
      const shown=await rob.page.locator('.cm-combat-row').evaluateAll(rows=>rows.map(el=>({
        attacker:Number(el.dataset.combatAttacker),target:el.dataset.combatTarget,
        blockers:[...el.querySelectorAll('[data-combat-role="Blocker"]')].map(b=>Number(b.dataset.card))
      })));
      assert.deepEqual(shown.sort((a,b)=>a.attacker-b.attacker),expected,`table ${n}: confirmed combat matches the real room at revision ${snapshot.revision}`);
      combatFrames++;
    }
    if (await act()) {actions++; if (actions % 50 === 0) console.log(`  table ${n}: ${actions} actions, turn ${current().state.turn}`);}
    else await rob.page.waitForTimeout(100);
  }
  const result = current();
  eq(result.status, "finished", `table ${n}: the game reaches its end through the board`);
  ok(result.result?.reason !== "ended early", `table ${n}: a real ending (${JSON.stringify(result.result)})`);
  ok(reloaded, `table ${n}: reconnect exercised during the game`);
  ok(combatFrames>0, `table ${n}: real combat display compared at ${combatFrames} held decisions`);
  const views = viewsAt(rob.email, id);
  await rob.page.locator(".cm-board-over").waitFor({timeout: 10000});
  // A library's first projected card is not automatically public. Download through
  // the board and let the replay oracle judge every seat's view before accepting
  // any opponent hand/library identity, including a legitimately revealed top.
  const [download] = await Promise.all([rob.page.waitForEvent("download"), rob.page.click(".cm-board-over [data-action=board-record]")]);
  const record = JSON.parse(readFileSync(await download.path(), "utf8"));
  eq([record.kind, record.matchId], ["full", result.matchId], `table ${n}: the board downloads this game's complete record`);
  const allowed = new Set();
  const visibilityKey = (v, owner, zone, card) => `${v.revision}|${owner}|${zone}|${card.cardId}|${card.name}`;
  const judge = async (room, ...args) => {
    const leaks = await checkLeaks(room, ...args);
    if (!leaks.length) {
      const v = room.view(room.seats[0].seatId);
      v.state.players.forEach((p, owner) => {if (owner !== v.seat) for (const zone of ["Hand", "Library"])
        for (const card of p.zones[zone]?.cards ?? []) if (card.name) allowed.add(visibilityKey(v, owner, zone, card));});
    }
    return leaks;
  };
  const replay = await replayRecord(record, {cards:tableCards, judge});
  ok(replay.same && !replay.exception && !replay.leaks.length,
    `table ${n}: identical replay and no visibility leaks (${replay.leakChecks} checks)${replay.exception ? `: ${replay.exception}` : ""}`);
  const unseen = frames => frames.flatMap(v => v.state.players.flatMap((p, owner) => owner === v.seat ? [] :
    ["Hand", "Library"].flatMap(zone => (p.zones[zone]?.cards ?? []).filter(card => card.name && !allowed.has(visibilityKey(v, owner, zone, card))))));
  const leaked = structuredClone(views[0]);
  leaked.state.players[1].zones.Library.cards = [{cardId:-999, name:"Synthetic hidden library card"}];
  ok(unseen([leaked]).length > 0, `table ${n}: the visibility assertion rejects an injected hidden library-top identity`);
  ok(!unseen(views).length, `table ${n}: all ${views.length} browser frames match oracle-approved private-zone visibility`);
  const banner = (await rob.page.locator(".cm-board-over").innerText()).replace(/\s+/g, " ").slice(0, 160);
  if (SHOTS) await rob.page.screenshot({path: path.join(SHOTS, `table${n}-end.png`)});
  const room = tableFor(id).room;
  let lands = null;
  try { lands = room.view(room.seats[0].seatId).state.players.map((p) => (p.zones.Battlefield?.cards ?? []).filter((c) => (tableCards(c.name)?.types ?? []).includes("Land")).length); } catch {}
  console.log(JSON.stringify({table: n, actions, turns: result.state.turn, result: result.result, banner, landsAtEnd: lands, refusals: room.refusals, seconds: Math.round((Date.now() - started) / 1000)}));
  eq(room.refusals.total, 0, `table ${n}: no AI answer was refused during the whole match`);
  clearInterval(alarm);
}
try {
  const rob = await person(ROB, {width: VW, height: VH});
  for (const [i, pod] of PODS.entries()) await journey(i + 1, rob, pod);
} finally {for (const alarm of alarms) clearInterval(alarm); await close();}
console.log(`solo-vs-ai real browser: ${checks} checks passed`);
process.exit(0);
