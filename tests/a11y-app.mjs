/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WORDS ON THE ACCENT, ACROSS THE APP (WCAG 2.1 1.4.3; the A11y pass's one item left, docs/ACTIVE.md). The pass measured
 * every word on the board and in the lobby from its pixels (tests/a11y-board.mjs) and darkened the accent under words
 * there (--accent-fill): in Felt & Cream and Steel & Cobalt the accent is a middle tone that carries its own ink at
 * about 3.9:1. The workshop's primary buttons and the rest that set words on the accent did not take it.
 *
 * Every rule that sets words on the accent is checked here, in each of the four themes: one element of each, made
 * inside the app as the app would make it, its computed ink against its computed ground (both solid, read through a
 * canvas so color-mix resolves to the pixel it paints), at 4.5:1. The page's own primary buttons are read too.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const failures = [];
const ok = (c, m) => {checks += 1; if (!c) failures.push(m);};

/* The rules that set words on the accent, each as the app marks it up. */
const PROBES = [
  ["the primary button", `<button class="v-button primary">Save</button>`, "button"],
  ["the v-primary button", `<button class="v-primary">Go</button>`, "button"],
  ["the shop's chosen tab", `<div class="v-shop-tabs"><button aria-pressed="true">Cards</button></div>`, "button"],
  ["the graph's chosen mode", `<div class="cm-graph-box"><div class="cm-graph-modes"><button class="v-button is-on">Lines</button></div></div>`, "button"],
  /* A list row's detail is drawn inside the app (crankmagic-discover.js), so its primary is the app's own. */
  ["a list row's primary", `<div class="cm-list-pop-row"><div class="cm-actions"><button class="v-button primary">Add</button></div></div>`, "button"],
  ["the landing's step number", `<div class="cm-landing-step"><span>1</span></div>`, "span"],
  ["the landing's closing panel", `<div class="cm-landing-close">Start building</div>`, ".cm-landing-close"],
  ["the build's current step", `<ol class="cm-build-steps"><li aria-current="step">Commander</li></ol>`, "li"],
];
const THEMES = ["moss-iron", "brass-slate", "felt-cream", "steel-cobalt"];

const {browser, base, stub, close} = await openBrowser({name: "a11y-app", flag: "GEOMETRY_REQUIRED"});
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await loadLiveState(page, base);
  await page.goto(`${base}/index.html#settings`);
  await page.locator("[data-action=set-theme]").first().waitFor({timeout: 30000});
  for (const theme of THEMES) {
    await page.evaluate((t) => document.querySelector(`[data-action=set-theme][data-theme-choice="${t}"]`).click(), theme);
    await page.waitForFunction((t) => document.querySelector(`[data-action=set-theme][data-theme-choice="${t}"]`)?.getAttribute("aria-pressed") === "true", theme, {timeout: 10000});
    const read = await page.evaluate(({probes}) => {
      const one = document.createElement("canvas"); one.width = one.height = 1;
      const cx = one.getContext("2d", {willReadFrequently: true});
      const rgb = (css) => {cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data.slice(0, 3)];};
      const host = document.getElementById("matrix-v2") || document.body, box = document.createElement("div");
      box.id = "a11y-app-probe"; host.append(box);
      const out = [];
      for (const [label, html, pick] of probes) {
        box.innerHTML = html;
        const el = box.querySelector(pick), st = getComputedStyle(el);
        out.push({label, ink: rgb(st.color), ground: rgb(st.backgroundColor), alpha: st.backgroundColor});
      }
      /* .cm-skip sits outside the app's root, at the page's top */
      const skip = document.querySelector(".cm-skip");
      if (skip) {const st = getComputedStyle(skip); out.push({label: "the skip link", ink: rgb(st.color), ground: rgb(st.backgroundColor), alpha: st.backgroundColor});}
      box.remove();
      /* and the primary buttons the Decks page draws */
      return out;
    }, {probes: PROBES});
    for (const r of read) {
      const ratio = contrast(r.ink, r.ground);
      ok(ratio >= 4.5 && !/rgba\([^)]*,\s*0\)|transparent/.test(r.alpha), `${theme}: ${r.label} reads ${ratio.toFixed(2)}:1 (ink ${r.ink}, ground ${r.ground}), short of 4.5:1`);
    }
    ok(read.length === PROBES.length + 1, `${theme}: every rule that sets words on the accent was read, and the skip link (${read.length} of ${PROBES.length + 1})`);
    /* The page's own: the Decks page's primary buttons, as drawn. */
    await page.evaluate(() => {location.hash = "#decks";});
    await page.locator("#matrix-v2 .v-button.primary").first().waitFor({timeout: 20000});
    const drawn = await page.evaluate(() => {
      const one = document.createElement("canvas"); one.width = one.height = 1;
      const cx = one.getContext("2d", {willReadFrequently: true});
      const rgb = (css) => {cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data.slice(0, 3)];};
      return [...document.querySelectorAll("#matrix-v2 .v-button.primary")].filter((el) => el.offsetParent && el.textContent.trim()).map((el) => {const st = getComputedStyle(el); return {text: el.textContent.trim().slice(0, 30), ink: rgb(st.color), ground: rgb(st.backgroundColor)};});
    });
    ok(drawn.length > 0, `${theme}: the Decks page draws a primary button to read`);
    for (const d of drawn) {
      const ratio = contrast(d.ink, d.ground);
      ok(ratio >= 4.5, `${theme}: the Decks page's "${d.text}" reads ${ratio.toFixed(2)}:1, short of 4.5:1`);
    }
    await page.evaluate(() => {location.hash = "#settings";});
    await page.locator("[data-action=set-theme]").first().waitFor({timeout: 20000});
  }
  await context.close();
} finally {
  await close();
}

/* WCAG 2.1's relative luminance and contrast ratio. */
function contrast(a, b) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

assert.deepEqual(failures, [], `words on the accent fall short at ${failures.length} place(s):\n  ` + failures.join("\n  "));
console.log(`a11y-app: ${checks} checks passed — every rule that sets words on the accent, and the Decks page's primary buttons, at 4.5:1 in all four themes.`);
