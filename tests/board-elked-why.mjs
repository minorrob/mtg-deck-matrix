/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE BOARD SAYS WHY A PERMANENT THAT LOST ITS ABILITIES OFFERS NOTHING (ROB-330, ROB-331; Rob's playtest of 2026-10-30: a Food
   and a Hall of Echoes Oko had turned into Elks offered nothing, and the board stayed silent; tests/engine-elked-reasons.mjs is the
   engine's half, the view's `why` on such a permanent).

   The refusal rule (AGENTS.md): what is wrong, and what to do instead, naming the thing.

     1. A permanent whose view carries a reason says it in its label, in the words the room sent.
     2. Pressing it opens its menu, and the menu says the same words where it would list actions, not a bare "No actions now".
     3. A permanent with no reason, and nothing to do, still says what it always said.
     4. Table, Focus and 3D.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-elked-why.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-elked-why", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "elkwhy01";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const why = (name) => `${name} lost all abilities to Oko, Thief of Crowns, so it has nothing to activate. Use another permanent; the abilities come back only if that effect ends.`;
/* Our permanents the sample's decision offers nothing (the 3D camera overlaps some, so the one the pointer reaches is picked below). */
const offered = new Set(sample.decision.options.map((o) => o.cardId));
const NOTHING = sample.state.players[0].zones.Battlefield.cards.filter((c) => !offered.has(c.cardId) && !c.types.includes("Land"));
const PLAIN = 469;   /* an Island */
let checks = 0, rev = 970000, ELKED = NOTHING[0].cardId, WHY = why(NOTHING[0].name);
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

function viewWith(why) {
  const v = structuredClone(sample);
  for (const c of v.state.players[0].zones.Battlefield.cards) { delete c.why; if (why && c.cardId === ELKED) c.why = why; }
  return v;
}

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
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.send(JSON.stringify({type: "view", view: sample}));});
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(600);
    const show = async (view) => {view.revision = ++rev; sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(600);};
    const sel = (id) => `#cm-board button.cm-bcard[data-card="${id}"]`;
    const label = (id) => page.$eval(sel(id), (b) => b.getAttribute("aria-label"));
    const reachable = (id) => page.evaluate((s) => {
      const b = document.querySelector(s);
      if (!b) return null;
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return r.width > 20 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y)?.closest("button.cm-bcard[data-card]") === b ? {x, y} : null;
    }, sel(id));
    const menuAt = async (id) => {
      const at = await reachable(id);
      if (!at) return null;
      await page.mouse.move(at.x, at.y);
      await page.mouse.click(at.x, at.y, {button: "right"});
      await page.locator("#cm-card-menu").waitFor({timeout: 5000});
      return page.$eval("#cm-card-menu", (m) => m.textContent.replace(/\s+/g, " ").trim());
    };

    await show(viewWith(null));
    ELKED = null;
    for (const c of NOTHING) if (ELKED === null && await reachable(c.cardId)) { ELKED = c.cardId; WHY = why(c.name); }
    ok(ELKED !== null, `${mode}: a permanent of ours that is offered nothing can be reached by the pointer`);
    ok(!(await label(ELKED)).includes("lost all abilities"), `${mode}: with no reason from the room, the card says none`);

    await show(viewWith(WHY));
    ok((await label(ELKED)).includes(WHY), `${mode}: the Elked card's label carries the room's words (${await label(ELKED)})`);
    ok(!(await label(PLAIN)).includes("lost all abilities"), `${mode}: and an ordinary card's does not`);
    const text = await menuAt(ELKED);
    ok(text !== null, `${mode}: the Elked card can be reached by the pointer`);
    ok(text.includes(WHY), `${mode}: its menu says why it offers nothing, in the same words (${text})`);
    ok(!text.includes("No actions now"), `${mode}: and not a bare "No actions now"`);
    await page.keyboard.press("Escape"); await page.mouse.move(2, 2); await page.waitForTimeout(300);

    await show(viewWith(null));
    const plain = await menuAt(ELKED);
    ok(plain !== null && plain.includes("No actions now") && !plain.includes("lost all abilities"), `${mode}: with no reason, the menu says what it always said (${plain})`);
    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-elked-why: ${checks} checks passed -- a permanent that lost its abilities says so, to whom, and what to do, in its label and its menu in Table, Focus and 3D.`);
} finally {
  await close();
}
