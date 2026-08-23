(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgLineupModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ARRAY_KEYS = ["shell", "tuned", "upgrade", "enhance", "max"];

  function normalizeName(value) {
    return String(value || "")
      .split(" // ")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function replacementName(value) {
    return String(value || "")
      .replace(/^(replaces|swaps in for)\s+/i, "")
      .trim();
  }

  function emptySelection() {
    return {shell: [], tuned: [], upgrade: [], enhance: [], max: []};
  }

  function collectionEntries(plan, extraCandidates = []) {
    const sources = [
      ["shell", "shell", "Starting Shell", plan?.startingShell || plan?.baseCards || []],
      ["tuned", "tuned", "Tuned", plan?.required || []],
      ["upgrade", "upgrade", "Enhance", plan?.upgrade || []],
      ["enhance", "enhance", "Enhance", plan?.enhance || []],
      ["max", "max", "Maxxed", plan?.max || []],
      ["transfer", "transfer", "Temporary", extraCandidates || []]
    ];
    return sources.flatMap(([kind, arrayKey, label, items]) => items.map((item, index) => ({
      id: String(item.id),
      item,
      kind,
      arrayKey,
      label,
      index
    })));
  }

  function buildModel(plan, extraCandidates = []) {
    const entries = collectionEntries(plan, extraCandidates);
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const byName = new Map();
    entries.forEach((entry) => {
      const key = normalizeName(entry.item.name);
      if (!byName.has(key) || entry.kind === "shell") byName.set(key, entry);
    });
    const shellById = new Map(entries.filter((entry) => entry.kind === "shell").map((entry) => [entry.id, entry]));
    const shellByName = new Map(entries.filter((entry) => entry.kind === "shell").map((entry) => [normalizeName(entry.item.name), entry]));
    const rootMemo = new Map();
    const predecessorMemo = new Map();

    function resolveRoot(entry, trail = new Set()) {
      if (!entry) return null;
      if (rootMemo.has(entry.id)) return rootMemo.get(entry.id);
      if (entry.kind === "shell") {
        rootMemo.set(entry.id, entry.id);
        return entry.id;
      }
      if (trail.has(entry.id)) {
        const cycle = `cycle:${entry.id}`;
        rootMemo.set(entry.id, cycle);
        return cycle;
      }
      const nextTrail = new Set(trail).add(entry.id);
      const targetName = replacementName(entry.item.replaces);
      const targetKey = normalizeName(targetName);
      const predecessor = shellByName.get(targetKey) || byName.get(targetKey) || null;
      predecessorMemo.set(entry.id, predecessor?.id || null);
      const rootId = predecessor
        ? resolveRoot(predecessor, nextTrail)
        : `unresolved:${targetKey || entry.id}`;
      rootMemo.set(entry.id, rootId);
      return rootId;
    }

    entries.forEach((entry) => {
      entry.slotId = resolveRoot(entry);
      entry.predecessorId = predecessorMemo.get(entry.id) || null;
      entry.root = shellById.get(entry.slotId)?.item || null;
    });

    const groups = new Map();
    entries.forEach((entry) => {
      if (!groups.has(entry.slotId)) groups.set(entry.slotId, []);
      groups.get(entry.slotId).push(entry);
    });
    return {entries, byId, byName, shellById, groups};
  }

  function canonicalizeSelection(plan, selection, options = {}) {
    const model = buildModel(plan, options.extraCandidates || []);
    const activeBySlot = new Map();
    const source = selection || {};
    ARRAY_KEYS.forEach((arrayKey) => {
      for (const id of Array.isArray(source[arrayKey]) ? source[arrayKey] : []) {
        const entry = model.byId.get(String(id));
        if (entry && entry.kind !== "transfer") activeBySlot.set(entry.slotId, entry);
      }
    });
    if (options.restoreResolvedFlexible) {
      for (const entry of model.entries) {
        if (entry.kind === "shell" && entry.item.wasFlexibleSlot && !activeBySlot.has(entry.slotId)) activeBySlot.set(entry.slotId, entry);
      }
    }
    const next = emptySelection();
    for (const entry of activeBySlot.values()) next[entry.arrayKey].push(entry.id);
    return next;
  }

  function applyChoice(plan, selection, candidateId, options = {}) {
    const model = buildModel(plan, options.extraCandidates || []);
    const candidate = model.byId.get(String(candidateId));
    if (!candidate || candidate.kind === "transfer") return canonicalizeSelection(plan, selection, options);
    const next = canonicalizeSelection(plan, selection, options);
    const groupIds = new Set((model.groups.get(candidate.slotId) || []).map((entry) => entry.id));
    ARRAY_KEYS.forEach((arrayKey) => {
      next[arrayKey] = next[arrayKey].filter((id) => !groupIds.has(String(id)));
    });
    next[candidate.arrayKey].push(candidate.id);
    let canonical = canonicalizeSelection(plan, next, options);
    const selectedIds = new Set(ARRAY_KEYS.flatMap((key) => canonical[key] || []).map(String));
    const duplicateName = normalizeName(candidate.item.name);
    const duplicate = model.entries.find((entry) => selectedIds.has(entry.id) && entry.id !== candidate.id && normalizeName(entry.item.name) === duplicateName);
    if (!duplicate) return canonical;
    const duplicateGroupIds = new Set((model.groups.get(duplicate.slotId) || []).map((entry) => entry.id));
    ARRAY_KEYS.forEach((arrayKey) => {
      canonical[arrayKey] = canonical[arrayKey].filter((id) => !duplicateGroupIds.has(String(id)));
    });
    let substitute = duplicate.kind === "shell" ? null : model.byId.get(duplicate.predecessorId);
    if (!substitute || normalizeName(substitute.item.name) === duplicateName) {
      const priorities = {tuned: 0, shell: 1, enhance: 2, upgrade: 2, max: 3};
      substitute = (model.groups.get(duplicate.slotId) || [])
        .filter((entry) => entry.id !== duplicate.id && normalizeName(entry.item.name) !== duplicateName && entry.kind !== "transfer")
        .sort((a, b) => (priorities[a.kind] ?? 9) - (priorities[b.kind] ?? 9) || a.item.name.localeCompare(b.item.name))[0] || null;
    }
    if (substitute) canonical[substitute.arrayKey].push(substitute.id);
    return canonicalizeSelection(plan, canonical, options);
  }

  function defaultSelection(plan) {
    let next = emptySelection();
    next.shell = (plan?.startingShell || plan?.baseCards || []).map((item) => String(item.id));
    next = canonicalizeSelection(plan, next);
    for (const item of plan?.required || []) next = applyChoice(plan, next, item.id);
    return next;
  }

  function selectedEntries(plan, selection, extraCandidates = []) {
    const model = buildModel(plan, extraCandidates);
    const canonical = canonicalizeSelection(plan, selection, {extraCandidates});
    const ids = new Set(ARRAY_KEYS.flatMap((key) => canonical[key] || []).map(String));
    return model.entries.filter((entry) => ids.has(entry.id));
  }

  function activeEntryForSlot(plan, selection, slotId, extraCandidates = []) {
    return selectedEntries(plan, selection, extraCandidates).find((entry) => entry.slotId === slotId) || null;
  }

  function restoreChoice(plan, selection, candidateId, preferredId = null, options = {}) {
    const model = buildModel(plan, options.extraCandidates || []);
    const candidate = model.byId.get(String(candidateId));
    if (!candidate) return canonicalizeSelection(plan, selection, options);
    const preferred = preferredId ? model.byId.get(String(preferredId)) : null;
    const predecessor = preferred?.slotId === candidate.slotId
      ? preferred
      : model.byId.get(candidate.predecessorId) || model.shellById.get(candidate.slotId) || null;
    const next = canonicalizeSelection(plan, selection, options);
    const groupIds = new Set((model.groups.get(candidate.slotId) || []).map((entry) => entry.id));
    ARRAY_KEYS.forEach((arrayKey) => {
      next[arrayKey] = next[arrayKey].filter((id) => !groupIds.has(String(id)));
    });
    return predecessor ? applyChoice(plan, next, predecessor.id, options) : next;
  }

  function quantity(plan, selection) {
    return selectedEntries(plan, selection).reduce((sum, entry) => sum + Math.max(1, Number(entry.item.quantity || 1)), 0);
  }

  function unresolvedEntries(plan) {
    return buildModel(plan).entries.filter((entry) => String(entry.slotId).startsWith("unresolved:") || String(entry.slotId).startsWith("cycle:"));
  }

  return {
    ARRAY_KEYS,
    normalizeName,
    replacementName,
    emptySelection,
    buildModel,
    canonicalizeSelection,
    applyChoice,
    restoreChoice,
    defaultSelection,
    selectedEntries,
    activeEntryForSlot,
    quantity,
    unresolvedEntries
  };
});
