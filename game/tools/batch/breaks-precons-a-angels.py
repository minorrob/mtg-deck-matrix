# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of the six precons on the Decks screen (2026-10-25), lane A (Calling All Angels): one break for each engine change.

- "Return this card to its owner's hand" (Angelic Destiny; CR 400.7, 704.5m): the card an Aura became in the graveyard --
  state/index.mjs `wasPermanent`, rules/trigger.mjs and rules/stack.mjs `sourceWas`, script/resolution.mjs, script/bind.mjs.
- A block tax (Archangel of Tithes; CR 509.1d-f): rules/statics.mjs `blockTax`, rules/combat.mjs (the record's budget, the
  payment, its question, a check), rules/turn.mjs, cards/index.mjs, and the house and scored pilots kept to it.
- "If an opponent has more life than you" (Linvala, the Preserver) and "for each opponent who has more cards in hand than
  you" (Wojek Investigator): script/amount.mjs `lifeTotal: "an opponent"`, `opponentsWithMore`.
- "Whenever you gain life for the first time each turn" (Vanguard Seraph; CR 119.9): script/effects/resources.mjs and
  rules/combat.mjs (lifelink), rules/trigger.mjs, cards/index.mjs.
- "You can't cast Serra Avenger during your first, second, or third turns of the game": rules/turn.mjs `turnsTaken`,
  script/condition.mjs `pastYourFirstTurns`.
- An alternative cost that taps creatures (Sephara, Sky's Blade; CR 118.9): rules/actions.mjs (alternativeCosts, the question,
  the payment, its words) and cards/index.mjs.

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-precons-a-angels.py
"""
SUITES = ['tests/engine-precons-a.mjs']
SI = 'game/engine/state/index.mjs'
BI = 'game/engine/script/bind.mjs'
TR = 'game/engine/rules/trigger.mjs'
SK = 'game/engine/rules/stack.mjs'
RE = 'game/engine/script/resolution.mjs'
AM = 'game/engine/script/amount.mjs'
RS = 'game/engine/script/effects/resources.mjs'
CB = 'game/engine/rules/combat.mjs'
IX = 'game/engine/cards/index.mjs'
CO = 'game/engine/script/condition.mjs'
TU = 'game/engine/rules/turn.mjs'
ST = 'game/engine/rules/statics.mjs'
HP = 'game/engine/pilots/house-pilot.mjs'
SP = 'game/engine/pilots/scored-pilot.mjs'
AC = 'game/engine/rules/actions.mjs'
BREAKS = [
    # Angelic Destiny
    ('the graveyard card keeps no record of the permanent', SI, 'state.objects[arrived].wasPermanent = from.id;', 'void 0;'),
    ('"this card" never bound', BI,
     '  if (bound.targets === "this card") bound.targets = state ? thisCardInGraveyard(state, context.source ?? context.sourceWas) : [];\n', ''),
    ('"this card" only of a source still there', BI, 'thisCardInGraveyard(state, context.source ?? context.sourceWas)', 'thisCardInGraveyard(state, context.source)'),
    ('"this card" finds nothing in a graveyard', BI, 'if (state.objects[id]?.wasPermanent === source) return [id];', 'void 0;'),
    ('the trigger forgets its gone source', TR, 'entry.sourceWas = trigger.source.cardId;', 'void 0;'),
    ('the resolution context forgets it', SK, '    ...(entry.sourceWas !== undefined ? {sourceWas: entry.sourceWas} : {}),\n', ''),
    ('the resolution queue forgets it', RE, '      ...(context.sourceWas !== undefined ? {sourceWas: context.sourceWas} : {}),\n', ''),
    # Linvala, Wojek Investigator
    ('opponentsWithMore not a kind of amount', AM, '  "opponentsWithMore"]);', '  ]);'),
    ('opponentsWithMore not held to the selector grammar', AM,
     '    try { compileSelector(value.opponentsWithMore ?? {}); } catch (error) { problems.push(`What opponentsWithMore counts: ${error.message}`); }\n', ''),
    ('"an opponent" read as you', AM, 'if (value.lifeTotal === "an opponent") n = Math.max', 'if (false) n = Math.max'),
    ('"an opponent" counts one who has left', AM,
     'state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => p.life));', 'state.players.filter((p) => p.id !== context.controller).map((p) => p.life));'),
    ('as many cards counted as more', AM, '{...who, controller: p.id}).length > mine).length;', '{...who, controller: p.id}).length >= mine).length;'),
    ('opponentsWithMore counts one who has left', AM,
     '    n = state.players.filter((p) => p.id !== context.controller && !p.lost\n      && matching(state, value.opponentsWithMore',
     '    n = state.players.filter((p) => p.id !== context.controller\n      && matching(state, value.opponentsWithMore'),
    # Vanguard Seraph
    ('no gain marked the first', RS, 'const firstGain = delta > 0 && !(state.players[player].gainedThisTurn > 0);', 'const firstGain = false;'),
    ('a lifelink gain never the first', CB, 'const firstGain = gained > 0 && !(state.players[gains].gainedThisTurn > 0);', 'const firstGain = false;'),
    ('every gain triggers "the first time"', TR, '    if (condition.firstThisTurn && fields.firstGainThisTurn !== true) return [];\n', ''),
    ('"the first time" dropped from the trigger', IX, ', ...(t.firstThisTurn === true ? {firstThisTurn: true} : {})})', '})'),
    # Serra Avenger
    ('pastYourFirstTurns not a condition', CO, '  "pastYourFirstTurns",\n', ''),
    ('pastYourFirstTurns on anyone\'s turn', CO, 'if (Number.isInteger(condition.pastYourFirstTurns) && state.activePlayer === controller\n',
     'if (Number.isInteger(condition.pastYourFirstTurns)\n'),
    ('pastYourFirstTurns always past', CO, '&& (state.players[controller]?.turnsTaken ?? 0) <= condition.pastYourFirstTurns) return false;', '&& false) return false;'),
    ('pastYourFirstTurns takes anything', CO, 'if ("pastYourFirstTurns" in condition && !(', 'if (false && !('),
    ('the starting player\'s first turn uncounted', TU, 'state.players[startingPlayer].turnsTaken = 1;', 'void 0;'),
    ('no turn counted as it begins', TU, 'state.players[state.activePlayer].turnsTaken = (state.players[state.activePlayer].turnsTaken ?? 0) + 1;', 'void 0;'),
    # Archangel of Tithes
    ('block-tax not a rule', ST, '  "block-tax": "rules/combat.mjs",\n', ''),
    ('block-tax with a condition refused', IX, '  "block-tax",\n', ''),
    ('a block taxed whether the Archangel attacks or not', ST,
     'ability.rule === "block-tax"\n      && conditionHolds(state, ability.condition, {controller: holder.controller, source: holderId}))', 'ability.rule === "block-tax")'),
    ('a creature blocking twice taxed twice', ST, 'const creatures = new Set(picked.map((o) => o.cardId)).size;', 'const creatures = picked.length;'),
    ('every block taxed once', ST, '{controller: holder.controller, source: holderId}) * creatures;', '{controller: holder.controller, source: holderId});'),
    ('the record has no block tax', CB, 'const taxes = options.map((o) => blockTax(state, [o]));', 'const taxes = options.map(() => 0);'),
    ('the record\'s options say no cost', CB, '    if (taxes.some((n) => n > 0)) options.forEach((o, i) => { if (taxes[i] > 0) o.mana = taxes[i]; });\n', ''),
    ('a block tax never paid', CB, '    const tax = blockTax(state, picked);\n    if (tax > 0) {', '    const tax = 0;\n    if (tax > 0) {'),
    ('which mana pays it never asked', CB, '      if (paymentIsAChoice(units, tax)) {\n        state.awaiting = {kind: "block-tax"', '      if (false) {\n        state.awaiting = {kind: "block-tax"'),
    ('the blocks forgotten once it is paid', CB, '    return declareBlocks(state, awaiting.player, awaiting.picked, events);', '    return events;'),
    ('a check never says the blocks cost too much', CB, 'const due = choice.budget ? blockTax(state, picked) : 0;', 'const due = 0;'),
    ('the block tax question never put', TU, '  if (awaiting.kind === "block-tax") return blockers.taxChoice(state, awaiting);\n', ''),
    ('the block tax answer never paid', TU, 'const events = blockers.payTax(state, awaiting, indices);', 'const events = [];'),
    ('the house pilot blocks by the budget alone', HP, '&& !id.startsWith("declare-attackers:") && !id.startsWith("declare-blockers:")) {', '&& !id.startsWith("declare-attackers:")) {'),
    ('the house pilot blocks past the budget', HP, 'keptWithin(choice, picks.slice(0, Math.max(min, Math.min(max, picks.length))))', 'picks.slice(0, Math.max(min, Math.min(max, picks.length)))'),
    ('the scored pilot blocks past the budget', SP,
     'keptWithin(choice, indices.slice(0, Math.max(choice.min ?? 0, Math.min(choice.max ?? indices.length, indices.length))))',
     'indices.slice(0, Math.max(choice.min ?? 0, Math.min(choice.max ?? indices.length, indices.length)))'),
    # Sephara, Sky's Blade
    ('an alternative cost offered with too few to tap', AC, '    if (tap && flashbackTappers(state, player, tap).length < tap.count) return [];\n', ''),
    ('an alternative cost says nothing of tapping', AC, '      ...(tap ? {tap} : {}),\n', ''),
    ('which creatures to tap never asked', AC, '  if (graveWay?.tap && !Array.isArray(action.flashbackTap))\n', '  if (false)\n'),
    ('the cast taken before the creatures are picked', AC,
     '      || (action.alternative !== undefined && alternativeCosts(state, player, action.objectId).find((w) => w.index === action.alternative)?.tap))) {',
     '      || false)) {'),
    ('the picked creatures never tapped', AC, '(back?.tap ?? way?.tap) && !during', 'back?.tap && !during'),
    ('a wrong set refused as a flashback\'s', AC, 'back?.tap ? "for its flashback" : "for it"', '"for its flashback"'),
    ('the question leaves out "with flying"', AC,
     '${(tap.selector?.keywords ?? []).length ? ` with ${tap.selector.keywords.map((k) => String(k).toLowerCase()).join(" and ")}` : ""}', ''),
    ('a tapping alternative cost refused', IX,
     'if (!(atom?.atom === "tapCreature" && Number.isInteger(atom.count) && atom.count >= 1 && atom.selector && typeof atom.selector === "object"))', 'if (true)'),
    ('a tapping alternative cost with no count taken', IX,
     'if (!(atom?.atom === "tapCreature" && Number.isInteger(atom.count) && atom.count >= 1 && atom.selector && typeof atom.selector === "object"))',
     'if (!(atom?.atom === "tapCreature"))'),
]
