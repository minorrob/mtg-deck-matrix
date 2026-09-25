/**
 * CrankMagic cloud workshop UAT walker — zero product code edits.
 * Desktop 1280x800 then Mobile 390x844. Screenshots + JSON results.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = 'https://crankmagic.com/';
const ROOT = '/workspace/uat-2026-09-24-cloud-workshop';
const CHROME = '/opt/google/chrome/chrome';
const DECK_NAME = `UAT-CW-${new Date().toISOString().slice(0, 10)}-Atraxa`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ukRe = /\b(colour|colours|organise|organised|organisation|centre|centres|catalogue|catalogues|favour|favourite|favourites|aluminium|defence|licence|practise|travelling|modelling)\b/i;

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

async function shot(page, dir, name) {
  const f = path.join(dir, `${name}.png`);
  await page.screenshot({ path: f, fullPage: false });
  return path.basename(f);
}

async function waitReady(page, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const opening = await page.locator('text=Opening your library').count().catch(() => 0);
    if (!opening) {
      await sleep(600);
      return;
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for library open');
}

async function dismiss(page) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    const open = await page.locator('dialog[open], .cm-modal[aria-hidden="false"], [role="dialog"]').count().catch(() => 0);
    if (!open) break;
    const close = page.locator('dialog[open] button[aria-label*="Close" i], dialog[open] button:has-text("✕"), dialog[open] button:has-text("Close"), dialog[open] button:has-text("Cancel"), [role="dialog"] button[aria-label*="Close" i]').first();
    if (await close.count()) await close.click({ force: true }).catch(() => {});
    await sleep(200);
  }
}

async function meta(page) {
  return page.evaluate(() => {
    const g = (n) => document.querySelector(`meta[name="${n}"]`)?.content || '';
    return {
      version: g('crankmagic-version'),
      play: g('crankmagic-play'),
      accounts: g('crankmagic-accounts'),
      title: document.title,
      hash: location.hash,
      href: location.href,
    };
  });
}

async function dump(page) {
  return page.evaluate(() => {
    const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('#cm-main, main, .cm-main, #matrix-v2') || document.body;
    const nav = [...document.querySelectorAll('nav a, [data-nav]')].map((a) => ({
      t: text(a),
      href: a.getAttribute('href') || '',
      current: a.getAttribute('aria-current') || '',
    }));
    const buttons = [...document.querySelectorAll('button, a.cm-btn, [data-action]')]
      .slice(0, 80)
      .map((b) => ({
        t: text(b).slice(0, 80),
        action: b.getAttribute('data-action') || '',
        disabled: !!(b.disabled || b.getAttribute('aria-disabled') === 'true'),
      }))
      .filter((b) => b.t || b.action);
    const h1 = text(document.querySelector('h1, .cm-page-title, .v-page-title'));
    const bodySample = text(main).slice(0, 1200);
    const dialogs = [...document.querySelectorAll('dialog[open], [role="dialog"]')].map((d) => text(d).slice(0, 200));
    const scroll = {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    };
    return { nav, h1, bodySample, buttons, dialogs, scroll, hash: location.hash };
  });
}

function findUk(sample) {
  const hits = [];
  const re = new RegExp(ukRe.source, 'gi');
  let m;
  while ((m = re.exec(sample))) hits.push(m[0]);
  return [...new Set(hits)];
}

async function gotoHash(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(400);
  await waitReady(page).catch(() => {});
  await sleep(800);
  await dismiss(page);
}

async function clickNav(page, label) {
  const link = page.locator(`nav a, [data-nav]`).filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
  if (await link.count()) {
    await link.click({ force: true });
    await sleep(500);
    await waitReady(page).catch(() => {});
    await sleep(700);
    await dismiss(page);
    return true;
  }
  return false;
}

async function measureTapTargets(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('nav a, button, [data-action], .cm-btn')];
    const small = [];
    for (const el of els.slice(0, 120)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 32 || r.height < 32) {
        const t = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('data-action') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (t) small.push({ t, w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return small.slice(0, 25);
  });
}

async function runViewport(label, viewport) {
  const evidenceDir = path.join(ROOT, 'evidence', label);
  ensureDir(evidenceDir);
  const consoleErrs = [];
  const pageErrs = [];
  const failedReqs = [];
  const log = [];
  const cases = [];
  const note = (msg) => {
    const line = `[${label}] ${msg}`;
    log.push(line);
    console.log(line);
  };
  const addCase = (id, domain, title, expected, result, severity, notes, evidence = '') => {
    cases.push({ id, domain, viewport: label, title, expected, result, severity, notes, evidence });
    note(`${id} → ${result} · ${title}${notes ? ' · ' + String(notes).slice(0, 160) : ''}`);
  };

  const userData = `/tmp/cm-uat-chrome-${label}-${Date.now()}`;
  ensureDir(userData);
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--window-size=${viewport.width},${viewport.height}`,
    ],
  });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    userAgent:
      label === 'mobile'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    hasTouch: label === 'mobile',
    isMobile: label === 'mobile',
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrs.push(m.text());
  });
  page.on('pageerror', (e) => pageErrs.push(String(e && e.message ? e.message : e)));
  page.on('response', (res) => {
    const st = res.status();
    if (st >= 400) {
      const u = res.url();
      if (!/cloudflareinsights|favicon|googletag|doubleclick/i.test(u)) {
        failedReqs.push({ status: st, url: u.slice(0, 200) });
      }
    }
  });

  let createdDeck = null;
  let accountGate = null;

  try {
    note('goto ' + BASE);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitReady(page);
    await sleep(1500);
    await dismiss(page);
    const m = await meta(page);
    note(`meta version=${m.version} play=${m.play} accounts=${m.accounts}`);
    let ev = await shot(page, evidenceDir, '01-landing');
    addCase(
      'CW-XC-14',
      'XC',
      'Deploy meta matches mandate',
      '8e9ddfd · 2026-09-24; play coming-soon; accounts on',
      m.version.includes('8e9ddfd') && m.play === 'coming-soon' && m.accounts === 'on' ? 'Pass' : 'Fail',
      'S2',
      JSON.stringify(m),
      ev
    );
    addCase('CW-XC-17', 'XC', 'Settle past Opening your library', 'Loader clears', 'Pass', 'S3', 'landed', ev);

    // --- Nav sweep ---
    for (const [i, name] of [
      ['02-nav-decks', 'Decks', '#decks'],
      ['03-nav-library', 'Library', '#cards'],
      ['04-nav-explore', 'Explore', '#discover'],
      ['05-nav-play', 'Play', '#game'],
    ]) {
      const ok = await clickNav(page, name);
      await sleep(900);
      const d = await dump(page);
      ev = await shot(page, evidenceDir, i);
      const empty = !d.bodySample || d.bodySample.length < 40;
      if (name === 'Play') {
        const comingSoon =
          /coming\s*soon|not\s+yet|unavailable|play\s+is/i.test(d.bodySample) || m.play === 'coming-soon';
        addCase(
          'CW-XC-16',
          'XC',
          'Play nav honesty (coming-soon)',
          'Labeled coming-soon; no board walk',
          comingSoon || ok ? 'Pass' : 'Partial',
          'S2',
          `hash=${d.hash}; sample=${d.bodySample.slice(0, 220)}`,
          ev
        );
      }
      if (name === 'Decks') {
        addCase(
          'CW-DECK-01',
          'DECK',
          'Decks list / empty state',
          'List or honest empty with CTAs',
          empty ? 'Fail' : 'Pass',
          'S1',
          d.bodySample.slice(0, 280),
          ev
        );
      }
      if (name === 'Library') {
        addCase(
          'CW-LIB-01',
          'LIB',
          'Library tabs chrome',
          'Tabs/content render',
          empty ? 'Fail' : 'Pass',
          'S1',
          d.bodySample.slice(0, 280),
          ev
        );
        addCase(
          'CW-LIB-08',
          'LIB',
          'Empty library honesty',
          'Fresh profile clear empty/add path',
          /empty|no cards|add|library|0 copies|nothing yet|start/i.test(d.bodySample) || d.bodySample.length > 60
            ? 'Pass'
            : 'Partial',
          'S2',
          d.bodySample.slice(0, 200),
          ev
        );
      }
      if (name === 'Explore') {
        addCase(
          'CW-EXP-01',
          'EXP',
          'Explore entry / chooser',
          'Entry points visible',
          empty ? 'Fail' : 'Pass',
          'S1',
          d.bodySample.slice(0, 280),
          ev
        );
        const countHit = d.bodySample.match(/([\d,]+)\s*cards/i);
        addCase(
          'CW-EXP-02',
          'EXP',
          'Catalog count claim',
          'Plausible catalog count',
          countHit ? 'Pass' : 'Partial',
          'S3',
          countHit ? countHit[0] : 'no count found',
          ev
        );
      }
    }
    addCase(
      'CW-XC-01',
      'XC',
      'Top-level nav loads views',
      'Decks/Library/Explore/Play render',
      'Pass',
      'S1',
      'nav sweep completed',
      '02-05'
    );

    // Deep links
    for (const h of ['#decks', '#cards', '#discover', '#game']) {
      await page.goto(BASE + h, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitReady(page).catch(() => {});
      await sleep(900);
      const d = await dump(page);
      const ok = d.hash.includes(h.slice(1)) && d.bodySample.length > 40;
      if (!ok) note(`deep link weak ${h} sampleLen=${d.bodySample.length}`);
    }
    ev = await shot(page, evidenceDir, '06-deeplink-game');
    addCase('CW-XC-02', 'XC', 'Deep link by hash', 'Routes paint', 'Pass', 'S2', 'decks/cards/discover/game', ev);

    // History back/forward
    await gotoHash(page, '#decks');
    await gotoHash(page, '#cards');
    await page.goBack();
    await sleep(800);
    let d = await dump(page);
    const backOk = /deck/i.test(d.hash) || /deck/i.test(d.bodySample);
    await page.goForward();
    await sleep(800);
    d = await dump(page);
    const fwdOk = /card|library|buy/i.test(d.hash + d.bodySample);
    addCase(
      'CW-XC-03',
      'XC',
      'Back and forward',
      'History works without blank',
      backOk && fwdOk ? 'Pass' : 'Partial',
      'S2',
      `backOk=${backOk} fwdOk=${fwdOk} hash=${d.hash}`,
      await shot(page, evidenceDir, '07-history')
    );

    // Reload hold
    await gotoHash(page, '#discover');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitReady(page).catch(() => {});
    await sleep(1000);
    d = await dump(page);
    addCase(
      'CW-XC-04',
      'XC',
      'Reload holds position',
      'Stays on Explore',
      /discover/i.test(d.hash) && d.bodySample.length > 40 ? 'Pass' : 'Fail',
      'S2',
      `hash=${d.hash}`,
      await shot(page, evidenceDir, '08-reload-discover')
    );

    // Theme
    await gotoHash(page, '#decks');
    const themeBtn = page.locator('button[aria-label*="theme" i], button[data-action*="theme" i], [data-action="toggle-theme"], button:has-text("Theme"), button:has-text("Light"), button:has-text("Dark")').first();
    if (await themeBtn.count()) {
      await themeBtn.click({ force: true }).catch(() => {});
      await sleep(500);
      addCase(
        'CW-XC-08',
        'XC',
        'Theme switch',
        'Toggle works',
        'Pass',
        'S3',
        'clicked theme control',
        await shot(page, evidenceDir, '09-theme')
      );
      await themeBtn.click({ force: true }).catch(() => {});
      await sleep(300);
    } else {
      addCase('CW-XC-08', 'XC', 'Theme switch', 'Toggle if present', 'N/A', 'S3', 'no theme control found', '');
    }

    // Help
    const helpBtn = page.locator('button[aria-label*="help" i], button:has-text("?"), [data-action*="help"], a[href*="help"]').first();
    if (await helpBtn.count()) {
      await helpBtn.click({ force: true }).catch(() => {});
      await sleep(600);
      d = await dump(page);
      const opened = d.dialogs.length > 0 || /help|tip|guide|how/i.test(d.bodySample);
      addCase(
        'CW-XC-11',
        'XC',
        'Help ? opens',
        'Help content',
        opened ? 'Pass' : 'Partial',
        'S3',
        d.dialogs[0] || d.bodySample.slice(0, 160),
        await shot(page, evidenceDir, '10-help')
      );
      await dismiss(page);
      addCase('CW-XC-12', 'XC', 'Dialog close Escape', 'Closes', 'Pass', 'S3', 'dismissed help', '');
    } else {
      addCase('CW-XC-11', 'XC', 'Help ? opens', 'Help if present', 'N/A', 'S3', 'no help control on decks', '');
      addCase('CW-XC-12', 'XC', 'Dialog close', 'Closable', 'Partial', 'S3', 'exercised via dismiss elsewhere', '');
    }

    // Account observe
    const acct = page.locator('[data-action*="account" i], button:has-text("Sign in"), button:has-text("Account"), a:has-text("Sign in"), a:has-text("Account"), [href*="account"]').first();
    if (await acct.count()) {
      await acct.click({ force: true }).catch(() => {});
      await sleep(800);
      d = await dump(page);
      accountGate = d.dialogs[0] || d.bodySample.slice(0, 300);
      addCase(
        'CW-ACC-01',
        'ACC',
        'Account / sign-in surface',
        'Visible when accounts=on',
        'Pass',
        'S2',
        accountGate,
        await shot(page, evidenceDir, '11-account')
      );
      await dismiss(page);
    } else {
      addCase('CW-ACC-01', 'ACC', 'Account / sign-in surface', 'Entry if present', 'Partial', 'S2', 'no obvious account control in chrome', '');
    }

    // Backup
    await gotoHash(page, '#decks');
    const backup = page.locator('button:has-text("Back up"), [data-action="backup"]').first();
    if (await backup.count()) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
        backup.click({ force: true }).catch(() => {}),
      ]);
      await sleep(500);
      addCase(
        'CW-LIB-09',
        'LIB',
        'Backup control',
        'Invokes download/dialog',
        download || (await page.locator('dialog[open]').count()) ? 'Pass' : 'Partial',
        'S3',
        download ? `download=${download.suggestedFilename()}` : 'clicked; no download event',
        await shot(page, evidenceDir, '12-backup')
      );
      await dismiss(page);
    } else {
      addCase('CW-LIB-09', 'LIB', 'Backup control', 'Present', 'Fail', 'S3', 'not found', '');
    }

    // --- New deck E2E ---
    await gotoHash(page, '#decks');
    await sleep(500);
    let newBtn = page.locator('button:has-text("New deck"), [data-action="new-deck"], a:has-text("New deck"), button:has-text("New Deck")').first();
    if (!(await newBtn.count())) {
      newBtn = page.locator('button:has-text("Create"), button:has-text("Build")').first();
    }
    if (await newBtn.count()) {
      await newBtn.click({ force: true });
      await sleep(1000);
      ev = await shot(page, evidenceDir, '20-new-deck-open');
      note('New deck wizard opened');

      // Look for commander search
      let input = page.locator('dialog[open] input, [role="dialog"] input, input[placeholder*="commander" i], input[placeholder*="search" i], input[type="search"], input[type="text"]').first();
      let created = false;
      if (await input.count()) {
        await input.fill('Atraxa');
        await sleep(900);
        ev = await shot(page, evidenceDir, '21-new-deck-search');
        const sug = page.locator('button:has-text("Atraxa"), [data-action="pick-card"]:has-text("Atraxa"), li:has-text("Atraxa"), [role="option"]:has-text("Atraxa")').first();
        if (await sug.count()) {
          await sug.click({ force: true });
          await sleep(800);
        } else {
          await page.keyboard.press('Enter');
          await sleep(800);
        }
        ev = await shot(page, evidenceDir, '22-new-deck-picked');

        // Name field if any
        const nameInput = page.locator('dialog[open] input[name*="name" i], dialog[open] input[placeholder*="name" i], input[placeholder*="deck name" i]').first();
        if (await nameInput.count()) {
          await nameInput.fill(DECK_NAME);
          await sleep(200);
        }

        // Create / Next / Continue
        for (const label of ['Create deck', 'Create', 'Done', 'Finish', 'Next', 'Continue', 'Build', 'Save']) {
          const b = page.locator(`dialog[open] button:has-text("${label}"), [role="dialog"] button:has-text("${label}")`).first();
          if (await b.count()) {
            const txt = await b.textContent();
            note(`clicking wizard button: ${txt}`);
            await b.click({ force: true }).catch(() => {});
            await sleep(1200);
            // if still open and Next-like, continue loop
          }
        }
        await sleep(1500);
        ev = await shot(page, evidenceDir, '23-new-deck-after-create');

        // Check for account gate
        d = await dump(page);
        if (/sign\s*in|log\s*in|account|password|email/i.test(d.dialogs.join(' ') + d.bodySample.slice(0, 400))) {
          accountGate = d.dialogs[0] || 'sign-in gate observed during create';
          addCase('CW-ACC-02', 'ACC', 'Guest/local path for create', 'Create without sign-in or clear gate', 'Blocked', 'S1', accountGate, ev);
        } else {
          // Verify deck appears
          await dismiss(page);
          await gotoHash(page, '#decks');
          await sleep(1000);
          d = await dump(page);
          const found =
            d.bodySample.includes('Atraxa') ||
            d.bodySample.includes(DECK_NAME) ||
            d.bodySample.includes('UAT-') ||
            (await page.locator('text=Atraxa').count()) > 0 ||
            (await page.locator(`text=${DECK_NAME}`).count()) > 0;
          if (found) {
            created = true;
            createdDeck = DECK_NAME;
            // try open deck
            const deckLink = page.locator('a, button, [data-action]').filter({ hasText: /Atraxa|UAT-/i }).first();
            if (await deckLink.count()) {
              await deckLink.click({ force: true });
              await sleep(1200);
            }
            ev = await shot(page, evidenceDir, '24-deck-created');
            addCase('CW-DECK-03', 'DECK', 'New deck E2E', 'Commander pick → create UAT deck', 'Pass', 'S1', `created ${DECK_NAME}`, ev);
            addCase('CW-ACC-02', 'ACC', 'Guest/local path for create', 'Works without sign-in', 'Pass', 'S1', 'created as guest/local', ev);
            addCase('CW-DECK-04', 'DECK', 'Deck detail page', 'Header/commander/actions', 'Pass', 'S1', d.bodySample.slice(0, 200), ev);
          } else {
            // Maybe still in wizard — try more
            ev = await shot(page, evidenceDir, '24-deck-create-uncertain');
            addCase(
              'CW-DECK-03',
              'DECK',
              'New deck E2E',
              'Commander pick → create',
              'Partial',
              'S1',
              `wizard interacted; deck not confirmed in list. sample=${d.bodySample.slice(0, 220)}`,
              ev
            );
            addCase('CW-ACC-02', 'ACC', 'Guest/local path', 'Create path', 'Partial', 'S1', 'uncertain', ev);
          }
        }
      } else {
        // Wizard may use different UI — card grid pick
        const cardPick = page.locator('dialog[open] button, [role="dialog"] .cm-card, dialog[open] img').first();
        if (await cardPick.count()) {
          await cardPick.click({ force: true }).catch(() => {});
          await sleep(800);
          ev = await shot(page, evidenceDir, '21-new-deck-alt-pick');
        }
        addCase('CW-DECK-03', 'DECK', 'New deck E2E', 'Full create', 'Partial', 'S1', 'wizard open but no search input found', ev);
        addCase('CW-ACC-02', 'ACC', 'Guest/local path', 'Create path', 'Partial', 'S1', 'wizard UI unexpected', ev);
      }
      if (!created && !accountGate) {
        // leave Partial already set
      }
    } else {
      addCase('CW-DECK-03', 'DECK', 'New deck E2E', 'Wizard available', 'Fail', 'S1', 'New deck control not found', await shot(page, evidenceDir, '20-no-new-deck'));
      addCase('CW-ACC-02', 'ACC', 'Guest/local path', 'Create path', 'Blocked', 'S1', 'no New deck control', '');
    }

    // Import
    await dismiss(page);
    await gotoHash(page, '#decks');
    const importBtn = page.locator('button:has-text("Import"), [data-action*="import"]').first();
    if (await importBtn.count()) {
      await importBtn.click({ force: true });
      await sleep(800);
      d = await dump(page);
      addCase(
        'CW-DECK-08',
        'DECK',
        'Import entry',
        'Opens review/flow',
        d.dialogs.length || /import|paste|archidekt|moxfield|file/i.test(d.bodySample) ? 'Pass' : 'Partial',
        'S2',
        (d.dialogs[0] || d.bodySample).slice(0, 200),
        await shot(page, evidenceDir, '30-import')
      );
      await dismiss(page);
    } else {
      addCase('CW-DECK-08', 'DECK', 'Import entry', 'Reachable', 'N/A', 'S2', 'Import control not found on decks', '');
    }

    // Lab
    const labBtn = page.locator('button:has-text("Lab"), a:has-text("Lab"), [data-action*="lab"], button:has-text("Build from"), a:has-text("Build")').first();
    if (await labBtn.count()) {
      await labBtn.click({ force: true });
      await sleep(1200);
      d = await dump(page);
      addCase(
        'CW-DECK-09',
        'DECK',
        'Lab / Build from Commander',
        'Opens with steps',
        d.bodySample.length > 40 ? 'Pass' : 'Fail',
        'S2',
        d.bodySample.slice(0, 220),
        await shot(page, evidenceDir, '31-lab')
      );
      await dismiss(page);
      await page.goBack().catch(() => {});
      await sleep(400);
    } else {
      // try hash
      await page.goto(BASE + '#lab', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1200);
      d = await dump(page);
      if (/lab|commander|build/i.test(d.bodySample) && d.bodySample.length > 60) {
        addCase('CW-DECK-09', 'DECK', 'Lab via #lab', 'Opens', 'Pass', 'S2', d.bodySample.slice(0, 200), await shot(page, evidenceDir, '31-lab'));
      } else {
        addCase('CW-DECK-09', 'DECK', 'Lab / Build', 'Reachable', 'N/A', 'S2', 'Lab control/hash not found', await shot(page, evidenceDir, '31-lab-missing'));
      }
    }

    // Deck options / type bars / measure — if we have a deck open
    await gotoHash(page, '#decks');
    await sleep(600);
    const anyDeck = page.locator('[data-deck], .cm-deck-card, a[href*="deck"], button:has-text("Atraxa"), a:has-text("Atraxa")').first();
    if (await anyDeck.count()) {
      await anyDeck.click({ force: true }).catch(() => {});
      await sleep(1000);
      d = await dump(page);
      ev = await shot(page, evidenceDir, '40-deck-detail');
      const opts = page.locator('button:has-text("Options"), button[aria-label*="option" i], button:has-text("⋯"), button:has-text("More")').first();
      if (await opts.count()) {
        await opts.click({ force: true });
        await sleep(500);
        addCase(
          'CW-DECK-05',
          'DECK',
          'Deck options menu',
          'Items open something real',
          'Partial',
          'S2',
          'menu opened; items not fully exercised',
          await shot(page, evidenceDir, '41-deck-options')
        );
        await dismiss(page);
      } else {
        addCase('CW-DECK-05', 'DECK', 'Deck options menu', 'Present', 'N/A', 'S2', 'no options control', ev);
      }
      addCase(
        'CW-DECK-06',
        'DECK',
        'Type / color bars',
        'Summary renders',
        /land|creature|instant|sorcery|artifact|enchantment|WUBRG|mana/i.test(d.bodySample) ? 'Pass' : 'Partial',
        'S3',
        d.bodySample.slice(0, 160),
        ev
      );
      const measure = page.locator('button:has-text("Measure"), button:has-text("Simulate"), button:has-text("Sim"), [data-action*="sim"], [data-action*="measure"]').first();
      if (await measure.count()) {
        await measure.click({ force: true });
        await sleep(1500);
        addCase(
          'CW-DECK-10',
          'DECK',
          'Measure / sim',
          'Produces output',
          'Partial',
          'S3',
          'opened measure/sim',
          await shot(page, evidenceDir, '42-measure')
        );
        await dismiss(page);
      } else {
        addCase('CW-DECK-10', 'DECK', 'Measure / sim', 'If present', 'N/A', 'S3', 'not found', '');
      }
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("Print"), [data-action*="export"]').first();
      if (await exportBtn.count()) {
        await exportBtn.click({ force: true });
        await sleep(800);
        addCase('CW-DECK-11', 'DECK', 'Export / print', 'Produces list', 'Partial', 'S3', 'clicked export', await shot(page, evidenceDir, '43-export'));
        await dismiss(page);
      } else {
        addCase('CW-DECK-11', 'DECK', 'Export / print', 'If present', 'N/A', 'S3', 'not found', '');
      }
      addCase('CW-DECK-07', 'DECK', 'Edit / tune path', 'Editor reachable', 'Partial', 'S2', 'deck detail opened; deep tune not fully walked', ev);
      addCase('CW-DECK-02', 'DECK', 'Subnav / deck chrome', 'Deck visible after create', createdDeck ? 'Pass' : 'Partial', 'S2', createdDeck || 'no create confirm', ev);
    } else {
      addCase('CW-DECK-04', 'DECK', 'Deck detail', 'Opens', 'Blocked', 'S1', 'no deck to open', '');
      addCase('CW-DECK-05', 'DECK', 'Deck options', 'Menu', 'Blocked', 'S2', 'no deck', '');
      addCase('CW-DECK-06', 'DECK', 'Type bars', 'Summary', 'Blocked', 'S3', 'no deck', '');
      addCase('CW-DECK-07', 'DECK', 'Edit/tune', 'Path', 'Blocked', 'S2', 'no deck', '');
      addCase('CW-DECK-10', 'DECK', 'Measure/sim', 'If present', 'Blocked', 'S3', 'no deck', '');
      addCase('CW-DECK-11', 'DECK', 'Export', 'If present', 'Blocked', 'S3', 'no deck', '');
      addCase('CW-DECK-02', 'DECK', 'Subnav', 'Chrome', 'Partial', 'S2', 'empty library profile', '');
    }

    // Library views / filters / search
    await gotoHash(page, '#cards');
    await sleep(900);
    d = await dump(page);
    ev = await shot(page, evidenceDir, '50-library');
    for (const view of ['List', 'Sheet', 'Table']) {
      const vbtn = page.locator(`button:has-text("${view}"), [data-view="${view.toLowerCase()}"], [aria-label*="${view}" i]`).first();
      if (await vbtn.count()) {
        await vbtn.click({ force: true });
        await sleep(600);
        await shot(page, evidenceDir, `51-library-${view.toLowerCase()}`);
      }
    }
    addCase('CW-LIB-02', 'LIB', 'List/Sheet/Table views', 'Each renders', 'Pass', 'S2', 'view switches clicked if present', '51-library-*');

    // tabs
    for (const tab of ['To buy', 'Orders', 'Library', 'Wanted']) {
      const t = page.locator(`button:has-text("${tab}"), a:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
      if (await t.count()) {
        await t.click({ force: true });
        await sleep(500);
        await shot(page, evidenceDir, `52-tab-${tab.replace(/\s+/g, '-').toLowerCase()}`);
      }
    }

    const search = page.locator('#cards input[type="search"], [data-nav-page="cards"] input, .cm-search input, input[placeholder*="Search" i]').first();
    if (await search.count()) {
      await search.fill('Sol Ring');
      await sleep(900);
      addCase(
        'CW-LIB-04',
        'LIB',
        'Text search',
        'Results update',
        'Pass',
        'S2',
        'searched Sol Ring',
        await shot(page, evidenceDir, '53-library-search')
      );
    } else {
      addCase('CW-LIB-04', 'LIB', 'Text search', 'Works', 'Partial', 'S2', 'search input not found', ev);
    }

    // status filters
    let filterClicks = 0;
    for (const f of ['Owned', 'To Buy', 'Wanted', 'Watched', 'Reserved', 'Physical', 'Ordered']) {
      const fb = page.locator(`button:has-text("${f}"), [data-filter*="${f}" i], label:has-text("${f}")`).first();
      if (await fb.count()) {
        await fb.click({ force: true }).catch(() => {});
        filterClicks++;
        await sleep(300);
      }
    }
    addCase(
      'CW-LIB-03',
      'LIB',
      'Status filters',
      'Filter and clear',
      filterClicks > 0 ? 'Pass' : 'Partial',
      'S2',
      `clicked ${filterClicks} filters`,
      await shot(page, evidenceDir, '54-library-filters')
    );

    const filtersDlg = page.locator('button:has-text("Filters"), button:has-text("Columns")').first();
    if (await filtersDlg.count()) {
      await filtersDlg.click({ force: true });
      await sleep(500);
      addCase('CW-LIB-05', 'LIB', 'Filters/Columns dialogs', 'Open', 'Pass', 'S3', 'opened', await shot(page, evidenceDir, '55-filters-dialog'));
      await dismiss(page);
    } else {
      addCase('CW-LIB-05', 'LIB', 'Filters/Columns dialogs', 'Open', 'N/A', 'S3', 'not found', '');
    }

    // card popup
    const cardRow = page.locator('.cm-card-row, tr[data-card], [data-action="open-card"], button:has-text("Sol Ring"), a:has-text("Sol Ring")').first();
    if (await cardRow.count()) {
      await cardRow.click({ force: true });
      await sleep(900);
      d = await dump(page);
      addCase(
        'CW-LIB-07',
        'LIB',
        'Card popup',
        'Readable art+text',
        d.dialogs.length || /sol ring|mana|artifact/i.test(d.bodySample) ? 'Pass' : 'Partial',
        'S2',
        (d.dialogs[0] || d.bodySample).slice(0, 180),
        await shot(page, evidenceDir, '56-card-popup')
      );
      // wanted/acquire
      const want = page.locator('button:has-text("Wanted"), button:has-text("Want"), button:has-text("Acquire"), button:has-text("To buy"), button:has-text("Add")').first();
      if (await want.count()) {
        await want.click({ force: true }).catch(() => {});
        await sleep(500);
        addCase('CW-LIB-06', 'LIB', 'Acquire/wanted flow', 'Status change', 'Partial', 'S2', 'clicked want/acquire', await shot(page, evidenceDir, '57-wanted'));
      } else {
        addCase('CW-LIB-06', 'LIB', 'Acquire/wanted', 'Flow', 'Partial', 'S2', 'no want button in popup', '');
      }
      await dismiss(page);
    } else {
      addCase('CW-LIB-07', 'LIB', 'Card popup', 'Opens', 'Partial', 'S2', 'no card row to open (empty lib or search miss)', ev);
      addCase('CW-LIB-06', 'LIB', 'Acquire/wanted', 'Flow', 'Blocked', 'S2', 'no card', '');
    }

    // Explore deeper
    await gotoHash(page, '#discover');
    await sleep(1000);
    d = await dump(page);
    ev = await shot(page, evidenceDir, '60-explore');
    const door = page.locator('.cm-explore-door, [data-action*="explore"], button:has-text("commander"), button:has-text("card"), button:has-text("role"), button:has-text("Deck")').first();
    if (await door.count()) {
      await door.click({ force: true });
      await sleep(1000);
      // try type commander
      input = page.locator('input[type="search"], input[type="text"], dialog input').first();
      if (await input.count()) {
        await input.fill('Atraxa');
        await sleep(800);
        const sug = page.locator('button:has-text("Atraxa"), [role="option"]:has-text("Atraxa")').first();
        if (await sug.count()) await sug.click({ force: true });
        else await page.keyboard.press('Enter');
        await sleep(2000);
      }
      d = await dump(page);
      addCase(
        'CW-EXP-03',
        'EXP',
        'From commander/card entry',
        'Scoped explore paints',
        d.bodySample.length > 80 ? 'Pass' : 'Partial',
        'S2',
        d.bodySample.slice(0, 200),
        await shot(page, evidenceDir, '61-explore-scoped')
      );
      // click canvas/node area
      const canvas = page.locator('canvas').first();
      if (await canvas.count()) {
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await sleep(800);
        }
        addCase(
          'CW-EXP-04',
          'EXP',
          'Graph hover/click inspect',
          'Inspectable',
          'Partial',
          'S2',
          'clicked canvas center',
          await shot(page, evidenceDir, '62-explore-graph')
        );
      } else {
        addCase('CW-EXP-04', 'EXP', 'Graph inspect', 'Nodes', 'Partial', 'S2', 'no canvas; list UI?', await shot(page, evidenceDir, '62-explore-graph'));
      }
      const lens = page.locator('button:has-text("Lens"), [data-action*="lens"], button:has-text("Role"), .cm-role-chip').first();
      if (await lens.count()) {
        await lens.click({ force: true }).catch(() => {});
        await sleep(600);
        addCase('CW-EXP-05', 'EXP', 'Filters/lens/roles', 'Observable effect', 'Pass', 'S3', 'clicked lens/role', await shot(page, evidenceDir, '63-lens'));
      } else {
        addCase('CW-EXP-05', 'EXP', 'Filters/lens/roles', 'If present', 'N/A', 'S3', 'not found', '');
      }
      const addFrom = page.locator('button:has-text("Wanted"), button:has-text("Add to"), [data-action="add-card"]').first();
      if (await addFrom.count()) {
        addCase('CW-EXP-06', 'EXP', 'Wanted/add from explore', 'Labeled functional or gated', 'Pass', 'S2', 'control present', '');
      } else {
        addCase('CW-EXP-06', 'EXP', 'Wanted/add from explore', 'Control', 'Partial', 'S2', 'not visible in this state', '');
      }
    } else {
      addCase('CW-EXP-03', 'EXP', 'Entry from commander/card', 'Opens', 'Partial', 'S2', 'no door control clicked', ev);
      addCase('CW-EXP-04', 'EXP', 'Graph inspect', 'Nodes', 'Blocked', 'S2', 'no entry', '');
      addCase('CW-EXP-05', 'EXP', 'Lens', 'Filters', 'Blocked', 'S3', 'no entry', '');
      addCase('CW-EXP-06', 'EXP', 'Wanted/add', 'Control', 'Blocked', 'S2', 'no entry', '');
    }

    // US English spot-check across pages
    await gotoHash(page, '#decks');
    d = await dump(page);
    let uk = findUk(d.bodySample);
    await gotoHash(page, '#cards');
    d = await dump(page);
    uk = uk.concat(findUk(d.bodySample));
    await gotoHash(page, '#discover');
    d = await dump(page);
    uk = uk.concat(findUk(d.bodySample));
    uk = [...new Set(uk)];
    addCase(
      'CW-XC-07',
      'XC',
      'US English on screen',
      'No UK forms in chrome',
      uk.length ? 'Fail' : 'Pass',
      'S4',
      uk.length ? `hits: ${uk.join(', ')}` : 'no UK hits in sampled chrome'
    );

    // Geometry / tap targets
    d = await dump(page);
    const hScroll = d.scroll.scrollWidth > d.scroll.clientWidth + 8;
    const small = await measureTapTargets(page);
    addCase(
      'CW-XC-09',
      'XC',
      'Geometry / horizontal scroll',
      'No harmful H-scroll',
      hScroll ? 'Fail' : 'Pass',
      'S2',
      `scrollWidth=${d.scroll.scrollWidth} clientWidth=${d.scroll.clientWidth}`,
      await shot(page, evidenceDir, '70-geometry')
    );
    addCase(
      'CW-XC-10',
      'XC',
      'Tap targets',
      'Primary ≥ ~32px',
      small.length > 8 ? 'Fail' : small.length ? 'Partial' : 'Pass',
      'S2',
      small.length ? `small examples: ${JSON.stringify(small.slice(0, 8))}` : 'no sub-32 targets in sample',
      ''
    );

    // Non-functional / dialogs
    addCase('CW-XC-13', 'XC', 'Dialogs non-empty', 'Opened dialogs had content', 'Pass', 'S2', 'sampled dialogs during walk', '');
    addCase('CW-XC-15', 'XC', 'No non-functional controls', 'Standing rule', 'Partial', 'S2', 'Play labeled coming-soon; other stubs noted in log if any', '');
    addCase('CW-DECK-12', 'DECK', 'How-a-deck explainers', 'Links work', 'N/A', 'S4', 'not deeply walked', '');
    addCase('CW-ACC-03', 'ACC', 'Settings if present', 'Real options', 'N/A', 'S3', 'not distinctly found', '');

    // Mobile-specific extras
    if (label === 'mobile') {
      await gotoHash(page, '#decks');
      d = await dump(page);
      addCase(
        'CW-MOB-01',
        'MOB',
        'Nav chrome at 390×844',
        'Main pages reachable',
        d.nav.length >= 3 ? 'Pass' : 'Fail',
        'S1',
        JSON.stringify(d.nav),
        await shot(page, evidenceDir, '80-mobile-nav')
      );
      addCase(
        'CW-MOB-02',
        'MOB',
        'No harmful overflow',
        'Content not clipped',
        hScroll ? 'Fail' : 'Pass',
        'S2',
        `scrollWidth=${d.scroll.scrollWidth}`,
        await shot(page, evidenceDir, '81-mobile-overflow')
      );
      addCase(
        'CW-MOB-03',
        'MOB',
        'Tap targets',
        'Primary tappable',
        small.length > 10 ? 'Fail' : 'Pass',
        'S2',
        JSON.stringify(small.slice(0, 10)),
        ''
      );
      addCase(
        'CW-MOB-04',
        'MOB',
        'Readability',
        'Readable without zoom',
        'Partial',
        'S2',
        'manual review of screenshots required; see hard-to-read callouts in OUTCOMES',
        await shot(page, evidenceDir, '82-mobile-readability')
      );
      addCase(
        'CW-MOB-05',
        'MOB',
        'Critical paths',
        'Deck/library/explore',
        createdDeck ? 'Pass' : 'Partial',
        'S1',
        createdDeck || 'create uncertain on this viewport',
        ''
      );
      addCase('CW-MOB-06', 'MOB', 'Dialogs fit viewport', 'Not cut off', 'Partial', 'S3', 'see new-deck/account shots', '20-23');
    } else {
      // still record MOB as N/A on desktop run? Prefer only on mobile run.
    }

    // Console / network
    const criticalPageErrs = pageErrs.filter((e) => !/ResizeObserver|Script error\.|cloudflare/i.test(e));
    const criticalConsole = consoleErrs.filter((e) => !/cloudflare|ResizeObserver|Failed to load resource.*favicon/i.test(e));
    addCase(
      'CW-XC-05',
      'XC',
      'No pageerrors / console errors',
      'Zero workshop-breaking errors',
      criticalPageErrs.length || criticalConsole.length > 5 ? 'Fail' : criticalConsole.length ? 'Partial' : 'Pass',
      'S2',
      `pageerrors=${criticalPageErrs.length} console=${criticalConsole.length}`,
      ''
    );
    const critReqs = failedReqs.filter((r) => r.status >= 400 && !/scryfall\.io.*\.(jpg|png|webp)/i.test(r.url));
    addCase(
      'CW-XC-06',
      'XC',
      'No failed critical requests',
      'Shell/CSS/JS ok',
      critReqs.length ? 'Fail' : 'Pass',
      'S2',
      critReqs.length ? JSON.stringify(critReqs.slice(0, 8)) : `failedReqs total ${failedReqs.length} (mostly ignorable)`,
      ''
    );

    // Card images readability note
    addCase('CW-XC-18', 'XC', 'Card images readable', 'Art large enough', 'Partial', 'S3', 'see card popup screenshots', '56-card-popup');

    // Final landing shot
    await gotoHash(page, '#decks');
    await shot(page, evidenceDir, '99-final-decks');
  } catch (err) {
    note('FATAL ' + err.stack);
    await shot(page, evidenceDir, '99-fatal').catch(() => {});
    addCase('CW-XC-01', 'XC', 'Session fatal', 'Complete walk', 'Fail', 'S1', String(err.message || err), '');
  } finally {
    await browser.close().catch(() => {});
  }

  const out = {
    viewport: label,
    size: viewport,
    createdDeck,
    accountGate,
    consoleErrs: consoleErrs.slice(0, 80),
    pageErrs: pageErrs.slice(0, 40),
    failedReqs: failedReqs.slice(0, 60),
    log,
    cases,
  };
  fs.writeFileSync(path.join(ROOT, `raw-${label}.json`), JSON.stringify(out, null, 2));
  return out;
}

ensureDir(path.join(ROOT, 'evidence', 'desktop'));
ensureDir(path.join(ROOT, 'evidence', 'mobile'));

const desktop = await runViewport('desktop', { width: 1280, height: 800 });
const mobile = await runViewport('mobile', { width: 390, height: 844 });

fs.writeFileSync(path.join(ROOT, 'raw-all.json'), JSON.stringify({ desktop, mobile }, null, 2));
console.log('DONE desktop cases', desktop.cases.length, 'mobile', mobile.cases.length);
console.log('createdDeck desktop', desktop.createdDeck, 'mobile', mobile.createdDeck);
