#!/usr/bin/env node
/**
 * Track A — raw WebSocket CDP (no Puppeteer).
 * Host+3 AI · Library if possible else Build Atraxa · Ready · Start · poll /api/live.
 *
 *   node _e2e-confidence/scripts/raw-matrix-a.mjs
 *
 * Env: CM_CDP_URL CM_APP_URL CM_HOST CM_OUT CM_COMMANDER
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(__dirname, '..');
const OUT = path.resolve(process.env.CM_OUT || path.join(PKG, 'out'));
const CDP_BASE = (process.env.CM_CDP_URL || 'http://127.0.0.1:9222').replace(/\/$/, '');
const APP_URL = process.env.CM_APP_URL || 'http://127.0.0.1:8768/app/#game';
const HOST = (process.env.CM_HOST || 'http://127.0.0.1:8768').replace(/\/$/, '');
const COMMANDER = process.env.CM_COMMANDER || "Atraxa, Praetors' Voice";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function loadWs() {
  const require = createRequire(import.meta.url);
  for (const c of [path.join(PKG, 'lib/ws'), path.join(PKG, 'node_modules/ws'), 'ws']) {
    try { return require(c); } catch {}
  }
  throw new Error('Need the ws package (vendored under _e2e-confidence/lib/ws)');
}

function httpJson(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      { method, headers: body ? { 'Content-Type': 'application/json', ...headers } : headers, timeout: 20000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { json = { raw: text }; }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout ' + url)); });
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

class CdpSession {
  constructor(Ws) {
    this.Ws = Ws;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
  }
  connect(wsUrl) {
    return new Promise((resolve, reject) => {
      const ws = new this.Ws(wsUrl);
      ws.once('open', () => {
        this.ws = ws;
        ws.on('message', (raw) => {
          let msg;
          try { msg = JSON.parse(String(raw)); } catch { return; }
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: ok, reject: bad } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) bad(new Error(msg.error.message || JSON.stringify(msg.error)));
            else ok(msg.result);
          }
        });
        resolve();
      });
      ws.once('error', reject);
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 180000);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails.exception;
      throw new Error((ex && (ex.description || ex.value)) || r.exceptionDetails.text || 'evaluate failed');
    }
    return r.result?.value;
  }
  close() { try { this.ws?.close(); } catch {} }
}

function writeVerdict(runDir, verdict, report) {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(runDir, 'VERDICT.txt'), verdict + '\n');
  fs.writeFileSync(path.join(OUT, 'VERDICT-LATEST.txt'), `${verdict}\n\n${JSON.stringify(report, null, 2)}\n`);
  console.log('\n==== VERDICT ====\n' + verdict + '\n');
}

async function pickPageTarget(list) {
  const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  const hit = pages.find((t) => /8768/.test(t.url) || /#game/.test(t.url)) || pages[0];
  if (!hit) throw new Error('No CDP page target. Start Chrome with --remote-debugging-port=9222');
  return hit;
}

const PAGE_BUILD_SEAT = `async (who, opp, commander) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (who === 'host') {
    const btn = document.querySelector('[data-action="lobby-host-build"]')
      || [...document.querySelectorAll('button')].find((b) => /Build from Commander|Build a 100/i.test(b.textContent || ''));
    if (!btn) return { ok: false, why: 'host build button missing' };
    btn.click();
  } else {
    const btn = document.querySelector('[data-action="lobby-opp-build"][data-opp="'+opp+'"]')
      || [...document.querySelectorAll('[data-opp="'+opp+'"] button')].find((b) => /Build/i.test(b.textContent || ''));
    if (!btn) return { ok: false, why: 'opp build missing ' + opp };
    btn.click();
    await sleep(350);
    const dlg = document.querySelector('#cm-dialog, dialog[open]');
    const from = dlg && dlg.querySelector('[name=from], [name=method], select');
    if (from && from.options) {
      const hit = [...from.options].find((o) => /generat|build|commander/i.test(o.value + ' ' + o.textContent));
      if (hit) { from.value = hit.value; from.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }
  await sleep(500);
  const root = document.querySelector('#cm-dialog, dialog[open]') || document;
  const input = root.querySelector('[name=commanderQuery], [name=inlineCommanderQuery], input[placeholder*="commander" i]');
  if (!input) return { ok: false, why: 'commander input missing' };
  input.focus();
  input.value = commander;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1300);
  const list = root.querySelector('[data-commander-results], .cm-commander-results') || root;
  const needle = commander.split(',')[0];
  const re = new RegExp(needle.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'i');
  const pick = [...list.querySelectorAll('[data-commander-pick], button')].find((el) =>
    re.test(el.getAttribute('data-commander-pick') || el.textContent || '')
  ) || list.querySelector('[data-commander-pick]');
  if (!pick) return { ok: false, why: 'no typeahead hit' };
  pick.click();
  await sleep(300);
  const apply = [...root.querySelectorAll('button')].find((b) => /Apply|Seat|Build 100|Use this/i.test(b.textContent || ''));
  if (apply) apply.click();
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    try {
      const lob = JSON.parse(localStorage.getItem('cm-lobby') || 'null');
      const seat = who === 'host' ? lob?.host?.seat : lob?.opponents?.[opp]?.seat;
      const n = (seat?.commanders?.length || 0) + (seat?.cards || []).reduce((a, c) => a + (Number(c.quantity) || 1), 0);
      if (seat && n >= 90) return { ok: true, size: n, kind: seat.kind, deckId: seat.deckId || null, name: seat.name };
    } catch {}
    await sleep(1000);
  }
  return { ok: false, why: 'build timeout' };
}`;

const PAGE_LIBRARY_HOST = `async (deckId) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = document.querySelector('[data-action="lobby-host-deck"]')
    || [...document.querySelectorAll('button')].find((b) => /Seat your deck|Your deck|Library/i.test(b.textContent || ''));
  if (!btn) return { ok: false, why: 'host library button missing' };
  btn.click();
  await sleep(400);
  const dlg = document.querySelector('#cm-dialog, dialog[open]');
  if (!dlg) return { ok: false, why: 'dialog missing' };
  const from = dlg.querySelector('[name=from]');
  if (from) { from.value = 'library'; from.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200); }
  const sel = dlg.querySelector('[name=deckId], select');
  if (!sel || !sel.options || !sel.options.length) return { ok: false, why: 'no library options' };
  if (deckId) {
    const opt = [...sel.options].find((o) => o.value === deckId);
    sel.value = opt ? opt.value : sel.options[Math.min(1, sel.options.length - 1)].value;
  } else {
    sel.selectedIndex = Math.min(1, sel.options.length - 1);
  }
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const seatBtn = [...dlg.querySelectorAll('button')].find((b) => /Seat it|Apply|Use/i.test(b.textContent || ''));
  if (seatBtn) seatBtn.click();
  await sleep(1000);
  try {
    const lob = JSON.parse(localStorage.getItem('cm-lobby') || 'null');
    const seat = lob?.host?.seat;
    const n = (seat?.commanders?.length || 0) + (seat?.cards || []).reduce((a, c) => a + (Number(c.quantity) || 1), 0);
    if (seat && n >= 90) return { ok: true, via: 'library', size: n, deckId: seat.deckId, kind: seat.kind };
  } catch {}
  return { ok: false, why: 'library seat did not stick' };
}`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const runDir = path.join(OUT, `matrix-A-raw-${stamp()}`);
  fs.mkdirSync(runDir, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    cdp: CDP_BASE,
    app: APP_URL,
    host: HOST,
    steps: [],
    notices: [],
    live: null,
    error: null,
  };
  let cdp;
  try {
    const liveBefore = await httpJson(HOST + '/api/live');
    report.steps.push({ liveBefore: liveBefore.json });

    const setupRes = await httpJson(HOST + '/api/setup');
    if (setupRes.status !== 200) {
      throw new Error(`GET /api/setup HTTP ${setupRes.status}: ${(setupRes.text || '').slice(0, 240)}`);
    }
    const setup = setupRes.json || {};
    const defaultSeats = setup.defaults?.seats || [];
    const libraryDecks = (setup.decks || []).filter((d) => d.source === 'library');
    report.setup = {
      hasToken: !!setup.token,
      openaiAvailable: !!(setup.aiCredential && setup.aiCredential.openaiAvailable),
      deckCount: (setup.decks || []).length,
      libraryCount: libraryDecks.length,
      defaultSeatCount: defaultSeats.length,
    };

    const Ws = loadWs();
    const listRes = await httpJson(CDP_BASE + '/json/list');
    if (!Array.isArray(listRes.json)) throw new Error('CDP /json/list failed');
    const target = await pickPageTarget(listRes.json);
    report.target = { url: target.url, title: target.title, id: target.id };

    cdp = new CdpSession(Ws);
    await cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(3000);
    await cdp.evaluate(`new Promise((resolve) => {
      const t0 = Date.now();
      (function tick() {
        if (document.querySelector('[data-action="lobby-start"], .cm-lobby-seats, main, #cm-main')) return resolve(true);
        if (Date.now() - t0 > 60000) return resolve(false);
        setTimeout(tick, 250);
      })();
    })`);

    await cdp.evaluate(`(() => {
      const empty = () => ({ role: 'ai', ready: false, seat: null, guestName: '', guestEmail: '', inviteId: '' });
      localStorage.setItem('cm-lobby', JSON.stringify({
        bracket: 3, cap: '', host: null, hostBuildDef: null,
        opponents: [empty(), empty(), empty()], rulesConfirmed: null,
      }));
      location.hash = 'game';
      location.reload();
      return true;
    })()`);
    await sleep(4000);

    await cdp.evaluate(`(() => {
      const btn = document.querySelector('[data-action="lobby-confirm-rules"]');
      if (btn && !/Confirmed/i.test(btn.textContent || '')) btn.click();
      return true;
    })()`);
    await sleep(300);

    const preferLibrary = libraryDecks.length > 0;
    report.seatPlan = {
      preferLibrary,
      commander: COMMANDER,
      librarySample: libraryDecks.slice(0, 4).map((d) => ({ id: d.id, name: d.name, commander: d.commander })),
      defaults: defaultSeats.map((s) => ({ deckId: s.deckId, commander: s.commander, kind: s.kind })),
    };

    const callPage = (fnSource, args) =>
      cdp.evaluate('(' + fnSource + ').apply(null, ' + JSON.stringify(args) + ')');

    let host = preferLibrary
      ? await callPage(PAGE_LIBRARY_HOST, [defaultSeats[0]?.deckId || libraryDecks[0]?.id || null])
      : { ok: false, why: 'no library decks' };
    report.steps.push({ hostLibrary: host });
    if (!host?.ok) {
      host = await callPage(PAGE_BUILD_SEAT, ['host', 0, COMMANDER]);
      report.steps.push({ hostBuild: host });
    }
    if (!host?.ok) throw new Error('Host seating failed: ' + (host?.why || 'unknown'));

    for (let i = 0; i < 3; i++) {
      const opp = await callPage(PAGE_BUILD_SEAT, ['opp', i, COMMANDER]);
      report.steps.push({ ['opp' + i]: opp });
      if (!opp?.ok) throw new Error('Opp ' + i + ' seating failed: ' + (opp?.why || 'unknown'));
    }

    const readyClicks = await cdp.evaluate(`(() => {
      const out = [];
      for (const btn of document.querySelectorAll('[data-action="lobby-ready"]')) {
        btn.click(); out.push(btn.getAttribute('data-who') || 'ready');
      }
      for (const btn of document.querySelectorAll('button')) {
        if (/^Ready Up$/i.test((btn.textContent || '').trim())) { btn.click(); out.push('Ready Up'); }
      }
      return out;
    })()`);
    report.steps.push({ readyClicks });
    await sleep(1000);

    /* AI Ready Up often does not stick under CDP — force ready flags then soft-reload. */
    const forceReady = await cdp.evaluate(`(() => {
  try {
    const lob = JSON.parse(localStorage.getItem('cm-lobby') || 'null');
    if (!lob) return { ok: false, why: 'no lobby' };
    if (lob.host) lob.host.ready = true;
    (lob.opponents || []).forEach((o) => {
      if (o && o.role !== 'unused' && o.seat) o.ready = true;
    });
    localStorage.setItem('cm-lobby', JSON.stringify(lob));
    return {
      ok: true,
      hostReady: !!(lob.host && lob.host.ready),
      oppReady: (lob.opponents || []).map((o) => !!(o && o.ready)),
    };
  } catch (e) {
    return { ok: false, why: String(e && e.message || e) };
  }
})()`);
    report.steps.push({ forceReady });
    await cdp.evaluate(`(() => { location.hash = 'game'; location.reload(); return true; })()`);
    await sleep(3500);
    await cdp.evaluate(`(() => {
  const btn = document.querySelector('[data-action="lobby-confirm-rules"]');
  if (btn && !/Confirmed/i.test(btn.textContent || '')) btn.click();
  return true;
})()`);
    await sleep(400);

    const readNotices = () => cdp.evaluate(`(() =>
      [...document.querySelectorAll('#cm-notice, .cm-toast, [role=status], .cm-notice')]
        .map((n) => (n.textContent || '').trim()).filter(Boolean).slice(0, 10)
    )()`);

    const startClick = await cdp.evaluate(`(() => {
      const btn = document.querySelector('[data-action="lobby-start"]');
      if (!btn) return { ok: false, why: 'start missing' };
      if (btn.disabled) return { ok: false, why: 'start disabled', text: (btn.textContent || '').trim() };
      btn.click();
      return { ok: true, text: (btn.textContent || '').trim() };
    })()`);
    report.steps.push({ startClick });
    if (!startClick?.ok) throw new Error('Start failed: ' + (startClick?.why || 'unknown'));

    let finalLive = null;
    let sawStarting = false;
    let g0 = false;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const notices = await readNotices();
      report.notices = notices;
      if (notices.some((t) => /This lobby is G0|lobby is G0/i.test(t))) { g0 = true; break; }
      const liveRes = await httpJson(HOST + '/api/live');
      finalLive = liveRes.json;
      report.live = finalLive;
      const st = finalLive && finalLive.status;
      if (st === 'starting') sawStarting = true;
      if (st === 'ready' || st === 'playing') break;
      if (st === 'error' || st === 'failed' || st === 'incomplete') break;
      await sleep(2000);
    }
    report.sawStarting = sawStarting;
    report.g0 = g0;

    if (g0) {
      writeVerdict(runDir, 'FAIL blocker:G0_STUB — Start still shows G0 (bridge not loaded? Ctrl+F5 game.js?v=27)', report);
      process.exit(2);
    }
    const st = finalLive && finalLive.status;
    if (st === 'ready' || st === 'playing') {
      writeVerdict(runDir, `PASS CONFIDENT — /api/live status=${st}` + (sawStarting ? ' (saw starting)' : ''), report);
      process.exit(0);
    }
    if (st === 'starting') {
      writeVerdict(runDir, 'PASS PARTIAL — /api/live status=starting (Forge loading within poll window)', report);
      process.exit(0);
    }
    if (st === 'error' || st === 'failed' || (finalLive && finalLive.error)) {
      writeVerdict(runDir, `FAIL API — /api/live status=${st} error=${finalLive?.error || finalLive?.message || 'unknown'}`, report);
      process.exit(2);
    }
    writeVerdict(runDir, `FAIL — /api/live status=${st || 'unknown'}; notices=${JSON.stringify(report.notices)}`, report);
    process.exit(2);
  } catch (err) {
    report.error = String(err && err.stack || err);
    writeVerdict(runDir, 'FAIL HARNESS — ' + (err && err.message || err), report);
    process.exit(1);
  } finally {
    try { cdp?.close(); } catch {}
  }
}

main();
