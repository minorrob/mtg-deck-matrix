/* Build a deck from nothing: the screen, and the four steps behind it.
 *
 * The sibling of import-panel.js, and deliberately the same shape, because from
 * where the reader sits these are one feature with two front doors: "I have a
 * deck" and "I don't yet". Both end at the same record, in My Decks, scored on
 * the same simulation.
 *
 *   1  describe   a commander, a theme, a budget, and anything you already own
 *                 and want in it
 *   2  generate   deck-generator.js queries Scryfall by role, fills quotas, and
 *                 builds a three-rung ladder per lens. This is the slow step:
 *                 twenty-odd network calls, several seconds
 *   3  choose     which lens, which rung. The price of each is shown, and so is
 *                 how many cards it changes from the rung below
 *   4  preview    one seed, 2,000 games, labelled approximate -- and then the
 *                 full protocol on a button, exactly as an import gets
 *
 * WHAT THIS IS NOT. The generator ranks cards by EDHREC popularity, by how well
 * their text matches the theme you named, and by price. It has never played a
 * game. It will build you a legal, on-theme, on-budget hundred; it will not
 * find the two cards that combo, and it does not know that your pod always has
 * a Blood Moon. The score under the deck comes from the simulator afterwards,
 * on the same terms as every other deck here, and that is the number to argue
 * with -- not the fact that a computer chose the cards.
 *
 * WHY THE BUDGET IS A REAL CONSTRAINT AND NOT A FILTER. Base is built to come in
 * under the number you give. Tuned spends what Base left of it. Only the third
 * rung ignores price. So the budget shapes two of the three builds rather than
 * merely hiding expensive cards, which is what makes the ladder worth having:
 * it is the same deck at three prices, not three different decks.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (root) root.MtgBuildPanel = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const SEED_PLACEHOLDER = [
    "Doubling Season",
    "Hardened Scales",
    "https://www.tcgplayer.com/product/…",
    "",
    "One per line. Anything here is built around rather than competed with."
  ].join("\n");

  /* The themes and play styles are the generator's own vocabulary, read off its
     tables rather than typed here. A free-text box was the first thing this
     panel had, and it was wrong twice over: it silently dropped anything the
     generator did not recognize, and it gave no way to find out what it did. */
  const themeKeys = (Generator) => Object.keys((Generator && Generator.THEME_QUERIES) || {});
  const playstyleKeys = (Generator) => Object.keys((Generator && Generator.PLAYSTYLE_BIAS) || {});

  function createPanel(options) {
    const opts = options || {};
    const doc = opts.document || document;
    const Generator = opts.Generator || root0().MtgDeckGenerator;
    const Build = opts.Build || root0().MtgDeckBuild;
    const Store = opts.Store || root0().MtgDeckStore;
    const Measure = opts.Measure || root0().MtgDeckMeasure;
    const Scryfall = opts.Scryfall || root0().MtgScryfall;

    let result = null;      // what the generator returned
    let pick = 0;           // which lens
    let rungKey = "tuned";  // which rung of that lens's ladder
    let record = null;      // the record, once a rung is chosen
    let busy = false;
    let cancelled = false;

    const host = doc.createElement("div");
    host.className = "imp-wrap";
    host.id = "build-panel";
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.setAttribute("aria-label", "Build a deck");

    const close = () => {
      cancelled = true;
      host.remove();
      doc.body.style.overflow = "";
      if (opts.onClose) opts.onClose();
    };

    function shell(bodyHtml) {
      host.innerHTML = `
        <div class="imp-body">
          <button class="sheet-x" type="button" aria-label="Close" data-b-close>×</button>
          ${bodyHtml}
        </div>`;
      host.querySelector("[data-b-close]").addEventListener("click", close);
    }

    function say(message, tone) {
      const line = host.querySelector("[data-b-status]");
      if (line) {
        line.textContent = message;
        line.className = "imp-status" + (tone ? " is-" + tone : "");
      }
    }

    /* ---------------- step 1: describe it ---------------- */

    /* What was typed last time this screen was shown. Generation makes twenty-odd
       network calls and any of them can fail; losing four fields to a dropped
       connection would make the retry cost more than the first attempt did. */
    let typed = {commander: "", themes: [], style: "", budget: "150", count: "2", seeds: ""};

    function remember() {
      const val = (sel) => { const el = host.querySelector(sel); return el ? el.value : ""; };
      if (!host.querySelector("[data-b-cmd]")) return;
      typed = {
        commander: val("[data-b-cmd]"),
        themes: [...host.querySelectorAll("[data-b-theme]:checked")].map((box) => box.value),
        style: val("[data-b-style]"),
        budget: val("[data-b-budget]"),
        count: val("[data-b-count]"),
        seeds: val("[data-b-seeds]")
      };
    }

    function renderEntry(note) {
      shell(`
        <h2 class="imp-h">Build a deck</h2>
        <p class="imp-lede">Name a commander and what you want the deck to do. It is built
          from live Scryfall data into a legal Bracket 3 hundred, at three prices, and
          scored on the same simulation the rest of these decks are.</p>
        ${note ? `<p class="imp-note">${esc(note)}</p>` : ""}
        <label class="imp-field">
          <span>Commander <em>name or TCGplayer link</em></span>
          <input type="text" data-b-cmd placeholder="Krenko, Mob Boss" value="${esc(typed.commander)}">
        </label>
        <fieldset class="imp-field bp-themes">
          <span>What should it do? <em>pick any</em></span>
          <div class="bp-chips">
            ${themeKeys(Generator).map((theme) => `
              <label class="bp-chip${typed.themes.indexOf(theme) >= 0 ? " is-on" : ""}">
                <input type="checkbox" data-b-theme value="${esc(theme)}"
                  ${typed.themes.indexOf(theme) >= 0 ? "checked" : ""}>
                <span>${esc(theme)}</span>
              </label>`).join("")}
          </div>
        </fieldset>
        <label class="imp-field">
          <span>How do you like to play? <em>shifts the mix of roles</em></span>
          <select data-b-style>
            <option value="">No preference</option>
            ${playstyleKeys(Generator).map((style) =>
              `<option value="${esc(style)}"${typed.style === style ? " selected" : ""}>${esc(style)}</option>`).join("")}
          </select>
        </label>
        <div class="bp-row">
          <label class="imp-field">
            <span>Budget <em>US dollars, aimed at not capped</em></span>
            <input type="number" data-b-budget value="${esc(typed.budget || "150")}" min="25" step="25">
          </label>
          <label class="imp-field">
            <span>How many to build</span>
            <select data-b-count>
              ${[["1", "One"], ["2", "Two, to compare"], ["3", "Three"]].map(([v, label]) =>
                `<option value="${v}"${(typed.count || "2") === v ? " selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        </div>
        <details class="imp-unmatched"${typed.seeds ? " open" : ""}>
          <summary>Cards it must include</summary>
          <label class="imp-field">
            <span>One per line</span>
            <textarea data-b-seeds rows="5" spellcheck="false"
              placeholder="${esc(SEED_PLACEHOLDER)}">${esc(typed.seeds)}</textarea>
          </label>
        </details>
        <p class="imp-status" data-b-status></p>
        <div class="imp-actions">
          <button class="btn ghost" type="button" data-b-cancel>Cancel</button>
          <button class="btn primary" type="button" data-b-go>Build it</button>
        </div>
        <p class="imp-caveat">Cards are chosen by how popular they are on EDHREC, how
          well their text matches the theme you named, and what they cost. The generator
          has never played a game — it will build a legal, on-theme hundred, and it will
          not spot the two cards that combo. The score comes afterwards. The budget steers
          which cards get picked rather than capping the total: a deck can land over it
          when the cheap options in your colors run out, and each build shows what it
          actually costs before you save it.</p>`);
      host.querySelector("[data-b-cancel]").addEventListener("click", close);
      host.querySelector("[data-b-go]").addEventListener("click", generate);
      host.querySelectorAll("[data-b-theme]").forEach((box) => {
        box.addEventListener("change", () => box.closest(".bp-chip").classList.toggle("is-on", box.checked));
      });
      setTimeout(() => { const c = host.querySelector("[data-b-cmd]"); if (c) c.focus(); }, 0);
    }

    /* ---------------- step 2: generate ---------------- */

    /* One box for the commander, two fields behind it: the generator resolves a
       TCGplayer link through its product id and a typed name through Scryfall's
       named endpoint, and asking the reader which of those they have would be
       asking them to do the routing. */
    function inputsFromForm() {
      const lines = (host.querySelector("[data-b-seeds]").value || "")
        .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const commander = (host.querySelector("[data-b-cmd]").value || "").trim();
      const isLink = /^https?:\/\//i.test(commander);
      return {
        slotId: 101,
        commanderName: isLink ? "" : commander,
        commanderLink: isLink ? commander : "",
        themes: [...host.querySelectorAll("[data-b-theme]:checked")].map((box) => box.value),
        playstyle: (host.querySelector("[data-b-style]").value || ""),
        budgetUsd: Math.max(25, Number(host.querySelector("[data-b-budget]").value) || 150),
        variantCount: Number(host.querySelector("[data-b-count]").value) || 2,
        seedLinks: lines.filter((line) => /^https?:\/\//i.test(line)),
        seedNames: lines.filter((line) => !/^https?:\/\//i.test(line)),
        createdAt: new Date().toISOString()
      };
    }

    /* What to call the deck being built while it is still being built. */
    const askedFor = (inputs) => inputs.commanderName || inputs.commanderLink || "your deck";

    async function generate() {
      if (busy) return;
      remember();
      const inputs = inputsFromForm();
      if (!inputs.commanderName && !inputs.commanderLink) {
        return say("Name a commander to build around.", "warn");
      }
      if (!Generator || !Scryfall) return say("The deck builder did not load.", "warn");

      busy = true;
      cancelled = false;
      renderWorking(inputs);
      const client = Scryfall.createClient();
      try {
        result = await Generator.generateForSlot(inputs, {
          client,
          onProgress: (step) => { if (!cancelled) progress(step); }
        });
      } catch (err) {
        busy = false;
        if (cancelled) return;
        // Almost always the network: generation is twenty-odd calls to Scryfall
        // and one refusal ends the run. Say which rather than printing the
        // browser's word for it, and leave everything typed where it was.
        const why = String((err && err.message) || err);
        return renderEntry(/fetch|network|Failed/i.test(why)
          ? "Scryfall could not be reached, so nothing was built. Everything you typed is " +
            "still here — try again when you are back online."
          : `Building stopped: ${why}`);
      }
      busy = false;
      if (cancelled) return;
      if (!result.commander) {
        return renderEntry(result.error ||
          `No commander matched "${askedFor(inputs)}". Try the full name as it is printed.`);
      }
      if (!result.builds.length) {
        return renderEntry(result.error ||
          "Not enough legal cards matched that. Widen the theme, or raise the budget.");
      }
      pick = 0;
      rungKey = Build.defaultRung(result.builds[0]);
      renderChoose();
    }

    /* The wait is real -- twenty-odd Scryfall calls -- so it is narrated rather
       than spinner'd. Which role it is fetching is genuinely interesting, and a
       progress bar that cannot say how long it has left is not. */
    function renderWorking(inputs) {
      shell(`
        <h2 class="imp-h">Building ${esc(askedFor(inputs))}</h2>
        <p class="imp-lede">Querying Scryfall by role, then filling out the deck. This takes
          a few seconds — most of it is waiting politely between requests.</p>
        <ul class="bp-steps" data-b-steps></ul>
        <p class="imp-status" data-b-status>Starting…</p>
        <div class="imp-actions">
          <button class="btn ghost" type="button" data-b-cancel2>Stop</button>
        </div>`);
      host.querySelector("[data-b-cancel2]").addEventListener("click", close);
    }

    const seen = new Set();
    function progress(step) {
      say(step.message || "");
      const list = host.querySelector("[data-b-steps]");
      if (!list) return;
      // One line per phase, not one per callback: the pool fetch reports once per
      // role and would otherwise scroll the useful lines off the top.
      const tag = step.phase === "build" ? `build-${step.index}` : step.phase;
      if (seen.has(tag)) {
        const last = list.lastElementChild;
        if (last) last.textContent = step.message || last.textContent;
        return;
      }
      seen.add(tag);
      const li = doc.createElement("li");
      li.textContent = step.message || step.phase;
      list.appendChild(li);
    }

    /* ---------------- step 3: choose a build and a rung ---------------- */

    function renderChoose() {
      const built = result.builds[pick];
      const rungs = Build.offeredRungs(built);
      if (!rungs.some((r) => r.key === rungKey)) rungKey = rungs[rungs.length - 1].key;
      const trouble = Build.problems(built, rungKey);
      const resolved = Build.toResolved(built, rungKey, {label: nameFor(built)});
      record = resolved ? Store.toRecord(resolved, {id: Store.nextId(opts.existing()), label: resolved.name}) : null;

      shell(`
        <h2 class="imp-h">${esc(result.commander.name)}</h2>
        <p class="imp-lede">${result.builds.length} build${result.builds.length === 1 ? "" : "s"} ·
          ${esc(result.pool ? `${result.pool.spells.length} cards considered` : "built from Scryfall")}</p>

        ${result.builds.length > 1 ? `<div class="bp-picks" role="group" aria-label="Which build">
          ${result.builds.map((b, i) => `
            <button class="bp-pick${i === pick ? " is-on" : ""}" type="button" data-b-pick="${i}"
              aria-pressed="${i === pick}">
              <b>${esc(b.variant.lensLabel)}</b>
              <span>${esc(lensBlurb(b))}</span>
            </button>`).join("")}
        </div>` : ""}

        <div class="bp-rungs" role="group" aria-label="Which price">
          ${rungs.map((rung) => `
            <button class="bp-rung${rung.key === rungKey ? " is-on" : ""}" type="button"
              data-b-rung="${rung.key}" aria-pressed="${rung.key === rungKey}">
              <b>${esc(rung.label)}</b>
              <span>${esc(Build.describe(built, rung.key))}</span>
            </button>`).join("")}
        </div>
        <label class="imp-field">
          <span>Call it</span>
          <input type="text" data-b-name value="${esc(record ? record.label : nameFor(built))}" maxlength="60">
        </label>

        ${trouble.length ? `<ul class="imp-problems">${
          trouble.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${(result.warnings || []).length ? `<details class="imp-unmatched">
          <summary>${result.warnings.length} note${result.warnings.length === 1 ? "" : "s"} from the build</summary>
          <p>${esc(result.warnings.join(" · "))}</p>
        </details>` : ""}

        <details class="imp-unmatched"${trouble.length ? "" : ""}>
          <summary>The hundred</summary>
          <p class="bp-list">${esc(listOf(built, rungKey))}</p>
        </details>

        <div class="imp-score" data-b-score>${
          record && Store.measurable(record)
            ? `<p class="imp-status" data-b-status>Scoring a quick preview…</p>`
            : `<p class="imp-status is-warn" data-b-status>Not scored: the simulation is defined
                 on a hundred cards with a commander.</p>`
        }</div>
        <div class="imp-actions">
          <button class="btn ghost" type="button" data-b-back>Start over</button>
          <button class="btn primary" type="button" data-b-save${record ? "" : " disabled"}>Save this deck</button>
        </div>`);

      host.querySelectorAll("[data-b-pick]").forEach((button) => {
        button.addEventListener("click", () => {
          pick = Number(button.dataset.bPick) || 0;
          rungKey = Build.defaultRung(result.builds[pick]);
          renderChoose();
        });
      });
      host.querySelectorAll("[data-b-rung]").forEach((button) => {
        button.addEventListener("click", () => { rungKey = button.dataset.bRung; renderChoose(); });
      });
      host.querySelector("[data-b-back]").addEventListener("click", () => { result = null; renderEntry(); });
      host.querySelector("[data-b-save]").addEventListener("click", save);
      host.querySelector("[data-b-name]").addEventListener("input", (event) => {
        if (record) record.label = event.target.value.trim() || result.commander.name;
      });
      if (record && Store.measurable(record)) setTimeout(preview, 30);
    }

    /* The generator's own variant name reads like a catalog entry ("Counters
       Synergy — Atraxa"). On My Decks, beside six decks with names somebody
       chose, the commander and the lens is the more useful label. */
    function nameFor(built) {
      const lens = built.variant.lensLabel || "";
      const commander = (result.commander.name || "").split(",")[0];
      return lens ? `${commander} · ${lens}` : commander;
    }

    const lensBlurb = (built) => {
      const lens = (Generator.LENSES || []).filter((l) => l.key === built.variant.lens)[0];
      return lens ? lens.blurb : "";
    };

    function listOf(built, key) {
      const rung = Build.rungAt(key);
      return (built.stages[rung.index] || [])
        .map((entry) => `${entry.quantity > 1 ? entry.quantity + " " : ""}${entry.card.name}`)
        .join(" · ");
    }

    /* ---------------- step 4: score it ---------------- */

    async function preview() {
      const context = await opts.measureContext();
      if (!context) return say("The simulation could not be loaded.", "warn");
      const cards = Measure.hydrate(Store.toLineup(record), null);
      renderScore(Measure.measure(cards, {
        config: context.config, seats: context.seats, preview: true
      }), false);
    }

    function renderScore(scored, isFull) {
      const box = host.querySelector("[data-b-score]");
      if (!box) return;
      box.innerHTML = `
        <div class="imp-result${isFull ? " is-full" : ""}">
          <div class="imp-num num">${scored.score.toFixed(isFull ? 2 : 1)}</div>
          <div class="imp-num-side">
            <b>${isFull ? "Measured" : "Preview"}</b>
            <span>${isFull
              ? `six seeds · ${scored.protocol.gamesPerSeed.toLocaleString()} games each · ±${scored.se}`
              : `one seed · ${scored.protocol.gamesPerSeed.toLocaleString()} games · approximate`}</span>
          </div>
          ${isFull ? "" : `<button class="btn" type="button" data-b-full>Measure it properly</button>`}
        </div>
        <p class="imp-caveat">Wins ${(scored.winRate * 100).toFixed(1)}% ·
          commander down turn ${scored.avgCommanderTurn} ·
          flooded ${(scored.floodPct * 100).toFixed(0)}% of games.
          The simulation plays creatures, mana and combat; it cannot see a storm count
          or a one-card combo, so a deck that wins that way scores low here for a reason
          that is about the model, not the deck.</p>`;
      const full = box.querySelector("[data-b-full]");
      if (full) full.addEventListener("click", () => runFull(full));
    }

    async function runFull(button) {
      if (busy) return;
      busy = true;
      button.disabled = true;
      button.textContent = "Measuring… seed 1 of 6";
      const context = await opts.measureContext();
      const cards = Measure.hydrate(Store.toLineup(record), null);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const scored = Measure.measure(cards, {
        config: context.config,
        seats: context.seats,
        onSeed: (done, total) => { button.textContent = `Measuring… seed ${done} of ${total}`; }
      });
      record.measured = scored;
      renderScore(scored, true);
      busy = false;
    }

    function save() {
      if (!record) return;
      record.label = (host.querySelector("[data-b-name]").value || "").trim()
        || result.commander.name;
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
      if (event.key === "Escape" && doc.getElementById("build-panel")) {
        doc.removeEventListener("keydown", onKey);
        close();
      }
    }

    return {open, close, host, renderEntry, get record() { return record; }};
  }

  function root0() { return typeof globalThis !== "undefined" ? globalThis : this; }

  return {createPanel, SEED_PLACEHOLDER, esc};
});
