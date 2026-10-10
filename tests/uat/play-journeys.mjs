/* PLAY, END TO END, THROUGH THE REAL UI (docs/plan-to-done-2026-09-30.md, Part 6 gap 3 and Part 7's G-B).
 *
 * A four-seat table run the way people run one: Rob at a desk hosts from New table, invites Maya, who joins from the
 * link on a phone held sideways, and seats two AIs; each person brings a deck from their own library by name, the
 * host chooses the AIs'; everyone is ready, the countdown runs out, and the game is played through the board's own
 * controls -- the draw, Pass, every question the room asks, answered as the house pilot would -- while the house pilots
 * play the AI seats.
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
 *   Waits    how long each person's answer took to come back as a question to a person (or the end): the room's own
 *            time with the AI seats' play, measured in this process. Over the network it waits on a real browser on
 *            a real network (this container's proxy carries no WebSocket), so this is the floor of the five-second rule.
 *
 * THE CARDS are the table's own (cloud/game-room.mjs, tableCards): every card of the seven decks is defined (477 of
 * 477), and a card's questions -- a target, a mode, a payment, an order -- are answered through the board by
 * tests/uat/board-person.mjs, as tests/uat/real-deck-game.mjs answers them. The rules are G1's
 * (tools/fuzz-live.mjs); the journeys are the UI's.
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
import {GameTable, tableCards} from "../../cloud/game-room.mjs";
import {boardPerson} from "./board-person.mjs";
import {build, worktreeSource} from "../../tools/release-pages.mjs";
import {joinLocation} from "../../cloud/worker.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1; console.log(`  ok  ${m}`);};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1; console.log(`  ok  ${m}`);};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};
const SIZES = [[1280, 720], [1400, 900], [1920, 1080], [2560, 1080]];
const PHONE = {width: 844, height: 390};
const TURNS = Number(process.env.JOURNEY_TURNS || 12);

/* ---- the cards: the table's own definitions, and Rob's seven decks from the committed library ---- */
const cards = tableCards;
const library = JSON.parse(readFileSync(path.join(ROOT, "data", "live-state.json"), "utf8")).payload.state;
const DECKS = library.decks.filter((d) => /^deck:live:D[1-7]$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id));

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
    const server = {tags: null, closed: false, send(f) {if (!this.closed) {frames[email].push({id, f, at: Date.now()}); ws.send(f);}}, close() {this.closed = true;}};
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
const waitsSeen = [], alarms = [];
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
  /* The app at "/", where an invitation's link comes back to (cloud/worker.mjs, joinLocation). */
  await page.route((url) => url.origin === base && url.pathname === "/", (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: PAGE}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  /* The Coach's door, shut as it is until the privacy page names what it sends (cloud/worker.mjs, AI_COACH): the board
     says so in the Coach's own words. A moment's wait, as the network has, so its typing shows. */
  await page.route(`${base}/api/ai/coach`, async (r) => {await new Promise((go) => setTimeout(go, 300)); r.fulfill({status: 503, json: {error: "The Coach is not switched on here yet."}});});
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
  eq((await rob.page.locator(".cm-cloud-table .cm-lobby-seat h3").allTextContents()).map((t) => t.trim()), ["Seat 1 · You", "Seat 2 · Maya", "Seat 3 · AI · Normal", "Seat 4 · AI · Normal"], `table ${n}: New table seats Rob, Maya to invite, and two AIs`);
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
  await maya.page.goto(joinLocation(new URL(link.replace(/^https?:\/\/[^/]+/, base))));   /* the Worker's answer to the link */
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

  /* PLAY: through the board's own controls, until turn TURNS, the house pilots playing the AI seats; a slice the room
     stopped at (the Durable Object's CPU budget) is carried on by its alarm, as the Worker's is. */
  const turnOf = () => {const v = viewsAt(ROB, id).at(-1); return v ? v.state.turn : 0;};
  const alarm = setInterval(() => {if (tableFor(id).room?.continuing) serial(() => tableFor(id).alarm());}, 50);
  const people = [[rob, 0], [maya, 1]].map(([who, seat]) => boardPerson({page: who.page, seat, cards, current: () => viewsAt(who.email, id).at(-1)}));
  alarms.push(alarm);
  const settle = async () => {for (let i = 0; i < 300 && tableFor(id).room?.continuing; i += 1) await rob.page.waitForTimeout(50);};
  for (let i = 0; i < 3000 && turnOf() < TURNS && viewsAt(ROB, id).at(-1)?.status !== "finished"; i += 1) {
    const moved = (await people[0]()) | (await people[1]());
    if (!moved) await rob.page.waitForTimeout(100);
  }
  /* Play stops at a person's question, never mid-slice, so End game is not refused while the AIs play on. */
  await settle();
  if (turnOf() < TURNS) {
    const v = viewsAt(ROB, id).at(-1), m = viewsAt(MAYA, id).at(-1);
    console.log("play-journeys: the table stalled", JSON.stringify({turn: v && v.state.turn, phase: v && v.state.phase, status: v && v.status, robDecision: v && v.decision && {kind: v.decision.kind, title: v.decision.title, options: (v.decision.options || []).slice(0, 4).map((o) => o.label)}, mayaDecision: m && m.decision && {kind: m.decision.kind, title: m.decision.title, mode: m.decision.mode}, waiting: v && (v.waitingOn ?? v.waiting), frames: [viewsAt(ROB, id).length, viewsAt(MAYA, id).length]}));
    console.log("ROB PAGE", (await text(rob.page, "#cm-board")).slice(0, 600).replace(/\n+/g, " | "));
    console.log("MAYA PAGE", (await text(maya.page, "#cm-board")).slice(0, 600).replace(/\n+/g, " | "));
  }
  const answers = people[0].waits.length + people[1].waits.length;
  ok(turnOf() >= TURNS || viewsAt(ROB, id).at(-1)?.status === "finished", `table ${n}: four seats play to turn ${turnOf()} with the real cards, ${answers} answers through the board's controls, the AIs played by the house pilots`);
  eq(tableFor(id).room.refusals.total, 0, `table ${n}: no AI answer was refused by the rules`);
  /* The decks' own rules, not stand-ins: a vanilla card puts nothing but itself on the stack. */
  const rules = new Set(viewsAt(ROB, id).flatMap((v) => v.state.stack.filter((e) => e.kind !== "spell" && e.name).map((e) => `${e.name} (${e.kind})`)));
  ok(rules.size > 0, `table ${n}: the decks played by their own rules -- ${rules.size} abilities and triggers went on the stack (${[...rules].slice(0, 6).join(", ")}${rules.size > 6 ? ", ..." : ""})`);
  /* WAITS: from a person's click to the room's next frame that asks a person (or ends the game), the AIs' play and
     any slices between included; a click no such frame followed counts until now. */
  const settled = [ROB, MAYA].flatMap((email) => frames[email].filter((x) => x.id === id).map((x) => ({at: x.at, f: JSON.parse(x.f)})))
    .filter(({f}) => f.view && !f.view.continuing && (f.view.status === "finished" || ["s0", "s1"].includes(f.view.waitingOn))).map(({at}) => at).sort((a, b) => a - b);
  const waits = people.flatMap((p) => p.waits).map(({title, at}) => ({title, ms: (settled.find((t) => t >= at) ?? Date.now()) - at})).sort((a, b) => a.ms - b.ms);
  const pct = (q) => waits[Math.min(waits.length - 1, Math.floor(q * waits.length))]?.ms ?? 0;
  waitsSeen.push(...waits.map((w) => w.ms));
  ok(waits.length > 0 && waits.at(-1).ms < 5000, `table ${n}: every answer came back as a person's next question within five seconds, in this process (${waits.length} answers; median ${pct(0.5)} ms, 90th percentile ${pct(0.9)} ms, longest ${waits.at(-1)?.ms} ms${waits.length ? `, at "${waits.at(-1).title}"` : ""})`);
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
        /* Every caption on a board -- a zone's (Battlefield, Lands · 3), a group's (Creatures · 2), a pile's count -- is
           read whole: no card of its zone over it, nor the life counter, a circle at the table's center. */
        const meet = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const pie = document.querySelector("#cm-board .cm-board-table > .cm-board-pie"), round = pie && pie.getBoundingClientRect();
        const underPie = (b) => {
          if (!round) return false;
          const cx = round.left + round.width / 2, cy = round.top + round.height / 2, r = round.width / 2 - 1;
          const x = Math.max(b.left, Math.min(cx, b.right)), y = Math.max(b.top, Math.min(cy, b.bottom));
          return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
        };
        const covered = [];
        for (const caption of document.querySelectorAll("#cm-board .cm-mat .cm-mat-label, #cm-board .cm-mat .cm-board-group h3, #cm-board .cm-mat .cm-board-pile figcaption > *")) {
          const box = caption.getBoundingClientRect(), zone = caption.closest(".cm-mat-zone"), seat = caption.closest(".cm-mat")?.dataset.seat;
          if (box.width <= 1 || box.height <= 1 || getComputedStyle(caption).visibility === "hidden" || !zone) continue;   /* a screen reader's alone */
          const said = `seat ${seat}'s ${zone.dataset.zone} "${caption.textContent.trim()}"`;
          const card = [...zone.querySelectorAll(".cm-bcard")].find((c) => !c.closest(".cm-board-pile") && meet(box, c.getBoundingClientRect()));
          if (card) covered.push(`${said} under ${card.getAttribute("aria-label")?.split(/[,:]/)[0]}`);
          else if (underPie(box)) covered.push(`${said} under the life counter`);
        }
        return {cards: hand.length, whole: hand.every((c) => {const r = c.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5;}), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          boards: document.querySelectorAll("#cm-board .cm-mat").length, covered};
      });
      ok(g.whole && g.sideways === 0 && g.boards >= (view === "focus" ? 1 : 4), `table ${n} at ${width}x${height}, ${view}: the hand whole in the window (${g.cards} cards), ${g.boards} boards, nothing scrolling sideways`);
      ok(g.covered.length === 0, `table ${n} at ${width}x${height}, ${view}: every zone's caption whole, no card or the life counter over it${g.covered.length ? ` -- ${g.covered.join("; ")}` : ""}`);
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
  /* Her hand on the phone: the rail's hand fans it over the board, Escape puts it back. */
  const held = viewsAt(MAYA, id).at(-1).state.players[1].zones.Hand.count;
  await maya.page.click(".cm-phone-rail [data-action=board-show-hand]");
  await maya.page.locator(".cm-hand-show .cm-hand-fan").waitFor({timeout: 5000});
  const fanned = await maya.page.locator(".cm-hand-slot").count();
  ok(/Your hand · \d+/.test(await text(maya.page, ".cm-hand-show h2")) && fanned === held, `table ${n}: on the phone, the rail's hand fans her ${held} cards over the board`);
  await shot(maya.page, `t${n}-phone-hand`);
  await maya.page.keyboard.press("Escape");
  await maya.page.locator(".cm-hand-show").waitFor({state: "detached", timeout: 5000});
  /* THE COACH: opened, a suggested prompt, the stub's reply, closed. */
  await rob.page.click(".cm-board-coach-open");
  await rob.page.locator("#cm-board-coach:not([hidden]) .cm-coach-input").waitFor();
  await rob.page.click("[data-action=board-coach-ask][data-q=\"What's my best play?\"]");
  await rob.page.locator(".cm-coach-msg.is-coach:not(.is-typing)").waitFor({timeout: 5000});
  ok(/not switched on here yet/.test(await text(rob.page, ".cm-coach-thread")), `table ${n}: the Coach answers a suggested prompt with the door's honest reply while it is shut`);
  await rob.page.keyboard.press("Escape");
  await rob.page.locator("#cm-board-coach[hidden], #cm-board-coach:not(:has(.cm-coach-input))").first().waitFor({state: "attached", timeout: 5000}).catch(() => {});
  /* CONCEDE, at the second table: Maya leaves it from the phone's settings, and the others play on. */
  const conceding = n === 2;
  if (conceding) {
    await maya.page.click(".cm-phone-rail [data-action=board-tools]");
    await maya.page.click("#cm-board-tools [data-action=board-concede]");
    await waitText(maya.page, ".cm-board-banner", /You have left this game; the others play on/);
    for (let i = 0; i < 100 && viewsAt(ROB, id).at(-1)?.departures?.s1 !== "conceded"; i += 1) await rob.page.waitForTimeout(50);
    const after = viewsAt(ROB, id).at(-1);
    ok(after.departures.s1 === "conceded" && after.status === "playing", `table ${n}: Maya concedes from the phone's settings; her board says she has left, and Rob's game goes on without her`);
    await settle();
  }
  /* END, and THE RECORD. */
  await rob.page.click("[data-action=board-tools]");
  await rob.page.click("#cm-board-tools [data-action=board-end]");
  await rob.page.click("#cm-board-tools [data-action=board-end][data-confirm='1']");
  await waitText(rob.page, ".cm-board-over", /ended early/).catch(async (e) => {console.log("ROB AT END", (await text(rob.page, "#cm-main")).slice(0, 500).replace(/\n+/g, " | ")); throw e;});
  await waitText(maya.page, "#cm-main", /ended early/).catch(async (e) => {console.log("MAYA AT END", (await text(maya.page, "#cm-main")).slice(0, 500).replace(/\n+/g, " | ")); throw e;});
  ok(true, `table ${n}: Tools > End game, two taps, and both boards say it was ended early${conceding ? " (hers too, after she left)" : ""}`);
  clearInterval(alarm);
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
  for (const alarm of alarms) clearInterval(alarm);
  await close();
}
waitsSeen.sort((a, b) => a - b);
console.log(`play-journeys: ${checks} checks passed -- two four-seat tables through the real UI with the seven decks' own cards: New table, the invite on a phone, decks from the library, the countdown, the game played through the board's controls with the house pilots at the AI seats, every view at four sizes and on the phone, the Coach, End game and the record. Waits over ${waitsSeen.length} answers, in this process: median ${waitsSeen[Math.floor(waitsSeen.length / 2)] ?? 0} ms, longest ${waitsSeen.at(-1) ?? 0} ms.`);
process.exit(0);
