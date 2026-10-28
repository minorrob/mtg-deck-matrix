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
  /* PLAY'S HELP, IN TABS (Rob, 2026-10-28): Getting started, Cards, Views, Panels (the drawers and the modules in them), Keys. */
  C.HELP.table = {title: "Play: the table and the board", tabs: [
    {id: "start", label: "Getting started", body: `<div class="cm-help">
      <h3>Your first deck</h3>
      <p>Open <strong>Decks</strong>. <strong>New deck</strong> starts a list from nothing; <strong>Import</strong> takes a pasted list or a file and shows what it found before it adds anything; a <strong>New from Wizards</strong> chip starts a deck from the newest Commander precons. To play a deck at a table it needs its commander and 100 cards, every one of them a card the table can play. A deck's page says how many it can, and <strong>Play this deck</strong> appears once the table can play it whole.</p>
      <h3>Setting up a game</h3>
      <p>Open <strong>Play</strong> and press <strong>Start a new game</strong>. Choose how many people and how many AIs (a table seats two to four). Name each person you invite, from CrankMagic's players or by email, and give each AI a name, a difficulty (Easy, Normal, Hard or Veteran) and a personality; hover a choice to read what it means. Then set starting life, a bracket limit, house rules, and whether the game is <strong>Public</strong> (listed in Live games, open to watchers and requests to join) or <strong>Private</strong> (invitation only). <strong>Submit</strong> opens the lobby.</p>
      <h3>In the lobby</h3>
      <p>Each person chooses a deck (their own, a shared one or a public precon) and a mat, then presses <strong>Ready</strong>. Anyone at the table can hand an AI seat a different deck or tune it with <strong>Edit AI</strong>. The organizer can edit the rules until a seat is ready, invite a person by link, QR code or email, add an AI to an open seat, remove a seat, or end the game. <strong>Lobby tour</strong> walks through all of it.</p>
      <h3>Starting a game</h3>
      <p>When every seat is ready the organizer presses <strong>Start</strong>, and a ten-second countdown begins; <strong>Cancel</strong> stops it. Then the board opens with your opening hand: keep it or take a mulligan. A step in which you have nothing to do passes by itself, and the history says so.</p>
      <h3>Joining and watching</h3>
      <p>Open the link a host sent you, or choose <strong>Join existing game</strong> in Play to ask for a seat at a public lobby or paste the invitation. <strong>Watch</strong>, in the menu beside any game in Live games, lets you follow a game from any seat's side without seeing anyone's hand or library. <strong>Resume game</strong> returns you to a game you left.</p></div>`},
    {id: "cards", label: "Cards", body: `<div class="cm-help">
      <h3>Playing a card</h3>
      <p>Click a card to review what it can do now; right-click it for the same list in short (🔍 opens it to read). Nothing happens until you confirm: select an option, review its targets and payment in <strong>Actions</strong>, then <strong>Confirm</strong>. <strong>Clear</strong> changes only your own choice. Further target or payment questions stay in Actions, and each confirmation submits that step. On a touch screen, long-press a card to inspect it.</p>
      <h3>Passing</h3>
      <p>The pass button says what passing will do: <em>Next step</em>, <em>Resolve</em> and the spell's name, or <em>Pass</em>. Your draw happens by itself, and a spell you cast resolves unless someone responds; to be asked first, turn on <em>Hold priority after I cast</em> in Tools.</p>
      <h3>Your rows</h3>
      <p>Drag a card to the other row of its mat to keep it there; lands stay with the lands. <kbd>Alt</kbd> + drag up or down on a mat makes its cards larger or smaller.</p>
      <h3>What a screen reader hears</h3>
      <p>Every card says its name and what is shown on it: tapped, its power and toughness, damage, counters, attacking or blocking, chosen or selected, and what it can do now. A face-down card is said to be one, and nothing more. Each question the table asks you is said as it arrives, and so is the card shown large under the pointer.</p></div>`},
    {id: "views", label: "Views", body: `<div class="cm-help">
      <h3>Three ways to see the table</h3>
      <p><strong>Table</strong> shows every board at once. <strong>Focus</strong> puts one board on the mat, beside the seats. <strong>3D</strong> puts your cards in an immersive tabletop scene. New desktop players start in 3D; your chosen view is remembered.</p>
      <h3>In 3D</h3>
      <p>The wheel zooms (over your hand it sizes the hand), dragging a mat moves the view across the table, dragging the bare table tilts it, and holding the right button looks at that place until you let go. <strong>Camera</strong> holds View seats, Tilt, Zoom, card size and Reset; a tilt of 0 is the floor's own slope in the scene behind the table.</p>
      <h3>The top bar and the corner</h3>
      <p>The top bar shows you, your life, and the steps of the turn; the step now under way is lit. The box at the table's top left names the turn and each player's life. A blue dot beside a life says who holds priority, and the arrow beside <em>Turn</em> folds the box away.</p>
      <h3>Sound</h3>
      <p>Sound starts at your first click on the board, and Tools › Sound sets it.</p></div>`},
    {id: "panels", label: "Panels", body: `<div class="cm-help">
      <h3>Two drawers</h3>
      <p>The tab labeled <strong>Actions</strong>, at the left edge, opens the drawer where the table asks you things and where you review what a card can do; under it, <strong>Boards</strong> lists every seat with its life and cards in hand. The tab at the right edge opens <strong>Stack &amp; history</strong>. Drag a drawer's edge to make it wider or narrower.</p>
      <h3>The panels inside</h3>
      <p>Each drawer is built of panels you can keep or put away: <strong>History</strong> (newest first, scroll sideways to read a long line), <strong>On the Stack</strong>, <strong>Card Preview</strong>, <strong>Mana Pool</strong>, <strong>Resources</strong>, <strong>Table Vitals</strong>, <strong>Recommended Actions</strong>, <strong>AI Coach</strong>, <strong>Counter-Intel</strong> and <strong>Chat</strong>. Choose which show, and where, with <strong>Set Side Drawer Modules</strong> in Settings, or the gear in the right drawer's header.</p>
      <h3>Chat and the log</h3>
      <p>Messages you send in <strong>Chat</strong> reach everyone at the table, and the chat is kept with the game's log.</p></div>`},
    {id: "keys", label: "Keys", body: `<div class="cm-help"><ul class="cm-help-keys">
      <li><kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> move through the board in the order it is laid out: the strip, the seats, the boards, what the table asks you, then your hand. <kbd>Enter</kbd> or <kbd>Space</kbd> presses what has the focus.</li>
      <li><kbd>Space</kbd>, with nothing focused, fans your hand, and in the fanned hand puts it away. While it is fanned, <kbd>1</kbd>–<kbd>9</kbd> holds that card up, and <kbd>Enter</kbd> selects the held card's action for review (or presses the button that has the focus).</li>
      <li><kbd>Escape</kbd> puts away the card shown large, and steps back one thing a press: an open menu (History, Tools, ☰, the steps, You can also); the Coach; a held card, back into the fan; the fanned hand; then the Panel. It does not change your saved view. In a dialog, it closes the dialog.</li>
      <li><kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>+</kbd> and <kbd>−</kbd> make the cards 10% larger or smaller. <kbd>Alt</kbd> + drag up or down on a mat sizes its cards.</li>
      <li>The wheel over your hand: ± its cards (<kbd>Shift</kbd> + wheel scrolls a hand too wide). In 3D, <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + drag the table ↕: your side longer or shorter, your mat with it, down to the screen's foot; <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + double-click: back. Camera ✋ and ↕ are the same two sizes.</li>
      <li>On a card, <kbd>Shift</kbd>+<kbd>F10</kbd> or the <kbd>Menu</kbd> key opens what it can do now; <kbd>↑</kbd> and <kbd>↓</kbd>, <kbd>Home</kbd> and <kbd>End</kbd> move through it, and <kbd>Escape</kbd> closes it, back to the card. <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd> or <kbd>→</kbd> moves the card within its row.</li>
      <li>On a divider (the bar between the rows, the one atop your hand, the Panel's, the side column's), <kbd>↑</kbd> and <kbd>↓</kbd> move it. On the seat pane's edge, and on the bar between two boards side by side, <kbd>←</kbd> and <kbd>→</kbd> move it.</li>
      <li>In the Coach and in Chat, <kbd>Enter</kbd> sends, and <kbd>Shift</kbd>+<kbd>Enter</kbd> starts a new line.</li>
    </ul></div>`},
  ]};
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
  /* Over 100 on the list or in the box, a deck is Building and the table does not take it (Rob, 2026-10-26). */
  const playable = (deck) => {if(deck.archived||!(deck.commanders||[]).length)return false;if(C.M?.deckStatus&&C.M.deckStatus(C.state,deck).over)return false;const list=deckForTable(deck);return list.commander.length+list.cards.length===100;};
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
      const route=C.route(),routeKey=route.view+'?'+route.params.toString(),version=d.version;
      let r;
      try {r = await readiness(d);} catch {return;}
      const currentRoute=C.route(),currentDeck=C.state.decks.find(x=>x.id===d.id);
      const currentView=el.isConnected&&document.getElementById('cm-deck-play')===el&&el.dataset.deck===d.id&&currentRoute.view==='decks'&&currentRoute.params.get('deck')===d.id&&currentRoute.view+'?'+currentRoute.params.toString()===routeKey&&currentDeck&&!currentDeck.archived&&currentDeck.version===version;
      if(!currentView)return;
      const playPrimary=!r.count&&C.M?.readiness(C.state,d).complete===true&&(!C.route().params.get('tab')||C.route().params.get('tab')==='overview');
      el.innerHTML = `<span class="cm-deck-play-line">${e(readinessText(r))}</span>`
        + (r.count ? ` <span class="cm-muted">The table cannot play ${r.unknown.length === 1 ? "this one" : "these"} yet: ${e(r.unknown.slice(0, 6).join(", "))}${r.unknown.length > 6 ? ", …" : ""}.</span>`
          : ` ${b("Play this deck", "deck-play", {deck: d.id}, playPrimary, {cls: "compact"})}`);
      if(playPrimary)for(const button of document.querySelectorAll('.cm-deck-work .primary,.cm-action-bar .primary')){button.classList.remove('primary');button.dataset.playDemoted='true';}
      else for(const button of document.querySelectorAll('[data-play-demoted]')){button.classList.add('primary');delete button.dataset.playDemoted;}
      const blocked=r.count?`${r.count} card${r.count===1?'':'s'} unplayable at the table. Fix the list before playing.`:'';
      el.dataset.blockedState=blocked;
      if(blocked)el.insertAdjacentHTML('beforeend',` <strong class="cm-deck-blocked">${e(blocked)}</strong>`);
      const next=document.querySelector('#cm-deck-next .cm-bento-next-line');if(next)next.textContent=blocked||(playPrimary?'The box is ready. Play this deck or log a game.':next.dataset.nextDefault);
      el.classList.toggle("is-playable", !r.count);
      el.hidden = false;
    },
  };
  actions["deck-play"] = (el) => C.go("table", {deck: el.dataset.deck});

  /* ---- the lobby ---- */
  /* THE LOBBY (Rob, 2026-10-28; the Claude Design screen "Lobby with walkthrough"): the four quadrants as they were, each seat
     headed by who sits there, its status and, for the organizer, Remove seat; an AI seat says what it is (a line, then AI, its
     difficulty and its personality); the middle panel holds the table's rules, Start and End game; a Lobby tour walks through it.
     What a person has open here (an AI seat's editor, the rules' editor, End game's question) is `lobbyUi`; the page is drawn from it. */
  let lobbyUi = {edit: null, rules: false, confirmEnd: false, rulesError: ""};
  const LEVEL_WORD = {easy: "Easy", normal: "Normal", hard: "Hard", llm: "Veteran"};
  const LEVEL_BLURB = {easy: "Plays the turn in front of it. Usually right, sometimes second-best.", normal: "Weighs the whole game lightly and breaks a combo it can see.", hard: "Reads every threat, aims each attacker, keeps the blockers it needs.", llm: "Hard's reads, judged by an AI model at the big moments."};
  const lounge = () => C.lounge || {PERSONAS: {}, PERSONA_ORDER: [], DIFFICULTY: [], AI_SUP: ""};
  const POS = ["tl", "tr", "bl", "br"];   /* where seats 1 to 4 sit on the table */
  const seatOpen = (s) => !s.occupied && !s.invited;
  function seatState(s, t) {
    if (!s.occupied) return s.invited ? "invited" : "empty";
    if ((t.away || []).some((a) => a.seatId === s.seatId)) return "error";
    return s.ready ? "ready" : s.deck ? "deck" : "pending";
  }
  const lobbyEditable = (t) => t.phase === "selecting" || t.phase === "countdown";
  function aiEditor(s, t) {
    const lg = lounge(), level = s.level || "normal";
    const levels = lg.DIFFICULTY.map((d) => `<option value="${d.level}"${d.level === level ? " selected" : ""}>${d.id === "Veteran" ? "Veteran · uses AI credits" : d.id}</option>`).join("");
    const personas = lg.PERSONA_ORDER.map((id) => `<option value="${id}"${id === s.persona ? " selected" : ""}>${lg.PERSONAS[id].name} · ${lg.PERSONAS[id].tag.toLowerCase()}</option>`).join("");
    return `<div class="cm-lb-edit" data-seat="${s.seatId}"><p class="cm-lb-edit-title">Edit AI · seat ${s.seatId + 1}</p>
      <label>Name<input data-edit-ai="name" data-seat="${s.seatId}" maxlength="40" value="${e(s.name || "")}"></label>
      <label>Difficulty<select data-edit-ai="level" data-seat="${s.seatId}">${levels}</select></label>
      <p class="cm-lb-edit-note">${e(LEVEL_BLURB[level] || "")}</p>
      <label>Personality<select data-edit-ai="persona" data-seat="${s.seatId}">${s.persona && !lg.PERSONAS[s.persona] ? `<option value="${e(s.persona)}" selected>${e(s.persona)}</option>` : ""}${!s.persona ? '<option value="" selected>None</option>' : ""}${personas}</select></label>
      <button type="button" class="cm-pl-btn is-primary" data-action="table-edit-ai-done" style="height:34px;border-radius:8px">Done</button></div>`;
  }
  function seatBox(s, t) {
    const art = C.seatArt, lg = lounge();
    const state = seatState(s, t), open = seatOpen(s), ai = s.kind === "ai" && !open, persona = ai ? lg.PERSONAS[s.persona] : null;
    const editable = lobbyEditable(t), seated = (t.seats || []).some((x) => x && x.you) || t.youAreHost;
    /* A seat the host named but nobody holds yet (a person to invite) keeps its name; one with no name of its own is Open. */
    const named = open && s.kind === "human" && s.name && !/^Seat \d$/.test(s.name);
    const title = `Seat ${s.seatId + 1} · ${s.you ? "You" : open && !named ? "Open" : s.name || `AI ${s.seatId + 1}`}${s.seatId === 0 && !ai ? " · Host" : ""}`;
    const pseudo = s.deck ? {name: s.deck.name, commanders: (s.deck.commander || []).map((name) => ({name}))} : null;
    const away = (t.away || []).find((a) => a.seatId === s.seatId);
    const line = away ? `Dropped · back by ${new Date(away.until).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"})}`
      /* The table sends a card count for your own seat only; nobody sees another seat's cards. */
      : s.deck ? `${s.deck.name}${s.cards !== undefined ? ` · ${s.cards + (s.deck.commander || []).length} cards` : ""}`
      : open ? (named ? (t.youAreHost ? `Invite ${s.name}, or fill the seat with an AI.` : `The host is inviting ${s.name}.`) : t.youAreHost ? "Open seat. Fill it or leave it empty." : "Open seat. The host fills it.")
      : s.invited && !s.occupied ? "Invitation sent · waiting on them"
      : s.you ? "Choose a deck." : ai ? "Choose an AI deck" : "Choosing a deck";
    const controls = [];
    if (editable) {
      if (s.you) {
        controls.push(b(s.deck ? "Change deck" : "Choose a deck", "table-deck", {seat: String(s.seatId), tour: "you-deck"}, !s.deck, {cls: "compact"}));
        controls.push(b("Choose mat", "table-mat", {tour: "you-mat"}, false, {cls: "compact"}));
        controls.push(`<button type="button" class="v-button compact${s.deck && !s.ready ? " primary" : ""}${s.ready ? " is-ready" : ""}" data-action="table-ready" data-ready="${s.ready ? "" : "1"}" data-tour="you-ready" aria-pressed="${!!s.ready}"${s.deck ? "" : " disabled"}>${s.ready ? "Ready ✓" : "Ready"}</button>`);
      } else if (ai && seated) {
        controls.push(b(s.deck ? "Change deck" : "Choose its deck", "table-deck", {seat: String(s.seatId), tour: "ai-deck"}, false, {cls: "compact"}));
        controls.push(b("Edit AI", "table-edit-ai", {seat: String(s.seatId), tour: "ai-edit"}, false, {cls: "compact"}));
      } else if (t.youAreHost && open) {
        controls.push(b("Add an AI", "table-seat-add-ai", {seat: String(s.seatId)}, false, {cls: "compact"}));
        controls.push(b("Invite a player", "table-invite", {seat: String(s.seatId)}, false, {cls: "compact"}));
      } else if (t.youAreHost && s.kind === "human" && s.invited && !s.occupied) {
        controls.push(b("New link", "table-invite", {seat: String(s.seatId)}, false, {cls: "compact"}));
        controls.push(b("Withdraw", "table-uninvite", {seat: String(s.seatId)}, false, {cls: "compact"}));
      }
    }
    const summary = persona ? `<p class="cm-seat-summary">${e(persona.summary)}</p>` : "";
    const tags = ai ? `<div class="cm-seat-tags"><span class="is-ai">AI</span><span>${e(LEVEL_WORD[s.level] || "Normal")}</span>${persona ? `<span>${e(persona.tag)}</span>` : ""}</div>` : "";
    const detail = lobbyUi.edit === s.seatId && ai && editable ? aiEditor(s, t)
      : `${pseudo ? `<p class="cm-seat-name"><span>${e((s.deck.commander || [])[0] || s.deck.name)}</span></p>` : ""}<p class="cm-seat-line"><span>${e(line)}</span></p>${summary}${tags}${controls.length ? `<div class="cm-actions cm-seat-controls">${controls.join("")}</div>` : ""}`;
    const remove = t.youAreHost && editable && s.seatId !== 0 && (s.occupied || s.invited) && !s.you
      ? `<button type="button" class="cm-seat-remove" data-action="table-seat-remove" data-seat="${s.seatId}" data-tour="remove" aria-label="Remove ${e(s.name || `seat ${s.seatId + 1}`)}"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8"></path></svg>Remove seat</button>` : "";
    const inner = `<article class="cm-lobby-seat${ai ? " is-ai" : " is-human"}${s.ready ? " is-ready" : ""}" data-seat="${s.seatId}" data-pos="${POS[s.seatId]}" data-mat="${e(s.mat || "felt")}">
      <header><h3>${e(title)}${ai ? lg.AI_SUP : ""}</h3>${art.statusPill(state, s.ready)}${remove}</header>
      ${art.seatFigure(pseudo, `<div class="cm-seat-info">${detail}</div>`, "")}
    </article>`;
    return {state, inner};
  }
  function centerPanel(t) {
    const waiting = t.blockers.filter((x) => x.seatId !== null).length, r = rulesOf(t), seated = t.seats.filter((x) => x && (x.occupied || x.invited)).length;
    let launch = "", button = "";
    if (t.phase === "countdown") {
      launch = `<p class="cm-table-count" aria-live="polite">Starting in <strong id="cm-table-seconds">${Math.max(0, Math.ceil((t.countdownAt - tableNow()) / 1000))}</strong></p>`;
      button = t.youAreHost ? b("Cancel", "table-cancel", {}, false, {cls: "compact"}) : "";
    } else if (t.phase === "selecting") {
      /* "Launches when all are ready · n to go" (the brief, 2026-10-12): the count of seats still to go, then the one
         reason that is not a seat's, if any. The host's Start begins the ten-second countdown; it never launches outright. */
      const why = t.blockers.length ? `Launches when all are ready · ${waiting ? `${waiting} seat${waiting === 1 ? "" : "s"} to go` : t.blockers[0].reason}.` : t.youAreHost ? "Everyone is ready. Start when you like." : "Everyone is ready. Waiting on the host.";
      launch = `<p class="cm-table-launch${t.launchError ? " is-error" : ""}" data-tour="launch">${e(t.launchError || why)}</p>`;
      button = t.youAreHost ? `<button type="button" class="v-button compact${t.blockers.length ? "" : " primary"}" data-action="table-start" data-tour="start"${t.blockers.length ? " disabled" : ""}>Start</button>` : "";
    } else launch = `<p class="cm-table-launch">${e(t.phase === "playing" ? "The game is on." : t.phase === "rematch" ? "The game is over." : "Starting…")}</p>`;
    const privacy = t.privacy === "public" ? "Public" : t.privacy === "private" ? "Private" : "";
    const rows = [["Starting life", r.startingLife], ["Bracket limit", r.bracketLimit ? `${r.bracketLimit} or lower` : "Any"], ["Seats", `${seated} of 4`], ...(privacy ? [["Privacy", privacy]] : []), ...(r.houseRules ? [["House rules", "On"]] : []), ["Invitations last", "a day"], ["A dropped player has", "5 minutes"]];
    const editing = lobbyUi.rules && t.youAreHost && t.phase === "selecting";
    const editor = editing ? `<form class="cm-lb-rules" id="cm-table-rules-form">
      <label>Starting life<input type="number" name="startingLife" min="1" max="999" step="1" inputmode="numeric" value="${r.startingLife}" required></label>
      <label>Bracket limit<select name="bracketLimit"><option value="">Any</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${r.bracketLimit === n ? " selected" : ""}>${n} or lower</option>`).join("")}</select></label>
      <label>Privacy<select name="privacy"><option value="private"${t.privacy !== "public" ? " selected" : ""}>Private</option><option value="public"${t.privacy === "public" ? " selected" : ""}>Public</option></select></label>
      <label>House rules<select name="houseRules"><option value="">Off</option><option value="1"${r.houseRules ? " selected" : ""}>On</option></select></label>
      ${lobbyUi.rulesError ? `<p class="cm-lb-rules-error" role="alert">${e(lobbyUi.rulesError)}</p>` : ""}
      <button type="button" class="v-button compact" data-action="table-rules-cancel">Cancel</button><button type="button" class="v-button compact primary" data-action="table-rules-save">Save rules</button></form>` : "";
    const end = t.youAreHost && (t.phase === "selecting" || t.phase === "countdown")
      ? (lobbyUi.confirmEnd ? `<div class="cm-lb-confirm"><p><b>End this game for everyone?</b></p><p>The seats are released and nothing is recorded.</p><div><button type="button" class="v-button compact" data-action="table-end-keep">Keep the game</button><button type="button" class="v-button compact is-danger" data-action="table-end">End game</button></div></div>`
        : `<button type="button" class="cm-lb-end" data-action="table-end-ask" data-tour="end">End game</button>`) : "";
    return `<section class="cm-table-center" aria-label="Table rules">
      <img class="cm-table-stamp" src="assets/crankmagic/crankmagic-logo-gear-v4-256.webp" alt="" aria-hidden="true">
      <div class="cm-table-head"><h2>Table rules</h2>${t.youAreHost && t.phase === "selecting" && !editing ? `<button type="button" class="cm-table-rules-edit" data-action="table-rules" data-tour="rules" aria-label="Edit the table rules">Edit</button>` : ""}<span class="cm-table-setby-top">${t.youAreHost ? "set by you, the host" : "set by the host"}</span></div>
      ${editing ? editor : `<dl class="cm-table-rules">${rows.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(String(v))}</dd></div>`).join("")}</dl>`}
      ${editing || lobbyUi.confirmEnd ? "" : `<div class="cm-table-launch-row" id="cm-table-launch">${launch}${button}</div>`}${editing ? "" : end}
    </section>`;
  }
  /* THE TABLE'S RULES (Rob, 2026-09-30): the host edits the starting life and the bracket limit from a small Edit beside
     the panel's heading, and not once any seat is ready -- then the Edit is refused, saying how to change them. */
  const rulesOf = (t) => t.rules || {startingLife: 40, bracketLimit: null};
  const readyNames = (t) => t.seats.filter((x) => x.ready && x.kind !== "ai").map((x) => x.name);
  const namesText = (list) => list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  actions["table-rules"] = () => {
    const ready = readyNames(current);
    if (ready.length) throw Error(`The rules can't change once a seat is ready, and ${namesText(ready)} ${ready.length === 1 ? "is" : "are"}. Take back Ready, then edit the rules.`);
    lobbyUi.rulesError = "";
    lobbyUi.rules = true; lobbyUi.confirmEnd = false;
    redraw();
  };
  actions["table-rules-cancel"] = () => {lobbyUi.rules = false; lobbyUi.rulesError = ""; redraw();};
  actions["table-rules-save"] = async () => {
    const form = document.getElementById("cm-table-rules-form"), v = Object.fromEntries(new FormData(form));
    try {
      await lobbyCall("rules", {startingLife: Number(v.startingLife), bracketLimit: v.bracketLimit ? Number(v.bracketLimit) : null, houseRules: v.houseRules === "1", privacy: v.privacy});
      lobbyUi.rules = false; lobbyUi.rulesError = "";
      await refresh(current.tableId);
    } catch (error) {
      lobbyUi.rulesError = error.message; redraw();
    }
  };
  /* The lobby drawn again from what the page holds (a seat's editor opened, the rules' editor, End game's question). */
  const redraw = () => {if (current) {drawnKey = null; draw(current);}};
  /* A lobby door the server has not opened yet says so, in words, rather than failing silently. */
  async function lobbyCall(action, body) {
    try {return await api("POST", `${tableUrl(current.tableId)}/${action}`, body || {});}
    catch (error) {
      if (error && (error.status === 404 || error.status === 405)) throw Error("That is not open on this server yet.");
      throw error;
    }
  }
  actions["table-seat-remove"] = async (el) => {await lobbyCall("seat", {op: "remove", seatId: Number(el.dataset.seat)}); if (lobbyUi.edit === Number(el.dataset.seat)) lobbyUi.edit = null; await refresh(current.tableId);};
  actions["table-seat-add-ai"] = async (el) => {
    const lg = lounge(), seatId = Number(el.dataset.seat), used = new Set(current.seats.filter((x) => x && x.kind === "ai" && !seatOpen(x)).map((x) => x.persona));
    const persona = lg.PERSONA_ORDER.find((id) => !used.has(id)) || lg.PERSONA_ORDER[0];
    await lobbyCall("seat", {op: "add-ai", seatId, name: persona ? lg.PERSONAS[persona].name : `AI ${seatId + 1}`, level: "normal", ...(persona ? {persona} : {})});
    const table = await refresh(current.tableId);
    const failures = await autoDeckAI(table);
    if (failures.length) C.notice(failures.join(" "), true, {undo: false});
    await refresh(current.tableId);
  };
  actions["table-edit-ai"] = (el) => {lobbyUi.edit = lobbyUi.edit === Number(el.dataset.seat) ? null : Number(el.dataset.seat); redraw(); C.main.querySelector(".cm-lb-edit input")?.focus({preventScroll: true});};
  actions["table-edit-ai-done"] = () => {lobbyUi.edit = null; redraw();};
  document.addEventListener("change", async (event) => {
    const el = event.target.closest?.("[data-edit-ai]"); if (!el || !current) return;
    const seatId = Number(el.dataset.seat), field = el.dataset.editAi;
    try {await lobbyCall("seat", {op: "edit-ai", seatId, [field]: el.value.trim()}); await refresh(current.tableId);}
    catch (error) {C.notice(error.message, true, {undo: false}); await refresh(current.tableId).catch(() => {});}
  });
  actions["table-end-ask"] = () => {lobbyUi.confirmEnd = true; lobbyUi.rules = false; redraw();};
  actions["table-end-keep"] = () => {lobbyUi.confirmEnd = false; redraw();};
  actions["table-end"] = async () => {
    lobbyUi.confirmEnd = false;
    await api("POST", `${tableUrl(current.tableId)}/end`, {});
    keepSeat(null); C.go("game"); C.notice("The game was ended. Every seat has been released.", false, {undo: false});
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
      ||!/^[a-z0-9]{8,40}$/.test(r.tableId)||!new RegExp('^'+r.tableId+'g[1-9][0-9]{0,5}$').test(r.matchId)||!/^s[0-3]$/.test(r.seatId)||r.id!==`game:table:${r.matchId}:${r.seatId}`
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
    const key = JSON.stringify([t, lobbyUi]);
    if (key === drawnKey && C.main.querySelector(".cm-cloud-table")) return;
    /* What is being typed in an AI seat's editor is not redrawn under the typist: the next read draws it. */
    if (C.main.querySelector(".cm-lb-edit") && document.activeElement?.closest?.(".cm-lb-edit") && lobbyUi.edit !== null && drawnKey) return;
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
      C.main.innerHTML = `<div class="cm-pl cm-lb"><header class="cm-pl-head"><h1 class="cm-pl-title">Play</h1>
        <button type="button" class="cm-pl-ibtn" data-action="page-help" data-help="table" aria-label="About this page" title="About this page">?</button>
        <button type="button" class="cm-pl-ibtn" data-action="send-feedback" aria-label="Send feedback" title="Send feedback">${PL_MAIL}</button>
        <button type="button" class="cm-pl-btn" data-action="lobby-tour"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 14V2.5"></path><path d="M3.5 3h8l-1.6 2.75L11.5 8.5h-8"></path></svg>Lobby tour</button>
        <a class="cm-lb-leave" href="#game" data-lobby-leave>Leave lobby</a></header>
        <p class="cm-lb-sub">${t.youAreHost ? "Your table." : "You were invited to this table."} Four seats at most; it starts when everyone is ready.</p>
        ${t.phase === "rematch" ? gamePanel(t) : ""}
        <div class="cm-lb-frame"><div class="cm-cloud-table cm-lb-grid" data-phase="${e(t.phase)}">${seats}${centerPanel(t)}</div></div></div>`;
    });
    art.startSeas();
    C.lounge?.tourRefresh?.();
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
    lobbyUi = {edit: null, rules: false, confirmEnd: false, rulesError: ""};
    /* Play, with a game of yours on (item 19): straight back to it, in place of this page in the history. */
    const live = !id && !params.has('new') && C.board && C.board.live && C.board.live();
    if (live) {location.replace(`#table?id=${encodeURIComponent(live.tableId)}`); return;}
    /* A new game is a pop-up over the Pre-lobby (Rob, 2026-10-28: "get rid of that page"); a link to it opens both. */
    if (!id) {const cleanup = views.playHome(); C.lounge?.newGame({deckId: params.get("deck"), ai: params.get("ai") === "1"}); return cleanup;}
    let stop = false, timer = null;
    const tick = () => {
      const seconds = document.getElementById("cm-table-seconds"), left = current && current.countdownAt ? String(Math.max(0, Math.ceil((current.countdownAt - tableNow()) / 1000))) : null;
      /* written only when it changes: the count is a live region, said each time it is written */
      if (seconds && left !== null && seconds.textContent !== left) seconds.textContent = left;
      /* One count only (Rob, 2026-10-28: "I don't need two counters"): the panel's "Starting in" is it; the large numeral over a dimmed lobby is gone. */
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
    return () => {stop = true; clearTimeout(timer); clearInterval(clock); C.lounge?.tourClose?.(); if (C.board) C.board.detach();};
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
  /* PLAY HOME, THE PRE-LOBBY (Rob, 2026-10-27; the Claude Design reference "Pre-lobby"). Below the lounge banner, two columns of one height, the left
     2.5 times the right: LIVE GAMES (every public table in its lobby or under way, and your own and the ones you sit at, private; the admin sees them all),
     and, stacked, START A GAME (Start a new game, Join existing game, Resume game), the LEADERBOARD (sortable) and the Pre-lobby chat (Coming soon).
     Reading this page never claims or releases a seat. The server's half is asked for in docs/ACTIVE.md's Requests table: `GET /api/tables/live`,
     `GET /api/leaderboard`, and the request-join, watch, quit and log doors; until one answers, its part reads empty and says so, and nothing is made up. */
  const plPad = (n) => String(n).padStart(2, "0");
  const plRun = (sec) => `${Math.floor(sec / 3600)}:${plPad(Math.floor(sec % 3600 / 60))}:${plPad(sec % 60)}`;
  const PL_CARET = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>';
  const PL_MAIL = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="1.5"></rect><path d="M2.5 4.5 8 9l5.5-4.5"></path></svg>';
  const PL_AI = '<sup class="cm-ai" aria-label="AI">ai</sup>';
  /* A table the server lists, as the page reads it. */
  const plGame = (g) => {
    const live = g.location === "live", mine = g.mine === true;
    return {id: g.tableId, live, mine, organizer: g.organizer || "A player", commander: g.commander || "No deck yet", mechanic: g.mechanic || "", privacy: g.privacy === "private" ? "Private" : "Public",
      ai: Number(g.ai) || 0, human: Number(g.human) || 0, open: Number(g.open) || 0, startedAt: live && g.startedAt ? Number(g.startedAt) : null, roster: Array.isArray(g.roster) ? g.roster : [],
      canJoin: !live && Number(g.open) > 0 && !mine};
  };
  views.playHome = () => {
    if(!cloudPlay())return views.table(new URLSearchParams());
    let active = true;
    let admin = C.adminAllowed?.() === true;
    /* Whether this person is the admin is read once, a moment after the page opens; the page asks again when it is known. */
    Promise.resolve(C.adminReady).then(() => {if (active && (C.adminAllowed?.() === true) !== admin) {admin = !admin; render();}});
    const st = {games: [], lb: [], liveKnown: false, lbKnown: false, open: null, sortKey: "wins", sortDir: -1, joinOpen: false, resume: null, resumeChecked: false};
    const root = document.createElement("div");
    root.className = "cm-pl"; root.id = "cm-play-home";
    C.main.replaceChildren(root);
    const clock = () => Date.now() + skew;
    const runOf = (g) => g.startedAt ? plRun(Math.max(0, Math.floor((clock() - g.startedAt) / 1000))) : "Not started";
    const countBtn = (g, kind, n) => `<button type="button" class="cm-pl-count" data-pl="seats" data-game="${e(g.id)}" data-kind="${kind}" aria-expanded="${st.open === `${g.id}:${kind}`}" aria-label="${n} ${kind === "ai" ? "AI" : "human"} seats in ${e(g.organizer)}'s game. Show players.">${n}</button>`;
    const gameRows = () => st.games.map((g) => {
      const menuOpen = st.open === g.id, ai = st.open === `${g.id}:ai`, human = st.open === `${g.id}:human`, label = `Actions for ${g.organizer}'s game`;
      const canAdmin = admin || g.mine, adminLabel = admin && !g.mine ? "Admin" : "Organizer";
      const people = g.roster.filter((p) => (ai ? p.ai : !p.ai));
      return `<tr class="cm-pl-row" data-game="${e(g.id)}">
        <td><span class="cm-pl-loc ${g.live ? "is-live" : "is-lobby"}"><i aria-hidden="true"></i>${g.live ? "Live" : "Lobby"}</span><span class="cm-pl-priv">${g.privacy}</span></td>
        <td><b>${e(g.organizer)}</b>${g.mine ? '<span class="cm-pl-you"> · you</span>' : ""}</td>
        <td><span class="cm-pl-cmd"><span>${e(g.commander)}</span>${g.mechanic ? `<span class="cm-pl-pill" title="${e(g.mechanic)}">${e(g.mechanic)}</span>` : ""}</span></td>
        <td class="is-r">${countBtn(g, "ai", g.ai)}</td>
        <td class="is-r">${countBtn(g, "human", g.human)}${g.open > 0 ? `<span class="cm-pl-open">${g.open} open</span>` : ""}</td>
        <td class="is-r cm-pl-run${g.live ? "" : " is-idle"}" ${g.live ? `data-run-start="${g.startedAt}"` : ""}>${runOf(g)}</td>
        <td class="cm-pl-sticky"><button type="button" class="cm-pl-caret" data-pl="menu" data-game="${e(g.id)}" aria-expanded="${menuOpen}" aria-label="${e(label)}">${PL_CARET}</button></td></tr>
      ${menuOpen ? `<tr class="cm-pl-more"><td colspan="7"><div class="cm-pl-menu" role="menu" aria-label="${e(label)}">
        ${g.canJoin ? `<button type="button" role="menuitem" class="cm-pl-mi" data-pl="join" data-game="${e(g.id)}">Request to join<small>The organizer approves your seat</small></button>` : ""}
        <button type="button" role="menuitem" class="cm-pl-mi" data-pl="watch" data-game="${e(g.id)}">Watch<small>Spectate any seat. No hands or libraries.</small></button>
        ${canAdmin ? `<hr><p>${adminLabel}</p><button type="button" role="menuitem" class="cm-pl-mi" data-pl="logs" data-game="${e(g.id)}">Game logs</button><button type="button" role="menuitem" class="cm-pl-mi is-danger" data-pl="quit" data-game="${e(g.id)}">Quit game</button>` : ""}
      </div></td></tr>` : ""}
      ${ai || human ? `<tr class="cm-pl-more"><td colspan="7"><div class="cm-pl-info" role="region" aria-label="${ai ? "AI seats" : "Human seats"} · ${e(g.organizer)}'s game">
        <div class="cm-pl-info-head"><p>${ai ? "AI seats" : "Human seats"} · ${e(g.organizer)}'s game</p><button type="button" data-pl="close-info" aria-label="Close">×</button></div>
        <table><thead><tr><th scope="col">Player</th><th scope="col">Commander</th><th scope="col">Core mechanic</th></tr></thead><tbody>${people.map((p) => `<tr><td>${e(p.name)}${p.ai ? PL_AI : ""}</td><td>${e(p.commander || "")}</td><td><span class="cm-pl-pill">${e(p.mechanic || "")}</span></td></tr>`).join("")}</tbody></table>
        ${people.length ? "" : `<p class="cm-pl-muted">${ai ? "No AI seats at this table." : "No human seats at this table."}</p>`}</div></td></tr>` : ""}`;
    }).join("");
    const lbRows = () => {
      const {sortKey: key, sortDir: dir} = st;
      return [...st.lb].sort((a, b) => key === "name" ? dir * String(a.name).localeCompare(b.name) : dir * ((a[key] || 0) - (b[key] || 0)) || String(a.name).localeCompare(b.name));
    };
    const lbHead = () => [["name", "User name"], ["wins", "Win"], ["losses", "Loss"], ["ties", "Tie"], ["unfinished", "Unfinished"]].map(([k, label]) => {
      const on = k === st.sortKey;
      return `<th scope="col" aria-sort="${on ? (st.sortDir === 1 ? "ascending" : "descending") : "none"}"><button type="button" class="cm-pl-sort" data-pl="sort" data-key="${k}" aria-pressed="${on}" aria-label="Sort by ${label}"><span>${label}</span><span aria-hidden="true">${on ? (st.sortDir === 1 ? "▲" : "▼") : ""}</span></button></th>`;
    }).join("");
    const joinable = () => st.games.filter((g) => g.canJoin);
    const resumeText = () => st.resume ? `Saved: ${st.resume.text}` : "No saved game. A game you leave without conceding waits here.";
    const liveN = () => st.games.filter((g) => g.live).length;
    const render = () => {
      const noGames = !st.games.length, noJoin = !joinable().length;
      root.innerHTML = `<header class="cm-pl-head"><h1 class="cm-pl-title">Play</h1>
        <button type="button" class="cm-pl-ibtn" data-action="page-help" data-help="table" aria-label="About this page" title="About this page">?</button>
        <button type="button" class="cm-pl-ibtn" data-action="send-feedback" aria-label="Send feedback" title="Send feedback">${PL_MAIL}</button></header>
      <section class="cm-pl-hero" aria-label="The Commander lounge"><img src="assets/crankmagic/lounge-hero.jpg" alt="" aria-hidden="true"><i aria-hidden="true"></i>
        <div><p class="cm-pl-hero-eyebrow">The Commander lounge</p><h2>A place at the table</h2><p class="cm-pl-hero-sub">Bring a deck. Invite your friends. Make the next game yours.</p></div></section>
      <div class="cm-pl-grid">
        <section class="cm-pl-card" aria-labelledby="cm-pl-live">
          <div class="cm-pl-cardhead"><div><p class="cm-pl-eyebrow">Around the tables</p><h2 class="cm-pl-h2" id="cm-pl-live">Live games</h2></div>
            <p class="cm-pl-muted">${st.liveKnown ? `${liveN()} live · ${st.games.length - liveN()} in lobby` : "Checking the tables…"}</p></div>
          <div class="cm-pl-tablewrap"><table class="cm-pl-games"><thead><tr><th scope="col">Location</th><th scope="col">Organizer</th><th scope="col">Commander</th><th scope="col" class="is-r">AI seats</th><th scope="col" class="is-r">Human seats</th><th scope="col" class="is-r">Run time</th><th scope="col" class="cm-pl-sticky"><span class="cm-pl-sr">Actions</span></th></tr></thead>
            <tbody>${gameRows()}</tbody></table>
            ${noGames && st.liveKnown ? '<div class="cm-pl-empty"><p>No games are running</p><p>Start one and it shows here for everyone.</p></div>' : ""}</div>
          <p class="cm-pl-muted">Private games are listed only for their seats and the admin.</p></section>
        <div class="cm-pl-side">
          <section class="cm-pl-card is-start" aria-labelledby="cm-pl-start"><div style="display:flex;flex-direction:column;gap:2px"><p class="cm-pl-eyebrow">Start</p><h2 class="cm-pl-h2" id="cm-pl-start">Start a game</h2></div>
            <button type="button" class="cm-pl-btn is-primary is-big" data-pl="new">Start a new game</button>
            <button type="button" class="cm-pl-btn is-big" data-pl="open-join"${noJoin && !st.joinAlways ? " disabled" : ""}>Join existing game</button>
            <button type="button" class="cm-pl-btn is-big" data-pl="resume"${st.resume ? "" : " disabled"}>Resume game</button>
            <p class="cm-pl-muted">${e(resumeText())}</p></section>
          <section class="cm-pl-card is-board" aria-labelledby="cm-pl-lb"><div style="display:flex;flex-direction:column;gap:2px"><p class="cm-pl-eyebrow">Standings</p><h2 class="cm-pl-h2" id="cm-pl-lb">Leaderboard</h2></div>
            <div class="cm-pl-lbwrap"><table class="cm-pl-lb"><thead><tr>${lbHead()}</tr></thead><tbody>${lbRows().map((r) => `<tr><td style="font-weight:${r.you ? 700 : 400}">${e(r.name)}</td><td>${Number(r.wins) || 0}</td><td>${Number(r.losses) || 0}</td><td>${Number(r.ties) || 0}</td><td>${Number(r.unfinished) || 0}</td></tr>`).join("")}</tbody></table>
              ${st.lbKnown && !st.lb.length ? '<p class="cm-pl-muted" style="padding:10px 2px">No finished games yet.</p>' : ""}</div></section>
          <section class="cm-pl-card is-chat" aria-labelledby="cm-pl-chat"><div class="cm-pl-chathead"><h2 class="cm-pl-h2 is-small" id="cm-pl-chat">Pre-lobby chat</h2><span class="cm-pl-soon">Coming soon</span></div>
            <p class="cm-pl-muted">Signed-in players will send and read messages here in real time.</p>
            <div class="cm-pl-chatrow"><label style="flex:1 1 auto;min-width:0"><span class="cm-pl-sr">Message</span><input disabled placeholder="Chat opens soon"></label><button type="button" disabled>Send</button></div></section>
        </div></div>`;
    };
    /* ---- the pop-ups: their own layer, so typing in one is never undone by a redraw of the page ---- */
    let layer = null;
    let opener = null;
    const closeLayer = () => {layer?.remove(); layer = null; document.removeEventListener("keydown", escKey, true); if (opener && opener !== document.body && document.contains(opener)) opener.focus?.({preventScroll: true}); opener = null;};
    const escKey = (event) => {
      if (event.key === "Tab" && layer) {
        /* aria-modal says the page behind is out of reach, so Tab stays inside the window. */
        const live = [...layer.querySelectorAll("button:not([disabled]),input,select")].filter((x) => x.offsetParent !== null);
        if (!live.length) return;
        if (!layer.contains(document.activeElement)) {event.preventDefault(); live[0].focus();}
        else if (event.shiftKey && document.activeElement === live[0]) {event.preventDefault(); live.at(-1).focus();}
        else if (!event.shiftKey && document.activeElement === live.at(-1)) {event.preventDefault(); live[0].focus();}
        return;
      }
      if (event.key === "Escape") {event.stopPropagation(); closeLayer(); st.joinOpen = false;}
    };
    const openLayer = (html) => {
      closeLayer();
      opener = document.activeElement;
      layer = document.createElement("div"); layer.className = "cm-pl cm-pl-scrim"; layer.innerHTML = html;
      document.getElementById("matrix-v2").append(layer);
      document.addEventListener("keydown", escKey, true);
      layer.addEventListener("click", (event) => {if (event.target === layer) closeLayer();});
      layer.querySelector("input,button")?.focus({preventScroll: true});
      return layer;
    };
    const toast = (text) => {
      document.querySelector(".cm-pl-toast")?.remove();
      const el = document.createElement("div"); el.className = "cm-pl cm-pl-toast"; el.setAttribute("role", "status");
      el.innerHTML = `${e(text)}<button type="button" aria-label="Dismiss">×</button>`;
      el.querySelector("button").addEventListener("click", () => el.remove());
      document.getElementById("matrix-v2").append(el); setTimeout(() => el.remove(), 6000);
    };
    const say = (text) => {st.open = null; render(); toast(text);};
    const failure = (error, what) => say(error?.status === 404 || error?.status === 405 ? `${what} is not open on this server yet.` : error?.message || `${what} did not go through.`);
    const gameOf = (id) => st.games.find((g) => g.id === id);
    const joinDialog = () => {
      const list = joinable();
      openLayer(`<div class="cm-pl-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-pl-join-title">
        <div style="display:flex;flex-direction:column;gap:4px"><h2 id="cm-pl-join-title">Join an existing game</h2><p style="color:var(--color-muted)">Pick a public lobby with an open seat, or paste the invitation a host sent you.</p></div>
        ${list.length ? `<div class="cm-pl-joinlist">${list.map((g) => `<div class="cm-pl-joinrow"><span><b>${e(g.organizer)} · ${e(g.commander)}</b><small>${g.human} human · ${g.ai} AI · ${g.open} open seat${g.open === 1 ? "" : "s"}</small></span><button type="button" class="cm-pl-btn" style="height:36px;padding:0 14px;white-space:nowrap" data-pl="join" data-game="${e(g.id)}">Request to join</button></div>`).join("")}</div>` : ""}
        <label class="cm-pl-field">Invitation link<input id="cm-play-invite" name="invitation" type="text" autocomplete="off" spellcheck="false" placeholder="Paste the full link your host sent"></label>
        <p id="cm-play-join-error" role="status" style="color:var(--color-required);min-height:0"></p>
        <div class="cm-pl-actions"><button type="button" class="cm-pl-btn" data-pl="close-layer" style="padding:0 16px">Cancel</button><button type="button" class="cm-pl-btn is-primary" data-pl="invite" style="padding:0 16px">Open invitation</button></div></div>`);
      layer.querySelector("#cm-play-invite").addEventListener("keydown", (event) => {if (event.key === "Enter") {event.preventDefault(); actions["play-join"]();}});
      layer.querySelector("#cm-play-invite").addEventListener("input", () => {document.getElementById("cm-play-join-error").textContent = "";});
    };
    const onClick = async (event) => {
      const el = event.target.closest("[data-pl]"); if (!el || !(root.contains(el) || layer?.contains(el))) return;
      const g = el.dataset.game ? gameOf(el.dataset.game) : null;
      switch (el.dataset.pl) {
        case "menu": st.open = st.open === g.id ? null : g.id; render(); break;
        case "seats": {const k = `${g.id}:${el.dataset.kind}`; st.open = st.open === k ? null : k; render(); break;}
        case "close-info": st.open = null; render(); break;
        case "sort": st.sortDir = el.dataset.key === st.sortKey ? -st.sortDir : (el.dataset.key === "name" ? 1 : -1); st.sortKey = el.dataset.key; render(); break;
        case "new": C.lounge.newGame(); break;
        case "open-join": joinDialog(); break;
        case "close-layer": closeLayer(); break;
        case "invite": actions["play-join"](); break;
        case "resume": if (st.resume) C.go("table", {id: st.resume.id}); break;
        case "join": try {await api("POST", `${tableUrl(g.id)}/request-join`, {}); closeLayer(); say(`Request sent to ${g.organizer}.`);} catch (error) {closeLayer(); failure(error, "Requesting a seat");} break;
        case "watch": try {await api("GET", `${tableUrl(g.id)}/watch`); C.go("table", {id: g.id, watch: "1"});} catch (error) {failure(error, "Watching a table");} break;
        case "logs": try {const {log} = await api("GET", `${tableUrl(g.id)}/log`); st.open = null; render(); C.modal(`Game log · ${g.organizer}'s table`, `<pre class="cm-muted" style="white-space:pre-wrap;max-height:60vh;overflow:auto">${e(Array.isArray(log) ? log.map((l) => l.text || String(l)).join("\n") : String(log || ""))}</pre><div class="cm-form-footer">${b("Close", "close", {}, true)}</div>`);} catch (error) {failure(error, "The game log");} break;
        case "quit": C.modal(`Quit ${g.organizer}'s game?`, `<p>The game ends for everyone at the table. Its record is kept.</p><div class="cm-form-footer">${b("Cancel", "close")}${b("Quit game", "play-quit-confirm", {table: g.id}, true)}</div>`); break;
        default:
      }
    };
    document.addEventListener("click", onClick, true);
    actions["play-quit-confirm"] = async (el) => {actions.close(); try {await api("POST", `${tableUrl(el.dataset.table)}/quit`, {}); await loadLive(); say("The game was ended.");} catch (error) {failure(error, "Quitting a game");}};
    /* ---- the server's answers ---- */
    const loadLive = async () => {
      try {
        const {games} = await api("GET", "/api/tables/live");
        st.games = (games || []).map(plGame); st.liveKnown = true;
      } catch {st.games = []; st.liveKnown = true;}
      if (active) {if (st.open && !st.games.some((g) => st.open.startsWith(g.id))) st.open = null; render();}
    };
    const loadBoard = async () => {
      try {const {rows} = await api("GET", "/api/leaderboard"); st.lb = Array.isArray(rows) ? rows : [];} catch {st.lb = [];}
      st.lbKnown = true; if (active) render();
    };
    const checkResume = async () => {
      const id = C.board?.live?.()?.tableId || seatKept();
      if (!id) return;
      try {
        const {table: t} = await api("GET", tableUrl(id));
        if (!active || !t.seats.some((s) => s?.you) || t.phase === "over") return;
        const mine = t.seats.find((s) => s?.you), others = t.seats.filter((s) => s && !s.you);
        const live = C.board?.live?.(), summary = live?.tableId === t.tableId ? live : null;
        const ai = others.filter((s) => s.kind === "ai").length, humans = others.length - ai;
        st.resume = {id: t.tableId, text: `${mine?.deck?.commander?.join(" + ") || "your table"}${others.length ? ` vs ${[ai ? `${ai} AI seat${ai === 1 ? "" : "s"}` : "", humans ? `${humans} player${humans === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")}` : ""}${summary?.turn ? `, turn ${summary.turn}` : ""}.`};
        render();
      } catch {/* the seat is gone: nothing to resume */}
    };
    render();
    loadLive(); loadBoard(); checkResume();
    const poll = setInterval(() => {if (active) loadLive();}, 5000);
    const tick = setInterval(() => {for (const cell of root.querySelectorAll("[data-run-start]")) cell.textContent = plRun(Math.max(0, Math.floor((clock() - Number(cell.dataset.runStart)) / 1000)));}, 1000);
    return () => {active = false; clearInterval(poll); clearInterval(tick); document.removeEventListener("click", onClick, true); closeLayer(); document.querySelector(".cm-pl-toast")?.remove();};
  };
  actions['play-leave-seat']=el=>C.modal('Leave this table?',`<p>This device will disconnect. Your seat follows the table's normal reconnect window, and its saved shortcut remains available if you want to return.</p><div class="cm-form-footer">${b('Cancel','close')}${b('Leave table','play-leave-confirm',{table:el.dataset.table},true)}</div>`);
  actions['play-leave-confirm']=async el=>{const id=el.dataset.table;C.board?.close();actions.close();await C.render();C.notice('Disconnected from the table on this device.',false,{undo:false,action:{label:'Return to table',run:()=>C.go('table',{id})}});};
  actions['play-new-table']=()=>C.lounge.newGame();
  actions['play-ai-table']=()=>C.lounge.newGame({ai: true});
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

  actions["table-back"] = (el) => C.go("table", {id: el.dataset.table});
  const settingUp=new Set();
  async function finishTableSetup(table,v){if(settingUp.has(table.tableId))return;settingUp.add(table.tableId);
    try{await api('POST',`${tableUrl(table.tableId)}/rules`,{startingLife:Number(v.startingLife),bracketLimit:v.bracketLimit?Number(v.bracketLimit):null,...(v.houseRules!==undefined?{houseRules:v.houseRules===true}:{}),...(v.privacy?{privacy:v.privacy}:{})});}
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
    return `<strong>${e(name)}</strong><span class="cm-table-deck-cmdr">${colorsOf(commanders)}<span class="cm-muted">${e(commanders.join(" + "))}</span></span><span class="cm-table-deck-about" hidden${waiting ? ` data-about-for="${e(JSON.stringify(commanders))}"` : ""}>${e(about)}</span>`;
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
    deckTitles();
  }
  /* A deck is one row, what it does said on hover (Rob, 2026-10-28): the description rides on the row's own title. */
  function deckTitles() {
    for (const row of document.querySelectorAll(".cm-table-deck")) {
      const about = row.querySelector(".cm-table-deck-about")?.textContent.trim();
      if (about) row.title = about;
    }
  }
  /* Whether the table can play a deck, said by one small mark at the row's far right (Rob, 2026-10-28): a check in a filled
     circle, green when all 100 cards are known and the deck is legal for this table, red when not, and then, to its left, how many
     cards are known. The full sentence stays on the mark's hover and for a screen reader (and in data-text). */
  const DECK_MARK = '<svg class="cm-deck-ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9.25"></circle><path d="M5.6 10.4l2.9 2.9 5.9-6.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  const deckState = (attr) => `<span class="cm-deck-state" ${attr} data-ok="pending" data-text="Checking this server…" role="img" aria-label="Checking this server…" title="Checking this server…"><span class="cm-deck-sub"></span>${DECK_MARK}</span>`;
  const setDeckState = (el, ok, text, sub = "") => {
    el.dataset.ok = ok ? "1" : "0"; el.dataset.text = text;
    el.setAttribute("aria-label", text); el.title = text;
    const note = el.querySelector(".cm-deck-sub"); if (note) note.textContent = ok ? "" : sub;
  };
  /* Compare the same expanded commander/card list submitted to the table, never a display name.
     Shared snapshots expose no canonical library source ID. Exact contents can identify an already
     available local list without conflating a different shared revision or two distinct local decks. */
  const deckContents = (d) => {
    if (!Array.isArray(d?.commander) || !d.commander.length || !Array.isArray(d.cards)
        || [...d.commander, ...d.cards].some(n => typeof n !== 'string' || !n.trim())) return null;
    const names = a => a.map(n => n.normalize('NFC').trim()).sort();
    return JSON.stringify([names(d.commander), names(d.cards)]);
  };
  function tableOnlyShared(shared, decks) {
    const local = new Set(decks.map(d => deckContents(deckForTable(d))).filter(Boolean));
    return shared.filter(d => {const contents=deckContents(d);return !contents || !local.has(contents);});
  }
  /* Default to the server-supported complete lists; an explicit device choice is remembered. */
  const ONLY_KEY = "cm-table-deck-playable";
  const onlyPlayable = () => {try {return localStorage.getItem(ONLY_KEY) !== "off";} catch {return true;}};
  document.addEventListener("change", (event) => {
    const el = event.target.closest?.("[data-table-deck-playable]");
    if (!el) return;
    try {localStorage.setItem(ONLY_KEY, el.checked ? "on" : "off");} catch {/* applied, not remembered */}
    el.closest(".cm-table-deck-choose")?.classList.toggle("is-playable-only", el.checked);
  });
  actions["table-deck"] = async (el) => {
    await C.sharingReady;
    const sharedDecks = C.sharingAvailable?.() && C.sharedDecks ? await C.sharedDecks() : [];
    let preconError = "";
    try {availablePrecons = await tablePrecons();} catch (error) {availablePrecons = []; preconError = error.message;}
    const seatId = Number(el.dataset.seat), decks = libraryDecks();
    availableSharedDecks = tableOnlyShared(sharedDecks, decks);
    const test = current && current.playtest
      ? `<li><button type="button" class="cm-table-deck" data-action="table-use-test-deck" data-seat="${seatId}"><strong>${e(TEST_DECK.name)}</strong><span class="cm-table-deck-cmdr"><span class="cm-muted">Wastes and 99 basic lands</span></span><span class="cm-table-deck-about" hidden>Wastes and 99 basic lands · for trying a game through quickly on this playtest table</span></button></li>`
      : "";
    const list = decks.length || test
      ? `<ul class="cm-table-decks">${test}${decks.map((d) => `<li><button type="button" class="cm-table-deck is-unknown" data-action="table-use-deck" data-seat="${seatId}" data-deck="${e(d.id)}">${deckLines(d.name, (d.commanders || []).map((c) => (C.card(c) || {}).name).filter(Boolean), d.notes)}${deckState(`data-known-for="${e(d.id)}"`)}</button></li>`).join("")}</ul>`
      : "";
    /* AN EMPTY LIBRARY says how to fill it (the readiness checks of 2026-10-04: a friend new to CrankMagic, invited
       before restoring the host's backup, saw only the test deck). A restore keeps this page, so the seat is still
       theirs when it is done. */
    const empty = decks.length ? "" : `<div class="cm-table-deck-empty"><p>You can play a public precon without adding anything to your library.</p><p class="cm-muted">To use your own deck later, build or import one in Decks.</p></div>`;
    const precons = `<details class="cm-table-precon-catalog" open><summary>Public precons</summary><p>Wizards' newest Commander decks, open to everyone. Choose one and play; nothing is added to your library.</p>${preconError ? `<p class="cm-note cm-warning">${e(preconError)}</p>` : `<ul class="cm-table-decks">${availablePrecons.map(d => `<li><button type="button" class="cm-table-deck" data-action="table-use-precon" data-precon="${d.id}" data-seat="${seatId}" disabled>${deckLines(d.name, d.commander, d.notes)}${deckState(`data-precon-status="${d.id}"`)}</button></li>`).join("")}</ul>`}</details>`;
    const shared = availableSharedDecks.length ? `<section aria-label="Shared with the table"><h3>Shared with the table</h3><p>Other shared lists available to your account. Choosing one does not import it or change its access.</p><ul class="cm-table-decks">${availableSharedDecks.map(d => `<li><button type="button" class="cm-table-deck" data-action="table-use-shared-deck" data-shared-deck="${d.id}" data-seat="${seatId}" disabled>${deckLines(d.name, d.commander, d.notes)}${deckState(`data-shared-status="${d.id}"`)}</button></li>`).join("")}</ul></section>` : "";
    const only = `<label class="cm-checkbox cm-table-deck-only"><input type="checkbox" data-table-deck-playable${onlyPlayable() ? " checked" : ""}>Only table-legal decks</label><p class="cm-muted">Complete lists supported by this server and within this table's bracket limit. The server checks your choice before seating it.</p>`;
    C.modal(`Choose a deck · Seat ${seatId + 1}`, `<div class="cm-table-deck-choose${onlyPlayable() ? " is-playable-only" : ""}">${only}<section aria-label="Your decks"><h3>Your decks</h3>${list}${empty}</section>${shared}${precons}</div><div id="cm-table-deck-error" class="cm-note cm-warning" hidden></div><div class="cm-form-footer">${b("Cancel", "close")}</div>`);
    deckTitles();
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
        const all = [...d.commander, ...d.cards], missing = all.filter(n => unknown.has(n));
        const bracket = rulesOf(current).bracketLimit, above = bracket && Number(d.bracket) > bracket;
        const reason = all.length !== 100 ? `Needs 100 cards · ${all.length} listed` : above ? `Above this table's bracket limit (${bracket})` : missing.length ? "Not available on this server yet" : "";
        setDeckState(status, !reason, reason || "Ready to play", above ? `Bracket limit ${bracket}` : `${all.length - missing.length} of 100 known`);
        status.closest("button").disabled = !!reason;
        if (!reason) sharedReady.add(d.id);
      }
    } catch (error) {
      for (const status of document.querySelectorAll('[data-shared-status], [data-precon-status]')) setDeckState(status, false, "Could not check this deck. Close and reopen to retry.", "Not checked");
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
      const bracket = rulesOf(current).bracketLimit, above = bracket && Number(r.deck.bracket) > bracket;
      const text = all.length !== 100 ? `Needs 100 cards · ${all.length} listed` : above ? `Above this table's bracket limit (${bracket})` : missing ? `${all.length - missing} of ${all.length} known · ${missing} to learn` : `All ${all.length} cards known`;
      setDeckState(el, !missing && all.length === 100 && !above, text, above ? `Bracket limit ${bracket}` : `${all.length - missing} of 100 known`);
      el.closest(".cm-table-deck")?.classList.toggle("is-unknown", missing > 0 || all.length !== 100 || !!above);
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
  /* What the lounge's pieces (crankmagic-lounge.js: the New game pop-up, the lobby's tour) need of this page. */
  C.tableTools = {MATS, rememberMat: (m) => {try {localStorage.setItem(MAT_KEY, m);} catch {/* this page only */}}, rememberedMat, api, tableUrl, libraryDecks, deckForTable, keepSeat, seatKept, autoDeckAI, finishTableSetup, refresh, readiness, identityOf, rulesOf, current: () => current, cloudPlay};
});
