# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Actual declarations, damage choices, reload, final life/zones, and explicit pilot decisions.
SUITES = ['tests/engine-load100-w0-combat.mjs', 'tests/engine-planeswalkers.mjs']
COMBAT = 'game/engine/rules/combat.mjs'
KEYWORDS = 'game/engine/keywords/combat.mjs'
CONTROLLER = 'game/engine/controller.mjs'
PILOT = 'game/engine/pilots/house-pilot.mjs'
BREAKS = [
    ('variant scripts validate', 'game/engine/vocabulary.mjs', '  "trample over planeswalkers",', ''),
    ('variant registered', KEYWORDS, '"Trample", "Trample Over Planeswalkers", "Lifelink"', '"Trample", "Lifelink"'),
    ('variant tramples over blockers', KEYWORDS, 'has(state, id, "Trample") || has(state, id, "Trample Over Planeswalkers")', 'has(state, id, "Trample")'),
    ('walker is still on battlefield', COMBAT, '&& onBattlefield(state, attack.planeswalker) && !state.players[attack.defender].lost', '&& !state.players[attack.defender].lost'),
    ('walker controller is still defender', COMBAT, 'controllerOf(state, attack.planeswalker) === attack.defender;', 'true;'),
    ('departed walker spills to original defender', COMBAT, ': hasNow(state, attack.attacker, "Trample Over Planeswalkers") && !state.players[attack.defender].lost', ': false && !state.players[attack.defender].lost'),
    ('ordinary trample never spills past departed walker', COMBAT, ': hasNow(state, attack.attacker, "Trample Over Planeswalkers") && !state.players[attack.defender].lost', ': hasTrample(state, attack.attacker) && !state.players[attack.defender].lost'),
    ('unblocked variant asks division', COMBAT, '&& potentialWalkerDamage(state, a, step) > (state.objects[a.planeswalker].counters?.loyalty ?? 0)', '&& false'),
    ('assignment respects the actual damage step', COMBAT, 'if (!onBattlefield(state, a.attacker) || !dealsIn(state, a.attacker, step) || power(state, a.attacker) <= 0)', 'if (!onBattlefield(state, a.attacker) || !dealsIn(state, a.attacker, "first") || power(state, a.attacker) <= 0)'),
    ('loyalty counts other simultaneous damage', COMBAT, '- otherWalkerDamage(state, attack, step));', '- 0);'),
    ('other loyalty damage belongs to this step', COMBAT, 'state.combat.attacks.filter(other => other !== attack && other.planeswalker === attack.planeswalker\n    && onBattlefield(state, other.attacker) && dealsIn(state, other.attacker, step))', 'state.combat.attacks.filter(other => other !== attack && other.planeswalker === attack.planeswalker\n    && onBattlefield(state, other.attacker))'),
    ('loyalty threshold offered', COMBAT, 'amount: walkerLethal(state, attack, awaiting.step ?? "regular")', 'amount: 0'),
    ('loyalty threshold validated', CONTROLLER, 'if (choice.simultaneousReview !== true && (target.requires ?? []).some(requirement => amounts[requirement.index] < requirement.amount))', 'if (false)'),
    ('variant controller recipient offered', COMBAT, 'if (hasNow(state, awaiting.attacker, "Trample Over Planeswalkers") && planeswalkerInCombat(state, attack)) {', 'if (false) {'),
    ('ordinary trample cannot gain variant recipient', COMBAT, 'if (hasNow(state, awaiting.attacker, "Trample Over Planeswalkers") && planeswalkerInCombat(state, attack)) {', 'if (hasTrample(state, awaiting.attacker) && planeswalkerInCombat(state, attack)) {'),
    ('shared allocation review opened', COMBAT, 'if (shared && state.combat.damageReview?.step !== step)', 'if (false)'),
    ('shared assignments may cooperate', CONTROLLER, 'choice.simultaneousReview !== true && (target.requires ?? [])', '(target.requires ?? [])'),
    ('all creatures assigned before confirmation', COMBAT, 'if (attacks.some(a => a.assignment?.step !== step))', 'if (false)'),
    ('concession rechecks saved allocation against live power', COMBAT, 'if (JSON.stringify(recipients) !== JSON.stringify(attack.assignment.recipients) || damageAssignmentProblem(choice, amounts))', 'if (false)'),
    ('joint loyalty threshold validated', COMBAT, '&& hits.filter(hit => hit.id === a.planeswalker).reduce((n, hit) => n + hit.amount, 0) < (state.objects[a.planeswalker].counters?.loyalty ?? 0))', '&& false)'),
    ('joint blocker threshold validated', COMBAT, '&& dealt.reduce((n, hit) => n + hit.amount, state.objects[id].damage ?? 0) < toughnessOf(state, id))', '&& false)'),
    ('selection waits for confirmation', COMBAT, 'if (state.combat.damageReview.confirmed) return false;', 'if (true) return false;'),
    ('source selection is resumable', COMBAT, 'if (state.awaiting?.kind === "assign-combat-damage" && state.awaiting.step === step) return true;', 'if (false) return true;'),
    ('walker assignment dealt even unblocked', COMBAT, 'if (attack.assignment?.step === step) {', 'if (attack.blocked && attack.assignment?.step === step) {'),
    ('player allocation is separate from walker', COMBAT, 'choice.options.filter((o) => o.defender && !o.overPlaneswalker)', 'choice.options.filter((o) => o.defender)'),
    ('player excess dealt', COMBAT, 'if (attack.assignment.toPlayer > 0 && !state.players[attack.defender].lost)', 'if (false)'),
    ('pilot selects unassigned source', PILOT, 'choice.options.find(option => option.damageAssigned === false)', 'choice.options.find(option => option.damageAssigned === true)'),
    ('pilot confirms complete allocations', PILOT, 'choice.options.find(option => option.confirmDamage)', 'choice.options[0]'),
    ('pilot respects loyalty prerequisite', PILOT, 'for (const option of options) for (const requirement of option.requires ?? []) {', 'for (const option of []) for (const requirement of option.requires ?? []) {'),
    ('house pilot uses explicit combat source choice', PILOT, 'if (combatSource) return combatSource;', 'if (false) return combatSource;'),
    ('random pilot uses explicit combat source choice', 'game/engine/pilots/random-legal.mjs', 'if (combatSource) return combatSource;', 'if (false) return combatSource;'),
    ('room fallback uses explicit combat source choice', 'game/room/room.mjs', 'if (combatSource) return combatSource;', 'if (false) return combatSource;'),
]
