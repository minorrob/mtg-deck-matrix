/* BUILD A DECK: Commander → Strategy → Budget → Review (R3.11; INTAKE row R3.11, the design's "New deck — Lab wizard").
 *
 * Rob, 2026-09-24: "Create and Lab should be the same thing." So this is the one way to start a deck from a commander:
 * the New deck wizard's Create, the Decks page's Start from a commander, and a name typed into the landing page's Step
 * one all open it. Its Review ends in either of the two things starting from a commander has ever meant:
 *
 *   Create draft                 the deck with just its commander, the 99 to come (what Create always did)
 *   Draft the 99 in the Lab      the Lab takes the commander, the strategies, the cap and what to include or avoid, and
 *                                drafts a preview (C.labStart); nothing is saved until Save this deck, as ever
 *
 * THE STRATEGY STEP IS DATA, NOT A LIST (the design's "Lab strategy"). Its chips are read off the commander:
 * CrankStrategies.optionsFor over data/commander-strategies.json (rules text, then how decks and guides name it; colors
 * only when neither has anything), each with a fit label, the top fit preselected, a skeleton while the file loads,
 * and a different commander recomputes them. The file is fetched when the step first opens, once.
 */
(globalThis.CrankFeatures ||= []).push(function (C) {
  const {M, esc: e, actions, modal, button: b, note} = C;
  const STEPS = ["Commander", "Strategy", "Budget", "Review"];
  let w = null;             // the wizard's answers: {commander, strategies: Set, touched, budget, restrictions, name}
  let strategyData = null;  // data/commander-strategies.json, once fetched

  const head = (n) => `<ol class="cm-build-steps" aria-label="Step ${n + 1} of ${STEPS.length}">${STEPS.map((t, i) => `<li${i === n ? ' aria-current="step"' : ""}${i < n ? ' class="is-done"' : ""}>${i + 1} · ${e(t)}</li>`).join("")}</ol>`;
  /* The cap a new deck takes: the reader's own default from Settings, or the house rule's. */
  const defaultCap = () => { const own = Number(C.state.preferences && C.state.preferences.defaultBudgetCap); const rule = globalThis.CrankRules ? Number(CrankRules.RULES.deckCap) : NaN; return own > 0 ? own : rule > 0 ? rule : null; };
  const money = (n) => (Number.isFinite(n) && n > 0 ? "$" + n.toLocaleString("en-US", {maximumFractionDigits: 2}) : "No cap");

  async function strategyEntry(card) {
    if (!strategyData) {
      const r = await fetch(CrankAssets.strategies);
      if (!r.ok) throw Error("The commander strategies could not be loaded.");
      strategyData = CrankAssets.expect(await r.json(), "strategies");
    }
    return strategyData.commanders.find((x) => x.id === card.id) || strategyData.commanders.find((x) => x.name === card.name) || null;
  }

  function start(query = "") {
    w = {commander: null, strategies: new Set(), touched: false, budget: defaultCap(), restrictions: "", name: ""};
    return commander(query);
  }
  /* 1. Commander: the app's own picker, every legal commander. */
  function commander(query = "") {
    return C.cardPicker("Build a deck · Commander", (c) => {
      if (!w.commander || w.commander.id !== c.id) { w.commander = c; w.touched = false; w.strategies = new Set(); w.name = ""; }
      return strategy();
    }, {commander: true, query: query || (w.commander ? w.commander.name : "")});
  }
  /* 2. Strategy: chips read off the commander. */
  async function strategy() {
    const c = w.commander;
    const skeleton = Array.from({length: 4}, () => '<span class="cm-build-chip is-loading" aria-hidden="true"></span>').join("");
    const d = modal("Build a deck", `${head(1)}<p class="cm-build-lead">What should it do? <span class="cm-muted">Read off</span> <strong>${e(c.name)}</strong></p>
      <p class="cm-muted">From its rules text first, then how decks and guides name it; by its colors only when neither says anything. Pick any; the draft seeds from them.</p>
      <div class="cm-build-chips" id="cm-build-chips" role="group" aria-label="Strategies" aria-busy="true">${skeleton}</div>
      <label class="cm-build-avoid">Anything to include or avoid<textarea name="restrictions" rows="3" maxlength="1000" placeholder="No infinite combos; keep it under three mana on average…">${e(w.restrictions)}</textarea></label>
      <div class="cm-form-footer">${b("Back", "build-step", {to: "commander"})}${b("Next: Budget", "build-step", {to: "budget"}, true)}</div>`);
    let options = [];
    try { options = CrankStrategies.optionsFor({entry: await strategyEntry(c), colorIdentity: c.colorIdentity || []}); }
    catch (error) { options = CrankStrategies.optionsFor({entry: null, colorIdentity: c.colorIdentity || []}); C.notice(`${error.message} Showing what its colors suggest instead.`, true); }
    const box = d.querySelector("#cm-build-chips");
    if (!box || !box.isConnected || w.commander !== c) return;  /* the reader moved on while it loaded */
    if (!w.touched) w.strategies = new Set(options.length ? [options[0].id] : []);
    box.innerHTML = options.map((o) => `<button type="button" class="cm-build-chip" data-action="build-toggle" data-strategy="${e(o.id)}" aria-pressed="${w.strategies.has(o.id)}" title="${e(o.why)} · from ${e(o.source)}"><span>${e(o.label)}</span><small>${e(o.fit)}</small></button>`).join("") || '<p class="cm-muted">Nothing to read off this commander yet. The Lab drafts from its colors and roles.</p>';
    box.setAttribute("aria-busy", "false");
  }
  /* 3. Budget: the price cap, prefilled with the reader's default. */
  function budget() {
    modal("Build a deck", `${head(2)}<div class="cm-form-grid"><label class="cm-full">Total price cap ($)<input name="budget" type="number" min="0" step="1" inputmode="decimal" value="${w.budget ?? ""}" placeholder="No cap"></label></div>
      ${note(`A cap is planned, not merely obeyed: basics do the cheap work and no single card takes more than a few times an even share of it. ${defaultCap() ? `Your default is ${money(defaultCap())} (Settings › Prices).` : ""} Leave it empty for no cap.`)}
      <div class="cm-form-footer">${b("Back", "build-step", {to: "strategy"})}${b("Next: Review", "build-step", {to: "review"}, true)}</div>`);
  }
  /* 4. Review: what was chosen, and the two ways on. */
  function review() {
    const c = w.commander, labels = [...w.strategies].map((id) => CrankStrategies.labelOf(id));
    const pending = C.state.preferences && C.state.preferences.labPreview;
    modal("Build a deck", `${head(3)}<dl class="cm-build-review">
        <dt>Commander</dt><dd><strong>${e(c.name)}</strong> ${C.colors(c.colorIdentity || [])}</dd>
        <dt>Strategy</dt><dd>${labels.length ? labels.map((l) => `<span class="cm-chip">${e(l)}</span>`).join(" ") : '<span class="cm-muted">Open: the Lab chooses from the commander</span>'}</dd>
        <dt>Budget</dt><dd>${e(money(w.budget))}</dd>
        ${w.restrictions ? `<dt>Include or avoid</dt><dd>${e(w.restrictions)}</dd>` : ""}
      </dl>
      <div class="cm-form-grid"><label class="cm-full">Deck name<input name="name" maxlength="160" value="${e(w.name || c.name + " deck")}"></label></div>
      ${pending ? note(`Drafting replaces the Lab's unsaved draft, ${pending.name || "the one open there"}. Save it in the Lab first to keep it.`, true) : ""}
      <p class="cm-muted">Create draft makes the deck with just its commander, the 99 to come. Draft the 99 builds a starting list in the Lab, to measure before anything is saved.</p>
      <div class="cm-form-footer">${b("Back", "build-step", {to: "budget"})}${b("Create draft", "build-create")}${b("Draft the 99 in the Lab", "build-lab", {}, true)}</div>`);
  }
  const STEP = {commander: () => commander(), strategy, budget, review};

  /* What the current step's fields say, kept before moving on. */
  function keep() {
    const d = document.getElementById("cm-dialog"), field = (n) => d && d.querySelector(`[name=${n}]`);
    if (field("restrictions")) w.restrictions = field("restrictions").value.trim();
    if (field("budget")) { const v = field("budget").value.trim(), n = Number(v); if (v && !(n >= 0)) throw Error("The cap is a dollar amount, or empty for no cap."); w.budget = v === "" || n === 0 ? null : n; }
    if (field("name")) w.name = field("name").value.trim();
  }
  actions["build-step"] = (el) => { if (!w || !w.commander && el.dataset.to !== "commander") return start(); keep(); return STEP[el.dataset.to](); };
  actions["build-toggle"] = (el) => { const id = el.dataset.strategy; w.touched = true; if (w.strategies.has(id)) w.strategies.delete(id); else w.strategies.add(id); el.setAttribute("aria-pressed", String(w.strategies.has(id))); };
  const definitionOf = () => ({strategies: [...w.strategies], budget: w.budget, restrictions: w.restrictions});
  actions["build-create"] = async () => {
    keep();
    const c = w.commander, id = "deck:" + C.uid();
    await C.commit({type: "createDeck", deckId: id, name: w.name || c.name + " deck", commanders: [c.id], cards: [c], slots: [{cardId: c.id, quantity: 1}], definition: definitionOf()});
    actions.close();
    C.go("decks", {deck: id});
  };
  actions["build-lab"] = () => { keep(); actions.close(); C.labStart({commander: w.commander, ...definitionOf()}); };
  C.build = {start};
});
