/* PLAY IN THE CLOUD: THE TABLE'S LOBBY (M5; the host and guest journeys Rob approved on 2026-09-26).
 *
 * The screen in front of cloud/tables.mjs. A host starts a table, invites people by email, link or QR, or
 * seats an AI; each person chooses a shared deck or brings one from their own library; everyone readies; the host starts the
 * countdown and can cancel it; the game begins. The rules all live on the server (game/room/table.mjs): this
 * page shows the table as the server describes it, sends what the person did, and reads the table again.
 *
 *   #table                   a new table (Play › New table)
 *   #table?id=<id>           the table's lobby, and its game once it is on
 *   #table/<id>/<code>       an invitation: joins that seat, then shows the lobby (the link itself is /api/join/<id>/<code>,
 *                            which the Worker sends back here once Access has signed the person in)
 *
 * SHUT UNTIL PLAY SHIPS. The page is only drawn where the build is marked for cloud Play
 * (<meta name="crankmagic-play" content="cloud">) and accounts are on: staging is (2026-09-29), where the Play tab
 * opens this page; production leaves this file out with the rest of Play (tools/release-pages.mjs, PLAY) and its
 * Play tab says Coming Soon.
 *
 * While a game is on, the page is the board (crankmagic-board.js), which carries End game (two taps, Rob's
 * rule against accidental clicks) and Concede in its Tools. Once it is over, the lobby says so here.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, button: b, actions, views} = C;
  /* HELP: THE TABLE AND THE BOARD, the keys among it (the accessibility pass, docs/plan-to-done-2026-09-30.md Part 6):
     from the lobby's head and from the board's menu. The keys are the ones crankmagic-board.js's handlers bind, saying
     what they do there; tests/a11y-board.mjs reads both and holds them to each other. */
  C.HELP.table = {title: "Play: the table and the board", body: `<div class="cm-help"><h3>The table</h3>
    <p>Up to four seats. Invite people by link, QR code or email, or seat an AI. Everyone chooses one of Rob's shared decks or a deck from their own library and marks Ready, and the host starts the countdown. The host can change the table's rules (starting life, bracket limit) until a seat is ready.</p>
    <h3>The board</h3>
    <p><strong>Table</strong> shows every board at once. <strong>Focus</strong> puts one board on the mat, beside the seats. <strong>Full screen</strong> gives the game the whole screen. The pass button says what passing will do: <em>Next step</em>, <em>Resolve</em> and the spell's name, or <em>Pass</em>. Your draw happens by itself, and a spell you cast resolves unless someone responds; to be asked first, turn on <em>Hold priority after I cast</em> in Tools. A step where you have nothing to do passes by itself, and the history says so.</p>
    <h3>Keys</h3>
    <ul class="cm-help-keys">
      <li><kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> move through the board in the order it is laid out: the strip, the seats, the boards, what the table asks you, then your hand. <kbd>Enter</kbd> or <kbd>Space</kbd> presses what has the focus.</li>
      <li><kbd>Space</kbd>, with nothing focused, fans your hand, and in the fanned hand puts it away. While it is fanned, <kbd>1</kbd>–<kbd>9</kbd> holds that card up, and <kbd>Enter</kbd> does the held card's first thing (or presses the button that has the focus).</li>
      <li><kbd>Escape</kbd> puts away the card shown large, and steps back one thing a press: an open menu (History, Tools, ☰, the steps, You can also); the Coach; a held card, back into the fan; the fanned hand; the Panel; then full screen. In a dialog, it closes the dialog.</li>
      <li><kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>+</kbd> and <kbd>−</kbd> make the cards 10% larger or smaller.</li>
      <li>On a divider (the bar between the rows, the one atop your hand, the Panel's, the side column's), <kbd>↑</kbd> and <kbd>↓</kbd> move it. On the seat pane's edge, and on the bar between two boards side by side, <kbd>←</kbd> and <kbd>→</kbd> move it.</li>
      <li>In the Coach, <kbd>Enter</kbd> sends your question, and <kbd>Shift</kbd>+<kbd>Enter</kbd> starts a new line.</li>
    </ul>
    <p>Every card says its name and what is shown on it to a screen reader: tapped, its power and toughness, damage, counters, attacking or blocking, chosen or selected, and what it can do now; a face-down card is said to be one, and nothing more. Each question the table asks you is said as it arrives, and so is the card shown large under the pointer. Sound starts at your first click on the board, and Tools › Sound sets it.</p></div>`};
  const cloudPlay = () => document.querySelector('meta[name="crankmagic-play"]')?.content === "cloud"
    && document.querySelector('meta[name="crankmagic-accounts"]')?.content === "on";
  const POLL_MS = 2000;
  /* The mats (game/room/table.mjs, MATS), with their names: the five the app draws, then Rob's own artwork
     (2026-09-29; crankmagic-mats.css draws them from assets/playmats). The last one chosen is remembered on this
     device and put on the next table you sit at. */
  const MATS = [["felt", "Felt"], ["forge", "Forge"], ["cavern", "Cavern"], ["sea", "Sea"], ["night", "Night"],
    ["cloud-wolf", "Cloud Wolf"], ["sand-lion", "Sand Lion"], ["ember-serpent", "Ember Serpent"], ["grove-stag", "Grove Stag"], ["star-gate", "Star Gate"],
    ["moon-altar", "Moon Altar"], ["sky-citadel", "Sky Citadel"], ["sky-dais", "Sky Dais"], ["star-tome", "Star Tome"], ["dragon-pact", "Dragon Pact"],
    ["moon-wolf", "Moon Wolf"], ["falls-tree", "Falls Tree"], ["star-whale", "Star Whale"], ["grove-arch", "Grove Arch"], ["molten-sword", "Molten Sword"],
    ["sky-tree", "Sky Tree"], ["void-ring", "Void Ring"], ["desert-portal", "Desert Portal"], ["night-citadel", "Night Citadel"], ["white-sanctum", "White Sanctum"],
    ["grave-king", "Grave King"], ["tree-portal", "Tree Portal"], ["ringed-world", "Ringed World"], ["mirror-gates", "Mirror Gates"], ["orrery-bridge", "Orrery Bridge"]];
  const MAT_KEY = "cm-mat";
  const rememberedMat = () => {try {const m = localStorage.getItem(MAT_KEY); return MATS.some(([k]) => k === m) ? m : null;} catch {return null;}};
  const matApplied = new Set();   /* tables this page has already put the remembered mat on */
  /* YOUR SEAT, BEFORE THE GAME (the readiness checks of 2026-10-04): a friend who joined, then went to Settings to
     restore the host's backup, came back to Play and found New table, their seat apparently gone. The table a person
     sits at, before its game, is kept on this device; New table then leads with the way back to it. Once a game is on,
     Play goes straight to its board (item 19); once it is over, the seat is forgotten. */
  const SEAT_KEY = "crankmagic-play-seat";
  const seatKept = () => {try {return localStorage.getItem(SEAT_KEY);} catch {return null;}};
  const keepSeat = (id) => {try {if (id) localStorage.setItem(SEAT_KEY, id); else localStorage.removeItem(SEAT_KEY);} catch {/* kept for this page only */}};
  let matPicked = null;
  const ORDER = [["br", 0], ["bl", 1], ["tr", 2], ["tl", 3]];   /* the quadrant corners the local table uses, seat 1 first */
  let current = null, drawnKey = null;   /* the table last drawn, so a read that changed nothing redraws nothing */
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
  /* Through the Worker (cloud/worker.mjs, /api/join): Access's sign-in keeps the path, where it would drop a fragment. */
  const inviteLink = (id, code) => `${location.origin}/api/join/${id}/${code}`;

  /* A library deck as the table takes it: its name, its commander(s), and every other card by name. */
  function deckForTable(deck) {
    const commanders = new Set(deck.commanders || []);
    const name = (id) => (C.card(id) || {}).name;
    const cards = [];
    for (const slot of deck.slots || []) {
      if (slot.purpose !== "main" || commanders.has(slot.cardId)) continue;
      for (let i = 0; i < (slot.quantity || 1); i += 1) cards.push(name(slot.cardId));
    }
    /* source: which deck of this library it is, so the finished game is filed under it; the table shows it
       back to this seat alone. */
    /* bracket: the deck's own, as the Decks page shows it (B1-B5), which a table's limit is held to. */
    const bracket = Number(deck.definition && deck.definition.baseBracket);
    return {name: deck.name, commander: [...commanders].map(name).filter(Boolean), cards: cards.filter(Boolean), ...(Number.isInteger(bracket) ? {bracket} : {}), source: {deckId: deck.id, deckVersion: deck.version}};
  }
  const libraryDecks = () => (C.state.decks || []).filter((d) => !d.archived && (d.commanders || []).length);
  /* A SEAT'S COLOR FAN (the brief's lobby, 2026-10-12): once a commander is chosen, the quadrant wears its color identity,
     read from the card's record -- the library's own, else the records the app ships -- never guessed. Partners add
     their colors together. A commander no record knows draws no fan. */
  const WUBRG = ["W", "U", "B", "R", "G"];
  const recordByName = (name) => (C.cards().find((c) => c.name === name)) || (C.catalog && C.catalog.exact ? C.catalog.exact(name) : null);
  const identityOf = (deck) => {
    const colors = new Set();
    for (const name of (deck && deck.commander) || []) for (const c of ((recordByName(name) || {}).colorIdentity || [])) colors.add(c);
    return WUBRG.filter((c) => colors.has(c));
  };

  /* ---- YOUR DECKS AND THE TABLE (AI-5, docs/plan-to-done-2026-09-30.md) ----
     A deck says whether the table can play it, on its tile and its page, before any table is opened: the Worker is asked
     which of its card names a table cannot play yet (POST /api/tables/known, cloud/tables.mjs), and each answer is kept
     for the page's life, so the decks hub asks once for every deck. Play this deck on the deck page opens a new table with
     the deck at your seat, or brings it to the table you are already seated at; New from Wizards' Play it makes the precon
     a deck and does the same. Only where Play is in the cloud: elsewhere C.play is never open, and nothing is shown. */
  const knownNames = new Map();   /* a card name -> whether a table can play it, as the Worker said */
  const KNOWN_BATCH = 1000;   /* names per question: well under the table's 2000 and the door's 64 KB */
  async function unknownOf(names) {
    const ask = [...new Set(names)].filter((n) => n && !knownNames.has(n));
    for (let i = 0; i < ask.length; i += KNOWN_BATCH) {
      const part = ask.slice(i, i + KNOWN_BATCH);
      const unknown = new Set((await api("POST", "/api/tables/known", {names: part})).unknown || []);
      for (const n of part) knownNames.set(n, !unknown.has(n));
    }
    return names.filter((n) => knownNames.get(n) === false);
  }
  /* A deck's readiness for the table: its commander(s) and every other card by name, and those a table cannot play yet. */
  async function readiness(deck) {
    const read = deckForTable(deck), all = [...read.commander, ...read.cards];
    const missing = [...new Set(await unknownOf(all))];
    return {total: all.length, unknown: missing, count: all.filter((n) => missing.includes(n)).length};
  }
  const readinessText = (r) => r.count ? `${r.total - r.count} of ${r.total} known · ${r.count} to learn` : `Playable at the table · all ${r.total} cards known`;
  const playable = (deck) => !deck.archived && (deck.commanders || []).length > 0;
  C.play = {
    open: cloudPlay,
    /* The decks hub: each tile's slot says "Playable at the table", or how many of its cards are still to learn. */
    async tiles() {
      if (!cloudPlay()) return;
      const slots = [...document.querySelectorAll("[data-play-for]")];
      const decks = slots.map((el) => (C.state.decks || []).find((d) => d.id === el.dataset.playFor)).filter((d) => d && playable(d));
      try {await unknownOf(decks.flatMap((d) => {const r = deckForTable(d); return [...r.commander, ...r.cards];}));} catch {return;}
      for (const d of decks) {
        const el = document.querySelector(`[data-play-for="${CSS.escape(d.id)}"]`), r = await readiness(d);
        if (!el) continue;
        el.textContent = r.count ? `${r.count} card${r.count === 1 ? "" : "s"} to learn for the table` : "Playable at the table";
        el.classList.toggle("is-playable", !r.count);
        el.hidden = false;
      }
    },
    /* The deck page: the readiness line, and Play this deck when the table can play every card. */
    async deck(d) {
      const el = document.getElementById("cm-deck-play");
      if (!el || !cloudPlay() || !playable(d)) return;
      let r;
      try {r = await readiness(d);} catch {return;}
      el.innerHTML = `<span class="cm-deck-play-line">${e(readinessText(r))}</span>`
        + (r.count ? ` <span class="cm-muted">The table cannot play ${r.unknown.length === 1 ? "this one" : "these"} yet: ${e(r.unknown.slice(0, 6).join(", "))}${r.unknown.length > 6 ? ", …" : ""}.</span>`
          : ` ${b("Play this deck", "deck-play", {deck: d.id}, true, {cls: "compact"})}`);
      el.classList.toggle("is-playable", !r.count);
      el.hidden = false;
    },
  };
  actions["deck-play"] = (el) => C.go("table", {deck: el.dataset.deck});

  /* ---- the lobby ---- */
  function seatState(s, t) {
    if (!s.occupied) return s.invited ? "invited" : "empty";
    if ((t.away || []).some((a) => a.seatId === s.seatId)) return "error";
    return s.ready ? "ready" : s.deck ? "deck" : "pending";
  }
  function seatBox(s, t) {
    const art = C.seatArt;
    /* An AI seat says its setting (AI-2): Easy or Normal. */
    const who = `Seat ${s.seatId + 1} · ${s.you ? "You" : s.kind === "ai" ? `AI · ${({easy: "Easy", llm: "Claude"})[s.level] || "Normal"}` : s.name}`;
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
    const detail = `${pseudo ? `<p class="cm-seat-name"><span>${e((s.deck.commander || [])[0] || s.deck.name)}</span></p>` : ""}<p class="cm-seat-line"><span>${e(line)}</span></p>`;
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
      /* "Launches when all are ready · n to go" (the brief, 2026-10-12): the count of seats still to go, then the one
         reason that is not a seat's, if any. The host's Start begins the ten-second countdown; it never launches outright. */
      const why = t.blockers.length ? `Launches when all are ready · ${waiting ? `${waiting} seat${waiting === 1 ? "" : "s"} to go` : t.blockers[0].reason}.` : "Everyone is ready.";
      launch = `<p class="cm-table-launch${t.launchError ? " is-error" : ""}">${e(t.launchError || why)}</p>${t.youAreHost ? b("Start", "table-start", {}, !t.blockers.length, {cls: "compact"}) : ""}${t.blockers.length || t.youAreHost ? "" : `<p class="cm-muted cm-table-launch-note">The host starts the ten-second countdown.</p>`}`;
    } else launch = `<p class="cm-table-launch">${e(t.phase === "playing" ? "The game is on." : t.phase === "rematch" ? "The game is over." : "Starting…")}</p>`;
    return `<section class="cm-table-center" aria-label="Table rules">
      <img class="cm-table-stamp" src="assets/crankmagic/crankmagic-logo-gear-v4-256.webp" alt="" aria-hidden="true">
      <div class="cm-table-head"><h2>Table rules</h2>${t.youAreHost && t.phase === "selecting" ? `<button type="button" class="cm-table-rules-edit" data-action="table-rules" aria-label="Edit the table rules">Edit</button>` : ""}<span class="cm-table-setby-top">set by the host</span></div>
      <dl class="cm-table-rules"><div><dt>Starting life</dt><dd>${rulesOf(t).startingLife}</dd></div><div><dt>Bracket limit</dt><dd>${rulesOf(t).bracketLimit ? `${rulesOf(t).bracketLimit} or lower` : "Any"}</dd></div><div><dt>Seats</dt><dd>${t.seats.length}</dd></div><div><dt>Invitations last</dt><dd>a day</dd></div><div><dt>A dropped player has</dt><dd>5 minutes</dd></div></dl>
      <div class="cm-table-launch-row" id="cm-table-launch">${launch}</div>
    </section>`;
  }
  /* THE TABLE'S RULES (Rob, 2026-09-30): the host edits the starting life and the bracket limit from a small Edit beside
     the panel's heading, and not once any seat is ready -- then the Edit is refused, saying how to change them. */
  const rulesOf = (t) => t.rules || {startingLife: 40, bracketLimit: null};
  const readyNames = (t) => t.seats.filter((x) => x.ready).map((x) => x.name);
  const namesText = (list) => list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  actions["table-rules"] = () => {
    const ready = readyNames(current);
    if (ready.length) throw Error(`The rules can't change once a seat is ready, and ${namesText(ready)} ${ready.length === 1 ? "is" : "are"}. Take back Ready (an AI seat is ready once its deck is chosen, so choose AI decks after the rules), then edit the rules.`);
    const r = rulesOf(current);
    const dialog = C.modal("Table rules", `<form id="cm-table-rules-form" class="cm-table-rules-form">
      <label>Starting life<input type="number" name="startingLife" min="1" max="999" step="1" inputmode="numeric" value="${r.startingLife}" required></label>
      <label>Bracket limit<select name="bracketLimit"><option value="">Any</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${r.bracketLimit === n ? " selected" : ""}>${n} or lower</option>`).join("")}</select></label>
      <p class="cm-muted">A deck above the limit is refused when it is chosen. The rules can't change once a seat is ready.</p>
      <div id="cm-table-rules-error" class="cm-note cm-warning" hidden></div>
      <div class="cm-form-footer">${b("Save the rules", "table-rules-save", {}, true)}</div></form>`);
    dialog.classList.add("cm-table-rules-dialog");
  };
  actions["table-rules-save"] = async () => {
    const v = Object.fromEntries(new FormData(document.getElementById("cm-table-rules-form")));
    try {
      await api("POST", `${tableUrl(current.tableId)}/rules`, {startingLife: Number(v.startingLife), bracketLimit: v.bracketLimit ? Number(v.bracketLimit) : null});
      actions.close();
      await refresh(current.tableId);
    } catch (error) {
      const box = document.getElementById("cm-table-rules-error");
      if (!box) throw error;
      box.hidden = false; box.textContent = error.message;
    }
  };
  /* After the game: the board is put away and the lobby says so. (While it is on, the page is the board.) */
  function gamePanel() {
    return `<section class="v-panel cm-table-game" id="cm-table-game"><h2>The game is over</h2><p class="cm-muted">Its record is kept.</p></section>`;
  }
  function draw(t, asked) {
    current = t;
    applyRememberedMat(t);
    if (t.seats.some((s) => s && s.you) && t.phase !== "rematch") keepSeat(t.tableId);
    else if (seatKept() === t.tableId) keepSeat(null);
    /* While the game is on, the page is the board's (crankmagic-board.js); it keeps its own socket. */
    if (C.board && C.board.wants(t)) return C.board.show(t, asked);
    /* The table is read every two seconds; a read that changed nothing leaves the page as it is (Rob, 2026-09-29:
       every redraw restarted the seats' seas, and it loses whatever the reader was pointing at). */
    const key = JSON.stringify(t);
    if (key === drawnKey && C.main.querySelector(".cm-cloud-table")) return;
    drawnKey = key;
    const art = C.seatArt;
    const seats = ORDER.map(([corner, i]) => {
      const s = t.seats[i];
      if (!s) return "";
      const {state, inner} = seatBox(s, t);
      return art.quadrant(corner, s.you ? "is-you" : "", s.deck ? identityOf(s.deck) : [], state, inner);
    }).join("");
    /* Drawn anew, the lobby keeps the focus on the control the keyboard was on (the accessibility pass). */
    C.keepFocus(C.main, () => {
      C.main.innerHTML = C.pageHead("Play", "", "table", `<p class="cm-muted">${t.youAreHost ? "Your table." : "You were invited to this table."} Four seats at most; it starts when everyone is ready.</p>`)
        + (t.phase === "rematch" ? gamePanel() : "")
        + `<div class="cm-lobby-table cm-cloud-table" data-phase="${e(t.phase)}">${seats}${centerPanel(t)}</div>`;
    });
    art.startSeas();
  }

  /* Your mat, remembered: the first time this page sees you seated on felt at a table, it puts your last mat there. */
  function applyRememberedMat(t) {
    const mine = t.seats.find((s) => s.you), mat = rememberedMat();
    if (!mine || matApplied.has(t.tableId)) return;
    matApplied.add(t.tableId);
    if (mat && mine.mat === "felt" && mat !== "felt") api("POST", `${tableUrl(t.tableId)}/mat`, {mat}).catch(() => {});
  }
  /* `live` says whether the page still wants this table: a read that lands after the person left draws nothing. */
  async function refresh(id, live = () => true) {
    const asked = performance.now();   /* the board weighs the read against the room's newer frames by when it was asked */
    const {table, now} = await api("GET", tableUrl(id));
    if (!live()) return table;
    if (Number.isFinite(now)) skew = now - Date.now();
    draw(table, asked);
    return table;
  }

  views.table = (params) => {
    if (!cloudPlay()) {
      C.main.innerHTML = C.pageHead("Play", "", "", "") + `<section class="v-panel"><h2>Coming Soon</h2><p class="cm-muted">Play in the cloud is not switched on here yet.</p><div class="cm-actions">${b("Go to your decks", "home")}</div></section>`;
      return;
    }
    const id = params.get("id"), code = params.get("code");
    /* Play, with a game of yours on (item 19): straight back to it, in place of this page in the history. */
    const live = !id && C.board && C.board.live && C.board.live();
    if (live) {location.replace(`#table?id=${encodeURIComponent(live.tableId)}`); return;}
    if (!id) return newTable(params.get("deck"));
    let stop = false, timer = null;
    const tick = () => {
      const seconds = document.getElementById("cm-table-seconds"), left = current && current.countdownAt ? String(Math.max(0, Math.ceil((current.countdownAt - tableNow()) / 1000))) : null;
      /* written only when it changes: the count is a live region, said each time it is written */
      if (seconds && left !== null && seconds.textContent !== left) seconds.textContent = left;
    };
    const loop = async () => {
      if (stop) return;
      try {await refresh(id, () => !stop);} catch (error) {if (!stop) showError(error, id); return;}
      timer = setTimeout(loop, POLL_MS);
    };
    const clock = setInterval(tick, 250);
    (async () => {
      if (code) {
        try {await api("POST", `${tableUrl(id)}/join`, {code}); history.replaceState(null, "", `#table?id=${id}`);}
        catch (error) {if (!stop) showError(error, id); return;}
      }
      loop();
    })();
    /* Leaving the page is not leaving the game: the board keeps its socket, and the seat is never marked away. */
    return () => {stop = true; clearTimeout(timer); clearInterval(clock); if (C.board) C.board.detach();};
  };
  function showError(error, id) {
    const signIn = error.signedOut ? b("Sign in", "account-sign-in", {}, true) : "";
    /* Signing in works only for addresses on the invite list (docs/play-invites.md); say so before they try. */
    const listed = error.signedOut ? `<p class="cm-muted" id="cm-table-invite-only">CrankMagic is invite-only for now: signing in works for addresses on its invite list, and a table's link never adds anyone to it. <a href="not-invited.html">Not on the list?</a></p>` : "";
    C.main.innerHTML = C.pageHead("Play") + `<section class="v-panel cm-table-refused" id="cm-table-refused"><h2>${error.status === 410 ? "This invitation no longer works" : error.signedOut ? "Sign in to take your seat" : "The table could not be opened"}</h2>
      <p>${e(error.message)}</p>${listed}<div class="cm-actions">${signIn}${b("Go to your decks", "home")}</div></section>`;
    void id;
  }

  /* ---- a new table ---- */
  function newTable(deckId = null) {
    const row = (n) => `<div class="cm-table-new-seat"><span>Seat ${n}</span>
      <select name="kind${n}" aria-label="Seat ${n}"><option value="human"${n === 2 ? " selected" : ""}>A person I will invite</option><option value="ai">An AI · Normal</option><option value="ai-easy">An AI · Easy</option><option value="none"${n > 2 ? " selected" : ""}>Nobody</option></select>
      <input name="name${n}" maxlength="60" placeholder="${n === 2 ? "Their name" : "Name (optional)"}" aria-label="Seat ${n} name"></div>`;
    C.main.innerHTML = C.pageHead("Play", "", "table") + `<section class="v-panel cm-table-new"><h2>New table</h2>
      <p class="cm-muted">You sit in seat 1 as the host. Each other seat is a person you invite, an AI, or nobody; a table seats two to four.</p>
      <form id="cm-table-new"><div class="cm-table-new-deck" id="cm-table-new-deck" hidden></div><label>Your name at the table<input name="hostName" maxlength="60" required></label>${row(2)}${row(3)}${row(4)}
      <div class="cm-actions">${b("Create the table", "table-create", {}, true)}</div></form></section>`;
    recentGames();
    const bring = deckId ? libraryDecks().find((d) => d.id === deckId) : null;
    if (bring) bringing(bring);
    const kept = seatKept();
    if (kept) waitingSeat(kept, bring);
    offerClaude();
  }
  /* PLAY THIS DECK (AI-5): the deck you came with is said above the seats and goes to your seat once the table is made --
     only if the table can play every card of it; otherwise the page says which it cannot, and you choose another there. */
  async function bringing(deck) {
    let r;
    try {r = await readiness(deck);} catch {return;}
    const box = document.getElementById("cm-table-new-deck");
    if (!box) return;
    box.innerHTML = r.count
      ? `<p class="cm-note cm-warning">${e(deck.name)} cannot be played at the table yet: ${r.count} of its cards ${r.count === 1 ? "is" : "are"} not in the rules engine (${e(r.unknown.slice(0, 6).join(", "))}${r.unknown.length > 6 ? ", …" : ""}). Create the table and choose another deck there.</p>`
      : `<p>You bring <strong>${e(deck.name)}</strong> to seat 1.</p><input type="hidden" name="deck" value="${e(deck.id)}">`;
    box.hidden = false;
  }
  /* AN AI ON CLAUDE (AI-2), offered beside Normal and Easy only where this person may seat one (GET /api/ai-seat). */
  async function offerClaude() {
    let open = false;
    try {({open} = await api("GET", "/api/ai-seat"));} catch {return;}
    const form = document.getElementById("cm-table-new");
    if (!open || !form) return;
    for (const select of form.querySelectorAll("select[name^=kind]")) {
      if (select.querySelector("option[value=ai-llm]")) continue;
      select.querySelector("option[value=ai-easy]").insertAdjacentHTML("afterend", `<option value="ai-llm">An AI · Claude</option>`);
    }
  }
  /* RECENT GAMES (Play home, 2026-10-12): the last few results filed in the library, under New table -- the outcome, the
     deck, the pod and the day -- each a way to its deck's record. Nothing when none is filed yet. */
  function recentGames() {
    const games = [...(C.state.games || [])].sort((a, b) => String(b.playedAt || b.at || "").localeCompare(String(a.playedAt || a.at || ""))).slice(0, 5);
    const form = document.querySelector(".cm-table-new");
    if (!games.length || !form) return;
    const deckName = (id) => ((C.state.decks || []).find((d) => d.id === id) || {}).name || "a deck no longer in the library";
    const WORD = {win: "Won", loss: "Lost", draw: "Drew", unfinished: "Unfinished"};
    const rows = games.map((g) => `<li class="cm-table-recent-row" data-outcome="${e(g.outcome || "")}"><b>${e(WORD[g.outcome] || g.outcome || "Played")}</b><span>${e(deckName(g.deckId))}</span><span class="cm-muted">${g.pod ? `${g.pod} seats · ` : ""}${g.playedAt || g.at ? e(C.usDate(g.playedAt || g.at)) : ""}</span></li>`).join("");
    form.insertAdjacentHTML("afterend", `<section class="v-panel cm-table-recent" id="cm-table-recent" aria-label="Recent games"><h2>Recent games</h2><ol class="cm-table-recent-list">${rows}</ol><p class="cm-muted">Every game you finish at a table is filed under the deck you brought. Its record is on the deck's page.</p></section>`);
  }
  /* The kept seat, if it is still yours and its game not over: said first, above New table. */
  async function waitingSeat(id, bring = null) {
    let table;
    try {({table} = await api("GET", tableUrl(id)));}
    catch (error) {if (error.status === 403 || error.status === 404 || error.status === 410) keepSeat(null); return;}
    const form = document.getElementById("cm-table-new");
    if (!form || document.getElementById("cm-table-back")) return;
    if (!table.seats.some((s) => s && s.you) || table.phase === "rematch") {keepSeat(null); return;}
    const host = table.seats[0];   /* the host sits in seat 1 */
    const whose = table.youAreHost ? "your table" : host && host.name ? `${e(host.name)}'s table` : "the host's table";
    form.closest(".cm-table-new").insertAdjacentHTML("beforebegin", `<section class="v-panel cm-table-back" id="cm-table-back"><h2>Your seat is waiting</h2>
      <p>You have a seat at ${whose}${table.phase === "playing" ? ", and its game is on" : ", and its game has not started yet"}.</p>
      <div class="cm-actions">${b("Back to your table", "table-back", {table: table.tableId}, true)}</div></section>`);
    /* With a deck to bring, and the game not yet begun: bring it to your seat there instead of a new table (AI-5). */
    const mine = table.seats.find((s) => s && s.you);
    if (!bring || !mine || !["selecting", "countdown"].includes(table.phase)) return;
    let r;
    try {r = await readiness(bring);} catch {return;}
    const actionsRow = document.querySelector("#cm-table-back .cm-actions");
    if (r.count || !actionsRow) return;
    actionsRow.insertAdjacentHTML("beforeend", b(`Bring ${bring.name} there`, "table-bring", {table: table.tableId, seat: String(mine.seatId), deck: bring.id}));
  }
  actions["table-bring"] = async (el) => {
    const deck = libraryDecks().find((d) => d.id === el.dataset.deck);
    if (!deck) throw Error("That deck is not in your library any more.");
    await api("POST", `${tableUrl(el.dataset.table)}/deck`, {seatId: Number(el.dataset.seat), deck: deckForTable(deck)});
    C.go("table", {id: el.dataset.table});
  };
  actions["table-back"] = (el) => C.go("table", {id: el.dataset.table});
  actions["table-create"] = async () => {
    const form = document.getElementById("cm-table-new");
    const v = Object.fromEntries(new FormData(form));
    if (!v.hostName.trim()) throw Error("Give your name at the table.");
    /* An AI at Normal or Easy (AI-2): Normal scores its choices; Easy, now and then, takes the second best; Claude asks a
       model at its close calls. */
    const seats = [2, 3, 4].filter((n) => v[`kind${n}`] !== "none").map((n) => (v[`kind${n}`].startsWith("ai")
      ? {kind: "ai", level: ({"ai-easy": "easy", "ai-llm": "llm"})[v[`kind${n}`]] || "normal", name: v[`name${n}`]}
      : {kind: v[`kind${n}`], name: v[`name${n}`]}));
    if (!seats.length) throw Error("A table needs at least one other seat: a person or an AI.");
    const {table} = await api("POST", "/api/tables", {hostName: v.hostName, seats});
    /* The deck you came with (Play this deck, AI-5) takes your seat now; if the table refuses it, its lobby says why. */
    const bring = v.deck ? libraryDecks().find((d) => d.id === v.deck) : null;
    if (bring) {
      try {await api("POST", `${tableUrl(table.tableId)}/deck`, {seatId: 0, deck: deckForTable(bring)});}
      catch (error) {C.notice(`${bring.name} did not take your seat: ${error.message}`, true);}
    }
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
  /* THE BASIC LANDS TEST DECK (Rob, 2026-09-29: "add the basic lands test deck on staging"). Made while the engine
     played basic lands only, so that a game could be played through at all; the table now plays every definition in the
     engine's directory (M5), and the test deck stays on playtest tables as the quickest game to try. It is not a library
     deck, so its result is filed nowhere. */
  const TEST_DECK = Object.freeze({name: "Basic lands test deck", commander: ["Wastes"],
    cards: [["Plains", 20], ["Island", 20], ["Swamp", 20], ["Mountain", 20], ["Forest", 19]].flatMap(([land, n]) => Array(n).fill(land))});
  /* Rob authorized these seven deck lists for every signed-in playtester on October 14, 2026.
     Snapshot of data/live-state.json: names and main decks only, never his collection or account data.
     Shared selections carry no library source, so guest results cannot be filed under Rob's deck IDs. */
  const SHARED_DECKS = Object.freeze([
    {"id":"shared:D1","name":"D1 Quintorius Spirits","commander":["Quintorius, Loremaster"],"cards":["Advanced Reconstruction","Arcane Signet","Archaeomancer's Map","Bag of Holding","Battlefield Forge","Boros Charm","Boros Signet","Buried Ruin","Cathartic Reunion","Ceaseless Conflict","Clifftop Retreat","Command Tower","Conspiracy Theorist","Containment Construct","Currency Converter","Demand Answers","Emeria, the Sky Ruin","Excava, the Risen Past","Faithless Looting","Fellwar Stone","Fields of Strife","Flashback","Furycalm Snarl","Garrison Excavator","Generous Gift","Getaway Barrel","Ghost Vacuum","Glittering Massif","Hofri Ghostforge","Inspiring Vantage","Iron Hills","Karmic Guide","Knight of the White Orchid","Laelia, the Blade Reforged","Lorehold Archivist // Restore Relic","Lorehold Campus","Lorehold Charm","Lorehold Excavation","Millikin","Mind Stone","Mistveil Plains","Mizzix's Mastery","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Path to Exile","Perpetual Timepiece","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Primary Research","Quintorius Kand","Quintorius, Field Historian","Quintorius, History Chaser","Radiant Summit","Reckless Impulse","Reconstruct History","Relic Retriever","Remorseful Cleric","Return to Dust","Rip Apart","Rubble Rouser","Rugged Prairie","Sacred Peaks","Salvation Colossus","Selfless Spirit","Serra Paragon","Settle the Wreckage","Sevinne's Reclamation","Skyclave Apparition","Smuggler's Copter","Squee, the Immortal","Stone Quarry","Sun Titan","Sunbaked Canyon","Sunscorched Divide","Swords to Plowshares","Temple of Triumph","Teshar, Ancestor's Apostle","Thrill of Possibility","Tocasia's Welcome","Troop of Ponies","Turbulent Steppe","Valakut Exploration","Venerable Warsinger","Weathered Wayfarer","Wind-Scarred Crag","Winds of Abandon"],"bracket":3},
    {"id":"shared:D2","name":"D2 Chulane Value Loop","commander":["Chulane, Teller of Tales"],"cards":["Ancient Greenwarden","Arcane Signet","Azorius Chancery","Azorius Guildgate","Beast Whisperer","Blade Splicer","Blizzard Strix","Blossoming Sands","Bofur, Reliable Guardian // Concerted Care","Canopy Vista","Cast Out","Charming Prince","Chomping Changeling","Claim Jumper","Coiling Oracle","Deputy of Detention","Dundoolin Weaver","Earth Kingdom Jailer","Elvish Rejuvenator","Ephemerate","Eternal Witness","Fabled Passage","Faeburrow Elder","Farhaven Elf","Fblthp, the Lost","Fell the Mighty","Fertilid","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Freed from the Real","Glacial Fortress","Guardian Project","Hinterland Harbor","Ilysian Caryatid","Intruder Alarm","Island","Island","Island","Island","Island","Island","Island","Jungle Barrier","Kami of Ancient Law","Kor Skyfisher","Lotus Field","Man-o'-War","Meandering River","Mirkwood Nurturer","Mistmeadow Witch","Mulldrifter","Mystic Snake","Paradise Druid","Paradox Gardens","Plains","Plains","Plains","Plains","Plains","Plains","Prairie Stream","Rampant Growth","Reclamation Sage","Reflector Mage","Reliquary Tower","Roon of the Hidden Realm","Sakura-Tribe Elder","Seaside Citadel","Selesnya Guildgate","Selfless Savior","Shrieking Drake","Simic Guildgate","Siren's Ruse","Sol Ring","Solemn Simulacrum","Song of the Dryads","Soulherder","Springbloom Druid","Stonecloaker","Temur Sabertooth","The Eternal Wanderer","Thornwood Falls","Tireless Provisioner","Tireless Tracker","Topiary Stomper","Valorous Stance","Wall of Blossoms","Watcher for Tomorrow","White Orchid Phantom","Whitemane Lion","Wood Elves","Yavimaya Dryad","Zendikar's Roil"],"bracket":3},
    {"id":"shared:D3","name":"D3 Atraxa Proliferate","commander":["Atraxa, Praetors' Voice"],"cards":["Anguished Unmaking","Arcane Sanctum","Arcane Signet","Astral Cornucopia","Azorius Guildgate","Azorius Signet","Berta, Wise Extrapolator","Bitterthorn, Nissa's Animus","Bloom Hulk","Brainstorm","Branching Evolution","Cast Out","Chromatic Lantern","Coalition Relic","Collective Effort","Command Tower","Contagion Clasp","Contentious Plan","Deepglow Skate","Despark","Dismal Backwater","Drowned Catacomb","Duty Beyond Death","Everflowing Chalice","Evolution Sage","Fathom Mage","Fertilid","Flow State","Flux Channeler","Forest","Forest","Forest","Forest","Forest","Forest","Frantic Search","Fuel for the Cause","Garruk's Uprising","Germination Practicum","Go for the Throat","Golgari Guildgate","Grateful Apparition","Guardian Scalelord","Ichormoon Gauntlet","Inexorable Tide","Innkeeper's Talent","Inspiring Call","Island","Island","Island","Island","Island","Island","Island","Karn's Bastion","Knight of Autumn","Lake-town","Lethal Scheme","Llanowar Wastes","Long Goodbye","Meandering River","Merfolk Skydiver","Mirkwood","Mortify","Mystic Remora","Origin of Metalbending","Plaguemaw Beast","Plains","Plains","Plains","Plains","Plains","Pollenbright Druid","Protector of the Wastes","Rage into the Valley","Repel Calamity","Simic Guildgate","Simic Signet","Steady Progress","Sunpetal Grove","Swamp","Swamp","Swamp","Sword of the Animist","Tekuthal, Inquiry Dominus","Temple of Enlightenment","Tezzeret's Gambit","Thornwood Falls","Throne of Geth","Thrummingbird","Tidus, Yuna's Guardian","Tragic Arrogance","Troll Negotiations","Underground River","Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal","Viral Drake","Wall of Resurgence","Wanderer's Strike","Warg Tactics"],"bracket":3},
    {"id":"shared:D4","name":"D4 Felothar Walls","commander":["Felothar the Steadfast"],"cards":["Assault Formation","Austere Command","Axebane Guardian","Beast Within","Betor, Ancestor's Voice","Blight Pile","Blossoming Sands","Burnished Hart","Carven Caryatid","Caves of Koilos","Command Tower","Concealed Courtyard","Crashing Drawbridge","Despark","Doran, the Siege Tower","Dragonlord Dromoka","Fateful Absence","Fell the Mighty","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Fortified Village","Freyalise, Llanowar's Fury","Golgari Guildgate","Golgari Signet","Great Forest Druid","Guardian of Faith","Guardian Project","Huatli, the Sun's Heart","Ikra Shidiqi, the Usurper","Indomitable Ancients","Isolated Chapel","Jaddi Offshoot","Llanowar Wastes","Mentor of the Meek","Moonlit Lamenter","Nyx-Fleece Ram","Origin of Metalbending","Orzhov Signet","Overgrown Battlement","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plaza of Heroes","Portcullis Vine","Putrefy","Rampant Growth","Sandsteppe Citadel","Sapling of Colfenor","Saruli Caretaker","Selesnya Guildgate","Selesnya Signet","Shalai, Voice of Plenty","Shield-Wall Sentinel","Sidar Kondo of Jamuraa","Slaughter the Strong","Sunpetal Grove","Swamp","Swamp","Swamp","Swamp","Swamp","Sylvan Caryatid","Titan's Grave","Tower Defense","Tranquil Expanse","Tree of Perdition","Tree of Redemption","Treefolk Umbra","Valorous Stance","Venat, Heart of Hydaelyn // Hydaelyn, the Mothercrystal","Vindicate","Vine Trellis","Wakestone Gargoyle","Walking Bulwark","Wall of Blossoms","Wall of Limbs","Wall of Mulch","Wall of Omens","Wall of Roots","Wave of Reckoning","Weathered Sentinels","Welcoming Vampire","Wingmantle Chaplain","Wood Elves","Zetalpa, Primal Dawn"],"bracket":3},
    {"id":"shared:D5","name":"D5 Shadrix Aristocrats","commander":["Shadrix Silverquill"],"cards":["Abigale, Eloquent First-Year","Adeline, Resplendent Cathar","Angel of Indemnity","Arcane Signet","Austere Command","Bastion of Remembrance","Battle Screech","Boggart Mischief","Castle Ardenvale","Clachan Festival","Combat Calligrapher","Corpse Knight","Cruel Celebrant","Elas il-Kor, Sadistic Pilgrim","Elspeth, Sun's Nemesis","Evolving Wilds","Exotic Orchard","Exsanguinate","Fabled Passage","Fell the Profane // Fell Mire","Fracture","Goldvein Pick","Grave Titan","Hidden Stockpile","Idol of Oblivion","Indulging Patrician","Infernal Grasp","Intangible Virtue","Isolated Chapel","Kambal, Profiteering Mayor","Lingering Souls","Make a Stand","Mind Stone","Ministrant of Obligation","Monologue Tax","Moonshaker Cavalry","Morbid Opportunist","Nadier's Nightblade","Night's Whisper","Nightmare Sower","Odric, Lunarch Marshal","Orzhov Basilica","Orzhov Guildgate","Orzhov Signet","Ossification","Pawn of Ulamog","Pitiless Plunderer","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Plains","Priest of Forgotten Gods","Psychosis Crawler","Raise the Alarm","Requiem Angel","Scoured Barrens","Silverquill Charm","Skullclamp","Soul Warden","Spirited Companion","Staff of the Storyteller","Stone by Sunlight","Suture Priest","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Sword of the Animist","Swords to Plowshares","Temple of Silence","Teysa Karlov","Thought Vessel","Unbreakable Formation","Vault of the Archangel","Village Rites","Weathered Wayfarer","Welcoming Vampire","Woe Strider","Zulaport Cutthroat"],"bracket":3},
    {"id":"shared:D6","name":"D6 Krenko Goblins","commander":["Krenko, Mob Boss"],"cards":["Abrade","Arcane Signet","Beetleback Chief","Burn at the Stake","Castle Embereth","Chaos Warp","Conspicuous Snoop","Demand Answers","Den of the Bugbear","Dragon Fodder","Empty the Warrens","Fable of the Mirror-Breaker // Reflection of Kiki-Jiki","Fanatical Firebrand","Foundry Street Denizen","Goblin Bombardment","Goblin Chieftain","Goblin Cratermaker","Goblin Gathering","Goblin Glasswright // Craft with Pride","Goblin Instigator","Goblin Matron","Goblin Motivator","Goblin Rabblemaster","Goblin Rally","Goblin Ringleader","Goblin Trashmaster","Goblin Warchief","Gundabad Opportunist","Hammer of Purphoros","Hanweir Garrison","Hordeling Outburst","Ichor Wellspring","Idol of Oblivion","Krenko, Tin Street Kingpin","Krenko's Command","Legion Warboss","Lightning Bolt","Lightning Greaves","Mind Stone","Mizzium Mortars","Mogg Raider","Mogg War Marshal","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Mountain","Patchwork Banner","Path of Ancestry","Purphoros, God of the Forge","Purphoros's Intervention","Quest for the Goblin Lord","Reliquary Tower","Rundvelt Hordemaster","Shared Animosity","Siege-Gang Commander","Skirk Prospector","Skullclamp","Sol Ring","Sourbread Auntie","Squee, Dubious Monarch","Study Hall","Swiftfoot Boots","Thornbite Staff","Thousand-Year Elixir","Tidings of War","Tormenting Voice","Vandalblast","Vanquisher's Banner","Warstorm Surge","Witty Roastmaster"],"bracket":3},
    {"id":"shared:D7","name":"D7 Maralen Exile Cast","commander":["Maralen, Fae Ascendant"],"cards":["Assassin's Trophy","Bogslither's Embrace","Brainstorm","Changeling Wayfinder","Counterspell","Dawn's Light Archer","Day of Black Sun","Divert Disaster","Elvenking's Harper","Elvish Mystic","Elvish Visionary","Essence Scatter","Eyeblight's Ending","Fact or Fiction","Faerie Duelist","Faerie Formation","Faerie Impostor","Faerie Mastermind","Feed the Swarm","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Forest","Fyndhorn Elves","Giant's Boulder","Gilt-Leaf Winnower","Glamer Gifter","Glamermite","Glorious Decay","Halo Forager","Hemlock Vial","Hypnotic Sprite // Mesmeric Glare","Imperious Perfect","Island","Island","Island","Island","Island","Island","Island","Island","Island","Island","Island","Island","Island","Jaspera Sentinel","Latchkey Faerie","Llanowar Elves","Llanowar Visionary","Lys Alana Huntmaster","Lys Alana Informant","Mirkwood","Mirkwood Nurturer","Mirkwood Pathmaker","Mirrodin Avenged","Nightmare Sower","Obyra, Dreaming Duelist","Peppersmoke","Phyrexian Arena","Preordain","Prophetic Prism","Rampant Growth","Ravenous Chupacabra","Realmwalker","Rimekin Recluse","Scion of Oona","Shared Roots","Sower of Temptation","Spellstutter Sprite","Stir Up Trouble","Strixhaven Skycoach","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Swamp","Sylvan Ranger","Tegwyll, Duke of Splendor","Terror","The Black Arrow","Unforgiving Aim","Wayward Swordtooth","Wood Elves"],"bracket":3}
  ]);
  const sharedReady = new Set();
  actions["table-deck"] = (el) => {
    const seatId = Number(el.dataset.seat), decks = libraryDecks();
    const test = current && current.playtest
      ? `<li><button type="button" class="cm-table-deck" data-action="table-use-test-deck" data-seat="${seatId}"><strong>${e(TEST_DECK.name)}</strong><span class="cm-muted">Wastes and 99 basic lands · for trying a game through quickly on this playtest table</span></button></li>`
      : "";
    const list = decks.length || test
      ? `<ul class="cm-table-decks">${test}${decks.map((d) => `<li><button type="button" class="cm-table-deck" data-action="table-use-deck" data-seat="${seatId}" data-deck="${e(d.id)}"><strong>${e(d.name)}</strong><span class="cm-muted">${e((d.commanders || []).map((c) => (C.card(c) || {}).name).filter(Boolean).join(" + "))}</span><span class="cm-muted cm-table-deck-known" data-known-for="${e(d.id)}"></span></button></li>`).join("")}</ul>`
      : "";
    /* AN EMPTY LIBRARY says how to fill it (the readiness checks of 2026-10-04: a friend new to CrankMagic, invited
       before restoring the host's backup, saw only the test deck). A restore keeps this page, so the seat is still
       theirs when it is done. */
    const empty = decks.length ? "" : `<div class="cm-table-deck-empty"><p>You can play with Rob's decks above without adding anything to your library.</p><p class="cm-muted">To use your own deck later, build or import one in Decks.</p></div>`;
    const shared = `<section aria-label="Rob's shared decks"><h3>Rob's shared decks</h3><p>Choose a deck and play. No import or library setup needed.</p><ul class="cm-table-decks">${SHARED_DECKS.map(d => `<li><button type="button" class="cm-table-deck" data-action="table-use-shared-deck" data-shared-deck="${d.id}" data-seat="${seatId}" disabled><strong>${e(d.name)}</strong><span class="cm-muted">${e(d.commander.join(" + "))}</span><span class="cm-muted" data-shared-status="${d.id}">Checking this server…</span></button></li>`).join("")}</ul></section>`;
    C.modal(`Choose a deck · Seat ${seatId + 1}`, `${shared}${decks.length ? '<h3>Your library decks</h3>' : ''}${list}${empty}<div id="cm-table-deck-error" class="cm-note cm-warning" hidden></div><div class="cm-form-footer">${b("Cancel", "close")}</div>`);
    knownCounts(decks);
    checkSharedDecks(current.tableId);
  };
  async function checkSharedDecks(tableId) {
    sharedReady.clear();
    try {
      const names = [...new Set(SHARED_DECKS.flatMap(d => [...d.commander, ...d.cards]))];
      const response = await api("POST", `${tableUrl(tableId)}/known`, {names});
      if (!Array.isArray(response.unknown)) throw Error("Deck verification is unavailable. Close this window and try again.");
      const unknown = new Set(response.unknown);
      if (current?.tableId !== tableId) return;
      for (const d of SHARED_DECKS) {
        const status = document.querySelector(`[data-shared-status="${d.id}"]`);
        if (!status) continue;
        const missing = [...d.commander, ...d.cards].filter(n => unknown.has(n));
        status.textContent = missing.length ? "Not available on this server yet" : "Ready to play · 100 cards";
        status.closest("button").disabled = missing.length > 0;
        if (!missing.length) sharedReady.add(d.id);
      }
    } catch (error) {
      for (const status of document.querySelectorAll('[data-shared-status]')) status.textContent = "Could not check this deck. Close and reopen to retry.";
    }
  }
  actions["table-use-shared-deck"] = async (el) => {
    const d = SHARED_DECKS.find(d => d.id === el.dataset.sharedDeck);
    if (!d || !sharedReady.has(d.id)) return;
    try {
      await api("POST", `${tableUrl(current.tableId)}/deck`, {seatId:Number(el.dataset.seat), deck:{name:d.name, commander:[...d.commander], cards:[...d.cards], bracket:d.bracket}});
      actions.close();
      await refresh(current.tableId);
    } catch (error) {
      const box = document.getElementById("cm-table-deck-error");
      if (!box) throw error;
      box.hidden = false; box.textContent = error.message;
    }
  };
  /* HOW MUCH OF EACH DECK THE TABLE CAN PLAY (M5; the plan review's A2): the table is asked which of the decks' card
     names it does not know yet, and each deck says "87 of 100 known · 13 to learn", or that every card is known -- so
     a deck that is not whole is said to be so before it is chosen, and refused by name if it is. */
  async function knownCounts(decks) {
    const read = decks.map((d) => ({id: d.id, deck: deckForTable(d)}));
    const names = [...new Set(read.flatMap((r) => [...r.deck.commander, ...r.deck.cards]))];
    let unknown;
    try {unknown = new Set((await api("POST", `${tableUrl(current.tableId)}/known`, {names})).unknown || []);} catch {return;}
    for (const r of read) {
      const el = document.querySelector(`[data-known-for="${CSS.escape(r.id)}"]`);
      if (!el) continue;
      const all = [...r.deck.commander, ...r.deck.cards], missing = all.filter((n) => unknown.has(n)).length;
      el.textContent = missing ? `${all.length - missing} of ${all.length} known · ${missing} to learn` : `All ${all.length} cards known`;
      el.closest(".cm-table-deck")?.classList.toggle("is-unknown", missing > 0);
    }
  }
  actions["table-use-test-deck"] = async (el) => {
    try {
      await api("POST", `${tableUrl(current.tableId)}/deck`, {seatId: Number(el.dataset.seat), deck: {name: TEST_DECK.name, commander: [...TEST_DECK.commander], cards: [...TEST_DECK.cards]}});
      actions.close();
      await refresh(current.tableId);
    } catch (error) {
      const box = document.getElementById("cm-table-deck-error");
      if (!box) throw error;
      box.hidden = false;
      box.textContent = error.message;
    }
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

  /* ---- Choose mat (the handoff's 2b): a strip of the app's mats, the zones previewed over the one picked ----
     The preview is the board's own layout (Rob, 2026-09-29): Battlefield over Lands; beside them Command and Exile,
     the History band, then Library and Graveyard, those four the shape of a card (5:7). */
  function matDialog() {
    const strip = MATS.map(([k, name]) => `<li><button type="button" class="cm-mat-pick" data-action="table-mat-pick" data-mat="${k}" aria-pressed="${k === matPicked}"><span class="cm-mat-swatch" data-mat="${k}"></span>${e(name)}</button></li>`).join("");
    const zone = (name, cls = "") => `<span class="cm-mat-zone${cls}" data-zone="${name.toLowerCase()}">${name}</span>`;
    return `<ul class="cm-mat-strip" aria-label="Mats">${strip}</ul>
      <div class="cm-mat-preview cm-mat-swatch" data-mat="${matPicked}" id="cm-mat-preview" aria-label="Preview of the mat">
        ${zone("Battlefield")}${zone("Lands")}${zone("Command", " is-card")}${zone("Exile", " is-card")}${zone("History")}${zone("Library", " is-card")}${zone("Graveyard", " is-card")}</div>
      <p class="cm-muted cm-mat-note">Five mats the app draws, then CrankMagic's own artwork. Everyone at the table sees yours; this device remembers it for your next table. Your own mat images arrive with file storage.</p>`;
  }
  actions["table-mat"] = () => {
    const mine = current.seats.find((s) => s.you);
    matPicked = (mine && mine.mat) || "felt";
    C.modal("Choose mat", matDialog());
    /* Use this mat sits beside the ✕ in the header, off until a mat is picked; the ✕ is the way out (Rob, 2026-09-30). */
    document.querySelector("#cm-dialog .cm-dialog-close")?.insertAdjacentHTML("beforebegin", b("Use this mat", "table-mat-use", {}, true, {cls: "compact cm-mat-use"}).replace("<button ", "<button disabled "));
    /* Thirty mats scroll: the one you are on is brought into view. */
    document.querySelector(`.cm-mat-pick[aria-pressed="true"]`)?.scrollIntoView({block: "nearest"});
  };
  actions["table-mat-pick"] = (el) => {
    matPicked = el.dataset.mat;
    document.querySelectorAll(".cm-mat-pick").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mat === matPicked)));
    const preview = document.getElementById("cm-mat-preview");
    if (preview) preview.dataset.mat = matPicked;
    const use = document.querySelector("#cm-dialog .cm-mat-use");
    if (use) use.disabled = false;
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
