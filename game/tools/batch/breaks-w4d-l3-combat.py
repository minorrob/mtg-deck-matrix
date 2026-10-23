# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of 2026-10-23, lane L3 (combat and equipment): one break per engine change.

Dash (cards/index.mjs, rules/stack.mjs), nonbasic landwalk (keywords/combat.mjs), multiplyCounters' one kind and selector
and dealDamage's trample excess (script/effects/resources.mjs), Fog's prevention of all combat damage and Gisela's halving
(rules/replacement.mjs), the removeFromCombat primitive (script/effects/permanents.mjs, index.mjs), modified (rules/layers.mjs,
script/filter.mjs), protection from a subtype (rules/protection.mjs, cards/index.mjs), Bludgeon Brawl's layers (rules/layers.mjs,
script/filter.mjs, script/schema.mjs, rules/sba.mjs), totalManaValue of a selector (script/amount.mjs), and Moraug's amount,
condition and added combat (script/amount.mjs, script/condition.mjs, script/effects/permanents.mjs, rules/turn.mjs,
rules/trigger.mjs).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-w4d-l3-combat.py
"""
SUITES = ['tests/engine-w4d-combat.mjs', 'tests/engine-cards.mjs']
IDX = 'game/engine/cards/index.mjs'
STACK = 'game/engine/rules/stack.mjs'
KW = 'game/engine/keywords/combat.mjs'
RES = 'game/engine/script/effects/resources.mjs'
REP = 'game/engine/rules/replacement.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
EFF = 'game/engine/script/effects/index.mjs'
LAY = 'game/engine/rules/layers.mjs'
FIL = 'game/engine/script/filter.mjs'
PROT = 'game/engine/rules/protection.mjs'
SBA = 'game/engine/rules/sba.mjs'
AMT = 'game/engine/script/amount.mjs'
COND = 'game/engine/script/condition.mjs'
SCH = 'game/engine/script/schema.mjs'
TURN = 'game/engine/rules/turn.mjs'
TRIG = 'game/engine/rules/trigger.mjs'

BREAKS = [
    # Dash
    ('dash not an alternative cost', IDX,
     'abilities.push({id, kind: "static", rule: "alternative-cost", paidFor: "dash", text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});',
     ''),
    ('dash allowed on a noncreature', IDX,
     'if (!(identity.types ?? []).includes("Creature")) problems.push(`${ability.text}: dash on a card that is no creature`);',
     ''),
    ('dash allowed a cost of anything', IDX,
     'if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: a dash cost of mana, once, without X`);',
     ''),
    ('a dashed creature without haste', STACK,
     '(state.effects ??= []).push({id: `dash-haste:${arrived}`, layer: 6, affects: {ids: [arrived]}, apply: {addKeywords: ["Haste"]}, until: null, sourceController: entry.playerId});',
     ''),
    ('a dashed creature never returned', STACK,
     'effects: [{effect: "moveZone", targets: [arrived], to: "hand"}]}, {controller: entry.playerId, source: arrived});',
     'effects: []}, {controller: entry.playerId, source: arrived});'),
    # Nonbasic landwalk
    ('nonbasic landwalk ignored', KW,
     'if (state.zones.battlefield.some((id) => controllerOf(state, id) === defending && nonbasic(id))) return false;',
     ''),
    ('nonbasic landwalk walks basics too', KW,
     'const nonbasic = (id) => typesOf(state, id).includes("Land") && !(characteristicsOf(state, id).supertypes ?? []).includes("Basic");',
     'const nonbasic = (id) => typesOf(state, id).includes("Land");'),
    # multiplyCounters
    ('every kind of counter doubled', RES,
     'if (n > 0 && (params.counter === undefined || kind === params.counter)) addCounters(',
     'if (n > 0) addCounters('),
    ('a multiplyCounters selector ignored', RES,
     'const ids = params.selector !== undefined ? selectMatching(state, params.selector, context) : params.targets ?? [];',
     'const ids = params.targets ?? [];'),
    # Ram Through
    ('trample excess never dealt to the controller', RES,
     "if (params.trampleExcess === true && source !== null && keywordsOf(state, source).includes(\"Trample\"))",
     'if (false)'),
    ('trample excess dealt without trample', RES,
     "if (params.trampleExcess === true && source !== null && keywordsOf(state, source).includes(\"Trample\"))",
     'if (params.trampleExcess === true && source !== null)'),
    ('the creature dealt it all, the excess too', RES,
     '      hit.amount = amount - excess;\n',
     ''),
    # Fog, Gisela
    ('Fog prevents nothing', REP, '    if (how.all === true) return true;\n', ''),
    ('Gisela halves nothing', REP, '    if (ability.change.preventHalf === true) next.amount = Math.floor(next.amount / 2);\n', ''),
    # removeFromCombat
    ('removed from combat, it stays in', PERM,
     'for (const id of params.targets ?? []) if (state.objects[id]?.zone === "battlefield") removeFromCombat(state, id);',
     'void params;'),
    ('removeFromCombat not a primitive', EFF, '  removeFromCombat: leaveCombat,\n', ''),
    # Modified
    ('an Equipment no modification', LAY,
     'return (o.subtypes ?? []).includes("Equipment") || ((o.subtypes ?? []).includes("Aura") && o.controller === controller);',
     'return (o.subtypes ?? []).includes("Aura") && o.controller === controller;'),
    ('an opponent\'s Aura a modification', LAY,
     'return (o.subtypes ?? []).includes("Equipment") || ((o.subtypes ?? []).includes("Aura") && o.controller === controller);',
     'return (o.subtypes ?? []).includes("Equipment") || (o.subtypes ?? []).includes("Aura");'),
    ('a counter no modification', LAY,
     'export const isModified = (state, id, counters, controller) => Object.values(counters ?? {}).some((n) => n > 0)\n  ||',
     'export const isModified = (state, id, counters, controller) => false\n  ||'),
    ('a layer static ignores modified', LAY,
     '  if (rule.modified !== undefined && isModified(state, current.id, current.counters, current.controller) !== rule.modified) return false;\n',
     ''),
    ('a selector ignores modified', FIL,
     '    if (selector.modified !== undefined && isModified(state, id, object.counters, controllerOf(state, id)) !== selector.modified) return false;\n',
     ''),
    # Protection from a subtype
    ('protection from Humans protects from nothing', PROT,
     'if ((from?.subtypes ?? []).some((type) => subtypes.includes(type))) return true;',
     ''),
    ('protection from a subtype refused', IDX,
     'Object.keys(from).every((k) => ["colors", "types", "subtypes", "multicolored"].includes(k))',
     'Object.keys(from).every((k) => ["colors", "types", "multicolored"].includes(k))'),
    # Bludgeon Brawl
    ('nonTypes ignored by the layers', LAY,
     '  if (rule.nonTypes && rule.nonTypes.some((type) => current.types.includes(type))) return false;\n', ''),
    ('nonSubtypes ignored by the layers', LAY,
     '  if (rule.nonSubtypes && rule.nonSubtypes.some((type) => current.subtypes.includes(type))) return false;\n', ''),
    ('a later part reaches everything', LAY,
     'const reaches = (effect) => (effect.affects?.continued === true ? begun.has(effect.partOf) : affects(state, effect, current, sourceOf(effect)));',
     'const reaches = (effect) => affects(state, effect, current, sourceOf(effect));'),
    ('equip {X} not the mana value', LAY,
     'return applyEffect(current, effect.apply?.manaValueX === true ? withManaValueX(state, id, effect) : effect);',
     'return applyEffect(current, effect);'),
    ('the parts applied not kept', LAY, '  partsOn.set(current, [...begun]);\n', ''),
    ('a layer-7 amount counted for nothing', LAY,
     'const now = counts ? counted(state, effect, id) : uncounted(effect);',
     'const now = counts ? counted(state, effect) : uncounted(effect);'),
    ('attached to anything, not it', FIL,
     '    if (selector.attachedTo === "it" && (context.affected === undefined || context.affected === null || state.objects[id]?.attachedTo !== context.affected)) return false;\n',
     ''),
    ('a printed Equipment counted as made one', FIL,
     '    if (selector.affectedBy === "self" && !partsApplied(state, id).some((part) => part.startsWith(`${context.source}|`))) return false;\n',
     ''),
    ('the new selector keys refused', FIL, '  "attachedTo", "affectedBy",\n', ''),
    ('an amount\'s affected object dropped', AMT,
     '    ...(context.affected !== undefined && context.affected !== null ? {affected: context.affected} : {})};',
     '    };'),
    ('a later part refused by the schema', SCH,
     'else if (ability.affects.continued === true && ability.rule === undefined && Object.keys(ability.affects).length === 1) { /* the earlier part\'s objects */ }',
     'else if (false) {}'),
    ('704.5n reads printed subtypes', SBA,
     'const equipment = subtypesOf(state, id).includes("Equipment");',
     'const equipment = (object.subtypes ?? []).includes("Equipment");'),
    # totalManaValue of a selector
    ('totalManaValue of a selector counts nothing', AMT,
     '  else if ("totalManaValue" in value && value.totalManaValue !== "remembered")\n',
     '  else if (false)\n'),
    ('totalManaValue\'s selector not held to the grammar', AMT,
     '    catch (error) { problems.push(`What totalManaValue counts: ${error.message}`); }\n',
     '    catch { /* nothing */ }\n'),
    # Moraug
    ('attacks this turn counted as none', AMT,
     'else if ("attacksThisTurn" in value) n = context.affected !== undefined && context.affected !== null ? usesThisTurn(state, context.affected, "attacked") : 0;',
     'else if ("attacksThisTurn" in value) n = 0;'),
    ('attacksThisTurn of anything', AMT,
     '  if ("attacksThisTurn" in value && value.attacksThisTurn !== "it") problems.push(\'attacksThisTurn is "it"\');\n', ''),
    ('your main phase any time', COND,
     'if (condition.yourMainPhase === true && !(state.activePlayer === controller && ["MAIN1", "MAIN2"].includes(state.phase))) return false;',
     ''),
    ('yourMainPhase false allowed', COND,
     '  if ("yourMainPhase" in condition && condition.yourMainPhase !== true) problems.push("yourMainPhase is true");\n', ''),
    ('an added combat with no trigger of its own', PERM,
     '  if (tag) delayedTrigger(state, {at: "that combat", tag, text: params.atBeginning.text, effects: params.atBeginning.effects}, context);\n', ''),
    ('the delayed trigger loses its combat', PERM,
     '        ...(params.at === "that combat" ? {tag: params.tag} : {})}),',
     '        }),'),
    ('every added combat numbered the next', TURN, '      combats += 1;\n', ''),
    ('that combat\'s trigger outlives its turn', TURN,
     '    if ((state.delayedTriggers ?? []).some((d) => d.at === "that combat")) state.delayedTriggers = state.delayedTriggers.filter((d) => d.at !== "that combat");\n', ''),
    ('the beginning of combat no moment', TRIG,
     'COMBAT_DECLARE_ATTACKERS: "declare attackers", COMBAT_BEGIN: "beginning of combat"}',
     'COMBAT_DECLARE_ATTACKERS: "declare attackers"}'),
    ('that combat\'s trigger at any combat', TRIG,
     '&& d.at === "that combat" && d.turn === state.turn && d.combat === state.combatsThisTurn));',
     '&& d.at === "that combat" && d.turn === state.turn));'),
]
