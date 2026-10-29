/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* HOW A GAME ENDED, SAID (ROB-166), AND PLAY AGAIN (ROB-167), ON THE BOARD AND IN THE LOBBY (Oct 21, 2026).
 *
 * The banner reads the room's `result.ending` (game/room/ending.mjs; docs/ui-lane/gameplay-anchor.md, "How the game
 * ended"): a person knocked out at a table of AIs is told "You lost" and why -- never "The game was ended early" -- and
 * conceding, running out of time, a game ended for everyone, a draw and a win each say what they were. A view without
 * `ending` keeps its old words.
 *
 * Play again (the table's `POST .../rematch {accept}`, "After the game: Play again"): on the banner, Play again and Leave
 * the table, each pressed where a person sees it, and Play again tried again while the table has not yet heard the game
 * is over (409, "still being played"); in the lobby, every seat's answer, the closing time in the reader's own time, and
 * the buttons; closed, the reason and New table.
 *
 * At 1280x720 in Full and Focus, and the phone; reach by elementFromPoint. GEOMETRY_REQUIRED=1 refuses a missing browser.
 *   node tests/board-ending-rematch.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";
const {browser, base, stub, close} = await openBrowser({name: "board-ending-rematch", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const ME = sample.seatId, OTHER = sample.seats.find((s) => s.seatId !== ME).seatId, OTHER_NAME = sample.seats.find((s) => s.seatId === OTHER).name;
const NO_PERSON = "every person had left the game, so it ended there";
const seatsOut = (mine, other = "playing") => sample.seats.map((x) => ({seatId: x.seatId, outcome: x.seatId === ME ? mine : x.seatId === OTHER ? other : "playing", reason: null}));
/* Each ending the room can say, and what the banner must say for it. */
const ENDINGS = [
  ["eliminated, you", {winner: null, reason: NO_PERSON, endedBy: null, ending: {kind: "eliminated", seatId: ME, reason: "life", seats: seatsOut("lost")}}, /^You lost$/, /Your life reached 0\. With only AI players left, the game ends here\./],
  ["eliminated, another person last", {winner: null, reason: NO_PERSON, endedBy: null, ending: {kind: "eliminated", seatId: OTHER, reason: "poison", seats: seatsOut("lost", "lost")}}, new RegExp(`^${OTHER_NAME} lost$`), /ten poison counters\. With only AI players left/],
  ["conceded", {winner: null, reason: NO_PERSON, endedBy: null, ending: {kind: "conceded", seatId: ME, reason: "conceded", seats: seatsOut("conceded")}}, /^You conceded$/, /With only AI players left/],
  ["timed out", {winner: null, reason: NO_PERSON, endedBy: null, ending: {kind: "timed-out", seatId: ME, reason: "conceded", seats: seatsOut("timed-out")}}, /^You ran out of time$/, /not finished/],
  ["ended for everyone", {winner: null, reason: "ended early", endedBy: OTHER, ending: {kind: "ended", seatId: OTHER, reason: null, seats: seatsOut("playing")}}, /^The game was ended early$/, new RegExp(`${OTHER_NAME} ended it for everyone`)],
  ["a draw", {winner: null, reason: "everyone lost at once", ending: {kind: "draw", seatId: null, reason: null, seats: seatsOut("lost", "lost")}}, /^A draw$/, /lost at once/],
  ["you won", {winner: ME, reason: "last player standing", ending: {kind: "won", seatId: ME, reason: null, seats: seatsOut("won", "lost")}}, /^You won$/, /Last player standing/],
  ["no ending (an older room)", {winner: OTHER, reason: "last player standing"}, new RegExp(`^${OTHER_NAME} won$`), /Last player standing/],
];
const finished = (result) => Object.assign(structuredClone(sample), {revision: 40000, status: "finished", result, decision: null});
const rematchTable = (rematch, phase = "rematch") => ({tableId: "over0001", phase, matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"})), rematch});
const waiting = (mine = "pending") => ({lastMatchId: sample.matchId, deadline: Date.now() + 90000, outcome: "waiting", reason: null,
  votes: sample.state.players.map((p) => ({seatId: p.playerId, vote: p.playerId === sample.seat ? mine : "yes"}))});
async function fixture(view, {width = 1280, height = 720, mode = "full", table = rematchTable(waiting()), first409 = 0} = {}) {
  const posts = [], frames = [], context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let current = {...table, phase: view ? "playing" : table.phase}, refusals = first409;
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, async (r) => {
    const req = r.request();
    if (req.method() === "POST" && /\/rematch$/.test(new URL(req.url()).pathname)) {
      const body = JSON.parse(req.postData() || "{}");
      posts.push(body);
      if (refusals > 0) {refusals -= 1; return r.fulfill({status: 409, json: {error: "The game is still being played, so there is no Play again to answer yet. Answer it once the game is over."}});}
      current = body.accept ? rematchTable(null, "countdown") : rematchTable({...table.rematch, outcome: "closed", reason: "You left the table."});
      if (body.accept) current.countdownAt = Date.now() + 10000;
      return r.fulfill({json: {table: current}});
    }
    return r.fulfill({json: {table: current, now: Date.now()}});
  });
  if (view) await page.routeWebSocket(/\/api\/tables\/over0001\/connect$/, (ws) => {
    ws.onMessage(data => frames.push(JSON.parse(data)));
    ws.send(JSON.stringify({type: "view", view}));
  });
  await page.goto(`${base}/index.html#table?id=over0001`);
  if (view) {await page.locator(".cm-board-over").waitFor({timeout: 20000}); current = {...table};}
  else await page.locator("#cm-table-game").waitFor({timeout: 20000});
  await page.waitForTimeout(300);
  return {page, context, posts, frames, errors};
}
async function reach(page, selector) {
  return page.locator(selector).first().evaluate((el) => {const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2; return {ok: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && el.contains(document.elementFromPoint(x, y)), x, y};});
}
const text = (page, sel) => page.locator(sel).first().evaluate((el) => {const s = document.createElement("style"); s.textContent = "*{text-transform:none!important}"; document.head.append(s); const t = el.innerText; s.remove(); return t.replace(/\s+/g, " ").trim();});
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
try {
  /* ---- the banner's words, for each ending ---- */
  for (const [name, result, head, line] of ENDINGS) {
    const {page, context, errors} = await fixture(finished(result));
    const h = await text(page, "#cm-board-over-title"), p = await text(page, ".cm-board-over p");
    ok(head.test(h), `${name}: the banner says ${head} (${h})`);
    ok(line.test(p), `${name}: and ${line} (${p})`);
    if (result.ending && result.ending.kind !== "ended") ok(!/ended early/i.test(`${h} ${p}`), `${name}: never "ended early"`);
    ok(!errors.length, `${name}: no page error (${errors.join(" | ")})`);
    await context.close();
  }
  /* ---- r4 removes the finished game's pass/resolve control. The persistent ending banner replaces it; native hand
     browsing/Enter cannot submit a stale answer. The eliminated seat's empty mat still explains why it is empty. ---- */
  for (const mode of ["focus", "full"]) {
    const view = finished(ENDINGS[0][1]), me = view.state.players[view.seat];
    me.health = {...me.health, life: 0, status: "lost", lossReason: "life"};
    me.zones.Battlefield = {...me.zones.Battlefield, count: 0, cards: []};
    view.state.stack = [{stackId: 1, cardId: 99001, name: "Massacre Girl", playerId: 1, kind: "spell"}];
    const {page, context, frames, errors} = await fixture(view, {mode});
    ok(await page.locator('#cm-board-over-title').innerText() === 'You lost', `${mode}: the persistent ending banner explains the terminal state`);
    const gameplay = ['board-flow-confirm','board-flow-choice','board-flow-attacker','board-pass','board-draw','board-resolve-all','board-skip','board-confirm','board-direct','board-option','board-card-menu-do','board-hand-do','board-zoom-do','board-send-blockers','board-opening-hand','board-offered-undo'].map(action=>`[data-action="${action}"]`).join(',');
    const enabledGameplay = () => page.locator(gameplay).evaluateAll(els => els.filter(el => !el.disabled).map(el => ({action:el.dataset.action,text:el.textContent.trim()})));
    ok((await enabledGameplay()).length === 0, `${mode}: no enabled pass, draw, resolve, skip or answer remains after game over`);
    const empty = await page.locator(".cm-board-empty").allTextContents();
    ok(empty.includes("Out of the game.") && !empty.includes("No permanents yet."), `${mode}: your empty mat says you are out of the game (${JSON.stringify(empty)})`);
    ok(me.zones.Hand.cards.length > 0, `${mode}: a real retained hand card exercises the terminal keyboard path`);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Space');
    await page.locator('.cm-hand-show').waitFor();
    await page.keyboard.press('1');
    await page.locator('.cm-hand-held').waitFor();
    await page.keyboard.press('Enter');
    ok((await enabledGameplay()).length === 0, `${mode}: native hand browsing exposes no stale cast/answer`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    ok(await page.locator('.cm-board-over').isVisible(), `${mode}: the ending remains visible after browsing the retained hand`);
    ok(frames.filter(f => f.type === 'act').length === 0, `${mode}: native Space, hand-number and Enter send no gameplay action after the game ends (${JSON.stringify(frames)})`);
    ok(!errors.length, `${mode}: no page error (${errors.join(" | ")})`);
    await context.close();
  }
  /* ---- Play again and Leave on the banner, in three views ---- */
  for (const [width, height, mode] of [[1280, 720, "full"], [1280, 720, "focus"], [390, 844, "focus"]]) {
    const where = `${mode} ${width}x${height}`;
    {
      const {page, context, posts, errors} = await fixture(finished(ENDINGS[0][1]), {width, height, mode, first409: 2});
      for (const sel of ['[data-action="board-rematch"][data-accept="yes"]', '[data-action="board-rematch"][data-accept="no"]', '[data-action="board-leave"]'])
        ok((await reach(page, `.cm-board-over ${sel}`)).ok, `${where}: ${sel} on the banner takes the pointer`);
      const at = await reach(page, '.cm-board-over [data-action="board-rematch"][data-accept="yes"]');
      await page.mouse.click(at.x, at.y);
      await page.locator("#cm-table-seconds").waitFor({timeout: 15000});
      ok(posts.length === 3 && posts.every((b) => b.accept === true), `${where}: Play again answers yes, tried again while the table catches up (${JSON.stringify(posts)})`);
      ok(true, `${where}: then the lobby counts down to the next game`);
      ok(!errors.length, `${where}: no page error (${errors.join(" | ")})`);
      await context.close();
    }
    {
      const {page, context, posts} = await fixture(finished(ENDINGS[0][1]), {width, height, mode});
      const at = await reach(page, '.cm-board-over [data-action="board-rematch"][data-accept="no"]');
      await page.mouse.click(at.x, at.y);
      await page.waitForFunction(() => !document.querySelector(".cm-board-over"), null, {timeout: 15000});
      ok(posts.length === 1 && posts[0].accept === false, `${where}: Leave the table answers no (${JSON.stringify(posts)})`);
      await context.close();
    }
  }
  /* ---- the lobby: everyone's answers, the closing time, the buttons; closed, the reason and New table ---- */
  {
    const {page, context, posts, errors} = await fixture(null, {table: rematchTable(waiting("pending"))});
    const panel = await text(page, "#cm-table-game");
    ok(/^Play again\?/.test(panel), `lobby: Play again? (${panel})`);
    ok(/You · deciding/.test(panel) && /playing again/.test(panel), `lobby: each seat's answer is shown (${panel})`);
    ok(/Answers close at \d{1,2}:\d{2} (AM|PM)/.test(panel), `lobby: the closing time in US time (${panel})`);
    const at = await reach(page, '#cm-table-game [data-action="table-rematch"][data-accept="yes"]');
    ok(at.ok, "lobby: Play again takes the pointer");
    ok((await reach(page, '#cm-table-game [data-action="table-rematch"][data-accept="no"]')).ok, "lobby: Leave the table takes the pointer");
    await page.mouse.click(at.x, at.y);
    await page.locator("#cm-table-seconds").waitFor({timeout: 15000});
    ok(posts.length === 1 && posts[0].accept === true, `lobby: Play again answers yes and the countdown shows (${JSON.stringify(posts)})`);
    ok(!errors.length, `lobby: no page error (${errors.join(" | ")})`);
    await context.close();
  }
  {
    const {page, context} = await fixture(null, {table: rematchTable(waiting("yes"))});
    const panel = await text(page, "#cm-table-game");
    ok(/You are staying/.test(panel) && /You · playing again/.test(panel), `lobby: a Yes says you are staying (${panel})`);
    ok(await page.locator('#cm-table-game [data-action="table-rematch"][data-accept="yes"]').count() === 0, "lobby: no second Play again after a Yes");
    await context.close();
  }
  {
    const closed = {lastMatchId: sample.matchId, deadline: Date.now() - 1000, outcome: "closed", reason: "The host is not staying for another game, so this table's games are over. Start a new table to play again.", votes: []};
    const {page, context} = await fixture(null, {table: rematchTable(closed)});
    const panel = await text(page, "#cm-table-game");
    ok(/The host is not staying/.test(panel), `lobby closed: the reason is said (${panel})`);
    ok((await reach(page, '#cm-table-game [data-action="table-new-after"]')).ok, "lobby closed: New table takes the pointer");
    await context.close();
  }
} finally {await close();}
console.log(`board-ending-rematch: ${checks} checks passed -- each ending said as it was (you lost and why, never "ended early"), Play again and Leave on the banner in three views, tried again while the table catches up; the lobby's answers, closing time and buttons, and the reason when closed`);
