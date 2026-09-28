/* SIZES ARE SLIDERS, NEVER STEPS (AGENTS.md; Rob, 2026-09-26; R3.9b).
 *
 * The card size is one continuous scale, remembered per device, drawn as a slider wherever a size is picked:
 * Settings › Appearance and the Table view's drawer show the same one, and the stage's picture size is a slider too.
 * In a real page with the committed library, at 1400 and at 390 wide, this drags each slider to both ends and holds:
 *
 *   1. There are no steps: each size control is an <input type="range">, and no page here carries S / M / L or a row
 *      of size buttons. The range is 60% to 160% on a desktop and 60% to 130% on a phone.
 *   2. The smallest is legible: every caption on an open pile's cards is 10px or larger.
 *   3. The largest fits: the cards sit whole inside the drawer, the drawer does not run into what is below it, the
 *      page never scrolls sideways, and the hover preview and the inspector's picture stay on the screen.
 *   4. Dragging previews live (the same slider, no redraw, nothing saved); letting go saves, on this device only.
 *   5. The default and each view's own (Rob, 2026-09-28; G8): Settings sets the default everywhere; the Table view's
 *      slider starts there and, once moved, is the Table's own size, which Settings no longer moves; Use default
 *      gives it back. A desktop's 160% reads as a phone's 130%; the Table view's old S, M and L carry over once.
 *   6. The stage's picture: from 220px, where rules text still reads, to the full print or the mat, whichever is less.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "card-size", flag: "GEOMETRY_REQUIRED"});
/* Drag a range to a value: `input` while it moves, `change` when it is let go. */
const drag = (page, selector, value, {release = true} = {}) => page.$eval(selector, (el, [v, release]) => {
  el.value = String(v === "min" ? el.min : v === "max" ? el.max : v);
  el.dispatchEvent(new Event("input", {bubbles: true}));
  if (release) el.dispatchEvent(new Event("change", {bubbles: true}));
  return Number(el.value);
}, [value, release]);
const noSteps = async (page, where) => {
  const steps = await page.$$eval("button, [role=radio], [role=group]", (els) => els.filter((el) => el.offsetWidth > 0).map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim()).filter((t) => /^(S|M|L|XL|XXL)$|card size|picture size/i.test(t)));
  eq(steps, [], `${where}: no size is picked from buttons or steps`);
};
const openPile = async (page) => {
  await page.goto(`${base}/index.html#cards?view=tabletop`);
  await page.locator("[data-pile^='place:']").first().waitFor({timeout: 30000});
  await page.$eval("[data-pile^='place:']:not(.is-empty)", (b) => b.click());
  await page.locator(".cm-tt-grid .cm-tt-card").first().waitFor({timeout: 30000});
};
/* Everything that says whether the open pile at this size is legible and fits. */
const measure = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll(".cm-tt-grid .cm-tt-card")], drawer = document.querySelector(".cm-tt-drawer").getBoundingClientRect(), rail = document.querySelector(".cm-tt-backrow").getBoundingClientRect();
  const below = [...document.querySelectorAll(".cm-tt-mat > *:not(.cm-tt-backrow):not(.cm-tt-legend)")].map((el) => el.getBoundingClientRect()).filter((r) => r.height && r.top > rail.top);
  return {
    w: cards[0].offsetWidth,
    fonts: cards.slice(0, 20).map((c) => parseFloat(getComputedStyle(c.querySelector(".cm-tt-name")).fontSize)),
    inside: cards.slice(0, 20).every((c) => { const r = c.getBoundingClientRect(); return r.top >= drawer.top - 0.5 && r.bottom <= drawer.bottom + 0.5; }),
    clearBelow: below.every((r) => r.top >= rail.bottom - 1),
    sideways: document.documentElement.scrollWidth - innerWidth,
    head: (() => { const r = document.querySelector(".cm-tt-drawer-head [data-card-scale]").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })(),
    /* Nothing in the drawer's head sits on anything else: the close button once floated over the title and the slider. */
    overlaps: (() => { const els = [...document.querySelectorAll(".cm-tt-drawer-head > *")].filter((el) => el.offsetWidth).map((el) => [el.className || el.tagName, el.getBoundingClientRect()]); const hit = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const [a, r] = els[i], [b, q] = els[j]; if (r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1) hit.push(`${a} × ${b}`); } return hit; })(),
  };
});

try {
  for (const [vw, vh, tag, hi] of [[1400, 900, "desktop", 160], [390, 844, "phone", 130]]) {
    const context = await browser.newContext({viewport: {width: vw, height: vh}, serviceWorkers: "block", ...(tag === "phone" ? {isMobile: true, hasTouch: true} : {})});
    const page = await context.newPage();
    if (stub) await stub(page);
    await loadLiveState(page, base);

    /* 1. Settings: one slider, this device's range. */
    await page.goto(`${base}/index.html#settings`);
    await page.locator("#cm-settings-h-appearance").waitFor({timeout: 30000});
    eq(await page.$$eval("[data-card-scale]", (els) => els.map((el) => [el.type, Number(el.min), Number(el.max), Number(el.value)])), [["range", 60, hi, 100]], `${tag}: Settings draws the card size as one slider, 60% to ${hi}%, at 100% to start`);
    await noSteps(page, `${tag} Settings`);
    const store = () => page.evaluate(() => [localStorage.getItem("cm-card-scale"), getComputedStyle(document.documentElement).getPropertyValue("--card-scale").trim()]);
    await drag(page, "[data-card-scale]", "min");
    eq(await store(), ["60", "0.6"], `${tag}: letting go at the smallest saves 60% on this device and scales the page`);
    eq((await page.locator("[data-card-scale] ~ output").innerText()).trim(), "60%", "and the slider says the value");

    /* 2 and 5. The Table view shows the same scale; at the smallest every caption is legible. */
    await openPile(page);
    eq(await page.$eval(".cm-tt-drawer-head [data-card-scale]", (el) => [el.type, el.value, el.max]), ["range", "60", String(hi)], `${tag}: the Table view's drawer starts at the default`);
    ok(await page.locator(".cm-tt-drawer-head .cm-size-note", {hasText: "default"}).count() === 1, `${tag}: and says it is using the default`);
    await noSteps(page, `${tag} Table view`);
    let m = await measure(page);
    eq(m.w, 75, `${tag}: at 60% an open pile's card is 75px wide`);
    ok(m.fonts.length && m.fonts.every((f) => f >= 10), `${tag}: and every caption is 10px or larger (${Math.min(...m.fonts)}px)`);
    ok(m.inside && m.clearBelow && m.sideways <= 0 && m.head, `${tag}: and it fits: cards whole in the drawer, nothing below overlapped, no sideways scroll, the slider on screen (${JSON.stringify(m)})`);
    eq(m.overlaps, [], `${tag}: and nothing in the drawer's head sits on anything else`);

    /* 4. Dragging previews live: the same slider, the cards already bigger, nothing saved until it is let go. */
    await page.$eval(".cm-tt-drawer-head [data-card-scale]", (el) => { el.dataset.probe = "same"; });
    await drag(page, ".cm-tt-drawer-head [data-card-scale]", "max", {release: false});
    await page.waitForTimeout(200);
    eq(await page.evaluate(() => [document.querySelector(".cm-tt-drawer-head [data-card-scale]")?.dataset.probe, document.querySelector(".cm-tt-grid .cm-tt-card").offsetWidth, localStorage.getItem("cm-card-scale"), localStorage.getItem("cm-card-scale:table")]),
      ["same", Math.round(125 * hi / 100), "60", null], `${tag}: while dragged, the cards follow at once and the slider stays in hand; nothing is saved yet`);
    await page.$eval(".cm-tt-drawer-head [data-card-scale]", (el) => el.dispatchEvent(new Event("change", {bubbles: true})));
    await page.waitForTimeout(600);
    eq(await page.evaluate(() => [localStorage.getItem("cm-card-scale:table"), localStorage.getItem("cm-card-scale")]), [String(hi), "60"], `${tag}: letting go saves ${hi}% as the Table's own size; the default stays 60%`);

    /* 3. The largest fits. */
    m = await measure(page);
    eq(m.w, Math.round(125 * hi / 100), `${tag}: at ${hi}% an open pile's card is ${Math.round(125 * hi / 100)}px wide`);
    ok(m.fonts.every((f) => f >= 10), `${tag}: its captions are legible (${Math.max(...m.fonts)}px)`);
    ok(m.inside && m.clearBelow && m.sideways <= 0 && m.head, `${tag}: and it fits: cards whole in the drawer, nothing below overlapped, no sideways scroll, the slider on screen (${JSON.stringify(m)})`);

    /* 5. The Table's own size over the default: Settings still reads 60% and draws at it; the Table keeps its own; Use
       default gives the default back and forgets the Table's own. */
    await page.goto(`${base}/index.html#settings`);
    await page.locator("[data-card-scale]").waitFor({timeout: 30000});
    eq(await page.evaluate(() => [document.querySelector("[data-card-scale]").value, getComputedStyle(document.documentElement).getPropertyValue("--card-scale").trim()]), ["60", "0.6"], `${tag}: Settings still shows the default, 60%, and draws at it`);
    await openPile(page);
    eq(await page.evaluate(() => [document.querySelector(".cm-tt-drawer-head [data-card-scale]").value, document.querySelector(".cm-tt-grid .cm-tt-card").offsetWidth]), [String(hi), Math.round(125 * hi / 100)], `${tag}: back on the Table, its own ${hi}% holds over the default`);
    await page.locator(".cm-tt-drawer-head [data-card-scale-reset]").click();
    await page.waitForTimeout(600);
    eq(await page.evaluate(() => [localStorage.getItem("cm-card-scale:table"), getComputedStyle(document.documentElement).getPropertyValue("--card-scale").trim()]), [null, "0.6"], `${tag}: Use default forgets the Table's own size and draws at the default again`);

    /* 6. The stage's picture size. */
    await page.$eval(".cm-tt-grid .cm-tt-card", (c) => c.click());
    await page.locator(".cm-tt-solo").waitFor({timeout: 30000});
    const stage = await page.$eval("[data-tt-stage]", (el) => [el.type, Number(el.min), Number(el.max)]);
    eq(stage.slice(0, 2), ["range", 220], `${tag}: the stage's picture size is a slider from 220px`);
    ok(stage[2] <= 488 && stage[2] <= vw - 32, `${tag}: to the full print or the mat, whichever is less (${stage[2]}px)`);
    await noSteps(page, `${tag} stage`);
    for (const end of ["min", "max"]) {
      const want = await drag(page, "[data-tt-stage]", end);
      await page.waitForTimeout(600);
      const solo = await page.$eval(".cm-tt-solo", (el) => { const r = el.getBoundingClientRect(); return [el.offsetWidth, el.offsetHeight, r.left >= 0 && r.right <= innerWidth]; });
      eq([solo[0], Math.abs(solo[1] - solo[0] * 7 / 5) <= 1, solo[2]], [want, true, true], `${tag}: at its ${end === "min" ? "smallest" : "largest"} the picture is ${want}px, 5:7, and on the screen`);
    }
    ok(Number(await page.evaluate(() => localStorage.getItem("cm-tabletop-stage-w"))) === stage[2], `${tag}: the picture's width is remembered on this device`);

    /* 3. The two close looks at a card, at the largest: the inspector's picture, and on a desktop the hover preview. They
       have no slider of their own, so they follow the default: set it to the largest in Settings. */
    await page.goto(`${base}/index.html#settings`);
    await page.locator("[data-card-scale]").waitFor({timeout: 30000});
    await drag(page, "[data-card-scale]", "max");
    await page.waitForTimeout(300);
    await page.goto(`${base}/index.html#decks?deck=${encodeURIComponent("deck:live:D4")}&tab=hundred`);
    await page.locator(".cm-deck-cards li .cm-card-name").first().click();
    await page.locator("#cm-dialog .cm-inspector-art>img").waitFor({timeout: 30000});
    const insp = await page.evaluate(() => { const i = document.querySelector("#cm-dialog .cm-inspector-art>img").getBoundingClientRect(), d = document.querySelector("#cm-dialog").getBoundingClientRect(); return [Math.round(i.width), i.left >= d.left - 0.5 && i.right <= d.right + 0.5 && i.right <= innerWidth]; });
    ok(insp[0] > (tag === "phone" ? 200 : 230) && insp[1], `${tag}: at ${hi}% the inspector's picture grows (${insp[0]}px) and stays inside the dialog and the screen`);
    await page.keyboard.press("Escape");
    if (tag === "desktop") {
      await page.goto(`${base}/index.html#cards`);
      await page.locator("#cm-roster-table .cm-table .cm-card-name").first().hover();
      await page.locator(".cm-hover-art").waitFor({state: "visible", timeout: 10000});
      const hov = await page.$eval(".cm-hover-art", (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight]; });
      ok(hov[0] > 360 && hov[0] <= 488 && hov[1], `${tag}: at ${hi}% the hover preview grows (${hov[0]}px), never past the normal print, and stays on the screen`);
    }
    await context.close();
  }

  /* 5. Per device: a desktop's 160% reads as a phone's 130%, and the Table view's old L carries over once. */
  {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: "block", isMobile: true, hasTouch: true});
    const page = await context.newPage();
    if (stub) await stub(page);
    await loadLiveState(page, base);
    await page.evaluate(() => localStorage.setItem("cm-card-scale", "160"));
    await page.goto(`${base}/index.html#settings`);
    await page.locator("[data-card-scale]").waitFor({timeout: 30000});
    eq(await page.evaluate(() => [document.querySelector("[data-card-scale]").value, getComputedStyle(document.documentElement).getPropertyValue("--card-scale").trim()]), ["130", "1.3"], "a desktop's 160% reads as 130% on a phone, the most that fits it, in the slider and in the cards");
    await page.evaluate(() => { localStorage.removeItem("cm-card-scale"); localStorage.setItem("cm-tabletop-size", "L"); });
    await page.reload();
    await page.locator("[data-card-scale]").waitFor({timeout: 30000});
    eq(await page.$eval("[data-card-scale]", (el) => el.value), "130", "the Table view's old L carries over to the nearest point on this phone's scale");
    await context.close();
  }
} finally {
  await close();
}
console.log(`card-size: ${checks} checks passed — every size is a slider, the smallest legible and the largest fitting, on a desktop and a phone.`);
