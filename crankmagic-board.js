/* PLAY IN THE CLOUD: THE BOARD (M5; the handoff's README, "Wireframes v2", the Focus view).
 *
 * While a table's game is on, the lobby (crankmagic-table.js) hands the page to this board. It holds one
 * WebSocket to the table (/api/tables/<id>/connect) and draws whatever view the room last sent: that seat's own
 * projection, never another's (game/room/room.mjs, view), and the decision it is being asked, if any. What a
 * person does goes back as the §12.1 action envelope -- {actionId, revision, kind:"answer", choiceId, ...} --
 * and the room answers with a receipt, a fresh view for everyone, or a refusal carrying the view to redraw.
 *
 *   the strip     Turn · the step · Next · Pass priority · Tools (End game, two taps; Concede)
 *   the pane      every seat as a tile with its vitals; a tile puts that seat's board on the mat
 *   the mat       the battlefield in groups over the lands; Command and Exile, Library and Graveyard as piles
 *   the hand      your own, docked over the mat's foot; bright = something you can do with it now
 *   the decision  whatever the room is asking you, in any mode the engine asks in
 *
 * Views arrive in order with the controller's revision; an older one is ignored. A dropped socket is
 * reopened, backing off to ten seconds, and the room sends the view again the moment it is back.
 *
 * Still to come on this board (the handoff's list): the Table and Full screen views, Table vitals, the
 * card-size slider in Tools, Show hand, Card zoom, History, the Coach, and phones.
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

  let tableId = null, table = null, view = null, socket = null, status = "idle", retry = 0, retryTimer = null;
  let focus = null, picked = [], amounts = [], sending = false, tools = false, confirmEnd = false, closedByUs = false;
  const away = new Map();   /* seat number -> until, from the table and from the room's "away" frames */
  const dismissed = new Set();   /* tables whose finished game this page has already put away */

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
  function vitals(p, big = false) {
    const h = p.health, from = Object.entries(h.commanderDamage || {}).map(([id, n]) => ({seat: commanderSeat(id), n}));
    const danger = h.life <= 10 || h.poison >= 7 || from.some((f) => f.n >= 15);
    const bars = from.map((f) => `<i class="cm-vitals-bar" style="--fill:${Math.min(1, f.n / 21)};--seat:${SEAT_COLORS[f.seat ?? 0]}" title="${e(f.seat === null ? "A commander" : nameOf(f.seat))}: ${f.n} of 21"></i>`).join("");
    return `<span class="cm-vitals${big ? " is-big" : ""}${danger ? " is-danger" : ""}" aria-label="${h.life} life, ${h.poison} poison"><b>${h.life}</b><span class="cm-vitals-poison">☠ ${h.poison}</span>${bars}</span>`;
  }

  /* A card's picture: the library's own record when it has one by that name, else Scryfall by name. When the
     picture does not come, the frame's own name and numbers are the card. */
  let pictures = null;
  function pictureOf(name) {
    if (!pictures) {pictures = new Map(); for (const c of C.cards()) if (c.image && !pictures.has(c.name)) pictures.set(c.name, c.image);}
    return pictures.get(name) || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
  }
  const optionsFor = (cardId) => (view.decision ? view.decision.options.filter((o) => o.cardId === cardId) : []);
  function card(c, {where = "mat"} = {}) {
    if (!c.name) return `<div class="cm-bcard is-back" aria-label="A hidden card"></div>`;
    const opts = optionsFor(c.cardId), mine = view.decision && !sending;
    const bright = mine && opts.length > 0, chosen = opts.some((o) => picked.includes(o.index));
    const creature = c.types.includes("Creature") && c.power !== null;
    const cls = ["cm-bcard", c.tapped ? "is-tapped" : "", bright ? "is-bright" : "", chosen ? "is-picked" : "", where === "hand" && mine && !bright ? "is-dim" : ""].filter(Boolean).join(" ");
    const marks = [c.damage ? `<span class="cm-bcard-mark">${c.damage} damage</span>` : "", ...Object.entries(c.counters || {}).map(([k, n]) => `<span class="cm-bcard-mark">${n} ${e(k)}</span>`)].join("");
    const label = `${c.name}${c.tapped ? ", tapped" : ""}${bright ? `: ${opts.map((o) => o.label).join(" or ")}` : ""}`;
    return `<button type="button" class="${cls}" data-action="board-card" data-card="${c.cardId}" aria-label="${e(label)}"${bright ? "" : ' aria-disabled="true"'}>
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
      <span class="cm-board-tools">${b("Tools ▾", "board-tools", {}, false, {cls: "compact"})}${tools ? toolsMenu() : ""}</span>
    </header>`;
  }
  function toolsMenu() {
    const over = view.status === "finished", left = !!departed(view.seat);
    const end = confirmEnd
      ? `${b("End for everyone · keep the record", "board-end", {confirm: "1"}, true)}${b("Keep playing", "board-end-cancel")}`
      : b("End game", "board-end", {}, false, {disabled: over});
    return `<div class="cm-board-menu" role="menu" id="cm-board-tools">
      <p class="cm-muted">End game stops it for everyone and keeps its record. Concede leaves it to the others.</p>
      <div class="cm-actions">${end}${b("Concede", "board-concede", {}, false, {disabled: over || left})}</div></div>`;
  }
  function tile(p) {
    const i = p.playerId, active = view.state.turnPlayerId === i, deciding = view.waitingOn === `s${i}`;
    const commander = p.zones.Command.cards.concat(p.zones.Battlefield.cards).find((c) => c.commander);
    const gone = departed(i), dropped = away.get(i);
    const flag = gone ? (gone === "timed-out" ? "Timed out · not finished" : "Conceded")
      : p.health.status === "lost" ? "Out of the game"
      : dropped ? `Dropped · back by ${new Date(dropped).toLocaleTimeString("en-US", {hour: "numeric", minute: "2-digit"})}`
      : deciding ? "Deciding" : active ? "● Active" : "";
    return `<button type="button" class="cm-board-tile${focus === i ? " is-focus" : ""}${i === view.seat ? " is-you" : ""}" data-action="board-focus" data-seat="${i}" aria-pressed="${focus === i}">
      <span class="cm-board-tile-name">${e(i === view.seat ? `You · ${p.name}` : p.name)}</span>
      <span class="cm-muted">${e(commander ? commander.name : "")}</span>
      ${vitals(p)}<span class="cm-board-tile-flag">${e(flag)}</span></button>`;
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
          ${pile("Library", p.zones.Library, null)}${pile("Graveyard", p.zones.Graveyard, p.zones.Graveyard.cards.at(-1))}</div>
      </div>
      ${you ? "" : `<p class="cm-board-their-hand">${e(p.name)}'s hand · ${p.zones.Hand.count}</p>`}
    </section>`;
  }
  function stack() {
    const items = view.state.stack;
    if (!items.length) return "";
    return `<section class="cm-board-stack" aria-label="The stack"><h3>On the stack · ${items.length}</h3><ol>${[...items].reverse().map((s) => `<li>${e(s.name || "A face-down spell")} <span class="cm-muted">${e(nameOf(s.playerId))}</span></li>`).join("")}</ol></section>`;
  }

  /* THE DECISION, IN WHATEVER MODE IT COMES. A one-of answers on the tap; a many-of or an order collects,
     then Confirm; damage is shared out by number. The rules on each (how many, which may not repeat) are the
     room's; the board only keeps Confirm off until they can be met, and the room says no if they are not. */
  function decision() {
    const d = view.decision;
    if (!d || view.status === "finished") return "";
    const opt = (o, extra = "") => `<button type="button" class="v-button compact${picked.includes(o.index) ? " is-picked" : ""}" data-action="board-option" data-index="${o.index}"${sending ? " disabled" : ""}${extra}>${e(o.label)}</button>`;
    let body = "", foot = "";
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
    return `<section class="cm-board-hand" aria-label="Your hand"><h3>Hand · ${cards.length}${view.decision ? ` <span class="cm-muted">Bright = you can use it now</span>` : ""}</h3>
      <div class="cm-board-hand-cards">${cards.map((c) => card(c, {where: "hand"})).join("")}</div></section>`;
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
  function draw() {
    const host = document.getElementById("cm-board");
    if (!host) return;
    if (!view) {host.innerHTML = `<p class="cm-board-loading" role="status">${status === "reconnecting" ? "Reconnecting to the table…" : "Opening the board…"}</p>`; return;}
    const p = players()[focus] || players()[view.seat];
    host.innerHTML = `${strip()}<div class="cm-board-body"><nav class="cm-board-pane" aria-label="Boards">${players().map(tile).join("")}</nav>
      <div class="cm-board-main">${mat(p)}${stack()}${decision()}</div></div>${hand()}${banner()}`;
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
        C.main.innerHTML = `<div class="cm-board" id="cm-board" data-view="focus"></div>`;
        draw();
      } else if (JSON.stringify([...away]) !== before) draw();
      if (!socket && status !== "reconnecting") connect();
    },
    /** Whether the board is what this table's page should show. */
    wants(t) {return t.phase === "playing" || (t.tableId === tableId && !!view && !dismissed.has(t.tableId));},
    close() {disconnect(); tableId = null; view = null; table = null; tools = false; confirmEnd = false;},
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
    if (!view || !view.decision || sending) return;
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
  actions["board-focus"] = (el) => {focus = Number(el.dataset.seat); draw();};
  actions["board-tools"] = () => {tools = !tools; confirmEnd = false; draw();};
  actions["board-end"] = async (el) => {
    if (el.dataset.confirm !== "1") {confirmEnd = true; draw(); return;}
    confirmEnd = false; tools = false;
    await tableApi().api("POST", `${tableApi().tableUrl(tableId)}/end`);
    draw();   /* the room's own view, ended, follows on the socket */
  };
  actions["board-end-cancel"] = () => {confirmEnd = false; draw();};
  actions["board-concede"] = async () => {tools = false; await tableApi().api("POST", `${tableApi().tableUrl(tableId)}/concede`); draw();};
  actions["board-leave"] = async () => {const id = tableId; dismissed.add(id); C.board.close(); await tableApi().refresh(id);};
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
