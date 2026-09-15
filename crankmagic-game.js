/* THE LOBBY, ON SCREEN (docs/crankmagic-game-plan.md §5.1, PR G0). Pick your deck, seat one to
 * three opponents, set the rules of the table, and read the pod before you sit. No AI, no board,
 * no turn: this ships on its own and is the thing every later piece of the game is entered from.
 *
 * THE ARITHMETIC IS NOT HERE. crankmagic-lobby.js decides what a seat is, whether it may sit, how
 * to trim it to the bracket, who goes first and whether the pod is fair; this file turns those
 * answers into a page and turns the reader's clicks back into a config. Nothing about a bracket
 * or a colour identity is spelled twice.
 *
 * FOUR WAYS TO FILL A SEAT, ONE SHAPE OUT (§5.1 step 2):
 *   - a deck in the library, with the score its own measured runs give it;
 *   - an Archidekt link, through deck-sources.js, which brings full oracle data on arrival;
 *   - a Moxfield or Deckstats paste, because those sites answer a deck request with 403 to a
 *     browser and a server alike, so the export is the honest path;
 *   - a list drafted from a commander by draft-builder.js, seeded to the bracket and a budget.
 *
 * THE LOBBY IS NOT SAVED TO THE LIBRARY. A table being set up is not a fact about your
 * collection, so it lives in memory and in localStorage under its own key, the way the table's
 * canvas and the sandbox's sitting do. Starting a game will write a game record; setting one up
 * never does.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {M, esc: e, button: b, select: s, field: f, note, form, actions, views, $} = C;
  const L = globalThis.CrankLobby;
  const SRC = globalThis.CrankDeckSources;

  /* ---------------------------------------------------------------- the table being set up */
  /* Remembered per device, like every other "what am I looking at" preference. The seats keep
     their card lists, so a link fetched once is not fetched again after a reload. */
  const KEY = "cm-lobby";
  const EMPTY = {bracket: 3, cap: "", seats: [], seed: "", fixedSeating: false};
  let lobby = load();
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || !Array.isArray(raw.seats)) return {...EMPTY};
      return {bracket: Number(raw.bracket) || 3, cap: raw.cap === undefined ? "" : raw.cap, seats: raw.seats, seed: String(raw.seed || ""), fixedSeating: !!raw.fixedSeating};
    } catch (err) { return {...EMPTY}; }
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(lobby)); } catch (err) { /* a private window; the table still stands for this session */ } };
  const table = () => L.table({bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap, seats: lobby.seats, seed: lobby.seed, fixedSeating: lobby.fixedSeating});
  const redraw = () => { save(); C.render(); };

  /* ---------------------------------------------------------------- a library deck as a seat */
  /* THE SCORE IS THE DECK'S OWN MEASURED RUN. The library keeps every simulation report the
     engine files, and the deck page already reads them; the lobby reads the same ones rather
     than a ratings file keyed to six commanders by name. A deck that has never been measured
     carries no score, and the pod read says so out loud instead of guessing — "Measure this
     deck" on the deck page is what fills it in. A run made before the list changed still counts,
     and says which list it measured. */
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

  /* A library deck as a seat: the hundred it names, the commanders at its head, and the facts
     each card carries in the catalog — the colour identity the seat is checked against, the Game
     Changer flag the cap counts, and the rank a trim would order by. */
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

  /* ---------------------------------------------------------------- a fetched or pasted list */
  /* An Archidekt row arrives with its own oracle facts attached; a pasted row arrives as a name
     and a number, and the catalog fills in what the checks need — colour identity, the Game
     Changer flag, the rank the trim orders by. A name the catalog has never seen keeps its name
     and nothing else, which is why validate() skips the colour check where a list carries no
     identities at all: a check that cannot see reads as a clean bill, which is worse than none. */
  function seatFromList(parsed, {name, kind, url, you}) {
    const known = (n) => (C.catalog && C.catalog.exact ? C.catalog.exact(n) : null);
    const fill = (row) => {
      const facts = row.card || known(row.name) || {};
      return {name: row.name, quantity: row.quantity || 1, cardId: facts.id || "",
        gameChanger: !!facts.gameChanger, colorIdentity: facts.colorIdentity || [],
        typeLine: facts.typeLine || "", edhrecRank: facts.edhrecRank, price: facts.price};
    };
    /* Archidekt names its commanders in a category; a paste names them in a section. Either way
       they arrive as a list of names, and the 99 is everything else. */
    const names = new Set((parsed.commander || []).map((x) => String(x).toLowerCase()));
    const rows = parsed.cards || [];
    const commanders = (parsed.commanders || rows.filter((r) => r.isCommander || names.has(String(r.name).toLowerCase()))).map(fill);
    const cards = rows.filter((r) => !(r.isCommander || names.has(String(r.name).toLowerCase()))).map(fill);
    return L.seat({name: name || parsed.name || "Imported deck", kind, url, you,
      commanders, cards, score: null,
      scoreWhy: "No measured score: the simulator has not played this list."});
  }

  /* ---------------------------------------------------------------- the page */
  const KIND = {library: "from your library", link: "from a link", paste: "pasted", generated: "generated"};

  function seatCard(seat, check, order) {
    const gcCap = check.cap === Infinity ? "any" : check.cap;
    const at = order.indexOf(seat.id);
    const problems = check.issues.map((i) => `<li class="cm-lobby-issue is-${e(i.severity)}">${e(i.why)}</li>`).join("");
    const fixes = check.ok ? "" : `<div class="cm-actions cm-lobby-fixes">${check.issues.some((i) => i.code === "gameChangers")
      ? b("Trim to the bracket", "lobby-trim", {seat: seat.id}, true, {cls: "compact"}) + b("Change the bracket", "lobby-bracket-up", {}, false, {cls: "compact"}) : ""}${b("Take this seat out", "lobby-remove", {seat: seat.id}, false, {cls: "compact"})}</div>`;
    return `<article class="cm-lobby-seat${seat.you ? " is-you" : ""}${check.ok ? "" : " is-blocked"}">
      <header><span class="cm-lobby-order">${at >= 0 ? at + 1 : "—"}</span><h3>${e(seat.name)}${seat.you ? ' <span class="cm-lobby-tag">you</span>' : ""}</h3>
        <span class="cm-muted">${e(seat.commanders.map((c) => c.name).join(" & ") || "no commander")} · ${e(KIND[seat.kind])}</span></header>
      <dl class="cm-lobby-figs">
        <div><dt>Cards</dt><dd class="${check.size === L.DECK_SIZE ? "" : "cm-amber"}">${check.size} of ${L.DECK_SIZE}</dd></div>
        <div><dt>Game Changers</dt><dd class="${check.gameChangers > check.cap ? "cm-amber" : ""}">${check.gameChangers} of ${gcCap}</dd></div>
        <div><dt>Score</dt><dd${seat.scoreWhy ? ` title="${e(seat.scoreWhy)}"` : ""}>${seat.score === null ? "—" : seat.score}</dd></div>
        <div><dt>Colours</dt><dd>${check.colors.length ? C.colors(check.colors) : "—"}</dd></div>
      </dl>
      ${problems ? `<ul class="cm-lobby-issues">${problems}</ul>` : `<p class="cm-lobby-ok">Ready to sit.</p>`}
      ${fixes || `<div class="cm-actions cm-lobby-fixes">${b("Take this seat out", "lobby-remove", {seat: seat.id}, false, {cls: "compact"})}</div>`}
    </article>`;
  }

  views.game = async () => {
    if (!L) { C.main.innerHTML = C.pageHead("Play a game", "") + note("The lobby module has not loaded yet. Reload the page.", true); return; }
    const t = table(), order = t.seating.order;
    const bracket = t.bracket;
    const brackets = L.BRACKETS.map((x) => [String(x.n), `${x.n} · ${x.name}`]);
    const head = C.pageHead("Play a game",
      b("Seat an opponent", "lobby-add", {}, false, {cls: "compact"})
      + b("Reshuffle the seating", "lobby-reseat", {}, false, {cls: "compact"})
      + b("Clear the table", "lobby-clear", {}, false, {cls: "compact"}), "game");

    const rules = `<section class="v-panel cm-lobby-rules"><h2>The rules of this table</h2>
      <div class="cm-toolbar">
        ${s("Bracket", "lobbyBracket", brackets, String(bracket.n))}
        ${f("Game Changer cap", "lobbyCap", lobby.cap === "" ? "" : String(lobby.cap), `type="number" min="0" max="20" placeholder="${e(bracket.gameChangers === Infinity ? "no limit" : String(bracket.gameChangers))}"`)}
        ${f("Seating seed", "lobbySeed", lobby.seed, 'placeholder="leave blank for a new table each time"')}
      </div>
      <p class="cm-lobby-says">${e(bracket.says)}</p>
      <p class="cm-muted">The cap is the only bracket rule the lobby counts. Mass land denial, chained extra turns and two-card infinite combos are judgements about how a deck plays rather than counts, so they are yours to keep — not the app's to police.</p></section>`;

    const seats = t.seats.length
      ? `<div class="cm-lobby-seats">${t.seats.map((seat, i) => seatCard(seat, t.checks[i], order)).join("")}</div>`
      : `<div class="v-panel cm-lobby-empty"><h2>No one is seated</h2><p>Pick your deck and one to three opponents. Every seat is judged by the same bracket, and the pod's balance is read from the measured scores before anything starts.</p>${b("Seat your deck", "lobby-add", {you: "1"}, true)}</div>`;

    const read = t.seats.length >= L.MIN_SEATS ? `<section class="v-panel cm-lobby-read"><h2>Before you sit</h2>
      <p class="cm-lobby-verdict">${e(t.pod.read)}</p>
      <dl class="cm-lobby-figs">
        <div><dt>Pod average</dt><dd>${t.pod.average === null ? "—" : t.pod.average}</dd></div>
        <div><dt>The field, without you</dt><dd>${t.pod.field === null ? "—" : t.pod.field}</dd></div>
        <div><dt>Spread</dt><dd>${t.pod.spread === null ? "—" : t.pod.spread}</dd></div>
        <div><dt>Seats</dt><dd>${t.pod.seats} of ${L.MAX_SEATS}</dd></div>
      </dl>
      ${t.pod.partial ? note(t.pod.partial) : ""}
      <p class="cm-muted">Turn order: ${order.map((id, i) => `${i + 1}. ${e((t.seats.find((x) => x.id === id) || {}).name || "")}`).join(" · ")}${t.seating.seed ? ` · seed <code>${e(t.seating.seed)}</code>` : ""}</p>
      <div class="cm-actions"><button type="button" class="v-button${t.ready ? " primary" : ""}" data-action="lobby-start"${t.ready ? "" : " disabled"}>${t.ready ? "Start the game" : "Not ready yet"}</button><span class="cm-muted">${e(t.why || "The board is not built yet — this button will deal the first hands once it is.")}</span></div></section>` : "";

    C.main.innerHTML = head + rules + seats + read;

    $("[name=lobbyBracket]").addEventListener("change", (ev) => { lobby.bracket = Number(ev.target.value) || 3; redraw(); });
    $("[name=lobbyCap]").addEventListener("change", (ev) => { lobby.cap = ev.target.value === "" ? "" : Math.max(0, Number(ev.target.value) || 0); redraw(); });
    $("[name=lobbySeed]").addEventListener("change", (ev) => { lobby.seed = ev.target.value.trim(); redraw(); });
  };

  /* ---------------------------------------------------------------- seating an opponent */
  actions["lobby-add"] = (el) => {
    const you = el.dataset.you === "1" || !lobby.seats.some((x) => x.you);
    const decks = C.state.decks.filter((d) => !d.archived && !lobby.seats.some((x) => x.deckId === d.id));
    if (lobby.seats.length >= L.MAX_SEATS) throw Error(`A table seats ${L.MAX_SEATS}. Take one out before seating another.`);
    form(you ? "Seat your deck" : "Seat an opponent",
      s("Where the deck comes from", "from", [["library", "One of your decks"], ["link", "An Archidekt link"], ["paste", "A pasted decklist"], ["generated", "Built from a commander"]], "library")
      + s("Your deck", "deckId", decks.map((d) => [d.id, d.name]), decks[0] ? decks[0].id : "")
      + f("Archidekt link", "url", "", 'type="url" placeholder="https://archidekt.com/decks/…"')
      + f("Name this seat", "name", "", 'maxlength="160" placeholder="whose deck is this?"')
      + `<label class="cm-full">Decklist<textarea name="paste" rows="8" maxlength="20000" placeholder="1 Krenko, Mob Boss&#10;&#10;1 Sol Ring&#10;30 Mountain…"></textarea></label>`
      + f("Commander to build from", "commander", "", 'maxlength="160" placeholder="Krenko, Mob Boss"')
      + note("Every seat is judged by this table's bracket the moment it sits, and what fails is named by card. A pasted list keeps its names; where the catalog knows a card, its colours, its Game Changer flag and how often it is played come with it."),
      async (v) => { await addSeat(v, you); }, "Seat it");
  };

  async function addSeat(v, you) {
    const kind = v.from || "library";
    if (kind === "library") {
      const deck = C.state.decks.find((d) => d.id === v.deckId);
      if (!deck) throw Error("Choose a deck.");
      lobby.seats.push(seatFromDeck(deck, you));
    } else if (kind === "link") {
      if (!SRC) throw Error("The deck-sources module has not loaded; paste the list instead.");
      const url = String(v.url || "").trim();
      if (!url) throw Error("Paste the deck's link.");
      const site = SRC.identify(url);
      if (!site) throw Error("That link is not one this app reads. Archidekt works directly; Moxfield and Deckstats answer a request with 403, so paste their export instead.");
      const loaded = await SRC.load(url);
      lobby.seats.push(seatFromList(loaded.deck, {name: loaded.deck.name, kind: "link", url, you}));
    } else if (kind === "paste") {
      const parsed = parsePaste(String(v.paste || ""));
      if (!parsed.cards.length) throw Error("Nothing in that paste read as a decklist. One card a line, with a quantity in front.");
      lobby.seats.push(seatFromList(parsed, {name: v.name || "Pasted deck", kind: "paste", you}));
    } else {
      lobby.seats.push(await generatedSeat(String(v.commander || "").trim(), you));
    }
    redraw();
  }

  /* A paste is one card a line: an optional quantity, the name, and anything after it ignored.
     The first line under a "Commander" header, or the first line of a one-card first block, is
     the commander — the two shapes every export site writes. */
  function parsePaste(text) {
    const lines = text.split(/\r?\n/).map((x) => x.trim());
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
    /* No header, but the list opens with a single card and then a blank line: that is the
       commander in every export that does not label it. */
    if (!commanders.length && cards.length > 1 && lines[0] && !lines[1]) commanders.push(cards.shift());
    return {commanders, cards};
  }

  /* A seat the draft builder makes: the commander, the bracket's ceiling, and whatever the
     catalog can offer in colour. The list it returns is a starting hundred, not a measured one,
     so the seat carries no score and the pod read says the read is partial. */
  async function generatedSeat(name, you) {
    const B = globalThis.CrankDraft;
    if (!B) throw Error("The draft builder has not loaded yet.");
    if (!name) throw Error("Name the commander to build from.");
    const found = C.catalog && C.catalog.exact ? C.catalog.exact(name) : null;
    if (!found) throw Error(`The catalog has no card called ${name}. Check the spelling, or paste the list instead.`);
    /* The whole catalog is the pool, the way the Lab drafts; the builder does the filtering by
       colour identity and legality itself, and it reads the bracket's Game Changer cap from the
       same ceiling the lobby set. */
    const pool = C.catalog.all();
    const built = B.build({commanders: [found], cards: pool, definition: {bracketCeiling: lobby.bracket, budget: null, perCardCap: null}});
    const byId = new Map(pool.map((c) => [c.id, c]));
    const cards = (built.slots || []).map((r) => { const c = byId.get(r.cardId) || {}; return {
      name: c.name || r.cardId, quantity: r.quantity || 1, cardId: r.cardId, gameChanger: !!c.gameChanger,
      colorIdentity: c.colorIdentity || [], typeLine: c.typeLine || "", edhrecRank: c.edhrecRank, price: c.price}; });
    return L.seat({name: `${found.name} (generated)`, kind: "generated", you,
      commanders: [{name: found.name, cardId: found.id, colorIdentity: found.colorIdentity || []}],
      cards, score: null, scoreWhy: "Built here, never measured: the simulator has not played this list."});
  }

  /* ---------------------------------------------------------------- the two ways forward */
  actions["lobby-trim"] = (el) => {
    const at = lobby.seats.findIndex((x) => x.id === el.dataset.seat);
    if (at < 0) return;
    const result = L.trim(lobby.seats[at], {bracket: lobby.bracket, gameChangers: lobby.cap === "" ? undefined : lobby.cap});
    if (!result.dropped.length) { C.notice("Nothing to trim — this deck is already inside the bracket."); return; }
    form(`Trim ${lobby.seats[at].name} to bracket ${lobby.bracket}`,
      `<ul class="cm-lobby-trim">${result.dropped.map((d) => `<li><strong>${e(d.name)}</strong> out</li>`).join("")}${result.added.map((a) => `<li>${a.quantity}× <strong>${e(a.name)}</strong> in</li>`).join("")}</ul>`
      + note(result.says) + note("This changes the seat, not the deck in your library."),
      () => { lobby.seats[at] = result.seat; redraw(); }, "Trim it");
  };
  actions["lobby-bracket-up"] = () => {
    const next = L.BRACKETS.find((x) => x.n > lobby.bracket);
    if (!next) { C.notice("Bracket 5 is the top of the ladder."); return; }
    lobby.bracket = next.n; lobby.cap = ""; redraw();
    C.notice(`This table is bracket ${next.n}, ${next.name}, now. Every seat is judged again.`);
  };
  actions["lobby-remove"] = (el) => { lobby.seats = lobby.seats.filter((x) => x.id !== el.dataset.seat); redraw(); };
  actions["lobby-reseat"] = () => { lobby.seed = Math.random().toString(36).slice(2, 8); redraw(); };
  actions["lobby-clear"] = () => { lobby = {...EMPTY}; redraw(); };
  actions["lobby-start"] = () => {
    const t = table();
    if (!t.ready) { C.notice(t.why, true); return; }
    C.notice(`${t.seats.length} seats, bracket ${t.bracket.n}, ${(t.seats.find((x) => x.id === t.seating.first) || {}).name} on the play. The board is the next thing to build — this lobby is G0.`);
  };

  C.HELP = C.HELP || {};
  C.HELP.game = `<h3>What the lobby does</h3><ul>
    <li><strong>One bracket, every seat.</strong> The bracket sets how many Game Changers a deck may carry — none at 1 and 2, three at 3, no limit at 4 and 5 — and the lobby counts them on every list, including imported ones.</li>
    <li><strong>What it checks.</strong> A hundred cards, a commander, nothing outside the commander's colour identity, one of each non-basic, and the Game Changer cap. Every failure names the cards.</li>
    <li><strong>What it does not check.</strong> Mass land denial, chained extra turns and two-card infinite combos are judgements about how a deck plays rather than counts. The bracket's own words say what it expects; keeping to them is yours.</li>
    <li><strong>Trim</strong> cuts the excess Game Changers and puts basics in their place, so the hundred still stands. It changes the seat, never the deck in your library.</li>
    <li><strong>The read</strong> compares your measured score to the rest of the pod, not to the pod including you — a table of one strong deck and three weak ones should not read as nearly fair.</li>
    <li><strong>The seating</strong> is a seeded shuffle. Write the seed down and the same table deals again.</li>
  </ul>`;
});
