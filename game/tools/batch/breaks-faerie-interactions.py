# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import json
SUITES=['tests/engine-faerie-interactions.mjs']
T='game/engine/rules/turn.mjs';Z='game/engine/script/effects/zones.mjs';F='game/engine/script/filter.mjs';C='game/engine/cards/index.mjs'
BREAKS=[
 ('redirected move counts as draw',Z,'moved !== null && state.objects[moved]?.zone === "hand"','moved !== null'),
 ('step draw loses ordinal',T,'drawn: true, drawNumber: recordDraw(state, player)','drawn: true'),
 ('effect draw loses ordinal',Z,'fields.drawNumber = recordDraw(state, player);',''),
 ('draw count never resets',T,'if (player.drawnThisTurn) player.drawnThisTurn = 0;',''),
 ('draws always numbered first','game/engine/state/index.mjs','who.drawnThisTurn = (who.drawnThisTurn ?? 0) + 1','who.drawnThisTurn = 1'),
 ('ordinal trigger ignored','game/engine/rules/trigger.mjs','if (condition.nthThisTurn !== undefined && fields.drawNumber !== condition.nthThisTurn) return [];',''),
 ('ordinal compares final count','game/engine/rules/trigger.mjs','fields.drawNumber !== condition.nthThisTurn','state.players[fields.to.player.playerId].drawnThisTurn !== condition.nthThisTurn'),
 ('X always zero',F,'manaValue(parseManaCost(cost), {x})','manaValue(parseManaCost(cost))'),
 ('unequal constraint ignored',F,'if (selector.unequalPowerToughness === true)','if (false)'),
 ('unequal uses printed power',F,'if ((c.power ?? 0) === (c.toughness ?? 0))','if ((object.power ?? 0) === (object.toughness ?? 0))'),
 ('inequality only one direction',F,'if ((c.power ?? 0) === (c.toughness ?? 0))','if ((c.power ?? 0) >= (c.toughness ?? 0))'),
 ('false inequality accepted',F,'if (selector.unequalPowerToughness !== undefined && selector.unequalPowerToughness !== true) throw new Error("unequalPowerToughness is true");',''),
 ('invalid ordinal accepted',C,'t.nthThisTurn === undefined || (Number.isInteger(t.nthThisTurn) && t.nthThisTurn >= 1)','true'),
]
def card_fault(label,path,fn):
 original=open(path).read();d=json.loads(original);fn(d);BREAKS.append((label,path,original,json.dumps(d,indent=2)+'\n'))
P='game/engine/cards/f/faerie-mastermind.json';S='game/engine/cards/s/spellstutter-sprite.json';G='game/engine/cards/g/gilt-leaf-winnower.json'
card_fault('own draw triggers Mastermind',P,lambda d:d['abilities'][2]['trigger'].update({'drawer':'any'}))
card_fault('Mastermind activation draws only self',P,lambda d:d['abilities'][3]['effects'][0].pop('who'))
card_fault('Sprite counts opposing Faeries',S,lambda d:d['abilities'][2]['targets'][0]['manaValue']['max']['count'].pop('controller'))
card_fault('Sprite counts creatures only',S,lambda d:d['abilities'][2]['targets'][0]['manaValue']['max']['count'].update({'types':['Creature']}))
card_fault('Winnower accepts Elves',G,lambda d:d['abilities'][1]['targets'][0].pop('nonSubtypes'))
card_fault('Winnower accepts noncreatures',G,lambda d:d['abilities'][1]['targets'][0].pop('types'))
card_fault('Winnower destruction compulsory',G,lambda d:d['abilities'][1].pop('optional'))
