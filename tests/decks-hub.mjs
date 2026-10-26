/* THE DECKS PAGE (r3's hub, R3.4; rewritten to Rob's Decks requirements of 2026-10-23, Part A).
 *
 * In a real page with the committed library restored:
 *
 *   1. The head: Bulk actions, then New deck as the primary; Bulk actions waits for a tick (SEL-2).
 *   2. The chips: All · Boxed · Defined · Building · Shared (FLT-1; Playable shows only where Play is in the cloud, which
 *      this page is not -- tests/table-lobby.mjs proves it). Each reads the model's deckStatus; they overlap, so a Boxed
 *      deck is under Defined too (Q6), and the tile badge is the furthest stage (FLT-5). An old address opens All (FLT-8).
 *   3. The sort is "Closest to finished" by default, and Name and Recently changed; all in the address.
 *   4. The nav under Decks: five entries, no deck names (NAV-1, NAV-2).
 *   5. Favorites: the star is a toggle button; a favorite's star shows without hover; the Favorites filter combines with
 *      the chips and is the page's name; it survives a reload (FAV-1 to FAV-6).
 *   6. Selection and Bulk actions: the menu's items in order, Compare greyed below two, a chip change clears the
 *      selection; Favorite, Add to group (a deck set, its tag on the tile), Box decks (the counts, then the box), and
 *      Remove (Archive, and one Undo) (SEL-1 to SEL-10, BOX, Q3, Q4).
 *   7. A save redraws without a flicker (Rob, 2026-10-25): with Play in the cloud stood in (its answers 150 ms late),
 *      a star's save and a deck page's redraw never draw a frame without New from Wizards, the tiles' and the deck's
 *      lines from the table, or with the page shorter than it ends.
 *   8. Shared, without an account: says to sign in (FLT-6).
 *   9. A phone: the bar wraps inside the screen.
 *
 * Every expected set is computed here from the library itself (CrankCollection), never copied from the page.
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "decks-hub", flag: "GEOMETRY_REQUIRED"});
const tiles = (page) => page.$$eval(".cm-deck-grid [data-deck-tile]", (ts) => ts.map((t) => t.dataset.deckTile));
const facts = (page) => page.evaluate(async () => {
  const r = await CrankRepository.open();
  try {
    const s = await r.getState(), history = await r.history();
    const last = {};
    for (const row of history) { const id = row.operation && row.operation.deckId; if (id && !(id in last)) last[id] = row.at || ""; }
    return s.decks.filter((d) => !d.archived).map((d) => {
      const x = CrankCollection.readiness(s, d), p = CrankCollection.deckStatus(s, d);
      return {id: d.id, name: d.name, createdAt: d.createdAt, changed: last[d.id] || d.createdAt || "", left: (x.toBuy || 0) + (x.ordered || 0) + (x.standIns || 0),
        stage: p.stage, boxed: p.boxed, word: p.boxed ? "Boxed" : p.stage === "defined" ? "Defined" : "Building", loading: p.loading, sets: d.sets || []};
    });
  } finally { r.close(); }
});
const byName = (a, b) => a.name.localeCompare(b.name, "en-US", {numeric: true});
const mark = (page) => page.evaluate(() => { const i = document.createElement("i"); i.id = "decks-hub-stale"; i.hidden = true; document.getElementById("cm-main").append(i); });
const settle = (page) => page.waitForFunction(() => !document.getElementById("decks-hub-stale") && document.querySelector(".cm-deck-grid, .cm-decks-none"));
const go = async (page, act) => { await mark(page); await act(); await settle(page); };
const hash = (page, h) => go(page, () => page.evaluate((x) => { if (location.hash === x) globalThis.__cm.render(); else location.hash = x; }, h));
const revision = (page) => page.evaluate(() => globalThis.__cm.state.revision);
const committed = (page, r) => page.waitForFunction((x) => globalThis.__cm.state.revision > x, r);

try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  await settle(page);
  /* One Final card out of a box and back to the Bench, so one deck is Defined and not Boxed: the chips then have to
     tell the two apart. */
  await page.evaluate(async () => {const r = await CrankRepository.open(); try {const s = await r.getState(); const l = s.lots.find((x) => x.location?.kind === "deck" && x.allocation?.deckId === x.location.deckId); await r.commit({id: crypto.randomUUID(), type: "place", lotId: l.id, quantity: 1, confirmed: true}, s.revision);} finally {r.close();}});
  await page.reload();await settle(page);

  /* 1. The head. */
  eq(await page.$$eval(".cm-page-head .cm-actions > .v-button", (bs) => bs.map((b) => b.textContent.trim())), ["Bulk actions", "New deck"], "the head holds Bulk actions, then New deck");
  ok(await page.$eval(".cm-page-head [data-action=new-deck]", (b) => b.classList.contains("primary")), "and New deck is the primary");
  ok(await page.$eval(".cm-page-head [data-action=bulk-menu]", (b) => b.disabled), "Bulk actions waits for a tick");

  /* 2. The chips, and the badges. */
  const all = await facts(page);
  eq(await page.$$eval(".cm-decks-stages a", (as) => as.map((a) => a.getAttribute("aria-label"))), ["All", "Boxed", "Defined", "Building", "Shared"], "the chips are the stages, then Shared");
  eq(await page.$eval(".cm-decks-stages [aria-current=true]", (a) => a.getAttribute("aria-label")), "All", "All is the chip in force");
  eq(await page.$$eval(".cm-deck-grid [data-deck-tile]", (ts) => Object.fromEntries(ts.map((t) => [t.dataset.deckTile, t.querySelector(".cm-pill").textContent]))),
    Object.fromEntries(all.map((d) => [d.id, d.word])), "each tile's badge is its furthest stage, from the model");
  for (const [chip, want] of [["Boxed", all.filter((d) => d.boxed)], ["Defined", all.filter((d) => d.stage === "defined")], ["Building", all.filter((d) => d.stage === "building")]]) {
    await go(page, () => page.locator(".cm-decks-stages").getByRole("link", {name: chip, exact: true}).click());
    ok(new RegExp(`stage=${chip.toLowerCase()}`).test(page.url()), `${chip} is in the address`);
    if (want.length) eq((await tiles(page)).sort(), want.map((d) => d.id).sort(), `${chip} shows exactly its ${want.length} decks`);
    else ok(new RegExp(`No ${chip.toLowerCase()} decks right now`).test(await page.locator("#cm-main").innerText()), `${chip}, with none, says so`);
  }
  ok(all.some((d) => d.boxed), "some decks are Boxed, so overlap is proved");
  ok(all.some((d) => d.stage === "defined" && !d.boxed), "and one is Defined without being Boxed, so the two chips differ");
  ok(all.filter((d) => d.boxed).every((d) => d.stage === "defined"), "and every Boxed deck is also under Defined (the chips overlap)");
  await go(page, () => page.goBack());
  ok(/stage=defined/.test(page.url()), "Back undoes the last chip");
  for (const old of ["toload", "loading", "complete"]) {
    await hash(page, `#decks?stage=${old}`);
    eq(await page.$eval(".cm-decks-stages [aria-current=true]", (a) => a.getAttribute("aria-label")), "All", `the old address stage=${old} opens All`);
  }

  await hash(page, '#decks');
  const chips = await page.$$eval('[data-stage-chip]', (xs) => Object.fromEntries(xs.filter((x) => x.dataset.stageChip !== 'shared').map((x) => [x.dataset.stageChip, Number(x.querySelector('[data-stage-count]').textContent)])));
  eq(chips, {all: all.length, boxed: all.filter((x) => x.boxed).length, defined: all.filter((x) => x.stage === 'defined').length, building: all.filter((x) => x.stage === 'building').length}, 'stage counts are drawn from the same deck facts as their filters');
  /* 3. The sorts. */
  await hash(page, "#decks");
  eq(await page.$eval("#cm-decks-sort", (s) => s.value), "closest", "the sort is Closest to finished");
  eq(await tiles(page), [...all].sort((a, b) => a.left - b.left || byName(a, b)).map((d) => d.id), "closest to finished first");
  await go(page, () => page.selectOption("#cm-decks-sort", "name"));
  ok(/sort=name/.test(page.url()), "the sort is in the address");
  eq(await tiles(page), [...all].sort(byName).map((d) => d.id), "Name sorts by the deck's name");
  const target = [...all].sort(byName).at(-1), before = await revision(page);
  await page.evaluate(async (id) => { const r = await CrankRepository.open(); try { const s = await r.getState(); await r.commit({id: crypto.randomUUID(), type: "editDeck", deckId: id, notes: "Changed by the decks-hub suite."}, s.revision); } finally { r.close(); } }, target.id);
  /* The page hears of the change and draws again; wait for that, so a late draw in Name order cannot land last. */
  await committed(page, before);
  await hash(page, "#decks?sort=recent");
  eq((await tiles(page))[0], target.id, `Recently changed puts the deck just changed (${target.name}) first`);
  eq(await page.$eval(".cm-decks-stages [aria-current=true]", (a) => a.getAttribute("href")), "#decks?sort=recent", "a chip keeps the sort in force");

  /* 4. The nav. */
  await page.reload();await settle(page);
  eq(await page.$$eval("[data-nav=decks] ~ .cm-subnav a, .cm-subnav a", (as) => [...new Set(as.map((a) => a.textContent.trim()))]), ["My Decks", "Favorites", "Create", "Shared", "About Deck Building"], "the Decks nav is five entries, no deck names");
  /* A Boxed deck, so a deck page that drops Boxed from its badge shows. */
  const opened = all.find((d) => d.boxed);
  await go(page, () => page.locator(`.cm-deck-grid [data-deck-tile="${opened.id}"] button[data-action=deck]`).click()).catch(() => {});
  await page.locator(".cm-deck-hero h1").waitFor({timeout: 30000});
  ok(!(await page.$$eval(".cm-subnav a", (as) => as.some((a) => a.getAttribute("aria-current")))), "opening a deck marks no entry");
  eq(await page.$eval(".cm-deck-hero [data-stage]", (x) => x.textContent), opened.word, "and the deck page's badge is the same stage word as its tile");
  await hash(page, "#decks");

  /* 5. Favorites. */
  const fav = all[0], tile = (id) => page.locator(`[data-deck-tile="${id}"]`);
  const star = tile(fav.id).locator(".cm-tile-star");
  eq([await star.getAttribute("aria-pressed"), await star.getAttribute("aria-label")], ["false", `Favorite ${fav.name}`], "the star is a toggle, off, labeled");
  const tools = (id) => page.$eval(`[data-deck-tile="${id}"] .cm-tile-star`, (b) => getComputedStyle(b).opacity);
  await page.mouse.move(5, 5);eq(await tools(fav.id), "0", "an outline star waits for hover");
  let r0 = await revision(page);await star.click();await committed(page, r0);await settle(page);
  eq(await tile(fav.id).locator(".cm-tile-star").getAttribute("aria-pressed"), "true", "one click favorites");
  await page.mouse.move(5, 5);await page.waitForTimeout(300);eq(await tools(fav.id), "1", "and a favorite's filled star stays without hover");
  /* Rob, 2026-10-25: the star covered the stage pill. Without hover, the favorite's pill stays stepped aside, clear of it. */
  const apart = await page.$eval(`[data-deck-tile="${fav.id}"]`, (t) => {const s = t.querySelector(".cm-tile-star").getBoundingClientRect(), p = t.querySelector(".cm-pill").getBoundingClientRect();return p.top >= s.bottom || p.left >= s.right || p.bottom <= s.top || p.right <= s.left;});
  ok(apart, "and the favorite's star does not cover its stage pill");
  await go(page, () => page.locator(".cm-subnav a", {hasText: "Favorites"}).click());
  ok(/fav=1/.test(page.url()), "Favorites is in the address");
  eq(await tiles(page), [fav.id], "Favorites shows only the favorite");
  eq(await page.$eval(".cm-page-head h1", (h) => h.textContent), "Favorites", "and the page head reads Favorites");
  eq(await page.$eval(".cm-subnav a[aria-current]", (a) => a.textContent.trim()), "Favorites", "and its nav entry is current");
  const other = fav.boxed ? "building" : "boxed";
  await hash(page, `#decks?stage=${other}&fav=1`);
  ok(/No favorites yet\. Star a deck to see it here\./.test(await page.locator("#cm-main").innerText()), "Favorites combines with a chip, and an empty result says to star a deck");
  await page.reload();await settle(page);
  eq(await page.evaluate(() => globalThis.__cm.state.preferences.favoriteDecks), [fav.id], "favorites are kept with the library, through a reload");
  await hash(page, "#decks");
  r0 = await revision(page);await tile(fav.id).locator(".cm-tile-star").click();await committed(page, r0);await settle(page);
  eq(await tile(fav.id).locator(".cm-tile-star").getAttribute("aria-pressed"), "false", "a second click unfavorites");

  /* 6. Selection and Bulk actions. */
  const [a, b] = [...all].sort(byName);
  await tile(a.id).hover();await tile(a.id).locator("[data-action=select-deck]").check();await settle(page);
  eq(await page.$eval("[data-action=bulk-menu]", (x) => [x.disabled, x.textContent.trim()]), [false, "Bulk actions (1)"], "one tick wakes Bulk actions");
  eq(await tile(a.id).locator("[data-action=select-deck]").getAttribute("aria-label"), `Select ${a.name}`, "the tick reads Select {deck}");
  await page.click("[data-action=bulk-menu]");
  const items = await page.$$eval(".cm-menu:popover-open button", (bs) => bs.map((x) => [x.textContent.trim(), x.disabled, x.title]));
  eq(items.map((x) => x[0]), ["Compare decks", "Box deck…", "Add to group…", "Favorite", "Remove deck…"], "the menu's items, in order, worded for one deck");
  eq(items[0].slice(1), [true, "Select at least two decks to compare."], "Compare decks is greyed below two, and says why");
  await page.keyboard.press("Escape");
  await go(page, () => page.locator(".cm-decks-stages").getByRole("link", {name: "Defined", exact: true}).click());
  ok(await page.$eval("[data-action=bulk-menu]", (x) => x.disabled), "a chip change clears the selection");
  await hash(page, "#decks?sort=name");
  for (const d of [a, b]) {await tile(d.id).hover();await tile(d.id).locator("[data-action=select-deck]").check();await settle(page);}
  await page.click("[data-action=bulk-menu]");
  eq(await page.$$eval(".cm-menu:popover-open button", (bs) => bs.map((x) => x.textContent.trim())), ["Compare decks", "Box decks…", "Add to group…", "Favorite", "Remove decks…"], "worded for two");
  r0 = await revision(page);await page.click(".cm-menu:popover-open [data-action=bulk-favorite]");await committed(page, r0);await settle(page);
  eq((await page.evaluate(() => globalThis.__cm.state.preferences.favoriteDecks)).sort(), [a.id, b.id].sort(), "Favorite favorites both, in one change");
  ok(await page.$eval("[data-action=bulk-menu]", (x) => x.disabled), "and the selection clears after the action");
  for (const d of [a, b]) {await tile(d.id).hover();await tile(d.id).locator("[data-action=select-deck]").check();await settle(page);}
  await page.click("[data-action=bulk-menu]");
  eq(await page.$eval(".cm-menu:popover-open [data-action=bulk-favorite]", (x) => x.textContent.trim()), "Unfavorite", "with every selected deck a favorite, it reads Unfavorite");
  /* Add to group: a new set, then its tag. */
  await page.click(".cm-menu:popover-open [data-action=bulk-group]");
  await page.locator("dialog input[name=name]").fill("S9");
  r0 = await revision(page);await page.click("dialog [type=submit]");await committed(page, r0);await settle(page);
  for (const d of [a, b]) eq(await tile(d.id).locator(".cm-tile-sets .cm-chip").allTextContents(), ["S9"], `${d.name} carries the S9 tag`);
  /* Box decks: every deck's counts, before anything moves. */
  const plan = await page.evaluate((ids) => [1, 2, 3].map((c) => globalThis.__cm.M.boxPlan(globalThis.__cm.state, ids, c)).map((p) => ({total: p.total, decks: p.decks.map((x) => [x.deckId, x.count]), donors: p.donors.length})), all.map((d) => d.id));
  ok(plan[2].total >= plan[1].total && plan[1].total >= plan[0].total, `each choice includes the one before (${plan.map((p) => p.total).join(", ")})`);
  const withWork = all.filter((d) => plan[2].decks.find(([id, n]) => id === d.id && n > 0));
  ok(withWork.length > 0, "the committed library has decks with cards to box");
  await hash(page, "#decks?sort=name");
  for (const d of withWork) {await tile(d.id).hover();await tile(d.id).locator("[data-action=select-deck]").check();await settle(page);}
  await page.click("[data-action=bulk-menu]");await page.click(".cm-menu:popover-open [data-action=bulk-box]");
  await page.locator("dialog .cm-box-choices").waitFor();
  const shown = await page.$$eval("dialog [data-box-choice]", (ls) => ls.map((l) => [Number(l.dataset.boxChoice), l.dataset.boxDeck, Number(l.querySelector("b").textContent)]));
  const want = await page.evaluate((ids) => {const order = globalThis.__cm.deckGridOrder; ids = [...ids].sort((x, y) => order.indexOf(x) - order.indexOf(y)); return [1, 2, 3].flatMap((c) => globalThis.__cm.M.boxPlan(globalThis.__cm.state, ids, c).decks.map((x) => [c, x.deckId, x.count]));}, withWork.map((d) => d.id));
  eq(shown, want, "the dialog shows each choice's count for each selected deck, from the model (BOX-3)");
  const pickChoice = plan[2].total > plan[0].total ? 3 : 1;
  await page.check(`dialog input[name=choice][value="${pickChoice}"]`);
  r0 = await revision(page);await page.click("dialog [type=submit]");await committed(page, r0);await settle(page);
  eq(await page.evaluate(([ids, c]) => globalThis.__cm.M.boxPlan(globalThis.__cm.state, ids, c).total, [withWork.map((d) => d.id), pickChoice]), 0, "after Box, that choice has nothing left to box");
  ok(/boxed · \d+ in the box · (Building|Defined|Boxed)/.test(await page.locator("#cm-notice").innerText()), "and the notice says, per deck, what was boxed and the stage now (BOX-8)");
  /* Remove: Archive, then one Undo. */
  await tile(a.id).hover();await tile(a.id).locator("[data-action=select-deck]").check();await settle(page);
  await page.click("[data-action=bulk-menu]");await page.click(".cm-menu:popover-open [data-action=bulk-remove]");
  ok((await page.locator("dialog").innerText()).includes(a.name), "Remove names the deck");
  eq(await page.$$eval("dialog .cm-form-footer button", (bs) => bs.map((x) => [x.textContent.trim(), x.classList.contains("primary"), x.classList.contains("cm-danger")])), [["Delete permanently", false, true], ["Archive", true, false]], "Archive is the main button, Delete permanently the red one (Q4)");
  r0 = await revision(page);await page.click("dialog [data-action=bulk-archive]");await committed(page, r0);await settle(page);
  ok(await page.evaluate((id) => globalThis.__cm.state.decks.find((d) => d.id === id).archived, a.id), "Archive archives it");
  ok(!(await tiles(page)).includes(a.id), "and it leaves the grid until Show archived is ticked (FLT-7)");
  await page.evaluate(() => globalThis.__cm.actions.undo());await page.waitForFunction((id) => !globalThis.__cm.state.decks.find((d) => d.id === id).archived, a.id);
  ok(true, "one Undo brings it back");

  /* 7. A save redraws without a flicker. Play in the cloud is stood in, answering 150 ms late as staging's does; every
     frame for 600 ms after the click is read. */
  await page.evaluate(() => { const C = globalThis.__cm; globalThis.__realPlay = C.play; const late = (ms) => new Promise((r) => setTimeout(r, ms));
    C.play = {...(C.play || {}), open: () => true,
      tiles: async () => { await late(150); for (const el of document.querySelectorAll("[data-play-for]")) { el.textContent = "Playable at the table"; el.classList.add("is-playable"); el.hidden = false; } },
      count: async () => { await late(50); return 1; },
      deck: async () => { await late(150); const el = document.getElementById("cm-deck-play"); if (el) { el.innerHTML = "<span>Playable at the table</span>"; el.hidden = false; } }};
  });
  await hash(page, "#decks");
  await page.waitForFunction(() => document.querySelectorAll("[data-play-for]:not([hidden])").length && !document.getElementById("cm-precon-latest")?.hidden, null, {timeout: 30000})
  const frames = (act) => page.evaluate(async (a) => {
    const seen = [], t0 = performance.now(), read = () => { const pre = document.getElementById("cm-precon-latest"), dp = document.getElementById("cm-deck-play");
      seen.push({h: Math.round(document.getElementById("cm-main").getBoundingClientRect().height), lines: document.querySelectorAll("[data-play-for]:not([hidden])").length,
        pre: Boolean(pre && !pre.hidden && pre.textContent.trim()), deck: dp ? !dp.hidden : null}); };
    const done = new Promise((r) => { const tick = () => { read(); if (performance.now() - t0 < 600) requestAnimationFrame(tick); else r(); }; requestAnimationFrame(tick); });
    if (a === "render") globalThis.__cm.render(); else document.querySelector(a).click();
    await done; return seen; }, act);
  const first = (await tiles(page))[0], beforeStar = await revision(page);
  const starFrames = await frames(`[data-deck-tile="${first}"] [data-action=favorite-deck]`);
  await committed(page, beforeStar);
  const end = starFrames.at(-1);
  ok(end.lines > 0 && end.pre, `the hub ends with its lines from the table and New from Wizards: ${JSON.stringify(end)}`);
  ok(starFrames.every((f) => f.lines === end.lines && f.pre && f.h >= end.h), `a star's save never draws a frame without them, or shorter: ${JSON.stringify([...new Set(starFrames.map((f) => JSON.stringify(f)))])}`);
  /* A remembered line the table's answer does not write again is put away, not kept: here the answer skips one deck. */
  await page.evaluate((skip) => { const C = globalThis.__cm, tiles = C.play.tiles; C.play.tiles = async () => { await new Promise((r) => setTimeout(r, 150));
    for (const el of document.querySelectorAll("[data-play-for]")) if (el.dataset.playFor !== skip) { el.textContent = "Playable at the table"; el.classList.add("is-playable"); el.hidden = false; } };
    globalThis.__restoreTiles = () => { C.play.tiles = tiles; }; }, first);
  await hash(page, "#decks");
  await page.waitForTimeout(600);
  eq(await page.$$eval("[data-play-for]", (els, skip) => els.filter((x) => !x.hidden).map((x) => x.dataset.playFor).includes(skip), first), false, "a line the table's answer does not write again ends hidden");
  ok(await page.$$eval("[data-play-for]:not([hidden])", (els) => els.length > 0), "and the lines it does write stay");
  await page.evaluate(() => globalThis.__restoreTiles());
  await hash(page, "#decks");
  await page.waitForFunction((id) => !document.querySelector(`[data-play-for="${id}"]`)?.hidden, first, {timeout: 30000});
  await go(page, () => page.locator(`.cm-deck-grid [data-deck-tile="${first}"] button[data-action=deck]`).click()).catch(() => {});
  await page.locator(".cm-deck-hero h1").waitFor({timeout: 30000});
  await page.waitForFunction(() => document.getElementById("cm-deck-play") && !document.getElementById("cm-deck-play").hidden, null, {timeout: 30000});
  const redraw = await frames("render");
  ok(redraw.every((f) => f.deck === true), `a deck page's redraw never hides its line from the table: ${JSON.stringify([...new Set(redraw.map((f) => JSON.stringify(f)))])}`);
  await page.evaluate(() => { globalThis.__cm.play = globalThis.__realPlay; delete globalThis.__realPlay; });
  await hash(page, "#decks");

  /* Shared's count resolves on the ordinary stage and is reused across stage navigation. */
  await page.evaluate(()=>{const C=globalThis.__cm;globalThis.__shareRestore={items:C.sharedItems,available:C.sharingAvailable,ready:C.sharingReady};globalThis.__shareReads=0;C.sharingReady=Promise.resolve();C.sharingAvailable=()=>true;C.sharedItems=async()=>{globalThis.__shareReads++;return [{id:'private',via:'grant'},{id:'public',via:'public'}];};});
  await hash(page,'#decks?stage=building');
  await page.waitForFunction(()=>document.querySelector('[data-stage-count=shared]')?.textContent==='1');
  eq(await page.locator('[data-stage-count=shared]').textContent(),'1','the Shared badge resolves private shares before opening Shared');
  await hash(page,'#decks?stage=defined');
  await page.waitForFunction(()=>document.querySelector('[data-stage-count=shared]')?.textContent==='1');
  eq(await page.evaluate(()=>globalThis.__shareReads),1,'stage navigation reuses the bounded shared count read');
  await page.evaluate(()=>{const C=globalThis.__cm,r=globalThis.__shareRestore;C.sharedItems=r.items;C.sharingAvailable=r.available;C.sharingReady=r.ready;});

  /* 8. Shared, without an account. */
  await go(page, () => page.locator(".cm-subnav a", {hasText: "Shared"}).click());
  ok(/stage=shared/.test(page.url()), "Shared is a chip of the Decks page");
  ok(/Sign in to see the decks other people share with you/.test(await page.locator("#cm-main").innerText()), "and without an account it says to sign in");
  ok(await page.locator("#cm-include-public").isVisible() && !(await page.locator("#cm-include-public").isChecked()), "Include public decks is there, off by default");
  await context.close();

  /* 9. A phone: the bar wraps inside the screen. */
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: "block"});
  const small = await phone.newPage();
  if (stub) await stub(small);
  await loadLiveState(small, base);
  await settle(small);
  const bar = await small.$eval(".cm-decks-bar", (x) => { const r = x.getBoundingClientRect(); return {left: r.left, right: r.right}; });
  ok(bar.left >= 0 && bar.right <= 390 && await small.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `on a phone the bar wraps inside the screen: ${JSON.stringify(bar)}`);
  await phone.close();
} finally {
  await close();
}
console.log(`decks-hub: ${checks} checks passed — Bulk actions and New deck in the head, the stage chips and badges from the model, favorites, deck sets, Box and Remove, all in the address.`);
