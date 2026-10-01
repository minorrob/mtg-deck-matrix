/* PLAY, END TO END, THROUGH THE REAL UI (docs/plan-to-done-2026-09-30.md, Part 6 gap 3 and Part 7's G-B).
 *
 * A four-seat table run the way people run one: Rob at a desk hosts from New table, invites Maya, who joins from the
 * link on a phone held sideways, and seats two AIs; each person brings a deck from their own library by name, the
 * host chooses the AIs'; everyone is ready, the countdown runs out, and the game is played through the board's own
 * buttons -- Keep, a land a turn, the pass button, what the room asks -- while the house pilots play the AI seats.
 * Two tables, so all seven of Rob's decks take a seat: D1-D4 at the first, D5-D7 and D1 at the second.
 *
 *   Lobby    New table with a person and two AIs; decks from the library by name; the invite link joined on a phone;
 *            Ready, Start, the countdown, the board.
 *   Hidden   no frame to one person names a card in another seat's hand or library; every hand but your own is a
 *            count (the room's projection, read from every frame of the game).
 *   Views    at 1280x720, 1400x900, 1920x1080 and 2560x1080: Table, Focus and Full screen, the hand whole in the
 *            window and nothing scrolling sideways; on the phone held sideways, Focus only and the board the screen.
 *   Coach    opened from the board, a suggested prompt asked, the stub's reply, closed.
 *   Record   Tools > End game, two taps; both boards say so; Rob's own seat's record downloads, with the history and
 *            nothing of Maya's hidden cards.
 *
 * THE CARDS. The engine plays basic lands and the cards whose scripts exist (docs/engine/coverage.md); a real game of
 * Rob's decks waits on M4 and G1. Until then each card here is the engine's vanilla version of itself, as the board
 * fixture does it (tools/board-fixture.mjs): a creature its printed power and toughness, any other permanent of its
 * type, an instant or sorcery that resolves and does nothing, every land a land that taps for one colorless, each
 * costing its mana value up to four. The journeys are the UI's; the rules are G1's.
 *
 * Runs only when asked (tests/uat is not in runtests.sh): it plays two whole tables and takes a few minutes.
 *
 *   node tests/uat/play-journeys.mjs            UAT_SHOTS=<dir> also writes a screenshot of each view at each size
 *
 * Needs Playwright and Chromium.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, loadLiveState, ROOT} from "./browser-runner.mjs";
import {basicCards} from "../../game/room/room.mjs";
import {GameTable} from "../../cloud/game-room.mjs";
import {build, worktreeSource} from "../../tools/release-pages.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1; console.log(`  ok  ${m}`);};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1; console.log(`  ok  ${m}`);};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};
const SIZES = [[1280, 720], [1400, 900], [1920, 1080], [2560, 1080]];
const PHONE = {width: 844, height: 390};
const TURNS = Number(process.env.JOURNEY_TURNS || 6);

/* ---- the cards: each real card as the engine's vanilla version of itself ---- */
const records = new Map(JSON.parse(readFileSync(path.join(ROOT, "data", "cards.json"), "utf8")).cards.map((c) => [c.name, c]));
const library = JSON.parse(readFileSync(path.join(ROOT, "data", "live-state.json"), "utf8")).payload.state;
const DECKS = library.decks.filter((d) => /^deck:live:D[1-7]$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id));
const num = (v, d) => (/^\d+$/.test(String(v ?? "")) ? Number(v) : d);
const cost = (r) => `{${Math.min(4, Math.max(1, Math.round((r && r.manaValue) || 1)))}}`;
const COLORLESS = [{id: "t-c", kind: "mana", tapSelf: true, produces: {C: 1}}];
function cards(name) {
  const basic = basicCards(name);
  if (basic) return basic;
  const r = records.get(name) || records.get(String(name).split(" // ")[0]);
  const line = (r && r.typeLine) || "";
  if (/\bLand\b/.test(line)) return {types: ["Land"], abilities: COLORLESS};
  if (/\bCreature\b/.test(line)) return {types: ["Creature"], power: num(r.power, 2), toughness: num(r.toughness, 2), manaCost: cost(r)};
  for (const type of ["Artifact", "Enchantment", "Planeswalker", "Battle"]) if (line.includes(type)) return {types: [type], manaCost: cost(r)};
  for (const type of ["Instant", "Sorcery"]) if (line.includes(type)) return {types: [type], manaCost: cost(r)};
  return {types: ["Creature"], power: 2, toughness: 2, manaCost: "{2}"};
}

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
const {browser, base, stub, close} = await openBrowser({name: "play-journeys", flag: "PLAY_JOURNEYS_REQUIRED"});
async function person(email, viewport, {fullscreen = true} = {}) {
  const context = await browser.newContext({viewport, serviceWorkers: "block", acceptDownloads: true});
  const page = await context.newPage();
  if (!fullscreen) await page.addInitScript(() => Object.defineProperty(Document.prototype, "fullscreenEnabled", {get: () => false}));
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: PAGE}));
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
  console.log(`play-journeys: table ${n} -- ${[robDeck, mayaDeck, ninaDeck, theoDeck].map((d) => d.name).join(" · ")}`);
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
  /* INVITE: the link, opened on Maya's phone. */
  await rob.page.click(".cm-lobby-seat[data-seat='1'] [data-action=table-invite]");
  await rob.page.locator("#cm-table-link").waitFor();
  const link = await rob.page.inputValue("#cm-table-link");
  await rob.page.keyboard.press("Escape");
  await maya.page.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await maya.page.waitForFunction(() => /#table\?id=/.test(location.hash), null, {timeout: 30000});
  await maya.page.locator(".cm-cloud-table .cm-lobby-seat").first().waitFor({timeout: 30000});
  eq((await maya.page.locator(".cm-lobby-seat[data-seat='1'] h3").textContent()).trim(), "Seat 2 · You", `table ${n}: Maya opens the invite on her phone held sideways and lands on her seat`);
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

  /* PLAY: through the board's own buttons, until turn TURNS, the house pilots playing the AI seats. */
  const turnOf = () => {const v = viewsAt(ROB, id).at(-1); return v ? v.state.turn : 0;};
  const act = async ({page}) => {
    const decision = page.locator("#cm-board-decision [data-action=board-option], .cm-phone-ask [data-action=board-option]");
    if (await decision.count()) {
      const keep = page.locator("#cm-board-decision [data-action=board-option], .cm-phone-ask [data-action=board-option]", {hasText: "Keep"});
      const confirm = page.locator("[data-action=board-confirm]:not([disabled])");
      if (await keep.count()) await keep.first().click();
      else if (await confirm.count()) await confirm.first().click();
      else await decision.first().click();
      return true;
    }
    /* The draw is its own beat (B5): Draw a card. */
    const draw = page.locator("[data-action=board-draw]:not([disabled])");
    if (await draw.count()) {await draw.first().click(); return true;}
    const land = page.locator(".cm-board-hand .cm-bcard.is-bright");
    if (await land.count()) {await land.first().click(); return true;}
    const pass = page.locator("[data-action=board-pass]:not([disabled])");
    if (await pass.count()) {await pass.first().click(); return true;}
    return false;
  };
  for (let i = 0; i < 600 && turnOf() < TURNS; i += 1) {
    const moved = (await act(rob)) | (await act(maya));
    await rob.page.waitForTimeout(moved ? 120 : 400);
  }
  if (turnOf() < TURNS) {
    const v = viewsAt(ROB, id).at(-1), m = viewsAt(MAYA, id).at(-1);
    console.log("play-journeys: the table stalled", JSON.stringify({turn: v && v.state.turn, phase: v && v.state.phase, status: v && v.status, robDecision: v && v.decision && {kind: v.decision.kind, title: v.decision.title, options: (v.decision.options || []).slice(0, 4).map((o) => o.label)}, mayaDecision: m && m.decision && {kind: m.decision.kind, title: m.decision.title, mode: m.decision.mode}, waiting: v && (v.waitingOn ?? v.waiting), frames: [viewsAt(ROB, id).length, viewsAt(MAYA, id).length]}));
    console.log("ROB PAGE", (await text(rob.page, "#cm-board")).slice(0, 600).replace(/\n+/g, " | "));
    console.log("MAYA PAGE", (await text(maya.page, "#cm-board")).slice(0, 600).replace(/\n+/g, " | "));
  }
  ok(turnOf() >= TURNS, `table ${n}: four seats play to turn ${turnOf()} through the board's buttons, the AIs played by the house pilots`);
  const robViews = viewsAt(ROB, id), mayaViews = viewsAt(MAYA, id);
  const hidden = (views, me) => views.every((v) => v.state.players.every((p, seat) => seat === me || (p.zones.Hand.cards || []).every((c) => !c.name) && (p.zones.Library.cards || []).every((c) => !c.name)));
  ok(robViews.length >= TURNS && mayaViews.length >= TURNS, `table ${n}: the room sent each person their view all game (${robViews.length} to Rob, ${mayaViews.length} to Maya)`);
  ok(hidden(robViews, 0) && hidden(mayaViews, 1), `table ${n}: in every frame (${robViews.length} to Rob, ${mayaViews.length} to Maya), every other seat's hand and library carry no card names`);
  const robHand = new Set(robViews.flatMap((v) => (v.state.players[0].zones.Hand.cards || []).map((c) => c.name)).filter(Boolean));
  const mayaPublic = new Set(mayaViews.flatMap((v) => v.state.players.flatMap((p) => ["Battlefield", "Graveyard", "Exile", "Command"].flatMap((z) => (p.zones[z]?.cards || []).map((c) => c.name)))).concat(mayaViews.flatMap((v) => (v.state.stack || []).map((s) => s.name))).filter(Boolean));
  /* By name, too: a card from Rob's hand that is not in Maya's own deck and was never in the open must not appear in
     anything sent to her. */
  const mayaDeckNames = new Set([...(sent[id][`${MAYA}:1`]?.cards || []), ...(sent[id][`${MAYA}:1`]?.commander || [])]);
  const mayaText = frames[MAYA].filter((x) => x.id === id).map((x) => x.f).join(" ");
  const watched = [...robHand].filter((name) => !mayaPublic.has(name) && !mayaDeckNames.has(name) && !basicCards(name));
  const leaked = watched.filter((name) => mayaText.includes(JSON.stringify(name)));
  ok(mayaDeckNames.size > 20 && leaked.length === 0, `table ${n}: no card from Rob's hand reaches Maya by name unless it was played in the open (${watched.length} names watched${leaked.length ? "; leaked: " + leaked.join(", ") : ""})`);

  /* VIEWS: Rob's desk at each size. */
  for (const [width, height] of SIZES) {
    await rob.page.setViewportSize({width, height});
    for (const view of ["table", "focus", "full"]) {
      await rob.page.click(`[data-action=board-view][data-view=${view}]`);
      await rob.page.locator(view === "full" ? ".cm-full-rail" : view === "table" ? ".cm-board-table" : ".cm-board-mat").waitFor();
      await rob.page.waitForTimeout(300);
      const g = await rob.page.evaluate(() => {
        const hand = [...document.querySelectorAll(".cm-board-hand .cm-bcard")];
        return {cards: hand.length, whole: hand.every((c) => {const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5;}), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          boards: document.querySelectorAll("#cm-board .cm-mat").length};
      });
      ok(g.whole && g.sideways === 0 && g.boards >= (view === "focus" ? 1 : 4), `table ${n} at ${width}x${height}, ${view}: the hand whole in the window (${g.cards} cards), ${g.boards} boards, nothing scrolling sideways`);
      await shot(rob.page, `t${n}-${view}-${width}x${height}`);
    }
    await rob.page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
    await rob.page.click("[data-action=board-view][data-view=focus]");
  }
  await rob.page.setViewportSize({width: 1400, height: 900});
  /* THE PHONE, held sideways: Focus only, the board the whole screen. */
  await maya.page.locator("#cm-board[data-phone=landscape] .cm-phone-rail").waitFor({timeout: 10000});
  const phone = await maya.page.evaluate(() => {const b = document.getElementById("cm-board").getBoundingClientRect(); return {board: [Math.round(b.width), Math.round(b.height)], views: document.querySelectorAll("#cm-board [data-action=board-view]").length, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, seats: document.querySelectorAll(".cm-phone-seat").length};});
  ok(phone.board[0] === PHONE.width && phone.board[1] === PHONE.height && phone.views === 0 && phone.sideways === 0 && phone.seats === 4, `table ${n}: on the phone held sideways, Focus only, the board the whole screen (${phone.board.join("x")}), all four seats in the strip`);
  await shot(maya.page, `t${n}-phone-landscape`);
  /* THE COACH: opened, a suggested prompt, the stub's reply, closed. */
  await rob.page.click(".cm-board-coach-open");
  await rob.page.locator("#cm-board-coach:not([hidden]) .cm-coach-input").waitFor();
  await rob.page.click("[data-action=board-coach-ask][data-q=\"What's my best play?\"]");
  await rob.page.locator(".cm-coach-msg.is-coach:not(.is-typing)").waitFor({timeout: 5000});
  ok(/not switched on yet/.test(await text(rob.page, ".cm-coach-thread")), `table ${n}: the Coach answers a suggested prompt with the stub's honest reply`);
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-board-coach[hidden], #cm-board-coach:not(:has(.cm-coach-input))").first().waitFor({state: "attached", timeout: 5000}).catch(() => {});
  /* END, and THE RECORD. */
  await rob.page.click("[data-action=board-tools]");
  await rob.page.click("#cm-board-tools [data-action=board-end]");
  await rob.page.click("#cm-board-tools [data-action=board-end][data-confirm='1']");
  await waitText(rob.page, ".cm-board-over", /ended early/).catch(async (e) => {console.log("ROB AT END", (await text(rob.page, "#cm-main")).slice(0, 500).replace(/\n+/g, " | ")); throw e;});
  await waitText(maya.page, "#cm-main", /ended early/).catch(async (e) => {console.log("MAYA AT END", (await text(maya.page, "#cm-main")).slice(0, 500).replace(/\n+/g, " | ")); throw e;});
  ok(true, `table ${n}: Tools > End game, two taps, and both boards say it was ended early`);
  const [download] = await Promise.all([rob.page.waitForEvent("download", {timeout: 15000}), rob.page.click(".cm-board-over [data-action=board-record]")]);
  const rec = JSON.parse(readFileSync(await download.path(), "utf8"));
  const mayaHidden = new Set(mayaViews.flatMap((v) => (v.state.players[1].zones.Hand.cards || []).map((c) => c.name)).filter((name) => name && !basicCards(name) && !mayaPublic.has(name) && !robHand.has(name)));
  const inRecord = [...mayaHidden].filter((name) => JSON.stringify(rec).includes(JSON.stringify(name)));
  ok(rec.kind === "seat" && rec.seatId === "s0" && rec.history.length > 0 && !("seed" in rec) && inRecord.length === 0, `table ${n}: Rob's record is his own seat's, with the history, no seed, and none of Maya's ${mayaHidden.size} hidden cards`);
  return id;
}

try {
  assert.ok(DECKS.length === 7, `the library holds Rob's seven decks (${DECKS.map((d) => d.id).join(", ")})`);
  const rob = await person(ROB, {width: 1400, height: 900});
  const maya = await person(MAYA, PHONE, {fullscreen: false});
  await journey(1, rob, maya, DECKS.slice(0, 4));
  await journey(2, rob, maya, [DECKS[4], DECKS[5], DECKS[6], DECKS[0]]);
  ok(true, `all seven decks took a seat (${DECKS.map((d) => d.name).join(", ")})`);
} finally {
  await close();
}
console.log(`play-journeys: ${checks} checks passed -- two four-seat tables through the real UI: New table, the invite on a phone, decks from the library, the countdown, the game played through the board's buttons with the house pilots at the AI seats, every view at four sizes and on the phone, the Coach, End game and the record; all seven decks seated.`);
process.exit(0);
