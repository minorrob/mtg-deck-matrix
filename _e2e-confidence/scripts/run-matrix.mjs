#!/usr/bin/env node
/**
 * Run one lobby confidence matrix against Personal-HP Chrome CDP.
 *
 *   node scripts/run-matrix.mjs --matrix A
 *   CM_CDP_URL=http://127.0.0.1:9222 CM_APP_URL=http://127.0.0.1:8768/app/#game node scripts/run-matrix.mjs --matrix A
 *
 * Exit: 0 CONFIDENT · 2 BLOCKED (named) · 1 harness error
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg, connectBrowser, openAppPage, openSecondPage, ensureOut, shot } from '../lib/cdp.mjs';
import { dumpLobby, detectStartOutcome, summarizeConsole, readNotice } from '../lib/capture.mjs';
import {
  clearLobby, confirmRules, seedRoles, seatHostBuildCommander, seatOppMethod,
  readyOccupied, clickStart, inviteUrls, probeHumanReadyGate, loadPasteList, COMMANDER,
} from '../lib/lobby.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { matrix: process.env.CM_MATRIX || 'A' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--matrix' && argv[i + 1]) out.matrix = argv[++i];
    else if (argv[i] === '--help') out.help = true;
  }
  return out;
}

function loadMatrix(id) {
  const file = path.join(ROOT, 'matrices', `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`Unknown matrix ${id}: missing ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function applyHost(page, hostSpec, conf) {
  const method = hostSpec.method || 'generated';
  if (method === 'generated') {
    await seatHostBuildCommander(page, {
      commander: hostSpec.commander || COMMANDER,
      defineStyle: hostSpec.defineStyle ?? conf.defineStyle,
      timeoutMs: conf.buildTimeoutMs,
    });
    return;
  }
  await page.evaluate(() => {
    const btn = document.querySelector('[data-action="lobby-host-deck"]')
      || [...document.querySelectorAll('button')].find((b) => /Seat your deck/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await page.waitForSelector('#cm-dialog, dialog[open]', { timeout: 10000 });
  await page.evaluate((m, paste) => {
    const dlg = document.querySelector('#cm-dialog, dialog[open]');
    const from = dlg.querySelector('[name=from]');
    from.value = m;
    from.dispatchEvent(new Event('change', { bubbles: true }));
    if (m === 'paste') {
      const ta = dlg.querySelector('[name=paste]');
      if (ta) { ta.value = paste; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    } else if (m === 'library') {
      const sel = dlg.querySelector('[name=deckId]');
      if (sel && sel.options.length) { sel.selectedIndex = 0; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }, method, loadPasteList());
  await page.evaluate(() => {
    const dlg = document.querySelector('#cm-dialog, dialog[open]');
    const btn = [...dlg.querySelectorAll('button')].find((b) => /Seat it/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await page.waitForFunction(() => {
    try { return !!(JSON.parse(localStorage.getItem('cm-lobby') || 'null') || {}).host?.seat; } catch { return false; }
  }, { timeout: conf.buildTimeoutMs });
}

async function applyOpp(page, oppIndex, spec, conf) {
  if (!spec || spec.role === 'unused' || spec.role === 'human') return;
  const method = spec.method || 'generated';
  try {
    await seatOppMethod(page, oppIndex, method, {
      commander: spec.commander || COMMANDER,
      pasteText: method === 'paste' ? loadPasteList() : undefined,
      defineStyle: !!spec.defineStyle,
      timeoutMs: conf.buildTimeoutMs,
    });
  } catch (err) {
    if (method === 'library') {
      await seatOppMethod(page, oppIndex, 'paste', {
        pasteText: loadPasteList(),
        timeoutMs: conf.buildTimeoutMs,
      });
      return 'paste-fallback';
    }
    throw err;
  }
  return method;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node scripts/run-matrix.mjs --matrix A|B|C|D');
    process.exit(0);
  }
  const conf = cfg();
  conf.matrix = args.matrix || conf.matrix;
  conf.defineStyle = conf.defineStyle;
  conf.buildTimeoutMs = conf.buildTimeoutMs;
  conf.startTimeoutMs = conf.startTimeoutMs;
  const matrix = loadMatrix(conf.matrix);
  const runDir = ensureOut(conf.outDir, conf.matrix);
  const report = {
    matrix: conf.matrix,
    title: matrix.title,
    startedAt: new Date().toISOString(),
    appURL: conf.appURL,
    browserURL: conf.browserURL,
    steps: [],
    invites: [],
    humanReadyGate: null,
    lobbyBeforeStart: null,
    startClick: null,
    startOutcome: null,
    console: null,
    verdict: 'UNKNOWN',
    blocker: null,
    confident: false,
    deckIdGaps: [],
  };
  const log = (step, data = {}) => {
    report.steps.push({ t: new Date().toISOString(), step, ...data });
    console.log(`[${conf.matrix}] ${step}`, data.detail || data.why || data.method || data.ok || '');
  };

  let browser;
  try {
    browser = await connectBrowser(conf.browserURL);
    const { page, consoleLines, pageErrors } = await openAppPage(browser, conf.appURL);
    await shot(page, runDir, '01-loaded');
    log('loaded', { detail: page.url() });

    await clearLobby(page);
    await shot(page, runDir, '02-cleared');

    await seedRoles(page, {
      bracket: matrix.bracket || 3,
      cap: matrix.cap ?? '',
      opponents: matrix.opponents.map((o) => ({
        role: o.role,
        guestName: o.guestName,
        guestEmail: o.guestEmail,
      })),
    });
    await shot(page, runDir, '03-roles');
    log('roles-seeded', { detail: matrix.opponents.map((o) => o.role).join(',') });

    await confirmRules(page);
    log('rules-confirmed');

    try {
      await applyHost(page, matrix.host || { method: 'generated' }, conf);
      await shot(page, runDir, '04-host');
      log('host-decked', { method: (matrix.host && matrix.host.method) || 'generated' });
    } catch (err) {
      await shot(page, runDir, '04-host-FAIL');
      throw new Error(`host-deck: ${err.message}`);
    }

    for (let i = 0; i < 3; i++) {
      const spec = matrix.opponents[i];
      if (!spec || spec.role === 'unused') continue;
      if (spec.role === 'human') {
        log('human-invite-pending', { detail: `opp${i} ${spec.guestName || ''}` });
        continue;
      }
      try {
        const used = await applyOpp(page, i, spec, conf);
        await shot(page, runDir, `05-opp${i}`);
        log('opp-decked', { detail: `opp${i}`, method: used });
      } catch (err) {
        await shot(page, runDir, `05-opp${i}-FAIL`);
        throw new Error(`opp${i}-deck: ${err.message}`);
      }
    }

    report.invites = await inviteUrls(page);
    fs.writeFileSync(path.join(runDir, 'invites.json'), JSON.stringify(report.invites, null, 2));
    log('invites', { detail: `${report.invites.filter((x) => x.url).length} urls` });

    const humanInvite = report.invites.find((x) => x.url);
    if (humanInvite && matrix.openGuestPage) {
      try {
        const guest = await openSecondPage(browser, humanInvite.url);
        await shot(guest.page, runDir, '06-guest');
        report.guestPage = { url: humanInvite.url, title: await guest.page.title() };
        log('guest-page', { detail: humanInvite.url });
      } catch (err) {
        report.guestPage = { url: humanInvite.url, error: err.message };
        log('guest-page-unavailable', { detail: err.message });
      }
    } else if (humanInvite) {
      report.guestPage = { skipped: true, url: humanInvite.url };
    }

    if (matrix.opponents.some((o) => o.role === 'human')) {
      report.humanReadyGate = await probeHumanReadyGate(page);
      await shot(page, runDir, '07-human-ready-gate');
      log('human-ready-gate', { detail: report.humanReadyGate.note });

      if (matrix.continueWithAiIfNoGuest) {
        log('convert-humans-to-ai', { detail: 'guest path unavailable — continue Start/Forge probe with AI' });
        const roles = matrix.opponents.map((o) => (
          o.role === 'human'
            ? { role: 'ai', method: o.fallbackMethod || 'paste' }
            : o
        ));
        await seedRoles(page, {
          bracket: matrix.bracket || 3,
          cap: matrix.cap ?? '',
          opponents: roles.map((o) => ({ role: o.role, guestName: o.guestName, guestEmail: o.guestEmail })),
        });
        await applyHost(page, matrix.host || { method: 'generated' }, conf);
        for (let i = 0; i < 3; i++) {
          if (roles[i] && roles[i].role === 'ai') await applyOpp(page, i, roles[i], conf);
        }
        await confirmRules(page);
        await shot(page, runDir, '08-converted-ai');
      }
    }

    const nReady = await readyOccupied(page);
    await sleep(600);
    await shot(page, runDir, '09-ready');
    log('ready-up', { detail: `clicked ${nReady}` });

    report.lobbyBeforeStart = await dumpLobby(page);
    fs.writeFileSync(path.join(runDir, 'lobby-before-start.json'), JSON.stringify(report.lobbyBeforeStart, null, 2));

    const gaps = [];
    if (!report.lobbyBeforeStart.hostDeckId) gaps.push('host.deckId/draftId null');
    for (const o of report.lobbyBeforeStart.opponents) {
      if (o.role === 'ai' && !o.deckId) gaps.push(`opp${o.i}.deckId null`);
    }
    report.deckIdGaps = gaps;
    if (gaps.length) log('deckId-gaps', { detail: gaps.join('; '), ensureLobbyDraftPresent: report.lobbyBeforeStart.ensureLobbyDraftPresent });

    report.startClick = await clickStart(page);
    log('start-click', report.startClick);
    await shot(page, runDir, '10-after-start');

    report.startOutcome = await detectStartOutcome(page, { timeoutMs: conf.startTimeoutMs });
    await shot(page, runDir, '11-outcome');
    log('start-outcome', { detail: `${report.startOutcome.kind} — ${report.startOutcome.detail}` });

    report.console = summarizeConsole(consoleLines, pageErrors);
    report.notices = await readNotice(page);
    report.finishedAt = new Date().toISOString();

    if (report.startOutcome.ok) {
      report.verdict = 'CONFIDENT';
      report.confident = true;
      report.blocker = null;
    } else {
      report.verdict = 'BLOCKED';
      report.confident = false;
      report.blocker = `${report.startOutcome.kind}: ${report.startOutcome.detail}`;
    }

    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(
      path.join(runDir, 'VERDICT.txt'),
      `${report.verdict}\nblocker=${report.blocker || ''}\nensureLobbyDraftPresent=${report.lobbyBeforeStart.ensureLobbyDraftPresent}\ndeckIdGaps=${gaps.join('; ') || 'none'}\n`,
    );
    console.log('\n=== VERDICT', report.verdict, '===');
    console.log('runDir', runDir);
    console.log('blocker', report.blocker);
    await browser.disconnect();
    process.exit(report.confident ? 0 : 2);
  } catch (err) {
    report.verdict = 'HARNESS_ERROR';
    report.blocker = err.message;
    report.finishedAt = new Date().toISOString();
    try { fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2)); } catch {}
    console.error('HARNESS_ERROR', err);
    try { if (browser) await browser.disconnect(); } catch {}
    process.exit(1);
  }
}

main();
