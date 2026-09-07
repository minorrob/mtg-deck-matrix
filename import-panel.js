/* Add a deck: the screen, and the four steps behind it.
 *
 * The modules this drives were each built and tested on their own -- parse
 * (deck-import), load by URL (deck-sources), record and merge (deck-store),
 * score (deck-measure). This is the only place they meet, and it is deliberately
 * the only place that knows the order:
 *
 *   1  read     a paste is parsed; a link is fetched and arrives resolved
 *   2  resolve  names are matched against the app's own cards, then against
 *               Scryfall for everything left -- which is most of a deck the app
 *               has never seen, and is the step that needs the network
 *   3  preview  one seed, 2,000 games, about a twentieth of a second, shown as
 *               approximate because that is what it is
 *   4  measure  the published protocol, six seeds and 20,000 games each, ~3.5s,
 *               and the only run whose number is recorded
 *
 * WHY THE PREVIEW EXISTS. Step 4 is three and a half seconds of blocked main
 * thread. Step 3 is instant and lands within a point or so, which is enough to
 * answer "did that import work" while being clearly labelled as not the number.
 * The full run is a button, not a wait.
 *
 * WHAT IT REFUSES TO DO. It will not measure a deck that is not a hundred cards
 * with a commander, and it will not quietly drop the names it could not match to
 * get there. A partial import is saved and shown as partial; the score is what
 * is withheld, because a score computed on 96 cards is not comparable with the
 * six that are.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (root) root.MtgImportPanel = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const PLACEHOLDER = [
    "1 Krenko, Mob Boss",
    "1 Sol Ring",
    "4 Mountain",
    "…",
    "",
    "Paste the whole export, blank line and all — the blank line is how a",
    "Moxfield list says which card is the commander."
  ].join("\n");

  /* State for one open panel. Held in a closure rather than on the module so a
     second panel cannot inherit the first one's half-read deck. */
  function createPanel(options) {
    const opts = options || {};
    const doc = opts.document || document;
    const Import = opts.Import || root0().MtgDeckImport;
    const Sources = opts.Sources || root0().MtgDeckSources;
    const Store = opts.Store || root0().MtgDeckStore;
    // Only for the search links on the fix-the-names step; the lookup itself is a callback
    // the page supplies, because it needs a Scryfall client and a card list this has no
    // business knowing about.
    const Resolve = opts.Resolve || root0().MtgCardResolve || {
      scryfallSearchUrl: (n) => "https://scryfall.com/search?q=" + encodeURIComponent(n),
      storeSearchUrl: (n) => "https://www.tcgplayer.com/search/magic/product?q=" + encodeURIComponent(n)
    };
    const Measure = opts.Measure || root0().MtgDeckMeasure;

    let deck = null;         // the resolved import, before it becomes a record
    let record = null;       // the record, once named
    let busy = false;

    const host = doc.createElement("div");
    host.className = "imp-wrap";
    host.id = "import-panel";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.setAttribute("aria-label", "Add a deck");

    const close = () => {
      host.remove();
      doc.body.style.overflow = "";
      if (opts.onClose) opts.onClose();
    };

    function shell(bodyHtml) {
      host.innerHTML = `
        <div class="imp-body">
          <button class="sheet-x" type="button" aria-label="Close" data-imp-close>×</button>
          ${bodyHtml}
        </div>`;
      host.querySelector("[data-imp-close]").addEventListener("click", close);
    }

    function say(message, tone) {
      const line = host.querySelector("[data-imp-status]");
      if (line) {
        line.textContent = message;
        line.className = "imp-status" + (tone ? " is-" + tone : "");
      }
    }

    /* ---------------- step 1: the entry screen ---------------- */

    function renderEntry(note) {
      shell(`
        <h2 class="imp-h">Add a deck</h2>
        <p class="imp-lede">Paste a decklist from anywhere, or give an Archidekt link.
          It is scored on the same simulation the six decks are, so the number means
          the same thing.</p>
        ${note ? `<p class="imp-note">${esc(note)}</p>` : ""}
        <label class="imp-field">
          <span>Deck link <em>Archidekt only</em></span>
          <input type="url" data-imp-url placeholder="https://archidekt.com/decks/123456/my-deck">
        </label>
        <p class="imp-or">or</p>
        <label class="imp-field">
          <span>Paste the list</span>
          <textarea data-imp-text rows="9" spellcheck="false"
            placeholder="${esc(PLACEHOLDER)}"></textarea>
        </label>
        <p class="imp-status" data-imp-status></p>
        <div class="imp-actions">
          <button class="btn ghost" type="button" data-imp-close2>Cancel</button>
          <button class="btn primary" type="button" data-imp-read>Read the list</button>
        </div>`);
      host.querySelector("[data-imp-close2]").addEventListener("click", close);
      host.querySelector("[data-imp-read]").addEventListener("click", read);
      const url = host.querySelector("[data-imp-url]");
      // A Moxfield link is the likeliest thing to be typed into a URL box, and
      // the moment to say it will not work is while it is being typed.
      url.addEventListener("input", () => {
        const site = Sources.identify(url.value);
        if (site && !site.fetchable) say(site.advice, "warn");
        else if (site) say(`${site.label} deck ${site.id}. Press Read the list.`, "ok");
        else say("");
      });
      setTimeout(() => { const t = host.querySelector("[data-imp-text]"); if (t) t.focus(); }, 0);
    }

    /* ---------------- step 2: read and resolve ---------------- */

    async function read() {
      if (busy) return;
      const url = (host.querySelector("[data-imp-url]").value || "").trim();
      const text = host.querySelector("[data-imp-text]").value || "";
      if (!url && !text.trim()) return say("Paste a list, or give a link.", "warn");

      busy = true;
      say("Reading…");
      try {
        deck = url ? await fromUrl(url) : await fromPaste(text);
        if (!deck) return;
        // A name that did not match is a question, not a verdict. Ask it.
        if (deck.unresolved && deck.unresolved.length && opts.resolveNames) await renderFixNames();
        else renderReview();
      } finally {
        busy = false;
      }
    }

    /* ---------------- step 2b: the names that did not match ----------------
     *
     * This step did not exist, and its absence was the whole bug: a list with one bad
     * name reached the review screen saying "1 card name could not be matched", offered a
     * Save button, and saved a 99-card deck the simulator then refused to score. Every
     * road out of that screen was worse than the one in.
     *
     * A name fails for three reasons and they need different answers. A typo -- "Sol Rng"
     * -- has one obvious right answer. An invented name -- "Splinter, Vengeful Sensei" --
     * has several plausible ones and the reader has to choose. And a name that is really
     * not a card has none, in which case the honest thing is to say so and let it go.
     * card-resolve.js finds the candidates; this shows them and takes the answer.
     */
    let fixes = {};        // asked name -> chosen card, or null for "leave it out"
    let lookups = [];      // one resolveName result per unmatched name
    let linkText = {};     // asked name -> what is typed in that row's link box
    let linkState = {};    // asked name -> {busy, tone, message} for that row's link box
    let focusLink = "";    // the row whose link box should hold focus after a redraw

    /* THE CARDS THE LIST ALREADY HAS are never offered as a match for a name it does not.
       Commander is singleton: a candidate the deck already holds is not the card somebody
       meant, it is a second copy of a card they already have, and picking it builds an
       illegal hundred. Basics are the exception the format itself makes -- a list may hold
       any number of them -- so they stay available. */
    function alreadyInDeck() {
      return (deck && deck.cards || [])
        .filter((entry) => !(entry.card && (entry.card.isBasicLand || /\bBasic Land\b/.test(entry.card.typeLine || ""))))
        .map((entry) => entry.name)
        .filter(Boolean);
    }

    /* A card chosen for ONE unmatched name cannot also be the answer to another. Two typos
       of the same card in one list is a real paste; silently letting both through is a
       duplicate nobody asked for. */
    function chosenElsewhere(asked) {
      const taken = {};
      Object.keys(fixes).forEach((name) => {
        if (name === asked || !fixes[name] || !fixes[name].name) return;
        taken[String(fixes[name].name).toLowerCase()] = name;
      });
      return taken;
    }

    async function renderFixNames() {
      const names = deck.unresolved.slice();
      shell(`
        <h2 class="imp-h">${names.length} name${names.length === 1 ? "" : "s"} did not match a card</h2>
        <p class="imp-lede">Looking each one up…</p>
        <div class="imp-fix" data-imp-fix></div>
        <p class="imp-status" data-imp-status></p>`);
      const list = host.querySelector("[data-imp-fix]");
      fixes = {};
      lookups = [];
      linkText = {};
      linkState = {};
      try {
        lookups = await opts.resolveNames(names, {
          exclude: alreadyInDeck(),
          onEach: (result, index) => {
            say(`Looked up ${index + 1} of ${names.length}…`);
            list.innerHTML = renderFixRows(lookups.concat([result]));
          }
        });
      } catch (err) {
        say("The lookup could not be reached, so these have to be left out or fixed by hand.", "warn");
        lookups = names.map((name) => ({name, candidates: [], searched: [], errors: [String(err && err.message || err)]}));
      }
      /* A near-certain answer is pre-chosen: "Sol Rng" has one right answer and making
         somebody click it is ceremony. Two ways to be near-certain -- the only candidate
         and a decent likeness, or a strong candidate clearly ahead of the next one. Five
         plausible Splinters are neither, and are left unticked for the reader. */
      lookups.forEach((result) => {
        const best = result.candidates[0];
        const next = result.candidates[1];
        if (!best) return;
        const alone = !next && best.likeness >= 0.6;
        const ahead = best.likeness >= 0.8 && (!next || next.likeness < best.likeness - 0.1);
        if (alone || ahead) fixes[result.name] = best.card;
      });
      drawFix();
    }

    function renderFixRows(results) {
      return results.map((result) => {
        const chosen = fixes[result.name];
        const chosenKey = chosen ? String(chosen.name).toLowerCase() : "";
        const taken = chosenElsewhere(result.name);
        /* A card that arrived by link is not among the five guesses, so it is drawn as its
           own option -- already picked, and saying where it came from. */
        const fromLink = chosen && chosen.viaLink
          ? `<button type="button" class="imp-fix-opt is-on is-link"
                data-fix-for="${esc(result.name)}" data-fix-unlink aria-pressed="true">
              <b>${esc(chosen.name)}</b>
              <span>${esc(chosen.manual
                ? "From your link · Scryfall does not have this card yet"
                : "From your link · " + (chosen.viaLink || "matched on Scryfall"))}</span>
            </button>`
          : "";
        const state = linkState[result.name] || {};
        return `<div class="imp-fix-row">
          <div class="imp-fix-asked">
            <b>${esc(result.name)}</b>
            <span>${result.candidates.length
              ? `${result.candidates.length} possible match${result.candidates.length === 1 ? "" : "es"}`
              : "no match found"}</span>
          </div>
          <div class="imp-fix-options">
            ${fromLink}
            ${result.candidates.map((entry) => {
              const key = String(entry.name).toLowerCase();
              const usedFor = taken[key];
              return `<button type="button" class="imp-fix-opt${key === chosenKey ? " is-on" : ""}${usedFor ? " is-taken" : ""}"
                data-fix-for="${esc(result.name)}" data-fix-pick="${esc(entry.name)}"
                ${usedFor ? "disabled" : ""}
                aria-pressed="${key === chosenKey ? "true" : "false"}">
                <b>${esc(entry.name)}</b>
                <span>${usedFor
                  ? "Already used for " + esc(usedFor)
                  : esc(entry.why) + (entry.card && (entry.card.typeLine || entry.card.type)
                    ? " · " + esc(entry.card.typeLine || entry.card.type) : "")}</span>
              </button>`;
            }).join("")}
            <button type="button" class="imp-fix-opt is-drop${chosen === null ? " is-on" : ""}"
              data-fix-for="${esc(result.name)}" data-fix-drop
              aria-pressed="${chosen === null ? "true" : "false"}">
              <b>Leave it out</b><span>The deck is one card shorter</span>
            </button>
          </div>
          ${opts.resolveLink ? `
          <div class="imp-fix-link">
            <label>
              <span>Know the card? Paste a link to it</span>
              <input type="url" spellcheck="false" data-fix-link="${esc(result.name)}"
                value="${esc(linkText[result.name] || "")}"
                placeholder="https://scryfall.com/card/… · tcgplayer.com/product/…"
                ${state.busy ? "disabled" : ""}>
            </label>
            <button class="btn ghost" type="button" data-fix-linkgo="${esc(result.name)}"
              ${state.busy ? "disabled" : ""}>${state.busy ? "Reading…" : "Use link"}</button>
          </div>
          ${state.message ? `<p class="imp-fix-linknote${state.tone ? " is-" + state.tone : ""}">${esc(state.message)}</p>` : ""}
          ` : ""}
          <p class="imp-fix-links">Not sure? Look it up on
            <a href="${esc(Resolve.scryfallSearchUrl(result.name))}" target="_blank" rel="noopener noreferrer">Scryfall</a> or
            <a href="${esc(Resolve.storeSearchUrl(result.name))}" target="_blank" rel="noopener noreferrer">TCGplayer</a>,
            then paste the link back here.</p>
        </div>`;
      }).join("");
    }

    /* One row's link box. The ladder is in card-link.js; this is what the reader sees of it.
       A link that resolves to a real card picks that card. A link that resolves to nothing
       still answers -- it becomes a manual card, which is a real entry in the deck that says
       out loud what it is missing. Either way the row is decided and the reader moves on. */
    async function useLink(asked) {
      const raw = (linkText[asked] || "").trim();
      if (!raw) {
        linkState[asked] = {tone: "warn", message: "Paste the address of the card's page first."};
        return drawFix();
      }
      linkState[asked] = {busy: true, message: "Reading that link…"};
      drawFix();
      let answer;
      try {
        answer = await opts.resolveLink(raw, {name: asked});
      } catch (error) {
        answer = {error: String(error && error.message || error)};
      }
      if (!answer || (!answer.card && !answer.manual)) {
        linkState[asked] = {tone: "warn",
          message: (answer && answer.error) || "That link did not lead to a card."};
        focusLink = asked;
        return drawFix();
      }
      const card = answer.card || answer.manual;
      const taken = chosenElsewhere(asked);
      if (taken[String(card.name).toLowerCase()]) {
        linkState[asked] = {tone: "warn",
          message: `${card.name} is already the answer to ${taken[String(card.name).toLowerCase()]}.`};
        focusLink = asked;
        return drawFix();
      }
      fixes[asked] = Object.assign({}, card, {viaLink: answer.via || "matched on Scryfall"});
      linkState[asked] = {tone: "ok", message: answer.card
        ? `${card.name}, from ${answer.link && answer.link.site ? answer.link.site : "that link"}.`
        : `Added as ${card.name}. Scryfall does not have this card yet, so it goes in without its rules text and the app will ask again later.`};
      drawFix();
    }

    function drawFix() {
      const undecided = lookups.filter((result) => fixes[result.name] === undefined).length;
      const list = host.querySelector("[data-imp-fix]");
      if (list) list.innerHTML = renderFixRows(lookups);
      const lede = host.querySelector(".imp-lede");
      if (lede) {
        lede.textContent = undecided
          ? `Pick the card each one meant, or leave it out. ${undecided} still to decide.`
          : "All decided. Carry on when you are ready.";
      }
      const actions = host.querySelector(".imp-actions");
      const html = `
        <button class="btn ghost" type="button" data-imp-back>Back</button>
        <button class="btn primary" type="button" data-imp-fixdone ${undecided ? "disabled" : ""}>
          ${undecided ? `${undecided} still to decide` : "Use these"}</button>`;
      if (actions) actions.innerHTML = html;
      else host.querySelector(".imp-body").insertAdjacentHTML("beforeend", `<div class="imp-actions">${html}</div>`);
      host.querySelector("[data-imp-back]")?.addEventListener("click", () => renderEntry());
      host.querySelector("[data-imp-fixdone]")?.addEventListener("click", applyFixes);
      host.querySelectorAll("[data-fix-for]").forEach((button) => button.addEventListener("click", () => {
        const asked = button.dataset.fixFor;
        if (button.hasAttribute("data-fix-drop")) {
          fixes[asked] = fixes[asked] === null ? undefined : null;
        } else if (button.hasAttribute("data-fix-unlink")) {
          // Pressing the card a link found puts the row back to undecided, the same way
          // pressing an already-chosen candidate does.
          fixes[asked] = undefined;
          linkState[asked] = {};
        } else {
          const result = lookups.find((r) => r.name === asked);
          const entry = result && result.candidates.find((c) => c.name === button.dataset.fixPick);
          const already = fixes[asked] && fixes[asked].name === button.dataset.fixPick;
          fixes[asked] = already ? undefined : (entry ? entry.card : undefined);
        }
        drawFix();
      }));

      /* The link box holds its value in state rather than in the DOM, because every pick
         on this screen redraws the whole list and a half-typed address must survive it. */
      host.querySelectorAll("[data-fix-link]").forEach((input) => {
        input.addEventListener("input", () => { linkText[input.dataset.fixLink] = input.value; });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") { event.preventDefault(); useLink(input.dataset.fixLink); }
        });
      });
      host.querySelectorAll("[data-fix-linkgo]").forEach((button) => {
        button.addEventListener("click", () => useLink(button.dataset.fixLinkgo));
      });
      if (focusLink) {
        const input = host.querySelector(`[data-fix-link="${CSS && CSS.escape ? CSS.escape(focusLink) : focusLink}"]`);
        focusLink = "";
        if (input) { input.focus(); input.select(); }
      }
    }

    function applyFixes() {
      /* Back through the same door every other lookup uses: applyFallback keys by the
         name that was ASKED for, so a chosen card lands in the slot the bad name left --
         including its quantity and whether it was the commander. */
      const fetched = {};
      const dropped = [];
      Object.keys(fixes).forEach((asked) => {
        if (fixes[asked]) {
          // viaLink is a note for this screen only; it must not travel into the deck.
          const {viaLink, ...card} = fixes[asked];
          fetched[asked] = card;
          /* A card Scryfall could not place is remembered as a population, not as a
             one-off: manual-cards.js asks about all of them again on every load, and the
             day this one is indexed it stops being manual wherever it sits. */
          if (card.manual && opts.onManualCard) opts.onManualCard(card);
        } else if (fixes[asked] === null) dropped.push(asked);
      });
      deck = Import.applyFallback(deck, fetched);
      // Kept so the review can say "you left this out" rather than "this failed".
      deck = {...deck, dropped: (deck.dropped || []).concat(dropped)};
      renderReview();
    }

    async function fromUrl(url) {
      const result = await Sources.load(url, {fetchImpl: opts.fetchImpl});
      if (!result.deck) {
        say(result.advice ? `${result.error} ${result.advice}` : result.error, "warn");
        return null;
      }
      return result.deck;
    }

    /* A paste is matched twice. First against the app's own cards, which is free
       and offline and covers whatever overlaps the six decks. Then Scryfall, for
       everything left -- which for a stranger's deck is most of it, and is why
       an import needs the network even though a paste does not. */
    async function fromPaste(text) {
      const parsed = Import.parseDecklist(text);
      if (!parsed.rows.length) {
        say("Nothing in that looked like a decklist.", "warn");
        return null;
      }
      const local = await opts.localCards();
      const resolved = Import.resolveDeck(parsed, Import.buildIndex(local), {source: "paste"});
      if (!resolved.unresolved.length) return resolved;

      say(`Looking up ${resolved.unresolved.length} card` +
        `${resolved.unresolved.length === 1 ? "" : "s"} on Scryfall…`);
      let fetched = {};
      try {
        fetched = await opts.lookupCards(resolved.unresolved);
      } catch (err) {
        say("Scryfall could not be reached, so some cards are unmatched. " +
          "The deck can still be saved.", "warn");
      }
      return Import.applyFallback(resolved, fetched);
    }

    /* ---------------- step 3: review, name, preview ---------------- */

    function renderReview() {
      const name = deck.name && deck.name !== "Imported deck"
        ? deck.name
        : (deck.commander[0] || "Imported deck");
      record = Store.toRecord(deck, {id: Store.nextId(opts.existing()), label: name});
      const found = Store.problems(record);
      const counted = record.cards.length;

      shell(`
        <h2 class="imp-h">${esc(record.commander || "No commander named")}</h2>
        <p class="imp-lede">${record.total} cards · ${counted} distinct ·
          ${esc(sourceLabel(record))}</p>
        <label class="imp-field">
          <span>Call it</span>
          <input type="text" data-imp-name value="${esc(record.label)}" maxlength="60">
        </label>
        ${found.length ? `<ul class="imp-problems">${
          found.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${record.unresolved.length ? `<details class="imp-unmatched">
          <summary>${record.unresolved.length} name${record.unresolved.length === 1 ? "" : "s"} not in the deck</summary>
          <p>${esc(record.unresolved.join(" · "))}</p>
          ${opts.resolveNames ? `<button class="btn ghost" type="button" data-imp-refix>Look them up again</button>` : ""}
        </details>` : ""}
        <div class="imp-score" data-imp-score>${
          Store.measurable(record)
            ? `<p class="imp-status" data-imp-status>Scoring a quick preview…</p>`
            : `<p class="imp-status is-warn" data-imp-status>Not scored: the simulation is
                 defined on a hundred cards with a commander, and a score from anything
                 else could not be compared with the six.</p>`
        }</div>
        <div class="imp-actions">
          <button class="btn ghost" type="button" data-imp-back>Back</button>
          <button class="btn primary" type="button" data-imp-save>Save this deck</button>
        </div>`);
      host.querySelector("[data-imp-back]").addEventListener("click", () => renderEntry());
      host.querySelector("[data-imp-save]").addEventListener("click", save);
      // A second pass, for somebody who left one out and changed their mind.
      host.querySelector("[data-imp-refix]")?.addEventListener("click", () => renderFixNames());
      host.querySelector("[data-imp-name]").addEventListener("input", (e) => {
        record.label = e.target.value.trim() || record.commander || "Imported deck";
      });
      if (Store.measurable(record)) setTimeout(preview, 30);
    }

    const sourceLabel = (rec) => rec.source === "paste" ? "pasted list" : `from ${rec.source}`;

    async function preview() {
      const context = await opts.measureContext();
      if (!context) return say("The simulation could not be loaded.", "warn");
      const cards = Measure.hydrate(Store.toLineup(record), null);
      const quick = Measure.measure(cards, {
        config: context.config, seats: context.seats, preview: true
      });
      renderScore(quick, false);
    }

    /* The score, and what it is made of. It used to be one number, one line of three
       figures, and a paragraph of apology -- which is why the first question anybody asked
       on seeing it was "what does 51.33 mean?". measure-report.js answers that from the
       parts the engine has always computed. */
    function renderScore(result, isFull) {
      const box = host.querySelector("[data-imp-score]");
      if (!box) return;
      const Report = root0().MtgMeasureReport;
      box.innerHTML = (Report ? Report.html(result, {compact: true}) : "")
        + (isFull ? "" : `<div class="imp-actions imp-measure">
            <button class="btn primary" type="button" data-imp-full>Measure it properly</button>
          </div>`);
      const full = box.querySelector("[data-imp-full]");
      if (full) full.addEventListener("click", () => runFull(full));
    }

    async function runFull(button) {
      if (busy) return;
      busy = true;
      button.disabled = true;
      button.textContent = "Measuring… seed 1 of 6";
      const context = await opts.measureContext();
      const cards = Measure.hydrate(Store.toLineup(record), null);
      // Yield once so the button's new label paints before the engine takes the
      // thread for three and a half seconds.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const result = Measure.measure(cards, {
        config: context.config,
        seats: context.seats,
        onSeed: (done, total) => { button.textContent = `Measuring… seed ${done} of ${total}`; }
      });
      record.measured = result;
      renderScore(result, true);
      busy = false;
    }

    function save() {
      if (!record) return;
      record.label = (host.querySelector("[data-imp-name]").value || "").trim()
        || record.commander || "Imported deck";
      opts.onSaved(record);
      close();
    }

    function open() {
      doc.body.appendChild(host);
      doc.body.style.overflow = "hidden";
      renderEntry();
      doc.addEventListener("keydown", onKey);
    }

    function onKey(event) {
      if (event.key === "Escape" && doc.getElementById("import-panel")) {
        doc.removeEventListener("keydown", onKey);
        close();
      }
    }

    return {open, close, host, renderEntry, get record() { return record; }};
  }

  function root0() { return typeof globalThis !== "undefined" ? globalThis : this; }

  return {createPanel, PLACEHOLDER, esc};
});
