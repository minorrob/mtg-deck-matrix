# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of 2026-10-23, lane L2 (the graveyard): prove each engine change can fail."""
SUITES = ['tests/engine-w4d-graveyard.mjs']
REPLACEMENT = 'game/engine/rules/replacement.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
SBA = 'game/engine/rules/sba.mjs'
STACK = 'game/engine/rules/stack.mjs'
TURN = 'game/engine/rules/turn.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
FILTER = 'game/engine/script/filter.mjs'
INDEX = 'game/engine/cards/index.mjs'
ENTERING = 'game/engine/rules/entering.mjs'
BREAKS = [
 # Dauthi Voidwalker: a replacement on every route to an opponent's graveyard.
 ('a token or a copy is no card', REPLACEMENT, 'if (!holder || !moving || moving.token === true || moving.copy === true) return false;', 'if (!holder || !moving) return false;'),
 ("an opponent's graveyard only", REPLACEMENT, '      if (watches.owner === "opponent" && moving.owner === holder.controller) return false;\n', ''),
 ('the void counter on the proposal', REPLACEMENT, 'next.withCounters[counter] = (next.withCounters[counter] ?? 0) + n;', 'next.withCounters[counter] = 0;'),
 ('only a proposal with counters gives them', REPLACEMENT, 'if (!proposal?.withCounters || !moved) return;', 'if (!moved) return;'),
 ("an effect's move gives the counters", ZONES, '  if (destination === proposal.to) placeReplacedCounters(state, moved, proposal);\n', ''),
 ('a spell finishing asks the replacements', STACK, 'const replaced = planned === "graveyard" ? graveyardBound(state, entry.objectId) : null;', 'const replaced = null;'),
 ('a spell finishing gets the counters', STACK, '    placeReplacedCounters(state, arrived, replaced);\n', ''),
 ("the cleanup's discard asks the replacements", TURN, '    const bound = graveyardBound(state, id);\n', '    const bound = {to: "graveyard"};\n'),
 ("an effect's discard asks the replacements", ASKING, '  const bound = graveyardBound(state, id);\n', '  const bound = {to: "graveyard"};\n'),
 ('a discard exiled instead is still read as one', TRIGGER, 'zone: state.objects[card].zone}, state, card, {controller, source: sourceId}))) return [];', 'zone: "graveyard"}, state, card, {controller, source: sourceId}))) return [];'),
 ('a state-based death gets the counters', SBA, '        placeReplacedCounters(state, died, proposal);\n', ''),
 ('an Aura put into the graveyard gets the counters', SBA, '  placeReplacedCounters(state, fell, proposal);\n', ''),
 ('a planeswalker at no loyalty gets the counters', SBA, '      placeReplacedCounters(state, went, proposal);\n', ''),
 # Mox Diamond: its arrival held for "you may discard a land card instead".
 ('the question is asked', REPLACEMENT, '  if (ability.change?.discardInstead) next.asks = [...(next.asks ?? []), {discardInstead: structuredClone(ability.change.discardInstead)}];\n', ''),
 ('its arrival is held', ENTERING, '(q.copyOf || q.discardInstead)', 'q.copyOf'),
 ('no land card: to the graveyard', ENTERING, 'if (lands && !lands.length) { queue.shift(); putAside(state, q); continue; }', 'if (lands && !lands.length) { queue.shift(); continue; }'),
 ('discarded, its arrival is seen', ENTERING, 'discardOne(state, option.discard, awaiting.player, events); arrived(state, asked); }', 'discardOne(state, option.discard, awaiting.player, events); }'),
 ('declined, it goes to the graveyard', ENTERING, '    else putAside(state, asked);\n', ''),
 ('its route asks the replacements', ENTERING, '  const bound = graveyardBound(state, q.objectId);\n', '  const bound = {to: "graveyard"};\n'),
 ('its arrival rewritten to the graveyard', ENTERING, '  fields.to = {zoneType: bound.to[0].toUpperCase() + bound.to.slice(1), player: {playerId: object.owner}};\n', ''),
 ('its rewritten arrival is seen', ENTERING, '  collectTriggers(state, [q.arrival]);\n}\n\n/* The permanent that just entered', '}\n\n/* The permanent that just entered'),
 # Six: retrace's land card.
 ("a permission's discard is of the card described", 'game/engine/rules/actions.mjs', '\n      && (!atom.selector || compileSelector({...atom.selector, what: "card", zone: "hand"})(state, id, {controller: player, source: spellId}))), atom.count ?? 1)', '), atom.count ?? 1)'),
 ("a permission's discard is allowed", 'game/engine/script/schema.mjs', '["sacrifice", "discard"].includes(a?.atom) && a.count === undefined', 'a?.atom === "sacrifice" && a.count === undefined'),
 # Necropotence.
 ('a draw step skipped', TURN, '!playerRuleChanged(state, "skip-draw-step", state.activePlayer) && (added', '(added'),
 ('skip-draw-step is a rule', 'game/engine/rules/statics.mjs', '  "skip-draw-step": "rules/turn.mjs",\n', ''),
 # Mesmeric Orb.
 ('an untap is watched', TRIGGER, 'fields.tapped === (condition.untapped !== true)', 'fields.tapped === true'),
 ('becomes untapped says so', INDEX, '{on: "GameEventCardTapped", untapped: true, who: t.who ?? "self"', '{on: "GameEventCardTapped", who: t.who ?? "self"'),
 ("the untap step's triggers are collected", TURN, '{ untap(state, events); collectTriggers(state, events); }', '{ untap(state, events); }'),
 ('becomes untapped is a trigger event', 'game/engine/vocabulary.mjs', '  "becomes untapped",\n]);', ']);'),
 # Hedge Shredder.
 ('from the library only', INDEX, '      ...(t.from === "library" ? {from: "Library"} : {}),\n', ''),
 # Bloodchief Ascension.
 ('a graveyard arrival is about its owner', TRIGGER, ': fields.to?.zoneType === "Graveyard" ? state.objects[fields.becomes]?.owner : undefined;', ': undefined;'),
 ('an opponent who lost 2 or more', FILTER, '      if (selector.lostThisTurnAtLeast !== undefined && !((player.lostThisTurn ?? 0) >= selector.lostThisTurnAtLeast)) return false;\n', ''),
 # Bloodghast.
 ('an opponent at 10 or less', FILTER, '      if (selector.lifeAtMost !== undefined && !(player.life <= selector.lifeAtMost)) return false;\n', ''),
 ('the life keys are grammar', FILTER, '  "lifeAtMost", "lostThisTurnAtLeast",\n', ''),
 # Myr Retriever.
 ('the card its source became is known', TRIGGER, 'const became = source === null && entry.lastKnown && entry.about?.card !== undefined ? {became: entry.about.card} : {};', 'const became = {};'),
 # Breach the Multiverse.
 ("a graveyard's card is chosen, not searched for", ASKING, ' || (zone === "graveyard" && !zones);', ';'),
]
