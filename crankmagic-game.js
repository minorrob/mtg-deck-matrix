/* THE LOBBY, ON SCREEN (docs/crankmagic-game-plan.md §5.1, PR G0). Pick your deck, seat one to
 * three opponents, set the rules of the table, and read the pod before you sit. No AI, no board,
 * no turn: this ships on its own and is the thing every later piece of the game is entered from.
 *
 * THE ARITHMETIC IS NOT HERE. crankmagic-lobby.js decides what a seat is, whether it may sit, how
 * to trim it to the bracket, who goes first and whether the pod is fair; this file turns those
 * answers into a page and turns the reader's clicks back into a config. Nothing about a bracket
 * or a colour identity is spelled twice.
 *
 * LOBBY UX LOCK (Trey): four seat boxes always; host deck modal with progressive disclosure;
 * Human = invite only (Name/Email/Email Invite/Copy Link); AI = in-seat deck; Ready Up top-right;
 * Confirm locks table rules; no Reshuffle button; no seating-seed field.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {M, esc: e, button: b, select: s, field: f, note, form, actions, views, $} = C;
  const L = globalThis.CrankLobby;
  const ENABLE_ARCHIDEKT_LINK = false; /* hide until Archidekt/link source fixed */
  const SRC = globalThis.CrankDeckSources;

  const KEY = "cm-lobby";
  const SLOT_COUNT = 3; /* opponents; host is separate → 4 boxes total */
  const EMPTY_OPP = () => ({role: "unused", ready: false, seat: null, guestName: "", guestEmail: "", inviteId: ""});
  function ensureInviteId(opp) {
    if (!opp.inviteId) opp.inviteId = (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return opp.inviteId;
  }
  function humanOppSeatIdMap() {
    const map = new Map();
    let next = 1;
    lobby.opponents.forEach((opp, i) => {
      if (opp && opp.role === "human") map.set(i, next++);
    });
    return map;
  }
  function applyServerInvitations(invitations) {
    if (!Array.isArray(invitations)) return;
    const map = humanOppSeatIdMap();
    map.forEach((seatId, oppIndex) => {
      const hit = invitations.find((x) => Number(x.seatId) === Number(seatId));
      if (hit && hit.link) lobby.opponents[oppIndex].liveInviteLink = hit.link;
    });
    save();
  }
  const EMPTY = () => ({
    bracket: 3,
    cap: "",
    host: null, /* {seat, ready} */
    hostBuildDef: null,
    opponents: [EMPTY_OPP(), EMPTY_OPP(), EMPTY_OPP()],
    rulesConfirmed: null, /* {bracket, cap, summary} */
  });

  let lobby = load();
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw) return EMPTY();
      /* migrate legacy {seats:[]} shape */
      if (Array.isArray(raw.seats)) {
        const next = EMPTY();
        next.bracket = Number(raw.bracket) || 3;
        next.cap = raw.cap === undefined ? "" : raw.cap;
        const you = raw.seats.find((x) => x.you) || null;
        const others = raw.seats.filter((x) => !x.you);
        if (you) next.host = {seat: you, ready: !!you.ready};
        others.slice(0, SLOT_COUNT).forEach((seat, i) => {
          next.opponents[i] = {role: seat.kind === "generated" ? "ai" : "human", ready: !!seat.ready, seat};
        });
        return next;
      }
      const opponents = Array.isArray(raw.opponents)
        ? raw.opponents.slice(0, SLOT_COUNT).map((o) => ({
            role: ["unused", "human", "ai"].includes(o.role) ? o.role : "unused",
            ready: !!o.ready,
            seat: o.seat || null,
            guestName: String(o.guestName || ""),
            guestEmail: String(o.guestEmail || ""),
            inviteId: String(o.inviteId || ""),
            buildDef: o.buildDef || null,
          }))
        : [EMPTY_OPP(), EMPTY_OPP(), EMPTY_OPP()];
      while (opponents.length < SLOT_COUNT) opponents.push(EMPTY_OPP());
      return {
        bracket: Number(raw.bracket) || 3,
        cap: raw.cap === undefined ? "" : raw.cap,
        host: raw.host && raw.host.seat ? {seat: raw.host.seat, ready: !!raw.host.ready} : null,
        hostBuildDef: raw.hostBuildDef || null,
        opponents,
        rulesConfirmed: raw.rulesConfirmed || null,
      };
    } catch (err) { return EMPTY(); }
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(lobby)); } catch (err) { /* private window */ } };
  function softNotice(msg, isErr) {
    C.notice(msg, !!isErr);
    try {
      const el = document.getElementById("cm-notice");
      clearTimeout(softNotice._t);
      softNotice._t = setTimeout(() => { if (el) el.hidden = true; }, 3000);
    } catch (_) {}
  }
  function setBuildBusy(on, where) {
    try {
      document.body.classList.toggle("cm-build-busy", !!on);
      const applyBtns = Array.from(document.querySelectorAll('[data-action="lobby-inline-apply"], .cm-dialog button[type="submit"], .cm-dialog [data-action="ok"]'));
      applyBtns.forEach((btn) => {
        if (!btn) return;
        btn.disabled = !!on;
        if (on) {
          if (!btn.dataset._label) btn.dataset._label = btn.textContent;
          if (!btn.querySelector(".cm-flame-spin")) {
            const spin = document.createElement("span");
            spin.className = "cm-flame-spin";
            spin.setAttribute("aria-hidden", "true");
            btn.insertBefore(spin, btn.firstChild);
          }
          btn.classList.add("cm-building");
        } else {
          btn.querySelectorAll(".cm-flame-spin").forEach((n) => n.remove());
          btn.classList.remove("cm-building");
          if (btn.dataset._label) btn.textContent = btn.dataset._label;
        }
      });
      document.querySelectorAll(".cm-lobby-seat").forEach((seat) => {
        seat.classList.toggle("cm-seat-building", !!on);
      });
    } catch (_) {}
  }

  const redraw = () => { save(); C.render(); };

  function activeSeats() {
    const out = [];
    if (lobby.host && lobby.host.seat) {
      const seat = Object.assign({}, lobby.host.seat, {you: true, ready: !!lobby.host.ready});
      out.push(seat);
    }
    lobby.opponents.forEach((opp) => {
      if (opp.role === "unused" || !opp.seat) return;
      out.push(Object.assign({}, opp.seat, {you: false, ready: !!opp.ready, role: opp.role}));
    });
    return out;
  }

  function table() {
    /* Start uses a fresh random seating each time (no exposed seed). */
    return L.table({
      bracket: lobby.bracket,
      gameChangers: lobby.cap === "" ? undefined : lobby.cap,
      seats: activeSeats(),
      seed: "",
      fixedSeating: false,
    });
  }

  function rulesSummary(bracket, cap) {
    const gc = cap === "" || cap === undefined || cap === null
      ? (bracket.gameChangers === Infinity ? "no Game Changer limit" : `${bracket.gameChangers} Game Changer${bracket.gameChangers === 1 ? "" : "s"}`)
      : (Number(cap) === 0 ? "0 Game Changers" : `${Number(cap)} Game Changer${Number(cap) === 1 ? "" : "s"}`);
    return `Bracket ${bracket.n} · ${bracket.name}. Cap: ${gc}. Same rules for every seat.`;
  }

  function scoreFor(deck) {
    const runs = C.state.reports.filter((r) => r.deckId === deck.id && r.origin === "measured");
    if (!runs.length) return {score: null, why: ""};
    const fp = M.fingerprint(deck);
    const current = runs.filter((r) => r.deckFingerprint === fp);
    const run = (current.length ? current : runs).slice(-1)[0];
    const score = run.metrics && Number.isFinite(Number(run.metrics.score)) ? Number(run.metrics.score) : null;
    if (score === null) return {score: null, why: ""};
    const se = run.metrics.scoreStandardError;
    return {score: Math.round(score * 10) / 10,
      why: `${current.length ? "Measured on this list" : "Measured on an earlier list"}${se ? ` (±${se})` : ""}, ${run.protocol || "the published protocol"}.`};
  }

  function seatFromDeck(deck, you) {
    const commanderIds = new Set(deck.commanders);
    const facts = (id) => { const c = C.card(id) || {}; return {name: c.name || id, cardId: id, gameChanger: !!c.gameChanger,
      colorIdentity: c.colorIdentity || [], typeLine: c.typeLine || "", edhrecRank: c.edhrecRank, price: c.price}; };
    const {score, why} = scoreFor(deck);
    return L.seat({id: "seat:" + deck.id, name: deck.name, kind: "library", deckId: deck.id, you,
      commanders: deck.commanders.map(facts),
      cards: deck.slots.filter((r) => r.purpose === "main" && !commanderIds.has(r.cardId)).map((r) => Object.assign(facts(r.cardId), {quantity: r.quantity})),
      score, scoreWhy: why});
  }

  function seatFromList(parsed, {name, kind, url, you}) {
    const known = (n) => (C.catalog && C.catalog.exact ? C.catalog.exact(n) : null);
    const fill = (row) => {
      const facts = row.card || known(row.name) || {};
      return {name: row.name, quantity: row.quantity || 1, cardId: facts.id || "",
        gameChanger: !!facts.gameChanger, colorIdentity: facts.colorIdentity || [],
        typeLine: facts.typeLine || "", edhrecRank: facts.edhrecRank, price: facts.price};
    };
    const names = new Set((parsed.commander || []).map((x) => String(x).toLowerCase()));
    const rows = parsed.cards || [];
    const commanders = (parsed.commanders || rows.filter((r) => r.isCommander || names.has(String(r.name).toLowerCase()))).map(fill);
    const cards = rows.filter((r) => !(r.isCommander || names.has(String(r.name).toLowerCase()))).map(fill);
    return L.seat({name: name || parsed.name || "Imported deck", kind, url, you,
      commanders, cards, score: null,
      scoreWhy: "No measured score: the simulator has not played this list."});
  }

  const KIND = {library: "from your library", link: "from a link", paste: "pasted", generated: "generated"};
  const BUDGET = (globalThis.CrankRules && globalThis.CrankRules.RULES.deckCap) || 225;
  const MANA_COLORS = [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]];

  function colorPillsHtml(inputName = "commanderColor") {
    return `<div class="cm-color-pills cm-lobby-color-pills" role="group" aria-label="Colour identity filter">${MANA_COLORS.map(([k, name]) =>
      `<label class="cm-color-pill" title="${e(name)}" aria-label="${e(name)}"><input type="checkbox" name="${inputName}" value="${k}"><img src="assets/mana/${k}.svg?v=1" alt="${e(name)}"></label>`
    ).join("")}</div>`;
  }

  function defaultBuildDef() {
    const bracketN = Number(lobby.bracket) || 3;
    const M = C.M;
    if (M && typeof M.defaultDefinition === "function") {
      return M.defaultDefinition({baseBracket: bracketN, bracketCeiling: bracketN, budget: BUDGET});
    }
    return {
      baseBracket: bracketN, bracketCeiling: bracketN, budget: BUDGET, perCardCap: null,
      mechanics: [], playStyle: "Balanced", speed: 3, competitiveness: 3, saltiness: 3, restrictions: "",
    };
  }

  function resolveBuildDef(defOverride) {
    const base = defaultBuildDef();
    const ov = defOverride || {};
    const pick = {
      baseBracket: ov.baseBracket != null ? Number(ov.baseBracket) : base.baseBracket,
      bracketCeiling: ov.bracketCeiling != null ? Number(ov.bracketCeiling) : base.bracketCeiling,
      budget: ov.budget === "" || ov.budget === undefined ? base.budget
        : (ov.budget === null ? null : Number(ov.budget)),
      perCardCap: ov.perCardCap === "" || ov.perCardCap === undefined ? (base.perCardCap ?? null)
        : (ov.perCardCap === null ? null : Number(ov.perCardCap)),
      playStyle: ov.playStyle || base.playStyle,
      speed: ov.speed != null ? Number(ov.speed) : base.speed,
      competitiveness: ov.competitiveness != null ? Number(ov.competitiveness) : base.competitiveness,
      saltiness: ov.saltiness != null ? Number(ov.saltiness) : base.saltiness,
      restrictions: ov.restrictions != null ? String(ov.restrictions) : (base.restrictions || ""),
    };
    if (Array.isArray(ov.mechanics)) pick.mechanics = ov.mechanics;
    else if (ov.mechanic != null) pick.mechanics = ov.mechanic ? [ov.mechanic] : [];
    else pick.mechanics = base.mechanics || [];
    const M = C.M;
    const definition = (M && typeof M.defaultDefinition === "function")
      ? M.defaultDefinition(pick)
      : Object.assign({}, base, pick);
    definition.fitBracket = true;
    return definition;
  }

  function buildDefCustomized(def) {
    if (!def) return false;
    const d = defaultBuildDef();
    const mech = (def.mechanics && def.mechanics[0]) || "";
    const dMech = (d.mechanics && d.mechanics[0]) || "";
    return mech !== dMech
      || Number(def.baseBracket) !== Number(d.baseBracket)
      || Number(def.bracketCeiling) !== Number(d.bracketCeiling)
      || String(def.budget ?? "") !== String(d.budget ?? "")
      || String(def.perCardCap ?? "") !== String(d.perCardCap ?? "")
      || String(def.playStyle || "") !== String(d.playStyle || "")
      || Number(def.speed) !== Number(d.speed)
      || Number(def.competitiveness) !== Number(d.competitiveness)
      || Number(def.saltiness) !== Number(d.saltiness)
      || String(def.restrictions || "") !== String(d.restrictions || "");
  }


  function parsePaste(text) {
    const lines = text.split(/\r?\r\n/).map((x) => x.trim());
    const cards = [], commanders = [];
    let section = "";
    for (const line of lines) {
      if (!line) { section = ""; continue; }
      const header = /^(commander|deck|maindeck|mainboard|sideboard|companion)s?\b[:\s]*$/i.exec(line);
      if (header) { section = header[1].toLowerCase(); continue; }
      const m = /^(?:(\d+)\s*[xX]?\s+)?(.+?)\s*(?:\([^)]*\)\s*[\w-]*)?$/.exec(line);
      if (!m) continue;
      const row = {name: m[2].replace(/\s*\*[^*]*\*\s*$/, "").trim(), quantity: Number(m[1] || 1)};
      if (!row.name || /^\d+$/.test(row.name)) continue;
      if (section === "commander") commanders.push(row); else cards.push(row);
    }
    if (!commanders.length && cards.length > 1 && lines[0] && !lines[1]) commanders.push(cards.shift());
    return {commanders, cards};
  }

  /* A SEAT THE DRAFT BUILDER MAKES IS BUILT TO A BUDGET AND A BRACKET (Rob, 15 September; game
     plan §9). The alternative was matching it to your deck's measured score, which produces a
     sparring partner rather than an opponent: it is built AROUND you, so beating it says only
     that the generator aimed well.

     TWO CONSTRAINTS, AND THEY ARE DIFFERENT KINDS OF THING. The bracket is the TABLE'S and binds
     every seat alike — it is what caps the Game Changers, and a generated deck has no more right
     to ignore it than an imported one does. The budget is THIS SEAT'S, because what an opponent
     spent is a fact about that opponent rather than a rule of the table. Both are constraints the
     real world actually imposes, so the result means something outside this app: the pod read can
     say "you are the deck to beat by 12" and be describing a real gap rather than a knob set to
     zero. The house's own deck cap is the budget's default and its per-card ceiling comes from the
     same rules the Shop reads.

     The list is a starting hundred, not a measured one, so the seat carries no score and the pod
     read says the read is partial. */
  /* Build from Commander → real Deck Labs engine (draft-builder.js / CrankDraft), same path as Lab.
     STANDING RULE: never seat a stub/partial/illegal list. Only basic lands may duplicate. */
  async function generatedSeat(name, budget, you, defOverride) {
    const B = globalThis.CrankDraft;
    if (!B || typeof B.build !== "function") {
      throw Error("Deck Labs builder (CrankDraft) has not loaded. Build from Commander is unavailable — use Library or Paste.");
    }
    if (!name) throw Error("Pick a commander to build from.");
    if (!C.catalog || typeof C.catalog.all !== "function") throw Error("The card catalog has not loaded yet.");
    let found = C.catalog.exact ? C.catalog.exact(name) : null;
    if (!found) throw Error(`The catalog has no card called ${name}. Check the spelling, or paste the list instead.`);
    if (typeof C.catalog.details === "function") {
      try { found = await C.catalog.details(found); } catch (_) { /* keep exact hit */ }
    }
    if (typeof C.catalog.loadGraph === "function") {
      try { await C.catalog.loadGraph(); } catch (_) { /* draft without graph seed */ }
    }
    const pool = C.catalog.all() || [];
    if (pool.length < 500) {
      throw Error("Card catalog is too thin to run Deck Labs build-100. Refresh data and try again.");
    }
    const bracketN = Number(lobby.bracket) || 3;
    const ov = defOverride || {};
    const budgetRaw = ov.budget !== undefined && ov.budget !== null && ov.budget !== ""
      ? ov.budget
      : budget;
    const budgetN = budgetRaw === "" || budgetRaw === undefined || budgetRaw === null ? null : Number(budgetRaw);
    const definition = resolveBuildDef(Object.assign({}, ov, {
      baseBracket: ov.baseBracket != null ? ov.baseBracket : bracketN,
      bracketCeiling: ov.bracketCeiling != null ? ov.bracketCeiling : bracketN,
      budget: Number.isFinite(budgetN) ? budgetN : (ov.budget === null ? null : budgetN),
    }));

    let seed = null;
    if (globalThis.CrankTrace && globalThis.CrankStrategies && globalThis.CrankGraph) {
      try {
        const identity = new Set(found.colorIdentity || []);
        const world = pool.filter((c) => c.id !== found.id
          && c.verified
          && c.legalities && c.legalities.commander === "legal"
          && (c.colorIdentity || []).every((x) => identity.has(x)));
        const strategies = CrankStrategies.forDeck({
          commanderStrategies: CrankStrategies.derive(found),
          mechanics: definition.mechanics || [],
          ticked: null,
        });
        const traced = CrankTrace.trace(found, world, CrankGraph.relate, strategies, {beam: {1: 60, 2: 40, 3: 30}});
        seed = CrankTrace.seedFrom(traced);
      } catch (_) { seed = null; }
    }

    const built = B.build({
      commanders: [found],
      cards: pool,
      definition,
      available: {},
      benchOnly: false,
      seed,
    });
    const cmdIds = new Set([found.id].filter(Boolean));
    const slots99 = (built.slots || []).filter((r) => !cmdIds.has(r.cardId));
    const chosen99 = slots99.reduce((n, r) => n + (Number(r.quantity) || 1), 0);
    if (!chosen99) {
      throw Error("Deck Labs could not choose any of the 99. "
        + ((built.issues && built.issues.length) ? built.issues.join(" ") : "Check commander legality and table limits."));
    }
    if (chosen99 < 90) {
      throw Error(`Deck Labs returned a partial list (${chosen99} of 99) — not seating it. `
        + ((built.issues && built.issues.slice(0, 3).join(" ")) || "Loosen budget/limits or pick another commander."));
    }

    const byId = new Map(pool.map((c) => [c.id, c]));
    byId.set(found.id, found);
    const basicRe = (L && L.BASIC) ? L.BASIC : /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$/;
    const cards = [];
    const seenNonbasic = new Set();
    for (const r of slots99) {
      const c = byId.get(r.cardId) || {};
      const nm = c.name || String(r.cardId || "");
      if (!nm) continue;
      const typeLine = c.typeLine || "";
      const basic = /Basic/i.test(typeLine) || basicRe.test(nm);
      const quantity = Number(r.quantity) || 1;
      if (!basic && quantity > 1) {
        throw Error(`Deck Labs returned an illegal duplicate (${quantity}x ${nm}). Only basic lands may duplicate.`);
      }
      const key = nm.toLowerCase();
      if (!basic) {
        if (seenNonbasic.has(key)) throw Error(`Deck Labs returned a duplicate non-basic: ${nm}.`);
        seenNonbasic.add(key);
      }
      cards.push({
        name: nm,
        quantity,
        cardId: r.cardId || c.id || "",
        gameChanger: !!c.gameChanger,
        colorIdentity: c.colorIdentity || [],
        typeLine,
        basic,
        edhrecRank: c.edhrecRank,
        price: c.price,
      });
    }

    const bracket = L.bracketOf(lobby.bracket);
    const fit = built.bracketFit;
    if (fit && fit.short) {
      /* Short soft note only — finalizeBuiltSeat will strip/backfill if needed. */
      softNotice(found.name + " built over the Game Changer cap — adjusting to a legal 100…", false);
    }
    const seat = L.seat({
      name: `${found.name} (Labs · bracket ${bracket.n}${Number.isFinite(budgetN) ? ` · ${C.money(budgetN)}` : ""})`,
      kind: "generated",
      you,
      commanders: [{
        name: found.name,
        cardId: found.id,
        colorIdentity: found.colorIdentity || [],
        typeLine: found.typeLine || "",
      }],
      cards,
      score: null,
      scoreWhy: `Built with Deck Labs (CrankDraft) to bracket ${bracket.n} (${bracket.name})${Number.isFinite(budgetN) ? ` and ${C.money(budgetN)}` : ""}. Never measured.`,
    });
    /* Never throw here — finalizeBuiltSeat strips GC/identity violators and backfills. */
    return seat;
  }

  async function buildSeatFromValues(v, you) {
    const kind = v.from || "library";
    if (kind === "library") {
      const deck = C.state.decks.find((d) => d.id === v.deckId);
      if (deck) return seatFromDeck(deck, you);
      const host = (hostCatalogDecks || []).find((d) => d.id === v.deckId);
      if (host) return seatFromHostCatalogMeta(host, you);
      throw Error("Choose a deck.");
    }
    if (kind === "link" && !ENABLE_ARCHIDEKT_LINK) throw Error("Archidekt link is off until that source is fixed. Use library, paste, or Build from Commander.");
    if (kind === "link") {
      if (!SRC) throw Error("The deck-sources module has not loaded; paste the list instead.");
      const url = String(v.url || "").trim();
      if (!url) throw Error("Paste the deck's link.");
      const site = SRC.identify(url);
      if (!site) throw Error("That link is not one this app reads. Archidekt works directly; for Moxfield or Deckstats, paste the export.");
      const loaded = await SRC.load(url);
      return seatFromList(loaded.deck, {name: loaded.deck.name, kind: "link", url, you});
    }
    if (kind === "paste") {
      const parsed = parsePaste(String(v.paste || ""));
      if (!parsed.cards.length) throw Error("Nothing in that paste read as a decklist. One card a line, with a quantity in front.");
      return seatFromList(parsed, {name: v.name || "Pasted deck", kind: "paste", you});
    }
    const def = v.buildDef || (you ? lobby.hostBuildDef : null);
    const budgetFromDef = def && def.budget != null && def.budget !== "" ? Number(def.budget) : (Number(v.budget) || BUDGET);
    return finalizeBuiltSeat(await generatedSeat(String(v.commander || "").trim(), budgetFromDef, you, def));
  }

  /* Lobby Apply → Collection createDeck draft (paste/generated). Library already has a Decks row.
     Coordinates with Collection truth: C.commit createDeck + cards[] so typeLine metadata lands in Decks. */
  function finalizeBuiltSeat(seat) {
    /* Strip GC / table violators, backfill legal basics, always return a seatable 100. */
    const opts = {
      bracket: lobby.bracket,
      gameChangers: lobby.cap === "" ? undefined : lobby.cap,
    };
    let adjusted = false;
    for (let guard = 0; guard < 12; guard++) {
      let check = L.validate(seat, opts);
      if (check.ok) {
        if (adjusted) softNotice("Seated a legal 100 (trimmed Game Changers / illegal cards).", false);
        return seat;
      }
      adjusted = true;
      const blocking = (check.issues || []).filter((i) => i.severity === "blocking");

      /* Prefer Lobby.trim — drops excess GCs and backfills basics. */
      if (blocking.some((i) => i.code === "gameChangers") && typeof L.trim === "function") {
        try {
          const trimmed = L.trim(seat, opts);
          if (trimmed && trimmed.seat) seat = trimmed.seat;
        } catch (_) { /* fall through to manual strip */ }
      }

      check = L.validate(seat, opts);
      if (check.ok) {
        softNotice("Seated a legal 100 (trimmed Game Changers / illegal cards).", false);
        return seat;
      }

      const issues = (check.issues || []).filter((i) => i.severity === "blocking");
      const gcIssue = issues.find((i) => i.code === "gameChangers");
      if (gcIssue) {
        const ban = new Set((gcIssue.cards || []).map((n) => String(n).toLowerCase()));
        if (ban.size) {
          seat.cards = (seat.cards || []).filter((c) => !ban.has(String(c.name || "").toLowerCase()));
        } else {
          /* Strip one flagged GC at a time until under cap. */
          const hit = (seat.cards || []).find((c) => c.gameChanger);
          if (hit) seat.cards = (seat.cards || []).filter((c) => c !== hit);
          else break;
        }
      }
      const identityIssue = issues.find((i) => i.code === "identity");
      if (identityIssue && Array.isArray(identityIssue.cards) && identityIssue.cards.length) {
        const ban = new Set(identityIssue.cards.map((n) => String(n).toLowerCase()));
        seat.cards = (seat.cards || []).filter((c) => !ban.has(String(c.name || "").toLowerCase()));
      }
      const dupIssue = issues.find((i) => i.code === "duplicates");
      if (dupIssue && Array.isArray(dupIssue.cards) && dupIssue.cards.length) {
        const ban = new Set(dupIssue.cards.map((n) => String(n).toLowerCase()));
        seat.cards = (seat.cards || []).map((c) => {
          if (!ban.has(String(c.name || "").toLowerCase()) || c.basic) return c;
          return Object.assign({}, c, { quantity: 1 });
        });
      }

      let size = (seat.commanders || []).length + (seat.cards || []).reduce((n, c) => n + (Number(c.quantity) || 1), 0);
      if (size > 100) {
        /* Drop excess non-basics from the end until 100. */
        while (size > 100 && seat.cards && seat.cards.length) {
          const last = seat.cards[seat.cards.length - 1];
          if ((Number(last.quantity) || 1) > 1) {
            last.quantity -= 1;
            size -= 1;
          } else {
            seat.cards.pop();
            size -= 1;
          }
        }
      }
      if (size < 100) {
        const colors = new Set();
        (seat.commanders || []).forEach((c) => (c.colorIdentity || []).forEach((x) => colors.add(x)));
        const basicByColor = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
        const basic = [...colors].map((c) => basicByColor[c]).filter(Boolean)[0] || "Wastes";
        const need = 100 - size;
        const existing = (seat.cards || []).find((c) => String(c.name).toLowerCase() === basic.toLowerCase());
        if (existing) existing.quantity = (Number(existing.quantity) || 0) + need;
        else (seat.cards || (seat.cards = [])).push({ name: basic, quantity: need, basic: true, gameChanger: false });
      }
    }
    /* Last resort: strip every gameChanger flag card, backfill basics. */
    seat.cards = (seat.cards || []).filter((c) => !c.gameChanger);
    let size = (seat.commanders || []).length + (seat.cards || []).reduce((n, c) => n + (Number(c.quantity) || 1), 0);
    if (size < 100) {
      const need = 100 - size;
      const existing = (seat.cards || []).find((c) => /^(plains|island|swamp|mountain|forest|wastes)$/i.test(c.name));
      if (existing) existing.quantity = (Number(existing.quantity) || 0) + need;
      else (seat.cards || (seat.cards = [])).push({ name: "Wastes", quantity: need, basic: true });
    }
    softNotice("Seated a legal 100 after removing Game Changers over the table cap.", false);
    return seat;
  }

  function enrichSeatTypes(seat) {
    const rows = [].concat(seat.commanders || []).concat(seat.cards || []);
    for (const row of rows) {
      if (row.typeLine) continue;
      let c = row.cardId && C.card ? C.card(row.cardId) : null;
      if (!c && row.name && C.catalog && C.catalog.exact) c = C.catalog.exact(row.name);
      if (!c) continue;
      if (!row.cardId && c.id) row.cardId = c.id;
      if (c.typeLine) row.typeLine = c.typeLine;
    }
    return seat;
  }

  async function persistLobbyDraft(seat, kind) {
    enrichSeatTypes(seat);
    if (kind === "library" && seat.deckId) return seat;

    /* Prefer Collection locked helper when present (PR #264). Interim createDeck only if missing. */
    if (typeof C.ensureLobbyDraft === "function") {
      try {
        const result = await C.ensureLobbyDraft({
          seatLabel: seat.name || "Lobby draft",
          commanders: (seat.commanders || []).map((c) => ({name: c.name})),
          cards: (seat.cards || []).map((c) => ({name: c.name, quantity: Number(c.quantity) || 1})),
          existingDeckId: seat.deckId || undefined,
        });
        if (!result || !result.ok) {
          const names = ((result && result.unresolved) || []).map((u) => u.name || u).filter(Boolean);
          C.notice(
            names.length
              ? `Seated, but Decks draft unresolved: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}`
              : "Seated, but Decks draft could not be saved (ensureLobbyDraft).",
            true
          );
          return seat;
        }
        seat.deckId = result.deckId || seat.deckId;
        if (result.commanders && result.commanders.length) {
          seat.commanders = result.commanders.map((c) => ({
            name: c.name,
            cardId: c.cardId || "",
            typeLine: c.typeLine || "",
            colorIdentity: c.colorIdentity || [],
          }));
        }
        if (result.cards && result.cards.length) {
          seat.cards = result.cards.map((c) => ({
            name: c.name,
            quantity: Number(c.quantity) || 1,
            cardId: c.cardId || "",
            typeLine: c.typeLine || "",
            colorIdentity: c.colorIdentity || [],
          }));
        }
        enrichSeatTypes(seat);
        return seat;
      } catch (err) {
        C.notice(`Seated, but ensureLobbyDraft failed: ${err && err.message ? err.message : err}`, true);
        return seat;
      }
    }

    if (!C.commit || !C.uid) return seat;
    const commanders = [];
    const cards = [];
    const slots = [];
    const seen = new Set();
    const take = (row) => {
      let c = row.cardId && C.card ? C.card(row.cardId) : null;
      if (!c && row.name && C.catalog && C.catalog.exact) c = C.catalog.exact(row.name);
      if (!c || !c.id) return null;
      if (!row.cardId) row.cardId = c.id;
      if (!row.typeLine && c.typeLine) row.typeLine = c.typeLine;
      if (!seen.has(c.id)) { seen.add(c.id); cards.push(c); }
      return c.id;
    };
    for (const row of seat.commanders || []) {
      const id = take(row);
      if (id) commanders.push(id);
    }
    for (const row of seat.cards || []) {
      const id = take(row);
      if (!id) continue;
      slots.push({cardId: id, quantity: Number(row.quantity) || 1, purpose: "main"});
    }
    for (const id of commanders) {
      if (!slots.some((s) => s.cardId === id)) slots.unshift({cardId: id, quantity: 1, purpose: "main"});
    }
    if (!commanders.length || !slots.length) return seat;
    const id = "deck:" + C.uid();
    const name = seat.name || "Lobby draft";
    try {
      await C.commit({
        type: "batch",
        commands: [{
          type: "createDeck",
          deckId: id,
          name,
          commanders,
          cards,
          slots,
          definition: {bracketCeiling: lobby.bracket, budget: BUDGET},
          notes: `Seated from Play lobby (${kind}). Draft carries full catalog card metadata for Decks.`,
        }],
        summary: `Saved ${name} as a draft in Decks`,
      }, {renderView: false});
      seat.deckId = id;
    } catch (err) {
      C.notice(`Seated, but Decks draft save failed: ${err && err.message ? err.message : err}`, true);
    }
    return seat;
  }

  function wireProgressive(formEl) {
    const sync = () => {
      const from = (formEl.elements.from && formEl.elements.from.value) || "library";
      formEl.querySelectorAll("[data-from]").forEach((node) => {
        const show = node.getAttribute("data-from").split(/\s+/).includes(from);
        node.hidden = !show;
        node.querySelectorAll("input,select,textarea").forEach((inp) => {
          if (show) inp.removeAttribute("disabled");
          else inp.setAttribute("disabled", "disabled");
        });
      });
    };
    const fromEl = formEl.elements.from;
    if (fromEl) fromEl.addEventListener("change", sync);
    sync();
    wireCommanderSearch(formEl);
  }

  function wireCommanderSearch(root) {
    /* Standing rule: every commander/card-name field is a searchable catalog dropdown. */
    const pairs = [];
    root.querySelectorAll("[name=commanderQuery], [name=inlineCommanderQuery]").forEach((input) => {
      const box = input.closest(".cm-full, .cm-lobby-inline, [data-inline-from], form, .cm-lobby-seat, .cm-lobby-source-band") || root;
      const scope = input.closest(".cm-lobby-inline, form, #cm-dialog") || box;
      const list = box.querySelector("[data-commander-results]") || scope.querySelector("[data-commander-results]") || root.querySelector("[data-commander-results]");
      const hidden = input.name === "inlineCommanderQuery"
        ? (box.querySelector("[name=inlineCommander]") || scope.querySelector("[name=inlineCommander]") || root.querySelector("[name=inlineCommander]"))
        : (box.querySelector("[name=commander]") || scope.querySelector("[name=commander]") || root.querySelector("[name=commander]"));
      if (input && list) pairs.push({ input, hidden, list, scope });
    });
    pairs.forEach(({ input, hidden, list, scope }) => {
      if (input.dataset.cmWiredSearch === "1") return;
      input.dataset.cmWiredSearch = "1";
      const colorRoot = scope;
      const renderHits = () => {
        const q = String(input.value || "").trim();
        if (!C.catalog || !C.catalog.search) {
          list.innerHTML = `<p class="cm-muted">Catalog still loading.</p>`;
          list.hidden = false;
          return;
        }
        const colors = [...colorRoot.querySelectorAll("[name=commanderColor]:checked, [name=inlineCommanderColor]:checked")]
          .map((el) => el.value)
          .filter((k) => k && k !== "C");
        const opts = {commander: true, limit: 12};
        if (colors.length) opts.colors = colors;
        /* Empty query → top commanders (typeahead dropdown on focus). */
        const hits = q ? C.catalog.search(q, opts) : C.catalog.search("a", Object.assign({}, opts, {limit: 12}));
        if (!hits.length) { list.innerHTML = `<p class="cm-muted">No commanders match.</p>`; list.hidden = false; return; }
        list.innerHTML = hits.map((c) => `<button type="button" class="cm-commander-result" data-commander-pick="${e(c.name)}"><strong>${e(c.name)}</strong><span>${e((c.colorIdentity || []).join("") || "C")}</span><span>${c.commanderRank != null ? `#${c.commanderRank}` : ""}</span></button>`).join("");
        list.hidden = false;
      };
      input.addEventListener("input", () => {
        if (hidden) hidden.value = "";
        renderHits();
      });
      input.addEventListener("focus", () => { renderHits(); });
      colorRoot.querySelectorAll("[name=commanderColor], [name=inlineCommanderColor]").forEach((cb) => {
        if (cb.dataset.cmWiredColor === "1") return;
        cb.dataset.cmWiredColor = "1";
        cb.addEventListener("change", () => renderHits());
      });
      list.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-commander-pick]");
        if (!btn) return;
        const name = btn.getAttribute("data-commander-pick");
        input.value = name;
        if (hidden) hidden.value = name;
        list.innerHTML = "";
        list.hidden = true;
      });
    });
  }



  const EMBEDDED_DESKTOP_DEKS = [{"id":"deck:live:D1","name":"D1 Quintorius Spirits","commander":"Quintorius, Loremaster","commanders":["Quintorius, Loremaster"],"rows":[{"name":"Advanced Reconstruction","quantity":1},{"name":"Arcane Signet","quantity":1},{"name":"Archaeomancer's Map","quantity":1},{"name":"Atsushi, the Blazing Sky","quantity":1},{"name":"Augusta, Order Returned","quantity":1},{"name":"Bag of Holding","quantity":1},{"name":"Balefire Liege","quantity":1},{"name":"Battlefield Forge","quantity":1},{"name":"Big Score","quantity":1},{"name":"Boros Signet","quantity":1},{"name":"Cast Out","quantity":1},{"name":"Cathartic Reunion","quantity":1},{"name":"Ceaseless Conflict","quantity":1},{"name":"Clifftop Retreat","quantity":1},{"name":"Command Tower","quantity":1},{"name":"Containment Construct","quantity":1},{"name":"Currency Converter","quantity":1},{"name":"Emeria, the Sky Ruin","quantity":1},{"name":"Evolving Wilds","quantity":1},{"name":"Excava, the Risen Past","quantity":1},{"name":"Exotic Orchard","quantity":1},{"name":"Fabled Passage","quantity":1},{"name":"Faithless Looting","quantity":1},{"name":"Fellwar Stone","quantity":1},{"name":"Fields of Strife","quantity":1},{"name":"Furycalm Snarl","quantity":1},{"name":"Generous Gift","quantity":1},{"name":"Ghost Vacuum","quantity":1},{"name":"Glittering Massif","quantity":1},{"name":"Hofri Ghostforge","quantity":1},{"name":"Inspiring Vantage","quantity":1},{"name":"Karmic Guide","quantity":1},{"name":"Knight of the White Orchid","quantity":1},{"name":"Laelia, the Blade Reforged","quantity":1},{"name":"Lorehold Campus","quantity":1},{"name":"Lorehold Charm","quantity":1},{"name":"Lorehold Command","quantity":1},{"name":"Lorehold Excavation","quantity":1},{"name":"Mind Stone","quantity":1},{"name":"Mistveil Plains","quantity":1},{"name":"Moonshaker Cavalry","quantity":1},{"name":"Naya Panorama","quantity":1},{"name":"Path to Exile","quantity":1},{"name":"Perpetual Timepiece","quantity":1},{"name":"Primary Research","quantity":1},{"name":"Quintorius Kand","quantity":1},{"name":"Quintorius, Field Historian","quantity":1},{"name":"Quintorius, History Chaser","quantity":1},{"name":"Radiant Summit","quantity":1},{"name":"Rally the Ancestors","quantity":1},{"name":"Reconstruct History","quantity":1},{"name":"Release to Memory","quantity":1},{"name":"Reliquary Tower","quantity":1},{"name":"Return to Dust","quantity":1},{"name":"Rugged Prairie","quantity":1},{"name":"Sacred Peaks","quantity":1},{"name":"Seize the Spoils","quantity":1},{"name":"Selfless Spirit","quantity":1},{"name":"Serra Paragon","quantity":1},{"name":"Sevinne's Reclamation","quantity":1},{"name":"Skyclave Apparition","quantity":1},{"name":"Spirit of Resilience","quantity":1},{"name":"Squee, the Immortal","quantity":1},{"name":"Sun Titan","quantity":1},{"name":"Sunbaked Canyon","quantity":1},{"name":"Sunscorched Divide","quantity":1},{"name":"Sword of the Animist","quantity":1},{"name":"Swords to Plowshares","quantity":1},{"name":"Temple of Triumph","quantity":1},{"name":"Terramorphic Expanse","quantity":1},{"name":"Teshar, Ancestor's Apostle","quantity":1},{"name":"Thrilling Discovery","quantity":1},{"name":"Tocasia's Welcome","quantity":1},{"name":"Turbulent Steppe","quantity":1},{"name":"Valakut Exploration","quantity":1},{"name":"Venerable Warsinger","quantity":1},{"name":"Warleader's Call","quantity":1},{"name":"Wind-Scarred Crag","quantity":1},{"name":"Winds of Abandon","quantity":1},{"name":"Mountain","quantity":10},{"name":"Plains","quantity":10}],"source":"library","ok":true,"_fromDek":true,"total":100},{"id":"deck:live:D2","name":"D2 Chulane Value Loop","commander":"Chulane, Teller of Tales","commanders":["Chulane, Teller of Tales"],"rows":[{"name":"Adarkar Wastes","quantity":1},{"name":"Ancient Greenwarden","quantity":1},{"name":"Approach of the Second Sun","quantity":1},{"name":"Arcane Signet","quantity":1},{"name":"Azorius Chancery","quantity":1},{"name":"Azorius Guildgate","quantity":1},{"name":"Bant Panorama","quantity":1},{"name":"Blossoming Sands","quantity":1},{"name":"Brushland","quantity":1},{"name":"Cast Out","quantity":1},{"name":"Charming Prince","quantity":1},{"name":"Cloudblazer","quantity":1},{"name":"Coiling Oracle","quantity":1},{"name":"Command Tower","quantity":1},{"name":"Counterspell","quantity":1},{"name":"Cultivate","quantity":1},{"name":"Deputy of Detention","quantity":1},{"name":"Dream Stalker","quantity":1},{"name":"Dundoolin Weaver","quantity":1},{"name":"Elvish Visionary","quantity":1},{"name":"Ephemerate","quantity":1},{"name":"Eternal Witness","quantity":1},{"name":"Evolving Wilds","quantity":1},{"name":"Faeburrow Elder","quantity":1},{"name":"Farhaven Elf","quantity":1},{"name":"Farseek","quantity":1},{"name":"Fblthp, the Lost","quantity":1},{"name":"Fell the Mighty","quantity":1},{"name":"Fertilid","quantity":1},{"name":"Freed from the Real","quantity":1},{"name":"Glacial Fortress","quantity":1},{"name":"Hinterland Harbor","quantity":1},{"name":"Intruder Alarm","quantity":1},{"name":"Kami of Ancient Law","quantity":1},{"name":"Kiora's Follower","quantity":1},{"name":"Knight of Autumn","quantity":1},{"name":"Llanowar Elves","quantity":1},{"name":"Man-o'-War","quantity":1},{"name":"Meandering River","quantity":1},{"name":"Mirkwood Nurturer","quantity":1},{"name":"Mistmeadow Witch","quantity":1},{"name":"Mulldrifter","quantity":1},{"name":"Negate","quantity":1},{"name":"Peregrine Drake","quantity":1},{"name":"Reclamation Sage","quantity":1},{"name":"Reflector Mage","quantity":1},{"name":"Reliquary Tower","quantity":1},{"name":"Restoration Angel","quantity":1},{"name":"Roon of the Hidden Realm","quantity":1},{"name":"Satyr Wayfinder","quantity":1},{"name":"Seaside Citadel","quantity":1},{"name":"Selesnya Guildgate","quantity":1},{"name":"Shinestriker","quantity":1},{"name":"Shrieking Drake","quantity":1},{"name":"Simic Guildgate","quantity":1},{"name":"Simic Signet","quantity":1},{"name":"Skyshroud Claim","quantity":1},{"name":"Sol Ring","quantity":1},{"name":"Song of the Dryads","quantity":1},{"name":"Soulherder","quantity":1},{"name":"Stonecloaker","quantity":1},{"name":"Sylvan Ranger","quantity":1},{"name":"Tatyova, Benthic Druid","quantity":1},{"name":"Temple of Enlightenment","quantity":1},{"name":"Temur Sabertooth","quantity":1},{"name":"Terramorphic Expanse","quantity":1},{"name":"The Eternal Wanderer","quantity":1},{"name":"Thornwood Falls","quantity":1},{"name":"Tireless Provisioner","quantity":1},{"name":"Tranquil Expanse","quantity":1},{"name":"Unbreakable Formation","quantity":1},{"name":"Valorous Stance","quantity":1},{"name":"Wavesifter","quantity":1},{"name":"Whitemane Lion","quantity":1},{"name":"Wood Elves","quantity":1},{"name":"Yavimaya Coast","quantity":1},{"name":"Yavimaya Elder","quantity":1},{"name":"Zendikar's Roil","quantity":1},{"name":"Forest","quantity":10},{"name":"Island","quantity":5},{"name":"Plains","quantity":6}],"source":"library","ok":true,"_fromDek":true,"total":100},{"id":"deck:live:D3","name":"D3 Atraxa Proliferate","commander":"Atraxa, Praetors' Voice","commanders":["Atraxa, Praetors' Voice"],"rows":[{"name":"Adarkar Wastes","quantity":1},{"name":"Aetheric Amplifier","quantity":1},{"name":"Anguished Unmaking","quantity":1},{"name":"Arcane Sanctum","quantity":1},{"name":"Arcane Signet","quantity":1},{"name":"Astral Cornucopia","quantity":1},{"name":"Azorius Guildgate","quantity":1},{"name":"Azorius Signet","quantity":1},{"name":"Bitterthorn, Nissa's Animus","quantity":1},{"name":"Blight Rot","quantity":1},{"name":"Branching Evolution","quantity":1},{"name":"Brushland","quantity":1},{"name":"Cast Out","quantity":1},{"name":"Caves of Koilos","quantity":1},{"name":"Chromatic Lantern","quantity":1},{"name":"Command Tower","quantity":1},{"name":"Contagion Clasp","quantity":1},{"name":"Contentious Plan","quantity":1},{"name":"Deepglow Skate","quantity":1},{"name":"Despark","quantity":1},{"name":"Dismal Backwater","quantity":1},{"name":"Drowned Catacomb","quantity":1},{"name":"Everflowing Chalice","quantity":1},{"name":"Evolution Sage","quantity":1},{"name":"Evolving Wilds","quantity":1},{"name":"Exotic Orchard","quantity":1},{"name":"Ezuri, Stalker of Spheres","quantity":1},{"name":"Fall of the First Civilization","quantity":1},{"name":"Fellwar Stone","quantity":1},{"name":"Fertilid","quantity":1},{"name":"Flux Channeler","quantity":1},{"name":"Forgotten Ancient","quantity":1},{"name":"Fuel for the Cause","quantity":1},{"name":"Fynn, the Fangbearer","quantity":1},{"name":"Go for the Throat","quantity":1},{"name":"Golgari Guildgate","quantity":1},{"name":"Grand Coliseum","quantity":1},{"name":"Grateful Apparition","quantity":1},{"name":"Guardian Scalelord","quantity":1},{"name":"Ichormoon Gauntlet","quantity":1},{"name":"Inexorable Tide","quantity":1},{"name":"Infectious Inquiry","quantity":1},{"name":"Innkeeper's Talent","quantity":1},{"name":"Karn's Bastion","quantity":1},{"name":"Llanowar Wastes","quantity":1},{"name":"Long Goodbye","quantity":1},{"name":"Lotus Field","quantity":1},{"name":"Magistrate's Scepter","quantity":1},{"name":"Meandering River","quantity":1},{"name":"Merfolk Skydiver","quantity":1},{"name":"Mirkwood","quantity":1},{"name":"Mortify","quantity":1},{"name":"Nature's Lore","quantity":1},{"name":"Night's Whisper","quantity":1},{"name":"Octopus Form","quantity":1},{"name":"Origin of Metalbending","quantity":1},{"name":"Orzhov Guildgate","quantity":1},{"name":"Plaguemaw Beast","quantity":1},{"name":"Prologue to Phyresis","quantity":1},{"name":"Reaping Willow","quantity":1},{"name":"Repel Calamity","quantity":1},{"name":"Rootborn Defenses","quantity":1},{"name":"Selesnya Guildgate","quantity":1},{"name":"Simic Signet","quantity":1},{"name":"Sol Ring","quantity":1},{"name":"Steady Progress","quantity":1},{"name":"Strixhaven Stadium","quantity":1},{"name":"Sunpetal Grove","quantity":1},{"name":"Tekuthal, Inquiry Dominus","quantity":1},{"name":"Temple of Silence","quantity":1},{"name":"Tezzeret's Gambit","quantity":1},{"name":"Thornwood Falls","quantity":1},{"name":"Throne of Geth","quantity":1},{"name":"Thrummingbird","quantity":1},{"name":"Tidus, Yuna's Guardian","quantity":1},{"name":"Tome of Legends","quantity":1},{"name":"Tragic Arrogance","quantity":1},{"name":"Tranquil Expanse","quantity":1},{"name":"Troll Negotiations","quantity":1},{"name":"Unbreakable Formation","quantity":1},{"name":"Underground River","quantity":1},{"name":"Valorous Stance","quantity":1},{"name":"Viral Drake","quantity":1},{"name":"Vraska, Betrayal's Sting","quantity":1},{"name":"Wall of Resurgence","quantity":1},{"name":"Yavimaya Coast","quantity":1},{"name":"Forest","quantity":4},{"name":"Island","quantity":4},{"name":"Plains","quantity":2},{"name":"Swamp","quantity":3}],"source":"library","ok":true,"_fromDek":true,"total":100},{"id":"deck:live:D4","name":"D4 Felothar Walls","commander":"Felothar the Steadfast","commanders":["Felothar the Steadfast"],"rows":[{"name":"Ancient Lumberknot","quantity":1},{"name":"Anguished Unmaking","quantity":1},{"name":"Arbor Adherent","quantity":1},{"name":"Arboreal Grazer","quantity":1},{"name":"Ash Barrens","quantity":1},{"name":"Assault Formation","quantity":1},{"name":"Axebane Guardian","quantity":1},{"name":"Beast Within","quantity":1},{"name":"Betor, Ancestor's Voice","quantity":1},{"name":"Blight Pile","quantity":1},{"name":"Blossoming Sands","quantity":1},{"name":"Canopy Gargantuan","quantity":1},{"name":"Carven Caryatid","quantity":1},{"name":"Caves of Koilos","quantity":1},{"name":"Collective Effort","quantity":1},{"name":"Command Tower","quantity":1},{"name":"Crashing Drawbridge","quantity":1},{"name":"Despark","quantity":1},{"name":"Destroy Evil","quantity":1},{"name":"Dragonlord Dromoka","quantity":1},{"name":"Drumbellower","quantity":1},{"name":"Eerie Ultimatum","quantity":1},{"name":"Expel the Interlopers","quantity":1},{"name":"Fateful Absence","quantity":1},{"name":"Fell the Mighty","quantity":1},{"name":"Fortified Village","quantity":1},{"name":"Freyalise, Llanowar's Fury","quantity":1},{"name":"Golgari Guildgate","quantity":1},{"name":"Golgari Signet","quantity":1},{"name":"Guardian of Faith","quantity":1},{"name":"Huatli, the Sun's Heart","quantity":1},{"name":"Ikra Shidiqi, the Usurper","quantity":1},{"name":"Indomitable Ancients","quantity":1},{"name":"Isolated Chapel","quantity":1},{"name":"Krosan Verge","quantity":1},{"name":"Llanowar Wastes","quantity":1},{"name":"Mirkwood","quantity":1},{"name":"Myriad Landscape","quantity":1},{"name":"Nyx-Fleece Ram","quantity":1},{"name":"Orzhov Signet","quantity":1},{"name":"Overgrown Battlement","quantity":1},{"name":"Path of Ancestry","quantity":1},{"name":"Phyrexian Arena","quantity":1},{"name":"Portcullis Vine","quantity":1},{"name":"Putrefy","quantity":1},{"name":"Sandsteppe Citadel","quantity":1},{"name":"Sapling of Colfenor","quantity":1},{"name":"Saruli Caretaker","quantity":1},{"name":"Selesnya Signet","quantity":1},{"name":"Shalai, Voice of Plenty","quantity":1},{"name":"Shield-Wall Sentinel","quantity":1},{"name":"Sidar Kondo of Jamuraa","quantity":1},{"name":"Slaughter the Strong","quantity":1},{"name":"Sol Ring","quantity":1},{"name":"Soul of New Phyrexia","quantity":1},{"name":"Sun Titan","quantity":1},{"name":"Sunpetal Grove","quantity":1},{"name":"Sylvan Caryatid","quantity":1},{"name":"Tree of Perdition","quantity":1},{"name":"Tree of Redemption","quantity":1},{"name":"Treefolk Umbra","quantity":1},{"name":"Valorous Stance","quantity":1},{"name":"Vindicate","quantity":1},{"name":"Wakestone Gargoyle","quantity":1},{"name":"Walking Bulwark","quantity":1},{"name":"Wall of Blossoms","quantity":1},{"name":"Wall of Limbs","quantity":1},{"name":"Wall of Mulch","quantity":1},{"name":"Wall of Omens","quantity":1},{"name":"Wall of Roots","quantity":1},{"name":"Wave of Reckoning","quantity":1},{"name":"Weathered Sentinels","quantity":1},{"name":"Welcoming Vampire","quantity":1},{"name":"Wingmantle Chaplain","quantity":1},{"name":"Wood Elves","quantity":1},{"name":"Forest","quantity":8},{"name":"Plains","quantity":8},{"name":"Swamp","quantity":8}],"source":"library","ok":true,"_fromDek":true,"total":100},{"id":"deck:live:D5","name":"D5 Shadrix Aristocrats","commander":"Shadrix Silverquill","commanders":["Shadrix Silverquill"],"rows":[{"name":"Angel of Indemnity","quantity":1},{"name":"Anguished Unmaking","quantity":1},{"name":"Anointer Priest","quantity":1},{"name":"Arcane Signet","quantity":1},{"name":"Bastion of Remembrance","quantity":1},{"name":"Blight Rot","quantity":1},{"name":"Blood Artist","quantity":1},{"name":"Boggart Mischief","quantity":1},{"name":"Castle Ardenvale","quantity":1},{"name":"Caves of Koilos","quantity":1},{"name":"Clachan Festival","quantity":1},{"name":"Combat Calligrapher","quantity":1},{"name":"Command Tower","quantity":1},{"name":"Concealed Courtyard","quantity":1},{"name":"Corpse Knight","quantity":1},{"name":"Cruel Celebrant","quantity":1},{"name":"Deadly Dispute","quantity":1},{"name":"Earth Kingdom Jailer","quantity":1},{"name":"Elas il-Kor, Sadistic Pilgrim","quantity":1},{"name":"Elspeth, Sun's Nemesis","quantity":1},{"name":"Emptiness","quantity":1},{"name":"Filigree Familiar","quantity":1},{"name":"Fracture","quantity":1},{"name":"Genesis Chamber","quantity":1},{"name":"Hidden Stockpile","quantity":1},{"name":"Impassioned Orator","quantity":1},{"name":"Indulging Patrician","quantity":1},{"name":"Intangible Virtue","quantity":1},{"name":"Isolated Chapel","quantity":1},{"name":"Kambal, Profiteering Mayor","quantity":1},{"name":"Keeper of the Accord","quantity":1},{"name":"Lethal Scheme","quantity":1},{"name":"Lingering Souls","quantity":1},{"name":"Marauding Blight-Priest","quantity":1},{"name":"Mind Stone","quantity":1},{"name":"Mirkwood Bats","quantity":1},{"name":"Myr Battlesphere","quantity":1},{"name":"Nadier's Nightblade","quantity":1},{"name":"Night's Whisper","quantity":1},{"name":"Ophiomancer","quantity":1},{"name":"Orzhov Basilica","quantity":1},{"name":"Orzhov Signet","quantity":1},{"name":"Ossification","quantity":1},{"name":"Pawn of Ulamog","quantity":1},{"name":"Phyrexian Arena","quantity":1},{"name":"Pitiless Plunderer","quantity":1},{"name":"Priest of Forgotten Gods","quantity":1},{"name":"Promise of Loyalty","quantity":1},{"name":"Raise the Alarm","quantity":1},{"name":"Rootborn Defenses","quantity":1},{"name":"Scoured Barrens","quantity":1},{"name":"Sevinne's Reclamation","quantity":1},{"name":"Shineshadow Snarl","quantity":1},{"name":"Skullclamp","quantity":1},{"name":"Smuggler's Copter","quantity":1},{"name":"Sol Ring","quantity":1},{"name":"Spectral Procession","quantity":1},{"name":"Staff of the Storyteller","quantity":1},{"name":"Swords to Plowshares","quantity":1},{"name":"Teysa Karlov","quantity":1},{"name":"Tithe Taker","quantity":1},{"name":"Unbreakable Formation","quantity":1},{"name":"Vault of the Archangel","quantity":1},{"name":"Village Rites","quantity":1},{"name":"Viscera Seer","quantity":1},{"name":"Welcoming Vampire","quantity":1},{"name":"Windborn Muse","quantity":1},{"name":"Woe Strider","quantity":1},{"name":"Yahenni, Undying Partisan","quantity":1},{"name":"Zulaport Cutthroat","quantity":1},{"name":"Plains","quantity":15},{"name":"Swamp","quantity":14}],"source":"library","ok":true,"_fromDek":true,"total":100},{"id":"deck:live:D6","name":"D6 Krenko Goblins","commander":"Krenko, Mob Boss","commanders":["Krenko, Mob Boss"],"rows":[{"name":"Abrade","quantity":1},{"name":"Anger","quantity":1},{"name":"Arcane Signet","quantity":1},{"name":"Barrage of Expendables","quantity":1},{"name":"Battle Hymn","quantity":1},{"name":"Beetleback Chief","quantity":1},{"name":"Buried Ruin","quantity":1},{"name":"Castle Embereth","quantity":1},{"name":"Chancellor of the Forge","quantity":1},{"name":"Chaos Warp","quantity":1},{"name":"Cinder Strike","quantity":1},{"name":"Conspicuous Snoop","quantity":1},{"name":"Den of the Bugbear","quantity":1},{"name":"Dragon Fodder","quantity":1},{"name":"Empty the Warrens","quantity":1},{"name":"Evolving Wilds","quantity":1},{"name":"Faithless Looting","quantity":1},{"name":"Fanatical Firebrand","quantity":1},{"name":"Foundry Street Denizen","quantity":1},{"name":"Goblin Bombardment","quantity":1},{"name":"Goblin Burrows","quantity":1},{"name":"Goblin Chieftain","quantity":1},{"name":"Goblin Gathering","quantity":1},{"name":"Goblin Instigator","quantity":1},{"name":"Goblin Matron","quantity":1},{"name":"Goblin Piledriver","quantity":1},{"name":"Goblin Rabblemaster","quantity":1},{"name":"Goblin Ringleader","quantity":1},{"name":"Goblin Trashmaster","quantity":1},{"name":"Goblin Warchief","quantity":1},{"name":"Gundabad Opportunist","quantity":1},{"name":"Hobgoblin Bandit Lord","quantity":1},{"name":"Hordeling Outburst","quantity":1},{"name":"Idol of Oblivion","quantity":1},{"name":"Impact Tremors","quantity":1},{"name":"Kher Keep","quantity":1},{"name":"Krenko's Command","quantity":1},{"name":"Krenko, Tin Street Kingpin","quantity":1},{"name":"Legion Warboss","quantity":1},{"name":"Light Up the Stage","quantity":1},{"name":"Lightning Greaves","quantity":1},{"name":"Massive Raid","quantity":1},{"name":"Mind Stone","quantity":1},{"name":"Mogg War Marshal","quantity":1},{"name":"Ogre Battledriver","quantity":1},{"name":"Outpost Siege","quantity":1},{"name":"Pashalik Mons","quantity":1},{"name":"Patchwork Banner","quantity":1},{"name":"Purphoros, God of the Forge","quantity":1},{"name":"Quest for the Goblin Lord","quantity":1},{"name":"Raid Bombardment","quantity":1},{"name":"Reckless Bushwhacker","quantity":1},{"name":"Shared Animosity","quantity":1},{"name":"Siege-Gang Commander","quantity":1},{"name":"Skirk Fire Marshal","quantity":1},{"name":"Skirk Prospector","quantity":1},{"name":"Skullclamp","quantity":1},{"name":"Sol Ring","quantity":1},{"name":"Sourbread Auntie","quantity":1},{"name":"Swiftfoot Boots","quantity":1},{"name":"Thornbite Staff","quantity":1},{"name":"Thousand-Year Elixir","quantity":1},{"name":"Thrill of Possibility","quantity":1},{"name":"Tweeze","quantity":1},{"name":"Vandalblast","quantity":1},{"name":"Voldaren Epicure","quantity":1},{"name":"Witty Roastmaster","quantity":1},{"name":"Mountain","quantity":32}],"source":"library","ok":true,"_fromDek":true,"total":100}];
  let hostCatalogDecks = null; /* /api/setup library decks (deck:live:*) for Library picker */
  let cachedGuestOrigin = null;
  let desktopDekDecks = null; /* D1–D6 from Desktop Deck Files */

  async function loadHostCatalogDecks() {
    if (hostCatalogDecks && desktopDekDecks) return hostCatalogDecks;
    try {
      const setup = await lobbyApi("/api/setup");
      if (setup && setup.guestOrigin) cachedGuestOrigin = setup.guestOrigin;
      /* Prefer real Desktop .dek lists when the host exposes them. */
      desktopDekDecks = (typeof EMBEDDED_DESKTOP_DEKS !== "undefined" && EMBEDDED_DESKTOP_DEKS.length)
        ? EMBEDDED_DESKTOP_DEKS
        : (desktopDekDecks || []);
      try {
        const dekPack = await lobbyApi("/api/desktop-deks");
        if (Array.isArray(dekPack && dekPack.decks) && dekPack.decks.length) desktopDekDecks = dekPack.decks;
      } catch (_) { /* embedded fallback */ }
      const live = (setup.decks || []).filter((d) =>
        d && String(d.id || "").startsWith("deck:live:") && d.ok !== false
      );
      /* Desktop .dek wins label+list; fall back to live catalog ids for prepare. */
      const byLive = new Map(live.map((d) => [d.id, d]));
      hostCatalogDecks = (desktopDekDecks.length ? desktopDekDecks : live).map((d) => {
        const liveHit = byLive.get(d.id) || byLive.get("deck:live:" + String(d.id || "").replace(/^deck:live:/, ""));
        return Object.assign({}, liveHit || {}, d, {
          id: d.id || (liveHit && liveHit.id),
          name: d.name || (liveHit && liveHit.name),
          commander: d.commander || (liveHit && liveHit.commander),
          rows: d.rows || null,
          _fromDek: !!d.rows,
        });
      }).filter((d) => d && d.id);
      if (!hostCatalogDecks.length) hostCatalogDecks = live;
    } catch (_) {
      hostCatalogDecks = hostCatalogDecks || [];
      desktopDekDecks = desktopDekDecks || [];
    }
    return hostCatalogDecks;
  }

  function libraryDecksForPicker() {
    const local = (C.state.decks || []).filter((d) => !d.archived);
    const host = (hostCatalogDecks || []).map((d) => ({
      id: d.id,
      name: d.name || (d.commander ? ("Host · " + d.commander) : d.id),
      archived: false,
      _hostCatalog: true,
      commander: d.commander,
      cost: d.cost,
    }));
    const seen = new Set(local.map((d) => d.id));
    const merged = local.slice();
    host.forEach((d) => { if (!seen.has(d.id)) merged.push(d); });
    return merged;
  }

  function seatFromHostCatalogMeta(meta, you) {
    const commanderName = String(meta.commander || "").trim();
    if (!commanderName) throw Error("That host deck has no commander.");
    const exact = (C.catalog && C.catalog.exact) ? C.catalog.exact(commanderName) : null;
    const colors = (exact && exact.colorIdentity) || [];
    let commanders = [{
      name: commanderName,
      cardId: exact && exact.id,
      colorIdentity: colors.slice(),
      gameChanger: !!(exact && exact.gameChanger),
    }];
    let cards = [];
    if (Array.isArray(meta.rows) && meta.rows.length) {
      const cmdSet = new Set([commanderName.toLowerCase()]);
      (meta.commanders || []).forEach((c) => {
        const n = typeof c === "string" ? c : c.name;
        if (n) cmdSet.add(String(n).toLowerCase());
      });
      if (Array.isArray(meta.commanders) && meta.commanders.length) {
        commanders = meta.commanders.map((c) => {
          const n = typeof c === "string" ? c : c.name;
          const hit = (C.catalog && C.catalog.exact) ? C.catalog.exact(n) : null;
          return {
            name: n,
            cardId: hit && hit.id,
            colorIdentity: (hit && hit.colorIdentity) || [],
            gameChanger: !!(hit && hit.gameChanger),
          };
        }).filter((c) => c.name);
      }
      cards = meta.rows.map((r) => {
        const name = typeof r === "string" ? r : r.name;
        const quantity = Number((r && r.quantity) || 1) || 1;
        return { name, quantity, basic: /^(plains|island|swamp|mountain|forest|wastes)$/i.test(name) };
      }).filter((r) => r.name && !cmdSet.has(r.name.toLowerCase()));
    } else {
      const basicByColor = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
      const basicNames = colors.length
        ? colors.map((c) => basicByColor[c]).filter(Boolean)
        : ["Wastes"];
      let left = 99;
      basicNames.forEach((name, i) => {
        const quantity = i === basicNames.length - 1 ? left : Math.floor(99 / basicNames.length);
        left -= quantity;
        if (quantity > 0) cards.push({ name, quantity, basic: true });
      });
    }
    return L.seat({
      id: "seat:" + meta.id,
      name: meta.name || commanderName,
      kind: "library",
      deckId: meta.id,
      you,
      commanders,
      cards,
    });
  }


  function deckSourceFields({includeName = true, defaultFrom = "library", presetCommander = ""} = {}) {
    const decks = libraryDecksForPicker();
    const bracket = L.bracketOf(lobby.bracket);
    const capLabel = lobby.cap === ""
      ? (bracket.gameChangers === Infinity ? "no limit" : String(bracket.gameChangers))
      : String(lobby.cap);
    const styleChip = buildDefCustomized(lobby.hostBuildDef)
      ? `<p class="cm-muted cm-lobby-style-chip">Play style set</p>` : "";
    return `<div class="cm-full cm-lobby-source-band">${s("Where the deck comes from", "from", [
      ["library", "One of your decks"],
      ["paste", "A pasted decklist"],
      ["generated", "Build from Commander"],
    ], defaultFrom)}<div class="cm-lobby-color-filter" data-from="generated" hidden><span class="cm-muted cm-lobby-color-label">Colors</span>${colorPillsHtml("commanderColor")}</div></div>`
      + `<div class="cm-full" data-from="library">${s("Your deck", "deckId", decks.map((d) => [d.id, d.name]), decks[0] ? decks[0].id : "")}</div>`
      + `<div class="cm-full" data-from="paste" hidden>${includeName ? f("Name this seat", "name", "", 'maxlength="160" placeholder="whose deck is this?"') : ""}<label class="cm-full">Decklist<textarea name="paste" rows="8" maxlength="20000" placeholder="1 Sol Ring&#10;30 Mountain…"></textarea></label></div>`
      + `<div class="cm-full" data-from="generated" hidden>
          <label>Commander to build from<input name="commanderQuery" maxlength="160" placeholder="Search commanders" autocomplete="off" value="${e(presetCommander)}"></label>
          <input type="hidden" name="commander" value="${e(presetCommander)}">
          <div class="cm-commander-results" data-commander-results hidden></div>
          ${styleChip}
          <div class="cm-actions cm-lobby-build-actions">${b("Define play style", "lobby-build-style", {scope: "host"}, false, {cls: "compact"})}</div>
          ${note(`Builds a 100 to bracket ${bracket.n} with Game Changer cap ${capLabel}.`)}
        </div>`;
  }

  function openHostDeckModal(opts = {}) {
    const defaultFrom = opts.from || "library";
    const presetCommander = String(opts.commander || "").trim();
    const frm = form("Seat your deck", deckSourceFields({includeName: false, defaultFrom, presetCommander}), async (v) => {
      if ((v.from || "library") === "generated" && !String(v.commander || "").trim()) {
        throw Error("Pick a commander from the search results.");
      }
      const kind = v.from || "library";
      setBuildBusy(true, "host");
      let seat;
      try {
        seat = await buildSeatFromValues(v, true);
        seat = finalizeBuiltSeat(seat);
        seat = await persistLobbyDraft(seat, kind);
        seat = finalizeBuiltSeat(seat);
      } finally {
        setBuildBusy(false, "host");
      }
      const check = L.validate(seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
      if (!check.ok) {
        seat = finalizeBuiltSeat(seat);
      }
      lobby.host = {seat, ready: false};
      redraw();
    }, "Seat it");
    wireProgressive(frm);
  }

  function openOpponentRoleModal() {
    const free = lobby.opponents.findIndex((o) => o.role === "unused");
    if (free < 0 && lobby.opponents.every((o) => o.role !== "unused")) {
      /* still allow reconfigure: pick a slot */
    }
    const slots = lobby.opponents.map((o, i) => [String(i), `Seat ${i + 2} · ${o.role}`]);
    const defaultSlot = String(free >= 0 ? free : 0);
    form("Seat an opponent",
      s("Seat", "slot", slots, defaultSlot)
      + s("Who sits here", "role", [["human", "Human"], ["ai", "AI"], ["unused", "Unused"]], "human")
      + note("Human seats get Name, Email, Email Invite, and Copy Link. The guest brings their own deck. AI seats get the in-seat deck builder."),
      (v) => {
        const i = Math.max(0, Math.min(SLOT_COUNT - 1, Number(v.slot) || 0));
        const role = ["unused", "human", "ai"].includes(v.role) ? v.role : "unused";
        if (role === "unused") lobby.opponents[i] = EMPTY_OPP();
        else {
          const prev = lobby.opponents[i] || EMPTY_OPP();
          const keepSeat = role === "ai" && prev.role === "ai" ? prev.seat : null;
          lobby.opponents[i] = {
            role,
            ready: false,
            seat: keepSeat,
            guestName: role === "human" ? (prev.guestName || "") : "",
            guestEmail: role === "human" ? (prev.guestEmail || "") : "",
            inviteId: role === "human" ? (prev.inviteId || "") : "",
          };
          if (role === "human") ensureInviteId(lobby.opponents[i]);
        }
        redraw();
      }, "Save seat");
  }

  function humanInviteEditor(oppIndex, opp) {
    ensureInviteId(opp);
    const name = opp.guestName || "";
    const email = opp.guestEmail || "";
    return `<div class="cm-lobby-invite" data-opp="${oppIndex}">
      <label>Name<input name="guestName" maxlength="80" value="${e(name)}" placeholder="Friend's name" autocomplete="name" data-action-change="lobby-invite-field" data-opp="${oppIndex}" data-field="guestName"></label>
      <label>Email<input name="guestEmail" type="email" maxlength="160" value="${e(email)}" placeholder="friend@example.com" autocomplete="email" data-action-change="lobby-invite-field" data-opp="${oppIndex}" data-field="guestEmail"></label>
      <div class="cm-actions cm-lobby-invite-actions">
        ${b("Email Invite", "lobby-email-invite", {opp: String(oppIndex)}, true, {cls: "compact"})}
        ${b("Copy Link", "lobby-copy-invite", {opp: String(oppIndex)}, false, {cls: "compact"})}
      </div>
      <p class="cm-muted">Guest picks their deck after they join. Host does not set it here.</p>
    </div>`;
  }

  function inlineDeckEditor(oppIndex, opp) {
    const decks = libraryDecksForPicker();
    const deckOpts = decks.map((d) => `<option value="${e(d.id)}">${e(d.name)}</option>`).join("");
    const from = (opp.seat && opp.seat.kind) || (opp.role === "ai" ? "generated" : "library");
    const styleChip = buildDefCustomized(opp.buildDef)
      ? `<p class="cm-muted cm-lobby-style-chip">Play style set</p>` : "";
    return `<div class="cm-lobby-inline" data-opp="${oppIndex}">
      <div class="cm-lobby-source-band">
        <label class="cm-lobby-inline-label">Deck source
          <select name="inlineFrom" data-action-change="lobby-inline-from" data-opp="${oppIndex}">
            <option value="library"${from === "library" ? " selected" : ""}>Library</option>
            <option value="paste"${from === "paste" ? " selected" : ""}>Paste</option>
            <option value="generated"${from === "generated" ? " selected" : ""}>Build from Commander</option>
          </select>
        </label>
        <div class="cm-lobby-color-filter"${from === "generated" ? "" : " hidden"} data-lobby-color-when="generated">
          <span class="cm-muted cm-lobby-color-label">Colors</span>${colorPillsHtml("inlineCommanderColor")}
        </div>
      </div>
      <div data-inline-from="library"${from === "library" ? "" : " hidden"}>
        <label>Deck<select name="inlineDeck">${deckOpts}</select></label>
      </div>
      <div data-inline-from="paste"${from === "paste" ? "" : " hidden"}>
        <label>Paste<textarea name="inlinePaste" rows="4" maxlength="20000" placeholder="1 Sol Ring…"></textarea></label>
      </div>
      <div data-inline-from="generated"${from === "generated" ? "" : " hidden"}>
        <label>Commander<input name="inlineCommanderQuery" maxlength="160" placeholder="Search commanders" autocomplete="off"></label>
        <input type="hidden" name="inlineCommander" value="">
        <div class="cm-commander-results" data-commander-results hidden></div>
        ${styleChip}
      </div>
      <div class="cm-actions cm-lobby-build-actions">${from === "generated" ? b("Define play style", "lobby-build-style", {opp: String(oppIndex)}, false, {cls: "compact"}) : ""}${b(from === "generated" ? "Apply build-100" : "Apply deck", "lobby-inline-apply", {opp: String(oppIndex)}, true, {cls: "compact"})}</div>
    </div>`;
  }

  function seatCommanderLabel(seat) {
    const cmds = ((seat && seat.commanders) || []).map((c) => c.name).filter(Boolean);
    return cmds.length ? cmds.join(" & ") : "";
  }
  function seatTraitLabel(seat) {
    if (!seat) return "";
    const cmd = seatCommanderLabel(seat);
    let name = String(seat.name || "").trim();
    if (cmd && name.toLowerCase().startsWith(cmd.toLowerCase())) {
      name = name.slice(cmd.length).replace(/^\s*[\(\-–—·•]+/, "").replace(/\)\s*$/, "").trim();
    }
    if (name && cmd && name.toLowerCase() === cmd.toLowerCase()) name = "";
    if (!name && seat.kind === "generated") name = "Labs";
    if (!name && seat.kind === "library") name = "Library";
    if (!name && seat.kind === "paste") name = "Paste";
    return name;
  }
  function seatHeaderPrimary(seat, fallback) {
    return seatCommanderLabel(seat) || (seat && seat.name) || fallback;
  }
  function seatHeaderSub(roleLabel, seat, emptyHint) {
    if (!seat) return emptyHint ? `<span class="cm-muted">${e(emptyHint)}</span>` : `<span class="cm-muted">${e(roleLabel)}</span>`;
    const traits = seatTraitLabel(seat);
    const line = traits ? `${roleLabel} · ${traits}` : roleLabel;
    return `<span class="cm-muted">${e(line)}</span>`;
  }
  function seatBoxHost(t) {
    const seat = lobby.host && lobby.host.seat;
    const check = seat ? t.checks.find((c) => c.seatId === seat.id) : null;
    const order = t.seating.order;
    const at = seat ? order.indexOf(seat.id) : -1;
    const ready = !!(lobby.host && lobby.host.ready);
    const body = seat
      ? seatBody(seat, check, at, ready, {host: true})
      : `<p class="cm-muted">No deck yet.</p><div class="cm-actions">${b("Seat your deck", "lobby-host-deck", {}, true, {cls: "compact"})}</div>`;
    const primary = seat ? seatHeaderPrimary(seat, "You (Host)") : "You (Host)";
    const sub = seat
      ? seatHeaderSub("You (Host)", seat)
      : `<span class="cm-muted">No deck yet</span>`;
    return `<article class="cm-lobby-seat is-you${check && !check.ok ? " is-blocked" : ""}${ready ? " is-ready" : ""}">
      <header><div class="cm-lobby-seat-titles"><h3>${e(primary)}</h3><div class="cm-lobby-seat-sub">${sub}</div></div>
        ${seat ? readyCorner(ready, "host") : ""}</header>
      ${body}
    </article>`;
  }

  function seatBoxOpp(i, opp, t) {
    const roleClass = opp.role === "human" ? "is-human" : opp.role === "ai" ? "is-ai" : "is-unused";
    const seat = opp.seat;
    const check = seat ? t.checks.find((c) => c.seatId === seat.id) : null;
    const at = seat ? t.seating.order.indexOf(seat.id) : -1;
    const ready = !!opp.ready;
    const roleLabel = opp.role === "unused" ? "Open" : opp.role === "ai" ? "AI" : (opp.guestName || "Human");
    let body = "";
    let readyBtn = "";
    if (opp.role === "unused") {
      body = `<p class="cm-muted">Empty seat.</p>`;
    } else if (opp.role === "human") {
      body = humanInviteEditor(i, opp);
      if (seat) {
        body = seatBody(seat, check, at, ready, {host: false, opp: i, human: true}) + body;
        readyBtn = readyCorner(ready, "opp", i);
      }
    } else if (!seat) {
      body = inlineDeckEditor(i, opp);
    } else {
      body = seatBody(seat, check, at, ready, {host: false, opp: i});
      if (opp.editing) body += inlineDeckEditor(i, opp);
      readyBtn = readyCorner(ready, "opp", i);
    }
    let primary = roleLabel;
    let sub = "";
    if (opp.role === "unused") {
      primary = `Seat ${i + 2} - Open`;
      sub = "";
    } else if (seat) {
      primary = seatHeaderPrimary(seat, roleLabel);
      sub = seatHeaderSub(opp.role === "ai" ? "AI" : "Human", seat);
    } else if (opp.role === "human") {
      primary = roleLabel;
      sub = `<span class="cm-muted">Waiting on guest</span>`;
    } else {
      primary = "AI";
      sub = `<span class="cm-muted">No deck yet</span>`;
    }
    return `<article class="cm-lobby-seat ${roleClass}${check && !check.ok ? " is-blocked" : ""}${ready ? " is-ready" : ""}" data-opp="${i}">
      <header><div class="cm-lobby-seat-titles"><h3>${e(primary)}</h3><div class="cm-lobby-seat-sub">${sub}</div></div>
        ${readyBtn}</header>
      ${body}
    </article>`;
  }

  function commanderArtUrl(seat) {
    const cmd = (seat.commanders && seat.commanders[0]) || null;
    if (!cmd) return "";
    if (cmd.cardId && C.card) {
      const c = C.card(cmd.cardId);
      if (c && c.image) {
        return String(c.image)
          .replace("/small/", "/normal/")
          .replace("/large/", "/normal/");
      }
    }
    if (cmd.name) return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmd.name)}&format=image&version=normal`;
    return "";
  }

  function typeCounts(seat) {
    const buckets = [
      ["Creature", 0, "#6dbf6d"],
      ["Instant", 0, "#6aa8ff"],
      ["Sorcery", 0, "#ff8a5c"],
      ["Artifact", 0, "#c0c0c0"],
      ["Enchantment", 0, "#e0a0ff"],
      ["Planeswalker", 0, "#ff6ad5"],
      ["Land", 0, "#c4a35a"],
      ["Other", 0, "#8899aa"],
    ];
    const rows = []
      .concat(seat.commanders || [])
      .concat(seat.cards || []);
    for (const row of rows) {
      const qty = Number(row.quantity) || 1;
      let tl = row.typeLine || "";
      if (!tl && row.cardId && C.card) tl = (C.card(row.cardId) || {}).typeLine || "";
      if (!tl && row.name && C.catalog && C.catalog.exact) {
        const hit = C.catalog.exact(row.name);
        if (hit) {
          tl = hit.typeLine || "";
          if (!row.cardId && hit.id) row.cardId = hit.id;
          if (tl) row.typeLine = tl;
        }
      }
      const t = String(tl).toLowerCase();
      let hit = "Other";
      if (/\bland\b/.test(t)) hit = "Land";
      else if (/\bcreature\b/.test(t)) hit = "Creature";
      else if (/\binstant\b/.test(t)) hit = "Instant";
      else if (/\bsorcery\b/.test(t)) hit = "Sorcery";
      else if (/\bartifact\b/.test(t)) hit = "Artifact";
      else if (/\benchantment\b/.test(t)) hit = "Enchantment";
      else if (/\bplaneswalker\b/.test(t)) hit = "Planeswalker";
      const b = buckets.find((x) => x[0] === hit);
      if (b) b[1] += qty;
    }
    return buckets.filter((b) => b[1] > 0);
  }

  function deckedVisual(seat, under) {
    const art = commanderArtUrl(seat);
    const cmdName = ((seat.commanders && seat.commanders[0]) || {}).name || seat.name || "Commander";
    const artHtml = art
      ? `<button type="button" class="cm-lobby-art-btn" data-action="lobby-art-zoom" data-art="${e(art)}" data-name="${e(cmdName)}" aria-label="Enlarge ${e(cmdName)}"><img class="cm-lobby-art" src="${e(art)}" alt="${e(cmdName)}" loading="lazy" referrerpolicy="no-referrer"></button>`
      : `<div class="cm-lobby-art cm-lobby-art-fallback">${e(cmdName)}</div>`;
    const counts = typeCounts(seat);
    const max = Math.max(1, ...counts.map((c) => c[1]));
    const bars = counts.map(([label, n, color]) => {
      const pct = Math.max(8, Math.round((n / max) * 100));
      return `<div class="cm-lobby-type-row"><span title="${e(label)}">${e(label)}</span><div class="cm-lobby-type-bar"><i style="width:${pct}%;background:${color}"></i></div><strong>${n}</strong></div>`;
    }).join("");
    /* Right column: type bars, then fit status, then View|Change row, then sim report link. */
    return `<div class="cm-lobby-decked">${artHtml}<div class="cm-lobby-types">${bars || `<p class="cm-muted">No type breakdown yet.</p>`}${under || ""}</div></div>`;
  }

  function unresolvedNames(seat) {
    const unknown = [];
    const seen = new Set();
    const rows = [].concat(seat.commanders || []).concat(seat.cards || []);
    for (const row of rows) {
      const name = String(row.name || "").trim();
      if (!name) continue;
      const id = row.cardId || "";
      const known = id && C.card && C.card(id);
      const exact = (!known && C.catalog && C.catalog.exact) ? C.catalog.exact(name) : known;
      if (exact) {
        if (!row.cardId && exact.id) row.cardId = exact.id;
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unknown.push(name);
    }
    return unknown;
  }

  function seatMappedOk(seat) {
    const size = (seat.commanders || []).length + (seat.cards || []).reduce((n, r) => n + (Number(r.quantity) || 1), 0);
    if (size < 90) return {ok: false, why: `Deck has ${size} cards; map a full ~100 before Ready.`};
    const unknown = unresolvedNames(seat);
    if (unknown.length) return {ok: false, why: `${unknown.length} name${unknown.length === 1 ? "" : "s"} not in catalog (e.g. ${unknown[0]}). Fix before Ready.`, unknown};
    return {ok: true, why: "", unknown: []};
  }

  function seatBody(seat, check, at, ready, meta) {
    if (!check) return `<p class="cm-muted">${e(seat.name)}</p>`;
    const gcCap = check.cap === Infinity ? "any" : check.cap;
    const problems = check.issues.map((i) => `<li class="cm-lobby-issue is-${e(i.severity)}">${e(i.why)}</li>`).join("");
    const viewBtn = b("View cards", "lobby-view-cards", {seat: seat.id}, false, {cls: "compact"});
    const changeBtn = meta.host
      ? b("Change deck", "lobby-host-deck", {}, false, {cls: "compact"})
      : meta.human
        ? ""
        : b("Change deck", "lobby-change-opp-deck", {opp: String(meta.opp)}, false, {cls: "compact"});
    /* Deck Summary = in-lobby modal (not a vague Clear parent). Clear lives inside that modal for AI. */
    const summaryBtn = b("Deck Summary", "lobby-deck-summary", {
      seat: seat.id,
      opp: meta.host || meta.human ? "" : String(meta.opp),
      host: meta.host ? "1" : "",
    }, false, {cls: "compact"});
    const trimBtns = (!check.ok && check.issues.some((i) => i.code === "gameChangers"))
      ? b("Trim to the bracket", "lobby-trim", {seat: seat.id}, true, {cls: "compact"})
        + b("Change the bracket", "lobby-bracket-up", {}, false, {cls: "compact"})
      : "";
    const status = problems
      ? `<ul class="cm-lobby-issues">${problems}</ul>`
      : `<p class="cm-lobby-ok">${ready ? "Ready." : "Deck fits the table."}</p>`;
    const underStatus = `<div class="cm-lobby-under">${status}</div>`;
    const row = `<div class="cm-actions cm-lobby-under-row">${viewBtn}${changeBtn || ""}${summaryBtn}${trimBtns}</div>`;
    const sim = `<p class="cm-lobby-sim"><a href="#" data-action="lobby-sim-report" data-seat="${e(seat.id)}">Generate Simulation Report</a></p>`;
    return `<dl class="cm-lobby-figs">
        <div><dt>Cards</dt><dd class="${check.size === L.DECK_SIZE ? "" : "cm-amber"}">${check.size} of ${L.DECK_SIZE}</dd></div>
        <div><dt>GC</dt><dd class="${check.gameChangers > check.cap ? "cm-amber" : ""}">${check.gameChangers} of ${gcCap}</dd></div>
        <div><dt>Score</dt><dd${seat.scoreWhy ? ` title="${e(seat.scoreWhy)}"` : ""}>${seat.score === null ? "-" : seat.score}</dd></div>
        <div><dt>Colors</dt><dd>${check.colors.length ? C.colors(check.colors) : "-"}</dd></div>
      </dl>
      ${deckedVisual(seat, underStatus)}
      <div class="cm-lobby-under-full">${row}${sim}</div>`;
  }

  function readyCorner(ready, who, opp) {
    const attrs = who === "host" ? {who: "host"} : {who: "opp", opp: String(opp)};
    return `<div class="cm-lobby-ready">${b(ready ? "Ready" : "Ready Up", "lobby-ready", attrs, !ready, {cls: "compact" + (ready ? " is-on" : "")})}</div>`;
  }

  let startInFlight = false;

  function allReadyForStart(t) {
    if (!t.ready) return false; /* deck legality / min seats */
    if (!lobby.host || !lobby.host.ready) return false;
    /* Human guests bring their own decks on the guest gateway — host does not Ready them. */
    return lobby.opponents.every((o) => {
      if (!o || o.role === "unused") return true;
      if (o.role === "human") return true;
      return !!(o.seat && o.ready);
    });
  }

  views.play = async (params) => {
    const seatCode = String((params && params.get && params.get("seat")) || "").trim();
    try { await loadHostCatalogDecks(); } catch (_) {}
    /* Guest seat lobby — must NOT fall through to Decks home. */
    C.main.innerHTML = C.pageHead("Your seat", "Guest invite")
      + `<section class="v-panel cm-guest-seat-lobby">
        <p>You're invited to this Commander table${seatCode ? " (code <code>" + e(seatCode) + "</code>)" : ""}.</p>
        <p class="cm-muted">This is your seat lobby — not Decks. When the host starts the private table, use the live join link from Email Invite / the host (cloud guest page). You can also open the host Game lobby on this machine to watch seating.</p>
        <div class="cm-actions">
          ${b("Open Game lobby", "play-open-game", {}, true)}
          ${cachedGuestOrigin ? b("Open guest join page", "play-open-guest-origin", {}, false) : ""}
        </div>
      </section>`;
  };

  actions["play-open-game"] = () => { location.hash = "game"; };
  actions["play-open-guest-origin"] = () => {
    if (!cachedGuestOrigin) { C.notice("Guest gateway is not available yet.", true); return; }
    window.open(cachedGuestOrigin.replace(/\/$/, "") + "/", "_blank", "noopener");
  };

  views.game = async () => {
    try { await loadHostCatalogDecks(); } catch (_) {}
    if (!L) { C.main.innerHTML = C.pageHead("Play a game", "") + note("The lobby module has not loaded yet. Reload the page.", true); return; }
    const t = table();
    const bracket = t.bracket;
    const brackets = L.BRACKETS.map((x) => [String(x.n), `${x.n} · ${x.name}`]);
    const head = C.pageHead("Play a game",
      b("Seat an opponent", "lobby-add", {}, false, {cls: "compact"})
      + b("Clear the table", "lobby-clear", {}, false, {cls: "compact"}), "game");

    const confirmed = lobby.rulesConfirmed
      && Number(lobby.rulesConfirmed.bracket) === Number(lobby.bracket)
      && String(lobby.rulesConfirmed.cap) === String(lobby.cap);
    const summary = confirmed
      ? (lobby.rulesConfirmed.summary || rulesSummary(bracket, lobby.cap))
      : "Confirm bracket and Game Changer cap before seating reads as final.";

    const rules = `<section class="v-panel cm-lobby-rules"><h2>The rules of this table</h2>
      <div class="cm-toolbar">
        ${s("Bracket", "lobbyBracket", brackets, String(bracket.n))}
        ${f("Game Changer cap", "lobbyCap", lobby.cap === "" ? "" : String(lobby.cap), `type="number" min="0" max="20" placeholder="${e(bracket.gameChangers === Infinity ? "no limit" : String(bracket.gameChangers))}"`)}
        ${b(confirmed ? "Confirmed" : "Confirm", "lobby-confirm-rules", {}, !confirmed, {cls: "compact" + (confirmed ? " is-on" : "")})}
      </div>
      <p class="cm-lobby-says">${e(summary)}</p>
    </section>`;

    const seats = `<div class="cm-lobby-seats">
      ${seatBoxHost(t)}
      ${lobby.opponents.map((opp, i) => seatBoxOpp(i, opp, t)).join("")}
    </div>`;

    const canStart = allReadyForStart(t);
    const startWhy = !lobby.host ? "Seat your deck first."
      : !lobby.host.ready ? "Ready Up on your seat."
      : !t.ready ? (t.why || "Fix blocked seats.")
      : !canStart ? "Every occupied seat needs Ready Up."
      : "";

    const read = activeSeats().length >= L.MIN_SEATS ? `<section class="v-panel cm-lobby-read"><h2>Before you sit</h2>
      <p class="cm-lobby-verdict">${e(t.pod.read)}</p>
      <dl class="cm-lobby-figs">
        <div><dt>Pod average</dt><dd>${t.pod.average === null ? "-" : t.pod.average}</dd></div>
        <div><dt>The field, without you</dt><dd>${t.pod.field === null ? "-" : t.pod.field}</dd></div>
        <div><dt>Spread</dt><dd>${t.pod.spread === null ? "-" : t.pod.spread}</dd></div>
        <div><dt>Seats</dt><dd>${t.pod.seats} of ${L.MAX_SEATS}</dd></div>
      </dl>
      ${t.pod.partial ? note(t.pod.partial) : ""}
      <p class="cm-muted">Turn order is shuffled when the game starts.</p>
      <div class="cm-actions"><button type="button" class="v-button${canStart ? " primary" : ""}" data-action="lobby-start"${canStart ? "" : " disabled"}>${canStart ? "Start the game" : "Not ready yet"}</button><span class="cm-muted">${e(startWhy || "The board is not built yet. This button will deal the first hands once it is.")}</span></div></section>` : "";

    C.main.innerHTML = head + rules + seats + read;

    const bracketEl = $("[name=lobbyBracket]");
    const capEl = $("[name=lobbyCap]");
    if (bracketEl) bracketEl.addEventListener("change", (ev) => {
      lobby.bracket = Number(ev.target.value) || 3;
      lobby.rulesConfirmed = null;
      /* changing rules clears ready flags */
      if (lobby.host) lobby.host.ready = false;
      lobby.opponents.forEach((o) => { o.ready = false; });
      redraw();
    });
    if (capEl) capEl.addEventListener("change", (ev) => {
      lobby.cap = ev.target.value === "" ? "" : Math.max(0, Number(ev.target.value) || 0);
      lobby.rulesConfirmed = null;
      if (lobby.host) lobby.host.ready = false;
      lobby.opponents.forEach((o) => { o.ready = false; });
      redraw();
    });

    C.main.querySelectorAll(".cm-lobby-inline").forEach((box) => {
      wireCommanderSearch(box);
      const fromSel = box.querySelector("[name=inlineFrom]");
      const sync = () => {
        const from = fromSel ? fromSel.value : "library";
        box.querySelectorAll("[data-inline-from]").forEach((node) => {
          node.hidden = node.getAttribute("data-inline-from") !== from;
        });
        box.querySelectorAll("[data-lobby-color-when]").forEach((node) => {
          node.hidden = node.getAttribute("data-lobby-color-when") !== from;
        });
        const applyBtn = box.querySelector('[data-action="lobby-inline-apply"]');
        if (applyBtn) applyBtn.textContent = from === "generated" ? "Apply build-100" : "Apply deck";
        let styleBtn = box.querySelector('[data-action="lobby-build-style"]');
        const actionsRow = box.querySelector(".cm-lobby-build-actions") || box.querySelector(".cm-actions");
        if (from === "generated") {
          if (!styleBtn && actionsRow && applyBtn) {
            const tmp = document.createElement("div");
            tmp.innerHTML = b("Define play style", "lobby-build-style", {opp: String(box.getAttribute("data-opp") || "")}, false, {cls: "compact"});
            styleBtn = tmp.firstElementChild;
            actionsRow.insertBefore(styleBtn, applyBtn);
          }
          if (styleBtn) styleBtn.hidden = false;
        } else if (styleBtn) {
          styleBtn.hidden = true;
        }
      };
      if (fromSel) fromSel.addEventListener("change", sync);
      sync();
    });

    C.main.querySelectorAll(".cm-lobby-invite").forEach((box) => {
      const i = Number(box.getAttribute("data-opp"));
      box.querySelectorAll("[name=guestName],[name=guestEmail]").forEach((inp) => {
        const persist = () => {
          const opp = lobby.opponents[i];
          if (!opp || opp.role !== "human") return;
          if (inp.name === "guestName") opp.guestName = String(inp.value || "").trim().slice(0, 80);
          if (inp.name === "guestEmail") opp.guestEmail = String(inp.value || "").trim().slice(0, 160);
          save();
        };
        inp.addEventListener("change", persist);
        inp.addEventListener("blur", persist);
      });
    });
  };


  function mechanicChoices() {
    const mech = (globalThis.CrankCatalog && CrankCatalog.MECHANICS) || [];
    return [["", "Open to exploration"], ...mech.map(([label]) => [label, label])];
  }

  function openBuildStyleModal({scope, oppIndex}) {
    const def = scope === "host"
      ? (lobby.hostBuildDef || defaultBuildDef())
      : ((lobby.opponents[oppIndex] && lobby.opponents[oppIndex].buildDef) || defaultBuildDef());
    const saltOpts = [
      [1, "1 · Extremely friendly"],
      [2, "2 · Friendly"],
      [3, "3 · Assertive"],
      [4, "4 · Disruptive"],
      [5, "5 · Any legal winning mechanic"],
    ];
    const body = `<form id="cm-lobby-build-style" class="cm-form" data-scope="${e(scope)}"${scope === "opp" ? ` data-opp="${oppIndex}"` : ""}>
      <div class="cm-form-grid">
        ${s("Primary play style", "mechanic", mechanicChoices(), (def.mechanics && def.mechanics[0]) || "")}
        ${s("Base bracket", "baseBracket", [1, 2, 3, 4, 5], def.baseBracket)}
        ${s("Bracket ceiling", "bracketCeiling", [1, 2, 3, 4, 5], def.bracketCeiling)}
        ${f("Total deck price cap ($)", "budget", def.budget ?? "", 'type="number" min="0" step="0.01" placeholder="No cap"')}
        ${f("Per-card cap ($)", "perCardCap", def.perCardCap ?? "", 'type="number" min="0" step="0.01" placeholder="No cap"')}
        ${s("Play style", "playStyle", ["Balanced", "Aggressive", "Reactive", "Value engine", "Combo"], def.playStyle || "Balanced")}
        ${s("Speed", "speed", [1, 2, 3, 4, 5], def.speed)}
        ${s("Competitiveness", "competitiveness", [1, 2, 3, 4, 5], def.competitiveness)}
        ${s("Saltiness", "saltiness", saltOpts, def.saltiness)}
        <label class="cm-full">Restrictions and preferences<textarea name="restrictions">${e(def.restrictions || "")}</textarea></label>
      </div>
      <div class="cm-form-footer">
        ${b("Cancel", "close", {}, false, {cls: "compact"})}
        ${b("Save play style", "lobby-build-style-save", {scope, ...(scope === "opp" ? {opp: String(oppIndex)} : {})}, true, {cls: "compact"})}
      </div>
    </form>`;
    C.modal("Define play style", body);
  }

  actions["lobby-build-style"] = (el) => {
    if (el.dataset.scope === "host") {
      openBuildStyleModal({scope: "host"});
      return;
    }
    const i = Number(el.dataset.opp);
    if (!Number.isFinite(i)) { C.notice("Seat missing for play style.", true); return; }
    openBuildStyleModal({scope: "opp", oppIndex: i});
  };

  actions["lobby-build-style-save"] = (el) => {
    const formEl = el.closest("form") || document.getElementById("cm-lobby-build-style");
    if (!formEl) throw Error("Play style form missing.");
    const raw = Object.fromEntries(new FormData(formEl));
    const next = resolveBuildDef({
      mechanic: raw.mechanic || "",
      baseBracket: Number(raw.baseBracket),
      bracketCeiling: Number(raw.bracketCeiling),
      budget: raw.budget === "" ? null : Number(raw.budget),
      perCardCap: raw.perCardCap === "" ? null : Number(raw.perCardCap),
      playStyle: raw.playStyle,
      speed: Number(raw.speed),
      competitiveness: Number(raw.competitiveness),
      saltiness: Number(raw.saltiness),
      restrictions: raw.restrictions || "",
    });
    delete next.fitBracket; /* store prefs only; fitBracket applied at build time */
    const scope = el.dataset.scope || formEl.getAttribute("data-scope") || "host";
    if (scope === "host") {
      lobby.hostBuildDef = next;
    } else {
      const i = Number(el.dataset.opp != null ? el.dataset.opp : formEl.getAttribute("data-opp"));
      const opp = lobby.opponents[i];
      if (!opp) throw Error("Opponent seat missing.");
      opp.buildDef = next;
    }
    let keepCmd = "";
    if (scope === "host") {
      const seatDlg = document.getElementById("cm-dialog");
      const q = seatDlg && seatDlg.querySelector("[name=commanderQuery]");
      const h = seatDlg && seatDlg.querySelector("[name=commander]");
      keepCmd = String((h && h.value) || (q && q.value) || "").trim();
      /* Also peek previous form under play-style modal's opener context via lobby draft. */
      if (!keepCmd && lobby.host && lobby.host.seat && lobby.host.seat.commanders && lobby.host.seat.commanders[0]) {
        keepCmd = lobby.host.seat.commanders[0].name || lobby.host.seat.commanders[0] || "";
      }
    }
    save();
    const dlg = document.getElementById("cm-dialog");
    if (dlg && dlg.open) dlg.close();
    C.notice("Play style saved for this build.");
    if (scope === "host") {
      openHostDeckModal({ from: "generated", commander: keepCmd });
    } else {
      try { if (C.route && C.route().view === "game") redraw(); } catch (_) {}
    }
  };

  actions["lobby-inline-from"] = (el) => {
    const box = el.closest(".cm-lobby-inline");
    if (!box) return;
    const from = el.value || "library";
    box.querySelectorAll("[data-inline-from]").forEach((node) => {
      node.hidden = node.getAttribute("data-inline-from") !== from;
    });
    box.querySelectorAll("[data-lobby-color-when]").forEach((node) => {
      node.hidden = node.getAttribute("data-lobby-color-when") !== from;
    });
    const applyBtn = box.querySelector('[data-action="lobby-inline-apply"]');
    if (applyBtn) applyBtn.textContent = from === "generated" ? "Apply build-100" : "Apply deck";
    let styleBtn = box.querySelector('[data-action="lobby-build-style"]');
    const actionsRow = box.querySelector(".cm-lobby-build-actions") || box.querySelector(".cm-actions");
    if (from === "generated") {
      if (!styleBtn && actionsRow && applyBtn) {
        const tmp = document.createElement("div");
        tmp.innerHTML = b("Define play style", "lobby-build-style", {opp: String(box.getAttribute("data-opp") || "")}, false, {cls: "compact"});
        styleBtn = tmp.firstElementChild;
        actionsRow.insertBefore(styleBtn, applyBtn);
      }
      if (styleBtn) styleBtn.hidden = false;
    } else if (styleBtn) {
      styleBtn.hidden = true;
    }
  };


  document.addEventListener("change", (ev) => {
    const el = ev.target.closest("[data-action-change]");
    if (!el) return;
    const fn = actions[el.getAttribute("data-action-change")];
    if (!fn) return;
    try { fn(el, ev); } catch (err) { if (err && err.name !== "AbortError") C.notice(err.message || String(err), true); }
  });
  actions["lobby-host-deck"] = async () => { await loadHostCatalogDecks(); openHostDeckModal(); };
  actions["lobby-add"] = () => openOpponentRoleModal();

  actions["lobby-invite-field"] = (el) => {
    const i = Number(el.dataset.opp);
    const opp = lobby.opponents[i];
    if (!opp || opp.role !== "human") return;
    const field = el.dataset.field;
    if (field === "guestName") opp.guestName = String(el.value || "").trim().slice(0, 80);
    if (field === "guestEmail") opp.guestEmail = String(el.value || "").trim().slice(0, 160);
    save();
  };

  
  async function ensureLiveInvite(opp) {
    if (!opp || opp.role !== 'human') throw new Error('Invites are only for Human seats.');
    if (opp.liveInviteLink) return opp.liveInviteLink;
    const setup = await lobbyApi('/api/setup');
    const token = setup && setup.token;
    if (!token) throw new Error('Host /api/setup did not return a token. Is CrankMagic Online running?');
    if (setup.guestOrigin) cachedGuestOrigin = String(setup.guestOrigin).replace(/\/$/, '');

    const seatMap = humanOppSeatIdMap();
    const oppIndex = lobby.opponents.indexOf(opp);
    const seatId = seatMap.get(oppIndex);
    if (seatId == null) throw new Error('Could not map this Human seat to a server seat id.');

    /* Reuse an already-open accepting lobby when possible. */
    try {
      const existing = await lobbyApi('/api/table', {token});
      if (existing && existing.invitations) applyServerInvitations(existing.invitations);
      if (opp.liveInviteLink) return opp.liveInviteLink;
      const issued = await lobbyApi('/api/lobby-invite', {method: 'POST', token, body: {seatId}});
      if (issued && issued.link) {
        opp.liveInviteLink = issued.link;
        applyServerInvitations([issued].concat(existing.invitations || []));
        return issued.link;
      }
    } catch (_) { /* no lobby yet — open one */ }

    C.notice('Opening the private guest lobby so this invite can accept players…');
    const config = await lobbyBuildPrepareConfig(token, setup.defaults, setup.decks || []);
    if (config.humans < 2) throw new Error('Set at least one Human opponent before Email Invite / Copy Link.');
    const prepared = await lobbyApi('/api/prepare', {method: 'POST', token, body: config});
    if (!prepared || !prepared.id) throw new Error('Prepare did not return an id for the guest lobby.');
    const started = await lobbyApi('/api/start', {method: 'POST', token, body: {id: prepared.id}});
    if (!(started && started.lobby && Array.isArray(started.invitations))) {
      throw new Error('Host did not open an accepting guest lobby. Check Remote Guests / Cloudflare.');
    }
    applyServerInvitations(started.invitations);
    if (!opp.liveInviteLink) throw new Error('Lobby opened but no invitation was issued for this Human seat.');
    return opp.liveInviteLink;
  }

actions["lobby-email-invite"] = async (el) => {
    const i = Number(el.dataset.opp);
    const opp = lobby.opponents[i];
    if (!opp || opp.role !== "human") return;
    const email = String(opp.guestEmail || "").trim();
    if (!email || !email.includes("@")) { C.notice("Add a guest email first.", true); return; }
    let link;
    try {
      link = await ensureLiveInvite(opp);
    } catch (err) {
      C.notice((err && err.message) || String(err), true);
      return;
    }
    const who = String(opp.guestName || "").trim() || "friend";
    const subject = encodeURIComponent("Join my Commander table on CrankMagic");
    /* Exact draft structure for Trey. Full https URL on its own line so clients auto-link;
       some clients also accept HTML via mailto — keep plain-text body for widest support. */
    const body = encodeURIComponent(
      "Hi " + who + ",\r\n\r\n" +
      "Join my Commander table on CrankMagic:\r\n" +
      link + "\r\n\r\n" +
      "If you have an existing deck saved in Archidekt or Moxfield, export it to excel. You can copy/paste your card list as your deck. Have it in the following format:\r\n\r\n" +
      "[Count] [Card Name], for example:\r\n" +
      "1 Chulane, Teller of Tales\r\n\r\n" +
      "1 Soul Stone\r\n" +
      "13 Plains\r\n" +
      "...\r\n\r\n" +
      "Your commander card should be the first card on the 2-column list with a blank row between it and your other 99.\r\n\r\n" +
      "See you shortly!"
    );
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
    save();
  };

  actions["lobby-copy-invite"] = async (el) => {
    const i = Number(el.dataset.opp);
    const opp = lobby.opponents[i];
    if (!opp || opp.role !== "human") return;
    let link;
    try {
      link = await ensureLiveInvite(opp);
    } catch (err) {
      C.notice((err && err.message) || String(err), true);
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      C.notice("Live guest invite copied (table accepting players).");
    } catch (err) {
      C.notice("Copy failed. Select and copy the link by hand: " + link, true);
    }
    save();
  };

  actions["lobby-confirm-rules"] = () => {
    const bracket = L.bracketOf(lobby.bracket);
    lobby.rulesConfirmed = {
      bracket: lobby.bracket,
      cap: lobby.cap,
      summary: rulesSummary(bracket, lobby.cap),
    };
    redraw();
    C.notice("Table rules confirmed.");
  };

  actions["lobby-ready"] = (el) => {
    const who = el.dataset.who;
    if (who === "host") {
      if (!lobby.host || !lobby.host.seat) { C.notice("Seat your deck first.", true); return; }
      if (lobby.host.ready) { lobby.host.ready = false; redraw(); return; }
      const check = L.validate(lobby.host.seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
      if (!check.ok) { C.notice((check.issues[0] || {}).why || "Deck is over the table limits.", true); return; }
      const map = seatMappedOk(lobby.host.seat);
      if (!map.ok) { C.notice(map.why, true); return; }
      lobby.host.ready = true;
      redraw();
      return;
    }
    const i = Number(el.dataset.opp);
    const opp = lobby.opponents[i];
    if (!opp || opp.role === "unused" || !opp.seat) { C.notice("Apply a deck in this seat first.", true); return; }
    if (opp.ready) { opp.ready = false; redraw(); return; }
    const check = L.validate(opp.seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
    if (!check.ok) { C.notice((check.issues[0] || {}).why || "Deck is over the table limits.", true); return; }
    const map = seatMappedOk(opp.seat);
    if (!map.ok) { C.notice(map.why, true); return; }
    opp.ready = true;
    redraw();
  };

  actions["lobby-view-cards"] = (el) => {
    const id = el.dataset.seat;
    let seat = null;
    if (lobby.host && lobby.host.seat && lobby.host.seat.id === id) seat = lobby.host.seat;
    else {
      const hit = lobby.opponents.find((o) => o.seat && o.seat.id === id);
      if (hit) seat = hit.seat;
    }
    if (!seat) { C.notice("Seat not found.", true); return; }
    const cmds = (seat.commanders || []).map((c) => `<li><strong>${e(c.name)}</strong> · commander</li>`).join("");
    const mains = (seat.cards || []).map((c) => `<li>${c.quantity || 1}× ${e(c.name)}</li>`).join("");
    C.modal(seat.name || "Seat list", `<div class="cm-lobby-view-cards"><p class="cm-muted">${(seat.commanders || []).length} commander${(seat.commanders || []).length === 1 ? "" : "s"} · ${(seat.cards || []).reduce((n, r) => n + (Number(r.quantity) || 1), 0)} main</p><ul class="cm-lobby-cardlist">${cmds}${mains}</ul></div>`);
  };

  actions["lobby-inline-apply"] = async (el) => {
    const i = Number(el.dataset.opp);
    const opp = lobby.opponents[i];
    if (!opp || opp.role === "unused") throw Error("Set this seat to Human or AI first.");
    if (opp.role === "human") throw Error("Human guests bring their own deck. Use Email Invite or Copy Link.");
    const box = el.closest(".cm-lobby-inline") || C.main.querySelector(`.cm-lobby-inline[data-opp="${i}"]`);
    if (!box) throw Error("Seat editor missing.");
    const from = (box.querySelector("[name=inlineFrom]") || {}).value || "library";
    const v = {
      from,
      deckId: (box.querySelector("[name=inlineDeck]") || {}).value || "",
      url: (box.querySelector("[name=inlineUrl]") || {}).value || "",
      paste: (box.querySelector("[name=inlinePaste]") || {}).value || "",
      name: `Seat ${i + 2}`,
      commander: (box.querySelector("[name=inlineCommander]") || {}).value
        || (box.querySelector("[name=inlineCommanderQuery]") || {}).value || "",
      budget: BUDGET,
      buildDef: opp.buildDef || null,
    };
    if (from === "generated" && !String(v.commander || "").trim()) throw Error("Pick a commander from the search results.");
    setBuildBusy(true, "inline");
    let seat;
    try {
      seat = await buildSeatFromValues(v, false);
      if (from === "generated") seat = finalizeBuiltSeat(seat);
      seat = await persistLobbyDraft(seat, from);
      if (from === "generated") seat = finalizeBuiltSeat(seat);
      let check = L.validate(seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
      if (!check.ok && from === "generated") {
        seat = finalizeBuiltSeat(seat);
        check = L.validate(seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
      }
      if (!check.ok) {
        /* Non-generated: still surface; generated should already be forced legal. */
        if (from !== "generated") {
          throw Error((check.issues.find((x) => x.severity === "blocking") || check.issues[0] || {}).why || "Deck is over the table limits.");
        }
      }
      opp.seat = seat;
      opp.ready = false;
      opp.editing = false;
      save();
      redraw();
      if (from === "generated") softNotice("Deck Labs seated a legal 100.", false);
      else if (from === "paste") softNotice("Pasted list seated.", false);
    } finally {
      setBuildBusy(false, "inline");
    }
  };

  actions["lobby-deck-summary"] = (el) => {
    const seatId = el.dataset.seat;
    let seat = null;
    let meta = {host: false, human: false, opp: null};
    if (lobby.host && lobby.host.seat && lobby.host.seat.id === seatId) {
      seat = lobby.host.seat;
      meta = {host: true, human: false, opp: null};
    } else {
      const i = lobby.opponents.findIndex((o) => o.seat && o.seat.id === seatId);
      if (i >= 0) {
        seat = lobby.opponents[i].seat;
        meta = {host: false, human: lobby.opponents[i].role === "human", opp: i};
      }
    }
    if (!seat) { C.notice("Seat that deck first.", true); return; }
    const check = L.validate(seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
    const gcCap = check.cap === Infinity ? "any" : check.cap;
    const counts = typeCounts(seat);
    const max = Math.max(1, ...counts.map((c) => c[1]));
    const bars = counts.map(([label, n, color]) => {
      const pct = Math.max(8, Math.round((n / max) * 100));
      return `<div class="cm-lobby-type-row"><span>${e(label)}</span><div class="cm-lobby-type-bar"><i style="width:${pct}%;background:${color}"></i></div><strong>${n}</strong></div>`;
    }).join("") || `<p class="cm-muted">No type breakdown yet.</p>`;
    const cmd = ((seat.commanders && seat.commanders[0]) || {}).name || seat.name || "Commander";
    const art = commanderArtUrl(seat);
    const artHtml = art
      ? `<img class="cm-lobby-summary-art" src="${e(art)}" alt="${e(cmd)}" loading="lazy" referrerpolicy="no-referrer">`
      : "";
    const clearBtn = (!meta.host && !meta.human)
      ? b("Clear deck", "lobby-clear-opp-deck", {opp: String(meta.opp)}, false, {cls: "compact"})
      : "";
    const body = `<div class="cm-lobby-summary">
      <div class="cm-lobby-summary-top">${artHtml}<div>
        <p class="cm-lobby-summary-name">${e(seat.name || cmd)}</p>
        <p class="cm-muted">${e(cmd)}</p>
        <dl class="cm-lobby-figs">
          <div><dt>Cards</dt><dd>${check.size} of ${L.DECK_SIZE}</dd></div>
          <div><dt>GC</dt><dd>${check.gameChangers} of ${gcCap}</dd></div>
          <div><dt>Score</dt><dd>${seat.score === null || seat.score === undefined ? "-" : seat.score}</dd></div>
          <div><dt>Colors</dt><dd>${check.colors.length ? C.colors(check.colors) : "-"}</dd></div>
        </dl>
      </div></div>
      <div class="cm-lobby-summary-types">${bars}</div>
      <div class="cm-actions cm-lobby-summary-actions">${b("View cards", "lobby-view-cards", {seat: seat.id}, false, {cls: "compact"})}${clearBtn}</div>
    </div>`;
    C.modal("Deck Summary", body);
  };

  actions["lobby-art-zoom"] = (el) => {
    const src = el.dataset.art || (el.querySelector && el.querySelector("img") && el.querySelector("img").src) || "";
    const name = el.dataset.name || "Commander";
    if (!src) return;
    document.querySelectorAll(".cm-lobby-art-pop").forEach((n) => n.remove());
    const pop = document.createElement("div");
    pop.className = "cm-lobby-art-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", name);
    pop.innerHTML = `<button type="button" class="cm-lobby-art-pop-backdrop" data-action="lobby-art-close" aria-label="Close"></button><button type="button" class="cm-lobby-art-pop-card" data-action="lobby-art-close" aria-label="Close enlarged art"><img src="${e(src)}" alt="${e(name)}"></button>`;
    document.body.appendChild(pop);
    /* Size pop card to 1.5× the seat art that was clicked. */
    const img = el.tagName === "IMG" ? el : el.querySelector("img");
    const seatArt = img || el;
    const r = seatArt.getBoundingClientRect();
    const card = pop.querySelector(".cm-lobby-art-pop-card");
    if (card && r.width) {
      card.style.width = Math.round(r.width * 1.5) + "px";
      card.style.height = Math.round(r.height * 1.5) + "px";
    }
  };
  actions["lobby-art-close"] = () => {
    document.querySelectorAll(".cm-lobby-art-pop").forEach((n) => n.remove());
  };

  actions["lobby-sim-report"] = async (el) => {
    const seatId = el.dataset.seat;
    let seat = null;
    if (lobby.host && lobby.host.seat && lobby.host.seat.id === seatId) seat = lobby.host.seat;
    else {
      const hit = lobby.opponents.find((o) => o.seat && o.seat.id === seatId);
      if (hit) seat = hit.seat;
    }
    if (!seat) { C.notice("Seat that deck first.", true); return; }
    const deckId = seat.deckId || seat.draftId || "";
    const run = C.measurePublished
      || (globalThis.CrankSim && CrankSim.measurePublished)
      || (globalThis.CrankMeasure && CrankMeasure.measurePublished);
    if (typeof run !== "function") {
      C.notice("Simulation report is not wired yet — waiting on Measure published entry. Draft deckId: " + (deckId || "(pending)"), true);
      return;
    }
    try {
      C.notice("Running published 120k simulation…");
      const { report } = await run({
        deckId: deckId || undefined,
        lineup: deckId ? undefined : seat,
        onProgress: (msg) => { if (msg) C.notice(String(msg)); },
      });
      if (!deckId) {
        seat.lastSimReport = report;
        save();
        C.notice("Simulation finished, but this seat has no Decks draft id yet — report held on the seat until ensureLobbyDraft lands.");
        return;
      }
      const attach = C.attachDeckReport;
      if (typeof attach !== "function") {
        seat.lastSimReport = report;
        save();
        C.notice("Simulation finished. Collection attachDeckReport not live yet — report held on the seat.");
        return;
      }
      await attach({ deckId, report });
      C.notice("Simulation report attached to the Decks draft. Open Decks → deck info to view.");
    } catch (err) {
      C.notice(err && err.message ? err.message : String(err), true);
    }
  };

  actions["lobby-change-opp-deck"] = (el) => {
    const i = Number(el.dataset.opp);
    const opp = lobby.opponents[i];
    if (!opp || opp.role === "unused" || opp.role === "human") return;
    opp.editing = true;
    opp.ready = false;
    save();
    redraw();
  };

  actions["lobby-clear-opp-deck"] = (el) => {
    const i = Number(el.dataset.opp);
    if (!lobby.opponents[i]) return;
    lobby.opponents[i].seat = null;
    lobby.opponents[i].ready = false;
    lobby.opponents[i].editing = false;
    save();
    try { const d = document.getElementById("cm-dialog"); if (d && d.open) d.close(); } catch (_) {}
    redraw();
  };

  actions["lobby-trim"] = (el) => {
    const id = el.dataset.seat;
    let target = null, setSeat = null;
    if (lobby.host && lobby.host.seat && lobby.host.seat.id === id) {
      target = lobby.host.seat;
      setSeat = (seat) => { lobby.host.seat = seat; lobby.host.ready = false; };
    } else {
      const i = lobby.opponents.findIndex((o) => o.seat && o.seat.id === id);
      if (i >= 0) {
        target = lobby.opponents[i].seat;
        setSeat = (seat) => { lobby.opponents[i].seat = seat; lobby.opponents[i].ready = false; };
      }
    }
    if (!target || !setSeat) return;
    const result = L.trim(target, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
    if (!result.dropped.length) { C.notice("Nothing to trim. This deck is already inside the bracket."); return; }
    form(`Trim ${target.name} to bracket ${lobby.bracket}`,
      `<ul class="cm-lobby-trim">${result.dropped.map((d) => `<li><strong>${e(d.name)}</strong> out</li>`).join("")}${result.added.map((a) => `<li>${a.quantity}× <strong>${e(a.name)}</strong> in</li>`).join("")}</ul>`
      + note(result.says) + note("This changes the seat, not the deck in your library."),
      () => { setSeat(result.seat); redraw(); }, "Trim it");
  };
  actions["lobby-bracket-up"] = () => {
    const next = L.BRACKETS.find((x) => x.n > lobby.bracket);
    if (!next) { C.notice("Bracket 5 is the top of the ladder."); return; }
    lobby.bracket = next.n; lobby.cap = ""; lobby.rulesConfirmed = null;
    if (lobby.host) lobby.host.ready = false;
    lobby.opponents.forEach((o) => { o.ready = false; });
    redraw();
    C.notice(`This table is bracket ${next.n}, ${next.name}, now.`);
  };
  actions["lobby-clear"] = () => { lobby = EMPTY(); redraw(); };



async function lobbyApi(path, {method = 'GET', token, body} = {}) {
    const headers = {};
    if (token) headers['X-Commander-Token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok) {
      const err = (data && (data.error || data.message)) || res.statusText || ('HTTP ' + res.status);
      throw new Error(err);
    }
    return data;
  }

  function lobbyLibraryKind(seat) {
    const k = String(seat && seat.kind || '').toLowerCase();
    if (k === 'generated' || k === 'paste') return false;
    const id = String(seat && seat.deckId || '');
    /* Host catalog live/archive ids only — draft UUIDs (deck:<uuid>) must import-deck. */
    if (!(id.startsWith('deck:live:') || id.startsWith('archive:'))) return false;
    return k === 'library' || k === 'preloaded';
  }

  async function lobbySeatPrepareRequest(seat, seatId, kind, token, catalogDecks, maxCost) {
    const commanders = (seat.commanders || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
    const commander = commanders[0] || '';
    const name = String(seat.name || commander || ('Seat ' + (seatId + 1))).slice(0, 100);
    const base = {
      seatId,
      kind, /* human | ai */
      name,
      commanderMode: 'selected',
      commander,
    };
    if (kind === 'ai') {
      base.nativeProfile = 'Default';
      base.difficulty = 3;
      /* forge-native: omit aiProvider so requireAiSession is a no-op */
    }

    /* Guest humans pick their deck on the guest gateway after claiming the invite. */
    if (kind === 'human' && seatId > 0 && (seat.guestPlaceholder || !(seat.cards && seat.cards.length) && !seat.deckId)) {
      return Object.assign(base, {
        source: 'preloaded',
        deckId: '',
        commander: '',
        commanderMode: 'selected',
      });
    }

    if (seat.deckId && lobbyLibraryKind(seat)) {
      return Object.assign(base, {
        source: 'library',
        deckId: seat.deckId,
      });
    }

    /* Prefer a host catalog live deck with the same commander that already passes table limits. */
    const cap = Number(maxCost) || BUDGET || 225;
    const liveHit = (catalogDecks || []).find((d) =>
      d && String(d.id || '').startsWith('deck:live:')
      && d.commander === commander
      && d.ok !== false
      && (d.cost == null || Number(d.cost) <= cap)
    );
    if (liveHit) {
      return Object.assign(base, {
        source: 'library',
        deckId: liveHit.id,
        commander: liveHit.commander || commander,
      });
    }

    /* Else import the seated list, then library. */
    const rows = (seat.cards || []).map((c) => ({
      name: typeof c === 'string' ? c : c.name,
      quantity: Number((c && c.quantity) || 1) || 1,
    })).filter((r) => r.name);
    const cmdQty = commanders.length;
    const rowQty = rows.reduce((n, r) => n + r.quantity, 0);
    if (cmdQty + rowQty !== 100) {
      throw new Error(name + ': seat list must total 100 with commanders (have ' + (cmdQty + rowQty) + ').');
    }
    const handoff = {
      schema: 'CrankMagicDeckHandoff@1',
      name,
      commanders,
      rows,
    };
    if (seat.deckId) handoff.sourceDeckId = seat.deckId;
    const imported = await lobbyApi('/api/import-deck', {method: 'POST', token, body: handoff});
    return Object.assign(base, {
      source: 'library',
      deckId: imported.id,
      commander: imported.commander || commander,
    });
  }

  async function lobbyBuildPrepareConfig(token, defaults, catalogDecks) {
    const humanOpps = [];
    const aiOpps = [];
    lobby.opponents.forEach((opp, idx) => {
      if (!opp || opp.role === 'unused') return;
      if (opp.role === 'human') {
        humanOpps.push(opp.seat || {
          name: String(opp.guestName || ('Friend ' + (idx + 2))).slice(0, 100),
          commanders: [],
          cards: [],
          kind: 'human',
          guestPlaceholder: true,
        });
      } else if (opp.role === 'ai') {
        if (!opp.seat) throw new Error('Seat an AI deck before opening the guest lobby.');
        aiOpps.push(opp.seat);
      }
    });
    if (!lobby.host || !lobby.host.seat) throw new Error('Host seat is empty — seat your deck before inviting guests.');

    const humans = 1 + humanOpps.length;
    const ais = aiOpps.length;
    const maxCost = Number(lobby.maxCost) || BUDGET || 225;
    /* validateSetup requires humans packed before ais */
    const ordered = [
      {seat: lobby.host.seat, kind: 'human'},
      ...humanOpps.map((seat) => ({seat, kind: 'human'})),
      ...aiOpps.map((seat) => ({seat, kind: 'ai'})),
    ];
    const seats = [];
    for (let i = 0; i < ordered.length; i++) {
      seats.push(await lobbySeatPrepareRequest(ordered[i].seat, i, ordered[i].kind, token, catalogDecks, maxCost));
    }
    return {
      bracket: Number(lobby.bracket) || (defaults && defaults.bracket) || 3,
      maxCost,
      humans,
      ais,
      seats,
    };
  }

  async function lobbyPollLive(timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 240000);
    let sawStarting = false;
    while (Date.now() < deadline) {
      const live = await lobbyApi('/api/live');
      const status = live && live.status;
      if (status === 'starting') {
        if (!sawStarting) {
          sawStarting = true;
          C.notice('Forge is loading…');
        }
      } else if (status === 'ready' || status === 'playing') {
        return live;
      } else if (status === 'error' || status === 'failed' || status === 'incomplete') {
        throw new Error((live && live.error) || ('Game status: ' + status));
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Timed out waiting for Forge / live table (4 minutes).');
  }

  function lobbyResumeTabletop() {
    try { window.dispatchEvent(new Event('crankmagic-game-ready')); } catch (_) {}
    /* Classic shell lives under /app; live review table is at /. Prefer that when same-origin. */
    try {
      if (/\/app\/?$/i.test(location.pathname) || /\/app\//i.test(location.pathname)) {
        location.assign('/');
        return;
      }
    } catch (_) {}
    try {
      if (C.views && typeof C.views.online === 'function') {
        location.hash = 'online';
      }
    } catch (_) {}
  }


  actions["lobby-start"] = async () => {
    const t = table();
    if (!allReadyForStart(t)) {
      C.notice(t.why || "Ready Up every occupied seat and fix any blocked decks.", true);
      return;
    }
    if (startInFlight) return;
    startInFlight = true;
    redraw();
    C.notice("Contacting the local host…");
    try {
      const setup = await lobbyApi('/api/setup');
      const token = setup && setup.token;
      if (!token) throw new Error('Host /api/setup did not return a token. Is serve-review running?');
      const config = await lobbyBuildPrepareConfig(token, setup.defaults, setup.decks || []);
      /* An invitation is bound to the table id it was issued against. Email Invite opens the
         lobby itself when none is open, so by the time Start is pressed a table is usually
         already accepting guests. Preparing a second one mints a new table id and every link
         already emailed reads as "Invitation expired or unavailable" the moment a guest opens
         it. Reuse the open table instead. */
      if (config.humans > 1) {
        const open = await lobbyApi('/api/table').catch(() => null);
        if (open && open.table && ['selecting', 'rematch'].includes(open.table.phase)) {
          applyServerInvitations(open.invitations || []);
          startInFlight = false;
          redraw();
          C.notice('Private lobby is already open. The links you have sent are still good — the game starts once every seat is Ready.');
          return;
        }
      }
      C.notice(`Preparing ${config.seats.length} seats (native Forge AI)…`);
      const prepared = await lobbyApi('/api/prepare', {method: 'POST', token, body: config});
      if (!prepared || !prepared.id) throw new Error('Prepare did not return an id.');
      C.notice(config.humans > 1 ? 'Opening the private lobby…' : 'Launching Forge / tabletop…');
      const started = await lobbyApi('/api/start', {method: 'POST', token, body: {id: prepared.id}});
      if (started && started.lobby) {
        applyServerInvitations(started.invitations || []);
        startInFlight = false;
        redraw();
        C.notice('Private lobby open — Email Invite / Copy Link now use live guest links. Guests can pick decks.');
        return;
      }
      const live = await lobbyPollLive(240000);
      startInFlight = false;
      redraw();
      C.notice(live.status === 'playing' ? 'Live table is playing.' : 'Live table is ready.');
      lobbyResumeTabletop();
    } catch (err) {
      startInFlight = false;
      redraw();
      C.notice((err && err.message) ? err.message : String(err), true);
    }
  };



  C.HELP = C.HELP || {};
  C.HELP.game = `<h3>What the lobby does</h3><ul>
    <li><strong>Four seats.</strong> Host plus three opponent boxes. Opponents are Human, AI, or Open.</li>
    <li><strong>Human seats</strong> use Name, Email, Email Invite, and Copy Link. Guests bring their own decks.</li>
    <li><strong>Confirm</strong> locks bracket and Game Changer cap for the table summary.</li>
    <li><strong>Ready Up</strong> sits top-right on each decked seat. Ready stays blocked until names resolve in the catalog (~100) and the list fits the cap.</li>
    <li><strong>View cards</strong> opens the seated list. Decked seats show commander art and a type bar chart.</li>
    <li><strong>Build from Commander</strong> searches the catalog, then builds a 100 under this table's bracket and cap.</li>
  </ul>`;
});
