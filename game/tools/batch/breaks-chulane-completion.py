# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Deliberate D2 faults, each run from a green baseline; every source restored afterward."""
import json
SUITES = ['tests/engine-chulane-completion.mjs']
CONDITION='game/engine/script/condition.mjs'
ZONE='game/engine/script/effects/zones.mjs'
COMBAT='game/engine/keywords/combat.mjs'
BREAKS=[
 ('name condition ignored',CONDITION,'if (condition.uniqueCreatureName === true) {','if (false) {'),
 ('missing subject passes',CONDITION,'if (name === undefined) return false;','if (name === undefined) return true;'),
 ('lost subject forgets name',CONDITION,'object ? object.card : about?.was?.name','object ? object.card : undefined'),
 ('nameless creatures share name',CONDITION,'if (name !== null) {','if (true) {'),
 ('self counts as duplicate',CONDITION,'other !== id && state.objects[other].card === name','state.objects[other].card === name'),
 ('ownership replaces control',CONDITION,'controllerOf(state, other) === controller','state.objects[other].owner === controller'),
 ('printed types replace layers',CONDITION,'typesOf(state, other).includes("Creature")','state.objects[other].types.includes("Creature")'),
 ('noncreature permanent counts',CONDITION,'&& typesOf(state, other).includes("Creature")',''),
 ('graveyard ignored',CONDITION,'if (cardsIn(state, "graveyard", controller).some','if (false && cardsIn(state, "graveyard", controller).some'),
 ('graveyard token counts as a card',CONDITION,'&& !state.objects[other].token',''),
 ('noncreature graveyard card counts',CONDITION,'&& state.objects[other].types.includes("Creature")',''),
 ('false predicate accepted',CONDITION,'if ("uniqueCreatureName" in condition && condition.uniqueCreatureName !== true) problems.push("uniqueCreatureName is true");',''),
 ('pending subject forgotten',ZONE,'[...state.stack, ...(state.pendingTriggers ?? [])]','state.stack'),
 ('stack subject forgotten',ZONE,'[...state.stack, ...(state.pendingTriggers ?? [])]','(state.pendingTriggers ?? [])'),
 ('entry replacement uses owner',ZONE,'player: enteringController, types: asDown','player: object.owner, types: asDown'),
 ('entry counters use owner',ZONE,'state.objects[moved].controller = enteringController','state.objects[moved].controller = object.owner'),
 ('aura host uses owner',ZONE,'enchantable(state, object.enchant, enteringController)','enchantable(state, object.enchant, object.owner)'),
 ('arrival event names owner',ZONE,'playerId: destination === "battlefield" ? enteringController : holder','playerId: holder'),
 ('search recipient dropped','game/engine/script/effects/asking.mjs','controller: awaiting.controller, tapped: where.tapped','controller: null, tapped: where.tapped'),
 ('forestwalk ignored',COMBAT,'if (has(state, attackerId, "Forestwalk")) {','if (false) {'),
 ('forestwalk affects every attacker',COMBAT,'if (has(state, attackerId, "Forestwalk")) {','if (true) {'),
 ('any opponent forest prevents block',COMBAT,'controllerOf(state, id) === defender','controllerOf(state, id) !== controllerOf(state, attackerId)'),
 ('forestwalk reads printed control',COMBAT,'controllerOf(state, id) === defender','state.objects[id].controller === defender'),
 ('forestwalk ignores Land type',COMBAT,'&& typesOf(state, id).includes("Land")',''),
 ('forestwalk ignores Forest subtype',COMBAT,'&& subtypesOf(state, id).includes("Forest")',''),
 ('forestwalk ignores subtype layers',COMBAT,'subtypesOf(state, id).includes("Forest")','state.objects[id].subtypes.includes("Forest")'),
 ('forestwalk not executable','game/engine/vocabulary.mjs','"forestwalk",',''),
]
def card_fault(name,path,mutate):
 with open(path,encoding='utf-8') as f: original=f.read()
 doc=json.loads(original);mutate(doc)
 BREAKS.append((name,path,original,json.dumps(doc,indent=2,ensure_ascii=False)+'\n'))
J='game/engine/cards/c/claim-jumper.json'
card_fault('second search condition omitted',J,lambda d:d['abilities'][1]['effects'][1].pop('condition'))
card_fault('searches always shuffle',J,lambda d:d['abilities'][1]['effects'][2].pop('condition'))
card_fault('trigger land comparison omitted',J,lambda d:d['abilities'][1].pop('condition'))
card_fault('first search not optional',J,lambda d:d['abilities'][1]['effects'].__setitem__(0,d['abilities'][1]['effects'][0]['modes'][0]['effects'][0]))
card_fault('second search not optional',J,lambda d:d['abilities'][1]['effects'].__setitem__(1,d['abilities'][1]['effects'][1]['modes'][0]['effects'][0]))
G='game/engine/cards/g/guardian-project.json'
card_fault('tokens trigger Project',G,lambda d:d['abilities'][0]['trigger']['filter'].pop('token'))
card_fault('opponent triggers Project',G,lambda d:d['abilities'][0]['trigger']['filter'].pop('controller'))
Y='game/engine/cards/y/yavimaya-dryad.json'
card_fault('Dryad searches basic only',Y,lambda d:d['abilities'][1]['effects'][0]['selector'].update({'supertypes':['Basic']}))
card_fault('Dryad forgets target recipient',Y,lambda d:d['abilities'][1]['effects'][0].pop('controller'))
card_fault('Dryad search compulsory',Y,lambda d:d['abilities'][1].pop('optional'))
