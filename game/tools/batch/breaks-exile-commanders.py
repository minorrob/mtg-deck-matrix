# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Linked-exile commander faults. Sources restored after every run."""
import json
SUITES=['tests/engine-exile-commanders.mjs','tests/engine-may-play.mjs','tests/engine-adventure.mjs']
A='game/engine/rules/actions.mjs';Z='game/engine/script/effects/zones.mjs';S='game/engine/rules/stack.mjs';F='game/engine/script/filter.mjs'
BREAKS=[
 ('permission loses source context',A,'{controller: player, source})))','{controller: player})))'),
 ('exile permission unavailable',A,'ability.zone === "exile" ? state.zones.exile : []','ability.zone === "exile" ? [] : []'),
 ('permission leaks to other player',A,'e.rule === "may-play" && e.player === player','e.rule === "may-play"'),
 ('resolved permission loses free flag',A,'free: e.free === true','free: false'),
 ('riders are not distinct offers',A,'ability.free === true, ability.graveyardToLibraryBottom === true','false, false'),
 ('cast loses bottom rider',A,'if (permission?.ability.graveyardToLibraryBottom) entry.graveyardToLibraryBottom = true;',''),
 ('no-cost spell never castable',A,'if (!object.manaCost && lifeCost === null && !(permit?.ability.free || freeCast(state, player, id)))','if (!object.manaCost && lifeCost === null)'),
 ('free permission cannot pay',A,'permission?.ability.free ? {source: permission.source, limited: false}','false ? {source: permission.source, limited: false}'),
 ('adventure may repeat itself',A,'!(ability.notAdventure && state.objects[id].face === "adventure")','true'),
 ('adventure candidates require main face',A,'...allPlayPermissions(state, player).flatMap(({ability}) => permittedFrom(state, player, ability))','...[]'),
 ('link forgets old source',Z,'const links = (state.links ??= {}), source = linkOf(context);','const links = (state.links ??= {}), source = context.source;'),
 ('linked exile forgets turn',Z,'state.objects[id].exiledTurn = state.turn','state.objects[id].exiledTurn = -1'),
 ('move ignores bottom rider',Z,'state.stack[leaving].graveyardToLibraryBottom && proposal.to === "graveyard"','false && proposal.to === "graveyard"'),
 ('counter ignores bottom rider',Z,'params.to === "top" || entry.graveyardToLibraryBottom ? "library"','params.to === "top" ? "library"'),
 ('counter always puts on top',Z,'if (to === "library" && params.to === "top" && moved','if (to === "library" && moved'),
 ('resolve ignores bottom rider',S,'entry.graveyardToLibraryBottom ? "library" : "graveyard"','"graveyard"'),
 ('resolution names caster as library owner',S,'["graveyard", "library"].includes(to) ? owner : entry.playerId','to === "graveyard" ? owner : entry.playerId'),
 ('commander fizzle silently bottoms',S,'if (to === "library" && object.commander === true)','if (false)'),
 ('commander continuation not resumed',S,'if (state.finishingSpell && !resolutionPending(state))','if (false)'),
 ('stale turn accepted',F,'object.exiledTurn === state.turn','true'),
]
BREAKS += [
 ('free cast offers lands',A,'if (isLand(object)) return actions;',''),
 ('static source uses printed control',A,'controllerOf(state, source) === player','holder.controller === player'),
 ('static source keeps lost abilities',A,'abilitiesOf(state, source).filter(isPlay)','(holder.abilities ?? []).filter(isPlay)'),
]
def card_fault(label,path,fn):
 original=open(path).read();d=json.loads(original);fn(d);BREAKS.append((label,path,original,json.dumps(d,indent=2)+'\n'))
Q='game/engine/cards/q/quintorius-loremaster.json';M='game/engine/cards/m/maralen-fae-ascendant.json'
card_fault('Quintorius no Spirit',Q,lambda d:d['abilities'][1]['effects'].pop())
card_fault('Quintorius does not link',Q,lambda d:d['abilities'][1]['effects'][0].pop('link'))
card_fault('Quintorius permission not free',Q,lambda d:d['abilities'][2]['effects'][0].pop('free'))
card_fault('Quintorius permission lacks bottom',Q,lambda d:d['abilities'][2]['effects'][0].pop('graveyardToLibraryBottom'))
card_fault('Maralen ignores linkage',M,lambda d:d['abilities'][2]['spells'].pop('exiledWith'))
card_fault('Maralen ignores turn',M,lambda d:d['abilities'][2]['spells'].pop('exiledThisTurn'))
card_fault('Maralen ignores cast limit',M,lambda d:d['abilities'][2].pop('limit'))
card_fault('Maralen counts creatures only',M,lambda d:d['abilities'][2]['spells']['manaValue']['max']['count'].update({'types':['Creature']}))
card_fault('Maralen counts enemy permanents',M,lambda d:d['abilities'][2]['spells']['manaValue']['max']['count'].pop('controller'))
card_fault('Maralen triggers on enemies',M,lambda d:d['abilities'][1]['trigger']['filter'].pop('controller'))
card_fault('Maralen triggers on creatures only',M,lambda d:d['abilities'][1]['trigger']['filter'].update({'types':['Creature']}))

card_fault('Quintorius lasts an extra turn',Q,lambda d:d['abilities'][2]['effects'][0].update({'until':'your-next-end'}))

BREAKS += [
 ('granted static ignored',A,'const mayGain = (state.effects','const mayGain = false && (state.effects'),
 ('permission id collision',Z,'while (effects.some(e => e.id === id))','while (false)'),
 ('false turn predicate accepted',F,'if (selector.exiledThisTurn !== undefined && selector.exiledThisTurn !== true) throw new Error("exiledThisTurn is true");',''),
]
