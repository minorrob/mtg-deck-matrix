(function (root, factory) {
  "use strict";
  const lineup = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./lineup-model.js")
    : root && root.MtgLineupModel;
  const api = factory(lineup);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgCustomModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Lineup) {
  "use strict";

  if (!Lineup) throw new Error("Custom model requires the lineup model");

  const STORAGE_KEY = "mtg-deck-matrix-custom-v1";
  const SCHEMA_VERSION = 1;
  const SLOT_IDS = [101, 102, 103, 104, 105, 106];
  const MAX_ORACLE_CHARS = 400;
  const WARN_BYTES = 3_500_000;
  const BLOCK_BYTES = 4_500_000;
  const STAGES = ["Base", "Tuned", "Maxed"];

  const cardKey = (name) => Lineup.normalizeName(name);
  const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function blankInputs() {
    return {
      colors: [],
      themes: [],
      playstyle: "",
      budgetUsd: 150,
      variantCount: 3,
      preferSet: "",
      commanderLink: "",
      commanderName: "",
      seedLinks: [],
      powerTarget: 3
    };
  }

  function blankSlot(slotId, index) {
    return {
      slotId,
      title: `My deck ${index + 1}`,
      objective: "",
      inputs: blankInputs(),
      status: "empty",
      generatedAt: "",
      warnings: []
    };
  }

  function blankStore() {
    return {
      schemaVersion: SCHEMA_VERSION,
      slots: SLOT_IDS.map(blankSlot),
      cardPool: {},
      variants: [],
      overlays: {}
    };
  }

  // Anything unreadable is treated as absent: a corrupted custom store must never
  // keep the baked catalog from loading.
  function load(storage) {
    if (!storage) return blankStore();
    let parsed = null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
      return blankStore();
    }
    if (!parsed || typeof parsed !== "object") return blankStore();
    const store = blankStore();
    store.cardPool = parsed.cardPool && typeof parsed.cardPool === "object" ? parsed.cardPool : {};
    store.variants = Array.isArray(parsed.variants) ? parsed.variants : [];
    store.overlays = parsed.overlays && typeof parsed.overlays === "object" ? parsed.overlays : {};
    if (Array.isArray(parsed.slots)) {
      store.slots = SLOT_IDS.map((slotId, index) => {
        const saved = parsed.slots.find((slot) => Number(slot?.slotId) === slotId);
        if (!saved) return blankSlot(slotId, index);
        return {...blankSlot(slotId, index), ...saved, slotId, inputs: {...blankInputs(), ...(saved.inputs || {})}};
      });
    }
    return store;
  }

  function save(storage, store) {
    if (!storage) return {saved: false, reason: "no-storage"};
    const payload = JSON.stringify({...store, schemaVersion: SCHEMA_VERSION});
    if (payload.length > BLOCK_BYTES) return {saved: false, reason: "too-large", bytes: payload.length};
    try {
      storage.setItem(STORAGE_KEY, payload);
    } catch (error) {
      return {saved: false, reason: "quota", bytes: payload.length};
    }
    return {saved: true, bytes: payload.length, warn: payload.length > WARN_BYTES};
  }

  function clear(storage) {
    try {
      storage?.removeItem(STORAGE_KEY);
    } catch (error) {
      // Nothing to clean up if the browser refuses the write.
    }
    return blankStore();
  }

  function estimateBytes(store) {
    return JSON.stringify(store || {}).length;
  }

  function trimCard(card) {
    return {
      name: card.name,
      manaCost: card.manaCost || "",
      cmc: Number(card.cmc || 0),
      typeLine: card.typeLine || "",
      oracleText: String(card.oracleText || "").slice(0, MAX_ORACLE_CHARS),
      keywords: card.keywords || [],
      colorIdentity: card.colorIdentity || [],
      rarity: card.rarity || "",
      set: card.set || "",
      setName: card.setName || "",
      image: card.image || "",
      imageLarge: card.imageLarge || "",
      price: Number(card.price || 0),
      ceiling: Number(card.ceiling || card.price || 0),
      tcgplayerId: card.tcgplayerId || null,
      tcgplayerUrl: card.tcgplayerUrl || "",
      commanderLegal: card.commanderLegal !== false,
      gameChanger: Boolean(card.gameChanger),
      edhrecRank: card.edhrecRank || null,
      roles: card.roles || [],
      simTags: card.simTags || []
    };
  }

  function putCards(store, cards) {
    const keys = [];
    (cards || []).forEach((card) => {
      if (!card?.name) return;
      const key = cardKey(card.name);
      const existing = store.cardPool[key];
      store.cardPool[key] = existing ? {...existing, ...trimCard(card)} : trimCard(card);
      keys.push(key);
    });
    return keys;
  }

  function cardFor(store, key) {
    return store.cardPool[key] || {name: key, typeLine: "Unknown", colorIdentity: [], price: 0, tags: []};
  }

  function pruneCardPool(store) {
    const used = new Set();
    (store.variants || []).forEach((variant) => {
      (variant.base || []).forEach((ref) => used.add(ref.key));
      ["tuned", "enhance", "max"].forEach((kind) => (variant[kind] || []).forEach((ref) => {
        used.add(ref.key);
        if (ref.replacesKey) used.add(ref.replacesKey);
      }));
    });
    Object.values(store.overlays || {}).forEach((overlay) => (overlay.cards || []).forEach((ref) => used.add(ref.key)));
    Object.keys(store.cardPool).forEach((key) => {
      if (!used.has(key)) delete store.cardPool[key];
    });
    return store;
  }

  function slotVariants(store, slotId) {
    return (store.variants || []).filter((variant) => Number(variant.deckId) === Number(slotId)).sort((a, b) => a.order - b.order);
  }

  function replaceSlotVariants(store, slotId, variants) {
    store.variants = (store.variants || []).filter((variant) => Number(variant.deckId) !== Number(slotId));
    (variants || []).forEach((variant) => store.variants.push(variant));
    Object.keys(store.overlays || {}).forEach((variantId) => {
      if (!store.variants.some((variant) => variant.id === variantId)) delete store.overlays[variantId];
    });
    return pruneCardPool(store);
  }

  function clearSlot(store, slotId) {
    const index = (store.slots || []).findIndex((slot) => Number(slot.slotId) === Number(slotId));
    if (index >= 0) store.slots[index] = blankSlot(Number(slotId), SLOT_IDS.indexOf(Number(slotId)));
    return replaceSlotVariants(store, slotId, []);
  }

  function overlayFor(store, variantId) {
    return store.overlays?.[variantId] || null;
  }

  // Overlays are keyed by variant id alone, so an optimized list can sit on top
  // of a baked variant as readily as a generated one. Nothing in data/*.json is
  // touched either way.
  function applyResultAsOverlay(store, variantId, result) {
    if (!variantId) return {applied: false, reason: "unknown-variant"};
    const cards = (result?.finalCards || result?.cards || []).map((card) => ({
      key: cardKey(card.name),
      quantity: Math.max(1, Number(card.quantity || 1)),
      isCommander: Boolean(card.isCommander)
    }));
    const total = cards.reduce((sum, card) => sum + card.quantity, 0);
    if (total !== 100) return {applied: false, reason: "not-100", total};
    putCards(store, (result?.finalCards || result?.cards || []).map((card) => ({...card, name: card.name})));
    store.overlays = store.overlays || {};
    store.overlays[variantId] = {
      resultId: result?.id || "",
      appliedAt: result?.appliedAt || result?.finishedAt || "",
      cards,
      metrics: result?.finalMetrics || result?.metrics || null,
      baselineMetrics: result?.baselineMetrics || null,
      swaps: result?.swapsApplied || []
    };
    return {applied: true, total};
  }

  function removeOverlay(store, variantId) {
    if (store.overlays) delete store.overlays[variantId];
    return pruneCardPool(store);
  }

  function stageCards(store, variant, stage) {
    const overlay = overlayFor(store, variant.id);
    if (overlay) return overlay.cards.map((ref) => ({...cardFor(store, ref.key), quantity: ref.quantity, isCommander: ref.isCommander}));
    const byKey = new Map((variant.base || []).map((ref) => [ref.key, {...ref}]));
    const swapKinds = stage >= 3 ? ["tuned", "enhance", "max"] : stage === 2 ? ["tuned"] : [];
    swapKinds.forEach((kind) => (variant[kind] || []).forEach((swap) => {
      if (!byKey.has(swap.replacesKey)) return;
      const target = byKey.get(swap.replacesKey);
      byKey.delete(swap.replacesKey);
      byKey.set(swap.key, {key: swap.key, quantity: target.quantity, isCommander: false});
    }));
    return Array.from(byKey.values()).map((ref) => ({...cardFor(store, ref.key), quantity: ref.quantity, isCommander: ref.isCommander}));
  }

  function stageCost(store, variant, stage) {
    return stageCards(store, variant, stage).reduce((sum, card) => sum + Number(card.price || 0) * Number(card.quantity || 1), 0);
  }

  function money(value) {
    return `$${Math.round(Number(value) || 0)}`;
  }

  function toVariant(store, variant) {
    const profile = variant.profile || {};
    const commander = cardFor(store, variant.commanderKey);
    const overlay = overlayFor(store, variant.id);
    const costs = profile.costs || [1, 2, 3].map((stage) => `${money(stageCost(store, variant, stage))} total`);
    const optimizedTag = overlay ? [`Optimized${overlay.appliedAt ? ` ${String(overlay.appliedAt).slice(0, 10)}` : ""}`] : [];
    return {
      id: variant.id,
      deckId: variant.deckId,
      order: variant.order,
      name: variant.name,
      commander: commander.name,
      manaCost: commander.manaCost || "",
      typeLine: commander.typeLine || "",
      tags: [...(profile.tags || ["Generated"]), ...optimizedTag],
      summaries: profile.summaries || [[], [], []],
      stageNotes: profile.stageNotes || STAGES.map((label) => `${label} · generated build`),
      costs,
      brackets: profile.brackets || STAGES.map(() => ({label: "B3", gameChangers: "0 GC", description: ""})),
      ranks: profile.ranks || [variant.order, variant.order, variant.order],
      facts: profile.facts || STAGES.map(() => ({availability: "Generated", budget: "your budget", costNote: ""})),
      rarity: profile.rarity || STAGES.map(() => ({percent: "—", label: "Generated", description: ""})),
      scores: profile.scores || {playstyle: [[], [], []], engine: [[], [], []], growth: []},
      mechanics: profile.mechanics || [],
      detailHtml: profile.detailHtml || "",
      image: commander.imageLarge || commander.image || "",
      isCustom: true,
      lens: variant.lens || "",
      optimized: Boolean(overlay)
    };
  }

  function shellEntry(store, variantId, ref, index) {
    const card = cardFor(store, ref.key);
    return {
      id: `shell-${variantId}-${index + 1}-${slug(card.name)}`,
      name: card.name,
      quantity: Math.max(1, Number(ref.quantity || 1)),
      manaCost: card.manaCost || "",
      typeLine: card.typeLine || "",
      tags: ref.isCommander ? ["Commander"] : [],
      isCommander: Boolean(ref.isCommander),
      gameChanger: Boolean(card.gameChanger),
      isFlexibleSlot: false,
      image: card.image || "",
      oracleText: card.oracleText || "",
      keywords: card.keywords || [],
      colorIdentity: card.colorIdentity || [],
      tcgplayerUrl: card.tcgplayerUrl || "",
      commanderLegal: card.commanderLegal !== false,
      price: Number(card.price || 0),
      ceiling: Number(card.ceiling || card.price || 0)
    };
  }

  function swapEntry(store, variantId, swap, kind, index) {
    const card = cardFor(store, swap.key);
    const replaced = cardFor(store, swap.replacesKey);
    const stage = kind === "tuned" ? "Tuned" : kind === "enhance" ? "Enhance" : "Maxed";
    const why = swap.why || `Generated ${stage.toLowerCase()} upgrade for the ${swap.role || "core"} slot.`;
    return {
      id: `${variantId}-${kind}-${index + 1}-${slug(card.name)}`,
      name: card.name,
      quantity: 1,
      price: Number(card.price || 0),
      ceiling: Number(card.ceiling || card.price || 0),
      category: kind,
      stage,
      purpose: why,
      typeLine: card.typeLine || "",
      manaCost: card.manaCost || "",
      gameChanger: Boolean(card.gameChanger),
      why,
      whyPrimary: why,
      whyOptional: "",
      maxReason: kind === "max" ? why : "",
      replaces: replaced.name,
      tags: card.roles || [],
      whereToBuy: "Singles case",
      tcgplayerUrl: card.tcgplayerUrl || "",
      brief: {power: null, ease: null, fun: null, value: "", fit: why},
      image: card.image || "",
      oracleText: card.oracleText || "",
      keywords: card.keywords || [],
      colorIdentity: card.colorIdentity || [],
      commanderLegal: card.commanderLegal !== false
    };
  }

  // Overlaid variants carry one literal optimized 100, so their swap ladders are
  // dropped: the simulator already resolved every slot it was allowed to touch.
  function toPlan(store, variant, slot = null) {
    const overlay = overlayFor(store, variant.id);
    const baseRefs = overlay ? overlay.cards : variant.base || [];
    const startingShell = baseRefs.map((ref, index) => shellEntry(store, variant.id, ref, index));
    const swaps = (kind) => (overlay ? [] : (variant[kind] || []).map((swap, index) => swapEntry(store, variant.id, swap, kind, index)));
    const required = swaps("tuned");
    const tunedCost = stageCost(store, variant, 2);
    return {
      variantId: variant.id,
      sourceKind: "generated-profile",
      deckId: variant.deckId,
      deckName: slot?.title || variant.name,
      commander: cardFor(store, variant.commanderKey).name,
      budgetLabel: `${money(tunedCost)} total`,
      bracketLabel: variant.profile?.brackets?.[1]?.label || "B3",
      priorityLabel: `Generated · ${variant.lensLabel || "variant"}`,
      buyRank: variant.order,
      buyStrategy: variant.lensLabel || "Generated build",
      buyWhy: variant.profile?.summaries?.[1]?.[0] || "Generated from your Choose inputs.",
      buyFirst: required.slice(0, 3).map((item) => item.name).join(", ") || "Start with the Starting Shell singles.",
      allIn: Math.round(tunedCost),
      startingShell,
      startingShellKind: "custom-shell",
      startingShellSource: "Generated from Scryfall",
      baseCards: startingShell.map((card) => ({
        id: card.id,
        name: card.name,
        quantity: card.quantity,
        typeLine: card.typeLine,
        tags: card.tags,
        isCommander: card.isCommander,
        gameChanger: card.gameChanger
      })),
      planHtml: variant.profile?.planHtml || "",
      precon: null,
      required,
      upgrade: [],
      enhance: swaps("enhance"),
      max: swaps("max")
    };
  }

  function activeSlots(store) {
    return (store.slots || []).filter((slot) => slotVariants(store, slot.slotId).length > 0);
  }

  // Rewrites a baked plan to the optimized 100. The ladders go: the simulator
  // already resolved every slot it was allowed to touch, so there is nothing
  // left to choose between.
  function applyOverlayToPlan(store, plan, overlay) {
    const startingShell = overlay.cards.map((ref, index) => shellEntry(store, plan.variantId, ref, index));
    return {
      ...plan,
      startingShell,
      startingShellKind: "custom-shell",
      startingShellSource: `Optimized by simulation${overlay.appliedAt ? ` on ${String(overlay.appliedAt).slice(0, 10)}` : ""}`,
      baseCards: startingShell.map((card) => ({
        id: card.id,
        name: card.name,
        quantity: card.quantity,
        typeLine: card.typeLine,
        tags: card.tags,
        isCommander: card.isCommander,
        gameChanger: card.gameChanger
      })),
      precon: null,
      required: [],
      upgrade: [],
      enhance: [],
      max: []
    };
  }

  function overlaidBakedIds(store, catalog) {
    const custom = new Set((store.variants || []).map((variant) => variant.id));
    return Object.keys(store.overlays || {}).filter((id) => !custom.has(id) && (catalog?.variants || []).some((variant) => variant.id === id));
  }

  // The baked catalog stays untouched on disk; generated decks only ever exist in
  // the copies the app renders from, so the data files keep their asserted counts.
  function mergeIntoCatalogs(store, catalog, buyCatalog) {
    const decks = [];
    const variants = [];
    const plans = {};
    activeSlots(store).forEach((slot) => {
      decks.push({
        id: slot.slotId,
        title: slot.title || `My deck ${slot.slotId - 100}`,
        objective: slot.objective || describeSlot(slot),
        isCustom: true
      });
      slotVariants(store, slot.slotId).forEach((variant) => {
        variants.push(toVariant(store, variant));
        plans[variant.id] = toPlan(store, variant, slot);
      });
    });
    const overlaidBaked = overlaidBakedIds(store, catalog);
    const bakedVariants = (catalog?.variants || []).map((variant) => {
      if (!overlaidBaked.includes(variant.id)) return variant;
      const overlay = store.overlays[variant.id];
      return {
        ...variant,
        tags: [...(variant.tags || []), `Optimized${overlay.appliedAt ? ` ${String(overlay.appliedAt).slice(0, 10)}` : ""}`],
        optimized: true
      };
    });
    const bakedPlans = {};
    overlaidBaked.forEach((variantId) => {
      const plan = buyCatalog?.plans?.[variantId];
      if (plan) bakedPlans[variantId] = applyOverlayToPlan(store, plan, store.overlays[variantId]);
    });
    return {
      catalog: {
        ...catalog,
        decks: [...decks, ...(catalog?.decks || [])],
        variants: [...variants, ...bakedVariants]
      },
      buyCatalog: {
        ...buyCatalog,
        plans: {...(buyCatalog?.plans || {}), ...bakedPlans, ...plans},
        profileVariantIds: [...(buyCatalog?.profileVariantIds || []), ...Object.keys(plans)]
      },
      customDeckIds: decks.map((deck) => deck.id),
      customVariantIds: variants.map((variant) => variant.id),
      optimizedVariantIds: [...overlaidBaked, ...variants.filter((variant) => variant.optimized).map((variant) => variant.id)]
    };
  }

  function describeSlot(slot) {
    const inputs = slot?.inputs || {};
    const parts = [];
    if (inputs.themes?.length) parts.push(inputs.themes.join(" · "));
    if (inputs.playstyle) parts.push(inputs.playstyle);
    if (inputs.colors?.length) parts.push(inputs.colors.join(""));
    if (inputs.budgetUsd) parts.push(`$${inputs.budgetUsd} budget`);
    return parts.length ? `Generated for ${parts.join(" · ")}.` : "Generated from your Choose inputs.";
  }

  return {
    STORAGE_KEY,
    SCHEMA_VERSION,
    SLOT_IDS,
    WARN_BYTES,
    BLOCK_BYTES,
    cardKey,
    blankInputs,
    blankSlot,
    blankStore,
    load,
    save,
    clear,
    estimateBytes,
    putCards,
    cardFor,
    pruneCardPool,
    slotVariants,
    replaceSlotVariants,
    clearSlot,
    overlayFor,
    applyResultAsOverlay,
    removeOverlay,
    stageCards,
    stageCost,
    toVariant,
    toPlan,
    activeSlots,
    describeSlot,
    applyOverlayToPlan,
    overlaidBakedIds,
    mergeIntoCatalogs
  };
});
