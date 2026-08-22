(() => {
  "use strict";

  const STORAGE_KEY = "mtg-deck-matrix-state-v1";
  const LEGACY_PICKS_KEY = "mtg-variant-picks";
  const EMAIL_TO = "robminor3@gmail.com";
  const STAGES = ["Base", "Tuned", "Maxed"];

  let catalog;
  let buyCatalog;
  let state;
  let toastTimer;
  let openDeckId = 1;
  let openBuyDeckId = 1;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  const icon = (glyph) => `<span class="ui-icon" aria-hidden="true">${esc(glyph)}</span>`;
  const money = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? `$${Number(value).toFixed(2)}` : "Price varies";
  const variantById = (id) => catalog.variants.find((variant) => variant.id === id);

  function blankState() {
    return {
      compareSelections: {},
      stages: {},
      rankStages: {},
      buySelections: {},
      found: {},
      shopFilters: { status: "need", type: "all", category: "all", deck: "all", query: "" }
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
          stages: saved.stages || {},
          rankStages: saved.rankStages || {},
          buySelections: saved.buySelections || {},
          found: saved.found || {},
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
      <div id="deck-groups"></div>`;

    const groups = $("#deck-groups", root);
    catalog.decks.forEach((deck) => {
      const chosenId = state.compareSelections[deck.id];
      const rankStage = Number(state.rankStages[deck.id] || 2);
      const variants = catalog.variants
        .filter((variant) => variant.deckId === deck.id)
        .sort((a, b) => (a.ranks?.[rankStage - 1] || a.order) - (b.ranks?.[rankStage - 1] || b.order));
      const details = document.createElement("details");
      details.className = "deck-group";
      details.open = deck.id === openDeckId;
      details.innerHTML = `
        <summary>
          <span class="deck-number">${deck.id}</span>
          <span class="deck-summary-copy"><strong>${esc(deck.title)}</strong><span>${chosenId ? `Picked: ${esc(variantById(chosenId).name)}` : "Choose one of five variants"}</span></span>
          <span class="deck-chevron" aria-hidden="true">›</span>
        </summary>
        <p class="deck-objective">${esc(deck.objective)} <span class="swipe-hint">Swipe cards sideways →</span></p>
        <div class="rank-order" role="group" aria-label="Sort Deck ${deck.id} variants by stage ranking">
          <span>Rank order</span>
          ${STAGES.map((label, index) => `<button class="rank-order-button${rankStage === index + 1 ? " is-active" : ""}" data-rank-stage="${index + 1}">${label}</button>`).join("")}
        </div>
        <div class="variant-track"></div>`;
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
  }

  function makeVariantCard(variant, rankStage = 2) {
    const stage = Number(state.stages[variant.id] || 2);
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
      <div class="rank-badge rank-${rank}" aria-label="Rank ${rank} of 5 for ${STAGES[rankStage - 1]}"><span>#${rank}</span><small>${STAGES[rankStage - 1]} rank</small></div>
      <div class="variant-hero">
        <img src="${esc(variant.image)}" alt="${esc(variant.commander)} card" loading="lazy">
        <div>
          <div class="variant-tags">${variant.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
          <h3>${esc(variant.name)}</h3>
          <p class="commander">${esc(variant.commander)}<br><span class="mana">${esc(variant.manaCost)} · ${esc(variant.typeLine)}</span></p>
        </div>
      </div>
      <div class="stage-switch" role="group" aria-label="Investment level">
        ${STAGES.map((label, index) => `<button class="stage-button${stage === index + 1 ? " is-active" : ""}" data-stage="${index + 1}">${label}</button>`).join("")}
      </div>
      <div class="stage-content">
        <div class="metric-grid">
          <div class="metric-tile cost-metric">${icon("$")}<span>Build cost</span><strong>${esc(variant.costs[stage - 1] || "Varies")}</strong></div>
          <div class="metric-tile bracket-metric">${icon("B")}<span>Power level</span><strong>${esc(bracket.label || "Profile")}</strong></div>
          <div class="metric-tile budget-metric">${icon("✓")}<span>Budget</span><strong>${esc(facts.budget || "Varies")}</strong></div>
          <div class="metric-tile rarity-metric" title="${esc(rarity.description || "")}">${icon("◇")}<span>Rarity</span><strong>${esc(rarity.percent || "—")} · ${esc(rarity.label || "")}</strong></div>
        </div>
        <div class="availability-line">${icon("●")}<span>${esc(facts.availability || "Availability varies")}</span><b class="${bracket.gameChangers && !bracket.gameChangers.startsWith("0") ? "has-gc" : ""}">${esc(bracket.gameChangers || "0 GC")}</b></div>
        <section class="build-promise">
          <h4>${icon("→")}What this build does</h4>
          <ul>${summary.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </section>
        <p class="stage-note">${icon("i")}<span>${esc(variant.stageNotes[stage - 1] || bracket.description || "")}</span></p>
        <div class="score-heading">${icon("✦")}<span>Scoring profile</span></div>
        <div class="score-columns">
          ${scorePanel("Your playstyle fit", playstyle)}
          ${scorePanel("Engine rating", engine)}
        </div>
        ${scorePanel("Room to grow", growth, "growth-panel")}
        <button class="detail-button" type="button">View full detail →</button>
      </div>`;

    $("img", card).addEventListener("error", (event) => {
      event.currentTarget.alt = `${variant.commander} image unavailable`;
      event.currentTarget.style.visibility = "hidden";
    });
    $(".pick-control input", card).addEventListener("change", () => selectVariant(variant));
    $(".detail-button", card).addEventListener("click", () => openVariantDetail(variant, stage));
    $$(".stage-button", card).forEach((button) => button.addEventListener("click", () => {
      state.stages[variant.id] = Number(button.dataset.stage);
      saveState();
      renderCompare();
      const refreshed = $(`[data-variant="${variant.id}"]`);
      refreshed?.scrollIntoView({block: "nearest", inline: "center"});
    }));
    return card;
  }

  function scorePanel(title, rows, extraClass = "") {
    const glyph = title.includes("playstyle") ? "♥" : title.includes("Engine") ? "⚙" : "↗";
    return `<section class="score-panel ${extraClass}"><h4>${icon(glyph)}${esc(title)}</h4><div class="score-grid">${rows.map((row) => `
      <div class="score-row" title="${esc(row.description || "")}">
        <span>${esc(row.label)}</span>
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
    $("#detail-sheet-body").innerHTML = variant.detailHtml || `<p>No extended report is available.</p>`;
    decorateRichContent($("#detail-sheet-body"));
    dialog.showModal();
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
      ...picks.map((variant) => `${variant.deckId} - ${variant.name}`)
    ].join("\n");
    window.location.href = `mailto:${EMAIL_TO}?subject=${encodeURIComponent("My choices")}&body=${encodeURIComponent(body)}`;
  }

  function ensureBuyState(variantId) {
    if (!state.buySelections[variantId]) state.buySelections[variantId] = {enhance: [], max: []};
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
          <p>Required tune-ups are included automatically. Add budget Enhances or deliberate Max options only when you want them.</p>
        </div>
        <div class="selection-meter"><strong>${readyCount}/${selected.length || 0}</strong><span>profiles ready</span></div>
      </div>
      ${selected.length ? "" : `<div class="empty-state"><h3>No deck picks yet</h3><p>Choose a variant in Compare first, then come back here.</p><button class="primary-button" data-go="compare">Choose decks</button></div>`}
      ${selected.some((variant) => !buyCatalog.plans[variant.id]) ? `<div class="coverage-note"><h3>Catalog build in progress</h3><p>The original shopping guide contained six complete builds. Those are connected now; the remaining variant profiles are being normalized before they are offered as purchases.</p></div>` : ""}
      ${readyCount ? `<section class="buy-overview"><h3>Shopping plan summary</h3><div class="buy-overview-grid">${selected.filter((variant) => buyCatalog.plans[variant.id]).map((variant) => {
        const plan = buyCatalog.plans[variant.id];
        return `<button class="buy-overview-card" data-open-buy-deck="${variant.deckId}"><b>Deck ${variant.deckId}</b><strong>${esc(variant.name)}</strong><span>${esc(plan.priorityLabel || plan.budgetLabel)} · ${plan.required.length} required upgrades</span></button>`;
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
    const optionalCount = current ? (current.enhance?.length || 0) + (current.max?.length || 0) : 0;
    const details = document.createElement("details");
    details.className = "buy-deck";
    details.open = variant.deckId === openBuyDeckId;
    details.innerHTML = `
      <summary>
        <span class="deck-number">${variant.deckId}</span>
        <span class="buy-deck-title"><strong>${esc(variant.name)}</strong><span>${plan ? `${plan.required.length} required · ${optionalCount} optional picked` : esc(variant.commander)}</span></span>
        <span class="${plan ? "profile-ready" : "profile-gap"}">${plan ? "Connected" : "Pending"}</span>
      </summary>
      <div class="buy-body"></div>`;
    details.addEventListener("toggle", () => {
      if (!details.open) return;
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
      <details class="plan-analysis">
        <summary><span>${icon("☰")}Deck plan &amp; analysis</span><small>How to play, buy order, bracket placement, and tuning notes</small></summary>
        <div class="legacy-plan">${plan.planHtml || ""}</div>
      </details>
      ${buySection("Starting shell", "Included automatically", [plan.precon], "precon", current, variant.id)}
      ${buySection("Upgrade", "Required for the tuned build", plan.required, "required", current, variant.id)}
      ${buySection("Enhance", "Optional · same strategy · generally $10 or less", plan.enhance, "enhance", current, variant.id)}
      ${buySection("Max", "Optional ceiling choices · up to 3 Game Changers", plan.max, "max", current, variant.id)}`;
    $$('input[data-buy-kind]', body).forEach((checkbox) => checkbox.addEventListener("change", () => {
      const kind = checkbox.dataset.buyKind;
      const itemId = checkbox.dataset.itemId;
      const choices = new Set(ensureBuyState(variant.id)[kind] || []);
      const item = (plan[kind] || []).find((candidate) => candidate.id === itemId);
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
    }));
    $$(".buy-item-detail", body).forEach((button) => button.addEventListener("click", () => {
      const kind = button.dataset.itemKind;
      const item = kind === "precon" ? plan.precon : (plan[kind] || []).find((candidate) => candidate.id === button.dataset.itemId);
      if (item) openBuyItemDetail(item, variant, kind);
    }));
    return details;
  }

  function buySection(title, note, items, kind, current, variantId) {
    if (!items?.length) return "";
    const included = kind === "required" || kind === "precon";
    const glyph = kind === "precon" ? "▣" : kind === "required" ? "✓" : kind === "enhance" ? "+" : "✦";
    return `<details class="buy-section" ${included ? "open" : ""}>
      <summary><span>${icon(glyph)}${esc(title)} <b>${items.length}</b></span><small>${esc(note)}</small></summary>
      ${items.map((item) => {
        const required = included;
        const checked = required || (current[kind] || []).includes(item.id);
        return `<div class="buy-item">
          ${required ? `<span class="required-check" aria-label="Included">✓</span>` : `<input type="checkbox" ${checked ? "checked" : ""} data-buy-kind="${esc(kind)}" data-item-id="${esc(item.id)}" data-variant-id="${esc(variantId)}">`}
          <button class="buy-item-detail" type="button" data-item-kind="${esc(kind)}" data-item-id="${esc(item.id)}">
            <img src="${esc(item.image)}" alt="" loading="lazy">
            <span class="buy-copy">
              <span class="buy-item-eyebrow"><span class="kind-label ${esc(kind)}">${esc(kind === "required" ? "upgrade" : kind)}</span>${item.gameChanger ? `<span class="gc-mini">✦ Game Changer</span>` : ""}</span>
              <strong>${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</strong>
              <small>${esc(item.replaces || item.purpose || item.typeLine || "")}</small>
            </span>
          </button>
          <span class="price">${money(item.price)}</span>
        </div>`;
      }).join("")}
    </details>`;
  }

  function openBuyItemDetail(item, variant, kind) {
    const dialog = $("#detail-sheet");
    const brief = item.brief || {};
    const plan = buyCatalog.plans[variant.id];
    $("#detail-sheet-image").src = item.image.replace("version=small", "version=normal");
    $("#detail-sheet-image").alt = `${item.name} card`;
    $("#detail-sheet-kicker").textContent = `Deck ${variant.deckId} · ${kind === "required" ? "Upgrade" : STAGES.includes(kind) ? kind : kind[0].toUpperCase() + kind.slice(1)}`;
    $("#detail-sheet-title").textContent = item.name;
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
        <div class="legacy-plan">${plan?.planHtml || "<p>No extended plan is available.</p>"}</div>
      </section>
      ${item.tcgplayerUrl ? `<p><a class="primary-button detail-link" href="${esc(item.tcgplayerUrl)}" target="_blank" rel="noopener">Find this precon on TCGplayer</a></p>` : ""}`
      : `
      <div class="item-meta"><span>${esc(item.manaCost || "")}</span><span>${esc(item.typeLine || "")}</span><span>${money(item.price)}${item.ceiling ? ` · ceiling ${money(item.ceiling)}` : ""}</span></div>
      ${item.gameChanger ? `<p class="gc-callout">Game Changer · counts toward this deck’s limit of three in Bracket 3.</p>` : ""}
      ${item.replaces ? `<section class="detail-block"><h3>Replaces</h3><p>${esc(item.replaces)}</p></section>` : ""}
      ${detailText("Why this card", item.whyPrimary || item.why || item.purpose)}
      ${detailText("Why it is optional", item.whyOptional)}
      ${detailText("Alternate rationale", item.alternateReason)}
      ${detailText("Tradeoff", item.alternateTradeoff)}
      ${(brief.power || brief.ease || brief.fun) ? `<section class="detail-block"><h3>Card scoring</h3><div class="brief-scores">
        ${briefScore("Power", brief.power)}${briefScore("Ease", brief.ease)}${briefScore("Fun", brief.fun)}
      </div><div class="brief-insights">${brief.value ? `<p>${icon("$")}<span><b>Value</b>${esc(brief.value)}</span></p>` : ""}${brief.fit ? `<p>${icon("→")}<span><b>Fit</b>${esc(brief.fit)}</span></p>` : ""}</div></section>` : ""}
      ${item.tags?.length ? `<section class="detail-block"><h3>Roles</h3><div class="variant-tags">${item.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div></section>` : ""}
      ${detailText("Where to buy", item.whereToBuy)}
      ${item.tcgplayerUrl ? `<p><a class="primary-button detail-link" href="${esc(item.tcgplayerUrl)}" target="_blank" rel="noopener">Search this card on TCGplayer</a></p>` : ""}`;
    decorateRichContent($("#detail-sheet-body"));
    dialog.showModal();
  }

  function decorateRichContent(root) {
    const sectionMap = [
      [/commander/i, "♛", "forest"], [/rarity/i, "◇", "blue"], [/precon seed/i, "▣", "gold"],
      [/key upgrades/i, "↗", "gold"], [/how it plays|how to play/i, "▶", "forest"], [/ratings|scoring/i, "✦", "blue"],
      [/what keith said/i, "“", "gold"], [/room to grow/i, "↥", "forest"], [/bracket/i, "B", "red"],
      [/buy order/i, "#", "gold"], [/trackers|counters needed/i, "◌", "blue"], [/pros/i, "+", "forest"],
      [/cons/i, "−", "red"], [/strengths/i, "◆", "forest"], [/weaknesses/i, "!", "red"],
      [/stretch cards/i, "↗", "gold"], [/top of bracket/i, "✦", "red"], [/why/i, "→", "forest"],
      [/replaces/i, "⇄", "blue"], [/tradeoff/i, "±", "gold"], [/roles/i, "◆", "blue"], [/(where|how) to buy/i, "$", "gold"]
    ];
    $$(".blk, .legacy-plan .panel, .detail-block", root).forEach((section) => {
      const heading = $("h3, h4", section);
      if (!heading) return;
      const match = sectionMap.find(([pattern]) => pattern.test(heading.textContent));
      section.classList.add("rich-section");
      section.dataset.tone = match?.[2] || "neutral";
      if (match && !$(".ui-icon", heading)) heading.insertAdjacentHTML("afterbegin", icon(match[1]));
    });
    $$(".method", root).forEach((paragraph) => paragraph.classList.add("info-note"));
    $$(".flag", root).forEach((flag) => flag.classList.add("warning-note"));
    $$("ul", root).forEach((list) => list.classList.add("rich-list"));
  }

  function detailText(title, value) {
    return value ? `<section class="detail-block"><h3>${esc(title)}</h3><p>${esc(value)}</p></section>` : "";
  }

  function briefScore(label, value) {
    if (!value) return "";
    return `<div><span>${esc(label)}</span><b>${esc(value)}/5</b><span class="score-dots">${[1,2,3,4,5].map((dot) => `<i class="${dot <= value ? "is-on" : ""}"></i>`).join("")}</span></div>`;
  }

  function itemKey(item) {
    return item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function derivedShopItems() {
    const merged = new Map();
    selectedVariants().forEach((variant) => {
      const plan = buyCatalog.plans[variant.id];
      if (!plan) return;
      const current = ensureBuyState(variant.id);
      const selectedEnhance = new Set(current.enhance || []);
      const selectedMax = new Set(current.max || []);
      const items = [
        plan.precon,
        ...plan.required,
        ...plan.enhance.filter((item) => selectedEnhance.has(item.id)),
        ...plan.max.filter((item) => selectedMax.has(item.id))
      ];
      items.forEach((item) => {
        const key = itemKey(item);
        if (!merged.has(key)) {
          merged.set(key, {...item, key, deckRefs: [], categories: new Set(), quantity: 0});
        }
        const target = merged.get(key);
        if (!target.deckRefs.some((ref) => ref.deckId === variant.deckId)) {
          target.deckRefs.push({deckId: variant.deckId, name: variant.name});
          target.quantity += item.quantity || 1;
        }
        target.categories.add(item.category);
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
    const activeFilterCount = [filters.type, filters.category, filters.deck].filter((value) => value !== "all").length;
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
              ${selectFilter("category", "Level", [["all","All levels"],["upgrade","Upgrade"],["enhance","Enhance"],["max","Max"]], filters)}
              ${selectFilter("deck", "Deck", [["all","All decks"], ...selectedVariants().map((variant) => [String(variant.deckId), `Deck ${variant.deckId}`])], filters)}
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
    const remainingTotal = allItems.filter((item) => !state.found[item.key]).reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    $("#shop-summary", root).innerHTML = `<span><strong>${visible.length}</strong> shown · ${allItems.length - foundCount} still needed</span><span>${money(remainingTotal)} target</span>`;
    const list = $("#shop-list", root);
    list.replaceChildren(...visible.map((item) => makeShopCard(item)));
    $("#shop-actions", root).innerHTML = allItems.length
      ? `<div class="action-row"><button class="secondary-button" data-go="buy">Adjust Buy Picks</button></div>`
      : `<div class="empty-state"><h3>Your field list is empty</h3><p>Select connected deck variants and save their Buy Picks first.</p><button class="primary-button" data-go="buy">Open Buy Picks</button></div>`;
  }

  function matchesFilters(item, filters) {
    const found = Boolean(state.found[item.key]);
    if (filters.status === "need" && found) return false;
    if (filters.status === "found" && !found) return false;
    if (filters.type === "singles" && item.category === "precon") return false;
    if (filters.type === "precons" && item.category !== "precon") return false;
    if (filters.category !== "all" && !item.categories.has(filters.category)) return false;
    if (filters.deck !== "all" && !item.deckRefs.some((ref) => String(ref.deckId) === filters.deck)) return false;
    const query = filters.query.trim().toLowerCase();
    if (query && !`${item.name} ${item.typeLine} ${item.purpose} ${item.deckRefs.map((ref) => ref.name).join(" ")}`.toLowerCase().includes(query)) return false;
    return true;
  }

  function makeShopCard(item) {
    const found = Boolean(state.found[item.key]);
    const card = document.createElement("article");
    card.className = `shop-card${found ? " is-found" : ""}`;
    const categories = Array.from(item.categories);
    card.innerHTML = `
      <button class="shop-image-button" aria-label="View a larger image of ${esc(item.name)}">
        <img class="shop-image" src="${esc(item.image)}" alt="${esc(item.name)} card" loading="lazy">
      </button>
      <div class="shop-main">
        <div class="shop-card-kicker">${icon(item.category === "precon" ? "▣" : "✦")}<span>${esc(item.category === "precon" ? "Sealed deck" : "Single card")}</span></div>
        <h3>${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</h3>
        <div class="shop-facts">${item.manaCost ? `<span>${esc(item.manaCost)}</span>` : ""}${item.typeLine ? `<span>${esc(item.typeLine)}</span>` : ""}<strong>${money(item.price)}</strong></div>
        <p class="shop-purpose">${icon("→")}<span>${esc(item.purpose || item.replaces || "")}</span></p>
        <div class="shop-refs"><span>Needed by</span>${item.deckRefs.map((ref) => `<b>Deck ${ref.deckId}</b>`).join("")}</div>
        <div class="shop-bottom">
          <div class="shop-badges">${categories.map((category) => `<span class="shop-badge ${esc(category)}">${esc(category)}</span>`).join("")}${item.gameChanger ? `<span class="shop-badge gc">GC</span>` : ""}</div>
          <button class="found-button">${found ? "✓ Found" : "Mark found"}</button>
        </div>
      </div>`;
    $("img", card).addEventListener("error", (event) => {
      event.currentTarget.alt = `${item.name} image unavailable`;
      event.currentTarget.style.visibility = "hidden";
    });
    $(".shop-image-button", card).addEventListener("click", () => openCardPreview(item));
    $(".found-button", card).addEventListener("click", () => {
      state.found[item.key] = !found;
      saveState(!found ? `${item.name} marked found` : `${item.name} returned to Need`);
      renderShop();
    });
    return card;
  }

  function openCardPreview(item) {
    const dialog = $("#card-preview");
    $("#card-preview-image").src = item.image.replace("version=small", "version=normal");
    $("#card-preview-image").alt = `${item.name} card`;
    $("#card-preview-title").textContent = item.name;
    $("#card-preview-meta").textContent = [item.manaCost, item.typeLine, money(item.price)].filter(Boolean).join(" · ");
    dialog.showModal();
  }

  function resetState() {
    if (!window.confirm("Reset all deck picks, optional buys, and Found checkmarks on this device?")) return;
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
      renderCompare();
      $$(".main-tab").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
      $("#reset-button").addEventListener("click", resetState);
      $("#card-preview-close").addEventListener("click", () => $("#card-preview").close());
      $("#card-preview").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      });
      $("#detail-sheet-close").addEventListener("click", () => $("#detail-sheet").close());
      $("#detail-sheet").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      });
    } catch (error) {
      $("#view-compare").innerHTML = `<div class="empty-state"><h3>Could not start the Deck Matrix</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  init();
})();
