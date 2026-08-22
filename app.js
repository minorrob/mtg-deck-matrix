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

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
  const money = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? `$${Number(value).toFixed(2)}` : "Price varies";
  const variantById = (id) => catalog.variants.find((variant) => variant.id === id);

  function blankState() {
    return {
      compareSelections: {},
      stages: {},
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
    catalog.decks.forEach((deck, index) => {
      const chosenId = state.compareSelections[deck.id];
      const variants = catalog.variants.filter((variant) => variant.deckId === deck.id);
      const details = document.createElement("details");
      details.className = "deck-group";
      details.open = index === 0 || Boolean(chosenId);
      details.innerHTML = `
        <summary>
          <span class="deck-number">${deck.id}</span>
          <span class="deck-summary-copy"><strong>${esc(deck.title)}</strong><span>${chosenId ? `Picked: ${esc(variantById(chosenId).name)}` : "Choose one of five variants"}</span></span>
          <span class="deck-chevron" aria-hidden="true">›</span>
        </summary>
        <p class="deck-objective">${esc(deck.objective)}</p>
        <div class="variant-track"></div>`;
      const track = $(".variant-track", details);
      variants.forEach((variant) => track.appendChild(makeVariantCard(variant)));
      groups.appendChild(details);
    });

    $("#save-picks", root).addEventListener("click", () => {
      saveState();
      switchView("buy");
    });
    $("#email-picks", root).addEventListener("click", emailPicks);
  }

  function makeVariantCard(variant) {
    const stage = Number(state.stages[variant.id] || 2);
    const selected = state.compareSelections[variant.deckId] === variant.id;
    const bracket = variant.brackets[stage - 1] || {};
    const summary = variant.summaries[stage - 1] || [];
    const card = document.createElement("article");
    card.className = `variant-card${selected ? " is-selected" : ""}`;
    card.dataset.variant = variant.id;
    card.innerHTML = `
      <label class="pick-control">
        <input type="checkbox" ${selected ? "checked" : ""} aria-label="Pick ${esc(variant.name)}">
        <span>${selected ? "Picked" : "Pick"}</span>
      </label>
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
        <div class="stage-stats">
          <span class="stat-pill">${esc(variant.costs[stage - 1] || "Cost varies")}</span>
          <span class="stat-pill">${esc(bracket.label || "Bracket profile")}</span>
          <span class="stat-pill${bracket.gameChangers && !bracket.gameChangers.startsWith("0") ? " gc" : ""}">${esc(bracket.gameChangers || "0 GC")}</span>
        </div>
        <ul>${summary.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        <p class="stage-note">${esc(variant.stageNotes[stage - 1] || bracket.description || "")}</p>
      </div>`;

    $("img", card).addEventListener("error", (event) => {
      event.currentTarget.alt = `${variant.commander} image unavailable`;
      event.currentTarget.style.visibility = "hidden";
    });
    $(".pick-control input", card).addEventListener("change", () => selectVariant(variant));
    $$(".stage-button", card).forEach((button) => button.addEventListener("click", () => {
      state.stages[variant.id] = Number(button.dataset.stage);
      saveState();
      renderCompare();
      const refreshed = $(`[data-variant="${variant.id}"]`);
      refreshed?.scrollIntoView({block: "nearest", inline: "center"});
    }));
    return card;
  }

  function selectVariant(variant) {
    const previous = state.compareSelections[variant.deckId];
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
      <div id="buy-decks"></div>
      ${selected.length ? `<div class="action-row"><button class="primary-button" id="save-buys">Save Buys → Shop List</button><button class="secondary-button" data-go="compare">Back to Compare</button></div>` : ""}`;

    const decksRoot = $("#buy-decks", root);
    selected.forEach((variant) => decksRoot.appendChild(makeBuyDeck(variant)));
    $$('[data-go="compare"]', root).forEach((button) => button.addEventListener("click", () => switchView("compare")));
    $("#save-buys", root)?.addEventListener("click", () => {
      saveState();
      switchView("shop");
    });
  }

  function makeBuyDeck(variant) {
    const plan = buyCatalog.plans[variant.id];
    const details = document.createElement("details");
    details.className = "buy-deck";
    details.open = Boolean(plan);
    details.innerHTML = `
      <summary>
        <span class="deck-number">${variant.deckId}</span>
        <span class="buy-deck-title"><strong>${esc(variant.name)}</strong><span>${esc(variant.commander)}</span></span>
        <span class="${plan ? "profile-ready" : "profile-gap"}">${plan ? "Connected" : "Pending"}</span>
      </summary>
      <div class="buy-body"></div>`;
    const body = $(".buy-body", details);
    if (!plan) {
      body.innerHTML = `<div class="empty-state"><h3>Purchase profile not published yet</h3><p>This variant remains selected, but it will not add generic or mismatched cards to your Shop List.</p></div>`;
      return details;
    }

    const current = ensureBuyState(variant.id);
    body.innerHTML = `
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
    return details;
  }

  function buySection(title, note, items, kind, current, variantId) {
    if (!items?.length) return "";
    return `<section class="buy-section">
      <h4>${esc(title)} <span>${esc(note)}</span></h4>
      ${items.map((item) => {
        const required = kind === "required" || kind === "precon";
        const checked = required || (current[kind] || []).includes(item.id);
        return `<label class="buy-item">
          <input type="checkbox" ${checked ? "checked" : ""} ${required ? "disabled" : ""} data-buy-kind="${esc(kind)}" data-item-id="${esc(item.id)}" data-variant-id="${esc(variantId)}">
          <span class="buy-copy"><strong>${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</strong><small><span class="kind-label ${esc(kind)}">${esc(kind === "required" ? "upgrade" : kind)}</span>${esc(item.replaces || item.purpose || item.typeLine || "")}${item.gameChanger ? " · Game Changer" : ""}</small></span>
          <span class="price">${money(item.price)}</span>
        </label>`;
      }).join("")}
    </section>`;
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
    const visible = allItems.filter((item) => matchesFilters(item, filters));
    const foundCount = allItems.filter((item) => state.found[item.key]).length;
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
        <div class="filter-row" aria-label="Found status">
          ${filterChip("status", "all", "All", filters)}${filterChip("status", "need", "Need", filters)}${filterChip("status", "found", "Found", filters)}
        </div>
        <div class="filter-row" aria-label="Item type and category">
          ${filterChip("type", "all", "All items", filters)}${filterChip("type", "singles", "Singles", filters)}${filterChip("type", "precons", "Precons", filters)}
          ${filterChip("category", "upgrade", "Upgrade", filters)}${filterChip("category", "enhance", "Enhance", filters)}${filterChip("category", "max", "Max", filters)}
        </div>
        <div class="filter-row" aria-label="Deck filter">
          ${filterChip("deck", "all", "All decks", filters)}
          ${selectedVariants().map((variant) => filterChip("deck", String(variant.deckId), `Deck ${variant.deckId}`, filters)).join("")}
        </div>
      </div>
      <div class="shop-summary"><span><strong>${visible.length}</strong> shown · ${allItems.length - foundCount} still needed</span><span>${money(allItems.filter((item) => !state.found[item.key]).reduce((sum, item) => sum + (Number(item.price) || 0), 0))} target</span></div>
      <div class="shop-list" id="shop-list"></div>
      ${allItems.length ? `<div class="action-row"><button class="secondary-button" data-go="buy">Adjust Buy Picks</button></div>` : `<div class="empty-state"><h3>Your field list is empty</h3><p>Select connected deck variants and save their Buy Picks first.</p><button class="primary-button" data-go="buy">Open Buy Picks</button></div>`}`;

    const list = $("#shop-list", root);
    visible.forEach((item) => list.appendChild(makeShopCard(item)));
    $("#shop-search", root).addEventListener("input", (event) => {
      state.shopFilters.query = event.target.value;
      saveState();
      clearTimeout(renderShop.searchTimer);
      renderShop.searchTimer = setTimeout(renderShop, 120);
    });
    $$('[data-filter]', root).forEach((button) => button.addEventListener("click", () => {
      state.shopFilters[button.dataset.filter] = button.dataset.value;
      saveState();
      renderShop();
    }));
    $$('[data-go="buy"]', root).forEach((button) => button.addEventListener("click", () => switchView("buy")));
  }

  function filterChip(group, value, label, filters) {
    return `<button class="filter-chip${filters[group] === value ? " is-active" : ""}" data-filter="${esc(group)}" data-value="${esc(value)}">${esc(label)}</button>`;
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
      <img class="shop-image" src="${esc(item.image)}" alt="${esc(item.name)} card" loading="lazy">
      <div class="shop-main">
        <h3>${esc(item.name)}${item.quantity > 1 ? ` ×${item.quantity}` : ""}</h3>
        <p class="shop-meta">${esc([item.manaCost, item.typeLine, money(item.price)].filter(Boolean).join(" · "))}</p>
        <p class="shop-purpose">${esc(item.purpose || item.replaces || "")}</p>
        <p class="shop-refs">Needed by ${item.deckRefs.map((ref) => `Deck ${ref.deckId}`).join(" + ")}</p>
        <div class="shop-bottom">
          <div class="shop-badges">${categories.map((category) => `<span class="shop-badge ${esc(category)}">${esc(category)}</span>`).join("")}${item.gameChanger ? `<span class="shop-badge gc">GC</span>` : ""}</div>
          <button class="found-button">${found ? "✓ Found" : "Mark found"}</button>
        </div>
      </div>`;
    $("img", card).addEventListener("error", (event) => {
      event.currentTarget.alt = `${item.name} image unavailable`;
      event.currentTarget.style.visibility = "hidden";
    });
    $(".found-button", card).addEventListener("click", () => {
      state.found[item.key] = !found;
      saveState(!found ? `${item.name} marked found` : `${item.name} returned to Need`);
      renderShop();
    });
    return card;
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
    } catch (error) {
      $("#view-compare").innerHTML = `<div class="empty-state"><h3>Could not start the Deck Matrix</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  init();
})();
