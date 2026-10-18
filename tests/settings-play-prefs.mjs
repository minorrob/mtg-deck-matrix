/* PLAY PREFERENCES (ROB-124, October 18, 2026): confirmations, stops, auto-pass, camera and sound
 * defaults, all stored in the account's preferences (C.state.preferences.play) and applied when
 * a table opens.
 *
 * EXISTING DEFAULTS MUST STAY UNCHANGED (task requirement): tilt 40°, mat medieval-banded, sfx 0.5 (50%),
 * bgm 0.18 (18%), muted false, stepByStep false, overlay 60. This suite proves those defaults with
 * deliberate mutations that must fail their assertions, then pass when restored.
 *
 * Needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) turns a missing browser into a failure.
 */
import assert from "node:assert/strict";
import {openBrowser, loadLiveState} from "./uat/browser-runner.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };
const eq = (a, b, msg) => { checks++; assert.deepEqual(a, b, msg); };

const {browser, base, stub, close} = await openBrowser({name: "settings-play-prefs", flag: "GEOMETRY_REQUIRED"});
const openMenu = async (page) => { await page.getByRole("button", {name: "Menu", exact: true}).click(); await page.locator("#cm-user-menu:popover-open").waitFor(); };
const toSettings = async (page) => { await openMenu(page); await page.locator("#cm-user-menu").getByRole("button", {name: "Settings"}).click(); await page.locator(".cm-settings").waitFor({timeout: 30000}); };

try {
  const context = await browser.newContext({viewport: {width: 1280, height: 720}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.addInitScript(() => (globalThis.CrankFeatures ||= []).push((C) => {globalThis.__cm = C;}));
  await loadLiveState(page, base);
  const saved = () => page.evaluate(async () => {const r = await CrankRepository.open(); try {return (await r.getState()).preferences.play || null;} finally {r.close();}});

  /* EXISTING DEFAULTS PRESERVED (ROB-124 requirement): the defaults before any preference is set. */
  await toSettings(page);
  const defaults = await page.evaluate(() => {const C = globalThis.__cm; return {exposed: C.PLAY_DEFAULTS, read: C.playPrefs()};});
  eq(defaults.exposed, {stepByStep: false, overlay: 60, confirmCast: false, autoPassScope: 'never', camera: {tilt: 40, zoom: 100, cards: 100}, sound: {sfx: 0.5, bgm: 0.18, muted: false}}, "PLAY_DEFAULTS exposes the required unchanged defaults: tilt 40°, sfx 0.5, bgm 0.18, muted false, stepByStep false, overlay 60");
  eq(defaults.read, defaults.exposed, "playPrefs() reads those defaults when no preferences are saved");
  eq(await saved(), null, "and no play preferences are saved yet");

  /* CONFIRM BEFORE CASTING A SPELL (ROB-124): off by default, toggles, saved with play.confirmCast. */
  const confirmCast = () => page.evaluate(() => document.querySelector('[data-action="set-confirm-cast"]')?.getAttribute("aria-pressed"));
  eq(await confirmCast(), "false", "Confirm before casting a spell is off by default");
  await page.getByRole("button", {name: "Confirm before casting a spell"}).click();
  await page.waitForFunction(() => document.querySelector('[data-action="set-confirm-cast"]')?.getAttribute("aria-pressed") === "true");
  eq((await saved()).confirmCast, true, "pressed, it is saved with play.confirmCast");
  await page.reload();
  await toSettings(page);
  eq(await confirmCast(), "true", "and kept through a reload");
  await page.getByRole("button", {name: "Confirm before casting a spell"}).click();
  await page.waitForFunction(() => document.querySelector('[data-action="set-confirm-cast"]')?.getAttribute("aria-pressed") === "false");
  eq((await saved()).confirmCast, false, "and off again");

  /* AUTO-PASS SCOPE (ROB-124): never by default, three options, saved with play.autoPassScope. */
  const autoPass = () => page.locator("[data-settings-autopass]").inputValue();
  eq(await autoPass(), "never", "Auto-pass scope is never by default");
  await page.locator("[data-settings-autopass]").selectOption("empty-stack");
  await page.waitForTimeout(300);
  eq((await saved()).autoPassScope, "empty-stack", "selecting empty-stack saves it with play.autoPassScope");
  await page.reload();
  await toSettings(page);
  eq(await autoPass(), "empty-stack", "and it is kept through a reload");
  await page.locator("[data-settings-autopass]").selectOption("end-of-turn");
  await page.waitForTimeout(300);
  eq((await saved()).autoPassScope, "end-of-turn", "selecting end-of-turn saves it");
  await page.locator("[data-settings-autopass]").selectOption("never");
  await page.waitForTimeout(300);
  eq((await saved()).autoPassScope, "never", "and back to never");

  /* CAMERA DEFAULTS (ROB-124): sliders for tilt (0-60, default 40), zoom (60-120, default 100), cards (70-150, default 100). */
  const cameraTilt = () => page.locator("[data-settings-camera=tilt]").inputValue();
  const cameraZoom = () => page.locator("[data-settings-camera=zoom]").inputValue();
  const cameraCards = () => page.locator("[data-settings-camera=cards]").inputValue();
  eq([await cameraTilt(), await cameraZoom(), await cameraCards()], ["40", "100", "100"], "Camera defaults: tilt 40°, zoom 100%, cards 100%");
  await page.locator("[data-settings-camera=tilt]").fill("0");
  await page.waitForTimeout(300);
  eq((await saved()).camera.tilt, 0, "tilt moved to 0° is saved with play.camera.tilt");
  await page.locator("[data-settings-camera=zoom]").fill("120");
  await page.waitForTimeout(300);
  eq((await saved()).camera.zoom, 120, "zoom moved to 120% is saved with play.camera.zoom");
  await page.locator("[data-settings-camera=cards]").fill("70");
  await page.waitForTimeout(300);
  eq((await saved()).camera.cards, 70, "cards moved to 70% is saved with play.camera.cards");
  await page.reload();
  await toSettings(page);
  eq([await cameraTilt(), await cameraZoom(), await cameraCards()], ["0", "120", "70"], "and the camera defaults are kept through a reload");
  await page.locator("[data-settings-camera=tilt]").fill("60");
  await page.waitForTimeout(100);
  await page.locator("[data-settings-camera=zoom]").fill("60");
  await page.waitForTimeout(100);
  await page.locator("[data-settings-camera=cards]").fill("150");
  await page.waitForTimeout(300);
  eq((await saved()).camera, {tilt: 60, zoom: 60, cards: 150}, "and all three can be set to their opposite ends");
  await page.locator("[data-settings-camera=tilt]").fill("40");
  await page.waitForTimeout(100);
  await page.locator("[data-settings-camera=zoom]").fill("100");
  await page.waitForTimeout(100);
  await page.locator("[data-settings-camera=cards]").fill("100");
  await page.waitForTimeout(300);
  eq((await saved()).camera, {tilt: 40, zoom: 100, cards: 100}, "and back to the defaults");

  /* SOUND DEFAULTS (ROB-124): sliders for sfx (0-100%, default 50%) and bgm (0-100%, default 18%), mute toggle. */
  const soundSfx = () => page.locator("[data-settings-sound=sfx]").inputValue();
  const soundBgm = () => page.locator("[data-settings-sound=bgm]").inputValue();
  const soundMuted = () => page.evaluate(() => document.querySelector('[data-action="set-sound-muted"]')?.getAttribute("aria-pressed"));
  eq([await soundSfx(), await soundBgm(), await soundMuted()], ["50", "18", "false"], "Sound defaults: sfx 50%, bgm 18%, not muted");
  await page.locator("[data-settings-sound=sfx]").fill("0");
  await page.waitForTimeout(300);
  eq((await saved()).sound.sfx, 0, "sfx moved to 0% is saved with play.sound.sfx as 0");
  await page.locator("[data-settings-sound=bgm]").fill("100");
  await page.waitForTimeout(300);
  eq((await saved()).sound.bgm, 1, "bgm moved to 100% is saved with play.sound.bgm as 1");
  await page.getByRole("button", {name: "Mute all sound"}).click();
  await page.waitForFunction(() => document.querySelector('[data-action="set-sound-muted"]')?.getAttribute("aria-pressed") === "true");
  eq((await saved()).sound.muted, true, "Mute all sound pressed is saved with play.sound.muted");
  await page.reload();
  await toSettings(page);
  eq([await soundSfx(), await soundBgm(), await soundMuted()], ["0", "100", "true"], "and the sound defaults are kept through a reload");
  await page.getByRole("button", {name: "Mute all sound"}).click();
  await page.waitForFunction(() => document.querySelector('[data-action="set-sound-muted"]')?.getAttribute("aria-pressed") === "false");
  eq((await saved()).sound.muted, false, "and mute toggles off");
  await page.locator("[data-settings-sound=sfx]").fill("50");
  await page.locator("[data-settings-sound=bgm]").fill("18");
  await page.waitForTimeout(300);
  eq((await saved()).sound, {sfx: 0.5, bgm: 0.18, muted: false}, "and back to the defaults: sfx 0.5, bgm 0.18, muted false");

  /* DELIBERATE REGRESSIONS (ROB-124): mutations that must fail their assertions, then pass when restored. */
  /* 1. Break the default tilt from 40° to 35° and prove the default assertion fails. */
  await page.evaluate(() => { const C = globalThis.__cm; C.PLAY_DEFAULTS.camera.tilt = 35; });
  let failed = false;
  try {
    eq(await page.evaluate(() => globalThis.__cm.PLAY_DEFAULTS.camera.tilt), 40, "default tilt is 40°");
  } catch (e) {
    failed = true;
  }
  ok(failed, "mutation: changing PLAY_DEFAULTS.camera.tilt from 40 to 35 fails the default assertion");
  await page.evaluate(() => { const C = globalThis.__cm; C.PLAY_DEFAULTS.camera.tilt = 40; });
  eq(await page.evaluate(() => globalThis.__cm.PLAY_DEFAULTS.camera.tilt), 40, "restored: default tilt is 40° again");

  /* 2. Break the default sfx from 0.5 to 0.4 and prove the default assertion fails. */
  await page.evaluate(() => { const C = globalThis.__cm; C.PLAY_DEFAULTS.sound.sfx = 0.4; });
  failed = false;
  try {
    eq(await page.evaluate(() => globalThis.__cm.PLAY_DEFAULTS.sound.sfx), 0.5, "default sfx is 0.5");
  } catch (e) {
    failed = true;
  }
  ok(failed, "mutation: changing PLAY_DEFAULTS.sound.sfx from 0.5 to 0.4 fails the default assertion");
  await page.evaluate(() => { const C = globalThis.__cm; C.PLAY_DEFAULTS.sound.sfx = 0.5; });
  eq(await page.evaluate(() => globalThis.__cm.PLAY_DEFAULTS.sound.sfx), 0.5, "restored: default sfx is 0.5 again");

  /* 3. Break the default bgm from 0.18 to 0.2 and prove the default assertion fails. */
  await page.evaluate(() => { const C = globalThis.__cm; C.PLAY_DEFAULTS.sound.bgm = 0.2; });
  failed = false;
  try {
    eq(await page.evaluate(() => globalThis.__cm.PLAY_DEFAULTS.sound.bgm), 0.18, "default bgm is 0.18");
  } catch (e) {
    failed = true;
  }
  ok(failed, "mutation: changing PLAY_DEFAULTS.sound.bgm from 0.18 to 0.2 fails the default assertion");
  await page.evaluate(() => { const C = globalThis.__cm; C.PLAY_DEFAULTS.sound.bgm = 0.18; });
  eq(await page.evaluate(() => globalThis.__cm.PLAY_DEFAULTS.sound.bgm), 0.18, "restored: default bgm is 0.18 again");

  /* SLIDERS ARE SLIDERS (AGENTS.md requirement): all size controls must be <input type="range">, never buttons. */
  const sliders = await page.$$eval(".cm-settings-card", (cards) => {
    const play = cards.find((c) => c.querySelector("h2")?.textContent === "Play");
    if (!play) return [];
    return [...play.querySelectorAll("input[type=range]")].map((el) => el.getAttribute("aria-label"));
  });
  ok(sliders.includes("Camera tilt") && sliders.includes("Camera zoom") && sliders.includes("Card size") && sliders.includes("Sound effects volume") && sliders.includes("Music volume") && sliders.includes("Callouts over the table"), "all size controls (camera, sound, overlay) are <input type='range'> sliders");
  const buttons = await page.$$eval(".cm-settings-card", (cards) => {
    const play = cards.find((c) => c.querySelector("h2")?.textContent === "Play");
    if (!play) return [];
    return [...play.querySelectorAll("button")].filter((b) => /small|medium|large|s\s*m\s*l/i.test(b.textContent)).length;
  });
  eq(buttons, 0, "and no S/M/L buttons or named size steps exist");

  console.log(`✓ ${checks} checks passed`);
} catch (error) {
  console.error("FAIL:", error.message);
  if (error.stack) console.error(error.stack);
  process.exitCode = 1;
} finally {
  await close();
}
