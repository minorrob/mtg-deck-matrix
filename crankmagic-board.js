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
 *   Table, Focus and 3D   ONE HUD (Rob, 2026-10-28): the same header, turn box, action pop-up, Camera and Table menus, drawers and hand in all three;
 *                 only the stage differs. 3D is the Babylon canvas under DOM boards; Table and Focus are the same engine without the canvas
 *                 (CrankStage.flatGeometry), every board set by one matrix, so the 3D view's zoom (the wheel, Camera's slider) and pan (a
 *                 drag) move them too. The drawers lie over the stage and the hand and move neither; a flat view keeps its boards clear of
 *                 where they lie (--gut-l, --gut-r, the same open or shut)
 *   Table view    four identical 16:9 boards, two across and two down (side by side for two; two over one for three, the dial between
 *                 the top two), the largest that fit above the hand, the dial and the action pop-up in the gaps; each board's header a line
 *   Focus view    the seat looked at the largest 16:9 that fits between the others (a row across the back, or a column at the right where
 *                 the window is wide and not tall) and the hand; Commander and Exile, Library and Graveyard as card-sized piles with the
 *                 History between them; the page scrolls, there is no scroll of its own
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
  /** Shared lobby countdown treatment; the lobby owns its timer and existing sound. */
  countdown(host, number) {
    if (!host) return;
    host.querySelector('.cm-countdown-callout')?.remove();
    host.classList.toggle('cm-countdown-active', number !== null);
    if (number === null) return;
    const el = document.createElement('strong'); el.className = 'cm-countdown-callout';
    el.setAttribute('role', 'status'); el.textContent = String(number); host.append(el);
  },
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
  /* A drawer's open/shut and the way back are a thin chevron, not a filled ▾ in a button (Rob, 2026-10-25: "Look for
     proper iconography and sizing for moderately minimalistic arrows"). Down is open; shut turns it to point right. */
  const CHEV_PATH = (d) => `<svg class="cm-icon cm-chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CHEV_DOWN = CHEV_PATH("M4 6l4 4 4-4"), CHEV_LEFT = CHEV_PATH("M10 4L6 8l4 4");
  const chevToggle = (shut, action, label) => ib(CHEV_DOWN, action, label, {}, {cls: `compact cm-chev-toggle${shut ? " is-shut" : ""}`, pressed: !shut});
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
  const VIEWS = [["table", "⊞", "Table"], ["focus", "◧", "Focus"], ["full", "⛶", "3D"]];
  const VIEW_KEY = "cm-board-view";
  let mode = (() => {try {const v = localStorage.getItem(VIEW_KEY); return VIEWS.some(([k]) => k === v) ? v : "full";} catch {return "full";}})();
  let inspection = null, inspectionFrom = null, actionsShut = false;
  let lifeShut = false;
  try {lifeShut = localStorage.getItem("cm-board-life-shut") === "1";} catch {/* the list stays open for this page only */}
  let actionCard = null, draftRevision = null;
  let stackSelected = null, stackFor = null, landsOpen = null;
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

  let spectating = false, chatLog = [], chatDraft = "", chatSending = false, chatUnread = 0, chatStick = true;
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
  /* The hand's size while the wheel turns over it: shown at once, kept a moment after the wheel stops (the wheel over your hand, below). */
  let handLive = null, handKeep = null;
  const scaleOf = (scope) => {if (scope === "hand" && handLive !== null) return inRange(handLive); const v = stored(SCALE_KEY[scope]); return v === null ? C.cardScale() : inRange(v);};
  /* FOCUS AND FULL SCREEN'S DIVIDERS (items 15 and 18), remembered on the device like the rest: the seat pane's width,
     past which each tile is a miniature of that seat's board; and the share of the Panel, and of Full screen's side
     column, given to the card above its divider. */
  const PANE_KEY = "cm-board-pane", PANE = [160, 560], MINI_AT = 400;
  /* THE RIGHT PANE, DOCKED (Rob's note 10, 2026-10-11: "it should sit beside it like the left one, its width dragged
     within the same bounds"): beside the mat in Focus and the Table view, never over them, its width remembered on the
     device; its tabs are Turn Resources (note 9), Panel (the card to read, the stack, the history) and History. */
  const PANELW_KEY = "cm-board-panel-w", PANELW = [180, 560];
  const panelWidth = () => {const raw = stored(PANELW_KEY), v = Number(raw); return raw !== null && v >= PANELW[0] && v <= PANELW[1] ? v : 340;};
  let panelTab = "panel";
  const SPLIT_KEY = {panel: "cm-board-split:panel", side: "cm-board-split:side"}, SPLIT = [0.2, 0.8], SPLIT_AT = {panel: 0.45, side: 0.4};
  /* THE DRAWERS' MODULES, EACH ITS OWN HEIGHT (Rob, 2026-10-26, declaring attackers with the card open: "the card image
     can't be resized and the bottom selection options I can't see to select ... make the height of the modules grab-n-drag
     up and down"): a bar under each module drags its height, and a bar under the card read at the top of Actions drags
     the card's size; both remembered on the device. A module never dragged keeps its own height. */
  const MODH_KEY = "cm-board-module-h", MODH = [80, 1400], DESK_KEY = "cm-board-desk-card", DESK = [90, 360];
  const moduleHeights = () => {try {const v = JSON.parse(stored(MODH_KEY) || "{}"); return v && typeof v === "object" ? v : {};} catch {return {};}};
  const moduleH = (id) => {const v = Number(moduleHeights()[id]); return v >= MODH[0] && v <= MODH[1] ? v : 0;};
  const deskW = () => {const raw = stored(DESK_KEY), v = Number(raw); return raw !== null && v >= DESK[0] && v <= DESK[1] ? v : 150;};
  const paneWidth = () => {const raw = stored(PANE_KEY), v = Number(raw); return raw !== null && v >= PANE[0] && v <= PANE[1] ? v : 270;};
  /* A DRAWER NARROWER THAN ITS CONTENT'S OWN WIDTH (Rob, 2026-10-27, on the Actions wireframes): text and objects wrap first, as the drawer narrows to about the width of the
     default card (DRAWER_FULL); narrower than that, every font and object shrinks in step with it (CSS zoom, --pane-k / --panel-k), down to the drawer's least width. */
  const DRAWER_FULL = 220, drawerK = (w) => Math.max(.5, Math.min(1, w / DRAWER_FULL)).toFixed(3);
  /* the scale is set, and the zoom switched on, only while a drawer is narrower than DRAWER_FULL: a zoom of 1 still moves a layout by a pixel or two */
  function setDrawerK(host, which, w) {
    host.style.setProperty(`--${which}-k`, drawerK(w));
    if (w < DRAWER_FULL) host.dataset[which === "pane" ? "narrowPane" : "narrowPanel"] = "on"; else delete host.dataset[which === "pane" ? "narrowPane" : "narrowPanel"];
  }
  const splitOf = (k) => {const raw = stored(SPLIT_KEY[k]), v = Number(raw); return raw !== null && v >= SPLIT[0] && v <= SPLIT[1] ? v : SPLIT_AT[k];};
  let drawerW = {left: 270, right: 340}, gutter = {left: 310, right: 380};
  let stageSide = false, stageRail = true, cameraOpen = false, stageError = "";
  let tableMenuOpen = false;
  const foldedModules = new Set();
  const HUD_KEY = 'cm-play-hud-scale';
  let hudPreview = null;
  const hudScale = () => hudPreview ?? Math.max(100, Math.min(200, Number(stored(HUD_KEY)) || 100));
  const hudSlider = () => `<label class="cm-settings-slider cm-hud-slider">HUD text<input type="range" min="100" max="200" step="1" value="${hudScale()}" data-play-hud aria-label="HUD text size" aria-valuetext="${hudScale()}%"><output>${hudScale()}%</output></label>`;
  function applyHud(host) {if (!host) return; host.style.setProperty('--hud-scale', String(hudScale()/100));host.toggleAttribute('data-hud-large',hudScale()>=150);}
  C.hudTextScale = hudScale;
  C.hudTextScaleSlider = hudSlider;
  document.addEventListener('input', event => {
    const el = event.target.closest?.('[data-play-hud]'); if (!el) return;
    hudPreview = Math.max(100, Math.min(200, Number(el.value) || 100));
    el.setAttribute('aria-valuetext', `${hudPreview}%`); el.parentElement.querySelector('output').textContent = `${hudPreview}%`;
    applyHud(document.getElementById('cm-board'));fit();
  });
  document.addEventListener('input',event=>{const el=event.target.closest?.('[data-board-spacing]');if(!el)return;spacingPreview=Math.max(-70,Math.min(20,Number(el.value)||0));el.setAttribute('aria-valuetext',`${spacingPreview}%`);el.parentElement.querySelector('output').textContent=`${spacingPreview}%`;applySpacing(document.getElementById('cm-board'));fit();});
  document.addEventListener('change',event=>{const el=event.target.closest?.('[data-board-spacing]');if(!el)return;keep('cm-board-spacing',spacingPreview ?? Number(el.value));spacingPreview=null;});
  document.addEventListener('change', event => {
    const el = event.target.closest?.('[data-play-hud]'); if (!el) return;
    keep(HUD_KEY, Math.max(100, Math.min(200, Number(el.value) || 100))); hudPreview = null;
    applyHud(document.getElementById('cm-board'));fit();
  });
  let paneEditing = false, paneSaving = false, profileOpen = false;
  const PANE_MODULES = [["history", "History"], ["coach", "AI Coach"], ["counter", "Counter-Intel"], ["resources", "Resources"], ["mana", "Mana Pool"], ["stack", "On the Stack"], ["inspect", "Card Preview"], ["table", "Table Vitals"], ["recommended", "Recommended Actions"], ["chat", "Chat"], ["actions", "Actions"]];
  const DEFAULT_MODULES = ["stack", "history", "chat", "coach"];
  // Preferences travel in the existing account library. Never apply a previous account's layout.
  function paneLayout() {
    const saved = C.state.preferences?.play?.sidePane, fallback = {left:["actions"], right:[...DEFAULT_MODULES]};
    if (saved?.owner !== (C.signedInAs?.() || null)) return fallback;
    const raw = saved.version === 1 ? {left:[],right:saved.modules} : saved.version === 2 ? saved : fallback;
    const seen = new Set(["actions"]), clean = ids => (Array.isArray(ids) ? ids : []).filter(id => {
      if (seen.has(id) || !PANE_MODULES.some(([key]) => key === id)) return false;
      seen.add(id); return true;
    });
    /* THE TABLE'S CHAT IS A DEFAULT MODULE (Rob, 2026-10-28): a layout saved before it existed gets it once, at the foot of the right drawer; a layout saved since keeps what the person chose. */
    const left = clean(raw.left), right = clean(raw.right);
    if (!saved.chatOffered && !left.includes("chat") && !right.includes("chat")) right.push("chat");
    return {left:["actions", ...left], right};
  }
  const paneModules = (side="right") => paneLayout()[side];
  async function savePaneModules(modules, side="right") {
    if (paneSaving) return false;
    paneSaving = true;
    try {
      const play = C.state.preferences?.play || {}, layout = Array.isArray(modules) ? {...paneLayout(), [side]:modules} : modules;
      await C.commit({type: "preferences", values: {play: {...play, sidePane: {version: 2, owner: C.signedInAs?.() || null, ...layout, chatOffered: true}}}}, {renderView: false});
      C.notice("Drawer layout saved. Signed-in layouts sync with your cloud library.");
      return true;
    } catch (error) {C.notice(`Drawer layout was not saved: ${error.message}`, true);return false;}
    finally {paneSaving = false; draw();}
  }
  /* The tabletop's cards and zoom go to 200% (Rob, 2026-10-21: "I should be able to increase card size more. It's ok if
     there's overlap. Increase the zoom to 200%"): past the fit, cards overlap and the table runs past the window's edges. */
  const CAMERA_MAX = 200;
  let spacingPreview=null;
  const spacing = () => spacingPreview ?? Math.max(-70,Math.min(20,Number(stored('cm-board-spacing')) || 0));
  function applySpacing(host) {if(host)host.style.setProperty('--card-space',String(spacing()/100));}
  /* TILT, 0 TO 90, THE TABLE'S ANGLE TO THE SCENE'S FLOOR (Rob, 2026-10-26: "tilt the table from 0 degrees to 90 degrees ...
     0 degrees should have no angle to the floor. 90 degrees should be perpendicular to the floor"; 2026-10-27: "I want true 0
     degree angle to the slope of the floor that it sits on ... the measured angle of the floor in the video"). At 0 the table
     lies on the floor the backdrop's video shows, seen at the slope that floor is seen at (CrankStage.floorTilt, per
     backdrop; the first, seated, eye's 45 degrees of camera tilt looked about 35 steeper than the floor). At 90 it stands up
     facing you, seen straight on. Between, the camera tilts in step. Kept as v4: v3 was measured from the 45 degrees. */
  const TILT_MAX = 90, TILT_SEATED = 45, TILT_KEY = "cm-board-tilt-v4", TILT_DEFAULT = 40;
  const tiltStored = () => {const v4 = stored(TILT_KEY), n = v4 !== null ? Number(v4) : TILT_DEFAULT; return Math.max(0, Math.min(TILT_MAX, Number.isFinite(n) ? n : TILT_DEFAULT));};
  const camera = {cards: Math.max(70, Math.min(CAMERA_MAX, Number(stored("cm-stage-card-size-v2")) || 100)), tilt: tiltStored(), zoom: Math.max(60, Math.min(CAMERA_MAX, Number(stored("cm-board-zoom-v2")) || 100))};
  /* Where the 3D camera looks across the table, moved by dragging a mat (plane pixels from the table's center, y toward
     you). Kept for the visit only: ⌖ Center in Camera puts it back. */
  camera.pan = {x: 0, y: 0};
  const backdropId = () => table?.appearance?.background || appearance.background || globalThis.CrankStage?.appearances.backgrounds[0]?.id;
  const cameraTilt = () => (TILT_MAX - camera.tilt) * (globalThis.CrankStage?.floorTilt?.(backdropId()) ?? TILT_SEATED) / TILT_MAX;
  /* How much longer the table runs on your side (Ctrl/⌘ + drag), a share of its resting length; kept on this device
     (CrankStage.geometry's `reach`). `stretch` is the drag under way, `stageGeom` the geometry the stage last drew. */
  const REACH_KEY = "cm-stage-reach-v1";
  camera.reach = Math.max(0, Math.min(1, Number(stored(REACH_KEY)) || 0));
  let stretch = null, stageGeom = null;
  /* THE 3D VIEW'S HUD AND FUNCTIONS ARE EVERY VIEW'S (Rob, 2026-10-28: "Make Table and Focus HUD and all the functionality we have in 3D exactly the same in both of
     those views also, except for the canvas"): Table and Focus are the same stage -- the ribbon, the turn box, the action pop-up, the drawers, the hand's fan, the
     camera's zoom and pan -- on a flat ground, drawn by CrankStage without its canvas (`flat`). `hud()` is that stage, `stageEnabled()` the canvas under it. */
  const hud = () => !phone();
  const stageEnabled = () => mode === "full" && !phone();
  const moduleSide = id => !phone() ? ["left","right"].find(side => paneModules(side).includes(id)) : undefined;
  const openModuleDrawer = id => {const side=moduleSide(id); if(side === "left") stageRail=true; if(side === "right") stageSide=true;};
  const handStarts = new Map();
  /* How many hand cards the fan shows before it pages (fitFan measures it; 7 at the least, as it always was). */
  let handFit = 7;
  const appearance = {background: stored("cm-stage-background") || "", table: stored("cm-stage-table") || ""};
  /* The table design: a saved id, an older one (wooden, stone, obsidian) or none, resolved through the catalog (ROB-100). */
  const tableDesignId = (id) => (globalThis.CrankStage ? CrankStage.tableDesign(id).id : id);
  let blockSelected = null, blockAttacker = null, blockPending = null, blockResult = null, blockListOpen = false, blockEpoch = 0;
  const blockSettled = new Set();
  // One check in flight: checked echoes the choice ID, but not a draft/request ID.
  const blocking = () => view?.status !== "finished" && view?.decision?.mode === "many" && Array.isArray(view.decision.legalBlocks);
  const blockContext = () => blocking() ? JSON.stringify([view.matchId, view.revision, view.decision.id, view.decision.options, view.decision.legalBlocks,view.decision.blockReasons]) : null;
  const blockKey = () => JSON.stringify([blockContext(), picked]);
  const blockValid = () => blocking() && blockResult?.key === blockKey() && blockResult.ok && blockResult.open && socket?.readyState === 1;
  const ownBlockAttacks = () => view ? combatAttacks().filter(a=>a.defender===view.seat) : [];
  const blocksSettled = () => ownBlockAttacks().every(a=>blockSettled.has(a.attacker));
  const canSendBlocks = () => blockValid() && blocksSettled() && !sending;
  function checkBlocks() {
    if (!blocking() || blockPending || blockResult?.key === blockKey() || socket?.readyState !== 1) return;
    blockPending = {key: blockKey(), choiceId: view.decision.id};
    socket.send(JSON.stringify({type: "check", choiceId: view.decision.id, indices: [...picked]}));
  }
  function checkedBlocks(frame) {
    if (!blockPending || (frame.choiceId !== undefined && frame.choiceId !== blockPending.choiceId)) return;
    const pending = blockPending; blockPending = null;
    if (pending.key === blockKey()) blockResult = {key: pending.key, ok: frame.ok === true, open: frame.open === true,
      reasons: frame.reasons || [frame.error || "The table could not check these blocks. Try again."], byAttacker:Array.isArray(frame.byAttacker)?frame.byAttacker:[]};
    checkBlocks(); draw();
  }
  function draftBlock(index) {
    if (!blocking() || sending) return;
    const o = view.decision.options.find(o => o.index === index);
    if (!o || !view.decision.legalBlocks.some(b => b.blocker === o.cardId && b.attackers.includes(o.attackerId))) return;
    const old=[...picked],removing=picked.includes(index);
    if(removing)picked=picked.filter(i=>i!==index);
    else {
      if(view.decision.exclusiveBy === "cardId")picked=picked.filter(i=>view.decision.options.find(x=>x.index===i)?.cardId!==o.cardId);
      picked=[...picked,index];
    }
    for(const i of old.filter(i=>!picked.includes(i)))blockSettled.delete(view.decision.options.find(x=>x.index===i)?.attackerId);
    blockSettled.delete(o.attackerId);
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
    if (spectating) url.searchParams.set("watch", "1");
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
    else if (frame.type === "chat") heardChat(frame.message);
    else if (frame.type === "quit") {C.notice(frame.by ? `${frame.by} ended the game.` : "The game was ended.", false);}
    else if (frame.type === "checked" || (frame.type === "refused" && frame.of === "check")) checkedBlocks(frame);
    else if (frame.type === "receipt") {sending = false; draw();}
    /* A way of playing the room did not take (the AI seats were playing on) is sent again once the game moves (prefer). */
    else if (frame.type === "refused" && frame.of === "prefer") {if (frame.view) adopt(frame.view, true);}
    else if (frame.type === "refused") {sending = false;offeredPending=null; if (frame.of === "yield") yieldPending = null; C.notice(frame.error || "The table did not take that.", true); if (frame.view) adopt(frame.view, true); else draw();}
    else if (frame.type === "away") {const seat = Number(String(frame.seatId).slice(1)); awaySaid.set(seat, {until: frame.until, at: performance.now()}); heard(seat, frame.until); draw();}
  }
  /* Newest wins. The room's revision counts decisions; a game ended between them keeps its revision, so an
     equal one is taken too, and a refusal's own view always is. */
  function adopt(next, force = false) {
    if (!force && view && next.revision < view.revision) return;
    const before = view && view.decision && view.decision.id, was = view, priorBlocks = blockContext();
    offeredPending=null;
    /* A spectator's view has no seat: it is read as seat 0's table with nobody being "you" (isYou), and nothing to decide. */
    if (next.spectator === true && (next.seat === null || next.seat === undefined)) next = {...next, seat: 0};
    view = next;
    if (was?.revision !== next.revision || was?.matchId !== next.matchId || was?.seat !== next.seat) {targetPage=0;targetReviewing=false;targetCycles.clear();cardMenu=null;firstCardClick=null;document.getElementById("cm-card-menu")?.remove();picked = []; amounts = []; draftRevision = null; actionCard = null;}
    if (inspection?.automatic && was?.revision !== next.revision) inspection = null;
    if (inspection && (was?.matchId !== next.matchId || was?.seat !== next.seat)) inspection = null;
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
    if ((view.decision && view.decision.id) !== before) {picked = []; amounts = []; sending = false; alsoOpen = false; if(view.decision && view.decision.kind !== "priority") {actionsShut = false; openModuleDrawer("actions");}}
    if (priorBlocks !== blockContext()) {blockEpoch++; blockSettled.clear();blockAttacker=null;picked = []; blockSelected = null; blockResult = null; blockListOpen = false;}
    const source = /^choose-(?:cost|targets?):(\d+)/.exec(view.decision?.id || "");
    if (!phone() && source && findCard(Number(source[1]))?.name && view.decision?.id !== before) inspection = {id:source[1],kind:"card",matchId:view.matchId,automatic:true};
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
    if (!view || view.spectator === true || view.status === "finished" || view.continuing || !socket || socket.readyState !== 1) return;
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
    if (isYou(view.state.turnPlayerId)) return b(skipWords(short), "board-skip", {}, false,
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
    if (view.status === "finished" || !isYou(view.state.turnPlayerId) || view.state.turn !== skipping || (d && d.kind !== "priority") || view.state.stack.length) {skipping = null; return;}
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
  let resultEpoch = 0;
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
  async function fileResult(v, tries = 0, context = null) {
    context ||= {table,tableId:table?.tableId,matchId:v.matchId,seatId:v.seatId,account:C.signedInAs?.() || null,epoch:resultEpoch};
    const current = () => context.epoch === resultEpoch && tableId === context.tableId && view?.matchId === context.matchId && view?.seatId === context.seatId
      && (!table?.matchId || table.matchId === context.matchId) && (C.signedInAs?.() || null) === context.account;
    const o = outcomeOf(v), t = context.table;
    if (!o || !t || !v.matchId) return;
    const gameId = `game:table:${v.matchId}:${v.seatId}`;
    if (!current()) {filed.delete(gameId);return;}
    if ((filed.has(gameId) && tries === 0) || (C.state.games || []).some(g => g.id === gameId)) return;
    // Reserve while fetching/committing too: duplicate socket views must not race the write.
    filed.add(gameId);
    let record = t.gameRecord;
    const matches = r => r?.schema === "CrankMagicTableResult@1" && r.matchId === v.matchId && r.seatId === v.seatId && r.id === gameId;
    try {
      if (!matches(record)) {
        const fresh = await tableApi().api("GET", tableApi().tableUrl(t.tableId));
        if (!current()) {filed.delete(gameId);return;}
        record = fresh.table?.gameRecord;
      }
      if (!matches(record) && v.resultRecordExpected) {
        // A finished room can arrive before the table alarm settles it. Never date that
        // game with the client clock: wait for the owner's stable server summary.
        if (tries < 8) {setTimeout(() => fileResult(v, tries + 1, context), Math.min(8000, 800 * 2 ** tries)); return;}
        filed.delete(gameId); return;
      }
      if (matches(record)) {
        if (!current()) {filed.delete(gameId);return;}
        const saved=await tableApi().fileResult(record,{account:context.account,tableId:context.tableId,matchId:context.matchId,seatId:context.seatId});
        if(!current()) {filed.delete(gameId);return;}
        if(!saved) {
          if(tries<8) {setTimeout(()=>fileResult(v,tries+1,context),Math.min(8000,800*2**tries));return;}
          filed.delete(gameId);
        }
        return;
      }
      // Legacy tables alone use the client-era mapping. New summaries share the
      // table writer, whose account-bound in-flight identity also deduplicates lobby reads.
      const mine = (t.seats || []).find(s => s.you), source = mine?.source;
      const deck = source && (C.state.decks || []).find(d => d.id === source.deckId && !d.archived);
      if (!deck) {
        filed.delete(gameId);
        if (source) C.notice("This game's result was not filed: the deck you brought is no longer in your library.", true);
        return;
      }
      const ai=v.seats.some(s=>s.pilot==="house"),outcome=o.outcome,reason=o.reason;
      const opponents=(t.seats || []).filter(s=>!s.you && s.occupied!==false && s.deck).map(s=>`${(s.deck.commander || []).join(" + ") || s.deck.name}${s.kind === "ai" ? " · AI" : ` · ${s.name}`}`).join("; ");
      if (!current()) {filed.delete(gameId);return;}
      await C.commit({type:"game",gameId,deckId:deck.id,outcome,playedAt:new Date().toISOString(),pod:v.seats.length,finish:outcome==="win"?1:null,
        turns:v.state?.turn || null,seat:v.seat+1,opponents,notes:`Played at a CrankMagic table${ai?" with AI seats":""}${reason?` · ${reason}`:""}.`,
        table:{schema:"CrankMagicTableResult@1",tableId:t.tableId,matchId:v.matchId,seatId:v.seatId,ai,reason,deckVersion:source.deckVersion}}, {renderView:false});
      if(current())C.notice(`${outcome==="win"?"Your win":outcome==="loss"?"Your loss":outcome==="draw"?"The draw":"This unfinished game"} is filed under ${deck.name}'s record.`);
    } catch (error) {
      if (!current()) {filed.delete(gameId);return;}
      if ((v.resultRecordExpected || error?.retryable) && tries < 8) {setTimeout(() => fileResult(v, tries + 1, context), Math.min(8000, 800 * 2 ** tries)); return;}
      filed.delete(gameId);
      C.notice(`This game's result was not filed: ${error?.message || "the library did not take it"}.`, true);
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
  /* Whether a seat is the person looking: a spectator (Watch, Observe) holds no seat, so nobody is "you" and the board reads as everyone's. */
  const isYou = (i) => !!view && view.spectator !== true && i === view.seat;
  const nameOf = (i) => (isYou(i) ? "You" : (players()[i] || {}).name || `Seat ${i + 1}`);
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
    /* Poison is read in Table vitals (Rob, 2026-10-27: "Keep poisons in table vitals"), not on every pill; a reader of the
       screen is still told when a seat has some. */
    const inner = `<b>${h.life}</b>${bars}`, cls = `cm-vitals${big ? " is-big" : ""}${danger ? " is-danger" : ""}`;
    const label = `${isYou(p.playerId) ? "You" : p.name}: ${h.life} life${h.poison > 0 ? `, ${h.poison} poison` : ""}`;
    return button ? `<button type="button" class="${cls}" data-action="board-vitals" aria-label="${e(label)}; open Table vitals">${inner}</button>`
      : `<span class="${cls}" aria-label="${e(label)}">${inner}</span>`;
  }
  function seatState(p) {
    const flag=seatFlag(p),i=p.playerId;
    if(departed(i) || p.health.status==='lost' || away.get(i))return flag;
    if(flag==='Deciding' || (view.decision && isYou(i)))return 'Deciding';
    return view.state.turnPlayerId===i?(isYou(i)?'Your turn':`${p.name}'s turn`):'Waiting';
  }
  /* A seat's state is a colored dot with its word on hover (Rob, 2026-10-27: "Colored dot with the word on hover"): the key
     picks the color, the word stays in the page for a screen reader and for the suites. */
  const seatStateKey = (word) => word === "Deciding" ? "deciding" : /turn$|^● Active$/.test(word) ? "turn" : word === "Waiting" ? "waiting" : "out";
  function seatHeader(p, {interactive = true,resources=false} = {}) {
    const commander = commanderOf(p), label = seatLabel(p), active = view.state.turnPlayerId === p.playerId;
    const state=seatState(p);
    const initial = (p.name || 'Player').trim()[0] || '?';
    return `<div class="cm-seat-header${active ? ' is-turn' : ''}${p.health.life <= 10 ? ' is-danger' : ''}" data-seat-header="${p.playerId}">
      <span class="cm-seat-portrait" aria-hidden="true"><span class="cm-seat-initial">${e(initial)}</span>${commander?.name ? `<img src="${e(pictureOf(commander.name))}" alt="" referrerpolicy="no-referrer">` : ""}</span>
      <span class="cm-seat-identity"><strong class="cm-mat-name">${e(label)}</strong><span class="cm-seat-commander">${e(commander?.name || 'Command zone')}</span></span>
      ${vitals(p, {button:interactive})}${resources?`<span class="cm-seat-resources">${p.mana.reduce((n,m)=>n+m.amount,0)} mana open · land drop ${p.landsPlayed?'used':'available'}</span>`:''}<span class="cm-seat-hand">${p.zones.Hand.count} in hand</span>
      <span class="cm-seat-state${view.state.priorityPlayerId === p.playerId ? ' has-priority' : ''}" data-state="${seatStateKey(state)}"><span class="cm-state-word">${e(state)}</span></span></div>`;
  }
  document.addEventListener('error', event => {if (event.target.matches?.('.cm-seat-portrait img')) event.target.remove();}, true);
  function pictureOf(name) {
    const r = recordOf(name);
    return (r && r.image) || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
  }
  const optionsFor = (cardId) => (view.decision ? view.decision.options.filter((o) => o.cardId === cardId || o.preparedFrom === cardId) : []);
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
  const combatName = c => c?.faceDown ? "Face-down creature" : c?.name || "Unnamed permanent";
  function twinMark(id) {
    const c=combatCard(id);if(!c?.types?.includes("Creature"))return "";
    const twins=battlefieldCards().filter(x=>x.types?.includes("Creature") && combatName(x)===combatName(c)).sort((a,b)=>a.cardId-b.cardId);
    if(twins.length<2)return "";
    let n=twins.findIndex(x=>x.cardId===id)+1,mark="";
    while(n>0){n--;mark=String.fromCharCode(97+n%26)+mark;n=Math.floor(n/26);}
    return mark;
  }
  function combatThumb(id,role,{draft=false}={}) {
    const c=combatCard(id);if(!c)return `<span class="cm-combat-missing">${role==='Attacked permanent'?'Attacked permanent left the battlefield':'Left the battlefield'}</span>`;
    return `<span class="cm-combat-thumb" data-combat-light="${id}" data-peek-card="${id}" ${draft?`data-draft-blocker="${id}"`:`data-combat-role="${role}"`}>
      ${c.name && !c.faceDown ? `<img src="${e(pictureOf(c.name))}" alt="${e(combatName(c))}" loading="lazy">` : `<i class="cm-combat-back" aria-label="Face-down creature"></i>`}
      ${twinMark(id)?`<small class="cm-twin-mark">${e(twinMark(id))}</small>`:""}${c.power!=null?`<b class="cm-combat-pt">${e(c.power)}/${e(c.toughness)}</b>`:""}</span>`;
  }
  function inspectCombatThumb(id,role,{draft=false,label=false}={}) {
    const c=combatCard(id);if(!c)return combatThumb(id,role,{draft});
    return `<button type="button" class="cm-combat-thumb-inspect${label?' is-target':''}" data-action="board-combat-inspect" data-card="${id}" data-combat-light="${id}" aria-label="Inspect ${e(combatName(c))}${twinMark(id)?' '+e(twinMark(id)):''}">${combatThumb(id,role,{draft})}${label?`<span class="cm-combat-permanent-label">${e(combatName(c))}</span>`:''}</button>`;
  }
  function attackerIssues(id) {
    const checked=blockResult?.key===blockKey()?blockResult:null;
    const fromCheck=checked?.byAttacker?.find(x=>x.attackerId===id)?.reasons || [];
    const facts=view.decision?.blockReasons?.find(x=>x.attackerId===id);
    const chosen=picked.map(i=>view.decision?.options.find(o=>o.index===i)).filter(o=>o?.attackerId===id).map(o=>o.cardId);
    return [...fromCheck,...(facts?.refused || []).filter(x=>chosen.includes(x.blockerId)).flatMap(x=>x.reasons || [])];
  }
  function combatStrip() {
    const attacks=combatAttacks();if(!attacks.length)return "";
    const draft=blocking(),own=ownBlockAttacks(),settled=own.filter(a=>blockSettled.has(a.attacker)).length;
    const result=blockResult?.key===blockKey()?blockResult:null;
    const status=draft ? result?.ok && result.open && blocksSettled() ? "The table accepts this draft" : `${settled} of ${own.length} settled` : "Confirmed assignments";
    const tiles=attacks.map(a=>{
      const mine=draft && a.defender===view.seat,issues=mine?attackerIssues(a.attacker):[],ready=mine?blockSettled.has(a.attacker):a.blocked;
      const selected=mine?picked.map(i=>view.decision.options.find(o=>o.index===i)).filter(o=>o?.attackerId===a.attacker).map(o=>o.cardId):(a.blockers || []).filter(id=>combatCard(id));
      const state=issues.length?"refused":ready?"ready":mine?"unsettled":"public";
      const word=issues.length?"✗ Refused":ready?"✓ Ready":mine?"Needs a choice":a.blocked?"Blocked":"No blocks confirmed";
      return `<li class="cm-combat-row is-${state}" data-combat-attacker="${a.attacker}" data-combat-defender="${a.defender}" data-combat-target="${a.planeswalker ?? `seat:${a.defender}`}"><div class="cm-combat-tile" data-attacker="${a.attacker}"><button type="button" class="cm-combat-open" data-action="${mine?'board-block-attacker':'board-combat-inspect'}" data-attacker="${a.attacker}" data-card="${a.attacker}" data-combat-light="${a.attacker}" aria-label="${e(`${combatName(combatCard(a.attacker))}: ${word}${issues.length?'. '+issues.join('; '):''}`)}"${sending && mine?' disabled':''}></button>
        <strong class="cm-combat-state">${e(word)}</strong><span class="cm-combat-pair">${inspectCombatThumb(a.attacker,'Attacker')}<span class="cm-combat-relation"><span>Attacking</span><span aria-hidden="true">→</span>${a.planeswalker!==undefined ? inspectCombatThumb(a.planeswalker,'Attacked permanent',{label:true}) : `<span>${e(nameOf(a.defender))}</span>`}</span>
        <span class="cm-combat-blocks">${selected.length?selected.map(id=>inspectCombatThumb(id,'Blocker',{draft:mine})).join(''):`<span class="cm-combat-empty" aria-label="${!mine?(a.blocked?'Blocked, no blockers remain':'No blocks confirmed'):ready?'No blocks chosen':'No blocks yet'}" title="${!mine?(a.blocked?'Blocked · no blockers remain':'No blocks confirmed'):ready?'No blocks chosen':'No blocks yet'}">${!mine && a.blocked?'Blocked · no blockers remain':!mine?'—':ready?'No blocks':'—'}</span>`}</span></span>
        ${issues.length?`<small class="cm-combat-reason">${e(issues[0])}</small>`:''}</div></li>`;
    }).join('');
    const missing=own.length-settled,why=missing?`${missing} attacker${missing===1?'':'s'} still need${missing===1?'s':''} a choice`:!blockValid()?'Waiting for a current valid table check':'Stays private until sent';
    const key=`${view.matchId}:${view.state.turnId || view.state.turn}:${attacks.map(a=>a.attacker).join(',')}`;
    return `<section class="cm-combat cm-r4-combat" aria-label="Combat assignments" data-wf="W05"><header><strong>Combat · blocks</strong><span role="status">${e(status)}</span></header><div class="cm-combat-body"><button type="button" class="cm-combat-scroll" data-action="board-combat-scroll" data-by="-1" aria-label="Previous attackers" hidden>‹</button><ul class="cm-combat-groups" data-combat-key="${e(key)}" tabindex="0" aria-label="Attackers; use left and right arrows to scroll" data-wf="W06">${tiles}</ul><button type="button" class="cm-combat-scroll" data-action="board-combat-scroll" data-by="1" aria-label="More attackers">›</button>${draft?`<div class="cm-combat-send"><small data-combat-more hidden></small>${b('Send blockers','board-send-blockers',{revision:String(view.revision),choice:view.decision.id,match:view.matchId},true,{disabled:!canSendBlocks()}).replace('<button ',`<button title="${e(why)}" `)}</div>`:''}</div></section>`;
  }
  const offerData = o => ({index:String(o.index),act:o.act || '',card:String(o.cardId),revision:String(view.revision),choice:view.decision?.id || '',match:view.matchId});
  let offeredPending = null;
  const offerAttrs = o => Object.entries(offerData(o)).map(([key,value])=>`data-${key}="${e(value)}"`).join(' ');
  function currentOffer(data) {
    const d=view?.decision;
    if(!data || !d || sending || view.status==="finished" || socket?.readyState!==1 || (offeredPending && offeredPending.match===view.matchId && offeredPending.revision===view.revision) || data.match!==view.matchId || data.choice!==d.id || Number(data.revision)!==view.revision)return null;
    return d.options.find(o=>o.index===Number(data.index) && o.cardId===Number(data.card) && (o.act || '')===data.act) || null;
  }
  function bindOffer(data) {const o=currentOffer(data);if(!o)return false;offeredPending={match:view.matchId,revision:view.revision};send({indices:[o.index]});return true;}
  const undoOffer = id => view?.status==="finished" ? null : view?.decision?.options.find(o=>o.cardId===id && o.act==='undo-play') || view?.decision?.options.find(o=>o.cardId===id && o.act==='undo-land');
  const undoButton = o => `<button type="button" class="cm-undo-drawer" data-action="board-offered-undo" ${offerAttrs(o)}${sending?' disabled':''} aria-label="Undo this play">↶ Undo</button>`;
  function cardUndo(c,html,where) {
    const undo=where==='mat'?undoOffer(c.cardId):null;
    return undo?`<span class="cm-card-slot${c.tapped?' is-tapped':''}" data-card-slot="${c.cardId}" data-wf="W14-undo">${html}${undoButton(undo)}</span>`:html;
  }
  /* TARGETED (Rob, 2026-10-26: "I should be able to see which card was targeted of mine (a red highlight outline around the
     card could work)"): a card of yours that another player's spell or ability on the stack targets is outlined in red
     while it waits there and as it resolves -- when you are asked what to do about it too -- and says by what. */
  const targetedBy = (c) => (c.controller === view.seat && view.state.stack?.length
    ? view.state.stack.filter((s) => s.playerId !== view.seat && (s.targets || []).some((t) => t.kind === "object" && t.id === c.cardId)).map((s) => (s.faceDown || !s.name ? "a face-down spell" : s.name))
    : []);
  function card(c, {where = "mat", action = "board-card", arrange = false} = {}) {
    const opts = optionsFor(c.cardId), mine = view.decision && !sending, aimed = targetedBy(c);
    const bright = mine && opts.length > 0, chosen = opts.some((o) => picked.includes(o.index));
    const creature = c.name && c.types.includes("Creature") && c.power !== null, upright = UPRIGHT.has(where), fight = combatOf(c);
    const controlled = where === "mat" && foreignControl(c);
    const cls = ["cm-bcard", controlled ? "is-controlled" : "", c.name ? "" : "is-back", Number.isFinite(c.commanderTax) ? "has-tax" : "", c.tapped && !upright ? "is-tapped" : "", bright ? "is-bright" : "", chosen ? "is-picked" : "", coachShown.has(c.cardId) ? "is-coach-shown" : "", (where === "hand" || where === "fan") && mine && !bright ? "is-dim" : "", selected === c.cardId && where !== "pick" ? "is-selected" : "", aimed.length ? "is-targeted" : ""].filter(Boolean).join(" ");
    const marks = [c.tapped && upright ? `<span class="cm-bcard-mark is-state">Tapped</span>` : "", ...fight.map((f) => `<span class="cm-bcard-mark is-combat">${f.mark}</span>`), c.damage ? `<span class="cm-bcard-mark">${c.damage} damage</span>` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `<span class="cm-bcard-mark">${n} ${e(k)}</span>`)].join("");
    /* Its name first, then what is shown on it as a person looking at it would say it: tapped, its power and toughness,
       in combat, damage marked, counters, chosen or picked to read; then what it can do now (the accessibility pass). */
    /* THE COMMANDER TAX (ROB-29; CR 903.8): on a commander in the command zone, the generic it costs more for each time it
       was cast from there (the room's `commanderTax`), at its top-right as Rob asked, and said with its name. */
    const tax = Number.isFinite(c.commanderTax) ? c.commanderTax : null;
    const state = [tax !== null ? `commander tax ${tax}` : "", c.tapped ? "tapped" : "", creature ? `${c.power}/${c.toughness}` : "", ...fight.map((f) => f.said), c.damage ? `${c.damage} damage` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `${n} ${k} counter${n === 1 ? "" : "s"}`),
      chosen ? "chosen" : "", selected === c.cardId && where !== "pick" ? "selected" : "", aimed.length ? `targeted by ${aimed.join(" and ")}` : ""].filter(Boolean);
    /* What it can do, each kind once ("Cast Zap, 4 ways"), not the card's name once per target. */
    const can = [...new Set(opts.map((o) => verbFor(o)))];
    /* A FACE-DOWN CARD (CR 708.2a) is the back of a card, and says so: never its name, not even to the player allowed to
       look at it (CR 708.5) -- the board does not show it, so it does not say it. */
    const named = c.name || (c.faceDown ? `Face-down ${(c.types || []).includes("Creature") ? "creature" : "card"}` : "A hidden card");
    /* WHY NOT (ROB-24): a card of the person's own that nothing offered plays says why, from the room (`why`). */
    const label = `${named}${controlled ? `, ${controlSummary(c)}` : ""}${state.length ? ", " + state.join(", ") : ""}${bright ? `: ${can.join(" or ")}${opts.length > can.length ? `, ${opts.length} ways` : ""}` : c.why ? `. ${c.why}` : ""}`;
    if (!c.name && !c.faceDown) return `<div class="cm-bcard is-back" role="img" aria-label="${e(label)}"></div>`;
    const html = `<button type="button" class="${cls}" data-action="${action}" data-card="${c.cardId}" data-card-revision="${view.revision}" data-card-choice="${e(view.decision?.id || '')}" data-card-match="${e(view.matchId)}"${aimed.length ? ` title="${e(`Targeted by ${aimed.join(" and ")}`)}"` : ""}${arrange ? ` draggable="true" data-arrange-card="true" title="Drag within this section to reorder; Shift + Alt + Left or Right works with a keyboard"` : ""} aria-label="${e(label)}">
      ${c.name ? `<span class="cm-bcard-name">${e(c.name)}</span>` : ""}${creature ? `<span class="cm-bcard-pt">${c.power}/${c.toughness}</span>` : ""}${tax !== null ? `<span class="cm-bcard-tax" title="Commander tax: {${tax}} more to cast it from the command zone">+${tax}</span>` : ""}
      ${c.name ? `<img src="${e(pictureOf(c.name))}" alt="" draggable="false" loading="lazy" referrerpolicy="no-referrer">` : ""}${controlled ? `<span class="cm-control-label">Owner: ${e(nameOf(c.owner))}</span>` : ""}${marks ? `<span class="cm-bcard-marks">${marks}</span>` : ""}</button>`;
    return cardUndo(c,html,where);
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
  const waitingText = (ribbon = false) => {
    const d = view.decision, s = view.state;
    if (view.status === "finished") return "The game is over.";
    if (d && sending) return "Sent…";
    if (d && d.kind === "priority") {
      const at = stepAt(s.phase);
      if (!isYou(s.turnPlayerId) && at >= 0) return `${nameOf(s.turnPlayerId)}'s ${THEIR_STEP[STEPS[at][0]]} · you may respond`;
      return s.stack.length ? "You may respond" : "";
    }
    if (d) return d.kind === "draw" || ribbon ? "" : d.title;
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
    return isYou(s.turnPlayerId) ? "Next step" : "Pass";
  }
  function passButton(cls = "compact") {
    const d = view.decision;
    if (!d || view.status === "finished" || !["draw","priority"].includes(d.kind)) return "";
    if (d && d.kind === "draw" && view.status !== "finished") return b("Draw card", "board-draw", {}, true, {cls, disabled: sending});
    return b(passLabel(), "board-pass", {}, !picked.length && actionCard === null, {cls, disabled: !canPass()});
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
      ? `<li class="is-now cm-board-step" title="${e(step+detail)}"><span class="cm-step-long">${e(step)}${e(detail)}</span><span class="cm-step-short" aria-hidden="true">${SHORT[i]}</span></li>`
      : `<li class="${i < at ? "is-done" : "is-next"}"><span class="cm-step-long">${e(label)}</span><span class="cm-step-short" aria-hidden="true">${SHORT[i]}</span></li>`).join("");
    return `<button type="button" class="cm-board-count cm-board-ribbon-button" data-action="board-steps" aria-expanded="${stepsOpen}" aria-label="Step ${at + 1} of ${STEPS.length}, ${step}${detail}; show the steps"><ol class="cm-board-ribbon is-strip" aria-hidden="true">${items}</ol></button>`;
  }
  function switcher(icons = false) {
    return `<span class="cm-board-views" role="group" aria-label="View">${VIEWS.map(([k, icon, label]) => `<button type="button" class="v-button compact${mode === k ? " is-on" : ""}" data-action="board-view" data-view="${k}" aria-pressed="${mode === k}"${icons ? ` aria-label="${label}" title="${label}"` : ` title="${label}"`}>${icons ? icon : `${icon}<span class="cm-view-word"> ${label}</span>`}</button>`).join("")}</span>`;
  }
  /* ☰: the app's pages, over the game. The surface is the whole window, so the rail lives here. A list of links and a
     button, so it is a navigation region, not an ARIA menu (whose items would want arrow keys it does not take). */
  function menu() {
    const links = [["Decks", "#decks"], ["Library", "#cards"], ["Explore", "#discover"], ["Play", "#game"], ["Settings", "#settings"]];
    return `<nav class="cm-board-menu cm-board-nav" id="cm-board-nav" aria-label="CrankMagic Pages"><ul>${links.map(([l, h]) => `<li><a href="${h}">${l}</a></li>`).join("")}</ul>
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
    const yours = isYou(view.state.turnPlayerId);
    const priority = `<div class="cm-actions">${skipControl()}</div>
      <label class="cm-board-hold"><input type="checkbox" data-board-hold${stored(HOLD_KEY) === "on" ? " checked" : ""}><span>Hold priority after I cast</span></label>
      <label class="cm-board-hold"><input type="checkbox" data-board-skip-empty${skipEmpty() ? " checked" : ""}><span>Skip my priority if no response possible</span></label>
      <p class="cm-muted cm-board-yield-help">${yours ? "Skip to end passes your priority for you through the rest of your turn. It stops when anything is on the stack or you are asked anything else." : e(yieldHelp())}</p>`;
    /* FOUR SECTIONS DOWN THE LEFT (Rob, 2026-10-26: "General, Video, Audio, Gameplay"), so the window fits without
       scrolling and each section uses its whole width. Every control is the one it was; only where it sits changed. */
    const tabs = [
      {id: "general", icon: "⚙", label: "General", html: `
        <div class="cm-actions cm-board-menu-row">${b("Set Side Drawer Modules", "board-modules-settings")}</div>
        ${matPicker()}
        <div class="cm-actions cm-board-menu-row">${gb(COACH, "Recommended actions", "board-coach", {}, {cls: ""})}${b("Table vitals", "board-vitals", {})}${b("AI Coach settings…", "ai-settings", {})}</div>
        <div class="cm-actions cm-board-menu-row">${b("Try the callouts", "board-callout-demo", {}, false, {cls: "compact"})}<span class="cm-muted">Overlay ${overlay()}% · set in Settings › Play</span></div>`},
      {id: "video", icon: "🖥", label: "Video", html: `
        <div class="cm-board-size">${C.cardScaleSlider()}<p class="cm-muted">${lo}% – ${hi}% · the table's size: it sets Board cards and Hand cards too · remembered on this device · ⌘/Ctrl + / − also work</p></div>
        ${resolutionSlider()}`},
      {id: "audio", icon: "🔊", label: "Audio", html: soundMenu() || `<p class="cm-muted">Sound is not available in this browser.</p>`},
      {id: "gameplay", icon: "⚔", label: "Gameplay", html: `
        ${priority}
        <p class="cm-muted">End game stops it for everyone and keeps its record. Concede leaves it to the others.</p>
        <div class="cm-actions">${end}${b("Concede", "board-concede", {}, false, {disabled: over || left})}</div>`},
    ];
    return `<div class="cm-play-settings-body" role="group" aria-label="Settings" id="cm-board-tools">${C.tabbed({id: "play-settings", label: "Settings sections", tabs})}</div>`;
  }

  /* Graphics resolution (crankmagic-stage.js, which handles the slider wherever it is): previewed as it moves, Cancel
     puts it back with the rest. */
  function resolutionSlider() {
    const S = globalThis.CrankStage;
    if (!S?.resolution) return "";
    const v = S.resolution(), R = S.RESOLUTION;
    return `<div class="cm-board-size"><label class="cm-settings-slider">Graphics resolution <input type="range" min="${R.min}" max="${R.max}" step="10" value="${v}" data-stage-resolution aria-label="Graphics resolution" aria-valuetext="${v}%"><output>${v}%</output></label><p class="cm-muted">${R.min}% – ${R.max}% of the screen's pixels · this device</p></div>`;
  }
  /* SETTINGS IS A WINDOW (Rob, 2026-10-25: "when I press "Settings" in the dropdown, the settings screen should be a
     pop-up window with close in the top right, and save and cancel in the bottom right. The window should be reactive to
     the browser size."). Opened inside the Profile menu it ran past the bottom of the screen, and nothing scrolled it.
     Now it is the app's dialog, sized to the window: its middle scrolls, its foot stays in view. Each control still
     previews as it moves; Save keeps what is set, and Cancel, ✕, Escape, a press outside or any button that leaves it
     (Concede, Recommended actions, …) put back what was set when it opened. */
  const SETTINGS_LEAVE = new Set(["board-skip", "board-coach", "board-callout-demo", "board-concede", "board-vitals", "ai-settings", "board-modules-settings"]);
  let settingsExit=null;
  const settingsKeys = () => ["cm-mat", HOLD_KEY, SKIP_KEY, SCALE_KEY.board, SCALE_KEY.hand, "cm-card-scale:board", "cm-stage-resolution"];
  /* PLAY MAT, in Settings (Rob, 2026-10-28): the mat your seat plays on, changed here as well as in the lobby. */
  function matPicker() {
    const mats = C.tableTools?.MATS;
    if (!mats || !view || view.seat === null || view.seat === undefined || !table?.seats?.[view.seat]) return "";
    const now = matOf(view.seat);
    return `<div class="cm-board-menu-row cm-board-matpick"><label class="cm-settings-slider">Play mat <select data-board-mat aria-label="Play mat">${mats.map(([k, name]) => `<option value="${e(k)}"${k === now ? " selected" : ""}>${e(name)}</option>`).join("")}</select></label><span class="cm-muted">Everyone at the table sees it. Save keeps it, for this table and your next ones.</span></div>`;
  }
  function settingsNow() {
    const a = sound();
    return {kept: Object.fromEntries(settingsKeys().map((k) => [k, stored(k)])), sound: a ? a.volumes() : null};
  }
  function restoreSettings(before) {
    const skipWas = skipEmpty();
    handLive = null; clearTimeout(handKeep);
    for (const [k, v] of Object.entries(before.kept)) try {if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);} catch {/* applied, not remembered */}
    if (skipEmpty() !== skipWas) prefer();
    C.setCardScale(C.cardScale(), {save: false});
    globalThis.CrankStage?.previewResolution?.(null);
    if (matPreview !== null) {matPreview = null; draw();}
    document.dispatchEvent(new CustomEvent("cm-card-scale", {detail: {live: false}}));
    const a = sound(), v = before.sound;
    if (a && v) {
      a.setBusVolume("sfx", v.sfx); a.setBusVolume("bgm", v.bgm);
      if (a.volumes().muted !== v.muted) actions["board-mute"]();
    }
  }
  /* The window's own words that follow a press inside it (End game's second tap, Mute), drawn again where they are. */
  function refreshSettings() {
    const body = tools && document.getElementById("cm-board-tools");
    if (!body || !view) return;
    const panels = () => document.querySelector("#cm-board-tools .cm-tabbed-panels");
    const top = panels()?.scrollTop || 0, key = C.focusKey(document.activeElement);
    body.outerHTML = toolsMenu();
    const next = document.getElementById("cm-board-tools");
    if (panels()) panels().scrollTop = top;
    (C.focusFind(key) || next.querySelector("[data-action=board-end]"))?.focus({preventScroll: true});
  }
  function openSettings() {
    profileOpen = false; cameraOpen=false;tableMenuOpen=false;menuOpen = false; historyOpen = false; stepsOpen = false; alsoOpen = false; confirmEnd = false;
    draw();
    const before = settingsNow();
    let saved = false;
    const d = C.modal("Settings", `<div class="cm-play-settings">${toolsMenu()}<div class="cm-form-footer cm-play-settings-foot cm-tabbed-foot">${b("Cancel", "close")}${b("Save", "board-settings-save", {}, true)}</div></div>`);
    d.classList.add("cm-play-settings-dialog", "cm-tabbed-dialog");
    tools = true;
    const session=settingsExit={closed:false,afterClose:null};
    const leave = (event) => {
      const el = event.target.closest?.("#cm-board-tools [data-action]");
      if (el && (SETTINGS_LEAVE.has(el.dataset.action) || (el.dataset.action === "board-end" && el.dataset.confirm === "1"))) d.close();
    };
    d.addEventListener("click", leave);
    d.addEventListener("close", () => {
      d.removeEventListener("click", leave);
      tools = false; confirmEnd = false;
      if (!saved) restoreSettings(before);
      session.closed=true;
      if (d.open) {session.afterClose=null;if(settingsExit===session)settingsExit=null;return;}   /* another window took its place */
      d.querySelector(".cm-play-settings")?.remove();
      const a = document.activeElement;
      if (!a || a === document.body || d.contains(a)) document.querySelector("#cm-board [data-action=board-camera]")?.focus({preventScroll: true});
      const after=session.afterClose;session.afterClose=null;if(settingsExit===session)settingsExit=null;after?.();
    }, {once: true});
    actions["board-settings-save"] = async () => {
      saved = true;
      const mat = matPreview;
      if (mat !== null && table?.tableId) {
        try {
          const T = C.tableTools;
          await T.api("POST", `${T.tableUrl(table.tableId)}/mat`, {mat});
          T.rememberMat(mat);
          if (table.seats?.[view.seat]) table.seats[view.seat].mat = mat;
        } catch (error) {C.notice(`Your mat did not change: ${error.message}`, true, {undo: false});}
        matPreview = null; draw();
      }
      d.close();
    };
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
  /* Your mat while Settings has one chosen and not yet saved: seen at once, put back by Cancel, sent to the table by Save. */
  let matPreview = null;
  const matOf = (i) => (matPreview !== null && view && isYou(i)) ? matPreview : ((table && table.seats && table.seats[i]) || {}).mat || "felt";
  const seatLabel = (p) => (isYou(p.playerId) ? `You · ${p.name}` : p.name);
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
  const turnMark = (i) => view.state.turnPlayerId !== i ? "" : `<span class="cm-board-turn-mark" role="img" aria-label="${isYou(i) ? "Your turn" : `${e(nameOf(i))}'s turn`}" title="${isYou(i) ? "Your turn" : `${e(nameOf(i))}'s turn`}">${TURN_ICON}<b>${isYou(i) ? "Your turn" : "Turn"}</b></span>`;
  function ribbon(active, at = stepAt(view.state.phase)) {
    return `<ol class="cm-board-ribbon" aria-label="Steps">${STEPS.map(([label], i) => `<li class="${!active ? "" : i < at ? "is-done" : i === at ? "is-now" : ""}">${e(label)}</li>`).join("")}</ol>`;
  }
  /* The two bars' sliders: one scope each, continuous, the value beside it (AGENTS.md: sizes are sliders). */
  function scaleSlider(scope, label) {
    const [lo, hi] = C.cardScaleRange(), v = scaleOf(scope);
    return `<label class="cm-board-scale"><span>${e(label)}</span><input type="range" min="${lo}" max="${hi}" step="1" value="${v}" data-board-scale="${scope}" aria-label="${e(label)}" aria-valuetext="${v}%"><output>${v}%</output></label>`;
  }
  const grip = (kind, label, now, [lo, hi], orient = "horizontal", extra = "") => `<span class="cm-board-grip${orient === "vertical" ? " is-upright" : ""}" role="separator" aria-orientation="${orient}" tabindex="0" data-drag="${kind}"${extra} aria-label="${e(label)}" aria-valuemin="${lo}" aria-valuemax="${hi}" aria-valuenow="${now}" title="${e(label)}"></span>`;
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
  const cardOrders=new Map(), zonePositions=new Map();
  const zoneKey=seat=>`cm-board-zone-split:${mode}:${seat}`;
  function zoneShare(seat) {const value=Number(stored(zoneKey(seat)));return value>=.2&&value<=.8?value:.6;}
  function fitCardCaptions(host) {
    for(const mat of host.querySelectorAll('.cm-mat[data-fit]')){
      let minimum=0;
      for(const badge of mat.querySelectorAll('.cm-bcard-pt,.cm-bcard-count,.cm-bcard-tax')){
        if(!badge.getClientRects().length || getComputedStyle(badge).visibility==='hidden')continue;
        minimum=Math.max(minimum,badge.offsetWidth/(badge.matches('.cm-bcard-count')?1:.95)+4);
      }
      mat.style.setProperty('--caption-card-min',`${Math.ceil(minimum)}px`);
    }
  }
  function fitTableCardRange(mat) {
    const base=Math.min(60,Math.max(30,mat.parentElement.clientWidth*.074)),minimum=parseFloat(mat.style.getPropertyValue('--caption-card-min'))||0,[lo,hi]=C.cardScaleRange();
    // Grid/field padding, two pile columns, two gaps and the row's 4px inset must all fit.
    const limit=Math.floor((mat.clientWidth-18)/3.48),delta=base*(hi-lo)/100;
    mat.style.setProperty('--table-card-growth',String(Math.min(1,Math.max(0,(limit-minimum)/delta))));
  }
  function fitPileCaptions(host) {
    for(const pile of host.querySelectorAll('.cm-board-pile')){
      pile.removeAttribute('data-caption-compact');
      const caption=pile.querySelector('figcaption'),name=caption?.querySelector('em'),count=caption?.querySelector('b');if(!name||!count)continue;
      const css=getComputedStyle(caption),available=Math.min(caption.clientWidth,pile.clientWidth)-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
      pile.toggleAttribute('data-caption-compact',!name.getClientRects().length || name.scrollWidth+count.offsetWidth+(parseFloat(css.columnGap)||4)>available);
    }
  }
  function zoneMetrics(mat) {
    const grid=mat.querySelector('.cm-mat-grid'),field=grid.querySelector('.cm-board-field'),lands=grid.querySelector('.cm-board-lands');
    const number=(el,key)=>parseFloat(getComputedStyle(el)[key])||0;
    const outer=el=>el?el.offsetHeight+number(el,'marginTop')+number(el,'marginBottom'):0;
    const padding=el=>number(el,'paddingTop')+number(el,'paddingBottom')+number(el,'borderTopWidth')+number(el,'borderBottomWidth');
    const bc=mat.querySelector('.cm-bcard')?.offsetWidth || 60,row=Math.ceil(bc*1.72+4);
    const fieldMin=Math.ceil(row+outer(field.querySelector(':scope>.cm-mat-label'))+outer(field.querySelector('.cm-board-group>h3'))+padding(field));
    const landMin=Math.ceil(row+outer(lands.querySelector(':scope>.cm-mat-label'))+padding(lands));
    const chip=grid.querySelector(':scope>.cm-board-chip'),history=grid.querySelector(':scope>.cm-board-band'),gap=number(grid,'rowGap');
    const historyMin=history&&!mat.closest('.cm-stage-slot')?number(history,'minHeight'):0,rows=history||mat.dataset.fit==='phone'?5:4;
    const extra=padding(grid)+8+outer(chip)+historyMin+gap*(rows-1);
    const head=mat.querySelector('.cm-mat-head');
    // A constrained grid can squeeze the header to its padding before its first fit. Its actual
    // seat facts still need their intrinsic height; a later Hand-size fit must not discover it anew.
    const header=head?Math.max(outer(head),Math.max(0,...[...head.children].map(outer))+padding(head)+number(head,'marginTop')+number(head,'marginBottom')):0;
    return {fieldMin,landMin,extra,header};
  }
  function fitBoardZones(host) {
    for(const grid of host.querySelectorAll('.cm-mat-grid')) {
      const mat=grid.closest('.cm-mat'),{fieldMin,landMin,extra,header}=zoneMetrics(mat);
      const total=Math.max((fieldMin+landMin)*(mat.closest('.cm-stage-slot')?1:1.2),mat.dataset.fit==='phone'?innerHeight*.65:mat.clientHeight-header-extra),share=zoneShare(Number(mat.dataset.seat));
      const field=Math.max(fieldMin,Math.min(total-landMin,total*share));
      grid.style.setProperty('--field-px',`${field}px`);grid.style.setProperty('--lands-px',`${total-field}px`);
      grid.dataset.zoneTotal=String(total);grid.dataset.fieldMin=String(fieldMin);grid.dataset.landMin=String(landMin);
      grid.querySelector('[data-drag="zones"]')?.setAttribute('aria-valuenow',String(Math.round(field/total*100)));
    }
  }
  function zonePoint(grid,x,y) {
    const point=el=>{const r=el.getBoundingClientRect();return hud()?CrankStage.pick(r.x,r.y):{x:r.x,y:r.y};};
    const [o,a,b]=['o','x','y'].map(id=>point(grid.querySelector(`[data-zone-probe="${id}"]`))),p=hud()?CrankStage.pick(x,y):{x,y};
    if(!o||!a||!b||!p)return null;
    const ax=a.x-o.x,ay=a.y-o.y,bx=b.x-o.x,by=b.y-o.y,det=ax*by-ay*bx;
    return Math.abs(det)>.0001?((p.y-o.y)*ax-(p.x-o.x)*ay)/det*100:null;
  }
  function setZones(seat,field,total,{save=true}={}) {
    const grid=document.querySelector(`#cm-board .cm-mat[data-seat="${seat}"] .cm-mat-grid`);if(!grid)return;
    const bounded=Math.max(Number(grid.dataset.fieldMin),Math.min(total-Number(grid.dataset.landMin),field));
    grid.style.setProperty('--field-px',`${bounded}px`);grid.style.setProperty('--lands-px',`${total-bounded}px`);
    grid.querySelector('[data-drag="zones"]')?.setAttribute('aria-valuenow',String(Math.round(bounded/total*100)));
    if(save)keep(zoneKey(seat),bounded/total);fitCardRows(document.getElementById('cm-board'));
  }
  const cardOrderKey=section=>`cm-card-order:${C.signedInAs?.() || 'local'}:${view?.matchId || tableId}:${view?.seat}:${section}`;
  /* WHICH BATTLEFIELD ROW A CARD STANDS IN (Rob, 2026-10-27: "We don't lock in creatures, etc. to first row and artifacts, etc. to second row. We default play them there, but players can drag them to where they want them"). The rows are where a card goes by default; a card dragged to the other row is remembered here, for this game on this device. */
  const rowKey=()=>`cm-card-rows:${C.signedInAs?.() || 'local'}:${view?.matchId || tableId}:${view?.seat}`;
  const cardRows=new Map();
  function rowMoves() {
    const key=rowKey();let moves=cardRows.get(key);
    if(!moves){try{const parsed=JSON.parse(stored(key) || '{}');moves=parsed && typeof parsed==='object' && !Array.isArray(parsed)?parsed:{};}catch{moves={};}cardRows.set(key,moves);}
    return moves;
  }
  const BATTLE_ROW=/:(creatures|others)$/;
  /* The row under a card being dragged: the one it is over, else, over bare battlefield, the nearest (the only one shown means the other). */
  function rowUnder(event,arranged) {
    if(!arranged || !BATTLE_ROW.test(arranged.section))return null;
    const seat=arranged.section.split(':')[0],direct=event.target.closest?.('[data-card-section]');
    if(direct && BATTLE_ROW.test(direct.dataset.cardSection))return direct.dataset.cardSection.split(':')[0]===seat?{name:direct.dataset.cardSection,el:direct}:null;
    const field=event.target.closest?.('.cm-board-field');
    if(!field || field.closest('[data-seat]')?.dataset.seat!==seat)return null;
    const groups=[...field.querySelectorAll('[data-card-group]')];
    if(!groups.length)return {name:`${seat}:creatures`,el:null};
    if(groups.length===1)return {name:`${seat}:${groups[0].dataset.cardGroup==='creatures'?'others':'creatures'}`,el:null};
    const near=groups.map(g=>{const r=g.getBoundingClientRect();return [Math.abs(event.clientY-(r.top+r.bottom)/2),g];}).sort((a,b)=>a[0]-b[0])[0][1];
    return {name:`${seat}:${near.dataset.cardGroup}`,el:near.querySelector('[data-card-section]')};
  }
  function moveToRow(id,row,targetId,after) {
    const moves=rowMoves();moves[id]=row.name.split(':')[1];keep(rowKey(),JSON.stringify(moves));
    const key=cardOrderKey(row.name),order=(row.el?[...row.el.querySelectorAll('[data-arrange-card]')].map(el=>el.dataset.card):[]).filter(x=>x!==id),at=targetId?order.indexOf(targetId):-1;
    order.splice(at<0?order.length:at+(after?1:0),0,id);cardOrders.set(key,order);keep(key,JSON.stringify(order));
    draw();
  }
  function arrangedCards(cards,section) {
    const key=cardOrderKey(section);let order=cardOrders.get(key);
    if(!order){try{const parsed=JSON.parse(stored(key) || '[]');order=Array.isArray(parsed)?parsed.map(String):[];}catch{order=[];}cardOrders.set(key,order);}
    const ranked=new Map(order.map((id,i)=>[id,i]));
    return [...cards].sort((a,b)=>(ranked.get(String(a.cardId))??Infinity)-(ranked.get(String(b.cardId))??Infinity));
  }
  /* Only public state joins lands; tapped state changes a physical member, never the stack identity. */
  function landKey(c) {
    if(c.faceDown || !c.name || c.attachments?.length)return `object:${c.cardId}`;
    const ordered=value=>Array.isArray(value)?value.map(ordered):value && typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
    const omitted=new Set(['cardId','tapped','printing','printingId','set','collectorNumber','image','imageUrl','why','undoable']);
    return JSON.stringify(ordered(Object.fromEntries(Object.entries(c).filter(([k])=>!omitted.has(k)))));
  }
  function landGroups(cards) {const groups=new Map();for(const c of cards){const key=landKey(c);if(groups.has(key))groups.get(key).push(c);else groups.set(key,[c]);}return [...groups.values()];}
  function landStack(cards) {
    if(cards.length===1)return card(cards[0],{arrange:true});
    const top=cards[0],untapped=cards.filter(c=>!c.tapped).length,ids=cards.map(c=>c.cardId).join(','),undo=cards.map(c=>undoOffer(c.cardId)).find(Boolean);
    const face=card({...top,tapped:untapped===0},{where:'land-stack',arrange:true}).replace('<button ',`<button data-land-members="${ids}" title="${untapped?`${untapped} untapped; double click taps the next copy`:'All tapped'}" `).replace(/aria-label="[^"]*"/,`aria-label="${e(top.name)}, ${cards.length} copies, ${untapped} untapped${untapped?'':' · All tapped'}"`);
    return `<span class="cm-land-stack${untapped===0?' is-tapped':''}" data-land-stack="${ids}" data-wf="W16">${cards.some(c=>c.tapped)&&untapped?'<span class="cm-land-tilted" aria-hidden="true"></span>':''}${face}<span class="cm-land-count" aria-hidden="true">×${cards.length} · ${untapped} untapped</span>${undo?undoButton(undo):''}</span>`;
  }
  function cardSection(cards,section,ghosts=[]) {const ordered=arrangedCards(cards,section);return `<div class="cm-board-cards" data-card-section="${section}">${section.endsWith(':lands')?landGroups(ordered).map(landStack).join(''):ordered.map(c=>card(c,{arrange:true})).join('')}${ghosts.map(controlGhost).join("")}</div>`;}

  function reorderCard(section,id,targetId,after=false) {
    const cards=[...section.querySelectorAll('[data-arrange-card]')],from=cards.find(el=>el.dataset.card===id),to=cards.find(el=>el.dataset.card===targetId);
    if(!from || from===to)return;
    const moving=from.closest('.cm-card-slot,.cm-land-stack') || from,anchor=to?.closest('.cm-card-slot,.cm-land-stack') || to;
    if(anchor)section.insertBefore(moving,after ? anchor.nextSibling : anchor);else section.append(moving);
    const order=[...section.querySelectorAll('[data-arrange-card]')].map(el=>el.dataset.card),key=cardOrderKey(section.dataset.cardSection);
    cardOrders.set(key,order);keep(key,JSON.stringify(order));
  }
  function mat(p, {size = "focus", head = "top", focusButton = false} = {}) {
    const i = p.playerId, you = isYou(i), z = p.zones, field = controlledCards(i);
    const ghosts = z.Battlefield.cards.filter(foreignControl);
    const lands = field.filter((c) => c.types.includes("Land"));
    const leadsBattlefield = c => c.types.includes("Creature") || c.types.includes("Planeswalker");
    const moves = you ? rowMoves() : {}, inCreatures = c => (moves[String(c.cardId)] ?? (leadsBattlefield(c) ? "creatures" : "others")) === "creatures";
    const creatures = field.filter((c) => !c.types.includes("Land") && inCreatures(c));
    const other = field.filter((c) => !c.types.includes("Land") && !inCreatures(c));
    const group = (label, cards) => {
      const references = ghosts.filter(c => !c.types.includes("Land") && leadsBattlefield(c) === (label === "Creatures"));
      return cards.length || references.length ? `<div class="cm-board-group" data-card-group="${label === "Creatures" ? "creatures" : "others"}"><h3>${e(label === "Creatures" && cards.some(c=>c.types.includes("Planeswalker")) ? "Creatures & planeswalkers" : label)} · ${cards.length}${references.length ? ` · ${references.length} with other players` : ""}</h3>${cardSection(cards,`${i}:${label === "Creatures" ? "creatures" : "others"}`,references)}</div>` : "";
    };
    const mana = p.mana.reduce((n, m) => n + m.amount, 0);
    const bare = size === "full" || size === "opp" || size === "side" || size === "phone";
    const active = view.state.turnPlayerId === i;
    const header = head === "none" ? "" : `<header class="cm-mat-head cm-seatboard-head">${seatHeader(p,{resources:size==='focus'})}${focusButton ? b("⤢ Focus", "board-focus", {seat: String(i)}, false, {cls: "compact"}) : ""}</header>`;
    const body = `<div class="cm-mat-grid cm-seatboard-body"><i class="cm-zone-origin" data-zone-probe="o" aria-hidden="true"></i><i class="cm-zone-origin" data-zone-probe="x" aria-hidden="true"></i><i class="cm-zone-origin" data-zone-probe="y" aria-hidden="true"></i>
        <div class="cm-mat-zone cm-board-field" data-zone="battlefield">${group("Creatures", creatures)}${group("Artifacts & enchantments", other)}${!field.length && !ghosts.length ? `<p class="cm-board-empty">${p.health.status === "lost" || departed(i) ? "Out of the game." : "No permanents yet."}</p>` : ""}<i class="cm-mat-label">Battlefield</i></div>
        <span class="cm-zone-divider" data-wf="W17">${grip('zones','Battlefield and lands divider: drag, arrows, or double click to reset',Math.round(zoneShare(i)*100),[20,80],'horizontal',` data-zone-seat="${i}"`)}</span>
        <div class="cm-mat-zone cm-board-lands" data-zone="lands">${cardSection(lands,`${i}:lands`,ghosts.filter(c => c.types.includes("Land")))}<i class="cm-mat-label">Lands · ${lands.length}</i></div>
        ${you && size!=='focus' ? `<span class="cm-board-chip">${mana} mana open · land drop ${p.landsPlayed ? "used" : "1 left"}</span>` : ""}
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
      const mid = ((at[0] + at[1]) / 2) * Math.PI / 180, x = 50 + (ps.length===2?25:40) * Math.sin(mid), y = ps.length===2?15:Math.cos(mid)>0?15:85;
      return `<span class="cm-board-pie-life${p.playerId===view.state.turnPlayerId?' is-active':''}" data-seat="${p.playerId}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%"><b>${p.health.life}</b><small>${e(isYou(p.playerId)?'You':p.name)}</small></span>`;
    }).join("");
    const said = ps.map((p) => `${isYou(p.playerId) ? "You" : p.name} ${p.health.life}`).join(", ");
    const active=parts.find(({p})=>p.playerId===view.state.turnPlayerId),glow=active?`<i class="cm-board-pie-turn" data-seat="${active.p.playerId}" aria-hidden="true" style="background:conic-gradient(from ${active.at[0]}deg,var(--color-aether) 0deg ${active.at[1]-active.at[0]}deg,transparent ${active.at[1]-active.at[0]}deg 360deg)"></i>`:'';
    return `<div class="cm-board-pie" role="group" aria-label="Life: ${e(said)}" style="background:conic-gradient(${stops.join(",")})">${glow}${totals}
      <button type="button" class="cm-board-center" data-action="board-vitals" aria-label="Table vitals"><img src="${LOGO}" alt=""></button><span class="cm-board-pie-priority">Priority: ${e(view.state.priorityPlayerId==null?'—':isYou(view.state.priorityPlayerId)?'you':nameOf(view.state.priorityPlayerId))}</span></div>`;
  }
  /* A tile past MINI_AT wide is a miniature of that seat's board (item 15): the same playmat at its smallest, only to
     look at (inert), the tile's own button over it. */
  function tile(p) {
    const i = p.playerId, commander = commanderOf(p), mini = paneWidth() >= MINI_AT;
    return `<div class="cm-board-tile${mini ? ' is-mini' : ''}${focus === i ? ' is-focus' : ''}${isYou(i) ? ' is-you' : ''}${view.state.turnPlayerId === i ? ' is-turn' : ''}" data-seat="${i}" style="--seat:${seatColor(i)}">
      ${mini ? `<div class="cm-board-mini" inert>${mat(p, {size:'mini',head:'none'})}</div>` : ''}<button type="button" class="cm-board-tile-main" data-action="board-focus" data-seat="${i}" aria-pressed="${focus === i}">${seatHeader(p,{interactive:false})}</button></div>`;
  }
  function boardsPane() {
    return `<nav class="cm-board-pane${paneShut ? " is-shut" : ""}" aria-label="Boards"><div class="cm-board-pane-head"><h3>Boards</h3>${chevToggle(paneShut, "board-pane", paneShut ? "Show the boards" : "Collapse the boards")}</div>${paneShut ? "" : players().map(tile).join("") + b("My board", "board-focus", {seat: String(view.seat)}, false) + `<button type="button" class="cm-board-coach-open" data-action="board-coach" aria-pressed="${coach.open}" aria-label="CrankMagic Coach">${COACH}Coach</button>`}</nav>`;
  }
  /* THE FULL SCREEN VIEW: the page given to the game. A slim rail; the others across the top, the big board across
     the foot -- yours, or whichever ⟳ Rotate has walked to -- with the step, Next and Pass over it and your hand along
     its bottom edge; at the side, every seat's vitals, the card under the pointer, and the log. */
  function fullView() {
    const s = view.state, me = players()[view.seat], big = mode === "table" ? me : (players()[focus] || me), others = players().filter((p) => p.playerId !== big.playerId);
    /* The big board's corner, at the pill's head: whose it is and their vitals; when it is not yours, ⟳ and My board too. */
    const viewing = !isYou(big.playerId);
    /* Your own mat carries no card of you (Rob, 2026-10-28: "We already have this information in multiple places"); another seat's board keeps its. */
    const corner = !viewing ? "" : `<div class="cm-full-corner cm-full-viewing">${seatHeader(big)}<span class="cm-full-corner-name">Viewing ${e(big.name)}</span>
      ${ib("⟳", "board-rotate", "Rotate: the next seat's board", {by: "1"})}${b("My board", "board-focus", {seat: String(view.seat)}, false, {cls: "compact"})}</div>`;
    return stageView({corner, big, others});
  }
  /* TABLE'S BOARDS (Rob, 2026-10-28: "revisit my original instruction on the Table view, where each mat had a specific aspect ratio"): a board for every seat, each
     the same 16:9 -- two across and two down, side by side for two seats, two over one for three -- the largest the room above the hand allows (CrankStage.gridGeometry),
     yours with no card of you and the others' with theirs and a Focus; the life counter at the true center. */
  function gridSlots() {
    const ps = players();
    const slots = ps.map((p) => {
      const area = areaOf(p.playerId), you = isYou(p.playerId);
      return `<div class="cm-board-slot cm-stage-slot${you ? " is-you" : ""}" data-area="${area}" data-seat="${p.playerId}" style="--seat:${seatColor(p.playerId)}">${mat(p, {size: "table", head: you ? "none" : "top", focusButton: !you})}</div>`;
    }).sort((x, y) => x.match(/data-area="(\w)"/)[1].localeCompare(y.match(/data-area="(\w)"/)[1])).join("");
    const active = view.state.turnPlayerId;
    return `<div class="cm-board-table cm-stage-flat" data-seats="${ps.length}">${active === null ? "" : fan(active)}${slots}${counter()}</div>`;
  }
  /* FOCUS'S BOARD: the seat looked at, the largest 16:9 that fits between the others across the back and the hand, in the board's own layout: Battlefield and Lands, the
     piles card-sized at the right with the History between them. */
  function focusSlot(big) {
    const you = isYou(big.playerId);
    return `<div class="cm-stage-slot cm-stage-big${you ? " is-you" : ""}" data-seat="${big.playerId}" style="--seat:${seatColor(big.playerId)}">${mat(big, {size: "focus", head: you ? "none" : "top"})}</div>`;
  }

  /* The latest wireframe: three seats across the back, the viewed seat's upright hand at the foot.
     Full screen always uses this surface; zero tilt is the flat view. */
  /* THE LIFE LIST, top left (Rob, 2026-10-26: "include the user (me) in the top left list of the 3 players and their life.
     Then indicate which player the turn is on by emboldening their row and putting one of the symbols ... as a small icon
     next to it"): you first, then the table in seat order; the seat whose turn it is in bold, after the turn symbol the
     seat cards use, smaller than the words. */
  /* Who holds priority, under the life totals (Rob, 2026-10-27: out of the top ribbon, which no longer says the turn either). */
  /* Rob, 2026-10-27: "remove the priority text entirely": who holds priority is a small blue dot at the right of that player's life
     (lifeList); what the table waits on, when it is not a question in the Actions pane, is said in the top ribbon. */
  function ribbonNote() {
    const w = waitingText(true);
    return w ? `<span class="cm-board-waiting" title="${e(w)}">${e(w)}</span>` : "";
  }
  function lifeList() {
    const ps = players(), mine = ps[view.seat], rows = [mine, ...ps.filter((p) => p && p !== mine)].filter(Boolean);
    return rows.map((p) => {const now = view.state.turnPlayerId === p.playerId;
      return `<span class="cm-stage-life${now ? " is-turn" : ""}"${now ? ` aria-current="true" title="${isYou(p.playerId) ? "Your turn" : `${e(p.name)}'s turn`}"` : ""}>${now ? `<span class="cm-stage-life-turn" aria-hidden="true">${TURN_ICON}</span>` : ""}${e(seatLabel(p))} · <b>${p.health.life}</b>${view.state.priorityPlayerId === p.playerId ? `<i class="cm-stage-life-prio" role="img" aria-label="${isYou(p.playerId) ? "You hold" : `${e(p.name)} holds`} priority" title="${isYou(p.playerId) ? "Priority is with you" : `Priority is with ${e(p.name)}`}"></i>` : `<i class="cm-stage-life-prio is-off" aria-hidden="true"></i>`}${now ? `<span class="cm-sr-only">, ${isYou(p.playerId) ? "your" : "their"} turn</span>` : ""}</span>`;}).join("");
  }
  function stageView({corner, big, others}) {
    const rear = others.map((p) => `<section class="cm-stage-rear" data-seat="${p.playerId}" style="--seat:${seatColor(p.playerId)}">
      <button type="button" class="cm-stage-seat-label" data-action="board-focus" data-seat="${p.playerId}" aria-label="View ${e(p.name)}'s board, ${p.health.life} life">${seatHeader(p,{interactive:false})}</button>
      <div class="cm-stage-mini">${mat(p, {size: "opp", head: "none"})}</div></section>`).join("");
    return `${boardHeader()}
      <div class="cm-full-mine cm-stage-region" aria-label="Tabletop" data-layout="${mode === "table" ? "grid" : "stage"}">
        ${mode === "table" ? gridSlots() : mode === "focus" ? `${rear}${focusSlot(big)}` : `${rear}<div class="cm-stage-front">${mat(big, {size: "full", head: "none"})}${corner}</div>`}
        <div class="cm-stage-caption${lifeShut ? ' is-shut' : ''}"><span class="cm-stage-turnrow"><span class="cm-board-turn" title="Turn ${view.state.turn} of the game, counting every player's${view.yourTurn ? `; your ${ordinal(view.yourTurn)} turn` : ''}">TURN ${view.state.turn}</span><button type="button" class="cm-stage-lifetoggle" data-action="board-life-toggle" aria-expanded="${!lifeShut}" aria-controls="cm-stage-life-list" aria-label="${lifeShut ? 'Show' : 'Hide'} the players' life totals" title="${lifeShut ? 'Show' : 'Hide'} the players' life totals"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${lifeShut ? 'M6 4l4 4-4 4' : 'M4 6l4 4 4-4'}"/></svg></button></span>${lifeShut ? '' : `<div class="cm-stage-life-list" id="cm-stage-life-list" role="group" aria-label="Player life totals">${lifeList()}</div>`}</div>
        ${stageEnabled() ? [0, 1, 2, 3].map((i) => `<span class="cm-stage-corner" data-corner="${i}" aria-hidden="true"></span>`).join("") : ""}
        ${actionBar()}
        <span class="cm-stage-error" role="status">${e(stageError)}</span>${ask()}
      </div>
      ${stageHand(big)}
      ${boardDrawers()}`;
  }
  /* THE TURN'S ACTIONS, LARGE, OVER THE TABLE (Rob, 2026-10-21: "End Turn, Skip to End, and Draw Cards should all be done
     as larger action buttons that pop up above the table ... so that it's much more clearly prominent"): in Full screen
     the pass in its words for now (Draw card, Next step, Resolve ..., End turn, Pass), Resolve all, and Skip to end -- or
     Yield this turn -- stand at the top of the table, where the callouts are, rather than in the strip. They rise in as a
     question comes to you (`barSeen`: once a question, not at every redraw); while it is not yours, the pass is off. */
  let barSeen = null;
  function actionBar() {
    if (view.spectator === true) return "";
    const live = !!view.decision && view.status !== "finished", key = live ? `${view.matchId}:${view.decision.id}` : null;
    const fresh = key !== null && key !== barSeen;
    barSeen = key;
    return `<div class="cm-stage-actions${live ? " is-live" : ""}${fresh && !reduced() ? " is-rising" : ""}" role="group" aria-label="Your actions">${passButton("")}${resolveAllButton("")}${skipControl(false, "")}</div>`;
  }
  /* Table and Focus have no caption over the table: the turn and the priority stay in their ribbon. Only 3D moves them (Rob, 2026-10-27). */
  function boardHeader() {
    const me=players()[view.seat];
    const conn=status === "open" ? "" : `<span class="cm-board-conn">${status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</span>`;
    const self = view.spectator === true
      ? `<span class="cm-stage-self cm-stage-watching" role="group" aria-label="Watching this game" title="You are watching; you hold no seat"><b>Watching</b>${table?.watching > 1 ? `<small>${table.watching} watching</small>` : ""}</span>`
      : `<span class="cm-stage-self" role="group" aria-label="${e(seatLabel(me))}, your seat" title="${e(seatLabel(me))}">${seatHeader(me)}</span>`;
    return `<header class="cm-stage-top">${self}<span class="cm-board-tools cm-board-turnsteps">${turnRibbon()}${stepsOpen ? stepsMenu() : ""}</span>${ribbonNote()}
      ${conn}${alsoButton()}${stageRail && !actionsShut ? "" : opens(ib("▸", "board-actions-open", "Open decision drawer", {}, {cls:"compact"}), false)}${cameraMenu()}${stageProfile(me)}${combatStrip()}</header>`;
  }
  function boardDrawers() {
    const pending = view.decision && view.decision.kind !== 'draw' ? 1 : 0, count = view.state.stack.length;
    return `<aside class="cm-stage-rail cm-drawer${stageRail ? ' is-open' : ''}" id="cm-actions-drawer" aria-label="Left drawer" ${stageRail ? '' : 'inert'}>${stageModules('left')}${boardsPane()}</aside>
      ${stageRail && !phone() ? `<span class="cm-board-panegrip">${grip('pane', 'Actions and boards width: drag, or use the arrow keys', paneWidth(), PANE, 'vertical')}</span>` : ''}
      <button type="button" class="cm-stage-handle cm-stage-left cm-drawer-tab${pending ? ' has-decision' : ''}" data-action="board-stage-rail" aria-expanded="${stageRail}" aria-controls="cm-actions-drawer" aria-label="${stageRail ? 'Collapse' : 'Expand'} Actions${pending ? ', a decision is waiting' : ''}"><span class="cm-tab-label">Actions</span>${pending ? '<i class="cm-tab-count" aria-hidden="true">1</i>' : ''}</button>
      <aside class="cm-full-side cm-stage-side cm-drawer${stageSide ? ' is-open' : ''}" id="cm-stack-drawer" aria-label="The table" ${stageSide ? '' : 'inert'} style="--split:${Math.round(splitOf('side') * 100)}%">
      ${stageSide && !phone() ? `<span class="cm-board-panelgrip">${grip('panelw', 'The drawer width: drag, or use the arrow keys', panelWidth(), PANELW, 'vertical')}</span>` : ''}
      <header><b>Stack & history</b>${ib('⚙', 'board-modules-edit', 'Arrange modules', {}, {pressed:paneEditing})}${ib('✕', 'board-stage-side', 'Close table panel')}</header>${stageModules('right')}</aside>
      <button type="button" class="cm-stage-handle cm-stage-right cm-drawer-tab" data-action="board-stage-side" aria-expanded="${stageSide}" aria-controls="cm-stack-drawer" aria-label="${stageSide ? 'Collapse' : 'Expand'} Stack${count ? `, ${count} on the stack` : ''}${chatUnread && !stageSide ? `, ${chatUnread} new chat message${chatUnread === 1 ? "" : "s"}` : ''}"><span class="cm-tab-label">Stack</span>${count ? `<i class="cm-tab-count" aria-hidden="true">${count}</i>` : ''}${chatUnread && !stageSide ? `<i class="cm-tab-count cm-tab-chat" aria-hidden="true" title="New chat">${chatUnread}</i>` : ''}</button>${!phone()&&historyOpen?historyMenu():''}`;
  }
  function tableMenu() {
    return `<div class="cm-table-menu"><button type="button" data-action="board-table-menu" aria-expanded="${tableMenuOpen}" aria-controls="cm-table-menu">Table ▾</button>${tableMenuOpen ? `<div id="cm-table-menu" role="group" aria-label="Table">${b('History','board-history')}${table?.youAreHost ? (confirmEnd ? `<p>End the game for everyone? The record is kept.</p>${b('Cancel', 'board-end-cancel')}${b('End game for everyone', 'board-end', {confirm:'1'}, true)}` : b('End game for everyone', 'board-end')) : ''}${b('Table rules', 'board-table-rules')}${b('Help', 'page-help', {help:'table'})}${b('Concede', 'board-concede')}${b('Leave table', 'board-leave-page')}${b('CrankMagic Pages','board-menu').replace('<button ','<button aria-haspopup="true" aria-expanded="'+menuOpen+'" ')}</div>${menuOpen ? `<aside class="cm-table-flyout" aria-label="CrankMagic Pages">${menu()}</aside>` : ''}` : ''}</div>`;
  }
  function cameraMenu() { return `${tableMenu()}<div class="cm-stage-camera"><button type="button" data-action="board-camera" aria-expanded="${cameraOpen}">Camera ▾</button>${cameraOpen ? `<div>${phone() ? "" : switcher()}<span>View seats</span>${ib("◀", "board-rotate", "Previous seat", {by: "-1"})}${ib("▶", "board-rotate", "Next seat", {by: "1"})}<button type="button" class="cm-stage-camera-reset" data-action="board-camera-reset" title="Every Camera setting back to its default">Reset</button>${hudSlider()}
        ${stageEnabled() ? `<label>Tilt <input type="range" min="0" max="${TILT_MAX}" value="${Math.round(camera.tilt)}" data-stage-camera="tilt" aria-label="Table tilt"><output>${Math.round(camera.tilt)}°</output></label>` : ""}
        <label>Zoom <input type="range" min="60" max="${CAMERA_MAX}" value="${camera.zoom}" data-stage-camera="zoom" aria-label="Table zoom"><output>${Math.round(camera.zoom)}%</output></label>
        <label>Cards <input type="range" min="70" max="${CAMERA_MAX}" value="${camera.cards}" data-stage-camera="cards" aria-label="Tabletop card size"><output>${camera.cards}%</output></label>
        ${stageSliders()}
        <label>Spacing <input type="range" min="-70" max="20" step="1" value="${spacing()}" data-board-spacing aria-label="Card spacing" aria-valuetext="${spacing()}%"><output>${spacing()}%</output></label>
        ${b('Play settings','board-tools').replace('<button ','<button aria-haspopup="dialog" ')}
        ${stageEnabled() ? `<label class="cm-stage-style">Background <select data-stage-style="background" aria-label="Background">${(CrankStage.appearances.backgrounds).map(x=>`<option value="${x.id}"${appearance.background===x.id?" selected":""}>${x.name}</option>`).join("")}</select></label>
        <label class="cm-stage-style">Table <select data-stage-style="table" aria-label="Table design">${(CrankStage.appearances.tables).map(x=>`<option value="${x.id}"${tableDesignId(appearance.table)===x.id?" selected":""}>${x.name}</option>`).join("")}</select></label>` : ""}</div>` : ""}</div>`; }
  /* 3D's two sizes beside Cards: ✋ the hand's cards (the wheel over the hand moves it too), ↕ the table's length on your
     side (Ctrl/⌘ + drag moves it too; 100% is the length it always had, the most is the screen's foot). */
  function stageSliders() {
    const [lo, hi] = C.cardScaleRange(), hand = scaleOf("hand"), g = stageGeom;
    const most = g ? 100 + Math.floor(g.reachMost / g.base * 100) : 100 + Math.round(camera.reach * 100), long = g ? 100 + Math.round(g.reach / g.base * 100) : 100 + Math.round(camera.reach * 100);
    return `<label title="Hand cards">✋ <input type="range" min="${lo}" max="${hi}" step="1" value="${hand}" data-board-scale="hand" aria-label="Hand cards" aria-valuetext="${hand}%"><output>${hand}%</output></label>
        ${stageEnabled() ? `<label title="Table length on your side">↕ <input type="range" min="100" max="${most}" step="1" value="${long}" data-stage-length aria-label="Table length on your side" aria-valuetext="${long}%"><output>${long}%</output></label>` : ""}`;
  }
  function stageProfile(me) {
    const initials=(me.name || 'Player').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
    return `<div class="cm-stage-profile">${ib("✉", "send-feedback", "Send feedback", {}, {cls: "compact cm-feedback-glyph"})}<button type="button" class="cm-profile-avatar" data-action="board-profile" aria-label="Account menu" aria-haspopup="true" aria-controls="cm-user-menu" aria-expanded="${C.accountMenuOpen?.() || false}" title="${e(me.name)} · Account menu"><span aria-hidden="true">${e(initials)}</span></button></div>`;
  }
  function moduleSettings() {
    tools = false; profileOpen = false; draw();
    const layout = paneLayout();
    C.modal("Set Side Drawer Modules", `<div id="cm-drawer-settings"><p>Choose where each module appears. After saving, use the arrow buttons in the drawers to change the order.</p><table class="cm-drawer-settings"><thead><tr><th scope="col">Module</th><th scope="col">Left</th><th scope="col">Right</th><th scope="col">None</th></tr></thead><tbody>${PANE_MODULES.map(([id,title]) => {
      const current = layout.left.includes(id) ? "left" : layout.right.includes(id) ? "right" : "none";
      if(id==='actions')return `<tr><th scope="row">${title}</th><td colspan="3">Always in the left drawer; your decision stays available.</td></tr>`;
      return `<tr><th scope="row">${title}</th>${["left","right","none"].map(side => `<td><input type="radio" name="module-${id}" value="${side}" aria-label="${title}: ${side[0].toUpperCase()+side.slice(1)}"${side===current?" checked":""}></td>`).join("")}</tr>`;
    }).join("")}</tbody></table><p class="cm-muted">Saved with your player profile through cloud library sync. Actions stays on the left and can be collapsed. Hiding an optional module keeps its game data.</p><div class="cm-form-footer">${b("Cancel", "close")}${b("Save drawer modules", "board-modules-save", {}, true)}</div></div>`);
  }
  /* THE MANA POOL (Rob, 2026-10-26: "a total sum of available mana ... all summed by the 5 colors + colorless with the
     number directly under the mana symbol, and 2 mana symbols per row, so 3 rows + 1 row above them of the 2 summary
     numbers"). The room says what each of your permanents could tap for (`manaSources`); the sums are made here.
       - Total mana: the most all of your mana sources make together, tapped or not, a source of either of two colors once
         ("a card that can tap for either or of 2 colors only counts as 1"), a Sol Ring twice, a Signet its two less the
         {1} it takes.
       - Available: the same of the sources you could tap now, with what is in your mana pool.
       - Under each symbol: how much of that color you could still have -- the pool's, and one for each untapped source
         that makes it; so a land of either of two colors counts under both, and tapped, both go down by one.
     A table that does not say (an older room) is counted from your basic lands alone, and says so. */
  const MANA_SIX = ["W", "U", "B", "R", "G", "C"], MANA_WORD = {W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", C: "Colorless"};
  const BASIC_MANA = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G", Wastes: "C"};
  const manaSize = (m) => MANA_SIX.reduce((n, k) => n + (m?.[k] || 0), 0);
  /* Work with actual color balances, not mana value alone. Fund a paid activation from the pool and
     other sources, each at most once; the source being activated cannot fund itself. These are
     display calculations only: the room still offers and performs every actual activation/payment. */
  const freeWays = (s) => s.ways.filter((w) => !(w.pay > 0));
  const bestFree = (s) => Math.max(0, ...freeWays(s).map((w) => manaSize(w.mana)));
  const manaGain = (s) => Math.max(bestFree(s), ...s.ways.map((w) => manaSize(w.mana) - (w.pay || 0))) - bestFree(s);
  const addMana = (pool, mana) => Object.fromEntries(MANA_SIX.map((k) => [k, (pool[k] || 0) + (mana[k] || 0)]));
  function fundMana(sources, pool, way) {
    const need = way.payColors || {}, pay = way.pay || 0;
    const search = (left, held) => {
      const color = MANA_SIX.find((k) => (held[k] || 0) < (need[k] || 0));
      if (!color && manaSize(held) >= pay) {
        const after = {...held};
        let generic = pay;
        for (const k of MANA_SIX) {after[k] = (after[k] || 0) - (need[k] || 0); generic -= need[k] || 0;}
        for (const k of MANA_SIX) {const spent = Math.min(after[k], generic); after[k] -= spent; generic -= spent;}
        return {pool: after, left};
      }
      if (color && (held[color] || 0) + left.reduce((n, s) => n + Math.max(0, ...freeWays(s).map((w) => w.mana[color] || 0)), 0) < need[color]) return null;
      if (manaSize(held) + left.reduce((n, s) => n + bestFree(s), 0) < pay) return null;
      for (const source of left) for (const free of freeWays(source)) {
        if (color ? !(free.mana[color] > 0) : !manaSize(free.mana)) continue;
        const funded = search(left.filter((s) => s !== source), addMana(held, free.mana));
        if (funded) return funded;
      }
      return null;
    };
    // Preserve a source with a useful paid ability when an ordinary source can fund this one.
    return search([...sources].sort((a, b) => manaGain(a) - manaGain(b)), {...pool});
  }
  function netMana(sources, start = {}) {
    let left = [...sources], pool = {...start};
    const filters = sources.flatMap((source) => source.ways.filter((w) => w.pay > 0 && manaSize(w.mana) - w.pay > bestFree(source)).map((way) => ({source, way})))
      .sort((a, b) => a.way.pay - b.way.pay || manaSize(b.way.mana) - manaSize(a.way.mana));
    for (const {source, way} of filters) {
      if (!left.includes(source)) continue;
      const paid = fundMana(left.filter((s) => s !== source), pool, way);
      if (!paid) continue;
      left = paid.left;
      pool = addMana(paid.pool, way.mana);
    }
    return manaSize(pool) + left.reduce((n, s) => n + bestFree(s), 0);
  }
  function manaCounts(me) {
    const pool = Object.fromEntries(MANA_SIX.map((k) => [k, 0]));
    for (const m of me.mana || []) if (m.color in pool) pool[m.color] += m.amount;
    const known = Array.isArray(view.manaSources);
    const sources = known ? view.manaSources : me.zones.Battlefield.cards.filter((c) => BASIC_MANA[c.name]).map((c) => ({cardId: c.cardId, name: c.name, tapped: c.tapped, ready: !c.tapped, ways: [{mana: {[BASIC_MANA[c.name]]: 1}}]}));
    const ready = sources.filter((s) => s.ready).map((s) => ({...s, ways: s.ways.filter((w) => w.ready !== false)})), by = {...pool};
    ready.forEach((s, i) => {
      const ways = s.ways.filter((w) => !(w.pay > 0) || fundMana(ready.filter((_, j) => j !== i), pool, w));
      for (const k of MANA_SIX) by[k] += Math.max(0, ...ways.map((w) => w.mana[k] || 0));
    });
    return {known, total: netMana(sources), available: netMana(ready, pool), by};
  }
  function manaPool() {
    const me = players()[view.seat];
    if (!me) return "";
    const {known, total, available, by} = manaCounts(me);
    const cell = (k) => `<div class="cm-mana-cell${by[k] ? "" : " is-none"}" data-mana="${k}"><span class="cm-mana-glyph" aria-hidden="true">${C.mana(`{${k}}`)}</span><b aria-hidden="true">${by[k]}</b><span class="cm-sr-only">${MANA_WORD[k]}: ${by[k]}</span></div>`;
    return `<section class="cm-mana-pool" aria-label="Mana Pool">
      <div class="cm-mana-sums"><div data-mana-sum="total"><span>Total mana</span><b>${total}</b></div><div data-mana-sum="available"><span>Available</span><b>${available}</b></div></div>
      <div class="cm-mana-colors" role="group" aria-label="Available by color">${MANA_SIX.map(cell).join("")}</div>
      ${known ? "" : `<p class="cm-muted">From your basic lands only: this table does not say what your other cards tap for.</p>`}</section>`;
  }
  /* THE TABLE'S CHAT (Rob, 2026-10-28; docs/ui-lane/lounge-contract.md §5): what the table said, newest at the bottom, and a line to
     say something. The server keeps it with the game's log; a reconnect reads the last 50 from the table. A spectator's lines
     carry "Watching: <name>". Text only; voice is a later piece. */
  function heardChat(message) {
    if (!message || typeof message.text !== "string") return;
    if (chatLog.some((m) => m.id === message.id)) return;
    chatLog = [...chatLog, message].slice(-200);
    /* What the others say while the drawer is shut is counted on its tab. */
    const mine = message.seatId !== null && message.seatId === table?.yourSeat;
    if (!mine && !stageSide) chatUnread += 1;
    if (document.getElementById("cm-board")) draw();
  }
  const chatToBottom = () => {const list = document.querySelector(".cm-chat-list"); if (list && chatStick) list.scrollTop = list.scrollHeight;};
  document.addEventListener("scroll", (event) => {const t = event.target; if (t?.classList?.contains("cm-chat-list")) chatStick = t.scrollHeight - t.scrollTop - t.clientHeight < 40;}, true);
  const chatSaid = (m) => `<li class="cm-chat-line${m.seatId !== null && m.seatId === table?.yourSeat ? " is-mine" : ""}"><b>${e(m.name || "A player")}</b> <span>${e(m.text)}</span></li>`;
  function chatBody() {
    const may = !(view?.spectator === true && table?.youAreAdmin !== true), can = may && status === "open" && !chatSending;
    return `<section class="cm-chat" aria-label="Table chat"><ol class="cm-chat-list" role="log" aria-live="polite" aria-label="Messages">${chatLog.length ? chatLog.map(chatSaid).join("") : `<li class="cm-chat-empty cm-muted">No messages yet.</li>`}</ol>
      <form class="cm-chat-form" data-chat-form><input class="cm-chat-input" type="text" maxlength="300" autocomplete="off" enterkeyhint="send" aria-label="Message to the table" placeholder="${may ? "Message the table" : "Only the players chat"}" value="${e(chatDraft)}"${may ? "" : " disabled"}><button type="submit" class="v-button compact"${can ? "" : " disabled"}>Send</button></form></section>`;
  }
  document.addEventListener("input", (event) => {if (event.target?.matches?.(".cm-chat-input")) chatDraft = event.target.value;});
  document.addEventListener("submit", async (event) => {
    if (!event.target.matches || !event.target.matches("[data-chat-form]")) return;
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || chatSending || !tableId) return;
    chatSending = true;
    try {
      const T = tableApi();
      const answer = await T.api("POST", `${T.tableUrl(tableId)}/chat`, {text});
      chatDraft = "";
      if (answer && answer.message) heardChat(answer.message);
    } catch (error) {C.notice(error.message || "The chat did not take that.", true);}
    chatSending = false;
    if (document.getElementById("cm-board")) draw();
    document.querySelector(".cm-chat-input")?.focus({preventScroll: true});
  });
  function stageModules(side="right") {
    const ids = paneModules(side);
    if(side === "left" && !ids.length) return "";
    const bodies = {
      coach: () => coach.open ? `<div class="cm-module-coach-host"></div>` : `<p class="cm-muted">Ask about your board, hand, or table.</p>${b("Open AI Coach", "board-coach", {}, false, {cls:"compact"})}`,
      recommended: () => `<p class="cm-muted">Recommendations use your AI Coach conversation and its privacy settings.</p>${b("Recommend actions", "board-recommend", {}, false, {cls:"compact"})}`,
      chat: () => chatBody(),
      actions: () => !stageRail || actionsShut || /^mulligan:/.test(view.decision?.id || "") ? "" : `${decision() || `<p class="cm-muted">${e(waitingText() || "Choose a card or continue your turn.")}</p>`}`,
      table: () => `<div class="cm-full-vitals">${players().map(p => `<div class="${view.state.turnPlayerId === p.playerId ? "is-turn" : ""}" data-seat="${p.playerId}" style="--seat:${seatColor(p.playerId)}"><span>${e(seatLabel(p))}${turnMark(p.playerId)}</span>${vitals(p, {big:true})}</div>`).join("")}</div>`,
      inspect: () => `<div id="cm-full-pick">${pickPanel()}</div>`,
      stack: () => stack({module:true}) || `<p class="cm-muted">The stack is empty.</p>`,
      history: () => historyBand(30) + eventCards(),
      resources: () => turnResources(),
      mana: () => manaPool(),
      counter: () => `<p class="cm-muted">Public battlefield counts · cards with two types count in both.</p>${players().map(p => `<details class="cm-module-counts"><summary>${e(seatLabel(p))}</summary><dl>${["Creature", "Artifact", "Enchantment", "Land", "Planeswalker"].map(type => `<div><dt>${type}s</dt><dd>${controlledCards(p.playerId).filter(c => c.types.includes(type)).length}</dd></div>`).join("")}</dl></details>`).join("")}`
    };
    return `<div class="cm-stage-modules" data-module-side="${side}" aria-label="${side === "left" ? "Left" : "Right"} drawer modules">${ids.map((id, i) => {
      const title = PANE_MODULES.find(([key]) => key === id)[1];
      const collapsed = id === 'actions' ? actionsShut : foldedModules.has(id);
      const h = moduleH(id), sized = !collapsed;
      return `<section class="cm-stage-module cm-disclosure${h && sized ? ' has-height' : ''}" data-module="${id}" aria-label="${title} module"${h && sized ? ` style="--module-h:${h}px"` : ''}>
        ${id==='coach' && coach.open && !collapsed?'':`<header><h3><button type="button" class="cm-module-toggle" data-action="${id==='actions'?'board-actions-toggle':'board-module-toggle'}" data-module="${id}" aria-expanded="${!collapsed}" aria-controls="cm-module-${id}">${id==='actions'?'Actions':title}<span aria-hidden="true">${collapsed?'▸':'▾'}</span></button></h3>
        ${paneEditing && id !== 'actions' ? `${ib('↑', 'board-module-move', `Move ${title} up`, {module:id, side, by:'-1'}, {disabled:i===0})}${ib('↓', 'board-module-move', `Move ${title} down`, {module:id, side, by:'1'}, {disabled:i===ids.length-1})}${ib('×', 'board-module-remove', `Remove ${title}`, {module:id, side})}` : ''}</header>`}
        <div class="cm-module-body" id="cm-module-${id}"${collapsed ? ' hidden' : ''}>${collapsed ? '' : bodies[id]()}</div>
        ${sized ? `<span class="cm-module-grip">${grip('modh', `${title} height: drag, or use the arrow keys; double-click for its own height`, h || MODH[0], MODH, 'horizontal', ` data-module-id="${id}"`)}</span>` : ''}</section>`;
    }).join("")}</div>`;
  }
  function stageHand(p) {
    const own = isYou(p.playerId), cards = own ? p.zones.Hand.cards : [], n = own ? cards.length : p.zones.Hand.count;
    const limit = Math.max(1, handFit), indices = CrankStage.carousel(n, n>limit ? handStarts.get(p.playerId) || 0 : 0, limit), count = indices.length;
    const label = own ? "Your hand" : `${p.name}'s hand, ${n} cards`;
    const arrow = (direction) => `<button type="button" class="cm-stage-hand-arrow" data-action="board-hand-cycle" data-by="${direction}" data-seat="${p.playerId}" aria-label="${direction<0?"Previous":"Next"} hand card">${direction<0?"‹":"›"}</button>`;
    return `<div class="cm-stage-hand"><section class="cm-stage-fan${own?"":" is-backs"}" aria-label="${e(label)}" style="--fan-count:${count};${backStyle(p.playerId)}">
      <span class="cm-stage-hand-label">${own?"Your hand":`${e(p.name)}'s hand`} · ${n}</span>
      ${n>limit?arrow(-1):""}<div class="cm-stage-fan-cards">${indices.map((index,i)=>{
        /* STACKED LEFT OVER RIGHT (Rob, 2026-10-26: "The left side of each card should be under the next card"): the leftmost
           card is on top, and each card's left edge tucks under the card to its left, so the card you read first is whole. */
        const offset=i-(count-1)/2;
        return `<div class="cm-stage-fan-slot" data-hand-index="${index}" style="--fan-x:${offset};--fan-angle:${offset*3.5}deg;--fan-y:${Math.abs(offset)*Math.abs(offset)*2}px;z-index:${count-i}">${own?card(cards[index],{where:"hand"}):'<div class="cm-bcard is-back" aria-hidden="true"></div>'}</div>`;
      }).join("")}</div>${n>limit?arrow(1):""}
      ${n===0?'<span class="cm-stage-hand-empty">No cards in hand</span>':""}</section></div>`;
  }
  function fitStage(host) {
    const region = host.querySelector(".cm-stage-region");
    if (!region || !globalThis.CrankStage) {globalThis.CrankStage?.unmount(); return;}
    const big = mode === "table" ? players()[view.seat] : (players()[focus] || players()[view.seat]);
    /* Table and Focus are this stage without the canvas (`flat`); Table's boards are a grid, above the hand's tray. */
    const flat = !stageEnabled();
    /* The turn box keeps beside the left drawer, as the tab does; the drawers move nothing else. */
    const drawerL = host.querySelector(":scope > .cm-stage-rail.is-open")?.offsetWidth || 0;
    host.style.setProperty("--drawer-l", `${drawerL}px`);
    /* The action pop-up stands in the middle of what the drawers leave seen, and clear of the turn box, not behind a drawer or over the box. */
    const popup = region.querySelector(":scope > .cm-stage-actions");
    if (popup) {
      const at0 = region.getBoundingClientRect(), covered = [...host.querySelectorAll(":scope > .cm-stage-side.is-open, :scope > #cm-card-inspector")].reduce((n, el) => el.getClientRects().length ? Math.max(n, at0.right - el.getBoundingClientRect().left) : n, 0);
      const cap = region.querySelector(":scope > .cm-stage-caption")?.getBoundingClientRect(), half = popup.offsetWidth / 2;
      const lo = Math.max(drawerL + half + 8, cap ? cap.right - at0.left + 12 + half : 0), hi = region.clientWidth - covered - half - 8;
      popup.style.left = `${Math.round(Math.max(lo > hi ? hi : lo, Math.min(hi, (drawerL + region.clientWidth - covered) / 2)))}px`;
    }
    /* Drawers lie over the stage and the hand and move neither: a flat table keeps its boards clear of where they lie, open or not (the 40px is the tab on each edge). */
    if (flat) {
      const railW = host.querySelector(":scope > .cm-stage-rail.is-open")?.offsetWidth, sideW = host.querySelector(":scope > .cm-stage-side.is-open")?.offsetWidth;
      if (railW) drawerW.left = railW; if (sideW) drawerW.right = sideW;
      const room = host.clientWidth * .4;
      gutter = {left: Math.round(Math.min(drawerW.left, room) + 40), right: Math.round(Math.min(drawerW.right, room) + 40)};
      host.style.setProperty("--gut-l", `${gutter.left}px`); host.style.setProperty("--gut-r", `${gutter.right}px`);
    } else {host.style.removeProperty("--gut-l"); host.style.removeProperty("--gut-r");}
    if (flat) fitFan(host);   /* the tray's height first: the boards are fitted above it */
    const tray = host.querySelector(":scope > .cm-stage-hand");
    const opts = {flat, grid: flat && mode === "table", reserve: flat ? Math.round(tray?.getBoundingClientRect().height || 0) : 0, tilt: cameraTilt(), zoom: camera.zoom, pan: camera.pan, reach: camera.reach, rearMin:0, live: !!stretch, rotation: 0, cards: camera.cards, reduced: globalThis.CrankMotion?.reduced() ?? false,
      background: table?.appearance?.background || appearance.background, table: tableDesignId(table?.appearance?.table || appearance.table),
      mats: (mode === "table" ? players() : [big, ...players().filter((p) => p.playerId !== big.playerId)]).map((p) => matOf(p.playerId)),
      combat: view.state.phase?.startsWith("COMBAT_") ?? false, instant: view.state.stack.some((s) => /Instant/i.test(typeLineOf(s))),
      onReady() {stageError = ""; const el = document.querySelector(".cm-stage-error"); if (el) el.textContent = "";},
      onError(message) {stageError = message; const el = document.querySelector(".cm-stage-error"); if (el) el.textContent = `${message} Use Focus view in Camera if graphics are unavailable.`;}};
    if (flat) {
      opts.background = ""; opts.table = "";
      /* Table's life counter lies over the crossing of the four boards, so they leave it room; and the turn box top left is not drawn over a board's name. */
      const pie = Math.round(144 * hudScale() / 100);
      host.style.setProperty("--pie", `${pie}px`);
      /* ...and clear of it side to side: the boards on a row leave the dial the gap between them (it covers no board), and start below the action pop-up. */
      const barW = host.querySelector(":scope .cm-stage-actions")?.offsetWidth || 0;
      opts.gapWide = players().length >= 2 ? barW + 28 : 0;
      opts.gapX = players().length >= 2 ? Math.min(pie + 8, Math.round((region.clientWidth - gutter.left - gutter.right) * .25)) : 22; opts.gapY = 22;
      const caption = host.querySelector(":scope .cm-stage-caption"), at = region.getBoundingClientRect();
      /* Focus's boards start under the action pop-up (the 3D view's others are far enough back to lie under it); Table's have it in the gap between them. */
      const barEl = host.querySelector(":scope .cm-stage-actions");
      opts.top = barEl ? Math.ceil(barEl.getBoundingClientRect().bottom - at.top + 6) : Math.round(76 * hudScale() / 100);
      opts.inL = gutter.left; opts.inR = gutter.right;
      opts.padL = caption ? Math.ceil(caption.getBoundingClientRect().width + 54) : 0;
      opts.stripMin = Math.ceil(Math.max(0, ...[...region.querySelectorAll(".cm-stage-rear")].map((el) => el.scrollHeight)) + 6);
      opts.capB = caption ? Math.ceil(caption.getBoundingClientRect().bottom - at.top + 6) : 0;
    }
    CrankStage.mount(region, opts); stageGeom = CrankStage.layout(region.getBoundingClientRect(), opts) || null;
    // A scaled seat label must leave a complete card row on its rear mat. Keep the original
    // projection unless the measured label and raster cannot fit their allocated rear surface.
    const rearMin=Math.max(0,...[...region.querySelectorAll('.cm-stage-rear')].map(rear=>{
      const grid=rear.querySelector('.cm-mat-grid'),label=rear.querySelector('.cm-stage-seat-label');if(!grid)return 0;
      const css=getComputedStyle(grid),gap=parseFloat(getComputedStyle(rear).rowGap)||0;
      const raster=Math.max(0,...[...grid.querySelectorAll('.cm-bcard')].map(card=>card.offsetHeight));
      return (label?.offsetHeight||0)+gap+raster+(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)+4;
    }));
    if(stageGeom?.rear.some(rear=>rear.height<rearMin)){opts.rearMin=rearMin;stageGeom=CrankStage.layout(region.getBoundingClientRect(),opts)||stageGeom;}
    for (const h of region.querySelectorAll(".cm-stage-corner")) {const i = Number(h.dataset.corner), q = stageGeom?.quad; h.hidden = !q; if (q) {h.style.left = `${q[i * 2].toFixed(1)}px`; h.style.top = `${q[i * 2 + 1].toFixed(1)}px`;}}
    const length = host.querySelector("[data-stage-length]");
    if (stageGeom && length) {const most = 100 + Math.floor(stageGeom.reachMost / stageGeom.base * 100), v = 100 + Math.round(stageGeom.reach / stageGeom.base * 100); length.max = String(most); length.value = String(v); length.setAttribute("aria-valuetext", `${v}%`); length.parentElement.querySelector("output").textContent = `${v}%`;}
    fitFan(host);
  }
  /* THE 3D HAND'S SIZE is Hand cards (SCALE_KEY.hand), as in the other views: the wheel over it, Camera's ✋ slider and
     Tools' card size all move the one value. At 100% it is the size it always was -- 190px, or less where the window is
     short or narrow -- and the rest is in proportion, its smallest (60%) never under 84px, where a card's name is 10px
     (.cm-bcard-name is 12% of the card), its largest no taller than 60% of the table's height. A fan too wide for the
     window closes up, each card still showing 40% of its width (its name), rather than running off the screen. The cards
     stand on the tray's foot, so the tray grows upward with them. */
  function fitFan(host) {
    const tray = host.querySelector(".cm-stage-hand"), fan = tray?.querySelector(".cm-stage-fan");
    if (!tray || !fan) return;
    /* Table and Focus keep their boards above the hand, so their hand is the smaller (the Hand cards slider makes it larger). */
    const flatHand = !stageEnabled(), k = scaleOf("hand") / 100, base = flatHand ? Math.max(170, Math.min(250, innerHeight * .25)) : Math.max(220, Math.min(330, innerHeight * .34)), wide = tray.clientWidth - (flatHand ? gutter.left + gutter.right : 0);
    const room = host.clientHeight - (host.querySelector(".cm-stage-top")?.offsetHeight || 58), count = Math.max(1, Number(fan.style.getPropertyValue("--fan-count")) || 1);
    const rest = Math.min(190, (base - 24) * 5 / 7, (wide - 110) / 6.1), spread = (count - 1) / 2;
    const tallest = (room * .6 - 24) * 5 / 7, widest = (wide / 2 - 60) / (spread * .4 + .77);
    /* THE HAND SHOWS WHAT FITS (Rob, 2026-10-26: "Increase cards in hand dynamically based on zoom ... I should be able
       to see at least 9"): at the hand's own card size, as many cards as the tray holds with a little more overlap than
       seven take, never fewer than the seven it always showed. The window, the browser's zoom and Hand cards all change it; a change draws
       the hand again once. */
    const natural = Math.max(84, Math.min(rest * k, tallest)), fits = Math.max(7, Math.floor(2 * (wide / 2 - 60 - natural * .77) / (natural * .62)) + 1);
    /* Drawn again only when that changes what is shown: a hand longer than the fewer of the two. */
    if (fits !== handFit) {const n = players()[view.seat]?.zones.Hand.count || 0, was = handFit; handFit = fits; if (n > Math.min(was, fits)) requestAnimationFrame(() => {if (view) draw();});}
    const hc = Math.round(Math.max(84, Math.min(rest * k, tallest, widest)));
    const step = spread ? Math.min(hc * .76, (wide / 2 - 60 - hc * .77) / spread) : hc * .76;
    tray.style.height = `${Math.round(Math.max(base, hc * 1.4 + 24))}px`;
    tray.style.setProperty("--hc", `${hc}px`);
    fan.style.setProperty("--fan-step", `${step.toFixed(1)}px`);
    fan.style.setProperty("--fan-half", `${(spread * step + hc * .77).toFixed(1)}px`);
  }
  function pickPanel() {
    const id = hover ?? selected, pick = id === null ? null : findCard(id);
    if (!pick || !pick.name) return `<p class="cm-full-pick-empty cm-muted">Hover a card to read it here; click one to keep it.</p>`;
    return `<section class="cm-full-pick" aria-label="${e(pick.name)}">${card(pick, {where: "pick", action: "board-zoom-open"})}<div class="cm-board-options">${withManaRow(optionsFor(pick.cardId), (o) => `<button type="button" class="v-button compact primary" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${sayHtml(o)}</button>`) || (pick.why ? `<p class="cm-muted cm-hand-why">${e(pick.why)}</p>` : "")}</div></section>`;
  }
  function drawPick() {const el = document.getElementById("cm-full-pick"); if (el && view) el.innerHTML = pickPanel();}
  /* TABLE VITALS (the handoff's 560px dialog): every seat's life and poison, and every commander's damage to
     every other seat, "n / 21" with its bar; the commander's own seat reads "—". */
  function tableVitals() {
    const ps = players(), head = `<div role="row" class="is-head"><span role="columnheader"></span>${ps.map((p) => `<span role="columnheader">${e(isYou(p.playerId) ? "You" : p.name)}</span>`).join("")}</div>`;
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
  /* THE CARDS A QUESTION OFFERS THAT THE TABLE DOES NOT SHOW (Rob, 2026-10-25: "When I'm presented with a card I can't see
     (e.g. a scry card), it should be on the stack and that should be the way to see it ... graveyard, multiple cards in
     either stack, cards in a player's graveyard or library"): a question other than priority whose options name cards
     outside every battlefield and your own hand -- a library being scried or searched, a graveyard, exile, another
     player's hand -- puts those cards in front of On the Stack, ◇, ahead of the spell or ability that asked, and the
     pile's shuffle browses them. A card the seat's view holds is read from it; one it does not (a library's) is the
     question's own words for it, its name, as a shown card is. */
  function whereIs(cardId) {
    for (const p of players()) for (const [zone, z] of Object.entries(p.zones)) if (z.cards.some((c) => c.cardId === cardId)) return {p, zone};
    return null;
  }
  const ZONE_WORD = {Graveyard: "graveyard", Exile: "exile", Library: "library", Hand: "hand", Command: "command zone"};
  function offeredCards() {
    const d = view?.decision;
    if (!d || d.kind === "priority" || !Array.isArray(d.options)) return [];
    const out = new Map();
    for (const o of d.options) {
      if (o.cardId === undefined || out.has(o.cardId)) continue;
      const at = whereIs(o.cardId);
      if (at && (at.zone === "Battlefield" || (at.zone === "Hand" && isYou(at.p.playerId)))) continue;
      const c = at && findCard(o.cardId), name = c ? (c.faceDown ? "" : c.name || "") : String(o.label || "").replace(/ \([^)]*\)$/, "");
      const whose = at ? (isYou(at.p.playerId) ? "Your" : `${at.p.name}'s`) : "Your";
      out.set(o.cardId, {cardId: o.cardId, name, where: at ? `${whose} ${ZONE_WORD[at.zone] || at.zone.toLowerCase()}` : "Hidden"});
    }
    return [...out.values()];
  }
  /* On the Stack's pile: the offered cards first, then the stack, newest first. A new question puts its first card in front. */
  function stackEntries() {
    const offered = offeredCards(), d = view?.decision;
    if (offered.length && stackFor !== d.id) {stackFor = d.id; stackSelected = null;}
    if (!offered.length) stackFor = null;
    return [...offered.map((c) => ({key: `c:${c.cardId}`, cardId:c.cardId, name: c.name, who: c.where, choice: true, inspect: {kind: "card", ref: String(c.cardId)}})),
      ...[...view.state.stack].reverse().map((x) => ({key: String(x.stackId), cardId:x.cardId, name: x.name, who: nameOf(x.playerId), choice: false, inspect: {kind: "stack", ref: String(x.stackId)}}))];
  }
  /* The stack, newest first; a run of the same thing in a row (a thousand Intruder Alarm triggers) is one line, ×N. */
  function stack({module = false} = {}) {
    const items = view.state.stack;
    if (!items.length && !module) return "";
    if (module) {
      const ordered = stackEntries(), offered = ordered.filter((x) => x.choice).length;
      if (!ordered.length) return "";
      const selectedIndex = Math.max(0, ordered.findIndex((x) => x.key === stackSelected));
      const shown = ordered[selectedIndex], shownUndo=!ordered[selectedIndex].choice?undoOffer(ordered[selectedIndex].cardId):null, visible = CrankStage.carousel(ordered.length, selectedIndex, 5);
      const say = (x) => x.name || (x.choice ? "A card you cannot see" : "A face-down spell");
      return `<section class="cm-board-stack cm-module-stack" aria-label="The stack"><p class="cm-stack-order-note">${offered ? `◇ ${offered} to choose · ` : ""}${ordered.length > offered ? "#1 resolves next · " : ""}click the pile to browse</p>${shown.name ? b("Inspect card", "board-inspect", shown.inspect, false, {cls:"compact"}) : ""}<div class="cm-stack-browser"><ol class="cm-stack-list">${ordered.map((x, i) => `<li><button type="button" class="cm-stack-summary${x.choice ? " is-choice" : ""}" data-action="board-stack-select" data-stack-id="${e(x.key)}" aria-pressed="${i === selectedIndex}"><b class="cm-stack-position"${x.choice ? ' aria-label="To choose"' : ""}>${x.choice ? "◇" : `#${i + 1 - offered}`}</b><strong>${e(say(x))}</strong><span>${e(x.who)}</span></button></li>`).join("")}</ol><div class="cm-stack-image"><button type="button" class="cm-stack-pile" data-action="board-stack-cycle" aria-label="${e(say(shown))}, ${shown.choice ? `card ${selectedIndex + 1} of ${offered} to choose from` : `stack position ${selectedIndex + 1 - offered} of ${ordered.length - offered}`}; show next card" style="--pile-depth:${visible.length - 1}">${visible.map((index, depth) => {const x = ordered[index]; return `<span class="cm-bcard cm-stack-card${x.name ? "" : " is-back"}${x.choice ? " is-choice" : ""}" data-stack-depth="${depth}" style="--depth:${depth};z-index:${visible.length - depth}" aria-hidden="true">${x.name ? `<span class="cm-bcard-name">${e(x.name)}</span><img src="${e(pictureOf(x.name))}" alt="" draggable="false" referrerpolicy="no-referrer">` : ""}</span>`;}).join("")}</button>${shownUndo?undoButton(shownUndo):''}</div></div></section>`;
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
    const topWithUndo=topCard.replace('<div class="cm-stack-top">','<div class="cm-stack-top"><span class="cm-card-slot">').replace('</div>',`${undoOffer(top.cardId)?undoButton(undoOffer(top.cardId)):''}</span></div>`);
    return `<section class="cm-board-stack" aria-label="The stack"><h3>On the stack · ${items.length}</h3>${topWithUndo}<ol>${rows.map(({s, n}) => `<li${s.name ? ` class="cm-stack-entry" tabindex="0" data-stack-name="${e(s.name)}" aria-label="${e(s.name)}${n > 1 ? `, ${n} of them` : ""}, ${e(nameOf(s.playerId))}'s: show the card"` : ""}>${e(s.name || "A face-down spell")}${n > 1 ? ` <b>×${n.toLocaleString("en-US")}</b>` : ""} <span class="cm-muted">${e(nameOf(s.playerId))}</span></li>`).join("")}</ol></section>`;
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
      <section class="cm-panel-pick">${pick && pick.name ? `<div class="cm-panel-card">${card(pick, {where: "pick", action: "board-zoom-open"})}<div class="cm-board-options">${withManaRow(optionsFor(pick.cardId), (o) => `<button type="button" class="v-button compact primary" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${sayHtml(o)}</button>`)}</div></div>` : `<p class="cm-muted">Click a card on the board or in your hand to keep it here.</p>`}</section>
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
  /* A MANA ABILITY IS ITS SYMBOLS (Rob, 2026-10-25: "On Lands or mana taps ... we should show a button for each of the mana
     options as their mana symbol(s) ... 4 mana symbol buttons in a single row under the image"): where the room's offer is a
     mana ability whose way is mana alone ({W}, {G}{G}), it is one small button of those symbols, all of a card's in one row;
     its whole sentence ("Tap for mana: Command Tower {W}") its accessible name and tooltip. Any other offer is as it was. */
  const manaOf = (o) => (o.act === "activate-mana" && /^(\{[^}]+\}\s*)+$/.test(String(o.detail || "").trim()) ? o.detail.trim() : null);
  const manaTap = (o, pressed) => `<button type="button" class="v-button compact cm-mana-tap${picked.includes(o.index) ? " is-picked" : ""}" data-action="board-option" data-index="${o.index}" aria-label="${e(sayFor(o))}" title="${e(sayFor(o))}"${pressed ? ` aria-pressed="${picked.includes(o.index)}"` : ""}${sending ? " disabled" : ""}>${C.mana(manaOf(o))}</button>`;
  function withManaRow(opts, one, pressed = false) {
    const taps = opts.filter(manaOf);
    if (!taps.length) return opts.map(one).join("");
    const row = `<div class="cm-mana-row" role="group" aria-label="${e(`Tap ${taps[0].label} for mana`)}">${taps.map((o) => manaTap(o, pressed)).join("")}</div>`;
    let placed = false;
    return opts.map((o) => (manaOf(o) ? (placed ? "" : ((placed = true), row)) : one(o))).join("");
  }
  function blockDraft() {
    const d=view.decision,attacks=ownBlockAttacks(),a=attacks.find(a=>a.attacker===blockAttacker) || attacks[0];
    if(!a)return '<p>No attacks at your seat.</p>';
    const c=combatCard(a.attacker),options=d.options.filter(o=>o.attackerId===a.attacker && d.legalBlocks.some(b=>b.blocker===o.cardId && b.attackers.includes(o.attackerId)));
    const issues=attackerIssues(a.attacker),restrictions=d.blockReasons?.find(x=>x.attackerId===a.attacker)?.reasons || [];
    const result=blockResult?.key===blockKey()?blockResult:null,globalReasons=result && !result.ok ? result.reasons : [];
    const facts=[c?.power!=null?`${c.power}/${c.toughness}`:'',a.planeswalker!==undefined?`Attacking ${combatName(combatCard(a.planeswalker))}`:'Attacking you',...(c?.keywords || [])].filter(Boolean).join(' · ');
    return `<div class="cm-block-draft" data-wf="W08" data-active-attacker="${a.attacker}"><h2>Block ${e(combatName(c))}</h2><div class="cm-block-attacker">${combatThumb(a.attacker,'Attacker')}<p>${e(facts)}</p></div>
      <div class="cm-block-tiles" data-block-key="${e(`${blockEpoch}:attacker:${a.attacker}`)}" aria-label="Legal blockers">${options.map(o=>{const b=combatCard(o.cardId);return `<button type="button" class="cm-block-tile" data-action="board-block-pair" data-index="${o.index}" data-block-object="${o.cardId}" data-combat-light="${o.cardId}" data-peek-card="${o.cardId}" aria-pressed="${picked.includes(o.index)}"${sending?' disabled':''}>${combatThumb(o.cardId,'Candidate')}<span>${e(combatName(b))}</span><b>${b?.power!=null?`${e(b.power)}/${e(b.toughness)}`:''}</b></button>`;}).join('') || '<p>No legal blockers.</p>'}</div>
      ${restrictions.length?`<p class="cm-block-restrictions">${restrictions.map(e).join(' · ')}</p>`:''}<div class="cm-block-status" role="status">${issues.map(r=>`<p>${e(r)}</p>`).join('')}${globalReasons.length?`<div class="cm-block-global"><strong>Draft check</strong>${globalReasons.map(r=>`<p>${e(r)}</p>`).join('')}</div>`:''}</div>
      ${result && !result.open ? b('Check again','board-block-retry',{},false,{cls:'compact',disabled:sending}) : ''}
      <div class="cm-decide-actions" data-wf="W10">${b("Don't block","board-block-attacker-none",{attacker:String(a.attacker)},false,{disabled:sending})}${b('Confirm','board-block-attacker-confirm',{attacker:String(a.attacker)},false,{disabled:sending}).replace('<button ','<button title="This attacker only" ')}</div></div>`;
  }
  /* Review uses only the current seat's offered words. No target, payment or outcome is inferred. The outlined option is
     the selection on screen (Rob, 2026-10-25: "The outline around the selection indicates the selection. We don't need to
     restate it"), so the words are a screen reader's alone. */
  function selectionSummary(d) {
    const choices = picked.map(i => d.options.find(o => o.index === i)).filter(Boolean);
    return `<span class="cm-action-summary cm-sr-only" aria-live="polite">Selected: ${choices.map(o => e(d.kind === "priority" ? sayFor(o) : o.label)).join("; ")}</span>`;
  }
  const actionLabel = o => ({"play-land":"⤓ Play Card",cast:"✦ Cast Spell",activate:"⚡ Activate","activate-mana":"Tap for mana","undo-mana":"Untap","undo-play":"Undo","undo-land":"Return to hand","turn-face-up":"Turn face up"}[o?.act] || o?.effect || "Confirm");
  const targetChoice = d => /^(?:choose|trigger)-targets?:/.test(String(d.id)) || d.options.some(o=>o.target || o.targetGroups?.some(g=>g.targets.length));
  const visibleSpell = id => {const c=view.state.stack.find(c=>c.cardId===id && c.name && !c.faceDown && c.kind==="spell");return c ? {...c,types:c.types || [],keywords:c.keywords || [],counters:c.counters || {},controller:c.playerId,power:c.power ?? null,toughness:c.toughness ?? null} : null;};
  const namedFace = c => c?.faceDown ? {...c,name:null} : c;
  const sourceFor = (d,o) => {const id=d.sourceId ?? (d.kind === "priority" ? o?.cardId : null);return namedFace(findCard(id)) || visibleSpell(id);};
  /* An offer that asks nothing more of the player: a land (it is not aimed at anything), or one whose only "target" is its own card
     (Rob, 2026-10-27: "I don't need to target myself ... It's implied"). Its one press is the whole decision. */
  const selfOnly = o => o.act === "play-land" || choiceTargets(o).every(g=>g.targets.every(t=>t.id === o.cardId));
  const choiceTargets = o => o?.targetGroups?.filter(g=>g.targets.length) || (o?.affected !== undefined || o?.target ? [{index:0,effect:o.effect,targets:[{kind:o.target?.kind || "object",id:o.affected ?? o.target?.id ?? o.cardId,controllerId:o.controllerId,effect:o.effect}]}] : []);
  const abilityTarget = t => t.kind === "ability" ? view.state.stack.find(s=>s.stackId===t.id && ["ability","trigger"].includes(s.kind)) : null;
  const targetController = t => t.controllerId ?? abilityTarget(t)?.playerId;
  const targetCard = t => t.kind === "player" ? null : t.kind === "ability" ? namedFace(findCard(abilityTarget(t)?.cardId)) : namedFace(findCard(t.affected ?? t.id)) || visibleSpell(t.affected ?? t.id);
  const targetName = t => t.kind === "player" ? nameOf(t.controllerId ?? t.id) : t.kind === "ability" ? (abilityTarget(t)?.name && !abilityTarget(t).faceDown ? `${abilityTarget(t).name} ability` : "ability") : targetCard(t)?.name || "face-down creature";
  const controllerName = id => isYou(id) ? "You" : players().find(p=>p.playerId === id)?.name || "Unknown controller";
  const possessive = (t,source) => t.kind === "player" ? targetName(t) : `${t.kind!=="ability" && (t.affected ?? t.id) === source?.cardId ? "this" : targetController(t) === view.seat ? "your" : controllerName(targetController(t)) + "'s"} ${targetName(t)}`;
  let targetPage = 0, targetReviewing = false;
  const reviewReady = d => picked.length && (d.kind === "priority" || targetReviewing);
  const targetCycles = new Map();
  function targetHeading(d,o) {
    const groups=choiceTargets(o),source=sourceFor(d,o),one=groups.length===1 && groups[0].targets.length===1,verb=groups[0]?.effect || o?.effect;
    const targets=groups.flatMap(g=>g.targets),owners=new Set(targets.map(t=>targetController(t)).filter(id=>id!==undefined));
    const common=["Artifact","Creature","Land","Enchantment","Planeswalker","Battle"].find(type=>targets.length && targets.every(t=>targetCard(t)?.types?.includes(type)));
    const noun=common ? common.toLowerCase()+"s" : "targets";
    const title=one && groups[0].targets[0].kind==="ability" && (!abilityTarget(groups[0].targets[0])?.name || abilityTarget(groups[0].targets[0]).faceDown) ? d.title
      : one && verb ? `${verb} ${possessive(groups[0].targets[0],source)}?`
      : groups.length && groups.every(g=>g.effect===verb) && verb ? `${verb} ${targets.length} ${noun}${owners.size ? ` of ${owners.size} player${owners.size===1?'':'s'}` : ''}?`
      : groups.length && groups.every(g=>g.effect) ? `${groups.map(g=>`${g.effect} ${g.targets.length}`).join(", ")}?` : d.title;
    return `<h2 data-wf="T04">${e(title)}</h2>`;
  }
  function targetReview(d,o) {
    const groups=choiceTargets(o), source=sourceFor(d,o);
    if(!groups.length)return "";
    if(groups.length === 1 && groups[0].targets.length === 1) {
      const t=groups[0].targets[0],c=targetCard(t),verb=groups[0].effect || o.effect;
      return `<div class="cm-target-one" data-wf="W01"><div class="cm-target-link">${source ? `<span data-wf="desk-target-1-M01" data-peek-card="${source.cardId}">${card(source,{where:"pick",action:"board-zoom-open"})}</span>` : ""}
        <span class="cm-target-arrow"><b data-wf="T02">${e(verb || "Target")}</b><span aria-hidden="true">→</span><small data-wf="T03">${e(controllerName(targetController(t)))}</small></span>
        ${c ? `<span data-wf="desk-target-1-M02" data-peek-card="${c.cardId}">${card(c,{where:"pick",action:"board-zoom-open"})}</span>` : `<span>${e(targetName(t))}</span>`}</div>
        ${c ? `<div class="cm-target-affected" data-wf="desk-target-1-M03">${card(c,{where:"pick",action:"board-zoom-open"})}</div>` : ""}
        </div>`;
    }
    const page=Math.min(targetPage,Math.floor((groups.length-1)/3)), shown=groups.slice(page*3,page*3+3);
    const total=groups.reduce((n,g)=>n+g.targets.length,0), owners=new Set(groups.flatMap(g=>g.targets.map(t=>t.controllerId)));
    return `<div class="cm-target-many has-${shown.length}" data-wf="${shown.length === 3 ? "W03" : "W02"}">
      ${source ? `<div class="cm-target-source">${card(source,{where:"pick",action:"board-zoom-open"})}</div>` : ""}
      <div class="cm-target-quadrants">${shown.map((g,i)=>{
        const key=`${d.id}:${o.index}:${g.index}`,n=targetCycles.get(key)||0,t=g.targets[n%g.targets.length],c=targetCard(t);
        return `<section class="cm-target-quadrant" data-wf="W04"><h3>${e(g.effect || "Target")}</h3><span class="cm-target-effect-arrow" aria-hidden="true">${shown.length===3 ? ["↖","↗","↓"][i] : "→"}</span><button type="button" class="cm-target-stack" data-action="board-target-cycle" data-cycle="${e(key)}" data-count="${g.targets.length}" aria-label="Cycle targets: ${e(targetName(t))}">
          ${Array.from({length:Math.min(4,g.targets.length)},(_,j)=>`<i class="cm-target-layer" style="--layer:${j}" aria-hidden="true"></i>`).join("")}${c?.name ? `<img src="${e(pictureOf(c.name))}" alt="${e(c.name)}" data-peek-card="${c.cardId}">` : `<span>${e(targetName(t))}</span>`}<b>×${g.targets.length}</b></button><p>${e(controllerName(targetController(t)))} · ${n%g.targets.length+1} of ${g.targets.length}</p></section>`;
      }).join("")}</div>${groups.length>3 ? `<nav class="cm-target-pager">${b("Previous","board-target-page",{by:"-1"},false,{disabled:page===0})}<span>${page+1} of ${Math.ceil(groups.length/3)}</span>${b("Next","board-target-page",{by:"1"},false,{disabled:(page+1)*3>=groups.length})}</nav>` : ""}</div>`;
  }
  function decisionPick(d,o) {
    const c=sourceFor(d,o);
    /* The same card is never shown twice in Actions (Rob, 2026-10-28): when the desk already shows it large, its small tile is left out. */
    if (c && deskInspection() && String(inspection.id) === String(c.cardId) && !(reviewReady(d) && targetChoice(d))) return "";
    return c ? `<div class="cm-pick">${card(c,{where:"pick",action:"board-zoom-open"})}<div><strong>${e(c.name || "Face-down card")}</strong><small>${e(typeLineOf(c))}</small><span>${e(controllerName(c.controller))}</span></div></div>` : "";
  }
  function commitReview(d) {
    const o=d.options.find(o=>o.index===picked[0]);
    if (!o || !picked.length) return "";
    if(targetChoice(d) && d.kind!=="priority" && !targetReviewing) {
      return `<div class="cm-action-review" data-wf="W15-actions">${selectionSummary(d)}<div class="cm-decide-actions">${b("Next","board-target-next",{},false,{cls:"compact cm-text-action",disabled:sending || draftRevision!==view.revision}).replace('data-action="board-target-next"','data-wf="W15-next" data-forward="true" data-action="board-target-next"')}${b("Cancel","board-draft-cancel",{},false,{cls:"compact",disabled:sending})}</div></div>`;
    }
    const groups=choiceTargets(o), verb=groups[0]?.effect || o.effect;
    const decline=d.options.find(x=>x.decline===true), targeting=targetChoice(d), label=targeting && groups.length===1 && verb ? verb : actionLabel(o);
    return `<div class="cm-action-review">${selectionSummary(d)}${targetReview(d,o)}${verb ? `<p class="cm-consequence">If it resolves: ${e(verb.toLowerCase())}${groups.length ? ` ${groups.reduce((n,g)=>n+g.targets.length,0)} target${groups.reduce((n,g)=>n+g.targets.length,0)===1?'':'s'}` : ''}.</p>` : ""}<div class="cm-decide-actions" data-wf="W01-actions">${b(label,"board-confirm",{},true,{disabled:sending || draftRevision !== view.revision}).replace('data-action="board-confirm"','data-wf="C02" data-action="board-confirm"')}${b(targeting ? "Change target" : "Back","board-reset",{},false,{disabled:sending}).replace('data-action="board-reset"','data-wf="C03" data-action="board-reset"')}${decline && (d.optional || decline.optional) ? b(`Don't ${(verb || "continue").toLowerCase()}`,"board-decline",{index:String(decline.index)},false,{disabled:sending}).replace('data-action="board-decline"','data-wf="C04" data-action="board-decline"') : b("Cancel","board-draft-cancel",{},false,{disabled:sending})}</div></div>`;
  }
  /* THE SAME CARD, ONE STACK (Rob, 2026-10-25: "stack cards that are identical and have an x# on them to say how many. I can
     then click that stack to select one. If I can select more than one, I should have a small numeric tick up/down value to
     choose how many in that stack I'm selecting (doesn't apply to no-stack cards)."). In a question that asks for one or many,
     options that say the same and stand for the same card are one button, ×N: the same words, and a card the board shows
     in the same state -- everything the room tells of it but its object number, so a tapped Goblin and an untapped one,
     or one with a counter, stay two. A card the board does not show (one in a library being searched) is its name. Which
     of identical cards is taken changes nothing, so a stack gives the first it has not given yet. */
  const sameKey = (o) => {
    /* `affected` (and a target's `id`) only repeat which card this is: left in, no two cards were ever the same card. */
    const {index, cardId, affected, ...words} = o;
    if (affected !== undefined && affected !== cardId) words.affected = affected;
    if (words.target && words.target.id === cardId) words.target = {...words.target, id: undefined};
    let seen = null;
    if (cardId !== undefined) {const c = findCard(cardId); seen = c ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== "cardId")) : "unseen";}
    return JSON.stringify([words, seen]);
  };
  function sameStacks(d) {
    const stacks = new Map();
    for (const o of d.options) {const k = sameKey(o); if (stacks.has(k)) stacks.get(k).push(o); else stacks.set(k, [o]);}
    return [...stacks.values()];
  }
  /* WHAT AN ATTACK RISKS (Rob, 2026-10-25: "If they have a creature with power equal to or greater than the toughness of one of
     my attackers, that action button for that attacker should be red ... If the creature ... has power lower than ... all of
     the target opponent's creatures, it should have a yellow ... indication that it will not result in killing [one] on its
     own"). Read from the table as it stands, for each attack option: the defending player's untapped creatures that could
     block it (a flyer only by flying or reach), which of them could kill it (power at least its toughness left, or
     deathtouch; never an indestructible attacker), and whether it could kill any of them alone. A hint about the table, not
     a rule: the blocks are the defender's to choose, and a trick or first strike can change either answer. */
  const kw = (c, k) => (c.keywords || []).some((x) => String(x).toLowerCase() === k);
  function attackRisk(o) {
    if (o.defenderId === undefined || !String(view.decision?.id || "").startsWith("declare-attackers:")) return null;
    const a = findCard(o.cardId);
    if (!a || a.power == null || a.toughness == null) return null;
    const left = (c) => c.toughness - (c.damage || 0);
    const blockers = controlledCards(o.defenderId).filter((c) => c.types.includes("Creature") && !c.tapped && c.power != null
      && (!kw(a, "flying") || kw(c, "flying") || kw(c, "reach")));
    if (!blockers.length) return null;
    const die = kw(a, "indestructible") ? [] : blockers.filter((c) => c.power > 0 && (kw(c, "deathtouch") || c.power >= left(a)));
    const kills = a.power > 0 && blockers.some((c) => !kw(c, "indestructible") && (kw(a, "deathtouch") || a.power >= left(c)));
    return die.length || !kills ? {die, weak: !kills} : null;
  }
  const riskCls = (r) => (r ? `${r.die.length ? " is-risk-die" : ""}${r.weak ? " is-risk-weak" : ""}` : "");
  const riskMark = (r) => (r ? `${r.die.length ? `<span class="cm-risk is-die" title="Could die: ${e(r.die.map((c) => `${c.name} ${c.power}/${c.toughness}`).join(", "))}">☠<span class="cm-sr-only"> could die to ${e(r.die.map((c) => c.name).join(", "))};</span></span>` : ""}${r.weak ? `<span class="cm-risk is-weak" title="Kills no blocker alone">⊘<span class="cm-sr-only"> kills no blocker alone;</span></span>` : ""}` : "");
  /* An option that names a card the seat can read carries it for the hover (peek). */
  const peekOf = (o) => (o.cardId !== undefined && (findCard(o.cardId)?.name || shownCard(o.cardId)) ? ` data-peek-card="${o.cardId}"` : "");
  function decision() {
    const d = view.decision;
    if (!d || view.status === "finished" || d.kind === "draw") return "";
    if (/^mulligan:/.test(d.id) && d.options.some(o => o.label === 'Keep')) {
      return `<section class="cm-board-decision" id="cm-board-decision" data-choice-id="${e(d.id)}" data-match-id="${e(view.matchId)}"><h3>Your opening hand</h3><div class="cm-decide-actions">${d.options.map(o => b(o.label,'board-opening-hand',{index:String(o.index)},o.label==='Keep',{disabled:sending})).join('')}</div></section>`;
    }
    const opt = (o, extra = "", r = attackRisk(o)) => `<button type="button" class="v-button compact${picked.includes(o.index) ? " is-picked" : ""}${riskCls(r)}" data-action="board-option" data-index="${o.index}"${peekOf(o)}${sending ? " disabled" : ""}${extra}>${riskMark(r)}${e(targetChoice(d) && o.controllerId !== undefined && !o.decline ? (o.affected !== undefined ? namedFace(findCard(o.affected))?.name || "face-down creature" : o.target?.kind === "player" ? controllerName(o.controllerId) : o.label) : o.label)}<span class="cm-sr-only">${targetChoice(d) ? e(o.label) : ""}</span></button>`;
    /* One option as ever; a stack as one button, ×N, and -- where the question takes more than one -- how many of it. */
    const stackOpt = (s) => {
      if (s.length === 1) return opt(s[0], ` aria-pressed="${picked.includes(s[0].index)}"`);
      const ids = s.map((o) => o.index), k = ids.filter((i) => picked.includes(i)).length;
      const many = d.mode === "many" && d.max > 1, room = Math.min(s.length, d.max - (picked.length - k));
      const r = attackRisk(s[0]);
      return `<span class="cm-board-same"><button type="button" class="v-button compact${k ? " is-picked" : ""}${riskCls(r)}" data-action="board-option-same" data-same="${ids.join(",")}" aria-pressed="${k > 0}"${peekOf(s[0])}${sending ? " disabled" : ""}>${riskMark(r)}${e(s[0].label)} <span class="cm-board-same-n">×${s.length}</span></button>${many
        ? `<input type="number" class="cm-board-same-count" min="0" max="${room}" step="1" value="${k}" data-board-same="${ids.join(",")}" aria-label="How many ${e(s[0].label)}"${sending ? " disabled" : ""}>` : ""}</span>`;
    };
    /* LANDS LAST, FOLDED (Rob, 2026-10-25: "When being given action options that target cards, if the rules allow lands
       (e.g. permanents), always show lands after every other option under a subheader, "lands" and by default have it
       collapsed."): in a question of targets that offers lands beside other things, the lands come after everything
       else, in a "Lands" group shut until opened -- open while a land is picked, and as the player left it for this
       question. Only targets: a cost's question (what to tap) is about lands and keeps them in view. */
    const targeting = targetChoice(d);
    const isLand = (s) => targeting && s.every((o) => o.cardId !== undefined && findCard(o.cardId)?.types?.includes("Land"));
    const landGroup = (stacks) => {
      const lands = stacks.filter(isLand), rest = stacks.filter((s) => !isLand(s));
      if (!lands.length || !rest.length) return stacks.map(stackOpt).join("");
      const open = landsOpen === d.id || lands.some((s) => s.some((o) => picked.includes(o.index)));
      return rest.map(stackOpt).join("") + `<details class="cm-board-lands-group" data-lands-for="${e(d.id)}"${open ? " open" : ""}><summary>Lands <span class="cm-board-lands-n">${lands.reduce((n, s) => n + s.length, 0)}</span></summary><div class="cm-board-lands-options">${lands.map(stackOpt).join("")}</div></details>`;
    };
    const grouped = stacks => {
      if(!targeting)return landGroup(stacks);
      if(stacks.some(ss=>choiceTargets(ss[0]).reduce((n,g)=>n+g.targets.length,0)>1))return `<div class="cm-target-options" data-wf="W15">${landGroup(stacks)}</div>`;
      const by=new Map();
      for(const stack of stacks.filter(ss=>!ss[0].decline)) {const id=stack[0].controllerId ?? stack[0].targetGroups?.[0]?.targets?.[0]?.controllerId; if(!by.has(id))by.set(id,[]);by.get(id).push(stack);}
      return `<div class="cm-target-options" data-wf="W15">${[...by].sort(([a],[b])=>(isYou(a))-(isYou(b))).map(([id,ss])=>`<section class="cm-target-controller"><h3>${e(controllerName(id))}</h3>${landGroup(ss)}</section>`).join("")}</div>`;
    };
    let body = "", foot = "";
    if (d.kind === "priority") {
      /* Pass is the strip's; this is what else you can do, one button per kind of thing, the same land four
         times over being one "Play Forest" (clicking a card in the hand selects that very one). */
      const seen = new Map();
      for (const o of d.options.filter(o => actionCard === null || o.cardId === actionCard || o.preparedFrom === actionCard)) {
        /* A land just played goes back to the hand as one would take it back at a table, by its double-click: no button. */
        if (o.act === "pass" || o.act === "resolve-all" || o.act === "undo-land") continue;
        const key = actionCard === null ? `${o.act}|${o.label}` : String(o.index);
        if (seen.has(key)) seen.get(key).n += 1; else seen.set(key, {o, n: 1});
      }
      if (!seen.size) return "";
      /* A card that can be used more than one way -- a spell's targets, a cost's sacrifice, a land's colors -- asks which
         in Actions rather than doing the first (Rob, 2026-10-01). */
      const ways = (o) => new Set(d.options.filter((x) => x.act === o.act && x.label === o.label && x.detail).map((x) => x.detail)).size;
      const each = ({o, n}) => actionCard === null && ways(o) > 1
        ? `<button type="button" class="v-button compact" data-action="board-choose" data-card="${o.cardId}"${sending ? " disabled" : ""}>${e(verbFor(o))} <span class="cm-muted">· ${ways(o)} ways</span></button>`
        : `<button type="button" class="v-button compact" data-action="board-option" data-index="${o.index}" aria-pressed="${picked.includes(o.index)}"${sending ? " disabled" : ""}>${sayHtml(o)}${n > 1 ? ` <span class="cm-muted">×${n}</span>` : ""}</button>`;
      /* One card's offers: its mana abilities one row of symbols. */
      const rows = [...seen.values()], count = new Map(rows.map((r) => [r.o, r.n]));
      if(actionCard !== null && rows.length===1 && selfOnly(rows[0].o)) {
        const o=rows[0].o;
        return `<section class="cm-board-decision" id="cm-board-decision" data-wf="W14"><h2>${e(sourceFor(d,o)?.name || o.label)}</h2>${deskCard()}<div class="cm-decide-actions">${b(verbFor(o),"board-direct",{index:String(o.index),revision:String(view.revision)},true,{disabled:sending || draftRevision !== view.revision})}${b("Cancel","board-action-all")}</div></section>`;
      }
      body = actionCard === null ? rows.map(each).join("") : withManaRow(rows.map((r) => r.o), (o) => each({o, n: count.get(o)}), true);
      return `<section class="cm-board-decision is-also" id="cm-board-decision" aria-label="What you can do">${actionCard === null ? "" : `<button type="button" class="cm-board-back" data-action="board-action-all">${CHEV_LEFT}<span>All actions</span></button>`}${picked.length && targetChoice(d) ? "" : `<h3>${actionCard === null ? "Choose an action" : e(findCard(actionCard)?.name || "Choose an action")}</h3>`}${decisionPick(d,d.options.find(o=>o.index===picked[0]) || rows[0]?.o)}${picked.length && targetChoice(d) ? targetHeading(d,d.options.find(o=>o.index===picked[0])) : ""}${picked.length && targetChoice(d) ? "" : deskCard()}<div class="cm-board-options">${picked.length && targetChoice(d) ? "" : body}</div>${commitReview(d)}</section>`;
    }
    if (["one", "boolean", "index"].includes(d.mode)) {body = reviewReady(d) && targeting ? "" : d.mode === "one" ? grouped(sameStacks(d)) : d.options.map((o) => [o]).map(stackOpt).join(""); foot = commitReview(d);}
    else if (blocking()) {
      body = blockDraft();
      foot = "";
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
      body = allAt + grouped(sameStacks(d));
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
    if(!foot && targeting) {
      const decline=d.options.find(o=>o.decline && (d.optional || o.optional));
      foot=decline ? b(`Don't ${(d.options.find(o=>o.effect)?.effect || "continue").toLowerCase()}`,"board-decline",{index:String(decline.index)}) : "";
    }
    /* A question in the card's own words ("When this creature enters, you may search ...") is a sentence to read, not a
       heading: it is set as one (Rob, 2026-10-01: a choice is a pop-up where the player selects). */
    const sentence = String(d.title || "").length > 48;
    /* Asked in a run you chose Resolve all for: this answer goes for the same question each time the run asks it (Rob,
       2026-10-09: "Yes to all"; game/room/room.mjs). */
    const forRun = d.forRun ? `<p class="cm-muted cm-board-for-run">Resolve all: your answer goes for this same question each time the run asks it.</p>` : "";
    return `<section class="cm-board-decision${blocking() ? " is-blocking" : ""}" id="cm-board-decision" data-choice-id="${e(d.id)}" data-match-id="${e(view.matchId)}" aria-label="${e(d.title)}">${decisionPick(d,d.options.find(o=>o.index===picked[0]))}${reviewReady(d) && targeting && choiceTargets(d.options.find(o=>o.index===picked[0])).length ? targetHeading(d,d.options.find(o=>o.index===picked[0])) : blocking() ? "" : `<h2>${e(d.title)}</h2>`}${forRun}${targeting ? `<ol class="cm-steps"><li class="${reviewReady(d) ? '' : 'is-now'}">Pick</li><li class="${reviewReady(d) ? 'is-now' : ''}">Review</li></ol>` : ""}${reviewReady(d) && targeting ? "" : deskCard()}
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
    const now = isYou(view.state.turnPlayerId) ? `Turn ${w.now} is yours.` : `Turn ${w.now} · ${e(nameOf(view.state.turnPlayerId))}`;
    return `<section class="cm-board-decision cm-board-went" aria-label="${e(span)}"><h3>${e(span)}</h3>
      <ol class="cm-board-went-list">${rows}</ol><div class="cm-board-decision-foot"><span class="cm-muted">${now}</span>${b("OK", "board-went-close", {}, false, {cls: "compact"})}</div></section>`;
  }
  function ask() {
    const d = view.decision, side = moduleSide('actions');
    const visible = !/^mulligan:/.test(d?.id || '') && !actionsShut && (phone() ? stageRail : side === 'left' ? stageRail : side === 'right' ? stageSide : false);
    const inner = `${went()}${moduleSide('stack') ? '' : stack()}${!visible && d && d.kind !== 'draw' ? decision() : ''}`;
    return `<div class="cm-board-ask cm-decision-slot" id="cm-decision-slot" aria-label="Current decision"${inner ? '' : ' hidden'}>${inner}</div>`;
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
    return `<ul class="cm-board-hand-types" aria-label="Castable now, of each type in your hand">${HAND_TYPES.map((k) => `<li data-type="${k}"${n[k][0] ? ' class="is-live"' : ""} aria-label="${k}: ${n[k][0]} of ${n[k][1]} castable now" title="${k}: ${n[k][0]} castable now / ${n[k][1]} in hand"><span>${k}</span><b>${n[k][0]}/${n[k][1]}</b></li>`).join("")}</ul>`;
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
  // One read-only inspector for every view. Resolve references from this seat's current
  // projection, never from a name supplied by an element or a hidden catalog lookup.
  function inspectedCard() {
    if (!inspection || inspection.matchId !== view?.matchId) return null;
    let c;
    if (inspection.kind === "stack") c = view.state.stack.find(s => String(s.stackId) === inspection.id);
    else if (inspection.kind === "event") c = (view.events || []).find(x => playKey(view.matchId, x) === inspection.id)?.card;
    else c = findCard(Number(inspection.id)) || shownCard(Number(inspection.id));
    return c?.name ? {cardId: -1, types: [], counters: {}, power: null, ...c} : null;
  }
  function inspect(id, kind = "card", automatic = false) {
    if (!view) return;
    inspection = {id:String(id), kind, matchId:view.matchId, automatic};
    if (!inspectedCard()) {inspection = null; return;}
    if (coach.open && !moduleSide("coach")) {coach.open = false; drawCoach();}
    inspectionFrom = C.focusKey(document.activeElement);
    showing = null; held = null;
    peek(null); stackPeek(null); draw();
    document.querySelector("[data-action=board-inspect-close]")?.focus({preventScroll:true});
  }
  /* THE CARD BEING ACTED ON IS READ IN ACTIONS (Rob, 2026-10-25: "whenever I click on a card that can have an action, I
     end up with both the inspection pane and the left side pane. Don't need both. Inspection pane should be within the
     left drawer."): an inspection the board opens by itself -- a card clicked for its actions, an option staged, a cost or
     a target asked for a card -- is drawn at the top of the Actions desk, beside its actions, and no pane opens on the
     right. One a person asks for (🔍, Inspect card) still opens the inspector. */
  const deskInspection = () => !!inspection?.automatic;
  function deskCard() {
    if (!deskInspection()) return "";
    const c = inspectedCard();
    return c ? `<div class="cm-action-card" aria-label="${e(c.name)}" style="--desk-card-w:${deskW()}px">${card(c, {where: "pick", action: "board-zoom-open"})}</div><span class="cm-desk-grip">${grip("deskcard", "The card's size: drag, or use the arrow keys", deskW(), DESK)}</span>` : "";
  }
  function inspector() {
    if (!inspection || deskInspection()) return "";
    const c = inspectedCard();
    return `<aside id="cm-card-inspector" aria-label="Card inspection"><header><h3>${e(c?.name || "Card unavailable")}</h3>${ib("✕", "board-inspect-close", "Close card inspection")}</header>
      ${c ? `<p class="cm-inspection-context">${inspection.kind === "event" ? "Recorded event · card reference" : inspection.kind === "stack" ? "On the stack" : "Current visible card"} · inspection only</p>${card(c, {where:"peek", action:"none"})}${c.oracleText ? `<p>${e(c.oracleText)}</p>` : ""}${c.why ? `<p>${e(c.why)}</p>` : ""}` : `<p>This card is no longer visible in your current game view.</p>`}</aside>`;
  }
  function eventCards() {
    const events = [...(view.events || [])].reverse().filter(x => x.card?.name && !x.card.faceDown).slice(0, 8);
    return events.length ? `<div class="cm-history-cards" aria-label="Inspect recent event cards">${events.map(x => b(x.card.name, "board-inspect", {kind:"event", ref:playKey(view.matchId,x)}, false, {cls:"compact"})).join("")}</div>` : "";
  }
  /* A card this seat was shown in its own decision (ROB-169: a look at another player's hand), which is not on any zone it
     can see: read from the decision, by name. */
  const shownCard = (cardId) => {
    const o = view?.decision?.mode === "ack" ? view.decision.options.find((x) => x.cardId === cardId && x.label) : null;
    if (o) return {cardId: o.cardId, name: o.label, types: [], power: null, counters: {}};
    /* And a card a question offers from out of sight (offeredCards): its name as the question says it. */
    const c = offeredCards().find((x) => x.cardId === cardId && x.name);
    return c ? {cardId: c.cardId, name: c.name, types: [], power: null, counters: {}} : null;
  };
  function zoom(cardId) {
    const c = findCard(cardId) || shownCard(cardId);
    if (!c?.name) return;
    actionCard = cardId; picked = []; draftRevision = view.revision;
    actionsShut = false; openModuleDrawer("actions"); alsoOpen = false;
    if (!phone() && view) inspection = {id: String(cardId), kind: "card", matchId: view.matchId, automatic: true};
    showing = null; held = null; peek(null); draw();
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
    /* The hover always shows the card (Rob, 2026-10-25: "Even when an action to decide on a selected card, my on-hover for
       any card should still work to pop-up the card"), but for the very card pinned in the inspector, already shown. */
    const id = el.dataset.card ?? el.dataset.peekCard;
    if (inspection && !deskInspection() && inspection.kind === "card" && inspection.id === String(id)) return;
    peekId = Number(id);
    peekTimer = setTimeout(() => {
      peekTimer = null;
      if (!el.isConnected && !stillUnder(peekId)) {peekId = null; return;}
      const c = findCard(Number(id)) || shownCard(Number(id));
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
    const s = view.state, me = players()[view.seat], p = players()[focus] || me, mine = isYou(p.playerId);
    const {step, next} = stepInfo();
    const icon = (glyph, action, label, extra = "") => `<button type="button" class="cm-phone-icon" data-action="${action}" aria-label="${e(label)}" title="${e(label)}">${glyph}${extra}</button>`;
    const rail = `<nav class="cm-phone-rail" aria-label="Board">
      ${icon("✋", "board-show-hand", "Your hand", `<span class="cm-phone-badge">${me.zones.Hand.count}</span>`)}
      <span class="cm-board-tools">${icon(CLOCK, "board-history", "History")}${historyOpen ? historyMenu() : ""}</span>
      ${icon(COACH, "board-coach", "CrankMagic Coach")}
      <span class="cm-board-tools">${stageProfile(me)}</span></nav>`;
    const pill = mine
      ? `<div class="cm-phone-pill"><b>T${s.turn}</b><span class="cm-board-step">${e(step)}</span>${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
          ${passButton()}${!isYou(view.state.turnPlayerId) ? skipControl(true) : ""}</div>`
      : `<div class="cm-phone-pill"><span>Viewing ${e(p.name)}</span>${b("My board", "board-focus", {seat: String(view.seat)}, false, {cls: "compact"})}${!isYou(view.state.turnPlayerId) ? skipControl(true) : ""}</div>`;
    const seats = [me, ...players().filter((x) => !isYou(x.playerId))];
    const strip = `<aside class="cm-phone-seats" aria-label="Seats">
      ${seats.map((x) => `<button type="button" class="cm-phone-seat${x.playerId === p.playerId ? " is-focus" : ""}" data-action="board-focus" data-seat="${x.playerId}" aria-pressed="${x.playerId === p.playerId}" style="--seat:${seatColor(x.playerId)}">
        ${seatHeader(x,{interactive:false})}</button>`).join("")}
      <div class="cm-phone-rotate">${b("‹", "board-rotate", {by: "-1"}, false, {cls: "compact"})}${b("›", "board-rotate", {by: "1"}, false, {cls: "compact"})}</div></aside>`;
    return `${rail}${cameraMenu()}${strip}<div class="cm-phone-center">${pill}${combatStrip()}<div class="cm-phone-battlefield" tabindex="0" aria-label="Battlefield, scroll to explore">${mat(p, {size: "phone", head: "none"})}</div><div class="cm-phone-ask">${ask()}</div></div>${boardDrawers()}`;
  }
  /* THE COACH (the handoff's play-coach). It lives beside the board, not inside it, so the views that arrive
     while someone types redraw the board and leave the composer, and whatever is in it, alone. */
  const stepNow = () => {const s = view.state, at = stepAt(s.phase); return s.turn ? `Turn ${s.turn} · ${at < 0 ? "Opening hands" : STEPS[at][0]}` : "Before turn 1";};
  /* What the Coach sees, as the person's AI Coach settings say (AI-6): their hand too, or their board only. */
  const handShared = () => C.state.preferences?.aiCoach?.coachSees !== "board";
  function coachContext() {return `Sees your board${handShared() ? ", hand" : ""} and the table${handShared() ? "" : " (your hand withheld)"} · turn ${view && view.state.turn ? view.state.turn : 0}`;}
  let coachInput=null,coachGate={key:null,available:false},coachFocusRequest=null;
  const coachKey=()=>`${C.signedInAs?.() || ''}|${tableId || ''}`;
  function probeCoach() {
    const key=coachKey();if(coachGate.key===key)return;
    const gate=coachGate={key,available:false,ready:false};coachInput=null;coach.thread=[];coach.typing=false;coach.asked++;
    fetch('/api/ai-coach',{credentials:'same-origin',redirect:'manual'}).then(async response=>response.ok?response.json():null).then(result=>{
      if(coachGate!==gate || coachKey()!==key)return;
      gate.available=result?.open===true;gate.ready=true;drawCoach();
    }).catch(()=>{if(coachGate===gate && coachKey()===key){gate.available=false;gate.ready=true;drawCoach();}});
  }
  function focusRequestedCoach(panelEl) {
    const request=coachFocusRequest;if(!request?.armed)return;
    if(!coach.open || request.key!==coachKey() || request.matchId!==view?.matchId){coachFocusRequest=null;return;}
    if(!coachGate.ready && !coachGate.available)return;
    coachFocusRequest=null;
    if(document.querySelector('#cm-dialog[open]') || JSON.stringify(C.focusKey(document.activeElement))!==JSON.stringify(request.from))return;
    const target=panelEl?.querySelector(coachGate.available?'.cm-coach-input':'[data-action=page-help]');
    target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function drawCoach() {
    const panelEl=document.getElementById('cm-board-coach');if(!panelEl)return;
    const previous=panelEl.querySelector('.cm-coach-input');if(previous)coachInput=previous;
    panelEl.hidden=!coach.open;if(!coach.open){panelEl.replaceChildren();return;}
    probeCoach();dock();
    const input=coachInput,active=document.activeElement,focused=active===input,selection=input?[input.selectionStart,input.selectionEnd,input.selectionDirection]:null;
    const more=panelEl.querySelector('.cm-coach-more'),questions=panelEl.querySelector('.cm-coach-questions'),thread=panelEl.querySelector('.cm-coach-thread');
    const scroll=thread?.scrollTop || 0,bottom=!thread || thread.scrollHeight-thread.clientHeight-scroll<8;
    const activeKey=active?.closest?.('#cm-board-coach')?C.focusKey(active):null;
    panelEl.innerHTML=globalThis.CrankCoach?.render({open:coach.open,available:coachGate.available,thread:coach.thread,typing:coach.typing,prompts:COACH_PROMPTS,moreOpen:!!more?.open,questionsOpen:!!questions?.open,tableId,context:coachContext()}) || '';
    const replacement=panelEl.querySelector('.cm-coach-input');
    if(replacement && input){replacement.replaceWith(input);if(focused){input.focus({preventScroll:true});input.setSelectionRange(...selection);}}
    else if(replacement)coachInput=replacement;
    if(!focused && activeKey)C.focusFind(activeKey)?.focus({preventScroll:true});
    const next=panelEl.querySelector('.cm-coach-thread');if(next)next.scrollTop=bottom?next.scrollHeight:scroll;
    globalThis.CrankCoach?.bind(panelEl);
    focusRequestedCoach(panelEl);
  }
  /* A question to the Coach: POST /api/ai/coach with the table and the question, nothing more -- the table says what is
     on it (cloud/worker.mjs). Signed in to the library only, the AI door's sign-in answers with a redirect, which a
     fetch cannot follow: the reply is then a link to sign in, which comes back here. Any refusal reads as the door said it. */
  const canAsk = text => !!String(text || '').trim() && !!view && !coach.typing && coachGate.key===coachKey() && coachGate.available===true;
  async function ask_(text) {
    const q = String(text || "").trim();
    if (!canAsk(q)) return;
    const requestKey=JSON.stringify([coachKey(),view.matchId]);
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
    if(JSON.stringify([coachKey(),view?.matchId])!==requestKey){coach.typing=false;coach.thread=[];coach.asked++;drawCoach();return;}
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
      el.innerHTML = `<header><b>${e(who)}</b><button type="button" class="cm-play-close" tabindex="-1" aria-label="Close ${e(name)}">✕</button></header>
        <button type="button" class="cm-play-card" tabindex="-1" aria-label="${e(name)}"><img src="${e(pictureOf(name))}" alt="" draggable="false" referrerpolicy="no-referrer"></button>`;
      let left = PLAY_MS, since = performance.now(), timer = null;
      const gone = () => {clearTimeout(timer); if (!el.isConnected) return; el.classList.add("is-leaving"); setTimeout(() => el.remove(), reduced() ? 0 : 600);};
      const run = () => {since = performance.now(); timer = setTimeout(gone, left);};
      el.addEventListener("mouseenter", () => {clearTimeout(timer); left = Math.max(1500, left - (performance.now() - since));});
      el.addEventListener("mouseleave", run);
      el.querySelector(".cm-play-close").addEventListener("click", () => {clearTimeout(timer); el.remove();});
      el.querySelector(".cm-play-card").addEventListener("click", () => inspect(playKey(next.matchId, x), "event"));
      layer.prepend(el);
      while (layer.children.length > PLAYS_SHOWN) layer.lastElementChild.remove();
      run();
    }
    placePlays();
  }
  // Use Focus's spare ground before covering any of the drawer. Keep the mat clear when the gap narrows.
  function placePlays() {
    const layer = document.getElementById("cm-board-plays"), host = document.getElementById("cm-board");
    if (!layer || !host) return;
    layer.style.removeProperty("--plays-left"); layer.style.removeProperty("--plays-top");
    const mat = host.querySelector(".cm-board-stage .cm-board-mat"), pop = layer.querySelector(".cm-play-pop");
    if (!pop) return;
    if (!phone() && mat) {
      const edge = mat.getBoundingClientRect().left, width = pop.getBoundingClientRect().width;
      const leftPanes = [...host.querySelectorAll(".cm-board-pane, .cm-stage-rail.is-open, .cm-stage-left")];
      const start = Math.max(host.getBoundingClientRect().left, ...leftPanes.map(pane => pane.getBoundingClientRect()).filter(r=>r.width>0&&r.left<innerWidth/2).map(r=>r.right));
      const gap = edge - start;
      const left = gap >= width ? start + (gap - width) / 2 : start + 12;
      layer.style.setProperty("--plays-left", `${Math.max(8, Math.round(left))}px`);
    } else if (!phone()) {
      /* No mat in 3D to stand beside (Rob, 2026-10-26: "the pop-up card images for cards opponents played should never
         overlap the left drawer when its out"): with the drawer out they stand just past it, over the table; folded, they
         keep their place at the edge. */
      const out = [...host.querySelectorAll(".cm-stage-rail.is-open, .cm-board-pane, .cm-stage-left")].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0 && r.left < innerWidth / 2);
      if (out.length) layer.style.setProperty("--plays-left", `${Math.round(Math.max(...out.map((r) => r.right)) + 12)}px`);
    }
    /* UNDER THE WHOLE LIFE LIST (you are in it now, Rob 2026-10-26): where the cards stand under the caption, they start
       below its last row, however many rows it has, and are sized to still fit three above the window's foot. */
    const cap = host.querySelector(".cm-stage-caption")?.getBoundingClientRect(), at = layer.getBoundingClientRect().left;
    if (!phone() && cap?.width && at < cap.right && at + pop.offsetWidth > cap.left && cap.bottom + 8 > 176) layer.style.setProperty("--plays-top", `${Math.round(cap.bottom + 8)}px`);
    clearQuestion(layer);
  }
  /* NEVER OVER THE QUESTION (Rob, 2026-10-25, his option A): a card held up over a control of what the table is asking you --
     an option, a blocker's tile, Confirm, the pass -- covered it until its ten seconds were up, and the pointer on it held
     it there. The cards move just past the question, onto the table's edge; one that would still cover a control there (a
     window too narrow for both) is put away at once, as one over the keyboard's focus is. What was played is in the History. */
  const QUESTION = "#cm-board-decision :is(button, input, select, textarea), .cm-stage-actions :is(button, [data-action])";
  /* Where a card stands once it has come in: its box in the layer, not its box this frame. Its entrance slides it 30 px from
     the left, and measured mid-slide a card just past the open drawer seemed to cover the drawer's own buttons and was put
     away before it was seen (Rob, 2026-10-26: no card at all with the drawer out). */
  const restingBox = (layer, pop) => {const l = layer.getBoundingClientRect(), left = l.left + pop.offsetLeft, top = l.top + pop.offsetTop;
    return {left, top, right: left + pop.offsetWidth, bottom: top + pop.offsetHeight};};
  function clearQuestion(layer) {
    const controls = [...document.querySelectorAll(QUESTION)].filter((el) => !el.disabled).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
    const over = (pop) => {const p = restingBox(layer, pop); return controls.some((r) => p.left < r.right && p.right > r.left && p.top < r.bottom && p.bottom > r.top);};
    const pops = [...layer.querySelectorAll(".cm-play-pop")];
    if (!pops.some(over)) return;
    const ask = document.getElementById("cm-board-decision"), width = pops[0].offsetWidth;
    if (ask) {
      const left = Math.round(ask.getBoundingClientRect().right + 14);
      if (left + width <= innerWidth - 8) layer.style.setProperty("--plays-left", `${left}px`);
    }
    for (const pop of pops) if (over(pop)) pop.remove();
  }
  /* For the eye and the pointer: the keyboard's way round the table is the board's own, and what was played is in the History.
     So the pop-ups take no focus and are not read out (as the callouts are not), and one over whatever the keyboard brings
     the focus to is put away at once, never covering it (a11y-board). */
  document.addEventListener("focusin", (event) => {
    const t = event.target;
    if (!t || !t.closest || !t.closest("#cm-board")) return;
    const r = t.getBoundingClientRect();console.log('PLAYS focusin',t.className,t.id,t.dataset&&t.dataset.action,JSON.stringify(r));
    for (const pop of document.querySelectorAll("#cm-board-plays .cm-play-pop")) {
      const p = restingBox(pop.parentElement, pop);
      if (p.left < r.right && p.right > r.left && p.top < r.bottom && p.bottom > r.top) pop.remove();
    }
  });

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
      return {key: `went:${w.from}:${w.to}`, text: `${span} ${isYou(view.state.turnPlayerId) ? `Turn ${w.now} is yours.` : `Turn ${w.now}, ${nameOf(view.state.turnPlayerId)}.`}`};
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
    const coachActive=active?.closest?.('#cm-board-coach')?active:null;
    const coachSelection=coachActive&&typeof coachActive.selectionStart==='number'?[coachActive.selectionStart,coachActive.selectionEnd,coachActive.selectionDirection]:null;
    const caret = active && active.matches && active.matches("[data-board-history-filter]") ? active.selectionStart : null;
    const focusData = active?.closest?.("#cm-board") ? {...active.dataset} : null;
    render();
    if (focusData && Object.keys(focusData).length) {
      const next = [...document.querySelectorAll("#cm-board button, #cm-board input, #cm-board select, #cm-board textarea")].find((el) =>
        Object.entries(focusData).every(([key, value]) => el.dataset[key] === value));
      next?.focus({preventScroll: true});
    }
    if(coach.open && coachGate.key!==coachKey())drawCoach();
    // Reparenting the connected Coach during paint can blur it without replacing its live controls.
    if(coachActive?.isConnected && !coachActive.closest('[inert]') && document.activeElement===document.body){coachActive.focus({preventScroll:true});if(coachSelection)coachActive.setSelectionRange(...coachSelection);}
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
  function fitDrawerDecision(host) {
    const decision=host.querySelector('.cm-stage-module[data-module="actions"] #cm-board-decision');
    const drawer=decision?.closest('.cm-drawer'),body=decision?.closest('.cm-module-body'),module=decision?.closest('.cm-stage-module');
    if(!drawer || !body || !module || !decision.getClientRects().length)return;
    // Header wrapping moves the drawer below its nominal rail-top. Budget from its real
    // viewport, keeping the module's foot/grip and padding outside the scrolling choice list.
    decision.style.removeProperty('max-height');
    const number=(el,key)=>parseFloat(getComputedStyle(el)[key])||0;
    const r=decision.getBoundingClientRect(),d=drawer.getBoundingClientRect(),b=body.getBoundingClientRect(),m=module.getBoundingClientRect();
    const bottom=Math.min(innerHeight,d.bottom)-number(drawer,'paddingBottom')-Math.max(0,m.bottom-b.bottom)-number(body,'paddingBottom');
    const room=bottom-(r.top+drawer.scrollTop);
    const explicit=module.classList.contains('has-height')?b.bottom-number(body,'paddingBottom')-r.top:Infinity;
    decision.style.maxHeight=`${Math.max(0,Math.floor(Math.min(room,explicit)))}px`;
  }
  function fitDecisionSlot(host) {
    const slot=host.querySelector('#cm-decision-slot:not([hidden])');if(!slot||phone())return;
    for(const key of ['width','max-width','left','transform','margin-left','margin-right'])slot.style.removeProperty(key);
    const panel=slot.getBoundingClientRect(),parent=slot.offsetParent||slot.parentElement,bounds=parent.getBoundingClientRect();
    const tabs=[...host.querySelectorAll(':scope>.cm-stage-left,:scope>.cm-stage-right')].filter(el=>getComputedStyle(el).visibility!=='hidden').map(el=>({left:el.classList.contains('cm-stage-left'),r:el.getBoundingClientRect()})).filter(x=>x.r.width&&x.r.height);
    const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    if(!tabs.some(x=>overlaps(panel,x.r)))return;
    const left=Math.max(bounds.left+8,...tabs.filter(x=>x.left).map(x=>x.r.right+8)),right=Math.min(bounds.right-8,...tabs.filter(x=>!x.left).map(x=>x.r.left-8));
    if(right<=left)return;
    const width=Math.min(panel.width,right-left),at=left+(right-left-width)/2-bounds.left-parent.clientLeft+parent.scrollLeft;
    slot.style.width=`${width}px`;slot.style.maxWidth=`${width}px`;
    if(getComputedStyle(slot).position==='sticky'){slot.style.marginLeft=`${at}px`;slot.style.marginRight='0px';}
    else{slot.style.left=`${at}px`;slot.style.transform='none';}
  }
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
    const rowKey = `${view?.matchId}:${view?.seat}`;
    const drawerPositions=host.dataset.rowScrollMatch===rowKey?[...host.querySelectorAll(':scope>.cm-stage-rail,:scope>.cm-stage-side')].map(el=>({id:el.id,view:host.dataset.view,top:el.scrollTop})):[];
    const main=host.querySelector('.cm-board-main'),focusPosition=main&&host.dataset.rowScrollMatch===rowKey?{seat:main.querySelector('.cm-board-stage>.cm-mat')?.dataset.seat,y:main.scrollTop}:null;
    if (host.dataset.rowScrollMatch !== rowKey) zonePositions.clear();
    else for (const el of host.querySelectorAll('[data-zone-scroll]')) zonePositions.set(`${host.dataset.view}:${el.dataset.zoneScroll}`, [el.scrollLeft,el.scrollTop]);
    C.keepFocus(host, () => paint(host));
    for(const saved of drawerPositions)if(saved.view===host.dataset.view){const drawer=document.getElementById(saved.id);if(drawer&&host.contains(drawer))drawer.scrollTop=saved.top;}
    const nextMain=host.querySelector('.cm-board-main');if(focusPosition&&nextMain?.querySelector('.cm-board-stage>.cm-mat')?.dataset.seat===focusPosition.seat)nextMain.scrollTop=focusPosition.y;
    host.dataset.rowScrollMatch = rowKey;
    for (const el of host.querySelectorAll('[data-zone-scroll]')) {const pos=zonePositions.get(`${host.dataset.view}:${el.dataset.zoneScroll}`);if(pos){el.scrollLeft=pos[0];el.scrollTop=pos[1];}}
    for (const el of host.querySelectorAll("[data-block-key]")) el.scrollLeft = blockPositions.get(el.dataset.blockKey) || 0;
    const options = host.querySelector("#cm-board-decision .cm-board-options");
    if (choiceScroll !== null && options) {
      options.scrollTop = choiceScroll;
      /* ...and the choice in hand stays whole in it, should the list come back shorter (a pick's Confirm row appearing). */
      const held = options.contains(document.activeElement) ? document.activeElement : null;
      if (held) {const r = held.getBoundingClientRect(), b = options.getBoundingClientRect(); if (r.bottom > b.bottom) options.scrollTop += r.bottom - b.bottom + 4; else if (r.top < b.top) options.scrollTop -= b.top - r.top + 4;}
    }
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
    host.classList.add('cm-study');
    applyHud(host);
    host.toggleAttribute("data-combat", combatAttacks().length > 0);
    if (phone()) {
      host.dataset.view = "focus";
      delete host.dataset.stage; delete host.dataset.shell; globalThis.CrankStage?.unmount();
      host.dataset.phone = innerHeight > innerWidth ? "portrait" : "landscape"; applyScales(host);
      host.innerHTML = `${phoneView()}${showHand()}${banner()}${inspector()}${cardMenuHtml()}`;
      placeCardMenu();
      fit();
      return;
    }
    delete host.dataset.phone;
    applyScales(host);
    host.dataset.view = mode;
    host.dataset.stage = hud() ? "on" : "off";
    host.dataset.coach = coach.open ? (moduleSide("coach") ? "module" : "open") : "shut";
    host.dataset["3d"] = stageEnabled() ? "on" : "off";
    /* The turn moved to another seat a moment ago: this paint's light arrives, crossfading (~600 ms). */
    if (performance.now() - turnLit < 900) host.dataset.turnChanged = "1"; else delete host.dataset.turnChanged;
    host.style.setProperty("--panel-w", `${panelWidth()}px`); setDrawerK(host, "panel", panelWidth());
    host.classList.remove("has-panel");
    host.dataset.shell="shared";
    host.style.setProperty("--stage-left-width", `${paneWidth()}px`); setDrawerK(host, "pane", paneWidth());
    host.dataset.inspecting = inspection && !deskInspection() ? "on" : "off";
    host.innerHTML = `${fullView()}${showHand()}${banner()}`;
    host.insertAdjacentHTML("beforeend", inspector() + cardMenuHtml());
    placeCardMenu();
    fit();
    chatToBottom();
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
      const header=host.querySelector(':scope>.cm-stage-top');
      if(header){const combat=header.querySelector('.cm-r4-combat')?.offsetHeight || 0;host.style.setProperty('--hud-top',`${Math.ceil(Math.max(28+30*hudScale()/100,header.offsetHeight-combat))}px`);}
      host.style.setProperty('--full-action-h',`${host.querySelector('.cm-stage-actions')?.offsetHeight || 0}px`);
      host.style.setProperty('--full-action-w',`${host.querySelector('.cm-stage-actions')?.offsetWidth || 0}px`);
      fitCardCaptions(host);
      /* The hand's tray as it would be at the table's card size (Tools): the room the boards leave it, whatever size the
         hand is now (Rob, 2026-10-09). A larger hand runs on below; a smaller one leaves the boards where they are. */
      const atTableSize = (el, measure) => {
        el.style.setProperty("--hand-scale", String(C.cardScale() / 100));
        try {return measure();} finally {el.style.removeProperty("--hand-scale");}
      };
      host.style.removeProperty("--peek-max");
      const tbl = host.querySelector(".cm-board-table:not(.cm-stage-flat)");
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
      if(tbl) {
        /* EX15: preserve the largest-fit widths and 5:7 cards. Where readable captions and two real
           card rows cannot fit a 16:9 mat, grow its row and scroll the outer Table viewport. */
        const n=Number(tbl.dataset.seats),box=tbl.getBoundingClientRect(),css=getComputedStyle(tbl),gy=parseFloat(css.rowGap)||22;
        const minimum=slot=>{const mat=slot.querySelector('.cm-mat');fitTableCardRange(mat);const m=zoneMetrics(mat);return Math.ceil(m.header+(m.fieldMin+m.landMin)*1.2+m.extra+4);};
        const slots=[...tbl.querySelectorAll(':scope>.cm-board-slot')];
        const topBase=parseFloat(tbl.style.getPropertyValue('--top-w'))*9/16,botBase=parseFloat(tbl.style.getPropertyValue('--bot-w'))*9/16;
        let top=Math.max(topBase,...slots.filter(s=>n===2||['a','b'].includes(s.dataset.area)).map(minimum));
        let bot=n===2?0:Math.max(botBase,...slots.filter(s=>['c','d'].includes(s.dataset.area)).map(minimum));
        if(top>topBase+1 || bot>botBase+1){
          /* Once zone minima force vertical scrolling, a height cap must not leave unused horizontal
             room and make readable seat headers unnecessarily tall. Keep the chosen column shares. */
          const gx=parseFloat(css.columnGap)||14,room=tbl.clientWidth-gx,share=rowShare();
          const left=Math.floor(n===2?room*share:room/2),right=Math.floor(n===2?room*(1-share):room/2);
          tbl.style.setProperty('--top-w',`${left}px`);tbl.style.setProperty('--bot-w',`${right}px`);tbl.style.setProperty('--board-w',`${Math.max(left,right)}px`);
          tbl.style.setProperty('--grid-w',`${left+right+gx}px`);tbl.style.setProperty('--mid-x',`${n===2?left+gx/2:tbl.clientWidth/2}px`);
          top=Math.max(left*9/16,...slots.filter(s=>n===2||['a','b'].includes(s.dataset.area)).map(minimum));
          bot=n===2?0:Math.max(right*9/16,...slots.filter(s=>['c','d'].includes(s.dataset.area)).map(minimum));
        }
        const height=top+bot+(n===2?0:gy),offset=Math.max(0,(box.height-height)/2);
        tbl.style.setProperty('--table-top-h',`${Math.ceil(top)}px`);tbl.style.setProperty('--table-bot-h',`${Math.ceil(bot)}px`);
        tbl.style.setProperty('--grid-h',`${Math.ceil(height)}px`);tbl.style.setProperty('--mid-y',`${offset+(n===2?top/2:top+gy/2)}px`);
        tbl.style.alignContent=height>box.height?'start':'center';
      }
      const stage = host.querySelector(".cm-board-stage");
      if (stage) {
        /* The mat: the largest 16:9 beside the pane with the hand's tray a full row beneath it, so the hand is whole
           (Rob, 2026-09-30, item 25; the mock's tray over the mat's foot cut the cards off). The tray's card follows the
           mat's width, so the two are settled together -- measured at a guess, then at the mat that leaves it room --
           and a last step makes sure the pair fits the window, since a narrower mat never needs a taller tray. */
        const main = stage.parentElement, box = main.getBoundingClientRect(), tray = main.querySelector(":scope > .cm-board-hand"), GAP = 8, stripH=main.querySelector('.cm-other-seats')?.offsetHeight || 0;
        main.style.setProperty('--seats-strip-h',`${stripH}px`);
        const widest = (trayH) => Math.max(320, Math.floor(Math.min(box.width - 16, (box.height - stripH - 8 - GAP - trayH) * 16 / 9)));
        /* the tray measured at the table's card size: the hand's own size never moves the mat (Rob, 2026-10-09) */
        const trayAt = (w) => {main.style.setProperty("--mat-w", `${w}px`); return tray ? atTableSize(main, () => tray.getBoundingClientRect().height) : 0;};
        let matW = widest(0);
        for (let k = 0; k < 4; k += 1) {const next = widest(trayAt(matW)); if (Math.abs(next - matW) < 1) break; matW = next;}
        
        const trayH = trayAt(matW);
        if (8 + stripH + matW * 9 / 16 + GAP + trayH > box.height) {matW = widest(trayH); trayAt(matW);}
        const mat=stage.querySelector(':scope>.cm-mat'),minimum=()=>{const m=zoneMetrics(mat);return Math.ceil(m.header+(m.fieldMin+m.landMin)*1.2+m.extra+4);};
        let matH=Math.max(matW*9/16,minimum());
        if(matH>matW*9/16+1){matW=Math.max(320,Math.floor(box.width-16));trayAt(matW);matH=Math.max(matW*9/16,minimum());}
        main.style.setProperty('--mat-h',`${Math.ceil(matH)}px`);
        main.style.setProperty("--mat-reserve", "0px");
        main.style.setProperty("--tray-top", `${Math.round(8 + stripH + matH + GAP)}px`);
        /* The card shown large under the pointer is never taller than the mat (Rob, 2026-10-11). */
        host.style.setProperty("--peek-max", `${Math.round(matH)}px`);
      }
      /* The 3D ground's horizon: a third of the way down the window (Rob: the mat bends two thirds to three quarters up). */
      const ground = host.querySelector(".cm-full-ground");
      if (ground) ground.style.setProperty("--horizon-px", `${Math.round(host.clientHeight * 0.3)}px`);
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
      fitPileCaptions(host);
      applySpacing(host);
      overlap(host);
      fitBoardZones(host);
      fitCardRows(host);
      fitZoneNavigation(host);
      fitCombatStrip(host);
      dock();
      if (tbl) sea(tbl); else stopSea();
      /* THE QUESTION HELD TO THE WINDOW in Table and Focus (ROB-26's blocking, Oct 20): it floats into a board that
         scrolls, so a long draft or an open "All block options" pushed No blocks and Confirm below the window. It is as
         tall as the window leaves below its top, and its middle scrolls (crankmagic-stage.css). Focus starts it lower
         than Table, so the room is measured, not assumed -- last, once everything above it has its size. */
      fitDecisionSlot(host);
      fitDrawerDecision(host);
      const ask = host.querySelector(".cm-board-main>.cm-board-ask, .cm-board-tabletop>.cm-board-ask");
      if (ask) ask.style.maxHeight = `${Math.max(160, Math.floor(innerHeight - ask.getBoundingClientRect().top - 12))}px`;
      placeCallouts();
      placePlays();
    } finally {fitting = false;}
  }
  /* The optional Coach uses the shared inspection space unless assigned to a drawer module. */
  function dock() {
    const el = document.getElementById("cm-board-coach"), side = document.querySelector("#cm-board .cm-full-side"), host = document.getElementById("cm-board");
    if (!el) return;
    const slot=host?.querySelector(".cm-module-coach-host");
    el.classList.toggle("is-module", !!slot && coach.open);
    el.classList.toggle("is-docked", !!host?.dataset.shell && !slot && coach.open);
    if(slot && coach.open) {if(el.parentElement!==slot)slot.append(el); for(const k of ["--dock-x","--dock-y","--dock-w","--dock-h"]) el.style.removeProperty(k); return;}
    if (host?.dataset.shell === "shared" && el.classList.contains("is-docked")) {
      const h = host.getBoundingClientRect(), top = host.querySelector(".cm-stage-top").getBoundingClientRect().bottom;
      const width = Math.min(320, Math.max(240, innerWidth * .24));
      el.style.setProperty("--dock-x", `${h.right - width}px`);
      el.style.setProperty("--dock-y", `${top}px`);
      el.style.setProperty("--dock-w", `${width}px`);
      el.style.setProperty("--dock-h", `${Math.max(120, h.bottom - top)}px`);
      return;
    }
    if (!side || !host || !el.classList.contains("is-docked")) {for (const k of ["--dock-x", "--dock-y", "--dock-w", "--dock-h"]) el.style.removeProperty(k); return;}
    const s = side.getBoundingClientRect(), h = host.getBoundingClientRect(), top = Math.round(s.bottom + 6);
    el.style.setProperty("--dock-x", `${Math.round(s.left)}px`);
    el.style.setProperty("--dock-y", `${top}px`);
    el.style.setProperty("--dock-w", `${Math.round(s.width)}px`);
    el.style.setProperty("--dock-h", `${Math.max(120, Math.round(h.bottom - 8 - top))}px`);
  }
  /* A ROW TOO FULL FOR ITS CARDS OVERLAPS THEM, each over the one before, using their unchanged slot widths and margins
     (EX17: tapping rotates in the same slot; Rob, 2026-10-11: five lands, "cards cutting off on the right side").
     No card is covered past a readable strip of it (READABLE of its width); past that the row scrolls, with a bar to
     scroll it by, rather than cutting its last cards off. */
  const READABLE = .3;
  function overlap(host) {
    for (const row of host.querySelectorAll(".cm-board-cards")) {
      row.style.removeProperty("--lap");
      row.classList.remove("is-scrolling");
      const kids = [...row.children];
      /* A side seat's rows wrap (Full screen's far sides): nothing to overlap. */
      if (row.hasAttribute("data-card-section") || kids.length < 2 || row.closest('.cm-mat[data-fit="side"]')) continue;
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
    host.style.setProperty('--board-scale-min',String(C.cardScaleRange()[0]/100));
    host.style.setProperty("--hand-scale", String(scaleOf("hand") / 100));
  }
  function setScale(scope, v, {live = false} = {}) {
    const n = inRange(v);
    if (scope === "hand") {clearTimeout(handKeep); handLive = live ? v : null;}
    if (!live) keep(SCALE_KEY[scope], n);
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
      const host = document.getElementById("cm-board");
      if (host) {host.style.setProperty("--stage-left-width", `${w}px`); setDrawerK(host, "pane", w);}
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
    if (host) {host.style.setProperty("--panel-w", `${w}px`); setDrawerK(host, "panel", w);}
    const body = document.querySelector("#cm-board .cm-board-body");
    if (body) body.style.setProperty("--panel-w", `${w}px`);
    const g = document.querySelector('#cm-board [data-drag="panelw"]');
    if (g) g.setAttribute("aria-valuenow", String(w));
    fit();
    return w;
  }
  function setModuleH(id, v) {
    const h = Math.min(MODH[1], Math.max(MODH[0], Math.round(v))), all = moduleHeights();
    all[id] = h; keep(MODH_KEY, JSON.stringify(all));
    for (const m of document.querySelectorAll(`#cm-board .cm-stage-module[data-module="${id}"]`)) {
      m.classList.add("has-height"); m.style.setProperty("--module-h", `${h}px`);
      m.querySelector('[data-drag="modh"]')?.setAttribute("aria-valuenow", String(h));
    }
    return h;
  }
  function clearModuleH(id) {
    const all = moduleHeights(); delete all[id]; keep(MODH_KEY, JSON.stringify(all));
    for (const m of document.querySelectorAll(`#cm-board .cm-stage-module[data-module="${id}"]`)) {m.classList.remove("has-height"); m.style.removeProperty("--module-h");}
  }
  function setDeskW(v) {
    const w = Math.min(DESK[1], Math.max(DESK[0], Math.round(v)));
    keep(DESK_KEY, w);
    for (const c of document.querySelectorAll("#cm-board .cm-action-card")) c.style.setProperty("--desk-card-w", `${w}px`);
    for (const g of document.querySelectorAll('#cm-board [data-drag="deskcard"]')) g.setAttribute("aria-valuenow", String(w));
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
  const shellHidden = new WeakMap();
  function shell(covered) {for (const q of SHELL) for (const el of document.querySelectorAll(q)) {
    el.inert = covered;
    if (covered) {if (!shellHidden.has(el)) shellHidden.set(el, el.getAttribute('aria-hidden')); el.setAttribute('aria-hidden', 'true');}
    else if (shellHidden.has(el)) {const was = shellHidden.get(el); if (was === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', was); shellHidden.delete(el);}
  }}

  /* ---- what the lobby hands over ---- */
  C.board = {
    /** The table is playing (or just finished): draw the board in the page, and keep the socket open. `asked` is
        when the page asked for this read of the table (performance.now()). */
    show(t, asked) {
      if (tableId !== t.tableId) {C.board.close(); tableId = t.tableId; view = null; focus = null; away.clear(); chatLog = []; chatDraft = "";}
      if (spectating !== (t.spectating === true)) {spectating = t.spectating === true; if (socket) {disconnect(); view = null;}}
      /* What the table has said so far: the last 50 come with the table; the room's chat frames add to them. */
      for (const m of t.chat || []) if (!chatLog.some((x) => x.id === m.id)) chatLog.push(m);
      chatLog.sort((a, b) => a.id - b.id);
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
        C.main.innerHTML = `<div class="cm-board" id="cm-board" data-view="${mode}"></div><div class="cm-board-callouts" id="cm-board-callouts" aria-hidden="true"></div><div class="cm-board-plays" id="cm-board-plays" aria-hidden="true"></div><aside class="cm-board-coach" id="cm-board-coach" aria-label="CrankMagic Coach" hidden></aside><p class="cm-sr-only" id="cm-board-said" role="status" aria-live="polite" aria-atomic="true"></p>`;
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
      if (tools) document.getElementById("cm-dialog")?.close();
      tools = false; confirmEnd = false; historyOpen = false; menuOpen = false; stepsOpen = false; alsoOpen = false; showing = null; held = null;
      coach.open = false; coach.asked += 1; coach.typing = false;
      calloutQueue = []; clearTimeout(calloutTimer); calloutTimer = null;
      gameChip();
    },
    /** A game of yours that is on: {tableId, turn}, or null. Play opens it. */
    live() {return tableId && view && view.status !== "finished" ? {tableId, turn: view.state.turn,
      seats: players().map((p,i) => ({seatId: view.seats[i]?.seatId || p.playerId, name:p.name,
        life:p.health?.life ?? null,
        commanders:[...new Set(["Command","Battlefield","Graveyard","Exile"].flatMap(z => p.zones[z]?.cards || []).filter(c=>c.commander && c.name).map(c=>c.name))]}))} : null;},
    /** The game the board holds, on or just over, for a report to name (Send feedback, CrankFeedback@1): the table, the match,
        the turn and step, your seat's name, the decision being asked, the last public history line and the board's view --
        never a card of anyone's hand -- or null. */
    held() {
      if (!(tableId && view && view.matchId)) return null;
      const stepName = (STEPS[stepAt(view.state.phase)] || [])[0], me = players()[view.seat] || {};
      return {tableId, matchId: view.matchId, turn: view.state.turn, over: view.status === "finished", step: stepName, seat: me.name,
        decisionId: view.decision ? view.decision.id : undefined, lastLine: ((view.history || []).at(-1) || {}).text, view: phone() ? "Phone" : (VIEWS.find(([k]) => k === mode) || [])[2]};
    },
    /** What a room view means for your record: {outcome, reason}, or null while the game goes on for you. */
    outcomeOf,
    /** The picture the board draws for a card by its name: the library's record, else the shipped card records'. */
    pictureOf,
    close() {
      resultEpoch += 1;
      attached = false;
      shell(false);
      if (audio) audio.stopBgm(400);
      disconnect(); globalThis.CrankStage?.unmount(); stopSea(); if (observer) {observer.disconnect(); observer = null;}
      document.getElementById("cm-game-on")?.remove();
      if (tools) document.getElementById("cm-dialog")?.close();
      inspection = null; inspectionFrom = null; stackSelected = null; tableId = null; view = null; table = null; tools = false; confirmEnd = false; selected = null; hover = null; showing = null; held = null;
      historyOpen = false; historyFilter = ""; menuOpen = false; stepsOpen = false; panelOpen = false; skipping = null; records = null;
      coachInput=null;coachGate={key:null,available:false};coach.open = false; coach.thread = []; coach.typing = false; coach.asked += 1; peek(null); leaveFullscreen();
    },
  };

  /* ---- actions ---- */
  const tableApi = () => C.tableApi;
  function option(index) {
    if (blocking()) return draftBlock(index);
    const d = view.decision;
    if (!d || sending) return;
    if (!d.options.some(o => o.index === index)) return;
    draftRevision = view.revision;
    targetReviewing=false;
    actionsShut = false; openModuleDrawer("actions"); alsoOpen = false;
    if (["one", "boolean", "index"].includes(d.mode)) {
      picked = [index];
      const o = d.options.find(o => o.index === index);
      if (d.kind === "priority") actionCard = o.cardId ?? null;
      if (!phone() && o.cardId !== undefined && findCard(o.cardId)?.name) inspection = {id:String(o.cardId),kind:"card",matchId:view.matchId,automatic:true};
      showing = null; held = null; peek(null); draw(); return;
    }
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
  /* A stack's click takes one, or puts back what was taken from it; its number sets how many. Each is picked as a single
     option is: one question's one, and in many, the room's exclusive options and its most. */
  function setSame(ids, want) {
    const d = view && view.decision;
    if (!d || sending || d.mode !== "many" || !ids.every((i) => d.options.some((o) => o.index === i))) return;
    draftRevision = view.revision;
    actionsShut = false; openModuleDrawer("actions"); alsoOpen = false;
    want = Math.max(0, Math.min(Math.floor(want) || 0, ids.length));
    let have = ids.filter((i) => picked.includes(i));
    while (have.length > want) {const i = have.pop(); picked = picked.filter((x) => x !== i);}
    for (const i of ids) {
      if (have.length >= want) break;
      if (picked.includes(i)) continue;
      const key = d.exclusiveBy && d.options[i][d.exclusiveBy];
      if (key !== undefined && key !== null) picked = picked.filter((x) => d.options[x][d.exclusiveBy] !== key);
      if (d.max === 1) picked = [];
      if (picked.length >= d.max) break;
      picked.push(i);
      have = ids.filter((x) => picked.includes(x));
    }
    draw();
  }
  actions["board-option-same"] = (el) => {
    const d = view && view.decision, ids = String(el.dataset.same).split(",").map(Number);
    if (!d) return;
    if (d.mode !== "many") return option(ids[0]);
    setSame(ids, ids.some((i) => picked.includes(i)) ? 0 : 1);
  };
  actions["board-combat-inspect"] = el => {
    const c = combatCard(Number(el.dataset.card));
    if (!c) return;
    const shown = {...c, name: c.faceDown ? null : c.name};
    C.modal(combatName(c), `<p>Object #${c.cardId}${c.power !== null && c.power !== undefined ? ` · ${e(c.power)}/${e(c.toughness)}` : ""}</p>
      <div class="cm-board-zoom">${card(shown, {where: "zoom", action: "close"})}</div><div class="cm-form-footer">${b("Close", "close", {}, true)}</div>`);
  };
  /* The first click is read-only, so a native second click never waits on a timer. */
  let firstCardClick = null,cardDoubleHandled=false;
  document.addEventListener("pointerdown",()=>{cardDoubleHandled=false;},true);
  function useCard(id) {
    if(!view?.decision || sending)return;
    const opts=optionsFor(id).filter(o=>!['undo-land','undo-play','undo-mana'].includes(o.act));
    if(opts.length===1)return option(opts[0].index);
    if(opts.length>1)return zoom(id);
  }
  actions["board-card"] = (el,event) => {
    if(!view)return;
    const id=Number(el.dataset.card),origin={id,revision:Number(el.dataset.cardRevision),choice:el.dataset.cardChoice,match:el.dataset.cardMatch};
    if(origin.revision!==view.revision || origin.choice!==(view.decision?.id || '') || origin.match!==view.matchId)return;
    if(event?.detail>=2) {
      cardDoubleHandled=true;closeCardMenu(false);
      if(!firstCardClick || Object.keys(origin).some(k=>origin[k]!==firstCardClick[k]))return;
      const members=String(el.dataset.landMembers || '').split(',').filter(Boolean).map(Number);
      const next=members.length?members.map(findCard).find(c=>c && !c.tapped):null;
      if(members.length && !next)return;
      const activeId=next?.cardId ?? id,c=findCard(activeId),opts=optionsFor(activeId);
      if(!c || sending)return;
      if(c.tapped) {const untap=opts.find(o=>o.act==='undo-mana');if(untap)return bindOffer(offerData(untap));}
      const mana=opts.filter(o=>o.act==='activate-mana');
      if(!c.tapped && mana.length===1)return bindOffer(offerData(mana[0]));
      return useCard(activeId);
    }
    firstCardClick=origin;
    openCardMenu(id,el,el,String(el.dataset.landMembers || '').split(',').filter(Boolean).map(Number));
  };
  actions["board-offered-undo"] = el => {
    if(!el?.dataset || !['undo-play','undo-land'].includes(el.dataset.act))return;
    bindOffer(el.dataset);
  };
  actions["board-choose"] = (el) => {alsoOpen = false; draw(); zoom(Number(el.dataset.card));};
  document.addEventListener('dblclick',event=>{
    if(cardDoubleHandled){cardDoubleHandled=false;return;}
    if(event.defaultPrevented || event.ctrlKey || event.metaKey || event.target.closest?.('.cm-bcard,button,a,input,select,textarea,[role=separator],#cm-card-menu'))return;
    const mat=event.target.closest?.('#cm-board .cm-mat[data-seat]');if(!mat || !view)return;
    const seat=Number(mat.dataset.seat);focus=seat;
    if(isYou(seat) && mode==='focus')focus=view.seat;
    if(mode==='table' && !phone())setMode('focus');else draw();
  });
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
  actions["board-zoom-open"] = (el) => inspect(el.dataset.card);
  actions["board-inspect"] = el => inspect(el.dataset.ref, el.dataset.kind || "card");
  actions["board-inspect-close"] = () => {inspection = null; draw(); C.focusFind(inspectionFrom)?.focus({preventScroll:true}); inspectionFrom = null;};
  actions['board-opening-hand'] = el => {
    const d = view?.decision, index = Number(el.dataset.index);
    if (!sending && /^mulligan:/.test(d?.id || '') && d.options.some(o => o.index === index)) send({indices:[index]});
  };
  actions["board-actions-open"] = () => {stageRail = true; actionsShut = false; draw(); document.querySelector("[data-action=board-actions-toggle]")?.focus({preventScroll:true});};
  actions["board-actions-toggle"] = () => {actionsShut = !actionsShut; draw();};
  actions["board-life-toggle"] = () => {lifeShut = !lifeShut; try {localStorage.setItem("cm-board-life-shut", lifeShut ? "1" : "0");} catch {/* page only */} draw(); document.querySelector("[data-action=board-life-toggle]")?.focus({preventScroll: true});};
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
  actions["board-mute"] = () => {const a = sound(); if (!a) return; a.setMuted(!a.volumes().muted); if (!a.volumes().muted && view) {const bed = CrankAudio.bedFor(view, view.seat); if (bed) a.startBgm(bed);} draw(); refreshSettings();};
  actions["board-skip"] = () => {
    if (!view || view.status === "finished") return;
    if (!isYou(view.state.turnPlayerId)) {
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
  actions["board-block-attacker"] = el => {const id=Number(el.dataset.attacker);if(!blocking() || !ownBlockAttacks().some(a=>a.attacker===id))return;blockAttacker=id;actionsShut=false;if(phone())stageRail=true;openModuleDrawer('actions');draw();};
  actions["board-block-attacker-none"] = el => {
    const id=Number(el.dataset.attacker);if(!blocking() || sending || !ownBlockAttacks().some(a=>a.attacker===id))return;
    picked=picked.filter(i=>view.decision.options.find(o=>o.index===i)?.attackerId!==id);blockSettled.add(id);blockResult=null;if(phone())stageRail=false;checkBlocks();draw();
  };
  actions["board-block-attacker-confirm"] = el => {const id=Number(el.dataset.attacker);if(!blocking() || sending || !ownBlockAttacks().some(a=>a.attacker===id))return;blockSettled.add(id);if(phone())stageRail=false;checkBlocks();draw();};
  actions["board-send-blockers"] = el => {if(Number(el?.dataset?.revision)===view?.revision && el.dataset.choice===view?.decision?.id && el.dataset.match===view?.matchId && canSendBlocks())actions["board-confirm"]();};
  actions["board-combat-scroll"] = el => {const row=document.querySelector('.cm-r4-combat .cm-combat-groups'),tile=row?.querySelector('.cm-combat-row');if(row&&tile)row.scrollBy({left:Number(el.dataset.by)*(tile.getBoundingClientRect().width+8),behavior:reduced()?'instant':'smooth'});};
  actions["board-block-select"] = el => {if (!blocking() || sending) return; blockSelected = Number(el.dataset.blockObject); draw();};
  actions["board-block-pair"] = el => draftBlock(Number(el.dataset.index));
  actions["board-block-none"] = () => {if (!blocking() || sending) return; picked = [];blockSettled.clear(); blockResult = null; checkBlocks(); draw();};
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
    if(targetChoice(d) && d.kind!=="priority" && !targetReviewing && !d.options.find(o=>o.index===picked[0])?.decline)return;
    if (["one","boolean","index"].includes(d.mode)) {
      if (draftRevision !== view.revision || picked.length !== 1 || !d.options.some(o => o.index === picked[0])) return;
      return send({indices:[...picked]});
    }
    if (blocking()) {
      if (!canSendBlocks()) return;
      blockResult = null; // A receipt alone must not reopen this already submitted draft.
      return send({indices: [...picked]});
    }
    if (d.mode === "ack") return send({indices: []});
    if (d.mode === "damage" || d.mode === "amount") return send({amounts: d.options.map((_, i) => Number(amounts[i]) || 0)});
    send({indices: picked});
  };
  actions["board-target-next"] = () => {
    const d=view?.decision;
    if(!d || sending || draftRevision!==view.revision || picked.length!==1 || !d.options.some(o=>o.index===picked[0]) || !targetChoice(d))return;
    targetReviewing=true;draw();
  };
  actions["board-direct"] = el => {
    const d=view?.decision,index=Number(el.dataset.index);
    if(!d || sending || Number(el.dataset.revision)!==view.revision || draftRevision!==view.revision || !d.options.some(o=>o.index===index))return;
    picked=[index];return actions["board-confirm"]();
  };
  actions["board-decline"] = el => {
    const d=view?.decision,o=d?.options.find(o=>o.index===Number(el.dataset.index));
    if(sending || !o?.decline || !(d.optional || o.optional))return;
    picked=[o.index];draftRevision=view.revision;return actions["board-confirm"]();
  };
  actions["board-draft-cancel"] = () => {if(sending || !picked.length)return;targetReviewing=false;picked=[];draftRevision=null;if(view?.decision?.kind==="priority")actionCard=null;draw();};
  actions["board-target-cycle"] = el => {const key=el.dataset.cycle;targetCycles.set(key,((targetCycles.get(key)||0)+1)%Number(el.dataset.count));draw();document.querySelector(`[data-cycle="${CSS.escape(key)}"]`)?.focus({preventScroll:true});};
  actions["board-target-page"] = el => {targetPage=Math.max(0,targetPage+Number(el.dataset.by));draw();};
  actions["board-reset"] = () => {targetReviewing=false;picked = []; draftRevision = null; draw();};
  actions["board-action-all"] = () => {actionCard = null; picked = []; draftRevision = null; draw();};
  actions["board-focus"] = (el) => {focus = Number(el.dataset.seat); if (mode === "table" && !phone()) setMode("focus"); else draw();};
  actions["board-rotate"] = (el) => {
    const n = players().length;
    if (!n) return;
    focus = ((focus ?? view.seat) + Number(el.dataset.by) + n) % n;
    draw();
  };

  function selectStack(id, fromPile=false) {
    const entries=view ? stackEntries() : [], section=document.querySelector('.cm-module-stack');
    if(!section || !entries.some(x=>x.key===id)) return;
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
    const entries=view ? stackEntries() : [];if(entries.length<2)return;
    const index=Math.max(0,entries.findIndex(x=>x.key===stackSelected));
    selectStack(entries[(index+1)%entries.length].key,true);
  };
  actions["board-hand-cycle"] = (el) => cycleHand(Number(el.dataset.seat), Number(el.dataset.by));
  function cycleHand(seat, direction) {
    const p=players().find(x=>x.playerId===seat), n=p?.zones.Hand.count || 0;
    if(n>7) {
      handStarts.set(seat,((handStarts.get(seat)||0)+direction+n)%n);draw();
      if(!globalThis.CrankMotion?.reduced()) document.querySelector(".cm-stage-fan-cards")?.animate([{transform:`translateX(${direction*28}px)`,opacity:.75},{transform:"translateX(0)",opacity:1}],{duration:180,easing:"ease-out"});
    }
  }
  document.addEventListener("change", event => {
    const el=event.target.closest?.("[data-stage-style]");if(!el)return;
    const key=el.dataset.stageStyle, list=key==="background"?CrankStage.appearances.backgrounds:CrankStage.appearances.tables;
    if(list.some(x=>x.id===el.value)){appearance[key]=el.value;keep(`cm-stage-${key}`,el.value);draw();}
  });
  actions["board-stage-side"] = () => {stageSide = !stageSide; if (stageSide) chatUnread = 0; if (phone() && stageSide) stageRail = false; draw();};
  let modulePress = null;
  document.addEventListener('pointerdown', event => {
    const header = event.target.closest?.('.cm-stage-module>header');
    modulePress = header ? {header,x:event.clientX,y:event.clientY,moved:false} : null;
    if(tableMenuOpen && !event.target.closest?.('.cm-table-menu,#cm-dialog')) {
      tableMenuOpen=false;document.getElementById('cm-table-menu')?.remove();
      document.querySelector('[data-action=board-table-menu]')?.setAttribute('aria-expanded','false');
    }
  }, true);
  document.addEventListener('pointermove', event => {if(modulePress && Math.hypot(event.clientX-modulePress.x,event.clientY-modulePress.y)>4)modulePress.moved=true;},true);
  document.addEventListener('click', event => {
    if(modulePress?.moved && event.target.closest?.('.cm-stage-module>header')===modulePress.header) {event.preventDefault();event.stopImmediatePropagation();}
    modulePress=null;
  },true);
  actions['board-module-toggle'] = el => {
    const id = el.dataset.module; if (id === 'actions') actionsShut = !actionsShut;
    else if (foldedModules.has(id)) foldedModules.delete(id); else foldedModules.add(id);
    draw();
  };
  document.addEventListener('keydown', event => {
    if (!event.target.matches?.('.cm-stage-module>header[data-action=board-module-toggle]') || !['Enter',' '].includes(event.key)) return;
    event.preventDefault(); actions['board-module-toggle'](event.target);
  });
  actions['board-table-menu'] = el => {tableMenuOpen = !tableMenuOpen; cameraOpen = false; confirmEnd = false; opened(el,tableMenuOpen); draw();};
  actions['board-table-rules'] = () => {tableMenuOpen = false; C.modal('Table rules', `<p>${e(table?.rules?.name || 'Commander')}</p>${b('Close','close')}`); draw();};
  actions['board-leave-page'] = () => {C.board.close(); C.go('game');};
  actions["board-profile"] = el => {tools=false;if(C.accountMenuOpen?.())C.closeAccountMenu?.();else C.openAccountMenu?.(el);};
  actions["board-modules-settings"] = moduleSettings;
  C.sideDrawerSettings = moduleSettings;
  actions["board-modules-save"] = async () => {
    const dialog=document.getElementById("cm-drawer-settings");if(!dialog)return;
    const chosen=new Map(PANE_MODULES.map(([id])=>[id,id==='actions'?'left':dialog.querySelector(`input[name="module-${id}"]:checked`)?.value || "none"]));
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
  /* Whole battlefield cards form rows instead of disappearing under their neighbors. A partial next
     row is a quiet cue to scroll; it is only reserved when a whole row fits above it. */
  function fitCardRows(host) {
    for(const field of host.querySelectorAll('.cm-board-field')) field.style.removeProperty('height');
    for(const section of host.querySelectorAll('[data-card-section]')) {
      section.style.removeProperty('height');
      const cards=[...section.children];if(!cards.length)continue;
      const width=Math.max(...cards.map(c=>c.offsetWidth)), height=Math.max(...cards.map(c=>c.offsetHeight));
      // Tapping rotates within the same slot; corners may tuck under adjacent cards.
      const cellWidth=Math.ceil(width),cellHeight=Math.ceil(height);
      section.style.setProperty('--zone-cell-width',`${cellWidth}px`);
      section.style.setProperty('--zone-pitch',`${Math.max(cellWidth*.3,cellWidth+width*Math.min(0,spacing())/100)}px`);
      section.style.setProperty('--zone-cell-height',`${cellHeight}px`);
      const viewport=section.closest('.cm-board-field') || section;
      const inset=viewport===section ? 4 : section.offsetTop+4;
      const available=viewport.clientHeight, gap=Math.max(0,width*spacing()/100), peek=Math.max(10,Math.round(cellHeight*.16));
      const rows=Math.floor((available-inset-peek)/(cellHeight+gap));
      const columns=Math.max(1,Math.floor((section.clientWidth-8+gap)/(cellWidth+gap)));
      if(rows>=1 && cards.length>rows*columns && (!section.closest('.cm-board-field') || section.parentElement===viewport.firstElementChild)) viewport.style.height=`${inset+rows*(cellHeight+gap)+peek}px`;
    }
  }
  function fitCombatStrip(host=document) {
    const strip=host.querySelector('.cm-r4-combat'),row=strip?.querySelector('.cm-combat-groups');if(!row)return;
    const left=row.scrollLeft>1,right=row.scrollLeft+row.clientWidth<row.scrollWidth-2;
    strip.querySelector('[data-by="-1"]').hidden=!left;strip.querySelector('[data-by="1"]').hidden=!right;
    const r=row.getBoundingClientRect(),hidden=[...row.children].filter(el=>el.getBoundingClientRect().right>r.right+1).length,more=strip.querySelector('[data-combat-more]');
    if(more){more.hidden=!hidden;more.textContent=`+${hidden} more`;}
  }
  document.addEventListener('scroll',event=>{if(event.target.matches?.('.cm-r4-combat .cm-combat-groups'))fitCombatStrip(document);},true);
  document.addEventListener('keydown',event=>{
    if(!event.target.matches?.('.cm-r4-combat .cm-combat-groups') || !['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();actions['board-combat-scroll']({dataset:{by:event.key==='ArrowRight'?'1':'-1'}});
  });
  function lightCombat(id,on) {for(const el of document.querySelectorAll(`#cm-board .cm-mat .cm-bcard[data-card="${id}"]`))el.classList.toggle('is-lit',on);}
  for(const [kind,on] of [['pointerover',true],['pointerout',false],['focusin',true],['focusout',false]])document.addEventListener(kind,event=>{
    const el=event.target.closest?.('[data-combat-light]');if(!el || el.contains(event.relatedTarget))return;lightCombat(el.dataset.combatLight,on);
  });
  function fitZoneNavigation(host) {
    for(const el of host.querySelectorAll('[data-zone-scroll]')) {delete el.dataset.zoneScroll;el.removeAttribute('tabindex');el.removeAttribute('role');el.removeAttribute('aria-label');}
    for(const section of host.querySelectorAll('[data-card-section]')) {
      const parent=section.parentElement;
      const field=section.closest('.cm-board-field');
      const candidates=field?[field]:[section,parent];
      const el=candidates.find(e=>e.scrollWidth>e.clientWidth+1&&/auto|scroll/.test(getComputedStyle(e).overflowX)) || candidates.find(e=>e.scrollHeight>e.clientHeight+1&&/auto|scroll/.test(getComputedStyle(e).overflowY));
      if(!el)continue;
      el.dataset.zoneScroll=field?`${section.dataset.cardSection.split(':')[0]}:battlefield`:section.dataset.cardSection;el.tabIndex=0;el.setAttribute('role','region');
      const [seat,area]=el.dataset.zoneScroll.split(':');
      el.setAttribute('aria-label',`${nameOf(Number(seat))}: ${area==='others'?'other permanents':area}; scroll to explore`);
    }
  }
  let arranging=null;
  document.addEventListener('wheel', event => {
    const row=event.target.closest?.('[data-zone-scroll]');
    if(event.defaultPrevented||!row||event.ctrlKey||event.metaKey)return;
    const horizontal=row.scrollWidth>row.clientWidth+1 && (event.shiftKey || Math.abs(event.deltaX)>Math.abs(event.deltaY) || row.scrollHeight<=row.clientHeight+1);
    const unit=event.deltaMode===1?16:event.deltaMode===2?(horizontal?row.clientWidth:row.clientHeight):1;
    // Chain vertical wheel input to the phone frame when this zone cannot move farther.
    const phone=row.closest('.cm-phone-battlefield');
    if(phone && !horizontal && ((event.deltaY>0 && row.scrollTop>=row.scrollHeight-row.clientHeight-1) || (event.deltaY<0 && row.scrollTop<=0))){event.preventDefault();phone.scrollTop+=event.deltaY*unit;peek(null);return;}
    if(row.scrollWidth<=row.clientWidth+1 && row.scrollHeight<=row.clientHeight+1)return;
    event.preventDefault();
    if(horizontal) {
      row.scrollLeft += (event.deltaX || event.deltaY) * unit;
    }
    else row.scrollTop+=event.deltaY*unit;
    peek(null);
  }, {passive:false});
  document.addEventListener('keydown',event=>{
    const row=event.target.matches?.('[data-zone-scroll]')?event.target:null;
    if(!row||event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))return;
    event.preventDefault();const horizontal=row.scrollWidth>row.clientWidth+1 && (['ArrowLeft','ArrowRight'].includes(event.key) || row.scrollHeight<=row.clientHeight+1),prop=horizontal?'scrollLeft':'scrollTop',page=horizontal?row.clientWidth:row.clientHeight;
    if(event.key==='Home')row[prop]=0;
    else if(event.key==='End')row[prop]=horizontal?row.scrollWidth:row.scrollHeight;
    else row[prop]+=(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)?-1:1)*(event.key.startsWith('Page')?page*.85:48);
    peek(null);
  });
  document.addEventListener('pointerdown',event=>{
    const row=event.target.closest?.('[data-zone-scroll]');
    // Touch keeps native scrolling; card drags keep their separate arrange/action behavior.
    if(!row||event.button!==0||event.pointerType==='touch'||event.target.closest('button,a,input,select,textarea,[role=button]'))return;
    event.preventDefault();peek(null);row.focus({preventScroll:true});row.setPointerCapture(event.pointerId);
    const box=row.getBoundingClientRect(),start={x:event.clientX,y:event.clientY,left:row.scrollLeft,top:row.scrollTop};
    row.classList.add('is-zone-dragging');
    const move=next=>{if(next.pointerId!==event.pointerId)return;row.scrollLeft=start.left-(next.clientX-start.x)*row.offsetWidth/box.width;row.scrollTop=start.top-(next.clientY-start.y)*row.offsetHeight/box.height;};
    const end=next=>{if(next.pointerId!==event.pointerId)return;row.classList.remove('is-zone-dragging');row.removeEventListener('pointermove',move);row.removeEventListener('pointerup',end);row.removeEventListener('pointercancel',end);row.removeEventListener('lostpointercapture',end);if(row.hasPointerCapture(next.pointerId))row.releasePointerCapture(next.pointerId);};
    row.addEventListener('pointermove',move);row.addEventListener('pointerup',end);row.addEventListener('pointercancel',end);row.addEventListener('lostpointercapture',end);
  });
  const clearCardDrop=()=>document.querySelectorAll('.cm-card-drop').forEach(el=>el.classList.remove('cm-card-drop'));
  document.addEventListener('dragstart',event=>{
    const card=event.target.closest?.('[data-arrange-card]'),section=card?.closest('[data-card-section]');if(!section)return;
    arranging={id:card.dataset.card,section:section.dataset.cardSection};event.dataTransfer.setData('application/x-crankmagic-card',JSON.stringify(arranging));event.dataTransfer.effectAllowed='move';peek(null);
  });
  document.addEventListener('dragover',event=>{
    const section=event.target.closest?.('[data-card-section]');clearCardDrop();
    const row=arranging && section?.dataset.cardSection!==arranging.section?rowUnder(event,arranging):null;
    if(!arranging || (section?.dataset.cardSection!==arranging.section && (!row || row.name===arranging.section)))return;
    event.preventDefault();event.dataTransfer.dropEffect='move';event.target.closest?.('[data-arrange-card]')?.classList.add('cm-card-drop');
  });
  document.addEventListener('drop',event=>{
    const section=event.target.closest?.('[data-card-section]');clearCardDrop();
    if(!arranging)return;
    const target=event.target.closest?.('[data-arrange-card]'),box=target?.getBoundingClientRect();
    if(section?.dataset.cardSection!==arranging.section){
      const row=rowUnder(event,arranging);if(!row || row.name===arranging.section)return;
      event.preventDefault();moveToRow(arranging.id,row,target?.dataset.card,box ? event.clientX>box.left+box.width/2 : false);arranging=null;return;
    }
    event.preventDefault();
    reorderCard(section,arranging.id,target?.dataset.card,box ? event.clientX>box.left+box.width/2 : false);arranging=null;
  });
  document.addEventListener('dragend',()=>{arranging=null;clearCardDrop();});
  document.addEventListener('keydown',event=>{
    const card=event.target.closest?.('[data-arrange-card]');if(!card || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || !['ArrowLeft','ArrowRight'].includes(event.key))return;   /* Shift + Alt: Alt + Left alone is the browser's Back (Rob, 2026-10-27) */
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
  actions["board-stage-rail"] = () => {stageRail = !stageRail; if (phone() && stageRail) stageSide = false; draw();};
  actions["board-camera"] = () => {cameraOpen = !cameraOpen; tableMenuOpen = false; draw();};
  /* CAMERA ▾ CLOSES ON A PRESS ANYWHERE OUTSIDE IT (Rob, 2026-10-25), as Profile and History do. Taken out where it is,
     not by a redraw, so the press still reaches what it was on; caught on the way down, so a card's own handler that
     stops the press does not keep it open. */
  document.addEventListener("pointerdown", (event) => {
    if (!cameraOpen || !document.getElementById("cm-board") || document.querySelector("#cm-dialog[open]")) return;
    if (event.target?.closest?.(".cm-stage-camera")) return;
    cameraOpen = false;
    for (const menu of document.querySelectorAll("#cm-board .cm-stage-camera>div")) menu.remove();
    for (const button of document.querySelectorAll("#cm-board [data-action=board-camera]")) button.setAttribute("aria-expanded", "false");
  }, true);
  /* Empty table ground adjusts tilt only. Card, hand, module and scroll gestures keep their own handlers. */
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.target.matches?.('.cm-stage-canvas, .cm-stage-region'))return;
    const region=event.target.closest('.cm-stage-region'),host=region.closest('.cm-board');
    const start={y:event.clientY,tilt:camera.tilt};
    region.setPointerCapture(event.pointerId);
    const move=next=>{
      if(next.pointerId!==event.pointerId)return;
      camera.tilt=Math.max(0,Math.min(TILT_MAX,start.tilt-(next.clientY-start.y)*.4));
      fitStage(host);
      const slider=host.querySelector('[data-stage-camera="tilt"]');if(slider){slider.value=Math.round(camera.tilt);slider.nextElementSibling.textContent=`${Math.round(camera.tilt)}°`;}
    };
    const end=next=>{
      if(next.pointerId!==event.pointerId)return;
      region.removeEventListener('pointermove',move);region.removeEventListener('pointerup',end);region.removeEventListener('pointercancel',end);
      keep(TILT_KEY,String(Math.round(camera.tilt)));
    };
    region.addEventListener('pointermove',move);region.addEventListener('pointerup',end);region.addEventListener('pointercancel',end);
  });
  document.addEventListener("input", (event) => {
    const el = event.target.closest?.("[data-stage-camera]"); if (!el) return;
    const key = el.dataset.stageCamera; camera[key] = Number(el.value);
    el.parentElement.querySelector("output").textContent = `${el.value}${key === "tilt" ? "°" : "%"}`;
    fit();
  });
  document.addEventListener("change", (event) => {
    const el = event.target.closest?.("[data-stage-camera]"); if (el) keep(el.dataset.stageCamera === "tilt" ? TILT_KEY : el.dataset.stageCamera === "cards" ? "cm-stage-card-size-v2" : "cm-board-zoom-v2", el.value);
  });
  document.addEventListener("visibilitychange", () => {if (attached && view && !document.hidden) fit();});
  /* THE 3D CAMERA BY HAND (Rob, 2026-10-25). The wheel zooms; a mat dragged moves the view across the table ("Keep [tilt]
     as is for when clicking empty table, and implement this left-drag pan the camera function when left clicking on the
     mat"); a right button held looks at a place (CrankStage.look, the head look). Cards, rows that scroll and the
     overlays keep their own gestures. Every motion moves the one camera (CrankStage.geometry), so the cards stay on the
     table. */
  const HOLD_MS = 200;
  const OVERLAYS = ".cm-stage-camera, .cm-board-ask, .cm-stage-actions, #cm-card-menu, input, select, textarea";
  let lastPress = null, hold = null, zoomKeep = null;
  document.addEventListener("pointerdown", (event) => {lastPress = {at: performance.now(), button: event.button, type: event.pointerType};}, true);
  /* Plane pixels moved, the view kept over the table. */
  function panBy(dx, dy) {
    const r = document.querySelector("#cm-board .cm-stage-region")?.getBoundingClientRect(), w = (r?.width || 0) / 2, h = (r?.height || 0) * .44;
    camera.pan = {x: Math.max(-w, Math.min(w, camera.pan.x + dx)), y: Math.max(-h, Math.min(h + (stageGeom?.reach || 0), camera.pan.y + dy))};
  }
  /* The wheel zooms toward the place under the pointer, the Camera's Zoom slider following and the zoom kept on this
     device as the slider keeps it. Over a row of cards that scrolls the wheel scrolls it, as it did (R3); with ⌘ or Ctrl
     (a trackpad's pinch arrives as one) it zooms there too. ⌘/Ctrl + and − still size the cards. */
  document.addEventListener("wheel", (event) => {
    const region = event.target.closest?.("#cm-board .cm-stage-region");
    if (event.defaultPrevented || !region || !view || !hud() || !globalThis.CrankStage || event.target.closest(OVERLAYS)) return;
    if (event.target.closest("[data-zone-scroll]") && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const host = region.closest("#cm-board"), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? region.clientHeight : 1;
    const next = Math.max(60, Math.min(CAMERA_MAX, camera.zoom * Math.exp(-(event.deltaY || event.deltaX) * unit * .0015)));
    if (next === camera.zoom) return;
    const before = CrankStage.pick(event.clientX, event.clientY);
    camera.zoom = next; fitStage(host);
    const after = before && CrankStage.pick(event.clientX, event.clientY);
    if (after) {panBy(before.world[0] - after.world[0], after.world[2] - before.world[2]); fitStage(host);}
    const slider = host.querySelector('[data-stage-camera="zoom"]');
    if (slider) {slider.value = Math.round(camera.zoom); slider.parentElement.querySelector("output").textContent = `${Math.round(camera.zoom)}%`;}
    clearTimeout(zoomKeep); zoomKeep = setTimeout(() => keep("cm-board-zoom-v2", String(Math.round(camera.zoom))), 250);
  }, {passive: false});
  /* A mat dragged with the left button moves the view across the table: the place taken hold of stays under the pointer.
     Empty table still tilts (above); a card, a button or a row that scrolls keeps its own drag. */
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch" || !view || !hud() || !globalThis.CrankStage) return;
    const mat = event.target.closest?.("#cm-board .cm-stage-region .cm-mat");
    /* a bar between a mat's rows (the land and the battlefield) is dragged on its own: it resizes them, and the table stays */
    if (!mat || event.target.closest(`.cm-bcard, button, a, [role=button], [data-zone-scroll], [data-drag], [draggable=true], ${OVERLAYS}`)) return;
    event.preventDefault();
    const region = mat.closest(".cm-stage-region"), host = region.closest("#cm-board"), start = {x: event.clientX, y: event.clientY};
    let grab = null;
    const move = (next) => {
      if (next.pointerId !== event.pointerId) return;
      if (!grab) {
        if (Math.hypot(next.clientX - start.x, next.clientY - start.y) < 4) return;
        grab = CrankStage.pick(start.x, start.y); if (!grab) return;
        host.querySelector(".cm-stage-region")?.classList.add("is-panning");
      }
      const under = CrankStage.pick(next.clientX, next.clientY); if (!under) return;
      panBy(grab.world[0] - under.world[0], under.world[2] - grab.world[2]); fitStage(host);
    };
    const end = (next) => {
      if (next.pointerId !== event.pointerId) return;
      host.querySelector(".cm-stage-region")?.classList.remove("is-panning");
      removeEventListener("pointermove", move); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
    };
    addEventListener("pointermove", move); addEventListener("pointerup", end); addEventListener("pointercancel", end);
  });
  /* A right press on the 3D table: let go before HOLD_MS, it is a click (a card's menu); held, the camera looks at the place
     under the pointer -- on a card, a mat or the bare table -- until it is let go, and then looks back. Moved while held,
     the head turns after the pointer. */
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 2 || event.pointerType === "touch" || !view || !stageEnabled() || !globalThis.CrankStage) return;
    if (!event.target.closest?.("#cm-board .cm-stage-region") || event.target.closest(OVERLAYS)) return;
    if (hold) clearTimeout(hold.timer);
    const el = event.target.closest(".cm-bcard[data-card]");
    const h = hold = {id: event.pointerId, card: el ? Number(el.dataset.card) : null, el, x: event.clientX, y: event.clientY, looking: false};
    /* Let go anywhere, even outside the window, and the camera still looks back. */
    try {document.documentElement.setPointerCapture(event.pointerId);} catch {/* the release still arrives inside the window */}
    h.timer = setTimeout(() => {if (hold !== h) return; h.looking = true; peek(null); closeCardMenu(false); CrankStage.look(h.x, h.y);}, HOLD_MS);
  });
  /* Before the look starts, the place it will look at follows the pointer; once it looks, the pointer turns the head: by
     how far, and which way, it has gone from the place held (CrankStage.steer). */
  addEventListener("pointermove", (event) => {
    if (!hold || event.pointerId !== hold.id) return;
    if (!hold.looking) {hold.x = event.clientX; hold.y = event.clientY;}
    else globalThis.CrankStage?.steer?.(event.clientX - hold.x, event.clientY - hold.y);
  });
  function letGo(event) {
    if (!hold || (event.pointerId !== undefined && event.pointerId !== hold.id) || (event.type === "pointerup" && event.button !== 2)) return;
    const h = hold; hold = null; clearTimeout(h.timer);
    if (h.looking) globalThis.CrankStage?.unlook();
    else if (h.card !== null && event.type === "pointerup" && view) {lastPress = {at: performance.now(), button: 2, type: "mouse"}; openCardMenu(h.card, {x: event.clientX, y: event.clientY}, h.el);}
  }
  addEventListener("pointerup", letGo); addEventListener("pointercancel", letGo); addEventListener("blur", () => letGo({type: "blur"}));
  actions["board-camera-center"] = () => {camera.pan = {x: 0, y: 0}; fit();};
  /* RESET (Rob, 2026-10-26: "a basic, 'reset' text hyperlinked that when clicked resets all of the camera settings to
     default", beside View seats, for the old ⌖ icon): tilt, zoom and the view's place, the card and hand sizes, the
     table's length, the card spacing and HUD text all go back to their defaults, and this device forgets them. The view (Table, Focus, 3D)
     and the appearance are choices, not camera settings, and stay. */
  actions["board-camera-reset"] = () => {
    for (const k of [TILT_KEY, "cm-board-tilt-v2", "cm-board-zoom-v2", "cm-stage-card-size-v2", REACH_KEY, SCALE_KEY.board, SCALE_KEY.hand, HUD_KEY, "cm-board-spacing"]) {try {localStorage.removeItem(k);} catch {/* nothing kept */}}
    Object.assign(camera, {tilt: TILT_DEFAULT, zoom: 100, cards: 100, pan: {x: 0, y: 0}, reach: 0}); hudPreview = null; handLive = null; spacingPreview = null;
    const host = document.getElementById("cm-board"); applyScales(host); applyHud(host); applySpacing(host); draw();
  };
  /* THE TABLE BY ITS CORNER (Rob, 2026-10-26: "grab the corner of the table and drag it out to increase it's size
     (maintaining aspect ratio)"): a corner dragged away from the opposite one zooms the table while that opposite corner
     stays where it is, so the table grows toward the pointer. One zoom for both axes keeps its proportions; the Camera's
     Zoom follows and is kept on this device, as the wheel's is. */
  document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest?.("#cm-board .cm-stage-corner");
    if (!handle || event.button !== 0 || !view || !stageEnabled() || !globalThis.CrankStage || !stageGeom) return;
    event.preventDefault(); event.stopPropagation();
    const region = handle.closest(".cm-stage-region"), host = region.closest("#cm-board"), box = region.getBoundingClientRect(), q = stageGeom.quad;
    const o = (Number(handle.dataset.corner) + 2) % 4, mx = (q[0] + q[2] + q[4] + q[6]) / 4, my = (q[1] + q[3] + q[5] + q[7]) / 4;
    const anchor = {x: box.left + q[o * 2] + (mx - q[o * 2]) * .03, y: box.top + q[o * 2 + 1] + (my - q[o * 2 + 1]) * .03};
    const grab = CrankStage.pick(anchor.x, anchor.y), d0 = Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y) || 1, z0 = camera.zoom;
    region.classList.add("is-resizing");
    const move = (next) => {
      if (next.pointerId !== event.pointerId) return;
      const z = Math.max(60, Math.min(CAMERA_MAX, z0 * Math.hypot(next.clientX - anchor.x, next.clientY - anchor.y) / d0));
      if (Math.abs(z - camera.zoom) < .05) return;
      camera.zoom = z; fitStage(host);
      const after = grab && CrankStage.pick(anchor.x, anchor.y);
      if (after) {panBy(grab.world[0] - after.world[0], after.world[2] - grab.world[2]); fitStage(host);}
      const slider = host.querySelector('[data-stage-camera="zoom"]');
      if (slider) {slider.value = Math.round(camera.zoom); slider.parentElement.querySelector("output").textContent = `${Math.round(camera.zoom)}%`;}
    };
    const end = (next) => {
      if (next.pointerId !== event.pointerId) return;
      region.classList.remove("is-resizing");
      removeEventListener("pointermove", move); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
      keep("cm-board-zoom-v2", String(Math.round(camera.zoom)));
    };
    addEventListener("pointermove", move); addEventListener("pointerup", end); addEventListener("pointercancel", end);
  }, true);

  /* THE CARD'S MENU (Rob, 2026-10-25: "always show as little text instruction as possible, always deferring to visual
     symbols, colors, indicators and short-hand ... But always enough that the basics, e.g. source/cause > action >
     target/effect objects and events are clear and card references always have a very quick path to viewing and reading
     the card"). Its first line is the card -- 🔍 and its name, which opens it to read -- and under it each thing the table
     offers for it now (optionsFor: the room's offers, never one of the board's), as a glyph and the fewest words: ⤓ Play,
     ✦ Cast, ↷ and the mana, ⚡ an ability, ↶ Untap, ↩ To hand, ⚔ an attack, then the way (→ its target, ↷ what pays).
     The whole sentence is its accessible name and its tooltip. A row stages the choice as a click on the card does;
     nothing is sent until Confirm. Drawn with the board, so the rows are always the current offers. A menu: arrows move,
     Escape or Tab closes it, back to the card. */
  let cardMenu = null;
  const MENU = {"undo-play":["↶","Undo"],"play-land": ["⤓", "Play"], cast: ["✦", "Cast"], "activate-mana": ["↷", "Tap for mana"], activate: ["⚡", "Activate"], "undo-mana": ["↶", "Untap"],
    "undo-land": ["↩", "To hand"], "turn-face-up": ["◐", "Face up"], suspend: ["⏳", "Suspend"], "resolve-all": ["⏩", "All"]};
  const menuGlyph = () => {const id = String(view.decision?.id || ""); return id.startsWith("declare-attackers") ? "⚔" : id.startsWith("declare-blockers") || blocking() ? "🛡" : "•";};
  const symbols = (text) => e(text).replace(/\{[^}]+\}/g, (m) => C.mana(m));
  function menuRow(o, c) {
    const [glyph, verb] = MENU[o.act] || [menuGlyph(), ""], undo = ["undo-mana","undo-land","undo-play"].includes(o.act);
    const label = !undo && o.label && o.label !== c.name ? (c.name && o.label.startsWith(c.name) ? o.label.slice(c.name.length).trim() : o.label) : "";
    const detail = undo || !o.detail ? "" : o.detail.replace(/^tapping /, "↷ ").replace(/ · tapping /g, " · ↷ ").replace(o.lean || "\u0000", "").trim();
    const words = [verb && `<b>${e(verb)}</b>`, label && symbols(label), detail && `<small>${symbols(detail)}</small>`].filter(Boolean).join(" ") || (o.act === "activate-mana" ? "<b>mana</b>" : "");
    const lean = o.lean ? ` <span class="cm-lean${o.lean.startsWith("helps") ? " is-helps" : " is-against"}">⚠ ${e(o.lean)}</span>` : "";
    return `<button type="button" role="menuitem" class="cm-card-menu-do" data-action="board-card-menu-do" ${offerAttrs(o)} aria-label="${e(sayFor(o))}" title="${e(sayFor(o))}"${sending ? " disabled" : ""}><i aria-hidden="true">${glyph}</i><span>${words}${lean}</span></button>`;
  }
  function cardMenuHtml() {
    if (!cardMenu || !view) return "";
    const c = findCard(cardMenu.id) || shownCard(cardMenu.id), opts = optionsFor(cardMenu.id);
    if (!c || (!c.name && !opts.length)) {cardMenu = null; return "";}
    const members=(cardMenu.members || []).map(id=>findCard(id)).filter(Boolean),entries=members.length>1?members:[c];
    const named = c.name || "A face-down card", n = entries.reduce((n,c)=>n+optionsFor(c.cardId).length,0);
    const rows=entries.map((member,i)=>`${entries.length>1?`<p class="cm-card-menu-copy">Copy ${i+1}${member.tapped?' · tapped':''}</p>`:''}${optionsFor(member.cardId).map(o=>menuRow(o,member)).join('')}`).join('');
    return `<div id="cm-card-menu" class="cm-card-menu" role="menu" aria-label="${e(named)}: ${n ? `${n} ${n === 1 ? "action" : "actions"}` : "no actions now"}" style="left:${cardMenu.x}px;top:${cardMenu.y}px">
      ${c.name ? `<button type="button" role="menuitem" class="cm-card-menu-card" data-action="board-card-menu-view" data-card="${c.cardId}" aria-label="Read ${e(c.name)}" title="Read ${e(c.name)}"><img class="cm-card-menu-art" src="${e(pictureOf(c.name))}" alt=""><i aria-hidden="true">🔍</i><span>${e(c.name)}</span></button>` : `<span class="cm-card-menu-card" role="none"><i aria-hidden="true">◐</i><span>${e(named)}</span></span>`}
      ${n ? rows : `<p class="cm-card-menu-none" role="none"><i aria-hidden="true">∅</i> ${e(c.why || "No actions now")}</p>`}</div>`;
  }
  /* Kept inside the window, measured once it is drawn. */
  function placeCardMenu() {
    const m = document.getElementById("cm-card-menu");
    if (!m || !cardMenu) return;
    const r = m.getBoundingClientRect(),anchor=cardMenu.anchor;
    let x=cardMenu.x,y=cardMenu.y;
    if(anchor && x+r.width>innerWidth-8) {
      if(anchor.left-r.width-4>=8)x=anchor.left-r.width-4;
      else {x=anchor.left;y=anchor.bottom+4+r.height<=innerHeight-8?anchor.bottom+4:anchor.top-r.height-4;}
    }
    x=Math.max(8,Math.min(x,innerWidth-r.width-8));y=Math.max(8,Math.min(y,innerHeight-r.height-8));
    if (x !== cardMenu.x || y !== cardMenu.y) {cardMenu.x = x; cardMenu.y = y; m.style.left = `${x}px`; m.style.top = `${y}px`;}
  }
  /* Opened at the pointer, or beside the card (the keyboard's way), with the focus on its first offer; closed, the focus
     goes back to the card. */
  function openCardMenu(id, at, el = at instanceof Element ? at : null,members=[]) {
    if (!view || !document.getElementById("cm-board")) return;
    const box = at instanceof Element ? at.getBoundingClientRect() : null;
    cardMenu = {id,members, x: Math.round(box ? box.right + 4 : at.x), y: Math.round(box ? box.top : at.y), from: el?.isConnected ? C.focusKey(el) : null,anchor:box?{left:box.left,right:box.right,top:box.top,bottom:box.bottom}:null};
    peek(null);
    /* The card is shown in Actions as well as in its menu (Rob, 2026-10-27): the same offers, and pressing either one settles both. */
    if (view.decision?.kind === "priority" && !sending && optionsFor(id).length && actionsBodyOf()) {
      actionCard = id; picked = []; draftRevision = view.revision; targetReviewing = false; alsoOpen = false;
      if (!phone() && findCard(id)?.name) inspection = {id:String(id),kind:"card",matchId:view.matchId,automatic:true};
      refreshActions();   /* only the Actions body: the card just clicked stays the node it was, for the second click of a double click */
    }
    document.getElementById('cm-card-menu')?.remove();
    document.getElementById('cm-board').insertAdjacentHTML('beforeend',cardMenuHtml());placeCardMenu();
    const m = document.getElementById("cm-card-menu");
    if (!m) return;
    (m.querySelector(".cm-card-menu-do:not([disabled])") || m.querySelector("[role=menuitem]"))?.focus({preventScroll: true});
    say(m.getAttribute("aria-label"));
  }
  /* The Actions module's body, where it is drawn open; its contents redrawn alone, not the board. */
  const actionsBodyOf = () => document.querySelector('.cm-stage-module[data-module="actions"]>.cm-module-body:not([hidden])');
  function refreshActions() {
    const body = actionsBodyOf();
    if (body) body.innerHTML = decision() || `<p class="cm-muted">${e(waitingText() || "Choose a card or continue your turn.")}</p>`;
  }
  function closeCardMenu(back = true) {
    if (!cardMenu) return;
    const from = cardMenu.from;
    cardMenu = null; document.getElementById("cm-card-menu")?.remove();
    if (back) C.focusFind(from)?.focus({preventScroll: true});
  }
  actions["board-card-menu-do"] = el => {
    const o=currentOffer(el.dataset);if(!o)return;
    closeCardMenu(true);
    if(['undo-mana','undo-land','undo-play'].includes(o.act))return bindOffer(el.dataset);
    /* STANDING RULE (Rob, 2026-10-27): where two clicks already stand between the player and the action -- the card, then its row --
       there is no third step to confirm. A row that asks nothing more is sent; one that needs a target is staged in Actions for it. */
    /* Only an offer of priority: the picks of a many-of question (discard some, sacrifice some) are toggled here, and sent by its own Confirm. */
    if(view.decision?.kind==="priority" && selfOnly(o))return commitOffer(o);
    option(o.index);
  };
  function commitOffer(o) {
    const d = view?.decision;
    if (!d || sending || !d.options.some((x) => x.index === o.index)) return;
    picked = [o.index]; draftRevision = view.revision; actionCard = null; targetReviewing = false;
    return actions["board-confirm"]();
  }
  actions["board-card-menu-view"] = (el) => {const id = el.dataset.card; closeCardMenu(true); inspect(id);};
  /* A press anywhere outside it puts it away, and still reaches what it was on. */
  document.addEventListener("pointerdown", (event) => {if (cardMenu && !event.target.closest?.("#cm-card-menu")) closeCardMenu(false);}, true);
  document.addEventListener("keydown", (event) => {
    const m = document.getElementById("cm-card-menu");
    if (!m) {
      const el = event.target.closest?.("#cm-board .cm-bcard[data-card]");
      if (el && view && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {event.preventDefault(); openCardMenu(Number(el.dataset.card), el);}
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {event.preventDefault(); event.stopImmediatePropagation(); closeCardMenu(true); if (actionCard !== null && !picked.length) {actionCard = null; draftRevision = null; refreshActions();} return;}
    const items = [...m.querySelectorAll("[role=menuitem]:not([disabled])")], i = items.indexOf(document.activeElement);
    if (!items.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus({preventScroll: true});
  }, true);

  /* THE WHEEL OVER YOUR HAND SIZES ITS CARDS (Rob, 2026-10-25: "When cursor is over cards in players hand and they
     scroll, the hand card's size should increase or decrease."). Over your own hand -- 3D's fan, the tray in Table and
     Focus, the phone's hand -- the wheel up grows its cards and down shrinks them, continuously, through Hand cards: the
     one value its sliders show (the tray's, Camera's ✋), which follow at once; kept on this device once the wheel has
     stopped a moment. It is heard first, in the capture, and 3D's zoom and a row's scroll leave a wheel it has taken.
     Sideways -- Shift with the wheel, or a trackpad's sideways swipe -- still scrolls a hand too wide for its place (3D's
     fan, which shows seven at a time, turns to the next ones); ⌘/Ctrl with the wheel keeps its meaning. */
  const OWN_HAND = ".cm-stage-fan:not(.is-backs), .cm-board-hand:not(.is-backs) .cm-board-hand-cards, .cm-board[data-phone] .cm-hand-show:not(.is-held) .cm-hand-fan";
  let fanTurn = 0;
  document.addEventListener("wheel", (event) => {
    if (!view || event.ctrlKey || event.metaKey) return;
    const own = event.target.closest?.(OWN_HAND);
    if (!own || !own.closest("#cm-board")) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      if (!own.matches(".cm-stage-fan")) return;   /* the browser scrolls a tray or a phone's hand that overflows */
      const n = players()[view.seat]?.zones.Hand.count || 0;
      if (n <= 7) return;
      event.preventDefault();
      fanTurn += (event.deltaX || event.deltaY) * unit;
      if (Math.abs(fanTurn) >= 50) {const by = Math.sign(fanTurn); fanTurn = 0; cycleHand(view.seat, by);}
      return;
    }
    if (!event.deltaY) return;
    event.preventDefault();
    const [lo, hi] = C.cardScaleRange(), from = handLive ?? scaleOf("hand");
    const next = Math.max(lo, Math.min(hi, from * Math.exp(-event.deltaY * unit * .001)));
    if (next === from) return;
    setScale("hand", next, {live: true});
    handKeep = setTimeout(() => {if (handLive === null) return; keep(SCALE_KEY.hand, inRange(handLive)); handLive = null;}, 300);
  }, {capture: true, passive: false});

  /* YOUR SIDE OF THE TABLE, LENGTHENED (Rob, 2026-10-25: "Player can expand the table (and their mat size automatically
     in proportion) by ctrl-left-click, hold and pull or push (move cursor up or down), to increase / decrease the length
     of the table on their side. They can do this all the way down, underneath the hand's cards, to the padding at the
     screen edge."). In 3D, Ctrl (or ⌘) and the left button pressed anywhere on the table -- the bare table, a mat, or a
     card on it: with Ctrl held it is the table that is taken, never the card, so the press plays, picks and drags
     nothing -- then dragged down lengthens your side toward you, up shortens it, by as much table as the pointer crosses.
     Your mat grows with it, its zones and cards in proportion; the seats across the table keep their size and the camera
     stays. From the length it always had to the screen's foot (CrankStage.geometry); kept on this device when let go;
     Ctrl/⌘ + double-click on the table, or ↕ in Camera at 100%, puts it back. While Ctrl/⌘ is held the pointer over the
     table is ↕. The hand's fan, Camera, the question and the card's menu keep their own. */
  const setStretch = (state) => {const host = document.getElementById("cm-board"); if (!host || (host.dataset.stretch || null) === state) return; if (state) host.dataset.stretch = state; else delete host.dataset.stretch;};
  const ctrlHeld = (event) => {if (!stretch) setStretch((event.ctrlKey || event.metaKey) && view && stageEnabled() ? "ready" : null);};
  for (const type of ["keydown", "keyup"]) addEventListener(type, (event) => {if (/^(Control|Meta)$/.test(event.key)) ctrlHeld(event);}, true);
  addEventListener("pointermove", ctrlHeld, true);   /* Ctrl pressed or let go while the window was elsewhere */
  addEventListener("blur", () => {if (!stretch) setStretch(null);});
  const stretchable = (event) => event.button === 0 && (event.ctrlKey || event.metaKey) && event.pointerType !== "touch" && view && stageEnabled() && globalThis.CrankStage
    && event.target.closest?.("#cm-board .cm-stage-region") && !event.target.closest(OVERLAYS);
  document.addEventListener("pointerdown", (event) => {
    if (!stretchable(event)) return;
    const from = CrankStage.pick(event.clientX, event.clientY), g = stageGeom;
    if (!from || !g) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const host = document.getElementById("cm-board"), start = {x: event.clientX, y: event.clientY, reach: g.reach / g.base};
    const s = stretch = {id: event.pointerId, moved: false};
    const move = (next) => {
      if (next.pointerId !== s.id) return;
      if (!s.moved) {if (Math.hypot(next.clientX - start.x, next.clientY - start.y) < 4) return; s.moved = true; setStretch("on"); peek(null);}
      const at = CrankStage.pick(next.clientX, next.clientY), most = stageGeom.reachMost / stageGeom.base;
      camera.reach = Math.max(0, Math.min(most, at ? start.reach + (at.y - from.y) / g.base : next.clientY > start.y ? most : camera.reach));
      fitStage(host);
    };
    const end = (next) => {
      if (next.pointerId !== s.id) return;
      removeEventListener("pointermove", move, true); removeEventListener("pointerup", end, true); removeEventListener("pointercancel", end, true);
      stretch = null; setStretch(null); ctrlHeld(next);
      /* The press was the table's, not what it was on: its click goes nowhere. */
      const swallow = (c) => {c.preventDefault(); c.stopImmediatePropagation();};
      addEventListener("click", swallow, {capture: true, once: true}); setTimeout(() => removeEventListener("click", swallow, {capture: true}), 250);
      if (!s.moved) return;
      keep(REACH_KEY, camera.reach.toFixed(4));
      fitStage(host);   /* and the table is built again at its new length */
    };
    addEventListener("pointermove", move, true); addEventListener("pointerup", end, true); addEventListener("pointercancel", end, true);
  }, true);
  /* nor a card's drag, nor the browser's menu (a Mac's Ctrl + click) */
  document.addEventListener("dragstart", (event) => {if (stretch) event.preventDefault();}, true);
  document.addEventListener("contextmenu", (event) => {if (stretch) {event.preventDefault(); event.stopImmediatePropagation();}}, true);
  document.addEventListener("dblclick", (event) => {
    if (!stretchable(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    camera.reach = 0; keep(REACH_KEY, "0"); fit();
  }, true);
  /* CARD SIZE BY ALT + DRAG (Rob, 2026-10-27: "Alt+left-click+drag up/down to zoom card size in/out on the area that's clicked ... drag up on
     the battlefield, the card size increases. I do the same down on Lands and the same occurs."). Held over a mat, anywhere on it -- the
     battlefield, the lands, a card -- Alt + the left button dragged up grows the cards, down shrinks them, as Camera's Cards slider does in
     3D and Board cards does in Table and Focus (the one size each view keeps; 3D draws it larger or smaller on every mat). Kept as the
     sliders keep it; the press is the size's, so nothing is played, picked or dragged by it. */
  let sizing = null;
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.pointerType === "touch" || !view) return;
    if (!event.target.closest?.("#cm-board .cm-mat") || event.target.closest(OVERLAYS)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const flat = !hud(), host = document.getElementById("cm-board"), from = flat ? scaleOf("board") : camera.cards, y0 = event.clientY;
    const s = sizing = {id: event.pointerId, moved: false};
    const move = (next) => {
      if (next.pointerId !== s.id) return;
      if (!s.moved) {if (Math.abs(next.clientY - y0) < 3) return; s.moved = true; host.dataset.cardsize = "on"; peek(null);}
      const to = from * Math.exp((y0 - next.clientY) / 250);
      if (flat) {setScale("board", to); return;}
      camera.cards = Math.round(Math.max(70, Math.min(CAMERA_MAX, to)));
      const slider = host.querySelector('[data-stage-camera="cards"]');
      if (slider) {slider.value = camera.cards; slider.parentElement.querySelector("output").textContent = `${camera.cards}%`;}
      fit();
    };
    const end = (next) => {
      if (next.pointerId !== s.id) return;
      removeEventListener("pointermove", move, true); removeEventListener("pointerup", end, true); removeEventListener("pointercancel", end, true);
      sizing = null; delete host.dataset.cardsize;
      const swallow = (c) => {c.preventDefault(); c.stopImmediatePropagation();};
      addEventListener("click", swallow, {capture: true, once: true}); setTimeout(() => removeEventListener("click", swallow, {capture: true}), 250);
      if (!s.moved) return;
      if (!flat) keep("cm-stage-card-size-v2", String(camera.cards));
    };
    addEventListener("pointermove", move, true); addEventListener("pointerup", end, true); addEventListener("pointercancel", end, true);
  }, true);
  document.addEventListener("dragstart", (event) => {if (sizing) event.preventDefault();}, true);
  /* ↕ in Camera: the same length, from the keyboard too; built again when it is let go. */
  document.addEventListener("input", (event) => {
    const el = event.target.closest?.("#cm-board [data-stage-length]"); if (!el) return;
    camera.reach = Math.max(0, (Number(el.value) - 100) / 100); stretch = stretch || {slider: true}; fitStage(document.getElementById("cm-board"));
  });
  document.addEventListener("change", (event) => {
    const el = event.target.closest?.("#cm-board [data-stage-length]"); if (!el) return;
    if (stretch?.slider) stretch = null;
    keep(REACH_KEY, camera.reach.toFixed(4)); fitStage(document.getElementById("cm-board"));
  });
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
  /* 3D is a game view, independent of browser full-screen. */
  function setMode(next) {
    if (!VIEWS.some(([k]) => k === next)) return;
    mode = next; cameraOpen = false; profileOpen = false; tools = false; confirmEnd = false; menuOpen = false; stepsOpen = false; historyOpen = false;
    /* Full screen opens on your own board (its point is your playable space); ⟳ walks round from there. */
    if (view) focus = mode === "full" ? view.seat : (focus ?? view.seat);
    try {localStorage.setItem(VIEW_KEY, mode);} catch {}
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
  actions["board-zoom-do"] = (el) => {
    if (el.dataset.match !== view?.matchId || el.dataset.choice !== view?.decision?.id || Number(el.dataset.revision) !== view?.revision) {
      C.notice("The game changed. Review the current choices in Actions."); openModuleDrawer("actions"); draw(); return;
    }
    option(Number(el.dataset.index));
  };
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
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !document.getElementById("cm-control-peek")) return;
    // Dismiss the topmost explanation first. Closing a drawer in the same keypress redraws
    // the ghost under the stationary pointer and immediately opens its tooltip again.
    controlPeek(null); event.preventDefault(); event.stopImmediatePropagation();
  });
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
    /* A card, or an option that names one (data-peek-card: "Interplanar Beacon" in a cost's question), pops it up. */
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card], #cm-board [data-peek-card]");
    if (!el || el.closest(".cm-board-peek, .cm-full-pick, .cm-panel-card, #cm-card-inspector")) return;
    if (el.dataset.peekCard !== undefined) {if (!showing && peekId !== Number(el.dataset.peekCard)) peek(el); return;}
    const id = Number(el.dataset.card); if (id !== hover) {hover = id; drawPick();}
    if (!showing) peek(el);
  });
  document.addEventListener("focusin", event => {
    const el = event.target.closest?.("#cm-board .cm-bcard[data-card], #cm-board [data-peek-card]");
    if (el && !showing && !el.closest("#cm-card-inspector, .cm-board-peek")) peek(el);
  });
  document.addEventListener("focusout", event => {if (event.target.closest?.("#cm-board .cm-bcard[data-card], #cm-board [data-peek-card]")) peek(null);});
  /* The Lands group's open or shut, kept for its question as the board redraws (toggle does not bubble: caught going down). */
  document.addEventListener("toggle", (event) => {const el = event.target; if (el.matches?.(".cm-board-lands-group")) landsOpen = el.open ? el.dataset.landsFor : null;}, true);
  document.addEventListener("pointerout", (event) => {
    const named = event.target.closest?.("#cm-board [data-peek-card]");
    if (named && !named.contains(event.relatedTarget)) {peek(null); return;}
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (!el) return;
    if (hover !== null) {hover = null; drawPick();}
    peek(null);
  });
  /* A RIGHT CLICK ON A CARD SHOWS WHAT IT CAN DO (Rob, 2026-10-25), in every view: the card's menu (cardMenuHtml). The
     browser's own menu never opens on the 3D table, where a held right button looks (the head look) and the card's menu
     opens when a quick press is let go. The Menu key and Shift+F10 open it on the card with the focus; a touch's long
     press still reads the card (below). */
  document.addEventListener("contextmenu", (event) => {
    if (!view || !document.getElementById("cm-board")) return;
    if(event.target.closest?.('#cm-card-menu')){event.preventDefault();return;}
    if (hold) {event.preventDefault(); return;}   /* a right press on the 3D table, answered when it is let go */
    const el = event.target.closest?.(".cm-board .cm-bcard[data-card]"), stage = hud() && event.target.closest?.("#cm-board .cm-stage-region");
    const table = stage && !event.target.closest(OVERLAYS);
    if (!el && !stage) return;
    event.preventDefault();
    const recent = lastPress && performance.now() - lastPress.at < 900 ? lastPress : null, right = recent?.button === 2;
    if (!el || (recent && recent.type !== "mouse")) return;
    if (table && (hold || right)) return;
    peek(null); openCardMenu(Number(el.dataset.card), right ? {x: event.clientX, y: event.clientY} : el, el);
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
  let press = null, inspectedPress = 0;
  document.addEventListener("click", event => {
    // A touch long-press may be followed by a synthetic click after the inspector redraw.
    // Consume that release; it is inspection, never a cast on the card now underneath it.
    if (inspectedPress && performance.now() - inspectedPress < 900 && event.detail > 0) {
      inspectedPress = 0; event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (!el || !view) return;
    const at = [event.clientX, event.clientY];
    press = {at, timer: setTimeout(() => {press = null; inspectedPress = performance.now(); inspect(el.dataset.card);}, 500)};
  });
  const unpress = (event) => {if (press && (event.type !== "pointermove" || Math.hypot(event.clientX - press.at[0], event.clientY - press.at[1]) > 10)) {clearTimeout(press.timer); press = null;}};
  for (const type of ["pointerup", "pointercancel", "pointermove"]) document.addEventListener(type, unpress);

  /* THE BOARD'S KEYS, only while it is on the page and no dialog is open: Space (show hand, when nothing that
     Space would press has the focus), 1–9 (hold that card), Enter (do the held card's first thing), Escape
     (back a step: held, fanned, a menu, the panel, full screen), ⌘/Ctrl + and − (card size). */
  document.addEventListener("keydown", (event) => {
    if(document.getElementById('cm-card-menu'))return;
    if(C.accountMenuOpen?.() || document.querySelector('#cm-user-menu:popover-open'))return;
    if (event.key === "Escape" && peekId !== null && !showing) {peek(null); return;}
    if (event.key === "Escape" && stackShown !== null) stackPeek(null);
    /* ⌘/Ctrl + and − still size the cards with the Settings window open, as its card-size line says. */
    const sizing = (event.ctrlKey || event.metaKey) && ["+", "=", "-", "_"].includes(event.key);
    if (!document.getElementById("cm-board") || !view || (document.querySelector("#cm-dialog[open]") && !(tools && sizing))) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag);
    if (event.key === "Escape" && showing) {
      if (showing === "held") actions["board-hand-back"](); else actions["board-hand-close"]();
      return;
    }
    /* A menu closed by Escape gives the focus back to the button that opened it, if the focus was on the board. */
    if (event.key === "Escape" && (historyOpen || menuOpen || stepsOpen || tools || alsoOpen || profileOpen || tableMenuOpen)) {
      const a = document.activeElement, back = !a || a === document.body || a.closest("#cm-board") ? popupFrom : null;
      const nested = profileOpen && (historyOpen || menuOpen || tools);
      tableMenuOpen = false; profileOpen = nested; historyOpen = false; menuOpen = false; stepsOpen = false; tools = false; alsoOpen = false; confirmEnd = false; popupFrom = nested ? C.focusKey(document.querySelector("#cm-board [data-action=board-profile]")) : null; draw();
      const el = C.focusFind(back);
      if (el && el.isConnected) el.focus({preventScroll: true});
      return;
    }
    if (event.key === "Escape" && cameraOpen) {cameraOpen=false; draw(); document.querySelector("[data-action=board-camera]")?.focus(); return;}
    if (event.key === "Escape" && picked.length && !blocking()) {event.preventDefault();actions["board-reset"]();return;}
    if (event.key === "Escape" && inspection) {event.preventDefault(); actions["board-inspect-close"](); return;}
    if (coach.open && event.target && event.target.matches && event.target.matches(".cm-coach-input") && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); event.target.form.requestSubmit(); return;
    }
    if (event.key === "Escape" && coach.open) {actions["board-coach"](); return;}
    if (sizing) {
      event.preventDefault();
      const n = C.setCardScale(C.cardScale() + (event.key === "-" || event.key === "_" ? -10 : 10));
      document.dispatchEvent(new CustomEvent("cm-card-scale", {detail: {scale: n, live: false}}));
      const slider = document.querySelector("#cm-board-tools [data-card-scale]"), out = slider?.parentElement.querySelector("output");
      if (slider) {slider.value = String(n); slider.setAttribute("aria-valuetext", `${n}%`);}
      if (out) out.textContent = `${n}%`;
      fit();
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
      if (focus !== view.seat) {focus = view.seat; draw(); return;}
      tableMenuOpen = true; draw(); document.querySelector('[data-action=board-table-menu]')?.focus(); return;
    }
  });
  actions["board-tools"] = () => openSettings();
  actions["board-coach"] = el => {
    const leaving=el?.closest?.('#cm-board-tools')?settingsExit:null;
    profileOpen=false;coach.open=!coach.open;tools=false;historyOpen=false;
    const request=coachFocusRequest=coach.open?{key:coachKey(),matchId:view?.matchId,armed:false,from:null}:null;
    if(coach.open){if(!moduleSide("coach"))inspection=null;panelOpen=false;openModuleDrawer("coach");if(phone()){stageSide=true;stageRail=false;}}
    draw();drawCoach();
    if(request){const arm=()=>{if(coachFocusRequest!==request)return;const a=document.activeElement;if(leaving&&a&&a!==document.body&&!a.matches('#cm-board [data-action=board-camera]')){coachFocusRequest=null;return;}request.from=C.focusKey(a);request.armed=true;focusRequestedCoach(document.getElementById('cm-board-coach'));};if(leaving&&!leaving.closed)leaving.afterClose=arm;else arm();}
  };
  document.addEventListener('pointerdown',event=>{if(coachFocusRequest?.armed&&!event.target.closest?.('#cm-board-coach'))coachFocusRequest=null;},true);
  document.addEventListener('keydown',event=>{if(coachFocusRequest?.armed&&!['Shift','Control','Alt','Meta'].includes(event.key))coachFocusRequest=null;},true);
  actions["board-recommend"] = () => {coach.open=true;if (!moduleSide("coach")) inspection = null;openModuleDrawer("coach");if(phone()){stageSide=true;stageRail=false;}draw();drawCoach();ask_("What are my best actions right now?");};
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
  actions["board-coach-clear"] = (el) => {
    const more=el?.closest?.('.cm-coach-more'),returnFocus=more?.contains(document.activeElement);
    coach.thread=[];coach.typing=false;coach.asked+=1;if(more)more.open=false;drawCoach();
    if(returnFocus)document.querySelector('#cm-board-coach .cm-coach-more>summary')?.focus({preventScroll:true});
  };
  document.addEventListener("submit", (event) => {
    if (!event.target.matches || !event.target.matches("[data-coach-form]")) return;
    event.preventDefault();
    const input = event.target.querySelector(".cm-coach-input"), q = input?.value;
    if(!canAsk(q))return;
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
  actions["board-history"] = (el) => {const from=el?.closest?.('#cm-table-menu')?document.querySelector('[data-action=board-table-menu]'):el;historyOpen = !historyOpen; tableMenuOpen=false;profileOpen=false; tools = false; menuOpen = false; stepsOpen = false; opened(from, historyOpen); draw(); if (historyOpen) document.querySelector("#cm-board-history .cm-history-filter")?.focus();};
  actions["board-end"] = async (el) => {
    if (el.dataset.confirm !== "1") {confirmEnd = true; draw(); refreshSettings(); return;}
    confirmEnd = false; tools = false; tableMenuOpen = false;
    await tableApi().api("POST", `${tableApi().tableUrl(tableId)}/end`);
    draw();   /* the room's own view, ended, follows on the socket */
  };
  actions["board-record"] = async () => {
    const {record} = await tableApi().api("GET", `${tableApi().tableUrl(tableId)}/record?match=${encodeURIComponent(view.matchId)}`);
    C.download(`CrankMagic-${record.matchId}-${record.kind === "full" ? "full-record" : "your-record"}.json`, JSON.stringify(record, null, 2));
    /* A download changes nothing in the library, so it offers no Undo (the result filed a moment ago is not this). */
    C.notice(record.kind === "full" ? "The full record is downloaded: its seed and decision tape play the game again." : "Your record is downloaded: your seat's view and the table's history.", false, {undo: false});
  };
  actions["board-end-cancel"] = () => {confirmEnd = false; draw(); refreshSettings();};
  actions["board-concede"] = async (el) => {
    if (el?.dataset.confirm !== '1') {C.modal('Concede this game?', `<p>Your seat concedes this game.</p><div class="cm-actions">${b('Cancel','close')}${b('Concede','board-concede',{confirm:'1'},true)}</div>`); return;}
    actions.close(); tools = false; tableMenuOpen = false; await tableApi().api('POST', `${tableApi().tableUrl(tableId)}/concede`); draw();
  };
  actions["board-rematch"] = (el) => answerRematch(el.dataset.accept === "yes");
  actions["board-leave"] = async () => {const id = tableId; C.board.close(); await tableApi().refresh(id);};
  /* Play mat (Settings): seen at once; Save sends it to the table. */
  document.addEventListener("change", (event) => {
    if (!event.target?.matches?.("#cm-board-tools [data-board-mat]") || !view) return;
    matPreview = event.target.value; draw();
  });
  /* Hold priority after I cast (Tools): kept on this device, and the Tools' words follow it. */
  document.addEventListener("change", (event) => {
    if (!event.target || !event.target.matches || !event.target.matches("#cm-board-tools [data-board-hold]")) return;
    keep(HOLD_KEY, event.target.checked ? "on" : "off");
    draw();
  });
  /* Skip my priority if no response possible: kept on this device, and told to the room at once (prefer). */
  document.addEventListener("change", (event) => {
    if (!event.target || !event.target.matches || !event.target.matches("#cm-board-tools [data-board-skip-empty]")) return;
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
    const same = event.target && event.target.dataset && event.target.dataset.boardSame;
    if (same === undefined || !view || !view.decision) return;
    setSame(String(same).split(",").map(Number), Number(event.target.value));
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
    handLive = null; clearTimeout(handKeep);
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
    const vol = event.target.closest && event.target.closest("#cm-board-tools [data-board-sound]");
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
    if(kind==='zones') {const grid=el.closest('.cm-mat-grid');drag={kind,seat:Number(el.dataset.zoneSeat),grid,y:zonePoint(grid,event.clientX,event.clientY),from:parseFloat(grid.style.getPropertyValue('--field-px')),total:Number(grid.dataset.zoneTotal)};}
    else if (kind === "pane") drag = {kind, x: event.clientX, from: paneWidth()};
    else if (kind === "panelw") drag = {kind, x: event.clientX, from: panelWidth()};
    /* A module's height from the height it shows now; the card's size by the height dragged (a card is 7 tall for 5 wide). */
    else if (kind === "modh") {const body = el.closest(".cm-stage-module")?.querySelector(":scope>.cm-module-body"); drag = {kind, y: event.clientY, id: el.dataset.moduleId, from: body ? body.getBoundingClientRect().height : moduleH(el.dataset.moduleId) || 200};}
    else if (kind === "deskcard") {const c = el.parentElement?.previousElementSibling; drag = {kind, y: event.clientY, from: c?.matches(".cm-action-card") ? Math.min(deskW(), c.getBoundingClientRect().height * 5 / 7) : deskW()};}
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
    if(drag.kind==='zones'){const at=zonePoint(drag.grid,event.clientX,event.clientY);if(at!==null&&drag.y!==null)setZones(drag.seat,drag.from+at-drag.y,drag.total,{save:false});return;}
    if (drag.kind === "pane") {setPane(drag.from + event.clientX - drag.x); return;}
    if (drag.kind === "panelw") {setPanelW(drag.from - (event.clientX - drag.x)); return;}
    const dy = event.clientY - drag.y;
    if (drag.kind === "modh") {setModuleH(drag.id, drag.from + dy); return;}
    if (drag.kind === "deskcard") {setDeskW(drag.from + dy * 5 / 7); return;}
    if (drag.kind === "panel" || drag.kind === "side") setSplit(drag.kind, drag.from + dy / drag.per);
    else if (drag.kind === "rows") setRows(drag.from + (drag.side ? event.clientX - drag.x : dy) / drag.per);
    else setScale("hand", drag.from - dy / drag.per * 100);
  });
  const endDrag = () => {if (drag) {if(drag.kind==='zones'){const grid=drag.grid;keep(zoneKey(drag.seat),parseFloat(grid.style.getPropertyValue('--field-px'))/drag.total);}drag = null; document.documentElement.classList.remove("cm-dragging");}};
  document.addEventListener('dblclick',event=>{const el=event.target.closest?.('#cm-board [data-drag="zones"]');if(!el)return;keep(zoneKey(Number(el.dataset.zoneSeat)),.6);fitBoardZones(document.getElementById('cm-board'));});
  /* A double click on a module's bar gives it back its own height. */
  document.addEventListener("dblclick", (event) => {const el = event.target.closest && event.target.closest('#cm-board [data-drag="modh"]'); if (el) clearModuleH(el.dataset.moduleId);});
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("keydown", (event) => {
    const el = event.target.closest && event.target.closest("#cm-board [data-drag]");
    if (!el) return;
    if(el.dataset.drag==='zones'){if(!['ArrowUp','ArrowDown','Home'].includes(event.key))return;event.preventDefault();const grid=el.closest('.cm-mat-grid'),seat=Number(el.dataset.zoneSeat),total=Number(grid.dataset.zoneTotal);setZones(seat,event.key==='Home'?total*.6:parseFloat(grid.style.getPropertyValue('--field-px'))+(event.key==='ArrowDown'?16:-16),total);return;}
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
    /* A bar under a module or the card: ↓ makes it taller, as dragging down does. */
    if (el.dataset.drag === "modh") {const body = el.closest(".cm-stage-module")?.querySelector(":scope>.cm-module-body"); setModuleH(el.dataset.moduleId, (moduleH(el.dataset.moduleId) || body?.getBoundingClientRect().height || 200) - up * 20); return;}
    if (el.dataset.drag === "deskcard") {setDeskW(deskW() - up * 14); return;}
    if (el.dataset.drag === "panel" || el.dataset.drag === "side") setSplit(el.dataset.drag, splitOf(el.dataset.drag) - up * 0.02);
    else if (el.dataset.drag === "rows") setRows(rowShare() - up * 0.02);
    else setScale("hand", scaleOf("hand") + up * 5);
  });
  /* A picture that does not come leaves the card's own frame, which already names it. */
  // A loaded picture replaces the fallback name. Do not leave hidden text painted under a rotated image.
  document.addEventListener("load", event => {const img=event.target;if(img?.matches?.('.cm-bcard[data-card] img') && img.naturalWidth>0)img.dataset.cardLoaded='true';}, true);
  document.addEventListener("error", (event) => {const t = event.target; if (t && t.matches && t.matches(".cm-bcard img, .cm-combat-card img, .cm-block-tile img")) t.remove();}, true);
});
