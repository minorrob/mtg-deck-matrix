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
    fit: "Fit explains how directly the card supports this deck’s commander, mechanics, and stated game plan.",
    simulate: "Play this exact 100-card build against randomized opponents thousands of times, find where it actually loses, and propose swaps that measurably fix it. The games run on your own computer.",
    whyVariant: "See this variant's simulated score on every rung it was measured on, and where its Tuned score ranks among its deck's other variants."
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
  let simulationSummary = null;
  let bakedCatalog;
  let bakedBuyCatalog;
  let customStore;
  let customDeckIds = new Set();
  const slotRuns = new Map();
  let state;
  let toastTimer;
  let openDeckId = null;
  // How many Choose placeholders to show as full editable cards, before the
  // rest collapse behind a single "+ Add another deck" tile. Never less than
  // however many are already built, so a returning user's own decks are never
  // hidden -- only the empty ones beyond that need an explicit "+" click.
  let chooseRevealCount = 1;
  let openBuyDeckId = 1;
  let openCommentId = null;
  let tourState = null;
  let activeTooltipTarget = null;
  let shopMetadataPromise = null;
  // Which Compare cards are currently previewing their alt commander -- display-only and
  // deliberately not part of `state`/localStorage: it never changes what Calibrate seeds.
  const altCommanderPreview = new Set();
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
  // Which variants wear the corner ribbon. Read from data/active-state.json at
  // startup rather than from a flag baked into each variant record, so the
  // ribbon always marks the build that is actually loaded -- one source of
  // truth, and re-picking the slate is a data change rather than an edit across
  // fifty variant records.
  let treysBuildIds = new Set();
  const isTreysBuild = (variant) => treysBuildIds.has(variant.id);
  const isCustomDeck = (deckId) => customDeckIds.has(Number(deckId));

  // Generated decks are merged into copies of the baked catalog on every change.
  // The files on disk never learn about them, so the published catalog keeps its
  // exact contents and every existing view keeps reading one shape of data.
  function remergeCustom() {
    const merged = Custom.mergeIntoCatalogs(customStore, bakedCatalog, bakedBuyCatalog);
    catalog = merged.catalog;
    buyCatalog = merged.buyCatalog;
    customDeckIds = new Set(merged.customDeckIds);
    applyManualCards();
    if (state) pruneMissingSelections();
  }

  // Hangs each variant's hand-added cards off its plan as a `manual` array, which is where
  // lineup-model picks them up as one more candidate inside the slot of the card each one
  // replaces. Re-applied after every catalog rebuild because that rebuild starts from the
  // baked plans, which know nothing about these.
  function applyManualCards() {
    if (!state?.manualCards || !buyCatalog?.plans) return;
    for (const [variantId, cards] of Object.entries(state.manualCards)) {
      const plan = buyCatalog.plans[variantId];
      if (!plan || !Array.isArray(cards) || !cards.length) continue;
      buyCatalog.plans[variantId] = {...plan, manual: cards.map((card) => ({...card}))};
    }
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

  /* 1-3: before Assigned existed. 4: every slot carries a reviewed recommendation beside
     the card that is actually in it. Older files are migrated on load, never rejected. */
  const STATE_VERSION = 4;

  function blankState() {
    return {
      selectionSchema: 3,
      ownershipSchema: 2,
      /* The saved shape's own version, separate from the two schema numbers above, which
         version particular fields. This one versions the whole export, so an older file
         can be recognised and migrated rather than half-read. Raised to 4 when Assigned
         arrived: before it, a slot had one selection and no reset target. */
      stateVersion: STATE_VERSION,
      compareSelections: {},
      rankStages: {},
      buySelections: {},
      /* Active and Assigned. buySelections is Active -- the hundred the deck is counted,
         shopped and checked as. assignedSelections is the reviewed recommendation behind
         it: the thing a reset returns to. They start identical on import and only ever
         diverge because someone chose a different rung, which changes Active alone. */
      assignedSelections: {},
      found: {},
      boughtQuantities: {},
      comments: {},
      compareFilters: {query: "", mechanic: "all", playstyle: "all", profileStage: "2"},
      shopFilters: {status: "need", type: "all", category: "all", alt: "all", deck: "all", groupBy: "none", query: "", layout: "gallery"},
      buyMode: "all",
      purchasePrices: {},
      liveFilters: {},
      liveOpenDecks: {},
      lineupHistory: {},
      liveTransfers: {},
      liveSalvage: {},
      liveActive: {},
      liveActiveSeed: {},
      // The last rung the reader clicked on the Deck page, per variant. Not the
      // source of truth for what the deck IS -- that is always derived from the
      // selection -- only a tie-break for when two rungs are the same hundred.
      deckRung: {},
      /* Which slots are ticked, per variant: the Deck page's boxes. A tick says "this
         card is assigned to this deck, whatever its status is", so this is the deck's
         claim on a hundred cards, not a claim about what is physically in hand.
         deckActiveSeed records which variants have had their boxes filled in from the
         selection, so it happens once and never undoes an untick. */
      deckActive: {},
      deckActiveSeed: {},
      /* Which box physically holds which copies, per variant, when that has been audited.
         A global count cannot express it, and without it the allocator can only guess. */
      deckHolds: {},
      // Cards the owner added to a deck by hand, keyed by variant id. These live in state
      // rather than in data/buy-plans.json on purpose: the buy catalog is regenerated from
      // the build kit, so anything written into it would be lost on the next rebuild.
      manualCards: {},
      cardFilters: {query: "", deck: "all", status: "all", bought: "all", type: "all", sort: "deck"},
      // Games played at a real table. Written here on the night, exported as JSON,
      // committed to the repo, and compiled into a running history -- the loop
      // that lets simulated predictions be checked against what actually happened.
      gameLog: []
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
          stateVersion: Number(saved.stateVersion) || 1,
          compareSelections: saved.compareSelections || {},
          rankStages: saved.rankStages || {},
          buySelections: saved.buySelections || {},
          assignedSelections: saved.assignedSelections || {},
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
          cardFilters: {...initial.cardFilters, ...(saved.cardFilters || {})},
          liveActive: saved.liveActive || {},
          deckRung: saved.deckRung || {},
          deckActive: saved.deckActive || {},
          deckActiveSeed: saved.deckActiveSeed || {},
          deckHolds: saved.deckHolds || {},
          manualCards: saved.manualCards || {},
          liveActiveSeed: saved.liveActiveSeed || {},
          gameLog: Array.isArray(saved.gameLog) ? saved.gameLog : []
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

  // ---- Deck page bridge -------------------------------------------------
  // The new Deck view reads through slot-model.js and renders via deck-page.js.
  // It runs beside the old Calibrate and Decks tabs rather than replacing them,
  // so the two can be compared against real data before anything is removed.
  /* Which of the three panels above the slot list are shut. Held here rather than in the
     saved state for the same reason closedGroups is: it is a reading position, not a
     decision, and a fresh visit should start from the page as designed. The compliance
     panel is the exception -- it is a <details> that ships closed, so its flag is
     "opened", not "closed". */
  const deckPageState = {deckIndex: 0, openSlot: null, closedGroups: {}, closedPanels: {}, filters: {}};

  // The baked catalog carries rarity, art, oracle text and a price for every card
  // in the plans, so the Deck page does not depend on the Scryfall cache being warm.
  let deckPageCards = null;
  /**
   * Ownership migration. `found` was a boolean and `boughtQuantities` a count, which
   * together could not say "paid for, not here yet". The pair is folded into
   * owned[key] = {inHand, ordered} once, and both legacy keys are kept written so a
   * rollback to the old views still reads correctly.
   */
  function migrateOwnership() {
    const Slot = window.MtgSlotModel;
    if (!Slot || state.ownershipSchema >= 3) return;
    state.owned = Slot.normalizeOwned(state);
    state.ownershipSchema = 3;
    saveState();
  }

  function loadDeckPageCards() {
    if (deckPageCards) return Promise.resolve(deckPageCards);
    return fetch("data/cards.json")
      .then((r) => r.json())
      .then((payload) => {
        const map = {};
        (payload.cards || payload || []).forEach((card) => {
          if (card && card.name) map[Lineup.normalizeName(card.name)] = card;
        });
        deckPageCards = map;
        return map;
      })
      .catch(() => (deckPageCards = {}));
  }

  /**
   * Compare's Rank order, carried into the Deck page the first time a variant is
   * opened here. It runs once per variant: after that the deck has its own stored
   * selection and Compare must not reach back in and overwrite picks made here.
   * Tuned needs no seeding because it is already what ensureBuyState defaults to.
   */
  function seedDeckRungFromCompare(variant, plan) {
    const Slot = window.MtgSlotModel;
    if (!Slot || !plan) return;
    if (Object.prototype.hasOwnProperty.call(state.buySelections, variant.id)) return;
    const rung = Slot.rungForStage(state.rankStages[variant.deckId]);
    if (rung === "tuned") return;
    assignSelection(ensureBuyState(variant.id), Slot.selectionForRung(plan, rung));
    syncBoxesToOwned(variant.id, plan);
    if (!state.deckRung) state.deckRung = {};
    state.deckRung[variant.id] = rung;
    saveState();
  }

  /**
   * The hundred you picked IS the hundred you are claiming for the deck.
   *
   * A tick says "this card is assigned to this deck, whatever its status is". So a deck
   * whose selection is settled but whose boxes have never been touched is a deck with a
   * hundred cards and nothing claimed -- which is what "0/100 cards in the box" was
   * reporting after a Load Active, because a loaded state carries selections and, until
   * now, no boxes. The selection is the claim, so the boxes are filled in to match it the
   * first time a variant is seen.
   *
   * Once per variant, and only where nothing is ticked: a state that carries its own
   * boxes keeps them, and unticking a slot is never undone by a later render.
   *
   * Every slot with a card is ticked, including cards you do not have yet. That is not a
   * lie about what is in the box -- the tally reads ownership separately, so a ticked
   * card you cannot hold counts under Assigned and only a ticked card actually in hand
   * counts as in the box. Assignment is also not exclusive: six decks may all claim the
   * one Sol Ring, and five of them will say another copy is needed, which is the truth
   * the duplicate-copy plan already prices.
   */
  /* Assigned is the reviewed recommendation behind each slot, and every state that has
     ever existed has an Active hundred, so migrating an older file is simply: whatever it
     was selecting, that was the recommendation. Seeded once per variant and never
     overwritten -- the whole value of Assigned is that it does not move when Active does.
     Run for every plan, not only the six on screen, so switching a variant later still
     finds a reset target waiting for it. */
  function ensureAssignedSeeded() {
    if (!buyCatalog || !buyCatalog.plans) return;
    state.assignedSelections ||= {};
    let wrote = false;
    Object.keys(state.buySelections || {}).forEach((variantId) => {
      if (!buyCatalog.plans[variantId]) return;
      const already = state.assignedSelections[variantId];
      if (already && Object.keys(already).length) return;
      state.assignedSelections[variantId] = cloneSelection(state.buySelections[variantId]);
      wrote = true;
    });
    if (state.stateVersion !== STATE_VERSION) { state.stateVersion = STATE_VERSION; wrote = true; }
    if (wrote) saveState();
  }

  /** A selection is arrays of entry ids per rung; copying it must not share those arrays. */
  function cloneSelection(selection) {
    const out = {};
    Lineup.ARRAY_KEYS.forEach((key) => { out[key] = ((selection || {})[key] || []).slice(); });
    return out;
  }

  function ensureDeckBoxesSeeded() {
    const Slot = window.MtgSlotModel;
    if (!Slot || !buyCatalog || !buyCatalog.plans) return;
    state.deckActive ||= {};
    state.deckActiveSeed ||= {};
    let wrote = false;
    const owned = Slot.normalizeOwned(state);
    selectedVariants().forEach((variant) => {
      if (state.deckActiveSeed[variant.id]) return;
      const plan = buyCatalog.plans[variant.id];
      if (!plan) return;
      const existing = state.deckActive[variant.id];
      // Boxes already in the state are the reader's, not ours to overwrite.
      if (existing && Object.keys(existing).length) {
        state.deckActiveSeed[variant.id] = true;
        wrote = true;
        return;
      }
      const next = {};
      Slot.deckSlots(plan, ensureBuyState(variant.id), {owned}).forEach((slot) => {
        if (slot.pick) next[slot.slotId] = true;
      });
      state.deckActive[variant.id] = next;
      state.deckActiveSeed[variant.id] = true;
      wrote = true;
    });
    if (wrote) saveState();
  }

  /**
   * Which box gets which copy.
   *
   * One Sol Ring and five decks that each want one is the normal case here, so ownership
   * cannot be read as a per-deck fact: the ledger knows there is one copy, not who has it.
   * The copies are handed out once here and both the Deck page and the Shop read the
   * result, because a shopping list that disagrees with the deck it is shopping for is
   * worse than either number alone.
   *
   * Ordered copies are allocated exactly like held ones. A card in the post is one card:
   * if two decks list it, one is getting it and the other still has to buy one. Reading
   * "ordered" off the global count let every deck claiming the card call itself ordered,
   * which inflated what was in the post and hid what was still to buy.
   *
   * Where an audit says which box holds which copy -- state.deckHolds -- those decks are
   * served first, and a deck the audit says holds none is never served at all. No count
   * can reconstruct that: two decks sharing two copies look identical to a counter and
   * are not at all identical on the table.
   */
  function allocateCopies(variants, owned, cards) {
    const Slot = window.MtgSlotModel;
    const boxes = {};
    const committed = new Map();
    const claimSatisfied = new Map();
    const unclaimed = new Map();
    const unordered = new Map();
    const servedQty = new Map();
    const allocated = {};
    const holdOf = (id, key) => ((state.deckHolds || {})[id] || {})[key] || null;
    const claims = [];
    variants.forEach((v) => {
      const p = buyCatalog && buyCatalog.plans ? buyCatalog.plans[v.id] : null;
      if (!p) return;
      const ticked = (state.deckActive && state.deckActive[v.id]) || {};
      Slot.deckSlots(p, ensureBuyState(v.id), {owned, cards}).forEach((slot) => {
        if (!slot.pick || !ticked[slot.slotId]) return;
        const key = Slot.ownedKey(slot.pick.name);
        const qty = Math.max(1, Number(slot.pick.quantity) || 1);
        const hold = holdOf(v.id, key);
        claims.push({key, qty, id: v.id, name: slot.pick.name,
          audited: Boolean(hold && ((hold.inHand || 0) >= qty || (hold.ordered || 0) >= qty)),
          wantsOrdered: Boolean(hold && !(hold.inHand || 0) && (hold.ordered || 0) >= qty),
          /* Audited, and audited as holding none. Three decks list Valorous Stance and the
             audit put copies in two of them; without this the third is handed a spare and
             the shopping list quietly loses a card that has to be bought. */
          denied: Boolean(hold && !(hold.inHand || 0) && !(hold.ordered || 0))});
      });
    });

    const take = (key, id, qty, from) => {
      const rec = allocated[key] || (allocated[key] = {inHand: 0, ordered: 0});
      if (from === "hand") {
        unclaimed.set(key, unclaimed.get(key) - qty);
        rec.inHand += qty;
        boxes[key] = boxes[key] || id;             // whoever actually holds it
        committed.set(key, (committed.get(key) || 0) + qty);
        if (!servedQty.has(key)) servedQty.set(key, new Map());
        servedQty.get(key).set(id, (servedQty.get(key).get(id) || 0) + qty);
      } else {
        unordered.set(key, unordered.get(key) - qty);
        rec.ordered += qty;
      }
      return from;
    };
    const serve = (claim) => {
      const {key, qty, name, id} = claim;
      if (claim.denied) return void claimSatisfied.set(`${key}|${id}`, false);
      if (!unclaimed.has(key)) unclaimed.set(key, Slot.ownedCount(owned, name).inHand || 0);
      if (!unordered.has(key)) unordered.set(key, Slot.ownedCount(owned, name).ordered || 0);
      let got = false;
      if (!claim.wantsOrdered && unclaimed.get(key) >= qty) got = take(key, id, qty, "hand");
      else if (unordered.get(key) >= qty) got = take(key, id, qty, "ordered");
      // Audited as ordered, but the ordered copies are gone; a held one will do.
      else if (unclaimed.get(key) >= qty) got = take(key, id, qty, "hand");
      claimSatisfied.set(`${key}|${id}`, got);
    };
    // Audited holders first, so the box the cards were physically counted into is the box
    // that gets them; then everyone else in deck order.
    claims.filter((c) => c.audited).forEach(serve);
    claims.filter((c) => !c.audited).forEach(serve);
    return {boxes, committed, claimSatisfied, unclaimed, servedQty, allocated};
  }

  function deckPageContext() {
    const Slot = window.MtgSlotModel;
    const variants = selectedVariants();
    if (!Slot || !variants.length) return null;
    const variant = variants[Math.min(deckPageState.deckIndex, variants.length - 1)];
    const plan = buyCatalog && buyCatalog.plans ? buyCatalog.plans[variant.id] : null;
    if (!plan) return null;
    seedDeckRungFromCompare(variant, plan);
    ensureDeckBoxesSeeded();
    ensureAssignedSeeded();

    const owned = Slot.normalizeOwned(state);
    // Baked catalog first, then anything the Scryfall cache has freshened on top.
    const cards = Object.assign({}, deckPageCards || {});
    const slots = Slot.deckSlots(plan, ensureBuyState(variant.id), {owned, cards});
    slots.forEach((slot) => slot.rungs.forEach((rung) => {
      const key = Lineup.normalizeName(rung.name);
      const md = cardMetadata[itemKey({name: rung.name})];
      if (md && md.loaded && !md.unavailable) cards[key] = Object.assign({}, cards[key], md);
    }));

    /* Which box holds which copy is decided once, by allocateCopies, and read here and by
       the Shop alike -- a shopping list that disagrees with the deck it is shopping for is
       worse than either number on its own. */
    const {boxes, committed, claimSatisfied, unclaimed, servedQty} = allocateCopies(variants, owned, cards);
    const deckLabels = {};
    /* A card is only spoken for where a ticked box holds it. Everything else another
       deck merely LISTS -- a rung it never picked, or a slot whose box is still empty --
       is a card sitting loose, and loose is what Salvage means. So the Manual box offers
       those too, which is the difference between "cards in the yard" and "cards no deck
       is actually holding". Two guards keep it honest: a copy already in a box is not
       offered anywhere else, and nothing you do not own appears at all -- the ledger is
       read, never inferred from a deck listing the card. */
    const listedBy = new Map();
    const mine = new Set();
    variants.forEach((v) => {
      deckLabels[v.id] = deckTag(v);
      const p = buyCatalog && buyCatalog.plans ? buyCatalog.plans[v.id] : null;
      if (!p) return;
      Slot.deckSlots(p, ensureBuyState(v.id), {owned, cards}).forEach((slot) => {
        (slot.rungs || []).forEach((rung) => {
          const key = Slot.ownedKey(rung.name);
          if (v.id === variant.id) return void mine.add(key);
          if (!listedBy.has(key)) listedBy.set(key, {name: rung.name, deckId: v.deckId, variantId: v.id});
        });
      });
    });

    // Cards this deck can already reach through their own slots are left out: offering
    // them again under Manual would be a second door to the same room.
    const freeCards = [];
    listedBy.forEach((entry, key) => {
      if (mine.has(key)) return;
      const held = Slot.ownedCount(owned, entry.name).inHand || 0;
      if (held <= (committed.get(key) || 0)) return;
      const md = cards[Lineup.normalizeName(entry.name)] || {};
      freeCards.push({
        name: entry.name, typeLine: md.typeLine || "", image: md.image || "",
        // The fit model reads cost and rules text, so a loose card has to arrive carrying
        // them -- a name and a type line cannot tell you what a card is for.
        manaCost: md.manaCost || "", oracleText: md.oracleText || "", colorIdentity: md.colorIdentity || [],
        price: Number(md.price) || 0, fromDeck: "D" + entry.deckId, fromVariantId: entry.variantId
      });
    });
    freeCards.sort((a, b) => a.name.localeCompare(b.name));

    const rung = Slot.activeRung(plan, ensureBuyState(variant.id), (state.deckRung || {})[variant.id]);

    const openGroups = {};
    Object.keys(deckPageState.closedGroups).forEach((k) => {
      if (deckPageState.closedGroups[k]) openGroups[k] = false;
    });

    return {
      deckId: variant.id,
      deckTitle: "Deck " + variant.deckId + " · " + variant.name,
      commander: plan.commanderName || variant.commander || "",
      /* A Commander deck's colours ARE its commander's colours -- there is nowhere else
         for them to come from. Offering a card outside them is not a weak suggestion, it
         is an illegal one, so the slot filters on this before it ranks anything. */
      identity: (cards[Lineup.normalizeName(plan.commanderName || variant.commander || "")] || {}).colorIdentity || [],
      colors: variant.colorIdentity || variant.colors || "",
      variantId: variant.id,
      slots, owned, cards, boxes, deckLabels, openGroups,
      /* How many copies of a card other decks have boxed, and how many you own that
         nothing has claimed. deck-page reads these instead of "who has it", so five decks
         can each box a copy of a card you own five of without any of them lying. */
      /* Everything needed to answer "can I sleeve this and play it": the hundred as literal
         cards, the rules verdict on them, and whether the colours it asks for are actually
         behind it. Computed here rather than in the page because evaluateDeckCompliance is
         the same call Calibrate has always used -- one authority on legality, not two. */
      deckCards: (() => {
        try { return Lineup.selectedEntries(plan, ensureBuyState(variant.id)).map((entry) => entry.item); }
        catch (error) { return []; }
      })(),
      complianceFor: (literal) => {
        try { return evaluateDeckCompliance(plan, ensureBuyState(variant.id), literal); }
        catch (error) { return null; }
      },
      /* What this deck's claim was served with -- "hand", "ordered", or false for a copy
         it will have to buy. Only meaningful where the slot is ticked. */
      claimHeld: (name) => claimSatisfied.get(`${Slot.ownedKey(name)}|${variant.id}`) || false,
      // Copies nobody has boxed, which is what an unticked slot could still take.
      spareCopies: (name) => {
        const key = Slot.ownedKey(name);
        return unclaimed.has(key) ? unclaimed.get(key) : (Slot.ownedCount(owned, name).inHand || 0);
      },
      /* How many copies this deck could draw on: everything you own less what the OTHER
         decks have taken. This deck's own claim is not subtracted, so a row reads the same
         whether or not its box is ticked -- "seven of the sixty-eight Forests still going
         spare", not "seven of sixty-one because I already counted mine". */
      // How many you own outright, before any deck's claim is taken off. A basic-land
      // row shows its copies against this, because "twelve of the ninety-one Plains I
      // own" is the sentence a pile of lands on the table actually answers to.
      ownedTotal: (name) => Slot.ownedCount(owned, name).inHand || 0,
      availableFor: (name) => {
        const key = Slot.ownedKey(name);
        const per = servedQty.get(key);
        let taken = 0;
        if (per) per.forEach((qty, id) => { if (id !== variant.id) taken += qty; });
        return Math.max(0, (Slot.ownedCount(owned, name).inHand || 0) - taken);
      },
      // Search and filter live per deck: narrowing deck 1 to lands should not follow you
      // into deck 2, where you were looking at something else.
      filters: deckPageState.filters[variant.id] || (deckPageState.filters[variant.id] = {query: "", type: "all", rung: "all", where: "all", status: "all", active: "all", groupBy: "type", sortBy: ""}),
      paidFor,
      // The Salvage yard, offered in every slot's Manual box. Cards already carried into
      // this deck as a manual pick are filtered out per slot by the box itself.
      salvage: allSalvageCards().map((card) => ({
        name: card.name, typeLine: card.typeLine || "", image: card.image || "",
        manaCost: card.manaCost || "", oracleText: card.oracleText || "", colorIdentity: card.colorIdentity || [],
        price: Number(card.price) || 0
      })),
      // Owned copies another deck lists but is not holding. Same offer as the yard, kept
      // in its own list so the box can say where each one is sitting.
      freeCards,
      // Which of the four measured builds this deck currently IS, derived from the
      // selection rather than remembered, so a single hand-edited slot honestly
      // drops the highlight instead of leaving a rung claiming a deck it no longer
      // describes.
      rung: rung,
      rungTwins: rung ? Slot.rungTwins(plan, rung) : [],
      rungLabels: Slot.RUNG_LABEL,
      buildRungs: Slot.BUILD_RUNGS,
      active: (state.deckActive && state.deckActive[variant.id]) || {},
      openSlot: deckPageState.openSlot,
      /* The entry ids the reviewed recommendation selects for this deck. A Set because the
         page asks "is this rung the recommendation?" once per rung on every render. */
      assignedIds: new Set(Lineup.ARRAY_KEYS.flatMap((k) =>
        (((state.assignedSelections || {})[variant.id] || {})[k] || []).map(String))),
      panels: {
        head: !deckPageState.closedPanels.head,
        filters: !deckPageState.closedPanels.filters,
        ready: Boolean(deckPageState.closedPanels.ready === false),
        // One flag for every slot: only one is open at a time, and folding the reasoning
        // away on one slot means wanting it folded on the next.
        slotDetail: !deckPageState.closedPanels.slotDetail
      },
      variants
    };
  }

  /* Every pick, rung and tick re-renders the whole page, which without this would
     drop the reader wherever the new markup happened to put them -- a jump down the
     moment they touched a card in an open slot. withUiState is the same wrapper the
     other views already use: it restores scroll, focus and open-state around the
     rebuild, so the page holds still until the reader moves it. */
  function renderDeckPage() {
    withUiState("#view-deck2", renderDeckPageView);
  }

  function renderDeckPageView() {
    const host = $("#view-deck2");
    if (!host || !window.MtgDeckPage) return;
    if (!deckPageCards) {
      host.innerHTML = '<div class="loading-card">Loading the card catalog…</div>';
      loadDeckPageCards().then(renderDeckPage);
      return;
    }
    const ctx = deckPageContext();
    if (!ctx) {
      host.innerHTML = '<div class="loading-card">Choose a variant for at least one deck on Compare, then come back.</div>';
      return;
    }
    const rail = ctx.variants.map((v, i) => (
      '<button class="rail-btn' + (i === deckPageState.deckIndex ? " is-on" : "") + '" data-dp-deck="' + i +
      '" aria-pressed="' + (i === deckPageState.deckIndex) + '"><span class="rail-no">Deck ' + v.deckId +
      '</span><span class="rail-nm">' + esc(v.name) + '</span></button>'
    )).join("");
    host.innerHTML = '<div class="dp-rail">' + rail + '</div><div id="dp-body"></div>';
    window.MtgDeckPage.render($("#dp-body"), ctx);
  }

  // Resolves whatever the reader put in a slot's Manual box and files it as a Manual rung
  // on that slot. A TCGplayer link goes through the same resolver the Salvage intake uses,
  // which already understands affiliate wrappers and set-prefixed slugs; a Salvage pick is
  // already resolved, so it is simply moved. Either way the card is written to
  // state.manualCards -- never to the buy catalog, which is regenerated from the build kit.
  async function submitManualCard(slotId) {
    const ctx = deckPageContext();
    if (!ctx) return;
    const scope = document.querySelector(`[data-dp-manual="${CSS.escape(slotId)}"]`);
    const status = scope?.querySelector("[data-dp-manual-status]");
    const url = String(scope?.querySelector("[data-dp-manual-url]")?.value || "").trim();
    const fromYard = String(scope?.querySelector("[data-dp-manual-salvage]")?.value || "").trim();
    const say = (message) => { if (status) status.textContent = message; };
    if (!url && !fromYard) return say("Paste a TCGplayer link or choose a card from Salvage first.");
    if (url && fromYard) return say("Use one or the other, not both.");

    const slot = ctx.slots.find((row) => String(row.slotId) === String(slotId));
    // The box is not rendered on the commander slot; this refuses it there too, so a
    // stale panel cannot leave the deck with a hundred cards and no commander.
    if (slot?.type === "Commander") return say("The commander is the one slot this cannot fill.");
    // A manual card answers to the card this slot was built around, so that is what it replaces.
    const replaces = slot?.shellName || "";
    let card = null;
    let looseFrom = "";
    if (fromYard) {
      const record = Object.values(state.liveSalvage || {}).find((entry) => entry.card?.name === fromYard);
      if (record) {
        card = {...record.card};
      } else {
        /* Not in the yard, so it is a copy another deck lists but is not holding. The
           deck it is listed in keeps listing it -- nothing is taken away there, because
           nothing was committed there; this just claims the loose copy for this slot. */
        const free = (ctx.freeCards || []).find((entry) => entry.name === fromYard);
        if (!free) return say("That card is not loose any more.");
        card = {...(ctx.cards[Lineup.normalizeName(fromYard)] || {}), name: fromYard};
        looseFrom = free.fromDeck || "";
      }
    } else {
      say("Looking it up…");
      try {
        const resolved = await Scryfall.createClient({}).resolveTcgplayerUrl(url);
        if (!resolved?.card) return say(resolved?.error || "No card matched that link.");
        card = resolved.card;
      } catch (error) {
        return say(error?.message || "That link could not be resolved.");
      }
    }

    const price = Number(card.price) || 0;
    const entry = {
      id: `manual-${ctx.deckId}-${itemKey(card)}`,
      name: card.name,
      quantity: Math.max(1, Number(slot?.quantity) || 1),
      manaCost: card.manaCost || "",
      typeLine: card.typeLine || "",
      oracleText: card.oracleText || "",
      keywords: card.keywords || [],
      colorIdentity: card.colorIdentity || [],
      commanderLegal: card.commanderLegal !== false,
      rarity: card.rarity || "",
      setName: card.setName || "",
      image: card.image || "",
      price, ceiling: Number(card.ceiling ?? price) || price,
      tcgplayerUrl: card.tcgplayerUrl || (/^https?:\/\//i.test(url) ? url : ""),
      gameChanger: Boolean(card.gameChanger),
      category: "manual",
      stage: "Manual",
      replaces,
      // Manual cards never went through the simulation. Saying so plainly is the honest
      // reading; the alternative is a blank that looks like a missing value.
      purpose: fromYard
        ? `Added by hand from ${looseFrom ? `a copy ${looseFrom} lists but is not holding` : "the Salvage yard"}. Not simulated — measured fields read n/a.`
        : "Added by hand from a TCGplayer link. Not simulated — measured fields read n/a.",
      why: "n/a — added by hand, not measured by the simulation.",
      whereToBuy: fromYard ? (looseFrom ? `Already owned · was loose in ${looseFrom}` : "Already owned · was in Salvage") : "Singles case",
      source: fromYard ? "salvage" : "tcgplayer",
      addedAt: new Date().toISOString()
    };
    entry.whyPrimary = entry.why;

    state.manualCards ||= {};
    const list = (state.manualCards[ctx.deckId] || []).filter((existing) => itemKey(existing) !== itemKey(entry));
    list.push(entry);
    state.manualCards[ctx.deckId] = list;

    // A card pulled out of the yard now has a deck home, so it leaves the yard -- unless
    // more copies are owned than the one this slot just took.
    if (fromYard) {
      const key = itemKey(entry);
      const owned = Number(state.boughtQuantities?.[key] || 1);
      const placed = Object.values(state.manualCards).flat().filter((existing) => itemKey(existing) === key).length;
      if (placed >= owned) delete state.liveSalvage[key];
    }
    // A card resolved from a link is one you still have to buy, so nothing is marked
    // owned here: it reaches the Shop as an unbought card in the plan, like any other.

    applyManualCards();
    saveState(`${entry.name} added to Deck ${ctx.deckId}`);
    renderDeckPage();
    showToast(`${entry.name} is now a Manual option on the ${replaces || "selected"} slot. Tick it to swap it in.`);
  }

  /**
   * Sends a hand-added card back to the bench: out of the slot, out of this deck, and
   * back into the Salvage yard where every deck can reach it again.
   *
   * Order matters. The slot is handed back FIRST, to whatever filled it before -- a
   * deck that loses a card without gaining one is ninety-nine cards, and the tally
   * would say so. Only once the slot is settled does the card leave.
   *
   * A card that was never owned does not go on the bench. The yard means "cards you
   * own that no deck has claimed", and a card you resolved from a link and have not
   * bought is not one of those; it simply leaves the slot, and the toast says so
   * rather than quietly inventing a copy.
   */
  function returnManualCard(slotId, entryId) {
    const ctx = deckPageContext();
    if (!ctx) return;
    const variantId = ctx.deckId;
    const plan = buyCatalog.plans[variantId];
    const list = state.manualCards?.[variantId] || [];
    if (!plan || !list.length) return;

    const model = Lineup.buildModel(plan);
    const entry = model.byId.get(String(entryId));
    if (!entry || entry.kind !== "manual") return;
    const card = list.find((candidate) => itemKey(candidate) === itemKey(entry.item));
    if (!card) return;

    // Hand the slot back before the card leaves it.
    const current = ensureBuyState(variantId);
    const active = Lineup.activeEntryForSlot(plan, current, entry.slotId);
    if (active?.id === entry.id) {
      const replacement = slotFallbackFor(model, entry);
      if (!replacement) {
        return showToast(`${card.name} is the only card this slot can hold, so it cannot go back yet.`);
      }
      assignSelection(current, Lineup.applyChoice(plan, current, replacement.id));
    }

    state.manualCards[variantId] = list.filter((candidate) => itemKey(candidate) !== itemKey(card));
    if (!state.manualCards[variantId].length) delete state.manualCards[variantId];

    const key = itemKey(card);
    const owned = card.source === "salvage" || Boolean(state.found?.[key]) || Number(state.boughtQuantities?.[key] || 0) > 0;
    if (owned && !state.liveSalvage?.[key]) {
      state.liveSalvage ||= {};
      state.liveSalvage[key] = {
        card: transferCardSnapshot(card),
        reason: `Taken back out of Deck ${plan.deckId ?? ""} · ${ctx.deckTitle || variantId}`.replace(/\s+·\s*$/, ""),
        sourceVariantId: variantId,
        sourceEntryId: entry.id,
        movedAt: new Date().toISOString()
      };
    }

    applyManualCards();
    saveState(`${card.name} sent back to the bench`);
    renderDeckPage();
    showToast(owned
      ? `${card.name} is back on the bench and free for any deck.`
      : `${card.name} left the slot. It was never on the bench — you have not bought it.`);
  }

  function deckPageClick(event) {
    let el;
    if ((el = event.target.closest("[data-dp-deck]"))) {
      deckPageState.deckIndex = Number(el.dataset.dpDeck) || 0;
      deckPageState.openSlot = null;
      renderDeckPage();
      return true;
    }
    if ((el = event.target.closest("[data-dp-grp]"))) {
      const key = el.dataset.dpGrp;
      deckPageState.closedGroups[key] = !deckPageState.closedGroups[key];
      renderDeckPage();
      return true;
    }
    /* The compliance panel ships closed, so its flag reads the other way round from the
       other two. Storing "closed" for all three and inverting one here keeps the default
       for each panel where it belongs -- in the markup that draws it. */
    if ((el = event.target.closest("[data-dp-panel]"))) {
      const key = el.dataset.dpPanel;
      if (key === "ready") deckPageState.closedPanels.ready = deckPageState.closedPanels.ready === false;
      else deckPageState.closedPanels[key] = !deckPageState.closedPanels[key];
      renderDeckPage();
      return true;
    }
    if ((el = event.target.closest("[data-dp-expand]"))) {
      const id = el.dataset.dpExpand;
      deckPageState.openSlot = deckPageState.openSlot === id ? null : id;
      renderDeckPage();
      return true;
    }
    if ((el = event.target.closest("[data-dp-rung]"))) {
      const ctx = deckPageContext();
      const Slot = window.MtgSlotModel;
      if (!ctx || !Slot) return true;
      const plan = buyCatalog.plans[ctx.deckId];
      /* A rung is not a whole hundred on every slot: a slot with no Tuned card has nothing
         to give when Tuned is asked for, and taking the rung literally left the deck short.
         So the requested rung wins wherever it is populated and Assigned fills the rest,
         which is the only way this button can keep the deck at exactly a hundred. */
      assignSelection(ensureBuyState(ctx.deckId),
        withAssignedFallback(ctx.deckId, plan, Slot.selectionForRung(plan, el.dataset.dpRung)));
      syncBoxesToOwned(ctx.deckId, plan);
      if (!state.deckRung) state.deckRung = {};
      state.deckRung[ctx.deckId] = el.dataset.dpRung;
      saveState();
      renderDeckPage();
      return true;
    }
    /* Reset returns Active to Assigned and touches nothing else. Every alternative the
       slot carries is still there afterwards -- resetting is choosing the recommendation
       again, not throwing the other candidates away. */
    if ((el = event.target.closest("[data-dp-reset]"))) {
      const ctx = deckPageContext();
      const Slot = window.MtgSlotModel;
      if (!ctx || !Slot) return true;
      const plan = buyCatalog.plans[ctx.deckId];
      const assigned = (state.assignedSelections || {})[ctx.deckId];
      if (!assigned) return true;
      const slotId = el.dataset.dpReset;
      const current = ensureBuyState(ctx.deckId);
      if (slotId === "deck") {
        assignSelection(current, assigned);
        saveState("Every slot back to its recommendation");
      } else {
        // One slot: take the Assigned entry for it and apply that single choice.
        const seat = Slot.deckSlots(plan, assigned, {}).find((sl) => sl.slotId === slotId);
        if (!seat || !seat.pick) return true;
        assignSelection(current, Lineup.applyChoice(plan, current, seat.pick.entryId));
        saveState(`${seat.pick.name} restored`);
      }
      syncBoxesToOwned(ctx.deckId, plan);
      renderDeckPage();
      return true;
    }
    /* Make Assigned is the deliberate other direction: the card in the slot becomes the
       recommendation, so a later reset comes back here instead of where it started. It is
       separate from choosing a rung precisely so that choosing one never does this. */
    if ((el = event.target.closest("[data-dp-makeassigned]"))) {
      const ctx = deckPageContext();
      const Slot = window.MtgSlotModel;
      if (!ctx || !Slot) return true;
      const plan = buyCatalog.plans[ctx.deckId];
      const slotId = el.dataset.dpMakeassigned;
      const live = Slot.deckSlots(plan, ensureBuyState(ctx.deckId), {}).find((sl) => sl.slotId === slotId);
      if (!live || !live.pick) return true;
      state.assignedSelections ||= {};
      const next = cloneSelection(state.assignedSelections[ctx.deckId] || ensureBuyState(ctx.deckId));
      assignSelection(next, Lineup.applyChoice(plan, next, live.pick.entryId));
      state.assignedSelections[ctx.deckId] = next;
      saveState(`${live.pick.name} is now this slot's recommendation`);
      renderDeckPage();
      return true;
    }
    if (event.target.closest("[data-dp-filter-clear]")) {
      const ctx = deckPageContext();
      /* Clear resets what is HIDING rows. How they are stacked is not one of those --
         someone who put the deck in shopping order did not ask for it back in type
         order just because they dropped a search term. */
      if (ctx) deckPageState.filters[ctx.deckId] = {query: "", type: "all", rung: "all",
        where: "all", status: "all", active: "all",
        groupBy: ctx.filters.groupBy || "type", sortBy: ctx.filters.sortBy || ""};
      renderDeckPage();
      return true;
    }
    /* A best-fit button is the dropdown beneath it, filled in and submitted. It goes
       through submitManualCard rather than taking a shortcut so the card is filed,
       priced, pulled out of the yard and reported exactly as a hand-picked one is --
       one way into a slot, not two that can drift apart. */
    if ((el = event.target.closest("[data-dp-fit]"))) {
      const raw = el.dataset.dpFit || "";
      const cut = raw.indexOf("|");
      const slotId = cut < 0 ? raw : raw.slice(0, cut);
      const name = cut < 0 ? "" : raw.slice(cut + 1);
      const scope = document.querySelector(`[data-dp-manual="${CSS.escape(slotId)}"]`);
      const select = scope?.querySelector("[data-dp-manual-salvage]");
      const url = scope?.querySelector("[data-dp-manual-url]");
      if (url) url.value = "";
      if (select) select.value = name;
      submitManualCard(slotId);
      return true;
    }
    /* Every box at once. This writes only deckActive -- the selection, the rung and the
       ownership ledger are all left alone, because claiming a slot has never been a claim
       about what is in it. The seed flag is already set for any deck being looked at, so
       deselecting all does not come back on the next render. */
    if ((el = event.target.closest("[data-dp-claim]"))) {
      const ctx = deckPageContext();
      if (!ctx) return true;
      const next = {};
      if (el.dataset.dpClaim === "all") ctx.slots.forEach((slot) => { if (slot.pick) next[slot.slotId] = true; });
      state.deckActive ||= {};
      state.deckActive[ctx.deckId] = next;
      state.deckActiveSeed ||= {};
      state.deckActiveSeed[ctx.deckId] = true;
      saveState(el.dataset.dpClaim === "all" ? "Every slot claimed" : "Every box cleared");
      renderDeckPage();
      return true;
    }
    if ((el = event.target.closest("[data-dp-manual-submit]"))) {
      submitManualCard(el.dataset.dpManualSubmit);
      return true;
    }
    // Ahead of [data-dp-pick]: the return button sits over the tile, and a click on it
    // must not also be read as picking the card it is removing.
    if ((el = event.target.closest("[data-dp-manual-return]"))) {
      const [slotId, entryId] = el.dataset.dpManualReturn.split("|");
      returnManualCard(slotId, entryId);
      return true;
    }
    if ((el = event.target.closest("[data-dp-pick]"))) {
      const entryId = el.dataset.dpPick.split("|")[1];
      const ctx = deckPageContext();
      if (!ctx) return true;
      const plan = buyCatalog.plans[ctx.deckId];
      const current = ensureBuyState(ctx.deckId);
      assignSelection(current, Lineup.applyChoice(plan, current, entryId));
      saveState();
      renderDeckPage();   // the rail deliberately stays open after a pick
      return true;
    }
    return false;
  }

  /**
   * Recompute one deck's box ticks from what is actually in hand.
   *
   * Setting a rung rewrites every slot at once, so the ticks have to be rebuilt
   * with it: a tick is a claim about a SLOT, and once the slot holds a different
   * card the old claim is about a card that is no longer there. Rebuilding also
   * does the useful half of the job -- a rung whose cards are already in the box
   * arrives with the box already checked, instead of asking for ninety more
   * clicks to say what the ownership ledger already knows.
   *
   * Two things it will not do. It never invents ownership, only reads it. And it
   * never claims a copy another deck's box already holds: there are six boxes and
   * one physical copy sits in exactly one of them.
   */
  function syncBoxesToOwned(variantId, plan) {
    const Slot = window.MtgSlotModel;
    if (!Slot || !plan) return;
    const owned = Slot.normalizeOwned(state);

    const heldElsewhere = {};
    selectedVariants().forEach((other) => {
      if (other.id === variantId) return;
      const otherPlan = buyCatalog && buyCatalog.plans ? buyCatalog.plans[other.id] : null;
      if (!otherPlan) return;
      const ticked = (state.deckActive && state.deckActive[other.id]) || {};
      Slot.deckSlots(otherPlan, ensureBuyState(other.id), {owned}).forEach((slot) => {
        if (slot.pick && ticked[slot.slotId]) heldElsewhere[Slot.ownedKey(slot.pick.name)] = true;
      });
    });

    const next = {};
    Slot.deckSlots(plan, ensureBuyState(variantId), {owned}).forEach((slot) => {
      if (!slot.pick) return;
      if (heldElsewhere[Slot.ownedKey(slot.pick.name)]) return;
      // Partly here is not here: two of the three copies a slot needs cannot be
      // sleeved as if they were three.
      if (Slot.acquisitionOf(owned, slot.pick.name, slot.pick.quantity) !== Slot.ACQUISITION.HAND) return;
      next[slot.slotId] = true;
    });
    if (!state.deckActive) state.deckActive = {};
    state.deckActive[variantId] = next;
  }

  function deckPageChange(event) {
    const paid = event.target.closest("[data-dp-paid]");
    if (paid) {
      // Committed on change, not on every keystroke, so a half-typed "1" never lands.
      const stored = commitPaidPrice(paid.dataset.dpPaid, paid.value, "Paid");
      paid.value = stored === null ? "" : stored.toFixed(2);
      paid.parentElement?.classList.toggle("is-set", stored !== null);
      /* The row shows what a card cost, and a price you just typed IS what it cost, so
         the page has to be rebuilt rather than only the input patched. Without this the
         row kept showing the target it had been replaced by, and a cost sort disagreed
         with the number printed beside it. withUiState keeps the open slot open and the
         cursor where it was. */
      renderDeckPage();
      return true;
    }
    const filter = event.target.closest("[data-dp-filter]");
    if (filter) {
      const ctx = deckPageContext();
      if (ctx) ctx.filters[filter.dataset.dpFilter] = filter.value;
      renderDeckPage();
      return true;
    }
    const el = event.target.closest("[data-dp-box]");
    if (!el) return false;
    const ctx = deckPageContext();
    if (!ctx) return true;
    if (!state.deckActive) state.deckActive = {};
    if (!state.deckActive[ctx.deckId]) state.deckActive[ctx.deckId] = {};
    /* Assignment only. This used to also mark the card in hand so the row would stop
       reading "to buy" -- which made the tick one-way: untick an ordered card and it came
       back "Owned, no box", because the raise had no matching fall, and for as long as it
       was ticked the ledger held one physical copy twice, once as held and once as on
       order. deck-page's label carries both facts now, so the ledger can be left alone
       and the tick is exactly as reversible as it looks. */
    if (el.checked) state.deckActive[ctx.deckId][el.dataset.dpBox] = true;
    else delete state.deckActive[ctx.deckId][el.dataset.dpBox];
    saveState();
    renderDeckPage();
    return true;
  }

  function deckPagePreview(event) {
    const el = event.target.closest("[data-dp-prev]");
    if (!el || !window.MtgDeckPage) return;
    const parts = el.dataset.dpPrev.split("|");
    const host = document.getElementById("dp-prev-" + parts[0]);
    if (!host) return;
    const ctx = deckPageContext();
    if (!ctx) return;
    const glyphs = {active: "●", other: "◆", bench: "◇", ordered: "⧖", buy: "○"};
    const labels = {active: "In the box", other: "In another box", bench: "Owned, no box", ordered: "Ordered", buy: "To buy"};
    const kind = parts[2];
    host.innerHTML = window.MtgDeckPage.previewMarkup(ctx, parts[1],
      {kind: kind, glyph: glyphs[kind] || "○", label: labels[kind] || "To buy"},
      parts[3] === "" ? null : Number(parts[3]));
  }

  document.addEventListener("click", (event) => { deckPageClick(event); });
  document.addEventListener("change", (event) => { deckPageChange(event); });
  document.addEventListener("mouseover", deckPagePreview);
  document.addEventListener("focusin", deckPagePreview);

  // ---- Shop page bridge --------------------------------------------------
  // The same slots, re-keyed by card name and merged across every selected deck.
  const shopFilters = {
    status: [], color: [], type: [], band: [], spot: [], rarity: [], deck: [], rung: [],
    query: "", view: "table", groupBy: "spot", sortKey: "name", sortDir: "asc",
    // Phones only: whether the filter/group/sort block is unfolded. Desktop ignores it
    // and shows the block regardless, so this never hides anything on a wide screen.
    barOpen: false,
    // Store view: normally it shows only what is still owed. This opens it to everything,
    // for the case where you want to check whether you already have the card in your hand.
    storeAll: false
  };

  /* Cards ticked off during this visit to the Store view. Deliberately not saved: it is
     "what I have picked up since I walked in", so it should be empty the next time the
     app is opened, and the ownership ledger -- which IS saved -- already carries the fact
     that the card was bought. What this buys is an Undo that stays where your eye is. */
  let shopPickedUp = new Set();
  /* What the ownership record said before a Buy, so Undo puts back exactly that rather
     than guessing at a decrement. A mistap at a booth has to cost one tap, not an audit. */
  const shopBuyUndo = new Map();
  /* And what each box was holding, for the same reason: a buy writes holds as well as the
     ledger, so an undo that only restores the ledger leaves the boxes over-claiming. */
  const shopHoldUndo = new Map();

  /**
   * What the Bench holds: cards you own that sit in no deck's box, each with the
   * best slot it could fill in every deck. A destination names the rung it would
   * occupy - or says it is an ad-hoc transfer - and, crucially, the state of the
   * card it displaces, because covering an unbought card saves money while
   * displacing one you own only moves it.
   */
  function benchItems(decks, owned, cards, deckLabels) {
    const Slot = window.MtgSlotModel;
    /* Which deck holds a copy, and how many copies the boxes hold between them. The
       second number is what decides whether a card is on the bench: owning two Prophetic
       Prisms with one sleeved leaves one loose, and a boolean "is it in a box" hid it. */
    const boxed = {};
    const boxedCount = {};
    decks.forEach((d) => {
      const ticked = (state.deckActive && state.deckActive[d.id]) || {};
      d.slots.forEach((slot) => {
        if (!slot.pick || !ticked[slot.slotId]) return;
        const key = Slot.ownedKey(slot.pick.name);
        boxed[key] = boxed[key] || d.id;
        const held = ((state.deckHolds || {})[d.id] || {})[key];
        boxedCount[key] = (boxedCount[key] || 0) + (held ? held.inHand : Math.max(1, Number(slot.pick.quantity) || 1));
      });
    });
    const spareCopies = (name) => {
      const key = Slot.ownedKey(name);
      return (Slot.ownedCount(owned, name).inHand || 0) - (boxedCount[key] || 0);
    };

    /* Two ways a card belongs on the Bench, and it used to be built from only one of them.
       Walking the decks' rungs finds cards a slot could take -- which is the useful half --
       but it silently drops everything else you own and have not filed, because no plan
       mentions it. Twenty-five of sixty-eight loose cards were invisible that way, and a
       bench that hides a third of the shelf is not a record of what is unassigned. So the
       yard is walked too, and a card nothing wants is listed saying exactly that. */
    const loose = [];
    Object.values(state.liveSalvage || {}).forEach((entry) => {
      const name = entry && entry.card && entry.card.name;
      if (name) loose.push({name, price: Number(entry.card.price) || 0});
    });
    const fromRungs = [];
    decks.forEach((d) => d.slots.forEach((slot) => slot.rungs.forEach((rung) => {
      fromRungs.push({name: rung.name, price: rung.price});
    })));

    const seen = new Set();
    const items = [];
    [...fromRungs, ...loose].forEach((rung) => {
      const key = Slot.ownedKey(rung.name);
      if (seen.has(key)) return;
      // Basics are a pool, not bench cards. Eighty spare Plains is one fact about the
      // shelf, already shown on every basic-land row; it is not eighty tiles to scroll.
      if (Slot.isBasicLand({name: rung.name, typeLine: (cards[Lineup.normalizeName(rung.name)] || {}).typeLine})) return;
      if (spareCopies(rung.name) < 1) return;
      seen.add(key);
      const fact = cards[Lineup.normalizeName(rung.name)] || {};
      const roles = [];
      const destinations = [];
      decks.forEach((target) => {
        let best = null;
        target.slots.forEach((s) => {
          const match = s.rungs.find((r) => Slot.ownedKey(r.name) === key);
          if (!match) return;
          roles.push(`${deckLabels[target.id]} · ${Slot.RUNG_LABEL[match.rung] || match.rung}`);
          if (s.pick && Slot.ownedKey(s.pick.name) === key) return;   // already the pick here
          const score = {max: 88, enhance: 82, tuned: 79, fun: 74, base: 71}[match.rung] || 70;
          if (!best || score > best.score) best = {slot: s, match, score, deck: target};
        });
        if (!best) return;
        const replacedPick = best.slot.pick;
        const rl = replacedPick
          ? deckPageLocationFor(target, replacedPick, best.slot, owned, boxed, deckLabels)
          : {kind: "empty", label: "empty slot", glyph: "○", name: null, price: 0};
        destinations.push({
          deckId: target.id, slotId: best.slot.slotId, entryId: best.match.entryId,
          // Every destination here is a real rung of that slot's ladder. Cards that
          // merely *fit* a slot without being on its ladder are ad-hoc transfers and
          // need the full compatibility check; they are not offered yet.
          rung: Slot.RUNG_LABEL[best.match.rung] || null,
          label: `${deckLabels[target.id]} · ${Slot.RUNG_LABEL[best.match.rung]} rung · replace ${
            replacedPick ? replacedPick.name : "an empty slot"} · fit ${best.score}`,
          action: `replace ${replacedPick ? replacedPick.name : "the empty slot"}`,
          reasons: ["Commander legal + colour legal", `${best.slot.type} slot`],
          replaced: rl
        });
      });
      destinations.sort((a, b) => (b.replaced.kind === "buy" ? 1 : 0) - (a.replaced.kind === "buy" ? 1 : 0));
      items.push({
        key, name: rung.name, price: rung.price, spot: Slot.vendorSpot(rung.price),
        typeLine: fact.typeLine || "", image: fact.image || "",
        rarityKey: ({common: "C", uncommon: "U", rare: "R", special: "S", mythic: "M", bonus: "B"})[fact.rarity] || "C",
        roles: Array.from(new Set(roles)), destinations
      });
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  function deckPageLocationFor(target, pick, slot, owned, boxed, deckLabels) {
    const Slot = window.MtgSlotModel;
    const acq = Slot.acquisitionOf(owned, pick.name, pick.quantity);
    const base = {name: pick.name, price: pick.price || 0};
    if (acq === Slot.ACQUISITION.NONE) return Object.assign(base, {kind: "buy", glyph: "○", label: "To buy"});
    if (acq === Slot.ACQUISITION.ORDERED) return Object.assign(base, {kind: "ordered", glyph: "⧖", label: "Ordered"});
    const ticked = (state.deckActive && state.deckActive[target.id]) || {};
    if (ticked[slot.slotId]) return Object.assign(base, {kind: "active", glyph: "●", label: "In the box"});
    const holder = boxed[Slot.ownedKey(pick.name)];
    if (holder && holder !== target.id) {
      return Object.assign(base, {kind: "other", glyph: "◆", label: "In " + (deckLabels[holder] || holder) + "'s box"});
    }
    return Object.assign(base, {kind: "bench", glyph: "◇", label: "Owned, no box"});
  }

  /**
   * What a card actually cost, as distinct from what it is worth.
   *
   * state.purchasePrices is keyed by the same slug ownedKey and itemKey both produce,
   * so one number covers a card wherever it turns up -- the Shop row you bought it on,
   * the slot it ends up in, the deck total underneath. Undefined means unpriced, which
   * is not the same as free: a zero is a real answer someone typed.
   */
  function paidFor(name) {
    const value = state.purchasePrices?.[itemKey({name})];
    return value === undefined || value === null ? null : Number(value);
  }

  /** One writer, so a price typed on the Shop and a price typed on a slot agree. */
  function commitPaidPrice(key, raw, label) {
    const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
    state.purchasePrices ||= {};
    if (!cleaned) delete state.purchasePrices[key];
    else state.purchasePrices[key] = Math.round(Number(cleaned) * 100) / 100;
    const stored = state.purchasePrices[key];
    saveState(stored === undefined ? `${label || "Price"} cleared` : `${label || "Paid"} ${money(stored)}`);
    return stored === undefined ? null : stored;
  }

  function shopContext() {
    const Slot = window.MtgSlotModel;
    const variants = selectedVariants();
    if (!Slot || !variants.length) return null;
    const owned = Slot.normalizeOwned(state);
    const cards = deckPageCards || {};
    const deckLabels = {};
    const decks = [];
    variants.forEach((v) => {
      const plan = buyCatalog && buyCatalog.plans ? buyCatalog.plans[v.id] : null;
      if (!plan) return;
      deckLabels[v.id] = deckTag(v);
      decks.push({id: v.id, slots: Slot.deckSlots(plan, ensureBuyState(v.id), {owned, cards})});
    });
    if (!decks.length) return null;
    return {
      rows: Slot.shopRows(decks, owned, allocateCopies(variants, owned, cards).allocated),
      factFor: (name) => cards[Lineup.normalizeName(name)] || cardMetadata[itemKey({name})] || {},
      paidFor,
      bench: benchItems(decks, owned, cards, deckLabels),
      intakeOpen: shopIntakeOpen,
      picked: shopPickedUp,
      deckLabels, filters: shopFilters, owned, decks
    };
  }

  let shopIntakeOpen = false;

  /**
   * Typing a card onto the Bench. Same two routes the Salvage intake has always taken --
   * a TCGplayer link through the resolver that understands affiliate wrappers and
   * set-prefixed slugs, or a bare name through Scryfall's named lookup -- and the same
   * writer, addCardToSalvage, so a card typed here is indistinguishable from one pushed
   * out of a deck. Lines that fail are left in the box with the reason, so a typo can be
   * fixed rather than retyped from scratch.
   */
  async function submitBenchIntake() {
    const scope = $("[data-sp-intake]");
    const input = scope?.querySelector("[data-sp-intake-input]");
    const status = scope?.querySelector("[data-sp-intake-status]");
    const button = scope?.querySelector("[data-sp-intake-submit]");
    const say = (message) => { if (status) status.textContent = message; };
    const lines = String(input?.value || "").split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return say("Paste a link or a card name first.");
    if (button) button.disabled = true;
    const client = Scryfall.createClient({});
    const added = [];
    const failed = [];
    /* A lookup that never comes back would leave the button disabled and the reader with
       no way out, so each line gets its own ceiling. Fifteen seconds is far longer than
       Scryfall needs and short enough that an outage reads as an outage. */
    const withinTimeout = (promise) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("the lookup timed out")), 15000))
    ]);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      say(`Looking up ${index + 1} of ${lines.length}\u2026`);
      try {
        const resolved = /^https?:\/\//i.test(line)
          ? await withinTimeout(client.resolveTcgplayerUrl(line))
          : {card: await withinTimeout(client.named(line)), error: "no card by that name"};
        if (!resolved.card) { failed.push(`${line} \u2014 ${resolved.error || "no card matched"}`); continue; }
        added.push(addCardToSalvage(resolved.card, line));
      } catch (error) {
        failed.push(`${line} \u2014 ${error.message || "lookup failed"}`);
      }
    }
    if (button) button.disabled = false;
    if (added.length) saveState(`${added.length} card${added.length === 1 ? "" : "s"} added to the Bench`);
    // Re-render to show what landed, then put the lines that failed back: the panel is
    // rebuilt from scratch, so anything written to the old textarea goes with it, and
    // retyping a link you already pasted is the one thing this should never ask for.
    renderShopPage();
    const box = $("[data-sp-intake-input]");
    if (box) box.value = failed.map((entry) => entry.split(" \u2014 ")[0]).join("\n");
    const after = $("[data-sp-intake-status]");
    if (after) {
      after.textContent = added.length
        ? `Added ${added.map((card) => card.name).join(", ")}${failed.length ? `. Still to fix: ${failed.join("; ")}` : "."}`
        : `Nothing added. ${failed.join("; ")}`;
    }
    if (added.length) showToast(`${added.length} card${added.length === 1 ? "" : "s"} on the Bench.`);
  }

  function renderShopPage() {
    const host = $("#view-shop2");
    if (!host || !window.MtgShopPage) return;
    if (!deckPageCards) {
      host.innerHTML = '<div class="loading-card">Loading the card catalog…</div>';
      loadDeckPageCards().then(renderShopPage);
      return;
    }
    const ctx = shopContext();
    if (!ctx) { host.innerHTML = '<div class="loading-card">Choose a variant for at least one deck on Compare, then come back.</div>'; return; }
    /* Every tap on this page rebuilds it, and in the Store view that is a tap per card.
       Losing your place forty rows into a seller's box, once per purchase, would make the
       view useless -- so the same wrapper the Deck page uses puts the scroll, the focus
       and the open panels back where they were. */
    withUiState("#view-shop2", () => window.MtgShopPage.render(host, ctx));
  }

  /** One writer for ownership, so in-hand and ordered can never drift apart. */
  function bumpOwned(name, which, quantity) {
    const Slot = window.MtgSlotModel;
    if (!state.owned) state.owned = Slot.normalizeOwned(state);
    const key = Slot.ownedKey(name);
    const rec = state.owned[key] || (state.owned[key] = {inHand: 0, ordered: 0});
    const cap = Math.max(1, Number(quantity) || 1);
    if (which === "need") { if (rec.inHand > 0) rec.inHand -= 1; else if (rec.ordered > 0) rec.ordered -= 1; }
    if (which === "ordered" && rec.inHand + rec.ordered < cap) rec.ordered += 1;
    if (which === "hand" && rec.inHand < cap) { rec.inHand += 1; if (rec.ordered > 0) rec.ordered -= 1; }
    // Keep the legacy pair in step until the old tabs are gone.
    state.found[key] = rec.inHand > 0;
    state.boughtQuantities[key] = rec.inHand;
    if (!rec.inHand) delete state.found[key];
    saveState();
  }

  /* A card just bought has to land in a box, and deckHolds is where a box says what it
     holds. Without writing it the purchase went nowhere the Shop could see: the audit had
     recorded "this deck holds none of these", the allocator honours that so a deck the
     audit denied is never handed a spare, and the card you had just paid for stayed on the
     list. So the copies now in hand are dealt out to the decks that want them.

     The order is Rob's: deck 5 first, then 4, 2, 7, 3, 1. A card three decks want and one
     copy bought satisfies the first of them and leaves the other two still owing one,
     which is the truth. */
  const CLAIM_ORDER = ["5o", "4e", "2c", "7e", "3o", "1b"];
  function claimBoughtCard(ctx, key) {
    const Slot = window.MtgSlotModel;
    const rank = (id) => { const i = CLAIM_ORDER.indexOf(id); return i < 0 ? CLAIM_ORDER.length : i; };
    const decks = (ctx.decks || []).slice().sort((a, b) => rank(a.id) - rank(b.id));
    state.deckHolds = state.deckHolds || {};
    state.deckActive = state.deckActive || {};
    /* Copies nobody's box has yet. Every existing hold comes off the total first -- not
       one deck at a time as they are visited, or a deck early in the order would be handed
       a copy a later one is already holding. */
    const claimedNow = Object.values(state.deckHolds)
      .reduce((n, per) => n + ((per[key] || {}).inHand || 0), 0);
    let free = Math.max(0, ((Slot.normalizeOwned(state)[key] || {}).inHand || 0) - claimedNow);
    const filled = [];
    for (const deck of decks) {
      const slot = deck.slots.find((s) => s.pick && Slot.ownedKey(s.pick.name) === key);
      if (!slot) continue;
      const per = state.deckHolds[deck.id] || (state.deckHolds[deck.id] = {});
      const hold = per[key] || (per[key] = {inHand: 0, ordered: 0});
      const want = Math.max(1, Number(slot.pick.quantity) || 1);
      const add = Math.min(Math.max(0, want - hold.inHand), free);
      if (add > 0) {
        hold.inHand += add;
        free -= add;
        filled.push((ctx.deckLabels || {})[deck.id] || deck.id);
      }
      state.deckActive[deck.id] = state.deckActive[deck.id] || {};
      state.deckActive[deck.id][slot.slotId] = true;
    }
    saveState();
    return filled.length ? `into ${filled.join(" and ")}` : "";
  }

  function shopClick(event) {
    let el;
    if (!event.target.closest(".sp-drop")) $$(".sp-pop").forEach((pop) => { pop.hidden = true; });
    if ((el = event.target.closest("[data-sp-drop]"))) {
      const pop = document.getElementById("sp-pop-" + el.dataset.spDrop);
      const wasHidden = pop && pop.hidden;
      $$(".sp-pop").forEach((p) => { p.hidden = true; });
      if (pop) pop.hidden = !wasHidden;
      return true;
    }
    if ((el = event.target.closest("[data-sp-all]"))) {
      const ctx = shopContext();
      const key = el.dataset.spAll;
      shopFilters[key] = window.MtgShopPage.values(window.MtgShopPage.decorate(ctx.rows, ctx.factFor, ctx.deckLabels), key);
      renderShopPage(); return true;
    }
    if ((el = event.target.closest("[data-sp-none]"))) { shopFilters[el.dataset.spNone] = []; renderShopPage(); return true; }
    if ((el = event.target.closest("[data-sp-unchip]"))) {
      const [key, value] = el.dataset.spUnchip.split("|");
      shopFilters[key] = (shopFilters[key] || []).filter((v) => v !== value);
      renderShopPage(); return true;
    }
    if (event.target.closest("[data-sp-clear]")) {
      window.MtgShopPage.FILTERS.forEach((f) => { shopFilters[f.key] = []; });
      shopFilters.query = ""; renderShopPage(); return true;
    }
    if (event.target.closest("[data-sp-mob]")) { shopFilters.barOpen = !shopFilters.barOpen; renderShopPage(); return true; }
    if ((el = event.target.closest("[data-sp-view]"))) {
      const next = el.dataset.spView;
      /* Arriving at the Store is arriving at a booth: the list of what you have already
         picked up starts empty, and grouping falls to the seller's own order rather than
         the app's, which is what you will be scanning against. */
      if (next === "store" && shopFilters.view !== "store") {
        shopPickedUp = new Set();
        shopFilters.sortKey = "name";
        shopFilters.sortDir = "asc";
        if (shopFilters.groupBy === "spot") shopFilters.groupBy = "letter";
      }
      shopFilters.view = next; renderShopPage(); return true;
    }
    if (event.target.closest("[data-sp-storeall]")) { shopFilters.storeAll = !shopFilters.storeAll; renderShopPage(); return true; }
    /* One tap, one card off the list. It fills the row rather than adding a copy at a
       time, because the row is one purchase -- twelve Plains is a stack, not twelve
       decisions -- and because a half-filled row at a booth is a row you have to come
       back to. The tick is recorded so the row can stay put with an Undo on it. */
    if ((el = event.target.closest("[data-sp-buy]"))) {
      const key = el.dataset.spBuy;
      const ctx = shopContext();
      const row = ctx && ctx.rows.find((r) => r.key === key);
      if (row) {
        const before = (state.owned && state.owned[key]) ? {...state.owned[key]} : {inHand: 0, ordered: 0};
        shopBuyUndo.set(key, before);
        const holdsBefore = {};
        for (const [deckId, per] of Object.entries(state.deckHolds || {})) {
          holdsBefore[deckId] = {...(per[key] || {inHand: 0, ordered: 0})};
        }
        shopHoldUndo.set(key, holdsBefore);
        for (let i = row.inHand; i < row.quantity; i += 1) bumpOwned(row.name, "hand", row.quantity);
        const claimed = claimBoughtCard(ctx, key);
        shopPickedUp.add(key);
        renderShopPage();
        showToast(`${row.name} \u2014 in hand${claimed ? ` \u00b7 ${claimed}` : ""}`);
      }
      return true;
    }
    /* The price on a gallery tile is the Paid box, in its resting state. Tapping swaps
       the two in place rather than re-rendering, so nothing moves under your thumb and
       the keyboard opens on the field you meant. */
    if ((el = event.target.closest("[data-sp-price]"))) {
      const wrap = el.parentElement;
      const edit = wrap && wrap.querySelector(".sp-gedit");
      if (edit) {
        el.hidden = true;
        edit.hidden = false;
        const input = edit.querySelector("input");
        input.focus();
        input.select();
      }
      return true;
    }
    if ((el = event.target.closest("[data-sp-unbuy]"))) {
      const key = el.dataset.spUnbuy;
      const before = shopBuyUndo.get(key);
      if (before) {
        // The holds the buy wrote have to come back with the ledger, or the boxes keep
        // claiming a card the collection no longer says you own.
        const holds = shopHoldUndo.get(key);
        if (holds) {
          for (const [deckId, rec] of Object.entries(holds)) {
            if (state.deckHolds && state.deckHolds[deckId]) state.deckHolds[deckId][key] = {...rec};
          }
          shopHoldUndo.delete(key);
        }
        if (!state.owned) state.owned = window.MtgSlotModel.normalizeOwned(state);
        state.owned[key] = {inHand: before.inHand, ordered: before.ordered};
        state.found[key] = before.inHand > 0;
        state.boughtQuantities[key] = before.inHand;
        if (!before.inHand) delete state.found[key];
        shopBuyUndo.delete(key);
        saveState();
      }
      shopPickedUp.delete(key);
      renderShopPage();
      return true;
    }
    if (event.target.closest("[data-sp-intake-toggle]")) { shopIntakeOpen = !shopIntakeOpen; renderShopPage(); return true; }
    if (event.target.closest("[data-sp-intake-submit]")) { submitBenchIntake(); return true; }
    if ((el = event.target.closest("[data-sp-sort]"))) {
      const key = el.dataset.spSort;
      if (shopFilters.sortKey === key) shopFilters.sortDir = shopFilters.sortDir === "asc" ? "desc" : "asc";
      else { shopFilters.sortKey = key; shopFilters.sortDir = "asc"; }
      renderShopPage(); return true;
    }
    if ((el = event.target.closest("[data-sp-assign]"))) {
      const [key, index] = el.dataset.spAssign.split("|");
      const ctx = shopContext();
      const item = ctx && (ctx.bench || []).find((b) => b.key === key);
      const sel = document.getElementById("sp-dest-" + key);
      const dest = item && item.destinations[Number(sel ? sel.value : index) || 0];
      if (!dest) return true;
      const plan = buyCatalog.plans[dest.deckId];
      const current = ensureBuyState(dest.deckId);
      assignSelection(current, Lineup.applyChoice(plan, current, dest.entryId));
      if (!state.deckActive) state.deckActive = {};
      if (!state.deckActive[dest.deckId]) state.deckActive[dest.deckId] = {};
      state.deckActive[dest.deckId][dest.slotId] = true;
      /* The card that was in this slot is now out of it, and if the box was holding a
         physical copy that copy is loose. Releasing the hold is what puts it on the Bench,
         because the Bench is spare copies -- and without it the app would go on claiming a
         card that is sitting in your hand while the incoming one had no box at all. */
      const Slot = window.MtgSlotModel;
      const holds = (state.deckHolds = state.deckHolds || {});
      const per = holds[dest.deckId] || (holds[dest.deckId] = {});
      const out = dest.replaced && dest.replaced.name ? Slot.ownedKey(dest.replaced.name) : null;
      let freed = null;
      if (out && per[out] && per[out].inHand > 0) {
        per[out].inHand -= 1;
        freed = dest.replaced.name;
      }
      // And the card moving in takes the box it just joined, up to what the slot asks for.
      const inKey = Slot.ownedKey(item.name);
      const spare = ((Slot.normalizeOwned(state)[inKey] || {}).inHand || 0)
        - Object.values(holds).reduce((n, m) => n + ((m[inKey] || {}).inHand || 0), 0);
      if (spare > 0) {
        const rec = per[inKey] || (per[inKey] = {inHand: 0, ordered: 0});
        rec.inHand += 1;
      }
      saveState();
      renderShopPage();
      showToast(`${item.name} assigned — ${dest.label}${freed ? ` · ${freed} is on the Bench` : ""}`);
      return true;
    }
    if ((el = event.target.closest("[data-sp-tri] button"))) {
      event.stopPropagation();
      const key = el.closest("[data-sp-tri]").dataset.spTri;
      const ctx = shopContext();
      const row = ctx && ctx.rows.find((r) => r.key === key);
      if (row) { bumpOwned(row.name, el.dataset.spS, row.quantity); renderShopPage(); }
      return true;
    }
    return false;
  }

  function shopChange(event) {
    const chk = event.target.closest("[data-sp-chk]");
    if (chk) {
      const [key, value] = chk.dataset.spChk.split("|");
      const list = shopFilters[key] || (shopFilters[key] = []);
      if (chk.checked) { if (list.indexOf(value) < 0) list.push(value); }
      else shopFilters[key] = list.filter((v) => v !== value);
      renderShopPage();
      const pop = document.getElementById("sp-pop-" + key);
      if (pop) pop.hidden = false;
      return true;
    }
    if (event.target.dataset && event.target.dataset.spDest) { renderShopPage(); return true; }
    if (event.target.id === "sp-group") { shopFilters.groupBy = event.target.value; renderShopPage(); return true; }
    if (event.target.id === "sp-sort") { shopFilters.sortKey = event.target.value; renderShopPage(); return true; }
    const paid = event.target.closest("[data-sp-paid]");
    if (paid) {
      // No re-render: the row is already showing what was typed, and rebuilding the
      // table under a field someone is still tabbing through loses their place.
      const stored = commitPaidPrice(paid.dataset.spPaid, paid.value, "Paid");
      paid.value = stored === null ? "" : stored.toFixed(2);
      closeGalleryPrice(paid);
      paid.closest("tr, .sp-card")?.classList.toggle("is-paid", stored !== null);
      updateShopPaidTotal();
      return true;
    }
    return false;
  }

  /* Put a gallery tile's price back to being text. The figure it goes back to is the
     row's cost, not the per-copy price just typed, because that is what the tile showed
     before it was tapped and a tile that reads differently after an edit than before one
     looks like the edit did something else. */
  function closeGalleryPrice(input) {
    const edit = input.closest(".sp-gedit");
    if (!edit) return;
    const wrap = edit.parentElement;
    const button = wrap && wrap.querySelector("[data-sp-price]");
    if (!button) return;
    const key = input.dataset.spPaid;
    const ctx = shopContext();
    const row = ctx && ctx.rows.find((r) => r.key === key);
    const paid = paidFor(row ? row.name : "");
    const unit = paid === null ? Number(row && row.price) || 0 : paid;
    const known = paid !== null || Number(row && row.price) > 0;
    button.textContent = known ? money(unit * (row ? row.quantity : 1)) : "?";
    button.classList.toggle("is-paid", paid !== null);
    edit.hidden = true;
    button.hidden = false;
  }

  /* The running total is the one figure that has to move the moment a price lands,
     since it is the answer to "what has this actually cost me". */
  function updateShopPaidTotal() {
    const chip = $("[data-sp-paid-total]");
    if (!chip) return;
    const ctx = shopContext();
    if (!ctx) return;
    const rows = window.MtgShopPage.decorate(ctx.rows, ctx.factFor, ctx.deckLabels, ctx.paidFor);
    const total = rows.reduce((sum, row) => sum + (row.paid === null ? 0 : row.paid * row.quantity), 0);
    const priced = rows.filter((row) => row.paid !== null).length;
    chip.innerHTML = `<b class="dp-num">${money(total)}</b> paid \u00b7 ${priced}/${rows.length} priced`;
  }

  /* The compliance panel is a native <details>, so clicking its summary opens it without
     going through the handler above. Recording that here keeps the flag and the DOM in
     step; no re-render, because the browser has already done the work. */
  document.addEventListener("toggle", (event) => {
    const box = event.target;
    if (!box || !box.classList || !box.classList.contains("dp-ready")) return;
    deckPageState.closedPanels.ready = box.open ? false : undefined;
  }, true);

  /* Enter is how you finish typing a price on a phone: it closes the keyboard, so it has
     to be what commits. Escape puts the tile back without writing anything. */
  document.addEventListener("keydown", (event) => {
    const input = event.target.closest && event.target.closest(".sp-gedit input[data-sp-paid]");
    if (!input) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const stored = commitPaidPrice(input.dataset.spPaid, input.value, "Paid");
      input.value = stored === null ? "" : stored.toFixed(2);
      closeGalleryPrice(input);
      updateShopPaidTotal();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeGalleryPrice(input);
    }
  });
  /* Tapping away is not "cancel". Whatever is in the box when focus leaves is what was
     meant, and losing it would be the one thing worse than an extra tap. */
  document.addEventListener("focusout", (event) => {
    const input = event.target.closest && event.target.closest(".sp-gedit input[data-sp-paid]");
    if (!input) return;
    const stored = commitPaidPrice(input.dataset.spPaid, input.value, "Paid");
    input.value = stored === null ? "" : stored.toFixed(2);
    closeGalleryPrice(input);
    updateShopPaidTotal();
  });

  document.addEventListener("click", (event) => { shopClick(event); });
  document.addEventListener("change", (event) => { shopChange(event); });
  document.addEventListener("input", (event) => {
    if (event.target.id === "dp-q") {
      const ctx = deckPageContext();
      if (!ctx) return;
      ctx.filters.query = event.target.value;
      const at = event.target.selectionStart;
      renderDeckPage();
      const box = $("#dp-q");
      if (box) { box.focus(); box.setSelectionRange(at, at); }
      return;
    }
    if (event.target.id !== "sp-q") return;
    shopFilters.query = event.target.value;
    renderShopPage();
    const box = $("#sp-q");
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  });

  // Calibrate, Shop, Decks and Cards no longer have tabs. Their sections and every
  // renderer behind them stay in place - the same way Choose was withdrawn - so the
  // old views remain reachable in code while the two new pages carry the flow.
  const RETIRED_VIEWS = {buy: "deck2", live: "deck2", shop: "shop2", cards: "shop2"};

  function switchView(view, focus = true) {
    if (RETIRED_VIEWS[view] && !$(`.main-tab[data-view="${view}"]`)) view = RETIRED_VIEWS[view];
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
    if (view === "cards") renderCards();
    if (view === "deck2") renderDeckPage();
    if (view === "shop2") renderShopPage();
    if (view === "log") renderGameLog();
    if (focus) {
      window.scrollTo({top: 0, behavior: "smooth"});
      $("#app").focus({preventScroll: true});
    }
  }

  const CHOOSE_COLORS = [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]];
  const CHOOSE_PLAYSTYLES = ["Fortress", "Build-up", "Convergence", "Longevity", "Friendly", "Flavor"];

  // Choose is withdrawn from the page for now: index.html carries neither its tab
  // nor its section. Everything behind it -- the generator, the slot store, the
  // Scryfall client -- is untouched, and every call site here stays valid,
  // because the renderer simply has nothing to draw into. Putting the two
  // elements back in index.html brings the whole step back.
  function renderChoose() {
    if (!$("#view-choose")) return;
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
    const revealed = Math.max(chooseRevealCount, built, 1);
    customStore.slots.slice(0, revealed).forEach((slot, index) => grid.appendChild(makeChooseSlot(slot, index)));
    if (revealed < customStore.slots.length) {
      const addTile = document.createElement("button");
      addTile.type = "button";
      addTile.className = "choose-slot choose-slot-add";
      addTile.dataset.chooseReveal = "true";
      addTile.innerHTML = `<span class="choose-slot-add-icon">+</span><span>Add another deck</span>`;
      addTile.addEventListener("click", () => {
        chooseRevealCount = revealed + 1;
        renderChoose();
      });
      grid.appendChild(addTile);
    }
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
      // switchView only toggles which view is visible -- Compare's DOM keeps
      // whatever group was open at its last render, so re-render first or the
      // generated deck's group stays closed despite openDeckId.
      renderCompare();
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
        <div class="intro-side">
          <div class="selection-meter"><strong>${selected.length}/${catalog.decks.length}</strong><span>decks selected</span></div>
          <div class="intro-actions">
            <button class="mini-button mini-go" id="save-picks" ${selected.length ? "" : "disabled"}>Deck →</button>
            <button class="mini-button" id="email-picks" title="Email your selections" aria-label="Email selections" ${selected.length ? "" : "disabled"}>✉</button>
          </div>
        </div>
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
      const allDeckVariants = catalog.variants.filter((variant) => variant.deckId === deck.id);
      const deckTotal = allDeckVariants.length;
      const variants = allDeckVariants
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
          <button type="button" class="deck-about-button" data-about-deck="${deck.id}" aria-haspopup="dialog">${icon("◆")}About</button>
          <span class="deck-summary-copy"><strong>${esc(deck.title)}</strong><span>${chosenId ? `Picked: ${esc(variantById(chosenId).name)} · ` : ""}${variants.length} of ${deckTotal} shown</span></span>
          <span class="deck-chevron" aria-hidden="true">›</span>
        </summary>
        <div class="rank-order" role="group" aria-label="Sort Deck ${deck.id} variants by stage ranking">
          <span>Rank order</span>
          ${STAGES.map((label, index) => `<button class="rank-order-button info-tip tip-action${rankStage === index + 1 ? " is-active" : ""}" data-rank-stage="${index + 1}" data-tooltip="${esc(stageTooltip(index, variants))}" aria-describedby="info-tooltip">${label}${tooltipHint()}</button>`).join("")}
        </div>
        <div class="variant-track">${variants.length ? "" : `<div class="variant-filter-empty">${icon("⌕")}<strong>No variants match this filter in Deck ${deck.id}</strong><span>Try another mechanic, play style, or search term.</span></div>`}</div>`;
      const track = $(".variant-track", details);
      variants.forEach((variant) => track.appendChild(makeVariantCard(variant, rankStage, allDeckVariants)));
      // The About button sits inside <summary>; without stopPropagation its click would also
      // toggle the surrounding <details> open/closed, same fix as the shell select-all above.
      $(".deck-about-button", details)?.addEventListener("click", (event) => {
        event.stopPropagation();
        openDeckAbout(deck, variants);
      });
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

    // Picks are already written on every change, so this is navigation, not a
    // save -- which is why it no longer takes a button bar to say so.
    $("#save-picks", root).addEventListener("click", () => switchView("deck2"));
    $("#email-picks", root).addEventListener("click", emailPicks);
    $("#compare-search", root).addEventListener("input", (event) => {
      state.compareFilters.query = event.target.value;
      saveState();
      renderCompare();
    });
    $$('[data-compare-filter]', root).forEach((select) => select.addEventListener("change", () => {
      state.compareFilters[select.dataset.compareFilter] = select.value;
      /* Score stage says it changes which build every number on the page
         describes, and it did not: the cards read their stage from each deck's
         own Rank order row, so picking Maxed here filtered by Maxed scores while
         every tile went on quoting Tuned's cost, Tuned's power level and 0 GC.
         It now sets the stage for every deck; a deck's own Rank order still
         overrides it for that one deck. */
      if (select.dataset.compareFilter === "profileStage") {
        catalog.decks.forEach((deck) => { state.rankStages[deck.id] = Number(select.value); });
      }
      saveState();
      renderCompare();
    }));
    $("#clear-compare-filters", root)?.addEventListener("click", () => {
      state.compareFilters = {...blankState().compareFilters};
      catalog.decks.forEach((deck) => { state.rankStages[deck.id] = Number(state.compareFilters.profileStage); });
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

  // Only six of the thirty variants were ever put through the optimizer, and only three of
  // those have an alternative commander explored. Compare is where a variant gets chosen, so
  // it should say up front which extra builds come with that choice rather than leaving it to
  // be discovered two screens later in Calibrate. Colors match the Calibrate ladder families.
  function variantDataBadges(variant) {
    const plan = buyCatalog?.plans?.[variant.id];
    if (!plan) return "";
    const badges = [
      plan.funTuned?.length ? ["funTuned", "Fun"] : null,
      plan.altTuned?.some((item) => item.isCommander) ? ["altTuned", "◇ Alt"] : null
    ].filter(Boolean);
    if (!badges.length) return "";
    return `<div class="variant-data-badges" aria-label="Extra builds available for this variant">
      ${badges.map(([kind, label]) => `<span class="kind-label ${esc(kind)}">${esc(label)}</span>`).join("")}
    </div>`;
  }

  function makeVariantCard(variant, rankStage = 2, siblingVariants = [variant]) {
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
    card.className = `variant-card${selected ? " is-selected" : ""}${variant.treysBuild ? " is-treys-build" : ""}`;
    card.dataset.variant = variant.id;
    card.innerHTML = `
      ${isTreysBuild(variant) ? `<div class="treys-build-ribbon" title="Trey's chosen build for this deck slot"><span>★ Trey's Build</span></div>` : ""}
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
          ${variantDataBadges(variant)}
        </div>
      </div>
      ${commanderCompareMarkup(variant, stage)}
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
          ${metricFamilyMarkup("playstyle", playstyle, `metric-playstyle-${variant.id}-compare`)}
          ${metricFamilyMarkup("engine", engine, `metric-engine-${variant.id}-compare`)}
          ${metricFamilyMarkup("growth", growth, `metric-growth-${variant.id}-compare`)}
        </div>
        <div class="variant-card-actions">
          <button class="comment-toggle tip-action info-tip${state.comments[variant.id] ? " has-comment" : ""}" type="button" aria-expanded="${openCommentId === variant.id}" data-tooltip="${esc(TOOLTIP_DEFINITIONS.addComment)}" aria-describedby="info-tooltip">${icon(state.comments[variant.id] ? "✓" : "“")}<span>${state.comments[variant.id] ? "Comment saved" : "Add a comment"}</span>${tooltipHint()}</button>
          <button class="simulate-button tip-action info-tip" type="button" data-tooltip="${esc(TOOLTIP_DEFINITIONS.simulate)}" aria-describedby="info-tooltip">${icon("⟳")}<span>Simulate</span>${tooltipHint()}</button>
          ${simulationSummary?.builds?.[variant.id] ? `<button class="why-variant-button tip-action info-tip" type="button" aria-haspopup="dialog" data-tooltip="${esc(TOOLTIP_DEFINITIONS.whyVariant)}" aria-describedby="info-tooltip">${icon("★")}<span>Why This Variant</span>${tooltipHint()}</button>` : ""}
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
    $$('[data-commander-preview]', card).forEach((button) => button.addEventListener("click", () => {
      const previewing = button.dataset.previewMode === "alt";
      if (previewing === altCommanderPreview.has(variant.id)) return;
      if (previewing) altCommanderPreview.add(variant.id); else altCommanderPreview.delete(variant.id);
      renderCompare();
    }));
    $(".simulate-button", card).addEventListener("click", () => openSimDialog(variant));
    $(".why-variant-button", card)?.addEventListener("click", () => openVariantWhy(variant, siblingVariants));
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

  // 1o/3e/5o only -- these three decks alone got a second, fully-built decklist for their
  // alternative commander (plan.altTuned), so they're the only ones with a toggle here. The
  // other 44 variants also have an altCommanderCases entry, but it's a lighter-weight scored
  // comparison with no second decklist behind it, so this card has nothing to preview for them.
  // Display-only, exactly like the plan requires: previewing the alt commander here never
  // touches Calibrate seeding or any stored selection, only what this one card shows. The
  // real Score/Win% comparison and the caution paragraph both come straight from the
  // workbook's own Summary sheet (data/simulation-summary.json) -- never fabricated.
  function commanderCompareMarkup(variant, stage) {
    const plan = buyCatalog?.plans?.[variant.id];
    const altCommander = plan?.altTuned?.find((item) => item.isCommander);
    if (!altCommander) return "";
    const previewing = altCommanderPreview.has(variant.id);
    const simCase = simulationSummary?.altCommanderCases?.[variant.id];
    const thumb = (image, name, mode, active) => `<button type="button" class="commander-compare-thumb${active ? " is-active" : ""}" data-commander-preview="${esc(variant.id)}" data-preview-mode="${esc(mode)}" aria-pressed="${active}">
      <img src="${esc(image)}" alt="" loading="lazy"><span>${mode === "alt" ? `${icon("◇")}` : ""}${esc(name)}</span>
    </button>`;
    let panel = "";
    if (previewing) {
      const altLadderKey = stage === 3 ? "altMax" : stage === 2 ? "altTuned" : null;
      const altDeltas = altLadderKey === "altMax"
        ? [...(plan.altTuned || []), ...(plan.altMax || [])].filter((item) => !item.isCommander)
        : altLadderKey === "altTuned"
          ? (plan.altTuned || []).filter((item) => !item.isCommander)
          : [];
      panel = `<div class="commander-preview-panel">
        ${simCase ? `<p class="commander-preview-stats"><strong>${esc(simCase.currentCommander)}</strong> ${simCase.currentScore != null ? `${simCase.currentScore.toFixed(1)} pts · rank #${simCase.currentRank}` : "no score"} <b aria-hidden="true">→</b> <strong>${esc(simCase.altCommander)}</strong> ${simCase.altScore != null ? `${simCase.altScore.toFixed(1)} pts · rank #${simCase.altRank}` : "no score"}<small>${simCase.candidatesMeasured} alt commanders measured · ${simCase.gamesEach} games each</small></p>` : ""}
        ${simCase?.honestRead ? `<p class="commander-preview-caution">${icon("!")}<span>${esc(simCase.honestRead)}</span></p>` : ""}
        ${altDeltas.length
          ? `<div class="commander-preview-deltas"><small>${esc(altLadderKey === "altMax" ? "Alt Max" : "Alt Tuned")} card-set changes at this stage · ${altDeltas.length}</small>
              <ul>${altDeltas.slice(0, 6).map((item) => `<li>${esc(item.name)}${item.replaces ? ` <em>replaces ${esc(item.replaces)}</em>` : ""}</li>`).join("")}${altDeltas.length > 6 ? `<li>+ ${altDeltas.length - 6} more</li>` : ""}</ul>
            </div>`
          : `<p class="commander-preview-note">At Base, adopting ${esc(altCommander.name)} is just the commander swap itself -- no other cards change yet.</p>`}
      </div>`;
    }
    return `<div class="commander-compare" data-ui-key="cmdr-compare-${esc(variant.id)}">
      <div class="commander-compare-row">
        ${thumb(variant.image, variant.commander, "current", !previewing)}
        <span class="commander-compare-vs">vs</span>
        ${thumb(altCommander.image, altCommander.name, "alt", previewing)}
      </div>
      ${panel}
    </div>`;
  }

  // Full deck dossier, opened from the About button on each deck-group summary. Reuses
  // #detail-sheet (the same dialog openVariantDetail uses) rather than a second dialog element,
  // since the layout -- image aside, kicker, title, body -- is already exactly what this needs.
  function openDeckAbout(deck, variants) {
    const dialog = $("#detail-sheet");
    const representative = (variants || []).find((variant) => variant.order === 1) || variants?.[0];
    $("#detail-sheet-image").src = representative?.image || "";
    $("#detail-sheet-image").alt = representative ? `${representative.commander} card` : "";
    $("#detail-sheet-kicker").textContent = `Deck ${deck.id} of ${catalog.decks.length} in the lineup${deck.complexity?.tier ? ` · ${deck.complexity.tier}` : ""}`;
    $("#detail-sheet-title").textContent = deck.title;
    $("#detail-sheet-context").innerHTML = "";
    $("#detail-sheet-context").hidden = true;
    $("#commander-info-toggle")?.remove();
    $("#detail-sheet-body").innerHTML = deckAboutMarkup(deck, variants || []);
    dialog.showModal();
  }

  function deckAboutMarkup(deck, variants) {
    const rank = deck.priorityRank;
    const rankBlock = rank ? `<section class="detail-block deck-priority-block"><h3>Build order</h3><p><strong>#${rank.rank} of ${rank.ofTotal}</strong> in the recommended build order.</p><p>${esc(rank.rationale)}</p>${deck.priorityNote ? `<p class="deck-priority-note">${esc(deck.priorityNote)}</p>` : ""}</section>` : "";
    const complexityBlock = deck.complexity ? `<section class="detail-block deck-complexity-block"><h3>Complexity</h3><p><strong>${esc(deck.complexity.tier)}.</strong> ${esc(deck.complexity.why)}</p></section>` : "";
    const variantList = variants.length
      ? `<section class="detail-block"><h3>The five approaches</h3><ul class="deck-about-variant-list">${variants.map((variant) => `<li><strong>${esc(variant.name)}</strong><span>${esc(variant.commander)}</span></li>`).join("")}</ul></section>`
      : "";
    return `
      <p class="deck-about-objective">${esc(deck.objective)}</p>
      ${detailText("What it is", deck.whatItIs)}
      ${detailText("Where it fits among the ten", deck.fitAmongTen)}
      ${detailText("Playstyle", deck.playstyle)}
      ${detailText("Mood", deck.mood)}
      ${complexityBlock}
      ${detailText("Win condition", deck.winCondition)}
      ${detailText("What it asks of you", deck.asksOfYou)}
      ${detailText("When to pick this", deck.whenToPickThis)}
      ${rankBlock}
      ${variantList}`;
  }

  // Opened from the Why This Variant button, which only renders when this variant has a
  // simulation-summary.json builds entry (custom decks generated on the Choose tab never do,
  // since they've never been through the sweep). Reports THIS variant only: every rung it was
  // measured on, plus one line placing it against its own deck's other variants at the Tuned
  // rung -- Tuned because it's the one rung every variant was measured on the same way, so
  // it's the only apples-to-apples comparison. Sibling readouts are deliberately not repeated
  // here; each sibling has its own button.
  function whyVariantMarkup(variant, siblingVariants) {
    const buildsFor = (id) => simulationSummary?.builds?.[id] || null;
    const ranked = siblingVariants
      .map((sibling) => ({variant: sibling, tuned: buildsFor(sibling.id)?.Tuned || null}))
      .filter((row) => row.tuned && row.tuned.score != null)
      .sort((a, b) => b.tuned.score - a.tuned.score);
    const mine = ranked.find((row) => row.variant.id === variant.id);
    const top = ranked[0];
    const myRank = mine ? ranked.indexOf(mine) + 1 : null;
    const headline = !mine
      ? `<p>${esc(variant.name)} has not been through the simulation sweep yet, so there is nothing to compare it against.</p>`
      : myRank === 1
        ? `<p><strong>${esc(variant.name)}</strong> scored highest of Deck ${esc(variant.deckId)}’s ${ranked.length} simulated variants at the Tuned rung — ${mine.tuned.score.toFixed(1)} points, a ${(mine.tuned.winPct * 100).toFixed(1)}% win rate over ${mine.tuned.games.toLocaleString()} games.</p>`
        : `<p><strong>${esc(variant.name)}</strong> placed #${myRank} of Deck ${esc(variant.deckId)}’s ${ranked.length} simulated variants at the Tuned rung, scoring ${mine.tuned.score.toFixed(1)} against <strong>${esc(top.variant.name)}</strong>’s leading ${top.tuned.score.toFixed(1)} — a gap of ${(top.tuned.score - mine.tuned.score).toFixed(1)}.</p>`;
    const myBuilds = buildsFor(variant.id);
    const rungs = ["Base", "Tuned", "Pod Fun", "Max"];
    const rowsHtml = `
      <div class="why-variant-row is-this-variant">
        <div class="why-variant-row-head"><strong>${esc(variant.name)}</strong><span class="why-variant-you-tag">${esc(variant.commander)}</span></div>
        ${rungs.map((rung) => simulationReadoutMarkup(rung, myBuilds?.[rung] || null)).join("")}
      </div>`;
    return `
      <section class="detail-block why-variant-headline">
        <h3>Why this variant</h3>
        ${headline}
      </section>
      <section class="detail-block why-variant-readout">
        <h3>Monte Carlo readout${engineNoteIcon()}</h3>
        <div class="why-variant-rows">${rowsHtml}</div>
      </section>`;
  }

  function openVariantWhy(variant, siblingVariants) {
    const dialog = $("#detail-sheet");
    $("#detail-sheet-image").src = variant.image;
    $("#detail-sheet-image").alt = `${variant.commander} card`;
    $("#detail-sheet-kicker").textContent = `Deck ${variant.deckId} · Why This Variant`;
    $("#detail-sheet-title").textContent = variant.name;
    $("#detail-sheet-context").innerHTML = "";
    $("#detail-sheet-context").hidden = true;
    $("#commander-info-toggle")?.remove();
    $("#detail-sheet-body").innerHTML = whyVariantMarkup(variant, siblingVariants);
    dialog.showModal();
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
    $("#detail-sheet-body").innerHTML = variant.detailHtml ? `<div class="deck-plan">${variant.detailHtml}</div>` : `<p>No extended report is available.</p>`;
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
      seedBuyStateForNewPick(variant);
      if (previous) showToast(`Deck ${variant.deckId} changed. Your other picks were preserved.`);
      else showToast(`Deck ${variant.deckId} saved: ${variant.name}`);
    }
    saveState();
    renderCompare();
  }

  // Gives a freshly-picked variant a smarter Calibrate starting point than the flat site
  // default, using whichever Compare stage the pick was made at: Base, Tuned, or Maxxed --
  // each of which already folds in its Monte-Carlo-improved swaps where the variant has them.
  // Never touches a variant that already has a stored Calibrate selection -- the preset
  // dropdown is the explicit re-apply mechanism for anything past the first pick, and
  // switching stage chips alone (with no new pick) must never reseed either.
  function selectionIdsSignature(selection) {
    return Lineup.ARRAY_KEYS.map((key) => [...(selection?.[key] || [])].map(String).sort().join(",")).join("|");
  }

  function seedBuyStateForNewPick(variant) {
    const plan = buyCatalog?.plans?.[variant.id];
    if (!plan) return;
    const existing = state.buySelections[variant.id];
    // ensureBuyState/sanitizeGameChangerSelections already eagerly compute a flat
    // Lineup.defaultSelection for every variant during init, long before the user ever picks
    // anything in Compare -- so "state.buySelections already has an entry" is not a reliable
    // signal that the user has actually seen or touched it. Comparing against a freshly
    // computed flat default is: if it's still exactly that, nothing of the user's is at risk.
    if (existing && selectionIdsSignature(existing) !== selectionIdsSignature(Lineup.defaultSelection(plan))) return;
    const stage = Number(state.rankStages[variant.deckId] || 2);
    const presetKey = stage === 1 ? "base" : stage === 3 ? "max" : "tuned";
    const assembled = assemblePreset(plan, presetKey);
    if (assembled) state.buySelections[variant.id] = assembled;
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
    if (!plan) return Lineup.emptySelection();
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
      // Prune stale IDs the catalog no longer recognizes, but do not collapse to one choice
      // per slot — checkboxes are independent now, so more than one pick in a former "slot"
      // is a legitimate state, not something to silently fix on every read.
      const model = Lineup.buildModel(plan);
      next = Object.fromEntries(Lineup.ARRAY_KEYS.map((key) => [
        key,
        (Array.isArray(existing[key]) ? existing[key] : []).filter((id) => model.byId.has(String(id)))
      ]));
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

  /* Fill every slot the requested rung left empty with that slot's Assigned card. The
     rung's own picks are kept exactly as they are; this only reaches slots the rung does
     not speak for, which is what keeps the total at a hundred. */
  function withAssignedFallback(variantId, plan, selection) {
    const Slot = window.MtgSlotModel;
    const assigned = (state.assignedSelections || {})[variantId];
    if (!Slot || !assigned) return selection;
    const chosen = new Set();
    Lineup.ARRAY_KEYS.forEach((k) => (selection[k] || []).forEach((id) => chosen.add(String(id))));
    const spokenFor = new Set();
    Slot.deckSlots(plan, selection, {}).forEach((slot) => { if (slot.pick) spokenFor.add(slot.slotId); });
    const out = {};
    Lineup.ARRAY_KEYS.forEach((k) => { out[k] = (selection[k] || []).slice(); });
    // Which slot each Assigned entry belongs to, so only the empty ones are filled.
    Slot.deckSlots(plan, assigned, {}).forEach((slot) => {
      if (!slot.pick || spokenFor.has(slot.slotId) || chosen.has(String(slot.pick.entryId))) return;
      const rung = (slot.rungs || []).find((r) => r.entryId === slot.pick.entryId);
      const key = rung ? rung.kind : null;
      if (key && Object.prototype.hasOwnProperty.call(out, key)) out[key].push(slot.pick.entryId);
    });
    return out;
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
          <p class="buy-intro-copy">Every checked card counts toward the final deck. <b>Enhance</b> keeps the role at $20 or less; <b>Maxxed</b> pushes capability to the legal bounds of Tier 3 / Bracket 3 regardless of price.</p>
        </div>
      </div>
      ${selected.length ? "" : `<div class="empty-state"><h3>No deck picks yet</h3><p>Choose a variant in Compare first, then come back here.</p><button class="primary-button" data-go="compare">Choose decks</button></div>`}
      ${selected.some((variant) => !buyCatalog.plans[variant.id]) ? `<div class="coverage-note"><h3>Selection needs attention</h3><p>One selected variant could not be loaded. Return to Compare and select it again.</p></div>` : ""}
      ${readyCount ? `<details class="buy-overview" data-ui-key="buy-overview" open><summary><h3>Shopping plan summary</h3><span class="section-expander" aria-hidden="true"></span></summary><div class="buy-overview-grid">${selected.filter((variant) => buyCatalog.plans[variant.id]).map((variant) => {
        const plan = buyCatalog.plans[variant.id];
        const current = ensureBuyState(variant.id);
        const namedShell = (plan.startingShell || []).filter((card) => !card.isFlexibleSlot);
        const selectedShell = new Set(current.shell || []);
        const shellSummary = `${namedShell.filter((card) => selectedShell.has(card.id)).reduce((sum, card) => sum + Number(card.quantity || 1), 0)}/${namedShell.reduce((sum, card) => sum + Number(card.quantity || 1), 0)} shell cards · `;
        return `<button class="buy-overview-card" data-open-buy-deck="${variant.deckId}"><b>Deck ${variant.deckId}</b><strong>${esc(variant.name)}</strong><span>${shellSummary}${esc(plan.priorityLabel || plan.budgetLabel)} · ${plan.required.length} Tuned purchases</span></button>`;
      }).join("")}</div></details>` : ""}
      ${selected.length ? `<div class="action-row action-row-top"><button class="primary-button save-buys">Save Buys → Shop</button><button class="secondary-button" data-go="compare">Back to Compare</button></div>` : ""}
      <div id="buy-decks"></div>
      ${salvageBuySection()}
      ${selected.length ? `<div class="action-row"><button class="primary-button save-buys">Save Buys → Shop</button><button class="secondary-button" data-go="compare">Back to Compare</button></div>` : ""}`;

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
      notice.innerHTML = `<h3>No bought cards yet</h3><p>Mark a card Bought in the Shop and it appears here.</p>`;
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
    // Every count here is filtered to what's actually checked in `current`, then summed by
    // quantity — the same convention selectedDeckCards uses — so shell + tuned + optional
    // always agrees with the compliance panel's total, instead of drifting when a category's
    // array length no longer matches its full candidate list (e.g. a Tuned pick unchecked).
    const tunedIds = new Set([...(current?.tuned || []), ...(current?.tuned2 || []), ...(current?.funTuned || []), ...(current?.altTuned || [])]);
    const tunedCount = plan
      ? [...(plan.required || []), ...(plan.tuned2 || []), ...(plan.funTuned || []), ...(plan.altTuned || [])].filter((item) => tunedIds.has(item.id)).reduce((sum, item) => sum + Number(item.quantity || 1), 0)
      : 0;
    const optionalIds = new Set([
      ...(current?.upgrade || []), ...(current?.enhance || []), ...(current?.max || []),
      ...(current?.enhance2 || []), ...(current?.max2 || []), ...(current?.funMax || []), ...(current?.altMax || [])
    ]);
    const optionalCount = plan
      ? [
          ...(plan.upgrade || []), ...(plan.enhance || []), ...(plan.max || []),
          ...(plan.enhance2 || []), ...(plan.max2 || []), ...(plan.funMax || []), ...(plan.altMax || [])
        ].filter((item) => optionalIds.has(item.id)).reduce((sum, item) => sum + Number(item.quantity || 1), 0)
      : 0;
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
        <span class="buy-deck-title"><strong>${esc(variant.name)}</strong><span>${plan ? `${shellCards.length ? `${shellCount} shell card${shellCount === 1 ? "" : "s"} selected · ` : ""}${tunedCount} Tuned · ${optionalCount} optional picked` : esc(variant.commander)}</span></span>
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
      body.innerHTML = `<div class="empty-state"><h3>Purchase profile not published yet</h3><p>This variant remains selected, but it will not add generic or mismatched cards to your Shop.</p></div>`;
      return details;
    }

    body.innerHTML = `
      <div class="deck-tools" role="tablist" aria-label="Inspect this deck">
        ${DECK_TOOLS.map((tool) => `<button type="button" role="tab" class="deck-tool" data-deck-tool="${esc(tool.key)}" aria-selected="false" aria-controls="deck-tool-panel-${esc(variant.id)}">${icon(tool.glyph)}<span>${esc(tool.label)}</span></button>`).join("")}
      </div>
      <div class="deck-tool-panel" id="deck-tool-panel-${esc(variant.id)}" role="tabpanel" hidden></div>
      ${presetDropdownMarkup(plan, current, variant.id)}
      ${commanderSwitchMarkup(plan, current, variant.id)}
      ${startingShellSection(variant, plan, current, variant.id)}
      ${LADDER_GROUPS.map((group) => ladderGroupMarkup(group, plan, current, variant.id, altCommanderActive(plan, current))).join("")}`;
    wireDeckTools(body, variant, plan, current);
    decorateRichContent(body, variant);
    if (details.open) {
      ensureShopMetadata([
        ...(plan.startingShell || []), ...(plan.required || []), ...(plan.enhance || []), ...(plan.max || []),
        ...(plan.tuned2 || []), ...(plan.enhance2 || []), ...(plan.max2 || []),
        ...(plan.funTuned || []), ...(plan.funMax || []), ...(plan.altTuned || []), ...(plan.altMax || [])
      ]);
    }
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
    // Checking a card clears its replaced lineage going backward (the same slot-group
    // mechanism the preset dropdown uses) -- one-directional and non-locking: it never
    // touches anything upstream of what it replaces, and any cleared card can be freely
    // re-checked afterward. Unchecking is a plain, independent removal with no side effects
    // on any other item -- it never restores or re-selects anything. No legality gate either
    // way: compliance is read back from whatever this produces, it never blocks a click.
    $$('input[data-buy-kind]', body).forEach((checkbox) => checkbox.addEventListener("change", () => {
      const itemId = String(checkbox.dataset.itemId);
      const kind = checkbox.dataset.buyKind;
      const currentState = ensureBuyState(variant.id);
      if (checkbox.checked) {
        assignSelection(currentState, Lineup.applyLineageCheck(plan, currentState, itemId));
      } else {
        currentState[kind] = (currentState[kind] || []).filter((id) => id !== itemId);
      }
      saveState();
      renderBuy();
    }));
    const selectAllShell = $('[data-select-shell-all]', body);
    if (selectAllShell) {
      // The shell heading is a <summary> now, so a click on its select-all would also
      // collapse the section it belongs to.
      selectAllShell.closest("label")?.addEventListener("click", (event) => event.stopPropagation());
      const shellIds = (plan.startingShell || []).filter((card) => !card.isFlexibleSlot).map((card) => card.id);
      const selectedShell = new Set(current.shell || []);
      const partiallySelected = selectedShell.size > 0 && shellIds.some((id) => !selectedShell.has(id));
      selectAllShell.setAttribute("aria-checked", partiallySelected ? "mixed" : String(selectAllShell.checked));
      requestAnimationFrame(() => {
        if (selectAllShell.isConnected) selectAllShell.indeterminate = partiallySelected;
      });
      selectAllShell.addEventListener("change", () => {
        const currentState = ensureBuyState(variant.id);
        const existing = new Set(currentState.shell || []);
        currentState.shell = selectAllShell.checked
          ? Array.from(new Set([...existing, ...shellIds]))
          : (currentState.shell || []).filter((id) => !shellIds.includes(id));
        saveState(selectAllShell.checked ? "Full Starting Shell activated" : "Active Starting Shell cards cleared");
        renderBuy();
      });
    }
    const presetSelect = $('[data-apply-preset]', body);
    if (presetSelect) {
      presetSelect.addEventListener("change", () => {
        const key = presetSelect.value;
        if (!key) return;
        const preset = deckPresets(plan).find((entry) => entry.key === key);
        assignSelection(ensureBuyState(variant.id), assemblePreset(plan, key));
        saveState(`${preset.label} configuration applied`);
        renderBuy();
      });
    }
    // Switching which build a group is showing changes only what's on screen, never the deck.
    $$('[data-ladder-tab]', body).forEach((button) => button.addEventListener("click", (event) => {
      event.preventDefault();
      ladderTabState.set(`${variant.id}:${button.dataset.ladderTab}`, button.dataset.tabKey);
      renderBuy();
    }));
    // "Select all <build>" applies that build's whole configuration, not just the rows on
    // screen: Tuned-2 is Tuned plus its swaps, while Fun Tuned deliberately replaces Tuned
    // entirely. Applying the full stack is what makes the result a complete, exactly-100,
    // compliance-checked deck rather than an arbitrary mixture -- which is the entire point of
    // asking for it. Unchecking returns to Base, the configuration this all builds on.
    $$('[data-select-tab-all]', body).forEach((toggle) => {
      const input = $("input", toggle);
      if (!input) return;
      const presetKey = toggle.dataset.tabPreset;
      input.addEventListener("change", () => {
        const assembled = assemblePreset(plan, input.checked ? presetKey : "base");
        if (!assembled) return;
        assignSelection(ensureBuyState(variant.id), assembled);
        saveState(input.checked ? `${$("span", toggle)?.textContent || "Configuration"} applied` : "Returned to the Base configuration");
        renderBuy();
      });
    });
    // Clicking the inactive commander candidate is a normal check -- slot-group clearance
    // (shared with every other checkbox on this page) takes care of clearing the other one.
    // Clicking the already-active candidate is the one deliberate exception to "a click always
    // toggles" in this app: a commander can never legitimately drop to zero, so it opens the
    // card image instead of doing nothing.
    $$('[data-commander-id]', body).forEach((button) => button.addEventListener("click", () => {
      const id = String(button.dataset.commanderId);
      const currentState = ensureBuyState(variant.id);
      const model = Lineup.buildModel(plan);
      const entry = model.byId.get(id);
      if (!entry) return;
      const activeId = String(Lineup.activeEntryForSlot(plan, currentState, entry.slotId)?.id || "");
      if (activeId === id) {
        openCardPreview(resolvedBuyCard(entry.item));
        return;
      }
      assignSelection(currentState, Lineup.applyChoice(plan, currentState, id));
      saveState(`${entry.item.name} is now the active commander`);
      renderBuy();
    }));
    $$(".buy-item-detail:not([data-shell-card-name])", body).forEach((button) => button.addEventListener("click", () => {
      const kind = button.dataset.itemKind;
      const item = kind === "precon" ? plan.precon : kindItems(plan, kind).find((candidate) => candidate.id === button.dataset.itemId);
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
    const purchases = [
      ...(isSinglesBuiltShell(plan)
        ? (plan.startingShell || []).filter((item) => !item.isFlexibleSlot && selectedShell.has(item.id)).map(resolvedShellCard)
        : plan.precon ? [plan.precon] : []),
      ...Lineup.selectedEntries(plan, current || {}).filter((entry) => entry.kind !== "shell").map((entry) => entry.item)
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
    return `<span class="buy-total" data-buy-total title="Market price of everything selected here, whether or not you own it yet. Decks reports what you have actually recorded paying instead."><small>Market total</small><strong>$${summary.total.toFixed(2)}</strong>${summary.unpriced ? `<em>+ ${summary.unpriced} unpriced</em>` : ""}</span>`;
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
    // Decks with an alt-commander candidate move the commander into the dedicated Commander
    // switcher (commanderSwitchMarkup) instead of this row, since it can now also be filled
    // by an altTuned pick that this section's own shell-only counting has no way to see.
    const hasAltCommander = Boolean(plan.altTuned?.some((item) => item.isCommander));
    const named = cards.filter((card) => !card.isFlexibleSlot && !(hasAltCommander && card === commander));
    const flexibleCount = cards.filter((card) => card.isFlexibleSlot).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const namedCount = named.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const groups = new Map();
    named.filter((card) => card !== commander).forEach((card) => {
      const type = shellType(card);
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(card);
    });
    // Same reasoning as the ladder rows: alphabetical inside each type group.
    groups.forEach((group) => group.sort(byCardName));
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
    // A deck is always 100 slots including its commander, so count it here even on the decks
    // whose commander lives in the separate switcher above -- reading "82/99" against a
    // 100-card deck invites the question of which card went missing. Exactly one commander is
    // active at all times (the slot-group model guarantees it), so this is always +1/+1.
    const shownSelected = selectedCount + (hasAltCommander ? 1 : 0);
    const shownTotal = namedCount + (hasAltCommander ? 1 : 0);
    return `<details class="starting-shell constructed-shell" data-ui-key="shell-${esc(variantId)}" open>
      <summary class="starting-shell-heading"><span>${icon("▣")}<strong>Starting Shell${purchasedAsSingles ? " · Singles to buy" : " · Final-deck choices"}</strong><b>${shownSelected}/${shownTotal}</b></span><small>${hasAltCommander ? "Includes the commander, chosen above" : "The cards this deck starts from"}</small><label class="shell-select-all"><input type="checkbox" data-select-shell-all ${allSelected ? "checked" : ""}><span>Select all</span></label><span class="section-expander" aria-hidden="true"></span></summary>
      <p class="shell-source-note constructed-shell-note">${purchasedAsSingles ? "Check the individual cards you need; selected cards flow to the Shop." : "These cards came in the starting product. Keep checked only the cards you want in the finished 100; no individual price is required."}</p>
      ${hasAltCommander ? "" : `<div class="constructed-shell-commander"><h4>Commander</h4>${shellPurchaseRow(commander, current, variantId, purchasedAsSingles)}</div>`}
      <div class="constructed-shell-groups">${typeGroups}</div>
      ${flexibleCount ? `<p class="shell-flex-note"><b>${flexibleCount} modeled slot${flexibleCount === 1 ? "" : "s"} still need exact card names.</b> They preserve the 100-card compliance model but are not added to the Shop until a card is named.</p>` : ""}
    </details>`;
  }

  function startingShellSection(variant, plan, current, variantId) {
    const cards = (plan.startingShell || []).map(resolvedShellCard);
    return constructedShellSection(variant, plan, cards, current, variantId);
  }

  // True when the alternative commander currently occupies the commander slot. Decides which
  // ladder groups get de-emphasized (never disabled), so the answer has to come from the same
  // slot-group lookup the Commander switcher itself renders from.
  function altCommanderActive(plan, current) {
    const altCommander = (plan.altTuned || []).find((item) => item.isCommander);
    const shellCommander = (plan.startingShell || []).find((item) => item.isCommander);
    if (!altCommander || !shellCommander) return false;
    const model = Lineup.buildModel(plan);
    const slotId = model.byId.get(String(shellCommander.id))?.slotId;
    return String(Lineup.activeEntryForSlot(plan, current, slotId)?.id || "") === String(altCommander.id);
  }

  // 1o/3e/5o only -- both commander candidates share one slot group (the alt item's
  // `replaces` chains back to the original commander's shell entry), so Lineup.applyChoice
  // already guarantees exactly one of them is ever active; this just renders that pair and
  // lets a click on the inactive one drive the normal check flow. Clicking the active one is
  // handled separately (opens the image preview instead) since a commander can never sit at
  // zero the way every other slot can.
  function commanderSwitchMarkup(plan, current, variantId) {
    const altCommander = (plan.altTuned || []).find((item) => item.isCommander);
    const shellCommander = (plan.startingShell || []).find((item) => item.isCommander);
    if (!altCommander || !shellCommander) return "";
    const model = Lineup.buildModel(plan);
    const slotId = model.byId.get(String(shellCommander.id))?.slotId;
    const activeId = String(Lineup.activeEntryForSlot(plan, current, slotId)?.id || "");
    const candidateMarkup = (item, isAlt) => {
      const selected = String(item.id) === activeId;
      return `<button type="button" class="commander-candidate${selected ? " is-selected" : ""}" data-commander-id="${esc(item.id)}" aria-pressed="${selected}">
        <img src="${esc(item.image)}" alt="" loading="lazy">
        <span class="commander-candidate-copy">
          <span class="commander-candidate-eyebrow">${isAlt ? `<span class="alt-mini">◇ Alt</span>` : `<span class="kind-label shell">Original</span>`}${selected ? `<span class="commander-active-mini">✓ Active</span>` : ""}</span>
          <strong>${esc(item.name)}</strong>
        </span>
      </button>`;
    };
    return `<section class="commander-switch" data-ui-key="commander-${esc(variantId)}">
      <div class="commander-switch-heading"><span>${icon("♛")}Commander</span><small>Exactly one is active at a time · tap the active card to view it full size</small></div>
      <div class="commander-switch-row">
        ${candidateMarkup(shellCommander, false)}
        ${candidateMarkup(altCommander, true)}
      </div>
    </section>`;
  }

  function deckPlanMarkup(variant, plan) {
    const body = plan?.planHtml || variant.detailHtml || "";
    if (!body) return `<div class="empty-state"><h3>No plan published</h3><p>This variant has no extended write-up yet.</p></div>`;
    return `<div class="deck-plan">${body}</div>`;
  }

  // Three ways of inspecting one deck, on one row. Each renders into the shared
  // panel underneath; clicking the open one closes it again, so the default
  // state of a deck is its cards rather than three folded headers competing
  // with the deck header above them for the reader's attention.
  const DECK_TOOLS = [
    {key: "check", label: "Deck check", glyph: "✓"},
    {key: "ratings", label: "Estimated ratings", glyph: "◎"},
    {key: "plan", label: "Deck plan", glyph: "☰"}
  ];

  function wireDeckTools(body, variant, plan, current) {
    const panel = $(".deck-tool-panel", body);
    const buttons = $$(".deck-tool", body);
    const show = (key) => {
      const button = buttons.find((entry) => entry.dataset.deckTool === key);
      const alreadyOpen = button?.getAttribute("aria-selected") === "true";
      buttons.forEach((entry) => entry.setAttribute("aria-selected", String(!alreadyOpen && entry === button)));
      if (alreadyOpen || !button) {
        panel.hidden = true;
        panel.innerHTML = "";
        deckToolOpen.delete(variant.id);
        return;
      }
      panel.hidden = false;
      panel.dataset.tool = key;
      panel.innerHTML = key === "check" ? compliancePanel(variant, plan, current)
        : key === "ratings" ? dynamicMetricsHeaderMarkup(plan, current, variant)
        : deckPlanMarkup(variant, plan);
      decorateRichContent(panel, variant);
      deckToolOpen.set(variant.id, key);
    };
    buttons.forEach((button) => button.addEventListener("click", () => show(button.dataset.deckTool)));
    // Re-opening a deck restores whichever tool was showing when it closed.
    const remembered = deckToolOpen.get(variant.id);
    if (remembered) show(remembered);
  }

  // View preference, not a decision about the deck, so it lives here rather
  // than in saved state -- same reasoning as the ladder tabs.
  const deckToolOpen = new Map();

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
    return `<div class="deck-compliance" data-compliance-panel>
      <div class="compliance-heading"><span class="compliance-title">${icon("✓")}<span><b>Commander deck check</b><small>4-player construction</small></span></span><span class="compliance-inline">${tierButton(2)}${tierButton(3)}<span class="card-count-status ${countState}" data-composition-detail role="button" tabindex="0"><b>${result.total}/100</b><small>${result.total === 100 ? "Exact" : result.total < 100 ? `${100 - result.total} under` : `${result.total - 100} over`}</small></span></span></div>
      <div class="compliance-details">
      <button class="composition-strip" data-composition-detail aria-label="View deck composition details">
        <span class="land-segment" style="width:${landPercent}%"></span><span class="other-segment" style="width:${100 - landPercent}%"></span>
        <b>${result.types.Land || 0} lands</b><b>${result.total - (result.types.Land || 0)} other</b><em>View breakdown →</em>
      </button>
      ${result.compositionWarnings.length ? `<p class="composition-warning">${icon("!")}<span>${esc(result.compositionWarnings[0])}</span></p>` : ""}
      <p class="audit-note">Guideline check · open a Tier status for rule details</p></div>
    </div>`;
  }

  // Literal, independent membership per category array — deliberately not Lineup's
  // canonicalized one-per-slot view, since checkboxes no longer enforce that exclusivity.
  // Whatever is actually checked is what gets counted, even multiple picks in one old slot.
  function selectedDeckCards(plan, current) {
    const model = Lineup.buildModel(plan);
    const selected = Object.fromEntries(Lineup.ARRAY_KEYS.map((key) => [key, new Set((current[key] || []).map(String))]));
    return model.entries.filter((entry) => selected[entry.arrayKey]?.has(entry.id)).map((entry) => ({
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
    // Filter unresolved entries against the literal list so a caller-supplied cardOverride is
    // respected; recomputing selectedEntries here would silently ignore it.
    const literalIds = new Set(literalCards.map((card) => card.id));
    const baseIssues = Lineup.unresolvedEntries(plan)
      .filter((entry) => literalIds.has(entry.id))
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

  // ---------------------------------------------------------------------------
  // Simulation
  //
  // No games are played in the browser and no API is called. The dialog builds a
  // request for the deck, hands over the one command that runs the loop on this
  // machine, watches sim/status.json while it runs, and applies the result as an
  // overlay when it is done. Served from anywhere but localhost it degrades to
  // instructions plus a file picker for the result.
  // ---------------------------------------------------------------------------
  const SIM_STATUS_PATH = "sim/status.json";
  const SIM_POLL_MS = 2000;
  let simDialogVariant = null;
  let simPollTimer = null;
  let simResult = null;
  let simStatus = null;

  const isLocalHost = () => ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

  function simCards(variant) {
    const plan = buyCatalog.plans[variant.id];
    if (!plan) return [];
    const current = Lineup.defaultSelection(plan);
    return Lineup.selectedEntries(plan, current).map((entry) => {
      const meta = cardMetadata[itemKey(entry.item)] || {};
      return {
        name: entry.item.name,
        quantity: Math.max(1, Number(entry.item.quantity || 1)),
        isCommander: Boolean(entry.item.isCommander),
        typeLine: entry.item.typeLine || meta.typeLine || "",
        manaCost: entry.item.manaCost || meta.manaCost || "",
        oracleText: entry.item.oracleText || meta.oracleText || "",
        colorIdentity: entry.item.colorIdentity || meta.colorIdentity || [],
        commanderLegal: entry.item.commanderLegal !== false,
        gameChanger: Boolean(entry.item.gameChanger),
        price: Number(entry.item.price ?? meta.price ?? 0),
        tags: entry.item.tags || []
      };
    });
  }

  function buildSimRequest(variant) {
    const cards = simCards(variant);
    const commander = cards.find((card) => card.isCommander);
    const compliance = Compliance.evaluateCardList(cards.map((card) => ({...card, tags: [...(card.tags || []), ...Compliance.deriveComplianceTags(card)]})));
    const lands = compliance.types.Land || 0;
    return {
      request: {
        schemaVersion: 1,
        id: `sim-${variant.id}-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-")}`,
        variantId: variant.id,
        deckId: variant.deckId,
        source: variant.isCustom ? "generated-tuned-build" : "baked-tuned-build",
        stage: "Tuned",
        createdAt: new Date().toISOString(),
        name: variant.name,
        commander: commander?.name || variant.commander,
        table: "mixed-pod",
        cards,
        constraints: {
          colorIdentity: commander?.colorIdentity || [],
          tier: 3,
          landFloor: Math.min(33, lands),
          landCeiling: Math.max(42, lands),
          maxSwapInPriceUsd: 60,
          mustKeep: [commander?.name].filter(Boolean),
          themes: variant.mechanics || [],
          budgetTotalUsd: 0
        }
      },
      compliance
    };
  }

  function simMetricRow(label, baseline, final, format) {
    const before = format(baseline);
    const after = final === null || final === undefined ? "" : format(final);
    return `<div class="sim-metric"><span>${esc(label)}</span><strong>${esc(before)}${after && after !== before ? ` → ${after}` : ""}</strong></div>`;
  }

  function simResultMarkup(result) {
    const percent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;
    const turn = (value) => (value ? Number(value).toFixed(1) : "no wins");
    const verdictClass = result.verdict === "confirmed" ? "is-confirmed" : result.verdict === "not-confirmed" ? "is-rejected" : "is-tentative";
    const changes = (result.netChanges || []).filter((change) => change.out || change.in);
    return `
      <section class="sim-verdict ${verdictClass}">
        <b>${esc(result.verdict.replace(/-/g, " "))}</b>
        <p>${esc(result.recommendation || "")}</p>
      </section>
      <section class="sim-metrics">
        <h3>Measured on ${result.holdoutMetrics?.games || result.finalMetrics.games} games the optimizer never saw</h3>
        <div class="sim-metric-grid">
          ${simMetricRow("Win rate", result.holdoutBaselineMetrics?.winRate ?? result.baselineMetrics?.winRate, result.holdoutMetrics?.winRate, percent)}
          ${simMetricRow("Score", result.holdoutBaselineMetrics?.score ?? result.baselineMetrics?.score, result.holdoutMetrics?.score, (value) => Number(value || 0).toFixed(1))}
          ${simMetricRow("Average win turn", result.baselineMetrics?.avgWinTurn, result.finalMetrics?.avgWinTurn, turn)}
          ${simMetricRow("Mana screw", result.baselineMetrics?.screwPct, result.finalMetrics?.screwPct, percent)}
          ${simMetricRow("Flood", result.baselineMetrics?.floodPct, result.finalMetrics?.floodPct, percent)}
          ${simMetricRow("Answer in hand, turns 3-7", result.baselineMetrics?.interactionAvailability, result.finalMetrics?.interactionAvailability, percent)}
          ${simMetricRow("Fun/participation", result.baselineMetrics?.funScore, result.finalMetrics?.funScore, percent)}
        </div>
      </section>
      ${changes.length ? `<section class="sim-changes"><h3>${changes.length} change${changes.length === 1 ? "" : "s"} to make</h3><ol>${changes.map((change) => `
        <li>
          <div class="sim-change-line"><b class="sim-out">Cut</b><span>${esc(change.out || "—")}</span></div>
          <div class="sim-change-line"><b class="sim-in">Add</b><span>${esc(change.in || "—")}</span><em>${change.priceDelta >= 0 ? "+" : ""}$${Number(change.priceDelta || 0).toFixed(2)}</em></div>
          ${change.outStat ? `<small>Measured: cast in ${(change.outStat.castRate * 100).toFixed(0)}% of the games it was drawn, stranded in hand in ${(change.outStat.deadRate * 100).toFixed(0)}%, average cast on turn ${change.outStat.avgCastTurn.toFixed(1)}, and the games it was cast in were won ${(change.outStat.winRateWhenCast * 100).toFixed(0)}% of the time against a deck average of ${(result.baselineMetrics.winRate * 100).toFixed(0)}%.</small>` : ""}
        </li>`).join("")}</ol></section>` : `<section class="sim-changes"><h3>No changes</h3><p>Nothing in the candidate pool beat the current list.</p></section>`}
      ${result.gapsRemaining?.length ? `<section class="sim-gaps"><h3>What is still weak</h3><ul>${result.gapsRemaining.map((gap) => `<li><b>${esc(gap.key.replace(/-/g, " "))}</b><span>${esc(gap.observed)}</span><small>Target: ${esc(gap.target)}</small></li>`).join("")}</ul></section>` : ""}
      <section class="sim-compliance ${result.compliance?.tier3Clean ? "passes" : "has-issues"}">
        <h3>${result.compliance?.tier3Clean ? "The optimized list is still Tier 3 legal" : "The optimized list has compliance problems"}</h3>
        <p>${result.compliance?.total} cards · ${result.compliance?.lands} lands · ${result.compliance?.gameChangers} Game Changers${result.compliance?.problems?.length ? ` · ${esc(result.compliance.problems.join(" "))}` : ""}</p>
      </section>
      <div class="sim-apply-row">
        <button class="primary-button" type="button" data-sim-apply ${result.compliance?.tier3Clean ? "" : "disabled"}>Update variant</button>
        ${Custom.overlayFor(customStore, simDialogVariant?.id) ? `<button class="secondary-button" type="button" data-sim-revert>Revert to the original list</button>` : ""}
      </div>
      <details class="sim-method"><summary>How this was measured, and what it cannot see</summary>
        <p>Each list played ${result.gamesPerIteration} games per iteration against three opponent seats sampled from ${esc(result.table)}, then both the original and the optimized list played ${result.holdoutMetrics?.games || 0} more on seeds the optimizer never tuned against. Only that second comparison decides the verdict.</p>
        <ul>${(result.simplifications || []).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      </details>`;
  }

  function simStatusMarkup() {
    if (!isLocalHost()) return "";
    if (!simStatus || simStatus.state === "idle") return `<p class="sim-status is-idle">${icon("○")}<span>No local run detected yet.</span></p>`;
    const mine = simStatus.variantId === simDialogVariant?.id;
    const progress = simStatus.gamesPerIteration
      ? Math.round((Number(simStatus.gamesCompletedThisIteration || 0) / Number(simStatus.gamesPerIteration)) * 100)
      : 0;
    return `<p class="sim-status is-${esc(simStatus.state)}">${icon(simStatus.state === "done" ? "✓" : "◐")}<span><b>${esc(simStatus.state.replace(/-/g, " "))}${mine ? "" : ` · ${esc(simStatus.variantId || "another deck")}`}</b>${esc(simStatus.message || "")}</span></p>
      ${simStatus.state === "simulating" ? `<div class="sim-progress"><i style="width:${progress}%"></i></div>` : ""}
      ${simStatus.bestScore ? `<p class="sim-status-detail">Best score so far ${Number(simStatus.bestScore).toFixed(1)} at iteration ${simStatus.bestIteration} · ${simStatus.totalGamesUsed} of ${simStatus.maxTotalSimulations} games used</p>` : ""}`;
  }

  function renderSimDialog() {
    const variant = simDialogVariant;
    if (!variant) return;
    const {request, compliance} = buildSimRequest(variant);
    const command = variant.isCustom
      ? `node tools/sim/run-sim.mjs --request sim/requests/${request.id}.json --init --auto`
      : `node tools/sim/run-batch.mjs --variants ${variant.id}`;
    const overlay = Custom.overlayFor(customStore, variant.id);
    $("#sim-dialog-kicker").textContent = `Deck ${variant.deckId} · Tuned build · ${compliance.total} cards`;
    $("#sim-dialog-title").textContent = variant.name;
    $("#sim-dialog-body").innerHTML = `
      <section class="sim-deck-summary">
        <div><span>Commander</span><strong>${esc(request.commander)}</strong></div>
        <div><span>Lands</span><strong>${compliance.types.Land || 0}</strong></div>
        <div><span>Game Changers</span><strong>${compliance.selectedGameChangers.length}/3</strong></div>
        <div><span>Tier 3</span><strong>${compliance.tier3.length ? `${compliance.tier3.length} issue${compliance.tier3.length === 1 ? "" : "s"}` : "clean"}</strong></div>
      </section>
      ${overlay ? `<p class="sim-overlay-note">${icon("✓")}<span>This variant is already showing an optimized list applied on ${esc(String(overlay.appliedAt).slice(0, 10) || "an earlier run")}.</span></p>` : ""}
      <section class="sim-run">
        <h3>Run a simulation</h3>
        <p class="sim-lede">This plays the deck a few thousand times against randomized opponents and reports what it found. Everything happens on your own computer — nothing is uploaded, and there is no account or API key involved.</p>
        <p class="sim-lede"><b>You do not need to know anything about programming.</b> It is five steps, and the longest one is waiting.</p>
        <ol class="sim-steps">
          <li>
            <b>Open a terminal.</b>
            <span>On a Mac, press <kbd>⌘</kbd>+<kbd>Space</kbd>, type <em>Terminal</em>, press Enter. On Windows, press <kbd>Start</kbd>, type <em>PowerShell</em>, press Enter. A window with a blinking cursor appears — that is all a terminal is.</span>
          </li>
          <li>
            <b>Go to this project's folder.</b>
            <span>Type <code>cd </code> (with the space), then drag the <em>mtg-deck-matrix</em> folder from your file browser onto the terminal window and press Enter. Dragging fills in the path for you.</span>
          </li>
          ${variant.isCustom ? `<li><b>Save this deck's request file.</b><span>Click the button below, then move the downloaded file into the project's <code>sim/requests/</code> folder.</span><button class="secondary-button" type="button" data-sim-download>Download the request file</button></li>` : ""}
          <li>
            <b>Paste the command and press Enter.</b>
            <span>Copy it with the button, click the terminal, paste (<kbd>⌘</kbd>+<kbd>V</kbd> on a Mac, <kbd>Ctrl</kbd>+<kbd>V</kbd> on Windows) and press Enter.</span>
            <div class="sim-command"><code>${esc(command)}</code><button class="secondary-button" type="button" data-sim-copy>Copy</button></div>
          </li>
          <li>
            <b>Wait for it to finish.</b>
            <span>A few minutes at most. Lines of progress scroll past; that is the deck being played. It stops on its own when the results stop improving, and prints where it saved them.</span>
          </li>
          <li>
            <b>Bring the results back here.</b>
            <span>${isLocalHost() ? "This page is watching the run, so the results appear below by themselves when it finishes." : "Use <em>Load a result file</em> at the bottom of this box and pick the file the command printed — it is in the project's <code>sim/results/</code> folder, and it is the newest one there."}</span>
          </li>
        </ol>
        <details class="sim-first-time"><summary>First time? Two things to install</summary>
          <p>The command needs <b>Node.js</b>, which is free. Download the "LTS" version from <a href="https://nodejs.org" target="_blank" rel="noopener">nodejs.org</a>, run the installer, accept the defaults, then close and reopen your terminal.</p>
          <p>You also need this project on your computer. If you only have the website, download the repository from GitHub with the green <em>Code → Download ZIP</em> button and unzip it somewhere you can find again.</p>
          <p>To check Node is ready, type <code>node --version</code> and press Enter. A number like <code>v22.0.0</code> means you are set.</p>
        </details>
        <p class="sim-command-note">If you use Claude Code, this one line does the whole loop and picks the swaps for you: <code>claude "/simulate-deck ${esc(variant.isCustom ? `sim/requests/${request.id}.json` : variant.id)}"</code></p>
        ${simStatusMarkup()}
        ${isLocalHost() ? "" : `<p class="sim-status is-remote">${icon("!")}<span>This page is not being served from your computer, so it cannot watch a run. Run the command in your checkout, then load the result file it writes.</span></p>`}
        <label class="sim-load"><span>Load a result file</span><input type="file" accept="application/json" data-sim-load></label>
      </section>
      <div id="sim-result-body">${simResult ? simResultMarkup(simResult) : ""}</div>`;

    $("[data-sim-copy]", $("#sim-dialog-body"))?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(command);
        showToast("Command copied.");
      } catch (error) {
        showToast("Copy failed — select the command and copy it manually.");
      }
    });
    $("[data-sim-download]", $("#sim-dialog-body"))?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(request, null, 2)], {type: "application/json"});
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${request.id}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
    $("[data-sim-load]", $("#sim-dialog-body"))?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          adoptSimResult(JSON.parse(String(reader.result)));
        } catch (error) {
          showToast("That file is not a simulation result.");
        }
      };
      reader.readAsText(file);
    });
    $("[data-sim-apply]", $("#sim-dialog-body"))?.addEventListener("click", () => applySimResult());
    $("[data-sim-revert]", $("#sim-dialog-body"))?.addEventListener("click", () => {
      Custom.removeOverlay(customStore, variant.id);
      forgetVariantSelection(variant.id);
      persistCustom("Reverted to the original list.");
      remergeCustom();
      saveState();
      renderCompare();
      renderChoose();
      renderSimDialog();
    });
  }

  function adoptSimResult(result) {
    // simResultMarkup dereferences result.verdict and result.finalMetrics.games
    // unguarded, so a file missing either must be rejected here rather than
    // thrown mid-render -- this is the picker's advertised fallback path for a
    // browser that couldn't run the simulation itself, so it sees real files.
    if (!result?.finalCards?.length || typeof result.verdict !== "string" || !result.finalMetrics) {
      showToast("That result file is missing required fields.");
      return;
    }
    if (result.variantId && simDialogVariant && result.variantId !== simDialogVariant.id) {
      showToast(`That result is for ${result.variantId}, not this variant.`);
      return;
    }
    simResult = result;
    renderSimDialog();
  }

  function applySimResult() {
    if (!simResult || !simDialogVariant) return;
    const cards = simResult.finalCards.map((card) => {
      const meta = cardMetadata[itemKey(card)] || {};
      return {...meta, ...card};
    });
    Custom.putCards(customStore, cards);
    const applied = Custom.applyResultAsOverlay(customStore, simDialogVariant.id, {...simResult, finalCards: cards, appliedAt: new Date().toISOString()});
    if (!applied.applied) {
      showToast(applied.reason === "not-100" ? `That result has ${applied.total} cards, not 100.` : "That result could not be applied.");
      return;
    }
    // The optimized list is a new set of shell ids, so any stored selection for
    // this variant points at cards that no longer exist. Dropping it lets the
    // buy state rebuild from the new plan's defaults.
    forgetVariantSelection(simDialogVariant.id);
    persistCustom(`${simDialogVariant.name} updated to the optimized list.`);
    remergeCustom();
    saveState();
    renderCompare();
    renderChoose();
    renderSimDialog();
  }

  function forgetVariantSelection(variantId) {
    delete state.buySelections[variantId];
    delete state.lineupHistory[variantId];
  }

  async function pollSimStatus() {
    if (!isLocalHost() || !simDialogVariant) return;
    try {
      const response = await fetch(`${SIM_STATUS_PATH}?t=${Date.now()}`, {cache: "no-store"});
      if (!response.ok) return;
      const status = await response.json();
      const changed = JSON.stringify(status) !== JSON.stringify(simStatus);
      simStatus = status;
      if (status.state === "done" && status.resultPath && status.variantId === simDialogVariant.id && simResult?.id !== status.requestId) {
        const resultResponse = await fetch(`${status.resultPath}?t=${Date.now()}`, {cache: "no-store"});
        if (resultResponse.ok) {
          adoptSimResult(await resultResponse.json());
          return;
        }
      }
      if (changed) renderSimDialog();
    } catch (error) {
      // A missing status file just means no run has been started here.
    }
  }

  function openSimDialog(variant) {
    simDialogVariant = variant;
    simResult = null;
    simStatus = null;
    renderSimDialog();
    $("#sim-dialog").showModal();
    pollSimStatus();
    clearInterval(simPollTimer);
    simPollTimer = setInterval(pollSimStatus, SIM_POLL_MS);
  }

  function closeSimDialog() {
    clearInterval(simPollTimer);
    simPollTimer = null;
    simDialogVariant = null;
    $("#sim-dialog").close();
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

  // The fun-ladder importer (Round 1) copied the optimizer's swap-evidence sentence into every
  // text field it had -- purpose, why, whyPrimary, and brief.fit all read identically, e.g.
  // "Replaces X (adds Y). Evidence: the card it replaces was cast in 81% of the games it was
  // drawn...". That is genuinely useful -- it is exactly "what is lost by the card it
  // replaces" -- but it is a paragraph, not a row caption, and it can surface on any ladder
  // rung's purpose field, not only Fun. Detect it so the row can fall back to something short
  // and the detail sheet can give it a section of its own instead.
  function isSwapEvidenceText(text) {
    return /^Replaces .+\.\s*Evidence:/i.test(String(text || "").trim());
  }

  function swapEvidenceSentence(item) {
    return [item?.purpose, item?.why, item?.whyPrimary, item?.brief?.fit].find((value) => isSwapEvidenceText(value)) || "";
  }

  function truncateSentence(text, maxLen = 92) {
    const trimmed = String(text || "").trim();
    if (trimmed.length <= maxLen) return trimmed;
    const cut = trimmed.slice(0, maxLen);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
    const lastSpace = cut.lastIndexOf(" ");
    const boundary = lastStop > maxLen * 0.4 ? lastStop + 1 : lastSpace > 0 ? lastSpace : maxLen;
    return `${cut.slice(0, boundary).trim()}…`;
  }

  // A mechanical read of the card's own printed text -- never a claim that this specific card
  // was measured as fun, since no per-card fun rating exists anywhere in this app's data. Order
  // matters: first match wins. Most fun-ladder cards are solid, unglamorous synergy pieces with
  // no single standout mechanic, and for those this returns null on purpose rather than forcing
  // a sentence -- the same "real signal or nothing" discipline the rest of Calibrate follows.
  const FUN_SIGNALS = [
    [/flip (a|two|three) coins?|randomly/i, "Coin-flip or randomized effect — pure chaos value"],
    [/extra turn|additional turn/i, "Grants an extra turn — a genuine table reaction"],
    [/each player (may |draws|creates|gains|untaps)/i, "Group-hug effect — gives the whole table something, you included"],
    [/that many (plus one|more)[^.]*counters?[^.]*instead|doubl(e|ing)[^.]*counter/i, "Counters snowball — every counter you'd add doubles up"],
    [/untap all (permanents|creatures|lands)/i, "Extra-untap engine — a real \"wait, what?\" moment at the table"],
    [/pay \d+ life rather than pay|cast this spell without paying its mana cost/i, "Free-cast trick — sidesteps its own cost in the right spot"],
    [/choose (two|three)\b|•.*•.*•/i, "Highly modal — plays differently almost every game"],
    [/\{X\}/, "Scales with mana — a genuine X-spell payoff"],
    [/create[s]? (a|two|three|four|five|\d+)[^.]*token/i, "Builds an instant board of tokens"],
    [/^i — /im, "Saga-style storytelling — plays out like a mini-story each game"],
    [/\b(Convoke|Delve|Escape|Cascade|Suspend)\b/, "Cheats around its own cost — feels great when it works"],
    [/Double strike/, "Double strike finisher — big, satisfying damage swings"],
    [/fights? (up to \w+ )?(target |another )?creature|fight each other/i, "Creature duel — decisive, tactile combat trick"],
    [/copy target|create a copy/i, "Copy effect — doubles the fun of whatever it targets"]
  ];
  function deriveFunSignal(item) {
    const text = [item.oracleText, item.manaCost, (item.keywords || []).join(" ")].filter(Boolean).join(" ");
    return FUN_SIGNALS.find(([pattern]) => pattern.test(text))?.[1] || null;
  }

  // The very short, kind-specific line the request asked for directly on the Calibrate row:
  // Fun Tuned/Fun Max say what makes the card fun, Enhance rungs say how it helps performance,
  // Max rungs say how it maximizes Tier 3. Returns null (render nothing) rather than a filler
  // sentence when the underlying data has nothing to say -- swap-evidence paragraphs are
  // deliberately excluded here since they belong in the detail sheet, not a one-line caption.
  function microFitLine(item, kind) {
    if (kind === "enhance" || kind === "enhance2" || kind === "upgrade") {
      const raw = usefulCardCopy(item.whyOptional, item.brief?.value);
      if (!raw || isSwapEvidenceText(raw)) return null;
      return {kind: "perf", label: "Improves performance", text: truncateSentence(raw)};
    }
    if (kind === "max" || kind === "max2") {
      const raw = usefulCardCopy(item.maxReason, item.brief?.fit);
      if (!raw || isSwapEvidenceText(raw)) return null;
      return {kind: "max", label: "Maximizes Tier 3", text: truncateSentence(raw)};
    }
    if (kind === "funTuned" || kind === "funMax") {
      const signal = deriveFunSignal(item);
      return signal ? {kind: "fun", label: "What makes this fun", text: signal} : null;
    }
    return null;
  }

  // Base/Tuned/Maxxed are offered on every deck; the -2/Fun/Alt rungs only appear once the
  // importer has actually populated that ladder's entry array for this specific plan (see
  // tools/import_budget_plan.py) -- the other 24 variants have none of these keys at all, so
  // their dropdown degrades to exactly the original three, per plan.
  // Tuned and Maxxed absorb their Monte-Carlo-improved counterparts rather than
  // offering them as separate rungs: the -2 arrays stay in the data (they are
  // regenerated from the workbook, and the slot model resolves each ladder
  // through its own `replaces` chain), but a reader only ever picks "Tuned" or
  // "Maxxed" and gets the improved build. A plan without the -2 arrays keeps the
  // same two rungs, just without the extra cards folded in.
  function deckPresets(plan) {
    const tunedCategories = Array.isArray(plan.tuned2) ? ["required", "tuned2"] : ["required"];
    const maxCategories = Array.isArray(plan.tuned2)
      ? ["required", "tuned2", "upgrade", "enhance", "enhance2", "max", "max2"]
      : ["required", "upgrade", "enhance", "max"];
    const presets = [
      {key: "base", label: "Base", categories: []},
      {key: "tuned", label: "Tuned", categories: tunedCategories},
      {key: "enhance", label: "Enhance", categories: [...tunedCategories, "upgrade", "enhance"]},
      {key: "max", label: "Maxxed", categories: maxCategories}
    ];
    if (Array.isArray(plan.funTuned)) {
      presets.push(
        {key: "funTuned", label: "Fun Tuned", categories: ["funTuned"]},
        {key: "funMax", label: "Fun Max", categories: ["funTuned", "funMax"]}
      );
    }
    if (plan.altTuned?.length) {
      presets.push(
        {key: "altTuned", label: "Alt Tuned", categories: ["altTuned"]},
        {key: "altMax", label: "Alt Max", categories: ["altTuned", "altMax"]}
      );
    }
    return presets;
  }

  // Applies a preset's categories in ladder order onto a fresh shell baseline, using the
  // same applyChoice/slot-group mechanism as an individual checkbox click -- proven during
  // the data import to exactly reproduce each ladder rung's source 100-card list this way.
  // It is a wholesale assignment, not a merge: whatever the deck was previously configured
  // to is fully replaced, matching the dropdown's own nature as an explicit re-apply action
  // rather than an incremental one.
  function assemblePreset(plan, key) {
    const preset = deckPresets(plan).find((entry) => entry.key === key);
    if (!preset) return null;
    let selection = Lineup.emptySelection();
    selection.shell = (plan.startingShell || plan.baseCards || []).map((item) => String(item.id));
    selection = Lineup.canonicalizeSelection(plan, selection);
    for (const category of preset.categories) {
      // An owned substitution is a free choice offered to you, not part of the
      // published build a preset names -- the simulated numbers describe the
      // build without it, so applying it silently would detach them.
      for (const item of plan[category] || []) {
        if (item.ownedOptional) continue;
        selection = Lineup.applyChoice(plan, selection, item.id);
      }
    }
    return selection;
  }

  // The dropdown asks how far you want to invest, not which optimizer you prefer. Ten entries
  // made the reader choose both at once; four (plus Alt where it exists) ask only the first,
  // and the flavor comes from whichever tab is showing in that group -- so picking "Tuned"
  // while the Fun Tuned tab is open applies Fun Tuned. Each option is still a complete,
  // exactly-100, compliance-checked configuration.
  function levelPresetOptions(plan, current, variantId) {
    const options = [{key: "base", label: "Base", detail: "The starting shell on its own"}];
    for (const group of LADDER_GROUPS) {
      if (group.key === "alt") continue;
      const tab = activeLadderTab(plan, group, variantId, current);
      if (!tab) continue;
      const sameLabel = tab.label === group.title;
      options.push({key: tab.preset, label: group.title, detail: sameLabel ? `The ${tab.label} build` : `Using the ${tab.label} build`});
    }
    if (plan.altTuned?.length) {
      options.push({key: "altTuned", label: "Alt Tuned", detail: "The alternative commander's tuned build"});
      options.push({key: "altMax", label: "Alt Max", detail: "The alternative commander at full capability"});
    }
    return options;
  }

  function presetDropdownMarkup(plan, current, variantId) {
    const options = levelPresetOptions(plan, current, variantId);
    if (options.length <= 1) return "";
    return `<label class="preset-select"><span>Apply configuration</span>
      <select data-apply-preset aria-label="Apply a configuration to Deck ${esc(variantId)}">
        <option value="" selected>Apply configuration…</option>
        ${options.map((option) => `<option value="${esc(option.key)}">${esc(option.label)} — ${esc(option.detail)}</option>`).join("")}
      </select>
    </label>`;
  }

  // Which curated Compare-page score profile (stage 1/2/3) a preset's ratings are borrowed
  // from -- the -2/Fun/Alt presets have no ratings authored for them specifically, so each
  // inherits whichever original stage represents a comparable level of investment.
  const PRESET_STAGE = {
    base: 1, tuned: 2, max: 3,
    tuned2: 2, enhance2: 3, max2: 3,
    funTuned: 2, funMax: 3,
    altTuned: 2, altMax: 3
  };
  const PRESET_BUILD_NAME = {
    base: "Base", tuned: "Tuned", max: "Max",
    tuned2: "Tuned-2", enhance2: "Enhance-2", max2: "Max-2",
    funTuned: "Pod Fun", funMax: "Fun Max",
    altTuned: "Alt Tuned", altMax: "Alt Max"
  };

  function jaccardSimilarity(a, b) {
    if (!a.size && !b.size) return 1;
    let intersection = 0;
    for (const id of a) if (b.has(id)) intersection++;
    return intersection / (a.size + b.size - intersection);
  }

  // Finds which preset a given id-set most resembles, regardless of whether a preset was ever
  // applied -- free-form editing means a live selection routinely isn't an exact match for any
  // one preset, so this is a similarity search, not a lookup. Shared by the Calibrate dynamic
  // metrics header (over the raw Calibrate selection) and the Decks advisory performance
  // check (over just the active 100), since both are asking the same question of different id-sets.
  // Assembling a preset walks the whole lineup model, and several features now ask for every
  // preset on every render (the metrics header, the dropdown, the per-card build panel), so
  // the results are cached per plan. Keyed by the plan object itself, which lives as long as
  // the loaded catalog does -- reloading the catalog produces new objects and a fresh cache.
  const presetAssemblyCache = new WeakMap();
  function assembledPresets(plan) {
    if (!presetAssemblyCache.has(plan)) {
      presetAssemblyCache.set(plan, deckPresets(plan).map((preset) => {
        const selection = assemblePreset(plan, preset.key);
        return {preset, selection, ids: new Set(Lineup.ARRAY_KEYS.flatMap((key) => selection[key] || []).map(String))};
      }));
    }
    return presetAssemblyCache.get(plan);
  }

  function nearestPresetMatchForIds(plan, currentIds) {
    const scored = assembledPresets(plan).map(({preset, ids: presetIds}) => {
      return {preset, presetIds, similarity: jaccardSimilarity(currentIds, presetIds)};
    });
    const best = scored.sort((a, b) => b.similarity - a.similarity)[0];
    let extra = 0, missing = 0;
    for (const id of currentIds) if (!best.presetIds.has(id)) extra++;
    for (const id of best.presetIds) if (!currentIds.has(id)) missing++;
    return {...best, extra, missing};
  }

  function nearestPresetMatch(plan, current) {
    return nearestPresetMatchForIds(plan, new Set(Lineup.selectedEntries(plan, current).map((entry) => entry.id)));
  }

  // "Is checking this card a good idea?" -- answered from what the tested builds actually did
  // with it. Every configuration fills the same slot exactly once, so for any card we can ask
  // each build whether it kept that card or replaced it, and with what. That works for shell
  // cards with no why-text of their own (which is most of them) and never invents a number:
  // it reports the choices real simulated builds made, nothing more.
  function cardBuildMembership(plan, item) {
    const model = Lineup.buildModel(plan);
    const entry = model.byId.get(String(item.id))
      || model.entries.find((candidate) => Lineup.normalizeName(candidate.item.name) === Lineup.normalizeName(item.name));
    if (!entry) return null;
    const kept = [];
    const cut = new Map();
    for (const {preset, selection} of assembledPresets(plan)) {
      const active = Lineup.activeEntryForSlot(plan, selection, entry.slotId);
      if (!active) continue;
      if (Lineup.normalizeName(active.item.name) === Lineup.normalizeName(entry.item.name)) kept.push(preset.label);
      else {
        if (!cut.has(active.item.name)) cut.set(active.item.name, []);
        cut.get(active.item.name).push(preset.label);
      }
    }
    if (!kept.length && !cut.size) return null;
    return {kept, cut: [...cut.entries()].map(([name, builds]) => ({name, builds})), total: kept.length + [...cut.values()].reduce((sum, b) => sum + b.length, 0)};
  }

  function cardBuildMembershipMarkup(plan, item) {
    const membership = cardBuildMembership(plan, item);
    if (!membership) return "";
    const {kept, cut, total} = membership;
    let headline;
    if (!cut.length) headline = `Every one of this deck's ${total} tested builds keeps it.`;
    else if (!kept.length) headline = `Every one of this deck's ${total} tested builds replaces it.`;
    else headline = `${kept.length} of this deck's ${total} tested builds keep it; ${total - kept.length} replace it.`;
    return `<section class="detail-block build-membership">
      <h3>${sectionIcon("scoring")}In this deck's tested builds</h3>
      <p class="build-membership-headline">${esc(headline)}</p>
      <ul class="build-membership-list">
        ${kept.length ? `<li><b>Keeps it</b><span>${esc(kept.join(" · "))}</span></li>` : ""}
        ${cut.map((group) => `<li><b>Replaced by ${esc(group.name)}</b><span>${esc(group.builds.join(" · "))}</span></li>`).join("")}
      </ul>
      <p class="build-membership-note">Based on the configurations that were actually simulated — not a prediction about your own list.</p>
    </section>`;
  }

  // Piece 1 of the dynamic metrics header (the 12-metric strip Rob asked for, minus Growth):
  // reuses the Compare page's own curated ratings, anchored to whichever stage the nearest-
  // matching preset borrows from, and flags that borrowing plainly when it isn't an exact
  // match for one of the three original stages.
  function dynamicMetricsHeaderMarkup(plan, current, variant) {
    const match = nearestPresetMatch(plan, current);
    const stage = PRESET_STAGE[match.preset.key] || 2;
    const inherited = !["base", "tuned", "max"].includes(match.preset.key);
    const playstyle = variant.scores?.playstyle?.[stage - 1] || [];
    const engine = variant.scores?.engine?.[stage - 1] || [];
    const matchPct = Math.round(match.similarity * 100);
    const deltaBits = [];
    if (match.extra) deltaBits.push(`+${match.extra}`);
    if (match.missing) deltaBits.push(`−${match.missing}`);
    const buildName = PRESET_BUILD_NAME[match.preset.key];
    const sim = simulationSummary?.builds?.[variant.id]?.[buildName];
    // The measured readout used to hang below this panel as a loose dotted box,
    // which read as a stray note rather than as part of the ratings. It belongs
    // inside them: these are the estimates, that is what the simulation actually
    // measured, and they answer the same question.
    return `<div class="dynamic-metrics" data-ui-key="dynmetrics-${esc(variant.id)}">
      <p class="dynamic-metrics-lede">Nearest configuration: <b>${esc(match.preset.label)}</b> (${matchPct}% match)${deltaBits.length ? ` · ${deltaBits.join(" / ")} vs that build` : ""}</p>
      ${inherited ? `<p class="dynamic-metrics-note">${esc(match.preset.label)} has no ratings authored for it yet -- these are inherited from ${stage === 3 ? "Maxxed" : "Tuned"}'s profile until real sim-derived ratings replace them.</p>` : ""}
      <div class="metric-strip">
        ${metricFamilyMarkup("playstyle", playstyle, `metric-playstyle-${variant.id}-buy`)}
        ${metricFamilyMarkup("engine", engine, `metric-engine-${variant.id}-buy`)}
      </div>
      ${simulationReadoutMarkup(buildName, sim)}
    </div>`;
  }

  // The engine-boundary caveat is identical on every readout, so repeating it under each one
  // buried the numbers in boilerplate. It lives in one place now -- this hoverable icon --
  // and every readout references it rather than restating it.
  function engineNoteIcon() {
    if (!simulationSummary?.engineBoundaryNote) return "";
    return `<button type="button" class="engine-note-icon info-tip tip-action" data-tooltip="${esc(simulationSummary.engineBoundaryNote)}" aria-label="How to read these numbers">${icon("i")}</button>`;
  }

  // Piece 2, additive beyond what Rob explicitly asked for: the real simulated result for
  // whichever build piece 1 just matched, straight from the workbook's Summary sheet. Kept
  // visually separate from the metric strip above, and never renders a Score/Win% without
  // its engine tag -- see data/simulation-summary.json.
  function simulationReadoutMarkup(buildName, sim) {
    if (!simulationSummary) return "";
    if (!sim || sim.games == null) {
      return `<p class="simulation-readout is-unsimulated">${icon("i")}<span><b>${esc(buildName)}</b> · ${esc(sim?.note || "published list — not independently simulated")}</span></p>`;
    }
    // Score alone no longer says enough: two rungs are scored on different
    // vectors, so the comparable number is power (the shared performance
    // reading) and the interesting one is how the rest of the table's night
    // went.
    const parts = [
      sim.score != null ? `score ${sim.score.toFixed(1)}` : null,
      sim.powerScore != null && Math.abs(sim.powerScore - (sim.score ?? sim.powerScore)) >= 0.1 ? `power ${sim.powerScore.toFixed(1)}` : null,
      `${sim.games.toLocaleString()} games`,
      sim.winPct != null ? `${(sim.winPct * 100).toFixed(1)}% win` : "win % n/a",
      sim.podFunPct != null ? `pod fun ${(sim.podFunPct * 100).toFixed(0)}` : null,
      sim.tier ? `Tier ${sim.tier}` : null
    ].filter(Boolean);
    return `<div class="simulation-readout" data-engine="${esc(sim.engine || "")}">
      <p><b>Simulated:</b> ${esc(buildName)} · ${parts.join(" · ")} · <span class="engine-tag">${esc(sim.engine || "engine n/a")} engine</span>${engineNoteIcon()}</p>
    </div>`;
  }

  // The Monte-Carlo-improved rungs are folded into their base rung, so their cards
  // carry the base rung's own label rather than announcing a tier that no longer
  // exists as a separate choice.
  const KIND_LABELS = {
    precon: "Precon", shell: "Starting Shell", tuned: "Tuned", upgrade: "Enhance", enhance: "Enhance", max: "Maxxed",
    tuned2: "Tuned", enhance2: "Maxxed", max2: "Maxxed",
    funTuned: "Pod Fun", funMax: "Fun Max",
    altTuned: "Alt Tuned", altMax: "Alt Max",
    manual: "Manual"
  };
  // Which plan array each checkbox kind draws from. Only "tuned" differs from its own name.
  const KIND_ARRAY = {tuned: "required"};
  const kindItems = (plan, kind) => plan?.[KIND_ARRAY[kind] || kind] || [];

  // The ladder rungs are grouped by what they cost you, not by which optimizer produced them.
  // Flat sections asked the reader to know that Tuned and Fun Tuned are alternative ways to
  // spend the same tier of money; tabbed groups say it outright. `preset` is the configuration
  // a tab represents end to end -- crucially NOT just its own array, since Fun Tuned is built
  // straight off Base rather than toggling on top of Tuned.
  const LADDER_GROUPS = [
    {
      key: "tuned", title: "Tuned", glyph: "✓",
      tabs: [
        {key: "tuned", label: "Tuned", kinds: ["tuned", "tuned2"], preset: "tuned", build: "Tuned",
         note: "The required purchases that make this deck work, with every Monte-Carlo-improved swap folded in."},
        {key: "funTuned", label: "Pod Fun", kinds: ["funTuned"], preset: "funTuned", build: "Pod Fun",
         note: "The same deck asked a different question: win rate held under 45% so the table gets a game, pod experience weighted, and floored on power so it can never be the stronger build."}
      ]
    },
    {
      key: "enhance", title: "Enhance", glyph: "+",
      tabs: [
        {key: "enhance", label: "Enhance", kinds: ["enhance", "upgrade"], preset: "enhance", build: "Enhance",
         note: "Role-preserving improvements and owned substitutions on top of Tuned, still inside Tier 2 · $20 or less."}
      ]
    },
    {
      key: "max", title: "Maxxed", glyph: "✦",
      tabs: [
        {key: "max", label: "Maxxed", kinds: ["max", "enhance2", "max2"], preset: "max", build: "Max",
         note: "Tier 3 capability — the Game Changers a Tier 2 build may not run at all — plus every Monte-Carlo-improved swap. Price is not the criterion here."},
        {key: "funMax", label: "Fun Max", kinds: ["funMax"], preset: "funMax", build: "Fun Max",
         note: "Fun-weighted re-optimization on top of Fun Tuned."}
      ]
    },
    {
      key: "manual", title: "Manual", glyph: "✎",
      tabs: [
        {key: "manual", label: "Manual", kinds: ["manual"], preset: "manual", build: "Manual",
         note: "Cards you put here yourself — pulled out of Salvage, or resolved from a pasted TCGplayer link. Each one names the card it would replace and is offered as one more choice in that slot: check it to swap it in, uncheck it to hand the slot back. Nothing here has been through the simulation, so measured fields read n/a."}
      ]
    },
    {
      key: "alt", title: "Alt commander", glyph: "◇",
      tabs: [
        {key: "altTuned", label: "Alt Tuned", kinds: ["altTuned"], preset: "altTuned", build: "Alt Tuned",
         note: "The alternative commander's own tuned build, off Base · every card here is tagged Alt."},
        {key: "altMax", label: "Alt Max", kinds: ["altMax"], preset: "altMax", build: "Alt Max",
         note: "The alternative commander pushed to full capability, on top of Alt Tuned."}
      ]
    }
  ];

  // Which tab is showing is a view preference, not a choice about the deck, so it lives here
  // rather than in saved state -- same reasoning as the Compare page's alt-commander preview.
  const ladderTabState = new Map();

  function availableTabs(plan, group) {
    // Every other group hides when it holds no cards, because an empty rung is noise.
    // Manual is the exception: its whole point is the box you add the first card with, so
    // it stays reachable on a deck that has none yet.
    if (group.key === "manual") return group.tabs;
    return group.tabs.filter((tab) => tab.kinds.some((kind) => kindItems(plan, kind).length));
  }

  function activeLadderTab(plan, group, variantId, current) {
    const tabs = availableTabs(plan, group);
    if (!tabs.length) return null;
    const stored = ladderTabState.get(`${variantId}:${group.key}`);
    const match = tabs.find((tab) => tab.key === stored);
    if (match) return match;
    // Default to whichever tab the deck is actually configured toward, so opening a group
    // shows the build in play rather than always the site's own list.
    const checkedIn = (tab) => tab.kinds.reduce((sum, kind) => sum + kindItems(plan, kind).filter((item) => (current[kind] || []).includes(item.id)).length, 0);
    return tabs.slice().sort((a, b) => checkedIn(b) - checkedIn(a))[0];
  }

  function buyItemRow(item, kind, current, variantId, options = {}) {
    const checked = (current[kind] || []).includes(item.id);
    const impact = (kind === "enhance" || kind === "enhance2") ? enhancementImpact(item) : null;
    const replacement = item.replaces ? `<span class="replacement-line"><b${impact ? ` class="replace-impact impact-${impact.key}" title="${esc(impact.label)}" aria-label="Replaces — ${esc(impact.label)}"` : ""}>Replaces</b><span>${esc(item.replaces)}</span></span>` : "";
    // A swap-evidence paragraph ("Replaces X. Evidence: cast in 81% of games...") can land in
    // purpose/maxReason on any ladder rung; it belongs in the detail sheet, not this row.
    const rawSummary = kind === "max" ? (item.maxReason || item.purpose || item.typeLine || "") : (item.purpose || item.typeLine || "");
    const summaryCopy = isSwapEvidenceText(rawSummary) ? (item.typeLine || "") : rawSummary;
    const microFit = microFitLine(item, kind);
    return `<div class="buy-item" ${buyRowAttributes(item, checked)}>
      <input type="checkbox" ${checked ? "checked" : ""} data-buy-kind="${esc(kind)}" data-item-id="${esc(item.id)}" data-variant-id="${esc(variantId)}" aria-label="Include ${esc(item.name)} in the final deck">
      <button class="buy-item-detail" type="button" data-item-kind="${esc(kind)}" data-item-id="${esc(item.id)}">
        <img src="${esc(item.image)}" alt="" loading="lazy">
        <span class="buy-copy">
          <span class="buy-item-eyebrow"><span class="kind-label ${esc(kind)}">${esc(KIND_LABELS[kind] || kind)}</span>${altTagMarkup(item, options)}${item.capabilityOption ? `<span class="offer-mini" title="Offered on top of the measured rung — the published score for this build does not include it">＋ Option</span>` : ""}${item.ownedExtra ? `<span class="owned-mini">✓ Owned</span>` : ""}${item.temporaryUntil ? `<span class="temp-mini">Temp until ${esc(item.temporaryUntil)}</span>` : ""}${item.gameChanger ? `<span class="gc-mini">✦ Game Changer</span>` : ""}</span>
          <strong>${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</strong>
          ${replacement}<small>${esc(summaryCopy)}</small>
          ${microFit ? `<small class="micro-fit micro-fit-${microFit.kind}"><b>${esc(microFit.label)}:</b> ${esc(microFit.text)}</small>` : ""}
        </span>
      </button>
      <span class="price">${money(cardPriceBounds(item, cardMetadata[itemKey(item)] || {}).price)}</span>
    </div>`;
  }

  // Which commander a row belongs to. Inside the Alt commander group every card
  // is there to support one specific alternative commander, and saying whose
  // build it is on the row itself beats a note above the list that a reader has
  // already scrolled past. Outside that group the old generic Alt flag stands.
  function altTagMarkup(item, options) {
    if (item.isCommander) return `<span class="commander-mini">◆ Commander</span>`;
    if (options.altCommanderName) return `<span class="alt-mini">◇ ${esc(options.altCommanderName)}</span>`;
    return item.tags?.includes("alt") ? `<span class="alt-mini">◇ Alt</span>` : "";
  }

  // The measured delta for a whole rung of offered options, written by
  // tools/sim/build-capability.mjs. Every item on a rung carries the same
  // sentence, so the panel states it once rather than repeating it per row --
  // and it only ever says what the engine produced, including the runs where
  // adopting the rung measured worse than the build below it.
  function rungMeasurementMarkup(rows) {
    const note = rows.map(({item}) => item.rungMeasurement).find(Boolean);
    if (!note) return "";
    return `<p class="rung-measurement">${icon("i")}<span>${esc(note)}</span></p>`;
  }

  function ladderGroupMarkup(group, plan, current, variantId, altActive) {
    const tabs = availableTabs(plan, group);
    if (!tabs.length) return "";
    const active = activeLadderTab(plan, group, variantId, current);
    const isAltGroup = group.key === "alt";
    // Visual de-emphasis only: the group whose commander isn't in play is the one you're
    // probably not shopping from. Every control inside stays fully clickable -- this app
    // never blocks a choice, it only ever reports on one.
    const deemphasized = isAltGroup ? !altActive : altActive;
    // Alphabetical within each kind, so a rung you are shopping reads like a
    // list you can scan rather than the order the optimizer happened to accept
    // its swaps in. Sorted on a copy -- the plan's own array order is what
    // lineup-model walks to resolve one rung's `replaces` onto the rung below.
    const tabItems = (tab) => tab.kinds.flatMap((kind) => kindItems(plan, kind).slice().sort(byCardName).map((item) => ({item, kind})));
    const checkedCount = (tab) => tabItems(tab).filter(({item, kind}) => (current[kind] || []).includes(item.id)).length;
    const groupChecked = tabs.reduce((sum, tab) => sum + checkedCount(tab), 0);
    // Shopping progress has to be legible while the group is shut: the per-tab counts in the
    // tab strip only exist once it is open. Tabs within a group draw on disjoint kinds, so
    // summing them double-counts nothing.
    const groupTotal = tabs.reduce((sum, tab) => sum + tabItems(tab).length, 0);
    const rows = tabItems(active);
    // In the Alt commander group every row is part of one commander's build, so
    // the rows carry that commander's name and the panel drops the two notes
    // that used to say the same thing less usefully above them.
    const altCommanderName = isAltGroup ? (plan.altTuned || []).find((item) => item.isCommander)?.name || "" : "";
    const allChecked = rows.length > 0 && rows.every(({item, kind}) => (current[kind] || []).includes(item.id));
    const anyChecked = rows.some(({item, kind}) => (current[kind] || []).includes(item.id));
    const sim = simulationSummary?.builds?.[variantId]?.[active.build];
    return `<details class="buy-section ladder-group${deemphasized ? " is-deemphasized" : ""}" data-ui-key="buygrp-${esc(variantId)}-${esc(group.key)}" data-ladder-group="${esc(group.key)}">
      <summary>
        <span>${icon(group.glyph)}${esc(group.title)} <b title="${groupChecked} of ${groupTotal} checked to buy">${groupChecked}/${groupTotal}</b></span>
        <small>${esc(active.note)}</small>
        <span></span>
        <span class="section-expander" aria-hidden="true"></span>
      </summary>
      <div class="ladder-tabs" role="tablist" aria-label="${esc(group.title)} builds">
        ${tabs.map((tab) => `<button type="button" role="tab" class="ladder-tab${tab.key === active.key ? " is-active" : ""}" data-ladder-tab="${esc(group.key)}" data-tab-key="${esc(tab.key)}" aria-selected="${tab.key === active.key}">${esc(tab.label)}<b>${checkedCount(tab)}/${tabItems(tab).length}</b></button>`).join("")}
      </div>
      <div class="ladder-tab-panel">
        <p class="ladder-tab-note">${esc(active.note)}</p>
        ${isAltGroup ? "" : simulationReadoutMarkup(active.build, sim)}
        ${rungMeasurementMarkup(rows)}
        <label class="section-select-all ladder-select-all" data-select-tab-all="${esc(group.key)}" data-tab-preset="${esc(active.preset)}">
          <input type="checkbox" ${allChecked ? "checked" : ""}><span>Select all ${esc(active.label)}</span>
        </label>
        ${deemphasized && !isAltGroup ? `<p class="ladder-deemphasis-note">${icon("i")}<span>The alternative commander is active, so this build's cards are not part of that lineup. Selecting them is still allowed.</span></p>` : ""}
      </div>
      <div class="ladder-rows" data-any-checked="${anyChecked}">${rows.map(({item, kind}) => buyItemRow(item, kind, current, variantId, {altCommanderName})).join("")}</div>
    </details>`;
  }

  function transferCardSnapshot(card) {
    const keys = ["name", "manaCost", "typeLine", "oracleText", "keywords", "colorIdentity", "legalities", "commanderLegal", "rarity", "setName", "image", "price", "ceiling", "tcgplayerUrl", "tags", "purpose", "why", "whyPrimary", "brief", "gameChanger", "ownedExtra", "temporaryUntil"];
    return Object.fromEntries(keys.filter((key) => card[key] !== undefined).map((key) => [key, card[key]]));
  }

  /**
   * What fills a slot when the card currently in it leaves.
   *
   * The card it replaced, when that is still a same-sized option; otherwise the best
   * remaining candidate in the same slot, cheapest rung first. Same-sized matters
   * because a slot can hold twelve basics as easily as one spell, and swapping across
   * that boundary is what would quietly take the deck off a hundred.
   *
   * Shared by the Salvage move on a live deck and by sending a hand-added card back to
   * the bench, so both answer the question the same way.
   */
  function slotFallbackFor(model, entry) {
    const sameSize = (candidate) => Number(candidate.item.quantity || 1) === Number(entry.item.quantity || 1);
    const predecessor = entry.kind === "shell" ? null : model.byId.get(entry.predecessorId);
    if (predecessor && predecessor.id !== entry.id && sameSize(predecessor)) return predecessor;
    // "manual" is absent on purpose: another hand-added card is a fine choice to make
    // deliberately and a poor one to fall into, so it sorts behind every measured rung.
    const priorities = {
      tuned: 0, shell: 1, enhance: 2, upgrade: 2, max: 3,
      tuned2: 4, funTuned: 4, altTuned: 4, enhance2: 5, max2: 6, funMax: 6, altMax: 6
    };
    return (model.groups.get(entry.slotId) || [])
      .filter((candidate) => candidate.id !== entry.id && sameSize(candidate))
      .sort((a, b) => (priorities[a.kind] ?? 9) - (priorities[b.kind] ?? 9) || a.item.name.localeCompare(b.item.name))[0] || null;
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
    const replacement = slotFallbackFor(model, entry);
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

  // Find the card an item's `replaces` pointer names, anywhere in the plan. The
  // pointer is a name rather than an id (that is what lets a rung layer onto the
  // rung below it without knowing which item filled the slot), so this is a
  // lookup by name across every bucket, falling back to the audited catalog for
  // cards that sit in the shell rather than on a ladder.
  const REPLACES_BUCKETS = ["startingShell", "required", "tuned2", "upgrade", "enhance", "enhance2", "max", "max2", "funTuned", "funMax", "altTuned", "altMax", "manual"];
  function replacedCardFor(plan, name) {
    if (!name) return null;
    const key = itemKey({name});
    for (const bucket of REPLACES_BUCKETS) {
      const found = (plan?.[bucket] || []).find((candidate) => itemKey(candidate) === key);
      if (found) return found;
    }
    const meta = cardMetadata[key];
    return meta ? {name, ...meta} : {name};
  }

  // Buying a card off a ladder is always a swap, and until now the sheet said so
  // in words -- a name and an arrow. What you actually want to know is whether
  // you are happy to take that card out, and for that you have to look at it.
  // Both cards, side by side, at the top of the sheet.
  function swapPreviewMarkup(plan, item) {
    if (!item.replaces) return "";
    const outgoing = replacedCardFor(plan, item.replaces);
    if (!outgoing) return "";
    const big = (card) => (cardImageCandidates(card)[0] || "").replace("version=small", "version=normal").replace("/small/", "/normal/");
    const side = (card, role, label) => `<figure class="swap-side is-${role}">
      <img src="${esc(big(card))}" alt="${esc(card.name)} card" loading="lazy">
      <figcaption><b>${esc(label)}</b><span>${esc(card.name)}</span></figcaption>
    </figure>`;
    return `<section class="detail-block detail-swap">
      <h3>${sectionIcon("does")}The swap</h3>
      <div class="swap-pair">
        ${side(outgoing, "out", "Out")}
        <span class="swap-arrow" aria-hidden="true">→</span>
        ${side(item, "in", "In")}
      </div>
      <button type="button" class="related-card-link swap-open" data-related-card="${esc(item.replaces)}">Open ${esc(item.replaces)} →</button>
    </section>`;
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
        <div class="deck-plan">${plan?.planHtml || variant.detailHtml || "<p>No extended plan is available.</p>"}</div>
      </section>
      ${item.tcgplayerUrl ? `<p><a class="primary-button detail-link" href="${esc(item.tcgplayerUrl)}" target="_blank" rel="noopener">Find this precon on TCGplayer</a></p>` : ""}`
      : `
      <div class="item-meta">${item.manaCost ? `<span>${manaCostHtml(item.manaCost)}</span>` : ""}<span>${esc(item.typeLine || "")}</span><span>${money(item.price)}${item.ceiling ? ` · ceiling ${money(item.ceiling)}` : ""}</span></div>
      ${swapPreviewMarkup(plan, item)}
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
      ${cardBuildMembershipMarkup(plan, item)}
      ${(kind === "funTuned" || kind === "funMax") ? (() => {
        const signal = deriveFunSignal(item);
        return signal
          ? detailText("What makes this fun", signal)
          : `<section class="detail-block"><h3>What makes this fun</h3><p>No single standout mechanic here -- this card earned its spot because the fun-weighted simulation measured the deck playing better with it in, not because of a flashy effect on the card itself.</p></section>`;
      })() : ""}
      ${(() => {
        const evidence = swapEvidenceSentence(item);
        return evidence ? `<section class="detail-block swap-evidence-block"><h3>What the card it replaces gave up</h3><p>${esc(evidence)}</p></section>` : "";
      })()}
      ${detailText("Why it is optional", usefulCardCopy(item.whyOptional))}
      ${detailText("Alternate rationale", usefulCardCopy(item.alternateReason))}
      ${detailText("Tradeoff", usefulCardCopy(item.alternateTradeoff))}
      ${(brief.power || brief.ease || brief.fun) ? `<section class="detail-block"><h3 ${tooltipAttributes(TOOLTIP_DEFINITIONS.cardScoring)}>${sectionIcon("scoring")}Card scoring${tooltipHint()}</h3><div class="brief-scores">
        ${briefScore("Power", brief.power)}${briefScore("Ease", brief.ease)}${briefScore("Fun", brief.fun)}
      </div><div class="brief-insights">${brief.value ? `<p ${tooltipAttributes(TOOLTIP_DEFINITIONS.value)}>${sectionIcon("value")}<span><b>Value</b>${esc(brief.value)}</span>${tooltipHint()}</p>` : ""}<p ${tooltipAttributes(TOOLTIP_DEFINITIONS.fit)}>${sectionIcon("fit")}<span><b>Fit</b>${esc(standaloneCardFit(item, plan))}</span>${tooltipHint()}</p></div></section>` : ""}
      ${placementMarkup}
      ${item.tcgplayerUrl ? `<p><a class="primary-button detail-link" href="${esc(item.tcgplayerUrl)}" target="_blank" rel="noopener">Search this card on TCGplayer</a></p>` : ""}`;
    decorateRichContent($("#detail-sheet-body"), variant);
    // There are two of these now -- the swap preview's button and the quick
    // grid's -- so every one gets wired rather than whichever came first.
    $$("[data-related-card]", $("#detail-sheet-body")).forEach((button) => button.addEventListener("click", (event) => {
      const replacementName = event.currentTarget.dataset.relatedCard;
      const related = replacedCardFor(plan, replacementName);
      if (related?.typeLine || related?.id) openBuyItemDetail({...related, whereToBuy: related.whereToBuy || "Already in the starting shell"}, variant, "starting shell");
      else showToast(`${replacementName} is not available in this modeled shell.`);
    }));
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

  // Card names sort the way a person reads them: case-insensitively, ignoring
  // the leading punctuation on names like "_____ Goblin", and on the first face
  // of a split card, which is the face the row prints.
  const byCardName = (a, b) => String(a?.name || "").split(" // ")[0].localeCompare(String(b?.name || "").split(" // ")[0], "en", {sensitivity: "base", ignorePunctuation: true});

  /* What to call a deck where it is only ever a tag: on a Shop row, a Bench destination,
     an "in whose box" label. "D3" is a filing code and says nothing at a vendor's table;
     the build name is what the deck is. The commander after the dash is dropped because
     the name in front of it is already unique among the six. */
  function deckTag(variant) {
    const name = String((variant && variant.name) || "").split(/\s+[\u2014\u2013-]\s+/)[0].trim();
    return name || ("D" + (variant && variant.deckId));
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
        ...Lineup.selectedEntries(plan, current).filter((entry) => entry.kind !== "shell").map((entry) => entry.item)
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
    alt: "all",
    cardType: "all",
    color: "all",
    price: "all",
    rarity: "all",
    location: "all",
    sort: "default",
    groupBy: "status",
    subgroupBy: "typeLine"
  };
  // Shared by the Decks and Shop copies of the Level filter (see P3 in the
  // new-categories plan -- both must stay in sync, so this is the one list they both read).
  const LEVEL_FILTER_OPTIONS = [
    ["all", "All levels"],
    ["shell", "Starting Shell"],
    ["tuned", "Tuned"],
    ["enhance", "Enhance"],
    ["maxxed", "Maxxed"],
    ["tuned2", "Tuned-2"],
    ["enhance2", "Enhance-2"],
    ["max2", "Maxxed-2"],
    ["funTuned", "Fun Tuned"],
    ["funMax", "Fun Max"],
    ["altTuned", "Alt Tuned"],
    ["altMax", "Alt Max"]
  ];
  const ALT_FILTER_OPTIONS = [["all", "All cards"], ["alt", "Alt only"]];
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

  // Decks used to keep a filter set per deck, which meant six copies of the same
  // controls on one page and six places to set the same thing. There is now one
  // set for the whole page. The signature is unchanged on purpose: every
  // consumer of these filters -- matching, sorting, grouping, the CSV export --
  // carries on untouched, and only what "the filters for this deck" means moves.
  function ensureLiveFilters() {
    state.liveFilters ||= {};
    state.liveFilters.page = {...LIVE_FILTER_DEFAULTS, ...(state.liveFilters.page || {})};
    const filters = state.liveFilters.page;
    if (filters.groupBy === filters.subgroupBy) filters.subgroupBy = "none";
    // Decks and Cards are the "what do I actually have" pages, so they show what
    // you own. Shop is the other half of that question and shows what you do not.
    filters.status = "bought";
    return filters;
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

  // Compare picks the variant, Calibrate selects cards to buy (can hold more than 100, on
  // purpose, for optionality), Shop tracks what's actually been bought, and Decks
  // builds the active deck from that pool. One-way pipeline: a card only appears here once
  // it's checked in Calibrate, and nothing chosen here flows back upstream.
  //
  // Which cards are active is therefore DERIVED from Calibrate, not remembered indefinitely.
  // Alongside each variant's active map we store a signature of the Calibrate selection that
  // produced it. When that signature changes -- a preset applied, a checkbox clicked, a
  // commander switched -- the map is rebuilt wholesale from the new selection, because the
  // upstream choice is the newer statement of intent (and rebuilding also prunes ids that are
  // no longer selected at all). While the signature holds steady, the stored map is returned
  // untouched, so manual bench/activate decisions made here survive any number of re-renders.
  //
  // Storing that signature is the whole fix for a class of bug where a freshly applied preset
  // showed 100/100 in Calibrate but far fewer active here: the map used to be append-only and
  // seeded correct values exactly once per variant, so every card introduced afterwards was
  // silently benched while unchanged cards kept stale values.
  function ensureLiveActiveMap(variant, activeIds, candidateIds, selectionSignature) {
    state.liveActive ||= {};
    state.liveActiveSeed ||= {};
    const storedMap = state.liveActive[variant.id];
    const seedMatches = state.liveActiveSeed[variant.id] === selectionSignature;
    if (storedMap && seedMatches) {
      // Transfers (borrowed cards) can appear without the Calibrate selection changing, so
      // fill genuinely-new ids without disturbing any existing manual decision.
      candidateIds.forEach((id) => {
        if (!(id in storedMap)) storedMap[id] = activeIds.has(id);
      });
      return storedMap;
    }
    if (storedMap && state.liveActiveSeed[variant.id] === undefined) {
      // Pre-signature saved state: adopt what's already there rather than overwriting a real
      // person's bench work on first load after this shipped. The next genuine Calibrate
      // change rebuilds normally.
      candidateIds.forEach((id) => {
        if (!(id in storedMap)) storedMap[id] = activeIds.has(id);
      });
      state.liveActiveSeed[variant.id] = selectionSignature;
      return storedMap;
    }
    const rebuilt = Object.fromEntries(candidateIds.map((id) => [id, activeIds.has(id)]));
    state.liveActive[variant.id] = rebuilt;
    state.liveActiveSeed[variant.id] = selectionSignature;
    return rebuilt;
  }

  function configuredDeckCards(variant) {
    const plan = buyCatalog.plans[variant.id];
    if (!plan) return [];
    const current = ensureBuyState(variant.id);
    const model = Lineup.buildModel(plan, liveTransferItems(variant.id));
    const selected = Object.fromEntries(Lineup.ARRAY_KEYS.map((key) => [key, new Set((current[key] || []).map(String))]));
    const candidates = model.entries.filter((entry) => !entry.item.isFlexibleSlot && (entry.kind === "transfer" || selected[entry.arrayKey]?.has(entry.id)));
    const activeIds = new Set(Lineup.selectedEntries(plan, current).map((entry) => entry.id));
    // Signature is computed from the Calibrate selection ONLY, so toggling a card here never
    // looks like an upstream change and never triggers a rebuild of the user's own choices.
    const liveActive = ensureLiveActiveMap(variant, activeIds, candidates.map((entry) => entry.id), selectionIdsSignature(current));
    const levelByKind = {
      shell: ["shell", "Starting Shell"],
      tuned: ["tuned", "Tuned"],
      upgrade: ["enhance", "Enhance"],
      enhance: ["enhance", "Enhance"],
      max: ["maxxed", "Maxxed"],
      tuned2: ["tuned", "Tuned"],
      enhance2: ["maxxed", "Maxxed"],
      max2: ["maxxed", "Maxxed"],
      funTuned: ["funTuned", "Fun Tuned"],
      funMax: ["funMax", "Fun Max"],
      altTuned: ["altTuned", "Alt Tuned"],
      altMax: ["altMax", "Alt Max"],
      transfer: ["transfer", "Temporary loan"]
    };
    return candidates.map((entry) => {
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
        lineupActive: entry.kind === "transfer" ? true : Boolean(liveActive[entry.id]),
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
    if (filters.alt === "alt" && !card.tags?.includes("alt")) return false;
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
    if (mode === "status") {
      if (!card.lineupActive) return {label: "Bench options", order: 2};
      return {label: card.bought ? "Bought" : "To Buy", order: card.bought ? 1 : 0};
    }
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
    if (mode === "level") return {label: card.liveLevelLabel || "Other", order: ["shell", "tuned", "enhance", "maxxed", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"].indexOf(card.liveLevel)};
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

  // One toolbar for the page. Search is narrowed to leave room for the controls
  // that used to sit on a second row underneath it, and the All/To Buy/Bought
  // chips are gone entirely -- Decks shows bought cards, which is the question the
  // page exists to answer. Simulate stays on each deck's own header, because it
  // needs one deck to point at and a page-level button would have none.
  function dexToolbarMarkup(filters, {searchLabel = "Search every deck…", scope = "dex"} = {}) {
    const hasAltData = Object.values(buyCatalog?.plans || {}).some((plan) => plan?.altTuned?.length);
    const extraCount = ["lineup", "source", "category", "cardType", "color", "price", "rarity", "location", ...(hasAltData ? ["alt"] : [])].filter((field) => filters[field] !== "all").length + (filters.sort !== "default" ? 1 : 0);
    const subgroupOptions = LIVE_GROUP_OPTIONS.filter(([value]) => value === "none" || value !== filters.groupBy);
    const stages = Array.from(new Set(selectedVariants().map((variant) => String(state.rankStages[variant.deckId] || 2))));
    return `<div class="live-toolbar dex-toolbar" data-dex-toolbar="${esc(scope)}">
      <div class="live-toolbar-head">
        <input class="search-input" type="search" value="${esc(filters.query)}" placeholder="${esc(searchLabel)}" data-ui-focus="dex-search-${esc(scope)}" aria-label="${esc(searchLabel)}">
        <div class="live-group-controls">
          ${liveFilterSelect("groupBy", "Group by", LIVE_GROUP_OPTIONS, filters.groupBy, "live-group-select")}
          ${liveFilterSelect("subgroupBy", "Then by", subgroupOptions, filters.subgroupBy, "live-group-select")}
          ${liveFilterSelect("profileStage", "Compare rating", [["1","Base"],["2","Tuned"],["3","Maxed"]], stages.length === 1 ? stages[0] : "2", "live-profile-select")}
          <details class="more-filters live-more-filters" data-ui-key="dexfilters-${esc(scope)}"><summary>Filters${extraCount ? ` <b>${extraCount}</b>` : ""}</summary><div class="filter-select-grid live-filter-grid">
            ${liveFilterSelect("lineup", "Lineup", [["all","Active + bench"],["active","Active 100"],["bench","Bench options"]], filters.lineup)}
            ${liveFilterSelect("source", "Source", [["all","All cards"],["shell","Starting shell"],["singles","Added singles"]], filters.source)}
            ${liveFilterSelect("category", "Level", LEVEL_FILTER_OPTIONS, filters.category)}
            ${hasAltData ? liveFilterSelect("alt", "Alt", ALT_FILTER_OPTIONS, filters.alt) : ""}
            ${liveFilterSelect("cardType", "Card type", [["all","All types"], ...LIVE_TYPE_ORDER.map((type) => [type,type])], filters.cardType)}
            ${liveFilterSelect("color", "Color", [["all","All colors"],["white","White"],["blue","Blue"],["black","Black"],["red","Red"],["green","Green"],["multicolor","Multicolor"],["colorless","Colorless"]], filters.color)}
            ${liveFilterSelect("price", "Price", [["all","All prices"],["bin","Bin · $0–$1"],["sleeves","Sleeves · $1–$5"],["binder","Binder · $5–$15"],["case","Case · $15+"],["unpriced","Unpriced"]], filters.price)}
            ${liveFilterSelect("rarity", "Rarity", [["all","All rarities"],["common","Common"],["uncommon","Uncommon"],["rare","Rare"],["mythic","Mythic"],["unknown","Unknown"]], filters.rarity)}
            ${liveFilterSelect("location", "Location", [["all","All locations"],["bin","Bin"],["sleeves","Sleeves"],["binder","Binder"],["case","Case"]], filters.location)}
            ${liveFilterSelect("sort", "Sort", [["default","Deck order"],["az","Name: A → Z"],["za","Name: Z → A"],["lowHigh","Price: Low → High"],["highLow","Price: High → Low"]], filters.sort)}
          </div></details>
        </div>
      </div>
    </div>`;
  }

  // Wires the one toolbar. onChange re-renders whichever page is showing it.
  function wireDexToolbar(root, filters, onChange) {
    const search = $(".dex-toolbar .search-input", root);
    search?.addEventListener("input", (event) => {
      filters.query = event.target.value;
      saveState();
      onChange();
    });
    $$(".dex-toolbar [data-live-filter-select]", root).forEach((select) => select.addEventListener("change", () => {
      const field = select.dataset.liveFilterSelect;
      if (field === "profileStage") {
        // One rating stage for the page: every selected deck moves together.
        selectedVariants().forEach((variant) => { state.rankStages[variant.deckId] = Number(select.value); });
      } else {
        filters[field] = select.value;
        if (field === "groupBy" && filters.subgroupBy === filters.groupBy) filters.subgroupBy = "none";
        if (field === "subgroupBy" && filters.subgroupBy === filters.groupBy) filters.subgroupBy = "none";
      }
      saveState();
      onChange();
    }));
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
    // Readiness-to-play is about the active 100 specifically: is what's toggled on right now
    // physically in hand.
    const shellMissing = active.filter((card) => card.fromShell && !card.bought && !card.loanedTo);
    const singlesMissing = active.filter((card) => !card.fromShell && !card.bought && !card.loanedTo);
    const preconMissing = !isSinglesBuiltShell(plan) && shellMissing.length > 0 && !state.found[itemKey(plan.precon)];
    const missingCards = [...shellMissing, ...singlesMissing].reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const pricedSingles = [...singlesMissing, ...(isSinglesBuiltShell(plan) ? shellMissing : [])];
    const floorTotal = pricedSingles.reduce((sum, card) => sum + (Number(card.price) || 0) * Number(card.quantity || 1), 0) + (preconMissing ? Number(plan.precon?.price || 0) : 0);
    const ceilingTotal = pricedSingles.reduce((sum, card) => sum + (Number(card.ceiling || card.price) || 0) * Number(card.quantity || 1), 0) + (preconMissing ? Number(plan.precon?.ceiling || plan.precon?.price || 0) : 0);
    const borrowedCards = borrowedOut.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const legal = total === 100 && compliance.tier3.length === 0;
    const ready = legal && missingCards === 0 && borrowedCards === 0;
    // "To Buy" tracks the whole Calibrate selection, active or benched — Compare -> Calibrate
    // -> Shop -> Decks is a one-way pipeline, and Calibrate can hold more than 100
    // picks on purpose, so purchase progress on a pick shouldn't hide just because it isn't
    // part of the active 100 right now.
    const planSinglesToBuy = cards.filter((card) => !card.fromShell && !card.bought && !card.loanedTo);
    const planShellToBuy = cards.filter((card) => card.fromShell && !card.bought && !card.loanedTo);
    const planPreconMissing = !isSinglesBuiltShell(plan) && planShellToBuy.length > 0 && !state.found[itemKey(plan.precon)];
    const purchaseItems = planSinglesToBuy.reduce((sum, card) => sum + Number(card.quantity || 1), 0)
      + (isSinglesBuiltShell(plan) ? planShellToBuy.reduce((sum, card) => sum + Number(card.quantity || 1), 0) : planPreconMissing ? 1 : 0);
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

  const ROLE_FLOORS = {ramp: 8, draw: 8, interaction: 8, protect: 3};
  const ROLE_LABELS = {ramp: "Ramp", draw: "Draw", interaction: "Interaction", protect: "Protection"};
  const PLAN_CARD_ARRAYS = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax", "manual"];

  // Mirrors tests/lineup-compliance.mjs's roleFlags heuristic (same regex patterns, same four
  // roles) against a live card's own hydrated text instead of the offline audit file -- this
  // is a "does the active 100 still look like a functioning deck" advisory, not a rules check,
  // so a heuristic miss here costs nothing; it never blocks anything.
  function liveRoleFlags(card) {
    const text = [card.name, card.typeLine, card.oracleText, ...(card.keywords || [])].join(" ").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
    return {
      ramp: /\badd\b[^.]{0,35}(?:mana|\{[wubrgc]\})|search your library for [^.]{0,45}(?:basic )?land|put (?:a|that|the) land card[^.]*onto the battlefield|treasure token|spells? you cast cost .* less/.test(text),
      draw: /draw (?:a|one|two|three|x|that many|cards|a card)|put (?:one|that|those|the) cards?[^.]*into your hand|investigate|clue token/.test(text),
      interaction: /destroy (?:target|all|each)|exile (?:target|all)|counter target|return target [^.]*owner'?s hand|deals? [^.]* damage to (?:target|any target|each creature|each opponent)|target creature gets [+-]|creatures? [^.]*get[s]? -|(?:each opponent|each player) sacrifices|\bfight\b|tap target|target permanent[^.]*shuffle|goad target|can'?t block/.test(text),
      protect: /hexproof|indestructible|protection from|regenerate|phase out|prevent all damage|can'?t be countered|counter target spell that targets|return [^.]* you control to (?:its|their) owner'?s hand/.test(text)
    };
  }

  function allPlanCardNames(plan) {
    const names = new Set();
    for (const key of PLAN_CARD_ARRAYS) for (const item of plan[key] || []) if (item?.name) names.add(item.name);
    if (plan.precon?.name) names.add(plan.precon.name);
    return names;
  }

  // Advisory-only ("did my mix-and-match break the deck?"), computed fresh from whatever is
  // actually active right now -- never a gate, never blocks anything, just a heads-up.
  function livePerformanceCheck(plan, cards) {
    const activeCards = cards.filter((card) => card.lineupActive);
    const activeIds = new Set(activeCards.map((card) => String(card.id)));
    const activeNames = new Set(activeCards.map((card) => card.name));
    const match = nearestPresetMatchForIds(plan, activeIds);
    const model = Lineup.buildModel(plan);
    const idName = (id) => model.byId.get(id)?.item?.name || id;
    const extraNames = [...activeIds].filter((id) => !match.presetIds.has(id)).map(idName);
    const missingNames = [...match.presetIds].filter((id) => !activeIds.has(id)).map(idName);

    const roleCounts = {ramp: 0, draw: 0, interaction: 0, protect: 0};
    for (const card of activeCards) {
      const flags = liveRoleFlags(card);
      for (const role of Object.keys(roleCounts)) if (flags[role]) roleCounts[role] += Number(card.quantity || 1);
    }
    const roleGaps = Object.entries(ROLE_FLOORS).filter(([role, floor]) => roleCounts[role] < floor);

    const allNames = allPlanCardNames(plan);
    const synergyGaps = [];
    for (const card of activeCards) {
      const text = usefulCardCopy(card.whyPrimary, card.purpose, card.why);
      if (!text) continue;
      // Excludes this card's own replacement lineage: a swap card's why-text routinely opens
      // with "Replaces X..." (and, for a later rung, may reference an even earlier ancestor
      // in the same slot's chain) to document a substitution already shown on its own Buy
      // Picks row -- that is the intended, expected relationship, not a surprise gap. Only a
      // mention of some OTHER card, from a different slot entirely, is worth flagging here.
      const ancestorNames = new Set();
      let walk = model.byId.get(model.byId.get(card.id)?.predecessorId);
      while (walk) { ancestorNames.add(walk.item.name); walk = model.byId.get(walk.predecessorId); }
      const missingRef = [...allNames].find((name) => name !== card.name && !ancestorNames.has(name) && name.length >= 5 && text.includes(name) && !activeNames.has(name));
      if (missingRef) synergyGaps.push({card: card.name, missing: missingRef});
    }

    return {matchPct: Math.round(match.similarity * 100), presetLabel: match.preset.label, presetKey: match.preset.key, extraNames, missingNames, roleCounts, roleGaps, synergyGaps};
  }

  function livePerformanceCheckMarkup(variant, plan, cards) {
    const check = livePerformanceCheck(plan, cards);
    const noteCount = check.roleGaps.length + check.synergyGaps.length;
    const deviationBits = [];
    if (check.extraNames.length) deviationBits.push(`+${check.extraNames.length}`);
    if (check.missingNames.length) deviationBits.push(`−${check.missingNames.length}`);
    const listItems = (names, verb) => names.slice(0, 5).map((name) => `<li>${verb} <b>${esc(name)}</b></li>`).join("") + (names.length > 5 ? `<li>+ ${names.length - 5} more</li>` : "");
    // No per-card impact data exists anywhere in this app -- only per-variant curated ratings
    // and per-build simulation results. Rather than invent a number for an individual swap,
    // say plainly what the tested builds measured and how far the current 100 has drifted
    // from the nearest one. Mix freely; just don't read a hand-mixed list as a proven one.
    const exactMatch = check.matchPct === 100 && !check.extraNames.length && !check.missingNames.length;
    const sim = simulationSummary?.builds?.[variant.id]?.[PRESET_BUILD_NAME[check.presetKey]];
    const provenLine = exactMatch
      ? `This active 100 <b>is</b> the tested ${esc(check.presetLabel)} build.`
      : `Proven results come from the tested configurations. This lineup is ${check.matchPct}% of the way to <b>${esc(check.presetLabel)}</b>${deviationBits.length ? ` (${deviationBits.join(" / ")})` : ""}, so its measured numbers no longer describe it exactly.`;
    const body = `
      <p class="performance-check-proven">${provenLine}</p>
      ${sim?.games ? `<p class="performance-check-note">${esc(check.presetLabel)} measured ${sim.score != null ? `${sim.score} pts · ` : ""}${sim.winPct != null ? `${(sim.winPct * 100).toFixed(1)}% win · ` : ""}${esc(sim.verdict || "unverified")} on the ${esc(sim.engine || "n/a")} engine.</p>` : ""}
      <p class="performance-check-note">Nearest configuration: <b>${esc(check.presetLabel)}</b> (${check.matchPct}% match)${deviationBits.length ? ` · ${deviationBits.join(" / ")} vs that build` : ""}. This is a heads-up, not a rule -- it never blocks anything.</p>
      ${check.extraNames.length || check.missingNames.length ? `<ul class="performance-check-deviations">${listItems(check.extraNames, "Added")}${listItems(check.missingNames, "Missing")}</ul>` : ""}
      ${check.roleGaps.length ? `<p class="performance-check-note">${icon("!")}<span>Below the usual floor on ${check.roleGaps.map(([role, floor]) => `${esc(ROLE_LABELS[role])} (${check.roleCounts[role]}/${floor})`).join(", ")}.</span></p>` : ""}
      ${check.synergyGaps.length ? `<ul class="performance-check-deviations">${check.synergyGaps.slice(0, 5).map((gap) => `<li>${icon("!")}<b>${esc(gap.card)}</b> assumes <b>${esc(gap.missing)}</b>, which isn't active</li>`).join("")}</ul>` : ""}
      ${!noteCount ? `<p class="performance-check-note">No deviations from the deck's usual shape or role floors.</p>` : ""}
    `;
    return disclosureMarkup(`performance-${variant.id}`, "Performance check · advisory", noteCount, body, "is-advisory");
  }

  function liveDeckSummaryMarkup(variant, plan, cards, compliance, readiness, profileIndex) {
    const total = readiness.total;
    const boughtCount = Math.max(0, total - readiness.missingCards - readiness.borrowedCards);
    const toBuy = readiness.purchaseItems;
    const bracket = variant.brackets?.[profileIndex] || {};
    const strategy = variant.summaries?.[profileIndex]?.[0] || variant.stageNotes?.[profileIndex] || "Final deck configuration";
    const typeChips = LIVE_TYPE_ORDER.filter((type) => type !== "Commander" && compliance.types[type]).map((type) => `<i><b>${compliance.types[type]}</b>${esc(type)}</i>`).join("");
    const playstyle = variant.scores?.playstyle?.[profileIndex] || [];
    const engine = variant.scores?.engine?.[profileIndex] || [];
    const growth = variant.scores?.growth || [];
    // Tier 2's rules are a strict superset of Tier 3's (same base checks, plus Tier 2 bans
    // any Game Changer/combo where Tier 3 only bans over-3 GCs/early combos), so clearing
    // Tier 2 always clears Tier 3 too. Report the tighter tier the deck actually qualifies
    // for rather than a flat Tier 3 pass/fail.
    const tier2Pass = compliance.tier2.length === 0;
    const tier3Pass = compliance.tier3.length === 0;
    const gcTierClass = tier2Pass || tier3Pass ? "passes" : "has-issues";
    const gcTierLabel = tier2Pass ? "Tier 2 ✓" : tier3Pass ? "Tier 3 ✓" : "Review";
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
        <i class="is-cost" data-live-total="${esc(variant.id)}" title="Money you have actually recorded paying for cards you own in this deck. Calibrate shows market prices for everything selected instead, so the two figures are answering different questions."><b>${money(totalCost) === "Price varies" ? "$0.00" : money(totalCost)}</b><small>Paid · ${priced.priced}/${priced.bought} priced</small></i>
        <i title="${esc(bracket.description || "")}"><b>${esc(bracket.label || "—")}</b><small>Tier</small></i>
        <i><b>${boughtCount}/100</b><small>bought</small></i>
        <i><b>${total}/100</b><small>active</small></i>
        <i class="${toBuy ? "is-open" : ""}" title="${toBuy ? `Market estimate to finish this deck: ${money(readiness.floorTotal)} to ${money(Math.max(readiness.floorTotal, readiness.ceilingTotal))}` : "Every card this deck needs is already owned"}"><b>${toBuy}</b><small>to buy${toBuy && readiness.floorTotal > 0 ? ` · ${money(readiness.floorTotal)}` : ""}</small></i>
        <i class="${gcTierClass}"><b>${compliance.selectedGameChangers.length}/3 GC</b><small>${gcTierLabel}</small></i>
      </span>
      <span class="live-strategy"><b>Strategy</b><i>${esc(strategy)}</i></span>
      <span class="live-deck-disclosures">
        ${disclosureMarkup(`composition-${variant.id}`, "Deck Composition", total, compositionBody)}
        ${disclosureMarkup(`mechanics-${variant.id}`, "Core Mechanics", (variant.mechanics || []).length, mechanicsBody)}
        ${livePerformanceCheckMarkup(variant, plan, cards)}
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

  // Which priced rows the reader has explicitly reopened to edit. A committed price collapses
  // to a plain value so a recorded row reads as settled next to one still awaiting a number;
  // this set is what lets the pencil put a single row back into an input without disturbing
  // any other. View state, not saved state -- same reasoning as the ladder tab selection.
  const editingPrices = new Set();

  // Owned cards get a "what did you actually pay" field; sealed precon contents get a label;
  // everything still on the shopping list keeps the estimated floor-to-ceiling range.
  function livePriceMarkup(card, price, ceiling) {
    if (card.fromPreconBox && !card.isCommander) return `<small class="live-price-precon">Precon Pack</small>`;
    if (!card.bought) return `<small class="live-price-range">Floor ${price ? money(price) : "unpriced"} · Ceiling ${ceiling ? money(ceiling) : "not listed"}</small>`;
    const key = itemKey(card);
    const committed = committedPrice(card);
    return `<span class="live-price-entry${committed === null ? "" : " is-locked"}" data-paid-row="${esc(key)}">${livePriceInnerMarkup(card, key, committed)}</span>`;
  }

  function livePriceInnerMarkup(card, key, committed) {
    if (committed !== null && !editingPrices.has(key)) {
      return `<span class="live-price-value">${money(committed)}</span>
        <button type="button" class="live-price-commit is-edit" data-paid-edit="${esc(key)}" aria-label="Edit the price paid for ${esc(card.name)}">✎</button>`;
    }
    return `<span class="live-price-field"><b aria-hidden="true">$</b><input type="text" inputmode="decimal" autocomplete="off" value="${committed === null ? "" : esc(committed.toFixed(2))}" placeholder="0.00" data-paid-key="${esc(key)}" data-ui-focus="paid-${esc(key)}" aria-label="Price paid for ${esc(card.name)}"></span>
      <button type="button" class="live-price-commit" data-paid-commit="${esc(key)}" aria-label="Lock in the price paid for ${esc(card.name)}">✓</button>`;
  }

  function makeLiveCardRow(card, variant) {
    const bounds = cardPriceBounds(card, cardMetadata[itemKey(card)] || {});
    const price = Number(bounds.price) || null;
    const ceiling = Number(bounds.ceiling) || null;
    const location = shoppingLocation(price);
    const row = document.createElement("article");
    row.className = `live-card-row${card.bought ? " is-bought" : " is-needed"}${card.lineupActive ? " is-lineup-active" : " is-lineup-bench"}`;
    const badges = [
      `<em class="live-card-badge is-level-${esc(card.liveLevel)}">${esc(card.liveLevelLabel)}</em>`,
      card.tags?.includes("alt") ? `<em class="live-card-badge is-alt">Alt</em>` : "",
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
    activeToggle?.addEventListener("change", () => setLineupActive(card, variant, activeToggle.checked));
    $(".live-card-main", row).addEventListener("click", () => openBuyItemDetail(card, variant, card.fromShell ? "starting shell" : card.liveLevelLabel || "selected card"));
    return row;
  }

  // Ticking a card into or out of a deck's active hundred. Shared by the Decks
  // card rows and the Cards table so the two views cannot drift: one writer, one
  // piece of state, and every view that shows it re-renders.
  function setLineupActive(card, variant, checked) {
    state.liveActive ||= {};
    state.liveActive[variant.id] ||= {};
    state.liveActive[variant.id][card.id] = checked;
    if (checked) {
      if (card.loanRecord) removePriorPhysicalTransfer("deck", variant.id, card.id, itemKey(card));
      delete transfersForVariant(variant.id)[card.lineupSlotId];
      if (state.liveSalvage?.[itemKey(card)]?.sourceVariantId === variant.id) {
        removePriorPhysicalTransfer("salvage", null, null, itemKey(card));
        delete state.liveSalvage[itemKey(card)];
      }
    }
    saveState(`${card.name} ${checked ? "added to" : "removed from"} ${variant.name}'s active 100`);
    renderLiveDecks();
    if ($("#view-cards")?.classList.contains("is-active")) renderCards();
  }

  function liveGroupStats(cards) {
    const total = cards.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const active = cards.filter((card) => card.lineupActive).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const target = cards.filter((card) => card.lineupActive && !card.bought).reduce((sum, card) => sum + (Number(card.price) || 0) * Number(card.quantity || 1), 0);
    return `${total} choice${total === 1 ? "" : "s"} · ${active} active${target ? ` · ${money(target)} target` : ""}`;
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
    const summaryNode = $(".live-results-summary", details);
    if (summaryNode) summaryNode.innerHTML = `<span><strong>${quantity}</strong> choices shown · ${activeShown}/${activeTotal} active cards</span><span>${activeNeeded} active to buy · ${visible.filter((card) => !card.lineupActive).length} bench options</span>`;
    results.replaceChildren();
    if (!visible.length) {
      results.innerHTML = `<div class="empty-state live-filter-empty"><h3>No cards match</h3><p>Clear or change this deck’s filters.</p></div>`;
      return;
    }
    if (filters.groupBy === "none") appendLiveRows(results, visible, variant);
    else appendLiveGroups(results, visible, filters.groupBy, filters.subgroupBy, variant);
  }

  // ---------------------------------------------------------------------------
  // Game Log -- what actually happened at a real table, entered between games.
  // Everything here is one-tap or one-number: the whole point is that a game can
  // be recorded in well under a minute while the next one is being shuffled.
  // Entries live in this browser until exported; the export is committed to the
  // repo, where an action compiles it into the running history.
  // ---------------------------------------------------------------------------
  const LOG_SCHEMA = 1;

  function loggableDecks() {
    const picked = selectedVariants().map((variant) => ({id: variant.id, label: `${variant.name}`}));
    if (picked.length) return picked;
    return (bakedCatalog?.variants || []).map((variant) => ({id: variant.id, label: variant.name}));
  }

  function renderGameLog() {
    withUiState("#view-log", renderGameLogView);
  }

  function renderGameLogView() {
    const root = $("#view-log");
    const log = state.gameLog || [];
    const decks = loggableDecks();
    const today = new Date().toISOString().slice(0, 10);
    const draft = gameLogDraft;
    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="log-title">Game Log</h2>
          <p>Record a game the moment it ends. Everything is one tap or one number, and entries stay on this device until you export them.</p>
        </div>
        <div class="selection-meter"><strong>${log.length}</strong><span>games logged</span></div>
      </div>
      <section class="log-entry-card">
        <div class="log-row">
          <label class="log-field log-field-wide"><span>Deck played</span>
            <select data-log="variantId">${decks.map((deck) => `<option value="${esc(deck.id)}" ${draft.variantId === deck.id ? "selected" : ""}>${esc(deck.label)}</option>`).join("")}</select>
          </label>
          <label class="log-field"><span>Date</span><input type="date" value="${esc(draft.playedOn || today)}" data-log="playedOn"></label>
        </div>
        <div class="log-row">
          <span class="log-field"><span>Result</span>
            <span class="log-chips">${[["win", "Won"], ["loss", "Lost"], ["draw", "Draw"]].map(([value, label]) => `<button type="button" class="filter-chip${draft.result === value ? " is-active" : ""}" data-log-result="${value}">${label}</button>`).join("")}</span>
          </span>
          <span class="log-field"><span>Players</span>
            <span class="log-chips">${[3, 4, 5, 6].map((n) => `<button type="button" class="filter-chip${Number(draft.players) === n ? " is-active" : ""}" data-log-players="${n}">${n}</button>`).join("")}</span>
          </span>
        </div>
        <div class="log-row">
          <label class="log-field"><span>Turns</span><input type="number" min="1" max="40" inputmode="numeric" value="${esc(draft.turns ?? "")}" placeholder="—" data-log="turns"></label>
          <label class="log-field"><span>You knocked out</span><input type="number" min="0" max="5" inputmode="numeric" value="${esc(draft.knockouts ?? "")}" placeholder="0" data-log="knockouts"></label>
          <label class="log-field"><span>Knocked out on turn</span><input type="number" min="0" max="40" inputmode="numeric" value="${esc(draft.eliminatedTurn ?? "")}" placeholder="survived" data-log="eliminatedTurn"></label>
        </div>
        <div class="log-row">
          <span class="log-field log-field-wide"><span>How was it for the table?</span>
            <span class="log-chips">${[[1, "Rough"], [2, "Meh"], [3, "Fine"], [4, "Good"], [5, "Great"]].map(([value, label]) => `<button type="button" class="filter-chip${Number(draft.podFun) === value ? " is-active" : ""}" data-log-podfun="${value}">${label}</button>`).join("")}</span>
          </span>
          <span class="log-field log-field-wide"><span>How was it for you?</span>
            <span class="log-chips">${[[1, "Rough"], [2, "Meh"], [3, "Fine"], [4, "Good"], [5, "Great"]].map(([value, label]) => `<button type="button" class="filter-chip${Number(draft.myFun) === value ? " is-active" : ""}" data-log-myfun="${value}">${label}</button>`).join("")}</span>
          </span>
        </div>
        <label class="log-field log-field-wide"><span>Note <small>optional</small></span><input type="text" maxlength="180" value="${esc(draft.note || "")}" placeholder="What decided it?" data-log="note"></label>
        <div class="log-actions">
          <button class="primary-button" type="button" data-log-save${decks.length ? "" : " disabled"}>Save game</button>
          <button class="text-button" type="button" data-log-clear>Clear</button>
        </div>
      </section>
      <div class="log-list-head">
        <h3>Logged games</h3>
        <div class="action-row">
          <button class="secondary-button" type="button" id="log-export"${log.length ? "" : " disabled"}>Export for the repo</button>
        </div>
      </div>
      <div class="log-list">${log.length
        ? [...log].reverse().map((entry) => gameLogRow(entry)).join("")
        : `<div class="empty-state"><h3>No games logged yet</h3><p>Record one after your next game — it takes about fifteen seconds.</p></div>`}</div>`;

    $$("[data-log]", root).forEach((field) => field.addEventListener("change", () => {
      gameLogDraft[field.dataset.log] = field.value;
    }));
    const chip = (attr, key, numeric) => $$(`[data-log-${attr}]`, root).forEach((button) => button.addEventListener("click", () => {
      const raw = button.dataset[`log${attr.charAt(0).toUpperCase()}${attr.slice(1)}`];
      gameLogDraft[key] = numeric ? Number(raw) : raw;
      renderGameLog();
    }));
    chip("result", "result", false);
    chip("players", "players", true);
    chip("podfun", "podFun", true);
    chip("myfun", "myFun", true);

    $("[data-log-save]", root)?.addEventListener("click", () => saveGameLogEntry());
    $("[data-log-clear]", root)?.addEventListener("click", () => {
      gameLogDraft = blankGameLogDraft();
      renderGameLog();
    });
    $("#log-export", root)?.addEventListener("click", () => exportGameLog());
    $$("[data-log-delete]", root).forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.logDelete;
      if (!window.confirm("Delete this logged game?")) return;
      state.gameLog = (state.gameLog || []).filter((entry) => entry.id !== id);
      saveState("Game removed from the log");
      renderGameLog();
    }));
  }

  function gameLogRow(entry) {
    const variant = variantById(entry.variantId);
    const resultClass = entry.result === "win" ? "is-win" : entry.result === "loss" ? "is-loss" : "";
    return `<div class="log-row-card ${resultClass}">
      <div class="log-row-main">
        <strong>${esc(variant?.name || entry.variantId)}</strong>
        <span>${esc(entry.playedOn)} · ${esc(entry.players)}-player · ${entry.turns ? `${esc(entry.turns)} turns` : "turns not noted"}</span>
        ${entry.note ? `<small>${esc(entry.note)}</small>` : ""}
      </div>
      <div class="log-row-stats">
        <span class="log-result">${entry.result === "win" ? "Won" : entry.result === "loss" ? "Lost" : "Draw"}</span>
        <small>${esc(entry.knockouts ?? 0)} KO${Number(entry.knockouts) === 1 ? "" : "s"} · pod ${esc(entry.podFun ?? "—")}/5 · you ${esc(entry.myFun ?? "—")}/5</small>
      </div>
      <button type="button" class="text-button" data-log-delete="${esc(entry.id)}" aria-label="Delete this logged game">×</button>
    </div>`;
  }

  function blankGameLogDraft() {
    return {variantId: "", playedOn: "", result: "", players: 4, turns: "", knockouts: "", eliminatedTurn: "", podFun: 0, myFun: 0, note: ""};
  }
  let gameLogDraft = blankGameLogDraft();

  function saveGameLogEntry() {
    const decks = loggableDecks();
    const variantId = gameLogDraft.variantId || decks[0]?.id;
    if (!variantId) return showToast("Pick a deck in Compare first.");
    if (!gameLogDraft.result) return showToast("Tap Won, Lost, or Draw first.");
    const num = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
    const entry = {
      id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      schema: LOG_SCHEMA,
      variantId,
      playedOn: gameLogDraft.playedOn || new Date().toISOString().slice(0, 10),
      result: gameLogDraft.result,
      players: Number(gameLogDraft.players) || 4,
      turns: num(gameLogDraft.turns),
      knockouts: num(gameLogDraft.knockouts) ?? 0,
      eliminatedTurn: num(gameLogDraft.eliminatedTurn),
      podFun: Number(gameLogDraft.podFun) || null,
      myFun: Number(gameLogDraft.myFun) || null,
      note: String(gameLogDraft.note || "").trim(),
      recordedAt: new Date().toISOString()
    };
    state.gameLog = [...(state.gameLog || []), entry];
    // Keep the deck and date -- a night is usually several games with the same
    // deck or at least the same table, so the next entry starts nearly filled in.
    gameLogDraft = {...blankGameLogDraft(), variantId, playedOn: entry.playedOn, players: entry.players};
    saveState("Game logged");
    renderGameLog();
    showToast(`Logged ${entry.result === "win" ? "a win" : entry.result === "loss" ? "a loss" : "a draw"}.`);
  }

  function exportGameLog() {
    const log = state.gameLog || [];
    if (!log.length) return showToast("Nothing logged yet.");
    const payload = {schema: LOG_SCHEMA, exportedAt: new Date().toISOString(), games: log};
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `game-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Exported ${log.length} game${log.length === 1 ? "" : "s"} — commit it to data/game-logs/ to add it to your history.`);
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
          <h2 id="live-title">Decks</h2>
          <div class="live-intro-actions">
            <div class="selection-meter"><strong>${variants.length}</strong><span>live decks</span></div>
            <button type="button" class="secondary-button live-export" id="live-export"${entries.length ? "" : " disabled"}>Export checklist</button>
          </div>
        </div>
        <p class="live-intro-copy">Set each active 100 with the lineup radios, check legality and physical readiness, and record what you actually paid. Cards still on the list keep floor-to-ceiling guidance.</p>
      </div>${dexToolbarMarkup(ensureLiveFilters())}<div class="live-decks"></div>`;
    $("#live-export", root)?.addEventListener("click", exportLiveDecks);
    wireDexToolbar(root, ensureLiveFilters(), renderLiveDecks);
    const host = $(".live-decks", root);
    if (!entries.length) {
      host.innerHTML = `<div class="empty-state"><h3>No live decks yet</h3><p>Select a deck in Compare and choose its final cards in Calibrate.</p><button class="primary-button" data-go="compare">Choose decks</button></div>`;
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
      // Closed unless you opened it. Six decks of a hundred cards each is not a
      // page anyone wants to land on already unrolled.
      details.open = Boolean(state.liveOpenDecks[variant.id]);
      const longestName = Math.max(...cards.map((card) => `${card.name}${card.quantity > 1 ? ` ×${card.quantity}` : ""}`.length), 30);
      details.style.setProperty("--live-name-ch", `${Math.min(46, Math.max(30, longestName + 2))}ch`);
      details.innerHTML = `${liveDeckSummaryMarkup(variant, plan, cards, compliance, readiness, profileIndex)}<div class="live-deck-body"><div class="live-deck-actions"><div class="live-results-summary" aria-live="polite"></div><button class="secondary-button live-simulate" type="button" data-live-simulate="${esc(variant.id)}">${icon("⟳")}<span>Simulate this deck</span></button></div><div class="live-results"></div></div>`;
      renderLiveResults(details, cards, filters, variant);
      $('[data-live-simulate]', details)?.addEventListener("click", () => openSimDialog(variant));
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
        chip.innerHTML = `<b>${total > 0 ? money(total) : "$0.00"}</b><small>Paid · ${priced.priced}/${priced.bought} priced</small>`;
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
        const card = cards.find((entry) => itemKey(entry) === key);
        cards.filter((entry) => itemKey(entry) === key).forEach((entry) => { entry.paidPrice = stored ?? null; });
        const row = input.closest(".live-price-entry");
        row?.classList.toggle("is-locked", stored !== undefined);
        editingPrices.delete(key);
        // A committed row collapses to its value; a cleared one stays an empty input to fill.
        if (row && card) row.innerHTML = livePriceInnerMarkup(card, key, stored === undefined ? null : Number(stored));
        saveState(stored === undefined ? "Purchase price cleared" : `Locked in ${money(stored)}`);
        refreshTotal();
      };
      details.addEventListener("click", (event) => {
        const edit = event.target.closest("[data-paid-edit]");
        if (edit) {
          event.preventDefault();
          event.stopPropagation();
          const key = edit.dataset.paidEdit;
          const card = cards.find((entry) => itemKey(entry) === key);
          const row = edit.closest(".live-price-entry");
          if (!card || !row) return;
          editingPrices.add(key);
          row.innerHTML = livePriceInnerMarkup(card, key, committedPrice(card));
          $("input[data-paid-key]", row)?.focus();
          return;
        }
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

  // Parses the CSV this app itself writes (exportLiveDecks). Handles the quoting rules
  // csvCell produces -- doubled quotes inside a quoted cell, and commas or newlines that only
  // appear inside quotes -- plus the UTF-8 BOM the export prepends for Excel's benefit.
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = String(text || "").replace(/^﻿/, "");
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (char !== '"') { cell += char; continue; }
        if (source[index + 1] === '"') { cell += '"'; index += 1; continue; }
        quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === ",") { row.push(cell); cell = ""; continue; }
      if (char === "\r") continue;
      if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
      cell += char;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((entry) => entry.some((value) => String(value).trim() !== ""));
  }

  // Restores what you own from a Decks checklist export, so losing this browser's storage
  // or moving to another machine doesn't lose the record of what has been bought.
  //
  // Strictly additive. The export writes "exactly what is on screen, with its current
  // filters", so a file can legitimately omit cards that are owned -- treating it as the whole
  // truth would silently un-buy them. Nothing is ever unmarked here.
  function importPurchaseHistory(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) return {error: "That file has no rows to read."};
    // Read by header name so an added export column can't shift the values being read.
    const header = rows[0].map((value) => String(value).trim().toLowerCase());
    const column = (name) => header.indexOf(name);
    const cardColumn = column("card");
    const checkedColumn = column("checked");
    if (cardColumn < 0 || checkedColumn < 0) {
      return {error: "That doesn't look like a Decks checklist — it needs at least the Card and Checked columns."};
    }
    const deckColumn = column("deck");
    const qtyColumn = column("qty");
    const paidColumn = column("paid");
    // Recognized names come from every card array a plan can hold -- including the legacy
    // baseCards list, which still supplies a few names that reach the export -- plus the
    // precon boxes and the standing owned-extras inventory. The gate exists to keep typos and
    // unrelated CSVs out of saved state, not to second-guess the app's own export.
    const known = new Set();
    for (const plan of Object.values(buyCatalog?.plans || {})) {
      for (const key of ["startingShell", "baseCards", ...PLAN_CARD_ARRAYS]) {
        for (const item of plan[key] || []) if (item?.name) known.add(itemKey(item));
      }
      if (plan.precon) known.add(itemKey(plan.precon));
    }
    for (const name of buyCatalog?.ownedExtras || []) known.add(itemKey({name}));
    // A card needed by two decks means owning two copies, but the same card can also appear
    // twice within one deck across categories (name-twins are expected), which would not.
    // Counting the largest quantity per deck and summing across decks gets both right.
    const perDeck = new Map();
    const paid = new Map();
    const unknown = new Set();
    for (const row of rows.slice(1)) {
      if (String(row[checkedColumn] || "").trim().toLowerCase() !== "x") continue;
      const name = String(row[cardColumn] || "").trim();
      if (!name) continue;
      const key = itemKey({name});
      // Double-faced cards export under their full "Front // Back" name, while some catalog
      // entries carry only the front face, so a name counts as recognized if either form is.
      // Storage always uses the key built from the exported name, which is the one the rest of
      // the app derives from that same card object.
      if (!known.has(key) && !known.has(itemKey({name: name.split(" // ")[0]}))) { unknown.add(name); continue; }
      const deck = deckColumn >= 0 ? String(row[deckColumn] || "").trim() : "";
      const quantity = Math.max(1, Number(qtyColumn >= 0 ? row[qtyColumn] : 1) || 1);
      if (!perDeck.has(key)) perDeck.set(key, new Map());
      const byDeck = perDeck.get(key);
      byDeck.set(deck, Math.max(byDeck.get(deck) || 0, quantity));
      // An empty Paid cell means no price was ever recorded, which is not the same as having
      // paid nothing -- Number("") is 0, so the emptiness has to be checked before parsing.
      const paidRaw = paidColumn >= 0 ? String(row[paidColumn] || "").trim() : "";
      const paidValue = paidRaw === "" ? NaN : Number(paidRaw);
      if (Number.isFinite(paidValue) && paidValue >= 0 && !paid.has(key)) paid.set(key, paidValue);
    }
    if (!perDeck.size) return {error: "No cards in that file were marked bought.", unknown: [...unknown]};
    state.found ||= {};
    state.boughtQuantities ||= {};
    state.purchasePrices ||= {};
    let marked = 0;
    let priced = 0;
    for (const [key, byDeck] of perDeck) {
      const total = [...byDeck.values()].reduce((sum, value) => sum + value, 0);
      if (!state.found[key]) marked += 1;
      state.found[key] = true;
      state.boughtQuantities[key] = Math.max(Number(state.boughtQuantities[key] || 0), total);
      if (paid.has(key) && state.purchasePrices[key] === undefined) {
        state.purchasePrices[key] = paid.get(key);
        priced += 1;
      }
    }
    // The checklist lists cards, so a sealed precon box has no row of its own and its "bought"
    // mark would otherwise be lost. When every named card from a precon's shell came back as
    // owned, the box it came in was evidently bought too -- restore that as well, so
    // precon-shell decks report their true source rather than 100 coincidental singles.
    let boxes = 0;
    for (const plan of Object.values(buyCatalog?.plans || {})) {
      if (isSinglesBuiltShell(plan) || !plan.precon) continue;
      const shellCards = (plan.startingShell || []).filter((card) => !card.isFlexibleSlot);
      if (!shellCards.length || !shellCards.every((card) => state.found[itemKey(card)])) continue;
      const preconKey = itemKey(plan.precon);
      if (state.found[preconKey]) continue;
      state.found[preconKey] = true;
      state.boughtQuantities[preconKey] = Math.max(1, Number(state.boughtQuantities[preconKey] || 0));
      boxes += 1;
    }
    saveState("Purchase history restored");
    return {marked, priced, boxes, matched: perDeck.size, unknown: [...unknown]};
  }

  function appendLiveSalvage(host) {
    const cards = allSalvageCards();
    const details = document.createElement("details");
    details.className = "live-deck salvage-live-deck";
    // Always rendered, even empty: an empty yard is exactly the moment you want
    // the box that fills it.
    details.open = cards.length ? Boolean(state.liveOpenDecks?.salvage) : true;
    details.innerHTML = `<summary class="live-deck-summary salvage-live-summary"><span class="live-deck-primary"><span class="deck-number">♲</span><span class="live-deck-title"><strong>Salvage</strong><small>${cards.length ? `${cards.length} owned cards · no current final-deck role` : "Nothing here yet · add cards you already own"}</small></span><span class="live-deck-chevron" aria-hidden="true">⌄</span></span></summary><div class="salvage-intake-wrap">${salvageIntakeMarkup()}</div><div class="live-card-list"></div>`;
    wireSalvageIntake(details);
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

  // ---------------------------------------------------------------------------
  // Cards -- the same inventory Decks shows, flattened.
  //
  // Decks answers "what is in this deck and what do I still owe on it", one deck
  // at a time, with the buying and the lineup radios attached. Cards answers a
  // different question -- "where is this card, across everything I own" -- and a
  // per-deck accordion is the wrong shape for it. Same cards, same statuses, one
  // sortable table, plus the Salvage pile so a card that belongs to no deck is
  // still findable.
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Salvage intake -- adding cards you already bought that no deck asked for.
  //
  // Until now a card could only reach the Salvage yard by being pushed out of a
  // deck. That misses the common case entirely: a booster, a bundle, a box of
  // singles off a vendor table. Paste the links (or just the names) and each one
  // is resolved against Scryfall for its real type line, mana cost, image and
  // price, then filed as owned and available to assign.
  //
  // Failures are reported line by line rather than silently dropped, because a
  // card you believe is in the yard and is not is worse than one you know failed.
  // ---------------------------------------------------------------------------

  function salvageIntakeMarkup() {
    return `<form class="salvage-intake" data-salvage-intake>
      <label for="salvage-intake-input"><b>Add cards you already own</b><small>One per line — a TCGplayer link (affiliate links work) or just the card name. They land in Salvage, ready to assign to any deck.</small></label>
      <textarea id="salvage-intake-input" rows="3" placeholder="https://www.tcgplayer.com/product/…&#10;Solemn Simulacrum"></textarea>
      <div class="salvage-intake-actions">
        <button type="submit" class="primary-button">Add to Salvage</button>
        <span class="salvage-intake-status" data-salvage-status aria-live="polite"></span>
      </div>
    </form>`;
  }

  function wireSalvageIntake(root) {
    const form = $("[data-salvage-intake]", root);
    if (!form) return;
    const status = $("[data-salvage-status]", form);
    const input = $("#salvage-intake-input", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const lines = String(input.value || "").split("\n").map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return showToast("Paste a link or a card name first.");
      const button = $("button[type=submit]", form);
      button.disabled = true;
      const client = Scryfall.createClient({});
      const added = [];
      const failed = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        status.textContent = `Looking up ${index + 1} of ${lines.length}…`;
        try {
          // A link goes through the TCGplayer resolver, which handles affiliate
          // wrappers and set-prefixed slugs; anything else is treated as a name.
          const resolved = /^https?:\/\//i.test(line)
            ? await client.resolveTcgplayerUrl(line)
            : {card: await client.named(line), error: "no card by that name"};
          if (!resolved.card) {
            failed.push(`${line} — ${resolved.error || "no card matched"}`);
            continue;
          }
          added.push(addCardToSalvage(resolved.card, line));
        } catch (error) {
          failed.push(`${line} — ${error.message || "lookup failed"}`);
        }
      }
      button.disabled = false;
      if (added.length) {
        saveState(`${added.length} card${added.length === 1 ? "" : "s"} added to Salvage`);
        input.value = failed.length ? failed.map((entry) => entry.split(" — ")[0]).join("\n") : "";
        showToast(`${added.length} card${added.length === 1 ? "" : "s"} added to Salvage${failed.length ? `; ${failed.length} could not be found` : ""}.`);
      }
      // Whatever failed stays in the box with its reason underneath, so the line
      // can be corrected and resubmitted instead of retyped from memory.
      status.innerHTML = failed.length
        ? `<b>${failed.length} not added:</b> ${failed.map((entry) => esc(entry)).join("; ")}`
        : added.length ? `Added ${added.map((card) => esc(card.name)).join(", ")}.` : "";
      if (added.length) {
        renderLiveDecks();
        if ($("#view-cards")?.classList.contains("is-active")) renderCards();
      }
    });
  }

  function addCardToSalvage(card, source) {
    const record = {
      name: card.name,
      manaCost: card.manaCost || "",
      typeLine: card.typeLine || "",
      oracleText: card.oracleText || "",
      keywords: card.keywords || [],
      colorIdentity: card.colorIdentity || [],
      commanderLegal: card.commanderLegal !== false,
      rarity: card.rarity || "",
      setName: card.setName || "",
      image: card.image || "",
      price: Number(card.price || 0),
      ceiling: Number(card.ceiling ?? card.price ?? 0),
      tcgplayerUrl: card.tcgplayerUrl || (/^https?:\/\//i.test(source) ? source : ""),
      gameChanger: Boolean(card.gameChanger),
      ownedExtra: true
    };
    state.liveSalvage ||= {};
    state.liveSalvage[itemKey(record)] = {
      card: record,
      reason: "Added by hand — a card you own that no deck has claimed yet.",
      sourceVariantId: null,
      sourceEntryId: null,
      addedByHand: true,
      movedAt: new Date().toISOString()
    };
    // Owning it is the whole point, so it counts as bought immediately.
    state.found[itemKey(record)] = true;
    state.boughtQuantities ||= {};
    state.boughtQuantities[itemKey(record)] = Math.max(1, Number(state.boughtQuantities[itemKey(record)] || 0));
    return record;
  }

  // Columns. `value` pulls the sortable/filterable value out of a row, `cell`
  // renders it. Everything the table can sort by, filter by or show comes from
  // this one table, so adding a column is one entry rather than four edits.
  const CARD_COLUMNS = [
    {key: "lineup", label: "In 100", sortable: true, menu: false, value: (row) => (row.lineupActive ? "Active" : "Bench")},
    {key: "name", label: "Card", sortable: true, menu: false, value: (row) => row.name},
    {key: "deck", label: "Deck", sortable: true, menu: true, value: (row) => row.deckName,
      sort: (a, b, direction) => ((a.deckId === "salvage" ? 1 : 0) - (b.deckId === "salvage" ? 1 : 0))
        || (Number(a.deckId) - Number(b.deckId)) * direction
        || LIVE_TYPE_ORDER.indexOf(a.type) - LIVE_TYPE_ORDER.indexOf(b.type)
        || a.name.localeCompare(b.name)},
    {key: "color", label: "Color", sortable: true, menu: true, value: (row) => row.colorLabel},
    {key: "type", label: "Type", sortable: true, menu: true, value: (row) => row.type},
    {key: "rarity", label: "Rarity", sortable: true, menu: true, value: (row) => row.rarity},
    {key: "set", label: "Set", sortable: true, menu: true, value: (row) => row.setName},
    {key: "role", label: "Role", sortable: true, menu: true, value: (row) => row.role},
    {key: "paid", label: "Paid", sortable: true, menu: false, value: (row) => row.paid},
    {key: "target", label: "Target", sortable: true, menu: false, value: (row) => row.target}
  ];
  const CARD_COLUMN_BY_KEY = new Map(CARD_COLUMNS.map((column) => [column.key, column]));

  const COLOR_NAMES = {W: "White", U: "Blue", B: "Black", R: "Red", G: "Green"};
  function colorLabelFor(card, metadata) {
    const identity = (card.colorIdentity || metadata.colorIdentity || []).map((value) => String(value).toUpperCase()).filter((value) => COLOR_NAMES[value]);
    if (!identity.length) return "Colorless";
    if (identity.length > 1) return "Multicolor";
    return COLOR_NAMES[identity[0]];
  }

  // One row per physical card across every live deck, then the Salvage pile.
  // Salvage rows carry deckId "salvage" so a filter can isolate them and the
  // deck sort keeps them together rather than scattering them through deck 1.
  function allCardRows() {
    const rows = [];
    const shape = (card, variant) => {
      const metadata = cardMetadata[itemKey(card)] || {};
      const bounds = cardPriceBounds(card, metadata);
      const assignment = variant ? null : allLiveTransfers().find((record) => record.sourceKind === "salvage" && record.sourceCardKey === itemKey(card));
      const assignedTo = assignment ? variantById(assignment.targetVariantId) : null;
      return {
        card,
        variant,
        key: itemKey(card),
        name: card.name,
        quantity: Math.max(1, Number(card.quantity || 1)),
        deckId: variant ? String(variant.deckId) : "salvage",
        deckLabel: variant ? `Deck ${variant.deckId}` : "Salvage",
        deckName: variant ? variant.name : assignment ? `Assigned to Deck ${assignedTo?.deckId || "?"}` : "Salvage yard",
        type: liveCardType(card),
        colorLabel: colorLabelFor(card, metadata),
        manaCost: card.manaCost || metadata.manaCost || "",
        cmc: manaValueOf(card.manaCost || metadata.manaCost || ""),
        rarity: metadata.rarity ? `${metadata.rarity[0].toUpperCase()}${metadata.rarity.slice(1)}` : "Unknown",
        setName: metadata.setName || "—",
        typeLine: card.typeLine || metadata.typeLine || "",
        image: card.image || metadata.image || cardImageCandidates(card)[0],
        lineupActive: variant ? Boolean(card.lineupActive) : Boolean(assignment),
        lineupLocked: !variant || card.isCommander || Boolean(card.transferRecord),
        role: variant
          ? card.isCommander ? "Commander" : card.lineupActive ? "Active 100" : card.inSalvage ? "Salvage" : "Bench"
          : assignment ? "Assigned" : "Salvage",
        status: variant ? liveCardStatusText(card) : assignment ? `Filling ${assignment.replacesName}` : "Owned · available to assign",
        bought: variant ? Boolean(card.bought) : true,
        paid: committedPrice(card),
        target: variant && card.fromPreconBox ? null : Number(bounds.price) || Number(card.price) || null,
        ceiling: variant && card.fromPreconBox ? null : Number(bounds.ceiling) || Number(card.ceiling) || null,
        url: card.tcgplayerUrl || metadata.tcgplayerUrl || `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`
      };
    };
    buildLiveEntries().forEach(({variant, cards}) => {
      ensureShopMetadata(cards);
      cards.forEach((card) => rows.push(shape(card, variant)));
    });
    const salvage = allSalvageCards();
    ensureShopMetadata(salvage);
    salvage.forEach((card) => rows.push(shape(card, null)));
    return rows;
  }

  function manaValueOf(manaCost) {
    let total = 0;
    for (const match of String(manaCost || "").matchAll(/\{([^}]+)\}/g)) {
      const symbol = match[1];
      const numeric = Number(symbol);
      if (Number.isFinite(numeric)) total += numeric;
      else if (!/^[XYZ]$/i.test(symbol)) total += 1;
    }
    return total;
  }

  function ensureCardTable() {
    state.cardTable = {sortKey: "deck", sortDir: "asc", columnFilters: {}, ...(state.cardTable || {})};
    return state.cardTable;
  }

  // Excel's rule: first click sorts one way, clicking the same header again
  // reverses it. Text goes A→Z then Z→A; numbers go low→high then high→low.
  // Shared by the Cards table and Shop's list mode, which differ only in which
  // columns they declare.
  function sortTableRows(rows, table, columnsByKey, fallbackKey) {
    const column = columnsByKey.get(table.sortKey) || columnsByKey.get(fallbackKey);
    const direction = table.sortDir === "desc" ? -1 : 1;
    const compare = (a, b) => {
      const left = column.value(a);
      const right = column.value(b);
      const bothNumeric = typeof left === "number" || typeof right === "number" || left === null || right === null;
      if (bothNumeric) {
        // A blank sorts last whichever way the column is pointing, because
        // "no price recorded" is not a low price.
        const leftValue = Number.isFinite(Number(left)) ? Number(left) : null;
        const rightValue = Number.isFinite(Number(right)) ? Number(right) : null;
        if (leftValue === null && rightValue === null) return a.name.localeCompare(b.name);
        if (leftValue === null) return 1;
        if (rightValue === null) return -1;
        return (leftValue - rightValue) * direction || a.name.localeCompare(b.name);
      }
      return String(left ?? "").localeCompare(String(right ?? "")) * direction || a.name.localeCompare(b.name);
    };
    // A column may declare its own ordering when a plain comparison would be
    // wrong -- Cards keeps Salvage at the bottom rather than sorting it
    // alphabetically into the middle of deck 1.
    if (column.sort) return rows.slice().sort((a, b) => column.sort(a, b, direction));
    return rows.slice().sort(compare);
  }

  function matchesColumnFilters(row, table, columnsByKey) {
    return Object.entries(table.columnFilters || {}).every(([key, allowed]) => {
      if (!Array.isArray(allowed) || !allowed.length) return true;
      const column = columnsByKey.get(key);
      return column ? allowed.includes(String(column.value(row))) : true;
    });
  }

  function matchesTableQuery(row, query, fields) {
    if (!query) return true;
    return fields.some((field) => String(row[field] || "").toLowerCase().includes(query));
  }

  function renderCards() {
    withUiState("#view-cards", renderCardsView);
  }

  function renderCardsView() {
    const root = $("#view-cards");
    const filters = ensureLiveFilters();
    const table = ensureCardTable();
    const query = String(filters.query || "").trim().toLowerCase();
    const owned = allCardRows().filter((row) => row.bought);
    const visible = sortTableRows(owned.filter((row) => matchesColumnFilters(row, table, CARD_COLUMN_BY_KEY) && matchesTableQuery(row, query, ["name", "typeLine", "deckName", "setName"])), table, CARD_COLUMN_BY_KEY, "deck");
    const activeColumnFilters = Object.values(table.columnFilters || {}).filter((values) => Array.isArray(values) && values.length).length;
    const paid = visible.filter((row) => row.paid !== null).reduce((sum, row) => sum + row.paid, 0);

    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="cards-title">Cards</h2>
          <p>Every card you own, across every deck and the Salvage yard, as one table. The same inventory Decks shows — just not filed under each deck.</p>
        </div>
        <div class="shop-intro-actions">
          <div class="selection-meter"><strong>${visible.length}</strong><span>cards</span></div>
          ${activeColumnFilters ? `<button type="button" class="secondary-button" data-cards-clear>Clear ${activeColumnFilters} column filter${activeColumnFilters === 1 ? "" : "s"}</button>` : ""}
          <button type="button" class="secondary-button" id="cards-export"${visible.length ? "" : " disabled"}>Export table</button>
        </div>
      </div>
      ${dexToolbarMarkup(filters, {searchLabel: "Search every card…", scope: "cards"})}
      ${mobileTableControlsMarkup(CARD_COLUMNS, table)}
      <p class="cards-total">${visible.length} of ${owned.length} owned cards${paid > 0 ? ` · ${money(paid)} recorded as paid` : ""}</p>
      ${visible.length ? `<div class="cards-table-wrap"><table class="cards-table">
        <thead><tr>${CARD_COLUMNS.map((column) => tableHeaderMarkup(column, table)).join("")}</tr></thead>
        <tbody>${visible.map(cardRowMarkup).join("")}</tbody>
      </table></div>`
      : `<div class="empty-state"><h3>${owned.length ? "No cards match" : "Nothing bought yet"}</h3><p>${owned.length ? "Clear a filter to see the rest of what you own." : "Mark cards Bought in Shop and they appear here."}</p></div>`}`;

    wireDexToolbar(root, filters, renderCards);
    wireCardTable(root, visible, table, owned);
    $("#cards-export", root)?.addEventListener("click", () => exportCardsTable(visible));
    $("[data-cards-clear]", root)?.addEventListener("click", () => {
      table.columnFilters = {};
      saveState();
      renderCards();
    });
  }

  // A phone has no headers to click, so sorting and column filtering get their
  // own row. Shared by both tables, same as everything else about them.
  function mobileTableControlsMarkup(columns, table) {
    const on = (key) => Array.isArray(table.columnFilters?.[key]) && table.columnFilters[key].length;
    return `<div class="cards-mobile-sort">
      <label><span>Sort</span><select data-card-mobile-sort>${columns.filter((column) => column.sortable).map((column) => `<option value="${esc(column.key)}"${table.sortKey === column.key ? " selected" : ""}>${esc(column.label)}</option>`).join("")}</select></label>
      <button type="button" data-card-mobile-dir aria-label="Reverse the sort order">${table.sortDir === "desc" ? "↓ Z→A" : "↑ A→Z"}</button>
      <label><span>Filter</span><select data-card-mobile-menu><option value="">Choose a column…</option>${columns.filter((column) => column.menu).map((column) => `<option value="${esc(column.key)}">${esc(column.label)}${on(column.key) ? " ●" : ""}</option>`).join("")}</select></label>
    </div>`;
  }

  function tableHeaderMarkup(column, table) {
    const sorted = table.sortKey === column.key;
    const arrow = sorted ? (table.sortDir === "desc" ? "↓" : "↑") : "";
    const filtered = Array.isArray(table.columnFilters?.[column.key]) && table.columnFilters[column.key].length;
    return `<th scope="col" class="${sorted ? "is-sorted " : ""}${filtered ? "is-filtered " : ""}col-${esc(column.key)}"${sorted ? ` aria-sort="${table.sortDir === "desc" ? "descending" : "ascending"}"` : ""}>
      <span class="cards-th">
        <button type="button" class="cards-th-sort" data-card-sort="${esc(column.key)}" title="Sort by ${esc(column.label)}">${esc(column.label)}<i aria-hidden="true">${arrow}</i></button>
        ${column.menu ? `<button type="button" class="cards-th-menu" data-card-menu="${esc(column.key)}" aria-haspopup="true" aria-expanded="false" title="Filter by ${esc(column.label)}" aria-label="Filter by ${esc(column.label)}">⋯</button>` : ""}
      </span>
    </th>`;
  }

  function cardRowMarkup(row) {
    const cash = (value) => (value === null || value === undefined ? "<i>—</i>" : `$${Number(value).toFixed(2)}`);
    // data-label carries the column name for the phone layout, where the table
    // stops being a grid and each row becomes a stacked card.
    return `<tr data-card-key="${esc(`${row.deckId}:${row.key}`)}" class="${row.lineupActive ? "is-active-100" : ""}${row.deckId === "salvage" ? " is-salvage" : ""}">
      <td class="col-lineup" data-label="In 100"><label class="live-lineup-radio" title="${row.lineupLocked ? "This card cannot be toggled here" : row.lineupActive ? `Remove ${esc(row.name)} from the active 100` : `Add ${esc(row.name)} to the active 100`}"><input type="checkbox" data-card-lineup="${esc(`${row.deckId}:${row.key}`)}" ${row.lineupActive ? "checked" : ""}${row.lineupLocked ? " disabled" : ""} aria-label="${row.lineupActive ? "Remove" : "Add"} ${esc(row.name)}"><span aria-hidden="true">✓</span></label></td>
      <th scope="row" class="cards-cell-name col-name" data-label="Card"><img src="${esc(row.image)}" alt="" loading="lazy"><span><b>${esc(row.name)}</b>${row.quantity > 1 ? `<em>×${row.quantity}</em>` : ""}<small>${esc(row.typeLine)}</small></span></th>
      <td class="col-deck" data-label="Deck"><span class="cards-deck">${esc(row.deckLabel)}</span><small>${esc(row.deckName)}</small></td>
      <td class="col-color" data-label="Color"><span class="cards-color color-${esc(row.colorLabel.toLowerCase())}">${esc(row.colorLabel)}</span></td>
      <td class="col-type" data-label="Type">${esc(row.type)}</td>
      <td class="col-rarity" data-label="Rarity">${esc(row.rarity)}</td>
      <td class="col-set" data-label="Set">${esc(row.setName)}</td>
      <td class="col-role" data-label="Role"><span class="cards-role role-${esc(row.role.toLowerCase().replace(/[^a-z]+/g, "-"))}">${esc(row.role)}</span></td>
      <td class="cards-cell-money col-paid" data-label="Paid">${cash(row.paid)}</td>
      <td class="cards-cell-money col-target" data-label="Target">${cash(row.target)}</td>
    </tr>`;
  }

  // Sorting and column filtering, wired the same way for every table.
  function wireTableControls(root, table, allRows, columnsByKey, rerender) {
    $$("[data-card-sort]", root).forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.cardSort;
      // Same header twice reverses; a different header starts ascending again.
      table.sortDir = table.sortKey === key && table.sortDir === "asc" ? "desc" : "asc";
      table.sortKey = key;
      saveState();
      rerender();
    }));
    $$("[data-card-menu]", root).forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      openColumnMenu(button, table, allRows, columnsByKey, rerender);
    }));
    // On a phone the table has no headers to click -- it is a stack of cards --
    // so sorting and column filtering get their own row above it.
    $("[data-card-mobile-sort]", root)?.addEventListener("change", (event) => {
      table.sortKey = event.target.value;
      saveState();
      rerender();
    });
    $("[data-card-mobile-dir]", root)?.addEventListener("click", () => {
      table.sortDir = table.sortDir === "asc" ? "desc" : "asc";
      saveState();
      rerender();
    });
    $("[data-card-mobile-menu]", root)?.addEventListener("change", (event) => {
      const key = event.target.value;
      event.target.value = "";
      if (key) openColumnMenu(event.target, table, allRows, columnsByKey, rerender, key);
    });
  }

  function wireCardTable(root, visible, table, allRows) {
    const byKey = new Map(visible.map((row) => [`${row.deckId}:${row.key}`, row]));
    wireTableControls(root, table, allRows, CARD_COLUMN_BY_KEY, renderCards);
    $$("[data-card-lineup]", root).forEach((input) => input.addEventListener("change", (event) => {
      event.stopPropagation();
      const row = byKey.get(input.dataset.cardLineup);
      if (row?.variant) setLineupActive(row.card, row.variant, input.checked);
    }));
    $$("tbody tr[data-card-key]", root).forEach((element) => element.addEventListener("click", (event) => {
      if (event.target.closest("a, label, input")) return;
      const row = byKey.get(element.dataset.cardKey);
      if (!row) return;
      if (row.variant) openBuyItemDetail(row.card, row.variant, row.card.fromShell ? "starting shell" : row.card.liveLevelLabel || "selected card");
      else openBuyItemDetail({...row.card, bought: true, purpose: row.card.reason, why: row.card.reason, brief: {fit: row.card.reason}}, {id: "salvage", deckId: "Salvage", image: row.image}, "salvage");
    }));
  }

  // The per-column value picker. Distinct values from the whole owned set, not
  // just the visible rows, so narrowing one column never hides the options in
  // another and leaves you unable to widen it again.
  function openColumnMenu(button, table, allRows, columnsByKey, rerender, forcedKey) {
    $$(".cards-column-menu").forEach((menu) => menu.remove());
    if (button.getAttribute("aria-expanded") === "true") return button.setAttribute("aria-expanded", "false");
    $$("[data-card-menu]").forEach((peer) => peer.setAttribute("aria-expanded", "false"));
    button.setAttribute("aria-expanded", "true");
    const key = forcedKey || button.dataset.cardMenu;
    const column = columnsByKey.get(key);
    const values = Array.from(new Set(allRows.map((row) => String(column.value(row))))).sort((a, b) => a.localeCompare(b));
    const selected = new Set(table.columnFilters?.[key] || values);
    const menu = document.createElement("div");
    menu.className = "cards-column-menu";
    menu.innerHTML = `<p class="cards-column-menu-head">${esc(column.label)}</p>
      <label class="cards-column-all"><input type="checkbox" data-column-all ${selected.size === values.length ? "checked" : ""}><span>Select all</span></label>
      <div class="cards-column-values">${values.map((value) => `<label><input type="checkbox" value="${esc(value)}" ${selected.has(value) ? "checked" : ""}><span>${esc(value || "—")}</span></label>`).join("")}</div>
      <div class="cards-column-menu-actions"><button type="button" class="primary-button" data-column-apply>Apply</button><button type="button" class="secondary-button" data-column-clear>Clear</button></div>`;
    document.body.appendChild(menu);
    const box = button.getBoundingClientRect();
    menu.style.top = `${box.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.max(8, Math.min(box.left + window.scrollX, window.innerWidth - menu.offsetWidth - 8))}px`;
    const boxes = () => $$('.cards-column-values input[type="checkbox"]', menu);
    $("[data-column-all]", menu).addEventListener("change", (event) => boxes().forEach((input) => { input.checked = event.target.checked; }));
    $("[data-column-apply]", menu).addEventListener("click", () => {
      const chosen = boxes().filter((input) => input.checked).map((input) => input.value);
      table.columnFilters = {...table.columnFilters};
      // Everything ticked is the same as no filter, and storing it that way
      // keeps the "N column filters" counter honest.
      if (chosen.length === values.length) delete table.columnFilters[key];
      else table.columnFilters[key] = chosen;
      saveState();
      menu.remove();
      rerender();
    });
    $("[data-column-clear]", menu).addEventListener("click", () => {
      table.columnFilters = {...table.columnFilters};
      delete table.columnFilters[key];
      saveState();
      menu.remove();
      rerender();
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
    setTimeout(() => document.addEventListener("click", function close() {
      menu.remove();
      button.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", close);
    }, {once: true}), 0);
  }

  function exportCardsTable(rows) {
    const header = ["Deck", "Deck name", "Card", "Qty", "Color", "Type", "Type line", "Mana cost", "Mana value", "Rarity", "Set", "Role", "Status", "Paid", "Target", "Ceiling"];
    const body = rows.map((row) => [
      row.deckLabel, row.deckName, row.name, row.quantity, row.colorLabel, row.type, row.typeLine,
      String(row.manaCost || "").replace(/[{}]/g, ""), row.cmc, row.rarity, row.setName, row.role, row.status,
      row.paid === null ? "" : row.paid.toFixed(2),
      row.target === null ? "" : Number(row.target).toFixed(2),
      row.ceiling === null ? "" : Number(row.ceiling).toFixed(2)
    ]);
    downloadCsv([header, ...body], `cards-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast(`Exported ${rows.length} card${rows.length === 1 ? "" : "s"} to CSV.`);
  }

  // One place that turns a table into a downloaded CSV, BOM included so Excel
  // reads the accented card names correctly.
  function downloadCsv(rows, filename) {
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function renderShop() {
    const root = $("#view-shop");
    const allItems = derivedShopItems();
    const filters = state.shopFilters;
    // Shop is the half of the question Decks and Cards do not answer: what is
    // still outstanding. The All/Bought chips are gone with the status filter
    // pinned here, so there is one page per question instead of three pages
    // that each do all three.
    filters.status = "need";
    const foundCount = allItems.filter((item) => shopItemComplete(item)).length;
    const activeFilterCount = [filters.type, filters.category, filters.alt, filters.deck].filter((value) => value !== "all").length + (filters.groupBy !== "none" ? 1 : 0);
    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="shop-title">Shop</h2>
          <p>A clean, deduplicated list for walking vendor tables. Mark purchases Bought; accessories never appear here.</p>
        </div>
        <div class="shop-intro-actions">
          <div class="selection-meter"><strong>${foundCount}/${allItems.length}</strong><span>items bought</span></div>
          <label class="secondary-button shop-import" title="Restore what you own from a Decks checklist export — useful after clearing this browser's data or moving to another device">
            <input type="file" accept=".csv,text/csv" id="shop-import-input" hidden>
            <span>Upload purchase history</span>
          </label>
        </div>
      </div>
      <div class="shop-toolbar shop-toolbar-single">
        <input class="search-input" id="shop-search" type="search" value="${esc(filters.query)}" placeholder="Search cards…" aria-label="Search shopping list">
        <details class="more-filters">
          <summary>Filters${activeFilterCount ? ` <b>${activeFilterCount}</b>` : ""}</summary>
          <div class="filter-select-grid">
            ${selectFilter("type", "Items", [["all","All items"],["singles","Singles"],["precons","Precons"]], filters)}
            ${selectFilter("category", "Level", LEVEL_FILTER_OPTIONS, filters)}
            ${selectFilter("alt", "Alt", ALT_FILTER_OPTIONS, filters)}
            ${selectFilter("deck", "Deck", [["all","All decks"], ...selectedVariants().map((variant) => [String(variant.deckId), `Deck ${variant.deckId}`])], filters)}
            ${selectFilter("groupBy", "Group by", [["none","No grouping"],["where","Where to look"],["rarity","Rarity"],["price","Price range"],["typeLine","Card type"],["themeSet","Theme / set"],["deckCount","# of decks"]], filters)}
          </div>
        </details>
        <div class="shop-view-controls">
          <div class="status-chips" role="group" aria-label="Layout">
            <button type="button" class="filter-chip${filters.layout === "list" ? "" : " is-active"}" data-shop-layout="gallery" aria-pressed="${filters.layout === "list" ? "false" : "true"}">Gallery</button>
            <button type="button" class="filter-chip${filters.layout === "list" ? " is-active" : ""}" data-shop-layout="list" aria-pressed="${filters.layout === "list" ? "true" : "false"}">List</button>
          </div>
        </div>
      </div>
      <div class="shop-summary" id="shop-summary"></div>
      <div class="shop-list${filters.layout === "list" ? " is-list" : ""}" id="shop-list"></div>
      <div id="shop-actions"></div>`;

    updateShopResults(root);
    $$("[data-shop-layout]", root).forEach((button) => button.addEventListener("click", () => {
      state.shopFilters.layout = button.dataset.shopLayout;
      saveState();
      renderShop();
    }));
    $("#shop-search", root).addEventListener("input", (event) => {
      state.shopFilters.query = event.target.value;
      saveState();
      updateShopResults(root);
    });
    $("#shop-import-input", root)?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => showToast("That file could not be read.");
      reader.onload = () => {
        const result = importPurchaseHistory(String(reader.result || ""));
        event.target.value = "";
        if (result.error) {
          showToast(result.error);
          return;
        }
        const parts = [`${result.matched} card${result.matched === 1 ? "" : "s"} marked bought`];
        if (result.boxes) parts.push(`${result.boxes} precon box${result.boxes === 1 ? "" : "es"} restored`);
        if (result.priced) parts.push(`${result.priced} paid price${result.priced === 1 ? "" : "s"} restored`);
        if (result.unknown.length) parts.push(`${result.unknown.length} name${result.unknown.length === 1 ? "" : "s"} not in any deck`);
        showToast(parts.join(" · "));
        if (result.unknown.length) console.info("Purchase history: names not found in any deck plan:", result.unknown);
        renderShop();
      };
      reader.readAsText(file);
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
    list.classList.toggle("is-grouped", state.shopFilters.groupBy !== "none" && state.shopFilters.layout !== "list");
    if (state.shopFilters.layout === "list") {
      renderShopTable(list, visible);
    } else if (state.shopFilters.groupBy === "none") {
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
    // Export scopes to how you intend to buy: a vendor-floor list and a
    // shopping-cart list are different errands and want different paper.
    $("#shop-actions", root).innerHTML = allItems.length
      ? `<div class="action-row"><button class="secondary-button" data-go="buy">Adjust Calibrate</button>
          <div class="shop-export-menu">
            <button type="button" class="secondary-button" id="shop-export" aria-haspopup="true" aria-expanded="false"${visible.length ? "" : " disabled"}>Export ▾</button>
            <div class="shop-export-options" hidden>
              <button type="button" data-shop-export="online">Online — ${visible.filter((item) => buyChannelOf(item) === "online").length} cards</button>
              <button type="button" data-shop-export="inperson">In-person — ${visible.filter((item) => buyChannelOf(item) === "inperson").length} cards</button>
              <button type="button" data-shop-export="all">All — ${visible.length} cards</button>
            </div>
          </div>
        </div>`
      : `<div class="empty-state"><h3>Your field list is empty</h3><p>Select deck variants and save their Calibrate first.</p><button class="primary-button" data-go="buy">Open Calibrate</button></div>`;
    const exportButton = $("#shop-export", root);
    const exportOptions = $(".shop-export-options", root);
    exportButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = exportOptions.hidden;
      exportOptions.hidden = !open;
      exportButton.setAttribute("aria-expanded", String(open));
      if (open) setTimeout(() => document.addEventListener("click", function close() {
        exportOptions.hidden = true;
        exportButton.setAttribute("aria-expanded", "false");
        document.removeEventListener("click", close);
      }, {once: true}), 0);
    });
    $$("[data-shop-export]", root).forEach((button) => button.addEventListener("click", () => {
      const scope = button.dataset.shopExport;
      exportOptions.hidden = true;
      exportButton.setAttribute("aria-expanded", "false");
      const rows = scope === "all" ? visible : visible.filter((item) => buyChannelOf(item) === scope);
      if (!rows.length) return showToast(`Nothing marked ${scope === "online" ? "Online" : "In-person"} in the current view.`);
      exportShopList(rows, scope);
    }));
  }

  // Exports exactly what the Shop is showing -- the current status filter, every other
  // filter, and the current grouping -- and nothing from any other screen. Two real uses:
  // filtered to Bought it is a spreadsheet backup of what you own; filtered to To Buy it is a
  // list to print and carry, so it carries a check-off column and stays narrow enough to read.
  // How you intend to buy a card, kept per card. Unset means undecided, which
  // is why All is a separate export rather than the sum of the other two.
  const BUY_CHANNELS = [
    {key: "online", label: "Online"},
    {key: "inperson", label: "In-person"}
  ];
  function buyChannelOf(item) {
    return state.buyChannels?.[itemKey(item)] || "";
  }
  function setBuyChannel(item, channel) {
    state.buyChannels ||= {};
    const key = itemKey(item);
    if (state.buyChannels[key] === channel) delete state.buyChannels[key];
    else state.buyChannels[key] = channel;
    saveState(`${item.name} marked ${state.buyChannels[key] ? (state.buyChannels[key] === "online" ? "for online" : "for in-person") : "undecided"}`);
    renderShop();
  }

  // Shop's list mode: the same table Cards uses, so "show me many cards at
  // once" looks the same wherever it is asked. The difference is the row
  // control -- here a card is not in a deck yet, it is a thing to acquire, so
  // the row asks how rather than whether.
  const SHOP_COLUMNS = [
    {key: "buy", label: "Buy", sortable: false, menu: false, value: (row) => row.channelLabel},
    {key: "name", label: "Card", sortable: true, menu: false, value: (row) => row.name},
    {key: "deck", label: "Decks", sortable: true, menu: true, value: (row) => row.deckLabel},
    {key: "color", label: "Color", sortable: true, menu: true, value: (row) => row.colorLabel},
    {key: "type", label: "Type", sortable: true, menu: true, value: (row) => row.type},
    {key: "rarity", label: "Rarity", sortable: true, menu: true, value: (row) => row.rarity},
    {key: "where", label: "Where", sortable: true, menu: true, value: (row) => row.where},
    {key: "price", label: "Floor", sortable: true, menu: false, value: (row) => row.price},
    {key: "ceiling", label: "Ceiling", sortable: true, menu: false, value: (row) => row.ceiling}
  ];
  const SHOP_COLUMN_BY_KEY = new Map(SHOP_COLUMNS.map((column) => [column.key, column]));

  function shopTableRows(items) {
    return items.map((item) => {
      const metadata = cardMetadata[itemKey(item)] || {};
      const bounds = cardPriceBounds(item, metadata);
      const channel = buyChannelOf(item);
      return {
        item,
        key: itemKey(item),
        name: item.name,
        quantity: Math.max(1, Number(item.quantity || 1)),
        deckLabel: item.deckRefs?.length ? item.deckRefs.map((ref) => `Deck ${ref.deckId}`).join(", ") : "—",
        colorLabel: colorLabelFor(item, metadata),
        type: item.category === "precon" ? "Precon" : liveCardType(item),
        typeLine: item.typeLine || metadata.typeLine || "",
        rarity: metadata.rarity ? `${metadata.rarity[0].toUpperCase()}${metadata.rarity.slice(1)}` : "Unknown",
        where: shopTableLocation(item, metadata),
        image: cardImageCandidates(item, metadata)[0],
        channel,
        channelLabel: channel === "online" ? "Online" : channel === "inperson" ? "In-person" : shopItemComplete(item) ? "Bought" : "—",
        bought: shopItemComplete(item),
        price: Number(bounds.price) || null,
        ceiling: Number(bounds.ceiling) || null
      };
    });
  }

  function renderShopTable(host, items) {
    const table = ensureShopTable();
    const rows = shopTableRows(items);
    const visible = sortTableRows(rows.filter((row) => matchesColumnFilters(row, table, SHOP_COLUMN_BY_KEY)), table, SHOP_COLUMN_BY_KEY, "name");
    host.innerHTML = `${mobileTableControlsMarkup(SHOP_COLUMNS, table)}<div class="cards-table-wrap"><table class="cards-table shop-table">
      <thead><tr>${SHOP_COLUMNS.map((column) => tableHeaderMarkup(column, table)).join("")}</tr></thead>
      <tbody>${visible.map(shopTableRowMarkup).join("")}</tbody>
    </table></div>`;
    wireTableControls(host, table, rows, SHOP_COLUMN_BY_KEY, renderShop);
    $$("[data-buy-channel]", host).forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const row = visible.find((entry) => entry.key === button.dataset.rowKey);
      if (!row) return;
      if (button.dataset.buyChannel === "bought") return toggleShopFound(row.item);
      setBuyChannel(row.item, button.dataset.buyChannel);
    }));
    $$("tbody tr[data-row-key]", host).forEach((element) => element.addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      const row = visible.find((entry) => entry.key === element.dataset.rowKey);
      if (!row) return;
      const variant = selectedVariants().find((candidate) => row.item.deckRefs?.some((ref) => ref.deckId === candidate.deckId)) || selectedVariants()[0];
      if (variant) openBuyItemDetail(row.item, variant, row.item.category || "shop");
    }));
  }

  function shopTableRowMarkup(row) {
    const cash = (value) => (value === null || value === undefined ? "<i>—</i>" : `$${Number(value).toFixed(2)}`);
    const channelButton = (key, label) => `<button type="button" class="shop-channel${row.channel === key ? " is-on" : ""}" data-buy-channel="${esc(key)}" data-row-key="${esc(row.key)}">${esc(label)}</button>`;
    return `<tr data-row-key="${esc(row.key)}" class="${row.bought ? "is-bought" : ""}">
      <td class="col-buy" data-label="Buy"><span class="shop-channel-group">${channelButton("online", "Online")}${channelButton("inperson", "In-person")}<button type="button" class="shop-channel is-bought${row.bought ? " is-on" : ""}" data-buy-channel="bought" data-row-key="${esc(row.key)}">${row.bought ? "✓ Bought" : "Bought"}</button></span></td>
      <th scope="row" class="cards-cell-name col-name" data-label="Card"><img src="${esc(row.image)}" alt="" loading="lazy"><span><b>${esc(row.name)}</b>${row.quantity > 1 ? `<em>×${row.quantity}</em>` : ""}<small>${esc(row.typeLine)}</small></span></th>
      <td class="col-deck" data-label="Decks">${esc(row.deckLabel)}</td>
      <td class="col-color" data-label="Color"><span class="cards-color color-${esc(row.colorLabel.toLowerCase())}">${esc(row.colorLabel)}</span></td>
      <td class="col-type" data-label="Type">${esc(row.type)}</td>
      <td class="col-rarity" data-label="Rarity">${esc(row.rarity)}</td>
      <td class="col-where" data-label="Where">${esc(row.where)}</td>
      <td class="cards-cell-money col-price" data-label="Floor">${cash(row.price)}</td>
      <td class="cards-cell-money col-ceiling" data-label="Ceiling">${cash(row.ceiling)}</td>
    </tr>`;
  }

  function shopTableLocation(item, metadata) {
    if (item.category === "precon") return "Precon / sealed product";
    return item.whereToBuy || metadata.whereToBuy || "Ask vendor";
  }

  // Same write the gallery's Mark Bought performs, reachable from the table.
  function toggleShopFound(item) {
    const bought = !shopItemComplete(item);
    state.found[item.key] = bought;
    state.boughtQuantities ||= {};
    if (bought) state.boughtQuantities[item.key] = Math.max(1, Number(item.quantity || 1));
    else delete state.boughtQuantities[item.key];
    saveState(bought ? `${item.name} marked Bought` : `${item.name} returned to Need`);
    renderShop();
  }

  function ensureShopTable() {
    state.shopTable = {sortKey: "name", sortDir: "asc", columnFilters: {}, ...(state.shopTable || {})};
    return state.shopTable;
  }

  function exportShopList(visible) {
    const groupBy = state.shopFilters.groupBy;
    const groups = groupBy === "none" ? [{label: "", items: visible}] : groupShopItems(visible, groupBy);
    const header = ["Check", "Group", "Card", "Qty", "Type", "Color", "Target", "Ceiling", "Paid", "Status"];
    const rows = [header];
    let count = 0;
    groups.forEach((group) => {
      group.items.forEach((item) => {
        const metadata = cardMetadata[itemKey(item)] || {};
        const bounds = cardPriceBounds(item, metadata);
        const bought = shopItemComplete(item);
        const paid = committedPrice(item);
        rows.push([
          "[ ]",
          group.label,
          item.name,
          String(item.quantity || 1),
          item.typeLine || metadata.typeLine || "",
          (metadata.colorIdentity || item.colorIdentity || []).join("") || "C",
          bounds.price != null ? bounds.price.toFixed(2) : "",
          bounds.ceiling != null ? bounds.ceiling.toFixed(2) : "",
          paid === null ? "" : paid.toFixed(2),
          bought ? "Bought" : "To Buy"
        ]);
        count += 1;
      });
    });
    if (!count) return showToast("Nothing to export with the current filters.");
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const label = state.shopFilters.status === "found" ? "owned" : state.shopFilters.status === "need" ? "to-buy" : "shop-list";
    const blob = new Blob([`﻿${csv}`], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mtg-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Exported ${count} card${count === 1 ? "" : "s"} to CSV.`);
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
  // "at least one owned" (other views rely on that), so Shop completion is tracked
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
    if (filters.alt === "alt" && !item.tags?.includes("alt")) return false;
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
    const levelBadges = categories
      .filter((category, index, values) => !(item.category === "precon" && category === "precon") && values.indexOf(category) === index)
      .map((category) => `<span class="shop-badge ${esc(category)}">${esc(KIND_LABELS[category] || category)}</span>`)
      .join("");
    const altBadge = item.tags?.includes("alt") ? `<span class="shop-badge alt">${icon("◇")}Alt</span>` : "";
    const displayType = item.category === "precon" ? "Precon" : item.typeLine;
    const imageCandidates = cardImageCandidates(item, metadata);
    card.innerHTML = `
      <button class="shop-image-button" aria-label="View a larger image of ${esc(item.name)}">
        <img class="shop-image" src="${esc(imageCandidates[0] || "og.png")}" alt="${esc(item.name)} card" loading="lazy" decoding="async">
      </button>
      <div class="shop-main">
        <div class="shop-card-kicker">${item.manaCost ? manaCostHtml(item.manaCost) : ""}${rarityIcon(rarityKey, rarity)}${levelBadges}${altBadge}${item.gameChanger ? `<span class="shop-badge gc">GC</span>` : ""}</div>
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

  /* One tour per tab, and the tabs are Compare, Deck, Shop and Game Log. The
     lists that used to sit here were keyed by buy/live/cards, three views that no
     longer exist, so Deck and Shop both fell through to the Compare tour and
     narrated a six-tab site nobody was looking at. Each selector list ends in a
     fallback that survives an unpicked deck, because a tour that lands on nothing
     is worse than no tour. */
  const TOUR_STEPS = {
    compare: [
      {view: "compare", selectors: [".main-tabs"], title: "Four steps, one flow", copy: "Compare picks which version of each deck to build, Deck turns that pick into an exact hundred and tracks what is physically in the box, Shop is the vendor-floor list of what is still owed, and Game Log records how the decks actually played."},
      {view: "compare", selectors: [".page-intro"], title: "One variant per deck", copy: "Every deck role has five competing approaches. Pick one per role — the counter shows how many are locked in."},
      {view: "compare", selectors: [".intro-actions", ".selection-meter"], title: "Nothing to save", copy: "Picks are written to this device the moment you make them. Deck → just jumps ahead, and the envelope mails the current selections to yourself."},
      {view: "compare", selectors: [".compare-filter-panel"], title: "Narrow the field", copy: "Search by commander, tag, or text, and filter by mechanic or play style. Only matching variants stay visible inside each row."},
      {view: "compare", selectors: ["[data-compare-filter='profileStage']", ".compare-filter-panel"], title: "Base, Tuned, or Maxed", copy: "Score stage changes which build every number on the page describes: out of the box, after the core purchases, or Maxed — a real Bracket 3 hundred carrying up to three Game Changers."},
      {view: "compare", selectors: [".deck-group:first-of-type > summary"], title: "One row per deck role", copy: "Each row is a role with its own objective. Open it to see the five approaches competing for that slot."},
      {view: "compare", selectors: [".deck-group:first-of-type .rank-order"], title: "Change the ranking lens", copy: "Re-rank the variants for Base, Tuned, or Maxed play to see whether a recommendation still holds as the money goes in."},
      {view: "compare", selectors: [".deck-group:first-of-type .metric-strip", ".deck-group:first-of-type .variant-card"], title: "Read the three ratings", copy: "Playstyle is how the deck feels to play, Engine is how efficiently it works, Growth is how much upgrade road is left. Tap one to see every sub-score and why it landed there."},
      {view: "compare", selectors: [".deck-group:first-of-type .detail-button", ".deck-group:first-of-type .variant-card"], title: "Open the full evidence", copy: "Full detail carries the commander breakdown, rank reasoning, rarity, precon seed, play pattern, and bracket route."},
      {view: "compare", selectors: [".deck-group:first-of-type .pick-control", ".deck-group:first-of-type .variant-card"], title: "Lock in the pick", copy: "Picking a variant feeds every later step, and the score stage you were reading becomes the rung the Deck tab opens on. Change it any time — your other picks are preserved."},
      {view: "deck2", selectors: [".dp-rail", ".loading-card", "#view-deck2"], title: "Next · your pick becomes a hundred cards", copy: "Deck opens on the variant you picked, one button per deck along the top."}
    ],
    deck2: [
      {view: "deck2", selectors: [".dp-rail", ".loading-card", "#view-deck2"], title: "One deck at a time", copy: "A button per deck you picked on Compare. Everything below belongs to the deck highlighted here."},
      {view: "deck2", selectors: [".dp-tally", ".loading-card", "#view-deck2"], title: "Where all hundred cards are", copy: "The tally always adds to the full deck: what is in this box, what you own but have filed elsewhere, what is ordered, what is still to buy, and any slot still empty."},
      {view: "deck2", selectors: [".dp-rank", ".loading-card", "#view-deck2"], title: "Rank order sets every slot at once", copy: "Base is the cheapest hundred that is still this deck, Tuned is the core purchases, Fun branches off Base for a pod that wants a game rather than a result, and Max is the Bracket 3 build with its Game Changers. One click moves all hundred slots, and ticks the box for the cards you already own."},
      {view: "deck2", selectors: [".dp-stats-row", ".loading-card", "#view-deck2"], title: "Slots filled and land count", copy: "The two numbers that decide whether the deck is playable tonight, kept where you cannot miss them."},
      {view: "deck2", selectors: [".dp-grp-h", ".loading-card", "#view-deck2"], title: "Grouped by card type", copy: "Creatures, lands, removal and the rest each fold away, with a card count and how many of them you still owe."},
      {view: "deck2", selectors: [".dp-slot", ".loading-card", "#view-deck2"], title: "One row per slot", copy: "A slot is a job in the deck, not a card. The row names whichever card is doing that job right now, which rung it came from, its price, and where the physical copy is."},
      {view: "deck2", selectors: [".dp-box", ".dp-slot", "#view-deck2"], title: "The box checkbox", copy: "Tick it when the card is actually sleeved in this deck. Ticking also records that you hold a copy, so a card can never read as in the box and still to buy at the same time."},
      {view: "deck2", selectors: [".dp-main", ".dp-slot", "#view-deck2"], title: "Open a slot for its options", copy: "Every slot carries the rungs that can fill it, side by side, each with the reason it was chosen over the one it replaces.", act: "openSlot"},
      {view: "deck2", selectors: [".dp-cand", ".dp-slot", "#view-deck2"], title: "Swap one slot without moving the page", copy: "Picking a rung inside a slot changes that slot only. The row keeps its place and the panel stays open, so you can work down a group without hunting for where you were."},
      {view: "shop2", selectors: [".sp-bar", ".loading-card", "#view-shop2"], title: "Next · what is still owed", copy: "Everything left to buy across every deck collapses into one list on Shop."}
    ],
    shop2: [
      {view: "shop2", selectors: [".sp-bar", ".loading-card", "#view-shop2"], title: "One list, every deck", copy: "Each card you still owe appears once, however many decks want it, with the decks named on the row."},
      {view: "shop2", selectors: [".sp-drop", ".sp-bar", "#view-shop2"], title: "Filters stack", copy: "Each filter is a multi-select — tick two rarities or three decks and the list keeps both. Active filters show as chips you can pull off one at a time."},
      {view: "shop2", selectors: ["#sp-q", ".sp-bar", "#view-shop2"], title: "Search inside the list", copy: "Type any part of a card name to narrow what is on screen without touching the filters."},
      {view: "shop2", selectors: [".sp-seg", ".sp-bar", "#view-shop2"], title: "Four ways to read the list", copy: "Table carries every column, gallery shows the art when you are hunting a specific printing, Bench holds cards you own that no slot has asked for yet, and Store is the one to open when you are standing at a seller's table."},
      {view: "shop2", selectors: [".sp-seg", ".sp-bar", "#view-shop2"], title: "Store, for a phone in one hand", copy: "Store shows only what you still owe, ten to a screen instead of four, and each row is a name, a price and a Buy button big enough to hit without looking. Buy marks the card in hand; the row stays where it is, struck through, with an Undo. Group by first letter or by set to match the box you are flipping through."},
      {view: "shop2", selectors: ["#sp-group", ".sp-bar", "#view-shop2"], title: "Group the way you shop", copy: "Group by table location, price band, rarity, type, or deck, so the list matches the order you will actually walk the floor in."},
      {view: "shop2", selectors: [".sp-tot", ".sp-bar", "#view-shop2"], title: "The running total", copy: "How many cards and how much money are still outstanding, for exactly the rows the filters have left on screen."},
      {view: "shop2", selectors: [".sp-card", ".sp-table", ".sp-bar", "#view-shop2"], title: "Mark it bought", copy: "Marking a card bought moves it into your ownership ledger, drops it out of the owed total, and makes it available to tick into a box back on Deck."},
      {view: "log", selectors: [".game-log-form", ".page-intro", "#view-log"], title: "Next · what actually happened", copy: "Game Log is the only part of this site that is not a model. Record a game and the predictions get something to answer to."}
    ],
    log: [
      {view: "log", selectors: [".page-intro"], title: "What actually happened", copy: "Everything else on this site is a model. This is the record: what you played, whether you won, how long it took, and how the table felt about it."},
      {view: "log", selectors: [".game-log-form", "#view-log"], title: "Under thirty seconds after a game", copy: "Deck, result, turns, knockouts, and two quick reads on how much fun it was for you and for the pod. Save and it is on this device immediately."},
      {view: "log", selectors: ["[data-log-export]", ".page-intro"], title: "Export and commit", copy: "Export writes the games as JSON. Commit that file under data/game-logs/ and a GitHub Action compiles every entry into the cumulative history the simulated predictions get checked against."}
    ]
  };

  /* The sticky header measured 194px on a 390px screen and 211px on a 360px one --
     a quarter and a third of the viewport, held there permanently, for a title and
     five buttons touched once a session. On a phone it now starts folded to the tab
     bar. This is a per-device presentation choice, not part of the deck state, so it
     is kept out of the exported file and read straight from localStorage. */
  const HEADER_COLLAPSE_KEY = "mtg-header-collapsed-v1";

  function readHeaderCollapsed() {
    try {
      const saved = localStorage.getItem(HEADER_COLLAPSE_KEY);
      if (saved === "0" || saved === "1") return saved === "1";
    } catch (error) { /* private mode, blocked storage: fall through to the default */ }
    // Folded is the default only where it buys something. On a wide screen the
    // toggle is hidden, so leaving it open is what the reader expects.
    return window.matchMedia("(max-width: 700px)").matches;
  }

  /* The header is sticky, so anything else that wants to stick has to know how tall it is
     -- and it is not one number: it collapses on a phone, expands when asked, and wraps
     differently at every width. Measuring it and publishing the answer is the only version
     of this that does not go stale. Read as --head-h by the Store view's group headings. */
  function publishHeaderHeight() {
    const header = $(".app-header");
    if (!header) return;
    const h = Math.round(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--head-h", h + "px");
  }

  function setHeaderCollapsed(collapsed) {
    const header = $(".app-header");
    const toggle = $("#header-toggle");
    if (!header) return;
    header.dataset.collapsed = collapsed ? "1" : "0";
    publishHeaderHeight();
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute("aria-label", collapsed
        ? "Show the title and the Tour, Export, Import, Load Active and Reset buttons"
        : "Hide the title and the Tour, Export, Import, Load Active and Reset buttons");
    }
    try { localStorage.setItem(HEADER_COLLAPSE_KEY, collapsed ? "1" : "0"); } catch (error) { /* nothing to remember it with */ }
  }

  function activeViewName() {
    return $(".main-tab.is-active")?.dataset.view || "compare";
  }

  function closeTour() {
    const origin = tourState?.origin;
    tourState = null;
    $("#tour-layer").hidden = true;
    if (origin && activeViewName() !== origin) switchView(origin, false);
  }

  /* A step can open the thing it is about to describe. Without this the two Deck
     steps that talk about the inside of a slot spotlight a closed row instead. */
  const TOUR_ACTS = {
    openSlot() {
      if ($(".dp-cand")) return;
      $("[data-dp-expand]")?.click();
    }
  };

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
    const tourName = ({compare: "Compare", deck2: "Deck", shop2: "Shop", log: "Game Log"})[tourState.origin] || "Guided";
    $("#tour-progress").textContent = `${tourName} tour · ${tourState.index + 1} of ${tourState.steps.length}`;
    $("#tour-title").textContent = step.title;
    $("#tour-copy").innerHTML = `<p>${esc(step.copy)}</p>`;
    if (step.act) TOUR_ACTS[step.act]?.();
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

  // Cross-device state portability. localStorage never leaves one browser, so moving picks to a
  // phone or another machine otherwise means redoing every choice by hand. This bundles the two
  // things this app actually persists -- the main `state` object and, separately, whatever
  // Custom decks were built on the Choose step -- into one file, versioned independently of
  // either's own internal schema so the export wrapper itself can evolve later.
  const STATE_EXPORT_SCHEMA = 1;

  function serializeStatePayload() {
    let custom = null;
    try {
      const raw = localStorage.getItem(Custom.STORAGE_KEY);
      custom = raw ? JSON.parse(raw) : null;
    } catch (error) {
      custom = null;
    }
    return {app: "mtg-deck-matrix", exportSchema: STATE_EXPORT_SCHEMA, exportedAt: new Date().toISOString(), state, custom};
  }

  function exportFullState() {
    const payload = serializeStatePayload();
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mtg-deck-matrix-state-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    try { localStorage.setItem(LAST_EXPORT_KEY, String(Date.now())); } catch (error) { /* nothing to remember it with */ }
    refreshStateChrome();
    showToast("Exported your full state — Compare picks, Deck boxes, Shop marks and prices.");
  }

  /* Loading a file replaces everything on this device with no way back, which is the one
     irreversible action in the app. Whatever was here is kept for exactly one undo, so a
     Load Active pressed out of habit does not cost an evening of ticked boxes. Both keys
     live outside `state`: a backup inside the thing it backs up is no backup, and stamping
     the export time into the state would make every exported file stale the moment it was
     written. */
  const LOAD_UNDO_KEY = "mtg-load-undo-v1";
  const LAST_EXPORT_KEY = "mtg-last-export-v1";

  function stashUndo() {
    try { localStorage.setItem(LOAD_UNDO_KEY, JSON.stringify(serializeStatePayload())); }
    catch (error) { /* storage refused: the load still happens, it just cannot be undone */ }
    refreshStateChrome();
  }

  function undoLoad() {
    let payload = null;
    try { payload = JSON.parse(localStorage.getItem(LOAD_UNDO_KEY) || "null"); }
    catch (error) { payload = null; }
    if (!isPlausibleStatePayload(payload)) return showToast("There is nothing to undo.");
    if (!window.confirm("Put back what was here before the last load? Anything changed since is lost.")) return;
    try { localStorage.removeItem(LOAD_UNDO_KEY); } catch (error) { /* nothing to clear */ }
    applyStatePayload(payload, "before the last load", {backup: false});
  }

  function sinceExport() {
    let stamp = null;
    try { stamp = localStorage.getItem(LAST_EXPORT_KEY); } catch (error) { return null; }
    if (!stamp) return null;
    const minutes = Math.max(0, Math.round((Date.now() - Number(stamp)) / 60000));
    if (!Number.isFinite(minutes)) return null;
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.round(hours / 24)} d ago`;
  }

  /* The two things worth knowing about your file, kept honest after every change to it. */
  function refreshStateChrome() {
    const undo = $("#undo-load-button");
    if (undo) {
      let has = false;
      try { has = Boolean(localStorage.getItem(LOAD_UNDO_KEY)); } catch (error) { has = false; }
      undo.hidden = !has;
    }
    const chip = $("#export-age");
    if (chip) {
      const ago = sinceExport();
      chip.textContent = ago ? `exported ${ago}` : "never exported";
      chip.classList.toggle("is-stale", !ago);
    }
  }

  function isPlausibleStatePayload(payload) {
    return Boolean(payload && typeof payload === "object" && payload.state && typeof payload.state === "object" && typeof payload.state.compareSelections === "object");
  }

  // Import and Load Active both replace, rather than merge, everything this browser has saved.
  // A full-state file has no natural merge rule -- unlike the purchase-history CSV import, which
  // is scoped to ownership marks alone and is safely additive, this payload covers every
  // selection, filter, and toggle in the app, so combining two independent copies field-by-field
  // would silently pick a winner the user never chose. Replacing is at least predictable, and
  // the caller is required to confirm first since there is no way back once applied except
  // re-importing an earlier export.
  /**
   * Cards you have paid for that have not arrived.
   *
   * A state file records these as a plain list beside the state -- a manifest of what is
   * in the post. Nothing read it. So each of them stayed indistinguishable from a card
   * sitting on the table (found, with a quantity, which normalizeOwned reads as in hand),
   * and once its box was ticked the row said "In the box" about a card still in a
   * envelope somewhere.
   *
   * This turns the manifest into real ownership: those copies move from in-hand to
   * ordered, and the legacy found/boughtQuantities pair is kept in step exactly the way
   * bumpOwned keeps it, so there is still one convention for what those two mean.
   * Clicking "In hand" on the Shop moves a copy back the other way, which is the round
   * trip the manifest exists to describe.
   */
  function applyOrderedManifest(payload) {
    const Slot = window.MtgSlotModel;
    const list = payload && payload.orderedNotYetInHand;
    if (!Slot || !Array.isArray(list) || !list.length) return;
    /* Only for a file that does not already know. The manifest exists to upgrade a state
       whose ownership is a flat count -- found plus a quantity, with no way to say "two of
       these three are in the post". A file carrying explicit {inHand, ordered} records has
       already answered that, per card, and re-filing from a list of names would flatten a
       card that is partly held and partly ordered into wholly ordered. Which is exactly
       what it did to Overgrown Battlement: one copy in deck 4's box, one on its way to
       deck 1, and the manifest moved both into the post. */
    if (state.ownershipSchema >= 3 && state.owned && Object.keys(state.owned).length) return;
    // Ownership becomes explicit here rather than being re-derived on every read, so the
    // ordered records have somewhere to live that normalizeOwned will not flatten.
    state.owned = Slot.normalizeOwned(state);
    state.found ||= {};
    state.boughtQuantities ||= {};
    list.forEach((entry) => {
      const name = typeof entry === "string" ? entry : (entry && entry.name) || "";
      if (!name) return;
      const key = Slot.ownedKey(name);
      const rec = state.owned[key];
      // Only a card the file already counts as owned can be re-filed as ordered; a name
      // with no ownership behind it is a typo in the manifest, not a card in the post.
      if (!rec || !rec.inHand) return;
      state.owned[key] = {inHand: 0, ordered: rec.inHand + (rec.ordered || 0)};
      state.boughtQuantities[key] = 0;
      delete state.found[key];
    });
    state.ownershipSchema = 3;
  }

  function applyStatePayload(payload, sourceLabel, options = {}) {
    if (options.backup !== false) stashUndo();
    state = {...blankState(), ...payload.state};
    applyOrderedManifest(payload);
    try {
      if (payload.custom) localStorage.setItem(Custom.STORAGE_KEY, JSON.stringify(payload.custom));
      else localStorage.removeItem(Custom.STORAGE_KEY);
    } catch (error) {
      // Best-effort; the app still functions on the baked catalog alone.
    }
    customStore = Custom.load(localStorage);
    remergeCustom();
    persistCustom();
    ensureDeckBoxesSeeded();
    ensureAssignedSeeded();
    saveState(`Loaded state${sourceLabel ? ` from ${sourceLabel}` : ""}`);
    renderCompare();
    renderChoose();
    switchView("compare");
    showToast(`Loaded state${sourceLabel ? ` from ${sourceLabel}` : ""}.`);
  }

  function importStateFromFile(file) {
    const reader = new FileReader();
    reader.onerror = () => showToast("That file could not be read.");
    reader.onload = () => {
      let payload;
      try {
        payload = JSON.parse(String(reader.result || ""));
      } catch (error) {
        showToast("That file is not valid JSON.");
        return;
      }
      if (!isPlausibleStatePayload(payload)) {
        showToast("That file does not look like a Deck Matrix state export.");
        return;
      }
      if (!window.confirm("Load this file? It replaces every selection, buy, Shop mark, and Decks change currently saved on this device.")) return;
      applyStatePayload(payload, file.name);
    };
    reader.readAsText(file);
  }

  async function loadActiveState() {
    let payload;
    try {
      const response = await fetch("data/active-state.json", {cache: "no-store"});
      if (!response.ok) {
        showToast(response.status === 404 ? "No active-state.json is committed to the repo yet." : `Could not load active state (${response.status}).`);
        return;
      }
      payload = await response.json();
    } catch (error) {
      showToast("Could not load the active state file.");
      return;
    }
    if (!isPlausibleStatePayload(payload)) {
      showToast("data/active-state.json does not look like a Deck Matrix state export.");
      return;
    }
    const when = payload.exportedAt ? ` (exported ${new Date(payload.exportedAt).toLocaleString()})` : "";
    if (!window.confirm(`Load the active state from the repository${when}? It replaces every selection, buy, Shop mark, and Decks change currently saved on this device.`)) return;
    applyStatePayload(payload, "the repository");
  }

  async function init() {
    try {
      let activeStateFile = null;
      [bakedCatalog, bakedBuyCatalog, simulationSummary, activeStateFile] = await Promise.all([
        fetch("data/variants.json", {cache: "no-store"}).then((response) => {
          if (!response.ok) throw new Error("Variant catalog did not load");
          return response.json();
        }),
        fetch("data/buy-plans.json", {cache: "no-store"}).then((response) => {
          if (!response.ok) throw new Error("Buy catalog did not load");
          return response.json();
        }),
        // Additive: real simulation results for the new ladders. Never blocks startup --
        // the commander-compare preview and Calibrate simulation readout just render nothing
        // extra if this is unavailable, same as any other optional metadata in this app.
        fetch("data/simulation-summary.json", {cache: "no-store"}).then((response) => response.ok ? response.json() : null).catch(() => null),
        // Read for the corner ribbon alone. Loading this file does NOT apply it
        // -- that stays an explicit Load Active click -- so a browser mid-build
        // keeps its own picks while still being told which six are the
        // published slate.
        fetch("data/active-state.json", {cache: "no-store"}).then((response) => response.ok ? response.json() : null).catch(() => null)
      ]);
      treysBuildIds = new Set(Object.values(activeStateFile?.state?.compareSelections || {}).filter(Boolean));
      customStore = Custom.load(localStorage);
      remergeCustom();
      state = loadState();
      pruneMissingSelections();
      migrateCheckedSelections();
      migrateOwnedExtras();
      migrateBoughtQuantities();
      migrateOwnership();
      sanitizeGameChangerSelections();
      // Boxes come from the selection the first time a variant is seen, so Compare's copy
      // accounting and the Shop's Bench agree with the Deck page before it is opened.
      ensureDeckBoxesSeeded();
      ensureAssignedSeeded();
      initializeInfoTooltips();
      initializeDetailsControls();
      renderCompare();
      $$(".main-tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
      $("#reset-button").addEventListener("click", resetState);
      $("#tour-button").addEventListener("click", startTour);
      $("#undo-load-button")?.addEventListener("click", undoLoad);
      refreshStateChrome();
      setHeaderCollapsed(readHeaderCollapsed());
      $("#header-toggle")?.addEventListener("click", () => {
        setHeaderCollapsed($(".app-header")?.dataset.collapsed !== "1");
      });
      $("#export-state-button").addEventListener("click", exportFullState);
      $("#import-state-input").addEventListener("change", (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) importStateFromFile(file);
      });
      $("#load-active-button").addEventListener("click", loadActiveState);
      $("#tour-close").addEventListener("click", closeTour);
      $("#tour-back").addEventListener("click", () => moveTour(-1));
      $("#tour-next").addEventListener("click", () => moveTour(1));
      window.addEventListener("resize", () => {
        publishHeaderHeight();
        if (tourState) positionTour(findTourTarget(tourState.steps[tourState.index]));
      });
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
      $("#sim-dialog-close").addEventListener("click", closeSimDialog);
      $("#sim-dialog").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) closeSimDialog();
      });
      $("#sim-dialog").addEventListener("close", () => {
        clearInterval(simPollTimer);
        simPollTimer = null;
      });
    } catch (error) {
      $("#view-compare").innerHTML = `<div class="empty-state"><h3>Could not start the Deck Matrix</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  init();
})();
