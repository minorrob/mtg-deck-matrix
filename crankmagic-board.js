/* PLAY IN THE CLOUD: THE BOARD (M5; the handoff's README, "Wireframes v2", the Focus view).
 *
 * While a table's game is on, the lobby (crankmagic-table.js) hands the page to this board. It holds one
 * WebSocket to the table (/api/tables/<id>/connect) and draws whatever view the room last sent: that seat's own
 * projection, never another's (game/room/room.mjs, view), and the decision it is being asked, if any. What a
 * person does goes back as the §12.1 action envelope -- {actionId, revision, kind:"answer", choiceId, ...} --
 * and the room answers with a receipt, a fresh view for everyone, or a refusal carrying the view to redraw.
 *
 *   the strip     Turn · the step · Next · Pass priority · the view · Tools (End game, two taps; Concede)
 *   three views   Table: every seat's board at once, you at the bottom right; Focus: one board large, the others
 *                 as tiles; Full screen: the page given to the game, a slim rail, the others above you
 *   the pane      every seat as a tile with its vitals; a tile puts that seat's board on the mat
 *   vitals        a pill per seat (life, poison, a bar per commander toward 21); any pill opens Table vitals
 *   Show hand     ✋ or Space: the hand fanned over a dimmed board to contemplate; a card chosen (a click, or its
 *                 number) is held up with what it can do; Enter does it, Escape puts it back
 *   Card zoom     a card held under the pointer is shown large; a long press or a right click opens it with
 *                 what it can do
 *   card size     the app's slider, in Tools; ⌘/Ctrl + and − step it
 *   Coach         a chat panel sliding over the right edge (never narrowing the mat): suggested prompts, a composer,
 *                 turn dividers. The shell only, as the handoff says: its reply says it is not switched on yet.
 *   History       the table's history (game/room/history.mjs: public lines, the same for everyone), newest
 *                 first: a drop-down from the strip with a filter, a band on the Focus mat, a column in Full screen
 *   the mat       the battlefield in groups over the lands; Command and Exile, Library and Graveyard as piles
 *   the hand      your own, docked over the mat's foot; bright = something you can do with it now
 *   the decision  whatever the room is asking you, in any mode the engine asks in
 *
 * Views arrive in order with the controller's revision; an older one is ignored. A dropped socket is
 * reopened, backing off to ten seconds, and the room sends the view again the moment it is back.
 *
 * PHONES (the handoff's "Play on phones"): Focus only. A 52px icon rail (✋ with the hand's count, History,
 * Coach, Settings), your board full-bleed, a 112px seat strip (life in bold; tap to look at a board, ‹ › to go
 * round), and a pill on top: turn, step, Next, Pass, or "Viewing Maya · My board". The game surface is landscape
 * only, with no screen asking to turn the phone: held upright, the surface is turned a quarter itself. When the
 * room asks you something, the board snaps back to yours.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, actions} = C;
  /* The app's button, which can also be off: a choice the room would refuse is not offered. */
  const b = (label, action, data = {}, primary = false, {disabled = false, ...rest} = {}) => {
    const html = C.button(label, action, data, primary, rest);
    return disabled ? html.replace("<button ", "<button disabled ") : html;
  };

  /* The step ribbon: the handoff's seven, each the engine's phases it covers. */
  const STEPS = [["Untap", ["UNTAP"]], ["Upkeep", ["UPKEEP"]], ["Draw", ["DRAW"]], ["Main 1", ["MAIN1"]],
    ["Combat", ["COMBAT_BEGIN", "COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS", "COMBAT_FIRST_STRIKE_DAMAGE", "COMBAT_DAMAGE", "COMBAT_END"]],
    ["Main 2", ["MAIN2"]], ["End", ["END_OF_TURN", "CLEANUP"]]];
  const COMBAT_STEP = {COMBAT_BEGIN: "beginning of combat", COMBAT_DECLARE_ATTACKERS: "declare attackers", COMBAT_DECLARE_BLOCKERS: "declare blockers",
    COMBAT_FIRST_STRIKE_DAMAGE: "first-strike damage", COMBAT_DAMAGE: "combat damage", COMBAT_END: "end of combat"};
  const stepAt = (phase) => STEPS.findIndex(([, phases]) => phases.includes(phase));
  /* One color per seat, for its commander's damage bar wherever it shows. */
  const SEAT_COLORS = ["var(--st-reserved)", "var(--st-buy)", "var(--st-pull)", "var(--st-standin)"];
  const RETRY_MAX = 10000;
  /* The three views, and the one this person last chose, remembered on this device. */
  const VIEWS = [["table", "⊞", "Table"], ["focus", "◧", "Focus"], ["full", "⛶", "Full screen"]];
  const VIEW_KEY = "cm-board-view";
  let mode = (() => {try {const v = localStorage.getItem(VIEW_KEY); return VIEWS.some(([k]) => k === v) ? v : "focus";} catch {return "focus";}})();
  let selected = null;   /* Full screen: the card shown large in the side column */
  let showing = null, held = null;
  let historyOpen = false, historyFilter = "";
  /* The Coach: open or not, its thread ({from: "you"|"coach", text} or {divider}), and whether it is "typing". */
  const coach = {open: false, thread: [], typing: false, timer: null};
  const COACH_PROMPTS = ["What's my best play?", "Who's the threat?", "Plan my next turn", "Explain the stack"];
  const COACH_STUB = "I'm not switched on yet. When the Coach arrives, I'll read your board, your hand and the table, and answer here. For now, the History and Table vitals say what has happened.";   /* Show hand: null, "fan" or "held"; the card held up */

  let tableId = null, table = null, view = null, socket = null, status = "idle", retry = 0, retryTimer = null;
  let focus = null, picked = [], amounts = [], sending = false, tools = false, confirmEnd = false, closedByUs = false;
  const away = new Map();   /* seat number -> until, from the table and from the room's "away" frames */

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
    const before = view && view.decision && view.decision.id;
    view = next;
    if (focus === null) focus = view.seat;
    /* On a phone the board you are looking at is the only one on screen: when you are asked, it is yours. */
    if (phone() && view.decision && view.decision.id !== before) focus = view.seat;
    if ((view.decision && view.decision.id) !== before) {picked = []; amounts = []; sending = false;}
    draw();
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
  /* A commander's damage is kept by the commander's object; which seat that is, the owner of the card says. */
  function commanderSeat(objectId) {
    for (const p of players()) for (const zone of Object.values(p.zones)) {
      const card = zone.cards.find((c) => c.cardId === Number(objectId));
      if (card && card.commander) return card.owner;
    }
    return null;
  }
  function vitals(p, {big = false, button = true} = {}) {
    const h = p.health, from = Object.entries(h.commanderDamage || {}).map(([id, n]) => ({seat: commanderSeat(id), n}));
    const danger = h.life <= 10 || h.poison >= 7 || from.some((f) => f.n >= 15);
    const bars = from.map((f) => `<i class="cm-vitals-bar" style="--fill:${Math.min(1, f.n / 21)};--seat:${SEAT_COLORS[f.seat ?? 0]}" title="${e(f.seat === null ? "A commander" : nameOf(f.seat))}: ${f.n} of 21"></i>`).join("");
    const inner = `<b>${h.life}</b><span class="cm-vitals-poison">☠ ${h.poison}</span>${bars}`, cls = `cm-vitals${big ? " is-big" : ""}${danger ? " is-danger" : ""}`;
    const label = `${p.playerId === view.seat ? "You" : p.name}: ${h.life} life, ${h.poison} poison`;
    return button ? `<button type="button" class="${cls}" data-action="board-vitals" aria-label="${e(label)}; open Table vitals">${inner}</button>`
      : `<span class="${cls}" aria-label="${e(label)}">${inner}</span>`;
  }

  /* A card's picture: the library's own record when it has one by that name, else Scryfall by name. When the
     picture does not come, the frame's own name and numbers are the card. */
  let pictures = null;
  function pictureOf(name) {
    if (!pictures) {pictures = new Map(); for (const c of C.cards()) if (c.image && !pictures.has(c.name)) pictures.set(c.name, c.image);}
    return pictures.get(name) || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
  }
  const optionsFor = (cardId) => (view.decision ? view.decision.options.filter((o) => o.cardId === cardId) : []);
  function card(c, {where = "mat", action = "board-card"} = {}) {
    if (!c.name) return `<div class="cm-bcard is-back" aria-label="A hidden card"></div>`;
    const opts = optionsFor(c.cardId), mine = view.decision && !sending;
    const bright = mine && opts.length > 0, chosen = opts.some((o) => picked.includes(o.index));
    const creature = c.types.includes("Creature") && c.power !== null;
    const cls = ["cm-bcard", c.tapped ? "is-tapped" : "", bright ? "is-bright" : "", chosen ? "is-picked" : "", (where === "hand" || where === "fan") && mine && !bright ? "is-dim" : ""].filter(Boolean).join(" ");
    const marks = [c.damage ? `<span class="cm-bcard-mark">${c.damage} damage</span>` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `<span class="cm-bcard-mark">${n} ${e(k)}</span>`)].join("");
    const label = `${c.name}${c.tapped ? ", tapped" : ""}${bright ? `: ${opts.map((o) => o.label).join(" or ")}` : ""}`;
    return `<button type="button" class="${cls}" data-action="${action}" data-card="${c.cardId}" aria-label="${e(label)}">
      <span class="cm-bcard-name">${e(c.name)}</span>${creature ? `<span class="cm-bcard-pt">${c.power}/${c.toughness}</span>` : ""}
      <img src="${e(pictureOf(c.name))}" alt="" loading="lazy" referrerpolicy="no-referrer">${marks ? `<span class="cm-bcard-marks">${marks}</span>` : ""}</button>`;
  }

  /* ---- drawing ---- */
  function strip() {
    const s = view.state, turnName = s.turnPlayerId === null ? "" : nameOf(s.turnPlayerId);
    const at = stepAt(s.phase), step = at < 0 ? "Opening hands" : STEPS[at][0];
    const detail = COMBAT_STEP[s.phase] ? ` · ${COMBAT_STEP[s.phase]}` : "";
    const next = at < 0 ? "" : at + 1 < STEPS.length ? STEPS[at + 1][0] : "Next turn";
    const d = view.decision, priority = d && d.kind === "priority";
    const waiting = view.status === "finished" ? "The game is over."
      : d ? (sending ? "Sent…" : d.title) : view.waitingOn ? `Waiting on ${view.waitingOn === view.seatId ? "you" : seatName(view.waitingOn)}` : "";
    const conn = status === "open" ? "" : `<span class="cm-board-conn" role="status">${status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</span>`;
    return `<header class="cm-board-strip">
      <span class="cm-board-turn">${s.turn ? `Turn ${s.turn} · ${e(turnName)}` : "Before turn 1"}</span>
      <span class="cm-board-step">${e(step)}${e(detail)}</span>
      ${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
      <span class="cm-board-waiting" role="status" aria-live="polite">${e(waiting)}</span>${conn}
      <span class="cm-board-spacer"></span>
      ${b("Pass priority", "board-pass", {}, true, {cls: "compact", disabled: !priority || sending})}
      ${switcher()}
      <span class="cm-board-tools">${b("History ▾", "board-history", {}, false, {cls: "compact"})}${historyOpen ? historyMenu() : ""}</span>
      <span class="cm-board-tools">${b("Tools ▾", "board-tools", {}, false, {cls: "compact"})}${tools ? toolsMenu() : ""}</span>
    </header>`;
  }
  function switcher(icons = false) {
    return `<span class="cm-board-views" role="group" aria-label="View">${VIEWS.map(([k, icon, label]) => `<button type="button" class="v-button compact${mode === k ? " is-on" : ""}" data-action="board-view" data-view="${k}" aria-pressed="${mode === k}"${icons ? ` aria-label="${label}" title="${label}"` : ""}>${icons ? icon : `${icon} ${label}`}</button>`).join("")}</span>`;
  }
  function toolsMenu() {
    const over = view.status === "finished", left = !!departed(view.seat);
    const end = confirmEnd
      ? `${b("End for everyone · keep the record", "board-end", {confirm: "1"}, true)}${b("Keep playing", "board-end-cancel")}`
      : b("End game", "board-end", {}, false, {disabled: over});
    const [lo, hi] = C.cardScaleRange();
    return `<div class="cm-board-menu" role="menu" id="cm-board-tools">
      <div class="cm-actions cm-board-menu-row">${b("✦ Recommended actions", "board-coach", {})}</div>
      <div class="cm-board-size">${C.cardScaleSlider()}<p class="cm-muted">${lo}% – ${hi}% · applies to mats, piles and hand · remembered on this device · ⌘/Ctrl + / − also work</p></div>
      <p class="cm-muted">End game stops it for everyone and keeps its record. Concede leaves it to the others.</p>
      <div class="cm-actions">${end}${b("Concede", "board-concede", {}, false, {disabled: over || left})}</div></div>`;
  }
  const visibleCards = (p) => Object.values(p.zones).flatMap((z) => z.cards);
  const commanderOf = (p) => visibleCards(p).find((c) => c.commander && c.name) || null;
  const seatLabel = (p) => (p.playerId === view.seat ? `You · ${p.name}` : p.name);
  function seatFlag(p) {
    const i = p.playerId, gone = departed(i), dropped = away.get(i);
    return gone ? (gone === "timed-out" ? "Timed out · not finished" : "Conceded")
      : p.health.status === "lost" ? "Out of the game"
      : dropped ? `Dropped · back by ${new Date(dropped).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"})}`
      : view.waitingOn === `s${i}` ? "Deciding" : view.state.turnPlayerId === i ? "● Active" : "";
  }
  /* A tile is two controls side by side, never one inside the other: the seat (puts its board on the mat) and
     its vitals (opens Table vitals). */
  function tile(p) {
    const i = p.playerId, commander = commanderOf(p);
    return `<div class="cm-board-tile${focus === i ? " is-focus" : ""}${i === view.seat ? " is-you" : ""}" data-seat="${i}">
      <button type="button" class="cm-board-tile-main" data-action="board-focus" data-seat="${i}" aria-pressed="${focus === i}">
        <span class="cm-board-tile-name">${e(seatLabel(p))}</span><span class="cm-muted">${e(commander ? commander.name : "")}</span></button>
      ${vitals(p)}<span class="cm-board-tile-flag">${e(seatFlag(p))}</span></div>`;
  }
  function ribbon(active) {
    const at = stepAt(view.state.phase);
    return `<ol class="cm-board-ribbon" aria-label="Steps">${STEPS.map(([label], i) => `<li class="${!active ? "" : i < at ? "is-done" : i === at ? "is-now" : ""}">${e(label)}</li>`).join("")}</ol>`;
  }
  function pile(label, zone, top) {
    return `<figure class="cm-board-pile" aria-label="${e(label)}, ${zone.count}">
      ${top ? card(top) : `<div class="cm-bcard is-empty${label === "Library" && zone.count ? " is-back" : ""}"></div>`}
      <figcaption><em>${e(label)}</em><b>${zone.count}</b></figcaption></figure>`;
  }
  function mat(p) {
    const field = p.zones.Battlefield.cards;
    const lands = field.filter((c) => c.types.includes("Land"));
    const creatures = field.filter((c) => !c.types.includes("Land") && c.types.includes("Creature"));
    const other = field.filter((c) => !c.types.includes("Land") && !c.types.includes("Creature"));
    const group = (label, cards) => cards.length ? `<div class="cm-board-group"><h3>${e(label)} · ${cards.length}</h3><div class="cm-board-cards">${cards.map((c) => card(c)).join("")}</div></div>` : "";
    const mana = p.mana.reduce((n, m) => n + m.amount, 0);
    const you = p.playerId === view.seat;
    const h = p.health;
    const damage = Object.entries(h.commanderDamage || {}).filter(([, n]) => n > 0).map(([id, n]) => `${n} from ${e(nameOf(commanderSeat(id) ?? view.seat))}'s commander`).join(" · ");
    return `<section class="cm-board-mat" aria-label="${e(you ? "Your board" : `${p.name}'s board`)}">
      <header class="cm-board-mat-head"><h2>${e(you ? `You · ${p.name}` : p.name)}</h2>
        <span class="cm-board-life">${h.life} life · ${h.poison} poison${damage ? ` · ${damage}` : ""}</span>
        ${ribbon(view.state.turnPlayerId === p.playerId)}</header>
      <div class="cm-board-mat-grid">
        <div class="cm-board-field">${group("Creatures", creatures)}${group("Artifacts & enchantments", other)}${!creatures.length && !other.length ? `<p class="cm-board-empty">No permanents yet.</p>` : ""}</div>
        <div class="cm-board-lands"><h3>Lands · ${lands.length}${you ? ` <span class="cm-board-chip">${mana} mana open · land drop ${p.landsPlayed ? "used" : "1 left"}</span>` : ""}</h3><div class="cm-board-cards">${lands.map((c) => card(c)).join("")}</div></div>
        <div class="cm-board-piles">${pile("Command", p.zones.Command, p.zones.Command.cards[0])}${pile("Exile", p.zones.Exile, p.zones.Exile.cards.at(-1))}
          ${historyBand(5)}
          ${pile("Library", p.zones.Library, null)}${pile("Graveyard", p.zones.Graveyard, p.zones.Graveyard.cards.at(-1))}</div>
      </div>
      ${you ? "" : `<p class="cm-board-their-hand">${e(p.name)}'s hand · ${p.zones.Hand.count}</p>`}
    </section>`;
  }
  /* ONE SEAT'S BOARD, SMALL: the Table view's four, and the Full screen view's opponents. Its header sits on
     the board's outer edge (the handoff): name · vitals · commander · flag · Focus. */
  function seatBoard(p, {area = "", bottom = false, head: withHead = true} = {}) {
    const i = p.playerId, you = i === view.seat, field = p.zones.Battlefield.cards, commander = commanderOf(p);
    const lands = field.filter((c) => c.types.includes("Land")), rest = field.filter((c) => !c.types.includes("Land"));
    const z = p.zones;
    const head = `<header class="cm-seatboard-head"><strong>${e(seatLabel(p))}</strong>${vitals(p)}<span class="cm-muted">${e(commander ? commander.name : "")}</span>
      <span class="cm-board-tile-flag">${e(seatFlag(p))}</span>${b("⤢ Focus", "board-focus", {seat: String(i)}, false, {cls: "compact"})}</header>`;
    const body = `<div class="cm-seatboard-body"><div class="cm-board-cards">${rest.map((c) => card(c)).join("") || `<span class="cm-board-empty">No permanents yet.</span>`}</div>
      <div class="cm-board-cards cm-seatboard-lands" aria-label="Lands, ${lands.length}">${lands.map((c) => card(c)).join("")}</div>
      <p class="cm-seatboard-piles">Hand ${z.Hand.count} · Library ${z.Library.count} · Graveyard ${z.Graveyard.count} · Exile ${z.Exile.count}</p></div>`;
    const top = withHead ? head : "";
    return `<section class="cm-seatboard${you ? " is-you" : ""}${bottom ? " is-bottom" : ""}" data-seat="${i}"${area ? ` style="grid-area:${area}"` : ""} aria-label="${e(you ? "Your board" : `${p.name}'s board`)}">${bottom ? body + top : top + body}</section>`;
  }
  /* THE TABLE VIEW: every board at once, you at the bottom right and the others round from the top left
     (the handoff's "seats 2 · 3 / 4 · 1"). Fewer seats, fewer boards: two stack, three put you across the foot.
     The logo in the middle opens Table vitals. */
  function tableView() {
    const ps = players(), n = ps.length;
    const AREA = n === 2 ? ["b", "a"] : n === 3 ? ["c", "a", "b"] : ["d", "a", "b", "c"];
    const BOTTOM = n === 2 ? ["b"] : ["c", "d"];
    const boards = ps.map((p) => {const area = AREA[(p.playerId - view.seat + n) % n]; return seatBoard(p, {area, bottom: BOTTOM.includes(area)});}).join("");
    return `<div class="cm-board-table" data-seats="${n}">${boards}
      <button type="button" class="cm-board-center" data-action="board-vitals" aria-label="Table vitals"><img src="assets/crankmagic/crankmagic-logo-gear-v4-256.webp" alt=""></button></div>`;
  }
  /* THE FULL SCREEN VIEW: the page given to the game. A slim rail; the others across the top, you across the
     foot with the step, Next and Pass over your board; at the side, the others' vitals, the card you picked,
     and what you are being asked. */
  function fullView() {
    const s = view.state, me = players()[view.seat], others = players().filter((p) => p.playerId !== view.seat);
    const at = stepAt(s.phase), step = at < 0 ? "Opening hands" : STEPS[at][0], next = at < 0 ? "" : at + 1 < STEPS.length ? STEPS[at + 1][0] : "Next turn";
    const d = view.decision, priority = d && d.kind === "priority";
    const rail = `<nav class="cm-full-rail" aria-label="Board"><span class="cm-full-turn" title="Turn ${s.turn}">T${s.turn}</span>${switcher(true)}
      <span class="cm-board-tools">${b("☰", "board-history", {}, false, {cls: "compact"}).replace("<button ", '<button aria-label="History" title="History" ')}${historyOpen ? historyMenu() : ""}</span>
      ${b("✦", "board-coach", {}, false, {cls: "compact"}).replace("<button ", '<button aria-label="CrankMagic Coach" title="CrankMagic Coach" ')}
      <span class="cm-board-tools">${b("⚙", "board-tools", {}, false, {cls: "compact"}).replace("<button ", '<button aria-label="Tools" title="Tools" ')}${tools ? toolsMenu() : ""}</span>
      <span class="cm-board-spacer"></span>${b("⎋", "board-view", {view: "focus"}, false, {cls: "compact"}).replace("<button ", '<button aria-label="Leave full screen" title="Leave full screen" ')}</nav>`;
    const pill = `<div class="cm-full-pill"><span class="cm-board-step">${e(step)}</span>${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
      <span class="cm-board-waiting" role="status" aria-live="polite">${e(d ? (sending ? "Sent…" : d.title) : view.waitingOn ? `Waiting on ${seatName(view.waitingOn)}` : "")}</span>
      ${b("Pass priority", "board-pass", {}, true, {cls: "compact", disabled: !priority || sending})}</div>`;
    const pick = selected !== null && visibleCards(me).concat(...others.map(visibleCards)).find((c) => c.cardId === selected);
    const pickPanel = pick ? `<section class="cm-full-pick" aria-label="${e(pick.name)}">${card(pick, {where: "pick"})}<div class="cm-board-options">${optionsFor(pick.cardId).map((o) => `<button type="button" class="v-button compact primary" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${e(verbFor(o))}</button>`).join("")}</div></section>` : "";
    return `${rail}<div class="cm-full-center">
        <div class="cm-full-others" style="--cols:${Math.max(1, others.length)}">${others.map((p) => seatBoard(p)).join("")}</div>
        <div class="cm-full-mine">${pill}${seatBoard(me, {bottom: true})}${hand()}</div></div>
      <aside class="cm-full-side" aria-label="The table"><div class="cm-full-vitals">${others.map((p) => `<div><span>${e(p.name)}</span>${vitals(p)}</div>`).join("")}<div><span>You</span>${vitals(me)}</div></div>
        ${pickPanel}${decision()}${stack()}${historyBand(8)}</aside>`;
  }
  /* TABLE VITALS (the handoff's 560px dialog): every seat's life and poison, and every commander's damage to
     every other seat, "n / 21" with its bar; the commander's own seat reads "—". */
  function tableVitals() {
    const ps = players(), head = `<div role="row" class="is-head"><span role="columnheader"></span>${ps.map((p) => `<span role="columnheader">${e(p.playerId === view.seat ? "You" : p.name)}</span>`).join("")}</div>`;
    const row = (label, cells) => `<div role="row"><span role="rowheader">${e(label)}</span>${cells.map((c) => `<span role="cell">${c}</span>`).join("")}</div>`;
    const rows = [row("Life", ps.map((p) => `<b>${p.health.life}</b>`)), row("Poison", ps.map((p) => `${p.health.poison} / 10`))];
    const known = new Set();
    for (const src of ps) {
      const ids = visibleCards(src).filter((c) => c.commander).map((c) => c.cardId);
      if (!ids.length) continue;
      ids.forEach((id) => known.add(String(id)));
      const name = (commanderOf(src) || {}).name || `${src.name}'s commander`;
      rows.push(row(`From ${name}`, ps.map((t) => {
        if (t.playerId === src.playerId) return "—";
        const n = ids.reduce((sum, id) => sum + ((t.health.commanderDamage || {})[id] || 0), 0);
        return `${n} / 21<i class="cm-vitals-meter" style="--fill:${Math.min(1, n / 21)};--seat:${SEAT_COLORS[src.playerId % 4]}"></i>`;
      })));
    }
    const unknown = [...new Set(ps.flatMap((t) => Object.keys(t.health.commanderDamage || {})))].filter((id) => !known.has(id));
    for (const id of unknown) rows.push(row("From a commander out of sight", ps.map((t) => `${(t.health.commanderDamage || {})[id] || 0} / 21`)));
    C.modal("Table vitals", `<div class="cm-table-vitals" role="table" aria-label="Table vitals" style="--cols:${ps.length}">${head}${rows.join("")}</div>
      <p class="cm-muted">A player loses at 0 life, at 10 poison, or at 21 combat damage from one commander.</p><div class="cm-form-footer">${b("Close", "close", {}, true)}</div>`);
  }
  /* THE HISTORY, newest first. A turn's line is a divider; the others carry the turn they happened in. */
  const lines = () => [...(view.history || [])].reverse();
  const historyRow = (l) => l.mark === "turn" ? `<li class="is-turn">${e(l.text)}</li>` : `<li${l.mark === "end" ? ' class="is-end"' : ""}><span>${e(l.text)}</span><span class="cm-history-turn">${l.turn ? `T${l.turn}` : "Start"}</span></li>`;
  const matches = (l) => !historyFilter || l.text.toLowerCase().includes(historyFilter.toLowerCase());
  function historyMenu() {
    const all = lines();
    return `<div class="cm-board-menu cm-board-history" role="dialog" aria-label="History" id="cm-board-history">
      <h3>History · newest first</h3>
      <input type="search" class="cm-history-filter" data-board-history-filter placeholder="Search & filter by card or player…" aria-label="Filter the history" value="${e(historyFilter)}">
      <ol class="cm-history-list">${all.map((l) => historyRow(l).replace("<li", `<li${matches(l) ? "" : " hidden"}`)).join("") || `<li class="cm-muted">Nothing has happened yet.</li>`}</ol></div>`;
  }
  function historyBand(count) {
    const recent = lines().filter((l) => l.mark !== "turn").slice(0, count);
    return `<section class="cm-board-band" aria-label="History"><h3>History ${b("⌕", "board-history", {}, false, {cls: "compact"}).replace("<button ", '<button aria-label="Open the history" title="Open the history" ')}</h3>
      <ol>${recent.map(historyRow).join("") || `<li class="cm-muted">Nothing yet.</li>`}</ol></section>`;
  }
  function stack() {
    const items = view.state.stack;
    if (!items.length) return "";
    return `<section class="cm-board-stack" aria-label="The stack"><h3>On the stack · ${items.length}</h3><ol>${[...items].reverse().map((s) => `<li>${e(s.name || "A face-down spell")} <span class="cm-muted">${e(nameOf(s.playerId))}</span></li>`).join("")}</ol></section>`;
  }

  /* THE DECISION, IN WHATEVER MODE IT COMES. A one-of answers on the tap; a many-of or an order collects,
     then Confirm; damage is shared out by number. The rules on each (how many, which may not repeat) are the
     room's; the board only keeps Confirm off until they can be met, and the room says no if they are not. */
  const VERB = {"play-land": "Play", cast: "Cast", "activate-mana": "Tap for mana:"};
  const verbFor = (o) => `${VERB[o.act] || ""} ${o.label}`.trim();
  function decision() {
    const d = view.decision;
    if (!d || view.status === "finished") return "";
    const opt = (o, extra = "") => `<button type="button" class="v-button compact${picked.includes(o.index) ? " is-picked" : ""}" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}${extra}>${e(o.label)}</button>`;
    let body = "", foot = "";
    if (d.kind === "priority") {
      /* Pass is the strip's; the panel is what else you can do, one button per kind of thing, the same land
         four times over being one "Play Forest" (tapping a card in the hand plays that very one). */
      const seen = new Map();
      for (const o of d.options) {
        if (o.act === "pass") continue;
        const key = `${o.act}|${o.label}`;
        if (seen.has(key)) seen.get(key).n += 1; else seen.set(key, {o, n: 1});
      }
      if (!seen.size) return "";
      body = [...seen.values()].map(({o, n}) => `<button type="button" class="v-button compact" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}>${e(verbFor(o))}${n > 1 ? ` <span class="cm-muted">×${n}</span>` : ""}</button>`).join("");
      return `<section class="cm-board-decision" id="cm-board-decision" aria-label="What you can do"><h3>You can also</h3><div class="cm-board-options">${body}</div></section>`;
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
    return `<section class="cm-board-decision" id="cm-board-decision" aria-label="${e(d.title)}"><h3>${e(d.title)}</h3>
      <div class="cm-board-options">${body}</div>${foot ? `<div class="cm-board-decision-foot">${foot}</div>` : ""}</section>`;
  }
  function hand() {
    const mine = players()[view.seat];
    if (!mine) return "";
    const cards = mine.zones.Hand.cards;
    return `<section class="cm-board-hand" aria-label="Your hand"><h3><button type="button" class="cm-board-showhand" data-action="board-show-hand" aria-label="Show hand (Space)" title="Show hand (Space)" aria-pressed="${!!showing}">✋</button>Hand · ${cards.length}${view.decision ? ` <span class="cm-muted">Bright = you can use it now</span>` : ""}</h3>
      <div class="cm-board-hand-cards">${cards.map((c) => card(c, {where: "hand"})).join("")}</div></section>`;
  }
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
      const acts = opts.map((o, i) => `<button type="button" class="v-button${i === 0 ? " primary" : ""}" data-action="board-hand-do" data-index="${o.index}"${sending ? " disabled" : ""}>${e(verbFor(o))}${i === 0 ? " · Enter" : ""}</button>`).join("");
      return `<div class="cm-hand-show is-held" role="dialog" aria-modal="true" aria-label="${e(c.name)}, held">${close}
        <div class="cm-hand-held">${card(c, {where: "held", action: "board-hand-back"})}</div>
        <div class="cm-actions cm-hand-acts">${acts || `<span class="cm-muted">Nothing to do with it now.</span>`}${b("Back to hand", "board-hand-back")}</div>
        <div class="cm-hand-rest">${cards.filter((x) => x.cardId !== held).map((x) => card(x, {where: "rest", action: "board-hand-hold"})).join("")}</div></div>`;
    }
    const fan = cards.map((c, k) => {const o = k - (n - 1) / 2; return `<div class="cm-hand-slot" style="--o:${o};--a:${Math.abs(o)}" data-key="${k + 1}">${card(c, {where: "fan", action: "board-hand-hold"})}<span class="cm-hand-key">${k + 1}</span></div>`;}).join("");
    return `<div class="cm-hand-show" role="dialog" aria-modal="true" aria-label="Your hand">${close}
      <header><h2>Your hand · ${n}</h2><p class="cm-muted">Hover to read · click to choose · 1–${Math.min(9, n) || 1} keys · Space or ✕ to put it away · bright = castable now</p></header>
      <div class="cm-hand-fan" style="--gaps:${Math.max(1, n - 1)}">${fan}</div></div>`;
  }
  /* CARD ZOOM. A card held under the pointer a moment is shown large (320px) where it does not cover it; a long
     press, or a right click, opens it with what can be done with it. */
  function findCard(cardId) {
    for (const p of players()) for (const c of visibleCards(p)) if (c.cardId === cardId) return c;
    return null;
  }
  function zoom(cardId) {
    const c = findCard(cardId);
    if (!c || !c.name) return;
    const acts = optionsFor(c.cardId).map((o) => `<button type="button" class="v-button primary" data-action="board-zoom-do" data-index="${o.index}"${sending ? " disabled" : ""}>${e(verbFor(o))}</button>`).join("");
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
      const box = el.getBoundingClientRect(), right = box.left + box.width / 2 < innerWidth / 2;
      const div = old || Object.assign(document.createElement("div"), {id: "cm-board-peek", className: "cm-board-peek"});
      div.setAttribute("aria-hidden", "true");
      div.dataset.side = right ? "right" : "left";
      div.innerHTML = card(c, {where: "peek", action: "none"});
      if (!old) document.getElementById("cm-board").append(div);
    }, 350);
  }
  /* A PHONE: the shorter side of the screen at most 500px. Held upright, the surface is turned to landscape. */
  const phone = () => Math.min(innerWidth, innerHeight) <= 500;
  function phoneView() {
    const s = view.state, me = players()[view.seat], p = players()[focus] || me, mine = p.playerId === view.seat;
    const at = stepAt(s.phase), step = at < 0 ? "Opening hands" : STEPS[at][0], next = at < 0 ? "" : at + 1 < STEPS.length ? STEPS[at + 1][0] : "Next turn";
    const d = view.decision, priority = d && d.kind === "priority";
    const icon = (glyph, action, label, extra = "") => `<button type="button" class="cm-phone-icon" data-action="${action}" aria-label="${e(label)}" title="${e(label)}">${glyph}${extra}</button>`;
    const rail = `<nav class="cm-phone-rail" aria-label="Board">
      ${icon("✋", "board-show-hand", "Your hand", `<span class="cm-phone-badge">${me.zones.Hand.count}</span>`)}
      <span class="cm-board-tools">${icon("☰", "board-history", "History")}${historyOpen ? historyMenu() : ""}</span>
      ${icon("✦", "board-coach", "CrankMagic Coach")}
      <span class="cm-board-tools">${icon("⚙", "board-tools", "Settings")}${tools ? toolsMenu() : ""}</span></nav>`;
    const pill = mine
      ? `<div class="cm-phone-pill"><b>T${s.turn}</b><span class="cm-board-step">${e(step)}</span>${next ? `<span class="cm-board-next">Next: ${e(next)}</span>` : ""}
          ${b("Pass", "board-pass", {}, true, {cls: "compact", disabled: !priority || sending})}</div>`
      : `<div class="cm-phone-pill"><span>Viewing ${e(p.name)}</span>${b("My board", "board-focus", {seat: String(view.seat)}, true, {cls: "compact"})}</div>`;
    const seats = [me, ...players().filter((x) => x.playerId !== view.seat)];
    const strip = `<aside class="cm-phone-seats" aria-label="Seats">
      ${seats.map((x) => `<button type="button" class="cm-phone-seat${x.playerId === p.playerId ? " is-focus" : ""}" data-action="board-focus" data-seat="${x.playerId}" aria-pressed="${x.playerId === p.playerId}">
        <span>${e(x.playerId === view.seat ? "You" : x.name)}</span><b>${x.health.life}</b><small>${e(seatFlag(x))}</small></button>`).join("")}
      <div class="cm-phone-rotate">${b("‹", "board-rotate", {by: "-1"}, false, {cls: "compact"})}${b("›", "board-rotate", {by: "1"}, false, {cls: "compact"})}</div></aside>`;
    return `${rail}<div class="cm-phone-center">${pill}${seatBoard(p, {head: false})}<div class="cm-phone-ask">${decision()}${stack()}</div></div>${strip}`;
  }
  /* THE COACH (the handoff's play-coach). It lives beside the board, not inside it, so the views that arrive
     while someone types redraw the board and leave the composer, and whatever is in it, alone. */
  const stepNow = () => {const s = view.state, at = stepAt(s.phase); return s.turn ? `Turn ${s.turn} · ${at < 0 ? "Opening hands" : STEPS[at][0]}` : "Before turn 1";};
  function coachContext() {return `Sees your board, hand and the table · turn ${view && view.state.turn ? view.state.turn : 0}`;}
  function drawCoach() {
    const panel = document.getElementById("cm-board-coach");
    if (!panel) return;
    panel.hidden = !coach.open;
    if (!coach.open) {panel.innerHTML = ""; return;}
    const keep = panel.querySelector(".cm-coach-input");
    const typed = keep ? keep.value : "", focused = keep && document.activeElement === keep;
    const bubble = (m) => m.divider ? `<li class="cm-coach-divider"><span>${e(m.divider)}</span></li>`
      : `<li class="cm-coach-msg is-${m.from}">${m.from === "coach" ? `<img class="cm-coach-avatar" src="assets/crankmagic/crankmagic-logo-gear-v4-256.webp" alt="">` : ""}<p>${e(m.text)}</p></li>`;
    panel.innerHTML = `<header class="cm-coach-head"><img src="assets/crankmagic/crankmagic-logo-gear-v4-256.webp" alt="" class="cm-coach-logo">
        <div><h2>CrankMagic Coach</h2><p class="cm-muted" id="cm-coach-context">${e(coachContext())}</p></div>
        <details class="cm-coach-more"><summary aria-label="More">⋯</summary><div>${b("Clear chat", "board-coach-clear")}</div></details>
        <button type="button" class="v-button compact" data-action="board-coach" aria-label="Close the Coach">✕</button></header>
      <ol class="cm-coach-thread" aria-live="polite">${coach.thread.map(bubble).join("") || `<li class="cm-coach-empty cm-muted">Ask about your board, your hand, or the table.</li>`}
        ${coach.typing ? `<li class="cm-coach-msg is-coach is-typing" aria-label="The Coach is typing"><img class="cm-coach-avatar" src="assets/crankmagic/crankmagic-logo-gear-v4-256.webp" alt=""><p><i></i><i></i><i></i></p></li>` : ""}</ol>
      <div class="cm-coach-prompts">${COACH_PROMPTS.map((q) => `<button type="button" class="v-button compact" data-action="board-coach-ask" data-q="${e(q)}">${e(q)}</button>`).join("")}</div>
      <form class="cm-coach-compose" data-coach-form><textarea class="cm-coach-input" rows="1" placeholder="Ask the coach…" aria-label="Ask the coach"></textarea>
        <button type="submit" class="cm-coach-send" aria-label="Send">➤</button></form>`;
    const input = panel.querySelector(".cm-coach-input");
    input.value = typed;
    if (focused) input.focus();
    const thread = panel.querySelector(".cm-coach-thread");
    thread.scrollTop = thread.scrollHeight;
  }
  function ask(text) {
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
        <div class="cm-actions">${b("Back to the table", "board-leave", {}, true)}</div></div></div>`;
    }
    const gone = departed(view.seat);
    if (gone) return `<p class="cm-board-banner" role="status">You have left this game; the others play on.</p>`;
    return "";
  }
  /* A view arrives whenever anyone acts; the history's filter keeps its focus and caret through the redraw. */
  function draw() {
    const active = document.activeElement;
    const caret = active && active.matches && active.matches("[data-board-history-filter]") ? active.selectionStart : null;
    render();
    const context = document.getElementById("cm-coach-context");
    if (context && view) context.textContent = coachContext();
    if (caret === null) return;
    const filter = document.querySelector("#cm-board [data-board-history-filter]");
    if (filter) {filter.focus(); filter.setSelectionRange(caret, caret);}
  }
  function render() {
    const host = document.getElementById("cm-board");
    if (!host) return;
    if (!view) {host.innerHTML = `<p class="cm-board-loading" role="status">${status === "reconnecting" ? "Reconnecting to the table…" : "Opening the board…"}</p>`; return;}
    if (phone()) {
      host.dataset.view = "focus";
      host.dataset.phone = innerHeight > innerWidth ? "portrait" : "landscape";
      host.innerHTML = `${phoneView()}${showHand()}${banner()}`;
      return;
    }
    delete host.dataset.phone;
    host.dataset.view = mode;
    if (mode === "full") {host.innerHTML = `${fullView()}${showHand()}${banner()}`; return;}
    if (mode === "table") {host.innerHTML = `${strip()}${tableView()}<div class="cm-board-under">${stack()}${decision()}</div>${hand()}${showHand()}${banner()}`; return;}
    const p = players()[focus] || players()[view.seat];
    host.innerHTML = `${strip()}<div class="cm-board-body"><nav class="cm-board-pane" aria-label="Boards">${players().map(tile).join("")}
      <button type="button" class="cm-board-coach-open" data-action="board-coach" aria-pressed="${coach.open}">✦ CrankMagic Coach</button></nav>
      <div class="cm-board-main">${mat(p)}${stack()}${decision()}</div></div>${hand()}${showHand()}${banner()}`;
  }

  /* ---- what the lobby hands over ---- */
  C.board = {
    /** The table is playing (or just finished): draw the board in the page, and keep the socket open. */
    show(t) {
      if (tableId !== t.tableId) {C.board.close(); tableId = t.tableId; view = null; focus = null; away.clear();}
      table = t;
      /* The table's list of who is away is the truth; the room's "away" frames only say it sooner. */
      const before = JSON.stringify([...away]);
      away.clear();
      for (const a of t.away || []) away.set(a.seatId, a.until);
      if (!document.getElementById("cm-board")) {
        C.main.innerHTML = `<div class="cm-board" id="cm-board" data-view="${mode}"></div><aside class="cm-board-coach" id="cm-board-coach" aria-label="CrankMagic Coach" hidden></aside>`;
        draw();
      } else if (JSON.stringify([...away]) !== before) draw();
      if (!socket && status !== "reconnecting") connect();
    },
    /** Whether the board is what this table's page should show. */
    wants(t) {return t.phase === "playing" || (t.tableId === tableId && !!view);},
    close() {disconnect(); tableId = null; view = null; table = null; tools = false; confirmEnd = false; selected = null; showing = null; held = null; historyOpen = false; historyFilter = ""; coach.open = false; coach.thread = []; coach.typing = false; clearTimeout(coach.timer); peek(null); leaveFullscreen();},
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
    /* Full screen shows a card large at the side, with what can be done with it, before anything is done. */
    if (mode === "full") {selected = Number(el.dataset.card); draw(); return;}
    if (!view.decision || sending) return;
    const opts = optionsFor(Number(el.dataset.card));
    if (opts.length === 1) return option(opts[0].index);
    if (opts.length > 1) {document.getElementById("cm-board-decision")?.scrollIntoView({block: "nearest"}); C.notice(`${opts.length} things can be done with this card; choose one.`);}
  };
  actions["board-pass"] = () => {
    const d = view && view.decision;
    if (!d || d.kind !== "priority") return;
    const pass = d.options.find((o) => o.label === "Pass priority");
    if (pass) send({indices: [pass.index]});
  };
  actions["board-confirm"] = () => {
    const d = view.decision;
    if (!d) return;
    if (d.mode === "ack") return send({indices: []});
    if (d.mode === "damage" || d.mode === "amount") return send({amounts: d.options.map((_, i) => Number(amounts[i]) || 0)});
    send({indices: picked});
  };
  actions["board-reset"] = () => {picked = []; draw();};
  actions["board-focus"] = (el) => {focus = Number(el.dataset.seat); if (mode !== "focus" && !phone()) setMode("focus"); else draw();};
  actions["board-rotate"] = (el) => {
    const n = players().length;
    if (!n) return;
    focus = ((focus ?? view.seat) + Number(el.dataset.by) + n) % n;
    draw();
  };
  let lastPhone = null;
  addEventListener("resize", () => {
    if (!document.getElementById("cm-board") || !view) return;
    const now = phone() ? (innerHeight > innerWidth ? "portrait" : "landscape") : "no";
    if (now !== lastPhone) {lastPhone = now; draw();}
  });
  actions["board-vitals"] = () => {if (view) tableVitals();};
  actions["board-view"] = (el) => setMode(el.dataset.view);
  /* Full screen asks the browser for the whole screen as well, where it may; the view stands either way. */
  function setMode(next) {
    if (!VIEWS.some(([k]) => k === next)) return;
    mode = next; tools = false; confirmEnd = false;
    try {localStorage.setItem(VIEW_KEY, mode);} catch {}
    const host = document.getElementById("cm-board");
    if (mode === "full" && host && document.fullscreenEnabled && !document.fullscreenElement) host.requestFullscreen().catch(() => {});
    if (mode !== "full") leaveFullscreen();
    draw();
  }
  function leaveFullscreen() {if (document.fullscreenElement) document.exitFullscreen().catch(() => {});}

  /* Show hand and Card zoom. */
  actions["board-show-hand"] = () => {showing = showing ? null : "fan"; held = null; draw();};
  actions["board-hand-close"] = () => {showing = null; held = null; draw();};
  actions["board-hand-hold"] = (el) => {held = Number(el.dataset.card); showing = "held"; draw();};
  actions["board-hand-back"] = () => {held = null; showing = "fan"; draw();};
  actions["board-hand-do"] = (el) => {const index = Number(el.dataset.index); showing = null; held = null; option(index);};
  actions["board-zoom-do"] = (el) => {actions.close(); option(Number(el.dataset.index));};
  document.addEventListener("dblclick", (event) => {if (showing === "held" && event.target.closest && event.target.closest(".cm-hand-held")) actions["board-hand-back"]();});
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse" || !document.getElementById("cm-board")) return;
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (el && !el.closest(".cm-board-peek")) peek(el);
  });
  document.addEventListener("pointerout", (event) => {if (event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]")) peek(null);});
  document.addEventListener("contextmenu", (event) => {
    const el = event.target.closest && event.target.closest(".cm-board .cm-bcard[data-card]");
    if (!el || !view) return;
    event.preventDefault(); peek(null); zoom(Number(el.dataset.card));
  });
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
     (back a step: held, fanned, full screen), ⌘/Ctrl + and − (card size). */
  document.addEventListener("keydown", (event) => {
    if (!document.getElementById("cm-board") || !view || document.querySelector("#cm-dialog[open]")) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(tag);
    if (event.key === "Escape" && historyOpen) {historyOpen = false; draw(); return;}
    if (coach.open && event.target && event.target.matches && event.target.matches(".cm-coach-input") && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); event.target.form.requestSubmit(); return;
    }
    if (event.key === "Escape" && coach.open) {actions["board-coach"](); return;}
    if ((event.ctrlKey || event.metaKey) && ["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault();
      const n = C.setCardScale(C.cardScale() + (event.key === "-" || event.key === "_" ? -10 : 10));
      document.dispatchEvent(new CustomEvent("cm-card-scale", {detail: {scale: n, live: false}}));
      if (tools) draw();
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
      if (mode === "full") setMode("focus");
    }
  });
  actions["board-tools"] = () => {tools = !tools; confirmEnd = false; historyOpen = false; draw();};
  actions["board-coach"] = () => {coach.open = !coach.open; tools = false; historyOpen = false; draw(); drawCoach(); if (coach.open) document.querySelector("#cm-board-coach .cm-coach-input")?.focus();};
  actions["board-coach-ask"] = (el) => ask(el.dataset.q);
  actions["board-coach-clear"] = () => {coach.thread = []; coach.typing = false; clearTimeout(coach.timer); drawCoach();};
  document.addEventListener("submit", (event) => {
    if (!event.target.matches || !event.target.matches("[data-coach-form]")) return;
    event.preventDefault();
    const input = event.target.querySelector(".cm-coach-input"), q = input.value;
    input.value = ""; ask(q);
  });
  actions["board-history"] = () => {historyOpen = !historyOpen; tools = false; draw(); if (historyOpen) document.querySelector("#cm-board-history .cm-history-filter")?.focus();};
  actions["board-end"] = async (el) => {
    if (el.dataset.confirm !== "1") {confirmEnd = true; draw(); return;}
    confirmEnd = false; tools = false;
    await tableApi().api("POST", `${tableApi().tableUrl(tableId)}/end`);
    draw();   /* the room's own view, ended, follows on the socket */
  };
  actions["board-end-cancel"] = () => {confirmEnd = false; draw();};
  actions["board-concede"] = async () => {tools = false; await tableApi().api("POST", `${tableApi().tableUrl(tableId)}/concede`); draw();};
  actions["board-leave"] = async () => {const id = tableId; C.board.close(); await tableApi().refresh(id);};
  /* The filter hides and shows the rows where they are, so typing keeps its place. */
  document.addEventListener("input", (event) => {
    if (!event.target || !event.target.matches || !event.target.matches("[data-board-history-filter]")) return;
    historyFilter = event.target.value;
    const rows = event.target.closest(".cm-board-history").querySelectorAll(".cm-history-list li");
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
  /* A picture that does not come leaves the card's own frame, which already names it. */
  document.addEventListener("error", (event) => {const t = event.target; if (t && t.matches && t.matches(".cm-bcard img")) t.remove();}, true);
});
