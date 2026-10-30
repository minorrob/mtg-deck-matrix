/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   A PERMANENT OKO TURNED INTO AN ELK IS DRAWN AS THE ELK (ROB-329, Rob's playtest of 2026-10-30: "turning an artifact into a 3/3
   green Elk creature, you didn't change the card art to that token image"; crankmagic-board.js `pictureOf`; the view's
   `appearance`, docs/ui-lane/view-appearance-contract.md, tests/room-view-appearance.mjs).

     1. An artifact the view says looks like an Elk is drawn from the Elk token's picture, keeps its own name on the card,
        wears a mark and says what it looks like in its label.
     2. A creature the same.
     3. The effect ends (the next view has no `appearance`): the original picture is back, with no mark and no word of it.
     4. An ordinary card is untouched.
     5. The hover's pop-up shows the same picture as the card.
     6. The original art is one press away: the card's menu offers it, and the inspector then draws the card's own picture.
     7. A look with no picture of its own (the token cannot be fetched) falls back to the card's art rather than nothing.
     8. Every view agrees: Table, Focus and 3D.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-oko-elk-art.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-oko-elk-art", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "elkart01";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const ELK = {token: "Elk", colors: ["G"], subtypes: ["Elk"], power: 3, toughness: 3};
const CHALICE = 461, BIRD = 485, ISLAND = 469;
let checks = 0, rev = 960000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

/* Our seat's Chalice (an artifact) and Thrummingbird (a creature), each looking like the given token, or as they are. */
function viewWith(looks) {
  const v = structuredClone(sample);
  for (const c of v.state.players[0].zones.Battlefield.cards) {
    delete c.appearance;
    if (looks[c.cardId]) {
      c.appearance = looks[c.cardId];
      if (!c.types.includes("Creature")) c.types = [...c.types, "Creature"];
      c.power = 3; c.toughness = 3; c.keywords = [];
    }
  }
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
    /* Every picture is a 1-pixel image, judged by its src, except a token nobody made art for. */
    await page.route(/^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, (r) => /exact=Zorbling/.test(r.request().url())
      ? r.fulfill({status: 404, contentType: "application/json", body: "{}"}) : r.fulfill({contentType: "image/png", body: PIXEL}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.send(JSON.stringify({type: "view", view: sample}));});
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(600);
    const show = async (view) => {view.revision = ++rev; sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(600);};
    const sel = (id) => `#cm-board button.cm-bcard[data-card="${id}"]`;
    const srcOf = (id) => page.$eval(`${sel(id)} img`, (img) => img.getAttribute("src"));
    const reachable = (id) => page.evaluate((s) => {
      const b = document.querySelector(s);
      if (!b) return null;
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return r.width > 20 && x > 0 && y > 0 && x < innerWidth && y < innerHeight && document.elementFromPoint(x, y)?.closest("button.cm-bcard[data-card]") === b ? {x, y} : null;
    }, sel(id));
    const peeked = () => page.$$eval("#cm-board-peek img", (is) => is.map((i) => i.getAttribute("src")));

    /* Their own pictures first: the library's record where it has one, else a request by name. */
    await show(viewWith({}));
    const own = {};
    /* The pointer needs a card to reach (3D overlaps some): the first of our permanents it can, which also looks like an Elk. */
    let probe = null;
    for (const c of sample.state.players[0].zones.Battlefield.cards) if (probe === null && !c.types.includes("Land") && await reachable(c.cardId)) probe = c.cardId;
    ok(probe !== null, `${mode}: a nonland permanent of ours can be reached by the pointer`);
    for (const id of [CHALICE, BIRD, ISLAND, probe]) own[id] = await srcOf(id);
    ok(own[CHALICE] !== own[BIRD] && own[BIRD] !== own[ISLAND] && !/exact=Elk/.test(Object.values(own).join(" ")), `${mode}: before any effect each card has its own picture`);

    /* ---- 1 and 2. an artifact and a creature that look like an Elk ---- */
    const LOOKS = {[CHALICE]: ELK, [BIRD]: ELK, [probe]: ELK};
    await show(viewWith(LOOKS));
    for (const [id, name] of [[CHALICE, "Everflowing Chalice"], [BIRD, "Thrummingbird"]]) {
      const src = await srcOf(id);
      ok(/exact=Elk(&|$)/.test(src) && src !== own[id], `${mode}: ${name} is drawn from the Elk token's picture (${src})`);
      ok((await page.$eval(`${sel(id)} .cm-bcard-name`, (n) => n.textContent)) === name, `${mode}: and keeps its own name on the card`);
      ok((await page.$eval(`${sel(id)} .cm-bcard-mark.is-look`, (n) => n.textContent)).includes("Elk"), `${mode}: and wears a mark that it looks like an Elk`);
      const label = await page.$eval(sel(id), (b) => b.getAttribute("aria-label"));
      ok(label.startsWith(name) && label.includes("looks like a 3/3 green Elk"), `${mode}: and says so in its label (${label})`);
    }

    /* ---- 4. an ordinary card is untouched ---- */
    ok((await srcOf(ISLAND)) === own[ISLAND], `${mode}: an Island is still drawn from its own picture`);
    ok((await page.locator(`${sel(ISLAND)} .cm-bcard-mark.is-look`).count()) === 0, `${mode}: and carries no look mark`);

    /* ---- 5. the hover shows the same picture ---- */
    const which = probe, at = await reachable(probe);
    ok(at, `${mode}: the Elk-looking card can still be reached`);
    await page.mouse.move(2, 2);
    await page.mouse.move(at.x - 3, at.y); await page.mouse.move(at.x, at.y); await page.waitForTimeout(800);
    ok(JSON.stringify(await peeked()) === JSON.stringify([await srcOf(which)]), `${mode}: the hover's pop-up shows the same Elk picture (${JSON.stringify(await peeked())})`);
    await page.mouse.move(2, 2); await page.waitForTimeout(500);

    /* ---- 6. the original art is one press away ---- */
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y, {button: "right"});
    await page.locator("#cm-card-menu").waitFor({timeout: 5000});
    const read = await page.$eval("#cm-card-menu [data-action=board-card-menu-view] img", (i) => i.getAttribute("src"));
    ok(/exact=Elk(&|$)/.test(read), `${mode}: the menu's Read draws the Elk (${read})`);
    const original = page.locator("#cm-card-menu [data-action=board-card-menu-original]");
    ok(await original.count() === 1, `${mode}: the menu offers the original card`);
    ok((await original.locator("img").getAttribute("src")) === own[which], `${mode}: with the card's own picture`);
    await original.click();
    await page.locator("#cm-card-inspector img").first().waitFor({timeout: 5000});
    const inspected = await page.$eval("#cm-card-inspector img", (i) => i.getAttribute("src"));
    ok(inspected === own[which], `${mode}: the inspector draws the original, not the Elk (${inspected})`);
    ok((await page.locator("#cm-card-inspector .cm-bcard-mark.is-look").count()) === 0, `${mode}: and says nothing of a look`);
    await page.locator("[data-action=board-inspect-close]").click();
    await page.waitForTimeout(300);

    /* ---- 7. a look with no picture of its own ---- */
    await show(viewWith({[BIRD]: {...ELK, token: "Zorbling"}}));
    await page.waitForFunction(([s, want]) => { const i = document.querySelector(s); return i && i.getAttribute("src") === want; }, [`${sel(BIRD)} img`, own[BIRD]], {timeout: 5000});
    ok((await srcOf(BIRD)) === own[BIRD], `${mode}: a token with no picture falls back to the card's own art`);

    /* ---- 3. the effect ends ---- */
    await show(viewWith(LOOKS));
    ok(/exact=Elk(&|$)/.test(await srcOf(CHALICE)), `${mode}: (the Elk again)`);
    await show(viewWith({}));
    for (const [id, name] of [[CHALICE, "Everflowing Chalice"], [BIRD, "Thrummingbird"]]) {
      ok((await srcOf(id)) === own[id], `${mode}: the effect over, ${name} is drawn from its own picture again`);
      ok((await page.locator(`${sel(id)} .cm-bcard-mark.is-look`).count()) === 0, `${mode}: and the mark is gone`);
      ok(!(await page.$eval(sel(id), (b) => b.getAttribute("aria-label"))).includes("looks like"), `${mode}: and so is the word`);
    }
    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-oko-elk-art: ${checks} checks passed -- a permanent that looks like an Elk is drawn from the Elk token in Table, Focus and 3D, in its hover and its pop-up, with its own name and its original one press away, and an ordinary card never changes.`);
} finally {
  await close();
}
