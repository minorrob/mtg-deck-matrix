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
    <p>Up to four seats. Invite people by link, QR code or email, or seat an AI. Everyone chooses a precon, a deck shared with them, or a deck from their own library and marks Ready, and the host starts the countdown. The host can change the table's rules (starting life, bracket limit) until a seat is ready.</p>
    <h3>The board</h3>
    <p><strong>Table</strong> shows every board at once. <strong>Focus</strong> puts one board on the mat, beside the seats. <strong>3D</strong> puts your cards in an immersive tabletop scene. New desktop players start in 3D; your chosen view is remembered. In 3D the wheel zooms (over your hand it sizes the hand), dragging a mat moves the view across the table, dragging the bare table tilts it, and holding the right button looks at that place until you let go. Right-click a card for what it can do now, in short (🔍 opens it to read); nothing is played until you confirm. Long-press a card on a touch screen to inspect it. Actions and Boards stay together on the left in all three views. Click a card to review its legal actions there. Select an option, review its targets and payment, then Confirm. Clear changes only your local choice. Further target or payment questions stay in Actions; each confirmation submits that step. The pass button says what passing will do: <em>Next step</em>, <em>Resolve</em> and the spell's name, or <em>Pass</em>. Your draw happens by itself, and a spell you cast resolves unless someone responds; to be asked first, turn on <em>Hold priority after I cast</em> in Tools. A step where you have nothing to do passes by itself, and the history says so.</p>
    <h3>Keys</h3>
    <ul class="cm-help-keys">
      <li><kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> move through the board in the order it is laid out: the strip, the seats, the boards, what the table asks you, then your hand. <kbd>Enter</kbd> or <kbd>Space</kbd> presses what has the focus.</li>
      <li><kbd>Space</kbd>, with nothing focused, fans your hand, and in the fanned hand puts it away. While it is fanned, <kbd>1</kbd>–<kbd>9</kbd> holds that card up, and <kbd>Enter</kbd> selects the held card's action for review (or presses the button that has the focus).</li>
      <li><kbd>Escape</kbd> puts away the card shown large, and steps back one thing a press: an open menu (History, Tools, ☰, the steps, You can also); the Coach; a held card, back into the fan; the fanned hand; then the Panel. It does not change your saved view. In a dialog, it closes the dialog.</li>
      <li><kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>+</kbd> and <kbd>−</kbd> make the cards 10% larger or smaller.</li>
      <li>The wheel over your hand: ± its cards (<kbd>Shift</kbd> + wheel scrolls a hand too wide). In 3D, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + drag the table ↕: your side longer or shorter, your mat with it, down to the screen's foot; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + double-click: back. Camera ✋ and ↕ are the same two sizes.</li>
      <li>On a card, <kbd>Shift</kbd>+<kbd>F10</kbd> or the <kbd>Menu</kbd> key opens what it can do now; <kbd>↑</kbd> and <kbd>↓</kbd>, <kbd>Home</kbd> and <kbd>End</kbd> move through it, and <kbd>Escape</kbd> closes it, back to the card.</li>
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
  C.tableApi = {api, tableUrl, refresh: (id) => refresh(id), fileResult};
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
  const playable = (deck) => {if(deck.archived||!(deck.commanders||[]).length)return false;const list=deckForTable(deck);return list.commander.length+list.cards.length===100;};
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
        const tile=el.closest('[data-deck-tile]');let door=tile?.querySelector('[data-tile-play]');
        if(r.count)door?.remove();else if(tile&&!door){door=document.createElement('a');door.className='v-button compact cm-tile-play';door.dataset.tilePlay=d.id;door.href='#table?'+new URLSearchParams({deck:d.id});door.textContent='Play it';door.setAttribute('aria-label','Play '+d.name);tile.append(door);}
      }
    },
    /* The decks hub's summary: how many of `decks` the table can play every card of -- each tile's "Playable at the table",
       counted, a deck with no commander or archived never one -- or null when the table could not be asked. */
    async count(decks) {
      if (!cloudPlay()) return null;
      const can = decks.filter(playable);
      try {await unknownOf(can.flatMap((d) => {const r = deckForTable(d); return [...r.commander, ...r.cards];}));} catch {return null;}
      let n = 0;
      for (const d of can) if (!(await readiness(d)).count) n += 1;
      return n;
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
      const blocked=r.count?`${r.count} card${r.count===1?'':'s'} unplayable at the table. Fix the list before playing.`:'';
      el.dataset.blockedState=blocked;
      if(blocked)el.insertAdjacentHTML('beforeend',` <strong class="cm-deck-blocked">${e(blocked)}</strong>`);
      const next=document.querySelector('#cm-deck-next .cm-bento-next-line');if(next)next.textContent=blocked||next.dataset.nextDefault;
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
      : s.occupied ? (s.you ? "Choose a deck." : s.kind === "ai" ? "Choose an AI deck" : "Choosing a deck")
      : s.invited ? "Invitation sent · waiting on them" : s.kind === "ai" ? "No deck yet" : "Invite someone";
    const controls = [];
    if (t.phase === "selecting" || t.phase === "countdown") {
      if (s.you) {
        controls.push(b(s.deck ? "Change deck" : "Choose a deck", "table-deck", {seat: String(s.seatId)}, !s.deck, {cls: "compact"}));
        controls.push(b("Choose mat", "table-mat", {}, false, {cls: "compact"}));
        if (s.deck) controls.push(b(s.ready ? "Not ready" : "Ready", "table-ready", {ready: s.ready ? "" : "1"}, !s.ready, {cls: "compact"}));
      } else if (t.youAreHost && s.kind === "ai") {
        controls.push(b(s.deck ? "Change deck" : "Choose its deck", "table-deck", {seat: String(s.seatId)}, false, {cls: "compact"}));
      } else if (t.youAreHost && s.kind === "human" && !s.occupied) {
        controls.push(b(s.invited ? "New link" : "Invite", "table-invite", {seat: String(s.seatId)}, false, {cls: "compact"}));
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
  /* PLAY AGAIN (ROB-167; the table's `rematch`, docs/ui-lane/gameplay-anchor.md "After the game: Play again"): the same
     seats, decks and rules, each person's answer shown, Yes or Leave the table; the answers close two minutes after the
     game's end (said in the reader's own time), and silence is leaving. The AI seats always stay. Closed, it says why,
     with New table. */
  function resultReview(t){const record=t.gameRecord,deck=record?.source?.deckId&&C.state.decks.find(d=>d.id===record.source.deckId);
    if(!record)return '';
    const filed=deck&&C.state.games.some(g=>g.id===record.id&&g.deckId===deck.id);
    const outcome={win:'Won',loss:'Lost',draw:'Draw',unfinished:'Unfinished'}[record.outcome]||'Finished';
    return `<section class="v-panel cm-game-result" aria-label="Game result"><h2>${e(outcome)}</h2><p>Turn ${e(String(record.turns))} · ${e(String(record.pod))} seats${record.bracket?' · Bracket '+e(String(record.bracket)):''}</p><p>${e(record.finishReason||'')}</p><div class="cm-actions"><a class="v-button" href="#game">Back to lobby</a>${filed?`<a class="v-button" href="#decks?${e(new URLSearchParams({deck:deck.id,tab:'overview',game:record.id}).toString())}">Review this game</a>`:`<span class="cm-muted">${deck?'This result has not been filed in this library yet.':'The result stays at this table; its original deck is not in this library.'}</span>`}</div></section>`;}
  const filing=new Map();
  /* The board's verified record read and the lobby's owner-only result share one writer. No
     snapshot, cards or hidden zones are copied into the account's library. */
  function fileResult(r,context={}){const owner=context.account??context.owner??null,currentOwner=()=>C.signedInAs?.()||null;
    const d=r?.source?.deckId&&C.state.decks.find(x=>x.id===r.source.deckId&&!x.archived);
    const contextMatches=['tableId','matchId','seatId'].every(k=>context[k]===undefined||String(context[k])===String(r?.[k]));
    if(!owner||owner!==currentOwner()||!contextMatches||r?.schema!=='CrankMagicTableResult@1'||!d||!Number.isSafeInteger(r.source.deckVersion)||r.source.deckVersion<1||r.source.deckVersion>d.version
      ||!/^[a-z0-9]{8,40}$/.test(r.tableId)||!new RegExp('^'+r.tableId+'g[1-9][0-9]{0,5}$').test(r.matchId)||!/^([0-3])$/.test(String(r.seatId))||r.id!==`game:table:${r.matchId}:${r.seatId}`
      ||!Number.isFinite(Date.parse(r.playedAt))||!['win','loss','draw','unfinished'].includes(r.outcome)||!Number.isInteger(r.pod)||r.pod<2||r.pod>4||!Number.isInteger(r.seat)||r.seat<1||r.seat>r.pod||!Number.isInteger(r.turns)||r.turns<0
      ||typeof r.ai!=='boolean'||typeof r.finishReason!=='string'||!(r.finishRank===null||Number.isInteger(r.finishRank)&&r.finishRank>=1&&r.finishRank<=r.pod)||!(r.bracket===null||Number.isInteger(r.bracket)&&r.bracket>=1&&r.bracket<=5)
      ||!Array.isArray(r.opponents)||r.opponents.some(x=>!Array.isArray(x.commanders)||x.commanders.some(n=>typeof n!=='string')))return Promise.resolve(false);
    if(C.state.games.some(g=>g.id===r.id&&g.deckId===d.id))return Promise.resolve(true);
    const key=owner+'|'+r.id;if(filing.has(key))return filing.get(key);
    const write=(async()=>{try{if(owner!==currentOwner())return false;
      await C.commit({type:'game',deckId:d.id,gameId:r.id,outcome:r.outcome,playedAt:r.playedAt,finish:r.finishRank??null,pod:r.pod,bracket:r.bracket??null,turns:r.turns,seat:r.seat,opponents:r.opponents.map(x=>x.commanders.join(' + ')).join(' · '),notes:r.finishReason||'',table:{schema:r.schema,tableId:r.tableId,matchId:r.matchId,seatId:r.seatId,ai:!!r.ai,reason:r.finishReason||'',deckVersion:r.source.deckVersion}},{renderView:false});
      return owner===currentOwner()&&C.state.games.some(g=>g.id===r.id&&g.deckId===d.id);
    }catch(error){if(owner===currentOwner()&&!C.state.games.some(g=>g.id===r.id))C.notice('The game result has not been saved to this library. '+error.message,true,{stay:true,action:{label:'Retry',run:()=>fileResult(r,context)}});return false;}
    })();filing.set(key,write);write.finally(()=>{if(filing.get(key)===write)filing.delete(key);});return write;
  }
  function gamePanel(t) {
    const review=resultReview(t);
    const r = t && t.rematch;
    if (!r) return review+`<section class="v-panel cm-table-game" id="cm-table-game"><h2>The game is over</h2><p class="cm-muted">Its record is kept.</p></section>`;
    if (r.outcome === "closed") return review+`<section class="v-panel cm-table-game" id="cm-table-game"><h2>The game is over</h2><p>${e(r.reason || "This table's games are over. Start a new table to play again.")}</p>
      <div class="cm-actions">${b("New table", "table-new-after", {}, true)}</div></section>`;
    const seatOf = (id) => t.seats[id] || {};
    const said = {yes: "playing again", no: "leaving", pending: "deciding"};
    const mine = (r.votes || []).find((v) => seatOf(v.seatId).you);
    const closes = new Date(r.deadline + (Date.now() - tableNow())).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"});
    const votes = `<ul class="cm-table-votes" aria-label="Who is playing again">${(r.votes || []).map((v) => `<li data-vote="${e(v.vote)}"><strong>${e(seatOf(v.seatId).you ? "You" : seatOf(v.seatId).name || `Seat ${v.seatId + 1}`)}</strong> · ${e(said[v.vote] || v.vote)}</li>`).join("")}</ul>`;
    const buttons = mine ? `${mine.vote !== "yes" ? b("Play again", "table-rematch", {accept: "yes"}, true) : ""}${b("Leave the table", "table-rematch", {accept: "no"}, false)}` : "";
    return review+`<section class="v-panel cm-table-game" id="cm-table-game"><h2>Play again?</h2>
      <p class="cm-muted">The same seats, decks and rules; the last game's record is kept. ${mine && mine.vote === "yes" ? "You are staying. " : ""}Answers close at ${e(closes)}; no answer is leaving the table.</p>
      ${votes}<div class="cm-actions">${buttons}</div></section>`;
  }
  actions["table-rematch"] = async (el) => {
    const id = current.tableId, accept = el.dataset.accept === "yes";
    await api("POST", `${tableUrl(id)}/rematch`, {accept});
    if (accept) await refresh(id); else C.go("table");
  };
  actions["table-new-after"] = () => C.go("table");
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
        + (t.phase === "rematch" ? gamePanel(t) : "")
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
    const owner=C.signedInAs?.()||null;
    const asked = performance.now();   /* the board weighs the read against the room's newer frames by when it was asked */
    const {table, now} = await api("GET", tableUrl(id));
    if (!live()||owner!==(C.signedInAs?.()||null)) return table;
    if (Number.isFinite(now)) skew = now - Date.now();
    await fileResult(table.gameRecord,{account:owner,tableId:id,matchId:table.gameRecord?.matchId,seatId:table.gameRecord?.seatId});
    if(!live()||owner!==(C.signedInAs?.()||null))return table;
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
    const live = !id && !params.has('new') && C.board && C.board.live && C.board.live();
    if (live) {location.replace(`#table?id=${encodeURIComponent(live.tableId)}`); return;}
    if (!id) return newTable(params.get("deck"), params.get("ai") === "1");
    let stop = false, timer = null;
    const tick = () => {
      const seconds = document.getElementById("cm-table-seconds"), left = current && current.countdownAt ? String(Math.max(0, Math.ceil((current.countdownAt - tableNow()) / 1000))) : null;
      /* written only when it changes: the count is a live region, said each time it is written */
      if (seconds && left !== null && seconds.textContent !== left) seconds.textContent = left;
      const host=document.querySelector('.cm-cloud-table');if(host&&globalThis.CrankBoard?.countdown){const value=current?.phase==='countdown'?Number(left):null;if(host.dataset.countdownValue!==String(value)){globalThis.CrankBoard.countdown(host,value);host.dataset.countdownValue=String(value);}}
      /* The way back stays above the shared dimmer, beside its callout, rather than under it. */
      const cancel=host?.querySelector('[data-action=table-cancel]');if(cancel&&cancel.parentElement!==host){cancel.classList.add('cm-countdown-cancel');host.append(cancel);}
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

  /* Play home is distinct from a table's preparation lobby. Reading it never claims or releases a seat. */
  views.playHome = () => {
    if(!cloudPlay())return views.table(new URLSearchParams());
    let active=true;
    C.main.innerHTML=C.pageHead('Play','','table')+`<div class="cm-play-home" id="cm-play-home">
      <section class="v-panel cm-play-welcome"><p class="cm-play-eyebrow">THE COMMANDER LOUNGE</p><h2>A place at the table</h2>
      <p>Bring a deck. Invite your friends. Make the next game yours.</p>
      <div id="cm-play-resume" aria-live="polite"></div>
      <div class="cm-actions">${b('New table','play-new-table',{},true)}<a class="v-button" href="#decks">Choose a deck</a></div></section>
      <section class="v-panel cm-play-join"><p class="cm-play-eyebrow">START</p><h2>Join a table</h2><p>Have an invitation? Paste its full link to take your invited seat.</p>
      <form id="cm-play-join"><label for="cm-play-invite">Invitation link<input id="cm-play-invite" name="invitation" type="text" autocomplete="off" spellcheck="false" placeholder="Paste your table invitation"></label>
      <div class="cm-actions">${b('Open invitation','play-join')}</div><p id="cm-play-join-error" role="status"></p></form>
      <p class="cm-muted">Waiting for an invite? Keep this page open, then open the link your host sends. Seats are claimed only when you join.</p></section>
      <section class="v-panel cm-play-social"><p class="cm-play-eyebrow">AROUND THE TABLES</p><h2>Your next game</h2><div class="cm-lounge-table-art" aria-hidden="true"><i></i><i></i><i></i><i></i><span>COMMANDER</span></div><p>Gather friends at an invitation-only table, or practice against AI.</p><div class="cm-actions">${b('Set up an AI game','play-ai-table')}</div><p class="cm-muted">Public game discovery is not connected yet. Your current seat stays yours while you browse.</p></section>
      <section class="v-panel cm-play-talk"><p class="cm-play-eyebrow">TABLE TALK</p><h2>Meet here. Play together.</h2><p>Waiting for a friend? Share a table invitation once you have set your seats.</p><div class="cm-lounge-unavailable"><strong>Lounge chat is not connected yet</strong><p>There are no live messages or presence counts to display. Use your usual chat to coordinate and send the invitation link.</p></div></section>
      <section class="v-panel cm-play-standing"><h2>Your record</h2><div class="cm-play-stats">${['win','loss','draw'].map((outcome,i)=>`<div><strong>${(C.state.games||[]).filter(g=>g.outcome===outcome).length}</strong><span>${['Wins','Losses','Draws'][i]}</span></div>`).join('')}</div><p class="cm-muted">Completed games saved in your library. A cross-player leaderboard is not connected yet.</p></section>
      <section class="v-panel cm-play-records" id="cm-play-records"><h2>Recent games</h2><p class="cm-muted">Your completed games will appear here.</p></section></div>`;
    document.getElementById('cm-play-join').addEventListener('submit',event=>{event.preventDefault();actions['play-join']();});
    document.getElementById('cm-play-invite').addEventListener('input',()=>{document.getElementById('cm-play-join-error').textContent='';});
    const games=[...(C.state.games||[])].sort((a,b)=>String(b.playedAt||b.at||'').localeCompare(String(a.playedAt||a.at||''))).slice(0,5);
    if(games.length){const word={win:'Won',loss:'Lost',draw:'Drew',unfinished:'Unfinished'};
      document.getElementById('cm-play-records').innerHTML=`<h2>Recent games</h2><ol class="cm-table-recent-list">${games.map(g=>{
        const deck=(C.state.decks||[]).find(d=>d.id===g.deckId);
        return `<li class="cm-table-recent-row"><b>${e(word[g.outcome]||'Played')}</b><span>${deck?`<a href="#decks?deck=${encodeURIComponent(deck.id)}">${e(deck.name)}</a>`:'Shared or archived deck'}</span><span>${g.playedAt||g.at?e(C.usDate(g.playedAt||g.at)):''}</span></li>`;
      }).join('')}</ol>`;}
    const id=C.board?.live?.()?.tableId||seatKept();
    if(id){const slot=document.getElementById('cm-play-resume');slot.textContent='Checking your seat…';
      api('GET',tableUrl(id)).then(({table:t})=>{
        if(!active||!slot.isConnected)return;
        if(!t.seats.some(s=>s?.you)){slot.textContent='Your previous seat is no longer held.';return;}
        const phase=t.phase==='playing'?'Game in progress':t.phase==='rematch'?'Play again':t.phase==='countdown'?'Starting soon':'Preparing the table';
        const live=C.board?.live?.(),summary=live?.tableId===t.tableId?live:null;
        slot.closest('.cm-play-welcome')?.querySelector('[data-action=play-new-table]')?.classList.remove('primary');
        slot.innerHTML=`<div class="cm-play-return"><strong>${e(phase)}${summary?.turn?' · Turn '+e(String(summary.turn)):''}</strong><span>${e(t.seats.filter(Boolean).map(s=>s.deck?.commander?.join(' + ')||s.name).join(' · '))}</span>${summary?.seats?.length?`<span>${summary.seats.map(s=>`${e(s.name)}: ${e(String(s.life))} life`).join(' · ')}</span>`:''}<div class="cm-actions">${b('Resume your table','table-back',{table:t.tableId},true)}${b('Leave table','play-leave-seat',{table:t.tableId})}</div></div>`;
      }).catch(()=>{if(active&&slot.isConnected)slot.innerHTML=`<p>Your table could not be checked. ${b('Try your table','table-back',{table:id})}</p>`;});}
    return ()=>{active=false;};
  };
  actions['play-leave-seat']=el=>C.modal('Leave this table?',`<p>This device will disconnect. Your seat follows the table's normal reconnect window, and its saved shortcut remains available if you want to return.</p><div class="cm-form-footer">${b('Cancel','close')}${b('Leave table','play-leave-confirm',{table:el.dataset.table},true)}</div>`);
  actions['play-leave-confirm']=async el=>{const id=el.dataset.table;C.board?.close();actions.close();await C.render();C.notice('Disconnected from the table on this device.',false,{undo:false,action:{label:'Return to table',run:()=>C.go('table',{id})}});};
  actions['play-new-table']=()=>C.go('table?new=1');
  actions['play-ai-table']=()=>C.go('table?new=1&ai=1');
  actions['play-join']=()=>{
    const input=document.getElementById('cm-play-invite'),error=document.getElementById('cm-play-join-error');
    try{
      const link=new URL(input.value.trim(),location.origin);
      const allowed=link.origin===location.origin||['https://crankmagic.com','https://www.crankmagic.com','https://staging.crankmagic.com'].includes(link.origin);
      const path=link.hash.startsWith('#table/')?link.hash.slice(1):link.pathname.replace(/^\//,'');
      const match=path.match(/^(?:api\/join|table)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/);
      if(!allowed||!match)throw Error('Paste the complete CrankMagic invitation link from your host.');
      if(link.origin!==location.origin)location.assign(`${link.origin}/index.html#table/${match[1]}/${match[2]}`);
      else C.go(`table/${match[1]}/${match[2]}`);
    }catch(err){error.textContent=err.message;input.focus();}
  };

  /* ---- a new table ---- */
  function newTable(deckId = null, ai = false) {
    const row = (n) => `<div class="cm-table-new-seat" data-seat-position="${n}"><strong>Seat ${n}</strong>
      <select name="kind${n}" aria-label="Seat ${n}"><option value="human"${n === 2 ? " selected" : ""}>A person I will invite</option><option value="ai">An AI · Normal</option><option value="ai-easy">An AI · Easy</option><option value="none"${n > 2 ? " selected" : ""}>Nobody</option></select>
      <input name="name${n}" maxlength="60" placeholder="${n === 2 ? "Their name" : "Name (optional)"}" aria-label="Seat ${n} name"></div>`;
    C.main.innerHTML = C.pageHead("Play", "", "table") + `<section class="v-panel cm-table-new"><h2>New table</h2>
      <p class="cm-muted">You sit in seat 1 as the host. Each other seat is a person you invite, an AI, or nobody; a table seats two to four.</p>
      <form id="cm-table-new"><div class="cm-table-new-deck" id="cm-table-new-deck" aria-live="polite"></div><div class="cm-new-table-square"><div class="cm-table-new-seat cm-new-host" data-seat-position="1"><strong>You · Host</strong><label>Your name at the table <span aria-hidden="true">*</span><input name="hostName" maxlength="60" required aria-describedby="cm-table-host-error"><span class="cm-error cm-table-field-error" id="cm-table-host-error" role="alert"></span></label></div>${row(2)}${row(3)}${row(4)}<span class="cm-new-table-center" aria-hidden="true">COMMANDER</span></div><div class="cm-new-table-rules"><span>Commander</span><span>Invitation-only</span><span>2–4 seats</span><span>Review rules at the table</span></div><label>Your deck<select name="deck" id="cm-new-table-deck"><option value="">Choose at the table</option>${libraryDecks().map(d=>`<option value="${e(d.id)}"${d.id===deckId?' selected':''}>${e(d.name)}</option>`).join('')}</select></label>
      <p class="cm-error" id="cm-table-new-error" role="alert"></p><fieldset class="cm-table-setup-rules"><legend>Table rules</legend><label>Starting life<input name="startingLife" type="number" min="1" max="999" value="40" required aria-describedby="cm-table-rules-error"><span class="cm-error cm-table-field-error" id="cm-table-rules-error" role="alert"></span></label><label>Bracket limit<select name="bracketLimit"><option value="">Any</option>${[1,2,3,4,5].map(n=>`<option value="${n}"${libraryDecks().find(d=>d.id===deckId)?.definition.baseBracket===n?' selected':''}>${n} or lower</option>`).join('')}</select></label></fieldset>
      <div class="cm-actions">${b("Set the table", "table-create", {}, true)}</div></form></section>`;
    try {const last=JSON.parse(localStorage.getItem("cm-table-setup")||"null");if(last && last.owner === (C.signedInAs?.() || null)){const form=document.getElementById("cm-table-new");for(const key of ["hostName","kind2","name2","kind3","name3","kind4","name4"]){if(typeof last[key]==="string" && form.elements[key] && (!key.startsWith("kind") || ["human","ai","ai-easy","none"].includes(last[key])))form.elements[key].value=last[key];}}}catch{}
    document.querySelector('[name=hostName]').addEventListener('input',event=>{event.target.removeAttribute('aria-invalid');document.getElementById('cm-table-host-error').textContent='';});
    if(ai){const f=document.getElementById("cm-table-new");f.elements.kind2.value="ai";f.elements.name2.value="AI";f.elements.kind3.value="none";f.elements.kind4.value="none";}
    document.getElementById("cm-new-table-deck").addEventListener("change",event=>{const deck=libraryDecks().find(d=>d.id===event.target.value);if(deck)bringing(deck);else document.getElementById("cm-table-new-deck").replaceChildren();});
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
    const select = document.getElementById("cm-new-table-deck");
    if (!box || !select || select.value !== deck.id) return;
    if (r.count) select.value = "";
    box.innerHTML = r.count
      ? `<p class="cm-note cm-warning">${e(deck.name)} cannot be played at the table yet: ${r.count} of its cards ${r.count === 1 ? "is" : "are"} not in the rules engine (${e(r.unknown.slice(0, 6).join(", "))}${r.unknown.length > 6 ? ", …" : ""}). Create the table and choose another deck there.</p>`
      : `<p>You bring <strong>${e(deck.name)}</strong> to seat 1.</p>`;
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
  const creatingTables=new WeakSet();
  actions["table-create"] = async () => {
    const form = document.getElementById("cm-table-new");
    if(creatingTables.has(form))return;
    const v = Object.fromEntries(new FormData(form));
    if (!v.hostName.trim()){const input=form.elements.hostName;input.setAttribute('aria-invalid','true');document.getElementById('cm-table-host-error').textContent='Give your name at the table.';input.focus();return;}
    const life=Number(v.startingLife);if(!Number.isInteger(life)||life<1||life>999){const input=form.elements.startingLife;input.setAttribute('aria-invalid','true');document.getElementById('cm-table-rules-error').textContent='Choose starting life from 1 to 999.';input.focus();return;}
    /* An AI at Normal or Easy (AI-2): Normal scores its choices; Easy, now and then, takes the second best; Claude asks a
       model at its close calls. */
    const seats = [2, 3, 4].filter((n) => v[`kind${n}`] !== "none").map((n) => (v[`kind${n}`].startsWith("ai")
      ? {kind: "ai", level: ({"ai-easy": "easy", "ai-llm": "llm"})[v[`kind${n}`]] || "normal", name: v[`name${n}`]}
      : {kind: v[`kind${n}`], name: v[`name${n}`]}));
    if (!seats.length){document.getElementById('cm-table-new-error').textContent='Choose at least one other seat: a person or an AI.';form.elements.kind2.focus();return;}
    document.getElementById('cm-table-new-error').textContent='';
    creatingTables.add(form);
    try{
    const {table} = await api("POST", "/api/tables", {hostName: v.hostName, seats});
    try {localStorage.setItem("cm-table-setup",JSON.stringify({owner:C.signedInAs?.() || null,...Object.fromEntries(["hostName","kind2","name2","kind3","name3","kind4","name4"].map(k=>[k,v[k]]))}));}catch{}
    keepSeat(table.tableId);
    await finishTableSetup(table,v);
    }finally{creatingTables.delete(form);}
  };
  const settingUp=new Set();
  async function finishTableSetup(table,v){if(settingUp.has(table.tableId))return;settingUp.add(table.tableId);
    try{await api('POST',`${tableUrl(table.tableId)}/rules`,{startingLife:Number(v.startingLife),bracketLimit:v.bracketLimit?Number(v.bracketLimit):null});}
    catch(error){C.go('table',{id:table.tableId});C.notice('Your table was created, but its rules were not saved. '+error.message,true,{action:{label:'Retry rules',run:()=>finishTableSetup(table,v)}});settingUp.delete(table.tableId);return;}
    try{const bring=v.deck?libraryDecks().find(d=>d.id===v.deck):null;
      if(bring){try{await api('POST',`${tableUrl(table.tableId)}/deck`,{seatId:0,deck:deckForTable(bring)});}catch(error){C.notice(`${bring.name} did not take your seat: ${error.message}`,true);}}
      const autoFailures=await autoDeckAI(table);C.go('table',{id:table.tableId});
      if(autoFailures.length)C.notice(autoFailures.join(' '),true,{undo:false});else C.notice('Table setup saved.',false,{undo:false});
    }finally{settingUp.delete(table.tableId);}
  }

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
  /* WHAT A SEAT MAY CHOOSE (Rob, 2026-10-25: "Make the precons public, available to anyone with access to play, and no
     other decks other than those they make, shared with them or public. This removes the prior auto sharing of my
     decks."): the precons the Decks screen lists as New from Wizards (data/precons-latest.json, their lists from
     data/precons.json), the decks shared with this person or made public (cloud/sharing.mjs), and their own library's.
     Rob's six decks were bundled here for everyone from October 15; they reach another person now only as he shares them. */
  let preconsOnce = null;
  const tablePrecons = () => preconsOnce ||= (async () => {
    const A = globalThis.CrankAssets, get = async (key) => {
      const r = await fetch(A[key]).catch(() => null);
      if (!r || !r.ok) throw Error("The precons could not be loaded. Close this window and try again.");
      return A.expect(await r.json(), key);
    };
    const [latest, all] = await Promise.all([get("preconsLatest"), get("precons")]);
    const lists = new Map(all.decks.map((d) => [d.id, d]));
    return latest.decks.map((p) => lists.get(p.id)).filter(Boolean).map((d) => {
      const commander = d.commander.map((c) => c.name);
      return {id: `precon:${d.id}`, name: d.name, commander, setName: d.setName || "", notes: "",
        cards: d.cards.filter(([n]) => !commander.includes(n)).flatMap(([n, q]) => Array(q).fill(n))};
    });
  })().catch((error) => {preconsOnce = null; throw error;});
  /* AI seats start with an engine-known public precon. This is the same host-authorized deck
     assignment the chooser uses; a failed or unsupported list never becomes a pretend choice. */
  async function autoDeckAI(table){const seats=(table.seats||[]).filter(s=>s.kind==='ai'&&s.occupied&&!s.deck);
    if(!table.youAreHost||table.phase!=='selecting'||!seats.length)return [];
    const failures=[];let candidates;
    try{const lists=(await tablePrecons()).filter(d=>d.commander.length+d.cards.length===100);
      const names=[...new Set(lists.flatMap(d=>[...d.commander,...d.cards]))];
      const answer=await api('POST',`${tableUrl(table.tableId)}/known`,{names});
      if(!Array.isArray(answer.unknown))throw Error('Deck verification is unavailable. Choose its deck when the table can be checked.');
      const unknown=new Set(answer.unknown);
      candidates=lists.filter(d=>[...d.commander,...d.cards].every(name=>!unknown.has(name)));
    }catch(error){return seats.map(s=>`${s.name||'AI'} needs a deck: ${error.message}`);}
    for(const seat of seats){if(!candidates.length){failures.push(`${seat.name||'AI'} needs a deck: no public precon is fully known by this table. Choose its deck.`);continue;}
      let assigned=false,last='No eligible precon.';
      for(let i=0;i<candidates.length;i++){const deck=candidates[(Math.max(0,seat.seatId-1)+i)%candidates.length];
        try{await api('POST',`${tableUrl(table.tableId)}/deck`,{seatId:seat.seatId,deck:{name:deck.name,commander:[...deck.commander],cards:[...deck.cards]}});assigned=true;break;}
        catch(error){last=error.message;if(error.signedOut||error.status>=500)break;}}
      if(!assigned)failures.push(`${seat.name||'AI'} needs a deck: ${last} Choose its deck.`);
    }
    return failures;
  }
  let availablePrecons = [];
  const sharedReady = new Set();
  let availableSharedDecks = [];
  /* A DECK'S ROW IN THE CHOOSER (Rob, 2026-10-22: "show the mana colors and description of each commander on its row"):
     its commanders' colors, from their records (none drawn where no record knows them -- never guessed), and what it does:
     the deck's own notes, else its commanders' rules text, cut to a line or two. */
  const colorsOf = (names) => {
    const known = names.map(recordByName).filter(Boolean);
    return known.length ? C.colors(WUBRG.filter((x) => known.some((r) => (r.colorIdentity || []).includes(x)))) : "";
  };
  /* A library's own record may carry no rules text; the records the app ships may. Failing both, the line waits for the card
     catalog to fetch the text (`fillAbout`). */
  const shipped = (n) => (C.catalog && C.catalog.exact ? C.catalog.exact(n) : null) || {};
  const commanderRules = (n) => (recordByName(n) || {}).oracleText || shipped(n).oracleText || "";
  const cut = (text) => {const t = String(text || "").replace(/\s+/g, " ").trim(); return t.length > 180 ? `${t.slice(0, 177).replace(/\s+\S*$/, "")}…` : t;};
  const aboutOf = (notes, names) => cut(String(notes || "").trim() || names.map(commanderRules).filter(Boolean).join(" · "));
  const deckLines = (name, commanders, notes) => {
    const about = aboutOf(notes, commanders), waiting = !about && commanders.length;
    return `<strong>${e(name)}</strong><span class="cm-table-deck-cmdr">${colorsOf(commanders)}<span class="cm-muted">${e(commanders.join(" + "))}</span></span><span class="cm-table-deck-about"${waiting ? ` data-about-for="${e(JSON.stringify(commanders))}"` : ""}>${e(about)}</span>`;
  };
  /* The rules text no record here holds, fetched once a commander through the card catalog (Scryfall, cached), into each row
     still waiting on it. Nothing is said where it cannot be had. */
  async function fillAbout() {
    if (!C.catalog || !C.catalog.details) return;
    for (const el of document.querySelectorAll("[data-about-for]")) {
      let names;
      try {names = JSON.parse(el.dataset.aboutFor);} catch {continue;}
      const texts = [];
      for (const n of names) {
        const known = commanderRules(n);
        if (known) {texts.push(known); continue;}
        try {const c = await C.catalog.details(recordByName(n) || shipped(n).name ? {...(recordByName(n) || shipped(n))} : {name: n}, {cheapest: false}); if (c && c.oracleText) texts.push(c.oracleText);} catch {/* the type line stays */}
      }
      if (texts.length && el.isConnected) {el.textContent = cut(texts.join(" · ")); el.removeAttribute("data-about-for");}
    }
  }
  /* PLAYABLE ONLY (Rob: "include a toggle check box to filter for Playable"): the decks the table can play every card of,
     the rest put away once it has said so -- off until it is ticked, and then remembered on this device. */
  const ONLY_KEY = "cm-table-deck-playable";
  const onlyPlayable = () => {try {return localStorage.getItem(ONLY_KEY) === "on";} catch {return false;}};
  document.addEventListener("change", (event) => {
    const el = event.target.closest?.("[data-table-deck-playable]");
    if (!el) return;
    try {localStorage.setItem(ONLY_KEY, el.checked ? "on" : "off");} catch {/* applied, not remembered */}
    el.closest(".cm-table-deck-choose")?.classList.toggle("is-playable-only", el.checked);
  });
  actions["table-deck"] = async (el) => {
    await C.sharingReady;
    availableSharedDecks = C.sharingAvailable?.() && C.sharedDecks ? await C.sharedDecks() : [];
    let preconError = "";
    try {availablePrecons = await tablePrecons();} catch (error) {availablePrecons = []; preconError = error.message;}
    const seatId = Number(el.dataset.seat), decks = libraryDecks();
    const test = current && current.playtest
      ? `<li><button type="button" class="cm-table-deck" data-action="table-use-test-deck" data-seat="${seatId}"><strong>${e(TEST_DECK.name)}</strong><span class="cm-muted">Wastes and 99 basic lands · for trying a game through quickly on this playtest table</span></button></li>`
      : "";
    const list = decks.length || test
      ? `<ul class="cm-table-decks">${test}${decks.map((d) => `<li><button type="button" class="cm-table-deck" data-action="table-use-deck" data-seat="${seatId}" data-deck="${e(d.id)}">${deckLines(d.name, (d.commanders || []).map((c) => (C.card(c) || {}).name).filter(Boolean), d.notes)}<span class="cm-muted cm-table-deck-known" data-known-for="${e(d.id)}"></span></button></li>`).join("")}</ul>`
      : "";
    /* AN EMPTY LIBRARY says how to fill it (the readiness checks of 2026-10-04: a friend new to CrankMagic, invited
       before restoring the host's backup, saw only the test deck). A restore keeps this page, so the seat is still
       theirs when it is done. */
    const empty = decks.length ? "" : `<div class="cm-table-deck-empty"><p>You can play a precon above without adding anything to your library.</p><p class="cm-muted">To use your own deck later, build or import one in Decks.</p></div>`;
    const precons = `<section aria-label="Precons"><h3>Precons</h3><p>Wizards' newest Commander decks, open to everyone. Choose one and play; nothing is added to your library.</p>${preconError ? `<p class="cm-note cm-warning">${e(preconError)}</p>` : `<ul class="cm-table-decks">${availablePrecons.map(d => `<li><button type="button" class="cm-table-deck" data-action="table-use-precon" data-precon="${d.id}" data-seat="${seatId}" disabled>${deckLines(d.name, d.commander, d.notes)}<span class="cm-muted" data-precon-status="${d.id}">Checking this server…</span></button></li>`).join("")}</ul>`}</section>`;
    const shared = availableSharedDecks.length ? `<section aria-label="Shared with you"><h3>Shared with you</h3><p>Decks other players shared with you or made public. No import or library setup needed.</p><ul class="cm-table-decks">${availableSharedDecks.map(d => `<li><button type="button" class="cm-table-deck" data-action="table-use-shared-deck" data-shared-deck="${d.id}" data-seat="${seatId}" disabled>${deckLines(d.name, d.commander, d.notes)}<span class="cm-muted" data-shared-status="${d.id}">Checking this server…</span></button></li>`).join("")}</ul></section>` : "";
    const only = `<label class="cm-checkbox cm-table-deck-only"><input type="checkbox" data-table-deck-playable${onlyPlayable() ? " checked" : ""}>Playable</label>`;
    C.modal(`Choose a deck · Seat ${seatId + 1}`, `<div class="cm-table-deck-choose${onlyPlayable() ? " is-playable-only" : ""}">${only}${precons}${shared}${decks.length ? '<h3>Your library decks</h3>' : ''}${list}${empty}</div><div id="cm-table-deck-error" class="cm-note cm-warning" hidden></div><div class="cm-form-footer">${b("Cancel", "close")}</div>`);
    knownCounts(decks);
    checkSharedDecks(current.tableId);
    fillAbout();
  };
  async function checkSharedDecks(tableId) {
    sharedReady.clear();
    try {
      const names = [...new Set([...availablePrecons, ...availableSharedDecks].flatMap(d => [...d.commander, ...d.cards]))];
      const response = await api("POST", `${tableUrl(tableId)}/known`, {names});
      if (!Array.isArray(response.unknown)) throw Error("Deck verification is unavailable. Close this window and try again.");
      const unknown = new Set(response.unknown);
      if (current?.tableId !== tableId) return;
      for (const [d, attr] of [...availablePrecons.map((d) => [d, "data-precon-status"]), ...availableSharedDecks.map((d) => [d, "data-shared-status"])]) {
        const status = document.querySelector(`[${attr}="${d.id}"]`);
        if (!status) continue;
        const missing = [...d.commander, ...d.cards].filter(n => unknown.has(n));
        status.textContent = missing.length ? "Not available on this server yet" : "Ready to play";
        status.closest("button").disabled = missing.length > 0;
        if (!missing.length) sharedReady.add(d.id);
      }
    } catch (error) {
      for (const status of document.querySelectorAll('[data-shared-status], [data-precon-status]')) status.textContent = "Could not check this deck. Close and reopen to retry.";
    }
  }
  actions["table-use-shared-deck"] = async (el) => {
    let d = availableSharedDecks.find(d => d.id === el.dataset.sharedDeck);
    if (!d || !sharedReady.has(d.id)) return;
    const tableId = current.tableId;
    try {
      if (C.sharingAvailable?.() && C.sharedDecks) {
        d = (await C.sharedDecks()).find(deck => deck.id === d.id);
        if (!d) throw Error("This deck is no longer shared with you. Choose another deck.");
        if (current?.tableId !== tableId) return;
      }
      await api("POST", `${tableUrl(current.tableId)}/deck`, {seatId:Number(el.dataset.seat), deck:{name:d.name, commander:[...d.commander], cards:[...d.cards], bracket:d.bracket}});
      actions.close();
      await refresh(current.tableId);
    } catch (error) {
      const box = document.getElementById("cm-table-deck-error");
      if (!box) throw error;
      box.hidden = false; box.textContent = error.message;
    }
  };
  actions["table-use-precon"] = async (el) => {
    const d = availablePrecons.find((x) => x.id === el.dataset.precon);
    if (!d || !sharedReady.has(d.id)) return;
    try {
      await api("POST", `${tableUrl(current.tableId)}/deck`, {seatId: Number(el.dataset.seat), deck: {name: d.name, commander: [...d.commander], cards: [...d.cards]}});
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
