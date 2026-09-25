import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = 'https://crankmagic.com/';
const ROOT = '/workspace/uat-2026-09-24-cloud-workshop';
const CHROME = '/opt/google/chrome/chrome';
const DECK_NAME = 'UAT-CW-2026-09-24-Atraxa';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(page, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!(await page.locator('text=Opening your library').count())) {
      await sleep(700);
      return;
    }
    await sleep(400);
  }
}
async function dismiss(page) {
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    const close = page.locator('dialog[open] .cm-dialog-close, dialog[open] button[aria-label*="Close" i]').first();
    if (await close.count()) await close.click({ force: true }).catch(() => {});
    await sleep(200);
    if (!(await page.locator('dialog[open]').count())) break;
  }
}
async function shot(page, dir, name) {
  const f = path.join(dir, `${name}.png`);
  await page.screenshot({ path: f, fullPage: false });
  return f;
}

async function createDeck(page, evidenceDir, label) {
  const notes = [];
  await page.goto(BASE + '#decks', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitReady(page);
  await dismiss(page);
  await sleep(500);
  await shot(page, evidenceDir, '20b-decks-before-create');

  await page.locator('[data-action="new-deck"]').first().click({ force: true });
  await sleep(800);
  await shot(page, evidenceDir, '20c-wizard-paths');
  notes.push('wizard paths visible');

  await page.locator('[data-action="wizard-create"]').click({ force: true });
  await sleep(1000);
  await shot(page, evidenceDir, '20d-wizard-create');

  // dump inputs
  let state = await page.evaluate(() => {
    const dlg = document.querySelector('dialog[open]');
    return {
      text: (dlg?.innerText || '').slice(0, 1200),
      inputs: [...document.querySelectorAll('dialog[open] input, dialog[open] textarea')].map((i) => ({
        type: i.type,
        ph: i.placeholder,
        name: i.name,
        id: i.id,
      })),
      actions: [...document.querySelectorAll('dialog[open] [data-action], dialog[open] button')].map((b) => ({
        t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        a: b.getAttribute('data-action') || '',
      })),
    };
  });
  notes.push('after create path: ' + JSON.stringify(state).slice(0, 500));
  console.log(`[${label}] after create`, JSON.stringify(state).slice(0, 800));

  const input = page.locator('dialog[open] input').first();
  if (!(await input.count())) {
    // maybe commander grid already
    await shot(page, evidenceDir, '20e-no-input');
    return { ok: false, notes, deck: null };
  }
  await input.fill('Atraxa, Praetors\' Voice');
  await sleep(1200);
  await shot(page, evidenceDir, '20e-search-atraxa');

  // pick suggestion
  const sug = page.locator('dialog[open] button:has-text("Atraxa"), dialog[open] [data-action="pick-card"], dialog[open] [role="option"], dialog[open] li, dialog[open] .cm-typeahead button').filter({ hasText: /Atraxa/i }).first();
  if (await sug.count()) {
    await sug.click({ force: true });
    notes.push('clicked suggestion');
  } else {
    // try keyboard
    await page.keyboard.press('ArrowDown').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    notes.push('no sug; enter');
  }
  await sleep(1000);
  await shot(page, evidenceDir, '20f-picked');

  state = await page.evaluate(() => {
    const dlg = document.querySelector('dialog[open]');
    return {
      text: (dlg?.innerText || '').slice(0, 1500),
      inputs: [...document.querySelectorAll('dialog[open] input, dialog[open] textarea')].map((i) => ({
        type: i.type,
        ph: i.placeholder,
        name: i.name,
        value: i.value,
      })),
      actions: [...document.querySelectorAll('dialog[open] [data-action], dialog[open] button')].map((b) => ({
        t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        a: b.getAttribute('data-action') || '',
      })),
    };
  });
  console.log(`[${label}] after pick`, JSON.stringify(state).slice(0, 1000));
  notes.push('after pick: ' + state.text.slice(0, 300));

  // fill name if present
  for (const inp of await page.locator('dialog[open] input').all()) {
    const ph = (await inp.getAttribute('placeholder')) || '';
    const name = (await inp.getAttribute('name')) || '';
    const val = await inp.inputValue().catch(() => '');
    if (/name|title|deck/i.test(ph + name) || (!val && (await inp.getAttribute('type')) === 'text')) {
      // don't overwrite commander search if still that
      if (!/commander|search|card/i.test(ph)) {
        await inp.fill(DECK_NAME);
        notes.push('named ' + DECK_NAME);
      }
    }
  }

  // click create/finish buttons
  for (const sel of [
    '[data-action="wizard-finish"]',
    '[data-action="create-deck"]',
    '[data-action="wizard-next"]',
    'button:has-text("Create deck")',
    'button:has-text("Create")',
    'button:has-text("Build")',
    'button:has-text("Done")',
    'button:has-text("Finish")',
    'button:has-text("Next")',
    'button:has-text("Start")',
    'button:has-text("Continue")',
  ]) {
    const b = page.locator(`dialog[open] ${sel}`).first();
    if (await b.count()) {
      const t = await b.textContent();
      const vis = await b.isVisible().catch(() => false);
      console.log(`[${label}] try ${sel} text=${t} vis=${vis}`);
      if (vis) {
        await b.click({ force: true }).catch(async (e) => {
          notes.push('click fail ' + sel + ' ' + e.message);
        });
        await sleep(1200);
        await shot(page, evidenceDir, '20g-after-' + sel.replace(/[^a-z0-9]+/gi, '-'));
        if (!(await page.locator('dialog[open]').count())) break;
      }
    }
  }

  await sleep(1500);
  await shot(page, evidenceDir, '20h-post-create');
  await dismiss(page);
  await page.goto(BASE + '#decks', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await sleep(1000);
  await shot(page, evidenceDir, '24b-decks-after-create');

  const body = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  const found = /Atraxa|UAT-CW/i.test(body);
  console.log(`[${label}] found deck?`, found, body.slice(0, 400));
  notes.push(found ? 'DECK FOUND' : 'DECK NOT IN LIST');
  notes.push(body.slice(0, 400));

  if (found) {
    const link = page.locator('a, button, [data-deck], .cm-deck-row').filter({ hasText: /Atraxa|UAT-CW/i }).first();
    if (await link.count()) {
      await link.click({ force: true }).catch(() => {});
      await sleep(1200);
      await shot(page, evidenceDir, '24c-deck-detail');
      // options / measure / type bars
      const more = page.locator('button:has-text("Options"), button[aria-label*="More" i], button:has-text("⋯"), [data-action="deck-menu"]').first();
      if (await more.count() && (await more.isVisible())) {
        await more.click({ force: true });
        await sleep(500);
        await shot(page, evidenceDir, '41b-deck-options');
        await dismiss(page);
      }
      for (const lab of ['Measure', 'Simulate', 'Lab', 'Tune', 'Edit', 'Export', 'Print']) {
        const b = page.locator(`button:has-text("${lab}")`).first();
        if ((await b.count()) && (await b.isVisible().catch(() => false))) {
          await b.click({ force: true }).catch(() => {});
          await sleep(900);
          await shot(page, evidenceDir, `42b-${lab.toLowerCase()}`);
          await dismiss(page);
        }
      }
    }
  }

  // Import via wizard-import
  await page.goto(BASE + '#decks', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await dismiss(page);
  await page.locator('[data-action="new-deck"]').click({ force: true });
  await sleep(600);
  if (await page.locator('[data-action="wizard-import"]').count()) {
    await page.locator('[data-action="wizard-import"]').click({ force: true });
    await sleep(800);
    await shot(page, evidenceDir, '30b-wizard-import');
    notes.push('wizard-import opened');
  }
  await dismiss(page);

  // Library deeper: add card / search catalog
  await page.goto(BASE + '#cards', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await sleep(800);
  await shot(page, evidenceDir, '50b-library');
  // try Add
  const add = page.locator('button:has-text("Add"), [data-action="add-card"], button:has-text("Add cards")').first();
  if ((await add.count()) && (await add.isVisible().catch(() => false))) {
    await add.click({ force: true });
    await sleep(800);
    await shot(page, evidenceDir, '50c-add-card');
    const inp = page.locator('dialog[open] input').first();
    if (await inp.count()) {
      await inp.fill('Sol Ring');
      await sleep(1000);
      const s = page.locator('dialog[open] button:has-text("Sol Ring"), dialog[open] [role="option"]').first();
      if (await s.count()) await s.click({ force: true });
      await sleep(800);
      await shot(page, evidenceDir, '56b-sol-ring');
      const want = page.locator('dialog[open] button:has-text("Want"), dialog[open] button:has-text("To buy"), dialog[open] button:has-text("Add"), dialog[open] button:has-text("Owned")').first();
      if ((await want.count()) && (await want.isVisible().catch(() => false))) {
        await want.click({ force: true });
        await sleep(600);
        await shot(page, evidenceDir, '57b-status');
      }
    }
    await dismiss(page);
  }
  // views
  for (const v of ['List', 'Sheet', 'Table']) {
    const b = page.locator(`button:has-text("${v}"), [data-view="${v.toLowerCase()}"]`).first();
    if ((await b.count()) && (await b.isVisible().catch(() => false))) {
      await b.click({ force: true });
      await sleep(500);
      await shot(page, evidenceDir, `51b-${v.toLowerCase()}`);
    }
  }

  // Explore door
  await page.goto(BASE + '#discover', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await sleep(1000);
  await shot(page, evidenceDir, '60b-explore');
  const doors = await page.evaluate(() =>
    [...document.querySelectorAll('.cm-explore-door, [data-action*="explore"], button')].map((b) => ({
      t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      a: b.getAttribute('data-action') || '',
      vis: !!(b.offsetParent || b.getClientRects().length),
    })).filter((x) => x.vis && (x.a.includes('explore') || /commander|card|role|deck|gap/i.test(x.t))).slice(0, 20)
  );
  console.log(`[${label}] explore doors`, doors);
  notes.push('doors ' + JSON.stringify(doors).slice(0, 400));
  if (doors.length) {
    const a = doors[0].a;
    if (a) await page.locator(`[data-action="${a}"]`).first().click({ force: true }).catch(() => {});
    else await page.locator('button').filter({ hasText: new RegExp(doors[0].t.slice(0, 20), 'i') }).first().click({ force: true }).catch(() => {});
    await sleep(1000);
    await shot(page, evidenceDir, '61b-explore-door');
    const inp = page.locator('dialog[open] input, input[type="search"], input[type="text"]').first();
    if (await inp.count()) {
      await inp.fill('Atraxa');
      await sleep(1000);
      const s = page.locator('button:has-text("Atraxa"), [role="option"]:has-text("Atraxa")').first();
      if (await s.count()) await s.click({ force: true });
      else await page.keyboard.press('Enter');
      await sleep(2000);
      await shot(page, evidenceDir, '61c-explore-atraxa');
    }
    const canvas = page.locator('canvas').first();
    if (await canvas.count()) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
        await sleep(400);
        await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
        await sleep(800);
      }
      await shot(page, evidenceDir, '62b-graph');
    }
  }

  // Play coming soon detail
  await page.goto(BASE + '#game', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await sleep(800);
  await shot(page, evidenceDir, '05b-play-detail');
  const playText = await page.evaluate(() => (document.querySelector('#cm-main, main, .cm-page') || document.body).innerText.slice(0, 800));
  notes.push('play: ' + playText.slice(0, 300));

  // Account control properly
  await dismiss(page);
  const acctBtns = await page.evaluate(() =>
    [...document.querySelectorAll('button,a')].map((b) => ({
      t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      a: b.getAttribute('data-action') || '',
      aria: b.getAttribute('aria-label') || '',
      vis: !!(b.offsetParent || b.getClientRects().length),
    })).filter((x) => x.vis && /account|sign|log ?in|profile|cloud/i.test(x.t + x.a + x.aria))
  );
  notes.push('acct controls ' + JSON.stringify(acctBtns));
  console.log(`[${label}] acct`, acctBtns);

  // UK english full chrome
  const allText = await page.evaluate(() => document.body.innerText);
  const uk = allText.match(/\b(colour|colours|organise|organised|organisation|centre|centres|catalogue|catalogues|favour|favourite|aluminium|defence|licence|practise|travelling|modelling)\b/gi) || [];
  notes.push('uk hits: ' + [...new Set(uk)].join(','));

  // horizontal scroll + small targets
  const geo = await page.evaluate(() => {
    const small = [];
    for (const el of [...document.querySelectorAll('nav a, button, [data-action]')].slice(0, 150)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32)) {
        small.push({
          t: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    return {
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      small: small.slice(0, 15),
    };
  });
  notes.push('geo ' + JSON.stringify(geo));

  // console
  return { ok: found, deck: found ? DECK_NAME : null, notes, playText, geo, uk: [...new Set(uk)] };
}

async function run(label, viewport) {
  const evidenceDir = path.join(ROOT, 'evidence', label);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const consoleErrs = [];
  const pageErrs = [];
  const failedReqs = [];
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport,
    hasTouch: label === 'mobile',
    isMobile: label === 'mobile',
    userAgent:
      label === 'mobile'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(m.text());
  });
  page.on('pageerror', (e) => pageErrs.push(String(e.message || e)));
  page.on('response', (res) => {
    if (res.status() >= 400) {
      const u = res.url();
      if (!/cloudflareinsights|favicon/i.test(u)) failedReqs.push({ status: res.status(), url: u.slice(0, 180) });
    }
  });
  let result;
  try {
    result = await createDeck(page, evidenceDir, label);
  } catch (e) {
    console.error(label, e);
    await shot(page, evidenceDir, '99b-fatal').catch(() => {});
    result = { ok: false, deck: null, notes: [String(e.stack || e)], playText: '', geo: {}, uk: [] };
  }
  result.consoleErrs = consoleErrs.slice(0, 50);
  result.pageErrs = pageErrs.slice(0, 30);
  result.failedReqs = failedReqs.slice(0, 40);
  await browser.close().catch(() => {});
  fs.writeFileSync(path.join(ROOT, `raw2-${label}.json`), JSON.stringify(result, null, 2));
  return result;
}

const desktop = await run('desktop', { width: 1280, height: 800 });
const mobile = await run('mobile', { width: 390, height: 844 });
console.log('DESKTOP ok', desktop.ok, desktop.deck);
console.log('MOBILE ok', mobile.ok, mobile.deck);
fs.writeFileSync(path.join(ROOT, 'raw2-all.json'), JSON.stringify({ desktop, mobile }, null, 2));
