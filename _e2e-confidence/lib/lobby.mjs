/**
 * Classic lobby (#game) drivers for crankmagic-game.js (localStorage key cm-lobby).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOBBY_KEY = 'cm-lobby';
export const COMMANDER = "Atraxa, Praetors' Voice";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadPasteList() {
  return fs.readFileSync(path.resolve(HERE, '../fixtures/atraxa-paste-100.txt'), 'utf8').trim();
}

export async function clickAction(page, action, data = {}) {
  const ok = await page.evaluate((act, attrs) => {
    const nodes = [...document.querySelectorAll(`[data-action="${act}"]`)];
    const el = nodes.find((n) =>
      Object.entries(attrs).every(([k, v]) => String(n.getAttribute(`data-${k}`) || '') === String(v))
    );
    if (!el || el.disabled) return false;
    el.click();
    return true;
  }, action, data);
  if (!ok) throw new Error(`clickAction failed: ${action} ${JSON.stringify(data)}`);
  await sleep(250);
}

export async function clearLobby(page) {
  const has = await page.$('[data-action="lobby-clear"]');
  if (has) {
    await has.click();
    await sleep(500);
    return;
  }
  await page.evaluate((key) => localStorage.removeItem(key), LOBBY_KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(900);
}

export async function confirmRules(page) {
  return page.evaluate(() => {
    const btn = document.querySelector('[data-action="lobby-confirm-rules"]');
    if (!btn) return 'missing';
    if (/Confirmed/i.test(btn.textContent || '')) return 'already';
    btn.click();
    return 'clicked';
  });
}

export async function seedRoles(page, { bracket = 3, cap = '', opponents }) {
  await page.evaluate((key, bracket, cap, opps) => {
    const empty = () => ({ role: 'unused', ready: false, seat: null, guestName: '', guestEmail: '', inviteId: '' });
    const next = {
      bracket,
      cap,
      host: null,
      hostBuildDef: null,
      opponents: [0, 1, 2].map((i) => {
        const spec = opps[i] || { role: 'unused' };
        const o = empty();
        o.role = spec.role || 'unused';
        if (o.role === 'human') {
          o.guestName = spec.guestName || `Guest ${i + 2}`;
          o.guestEmail = spec.guestEmail || `guest${i + 2}@example.test`;
          o.inviteId = (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
        }
        return o;
      }),
      rulesConfirmed: null,
    };
    localStorage.setItem(key, JSON.stringify(next));
  }, LOBBY_KEY, bracket, cap, opponents);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1000);
}

export async function inviteUrls(page) {
  return page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (!raw) return [];
    const base = location.href.split('#')[0];
    return (raw.opponents || []).map((o, i) => ({
      i,
      role: o.role,
      guestName: o.guestName || '',
      guestEmail: o.guestEmail || '',
      inviteId: o.inviteId || '',
      url: o.role === 'human' && o.inviteId ? `${base}#play?seat=${encodeURIComponent(o.inviteId)}` : null,
    }));
  }, LOBBY_KEY);
}

async function pickCommander(page, scopeSelector, query) {
  await page.evaluate((scopeSel, q) => {
    const root = document.querySelector(scopeSel) || document;
    const input = root.querySelector('[name=commanderQuery], [name=inlineCommanderQuery]');
    if (!input) throw new Error('commander query input missing in ' + scopeSel);
    input.focus();
    input.value = q;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, scopeSelector, query);
  await sleep(1100);
  const picked = await page.evaluate((scopeSel, q) => {
    const root = document.querySelector(scopeSel) || document;
    const list = root.querySelector('[data-commander-results], .cm-commander-results');
    if (!list) return { ok: false, why: 'results container missing' };
    const needle = q.split(',')[0];
    const btn = [...list.querySelectorAll('[data-commander-pick], button')].find((el) =>
      new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(el.getAttribute('data-commander-pick') || el.textContent || '')
    ) || list.querySelector('[data-commander-pick], button');
    if (!btn) return { ok: false, why: 'no typeahead hit for ' + q, html: (list.innerHTML || '').slice(0, 240) };
    btn.click();
    return { ok: true, name: btn.getAttribute('data-commander-pick') || (btn.textContent || '').trim() };
  }, scopeSelector, query);
  if (!picked.ok) throw new Error(`Commander pick failed: ${picked.why}`);
  await sleep(300);
  return picked;
}

export async function seatHostBuildCommander(page, { commander = COMMANDER, defineStyle = true, timeoutMs = 180000 } = {}) {
  const opened = await page.evaluate(() => {
    const btn = document.querySelector('[data-action="lobby-host-deck"]')
      || [...document.querySelectorAll('button')].find((b) => /Seat your deck|Change deck/i.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!opened) throw new Error('Host Seat your deck control not found');
  await page.waitForSelector('#cm-dialog, dialog[open]', { timeout: 10000 });
  await page.evaluate(() => {
    const dlg = document.querySelector('#cm-dialog, dialog[open]');
    const from = dlg && dlg.querySelector('[name=from]');
    if (from) { from.value = 'generated'; from.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await sleep(400);

  if (defineStyle) {
    const style = await page.$('#cm-dialog [data-action="lobby-build-style"], dialog[open] [data-action="lobby-build-style"]');
    if (style) {
      await style.click();
      await sleep(400);
      await page.evaluate(() => {
        const save = document.querySelector('[data-action="lobby-build-style-save"]')
          || [...document.querySelectorAll('button')].find((b) => /Save play style/i.test(b.textContent || ''));
        if (save) save.click();
      });
      await sleep(700);
      await page.waitForSelector('#cm-dialog [name=from], dialog[open] [name=from], #cm-dialog [name=commanderQuery], dialog[open] [name=commanderQuery]', { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => {
        const dlg = document.querySelector('#cm-dialog, dialog[open]');
        const from = dlg && dlg.querySelector('[name=from]');
        if (from && from.value !== 'generated') {
          from.value = 'generated';
          from.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await sleep(300);
    }
  }

  await pickCommander(page, '#cm-dialog, dialog[open]', commander);
  await page.evaluate(() => {
    const dlg = document.querySelector('#cm-dialog, dialog[open]');
    const btn = [...(dlg ? dlg.querySelectorAll('button') : [])].find((b) =>
      /Seat it/i.test(b.textContent || '') && !/style|Cancel|Close|Define/i.test(b.textContent || '')
    );
    if (!btn) throw new Error('Seat it button missing');
    btn.click();
  });
  await page.waitForFunction(() => {
    try { return !!(JSON.parse(localStorage.getItem('cm-lobby') || 'null') || {}).host?.seat; }
    catch { return false; }
  }, { timeout: timeoutMs });
  await sleep(400);
}

export async function seatOppMethod(page, oppIndex, method, {
  commander = COMMANDER,
  pasteText,
  defineStyle = false,
  timeoutMs = 180000,
} = {}) {
  const boxSel = `.cm-lobby-inline[data-opp="${oppIndex}"]`;
  await page.waitForSelector(boxSel, { timeout: 15000 });
  await page.evaluate((i, m) => {
    const box = document.querySelector(`.cm-lobby-inline[data-opp="${i}"]`);
    const sel = box && box.querySelector('[name=inlineFrom]');
    if (!sel) throw new Error('inlineFrom missing');
    sel.value = m;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, oppIndex, method);
  await sleep(400);

  if (method === 'library') {
    const has = await page.evaluate((i) => {
      const sel = document.querySelector(`.cm-lobby-inline[data-opp="${i}"] [name=inlineDeck]`);
      return !!(sel && [...sel.options].some((o) => o.value));
    }, oppIndex);
    if (!has) throw new Error('Library empty — no decks in this profile');
  } else if (method === 'paste') {
    const text = pasteText || loadPasteList();
    await page.evaluate((i, t) => {
      const ta = document.querySelector(`.cm-lobby-inline[data-opp="${i}"] [name=inlinePaste]`);
      if (!ta) throw new Error('inlinePaste missing');
      ta.value = t;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    }, oppIndex, text);
  } else if (method === 'generated') {
    if (defineStyle) {
      try {
        await clickAction(page, 'lobby-build-style', { opp: String(oppIndex) });
        await sleep(400);
        await page.evaluate(() => {
          const save = document.querySelector('[data-action="lobby-build-style-save"]');
          if (save) save.click();
        });
        await sleep(400);
      } catch { /* optional */ }
    }
    await pickCommander(page, boxSel, commander);
  } else {
    throw new Error(`Unknown method ${method}`);
  }

  await clickAction(page, 'lobby-inline-apply', { opp: String(oppIndex) });
  await page.waitForFunction((i) => {
    try {
      const raw = JSON.parse(localStorage.getItem('cm-lobby') || 'null');
      return !!(raw && raw.opponents && raw.opponents[i] && raw.opponents[i].seat);
    } catch { return false; }
  }, { timeout: method === 'generated' ? timeoutMs : Math.min(timeoutMs, 90000) }, oppIndex);
  await sleep(400);
}

export async function readyOccupied(page) {
  return page.evaluate(() => {
    let n = 0;
    for (const b of document.querySelectorAll('[data-action="lobby-ready"]')) {
      if (/Ready Up/i.test(b.textContent || '') || !b.classList.contains('is-on')) {
        if (/Ready Up/i.test(b.textContent || '')) { b.click(); n++; }
      }
    }
    return n;
  });
}

export async function clickStart(page) {
  await page.waitForSelector('[data-action="lobby-start"]', { timeout: 15000 });
  return page.evaluate(() => {
    const btn = document.querySelector('[data-action="lobby-start"]');
    if (!btn) return { clicked: false, why: 'missing' };
    if (btn.disabled) {
      const hint = (btn.parentElement && btn.parentElement.querySelector('.cm-muted'))?.textContent || 'disabled';
      return { clicked: false, why: String(hint).trim() };
    }
    btn.click();
    return { clicked: true };
  });
}

export async function probeHumanReadyGate(page) {
  return page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cm-lobby') || 'null');
    const opps = (raw && raw.opponents) || [];
    const out = [];
    for (let i = 0; i < opps.length; i++) {
      if (opps[i].role !== 'human') continue;
      const btn = document.querySelector(`.cm-lobby-seat[data-opp="${i}"] [data-action="lobby-ready"]`)
        || document.querySelector(`[data-action="lobby-ready"][data-opp="${i}"]`);
      const before = { ready: !!opps[i].ready, hasSeat: !!opps[i].seat };
      if (btn) btn.click();
      out.push({ i, before, button: btn ? (btn.textContent || '').trim() : null });
    }
    const after = JSON.parse(localStorage.getItem('cm-lobby') || 'null');
    return {
      attempts: out,
      after: ((after && after.opponents) || []).map((o, i) => ({ i, role: o.role, ready: !!o.ready, hasSeat: !!o.seat })),
      note: 'Human seats cannot Ready Up until the guest claims the invite and seats a deck.',
    };
  });
}
