/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   WHAT A SPELL OR ABILITY IS AIMED AT IS SEEN ON THE STACK, AS IT RESOLVES, AND IN THE HELD-UP PLAY (ROB-327; Rob, 2026-10-29/30,
   mid-game: "The target of an instant or spell is not seen during resolution (e.g. I might counter it if it's targeting me, but I
   can't tell) or in the history. It should be."). The board half of docs/ui-lane/history-and-targets-contract.md: the view's stack
   entries carry `aimed` (named, or `gone`), and the cast event carries it too.

     1. The stack's list: each entry says what it is aimed at, source ⤳ target, symbols first: "Lightning Bolt ⤳ You".
     2. A player is named; a card is named and shows the big card on hover and on keyboard focus; a target that has left is
        "✕ gone" and carries no name at all; an entry with no target says nothing extra.
     3. Under the pile (the entry being looked at), the same: a one-target spell, a two-target spell, a modal spell's modes.
     4. The pile follows the entry chosen: a different entry, a different aim.
     5. The opponent's play held up for ten seconds says what it was aimed at, and its target shows the card on hover.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-stack-targets.mjs
*/
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-stack-targets", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const stacked = views[33];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "stacktargets1";
const table = {tableId: TABLE, phase: "playing", matchId: stacked.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: stacked.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === stacked.seat ? "human" : "ai", you: p.playerId === stacked.seat, occupied: true, ready: true, mat: "felt"}))};
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SHOTS = process.env.CM_SHOTS;
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
let checks = 0, rev = 960000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
/* What is seen: the words only a screen reader is given ("targeting", "(the target has left)") are not. */
const seen = (t) => t.replace(/\s+/g, " ").replace(/ ?\(the target has left\)/g, "").replace(/targeting /g, "").trim();

/* A stack as the new engine projects it (projection.mjs): Rob is seat 0 and the viewer. */
const mine = stacked.state.players[0].zones.Battlefield.cards.find((c) => c.name);
const aimed = (...list) => list;
const stackOf = () => [
  {stackId: 301, abilityId: null, cardId: 9301, name: "Wrath of God", faceDown: false, playerId: 2, kind: "spell", stage: "waiting", targets: [], aimed: []},
  {stackId: 302, abilityId: null, cardId: 9302, name: "Chelonian Tackle", faceDown: false, playerId: 1, kind: "spell", stage: "waiting", targets: [],
    aimed: aimed({kind: "object", id: mine.cardId, name: mine.name, zone: "battlefield"}, {kind: "object", id: 9400, name: "Big Bear", zone: "battlefield"})},
  {stackId: 303, abilityId: null, cardId: 9303, name: "Abrade", faceDown: false, playerId: 2, kind: "spell", stage: "waiting", targets: [], modes: [1],
    aimed: aimed({kind: "object", id: 9401, name: "Sol Ring", zone: "battlefield"}),
    aimedModes: [{text: "Destroy target artifact.", aimed: aimed({kind: "object", id: 9401, name: "Sol Ring", zone: "battlefield"})}]},
  {stackId: 304, abilityId: "a0", cardId: 9304, name: "Prodigal Pyromancer", faceDown: false, playerId: 1, kind: "ability", stage: "waiting", targets: [],
    aimed: aimed({kind: "object", id: 9999, gone: true})},
  {stackId: 305, abilityId: null, cardId: 9305, name: "Lightning Bolt", faceDown: false, playerId: 1, kind: "spell", stage: "waiting", targets: [],
    aimed: aimed({kind: "player", id: 0, name: "Rob"})},
];

try {
  for (const mode of ["table", "focus", "full"]) {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: "reduce", serviceWorkers: "block"});
    await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
    const page = await context.newPage();
    if (stub) await stub(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let sock = null;
    await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
    await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
    await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
    await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
    await page.route(/^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, (r) => r.fulfill({contentType: "image/png", body: PIXEL}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.send(JSON.stringify({type: "view", view: stacked}));});
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(700);
    const send = async (view) => {view.revision = ++rev; sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(600);};
    const hoverCenter = async (locator) => {
      const box = await locator.boundingBox();
      await page.mouse.move(2, 2);
      await page.mouse.move(box.x + box.width / 2 - 3, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(800);
    };
    const peeked = () => page.$$eval("#cm-board-peek img", (is) => is.map((i) => i.getAttribute("src")));
    const shot = async (name) => {if (SHOTS) await page.screenshot({path: path.join(SHOTS, `${mode}-${name}.png`)});};

    const view = structuredClone(stacked);
    view.state.stack = stackOf();
    view.state.stackSize = view.state.stack.length;
    await send(view);
    if (!(await page.locator("#cm-stack-drawer.is-open").count())) await page.locator("button.cm-stage-right[data-action=board-stage-side]").click();
    await page.waitForTimeout(700);

    /* ---- 1. the list: source ⤳ target, one row each ---- */
    const rows = (await page.$$eval(".cm-stack-list .cm-stack-summary", (bs) => bs.map((b) => ({name: b.querySelector("strong").textContent, raw: b.querySelector(".cm-aims")?.innerText ?? ""}))))
      .map((r) => ({name: r.name, aim: seen(r.raw) || null}));
    eq(rows.length, 5, `${mode}: the five entries are listed`);
    const by = Object.fromEntries(rows.map((r) => [r.name, r.aim]));
    ok(/^⤳\s*You$/.test(by["Lightning Bolt"]), `${mode}: "Lightning Bolt ⤳ You": a player is named (got ${by["Lightning Bolt"]})`);
    ok(/^⤳\s*Big Bear/.test(by["Chelonian Tackle"].replace(mine.name, "").replace(/\s+/g, " ").trim()) || (by["Chelonian Tackle"].includes(mine.name) && by["Chelonian Tackle"].includes("Big Bear")), `${mode}: a two-target spell names both (got ${by["Chelonian Tackle"]})`);
    ok(/^⤳\s*Sol Ring$/.test(by["Abrade"]), `${mode}: a modal spell's target (got ${by["Abrade"]})`);
    ok(/✕\s*gone/.test(by["Prodigal Pyromancer"]) && !/9999/.test(by["Prodigal Pyromancer"]), `${mode}: a target that has left says "gone" (got ${by["Prodigal Pyromancer"]})`);
    eq(by["Wrath of God"], null, `${mode}: an entry with no target says nothing extra`);

    /* ---- 2. a card named shows the big card on hover, and on focus ---- */
    const chip = page.locator(".cm-stack-aims .cm-aim.is-card, .cm-stack-aims button.cm-aim").first();
    ok(await page.locator(".cm-stack-aims").count() === 1, `${mode}: under the pile, what the entry shown is aimed at`);
    await shot("stack");

    /* ---- 3. the pile follows the entry chosen ---- */
    const aimsUnder = () => page.locator(".cm-stack-aims").first().innerText().then(seen);
    const pick = async (name) => {await page.locator(".cm-stack-list .cm-stack-summary", {has: page.locator("strong", {hasText: new RegExp(`^${name}$`)})}).click(); await page.waitForTimeout(400);};
    await pick("Lightning Bolt");
    ok(/^⤳\s*You$/.test(await aimsUnder()), `${mode}: under the pile, the Bolt is aimed at You`);
    await pick("Chelonian Tackle");
    const two = await aimsUnder();
    ok(two.includes(mine.name) && two.includes("Big Bear"), `${mode}: the two-target spell, both named (got ${two})`);
    await pick("Abrade");
    const modal = await aimsUnder();
    ok(/Destroy target artifact\.\s*⤳\s*Sol Ring/.test(modal), `${mode}: the modal spell says the mode, then its target (got ${modal})`);
    await pick("Prodigal Pyromancer");
    const gone = await aimsUnder();
    ok(/gone/.test(gone) && !/Bear|Ring|Bolt/.test(gone), `${mode}: the target that left is "gone", with no name (got ${gone})`);
    await pick("Wrath of God");
    eq(await page.locator(".cm-stack-aims").count(), 0, `${mode}: an entry with no target has no aim line under the pile`);

    /* ---- 4. hover and focus on a named target show the card ---- */
    await pick("Chelonian Tackle");
    const bear = page.locator(".cm-stack-aims .cm-aim", {hasText: "Big Bear"});
    await hoverCenter(bear);
    const src = await page.evaluate(() => document.querySelector("#cm-board-peek img")?.getAttribute("src") ?? null);
    ok(src && /Big%20Bear|Big\+Bear/i.test(src), `${mode}: hovering a target's name shows that card large (src ${src})`);
    await shot("hover-target");
    await page.mouse.move(2, 2); await page.waitForTimeout(500);
    eq((await peeked()).length, 0, `${mode}: and it goes when the pointer leaves`);
    const readable = page.locator(".cm-stack-aims button.cm-aim", {hasText: mine.name});
    ok(await readable.count() === 1, `${mode}: a target on the table is a button that reads the card (one press from the card itself)`);
    await readable.focus(); await page.waitForTimeout(700);
    ok((await peeked()).length === 1, `${mode}: keyboard focus on the target shows the card too`);
    await page.keyboard.press("Tab"); await page.waitForTimeout(500);
    await page.mouse.move(2, 2);
    await readable.click(); await page.waitForTimeout(500);
    ok(await page.locator("#cm-card-inspector, .cm-action-card").count() > 0, `${mode}: pressing it reads the card`);

    /* ---- 5. the held-up play ---- */
    const play = structuredClone(stacked);
    play.events = [{eventId: 888001, kind: "cast", player: 1, card: {name: "Lightning Bolt"}, aimed: [{kind: "player", id: 0, name: "Rob"}]},
      {eventId: 888002, kind: "cast", player: 2, card: {name: "Abrade"}, aimed: [{kind: "object", id: 9401, name: "Sol Ring", zone: "battlefield"}],
        aimedModes: [{text: "Destroy target artifact.", aimed: [{kind: "object", id: 9401, name: "Sol Ring", zone: "battlefield"}]}]}];
    await send(play);
    const pops = await page.$$eval("#cm-board-plays .cm-play-pop", (ps) => ps.map((p) => ({who: p.querySelector("header b").textContent, aim: (p.querySelector(".cm-play-aim")?.innerText ?? "").replace(/\s+/g, " ").replace(/targeting /g, "").trim() || null})));
    eq(pops.length, 2, `${mode}: two plays are held up`);
    ok(pops.some((p) => /^⤳\s*You$/.test(p.aim ?? "")), `${mode}: the held-up Bolt says ⤳ You (got ${JSON.stringify(pops)})`);
    ok(pops.some((p) => /^⤳\s*Sol Ring$/.test(p.aim ?? "")), `${mode}: the held-up modal spell says its target (got ${JSON.stringify(pops)})`);
    await shot("held-up");
    const ring = page.locator("#cm-board-plays .cm-aim", {hasText: "Sol Ring"});
    await hoverCenter(ring);
    ok(((await peeked()).join(" ")).length > 0, `${mode}: hovering the held-up play's target shows that card large`);
    await page.mouse.move(2, 2); await page.waitForTimeout(500);
    const plain = structuredClone(stacked);
    plain.events = [{eventId: 888003, kind: "cast", player: 1, card: {name: "Opt"}}];
    await send(plain);
    eq(await page.locator('#cm-board-plays .cm-play-pop[aria-label$="cast Opt"]').count(), 1, `${mode}: the new play is held up`);
    eq(await page.locator('#cm-board-plays .cm-play-pop[aria-label$="cast Opt"] .cm-play-aim').count(), 0, `${mode}: a held-up play with no target says nothing extra`);
    eq(errors, [], `${mode}: no page errors`);
    await context.close();
  }
  console.log(`board-stack-targets: ${checks} checks passed -- a spell's or ability's targets on the stack's list, under its pile, and on the held-up play, in Table, Focus and 3D.`);
} finally {
  await close();
}
