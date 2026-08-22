(() => {
  "use strict";

  const APP_KEY = "mtg-deck-matrix-state-v1";
  const EXCLUDE_KEY = "mtg-tuned-exclusions-v1";
  let plans = null;
  let scheduled = false;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch (_) { return fallback; }
  }

  function appState() { return readJson(APP_KEY, {}); }
  function exclusions() { return readJson(EXCLUDE_KEY, {}); }
  function saveExclusions(value) { localStorage.setItem(EXCLUDE_KEY, JSON.stringify(value)); }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  async function loadPlans() {
    if (plans) return plans;
    try {
      const response = await fetch("data/buy-plans.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Buy plans unavailable");
      plans = (await response.json()).plans || {};
    } catch (_) {
      plans = {};
    }
    return plans;
  }

  function selectedVariantForDeck(deckId) {
    return appState().compareSelections?.[String(deckId)] || appState().compareSelections?.[Number(deckId)] || null;
  }

  function isExcluded(variantId, itemId) {
    return Boolean(exclusions()[variantId]?.includes(itemId));
  }

  function setExcluded(variantId, itemId, excluded) {
    const all = exclusions();
    const set = new Set(all[variantId] || []);
    excluded ? set.add(itemId) : set.delete(itemId);
    if (set.size) all[variantId] = Array.from(set);
    else delete all[variantId];
    saveExclusions(all);

    const state = appState();
    state.buySelections ||= {};
    state.buySelections[variantId] ||= {};
    const plan = plans?.[variantId];
    const tunedIds = (plan?.required || []).map((item) => item.id);
    state.buySelections[variantId].tuned = tunedIds.filter((id) => !set.has(id));
    localStorage.setItem(APP_KEY, JSON.stringify(state));
  }

  function enhanceBuy() {
    const root = document.querySelector("#view-buy");
    if (!root) return;

    root.querySelectorAll(".buy-deck").forEach((deck) => {
      const deckId = Number(deck.querySelector(":scope > summary .deck-number")?.textContent || 0);
      const variantId = selectedVariantForDeck(deckId);
      if (!variantId) return;

      deck.querySelectorAll(".buy-section").forEach((section) => {
        const label = section.querySelector(":scope > summary")?.textContent || "";
        if (!/^\s*✓?\s*Tuned\b/i.test(label.replace(/\s+/g, " "))) return;

        const note = section.querySelector(":scope > summary small");
        if (note && note.textContent !== "Recommended for the Tuned build · uncheck anything you already own or do not want") {
          note.textContent = "Recommended for the Tuned build · uncheck anything you already own or do not want";
        }

        section.querySelectorAll(".buy-item").forEach((row) => {
          const button = row.querySelector(".buy-item-detail[data-item-kind='tuned']");
          const itemId = button?.dataset.itemId;
          if (!itemId) return;

          let checkbox = row.querySelector("input[data-tuned-toggle]");
          const required = row.querySelector(".required-check");
          if (!checkbox) {
            checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.dataset.tunedToggle = "true";
            checkbox.dataset.variantId = variantId;
            checkbox.dataset.itemId = itemId;
            const name = row.querySelector(".buy-copy strong")?.textContent?.trim() || "Tuned item";
            checkbox.setAttribute("aria-label", `Include ${name} in Buy Picks and Shop List`);
            if (required) required.replaceWith(checkbox);
            else row.prepend(checkbox);
            checkbox.addEventListener("change", () => {
              setExcluded(variantId, itemId, !checkbox.checked);
              schedule();
            });
          }
          checkbox.checked = !isExcluded(variantId, itemId);
        });
      });
    });
  }

  function cardName(card) {
    return String(card.querySelector(".shop-name-button")?.textContent || card.querySelector("h3")?.textContent || "")
      .replace(/\s*[→›]\s*$/, "")
      .replace(/\s*×\d+\s*$/, "")
      .trim();
  }

  function deckRefs(card) {
    return Array.from(card.querySelectorAll(".shop-refs b"))
      .map((node) => Number((node.textContent.match(/\d+/) || [])[0]))
      .filter(Boolean);
  }

  function tunedRequirement(deckId, name) {
    const variantId = selectedVariantForDeck(deckId);
    const plan = variantId && plans?.[variantId];
    if (!plan) return null;
    const item = (plan.required || []).find((candidate) => normalize(candidate.name) === normalize(name));
    return item ? { variantId, itemId: item.id } : null;
  }

  function shouldHideShopCard(card) {
    const name = cardName(card);
    const refs = deckRefs(card);
    const tunedRefs = refs.map((deckId) => tunedRequirement(deckId, name)).filter(Boolean);
    if (!tunedRefs.length) return false;

    // If the same physical card is also present as a non-Tuned purchase level, keep it.
    const levels = Array.from(card.querySelectorAll(".shop-badge")).map((node) => node.textContent.trim().toLowerCase());
    if (levels.some((level) => level && level !== "tuned" && level !== "gc")) return false;

    // Hide only when every selected deck that requires this card as Tuned has unchecked it.
    return tunedRefs.every(({ variantId, itemId }) => isExcluded(variantId, itemId));
  }

  function enhanceShop() {
    const root = document.querySelector("#view-shop");
    if (!root) return;
    const cards = Array.from(root.querySelectorAll(".shop-card"));
    if (!cards.length) return;

    cards.forEach((card) => {
      const hide = shouldHideShopCard(card);
      card.dataset.tunedExcluded = hide ? "true" : "false";
      card.style.display = hide ? "none" : "";
    });

    root.querySelectorAll(".shop-group").forEach((group) => {
      const visible = Array.from(group.querySelectorAll(".shop-card")).some((card) => card.style.display !== "none" && !card.hidden);
      group.style.display = visible ? "" : "none";
    });

    const visibleCards = cards.filter((card) => card.style.display !== "none" && !card.hidden);
    const stillNeeded = visibleCards.filter((card) => !card.classList.contains("is-found"));
    const remaining = stillNeeded.reduce((sum, card) => {
      const text = card.querySelector(".shop-price-fact .shop-price-half:first-child strong")?.textContent || "";
      const match = text.replace(/,/g, "").match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
      return sum + (match ? Number(match[1]) : 0);
    }, 0);

    const summary = root.querySelector("#shop-summary");
    if (summary) summary.innerHTML = `<span><strong>${visibleCards.length}</strong> shown · ${stillNeeded.length} still needed</span><span>$${remaining.toFixed(2)} target</span>`;

    const meter = root.querySelector(".page-intro .selection-meter");
    if (meter) {
      const found = visibleCards.length - stillNeeded.length;
      meter.innerHTML = `<strong>${found}/${visibleCards.length}</strong><span>items found</span>`;
    }
  }

  async function apply() {
    await loadPlans();
    enhanceBuy();
    enhanceShop();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  function init() {
    const observer = new MutationObserver(schedule);
    const app = document.querySelector("#app");
    if (app) observer.observe(app, { childList: true, subtree: true });
    window.addEventListener("storage", (event) => {
      if (event.key === APP_KEY || event.key === EXCLUDE_KEY) schedule();
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest('[data-view="buy"], [data-view="shop"], .save-buys, [data-go="buy"]')) setTimeout(schedule, 0);
    });
    schedule();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();