/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   CONFIRM ON AN "UP TO" / "ANY NUMBER" TARGET QUESTION (ROB-204, Luke's playtest of 2026-10-28; BUG-01, a blocker).

   A counted target is asked as `choose-targets:...`, mode "many" (game/engine/script/bind.mjs `countedChoice`): "exile up to
   one target creature you control" is min 0, max 1; Brago's "any number of target nonland permanents you control" is min 0,
   max as many as there are. The board showed "1 chosen · 0 to 1" and a Confirm that lit on hover and sent nothing: the
   handler returned early for every target question the player had not stepped through Next, and a pick-several has no Next.

   Luke's two games ended on it. The test is the one the issue names, "select a target, click Confirm, watch the network
   tab": what the client sends on the table's socket.

     1. Up to one: one pick, Confirm -> an `act` with that index. (The shape the issue gives for Claim Jumper.)
     2. Any number (Brago): one pick, several picks, and none at all, each Confirm -> an `act` with exactly those indices.
     3. The count still holds: more than the question's max is refused and sends nothing.
     4. A single required target keeps its steps: Pick, Next, Review, then Confirm; Confirm before Next sends nothing.
     5. Claim Jumper's own optional 0 to 1 library search (not a target question) confirms with one card or none.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-optional-count-targets.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-optional-count-targets", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13], counted = views[23], search = views[15];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "optcount01";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};

let checks = 0, rev = 700000;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

async function board(mode, {width = 1440, height = 900} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [], sent = [];
  let sock = null;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => {sock = ws; ws.onMessage((m) => sent.push(JSON.parse(m))); ws.send(JSON.stringify({type: "view", view: sample}));});
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator("#cm-board").waitFor({timeout: 20000});
  await page.waitForTimeout(600);
  const show = async (view) => {sock.send(JSON.stringify({type: "receipt", receipt: {}})); sock.send(JSON.stringify({type: "view", view})); await page.waitForTimeout(450);};
  const acts = () => sent.filter((x) => x.type === "act");
  return {page, context, errors, show, acts};
}

/* The sample's counted-target question (views[23]: 5 targets, 0 to 2) as a fresh revision with the count the card says. */
function asked({min, max, id}) {
  const v = structuredClone(counted);
  v.matchId = sample.matchId; v.revision = ++rev;
  v.decision = {...v.decision, id: `${id}:${rev}`, min, max};
  return v;
}
/* A required single target, asked as a trigger's targets one at a time (mode "one"): Pick, Next, Review, Confirm. */
function single() {
  const v = structuredClone(counted);
  v.matchId = sample.matchId; v.revision = ++rev;
  v.decision = {...v.decision, id: `trigger-targets:453:${rev}`, mode: "one", min: 1, max: 1, title: "Rime Chill: choose a target"};
  return v;
}
/* The library search (views[15]: 0 to 1, 21 Islands) -- Claim Jumper's own "you may search your library for a Plains card". */
function searching() {
  const v = structuredClone(search);
  v.matchId = sample.matchId; v.revision = ++rev; v.decision = {...v.decision, id: `${v.decision.id}:${rev}`};
  return v;
}
const pickOption = async (page, index) => page.locator(`#cm-board-decision [data-action=board-option][data-index="${index}"]`).first().click();
const confirm = (page) => page.locator("#cm-board-decision [data-action=board-confirm]").first();
const settle = (page) => page.waitForTimeout(350);

try {
  for (const mode of ["focus", "full"]) {
    const {page, context, errors, show, acts} = await board(mode);

    /* ---- 1. "exile up to one target creature you control": min 0, max 1 ---- */
    await show(asked({min: 0, max: 1, id: "choose-targets:453:0"}));
    await pickOption(page, 2);
    ok(/1 chosen/.test(await page.locator("#cm-board-decision .cm-board-decision-foot .cm-muted").textContent()), `${mode}: the pick is counted, 1 chosen`);
    ok(await confirm(page).isEnabled(), `${mode}: Confirm is lit with one of "up to one" chosen`);
    await confirm(page).click(); await settle(page);
    eq(acts().length, 1, `${mode}: up to one, one chosen: Confirm sends the answer (the network tab shows one request)`);
    eq(acts()[0].indices, [2], `${mode}: and it is the one chosen`);

    /* ---- 2. "any number of target nonland permanents you control" (Brago): one, several, none ---- */
    await show(asked({min: 0, max: 5, id: "choose-targets:453:0"}));
    await pickOption(page, 4);
    await confirm(page).click(); await settle(page);
    eq(acts().length, 2, `${mode}: any number, one chosen: Confirm sends the answer`);
    eq(acts()[1].indices, [4], `${mode}: the one chosen`);

    await show(asked({min: 0, max: 5, id: "choose-targets:453:0"}));
    for (const i of [0, 1, 3]) await pickOption(page, i);
    await confirm(page).click(); await settle(page);
    eq(acts().length, 3, `${mode}: any number, three chosen: Confirm sends the answer`);
    eq([...acts()[2].indices].sort(), [0, 1, 3], `${mode}: the three chosen`);

    await show(asked({min: 0, max: 5, id: "choose-targets:453:0"}));
    ok(await confirm(page).isEnabled(), `${mode}: Confirm is lit with none chosen, because none is a legal number`);
    await confirm(page).click(); await settle(page);
    eq(acts().length, 4, `${mode}: any number, none chosen: Confirm sends the answer (a zero-target submit)`);
    eq(acts()[3].indices, [], `${mode}: an empty answer`);

    /* ---- 3. the count still holds ---- */
    await show(asked({min: 0, max: 1, id: "choose-targets:453:0"}));
    await pickOption(page, 0); await pickOption(page, 1);
    ok(/1 chosen/.test(await page.locator("#cm-board-decision .cm-board-decision-foot .cm-muted").textContent()), `${mode}: a second pick of "up to one" replaces the first, 1 chosen`);
    await show(asked({min: 0, max: 2, id: "choose-targets:453:0"}));
    for (const i of [0, 1, 2]) await pickOption(page, i);
    ok(await confirm(page).isDisabled(), `${mode}: three chosen of "up to two": Confirm is off`);
    await confirm(page).click({force: true}).catch(() => {}); await settle(page);
    eq(acts().length, 4, `${mode}: and nothing is sent`);
    await show(asked({min: 1, max: 2, id: "choose-targets:453:0"}));
    ok(await confirm(page).isDisabled(), `${mode}: none chosen of "one or two": Confirm is off, a minimum of one is not met`);
    await page.evaluate(() => document.querySelector("#cm-board-decision [data-action=board-confirm]")?.click()); await settle(page);
    eq(acts().length, 4, `${mode}: and nothing is sent`);

    /* ---- 4. one required target keeps its steps ---- */
    await show(single());
    await pickOption(page, 1);
    ok(await page.locator("#cm-board-decision [data-action=board-target-next]").count() === 1, `${mode}: a single required target still goes Pick, then Next`);
    await page.evaluate(() => document.querySelector("#cm-board-decision [data-action=board-confirm]")?.click());
    await settle(page);
    eq(acts().length, 4, `${mode}: Confirm before Next sends nothing on a single required target`);
    await page.locator("#cm-board-decision [data-action=board-target-next]").click(); await settle(page);
    await confirm(page).click(); await settle(page);
    eq(acts().length, 5, `${mode}: after Review, Confirm sends the single target`);
    eq(acts()[4].indices, [1], `${mode}: the one picked`);

    /* ---- 5. Claim Jumper's own optional search (0 to 1, not a target question) ---- */
    await show(searching());
    await page.locator("#cm-board-decision [data-action=board-option-same], #cm-board-decision [data-action=board-option]").first().click();
    await confirm(page).click(); await settle(page);
    eq(acts().length, 6, `${mode}: a 0 to 1 library search, one chosen: Confirm sends the answer`);
    eq(acts()[5].indices.length, 1, `${mode}: one card`);
    await show(searching());
    await confirm(page).click(); await settle(page);
    eq(acts().length, 7, `${mode}: a 0 to 1 library search, none chosen (decline the search): Confirm sends the answer`);
    eq(acts()[6].indices, [], `${mode}: an empty answer`);

    eq(errors, [], `${mode}: no page error`);
    await context.close();
  }
  console.log(`board-optional-count-targets: ${checks} checks passed -- "up to one" and "any number" target questions confirm with one, several or none chosen; the count and the single target's steps still hold.`);
} finally {
  await close();
}
