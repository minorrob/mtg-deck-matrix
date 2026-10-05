/* PLAY IN THE CLOUD: THE BOARD (M5; the handoff's README, "Wireframes v2", Play in three views).
 *
 * While a table's game is on, the lobby (crankmagic-table.js) hands the page to this board. It holds one
 * WebSocket to the table (/api/tables/<id>/connect) and draws whatever view the room last sent: that seat's own
 * projection, never another's (game/room/room.mjs, view), and the decision it is being asked, if any. What a
 * person does goes back as the §12.1 action envelope -- {actionId, revision, kind:"answer", choiceId, ...} --
 * and the room answers with a receipt, a fresh view for everyone, or a refusal carrying the view to redraw.
 *
 * THE GAME FILLS THE WINDOW (the handoff: "the play surface is 100% of the window"). The app's rail is under it and
 * comes back from ☰; the right panel (Panel ▸) and the Coach slide OVER the surface and never narrow it.
 *
 *   the strip     one 48px line: ☰ · Turn · the step as a brass chip · n / 7 ▾ · Next · the pass (Next step · Resolve … · Pass · Draw a card) · Skip to end ·
 *                 Table | Focus | Full screen · History ▾ · Tools ▾ · Panel ▸
 *   the playmat   ONE component at four sizes (mat()): Battlefield over Lands on the left; Command over Library and
 *                 Exile over Graveyard as card-shaped frames on the right; in Focus the History band between the two
 *                 pairs; the header carries name · vitals · commander · the step ribbon on your own board
 *   Table view    four identical 16:9 boards in a 2×2 (2 · 3 / 4 · 1, you bottom right), each header on its outer
 *                 edge, sized to fit the window; the living mat and the active player's color fan behind them; the
 *                 logo at the true center opens Table vitals; your hand along the foot
 *   Focus view    your board the largest 16:9 that fits beside the 168px seat pane with the hand's slate tray a
 *                 full row beneath it, the cards whole and lifting on hover; the pane ends in My board · Table view ·
 *                 Coach, and collapses
 *   Full screen   a 44px rail; up to three opponents across the top 40%; the big board across the lower 60%, full
 *                 bleed and frameless, zones implied by where cards sit; ⟳ Rotate walks the big board round the
 *                 table (never a hand); your hand whole along its foot; the right column: every seat's vitals, the
 *                 card under the pointer large with what it can do, the log, and the Coach in its lower half. Full
 *                 screen asks the browser for the whole document, so the Coach and the dialogs are seen in it
 *   Skip to end   passes priority for you through the rest of this turn, and stops the moment anything is on the
 *                 stack or the room asks you something else
 *   vitals        a pill per seat (life, poison, a bar per commander toward 21); any pill opens Table vitals
 *   Show hand     ✋ or Space: the hand fanned over a dimmed board to contemplate; a card chosen (a click, or its
 *                 number) is held up with what it can do; Enter does it, Escape puts it back
 *   Card zoom     a card under the pointer is shown large at the center of the screen (Table, Focus); in Full
 *                 screen it fills the right column; a long press or a right click opens it with what it can do
 *   card size     the app's slider, in Tools; ⌘/Ctrl + and − step it
 *   Coach         a chat panel sliding over the right edge (in Full screen, the side column's lower half):
 *                 suggested prompts, a composer, turn dividers. The shell only, as the handoff says: its reply says it
 *                 is not switched on yet.
 *   History       the table's history (game/room/history.mjs: public lines, the same for everyone), newest first:
 *                 a drop-down from the strip with a filter (a press outside closes it), the band on the Focus mat,
 *                 a column in Full screen; a clock opens it wherever it is offered
 *   Over          who won, or that it was ended early; Back to the table; and Download the record (M8b)
 *   Away          leaving the table page does not leave the game (Rob, 2026-09-30, item 19): the board keeps its socket
 *                 and the room's last view, the rail says "Game on · Turn n · Return" on every other page, and Play
 *                 opens straight onto it. The socket stays open through the game's end -- a table takes no new socket
 *                 once its game is over, and the ended game's views still arrive -- until Back to the table closes it
 *
 * Views arrive in order with the controller's revision; an older one is ignored. A dropped socket is reopened,
 * backing off to ten seconds, and the room sends the view again the moment it is back.
 *
 * PHONES (the handoff's "Play on phones"): Focus only. A 52px icon rail (✋ with the hand's count, History, Coach,
 * Settings), your board full-bleed, a 112px seat strip (life in bold; tap to look at a board, ‹ › to go round), and
 * a pill on top: turn, step, Next, Pass, or "Viewing Maya · My board". The game surface is landscape only, with no
 * screen asking to turn the phone: held upright, the surface is turned a quarter itself. When the room asks you
 * something, the board snaps back to yours.
 */
/* TURNS THAT WENT BY (Rob, 2026-10-01). With the AI seats playing at once and a step with nothing to do passing by
   itself, a person's land drop can be followed, with no click of theirs, by the rest of their turn and every other
   player's -- and the next thing on their board is Draw a card again. The game was right (one draw and one land a
   turn, CR 504.1 and 305.2); the board did not say that three turns had gone by. When a view arrives whole turns
   after the last one this seat saw, these are those turns, from the table's public history: each turn's own line
   ("Turn 2 · Maya") and what happened in it, the steps that passed by themselves left out. Null when no whole turn
   went by -- a game with other people in it is seen as it is played. */
globalThis.CrankBoard = Object.freeze({
  turnsWentBy(was, next) {
    if (!was || !next || was.matchId !== next.matchId || !was.state || !next.state) return null;
    const from = was.state.turn, to = next.state.turn;
    if (!(to - from >= 2)) return null;
    const turns = [];
    for (let turn = from + 1; turn < to; turn += 1) {
      const lines = (next.history || []).filter((l) => l.turn === turn);
      const head = lines.find((l) => l.mark === "turn");
      const said = lines.filter((l) => !l.mark && l.text).map((l) => l.text);
      turns.push({turn, head: head ? head.text : `Turn ${turn}`, lines: said});
    }
    return {from: from + 1, to: to - 1, now: to, turns};
  },
});
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, actions} = C;
  /* The app's button, which can also be off: a choice the room would refuse is not offered. */
  const b = (label, action, data = {}, primary = false, {disabled = false, ...rest} = {}) => {
    const html = C.button(label, action, data, primary, rest);
    return disabled ? html.replace("<button ", "<button disabled ") : html;
  };
  /* An icon button: the glyph shown, the words for a reader. */
  const ib = (glyph, action, label, data = {}, {cls = "compact", disabled = false, pressed = null} = {}) =>
    `<button type="button" class="v-button ${cls}" data-action="${e(action)}" ${Object.entries(data).map(([k, v]) => `data-${k}="${e(v)}"`).join(" ")} aria-label="${e(label)}" title="${e(label)}"${pressed === null ? "" : ` aria-pressed="${pressed}"`}${disabled ? " disabled" : ""}>${glyph}</button>`;
  /* A button with a drawn glyph before its words (the app's button escapes its label, so it cannot carry one). */
  const gb = (glyph, label, action, data = {}, {cls = "compact"} = {}) =>
    `<button type="button" class="v-button ${cls} cm-board-glyphed" data-action="${e(action)}" ${Object.entries(data).map(([k, v]) => `data-${k}="${e(v)}"`).join(" ")}>${glyph}<span>${e(label)}</span></button>`;
  /* THE TWO GLYPHS, each drawn once and used in every place (Rob, 2026-09-30). The history is a clock, everywhere it
     opens: the strip's History ▾, Full screen's rail, the phone's rail, the band's own button -- never ☰, which is
     the menu. The Coach is a speech bubble with the wand in it (Part 4's recommendation, decision 21), not the ✦
     that read as another product's. */
  const CLOCK = `<svg class="cm-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const COACH = `<svg class="cm-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 2.25h10A1.75 1.75 0 0 1 14.75 4v5.75A1.75 1.75 0 0 1 13 11.5H7.25L4 14.25V11.5H3A1.75 1.75 0 0 1 1.25 9.75V4A1.75 1.75 0 0 1 3 2.25z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M4.3 9.9l4.9-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 3l.56 1.43 1.53.09-1.19.97.39 1.49-1.29-.83-1.29.83.39-1.49-1.19-.97 1.53-.09z" fill="currentColor"/></svg>`;

  /* The step ribbon: the handoff's seven, each the engine's phases it covers. */
  const STEPS = [["Untap", ["UNTAP"]], ["Upkeep", ["UPKEEP"]], ["Draw", ["DRAW"]], ["Main 1", ["MAIN1"]],
    ["Combat", ["COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS", "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END"]],
    ["Main 2", ["MAIN2"]], ["End", ["END_OF_TURN", "CLEANUP"]]];
  /* A step as the strip says it on another player's turn (item 12): "Maya's combat · you may respond". */
  const THEIR_STEP = {Untap: "untap step", Upkeep: "upkeep", Draw: "draw step", "Main 1": "first main phase", Combat: "combat", "Main 2": "second main phase", End: "end step"};
  const COMBAT_STEP = {COMBAT_BEGIN: "beginning of combat", COMBAT_DECLARE_ATTACKERS: "declare attackers", COMBAT_DECLARE_BLOCKERS: "declare blockers",
    COMBAT_FIRST_STRIKE_DAMAGE: "first-strike damage", COMBAT_DAMAGE: "combat damage", COMBAT_END: "end of combat"};
  const stepAt = (phase) => STEPS.findIndex(([, phases]) => phases.includes(phase));
  /* A seat's color is its commander's first color (the handoff's TINTS); a seat with none takes a status color. */
  const WUBRG = ["W", "U", "B", "R", "G"];
  const SEAT_COLORS = ["var(--st-reserved)", "var(--st-buy)", "var(--st-pull)", "var(--st-standin)"];
  const LOGO = "assets/crankmagic/crankmagic-logo-wand-v3-256.webp";
  const RETRY_MAX = 10000;
  /* The three views, and the one this person last chose, remembered on this device. */
  const VIEWS = [["table", "⊞", "Table"], ["focus", "◧", "Focus"], ["full", "⛶", "Full screen"]];
  const VIEW_KEY = "cm-board-view";
  let mode = (() => {try {const v = localStorage.getItem(VIEW_KEY); return VIEWS.some(([k]) => k === v) ? v : "focus";} catch {return "focus";}})();
  let selected = null, hover = null;   /* Full screen: the card shown large in the side column (picked, and under the pointer) */
  let showing = null, held = null;     /* Show hand: null, "fan" or "held"; the card held up */
  let wentBy = null;
  let historyOpen = false, historyFilter = "", menuOpen = false, stepsOpen = false, panelOpen = false, paneShut = false, alsoOpen = false;
  let skipping = null;                 /* Skip to end: the turn being skipped through, or null */
  /* The Coach: open or not, its thread ({from: "you"|"coach", text} or {divider}), and whether it is "typing". */
  const coach = {open: false, thread: [], typing: false, timer: null};
  const COACH_PROMPTS = ["What's my best play?", "Who's the threat?", "Plan my next turn", "Explain the stack"];
  const COACH_STUB = "I'm not switched on yet. When the Coach arrives, I'll read your board, your hand and the table, and answer here. For now, the History and Table vitals say what has happened.";

  let tableId = null, table = null, view = null, socket = null, status = "idle", retry = 0, retryTimer = null;
  let focus = null, picked = [], amounts = [], sending = false, tools = false, confirmEnd = false, closedByUs = false;
  const away = new Map();   /* seat number -> until, from the table and from the room's "away" frames */
  let attached = false;     /* the table page is showing the board (the board can hold a game with the page elsewhere) */
  /* THE TABLE VIEW'S TWO BARS AND THE THREE CARD SIZES (items 4-6). The bar between the rows shares the tabletop's
     height between the other seats' row and yours; the bar atop the hand tray is the hand's size, and the boards take
     what it leaves them, all alike. The Tools slider is the table's card size; the board's cards and the hand's each
     have their own, on those two bars, and moving Tools sets both to its value (Rob's rule). All of it is remembered
     on this device, as the card size is. */
  const ROWS_KEY = "cm-board-rows", ROWS = [0.3, 0.7], SCALE_KEY = {board: "cm-board-scale:board", hand: "cm-board-scale:hand"};
  const stored = (k) => {try {return localStorage.getItem(k);} catch {return null;}};
  const keep = (k, v) => {try {localStorage.setItem(k, String(v));} catch {/* applied, not remembered */}};
  const rowShare = () => {const raw = stored(ROWS_KEY), v = Number(raw); return raw !== null && v >= ROWS[0] && v <= ROWS[1] ? v : 0.5;};
  const inRange = (v) => {const [lo, hi] = C.cardScaleRange(); return Math.min(hi, Math.max(lo, Math.round(Number(v) || 100)));};
  const scaleOf = (scope) => {const v = stored(SCALE_KEY[scope]); return v === null ? C.cardScale() : inRange(v);};
  /* FOCUS AND FULL SCREEN'S DIVIDERS (items 15 and 18), remembered on the device like the rest: the seat pane's width,
     past which each tile is a miniature of that seat's board; and the share of the Panel, and of Full screen's side
     column, given to the card above its divider. */
  const PANE_KEY = "cm-board-pane", PANE = [140, 560], MINI_AT = 300;
  const SPLIT_KEY = {panel: "cm-board-split:panel", side: "cm-board-split:side"}, SPLIT = [0.2, 0.8], SPLIT_AT = {panel: 0.45, side: 0.4};
  const paneWidth = () => {const raw = stored(PANE_KEY), v = Number(raw); return raw !== null && v >= PANE[0] && v <= PANE[1] ? v : 168;};
  const splitOf = (k) => {const raw = stored(SPLIT_KEY[k]), v = Number(raw); return raw !== null && v >= SPLIT[0] && v <= SPLIT[1] ? v : SPLIT_AT[k];};
  let drag = null;          /* a bar being dragged: {kind: "rows"|"hand"|"pane"|"panel"|"side", x, y, from, per} */
  /* THE TABLE'S SOUND (B8; crankmagic-audio.js): one player for the page, armed by the first press on the board. */
  let audio = null;
  const sound = () => audio || (audio = globalThis.CrankAudio ? CrankAudio.createPlayer({storage: (() => {try {return localStorage;} catch {return null;}})()}) : null);
  const typeLineOf = (c) => {const r = c && c.name ? recordOf(c.name) : null; return (r && (r.typeLine || r.type_line)) || (c.types || []).join(" ");};

  /* ---- the socket ---- */
  function connect() {
    clearTimeout(retryTimer);
    const url = new URL(`/api/tables/${encodeURIComponent(tableId)}/connect`, location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const s = new WebSocket(url);
    socket = s; closedByUs = false; status = view ? "reconnecting" : "connecting"; draw();
    s.addEventListener("open", () => {if (socket !== s) return; retry = 0; status = "open"; draw();});
    s.addEventListener("message", (event) => {if (socket === s) receive(event.data);});
    s.addEventListener("close", () => {
      if (socket !== s || closedByUs) return;
      socket = null; status = "reconnecting"; sending = false; draw();
      retryTimer = setTimeout(connect, Math.min(RETRY_MAX, 1000 * 2 ** retry++));
    });
  }
  function disconnect() {
    closedByUs = true; clearTimeout(retryTimer);
    if (socket) try {socket.close(1000, "leaving the board");} catch {}
    socket = null; status = "idle";
  }
  function receive(data) {
    let frame;
    try {frame = JSON.parse(data);} catch {return;}
    if (frame.type === "view") adopt(frame.view);
    else if (frame.type === "receipt") {sending = false; draw();}
    else if (frame.type === "refused") {sending = false; C.notice(frame.error || "The table did not take that.", true); if (frame.view) adopt(frame.view, true); else draw();}
    else if (frame.type === "away") {const seat = Number(String(frame.seatId).slice(1)); if (frame.until) away.set(seat, frame.until); else away.delete(seat); draw();}
  }
  /* Newest wins. The room's revision counts decisions; a game ended between them keeps its revision, so an
     equal one is taken too, and a refusal's own view always is. */
  function adopt(next, force = false) {
    if (!force && view && next.revision < view.revision) return;
    const before = view && view.decision && view.decision.id, was = view;
    view = next;
    /* Whole turns went by since this seat's last view: say which, until the turn moves on or it is put away. */
    const went = globalThis.CrankBoard.turnsWentBy(was, next);
    if (went) wentBy = went;
    else if (wentBy && (next.matchId !== (was && was.matchId) || next.state.turn !== wentBy.now)) wentBy = null;
    listen(was, next);
    if (focus === null) focus = view.seat;
    /* On a phone the board you are looking at is the only one on screen: when you are asked, it is yours. */
    if (phone() && view.decision && view.decision.id !== before) focus = view.seat;
    if ((view.decision && view.decision.id) !== before) {picked = []; amounts = []; sending = false; alsoOpen = false;}
    if (selected !== null && !findCard(selected)) selected = null;
    skip();
    draw();
    fileResult(view);
  }
  /* What a view sounds like (B8): the moments between it and the last, then the bed for where the game is. Only while
     the board is on the page and the player has pressed it once; the first view of a game is history. */
  function listen(was, next) {
    const a = audio;
    if (!a || !a.isArmed() || !attached) return;
    const over = next.status === "finished" && was && was.status !== "finished" ? (next.result && next.result.winner === next.seatId ? "won" : "lost") : null;
    for (const slug of CrankAudio.momentsFor(was && was.matchId === next.matchId ? was : null, next, {seat: next.seat, typeLineOf, over})) a.play(slug);
    const bed = CrankAudio.bedFor(next, next.seat);
    if (bed) a.startBgm(bed);
  }
  /* SKIP TO END: your priority is passed for you through the rest of this turn. It stops by itself when the turn
     ends, when anything is on the stack (a spell you may want to answer), or when the room asks you something
     that is not priority -- a decision is never made for you (AGENTS.md). */
  function skip() {
    if (skipping === null) return;
    const d = view.decision;
    if (view.status === "finished" || view.state.turn !== skipping || (d && d.kind !== "priority") || view.state.stack.length) {skipping = null; return;}
    if (d && d.kind === "priority" && !sending) {
      const pass = d.options.find((o) => o.label === "Pass priority");
      if (pass) setTimeout(() => {if (skipping !== null && view.decision === d && !sending) send({indices: [pass.index]});}, 120);
    }
  }

  /* ---- the result, back to the library (M5) ----
     Once the game is over for you (it finished, someone ended it, or you left it), your own seat's result is
     filed under the deck of your library you brought, once, and syncs with your account like the rest of the
     library. Only your own seat, into your own library: a guest's game files into the guest's library, and
     nothing anyone else played ever reaches yours. A timeout or a game ended early is "unfinished" (Rob,
     2026-09-26); a concession is a loss. */
  const filed = new Set();
  function outcomeOf(v) {
    const gone = (v.departures || {})[v.seatId];
    if (gone === "conceded") return {outcome: "loss", reason: "conceded"};
    if (gone === "timed-out") return {outcome: "unfinished", reason: "ran out of time"};
    if (v.status !== "finished") return null;
    const r = v.result || {};
    if (r.endedBy !== undefined || r.reason === "ended early") return {outcome: "unfinished", reason: "ended early"};
    if (r.winner === v.seatId) return {outcome: "win", reason: r.reason || ""};
    return r.winner ? {outcome: "loss", reason: r.reason || ""} : {outcome: "draw", reason: r.reason || ""};
  }
  async function fileResult(v, tries = 0) {
    const o = outcomeOf(v), t = table;
    if (!o || !t || !v.matchId) return;
    const gameId = `game:table:${v.matchId}:${v.seatId}`;
    if (filed.has(gameId) && tries === 0) return;
    filed.add(gameId);
    if ((C.state.games || []).some((g) => g.id === gameId)) return;
    const mine = (t.seats || []).find((s) => s.you), source = mine && mine.source;
    const deck = source && (C.state.decks || []).find((d) => d.id === source.deckId && !d.archived);
    if (!deck) {
      if (source) C.notice("This game's result was not filed: the deck you brought is no longer in your library.", true);
      return;
    }
    const ai = v.seats.some((s) => s.pilot === "house");
    const opponents = (t.seats || []).filter((s) => !s.you && s.occupied !== false && s.deck)
      .map((s) => `${(s.deck.commander || []).join(" + ") || s.deck.name}${s.kind === "ai" ? " · AI" : ` · ${s.name}`}`).join("; ");
    try {
      await C.commit({type: "game", gameId, deckId: deck.id, outcome: o.outcome, playedAt: new Date().toISOString(),
        pod: v.seats.length, finish: o.outcome === "win" ? 1 : null, turns: v.state && v.state.turn ? v.state.turn : null, seat: v.seat + 1,
        opponents, notes: `Played at a CrankMagic table${ai ? " with AI seats" : ""}${o.reason ? ` · ${o.reason}` : ""}.`,
        table: {schema: "CrankMagicTableResult@1", tableId: t.tableId, matchId: v.matchId, seatId: v.seatId, ai, reason: o.reason, deckVersion: source.deckVersion}},
      {renderView: false});
      C.notice(`${o.outcome === "win" ? "Your win" : o.outcome === "loss" ? "Your loss" : o.outcome === "draw" ? "The draw" : "This unfinished game"} is filed under ${deck.name}'s record.`);
    } catch (error) {
      if (error && error.retryable && tries < 5) {setTimeout(() => fileResult(v, tries + 1), 800); return;}
      filed.delete(gameId);
      C.notice(`This game's result was not filed: ${error && error.message ? error.message : "the library did not take it"}.`, true);
    }
  }
  function send(payload) {
    if (!socket || socket.readyState !== 1) {C.notice("The board is reconnecting; try again in a moment.", true); return;}
    if (!view || !view.decision) return;
    sending = true;
    socket.send(JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, ...payload}));
    draw();
  }

  /* ---- reading the view ---- */
  const players = () => (view ? view.state.players : []);
  const seatName = (seatId) => ((view.seats.find((s) => s.seatId === seatId) || {}).name || seatId);
  const nameOf = (i) => (i === view.seat ? "You" : (players()[i] || {}).name || `Seat ${i + 1}`);
  const departed = (i) => (view.departures || {})[`s${i}`] || null;
  const visibleCards = (p) => Object.values(p.zones).flatMap((z) => z.cards);
  const commanderOf = (p) => visibleCards(p).find((c) => c.commander && c.name) || null;
  /* A commander's damage is kept under its commander key, "<owner seat>:<id>", the same in every zone (CR 903.10a is
     "over the course of the game"), so the seat is the key's own first part -- even while the card is out of sight. A
     key that is a bare object id (a view from before the key) is the visible card's. */
  const keyOf = (c) => c.commanderKey || String(c.cardId);
  function commanderSeat(key) {
    const m = /^(\d+):/.exec(String(key));
    if (m) return Number(m[1]);
    for (const p of players()) for (const zone of Object.values(p.zones)) {
      const card = zone.cards.find((c) => c.commander && keyOf(c) === String(key));
      if (card) return card.owner;
    }
    return null;
  }
  /* A card's color identity and picture: the library's own record when it has one by that name. */
  let records = null;
  /* The library holds only your own cards; everyone else's are found in the card records the app ships
     (C.catalog), so a table of other people's decks is drawn with their pictures rather than a request to Scryfall
     per card -- which a full board sends faster than Scryfall answers, and the ones it refuses draw no picture. */
  function recordOf(name) {
    if (!records) {records = new Map(); for (const c of C.cards()) if (c.name && !records.has(c.name)) records.set(c.name, c);}
    return records.get(name) || (C.catalog && C.catalog.exact(name)) || null;
  }
  const identityOf = (p) => {const c = commanderOf(p), r = c && recordOf(c.name); return WUBRG.filter((x) => ((r && r.colorIdentity) || []).includes(x));};
  /* Seats apart at a glance (the life counter's slices, the tiles, the damage bars): a seat whose commander's first
     color an earlier seat already wears takes its next, and failing all of them a status color no one has. */
  const seatColor = (i) => {
    const taken = new Set();
    for (const p of players()) {
      const own = identityOf(p).map((x) => `var(--mana-${x})`);
      const pick = own.find((c) => !taken.has(c)) || SEAT_COLORS.find((c) => !taken.has(c)) || SEAT_COLORS[p.playerId % 4];
      if (p.playerId === i) return pick;
      taken.add(pick);
    }
    return SEAT_COLORS[i % 4];
  };
  /* THE CARD BACKS (item 20): Rob's five, tan the universal one, a seat's following its color. */
  const BACKS = {W: "tan", U: "blue", B: "black", R: "red", G: "green"};
  const backOf = (i) => {const m = /--mana-([WUBRG])/.exec(seatColor(i)); return m ? BACKS[m[1]] : "tan";};
  const backStyle = (i) => `--back-img:url(assets/crankmagic/card-back-${backOf(i)}.webp)`;
  function vitals(p, {big = false, button = true} = {}) {
    const h = p.health, from = Object.entries(h.commanderDamage || {}).map(([id, n]) => ({seat: commanderSeat(id), n}));
    const danger = h.life <= 10 || h.poison >= 7 || from.some((f) => f.n >= 15);
    const bars = from.map((f) => `<i class="cm-vitals-bar" style="--fill:${Math.min(1, f.n / 21)};--seat:${f.seat === null ? SEAT_COLORS[0] : seatColor(f.seat)}" title="${e(f.seat === null ? "A commander" : nameOf(f.seat))}: ${f.n} of 21"></i>`).join("");
    const inner = `<b>${h.life}</b><span class="cm-vitals-poison">☠ ${h.poison}</span>${bars}`, cls = `cm-vitals${big ? " is-big" : ""}${danger ? " is-danger" : ""}`;
    const label = `${p.playerId === view.seat ? "You" : p.name}: ${h.life} life, ${h.poison} poison`;
    return button ? `<button type="button" class="${cls}" data-action="board-vitals" aria-label="${e(label)}; open Table vitals">${inner}</button>`
      : `<span class="${cls}" aria-label="${e(label)}">${inner}</span>`;
  }
  function pictureOf(name) {
    const r = recordOf(name);
    return (r && r.image) || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
  }
  const optionsFor = (cardId) => (view.decision ? view.decision.options.filter((o) => o.cardId === cardId) : []);
  /* A card shown to be READ -- the Panel's and Full screen's column (pick), the pop-up (peek), Card zoom (zoom) -- is
     drawn upright, a tapped one with a small Tapped mark (Rob, 2026-09-30, item 17); on the mat it lies sideways. */
  const UPRIGHT = new Set(["pick", "peek", "zoom"]);
  function card(c, {where = "mat", action = "board-card"} = {}) {
    if (!c.name) return `<div class="cm-bcard is-back" aria-label="A hidden card"></div>`;
    const opts = optionsFor(c.cardId), mine = view.decision && !sending;
    const bright = mine && opts.length > 0, chosen = opts.some((o) => picked.includes(o.index));
    const creature = c.types.includes("Creature") && c.power !== null, upright = UPRIGHT.has(where);
    const cls = ["cm-bcard", c.tapped && !upright ? "is-tapped" : "", bright ? "is-bright" : "", chosen ? "is-picked" : "", (where === "hand" || where === "fan") && mine && !bright ? "is-dim" : "", selected === c.cardId && where !== "pick" ? "is-selected" : ""].filter(Boolean).join(" ");
    const marks = [c.tapped && upright ? `<span class="cm-bcard-mark is-state">Tapped</span>` : "", c.damage ? `<span class="cm-bcard-mark">${c.damage} damage</span>` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `<span class="cm-bcard-mark">${n} ${e(k)}</span>`)].join("");
    /* Its name first, then its state as a person looking at it would say it: tapped, its power and toughness, damage
       marked, counters; then what it can do now (the accessibility pass). */
    const state = [c.tapped ? "tapped" : "", creature ? `${c.power}/${c.toughness}` : "", c.damage ? `${c.damage} damage` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `${n} ${k} counter${n === 1 ? "" : "s"}`)].filter(Boolean);
    /* What it can do, each kind once ("Cast Zap, 4 ways"), not the card's name once per target. */
    const can = [...new Set(opts.map((o) => verbFor(o)))];
    const label = `${c.name}${state.length ? ", " + state.join(", ") : ""}${bright ? `: ${can.join(" or ")}${opts.length > can.length ? `, ${opts.length} ways` : ""}` : ""}`;
    return `<button type="button" class="${cls}" data-action="${action}" data-card="${c.cardId}" aria-label="${e(label)}">
      <span class="cm-bcard-name">${e(c.name)}</span>${creature ? `<span class="cm-bcard-pt">${c.power}/${c.toughness}</span>` : ""}
      <img src="${e(pictureOf(c.name))}" alt="" loading="lazy" referrerpolicy="no-referrer">${marks ? `<span class="cm-bcard-marks">${marks}</span>` : ""}</button>`;
  }

  /* ---- the strip ---- */
  const stepInfo = () => {
    const s = view.state, at = stepAt(s.phase);
    return {at, step: at < 0 ? "Opening hands" : STEPS[at][0], detail: COMBAT_STEP[s.phase] ? ` · ${COMBAT_STEP[s.phase]}` : "",
      next: at < 0 ? "" : at + 1 < STEPS.length ? STEPS[at + 1][0] : "Next turn"};
  };
  /* What the strip says (item 12). Priority on another player's turn says whose step it is and that you may
     respond; on your own turn the button's words carry it (item 10) -- with a spell on the stack, that you may
     respond, the button naming the spell -- and the draw's button is its own words. */
  const waitingText = () => {
    const d = view.decision, s = view.state;
    if (view.status === "finished") return "The game is over.";
    if (d && sending) return "Sent…";
    if (d && d.kind === "priority") {
      const at = stepAt(s.phase);
      if (s.turnPlayerId !== view.seat && at >= 0) return `${nameOf(s.turnPlayerId)}'s ${THEIR_STEP[STEPS[at][0]]} · you may respond`;
      return s.stack.length ? "You may respond" : "";
    }
    if (d) return d.kind === "draw" ? "" : d.title;
    /* The room plays the AI seats in slices (game/room/room.mjs, `continuing`): nobody is asked until they stop. */
    if (view.continuing) return "The AI players are taking their turns…";
    return view.waitingOn ? `Waiting on ${view.waitingOn === view.seatId ? "you" : seatName(view.waitingOn)}` : "";
  };
  const canPass = () => {const d = view.decision; return !!d && d.kind === "priority" && !sending && view.status !== "finished";};
  /* ONE BUTTON THAT SAYS WHAT PASSING WILL DO (item 10): the same pass to the room, in the words for now -- Next
     step on your turn with the stack empty, Resolve and the spell's name with something on it, Pass on another
     player's turn. In the draw step of your turn it is Draw a card, and the click draws (item 13). */
  function passLabel() {
    const s = view.state, top = s.stack.length ? s.stack[s.stack.length - 1] : null;
    if (top) return top.name ? `Resolve ${top.name}` : "Let it resolve";
    return s.turnPlayerId === view.seat ? "Next step" : "Pass";
  }
  function passButton() {
    const d = view.decision;
    if (d && d.kind === "draw" && view.status !== "finished") return b("Draw a card", "board-draw", {}, true, {cls: "compact", disabled: sending});
    return b(passLabel(), "board-pass", {}, true, {cls: "compact", disabled: !canPass()});
  }
  function strip() {
    const s = view.state, turnName = s.turnPlayerId === null ? "" : nameOf(s.turnPlayerId);
    const {at, step, detail, next} = stepInfo();
    const conn = status === "open" ? "" : `<span class="cm-board-conn" role="status">${status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</span>`;
    return `<header class="cm-board-strip">
      <span class="cm-board-tools">${ib("☰", "board-menu", "Menu", {}, {pressed: menuOpen})}${menuOpen ? menu() : ""}</span>
      <span class="cm-board-turn">${s.turn ? `Turn ${s.turn} · ${e(turnName)}` : "Before turn 1"}</span>
      <span class="cm-board-step">${e(step)}${e(detail)}</span>
      <span class="cm-board-tools">${at < 0 ? "" : `<button type="button" class="cm-board-count" data-action="board-steps" aria-expanded="${stepsOpen}" aria-label="Step ${at + 1} of ${STEPS.length}; show the steps">${at + 1} / ${STEPS.length} ▾</button>`}${stepsOpen ? stepsMenu() : ""}</span>
      <span class="cm-board-prompt">${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}<span class="cm-board-waiting" role="status" aria-live="polite">${e(waitingText())}</span>${conn}</span>
      ${passButton()}
      ${b(skipping === null ? "Skip to end" : "Skipping · stop", "board-skip", {}, false, {cls: `compact${skipping === null ? "" : " is-on"}`, disabled: view.status === "finished"})}
      ${alsoButton()}
      <span class="cm-board-divider" aria-hidden="true"></span>
      ${switcher()}
      <span class="cm-board-tools">${gb(CLOCK, "History ▾", "board-history")}${historyOpen ? historyMenu() : ""}</span>
      <span class="cm-board-tools">${b("Tools ▾", "board-tools", {}, false, {cls: "compact"})}${tools ? toolsMenu() : ""}</span>
      ${b(panelOpen ? "Panel ◂" : "Panel ▸", "board-panel", {}, false, {cls: "compact"})}
    </header>`;
  }
  function switcher(icons = false) {
    return `<span class="cm-board-views" role="group" aria-label="View">${VIEWS.map(([k, icon, label]) => `<button type="button" class="v-button compact${mode === k ? " is-on" : ""}" data-action="board-view" data-view="${k}" aria-pressed="${mode === k}"${icons ? ` aria-label="${label}" title="${label}"` : ""}>${icons ? icon : `${icon} ${label}`}</button>`).join("")}</span>`;
  }
  /* ☰: the app's pages, over the game. The surface is the whole window, so the rail lives here. */
  function menu() {
    const links = [["Decks", "#decks"], ["Library", "#cards"], ["Explore", "#discover"], ["Play", "#game"], ["Settings", "#settings"]];
    return `<div class="cm-board-menu cm-board-nav" role="menu" id="cm-board-nav"><ul>${links.map(([l, h]) => `<li><a role="menuitem" href="${h}">${l}</a></li>`).join("")}</ul>
      <p class="cm-muted">The game keeps going, and your seat with it: Play, or Game on in the rail, brings you back.</p>
      <button type="button" class="v-button compact" data-action="page-help" data-help="table">Keys and help</button></div>`;
  }
  function stepsMenu() {
    const at = stepAt(view.state.phase);
    return `<div class="cm-board-menu cm-board-steps" role="dialog" aria-label="This turn's steps" id="cm-board-steps"><h3>This turn</h3>${ribbon(true, at)}<p class="cm-muted">Done steps are struck through; the current one is in brass.</p></div>`;
  }
  function toolsMenu() {
    const over = view.status === "finished", left = !!departed(view.seat);
    const end = confirmEnd
      ? `${b("End for everyone · keep the record", "board-end", {confirm: "1"}, true)}${b("Keep playing", "board-end-cancel")}`
      : b("End game", "board-end", {}, false, {disabled: over});
    const [lo, hi] = C.cardScaleRange();
    return `<div class="cm-board-menu" role="menu" id="cm-board-tools">
      <div class="cm-actions cm-board-menu-row">${gb(COACH, "Recommended actions", "board-coach", {}, {cls: ""})}${b("Table vitals", "board-vitals", {})}</div>
      <div class="cm-board-size">${C.cardScaleSlider()}<p class="cm-muted">${lo}% – ${hi}% · the table's size: it sets Board cards and Hand cards too · remembered on this device · ⌘/Ctrl + / − also work</p></div>
      ${soundMenu()}
      <p class="cm-muted">End game stops it for everyone and keeps its record. Concede leaves it to the others.</p>
      <div class="cm-actions">${end}${b("Concede", "board-concede", {}, false, {disabled: over || left})}</div></div>`;
  }

  /* The sound (B8; the pack's three ui rows): the effects and the music, each a slider, and a mute. */
  function soundMenu() {
    const a = sound();
    if (!a) return "";
    const v = a.volumes(), row = (bus, label) => `<label class="cm-board-sound"><span>${label}</span><input type="range" min="0" max="100" step="1" value="${Math.round(v[bus] * 100)}" data-board-sound="${bus}" aria-label="${label} volume" aria-valuetext="${Math.round(v[bus] * 100)}%"><output>${Math.round(v[bus] * 100)}%</output></label>`;
    return `<div class="cm-board-sounds" role="group" aria-label="Sound"><h3>Sound</h3>${row("sfx", "Effects")}${row("bgm", "Music")}${b(v.muted ? "Sound off · turn on" : "Mute", "board-mute", {}, false, {cls: `compact${v.muted ? " is-on" : ""}`})}${a.isArmed() ? "" : `<p class="cm-muted">Sound starts at your first click on the board.</p>`}</div>`;
  }
  /* ---- THE PLAYMAT, one component at four sizes ----
     focus  the Focus view's board: zone frames, labels, the History band, the step ribbon on your own board
     table  the Table view's four: the same frames at a small size, the header on the outer edge, ⤢ Focus
     full   Full screen's big board, and `opp` its opponents: full bleed, no frames, zones implied by placement
     phone  the phone's one board */
  const matOf = (i) => ((table && table.seats && table.seats[i]) || {}).mat || "felt";
  const seatLabel = (p) => (p.playerId === view.seat ? `You · ${p.name}` : p.name);
  function seatFlag(p) {
    const i = p.playerId, gone = departed(i), dropped = away.get(i);
    return gone ? (gone === "timed-out" ? "Timed out · not finished" : "Conceded")
      : p.health.status === "lost" ? "Out of the game"
      : dropped ? `Dropped · back by ${new Date(dropped).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"})}`
      : view.waitingOn === `s${i}` ? "Deciding" : view.state.turnPlayerId === i ? "● Active" : "";
  }
  function ribbon(active, at = stepAt(view.state.phase)) {
    return `<ol class="cm-board-ribbon" aria-label="Steps">${STEPS.map(([label], i) => `<li class="${!active ? "" : i < at ? "is-done" : i === at ? "is-now" : ""}">${e(label)}</li>`).join("")}</ol>`;
  }
  /* The two bars' sliders: one scope each, continuous, the value beside it (AGENTS.md: sizes are sliders). */
  function scaleSlider(scope, label) {
    const [lo, hi] = C.cardScaleRange(), v = scaleOf(scope);
    return `<label class="cm-board-scale"><span>${e(label)}</span><input type="range" min="${lo}" max="${hi}" step="1" value="${v}" data-board-scale="${scope}" aria-label="${e(label)}" aria-valuetext="${v}%"><output>${v}%</output></label>`;
  }
  const grip = (kind, label, now, [lo, hi], orient = "horizontal") => `<span class="cm-board-grip${orient === "vertical" ? " is-upright" : ""}" role="separator" aria-orientation="${orient}" tabindex="0" data-drag="${kind}" aria-label="${e(label)}" aria-valuemin="${lo}" aria-valuemax="${hi}" aria-valuenow="${now}" title="${e(label)}"></span>`;
  /* A card-shaped zone: the top card (or the back of the library, its count on it), the name and the count below. */
  function pile(label, zone, top, {back = false} = {}) {
    const face = top ? card(top) : `<div class="cm-bcard is-empty${back && zone.count ? " is-back" : ""}" aria-hidden="true">${back && zone.count ? `<b class="cm-bcard-count">${zone.count}</b>` : ""}</div>`;
    return `<figure class="cm-mat-zone cm-board-pile" data-zone="${e(label.toLowerCase())}" aria-label="${e(label)}, ${zone.count}">${face}<figcaption><em>${e(label)}</em><b>${zone.count}</b></figcaption></figure>`;
  }
  function mat(p, {size = "focus", head = "top", focusButton = false} = {}) {
    const i = p.playerId, you = i === view.seat, z = p.zones, field = z.Battlefield.cards;
    const lands = field.filter((c) => c.types.includes("Land"));
    const creatures = field.filter((c) => !c.types.includes("Land") && c.types.includes("Creature"));
    const other = field.filter((c) => !c.types.includes("Land") && !c.types.includes("Creature"));
    const group = (label, cards) => cards.length ? `<div class="cm-board-group"><h3>${e(label)} · ${cards.length}</h3><div class="cm-board-cards">${cards.map((c) => card(c)).join("")}</div></div>` : "";
    const mana = p.mana.reduce((n, m) => n + m.amount, 0);
    const bare = size === "full" || size === "opp" || size === "phone";
    const active = view.state.turnPlayerId === i;
    const header = head === "none" ? "" : `<header class="cm-mat-head cm-seatboard-head">
        <strong class="cm-mat-name">${e(seatLabel(p))}</strong>${vitals(p, {big: size === "focus"})}<span class="cm-mat-cmdr cm-muted">${e((commanderOf(p) || {}).name || "")}</span>
        ${size === "focus" && you ? ribbon(active) : ""}
        ${you ? "" : `<span class="cm-board-their-hand">${e(p.name)}'s hand · ${z.Hand.count}</span>`}
        <span class="cm-board-tile-flag">${e(seatFlag(p))}</span>
        ${focusButton ? b("⤢ Focus", "board-focus", {seat: String(i)}, false, {cls: "compact"}) : ""}</header>`;
    const body = `<div class="cm-mat-grid cm-seatboard-body">
        <div class="cm-mat-zone cm-board-field" data-zone="battlefield">${group("Creatures", creatures)}${group("Artifacts & enchantments", other)}${!creatures.length && !other.length ? `<p class="cm-board-empty">No permanents yet.</p>` : ""}<i class="cm-mat-label">Battlefield</i></div>
        <div class="cm-mat-zone cm-board-lands" data-zone="lands"><div class="cm-board-cards">${lands.map((c) => card(c)).join("")}</div><i class="cm-mat-label">Lands · ${lands.length}</i></div>
        ${you ? `<span class="cm-board-chip">${mana} mana open · land drop ${p.landsPlayed ? "used" : "1 left"}</span>` : ""}
        ${pile("Command", z.Command, z.Command.cards[0])}${pile("Exile", z.Exile, z.Exile.cards.at(-1))}
        ${size === "focus" ? historyBand(6) : ""}
        ${pile("Library", z.Library, null, {back: true})}${pile("Graveyard", z.Graveyard, z.Graveyard.cards.at(-1))}
      </div>`;
    const cls = `cm-mat ${size === "focus" ? "cm-board-mat" : "cm-seatboard"}${you ? " is-you" : ""}${head === "bottom" ? " is-bottom" : ""}${bare ? " is-bare" : ""}${active ? " is-active" : ""}`;
    return `<section class="${cls}" data-seat="${i}" data-fit="${size}" data-mat="${e(matOf(i))}" style="${backStyle(i)}" aria-label="${e(you ? "Your board" : `${p.name}'s board`)}">${head === "bottom" ? body + header : header + body}</section>`;
  }
  /* The active player's color fan, from their corner across the table (the handoff's tabletop). */
  const CORNER = {a: "tl", b: "tr", c: "bl", d: "br"};
  function areaOf(i) {
    const n = players().length, AREA = n === 2 ? ["b", "a"] : n === 3 ? ["c", "a", "b"] : ["d", "a", "b", "c"];
    return AREA[(i - view.seat + n) % n];
  }
  function fan(i) {
    const p = players()[i];
    if (!p || !C.seatArt) return "";
    const ci = identityOf(p);
    return ci.length ? `<div class="cm-board-fan" data-seat="${i}" aria-hidden="true">${C.seatArt.identityFan(ci, CORNER[areaOf(i)])}</div>` : "";
  }

  /* THE TABLE VIEW: every board at once, you at the bottom right and the others round from the top left (the
     handoff's "seats 2 · 3 / 4 · 1"). Fewer seats, fewer boards: two stack, three put you across the foot. The
     boards are 16:9 tracks sized to the window (fit()), alike in a row; the bar between the rows shares the height
     (item 4), identical boards until it is moved. At the true center, the life counter (item 9). */
  function tableView() {
    const ps = players(), n = ps.length, active = view.state.turnPlayerId;
    const bottom = n === 2 ? ["b"] : ["c", "d"];
    const boards = ps.map((p) => {const area = areaOf(p.playerId), low = bottom.includes(area); return `<div class="cm-board-slot" data-area="${area}" style="grid-area:${area};--row-w:var(${low ? "--bot-w" : "--top-w"})">${mat(p, {size: "table", head: low ? "bottom" : "top", focusButton: true})}</div>`;}).join("");
    const rows = `<div class="cm-board-rowbar">${grip("rows", "The rows' sizes: drag, or use the arrow keys", Math.round(rowShare() * 100), [ROWS[0] * 100, ROWS[1] * 100])}${scaleSlider("board", "Board cards")}</div>`;
    return `<div class="cm-board-tabletop"><div class="cm-board-table" data-seats="${n}">${active === null ? "" : fan(active)}${boards}${rows}${counter()}</div>${ask()}</div>${hand()}`;
  }
  /* THE LIFE COUNTER at the true center (item 9; wireframe 2e's counter()): a slice per seat in its color, on the side
     its board sits -- four quarters, three thirds, two halves -- its life on it, and the logo in the middle, which
     opens Table vitals. Degrees run clockwise from twelve o'clock, as a conic gradient draws them. */
  const SLICES = {4: {b: [0, 90], d: [90, 180], c: [180, 270], a: [270, 360]}, 3: {b: [0, 120], c: [120, 240], a: [240, 360]}, 2: {b: [90, 270], a: [270, 450]}};
  function counter() {
    const ps = players(), cut = SLICES[ps.length] || SLICES[4];
    const parts = ps.map((p) => ({p, at: cut[areaOf(p.playerId)]})).filter((x) => x.at).sort((x, y) => x.at[0] - y.at[0]);
    const pct = (deg) => `${Math.round(deg / 3.6 * 100) / 100}%`, tint = (p) => `color-mix(in srgb,${seatColor(p.playerId)} 78%,var(--mat-ink))`;
    /* a slice past twelve o'clock (two seats' top half) is drawn in two pieces, the first from zero */
    const stops = parts.flatMap(({p, at}) => at[1] > 360 ? [`${tint(p)} ${pct(at[0])} 100%`] : [`${tint(p)} ${pct(at[0])} ${pct(at[1])}`]);
    const over = parts.find(({at}) => at[1] > 360);
    if (over) stops.unshift(`${tint(over.p)} 0% ${pct(over.at[1] - 360)}`);
    const totals = parts.map(({p, at}) => {
      const mid = ((at[0] + at[1]) / 2) * Math.PI / 180, x = 50 + 30 * Math.sin(mid), y = 50 - 30 * Math.cos(mid);
      return `<b class="cm-board-pie-life" data-seat="${p.playerId}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">${p.health.life}</b>`;
    }).join("");
    const said = ps.map((p) => `${p.playerId === view.seat ? "You" : p.name} ${p.health.life}`).join(", ");
    return `<div class="cm-board-pie" role="group" aria-label="Life: ${e(said)}" style="background:conic-gradient(${stops.join(",")})">${totals}
      <button type="button" class="cm-board-center" data-action="board-vitals" aria-label="Table vitals"><img src="${LOGO}" alt=""></button></div>`;
  }
  /* THE FOCUS VIEW: the seat pane, then the board on the mat, the largest 16:9 that fits; the hand docked over its
     bottom edge. */
  /* A tile past MINI_AT wide is a miniature of that seat's board (item 15): the same playmat at its smallest, only to
     look at (inert), the tile's own button over it. */
  function tile(p) {
    const i = p.playerId, commander = commanderOf(p), mini = paneWidth() >= MINI_AT;
    return `<div class="cm-board-tile${mini ? " is-mini" : ""}${focus === i ? " is-focus" : ""}${i === view.seat ? " is-you" : ""}" data-seat="${i}" style="--seat:${seatColor(i)}">
      ${mini ? `<div class="cm-board-mini" inert>${mat(p, {size: "mini", head: "none"})}</div>` : ""}<button type="button" class="cm-board-tile-main" data-action="board-focus" data-seat="${i}" aria-pressed="${focus === i}">
        <span class="cm-board-tile-name">${e(seatLabel(p))}</span><span class="cm-muted">${e(commander ? commander.name : "")}</span></button>
      ${vitals(p)}<span class="cm-board-tile-flag">${e(seatFlag(p))}</span></div>`;
  }
  function focusView() {
    const p = players()[focus] || players()[view.seat];
    const pane = paneShut
      ? `<nav class="cm-board-pane is-shut" aria-label="Boards">${ib("▸", "board-pane", "Show the boards", {}, {pressed: false})}${players().map((x) => `<button type="button" class="cm-board-dot${focus === x.playerId ? " is-focus" : ""}" data-action="board-focus" data-seat="${x.playerId}" style="--seat:${seatColor(x.playerId)}" aria-label="${e(seatLabel(x))}: ${x.health.life} life" title="${e(seatLabel(x))}">${x.health.life}</button>`).join("")}</nav>`
      : `<nav class="cm-board-pane" aria-label="Boards"><div class="cm-board-pane-head"><span>Boards</span>${ib("◂", "board-pane", "Collapse the boards", {}, {pressed: true})}</div>${players().map(tile).join("")}
        ${b("My board", "board-focus", {seat: String(view.seat)}, true)}${b("⊞ Table view", "board-view", {view: "table"})}
        <button type="button" class="cm-board-coach-open" data-action="board-coach" aria-pressed="${coach.open}" aria-label="CrankMagic Coach">${COACH}Coach</button></nav>`;
    const paneGrip = paneShut ? "" : `<span class="cm-board-panegrip">${grip("pane", "The boards' width: drag, or use the arrow keys", paneWidth(), PANE, "vertical")}</span>`;
    return `<div class="cm-board-body" style="--pane-w:${paneShut ? 44 : paneWidth()}px">${pane}${paneGrip}<div class="cm-board-main"><div class="cm-board-stage">${fan(p.playerId)}${mat(p, {size: "focus"})}</div>${ask()}${hand()}</div></div>`;
  }
  /* THE FULL SCREEN VIEW: the page given to the game. A slim rail; the others across the top, the big board across
     the foot -- yours, or whichever ⟳ Rotate has walked to -- with the step, Next and Pass over it and your hand along
     its bottom edge; at the side, every seat's vitals, the card under the pointer, and the log. */
  function fullView() {
    const s = view.state, me = players()[view.seat], big = players()[focus] || me, others = players().filter((p) => p.playerId !== big.playerId);
    const {step, next} = stepInfo();
    const rail = `<nav class="cm-full-rail" aria-label="Board"><span class="cm-full-turn" title="Turn ${s.turn}">T${s.turn}</span>${switcher(true)}
      ${ib("⟳", "board-rotate", "Rotate: the next seat's board", {by: "1"})}
      <span class="cm-board-tools">${ib(CLOCK, "board-history", "History")}${historyOpen ? historyMenu() : ""}</span>
      ${ib(COACH, "board-coach", "CrankMagic Coach", {}, {pressed: coach.open})}
      <span class="cm-board-tools">${ib("⚙", "board-tools", "Tools")}${tools ? toolsMenu() : ""}</span>
      <span class="cm-board-spacer"></span>${ib("⎋", "board-view", "Leave full screen", {view: "focus"})}</nav>`;
    const pill = `<div class="cm-full-pill"><span class="cm-board-step">${e(step)}</span>${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
      <span class="cm-board-waiting" role="status" aria-live="polite">${e(waitingText())}</span>
      ${passButton()}${b(skipping === null ? "Skip to end" : "Stop skipping", "board-skip", {}, false, {cls: "compact"})}</div>`;
    /* The big board's corner: whose it is and their vitals; when it is not yours, ⟳ and My board are there too. */
    const viewing = big.playerId !== view.seat;
    const corner = `<div class="cm-full-corner${viewing ? " cm-full-viewing" : ""}">${vitals(big, {big: true})}<span class="cm-full-corner-name">${viewing ? `Viewing ${e(big.name)}` : e(seatLabel(big))}</span>
      ${viewing ? `${ib("⟳", "board-rotate", "Rotate: the next seat's board", {by: "1"})}${b("My board", "board-focus", {seat: String(view.seat)}, true, {cls: "compact"})}` : ""}</div>`;
    return `${rail}<div class="cm-full-center">
        <div class="cm-full-others" style="--cols:${Math.max(1, others.length)}">${others.map((p) => `<div class="cm-full-other" style="--seat:${seatColor(p.playerId)}">${mat(p, {size: "opp", focusButton: true})}</div>`).join("")}</div>
        <div class="cm-full-mine">${pill}${mat(big, {size: "full", head: "none"})}${corner}${viewing ? handBacks(big) : hand()}</div></div>
      <aside class="cm-full-side" aria-label="The table" style="--split:${Math.round(splitOf("side") * 100)}%"><div class="cm-full-vitals">${players().map((p) => `<div style="--seat:${seatColor(p.playerId)}"><span>${e(seatLabel(p))}</span>${vitals(p, {big: true})}</div>`).join("")}</div>
        <div id="cm-full-pick">${pickPanel()}</div>${splitBar("side")}${went()}${decision()}${stack()}${historyBand(30)}</aside>`;
  }
  function pickPanel() {
    const id = hover ?? selected, pick = id === null ? null : findCard(id);
    if (!pick || !pick.name) return `<p class="cm-full-pick-empty cm-muted">Hover a card to read it here; click one to keep it.</p>`;
    return `<section class="cm-full-pick" aria-label="${e(pick.name)}">${card(pick, {where: "pick", action: "board-zoom-open"})}<div class="cm-board-options">${optionsFor(pick.cardId).map((o) => `<button type="button" class="v-button compact primary" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${e(sayFor(o))}</button>`).join("")}</div></section>`;
  }
  function drawPick() {const el = document.getElementById("cm-full-pick"); if (el && view) el.innerHTML = pickPanel();}
  /* TABLE VITALS (the handoff's 560px dialog): every seat's life and poison, and every commander's damage to
     every other seat, "n / 21" with its bar; the commander's own seat reads "—". */
  function tableVitals() {
    const ps = players(), head = `<div role="row" class="is-head"><span role="columnheader"></span>${ps.map((p) => `<span role="columnheader">${e(p.playerId === view.seat ? "You" : p.name)}</span>`).join("")}</div>`;
    /* a heart for life, a skull and crossbones for poison, nothing for commander damage (item 9) */
    const row = (label, cells, name = "") => `<div role="row"><span role="rowheader"${name ? ` class="cm-vitals-icon" aria-label="${e(name)}" title="${e(name)}"` : ""}>${e(label)}</span>${cells.map((c) => `<span role="cell">${c}</span>`).join("")}</div>`;
    const rows = [row("♥", ps.map((p) => `<b>${p.health.life}</b>`), "Life"), row("☠", ps.map((p) => `${p.health.poison} / 10`), "Poison")];
    /* A row for each commander, not each seat: partners are two commanders, and 21 is from ONE of them (CR 903.10a). */
    const known = new Set();
    const cells = (key, seat) => ps.map((t) => {
      if (t.playerId === seat) return "—";
      const n = (t.health.commanderDamage || {})[key] || 0;
      return `${n} / 21<i class="cm-vitals-meter" style="--fill:${Math.min(1, n / 21)};--seat:${seat === null ? SEAT_COLORS[0] : seatColor(seat)}"></i>`;
    });
    for (const src of ps) {
      for (const c of visibleCards(src).filter((x) => x.commander)) {
        const key = keyOf(c);
        if (known.has(key)) continue;
        known.add(key);
        rows.push(row(`From ${c.name || `${src.name}'s commander`}`, cells(key, src.playerId)));
      }
    }
    /* A commander out of sight (in a hand or a library) still has its tally, and its key still says whose it is. */
    const unknown = [...new Set(ps.flatMap((t) => Object.keys(t.health.commanderDamage || {})))].filter((key) => !known.has(key));
    for (const key of unknown) {
      const seat = commanderSeat(key), owner = ps.find((p) => p.playerId === seat);
      rows.push(row(owner ? `From ${owner.name}'s commander, out of sight` : "From a commander out of sight", cells(key, seat)));
    }
    C.modal("Table vitals", `<div class="cm-table-vitals" role="table" aria-label="Table vitals" style="--cols:${ps.length}">${head}${rows.join("")}</div>
      <p class="cm-muted">A player loses at 0 life, at 10 poison, or at 21 combat damage from one commander.</p><div class="cm-form-footer">${b("Close", "close", {}, true)}</div>`);
  }
  /* THE HISTORY, newest first. A turn's line is a divider; the others carry the turn they happened in. */
  const lines = () => [...(view.history || [])].reverse();
  const historyRow = (l) => l.mark === "turn" ? `<li class="is-turn">${e(l.text)}</li>` : `<li${l.mark === "end" ? ' class="is-end"' : l.mark === "quiet" ? ' class="is-quiet"' : ""}><span>${e(l.text)}</span><span class="cm-history-turn">${l.turn ? `T${l.turn}` : "Start"}</span></li>`;
  const matches = (l) => !historyFilter || l.text.toLowerCase().includes(historyFilter.toLowerCase());
  function historyList() {
    return `<input type="search" class="cm-history-filter" data-board-history-filter placeholder="Search & filter by card or player…" aria-label="Filter the history" value="${e(historyFilter)}">
      <ol class="cm-history-list">${lines().map((l) => historyRow(l).replace("<li", `<li${matches(l) ? "" : " hidden"}`)).join("") || `<li class="cm-muted">Nothing has happened yet.</li>`}</ol>`;
  }
  function historyMenu() {
    return `<div class="cm-board-menu cm-board-history" role="dialog" aria-label="History" id="cm-board-history"><h3>History · newest first</h3>${historyList()}</div>`;
  }
  /* The record is there once the game is over; what it holds is the table's call, and the button says which. */
  const recordButton = () => view && view.status === "finished" ? b(table && table.playtest ? "Download the full record" : "Download your record", "board-record", {}, false, {cls: "compact"}) : "";
  function historyBand(count) {
    const recent = lines().filter((l) => l.mark !== "turn").slice(0, count);
    return `<section class="cm-mat-zone cm-board-band" data-zone="history" aria-label="History"><h3>History ${ib(CLOCK, "board-history", "Open the history")}</h3>
      <ol>${recent.map((l, k) => `<li style="--age:${k}"${l.mark === "end" ? ' class="is-end"' : l.mark === "quiet" ? ' class="is-quiet"' : ""}><span>${e(l.text)}</span></li>`).join("") || `<li class="cm-muted">Nothing yet.</li>`}</ol></section>`;
  }
  function stack() {
    const items = view.state.stack;
    if (!items.length) return "";
    return `<section class="cm-board-stack" aria-label="The stack"><h3>On the stack · ${items.length}</h3><ol>${[...items].reverse().map((s) => `<li>${e(s.name || "A face-down spell")} <span class="cm-muted">${e(nameOf(s.playerId))}</span></li>`).join("")}</ol></section>`;
  }
  /* PANEL ▸: the right panel of the handoff (Card · Tracker · History · Combat), sliding over the surface. */
  function panel() {
    if (!panelOpen) return "";
    const id = hover ?? selected, pick = id === null ? null : findCard(id);
    return `<aside class="cm-board-panel" aria-label="Panel" style="--split:${Math.round(splitOf("panel") * 100)}%"><header><h2>Panel</h2>${ib("✕", "board-panel", "Close the panel")}</header>
      <section class="cm-panel-pick">${pick && pick.name ? `<div class="cm-panel-card">${card(pick, {where: "pick", action: "board-zoom-open"})}<div class="cm-board-options">${optionsFor(pick.cardId).map((o) => `<button type="button" class="v-button compact primary" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${e(sayFor(o))}</button>`).join("")}</div></div>` : `<p class="cm-muted">Click a card on the board or in your hand to keep it here.</p>`}</section>
      ${splitBar("panel")}${stack()}
      <section class="cm-panel-history"><h3>History · newest first</h3>${historyList()}</section></aside>`;
  }

  /* THE DECISION, IN WHATEVER MODE IT COMES, over the surface where the prompt is (the handoff: "decisions sit
     with the prompt they answer"). A one-of answers on the tap; a many-of or an order collects, then Confirm;
     damage is shared out by number. The rules on each (how many, which may not repeat) are the room's; the board
     only keeps Confirm off until they can be met, and the room says no if they are not. */
  const VERB = {"play-land": "Play", cast: "Cast", "activate-mana": "Tap for mana:"};
  const verbFor = (o) => `${VERB[o.act] || ""} ${o.label}`.trim();
  /* The room's `detail` says which way an offer is -- what it is aimed at, what pays its cost, which mana -- where one
     card can be used more than one way (game/room/room.mjs offerDetails). */
  const sayFor = (o) => (o.detail ? `${verbFor(o)} ${o.detail}` : verbFor(o));
  function decision() {
    const d = view.decision;
    if (!d || view.status === "finished" || d.kind === "draw") return "";
    const opt = (o, extra = "") => `<button type="button" class="v-button compact${picked.includes(o.index) ? " is-picked" : ""}" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}${extra}>${e(o.label)}</button>`;
    let body = "", foot = "";
    if (d.kind === "priority") {
      /* Pass is the strip's; this is what else you can do, one button per kind of thing, the same land four
         times over being one "Play Forest" (tapping a card in the hand plays that very one). */
      const seen = new Map();
      for (const o of d.options) {
        if (o.act === "pass") continue;
        const key = `${o.act}|${o.label}`;
        if (seen.has(key)) seen.get(key).n += 1; else seen.set(key, {o, n: 1});
      }
      if (!seen.size) return "";
      /* A card that can be used more than one way -- a spell's targets, a cost's sacrifice, a land's colors -- asks which
         in its pop-up rather than doing the first (Rob, 2026-10-01). */
      const ways = (o) => new Set(d.options.filter((x) => x.act === o.act && x.label === o.label && x.detail).map((x) => x.detail)).size;
      body = [...seen.values()].map(({o, n}) => ways(o) > 1
        ? `<button type="button" class="v-button compact" data-action="board-choose" data-card="${o.cardId}"${sending ? " disabled" : ""}>${e(verbFor(o))} <span class="cm-muted">· ${ways(o)} ways</span></button>`
        : `<button type="button" class="v-button compact" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${e(sayFor(o))}${n > 1 ? ` <span class="cm-muted">×${n}</span>` : ""}</button>`).join("");
      return `<section class="cm-board-decision is-also" id="cm-board-decision" aria-label="What you can do"><h3>You can also</h3><div class="cm-board-options">${body}</div></section>`;
    }
    if (["one", "boolean", "index"].includes(d.mode)) body = d.options.map((o) => opt(o)).join("");
    else if (d.mode === "ack") foot = b("OK", "board-confirm", {}, true, {disabled: sending});
    else if (d.mode === "many") {
      body = d.options.map((o) => opt(o, ` aria-pressed="${picked.includes(o.index)}"`)).join("");
      const ok = picked.length >= d.min && picked.length <= d.max;
      foot = `<span class="cm-muted">${picked.length} chosen · ${d.min === d.max ? d.min : `${d.min} to ${d.max}`}</span>${b("Confirm", "board-confirm", {}, true, {disabled: !ok || sending})}`;
    } else if (d.mode === "order") {
      body = d.options.map((o) => opt(o, picked.includes(o.index) ? ` data-order="${picked.indexOf(o.index) + 1}"` : "")).join("");
      foot = `<span class="cm-muted">${picked.length ? `Order: ${picked.map((i) => e(d.options[i].label)).join(" → ")}` : "Choose them in order."}</span>${b("Reset", "board-reset", {}, false, {disabled: !picked.length})}${b("Confirm", "board-confirm", {}, true, {disabled: picked.length < d.min || picked.length > d.max || sending})}`;
    } else if (d.mode === "damage" || d.mode === "amount") {
      const total = amounts.reduce((n, v) => n + (Number(v) || 0), 0);
      body = d.options.map((o, i) => `<label class="cm-board-amount">${e(o.label)}${o.lethal ? ` <span class="cm-muted">lethal ${o.lethal}</span>` : ""}<input type="number" min="0" max="${o.max ?? d.total}" step="1" value="${amounts[i] ?? 0}" data-board-amount="${i}"></label>`).join("");
      foot = `<span class="cm-muted">${total} of ${d.total}</span>${b("Confirm", "board-confirm", {}, true, {disabled: total !== d.total || sending})}`;
    } else body = `<p class="cm-muted">This board cannot answer a "${e(d.mode)}" choice yet.</p>`;
    /* A question in the card's own words ("When this creature enters, you may search ...") is a sentence to read, not a
       heading: it is set as one (Rob, 2026-10-01: a choice is a pop-up where the player selects). */
    const sentence = String(d.title || "").length > 48;
    return `<section class="cm-board-decision" id="cm-board-decision" aria-label="${e(d.title)}"><h3${sentence ? ' class="is-sentence"' : ""}>${e(d.title)}</h3>
      <div class="cm-board-options">${body}</div>${foot ? `<div class="cm-board-decision-foot">${foot}</div>` : ""}</section>`;
  }
  /* What the room asks, and what is on the stack, floated over the surface under the strip. Priority is not
     floated: its cards are bright, and the rest is under "You can also ▾" beside the pass. */
  /* The turns that went by, over the board where the room's questions are: each turn's line and what it held, the
     newest turn now yours or named. Seven lines a turn at most; the History has the rest. */
  function went() {
    if (!wentBy || view.status === "finished") return "";
    const w = wentBy, span = w.from === w.to ? `Turn ${w.from} went by` : `Turns ${w.from}–${w.to} went by`;
    const rows = w.turns.map((t) => {
      /* The turn's line names its player, so a line that begins with that name says the rest: "drew a card". */
      const who = t.head.split(" · ")[1] || "", own = (l) => (who && l.startsWith(`${who} `) ? l.slice(who.length + 1) : l);
      const shown = t.lines.slice(0, 7).map(own), more = t.lines.length - shown.length;
      const said = shown.length ? shown.map(e).join(" · ") : "Nothing happened";
      return `<li><strong>${e(t.head)}</strong><span>${said}${more > 0 ? ` · and ${more} more in the History` : ""}</span></li>`;
    }).join("");
    const now = view.state.turnPlayerId === view.seat ? `Turn ${w.now} is yours.` : `Turn ${w.now} · ${e(nameOf(view.state.turnPlayerId))}`;
    return `<section class="cm-board-decision cm-board-went" role="status" aria-label="${e(span)}"><h3>${e(span)}</h3>
      <ol class="cm-board-went-list">${rows}</ol><div class="cm-board-decision-foot"><span class="cm-muted">${now}</span>${b("OK", "board-went-close", {}, false, {cls: "compact"})}</div></section>`;
  }
  function ask() {
    const d = view.decision, inner = `${went()}${stack()}${d && d.kind !== "priority" && d.kind !== "draw" ? decision() : ""}`;
    return inner ? `<div class="cm-board-ask">${inner}</div>` : "";
  }
  function alsoButton() {
    const d = view.decision;
    if (!d || d.kind !== "priority" || view.status === "finished") return "";
    const n = new Set(d.options.filter((o) => o.act !== "pass").map((o) => `${o.act}|${o.label}`)).size;
    if (!n) return "";
    return `<span class="cm-board-tools">${b(`You can also ▾`, "board-also", {}, false, {cls: `compact${alsoOpen ? " is-on" : ""}`})}${alsoOpen ? `<div class="cm-board-menu cm-board-also" role="dialog" aria-label="What you can do">${decision()}</div>` : ""}</span>`;
  }
  /* YOUR HAND on its slate tray (item 14): ✋ (Show hand) with the count beside it, and what is in it by type -- Land,
     Creature, Instant (any card with flash too), Other -- each as X/Y, castable now over in hand. Castable is what the
     decision offers for the card, the same fact that brightens it. */
  const HAND_TYPES = ["Land", "Creature", "Instant", "Other"];
  const handType = (c) => !c.name ? "Other" : c.types.includes("Land") ? "Land"
    : c.types.includes("Instant") || (c.keywords || []).some((k) => /^flash$/i.test(k)) ? "Instant" : c.types.includes("Creature") ? "Creature" : "Other";
  function handTypes(cards) {
    const n = Object.fromEntries(HAND_TYPES.map((k) => [k, [0, 0]])), live = view.decision && !sending;
    for (const c of cards) {const k = handType(c); n[k][1] += 1; if (live && optionsFor(c.cardId).length) n[k][0] += 1;}
    return `<ul class="cm-board-hand-types" aria-label="Castable now, of each type in your hand">${HAND_TYPES.map((k) => `<li data-type="${k}"${n[k][0] ? ' class="is-live"' : ""} aria-label="${k}: ${n[k][0]} of ${n[k][1]} castable now"><span>${k}</span><b>${n[k][0]}/${n[k][1]}</b></li>`).join("")}</ul>`;
  }
  function hand() {
    const mine = players()[view.seat];
    if (!mine) return "";
    const cards = mine.zones.Hand.cards;
    const bar = `<div class="cm-board-traybar">${grip("hand", "The hand's size: drag to resize the boards, or use the arrow keys", scaleOf("hand"), C.cardScaleRange())}${scaleSlider("hand", "Hand cards")}</div>`;
    return `<section class="cm-board-hand" aria-label="Your hand">${bar}<div class="cm-board-hand-side"><span class="cm-board-hand-head"><button type="button" class="cm-board-showhand" data-action="board-show-hand" aria-label="Show hand (Space)" title="Show hand (Space)" aria-pressed="${!!showing}">✋</button><b class="cm-board-hand-count" aria-label="${cards.length} ${cards.length === 1 ? "card" : "cards"} in your hand">${cards.length}</b></span>${handTypes(cards)}</div>
      <div class="cm-board-hand-cards cm-board-cards">${cards.map((c) => card(c, {where: "hand"})).join("")}</div></section>`;
  }
  /* ROTATED TO ANOTHER SEAT (item 20): their hand on the tray as the backs of their cards, in their color. The room
     sends another seat's hand as a count, and a count is all this draws. */
  function handBacks(p) {
    const n = p.zones.Hand.count;
    return `<section class="cm-board-hand is-backs" aria-label="${e(p.name)}'s hand, ${n} ${n === 1 ? "card" : "cards"}" style="${backStyle(p.playerId)}"><div class="cm-board-hand-side"><span class="cm-board-hand-head"><b class="cm-board-hand-count">${n}</b></span><span class="cm-board-hand-whose">${e(p.name)}'s hand</span></div>
      <div class="cm-board-hand-cards cm-board-cards">${Array.from({length: n}, () => `<div class="cm-bcard is-back" aria-hidden="true"></div>`).join("")}</div></section>`;
  }
  /* The bar under a card to read (item 18): dragged, the card takes more of the column or less, the rest below. */
  const splitBar = (k) => `<div class="cm-board-splitbar">${grip(k, "The card's share of the column: drag, or use the arrow keys", Math.round(splitOf(k) * 100), [SPLIT[0] * 100, SPLIT[1] * 100])}</div>`;
  /* SHOW HAND (the handoff's two states). Contemplate: the board dims and the hand fans in an arc, 170px cards
     turned 5° apiece, 132px apart. Held: the card chosen floats at 190px in a brass ring with what it can do,
     the rest waiting below. Nothing is done until a button (or Enter) says so. */
  const myHand = () => (players()[view.seat] ? players()[view.seat].zones.Hand.cards : []);
  function showHand() {
    if (!showing) return "";
    const cards = myHand(), n = cards.length;
    const close = `<button type="button" class="v-button compact cm-hand-close" data-action="board-hand-close" aria-label="Put the hand away">✕</button>`;
    if (showing === "held") {
      const c = cards.find((x) => x.cardId === held);
      if (!c) {showing = "fan"; return showHand();}
      const opts = optionsFor(c.cardId);
      const acts = opts.map((o, i) => `<button type="button" class="v-button${i === 0 ? " primary" : ""}" data-action="board-hand-do" data-index="${o.index}"${sending ? " disabled" : ""}>${e(sayFor(o))}${i === 0 ? " · Enter" : ""}</button>`).join("");
      return `<div class="cm-hand-show is-held" role="dialog" aria-modal="true" aria-label="${e(c.name)}, held">${close}
        <div class="cm-hand-held">${card(c, {where: "held", action: "board-hand-back"})}</div>
        <div class="cm-actions cm-hand-acts">${acts || `<span class="cm-muted">Nothing to do with it now.</span>`}${b("Back to hand", "board-hand-back")}</div>
        <div class="cm-hand-rest">${cards.filter((x) => x.cardId !== held).map((x) => card(x, {where: "rest", action: "board-hand-hold"})).join("")}</div></div>`;
    }
    const fanned = cards.map((c, k) => {const o = k - (n - 1) / 2; return `<div class="cm-hand-slot" style="--o:${o};--a:${Math.abs(o)}" data-key="${k + 1}">${card(c, {where: "fan", action: "board-hand-hold"})}<span class="cm-hand-key">${k + 1}</span></div>`;}).join("");
    return `<div class="cm-hand-show" role="dialog" aria-modal="true" aria-label="Your hand">${close}
      <header><h2>Your hand · ${n}</h2><p class="cm-muted">Hover to read · click to choose · 1–${Math.min(9, n) || 1} keys · Space or ✕ to put it away · bright = castable now</p></header>
      <div class="cm-hand-fan" style="--gaps:${Math.max(1, n - 1)}">${fanned}</div></div>`;
  }
  /* CARD ZOOM. A card under the pointer a moment is shown large at the center of the screen (Rob, 2026-09-29: the
     pop-up centered, and larger); in Full screen it fills the right column instead. A long press, or a right
     click, opens it with what can be done with it. */
  function findCard(cardId) {
    for (const p of players()) for (const c of visibleCards(p)) if (c.cardId === cardId) return c;
    return null;
  }
  function zoom(cardId) {
    const c = findCard(cardId);
    if (!c || !c.name) return;
    const opts = optionsFor(c.cardId);
    const acts = opts.map((o) => `<button type="button" class="v-button primary" data-action="board-zoom-do" data-index="${o.index}"${sending ? " disabled" : ""}>${e(sayFor(o))}</button>`).join("");
    /* More than one way to use it: the ways listed to choose from, as many as there are, above Close. */
    if (opts.length > 1) return C.modal(c.name, `<div class="cm-board-zoom is-choosing">${card(c, {where: "zoom", action: "close"})}</div><p class="cm-board-choose-say">Choose one:</p><div class="cm-board-choices" role="group" aria-label="Ways to use ${e(c.name)}">${acts}</div><div class="cm-form-footer">${b("Close", "close")}</div>`);
    C.modal(c.name, `<div class="cm-board-zoom">${card(c, {where: "zoom", action: "close"})}</div><div class="cm-form-footer">${acts}${b("Close", "close", {}, !acts)}</div>`);
  }
  let peekTimer = null;
  function peek(el) {
    clearTimeout(peekTimer);
    const old = document.getElementById("cm-board-peek");
    if (!el) {if (old) old.remove(); return;}
    peekTimer = setTimeout(() => {
      const c = findCard(Number(el.dataset.card));
      if (!c || !c.name || !document.getElementById("cm-board")) return;
      const div = old || Object.assign(document.createElement("div"), {id: "cm-board-peek", className: "cm-board-peek"});
      /* Said as well as shown: a polite status names the card, and the picture itself is not read twice. */
      div.setAttribute("role", "status");
      div.setAttribute("aria-live", "polite");
      div.innerHTML = `<span class="cm-sr-only">Showing ${e(c.name)}</span><div aria-hidden="true">${card(c, {where: "peek", action: "none"})}</div>`;
      if (!old) document.getElementById("cm-board").append(div);
    }, 350);
  }
  /* A PHONE: the shorter side of the screen at most 500px. Held upright, the surface is turned to landscape. */
  const phone = () => Math.min(innerWidth, innerHeight) <= 500;
  function phoneView() {
    const s = view.state, me = players()[view.seat], p = players()[focus] || me, mine = p.playerId === view.seat;
    const {step, next} = stepInfo();
    const icon = (glyph, action, label, extra = "") => `<button type="button" class="cm-phone-icon" data-action="${action}" aria-label="${e(label)}" title="${e(label)}">${glyph}${extra}</button>`;
    const rail = `<nav class="cm-phone-rail" aria-label="Board">
      ${icon("✋", "board-show-hand", "Your hand", `<span class="cm-phone-badge">${me.zones.Hand.count}</span>`)}
      <span class="cm-board-tools">${icon(CLOCK, "board-history", "History")}${historyOpen ? historyMenu() : ""}</span>
      ${icon(COACH, "board-coach", "CrankMagic Coach")}
      <span class="cm-board-tools">${icon("⚙", "board-tools", "Settings")}${tools ? toolsMenu() : ""}</span></nav>`;
    const pill = mine
      ? `<div class="cm-phone-pill"><b>T${s.turn}</b><span class="cm-board-step">${e(step)}</span>${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
          ${passButton()}</div>`
      : `<div class="cm-phone-pill"><span>Viewing ${e(p.name)}</span>${b("My board", "board-focus", {seat: String(view.seat)}, true, {cls: "compact"})}</div>`;
    const seats = [me, ...players().filter((x) => x.playerId !== view.seat)];
    const strip = `<aside class="cm-phone-seats" aria-label="Seats">
      ${seats.map((x) => `<button type="button" class="cm-phone-seat${x.playerId === p.playerId ? " is-focus" : ""}" data-action="board-focus" data-seat="${x.playerId}" aria-pressed="${x.playerId === p.playerId}" style="--seat:${seatColor(x.playerId)}">
        <span>${e(x.playerId === view.seat ? "You" : x.name)}</span><b>${x.health.life}</b><small>${e(seatFlag(x))}</small></button>`).join("")}
      <div class="cm-phone-rotate">${b("‹", "board-rotate", {by: "-1"}, false, {cls: "compact"})}${b("›", "board-rotate", {by: "1"}, false, {cls: "compact"})}</div></aside>`;
    return `${rail}<div class="cm-phone-center">${pill}${mat(p, {size: "phone", head: "none"})}<div class="cm-phone-ask">${went()}${decision()}${stack()}</div></div>${strip}`;
  }
  /* THE COACH (the handoff's play-coach). It lives beside the board, not inside it, so the views that arrive
     while someone types redraw the board and leave the composer, and whatever is in it, alone. */
  const stepNow = () => {const s = view.state, at = stepAt(s.phase); return s.turn ? `Turn ${s.turn} · ${at < 0 ? "Opening hands" : STEPS[at][0]}` : "Before turn 1";};
  function coachContext() {return `Sees your board, hand and the table · turn ${view && view.state.turn ? view.state.turn : 0}`;}
  function drawCoach() {
    const panelEl = document.getElementById("cm-board-coach");
    if (!panelEl) return;
    panelEl.hidden = !coach.open;
    /* In Full screen the Coach is not a slide-over: it takes the side column's lower half, under the log (item 22). */
    panelEl.classList.toggle("is-docked", mode === "full" && !phone());
    if (!coach.open) {panelEl.innerHTML = ""; return;}
    dock();
    /* A redraw keeps what the reader has in hand: the draft, its focus, and ⋯ if it is open (a rebuilt <details> is
       shut, and the Coach's reply lands on its own timer, so it would snap the menu shut under a pointer). Focus in ⋯
       stays on ⋯ or on Clear chat; once ⋯ has closed (Clear chat closes it), it goes back to ⋯. */
    const keep = panelEl.querySelector(".cm-coach-input"), more = panelEl.querySelector(".cm-coach-more"), active = document.activeElement;
    const typed = keep ? keep.value : "", focused = keep && active === keep, moreOpen = !!(more && more.open);
    const moreFocus = more && more.contains(active) ? (moreOpen && active.matches("[data-action=board-coach-clear]") ? "[data-action=board-coach-clear]" : "summary") : null;
    const bubble = (m) => m.divider ? `<li class="cm-coach-divider"><span>${e(m.divider)}</span></li>`
      : `<li class="cm-coach-msg is-${m.from}">${m.from === "coach" ? `<span class="cm-coach-avatar">${COACH}</span>` : ""}<p>${e(m.text)}</p></li>`;
    panelEl.innerHTML = `<header class="cm-coach-head"><span class="cm-coach-logo">${COACH}</span>
        <div><h2><span class="cm-coach-brand">CrankMagic </span>Coach</h2><p class="cm-muted" id="cm-coach-context">${e(coachContext())}</p></div>
        <details class="cm-coach-more"${moreOpen ? " open" : ""}><summary aria-label="More">⋯</summary><div>${b("Clear chat", "board-coach-clear")}</div></details>
        <button type="button" class="v-button compact" data-action="board-coach" aria-label="Close the Coach">✕</button></header>
      <ol class="cm-coach-thread" aria-live="polite">${coach.thread.map(bubble).join("") || `<li class="cm-coach-empty cm-muted">Ask about your board, your hand, or the table.</li>`}
        ${coach.typing ? `<li class="cm-coach-msg is-coach is-typing" aria-label="The Coach is typing"><span class="cm-coach-avatar">${COACH}</span><p><i></i><i></i><i></i></p></li>` : ""}</ol>
      <div class="cm-coach-prompts">${COACH_PROMPTS.map((q) => `<button type="button" class="v-button compact" data-action="board-coach-ask" data-q="${e(q)}">${e(q)}</button>`).join("")}</div>
      <form class="cm-coach-compose" data-coach-form><textarea class="cm-coach-input" rows="1" placeholder="Ask the coach…" aria-label="Ask the coach"></textarea>
        <button type="submit" class="cm-coach-send" aria-label="Send">➤</button></form>`;
    const input = panelEl.querySelector(".cm-coach-input");
    input.value = typed;
    if (focused) input.focus();
    else if (moreFocus) panelEl.querySelector(`.cm-coach-more ${moreFocus}`).focus();
    const thread = panelEl.querySelector(".cm-coach-thread");
    thread.scrollTop = thread.scrollHeight;
  }
  function ask_(text) {
    const q = String(text || "").trim();
    if (!q || !view) return;
    const here = stepNow(), last = [...coach.thread].reverse().find((m) => m.divider);
    if (!last || last.divider !== here) coach.thread.push({divider: here});
    coach.thread.push({from: "you", text: q});
    coach.typing = true;
    clearTimeout(coach.timer);
    coach.timer = setTimeout(() => {coach.typing = false; coach.thread.push({from: "coach", text: COACH_STUB}); drawCoach();}, 700);
    drawCoach();
  }
  function banner() {
    if (view.status === "finished") {
      const r = view.result || {}, you = r.winner === view.seatId;
      const head = r.endedBy !== undefined || r.reason === "ended early" ? "The game was ended early"
        : you ? "You won" : r.winner ? `${seatName(r.winner)} won` : "The game is over";
      const line = r.reason === "ended early" ? "Nobody lost. Its record is kept, as not finished." : r.reason ? `${r.reason[0].toUpperCase()}${r.reason.slice(1)}.` : "";
      return `<div class="cm-board-over" role="dialog" aria-modal="false" aria-labelledby="cm-board-over-title"><div class="v-panel"><h2 id="cm-board-over-title">${e(head)}</h2><p class="cm-muted">${e(line)}</p>
        <div class="cm-actions">${b("Back to the table", "board-leave", {}, true)}${recordButton()}</div></div></div>`;
    }
    const gone = departed(view.seat);
    if (gone) return `<p class="cm-board-banner" role="status">You have left this game; the others play on.</p>`;
    return "";
  }
  /* A view arrives whenever anyone acts; the history's filter keeps its focus and caret through the redraw. */
  function draw() {
    gameChip();
    const active = document.activeElement;
    const caret = active && active.matches && active.matches("[data-board-history-filter]") ? active.selectionStart : null;
    render();
    const context = document.getElementById("cm-coach-context");
    if (context && view) context.textContent = coachContext();
    if (caret === null) return;
    const filter = document.querySelector("#cm-board [data-board-history-filter]");
    if (filter) {filter.focus(); filter.setSelectionRange(caret, caret);}
  }
  /* THE RAIL SAYS A GAME IS ON, from any page but the table's (item 19): one line under the page links, back to it. */
  function gameChip() {
    let chip = document.getElementById("cm-game-on");
    if (attached || !tableId || !view) {if (chip) chip.remove(); return;}
    if (!chip) {
      const at = document.querySelector(".cm-sidebar .v-nav-track");
      if (!at) return;
      chip = Object.assign(document.createElement("a"), {id: "cm-game-on", className: "cm-game-on"});
      at.after(chip);
    }
    const over = view.status === "finished", turn = view.state && view.state.turn ? view.state.turn : 1;
    chip.href = `#table?id=${encodeURIComponent(tableId)}`;
    chip.classList.toggle("is-over", over);
    chip.innerHTML = over ? `<b>Game over</b><span>Return</span>` : `<b>Game on</b><span>Turn ${turn}</span><span>Return</span>`;
    chip.setAttribute("aria-label", over ? "Your game is over: return to the table" : `Your game is on, turn ${turn}: return to it`);
  }
  function render() {
    const host = document.getElementById("cm-board");
    if (!host) return;
    if (!view) {host.innerHTML = `<p class="cm-board-loading" role="status">${status === "reconnecting" ? "Reconnecting to the table…" : "Opening the board…"}</p>`; return;}
    if (phone()) {
      host.dataset.view = "focus";
      host.dataset.phone = innerHeight > innerWidth ? "portrait" : "landscape";
      host.innerHTML = `${phoneView()}${showHand()}${banner()}`;
      fit();
      return;
    }
    delete host.dataset.phone;
    applyScales(host);
    host.dataset.view = mode;
    host.dataset.coach = coach.open ? "open" : "shut";
    if (mode === "full") host.innerHTML = `${fullView()}${showHand()}${panel()}${banner()}`;
    else if (mode === "table") host.innerHTML = `${strip()}${tableView()}${showHand()}${panel()}${banner()}`;
    else host.innerHTML = `${strip()}${focusView()}${showHand()}${panel()}${banner()}`;
    fit();
  }

  /* ---- FITTING THE SURFACE TO THE WINDOW ----
     The boards are drawn to the room they have, measured rather than guessed at in CSS (as the lobby's table is):
     Table view's four are the largest identical 16:9 that fit the tabletop above the hand; Focus's mat the largest
     16:9 beside the pane, with the tray's overlap reserved at its foot; Full screen's cards follow the big board's
     width. Then every row of cards that would run past its zone is overlapped, cards fanning before a board ever
     scrolls or grows (the handoff, D2). */
  let fitting = false, observer = null, seaStop = null;
  /* Synchronous on purpose: a board drawn and then measured in the same instant is already at its size, so nothing
     is ever painted, or read by a test, at the fallback size for a frame. */
  function fit() {
    if (fitting) return;
    fitting = true;
    try {
      const host = document.getElementById("cm-board");
      if (!host || !view) return;
      const tbl = host.querySelector(".cm-board-table");
      if (tbl) {
        /* Each row the largest 16:9 its share of the height allows (item 4), no wider than a column; the bar and the
           life counter sit in the gap between the rows, at the true center. */
        const n = Number(tbl.dataset.seats) || 4, cols = n === 2 ? 1 : 2, gaps = getComputedStyle(tbl);
        const gx = parseFloat(gaps.columnGap) || 14, gy = parseFloat(gaps.rowGap) || 22;
        const box = tbl.getBoundingClientRect(), room = box.height - gy, col = (box.width - gx * (cols - 1)) / cols, share = rowShare();
        const widest = (part) => Math.max(160, Math.floor(Math.min(col, part * room * 16 / 9)));
        const top = widest(share), bot = widest(1 - share), used = (top + bot) * 9 / 16 + gy;
        tbl.style.setProperty("--top-w", `${top}px`);
        tbl.style.setProperty("--bot-w", `${bot}px`);
        tbl.style.setProperty("--board-w", `${Math.max(top, bot)}px`);
        tbl.style.setProperty("--grid-w", `${Math.round(Math.max(top, bot) * cols + gx * (cols - 1))}px`);
        tbl.style.setProperty("--mid-y", `${Math.round((box.height - used) / 2 + top * 9 / 16 + gy / 2)}px`);
      }
      const stage = host.querySelector(".cm-board-stage");
      if (stage) {
        /* The mat: the largest 16:9 beside the pane with the hand's tray a full row beneath it, so the hand is whole
           (Rob, 2026-09-30, item 25; the mock's tray over the mat's foot cut the cards off). The tray's card follows the
           mat's width, so the two are settled together -- measured at a guess, then at the mat that leaves it room --
           and a last step makes sure the pair fits the window, since a narrower mat never needs a taller tray. */
        const main = stage.parentElement, box = main.getBoundingClientRect(), tray = main.querySelector(":scope > .cm-board-hand"), GAP = 8;
        const widest = (trayH) => Math.max(320, Math.floor(Math.min(box.width - 16, (box.height - 8 - GAP - trayH) * 16 / 9)));
        const trayAt = (w) => {main.style.setProperty("--mat-w", `${w}px`); return tray ? tray.getBoundingClientRect().height : 0;};
        let matW = widest(0);
        for (let k = 0; k < 4; k += 1) {const next = widest(trayAt(matW)); if (Math.abs(next - matW) < 1) break; matW = next;}
        const trayH = trayAt(matW);
        if (8 + matW * 9 / 16 + GAP + trayH > box.height) {matW = widest(trayH); trayAt(matW);}
        main.style.setProperty("--mat-reserve", "0px");
        main.style.setProperty("--tray-top", `${Math.round(8 + matW * 9 / 16 + GAP)}px`);
      }
      const big = host.querySelector(".cm-full-mine");
      if (big) {
        /* The hand is whole (item 25): the tray is a full row along the big board's foot, the board keeping that much
           clear under its Lands, and its cards no taller than a third of the big board leaves room for. */
        const bigBox = big.getBoundingClientRect(), scale = scaleOf("hand") / 100;
        big.style.setProperty("--full-w", `${Math.round(bigBox.width)}px`);
        big.style.setProperty("--hc", `${Math.round(Math.min(112 * scale, Math.max(56, (bigBox.height * .36 - 22) * 5 / 7)))}px`);
        const tray = big.querySelector(":scope > .cm-board-hand"), trayH = tray ? Math.ceil(tray.getBoundingClientRect().height) : 0;
        big.style.setProperty("--tray-h", `${trayH}px`);
        /* and the board's own cards no larger than its two rows of piles can stand in what is left above the tray:
           two card-height rows (5:7, with the pad) and their captions, under the 52px the pill takes. */
        big.style.setProperty("--full-bc-max", `${Math.max(40, Math.floor((bigBox.height - 52 - trayH - 44) / 3.2))}px`);
      }
      for (const opp of host.querySelectorAll(".cm-full-other")) opp.style.setProperty("--opp-w", `${Math.round(opp.getBoundingClientRect().width)}px`);
      /* The card to read, the largest 5:7 its share of the column holds, what it can do under it (item 18). */
      for (const sec of host.querySelectorAll(".cm-panel-pick, #cm-full-pick")) {
        const box = sec.getBoundingClientRect(), opts = sec.querySelector(".cm-board-options"), room = box.height - 20 - (opts && opts.children.length ? opts.getBoundingClientRect().height + 8 : 0);
        sec.style.setProperty("--pick-w", `${Math.max(56, Math.floor(Math.min(box.width - 20, room * 5 / 7)))}px`);
      }
      overlap(host);
      dock();
      if (tbl) sea(tbl); else stopSea();
    } finally {fitting = false;}
  }
  /* The Coach docked in Full screen: over the lower half of the side column, which gives its log the upper half. */
  function dock() {
    const el = document.getElementById("cm-board-coach"), side = document.querySelector("#cm-board .cm-full-side"), host = document.getElementById("cm-board");
    if (!el) return;
    if (!side || !host || !el.classList.contains("is-docked")) {for (const k of ["--dock-x", "--dock-y", "--dock-w", "--dock-h"]) el.style.removeProperty(k); return;}
    const s = side.getBoundingClientRect(), h = host.getBoundingClientRect(), top = Math.round(s.bottom + 6);
    el.style.setProperty("--dock-x", `${Math.round(s.left)}px`);
    el.style.setProperty("--dock-y", `${top}px`);
    el.style.setProperty("--dock-w", `${Math.round(s.width)}px`);
    el.style.setProperty("--dock-h", `${Math.max(120, Math.round(h.bottom - 8 - top))}px`);
  }
  function overlap(host) {
    for (const row of host.querySelectorAll(".cm-board-cards")) {
      row.style.removeProperty("--lap");
      const kids = [...row.children];
      if (kids.length < 2) continue;
      const room = row.clientWidth, need = kids.reduce((n, k) => n + k.getBoundingClientRect().width, 0) + 6 * (kids.length - 1);
      if (need <= room) continue;
      const lap = (need - room) / (kids.length - 1) + 6;
      row.style.setProperty("--lap", `${-Math.ceil(lap)}px`);
    }
  }
  /* The mat under the Table view (the handoff: the living sea, ~45%; still for now, item 3). Every view that arrives
     redraws the table, so the one canvas is moved into the new table rather than made again, and is painted again
     only when the table's size has really changed, or the view is left. */
  let seaCanvas = null, seaSize = "", seaElement = null;
  function sea(tbl) {
    if (typeof CrankSea === "undefined") return;
    const box = tbl.getBoundingClientRect(), size = `${Math.round(box.width / 40)}x${Math.round(box.height / 40)}`;
    if (!seaCanvas || size !== seaSize) {
      stopSea();
      seaCanvas = Object.assign(document.createElement("canvas"), {className: "cm-board-sea"});
      seaCanvas.setAttribute("aria-hidden", "true");
      seaSize = size;
      /* Still, for now (item 3): one frame, of one element for the whole game, so a resize repaints the same field. */
      try {seaStop = CrankSea.startSea(seaCanvas, {width: Math.max(160, Math.round(box.width / 2)), height: Math.max(90, Math.round(box.height / 2)), opacity: .45, still: true, ...(seaElement ? {element: seaElement} : {})});} catch {seaStop = null;}
      seaElement = seaCanvas.dataset.element || seaElement;
    }
    if (seaCanvas.parentElement !== tbl) tbl.prepend(seaCanvas);
  }
  function stopSea() {if (seaStop) {try {seaStop();} catch {} seaStop = null;} if (seaCanvas) {seaCanvas.remove(); seaCanvas = null; seaSize = "";}}
  /* The board's and the hand's card sizes on the board, where the CSS reads them (--board-scale, --hand-scale). */
  function applyScales(host = document.getElementById("cm-board")) {
    if (!host) return;
    host.style.setProperty("--board-scale", String(scaleOf("board") / 100));
    host.style.setProperty("--hand-scale", String(scaleOf("hand") / 100));
  }
  function setScale(scope, v) {
    const n = inRange(v);
    keep(SCALE_KEY[scope], n);
    applyScales();
    for (const el of document.querySelectorAll(`#cm-board [data-board-scale="${scope}"]`)) {
      if (Number(el.value) !== n) el.value = String(n);
      el.setAttribute("aria-valuetext", `${n}%`);
      const out = el.parentElement.querySelector("output");
      if (out) out.textContent = `${n}%`;
    }
    const g = document.querySelector(`#cm-board [data-drag="${scope}"]`);
    if (g) g.setAttribute("aria-valuenow", String(n));
    fit();
    return n;
  }
  function setRows(v) {
    const share = Math.min(ROWS[1], Math.max(ROWS[0], Math.round(v * 1000) / 1000));
    keep(ROWS_KEY, share);
    const g = document.querySelector('#cm-board [data-drag="rows"]');
    if (g) g.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    fit();
    return share;
  }
  /* The pane's width (item 15): the tiles grow with it, and past MINI_AT turn to miniatures, so the board is redrawn
     when that line is crossed and only fitted otherwise. */
  function setPane(v) {
    const was = paneWidth() >= MINI_AT, w = Math.min(PANE[1], Math.max(PANE[0], Math.round(v)));
    keep(PANE_KEY, w);
    if (was !== (w >= MINI_AT)) {render(); refocus("pane");}
    else {
      const body = document.querySelector("#cm-board .cm-board-body");
      if (body) body.style.setProperty("--pane-w", `${w}px`);
      const g = document.querySelector('#cm-board [data-drag="pane"]');
      if (g) g.setAttribute("aria-valuenow", String(w));
      fit();
    }
    return w;
  }
  function setSplit(k, v) {
    const share = Math.min(SPLIT[1], Math.max(SPLIT[0], Math.round(v * 1000) / 1000));
    keep(SPLIT_KEY[k], share);
    const col = document.querySelector(k === "panel" ? "#cm-board .cm-board-panel" : "#cm-board .cm-full-side");
    if (col) col.style.setProperty("--split", `${Math.round(share * 100)}%`);
    const g = document.querySelector(`#cm-board [data-drag="${k}"]`);
    if (g) g.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    fit();
    return share;
  }
  /* A redraw mid-keypress keeps the grip's focus, so the arrow keys go on working. */
  function refocus(kind) {const g = document.querySelector(`#cm-board [data-drag="${kind}"]`); if (g && document.activeElement !== g && !drag) g.focus();}
  function watch() {
    if (observer || typeof ResizeObserver === "undefined") return;
    observer = new ResizeObserver(() => {if (view && document.getElementById("cm-board")) fit();});
    observer.observe(document.getElementById("cm-board"));
  }

  /* ---- what the lobby hands over ---- */
  C.board = {
    /** The table is playing (or just finished): draw the board in the page, and keep the socket open. */
    show(t) {
      if (tableId !== t.tableId) {C.board.close(); tableId = t.tableId; view = null; focus = null; away.clear();}
      attached = true;
      /* The table's list of who is away is the truth; the room's "away" frames only say it sooner. What it says
         of each seat (away, its mat) is redrawn when it changes. */
      const said = () => JSON.stringify([[...away], (table && table.seats || []).map((x) => x.mat)]);
      const before = said();
      table = t;
      away.clear();
      for (const a of t.away || []) away.set(a.seatId, a.until);
      if (!document.getElementById("cm-board")) {
        records = null;
        C.main.innerHTML = `<div class="cm-board" id="cm-board" data-view="${mode}"></div><aside class="cm-board-coach" id="cm-board-coach" aria-label="CrankMagic Coach" hidden></aside>`;
        draw();
        watch();
      } else if (said() !== before) draw();
      if (!socket && status !== "reconnecting") connect();
    },
    /** Whether the board is what this table's page should show. */
    wants(t) {return t.phase === "playing" || (t.tableId === tableId && !!view);},
    /** The table page is left, the game is not (item 19): the board's page goes, its socket and the room's last view
        stay, and the rail says a game is on. */
    detach() {
      attached = false;
      if (audio) audio.stopBgm(400);
      stopSea(); if (observer) {observer.disconnect(); observer = null;} peek(null); leaveFullscreen();
      tools = false; confirmEnd = false; historyOpen = false; menuOpen = false; stepsOpen = false; alsoOpen = false; showing = null; held = null;
      coach.open = false; clearTimeout(coach.timer); coach.typing = false;
      gameChip();
    },
    /** A game of yours that is on: {tableId, turn}, or null. Play opens it. */
    live() {return tableId && view && view.status !== "finished" ? {tableId, turn: view.state.turn} : null;},
    /** What a room view means for your record: {outcome, reason}, or null while the game goes on for you. */
    outcomeOf,
    /** The picture the board draws for a card by its name: the library's record, else the shipped card records'. */
    pictureOf,
    close() {
      attached = false;
      if (audio) audio.stopBgm(400);
      disconnect(); stopSea(); if (observer) {observer.disconnect(); observer = null;}
      document.getElementById("cm-game-on")?.remove();
      tableId = null; view = null; table = null; tools = false; confirmEnd = false; selected = null; hover = null; showing = null; held = null;
      historyOpen = false; historyFilter = ""; menuOpen = false; stepsOpen = false; panelOpen = false; skipping = null; records = null;
      coach.open = false; coach.thread = []; coach.typing = false; clearTimeout(coach.timer); peek(null); leaveFullscreen();
    },
  };

  /* ---- actions ---- */
  const tableApi = () => C.tableApi;
  function option(index) {
    const d = view.decision;
    if (!d || sending) return;
    if (["one", "boolean", "index"].includes(d.mode)) return send({indices: [index]});
    if (d.mode === "many") {
      if (picked.includes(index)) picked = picked.filter((i) => i !== index);
      else {
        const key = d.exclusiveBy && d.options[index][d.exclusiveBy];
        if (key !== undefined && key !== null) picked = picked.filter((i) => d.options[i][d.exclusiveBy] !== key);
        if (d.max === 1) picked = [];
        picked.push(index);
      }
    } else if (d.mode === "order" && !picked.includes(index)) picked.push(index);
    draw();
  }
  actions["board-option"] = (el) => option(Number(el.dataset.index));
  actions["board-card"] = (el) => {
    if (!view) return;
    const id = Number(el.dataset.card);
    /* Full screen and the Panel show a card large at the side, with what can be done with it, before anything is done. */
    if (mode === "full" && !phone()) {selected = id; hover = null; drawPick(); draw(); return;}
    if (panelOpen) {selected = id; draw();}
    if (!view.decision || sending) return;
    const opts = optionsFor(id);
    if (opts.length === 1) return option(opts[0].index);
    /* More than one way to use it -- aimed at this or that, paid with this or that -- is a pop-up to choose in. */
    if (opts.length > 1) zoom(id);
  };
  actions["board-choose"] = (el) => {alsoOpen = false; draw(); zoom(Number(el.dataset.card));};
  actions["board-zoom-open"] = (el) => zoom(Number(el.dataset.card));
  actions["board-pass"] = () => {
    const d = view && view.decision;
    if (!d || d.kind !== "priority") return;
    const pass = d.options.find((o) => o.label === "Pass priority");
    if (pass) send({indices: [pass.index]});
  };
  actions["board-went-close"] = () => {wentBy = null; draw();};
  actions["board-draw"] = () => {
    const d = view && view.decision;
    if (d && d.kind === "draw" && !sending) send({indices: [d.options[0].index]});
  };
  actions["board-mute"] = () => {const a = sound(); if (!a) return; a.setMuted(!a.volumes().muted); if (!a.volumes().muted && view) {const bed = CrankAudio.bedFor(view, view.seat); if (bed) a.startBgm(bed);} draw();};
  actions["board-skip"] = () => {
    if (!view || view.status === "finished") return;
    skipping = skipping === null ? view.state.turn : null;
    if (skipping !== null) skip();
    draw();
  };
  actions["board-confirm"] = () => {
    const d = view.decision;
    if (!d) return;
    if (d.mode === "ack") return send({indices: []});
    if (d.mode === "damage" || d.mode === "amount") return send({amounts: d.options.map((_, i) => Number(amounts[i]) || 0)});
    send({indices: picked});
  };
  actions["board-reset"] = () => {picked = []; draw();};
  actions["board-focus"] = (el) => {focus = Number(el.dataset.seat); if (mode === "table" && !phone()) setMode("focus"); else draw();};
  actions["board-rotate"] = (el) => {
    const n = players().length;
    if (!n) return;
    focus = ((focus ?? view.seat) + Number(el.dataset.by) + n) % n;
    draw();
  };
  actions["board-pane"] = () => {paneShut = !paneShut; draw();};
  actions["board-menu"] = () => {menuOpen = !menuOpen; stepsOpen = false; tools = false; historyOpen = false; alsoOpen = false; draw();};
  actions["board-also"] = () => {alsoOpen = !alsoOpen; menuOpen = false; stepsOpen = false; tools = false; historyOpen = false; draw();};
  actions["board-steps"] = () => {stepsOpen = !stepsOpen; menuOpen = false; tools = false; historyOpen = false; draw();};
  actions["board-panel"] = () => {panelOpen = !panelOpen; if (panelOpen && coach.open) {coach.open = false; drawCoach();} draw();};
  let lastPhone = null;
  addEventListener("resize", () => {
    if (!document.getElementById("cm-board") || !view) return;
    const now = phone() ? (innerHeight > innerWidth ? "portrait" : "landscape") : "no";
    if (now !== lastPhone) {lastPhone = now; draw(); if (coach.open) drawCoach();} else fit();
  });
  actions["board-vitals"] = () => {if (view) tableVitals();};
  actions["board-view"] = (el) => setMode(el.dataset.view);
  /* Full screen asks the browser for the whole screen as well, where it may; the view stands either way. It asks for
     the DOCUMENT, not the board: a browser shows only the fullscreen element's own subtree, and the Coach, the app's
     dialogs (Table vitals, Card zoom) and its notices live beside the board, so they opened unseen (item 22). */
  function setMode(next) {
    if (!VIEWS.some(([k]) => k === next)) return;
    mode = next; tools = false; confirmEnd = false; menuOpen = false; stepsOpen = false; historyOpen = false;
    /* Full screen opens on your own board (its point is your playable space); ⟳ walks round from there. */
    if (view) focus = mode === "full" ? view.seat : (focus ?? view.seat);
    try {localStorage.setItem(VIEW_KEY, mode);} catch {}
    const host = document.getElementById("cm-board");
    if (mode === "full" && host && document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (mode !== "full") leaveFullscreen();
    peek(null);
    draw();
    if (coach.open) drawCoach();
  }
  function leaveFullscreen() {if (document.fullscreenElement) document.exitFullscreen().catch(() => {});}

  /* Show hand and Card zoom. */
  actions["board-show-hand"] = () => {showing = showing ? null : "fan"; held = null; peek(null); draw();};
  actions["board-hand-close"] = () => {showing = null; held = null; draw();};
  actions["board-hand-hold"] = (el) => {held = Number(el.dataset.card); showing = "held"; draw();};
  actions["board-hand-back"] = () => {held = null; showing = "fan"; draw();};
  actions["board-hand-do"] = (el) => {const index = Number(el.dataset.index); showing = null; held = null; option(index);};
  actions["board-zoom-do"] = (el) => {actions.close(); option(Number(el.dataset.index));};
  document.addEventListener("dblclick", (event) => {if (showing === "held" && event.target.closest && event.target.closest(".cm-hand-held")) actions["board-hand-back"]();});
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse" || !document.getElementById("cm-board") || !view) return;
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (!el || el.closest(".cm-board-peek, .cm-full-pick, .cm-panel-card")) return;
    if (mode === "full" && !phone()) {const id = Number(el.dataset.card); if (id !== hover) {hover = id; drawPick();} return;}
    if (!showing) peek(el);
  });
  document.addEventListener("pointerout", (event) => {
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (!el) return;
    if (mode === "full" && !phone()) {if (hover !== null) {hover = null; drawPick();} return;}
    peek(null);
  });
  document.addEventListener("contextmenu", (event) => {
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (!el || !view) return;
    event.preventDefault(); peek(null); zoom(Number(el.dataset.card));
  });
  /* THE GESTURE (docs/plan-play-audio.md): the audio context is made and resumed inside the first press on the board,
     with nothing awaited before it, or the browser refuses to play and says nothing. The bed starts with it. */
  document.addEventListener("pointerdown", (event) => {
    if (!view || !attached || !event.isTrusted || !event.target.closest || !event.target.closest("#cm-board")) return;
    const a = sound();
    if (!a || a.isArmed()) return;
    a.arm().then((on) => {if (on && view) {const bed = CrankAudio.bedFor(view, view.seat); if (bed) a.startBgm(bed);}});
  }, true);
  let press = null;
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (!el || !view) return;
    const at = [event.clientX, event.clientY];
    press = {at, timer: setTimeout(() => {press = null; zoom(Number(el.dataset.card));}, 500)};
  });
  const unpress = (event) => {if (press && (event.type !== "pointermove" || Math.hypot(event.clientX - press.at[0], event.clientY - press.at[1]) > 10)) {clearTimeout(press.timer); press = null;}};
  for (const type of ["pointerup", "pointercancel", "pointermove"]) document.addEventListener(type, unpress);

  /* THE BOARD'S KEYS, only while it is on the page and no dialog is open: Space (show hand, when nothing that
     Space would press has the focus), 1–9 (hold that card), Enter (do the held card's first thing), Escape
     (back a step: held, fanned, a menu, the panel, full screen), ⌘/Ctrl + and − (card size). */
  document.addEventListener("keydown", (event) => {
    if (!document.getElementById("cm-board") || !view || document.querySelector("#cm-dialog[open]")) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag);
    if (event.key === "Escape" && (historyOpen || menuOpen || stepsOpen || tools)) {historyOpen = false; menuOpen = false; stepsOpen = false; tools = false; confirmEnd = false; draw(); return;}
    if (coach.open && event.target && event.target.matches && event.target.matches(".cm-coach-input") && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); event.target.form.requestSubmit(); return;
    }
    if (event.key === "Escape" && coach.open) {actions["board-coach"](); return;}
    if ((event.ctrlKey || event.metaKey) && ["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault();
      const n = C.setCardScale(C.cardScale() + (event.key === "-" || event.key === "_" ? -10 : 10));
      document.dispatchEvent(new CustomEvent("cm-card-scale", {detail: {scale: n, live: false}}));
      if (tools) draw(); else fit();
      return;
    }
    if (typing) return;
    if (event.key === " " && (!document.activeElement || document.activeElement === document.body || (showing && document.activeElement.closest(".cm-hand-show")))) {
      event.preventDefault(); actions["board-show-hand"](); return;
    }
    if (showing && /^[1-9]$/.test(event.key)) {
      const c = myHand()[Number(event.key) - 1];
      if (c) {held = c.cardId; showing = "held"; draw();}
      return;
    }
    if (showing === "held" && event.key === "Enter") {
      const first = optionsFor(held)[0];
      if (first) {event.preventDefault(); showing = null; held = null; option(first.index);}
      return;
    }
    if (event.key === "Escape") {
      if (showing === "held") {actions["board-hand-back"](); return;}
      if (showing) {actions["board-hand-close"](); return;}
      if (panelOpen) {panelOpen = false; draw(); return;}
      if (mode === "full") setMode("focus");
    }
  });
  actions["board-tools"] = () => {tools = !tools; confirmEnd = false; historyOpen = false; menuOpen = false; stepsOpen = false; draw();};
  actions["board-coach"] = () => {coach.open = !coach.open; tools = false; historyOpen = false; if (coach.open) panelOpen = false; draw(); drawCoach(); if (coach.open) document.querySelector("#cm-board-coach .cm-coach-input")?.focus();};
  actions["board-coach-ask"] = (el) => ask_(el.dataset.q);
  /* Clear chat is ⋯'s command, so doing it closes ⋯ (the redraw keeps the menu as it finds it). */
  actions["board-coach-clear"] = (el) => {coach.thread = []; coach.typing = false; clearTimeout(coach.timer); const more = el.closest(".cm-coach-more"); if (more) more.open = false; drawCoach();};
  document.addEventListener("submit", (event) => {
    if (!event.target.matches || !event.target.matches("[data-coach-form]")) return;
    event.preventDefault();
    const input = event.target.querySelector(".cm-coach-input"), q = input.value;
    input.value = ""; ask_(q);
  });
  /* HISTORY ▾ CLOSES ON A PRESS ANYWHERE OUTSIDE IT, as the app's popover menus do (item 16). The menu is taken out
     where it is rather than by a redraw, so the press that closed it still reaches whatever it was on. */
  document.addEventListener("pointerdown", (event) => {
    if (!historyOpen || !document.getElementById("cm-board")) return;
    const t = event.target;
    if (t && t.closest && (t.closest("#cm-board-history") || t.closest("[data-action=board-history]"))) return;
    historyOpen = false;
    document.getElementById("cm-board-history")?.remove();
  });
  actions["board-history"] = () => {historyOpen = !historyOpen; tools = false; menuOpen = false; stepsOpen = false; draw(); if (historyOpen) document.querySelector("#cm-board-history .cm-history-filter")?.focus();};
  actions["board-end"] = async (el) => {
    if (el.dataset.confirm !== "1") {confirmEnd = true; draw(); return;}
    confirmEnd = false; tools = false;
    await tableApi().api("POST", `${tableApi().tableUrl(tableId)}/end`);
    draw();   /* the room's own view, ended, follows on the socket */
  };
  actions["board-record"] = async () => {
    const {record} = await tableApi().api("GET", `${tableApi().tableUrl(tableId)}/record?match=${encodeURIComponent(view.matchId)}`);
    C.download(`CrankMagic-${record.matchId}-${record.kind === "full" ? "full-record" : "your-record"}.json`, JSON.stringify(record, null, 2));
    /* A download changes nothing in the library, so it offers no Undo (the result filed a moment ago is not this). */
    C.notice(record.kind === "full" ? "The full record is downloaded: its seed and decision tape play the game again." : "Your record is downloaded: your seat's view and the table's history.", false, {undo: false});
  };
  actions["board-end-cancel"] = () => {confirmEnd = false; draw();};
  actions["board-concede"] = async () => {tools = false; await tableApi().api("POST", `${tableApi().tableUrl(tableId)}/concede`); draw();};
  actions["board-leave"] = async () => {const id = tableId; C.board.close(); await tableApi().refresh(id);};
  /* The filter hides and shows the rows where they are, so typing keeps its place. */
  document.addEventListener("input", (event) => {
    if (!event.target || !event.target.matches || !event.target.matches("[data-board-history-filter]")) return;
    historyFilter = event.target.value;
    const rows = event.target.parentElement.querySelectorAll(".cm-history-list li");
    const all = lines();
    rows.forEach((row, i) => {if (all[i]) row.hidden = !matches(all[i]);});
  });
  document.addEventListener("input", (event) => {
    const i = event.target && event.target.dataset && event.target.dataset.boardAmount;
    if (i === undefined || !view || !view.decision) return;
    amounts[Number(i)] = Math.max(0, Math.floor(Number(event.target.value) || 0));
    const foot = document.querySelector("#cm-board-decision .cm-board-decision-foot");
    if (!foot) return;
    const total = amounts.reduce((n, v) => n + (Number(v) || 0), 0);
    foot.querySelector(".cm-muted").textContent = `${total} of ${view.decision.total}`;
    const confirm = foot.querySelector("[data-action=board-confirm]");
    if (confirm) confirm.disabled = total !== view.decision.total || sending;
  });
  /* The card-size slider moves the cards under the pointer: the rows are fitted again as it does. Tools (and ⌘/Ctrl
     + / −) is the table's size, and sets the board's and the hand's to its value (item 6). */
  document.addEventListener("cm-card-scale", (event) => {
    if (!view || !document.getElementById("cm-board")) return;
    const n = event.detail && event.detail.scale;
    if (n) {keep(SCALE_KEY.board, inRange(n)); keep(SCALE_KEY.hand, inRange(n));}
    applyScales();
    for (const scope of ["board", "hand"]) for (const el of document.querySelectorAll(`#cm-board [data-board-scale="${scope}"]`)) {
      el.value = String(scaleOf(scope));
      const out = el.parentElement.querySelector("output");
      if (out) out.textContent = `${scaleOf(scope)}%`;
    }
    fit();
  });
  document.addEventListener("input", (event) => {
    const el = event.target.closest && event.target.closest("#cm-board [data-board-scale]");
    if (el) setScale(el.dataset.boardScale, el.value);
    const vol = event.target.closest && event.target.closest("#cm-board [data-board-sound]");
    if (vol && sound()) {
      const n = Math.round(sound().setBusVolume(vol.dataset.boardSound, Number(vol.value) / 100) * 100);
      vol.setAttribute("aria-valuetext", `${n}%`);
      const out = vol.parentElement.querySelector("output");
      if (out) out.textContent = `${n}%`;
    }
  });
  /* THE BARS, dragged: the one between the rows moves the share; the one atop the tray grows the hand's cards by the
     height dragged (the boards shrinking alike to leave it room). Followed on the document, so a view that arrives
     mid-drag and redraws the board does not drop it. */
  document.addEventListener("pointerdown", (event) => {
    const el = event.target.closest && event.target.closest("#cm-board [data-drag]");
    if (!el || !view || event.button > 0) return;
    event.preventDefault();
    const kind = el.dataset.drag, tbl = document.querySelector("#cm-board .cm-board-table");
    if (kind === "pane") drag = {kind, x: event.clientX, from: paneWidth()};
    else if (kind === "panel" || kind === "side") {
      const col = el.closest(kind === "panel" ? ".cm-board-panel" : ".cm-full-side");
      drag = {kind, y: event.clientY, from: splitOf(kind), per: Math.max(1, col ? col.getBoundingClientRect().height : 600)};
    } else if (kind === "rows") {
      if (!tbl) return;
      const room = tbl.getBoundingClientRect().height - (parseFloat(getComputedStyle(tbl).rowGap) || 22);
      drag = {kind, y: event.clientY, from: rowShare(), per: Math.max(1, room)};
    } else {
      const c = document.querySelector("#cm-board .cm-board-hand .cm-board-hand-cards .cm-bcard"), s = scaleOf("hand");
      drag = {kind, y: event.clientY, from: s, per: Math.max(40, c ? c.getBoundingClientRect().height / (s / 100) : 104)};
    }
    document.documentElement.classList.add("cm-dragging");
  });
  document.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (drag.kind === "pane") {setPane(drag.from + event.clientX - drag.x); return;}
    const dy = event.clientY - drag.y;
    if (drag.kind === "panel" || drag.kind === "side") setSplit(drag.kind, drag.from + dy / drag.per);
    else if (drag.kind === "rows") setRows(drag.from + dy / drag.per);
    else setScale("hand", drag.from - dy / drag.per * 100);
  });
  const endDrag = () => {if (drag) {drag = null; document.documentElement.classList.remove("cm-dragging");}};
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("keydown", (event) => {
    const el = event.target.closest && event.target.closest("#cm-board [data-drag]");
    if (!el) return;
    if (el.dataset.drag === "pane") {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); setPane(paneWidth() + (event.key === "ArrowRight" ? 20 : -20)); return;
    }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const up = event.key === "ArrowUp" ? 1 : -1;
    if (el.dataset.drag === "panel" || el.dataset.drag === "side") setSplit(el.dataset.drag, splitOf(el.dataset.drag) - up * 0.02);
    else if (el.dataset.drag === "rows") setRows(rowShare() - up * 0.02);
    else setScale("hand", scaleOf("hand") + up * 5);
  });
  /* A picture that does not come leaves the card's own frame, which already names it. */
  document.addEventListener("error", (event) => {const t = event.target; if (t && t.matches && t.matches(".cm-bcard img")) t.remove();}, true);
});
