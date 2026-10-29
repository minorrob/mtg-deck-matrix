/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE BOARD DRAWS THE FACE THAT WAS PLAYED (ROB-207, Luke's playtest of 2026-10-28; BUG-05; crankmagic-board.js `pictureOf`).

   Luke played Mistgate Pathway and the board drew Hengegate Pathway: the view's name was right, but the picture was looked up
   by that name, which draws the front of the card. The view now says `face: "back"` (tests/room-view-face.mjs) and the board
   asks for the back of that card.

     1. A land the view says is up on its back face is drawn from the back: its picture asks Scryfall for `face=back`.
     2. The same card played as its front face is drawn as it always was, with no `face=back`.
     3. A card with no `face` at all is untouched.
     4. Every view agrees: Table, Focus and 3D draw the same picture.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-modal-face.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-modal-face", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "mdfc001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

/* The sample's first battlefield card of seat 0, made a Pathway played as the given face. */
function viewWith(name, face) {
  const v = structuredClone(sample);
  const card = v.state.players[0].zones.Battlefield.cards.find((c) => c.types.includes("Land")) ?? v.state.players[0].zones.Battlefield.cards[0];
  Object.assign(card, {name, types: ["Land"], power: null, toughness: null, tapped: false});
  delete card.face;
  if (face) card.face = face;
  return {v, id: card.cardId};
}
const srcOf = (page, id) => page.$eval(`#cm-board button.cm-bcard[data-card="${id}"] img`, (img) => img.getAttribute("src"));

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
    /* Every picture is a 1-pixel image: what is asked is judged from the src, and the board drops a picture that fails to load. */
    const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    await page.route(/^https:\/\/(api\.scryfall\.com|cards\.scryfall\.io)\//, (r) => r.fulfill({contentType: "image/png", body: PIXEL}));
    await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.send(JSON.stringify({type: "view", view: sample}));});
    await page.goto(`${base}/index.html#table?id=${TABLE}`);
    await page.locator("#cm-board").waitFor({timeout: 20000});
    await page.waitForTimeout(600);
    let rev = 900000;
    const show = async (view) => {view.revision = ++rev; sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(500);};

    const back = viewWith("Mistgate Pathway", "back");
    await show(back.v);
    const backSrc = await srcOf(page, back.id);
    ok(/exact=Mistgate%20Pathway/.test(backSrc) && /[?&]face=back(&|$)/.test(backSrc), `${mode}: played as its back face, the picture asks for the back (${backSrc})`);

    const front = viewWith("Hengegate Pathway", null);
    await show(front.v);
    const frontSrc = await srcOf(page, front.id);
    ok(!/face=back/.test(frontSrc), `${mode}: played as its front face, no back is asked for (${frontSrc})`);

    const plain = viewWith("Forest", null);
    await show(plain.v);
    ok(!/face=back/.test(await srcOf(page, plain.id)), `${mode}: a card with no face is untouched`);
    ok(errors.length === 0, `${mode}: no page error (${errors[0] || "none"})`);
    await context.close();
  }
  console.log(`board-modal-face: ${checks} checks passed -- a double-faced land played as its back face is drawn from the back in Table, Focus and 3D; played as its front, or not double-faced, nothing changes.`);
} finally {
  await close();
}
