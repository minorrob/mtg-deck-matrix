/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE MANA POOL MODULE, AND YOUR TARGETED CARDS IN RED (Rob, Oct 26, 2026; crankmagic-board.js, crankmagic-stage.css).

     1. Set Side Drawer Modules offers Mana Pool. In a drawer it is two sums over six counts: Total mana and Available on
        top, then W U / B R / G C two to a row, each number under its symbol. A source of either of two colors counts once
        in the sums and under both colors; a Signet counts its two less the {1} it takes; floating mana is available.
        Tapping such a source takes it off both colors.
     2. A card of yours that another player's spell or ability on the stack targets is outlined in red and says by what;
        a card of theirs, or one your own spell targets, is not.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-mana-pool.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-mana-pool", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "manapool01";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
/* Rob's board in the sample: Access Tunnel, Everflowing Chalice, three Islands and Command Tower, all tapped. Here one
   Island and the Tower are up, a Simic Signet (an addition) is up, and a {G} floats. */
const TUNNEL = 459, CHALICE = 461, ISLANDS = [469, 483, 527], TOWER = 502, PROFT = 526, FORMATION = 545, SIGNET = 9001;
const view = structuredClone(sample), me = view.state.players[view.seat];
const field = me.zones.Battlefield.cards;
for (const c of field) if ([ISLANDS[0], TOWER].includes(c.cardId)) c.tapped = false;
field.push({cardId: SIGNET, name: "Simic Signet", faceDown: false, owner: 0, controller: 0, tapped: false, damage: 0, counters: {}, types: ["Artifact"], power: null, toughness: null, keywords: [], commander: false});
me.zones.Battlefield.count = field.length;
me.mana = [{color: "G", amount: 1}];
const source = (cardId, name, tapped, ways) => ({cardId, name, tapped, ready: !tapped, ways});
view.manaSources = [source(TUNNEL, "Access Tunnel", true, [{mana: {C: 1}}]), source(CHALICE, "Everflowing Chalice", true, [{mana: {C: 1}}]),
  ...ISLANDS.map((id, i) => source(id, "Island", i > 0, [{mana: {U: 1}}])), source(TOWER, "Command Tower", false, [{mana: {G: 1}}, {mana: {U: 1}}]),
  source(SIGNET, "Simic Signet", false, [{mana: {G: 1, U: 1}, pay: 1}])];
const SHOTS = process.env.UAT_SHOTS;

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

try {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript(() => {localStorage.setItem("cm-board-view", "full"); localStorage.setItem("crankmagic-audio-muted", "true");});
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  let sock = null, revision = view.revision;
  const send = async (v) => {sock.send(JSON.stringify({type: "view", view: {...v, revision: ++revision}})); await page.waitForTimeout(400);};
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.send(JSON.stringify({type: "view", view}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator(`#cm-board .cm-bcard[data-card='${PROFT}']`).first().waitFor({timeout: 20000});
  await page.waitForTimeout(300);

  /* ---- 1. the module ---- */
  await page.locator("#cm-board [data-action=board-table-menu]").first().click();
  await page.locator("#cm-board [data-action=board-tools]").first().click();
  await page.locator("#cm-dialog[open] #cm-board-tools").waitFor({timeout: 5000});
  await page.locator("#cm-board-tools [data-action=board-modules-settings]").click();
  await page.locator("#cm-drawer-settings").waitFor();
  ok(await page.locator('#cm-drawer-settings input[name=module-mana]').count() === 3, "Set Side Drawer Modules offers Mana Pool, left, right or none");
  await page.locator("input[name=module-mana][value=right]").check();
  await page.locator("[data-action=board-modules-save]").click();
  await page.locator("#cm-drawer-settings").waitFor({state: "hidden"});
  const side = page.locator(".cm-drawer-tab[data-action=board-stage-side]");
  if (await side.getAttribute("aria-expanded") !== "true") await side.click();
  const pool = page.locator('.cm-stage-module[data-module=mana] .cm-mana-pool');
  await pool.waitFor({timeout: 5000});
  const read = () => pool.evaluate((el) => ({
    total: el.querySelector('[data-mana-sum=total] b').textContent, available: el.querySelector('[data-mana-sum=available] b').textContent,
    by: Object.fromEntries([...el.querySelectorAll('.cm-mana-cell')].map((c) => [c.dataset.mana, c.querySelector('b').textContent])),
    order: [...el.querySelectorAll('.cm-mana-cell')].map((c) => c.dataset.mana),
    rows: [...el.querySelectorAll('.cm-mana-cell')].map((c) => Math.round(c.getBoundingClientRect().top)),
    under: [...el.querySelectorAll('.cm-mana-cell')].every((c) => {const s = c.querySelector('.cm-mana-glyph').getBoundingClientRect(), n = c.querySelector('b').getBoundingClientRect(); return n.top >= s.bottom - 1 && Math.abs((n.left + n.right) / 2 - (s.left + s.right) / 2) < 3;}),
    sumsAbove: el.querySelector('.cm-mana-sums').getBoundingClientRect().bottom <= el.querySelector('.cm-mana-colors').getBoundingClientRect().top}));
  ok(await pool.locator(".cm-mana-sums span").evaluateAll((els) => els.every((el) => parseFloat(getComputedStyle(el).fontSize) >= 15)), "mana summary captions retain the 15px game-state minimum");
  let m = await read();
  eq(m.order, ["W", "U", "B", "R", "G", "C"], "the five colors and colorless");
  eq(new Set(m.rows).size, 3, "two to a row, three rows");
  ok(m.under && m.sumsAbove, "each number under its symbol, the two sums above them");
  eq([m.total, m.available], ["7", "4"], "Total 7 (six one-mana sources and the Signet's one more); Available 4 (the Island, the Tower, the Signet's one more, the floating {G})");
  eq(m.by, {W: "0", U: "3", B: "0", R: "0", G: "3", C: "0"}, "under blue: the Island, the Tower and the Signet; under green: the floating {G}, the Tower and the Signet");
  if (SHOTS) await pool.screenshot({path: path.join(SHOTS, "mana-pool.png")});
  /* The Tower tapped for {U}: off both of its colors; its {U} floats. */
  const tapped = structuredClone(view);
  tapped.state.players[view.seat].zones.Battlefield.cards.find((c) => c.cardId === TOWER).tapped = true;
  tapped.state.players[view.seat].mana = [{color: "G", amount: 1}, {color: "U", amount: 1}];
  Object.assign(tapped.manaSources.find((s) => s.cardId === TOWER), {tapped: true, ready: false});
  await send(tapped);
  m = await read();
  eq([m.total, m.available], ["7", "4"], "tapped for mana, the totals stand: its mana is in the pool");
  eq(m.by, {W: "0", U: "3", B: "0", R: "0", G: "2", C: "0"}, "green goes down by one, the Tower's; blue keeps its one as floating {U}");
  /* Then spent: both of its colors are one fewer than before it was tapped. */
  const spent = structuredClone(tapped);
  spent.state.players[view.seat].mana = [{color: "G", amount: 1}];
  await send(spent);
  m = await read();
  eq([m.available, m.by.U, m.by.G], ["3", "2", "2"], "its {U} spent, blue and green are each one fewer than they were");
  /* An older room that does not say: the basic lands alone, and it says so. */
  const older = structuredClone(view); delete older.manaSources;
  await send(older);
  m = await read();
  eq([m.total, m.available, m.by.U, m.by.G], ["3", "2", "1", "1"], "without the room's word, the three Islands and the floating {G}");
  ok(/basic lands only/i.test(await pool.textContent()), "and it says it counts basic lands only");

  /* Colored activation costs cannot be funded by mana of the wrong color or by the same source twice. */
  const castle = structuredClone(view);
  castle.state.players[view.seat].mana = [];
  castle.manaSources = [source(9200, "Castle Garenbrig", false, [{mana: {G: 1}}, {mana: {G: 6}, pay: 4, payColors: {G: 2}}]),
    ...[9201, 9202, 9203, 9204].map((id) => source(id, "Island", false, [{mana: {U: 1}}]))];
  await send(castle); m = await read();
  eq([m.total, m.available, m.by.G, m.by.U], ["5", "5", "1", "4"], "Castle plus four Islands cannot pay its two green activation symbols");
  const forests = structuredClone(castle);
  forests.manaSources.slice(1).forEach((s) => {s.name = "Forest"; s.ways = [{mana: {G: 1}}];});
  await send(forests); m = await read();
  eq([m.total, m.available], ["6", "6"], "Castle plus four Forests can pay for its six mana without tapping Castle twice");
  const noLife = structuredClone(view);
  noLife.state.players[view.seat].mana = [];
  noLife.manaSources = [{cardId: 9300, name: "Myr Convert", tapped: false, ready: false, ways: ["W", "U", "B", "R", "G"].map((k) => ({mana: {[k]: 1}, ready: false}))}];
  await send(noLife); m = await read();
  eq([m.total, m.available, ...Object.values(m.by)], ["1", "0", "0", "0", "0", "0", "0", "0"], "a source unable to pay its life cost contributes no available mana");

  /* ---- 2. targeted, in red ---- */
  const aimed = structuredClone(view);
  aimed.state.stack = [{stackId: 90, abilityId: null, cardId: 9100, name: "Lightning Bolt", faceDown: false, playerId: 2, kind: "spell", stage: "waiting", targets: [{kind: "object", id: PROFT}]},
    {stackId: 91, abilityId: null, cardId: 9101, name: "Rime Chill", faceDown: false, playerId: 0, kind: "spell", stage: "waiting", targets: [{kind: "object", id: FORMATION}]}];
  aimed.state.stackSize = 2;
  await send(aimed);
  const look = (id) => page.locator(`#cm-board .cm-stage-region .cm-bcard[data-card='${id}']`).first().evaluate((el) => ({targeted: el.classList.contains("is-targeted"), outline: getComputedStyle(el).outlineColor, width: getComputedStyle(el).outlineWidth, label: el.getAttribute("aria-label"), title: el.getAttribute("title")}));
  const proft = await look(PROFT);
  ok(proft.targeted && /rgb\(237, 69, 70\)/.test(proft.outline) && proft.width === "5px", `Proft, targeted by an opponent's Lightning Bolt, is outlined in red (${proft.outline} ${proft.width})`);
  ok(/targeted by Lightning Bolt/.test(proft.label) && /Targeted by Lightning Bolt/.test(proft.title || ""), `and says by what (${proft.label})`);
  ok(!(await look(FORMATION)).targeted, "a card of yours your own spell targets is not");
  if (SHOTS) await page.screenshot({path: path.join(SHOTS, "targeted-red.png")});
  await send(view);
  ok(!(await look(PROFT)).targeted, "and once the spell is gone, neither is Proft");
  eq(errors, [], `no page error (${errors.join(" | ")})`);
  await context.close();
} finally {
  await close();
}
console.log(`board-mana-pool: ${checks} checks passed`);
