/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   A CARD DRAGGED FROM THE HAND OVER THE MAT AND RELEASED PLAYS BY THE PATH PRESSING IT TAKES (ROB-328; Rob, 2026-10-30:
   "I also want to be able to grab a card from my hand and drag it over the mat, release it to play it."; crankmagic-board.js,
   crankmagic-stage.css).

     * The card lifts with the real mouse, in 3D, Focus and Table, and your mat shows where it lands (a land to the lands
       row, a creature to the battlefield, a spell to the table).
     * Released on your mat it opens exactly what pressing the card opens (the same pop-up, the same words), and sends
       NOTHING: a land, a creature, a spell, and a card with two ways to cast each ask; the drop chooses no way.
     * Released off the mat, on an opponent's mat, or after Escape mid-drag: the card is back, nothing is sent, no pop-up.
     * A card nothing lets you play still lifts, shows it cannot land and why (the room's own words), and releasing it on
       the mat sends nothing and says the same words.
     * A plain press (no drag) is still the press it always was.
     * Touch: a finger held a moment lifts it (the tray's swipe is untouched); the pointer path is the same.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-hand-drag.mjs
*/
import assert from "node:assert/strict";
import {readFileSync, mkdirSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-hand-drag", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "handdrag01";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const ISLAND = 524, THRUSH = 543, SOUL = 451, CHILL = 453, BOLT = 455;
const BOLT_WHY = "Lightning Bolt: you have no untapped Mountain to pay {R}.";
/* The sample's hand (Soul of New Phyrexia, Rime Chill, Island, Old Thrush) and a fifth card nothing lets you play. The
   room's offers: pass, play the Island, cast Old Thrush, cast Rime Chill, and TWO ways to cast Soul of New Phyrexia. */
function viewOf() {
  const v = structuredClone(sample), zone = v.state.players[v.seat].zones.Hand;
  zone.cards.push({cardId: BOLT, name: "Lightning Bolt", faceDown: false, owner: v.seat, controller: v.seat, tapped: false, damage: 0, counters: {}, types: ["Instant"], power: null, toughness: null, keywords: [], commander: false, why: BOLT_WHY});
  zone.count = zone.cards.length;
  const offer = (index, act, cardId, label) => ({index, label, act, cardId});
  v.decision.options = [{index: 0, label: "Pass priority", act: "pass"}, offer(1, "play-land", ISLAND, "Island"), offer(2, "cast", THRUSH, "Old Thrush"),
    offer(3, "cast", CHILL, "Rime Chill"), offer(4, "cast", SOUL, "Soul of New Phyrexia"), offer(5, "cast", SOUL, "Soul of New Phyrexia (for {1}{W}{W}{W}{W})")];
  return v;
}
const SHOTS = process.env.UAT_SHOTS;
if (SHOTS) mkdirSync(SHOTS, {recursive: true});
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const settle = (page, ms = 150) => page.waitForTimeout(ms);

async function board(mode, {width = 1440, height = 900} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript(([m]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");
  }, [mode]);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [], sent = [], view = viewOf();
  let socket;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {socket = ws; ws.onMessage((m) => sent.push(JSON.parse(m))); ws.send(JSON.stringify({type: "view", view}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator(`#cm-board .cm-stage-fan .cm-bcard[data-card='${ISLAND}']`).first().waitFor({timeout: 20000});
  if (mode === "full") await page.locator("[data-engine=babylon][data-renderer=webgl]").waitFor({timeout: 20000});
  await settle(page, 400);
  await page.evaluate(async () => {await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));});
  return {page, context, errors, acts: () => sent.filter((x) => x.type === "act"), publish: async (change) => {change(view); socket.send(JSON.stringify({type: "view", view})); await settle(page);}};
}
const handCard = (id) => `#cm-board .cm-stage-fan .cm-bcard[data-card='${id}']`;
/* The middle of the card as the pointer finds it (not under a neighbor in the fan), and a point inside your own mat. */
async function cardPoint(page, id) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel), r = el.getBoundingClientRect();
    for (const [fx, fy] of [[.5, .6], [.5, .3], [.3, .5], [.7, .5], [.5, .85]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (el.contains(document.elementFromPoint(x, y))) return {x, y};
    }
    return null;
  }, handCard(id));
}
async function ownMatPoint(page) {
  return page.evaluate(() => {
    const seat = document.querySelector("#cm-board .cm-stage-fan")?.closest("#cm-board") && window.__seat;
    const mats = [...document.querySelectorAll("#cm-board .cm-mat[data-seat]")].filter((m) => m.matches(".is-you, [data-you]") || m.closest(".is-you"));
    const mat = mats[0] || document.querySelector("#cm-board .cm-mat[data-seat='0']");
    const r = mat.getBoundingClientRect();
    for (const [fx, fy] of [[.5, .5], [.4, .4], [.6, .6], [.3, .5], [.7, .5], [.5, .3]]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy, hit = document.elementFromPoint(x, y);
      if (hit && mat.contains(hit) && !hit.closest(".cm-bcard,button")) return {x, y, seat: Number(mat.dataset.seat), seatArg: seat};
    }
    return null;
  });
}
async function otherMatPoint(page) {
  return page.evaluate(() => {
    for (const mat of document.querySelectorAll("#cm-board .cm-mat[data-seat]:not([data-seat='0'])")) {
      const r = mat.getBoundingClientRect();
      for (const [fx, fy] of [[.5, .5], [.3, .5], [.7, .5], [.5, .3]]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy, hit = document.elementFromPoint(x, y);
        if (hit && mat.contains(hit) && !hit.closest(".cm-bcard,button")) return {x, y, seat: Number(mat.dataset.seat)};
      }
    }
    return null;
  });
}
const ghost = (page) => page.evaluate(() => {const g = document.querySelector(".cm-hand-ghost"); return g ? {card: g.dataset.card, landing: g.dataset.landing, refused: g.classList.contains("is-refused"), tag: g.querySelector(".cm-hand-ghost-tag").textContent, w: g.getBoundingClientRect().width} : null;});
const marks = (page) => page.evaluate(() => ({ok: document.querySelectorAll(".cm-mat.is-hand-drop-ok").length, no: document.querySelectorAll(".cm-mat.is-hand-drop-no").length, row: [...document.querySelectorAll(".is-hand-drop-row")].map((el) => el.dataset.cardSection || el.className)}));
/* What is asking: the card menu or the choice pop-up, as words, and what is on the screen. */
const asking = (page) => page.evaluate(() => ({
  menu: document.getElementById("cm-card-menu")?.innerText.replace(/\s+/g, " ").trim() || null,
  popup: document.querySelector(".cm-required-popup")?.innerText.replace(/\s+/g, " ").trim() || null,
  pane: document.getElementById("cm-board-decision")?.innerText.replace(/\s+/g, " ").trim() || null,
}));
async function liftOver(page, id, to, {steps = 12} = {}) {
  const from = await cardPoint(page, id);
  assert.ok(from, `a point on card ${id}`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 2, from.y - 3);
  await page.mouse.move(from.x + 8, from.y - 12, {steps: 3});
  await page.mouse.move(to.x, to.y, {steps});
  await settle(page, 80);
}
async function reset(page) {
  await page.keyboard.press("Escape"); await page.mouse.move(5, 5); await settle(page);
}
/* What pressing the card opens (a click on it), taken in the same page and put away. */
async function pressed(page, id) {
  const p = await cardPoint(page, id);
  await page.mouse.click(p.x, p.y); await settle(page, 300);
  const said = await asking(page);
  await page.keyboard.press("Escape"); await settle(page);
  return said;
}

try {
  for (const [mode, size] of [["full", {}], ["table", {}], ["focus", {}]]) {
    const {page, context, errors, acts} = await board(mode, size);
    const where = `${mode}: `;
    const mat = await ownMatPoint(page), off = {x: 8, y: 8};
    ok(mat, where + "a point on your own mat");
    eq(await page.locator(".cm-hand-ghost").count(), 0, where + "nothing is lifted at rest");

    /* ---- the Island: lifts, lands on the lands row, and its drop asks as a press does ---- */
    const pressedIsland = await pressed(page, ISLAND);
    ok(pressedIsland.menu || pressedIsland.popup || pressedIsland.pane, where + "pressing the Island asks something");
    eq(acts().length, 0, where + "pressing sent nothing");
    await liftOver(page, ISLAND, mat);
    let g = await ghost(page);
    eq([g?.card, g?.landing, g?.refused], [String(ISLAND), "lands", false], where + "the Island lifts and says it lands in the lands row");
    ok(/Lands/.test(g.tag), where + "the tag names the place (" + g?.tag + ")");
    const m1 = await marks(page);
    eq([m1.ok, m1.no], [1, 0], where + "your mat is outlined as where it lands");
    ok(await page.locator(handCard(ISLAND)).evaluate((el) => el.classList.contains("is-hand-lifted")), where + "the card in the hand is dimmed while it is away");
    if (SHOTS) await page.screenshot({path: path.join(SHOTS, `hand-drag-${mode}-land.png`)});
    await page.mouse.up(); await settle(page, 300);
    eq(await page.locator(".cm-hand-ghost").count(), 0, where + "the lifted card is put down on release");
    eq(acts().length, 0, where + "dropping the Island sent nothing: it asks first");
    const droppedIsland = await asking(page);
    eq(droppedIsland, pressedIsland, where + "dropping the Island opens exactly what pressing it opens");
    await reset(page);
    eq(await page.locator("#cm-card-menu, .cm-required-popup").count(), 0, where + "asking is put away");

    /* ---- a creature: lands on the battlefield, asks as a press does ---- */
    const pressedThrush = await pressed(page, THRUSH);
    await liftOver(page, THRUSH, mat);
    g = await ghost(page);
    eq([g?.card, g?.landing, g?.refused], [String(THRUSH), "battlefield", false], where + "the creature lands on the battlefield");
    await page.mouse.up(); await settle(page, 300);
    eq(acts().length, 0, where + "dropping the creature sent nothing");
    eq(await asking(page), pressedThrush, where + "dropping the creature opens what pressing it opens");
    await reset(page);

    /* ---- a spell: lands on the table as a cast ---- */
    const pressedChill = await pressed(page, CHILL);
    await liftOver(page, CHILL, mat);
    g = await ghost(page);
    eq([g?.card, g?.landing, g?.refused], [String(CHILL), "table", false], where + "the spell lands on the table");
    ok(/Cast/.test(g.tag), where + "its tag says Cast");
    await page.mouse.up(); await settle(page, 300);
    eq(acts().length, 0, where + "dropping the spell sent nothing");
    eq(await asking(page), pressedChill, where + "dropping the spell opens what pressing it opens");
    await reset(page);

    /* ---- two ways to cast: it asks which, the drop picks neither ---- */
    const pressedSoul = await pressed(page, SOUL);
    await liftOver(page, SOUL, mat);
    await page.mouse.up(); await settle(page, 300);
    eq(acts().length, 0, where + "dropping a card with two ways to cast sent nothing");
    const droppedSoul = await asking(page);
    eq(droppedSoul, pressedSoul, where + "its drop opens what pressing it opens");
    const both = JSON.stringify(droppedSoul);
    ok(/Soul of New Phyrexia \(for\b/.test(both) && (both.match(/Soul of New Phyrexia/g) || []).length >= 3, where + "both ways to cast are offered to the player (the plain cast and the one for another cost)");
    await reset(page);

    /* ---- released off the mat: back in the hand, nothing happens ---- */
    await liftOver(page, ISLAND, off);
    g = await ghost(page);
    eq(g?.landing, "off", where + "off the mat it says where to take it");
    eq((await marks(page)).ok, 0, where + "no mat is outlined off the mat");
    await page.mouse.up(); await settle(page, 300);
    eq([acts().length, await page.locator(".cm-hand-ghost").count(), (await asking(page)).menu, (await asking(page)).popup], [0, 0, null, null], where + "off-mat release: nothing sent, nothing asked, the card is back");
    ok(await page.locator(handCard(ISLAND)).count() === 1 && !(await page.locator(handCard(ISLAND)).evaluate((el) => el.classList.contains("is-hand-lifted"))), where + "the card is in the hand again");

    /* ---- an opponent's mat is not where it goes ---- */
    const other = await otherMatPoint(page);
    ok(other, where + "a point on an opponent's mat");
    {
      await liftOver(page, ISLAND, other);
      eq((await ghost(page))?.landing, "off", where + "an opponent's mat does not take it");
      eq((await marks(page)).ok, 0, where + "and it is not outlined as a landing");
      await page.mouse.up(); await settle(page, 300);
      eq([acts().length, (await asking(page)).menu, (await asking(page)).popup], [0, null, null], where + "released over an opponent's mat: nothing sent, nothing asked");
    }

    /* ---- Escape mid-drag, over the mat: back, nothing ---- */
    await liftOver(page, ISLAND, mat);
    eq((await ghost(page))?.landing, "lands", where + "lifted over the mat");
    await page.keyboard.press("Escape"); await settle(page);
    eq(await page.locator(".cm-hand-ghost").count(), 0, where + "Escape puts the card down");
    await page.mouse.up(); await settle(page, 300);
    eq([acts().length, (await asking(page)).menu, (await asking(page)).popup], [0, null, null], where + "Escape mid-drag: releasing afterwards sends and asks nothing");
    eq((await marks(page)).ok, 0, where + "Escape clears the mat's outline");

    /* ---- a card that cannot be played: lifts, cannot land, says why ---- */
    await liftOver(page, BOLT, mat);
    g = await ghost(page);
    eq([g?.card, g?.landing, g?.refused], [String(BOLT), "refused", true], where + "the card nothing lets you play still lifts, and shows it cannot land");
    ok(g.tag.includes(BOLT_WHY), where + "and says why in the room's words (" + g?.tag + ")");
    const m2 = await marks(page);
    eq([m2.ok, m2.no], [0, 1], where + "your mat is outlined as refusing");
    if (SHOTS) await page.screenshot({path: path.join(SHOTS, `hand-drag-${mode}-refused.png`)});
    await page.mouse.up(); await settle(page, 300);
    eq([acts().length, (await asking(page)).menu, (await asking(page)).popup], [0, null, null], where + "releasing the refused card on the mat sends and asks nothing");
    ok((await page.locator("#cm-notice").innerText()).includes(BOLT_WHY), where + "and the refusal's words are said");

    /* ---- a plain press, with no drag, is still the press it was ---- */
    eq(await pressed(page, ISLAND), pressedIsland, where + "a press with no drag still opens what it always opened");
    eq(errors, [], where + "no page errors");
    await context.close();
  }

  /* ---- the real answer path: the question the drop opens is answered by the player, and then the table gets it ---- */
  {
    const {page, context, acts} = await board("table");
    const mat = await ownMatPoint(page);
    await liftOver(page, ISLAND, mat);
    await page.mouse.up(); await settle(page, 300);
    eq(acts().length, 0, "the Island's drop waits for the player");
    const confirm = page.locator('.cm-required-popup [data-action="board-flow-confirm"], #cm-card-menu .cm-card-menu-do, [data-action="board-direct"], [data-action="board-confirm"]').first();
    await confirm.waitFor({timeout: 4000});
    await confirm.click(); await settle(page, 400);
    const last = acts().at(-1);
    ok(acts().length >= 1 && last?.kind === "answer" && last.indices?.[0] === 1, "the player's own confirmation sends the Island's play (index 1): " + JSON.stringify(last));
    await context.close();
  }

  /* ---- touch: a held finger lifts it, a quick swipe does not ---- */
  {
    const {page, context, acts} = await board("table");
    const mat = await ownMatPoint(page), from = await cardPoint(page, ISLAND);
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", {type, touchPoints: type === "touchEnd" ? [] : [{x, y, id: 1}]});
    await touch("touchStart", from.x, from.y); await settle(page, 450);
    eq(await page.locator(".cm-hand-ghost").count(), 1, "a finger held on a card lifts it");
    await touch("touchMove", (from.x + mat.x) / 2, (from.y + mat.y) / 2); await touch("touchMove", mat.x, mat.y); await settle(page, 100);
    eq((await ghost(page))?.landing, "lands", "the held card follows the finger to the mat");
    await touch("touchEnd"); await settle(page, 300);
    eq(acts().length, 0, "a finger's drop sends nothing; it asks as a press does");
    ok((await asking(page)).menu || (await asking(page)).popup || (await asking(page)).pane, "and it is asking");
    await reset(page);
    await touch("touchStart", from.x, from.y); await touch("touchMove", from.x + 40, from.y); await settle(page, 450); await touch("touchEnd");
    eq(await page.locator(".cm-hand-ghost").count(), 0, "a finger that swipes before the hold lifts nothing (the tray's own swipe)");
    await context.close();
  }
  console.log(`board-hand-drag: ${checks} checks passed -- a hand card dragged over your mat lifts in 3D, Focus and Table, shows where it lands (or why it cannot), and on release opens what pressing it opens, sending nothing; off the mat and Escape put it back; a finger held lifts it.`);
} finally {
  await close();
}
