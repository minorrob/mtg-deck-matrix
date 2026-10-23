/* THE CLOUD TABLE'S LOBBY (M5; crankmagic-table.js), the approved journeys in a real page.
 *
 * Two people in two browsers: Rob at 1400 hosts, Maya at 390 is invited. Behind their pages the /api/tables
 * routes are answered here by the real table (game/room/table.mjs through the GameTable object), as each of
 * them, so what the pages are allowed to do is what the server allows.
 *
 *   Host     New table: seat 1 is you, the others a person, an AI or nobody. The lobby is four quadrants and
 *            the table's rules.
 *   Invite   the dialog gives the link, a QR of it and an email; the link opened on another phone joins that
 *            seat, and a spent or made-up one is refused in words.
 *   Deck     from your own library; one the engine cannot play is refused naming its cards; nobody sees
 *            another seat's cards.
 *   Start    Ready, Start, the countdown's number, Cancel; then the game is on.
 *   Mat      Choose mat: the app's own mats, a preview, everyone sees it, remembered for the next table; Use this mat
 *            beside the ✕, on once a mat is picked, and no Cancel (Rob, 2026-09-30).
 *   Rules    the host's small Edit beside Table rules: starting life and a bracket limit, a deck above it refused with
 *            what to do instead, and Edit refused once a seat is ready; a guest sees the rules and no Edit.
 *   Board    once the game is on the page is the board's (tests/table-board.mjs); once over, the lobby says so.
 *   Shut     without the cloud-Play mark the page says Coming Soon; every write carries Play's header.
 *   Page     marked for Play, the page is staging's own release page, so a module it leaves out cannot be leaned on.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {openBrowser, loadLiveState, legendaryNames} from "./uat/browser-runner.mjs";
import {basicCards} from "../game/room/room.mjs";
import {GameTable, tableCards} from "../cloud/game-room.mjs";
import {MATS} from "../game/room/table.mjs";
import {build, worktreeSource} from "../tools/release-pages.mjs";
import {joinLocation} from "../cloud/worker.mjs";
import {tables} from "../cloud/tables.mjs";
import {decksFromBackup} from "../tools/fuzz-live.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const shot = async (page, name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${name}.png`)});};
/* The rules panel as read: the contrast of its text on its own ground (WCAG, alpha flattened), and whether its
   heading, rules and launch row each sit inside it without overlapping (they did not, with the app's panel
   ground under the table's ink: dark on dark, and the heading cut off at 390). */
/* THE ACCESSIBILITY PASS (docs/plan-to-done-2026-09-30.md Part 6): every word over a seat's sea, read against the worst
   sea there could be -- plain white under everything the word sits on, its opacity counted -- lowest first. */
const overSea = (page) => page.evaluate(() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", {willReadFrequently: true});
  const rgba = (css) => {cx.clearRect(0, 0, 1, 1); cx.fillStyle = "rgb(1, 2, 3)"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255];};
  const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
  const lum = (c) => {const [r, g, b] = c.map((v) => {v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;}); return 0.2126 * r + 0.7152 * g + 0.0722 * b;};
  const seen = [];
  for (const sea of document.querySelectorAll(".cm-cloud-table .cm-seat-sea")) {
    const art = sea.parentElement;
    for (const el of art.querySelectorAll("*")) {
      if (el.closest(".cm-sr-only, svg, canvas") || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect(), st = getComputedStyle(el);
      if (!r.width || !r.height || st.visibility === "hidden") continue;
      const chain = [];
      for (let n = el; n && n !== art; n = n.parentElement) chain.push(n);
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
const panelReading = (page) => page.evaluate(() => {
  const panel = document.querySelector(".cm-table-center");
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => {v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;}).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ground = rgb(getComputedStyle(panel).backgroundColor);
  const worst = Math.min(...[...panel.querySelectorAll("h2, dt, dd")].map((el) => {
    const [r, g, b, a = 1] = rgb(getComputedStyle(el).color), ink = [r, g, b].map((v, i) => v * a + ground[i] * (1 - a));
    const [hi, lo] = [lum(ink), lum(ground)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }));
  const box = panel.getBoundingClientRect(), parts = [".cm-table-head", ".cm-table-rules", ".cm-table-launch-row"].map((q) => panel.querySelector(q).getBoundingClientRect());
  const inside = parts.every((r) => r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5);
  const apart = parts.every((r, i) => i === 0 || r.top >= parts[i - 1].bottom - 0.5);
  return {worst: Math.round(worst * 10) / 10, inside, apart};
});

/* EVERY CONTROL IN REACH (Rob, 2026-10-13: an invited player, her window not maximized, had no Ready -- her seat's reading
   and buttons ran out of its quarter of the table and were cut off). Each control of the lobby, reached as a person can
   reach it -- the page scrolled, and a box with a scroll bar -- and never by scrolling a clipped box by script, which is
   how Playwright's own click found Ready at 390 here while a person could not; then the point under its middle and its
   four corners is the control. Also whether the table is stacked, and whether it is wider than itself (a hidden sideways
   scroll that focusing a button can set off). */
const inReach = (page) => page.evaluate(async () => {
  const byHand = (n) => /(auto|scroll)/.test(getComputedStyle(n).overflowX + getComputedStyle(n).overflowY);
  const table = document.querySelector(".cm-cloud-table");
  const out = [];
  for (const el of table.querySelectorAll("button, select, input, a[href]")) {
    if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden") continue;
    el.scrollIntoView({block: "center", inline: "nearest"});
    for (let n = el.parentElement; n; n = n.parentElement) if (!byHand(n) && n !== document.scrollingElement) {n.scrollTop = 0; n.scrollLeft = 0;}
    const pre = el.getBoundingClientRect();
    window.scrollBy(0, pre.top - innerHeight / 2 + pre.height / 2);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = el.getBoundingClientRect();
    const reached = [[0.5, 0.5], [0.12, 0.2], [0.88, 0.2], [0.12, 0.8], [0.88, 0.8]].every(([fx, fy]) => {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      const at = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y);
      return !!at && (at === el || el.contains(at));
    });
    out.push({label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), reached});
  }
  window.scrollTo(0, 0);
  /* And a seat's words and controls clear of its own label (its name and status pill). */
  const ov = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  let overLabel = 0;
  for (const q of table.querySelectorAll(".cm-seat-q")) {
    const label = [...q.querySelectorAll(".cm-lobby-seat > header > *")].map((el) => el.getBoundingClientRect());
    for (const bit of q.querySelectorAll(".cm-seat-detail span, .cm-seat-detail button")) if (label.some((l) => ov(bit.getBoundingClientRect(), l))) overLabel += 1;
  }
  return {controls: out, stacked: table.classList.contains("is-stacked"), sideways: table.scrollWidth - table.clientWidth, overLabel};
});
const reachWords = (r) => `${r.stacked ? "stacked" : "2x2"}; ${r.controls.map((c) => `${c.label}${c.reached ? "" : " (OUT OF REACH)"}`).join(", ")}; ${r.sideways}px sideways; ${r.overLabel} over a label`;
const allInReach = (r) => r.controls.every((c) => c.reached) && r.sideways <= 0 && r.overLabel === 0;

/* THE SERVER, HERE: one GameTable object per table. Every card is playable except one, so a refusal by name
   can be seen; the engine's own cards stand in for the rest (a vanilla creature). */
const REFUSED = "Sol Ring";
/* A commander is a legendary creature (CR 903.3): a legendary card of the library stands in as one. */
const cards = (name) => basicCards(name) ?? (name === REFUSED ? null : {types: ["Creature"], ...(legendaryNames().has(name) ? {supertypes: ["Legendary"]} : {}), power: 2, toughness: 2, manaCost: "{2}"});
let clock = Date.parse("2026-09-26T22:00:00Z");
const objects = new Map(), writes = [], deckBodies = [];
let nextId = 0;
const objectCtx = () => {
  const map = new Map(), sockets = [];
  return {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
};
let useConfirmedCards = false;
const tableFor = (id) => {if (!objects.has(id)) objects.set(id, new GameTable(objectCtx(), {}, {cards:useConfirmedCards ? tableCards : cards, now: () => clock})); return objects.get(id);};
const TABLES = {idFromName: (name) => name, get: (id) => tableFor(id)};
/* A person's table reads can be held in flight, to prove an answer that lands after they left the page draws nothing. */
const held = {};
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  if (method === "GET" && held[email]) {held[email].waiting += 1; await held[email].promise;}
  if (method !== "GET") {
    writes.push({path: url.pathname, header: req.headers()["x-crankmagic"], type: req.headers()["content-type"]});
    if (req.headers()["x-crankmagic"] !== "play") return route.fulfill({status: 403, json: {error: "That request did not come from CrankMagic."}});
  }
  const body = method === "GET" ? undefined : req.postData() || "{}";
  if (/^\/api\/tables\/[a-z0-9]+\/deck$/.test(url.pathname)) deckBodies.push(JSON.parse(body));
  /* Through the Worker's own front door (cloud/tables.mjs), each table its object here. */
  const r = await tables(new Request(url.href, {method, headers: {"content-type": "application/json"}, ...(body !== undefined ? {body} : {})}),
    {TABLES}, {email}, {newId: () => `table${String(++nextId).padStart(6, "0")}`});
  if (!r) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}

/* Marked for Play in the cloud, the page is the one staging ships: built by tools/release-pages.mjs from this tree,
   with the local game host's modules left out (Rob, 2026-09-29: the lobby borrowed its seats from one of them, and
   opened on "reading 'statusPill'" on staging while every suite, loading the whole development page, passed). */
const STAGING_PAGE = build({source: worktreeSource(), profileName: "cloud-staging"}).built.get("index.html").toString("utf8");
const html = (play) => play ? STAGING_PAGE : readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", `<meta name="crankmagic-accounts" content="on"></head>`);
const {browser, base, stub, close} = await openBrowser({name: "table-lobby", flag: "GEOMETRY_REQUIRED"});
async function person(email, viewport, {play = true, library = true} = {}) {
  const context = await browser.newContext({viewport, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  if (library) await loadLiveState(page, base);   /* a real library to bring decks from, restored before the account is on */
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html(play)}));
  /* The app at "/", where an invitation's link comes back to (cloud/worker.mjs, joinLocation). */
  await page.route((url) => url.origin === base && url.pathname === "/", (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html(play)}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email}}));
  await page.route(`${base}/api/library**`, (r) => r.request().method() === "GET" ? r.fulfill({json: {head: null}})
    : r.fulfill({json: {head: {id: "00000000-0000-4000-8000-000000000000", revision: 1, checksum: "x", device: "test", createdAt: new Date().toISOString()}}}));
  await page.route(`${base}/api/tables**`, (r) => answer(r, email));
  await page.routeWebSocket(/\/connect$/, () => {});   /* the board's socket, left quiet: this suite plays no game */
  await page.goto("about:blank");   /* so the next address loads the page afresh, with the marks above */
  return {context, page};
}
/* The words as written (A1): Moss & Iron sets headings in capitals, so a read turns text-transform off for its own
   instant and reads innerText, line breaks and all. */
const pageText = (page, sel) => page.locator(sel).evaluate((el) => { const s = document.createElement("style"); s.textContent = "*{text-transform:none!important}"; document.head.append(s); const t = el.innerText; s.remove(); return t; });
const waitText = (page, sel, re, timeout = 20000) => page.waitForFunction(([s, src]) => { const el = document.querySelector(s); if (!el) return false; const st = document.createElement("style"); st.textContent = "*{text-transform:none!important}"; document.head.append(st); const t = el.innerText; st.remove(); return new RegExp(src).test(t); }, [sel, re.source], {timeout});

try {
  /* SHUT: without the mark, Coming Soon. */
  {
    const {context, page} = await person("rob@example.com", {width: 1400, height: 900}, {play: false});
    await page.goto(`${base}/index.html#table`);
    await waitText(page, "#cm-main", /Coming Soon/);
    ok(/not switched on here yet/.test(await pageText(page, "#cm-main")), "without the cloud-Play mark, the table page says Coming Soon");
    await context.close();
  }

  const rob = await person("rob@example.com", {width: 1400, height: 900});
  const maya = await person("maya@example.com", {width: 390, height: 844});

  /* THE PLAY TAB, marked for Play in the cloud: the table's page, not the local game host's (staging's Play release). */
  await rob.page.goto(`${base}/index.html#game`);
  await rob.page.locator("#cm-play-home").waitFor({timeout: 30000});
  ok(await rob.page.locator("#cm-table-new").count() === 0, "Play opens the lounge without creating a table");
  await rob.page.getByRole('button',{name:'New table',exact:true}).click();
  await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
  ok(!/Coming Soon/.test(await pageText(rob.page, "#cm-main")), "New table is an explicit action from the lounge");

  /* HOST: a new table. */
  /* The AI door not open to Rob (GET /api/ai-seat says so): no AI on Claude is offered. */
  await rob.page.route("**/api/ai-seat", (r) => r.fulfill({json: {open: false}}));
  await rob.page.goto(`${base}/index.html#table`);
  await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
  /* The accessibility pass: the page's "?" opens the table's help, the board's keys among it. */
  await rob.page.click('#cm-main [data-action="page-help"][data-help="table"]');
  await rob.page.locator("#cm-dialog[open] .cm-help-keys").waitFor();
  ok((await rob.page.locator("#cm-dialog-title").textContent()) === "Help — Play: the table and the board" && /Space/.test(await pageText(rob.page, "#cm-dialog .cm-help-keys")), "New table's ? opens Play's help, the board's keys among it");
  await rob.page.click("#cm-dialog [data-action=close]");
  await rob.page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"), null, {timeout: 5000});
  await rob.page.fill("#cm-table-new [name=hostName]", "Rob");
  await rob.page.fill("#cm-table-new [name=name2]", "Maya");
  eq(await rob.page.locator("#cm-table-new [name=kind3] option").allTextContents(), ["A person I will invite", "An AI · Normal", "An AI · Easy", "Nobody"],
    "an AI seat is offered at Normal or Easy (AI-2)");
  await rob.page.selectOption("#cm-table-new [name=kind3]", "ai-easy");
  await rob.page.fill("#cm-table-new [name=name3]", "Shadrix");
  await rob.page.click("[data-action=table-create]");
  await rob.page.waitForFunction(() => /#table\?id=table\d+/.test(location.hash), null, {timeout: 20000});
  await rob.page.locator(".cm-cloud-table .cm-lobby-seat").first().waitFor({state: "attached"});
  eq(await rob.page.locator(".cm-cloud-table .cm-lobby-seat h3").allTextContents(), ["Seat 1 · You", "Seat 2 · Maya", "Seat 3 · AI · Easy"], "the lobby: you in seat 1, Maya to invite, an AI at Easy, as chosen; seat 4 left out");
  eq(await rob.page.locator('#cm-main .cm-page-head [data-action="page-help"]').getAttribute("data-help"), "table", "and its head carries the same ?, to the table's help");
  const seaWords = await overSea(rob.page), seaLow = seaWords.filter((w) => w.ratio < 4.5);
  ok(seaWords.length >= 6 && !seaLow.length, `every word over a seat's sea reads at 4.5:1 or better over a white sea (${seaWords.length} read; ${(seaLow.length ? seaLow : seaWords.slice(0, 3)).map((w) => `"${w.text}" (${w.cls}) ${w.ratio}`).join(", ")})`);
  /* THE SEAS DO NOT JUMP (Rob, 2026-09-29: the background played "for about a second then jumping back to the
     beginning"). The lobby reads the table every two seconds; a read that changed nothing leaves the seats' seas
     running, and a redraw that did change something picks up where the last one was, on the page's clock. */
  const sea = () => rob.page.evaluate(() => {const c = document.querySelector(".cm-cloud-table .cm-seat-sea"); if (!c) return null; c.dataset.probe ||= String(Math.random()); return {probe: c.dataset.probe, t: Number(c.dataset.t)};});
  await rob.page.waitForFunction(() => Number(document.querySelector(".cm-cloud-table .cm-seat-sea")?.dataset.t) > 0, null, {timeout: 10000});
  const before = await sea();
  await rob.page.waitForTimeout(4500);
  const after = await sea();
  ok(after.probe === before.probe && after.t - before.t > 3, `through two reads of the table the seats' seas keep running, not restarted (${before.t.toFixed(1)}s → ${after.t.toFixed(1)}s)`);
  const drawnAt = after.t;
  await rob.page.evaluate(() => {const c = document.querySelector(".cm-cloud-table"); c.remove();});
  await rob.page.waitForFunction(() => !!document.querySelector(".cm-cloud-table .cm-seat-sea")?.dataset.t, null, {timeout: 10000});
  const redrawn = await sea();
  ok(redrawn.probe !== after.probe && redrawn.t >= drawnAt, `and a sea drawn afresh carries on from the same moment, never from the beginning (${redrawn.t.toFixed(1)}s)`);
  eq(await rob.page.locator(".cm-cloud-table .cm-seat-q").count(), 3, "three quadrants, one a seat");
  ok(/Table rules/.test(await pageText(rob.page, ".cm-table-center")) && /5 minutes/.test(await pageText(rob.page, ".cm-table-center")), "the table's rules sit in the middle, the five minutes among them");
  const wide = await panelReading(rob.page);
  ok(wide.worst >= 4.5 && wide.inside && wide.apart, `the rules read at 1400: contrast ${wide.worst}, inside ${wide.inside}, apart ${wide.apart}`);
  await shot(rob.page, "lobby-new-1400");

  /* THE TABLE'S RULES (Rob, 2026-09-30, B3): the host's small Edit beside the heading; starting life and a bracket limit; a
     deck above the limit refused with what to do instead. */
  const sizes = await rob.page.evaluate(() => {const e = document.querySelector(".cm-table-center .cm-table-rules-edit"), other = document.querySelector(".cm-lobby-seat [data-action=table-deck]"), h = document.querySelector(".cm-table-head h2"); if (!e || !other) return null; const r = e.getBoundingClientRect(), o = other.getBoundingClientRect(), hr = h.getBoundingClientRect(); return {edit: Math.round(r.height), other: Math.round(o.height), beside: r.left >= hr.right && Math.abs((r.top + r.bottom) / 2 - (hr.top + hr.bottom) / 2) < 8};});
  ok(sizes && sizes.beside && sizes.edit < sizes.other * 0.75, `the host sees a small Edit beside Table rules (${sizes && sizes.edit}px, the page's buttons ${sizes && sizes.other}px)`);
  /* THE LOBBY'S MUSIC (Rob, 2026-10-09: "Lobby music."): nothing of the sound before a press in the lobby -- a browser would
     refuse to play it -- and the pack's lobby bed from the first one. */
  const audioAsked = () => rob.page.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.includes("/assets/audio/")).map((n) => n.split("/assets/audio/")[1].split("?")[0]));
  eq(await audioAsked(), [], "the lobby fetches nothing of the sound before a press in it");
  await rob.page.click(".cm-table-rules-edit");
  await rob.page.waitForFunction(() => performance.getEntriesByType("resource").some((r) => /bgm_lobby_mythic_calm\.mp3/.test(r.name)), null, {timeout: 10000});
  const lobbySound = await audioAsked();
  ok(lobbySound.includes("sound-index.json") && lobbySound.includes("bgm/bgm_lobby_mythic_calm.mp3") && !lobbySound.some((n) => /bgm_game/.test(n)), `the first press in the lobby starts its music: the pack's index and the lobby's bed, never the game's (${lobbySound.join(", ")})`);
  await rob.page.locator("#cm-table-rules-form").waitFor();
  await rob.page.fill("#cm-table-rules-form [name=startingLife]", "30");
  await rob.page.selectOption("#cm-table-rules-form [name=bracketLimit]", "2");
  await rob.page.click("[data-action=table-rules-save]");
  await waitText(rob.page, ".cm-table-rules", /Starting life\s*30/);
  ok(/Bracket limit\s*2 or lower/.test(await pageText(rob.page, ".cm-table-rules")), "Save puts 30 life and a bracket limit of 2 on the table's rules");
  await rob.page.click(".cm-lobby-seat[data-seat='0'] [data-action=table-deck]");
  await rob.page.locator("[data-action=table-use-deck]").first().waitFor();
  await rob.page.locator("[data-action=table-use-deck]").first().click();
  await rob.page.locator("#cm-table-deck-error").waitFor({state: "visible", timeout: 10000});
  ok(/is bracket \d, above this table's limit of 2\. Choose a deck at bracket 2 or lower, or ask the host to raise the limit\./.test(await rob.page.locator("#cm-table-deck-error").innerText()), `a deck above the limit is refused, with what to do instead: "${(await rob.page.locator("#cm-table-deck-error").innerText()).trim()}"`);
  await rob.page.keyboard.press("Escape");
  await rob.page.click(".cm-table-rules-edit");
  await rob.page.selectOption("#cm-table-rules-form [name=bracketLimit]", "");
  await rob.page.click("[data-action=table-rules-save]");
  await waitText(rob.page, ".cm-table-rules", /Bracket limit\s*Any/);
  ok(true, "and the host takes the limit off again");
  if (SHOTS) await rob.page.locator(".cm-table-center").screenshot({path: path.join(SHOTS, "lobby-rules-1400.png")});

  /* DECK: one the engine cannot play is refused, naming its card; then a playable one. */
  await rob.page.click(".cm-lobby-seat[data-seat='0'] [data-action=table-deck]");
  await rob.page.locator("[data-action=table-use-deck]").first().waitFor();
  const deckCount = await rob.page.locator("[data-action=table-use-deck]").count();
  ok(deckCount >= 5, `Choose a deck lists the decks in your own library (${deckCount})`);
  /* M5 (the plan review's C4): each deck says how much of it the table can play before it is chosen -- here every card
     but Sol Ring. */
  await rob.page.waitForFunction(() => [...document.querySelectorAll(".cm-table-deck-known")].every((el) => el.textContent));
  const counts = await rob.page.locator(".cm-table-deck-known").allInnerTexts();
  await rob.page.waitForFunction(()=>[...document.querySelectorAll('[data-shared-status]')].every(el=>!el.textContent.includes('Checking')));
  ok(await rob.page.locator('[data-action=table-use-shared-deck]:disabled').count()>0,"the shared catalog refuses decks when this server deliberately lacks Sol Ring");
  ok(counts.some((t) => /^\d+ of \d+ known · \d+ to learn$/.test(t)) && counts.some((t) => /^All \d+ cards known$/.test(t)),
    `each deck says how much of it the table can play: "${counts.find((t) => /to learn/.test(t))}", "${counts.find((t) => /^All/.test(t))}"`);
  eq(await rob.page.locator("[data-action=table-use-test-deck]").count(), 0, "this table is not a playtest table, so the basic lands test deck is not offered (staging's are: tests/uat/play-e2e.mjs)");
  /* Each row its commanders' colors and what the deck does (Rob, 2026-10-22), and Playable, off until ticked, puts away the
     decks the table cannot play every card of, remembered on the device. */
  const rows = await rob.page.$$eval("[data-action=table-use-deck]", (bs) => bs.map((b) => ({pips: b.querySelectorAll(".cm-table-deck-cmdr .cm-pip, .cm-table-deck-cmdr .cm-color").length, about: (b.querySelector(".cm-table-deck-about")?.textContent || "").trim()})));
  ok(rows.every((r) => r.pips > 0 && r.about.length > 20), `each library deck's row shows its commanders' colors and a line on what it does (${rows.length} rows; "${rows[0] && rows[0].about.slice(0, 60)}…")`);
  const sharedRows = await rob.page.$$eval("[data-action=table-use-shared-deck]", (bs) => bs.map((b) => ({name: b.querySelector("strong").textContent, pips: b.querySelectorAll(".cm-table-deck-cmdr .cm-pip, .cm-table-deck-cmdr .cm-color").length, about: (b.querySelector(".cm-table-deck-about")?.textContent || "").trim()})));
  /* A shared deck's line is its commanders' rules text: the records the app ships hold most; the rest the card catalog
     fetches from Scryfall, which this sandbox answers only for the shipped records (scryfall-stub.mjs), so those wait. */
  const shippedText = new Set(JSON.parse(readFileSync(path.join(ROOT, "data", "cards.json"), "utf8")).cards.filter((c) => c.oracleText).map((c) => c.name));
  const sharedDecks = JSON.parse(readFileSync(path.join(ROOT, "tests", "fixtures", "shared-staging-decks.json"), "utf8")).decks;
  const told = sharedRows.filter((r) => sharedDecks.find((d) => d.name === r.name)?.commander.every((c) => shippedText.has(c)));
  ok(sharedRows.every((r) => r.pips > 0) && told.length >= 3 && told.every((r) => r.about.length > 20),
    `and each shared deck's colors, and what its commander does wherever its text is to be had (${told.map((r) => r.name).join(", ")}; waiting: ${sharedRows.filter((r) => !r.about).map((r) => r.name).join(", ")})`);
  const visible = () => rob.page.$$eval(".cm-table-deck", (bs) => bs.filter((b) => b.offsetParent !== null).length);
  const allRows = await visible();
  ok(!(await rob.page.isChecked("[data-table-deck-playable]")), "Playable is off until it is ticked");
  await rob.page.check("[data-table-deck-playable]");
  const playableRows = await visible(), unplayable = await rob.page.locator(".cm-table-deck.is-unknown, .cm-table-deck[data-shared-deck]:disabled").count();
  ok(unplayable > 0 && playableRows === allRows - unplayable && await rob.page.$$eval(".cm-table-deck.is-unknown, .cm-table-deck[data-shared-deck]:disabled", (bs) => bs.every((b) => b.offsetParent === null)),
    `ticked, Playable puts away the ${unplayable} decks the table cannot play every card of (${playableRows} of ${allRows} left)`);
  eq(await rob.page.evaluate(() => localStorage.getItem("cm-table-deck-playable")), "on", "and it is remembered on the device");
  await rob.page.uncheck("[data-table-deck-playable]");
  eq(await visible(), allRows, "unticked, every deck is back");
  /* Find a deck with the refused card by trying them in turn until one is refused, then one that is not. */
  let refusedSeen = false, chosen = null;
  for (let i = 0; i < deckCount && (!refusedSeen || !chosen); i += 1) {
    if (!(await rob.page.locator("#cm-dialog[open]").count())) {await rob.page.click(".cm-lobby-seat[data-seat='0'] [data-action=table-deck]"); await rob.page.locator("[data-action=table-use-deck]").first().waitFor();}
    const name = (await rob.page.locator("[data-action=table-use-deck] strong").nth(i).innerText()).trim();
    await rob.page.locator("[data-action=table-use-deck]").nth(i).click();
    await rob.page.waitForTimeout(400);
    const box = rob.page.locator("#cm-table-deck-error");
    if (await rob.page.locator("#cm-dialog[open]").count() && await box.isVisible()) {
      const text = await box.innerText();
      if (!refusedSeen) {ok(text.includes(REFUSED) && text.includes(name), `a deck the engine cannot play is refused, naming the card: "${text}"`); refusedSeen = true;}
    } else chosen = name;
  }
  ok(chosen, "a playable deck is taken");
  /* The deck carries which deck of this library it is, so the finished game can be filed under it (M5). */
  {const live = JSON.parse(readFileSync(path.join(ROOT, "data", "live-state.json"), "utf8")).payload.state.decks.find((d) => d.name === chosen);
    const sent = deckBodies.filter((b) => b.seatId === 0 && b.deck.name === chosen).at(-1);
    eq(sent && sent.deck.source, {deckId: live.id, deckVersion: live.version}, `the lobby sends the chosen deck's library id and version (${live.id} v${live.version})`);}
  await waitText(rob.page, ".cm-lobby-seat[data-seat='0']", new RegExp(chosen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  /* The AI's deck: the host chooses it, and an AI with a deck is ready. */
  if (await rob.page.locator("#cm-dialog[open]").count()) await rob.page.keyboard.press("Escape");
  await rob.page.click(".cm-lobby-seat[data-seat='2'] [data-action=table-deck]");
  await rob.page.locator("[data-action=table-use-deck]").first().waitFor();
  for (let i = 0; i < deckCount; i += 1) {
    await rob.page.locator("[data-action=table-use-deck]").nth(i).click();
    await rob.page.waitForTimeout(300);
    if (!(await rob.page.locator("#cm-dialog[open]").count())) break;
  }
  await waitText(rob.page, ".cm-lobby-seat[data-seat='2'] header", /Ready/);
  ok(true, "the host chose the AI's deck, and the AI is ready");
  /* With a seat ready the rules are refused, saying how to change them. */
  await rob.page.click(".cm-table-rules-edit");
  await waitText(rob.page, "#cm-notice", /The rules can't change once a seat is ready.*Take back Ready.*choose AI decks after the rules/);
  eq(await rob.page.locator("#cm-table-rules-form").count(), 0, "with the AI ready, Edit is refused, saying how to change the rules; no dialog opens");

  /* CHOOSE MAT: a strip of the app's mats, the zones previewed over the one picked; everyone sees the choice. */
  await rob.page.click(".cm-lobby-seat[data-seat='0'] [data-action=table-mat]");
  await rob.page.locator("#cm-mat-preview").waitFor();
  /* Rob, 2026-09-30: Use this mat beside the ✕ in the header, on once a mat is picked, and no Cancel (the ✕ closes). */
  const matHead = await rob.page.evaluate(() => {const h = document.querySelector("#cm-dialog .cm-dialog-head"), use = h && h.querySelector("[data-action=table-mat-use]"), x = h && h.querySelector(".cm-dialog-close"); if (!use || !x) return null; const u = use.getBoundingClientRect(), c = x.getBoundingClientRect();
    return {off: use.disabled, beside: u.right <= c.left + 1 && Math.abs((u.top + u.bottom) / 2 - (c.top + c.bottom) / 2) < 6, cancel: [...document.querySelectorAll("#cm-dialog button")].some((b) => b.textContent.trim() === "Cancel")};});
  ok(matHead && matHead.beside && matHead.off && !matHead.cancel, "Use this mat sits beside the ✕ in the header, off until a mat is picked, and there is no Cancel");
  const picks = await rob.page.$$eval(".cm-mat-pick", (els) => els.map((el) => [el.dataset.mat, el.textContent.trim()]));
  eq(picks.slice(0, 5).map(([, name]) => name), ["Felt", "Forge", "Cavern", "Sea", "Night"], "Choose mat offers the five mats the app draws first");
  eq(picks.map(([id]) => id), [...MATS], "then Rob's 25 artwork mats (2026-09-29): exactly the mats the table accepts, in its order");
  const swatch = await rob.page.evaluate(() => {const r = document.querySelector(".cm-mat-pick .cm-mat-swatch").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)];});
  ok(swatch[0] >= 140 && Math.abs(swatch[0] / swatch[1] - 16 / 9) < 0.05, `each mat shows as a 16:9 swatch you can see (${swatch.join("×")})`);
  await rob.page.click(".cm-mat-pick[data-mat=forge]");
  ok(!(await rob.page.locator("#cm-dialog [data-action=table-mat-use]").isDisabled()), "picking a mat turns Use this mat on");
  eq([await rob.page.getAttribute("#cm-mat-preview", "data-mat"), await rob.page.getAttribute(".cm-mat-pick[data-mat=forge]", "aria-pressed")], ["forge", "true"], "picking one previews the zones over it");
  /* ROB'S ARTWORK (2026-09-29): a thumbnail in the picker, the full picture in the preview, both served by the site. */
  await rob.page.locator(".cm-mat-pick[data-mat=moon-wolf]").scrollIntoViewIfNeeded();
  await rob.page.click(".cm-mat-pick[data-mat=moon-wolf]");
  const art = await rob.page.evaluate(async () => {
    const bg = (el) => getComputedStyle(el).backgroundImage, url = (s) => (/url\("?([^")]+)"?\)/.exec(s) || [])[1];
    const thumb = url(bg(document.querySelector(".cm-mat-pick[data-mat=moon-wolf] .cm-mat-swatch"))), full = url(bg(document.getElementById("cm-mat-preview")));
    const load = async (u) => {const r = await fetch(u); return [r.status, r.headers.get("content-type"), (await r.arrayBuffer()).byteLength];};
    return {thumb, full, thumbGot: thumb && await load(thumb), fullGot: full && await load(full)};
  });
  ok(/assets\/playmats\/moon-wolf-thumb\.webp$/.test(art.thumb || "") && art.thumbGot[0] === 200 && art.thumbGot[2] < 30000, `Moon Wolf's thumbnail shows in the picker, small (${art.thumbGot && art.thumbGot[2]} bytes)`);
  ok(/assets\/playmats\/moon-wolf\.webp$/.test(art.full || "") && art.fullGot[0] === 200 && /webp/.test(art.fullGot[1] || "") && art.fullGot[2] < 400000, `and the whole picture in the preview, downscaled (${art.fullGot && art.fullGot[2]} bytes)`);
  await shot(rob.page, "choose-mat-art-1400");
  await rob.page.locator(".cm-mat-pick[data-mat=forge]").scrollIntoViewIfNeeded();
  await rob.page.click(".cm-mat-pick[data-mat=forge]");
  /* The preview is the board's layout (Rob, 2026-09-29): the four piles are cards, 5:7, and the History band is outlined. */
  const zones = await rob.page.$$eval("#cm-mat-preview .cm-mat-zone", (els) => els.map((el) => {const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return {zone: el.dataset.zone, w: r.width, h: r.height, x: r.left, y: r.top, border: parseFloat(cs.borderTopWidth)};}));
  const zone = (name) => zones.find((z) => z.zone === name);
  eq(zones.map((z) => z.zone), ["battlefield", "lands", "command", "exile", "history", "library", "graveyard"], "the preview names the board's zones, History among them");
  for (const pile of ["command", "exile", "library", "graveyard"]) ok(Math.abs(zone(pile).w / zone(pile).h - 5 / 7) < 0.03, `${pile} is the shape of a card, 5:7 (${Math.round(zone(pile).w)}×${Math.round(zone(pile).h)})`);
  const h = zone("history");
  ok(h.border >= 1 && h.y > zone("command").y + zone("command").h && h.y + h.h < zone("library").y && h.w > zone("command").w * 1.5 && h.h > 20, `the History band is outlined between Command and Exile above and Library and Graveyard below (${Math.round(h.w)}×${Math.round(h.h)})`);
  await shot(rob.page, "choose-mat-1400");
  await rob.page.click("[data-action=table-mat-use]");
  await rob.page.waitForFunction(() => document.querySelector(".cm-lobby-seat[data-seat='0']")?.dataset.mat === "forge", null, {timeout: 10000});
  ok(true, "Use this mat puts it on his seat");

  /* INVITE: link, QR, email. */
  await rob.page.click(".cm-lobby-seat[data-seat='1'] [data-action=table-invite]");
  await rob.page.locator("#cm-table-link").waitFor();
  let link = await rob.page.inputValue("#cm-table-link");
  ok(/^https?:\/\/[^/]+\/api\/join\/table\d+\/[A-Za-z0-9_-]{40,}$/.test(link), `the invite dialog gives the seat's link, a path Access's sign-in keeps (a fragment it drops): ${link.replace(/\/[^/]+$/, "/…")}`);
  ok(await rob.page.locator("#cm-dialog .cm-qr-code svg").count() === 1, "a QR of it, to scan across the room");
  ok((await rob.page.getAttribute("#cm-table-mail", "href")).includes(encodeURIComponent(link)), "and an email that carries it");
  await shot(rob.page, "invite-1400");
  await rob.context.grantPermissions(["clipboard-read", "clipboard-write"], {origin: base});
  await rob.page.click("#cm-dialog [data-action=table-copy-link]");
  await waitText(rob.page, "#cm-notice", /Link copied/);
  eq(await rob.page.evaluate(() => navigator.clipboard.readText()), link, "Copy link puts the seat's link on the clipboard, and says so");
  await rob.page.keyboard.press("Escape");
  await waitText(rob.page, ".cm-lobby-seat[data-seat='1'] header", /Invite sent/);
  ok(true, "the seat now says the invitation is out");
  /* WITHDRAW: the invitation taken back; its link no longer works, and a new one is sent. */
  await rob.page.click(".cm-lobby-seat[data-seat='1'] [data-action=table-uninvite]");
  await rob.page.waitForFunction(() => !/Invite sent/.test(document.querySelector(".cm-lobby-seat[data-seat='1'] header")?.textContent || ""), null, {timeout: 10000});
  ok(await rob.page.locator(".cm-lobby-seat[data-seat='1'] [data-action=table-invite]").count() === 1, "Withdraw takes the invitation back, and the seat can be invited again");
  const withdrawn = link;
  await rob.page.click(".cm-lobby-seat[data-seat='1'] [data-action=table-invite]");
  await rob.page.locator("#cm-table-link").waitFor();
  link = await rob.page.inputValue("#cm-table-link");
  ok(link !== withdrawn && /\/api\/join\/table\d+\/[A-Za-z0-9_-]{40,}$/.test(link), "inviting again gives a new link");
  await rob.page.keyboard.press("Escape");
  await waitText(rob.page, ".cm-lobby-seat[data-seat='1'] header", /Invite sent/);

  /* JOIN: Maya opens the link on her phone. The withdrawn link, and a made-up code, first. */
  const id = /\/api\/join\/(table\d+)\//.exec(link)[1];
  await maya.page.goto(joinLocation(new URL(withdrawn.replace(/^https?:\/\/[^/]+/, base))));
  await maya.page.locator("#cm-table-refused").waitFor({timeout: 30000});
  ok(/no longer works/.test(await pageText(maya.page, "#cm-table-refused")), "the withdrawn link is refused: it no longer works");
  await maya.page.goto(`${base}/index.html#table/${id}/${"x".repeat(43)}`);
  await maya.page.locator("#cm-table-refused").waitFor({timeout: 30000});
  ok(/no longer works/.test(await pageText(maya.page, "#cm-table-refused")) && /Ask the host for a new link/.test(await pageText(maya.page, "#cm-table-refused")), "a made-up or spent link is refused, and says to ask the host for a new one");
  /* Where the link takes her: the Worker's own answer to it (joinLocation). Playwright does not route the request a
     redirect makes, so the suite goes where the Worker says; play-e2e follows the real redirect under wrangler dev. */
  await maya.page.goto(joinLocation(new URL(link.replace(/^https?:\/\/[^/]+/, base))));
  await maya.page.waitForFunction(() => /#table\?id=/.test(location.hash), null, {timeout: 30000});
  await maya.page.locator(".cm-cloud-table .cm-lobby-seat").first().waitFor({timeout: 30000});
  eq((await maya.page.locator(".cm-lobby-seat[data-seat='1'] h3").textContent()).trim(), "Seat 2 · You", "Maya lands on her seat, as herself");
  ok(!/\d+ cards/.test(await pageText(maya.page, ".cm-lobby-seat[data-seat='0']")), "she sees Rob's deck by name, never its cards");
  ok(await maya.page.getAttribute(".cm-lobby-seat[data-seat='0']", "data-mat") === "forge" && !(await maya.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-mat]").count()) && await maya.page.locator(".cm-lobby-seat[data-seat='1'] [data-action=table-mat]").count() === 1, "she sees Rob's mat, and chooses only her own");
  /* PLAY, BEFORE THE GAME, LEADS BACK TO HER SEAT (the readiness checks of 2026-10-04): she leaves for her library and
     comes back by Play. New table says her seat is waiting, and takes her to it. */
  await maya.page.goto(`${base}/index.html#table`);
  await maya.page.locator("#cm-table-back").waitFor({timeout: 30000});
  ok(/Your seat is waiting/.test(await pageText(maya.page, "#cm-table-back")) && /Rob's table, and its game has not started yet/.test(await pageText(maya.page, "#cm-table-back")) && await maya.page.locator("#cm-table-new").count() === 1,
    "Play, before the game, says her seat at Rob's table is waiting, above New table");
  await maya.page.click("#cm-table-back [data-action=table-back]");
  await maya.page.waitForFunction(() => /#table\?id=/.test(location.hash), null, {timeout: 30000});
  await maya.page.locator(".cm-cloud-table .cm-lobby-seat").first().waitFor({timeout: 30000});
  eq((await maya.page.locator(".cm-lobby-seat[data-seat='1'] h3").textContent()).trim(), "Seat 2 · You", "and Back to your table puts her in it again");
  const sideways = await maya.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  eq(sideways, 0, "at 390 the lobby does not scroll sideways");
  await maya.page.click(".cm-lobby-seat[data-seat='1'] [data-action=table-deck]");
  await maya.page.locator("[data-action=table-use-deck]").first().waitFor();
  eq([await maya.page.locator(".cm-table-rules-edit").count(), /Starting life\s*30/.test(await pageText(maya.page, ".cm-table-rules"))], [0, true], "a guest sees the host's rules, 30 life, and no Edit");
  for (let i = 0; i < 40; i += 1) {
    await maya.page.locator("[data-action=table-use-deck]").nth(i).click();
    await maya.page.waitForTimeout(300);
    if (!(await maya.page.locator("#cm-dialog[open]").count())) break;
  }
  /* Her seat has a deck now, so Change deck, Choose mat and Ready: each in reach in a window not maximized, and on her phone.
     A window 1024 wide is the one that cut Ready off; there the seats stack rather than lose a button. */
  for (const [width, height] of [[1024, 768], [1100, 700], [390, 844]]) {
    await maya.page.setViewportSize({width, height});
    await maya.page.waitForTimeout(400);
    const seen = await inReach(maya.page);
    ok(seen.controls.some((c) => c.label === "Ready") && allInReach(seen),
      `at ${width}x${height} every control of the lobby is in reach, Ready among them, none over a seat's label, and the table no wider than itself (${reachWords(seen)})`);
  }
  /* A seat clips 10px inside its quadrant. A longer reading -- here a spacer at its head, standing in for a deck's long
     name -- that brings her buttons into that band, inside the quadrant and cut off all the same, stacks the table. */
  await maya.page.setViewportSize({width: 1400, height: 900});
  await maya.page.waitForTimeout(400);
  const band = await maya.page.evaluate(() => {
    const q = document.querySelector(".cm-cloud-table .cm-seat-q.is-you"), detail = q.querySelector(".cm-seat-detail");
    const seat = q.querySelector(".cm-lobby-seat").getBoundingClientRect(), quad = q.getBoundingClientRect(), d = detail.getBoundingClientRect();
    const grows = getComputedStyle(detail).alignSelf === "flex-start" ? "down" : "up";
    const spacer = document.createElement("div");
    spacer.className = "cm-test-spacer";
    spacer.style.height = `${seat.bottom + 9 - d.bottom}px`;
    detail.prepend(spacer);
    /* The reading's own gap between its lines comes with the spacer: measured, and taken off, so it ends 9px in. */
    spacer.style.height = `${parseFloat(spacer.style.height) - (detail.getBoundingClientRect().bottom - (seat.bottom + 9))}px`;
    return {grows, room: Math.round(quad.bottom - seat.bottom), into: Math.round(detail.getBoundingClientRect().bottom - seat.bottom),
      stacked: document.querySelector(".cm-cloud-table").classList.contains("is-stacked")};
  });
  await maya.page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await maya.page.waitForTimeout(500);
  const inBand = await inReach(maya.page);
  ok(band.grows === "down" && band.room === 10 && band.into === 9 && !band.stacked && inBand.stacked && allInReach(inBand),
    `at 1400x900 her reading, grown 9px into the 10px band the seat clips inside its quadrant, stacks the table, every control in reach (her reading grows ${band.grows}, ${band.into}px into a ${band.room}px band; ${reachWords(inBand)})`);
  await maya.page.evaluate(() => {document.querySelector(".cm-test-spacer")?.remove(); window.dispatchEvent(new Event("resize"));});
  await maya.page.waitForTimeout(500);
  ok(!(await inReach(maya.page)).stacked, "and with her reading as it was, the 2x2 is back");
  await maya.page.setViewportSize({width: 390, height: 844});
  /* Where the 2x2 holds every seat it is kept, and no seat reaches under the rules panel: at 1240 wide the table is under
     1025px, so the panel's 246px floor is wider than its 24% share, and the seats keep clear of the floor. */
  for (const [width, height] of [[1240, 900], [1920, 1080]]) {
    await rob.page.setViewportSize({width, height});
    await rob.page.waitForTimeout(400);
    const seen = await inReach(rob.page);
    const under = await rob.page.evaluate(() => {
      const p = document.querySelector(".cm-cloud-table .cm-table-center").getBoundingClientRect();
      return [...document.querySelectorAll(".cm-cloud-table .cm-seat-figure")].filter((f) => {const r = f.getBoundingClientRect(); return r.left < p.right - 1 && p.left < r.right - 1 && r.top < p.bottom - 1 && p.top < r.bottom - 1;}).length;
    });
    ok(!seen.stacked && under === 0 && allInReach(seen),
      `at ${width}x${height} the host's table keeps its 2x2, no seat under the rules panel (${under}), every control in reach (${reachWords(seen)})`);
  }
  /* A seat clips 10px inside its quadrant: at 920x560 the host's Choose mat sat in that band, inside the quadrant and cut
     off all the same. */
  await rob.page.setViewportSize({width: 920, height: 560});
  await rob.page.waitForTimeout(400);
  const host920 = await inReach(rob.page);
  ok(allInReach(host920), `at 920x560 every control of the host's lobby is in reach too (${reachWords(host920)})`);
  await rob.page.setViewportSize({width: 1400, height: 900});
  await maya.page.locator(".cm-lobby-seat[data-seat='1'] [data-action=table-ready]").click();
  await waitText(maya.page, ".cm-lobby-seat[data-seat='1'] header", /Ready/);
  const narrow = await panelReading(maya.page);
  ok(narrow.worst >= 4.5 && narrow.inside && narrow.apart, `and at 390: contrast ${narrow.worst}, heading, rules and launch row inside the panel and apart (${narrow.inside}, ${narrow.apart})`);
  await shot(maya.page, "lobby-guest-390");

  /* THE LAUNCH LINE AND THE FANS (the brief, 2026-10-12): with Maya ready and Rob not, the panel says what it waits on
     and how many; a seat with a deck wears its commander's colors as a fan from its inner corner. */
  await waitText(rob.page, "#cm-table-launch", /Launches when all are ready · 1 seat to go\./);
  const fans = await rob.page.evaluate(() => [0, 1].map((i) => document.querySelectorAll(`.cm-seat-q:has(.cm-lobby-seat[data-seat='${i}']) .cm-seat-fan path`).length));
  ok(fans[0] >= 1 && fans[1] >= 1, `each seated deck's quadrant wears its commander's color fan (${fans.join(" and ")} wedges)`);
  /* START: Rob readies, starts; the countdown; Cancel; Start; the game is on. */
  await rob.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-ready]").click();
  await waitText(rob.page, ".cm-lobby-seat[data-seat='1'] header", /Ready/);
  await waitText(rob.page, "#cm-table-launch", /Everyone is ready/);
  await rob.page.click("[data-action=table-start]");
  await rob.page.locator("#cm-table-seconds").waitFor();
  const seconds = Number(await rob.page.innerText("#cm-table-seconds"));
  ok(seconds >= 1 && seconds <= 10, `Start shows the countdown's number (${seconds})`);
  await waitText(maya.page, "#cm-table-launch", /Starting in/);
  ok(!(await maya.page.locator("[data-action=table-cancel]").count()), "Maya sees the countdown; only the host has Cancel");
  await shot(rob.page, "countdown-1400");
  const seatsReady = await overSea(rob.page), readyLow = seatsReady.filter((w) => w.ratio < 4.5);
  ok(seatsReady.length >= 6 && !readyLow.length, `and with the decks chosen and the seats ready, still 4.5:1 or better over a white sea (${seatsReady.length} read; ${(readyLow.length ? readyLow : seatsReady.slice(0, 3)).map((w) => `"${w.text}" (${w.cls}) ${w.ratio}`).join(", ")})`);
  await rob.page.click("[data-action=table-cancel]");
  await waitText(rob.page, "#cm-table-launch", /Everyone is ready/);
  ok(true, "Cancel stops it");
  await rob.page.click("[data-action=table-start]");
  await rob.page.locator("#cm-table-seconds").waitFor();
  clock += 10000;
  await tableFor(id).alarm();
  await rob.page.locator("#cm-board").waitFor({timeout: 20000});
  await maya.page.locator("#cm-board").waitFor({timeout: 20000});
  ok(!(await rob.page.locator(".cm-cloud-table").count()), "when the countdown ends the lobby hands both pages to the board (tests/table-board.mjs plays it)");

  /* AFTER: the game ended (by End game on the board, played in table-board), the lobby says it is over. */
  await tableFor(id).fetch(new Request("https://table.internal/table/end", {method: "POST", headers: {"content-type": "application/json", "x-crankmagic-email": "maya@example.com"}, body: "{}"}));
  await waitText(maya.page, "#cm-table-game", /Play again\?|The game is over/);
  await waitText(rob.page, "#cm-table-game", /Play again\?|The game is over/);
  ok(/record is kept/.test(await pageText(rob.page, "#cm-table-game")), "once it is over, the lobby says so, and that its record is kept");
  eq(await maya.page.evaluate(() => localStorage.getItem("crankmagic-play-seat")), null, "and her device forgets the seat: Play no longer leads back to a game that is over");
  await shot(maya.page, "over-390");

  /* AN EMPTY LIBRARY (the readiness checks of 2026-10-04): a person new to CrankMagic, at a table before restoring any
     decks, is told how to bring one, and Restore opens from the dialog itself, so the seat stays theirs. */
  {
    useConfirmedCards = true;
    const nina = await person("nina@example.com", {width: 1400, height: 900}, {library: false});
    /* Where the AI door is open to her (GET /api/ai-seat, stood in for here), New table offers an AI on Claude too. */
    await nina.page.route("**/api/ai-seat", (r) => r.fulfill({json: {open: true}}));
    await nina.page.goto(`${base}/index.html#table`);
    const form = nina.page.locator("#cm-table-new");
    await form.waitFor({timeout: 30000});
    await form.locator("select[name=kind2] option[value=ai-llm]").waitFor({state: "attached", timeout: 10000});
    eq(await form.locator("select[name=kind2] option").allTextContents(), ["A person I will invite", "An AI · Normal", "An AI · Easy", "An AI · Claude", "Nobody"],
      "with the AI door open to her, New table offers an AI on Claude beside Normal and Easy (AI-2)");
    await form.locator("input[name=hostName]").fill("Nina");
    await form.locator("select[name=kind2]").selectOption("ai");
    await nina.page.click("[data-action=table-create]");
    await nina.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-deck]").click();
    await nina.page.locator("#cm-dialog .cm-table-deck-empty").waitFor({timeout: 15000});
    ok(/without adding anything/.test(await pageText(nina.page, "#cm-dialog .cm-table-deck-empty")), "a new player is directed to shared decks, without restoring anyone's library");
    await nina.page.waitForFunction(()=>document.querySelectorAll('[data-action=table-use-shared-deck]:enabled').length===6);
    eq(await nina.page.locator('[data-action=table-use-deck]').count(),0,"the tester starts with no personal decks");
    const sharedNames=await nina.page.locator('[data-action=table-use-shared-deck] strong').allTextContents();
    eq(sharedNames.length,6,"all six verified staging decks are available to a fresh signed-in player");
    if(SHOTS) {
      await nina.page.locator('[data-action=table-use-shared-deck]').evaluateAll(els=>els.forEach((el,i)=>{const tag=document.createElement('b');tag.textContent=`D${i+1}`;el.style.position='relative';tag.style.cssText='position:absolute;right:8px;top:8px;background:#ffdb6b;color:#151a19;padding:3px;font:11px monospace';el.prepend(tag);}));
      await shot(nina.page,'shared-decks-1400');
    }
    for(let i=0;i<6;i++) {
      if(i) {await nina.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-deck]").click();await nina.page.waitForFunction(()=>document.querySelectorAll('[data-action=table-use-shared-deck]:enabled').length===6);}
      await nina.page.locator('[data-action=table-use-shared-deck]').nth(i).click();
      await nina.page.waitForFunction(()=>!document.querySelector('#cm-dialog[open]'));
      await nina.page.waitForFunction(name=>document.querySelector(".cm-lobby-seat[data-seat='0']")?.textContent.includes(name),sharedNames[i]);
      ok((await pageText(nina.page,".cm-lobby-seat[data-seat='0']")).includes(sharedNames[i]),`the real table accepts ${sharedNames[i]} for the tester`);
      const payload=deckBodies.at(-1).deck;
      eq(payload.cards.length+payload.commander.length,100,'a shared deck submits the full hundred');
      const published=JSON.parse(readFileSync(path.join(ROOT,'tests/fixtures/shared-staging-decks.json'),'utf8')).decks.find(d=>d.name===sharedNames[i]);
      const expected={name:published.name,commander:published.commander,cards:published.cards};
      eq({name:payload.name,commander:payload.commander,cards:payload.cards},expected,'the selected list exactly matches the saved deck, with no stand-ins');
      ok(!('source' in payload),'a shared deck never attributes the guest result to the owner library');
    }
    useConfirmedCards = false;
    await nina.context.close();
  }

  /* YOUR DECKS AND THE TABLE (AI-5): each deck says whether the table can play it, on its tile and its page, before any
     table is opened; Play this deck opens a new table with the deck at your seat, or brings it to the table you already
     sit at; New from Wizards' Play it makes the precon a deck and goes on to a table. What each deck should say is read
     here from the library's own backup, against this suite's table, which plays every card but Sol Ring. */
  {
    const backup = JSON.parse(readFileSync(path.join(ROOT, "data", "live-state.json"), "utf8"));
    const listed = backup.payload.state.decks.filter((d) => !d.archived && (d.commanders || []).length);
    const named = decksFromBackup(backup, listed.map((d) => d.name));
    const refused = new Map(listed.map((d, i) => [d.id, [...named[i].commander, ...named[i].cards].filter((n) => n === REFUSED).length]));
    const playableIds = listed.filter((d) => refused.get(d.id) === 0).map((d) => d.id), learning = listed.find((d) => refused.get(d.id) > 0);
    ok(playableIds.length >= 2 && learning, `the library has decks the table plays whole (${playableIds.length}) and one it does not (${learning && learning.name})`);
    const olu = await person("olu@example.com", {width: 1400, height: 900});
    const asked = [];
    olu.page.on("request", (r) => {if (/\/api\/tables\/known$/.test(new URL(r.url()).pathname)) asked.push(r.method());});
    await olu.page.goto(`${base}/index.html#decks`);
    await olu.page.waitForFunction((n) => document.querySelectorAll("[data-play-for]:not([hidden])").length >= n, listed.length, {timeout: 30000});
    const tiles = await olu.page.$$eval("[data-play-for]:not([hidden])", (els) => els.map((el) => [el.dataset.playFor, el.textContent.trim(), el.classList.contains("is-playable")]));
    eq(tiles.map(([id, text, good]) => [id, text, good]).sort(),
      listed.map((d) => {const n = refused.get(d.id); return [d.id, n ? `${n} card${n === 1 ? "" : "s"} to learn for the table` : "Playable at the table", !n];}).sort(),
      "each deck's tile says whether the table can play it: Playable at the table, or how many of its cards are still to learn");
    /* The summary under Decks counts the same: playable means playable on Play (Rob, 2026-10-22), and it names no cost to
       finish them all. */
    await olu.page.waitForFunction(() => document.getElementById("cm-decks-playable")?.textContent, null, {timeout: 10000});
    const summary = (await olu.page.textContent(".cm-decks-summary")).replace(/\s+/g, " ").trim(), n = playableIds.length;
    const nWord = n <= 10 ? ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] : String(n);
    ok(summary.includes(`, ${nWord} playable.`) && !/\$|to finish/.test(summary), `the summary under Decks counts the decks the table plays whole, ${nWord}, and no cost to finish them all ("${summary}")`);
    eq(asked, ["POST"], "and the hub asked the table once, for every deck at once (POST /api/tables/known)");
    /* The Playable chip, beside Boxed Decks: the decks the table plays whole, the rest put away once it has answered. */
    eq(await olu.page.$$eval(".cm-decks-stages a", (as) => as.map((a) => a.textContent)).then((t) => t.filter((x) => /Playable|Boxed/.test(x))), ["Playable", "Boxed Decks"],
      "the hub offers Playable (in the app) and Boxed Decks (the box), side by side");
    await olu.page.locator(".cm-decks-stages a", {hasText: "Playable"}).click();
    await olu.page.waitForFunction((n) => document.querySelectorAll("[data-deck-tile]:not([hidden])").length === n && [...document.querySelectorAll("[data-deck-tile]")].some((t) => t.hidden), playableIds.length, {timeout: 15000});
    eq((await olu.page.$$eval("[data-deck-tile]:not([hidden])", (ts) => ts.map((t) => t.dataset.deckTile))).sort(), [...playableIds].sort(),
      `Playable shows exactly the ${playableIds.length} decks the table plays every card of`);
    await olu.page.goto(`${base}/index.html#decks`);
    await shot(olu.page, "decks-playable-1400");
    /* The deck page: the line, and Play this deck only where the table plays every card. */
    const deckLine = async (id) => {
      await olu.page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(id)}`);
      await olu.page.locator(`#cm-deck-play[data-deck="${id}"]:not([hidden])`).waitFor({timeout: 30000});
      return {text: (await olu.page.locator("#cm-deck-play").innerText()).replace(/\s+/g, " ").trim(), play: await olu.page.locator("#cm-deck-play [data-action=deck-play]").count()};
    };
    const whole = await deckLine(playableIds[0]);
    await shot(olu.page, "deck-playable-1400");
    const part = await deckLine(learning.id);
    await shot(olu.page, "deck-to-learn-1400");
    const total = (d) => {const i = listed.indexOf(d); return named[i].commander.length + named[i].cards.length;};
    const first = listed.find((d) => d.id === playableIds[0]);
    ok(whole.text.startsWith(`Playable at the table · all ${total(first)} cards known`) && whole.play === 1, `a deck the table plays whole says so on its page, with Play this deck (${whole.text})`);
    ok(part.text.startsWith(`${total(learning) - refused.get(learning.id)} of ${total(learning)} known · ${refused.get(learning.id)} to learn`) && /cannot play this one yet: Sol Ring\./.test(part.text) && part.play === 0,
      `one it does not says how much it knows and names what it cannot play yet, with no Play this deck (${part.text})`);
    /* Play this deck: a new table, the deck said above the seats, and at seat 1 once the table is made. */
    await olu.page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(first.id)}`);
    await olu.page.locator(`#cm-deck-play[data-deck="${first.id}"] [data-action=deck-play]`).click();
    await olu.page.locator("#cm-table-new-deck:not([hidden])").waitFor({timeout: 30000});
    eq(await olu.page.evaluate(() => location.hash), `#table?deck=${encodeURIComponent(first.id)}`, "Play this deck opens a new table, carrying the deck");
    eq((await olu.page.locator("#cm-table-new-deck").innerText()).trim(), `You bring ${first.name} to seat 1.`, "which says the deck comes with you to seat 1");
    await shot(olu.page, "table-bring-1400");
    await olu.page.fill("#cm-table-new [name=hostName]", "Olu");
    await olu.page.selectOption("#cm-table-new [name=kind2]", "ai");
    const before = deckBodies.length;
    await olu.page.click("[data-action=table-create]");
    await olu.page.waitForFunction(() => /#table\?id=table\d+/.test(location.hash), null, {timeout: 20000});
    await waitText(olu.page, ".cm-lobby-seat[data-seat='0'] .cm-seat-line", new RegExp(first.name));
    const sent = deckBodies.slice(before);
    eq(sent.map((b) => [b.seatId, b.deck.name, b.deck.source.deckId]), [[0, first.name, first.id]], "made, the table seats the deck at your seat, as the library's own deck");
    const oluTable = (await olu.page.evaluate(() => location.hash)).match(/id=(table\d+)/)[1];
    /* Seated before its game, Play this deck from another deck offers to bring it to that table. */
    const second = listed.find((d) => d.id === playableIds[1]);
    await olu.page.goto(`${base}/index.html#decks?deck=${encodeURIComponent(second.id)}`);
    await olu.page.locator(`#cm-deck-play[data-deck="${second.id}"] [data-action=deck-play]`).click();
    await olu.page.locator("#cm-table-back [data-action=table-bring]").waitFor({timeout: 30000});
    eq((await olu.page.locator("#cm-table-back [data-action=table-bring]").innerText()).trim(), `Bring ${second.name} there`, "seated at a table whose game has not begun, Play this deck offers to bring the deck there");
    await shot(olu.page, "table-bring-there-1400");
    await olu.page.click("#cm-table-back [data-action=table-bring]");
    await olu.page.waitForFunction((t) => location.hash === `#table?id=${t}`, oluTable, {timeout: 20000});
    await waitText(olu.page, ".cm-lobby-seat[data-seat='0'] .cm-seat-line", new RegExp(second.name));
    ok(true, "and brought, it is the deck at your seat there");
    /* A deck the table cannot play whole is not brought: the new table says which cards, and you choose another there. */
    await olu.page.goto(`${base}/index.html#table?deck=${encodeURIComponent(learning.id)}`);
    await olu.page.locator("#cm-table-new-deck:not([hidden])").waitFor({timeout: 30000});
    const warn = (await olu.page.locator("#cm-table-new-deck").innerText()).trim();
    ok(warn.startsWith(`${learning.name} cannot be played at the table yet`) && /\(Sol Ring\)/.test(warn) && !(await olu.page.locator("#cm-table-new [name=deck]").count()),
      `a deck it cannot play whole is named with its cards, and not brought (${warn})`);
    /* New from Wizards' Play it: the precon comes in through the import, becomes a deck, and goes on to a new table. */
    await olu.page.goto(`${base}/index.html#decks`);
    const chip = olu.page.locator("#cm-precon-latest:not([hidden]) li").first();
    await chip.locator("[data-action=precon-play]").waitFor({timeout: 30000});
    const preconName = (await chip.locator(".cm-precon-chip strong").innerText()).trim();
    await chip.locator("[data-action=precon-play]").click();
    await olu.page.getByRole("heading", {name: "Import cards or a deck list", exact: true}).waitFor({timeout: 30000});
    await olu.page.getByRole("button", {name: "Parse input", exact: true}).click();
    await olu.page.getByRole("heading", {name: "Review import", exact: true}).waitFor({timeout: 60000});
    await olu.page.getByRole("button", {name: /^Import \d+ reviewed rows?$/}).click();
    await olu.page.getByRole("heading", {name: `New deck from ${preconName}`, exact: true}).waitFor({timeout: 60000});
    await olu.page.getByRole("button", {name: "Create draft", exact: true}).click();
    await olu.page.waitForFunction(() => /^#table\?deck=/.test(location.hash), null, {timeout: 30000});
    await olu.page.locator("#cm-table-new-deck:not([hidden])").waitFor({timeout: 30000});
    const made = await olu.page.evaluate(async () => {const r = await CrankRepository.open(); try {const st = await r.getState(); const id = decodeURIComponent(location.hash.split("deck=")[1]); const d = st.decks.find((x) => x.id === id); return d ? {name: d.name, precon: d.precon || null} : null;} finally {r.close();}});
    ok(made && made.precon && made.precon.name === preconName && !("play" in made.precon), `Play it makes the precon a deck of the library, marked as the precon (and nothing more), and goes on to a new table with it (${made && made.name})`);
    const said = (await olu.page.locator("#cm-table-new-deck").innerText()).trim();
    ok(said === `You bring ${made.name} to seat 1.` || said.startsWith(`${made.name} cannot be played at the table yet`),
      `where the new table says whether the deck comes with you, as Play this deck's does (${said})`);
    await olu.context.close();
  }

  /* NOT SIGNED IN: someone opening a table's link without an account is told it is invite-only, and where to go if
     their address is not on the list; that page says what to do, even on a phone. */
  {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: "block"});
    const page = await context.newPage();
    if (stub) await stub(page);
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html(true)}));
    await page.route(`${base}/api/**`, (r) => r.fulfill({status: 401, json: {error: "Sign in."}}));
    await page.goto("about:blank");
    await page.goto(`${base}/index.html#table/${id}/${"y".repeat(43)}`);
    await page.locator("#cm-table-invite-only").waitFor({timeout: 30000});
    ok(/invite-only/.test(await pageText(page, "#cm-table-refused")) && await page.locator("#cm-table-refused [data-action=account-sign-in]").count() === 1 && await page.getAttribute("#cm-table-invite-only a", "href") === "not-invited.html",
      "signed out, a table's link says Sign in, that it is invite-only, and where to go if you are not on the list");
    await page.goto(`${base}/not-invited.html`);
    const refusal = await page.evaluate(() => [document.querySelector("h1").innerText, document.body.innerText.includes("ask Rob to add"), document.documentElement.scrollWidth - document.documentElement.clientWidth]);
    ok(/not on the invite list/.test(refusal[0]) && refusal[1] && refusal[2] === 0, "and the page it points to says what to do, on a phone without sideways scroll");
    await shot(page, "not-invited-390");
    await context.close();
  }

  /* LEFT MID-READ: the lobby reads its table every two seconds. Rob leaves for a new table while a read is in
     flight; when it lands, it draws nothing -- the page he went to stays. */
  {
    let release; held["rob@example.com"] = {waiting: 0, promise: new Promise((r) => {release = r;})};
    for (let i = 0; i < 40 && !held["rob@example.com"].waiting; i += 1) await new Promise((r) => setTimeout(r, 250));
    ok(held["rob@example.com"].waiting > 0, "a read of his table is in flight");
    await rob.page.goto(`${base}/index.html#table`);
    await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
    delete held["rob@example.com"]; release();
    await new Promise((r) => setTimeout(r, 1500));
    ok(await rob.page.locator("#cm-table-new").count() === 1 && !(await rob.page.locator(".cm-cloud-table").count()), "when it lands after he left, the new-table page stays: the old table is not drawn over it");
  }

  /* The mat is remembered on the device: at Rob's next table his seat is on the forge without his asking. */
  await rob.page.goto(`${base}/index.html#table`);
  await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
  await rob.page.fill("#cm-table-new [name=hostName]", "Rob");
  await rob.page.click("[data-action=table-create]");
  await rob.page.waitForFunction(() => document.querySelector(".cm-lobby-seat[data-seat='0']")?.dataset.mat === "forge", null, {timeout: 15000});
  ok(true, "at his next table, Rob's seat is on the mat he chose last, without his asking");

  eq(writes.filter((w) => w.header !== "play" || !/^application\/json/.test(w.type || "")), [], `every one of the ${writes.length} writes carried Play's header and JSON`);
  await rob.context.close(); await maya.context.close();
} finally {
  await close();
}
console.log(`table-lobby: ${checks} checks passed — the cloud table's lobby in two browsers: host, invite by link and QR, join on a phone, decks from your own library, the countdown and Cancel, the board taking over, and the game over.`);
