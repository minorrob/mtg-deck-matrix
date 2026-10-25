# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of Rob's four priority lists (2026-10-24), lane P3 (counters): one break for each engine change.

- Monstrosity X counted as it resolves, X the counters of every kind among creatures (Maester Seymour; CR 701.37a):
  script/effects/attributes.mjs, script/amount.mjs `countersAmong` with `counter: "any"`.
- A selector's `nonCounters` (Wave Goodbye) and `controlsAny` (Summon: Yojimbo's IV): script/filter.mjs.
- A copy's "enters with X additional +1/+1 counters" (Altered Ego; CR 107.3m, 707.9a): rules/replacement.mjs.
- "Target creature attacking you" (Lulu, Stern Guardian; CR 506.3): a selector's `attacking: "you directly"`, script/filter.mjs.
- "If a counter was put on Wakka this turn": rules/trigger.mjs `recordCounters`, script/condition.mjs `counterPutThisTurn`.
- An attack tax for a while (Summon: Yojimbo; CR 508.1g): rules/statics.mjs `attackTax`.
- Shield counters (CR 122.1c; Protection Magic, Summon: Magus Sisters): script/effects/zones.mjs (destruction by an effect),
  rules/replacement.mjs and rules/combat.mjs (damage prevented, one counter for damage dealt at once).
- "Choose one at random" (CR 700.2; Summon: Magus Sisters): cards/index.mjs, rules/trigger.mjs, rules/turn.mjs.
- Counters of any kind put on a creature, once for each creature for everything one action put on it (Generous Patron,
  Rikku, Resourceful Guardian): cards/index.mjs, rules/trigger.mjs.
- "Move any number of counters" (Resourceful Defense; CR 122.5): script/resolution.mjs, script/effects/asking.mjs,
  script/effects/resources.mjs; and a leave trigger about a permanent gone to a hidden zone (rules/trigger.mjs).

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-roblists-p3-counters.py
"""
SUITES = ['tests/engine-roblists-p3.mjs']
AM = 'game/engine/script/amount.mjs'
AT = 'game/engine/script/effects/attributes.mjs'
FI = 'game/engine/script/filter.mjs'
RP = 'game/engine/rules/replacement.mjs'
IX = 'game/engine/cards/index.mjs'
TR = 'game/engine/rules/trigger.mjs'
CO = 'game/engine/script/condition.mjs'
ST = 'game/engine/rules/statics.mjs'
ZO = 'game/engine/script/effects/zones.mjs'
CB = 'game/engine/rules/combat.mjs'
TU = 'game/engine/rules/turn.mjs'
RE = 'game/engine/script/resolution.mjs'
AS = 'game/engine/script/effects/asking.mjs'
RS = 'game/engine/script/effects/resources.mjs'
BREAKS = [
    # Maester Seymour
    ('counters among creatures of one kind only', AM,
     'n = matching(state, value.countersAmong, who).reduce((sum, id) => sum + (value.counter === "any"', 'n = matching(state, value.countersAmong, who).reduce((sum, id) => sum + (false'),
    ('monstrosity X never counted', AT,
     ': isCounted(params.counters) ? Math.max(0, amountOf(state, params.counters, context)) : null;', ': null;'),
    # Wave Goodbye, Summon: Yojimbo
    ('nonCounters not a key of the grammar', FI, '  "nonCounters",\n', ''),
    ('nonCounters taken for anything', FI,
     '(typeof selector.nonCounters !== "string" || ["any", "none"].includes(selector.nonCounters))', '(typeof selector.nonCounters !== "string")'),
    ('nonCounters matched by nothing', FI,
     '    if (selector.nonCounters !== undefined && (object.counters?.[selector.nonCounters] ?? 0) > 0) return false;\n', ''),
    ('controlsAny not a key of the grammar', FI, '  "controlsAny",\n', ''),
    ('controlsAny on any selector', FI,
     'if (selector.what !== "player" || !selector.controlsAny || typeof selector.controlsAny !== "object" || selector.controlsAny.controller !== undefined)',
     'if (!selector.controlsAny || typeof selector.controlsAny !== "object")'),
    ('controlsAny not held to the grammar', FI, '    compileSelector({...selector.controlsAny, what: "permanent"});\n  }', '  }'),
    ('controlsAny matched by every player', FI,
     'if (selector.controlsAny !== undefined && !state.zones.battlefield.some(', 'if (false && !state.zones.battlefield.some('),
    # Altered Ego
    ('a copy\'s X counters left uncounted', RP,
     'except.entersWithCounters = except.entersWithCounters.map((extra) => (isCounted(extra.count)', 'except.entersWithCounters = except.entersWithCounters.map((extra) => (false'),
    # Lulu, Stern Guardian
    ('"attacking you directly" refused', FI, '![true, "you", "you directly"].includes(selector.attacking)', '![true, "you"].includes(selector.attacking)'),
    ('"attacking you directly" counts a planeswalker attacked', FI,
     '      && attack.planeswalker === undefined && attack.defender === context.controller)) return false;', '      )) return false;'),
    # Wakka, Devoted Guardian
    ('no turn recorded for a counter put on', TR, '    if (object?.zone === "battlefield") object.counterPutTurn = state.turn;\n', ''),
    ('counterPutThisTurn always holds', CO,
     '  if (condition.counterPutThisTurn !== undefined && ((source !== null && state.objects[source]?.counterPutTurn === state.turn) !== condition.counterPutThisTurn)) return false;\n', ''),
    ('counterPutThisTurn of any value', CO,
     '  if ("counterPutThisTurn" in condition && typeof condition.counterPutThisTurn !== "boolean") problems.push("counterPutThisTurn is true or false");\n', ''),
    # Summon: Yojimbo
    ('an attack tax for a while charges nothing', ST,
     'if (effect.rule === "attack-tax" && effect.sourceController === defenderId && planeswalkerId === undefined) total += effect.apply?.amount ?? 0;',
     'if (false) total += 0;'),
    # Shield counters
    ('a shield counter replaces no destruction', ZO, '  if (byEffect && (object.counters?.shield ?? 0) > 0) found.push({key: "shield"});\n', ''),
    ('a shield counter replaces the state-based destruction too', ZO,
     'export function destructionReplaced(state, id, events, {noRegenerate = false, chosen = undefined, byEffect = false} = {}) {',
     'export function destructionReplaced(state, id, events, {noRegenerate = false, chosen = undefined, byEffect = true} = {}) {'),
    ('a shield counter not removed as it replaces a destruction', ZO, '    object.counters.shield = before - 1;\n', '    object.counters.shield = before;\n'),
    ('the shield choice unworded', ZO, '  if (key === "shield") return `Remove a shield counter from ${name}`;\n', ''),
    ('destroy effects not effects', ZO,
     '    if (destructionReplaced(state, id, events, {noRegenerate: params.noRegenerate === true, chosen: params.destructionAnswers?.[id], byEffect: true})) continue;\n    const before = params.remember',
     '    if (destructionReplaced(state, id, events, {noRegenerate: params.noRegenerate === true, chosen: params.destructionAnswers?.[id]})) continue;\n    const before = params.remember'),
    ('the choice between replacements asked without the shield', ZO,
     'effect.destructionAnswers ?? {}, {noRegenerate: effect.noRegenerate === true, byEffect: true})[0] ?? null;',
     'effect.destructionAnswers ?? {}, {noRegenerate: effect.noRegenerate === true})[0] ?? null;'),
    ('a shield counter prevents no damage', RP,
     '    && applies(state, SHIELD, shielded, proposal)) found.push({holderId: proposal.toCard, ability: SHIELD});', '    && false) found.push({holderId: proposal.toCard, ability: SHIELD});'),
    ('a shield counter not removed as it prevents damage', RP,
     '      next.followUps = [...(next.followUps ?? []), {effects: [{effect: "removeCounter", targets: "self", counter: "shield", count: 1}],',
     '      next.followUps = [...(next.followUps ?? []), {effects: [],'),
    ('a counter removed for each hit of a batch', RP,
     '      && (proposal.batch === undefined || state.objects[holderId].shieldBatch !== proposal.batch)) {', '      ) {'),
    ('the spent shield of a batch prevents nothing more', RP,
     ' || (proposal.batch !== undefined && shielded.shieldBatch === proposal.batch))', ')'),
    ('combat damage dealt in no batch', CB, '      batch: `combat:${state.turn}:${step}`});', '      });'),
    # Choose one at random
    ('at random not compiled', IX, '          ...(lone.random === true ? {random: true} : {}),\n', ''),
    ('at random beside other choices let through', IX,
     '      if (modal?.random && (modal.choose !== 1 || modal.upTo || modal.unchosen || modal.mayChooseNone || modal.differentPlayers))',
     '      if (modal?.random && modal.choose !== 1)'),
    ('a counted target in any mode let through', IX,
     '      if (modal && !modal.random && modal.modes.some((m) => m.targets.some((t) => t && typeof t === "object" && t.count !== undefined)))',
     '      if (false && modal.modes.some((m) => m.targets.some((t) => t && typeof t === "object" && t.count !== undefined)))'),
    ('a counted target in a mode at random refused', IX,
     '      if (modal && !modal.random && modal.modes.some((m) => m.targets.some((t) => t && typeof t === "object" && t.count !== undefined)))',
     '      if (modal && modal.modes.some((m) => m.targets.some((t) => t && typeof t === "object" && t.count !== undefined)))'),
    ('the mode picked leaves the others open', TR,
     '  if (entry.script?.modal?.random && Number.isInteger(entry.randomMode)) return entry.script.modal.modes.map((_, i) => i).filter((i) => i !== entry.randomMode);\n', ''),
    ('no roll: the player chooses the mode', TR, '    if (modal.random && !Number.isInteger(entry.randomMode))\n', '    if (false)\n'),
    ('the first mode always', TR, '    entry.randomMode = rng.pick(able);', '    entry.randomMode = able[0];'),
    ('the roll without the random stream', TU, '    const events = resolveTriggerTargets(state, awaiting, indices, rng);', '    const events = resolveTriggerTargets(state, awaiting, indices);'),
    # Generous Patron, Rikku
    ('one or more of any kind, once for each kind', TR,
     ' || (trigger.on === "GameEventCardCounters" && trigger.counterAdded === true && trigger.counter === "any");', ';'),
    ('counters of any kind seen as none', TR, '      && (condition.counter === "any" || fields.type === condition.counter)', '      && (fields.type === condition.counter)'),
    ('counters on two creatures at once, one trigger', TR,
     '            : ability.trigger.on === "GameEventCardCounters" && ability.trigger.counter === "any" ? `:${about.card}` : ""}`;', '            : ""}`;'),
    # Resourceful Defense
    ('any number of counters moved unasked', RE,
     '    else if (effect?.effect === "moveCounters" && effect.counter === "any" && effect.moving === undefined)\n      resolving.queue[0] = {effect: "countersToRemove", then: effect};\n', ''),
    ('the counters asked about from the second target', AS,
     '[on] = (moving(then) ? then.from : then.targets) ?? []', '[on] = then.targets ?? []'),
    ('asked even with the second target gone', AS,
     'const units = moving(then) && (onto === undefined || onto === on || state.objects[onto]?.zone !== "battlefield") ? []', 'const units = false ? []'),
    ('the move worded as a removal', AS, '    if (awaiting.then.effect === "moveCounters") {\n      const onto', '    if (false) {\n      const onto'),
    ('the counters chosen removed, not moved', AS,
     '    if (awaiting.then.effect === "moveCounters") return {events: [], splice: [{...awaiting.then, moving: removing}]};\n', ''),
    ('the counters chosen not moved', RS,
     '    return Object.entries(params.moving).flatMap(([kind, n]) => moveCounters(state, {...params, counter: kind, count: n, moving: undefined}, context));',
     '    return [];'),
    ('a leave to a hidden zone known as nothing', TR, '  if (event.kind === "GameEventCardChangeZone") return [{...leftAs(fields)}];\n', ''),
    ('what left kept off the trigger', TR, ' || about.amount !== undefined || about.lastKnown !== undefined ? {about} : {}),', ' || about.amount !== undefined ? {about} : {}),'),
]
