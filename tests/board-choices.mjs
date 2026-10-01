/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A CARD USED MORE THAN ONE WAY ASKS WHICH (game/room/room.mjs offerDetails; crankmagic-board.js).
 *
 * Rob, 2026-10-01: a choice is a pop-up where the player selects. The engine offers a spell once per way to aim it, an
 * ability once per permanent that could pay its sacrifice, a mana ability once per color (rules/actions.mjs). The room
 * labeled every one of them with the card's name alone, so the board drew a spell with five legal targets as five
 * buttons reading the same -- "Cast Zap ×5" -- and a press aimed it at the first. Now:
 *
 *   Details   each option says which way it is: "→ Maya", "→ Rob (you)", "→ Maya Bear (Maya's)", "sacrificing Bear",
 *             "{W}"; two that would read the same are told apart by power and toughness and whether they are tapped,
 *             then numbered; no two of one card's options read alike; nothing the seat may not see is named.
 *   Room      a real table, Rob against an AI seat: the priority question's cast options carry their details, distinct.
 *   Board     "You can also ▾" lists the spell once, with how many ways; pressing it, or the card in the hand, opens a
 *             pop-up listing every way by its target; "→ Maya" casts it at Maya, and the stack says so. The card's own
 *             label names what it can do once, not once per target.
 *
 * The board half needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {offerDetails, basicCards} from "../game/room/room.mjs";
import {GameTable} from "../cloud/game-room.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const SHOTS = process.env.UAT_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, {recursive: true});

const ANY_TARGET = [{anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]}];
const ZAP = {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s0", text: "Zap deals 1 damage to any target.", targets: ANY_TARGET,
  effects: [{effect: "dealDamage", amount: 1, targets: {target: 0}, who: {target: 0}}]}};
const land = (color) => ({types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {[color]: 1}}]});

/* ---- 1. the details, on an engine state ---- */
{
  const s = createState({matchId: "m", seed: "choices", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 10; i += 1) addObject(s, {card: "Wastes", ...land("C"), owner: seat, controller: seat}, "library", seat);
  const on = (o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, zone === "battlefield" ? null : seat);
  on({card: "Zap", ...ZAP}, 0, "hand");
  on({card: "Island", ...land("U")}, 0, "hand");
  on({card: "Mountain", ...land("R")}, 0);
  on({card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 0);
  on({card: "Seer", types: ["Creature"], power: 1, toughness: 1, abilities: [{id: "a1", kind: "activated", text: "Sacrifice a creature: You gain 1 life.",
    cost: [{atom: "sacrifice", selector: {types: ["Creature"]}}], effects: [{effect: "gainLife", amount: 1}]}]}, 0);
  on({card: "Azorius Gate", types: ["Land"], abilities: [{id: "a2", kind: "mana", tapSelf: true, produces: [{W: 1}, {U: 1}]}]}, 0);
  on({card: "Llanowar Elves", types: ["Creature"], power: 1, toughness: 1}, 1);
  on({card: "Goblin", types: ["Creature"], power: 1, toughness: 1, token: true}, 1);
  on({card: "Goblin", types: ["Creature"], power: 1, toughness: 1, token: true}, 1);
  beginGame(s);
  for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s);
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === "Mountain"));
  const actions = legalActions(s, 0), details = offerDetails(s, 0, actions);
  const of = (kind, label) => actions.map((a, i) => [a, details[i]]).filter(([a]) => a.kind === kind && a.label === label).map(([, d]) => d);
  const zap = of("cast", "Zap");
  ok(zap.length === 7, `Zap is offered once per legal target: the two players and five creatures (${zap.length})`);
  ok(zap.includes("→ Maya") && zap.includes("→ Rob (you)"), `each says what it is aimed at, the players by name, yours said so: ${zap.filter((d) => !/Goblin|Elves|Bear|Seer/.test(d)).join("; ")}`);
  ok(zap.includes("→ Llanowar Elves (Maya's)") && zap.includes("→ Bear"), "another player's permanent says whose; your own goes unsaid");
  eq(zap.filter((d) => d.startsWith("→ Goblin")).sort(), ["→ Goblin (Maya's) 1/1 · 1", "→ Goblin (Maya's) 1/1 · 2"], "two of Maya's Goblins alike in every way: power and toughness said, then numbered");
  eq(new Set(zap).size, zap.length, "so no two of Zap's offers read alike");
  /* A cost chosen as it is paid -- an ability's sacrifice, a spell's discard -- in the shape the engine offers it
     (rules/actions.mjs costChoice, M4 phase 3's batches 6 and 7). */
  const id = (name, zone = "battlefield") => Object.keys(s.objects).map(Number).find((k) => s.objects[k].card === name && s.objects[k].zone === zone);
  const offered = [{kind: "activate", objectId: id("Seer"), abilityId: "a1", label: "Seer", costChoice: {sacrifice: id("Bear")}},
    {kind: "activate", objectId: id("Seer"), abilityId: "a1", label: "Seer", costChoice: {sacrifice: id("Seer")}},
    {kind: "cast", objectId: id("Zap", "hand"), label: "Zap", targets: [{kind: "player", id: 1}], costChoice: {discard: id("Island", "hand")}}];
  eq(offerDetails(s, 0, offered), ["sacrificing Bear", "sacrificing Seer", "→ Maya · discarding Island"], "a cost chosen as it is paid says what pays it: the sacrifice, the source itself among them, and a discard from your own hand");
  eq(of("activate-mana", "Azorius Gate").sort(), ["{U}", "{W}"], "a land that adds either says which");
  eq(of("activate-mana", "Mountain"), [], "and nothing is said where there is only one way");
  eq(details[actions.findIndex((a) => a.kind === "pass")], "", "passing has nothing to tell apart");
  /* One Goblin tapped: now its shape and state tell them apart without numbers. */
  const goblins = s.zones.battlefield.filter((id) => s.objects[id].card === "Goblin");
  s.objects[goblins[0]].tapped = true;
  const again = offerDetails(s, 0, legalActions(s, 0)).filter((d) => d.startsWith("→ Goblin")).sort();
  eq(again, ["→ Goblin (Maya's) 1/1", "→ Goblin (Maya's) 1/1, tapped"], "one Goblin tapped: said so, and no numbers needed");
}

console.log(`board-choices: ${checks} checks of the room's details passed; the board's next.`);

/* ---- 2. a real table: Rob, with Zap in hand, against an AI seat ---- */
const DEFS = new Map([["Zap", ZAP], ["Rob General", {types: ["Creature"], supertypes: ["Legendary"], power: 2, toughness: 2, manaCost: "{3}{R}"}],
  ["Maya General", {types: ["Creature"], supertypes: ["Legendary"], power: 2, toughness: 2, manaCost: "{3}{G}"}],
  ["Maya Bear", {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}]]);
const cards = (name) => basicCards(name) ?? DEFS.get(name) ?? null;
const ROB = "rob@example.com";
let clock = Date.parse("2026-10-01T18:00:00Z");
const map = new Map(), sockets = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
const object = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "boardchoices01";
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const call = (p, body) => serial(async () => (await object.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json());
let latest = null;
const frames = [];
async function socket(onFrame) {
  const server = {tags: null, closed: false, send(f) {if (!this.closed) onFrame(f);}, close() {this.closed = true;}};
  await serial(async () => {
    object.socketPair = () => [{}, server];
    object.upgraded = () => ({status: 101});
    await object.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));
  });
  return server;
}
const deck = (who, basic, spell) => ({name: `${who}'s deck`, commander: [`${who} General`], cards: [...Array(40)].map((_, i) => (i % 2 ? basic : spell))});
await call("/table/create", {tableId: TABLE, hostName: "Rob", seats: [{kind: "ai", name: "Maya"}]});
await call("/table/deck", {seatId: 0, deck: deck("Rob", "Mountain", "Zap")});
await call("/table/deck", {seatId: 1, deck: deck("Maya", "Forest", "Maya Bear")});
await call("/table/ready", {ready: true});
await call("/table/start", {});
clock += 10000; await serial(() => object.alarm());
const node = await socket((f) => {frames.push(f); const x = JSON.parse(f); if (x.view) latest = x.view;});
const send = (v, payload) => serial(() => object.webSocketMessage(node, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, ...payload})));

/* Rob keeps, plays a Mountain a turn and passes, until his own main phase with Zap in hand, a Mountain untapped and a
   creature of Maya's to aim at; then he taps the Mountain, and the next question offers Zap. */
const ready = (v) => v.state.turnPlayerId === v.seat && v.state.phase === "MAIN1" && v.decision?.kind === "priority" && v.state.players[v.seat].landsPlayed
  && v.state.players[v.seat].zones.Hand.cards.some((c) => c.name === "Zap") && v.state.players[1].zones.Battlefield.cards.some((c) => c.name === "Maya Bear")
  && v.state.players[v.seat].zones.Battlefield.cards.some((c) => c.name === "Mountain" && !c.tapped);
for (let i = 0; i < 3000 && latest && latest.status !== "finished" && !ready(latest); i += 1) {
  const v = latest, d = v.decision;
  if (!d) {await serial(async () => object.broadcast()); if (latest === v) break; continue;}
  let indices;
  if (d.kind === "priority") {
    const me = v.state.players[v.seat], landOpt = !me.landsPlayed && d.options.find((o) => o.act === "play-land");
    indices = [(landOpt || d.options.find((o) => o.act === "pass")).index];
  } else if (d.mode === "many") indices = d.options.slice(0, d.min).map((o) => o.index);
  else if (d.mode === "order") indices = d.options.map((o) => o.index);
  else if (d.mode === "ack") indices = [];
  else indices = [(d.options.find((o) => /^Keep|^No\b|^Don't|^Draw/i.test(o.label)) || d.options[0]).index];
  await send(v, d.mode === "damage" || d.mode === "amount" ? {amounts: d.options.map((_, k) => (k === 0 ? d.total : 0))} : {indices});
}
ok(latest && ready(latest), `the table reaches Rob's main phase with Zap in hand and a Bear of Maya's on the battlefield (turn ${latest?.state.turn})`);
await send(latest, {indices: [latest.decision.options.find((o) => o.act === "activate-mana" && o.label === "Mountain").index]});
/* Each copy of Zap in the hand is offered once per target; one copy's offers are what its pop-up lists. */
const allZaps = latest.decision.options.filter((o) => o.act === "cast" && o.label === "Zap");
const castOptions = allZaps.filter((o) => o.cardId === allZaps[0].cardId);
const bears = latest.state.players[1].zones.Battlefield.cards.filter((c) => c.name === "Maya Bear").length;
const targetCount = 2 + latest.state.players.reduce((n, p) => n + p.zones.Battlefield.cards.filter((c) => (c.types ?? []).includes("Creature")).length, 0);
ok(castOptions.length === targetCount && allZaps.every((o) => o.detail), `the room's question offers each Zap once per target, each with its detail (${castOptions.map((o) => o.detail).join("; ")})`);
eq(new Set(castOptions.map((o) => o.detail)).size, castOptions.length, `no two of one card's reading alike${bears > 1 ? `, though Maya's ${bears} Bears share a name` : ""}`);
ok(castOptions.some((o) => o.detail === "→ Maya") && castOptions.some((o) => o.detail === "→ Rob (you)"), "the players among them, by name");

/* ---- 3. the board: the pop-up ---- */
const {openBrowser} = await import("./uat/browser-runner.mjs");
const {browser, base, stub, close} = await openBrowser({name: "board-choices", flag: "GEOMETRY_REQUIRED"});
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
async function answer(route) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => object.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
function carry(ws) {
  const server = {tags: null, closed: false, send(f) {if (!this.closed) {frames.push(f); const x = JSON.parse(f); if (x.view) latest = x.view; ws.send(f);}}, close() {this.closed = true;}};
  serial(async () => {
    object.socketPair = () => [{}, server];
    object.upgraded = () => ({status: 101});
    await object.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));
  });
  ws.onMessage((message) => serial(() => object.webSocketMessage(server, message)));
  ws.onClose(() => {server.closed = true;});
}
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: ROB}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, answer);
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry);
  await page.goto("about:blank");
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator("#cm-board .cm-board-strip").waitFor({timeout: 60000});
  await page.locator("[data-action=board-also]").waitFor({timeout: 20000});

  const zapCard = page.locator(".cm-board-hand .cm-bcard[aria-label^='Zap']").first();
  const label = await zapCard.getAttribute("aria-label");
  ok(/^Zap: Cast Zap, \d+ ways$/.test(label), `the card in the hand says what it can do once, and how many ways: "${label}"`);

  await page.click("[data-action=board-also]");
  const choose = page.locator(".cm-board-also [data-action=board-choose]", {hasText: "Cast Zap"});
  ok(await choose.count() === 1, "You can also ▾ lists Zap once");
  ok(new RegExp(`Cast Zap · ${castOptions.length} ways`).test((await choose.innerText()).replace(/\s+/g, " ")), `saying how many ways (${(await choose.innerText()).replace(/\s+/g, " ").trim()})`);
  await choose.click();
  const dialog = page.locator("#cm-dialog[open]");
  await dialog.waitFor({timeout: 5000});
  const ways = await dialog.locator(".cm-board-choices [data-action=board-zoom-do]").allInnerTexts();
  eq(ways.length, castOptions.length, "pressing it opens a pop-up with every way");
  ok(ways.includes("Cast Zap → Maya") && ways.includes("Cast Zap → Rob (you)") && ways.some((w) => /^Cast Zap → Maya Bear \(Maya's\)/.test(w)), `each by what it is aimed at: ${ways.join("; ")}`);
  ok(await page.locator(".cm-board-also").count() === 0, "and the menu it came from is put away");
  if (SHOTS) await page.screenshot({path: path.join(SHOTS, "board-choices-1400.png")});
  await dialog.locator("[data-action=close]").first().click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"));

  /* The card itself, pressed in the hand: the same pop-up -- here at 1280 by 720, the smallest desk size, where the card
     is drawn smaller while choosing so that every way and Close are on screen without scrolling. */
  await page.setViewportSize({width: 1280, height: 720});
  await page.waitForTimeout(400);
  await zapCard.click();
  await dialog.waitFor({timeout: 5000});
  const fit = await page.evaluate(() => {
    const d = document.querySelector("#cm-dialog[open]"), r = (el) => el.getBoundingClientRect();
    const all = [...d.querySelectorAll(".cm-board-choices [data-action=board-zoom-do]"), d.querySelector(".cm-form-footer [data-action=close]")];
    return {inside: all.every((el) => r(el).bottom <= innerHeight && r(el).top >= 0), scrolls: d.scrollHeight > d.clientHeight + 1, card: Math.round(r(d.querySelector(".cm-board-zoom .cm-bcard")).height)};
  });
  ok(fit.inside && !fit.scrolls, `at 1280 by 720 every way and Close are on screen, the pop-up unscrolled (card ${fit.card}px tall)`);
  if (SHOTS) await page.screenshot({path: path.join(SHOTS, "board-choices-1280x720.png")});
  eq((await dialog.locator(".cm-board-choices [data-action=board-zoom-do]").allInnerTexts()).sort(), [...ways].sort(), "pressing Zap in the hand opens the same pop-up, rather than casting it at the first target");
  await dialog.locator(".cm-board-choices [data-action=board-zoom-do]", {hasText: /^Cast Zap → Maya$/}).click();
  await page.waitForFunction(() => !document.querySelector("#cm-dialog[open]"));
  for (let t = 0; t < 100 && !(latest.state.stack ?? []).length; t += 1) await new Promise((r) => setTimeout(r, 100));
  const top = (latest.state.stack ?? []).at(-1);
  ok(top && top.name === "Zap" && top.targets?.[0]?.kind === "player" && top.targets[0].id === 1, `choosing "→ Maya" casts Zap at Maya: the stack holds ${top ? `${top.name} aimed at ${JSON.stringify(top.targets)}` : "nothing"}`);
  await context.close();
} finally {
  await close();
}

console.log(`board-choices: ${checks} checks passed — a card used more than one way says each way (its target, its sacrifice, its color), and the board asks which in a pop-up rather than doing the first.`);
process.exit(0);
