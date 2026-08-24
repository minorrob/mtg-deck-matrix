(() => {
  "use strict";

  const STORAGE_KEY = "mtg-shop-extra-filters-v1";
  let observerControl = null;
  const DEFAULTS = { color: "all", price: "all", rarity: "all", location: "all", alt: "all", sort: "default" };
  const FILTER_KEYS = ["color", "price", "rarity", "location", "alt"];
  const COLOR_LABELS = {
    all: "All colors",
    white: "White",
    blue: "Blue",
    black: "Black",
    red: "Red",
    green: "Green",
    multicolor: "Multicolor",
    colorless: "Colorless"
  };

  let filters = loadFilters();
  let scheduled = false;

  function loadFilters() {
    try {
      return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}) };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveFilters() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function cardColor(card) {
    if (card.querySelector(".shop-card-kicker span:first-of-type")?.textContent.trim().toLowerCase() === "precon") {
      return "other";
    }
    const symbols = Array.from(card.querySelectorAll(".mana-cost img[alt]"))
      .map((img) => String(img.alt || "").toUpperCase())
      .join(" ");
    const colors = new Set();
    if (/W/.test(symbols)) colors.add("white");
    if (/U/.test(symbols)) colors.add("blue");
    if (/B/.test(symbols)) colors.add("black");
    if (/R/.test(symbols)) colors.add("red");
    if (/G/.test(symbols)) colors.add("green");
    if (colors.size > 1) return "multicolor";
    if (colors.size === 1) return Array.from(colors)[0];
    return "colorless";
  }

  function targetPrice(card) {
    const priceFact = card.querySelector(".shop-price-fact .shop-price-half:first-child strong");
    const match = String(priceFact?.textContent || "").replace(/,/g, "").match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
    return match ? Number(match[1]) : null;
  }

  function cardName(card) {
    return String(card.querySelector(".shop-name-button")?.textContent || card.querySelector("h3")?.textContent || "")
      .replace(/\s*[→›]\s*$/, "")
      .replace(/\s*×\d+\s*$/, "")
      .trim();
  }

  function cardRarity(card) {
    const rarity = card.querySelector(".rarity-icon");
    const value = normalize(rarity?.getAttribute("alt") || rarity?.getAttribute("title"));
    if (value.startsWith("common")) return "common";
    if (value.startsWith("uncommon")) return "uncommon";
    if (value.startsWith("rare")) return "rare";
    if (value.startsWith("mythic")) return "mythic";
    return "other";
  }

  function cardLocation(card) {
    return String(card.querySelector(".shop-buying-facts > div:first-child strong")?.textContent || "").trim();
  }

  // Reads the Alt badge app.js renders into the kicker for any card tagged "alt" (an
  // alternative-commander lineage card) -- this file only ever sees rendered markup, never
  // the JS selection state, so the badge itself is the signal.
  function cardIsAlt(card) {
    return Boolean(card.querySelector(".shop-badge.alt"));
  }

  function matches(card) {
    if (filters.color !== "all" && cardColor(card) !== filters.color) return false;

    const price = targetPrice(card);
    if (filters.price === "under3" && !(price !== null && price < 3)) return false;
    if (filters.price === "3to30" && !(price !== null && price >= 3 && price <= 30)) return false;
    if (filters.price === "over30" && !(price !== null && price > 30)) return false;

    if (filters.rarity !== "all" && cardRarity(card) !== filters.rarity) return false;
    if (filters.location !== "all" && normalize(cardLocation(card)) !== normalize(filters.location)) return false;
    if (filters.alt === "alt" && !cardIsAlt(card)) return false;
    return true;
  }

  function selectMarkup(key, label, options) {
    return `<label class="filter-select extra-shop-filter" data-extra-filter-wrap="${key}">
      <span>${label}</span>
      <select data-extra-shop-filter="${key}">
        ${options.map(([value, text]) => `<option value="${escapeHtml(value)}"${filters[key] === value ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>
    </label>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  }

  function availableLocations(root) {
    return Array.from(new Set(Array.from(root.querySelectorAll(".shop-card"))
      .map(cardLocation)
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function ensureControls(root) {
    const grid = root.querySelector(".filter-select-grid");
    if (!grid) return;

    const locations = availableLocations(root);
    if (filters.location !== "all" && !locations.some((value) => normalize(value) === normalize(filters.location))) {
      filters.location = "all";
      saveFilters();
    }

    const definitions = {
      color: ["Color", Object.entries(COLOR_LABELS)],
      price: ["Price", [["all", "All prices"], ["under3", "Under $3"], ["3to30", "$3–$30"], ["over30", "Over $30"]]],
      rarity: ["Rarity", [["all", "All rarities"], ["common", "Common"], ["uncommon", "Uncommon"], ["rare", "Rare"], ["mythic", "Mythic"], ["other", "Other / sealed"]]],
      location: ["Location", [["all", "All locations"], ...locations.map((location) => [location, location])]],
      alt: ["Alt", [["all", "All cards"], ["alt", "Alt only"]]],
      sort: ["Sort", [["default", "Default order"], ["az", "Name: A → Z"], ["za", "Name: Z → A"], ["lowHigh", "Price: Low → High"], ["highLow", "Price: High → Low"]]]
    };

    Object.entries(definitions).forEach(([key, [label, options]]) => {
      let wrapper = grid.querySelector(`[data-extra-filter-wrap="${key}"]`);
      if (!wrapper) {
        grid.insertAdjacentHTML("beforeend", selectMarkup(key, label, options));
        wrapper = grid.querySelector(`[data-extra-filter-wrap="${key}"]`);
      } else if (key === "location") {
        const select = wrapper.querySelector("select");
        const currentValues = Array.from(select.options).map((option) => option.value);
        const nextValues = options.map(([value]) => value);
        if (currentValues.join("\u0000") !== nextValues.join("\u0000")) {
          wrapper.outerHTML = selectMarkup(key, label, options);
        }
      } else if (key === "sort") {
        const select = wrapper.querySelector("select");
        const currentValues = Array.from(select.options).map((option) => option.value);
        const nextValues = options.map(([value]) => value);
        if (currentValues.join("\u0000") !== nextValues.join("\u0000")) {
          wrapper.outerHTML = selectMarkup(key, label, options);
        }
      }
    });

    root.querySelectorAll("[data-extra-shop-filter]").forEach((select) => {
      if (select.dataset.bound === "true") return;
      select.dataset.bound = "true";
      select.addEventListener("change", () => {
        filters[select.dataset.extraShopFilter] = select.value;
        saveFilters();
        applyFilters(root);
      });
    });
  }

  function updateFilterBadge(root) {
    const summary = root.querySelector(".more-filters > summary");
    if (!summary) return;
    const activeExtra = FILTER_KEYS.filter((key) => filters[key] !== "all").length;
    let badge = summary.querySelector("[data-extra-filter-count]");
    if (!activeExtra) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("b");
      badge.dataset.extraFilterCount = "true";
      badge.style.marginLeft = ".25rem";
      summary.appendChild(badge);
    }
    if (badge.textContent !== `+${activeExtra}`) badge.textContent = `+${activeExtra}`;
    badge.title = `${activeExtra} additional Shop List filter${activeExtra === 1 ? "" : "s"} active`;
  }

  function originalOrder(card, fallback) {
    if (card.dataset.shopSortOrder === undefined) card.dataset.shopSortOrder = String(fallback);
    return Number(card.dataset.shopSortOrder);
  }

  function sortContainer(container) {
    if (!container) return;
    const current = Array.from(container.children).filter((node) => node.classList?.contains("shop-card"));
    if (current.length < 2) {
      current.forEach((card, index) => originalOrder(card, index));
      return;
    }

    current.forEach((card, index) => originalOrder(card, index));
    const desired = [...current].sort((a, b) => {
      const aOrder = originalOrder(a, 0);
      const bOrder = originalOrder(b, 0);
      if (filters.sort === "default") return aOrder - bOrder;

      if (filters.sort === "az" || filters.sort === "za") {
        const nameDelta = cardName(a).localeCompare(cardName(b), undefined, { sensitivity: "base", numeric: true });
        return (filters.sort === "za" ? -nameDelta : nameDelta) || aOrder - bOrder;
      }

      const aPrice = targetPrice(a);
      const bPrice = targetPrice(b);
      if (aPrice === null && bPrice === null) return aOrder - bOrder;
      if (aPrice === null) return 1;
      if (bPrice === null) return -1;

      const priceDelta = filters.sort === "highLow" ? bPrice - aPrice : aPrice - bPrice;
      return priceDelta || aOrder - bOrder;
    });

    if (!desired.some((card, index) => card !== current[index])) return;
    const fragment = document.createDocumentFragment();
    desired.forEach((card) => fragment.appendChild(card));
    container.appendChild(fragment);
  }

  function applySort(root) {
    const grouped = Array.from(root.querySelectorAll(".shop-group-grid"));
    if (grouped.length) {
      grouped.forEach(sortContainer);
      return;
    }
    sortContainer(root.querySelector("#shop-list"));
  }

  function applyFilters(root) {
    ensureControls(root);
    const cards = Array.from(root.querySelectorAll(".shop-card"));
    let shown = 0;
    cards.forEach((card) => {
      const visible = matches(card);
      card.hidden = !visible;
      if (visible) shown += 1;
    });

    root.querySelectorAll(".shop-group").forEach((group) => {
      group.hidden = !Array.from(group.querySelectorAll(".shop-card")).some((card) => !card.hidden);
    });

    applySort(root);

    const summary = root.querySelector("#shop-summary span:first-child strong");
    if (summary && summary.textContent !== String(shown)) summary.textContent = String(shown);
    updateFilterBadge(root);
  }

  function schedule(root) {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      observerControl?.pause();
      try { applyFilters(root); }
      finally { observerControl?.resume(); }
    });
  }

  function initialize() {
    const root = document.querySelector("#view-shop");
    if (!root) return;
    // applyFilters rewrites the list it is watching. Without pausing the observer around
    // its own writes, every pass schedules another one and the view never settles.
    const observer = new MutationObserver(() => schedule(root));
    const start = () => observer.observe(root, { childList: true, subtree: true });
    observerControl = { pause: () => observer.disconnect(), resume: start };
    start();
    schedule(root);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();