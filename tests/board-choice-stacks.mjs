/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE SAME CARD, ONE STACK; THE QUESTION NEVER COVERED (Rob, 2026-10-25; crankmagic-board.js, crankmagic-stage.css).

     1. In a question that asks for one or many, options that say the same and stand for the same card are one button, ×N
        ("Island ×21" for a library search). A click takes one; a click again puts it back.
     2. Where the question takes more than one, the stack has a number beside it: how many of it, never more than the stack
        holds or the question still allows. A card on its own has none.
     3. Identical means identical: two Goblins on the table, one tapped, are two buttons; untapped both, one stack ×2.
     4. The cards another seat plays, held up for ten seconds, stand beside the question, never over its controls, in every
        view, at every window size -- moved, not lost.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-choice-stacks.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-choice-stacks", flag: "GEOMETRY_REQUIRED"});
const views = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views;
const sample = views[13], search = views[15];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "stacks001";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};

let checks = 0, rev = 500000;
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
/* The library search (views[15]: "Search your library", 0 to 1, 21 Islands), as a fresh revision of this match. */
function asked(change = (v) => v) {
  const v = structuredClone(search);
  v.matchId = sample.matchId; v.revision = ++rev; v.decision = {...v.decision, id: `${v.decision.id}:${rev}`};
  return change(v);
}
const chosen = (page) => page.locator("#cm-board-decision .cm-board-decision-foot .cm-muted").textContent();
const stacks = (page) => page.$$eval("#cm-board-decision [data-action=board-option-same]", (bs) => bs.map((b) => ({words: b.textContent.replace(/\s+/g, " ").trim(), ids: b.dataset.same.split(",").map(Number), pressed: b.getAttribute("aria-pressed")})));

try {
  for (const mode of ["focus", "full"]) {
    const {page, context, errors, show, acts} = await board(mode);

    /* ---- 1. one stack for the same card, a click takes one ---- */
    await show(asked());
    const islands = search.decision.options.filter((o) => o.label === "Island").length;
    eq(await stacks(page), [{words: `Island ×${islands}`, ids: search.decision.options.map((o) => o.index), pressed: "false"}], `${mode}: the ${islands} Islands a library search offers are one stack, Island ×${islands}`);
    eq(await page.locator("#cm-board-decision [data-action=board-option]").count(), 0, `${mode}: and no Island is a button of its own`);
    eq(await page.locator("#cm-board-decision .cm-board-same-count").count(), 0, `${mode}: a question that takes one has no how-many`);
    await page.locator("#cm-board-decision [data-action=board-option-same]").click();
    eq([(await stacks(page))[0].pressed, await chosen(page)], ["true", "1 chosen · 0 to 1"], `${mode}: a click on the stack takes one`);
    await page.locator("#cm-board-decision [data-action=board-option-same]").click();
    eq(await chosen(page), "0 chosen · 0 to 1", `${mode}: a click again puts it back`);
    await page.locator("#cm-board-decision [data-action=board-option-same]").click();
    await page.locator("#cm-board-decision [data-action=board-confirm]").click();
    await page.waitForTimeout(200);
    const one = acts().at(-1)?.indices || [];
    ok(one.length === 1 && search.decision.options.find((o) => o.index === one[0])?.label === "Island", `${mode}: Confirm sends one Island (${JSON.stringify(one)})`);

    /* ---- 2. how many, where more than one may be taken ---- */
    const three = asked((v) => {
      v.decision = {...v.decision, min: 0, max: 3, options: v.decision.options.map((o, i) => ({...o, label: i < 2 ? "Forest" : i === 2 ? "Plains" : "Island"}))};
      return v;
    });
    await show(three);
    const s = await stacks(page);
    eq(s.map((x) => x.words), ["Forest ×2", `Island ×${three.decision.options.length - 3}`], `${mode}: a question of up to 3 stacks its Forests and Islands`);
    eq(await page.locator("#cm-board-decision [data-action=board-option]").allTextContents(), ["Plains"], `${mode}: the one Plains is a button of its own, with no how-many`);
    const counts = page.locator("#cm-board-decision .cm-board-same-count");
    eq(await counts.count(), 2, `${mode}: each stack has its how-many`);
    eq(await counts.evaluateAll((els) => els.map((el) => [el.min, el.max, el.value])), [["0", "2", "0"], ["0", "3", "0"]], `${mode}: from none to as many as the stack holds and the question allows`);
    const island = counts.nth(1);
    await island.fill("3");
    await page.waitForTimeout(150);
    eq(await chosen(page), "3 chosen · 0 to 3", `${mode}: three Islands, set by their number`);
    eq(await counts.evaluateAll((els) => els.map((el) => [el.max, el.value])), [["0", "0"], ["3", "3"]], `${mode}: and the Forests can take none more`);
    await page.locator("#cm-board-decision .cm-board-same-count").nth(1).fill("2");
    await page.waitForTimeout(150);
    await page.locator("#cm-board-decision [data-action=board-option-same]").first().click();
    eq([await chosen(page), await page.locator("#cm-board-decision .cm-board-same-count").first().inputValue()], ["3 chosen · 0 to 3", "1"], `${mode}: two Islands, then the Forests' click takes one Forest`);
    if (process.env.UAT_SHOTS) await page.screenshot({path: path.join(process.env.UAT_SHOTS, `choice-stacks-${mode}.png`)});
    await page.locator("#cm-board-decision .cm-board-same-count").nth(1).fill("9");
    await page.waitForTimeout(150);
    eq(await chosen(page), "3 chosen · 0 to 3", `${mode}: a number past what the question allows takes no more than it allows`);
    await page.locator("#cm-board-decision [data-action=board-confirm]").click();
    await page.waitForTimeout(200);
    const sent = acts().at(-1)?.indices || [];
    const names = sent.map((i) => three.decision.options.find((o) => o.index === i)?.label).sort();
    eq([names, new Set(sent).size], [["Forest", "Island", "Island"], 3], `${mode}: Confirm sends three different options, one Forest and two Islands (${JSON.stringify(sent)})`);

    /* ---- 3. identical means identical: a tapped Goblin is not an untapped one ---- */
    const goblins = (tapped) => asked((v) => {
      const me = v.state.players[v.seat], base = me.zones.Battlefield.cards[0];
      me.zones.Battlefield.cards.push({...base, cardId: 7001, name: "Goblin", tapped: false, counters: {}}, {...base, cardId: 7002, name: "Goblin", tapped, counters: {}});
      me.zones.Battlefield.count += 2;
      v.decision = {...v.decision, title: "Sacrifice a Goblin", min: 1, max: 1, options: [{index: 0, label: "Goblin", cardId: 7001}, {index: 1, label: "Goblin", cardId: 7002}]};
      return v;
    });
    await show(goblins(true));
    eq([await page.locator("#cm-board-decision [data-action=board-option]").count(), (await stacks(page)).length], [2, 0], `${mode}: two Goblins, one of them tapped, are two choices`);
    await show(goblins(false));
    eq((await stacks(page)).map((x) => x.words), ["Goblin ×2"], `${mode}: untapped both, they are one stack`);

    eq(errors, [], `${mode}: no page error`);
    await context.close();
  }

  /* ---- 4. the cards the others play stand beside the question, never over it ---- */
  for (const mode of ["focus", "full", "table"]) for (const [width, height] of [[1280, 720], [1440, 900], [1024, 768]]) {
    const {page, context, errors, show} = await board(mode, {width, height});
    await show(asked((v) => {
      v.events = [1, 2, 3].map((n) => ({eventId: `event:s${rev}${n}`, kind: "cast", player: (v.seat + n) % 4, card: {cardId: 9100 + n, name: "Lightning Bolt"}, stackId: n}));
      return v;
    }));
    await page.waitForTimeout(300);
    const geo = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect(), pops = [...document.querySelectorAll("#cm-board-plays .cm-play-pop")].map(box);
      const controls = [...document.querySelectorAll("#cm-board-decision :is(button, input, select, textarea), .cm-stage-actions :is(button, [data-action])")]
        .filter((el) => !el.disabled).map(box).filter((r) => r.width && r.height);
      const covered = pops.filter((p) => controls.some((r) => p.left < r.right && p.right > r.left && p.top < r.bottom && p.bottom > r.top)).length;
      const ask = document.getElementById("cm-board-decision");
      return {pops: pops.length, controls: controls.length, covered, past: !ask || pops.every((p) => p.right <= box(ask).left || p.left >= box(ask).right || p.bottom <= box(ask).top || p.top >= box(ask).bottom)};
    });
    eq([geo.pops, geo.covered], [3, 0], `${mode} ${width}x${height}: the three cards played are held up, and none covers the question's ${geo.controls} controls`);
    ok(geo.past, `${mode} ${width}x${height}: they stand outside the question`);
    eq(errors, [], `${mode} ${width}x${height}: no page error`);
    await context.close();
  }
} finally {await close();}
console.log(`board-choice-stacks: ${checks} checks passed — the same card one stack, ×N, taken by a click or by how many; a tapped Goblin no twin of an untapped one; and the cards others play held up beside the question, never over it.`);
