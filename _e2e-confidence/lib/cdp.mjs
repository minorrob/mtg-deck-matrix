/**
 * CDP attach — Personal-HP Chrome with --remote-debugging-port (default 9222).
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

export function env(name, fallback = '') {
  const v = process.env[name];
  return v == null || v === '' ? fallback : v;
}

export function cfg() {
  return {
    browserURL: env('CM_CDP_URL', 'http://127.0.0.1:9222'),
    appURL: env('CM_APP_URL', 'http://127.0.0.1:8768/app/#game'),
    outDir: env('CM_E2E_OUT', path.resolve('out')),
    matrix: env('CM_MATRIX', 'A'),
    defineStyle: env('CM_DEFINE_STYLE', '1') !== '0',
    guestSeed: env('CM_GUEST_SEED', '0') === '1',
    buildTimeoutMs: Number(env('CM_BUILD_TIMEOUT_MS', '180000')),
    startTimeoutMs: Number(env('CM_START_TIMEOUT_MS', '120000')),
  };
}

export async function connectBrowser(browserURL) {
  return puppeteer.connect({ browserURL, defaultViewport: null, protocolTimeout: 300000 });
}

export async function openAppPage(browser, appURL) {
  const pages = await browser.pages();
  let page = pages.find((p) => /8768/.test(p.url()) || /#game/.test(p.url()));
  if (!page) page = await browser.newPage();
  const consoleLines = [];
  const pageErrors = [];
  page.on('console', (msg) => consoleLines.push({ type: msg.type(), text: msg.text(), t: Date.now() }));
  page.on('pageerror', (err) => pageErrors.push({
    message: String(err && err.message ? err.message : err),
    stack: String(err && err.stack || ''),
    t: Date.now(),
  }));
  await page.goto(appURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!document.querySelector('main, #cm-main, .cm-lobby-seats, .v-panel'), { timeout: 60000 }).catch(() => {});
  return { page, consoleLines, pageErrors };
}

export async function openSecondPage(browser, url) {
  const page = await browser.newPage();
  const consoleLines = [];
  const pageErrors = [];
  page.on('console', (msg) => consoleLines.push({ type: msg.type(), text: msg.text(), t: Date.now() }));
  page.on('pageerror', (err) => pageErrors.push({ message: String(err.message || err), stack: String(err.stack || ''), t: Date.now() }));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return { page, consoleLines, pageErrors };
}

export function ensureOut(outDir, matrix) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const runDir = path.join(outDir, `matrix-${matrix}-${stamp}`);
  fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
  return runDir;
}

export async function shot(page, runDir, name) {
  const file = path.join(runDir, 'screenshots', `${name}.png`);
  try { await page.screenshot({ path: file, fullPage: true }); }
  catch { try { await page.screenshot({ path: file }); } catch {} }
  return file;
}
