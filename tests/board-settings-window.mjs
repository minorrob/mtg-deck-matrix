/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   ROB'S TWO PLAY NOTES OF OCT 25, 2026 (crankmagic-board.js, crankmagic-stage.css).

     1. Camera ▾ closes on a press anywhere outside it -- the board, the table, the header -- and stays open for a
        press inside it.
     2. Settings (Camera ▾ › Play settings) is a window: the app's dialog, ✕ at its top right, Cancel and Save at its bottom
        right, sized to the browser at every size and again when the window changes size. Save keeps what is set;
        Cancel, ✕ and Escape put back what was set when it opened.
     3. (Oct 26) Its sections run down the left -- General, Video, Audio, Gameplay -- and the chosen one uses the
        window's whole width and fits it without scrolling on a desktop; below 640 px the tabs run across the top.

   GEOMETRY_REQUIRED=1 refuses a missing browser.
     node tests/board-settings-window.mjs
*/
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {openBrowser, ROOT} from "./uat/browser-runner.mjs";

const {browser, base, stub, close} = await openBrowser({name: "board-settings-window", flag: "GEOMETRY_REQUIRED"});
const sample = JSON.parse(readFileSync(path.join(ROOT, "docs/reference/replit-sample-views.json"), "utf8")).views[13];
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
const TABLE = "settings01";
const table = {tableId: TABLE, phase: "playing", matchId: sample.matchId, away: [], blockers: [], youAreHost: true, rules: {},
  seats: sample.state.players.map((p) => ({seatId: p.playerId, name: p.name, kind: p.playerId === sample.seat ? "human" : "ai", you: p.playerId === sample.seat, occupied: true, ready: true, mat: "felt"}))};

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

async function board(mode, {width = 1440, height = 900} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: "reduce", serviceWorkers: "block"});
  await context.addInitScript((m) => {localStorage.setItem("cm-board-view", m); localStorage.setItem("crankmagic-audio-muted", "true");}, mode);
  const page = await context.newPage();
  if (stub) await stub(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: "rob@example.com"}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, (r) => r.fulfill({json: {table, now: Date.now()}}));
  await page.routeWebSocket(new RegExp(`/api/tables/${TABLE}/connect$`), (ws) => ws.send(JSON.stringify({type: "view", view: sample})));
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator("#cm-board [data-action=board-profile]").first().waitFor({timeout: 20000});
  await page.waitForTimeout(300);
  return {page, context, errors};
}
const cameraOpen = (page) => page.locator("#cm-board .cm-stage-camera>div").count();
const settingsOpen = (page) => page.evaluate(() => !!document.querySelector("#cm-dialog.cm-play-settings-dialog[open] #cm-board-tools"));
async function openSettings(page) {
  await page.locator("#cm-board [data-action=board-camera]").first().click();
  await page.locator("#cm-board [data-action=board-tools]").first().click();
  await page.locator("#cm-dialog[open] #cm-board-tools").waitFor({timeout: 5000});
}
const tab = async (page, id) => {await page.locator(`#cm-dialog [role=tab][data-tab=${id}]`).click(); await page.waitForTimeout(50);};
const SECTIONS = ["general", "video", "audio", "gameplay"];
/* Where the window and its parts are, against the browser's own size. */
const layout = (page) => page.evaluate(() => {
  const r = (el) => {const b = el.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom};};
  const d = document.getElementById("cm-dialog"), body = d.querySelector("#cm-board-tools");
  const buttons = [...d.querySelectorAll(".cm-play-settings-foot .v-button")];
  return {vw: innerWidth, vh: innerHeight, dialog: r(d), close: r(d.querySelector(".cm-dialog-close")), foot: buttons.map((el) => ({text: el.textContent.trim(), ...r(el)})),
    body: r(body), pageScroll: document.documentElement.scrollWidth > innerWidth + 1,
    tabs: [...d.querySelectorAll(".cm-tabbed-nav [role=tab]")].map((el) => ({tab: el.dataset.tab, selected: el.getAttribute("aria-selected"), ...r(el)})),
    panel: (() => {const p = d.querySelector(".cm-tabbed-panel:not([hidden])"), box = d.querySelector(".cm-tabbed-panels");
      return {tab: p?.dataset.tabPanel, ...r(box), scrolls: box.scrollHeight > box.clientHeight + 1, shown: d.querySelectorAll(".cm-tabbed-panel:not([hidden])").length};})()};
});

try {
  /* ---- 1. Camera ▾ closes on a press outside it ---- */
  for (const mode of ["table", "focus", "full"]) {
    const {page, context, errors} = await board(mode);
    await page.locator("#cm-board [data-action=board-camera]").click();
    eq(await cameraOpen(page), 1, `${mode}: Camera ▾ opens`);
    await page.locator("#cm-board .cm-stage-camera>div input[type=range]").first().click();
    eq(await cameraOpen(page), 1, `${mode}: a press inside Camera keeps it open`);
    const spot = await page.evaluate(() => {
      const el = document.querySelector("#cm-board .cm-board-turn") || document.querySelector("#cm-board .cm-stage-top");
      const b = el.getBoundingClientRect(); return {x: b.left + 4, y: b.top + b.height / 2};
    });
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(150);
    eq(await cameraOpen(page), 0, `${mode}: a press on the board outside Camera closes it`);
    eq(await page.locator("#cm-board [data-action=board-camera]").getAttribute("aria-expanded"), "false", `${mode}: and its button says it is closed`);
    await page.locator("#cm-board [data-action=board-camera]").click();
    eq(await cameraOpen(page), 1, `${mode}: it opens again after`);
    const far = await page.evaluate(() => {
      const el = document.querySelector("#cm-board .cm-stage-canvas, #cm-board .cm-stage-region, #cm-board .cm-board-table, #cm-board .cm-mat") || document.getElementById("cm-board");
      const b = el.getBoundingClientRect(); return {x: b.left + b.width / 2, y: b.top + b.height / 2};
    });
    await page.mouse.click(far.x, far.y);
    await page.waitForTimeout(150);
    eq(await cameraOpen(page), 0, `${mode}: a press on the table closes it too`);
    eq(errors, [], `${mode}: no page error (${errors.join(" | ")})`);
    await context.close();
  }

  /* ---- 2. Settings is a window, sized to the browser ---- */
  for (const [width, height] of [[1440, 900], [1024, 560], [390, 700]]) {
    const at = `${width}x${height}`;
    const {page, context, errors} = await board("focus", {width, height});
    await openSettings(page);
    ok(await settingsOpen(page), `${at}: Settings opens as a window`);
    eq(await page.locator("#cm-board .cm-stage-camera>div").count(), 0, `${at}: Camera closes behind the settings window`);
    const L = await layout(page);
    ok(L.dialog.l >= 0 && L.dialog.t >= 0 && L.dialog.r <= L.vw && L.dialog.b <= L.vh, `${at}: the window fits the browser (${JSON.stringify(L.dialog)})`);
    ok(!L.pageScroll, `${at}: no sideways scroll`);
    ok(L.close.r >= L.dialog.r - 40 && L.close.t <= L.dialog.t + 40, `${at}: ✕ at its top right (${JSON.stringify(L.close)})`);
    eq(L.foot.map((f) => f.text), ["Cancel", "Save"], `${at}: Cancel and Save in its foot, Save last`);
    ok(L.foot.every((f) => f.b <= L.dialog.b && f.b >= L.dialog.b - 60 && f.b <= L.vh) && L.foot[1].r >= L.dialog.r - 40, `${at}: at its bottom right, in view (${JSON.stringify(L.foot)})`);
    /* the sections, down the left (across the top on a phone), one shown at a time and using the whole width */
    eq(L.tabs.map((t) => t.tab), SECTIONS, `${at}: General, Video, Audio and Gameplay, in that order`);
    if (width > 640) ok(L.tabs.every((t, i) => !i || (t.t > L.tabs[i - 1].t && Math.abs(t.l - L.tabs[0].l) < 2)) && L.tabs[0].l < L.panel.l, `${at}: stacked down the left, beside the section (${JSON.stringify(L.tabs.map((t) => [t.l, t.t]))})`);
    else ok(L.tabs.every((t, i) => !i || Math.abs(t.t - L.tabs[0].t) < 2) && L.tabs[0].b <= L.panel.t, `${at}: across the top on a narrow screen`);
    for (const id of SECTIONS) {
      await tab(page, id);
      const P = (await layout(page)).panel;
      eq([P.tab, P.shown], [id, 1], `${at}: ${id} shows its own section and only that`);
      ok(P.r >= L.dialog.r - 40, `${at}: ${id} reaches the window's right side, not leaving it empty (${P.r} of ${L.dialog.r})`);
      if (width > 640) ok(!P.scrolls, `${at}: ${id} fits the window without scrolling`);
    }
    /* the last control is reachable */
    await tab(page, "gameplay");
    await page.locator("#cm-dialog [data-action=board-concede]").scrollIntoViewIfNeeded();
    const last = await page.evaluate(() => {
      const el = document.querySelector("#cm-dialog [data-action=board-concede]"), b = el.getBoundingClientRect();
      return {inView: b.top >= 0 && b.bottom <= innerHeight, hit: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest("[data-action]") === el};
    });
    ok(last.inView && last.hit, `${at}: the last control (Concede) is in view and can be pressed (${JSON.stringify(last)})`);
    /* the keyboard moves between the sections */
    await page.locator("#cm-dialog [role=tab][data-tab=gameplay]").focus();
    await page.keyboard.press("Home");
    eq(await page.evaluate(() => [document.activeElement?.dataset.tab, document.querySelector("#cm-dialog .cm-tabbed-panel:not([hidden])")?.dataset.tabPanel]), ["general", "general"], `${at}: Home goes to General and shows it`);
    await page.keyboard.press("ArrowDown");
    eq(await page.evaluate(() => document.querySelector("#cm-dialog .cm-tabbed-panel:not([hidden])")?.dataset.tabPanel), "video", `${at}: the down arrow goes to Video`);
    /* reactive: the browser grows smaller with the window open */
    await page.setViewportSize({width: Math.max(360, Math.round(width * 0.7)), height: Math.max(480, Math.round(height * 0.7))});
    await page.waitForTimeout(150);
    const S = await layout(page);
    ok(S.dialog.r <= S.vw && S.dialog.b <= S.vh && S.foot.every((f) => f.b <= S.vh && f.r <= S.vw), `${at}: made smaller while open, the window and its foot still fit (${S.vw}x${S.vh})`);
    eq(errors, [], `${at}: no page error (${errors.join(" | ")})`);
    await context.close();
  }

  /* ---- 3. Save keeps; Cancel, ✕ and Escape put back ---- */
  {
    const {page, context, errors} = await board("focus");
    const hold = () => page.evaluate(() => localStorage.getItem("cm-board-hold"));
    for (const [how, leave] of [["Cancel", (p) => p.locator("#cm-dialog .cm-play-settings-foot [data-action=close]").click()],
      ["✕", (p) => p.locator("#cm-dialog .cm-dialog-close").click()], ["Escape", (p) => p.keyboard.press("Escape")]]) {
      await openSettings(page);
      await tab(page, "gameplay");
      await page.locator("#cm-dialog [data-board-hold]").check();
      eq(await hold(), "on", `${how}: the choice previews as it is made`);
      await leave(page);
      await page.waitForTimeout(150);
      ok(!(await settingsOpen(page)), `${how} closes the window`);
      ok((await hold()) !== "on", `${how} puts back Hold priority after I cast (${await hold()})`);
    }
    await openSettings(page);
    eq(await page.locator("#cm-dialog [role=tab][aria-selected=true]").getAttribute("data-tab"), "gameplay", "opened again, it opens on the section it was left on");
    ok(!(await page.locator("#cm-dialog [data-board-hold]").isChecked()), "and shows what was put back");
    const sfx = await page.locator("#cm-dialog [data-board-sound=sfx]").count();
    await tab(page, "audio");
    if (sfx) {
      const was = await page.locator("#cm-dialog [data-board-sound=sfx]").inputValue();
      await page.locator("#cm-dialog [data-board-sound=sfx]").fill("30");
      await page.locator("#cm-dialog .cm-play-settings-foot [data-action=close]").click();
      await openSettings(page);
      eq(await page.locator("#cm-dialog [data-board-sound=sfx]").inputValue(), was, "Cancel puts back the Effects volume");
    }
    await tab(page, "gameplay");
    await page.locator("#cm-dialog [data-board-hold]").check();
    await page.locator("#cm-dialog [data-action=board-settings-save]").click();
    await page.waitForTimeout(150);
    ok(!(await settingsOpen(page)), "Save closes the window");
    eq(await hold(), "on", "Save keeps Hold priority after I cast");
    await openSettings(page);
    ok(await page.locator("#cm-dialog [data-board-hold]").isChecked(), "opened again, it shows what was saved");
    /* End game's second tap is drawn in the window, in the section it was pressed in */
    await tab(page, "gameplay");
    await page.locator("#cm-dialog [data-action=board-end]").click();
    eq((await page.locator("#cm-dialog [data-action=board-end][data-confirm='1']").textContent()).trim(), "End for everyone · keep the record", "End game asks its second tap inside the window");
    await page.locator("#cm-dialog [data-action=board-end-cancel]").click();
    eq(await page.locator("#cm-dialog [data-action=board-end][data-confirm='1']").count(), 0, "and Keep playing takes it back");
    eq(await page.locator("#cm-dialog [role=tab][aria-selected=true]").getAttribute("data-tab"), "gameplay", "drawn again, the window stays on Gameplay");
    await page.locator("#cm-dialog .cm-dialog-close").click();
    await page.waitForTimeout(150);
    eq(await page.evaluate(() => document.activeElement?.dataset?.action), "board-camera", "closed, the focus goes back to Camera");
    if(page.viewportSize().width===1440) {
      await openSettings(page);await tab(page,'general');await page.locator('#cm-board-tools [data-action=board-modules-settings]').click();await page.locator('#cm-drawer-settings').waitFor();
      const actions=page.locator('#cm-drawer-settings tr').filter({has:page.locator('th', {hasText:/^Actions$/})});
      eq(await actions.locator('input').count(),0,'fixed Actions location is honest text rather than unexplained disabled choices');ok((await actions.textContent()).includes('Always in the left drawer'),'fixed Actions row explains why the decision stays available');
      ok(!/Drag its handle/.test(await page.locator('#cm-drawer-settings').textContent()),'drawer settings promise only the real arrow controls');
      await page.locator('input[name=module-history][value=none]').check();await page.locator('[data-action=board-modules-save]').click();await page.locator('#cm-drawer-settings').waitFor({state:'hidden'});
      eq(await page.locator('.cm-stage-module[data-module=history]').count(),0,'real None selection removes optional History module');eq(await page.locator('.cm-stage-module[data-module=actions]').count(),1,'saving preserves the fixed Actions module');
      const stackToggle=page.locator('[data-action=board-stage-side][aria-controls=cm-stack-drawer]');if(await stackToggle.getAttribute('aria-expanded')!=='true')await stackToggle.click();
      /* Chat joined Stack and Coach as a default module of the right drawer (2026-10-28), so Coach is no longer second: the arrow's guarantee is that it moves
         Coach exactly one place up and leaves the others in their order. */
      const order=()=>page.evaluate(()=>[...document.querySelectorAll('.cm-stage-modules[data-module-side=right]>.cm-stage-module')].map(m=>m.dataset.module));
      const was=await order(),at=was.indexOf('coach');
      ok(at>0,`Coach is below another module to begin with (${was})`);
      await page.locator('[data-action=board-module-move][data-module=coach][data-by="-1"]').click();
      await page.waitForFunction((i)=>document.querySelector('.cm-stage-modules[data-module-side=right]>.cm-stage-module:nth-child('+(i)+')')?.dataset.module==='coach',at);
      const now=await order(),expected=[...was];expected.splice(at,1);expected.splice(at-1,0,'coach');
      eq(now,expected,'real drawer arrow moves the saved module one place up and keeps the rest in order');
    }
    eq(errors, [], `no page error (${errors.join(" | ")})`);
    await context.close();
  }
} finally {
  await close();
}
console.log(`board-settings-window: ${checks} checks passed -- Camera closes on a press outside it in Table, Focus and 3D; Settings is a window sized to the browser at three sizes and when made smaller, ✕ at its top right, Cancel and Save at its bottom right, its sections down the left (General, Video, Audio, Gameplay), each fitting without scrolling and using the full width; Save keeps, Cancel, ✕ and Escape put back.`);
