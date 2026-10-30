/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LOUNGE, THE NEW GAME POP-UP AND THE LOBBY'S TOUR (Rob, 2026-10-28; the Claude Design screens "New game pop-up" and
 * "Lobby with walkthrough"). Play in the cloud (crankmagic-table.js) draws the Pre-lobby and the lobby; this file holds what
 * they share and what is new:
 *
 *   C.lounge.PERSONAS, DIFFICULTY   the four AI personalities and four difficulties, with the words their hover panels say
 *   C.lounge.newGame(options)       the pop-up that replaces the New table page: Human players 1 to 4 (a CrankMagic user
 *                                   found by name, or a new user by name and email), AI players with a name, a difficulty and
 *                                   a personality each, the game's rules and its privacy; Submit makes the table and opens the lobby
 *   C.lounge.tour(table)            the lobby's ten-step walkthrough (the organizer's; a guest's has the steps a guest can take)
 *
 * It reaches the table's own helpers through C.tableTools (crankmagic-table.js), which is loaded before it. Nothing here
 * claims a seat or reads a table on its own.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {esc: e, actions} = C;

  /* THE PERSONALITIES (the design's four seeds; the engine's roster, docs/ai-players/PLAN-2026-10-26.html, names the same
     four). `summary` is the line on a seat in the lobby; `blurb`, `plays` and `dials` are the pop-up's hover panel. */
  const PERSONAS = {
    sable: {id: "sable", name: "Sable", tag: "The salty one", summary: "Plays the table like a grudge. Salty, relentless, remembers who hit her last.",
      blurb: "Plays the table like a grudge. Salty, relentless, remembers who hit her last.", plays: "Brings stax and lock pieces. Whoever hit her last moves up her target list.", dials: "Salt +3 · Friendly −2 · Competitive +2"},
    benny: {id: "benny", name: "Benny", tag: "The group hug", summary: "Shares the wealth with symmetrical draw and mana. Removes only real threats.",
      blurb: "Shares the wealth. Symmetrical draw and mana for the whole table.", plays: "Removes only real threats and attacks only the top threat, when it counts.", dials: "Salt −2 · Friendly +2 · Competitive −1"},
    marcus: {id: "marcus", name: "Marcus", tag: "The competitor", summary: "Plays to win and pushes tempo. Keeps few blockers home and leans on his combo.",
      blurb: "Plays to win and pushes tempo every turn.", plays: "Keeps few blockers home, leans on his combo, mulligans for a combo hand.", dials: "Salt +1 · Friendly 0 · Competitive +2"},
    june: {id: "june", name: "June", tag: "The casual", summary: "Here for a good game. Friendly, theme-first, takes the fun line now and then.",
      blurb: "Here for a good game. Friendly and theme-first.", plays: "Takes the fun line now and then and rarely piles on.", dials: "Salt −1 · Friendly +1 · Competitive −1"},
  };
  const PERSONA_ORDER = ["sable", "benny", "marcus", "june"];
  /* A difficulty is a word for the person and a `level` for the table: Veteran is the AI on Claude (llm). */
  const DIFFICULTY = [
    {id: "Easy", level: "easy", blurb: "Plays the turn in front of it. Usually right, sometimes second-best."},
    {id: "Normal", level: "normal", blurb: "Weighs the whole game lightly and breaks a combo it can see."},
    {id: "Hard", level: "hard", blurb: "Reads every threat, aims each attacker, keeps the blockers it needs."},
    {id: "Veteran", level: "llm", blurb: "Hard's reads, judged by an AI model at the big moments.", gated: true},
  ];
  const levelWord = (level) => (DIFFICULTY.find((d) => d.level === level) || DIFFICULTY[1]).id;
  const AI_SUP = '<sup class="cm-ai" aria-hidden="true">ai</sup>';
  const CARET = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>';
  const CHECK = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"></path></svg>';
  const SEARCH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5 14 14"></path></svg>';
  const tools = () => C.tableTools;
  const avatar = (p, cls = "") => `<span class="cm-ng-face ${cls}" aria-hidden="true">${e(p.name.charAt(0))}</span>`;

  C.lounge = {PERSONAS, PERSONA_ORDER, DIFFICULTY, levelWord, AI_SUP};

  /* ---- the New game pop-up ---- */
  const HOST_KEY = "cm-table-setup";
  const savedHost = () => {
    try {const last = JSON.parse(localStorage.getItem(HOST_KEY) || "null"); if (last && last.owner === (C.signedInAs?.() || null) && typeof last.hostName === "string") return last.hostName;} catch {/* none */}
    return "";
  };
  const emailOk = (v) => /.+@.+\..+/.test(String(v || "").trim());

  function newGame({deckId = null, ai = false} = {}) {
    const admin = C.adminAllowed?.() === true;
    const st = {
      observe: false, humans: 1, ai: ai ? 1 : 3, privacy: "Private", life: "40", bracket: "Any", house: false, hostName: savedHost(), hostEditing: !savedHost(), busy: false, error: "",
      canVeteran: false, levels: ["easy", "normal"], searchKnown: true,
      hRows: [0, 1, 2].map(() => ({kind: "cm", query: "", picked: "", open: false, name: "", email: "", group: "insider", results: []})),
      aRows: PERSONA_ORDER.map((p) => ({persona: p, difficulty: "Normal", name: "", touched: false, menu: null, hover: null})),
    };
    if (ai) st.aRows[0].persona = "sable";
    /* PLAY THIS DECK (AI-5): the deck you came with goes to your seat once the table is made, only if the table can play every card of it. */
    const bringing = deckId ? tools().libraryDecks().find((d) => d.id === deckId) : null;
    if (bringing) {
      st.bring = {name: bringing.name, drop: false, note: ""};
      tools().readiness(bringing).then((r) => {
        if (r.count) st.bring = {name: bringing.name, drop: true, note: `cannot be played at the table yet: ${r.count} of its cards ${r.count === 1 ? "is" : "are"} not in the rules engine (${r.unknown.slice(0, 4).join(", ")}${r.unknown.length > 4 ? ", …" : ""}). Choose a deck at the table.`};
        else {
          /* Seated before a game that has not begun, the deck can go to that seat instead of a new table (AI-5). */
          const kept = tools().seatKept();
          if (kept) tools().api("GET", `/api/tables/${encodeURIComponent(kept)}`).then(({table}) => {
            const mine = table.seats.find((x) => x && x.you);
            if (mine && ["selecting", "countdown"].includes(table.phase)) {st.bringThere = {tableId: table.tableId, seatId: mine.seatId, host: table.youAreHost ? "your" : `${(table.seats[0] || {}).name || "the host"}'s`}; if (layer) render();}
          }).catch(() => {});
        }
        if (layer) render();
      }).catch(() => {});
    }
    /* Who may seat a Veteran, and which levels this server plays, are asked once (GET /api/ai-seat). */
    tools().api("GET", "/api/ai-seat").then((answer) => {
      st.canVeteran = answer?.open === true;
      if (Array.isArray(answer?.levels)) st.levels = answer.levels;
      if (layer) render();
    }).catch(() => {});

    let layer = null, searchTimer = null;
    const opener = document.activeElement;
    const close = () => {
      layer?.remove(); layer = null; clearTimeout(searchTimer);
      if (opener && opener !== document.body && document.contains(opener)) opener.focus?.({preventScroll: true});
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("hashchange", close);
    };
    const onKey = (event) => {
      /* aria-modal says the page behind is out of reach, so Tab stays inside the window. */
      if (event.key === "Tab" && layer) {
        const live = [...layer.querySelectorAll("button:not([disabled]),input,select,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
        if (!live.length) return;
        const first = live[0], last = live[live.length - 1];
        if (!layer.contains(document.activeElement)) {event.preventDefault(); first.focus();}
        else if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
        return;
      }
      if (event.key !== "Escape" || !layer) return;
      event.stopPropagation();
      if (st.aRows.some((r) => r.menu) || st.hRows.some((r) => r.open)) {st.aRows.forEach((r) => {r.menu = null; r.hover = null;}); st.hRows.forEach((r) => {r.open = false;}); render(); return;}
      close();
    };
    const levelOpen = (d) => !d.gated ? st.levels.includes(d.level) : st.canVeteran;
    const minAi = () => st.observe ? 2 : Math.max(0, 2 - st.humans);
    const maxAi = () => 4 - (st.observe ? 0 : st.humans);
    const humansNow = () => st.observe ? 0 : st.humans;
    const problems = () => {
      const out = [], humans = humansNow();
      if (!st.observe && !st.hostName.trim()) out.push("Give your name at the table");
      for (let i = 0; i < humans - 1; i++) {
        const r = st.hRows[i], seat = i + 2;
        if (r.kind === "cm" && !r.picked) out.push(`Seat ${seat} needs a player`);
        if (r.kind === "new" && (!r.name.trim() || !emailOk(r.email))) out.push(`Seat ${seat} needs a name and email`);
      }
      for (let i = 0; i < st.ai; i++) {
        const r = st.aRows[i], seat = humans + i + 1;
        if (!(r.touched ? r.name : PERSONAS[r.persona].name).trim()) out.push(`Seat ${seat} AI needs a name`);
      }
      const life = Number(st.life);
      if (!(Number.isInteger(life) && life >= 1 && life <= 999)) out.push("Starting life must be 1 to 999");
      if (humans + st.ai < 2 || humans + st.ai > 4) out.push("A table seats two to four");
      return out;
    };

    const chip = (n, on, disabled, key) => `<button type="button" role="radio" class="cm-ng-chip${on ? " is-on" : ""}" aria-checked="${on}" data-ng="${key}" data-n="${n}"${disabled ? " disabled" : ""}>${n}</button>`;
    const humanRow = (r, i) => {
      const seat = i + 2;
      const kind = `<label class="cm-ng-cell"><span class="cm-pl-sr">Seat ${seat} player type</span><select data-ng-field="kind" data-row="${i}"><option value="cm"${r.kind === "cm" ? " selected" : ""}>CrankMagic user</option><option value="new"${r.kind === "new" ? " selected" : ""}>New user</option></select></label>`;
      let rest;
      if (r.kind === "cm") {
        const list = r.open && !r.picked ? `<div class="cm-ng-list" role="listbox">${r.results.map((m, k) => `<button type="button" role="option" class="cm-ng-opt" data-ng="pick-user" data-row="${i}" data-k="${k}"><span class="cm-ng-face is-user" aria-hidden="true">${e(m.name.charAt(0))}</span><span class="cm-ng-two"><b>${e(m.name)}</b><span>${e(m.handle || "")}</span></span></button>`).join("")}${r.results.length ? "" : `<p class="cm-ng-note">${st.searchKnown ? "No registered player by that name. Choose New user to invite them by email." : "User search is not open on this server yet; the name is used as you type it."}</p>`}</div>` : "";
        rest = `<div class="cm-ng-combo"><label class="cm-ng-cell"><span class="cm-pl-sr">Find a CrankMagic user for seat ${seat}</span><input role="combobox" aria-expanded="${r.open}" aria-autocomplete="list" data-ng-field="query" data-row="${i}" data-focus="q${i}" autocomplete="off" value="${e(r.query)}" placeholder="Search registered players" class="${r.picked ? "is-picked" : ""}"></label><span class="cm-ng-mag">${SEARCH}</span>${list}</div>`;
      } else {
        rest = `<label class="cm-ng-cell"><span class="cm-pl-sr">Seat ${seat} name</span><input data-ng-field="name" data-row="${i}" data-focus="n${i}" value="${e(r.name)}" placeholder="Their name" maxlength="60"></label>
          <label class="cm-ng-cell"><span class="cm-pl-sr">Seat ${seat} email</span><input type="email" data-ng-field="email" data-row="${i}" data-focus="e${i}" value="${e(r.email)}" placeholder="Their email, for the invitation"></label>
          ${C.inviteAdmin?.() === true ? `<label class="cm-ng-cell cm-ng-group" style="grid-column:2 / -1"><span class="cm-pl-sr">Seat ${seat} group</span><select data-ng-field="group" data-row="${i}"><option value="insider"${r.group === "insider" ? " selected" : ""}>Game Theory Insider · AI</option><option value="general"${r.group === "general" ? " selected" : ""}>General · no AI</option></select></label>` : ""}`;
      }
      return `<div class="cm-ng-row is-human"><span class="cm-ng-seat">Seat ${seat}</span>${kind}${rest}</div>`;
    };
    const aiRow = (r, i, humans) => {
      const seat = humans + i + 1, p = PERSONAS[r.persona];
      const diffPeek = DIFFICULTY.find((d) => d.id === (r.menu === "diff" && r.hover ? r.hover : r.difficulty));
      const persPeek = PERSONAS[r.menu === "pers" && r.hover ? r.hover : r.persona];
      const diffMenu = r.menu === "diff" ? `<div class="cm-ng-pop is-diff"><div role="listbox" aria-label="Difficulty" class="cm-ng-poplist">${DIFFICULTY.map((d) => {
        const dis = !levelOpen(d), sel = d.id === r.difficulty;
        return `<button type="button" role="option" aria-selected="${sel}" class="cm-ng-opt${sel ? " is-sel" : ""}" data-ng="pick-diff" data-row="${i}" data-id="${d.id}" data-hover="${d.id}"${dis ? " disabled" : ""}><span>${d.id}</span>${sel ? CHECK : ""}</button>`;
      }).join("")}</div><div class="cm-ng-peek"><p><b>${diffPeek.id}</b></p><p>${e(diffPeek.blurb)}</p>${diffPeek.gated ? `<p class="cm-ng-gate">${st.canVeteran ? "Uses AI credits · Insiders and admin" : "Uses AI credits · Insiders and admin only"}</p>` : !levelOpen(diffPeek) ? '<p class="cm-ng-gate">Not open on this server yet</p>' : ""}</div></div>` : "";
      const persMenu = r.menu === "pers" ? `<div class="cm-ng-pop is-pers"><div role="listbox" aria-label="Personality" class="cm-ng-poplist">${PERSONA_ORDER.map((id) => {
        const o = PERSONAS[id], sel = id === r.persona;
        return `<button type="button" role="option" aria-selected="${sel}" class="cm-ng-opt is-pers${sel ? " is-sel" : ""}" data-ng="pick-pers" data-row="${i}" data-id="${id}" data-hover="${id}">${avatar(o, "is-small")}<span class="cm-ng-two"><b>${o.name}</b><span>${o.tag}</span></span></button>`;
      }).join("")}</div><div class="cm-ng-peek"><p><b>${persPeek.name}</b> <span>· ${persPeek.tag}</span></p><p>${e(persPeek.blurb)}</p><p class="cm-ng-muted">${e(persPeek.plays)}</p><p class="cm-ng-dials">${e(persPeek.dials)}</p></div></div>` : "";
      return `<div class="cm-ng-row is-ai"><span class="cm-ng-seat">Seat ${seat}</span>
        <label class="cm-ng-cell cm-ng-ainame"><span class="cm-pl-sr">Seat ${seat} AI name</span><input data-ng-field="ainame" data-row="${i}" data-focus="a${i}" value="${e(r.touched ? r.name : p.name)}" maxlength="40">${AI_SUP}</label>
        <div class="cm-ng-drop${r.menu === "diff" ? " is-open" : ""}"><button type="button" class="cm-ng-btn" aria-haspopup="listbox" aria-expanded="${r.menu === "diff"}" aria-label="Seat ${seat} difficulty: ${r.difficulty}" data-ng="toggle-diff" data-row="${i}"><b>${r.difficulty}</b>${CARET}</button>${diffMenu}</div>
        <div class="cm-ng-drop${r.menu === "pers" ? " is-open" : ""}"><button type="button" class="cm-ng-btn is-pers" aria-haspopup="listbox" aria-expanded="${r.menu === "pers"}" aria-label="Seat ${seat} personality: ${p.name}" data-ng="toggle-pers" data-row="${i}">${avatar(p)}<span class="cm-ng-clip"><b>${p.name}</b> <span>· ${p.tag}</span></span>${CARET}</button>${persMenu}</div></div>`;
    };
    const html = () => {
      const humans = humansNow(), total = humans + st.ai, bad = problems(), valid = bad.length === 0;
      const parts = [st.observe ? "You observe" : humans === 1 ? "You" : `You + ${humans - 1} human`, `${st.ai} AI`];
      const humanRows = Array.from({length: Math.max(0, humans - 1)}, (_, i) => humanRow(st.hRows[i], i)).join("");
      const host = st.observe ? "" : `<div class="cm-ng-row is-host"><span class="cm-ng-seat">Seat 1</span><span class="cm-ng-you">You, the organizer · ${st.hostEditing ? `<input data-ng-field="host" data-focus="host" maxlength="60" placeholder="Your name at the table" aria-label="Your name at the table" value="${e(st.hostName)}">` : e(st.hostName)}${st.bring ? ` · ${st.bring.drop ? `<span class="cm-ng-warn">${e(st.bring.name)} ${e(st.bring.note)}</span>` : `bringing ${e(st.bring.name)}`}` : ""}</span></div>`;
      const aiRows = Array.from({length: st.ai}, (_, i) => aiRow(st.aRows[i], i, humans)).join("");
      return `<div class="cm-ng-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-ng-title">
        <header class="cm-ng-head"><div><p class="cm-ng-eyebrow">Table rules</p><h2 id="cm-ng-title">New game</h2><p class="cm-ng-sum">${parts.join(" · ")} · ${total} of 4 seats</p></div>
          ${admin ? `<div class="cm-ng-observe"><span class="cm-ng-two"><b id="cm-ng-obs">Observe AI game</b><span>Admin only · AI seats play, you watch</span></span><button type="button" role="switch" class="cm-ng-switch${st.observe ? " is-on" : ""}" aria-checked="${st.observe}" aria-labelledby="cm-ng-obs" data-ng="observe"><i aria-hidden="true"></i></button></div>` : ""}</header>
        <div class="cm-ng-body">
          ${st.bringThere ? `<div class="cm-ng-there"><p>You already have a seat at ${e(st.bringThere.host)} table, and its game has not started.</p><button type="button" class="cm-pl-btn" data-ng="bring-there">Bring ${e(st.bring.name)} there</button></div>` : ""}
          <section aria-labelledby="cm-ng-hp" class="cm-ng-sec"><div class="cm-ng-line"><h3 id="cm-ng-hp"${st.observe ? ' class="is-off"' : ""}>Human players</h3><div role="radiogroup" aria-labelledby="cm-ng-hp" class="cm-ng-chips">${[1, 2, 3, 4].map((n) => chip(n, !st.observe && n === st.humans, st.observe, "humans")).join("")}</div><span class="cm-ng-hint">${st.observe ? "Off while you observe" : "Includes you"}</span></div>${host}${humanRows}</section>
          <hr>
          <section aria-labelledby="cm-ng-ai" class="cm-ng-sec"><div class="cm-ng-line"><h3 id="cm-ng-ai">AI players${AI_SUP}</h3><div role="radiogroup" aria-labelledby="cm-ng-ai" class="cm-ng-chips">${[0, 1, 2, 3, 4].map((n) => chip(n, n === st.ai, n < minAi() || n > maxAi(), "ai")).join("")}</div><span class="cm-ng-hint">${st.observe ? "At least 2 to observe" : `Up to ${maxAi()} with this many players`}</span></div>${aiRows}</section>
          <hr>
          <section aria-labelledby="cm-ng-rules" class="cm-ng-sec is-rules"><h3 id="cm-ng-rules">Game rules</h3><div class="cm-ng-rulebox">
            <label class="cm-ng-field">Starting life<input type="number" min="1" max="999" data-ng-field="life" data-focus="life" value="${e(st.life)}"></label>
            <label class="cm-ng-field">Bracket limit<select data-ng-field="bracket"><option value="Any">Any</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}"${st.bracket === String(n) ? " selected" : ""}>${n} or lower</option>`).join("")}</select></label>
            <div class="cm-ng-field"><span id="cm-ng-house">House rules</span><div class="cm-ng-housebox"><button type="button" role="switch" class="cm-ng-switch${st.house ? " is-on" : ""}" aria-checked="${st.house}" aria-labelledby="cm-ng-house" data-ng="house"><i aria-hidden="true"></i></button><b>${st.house ? "On" : "Off"}</b></div></div>
            <p class="cm-ng-rulehint">${st.house ? "Your table plays its house rules. Players see them in the lobby before they ready up." : "Off plays official Commander rules."}</p></div></section>
          <hr>
          <section aria-labelledby="cm-ng-priv" class="cm-ng-sec is-rules"><h3 id="cm-ng-priv">Game privacy</h3><div role="radiogroup" aria-labelledby="cm-ng-priv" class="cm-ng-privacy">${[["Public", "Listed in Live games. Anyone can watch or take an open seat."], ["Private", "Invitation only. Hidden from Live games."]].map(([label, sub]) => `<button type="button" role="radio" class="cm-ng-radio${st.privacy === label ? " is-on" : ""}" aria-checked="${st.privacy === label}" data-ng="privacy" data-id="${label}"><i aria-hidden="true"></i><span class="cm-ng-two"><b>${label}</b><span>${sub}</span></span></button>`).join("")}</div></section>
        </div>
        <footer class="cm-ng-foot"><p class="${valid ? "" : "is-bad"}" role="status">${e(st.error || (valid ? "Submit opens the lobby. Seats are set there." : bad[0]))}</p>
          <button type="button" class="cm-pl-btn is-big" data-ng="cancel" style="padding:0 18px">Cancel</button>
          <button type="button" class="cm-pl-btn is-primary is-big" data-ng="submit" style="padding:0 22px"${valid && !st.busy ? "" : " disabled"}>Submit</button></footer></div>`;
    };
    /* Redrawn whole, the pop-up keeps the control the keyboard was on, and where its caret was. */
    function render() {
      if (!layer) return;
      const active = document.activeElement, key = active && layer.contains(active) ? active.dataset.focus || active.dataset.ng || "" : "";
      const caret = active && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
      const scroll = layer.scrollTop;
      layer.innerHTML = html();
      layer.scrollTop = scroll;
      if (key) {
        const again = layer.querySelector(`[data-focus="${key}"]`) || layer.querySelector(`[data-ng="${key}"]${active?.dataset.row ? `[data-row="${active.dataset.row}"]` : ""}${active?.dataset.n ? `[data-n="${active.dataset.n}"]` : ""}`);
        if (again) {again.focus({preventScroll: true}); if (caret && again.setSelectionRange && /^(text|search|email)$/.test(again.type || "")) try {again.setSelectionRange(...caret);} catch {/* a type without a caret */}}
      }
    }
    const search = (i) => {
      const r = st.hRows[i], q = r.query.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        try {
          const answer = await tools().api("GET", `/api/users/search?q=${encodeURIComponent(q)}`);
          st.searchKnown = true; r.results = Array.isArray(answer?.users) ? answer.users.slice(0, 5) : [];
        } catch (error) {
          /* A server without the directory: the typed name stands as the seat's person. */
          if (error?.status === 404 || error?.status === 405) {st.searchKnown = false; r.results = []; r.picked = q;} else r.results = [];
        }
        render();
      }, 180);
    };
    const onClick = async (event) => {
      const el = event.target.closest("[data-ng]");
      if (!el || !layer.contains(el)) {
        if (event.target === layer) close();
        else if (!event.target.closest(".cm-ng-drop,.cm-ng-combo") && (st.aRows.some((r) => r.menu) || st.hRows.some((r) => r.open))) {st.aRows.forEach((r) => {r.menu = null; r.hover = null;}); st.hRows.forEach((r) => {r.open = false;}); render();}
        return;
      }
      const i = Number(el.dataset.row), act = el.dataset.ng;
      switch (act) {
        case "cancel": close(); break;
        case "observe": st.observe = !st.observe; if (st.observe) st.ai = Math.max(st.ai, 2); else {st.humans = 1; st.ai = Math.min(Math.max(st.ai, 1), 3);} render(); break;
        case "humans": {
          const h = Number(el.dataset.n); st.humans = h;
          let a = Math.min(st.ai, 4 - h); if (h + a < 2) a = 2 - h; st.ai = a; render(); break;
        }
        case "ai": st.ai = Number(el.dataset.n); render(); break;
        case "toggle-diff": case "toggle-pers": {
          const which = act === "toggle-diff" ? "diff" : "pers";
          st.aRows.forEach((r, k) => {r.menu = k === i && r.menu !== which ? which : null; r.hover = null;}); render(); break;
        }
        case "pick-diff": st.aRows[i].difficulty = el.dataset.id; st.aRows[i].menu = null; st.aRows[i].hover = null; render(); break;
        case "pick-pers": st.aRows[i].persona = el.dataset.id; st.aRows[i].menu = null; st.aRows[i].hover = null; render(); break;
        case "pick-user": {const r = st.hRows[i], m = r.results[Number(el.dataset.k)]; if (m) {r.picked = m.name; r.query = m.name; r.open = false; r.results = [];} render(); break;}
        case "house": st.house = !st.house; render(); break;
        case "privacy": st.privacy = el.dataset.id; render(); break;
        case "submit": await submit(); break;
        case "bring-there": {
          const there = st.bringThere, deck = tools().libraryDecks().find((d) => d.id === deckId);
          try {await tools().api("POST", `/api/tables/${encodeURIComponent(there.tableId)}/deck`, {seatId: there.seatId, deck: tools().deckForTable(deck)}); close(); C.go("table", {id: there.tableId});}
          catch (error) {st.error = error?.message || "The deck did not go to that seat."; render();}
          break;
        }
        default:
      }
    };
    const onInput = (event) => {
      const el = event.target.closest("[data-ng-field]"); if (!el) return;
      const i = Number(el.dataset.row), f = el.dataset.ngField;
      if (f === "query") {const r = st.hRows[i]; r.query = el.value; r.picked = ""; r.open = true; search(i); st.error = ""; refreshFooter();}
      else if (f === "name") {st.hRows[i].name = el.value; refreshFooter();}
      else if (f === "email") {st.hRows[i].email = el.value; refreshFooter();}
      else if (f === "ainame") {st.aRows[i].name = el.value; st.aRows[i].touched = true; refreshFooter();}
      else if (f === "life") {st.life = el.value; refreshFooter();}
      else if (f === "host") {st.hostName = el.value; refreshFooter();}
    };
    const onChange = (event) => {
      const el = event.target.closest("[data-ng-field]"); if (!el) return;
      const i = Number(el.dataset.row), f = el.dataset.ngField;
      if (f === "kind") {st.hRows[i].kind = el.value; st.hRows[i].open = false; render();}
      else if (f === "bracket") {st.bracket = el.value; render();}
      else if (f === "group") {st.hRows[i].group = el.value === "general" ? "general" : "insider";}
    };
    /* Typing does not redraw the pop-up (that would lose the field); only the footer's word and the Submit button follow. */
    const refreshFooter = () => {
      const bad = problems(), line = layer.querySelector(".cm-ng-foot p"), submitBtn = layer.querySelector("[data-ng=submit]");
      if (line) {line.textContent = st.error || (bad.length ? bad[0] : "Submit opens the lobby. Seats are set there."); line.classList.toggle("is-bad", bad.length > 0);}
      if (submitBtn) submitBtn.disabled = bad.length > 0 || st.busy;
    };
    const onFocusIn = (event) => {
      const el = event.target.closest("[data-ng-field=query]"); if (!el) return;
      const i = Number(el.dataset.row), r = st.hRows[i]; if (!r.open) {r.open = true; if (!r.results.length) search(i); render();}
    };
    const onOver = (event) => {
      const el = event.target.closest("[data-hover]"); if (!el) return;
      const i = Number(el.dataset.row), r = st.aRows[i];
      if (r.hover !== el.dataset.hover) {r.hover = el.dataset.hover; renderPeekOnly(i);}
    };
    /* Hovering a row changes the panel beside it only, so the pointer is never under a list that was just redrawn. */
    const renderPeekOnly = (i) => {
      const r = st.aRows[i], drop = layer.querySelectorAll(".cm-ng-row.is-ai")[i]; if (!drop) return;
      const peek = drop.querySelector(".cm-ng-peek"); if (!peek) return;
      if (r.menu === "diff") {const d = DIFFICULTY.find((x) => x.id === r.hover);
        peek.innerHTML = `<p><b>${d.id}</b></p><p>${e(d.blurb)}</p>${d.gated ? `<p class="cm-ng-gate">${st.canVeteran ? "Uses AI credits · Insiders and admin" : "Uses AI credits · Insiders and admin only"}</p>` : !levelOpen(d) ? '<p class="cm-ng-gate">Not open on this server yet</p>' : ""}`;}
      else {const p = PERSONAS[r.hover]; peek.innerHTML = `<p><b>${p.name}</b> <span>· ${p.tag}</span></p><p>${e(p.blurb)}</p><p class="cm-ng-muted">${e(p.plays)}</p><p class="cm-ng-dials">${e(p.dials)}</p>`;}
    };
    async function submit() {
      if (st.busy || problems().length) return;
      const humans = humansNow();
      const name = st.hostName.trim();
      const seats = [];
      for (let i = 0; i < humans - 1; i++) {
        const r = st.hRows[i];
        seats.push(r.kind === "new" ? {kind: "human", name: r.name.trim(), email: r.email.trim(), ...(C.inviteAdmin?.() === true ? {group: r.group} : {})} : {kind: "human", name: (r.picked || r.query).trim(), user: (r.picked || r.query).trim()});
      }
      for (let i = 0; i < st.ai; i++) {
        const r = st.aRows[i], p = PERSONAS[r.persona], d = DIFFICULTY.find((x) => x.id === r.difficulty);
        seats.push({kind: "ai", level: d.level, name: (r.touched ? r.name : p.name).trim(), persona: p.id});
      }
      st.busy = true; st.error = ""; render();
      const form = {hostName: name || "Host", startingLife: st.life, bracketLimit: st.bracket === "Any" ? "" : st.bracket, deck: deckId && !(st.bring && st.bring.drop) ? deckId : "", privacy: st.privacy.toLowerCase(), houseRules: st.house, observe: st.observe};
      try {
        const {table, invitations = []} = await tools().api("POST", "/api/tables", {hostName: form.hostName, seats, privacy: form.privacy, ...(st.observe ? {observe: true} : {})});
        try {localStorage.setItem(HOST_KEY, JSON.stringify({owner: C.signedInAs?.() || null, hostName: form.hostName}));} catch {/* not kept */}
        tools().keepSeat(table.tableId);
        close();
        await tools().finishTableSetup(table, form);
        /* Create game sent each guest their invitation (ROB-320). The ones that did not go are said, once, with the way to send them again. */
        const failed = invitations.filter((x) => x.status !== "sent");
        if (failed.length) C.notice(`${failed.map((x) => `${x.name}'s invitation did not go: ${x.error || "try again"}`).join(" ")} Their seats are held; press Resend on a seat in the lobby.`, true, {undo: false});
      } catch (error) {
        st.busy = false; st.error = error?.message || "The table could not be made."; if (layer) render();
      }
    }
    /* The pop-up lives in its own layer over the page, so a redraw of the page never touches what is typed in it. */
    layer = document.createElement("div");
    layer.className = "cm-pl cm-pl-scrim cm-ng-scrim";
    layer.addEventListener("click", onClick);
    layer.addEventListener("input", onInput);
    layer.addEventListener("change", onChange);
    layer.addEventListener("focusin", onFocusIn);
    layer.addEventListener("mouseover", onOver);
    layer.addEventListener("focusin", (event) => {const el = event.target.closest("[data-hover]"); if (el) onOver(event);});
    document.getElementById("matrix-v2").append(layer);
    document.addEventListener("keydown", onKey, true);
    /* Going anywhere else puts the pop-up away: it belongs to the page it was opened over. */
    window.addEventListener("hashchange", close);
    render();
    layer.querySelector("[data-ng=humans][aria-checked=true],[data-ng=ai][aria-checked=true]")?.focus({preventScroll: true});
    return {close};
  }
  C.lounge.newGame = newGame;

  /* ---- the lobby's tour (Rob, 2026-10-28: "a WalkMe-style tour") ----
     A card beside what it names, the rest of the page dimmed and the named control ringed, Close / Back / Next. The organizer's
     has ten steps, a guest's the ones a guest can take. It is drawn in its own layer, so the lobby's redraws leave it alone;
     `tourRefresh` puts it back on its target after each one. */
  const POS = ["tl", "tr", "bl", "br"];
  let tour = {on: false, step: 0}, tourLayer = null;
  function tourSteps(t) {
    const org = !!t.youAreHost, seats = t.seats || [], seated = seats.some((s) => s && s.you) || org;
    const open = (s) => !s.occupied && !s.invited;
    const ai = seats.find((s) => s && s.kind === "ai" && !open(s));
    const removable = org ? [...seats].reverse().find((s) => s && s.seatId !== 0 && !s.you && (s.occupied || s.invited)) : null;
    const host = seats[0] && seats[0].name ? seats[0].name : "the host";
    const steps = [{key: "welcome", title: "Welcome to the lobby", at: "center",
      copy: org ? "This is your table. Set up your seat, check the AI seats, then start the game. It takes about a minute." : `You have a seat at ${host}'s table. Set up your seat and ready up; the host starts the game.`}];
    const me = seats.find((s) => s && s.you);
    if (me) {
      steps.push({key: "you-deck", title: "Choose your deck", target: '[data-tour="you-deck"]', seat: me.seatId, copy: "Pick the deck you are bringing. Its commander sits on your seat and its colors fill your side of the table."});
      steps.push({key: "you-mat", title: "Choose your mat", target: '[data-tour="you-mat"]', seat: me.seatId, copy: "Pick the playmat your cards sit on. It changes your seat only."});
      steps.push({key: "you-ready", title: "Ready up", target: '[data-tour="you-ready"]', seat: me.seatId, copy: "With your deck set, press Ready. You can step back out until the game starts."});
    }
    if (ai && seated) {
      steps.push({key: "ai-deck", title: "Assign the AI a deck", target: `[data-tour="ai-deck"]`, seat: ai.seatId, ai: true, copy: "Any player at the table can hand an AI seat a different deck."});
      steps.push({key: "ai-edit", title: "Tune the AI", target: `[data-tour="ai-edit"]`, seat: ai.seatId, ai: true, copy: "Edit AI changes its name, difficulty and personality. The summary and tags on its seat follow."});
    }
    if (org) {
      steps.push({key: "rules", title: "Change the game rules", target: '[data-tour="rules"]', at: "rules", copy: "Starting life, bracket limit, privacy and house rules. Only the organizer can edit them."});
      if (removable) steps.push({key: "remove", title: "Remove a seat", target: `[data-tour="remove"][data-seat="${removable.seatId}"]`, seat: removable.seatId, header: true, copy: "Clears a seat so you can add an AI or invite someone else. A table needs at least two seats."});
    }
    steps.push({key: "start", title: org ? "Start the game" : "The host starts", target: org ? '[data-tour="start"]' : '[data-tour="launch"]', at: "rules",
      copy: org ? "Start lights up once every seat is ready. The game then begins for everyone." : `When every seat is ready, ${host} starts the game. This line counts the seats still setting up.`});
    if (org) steps.push({key: "end", title: "End the game", target: '[data-tour="end"]', at: "rules", copy: "Closes the table for everyone and releases the seats. Use it when the game will not happen."});
    return steps;
  }
  /* Where a step's card stands, in the frame's own terms (the design's offsets): by its seat, or beside the middle panel. */
  function tourPlace(step, frame, card) {
    const POPW = 320, cw = card.offsetWidth || POPW, ch = card.offsetHeight || 190;
    let x, y;
    if (step.at === "center") {x = frame.left + frame.width / 2 - cw / 2; y = frame.top + frame.height / 2 - ch / 2;}
    else if (step.at === "rules") {x = frame.left + frame.width / 2 - 162 - cw; y = frame.top + frame.height / 2 - ch / 2;}
    else {
      const pos = POS[step.seat] || "tl", top = pos === "tl" || pos === "tr", left = pos === "tl" || pos === "bl", off = step.header ? 16 : 172;
      x = left ? frame.left + off : frame.right - off - cw;
      y = top ? frame.top + (step.header ? 64 : step.ai ? 262 : 196) : frame.bottom - (step.header ? 64 : 408) - ch;
    }
    x = Math.max(8, Math.min(x, window.innerWidth - cw - 8));
    return {x, y};
  }
  function tourDraw() {
    tourLayer?.remove(); tourLayer = null;
    const t = tools().current();
    if (!tour.on || !t || !document.querySelector(".cm-lb-frame")) {tour.on = false; return;}
    const steps = tourSteps(t), i = Math.min(tour.step, steps.length - 1), step = steps[i];
    const frame = document.querySelector(".cm-lb-frame").getBoundingClientRect();
    const target = step.target ? document.querySelector(step.target) : null;
    tourLayer = document.createElement("div");
    tourLayer.className = "cm-pl cm-tour";
    const r = target ? target.getBoundingClientRect() : null;
    tourLayer.innerHTML = `<div class="cm-tour-block" aria-hidden="true"></div>${r ? `<div class="cm-tour-spot" aria-hidden="true" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>` : '<div class="cm-tour-dim" aria-hidden="true"></div>'}
      <div class="cm-tour-card" role="dialog" aria-modal="false" aria-labelledby="cm-lobby-tour-title" style="left:0;top:0">
        <div class="cm-tour-top"><p>Step ${i + 1} of ${steps.length}</p><span aria-hidden="true">${steps.map((_, k) => `<i class="${k === i ? "is-now" : ""}"></i>`).join("")}</span></div>
        <h2 id="cm-lobby-tour-title">${e(step.title)}</h2><p class="cm-tour-copy">${e(step.copy)}</p>
        <div class="cm-tour-foot"><button type="button" class="cm-tour-close" data-tour-act="close">Close</button><span></span>
          <button type="button" class="cm-pl-btn" data-tour-act="back"${i === 0 ? " disabled" : ""} style="height:36px;padding:0 14px">Back</button>
          <button type="button" class="cm-pl-btn is-primary" data-tour-act="next" style="height:36px;padding:0 16px">${i === steps.length - 1 ? "Done" : "Next"}</button></div></div>`;
    document.getElementById("matrix-v2").append(tourLayer);
    const card = tourLayer.querySelector(".cm-tour-card"), at = tourPlace(step, frame, card);
    card.style.left = `${Math.round(at.x)}px`; card.style.top = `${Math.round(at.y)}px`;
    tourLayer.addEventListener("click", (event) => {
      const act = event.target.closest("[data-tour-act]")?.dataset.tourAct; if (!act) return;
      if (act === "close") tourClose();
      else {tour.step = act === "back" ? Math.max(0, tour.step - 1) : tour.step + 1; if (tour.step >= steps.length) tourClose(); else tourDraw();}
    });
    if (document.activeElement === document.body || !tourLayer.contains(document.activeElement)) card.querySelector("[data-tour-act=next]").focus({preventScroll: true});
  }
  function tourClose() {tour = {on: false, step: 0}; tourLayer?.remove(); tourLayer = null; document.removeEventListener("keydown", tourKey, true); window.removeEventListener("resize", tourRefresh);}
  const tourKey = (event) => {if (event.key === "Escape" && tour.on) {event.stopPropagation(); tourClose();}};
  const tourRefresh = () => {if (tour.on) tourDraw();};
  actions["lobby-tour"] = () => {
    if (!tools().current()) return;
    tour = {on: true, step: 0};
    document.addEventListener("keydown", tourKey, true); window.addEventListener("resize", tourRefresh);
    tourDraw();
  };
  C.lounge.tourRefresh = tourRefresh;
  C.lounge.tourClose = tourClose;

});
