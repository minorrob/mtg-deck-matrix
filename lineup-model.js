(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgLineupModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ARRAY_KEYS = [
    "shell", "tuned", "upgrade", "enhance", "max",
    "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"
  ];

  // The newer ladders routinely propose a card that's ALSO a name-twin of something already
  // in the deck -- an existing curated tuned/enhance/max pick, or the same staple proposed
  // independently by another one of the newer ladders (the win, fun, and alt ladders all
  // draw from the same pool of "what's actually missing from this deck" candidates). When
  // that happens, byName's declaration-order tie-break can point a later rung's `replaces`
  // at the wrong twin instead of the one actually diffed against. LADDER_PARENT records
  // which other newer-ladder rung each one may legitimately chain through, so resolution can
  // prefer that specific same-ladder candidate whenever one exists, ahead of whichever entry
  // byName would otherwise have preferred -- whether that was a different newer ladder or
  // one of the original five categories. This only ever redirects a reference that already
  // names a card generated for that adjacent rung; a name with no such candidate resolves
  // exactly as before.
  const LADDER_PARENT = {tuned2: null, enhance2: "tuned2", max2: "enhance2", funTuned: null, funMax: "funTuned", altTuned: null, altMax: "altTuned"};

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
    return Object.fromEntries(ARRAY_KEYS.map((key) => [key, []]));
  }

  function collectionEntries(plan, extraCandidates = []) {
    const sources = [
      ["shell", "shell", "Starting Shell", plan?.startingShell || plan?.baseCards || []],
      ["tuned", "tuned", "Tuned", plan?.required || []],
      ["upgrade", "upgrade", "Enhance", plan?.upgrade || []],
      ["enhance", "enhance", "Enhance", plan?.enhance || []],
      ["max", "max", "Maxxed", plan?.max || []],
      ["tuned2", "tuned2", "Tuned-2", plan?.tuned2 || []],
      ["enhance2", "enhance2", "Enhance-2", plan?.enhance2 || []],
      ["max2", "max2", "Maxxed-2", plan?.max2 || []],
      ["funTuned", "funTuned", "Fun Tuned", plan?.funTuned || []],
      ["funMax", "funMax", "Fun Max", plan?.funMax || []],
      ["altTuned", "altTuned", "Alt Tuned", plan?.altTuned || []],
      ["altMax", "altMax", "Alt Max", plan?.altMax || []],
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
    const ladderCandidatesByName = new Map();
    entries.forEach((entry) => {
      const key = normalizeName(entry.item.name);
      if (!byName.has(key) || entry.kind === "shell") byName.set(key, entry);
      if (Object.prototype.hasOwnProperty.call(LADDER_PARENT, entry.kind)) {
        if (!ladderCandidatesByName.has(key)) ladderCandidatesByName.set(key, []);
        ladderCandidatesByName.get(key).push(entry);
      }
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
      // Walk the whole rest of this entry's own ladder (max2->enhance2->tuned2, not just the
      // one immediate rung) before ever falling back to byName's cross-ladder guess. A rung's
      // own direct parent can carry a row through unchanged and so have no same-named entry
      // of its own -- e.g. an Enhance-2 value that's really just Tuned-2's untouched pick --
      // and stopping at that one missing rung would wrongly hand max2 off to an unrelated
      // same-named card from the original site ladder instead of the earlier rung it actually
      // came from. This only ever redirects among candidates that already share entry's own
      // ladder lineage; it never reaches past it into a different ladder's candidate.
      const ladderCandidates = ladderCandidatesByName.get(targetKey);
      let ladderMatch = null;
      let wantedLadderParent = LADDER_PARENT[entry.kind];
      while (wantedLadderParent && !ladderMatch) {
        ladderMatch = ladderCandidates ? ladderCandidates.find((candidate) => candidate.kind === wantedLadderParent) : null;
        wantedLadderParent = LADDER_PARENT[wantedLadderParent];
      }
      const predecessor = shellByName.get(targetKey) || ladderMatch || byName.get(targetKey) || null;
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
      const priorities = {
        tuned: 0, shell: 1, enhance: 2, upgrade: 2, max: 3,
        tuned2: 4, funTuned: 4, altTuned: 4, enhance2: 5, max2: 6, funMax: 6, altMax: 6
      };
      substitute = (model.groups.get(duplicate.slotId) || [])
        .filter((entry) => entry.id !== duplicate.id && normalizeName(entry.item.name) !== duplicateName && entry.kind !== "transfer")
        .sort((a, b) => (priorities[a.kind] ?? 9) - (priorities[b.kind] ?? 9) || a.item.name.localeCompare(b.item.name))[0] || null;
    }
    if (substitute) canonical[substitute.arrayKey].push(substitute.id);
    return canonicalizeSelection(plan, canonical, options);
  }

  // Interactive Buy Picks "check" behavior: clears the candidate's slot group the same way
  // applyChoice does, but never clears a successor -- a card built (directly or transitively)
  // on top of the one being checked. That asymmetry is what makes lineage-uncheck one-directional:
  // checking a higher-tier card still clears what it replaces, but re-checking a card that was
  // cleared this way can never claw back the higher-tier pick that replaced it. Nothing here
  // ever blocks -- it only decides what else gets cleared.
  //
  // Deliberately bypasses canonicalizeSelection, which applyChoice relies on: canonicalize
  // always collapses a slot back down to one entry, so routing through it would silently
  // re-merge a preserved successor the moment anything else in its slot changed, undoing the
  // one-directionality this function exists to provide. It also skips applyChoice's cross-slot
  // duplicate-name substitution -- an interactive click should only ever affect the slot the
  // user clicked; a duplicate name elsewhere is a compliance-panel warning, not a side effect
  // of this click.
  function applyLineageCheck(plan, selection, candidateId, options = {}) {
    const model = buildModel(plan, options.extraCandidates || []);
    const candidate = model.byId.get(String(candidateId));
    const pruned = Object.fromEntries(ARRAY_KEYS.map((key) => [
      key,
      (Array.isArray(selection?.[key]) ? selection[key] : []).filter((id) => model.byId.has(String(id)))
    ]));
    if (!candidate || candidate.kind === "transfer") return pruned;
    const isSuccessorOfCandidate = (entry) => {
      let walk = model.byId.get(entry.predecessorId);
      while (walk) {
        if (walk.id === candidate.id) return true;
        walk = model.byId.get(walk.predecessorId);
      }
      return false;
    };
    const clearIds = new Set(
      (model.groups.get(candidate.slotId) || [])
        .filter((entry) => entry.id !== candidate.id && !isSuccessorOfCandidate(entry))
        .map((entry) => entry.id)
    );
    const next = {};
    ARRAY_KEYS.forEach((key) => { next[key] = pruned[key].filter((id) => !clearIds.has(String(id))); });
    if (!next[candidate.arrayKey].includes(candidate.id)) next[candidate.arrayKey].push(candidate.id);
    return next;
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
    applyLineageCheck,
    restoreChoice,
    defaultSelection,
    selectedEntries,
    activeEntryForSlot,
    quantity,
    unresolvedEntries
  };
});
