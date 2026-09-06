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
        if (deck) renderReview();
      } finally {
        busy = false;
      }
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
          <summary>${record.unresolved.length} name${record.unresolved.length === 1 ? "" : "s"} not matched</summary>
          <p>${esc(record.unresolved.join(" · "))}</p>
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

    function renderScore(result, isFull) {
      const box = host.querySelector("[data-imp-score]");
      if (!box) return;
      // The engine plays creatures, mana and combat. It cannot see a storm
      // count, so a spell-based deck scores low for a reason that is about the
      // engine and not about the deck -- and the reader is told so here rather
      // than left to conclude their deck is bad.
      box.innerHTML = `
        <div class="imp-result${isFull ? " is-full" : ""}">
          <div class="imp-num num">${result.score.toFixed(isFull ? 2 : 1)}</div>
          <div class="imp-num-side">
            <b>${isFull ? "Measured" : "Preview"}</b>
            <span>${isFull
              ? `six seeds · ${result.protocol.gamesPerSeed.toLocaleString()} games each · ±${result.se}`
              : `one seed · ${result.protocol.gamesPerSeed.toLocaleString()} games · approximate`}</span>
          </div>
          ${isFull ? "" : `<button class="btn" type="button" data-imp-full>Measure it properly</button>`}
        </div>
        <p class="imp-caveat">Wins ${(result.winRate * 100).toFixed(1)}% ·
          commander down turn ${result.avgCommanderTurn} ·
          flooded ${(result.floodPct * 100).toFixed(0)}% of games.
          The simulation plays creatures, mana and combat; it cannot see a storm
          count or a one-card combo, so a deck that wins that way scores low here
          for a reason that is about the model, not the deck.</p>`;
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
