/* THE CONNECTION PANEL (readiness plan C.2): who the table is waiting on, by name and reason.
 *
 * The countdown has always been gated on connection state -- countdownBlockers() in the table
 * contract says a seat that is not connected, has no validated deck or is not ready holds the
 * table -- but nothing ever showed that to a person. The host stared at a Start button that would
 * not light; a guest saw "Choosing a deck" on a seat whose owner had closed the laptop. The host's
 * /api/table/readiness and the guest's /table already carry the same readiness object (C.3), with
 * how long each human seat has been quiet. This module turns that object into one panel that the
 * host page, the guest page and the workshop lobby all draw the same way.
 *
 * Two functions, on purpose. describeReadiness() is arithmetic over the readiness object -- state
 * per seat, a headline, the launch stage -- and reads nothing from the browser, so a Node suite
 * holds it. renderConnectionPanel() turns that description into elements through an element
 * factory it is handed, so the suite can hand it a fake and check what would be drawn.
 */

const HEARTBEAT_MS = 2000;      /* a guest page heartbeats this often while it is open */
const QUIET_WARN_MS = 10000;    /* five missed heartbeats: the seat is going quiet */
const DISCONNECT_MS = 30000;    /* the broker marks a seat disconnected after this much silence */

const LAUNCH_SAYS = {
  "engine-spawning": "Starting the rules engine",
  "engine-spawned": "Rules engine started, loading cards",
  "waiting-for-engine": "Waiting for the rules engine",
  "bridge-green": "Rules engine connected",
  "seated": "Everyone is seated",
  "failed": "The engine failed to start",
};

/* "12 s", "2 min", "" under a second. Rounded to whole seconds so a panel redrawn every poll
   does not flicker through milliseconds. */
export function quietLabel(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 1000) return "";
  if (n < 60000) return `${Math.round(n / 1000)} s`;
  return `${Math.floor(n / 60000)} min`;
}

function seatName(seat, you) {
  if (you) return "You";
  return seat.name || `Seat ${seat.seatId + 1}`;
}

/* One seat's state, in the order the blockers are judged. `state` is a stable token for a CSS
   class and a test; `label` is what the reader sees; `detail` is the quiet time when it matters. */
function describeSeat(seat, {youSeatId, now}) {
  const you = seat.seatId === youSeatId;
  const quiet = Number.isFinite(Number(seat.quietForMs)) && seat.quietForMs !== null ? Number(seat.quietForMs) : null;
  const row = {seatId: seat.seatId, kind: seat.kind, name: seatName(seat, you), you, quietForMs: quiet, quietLabel: "",
    blocking: seat.blocking || null, warn: false, state: "", label: "", detail: ""};
  if (seat.kind === "ai") {
    row.state = seat.ready ? "ready" : "preparing";
    row.label = seat.ready ? "Ready" : "Preparing";
    return row;
  }
  if (!seat.claimed) {
    row.state = "empty";
    row.label = "Waiting for player";
    row.detail = "Invitation not opened yet";
    return row;
  }
  if (!seat.connected) {
    row.state = "offline";
    row.label = "Not connected";
    row.quietLabel = quietLabel(quiet);
    row.detail = row.quietLabel ? `Quiet for ${row.quietLabel}` : "Connection lost";
    return row;
  }
  if (!seat.deckValidated) { row.state = "choosing"; row.label = "Choosing a deck"; }
  else if (!seat.ready) { row.state = "unready"; row.label = "Deck chosen, not ready"; }
  else { row.state = "ready"; row.label = "Ready"; }
  if (quiet !== null && quiet >= QUIET_WARN_MS) {
    row.warn = true;
    row.quietLabel = quietLabel(quiet);
    row.detail = `Going quiet, ${row.quietLabel} since the last heartbeat`;
  }
  return row;
}

/* The whole panel as data. `readiness` is CrankMagicTableReadiness@1 (the broker's readiness()),
   optionally with `launch` from the runtime; `countdownAt` is the table's clock when the phase is
   countdown, so the headline can count. */
export function describeReadiness(readiness, options = {}) {
  const o = options || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const youSeatId = Number.isInteger(o.youSeatId) ? o.youSeatId : null;
  const r = readiness || {};
  const seats = Array.isArray(r.seats) ? r.seats : [];
  const rows = seats.map((seat) => describeSeat(seat, {youSeatId, now}));
  const tableReasons = Array.isArray(r.table) ? r.table.slice() : [];
  const waitingOn = rows.filter((row) => row.blocking).map((row) => row.name);
  const launch = r.launch && r.launch.stage ? {stage: r.launch.stage, label: LAUNCH_SAYS[r.launch.stage] || r.launch.stage,
    reason: r.launch.reason || r.launch.error || ""} : null;
  const phase = r.phase || "selecting";
  let headline = "";
  let tone = "waiting";
  if (phase === "countdown") {
    const seconds = Number.isFinite(o.countdownAt) ? Math.max(0, Math.ceil((o.countdownAt - now) / 1000)) : null;
    headline = seconds === null ? "Starting" : `Starting in ${seconds}`;
    tone = "starting";
  } else if (phase === "starting") {
    headline = launch ? launch.label : "Starting the game";
    tone = launch && launch.stage === "failed" ? "failed" : "starting";
  } else if (phase === "playing") { headline = "The game is on."; tone = "ok"; }
  else if (phase === "rematch") { headline = "Deciding on another game."; tone = "waiting"; }
  else if (r.ok) { headline = "Everyone is ready."; tone = "ok"; }
  else if (tableReasons.length) { headline = tableReasons.join(". ") + "."; }
  else if (waitingOn.length) {
    const named = rows.filter((row) => row.blocking).map((row) => `${row.name} (${row.blocking})`);
    headline = `Waiting on ${named.join(", ")}.`;
  } else headline = "Waiting.";
  return {phase, ok: !!r.ok, tone, headline, tableReasons, rows, waitingOn, launch,
    quietWarnMs: QUIET_WARN_MS, disconnectMs: DISCONNECT_MS, heartbeatMs: HEARTBEAT_MS};
}

/* Elements, through a factory: el(tag, className, text) -> node with append(). The browser hands
   in document.createElement; the suite hands in a fake and reads the tree back. */
export function renderConnectionPanel(readiness, options = {}) {
  const el = typeof options.el === "function" ? options.el
    : (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  const d = describeReadiness(readiness, options);
  const panel = el("section", `connection-panel is-${d.tone}`);
  const title = d.tone === "ok" ? "Everyone is here" : d.tone === "starting" ? "Starting the game"
    : d.tone === "failed" ? "The game did not start" : "Who we are waiting on";
  panel.append(el("h2", "connection-title", title));
  panel.append(el("p", "connection-headline", d.headline));
  const list = el("ul", "connection-seats");
  for (const row of d.rows) {
    const item = el("li", `connection-seat is-${row.state}${row.you ? " is-you" : ""}${row.blocking ? " is-blocking" : ""}${row.warn ? " is-quiet" : ""}`);
    item.append(el("strong", "connection-name", row.name));
    item.append(el("span", "connection-kind", row.kind === "ai" ? "AI" : "Human"));
    item.append(el("span", "connection-state", row.label));
    if (row.detail) item.append(el("small", "connection-detail", row.detail));
    list.append(item);
  }
  panel.append(list);
  if (d.launch) panel.append(el("p", `connection-launch is-${d.launch.stage}`, d.launch.reason ? `${d.launch.label}: ${d.launch.reason}` : d.launch.label));
  return panel;
}
