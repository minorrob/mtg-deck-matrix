/* THE LOBBY, ON SCREEN (docs/crankmagic-game-plan.md §5.1, PR G0). Pick your deck, seat one to
 * three opponents, set the rules of the table, and read the pod before you sit. No AI, no board,
 * no turn: this ships on its own and is the thing every later piece of the game is entered from.
 *
 * THE ARITHMETIC IS NOT HERE. crankmagic-lobby.js decides what a seat is, whether it may sit, how
 * to trim it to the bracket, who goes first and whether the pod is fair -- and, since F.1 of the
 * readiness plan, how a seat is shaped from each source, how a pasted list is read, how a built
 * list is stripped and backfilled to a legal hundred, which server seat each human takes, when
 * Start may be pressed, and what the prepare body says. This file turns those answers into a
 * page, turns the reader's clicks back into a config, and does the fetching. Nothing about a
 * bracket, a color identity or a seat id is spelled twice, and tests/crankmagic-lobby.mjs
 * fails if any of it comes back here.
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
  /* The app's lookups, handed to the lobby module wherever it needs a record: a card by id,
     and an exact catalog name. The module never reaches into C itself. */
  const catalogExact = (n) => (C.catalog && C.catalog.exact ? C.catalog.exact(n) : null);
  const lookups = {card: (id) => (C.card ? C.card(id) : null), exact: catalogExact};

  const KEY = "cm-lobby";
  const SLOT_COUNT = L.SLOT_COUNT; /* opponents; host is separate → 4 boxes total */
  const EMPTY_OPP = () => L.emptyOpponent();
  function ensureInviteId(opp) {
    if (!opp.inviteId) opp.inviteId = (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return opp.inviteId;
  }
  function applyServerInvitations(invitations) {
    if (!Array.isArray(invitations)) return;
    const map = L.seatIds(lobby.opponents);
    map.forEach((seatId, oppIndex) => {
      const hit = invitations.find((x) => Number(x.seatId) === Number(seatId));
      if (hit && hit.link) lobby.opponents[oppIndex].liveInviteLink = hit.link;
    });
    save();
  }
  const EMPTY = () => L.emptyLobby();

  let lobby = readSaved();
  /* What was saved last time, in the shape the lobby module defines (it also reads the legacy
     {seats: []} shape). The storage read is the only thing this file does here. */
  function readSaved() {
    try { return L.lobbyState(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (err) { return EMPTY(); }
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

  function table() {
    /* Start uses a fresh random seating each time (no exposed seed). */
    return L.table({
      bracket: lobby.bracket,
      gameChangers: lobby.cap === "" ? undefined : lobby.cap,
      seats: L.activeSeats(lobby),
      seed: "",
      fixedSeating: false,
    });
  }

  const KIND = {library: "from your library", link: "from a link", paste: "pasted", generated: "generated"};
  const BUDGET = (globalThis.CrankRules && globalThis.CrankRules.RULES.deckCap) || 225;
  const MANA_COLORS = [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]];

  function colorPillsHtml(inputName = "commanderColor") {
    return `<div class="cm-color-pills cm-lobby-color-pills" role="group" aria-label="Color identity filter">${MANA_COLORS.map(([k, name]) =>
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
      /* Short soft note only — conformSeat will strip/backfill if needed. */
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
    /* Never throw here — conformSeat strips GC/identity violators and backfills. */
    return seat;
  }

  async function buildSeatFromValues(v, you) {
    const kind = v.from || "library";
    if (kind === "library") {
      const deck = C.state.decks.find((d) => d.id === v.deckId);
      if (deck) return L.libraryDeckSeat(deck, {card: lookups.card, score: L.measuredScore(deck, C.state.reports, (d) => M.fingerprint(d, C.state)), you});
      const host = (hostCatalogDecks || []).find((d) => d.id === v.deckId);
      if (host) return L.catalogMetaSeat(host, {you, exact: catalogExact});
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
      return L.listSeat(loaded.deck, {name: loaded.deck.name, kind: "link", url, you, exact: catalogExact});
    }
    if (kind === "paste") {
      const parsed = L.parsePaste(String(v.paste || ""));
      if (!parsed.cards.length) throw Error("Nothing in that paste read as a decklist. One card a line, with a quantity in front.");
      return L.listSeat(parsed, {name: v.name || "Pasted deck", kind: "paste", you, exact: catalogExact});
    }
    const def = v.buildDef || (you ? lobby.hostBuildDef : null);
    const budgetFromDef = def && def.budget != null && def.budget !== "" ? Number(def.budget) : (Number(v.budget) || BUDGET);
    return conformSeat(await generatedSeat(String(v.commander || "").trim(), budgetFromDef, you, def));
  }

  /* Lobby Apply → Collection createDeck draft (paste/generated). Library already has a Decks row.
     Coordinates with Collection truth: C.commit createDeck + cards[] so typeLine metadata lands in Decks. */
  /* Lobby Apply → a seatable hundred. The strip and backfill is L.conform; this only shows what
     it said. */
  function conformSeat(seat) {
    const r = L.conform(seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
    if (r.says) softNotice(r.says, false);
    return r.seat;
  }

  async function persistLobbyDraft(seat, kind) {
    L.enrich(seat, lookups);
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
        L.enrich(seat, lookups);
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
        /* The host wants its session token for this one, as it does for /api/table. Called
           without it, it answered 403 and the embedded fallback quietly took over. */
        const dekPack = await lobbyApi("/api/desktop-deks", {token: setup && setup.token});
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
        seat = conformSeat(seat);
        seat = await persistLobbyDraft(seat, kind);
        seat = conformSeat(seat);
      } finally {
        setBuildBusy(false, "host");
      }
      const check = L.validate(seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
      if (!check.ok) {
        seat = conformSeat(seat);
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
  /* WHICH ELEMENT A SEAT WEARS. The state is read from what the lobby already knows about the
     seat rather than from a new field: a seat with a blocked check is in error, a seat that is
     ready is leaves, a seat with a deck but no ready flag is still resolving, an invited human
     is wheat, and an empty chair is mist. */
  /* 2b's status pill: a dot in the state's color and one word for it, at the end of the label
     bar. The words are the wireframe's -- Ready, Pending deck, Invite sent -- so the table
     says the same thing the design says. */
  const STATE_WORD = {empty: 'Open', invited: 'Invite sent', pending: 'Pending', deck: 'Pending deck', ready: 'Ready', error: 'Blocked'};
  function statusPill(state, ready, check) {
    const word = (check && !check.ok) ? 'Blocked' : (STATE_WORD[state] || 'Open');
    return `<span class="cm-seat-pill" data-state="${e(state)}"><i aria-hidden="true"></i>${e(word)}</span>`;
  }

  /* The invite line 2b writes for a guest who has not arrived: where it went, when it dies,
     and who the table is waiting on. */
  function inviteLine(opp) {
    const to = (opp && (opp.guestEmail || opp.guestName)) || '';
    const bits = [];
    if (to) bits.push(to);
    if (opp && opp.inviteExpires) {
      const left = Math.max(0, new Date(opp.inviteExpires).getTime() - Date.now());
      const h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
      bits.push(left ? `link expires in ${h}h ${m}m` : 'link has expired');
    }
    bits.push('waiting on them');
    return bits.join(' · ');
  }

  function seatState(seat, check, ready, opp) {
    if (check && !check.ok) return 'error';
    /* An AI is ready when its deck is, because nothing will ever press Ready for it. The pill has
       to agree with L.startReady or the table reads as waiting while the gate is satisfied. */
    if (opp && opp.role === 'ai' && seat) return check ? (check.ok ? 'ready' : 'error') : 'deck';
    if (ready) return 'ready';
    if (seat) return 'deck';
    if (opp && opp.role === 'human') return 'invited';
    return 'empty';
  }

  /* THE COLOR-IDENTITY FAN (DELTA B.2). Ninety degrees from the quadrant's inner corner --
     the one touching the center panel -- one wedge per color of the commander's identity in
     WUBRG order, a thin light seam between them, and a single wash for a mono-color seat
     because a fan of one wedge is just a wash. The wedges are --mana-* tokens, so a seat's
     colors are the same colors its deck's tile wears. */
  const WUBRG = ['W', 'U', 'B', 'R', 'G'];
  function identityFan(colors, corner) {
    const ci = WUBRG.filter((c) => (colors || []).includes(c));
    if (!ci.length) return '';
    /* the inner corner in unit coordinates, and the quarter-turn the fan sweeps from it */
    /* The quarter-turn each corner sweeps INTO its own quadrant. pt() measures from (deg-90),
       so `from` is the angle whose cosine and sine both point at the box interior from that
       corner. Every entry here was 90 degrees short, which drew all four fans outside their
       quadrants where they were clipped away -- a fan that is present in the DOM, correct in
       its colors, and invisible. tests/wireframe-conformance.mjs holds the four angles now. */
    const at = {tl: [0, 0, 90], tr: [1, 0, 180], bl: [0, 1, 0], br: [1, 1, 270]}[corner] || [1, 1, 270];
    const [cx, cy, from] = at;
    const R = 1.45, step = 90 / ci.length;
    const pt = (deg) => {
      const r = (deg - 90) * Math.PI / 180;
      return [(cx + Math.cos(r) * R).toFixed(4), (cy + Math.sin(r) * R).toFixed(4)];
    };
    const wedges = ci.map((c, i) => {
      const a0 = from + step * i, a1 = from + step * (i + 1);
      const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
      return `<path d="M${cx} ${cy} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="var(--mana-${c})"></path>`;
    }).join('');
    const seams = ci.length > 1 ? ci.slice(1).map((c, i) => {
      const [x, y] = pt(from + step * (i + 1));
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--poster-ink)" stroke-width=".006" opacity=".45"></line>`;
    }).join('') : '';
    return `<svg class="cm-seat-fan" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${wedges}${seams}</svg>`;
  }

  /* A quadrant: the sea behind, the fan over it, the seat's own content above both. `corner`
     is where the quadrant's INNER corner is -- the one that touches the center panel -- which
     is what the fan radiates from and what the label and card are placed away from. */
  function quadrant(corner, cls, colors, state, inner) {
    return `<article class="cm-seat-q cm-q-${corner}${cls ? ' ' + cls : ''}" data-state="${e(state)}">
      <canvas class="cm-seat-sea" data-sea="${e(state)}" aria-hidden="true"></canvas>
      ${identityFan(colors, corner)}
      <div class="cm-seat-shade" aria-hidden="true"></div>
      <div class="cm-seat-body">${inner}</div>
    </article>`;
  }

  /* THE CENTER PANEL (DELTA B.5). The table's rules, read-only to everyone but the host, and
     one line saying what the table is waiting for. There is no Launch button: the table starts
     itself once every occupied seat reports ready, which is what `waiting` counts. */
  function canStartSoon(t) {
    const seated = [lobby.host, ...lobby.opponents].filter((p) => p && p.seat);
    /* The same verdict the gate uses, so the line under the rules counts what Start counts. The
       host has no role, and is a person, so its own flag answers for it. */
    const checks = (t && t.checks) || [];
    const notReady = seated.filter((p) => (p === lobby.host ? !p.ready : !L.seatReady(p, checks))).length;
    return {seated: seated.length, notReady};
  }
  function centerPanel(t, w) {
    /* What the box says, in the order a person needs it: counting, then ready, then what is
       still missing. The countdown's own seconds are written straight into this element by
       tickCountdown rather than through a redraw -- a redraw a second would rebuild the table,
       restart four canvas animations and drop focus out of whatever the host was using. */
    const line = gameLaunched ? 'The game is running.'
      : launchError ? 'Error starting the table. Send the report?'
      : countdownEndsAt ? countdownLine()
      : !w.seated ? 'No one is seated yet.'
      : w.notReady ? `Launches when every seat is ready · ${w.notReady} to go`
      /* A copy with no host reachable cannot start anything, and saying "Starting…" there is a
         promise the page cannot keep: on github.io probeHost() is false off loopback, and the note
         below already tells the reader where the game actually runs. Measured 2026-09-22 — the
         cloud read "Every seat is ready. Starting…" while the local copy read "Starting in 10…". */
      : hostReachable === false ? 'Every seat is ready. Open the local host to play.'
      : 'Every seat is ready. Starting…';
    return `<section class="cm-table-center" aria-label="Table rules">
      <img class="cm-table-stamp" src="assets/crankmagic/crankmagic-logo-wand-v3-256.webp" alt="" aria-hidden="true">
      <div class="cm-table-head"><h2>Table rules</h2><p class="cm-table-setby-top">set by the host</p></div>
      <dl class="cm-table-rules">
        <div><dt>Bracket</dt><dd>${e(String(lobby.bracket || 3))}</dd></div>
        <div><dt>Deck cost cap</dt><dd>${e(C.money(BUDGET))}</dd></div>
        <div><dt>AI pilot</dt><dd>${e(aiPilotLabel())}</dd></div>
        <div><dt>Remote guests</dt><dd>${lobby.opponents.some((o) => o && o.role === 'human') ? 'on' : 'off'}</dd></div>
        <div><dt>Local host</dt><dd><a class="cm-table-host-link" href="${gameLaunched ? hostOrigin() + '/review' : hostOrigin()}" target="_blank" rel="noopener">${e(hostOrigin().replace(/^https?:\/\//, '') + (gameLaunched ? '/review' : ''))}</a></dd></div>
      </dl>
      <div class="cm-table-launch-row">
        <p class="cm-table-launch${launchError ? " is-error" : ""}" role="status" aria-live="polite" ${launchError ? `title="${e(launchError)}"` : ""}>${e(line)}</p>
        ${gameLaunched ? b("Open table", "lobby-open-table", {}, true, {cls: "compact"}) : launchError ? b("Send Log", "lobby-send-log", {}, true, {cls: "compact"}) : b(countdownEndsAt ? "Stop" : "Start", countdownEndsAt ? "lobby-stop-now" : "lobby-start-now", {}, !countdownEndsAt, {cls: "compact"})}
      </div>
      ${hostReachable === false ? '<p class="cm-table-elsewhere">A game runs on the helper on your own computer. Open <a href="http://127.0.0.1:8768/" target="_blank" rel="noopener">http://127.0.0.1:8768/</a> there to play.</p>' : ''}
      ${gameLaunched && boardBlocked ? '<p class="cm-table-board-link">The board did not open by itself. <a href="/review" target="_blank" rel="noopener">Open the game board</a></p>' : ''}
    </section>`;
  }

  /* Each quadrant's canvas is painted by CrankSea with the element its state names. The
     handles are kept so a redraw stops the old animations rather than leaving four more
     requestAnimationFrame loops running behind the new ones -- which is how a lobby that is
     redrawn on every ready toggle ends up with twenty. */
  /* HOW TALL THE TABLE CAN BE. Whatever is left between its own top and the bottom of the
     window, so the whole table is in view without scrolling. Measured rather than guessed at
     in CSS, because what sits above it changes -- the host-offline banner alone is ~190px. */
  function sizeTable() {
    const table = C.main.querySelector('.cm-lobby-table');
    if (!table) return;
    const top = table.getBoundingClientRect().top;
    const room = Math.round(window.innerHeight - top - 24);
    table.style.setProperty('--cm-table-h', Math.max(320, room) + 'px');
  }
  /* A resize changes the room and the canvases with it, so both are redone together. */
  let sizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => { sizeTable(); startSeas(); }, 150);
  });

  /* MEASURING ONCE IS NOT ENOUGH. crankmagic-online.js inserts the host-offline banner ABOVE
     the table after this view has already drawn, which pushed the table ~190px down the page
     while it kept the height measured from where it used to be -- so it ran off the bottom of
     the window by exactly the banner's height. Web fonts landing late do a smaller version of
     the same thing. So the table's room is observed rather than measured once. */
  let roomObserver = null;
  function watchTableRoom() {
    if (roomObserver) roomObserver.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    const table = C.main.querySelector('.cm-lobby-table');
    if (!table) return;
    let last = -1;
    roomObserver = new ResizeObserver(() => {
      const top = Math.round(table.getBoundingClientRect().top);
      if (top === last) return;   /* only when the table actually moved */
      last = top;
      sizeTable();
    });
    roomObserver.observe(C.main);
  }

  let seaStops = [];
  function startSeas() {
    sizeTable();
    watchTableRoom();
    seaStops.forEach((stop) => { try { stop(); } catch (err) { /* already gone */ } });
    seaStops = [];
    if (typeof CrankSea === 'undefined') return;
    for (const canvas of C.main.querySelectorAll('.cm-seat-sea')) {
      const box = canvas.getBoundingClientRect();
      const w = Math.max(80, Math.round(box.width || 320)), h = Math.max(60, Math.round(box.height || 200));
      seaStops.push(CrankSea.startSea(canvas, {width: w, height: h, element: CrankSea.elementFor(canvas.dataset.sea), opacity: .8}));
    }
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
    const standing = seat ? seatStanding(seat, check) : "";
    /* The label bar above already says "Seat 1 · You". */
    const detail = seat
      ? `<p class="cm-seat-name">${e(primary)}</p><p class="cm-seat-line">${e(standing)}</p>`
      : `<p class="cm-seat-line">Sit down with one of your decks.</p>`;
    return `<article class="cm-lobby-seat is-you${check && !check.ok ? " is-blocked" : ""}${ready ? " is-ready" : ""}">
      <header><h3>Seat 1 · You</h3>${statusPill(seatState(seat, check, ready, null), ready, check)}</header>
      ${seatFigure(seat, detail, seat ? seatControls(seat, ready, {host: true}) : `<div class="cm-actions cm-seat-controls">${b("Seat your deck", "lobby-host-deck", {}, true, {cls: "compact"})}</div>`)}
      <div class="cm-seat-audit">${body}</div>
    </article>`;
  }

  /* THE WAY BACK. Choosing Human or AI was a one-way door: the only undo was Clear the table,
     which empties all four seats to change one. An arrow with a label, because an arrow alone in
     a corner is a guess. */
  function backControl(i) {
    return b('\u2190 Change seat type', 'lobby-seat-back', {opp: String(i)}, false, {cls: 'compact'});
  }

  function seatBoxOpp(i, opp, t) {
    const roleClass = opp.role === "human" ? "is-human" : opp.role === "ai" ? "is-ai" : "is-unused";
    const seat = opp.seat;
    const check = seat ? t.checks.find((c) => c.seatId === seat.id) : null;
    const at = seat ? t.seating.order.indexOf(seat.id) : -1;
    const ready = !!opp.ready;
    const roleLabel = opp.role === "unused" ? "Open" : opp.role === "ai" ? "AI" : (opp.guestName || "Human");
    /* Two different things, kept apart. `body` is the deck AUDIT -- cards, Game Changers,
       score, type bars -- which the wireframe folds away because a quadrant shows a commander,
       not an audit. `tools` is what the HOST acts with on someone else's seat, which the README
       keeps: the invite editor on an empty or human seat, the AI configurator on an AI seat. */
    let body = "";
    let tools = "";
    let readyBtn = "";
    if (opp.role === "unused") {
      tools = `<div class="cm-actions cm-seat-controls">${b("Invite someone", "lobby-invite-seat", {opp: String(i)}, true, {cls: "compact"})}${b("Seat an AI", "lobby-ai-seat", {opp: String(i)}, false, {cls: "compact"})}</div>`;
    } else if (opp.role === "human") {
      tools = humanInviteEditor(i, opp) + `<div class="cm-actions cm-seat-controls">${backControl(i)}</div>`;
      if (seat) {
        body = seatBody(seat, check, at, ready, {host: false, opp: i, human: true});
        readyBtn = readyCorner(ready, "opp", i);
      }
    } else if (!seat) {
      /* The form opens over the table. A quadrant carries one line of detail in 2b, and 2d draws
         Change deck as a dialog; six fields in a 390px box clipped, which is what Rob saw. */
      tools = `<div class="cm-actions cm-seat-controls">${b("Set up this seat", "lobby-setup-seat", {opp: String(i)}, true, {cls: "compact"})}${backControl(i)}</div>`;
    } else {
      body = seatBody(seat, check, at, ready, {host: false, opp: i});
      tools = `<div class="cm-actions cm-seat-controls">${b("Change deck", "lobby-setup-seat", {opp: String(i)}, false, {cls: "compact"})}${b("Leave seat", "lobby-drop", {opp: String(i)}, false, {cls: "compact"})}</div>`;
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
    /* 2b labels a seat by where it sits and who is in it -- "Seat 2 · AI", "Seat 4 · Friend" --
       and puts the commander's own name in the detail column beside the card, where there is
       room for it. The build had the commander in the header, so a long name pushed the status
       pill off the quadrant. */
    const who = `Seat ${i + 2} · ${opp.role === "unused" ? "Open" : opp.role === "ai" ? "AI" : (opp.guestName || "Friend")}`;
    const line = seat ? seatStanding(seat, check)
      : opp.role === "human" ? inviteLine(opp)
      : opp.role === "ai" ? "No deck yet"
      : "";
    /* The label bar already says "Seat 4 · Open"; an empty chair does not need to say it twice. */
    /* The label bar already says "Seat 2 · AI"; the detail column does not repeat it, and an
       unseated AI whose only name IS "AI" gets no name line at all. */
    const nameLine = seat ? primary : (primary === "AI" || primary === "Open" ? "" : primary);
    const detail = !seat && opp.role === "unused"
      ? `<p class="cm-seat-line">Invite someone, or seat an AI.</p>`
      : `${nameLine ? `<p class="cm-seat-name">${e(nameLine)}</p>` : ""}${line ? `<p class="cm-seat-line">${e(line)}</p>` : ""}`;
    return `<article class="cm-lobby-seat ${roleClass}${check && !check.ok ? " is-blocked" : ""}${ready ? " is-ready" : ""}" data-opp="${i}">
      <header><h3>${e(who)}</h3>${statusPill(seatState(seat, check, ready, opp), ready, check)}</header>
      ${seatFigure(seat, detail, tools ? `<div class="cm-seat-host-tools">${tools}</div>` : "")}
      <div class="cm-seat-audit">${body}${readyBtn}</div>
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

  /* THE SEAT'S FIGURE (wireframe 2b). The card and the reading beside it, as one row that
     sits in the quadrant's outer bottom corner. 2b gives the card `height:144` in a 190px
     quadrant and the aspect 488:680 -- about three quarters of the quadrant's height -- so
     the height is a proportion here rather than a pixel count, and the card stays a card at
     every table size. An empty seat gets the same frame, dashed, carrying a question mark:
     the chair is drawn whether or not anyone is in it. */
  function seatFigure(seat, detail, controls) {
    const art = seat ? commanderArtUrl(seat) : '';
    const name = seat ? (((seat.commanders && seat.commanders[0]) || {}).name || seat.name || 'Commander') : '';
    const card = seat
      ? (art
        ? `<button type="button" class="cm-seat-card" data-action="lobby-art-zoom" data-art="${e(art)}" data-name="${e(name)}" aria-label="Enlarge ${e(name)}"><img src="${e(art)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`
        : `<div class="cm-seat-card is-blank" aria-hidden="true"><span>${e(name.slice(0, 2))}</span></div>`)
      : `<div class="cm-seat-card is-empty" aria-hidden="true"><span>?</span></div>`;
    return `<div class="cm-seat-figure">${card}<div class="cm-seat-detail">${detail}${controls || ''}</div></div>`;
  }

  /* What the detail column says, in 2b's order: the commander, then one line of standing.
     For your own seat that line is the bracket and what the deck cost against the house cap,
     which is the same arithmetic the deck page's Cost card does; for a guest who has not
     arrived it is the invite, its expiry and who the table is waiting on. */
  function seatSpend(seat) {
    /* A lobby seat carries `cards` and `commanders`, not `slots` -- slots are a deck's, and a
       seat is built from a deck rather than being one. */
    if (!seat || !C.card) return null;
    const rows = [...(seat.commanders || []), ...(seat.cards || [])];
    if (!rows.length) return null;
    let spend = 0, known = 0;
    for (const row of rows) {
      const card = C.card(row.cardId);
      if (card && Number.isFinite(card.price)) { spend += card.price * (row.quantity || 1); known += 1; }
    }
    return known ? spend : null;
  }
  function seatStanding(seat, check) {
    const bits = [];
    if (check && check.bracket) bits.push(`Bracket ${check.bracket}`);
    const spend = seatSpend(seat);
    if (spend !== null) bits.push(`${C.money(spend)} of ${C.money(BUDGET)}`);
    else if (check) bits.push(`${check.size} of ${L.DECK_SIZE} cards`);
    return bits.join(' · ');
  }

  function deckedVisual(seat, under) {
    const art = commanderArtUrl(seat);
    const cmdName = ((seat.commanders && seat.commanders[0]) || {}).name || seat.name || "Commander";
    const artHtml = art
      ? `<button type="button" class="cm-lobby-art-btn" data-action="lobby-art-zoom" data-art="${e(art)}" data-name="${e(cmdName)}" aria-label="Enlarge ${e(cmdName)}"><img class="cm-lobby-art" src="${e(art)}" alt="${e(cmdName)}" loading="lazy" referrerpolicy="no-referrer"></button>`
      : `<div class="cm-lobby-art cm-lobby-art-fallback">${e(cmdName)}</div>`;
    const counts = L.typeCounts(seat, lookups);
    const max = Math.max(1, ...counts.map((c) => c[1]));
    const bars = counts.map(([label, n, color]) => {
      const pct = Math.max(8, Math.round((n / max) * 100));
      return `<div class="cm-lobby-type-row"><span title="${e(label)}">${e(label)}</span><div class="cm-lobby-type-bar"><i style="width:${pct}%;background:${color}"></i></div><strong>${n}</strong></div>`;
    }).join("");
    /* Right column: type bars, then fit status, then View|Change row, then sim report link. */
    return `<div class="cm-lobby-decked">${artHtml}<div class="cm-lobby-types">${bars || `<p class="cm-muted">No type breakdown yet.</p>`}${under || ""}</div></div>`;
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

  /* THE PLAYER'S OWN CONTROLS (wireframe 2b, README "All player actions live on the player's
     own quadrant"). Change deck, Choose mat, Ready / Not ready, Leave seat -- in that order,
     and only on the seat that belongs to the person reading. */
  function seatControls(seat, ready, meta) {
    if (!seat) return '';
    const opp = meta.host ? {} : {opp: String(meta.opp)};
    const change = meta.host
      ? b('Change deck', 'lobby-host-deck', {}, true, {cls: 'compact'})
      : b('Change deck', 'lobby-change-opp-deck', {opp: String(meta.opp)}, true, {cls: 'compact'});
    const mat = b('Choose mat', 'lobby-choose-mat', opp, false, {cls: 'compact'});
    const readyBtn = b(ready ? 'Not ready' : 'Ready', 'lobby-ready',
      meta.host ? {who: 'host'} : {who: 'opp', opp: String(meta.opp)}, false, {cls: 'compact' + (ready ? ' is-on' : '')});
    const leave = meta.host
      ? b('Leave seat', 'lobby-host-leave', {}, false, {cls: 'compact'})
      : b('Leave seat', 'lobby-drop', {opp: String(meta.opp)}, false, {cls: 'compact'});
    return `<div class="cm-actions cm-seat-controls">${change}${mat}${readyBtn}${leave}</div>`;
  }

  function readyCorner(ready, who, opp) {
    const attrs = who === "host" ? {who: "host"} : {who: "opp", opp: String(opp)};
    return `<div class="cm-lobby-ready">${b(ready ? "Ready" : "Ready Up", "lobby-ready", attrs, !ready, {cls: "compact" + (ready ? " is-on" : "")})}</div>`;
  }

  /* THE COUNTDOWN. Ten seconds, as Rob asked and as the README says. It begins by itself the
     moment the table is ready, and Start begins it at any time the host wants. Losing
     readiness -- a seat stands up, a deck stops validating -- stops it, because a table that
     keeps counting toward a game it can no longer start is lying to the room. */
  /* CAN ANYTHING HERE START A GAME? A game is launched by the helper on this machine, so a
     copy served from the web cannot start one without the browser's permission: Chrome gates
     a public page reaching a loopback address behind Local Network Access, and denies it by
     default ("Permission was denied for this request to access the loopback address"). It is a
     permission, not mixed content -- http://127.0.0.1 is a trustworthy origin. Counting down to a call that
     cannot succeed is what produced Rob's "HTTP 404" on GitHub Pages. null means not asked
     yet, which is treated as 'do not count' until the answer arrives. */
  const hostOrigin = () => (location.hostname === '127.0.0.1' || location.hostname === 'localhost') ? location.origin : 'http://127.0.0.1:8768';
  let hostReachable = null;
  async function probeHost() {
    const local = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (!local) { hostReachable = false; return false; }
    try {
      const res = await fetch('/api/health', {cache: 'no-store'});
      const data = await res.json();
      hostReachable = !!(res.ok && data && data.product === 'CrankMagic Online');
    } catch (_) { hostReachable = false; }
    return hostReachable;
  }

  const COUNTDOWN_SECONDS = 10;
  let countdownEndsAt = 0, countdownTimer = null;
  /* Stop has to mean stop. cancelCountdown redraws, the redraw asks syncCountdown again, and a
     table that is still ready would have started counting straight back up -- so an explicit
     stop is remembered until the table stops being ready or the host presses Start. */
  let countdownStopped = false;
  /* One go and one more, then stop and say so. Rob: "It should try up to 1 additional time." */
  const START_ATTEMPTS = 2;
  let startAttempts = 0, launchError = '';
  /* A table that has started does not count down again. Cleared when the table stops being
     ready -- a seat standing up, Clear the table -- which is when a NEW game becomes possible. */
  let gameLaunched = false;

  function countdownLine() {
    const left = Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000));
    return left ? `Starting in ${left}…` : 'Starting…';
  }
  function paintCountdown() {
    const el = C.main && C.main.querySelector('.cm-table-launch');
    if (el) el.textContent = countdownLine();
  }
  function cancelCountdown(why) {
    if (!countdownEndsAt) return;
    countdownEndsAt = 0;
    clearInterval(countdownTimer); countdownTimer = null;
    if (why) C.notice(why);
    redraw();
  }
  function beginCountdown() {
    if (countdownEndsAt || startInFlight) return;
    countdownEndsAt = Date.now() + COUNTDOWN_SECONDS * 1000;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (Date.now() >= countdownEndsAt) {
        clearInterval(countdownTimer); countdownTimer = null; countdownEndsAt = 0;
        if (actions['lobby-start']) actions['lobby-start']();
        return;
      }
      paintCountdown();
    }, 250);
    redraw();
  }
  /* Called from the view every time it draws, so the clock follows the table's own state. */
  function syncCountdown(ready) {
    if (!ready) {
      countdownStopped = false;   /* the table will count again when it is ready again */
      startAttempts = 0; launchError = ''; gameLaunched = false;
      if (countdownEndsAt) cancelCountdown('A seat is no longer ready. The countdown stopped.');
      return;
    }
    if (gameLaunched) return;              /* one is already running */
    if (hostReachable !== true) return;   /* nothing here can launch a game */
    if (!countdownEndsAt && !startInFlight && !countdownStopped && !launchError) beginCountdown();
  }

  let startInFlight = false;

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
    if (!L) { C.main.innerHTML = C.pageHead("Play", "") + note("The lobby module has not loaded yet. Reload the page.", true); return; }
    const t = table();
    const bracket = t.bracket;
    const brackets = L.BRACKETS.map((x) => [String(x.n), `${x.n} · ${x.name}`]);
    /* 2b's head: "Play", one line saying what the table is, and Game history beside Host tools.
       Seat an opponent and Clear the table move under Host tools -- they are the host's levers,
       and the README puts every host lever in that menu. */
    const head = C.pageHead("Play",
      b("Game history", "lobby-history", {}, true, {cls: "compact"})
      + b("Host tools", "lobby-host-tools", {}, false, {cls: "compact", caret: true}), "game")
      + `<p class="cm-lobby-lede">The four seats laid out as they will sit; the table is the form and the status board.</p>`;

    const confirmed = lobby.rulesConfirmed
      && Number(lobby.rulesConfirmed.bracket) === Number(lobby.bracket)
      && String(lobby.rulesConfirmed.cap) === String(lobby.cap);
    const summary = confirmed
      ? (lobby.rulesConfirmed.summary || L.rulesSummary(bracket, lobby.cap))
      : "Confirm bracket and Game Changer cap before seating reads as final.";

    /* The host's levers are a menu in the action row, not a panel below the table (README:
       "never on the table"). The controls themselves are unchanged -- same ids, same actions --
       so every handler that reached them still does; only where they live has moved. */
    hostToolsHTML = `<p>Table rules</p>
      <div class="cm-toolbar cm-menu-toolbar">
        ${s("Bracket", "lobbyBracket", brackets, String(bracket.n)).replace("<select", '<select data-action-change="lobby-set-bracket"')}
        ${f("Game Changer cap", "lobbyCap", lobby.cap === "" ? "" : String(lobby.cap), `type="number" min="0" max="20" data-action-change="lobby-set-cap" placeholder="${e(bracket.gameChangers === Infinity ? "no limit" : String(bracket.gameChangers))}"`)}
        ${b(confirmed ? "Confirmed" : "Confirm", "lobby-confirm-rules", {}, !confirmed, {cls: "compact" + (confirmed ? " is-on" : "")})}
      </div>
      <hr>
      ${b("Seat an opponent", "lobby-add", {}, false)}
      ${b("Clear the table", "lobby-clear", {}, false)}`;
    const rules = "";

    /* THE TABLE (DELTA B.1). Four quadrants in the order the players sit -- 2 and 3 across the
       top, 4 and you across the bottom, so you are bottom-right and the seat opposite you is
       top-left -- with the rules at the center. Each quadrant's INNER corner is the one
       touching the center panel; that is what the color fan radiates from, and the seat's
       label and card sit away from it, in the outer corners, so the panel can overlap nothing
       that carries a name or a control. */
    /* A seat carries its commander on seat.commanders[0]; the identity is that card's, not the
       seat's. Reading seat.colorIdentity returned undefined for every seat, so the fan drew
       nothing and an empty table looked exactly like a seated one. */
    const seatColors = (seat) => (seat && seat.commanders && seat.commanders[0] && seat.commanders[0].colorIdentity) || [];
    const opps = lobby.opponents;
    const oppQuad = (i, corner) => {
      const opp = opps[i];
      if (!opp) return quadrant(corner, 'is-absent', [], 'empty', '');
      const seat = opp.seat;
      const check = seat ? t.checks.find((c) => c.seatId === seat.id) : null;
      return quadrant(corner, '', seatColors(seat), seatState(seat, check, !!opp.ready, opp), seatBoxOpp(i, opp, t));
    };
    const hostSeat = lobby.host && lobby.host.seat;
    const hostCheck = hostSeat ? t.checks.find((c) => c.seatId === hostSeat.id) : null;
    /* Reading order, which Rob asked for and which supersedes the README's "2 · 3 / 4 · 1, you
       bottom-right": seat 1 top-left, then 2, 3, 4. The argument is the quadrant's INNER corner --
       the one touching the table's card -- so it is the mirror of the position, and every rule
       keyed on .cm-q-* keeps working without being touched. */
    const seats = `<div class="cm-lobby-table">
      ${quadrant('br', 'is-you', seatColors(hostSeat), seatState(hostSeat, hostCheck, !!(lobby.host && lobby.host.ready), null), seatBoxHost(t))}
      ${oppQuad(0, 'bl')}
      ${oppQuad(1, 'tr')}
      ${oppQuad(2, 'tl')}
      ${centerPanel(t, canStartSoon(t))}
    </div>`;

    const canStart = L.startReady(t, lobby);
    /* the clock follows the table, not the other way round */
    (hostReachable === null ? probeHost() : Promise.resolve(hostReachable))
      .then(() => syncCountdown(L.startReady(table(), lobby)));
    const startWhy = !lobby.host ? "Seat your deck first."
      : !lobby.host.ready ? "Ready Up on your seat."
      : !t.ready ? (t.why || "Fix blocked seats.")
      : !canStart ? "Every occupied seat needs Ready Up."
      : "";

    const read = L.activeSeats(lobby).length >= L.MIN_SEATS ? `<section class="v-panel cm-lobby-read"><h2>Before you sit</h2>
      <p class="cm-lobby-verdict">${e(t.pod.read)}</p>
      <dl class="cm-lobby-figs">
        <div><dt>Pod average</dt><dd>${t.pod.average === null ? "-" : t.pod.average}</dd></div>
        <div><dt>The field, without you</dt><dd>${t.pod.field === null ? "-" : t.pod.field}</dd></div>
        <div><dt>Spread</dt><dd>${t.pod.spread === null ? "-" : t.pod.spread}</dd></div>
        <div><dt>Seats</dt><dd>${t.pod.seats} of ${L.MAX_SEATS}</dd></div>
      </dl>
      ${t.pod.partial ? note(t.pod.partial) : ""}
      <p class="cm-muted">Turn order is shuffled when the game starts.</p>
      <div class="cm-actions"><button type="button" class="v-button${canStart ? " primary" : ""}" data-action="lobby-start"${canStart ? "" : " disabled"}>${canStart ? "Start the game" : "Not ready yet"}</button><span class="cm-muted">${e(canStart ? "" : startWhy || "The board is not built yet. This button will deal the first hands once it is.")}</span></div></section>` : "";

    /* Who the private table is waiting on (C.2), drawn while one is open on the local host and
       otherwise empty. The module that draws it is the same one the guest and host pages use. */
    const live = `<div class="cm-lobby-live" aria-live="polite"></div>`;
    C.main.innerHTML = head + seats + live + read + rules;
    startSeas();
    pollLiveReadiness();

    /* Bracket and the cap are bound by delegation below, because they live in a menu that is
       not in the DOM when this runs. */

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
  /* An empty quadrant offers the two things the README says the host gets there, each landing on
     that seat rather than on "the next free one". */
  actions["lobby-invite-seat"] = (el) => setOppRole(Number(el.dataset.opp), "human");
  actions["lobby-ai-seat"] = (el) => setOppRole(Number(el.dataset.opp), "ai");
  actions["lobby-seat-back"] = (el) => setOppRole(Number(el.dataset.opp), "unused");

  /* THE SEAT'S OWN FORM, over the table. wireCommanderSearch already scopes to #cm-dialog
     (see its `input.closest` list), so the commander search works here unchanged. */
  actions["lobby-setup-seat"] = (el) => {
    const i = Number(el.dataset.opp);
    const opp = lobby.opponents[i];
    if (!opp) return;
    C.modal(`Seat ${i + 2}`, inlineDeckEditor(i, opp));
    const box = document.querySelector('#cm-dialog .cm-lobby-inline');
    if (box) wireCommanderSearch(box);
  };
  function setOppRole(i, role) {
    if (!Number.isInteger(i) || !lobby.opponents[i]) return;
    lobby.opponents[i] = Object.assign({}, lobby.opponents[i], {role, seat: null, ready: false});
    save();
    redraw();
  }

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

    const seatMap = L.seatIds(lobby.opponents);
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
    const config = await prepareConfig(token, setup.defaults, setup.decks || []);
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
      summary: L.rulesSummary(bracket, lobby.cap),
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
      const map = L.mapped(lobby.host.seat, lookups);
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
    const map = L.mapped(opp.seat, lookups);
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
      if (from === "generated") seat = conformSeat(seat);
      seat = await persistLobbyDraft(seat, from);
      if (from === "generated") seat = conformSeat(seat);
      let check = L.validate(seat, {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
      if (!check.ok && from === "generated") {
        seat = conformSeat(seat);
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
      /* Applied from the dialog, so the dialog's work is done; leaving it open over a table that
         has already changed underneath it is how a form ends up lying about the seat. */
      if (C.actions && C.actions.close) C.actions.close();
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
    const counts = L.typeCounts(seat, lookups);
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
    /* Rob: the pop-up should be 80-110% of the card on the table. It had no width at all, so it
       took the image's natural size and bore no relation to the card that opened it. 105% of the
       measured card, with a floor of 300px: at 105% of a small quadrant's card the oracle text
       would be the size it is on the table, and reading the card is what a pop-up is for. */
    const from = el.getBoundingClientRect();
    /* 105% of the card, then Rob asked for another 40% on top of that: 1.47. The floor moves
       with it so a small table still gives a readable card. */
    const popWidth = Math.round(Math.max(420, Math.min(from.width * 1.47, window.innerWidth - 48)));
    const pop = document.createElement("div");
    pop.className = "cm-lobby-art-pop";
    pop.style.setProperty("--cm-pop-w", popWidth + "px");
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

  /* HOST TOOLS, THE MENU. Built where the view is drawn so it carries that draw's bracket and
     summary, and popped from the action row. The same markup the panel held, in a popover. */
  let hostToolsHTML = "";
  function popLobbyMenu(el, html, width) {
    document.querySelectorAll(".cm-lobby-menu").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "cm-menu cm-lobby-menu";
    menu.setAttribute("popover", "auto");
    menu.innerHTML = html;
    /* INSIDE #matrix-v2, not on document.body. Every design token is declared on that element
       (crankmagic-design.css 19, 21, 45), and custom properties inherit down the DOM -- a
       popover paints in the top layer but still inherits from its DOM parent. Appended to the
       body, every var(--v-*) in .cm-menu resolved to nothing and the menu had no background
       at all. */
    (document.getElementById('matrix-v2') || document.body).appendChild(menu);
    const place = () => {
      if (!el.isConnected) { if (menu.matches(":popover-open")) menu.hidePopover(); return; }
      const r = el.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - (width || 300))) + "px";
      menu.style.top = Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + "px";
    };
    menu.showPopover(); place();
    if (C.followAnchor) C.followAnchor(menu, place);
    menu.addEventListener("toggle", (ev) => { if (ev.newState === "closed") menu.remove(); });
    return menu;
  }
  actions["lobby-host-tools"] = (el) => {
    /* A second press closes what the first opened, rather than stacking another behind it. */
    const open = document.querySelector('.cm-lobby-menu');
    if (open) { try { open.hidePopover(); } catch (err) { open.remove(); } return; }
    popLobbyMenu(el, hostToolsHTML, 320);
  };
  /* GAME HISTORY. It used to set location.hash = 'reports', and there is no `reports` view --
     route() falls back to `decks` for any hash it does not know, so the control looked like it
     worked and landed on the wrong page. The games are already in the library; this shows
     them. */
  actions["lobby-history"] = () => {
    const games = (C.state.games || []).slice().sort((a, x) => String(x.playedAt || '').localeCompare(String(a.playedAt || '')));
    if (!games.length) {
      C.modal('Game history', `<p>No games are recorded yet.</p><p class="cm-muted">A game logs itself when it finishes, and you can add one by hand from a deck's page.</p>`);
      return;
    }
    const deckName = (id) => { const d = (C.state.decks || []).find((x) => x.id === id); return d ? d.name : 'Unknown deck'; };
    const rows = games.slice(0, 50).map((g) => `<tr><td>${e(C.readableLocation ? String(g.playedAt || '').slice(0, 10) : String(g.playedAt || '').slice(0, 10))}</td>
      <td>${e(deckName(g.deckId))}</td><td>${e(String(g.outcome || '-'))}</td><td>${e(g.finish ? String(g.finish) : '-')}</td>
      <td>${e(g.pod ? String(g.pod) : '-')}</td></tr>`).join('');
    C.modal('Game history', `<p class="cm-muted">${games.length} game${games.length === 1 ? '' : 's'} recorded. The most recent fifty are shown.</p>
      <div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Played</th><th>Deck</th><th>Outcome</th><th>Finish</th><th>Pod</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  };

  /* LEAVE SEAT (wireframe 2b). Standing up is not clearing the table: it empties one seat and
     leaves the rest of the table as it was. */
  actions["lobby-host-leave"] = () => {
    if (!lobby.host) return;
    lobby.host = Object.assign({}, lobby.host, {seat: null, ready: false});
    redraw();
  };
  actions["lobby-drop"] = (el) => {
    const i = Number(el.dataset.opp);
    if (!Number.isInteger(i) || !lobby.opponents[i]) return;
    lobby.opponents = lobby.opponents.filter((_, k) => k !== i);
    redraw();
  };

  /* CHOOSE MAT (wireframe 2b, README "the playmat art your board wears in game"). The strip is
     the six elements of turn 3 -- the same animations the quadrants already run -- because those
     are the mats the app actually owns. Uploading your own is named in the handoff as the next
     increment; a picker that offered it today would offer nothing. */
  /* THE PLAYMAT PICKER. The catalog is game/ui/playmats.mjs -- Rob's own uploads, the same
     nine the table draws -- and the store is that module's saveMatPreference, which is where
     the table reads from. Anything else would be a choice that never reached the game. */
  let matsModule = null;
  async function loadMats() {
    if (matsModule) return matsModule;
    /* served by the local host at /playmats.mjs (game/tools/serve-review.mjs:29), the same way
       the connection panel is loaded above */
    matsModule = await import("/playmats.mjs");
    return matsModule;
  }
  function matSeatId(el) {
    /* playmats.mjs numbers the host 0 and the opponents 1..3 (defaultPlaymat(seatId)). */
    const opp = el.dataset.opp;
    return opp === undefined || opp === "" ? 0 : Number(opp) + 1;
  }
  actions["lobby-choose-mat"] = async (el) => {
    const seatId = matSeatId(el);
    let M2;
    try { M2 = await loadMats(); } catch (err) {
      C.modal("Choose your mat", `<p>The playmats live on the local host, and it is not answering.</p>
        <p class="cm-muted">Start CrankMagic Online and open this again. A mat only matters once a game is running, and a game needs the host too.</p>`);
      return;
    }
    const current = M2.readMatPreferences()[seatId] || M2.defaultPlaymat(seatId);
    const tile = (id, name, image, note) => `<button type="button" class="cm-mat${id === current ? " is-on" : ""}" data-action="lobby-set-mat" data-mat="${e(id)}" data-seat="${seatId}" aria-pressed="${id === current}">
      <span class="cm-mat-art"${image ? ` style="background-image:url(&quot;${e(image)}&quot;)"` : ' data-plain="1"'}></span>
      <span class="cm-mat-name">${e(name)}${note ? `<small>${e(note)}</small>` : ""}</span></button>`;
    const tiles = [tile("random", "Surprise me", null, "a different one each game")]
      .concat(M2.PLAYMATS.map((m) => tile(m.id, m.name, m.image, m.image ? "" : "no art")));
    C.modal("Choose your mat", `<p class="cm-muted">Pick it here and it comes with you into the game. Every seat wears its own.</p>
      <div class="cm-mat-strip">${tiles.join("")}</div>`);
  };
  actions["lobby-set-mat"] = async (el) => {
    const M2 = await loadMats();
    M2.saveMatPreference(Number(el.dataset.seat), el.dataset.mat);
    if (C.actions && C.actions.close) C.actions.close();
    C.notice("Mat saved for this seat. It comes with you into the game.");
  };
  /* Which pilot the AI seats fly by default -- 2b's fourth table rule. */
  function aiPilotLabel() {
    const ai = lobby.opponents.filter((o) => o && o.role === "ai");
    if (!ai.length) return "no AI seats";
    const names = [...new Set(ai.map((o) => o.pilot || "Forge"))];
    return names.length === 1 ? names[0] : "mixed";
  }



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
      /* "HTTP 404" tells a person nothing. The host always answers with a JSON body, so a
         response without one did not come from the host at all -- which is what happens when
         the app is served from somewhere else and /api/... resolves against that origin. */
      const err = (data && (data.error || data.message))
        || (res.status === 404
          ? `Nothing answered ${path}. A game runs on CrankMagic Online on your own computer; this page is served from ${location.origin}, which has no game host of its own.`
          : res.statusText || ('HTTP ' + res.status));
      throw new Error(err);
    }
    return data;
  }

  /* One seat of the prepare body. L.prepareSeat decides; when it hands back a handoff, the
     list goes through /api/import-deck first and the id that comes back fills the request. */
  async function seatRequest(seat, seatId, kind, token, catalogDecks, maxCost) {
    const {request, handoff, commander} = L.prepareSeat(seat, seatId, kind, {catalogDecks, maxCost, budget: BUDGET});
    if (!handoff) return request;
    const imported = await lobbyApi('/api/import-deck', {method: 'POST', token, body: handoff});
    return Object.assign(request, {deckId: imported.id, commander: imported.commander || commander});
  }
  /* The prepare body: L.prepareOrder puts the seats in the order the host wants and counts
     them; the imports happen here, one seat at a time. */
  async function prepareConfig(token, defaults, catalogDecks) {
    const order = L.prepareOrder(lobby, {budget: BUDGET, defaultBracket: defaults && defaults.bracket});
    const seats = [];
    for (let i = 0; i < order.ordered.length; i++) {
      seats.push(await seatRequest(order.ordered[i].seat, i, order.ordered[i].kind, token, catalogDecks, order.maxCost));
    }
    return {bracket: order.bracket, maxCost: order.maxCost, humans: order.humans, ais: order.ais, seats};
  }

  /* THE CONNECTION PANEL IN THE WORKSHOP LOBBY (C.2). While the Play view is open, ask the local
     host who the private table is waiting on and draw it under the seats. The host answers
     /api/table/readiness without a token; on GitHub Pages or with no host running the request
     fails once and the poll stops, so the workshop never depends on the host being there. The
     panel itself is game/ui/connection.mjs, the one module all three pages draw it with, loaded
     from the host's root the first time it is needed. */
  let liveReadinessTimer = null, connectionModule = null, liveToken = null;
  async function pollLiveReadiness() {
    clearTimeout(liveReadinessTimer);
    const mount = C.main.querySelector(".cm-lobby-live");
    if (!mount || location.hash.replace(/^#/, "") !== "game") return;
    let readiness = null;
    try {
      const res = await fetch("/api/table/readiness", {cache: "no-store"});
      if (res.status === 409) readiness = null;   /* the host is up, no table is open */
      else if (!res.ok) return;                   /* no host here: stop until the view is drawn again */
      else readiness = await res.json();
    } catch (_) { return; }
    if (readiness) {
      try {
        connectionModule = connectionModule || await import("/connection.mjs");
        /* The table's own clock for the countdown headline. /api/table wants the host token,
           which /api/setup hands out once per page. */
        if (!liveToken) { const setup = await lobbyApi("/api/setup").catch(() => null); liveToken = setup && setup.token || null; }
        const open = liveToken ? await lobbyApi("/api/table", {token: liveToken}).catch(() => null) : null;
        mount.replaceChildren(connectionModule.renderConnectionPanel(readiness, {youSeatId: 0, countdownAt: open && open.table ? open.table.countdownAt : undefined}));
      } catch (_) { mount.replaceChildren(); }
    } else mount.replaceChildren();
    liveReadinessTimer = setTimeout(pollLiveReadiness, readiness && readiness.phase === "countdown" ? 1000 : 2000);
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

  /* Did the board tab open? A pop-up with no click behind it is refused, and the countdown has
     no click behind it, so this is read by the launch box rather than assumed. */
  let boardBlocked = false;
  function lobbyResumeTabletop() {
    try { window.dispatchEvent(new Event('crankmagic-game-ready')); } catch (_) {}
    /* THE BOARD IS /review. It used to assign('/'), and the host's root 302s to /app/#game -- so
       a launched game navigated straight back to its own lobby and no board was ever seen. A new
       tab, as Rob asked, leaving the lobby where it is. */
    try {
      const board = window.open('/review', 'crankmagic-board', 'noopener');
      boardBlocked = !board;
      if (board) { redraw(); return; }
      C.notice('The browser blocked the game board tab. Open it from the table card.', true);
      redraw();
      return;
    } catch (_) { boardBlocked = true; }
    try {
      if (C.views && typeof C.views.online === 'function') {
        location.hash = 'online';
      }
    } catch (_) {}
  }


  /* THE TABLE'S RULES, wherever their controls happen to be. Changing either clears every
     ready flag, because a seat that agreed to one bracket has not agreed to another. */
  actions["lobby-set-bracket"] = (el) => {
    lobby.bracket = Number(el.value) || 3;
    lobby.rulesConfirmed = null;
    if (lobby.host) lobby.host.ready = false;
    lobby.opponents.forEach((o) => { o.ready = false; });
    cancelCountdown();
    save();
    redraw();
  };
  actions["lobby-set-cap"] = (el) => {
    lobby.cap = el.value === "" ? "" : Math.max(0, Number(el.value) || 0);
    lobby.rulesConfirmed = null;
    if (lobby.host) lobby.host.ready = false;
    lobby.opponents.forEach((o) => { o.ready = false; });
    cancelCountdown();
    save();
    redraw();
  };

  actions["lobby-start-now"] = () => {
    const t = table();
    if (hostReachable === false) {
      C.notice('A game runs on your own computer, and the browser blocks this page from reaching it. Open http://127.0.0.1:8768/ on that machine to play.', true);
      return;
    }
    if (!L.startReady(t, lobby)) { C.notice(t.why || 'Ready Up every occupied seat and fix any blocked decks.', true); return; }
    countdownStopped = false;
    startAttempts = 0; launchError = '';   /* pressing Start is asking to try again */
    beginCountdown();
  };
  actions["lobby-stop-now"] = () => { countdownStopped = true; cancelCountdown("Countdown stopped. Press Start when you are ready."); };

  actions["lobby-start"] = async () => {
    const t = table();
    if (!L.startReady(t, lobby)) {
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
      const config = await prepareConfig(token, setup.defaults, setup.decks || []);
      /* An invitation is bound to the table id it was issued against. Email Invite opens the
         lobby itself when none is open, so by the time Start is pressed a table is usually
         already accepting guests. Preparing a second one mints a new table id and every link
         already emailed reads as "Invitation expired or unavailable" the moment a guest opens
         it. Reuse the open table instead. */
      if (config.humans > 1) {
        const open = await lobbyApi('/api/table').catch(() => null);
        if (L.tableAccepting(open)) {
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
      /* A 200 FROM /api/start MEANS THE ENGINE WAS SPAWNED. Everything after this point is
         reporting, and a failure to report is not a failure to launch. This is the loop Rob hit:
         lobbyPollLive threw, the catch counted it as a failed start, the retry ran lobby-start
         again -- and since batch 9 that CLOSES the running engine and opens a new one. So a
         working game was killed and relaunched, over and over. Marked launched here, before
         anything that can throw. */
      gameLaunched = true;
      cancelCountdown();
      if (started && started.lobby) {
        applyServerInvitations(started.invitations || []);
        startInFlight = false;
        redraw();
        C.notice('Private lobby open — Email Invite / Copy Link now use live guest links. Guests can pick decks.');
        return;
      }
      startInFlight = false;
      redraw();
      /* Reporting only. If the engine is slow to answer, or answers oddly, the game is still
         running and the lobby must not try to start it again. */
      try {
        const live = await lobbyPollLive(240000);
        C.notice(live.status === 'playing' ? 'Live table is playing.' : 'Live table is ready.');
      } catch (reportErr) {
        C.notice('Forge was launched. The table is not reporting its status yet — open it to check.');
      }
      lobbyResumeTabletop();
    } catch (err) {
      startInFlight = false;
      const why = (err && err.message) ? err.message : String(err);
      /* If the engine is already up, this was not a failure to launch and retrying would close a
         running game. */
      if (gameLaunched) { redraw(); C.notice(why, true); return; }
      startAttempts += 1;
      if (startAttempts < START_ATTEMPTS) {
        /* One more go, and say that is what is happening rather than flashing the same error. */
        C.notice(`Starting failed (${why}). Trying once more…`, true);
        countdownEndsAt = 0;
        redraw();
        beginCountdown();
        return;
      }
      /* Out of tries. Hold the failure where the person is looking, with what it was and when,
         so Send Log has something worth sending. */
      launchError = `${why}\n\nAt: ${new Date().toISOString()}\nRoute: ${location.href}\nSeats: ${L.activeSeats(lobby).length}\nBracket: ${lobby.bracket}`;
      redraw();
    }
  };

  /* SEND LOG. The third state of the launch button, shown only while an error is. It opens the
     default mail client with the failure already written out -- a person who has just watched a
     table fail to start should not have to retype what happened. */
  /* The table is running; this goes to it rather than starting another. */
  actions["lobby-open-table"] = () => lobbyResumeTabletop();

  actions["lobby-send-log"] = () => {
    if (!launchError) return;
    const subject = encodeURIComponent('CrankMagic: the table failed to start');
    const body = encodeURIComponent(`This is the error CrankMagic reported when the countdown finished.\n\n${launchError}\n`);
    window.location.href = `mailto:minor.rob@gmail.com?subject=${subject}&body=${body}`;
  };



  C.HELP = C.HELP || {};
  /* The "?" reads {title, body}; a bare string here printed "undefined" over the dialog (D2). */
  C.HELP.game = {title: "Play a game", body: `<h3>Games run on your own computer</h3>
    <p>A game of Commander is played by CrankMagic Online, the helper that runs on your own
    machine, with Forge as its rules engine. The web copy of this page can show you the table and
    let you set it up, but Chrome will not let a page served from the web reach an address on your
    computer without being asked first, so it cannot start a game.</p>
    <p><strong>To play:</strong> start CrankMagic Online on that computer and open
    <code>http://127.0.0.1:8768/</code> there. Each copy keeps its own library, so seats set up
    here stay here.</p>
    <h3>What CrankMagic Online is</h3>
    <p>It hosts the table, checks every deck against Forge's card database before anyone sits
    down, seats the players, launches the engine, and writes the finished match back onto the deck
    it was played with. AI seats can be flown by Forge's own pilot or by an API model; a key for
    that is held by the local service and never by this browser.</p>
    <h3>What the lobby does</h3><ul>
    <li><strong>Four seats.</strong> Host plus three opponent boxes. Opponents are Human, AI, or Open.</li>
    <li><strong>Human seats</strong> use Name, Email, Email Invite, and Copy Link. Guests bring their own decks.</li>
    <li><strong>Confirm</strong> locks bracket and Game Changer cap for the table summary.</li>
    <li><strong>Ready Up</strong> sits top-right on each decked seat. Ready stays blocked until names resolve in the catalog (~100) and the list fits the cap.</li>
    <li><strong>View cards</strong> opens the seated list. Decked seats show commander art and a type bar chart.</li>
    <li><strong>Build from Commander</strong> searches the catalog, then builds a 100 under this table's bracket and cap.</li>
  </ul>`};
});
