#!/usr/bin/env node
/**
 * Read-only status probe against Personal-HP CDP + host.
 *   CM_CDP_URL=http://127.0.0.1:9222 CM_APP_URL=http://127.0.0.1:8768/app/#game node scripts/probe-status.mjs
 */
import { cfg, connectBrowser, openAppPage } from '../lib/cdp.mjs';
import { dumpLobby } from '../lib/capture.mjs';

const conf = cfg();
const out = { at: new Date().toISOString(), appURL: conf.appURL, browserURL: conf.browserURL };

async function fetchJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const origin = new URL(conf.appURL).origin;
out.hostLive = await fetchJson(`${origin}/api/live`);
out.hostHealth = await fetchJson(`${origin}/api/health`);

try {
  const browser = await connectBrowser(conf.browserURL);
  out.cdp = { ok: true, version: await browser.version() };
  const { page } = await openAppPage(browser, conf.appURL);
  out.page = { url: page.url(), title: await page.title() };
  out.assets = await page.evaluate(() => ({
    gameJs: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter((s) => /game\.js/i.test(s || '')),
    css: [...document.querySelectorAll('link[rel="stylesheet"]')].map((s) => s.getAttribute('href')).filter((s) => /crankmagic\.css|game/i.test(s || '')),
  }));
  out.lobby = await dumpLobby(page);
  await browser.disconnect();
} catch (err) {
  out.cdp = { ok: false, error: err.message };
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.cdp?.ok ? 0 : 2);
