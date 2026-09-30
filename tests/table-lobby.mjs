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
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";
import {basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {MATS} from "../game/room/table.mjs";
import {build, worktreeSource} from "../tools/release-pages.mjs";

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

/* THE SERVER, HERE: one GameTable object per table. Every card is playable except one, so a refusal by name
   can be seen; the engine's own cards stand in for the rest (a vanilla creature). */
const REFUSED = "Sol Ring";
const cards = (name) => basicCards(name) ?? (name === REFUSED ? null : {types: ["Creature"], power: 2, toughness: 2, manaCost: "{2}"});
let clock = Date.parse("2026-09-26T22:00:00Z");
const objects = new Map(), writes = [], deckBodies = [];
let nextId = 0;
const objectCtx = () => {
  const map = new Map(), sockets = [];
  return {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
};
const tableFor = (id) => {if (!objects.has(id)) objects.set(id, new GameTable(objectCtx(), {}, {cards, now: () => clock})); return objects.get(id);};
/* A person's table reads can be held in flight, to prove an answer that lands after they left the page draws nothing. */
const held = {};
async function answer(route, email) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  if (method === "GET" && held[email]) {held[email].waiting += 1; await held[email].promise;}
  if (method !== "GET") {
    writes.push({path: url.pathname, header: req.headers()["x-crankmagic"], type: req.headers()["content-type"]});
    if (req.headers()["x-crankmagic"] !== "play") return route.fulfill({status: 403, json: {error: "That request did not come from CrankMagic."}});
  }
  const m = /^\/api\/tables(?:\/([a-z0-9]+)(?:\/([a-z]+))?)?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const [, given, action] = m;
  const body = method === "GET" ? undefined : req.postData() || "{}";
  if (action === "deck") deckBodies.push(JSON.parse(body));
  let id = given, internal = action ? `/table/${action}` : "/table";
  let payload = body;
  if (!given) {id = `table${String(++nextId).padStart(6, "0")}`; internal = "/table/create"; payload = JSON.stringify({...JSON.parse(body), tableId: id});}
  const r = await tableFor(id).fetch(new Request(`https://table.internal${internal}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(payload !== undefined ? {body: payload} : {})}));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}

/* Marked for Play in the cloud, the page is the one staging ships: built by tools/release-pages.mjs from this tree,
   with the local game host's modules left out (Rob, 2026-09-29: the lobby borrowed its seats from one of them, and
   opened on "reading 'statusPill'" on staging while every suite, loading the whole development page, passed). */
const STAGING_PAGE = build({source: worktreeSource(), profileName: "cloud-staging"}).built.get("index.html").toString("utf8");
const html = (play) => play ? STAGING_PAGE : readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", `<meta name="crankmagic-accounts" content="on"></head>`);
const {browser, base, stub, close} = await openBrowser({name: "table-lobby", flag: "GEOMETRY_REQUIRED"});
async function person(email, viewport, {play = true} = {}) {
  const context = await browser.newContext({viewport, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);   /* a real library to bring decks from, restored before the account is on */
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html(play)}));
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
  await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
  ok(!/Coming Soon/.test(await pageText(rob.page, "#cm-main")), "with the cloud-Play mark, the Play tab opens a new table");

  /* HOST: a new table. */
  await rob.page.goto(`${base}/index.html#table`);
  await rob.page.locator("#cm-table-new").waitFor({timeout: 30000});
  await rob.page.fill("#cm-table-new [name=hostName]", "Rob");
  await rob.page.fill("#cm-table-new [name=name2]", "Maya");
  await rob.page.selectOption("#cm-table-new [name=kind3]", "ai");
  await rob.page.fill("#cm-table-new [name=name3]", "Shadrix");
  await rob.page.click("[data-action=table-create]");
  await rob.page.waitForFunction(() => /#table\?id=table\d+/.test(location.hash), null, {timeout: 20000});
  await rob.page.locator(".cm-cloud-table .cm-lobby-seat").first().waitFor({state: "attached"});
  eq(await rob.page.locator(".cm-cloud-table .cm-lobby-seat h3").allTextContents(), ["Seat 1 · You", "Seat 2 · Maya", "Seat 3 · AI"], "the lobby: you in seat 1, Maya to invite, an AI; seat 4 left out");
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
  await rob.page.click(".cm-table-rules-edit");
  await rob.page.locator("#cm-table-rules-form").waitFor();
  await rob.page.fill("#cm-table-rules-form [name=startingLife]", "30");
  await rob.page.selectOption("#cm-table-rules-form [name=bracketLimit]", "2");
  await rob.page.click("[data-action=table-rules-save]");
  await waitText(rob.page, ".cm-table-rules", /Starting life\s*30/);
  ok(/Bracket limit\s*2 or lower/.test(await pageText(rob.page, ".cm-table-rules")), "Save puts 30 life and a bracket limit of 2 on the table's rules");
  await rob.page.click(".cm-lobby-seat[data-seat='0'] [data-action=table-deck]");
  await rob.page.locator(".cm-table-deck").first().waitFor();
  await rob.page.locator(".cm-table-deck").first().click();
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
  await rob.page.locator(".cm-table-deck").first().waitFor();
  const deckCount = await rob.page.locator(".cm-table-deck").count();
  ok(deckCount >= 5, `Choose a deck lists the decks in your own library (${deckCount})`);
  eq(await rob.page.locator("[data-action=table-use-test-deck]").count(), 0, "this table is not a playtest table, so the basic lands test deck is not offered (staging's are: tests/uat/play-e2e.mjs)");
  /* Find a deck with the refused card by trying them in turn until one is refused, then one that is not. */
  let refusedSeen = false, chosen = null;
  for (let i = 0; i < deckCount && (!refusedSeen || !chosen); i += 1) {
    if (!(await rob.page.locator("#cm-dialog[open]").count())) {await rob.page.click(".cm-lobby-seat[data-seat='0'] [data-action=table-deck]"); await rob.page.locator(".cm-table-deck").first().waitFor();}
    const name = (await rob.page.locator(".cm-table-deck strong").nth(i).innerText()).trim();
    await rob.page.locator(".cm-table-deck").nth(i).click();
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
  await rob.page.locator(".cm-table-deck").first().waitFor();
  for (let i = 0; i < deckCount; i += 1) {
    await rob.page.locator(".cm-table-deck").nth(i).click();
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
  const link = await rob.page.inputValue("#cm-table-link");
  ok(/#table\/table\d+\/[A-Za-z0-9_-]{40,}$/.test(link), `the invite dialog gives the seat's link: ${link.replace(/\/[^/]+$/, "/…")}`);
  ok(await rob.page.locator("#cm-dialog .cm-qr-code svg").count() === 1, "a QR of it, to scan across the room");
  ok((await rob.page.getAttribute("#cm-table-mail", "href")).includes(encodeURIComponent(link)), "and an email that carries it");
  await shot(rob.page, "invite-1400");
  await rob.page.keyboard.press("Escape");
  await waitText(rob.page, ".cm-lobby-seat[data-seat='1'] header", /Invite sent/);
  ok(true, "the seat now says the invitation is out");

  /* JOIN: Maya opens the link on her phone. A made-up code first. */
  const id = /#table\/(table\d+)\//.exec(link)[1];
  await maya.page.goto(`${base}/index.html#table/${id}/${"x".repeat(43)}`);
  await maya.page.locator("#cm-table-refused").waitFor({timeout: 30000});
  ok(/no longer works/.test(await pageText(maya.page, "#cm-table-refused")) && /Ask the host for a new link/.test(await pageText(maya.page, "#cm-table-refused")), "a made-up or spent link is refused, and says to ask the host for a new one");
  await maya.page.goto(link.replace(/^https?:\/\/[^/]+/, base).replace("/index.html", "/index.html"));
  await maya.page.waitForFunction(() => /#table\?id=/.test(location.hash), null, {timeout: 30000});
  await maya.page.locator(".cm-cloud-table .cm-lobby-seat").first().waitFor({timeout: 30000});
  eq((await maya.page.locator(".cm-lobby-seat[data-seat='1'] h3").textContent()).trim(), "Seat 2 · You", "Maya lands on her seat, as herself");
  ok(!/\d+ cards/.test(await pageText(maya.page, ".cm-lobby-seat[data-seat='0']")), "she sees Rob's deck by name, never its cards");
  ok(await maya.page.getAttribute(".cm-lobby-seat[data-seat='0']", "data-mat") === "forge" && !(await maya.page.locator(".cm-lobby-seat[data-seat='0'] [data-action=table-mat]").count()) && await maya.page.locator(".cm-lobby-seat[data-seat='1'] [data-action=table-mat]").count() === 1, "she sees Rob's mat, and chooses only her own");
  const sideways = await maya.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  eq(sideways, 0, "at 390 the lobby does not scroll sideways");
  await maya.page.click(".cm-lobby-seat[data-seat='1'] [data-action=table-deck]");
  await maya.page.locator(".cm-table-deck").first().waitFor();
  eq([await maya.page.locator(".cm-table-rules-edit").count(), /Starting life\s*30/.test(await pageText(maya.page, ".cm-table-rules"))], [0, true], "a guest sees the host's rules, 30 life, and no Edit");
  for (let i = 0; i < 40; i += 1) {
    await maya.page.locator(".cm-table-deck").nth(i).click();
    await maya.page.waitForTimeout(300);
    if (!(await maya.page.locator("#cm-dialog[open]").count())) break;
  }
  await maya.page.locator(".cm-lobby-seat[data-seat='1'] [data-action=table-ready]").click();
  await waitText(maya.page, ".cm-lobby-seat[data-seat='1'] header", /Ready/);
  const narrow = await panelReading(maya.page);
  ok(narrow.worst >= 4.5 && narrow.inside && narrow.apart, `and at 390: contrast ${narrow.worst}, heading, rules and launch row inside the panel and apart (${narrow.inside}, ${narrow.apart})`);
  await shot(maya.page, "lobby-guest-390");

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
  await waitText(maya.page, "#cm-table-game", /The game is over/);
  await waitText(rob.page, "#cm-table-game", /The game is over/);
  ok(/record is kept/.test(await pageText(rob.page, "#cm-table-game")), "once it is over, the lobby says so, and that its record is kept");
  await shot(maya.page, "over-390");

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
