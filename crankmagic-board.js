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
 *   the strip     one 48px line: ☰ · Turn · the step as a brass chip · n / 7 ▾ · Next · the pass (Next step · Resolve … · Pass · Draw card) · Skip to end ·
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
 *                 stack or the room asks you something else. On another player's turn, Yield this turn sends the room's
 *                 turn-scoped policy (ROB-28): spells do not cancel it, required choices remain yours, and the view
 *                 acknowledges Start and Stop. Tools explains its scope.
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
globalThis.CrankBoard = Object.seal({
  /** The callouts a new view earns against the last (crankmagic-board.js, calloutsFor); set once the board is loaded. */
  calloutsFor: null,
  /** What waits to be called out once a view's callouts come (crankmagic-board.js, queueCallouts); set likewise. */
  queueCallouts: null,
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
  const ib = (glyph, action, label, data = {}, {cls = "compact", disabled = false, pressed = null, expanded = null} = {}) =>
    `<button type="button" class="v-button ${cls}" data-action="${e(action)}" ${Object.entries(data).map(([k, v]) => `data-${k}="${e(v)}"`).join(" ")} aria-label="${e(label)}" title="${e(label)}"${pressed === null ? "" : ` aria-pressed="${pressed}"`}${expanded === null ? "" : ` aria-expanded="${expanded}"`}${disabled ? " disabled" : ""}>${glyph}</button>`;
  /* A button with a drawn glyph before its words (the app's button escapes its label, so it cannot carry one). */
  const gb = (glyph, label, action, data = {}, {cls = "compact", expanded = null} = {}) =>
    `<button type="button" class="v-button ${cls} cm-board-glyphed" data-action="${e(action)}" ${Object.entries(data).map(([k, v]) => `data-${k}="${e(v)}"`).join(" ")}${expanded === null ? "" : ` aria-expanded="${expanded}"`}>${glyph}<span>${e(label)}</span></button>`;
  /* A button that opens a menu says whether it is open (WCAG 4.1.2). */
  const opens = (html, open) => html.replace("<button ", `<button aria-expanded="${!!open}" `);
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
  let stackSelected = null;
  let selected = null, hover = null;   /* Full screen: the card shown large in the side column (picked, and under the pointer) */
  let showing = null, held = null;     /* Show hand: null, "fan" or "held"; the card held up */
  /* Turns that went by while you waited: said for a few seconds, then put away by itself -- nothing to acknowledge (Rob,
     2026-10-09: "I shouldn't have to acknowledge every stage"); the History holds every line. */
  let wentBy = null, wentTimer = null;
  const WENT_MS = 6000;
  let historyOpen = false, historyFilter = "", menuOpen = false, stepsOpen = false, panelOpen = false, paneShut = false, alsoOpen = false;
  let skipping = null;                 /* Skip to end: the turn being skipped through, or null */
  let yieldPending = null, yieldReady = false; /* ROB-28: a request is not an acknowledged room policy. */
  let preferSaid = null;              /* the way of playing last told to the room: {key, revision} (prefer) */
  /* The Coach: open or not, its thread ({from: "you"|"coach", text} or {divider}), and whether it is "typing". */
  const coach = {open: false, thread: [], typing: false, asked: 0};
  const COACH_PROMPTS = ["What's my best play?", "Who's the threat?", "Plan my next turn", "Explain the stack"];
  /* THE COACH, through the AI door (X13; cloud/ai.mjs `coach`): the table builds what it sees from your seat, and it
     answers in a sentence or three. `shown` is the cards an answer's Show me lights on the board for a few seconds. */
  let coachShown = new Set(), coachShownTimer = null;

  let tableId = null, table = null, view = null, socket = null, status = "idle", retry = 0, retryTimer = null;
  let focus = null, picked = [], amounts = [], sending = false, tools = false, confirmEnd = false, closedByUs = false;
  const away = new Map();   /* seat number -> until, from the table and from the room's "away" frames */
  const awaySaid = new Map();   /* seat number -> {until, at}: the room's last "away" frame for it, and when it came */
  let attached = false;     /* the table page is showing the board (the board can hold a game with the page elsewhere) */
  /* THE TABLE VIEW'S TWO BARS AND THE THREE CARD SIZES (items 4-6). The bar between the rows shares the tabletop's
     height between the other seats' row and yours -- with two seats side by side, the width between the two boards
     (Rob, 2026-10-09) -- and the bar atop the hand tray is the hand's size. The hand never takes the boards' room (Rob,
     2026-10-09: "Card hand size should never decrease the board size. The user would just scroll down on the window to
     see the full card if it goes below the bottom"): the boards are fitted with room for a hand at the table's card
     size, and a larger hand runs on below them, the board scrolling down to it. The Tools slider is the table's card size; the board's cards and the hand's each
     have their own, on those two bars, and moving Tools sets both to its value (Rob's rule). All of it is remembered
     on this device, as the card size is. */
  /* HOLD PRIORITY AFTER A CAST (Rob, 2026-10-09: "When I play a card to the board from my hand, I don't want to have to
     click a pop-up to resolve it"). The room passes for you once you cast or activate (game/room/room.mjs,
     `passAfterCast`), so it resolves unless someone responds; holding priority instead stays your choice (CR 117.3c),
     from Tools, remembered on this device, and sent with each cast as `hold`. */
  const HOLD_KEY = "cm-board-hold";
  /* SKIP MY PRIORITY IF NO RESPONSE POSSIBLE (Rob, 2026-10-21), beside it: on unless turned off, kept on this device and
     told to the room as the way of playing `askStack` (game/room/room.mjs) -- off, you are asked whenever anything is on
     the stack, a response in hand or not. */
  const SKIP_KEY = "cm-board-skip-empty";
  const skipEmpty = () => stored(SKIP_KEY) !== "off";
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
  /* THE RIGHT PANE, DOCKED (Rob's note 10, 2026-10-11: "it should sit beside it like the left one, its width dragged
     within the same bounds"): beside the mat in Focus and the Table view, never over them, its width remembered on the
     device; its tabs are Turn Resources (note 9), Panel (the card to read, the stack, the history) and History. */
  const PANELW_KEY = "cm-board-panel-w", PANELW = [240, 560];
  const panelWidth = () => {const raw = stored(PANELW_KEY), v = Number(raw); return raw !== null && v >= PANELW[0] && v <= PANELW[1] ? v : 340;};
  let panelTab = "panel";
  const SPLIT_KEY = {panel: "cm-board-split:panel", side: "cm-board-split:side"}, SPLIT = [0.2, 0.8], SPLIT_AT = {panel: 0.45, side: 0.4};
  const paneWidth = () => {const raw = stored(PANE_KEY), v = Number(raw); return raw !== null && v >= PANE[0] && v <= PANE[1] ? v : 168;};
  const splitOf = (k) => {const raw = stored(SPLIT_KEY[k]), v = Number(raw); return raw !== null && v >= SPLIT[0] && v <= SPLIT[1] ? v : SPLIT_AT[k];};
  let stageSide = false, stageRail = false, cameraOpen = false, stageError = "";
  let paneEditing = false, paneSaving = false, profileOpen = false;
  const PANE_MODULES = [["history", "History"], ["coach", "AI Coach"], ["counter", "Counter-Intel"], ["resources", "Resources"], ["stack", "On the Stack"], ["inspect", "Card Preview"], ["table", "Table Vitals"], ["recommended", "Recommended Actions"], ["chat", "Chat"], ["actions", "Actions"]];
  const DEFAULT_MODULES = ["table", "inspect", "stack", "history", "counter"];
  // Preferences travel in the existing account library. Never apply a previous account's layout.
  function paneLayout() {
    const saved = C.state.preferences?.play?.sidePane, fallback = {left:[], right:[...DEFAULT_MODULES]};
    if (saved?.owner !== (C.signedInAs?.() || null)) return fallback;
    const raw = saved.version === 1 ? {left:[],right:saved.modules} : saved.version === 2 ? saved : fallback;
    const seen = new Set(), clean = ids => (Array.isArray(ids) ? ids : []).filter(id => {
      if (seen.has(id) || !PANE_MODULES.some(([key]) => key === id)) return false;
      seen.add(id); return true;
    });
    return {left:clean(raw.left), right:clean(raw.right)};
  }
  const paneModules = (side="right") => paneLayout()[side];
  async function savePaneModules(modules, side="right") {
    if (paneSaving) return false;
    paneSaving = true;
    try {
      const play = C.state.preferences?.play || {}, layout = Array.isArray(modules) ? {...paneLayout(), [side]:modules} : modules;
      await C.commit({type: "preferences", values: {play: {...play, sidePane: {version: 2, owner: C.signedInAs?.() || null, ...layout}}}}, {renderView: false});
      C.notice("Drawer layout saved. Signed-in layouts sync with your cloud library.");
      return true;
    } catch (error) {C.notice(`Drawer layout was not saved: ${error.message}`, true);return false;}
    finally {paneSaving = false; draw();}
  }
  /* The tabletop's cards and zoom go to 200% (Rob, 2026-10-21: "I should be able to increase card size more. It's ok if
     there's overlap. Increase the zoom to 200%"): past the fit, cards overlap and the table runs past the window's edges. */
  const CAMERA_MAX = 200;
  const camera = {cards: Math.max(70, Math.min(CAMERA_MAX, Number(stored("cm-stage-card-size-v2")) || 100)), tilt: stored("cm-board-tilt-v2") === null ? 40 : Math.max(0, Math.min(60, Number(stored("cm-board-tilt-v2")) || 0)), zoom: Math.max(60, Math.min(CAMERA_MAX, Number(stored("cm-board-zoom-v2")) || 100))};
  const stageEnabled = () => mode === "full" && !phone();
  const moduleSide = id => !phone() ? ["left","right"].find(side => paneModules(side).includes(id)) : undefined;
  const openModuleDrawer = id => {const side=moduleSide(id); if(side === "left") stageRail=true; if(side === "right") stageSide=true;};
  const handStarts = new Map();
  const appearance = {background: stored("cm-stage-background") || "volcano", table: stored("cm-stage-table") || ""};
  /* The table design: a saved id, an older one (wooden, stone, obsidian) or none, resolved through the catalog (ROB-100). */
  const tableDesignId = (id) => (globalThis.CrankStage ? CrankStage.tableDesign(id).id : id);
  let blockSelected = null, blockPending = null, blockResult = null, blockListOpen = false, blockEpoch = 0;
  // One check in flight: checked echoes the choice ID, but not a draft/request ID.
  const blocking = () => view?.status !== "finished" && view?.decision?.mode === "many" && Array.isArray(view.decision.legalBlocks);
  const blockContext = () => blocking() ? JSON.stringify([view.matchId, view.revision, view.decision.id, view.decision.options, view.decision.legalBlocks]) : null;
  const blockKey = () => JSON.stringify([blockContext(), picked]);
  const blockValid = () => blocking() && blockResult?.key === blockKey() && blockResult.ok && blockResult.open && socket?.readyState === 1;
  function checkBlocks() {
    if (!blocking() || blockPending || blockResult?.key === blockKey() || socket?.readyState !== 1) return;
    blockPending = {key: blockKey(), choiceId: view.decision.id};
    socket.send(JSON.stringify({type: "check", choiceId: view.decision.id, indices: [...picked]}));
  }
  function checkedBlocks(frame) {
    if (!blockPending || (frame.choiceId !== undefined && frame.choiceId !== blockPending.choiceId)) return;
    const pending = blockPending; blockPending = null;
    if (pending.key === blockKey()) blockResult = {key: pending.key, ok: frame.ok === true, open: frame.open === true,
      reasons: frame.reasons || [frame.error || "The table could not check these blocks. Try again."]};
    checkBlocks(); draw();
  }
  function draftBlock(index) {
    if (!blocking() || sending) return;
    const o = view.decision.options.find(o => o.index === index);
    if (!o || !view.decision.legalBlocks.some(b => b.blocker === o.cardId && b.attackers.includes(o.attackerId))) return;
    picked = picked.includes(index) ? picked.filter(i => i !== index) : [...picked, index];
    blockResult = null; checkBlocks(); draw();
  }
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
    blockPending = null; blockResult = null;
    socket = s; closedByUs = false; yieldReady = false; status = view ? "reconnecting" : "connecting"; draw();
    s.addEventListener("open", () => {if (socket !== s) return; retry = 0; status = "open"; draw();});
    s.addEventListener("message", (event) => {if (socket === s) receive(event.data);});
    s.addEventListener("close", () => {
      if (socket !== s || closedByUs) return;
      socket = null; status = "reconnecting"; sending = false; yieldPending = null; yieldReady = false; draw();
      retryTimer = setTimeout(connect, Math.min(RETRY_MAX, 1000 * 2 ** retry++));
    });
  }
  function disconnect() {
    closedByUs = true; clearTimeout(retryTimer);
    if (socket) try {socket.close(1000, "leaving the board");} catch {}
    socket = null; status = "idle"; yieldPending = null; yieldReady = false;
  }
  /* What a room's "away" frame says of a seat: dropped, and back by when; or not away (null). */
  function heard(seat, until) {if (until) away.set(seat, until); else away.delete(seat);}
  function receive(data) {
    let frame;
    try {frame = JSON.parse(data);} catch {return;}
    if (frame.type === "view") adopt(frame.view);
    else if (frame.type === "checked" || (frame.type === "refused" && frame.of === "check")) checkedBlocks(frame);
    else if (frame.type === "receipt") {sending = false; draw();}
    /* A way of playing the room did not take (the AI seats were playing on) is sent again once the game moves (prefer). */
    else if (frame.type === "refused" && frame.of === "prefer") {if (frame.view) adopt(frame.view, true);}
    else if (frame.type === "refused") {sending = false; if (frame.of === "yield") yieldPending = null; C.notice(frame.error || "The table did not take that.", true); if (frame.view) adopt(frame.view, true); else draw();}
    else if (frame.type === "away") {const seat = Number(String(frame.seatId).slice(1)); awaySaid.set(seat, {until: frame.until, at: performance.now()}); heard(seat, frame.until); draw();}
  }
  /* Newest wins. The room's revision counts decisions; a game ended between them keeps its revision, so an
     equal one is taken too, and a refusal's own view always is. */
  function adopt(next, force = false) {
    if (!force && view && next.revision < view.revision) return;
    const before = view && view.decision && view.decision.id, was = view, priorBlocks = blockContext();
    view = next;
    yieldReady = true;
    if (yieldPending && (next.matchId !== yieldPending.matchId || next.state.turn !== yieldPending.turn ||
        next.status === "finished" || (next.yielding === true) === yieldPending.on)) yieldPending = null;
    /* Whole turns went by since this seat's last view: say which, until the turn moves on or it is put away. */
    const went = globalThis.CrankBoard.turnsWentBy(was, next);
    if (went) {
      wentBy = went;
      clearTimeout(wentTimer);
      wentTimer = setTimeout(() => {if (wentBy === went) {wentBy = null; draw();}}, WENT_MS);
    } else if (wentBy && (next.matchId !== (was && was.matchId) || next.state.turn !== wentBy.now)) wentBy = null;
    listen(was, next);
    motionFor = was && was.matchId === next.matchId && next.revision > was.revision ? next.revision : null;
    if (was && was.matchId === next.matchId && was.state.turnPlayerId !== next.state.turnPlayerId) turnLit = performance.now();
    if (motionFor !== null && attached) callouts(calloutsFor(was, next));
    plays(was, next);
    if (focus === null) focus = view.seat;
    /* On a phone the board you are looking at is the only one on screen: when you are asked, it is yours. */
    if (phone() && view.decision && view.decision.id !== before) focus = view.seat;
    if ((view.decision && view.decision.id) !== before) {picked = []; amounts = []; sending = false; alsoOpen = false; if(view.decision) openModuleDrawer("actions");}
    if (priorBlocks !== blockContext()) {blockEpoch++; picked = []; blockSelected = null; blockResult = null; blockListOpen = false;}
    checkBlocks();
    if (selected !== null && !findCard(selected)) selected = null;
    skip();
    draw();
    fileResult(view);
    prefer();
  }
  /* STOP AT EVERY STEP OF MY TURN (Settings; Rob, 2026-10-11): the person's way of playing, kept with their preferences
     (`play.stepByStep`) and told to the room whenever a view says otherwise. Once for each wish and revision: a refused
     wish's view has the revision it was sent at, so it is sent again only when the game moves on. */
  function prefer() {
    if (!view || view.status === "finished" || view.continuing || !socket || socket.readyState !== 1) return;
    const want = (((C.state.preferences || {}).play || {}).stepByStep) === true, ask = !skipEmpty();
    if (want === (view.stepByStep === true) && ask === (view.askStack === true)) return;
    const key = `${view.matchId}:${want}:${ask}`;
    if (preferSaid && preferSaid.key === key && preferSaid.revision >= view.revision) return;
    preferSaid = {key, revision: view.revision};
    socket.send(JSON.stringify({type: "prefer", stepByStep: want, askStack: ask}));
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
  /* ROB-28: only your own Skip to end uses a local loop. Opponent-turn Yield is
     the room's policy, surviving spells and required choices. No optimistic
     toggle: the next authoritative view acknowledges starting or stopping.
     A reconnect reads that policy afresh and never replays an uncertain request. */
  const skipWords = (short = false) => {
    if (skipping === null) return "Skip to end";
    return short ? "Stop skipping" : "Skipping · stop";
  };
  const yieldHelp = () => `Yield this turn passes all your priority for the rest of ${nameOf(view.state.turnPlayerId)}'s turn, including new spells and abilities. You still choose targets, blockers, payments and other required decisions. Stop yielding affects future passes after the room acknowledges it; it cannot undo a pass.`;
  function skipControl(short = false, size = "compact") {
    if (view.state.turnPlayerId === view.seat) return b(skipWords(short), "board-skip", {}, false,
      {cls: `${size}${skipping === null ? "" : " is-on"}`, disabled: view.status === "finished"});
    if (view.status === "finished" || (!view.mayYield && !view.yielding)) return "";
    const active = view.yielding === true, waiting = yieldPending !== null;
    const label = waiting ? (yieldPending.on ? "Requesting yield…" : "Stopping yield…") : active ? "Stop yielding" : "Yield this turn";
    const detail = status !== "open" || !yieldReady ? "Reconnecting; state unconfirmed" : active
      ? `${nameOf(view.state.turnPlayerId)} · turn ${view.state.turn}; still choose`
      : "Pass all priority; still choose";
    return `<span class="cm-board-yield-control" data-yield-control title="${e(yieldHelp())}">
      <button type="button" class="v-button ${size}${active ? " is-on" : ""}" data-action="board-skip" aria-pressed="${active}" aria-description="${e(yieldHelp())}"${waiting || !yieldReady || status !== "open" || sending || view.continuing ? " disabled" : ""}>${e(label)}</button>
      <small>${e(detail)}</small></span>`;
  }
  function skip() {
    if (skipping === null) return;
    const d = view.decision;
    if (view.status === "finished" || view.state.turnPlayerId !== view.seat || view.state.turn !== skipping || (d && d.kind !== "priority") || view.state.stack.length) {skipping = null; return;}
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
  const NO_PERSON = "every person had left the game, so it ended there";  /* game/room/room.mjs NO_PERSON_REASON */
  function outcomeOf(v) {
    const gone = (v.departures || {})[v.seatId];
    if (gone === "conceded") return {outcome: "loss", reason: "conceded"};
    if (gone === "timed-out") return {outcome: "unfinished", reason: "ran out of time"};
    if (v.status !== "finished") return null;
    const r = v.result || {};
    /* From the room's `ending` (ROB-166), this seat's own end: lost by the rules is a loss with its reason; a game ended
       for everyone is unfinished; a draw is a draw. Conceded and timed-out were read above, from the departures. */
    const mine = r.ending && (r.ending.seats || []).find((x) => x.seatId === v.seatId);
    if (mine && mine.outcome === "won") return {outcome: "win", reason: r.reason || ""};
    if (mine && mine.outcome === "lost") return {outcome: "loss", reason: mine.reason || "lost"};
    if (r.ending && r.ending.kind === "ended") return {outcome: "unfinished", reason: "ended early"};
    if (r.ending && r.ending.kind === "draw") return {outcome: "draw", reason: r.reason || ""};
    /* Ended because every person was out (Rob, 2026-10-06): a person still in it here had lost. */
    if (r.reason === NO_PERSON) return {outcome: "loss", reason: (((v.state && v.state.players || [])[v.seat] || {}).health || {}).lossReason || "lost"};
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
    const chosen = view.decision.kind === "priority" && payload.indices ? view.decision.options[payload.indices[0]] : null;
    const hold = chosen && (chosen.act === "cast" || chosen.act === "activate") && stored(HOLD_KEY) === "on" ? {hold: true} : {};
    socket.send(JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, ...payload, ...hold}));
    draw();
  }

  /* ---- reading the view ---- */
  const players = () => (view ? view.state.players : []);
  const seatName = (seatId) => ((view.seats.find((s) => s.seatId === seatId) || {}).name || seatId);
  const nameOf = (i) => (i === view.seat ? "You" : (players()[i] || {}).name || `Seat ${i + 1}`);
  /* The game's turn counts every player's; on your own the strip adds which of yours it is (Rob, 2026-10-11: "It says we
     are on turn 3, but I only played one land"). The room counts them (game/room/room.mjs, `yourTurn`). */
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
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
  /* IN COMBAT (the accessibility pass): what a card is doing in the combat on the table (the view's own combat, which
     is public), in the words its label and its mark say it -- attacking whom, blocked; blocking which. */
  const cardWord = (id) => {const c = findCard(id); return c && c.name ? c.name : "a face-down creature";};
  function combatOf(c) {
    const fight = view.state.combat, words = [];
    for (const a of (fight && fight.attacks) || []) {
      if (a.attacker === c.cardId) words.push({mark: "attacking", said: `attacking ${a.planeswalker !== undefined ? cardWord(a.planeswalker) : a.defender === view.seat ? "you" : nameOf(a.defender)}${a.blocked ? ", blocked" : ""}`});
      if ((a.blockers || []).includes(c.cardId)) words.push({mark: "blocking", said: `blocking ${cardWord(a.attacker)}`});
    }
    return words;
  }
  /* Battlefield storage is grouped by owner in CrankRoomView@1. Placement and counts are by
     current controller; ownership references never become a second playable object. */
  const battlefieldCards = () => players().flatMap(p => p.zones.Battlefield.cards);
  const controlledCards = (seat) => battlefieldCards().filter(c => c.controller === seat);
  const foreignControl = (c) => Number.isInteger(c.owner) && Number.isInteger(c.controller) && c.owner !== c.controller;
  const controlName = (c) => c.faceDown ? "Face-down card" : c.name || "Unnamed permanent";
  const controlSummary = (c) => `Controlled by ${nameOf(c.controller)} · Owned by ${nameOf(c.owner)}`;
  function controlGhost(c) {
    const name = controlName(c);
    return `<button type="button" id="cm-control-ref-${c.cardId}" class="cm-bcard cm-control-ghost${c.faceDown ? " is-back" : ""}" data-action="board-control-inspect" data-control-card="${c.cardId}" aria-label="${e(`${name}, ownership reference, ${controlSummary(c)}; inspect control details`)}">
      ${!c.faceDown && c.name ? `<img src="${e(pictureOf(c.name))}" alt="" draggable="false" loading="lazy" referrerpolicy="no-referrer"><span class="cm-bcard-name">${e(name)}</span>` : ""}
      <span class="cm-control-label">With ${e(nameOf(c.controller))}</span></button>`;
  }
  function controlDetails(c) {
    return `<p><strong>${e(controlName(c))}</strong> · Object #${c.cardId}</p><p>${e(controlSummary(c))}</p><p>Return condition unavailable.</p>`;
  }
  let controlInspection = null;
  function controlPeek(el) {
    document.querySelectorAll('[aria-describedby="cm-control-peek"]').forEach(node => node.removeAttribute("aria-describedby"));
    document.getElementById("cm-control-peek")?.remove();
    if (!el || !view) return;
    const c = battlefieldCards().find(c => c.cardId === Number(el.dataset.controlCard));
    if (!c || !foreignControl(c)) return;
    const div = Object.assign(document.createElement("div"), {id: "cm-control-peek", className: "cm-control-peek"});
    div.setAttribute("role", "tooltip");
    div.innerHTML = controlDetails(c);
    document.body.append(div);
    const r = el.getBoundingClientRect(), box = div.getBoundingClientRect();
    div.style.left = `${Math.max(8, Math.min(r.left, innerWidth - box.width - 8))}px`;
    div.style.top = `${Math.max(8, r.top >= box.height + 16 ? r.top - box.height - 8 : Math.min(r.bottom + 8, innerHeight - box.height - 8))}px`;
    el.setAttribute("aria-describedby", div.id);
  }
  // Public combat only: never read picked/options here or borrow a name from a private zone.
  const combatCard = id => players().flatMap(p => p.zones.Battlefield.cards).find(c => c.cardId === id);
  const combatAttacks = () => view.status === "finished" ? [] : (view.state.combat?.attacks || []).filter(a => combatCard(a.attacker));
  const combatName = c => c.faceDown ? "Face-down creature" : c.name || "Unnamed permanent";
  function combatStrip() {
    const attacks = combatAttacks();
    if (!attacks.length) return "";
    const thumb = (id, role) => {
      const c = combatCard(id);
      if (!c) return `<span class="cm-combat-missing" data-combat-object="${id}">Object #${id} left the battlefield</span>`;
      const name = combatName(c);
      return `<button type="button" class="cm-combat-card" data-action="board-combat-inspect" data-card="${id}" data-combat-role="${role}" aria-label="${e(`${role}: ${name}, object #${id}; inspect`)}">
        <span class="cm-combat-back" aria-hidden="true">${c.name && !c.faceDown ? `<img src="${e(pictureOf(c.name))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>
        <span><strong>${e(name)}</strong><small>#${id}${c.power !== null && c.power !== undefined ? ` · ${e(c.power)}/${e(c.toughness)}` : ""}</small></span></button>`;
    };
    const groups = [...new Set(attacks.map(a => a.defender))].map(defender => {
      const name = players().find(p => p.playerId === defender)?.name || `Seat ${defender + 1}`;
      const rows = attacks.filter(a => a.defender === defender).map(a => {
        const blockers = (a.blockers || []).filter(id => combatCard(id));
        const blocked = a.blocked
          ? blockers.length ? blockers.map(id => thumb(id, "Blocker")).join("") : `<span class="cm-combat-missing">Blocked · no blockers remain</span>`
          : `<span class="cm-combat-missing">No blocks confirmed</span>`;
        return `<li class="cm-combat-row" data-combat-attacker="${a.attacker}" data-combat-target="${a.planeswalker ?? `seat:${defender}`}">
          ${thumb(a.attacker, "Attacker")}<span class="cm-combat-arrow" aria-hidden="true">→</span>
          <span class="cm-combat-target">${a.planeswalker !== undefined ? thumb(a.planeswalker, "Attacked permanent") : `<span>Attacking ${e(name)}</span>`}</span>
          <span class="cm-combat-blocks"><small>${a.blocked ? "Confirmed blocks" : "Blocks"}</small><span>${blocked}</span></span></li>`;
      }).join("");
      return `<section class="cm-combat-group" data-combat-defender="${defender}" aria-label="${e(`Defending: ${name}`)}"><h3>${e(name)} defends</h3><ul>${rows}</ul></section>`;
    }).join("");
    const key = `${view.matchId}:${view.state.turnId || view.state.turn}:${attacks.map(a => a.attacker).join(",")}`;
    return `<section class="cm-combat" aria-label="Combat assignments"><span class="cm-combat-heading">Combat · confirmed assignments</span><div class="cm-combat-groups" data-combat-key="${e(key)}" tabindex="0" aria-label="Combat groups; scroll for more">${groups}</div></section>`;
  }
  function card(c, {where = "mat", action = "board-card", arrange = false} = {}) {
    const opts = optionsFor(c.cardId), mine = view.decision && !sending;
    const bright = mine && opts.length > 0, chosen = opts.some((o) => picked.includes(o.index));
    const creature = c.name && c.types.includes("Creature") && c.power !== null, upright = UPRIGHT.has(where), fight = combatOf(c);
    const controlled = where === "mat" && foreignControl(c);
    const cls = ["cm-bcard", controlled ? "is-controlled" : "", c.name ? "" : "is-back", Number.isFinite(c.commanderTax) ? "has-tax" : "", c.tapped && !upright ? "is-tapped" : "", bright ? "is-bright" : "", chosen ? "is-picked" : "", coachShown.has(c.cardId) ? "is-coach-shown" : "", (where === "hand" || where === "fan") && mine && !bright ? "is-dim" : "", selected === c.cardId && where !== "pick" ? "is-selected" : ""].filter(Boolean).join(" ");
    const marks = [c.tapped && upright ? `<span class="cm-bcard-mark is-state">Tapped</span>` : "", ...fight.map((f) => `<span class="cm-bcard-mark is-combat">${f.mark}</span>`), c.damage ? `<span class="cm-bcard-mark">${c.damage} damage</span>` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `<span class="cm-bcard-mark">${n} ${e(k)}</span>`)].join("");
    /* Its name first, then what is shown on it as a person looking at it would say it: tapped, its power and toughness,
       in combat, damage marked, counters, chosen or picked to read; then what it can do now (the accessibility pass). */
    /* THE COMMANDER TAX (ROB-29; CR 903.8): on a commander in the command zone, the generic it costs more for each time it
       was cast from there (the room's `commanderTax`), at its top-right as Rob asked, and said with its name. */
    const tax = Number.isFinite(c.commanderTax) ? c.commanderTax : null;
    const state = [tax !== null ? `commander tax ${tax}` : "", c.tapped ? "tapped" : "", creature ? `${c.power}/${c.toughness}` : "", ...fight.map((f) => f.said), c.damage ? `${c.damage} damage` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `${n} ${k} counter${n === 1 ? "" : "s"}`),
      chosen ? "chosen" : "", selected === c.cardId && where !== "pick" ? "selected" : ""].filter(Boolean);
    /* What it can do, each kind once ("Cast Zap, 4 ways"), not the card's name once per target. */
    const can = [...new Set(opts.map((o) => verbFor(o)))];
    /* A FACE-DOWN CARD (CR 708.2a) is the back of a card, and says so: never its name, not even to the player allowed to
       look at it (CR 708.5) -- the board does not show it, so it does not say it. */
    const named = c.name || (c.faceDown ? `Face-down ${(c.types || []).includes("Creature") ? "creature" : "card"}` : "A hidden card");
    /* WHY NOT (ROB-24): a card of the person's own that nothing offered plays says why, from the room (`why`). */
    const label = `${named}${controlled ? `, ${controlSummary(c)}` : ""}${state.length ? ", " + state.join(", ") : ""}${bright ? `: ${can.join(" or ")}${opts.length > can.length ? `, ${opts.length} ways` : ""}` : c.why ? `. ${c.why}` : ""}`;
    if (!c.name && !c.faceDown) return `<div class="cm-bcard is-back" role="img" aria-label="${e(label)}"></div>`;
    return `<button type="button" class="${cls}" data-action="${action}" data-card="${c.cardId}"${arrange ? ` draggable="true" data-arrange-card="true" title="Drag within this section to reorder; Alt + Left or Right works with a keyboard"` : ""} aria-label="${e(label)}">
      ${c.name ? `<span class="cm-bcard-name">${e(c.name)}</span>` : ""}${creature ? `<span class="cm-bcard-pt">${c.power}/${c.toughness}</span>` : ""}${tax !== null ? `<span class="cm-bcard-tax" title="Commander tax: {${tax}} more to cast it from the command zone">+${tax}</span>` : ""}
      ${c.name ? `<img src="${e(pictureOf(c.name))}" alt="" draggable="false" loading="lazy" referrerpolicy="no-referrer">` : ""}${controlled ? `<span class="cm-control-label">Owner: ${e(nameOf(c.owner))}</span>` : ""}${marks ? `<span class="cm-bcard-marks">${marks}</span>` : ""}</button>`;
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
     player's turn. In the draw step of your turn it is Draw card, and the click draws (item 13; the Oct 15 playtest's
     confirmed decisions name it Draw card). */
  /* In your own end step it is End turn (Rob, 2026-10-11: "passing the turn to the next player should always require
     player confirmation"): the room always asks you there (game/room/room.mjs, `endsTurn`). */
  function passLabel() {
    /* Once the game is over there is nothing to pass or resolve: the button, disabled, says so (it said "Resolve" and the
       name of a spell left on the stack). */
    if (view.status === "finished") return "Game over";
    const s = view.state, top = s.stack.length ? s.stack[s.stack.length - 1] : null;
    if (top) return top.name ? `Resolve ${top.name}` : "Let it resolve";
    const d = view.decision, pass = d && d.kind === "priority" ? d.options.find((o) => o.act === "pass") : null;
    if (pass && pass.endsTurn) return "End turn";
    return s.turnPlayerId === view.seat ? "Next step" : "Pass";
  }
  function passButton(cls = "compact") {
    const d = view.decision;
    if (d && d.kind === "draw" && view.status !== "finished") return b("Draw card", "board-draw", {}, true, {cls, disabled: sending});
    return b(passLabel(), "board-pass", {}, true, {cls, disabled: !canPass()});
  }
  /* RESOLVE ALL, beside the pass (Rob, 2026-10-09): a run of identical triggers on top of the stack -- a thousand
     Intruder Alarm triggers -- let resolve with one click rather than one each. The room offers it (game/room/room.mjs,
     `triggerRun`) and passes for you through that run only; anything else on top, and you are asked again. */
  const resolveAllOption = () => {const d = view.decision; return d && d.kind === "priority" ? d.options.find((o) => o.act === "resolve-all") || null : null;};
  function resolveAllButton(cls = "compact") {
    const o = resolveAllOption();
    if (!o || view.status === "finished") return "";
    return b(`Resolve all ${Number(o.count).toLocaleString("en-US")}`, "board-resolve-all", {}, false, {cls, disabled: sending});
  }
  /* THE TURN'S SEVEN STEPS, ALWAYS IN VIEW (Rob, 2026-10-12: "I want to see all 7 phases listed out during each turn,
     which phases are complete and which is active and which are yet to come, but very concise yet readable"). One
     ribbon in the strip on every turn, whoever's it is: the steps gone by struck through and dimmed, the step now a
     chip in the accent with its combat sub-step, the steps to come in ink. The ribbon is a button: it opens the same
     steps menu the old "n / 7 ▾" did. Narrow windows show each step's short form (`data-short`), the current one whole.
     The current step keeps the class .cm-board-step, which the suites and docs/playtest-harness.md read for its words. */
  const SHORT = ["Un", "Up", "Dr", "M1", "Cb", "M2", "End"];
  function turnRibbon() {
    const {at, step, detail} = stepInfo();
    if (at < 0) return `<span class="cm-board-step is-alone">${e(step)}</span>`;
    const items = STEPS.map(([label], i) => i === at
      ? `<li class="is-now cm-board-step">${e(step)}${e(detail)}</li>`
      : `<li class="${i < at ? "is-done" : "is-next"}"><span class="cm-step-long">${e(label)}</span><span class="cm-step-short" aria-hidden="true">${SHORT[i]}</span></li>`).join("");
    return `<button type="button" class="cm-board-count cm-board-ribbon-button" data-action="board-steps" aria-expanded="${stepsOpen}" aria-label="Step ${at + 1} of ${STEPS.length}, ${step}${detail}; show the steps"><ol class="cm-board-ribbon is-strip" aria-hidden="true">${items}</ol></button>`;
  }
  function switcher(icons = false) {
    return `<span class="cm-board-views" role="group" aria-label="View">${VIEWS.map(([k, icon, label]) => `<button type="button" class="v-button compact${mode === k ? " is-on" : ""}" data-action="board-view" data-view="${k}" aria-pressed="${mode === k}"${icons ? ` aria-label="${label}" title="${label}"` : ` title="${label}"`}>${icons ? icon : `${icon}<span class="cm-view-word"> ${k === "full" ? "Full" : label}</span>`}</button>`).join("")}</span>`;
  }
  /* ☰: the app's pages, over the game. The surface is the whole window, so the rail lives here. A list of links and a
     button, so it is a navigation region, not an ARIA menu (whose items would want arrow keys it does not take). */
  function menu() {
    const links = [["Decks", "#decks"], ["Library", "#cards"], ["Explore", "#discover"], ["Play", "#game"], ["Settings", "#settings"]];
    return `<nav class="cm-board-menu cm-board-nav" id="cm-board-nav" aria-label="Pages"><ul>${links.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join("")}</ul>
      <p class="cm-muted">The game keeps going, and your seat with it: Play, or Game on in the rail, brings you back.</p>
      <button type="button" class="v-button compact" data-action="page-help" data-help="table">Keys and help</button></nav>`;
  }
  function stepsMenu() {
    const at = stepAt(view.state.phase);
    return `<div class="cm-board-menu cm-board-steps" role="group" aria-label="This turn's steps" id="cm-board-steps"><h3>This turn</h3>${ribbon(true, at)}<p class="cm-muted">Done steps are struck through; the current one is in brass.</p></div>`;
  }
  function toolsMenu() {
    const over = view.status === "finished", left = !!departed(view.seat);
    const end = confirmEnd
      ? `${b("End for everyone · keep the record", "board-end", {confirm: "1"}, true)}${b("Keep playing", "board-end-cancel")}`
      : b("End game", "board-end", {}, false, {disabled: over});
    const [lo, hi] = C.cardScaleRange();
    /* Hold remains a separate cast preference; explicit Yield belongs to the room (ROB-28). */
    const yours = view.state.turnPlayerId === view.seat;
    const priority = `<div class="cm-actions">${skipControl()}</div>
      <label class="cm-board-hold"><input type="checkbox" data-board-hold${stored(HOLD_KEY) === "on" ? " checked" : ""}><span>Hold priority after I cast</span></label>
      <label class="cm-board-hold"><input type="checkbox" data-board-skip-empty${skipEmpty() ? " checked" : ""}><span>Skip my priority if no response possible</span></label>
      <p class="cm-muted cm-board-yield-help">${yours ? "Skip to end passes your priority for you through the rest of your turn. It stops when anything is on the stack or you are asked anything else." : e(yieldHelp())}</p>`;
    return `<div class="cm-board-menu" role="group" aria-label="Settings" id="cm-board-tools">
      <div class="cm-actions cm-board-menu-row">${b("Set Side Drawer Modules", "board-modules-settings")}</div>
      <div class="cm-actions cm-board-menu-row">${gb(COACH, "Recommended actions", "board-coach", {}, {cls: ""})}${b("Table vitals", "board-vitals", {})}${b("AI Coach settings…", "ai-settings", {})}</div>
      ${priority}
      <div class="cm-board-size">${C.cardScaleSlider()}<p class="cm-muted">${lo}% – ${hi}% · the table's size: it sets Board cards and Hand cards too · remembered on this device · ⌘/Ctrl + / − also work</p></div>
      ${soundMenu()}
      <div class="cm-actions cm-board-menu-row">${b("Try the callouts", "board-callout-demo", {}, false, {cls: "compact"})}<span class="cm-muted">Overlay ${overlay()}% · set in Settings › Play</span></div>
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
  /* WHOSE TURN IT IS, marked on that seat's card in the side pane -- Focus's tiles, Full screen's vitals -- as well as
     the strip's Turn (Rob, 2026-10-09: "Needs more clear indication of who's turn it is on. Icon on the Card in the
     left or right side pane"). */
  const TURN_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 4.5v7l5.5-3.5z" fill="currentColor"/></svg>`;
  const turnMark = (i) => view.state.turnPlayerId !== i ? "" : `<span class="cm-board-turn-mark" role="img" aria-label="${i === view.seat ? "Your turn" : `${e(nameOf(i))}'s turn`}" title="${i === view.seat ? "Your turn" : `${e(nameOf(i))}'s turn`}">${TURN_ICON}<b>${i === view.seat ? "Your turn" : "Turn"}</b></span>`;
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
  function pile(label, zone, top, {back = false, draw: drawing = false} = {}) {
    /* Your library, while your draw waits for you (a game launched with the held draw): clicking it draws, as Draw a card
       does (Rob, 2026-10-09: "Clicking the library pile should Draw a Card also on a Draw turn"). */
    /* PARTNERS (ROB-29, Oct 20): the command zone draws every card in it, the second overlapping the first like a small
       pile, so Kraum is there to see, inspect and cast beside Tymna rather than only under "You can also". */
    const many = label === "Command" && zone.cards.length > 1;
    const face = many ? `<span class="cm-board-partners">${zone.cards.map((c) => card(c)).join("")}</span>` : top ? card(top) : drawing
      ? `<button type="button" class="cm-bcard is-back is-bright" data-action="board-draw" aria-label="Draw card: your library, ${zone.count}"${sending ? " disabled" : ""}><b class="cm-bcard-count">${zone.count}</b></button>`
      : `<div class="cm-bcard is-empty${back && zone.count ? " is-back" : ""}" aria-hidden="true">${back && zone.count ? `<b class="cm-bcard-count">${zone.count}</b>` : ""}</div>`;
    return `<figure class="cm-mat-zone cm-board-pile" data-zone="${e(label.toLowerCase())}" aria-label="${e(label)}, ${zone.count}" title="${e(label)}, ${zone.count}">${face}<figcaption><em>${e(label)}</em><b>${zone.count}</b></figcaption></figure>`;
  }
  const cardOrders=new Map();
  const cardOrderKey=section=>`cm-card-order:${C.signedInAs?.() || 'local'}:${view?.matchId || tableId}:${view?.seat}:${section}`;
  function arrangedCards(cards,section) {
    const key=cardOrderKey(section);let order=cardOrders.get(key);
    if(!order){try{const parsed=JSON.parse(stored(key) || '[]');order=Array.isArray(parsed)?parsed.map(String):[];}catch{order=[];}cardOrders.set(key,order);}
    const ranked=new Map(order.map((id,i)=>[id,i]));
    return [...cards].sort((a,b)=>(ranked.get(String(a.cardId))??Infinity)-(ranked.get(String(b.cardId))??Infinity));
  }
  function cardSection(cards,section,ghosts=[]) {return `<div class="cm-board-cards" data-card-section="${section}">${arrangedCards(cards,section).map(c=>card(c,{arrange:true})).join('')}${ghosts.map(controlGhost).join("")}</div>`;}
  function reorderCard(section,id,targetId,after=false) {
    const cards=[...section.querySelectorAll('[data-arrange-card]')],from=cards.find(el=>el.dataset.card===id),to=cards.find(el=>el.dataset.card===targetId);
    if(!from || from===to)return;
    if(to)section.insertBefore(from,after ? to.nextSibling : to);else section.append(from);
    const order=[...section.querySelectorAll('[data-arrange-card]')].map(el=>el.dataset.card),key=cardOrderKey(section.dataset.cardSection);
    cardOrders.set(key,order);keep(key,JSON.stringify(order));
  }
  function mat(p, {size = "focus", head = "top", focusButton = false} = {}) {
    const i = p.playerId, you = i === view.seat, z = p.zones, field = controlledCards(i);
    const ghosts = z.Battlefield.cards.filter(foreignControl);
    const lands = field.filter((c) => c.types.includes("Land"));
    const creatures = field.filter((c) => !c.types.includes("Land") && c.types.includes("Creature"));
    const other = field.filter((c) => !c.types.includes("Land") && !c.types.includes("Creature"));
    const group = (label, cards) => {
      const references = ghosts.filter(c => !c.types.includes("Land") && c.types.includes("Creature") === (label === "Creatures"));
      return cards.length || references.length ? `<div class="cm-board-group" data-card-group="${label === "Creatures" ? "creatures" : "others"}"><h3>${e(label)} · ${cards.length}${references.length ? ` · ${references.length} with other players` : ""}</h3>${cardSection(cards,`${i}:${label === "Creatures" ? "creatures" : "others"}`,references)}</div>` : "";
    };
    const mana = p.mana.reduce((n, m) => n + m.amount, 0);
    const bare = size === "full" || size === "opp" || size === "side" || size === "phone";
    const active = view.state.turnPlayerId === i;
    const header = head === "none" ? "" : `<header class="cm-mat-head cm-seatboard-head">
        <strong class="cm-mat-name">${e(seatLabel(p))}</strong>${vitals(p, {big: size === "focus"})}<span class="cm-mat-cmdr cm-muted">${e((commanderOf(p) || {}).name || "")}</span>
        ${you ? "" : `<span class="cm-board-their-hand">${e(p.name)}'s hand · ${z.Hand.count}</span>`}
        <span class="cm-board-tile-flag">${e(seatFlag(p))}</span>
        ${focusButton ? b("⤢ Focus", "board-focus", {seat: String(i)}, false, {cls: "compact"}) : ""}</header>`;
    const body = `<div class="cm-mat-grid cm-seatboard-body">
        <div class="cm-mat-zone cm-board-field" data-zone="battlefield">${group("Creatures", creatures)}${group("Artifacts & enchantments", other)}${!field.length && !ghosts.length ? `<p class="cm-board-empty">${p.health.status === "lost" || departed(i) ? "Out of the game." : "No permanents yet."}</p>` : ""}<i class="cm-mat-label">Battlefield</i></div>
        <div class="cm-mat-zone cm-board-lands" data-zone="lands">${cardSection(lands,`${i}:lands`,ghosts.filter(c => c.types.includes("Land")))}<i class="cm-mat-label">Lands · ${lands.length}</i></div>
        ${you ? `<span class="cm-board-chip">${mana} mana open · land drop ${p.landsPlayed ? "used" : "1 left"}</span>` : ""}
        ${pile("Command", z.Command, z.Command.cards[0])}${pile("Exile", z.Exile, z.Exile.cards.at(-1))}
        ${size === "focus" ? historyBand(6) : ""}
        ${pile("Library", z.Library, null, {back: true, draw: you && !!view.decision && view.decision.kind === "draw" && view.status !== "finished"})}${pile("Graveyard", z.Graveyard, z.Graveyard.cards.at(-1))}
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
     handoff's "seats 2 · 3 / 4 · 1"). Fewer seats, fewer boards: two sit side by side, yours on the right, each the
     height of the table (Rob, 2026-10-09: "In 2-player, the screen should split down the middle vertically, not
     horizontally, thereby increasing play surface for each board on a landscape screen"); three put you across the foot. The
     boards are 16:9 tracks sized to the window (fit()), alike in a row; the bar between the rows shares the height
     (item 4), identical boards until it is moved. At the true center, the life counter (item 9). */
  function tableView() {
    const ps = players(), n = ps.length, active = view.state.turnPlayerId;
    const side = n === 2, bottom = side ? ["b"] : ["c", "d"];
    /* In the order they sit, the top row left to right and then the bottom, so Tab reads the table as it is laid out. */
    const boards = [...ps].sort((x, y) => areaOf(x.playerId).localeCompare(areaOf(y.playerId))).map((p) => {const area = areaOf(p.playerId), low = bottom.includes(area); return `<div class="cm-board-slot" data-area="${area}" style="grid-area:${area};--row-w:var(${low ? "--bot-w" : "--top-w"})">${mat(p, {size: "table", head: low && !side ? "bottom" : "top", focusButton: true})}</div>`;}).join("");
    const rows = side
      ? `<div class="cm-board-rowbar is-upright">${grip("rows", "The boards' widths: drag, or use the arrow keys", Math.round(rowShare() * 100), [ROWS[0] * 100, ROWS[1] * 100], "vertical")}</div>`
      : `<div class="cm-board-rowbar">${grip("rows", "The rows' sizes: drag, or use the arrow keys", Math.round(rowShare() * 100), [ROWS[0] * 100, ROWS[1] * 100])}</div>`;
    return `<div class="cm-board-tabletop"><div class="cm-board-table" data-seats="${n}">${active === null ? "" : fan(active)}${boards}${rows}${counter()}</div>${ask()}</div>${hand()}`;
  }
  /* THE LIFE COUNTER at the true center (item 9; wireframe 2e's counter()): a slice per seat in its color, on the side
     its board sits -- four quarters, three thirds, two halves -- its life on it, and the logo in the middle, which
     opens Table vitals. Degrees run clockwise from twelve o'clock, as a conic gradient draws them. */
  const SLICES = {4: {b: [0, 90], d: [90, 180], c: [180, 270], a: [270, 360]}, 3: {b: [0, 120], c: [120, 240], a: [240, 360]}, 2: {b: [0, 180], a: [180, 360]}};
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
    return `<div class="cm-board-tile${mini ? " is-mini" : ""}${focus === i ? " is-focus" : ""}${i === view.seat ? " is-you" : ""}${view.state.turnPlayerId === i ? " is-turn" : ""}" data-seat="${i}" style="--seat:${seatColor(i)}">${turnMark(i)}
      ${mini ? `<div class="cm-board-mini" inert>${mat(p, {size: "mini", head: "none"})}</div>` : ""}<button type="button" class="cm-board-tile-main" data-action="board-focus" data-seat="${i}" aria-pressed="${focus === i}">
        <span class="cm-board-tile-name">${e(seatLabel(p))}</span><span class="cm-muted">${e(commander ? commander.name : "")}</span></button>
      ${vitals(p)}<span class="cm-board-tile-flag">${e(seatFlag(p))}</span></div>`;
  }
  function focusView() {
    const p = players()[focus] || players()[view.seat];
    const pane = paneShut
      ? `<nav class="cm-board-pane is-shut" aria-label="Boards">${ib("▸", "board-pane", "Show the boards", {}, {pressed: false})}${players().map((x) => `<button type="button" class="cm-board-dot${focus === x.playerId ? " is-focus" : ""}" data-action="board-focus" data-seat="${x.playerId}" style="--seat:${seatColor(x.playerId)}" aria-label="${e(seatLabel(x))}: ${x.health.life} life" title="${e(seatLabel(x))}">${x.health.life}</button>`).join("")}</nav>`
      : `<nav class="cm-board-pane" aria-label="Boards"><div class="cm-board-pane-head"><span>Boards</span>${ib("◂", "board-pane", "Collapse the boards", {}, {pressed: true})}</div>${players().map(tile).join("")}
        ${b("My board", "board-focus", {seat: String(view.seat)}, true)}
        <button type="button" class="cm-board-coach-open" data-action="board-coach" aria-pressed="${coach.open}" aria-label="CrankMagic Coach">${COACH}Coach</button></nav>`;
    const paneGrip = paneShut ? "" : `<span class="cm-board-panegrip">${grip("pane", "The boards' width: drag, or use the arrow keys", paneWidth(), PANE, "vertical")}</span>`;
    return `<div class="cm-board-body${panelOpen ? " has-panel" : ""}" style="--pane-w:${paneShut ? 44 : paneWidth()}px;--panel-w:${panelWidth()}px">${pane}${paneGrip}<div class="cm-board-main"><div class="cm-board-stage">${fan(p.playerId)}${mat(p, {size: "focus"})}</div>${ask()}${hand()}</div></div>`;
  }
  /* THE FULL SCREEN VIEW: the page given to the game. A slim rail; the others across the top, the big board across
     the foot -- yours, or whichever ⟳ Rotate has walked to -- with the step, Next and Pass over it and your hand along
     its bottom edge; at the side, every seat's vitals, the card under the pointer, and the log. */
  function fullView() {
    const s = view.state, me = players()[view.seat], big = players()[focus] || me, others = players().filter((p) => p.playerId !== big.playerId);
    /* The big board's corner, at the pill's head: whose it is and their vitals; when it is not yours, ⟳ and My board too. */
    const viewing = big.playerId !== view.seat;
    const corner = `<div class="cm-full-corner${viewing ? " cm-full-viewing" : ""}">${vitals(big, {big: true})}<span class="cm-full-corner-name">${viewing ? `Viewing ${e(big.name)}` : e(seatLabel(big))}</span>
      ${viewing ? `${ib("⟳", "board-rotate", "Rotate: the next seat's board", {by: "1"})}${b("My board", "board-focus", {seat: String(view.seat)}, true, {cls: "compact"})}` : ""}</div>`;
    return stageView({corner, big, others});
  }

  /* The latest wireframe: three seats across the back, the viewed seat's upright hand at the foot.
     Full screen always uses this surface; zero tilt is the flat view. */
  function stageView({corner, big, others}) {
    const rear = others.map((p) => `<section class="cm-stage-rear" data-seat="${p.playerId}" style="--seat:${seatColor(p.playerId)}">
      <button type="button" class="cm-stage-seat-label" data-action="board-focus" data-seat="${p.playerId}" aria-label="View ${e(p.name)}'s board, ${p.health.life} life"><span>${e(p.name)}</span><small>${e((commanderOf(p) || {}).name || "Command zone")}</small></button>
      <div class="cm-stage-mini">${mat(p, {size: "opp", head: "none"})}</div></section>`).join("");
    return `${boardHeader()}
      <div class="cm-full-mine cm-stage-region" aria-label="Tabletop">
        <div class="cm-stage-caption"><span>TURN ${view.state.turn}</span><div class="cm-stage-life-list" role="group" aria-label="Player life totals">${others.map(p=>`<span class="cm-stage-life">${e(p.name)} · <b>${p.health.life}</b></span>`).join("")}</div></div>
        ${rear}<div class="cm-stage-front">${mat(big, {size: "full", head: "none"})}${corner}</div>
        ${actionBar()}
        ${cameraMenu()}
        <span class="cm-stage-error" role="status">${e(stageError)}</span>${ask()}
      </div>
      ${stageHand(big)}
      ${boardDrawers()}`;
  }
  /* THE TURN'S ACTIONS, LARGE, OVER THE TABLE (Rob, 2026-10-21: "End Turn, Skip to End, and Draw Cards should all be done
     as larger action buttons that pop up above the table ... so that it's much more clearly prominent"): in Full screen
     the pass in its words for now (Draw card, Next step, Resolve ..., End turn, Pass), Resolve all, and Skip to end -- or
     Yield this turn -- stand at the top of the table, where the callouts are, rather than in the strip. They rise in as a
     question comes to you (`barSeen`: once a question, not at every redraw) and stand back, dimmed, while it is not yours. */
  let barSeen = null;
  function actionBar() {
    const live = !!view.decision && view.status !== "finished", key = live ? `${view.matchId}:${view.decision.id}` : null;
    const fresh = key !== null && key !== barSeen;
    barSeen = key;
    return `<div class="cm-stage-actions${live ? " is-live" : ""}${fresh && !reduced() ? " is-rising" : ""}" role="group" aria-label="Your actions">${passButton("")}${resolveAllButton("")}${skipControl(false, "")}</div>`;
  }
  function boardHeader() {
    const me=players()[view.seat],s=view.state,turnName=s.turnPlayerId===null ? "" : nameOf(s.turnPlayerId);
    const pill=`<div class="cm-full-pill">${stageEnabled() ? "" : `${passButton()}${resolveAllButton()}${skipControl(true)}`}</div>`;
    const conn=status === "open" ? "" : `<span class="cm-board-conn">${status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</span>`;
    return `<header class="cm-stage-top"><span class="cm-stage-self">${vitals(me)}<b>${e(me.name)}</b></span><span class="cm-board-tools cm-board-turnsteps">${turnRibbon()}${stepsOpen ? stepsMenu() : ""}</span>
      <span class="cm-stage-priority"><span class="cm-board-turn"${view.yourTurn ? ` title="Turn ${s.turn} of the game, counting every player's; your ${ordinal(view.yourTurn)} turn"` : ""}>${s.turn ? `Turn ${s.turn} · ${e(turnName)}${view.yourTurn ? ` (your ${ordinal(view.yourTurn)})` : ""}` : "Before turn 1"}</span><br>Priority: ${e(nameOf(view.state.priorityPlayerId))}<span class="cm-board-waiting" title="${e(waitingText())}">${e(waitingText())}</span>${conn}</span>${alsoButton()}${pill}${stageProfile(me)}${combatStrip()}</header>`;
  }
  function boardDrawers() { return `<aside class="cm-stage-rail${stageRail ? " is-open" : ""}" aria-label="Left drawer" ${stageRail ? "" : "inert"}>${stageModules("left")}</aside>${ib(stageRail ? "◂" : "▸", "board-stage-rail", "Toggle board tools", {}, {cls: "cm-stage-handle cm-stage-left", pressed: stageRail})}
      <aside class="cm-full-side cm-stage-side${stageSide ? " is-open" : ""}" aria-label="The table" ${stageSide ? "" : "inert"} style="--split:${Math.round(splitOf("side") * 100)}%">${stageEnabled() ? "" : `<span class="cm-board-panelgrip">${grip("panelw", "The drawer’s width: drag, or use the arrow keys", panelWidth(), PANELW, "vertical")}</span>`}<header><b>Your pane</b>${ib("⚙", "board-modules-edit", "Arrange modules", {}, {pressed: paneEditing})}${ib("✕", "board-stage-side", "Close table panel")}</header>
        ${stageModules()}</aside>
      ${ib(stageSide ? "▸" : "◂", "board-stage-side", "Toggle table panel", {}, {cls: "cm-stage-handle cm-stage-right", pressed: stageSide})}`; }
  function cameraMenu() { return `<div class="cm-stage-camera"><button type="button" data-action="board-camera" aria-expanded="${cameraOpen}">Camera ▾</button>${cameraOpen ? `<div>${phone() ? "" : switcher()}<span>View seats</span>${ib("◀", "board-rotate", "Previous seat", {by: "-1"})}${ib("▶", "board-rotate", "Next seat", {by: "1"})}
        ${stageEnabled() ? `<label>Tilt <input type="range" min="0" max="60" value="${camera.tilt}" data-stage-camera="tilt" aria-label="Table tilt"><output>${camera.tilt}°</output></label>` : ""}
        ${stageEnabled() ? `<label>Zoom <input type="range" min="60" max="${CAMERA_MAX}" value="${camera.zoom}" data-stage-camera="zoom" aria-label="Table zoom"><output>${camera.zoom}%</output></label>
        <label>Cards <input type="range" min="70" max="${CAMERA_MAX}" value="${camera.cards}" data-stage-camera="cards" aria-label="Tabletop card size"><output>${camera.cards}%</output></label>` : `${scaleSlider("board", "Board cards")}${scaleSlider("hand", "Hand cards")}`}
        ${stageEnabled() ? `<p class="cm-stage-style-note">Appearance preview · this device</p>
        <label class="cm-stage-style">Background <select data-stage-style="background" aria-label="Background">${(CrankStage.appearances.backgrounds).map(x=>`<option value="${x.id}"${appearance.background===x.id?" selected":""}>${x.name}</option>`).join("")}</select></label>
        <label class="cm-stage-style">Table <select data-stage-style="table" aria-label="Table design">${(CrankStage.appearances.tables).map(x=>`<option value="${x.id}"${tableDesignId(appearance.table)===x.id?" selected":""}>${x.name}</option>`).join("")}</select></label>` : ""}</div>` : ""}</div>`; }
  function stageProfile(me) {
    const initials = (me.name || "Player").trim().split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
    return `<div class="cm-stage-profile"><button type="button" class="cm-profile-avatar" data-action="board-profile" aria-label="Profile menu" aria-expanded="${profileOpen}" title="${e(me.name)} · Profile menu"><span aria-hidden="true">${e(initials)}</span></button>${profileOpen ? `<div class="cm-profile-menu" role="group" aria-label="Profile"><strong>${e(me.name)}</strong><span class="cm-board-tools">${opens(b("Pages", "board-menu"),menuOpen)}${menuOpen ? menu() : ""}</span><span class="cm-board-tools">${gb(CLOCK, "History", "board-history", {}, {expanded:historyOpen})}${historyOpen ? historyMenu() : ""}</span>${opens(b("Settings", "board-tools"),tools)}${tools ? toolsMenu() : ""}${b("Arrange drawer order", "board-modules-edit")}${b("Account & app settings", "open-settings")}${b("Help", "page-help", {help:"table"})}</div>` : ""}</div>`;
  }
  function moduleSettings() {
    tools = false; profileOpen = false; draw();
    const layout = paneLayout();
    C.modal("Set Side Drawer Modules", `<div id="cm-drawer-settings"><p>Choose where each module appears. Drag its handle inside a drawer to change the order; arrow buttons work with a keyboard too.</p><table class="cm-drawer-settings"><thead><tr><th scope="col">Module</th><th scope="col">Left</th><th scope="col">Right</th><th scope="col">None</th></tr></thead><tbody>${PANE_MODULES.map(([id,title]) => {
      const current = layout.left.includes(id) ? "left" : layout.right.includes(id) ? "right" : "none";
      return `<tr><th scope="row">${title}</th>${["left","right","none"].map(side => `<td><input type="radio" name="module-${id}" value="${side}" aria-label="${title}: ${side[0].toUpperCase()+side.slice(1)}"${side===current?" checked":""}></td>`).join("")}</tr>`;
    }).join("")}</tbody></table><p class="cm-muted">Saved with your player profile through cloud library sync. Hiding a module keeps its game data.</p><div class="cm-form-footer">${b("Cancel", "close")}${b("Save drawer modules", "board-modules-save", {}, true)}</div></div>`);
  }
  function stageModules(side="right") {
    const ids = paneModules(side);
    if(side === "left" && !ids.length) return "";
    const bodies = {
      coach: () => coach.open ? `<div class="cm-module-coach-host"></div>` : `<p class="cm-muted">Ask about your board, hand, or table.</p>${b("Open AI Coach", "board-coach", {}, false, {cls:"compact"})}`,
      recommended: () => `<p class="cm-muted">Recommendations use your AI Coach conversation and its privacy settings.</p>${b("Recommend actions", "board-recommend", {}, false, {cls:"compact"})}`,
      chat: () => `<p class="cm-muted">Game chat is not connected yet. Shared messages and voice chat are coming in a later update.</p>`,
      actions: () => decision() || `<p class="cm-muted">${e(waitingText())}</p>`,
      table: () => `<div class="cm-full-vitals">${players().map(p => `<div class="${view.state.turnPlayerId === p.playerId ? "is-turn" : ""}" data-seat="${p.playerId}" style="--seat:${seatColor(p.playerId)}"><span>${e(seatLabel(p))}${turnMark(p.playerId)}</span>${vitals(p, {big:true})}</div>`).join("")}</div>`,
      inspect: () => `<div id="cm-full-pick">${pickPanel()}</div>`,
      stack: () => stack({module:true}) || `<p class="cm-muted">The stack is empty.</p>`,
      history: () => historyBand(30),
      resources: () => turnResources(),
      counter: () => `<p class="cm-muted">Public battlefield counts · cards with two types count in both.</p>${players().map(p => `<details class="cm-module-counts"><summary>${e(seatLabel(p))}</summary><dl>${["Creature", "Artifact", "Enchantment", "Land", "Planeswalker"].map(type => `<div><dt>${type}s</dt><dd>${controlledCards(p.playerId).filter(c => c.types.includes(type)).length}</dd></div>`).join("")}</dl></details>`).join("")}`
    };
    return `<div class="cm-stage-modules" data-module-side="${side}" aria-label="${side === "left" ? "Left" : "Right"} drawer modules">${ids.map((id, i) => {
      const title = PANE_MODULES.find(([key]) => key === id)[1];
      return `<section class="cm-stage-module" data-module="${id}" aria-label="${title} module"><header><h3>${title}</h3>${paneEditing ? `<button type="button" class="cm-module-drag" draggable="true" data-module-drag="${id}" aria-label="Drag ${title}; use the adjacent move buttons for keyboard control">⠿</button>${ib("↑", "board-module-move", `Move ${title} up`, {module:id, side, by:"-1"}, {disabled:i===0})}${ib("↓", "board-module-move", `Move ${title} down`, {module:id, side, by:"1"}, {disabled:i===ids.length-1})}${ib("×", "board-module-remove", `Remove ${title}`, {module:id, side})}` : ""}</header><div class="cm-module-body">${bodies[id]()}</div></section>`;
    }).join("")}</div>`;
  }
  function stageHand(p) {
    const own = p.playerId === view.seat, cards = own ? p.zones.Hand.cards : [], n = own ? cards.length : p.zones.Hand.count;
    const indices = CrankStage.carousel(n, n>7 ? handStarts.get(p.playerId) || 0 : 0), count = indices.length;
    const label = own ? "Your hand" : `${p.name}'s hand, ${n} cards`;
    const arrow = (direction) => `<button type="button" class="cm-stage-hand-arrow" data-action="board-hand-cycle" data-by="${direction}" data-seat="${p.playerId}" aria-label="${direction<0?"Previous":"Next"} hand card">${direction<0?"‹":"›"}</button>`;
    return `<div class="cm-stage-hand"><section class="cm-stage-fan${own?"":" is-backs"}" aria-label="${e(label)}" style="--fan-count:${count};${backStyle(p.playerId)}">
      <span class="cm-stage-hand-label">${own?"Your hand":`${e(p.name)}'s hand`} · ${n}</span>
      ${n>7?arrow(-1):""}<div class="cm-stage-fan-cards">${indices.map((index,i)=>{
        const offset=i-(count-1)/2;
        return `<div class="cm-stage-fan-slot" data-hand-index="${index}" style="--fan-x:${offset};--fan-angle:${offset*3.5}deg;--fan-y:${Math.abs(offset)*Math.abs(offset)*2}px;z-index:${i+1}">${own?card(cards[index],{where:"hand"}):'<div class="cm-bcard is-back" aria-hidden="true"></div>'}</div>`;
      }).join("")}</div>${n>7?arrow(1):""}
      ${n===0?'<span class="cm-stage-hand-empty">No cards in hand</span>':""}</section></div>`;
  }
  function fitStage(host) {
    const region = host.querySelector(".cm-stage-region");
    if (!region || !globalThis.CrankStage) {globalThis.CrankStage?.unmount(); return;}
    const big = players()[focus] || players()[view.seat];
    const opts = {tilt: camera.tilt, zoom: camera.zoom, cards: camera.cards, reduced: globalThis.CrankMotion?.reduced() ?? false,
      background: table?.appearance?.background || appearance.background, table: tableDesignId(table?.appearance?.table || appearance.table),
      mats: [big, ...players().filter((p) => p.playerId !== big.playerId)].map((p) => matOf(p.playerId)),
      combat: view.state.phase.startsWith("COMBAT_"), instant: view.state.stack.some((s) => /Instant/i.test(typeLineOf(s))),
      onError(message) {stageError = message; const el = document.querySelector(".cm-stage-error"); if (el) el.textContent = `${message} Use Focus view in Camera if graphics are unavailable.`;}};
    CrankStage.mount(region, opts); CrankStage.layout(region.getBoundingClientRect(), opts);
    const tray = host.querySelector(".cm-stage-hand");
    if (tray) tray.style.setProperty("--hc", `${Math.max(70, Math.min(190 * scaleOf("hand") / 100, (tray.clientHeight - 24) * 5 / 7, (host.clientWidth - 110) / 6.1))}px`);
  }
  function pickPanel() {
    const id = hover ?? selected, pick = id === null ? null : findCard(id);
    if (!pick || !pick.name) return `<p class="cm-full-pick-empty cm-muted">Hover a card to read it here; click one to keep it.</p>`;
    return `<section class="cm-full-pick" aria-label="${e(pick.name)}">${card(pick, {where: "pick", action: "board-zoom-open"})}<div class="cm-board-options">${optionsFor(pick.cardId).map((o) => `<button type="button" class="v-button compact primary" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${sayHtml(o)}</button>`).join("") || (pick.why ? `<p class="cm-muted cm-hand-why">${e(pick.why)}</p>` : "")}</div></section>`;
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
  /* The stack, newest first; a run of the same thing in a row (a thousand Intruder Alarm triggers) is one line, ×N. */
  function stack({module = false} = {}) {
    const items = view.state.stack;
    if (!items.length) return "";
    if (module) {
      const ordered=[...items].reverse(), selectedIndex=Math.max(0,ordered.findIndex(s=>String(s.stackId)===stackSelected));
      const shown=ordered[selectedIndex], visible=CrankStage.carousel(ordered.length,selectedIndex,5);
      return `<section class="cm-board-stack cm-module-stack" aria-label="The stack"><p class="cm-stack-order-note">#1 resolves next · click the pile to browse</p><div class="cm-stack-browser"><ol class="cm-stack-list">${ordered.map((s,i)=>`<li><button type="button" class="cm-stack-summary" data-action="board-stack-select" data-stack-id="${e(String(s.stackId))}" aria-pressed="${i===selectedIndex}"><b class="cm-stack-position">#${i+1}</b><strong>${e(s.name || 'A face-down spell')}</strong><span>${e(nameOf(s.playerId))}</span></button></li>`).join('')}</ol><div class="cm-stack-image"><button type="button" class="cm-stack-pile" data-action="board-stack-cycle" aria-label="${e(shown.name || 'A face-down spell')}, stack position ${selectedIndex+1} of ${ordered.length}; show next card" style="--pile-depth:${visible.length-1}">${visible.map((index,depth)=>{const s=ordered[index];return `<span class="cm-bcard cm-stack-card${s.name ? '' : ' is-back'}" data-stack-depth="${depth}" style="--depth:${depth};z-index:${visible.length-depth}" aria-hidden="true">${s.name ? `<span class="cm-bcard-name">${e(s.name)}</span><img src="${e(pictureOf(s.name))}" alt="" draggable="false" referrerpolicy="no-referrer">` : ''}</span>`;}).join('')}</button></div></div></section>`;
    }
    const rows = [];
    for (const s of [...items].reverse()) {
      const last = rows[rows.length - 1];
      if (last && s.name && last.s.name === s.name && last.s.playerId === s.playerId && last.s.kind === s.kind) last.n += 1; else rows.push({s, n: 1});
    }
    /* THE SPELL IS SEEN WHILE IT RESOLVES (Rob, 2026-10-11: "I can't even see the card now ... they should appear on the
       battlefield while being resolved"): the top of the stack drawn as its card, above the list; a face-down spell is a
       back (CR 708.5). And each entry with a name shows its card at the hover's size beside the box, under the pointer,
       on a focus or a tap (Rob: "hover over the card name in the On the Stack screen to see the pop-up size image"). */
    const top = items[items.length - 1];
    const topCard = top.name ? `<div class="cm-stack-top"><span class="cm-bcard cm-stack-card" role="img" aria-label="${e(top.name)}, on the stack"><span class="cm-bcard-name">${e(top.name)}</span><img src="${e(pictureOf(top.name))}" alt="" loading="lazy" referrerpolicy="no-referrer"></span></div>`
      : `<div class="cm-stack-top"><span class="cm-bcard is-back cm-stack-card" role="img" aria-label="A face-down spell, on the stack"></span></div>`;
    return `<section class="cm-board-stack" aria-label="The stack"><h3>On the stack · ${items.length}</h3>${topCard}<ol>${rows.map(({s, n}) => `<li${s.name ? ` class="cm-stack-entry" tabindex="0" data-stack-name="${e(s.name)}" aria-label="${e(s.name)}${n > 1 ? `, ${n} of them` : ""}, ${e(nameOf(s.playerId))}'s: show the card"` : ""}>${e(s.name || "A face-down spell")}${n > 1 ? ` <b>×${n.toLocaleString("en-US")}</b>` : ""} <span class="cm-muted">${e(nameOf(s.playerId))}</span></li>`).join("")}</ol></section>`;
  }
  /* PANEL ▸: the right panel of the handoff (Card · Tracker · History · Combat), sliding over the surface. */
  const PANEL_TABS = [["resources", "Turn Resources"], ["panel", "Panel"], ["history", "History"]];
  function panel() {
    if (!panelOpen) return "";
    const id = hover ?? selected, pick = id === null ? null : findCard(id);
    const tabs = `<div class="cm-panel-tabs" role="tablist" aria-label="Pane">${PANEL_TABS.map(([k, label]) => `<button type="button" role="tab" class="cm-panel-tab${panelTab === k ? " is-on" : ""}" data-action="board-panel-tab" data-view="${k}" aria-selected="${panelTab === k}">${label}</button>`).join("")}</div>`;
    const head = `<span class="cm-board-panelgrip">${grip("panelw", "The pane's width: drag, or use the arrow keys", panelWidth(), PANELW, "vertical")}</span><header>${tabs}${ib("✕", "board-panel", "Close the panel")}</header>`;
    if (panelTab === "resources") return `<aside class="cm-board-panel" aria-label="Turn Resources" data-tab="resources">${head}${turnResources()}</aside>`;
    if (panelTab === "history") return `<aside class="cm-board-panel" aria-label="History" data-tab="history">${head}<section class="cm-panel-history is-whole"><h3>History · newest first</h3>${historyList()}</section></aside>`;
    return `<aside class="cm-board-panel" aria-label="Panel" data-tab="panel" style="--split:${Math.round(splitOf("panel") * 100)}%">${head}
      <section class="cm-panel-pick">${pick && pick.name ? `<div class="cm-panel-card">${card(pick, {where: "pick", action: "board-zoom-open"})}<div class="cm-board-options">${optionsFor(pick.cardId).map((o) => `<button type="button" class="v-button compact primary" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${sayHtml(o)}</button>`).join("")}</div></div>` : `<p class="cm-muted">Click a card on the board or in your hand to keep it here.</p>`}</section>
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
  /* As HTML, an offer that helps an opponent or is aimed against your own marked where it says so (Rob, 2026-10-12: "some
     indicator ... distinguishing it from spells that are negative"; game/room/room.mjs, `leaning`). */
  const sayHtml = (o) => (o.lean ? e(sayFor(o)).replace(e(o.lean), `<span class="cm-lean${o.lean.startsWith("helps") ? " is-helps" : " is-against"}">⚠ ${e(o.lean)}</span>`) : e(sayFor(o)));
  function blockDraft() {
    const d = view.decision, label = id => {const c = combatCard(id); return `${c ? combatName(c) : "Object"} #${id}`;};
    const tile = (id, action, selected, index) => {
      const c = combatCard(id);
      return `<button type="button" class="cm-block-tile" data-action="${action}" data-block-object="${id}"${index === undefined ? "" : ` data-index="${index}"`} aria-pressed="${selected}"${sending ? " disabled" : ""}>
        ${c?.name && !c.faceDown ? `<img src="${e(pictureOf(c.name))}" alt="" loading="lazy">` : ""}<span>${e(label(id))}</span></button>`;
    };
    const options = d.options.filter(o => d.legalBlocks.some(b => b.blocker === o.cardId && b.attackers.includes(o.attackerId)));
    const selected = options.filter(o => o.cardId === blockSelected);
    const result = blockResult?.key === blockKey() ? blockResult : null;
    return `<div class="cm-block-draft"><p>Choose a blocker, then its attackers. Draft stays private until confirmed.</p>
      <div class="cm-block-tiles" data-block-key="${e(`${blockEpoch}:blockers`)}" aria-label="Choose a blocker">${d.legalBlocks.map(b => tile(b.blocker, "board-block-select", blockSelected === b.blocker)).join("") || "No legal blockers."}</div>
      ${blockSelected !== null ? `<p>Attackers for ${e(label(blockSelected))} · select again to remove</p><div class="cm-block-tiles" data-block-key="${e(`${blockEpoch}:attackers:${blockSelected}`)}" aria-label="Legal attackers">${selected.map(o => tile(o.attackerId, "board-block-pair", picked.includes(o.index), o.index)).join("")}</div>${b("Clear this blocker", "board-block-clear", {}, false, {disabled:sending})}` : ""}
      <ul class="cm-block-pairs" aria-label="Your private block draft">${options.filter(o => picked.includes(o.index)).map(o => `<li data-draft-blocker="${o.cardId}" data-draft-attacker="${o.attackerId}">${e(label(o.cardId))} → ${e(label(o.attackerId))} ${b("Remove", "board-block-pair", {index:o.index}, false, {disabled:sending})}</li>`).join("") || "<li>No blocks selected</li>"}</ul>
      <div class="cm-block-status" role="status">${result ? result.ok && result.open ? "The table accepts this draft." : result.reasons.map(r => `<p>${e(r)}</p>`).join("") : "Checking blocks with the table…"}</div>
      ${result && !result.open ? b("Check again", "board-block-retry") : ""}
      <details class="cm-block-list"${blockListOpen ? " open" : ""}><summary>All block options</summary>${options.map(o => `<button type="button" class="v-button compact" data-action="board-option" data-index="${o.index}" aria-pressed="${picked.includes(o.index)}"${sending ? " disabled" : ""}>${e(o.label)} · #${o.cardId} → #${o.attackerId}</button>`).join("")}</details></div>`;
  }
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
        /* A land just played goes back to the hand as one would take it back at a table, by its double-click: no button. */
        if (o.act === "pass" || o.act === "resolve-all" || o.act === "undo-land") continue;
        const key = `${o.act}|${o.label}`;
        if (seen.has(key)) seen.get(key).n += 1; else seen.set(key, {o, n: 1});
      }
      if (!seen.size) return "";
      /* A card that can be used more than one way -- a spell's targets, a cost's sacrifice, a land's colors -- asks which
         in its pop-up rather than doing the first (Rob, 2026-10-01). */
      const ways = (o) => new Set(d.options.filter((x) => x.act === o.act && x.label === o.label && x.detail).map((x) => x.detail)).size;
      body = [...seen.values()].map(({o, n}) => ways(o) > 1
        ? `<button type="button" class="v-button compact" data-action="board-choose" data-card="${o.cardId}"${sending ? " disabled" : ""}>${e(verbFor(o))} <span class="cm-muted">· ${ways(o)} ways</span></button>`
        : `<button type="button" class="v-button compact" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${sayHtml(o)}${n > 1 ? ` <span class="cm-muted">×${n}</span>` : ""}</button>`).join("");
      return `<section class="cm-board-decision is-also" id="cm-board-decision" aria-label="What you can do"><h3>You can also</h3><div class="cm-board-options">${body}</div></section>`;
    }
    if (["one", "boolean", "index"].includes(d.mode)) body = d.options.map((o) => opt(o)).join("");
    else if (blocking()) {
      body = blockDraft();
      foot = `${b("No blocks", "board-block-none", {}, false, {disabled:sending})}${b(picked.length ? "Confirm blocks" : "Confirm no blocks", "board-confirm", {}, true, {disabled:!blockValid() || sending})}`;
    }
    /* WHAT YOU WERE SHOWN (ROB-169): an acknowledgment about cards ("Peek: you look at Maya's hand") draws them, each one
       to read (Card zoom on a click); this seat alone is sent them, in its own decision. OK answers it. */
    else if (d.mode === "ack") {
      const shown = d.options.filter((o) => o.cardId !== undefined && o.label);
      if (shown.length) body = `<div class="cm-board-shown">${shown.map((o) => card(shownCard(o.cardId), {where: "peek", action: "board-zoom-open"})).join("")}</div>`;
      foot = b("OK", "board-confirm", {}, true, {disabled: sending});
    }
    else if (d.mode === "many") {
      /* ATTACK ALL (Rob's one-person, three-AI table, Oct 21): a swarm sent at one player in one press -- "All at Maya" picks,
         for every creature that may attack her, its option at her, keeping any other creature's pick; "None" clears them.
         The engine offers one option per creature per player (rules/combat.mjs), so a Krenko swarm at three opponents was
         a pick per goblin. Nothing is sent until Confirm, and the room checks the attack as ever. */
      const atPlayers = String(d.id).startsWith("declare-attackers:")
        ? [...new Set(d.options.filter((o) => o.defenderId !== undefined && o.planeswalkerId === undefined).map((o) => o.defenderId))] : [];
      const allAt = atPlayers.length ? `<div class="cm-board-attack-all" role="group" aria-label="Attack with every creature that can">${atPlayers.map((id) =>
        b(`All at ${players().find((p) => p.playerId === id)?.name ?? `Seat ${id + 1}`}`, "board-attack-all", {defender: String(id)}, false, {cls: "compact", disabled: sending})).join("")}${picked.length
        ? b("None", "board-attack-none", {}, false, {cls: "compact", disabled: sending}) : ""}</div>` : "";
      body = allAt + d.options.map((o) => opt(o, ` aria-pressed="${picked.includes(o.index)}"`)).join("");
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
    /* Asked in a run you chose Resolve all for: this answer goes for the same question each time the run asks it (Rob,
       2026-10-09: "Yes to all"; game/room/room.mjs). */
    const forRun = d.forRun ? `<p class="cm-muted cm-board-for-run">Resolve all: your answer goes for this same question each time the run asks it.</p>` : "";
    return `<section class="cm-board-decision${blocking() ? " is-blocking" : ""}" id="cm-board-decision" data-choice-id="${e(d.id)}" data-match-id="${e(view.matchId)}" aria-label="${e(d.title)}"><h3${sentence ? ' class="is-sentence"' : ""}>${e(d.title)}</h3>${forRun}
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
    return `<section class="cm-board-decision cm-board-went" aria-label="${e(span)}"><h3>${e(span)}</h3>
      <ol class="cm-board-went-list">${rows}</ol><div class="cm-board-decision-foot"><span class="cm-muted">${now}</span>${b("OK", "board-went-close", {}, false, {cls: "compact"})}</div></section>`;
  }
  function ask() {
    const d = view.decision, inner = `${went()}${moduleSide("stack") ? "" : stack()}${!moduleSide("actions") && d && d.kind !== "priority" && d.kind !== "draw" ? decision() : ""}`;
    return inner ? `<div class="cm-board-ask">${inner}</div>` : "";
  }
  const alsoCount = () => {const d = view.decision; return d && d.kind === "priority" ? new Set(d.options.filter((o) => o.act !== "pass" && o.act !== "resolve-all" && o.act !== "undo-land").map((o) => `${o.act}|${o.label}`)).size : 0;};
  function alsoButton() {
    if(moduleSide("actions")) return "";
    const d = view.decision;
    if (!d || d.kind !== "priority" || view.status === "finished") return "";
    if (!alsoCount()) return "";
    return `<span class="cm-board-tools">${opens(b(`You can also ▾`, "board-also", {}, false, {cls: `compact${alsoOpen ? " is-on" : ""}`}), alsoOpen)}${alsoOpen ? `<div class="cm-board-menu cm-board-also" role="dialog" aria-label="What you can do">${decision()}</div>` : ""}</span>`;
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
  /* TURN RESOURCES (Rob's note 9, 2026-10-11: "by land and by card type: how many can be played this turn, how many in
     all, and the mana tapped"). Everything here is read from the view and the decision, nothing worked out: castable is
     what the decision offers for the card (the fact that brightens it); the lands are the mat's, untapped over all, by
     name; the pool is the player's mana as the room sends it. */
  const RES_TYPES = ["Land", "Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker"];
  const resType = (c) => !c.name ? "Other" : c.types.includes("Land") ? "Land"
    : (c.types.includes("Instant") || (c.keywords || []).some((k) => /^flash$/i.test(k))) ? "Instant" : RES_TYPES.find((t) => c.types.includes(t)) || "Other";
  function turnResources() {
    const me = players()[view.seat];
    if (!me) return "";
    const live = view.decision && !sending, hand = me.zones.Hand.cards, field = controlledCards(me.playerId);
    const byType = Object.fromEntries([...RES_TYPES, "Other"].map((t) => [t, {now: 0, all: 0}]));
    for (const c of hand) {const t = resType(c); byType[t].all += 1; if (live && optionsFor(c.cardId).length) byType[t].now += 1;}
    const typeRows = [...RES_TYPES, "Other"].filter((t) => byType[t].all || t !== "Other").map((t) => `<li data-type="${t}"${byType[t].now ? ' class="is-live"' : ""}><span>${t === "Instant" ? "Instant · flash" : t}</span><b>${byType[t].now}/${byType[t].all}</b></li>`).join("");
    const lands = field.filter((c) => c.types.includes("Land")), untapped = lands.filter((c) => !c.tapped).length;
    const byLand = new Map();
    for (const c of lands) {const k = c.name || "A face-down land"; const r = byLand.get(k) || {up: 0, all: 0}; r.all += 1; if (!c.tapped) r.up += 1; byLand.set(k, r);}
    const BASICS = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
    const landRows = [...byLand].sort((a, b) => (BASICS.indexOf(a[0]) === -1 ? 9 : BASICS.indexOf(a[0])) - (BASICS.indexOf(b[0]) === -1 ? 9 : BASICS.indexOf(b[0])) || a[0].localeCompare(b[0]))
      .map(([name, r]) => `<li${r.up ? ' class="is-live"' : ""}><span>${e(name)}</span><b>${r.up}/${r.all}</b></li>`).join("");
    const pool = me.mana.reduce((n, m) => n + m.amount, 0);
    const pips = me.mana.filter((m) => m.amount > 0).map((m) => `<span class="cm-res-pip" data-color="${e(m.color)}" aria-label="${m.amount} ${e(m.color)}"><i></i>${m.amount}</span>`).join("");
    const castable = live ? new Set(view.decision.options.filter((o) => o.cardId !== undefined && ["cast", "play-land", "activate"].includes(o.act)).map((o) => o.cardId)).size : 0;
    return `<section class="cm-resources" aria-label="Turn Resources">
      <h3>This turn</h3>
      <ul class="cm-res-list cm-res-summary"><li><span>Land drop</span><b>${me.landsPlayed ? "used" : "1 left"}</b></li><li><span>Mana in pool</span><b>${pool}</b></li><li><span>Lands untapped</span><b>${untapped}/${lands.length}</b></li><li><span>Lands tapped</span><b>${lands.length - untapped}</b></li><li><span>Cards you can use now</span><b>${castable}</b></li></ul>
      ${pips ? `<div class="cm-res-pips" aria-label="Mana pool">${pips}</div>` : ""}
      <h3>Your hand by type <span class="cm-muted">castable now / in hand</span></h3>
      <ul class="cm-res-list" aria-label="Your hand by type">${typeRows}</ul>
      <h3>Your lands <span class="cm-muted">untapped / all</span></h3>
      <ul class="cm-res-list" aria-label="Your lands by name">${landRows || `<li class="cm-muted"><span>No lands on your board yet.</span></li>`}</ul>
      <p class="cm-muted">Castable is what the table offers you for the card right now, the same fact that lights it. ${live ? "" : "Nothing is castable while it is not your decision."}</p></section>`;
  }
  function hand() {
    const mine = players()[view.seat];
    if (!mine) return "";
    const cards = mine.zones.Hand.cards;
    const bar = `<div class="cm-board-traybar">${grip("hand", "The hand's size: drag, or use the arrow keys; the boards keep theirs", scaleOf("hand"), C.cardScaleRange())}${scaleSlider("hand", "Hand cards")}</div>`;
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
      const acts = opts.map((o, i) => `<button type="button" class="v-button${i === 0 ? " primary" : ""}" data-action="board-hand-do" data-index="${o.index}"${sending ? " disabled" : ""}>${sayHtml(o)}${i === 0 ? " · Enter" : ""}</button>`).join("");
      return `<div class="cm-hand-show is-held" role="dialog" aria-modal="true" aria-label="${e(c.name)}, held">${close}
        <div class="cm-hand-held">${card(c, {where: "held", action: "board-hand-back"})}</div>
        <div class="cm-actions cm-hand-acts">${acts || `<span class="cm-muted cm-hand-why">${e(c.why || "Nothing to do with it now.")}</span>`}${b("Back to hand", "board-hand-back")}</div>
        <div class="cm-hand-rest">${cards.filter((x) => x.cardId !== held).map((x) => card(x, {where: "rest", action: "board-hand-hold"})).join("")}</div></div>`;
    }
    const fanned = cards.map((c, k) => {const o = k - (n - 1) / 2; return `<div class="cm-hand-slot" style="--o:${o};--a:${Math.abs(o)}" data-key="${k + 1}">${card(c, {where: "fan", action: "board-hand-hold"})}<span class="cm-hand-key">${k + 1}</span></div>`;}).join("");
    return `<div class="cm-hand-show" role="dialog" aria-modal="true" aria-label="Your hand">${close}
      <header><h2>Your hand · ${n}</h2><p class="cm-muted">${phone() ? "Swipe to browse · tap a card to hold it up · bright = castable now" : `Hover to read · click to choose · 1–${Math.min(9, n) || 1} keys · Space or ✕ to put it away · bright = castable now`}</p></header>
      <div class="cm-hand-fan" style="--gaps:${Math.max(1, n - 1)}">${fanned}</div></div>`;
  }
  /* CARD ZOOM. A card under the pointer a moment is shown large at the center of the screen (Rob, 2026-09-29: the
     pop-up centered, and larger); in Full screen it fills the right column instead. A long press, or a right
     click, opens it with what can be done with it. */
  function findCard(cardId) {
    for (const p of players()) for (const c of visibleCards(p)) if (c.cardId === cardId) return c;
    return null;
  }
  /* A card this seat was shown in its own decision (ROB-169: a look at another player's hand), which is not on any zone it
     can see: read from the decision, by name. */
  const shownCard = (cardId) => {
    const o = view?.decision?.mode === "ack" ? view.decision.options.find((x) => x.cardId === cardId && x.label) : null;
    return o ? {cardId: o.cardId, name: o.label, types: [], power: null, counters: {}} : null;
  };
  function zoom(cardId) {
    const c = findCard(cardId) || shownCard(cardId);
    if (!c || !c.name) return;
    const opts = optionsFor(c.cardId);
    const acts = opts.map((o) => `<button type="button" class="v-button primary" data-action="board-zoom-do" data-index="${o.index}"${sending ? " disabled" : ""}>${sayHtml(o)}</button>`).join("");
    /* More than one way to use it: the ways listed to choose from, as many as there are, above Close. */
    if (opts.length > 1) return C.modal(c.name, `<div class="cm-board-zoom is-choosing">${card(c, {where: "zoom", action: "close"})}</div><p class="cm-board-choose-say">Choose one:</p><div class="cm-board-choices" role="group" aria-label="Ways to use ${e(c.name)}">${acts}</div><div class="cm-form-footer">${b("Close", "close")}</div>`);
    C.modal(c.name, `<div class="cm-board-zoom">${card(c, {where: "zoom", action: "close"})}</div>${!acts && c.why ? `<p class="cm-muted cm-hand-why">${e(c.why)}</p>` : ""}<div class="cm-form-footer">${acts}${b("Close", "close", {}, !acts)}</div>`);
  }
  /* The peek follows the pointer: it is put away when the pointer leaves the card -- and, since a card redrawn or moved
     away from under a still pointer never says it was left (Rob, 2026-10-09: ending the game left a Plains shown large,
     "I couldn't click off of it"), by any press or Escape; and the board redrawn while it waits to show, it shows only if
     a card of that id is still under the pointer (`stillUnder`). */
  let peekTimer = null, peekId = null, pointerAt = null;
  function peek(el) {
    clearTimeout(peekTimer);
    peekTimer = null;
    const old = document.getElementById("cm-board-peek");
    if (!el) {peekId = null; if (old) old.remove(); return;}
    peekId = Number(el.dataset.card);
    peekTimer = setTimeout(() => {
      peekTimer = null;
      if (!el.isConnected && !stillUnder(peekId)) {peekId = null; return;}
      const c = findCard(Number(el.dataset.card));
      if (!c || !c.name || !document.getElementById("cm-board")) return;
      const div = old || Object.assign(document.createElement("div"), {id: "cm-board-peek", className: "cm-board-peek"});
      /* Said as well as shown, by the board's status region; the picture itself is not read twice. */
      div.setAttribute("aria-hidden", "true");
      div.innerHTML = card(c, {where: "peek", action: "none"});
      if (!old) document.getElementById("cm-board").append(div);
      say(`Showing ${c.name}`);
    }, 350);
  }
  /* A STACK ENTRY'S CARD, beside the On the stack box at the hover's size: to its left where the window has the room,
     else below it; within the window either way. One at a time, gone on leaving, on a second tap, or on Escape. */
  let stackShown = null;
  function stackPeek(li) {
    const old = document.getElementById("cm-stack-peek");
    if (!li || !li.isConnected) {stackShown = null; if (old) old.remove(); return;}
    const name = li.dataset.stackName, box = li.closest(".cm-board-stack").getBoundingClientRect();
    stackShown = name;
    const div = old || Object.assign(document.createElement("div"), {id: "cm-stack-peek", className: "cm-board-peek cm-stack-peek"});
    div.setAttribute("aria-hidden", "true");
    div.innerHTML = `<span class="cm-bcard"><span class="cm-bcard-name">${e(name)}</span><img src="${e(pictureOf(name))}" alt="" referrerpolicy="no-referrer"></span>`;
    if (!old) document.getElementById("cm-board").append(div);
    const shown = div.firstElementChild.getBoundingClientRect(), w = shown.width, h = shown.height, gap = 12;
    const left = box.left - w - gap >= 8 ? box.left - w - gap : Math.min(Math.max(8, box.left), innerWidth - w - 8);
    const top = box.left - w - gap >= 8 ? Math.min(Math.max(8, box.top), innerHeight - h - 8) : Math.min(box.bottom + gap, innerHeight - h - 8);
    div.style.left = `${Math.round(left)}px`; div.style.top = `${Math.round(top)}px`;
    div.dataset.side = box.left - w - gap >= 8 ? "left" : "below";
    say(`Showing ${name}`);
  }
  function stillUnder(id) {
    const under = pointerAt && document.elementFromPoint(pointerAt.x, pointerAt.y);
    const el = under && under.closest && under.closest(".cm-board .cm-bcard[data-card]");
    return !!el && Number(el.dataset.card) === id && !el.closest(".cm-board-peek");
  }
  /* A PHONE: the shorter side of the screen at most 500px. One Focused view, native whichever way the phone is held (Linear
     ROB-18; Rob, Oct 18: "Go with ... the upright Focused phone layout"): the rail and Camera along the top, the seats, the
     turn and what is asked always in view, and the battlefield with its lands at full width between them, scrolling, the
     piles beneath. Turned sideways, the seats are a column at the right. The hand opens as a drawer from the bottom.
     Camera has no view switch and no Tilt. Codex's design, ported from its Oct 18 prototype (ui-prototypes/phone-focus). */
  const phone = () => Math.min(innerWidth, innerHeight) <= 500;
  function phoneView() {
    const s = view.state, me = players()[view.seat], p = players()[focus] || me, mine = p.playerId === view.seat;
    const {step, next} = stepInfo();
    const icon = (glyph, action, label, extra = "") => `<button type="button" class="cm-phone-icon" data-action="${action}" aria-label="${e(label)}" title="${e(label)}">${glyph}${extra}</button>`;
    const rail = `<nav class="cm-phone-rail" aria-label="Board">
      ${icon("✋", "board-show-hand", "Your hand", `<span class="cm-phone-badge">${me.zones.Hand.count}</span>`)}
      <span class="cm-board-tools">${icon(CLOCK, "board-history", "History")}${historyOpen ? historyMenu() : ""}</span>
      ${icon(COACH, "board-coach", "CrankMagic Coach")}
      <span class="cm-board-tools">${stageProfile(me)}</span></nav>`;
    const pill = mine
      ? `<div class="cm-phone-pill"><b>T${s.turn}</b><span class="cm-board-step">${e(step)}</span>${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
          ${passButton()}${view.state.turnPlayerId !== view.seat ? skipControl(true) : ""}</div>`
      : `<div class="cm-phone-pill"><span>Viewing ${e(p.name)}</span>${b("My board", "board-focus", {seat: String(view.seat)}, true, {cls: "compact"})}${view.state.turnPlayerId !== view.seat ? skipControl(true) : ""}</div>`;
    const seats = [me, ...players().filter((x) => x.playerId !== view.seat)];
    const strip = `<aside class="cm-phone-seats" aria-label="Seats">
      ${seats.map((x) => `<button type="button" class="cm-phone-seat${x.playerId === p.playerId ? " is-focus" : ""}" data-action="board-focus" data-seat="${x.playerId}" aria-pressed="${x.playerId === p.playerId}" style="--seat:${seatColor(x.playerId)}">
        <span>${e(x.playerId === view.seat ? "You" : x.name)}</span><b>${x.health.life}</b><small>${e(seatFlag(x))}</small></button>`).join("")}
      <div class="cm-phone-rotate">${b("‹", "board-rotate", {by: "-1"}, false, {cls: "compact"})}${b("›", "board-rotate", {by: "1"}, false, {cls: "compact"})}</div></aside>`;
    return `${rail}${cameraMenu()}${strip}<div class="cm-phone-center">${pill}${combatStrip()}<div class="cm-phone-battlefield" tabindex="0" aria-label="Battlefield, scroll to explore">${mat(p, {size: "phone", head: "none"})}</div><div class="cm-phone-ask">${went()}${decision()}${stack()}</div></div>`;
  }
  /* THE COACH (the handoff's play-coach). It lives beside the board, not inside it, so the views that arrive
     while someone types redraw the board and leave the composer, and whatever is in it, alone. */
  const stepNow = () => {const s = view.state, at = stepAt(s.phase); return s.turn ? `Turn ${s.turn} · ${at < 0 ? "Opening hands" : STEPS[at][0]}` : "Before turn 1";};
  /* What the Coach sees, as the person's AI Coach settings say (AI-6): their hand too, or their board only. */
  const handShared = () => C.state.preferences?.aiCoach?.coachSees !== "board";
  function coachContext() {return `Sees your board${handShared() ? ", hand" : ""} and the table${handShared() ? "" : " (your hand withheld)"} · turn ${view && view.state.turn ? view.state.turn : 0}`;}
  function drawCoach() {
    const panelEl = document.getElementById("cm-board-coach");
    if (!panelEl) return;
    panelEl.hidden = !coach.open;
    /* In Full screen the Coach is not a slide-over: it takes the side column's lower half, under the log (item 22). */
    panelEl.classList.toggle("is-docked", mode === "full" && !phone() && !moduleSide("coach"));
    if (!coach.open) {panelEl.innerHTML = ""; return;}
    dock();
    /* A redraw keeps what the reader has in hand: the draft, its focus, and ⋯ if it is open (a rebuilt <details> is
       shut, and the Coach's reply lands on its own timer, so it would snap the menu shut under a pointer). Focus in ⋯
       stays on ⋯ or on Clear chat; once ⋯ has closed (Clear chat closes it), it goes back to ⋯. */
    const keep = panelEl.querySelector(".cm-coach-input"), more = panelEl.querySelector(".cm-coach-more"), active = document.activeElement;
    const typed = keep ? keep.value : "", focused = keep && active === keep, moreOpen = !!(more && more.open);
    const moreFocus = more && more.contains(active) ? (moreOpen && active.matches("[data-action=board-coach-clear]") ? "[data-action=board-coach-clear]" : "summary") : null;
    /* A card the Coach names is written [[like this]]: shown in bold, the brackets dropped. */
    const said = (t) => e(t).replace(/\[\[([^\]]{1,200})\]\]/g, "<b>$1</b>");
    const extras = (m, i) => {
      if (m.signIn) return `<div class="cm-coach-chips"><a class="v-button compact" href="/api/ai/login?to=${encodeURIComponent(`#table?id=${tableId}`)}">Sign in to the Coach</a></div>`;
      const chips = [(m.show || []).length ? b("Show me", "board-coach-show", {i}, false, {cls: "compact"}) : "", (m.plays || []).length || m.threat ? b(m.open ? "Hide why" : "Why?", "board-coach-why", {i}, false, {cls: "compact"}) : ""].join("");
      const why = m.open ? `<ul class="cm-coach-why">${(m.plays || []).map((p) => `<li><b>${e(p.action)} ${e(p.card)}</b> · ${e(p.why)}</li>`).join("")}${m.threat ? `<li><b>The threat: ${e(m.threat.seat)}</b> · ${e(m.threat.why)}</li>` : ""}</ul>` : "";
      return chips ? `<div class="cm-coach-chips">${chips}</div>${why}` : "";
    };
    const bubble = (m, i) => m.divider ? `<li class="cm-coach-divider"><span>${e(m.divider)}</span></li>`
      : m.from === "coach" ? `<li class="cm-coach-msg is-coach"><span class="cm-coach-avatar">${COACH}</span><div class="cm-coach-said"><p>${said(m.text)}</p>${extras(m, i)}</div></li>`
      : `<li class="cm-coach-msg is-${m.from}"><p>${e(m.text)}</p></li>`;
    panelEl.innerHTML = `<header class="cm-coach-head"><span class="cm-coach-logo">${COACH}</span>
        <div><h2><span class="cm-coach-brand">CrankMagic </span>Coach</h2><p class="cm-muted" id="cm-coach-context">${e(coachContext())}</p></div>
        <details class="cm-coach-more"${moreOpen ? " open" : ""}><summary aria-label="More">⋯</summary><div>${b("Clear chat", "board-coach-clear")}</div></details>
        <button type="button" class="v-button compact" data-action="board-coach" aria-label="Close the Coach">✕</button></header>
      <ol class="cm-coach-thread">${coach.thread.map(bubble).join("") || `<li class="cm-coach-empty cm-muted">Ask about your board, your hand, or the table.</li>`}
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
  /* A question to the Coach: POST /api/ai/coach with the table and the question, nothing more -- the table says what is
     on it (cloud/worker.mjs). Signed in to the library only, the AI door's sign-in answers with a redirect, which a
     fetch cannot follow: the reply is then a link to sign in, which comes back here. Any refusal reads as the door said it. */
  async function ask_(text) {
    const q = String(text || "").trim();
    if (!q || !view || coach.typing) return;
    const here = stepNow(), last = [...coach.thread].reverse().find((m) => m.divider);
    if (!last || last.divider !== here) coach.thread.push({divider: here});
    coach.thread.push({from: "you", text: q});
    coach.typing = true;
    /* Clear chat, closing the board or leaving the table moves `asked` on: a reply still on its way is then dropped. */
    const turn = (coach.asked += 1);
    drawCoach();
    let said;
    try {
      const r = await fetch("/api/ai/coach", {method: "POST", credentials: "same-origin", redirect: "manual",
        /* AI Coach settings (AI-6): "My board only" withholds the hand from what the Coach is sent. */
        headers: {"content-type": "application/json", "x-crankmagic": "ai"}, body: JSON.stringify({tableId, question: q, ...(handShared() ? {} : {hand: false})})});
      if (r.type === "opaqueredirect" || r.status === 401) said = {text: "Sign in to the Coach first: it has its own sign-in, with Google.", signIn: true};
      else {
        const j = await r.json().catch(() => null);
        said = r.ok && j && j.answer ? {text: j.answer, plays: j.plays || [], show: j.show || [], ...(j.threat ? {threat: j.threat} : {})}
          : {text: (j && j.error) || "The Coach could not answer just now. Try again in a moment."};
      }
    } catch {said = {text: "The Coach could not be reached. Try again in a moment."};}
    if (coach.asked !== turn) return;
    coach.typing = false;
    coach.thread.push({from: "coach", ...said});
    drawCoach();
    /* the reply said by the board's status region: the thread is drawn anew with each message */
    say(`The Coach: ${String(said.text).replace(/\[\[([^\]]{1,200})\]\]/g, "$1")}`);
  }
  function banner() {
    if (view.status === "finished") {
      const {head, line} = endingWords(view);
      /* PLAY AGAIN (ROB-167): the table's next game with the same seats, decks and rules, or Leave the table; Back to the
         table shows the lobby, where everyone's answers are. */
      const again = rematchAsked === null
        ? `${b("Play again", "board-rematch", {accept: "yes"}, true, {disabled: rematchSending})}${b("Leave the table", "board-rematch", {accept: "no"}, false, {disabled: rematchSending})}`
        : "";
      return `<div class="cm-board-over" role="dialog" aria-modal="false" aria-labelledby="cm-board-over-title"><div class="v-panel"><h2 id="cm-board-over-title">${e(head)}</h2><p class="cm-muted">${e(line)}</p>
        ${rematchError ? `<p class="cm-note cm-warning" role="alert">${e(rematchError)}</p>` : ""}
        <div class="cm-actions">${again}${b("Back to the table", "board-leave", {}, !again)}${recordButton()}</div></div></div>`;
    }
    const gone = departed(view.seat);
    if (gone) return `<p class="cm-board-banner">${LEFT}</p>`;
    return "";
  }
  const LEFT = "You have left this game; the others play on.";
  /* HOW IT ENDED, IN WORDS (ROB-166): from the room's `ending` (game/room/ending.mjs), who lost and why -- a person knocked
     out by three AI seats lost, and says so, rather than "the game was ended early". A view without `ending` (a room
     before it) keeps the words it always had. */
  const LOSS_WORDS = {life: ["Your life reached 0", "their life reached 0"], poison: ["Ten poison counters", "ten poison counters"],
    "commander-damage": ["21 combat damage from one commander", "21 combat damage from one commander"],
    "empty-library": ["You had to draw from an empty library", "they had to draw from an empty library"],
    effect: ["A card's effect made you lose", "a card's effect made them lose"], conceded: ["You conceded", "they conceded"]};
  const lossWords = (reason, mine) => {const w = LOSS_WORDS[reason]; return w ? w[mine ? 0 : 1] : mine ? "You lost" : "they lost";};
  function endingWords(v) {
    const r = v.result || {}, end = r.ending, me = v.seatId;
    const name = (seatId) => ((v.seats || []).find((s) => s.seatId === seatId) || {}).name || "A player";
    const onlyAi = "With only AI players left, the game ends here.";
    if (end && end.kind === "eliminated") return end.seatId === me
      ? {head: "You lost", line: `${lossWords(end.reason, true)}. ${onlyAi}`}
      : {head: `${name(end.seatId)} lost`, line: `${name(end.seatId)} was the last person in it; ${lossWords(end.reason, false)}. ${onlyAi}`};
    if (end && end.kind === "conceded") return end.seatId === me
      ? {head: "You conceded", line: onlyAi}
      : {head: `${name(end.seatId)} conceded`, line: onlyAi};
    if (end && end.kind === "timed-out") return end.seatId === me
      ? {head: "You ran out of time", line: `You were away too long. ${onlyAi} Its record is kept, as not finished.`}
      : {head: `${name(end.seatId)} ran out of time`, line: `${onlyAi} Its record is kept, as not finished.`};
    if (end && end.kind === "ended") return {head: "The game was ended early",
      line: `${end.seatId === me ? "You" : name(end.seatId)} ended it for everyone. Nobody lost; its record is kept, as not finished.`};
    if (end && end.kind === "draw") return {head: "A draw", line: "Everyone still in it lost at once."};
    const you = r.winner === me;
    const head = r.endedBy !== undefined || r.reason === "ended early" ? "The game was ended early"
      : you ? "You won" : r.winner ? `${name(r.winner)} won` : "The game is over";
    const line = r.reason === "ended early" ? "Nobody lost. Its record is kept, as not finished." : r.reason ? `${r.reason[0].toUpperCase()}${r.reason.slice(1)}.` : "";
    return {head, line};
  }
  /* PLAY AGAIN (ROB-167; the table's `POST .../rematch {accept}`, game/room/table.mjs): answered once from the banner. A
     game over in the room reaches the table a moment later (its alarm), so "still being played" is tried again for a few
     seconds before it is said. Then the lobby, which shows every seat's answer and the countdown. */
  let rematchAsked = null, rematchSending = false, rematchError = "";
  async function answerRematch(accept) {
    if (rematchSending || !tableId) return;
    rematchSending = true; rematchError = ""; draw();
    const id = tableId;
    try {
      for (let tries = 0; ; tries += 1) {
        try {await tableApi().api("POST", `${tableApi().tableUrl(id)}/rematch`, {accept}); break;}
        catch (error) {if (tries < 8 && /still being played/.test(String(error && error.message))) {await new Promise((r) => setTimeout(r, 750)); continue;} throw error;}
      }
      rematchAsked = accept;
      C.board.close();
      if (accept) await tableApi().refresh(id); else C.go("table");
    } catch (error) {
      rematchError = String((error && error.message) || error);
    } finally {rematchSending = false; if (document.getElementById("cm-board")) draw();}
  }
  /* ---- MOTION (Rob, 2026-10-12, from the Replit concept: "more fluid, better transitions") ----
     The board is drawn anew at every view, so nothing moves by itself. This is a FLIP pass around a paint caused by a
     new view of the same game: before it, where every card and pile is; after it, a card that changed zone -- played
     from the hand to the mat, drawn from the library into the hand, put from the mat into the graveyard or exile -- is
     flown from where it was to where it is (180 ms to the mat, 220 ms elsewhere), as a copy over the board while the real
     card waits unseen; a card that was tapped or untapped turns where it lies. Reduce motion (Settings, or the device)
     makes every one an instant change: nothing flies. Never more than eight flights a view, and never a hidden card: a
     card that was a back flies as a back. */
  let motionFor = null, turnLit = -1e9;
  const reduced = () => !!(globalThis.CrankMotion && CrankMotion.reduced());
  const FLY_MS = {field: 180, hand: 220, pile: 220};
  function motionSnapshot(host) {
    if (reduced() || phone()) return null;
    const cards = new Map(), piles = new Map();
    for (const el of host.querySelectorAll(".cm-bcard[data-card]")) {
      if (el.closest(".cm-board-peek, .cm-full-pick, .cm-panel-card, .cm-hand-show, .cm-board-mini")) continue;
      const id = Number(el.dataset.card);
      if (cards.has(id)) continue;
      const zone = el.closest(".cm-board-hand") ? "hand" : el.closest(".cm-board-pile") ? `pile:${el.closest(".cm-board-pile").dataset.zone}` : "field";
      cards.set(id, {rect: el.getBoundingClientRect(), zone, tapped: el.classList.contains("is-tapped"), back: el.classList.contains("is-back")});
    }
    for (const pile of host.querySelectorAll(".cm-mat .cm-board-pile")) {
      const mat = pile.closest(".cm-mat");
      piles.set(`${mat ? mat.dataset.seat : ""}:${pile.dataset.zone}`, pile.getBoundingClientRect());
    }
    return {cards, piles};
  }
  function motionPlay(host, before) {
    if (!before || !view || reduced()) return;
    const after = motionSnapshot(host);
    if (!after) return;
    let flights = 0;
    const seatOf = (el) => {const m = el.closest(".cm-mat"); return m ? m.dataset.seat : String(view.seat);};
    const fly = (el, from, to, ms, {back = false, tilt = 0} = {}) => {
      if (flights >= 8 || !from || !to || (Math.abs(from.left - to.left) < 6 && Math.abs(from.top - to.top) < 6)) return;
      flights += 1;
      const ghost = el.cloneNode(true);
      ghost.className = `cm-bcard cm-board-flight${back ? " is-back" : ""}`;
      ghost.removeAttribute("data-action"); ghost.removeAttribute("aria-label"); ghost.setAttribute("aria-hidden", "true");
      ghost.style.cssText = `position:fixed;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;margin:0;z-index:66;pointer-events:none;transform-origin:50% 50%`;
      document.body.append(ghost);
      el.style.visibility = "hidden";
      const sx = to.width / Math.max(1, from.width), sy = to.height / Math.max(1, from.height);
      const a = ghost.animate([{transform: "translate(0,0) scale(1,1) rotate(0deg)"}, {transform: `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${sx},${sy}) rotate(${tilt}deg)`}], {duration: ms, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards"});
      const done = () => {ghost.remove(); el.style.visibility = "";};
      a.finished.then(done, done);
      setTimeout(done, ms + 400);
    };
    for (const [id, now] of after.cards) {
      const was = before.cards.get(id), el = host.querySelector(`.cm-bcard[data-card="${id}"]:not(.cm-board-flight)`);
      if (!el) continue;
      if (was && was.zone !== now.zone) {
        /* hand to the mat, the mat to a pile: from where it was, to where it is */
        fly(el, was.rect, now.rect, now.zone === "field" ? FLY_MS.field : now.zone === "hand" ? FLY_MS.hand : FLY_MS.pile, {back: now.back, tilt: now.zone.startsWith("pile:graveyard") ? 8 : 0});
      } else if (!was && now.zone === "hand") {
        /* drawn: it lifts from the library into the hand */
        fly(el, before.piles.get(`${seatOf(el)}:library`) || null, now.rect, FLY_MS.hand, {back: false});
      } else if (was && was.tapped !== now.tapped && now.zone === "field") {
        /* turned where it lies */
        el.animate([{transform: now.tapped ? "rotate(0deg) scale(1)" : "rotate(90deg) scale(.86)"}, {transform: now.tapped ? "rotate(90deg) scale(.86)" : "rotate(0deg) scale(1)"}], {duration: 160, easing: "ease-out"});
      }
    }
    /* A card that left the mat for a pile whose top is another card: it flies to that pile and fades there. */
    for (const [id, was] of before.cards) {
      if (after.cards.has(id) || was.zone !== "field") continue;
      const c = findCard(id), zone = c ? (players().flatMap((p) => Object.entries(p.zones)).find(([, z]) => z.cards.some((x) => x.cardId === id)) || [])[0] : null;
      if (!zone || !["Graveyard", "Exile"].includes(zone)) continue;
      const owner = c && c.owner !== undefined ? c.owner : view.seat, to = after.piles.get(`${owner}:${zone.toLowerCase()}`);
      if (!to || flights >= 8) continue;
      flights += 1;
      const ghost = document.createElement("div");
      ghost.className = `cm-bcard cm-board-flight${was.back ? " is-back" : ""}`;
      ghost.setAttribute("aria-hidden", "true");
      if (!was.back && c && c.name) ghost.innerHTML = `<img src="${e(pictureOf(c.name))}" alt="" referrerpolicy="no-referrer">`;
      ghost.style.cssText = `position:fixed;left:${was.rect.left}px;top:${was.rect.top}px;width:${was.rect.width}px;height:${was.rect.height}px;margin:0;z-index:66;pointer-events:none`;
      document.body.append(ghost);
      const a = ghost.animate([{transform: "translate(0,0) rotate(0deg)", opacity: 1}, {transform: `translate(${to.left + to.width / 2 - was.rect.left - was.rect.width / 2}px,${to.top + to.height / 2 - was.rect.top - was.rect.height / 2}px) rotate(${zone === "Graveyard" ? 10 : -6}deg) scale(.6)`, opacity: .2}], {duration: 240, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards"});
      a.finished.then(() => ghost.remove(), () => ghost.remove());
      setTimeout(() => ghost.remove(), 700);
    }
  }

  /* ---- CALLOUTS (the Replit brief's overlay, fighting-game style): what just happened, called out over the table
     in a bold condensed word with a glyph, a number where there is one, and a line under it saying whose. Red for
     harm, blue for answers, green for growth, gold for value, violet for what fades. Each is read from the difference
     between the last view and this one, never from anything the view does not carry, and never names a hidden card.
     Three at most on screen, the oldest leaving first; each enters in 300 ms, holds 0.9 s plus the Overlay setting's
     share (Settings › Play, 0 to 100: 0 is off), and leaves in 150 ms. Reduce motion shows the final frame and the exit
     alone. The layer lies beside the board, so a view's repaint never takes a callout away mid-word. ---- */
  const overlay = () => {const v = Number((((C.state.preferences || {}).play || {}).overlay)); return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 60;};
  const GLYPH = {
    swords: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4l5 1 9 9-2 2-9-9zM21 4l-5 1-9 9 2 2 9-9zM5 17l2 2M17 17l2 2M4 20l3-3M20 20l-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    burst: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2 6 6-2-4 5 5 3-6 1 1 6-4-4-4 4 1-6-6-1 5-3-4-5 6 2z" fill="currentColor"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
    crack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 7l-2 4 3 2-2 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    trophy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 0 1-10 0zM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M12 13v4M8 21h8M9 17h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    pips: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="16" r="2.5" fill="currentColor"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/><circle cx="18" cy="5" r="2.5" fill="currentColor"/></svg>`,
    bloom: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    slash: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    seal: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    fade: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/></svg>`,
  };
  const LIFE_STEPS = new Set(["COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE"]);
  function calloutsFor(was, next) {
    const out = [], who = (i) => (i === next.seat ? "You" : ((next.state.players[i] || {}).name || `Seat ${i + 1}`));
    const seatName = (seatId) => ((next.seats.find((x) => x.seatId === seatId) || {}).name || seatId);
    const pw = Object.fromEntries(was.state.players.map((p) => [p.playerId, p]));
    if (next.status === "finished" && was.status !== "finished") {
      const r = next.result || {};
      out.push({tone: "value", glyph: "trophy", word: r.winner === next.seatId ? "VICTORY" : "GAME OVER", line: r.winner ? `${r.winner === next.seatId ? "You" : seatName(r.winner)} won` : "", big: true, final: true});
      return out;
    }
    if (next.state.turnPlayerId === next.seat && was.state.turnPlayerId !== next.seat) out.push({tone: "value", glyph: "trophy", word: "YOUR TURN", line: `Turn ${next.state.turn}`});
    /* attacks declared against you that were not there before */
    const mine = (s) => ((s.combat && s.combat.attacks) || []).filter((a) => a.defender === next.seat).map((a) => a.attacker);
    const before = new Set(mine(was.state)), incoming = mine(next.state).filter((id) => !before.has(id));
    if (incoming.length) out.push({tone: "harm", glyph: "swords", word: "INCOMING", number: incoming.length > 1 ? `×${incoming.length}` : "", line: `${incoming.length} attacking you`});
    /* something added to a stack that already held something */
    if (next.state.stack.length > was.state.stack.length && was.state.stack.length > 0) {const top = next.state.stack[next.state.stack.length - 1]; out.push({tone: "answer", glyph: "shield", word: "RESPONSE", line: top.name ? `${who(top.playerId)} · ${top.name}` : `${who(top.playerId)} · a face-down spell`});}
    /* life, per seat: in a combat damage step it is a hit; a seat that fell is KO */
    for (const p of next.state.players) {
      const w = pw[p.playerId]; if (!w) continue;
      const d = p.health.life - w.health.life;
      if (p.health.status === "lost" && w.health.status !== "lost") {out.push({tone: "harm", glyph: "seal", word: "KO", line: `${who(p.playerId)} · ${p.health.lossReason || "out of the game"}`, big: true}); continue;}
      if (d < 0 && LIFE_STEPS.has(next.state.phase)) out.push({tone: "harm", glyph: "burst", word: -d >= 10 ? "CRITICAL" : "HIT", number: String(d), line: `${who(p.playerId)} · ${p.health.life}`});
      else if (d < 0) out.push({tone: "harm", glyph: "crack", word: "LIFE", number: String(d), line: `${who(p.playerId)} · ${p.health.life}`});
      else if (d > 0) out.push({tone: "growth", glyph: "heart", word: "LIFE", number: `+${d}`, line: `${who(p.playerId)} · ${p.health.life}`});
      if (p.health.poison >= 10 && w.health.poison < 10) out.push({tone: "harm", glyph: "seal", word: "FATAL", line: `${who(p.playerId)} · 10 poison`, big: true});
      const most = (h) => Math.max(0, ...Object.values(h.commanderDamage || {}));
      if (most(p.health) >= 21 && most(w.health) < 21) out.push({tone: "harm", glyph: "seal", word: "FATAL", line: `${who(p.playerId)} · 21 from a commander`, big: true});
    }
    /* A SPELL THAT CAME AND WENT (Linear ROB-102; events.v1, docs/ui-lane/gameplay-anchor.md): with the stack passed for a
       person who had no answer to it (`passStack`), another player's spell can be cast and resolve between two of their
       views, never seen on the stack. The view's events say so (`cast`, then `resolve`), and so does this: who cast what,
       and that it resolved. Only for a view that moved on (a view sent again repeats its events), never the seat's own
       cast, never a spell still on the stack (that is a RESPONSE, above), at most three; a face-down spell is not named. */
    if (next.revision !== was.revision) {
      const evs = next.events || [], onStack = new Set(next.state.stack.map((x) => x.stackId ?? x.id));
      const resolved = new Set(evs.filter((x) => x.kind === "resolve").map((x) => x.stackId));
      const countered = new Set(evs.filter((x) => x.kind === "countered").map((x) => x.stackId));
      const came = evs.filter((x) => x.kind === "cast" && x.player !== next.seat && !onStack.has(x.stackId) && !countered.has(x.stackId)).slice(0, 3);
      for (const x of came) out.push({tone: "answer", glyph: "shield", word: "CAST",
        line: `${who(x.player)} · ${(x.card && x.card.name) || "a face-down spell"}${resolved.has(x.stackId) ? " · resolved" : ""}`});
    }
    /* the history's new lines: countered, proliferate, tokens */
    const seen = new Set((was.history || []).map((l) => `${l.turn}|${l.text}`));
    for (const l of (next.history || []).filter((l) => !seen.has(`${l.turn}|${l.text}`)).slice(0, 12)) {
      const t = l.text || "";
      if (/\bcountered\b/i.test(t)) out.push({tone: "answer", glyph: "slash", word: "COUNTERED", line: t.slice(0, 60)});
      else if (/\bproliferate/i.test(t)) out.push({tone: "growth", glyph: "pips", word: "PROLIFERATE", line: t.slice(0, 60)});
      else if (/created (\d+)\b.*\btokens?\b/i.test(t)) {const n = /created (\d+)/i.exec(t)[1]; out.push({tone: "value", glyph: "bloom", word: "TOKENS", number: `×${n}`, line: t.slice(0, 60)});}
    }
    /* permanents that left the mat for a graveyard or exile; counters that grew */
    const at = (s) => {const m = new Map(); for (const p of s.players) for (const [zone, z] of Object.entries(p.zones)) for (const c of z.cards) m.set(c.cardId, {zone, c, owner: p.playerId}); return m;};
    const a = at(was.state), b = at(next.state);
    let gone = 0;
    for (const [id, x] of a) {
      const y = b.get(id);
      if (x.zone === "Battlefield" && y && (y.zone === "Graveyard" || y.zone === "Exile") && gone < 2) {gone += 1; out.push(y.zone === "Graveyard" ? {tone: "harm", glyph: "burst", word: "DESTROYED", line: x.c.name || "A face-down permanent"} : {tone: "fade", glyph: "fade", word: "EXILED", line: x.c.name || "A face-down permanent"});}
      if (y && y.zone === "Battlefield" && x.zone === "Battlefield") {
        const grew = ["+1/+1", "loyalty"].map((k) => ((y.c.counters || {})[k] || 0) - ((x.c.counters || {})[k] || 0)).filter((n) => n > 0);
        if (grew.length) out.push({tone: "growth", glyph: "pips", word: "", number: `+${grew.reduce((n, v) => n + v, 0)}`, line: y.c.name || "A face-down permanent"});
      }
    }
    return out.slice(0, 6);
  }
  globalThis.CrankBoard.calloutsFor = calloutsFor;
  const SAMPLE_CALLOUTS = [{tone: "value", glyph: "trophy", word: "YOUR TURN", line: "Turn 9"}, {tone: "harm", glyph: "swords", word: "INCOMING", number: "×3", line: "3 attacking you"},
    {tone: "harm", glyph: "burst", word: "HIT", number: "-7", line: "You · 33"}, {tone: "answer", glyph: "slash", word: "COUNTERED", line: "Rhystic Study, by Counterspell"},
    {tone: "growth", glyph: "pips", word: "", number: "+2", line: "Ezuri, Renegade Leader"}, {tone: "value", glyph: "bloom", word: "TOKENS", number: "×4", line: "Krenko, Mob Boss"},
    {tone: "fade", glyph: "fade", word: "EXILED", line: "Sun Titan"}, {tone: "harm", glyph: "seal", word: "KO", line: "Maya · 0 life", big: true}];
  /* NEVER BEHIND THE GAME (Rob's one-person, three-AI table, Oct 21). The AI seats' turns come in bursts, each view up to
     six callouts, read one every ~0.6 s -- so over a game the queue fell turns behind: the solo run's last screen showed
     "YOUR TURN · Turn 33" on turn 38, over the game-over panel and its buttons. So when a view's callouts come, those
     still waiting from a view more than CALLOUT_STALE_MS before are passed over (a KO, a FATAL and the game's end never
     are), and the game's end clears the queue and the layer: its word is the last. One batch alone -- Try the callouts
     -- is read whole. */
  const CALLOUT_STALE_MS = 2000;
  function queueCallouts(queue, list, now) {
    const stamped = list.map((c) => ({...c, at: now}));
    if (list.some((c) => c.final)) return {queue: stamped, clear: true};
    return {queue: [...queue.filter((c) => c.big || now - c.at <= CALLOUT_STALE_MS), ...stamped], clear: false};
  }
  globalThis.CrankBoard.queueCallouts = queueCallouts;
  let calloutQueue = [], calloutTimer = null;
  function callouts(list) {
    const level = overlay();
    if (!level || !list.length) return;
    const next = queueCallouts(calloutQueue, list, performance.now());
    calloutQueue = next.queue;
    if (next.clear) {
      clearTimeout(calloutTimer); calloutTimer = null;
      const layer = document.getElementById("cm-board-callouts");
      if (layer) layer.replaceChildren();
    }
    if (!calloutTimer) nextCallout();
  }
  /* NEVER OVER A QUESTION (the same run's screens: "LIFE -1" and "LIFE -3" over Discard 1 card's options, "YOUR TURN"
     over the turns gone by). The callouts lie over the table, and a question asked of you is read first: with its panel
     under the layer, the layer moves below it, or above it, whichever has room, and with room for neither it waits out
     of sight. Placed as each callout comes and as the board is drawn (fit). */
  function placeCallouts() {
    const layer = document.getElementById("cm-board-callouts");
    if (!layer) return;
    layer.style.top = "";
    layer.classList.remove("is-hidden");
    const ask = document.querySelector("#cm-board-decision[data-choice-id], .cm-board-went");
    if (!ask || !layer.children.length) return;
    const a = ask.getBoundingClientRect(), l = layer.getBoundingClientRect(), gap = 8;
    if (!a.width || l.bottom <= a.top || l.top >= a.bottom || l.right <= a.left || l.left >= a.right) return;
    if (a.bottom + gap + l.height <= innerHeight - gap) layer.style.top = `${a.bottom + gap}px`;
    else if (a.top - gap - l.height >= gap) layer.style.top = `${a.top - gap - l.height}px`;
    else layer.classList.add("is-hidden");
  }
  function nextCallout() {
    calloutTimer = null;
    const layer = document.getElementById("cm-board-callouts");
    if (!layer || !calloutQueue.length) {calloutQueue = []; return;}
    const c = calloutQueue.shift(), level = overlay(), still = reduced();
    const el = document.createElement("div");
    el.className = `cm-callout is-${c.tone}${c.big ? " is-big" : ""}`;
    el.style.setProperty("--level", String(level / 100));
    el.innerHTML = `<span class="cm-callout-glyph">${GLYPH[c.glyph] || ""}</span><span class="cm-callout-word">${e(c.word)}${c.number ? `<b>${e(c.number)}</b>` : ""}</span>${c.line ? `<span class="cm-callout-line">${e(c.line)}</span>` : ""}`;
    while (layer.children.length >= 3) layer.firstElementChild.remove();
    layer.append(el);
    placeCallouts();
    if (!still) el.animate([{opacity: 0, transform: "scale(.4) rotate(-6deg) translateY(12px)"}, {opacity: 1, transform: "scale(1.06) rotate(0deg) translateY(0)", offset: .7}, {opacity: 1, transform: "scale(1) rotate(0deg) translateY(0)"}], {duration: 300, easing: "cubic-bezier(.2,.8,.2,1)"});
    const hold = 900 + level * 10 + (c.line ? 400 : 0);
    setTimeout(() => {
      const out = el.animate([{opacity: 1, transform: "scale(1)"}, {opacity: 0, transform: "scale(1.12)"}], {duration: still ? 0 : 150, fill: "forwards"});
      out.finished.then(() => el.remove(), () => el.remove());
      setTimeout(() => el.remove(), 400);
    }, hold);
    /* the next one a beat later, so two in a row are read one at a time */
    calloutTimer = setTimeout(nextCallout, Math.min(700, hold / 3));
  }
  actions["board-callout-demo"] = () => {tools = false; draw(); callouts(SAMPLE_CALLOUTS);};

  /* WHAT THE OTHER PLAYERS PLAY, HELD UP TO SEE (Rob, 2026-10-21: "AI player's plays should pause and show each card it
     plays as a pop-up on my screen that fades after 10 seconds or I click close on it"). Each spell cast and land played by
     another seat -- from the view's events (events.v1), so one cast and resolved between two of your views is shown too --
     is its card, large, under its player's name, at the side of the table: it fades after PLAY_MS, waits while the pointer
     is on it, and goes at its ✕; a click on the card shows it larger. The newest PLAYS_SHOWN at once. Never a face-down
     card, never your own, and never an event seen before (a view sent again repeats its events; a new game's ids start
     over, so the match is in the key). A view of a game you had not seen before shows nothing: that is history. */
  const PLAY_MS = 10000, PLAYS_SHOWN = 3, playsSeen = new Set();
  const playKey = (matchId, x) => `${matchId}:${x.eventId}`;
  function playsFor(was, next) {
    const all = (next.events || []).filter((x) => (x.kind === "cast" || x.kind === "land") && x.player !== next.seat && x.card && x.card.name);
    const fresh = all.filter((x) => !playsSeen.has(playKey(next.matchId, x)));
    for (const x of fresh) playsSeen.add(playKey(next.matchId, x));
    return was && was.matchId === next.matchId && next.status !== "finished" ? fresh : [];
  }
  globalThis.CrankBoard.playsFor = playsFor;
  function plays(was, next) {
    const list = playsFor(was, next), layer = document.getElementById("cm-board-plays");
    if (!attached || !layer || !list.length) return;
    for (const x of list.slice(-PLAYS_SHOWN)) {
      const name = x.card.name, who = nameOf(x.player);
      const el = document.createElement("section");
      el.className = "cm-play-pop";
      el.style.setProperty("--seat", seatColor(x.player));
      el.setAttribute("aria-label", `${who} ${x.kind === "land" ? "played" : "cast"} ${name}`);
      el.innerHTML = `<header><b>${e(who)}</b><button type="button" class="cm-play-close" aria-label="Close ${e(name)}">✕</button></header>
        <button type="button" class="cm-play-card" aria-label="${e(name)}"><img src="${e(pictureOf(name))}" alt="" draggable="false" referrerpolicy="no-referrer"></button>`;
      let left = PLAY_MS, since = performance.now(), timer = null;
      const gone = () => {clearTimeout(timer); if (!el.isConnected) return; el.classList.add("is-leaving"); setTimeout(() => el.remove(), reduced() ? 0 : 600);};
      const run = () => {since = performance.now(); timer = setTimeout(gone, left);};
      el.addEventListener("mouseenter", () => {clearTimeout(timer); left = Math.max(1500, left - (performance.now() - since));});
      el.addEventListener("mouseleave", run);
      el.querySelector(".cm-play-close").addEventListener("click", () => {clearTimeout(timer); el.remove();});
      el.querySelector(".cm-play-card").addEventListener("click", () => C.modal(name, `<div class="cm-board-zoom">${card({cardId: -1, name, types: [], counters: {}, power: null}, {where: "zoom", action: "close"})}</div><div class="cm-form-footer">${b("Close", "close", {}, true)}</div>`));
      layer.prepend(el);
      while (layer.children.length > PLAYS_SHOWN) layer.lastElementChild.remove();
      run();
    }
  }

  /* THE BOARD'S ONE STATUS REGION (WCAG 4.1.3): a polite live region beside the board, not in it, so the board drawn
     again with every view never makes it anew -- a region made anew with its words already in it is heard twice, or
     not at all. What it says is what has just happened to you: the question the table asks, the turns that went by, the
     game's end, the card shown large. Each is said once, when it changes. */
  let saidKey = null;
  function say(text) {
    const el = document.getElementById("cm-board-said");
    if (el && el.textContent !== text) el.textContent = text;
  }
  function announcement() {
    if (!view) return {key: `status:${status}`, text: status === "reconnecting" ? "Reconnecting to the table…" : "Opening the board…"};
    if (status === "reconnecting") return {key: "status:reconnecting", text: "Reconnecting to the table…"};
    if (view.status === "finished") {
      const r = view.result || {}, head = r.endedBy !== undefined || r.reason === "ended early" ? "The game was ended early" : r.winner === view.seatId ? "You won" : r.winner ? `${seatName(r.winner)} won` : "The game is over";
      return {key: `over:${view.matchId}`, text: `${head}.${r.reason && r.reason !== "ended early" ? ` ${r.reason[0].toUpperCase()}${r.reason.slice(1)}.` : ""}`};
    }
    if (departed(view.seat)) return {key: "left", text: LEFT};
    if (wentBy) {
      const w = wentBy, span = w.from === w.to ? `Turn ${w.from} went by.` : `Turns ${w.from} to ${w.to} went by.`;
      return {key: `went:${w.from}:${w.to}`, text: `${span} ${view.state.turnPlayerId === view.seat ? `Turn ${w.now} is yours.` : `Turn ${w.now}, ${nameOf(view.state.turnPlayerId)}.`}`};
    }
    const d = view.decision;
    if (d && sending) return {key: saidKey, text: ""};   /* an answer on its way: nothing new to say until the table's */
    if (d) {
      if (d.kind === "draw") return {key: `ask:${d.id}`, text: `${stepNow()}. Draw card.`};
      if (d.kind === "priority") {const w = waitingText(); return {key: `ask:${d.id}`, text: `${stepNow()}. ${w || "Your move"}: ${passLabel()}${alsoCount() ? ", or something else you can do" : ""}.`};}
      const opts = d.options || [], shown = opts.slice(0, 6).map((o) => o.label);
      return {key: `ask:${d.id}`, text: `${d.title}${shown.length ? ` Choices: ${shown.join(", ")}${opts.length > shown.length ? `, and ${opts.length - shown.length} more` : ""}.` : ""}`};
    }
    const w = waitingText();
    return {key: `wait:${w}`, text: w};
  }
  function announce() {
    const {key, text} = announcement();
    if (key === saidKey) return;
    saidKey = key;
    say(text);
  }
  /* A view arrives whenever anyone acts; the history's filter keeps its focus and caret through the redraw. */
  function draw() {
    gameChip();
    const active = document.activeElement;
    const caret = active && active.matches && active.matches("[data-board-history-filter]") ? active.selectionStart : null;
    const focusData = active?.closest?.("#cm-board") ? {...active.dataset} : null;
    render();
    if (focusData && Object.keys(focusData).length) {
      const next = [...document.querySelectorAll("#cm-board button, #cm-board input, #cm-board select, #cm-board textarea")].find((el) =>
        Object.entries(focusData).every(([key, value]) => el.dataset[key] === value));
      next?.focus({preventScroll: true});
    }
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
  /* Drawn anew at every view, the board keeps the focus on the control the keyboard was on (C.keepFocus), holds it in
     Show hand while that is open, and says what has just happened in its status region. */
  let handWas = null, handFrom = null;
  function render() {
    const host = document.getElementById("cm-board");
    if (!host) return;
    controlPeek(null);
    const detail = document.getElementById("cm-control-details");
    if (detail) {
      const c = controlInspection?.matchId === view?.matchId && battlefieldCards().find(c => c.cardId === controlInspection.cardId);
      detail.innerHTML = c ? (foreignControl(c) ? controlDetails(c) : `<p>${e(controlName(c))} is now controlled by its owner, ${e(nameOf(c.owner))}.</p>`) : "<p>This permanent is no longer on this battlefield.</p>";
    }
    if (showing && !handWas) handFrom = C.focusKey(document.activeElement);
    const before = motionFor !== null ? motionSnapshot(host) : null;
    // Keep the player's place through picks and incoming views, but never carry it into another question or game.
    const choice = host.querySelector("#cm-board-decision[data-choice-id]");
    const choiceScroll = choice && choice.dataset.choiceId === view?.decision?.id && choice.dataset.matchId === view?.matchId
      ? choice.querySelector(".cm-board-options")?.scrollTop : null;
    const fight = host.querySelector(".cm-combat-groups"), fightPosition = fight && {key: fight.dataset.combatKey, x: fight.scrollLeft, y: fight.scrollTop};
    const blockPositions = new Map([...host.querySelectorAll("[data-block-key]")].map(el => [el.dataset.blockKey, el.scrollLeft]));
    C.keepFocus(host, () => paint(host));
    for (const el of host.querySelectorAll("[data-block-key]")) el.scrollLeft = blockPositions.get(el.dataset.blockKey) || 0;
    const options = host.querySelector("#cm-board-decision .cm-board-options");
    if (choiceScroll !== null && options) options.scrollTop = choiceScroll;
    const nextFight = host.querySelector(".cm-combat-groups");
    if (nextFight && nextFight.dataset.combatKey === fightPosition?.key) {nextFight.scrollLeft = fightPosition.x; nextFight.scrollTop = fightPosition.y;}
    if (before) motionPlay(host, before);
    motionFor = null;
    holdHand(host);
    handWas = showing;
    announce();
  }
  /* SHOW HAND IS A MODAL POP-UP (role=dialog, aria-modal; WCAG 2.4.3): while it is open the rest of the board and the
     Coach are inert, so Tab stays in it; it takes the focus as it opens, and gives it back to what had it when it closes. */
  function holdHand(host) {
    const fan = host.querySelector(":scope > .cm-hand-show"), coachEl = document.getElementById("cm-board-coach");
    for (const el of host.children) if (el !== fan) el.inert = !!fan || (el.matches(".cm-stage-rail, .cm-stage-side") && !el.classList.contains("is-open"));
    if (coachEl) coachEl.inert = !!fan;
    if (fan) {
      if (!fan.contains(document.activeElement)) (fan.querySelector("[data-action=board-hand-do]:not([disabled])") || fan.querySelector(".cm-hand-held .cm-bcard, .cm-hand-fan .cm-bcard") || fan.querySelector(".cm-hand-close")).focus({preventScroll: true});
    } else if (handWas) {
      const back = C.focusFind(handFrom);
      handFrom = null;
      if (back && back.isConnected && !back.closest("[inert]")) back.focus({preventScroll: true});
    }
  }
  function paint(host) {
    // Keep the live Coach node and its draft across board redraws and module moves.
    const liveCoach=document.getElementById("cm-board-coach");
    if(liveCoach && host.contains(liveCoach)) host.after(liveCoach);
    if (!view) {host.innerHTML = `<p class="cm-board-loading">${status === "reconnecting" ? "Reconnecting to the table…" : "Opening the board…"}</p>`; return;}
    host.toggleAttribute("data-combat", combatAttacks().length > 0);
    if (phone()) {
      host.dataset.view = "focus";
      delete host.dataset.stage; delete host.dataset.shell; globalThis.CrankStage?.unmount();
      host.dataset.phone = innerHeight > innerWidth ? "portrait" : "landscape";
      host.innerHTML = `${phoneView()}${showHand()}${banner()}`;
      fit();
      return;
    }
    delete host.dataset.phone;
    applyScales(host);
    host.dataset.view = mode;
    host.dataset.stage = stageEnabled() ? "on" : "off";
    host.dataset.coach = coach.open ? (moduleSide("coach") ? "module" : "open") : "shut";
    host.dataset["3d"] = stageEnabled() ? "on" : "off";
    /* The turn moved to another seat a moment ago: this paint's light arrives, crossfading (~600 ms). */
    if (performance.now() - turnLit < 900) host.dataset.turnChanged = "1"; else delete host.dataset.turnChanged;
    host.style.setProperty("--panel-w", `${panelWidth()}px`);
    host.classList.remove("has-panel");
    host.dataset.shell="shared";
    if (mode === "full") host.innerHTML = `${fullView()}${showHand()}${banner()}`;
    else if (mode === "table") host.innerHTML = `${boardHeader()}${tableView()}${cameraMenu()}${boardDrawers()}${showHand()}${banner()}`;
    else host.innerHTML = `${boardHeader()}${focusView()}${cameraMenu()}${boardDrawers()}${showHand()}${banner()}`;
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
      /* The hand's tray as it would be at the table's card size (Tools): the room the boards leave it, whatever size the
         hand is now (Rob, 2026-10-09). A larger hand runs on below; a smaller one leaves the boards where they are. */
      const atTableSize = (el, measure) => {
        el.style.setProperty("--hand-scale", String(C.cardScale() / 100));
        try {return measure();} finally {el.style.removeProperty("--hand-scale");}
      };
      host.style.removeProperty("--peek-max");
      const tbl = host.querySelector(".cm-board-table");
      if (tbl) {
        const tray = host.querySelector(":scope > .cm-board-hand");
        const reserve = tray ? atTableSize(tray, () => Math.ceil(tray.getBoundingClientRect().height)) : 0;
        host.style.setProperty("--tabletop-h", `${Math.max(240, host.clientHeight - (host.querySelector(".cm-stage-top")?.getBoundingClientRect().height || 48) - reserve)}px`);
        const n = Number(tbl.dataset.seats) || 4, gaps = getComputedStyle(tbl);
        const gx = parseFloat(gaps.columnGap) || 14, gy = parseFloat(gaps.rowGap) || 22;
        const box = tbl.getBoundingClientRect(), share = rowShare();
        if (n === 2) {
          /* Two seats, side by side: each the largest 16:9 its share of the width allows, no taller than the table; the
             bar and the life counter in the gap between them, at the true center. */
          const room = box.width - gx, widest = (part) => Math.max(160, Math.floor(Math.min(part * room, box.height * 16 / 9)));
          const left = widest(share), right = widest(1 - share), used = left + right + gx;
          tbl.style.setProperty("--top-w", `${left}px`);
          tbl.style.setProperty("--bot-w", `${right}px`);
          tbl.style.setProperty("--board-w", `${Math.max(left, right)}px`);
          tbl.style.setProperty("--grid-w", `${Math.round(used)}px`);
          tbl.style.setProperty("--grid-h", `${Math.round(Math.max(left, right) * 9 / 16)}px`);
          tbl.style.setProperty("--mid-x", `${Math.round((box.width - used) / 2 + left + gx / 2)}px`);
          tbl.style.setProperty("--mid-y", `${Math.round(box.height / 2)}px`);
        } else {
          /* Each row the largest 16:9 its share of the height allows (item 4), no wider than a column; the bar and the
             life counter sit in the gap between the rows, at the true center. */
          const room = box.height - gy, col = (box.width - gx) / 2;
          const widest = (part) => Math.max(160, Math.floor(Math.min(col, part * room * 16 / 9)));
          const top = widest(share), bot = widest(1 - share), used = (top + bot) * 9 / 16 + gy;
          tbl.style.setProperty("--top-w", `${top}px`);
          tbl.style.setProperty("--bot-w", `${bot}px`);
          tbl.style.setProperty("--board-w", `${Math.max(top, bot)}px`);
          tbl.style.setProperty("--grid-w", `${Math.round(Math.max(top, bot) * 2 + gx)}px`);
          tbl.style.setProperty("--mid-x", `${Math.round(box.width / 2)}px`);
          tbl.style.setProperty("--mid-y", `${Math.round((box.height - used) / 2 + top * 9 / 16 + gy / 2)}px`);
        }
      }
      const stage = host.querySelector(".cm-board-stage");
      if (stage) {
        /* The mat: the largest 16:9 beside the pane with the hand's tray a full row beneath it, so the hand is whole
           (Rob, 2026-09-30, item 25; the mock's tray over the mat's foot cut the cards off). The tray's card follows the
           mat's width, so the two are settled together -- measured at a guess, then at the mat that leaves it room --
           and a last step makes sure the pair fits the window, since a narrower mat never needs a taller tray. */
        const main = stage.parentElement, box = main.getBoundingClientRect(), tray = main.querySelector(":scope > .cm-board-hand"), GAP = 8;
        const widest = (trayH) => Math.max(320, Math.floor(Math.min(box.width - 16, (box.height - 8 - GAP - trayH) * 16 / 9)));
        /* the tray measured at the table's card size: the hand's own size never moves the mat (Rob, 2026-10-09) */
        const trayAt = (w) => {main.style.setProperty("--mat-w", `${w}px`); return tray ? atTableSize(main, () => tray.getBoundingClientRect().height) : 0;};
        let matW = widest(0);
        for (let k = 0; k < 4; k += 1) {const next = widest(trayAt(matW)); if (Math.abs(next - matW) < 1) break; matW = next;}
        const trayH = trayAt(matW);
        if (8 + matW * 9 / 16 + GAP + trayH > box.height) {matW = widest(trayH); trayAt(matW);}
        main.style.setProperty("--mat-reserve", "0px");
        main.style.setProperty("--tray-top", `${Math.round(8 + matW * 9 / 16 + GAP)}px`);
        /* The card shown large under the pointer is never taller than the mat (Rob, 2026-10-11). */
        host.style.setProperty("--peek-max", `${Math.round(matW * 9 / 16)}px`);
      }
      /* The 3D ground's horizon: a third of the way down the window (Rob: the mat bends two thirds to three quarters up). */
      const ground = host.querySelector(".cm-full-ground");
      if (ground) ground.style.setProperty("--horizon-px", `${Math.round(host.clientHeight * 0.3)}px`);
      const big = host.querySelector(".cm-full-mine");
      if (big && !stageEnabled()) {
        /* The hand is whole (item 25): the tray is a full row along the big board's foot, the board keeping that much
           clear under its Lands, and its cards no taller than a third of the big board leaves room for. */
        const bigBox = big.getBoundingClientRect(), scale = scaleOf("hand") / 100, ref = C.cardScale() / 100;
        big.style.setProperty("--full-w", `${Math.round(bigBox.width)}px`);
        /* At the table's card size the hand fits under the big board, its cards no taller than a third of it; the room it
           takes then is the room the board keeps for it. A hand made larger than that grows past the window's foot, the
           board scrolling down to it, and never squeezes the board (Rob, 2026-10-09). */
        const fitted = Math.min(112 * ref, Math.max(56, (bigBox.height * .36 - 22) * 5 / 7));
        const tray = big.querySelector(":scope > .cm-board-hand");
        big.style.setProperty("--hc", `${Math.round(fitted)}px`);
        const trayH = tray ? Math.ceil(tray.getBoundingClientRect().height) : 0;
        big.style.setProperty("--hc", `${Math.round(fitted * scale / ref)}px`);
        big.style.setProperty("--tray-h", `${trayH}px`);
        /* and the board's own cards no larger than its two rows of piles can stand in what is left above the tray:
           two card-height rows (5:7, with the pad) and their captions, under the 52px the pill takes. */
        big.style.setProperty("--full-bc-max", `${Math.max(40, Math.floor((bigBox.height - 52 - trayH - 44) / 3.2))}px`);
      }
      for (const opp of host.querySelectorAll(".cm-full-other")) {
        const r = opp.getBoundingClientRect();
        opp.style.setProperty("--opp-w", `${Math.round(r.width)}px`);
        /* The seat at the back has a short band: its cards no larger than its three card rows can stand in it. */
        opp.style.setProperty("--opp-bc-max", `${Math.max(26, Math.floor((r.height - 70) / 4.4))}px`);
      }
      /* The card to read, the largest 5:7 its share of the column holds, what it can do under it (item 18). */
      for (const sec of host.querySelectorAll(".cm-panel-pick, #cm-full-pick")) {
        const box = sec.getBoundingClientRect(), opts = sec.querySelector(".cm-board-options"), room = box.height - 20 - (opts && opts.children.length ? opts.getBoundingClientRect().height + 8 : 0);
        sec.style.setProperty("--pick-w", `${Math.max(56, Math.floor(Math.min(box.width - 20, room * 5 / 7)))}px`);
      }
      fitStage(host);
      overlap(host);
      dock();
      if (tbl) sea(tbl); else stopSea();
      /* THE QUESTION HELD TO THE WINDOW in Table and Focus (ROB-26's blocking, Oct 20): it floats into a board that
         scrolls, so a long draft or an open "All block options" pushed No blocks and Confirm below the window. It is as
         tall as the window leaves below its top, and its middle scrolls (crankmagic-stage.css). Focus starts it lower
         than Table, so the room is measured, not assumed -- last, once everything above it has its size. */
      const ask = host.querySelector(".cm-board-main>.cm-board-ask, .cm-board-tabletop>.cm-board-ask");
      if (ask) ask.style.maxHeight = `${Math.max(160, Math.floor(innerHeight - ask.getBoundingClientRect().top - 12))}px`;
      placeCallouts();
    } finally {fitting = false;}
  }
  /* The Coach docked in Full screen: over the lower half of the side column, which gives its log the upper half. */
  function dock() {
    const el = document.getElementById("cm-board-coach"), side = document.querySelector("#cm-board .cm-full-side"), host = document.getElementById("cm-board");
    if (!el) return;
    const slot=host?.querySelector(".cm-module-coach-host");
    el.classList.toggle("is-module", !!slot && coach.open);
    el.classList.toggle("is-docked", stageEnabled() && !slot && coach.open);
    if(slot && coach.open) {slot.append(el); for(const k of ["--dock-x","--dock-y","--dock-w","--dock-h"]) el.style.removeProperty(k); return;}
    if (!side || !host || !el.classList.contains("is-docked")) {for (const k of ["--dock-x", "--dock-y", "--dock-w", "--dock-h"]) el.style.removeProperty(k); return;}
    const s = side.getBoundingClientRect(), h = host.getBoundingClientRect(), top = Math.round(s.bottom + 6);
    el.style.setProperty("--dock-x", `${Math.round(s.left)}px`);
    el.style.setProperty("--dock-y", `${top}px`);
    el.style.setProperty("--dock-w", `${Math.round(s.width)}px`);
    el.style.setProperty("--dock-h", `${Math.max(120, Math.round(h.bottom - 8 - top))}px`);
  }
  /* A ROW TOO FULL FOR ITS CARDS OVERLAPS THEM, each over the one before -- by their layout widths, a tapped card's turn
     and the margins that make room for it included (Rob, 2026-10-11: five lands, "cards cutting off on the right side").
     No card is covered past a readable strip of it (READABLE of its width); past that the row scrolls, with a bar to
     scroll it by, rather than cutting its last cards off. */
  const READABLE = .3;
  function overlap(host) {
    for (const row of host.querySelectorAll(".cm-board-cards")) {
      row.style.removeProperty("--lap");
      row.classList.remove("is-scrolling");
      const kids = [...row.children];
      /* A side seat's rows wrap (Full screen's far sides): nothing to overlap. */
      if (kids.length < 2 || row.closest('.cm-mat[data-fit="side"]')) continue;
      const footprint = (k) => {const cs = getComputedStyle(k); return k.offsetWidth + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);};
      const room = row.clientWidth, need = kids.reduce((n, k) => n + footprint(k), 0) + 6 * (kids.length - 1);
      if (need <= room) continue;
      /* The hand keeps its own overlap: its tray is sized to it (the hand tray, item 14). */
      const mat = !row.closest(".cm-board-hand"), lap = (need - room) / (kids.length - 1) + 6;
      const most = mat ? Math.min(...kids.map((k) => k.offsetWidth)) * (1 - READABLE) + 6 : Infinity;
      row.style.setProperty("--lap", `${-Math.ceil(Math.min(lap, most))}px`);
      if (lap > most) row.classList.add("is-scrolling");
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
  function setPanelW(v) {
    const w = Math.min(PANELW[1], Math.max(PANELW[0], Math.round(v)));
    keep(PANELW_KEY, w);
    const host = document.getElementById("cm-board");
    if (host) host.style.setProperty("--panel-w", `${w}px`);
    const body = document.querySelector("#cm-board .cm-board-body");
    if (body) body.style.setProperty("--panel-w", `${w}px`);
    const g = document.querySelector('#cm-board [data-drag="panelw"]');
    if (g) g.setAttribute("aria-valuenow", String(w));
    fit();
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

  /* THE PAGE UNDER THE BOARD (WCAG 2.4.3, 2.4.7): the board covers the whole window, so the rail, the skip link and the
     footer under it are inert while it is up -- else Tab walks into controls nobody can see. ☰ is the way to the pages. */
  const SHELL = [".cm-sidebar", ".cm-skip", ".cm-legal"];
  function shell(covered) {for (const q of SHELL) for (const el of document.querySelectorAll(q)) el.inert = covered;}

  /* ---- what the lobby hands over ---- */
  C.board = {
    /** The table is playing (or just finished): draw the board in the page, and keep the socket open. `asked` is
        when the page asked for this read of the table (performance.now()). */
    show(t, asked) {
      if (tableId !== t.tableId) {C.board.close(); tableId = t.tableId; view = null; focus = null; away.clear();}
      attached = true;
      /* The table's list of who is away is the truth; the room's "away" frames only say it sooner. What it says
         of each seat (away, its mat) is redrawn when it changes. */
      const said = () => JSON.stringify([[...away], (table && table.seats || []).map((x) => x.mat)]);
      const before = said();
      table = t;
      away.clear();
      for (const a of t.away || []) away.set(a.seatId, a.until);
      /* Newest wins, as views do: a read asked before the room's last frame about a seat came may have been answered
         before it, so that frame's word on the seat stands until a read asked after it lands (a read in flight as
         someone dropped would take their flag down for a poll). */
      for (const [seat, w] of awaySaid) if (w.at > asked) heard(seat, w.until);
      if (!document.getElementById("cm-board")) {
        records = null; saidKey = null;
        C.main.innerHTML = `<div class="cm-board" id="cm-board" data-view="${mode}"></div><div class="cm-board-callouts" id="cm-board-callouts" aria-hidden="true"></div><div class="cm-board-plays" id="cm-board-plays" role="region" aria-label="Cards the other players played"></div><aside class="cm-board-coach" id="cm-board-coach" aria-label="CrankMagic Coach" hidden></aside><p class="cm-sr-only" id="cm-board-said" role="status" aria-live="polite" aria-atomic="true"></p>`;
        draw();
        watch();
      } else if (said() !== before) draw();
      shell(true);
      if (!socket && status !== "reconnecting") connect();
      prefer();
    },
    /** Whether the board is what this table's page should show. */
    wants(t) {return t.phase === "playing" || (t.tableId === tableId && !!view);},
    /** The table page is left, the game is not (item 19): the board's page goes, its socket and the room's last view
        stay, and the rail says a game is on. */
    detach() {
      attached = false;
      controlPeek(null); controlInspection = null;
      shell(false);
      if (audio) audio.stopBgm(400);
      globalThis.CrankStage?.unmount(); stopSea(); if (observer) {observer.disconnect(); observer = null;} peek(null); leaveFullscreen();
      tools = false; confirmEnd = false; historyOpen = false; menuOpen = false; stepsOpen = false; alsoOpen = false; showing = null; held = null;
      coach.open = false; coach.asked += 1; coach.typing = false;
      calloutQueue = []; clearTimeout(calloutTimer); calloutTimer = null;
      gameChip();
    },
    /** A game of yours that is on: {tableId, turn}, or null. Play opens it. */
    live() {return tableId && view && view.status !== "finished" ? {tableId, turn: view.state.turn} : null;},
    /** The game the board holds, on or just over, for a report to name (Send feedback): {tableId, matchId, turn, over}, or null. */
    held() {return tableId && view && view.matchId ? {tableId, matchId: view.matchId, turn: view.state.turn, over: view.status === "finished"} : null;},
    /** What a room view means for your record: {outcome, reason}, or null while the game goes on for you. */
    outcomeOf,
    /** The picture the board draws for a card by its name: the library's record, else the shipped card records'. */
    pictureOf,
    close() {
      attached = false;
      shell(false);
      if (audio) audio.stopBgm(400);
      disconnect(); globalThis.CrankStage?.unmount(); stopSea(); if (observer) {observer.disconnect(); observer = null;}
      document.getElementById("cm-game-on")?.remove();
      stackSelected = null; tableId = null; view = null; table = null; tools = false; confirmEnd = false; selected = null; hover = null; showing = null; held = null;
      historyOpen = false; historyFilter = ""; menuOpen = false; stepsOpen = false; panelOpen = false; skipping = null; records = null;
      coach.open = false; coach.thread = []; coach.typing = false; coach.asked += 1; peek(null); leaveFullscreen();
    },
  };

  /* ---- actions ---- */
  const tableApi = () => C.tableApi;
  function option(index) {
    if (blocking()) return draftBlock(index);
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
  actions["board-combat-inspect"] = el => {
    const c = combatCard(Number(el.dataset.card));
    if (!c) return;
    const shown = {...c, name: c.faceDown ? null : c.name};
    C.modal(combatName(c), `<p>Object #${c.cardId}${c.power !== null && c.power !== undefined ? ` · ${e(c.power)}/${e(c.toughness)}` : ""}</p>
      <div class="cm-board-zoom">${card(shown, {where: "zoom", action: "close"})}</div><div class="cm-form-footer">${b("Close", "close", {}, true)}</div>`);
  };
  /* A CARD IS PLAYED BY CLICKING IT, as one is put down at a table, in every view (Rob, 2026-10-21: "I should be able to
     click on the card or double-click a card to play it"); Full screen shows it large at the side too. The second click of
     a double-click does nothing more -- the first played it -- except on a land just played: there the double-click picks
     it back up into the hand ("Oh wait, no, I didn't mean to lay that land down"; the room's `takeBackLand`), as a hand
     reaches over at a table, so its single click (a tap for mana) waits out the double-click before it is done. */
  const DOUBLE_MS = 300;
  let clickLater = null;
  const takeBackOf = (id) => optionsFor(id).find((o) => o.act === "undo-land") || null;
  function useCard(id) {
    if (!view || !view.decision || sending) return;
    const opts = optionsFor(id).filter((o) => o.act !== "undo-land");
    /* Nothing to do with it: why, when the room says (ROB-24). */
    if (!opts.length && findCard(id)?.why) return C.notice(findCard(id).why);
    if (opts.length === 1) return option(opts[0].index);
    /* More than one way to use it -- aimed at this or that, paid with this or that -- is a pop-up to choose in. */
    if (opts.length > 1) zoom(id);
  }
  actions["board-card"] = (el, event) => {
    if (!view) return;
    const id = Number(el.dataset.card);
    if (event && event.detail >= 2) {
      clearTimeout(clickLater); clickLater = null;
      const back = takeBackOf(id);
      if (back && view.decision && !sending) send({indices: [back.index]});
      return;
    }
    if (blocking() && !sending && view.decision.legalBlocks.some(b => b.blocker === id)) {
      blockSelected = id; openModuleDrawer("actions"); draw(); return;
    }
    /* Full screen and the Panel show the card large at the side. */
    if (mode === "full" && !phone()) {selected = id; hover = null; drawPick(); draw();}
    else {
      const previewSide=moduleSide("inspect");
      if ((previewSide === "left" && stageRail) || (previewSide === "right" && stageSide)) {selected = id; drawPick();}
    }
    clearTimeout(clickLater); clickLater = null;
    if (takeBackOf(id) && event && event.detail === 1) {clickLater = setTimeout(() => {clickLater = null; useCard(id);}, DOUBLE_MS); return;}
    useCard(id);
  };
  actions["board-choose"] = (el) => {alsoOpen = false; draw(); zoom(Number(el.dataset.card));};
  /* All at one player, and None (the attack question's own shortcuts, above): picks only, as a press on each would be. */
  actions["board-attack-all"] = (el) => {
    const d = view && view.decision;
    if (!d || d.mode !== "many" || !String(d.id).startsWith("declare-attackers:") || sending) return;
    const at = d.options.filter((o) => o.defenderId === Number(el.dataset.defender) && o.planeswalkerId === undefined);
    const creatures = new Set(at.map((o) => o.cardId));
    picked = [...picked.filter((i) => !creatures.has(d.options[i].cardId)), ...at.map((o) => o.index)].slice(0, d.max);
    draw();
  };
  actions["board-attack-none"] = () => {
    const d = view && view.decision;
    if (!d || !String(d.id).startsWith("declare-attackers:") || sending) return;
    picked = [];
    draw();
  };
  actions["board-zoom-open"] = (el) => zoom(Number(el.dataset.card));
  actions["board-pass"] = () => {
    const d = view && view.decision;
    if (!d || d.kind !== "priority") return;
    const pass = d.options.find((o) => o.label === "Pass priority");
    if (pass) send({indices: [pass.index]});
  };
  actions["board-resolve-all"] = () => {
    const o = view && resolveAllOption();
    if (o && !sending) send({indices: [o.index]});
  };
  actions["board-went-close"] = () => {wentBy = null; clearTimeout(wentTimer); draw();};
  actions["board-draw"] = () => {
    const d = view && view.decision;
    if (d && d.kind === "draw" && !sending) send({indices: [d.options[0].index]});
  };
  actions["board-mute"] = () => {const a = sound(); if (!a) return; a.setMuted(!a.volumes().muted); if (!a.volumes().muted && view) {const bed = CrankAudio.bedFor(view, view.seat); if (bed) a.startBgm(bed);} draw();};
  actions["board-skip"] = () => {
    if (!view || view.status === "finished") return;
    if (view.state.turnPlayerId !== view.seat) {
      if (yieldPending || !yieldReady || sending || view.continuing || !socket || socket.readyState !== 1 || (!view.mayYield && !view.yielding)) return;
      yieldPending = {on: view.yielding !== true, matchId: view.matchId, turn: view.state.turn};
      socket.send(JSON.stringify({type: "yield", on: yieldPending.on}));
      draw();
      return;
    }
    skipping = skipping === null ? view.state.turn : null;
    if (skipping !== null) skip();
    draw();
  };
  actions["board-block-select"] = el => {if (!blocking() || sending) return; blockSelected = Number(el.dataset.blockObject); draw();};
  actions["board-block-pair"] = el => draftBlock(Number(el.dataset.index));
  actions["board-block-none"] = () => {if (!blocking() || sending) return; picked = []; blockResult = null; checkBlocks(); draw();};
  actions["board-block-clear"] = () => {
    if (!blocking() || sending) return;
    picked = picked.filter(i => view.decision.options.find(o => o.index === i)?.cardId !== blockSelected);
    blockResult = null; checkBlocks(); draw();
  };
  actions["board-block-retry"] = () => {blockResult = null; checkBlocks(); draw();};
  document.addEventListener("toggle", event => {if (event.target.matches?.(".cm-block-list")) blockListOpen = event.target.open;}, true);
  actions["board-confirm"] = () => {
    const d = view.decision;
    if (!d || sending) return;
    if (blocking()) {
      if (!blockValid()) return;
      blockResult = null; // A receipt alone must not reopen this already submitted draft.
      return send({indices: [...picked]});
    }
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

  function selectStack(id, fromPile=false) {
    const entries=[...(view?.state.stack || [])].reverse(), section=document.querySelector('.cm-module-stack');
    if(!section || !entries.some(s=>String(s.stackId)===id)) return;
    const old=section.querySelector('[data-stack-depth="0"]')?.cloneNode(true);
    const currentId=section.querySelector('[aria-pressed="true"]')?.dataset.stackId;
    if(id===currentId) return;
    const keyboard=section.contains(document.activeElement), scroll=section.querySelector('.cm-stack-list').scrollTop;
    stackSelected=id;section.outerHTML=stack({module:true});
    const next=document.querySelector('.cm-module-stack'), pile=next.querySelector('.cm-stack-pile'), front=pile.querySelector('[data-stack-depth="0"]');
    next.querySelector('.cm-stack-list').scrollTop=scroll;
    if(!reduced()) {
      if(old){old.classList.add('cm-stack-ghost');old.style.zIndex='9';pile.append(old);old.animate([{transform:'translate(0,0)'},{transform:'translate(30%,12px) rotate(7deg)',offset:.5},{transform:'translate(12px,18px) scale(.95)',opacity:0}],{duration:360,easing:'ease-in-out'}).finished.catch(()=>{}).finally(()=>old.remove());}
      front.animate([{transform:'translate(12px,18px) scale(.95)'},{transform:'translate(-15%,4px) rotate(-4deg)',offset:.5},{transform:'translate(0,0)'}],{duration:360,easing:'ease-in-out'});
    }
    if(keyboard) (fromPile ? pile : [...next.querySelectorAll('[data-stack-id]')].find(el=>el.dataset.stackId===id))?.focus({preventScroll:true});
  }
  actions['board-stack-select']=el=>selectStack(el.dataset.stackId);
  actions['board-stack-cycle']=()=>{
    const entries=[...(view?.state.stack || [])].reverse();if(entries.length<2)return;
    const index=Math.max(0,entries.findIndex(s=>String(s.stackId)===stackSelected));
    selectStack(String(entries[(index+1)%entries.length].stackId),true);
  };
  actions["board-hand-cycle"] = (el) => {
    const seat=Number(el.dataset.seat), p=players().find(x=>x.playerId===seat), n=p?.zones.Hand.count || 0;
    if(n>7) {
      const direction=Number(el.dataset.by);handStarts.set(seat,((handStarts.get(seat)||0)+direction+n)%n);draw();
      if(!globalThis.CrankMotion?.reduced()) document.querySelector(".cm-stage-fan-cards")?.animate([{transform:`translateX(${direction*28}px)`,opacity:.75},{transform:"translateX(0)",opacity:1}],{duration:180,easing:"ease-out"});
    }
  };
  document.addEventListener("change", event => {
    const el=event.target.closest?.("[data-stage-style]");if(!el)return;
    const key=el.dataset.stageStyle, list=key==="background"?CrankStage.appearances.backgrounds:CrankStage.appearances.tables;
    if(list.some(x=>x.id===el.value)){appearance[key]=el.value;keep(`cm-stage-${key}`,el.value);draw();}
  });
  actions["board-stage-side"] = () => {stageSide = !stageSide; draw();};
  actions["board-profile"] = el => {profileOpen=!profileOpen;tools=false;opened(el,profileOpen);draw();};
  actions["board-modules-settings"] = moduleSettings;
  C.sideDrawerSettings = moduleSettings;
  actions["board-modules-save"] = async () => {
    const dialog=document.getElementById("cm-drawer-settings");if(!dialog)return;
    const chosen=new Map(PANE_MODULES.map(([id])=>[id,dialog.querySelector(`input[name="module-${id}"]:checked`)?.value || "none"]));
    const old=paneLayout(), next={left:[],right:[]};
    for(const side of ["left","right"]) next[side]=[...old[side],...PANE_MODULES.map(([id])=>id)].filter((id,i,all)=>all.indexOf(id)===i&&chosen.get(id)===side);
    if(await savePaneModules(next)){paneEditing=true;if(view?.decision) openModuleDrawer("actions");if(coach.open)openModuleDrawer("coach");actions.close();draw();}
  };
  actions["board-modules-edit"] = () => {paneEditing = !paneEditing; draw();};
  actions["board-module-move"] = el => {
    const side=el.dataset.side || "right", ids = paneModules(side), from = ids.indexOf(el.dataset.module), to = from + Number(el.dataset.by);
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return savePaneModules(ids,side);
  };
  actions["board-module-remove"] = el => savePaneModules(paneModules(el.dataset.side).filter(id => id !== el.dataset.module),el.dataset.side);
  let arranging=null;
  const clearCardDrop=()=>document.querySelectorAll('.cm-card-drop').forEach(el=>el.classList.remove('cm-card-drop'));
  document.addEventListener('dragstart',event=>{
    const card=event.target.closest?.('[data-arrange-card]'),section=card?.closest('[data-card-section]');if(!section)return;
    arranging={id:card.dataset.card,section:section.dataset.cardSection};event.dataTransfer.setData('application/x-crankmagic-card',JSON.stringify(arranging));event.dataTransfer.effectAllowed='move';peek(null);
  });
  document.addEventListener('dragover',event=>{
    const section=event.target.closest?.('[data-card-section]');clearCardDrop();
    if(!arranging || section?.dataset.cardSection!==arranging.section)return;
    event.preventDefault();event.dataTransfer.dropEffect='move';event.target.closest?.('[data-arrange-card]')?.classList.add('cm-card-drop');
  });
  document.addEventListener('drop',event=>{
    const section=event.target.closest?.('[data-card-section]');clearCardDrop();
    if(!arranging || section?.dataset.cardSection!==arranging.section)return;
    event.preventDefault();const target=event.target.closest?.('[data-arrange-card]'),box=target?.getBoundingClientRect();
    reorderCard(section,arranging.id,target?.dataset.card,box ? event.clientX>box.left+box.width/2 : false);arranging=null;
  });
  document.addEventListener('dragend',()=>{arranging=null;clearCardDrop();});
  document.addEventListener('keydown',event=>{
    const card=event.target.closest?.('[data-arrange-card]');if(!card || !event.altKey || !['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const section=card.closest('[data-card-section]'),cards=[...section.querySelectorAll('[data-arrange-card]')],i=cards.indexOf(card),right=event.key==='ArrowRight',target=cards[i+(right?1:-1)];
    if(target){reorderCard(section,card.dataset.card,target.dataset.card,right);card.focus({preventScroll:true});}
  });
  document.addEventListener("dragstart", event => {
    const handle = event.target.closest?.("[data-module-drag]"); if (!handle || !paneEditing) return;
    event.dataTransfer.setData("application/x-crankmagic-module", handle.dataset.moduleDrag);
    event.dataTransfer.effectAllowed = "move";
  });
  document.addEventListener("dragover", event => {
    if (event.target.closest?.(".cm-stage-module") && event.dataTransfer.types.includes("application/x-crankmagic-module")) {
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
    }
  });
  document.addEventListener("drop", event => {
    const target = event.target.closest?.(".cm-stage-module"), id = event.dataTransfer?.getData("application/x-crankmagic-module");
    if (!target || !id || !paneEditing) return;
    event.preventDefault();
    const side=target.closest("[data-module-side]").dataset.moduleSide, ids = paneModules(side); if (!ids.includes(id) || id === target.dataset.module) return;
    ids.splice(ids.indexOf(id), 1);
    const box = target.getBoundingClientRect(), after = event.clientY > box.top + box.height / 2;
    ids.splice(ids.indexOf(target.dataset.module) + Number(after), 0, id);
    savePaneModules(ids,side);
  });
  actions["board-stage-rail"] = () => {stageRail = !stageRail; draw();};
  actions["board-camera"] = () => {cameraOpen = !cameraOpen; draw();};
  document.addEventListener("input", (event) => {
    const el = event.target.closest?.("[data-stage-camera]"); if (!el) return;
    const key = el.dataset.stageCamera; camera[key] = Number(el.value);
    el.parentElement.querySelector("output").textContent = `${el.value}${key === "tilt" ? "°" : "%"}`;
    fit();
  });
  document.addEventListener("change", (event) => {
    const el = event.target.closest?.("[data-stage-camera]"); if (el) keep(el.dataset.stageCamera === "tilt" ? "cm-board-tilt-v2" : el.dataset.stageCamera === "cards" ? "cm-stage-card-size-v2" : "cm-board-zoom-v2", el.value);
  });
  document.addEventListener("visibilitychange", () => {if (attached && view && !document.hidden) fit();});
  actions["board-pane"] = () => {paneShut = !paneShut; draw();};
  /* The button a menu was opened from, for Escape to give the focus back to. */
  let popupFrom = null;
  const opened = (el, open) => {popupFrom = open ? C.focusKey(el) : null;};
  actions["board-menu"] = (el) => {menuOpen = !menuOpen; stepsOpen = false; tools = false; historyOpen = false; alsoOpen = false; opened(el, menuOpen); draw();};
  actions["board-also"] = (el) => {alsoOpen = !alsoOpen; menuOpen = false; stepsOpen = false; tools = false; historyOpen = false; opened(el, alsoOpen); draw();};
  actions["board-steps"] = (el) => {stepsOpen = !stepsOpen; menuOpen = false; tools = false; historyOpen = false; opened(el, stepsOpen); draw();};
  actions["board-panel"] = () => {panelOpen = !panelOpen; if (panelOpen && coach.open) {coach.open = false; drawCoach();} draw();};
  actions["board-panel-tab"] = (el) => {if (PANEL_TABS.some(([k]) => k === el.dataset.view)) {panelTab = el.dataset.view; draw();}};
  let lastPhone = null;
  addEventListener("resize", () => {
    if (!document.getElementById("cm-board") || !view) return;
    const now = phone() ? (innerHeight > innerWidth ? "portrait" : "landscape") : "no";
    if (now !== lastPhone) {lastPhone = now; draw(); if (coach.open) drawCoach();} else fit();
  });
  actions["board-vitals"] = () => {if (view) tableVitals();};
  actions["board-view"] = (el) => {setMode(el.dataset.view); document.querySelector("#cm-board [data-action=board-camera]")?.focus({preventScroll: true});};
  /* Full screen asks the browser for the whole screen as well, where it may; the view stands either way. It asks for
     the DOCUMENT, not the board: a browser shows only the fullscreen element's own subtree, and the Coach, the app's
     dialogs (Table vitals, Card zoom) and its notices live beside the board, so they opened unseen (item 22). */
  function setMode(next) {
    if (!VIEWS.some(([k]) => k === next)) return;
    mode = next; cameraOpen = false; profileOpen = false; tools = false; confirmEnd = false; menuOpen = false; stepsOpen = false; historyOpen = false;
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
  actions["board-control-inspect"] = (el) => {
    const c = battlefieldCards().find(c => c.cardId === Number(el.dataset.controlCard));
    if (!c || !foreignControl(c)) return;
    controlPeek(null);
    controlInspection = {cardId: c.cardId, matchId: view.matchId};
    C.modal("Control details", `<div id="cm-control-details">${controlDetails(c)}</div><div class="cm-form-footer">${b("Close", "close")}</div>`);
  };
  document.addEventListener("pointerover", event => {
    const el = event.target.closest?.(".cm-control-ghost");
    // Redrawing under a stationary mouse must not replace the keyboard-focused ghost's explanation.
    if (document.activeElement?.matches(".cm-control-ghost") && document.activeElement !== el) return;
    if (el && event.pointerType === "mouse") controlPeek(el);
  });
  document.addEventListener("pointerout", event => {
    const el = event.target.closest?.(".cm-control-ghost");
    if (el && !el.contains(event.relatedTarget)) controlPeek(document.activeElement?.matches(".cm-control-ghost") ? document.activeElement : null);
  });
  document.addEventListener("focusin", event => {const el = event.target.closest?.(".cm-control-ghost"); if (el) controlPeek(el);});
  document.addEventListener("focusout", event => {if (event.target.closest?.(".cm-control-ghost")) controlPeek(null);});
  document.addEventListener("keydown", event => {if (event.key === "Escape") controlPeek(null);});
  document.addEventListener("pointerdown", () => controlPeek(null), {capture: true});
  document.addEventListener("dblclick", (event) => {if (showing === "held" && event.target.closest && event.target.closest(".cm-hand-held")) actions["board-hand-back"]();});
  document.addEventListener("pointermove", (event) => {pointerAt = {x: event.clientX, y: event.clientY};}, {passive: true, capture: true});
  document.addEventListener("pointerdown", () => {if (peekId !== null) peek(null);}, {capture: true});
  /* A tap on an entry shows its card, a second tap or a tap elsewhere puts it away; the keyboard's focus does the same. */
  document.addEventListener("click", (event) => {
    const entry = event.target.closest && event.target.closest(".cm-board-stack .cm-stack-entry");
    if (entry) stackPeek(stackShown === entry.dataset.stackName && document.getElementById("cm-stack-peek") ? null : entry);
    else if (stackShown !== null) stackPeek(null);
  });
  document.addEventListener("focusin", (event) => {const entry = event.target.closest && event.target.closest(".cm-board-stack .cm-stack-entry"); if (entry) stackPeek(entry);});
  document.addEventListener("focusout", (event) => {if (event.target.closest && event.target.closest(".cm-board-stack .cm-stack-entry")) stackPeek(null);});
  document.addEventListener("pointerover", (event) => {
    const entry = event.target.closest && event.target.closest(".cm-board-stack .cm-stack-entry");
    if (entry && event.pointerType === "mouse") stackPeek(entry);
    else if (stackShown !== null && event.pointerType === "mouse" && !(event.target.closest && event.target.closest("#cm-stack-peek"))) stackPeek(null);
    pointerAt = {x: event.clientX, y: event.clientY};
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
  /* THE LOBBY'S MUSIC (Rob, 2026-10-09: "Lobby music."): the pack's lobby bed ("Lobby / seat", bgm_lobby_mythic_calm), from
     the first press on a table's page before its game -- a browser plays nothing before one -- and crossfading into the
     game's bed when the board opens (listen). The board keeps the one player, so one bed plays at a time; leaving the
     table's page stops it (detach), and the board's mute keeps it quiet. */
  const LOBBY_BED = "bgm_lobby_mythic_calm";
  document.addEventListener("pointerdown", (event) => {
    if (attached || !event.isTrusted || !C.main || !C.main.contains(event.target) || !document.querySelector(".cm-cloud-table")) return;
    const a = sound();
    if (!a) return;
    if (a.isArmed()) {a.startBgm(LOBBY_BED); return;}
    a.arm().then((on) => {if (on && !attached && document.querySelector(".cm-cloud-table")) a.startBgm(LOBBY_BED);});
  }, true);
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
    if (event.key === "Escape" && peekId !== null) peek(null);
    if (event.key === "Escape" && stackShown !== null) stackPeek(null);
    if (!document.getElementById("cm-board") || !view || document.querySelector("#cm-dialog[open]")) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag);
    if (event.key === "Escape" && showing) {
      if (showing === "held") actions["board-hand-back"](); else actions["board-hand-close"]();
      return;
    }
    /* A menu closed by Escape gives the focus back to the button that opened it, if the focus was on the board. */
    if (event.key === "Escape" && (historyOpen || menuOpen || stepsOpen || tools || alsoOpen || profileOpen)) {
      const a = document.activeElement, back = !a || a === document.body || a.closest("#cm-board") ? popupFrom : null;
      const nested = profileOpen && (historyOpen || menuOpen || tools);
      profileOpen = nested; historyOpen = false; menuOpen = false; stepsOpen = false; tools = false; alsoOpen = false; confirmEnd = false; popupFrom = nested ? C.focusKey(document.querySelector("#cm-board [data-action=board-profile]")) : null; draw();
      const el = C.focusFind(back);
      if (el && el.isConnected) el.focus({preventScroll: true});
      return;
    }
    if (event.key === "Escape" && cameraOpen) {cameraOpen=false; draw(); document.querySelector("[data-action=board-camera]")?.focus(); return;}
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
      /* a button of the pop-up with the focus (one of the held card's ways, Back to hand) is pressed, as Help says */
      const a = document.activeElement;
      if (a && a.matches("button") && a.closest(".cm-hand-show") && !a.closest(".cm-hand-held")) return;
      const first = optionsFor(held)[0];
      if (first) {event.preventDefault(); showing = null; held = null; option(first.index);}
      return;
    }
    if (event.key === "Escape") {
      if (showing === "held") {actions["board-hand-back"](); return;}
      if (showing) {actions["board-hand-close"](); return;}
      if (stageSide || stageRail) {const action=stageSide ? "board-stage-side" : "board-stage-rail"; stageSide=false; stageRail=false; draw(); document.querySelector(`[data-action="${action}"]`)?.focus(); return;}
      if (panelOpen) {panelOpen = false; draw(); return;}
      if (mode === "full") setMode("focus");
    }
  });
  actions["board-tools"] = (el) => { tools = !tools; confirmEnd = false; historyOpen = false; menuOpen = false; stepsOpen = false; opened(el, tools); draw();};
  actions["board-coach"] = () => {profileOpen=false; coach.open = !coach.open; tools = false; historyOpen = false; if (coach.open) {panelOpen = false;openModuleDrawer("coach");} draw(); drawCoach(); if (coach.open) document.querySelector("#cm-board-coach .cm-coach-input")?.focus();};
  actions["board-recommend"] = () => {coach.open=true;openModuleDrawer("coach");draw();drawCoach();ask_("What are my best actions right now?");};
  actions["board-coach-ask"] = (el) => ask_(el.dataset.q);
  /* Show me: the cards an answer names, lit on the board for four seconds. Why?: each play's reason, one sentence. */
  actions["board-coach-show"] = (el) => {
    const m = coach.thread[Number(el.dataset.i)];
    if (!m || !m.show) return;
    coachShown = new Set(m.show); clearTimeout(coachShownTimer);
    coachShownTimer = setTimeout(() => {coachShown = new Set(); draw();}, 4000);
    draw();
  };
  actions["board-coach-why"] = (el) => {const m = coach.thread[Number(el.dataset.i)]; if (m) {m.open = !m.open; drawCoach();}};
  /* Clear chat is ⋯'s command, so doing it closes ⋯ (the redraw keeps the menu as it finds it). */
  actions["board-coach-clear"] = (el) => {coach.thread = []; coach.typing = false; coach.asked += 1; const more = el.closest(".cm-coach-more"); if (more) more.open = false; drawCoach();};
  document.addEventListener("submit", (event) => {
    if (!event.target.matches || !event.target.matches("[data-coach-form]")) return;
    event.preventDefault();
    const input = event.target.querySelector(".cm-coach-input"), q = input.value;
    input.value = ""; ask_(q);
  });
  /* HISTORY ▾ CLOSES ON A PRESS ANYWHERE OUTSIDE IT, as the app's popover menus do (item 16). The menu is taken out
     where it is rather than by a redraw, so the press that closed it still reaches whatever it was on. */
  document.addEventListener("pointerdown", (event) => {
    if (!document.getElementById("cm-board")) return;
    if (document.querySelector("#cm-dialog[open]")) return;
    const t = event.target;
    if (profileOpen && !t?.closest?.(".cm-stage-profile")) {
      profileOpen=false; tools=false; menuOpen=false;
      document.querySelector(".cm-profile-menu")?.remove();
      document.querySelector("[data-action=board-profile]")?.setAttribute("aria-expanded","false");
    }
    if (!historyOpen) return;
    if (t && t.closest && (t.closest("#cm-board-history") || t.closest("[data-action=board-history]"))) return;
    historyOpen = false;
    document.getElementById("cm-board-history")?.remove();
  });
  actions["board-history"] = (el) => {historyOpen = !historyOpen; if (!phone() && historyOpen) profileOpen = true; tools = false; menuOpen = false; stepsOpen = false; opened(el, historyOpen); draw(); if (historyOpen) document.querySelector("#cm-board-history .cm-history-filter")?.focus();};
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
  actions["board-rematch"] = (el) => answerRematch(el.dataset.accept === "yes");
  actions["board-leave"] = async () => {const id = tableId; C.board.close(); await tableApi().refresh(id);};
  /* Hold priority after I cast (Tools): kept on this device, and the Tools' words follow it. */
  document.addEventListener("change", (event) => {
    if (!event.target || !event.target.matches || !event.target.matches("#cm-board [data-board-hold]")) return;
    keep(HOLD_KEY, event.target.checked ? "on" : "off");
    draw();
  });
  /* Skip my priority if no response possible: kept on this device, and told to the room at once (prefer). */
  document.addEventListener("change", (event) => {
    if (!event.target || !event.target.matches || !event.target.matches("#cm-board [data-board-skip-empty]")) return;
    keep(SKIP_KEY, event.target.checked ? "on" : "off");
    prefer();
    draw();
  });
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
    else if (kind === "panelw") drag = {kind, x: event.clientX, from: panelWidth()};
    else if (kind === "panel" || kind === "side") {
      const col = el.closest(kind === "panel" ? ".cm-board-panel" : ".cm-full-side");
      drag = {kind, y: event.clientY, from: splitOf(kind), per: Math.max(1, col ? col.getBoundingClientRect().height : 600)};
    } else if (kind === "rows") {
      if (!tbl) return;
      /* Two seats side by side: the bar between them moves sideways, the left board's share of the width. */
      const side = tbl.dataset.seats === "2", r = tbl.getBoundingClientRect(), gaps = getComputedStyle(tbl);
      const room = side ? r.width - (parseFloat(gaps.columnGap) || 14) : r.height - (parseFloat(gaps.rowGap) || 22);
      drag = {kind, x: event.clientX, y: event.clientY, from: rowShare(), per: Math.max(1, room), side};
    } else {
      const c = document.querySelector("#cm-board .cm-board-hand .cm-board-hand-cards .cm-bcard"), s = scaleOf("hand");
      drag = {kind, y: event.clientY, from: s, per: Math.max(40, c ? c.getBoundingClientRect().height / (s / 100) : 104)};
    }
    document.documentElement.classList.add("cm-dragging");
  });
  document.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (drag.kind === "pane") {setPane(drag.from + event.clientX - drag.x); return;}
    if (drag.kind === "panelw") {setPanelW(drag.from - (event.clientX - drag.x)); return;}
    const dy = event.clientY - drag.y;
    if (drag.kind === "panel" || drag.kind === "side") setSplit(drag.kind, drag.from + dy / drag.per);
    else if (drag.kind === "rows") setRows(drag.from + (drag.side ? event.clientX - drag.x : dy) / drag.per);
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
    /* The right pane's edge: ← widens it (the edge moves left), → narrows it. */
    if (el.dataset.drag === "panelw") {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); setPanelW(panelWidth() + (event.key === "ArrowLeft" ? 20 : -20)); return;
    }
    /* The upright bar between two boards side by side moves with ← and →, as it looks. */
    if (el.dataset.drag === "rows" && el.getAttribute("aria-orientation") === "vertical") {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); setRows(rowShare() + (event.key === "ArrowRight" ? 0.02 : -0.02)); return;
    }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const up = event.key === "ArrowUp" ? 1 : -1;
    if (el.dataset.drag === "panel" || el.dataset.drag === "side") setSplit(el.dataset.drag, splitOf(el.dataset.drag) - up * 0.02);
    else if (el.dataset.drag === "rows") setRows(rowShare() - up * 0.02);
    else setScale("hand", scaleOf("hand") + up * 5);
  });
  /* A picture that does not come leaves the card's own frame, which already names it. */
  document.addEventListener("error", (event) => {const t = event.target; if (t && t.matches && t.matches(".cm-bcard img, .cm-combat-card img, .cm-block-tile img")) t.remove();}, true);
});
