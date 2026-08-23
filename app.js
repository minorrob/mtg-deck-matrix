(() => {
  "use strict";

  const Lineup = window.MtgLineupModel;
  if (!Lineup) throw new Error("Lineup model did not load");
  const Compliance = window.MtgComplianceModel;
  if (!Compliance) throw new Error("Compliance model did not load");
  const Custom = window.MtgCustomModel;
  if (!Custom) throw new Error("Custom deck model did not load");
  const Scryfall = window.MtgScryfall;
  if (!Scryfall) throw new Error("Scryfall client did not load");
  const Generator = window.MtgDeckGenerator;
  if (!Generator) throw new Error("Deck generator did not load");

  const STORAGE_KEY = "mtg-deck-matrix-state-v1";
  const LEGACY_PICKS_KEY = "mtg-variant-picks";
  const CARD_METADATA_KEY = "mtg-card-metadata-v2";
  const CARD_METADATA_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const EMAIL_TO = "robminor3@gmail.com";
  const STAGES = ["Base", "Tuned", "Maxed"];
  const STAGE_DEFINITIONS = [
    "Base: the starting shell or preconstructed deck before targeted purchases. It shows the theme as it works straight out of the box.",
    "Tuned: the recommended practical build after the listed core purchases. This is the level where the variant should deliver its strategy reliably.",
    "Maxed: the strongest configuration that pushes the deck to the legal bounds of Tier 3 / Bracket 3 — Upgraded. It is based on capability and synergy, not card price, and permits no more than three selected Game Changers."
  ];
  const TOOLTIP_DEFINITIONS = {
    playstyle: "Playstyle fit measures how closely the deck matches the experience you want: defending early, building resources, combining pieces, lasting late, staying table-friendly, and expressing the cards’ story.",
    engine: "Engine rating measures how efficiently the deck works: effect per mana, card advantage, closing speed, interaction, recovery, and the likelihood that its core engine is assembled.",
    roomGrow: "Room to Grow measures how many useful upgrades still fit without changing the strategy, and approximately how expensive that remaining path is.",
    addComment: "Attach feedback directly to this variant. It stays on this device and is included when you email your selections.",
    fullDetail: "Open the complete evidence for this variant, including its commander, rank reasoning, rarity, starting product, upgrades, play pattern, scoring, and bracket route.",
    value: "Value compares the card’s likely contribution to the deck with its purchase price and how broadly useful it is.",
    roles: "Roles are the jobs this card performs in the deck, such as drawing cards, protecting the board, adding counters, or finishing the game.",
    whereBuy: "Where to buy identifies the most useful place or vendor-table area to search for this item.",
    cardScoring: "Card scoring is a five-point review of how strongly the card helps this specific deck, how easy it is to use, and how enjoyable its play pattern is.",
    power: "Power measures how much the card improves the deck’s ability to establish its plan, answer threats, or win.",
    ease: "Ease measures how naturally the card works without complicated timing, narrow setup, or expert rules knowledge.",
    fun: "Fun measures how satisfying and interactive the card is likely to feel for the player and the table.",
    fit: "Fit explains how directly the card supports this deck’s commander, mechanics, and stated game plan."
  };
  const KEYWORD_DEFINITIONS = {
    flying: "This creature can normally be blocked only by creatures with flying or reach.",
    lifelink: "Damage this creature deals also gives you that much life.",
    deathtouch: "Any amount of damage this creature deals to another creature is enough to destroy it.",
    vigilance: "This creature does not tap when it attacks, so it remains available to block.",
    trample: "Extra combat damage can carry over to the defending player after blockers take enough damage.",
    reach: "This creature can block creatures with flying.",
    haste: "This creature can attack and use tap abilities immediately after it enters play.",
    menace: "This creature must be blocked by at least two creatures.",
    defender: "This creature normally cannot attack.",
    "first strike": "This creature deals combat damage before creatures without first strike.",
    "double strike": "This creature deals combat damage twice: once early and once during normal combat damage.",
    indestructible: "Effects that say destroy and lethal damage do not destroy this permanent.",
    ward: "An opponent must pay the stated extra cost when targeting this permanent, or that spell or ability is stopped.",
    stampede: "This ability rewards attacking with a large group or a high-powered creature and turns that attack into an additional payoff."
  };
  const CARD_COPY = {
    "high-alert": {
      effect: "Your creatures deal combat damage using toughness instead of power. Creatures with defender are allowed to attack. You can also pay three mana to untap one creature.",
      fit: "High Alert turns the deck’s many high-toughness defenders into attackers and keeps that plan working if Arcades is unavailable."
    }
  };

  let catalog;
  let buyCatalog;
  let bakedCatalog;
  let bakedBuyCatalog;
  let customStore;
  let customDeckIds = new Set();
  const slotRuns = new Map();
  let state;
  let toastTimer;
  let openDeckId = 1;
  let openBuyDeckId = 1;
  let openCommentId = null;
  let tourState = null;
  let activeTooltipTarget = null;
  let shopMetadataPromise = null;
  let cardMetadata = {};
  try { cardMetadata = JSON.parse(localStorage.getItem(CARD_METADATA_KEY) || "{}"); } catch (_) {}

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  const icon = (glyph) => `<span class="ui-icon" aria-hidden="true">${esc(glyph)}</span>`;
  const SECTION_ICONS = {
    buildCost: "build_cost.png",
    powerLevel: "power_level.png",
    budget: "budget.png",
    rarity: "rarity.png",
    does: "does.png",
    scoring: "scoring_profile.png",
    fit: "fit.png",
    engine: "engine_rating.png",
    roomGrow: "room_grow.png",
    value: "value.png",
    roles: "roles.png",
    buyLocation: "buy_location.png",
    ceiling: "ceiling.png",
    notes: "notes.png"
  };
  const sectionIcon = (name) => `<img class="section-icon" src="assets/icons/${SECTION_ICONS[name]}" alt="" aria-hidden="true">`;
  const RARITY_ICONS = {
    common: "common_rarity.png",
    uncommon: "uncommon_rarity.png",
    rare: "rare_rarity.png",
    mythic: "mythic_rarity.png"
  };
  const rarityIcon = (rarity, label = rarity) => {
    const key = String(rarity || "").toLowerCase();
    const filename = RARITY_ICONS[key] || SECTION_ICONS.rarity;
    return `<img class="rarity-icon" src="assets/icons/${filename}" alt="${esc(label || "Rarity")}" title="${esc(label || "Rarity")}">`;
  };
  const money = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? `$${Number(value).toFixed(2)}` : "Price varies";
  const variantById = (id) => catalog.variants.find((variant) => variant.id === id);
  const isCustomDeck = (deckId) => customDeckIds.has(Number(deckId));

  // Generated decks are merged into copies of the baked catalog on every change.
  // The files on disk never learn about them, so the published catalog keeps its
  // exact contents and every existing view keeps reading one shape of data.
  function remergeCustom() {
    const merged = Custom.mergeIntoCatalogs(customStore, bakedCatalog, bakedBuyCatalog);
    catalog = merged.catalog;
    buyCatalog = merged.buyCatalog;
    customDeckIds = new Set(merged.customDeckIds);
    if (state) pruneMissingSelections();
  }

  // Clearing a placeholder deletes variants the rest of the app may still point at.
  function pruneMissingSelections() {
    Object.entries(state.compareSelections).forEach(([deckId, variantId]) => {
      if (!variantById(variantId)) delete state.compareSelections[deckId];
    });
  }

  function persistCustom(message = "") {
    const result = Custom.save(localStorage, customStore);
    if (!result.saved) {
      showToast(result.reason === "quota" || result.reason === "too-large"
        ? "This browser is out of storage for generated decks. Clear a placeholder and try again."
        : "Generated decks could not be saved on this device.");
      return result;
    }
    if (result.warn) showToast("Generated decks are using most of this browser's storage.");
    if (message) showToast(message);
    return result;
  }

  // Cards that Scryfall cannot resolve used to be re-requested on every render, and each
  // response re-rendered the view, which produced an endless render loop: blinking card art,
  // taps that landed on detached nodes, and inputs that lost focus mid-keystroke.
  const metadataAttempts = new Map();
  // Open/closed state for header disclosures and metric panels, kept outside the DOM so a
  // re-render does not silently fold everything back up.
  const metricPanelState = new Map();
  let liveExportContext = [];
  let commanderInfoOpen = null;

  function snapshotUiState(root) {
    if (!root) return null;
    const open = {};
    $$("details[data-ui-key]", root).forEach((node) => { open[node.dataset.uiKey] = node.open; });
    const active = document.activeElement;
    const inRoot = active && active !== document.body && root.contains(active);
    const focusKey = inRoot ? (active.dataset?.uiFocus || (active.id ? `#${active.id}` : null)) : null;
    const selectable = inRoot && typeof active.selectionStart === "number";
    return {
      open,
      focusKey,
      selectionStart: selectable ? active.selectionStart : null,
      selectionEnd: selectable ? active.selectionEnd : null,
      scrollY: window.scrollY
    };
  }

  function restoreUiState(root, snapshot) {
    if (!root || !snapshot) return;
    $$("details[data-ui-key]", root).forEach((node) => {
      const remembered = snapshot.open[node.dataset.uiKey];
      if (remembered !== undefined && node.open !== remembered) node.open = remembered;
    });
    if (snapshot.focusKey) {
      const target = snapshot.focusKey.startsWith("#")
        ? $(snapshot.focusKey, root)
        : $(`[data-ui-focus="${snapshot.focusKey.replace(/"/g, '\\"')}"]`, root);
      if (target) {
        try { target.focus({preventScroll: true}); } catch (_) {}
        if (snapshot.selectionStart !== null && typeof target.setSelectionRange === "function") {
          try { target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd); } catch (_) {}
        }
      }
    }
    if (typeof snapshot.scrollY === "number" && Math.abs(window.scrollY - snapshot.scrollY) > 1) {
      window.scrollTo({top: snapshot.scrollY, left: 0, behavior: "instant"});
    }
  }

  // Re-renders a whole view without throwing away what the person was doing inside it:
  // open disclosure panels, keyboard focus, caret position, and scroll offset all survive.
  function withUiState(selector, render) {
    const root = $(selector);
    const snapshot = snapshotUiState(root);
    render();
    restoreUiState($(selector), snapshot);
  }

  function tooltipAttributes(text, extraClass = "") {
    return `class="info-tip${extraClass ? ` ${esc(extraClass)}` : ""}" data-tooltip="${esc(text)}" tabindex="0" aria-describedby="info-tooltip"`;
  }

  function tooltipHint() {
    return "";
  }

  function applyTooltip(element, text, action = false) {
    if (!element || !text) return;
    element.classList.add("info-tip");
    if (action) element.classList.add("tip-action");
    element.dataset.tooltip = text;
    element.setAttribute("aria-describedby", "info-tooltip");
    if (!element.matches("button, a, input, select, textarea, [tabindex]")) element.tabIndex = 0;
    if (action && !$(".tip-hint", element)) element.insertAdjacentHTML("beforeend", tooltipHint());
  }

  function applyTooltipWithHint(element, text, action = false) {
    applyTooltip(element, text, action);
  }

  function stageTooltip(stageIndex, variants) {
    const notes = variants.map((variant) => `${variant.name}: ${variant.stageNotes?.[stageIndex] || "Uses this stage’s standard definition."}`);
    return `${STAGE_DEFINITIONS[stageIndex]}\n\nHow the five variants use it:\n${notes.join("\n")}`;
  }

  function manaCostHtml(cost) {
    const value = String(cost || "").trim();
    if (!value) return "";
    const symbols = Array.from(value.matchAll(/\{([^}]+)\}/g));
    if (!symbols.length) return `<span class="mana-text">${esc(value)}</span>`;
    return `<span class="mana-cost" aria-label="Mana cost ${esc(value)}">${symbols.map((match) => {
      const token = match[1].toUpperCase().replaceAll("/", "").replace(/[^A-Z0-9∞]/g, "");
      return `<img class="mana-symbol" src="https://svgs.scryfall.io/card-symbols/${encodeURIComponent(token)}.svg" alt="${esc(match[0])}" title="${esc(match[0])}">`;
    }).join("")}</span>`;
  }

  function plainLanguage(value) {
    return String(value || "")
      .replace(/\bETB\b/gi, "when it enters the battlefield")
      .replace(/\bboard wipe\b/gi, "spell that clears many cards from the battlefield")
      .replace(/\bdraw engine\b/gi, "repeatable way to draw cards")
      .replace(/\bramp\b/gi, "extra mana")
      .replace(/\brecursion\b/gi, "bringing cards back from the graveyard")
      .replace(/\bevasion\b/gi, "ways to get past blockers")
      .replace(/\bsac(?:rifice)? outlet\b/gi, "repeatable way to sacrifice your own cards");
  }

  function cardEffectHtml(value) {
    const text = plainLanguage(value).trim();
    if (!text) return "";
    const points = text.split(/(?<=[.!?])\s+|\s+[—–]\s+|;\s+|\n+/).map((part) => part.trim()).filter(Boolean);
    return `<ul class="card-effect-list">${points.map((point) => {
      const keyword = point.toLowerCase().replace(/[.:]+$/, "");
      const definition = KEYWORD_DEFINITIONS[keyword];
      return `<li>${esc(definition ? `${point.replace(/[.:]+$/, "")}: ${definition}` : point)}</li>`;
    }).join("")}</ul>`;
  }

  function blankState() {
    return {
      selectionSchema: 3,
      ownershipSchema: 2,
      compareSelections: {},
      rankStages: {},
      buySelections: {},
      found: {},
      boughtQuantities: {},
      comments: {},
      compareFilters: {query: "", mechanic: "all", playstyle: "all", profileStage: "2"},
      shopFilters: { status: "need", type: "all", category: "all", deck: "all", groupBy: "none", query: "" },
      buyMode: "all",
      purchasePrices: {},
      liveFilters: {},
      liveOpenDecks: {},
      lineupHistory: {},
      liveTransfers: {},
      liveSalvage: {},
      liveActive: {}
    };
  }

  function loadState() {
    const initial = blankState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") {
        return {
          ...initial,
          ...saved,
          selectionSchema: saved.selectionSchema || 1,
          ownershipSchema: saved.ownershipSchema || 1,
          compareSelections: saved.compareSelections || {},
          rankStages: saved.rankStages || {},
          buySelections: saved.buySelections || {},
          found: saved.found || {},
          boughtQuantities: saved.boughtQuantities || {},
          comments: saved.comments || {},
          compareFilters: {...initial.compareFilters, ...(saved.compareFilters || {})},
          shopFilters: {...initial.shopFilters, ...(saved.shopFilters || {})},
          buyMode: saved.buyMode === "purchased" ? "purchased" : "all",
          purchasePrices: saved.purchasePrices || {},
          liveFilters: saved.liveFilters || {},
          liveOpenDecks: saved.liveOpenDecks || {},
          lineupHistory: saved.lineupHistory || {},
          liveTransfers: saved.liveTransfers || {},
          liveSalvage: saved.liveSalvage || {},
          liveActive: saved.liveActive || {}
        };
      }
    } catch (_) {}

    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_PICKS_KEY) || "[]");
      legacy.forEach((id) => {
        const variant = variantById(id);
        if (variant && !initial.compareSelections[variant.deckId]) {
          initial.compareSelections[variant.deckId] = id;
        }
      });
    } catch (_) {}
    return initial;
  }

  function saveState(message = "Saved on this device") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(LEGACY_PICKS_KEY, JSON.stringify(Object.values(state.compareSelections)));
    const status = $("#save-status");
    status.textContent = message;
    clearTimeout(saveState.timer);
    saveState.timer = setTimeout(() => { status.textContent = "Saved on this device"; }, 1400);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  function positionInfoTooltip(target) {
    const tooltip = $("#info-tooltip");
    if (!target || tooltip.hidden) return;
    const rect = target.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 20);
    tooltip.style.width = `${width}px`;
    const left = Math.min(window.innerWidth - width - 10, Math.max(10, rect.left + rect.width / 2 - width / 2));
    const preferredTop = rect.bottom + 9;
    const aboveTop = rect.top - tooltip.offsetHeight - 9;
    const top = preferredTop + tooltip.offsetHeight <= window.innerHeight - 10 ? preferredTop : Math.max(10, aboveTop);
    Object.assign(tooltip.style, {left: `${left}px`, top: `${top}px`});
  }

  function showInfoTooltip(target) {
    const text = target?.dataset.tooltip;
    if (!text) return;
    const tooltip = $("#info-tooltip");
    activeTooltipTarget?.classList.remove("is-tip-open");
    activeTooltipTarget = target;
    target.classList.add("is-tip-open");
    tooltip.textContent = text;
    tooltip.hidden = false;
    requestAnimationFrame(() => positionInfoTooltip(target));
  }

  function hideInfoTooltip() {
    activeTooltipTarget?.classList.remove("is-tip-open");
    activeTooltipTarget = null;
    $("#info-tooltip").hidden = true;
  }

  function initializeInfoTooltips() {
    const finePointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    document.addEventListener("pointerover", (event) => {
      const target = event.target.closest("[data-tooltip]");
      if (target && finePointer()) showInfoTooltip(target);
    });
    document.addEventListener("pointerout", (event) => {
      const target = event.target.closest("[data-tooltip]");
      if (target && finePointer() && !target.contains(event.relatedTarget)) hideInfoTooltip();
    });
    document.addEventListener("focusin", (event) => {
      const target = event.target.closest("[data-tooltip]");
      if (target) showInfoTooltip(target);
    });
    document.addEventListener("focusout", (event) => {
      const target = event.target.closest("[data-tooltip]");
      if (target && !target.contains(event.relatedTarget)) hideInfoTooltip();
    });
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-tooltip]");
      if (!target) return hideInfoTooltip();
      const tappedHint = Boolean(event.target.closest(".tip-hint"));
      if (target.classList.contains("tip-action") && !tappedHint) return;
      if (!finePointer() || tappedHint) {
        event.preventDefault();
        event.stopPropagation();
        activeTooltipTarget === target ? hideInfoTooltip() : showInfoTooltip(target);
      }
    });
    window.addEventListener("resize", () => activeTooltipTarget && positionInfoTooltip(activeTooltipTarget));
    document.addEventListener("scroll", hideInfoTooltip, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && activeTooltipTarget) hideInfoTooltip();
    });
  }

  function initializeDetailsControls() {
    // Disclosures that live inside a <summary> must swallow the click, or the surrounding
    // <details> collapses the moment you try to expand the panel inside it.
    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-panel-toggle]");
      if (!toggle) return;
      event.preventDefault();
      event.stopPropagation();
      togglePanel(toggle.dataset.panelToggle);
    }, true);
    document.addEventListener("click", (event) => {
      const summary = event.target.closest("summary");
      const details = summary?.parentElement;
      if (!summary || !(details instanceof HTMLDetailsElement)) return;
      const interactiveChild = event.target.closest("button, a, input, select, textarea, [role='button']");
      if (interactiveChild && interactiveChild !== summary) return;
      event.preventDefault();
      details.open = !details.open;
    });
  }

  function selectedVariants() {
    return catalog.decks
      .map((deck) => variantById(state.compareSelections[deck.id]))
      .filter(Boolean);
  }

  function switchView(view, focus = true) {
    $$(".main-tab").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$(".view").forEach((section) => section.classList.toggle("is-active", section.id === `view-${view}`));
    if (view === "choose") renderChoose();
    if (view === "buy") renderBuy();
    if (view === "shop") renderShop();
    if (view === "live") renderLiveDecks();
    if (focus) {
      window.scrollTo({top: 0, behavior: "smooth"});
      $("#app").focus({preventScroll: true});
    }
  }

  const CHOOSE_COLORS = [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]];
  const CHOOSE_PLAYSTYLES = ["Fortress", "Build-up", "Convergence", "Longevity", "Friendly", "Flavor"];

  function renderChoose() {
    withUiState("#view-choose", renderChooseView);
  }

  function renderChooseView() {
    const root = $("#view-choose");
    const built = Custom.activeSlots(customStore).length;
    const kilobytes = Math.round(Custom.estimateBytes(customStore) / 1024);
    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="choose-title">Build your own decks</h2>
          <p>Describe what you want to play, paste a TCGplayer link to a commander, or drop in the cards you already know you want. Each placeholder generates up to five complete, Tier 3 legal 100-card variants from live Scryfall data, then hands them to Compare beside the curated decks.</p>
        </div>
        <div class="selection-meter"><strong>${built}/6</strong><span>placeholders built</span></div>
      </div>
      ${built ? `<p class="choose-storage">${icon("▤")}<span>Generated decks are private to this browser · about ${kilobytes} KB stored</span></p>` : ""}
      <div class="choose-grid" id="choose-grid"></div>`;
    const grid = $("#choose-grid", root);
    customStore.slots.forEach((slot, index) => grid.appendChild(makeChooseSlot(slot, index)));
  }

  function chooseInputRow(label, hint, control) {
    return `<label class="choose-field"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>${control}</label>`;
  }

  function makeChooseSlot(slot, index) {
    const variants = Custom.slotVariants(customStore, slot.slotId);
    const inputs = slot.inputs;
    const running = slotRuns.has(slot.slotId);
    const section = document.createElement("section");
    section.className = `choose-slot${variants.length ? " is-built" : ""}${running ? " is-running" : ""}`;
    section.dataset.slotId = String(slot.slotId);
    const statusLabel = running ? "Generating…" : variants.length ? `${variants.length} variant${variants.length === 1 ? "" : "s"}` : "Empty";
    section.innerHTML = `
      <header class="choose-slot-head">
        <span class="deck-number">${slot.slotId}</span>
        <label class="choose-title-field"><span class="visually-hidden">Name for placeholder ${index + 1}</span><input type="text" value="${esc(slot.title)}" maxlength="60" data-choose-title placeholder="My deck ${index + 1}"></label>
        <span class="choose-status ${running ? "is-running" : variants.length ? "is-ready" : ""}">${esc(statusLabel)}</span>
      </header>
      <details class="choose-form" data-ui-key="chooseform-${slot.slotId}" ${variants.length ? "" : "open"}>
        <summary><span>${icon("✎")}Describe this deck</span><small>Any combination — inputs, a commander link, or card links</small></summary>
        <div class="choose-form-body">
          <fieldset class="choose-colors"><legend>Colors<small>Ignored when a commander link sets them</small></legend>
            ${CHOOSE_COLORS.map(([color, name]) => `<button type="button" class="color-pip pip-${color}${inputs.colors.includes(color) ? " is-on" : ""}" data-choose-color="${color}" aria-pressed="${inputs.colors.includes(color)}"><span class="visually-hidden">${name}</span>${color}</button>`).join("")}
          </fieldset>
          <fieldset class="choose-themes"><legend>Mechanics<small>Drives the card pool and the Compare filters</small></legend>
            ${Object.keys(Generator.THEME_QUERIES).map((theme) => `<button type="button" class="theme-chip${inputs.themes.includes(theme) ? " is-on" : ""}" data-choose-theme="${esc(theme)}" aria-pressed="${inputs.themes.includes(theme)}">${esc(theme)}</button>`).join("")}
          </fieldset>
          <div class="choose-field-grid">
            ${chooseInputRow("Play style", "Shifts the role mix", `<select data-choose-input="playstyle"><option value="">No preference</option>${CHOOSE_PLAYSTYLES.map((style) => `<option value="${esc(style)}" ${inputs.playstyle === style ? "selected" : ""}>${esc(style)}</option>`).join("")}</select>`)}
            ${chooseInputRow("Budget", "Base build target, in dollars", `<input type="number" min="25" step="5" value="${esc(inputs.budgetUsd)}" data-choose-input="budgetUsd">`)}
            ${chooseInputRow("Card set", "Scryfall set code, optional", `<input type="text" value="${esc(inputs.preferSet)}" maxlength="6" placeholder="e.g. blb" data-choose-input="preferSet">`)}
            ${chooseInputRow("Variants", "How many approaches to build", `<select data-choose-input="variantCount">${[1, 2, 3, 4, 5].map((count) => `<option value="${count}" ${Number(inputs.variantCount) === count ? "selected" : ""}>${count}</option>`).join("")}</select>`)}
          </div>
          ${chooseInputRow("Commander link", "TCGplayer link — affiliate links work too", `<input type="url" value="${esc(inputs.commanderLink)}" placeholder="https://www.tcgplayer.com/product/…" data-choose-input="commanderLink">`)}
          ${chooseInputRow("Or a commander by name", "Used when no link is given", `<input type="text" value="${esc(inputs.commanderName)}" placeholder="Slimefoot, the Stowaway" data-choose-input="commanderName">`)}
          ${chooseInputRow("Cards to include", "One TCGplayer link per line", `<textarea rows="3" placeholder="https://www.tcgplayer.com/product/…" data-choose-seeds>${esc((inputs.seedLinks || []).join("\n"))}</textarea>`)}
        </div>
      </details>
      <div class="choose-actions">
        <button class="primary-button" type="button" data-choose-generate ${running ? "disabled" : ""}>${variants.length ? "Regenerate" : "Generate variants"}</button>
        ${running ? `<button class="secondary-button" type="button" data-choose-stop>Stop</button>` : ""}
        ${variants.length ? `<button class="text-button" type="button" data-choose-clear>Clear placeholder</button>` : ""}
      </div>
      <p class="choose-progress" data-gen-progress="${slot.slotId}" aria-live="polite">${running ? "Working…" : ""}</p>
      ${slot.warnings?.length ? `<ul class="choose-warnings">${slot.warnings.map((warning) => `<li>${icon("!")}<span>${esc(warning)}</span></li>`).join("")}</ul>` : ""}
      ${variants.length ? `<ol class="choose-results">${variants.map((variant) => {
        const view = Custom.toVariant(customStore, variant);
        return `<li>
          <span class="choose-result-copy"><strong>${esc(view.name)}</strong><small>${esc(variant.lensLabel || "Generated")} · ${esc(view.costs[1] || "")} tuned · ${esc(view.brackets[1]?.label || "")}</small></span>
          <button class="secondary-button" type="button" data-choose-open="${esc(variant.id)}">Open in Compare</button>
        </li>`;
      }).join("")}</ol>` : ""}`;

    const commit = (message = "") => {
      persistCustom(message);
    };
    $("[data-choose-title]", section).addEventListener("change", (event) => {
      slot.title = event.target.value.trim() || `My deck ${index + 1}`;
      commit();
      remergeCustom();
      renderCompare();
    });
    $$("[data-choose-color]", section).forEach((button) => button.addEventListener("click", () => {
      const color = button.dataset.chooseColor;
      slot.inputs.colors = slot.inputs.colors.includes(color)
        ? slot.inputs.colors.filter((entry) => entry !== color)
        : [...slot.inputs.colors, color];
      button.classList.toggle("is-on");
      button.setAttribute("aria-pressed", String(slot.inputs.colors.includes(color)));
      commit();
    }));
    $$("[data-choose-theme]", section).forEach((button) => button.addEventListener("click", () => {
      const theme = button.dataset.chooseTheme;
      slot.inputs.themes = slot.inputs.themes.includes(theme)
        ? slot.inputs.themes.filter((entry) => entry !== theme)
        : [...slot.inputs.themes, theme];
      button.classList.toggle("is-on");
      button.setAttribute("aria-pressed", String(slot.inputs.themes.includes(theme)));
      commit();
    }));
    $$("[data-choose-input]", section).forEach((field) => field.addEventListener("change", () => {
      const key = field.dataset.chooseInput;
      slot.inputs[key] = key === "budgetUsd" || key === "variantCount" ? Number(field.value) || Custom.blankInputs()[key] : field.value.trim();
      commit();
    }));
    $("[data-choose-seeds]", section).addEventListener("change", (event) => {
      slot.inputs.seedLinks = event.target.value.split("\n").map((line) => line.trim()).filter(Boolean);
      commit();
    });
    $("[data-choose-generate]", section).addEventListener("click", () => generateSlot(slot, index));
    $("[data-choose-stop]", section)?.addEventListener("click", () => {
      slotRuns.get(slot.slotId)?.abort();
      slotRuns.delete(slot.slotId);
      renderChoose();
    });
    $("[data-choose-clear]", section)?.addEventListener("click", () => {
      if (!window.confirm(`Clear ${slot.title} and the variants generated for it?`)) return;
      Custom.clearSlot(customStore, slot.slotId);
      persistCustom("Placeholder cleared.");
      remergeCustom();
      renderCompare();
      renderChoose();
    });
    $$("[data-choose-open]", section).forEach((button) => button.addEventListener("click", () => {
      openDeckId = slot.slotId;
      switchView("compare");
    }));
    return section;
  }

  async function generateSlot(slot, index) {
    if (slotRuns.has(slot.slotId)) return;
    const controller = new AbortController();
    slotRuns.set(slot.slotId, controller);
    slot.status = "generating";
    slot.warnings = [];
    renderChoose();
    const progress = $(`[data-gen-progress="${slot.slotId}"]`);
    const report = (message) => {
      if (progress?.isConnected) progress.textContent = message;
    };
    try {
      const client = Scryfall.createClient({});
      const result = await Generator.generateForSlot({...slot.inputs, slotId: slot.slotId}, {
        client,
        signal: controller.signal,
        createdAt: new Date().toISOString(),
        onProgress: (event) => report(event.message || event.phase)
      });
      if (result.error) {
        slot.status = "error";
        slot.warnings = [result.error, ...(result.warnings || [])];
      } else {
        Custom.putCards(customStore, result.cards);
        Custom.replaceSlotVariants(customStore, slot.slotId, result.variants);
        slot.status = "ready";
        slot.generatedAt = new Date().toISOString();
        slot.warnings = result.warnings;
        if (!slot.title || slot.title === `My deck ${index + 1}`) slot.title = result.commander.name;
        slot.objective = Custom.describeSlot(slot);
        remergeCustom();
        renderCompare();
        showToast(`${result.variants.length} variant${result.variants.length === 1 ? "" : "s"} generated from ${result.commander.name}.`);
      }
    } catch (error) {
      slot.status = error?.name === "AbortError" ? "empty" : "error";
      if (error?.name !== "AbortError") slot.warnings = [error.message || "Generation failed."];
    } finally {
      slotRuns.delete(slot.slotId);
      persistCustom();
      renderChoose();
    }
  }

  function renderCompare() {
    withUiState("#view-compare", renderCompareView);
  }

  function renderCompareView() {
    const root = $("#view-compare");
    const selected = selectedVariants();
    const filters = state.compareFilters;
    const mechanics = Array.from(new Set(catalog.variants.flatMap((variant) => variant.mechanics || []))).sort();
    const playstyles = catalog.variants[0]?.scores?.playstyle?.[0]?.map((score) => score.label) || [];
    const visibleTotal = catalog.variants.filter(matchesCompareFilters).length;
    const activeFilterCount = [filters.mechanic, filters.playstyle].filter((value) => value !== "all").length + (filters.query ? 1 : 0);
    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="compare-title">Choose your ${catalog.decks.length === 6 ? "six" : "decks"}</h2>
          <p>Open each deck role, compare its approaches, and pick one. Your choices stay private on this device.</p>
        </div>
        <div class="selection-meter"><strong>${selected.length}/${catalog.decks.length}</strong><span>decks selected</span></div>
      </div>
      <div class="action-row">
        <button class="primary-button" id="save-picks" ${selected.length ? "" : "disabled"}>Save Picks → Buy Picks</button>
        <button class="secondary-button" id="email-picks" ${selected.length ? "" : "disabled"}>Email selections</button>
      </div>
      <section class="compare-filter-panel">
        <div class="compare-filter-heading"><div>${icon("⌕")}<span><b>Find a variant</b><small>${visibleTotal} of ${catalog.variants.length} shown${activeFilterCount ? ` · ${activeFilterCount} active filters` : ""}</small></span></div>${activeFilterCount ? `<button id="clear-compare-filters">Clear</button>` : ""}</div>
        <div class="compare-filter-grid">
          <label class="compare-search"><span>Search</span><input id="compare-search" type="search" value="${esc(filters.query)}" placeholder="Commander, role, tag, or text…"></label>
          ${compareSelect("mechanic", "Mechanic", [["all","All mechanics"], ...mechanics.map((value) => [value,value])], filters.mechanic)}
          ${compareSelect("playstyle", "Play style", [["all","All play styles"], ...playstyles.map((value) => [value,`${value} · 4+`])], filters.playstyle)}
          ${compareSelect("profileStage", "Score stage", [["1","Base"],["2","Tuned"],["3","Maxed"]], filters.profileStage)}
        </div>
      </section>
      <div id="deck-groups"></div>`;

    const groups = $("#deck-groups", root);
    let dividedAsCustom = null;
    catalog.decks.forEach((deck) => {
      const chosenId = state.compareSelections[deck.id];
      const rankStage = Number(state.rankStages[deck.id] || 2);
      const deckTotal = catalog.variants.filter((variant) => variant.deckId === deck.id).length;
      const variants = catalog.variants
        .filter((variant) => variant.deckId === deck.id)
        .filter(matchesCompareFilters)
        .sort((a, b) => (a.ranks?.[rankStage - 1] || a.order) - (b.ranks?.[rankStage - 1] || b.order));
      if (customDeckIds.size && isCustomDeck(deck.id) !== dividedAsCustom) {
        dividedAsCustom = isCustomDeck(deck.id);
        const divider = document.createElement("p");
        divider.className = "deck-group-divider";
        divider.innerHTML = dividedAsCustom
          ? `${icon("✦")}<span>Your generated decks</span><small>Built on the Choose step from your own inputs</small>`
          : `${icon("▣")}<span>Curated decks</span><small>The six researched roles</small>`;
        groups.appendChild(divider);
      }
      const details = document.createElement("details");
      details.className = "deck-group";
      details.open = deck.id === openDeckId;
      details.innerHTML = `
        <summary>
          <span class="deck-number">${deck.id}</span>
          <span class="deck-summary-copy"><strong>${esc(deck.title)}</strong><span>${chosenId ? `Picked: ${esc(variantById(chosenId).name)} · ` : ""}${variants.length} of ${deckTotal} shown</span></span>
          <span class="deck-chevron" aria-hidden="true">›</span>
        </summary>
        <p class="deck-objective">${esc(deck.objective)} <span class="swipe-hint">Swipe cards sideways →</span></p>
        <div class="rank-order" role="group" aria-label="Sort Deck ${deck.id} variants by stage ranking">
          <span>Rank order</span>
          ${STAGES.map((label, index) => `<button class="rank-order-button info-tip tip-action${rankStage === index + 1 ? " is-active" : ""}" data-rank-stage="${index + 1}" data-tooltip="${esc(stageTooltip(index, variants))}" aria-describedby="info-tooltip">${label}${tooltipHint()}</button>`).join("")}
        </div>
        <div class="variant-track">${variants.length ? "" : `<div class="variant-filter-empty">${icon("⌕")}<strong>No variants match this filter in Deck ${deck.id}</strong><span>Try another mechanic, play style, or search term.</span></div>`}</div>`;
      const track = $(".variant-track", details);
      variants.forEach((variant) => track.appendChild(makeVariantCard(variant, rankStage)));
      $$(".rank-order-button", details).forEach((button) => button.addEventListener("click", () => {
        state.rankStages[deck.id] = Number(button.dataset.rankStage);
        openDeckId = deck.id;
        saveState();
        renderCompare();
      }));
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        openDeckId = deck.id;
        if (window.matchMedia("(max-width: 1079px)").matches) {
          $$(".deck-group", groups).forEach((other) => {
            if (other !== details) other.open = false;
          });
        }
      });
      groups.appendChild(details);
    });

    $("#save-picks", root).addEventListener("click", () => {
      saveState();
      switchView("buy");
    });
    $("#email-picks", root).addEventListener("click", emailPicks);
    $("#compare-search", root).addEventListener("input", (event) => {
      state.compareFilters.query = event.target.value;
      saveState();
      renderCompare();
    });
    $$('[data-compare-filter]', root).forEach((select) => select.addEventListener("change", () => {
      state.compareFilters[select.dataset.compareFilter] = select.value;
      saveState();
      renderCompare();
    }));
    $("#clear-compare-filters", root)?.addEventListener("click", () => {
      state.compareFilters = {...blankState().compareFilters};
      saveState();
      renderCompare();
    });
  }

  function compareSelect(field, label, options, value) {
    return `<label><span>${esc(label)}</span><select data-compare-filter="${esc(field)}">${options.map(([option, text]) => `<option value="${esc(option)}" ${String(value) === String(option) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  }

  function matchesCompareFilters(variant) {
    const filters = state.compareFilters;
    const stageIndex = Number(filters.profileStage || 2) - 1;
    if (filters.mechanic !== "all" && !(variant.mechanics || []).includes(filters.mechanic)) return false;
    if (filters.playstyle !== "all") {
      const score = (variant.scores?.playstyle?.[stageIndex] || []).find((item) => item.label === filters.playstyle);
      if (!score || score.score < 4) return false;
    }
    const query = filters.query.trim().toLowerCase();
    if (!query) return true;
    const haystack = [variant.name, variant.commander, variant.typeLine, ...(variant.tags || []), ...(variant.mechanics || []), ...(variant.summaries || []).flat(), ...(variant.stageNotes || [])].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  function makeVariantCard(variant, rankStage = 2) {
    const stage = rankStage;
    const selected = state.compareSelections[variant.deckId] === variant.id;
    const bracket = variant.brackets[stage - 1] || {};
    const summary = variant.summaries[stage - 1] || [];
    const rank = variant.ranks?.[rankStage - 1] || variant.order;
    const facts = variant.facts?.[stage - 1] || {};
    const rarity = variant.rarity?.[stage - 1] || {};
    const playstyle = variant.scores?.playstyle?.[stage - 1] || [];
    const engine = variant.scores?.engine?.[stage - 1] || [];
    const growth = variant.scores?.growth || [];
    const card = document.createElement("article");
    card.className = `variant-card${selected ? " is-selected" : ""}`;
    card.dataset.variant = variant.id;
    card.innerHTML = `
      <label class="pick-control">
        <input type="checkbox" ${selected ? "checked" : ""} aria-label="Pick ${esc(variant.name)}">
        <span>${selected ? "Picked" : "Pick"}</span>
      </label>
      <div class="variant-hero">
        <div class="variant-visual">
          <img src="${esc(variant.image)}" alt="${esc(variant.commander)} card" loading="lazy">
          <div class="rank-badge rank-${rank}" aria-label="Rank ${rank} of 5 for ${STAGES[rankStage - 1]}"><span>#${rank}</span><small>${STAGES[rankStage - 1]} rank</small></div>
        </div>
        <div class="variant-copy">
          <div class="variant-tags">${variant.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
          <h3>${esc(variant.name)}</h3>
          <p class="commander">${esc(variant.commander)}<br><span class="mana">${manaCostHtml(variant.manaCost)}<span>${esc(variant.typeLine)}</span></span></p>
          <div class="mechanic-tags">${(variant.mechanics || []).slice(0,3).map((mechanic) => `<span>${esc(mechanic)}</span>`).join("")}</div>
        </div>
      </div>
      <div class="stage-content">
        <div class="metric-grid">
          <div class="metric-tile cost-metric cost-budget-metric">${sectionIcon("buildCost")}<span class="cost-budget-copy"><span><small>Build cost</small><strong>${esc(variant.costs[stage - 1] || "Varies")}</strong></span><span><small>Budget</small><strong>${esc(facts.budget || "Varies")}</strong></span></span></div>
          <div class="metric-tile bracket-metric">${sectionIcon("powerLevel")}<span>Power level</span><strong>${esc(bracket.label || "Profile")}</strong></div>
          <div class="metric-tile budget-metric availability-metric">${sectionIcon("budget")}<span>Availability</span><strong><span>${esc(facts.availability || "Varies")}</span><b class="${bracket.gameChangers && !bracket.gameChangers.startsWith("0") ? "has-gc" : ""}">${esc(bracket.gameChangers || "0 GC")}</b></strong></div>
          <div class="metric-tile rarity-metric" title="${esc(rarity.description || "")}">${sectionIcon("rarity")}<span>Rarity</span><strong>${esc(rarity.percent || "—")} · ${esc(rarity.label || "")}</strong></div>
        </div>
        <section class="build-promise">
          <h4>${sectionIcon("does")}What this build does</h4>
          <ul>${summary.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </section>
        <div class="score-heading">${sectionIcon("scoring")}<span>Scoring profile</span><small>Tap a rating for what drives it</small></div>
        <div class="metric-strip">
          ${metricFamilyMarkup("playstyle", playstyle, `metric-playstyle-${variant.id}-compare`, wideViewport())}
          ${metricFamilyMarkup("engine", engine, `metric-engine-${variant.id}-compare`, wideViewport())}
          ${metricFamilyMarkup("growth", growth, `metric-growth-${variant.id}-compare`, wideViewport())}
        </div>
        <div class="variant-card-actions">
          <button class="comment-toggle tip-action info-tip${state.comments[variant.id] ? " has-comment" : ""}" type="button" aria-expanded="${openCommentId === variant.id}" data-tooltip="${esc(TOOLTIP_DEFINITIONS.addComment)}" aria-describedby="info-tooltip">${icon(state.comments[variant.id] ? "✓" : "“")}<span>${state.comments[variant.id] ? "Comment saved" : "Add a comment"}</span>${tooltipHint()}</button>
          <button class="detail-button tip-action info-tip" type="button" data-tooltip="${esc(TOOLTIP_DEFINITIONS.fullDetail)}" aria-describedby="info-tooltip">View full detail →${tooltipHint()}</button>
        </div>
        <div class="comment-editor" ${openCommentId === variant.id ? "" : "hidden"}>
          <label for="comment-${esc(variant.id)}">Feedback on this variant</label>
          <textarea id="comment-${esc(variant.id)}" maxlength="1200" placeholder="What do you like, dislike, or want changed?">${esc(state.comments[variant.id] || "")}</textarea>
          <small>Saved on this device · included in email when this variant is selected</small>
        </div>
      </div>`;

    $("img", card).addEventListener("error", (event) => {
      event.currentTarget.alt = `${variant.commander} image unavailable`;
      event.currentTarget.style.visibility = "hidden";
    });
    $(".pick-control input", card).addEventListener("change", () => selectVariant(variant));
    $(".detail-button", card).addEventListener("click", () => openVariantDetail(variant, stage));
    $(".comment-toggle", card).addEventListener("click", () => {
      openCommentId = openCommentId === variant.id ? null : variant.id;
      const editor = $(".comment-editor", card);
      editor.hidden = openCommentId !== variant.id;
      $(".comment-toggle", card).setAttribute("aria-expanded", String(!editor.hidden));
      if (!editor.hidden) $("textarea", editor).focus();
    });
    $(".comment-editor textarea", card).addEventListener("input", (event) => {
      const value = event.target.value;
      if (value.trim()) state.comments[variant.id] = value;
      else delete state.comments[variant.id];
      saveState("Comment saved");
      const toggle = $(".comment-toggle", card);
      toggle.classList.toggle("has-comment", Boolean(value.trim()));
      $("span:not(.ui-icon)", toggle).textContent = value.trim() ? "Comment saved" : "Add a comment";
    });
    return card;
  }

  function openVariantDetail(variant, stage) {
    const dialog = $("#detail-sheet");
    $("#detail-sheet-image").src = variant.image;
    $("#detail-sheet-image").alt = `${variant.commander} card`;
    $("#detail-sheet-kicker").textContent = `Deck ${variant.deckId} · ${STAGES[stage - 1]} rank #${variant.ranks?.[stage - 1] || variant.order}`;
    $("#detail-sheet-title").textContent = variant.name;
    $("#detail-sheet-context").innerHTML = "";
    $("#detail-sheet-context").hidden = false;
    $("#commander-info-toggle")?.remove();
    $("#detail-sheet-body").innerHTML = variant.detailHtml || `<p>No extended report is available.</p>`;
    decorateRichContent($("#detail-sheet-body"), variant);
    organizeVariantDetail($("#detail-sheet-body"), variant);
    dialog.showModal();
  }

  function detailSectionByHeading(root, pattern) {
    return $$(".blk, .detail-block", root).find((section) => {
      const heading = $("h3, h4", section);
      if (!heading) return false;
      const cleanHeading = heading.cloneNode(true);
      $$(".ui-icon, .section-icon", cleanHeading).forEach((node) => node.remove());
      return pattern.test(cleanHeading.textContent.trim());
    });
  }

  function plainCommanderAbility(text) {
    return plainLanguage(text)
      .replace(/^whenever\b/i, "Each time")
      .replace(/^at the beginning of your end step\b/i, "At the end of your turn")
      .replace(/^at your end step\b/i, "At the end of your turn")
      .replace(/put \+1\/\+1 counters? on (?:a|target) creature equal to/gi, "make one creature permanently stronger by adding one +1/+1 counter for each")
      .replace(/reanimate (?:a|target) creature/gi, "return a creature card from your graveyard directly to the battlefield")
      .replace(/mana value/gi, "total mana cost")
      .replace(/≤/g, "no more than")
      .replace(/\bmill (\d+)\b/gi, "put the top $1 cards of the library into the graveyard")
      .replace(/\bscry (\d+)\b/gi, "look at the top $1 cards and move unwanted ones to the bottom")
      .replace(/\btoken(s)?\b/gi, "temporary card$1 represented by markers")
      .replace(/\bpermanent(s)?\b/gi, "card$1 on the battlefield")
      .replace(/\bexile\b/gi, "remove from the game")
      .replace(/\bgraveyard\b/gi, "discard pile")
      .replace(/\s+/g, " ")
      .trim();
  }

  function commanderAbilityLabel(text) {
    const named = text.match(/^([A-Z][A-Za-z' -]{2,24})\s*[:—–-]\s*/);
    if (named) return named[1];
    const lower = text.toLowerCase();
    if (/\+1\/\+1 counter|counter/.test(lower)) return "Counters";
    if (/reanimate|return.*graveyard|graveyard/.test(lower)) return "Graveyard recovery";
    if (/gain.*life|lifegain|life gained/.test(lower)) return "Life gain";
    if (/life lost|pay.*life/.test(lower)) return "Life-loss payoff";
    if (/draw.*card/.test(lower)) return "Card draw";
    if (/create.*token|token/.test(lower)) return "Creates helpers";
    if (/sacrifice/.test(lower)) return "Sacrifice payoff";
    if (/attack|combat/.test(lower)) return "Combat payoff";
    if (/enter.*battlefield|enters/.test(lower)) return "Entry trigger";
    if (/tap|untap/.test(lower)) return "Tap ability";
    if (/damage/.test(lower)) return "Damage effect";
    if (/end step|end of your turn/.test(lower)) return "End-of-turn payoff";
    return "Card ability";
  }

  function commanderAbilitiesHtml(effect) {
    const sentences = String(effect || "").split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    const rows = [];
    sentences.forEach((sentence) => {
      const keywordOnly = sentence.replace(/[.!]$/, "").split(/,\s*/).map((part) => part.trim().toLowerCase());
      if (keywordOnly.length && keywordOnly.every((keyword) => KEYWORD_DEFINITIONS[keyword])) {
        keywordOnly.forEach((keyword) => rows.push({label: keyword.replace(/\b\w/g, (char) => char.toUpperCase()), plain: KEYWORD_DEFINITIONS[keyword], original: sentence}));
        return;
      }
      const named = sentence.match(/^([A-Z][A-Za-z' -]{2,24})\s*[:—–-]\s*(.+)$/);
      const label = named?.[1] || commanderAbilityLabel(sentence);
      const body = named?.[2] || sentence;
      const keywordDefinition = KEYWORD_DEFINITIONS[label.toLowerCase()];
      rows.push({label, plain: keywordDefinition || plainCommanderAbility(body), original: sentence});
    });
    return `<ul class="commander-ability-list">${rows.map((row) => `<li><button type="button" ${tooltipAttributes(`Original card wording: ${row.original}`, "commander-ability")}><b>${esc(row.label)}</b><span>${esc(row.plain)}</span>${tooltipHint()}</button></li>`).join("")}</ul>`;
  }

  // The green commander block can eat most of a phone screen, so it folds away behind a
  // caret pinned to the bottom-right of the card art. The choice is remembered per session.
  function mountCommanderToggle() {
    const aside = $(".detail-sheet-aside");
    const context = $("#detail-sheet-context");
    if (!aside || !context) return;
    let toggle = $("#commander-info-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = "commander-info-toggle";
      toggle.className = "commander-info-toggle";
      toggle.setAttribute("aria-controls", "detail-sheet-context");
      toggle.innerHTML = `<span>Commander Info</span><i aria-hidden="true">⌄</i>`;
      toggle.addEventListener("click", () => setCommanderInfoOpen(!commanderInfoOpen));
      aside.insertBefore(toggle, context);
    }
    if (commanderInfoOpen === null) commanderInfoOpen = !window.matchMedia("(max-width: 620px)").matches;
    setCommanderInfoOpen(commanderInfoOpen);
  }

  function setCommanderInfoOpen(open) {
    commanderInfoOpen = Boolean(open);
    const toggle = $("#commander-info-toggle");
    const context = $("#detail-sheet-context");
    if (!toggle || !context) return;
    toggle.setAttribute("aria-expanded", String(commanderInfoOpen));
    toggle.classList.toggle("is-open", commanderInfoOpen);
    context.hidden = !commanderInfoOpen;
  }

  function organizeVariantDetail(root, variant) {
    const commanderSection = detailSectionByHeading(root, /^Commander$/i);
    if (commanderSection) {
      const cells = $$("tr.cmdr td", commanderSection);
      const commanderName = cells[0]?.textContent.trim() || variant.commander;
      const commanderCost = cells[1]?.innerHTML || manaCostHtml(variant.manaCost);
      const commanderType = cells[2]?.textContent.trim() || variant.typeLine;
      const commanderEffect = cells[3]?.textContent.trim() || "Open the card image to read the complete rules text.";
      const commanderPrice = cells[4]?.textContent.trim() || "";
      $("#detail-sheet-context").innerHTML = `<section class="detail-aside-commander" id="detail-commander-panel"><h3>${icon("♛")}Commander</h3><strong>${esc(commanderName)}</strong><div class="aside-commander-meta"><span>${commanderCost}</span>${commanderPrice ? `<b>${esc(commanderPrice)}</b>` : ""}</div><small>${esc(commanderType)}</small>${commanderAbilitiesHtml(commanderEffect)}</section>`;
      mountCommanderToggle();
      commanderSection.remove();
    }

    const raritySection = detailSectionByHeading(root, /^Deck rarity\s*[—–-]\s*by stage$/i);
    const preconSection = detailSectionByHeading(root, /^Precon seed$/i);
    const verdict = $(".verdict", root);
    if (verdict) {
      const verdictTitle = $(".vhead span", verdict);
      if (verdictTitle) verdictTitle.textContent = "Rank";
      $$("[aria-label], title", verdict).forEach((node) => {
        if (node.hasAttribute("aria-label")) node.setAttribute("aria-label", "Rank");
        if (node.tagName.toLowerCase() === "title") node.textContent = "Rank";
      });
      verdict.classList.add("detail-rank-summary");
    }
    if (raritySection && preconSection) {
      const split = document.createElement("div");
      split.className = "detail-summary-split";
      raritySection.before(split);
      split.append(raritySection, preconSection);
      if (verdict) split.before(verdict);
      const rarityMethod = $(".method", raritySection);
      const rarityHeading = $("h3, h4", raritySection);
      if (rarityMethod && rarityHeading) {
        applyTooltipWithHint(rarityHeading, rarityMethod.textContent.trim());
        rarityMethod.hidden = true;
      }
    }
  }

  function selectVariant(variant) {
    const previous = state.compareSelections[variant.deckId];
    openDeckId = variant.deckId;
    if (previous === variant.id) {
      delete state.compareSelections[variant.deckId];
      showToast(`Deck ${variant.deckId} pick cleared.`);
    } else {
      state.compareSelections[variant.deckId] = variant.id;
      if (previous) showToast(`Deck ${variant.deckId} changed. Other Buy Picks were preserved.`);
      else showToast(`Deck ${variant.deckId} saved: ${variant.name}`);
    }
    saveState();
    renderCompare();
  }

  function emailPicks() {
    const picks = selectedVariants();
    if (!picks.length) return;
    const body = [
      "Hey, here are the variants for each deck that I'd probably lean toward:",
      "",
      ...picks.flatMap((variant) => {
        const comment = String(state.comments[variant.id] || "").trim();
        return comment ? [`${variant.deckId} - ${variant.name}`, `Feedback: ${comment}`, ""] : [`${variant.deckId} - ${variant.name}`];
      })
    ].join("\n");
    window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent("My choices")}&body=${encodeURIComponent(body)}`;
  }

  function ensureBuyState(variantId) {
    const plan = buyCatalog?.plans?.[variantId];
    if (!plan) return {shell: [], tuned: [], upgrade: [], enhance: [], max: []};
    const hasStored = Object.prototype.hasOwnProperty.call(state.buySelections, variantId);
    const existing = state.buySelections[variantId] || {};
    const legacyExclusions = (() => {
      try { return new Set(JSON.parse(localStorage.getItem("mtg-tuned-exclusions-v1") || "{}")[variantId] || []); }
      catch (_) { return new Set(); }
    })();
    let next;
    if (!hasStored) {
      next = Lineup.defaultSelection(plan);
      for (const id of legacyExclusions) next = Lineup.restoreChoice(plan, next, id);
    } else {
      next = Lineup.canonicalizeSelection(plan, existing);
    }
    state.buySelections[variantId] = next;
    return state.buySelections[variantId];
  }

  function migrateCheckedSelections() {
    if (state.selectionSchema >= 3) return;
    const previousSchema = Number(state.selectionSchema || 1);
    Object.entries(buyCatalog.plans || {}).forEach(([variantId, plan]) => {
      const existing = state.buySelections[variantId];
      if (!existing) {
        state.buySelections[variantId] = Lineup.defaultSelection(plan);
        return;
      }
      if (previousSchema < 2) {
        let migrated = Lineup.defaultSelection(plan);
        for (const key of ["upgrade", "enhance", "max"]) {
          for (const id of existing[key] || []) migrated = Lineup.applyChoice(plan, migrated, id);
        }
        const exclusions = (() => { try { return new Set(JSON.parse(localStorage.getItem("mtg-tuned-exclusions-v1") || "{}")[variantId] || []); } catch (_) { return new Set(); } })();
        for (const id of exclusions) migrated = Lineup.restoreChoice(plan, migrated, id);
        state.buySelections[variantId] = migrated;
      } else {
        state.buySelections[variantId] = Lineup.canonicalizeSelection(plan, existing, {restoreResolvedFlexible: true});
      }
    });
    state.selectionSchema = 3;
    saveState("Named 100-card lineups restored");
  }

  function selectionHistory(variantId, slotId) {
    state.lineupHistory ||= {};
    state.lineupHistory[variantId] ||= {};
    state.lineupHistory[variantId][slotId] ||= [];
    return state.lineupHistory[variantId][slotId];
  }

  function assignSelection(target, source) {
    for (const key of Lineup.ARRAY_KEYS) target[key] = [...(source[key] || [])];
  }

  function tentativeLineupChoice(plan, current, candidateId, checked, preferredId = null) {
    if (!checked) return Lineup.restoreChoice(plan, current, candidateId, preferredId);
    const model = Lineup.buildModel(plan);
    const candidate = model.byId.get(String(candidateId));
    let next = Lineup.applyChoice(plan, current, candidateId);
    if (!candidate) return next;
    const sameName = Lineup.normalizeName(candidate.item.name);
    const duplicates = Lineup.selectedEntries(plan, next).filter((entry) => entry.id !== candidate.id && Lineup.normalizeName(entry.item.name) === sameName);
    for (const duplicate of duplicates) {
      let substitute = duplicate.kind === "shell" ? null : model.byId.get(duplicate.predecessorId);
      if (!substitute || Lineup.normalizeName(substitute.item.name) === sameName) {
        substitute = (model.groups.get(duplicate.slotId) || []).find((entry) => entry.kind === "tuned" && Lineup.normalizeName(entry.item.name) !== sameName)
          || (model.groups.get(duplicate.slotId) || []).find((entry) => entry.kind !== "shell" && Lineup.normalizeName(entry.item.name) !== sameName)
          || null;
      }
      if (substitute) next = Lineup.applyChoice(plan, next, substitute.id);
    }
    return next;
  }

  function acceptLineupChoice(variantId, candidateId, checked, next, previousId = null, restoredId = null) {
    const plan = buyCatalog.plans[variantId];
    const model = Lineup.buildModel(plan);
    const candidate = model.byId.get(String(candidateId));
    if (!candidate) return;
    const history = selectionHistory(variantId, candidate.slotId);
    if (checked && previousId && previousId !== candidate.id) history.push(previousId);
    if (!checked && restoredId && history.at(-1) === restoredId) history.pop();
    assignSelection(ensureBuyState(variantId), next);
  }

  function migrateOwnedExtras() {
    const migrationKey = "mtg-owned-extras-import-v3";
    if (localStorage.getItem(migrationKey)) return;
    state.boughtQuantities ||= {};
    (buyCatalog.ownedExtras || []).forEach((name) => {
      const key = itemKey({name});
      state.found[key] = true;
      state.boughtQuantities[key] = Math.max(1, Number(state.boughtQuantities[key] || 0));
    });
    localStorage.setItem(migrationKey, JSON.stringify({count: (buyCatalog.ownedExtras || []).length, importedAt: new Date().toISOString()}));
    saveState("Owned card inventory added");
  }

  function migrateBoughtQuantities() {
    if (state.ownershipSchema >= 2) return;
    state.boughtQuantities ||= {};
    const ownedExtras = new Set((buyCatalog.ownedExtras || []).map((name) => itemKey({name})));
    const precons = new Set(Object.values(buyCatalog.plans || {}).map((plan) => itemKey(plan.precon)).filter(Boolean));
    const shoppingQuantities = new Map(derivedShopItems().map((item) => [item.key, Math.max(1, Number(item.quantity || 1))]));
    Object.entries(state.found || {}).forEach(([key, bought]) => {
      if (!bought || state.boughtQuantities[key]) return;
      state.boughtQuantities[key] = ownedExtras.has(key) || precons.has(key) ? 1 : shoppingQuantities.get(key) || 1;
    });
    state.ownershipSchema = 2;
    saveState("Owned copy counts updated");
  }

  function sanitizeGameChangerSelections() {
    let changed = false;
    for (const [variantId, plan] of Object.entries(buyCatalog.plans || {})) {
      const current = ensureBuyState(variantId);
      for (const kind of ["max", "enhance"]) {
        const collection = plan[kind] || [];
        for (let index = current[kind].length - 1; index >= 0 && evaluateDeckCompliance(plan, current).selectedGameChangers.length > 3; index -= 1) {
          const item = collection.find((candidate) => candidate.id === current[kind][index]);
          if (!item?.gameChanger) continue;
          assignSelection(current, Lineup.restoreChoice(plan, current, item.id));
          changed = true;
        }
      }
    }
    if (changed) saveState("Tier 3 Game Changer selections updated");
  }

  function renderBuy() {
    withUiState("#view-buy", renderBuyView);
  }

  function renderBuyView() {
    const root = $("#view-buy");
    const selected = selectedVariants();
    const readyCount = selected.filter((variant) => buyCatalog.plans[variant.id]).length;
    if (!selected.some((variant) => variant.deckId === openBuyDeckId)) openBuyDeckId = selected[0]?.deckId || 1;
    root.innerHTML = `
      <div class="page-intro buy-intro">
        <div class="buy-intro-head">
          <h2 id="buy-title">Build the buy plan</h2>
          ${buyCheckedSummary(selected)}
        </div>
        <div class="buy-intro-controls">
          <div class="buy-mode-chips" role="group" aria-label="Purchase status">
            <button type="button" class="filter-chip${state.buyMode === "all" ? " is-active" : ""}" data-buy-mode="all">All</button>
            <button type="button" class="filter-chip${state.buyMode === "purchased" ? " is-active" : ""}" data-buy-mode="purchased">Bought</button>
          </div>
          <span class="buy-mode-count" id="buy-mode-count"></span>
          <p class="buy-intro-copy">Every checked card counts toward the final deck. <b>Enhance</b> keeps the role at $15 or less; <b>Maxxed</b> pushes capability to the legal bounds of Tier 3 / Bracket 3 regardless of price.</p>
        </div>
      </div>
      ${selected.length ? "" : `<div class="empty-state"><h3>No deck picks yet</h3><p>Choose a variant in Compare first, then come back here.</p><button class="primary-button" data-go="compare">Choose decks</button></div>`}
      ${selected.some((variant) => !buyCatalog.plans[variant.id]) ? `<div class="coverage-note"><h3>Selection needs attention</h3><p>One selected variant could not be loaded. Return to Compare and select it again.</p></div>` : ""}
      ${readyCount ? `<section class="buy-overview"><h3>Shopping plan summary</h3><div class="buy-overview-grid">${selected.filter((variant) => buyCatalog.plans[variant.id]).map((variant) => {
        const plan = buyCatalog.plans[variant.id];
        const current = ensureBuyState(variant.id);
        const namedShell = (plan.startingShell || []).filter((card) => !card.isFlexibleSlot);
        const selectedShell = new Set(current.shell || []);
        const shellSummary = `${namedShell.filter((card) => selectedShell.has(card.id)).reduce((sum, card) => sum + Number(card.quantity || 1), 0)}/${namedShell.reduce((sum, card) => sum + Number(card.quantity || 1), 0)} shell cards · `;
        return `<button class="buy-overview-card" data-open-buy-deck="${variant.deckId}"><b>Deck ${variant.deckId}</b><strong>${esc(variant.name)}</strong><span>${shellSummary}${esc(plan.priorityLabel || plan.budgetLabel)} · ${plan.required.length} Tuned purchases</span></button>`;
      }).join("")}</div></section>` : ""}
      ${selected.length ? `<div class="action-row action-row-top"><button class="primary-button save-buys">Save Buys → Shop List</button><button class="secondary-button" data-go="compare">Back to Compare</button></div>` : ""}
      <div id="buy-decks"></div>
      ${salvageBuySection()}
      ${selected.length ? `<div class="action-row"><button class="primary-button save-buys">Save Buys → Shop List</button><button class="secondary-button" data-go="compare">Back to Compare</button></div>` : ""}`;

    const decksRoot = $("#buy-decks", root);
    selected.forEach((variant) => decksRoot.appendChild(makeBuyDeck(variant)));
    $$('[data-open-buy-deck]', root).forEach((button) => button.addEventListener("click", () => {
      openBuyDeckId = Number(button.dataset.openBuyDeck);
      renderBuy();
      $(`.buy-deck[open]`, root)?.scrollIntoView({behavior: "smooth", block: "start"});
    }));
    $$('[data-go="compare"]', root).forEach((button) => button.addEventListener("click", () => switchView("compare")));
    $$('[data-salvage-id]', root).forEach((button) => button.addEventListener("click", () => {
      const item = allSalvageCards().find((card) => card.id === button.dataset.salvageId);
      if (item) openBuyItemDetail({...item, purpose: item.reason, why: item.reason, whereToBuy: "Already owned · Salvage shadow pile", brief: {fit: item.reason}}, {id: "salvage", deckId: "Salvage", image: item.image}, "salvage");
    }));
    $$(".save-buys", root).forEach((button) => button.addEventListener("click", () => {
      saveState();
      switchView("shop");
    }));
    $$("[data-buy-mode]", root).forEach((button) => button.addEventListener("click", () => {
      state.buyMode = button.dataset.buyMode;
      saveState();
      $$("[data-buy-mode]", root).forEach((peer) => peer.classList.toggle("is-active", peer === button));
      applyBuyMode();
    }));
    applyBuyMode();
  }

  // The Bought filter used to live in a separate script that watched the DOM and rewrote it,
  // which fought with this file's own rendering. It is a plain pass over the rendered rows now.
  function applyBuyMode() {
    const root = $("#view-buy");
    if (!root) return;
    const purchasedOnly = state.buyMode === "purchased";
    let selectedCount = 0;
    let purchasedCount = 0;
    $$(".buy-item", root).forEach((row) => {
      const key = row.dataset.cardKey;
      const included = row.dataset.included === "true";
      const purchased = Boolean(key && state.found[key]);
      row.classList.toggle("is-purchased", purchased);
      if (included) selectedCount += 1;
      if (included && purchased) purchasedCount += 1;
      row.hidden = purchasedOnly && !(included && purchased);
    });
    $$(".constructed-shell-group, .shell-type-group, .buy-section", root).forEach((group) => {
      const rows = $$(".buy-item", group);
      group.hidden = purchasedOnly && rows.length > 0 && rows.every((row) => row.hidden);
    });
    const count = $("#buy-mode-count", root);
    if (count) count.textContent = `${purchasedCount}/${selectedCount} bought`;
    const empty = $(".buy-mode-empty", root);
    const nothingShown = purchasedOnly && purchasedCount === 0;
    if (empty) empty.hidden = !nothingShown;
    else if (nothingShown) {
      const notice = document.createElement("div");
      notice.className = "empty-state buy-mode-empty";
      notice.innerHTML = `<h3>No bought cards yet</h3><p>Mark a card Bought in the Shop List and it appears here.</p>`;
      $("#buy-decks", root)?.before(notice);
    }
  }

  function buyCheckedSummary(variants) {
    const totals = {};
    let checked = 0;
    variants.forEach((variant) => {
      const plan = buyCatalog.plans[variant.id];
      if (!plan) return;
      const literal = selectedDeckCards(plan, ensureBuyState(variant.id));
      checked += literal.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
      literal.forEach((card) => {
        const type = shellType(card);
        totals[type] = (totals[type] || 0) + Number(card.quantity || 1);
      });
    });
    const order = ["Creature", "Land", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Other"];
    return `<div class="buy-checked-meter"><div class="selection-meter"><strong>${checked}</strong><span>checked cards</span></div><div class="buy-type-counters" aria-label="Checked cards by type">${order.filter((type) => totals[type]).map((type) => `<span><b>${totals[type]}</b> ${esc(type)}</span>`).join("")}</div></div>`;
  }

  function buyRowAttributes(card, included) {
    return `data-card-key="${esc(itemKey(card))}" data-included="${included ? "true" : "false"}"`;
  }

  function salvageBuySection() {
    const cards = allSalvageCards();
    if (!cards.length) return "";
    return `<details class="salvage-pile" data-ui-key="salvage-pile"><summary><span>${icon("♲")}<strong>Salvage</strong><b>${cards.length}</b></span><small>Owned shadow pile · intentionally excluded from final decks</small></summary><div class="salvage-grid">${cards.map((card) => `<button type="button" data-salvage-id="${esc(card.id)}"><img src="${esc(card.image || cardImageCandidates(card)[0])}" alt="" loading="lazy"><span><strong>${esc(card.name)}</strong><small>${esc(card.reason)}</small></span></button>`).join("")}</div><p class="salvage-note">“On an Adventure” is a helper/reference card rather than a legal deck card, so it is not counted in Salvage or any final 100.</p></details>`;
  }

  function allSalvageCards() {
    const cards = new Map((buyCatalog.salvage || []).map((card) => [itemKey(card), card]));
    Object.values(state.liveSalvage || {}).forEach((record) => cards.set(itemKey(record.card), {
      ...record.card,
      id: record.card.id || `salvage-${itemKey(record.card)}`,
      reason: record.reason || "Moved to the Salvage shadow pile."
    }));
    return Array.from(cards.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function updateBuyCheckedSummary() {
    const current = $("#view-buy .buy-checked-meter");
    if (!current) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buyCheckedSummary(selectedVariants());
    current.replaceWith(wrapper.firstElementChild);
  }

  function makeBuyDeck(variant) {
    const plan = buyCatalog.plans[variant.id];
    const current = plan ? ensureBuyState(variant.id) : null;
    const optionalCount = current ? (current.upgrade?.length || 0) + (current.enhance?.length || 0) + (current.max?.length || 0) : 0;
    const shellCards = plan ? (plan.startingShell || []).filter((card) => !card.isFlexibleSlot) : [];
    const selectedShellIds = new Set(current?.shell || []);
    const shellCount = shellCards.filter((card) => selectedShellIds.has(card.id)).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const purchaseTotal = plan ? selectedPurchaseTotal(plan, current) : null;
    const details = document.createElement("details");
    details.className = "buy-deck";
    details.open = variant.deckId === openBuyDeckId;
    details.innerHTML = `
      <summary>
        <span class="deck-number">${variant.deckId}</span>
        <span class="buy-deck-title"><strong>${esc(variant.name)}</strong><span>${plan ? `${shellCards.length ? `${shellCount} shell card${shellCount === 1 ? "" : "s"} selected · ` : ""}${plan.required.length} Tuned · ${optionalCount} optional picked` : esc(variant.commander)}</span></span>
        ${plan ? buyTotalMarkup(purchaseTotal) : `<span class="profile-gap">Pending</span>`}
      </summary>
      <div class="buy-body"></div>`;
    details.addEventListener("toggle", () => {
      if (!details.isConnected || !details.open) return;
      openBuyDeckId = variant.deckId;
      $$(".buy-deck", $("#buy-decks")).forEach((other) => {
        if (other !== details) other.open = false;
      });
    });
    const body = $(".buy-body", details);
    if (!plan) {
      body.innerHTML = `<div class="empty-state"><h3>Purchase profile not published yet</h3><p>This variant remains selected, but it will not add generic or mismatched cards to your Shop List.</p></div>`;
      return details;
    }

    body.innerHTML = `
      ${compliancePanel(variant, plan, current)}
      <details class="plan-analysis" data-ui-key="plan-${esc(variant.id)}">
        <summary><span>${icon("☰")}Deck plan &amp; analysis</span><small>How to play, buy order, bracket placement, and tuning notes</small></summary>
        <div class="legacy-plan">${plan.planHtml || variant.detailHtml || ""}</div>
      </details>
      ${startingShellSection(variant, plan, current, variant.id)}
      ${buySection("Tuned", "Required purchases for the Tuned build", plan.required, "tuned", current, variant.id)}
      ${buySection("Enhance", "Role-preserving improvements and owned substitutions · $15 or less", plan.enhance, "enhance", current, variant.id)}
      ${buySection("Maxxed", "Strongest Tier 3 / Bracket 3-legal capability · price is not the criterion", plan.max, "max", current, variant.id)}`;
    decorateRichContent(body, variant);
    if (details.open) ensureShopMetadata([...(plan.startingShell || []), ...(plan.required || []), ...(plan.enhance || []), ...(plan.max || [])]);
    $$('[data-shell-card-name]', body).forEach((button) => button.addEventListener("click", () => {
      const shellCard = (plan.startingShell || []).map(resolvedShellCard).find((card) => card.name === button.dataset.shellCardName);
      if (!shellCard) return;
      const requiresPurchase = isSinglesBuiltShell(plan);
      openBuyItemDetail({
        ...shellCard,
        category: requiresPurchase ? "shell" : "starting shell",
        purpose: shellCard.isFlexibleSlot ? "A modeled slot whose exact card was not named in the source guide." : shellCard.oracleText,
        why: shellCard.isFlexibleSlot ? "The source guide confirms the slot but does not name the exact card." : "",
        whereToBuy: requiresPurchase ? "Singles case" : "Already in the starting shell",
        brief: {},
        price: shellCard.price,
        ceiling: shellCard.ceiling
      }, variant, requiresPurchase ? "starting shell single" : "starting shell");
    }));
    $$('input[data-buy-kind]', body).forEach((checkbox) => checkbox.addEventListener("change", () => {
      const itemId = checkbox.dataset.itemId;
      const currentState = ensureBuyState(variant.id);
      const model = Lineup.buildModel(plan);
      const candidate = model.byId.get(String(itemId));
      if (!candidate) return;
      const active = Lineup.activeEntryForSlot(plan, currentState, candidate.slotId);
      const history = selectionHistory(variant.id, candidate.slotId);
      const preferredId = checkbox.checked ? null : history.at(-1) || null;
      const tentative = tentativeLineupChoice(plan, currentState, itemId, checkbox.checked, preferredId);
      const restored = Lineup.activeEntryForSlot(plan, tentative, candidate.slotId);
      if (!checkbox.checked && restored?.id === candidate.id) {
        showToast(`${candidate.item.name} stays active until you choose another card for this slot.`);
        renderBuy();
        return;
      }
      const baseCompliance = evaluateDeckCompliance(plan, tentative);
      const effectiveCompliance = evaluateDeckCompliance(plan, tentative, projectedEffectiveCards(variant, tentative));
      const issue = baseCompliance.tier3[0] || effectiveCompliance.tier3[0];
      if (issue) showToast(`Heads up — this makes the deck non-compliant: ${issue.rule}`);
      acceptLineupChoice(variant.id, itemId, checkbox.checked, tentative, active?.id || null, preferredId);
      saveState(checkbox.checked ? `${candidate.item.name} is active` : `${candidate.item.name} swapped out`);
      renderBuy();
    }));
    const selectAllShell = $('[data-select-shell-all]', body);
    if (selectAllShell) {
      const shellIds = (plan.startingShell || []).filter((card) => !card.isFlexibleSlot).map((card) => card.id);
      const selectedShell = new Set(current.shell || []);
      const partiallySelected = selectedShell.size > 0 && shellIds.some((id) => !selectedShell.has(id));
      selectAllShell.setAttribute("aria-checked", partiallySelected ? "mixed" : String(selectAllShell.checked));
      requestAnimationFrame(() => {
        if (selectAllShell.isConnected) selectAllShell.indeterminate = partiallySelected;
      });
      selectAllShell.addEventListener("change", () => {
        const currentState = ensureBuyState(variant.id);
        let tentative;
        if (selectAllShell.checked) {
          tentative = Lineup.canonicalizeSelection(plan, {shell: shellIds, tuned: [], upgrade: [], enhance: [], max: []});
        } else {
          tentative = {...currentState, shell: []};
          tentative = Lineup.canonicalizeSelection(plan, tentative);
        }
        if (selectAllShell.checked) {
          const baseIssue = evaluateDeckCompliance(plan, tentative).tier3[0];
          const effectiveIssue = evaluateDeckCompliance(plan, tentative, projectedEffectiveCards(variant, tentative)).tier3[0];
          if (baseIssue || effectiveIssue) showToast(`Heads up — the full shell is not Tier 3 compliant: ${(baseIssue || effectiveIssue).rule}`);
        }
        assignSelection(currentState, tentative);
        state.lineupHistory[variant.id] = {};
        saveState(selectAllShell.checked ? "Full Starting Shell activated" : "Active Starting Shell cards cleared");
        renderBuy();
      });
    }
    $$(".buy-item-detail:not([data-shell-card-name])", body).forEach((button) => button.addEventListener("click", () => {
      const kind = button.dataset.itemKind;
      const collection = kind === "tuned" ? plan.required : plan[kind];
      const item = kind === "precon" ? plan.precon : (collection || []).find((candidate) => candidate.id === button.dataset.itemId);
      if (item) openBuyItemDetail(resolvedBuyCard(item), variant, kind);
    }));
    body.addEventListener("click", (event) => {
      const status = event.target.closest("[data-compliance-tier]");
      if (status) {
        event.preventDefault();
        event.stopPropagation();
        openComplianceDetail(variant, evaluateDeckCompliance(plan, ensureBuyState(variant.id)), Number(status.dataset.complianceTier));
      }
      const composition = event.target.closest("[data-composition-detail]");
      if (composition) {
        event.preventDefault();
        event.stopPropagation();
        openComplianceDetail(variant, evaluateDeckCompliance(plan, ensureBuyState(variant.id)), 0);
      }
    });
    body.addEventListener("keydown", (event) => {
      const control = event.target.closest('[role="button"][data-compliance-tier], [role="button"][data-composition-detail]');
      if (control && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        control.click();
      }
    });
    return details;
  }

  function selectedPurchaseTotal(plan, current) {
    const selectedShell = new Set(current?.shell || []);
    const selectedTuned = new Set(current?.tuned || []);
    const selectedEnhance = new Set(current?.enhance || []);
    const selectedUpgrade = new Set(current?.upgrade || []);
    const selectedMax = new Set(current?.max || []);
    const purchases = [
      ...(isSinglesBuiltShell(plan)
        ? (plan.startingShell || []).filter((item) => !item.isFlexibleSlot && selectedShell.has(item.id)).map(resolvedShellCard)
        : plan.precon ? [plan.precon] : []),
      ...(plan.required || []).filter((item) => selectedTuned.has(item.id)),
      ...(plan.upgrade || []).filter((item) => selectedUpgrade.has(item.id)),
      ...(plan.enhance || []).filter((item) => selectedEnhance.has(item.id)),
      ...(plan.max || []).filter((item) => selectedMax.has(item.id))
    ];
    return purchases.reduce((summary, item) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const price = Number(cardPriceBounds(item, cardMetadata[itemKey(item)] || {}).price) || 0;
      if (price > 0) summary.total += price * quantity;
      else summary.unpriced += quantity;
      return summary;
    }, {total: 0, unpriced: 0});
  }

  function buyTotalMarkup(summary) {
    return `<span class="buy-total" data-buy-total><small>Selected total</small><strong>$${summary.total.toFixed(2)}</strong>${summary.unpriced ? `<em>+ ${summary.unpriced} unpriced</em>` : ""}</span>`;
  }

  function updateBuyTotal(deck, plan, current) {
    const target = $("[data-buy-total]", deck);
    if (!target) return;
    const summary = selectedPurchaseTotal(plan, current);
    target.innerHTML = `<small>Selected total</small><strong>$${summary.total.toFixed(2)}</strong>${summary.unpriced ? `<em>+ ${summary.unpriced} unpriced</em>` : ""}`;
  }

  function isSinglesBuiltShell(plan) {
    return plan?.startingShellKind !== "official-precon";
  }

  function cardPriceBounds(card, metadata) {
    const current = Number(metadata?.price ?? card?.price) || null;
    const ceiling = Number(card?.ceiling ?? metadata?.ceiling) || null;
    return {price: current && ceiling ? Math.min(current, ceiling) : current, ceiling};
  }

  function resolvedShellCard(card) {
    const metadata = cardMetadata[itemKey(card)] || {};
    const bounds = cardPriceBounds(card, metadata);
    return {
      ...card,
      manaCost: card.manaCost || metadata.manaCost || "",
      typeLine: card.typeLine || metadata.typeLine || "Unclassified card",
      image: card.image || metadata.image || "",
      oracleText: card.oracleText || metadata.oracleText || "",
      keywords: card.keywords || metadata.keywords || [],
      price: bounds.price,
      ceiling: bounds.ceiling,
      metadataUnavailable: Boolean(metadata.unavailable),
      metadataLoaded: Boolean(metadata.loaded || metadata.price !== undefined)
    };
  }

  function resolvedBuyCard(card) {
    const metadata = cardMetadata[itemKey(card)] || {};
    const bounds = cardPriceBounds(card, metadata);
    return {
      ...card,
      manaCost: card.manaCost || metadata.manaCost || "",
      typeLine: card.typeLine || metadata.typeLine || "",
      image: metadata.image || card.image || "",
      oracleText: card.oracleText || metadata.oracleText || "",
      keywords: card.keywords || metadata.keywords || [],
      colorIdentity: card.colorIdentity || metadata.colorIdentity || [],
      legalities: card.legalities || metadata.legalities || {},
      commanderLegal: card.commanderLegal ?? metadata.commanderLegal,
      rarity: card.rarity || metadata.rarity || "",
      setName: card.setName || metadata.setName || "",
      price: bounds.price,
      ceiling: bounds.ceiling
    };
  }

  function isInternalBuildNote(value) {
    return /^From the (?:Base|Tuned|Maxed) build of\b/i.test(String(value || "").trim());
  }

  function usefulCardCopy(...values) {
    return values.find((value) => String(value || "").trim() && !isInternalBuildNote(value)) || "";
  }

  function standaloneCardEffect(item) {
    const curated = CARD_COPY[itemKey(item)]?.effect;
    if (curated) return curated;
    const authored = usefulCardCopy(item.whyPrimary, item.purpose, item.why, item.alternateReason, item.oracleText);
    if (authored) return authored;
    const type = String(item.typeLine || "card").split("—")[0].trim().toLowerCase() || "card";
    return `${item.name} is a ${type}. Its exact rules text is not available yet; open the card image to read the printed abilities.`;
  }

  function standaloneCardFit(item, plan) {
    const curated = CARD_COPY[itemKey(item)]?.fit;
    if (curated) return curated;
    const authored = usefulCardCopy(item.brief?.fit, item.whyOptional, item.alternateReason, item.purpose);
    if (authored) return authored;
    const oracle = plainLanguage(usefulCardCopy(item.oracleText, item.whyPrimary, item.why));
    const effectParts = oracle.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
    const defenderCard = /\bdefender\b/i.test(oracle) || /\bWall\b/i.test(item.typeLine || "");
    if (defenderCard) {
      const draws = /draw (?:a|one) card/i.test(oracle);
      return `${item.name} blocks early and can become an attacker when this deck enables its defenders${draws ? ", while also replacing itself by drawing a card" : ""}.`;
    }
    const effect = effectParts.find((part) => !KEYWORD_DEFINITIONS[part.toLowerCase().replace(/[.:]+$/, "")]);
    if (effect) return `${item.name} supports this deck with this ability: ${effect}`;
    const roles = (item.tags || []).filter(Boolean).join(", ");
    return roles ? `Its role in this deck is ${roles}.` : `It is included because it supports the deck’s core game plan.`;
  }

  function shellType(card) {
    if (card.isFlexibleSlot) return "Unspecified slots";
    return ["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle"].find((type) => String(card.typeLine).includes(type)) || "Other";
  }

  function shellCardRow(card) {
    const image = card.image ? `<img src="${esc(card.image)}" alt="" loading="lazy">` : `<span class="shell-placeholder" aria-hidden="true">?</span>`;
    return `<button type="button" class="shell-card-row" data-shell-card-name="${esc(card.name)}">${image}<span><strong>${esc(card.name)}${card.quantity > 1 ? ` ×${card.quantity}` : ""}</strong><small>${manaCostHtml(card.manaCost)}${esc(card.typeLine)}</small><em>View details →</em></span></button>`;
  }

  function shellPurchaseRow(card, current, variantId, showPrice = true) {
    const image = card.image ? `<img src="${esc(card.image)}" alt="" loading="lazy">` : `<span class="shell-placeholder" aria-hidden="true">?</span>`;
    const checked = (current.shell || []).includes(card.id);
    return `<div class="buy-item constructed-shell-item" ${buyRowAttributes(card, checked)}>
      <input type="checkbox" ${checked ? "checked" : ""} data-buy-kind="shell" data-item-id="${esc(card.id)}" data-variant-id="${esc(variantId)}" aria-label="Include ${esc(card.name)} in the final deck">
      <button class="buy-item-detail" type="button" data-shell-card-name="${esc(card.name)}">
        ${image}
        <span class="buy-copy">
          <span class="buy-item-eyebrow"><span class="kind-label shell">Starting Shell</span>${card.isCommander ? `<span class="commander-mini">Commander</span>` : ""}${card.gameChanger ? `<span class="gc-mini">✦ Game Changer</span>` : ""}</span>
          <strong>${esc(card.name)}${card.quantity > 1 ? ` ×${card.quantity}` : ""}</strong>
          <small>${manaCostHtml(card.manaCost)}${esc(card.typeLine)}</small>
        </span>
      </button>
      ${showPrice ? `<span class="price"><small>Target</small>${card.price ? money(card.price) : card.metadataLoaded ? "Not listed" : "Loading…"}</span>` : `<span class="owned-shell-label">In starting shell</span>`}
    </div>`;
  }

  function constructedShellSection(variant, plan, cards, current, variantId) {
    const purchasedAsSingles = isSinglesBuiltShell(plan);
    const commander = cards.find((card) => card.isCommander) || cards[0];
    const named = cards.filter((card) => !card.isFlexibleSlot);
    const flexibleCount = cards.filter((card) => card.isFlexibleSlot).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const namedCount = named.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const groups = new Map();
    named.filter((card) => card !== commander).forEach((card) => {
      const type = shellType(card);
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(card);
    });
    const typeOrder = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Other", "Land"];
    const typeGroups = typeOrder.filter((type) => groups.has(type)).map((type) => {
      const group = groups.get(type);
      const count = group.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
      const checkedCount = group.filter((card) => (current.shell || []).includes(card.id)).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
      return `<details class="constructed-shell-group shell-type-group" data-ui-key="shellgrp-${esc(variantId)}-${esc(type)}" ${type === "Creature" ? "open" : ""}>
        <summary><span>${esc(type)}</span><b title="${checkedCount} of ${count} checked to buy">${checkedCount}/${count}</b></summary>
        <div class="constructed-shell-list">${group.map((card) => shellPurchaseRow(card, current, variantId, purchasedAsSingles)).join("")}</div>
      </details>`;
    }).join("");
    const selectedCount = named.filter((card) => (current.shell || []).includes(card.id)).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const allSelected = named.every((card) => (current.shell || []).includes(card.id));
    return `<section class="starting-shell constructed-shell">
      <div class="starting-shell-heading"><span>${icon("▣")}<strong>Starting Shell${purchasedAsSingles ? " · Singles to buy" : " · Final-deck choices"}</strong><b>${selectedCount}/${namedCount}</b></span><label class="shell-select-all"><input type="checkbox" data-select-shell-all ${allSelected ? "checked" : ""}><span>Select all</span></label></div>
      <p class="shell-source-note constructed-shell-note">${purchasedAsSingles ? "Check the individual cards you need; selected cards flow to the Shop List." : "These cards came in the starting product. Keep checked only the cards you want in the finished 100; no individual price is required."}</p>
      <div class="constructed-shell-commander"><h4>Commander</h4>${shellPurchaseRow(commander, current, variantId, purchasedAsSingles)}</div>
      <div class="constructed-shell-groups">${typeGroups}</div>
      ${flexibleCount ? `<p class="shell-flex-note"><b>${flexibleCount} modeled slot${flexibleCount === 1 ? "" : "s"} still need exact card names.</b> They preserve the 100-card compliance model but are not added to the Shop List until a card is named.</p>` : ""}
    </section>`;
  }

  function startingShellSection(variant, plan, current, variantId) {
    const cards = (plan.startingShell || []).map(resolvedShellCard);
    return constructedShellSection(variant, plan, cards, current, variantId);
  }

  function compliancePanel(variant, plan, current) {
    const result = evaluateDeckCompliance(plan, current);
    const tierButton = (tier) => {
      const violations = result[`tier${tier}`];
      const compliant = violations.length === 0;
      return `<span class="compliance-status ${compliant ? "is-compliant" : "is-noncompliant"}" data-compliance-tier="${tier}" role="button" tabindex="0" title="View Tier ${tier} details">
        <b>Tier ${tier}</b><strong>${compliant ? "✓ Compliant" : `! ${violations.length} issue${violations.length === 1 ? "" : "s"}`}</strong>
      </span>`;
    };
    const countState = result.total === 100 ? "is-compliant" : "is-noncompliant";
    const landPercent = result.total ? Math.min(100, Math.round((result.types.Land || 0) / result.total * 100)) : 0;
    return `<details class="deck-compliance" data-compliance-panel data-ui-key="compliance-${esc(variant.id)}">
      <summary class="compliance-heading"><span class="compliance-title">${icon("✓")}<span><b>Commander deck check</b><small>4-player construction · click to expand</small></span></span><span class="compliance-inline">${tierButton(2)}${tierButton(3)}<span class="card-count-status ${countState}" data-composition-detail role="button" tabindex="0"><b>${result.total}/100</b><small>${result.total === 100 ? "Exact" : result.total < 100 ? `${100 - result.total} under` : `${result.total - 100} over`}</small></span></span></summary>
      <div class="compliance-details">
      <button class="composition-strip" data-composition-detail aria-label="View deck composition details">
        <span class="land-segment" style="width:${landPercent}%"></span><span class="other-segment" style="width:${100 - landPercent}%"></span>
        <b>${result.types.Land || 0} lands</b><b>${result.total - (result.types.Land || 0)} other</b><em>View breakdown →</em>
      </button>
      ${result.compositionWarnings.length ? `<p class="composition-warning">${icon("!")}<span>${esc(result.compositionWarnings[0])}</span></p>` : ""}
      <p class="audit-note">Guideline check · open a Tier status for rule details</p></div>
    </details>`;
  }

  function updateCompliancePanel(body, variant, plan) {
    const existing = $("[data-compliance-panel]", body);
    if (!existing) return;
    const wasOpen = existing.open;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = compliancePanel(variant, plan, ensureBuyState(variant.id));
    const replacement = wrapper.firstElementChild;
    replacement.open = wasOpen;
    existing.replaceWith(replacement);
  }

  function selectedDeckCards(plan, current) {
    return Lineup.selectedEntries(plan, current).map((entry) => ({
      ...resolvedBuyCard(entry.item),
      id: entry.id,
      quantity: Number(entry.item.quantity || 1),
      lineupKind: entry.kind,
      lineupSlotId: entry.slotId,
      lineupSlotName: entry.root?.name || entry.item.name
    }));
  }

  function evaluateDeckCompliance(plan, current, cardOverride = null) {
    const literalCards = cardOverride || selectedDeckCards(plan, current);
    const baseIssues = Lineup.unresolvedEntries(plan)
      .filter((entry) => Lineup.selectedEntries(plan, current).some((selected) => selected.id === entry.id))
      .map((entry) => ({card: entry.item.name, rule: `Replacement slot could not be resolved: ${entry.item.replaces || "no cut named"}.`, detail: "Choose an exact starting-shell card for this slot."}));
    return Compliance.evaluateCardList(literalCards, {baseIssues, resolveMeta: (item) => cardMetadata[itemKey(item)] || {}});
  }

  function openComplianceDetail(variant, result, tier) {
    const dialog = $("#compliance-dialog");
    const violations = tier ? result[`tier${tier}`] : [];
    $("#compliance-dialog-kicker").textContent = `Deck ${variant.deckId} · ${variant.name}`;
    $("#compliance-dialog-title").textContent = tier ? `Tier ${tier} compliance details` : "Deck composition details";
    const typeOrder = ["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Other"];
    const breakdown = typeOrder.filter((type) => result.types[type]).map((type) => `<div><span>${esc(type)}</span><strong>${result.types[type]}</strong></div>`).join("");
    $("#compliance-dialog-body").innerHTML = `
      <div class="compliance-dialog-summary"><div><span>Total cards</span><strong>${result.total}/100</strong></div><div><span>Game Changers</span><strong>${result.selectedGameChangers.length}</strong></div><div><span>Land / other</span><strong>${result.types.Land || 0} / ${result.total - (result.types.Land || 0)}</strong></div></div>
      ${tier ? `<section class="compliance-result-block ${violations.length ? "has-issues" : "passes"}"><h3>${violations.length ? "Non-Compliant on tracked rules" : "Compliant on tracked rules"}</h3>${violations.length ? `<ul>${violations.map((issue) => `<li><b>Deck ${variant.deckId} · ${esc(issue.card)}</b><span>${esc(issue.rule)}</span><small>${esc(issue.detail)}</small></li>`).join("")}</ul>` : `<p>No modeled card or deck-construction violations were found for Tier ${tier}.</p>`}</section>` : ""}
      <section class="composition-breakdown"><h3>Deck composition</h3><div>${breakdown}</div>${result.compositionWarnings.map((warning) => `<p>${icon("!")}<span>${esc(warning)}</span></p>`).join("")}</section>
      <section class="manual-checks"><h3>Manual checks still required</h3><ul><li>Commander color identity and the current banned list.</li><li>Untagged combo interactions, repeated extra turns, and mass-land-denial play patterns.</li><li>Whether the deck’s intent and likely win turn match the pod: about turn 8+ for Tier 2 or turn 6+ for Tier 3.</li></ul><p>The official bracket guidance emphasizes that intent and table expectations cannot be reduced to a card-count calculator.</p></section>`;
    dialog.showModal();
  }

  function enhancementImpact(item) {
    const power = Number(item?.brief?.power);
    const evidence = [item?.whyPrimary, item?.whyOptional, item?.why, item?.purpose, item?.brief?.fit, item?.brief?.value]
      .filter(Boolean).join(" ").toLowerCase();
    if (/no (meaningful |material )?improvement|sidegrade|personal preference|edge preference|flavou?r choice|alternate art|cosmetic|niche meta/.test(evidence)) {
      return {key: "edge", label: "Preference-driven or no clear power improvement"};
    }
    if (power >= 4 || /biggest improvement|major improvement|core engine|primary finisher|doubles (every|all)|transformative upgrade/.test(evidence)) {
      return {key: "big", label: "Big improvement"};
    }
    if (power === 3 || /strong improvement|meaningful improvement|reliable (draw|removal|protection|ramp|recursion)|excellent (draw|removal|protection|ramp|recursion)/.test(evidence)) {
      return {key: "good", label: "Good improvement"};
    }
    return {key: "moderate", label: "Moderate or situational improvement"};
  }

  function buySection(title, note, items, kind, current, variantId) {
    if (!items?.length) return "";
    const included = kind === "precon";
    const glyph = kind === "precon" ? "▣" : kind === "tuned" ? "✓" : kind === "upgrade" ? "↗" : kind === "enhance" ? "+" : "✦";
    const checkedCount = included ? items.length : items.filter((item) => (current[kind] || []).includes(item.id)).length;
    return `<details class="buy-section" data-ui-key="buysec-${esc(variantId)}-${esc(kind)}" ${included ? "open" : ""}>
      <summary><span>${icon(glyph)}${esc(title)} <b title="${checkedCount} of ${items.length} checked to buy">${checkedCount}/${items.length}</b></span><small>${esc(note)}</small></summary>
      ${items.map((item) => {
        const required = included;
        const checked = required || (current[kind] || []).includes(item.id);
        const impact = kind === "enhance" ? enhancementImpact(item) : null;
        const replacement = item.replaces ? `<span class="replacement-line"><b${impact ? ` class="replace-impact impact-${impact.key}" title="${esc(impact.label)}" aria-label="Replaces — ${esc(impact.label)}"` : ""}>Replaces</b><span>${esc(item.replaces)}</span></span>` : "";
        const summaryCopy = kind === "max" ? (item.maxReason || item.purpose || item.typeLine || "") : (item.purpose || item.typeLine || "");
        return `<div class="buy-item" ${buyRowAttributes(item, checked)}>
          ${required ? `<span class="required-check" aria-label="Included">✓</span>` : `<input type="checkbox" ${checked ? "checked" : ""} data-buy-kind="${esc(kind)}" data-item-id="${esc(item.id)}" data-variant-id="${esc(variantId)}" aria-label="Include ${esc(item.name)} in the final deck">`}
          <button class="buy-item-detail" type="button" data-item-kind="${esc(kind)}" data-item-id="${esc(item.id)}">
            <img src="${esc(item.image)}" alt="" loading="lazy">
            <span class="buy-copy">
              <span class="buy-item-eyebrow"><span class="kind-label ${esc(kind)}">${esc(kind)}</span>${item.ownedExtra ? `<span class="owned-mini">✓ Owned</span>` : ""}${item.temporaryUntil ? `<span class="temp-mini">Temp until ${esc(item.temporaryUntil)}</span>` : ""}${item.gameChanger ? `<span class="gc-mini">✦ Game Changer</span>` : ""}</span>
              <strong>${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</strong>
              ${replacement}<small>${esc(summaryCopy)}</small>
            </span>
          </button>
          <span class="price">${money(cardPriceBounds(item, cardMetadata[itemKey(item)] || {}).price)}</span>
        </div>`;
      }).join("")}
    </details>`;
  }

  function transferCardSnapshot(card) {
    const keys = ["name", "manaCost", "typeLine", "oracleText", "keywords", "colorIdentity", "legalities", "commanderLegal", "rarity", "setName", "image", "price", "ceiling", "tcgplayerUrl", "tags", "purpose", "why", "whyPrimary", "brief", "gameChanger", "ownedExtra", "temporaryUntil"];
    return Object.fromEntries(keys.filter((key) => card[key] !== undefined).map((key) => [key, card[key]]));
  }

  function salvageMoveOption(card, sourceVariant) {
    if (!sourceVariant?.id || sourceVariant.id === "salvage" || card.isCommander || card.transferRecord || card.loanedTo || !cardAvailableFromSource(card, sourceVariant)) return null;
    const plan = buyCatalog.plans[sourceVariant.id];
    if (!plan) return null;
    const current = ensureBuyState(sourceVariant.id);
    const model = Lineup.buildModel(plan);
    const entry = model.byId.get(String(card.id)) || model.entries.find((candidate) => Lineup.normalizeName(candidate.item.name) === Lineup.normalizeName(card.name));
    if (!entry) return null;
    const active = Lineup.activeEntryForSlot(plan, current, entry.slotId);
    if (active?.id !== entry.id) return {entry, replacement: null, next: current, wasActive: false};
    let replacement = entry.kind === "shell" ? null : model.byId.get(entry.predecessorId);
    if (!replacement || replacement.id === entry.id || Number(replacement.item.quantity || 1) !== Number(entry.item.quantity || 1)) {
      const priorities = {tuned: 0, shell: 1, enhance: 2, upgrade: 2, max: 3};
      replacement = (model.groups.get(entry.slotId) || [])
        .filter((candidate) => candidate.id !== entry.id && Number(candidate.item.quantity || 1) === Number(entry.item.quantity || 1))
        .sort((a, b) => (priorities[a.kind] ?? 9) - (priorities[b.kind] ?? 9) || a.item.name.localeCompare(b.item.name))[0] || null;
    }
    if (!replacement) return null;
    const next = tentativeLineupChoice(plan, current, replacement.id, true);
    if (evaluateDeckCompliance(plan, next).tier3.length) return null;
    return {entry, replacement, next, wasActive: true};
  }

  function moveCardToSalvage(card, sourceVariant, option) {
    if (!option) return;
    if (option.wasActive) assignSelection(ensureBuyState(sourceVariant.id), option.next);
    removePriorPhysicalTransfer("deck", sourceVariant.id, option.entry.id, itemKey(card));
    state.liveSalvage ||= {};
    state.liveSalvage[itemKey(card)] = {
      card: transferCardSnapshot(card),
      reason: `Moved from Deck ${sourceVariant.deckId} · ${sourceVariant.name}`,
      sourceVariantId: sourceVariant.id,
      sourceEntryId: option.entry.id,
      movedAt: new Date().toISOString()
    };
    saveState(`${card.name} moved to Salvage`);
    showToast(option.wasActive ? `${card.name} moved to Salvage; ${option.replacement.item.name} is active instead.` : `${card.name} moved to Salvage.`);
  }

  function removePriorPhysicalTransfer(sourceKind, sourceVariantId, sourceEntryId, sourceCardKey) {
    Object.entries(state.liveTransfers || {}).forEach(([targetVariantId, records]) => {
      Object.entries(records || {}).forEach(([slotId, record]) => {
        const samePhysicalName = sourceCardKey && record.sourceCardKey === sourceCardKey;
        const same = samePhysicalName || (sourceKind === "salvage"
          ? record.sourceKind === "salvage" && record.sourceCardKey === sourceCardKey
          : record.sourceKind === "deck" && record.sourceVariantId === sourceVariantId && record.sourceEntryId === sourceEntryId);
        if (same) delete state.liveTransfers[targetVariantId][slotId];
      });
    });
  }

  function assignLiveTransfer(card, sourceVariant, option) {
    const sourceKind = sourceVariant?.id === "salvage" ? "salvage" : "deck";
    const sourceCardKey = itemKey(card);
    const sourceCards = sourceKind === "deck" ? configuredDeckCards(sourceVariant) : [];
    const sourceEntry = sourceCards.find((candidate) => candidate.id === card.id) || sourceCards.find((candidate) => itemKey(candidate) === sourceCardKey && candidate.lineupActive) || null;
    const sourceEntryId = sourceEntry?.id || card.id || sourceCardKey;
    removePriorPhysicalTransfer(sourceKind, sourceVariant?.id, sourceEntryId, sourceCardKey);
    const record = {
      id: `transfer-${option.targetVariant.id}-${option.targetSlotId}-${sourceCardKey}`,
      card: transferCardSnapshot(card),
      sourceKind,
      sourceVariantId: sourceKind === "deck" ? sourceVariant.id : null,
      sourceEntryId,
      sourceCardKey,
      sourceWasActive: Boolean(sourceEntry?.lineupActive),
      sourceOwned: true,
      replacesName: option.slotName,
      targetSlotId: option.targetSlotId,
      fitScore: option.fit.score,
      fitLabel: option.label,
      createdAt: new Date().toISOString()
    };
    transfersForVariant(option.targetVariant.id)[option.targetSlotId] = record;
    saveState(`${card.name} assigned to ${option.targetVariant.name}`);
    showToast(`${card.name} now fills ${option.slotName} in Deck ${option.targetVariant.deckId}.`);
  }

  function removeLiveTransfer(record, targetVariantId) {
    if (!record) return;
    const records = transfersForVariant(targetVariantId);
    const slot = Object.keys(records).find((slotId) => records[slotId]?.id === record.id) || record.targetSlotId;
    if (slot) delete records[slot];
    saveState(`${record.card.name} returned to ${record.sourceKind === "salvage" ? "Salvage" : "its source deck"}`);
    showToast(`${record.card.name} returned; the prior lineup card is active again.`);
  }

  function livePlacementMarkup(item, sourceVariant) {
    if (item.isCommander) return "";
    if (item.transferRecord) {
      return `<section class="detail-block live-placement-panel"><h3>Temporary assignment</h3><p>This card is filling the ${esc(item.lineupSlotName || item.transferRecord.replacesName)} slot from ${item.transferRecord.sourceKind === "salvage" ? "Salvage" : "another Live Deck"}.</p><button type="button" class="secondary-button" data-return-live-transfer="${esc(item.transferRecord.id)}">Return card and restore prior lineup choice</button></section>`;
    }
    if (item.loanRecord) {
      return `<section class="detail-block live-placement-panel"><h3>Loaned physical card</h3><p>This copy is assigned to ${esc(item.loanedTo || "another Live Deck")}. Return it before activating or assigning it elsewhere.</p><button type="button" class="secondary-button" data-return-live-transfer="${esc(item.loanRecord.id)}">Return this card to its source</button></section>`;
    }
    const owned = cardAvailableFromSource(item, sourceVariant);
    const options = owned ? transferCompatibility(item, sourceVariant) : [];
    const salvageOption = owned ? salvageMoveOption(item, sourceVariant) : null;
    const salvageAction = salvageOption ? `<button type="button" class="secondary-button" data-move-live-salvage>${salvageOption.wasActive ? `Move to Salvage · activate ${esc(salvageOption.replacement.item.name)}` : "Move this unused card to Salvage"}</button>` : "";
    if (!owned) return `<section class="detail-block live-placement-panel"><h3>Use in another Live Deck</h3><p>Mark this card Bought first; only physically available cards can be assigned or loaned.</p></section>`;
    if (!options.length) return `<section class="detail-block live-placement-panel"><h3>Use in another Live Deck</h3><p>No other selected deck has a legal, singleton-safe, Tier 3-clean one-for-one slot for this card right now.</p>${salvageAction}</section>`;
    return `<section class="detail-block live-placement-panel"><h3>Use in another Live Deck</h3><p>Suggestions are deterministic: Commander legality and colors first, then role, strategy, card type, mana value, physical availability, and whether the swap covers an unowned active card.</p><label class="live-placement-select"><span>Best compatible destination per deck</span><select data-live-placement-select>${options.map((option) => `<option value="${esc(`${option.targetVariant.id}|${option.targetSlotId}`)}">Deck ${option.targetVariant.deckId} · ${esc(option.cut ? `replace ${option.cut.name}` : `fill vacant ${option.slotName}`)} · ${esc(option.label)} ${option.fit.score}${option.wouldBeReady ? " · target ready after swap" : ""}${option.sourceWasActive ? " · source loses this copy" : ""}</option>`).join("")}</select></label><div class="live-placement-reasons" data-live-placement-reasons></div><div class="live-placement-actions"><button type="button" class="primary-button" data-assign-live-transfer>Assign temporarily</button>${salvageAction}</div></section>`;
  }

  function openBuyItemDetail(item, variant, kind) {
    item = resolvedBuyCard(item);
    const dialog = $("#detail-sheet");
    const brief = item.brief || {};
    const plan = buyCatalog.plans[variant.id];
    const placementMarkup = kind === "precon" ? "" : livePlacementMarkup(item, variant);
    $("#detail-sheet-image").src = (cardImageCandidates(item)[0] || variant.image).replace("version=small", "version=normal").replace("/small/", "/normal/");
    $("#detail-sheet-image").alt = `${item.name} card`;
    $("#detail-sheet-kicker").textContent = `Deck ${variant.deckId} · ${kind === "tuned" ? "Tuned" : STAGES.includes(kind) ? kind : kind[0].toUpperCase() + kind.slice(1)}`;
    $("#detail-sheet-title").textContent = item.name;
    $("#detail-sheet-context").innerHTML = "";
    $("#detail-sheet-body").innerHTML = kind === "precon" ? `
      <div class="precon-facts">
        <div><span>Buy order</span><strong>#${esc(item.buyRank || plan?.buyRank || "—")} of 6</strong></div>
        <div><span>Strategy</span><strong>${esc(item.buyStrategy || plan?.buyStrategy || "Precon-first")}</strong></div>
        <div><span>Box target</span><strong>${money(item.price)}</strong></div>
        <div><span>Tuned total</span><strong>${money(item.allIn || plan?.allIn)}</strong></div>
        <div><span>Bracket</span><strong>${esc(plan?.bracketLabel || "—")}</strong></div>
        <div><span>Budget</span><strong>${esc(plan?.budgetLabel || "—")}</strong></div>
      </div>
      ${detailText("Why this deck", item.why || plan?.buyWhy || item.purpose)}
      ${detailText("How to buy it", item.buyFirst || plan?.buyFirst)}
      ${detailText("Commander note", item.commanderNote)}
      <section class="precon-plan-source">
        <div class="precon-plan-heading"><p>Complete source plan</p><h3>Everything from the original shopping guide</h3></div>
        <div class="legacy-plan">${plan?.planHtml || variant.detailHtml || "<p>No extended plan is available.</p>"}</div>
      </section>
      ${item.tcgplayerUrl ? `<p><a class="primary-button detail-link" href="${esc(item.tcgplayerUrl)}" target="_blank" rel="noopener">Find this precon on TCGplayer</a></p>` : ""}`
      : `
      <div class="item-meta">${item.manaCost ? `<span>${manaCostHtml(item.manaCost)}</span>` : ""}<span>${esc(item.typeLine || "")}</span><span>${money(item.price)}${item.ceiling ? ` · ceiling ${money(item.ceiling)}` : ""}</span></div>
      ${item.gameChanger ? `<p class="gc-callout">Game Changer · counts toward this deck’s limit of three in Bracket 3.</p>` : ""}
      ${item.temporaryUntil ? `<p class="temp-callout"><b>Temporary slot.</b> Use this owned card until you find ${esc(item.temporaryUntil)}.</p>` : ""}
      ${item.ownedExtra && !item.temporaryUntil ? `<p class="owned-callout">Already owned · this option costs nothing to test.</p>` : ""}
      ${item.maxReason ? detailText("Why this is Maxxed", item.maxReason) : ""}
      <div class="detail-quick-grid">
        <section class="detail-quick-box">${sectionIcon("does")}<span><b>Replaces</b>${item.replaces ? `<button type="button" class="related-card-link" data-related-card="${esc(item.replaces)}">${esc(item.replaces)} →</button>` : `<small>No card replaced</small>`}</span></section>
        <section class="detail-quick-box info-tip" data-tooltip="${esc(TOOLTIP_DEFINITIONS.roles)}" tabindex="0" aria-describedby="info-tooltip">${sectionIcon("roles")}<span><b>Roles</b><small>${item.tags?.length ? esc(item.tags.join(" · ")) : "General deck support"}</small></span>${tooltipHint()}</section>
        <section class="detail-quick-box info-tip" data-tooltip="${esc(TOOLTIP_DEFINITIONS.whereBuy)}" tabindex="0" aria-describedby="info-tooltip">${sectionIcon("buyLocation")}<span><b>Where to buy</b><small>${esc(item.whereToBuy || "Ask vendor")}</small></span>${tooltipHint()}</section>
      </div>
      ${detailEffect("What this card does", standaloneCardEffect(item))}
      ${detailText("Why it is optional", usefulCardCopy(item.whyOptional))}
      ${detailText("Alternate rationale", usefulCardCopy(item.alternateReason))}
      ${detailText("Tradeoff", usefulCardCopy(item.alternateTradeoff))}
      ${(brief.power || brief.ease || brief.fun) ? `<section class="detail-block"><h3 ${tooltipAttributes(TOOLTIP_DEFINITIONS.cardScoring)}>${sectionIcon("scoring")}Card scoring${tooltipHint()}</h3><div class="brief-scores">
        ${briefScore("Power", brief.power)}${briefScore("Ease", brief.ease)}${briefScore("Fun", brief.fun)}
      </div><div class="brief-insights">${brief.value ? `<p ${tooltipAttributes(TOOLTIP_DEFINITIONS.value)}>${sectionIcon("value")}<span><b>Value</b>${esc(brief.value)}</span>${tooltipHint()}</p>` : ""}<p ${tooltipAttributes(TOOLTIP_DEFINITIONS.fit)}>${sectionIcon("fit")}<span><b>Fit</b>${esc(standaloneCardFit(item, plan))}</span>${tooltipHint()}</p></div></section>` : ""}
      ${placementMarkup}
      ${item.tcgplayerUrl ? `<p><a class="primary-button detail-link" href="${esc(item.tcgplayerUrl)}" target="_blank" rel="noopener">Search this card on TCGplayer</a></p>` : ""}`;
    decorateRichContent($("#detail-sheet-body"), variant);
    $("[data-related-card]", $("#detail-sheet-body"))?.addEventListener("click", (event) => {
      const replacementName = event.currentTarget.dataset.relatedCard;
      const relatedItems = [...(plan?.startingShell || []), ...(plan?.required || []), ...(plan?.enhance || []), ...(plan?.max || [])];
      const related = relatedItems.find((candidate) => itemKey(candidate) === itemKey({name: replacementName}));
      if (related) openBuyItemDetail({...related, whereToBuy: related.whereToBuy || "Already in the starting shell"}, variant, "starting shell");
      else showToast(`${replacementName} is not available in this modeled shell.`);
    });
    const placementSelect = $("[data-live-placement-select]", $("#detail-sheet-body"));
    const placementButton = $("[data-assign-live-transfer]", $("#detail-sheet-body"));
    if (placementSelect && placementButton) {
      const options = transferCompatibility(item, variant);
      const selectedOption = () => {
        const [targetId, slotId] = placementSelect.value.split("|");
        return options.find((option) => option.targetVariant.id === targetId && option.targetSlotId === slotId);
      };
      const updateReasons = () => {
        const option = selectedOption();
        const reasons = $("[data-live-placement-reasons]", $("#detail-sheet-body"));
        if (!option || !reasons) return;
        const roleCopy = option.fit.sharedRoles.length ? `${option.fit.sharedRoles.slice(0, 3).join(" + ")} role match` : "broad support role";
        reasons.innerHTML = `<span>Commander legal + color legal</span><span>${esc(roleCopy)}</span><span>${esc(option.fit.cardType)} → ${esc(option.fit.cutType)}</span><span>Mana value ${manaValueEstimate(item)} → ${option.cut ? manaValueEstimate(option.cut) : "vacancy"}</span>${option.cut && !option.cut.bought ? "<span>Covers an unowned active card</span>" : ""}${option.sourceWasActive ? "<span>Source deck must replace this copy</span>" : ""}${option.wouldBeReady ? "<span>Target becomes ready to play</span>" : `<span>${option.projectedReadiness.purchaseItems} target purchase item${option.projectedReadiness.purchaseItems === 1 ? "" : "s"} still needed</span>`}`;
        placementButton.textContent = option.cut ? `Assign · replace ${option.cut.name}` : `Assign · fill ${option.slotName}`;
      };
      placementSelect.addEventListener("change", updateReasons);
      placementButton.addEventListener("click", () => {
        const option = selectedOption();
        if (!option) return;
        assignLiveTransfer(item, variant, option);
        dialog.close();
        if ($("#view-live")?.classList.contains("is-active")) renderLiveDecks();
      });
      updateReasons();
    }
    $("[data-return-live-transfer]", $("#detail-sheet-body"))?.addEventListener("click", () => {
      const record = item.transferRecord || item.loanRecord;
      removeLiveTransfer(record, item.transferRecord ? variant.id : record?.targetVariantId);
      dialog.close();
      if ($("#view-live")?.classList.contains("is-active")) renderLiveDecks();
    });
    $("[data-move-live-salvage]", $("#detail-sheet-body"))?.addEventListener("click", () => {
      const option = salvageMoveOption(item, variant);
      if (!option) {
        showToast("Choose a same-slot replacement before moving this active card to Salvage.");
        return;
      }
      moveCardToSalvage(item, variant, option);
      dialog.close();
      if ($("#view-live")?.classList.contains("is-active")) renderLiveDecks();
    });
    dialog.showModal();
  }

  function decorateRichContent(root, variant = null) {
    const sectionMap = [
      [/what this (build|card) does/i, "→", "forest", "does"], [/commander/i, "♛", "forest"], [/rarity/i, "◇", "blue", "rarity"], [/precon seed/i, "▣", "gold", "buildCost"],
      [/key upgrades/i, "↗", "gold"], [/how it plays|how to play/i, "▶", "forest"], [/ratings|scoring/i, "✦", "blue", "scoring"],
      [/what keith said/i, "“", "gold"], [/room to grow/i, "↥", "forest", "roomGrow"], [/bracket/i, "B", "red"],
      [/buy order/i, "#", "gold"], [/trackers|counters needed/i, "◌", "blue"], [/notes/i, "◌", "blue", "notes"], [/pros/i, "+", "forest"],
      [/cons/i, "−", "red"], [/strengths/i, "◆", "forest"], [/weaknesses/i, "!", "red"], [/value/i, "$", "gold", "value"], [/\bfit\b/i, "→", "blue", "fit"],
      [/stretch cards/i, "↗", "gold"], [/top of bracket/i, "✦", "red"], [/why/i, "→", "forest"],
      [/replaces/i, "⇄", "blue"], [/tradeoff/i, "±", "gold"], [/roles/i, "◆", "blue", "roles"], [/(where|how) to buy/i, "$", "gold", "buyLocation"]
    ];
    $$(".blk, .legacy-plan .panel, .detail-block", root).forEach((section) => {
      const heading = $("h3, h4", section);
      if (!heading) return;
      const match = sectionMap.find(([pattern]) => pattern.test(heading.textContent));
      section.classList.add("rich-section");
      section.dataset.tone = match?.[2] || "neutral";
      if (match && !$(".ui-icon, .section-icon", heading)) heading.insertAdjacentHTML("afterbegin", match[3] ? sectionIcon(match[3]) : icon(match[1]));
    });
    $$(".method", root).forEach((paragraph) => paragraph.classList.add("info-note"));
    $$(".flag", root).forEach((flag) => flag.classList.add("warning-note"));
    $$("ul", root).forEach((list) => list.classList.add("rich-list"));

    $$(".rich-section", root).forEach((section) => {
      const heading = $("h3, h4", section);
      if (!heading) return;
      const headingText = heading.textContent.trim();
      const standardDefinition = /room to grow/i.test(headingText) ? TOOLTIP_DEFINITIONS.roomGrow
        : /card scoring/i.test(headingText) ? TOOLTIP_DEFINITIONS.cardScoring
          : /^value$/i.test(headingText) ? TOOLTIP_DEFINITIONS.value
            : /^roles$/i.test(headingText) ? TOOLTIP_DEFINITIONS.roles
              : /(where|how) to buy/i.test(headingText) ? TOOLTIP_DEFINITIONS.whereBuy
                : /^fit$/i.test(headingText) ? TOOLTIP_DEFINITIONS.fit : "";
      if (!standardDefinition) return;
      const method = $(".method", section);
      applyTooltipWithHint(heading, method?.textContent.trim() || standardDefinition);
      if (method && /room to grow/i.test(headingText)) method.hidden = true;
    });

    $$(".sclbl", root).forEach((label) => {
      const fitGroup = label.nextElementSibling;
      const rows = fitGroup ? $$(".fr[title]", fitGroup) : [];
      const engine = label.classList.contains("eng") || /engine/i.test(label.textContent);
      const definitions = rows.map((row) => `${$(".fl", row)?.textContent.trim() || "Score"}: ${row.getAttribute("title")}`).join("\n");
      applyTooltipWithHint(label, `${engine ? TOOLTIP_DEFINITIONS.engine : TOOLTIP_DEFINITIONS.playstyle}\n\n${definitions}`);
    });
    $$(".fr[title]", root).forEach((row) => {
      const labelElement = $(".fl", row);
      const label = labelElement?.textContent.trim() || "Score";
      const definition = row.getAttribute("title");
      row.removeAttribute("title");
      applyTooltip(labelElement, `${label}: ${definition}`);
    });

    $$(".rich-section", root).forEach((section) => {
      const heading = $("h3, h4", section);
      if (!heading || !/how it plays|how to play/i.test(heading.textContent)) return;
      $$("p", section).forEach((paragraph) => {
        if (paragraph.textContent.trim().length < 120) return;
        const steps = paragraph.textContent.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
        if (steps.length < 2) return;
        const list = document.createElement("ol");
        list.className = "play-steps";
        list.innerHTML = steps.map((step) => `<li>${esc(step)}</li>`).join("");
        paragraph.replaceWith(list);
      });
    });

    if (variant) {
      const plan = buyCatalog.plans[variant.id];
      $$(".stretch-card, .b3-card", root).forEach((legacyCard) => {
        const nameNode = $(".sc-name", legacyCard);
        if (!nameNode || legacyCard.dataset.detailReady) return;
        const name = nameNode.textContent.replace(/GAME CHANGER/gi, "").trim();
        const allItems = [...(plan?.required || []), ...(plan?.upgrade || []), ...(plan?.enhance || []), ...(plan?.max || []), ...(plan?.startingShell || [])];
        const source = allItems.find((item) => item.name.toLowerCase() === name.toLowerCase());
        const fallback = {
          id: `legacy-${itemKey({name})}`,
          name,
          quantity: 1,
          image: `https://api.scryfall.com/cards/named?format=image&version=small&fuzzy=${encodeURIComponent(name)}`,
          purpose: $(".sc-why", legacyCard)?.textContent.trim() || "Open the card image and buying details.",
          replaces: $(".sc-replaces", legacyCard)?.textContent.replace(/^(replaces|swaps in for)\s*:?\s*/i, "").trim() || "",
          typeLine: "",
          manaCost: "",
          price: Number($(".sc-price", legacyCard)?.textContent.replace(/[^0-9.]/g, "")) || null,
          tags: [],
          brief: {}
        };
        const item = {...fallback, ...(source || {})};
        legacyCard.dataset.detailReady = "true";
        legacyCard.classList.add("legacy-card-link");
        legacyCard.tabIndex = 0;
        legacyCard.setAttribute("role", "button");
        legacyCard.setAttribute("aria-label", `View ${name} card details`);
        const open = (event) => {
          if (event.target.closest("a")) return;
          if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          openBuyItemDetail(item, variant, source?.category || (legacyCard.classList.contains("b3-card") ? "max" : "upgrade"));
        };
        legacyCard.addEventListener("click", open);
        legacyCard.addEventListener("keydown", open);
      });
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const manaNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (/\{[^}]+\}/.test(node.nodeValue) && !node.parentElement.closest(".mana-cost, script, style")) manaNodes.push(node);
    }
    manaNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const match of node.nodeValue.matchAll(/\{[^}]+\}/g)) {
        fragment.append(node.nodeValue.slice(cursor, match.index));
        const holder = document.createElement("span");
        holder.innerHTML = manaCostHtml(match[0]);
        fragment.append(...holder.childNodes);
        cursor = match.index + match[0].length;
      }
      fragment.append(node.nodeValue.slice(cursor));
      node.replaceWith(fragment);
    });
  }

  function detailText(title, value) {
    return value ? `<section class="detail-block"><h3>${esc(title)}</h3><p>${esc(value)}</p></section>` : "";
  }

  function detailEffect(title, value) {
    return value ? `<section class="detail-block card-effect-block"><h3>${esc(title)}</h3>${cardEffectHtml(value)}</section>` : "";
  }

  function briefScore(label, value) {
    if (!value) return "";
    const definition = TOOLTIP_DEFINITIONS[label.toLowerCase()] || `${label} is scored for this card in the selected deck.`;
    return `<div><span ${tooltipAttributes(definition, "score-label")}>${esc(label)}</span><b>${esc(value)}/5</b><span class="score-dots">${[1,2,3,4,5].map((dot) => `<i class="${dot <= value ? "is-on" : ""}"></i>`).join("")}</span></div>`;
  }

  function itemKey(item) {
    return String(item?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function cardImageCandidates(item, metadata = cardMetadata[itemKey(item)] || {}) {
    const named = (mode) => `https://api.scryfall.com/cards/named?format=image&version=small&${mode}=${encodeURIComponent(item.name)}`;
    return Array.from(new Set([metadata.image, item.image, named("exact"), named("fuzzy")].filter(Boolean)));
  }

  function derivedShopItems() {
    const merged = new Map();
    selectedVariants().forEach((variant) => {
      const plan = buyCatalog.plans[variant.id];
      if (!plan) return;
      const current = ensureBuyState(variant.id);
      const selectedTuned = new Set(current.tuned || []);
      const selectedEnhance = new Set(current.enhance || []);
      const selectedUpgrade = new Set(current.upgrade || []);
      const selectedMax = new Set(current.max || []);
      const selectedShell = new Set(current.shell || []);
      const shellPurchases = isSinglesBuiltShell(plan)
        ? (plan.startingShell || []).filter((item) => !item.isFlexibleSlot && selectedShell.has(item.id)).map((item) => ({
            ...resolvedShellCard(item),
            category: "shell",
            stage: "Starting Shell",
            purpose: "Required single for this constructed Starting Shell.",
            whereToBuy: "Singles case"
          }))
        : [];
      const items = [
        ...(isSinglesBuiltShell(plan) ? shellPurchases : [plan.precon]),
        ...(plan.required || []).filter((item) => selectedTuned.has(item.id)),
        ...(plan.upgrade || []).filter((item) => selectedUpgrade.has(item.id)),
        ...plan.enhance.filter((item) => selectedEnhance.has(item.id)),
        ...plan.max.filter((item) => selectedMax.has(item.id))
      ];
      items.forEach((item) => {
        const key = itemKey(item);
        if (!merged.has(key)) {
          merged.set(key, {...item, key, deckRefs: [], categories: new Set(), levels: new Set(), quantity: 0});
        }
        const target = merged.get(key);
        if (!target.deckRefs.some((ref) => ref.deckId === variant.deckId)) {
          target.deckRefs.push({deckId: variant.deckId, name: variant.name});
          target.quantity += item.quantity || 1;
        }
        target.categories.add(item.category);
        if (item.stage) target.levels.add(String(item.stage).toLowerCase());
        target.levels.add(item.category === "max" ? "maxxed" : item.category);
      });
    });
    return Array.from(merged.values()).sort((a, b) => {
      if (a.category === "precon" && b.category !== "precon") return -1;
      if (b.category === "precon" && a.category !== "precon") return 1;
      return a.name.localeCompare(b.name);
    });
  }

  function shoppingLocation(price) {
    const value = Number(price) || 0;
    if (value > 15) return "Case";
    if (value >= 5) return "Binder";
    if (value > 1) return `$${Math.min(6, Math.max(1, Math.ceil(value)))} sleeves`;
    return "Bin";
  }

  const LIVE_FILTER_DEFAULTS = {
    query: "",
    status: "all",
    lineup: "all",
    source: "all",
    category: "all",
    cardType: "all",
    color: "all",
    price: "all",
    rarity: "all",
    location: "all",
    sort: "default",
    groupBy: "status",
    subgroupBy: "typeLine"
  };
  const LIVE_TYPE_ORDER = ["Commander", "Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Other"];
  const LIVE_GROUP_OPTIONS = [
    ["none", "No grouping"],
    ["status", "Bought / To Buy"],
    ["lineup", "Active / Bench"],
    ["where", "Where to look"],
    ["rarity", "Rarity"],
    ["price", "Price range"],
    ["typeLine", "Card type"],
    ["themeSet", "Theme / set"],
    ["deckCount", "# of decks"],
    ["level", "Build level"]
  ];

  function ensureLiveFilters(variantId) {
    state.liveFilters ||= {};
    state.liveFilters[variantId] = {...LIVE_FILTER_DEFAULTS, ...(state.liveFilters[variantId] || {})};
    if (state.liveFilters[variantId].groupBy === state.liveFilters[variantId].subgroupBy) state.liveFilters[variantId].subgroupBy = "none";
    return state.liveFilters[variantId];
  }

  function transfersForVariant(variantId) {
    state.liveTransfers ||= {};
    state.liveTransfers[variantId] ||= {};
    return state.liveTransfers[variantId];
  }

  function liveTransferItems(variantId) {
    return Object.values(transfersForVariant(variantId)).map((record) => ({
      ...record.card,
      id: record.id,
      replaces: record.replacesName,
      transferRecord: record,
      quantity: 1,
      category: "transfer"
    }));
  }

  function allLiveTransfers() {
    return Object.entries(state.liveTransfers || {}).flatMap(([targetVariantId, records]) => Object.values(records || {}).map((record) => ({...record, targetVariantId})));
  }

  // Live Decks tracks which cards are active independently of Buy Picks' one-choice-per-slot
  // model: each card is its own on/off switch here, seeded once from whatever Buy Picks had
  // selected so existing lineups aren't lost, then fully free-form from that point on.
  function ensureLiveActiveMap(variant, activeIds) {
    state.liveActive ||= {};
    if (!state.liveActive[variant.id]) {
      const seed = {};
      activeIds.forEach((id) => { seed[id] = true; });
      state.liveActive[variant.id] = seed;
    }
    return state.liveActive[variant.id];
  }

  function configuredDeckCards(variant, selectionOverride = null, excludedTransferSlots = new Set()) {
    const plan = buyCatalog.plans[variant.id];
    if (!plan) return [];
    const current = selectionOverride || ensureBuyState(variant.id);
    const transferItems = liveTransferItems(variant.id).filter((item) => !excludedTransferSlots.has(item.transferRecord?.targetSlotId));
    const model = Lineup.buildModel(plan, transferItems);
    const activeIds = new Set(Lineup.selectedEntries(plan, current).map((entry) => entry.id));
    const transferSlots = new Set(model.entries.filter((entry) => entry.kind === "transfer").map((entry) => entry.slotId));
    // A selectionOverride means this is a Buy Picks what-if projection, not the real Live Decks
    // render — keep that path on the slot-exclusive model so its compliance pre-check still
    // reflects the hypothetical choice being tested, instead of the persisted live toggles.
    const liveActive = selectionOverride ? null : ensureLiveActiveMap(variant, activeIds);
    const levelByKind = {
      shell: ["shell", "Starting Shell"],
      tuned: ["tuned", "Tuned"],
      upgrade: ["enhance", "Enhance"],
      enhance: ["enhance", "Enhance"],
      max: ["maxxed", "Maxxed"],
      transfer: ["transfer", "Temporary loan"]
    };
    return model.entries.filter((entry) => !entry.item.isFlexibleSlot).map((entry) => {
      const [level, label] = levelByKind[entry.kind] || ["shell", "Starting Shell"];
      const resolved = resolvedBuyCard(entry.item);
      return {
        ...resolved,
        id: entry.id,
        quantity: Number(entry.item.quantity || 1),
        typeLine: entry.item.typeLine || resolved.typeLine,
        isCommander: Boolean(entry.item.isCommander),
        fromShell: entry.kind === "shell",
        liveLevel: level,
        liveLevelLabel: label,
        lineupActive: entry.kind === "transfer" ? true : liveActive ? Boolean(liveActive[entry.id]) : activeIds.has(entry.id) && !transferSlots.has(entry.slotId),
        lineupSlotId: entry.slotId,
        lineupSlotName: entry.root?.name || entry.item.name,
        lineupPredecessorId: entry.predecessorId,
        transferRecord: entry.item.transferRecord || null,
        colorIdentity: resolved.colorIdentity || entry.item.colorIdentity || []
      };
    }).sort((a, b) => Number(b.lineupActive) - Number(a.lineupActive) || Number(b.isCommander) - Number(a.isCommander) || shellType(a).localeCompare(shellType(b)) || a.name.localeCompare(b.name));
  }

  function pruneOrphanTransfers() {
    const selectedIds = new Set(selectedVariants().map((variant) => variant.id));
    let changed = false;
    Object.keys(state.liveTransfers || {}).forEach((targetVariantId) => {
      if (!selectedIds.has(targetVariantId)) {
        delete state.liveTransfers[targetVariantId];
        changed = true;
      }
    });
    if (changed) saveState("Loans to inactive variants returned");
  }

  function liveInventoryCounts(entries) {
    const loose = new Map();
    Object.entries(state.found || {}).forEach(([key, bought]) => {
      if (!bought) return;
      loose.set(key, Math.max(1, Number(state.boughtQuantities?.[key] || 1)));
    });
    (buyCatalog.ownedExtras || []).forEach((name) => {
      const key = itemKey({name});
      loose.set(key, Math.max(1, loose.get(key) || 0));
    });
    const boxes = new Map();
    entries.forEach(({plan}) => {
      if (isSinglesBuiltShell(plan) || !state.found[itemKey(plan.precon)]) return;
      (plan.startingShell || []).filter((card) => !card.isFlexibleSlot).forEach((card) => {
        const key = itemKey(card);
        boxes.set(key, (boxes.get(key) || 0) + Math.max(1, Number(card.quantity || 1)));
      });
    });
    const inventory = new Map(loose);
    boxes.forEach((quantity, key) => inventory.set(key, Math.max(quantity, inventory.get(key) || 0)));
    return inventory;
  }

  function buildLiveEntries() {
    pruneOrphanTransfers();
    const entries = selectedVariants().map((variant) => ({variant, plan: buyCatalog.plans[variant.id], cards: configuredDeckCards(variant)})).filter((entry) => entry.plan);
    const sharedDecks = new Map();
    entries.forEach(({variant, cards}) => {
      new Set(cards.filter((card) => card.lineupActive).map((card) => itemKey(card))).forEach((key) => {
        if (!sharedDecks.has(key)) sharedDecks.set(key, new Set());
        sharedDecks.get(key).add(variant.id);
      });
    });
    entries.forEach(({variant, plan, cards}) => cards.forEach((card) => {
      const bounds = cardPriceBounds(card, cardMetadata[itemKey(card)] || {});
      card.price = bounds.price;
      card.ceiling = bounds.ceiling;
      card.variantId = variant.id;
      card.deckId = variant.deckId;
      // Cards that arrive inside a sealed precon never carry their own purchase price.
      card.fromPreconBox = Boolean(card.fromShell && !isSinglesBuiltShell(plan));
      card.inSalvage = Boolean(state.liveSalvage?.[itemKey(card)] && state.liveSalvage[itemKey(card)].sourceVariantId === plan.variantId);
      card.sharedDeckCount = sharedDecks.get(itemKey(card))?.size || (card.lineupActive ? 1 : 0);
    }));

    const inventory = liveInventoryCounts(entries);
    const remaining = new Map(inventory);
    const shopDestinations = new Map(derivedShopItems().map((item) => [item.key, new Set(item.deckRefs.map((ref) => Number(ref.deckId)))]));
    const allocationPriority = ({variant, plan, card}) => {
      if (card.transferRecord) return 0;
      if (card.fromShell && !isSinglesBuiltShell(plan) && state.found[itemKey(plan.precon)]) return 1;
      if (shopDestinations.get(itemKey(card))?.has(Number(variant.deckId))) return 2;
      return 3;
    };
    const activeCards = entries.flatMap(({variant, plan, cards}) => cards.filter((card) => card.lineupActive).map((card) => ({variant, plan, card})))
      .sort((a, b) => allocationPriority(a) - allocationPriority(b) || Number(a.variant.deckId) - Number(b.variant.deckId) || a.card.name.localeCompare(b.card.name));
    activeCards.forEach(({card}) => {
      const key = itemKey(card);
      const needed = Math.max(1, Number(card.quantity || 1));
      const available = Math.min(needed, remaining.get(key) || 0);
      card.availableQuantity = available;
      card.bought = available >= needed;
      remaining.set(key, Math.max(0, (remaining.get(key) || 0) - available));
    });
    entries.forEach(({cards}) => cards.filter((card) => !card.lineupActive).forEach((card) => {
      const needed = Math.max(1, Number(card.quantity || 1));
      card.availableQuantity = Math.min(needed, remaining.get(itemKey(card)) || 0);
      card.bought = card.availableQuantity >= needed;
    }));

    const sourceRows = new Map(entries.flatMap(({variant, cards}) => cards.map((card) => [`${variant.id}:${card.id}`, {variant, card}])));
    const targetRows = new Map(entries.flatMap(({variant, cards}) => cards.filter((card) => card.transferRecord).map((card) => [card.transferRecord.id, {variant, card}])));
    allLiveTransfers().forEach((record) => {
      if (record.sourceKind !== "deck") return;
      const source = sourceRows.get(`${record.sourceVariantId}:${record.sourceEntryId}`)
        || entries.find(({variant}) => variant.id === record.sourceVariantId)?.cards.find((card) => itemKey(card) === record.sourceCardKey);
      const target = targetRows.get(record.id);
      if (!source) return;
      source.card.loanRecord = {...record, targetVariantId: record.targetVariantId};
      source.card.loanedTo = target ? `Deck ${target.variant.deckId} · ${target.variant.name}` : "another deck";
      source.card.loanBlocksSource = Boolean(source.card.lineupActive && !source.card.bought);
    });
    return entries;
  }

  function projectedEffectiveCards(variant, selection, excludedTransferSlots = new Set()) {
    return activeLiveCards(configuredDeckCards(variant, selection, excludedTransferSlots));
  }

  function liveColorKey(card) {
    const identity = new Set((card.colorIdentity || []).map((value) => String(value).toUpperCase()));
    if (!identity.size) {
      for (const match of String(card.manaCost || "").matchAll(/\{([^}]+)\}/g)) {
        for (const color of ["W", "U", "B", "R", "G"]) if (match[1].toUpperCase().includes(color)) identity.add(color);
      }
    }
    if (identity.size > 1) return "multicolor";
    return ({W: "white", U: "blue", B: "black", R: "red", G: "green"})[[...identity][0]] || "colorless";
  }

  function liveLocationKey(card) {
    const price = Number(cardPriceBounds(card, cardMetadata[itemKey(card)] || {}).price) || 0;
    if (price > 15) return "case";
    if (price >= 5) return "binder";
    if (price > 1) return "sleeves";
    return "bin";
  }

  function livePriceBand(card) {
    const price = Number(cardPriceBounds(card, cardMetadata[itemKey(card)] || {}).price) || 0;
    if (!price) return "unpriced";
    if (price <= 1) return "bin";
    if (price < 5) return "sleeves";
    if (price <= 15) return "binder";
    return "case";
  }

  function liveCardType(card) {
    if (card.isCommander) return "Commander";
    return ["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle"].find((type) => String(card.typeLine || "").includes(type)) || "Other";
  }

  const LIVE_ROLE_PATTERNS = {
    ramp: /add .*mana|search your library for .*land|treasure token|mana rock|extra mana/i,
    draw: /draw (?:a|one|two|three|that many|cards)|card advantage|look at the top/i,
    removal: /destroy target|exile target|counter target|deals? .*damage|return target .* hand|board wipe/i,
    protection: /hexproof|indestructible|phase out|protection from|can't be countered|ward/i,
    recursion: /return .* from your graveyard|cast .* from your graveyard|reanimate|reclamation/i,
    sacrifice: /sacrifice|dies|death trigger|aristocrat/i,
    lifegain: /gain .*life|lifelink|life total/i,
    counters: /\+1\/\+1 counter|-1\/-1 counter|proliferate|counter on/i,
    tokens: /create .* token|populate|token creature/i,
    graveyard: /graveyard|mill|dredge|discard a card/i,
    blink: /exile .* return .* battlefield|blink|flicker|enters the battlefield/i,
    defender: /defender|toughness rather than power|\bwall\b/i,
    landfall: /landfall|land enters|play an additional land|land card/i,
    equipment: /equipment|equipped|attach|equip cost/i,
    artifact: /artifact|thopter|construct|vehicle/i,
    enchantment: /enchantment|aura|constellation/i,
    combat: /attacks|combat damage|double strike|first strike|trample|vigilance/i,
    wipe: /destroy all|exile all|each creature|all creatures/i
  };

  function cardRoleSet(card) {
    const text = [card.name, card.typeLine, card.oracleText, card.purpose, card.why, card.whyPrimary, ...(card.tags || [])].join(" ");
    return new Set(Object.entries(LIVE_ROLE_PATTERNS).filter(([, pattern]) => pattern.test(text)).map(([role]) => role));
  }

  function manaValueEstimate(card) {
    if (Number.isFinite(Number(card.cmc))) return Number(card.cmc);
    let total = 0;
    const frontCost = String(card.manaCost || "").split(/\s*\/\/\s*/)[0];
    for (const match of frontCost.matchAll(/\{([^}]+)\}/g)) {
      const symbol = match[1].toUpperCase();
      if (/^\d+$/.test(symbol)) total += Number(symbol);
      else if (!["X", "Y", "Z"].includes(symbol)) total += 1;
    }
    return total;
  }

  function primaryCardType(card) {
    return ["Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Land"].find((type) => String(card.typeLine || "").includes(type)) || "Other";
  }

  function cardTypeFamily(card) {
    const type = primaryCardType(card);
    if (type === "Land") return "land";
    if (["Instant", "Sorcery"].includes(type)) return "spell";
    if (["Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"].includes(type)) return "permanent";
    return "other";
  }

  function cardAvailableFromSource(card, sourceVariant) {
    if (card.transferRecord || card.loanRecord || card.loanedTo) return false;
    if (sourceVariant?.id === "salvage") return true;
    if (typeof card.bought === "boolean") return card.bought;
    if (card.ownedExtra || state.found[itemKey(card)]) return Number(state.boughtQuantities?.[itemKey(card)] || 1) > 0;
    const plan = buyCatalog.plans[sourceVariant?.id];
    if (!plan) return false;
    const shell = (plan.startingShell || []).find((candidate) => candidate.id === card.id || itemKey(candidate) === itemKey(card));
    return Boolean(shell && !isSinglesBuiltShell(plan) && state.found[itemKey(plan.precon)]);
  }

  function identityFits(card, commander) {
    const allowed = new Set((commander?.colorIdentity || []).map((color) => String(color).toUpperCase()));
    return (card.colorIdentity || []).every((color) => allowed.has(String(color).toUpperCase()));
  }

  function transferFitScore(card, cut, targetVariant, sourceOwned) {
    const cardRoles = cardRoleSet(card);
    const cutRoles = cut ? cardRoleSet(cut) : new Set();
    const sharedRoles = [...cardRoles].filter((role) => cutRoles.has(role));
    const roleUnion = new Set([...cardRoles, ...cutRoles]);
    const roleScore = roleUnion.size ? 40 * sharedRoles.length / roleUnion.size : 10;
    const targetText = [targetVariant.name, targetVariant.commander, ...(targetVariant.mechanics || []), ...(targetVariant.summaries || []).flat()].join(" ");
    const targetRoles = new Set(Object.entries(LIVE_ROLE_PATTERNS).filter(([, pattern]) => pattern.test(targetText)).map(([role]) => role));
    const strategyMatches = [...cardRoles].filter((role) => targetRoles.has(role));
    const strategyScore = targetRoles.size ? Math.min(25, 25 * strategyMatches.length / Math.max(1, Math.min(targetRoles.size, 4))) : 5;
    const cardType = primaryCardType(card);
    const cutType = cut ? primaryCardType(cut) : cardType;
    const cardFamily = cardTypeFamily(card);
    const cutFamily = cut ? cardTypeFamily(cut) : cardFamily;
    const related = cardFamily === cutFamily && cardFamily !== "other";
    const typeScore = cardType === cutType ? 10 : related ? 5 : 0;
    const manaScore = cut ? Math.max(0, 10 - 2 * Math.abs(manaValueEstimate(card) - manaValueEstimate(cut))) : 7;
    const availabilityScore = sourceOwned ? 10 : 0;
    const flexibilityScore = Math.min(5, cardRoles.size);
    const shortageBonus = cut && !cut.bought ? 5 : 0;
    return {
      score: Math.min(100, Math.round(roleScore + strategyScore + typeScore + manaScore + availabilityScore + flexibilityScore + shortageBonus)),
      sharedRoles,
      cardType,
      cutType
    };
  }

  function transferCompatibility(card, sourceVariant) {
    if (!card || card.isCommander || card.transferRecord || card.loanRecord || card.loanedTo || Number(card.quantity || 1) !== 1) return [];
    const commanderStatus = card.legalities?.commander || (card.commanderLegal === false ? "not_legal" : "legal");
    if (commanderStatus !== "legal") return [];
    const sourceOwned = cardAvailableFromSource(card, sourceVariant);
    if (!sourceOwned) return [];
    const results = [];
    const liveEntries = buildLiveEntries();
    liveEntries.filter(({variant}) => variant.id !== sourceVariant?.id).forEach(({variant: targetVariant, plan, cards: candidates}) => {
      const active = activeLiveCards(candidates);
      const commander = active.find((candidate) => candidate.isCommander) || candidates.find((candidate) => candidate.isCommander);
      if (!commander || !identityFits(card, commander)) return;
      if (active.some((candidate) => Lineup.normalizeName(candidate.name) === Lineup.normalizeName(card.name))) return;
      const activeSlots = new Set(active.map((candidate) => candidate.lineupSlotId));
      const vacantSlots = Array.from(new Map(candidates.filter((candidate) => !activeSlots.has(candidate.lineupSlotId) && Number(candidate.quantity || 1) === 1).map((candidate) => [candidate.lineupSlotId, candidate])).values());
      const currentTotal = active.reduce((sum, candidate) => sum + Number(candidate.quantity || 1), 0);
      const cutChoices = currentTotal < 100
        ? vacantSlots.map((candidate) => ({cut: null, slotId: candidate.lineupSlotId, slotName: candidate.lineupSlotName, root: candidate}))
        : active.filter((candidate) => !candidate.isCommander && Number(candidate.quantity || 1) === 1 && !/\bBasic Land\b/i.test(candidate.typeLine || "")).map((candidate) => ({cut: candidate, slotId: candidate.lineupSlotId, slotName: candidate.lineupSlotName, root: candidate}));
      cutChoices.forEach(({cut, slotId, slotName}) => {
        const simulated = cut ? active.filter((candidate) => candidate !== cut) : [...active];
        simulated.push({...card, quantity: 1, lineupKind: "transfer", lineupSlotId: slotId, lineupSlotName: slotName});
        const compliance = evaluateDeckCompliance(plan, ensureBuyState(targetVariant.id), simulated);
        const nextTotal = simulated.reduce((sum, candidate) => sum + Number(candidate.quantity || 1), 0);
        const nonCountIssues = compliance.tier3.filter((issue) => issue.card !== "Deck list");
        if (nextTotal > 100 || nonCountIssues.length || (currentTotal >= 100 && (nextTotal !== 100 || compliance.tier3.length))) return;
        if (currentTotal < 100 && nextTotal <= currentTotal) return;
        const fit = transferFitScore(card, cut, targetVariant, sourceOwned);
        const curatedSalvage = sourceVariant?.id === "salvage" && (buyCatalog.salvage || []).some((candidate) => itemKey(candidate) === itemKey(card));
        if (curatedSalvage) fit.score = Math.min(fit.score, 49);
        if (fit.score < 35) return;
        const label = fit.score >= 70 ? "Strong fit" : fit.score >= 50 ? "Workable temporary" : "Emergency only";
        const projectedReadiness = liveDeckReadiness(plan, simulated, compliance);
        results.push({targetVariant, targetSlotId: slotId, slotName, cut, fit, label, sourceOwned, nextTotal, wouldBeReady: projectedReadiness.ready, projectedReadiness, sourceWasActive: Boolean(card.lineupActive)});
      });
    });
    const sorted = results.sort((a, b) => b.fit.score - a.fit.score || Number(Boolean(b.cut && !b.cut.bought)) - Number(Boolean(a.cut && !a.cut.bought)) || Number(a.targetVariant.deckId) - Number(b.targetVariant.deckId) || a.slotName.localeCompare(b.slotName));
    const seenDecks = new Set();
    return sorted.filter((option) => {
      if (seenDecks.has(option.targetVariant.id)) return false;
      seenDecks.add(option.targetVariant.id);
      return true;
    });
  }

  function matchesLiveFilters(card, filters) {
    if (filters.status === "bought" && !card.bought) return false;
    if (filters.status === "need" && card.bought) return false;
    if (filters.lineup === "active" && !card.lineupActive) return false;
    if (filters.lineup === "bench" && card.lineupActive) return false;
    if (filters.source === "shell" && !card.fromShell) return false;
    if (filters.source === "singles" && card.fromShell) return false;
    if (filters.category !== "all" && card.liveLevel !== filters.category) return false;
    if (filters.cardType !== "all" && liveCardType(card) !== filters.cardType) return false;
    if (filters.color !== "all" && liveColorKey(card) !== filters.color) return false;
    if (filters.price !== "all" && livePriceBand(card) !== filters.price) return false;
    const rarity = String(card.rarity || cardMetadata[itemKey(card)]?.rarity || "unknown").toLowerCase();
    if (filters.rarity !== "all" && rarity !== filters.rarity) return false;
    if (filters.location !== "all" && liveLocationKey(card) !== filters.location) return false;
    const query = filters.query.trim().toLowerCase();
    if (!query) return true;
    return [card.name, card.typeLine, card.liveLevelLabel, card.purpose, card.why, card.whyPrimary, card.replaces, card.tempUntil, ...(card.tags || [])].join(" ").toLowerCase().includes(query);
  }

  function sortLiveCards(cards, mode) {
    return [...cards].sort((a, b) => {
      if (mode === "az" || mode === "za") {
        const delta = a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"});
        return mode === "za" ? -delta : delta;
      }
      if (mode === "lowHigh" || mode === "highLow") {
        const aPrice = Number(a.price) > 0 ? Number(a.price) : null;
        const bPrice = Number(b.price) > 0 ? Number(b.price) : null;
        if (aPrice === null && bPrice !== null) return 1;
        if (bPrice === null && aPrice !== null) return -1;
        const delta = aPrice === null ? 0 : mode === "highLow" ? bPrice - aPrice : aPrice - bPrice;
        if (delta) return delta;
      }
      return Number(b.isCommander) - Number(a.isCommander) || LIVE_TYPE_ORDER.indexOf(liveCardType(a)) - LIVE_TYPE_ORDER.indexOf(liveCardType(b)) || a.name.localeCompare(b.name);
    });
  }

  function liveGroupDescriptor(card, mode) {
    const metadata = cardMetadata[itemKey(card)] || {};
    if (mode === "status") return {label: card.bought ? "Bought" : "To Buy", order: card.bought ? 1 : 0};
    if (mode === "lineup") return {label: card.lineupActive ? "Active 100" : "Bench options", order: card.lineupActive ? 0 : 1};
    if (mode === "where") {
      const labels = {bin: "Bin ($0–$1)", sleeves: `${shoppingLocation(card.price)} ($1–$5)`, binder: "Binder ($5–$15)", case: "Case ($15+)", unpriced: "Price unavailable"};
      const key = livePriceBand(card);
      return {label: labels[key] || shoppingLocation(card.price), order: ["bin", "sleeves", "binder", "case", "unpriced"].indexOf(key)};
    }
    if (mode === "rarity") {
      const rarity = String(card.rarity || metadata.rarity || "Unknown");
      const label = rarity === "Unknown" ? "Rarity loading / unknown" : rarity[0].toUpperCase() + rarity.slice(1);
      return {label, order: ["Common", "Uncommon", "Rare", "Mythic", "Special", "Bonus", "Rarity loading / unknown"].indexOf(label)};
    }
    if (mode === "price") {
      const labels = {bin: "Under $1", sleeves: "$1–$5", binder: "$5–$15", case: "$15+", unpriced: "Price unavailable"};
      const key = livePriceBand(card);
      return {label: labels[key], order: ["bin", "sleeves", "binder", "case", "unpriced"].indexOf(key)};
    }
    if (mode === "typeLine") {
      const label = liveCardType(card);
      return {label, order: LIVE_TYPE_ORDER.indexOf(label)};
    }
    if (mode === "themeSet") return {label: card.setName || metadata.setName || card.tags?.[0] || "Theme / set loading or unknown", order: 999};
    if (mode === "deckCount") return {label: `In ${card.sharedDeckCount || 1} live deck${card.sharedDeckCount === 1 ? "" : "s"}`, order: -(card.sharedDeckCount || 1)};
    if (mode === "level") return {label: card.liveLevelLabel || "Other", order: ["shell", "tuned", "enhance", "maxxed"].indexOf(card.liveLevel)};
    return {label: "Cards", order: 0};
  }

  function groupLiveCards(cards, mode) {
    const groups = new Map();
    cards.forEach((card) => {
      const descriptor = liveGroupDescriptor(card, mode);
      if (!groups.has(descriptor.label)) groups.set(descriptor.label, {label: descriptor.label, order: descriptor.order < 0 && mode !== "deckCount" ? 999 : descriptor.order, cards: []});
      groups.get(descriptor.label).cards.push(card);
    });
    return Array.from(groups.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }

  function liveFilterSelect(field, label, options, value, extra = "") {
    return `<label class="filter-select ${extra}"><span>${esc(label)}</span><select data-live-filter-select="${esc(field)}">${options.map(([option, text]) => `<option value="${esc(option)}" ${String(value) === String(option) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  }

  function liveToolbarMarkup(variant, filters) {
    const extraCount = ["lineup", "source", "category", "cardType", "color", "price", "rarity", "location"].filter((field) => filters[field] !== "all").length + (filters.sort !== "default" ? 1 : 0);
    const subgroupOptions = LIVE_GROUP_OPTIONS.filter(([value]) => value === "none" || value !== filters.groupBy);
    return `<div class="live-toolbar" data-live-toolbar="${esc(variant.id)}">
      <input class="search-input" type="search" value="${esc(filters.query)}" placeholder="Search this deck…" data-ui-focus="live-search-${esc(variant.id)}" aria-label="Search ${esc(variant.name)}">
      <div class="live-toolbar-row">
        <div class="status-chips" aria-label="Bought status">
          <button class="filter-chip${filters.status === "all" ? " is-active" : ""}" data-live-status="all">All</button>
          <button class="filter-chip${filters.status === "need" ? " is-active" : ""}" data-live-status="need">To Buy</button>
          <button class="filter-chip${filters.status === "bought" ? " is-active" : ""}" data-live-status="bought">Bought</button>
        </div>
        <div class="live-group-controls">
          ${liveFilterSelect("groupBy", "Group by", LIVE_GROUP_OPTIONS, filters.groupBy, "live-group-select")}
          ${liveFilterSelect("subgroupBy", "Then by", subgroupOptions, filters.subgroupBy, "live-group-select")}
          ${liveFilterSelect("profileStage", "Compare rating", [["1","Base"],["2","Tuned"],["3","Maxed"]], String(state.rankStages[variant.deckId] || 2), "live-profile-select")}
          <details class="more-filters live-more-filters" data-ui-key="livefilters-${esc(variant.id)}"><summary>Filters${extraCount ? ` <b>${extraCount}</b>` : ""}</summary><div class="filter-select-grid live-filter-grid">
            ${liveFilterSelect("lineup", "Lineup", [["all","Active + bench"],["active","Active 100"],["bench","Bench options"]], filters.lineup)}
            ${liveFilterSelect("source", "Source", [["all","All cards"],["shell","Starting shell"],["singles","Added singles"]], filters.source)}
            ${liveFilterSelect("category", "Level", [["all","All levels"],["shell","Starting Shell"],["tuned","Tuned"],["enhance","Enhance"],["maxxed","Maxxed"]], filters.category)}
            ${liveFilterSelect("cardType", "Card type", [["all","All types"], ...LIVE_TYPE_ORDER.map((type) => [type,type])], filters.cardType)}
            ${liveFilterSelect("color", "Color", [["all","All colors"],["white","White"],["blue","Blue"],["black","Black"],["red","Red"],["green","Green"],["multicolor","Multicolor"],["colorless","Colorless"]], filters.color)}
            ${liveFilterSelect("price", "Price", [["all","All prices"],["bin","Bin · $0–$1"],["sleeves","Sleeves · $1–$5"],["binder","Binder · $5–$15"],["case","Case · $15+"],["unpriced","Unpriced"]], filters.price)}
            ${liveFilterSelect("rarity", "Rarity", [["all","All rarities"],["common","Common"],["uncommon","Uncommon"],["rare","Rare"],["mythic","Mythic"],["unknown","Unknown"]], filters.rarity)}
            ${liveFilterSelect("location", "Location", [["all","All locations"],["bin","Bin"],["sleeves","Sleeves"],["binder","Binder"],["case","Case"]], filters.location)}
            ${liveFilterSelect("sort", "Sort", [["default","Deck order"],["az","Name: A → Z"],["za","Name: Z → A"],["lowHigh","Price: Low → High"],["highLow","Price: High → Low"]], filters.sort)}
          </div></details>
        </div>
      </div>
      <div class="live-results-summary" aria-live="polite"></div>
    </div>`;
  }

  function liveColorIdentityMarkup(cards, variant) {
    const commander = cards.find((card) => card.isCommander);
    const identity = new Set((commander?.colorIdentity || []).map((value) => String(value).toUpperCase()));
    if (!identity.size) {
      for (const match of String(variant.manaCost || "").matchAll(/\{([^}]+)\}/g)) for (const color of ["W", "U", "B", "R", "G"]) if (match[1].toUpperCase().includes(color)) identity.add(color);
    }
    const colors = ["W", "U", "B", "R", "G"].filter((color) => identity.has(color));
    const names = {W: "White", U: "Blue", B: "Black", R: "Red", G: "Green"};
    const symbol = (token, label) => `<img class="mana-symbol" src="https://svgs.scryfall.io/card-symbols/${encodeURIComponent(token)}.svg" alt="${esc(label)}" title="${esc(label)}">`;
    return colors.length ? colors.map((color) => symbol(color, names[color])).join("") : symbol("C", "Colorless");
  }

  const METRIC_META = {
    playstyle: {label: "Playstyle", blurb: TOOLTIP_DEFINITIONS.playstyle},
    engine: {label: "Engine", blurb: TOOLTIP_DEFINITIONS.engine},
    growth: {label: "Growth", blurb: TOOLTIP_DEFINITIONS.roomGrow}
  };

  const wideViewport = () => !window.matchMedia("(max-width: 860px)").matches;

  function metricAverage(rows) {
    if (!rows.length) return 0;
    return rows.reduce((sum, row) => sum + (Number(row.score) || 0), 0) / rows.length;
  }

  // The "why" behind a headline number: the sub-scores pulling it up and the ones holding it down.
  function metricDriverText(kind, rows) {
    const ranked = [...rows].sort((a, b) => Number(b.score) - Number(a.score));
    const strong = ranked.filter((row) => Number(row.score) >= 4).slice(0, 3);
    const weak = ranked.filter((row) => Number(row.score) <= 2).slice(-3).reverse();
    const lines = [];
    if (strong.length) lines.push(`Lifted by ${strong.map((row) => `${row.label} ${row.score}/5`).join(", ")}.`);
    if (weak.length) lines.push(`Pulled down by ${weak.map((row) => `${row.label} ${row.score}/5`).join(", ")}.`);
    if (!lines.length) lines.push("Every sub-score sits in the middle of the range, so nothing dominates this rating.");
    return `${METRIC_META[kind].blurb}\n\n${lines.join(" ")}`;
  }

  function metricBand(average) {
    if (average >= 4.2) return "is-high";
    if (average >= 3.2) return "is-good";
    if (average >= 2.2) return "is-mid";
    return "is-low";
  }

  function metricFamilyMarkup(kind, rows, panelId, defaultOpen = false) {
    if (!rows?.length) return "";
    const meta = METRIC_META[kind];
    const average = metricAverage(rows);
    const open = metricPanelState.has(panelId) ? metricPanelState.get(panelId) : defaultOpen;
    return `<span class="metric-family ${metricBand(average)}" data-metric="${esc(kind)}">
      <button type="button" class="metric-head info-tip tip-action" data-panel-toggle="${esc(panelId)}" aria-expanded="${open}" aria-controls="${esc(panelId)}" data-tooltip="${esc(metricDriverText(kind, rows))}" aria-describedby="info-tooltip">
        <span class="metric-name">${esc(meta.label)}</span>
        <span class="metric-average"><b>${average.toFixed(1)}</b><small>/5</small></span>
        <span class="metric-track"><i style="width:${Math.round(average / 5 * 100)}%"></i></span>
        <span class="metric-caret" aria-hidden="true">⌄</span>
      </button>
      <span class="metric-detail" id="${esc(panelId)}" ${open ? "" : "hidden"}>
        ${rows.map((row) => `<span class="metric-row">
          <span class="metric-row-head"><b>${esc(row.label)}</b><span class="metric-track is-row"><i style="width:${Math.round(Number(row.score || 0) / 5 * 100)}%"></i></span><strong>${esc(row.score)}<small>/5</small></strong>${row.extra ? `<em>${esc(row.extra)}</em>` : ""}</span>
          <span class="metric-row-copy">${esc(row.description || "Scored for this deck at this stage.")}</span>
        </span>`).join("")}
      </span>
    </span>`;
  }

  function disclosureMarkup(panelId, label, count, bodyHtml, tone = "") {
    const open = metricPanelState.get(panelId) === true;
    return `<span class="header-disclosure ${tone}">
      <button type="button" class="disclosure-head" data-panel-toggle="${esc(panelId)}" aria-expanded="${open}" aria-controls="${esc(panelId)}">
        <span class="disclosure-caret" aria-hidden="true">⌄</span><b>${esc(label)}</b>${count === null ? "" : `<i>${esc(count)}</i>`}
      </button>
      <span class="disclosure-panel" id="${esc(panelId)}" ${open ? "" : "hidden"}>${bodyHtml}</span>
    </span>`;
  }

  function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    metricPanelState.set(panelId, willOpen);
    $$(`[data-panel-toggle="${panelId.replace(/"/g, '\\"')}"]`).forEach((button) => button.setAttribute("aria-expanded", String(willOpen)));
  }

  function committedPrice(card) {
    const value = state.purchasePrices?.[itemKey(card)];
    const numeric = Number(value);
    return value !== undefined && value !== null && value !== "" && Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }

  // Only money actually committed counts. Estimated floor/ceiling ranges are deliberately excluded.
  function liveDeckTotalCost(cards) {
    const seen = new Set();
    let total = 0;
    cards.forEach((card) => {
      const key = itemKey(card);
      if (seen.has(key) || (card.fromPreconBox && !card.isCommander)) return;
      seen.add(key);
      const price = committedPrice(card);
      if (price !== null) total += price;
    });
    return total;
  }

  function liveDeckPricedCount(cards) {
    const seen = new Set();
    let priced = 0;
    let bought = 0;
    cards.forEach((card) => {
      const key = itemKey(card);
      if (seen.has(key) || (card.fromPreconBox && !card.isCommander) || !card.bought) return;
      seen.add(key);
      bought += 1;
      if (committedPrice(card) !== null) priced += 1;
    });
    return {priced, bought};
  }

  function activeLiveCards(cards) {
    return cards.filter((card) => card.lineupActive);
  }

  function liveDeckReadiness(plan, cards, compliance) {
    const active = activeLiveCards(cards);
    const total = active.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const borrowedOut = active.filter((card) => card.loanBlocksSource);
    const shellMissing = active.filter((card) => card.fromShell && !card.bought && !card.loanedTo);
    const singlesMissing = active.filter((card) => !card.fromShell && !card.bought && !card.loanedTo);
    const preconMissing = !isSinglesBuiltShell(plan) && shellMissing.length > 0 && !state.found[itemKey(plan.precon)];
    const missingCards = [...shellMissing, ...singlesMissing].reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const purchaseItems = singlesMissing.reduce((sum, card) => sum + Number(card.quantity || 1), 0)
      + (isSinglesBuiltShell(plan) ? shellMissing.reduce((sum, card) => sum + Number(card.quantity || 1), 0) : preconMissing ? 1 : 0);
    const pricedSingles = [...singlesMissing, ...(isSinglesBuiltShell(plan) ? shellMissing : [])];
    const floorTotal = pricedSingles.reduce((sum, card) => sum + (Number(card.price) || 0) * Number(card.quantity || 1), 0) + (preconMissing ? Number(plan.precon?.price || 0) : 0);
    const ceilingTotal = pricedSingles.reduce((sum, card) => sum + (Number(card.ceiling || card.price) || 0) * Number(card.quantity || 1), 0) + (preconMissing ? Number(plan.precon?.ceiling || plan.precon?.price || 0) : 0);
    const borrowedCards = borrowedOut.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const legal = total === 100 && compliance.tier3.length === 0;
    const ready = legal && missingCards === 0 && borrowedCards === 0;
    const benchMissing = cards.filter((card) => !card.lineupActive && !card.bought).length;
    let label;
    let insight;
    if (ready) {
      label = "Ready to play";
      insight = "100 legal cards are active and physically available.";
    } else if (!legal) {
      label = "Lineup incomplete";
      const issueCount = compliance.tier3.length;
      insight = `${total}/100 active${issueCount ? ` · ${issueCount} rules issue${issueCount === 1 ? "" : "s"}` : ""}. Fix the lineup before play.`;
    } else if (borrowedCards && missingCards) {
      label = "Needs cards + returns";
      insight = `${missingCards} active card${missingCards === 1 ? " is" : "s are"} still unavailable · ${purchaseItems} purchase item${purchaseItems === 1 ? "" : "s"} required to enter a game${floorTotal ? ` · ${money(floorTotal)}–${money(Math.max(floorTotal, ceilingTotal))}` : ""}; return or replace ${borrowedCards} loaned-out card${borrowedCards === 1 ? "" : "s"}.`;
    } else if (borrowedCards) {
      label = "Cards loaned out";
      insight = `${borrowedCards} active card${borrowedCards === 1 ? " is" : "s are"} assigned to another deck; replace or return ${borrowedCards === 1 ? "it" : "them"}.`;
    } else {
      label = "Needs purchases";
      insight = `${missingCards} active card${missingCards === 1 ? " is" : "s are"} unavailable · ${purchaseItems} purchase${purchaseItems === 1 ? "" : "s"} required to enter a game${floorTotal ? ` · ${money(floorTotal)}–${money(Math.max(floorTotal, ceilingTotal))}` : ""}.`;
    }
    return {active, total, missingCards, purchaseItems, borrowedCards, benchMissing, floorTotal, ceilingTotal, legal, ready, label, insight};
  }

  function liveDeckSummaryMarkup(variant, plan, cards, compliance, readiness, profileIndex) {
    const total = readiness.total;
    const boughtCount = Math.max(0, total - readiness.missingCards - readiness.borrowedCards);
    const toBuy = readiness.purchaseItems;
    const strategy = variant.summaries?.[profileIndex]?.[0] || variant.stageNotes?.[profileIndex] || "Final deck configuration";
    const typeChips = LIVE_TYPE_ORDER.filter((type) => type !== "Commander" && compliance.types[type]).map((type) => `<i><b>${compliance.types[type]}</b>${esc(type)}</i>`).join("");
    const playstyle = variant.scores?.playstyle?.[profileIndex] || [];
    const engine = variant.scores?.engine?.[profileIndex] || [];
    const growth = variant.scores?.growth || [];
    const tier3Pass = compliance.tier3.length === 0;
    const totalCost = liveDeckTotalCost(cards);
    const priced = liveDeckPricedCount(cards);
    const compositionBody = `<span class="disclosure-chips">${typeChips}</span><span class="disclosure-note">${total}/100 active cards · ${compliance.types.Land || 0} land · ${esc(readiness.insight)}</span>`;
    const mechanicsBody = `<span class="disclosure-chips">${(variant.mechanics || []).map((mechanic) => `<i>${esc(mechanic)}</i>`).join("")}</span>`;
    return `<summary class="live-deck-summary">
      <span class="live-deck-primary">
        <span class="deck-number">${variant.deckId}</span>
        <span class="live-deck-title"><strong>${esc(variant.name)}</strong><small>${esc(variant.commander)}</small></span>
        <span class="live-color-identity" aria-label="Commander color identity">${liveColorIdentityMarkup(readiness.active, variant)}</span>
        <span class="live-ready-badge ${readiness.ready ? "is-ready" : readiness.legal ? "needs-cards" : "not-ready"}" title="${esc(readiness.insight)}">${readiness.ready ? "✓" : "!"}<b>${esc(readiness.label)}</b></span>
        <span class="live-deck-chevron" aria-hidden="true">⌄</span>
      </span>
      <span class="live-deck-metrics">
        <i class="is-cost" data-live-total="${esc(variant.id)}" title="Sum of the prices you locked in for cards you own in this deck"><b>${money(totalCost) === "Price varies" ? "$0.00" : money(totalCost)}</b><small>Total cost · ${priced.priced}/${priced.bought} priced</small></i>
        <i><b>${boughtCount}/100</b><small>bought</small></i>
        <i><b>${total}/100</b><small>active</small></i>
        <i class="${toBuy ? "is-open" : ""}"><b>${toBuy}</b><small>to buy</small></i>
        <i class="${tier3Pass ? "passes" : "has-issues"}"><b>${compliance.selectedGameChangers.length}/3 GC</b><small>${tier3Pass ? "Tier 3 ✓" : "Review"}</small></i>
      </span>
      <span class="live-strategy"><b>Strategy</b><i>${esc(strategy)}</i></span>
      <span class="live-deck-disclosures">
        ${disclosureMarkup(`composition-${variant.id}`, "Deck Composition", total, compositionBody)}
        ${disclosureMarkup(`mechanics-${variant.id}`, "Core Mechanics", (variant.mechanics || []).length, mechanicsBody)}
      </span>
      <span class="live-metric-strip" aria-label="Compare rating · ${esc(STAGES[profileIndex])}">
        ${metricFamilyMarkup("playstyle", playstyle, `metric-playstyle-${variant.id}-live`)}
        ${metricFamilyMarkup("engine", engine, `metric-engine-${variant.id}-live`)}
        ${metricFamilyMarkup("growth", growth, `metric-growth-${variant.id}-live`)}
      </span>
    </summary>`;
  }

  function liveCardGlance(card) {
    const swap = card.tempUntil ? `Temp until ${card.tempUntil}` : card.replaces ? `Replaces ${String(card.replaces).replace(/^(replaces|swaps in for)\s+/i, "")}` : "";
    const roles = (card.tags || []).slice(0, 2).join(" · ");
    const purpose = usefulCardCopy(card.brief?.fit, card.whyPrimary, card.purpose, card.why, card.oracleText).split(/\n|(?<=[.!?])\s+/)[0];
    return [card.liveLevelLabel, swap || roles, purpose].filter(Boolean).join(" · ");
  }

  // Owned cards get a "what did you actually pay" field; sealed precon contents get a label;
  // everything still on the shopping list keeps the estimated floor-to-ceiling range.
  function livePriceMarkup(card, price, ceiling) {
    if (card.fromPreconBox && !card.isCommander) return `<small class="live-price-precon">Precon Pack</small>`;
    if (!card.bought) return `<small class="live-price-range">Floor ${price ? money(price) : "unpriced"} · Ceiling ${ceiling ? money(ceiling) : "not listed"}</small>`;
    const key = itemKey(card);
    const committed = committedPrice(card);
    return `<span class="live-price-entry${committed === null ? "" : " is-locked"}" data-paid-row="${esc(key)}">
      <span class="live-price-field"><b aria-hidden="true">$</b><input type="text" inputmode="decimal" autocomplete="off" value="${committed === null ? "" : esc(committed.toFixed(2))}" placeholder="0.00" data-paid-key="${esc(key)}" data-ui-focus="paid-${esc(key)}" aria-label="Price paid for ${esc(card.name)}"></span>
      <button type="button" class="live-price-commit" data-paid-commit="${esc(key)}" aria-label="Lock in the price paid for ${esc(card.name)}">✓</button>
    </span>`;
  }

  function makeLiveCardRow(card, variant) {
    const bounds = cardPriceBounds(card, cardMetadata[itemKey(card)] || {});
    const price = Number(bounds.price) || null;
    const ceiling = Number(bounds.ceiling) || null;
    const location = shoppingLocation(price);
    const row = document.createElement("article");
    row.className = `live-card-row${card.bought ? " is-bought" : " is-needed"}${card.lineupActive ? " is-lineup-active" : " is-lineup-bench"}`;
    const badges = [
      card.isCommander ? `<em class="live-card-badge is-commander">Commander</em>` : "",
      card.gameChanger ? `<em class="live-card-badge is-game-changer">Game Changer</em>` : "",
      card.transferRecord ? `<em class="live-card-badge is-temp">Borrowed</em>` : "",
      card.loanedTo ? `<em class="live-card-badge is-temp">Loaned out</em>` : "",
      card.inSalvage ? `<em class="live-card-badge is-temp">Salvage</em>` : "",
      card.tempUntil ? `<em class="live-card-badge is-temp">Temp</em>` : "",
      card.bought ? `<em class="live-card-badge is-owned">${card.lineupActive ? "Available" : "Owned"}</em>` : ""
    ].join("");
    const glance = `${card.lineupActive ? "Active 100" : `Bench for ${card.lineupSlotName}`} · ${liveCardGlance(card)}`;
    row.innerHTML = `<label class="live-lineup-radio" title="${card.lineupActive ? `Remove ${esc(card.name)} from this deck's active 100` : `Add ${esc(card.name)} to this deck's active 100`}"><input type="checkbox" ${card.lineupActive ? "checked" : ""} ${card.isCommander || card.transferRecord ? "disabled" : ""} aria-label="${card.lineupActive ? "Remove" : "Add"} ${esc(card.name)} in this deck's active 100"><span aria-hidden="true">✓</span></label><button type="button" class="live-card-main"><img src="${esc(card.image || cardMetadata[itemKey(card)]?.image || cardImageCandidates(card)[0])}" alt="" loading="lazy"><span class="live-card-copy"><span class="live-card-title-line"><b title="${esc(card.name)}">${esc(card.name)}${card.quantity > 1 ? ` ×${card.quantity}` : ""}</b>${badges}</span><small class="live-card-meta">${manaCostHtml(card.manaCost)}<span>${esc(card.typeLine || "Unclassified card")}</span></small><small class="live-card-glance" title="${esc(glance)}">${esc(glance)}</small></span></button><div class="live-card-status"><strong>${card.loanedTo ? card.loanBlocksSource ? `Loaned to ${esc(card.loanedTo)}` : card.lineupActive ? `Active copy available · another copy loaned to ${esc(card.loanedTo)}` : `Assigned to ${esc(card.loanedTo)}` : card.inSalvage ? "Salvage · inactive" : card.lineupActive ? card.bought ? "✓ Active · Bought" : `Active · To Buy · ${esc(location)}` : card.bought ? "Bench · Bought" : `Bench · ${esc(location)}`}</strong>${livePriceMarkup(card, price, ceiling)}${card.bought ? "" : `<a href="${esc(card.tcgplayerUrl || `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`)}" target="_blank" rel="noopener">TCGPlayer ↗</a>`}</div>`;
    // Each card is its own independent switch — no slot exclusivity, no automatic swaps
    // elsewhere, no legality gate. The compliance panel reads whatever this produces and
    // reports on it; it never blocks or reverts a toggle here.
    const activeToggle = $(".live-lineup-radio input", row);
    activeToggle?.addEventListener("change", () => {
      state.liveActive ||= {};
      state.liveActive[variant.id] ||= {};
      state.liveActive[variant.id][card.id] = activeToggle.checked;
      if (activeToggle.checked) {
        if (card.loanRecord) removePriorPhysicalTransfer("deck", variant.id, card.id, itemKey(card));
        delete transfersForVariant(variant.id)[card.lineupSlotId];
        if (state.liveSalvage?.[itemKey(card)]?.sourceVariantId === variant.id) {
          removePriorPhysicalTransfer("salvage", null, null, itemKey(card));
          delete state.liveSalvage[itemKey(card)];
        }
      }
      saveState(`${card.name} ${activeToggle.checked ? "added to" : "removed from"} ${variant.name}'s active 100`);
      renderLiveDecks();
    });
    $(".live-card-main", row).addEventListener("click", () => openBuyItemDetail(card, variant, card.fromShell ? "starting shell" : card.liveLevelLabel || "selected card"));
    return row;
  }

  function liveGroupStats(cards) {
    const total = cards.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const active = cards.filter((card) => card.lineupActive).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const toBuy = cards.filter((card) => card.lineupActive && !card.bought).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const target = cards.filter((card) => card.lineupActive && !card.bought).reduce((sum, card) => sum + (Number(card.price) || 0) * Number(card.quantity || 1), 0);
    return `${total} choice${total === 1 ? "" : "s"} · ${active} active · ${toBuy} active to buy${target ? ` · ${money(target)} target` : ""}`;
  }

  function appendLiveRows(container, cards, variant) {
    const list = document.createElement("div");
    list.className = "live-card-list";
    cards.forEach((card) => list.appendChild(makeLiveCardRow(card, variant)));
    container.appendChild(list);
  }

  function appendLiveGroups(container, cards, primary, secondary, variant) {
    groupLiveCards(cards, primary).forEach((group) => {
      const section = document.createElement("details");
      section.className = "live-card-group";
      section.dataset.uiKey = `livegrp-${variant.id}-${group.label}`;
      section.open = true;
      section.innerHTML = `<summary><strong>${esc(group.label)}</strong><span>${esc(liveGroupStats(group.cards))}</span></summary>`;
      if (secondary === "none") {
        appendLiveRows(section, group.cards, variant);
      } else {
        const subgroups = document.createElement("div");
        subgroups.className = "live-subgroups";
        groupLiveCards(group.cards, secondary).forEach((subgroup) => {
          const subsection = document.createElement("details");
          subsection.className = "live-card-subgroup";
          subsection.dataset.uiKey = `livesub-${variant.id}-${group.label}-${subgroup.label}`;
          subsection.open = true;
          subsection.innerHTML = `<summary><strong>${esc(subgroup.label)}</strong><span>${esc(liveGroupStats(subgroup.cards))}</span></summary>`;
          appendLiveRows(subsection, subgroup.cards, variant);
          subgroups.appendChild(subsection);
        });
        section.appendChild(subgroups);
      }
      container.appendChild(section);
    });
  }

  function renderLiveResults(details, cards, filters, variant) {
    const results = $(".live-results", details);
    const visible = sortLiveCards(cards.filter((card) => matchesLiveFilters(card, filters)), filters.sort);
    const quantity = visible.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const activeShown = visible.filter((card) => card.lineupActive).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const activeTotal = activeLiveCards(cards).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const activeNeeded = visible.filter((card) => card.lineupActive && !card.bought).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    $(".live-results-summary", details).innerHTML = `<span><strong>${quantity}</strong> choices shown · ${activeShown}/${activeTotal} active cards</span><span>${activeNeeded} active to buy · ${visible.filter((card) => !card.lineupActive).length} bench options</span>`;
    results.replaceChildren();
    if (!visible.length) {
      results.innerHTML = `<div class="empty-state live-filter-empty"><h3>No cards match</h3><p>Clear or change this deck’s filters.</p></div>`;
      return;
    }
    if (filters.groupBy === "none") appendLiveRows(results, visible, variant);
    else appendLiveGroups(results, visible, filters.groupBy, filters.subgroupBy, variant);
  }

  function renderLiveDecks() {
    withUiState("#view-live", renderLiveDecksView);
  }

  function renderLiveDecksView() {
    const root = $("#view-live");
    const variants = selectedVariants();
    const entries = buildLiveEntries();
    liveExportContext = entries.map(({variant, plan, cards}) => ({variant, plan, cards, filters: ensureLiveFilters(variant.id)}));
    root.innerHTML = `<div class="page-intro live-intro">
        <div class="live-intro-head">
          <h2 id="live-title">Live Decks</h2>
          <div class="live-intro-actions">
            <div class="selection-meter"><strong>${variants.length}</strong><span>live decks</span></div>
            <button type="button" class="secondary-button live-export" id="live-export"${entries.length ? "" : " disabled"}>Export checklist</button>
          </div>
        </div>
        <p class="live-intro-copy">Set each active 100 with the lineup radios, check legality and physical readiness, and record what you actually paid. Cards still on the list keep floor-to-ceiling guidance.</p>
      </div><div class="live-decks"></div>`;
    $("#live-export", root)?.addEventListener("click", exportLiveDecks);
    const host = $(".live-decks", root);
    if (!entries.length) {
      host.innerHTML = `<div class="empty-state"><h3>No live decks yet</h3><p>Select a deck in Compare and choose its final cards in Buy Picks.</p><button class="primary-button" data-go="compare">Choose decks</button></div>`;
      $("[data-go='compare']", host)?.addEventListener("click", () => switchView("compare"));
      appendLiveSalvage(host);
      return;
    }
    entries.forEach(({variant, plan, cards}) => {
      ensureShopMetadata(cards);
      const activeCards = activeLiveCards(cards);
      const compliance = evaluateDeckCompliance(plan, ensureBuyState(variant.id), activeCards);
      const readiness = liveDeckReadiness(plan, cards, compliance);
      const profileIndex = Number(state.rankStages[variant.deckId] || 2) - 1;
      const filters = ensureLiveFilters(variant.id);
      const details = document.createElement("details");
      details.className = "live-deck";
      details.dataset.variantId = variant.id;
      details.open = state.liveOpenDecks[variant.id] === undefined ? variant.deckId === openBuyDeckId : Boolean(state.liveOpenDecks[variant.id]);
      const longestName = Math.max(...cards.map((card) => `${card.name}${card.quantity > 1 ? ` ×${card.quantity}` : ""}`.length), 30);
      details.style.setProperty("--live-name-ch", `${Math.min(46, Math.max(30, longestName + 2))}ch`);
      details.innerHTML = `${liveDeckSummaryMarkup(variant, plan, cards, compliance, readiness, profileIndex)}<div class="live-deck-body">${liveToolbarMarkup(variant, filters)}<div class="live-results"></div></div>`;
      renderLiveResults(details, cards, filters, variant);
      const search = $(".live-toolbar .search-input", details);
      search.addEventListener("input", (event) => {
        filters.query = event.target.value;
        saveState();
        renderLiveResults(details, cards, filters, variant);
      });
      $$('[data-live-status]', details).forEach((button) => button.addEventListener("click", () => {
        filters.status = button.dataset.liveStatus;
        saveState();
        $$('[data-live-status]', details).forEach((peer) => peer.classList.toggle("is-active", peer === button));
        renderLiveResults(details, cards, filters, variant);
      }));
      $$('[data-live-filter-select]', details).forEach((select) => select.addEventListener("change", () => {
        const field = select.dataset.liveFilterSelect;
        if (field === "profileStage") {
          state.rankStages[variant.deckId] = Number(select.value);
        } else {
          filters[field] = select.value;
          if (field === "groupBy" && filters.subgroupBy === filters.groupBy) filters.subgroupBy = "none";
          if (field === "subgroupBy" && filters.subgroupBy === filters.groupBy) filters.subgroupBy = "none";
        }
        saveState();
        renderLiveDecks();
      }));
      details.addEventListener("toggle", () => {
        if (!details.isConnected) return;
        state.liveOpenDecks[variant.id] = details.open;
        saveState();
      });

      const refreshTotal = () => {
        const chip = $(`[data-live-total="${variant.id}"]`, details);
        if (!chip) return;
        const priced = liveDeckPricedCount(cards);
        const total = liveDeckTotalCost(cards);
        chip.innerHTML = `<b>${total > 0 ? money(total) : "$0.00"}</b><small>Total cost · ${priced.priced}/${priced.bought} priced</small>`;
      };
      const commitFrom = (input) => {
        if (!input) return;
        const key = input.dataset.paidKey;
        const raw = String(input.value || "").replace(/[^0-9.]/g, "");
        state.purchasePrices = state.purchasePrices || {};
        if (!raw) delete state.purchasePrices[key];
        else state.purchasePrices[key] = Math.round(Number(raw) * 100) / 100;
        const stored = state.purchasePrices[key];
        if (stored !== undefined) input.value = Number(stored).toFixed(2);
        cards.filter((card) => itemKey(card) === key).forEach((card) => { card.paidPrice = stored ?? null; });
        input.closest(".live-price-entry")?.classList.toggle("is-locked", stored !== undefined);
        saveState(stored === undefined ? "Purchase price cleared" : `Locked in ${money(stored)}`);
        refreshTotal();
      };
      details.addEventListener("click", (event) => {
        const commit = event.target.closest("[data-paid-commit]");
        if (!commit) return;
        event.preventDefault();
        event.stopPropagation();
        commitFrom($(`input[data-paid-key="${commit.dataset.paidCommit.replace(/"/g, '\\"')}"]`, details));
      });
      details.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || !event.target.matches("[data-paid-key]")) return;
        event.preventDefault();
        commitFrom(event.target);
      });
      details.addEventListener("focusout", (event) => {
        if (event.target.matches("[data-paid-key]")) commitFrom(event.target);
      });

      host.appendChild(details);
    });
    appendLiveSalvage(host);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function liveCardStatusText(card) {
    if (card.loanedTo) return card.loanBlocksSource ? `Loaned to ${card.loanedTo}` : `Copy loaned to ${card.loanedTo}`;
    if (card.inSalvage) return "Salvage · inactive";
    if (card.fromPreconBox) return card.bought ? "Owned · Precon Pack" : "Precon Pack · not opened";
    return card.bought ? "Owned" : "To buy";
  }

  // Exports exactly what is on screen: each deck, in its current grouping, with its current filters.
  function exportLiveDecks() {
    const header = ["Deck", "Deck name", "Group", "Subgroup", "Card", "Qty", "Type", "Mana cost", "Rarity", "Set", "Level", "Lineup", "Status", "Paid", "Floor", "Ceiling", "Checked"];
    const rows = [header];
    let cardCount = 0;
    liveExportContext.forEach(({variant, cards, filters}) => {
      const visible = sortLiveCards(cards.filter((card) => matchesLiveFilters(card, filters)), filters.sort);
      const emit = (card, group, subgroup) => {
        const metadata = cardMetadata[itemKey(card)] || {};
        const bounds = cardPriceBounds(card, metadata);
        const paid = committedPrice(card);
        cardCount += 1;
        rows.push([
          variant.deckId,
          variant.name,
          group,
          subgroup,
          card.name,
          Number(card.quantity || 1),
          card.typeLine || metadata.typeLine || "",
          String(card.manaCost || metadata.manaCost || "").replace(/[{}]/g, ""),
          metadata.rarity || "",
          metadata.setName || "",
          card.liveLevelLabel || "",
          card.lineupActive ? "Active 100" : `Bench · ${card.lineupSlotName || ""}`,
          liveCardStatusText(card),
          paid === null ? "" : paid.toFixed(2),
          card.fromPreconBox ? "" : bounds.price ? Number(bounds.price).toFixed(2) : "",
          card.fromPreconBox ? "" : bounds.ceiling ? Number(bounds.ceiling).toFixed(2) : "",
          card.bought ? "x" : ""
        ]);
      };
      if (filters.groupBy === "none") {
        visible.forEach((card) => emit(card, "All cards", ""));
      } else {
        groupLiveCards(visible, filters.groupBy).forEach((group) => {
          if (filters.subgroupBy === "none") group.cards.forEach((card) => emit(card, group.label, ""));
          else groupLiveCards(group.cards, filters.subgroupBy).forEach((sub) => sub.cards.forEach((card) => emit(card, group.label, sub.label)));
        });
      }
    });
    if (cardCount === 0) return showToast("Nothing to export with the current filters.");
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`﻿${csv}`], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `live-decks-inventory-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Exported ${cardCount} card${cardCount === 1 ? "" : "s"} to CSV.`);
  }

  function appendLiveSalvage(host) {
    const cards = allSalvageCards();
    if (!cards.length) return;
    const details = document.createElement("details");
    details.className = "live-deck salvage-live-deck";
    details.open = Boolean(state.liveOpenDecks?.salvage);
    details.innerHTML = `<summary class="live-deck-summary salvage-live-summary"><span class="live-deck-primary"><span class="deck-number">♲</span><span class="live-deck-title"><strong>Salvage</strong><small>${cards.length} owned cards · no current final-deck role</small></span><span class="live-deck-chevron" aria-hidden="true">⌄</span></span></summary><div class="live-card-list"></div>`;
    const list = $(".live-card-list", details);
    cards.forEach((card) => {
      const assignment = allLiveTransfers().find((record) => record.sourceKind === "salvage" && record.sourceCardKey === itemKey(card));
      const target = assignment ? variantById(assignment.targetVariantId) : null;
      const row = document.createElement("article");
      row.className = "live-card-row is-bought is-salvage";
      row.innerHTML = `<button type="button" class="live-card-main"><img src="${esc(card.image || cardImageCandidates(card)[0])}" alt="" loading="lazy"><span class="live-card-copy"><span class="live-card-title-line"><b>${esc(card.name)}</b><em class="live-card-badge is-owned">Owned</em>${assignment ? `<em class="live-card-badge is-temp">Assigned</em>` : ""}</span><small class="live-card-meta">${manaCostHtml(card.manaCost)}<span>${esc(card.typeLine || "")}</span></small><small class="live-card-glance">${esc(card.reason)}</small></span></button><div class="live-card-status"><strong>${assignment ? `Assigned to Deck ${target?.deckId || "?"}` : "Salvage · available"}</strong><small>${assignment ? `Filling ${esc(assignment.replacesName)} · open destination card to return` : "Owned card with no current final-deck role"}</small></div>`;
      $(".live-card-main", row).addEventListener("click", () => openBuyItemDetail({...card, bought: !assignment, loanRecord: assignment ? {...assignment, targetVariantId: assignment.targetVariantId} : null, loanedTo: target ? `Deck ${target.deckId} · ${target.name}` : assignment ? "another deck" : "", purpose: card.reason, why: card.reason, whereToBuy: "Already owned · Salvage shadow pile", brief: {fit: card.reason}}, {id: "salvage", deckId: "Salvage", image: card.image}, "salvage"));
      list.appendChild(row);
    });
    details.addEventListener("toggle", () => {
      if (!details.isConnected) return;
      state.liveOpenDecks.salvage = details.open;
      saveState();
    });
    host.appendChild(details);
  }

  function renderShop() {
    const root = $("#view-shop");
    const allItems = derivedShopItems();
    const filters = state.shopFilters;
    const foundCount = allItems.filter((item) => shopItemComplete(item)).length;
    const activeFilterCount = [filters.type, filters.category, filters.deck].filter((value) => value !== "all").length + (filters.groupBy !== "none" ? 1 : 0);
    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="shop-title">Shop List</h2>
          <p>A clean, deduplicated list for walking vendor tables. Mark purchases Bought; accessories never appear here.</p>
        </div>
        <div class="selection-meter"><strong>${foundCount}/${allItems.length}</strong><span>items bought</span></div>
      </div>
      <div class="shop-toolbar">
        <input class="search-input" id="shop-search" type="search" value="${esc(filters.query)}" placeholder="Search cards…" aria-label="Search shopping list">
        <div class="quick-filter-row" aria-label="Bought status">
          <div class="status-chips">${filterChip("status", "all", "All", filters)}${filterChip("status", "need", "Need", filters)}${filterChip("status", "found", "Bought", filters)}</div>
          <details class="more-filters">
            <summary>Filters${activeFilterCount ? ` <b>${activeFilterCount}</b>` : ""}</summary>
            <div class="filter-select-grid">
              ${selectFilter("type", "Items", [["all","All items"],["singles","Singles"],["precons","Precons"]], filters)}
              ${selectFilter("category", "Level", [["all","All levels"],["shell","Starting Shell"],["tuned","Tuned"],["enhance","Enhance"],["maxxed","Maxxed"]], filters)}
              ${selectFilter("deck", "Deck", [["all","All decks"], ...selectedVariants().map((variant) => [String(variant.deckId), `Deck ${variant.deckId}`])], filters)}
              ${selectFilter("groupBy", "Group by", [["none","No grouping"],["where","Where to look"],["rarity","Rarity"],["price","Price range"],["typeLine","Card type"],["themeSet","Theme / set"],["deckCount","# of decks"]], filters)}
            </div>
          </details>
        </div>
      </div>
      <div class="shop-summary" id="shop-summary"></div>
      <div class="shop-list" id="shop-list"></div>
      <div id="shop-actions"></div>`;

    updateShopResults(root);
    $("#shop-search", root).addEventListener("input", (event) => {
      state.shopFilters.query = event.target.value;
      saveState();
      updateShopResults(root);
    });
    $$('[data-filter]', root).forEach((button) => button.addEventListener("click", () => {
      state.shopFilters[button.dataset.filter] = button.dataset.value;
      saveState();
      renderShop();
    }));
    $$('[data-filter-select]', root).forEach((select) => select.addEventListener("change", () => {
      state.shopFilters[select.dataset.filterSelect] = select.value;
      saveState();
      renderShop();
    }));
    root.onclick = (event) => {
      if (event.target.closest('[data-go="buy"]')) switchView("buy");
    };
    ensureShopMetadata(allItems);
  }

  function filterChip(group, value, label, filters) {
    return `<button class="filter-chip${filters[group] === value ? " is-active" : ""}" data-filter="${esc(group)}" data-value="${esc(value)}">${esc(label)}</button>`;
  }

  function selectFilter(group, label, options, filters) {
    return `<label class="filter-select"><span>${esc(label)}</span><select data-filter-select="${esc(group)}">${options.map(([value, text]) => `<option value="${esc(value)}" ${filters[group] === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  }

  function updateShopResults(root) {
    const allItems = derivedShopItems();
    const visible = allItems.filter((item) => matchesFilters(item, state.shopFilters));
    const foundCount = allItems.filter((item) => shopItemComplete(item)).length;
    const remainingTotal = allItems.filter((item) => !shopItemComplete(item)).reduce((sum, item) => sum + (Number(item.price) || 0) * Number(item.quantity || 1), 0);
    $("#shop-summary", root).innerHTML = `<span><strong>${visible.length}</strong> shown · ${allItems.length - foundCount} still needed</span><span>${money(remainingTotal)} target</span>`;
    const list = $("#shop-list", root);
    list.classList.toggle("is-grouped", state.shopFilters.groupBy !== "none");
    if (state.shopFilters.groupBy === "none") {
      list.replaceChildren(...visible.map((item) => makeShopCard(item)));
    } else {
      const groups = groupShopItems(visible, state.shopFilters.groupBy);
      list.replaceChildren(...groups.map((group) => {
        const section = document.createElement("section");
        section.className = "shop-group";
        section.innerHTML = `<div class="shop-group-heading"><h3>${esc(group.label)}</h3><span>${group.items.length} item${group.items.length === 1 ? "" : "s"}</span></div><div class="shop-group-grid"></div>`;
        $(".shop-group-grid", section).replaceChildren(...group.items.map((item) => makeShopCard(item)));
        return section;
      }));
    }
    $("#shop-actions", root).innerHTML = allItems.length
      ? `<div class="action-row"><button class="secondary-button" data-go="buy">Adjust Buy Picks</button></div>`
      : `<div class="empty-state"><h3>Your field list is empty</h3><p>Select deck variants and save their Buy Picks first.</p><button class="primary-button" data-go="buy">Open Buy Picks</button></div>`;
  }

  function groupShopItems(items, mode) {
    const groups = new Map();
    items.forEach((item) => {
      const metadata = cardMetadata[itemKey(item)] || {};
      let label;
      let order = 999;
      if (mode === "where") label = item.whereToBuy || (item.category === "precon" ? "Sealed product shelf" : "Ask vendor / unknown");
      if (mode === "rarity") {
        label = item.category === "precon" ? "Sealed product / not applicable" : metadata.rarity ? metadata.rarity[0].toUpperCase() + metadata.rarity.slice(1) : "Rarity loading / unknown";
        order = ["Common", "Uncommon", "Rare", "Mythic", "Special", "Bonus", "Sealed product / not applicable", "Rarity loading / unknown"].indexOf(label);
      }
      if (mode === "price") {
        const price = Number(item.price);
        if (!price) {
          label = "Price unavailable";
        } else {
          const ranges = [[1,"Under $1"],[5,"$1–$5"],[10,"$5–$10"],[25,"$10–$25"],[50,"$25–$50"],[Infinity,"$50+"]];
          order = ranges.findIndex(([ceiling]) => price < ceiling || ceiling === Infinity);
          label = ranges[order][1];
        }
      }
      if (mode === "typeLine") label = ["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle"].find((type) => String(item.typeLine).includes(type)) || (item.category === "precon" ? "Preconstructed decks" : "Other");
      if (mode === "themeSet") label = item.category === "precon" ? "Commander precon" : metadata.setName || item.tags?.[0] || "Theme / set loading or unknown";
      if (mode === "deckCount") {
        label = `Needed by ${item.deckRefs.length} deck${item.deckRefs.length === 1 ? "" : "s"}`;
        order = -item.deckRefs.length;
      }
      label ||= "Other";
      if (!groups.has(label)) groups.set(label, {label, order, items: []});
      groups.get(label).items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }

  async function ensureShopMetadata(items) {
    const missingMap = new Map();
    items.filter((item) => !item.isFlexibleSlot).forEach((item) => {
      if (item.category === "precon") return;
      const key = itemKey(item);
      const metadata = cardMetadata[key];
      const fetchedAt = Date.parse(metadata?.fetchedAt || "");
      const stale = !Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CARD_METADATA_MAX_AGE;
      // A card Scryfall could not resolve is "done": it will never look complete, so asking
      // again would re-render forever. Anything already answered this session is left alone too.
      const incomplete = !metadata || !metadata.loaded
        || (!metadata.unavailable && (metadata.price === undefined || !metadata.legalities?.commander || !Array.isArray(metadata.colorIdentity)));
      if (!stale && !incomplete) return;
      if (metadataAttempts.get(key)) return;
      missingMap.set(key, item);
    });
    const missing = Array.from(missingMap.values());
    if (!missing.length || shopMetadataPromise) return shopMetadataPromise;
    missing.forEach((item) => metadataAttempts.set(itemKey(item), 1));
    shopMetadataPromise = (async () => {
      const chunks = [];
      for (let index = 0; index < missing.length; index += 70) chunks.push(missing.slice(index, index + 70));
      for (const chunk of chunks) {
        try {
          const response = await fetch("https://api.scryfall.com/cards/collection", {
            method: "POST",
            headers: {"Accept": "application/json;q=0.9,*/*;q=0.8", "Content-Type": "application/json"},
            body: JSON.stringify({identifiers: chunk.map((item) => ({name: item.name}))})
          });
          if (!response.ok) throw new Error(`Card lookup failed: ${response.status}`);
          const result = await response.json();
          const found = new Map((result.data || []).map((card) => [itemKey(card), card]));
          chunk.forEach((item) => {
            const card = found.get(itemKey(item));
            if (!card) {
              cardMetadata[itemKey(item)] = {unavailable: true, loaded: true, price: null, ceiling: null, fetchedAt: new Date().toISOString()};
              return;
            }
            const price = Number(card.prices?.usd || card.prices?.usd_foil) || null;
            cardMetadata[itemKey(item)] = {
              rarity: card.rarity,
              setName: card.set_name,
              setCode: card.set,
              manaCost: card.mana_cost || "",
              typeLine: card.type_line || "",
              oracleText: card.oracle_text || card.card_faces?.map((face) => face.oracle_text).filter(Boolean).join("\n") || "",
              keywords: card.keywords || [],
              colorIdentity: card.color_identity || [],
              legalities: card.legalities || {},
              image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || item.image || "",
              loaded: true,
              fetchedAt: new Date().toISOString(),
              price,
              ceiling: price ? Math.round(Math.max(price * 1.25, price + .5) * 100) / 100 : null
            };
          });
        } catch (_) {
          chunk.forEach((item) => { cardMetadata[itemKey(item)] = {unavailable: true, loaded: true, price: null, ceiling: null, fetchedAt: new Date().toISOString()}; });
        }
        await new Promise((resolve) => setTimeout(resolve, 140));
      }
      localStorage.setItem(CARD_METADATA_KEY, JSON.stringify(cardMetadata));
      shopMetadataPromise = null;
      if ($("#view-shop")?.classList.contains("is-active")) renderShop();
      if ($("#view-buy")?.classList.contains("is-active")) renderBuy();
      if ($("#view-live")?.classList.contains("is-active")) renderLiveDecks();
    })();
    return shopMetadataPromise;
  }

  function ensureShellMetadata(items) {
    return ensureShopMetadata(items.filter((item) => !item.isFlexibleSlot));
  }

  // A card shared by several decks needs one bought copy per deck. state.found stays
  // "at least one owned" (other views rely on that), so Shop List completion is tracked
  // separately against the summed cross-deck quantity.
  function shopItemBoughtCount(item) {
    return Math.min(item.quantity, Math.max(0, Number(state.boughtQuantities?.[item.key] || 0)));
  }

  function shopItemComplete(item) {
    return shopItemBoughtCount(item) >= item.quantity;
  }

  function matchesFilters(item, filters) {
    const found = shopItemComplete(item);
    if (filters.status === "need" && found) return false;
    if (filters.status === "found" && !found) return false;
    if (filters.type === "singles" && item.category === "precon") return false;
    if (filters.type === "precons" && item.category !== "precon") return false;
    if (filters.category !== "all" && !item.levels.has(filters.category)) return false;
    if (filters.deck !== "all" && !item.deckRefs.some((ref) => String(ref.deckId) === filters.deck)) return false;
    const query = filters.query.trim().toLowerCase();
    if (query && !`${item.name} ${item.typeLine} ${item.purpose} ${item.deckRefs.map((ref) => ref.name).join(" ")}`.toLowerCase().includes(query)) return false;
    return true;
  }

  function makeShopCard(item) {
    const shared = item.quantity > 1;
    const boughtCount = shopItemBoughtCount(item);
    const found = boughtCount >= item.quantity;
    const metadata = cardMetadata[itemKey(item)] || {};
    const bounds = cardPriceBounds(item, metadata);
    const rarity = item.category === "precon"
      ? "Sealed product"
      : metadata.rarity
        ? metadata.rarity[0].toUpperCase() + metadata.rarity.slice(1)
        : metadata.unavailable ? "Unavailable" : "Loading…";
    const rarityKey = metadata.rarity || "";
    const tableLocation = item.category === "precon"
      ? "Precon / sealed product"
      : item.whereToBuy || "Ask vendor";
    const card = document.createElement("article");
    card.className = `shop-card${found ? " is-found" : ""}`;
    const categories = Array.from(item.categories);
    const levelLabels = {precon: "Precon", shell: "Starting Shell", tuned: "Tuned", upgrade: "Enhance", enhance: "Enhance", max: "Maxxed"};
    const levelBadges = categories
      .filter((category, index, values) => !(item.category === "precon" && category === "precon") && values.indexOf(category) === index)
      .map((category) => `<span class="shop-badge ${esc(category)}">${esc(levelLabels[category] || category)}</span>`)
      .join("");
    const displayType = item.category === "precon" ? "Precon" : item.typeLine;
    const imageCandidates = cardImageCandidates(item, metadata);
    card.innerHTML = `
      <button class="shop-image-button" aria-label="View a larger image of ${esc(item.name)}">
        <img class="shop-image" src="${esc(imageCandidates[0] || "og.png")}" alt="${esc(item.name)} card" loading="lazy" decoding="async">
      </button>
      <div class="shop-main">
        <div class="shop-card-kicker">${icon(item.category === "precon" ? "▣" : "✦")}<span>${esc(item.category === "precon" ? "Precon" : "Single card")}</span>${rarityIcon(rarityKey, rarity)}${levelBadges}${item.gameChanger ? `<span class="shop-badge gc">GC</span>` : ""}</div>
        <h3><button type="button" class="shop-name-button">${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""} →</button></h3>
        <div class="shop-facts">${item.manaCost ? `<span>${manaCostHtml(item.manaCost)}</span>` : ""}${displayType ? `<span>${esc(displayType)}</span>` : ""}</div>
        <div class="shop-buying-facts" aria-label="Buying guide">
          <div>${sectionIcon("buyLocation")}<span><small>Table location</small><strong>${esc(tableLocation)}</strong></span></div>
          <div class="shop-price-fact">
            <span class="shop-price-half">${sectionIcon("budget")}<span><small>Floor</small><strong>${money(bounds.price)}</strong></span></span>
            <span class="shop-price-half">${sectionIcon("ceiling")}<span><small>Ceiling</small><strong>${bounds.ceiling ? money(bounds.ceiling) : "Not listed"}</strong></span></span>
          </div>
        </div>
        <p class="shop-purpose">${sectionIcon("does")}<span>${esc(item.purpose || item.replaces || "")}</span></p>
        <div class="shop-refs"><span>Needed by</span>${item.deckRefs.map((ref) => `<b>Deck ${ref.deckId}</b>`).join("")}</div>
        <div class="shop-bottom">
          ${shared ? `<div class="found-counter" role="group" aria-label="Copies bought for ${esc(item.name)}">
            <button type="button" class="found-step" data-found-step="-1" aria-label="One fewer ${esc(item.name)} bought"${boughtCount <= 0 ? " disabled" : ""}>−</button>
            <span class="found-count${found ? " is-complete" : ""}">${boughtCount}/${item.quantity} Bought</span>
            <button type="button" class="found-step" data-found-step="1" aria-label="One more ${esc(item.name)} bought"${boughtCount >= item.quantity ? " disabled" : ""}>+</button>
          </div>` : `<button class="found-button">${found ? "✓ Bought" : "Mark Bought"}</button>`}
        </div>
      </div>`;
    const cardImage = $(".shop-image", card);
    cardImage.addEventListener("error", () => {
      const currentIndex = Number(cardImage.dataset.retryIndex || 0) + 1;
      cardImage.dataset.retryIndex = String(currentIndex);
      const nextSource = imageCandidates[currentIndex];
      if (nextSource) {
        window.setTimeout(() => { cardImage.src = nextSource; }, 240 * currentIndex);
        return;
      }
      cardImage.alt = `${item.name} image unavailable`;
      cardImage.src = "og.png";
    });
    $(".shop-image-button", card).addEventListener("click", () => openCardPreview(item));
    $(".shop-name-button", card).addEventListener("click", () => {
      const variant = selectedVariants().find((candidate) => item.deckRefs.some((ref) => ref.deckId === candidate.deckId)) || selectedVariants()[0];
      if (!variant) return showToast("Choose a deck variant before opening card details.");
      const kind = item.category === "precon" ? "precon" : item.category === "shell" ? "starting shell single" : item.category === "tuned" ? "tuned" : item.category === "max" ? "max" : "enhance";
      openBuyItemDetail(item, variant, kind);
    });
    if (shared) {
      $$(".found-step", card).forEach((button) => button.addEventListener("click", () => {
        const next = Math.max(0, Math.min(item.quantity, boughtCount + Number(button.dataset.foundStep)));
        state.boughtQuantities ||= {};
        if (next > 0) state.boughtQuantities[item.key] = next;
        else delete state.boughtQuantities[item.key];
        state.found[item.key] = next > 0;
        saveState(`${item.name}: ${next}/${item.quantity} bought`);
        renderShop();
      }));
    } else {
      $(".found-button", card).addEventListener("click", () => {
        const bought = !found;
        state.found[item.key] = bought;
        state.boughtQuantities ||= {};
        if (bought) state.boughtQuantities[item.key] = Math.max(1, Number(item.quantity || 1));
        else delete state.boughtQuantities[item.key];
        saveState(bought ? `${item.name} marked Bought` : `${item.name} returned to Need`);
        renderShop();
      });
    }
    return card;
  }

  function openCardPreview(item) {
    const dialog = $("#card-preview");
    $("#card-preview-image").src = cardImageCandidates(item)[0].replace("version=small", "version=normal").replace("/small/", "/normal/");
    $("#card-preview-image").alt = `${item.name} card`;
    $("#card-preview-title").textContent = item.name;
    $("#card-preview-meta").innerHTML = `${manaCostHtml(item.manaCost)}${[item.typeLine, money(item.price)].filter(Boolean).map((value) => `<span>${esc(value)}</span>`).join("<b>·</b>")}`;
    dialog.showModal();
  }

  const TOUR_STEPS = {
    choose: [
      {view: "choose", selectors: [".main-tabs"], title: "Step 0 · build a deck of your own", copy: "Choose is optional. The curated six are ready to compare without it — this step is here when you want variants for a deck nobody has researched for you yet."},
      {view: "choose", selectors: [".choose-slot:first-of-type .choose-form", ".choose-slot:first-of-type"], title: "Describe what you want to play", copy: "Colors, mechanics, play style, budget and a preferred set are all optional. Give as much or as little as you like; anything you leave blank is inferred from the rest."},
      {view: "choose", selectors: [".choose-slot:first-of-type .choose-themes", ".choose-slot:first-of-type"], title: "Mechanics drive the card pool", copy: "The mechanics you tick decide which searches run and how strongly a card's own text has to match. They also become the mechanic filters on this deck in Compare."},
      {view: "choose", selectors: ['.choose-slot:first-of-type [data-choose-input="commanderLink"]', ".choose-slot:first-of-type"], title: "Or just paste a commander", copy: "A TCGplayer link to the commander you want is enough on its own — affiliate links included. The commander's color identity then locks every card that can be picked."},
      {view: "choose", selectors: ["[data-choose-seeds]", ".choose-slot:first-of-type"], title: "Cards you already want", copy: "Paste one TCGplayer link per line and those cards are forced into every variant. Links that resolve to nothing, or to a card outside the color identity, are reported instead of silently dropped."},
      {view: "choose", selectors: ['.choose-slot:first-of-type [data-choose-input="variantCount"]', ".choose-slot:first-of-type"], title: "How many approaches", copy: "Each variant is a different strategy lens on the same commander — synergy, budget, resilience, tempo and spice — and each is charged for reusing cards the earlier ones took, so they stay genuinely different lists."},
      {view: "choose", selectors: ["[data-choose-generate]", ".choose-slot:first-of-type"], title: "Generate, then compare", copy: "Generation reads live Scryfall data and checks every stage against the Tier 3 rules before saving. Finished variants join Compare above the curated decks and flow through Buy Picks, Shop List and Live Decks like any other."}
    ],
    compare: [
      {view: "compare", selectors: [".main-tabs"], title: "Five steps, one flow", copy: "Choose builds decks of your own, Compare picks the deck, Buy Picks builds the exact 100, Shop List becomes your vendor-floor checklist, and Live Decks tracks what you own and what it cost."},
      {view: "compare", selectors: [".page-intro"], title: "Choose one variant per deck role", copy: "There are six deck roles and five competing approaches inside each. You pick one per role; the counter tracks how many are locked in."},
      {view: "compare", selectors: [".compare-filter-panel"], title: "Narrow the field", copy: "Search by commander, tag, or text, and filter by mechanic or play style. Only matching variants stay visible inside each row."},
      {view: "compare", selectors: ["[data-compare-filter='profileStage']", ".compare-filter-panel"], title: "Base, Tuned, or Maxed", copy: "Score stage changes which build every card on the page is describing: out-of-the-box, after the core purchases, or pushed to the legal top of Tier 3."},
      {view: "compare", selectors: [".deck-group:first-of-type > summary"], title: "One row per deck role", copy: "Each row is a role with its own objective. Open it to see the five approaches competing for that slot."},
      {view: "compare", selectors: [".deck-group:first-of-type .rank-order"], title: "Change the ranking lens", copy: "Re-rank the variants for Base, Tuned, or Maxed play to see whether a recommendation still holds as investment increases."},
      {view: "compare", selectors: [".deck-group:first-of-type .variant-card"], title: "Swipe through the approaches", copy: "Cards sit side by side. Slide horizontally to compare commander, cost, power level, availability, and rarity at a glance."},
      {view: "compare", selectors: [".deck-group:first-of-type .metric-strip", ".deck-group:first-of-type .variant-card"], title: "Read the three ratings", copy: "Playstyle is how the deck feels to play, Engine is how efficiently it works, Growth is how much upgrade road is left. Each shows an average out of five — tap one to see every sub-score and why it landed there."},
      {view: "compare", selectors: [".deck-group:first-of-type .build-promise", ".deck-group:first-of-type .variant-card"], title: "What the build actually does", copy: "A plain-language summary of the game plan at the selected stage, so you are not reverse-engineering it from card names."},
      {view: "compare", selectors: [".deck-group:first-of-type .detail-button"], title: "Open the full evidence", copy: "Full detail carries the commander breakdown, rank reasoning, rarity, precon seed, play pattern, and bracket route. On a phone the green commander block folds away behind its caret."},
      {view: "compare", selectors: [".deck-group:first-of-type .comment-toggle"], title: "Leave feedback in place", copy: "Attach a comment to a variant. Comments stay on this device and travel with your selections when you email them."},
      {view: "compare", selectors: [".deck-group:first-of-type .pick-control"], title: "Lock in the pick", copy: "Picking a variant is what feeds every later step. Change it any time — your other choices are preserved."},
      {view: "buy", selectors: [".buy-intro", ".page-intro"], title: "Step 2 · your picks become a 100-card plan", copy: "Buy Picks carries each selected variant across and turns it into an explicit purchase list, with the checked-card count and type spread in the header."},
      {view: "buy", selectors: [".starting-shell", ".buy-section", ".empty-state"], title: "Step 2 · check exactly what you want", copy: "The commander stays fixed. Tick or untick the shell, Tuned, Enhance, and Maxxed cards; the rules check follows along as you go."},
      {view: "shop", selectors: [".shop-toolbar", ".page-intro", ".empty-state"], title: "Step 3 · one deduplicated shopping list", copy: "Every checked card across all six decks collapses into a single list you can filter, group, and work through at a vendor table."},
      {view: "live", selectors: [".live-decks", ".page-intro"], title: "Step 4 · what you own and what it cost", copy: "Live Decks tracks the physical build: which cards you have, what you paid for each, the running total cost, and whether the deck is legal and ready to play."}
    ],
    buy: [
      {view: "buy", selectors: [".buy-intro", ".page-intro"], title: "Build the buy plan", copy: "Your Compare picks become complete 100-card configurations here. The header shows how many cards are checked and how they split by type."},
      {view: "buy", selectors: [".buy-mode-chips", ".page-intro"], title: "All or only what you own", copy: "Switch to Bought to see just the cards already marked as purchased in the Shop List."},
      {view: "buy", selectors: [".buy-overview", ".empty-state"], title: "Jump between deck plans", copy: "Move quickly among the selected decks and compare the size of each Tuned package."},
      {view: "buy", selectors: [".deck-compliance", ".empty-state"], title: "Keep the rules close", copy: "Tier 2, Tier 3, and the exact card count stay compact. Expand the check for composition and detailed issues."},
      {view: "buy", selectors: [".plan-analysis", ".empty-state"], title: "Read the full strategy", copy: "The analysis keeps how to play, buy order, bracket reasoning, stretch cards, and top-of-bracket options in one place."},
      {view: "buy", selectors: [".starting-shell", ".empty-state"], title: "Inspect the 100-card foundation", copy: "The commander never collapses. The other 99 cards are nested by type so you can work one group at a time."},
      {view: "buy", selectors: [".buy-section", ".empty-state"], title: "Try one-for-one changes", copy: "Enhance options are role-preserving choices at $15 or less. Maxxed choices are classified by Tier 3 capability rather than cost, and each names the card it replaces."},
      {view: "shop", selectors: [".shop-toolbar", ".page-intro", ".empty-state"], title: "Step 3 · where these checks land", copy: "Saving your buys sends every checked purchase to the Shop List, deduplicated across all six decks and sorted for a vendor floor."},
      {view: "live", selectors: [".live-decks", ".page-intro"], title: "Step 4 · and where they end up", copy: "Once bought, each card appears in Live Decks, where you record what you paid and watch the deck's total cost and readiness update."}
    ],
    shop: [
      {view: "shop", selectors: [".page-intro"], title: "Your table-ready list", copy: "Only purchases from the selected deck arrangements appear here, deduplicated across decks."},
      {view: "shop", selectors: [".shop-toolbar", ".empty-state"], title: "Search and filter quickly", copy: "Narrow by need or bought status, purchase level, deck, or card type while walking a vendor floor."},
      {view: "shop", selectors: [".more-filters", ".empty-state"], title: "Group the way you shop", copy: "Group by table location, rarity, price range, type, theme or set, or the number of decks that need the card."},
      {view: "shop", selectors: [".shop-card", ".empty-state"], title: "Use the complete buying card", copy: "Each card shows large art, table location, target and ceiling price, rarity, purpose, and the decks that need it."},
      {view: "shop", selectors: [".found-button", ".empty-state"], title: "Mark progress as you go", copy: "Mark a card Bought and the remaining target total updates. Everything stays private on this device."},
      {view: "live", selectors: [".live-deck-metrics", ".live-decks", ".page-intro"], title: "Step 4 · bought cards become inventory", copy: "Anything marked Bought turns into an owned card in Live Decks, where you enter the price you actually paid."},
      {view: "live", selectors: [".live-export", ".page-intro"], title: "Step 4 · take the list with you", copy: "Export writes the decks exactly as filtered on screen to a flat CSV checklist for a spreadsheet or a printout."}
    ],
    live: [
      {view: "live", selectors: [".live-intro", ".page-intro"], title: "The physical build", copy: "Live Decks is the inventory view: what each deck contains, what you own, what it cost, and whether it is legal and ready to play."},
      {view: "live", selectors: [".live-deck-metrics", ".live-decks"], title: "Read the header at a glance", copy: "Total cost sums only the prices you locked in. The rest track bought and active cards, purchases still needed, and Game Changer and Tier 3 status."},
      {view: "live", selectors: [".live-deck-disclosures", ".live-decks"], title: "Detail on demand", copy: "Deck Composition and Core Mechanics stay folded until you want them, so the header stays short on a phone."},
      {view: "live", selectors: [".live-metric-strip", ".live-decks"], title: "The same three ratings", copy: "Playstyle, Engine, and Growth carry over from Compare at the stage you selected. Tap one to see which sub-scores drive it."},
      {view: "live", selectors: [".live-toolbar", ".live-decks"], title: "Filter and group each deck", copy: "Search inside a deck, filter by status, level, type, colour, price, rarity, or location, and group and sub-group the results."},
      {view: "live", selectors: [".live-lineup-radio", ".live-card-row", ".live-decks"], title: "Choose the active 100", copy: "Each slot has one active card and any number of bench options. The radio makes a card active; illegal swaps are refused with the rule that blocked them."},
      {view: "live", selectors: [".live-price-entry", ".live-card-row", ".live-decks"], title: "Record what you paid", copy: "Owned cards get a price box. Type what you paid and press the check to lock it in; the deck's total cost updates immediately. Cards that came in a sealed precon just read Precon Pack."},
      {view: "live", selectors: [".live-export", ".live-intro"], title: "Export the checklist", copy: "Export writes every deck in its current grouping and filters to a CSV inventory: card, type, rarity, set, level, lineup, status, what you paid, and the floor-to-ceiling range."}
    ]
  };

  function activeViewName() {
    return $(".main-tab.is-active")?.dataset.view || "compare";
  }

  function closeTour() {
    const origin = tourState?.origin;
    tourState = null;
    $("#tour-layer").hidden = true;
    if (origin && activeViewName() !== origin) switchView(origin, false);
  }

  function findTourTarget(step) {
    for (const selector of step.selectors) {
      const target = $(selector);
      if (target) return target;
    }
    return null;
  }

  function positionTour(target) {
    const spotlight = $("#tour-spotlight");
    const popover = $("#tour-popover");
    if (!target) {
      Object.assign(spotlight.style, {left: "50%", top: "50%", width: "1px", height: "1px"});
      Object.assign(popover.style, {left: `${Math.max(12, (innerWidth - Math.min(360, innerWidth - 24)) / 2)}px`, top: `${Math.max(12, (innerHeight - popover.offsetHeight) / 2)}px`});
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) {
      Object.assign(spotlight.style, {left: "50%", top: "50%", width: "1px", height: "1px"});
      Object.assign(popover.style, {left: `${Math.max(12, (innerWidth - Math.min(360, innerWidth - 24)) / 2)}px`, top: `${Math.max(12, (innerHeight - popover.offsetHeight) / 2)}px`});
      return;
    }
    const pad = 7;
    Object.assign(spotlight.style, {
      left: `${Math.max(5, rect.left - pad)}px`,
      top: `${Math.max(5, rect.top - pad)}px`,
      width: `${Math.min(innerWidth - 10, rect.width + pad * 2)}px`,
      height: `${Math.min(innerHeight - 10, rect.height + pad * 2)}px`
    });
    const width = Math.min(360, innerWidth - 24);
    const left = Math.min(innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
    const below = rect.bottom + 14;
    const above = rect.top - popover.offsetHeight - 14;
    const top = below >= 12 && below + popover.offsetHeight <= innerHeight - 12 ? below : above >= 12 ? above : Math.max(12, innerHeight - popover.offsetHeight - 12);
    Object.assign(popover.style, {left: `${left}px`, top: `${top}px`});
  }

  function showTourStep() {
    if (!tourState) return;
    const step = tourState.steps[tourState.index];
    switchView(step.view, false);
    const tourName = ({choose: "Choose", compare: "Compare", buy: "Buy Picks", shop: "Shop List", live: "Live Decks"})[tourState.origin] || "Guided";
    $("#tour-progress").textContent = `${tourName} tour · ${tourState.index + 1} of ${tourState.steps.length}`;
    $("#tour-title").textContent = step.title;
    $("#tour-copy").innerHTML = `<p>${esc(step.copy)}</p>`;
    $("#tour-back").disabled = tourState.index === 0;
    $("#tour-next").textContent = tourState.index === tourState.steps.length - 1 ? "Finish" : "Next";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = findTourTarget(step);
      target?.scrollIntoView({behavior: "instant", block: "center", inline: "nearest"});
      setTimeout(() => positionTour(target), 40);
    }));
  }

  function startTour() {
    const view = activeViewName();
    const steps = TOUR_STEPS[view] || TOUR_STEPS.compare;
    if (!steps?.length) return;
    tourState = {steps, index: 0, origin: view};
    $("#tour-layer").hidden = false;
    showTourStep();
  }

  function moveTour(direction) {
    if (!tourState) return;
    const next = tourState.index + direction;
    if (next < 0) return;
    if (next >= tourState.steps.length) return closeTour();
    tourState.index = next;
    showTourStep();
  }

  function resetState() {
    if (!window.confirm("Reset all deck picks, comments, optional buys, filters, and Bought checkmarks on this device?")) return;
    state = blankState();
    saveState("Picks reset");
    const generated = Custom.activeSlots(customStore).length;
    if (generated && window.confirm(`Also delete the ${generated} generated deck placeholder${generated === 1 ? "" : "s"} built on the Choose step? This cannot be undone.`)) {
      customStore = Custom.clear(localStorage);
      remergeCustom();
      renderChoose();
    }
    renderCompare();
    switchView("compare");
    showToast("Your local picks were reset.");
  }

  async function init() {
    try {
      [bakedCatalog, bakedBuyCatalog] = await Promise.all([
        fetch("data/variants.json", {cache: "no-store"}).then((response) => {
          if (!response.ok) throw new Error("Variant catalog did not load");
          return response.json();
        }),
        fetch("data/buy-plans.json", {cache: "no-store"}).then((response) => {
          if (!response.ok) throw new Error("Buy catalog did not load");
          return response.json();
        })
      ]);
      customStore = Custom.load(localStorage);
      remergeCustom();
      state = loadState();
      pruneMissingSelections();
      migrateCheckedSelections();
      migrateOwnedExtras();
      migrateBoughtQuantities();
      sanitizeGameChangerSelections();
      initializeInfoTooltips();
      initializeDetailsControls();
      renderCompare();
      $$(".main-tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
      $("#reset-button").addEventListener("click", resetState);
      $("#tour-button").addEventListener("click", startTour);
      $("#tour-close").addEventListener("click", closeTour);
      $("#tour-back").addEventListener("click", () => moveTour(-1));
      $("#tour-next").addEventListener("click", () => moveTour(1));
      window.addEventListener("resize", () => tourState && positionTour(findTourTarget(tourState.steps[tourState.index])));
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && tourState) closeTour();
      });
      $("#card-preview-close").addEventListener("click", () => $("#card-preview").close());
      $("#card-preview").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      });
      $("#detail-sheet-close").addEventListener("click", () => $("#detail-sheet").close());
      $("#detail-sheet").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      });
      $("#compliance-dialog-close").addEventListener("click", () => $("#compliance-dialog").close());
      $("#compliance-dialog").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      });
    } catch (error) {
      $("#view-compare").innerHTML = `<div class="empty-state"><h3>Could not start the Deck Matrix</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  init();
})();
