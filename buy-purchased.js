(() => {
  "use strict";

  const APP_STORAGE_KEY = "mtg-deck-matrix-state-v1";
  const VIEW_STORAGE_KEY = "mtg-buy-purchased-mode-v1";
  let mode = localStorage.getItem(VIEW_STORAGE_KEY) === "purchased" ? "purchased" : "all";
  let scheduled = false;

  function itemKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function foundMap() {
    try {
      const saved = JSON.parse(localStorage.getItem(APP_STORAGE_KEY) || "null");
      return saved && typeof saved.found === "object" && saved.found ? saved.found : {};
    } catch (_) {
      return {};
    }
  }

  function rowName(row) {
    const explicit = row.querySelector("[data-shell-card-name]")?.getAttribute("data-shell-card-name");
    if (explicit) return explicit.trim();
    const strong = row.querySelector(".buy-copy strong, .buy-item-detail strong, strong");
    return String(strong?.textContent || "")
      .replace(/\s*[×x]\s*\d+\s*$/i, "")
      .trim();
  }

  function purchaseRows(root) {
    return Array.from(root.querySelectorAll(".buy-item")).filter((row, index, rows) => rows.indexOf(row) === index);
  }

  function ensureStyles() {
    if (document.getElementById("buy-purchased-style")) return;
    const style = document.createElement("style");
    style.id = "buy-purchased-style";
    style.textContent = `
      .buy-purchased-toolbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin:.65rem 0 1rem}
      .buy-purchased-toolbar .filter-chip{min-height:40px}
      .buy-purchased-toolbar .purchase-count{font-size:.82rem;opacity:.72;margin-left:.15rem}
      .buy-item-purchased-badge{display:inline-flex;align-items:center;gap:.25rem;margin-left:.45rem;padding:.18rem .48rem;border-radius:999px;background:rgba(38,132,92,.13);border:1px solid rgba(38,132,92,.28);font-size:.72rem;font-weight:800;line-height:1.2;vertical-align:middle}
      .buy-purchased-empty{padding:1rem;border:1px dashed rgba(127,127,127,.35);border-radius:12px;margin:.75rem 0 1rem;text-align:center}
      .buy-purchased-empty strong{display:block;margin-bottom:.25rem}
    `;
    document.head.appendChild(style);
  }

  function ensureToolbar(root, purchasedCount, totalCount) {
    let toolbar = root.querySelector(".buy-purchased-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "buy-purchased-toolbar";
      toolbar.setAttribute("aria-label", "Buy Picks purchase status");
      toolbar.innerHTML = `
        <button type="button" class="filter-chip" data-buy-purchased-mode="all">All</button>
        <button type="button" class="filter-chip" data-buy-purchased-mode="purchased">Purchased</button>
        <span class="purchase-count"></span>`;
      toolbar.querySelectorAll("[data-buy-purchased-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          mode = button.dataset.buyPurchasedMode;
          localStorage.setItem(VIEW_STORAGE_KEY, mode);
          apply(root);
        });
      });
      const intro = root.querySelector(".page-intro");
      if (intro) intro.insertAdjacentElement("afterend", toolbar);
      else root.prepend(toolbar);
    }

    toolbar.querySelectorAll("[data-buy-purchased-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.buyPurchasedMode === mode);
    });
    const count = toolbar.querySelector(".purchase-count");
    const nextCount = `${purchasedCount}/${totalCount} purchased`;
    if (count && count.textContent !== nextCount) count.textContent = nextCount;
  }

  function updateBadges(rows, found) {
    rows.forEach((row) => {
      const key = itemKey(rowName(row));
      const purchased = Boolean(key && found[key]);
      row.dataset.purchased = purchased ? "true" : "false";
      let badge = row.querySelector(".buy-item-purchased-badge");
      if (!purchased) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "buy-item-purchased-badge";
        badge.textContent = "✓ Purchased";
        const name = row.querySelector(".buy-copy strong, .buy-item-detail strong, strong");
        if (name) name.insertAdjacentElement("afterend", badge);
        else row.appendChild(badge);
      }
    });
  }

  function updateEmptyState(root, shown) {
    let empty = root.querySelector(".buy-purchased-empty");
    if (mode !== "purchased" || shown > 0) {
      empty?.remove();
      return;
    }
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "buy-purchased-empty";
      empty.innerHTML = "<strong>No purchased items yet.</strong><span>Mark a card Bought in Shop List and it will appear here automatically.</span>";
      const toolbar = root.querySelector(".buy-purchased-toolbar");
      toolbar?.insertAdjacentElement("afterend", empty);
    }
  }

  function apply(root) {
    ensureStyles();
    const rows = purchaseRows(root);
    const found = foundMap();
    updateBadges(rows, found);

    let purchasedCount = 0;
    let shown = 0;
    let selectedCount = 0;
    rows.forEach((row) => {
      const selected = Boolean(row.querySelector(".required-check") || row.querySelector("input[type='checkbox']")?.checked);
      const purchased = selected && row.dataset.purchased === "true";
      if (selected) selectedCount += 1;
      if (purchased) purchasedCount += 1;
      const visible = mode === "all" || purchased;
      row.hidden = !visible;
      if (visible) shown += 1;
    });

    root.querySelectorAll(".constructed-shell-group, .shell-type-group").forEach((group) => {
      if (mode !== "purchased") {
        group.hidden = false;
        return;
      }
      const groupRows = Array.from(group.querySelectorAll(".buy-item"));
      if (groupRows.length) group.hidden = !groupRows.some((row) => !row.hidden);
    });

    ensureToolbar(root, purchasedCount, selectedCount);
    updateEmptyState(root, shown);
  }

  function schedule(root) {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply(root);
    });
  }

  function initialize() {
    const root = document.querySelector("#view-buy");
    if (!root) return;
    const observer = new MutationObserver(() => schedule(root));
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener("click", (event) => {
      if (event.target.closest('[data-view="buy"]')) setTimeout(() => apply(root), 0);
    });
    window.addEventListener("storage", (event) => {
      if (event.key === APP_STORAGE_KEY || event.key === VIEW_STORAGE_KEY) apply(root);
    });
    schedule(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
