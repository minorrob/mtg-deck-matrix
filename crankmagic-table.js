/* PLAY IN THE CLOUD: THE TABLE'S LOBBY (M5; the host and guest journeys Rob approved on 2026-09-26).
 *
 * The screen in front of cloud/tables.mjs. A host starts a table, invites people by email, link or QR, or
 * seats an AI; each person brings a deck from their own library; everyone readies; the host starts the
 * countdown and can cancel it; the game begins. The rules all live on the server (game/room/table.mjs): this
 * page shows the table as the server describes it, sends what the person did, and reads the table again.
 *
 *   #table                   a new table (Play › New table)
 *   #table?id=<id>           the table's lobby, and its game once it is on
 *   #table/<id>/<code>       an invitation: joins that seat, then shows the lobby
 *
 * SHUT UNTIL PLAY SHIPS. The page is only drawn where the build is marked for cloud Play
 * (<meta name="crankmagic-play" content="cloud">) and accounts are on; no release is, and releases leave this
 * file out with the rest of Play (tools/release-pages.mjs, PLAY). Anywhere else it says Coming Soon.
 *
 * While a game is on, the page is the board (crankmagic-board.js), which carries End game (two taps, Rob's
 * rule against accidental clicks) and Concede in its Tools. Once it is over, the lobby says so here.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, button: b, actions, views} = C;
  const cloudPlay = () => document.querySelector('meta[name="crankmagic-play"]')?.content === "cloud"
    && document.querySelector('meta[name="crankmagic-accounts"]')?.content === "on";
  const POLL_MS = 2000;
  /* The app's own mats (game/room/table.mjs, MATS), with their names. The last one chosen is remembered on this
     device and put on the next table you sit at. */
  const MATS = [["felt", "Felt"], ["forge", "Forge"], ["cavern", "Cavern"], ["sea", "Sea"], ["night", "Night"]];
  const MAT_KEY = "cm-mat";
  const rememberedMat = () => {try {const m = localStorage.getItem(MAT_KEY); return MATS.some(([k]) => k === m) ? m : null;} catch {return null;}};
  const matApplied = new Set();   /* tables this page has already put the remembered mat on */
  let matPicked = null;
  const ORDER = [["br", 0], ["bl", 1], ["tr", 2], ["tl", 3]];   /* the quadrant corners the local table uses, seat 1 first */
  let current = null;
  /* How far the table's clock is from this device's: the countdown is the server's, read in its own time. */
  let skew = 0;
  const tableNow = () => Date.now() + skew;

  /* The app's own API, as Play: the Worker wants its header, and JSON, on every write. */
  async function api(method, path, body) {
    const init = {method, credentials: "same-origin", redirect: "manual", cache: "no-store", headers: {}};
    if (method !== "GET") {init.headers = {"content-type": "application/json", "x-crankmagic": "play"}; init.body = JSON.stringify(body || {});}
    const response = await fetch(path, init);
    if (response.type === "opaqueredirect" || response.status === 401) throw Object.assign(new Error("Sign in to play."), {signedOut: true});
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(value.error || `The table answered ${response.status}.`), {status: response.status, unsupported: value.unsupported});
    return value;
  }
  const tableUrl = (id) => `/api/tables/${encodeURIComponent(id)}`;
  /* The board sends End game and Concede through the same door, then has the lobby read the table again. */
  C.tableApi = {api, tableUrl, refresh: (id) => refresh(id)};
  const inviteLink = (id, code) => `${location.origin}${location.pathname}#table/${id}/${code}`;

  /* A library deck as the table takes it: its name, its commander(s), and every other card by name. */
  function deckForTable(deck) {
    const commanders = new Set(deck.commanders || []);
    const name = (id) => (C.card(id) || {}).name;
    const cards = [];
    for (const slot of deck.slots || []) {
      if (slot.purpose !== "main" || commanders.has(slot.cardId)) continue;
      for (let i = 0; i < (slot.quantity || 1); i += 1) cards.push(name(slot.cardId));
    }
    return {name: deck.name, commander: [...commanders].map(name).filter(Boolean), cards: cards.filter(Boolean)};
  }
  const libraryDecks = () => (C.state.decks || []).filter((d) => !d.archived && (d.commanders || []).length);

  /* ---- the lobby ---- */
  function seatState(s, t) {
    if (!s.occupied) return s.invited ? "invited" : "empty";
    if ((t.away || []).some((a) => a.seatId === s.seatId)) return "error";
    return s.ready ? "ready" : s.deck ? "deck" : "pending";
  }
  function seatBox(s, t) {
    const art = C.seatArt;
    const who = `Seat ${s.seatId + 1} · ${s.you ? "You" : s.kind === "ai" ? "AI" : s.name}`;
    const state = seatState(s, t);
    const pseudo = s.deck ? {name: s.deck.name, commanders: (s.deck.commander || []).map((name) => ({name}))} : null;
    const away = (t.away || []).find((a) => a.seatId === s.seatId);
    const line = away ? `Dropped · back by ${new Date(away.until).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"})}`
      /* The table sends a card count for your own seat only; nobody sees another seat's cards. */
      : s.deck ? `${s.deck.name}${s.cards !== undefined ? ` · ${s.cards + (s.deck.commander || []).length} cards` : ""}`
      : s.occupied ? (s.you ? "Choose a deck." : "Choosing a deck")
      : s.invited ? "Invitation sent · waiting on them" : s.kind === "ai" ? "No deck yet" : "Invite someone";
    const controls = [];
    if (t.phase === "selecting" || t.phase === "countdown") {
      if (s.you) {
        controls.push(b(s.deck ? "Change deck" : "Choose a deck", "table-deck", {seat: String(s.seatId)}, !s.deck, {cls: "compact"}));
        controls.push(b("Choose mat", "table-mat", {}, false, {cls: "compact"}));
        if (s.deck) controls.push(b(s.ready ? "Not ready" : "Ready", "table-ready", {ready: s.ready ? "" : "1"}, !s.ready, {cls: "compact"}));
      } else if (t.youAreHost && s.kind === "ai") {
        controls.push(b(s.deck ? "Change deck" : "Choose its deck", "table-deck", {seat: String(s.seatId)}, !s.deck, {cls: "compact"}));
      } else if (t.youAreHost && s.kind === "human" && !s.occupied) {
        controls.push(b(s.invited ? "New link" : "Invite", "table-invite", {seat: String(s.seatId)}, !s.invited, {cls: "compact"}));
        if (s.invited) controls.push(b("Withdraw", "table-uninvite", {seat: String(s.seatId)}, false, {cls: "compact"}));
      }
    }
    const detail = `${pseudo ? `<p class="cm-seat-name">${e((s.deck.commander || [])[0] || s.deck.name)}</p>` : ""}<p class="cm-seat-line">${e(line)}</p>`;
    const inner = `<article class="cm-lobby-seat${s.kind === "ai" ? " is-ai" : " is-human"}${s.ready ? " is-ready" : ""}" data-seat="${s.seatId}" data-mat="${e(s.mat || "felt")}">
      <header><h3>${e(who)}</h3>${art.statusPill(state, s.ready)}</header>
      ${art.seatFigure(pseudo, detail, controls.length ? `<div class="cm-actions cm-seat-controls">${controls.join("")}</div>` : "")}
    </article>`;
    return {state, inner};
  }
  function centerPanel(t) {
    const waiting = t.blockers.filter((x) => x.seatId !== null).length;
    let launch;
    if (t.phase === "countdown") {
      launch = `<p class="cm-table-count" aria-live="polite">Starting in <strong id="cm-table-seconds">${Math.max(0, Math.ceil((t.countdownAt - tableNow()) / 1000))}</strong></p>${t.youAreHost ? b("Cancel", "table-cancel", {}, false, {cls: "compact"}) : ""}`;
    } else if (t.phase === "selecting") {
      const why = t.blockers.length ? (waiting ? `Waiting on ${waiting} seat${waiting === 1 ? "" : "s"}.` : t.blockers[0].reason + ".") : "Everyone is ready.";
      launch = `<p class="cm-table-launch${t.launchError ? " is-error" : ""}">${e(t.launchError || why)}</p>${t.youAreHost ? b("Start", "table-start", {}, !t.blockers.length, {cls: "compact"}) : ""}`;
    } else launch = `<p class="cm-table-launch">${e(t.phase === "playing" ? "The game is on." : t.phase === "rematch" ? "The game is over." : "Starting…")}</p>`;
    return `<section class="cm-table-center" aria-label="Table rules">
      <img class="cm-table-stamp" src="assets/crankmagic/crankmagic-logo-gear-v4-256.webp" alt="" aria-hidden="true">
      <div class="cm-table-head"><h2>Table rules</h2><span class="cm-table-setby-top">set by the host</span></div>
      <dl class="cm-table-rules"><div><dt>Starting life</dt><dd>40</dd></div><div><dt>Seats</dt><dd>${t.seats.length}</dd></div><div><dt>Invitations last</dt><dd>a day</dd></div><div><dt>A dropped player has</dt><dd>5 minutes</dd></div></dl>
      <div class="cm-table-launch-row" id="cm-table-launch">${launch}</div>
    </section>`;
  }
  /* After the game: the board is put away and the lobby says so. (While it is on, the page is the board.) */
  function gamePanel() {
    return `<section class="v-panel cm-table-game" id="cm-table-game"><h2>The game is over</h2><p class="cm-muted">Its record is kept.</p></section>`;
  }
  function draw(t) {
    current = t;
    applyRememberedMat(t);
    /* While the game is on, the page is the board's (crankmagic-board.js); it keeps its own socket. */
    if (C.board && C.board.wants(t)) return C.board.show(t);
    const art = C.seatArt;
    const seats = ORDER.map(([corner, i]) => {
      const s = t.seats[i];
      if (!s) return "";
      const {state, inner} = seatBox(s, t);
      return art.quadrant(corner, s.you ? "is-you" : "", [], state, inner);
    }).join("");
    C.main.innerHTML = C.pageHead("Play", "", "", `<p class="cm-muted">${t.youAreHost ? "Your table." : "You were invited to this table."} Four seats at most; it starts when everyone is ready.</p>`)
      + (t.phase === "rematch" ? gamePanel() : "")
      + `<div class="cm-lobby-table cm-cloud-table" data-phase="${e(t.phase)}">${seats}${centerPanel(t)}</div>`;
    art.startSeas();
  }

  /* Your mat, remembered: the first time this page sees you seated on felt at a table, it puts your last mat there. */
  function applyRememberedMat(t) {
    const mine = t.seats.find((s) => s.you), mat = rememberedMat();
    if (!mine || matApplied.has(t.tableId)) return;
    matApplied.add(t.tableId);
    if (mat && mine.mat === "felt" && mat !== "felt") api("POST", `${tableUrl(t.tableId)}/mat`, {mat}).catch(() => {});
  }
  async function refresh(id) {
    const {table, now} = await api("GET", tableUrl(id));
    if (Number.isFinite(now)) skew = now - Date.now();
    draw(table);
    return table;
  }

  views.table = (params) => {
    if (!cloudPlay()) {
      C.main.innerHTML = C.pageHead("Play", "", "", "") + `<section class="v-panel"><h2>Coming Soon</h2><p class="cm-muted">Play in the cloud is not switched on here yet.</p><div class="cm-actions">${b("Go to your decks", "home")}</div></section>`;
      return;
    }
    const id = params.get("id"), code = params.get("code");
    if (!id) return newTable();
    let stop = false, timer = null;
    const tick = () => {
      const seconds = document.getElementById("cm-table-seconds");
      if (seconds && current && current.countdownAt) seconds.textContent = String(Math.max(0, Math.ceil((current.countdownAt - tableNow()) / 1000)));
    };
    const loop = async () => {
      if (stop) return;
      try {await refresh(id);} catch (error) {showError(error, id); return;}
      timer = setTimeout(loop, POLL_MS);
    };
    const clock = setInterval(tick, 250);
    (async () => {
      if (code) {
        try {await api("POST", `${tableUrl(id)}/join`, {code}); history.replaceState(null, "", `#table?id=${id}`);}
        catch (error) {showError(error, id); return;}
      }
      loop();
    })();
    return () => {stop = true; clearTimeout(timer); clearInterval(clock); if (C.board) C.board.close();};
  };
  function showError(error, id) {
    const signIn = error.signedOut ? b("Sign in", "account-sign-in", {}, true) : "";
    C.main.innerHTML = C.pageHead("Play") + `<section class="v-panel cm-table-refused" id="cm-table-refused"><h2>${error.status === 410 ? "This invitation no longer works" : "The table could not be opened"}</h2>
      <p>${e(error.message)}</p><div class="cm-actions">${signIn}${b("Go to your decks", "home")}</div></section>`;
    void id;
  }

  /* ---- a new table ---- */
  function newTable() {
    const row = (n) => `<div class="cm-table-new-seat"><span>Seat ${n}</span>
      <select name="kind${n}" aria-label="Seat ${n}"><option value="human"${n === 2 ? " selected" : ""}>A person I will invite</option><option value="ai">An AI</option><option value="none"${n > 2 ? " selected" : ""}>Nobody</option></select>
      <input name="name${n}" maxlength="60" placeholder="${n === 2 ? "Their name" : "Name (optional)"}" aria-label="Seat ${n} name"></div>`;
    C.main.innerHTML = C.pageHead("Play") + `<section class="v-panel cm-table-new"><h2>New table</h2>
      <p class="cm-muted">You sit in seat 1 as the host. Each other seat is a person you invite, an AI, or nobody; a table seats two to four.</p>
      <form id="cm-table-new"><label>Your name at the table<input name="hostName" maxlength="60" required></label>${row(2)}${row(3)}${row(4)}
      <div class="cm-actions">${b("Create the table", "table-create", {}, true)}</div></form></section>`;
  }
  actions["table-create"] = async () => {
    const form = document.getElementById("cm-table-new");
    const v = Object.fromEntries(new FormData(form));
    if (!v.hostName.trim()) throw Error("Give your name at the table.");
    const seats = [2, 3, 4].filter((n) => v[`kind${n}`] !== "none").map((n) => ({kind: v[`kind${n}`], name: v[`name${n}`]}));
    if (!seats.length) throw Error("A table needs at least one other seat: a person or an AI.");
    const {table} = await api("POST", "/api/tables", {hostName: v.hostName, seats});
    C.go("table", {id: table.tableId});
  };

  /* ---- invitations ---- */
  actions["table-invite"] = async (el) => {
    const seatId = Number(el.dataset.seat), seat = current.seats[seatId];
    const {invite} = await api("POST", `${tableUrl(current.tableId)}/invite`, {seatId});
    const link = inviteLink(current.tableId, invite.code);
    const mail = `mailto:?subject=${encodeURIComponent("Join my Commander table on CrankMagic")}&body=${encodeURIComponent(`Here is your seat at my table:\n\n${link}\n\nThe link works for a day. You sign in to CrankMagic with this address.`)}`;
    C.modal(`Invite to seat ${seatId + 1}`, `<div class="cm-table-invite">
      <div><label>The link for ${e(seat.name)}<input id="cm-table-link" readonly value="${e(link)}"></label>
        <div class="cm-actions">${b("Copy link", "table-copy-link", {}, true)}<a class="v-button" id="cm-table-mail" href="${e(mail)}">Email it</a></div>
        <p class="cm-muted">It works for a day, for one person, and only for someone on CrankMagic's invite list. Sending a new link withdraws this one.</p></div>
      <div class="cm-qr-code">${globalThis.CrankQR ? CrankQR.svg(link, {label: `QR code for seat ${seatId + 1}`}) : ""}</div>
    </div><div class="cm-form-footer">${b("Done", "close", {}, true)}</div>`);
    refresh(current.tableId).catch(() => {});
  };
  actions["table-copy-link"] = async () => {
    const input = document.getElementById("cm-table-link");
    try {await navigator.clipboard.writeText(input.value); C.notice("Link copied.");}
    catch {input.select(); C.notice("Copying did not work in this browser; the link is selected to copy.", true);}
  };
  actions["table-uninvite"] = async (el) => {await api("POST", `${tableUrl(current.tableId)}/uninvite`, {seatId: Number(el.dataset.seat)}); await refresh(current.tableId);};

  /* ---- decks ---- */
  actions["table-deck"] = (el) => {
    const seatId = Number(el.dataset.seat), decks = libraryDecks();
    const list = decks.length
      ? `<ul class="cm-table-decks">${decks.map((d) => `<li><button type="button" class="cm-table-deck" data-action="table-use-deck" data-seat="${seatId}" data-deck="${e(d.id)}"><strong>${e(d.name)}</strong><span class="cm-muted">${e((d.commanders || []).map((c) => (C.card(c) || {}).name).filter(Boolean).join(" + "))}</span></button></li>`).join("")}</ul>`
      : `<p class="cm-muted">Your library has no deck with a commander yet.</p>`;
    C.modal(`Choose a deck · Seat ${seatId + 1}`, `${list}<div id="cm-table-deck-error" class="cm-note cm-warning" hidden></div><div class="cm-form-footer">${b("Cancel", "close")}</div>`);
  };
  actions["table-use-deck"] = async (el) => {
    const deck = libraryDecks().find((d) => d.id === el.dataset.deck);
    try {
      await api("POST", `${tableUrl(current.tableId)}/deck`, {seatId: Number(el.dataset.seat), deck: deckForTable(deck)});
      actions.close();
      await refresh(current.tableId);
    } catch (error) {
      const box = document.getElementById("cm-table-deck-error");
      if (!box) throw error;
      box.hidden = false;
      box.textContent = error.unsupported
        ? `The table cannot play ${deck.name} yet: ${error.unsupported.length} of its cards are not in the rules engine (${error.unsupported.slice(0, 6).join(", ")}${error.unsupported.length > 6 ? ", …" : ""}).`
        : error.message;
    }
  };

  /* ---- Choose mat (the handoff's 2b): a strip of the app's mats, the zones previewed over the one picked ---- */
  function matDialog() {
    const strip = MATS.map(([k, name]) => `<li><button type="button" class="cm-mat-pick" data-action="table-mat-pick" data-mat="${k}" aria-pressed="${k === matPicked}"><span class="cm-mat-swatch" data-mat="${k}"></span>${e(name)}</button></li>`).join("");
    return `<ul class="cm-mat-strip" aria-label="Mats">${strip}</ul>
      <div class="cm-mat-preview cm-mat-swatch" data-mat="${matPicked}" id="cm-mat-preview" aria-label="Preview of the mat">
        <span>Battlefield</span><span>Lands</span><span>Command</span><span>Exile</span><span>Library</span><span>Graveyard</span></div>
      <p class="cm-muted cm-mat-note">The app's own mats. Everyone at the table sees yours; this device remembers it for your next table. Your own mat images arrive with file storage.</p>
      <div class="cm-form-footer">${b("Use this mat", "table-mat-use", {}, true)}${b("Cancel", "close")}</div>`;
  }
  actions["table-mat"] = () => {
    const mine = current.seats.find((s) => s.you);
    matPicked = (mine && mine.mat) || "felt";
    C.modal("Choose mat", matDialog());
  };
  actions["table-mat-pick"] = (el) => {
    matPicked = el.dataset.mat;
    document.querySelectorAll(".cm-mat-pick").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mat === matPicked)));
    const preview = document.getElementById("cm-mat-preview");
    if (preview) preview.dataset.mat = matPicked;
  };
  actions["table-mat-use"] = async () => {
    await api("POST", `${tableUrl(current.tableId)}/mat`, {mat: matPicked});
    try {localStorage.setItem(MAT_KEY, matPicked);} catch {}
    actions.close();
    await refresh(current.tableId);
  };

  /* ---- ready, start, cancel ---- */
  actions["table-ready"] = async (el) => {await api("POST", `${tableUrl(current.tableId)}/ready`, {ready: el.dataset.ready === "1"}); await refresh(current.tableId);};
  actions["table-start"] = async () => {await api("POST", `${tableUrl(current.tableId)}/start`); await refresh(current.tableId);};
  actions["table-cancel"] = async () => {await api("POST", `${tableUrl(current.tableId)}/cancel`); await refresh(current.tableId);};
});
