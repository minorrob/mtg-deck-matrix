# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-209: effective modal activation, isolated permission routes and native cost review."""
SUITES = ['tests/engine-action-stages.mjs', 'tests/room-action-stages.mjs']
D = 'game/room/cast-stages.mjs'
BREAKS = [
    ('flashback silently merges with another graveyard permission', D,
     'flashback:a.flashback===true', 'flashback:false'),
    ('the selected effective ability is not part of action identity', D,
     'abilityId:a.abilityId??null', 'abilityId:null'),
    ('separate source permission identities merge', D,
     'via:a.via??null', 'via:null'),
    ('an alternative cost route silently merges into the base route', D,
     'alternative:a.alternative??null', 'alternative:null'),
    ('staging reads only the raw source abilities', D,
     'function modalOf(state,action){return offerScript(state,{...action,modes:undefined})?.modal??null;}',
     'function modalOf(state,action){return (action.kind==="cast"?state.objects[action.objectId]?.spell:state.objects[action.objectId]?.abilities.find(a=>a.id===action.abilityId))?.modal??null;}'),
    ('only casts remain in a live activated draft', D,
     'a.kind===draft.route.kind&&sameRoute', 'a.kind==="cast"&&sameRoute'),
    ('native activation costs disappear from Pay', D,
     'activation:structuredClone(script.cost??[])', 'activation:[]'),
    ('the actual nonmana escalate count is hidden', D,
     'count:action.escalateTap,selector:', 'count:0,selector:'),
    ('activated question nonces poison live-choice signatures', D,
     'const {id,castStage,actionStage,...rest}=choice;', 'const {id,castStage,...rest}=choice;'),
    ('an activation is advertised as a creature cast', 'game/room/decision.mjs',
     '{actionStages: actionEntryFor(action)}', '{castStages: actionEntryFor(action)}'),
    ('activated native funding loses its descriptive stage', 'game/room/decision.mjs',
     'awaiting?.action?.actionStage ? "actionStage" : "castStage"', 'false ? "actionStage" : "castStage"'),
    ('activated Back cannot pass the controller boundary', 'game/engine/controller.mjs',
     '(pending.castStage??pending.actionStage)?.canBack', 'pending.castStage?.canBack'),
    ('final activated Pay is submitted as casting a creature', D,
     'return {draft:null,action:{...action,[field]:', 'return {draft:null,action:{...action,kind:"cast",[field]:'),
]
