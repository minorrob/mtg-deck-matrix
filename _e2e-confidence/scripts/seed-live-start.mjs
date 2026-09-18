import http from "http";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { randomUUID } from "crypto";

const root = "C:/Users/robmi/OneDrive/Documents/My Games/MtG/work/commander-phase-c";
const PKG = root + "/_e2e-confidence";
const OUT = path.join(PKG, "out");
fs.mkdirSync(OUT, { recursive: true });
const Ws = createRequire(PKG + "/scripts/raw-matrix-a.mjs")(path.join(PKG, "lib/ws"));
const BASIC = /^(plains|island|swamp|mountain|forest|wastes)$/i;

function seatFromLive(state, deckId, name) {
  const d = Object.values(state.decks).find((x) => x.id === deckId);
  if (!d) throw new Error("no deck " + deckId);
  const nameOf = (cardId) => (state.cards[cardId] && state.cards[cardId].name) || "";
  const commanders = (d.commanders || []).map(nameOf).filter(Boolean).map((n) => ({ name: n }));
  const cmdSet = new Set(commanders.map((c) => c.name.toLowerCase()));
  const cards = [];
  for (const slot of d.slots || []) {
    if (slot.purpose && slot.purpose !== "main") continue;
    const n = nameOf(slot.cardId);
    if (!n || cmdSet.has(n.toLowerCase())) continue;
    const qty = Number(slot.quantity) || 1;
    const existing = cards.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) existing.quantity += qty;
    else cards.push({ name: n, quantity: qty, basic: BASIC.test(n) });
  }
  const size = commanders.length + cards.reduce((a, c) => a + c.quantity, 0);
  if (size !== 100) throw new Error(deckId + " size " + size);
  return { kind: "library", deckId, name, commanders, cards };
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const c = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => {
        const text = Buffer.concat(c).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
        resolve({ status: res.statusCode, json, text });
      });
    }).on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = JSON.parse(fs.readFileSync(root + "/data/live-state.json", "utf8")).payload.state;
const plan = [
  { id: "deck:live:D2", name: "Rob" },
  { id: "deck:live:D6", name: "Krenko" },
  { id: "deck:live:D3", name: "Atraxa" },
  { id: "deck:live:D5", name: "Shadrix" },
];
const seats = plan.map((p) => {
  const seat = seatFromLive(state, p.id, p.name);
  console.log(p.id, seat.commanders[0].name, "cards", seat.cards.length);
  return seat;
});

const lobby = {
  bracket: 3,
  cap: "",
  host: { seat: seats[0], ready: true },
  hostBuildDef: null,
  opponents: seats.slice(1).map((seat) => ({
    role: "ai", ready: true, seat, guestName: "", guestEmail: "", inviteId: randomUUID(),
  })),
  rulesConfirmed: { bracket: 3, cap: "" },
};

const report = { at: new Date().toISOString(), mode: "seed-live-start-v2", seats: plan, steps: [], notices: [], live: null };
const list = (await httpJson("http://127.0.0.1:9222/json/list")).json;
const page = list.find((t) => t.type === "page" && /8768/.test(t.url));
if (!page) throw new Error("no CDP page");
const ws = new Ws(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
let mid = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const m = JSON.parse(String(raw));
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++mid;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error("timeout " + method)); } }, 180000);
});
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) {
    const ex = r.exceptionDetails.exception;
    throw new Error((ex && (ex.description || ex.value)) || r.exceptionDetails.text || "eval fail");
  }
  return r.result?.value;
};
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: "http://127.0.0.1:8768/app/#game" });
await sleep(2500);
await evaluate(`(() => { localStorage.setItem('cm-lobby', ${JSON.stringify(JSON.stringify(lobby))}); location.hash='game'; location.reload(); return true; })()`);
await sleep(4500);

const after = await evaluate(`(() => {
  const lob = JSON.parse(localStorage.getItem('cm-lobby') || 'null');
  const L = window.CrankLobby;
  let table = null;
  try {
    const seats = [];
    if (lob.host && lob.host.seat) seats.push(Object.assign({}, lob.host.seat, { you: true, ready: !!lob.host.ready }));
    (lob.opponents || []).forEach((o) => { if (o && o.role !== 'unused' && o.seat) seats.push(Object.assign({}, o.seat, { you: false, ready: !!o.ready, role: o.role })); });
    table = L.table({ bracket: lob.bracket, gameChangers: lob.cap === '' ? undefined : lob.cap, seats, seed: '', fixedSeating: false });
  } catch (e) { table = { err: String(e && e.message || e) }; }
  const start = document.querySelector('[data-action="lobby-start"]');
  return {
    tableReady: !!(table && table.ready),
    tableWhy: table && table.why,
    issues: table && table.checks && table.checks.map((c) => ({ name: c.name, ok: c.ok, issues: (c.issues || []).map((i) => i.code + ':' + i.why) })),
    start: start ? { text: (start.textContent || '').trim(), disabled: !!start.disabled } : null,
    pin: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).find((s) => /game\\.js/.test(s || '')),
  };
})()`);
report.steps.push({ afterSeed: after });
console.log("AFTER", JSON.stringify(after, null, 2));
if (!after.start) throw new Error("Start missing");
if (after.start.disabled) throw new Error("Start disabled: " + after.start.text + " / " + after.tableWhy);

const click = await evaluate(`(() => { const b = document.querySelector('[data-action="lobby-start"]'); b.click(); return { ok: true, text: (b.textContent || '').trim() }; })()`);
report.steps.push({ startClick: click });
console.log("CLICK", click);

let live = null;
const deadline = Date.now() + 240000;
while (Date.now() < deadline) {
  const notices = await evaluate(`([...document.querySelectorAll('#cm-notice,.cm-toast,[role=status],.cm-notice')].map((n) => (n.textContent || '').trim()).filter(Boolean).slice(0, 12))`);
  report.notices = notices;
  live = (await httpJson("http://127.0.0.1:8768/api/live")).json;
  report.live = live;
  console.log(new Date().toISOString(), "status=", live && live.status, "notices=", notices);
  if (notices.some((t) => /This lobby is G0|lobby is G0/i.test(t))) { report.g0 = true; break; }
  const st = live && live.status;
  if (st === "ready" || st === "playing" || st === "starting") break;
  if (st === "error" || st === "failed" || st === "incomplete" || (live && live.error)) break;
  if (notices.some((t) => /exceeds|Missing prices|prepare failed|Start failed|cannot sit|error/i.test(t))) break;
  await sleep(2000);
}

let verdict;
if (report.g0) verdict = "FAIL blocker:G0_STUB";
else if (live && (live.status === "ready" || live.status === "playing")) verdict = "PASS CONFIDENT — /api/live status=" + live.status;
else if (live && live.status === "starting") verdict = "PASS PARTIAL — /api/live status=starting";
else verdict = "FAIL — status=" + (live && live.status) + " notices=" + JSON.stringify(report.notices) + " err=" + (live && (live.error || live.message));

const runDir = path.join(OUT, "matrix-A-seed-" + Date.now());
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(runDir, "VERDICT.txt"), verdict + "\n");
fs.writeFileSync(path.join(OUT, "VERDICT-LATEST.txt"), verdict + "\n\n" + JSON.stringify(report, null, 2) + "\n");
console.log("\n==== VERDICT ====\n" + verdict);
ws.close();
process.exit(/PASS/.test(verdict) ? 0 : 2);