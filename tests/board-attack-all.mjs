/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ATTACK ALL (Rob's one-person, three-AI table, Oct 21).
 *
 * The engine offers Declare attackers as one option per creature per player (game/engine/rules/combat.mjs), so a swarm at
 * three opponents was a pick per creature. The board puts "All at <player>" above the options -- for every creature that
 * may attack that player, its option at them, any other creature's pick kept -- and "None". They only pick: Confirm sends
 * the answer, and the room checks it as ever. Not on any other question.
 *
 * In Full, Table and Focus at 1280x720 and the phone at 390x844, each button reached by elementFromPoint (a Playwright click
 * proves no reach). GEOMETRY_REQUIRED=1 refuses a missing browser.
 *   node tests/board-attack-all.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import {readFileSync} from "node:fs";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-attack-all", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const GOBLINS = [82001, 82002, 82003];
const goblin = (cardId) => ({cardId, name: "Goblin", owner: 0, controller: 0, faceDown: false, tapped: false, damage: 0, counters: {}, types: ["Creature"], power: 1, toughness: 1, keywords: [], commander: false});
function attackView() {
  const v = structuredClone(sample);
  v.revision = 40000;
  v.seat = 0; v.seatId = "s0"; v.waitingOn = "s0";
  v.state.activePlayer = 0; v.state.phase = "COMBAT_DECLARE_ATTACKERS"; v.state.combat = null;
  v.state.players[0].zones.Battlefield.cards.push(...GOBLINS.map(goblin));
  const others = v.state.players.filter((p) => p.playerId !== 0);
  const options = [];
  /* As the engine lists them (rules/combat.mjs): each creature at each player, then at each planeswalker -- here the second
     opponent's, which "All at" that player never picks: attacking it is not attacking them. */
  GOBLINS.forEach((id, n) => {
    others.forEach((p) => options.push({index: options.length, label: `Goblin #${n + 1} → ${p.name}`, cardId: id, defenderId: p.playerId}));
    options.push({index: options.length, label: `Goblin #${n + 1} → Garruk Wildspeaker (${others[1].name})`, cardId: id, defenderId: others[1].playerId, planeswalkerId: 82050});
  });
  v.decision = {id: "declare-attackers:31", title: "Declare attackers", kind: "declare-attackers", mode: "many", min: 0, max: GOBLINS.length, exclusiveBy: "cardId", options};
  return {view: v, others};
}
async function fixture(view, width, height, mode) {
  const frames = [], context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table: {tableId: "atk00001", phase: "playing", matchId: view.matchId, away: [],
    seats: view.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: "human", mat: "felt", you: p.playerId === view.seat}))}, now: Date.now()}}));
  await page.routeWebSocket(/\/api\/tables\/atk00001\/connect$/, (ws) => {ws.onMessage((data) => frames.push(JSON.parse(data))); ws.send(JSON.stringify({type: "view", view}));});
  await page.goto(`${base}/index.html#table?id=atk00001`);
  await page.locator("#cm-board").waitFor();
  await page.waitForTimeout(400);
  return {page, context, frames, errors};
}
/* Pressed where a person would press it: the element itself under the point, inside the window -- scrolled into its own
   list first if that list scrolls, as a person would. */
async function press(page, selector) {
  const at = await page.locator(selector).first().evaluate((el) => {
    el.scrollIntoView({block: "nearest", inline: "nearest"});
    const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return {ok: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && el.contains(document.elementFromPoint(x, y)), x, y};
  });
  assert.ok(at.ok, `${selector} takes the pointer`);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150);
}
const pickedAt = (page) => page.evaluate(() => [...document.querySelectorAll('#cm-board [data-action="board-option"][aria-pressed="true"]')].map((el) => el.textContent.trim()).sort());
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
try {
  for (const [width, height, mode] of [[1280, 720, "full"], [1280, 720, "table"], [1280, 720, "focus"], [390, 844, "focus"]]) {
    const where = `${mode} ${width}x${height}`;
    const {view, others} = attackView();
    const [maya, theo, ivy] = others;
    const {page, context, frames, errors} = await fixture(view, width, height, mode);
    /* In Full the question may sit in a drawer: open it where the board says it is asked. */
    if (!(await page.locator('[data-action="board-attack-all"]').count())) {
      const open = page.locator('[data-action="board-decision-open"], [data-module-open="actions"], [data-action="board-also"]').first();
      if (await open.count()) {await open.click(); await page.waitForTimeout(200);}
    }
    const buttons = await page.locator('[data-action="board-attack-all"]').allInnerTexts();
    ok(JSON.stringify(buttons.map((t) => t.trim())) === JSON.stringify(others.map((p) => `All at ${p.name}`)), `${where}: one "All at" for each player the creatures may attack (${buttons.join(", ")})`);
    await press(page, `[data-action="board-attack-all"][data-defender="${theo.playerId}"]`);
    ok(JSON.stringify(await pickedAt(page)) === JSON.stringify([1, 2, 3].map((n) => `Goblin #${n} → ${theo.name}`)), `${where}: All at ${theo.name} picks every goblin at ${theo.name}`);
    await press(page, `[data-action="board-option"][data-index="${2}"]`);
    ok((await pickedAt(page)).includes(`Goblin #1 → ${ivy.name}`) && !(await pickedAt(page)).includes(`Goblin #1 → ${theo.name}`) && (await pickedAt(page)).length === 3,
      `${where}: one goblin turned on ${ivy.name} by its own option, the others still at ${theo.name}`);
    await press(page, `[data-action="board-attack-all"][data-defender="${maya.playerId}"]`);
    ok(JSON.stringify(await pickedAt(page)) === JSON.stringify([1, 2, 3].map((n) => `Goblin #${n} → ${maya.name}`)), `${where}: All at ${maya.name} turns them all on ${maya.name}`);
    await press(page, '[data-action="board-attack-none"]');
    ok((await pickedAt(page)).length === 0 && await page.locator('[data-action="board-attack-none"]').count() === 0, `${where}: None clears them, and puts itself away`);
    ok(frames.filter((f) => f.type === "act").length === 0, `${where}: nothing is sent while picking`);
    await press(page, `[data-action="board-attack-all"][data-defender="${ivy.playerId}"]`);
    await press(page, '[data-action="board-confirm"]');
    const sent = frames.filter((f) => f.type === "act").at(-1);
    ok(sent && JSON.stringify([...sent.indices].sort((a, b) => a - b)) === JSON.stringify(view.decision.options.filter((o) => o.defenderId === ivy.playerId).map((o) => o.index)),
      `${where}: Confirm sends the three attacks at ${ivy.name} (${JSON.stringify(sent?.indices)})`);
    ok(errors.length === 0, `${where}: no page errors`);
    await context.close();
  }
  /* Not on another question that picks many. */
  {
    const {view} = attackView();
    view.decision = {...view.decision, id: "choose-cards:31", title: "Choose two", kind: "choose", exclusiveBy: undefined, min: 2, max: 2};
    const {page, context} = await fixture(view, 1280, 720, "table");
    ok(await page.locator('[data-action="board-attack-all"]').count() === 0, "another question that picks many has no All at");
    await context.close();
  }
} finally {await close();}
console.log(`board-attack-all: ${checks} checks passed -- "All at <player>" on Declare attackers picks every creature that may attack them, a single option still turns one, None clears, and Confirm alone sends it; in Full, Table, Focus and on the phone, by elementFromPoint; never on another question.`);
