(() => {
  "use strict";

  const STORAGE_KEY = "mtg-deck-matrix-state-v1";
  const LEGACY_PICKS_KEY = "mtg-variant-picks";
  const EMAIL_TO = "robminor3@gmail.com";
  const STAGES = ["Base", "Tuned", "Maxed"];
  const STAGE_DEFINITIONS = [
    "Base: the starting shell or preconstructed deck before targeted purchases. It shows the theme as it works straight out of the box.",
    "Tuned: the recommended practical build after the listed core purchases. This is the level where the variant should deliver its strategy reliably.",
    "Maxed: the full upgrade ceiling, including the advanced ladder and up to three Game Changers. It represents the top legal end of Bracket 3."
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
  let state;
  let toastTimer;
  let openDeckId = 1;
  let openBuyDeckId = 1;
  let openCommentId = null;
  let tourState = null;
  let activeTooltipTarget = null;
  let shopMetadataPromise = null;
  let cardMetadata = {};
  try { cardMetadata = JSON.parse(localStorage.getItem("mtg-card-metadata-v1") || "{}"); } catch (_) {}

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
      compareSelections: {},
      rankStages: {},
      buySelections: {},
      found: {},
      comments: {},
      compareFilters: {query: "", mechanic: "all", playstyle: "all", profileStage: "2"},
      shopFilters: { status: "need", type: "all", category: "all", deck: "all", groupBy: "none", query: "" }
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
          compareSelections: saved.compareSelections || {},
          rankStages: saved.rankStages || {},
          buySelections: saved.buySelections || {},
          found: saved.found || {},
          comments: saved.comments || {},
          compareFilters: {...initial.compareFilters, ...(saved.compareFilters || {})},
          shopFilters: {...initial.shopFilters, ...(saved.shopFilters || {})}
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
    if (view === "buy") renderBuy();
    if (view === "shop") renderShop();
    if (focus) {
      window.scrollTo({top: 0, behavior: "smooth"});
      $("#app").focus({preventScroll: true});
    }
  }

  function renderCompare() {
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
          <h2 id="compare-title">Choose your six</h2>
          <p>Open each deck role, compare its five approaches, and pick one. Your choices stay private on this device.</p>
        </div>
        <div class="selection-meter"><strong>${selected.length}/6</strong><span>decks selected</span></div>
      </div>
      <div class="action-row">
        <button class="primary-button" id="save-picks" ${selected.length ? "" : "disabled"}>Save Picks → Buy Picks</button>
        <button class="secondary-button" id="email-picks" ${selected.length ? "" : "disabled"}>Email selections</button>
      </div>
      <section class="compare-filter-panel">
        <div class="compare-filter-heading"><div>${icon("⌕")}<span><b>Find a variant</b><small>${visibleTotal} of 30 shown${activeFilterCount ? ` · ${activeFilterCount} active filters` : ""}</small></span></div>${activeFilterCount ? `<button id="clear-compare-filters">Clear</button>` : ""}</div>
        <div class="compare-filter-grid">
          <label class="compare-search"><span>Search</span><input id="compare-search" type="search" value="${esc(filters.query)}" placeholder="Commander, role, tag, or text…"></label>
          ${compareSelect("mechanic", "Mechanic", [["all","All mechanics"], ...mechanics.map((value) => [value,value])], filters.mechanic)}
          ${compareSelect("playstyle", "Play style", [["all","All play styles"], ...playstyles.map((value) => [value,`${value} · 4+`])], filters.playstyle)}
          ${compareSelect("profileStage", "Score stage", [["1","Base"],["2","Tuned"],["3","Maxed"]], filters.profileStage)}
        </div>
      </section>
      <div id="deck-groups"></div>`;

    const groups = $("#deck-groups", root);
    catalog.decks.forEach((deck) => {
      const chosenId = state.compareSelections[deck.id];
      const rankStage = Number(state.rankStages[deck.id] || 2);
      const variants = catalog.variants
        .filter((variant) => variant.deckId === deck.id)
        .filter(matchesCompareFilters)
        .sort((a, b) => (a.ranks?.[rankStage - 1] || a.order) - (b.ranks?.[rankStage - 1] || b.order));
      const details = document.createElement("details");
      details.className = "deck-group";
      details.open = deck.id === openDeckId;
      details.innerHTML = `
        <summary>
          <span class="deck-number">${deck.id}</span>
          <span class="deck-summary-copy"><strong>${esc(deck.title)}</strong><span>${chosenId ? `Picked: ${esc(variantById(chosenId).name)} · ` : ""}${variants.length} of 5 shown</span></span>
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
      $("#compare-search")?.focus();
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
        <div class="score-heading">${sectionIcon("scoring")}<span>Scoring profile</span></div>
        <div class="score-columns">
          ${scorePanel("Your playstyle fit", playstyle)}
          ${scorePanel("Engine rating", engine)}
        </div>
        ${scorePanel("Room to grow", growth, "growth-panel")}
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

  function scorePanel(title, rows, extraClass = "") {
    const iconName = title.includes("playstyle") ? "fit" : title.includes("Engine") ? "engine" : "roomGrow";
    const definition = title.includes("playstyle") ? TOOLTIP_DEFINITIONS.playstyle : title.includes("Engine") ? TOOLTIP_DEFINITIONS.engine : TOOLTIP_DEFINITIONS.roomGrow;
    const rowDefinitions = rows.map((row) => `${row.label}: ${row.description || "No additional definition supplied."}`).join("\n");
    return `<section class="score-panel ${extraClass}"><h4 ${tooltipAttributes(`${definition}\n\n${rowDefinitions}`)}>${sectionIcon(iconName)}${esc(title)}</h4><div class="score-grid">${rows.map((row) => `
      <div class="score-row">
        <span ${tooltipAttributes(`${row.label}: ${row.description || "This score is specific to the selected deck and stage."}`, "score-label")}>${esc(row.label)}</span>
        <span class="score-dots" aria-label="${row.score} out of 5">${[1,2,3,4,5].map((dot) => `<i class="${dot <= row.score ? "is-on" : ""}"></i>`).join("")}</span>
        ${row.extra ? `<b>${esc(row.extra)}</b>` : ""}
      </div>`).join("")}</div></section>`;
  }

  function openVariantDetail(variant, stage) {
    const dialog = $("#detail-sheet");
    $("#detail-sheet-image").src = variant.image;
    $("#detail-sheet-image").alt = `${variant.commander} card`;
    $("#detail-sheet-kicker").textContent = `Deck ${variant.deckId} · ${STAGES[stage - 1]} rank #${variant.ranks?.[stage - 1] || variant.order}`;
    $("#detail-sheet-title").textContent = variant.name;
    $("#detail-sheet-context").innerHTML = "";
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

  function organizeVariantDetail(root, variant) {
    const commanderSection = detailSectionByHeading(root, /^Commander$/i);
    if (commanderSection) {
      const cells = $$("tr.cmdr td", commanderSection);
      const commanderName = cells[0]?.textContent.trim() || variant.commander;
      const commanderCost = cells[1]?.innerHTML || manaCostHtml(variant.manaCost);
      const commanderType = cells[2]?.textContent.trim() || variant.typeLine;
      const commanderEffect = cells[3]?.textContent.trim() || "Open the card image to read the complete rules text.";
      const commanderPrice = cells[4]?.textContent.trim() || "";
      $("#detail-sheet-context").innerHTML = `<section class="detail-aside-commander"><h3>${icon("♛")}Commander</h3><strong>${esc(commanderName)}</strong><div class="aside-commander-meta"><span>${commanderCost}</span>${commanderPrice ? `<b>${esc(commanderPrice)}</b>` : ""}</div><small>${esc(commanderType)}</small>${commanderAbilitiesHtml(commanderEffect)}</section>`;
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
    const existing = state.buySelections[variantId] || {};
    state.buySelections[variantId] = {
      shell: existing.shell || [],
      upgrade: [],
      enhance: Array.from(new Set([...(existing.upgrade || []), ...(existing.enhance || [])])),
      max: existing.max || []
    };
    return state.buySelections[variantId];
  }

  function renderBuy() {
    const root = $("#view-buy");
    const selected = selectedVariants();
    const readyCount = selected.filter((variant) => buyCatalog.plans[variant.id]).length;
    if (!selected.some((variant) => variant.deckId === openBuyDeckId)) openBuyDeckId = selected[0]?.deckId || 1;
    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="buy-title">Build the buy plan</h2>
          <p>Precon Starting Shells and Tuned purchases are included automatically. For singles-built Starting Shells, check the cards you need. Add optional Enhance or Maxxed choices as one-for-one swaps.</p>
        </div>
        <div class="selection-meter"><strong>${readyCount}/${selected.length || 0}</strong><span>profiles ready</span></div>
      </div>
      ${selected.length ? "" : `<div class="empty-state"><h3>No deck picks yet</h3><p>Choose a variant in Compare first, then come back here.</p><button class="primary-button" data-go="compare">Choose decks</button></div>`}
      ${selected.some((variant) => !buyCatalog.plans[variant.id]) ? `<div class="coverage-note"><h3>Selection needs attention</h3><p>One selected variant could not be loaded. Return to Compare and select it again.</p></div>` : ""}
      ${readyCount ? `<section class="buy-overview"><h3>Shopping plan summary</h3><div class="buy-overview-grid">${selected.filter((variant) => buyCatalog.plans[variant.id]).map((variant) => {
        const plan = buyCatalog.plans[variant.id];
        const current = ensureBuyState(variant.id);
        const namedShell = (plan.startingShell || []).filter((card) => !card.isFlexibleSlot);
        const selectedShell = new Set(current.shell || []);
        const shellSummary = isSinglesBuiltShell(plan) ? `${namedShell.filter((card) => selectedShell.has(card.id)).reduce((sum, card) => sum + Number(card.quantity || 1), 0)}/${namedShell.reduce((sum, card) => sum + Number(card.quantity || 1), 0)} shell cards · ` : "";
        return `<button class="buy-overview-card" data-open-buy-deck="${variant.deckId}"><b>Deck ${variant.deckId}</b><strong>${esc(variant.name)}</strong><span>${shellSummary}${esc(plan.priorityLabel || plan.budgetLabel)} · ${plan.required.length} Tuned purchases</span></button>`;
      }).join("")}</div></section>` : ""}
      ${selected.length ? `<div class="action-row action-row-top"><button class="primary-button save-buys">Save Buys → Shop List</button><button class="secondary-button" data-go="compare">Back to Compare</button></div>` : ""}
      <div id="buy-decks"></div>
      ${selected.length ? `<div class="action-row"><button class="primary-button save-buys">Save Buys → Shop List</button><button class="secondary-button" data-go="compare">Back to Compare</button></div>` : ""}`;

    const decksRoot = $("#buy-decks", root);
    selected.forEach((variant) => decksRoot.appendChild(makeBuyDeck(variant)));
    $$('[data-open-buy-deck]', root).forEach((button) => button.addEventListener("click", () => {
      openBuyDeckId = Number(button.dataset.openBuyDeck);
      renderBuy();
      $(`.buy-deck[open]`, root)?.scrollIntoView({behavior: "smooth", block: "start"});
    }));
    $$('[data-go="compare"]', root).forEach((button) => button.addEventListener("click", () => switchView("compare")));
    $$(".save-buys", root).forEach((button) => button.addEventListener("click", () => {
      saveState();
      switchView("shop");
    }));
  }

  function makeBuyDeck(variant) {
    const plan = buyCatalog.plans[variant.id];
    const current = plan ? ensureBuyState(variant.id) : null;
    const optionalCount = current ? (current.upgrade?.length || 0) + (current.enhance?.length || 0) + (current.max?.length || 0) : 0;
    const shellCards = plan && isSinglesBuiltShell(plan) ? (plan.startingShell || []).filter((card) => !card.isFlexibleSlot) : [];
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
      <details class="plan-analysis">
        <summary><span>${icon("☰")}Deck plan &amp; analysis</span><small>How to play, buy order, bracket placement, and tuning notes</small></summary>
        <div class="legacy-plan">${plan.planHtml || variant.detailHtml || ""}</div>
      </details>
      ${startingShellSection(variant, plan, current, variant.id)}
      ${buySection("Tuned", "Required purchases for the Tuned build", plan.required, "tuned", current, variant.id)}
      ${buySection("Enhance", "Optional improvements · same strategy · generally $10 or less", plan.enhance, "enhance", current, variant.id)}
      ${buySection("Maxxed", "Optional ceiling choices · up to 3 Game Changers", plan.max, "max", current, variant.id)}`;
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
      const kind = checkbox.dataset.buyKind;
      const itemId = checkbox.dataset.itemId;
      const choices = new Set(ensureBuyState(variant.id)[kind] || []);
      const collection = kind === "shell" ? (plan.startingShell || []).filter((candidate) => !candidate.isFlexibleSlot) : (plan[kind] || []);
      const item = collection.find((candidate) => candidate.id === itemId);
      if (checkbox.checked && kind === "max" && item?.gameChanger) {
        const selectedGameChangers = plan.max.filter((candidate) => candidate.gameChanger && choices.has(candidate.id)).length;
        if (selectedGameChangers >= 3) {
          checkbox.checked = false;
          showToast("Bracket 3 allows up to three Game Changers in this deck.");
          return;
        }
      }
      checkbox.checked ? choices.add(itemId) : choices.delete(itemId);
      ensureBuyState(variant.id)[kind] = Array.from(choices);
      saveState();
      if (kind === "shell") {
        renderBuy();
        return;
      }
      updateCompliancePanel(body, variant, plan);
      updateBuyTotal(details, plan, ensureBuyState(variant.id));
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
        ensureBuyState(variant.id).shell = selectAllShell.checked ? shellIds : [];
        saveState(selectAllShell.checked ? "Starting Shell selected" : "Starting Shell cleared");
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
    const selectedEnhance = new Set(current?.enhance || []);
    const selectedUpgrade = new Set(current?.upgrade || []);
    const selectedMax = new Set(current?.max || []);
    const purchases = [
      ...(isSinglesBuiltShell(plan)
        ? (plan.startingShell || []).filter((item) => !item.isFlexibleSlot && selectedShell.has(item.id)).map(resolvedShellCard)
        : plan.precon ? [plan.precon] : []),
      ...(plan.required || []),
      ...(plan.upgrade || []).filter((item) => selectedUpgrade.has(item.id)),
      ...(plan.enhance || []).filter((item) => selectedEnhance.has(item.id)),
      ...(plan.max || []).filter((item) => selectedMax.has(item.id))
    ];
    return purchases.reduce((summary, item) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const metadataPrice = Number(cardMetadata[itemKey(item)]?.price);
      const price = Number(item.price) || metadataPrice || 0;
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

  const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "snow-covered plains", "snow-covered island", "snow-covered swamp", "snow-covered mountain", "snow-covered forest"]);

  function isSinglesBuiltShell(plan) {
    return /\bshell \(singles\)$/i.test(String(plan?.precon?.name || ""));
  }

  function resolvedShellCard(card) {
    const metadata = cardMetadata[itemKey(card)] || {};
    return {
      ...card,
      manaCost: card.manaCost || metadata.manaCost || "",
      typeLine: card.typeLine || metadata.typeLine || "Unclassified card",
      image: card.image || metadata.image || "",
      oracleText: card.oracleText || metadata.oracleText || "",
      keywords: card.keywords || metadata.keywords || [],
      price: Number(card.price || metadata.price) || null,
      ceiling: Number(card.ceiling || metadata.ceiling) || null,
      metadataUnavailable: Boolean(metadata.unavailable),
      metadataLoaded: Boolean(metadata.loaded || metadata.price !== undefined)
    };
  }

  function resolvedBuyCard(card) {
    const metadata = cardMetadata[itemKey(card)] || {};
    return {
      ...card,
      manaCost: card.manaCost || metadata.manaCost || "",
      typeLine: card.typeLine || metadata.typeLine || "",
      image: metadata.image || card.image || "",
      oracleText: card.oracleText || metadata.oracleText || "",
      keywords: card.keywords || metadata.keywords || [],
      price: Number(card.price || metadata.price) || null,
      ceiling: Number(card.ceiling || metadata.ceiling) || null
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

  function shellPurchaseRow(card, current, variantId) {
    const image = card.image ? `<img src="${esc(card.image)}" alt="" loading="lazy">` : `<span class="shell-placeholder" aria-hidden="true">?</span>`;
    const checked = (current.shell || []).includes(card.id);
    return `<div class="buy-item constructed-shell-item">
      <input type="checkbox" ${checked ? "checked" : ""} data-buy-kind="shell" data-item-id="${esc(card.id)}" data-variant-id="${esc(variantId)}" aria-label="Add ${esc(card.name)} to the Shop List">
      <button class="buy-item-detail" type="button" data-shell-card-name="${esc(card.name)}">
        ${image}
        <span class="buy-copy">
          <span class="buy-item-eyebrow"><span class="kind-label shell">Starting Shell</span>${card.isCommander ? `<span class="commander-mini">Commander</span>` : ""}</span>
          <strong>${esc(card.name)}${card.quantity > 1 ? ` ×${card.quantity}` : ""}</strong>
          <small>${manaCostHtml(card.manaCost)}${esc(card.typeLine)}</small>
        </span>
      </button>
      <span class="price"><small>Target</small>${card.price ? money(card.price) : card.metadataLoaded ? "Not listed" : "Loading…"}</span>
    </div>`;
  }

  function constructedShellSection(variant, plan, cards, current, variantId) {
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
      return `<details class="constructed-shell-group shell-type-group" ${type === "Creature" ? "open" : ""}>
        <summary><span>${esc(type)}</span><b>${count}</b></summary>
        <div class="constructed-shell-list">${group.map((card) => shellPurchaseRow(card, current, variantId)).join("")}</div>
      </details>`;
    }).join("");
    const selectedCount = named.filter((card) => (current.shell || []).includes(card.id)).reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const allSelected = named.every((card) => (current.shell || []).includes(card.id));
    return `<section class="starting-shell constructed-shell">
      <div class="starting-shell-heading"><span>${icon("▣")}<strong>Starting Shell · Singles to buy</strong><b>${selectedCount}/${namedCount}</b></span><label class="shell-select-all"><input type="checkbox" data-select-shell-all ${allSelected ? "checked" : ""}><span>Select all</span></label></div>
      <p class="shell-source-note constructed-shell-note">This is not a precon. Check the individual cards you need, or use Select all, to add them to the Shop List.</p>
      <div class="constructed-shell-commander"><h4>Commander</h4>${shellPurchaseRow(commander, current, variantId)}</div>
      <div class="constructed-shell-groups">${typeGroups}</div>
      ${flexibleCount ? `<p class="shell-flex-note"><b>${flexibleCount} modeled slot${flexibleCount === 1 ? "" : "s"} still need exact card names.</b> They preserve the 100-card compliance model but are not added to the Shop List until a card is named.</p>` : ""}
    </section>`;
  }

  function startingShellSection(variant, plan, current, variantId) {
    const cards = (plan.startingShell || []).map(resolvedShellCard);
    if (isSinglesBuiltShell(plan)) return constructedShellSection(variant, plan, cards, current, variantId);
    const commander = cards.find((card) => card.isCommander) || cards[0];
    const remaining = cards.filter((card) => card !== commander);
    const remainingCount = remaining.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const groups = new Map();
    remaining.forEach((card) => {
      const type = shellType(card);
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(card);
    });
    const typeOrder = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Other", "Unspecified slots"];
    const cardGroups = typeOrder.filter((type) => groups.has(type)).map((type) => {
      const group = groups.get(type);
      const count = group.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
      return `<details class="shell-type-group"><summary><span>${esc(type)}</span><b>${count}</b></summary><div class="shell-card-list">${group.map(shellCardRow).join("")}</div></details>`;
    }).join("");
    const lands = groups.get("Land") || [];
    const landCount = lands.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
    const landGroup = lands.length ? `<details class="shell-type-group shell-land-group"><summary><span>Lands</span><b>${landCount}</b></summary><div class="shell-land-grid">${lands.map((card) => `<button type="button" class="shell-land-tile" data-shell-card-name="${esc(card.name)}"><div>${card.image ? `<img src="${esc(card.image)}" alt="${esc(card.name)} card" loading="lazy">` : `<span class="shell-placeholder">?</span>`}<b>×${card.quantity}</b></div><span>${esc(card.name)}</span></button>`).join("")}</div></details>` : "";
    return `<section class="starting-shell">
      <div class="starting-shell-heading"><span>${icon("▣")}<strong>Starting Shell</strong><b>100 cards</b></span><small>Included automatically</small></div>
      <button type="button" class="shell-commander" data-shell-card-name="${esc(commander?.name || variant.commander)}"><img src="${esc(commander?.image || variant.image)}" alt="${esc(commander?.name || variant.commander)} card" loading="lazy"><span><small>Commander · always visible · view details</small><strong>${esc(commander?.name || variant.commander)}</strong><span>${manaCostHtml(commander?.manaCost)}${esc(commander?.typeLine || "")}</span></span></button>
      <details class="shell-library"><summary><span>View remaining ${remainingCount} cards</span><small>Nested by card type; lands have their own visual tray</small></summary><div class="shell-library-body">
        ${plan.startingShellKind === "custom-shell" ? `<p class="shell-source-note">The source guide names the retained core; unspecified slots preserve an honest 100-card model without inventing card names.</p>` : `<p class="shell-source-note">Complete published preconstructed decklist${plan.startingShellSource ? ` · <a href="${esc(plan.startingShellSource)}" target="_blank" rel="noopener">official source</a>` : ""}</p>`}
        ${cardGroups}${landGroup}
      </div></details>
    </section>`;
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
    return `<details class="deck-compliance" data-compliance-panel>
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

  function evaluateDeckCompliance(plan, current) {
    const cards = new Map();
    const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const addCard = (item, source) => {
      const key = normalize(item.name);
      const existing = cards.get(key);
      const quantity = Number(item.quantity || 1);
      if (existing) existing.quantity += quantity;
      else cards.set(key, {
        name: item.name,
        quantity,
        typeLine: item.typeLine || cardMetadata[itemKey(item)]?.typeLine || "Unknown",
        tags: item.tags || [],
        isCommander: Boolean(item.isCommander || (item.tags || []).some((tag) => String(tag).toLowerCase() === "commander")),
        gameChanger: Boolean(item.gameChanger),
        isFlexibleSlot: Boolean(item.isFlexibleSlot),
        source
      });
    };
    const removeCard = (target) => {
      const key = normalize(target);
      const existing = cards.get(key);
      if (!existing) return false;
      existing.quantity -= 1;
      if (existing.quantity <= 0) cards.delete(key);
      return true;
    };
    (plan.startingShell || plan.baseCards || []).forEach((card) => addCard(card, "starting shell"));
    const selected = [
      ...(plan.required || []),
      ...(plan.upgrade || []).filter((item) => (current.upgrade || []).includes(item.id)),
      ...(plan.enhance || []).filter((item) => (current.enhance || []).includes(item.id)),
      ...(plan.max || []).filter((item) => (current.max || []).includes(item.id))
    ];
    const purchasesByName = new Map([...plan.required, ...(plan.upgrade || []), ...plan.enhance, ...plan.max].map((item) => [normalize(item.name), item]));
    const replacementUse = new Map();
    const replacementIssues = [];
    selected.forEach((item) => {
      if (cards.has(normalize(item.name))) return;
      const target = String(item.replaces || "").replace(/^(replaces|swaps in for)\s+/i, "").trim();
      if (target) {
        const targetKey = normalize(target);
        const prior = replacementUse.get(targetKey);
        if (prior) replacementIssues.push({card: item.name, rule: `Both ${prior} and ${item.name} replace ${target}`, detail: "Choose only one replacement for that slot."});
        replacementUse.set(targetKey, item.name);
        if (!removeCard(target)) {
          const chained = purchasesByName.get(targetKey);
          const chainedTarget = String(chained?.replaces || "").replace(/^(replaces|swaps in for)\s+/i, "").trim();
          if (!chainedTarget || !removeCard(chainedTarget)) replacementIssues.push({card: item.name, rule: `Replacement target not found: ${target}`, detail: "The selected card adds a slot until a valid cut is chosen."});
        }
      }
      addCard(item, "selected option");
    });

    const included = Array.from(cards.values());
    const total = included.reduce((sum, card) => sum + card.quantity, 0);
    const types = {};
    const typeBucket = (line) => ["Land", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle"].find((type) => String(line).includes(type)) || "Other";
    included.forEach((card) => {
      const bucket = typeBucket(card.typeLine);
      types[bucket] = (types[bucket] || 0) + card.quantity;
    });
    const common = [...replacementIssues];
    if (total !== 100) common.push({card: "Deck list", rule: `Commander requires exactly 100 cards; this selection contains ${total}.`, detail: total < 100 ? `Add or restore ${100 - total} card${100 - total === 1 ? "" : "s"}.` : `Cut ${total - 100} card${total - 100 === 1 ? "" : "s"}.`});
    const commanders = included.reduce((sum, card) => sum + (card.isCommander ? card.quantity : 0), 0);
    if (commanders !== 1) common.push({card: "Commander slot", rule: `Exactly one commander is expected; ${commanders} are identified in the modeled list.`, detail: "Confirm the commander and partner/background configuration."});
    included.filter((card) => card.quantity > 1 && !card.isFlexibleSlot && !BASIC_LANDS.has(normalize(card.name))).forEach((card) => common.push({card: card.name, rule: `Singleton rule: ${card.quantity} copies are modeled.`, detail: "Only basic lands and cards with explicit exceptions may repeat."}));

    const selectedGameChangers = included.filter((card) => card.gameChanger);
    const tagsFor = (card) => (card.tags || []).map((tag) => String(tag).toLowerCase()).join(" ");
    const massLand = included.filter((card) => /mass land|land destruction/.test(tagsFor(card)));
    const extraTurns = included.filter((card) => /extra turn|turn loop/.test(tagsFor(card)));
    const combos = included.filter((card) => /infinite combo|two.card combo/.test(tagsFor(card)));
    const tier2 = [...common];
    selectedGameChangers.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 permits no Game Changers.", detail: "Remove it or evaluate the deck for Tier 3."}));
    combos.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 permits no intentional two-card infinite combo.", detail: "Remove the combo piece or use a higher tier."}));
    massLand.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 permits no mass land denial.", detail: "Replace this effect."}));
    extraTurns.forEach((card) => tier2.push({card: card.name, rule: "Tier 2 should not chain or loop extra turns.", detail: "Keep extra-turn effects sparse and non-repeatable."}));
    const tier3 = [...common];
    if (selectedGameChangers.length > 3) selectedGameChangers.forEach((card) => tier3.push({card: card.name, rule: `Tier 3 allows up to three Game Changers; ${selectedGameChangers.length} are selected.`, detail: "Remove Game Changers until no more than three remain."}));
    included.filter((card) => /early combo/.test(tagsFor(card))).forEach((card) => tier3.push({card: card.name, rule: "Tier 3 permits no intentional early-game two-card infinite combo.", detail: "Remove or slow the combo."}));
    massLand.forEach((card) => tier3.push({card: card.name, rule: "Tier 3 permits no mass land denial.", detail: "Replace this effect."}));
    extraTurns.forEach((card) => tier3.push({card: card.name, rule: "Tier 3 should not chain or loop extra turns.", detail: "Keep extra-turn effects sparse and non-repeatable."}));
    const lands = types.Land || 0;
    const compositionWarnings = [];
    if (lands < 33) compositionWarnings.push(`${lands} lands is below the usual 33–42 starting range; review ramp, curve, and MDFCs before play.`);
    if (lands > 42) compositionWarnings.push(`${lands} lands is above the usual 33–42 starting range; confirm the deck's land-matters plan needs it.`);
    return {cards: included, total, types, tier2, tier3, compositionWarnings, selectedGameChangers};
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
    const included = kind === "tuned" || kind === "precon";
    const glyph = kind === "precon" ? "▣" : kind === "tuned" ? "✓" : kind === "upgrade" ? "↗" : kind === "enhance" ? "+" : "✦";
    return `<details class="buy-section" ${included ? "open" : ""}>
      <summary><span>${icon(glyph)}${esc(title)} <b>${items.length}</b></span><small>${esc(note)}</small></summary>
      ${items.map((item) => {
        const required = included;
        const checked = required || (current[kind] || []).includes(item.id);
        const impact = kind === "enhance" ? enhancementImpact(item) : null;
        const replacement = item.replaces ? `<span class="replacement-line"><b${impact ? ` class="replace-impact impact-${impact.key}" title="${esc(impact.label)}" aria-label="Replaces — ${esc(impact.label)}"` : ""}>Replaces</b><span>${esc(item.replaces)}</span></span>` : "";
        return `<div class="buy-item">
          ${required ? `<span class="required-check" aria-label="Included">✓</span>` : `<input type="checkbox" ${checked ? "checked" : ""} data-buy-kind="${esc(kind)}" data-item-id="${esc(item.id)}" data-variant-id="${esc(variantId)}" aria-label="Add ${esc(item.name)} to the Shop List">`}
          <button class="buy-item-detail" type="button" data-item-kind="${esc(kind)}" data-item-id="${esc(item.id)}">
            <img src="${esc(item.image)}" alt="" loading="lazy">
            <span class="buy-copy">
              <span class="buy-item-eyebrow"><span class="kind-label ${esc(kind)}">${esc(kind)}</span>${item.gameChanger ? `<span class="gc-mini">✦ Game Changer</span>` : ""}</span>
              <strong>${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</strong>
              ${replacement}<small>${esc(item.purpose || item.typeLine || "")}</small>
            </span>
          </button>
          <span class="price">${money(item.price)}</span>
        </div>`;
      }).join("")}
    </details>`;
  }

  function openBuyItemDetail(item, variant, kind) {
    item = resolvedBuyCard(item);
    const dialog = $("#detail-sheet");
    const brief = item.brief || {};
    const plan = buyCatalog.plans[variant.id];
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
      ${item.tcgplayerUrl ? `<p><a class="primary-button detail-link" href="${esc(item.tcgplayerUrl)}" target="_blank" rel="noopener">Search this card on TCGplayer</a></p>` : ""}`;
    decorateRichContent($("#detail-sheet-body"), variant);
    $("[data-related-card]", $("#detail-sheet-body"))?.addEventListener("click", (event) => {
      const replacementName = event.currentTarget.dataset.relatedCard;
      const relatedItems = [...(plan?.startingShell || []), ...(plan?.required || []), ...(plan?.enhance || []), ...(plan?.max || [])];
      const related = relatedItems.find((candidate) => itemKey(candidate) === itemKey({name: replacementName}));
      if (related) openBuyItemDetail({...related, whereToBuy: related.whereToBuy || "Already in the starting shell"}, variant, "starting shell");
      else showToast(`${replacementName} is not available in this modeled shell.`);
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
    return item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
        ...plan.required,
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

  function renderShop() {
    const root = $("#view-shop");
    const allItems = derivedShopItems();
    const filters = state.shopFilters;
    const foundCount = allItems.filter((item) => state.found[item.key]).length;
    const activeFilterCount = [filters.type, filters.category, filters.deck].filter((value) => value !== "all").length + (filters.groupBy !== "none" ? 1 : 0);
    root.innerHTML = `
      <div class="page-intro">
        <div>
          <h2 id="shop-title">Shop List</h2>
          <p>A clean, deduplicated list for walking vendor tables. Accessories never appear here.</p>
        </div>
        <div class="selection-meter"><strong>${foundCount}/${allItems.length}</strong><span>items found</span></div>
      </div>
      <div class="shop-toolbar">
        <input class="search-input" id="shop-search" type="search" value="${esc(filters.query)}" placeholder="Search cards…" aria-label="Search shopping list">
        <div class="quick-filter-row" aria-label="Found status">
          <div class="status-chips">${filterChip("status", "all", "All", filters)}${filterChip("status", "need", "Need", filters)}${filterChip("status", "found", "Found", filters)}</div>
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
    const foundCount = allItems.filter((item) => state.found[item.key]).length;
    const remainingTotal = allItems.filter((item) => !state.found[item.key]).reduce((sum, item) => sum + (Number(item.price) || 0) * Number(item.quantity || 1), 0);
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
      const metadata = cardMetadata[itemKey(item)];
      if (item.category !== "precon" && (!metadata || metadata.price === undefined || ((!metadata.rarity || !metadata.oracleText) && !metadata.unavailable))) missingMap.set(itemKey(item), item);
    });
    const missing = Array.from(missingMap.values());
    if (!missing.length || shopMetadataPromise) return shopMetadataPromise;
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
              cardMetadata[itemKey(item)] = {unavailable: true, loaded: true, price: null, ceiling: null};
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
              image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || item.image || "",
              loaded: true,
              price,
              ceiling: price ? Math.round(Math.max(price * 1.25, price + .5) * 100) / 100 : null
            };
          });
        } catch (_) {
          chunk.forEach((item) => { cardMetadata[itemKey(item)] = {unavailable: true, loaded: true, price: null, ceiling: null}; });
        }
        await new Promise((resolve) => setTimeout(resolve, 140));
      }
      localStorage.setItem("mtg-card-metadata-v1", JSON.stringify(cardMetadata));
      shopMetadataPromise = null;
      if ($("#view-shop")?.classList.contains("is-active")) renderShop();
      if ($("#view-buy")?.classList.contains("is-active")) renderBuy();
    })();
    return shopMetadataPromise;
  }

  function ensureShellMetadata(items) {
    return ensureShopMetadata(items.filter((item) => !item.isFlexibleSlot));
  }

  function matchesFilters(item, filters) {
    const found = Boolean(state.found[item.key]);
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
    const found = Boolean(state.found[item.key]);
    const metadata = cardMetadata[itemKey(item)] || {};
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
            <span class="shop-price-half">${sectionIcon("budget")}<span><small>Target</small><strong>${money(item.price)}</strong></span></span>
            <span class="shop-price-half">${sectionIcon("ceiling")}<span><small>Ceiling</small><strong>${item.ceiling ? money(item.ceiling) : "Not listed"}</strong></span></span>
          </div>
        </div>
        <p class="shop-purpose">${sectionIcon("does")}<span>${esc(item.purpose || item.replaces || "")}</span></p>
        <div class="shop-refs"><span>Needed by</span>${item.deckRefs.map((ref) => `<b>Deck ${ref.deckId}</b>`).join("")}</div>
        <div class="shop-bottom">
          <button class="found-button">${found ? "✓ Found" : "Mark found"}</button>
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
    $(".found-button", card).addEventListener("click", () => {
      state.found[item.key] = !found;
      saveState(!found ? `${item.name} marked found` : `${item.name} returned to Need`);
      renderShop();
    });
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
    compare: [
      {view: "compare", selectors: [".main-tabs"], title: "A three-part review journey", copy: "Compare approaches, test a complete 100-card arrangement in Buy Picks, then turn the result into a table-ready Shop List."},
      {view: "compare", selectors: [".compare-filter-panel"], title: "Find the kind of deck you want", copy: "Search or filter by mechanic and play style. Only matching variants remain visible inside each deck row."},
      {view: "compare", selectors: [".deck-group:first-of-type > summary"], title: "Review one strategy at a time", copy: "Each row represents one deck role. Open it to see the objective and every competing arrangement."},
      {view: "compare", selectors: [".deck-group:first-of-type .rank-order"], title: "Change the ranking lens", copy: "Rank cards left-to-right for Base, Tuned, or Maxed play. A reviewer can see whether a recommendation holds up as investment increases."},
      {view: "compare", selectors: [".deck-group:first-of-type .variant-card"], title: "Explore the full evidence", copy: "Slide through the variants, change Base/Tuned/Maxed detail, inspect scores, and open the full report and commander art."},
      {view: "compare", selectors: [".deck-group:first-of-type .comment-toggle"], title: "Leave feedback where it belongs", copy: "Attach a comment directly to a variant. When selections are emailed, the reviewer’s comments travel with them."},
      {view: "buy", selectors: [".buy-overview", ".page-intro"], title: "See the chosen plans together", copy: "Buy Picks carries over each selected variant and shows how many Tuned purchases and optional swaps are involved."},
      {view: "buy", selectors: [".deck-compliance", ".empty-state"], title: "Experiment without losing the rules", copy: "The compact check follows card count, composition, and tracked Tier 2–3 limits while you try different arrangements."},
      {view: "buy", selectors: [".starting-shell", ".buy-section", ".empty-state"], title: "Build from a real 100-card shell", copy: "The commander stays visible. Expand the nested shell, then test Tuned, Enhance, and Maxxed one-for-one replacements."},
      {view: "shop", selectors: [".shop-toolbar", ".empty-state"], title: "Finish with a vendor-table checklist", copy: "Search, filter, group, inspect larger card art, compare target and ceiling prices, and mark cards Found. You can restart a page-specific Tour here anytime."}
    ],
    buy: [
      {view: "buy", selectors: [".page-intro"], title: "Test the selected arrangements", copy: "This page turns Compare selections into complete 100-card configurations and explicit purchases."},
      {view: "buy", selectors: [".buy-overview", ".empty-state"], title: "Jump between deck plans", copy: "Use the summary to move quickly among selected decks and compare the size of each Tuned package."},
      {view: "buy", selectors: [".deck-compliance", ".empty-state"], title: "Keep the rules close", copy: "Tier 2, Tier 3, and exact card count stay compact; expand the check for composition and detailed issues."},
      {view: "buy", selectors: [".plan-analysis", ".empty-state"], title: "Read the full strategy", copy: "The analysis preserves how to play, buy order, bracket reasoning, stretch cards, and top-of-bracket options."},
      {view: "buy", selectors: [".starting-shell", ".empty-state"], title: "Inspect the 100-card foundation", copy: "The commander never collapses. The other 99 cards are nested by type, with lands in their own visual tray."},
      {view: "buy", selectors: [".buy-section", ".empty-state"], title: "Try one-for-one changes", copy: "Tuned purchases are included; optional Enhance and Maxxed cards each name the card they replace."}
    ],
    shop: [
      {view: "shop", selectors: [".page-intro"], title: "Your table-ready list", copy: "Only purchases from the selected deck arrangements appear here, deduplicated across decks."},
      {view: "shop", selectors: [".shop-toolbar", ".empty-state"], title: "Search and filter quickly", copy: "Narrow by need/found status, purchase level, deck, or card type while walking a vendor floor."},
      {view: "shop", selectors: [".more-filters", ".empty-state"], title: "Group the way you shop", copy: "Group by table location, rarity, price range, type, theme/set, or number of decks that need the card."},
      {view: "shop", selectors: [".shop-card", ".empty-state"], title: "Use the complete buying card", copy: "Each card shows large art, table location, target and ceiling price, rarity, purpose, and the decks that need it."},
      {view: "shop", selectors: [".found-button", ".empty-state"], title: "Mark progress as you go", copy: "Mark a card Found and the remaining target total updates. Everything stays private on this device."}
    ]
  };

  function activeViewName() {
    return $(".main-tab.is-active")?.dataset.view || "compare";
  }

  function closeTour() {
    tourState = null;
    $("#tour-layer").hidden = true;
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
    $("#tour-progress").textContent = `Reviewer tour · ${tourState.index + 1} of ${tourState.steps.length}`;
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
    tourState = {steps: TOUR_STEPS[view], index: 0};
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
    if (!window.confirm("Reset all deck picks, comments, optional buys, filters, and Found checkmarks on this device?")) return;
    state = blankState();
    saveState("Picks reset");
    renderCompare();
    switchView("compare");
    showToast("Your local picks were reset.");
  }

  async function init() {
    try {
      [catalog, buyCatalog] = await Promise.all([
        fetch("data/variants.json").then((response) => {
          if (!response.ok) throw new Error("Variant catalog did not load");
          return response.json();
        }),
        fetch("data/buy-plans.json").then((response) => {
          if (!response.ok) throw new Error("Buy catalog did not load");
          return response.json();
        })
      ]);
      state = loadState();
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
