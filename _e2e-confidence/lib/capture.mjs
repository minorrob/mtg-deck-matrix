/** Notices, console, lobby dump, Forge/tabletop signals. */

export async function readNotice(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.cm-notice, [role="status"], .v-toast, .cm-toast, #cm-notice')];
    return nodes.map((n) => (n.textContent || '').trim()).filter(Boolean).slice(-8);
  });
}

export async function dumpLobby(page) {
  return page.evaluate(() => {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('cm-lobby') || 'null'); } catch {}
    const decks = (globalThis.Crank && Crank.state && Array.isArray(Crank.state.decks))
      ? Crank.state.decks.map((d) => ({ id: d.id, name: d.name, status: d.status, n: (d.cards || d.slots || []).length }))
      : [];
    const ensureLobbyDraftPresent =
      typeof (globalThis.Crank && Crank.ensureLobbyDraft) === 'function' ||
      typeof (globalThis.C && C.ensureLobbyDraft) === 'function' ||
      typeof (globalThis.Crank && Crank.ensureLobbyDraft) === 'function';
    const host = raw && raw.host;
    const hostSeat = host && host.seat;
    const opps = (raw && raw.opponents) || [];
    const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src') || '');
    const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((s) => s.getAttribute('href') || '');
    const cardCount = (seat) => seat
      ? ((seat.cards || []).reduce((n, r) => n + (Number(r.quantity) || 1), 0) + (seat.commanders || []).length)
      : 0;
    return {
      key: 'cm-lobby',
      bracket: raw && raw.bracket,
      cap: raw && raw.cap,
      rulesConfirmed: !!(raw && raw.rulesConfirmed),
      hostReady: !!(host && host.ready),
      hostDeckId: hostSeat && (hostSeat.deckId || hostSeat.draftId || null),
      hostName: hostSeat && hostSeat.name,
      hostKind: hostSeat && hostSeat.kind,
      hostCards: cardCount(hostSeat),
      ensureLobbyDraftPresent,
      opponents: opps.map((o, i) => ({
        i,
        role: o.role,
        ready: !!o.ready,
        guestName: o.guestName || '',
        guestEmail: o.guestEmail || '',
        inviteId: o.inviteId || '',
        deckId: (o.seat && (o.seat.deckId || o.seat.draftId)) || null,
        seatName: (o.seat && o.seat.name) || null,
        seatKind: (o.seat && o.seat.kind) || null,
        cards: cardCount(o.seat),
      })),
      libraryDeckCount: decks.length,
      sampleDecks: decks.slice(0, 8),
      crankDraft: !!globalThis.CrankDraft,
      hash: location.hash,
      gameJs: scripts.filter((s) => /game\.js/i.test(s)),
      cssFiles: css.filter((s) => /crankmagic\.css|game/i.test(s)),
    };
  });
}

export async function detectStartOutcome(page, { timeoutMs = 120000 } = {}) {
  const started = Date.now();
  const result = { ok: false, kind: 'unknown', detail: '', notices: [], liveStatus: null, hash: '' };
  while (Date.now() - started < timeoutMs) {
    const snap = await page.evaluate(async () => {
      const notices = [...document.querySelectorAll('.cm-notice, [role="status"], .v-toast, .cm-toast, #cm-notice')]
        .map((n) => (n.textContent || '').trim()).filter(Boolean);
      const hash = location.hash || '';
      const body = (document.body && document.body.innerText) || '';
      const forgeHints = /Forge is loading|live browser table is ready|Starting the local rules engine|Enter the game|Opening hand|mulligan/i.test(body);
      const tabletop = !!(document.querySelector('.cm-table, .cm-playmats, .cm-game-frame, iframe.cm-game-frame, .mats, [data-view="table"]'));
      const g0 = notices.some((t) => /lobby is G0|board is the next thing to build|This lobby is G0/i.test(t))
        || /lobby is G0|board is the next thing to build|This lobby is G0/i.test(body);
      let live = null;
      try {
        const r = await fetch('/api/live', { signal: AbortSignal.timeout(2000) });
        if (r.ok) live = await r.json();
      } catch {}
      return { notices, hash, forgeHints, tabletop, g0, live };
    });
    result.notices = snap.notices;
    result.hash = snap.hash;
    result.liveStatus = snap.live;
    if (snap.live && ['ready', 'playing', 'starting'].includes(snap.live.status)) {
      result.kind = snap.live.status === 'starting' ? 'forge-starting' : 'forge-sync';
      result.detail = JSON.stringify(snap.live);
      if (snap.live.status === 'starting') { await new Promise((r) => setTimeout(r, 2000)); continue; }
      result.ok = true;
      return result;
    }
    if (snap.tabletop || snap.forgeHints) {
      result.ok = true; result.kind = 'tabletop-ui'; result.detail = 'Detected tabletop/Forge UI markers';
      return result;
    }
    if (snap.g0) {
      result.ok = false; result.kind = 'blocker:G0_STUB';
      result.detail = snap.notices.find((t) => /G0|board is the next/i.test(t)) || 'lobby-start is G0 stub (board not wired)';
      return result;
    }
    const errNotice = [...snap.notices].reverse().find((t) => /fail|error|unable|could not|offline/i.test(t));
    if (errNotice) {
      result.ok = false; result.kind = 'blocker:NOTICE'; result.detail = errNotice;
      return result;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  result.kind = 'blocker:TIMEOUT';
  result.detail = `No Forge sync / tabletop / G0 notice within ${timeoutMs}ms`;
  return result;
}

export function summarizeConsole(consoleLines, pageErrors) {
  const errors = (consoleLines || []).filter((l) => l.type === 'error').slice(-30);
  return { errorCount: errors.length + (pageErrors || []).length, consoleErrors: errors, pageErrors: (pageErrors || []).slice(-20) };
}
