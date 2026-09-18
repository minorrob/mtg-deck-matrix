  async function lobbyApi(path, {method = 'GET', token, body} = {}) {
    const headers = {};
    if (token) headers['X-Commander-Token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const err = (data && (data.error || data.message)) || res.statusText || ('HTTP ' + res.status);
      throw new Error(err);
    }
    return data;
  }

  function lobbyLibraryKind(seat) {
    const k = String(seat && seat.kind || '').toLowerCase();
    return k === 'library' || k === 'preloaded' || k === 'link';
  }

  async function lobbySeatPrepareRequest(seat, seatId, kind, token) {
    const commanders = (seat.commanders || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
    const commander = commanders[0] || '';
    const name = String(seat.name || commander || ('Seat ' + (seatId + 1))).slice(0, 100);
    const base = {
      seatId,
      kind, /* human | ai */
      name,
      commanderMode: 'selected',
      commander,
    };
    if (kind === 'ai') {
      base.nativeProfile = 'Default';
      base.difficulty = 3;
      /* forge-native: omit aiProvider so requireAiSession is a no-op */
    }

    if (seat.deckId && lobbyLibraryKind(seat)) {
      return Object.assign(base, {
        source: 'library',
        deckId: seat.deckId,
      });
    }

    /* generated / paste / no usable library deckId → import handoff, then library */
    const rows = (seat.cards || []).map((c) => ({
      name: typeof c === 'string' ? c : c.name,
      quantity: Number((c && c.quantity) || 1) || 1,
    })).filter((r) => r.name);
    const cmdQty = commanders.length; /* each commander counts as 1 */
    const rowQty = rows.reduce((n, r) => n + r.quantity, 0);
    if (cmdQty + rowQty !== 100) {
      throw new Error(`${name}: seat list must total 100 with commanders (have ${cmdQty + rowQty}).`);
    }
    const handoff = {
      schema: 'CrankMagicDeckHandoff@1',
      name,
      commanders,
      rows, /* mainboard only — not including commanders */
    };
    if (seat.deckId) handoff.sourceDeckId = seat.deckId;
    const imported = await lobbyApi('/api/import-deck', {method: 'POST', token, body: handoff});
    return Object.assign(base, {
      source: 'library',
      deckId: imported.id,
      commander: imported.commander || commander,
    });
  }

  async function lobbyBuildPrepareConfig(token, defaults) {
    const humanOpps = [];
    const aiOpps = [];
    lobby.opponents.forEach((opp) => {
      if (!opp || opp.role === 'unused' || !opp.seat) return;
      if (opp.role === 'human') humanOpps.push(opp.seat);
      else if (opp.role === 'ai') aiOpps.push(opp.seat);
    });
    if (!lobby.host || !lobby.host.seat) throw new Error('Host seat is empty.');

    const humans = 1 + humanOpps.length;
    const ais = aiOpps.length;
    /* validateSetup requires humans packed before ais */
    const ordered = [
      {seat: lobby.host.seat, kind: 'human'},
      ...humanOpps.map((seat) => ({seat, kind: 'human'})),
      ...aiOpps.map((seat) => ({seat, kind: 'ai'})),
    ];
    const seats = [];
    for (let i = 0; i < ordered.length; i++) {
      seats.push(await lobbySeatPrepareRequest(ordered[i].seat, i, ordered[i].kind, token));
    }
    const maxCost = Number(lobby.maxCost) || BUDGET || 225;
    return {
      bracket: Number(lobby.bracket) || (defaults && defaults.bracket) || 3,
      maxCost,
      humans,
      ais,
      seats,
    };
  }

  async function lobbyPollLive(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 240000);
    let sawStarting = false;
    while (Date.now() < deadline) {
      const live = await lobbyApi('/api/live');
      const status = live && live.status;
      if (status === 'starting') {
        if (!sawStarting) {
          sawStarting = true;
          C.notice('Forge is loading…');
        }
      } else if (status === 'ready' || status === 'playing') {
        return live;
      } else if (status === 'error' || status === 'failed' || status === 'incomplete') {
        throw new Error((live && live.error) || ('Game status: ' + status));
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Timed out waiting for Forge / live table (4 minutes).');
  }

  function lobbyResumeTabletop() {
    try { window.dispatchEvent(new Event('crankmagic-game-ready')); } catch (_) {}
    /* Classic shell lives under /app; live review table is at /. Prefer that when same-origin. */
    try {
      if (/\/app\/?$/i.test(location.pathname) || /\/app\//i.test(location.pathname)) {
        location.assign('/');
        return;
      }
    } catch (_) {}
    try {
      if (C.views && typeof C.views.online === 'function') {
        location.hash = 'online';
      }
    } catch (_) {}
  }


  actions["lobby-start"] = async () => {
    const t = table();
    if (!allReadyForStart(t)) {
      C.notice(t.why || "Ready Up every occupied seat and fix any blocked decks.", true);
      return;
    }
    if (startInFlight) return;
    startInFlight = true;
    redraw();
    C.notice("Contacting the local host…");
    try {
      const setup = await lobbyApi('/api/setup');
      const token = setup && setup.token;
      if (!token) throw new Error('Host /api/setup did not return a token. Is serve-review running?');
      const config = await lobbyBuildPrepareConfig(token, setup.defaults);
      C.notice(`Preparing ${config.seats.length} seats (native Forge AI)…`);
      const prepared = await lobbyApi('/api/prepare', {method: 'POST', token, body: config});
      if (!prepared || !prepared.id) throw new Error('Prepare did not return an id.');
      C.notice(config.humans > 1 ? 'Opening the private lobby…' : 'Launching Forge / tabletop…');
      const started = await lobbyApi('/api/start', {method: 'POST', token, body: {id: prepared.id}});
      if (started && started.lobby) {
        startInFlight = false;
        redraw();
        C.notice('Invitations are ready — refresh or share links for human seats. Waiting on guests.');
        return;
      }
      const live = await lobbyPollLive(240000);
      startInFlight = false;
      redraw();
      C.notice(live.status === 'playing' ? 'Live table is playing.' : 'Live table is ready.');
      lobbyResumeTabletop();
    } catch (err) {
      startInFlight = false;
      redraw();
      C.notice((err && err.message) ? err.message : String(err), true);
    }
  };

