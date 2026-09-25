/**
 * Read-only UAT walker for Personal-HP. Zero product edits.
 * Usage (PowerShell on HP):
 *   $node = 'C:\Users\robmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
 *   & $node evidence/hp-playwright-uat.mjs
 * Requires: playwright installed for that node (or PLAYWRIGHT_BROWSERS_PATH).
 * Writes: evidence/hp-walk.json + evidence/shots/*.png next to this file's ../
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname);
const shotDir = path.join(outDir, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const LOCAL = process.env.UAT_LOCAL || 'http://127.0.0.1:8790/';
const HOST = process.env.UAT_HOST || 'http://127.0.0.1:8768/';
const PAGES = process.env.UAT_PAGES || 'https://minorrob.github.io/mtg-deck-matrix/';
const nodeHint = process.env.UAT_NODE || 'C:\\Users\\robmi\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';

const results = [];
const note = (id, platform, result, severity, evidence) => results.push({ id, platform, result, severity, evidence });

async function settle(page, ms = 1200) {
  await page.waitForTimeout(ms);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function shot(page, name) {
  const p = path.join(shotDir, name);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

async function walkApp(page, platform, base) {
  for (const hash of ['#decks', '#cards', '#discover', '#game']) {
    await page.goto(base + hash, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, hash === '#discover' ? 2500 : 1200);
    const main = await page.locator('#cm-main, main, body').first().innerText().catch(() => '');
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    await shot(page, `${platform}${hash.replace('#', '-')}.png`);
    note(`XC-${hash}`, platform, main.trim().length > 40 ? 'Pass' : 'Fail', 'S2', `chars=${main.trim().length}; pageerrors=${errors.length}`);
  }
  // Lobby honesty sample
  await page.goto(base + '#game', { waitUntil: 'domcontentloaded' });
  await settle(page, 2000);
  const body = await page.locator('body').innerText();
  const honest = /Open the local host to play|Open http:\/\/127\.0\.0\.1:8768/i.test(body);
  const lying = /Every seat is ready\. Starting/i.test(body) && platform === 'pages';
  note('LOB-honesty', platform, lying ? 'Fail' : honest || platform === 'local' ? 'Pass' : 'Partial', 'S2', body.slice(0, 400).replace(/\s+/g, ' '));
  await shot(page, `${platform}-game-lobby.png`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.UAT_CHROME || undefined,
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

try {
  note('META', 'hp', 'Info', 'S4', `nodeHint=${nodeHint}; local=${LOCAL}; host=${HOST}; pages=${PAGES}`);
  await walkApp(page, 'local8790', LOCAL.endsWith('/') ? LOCAL : LOCAL + '/');
  await walkApp(page, 'pages', PAGES.endsWith('/') ? PAGES : PAGES + '/');
  // Host root probe
  const hostRes = await page.goto(HOST, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => e);
  note('HOST-8768', 'local', hostRes && hostRes.ok && hostRes.ok() ? 'Pass' : 'Fail', 'S1', String(hostRes && hostRes.url ? hostRes.url() : hostRes));
  await shot(page, 'host-8768.png');
} finally {
  await browser.close();
}

const out = path.join(outDir, 'hp-walk.json');
fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), results }, null, 2));
console.log('Wrote', out, 'results', results.length);
