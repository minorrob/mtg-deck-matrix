# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4a, lane h2: the cards an effect moved, referred to after it (Ghostly Flicker; Displacer Kitten; Archdruid's Charm;
Twilight Prophet; Sword of Hearth and Home; Thassa, Deep-Dwelling; Scroll Rack; Sunforger; Teferi's Puzzle Box; Eldrazi
Confluence; Brago, King Eternal; Armored Skyhunter; Tezzeret, Master of the Bridge; Animist's Awakening; Nautiloid Ship;
Scholar of New Horizons; Rona, Herald of Invasion). One break for each engine change they needed -- each guard, each
branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4a-h2.py
"""
SUITES = [
    'tests/engine-remembered-moved.mjs',
    'tests/engine-cards.mjs',
]

ZONES = 'game/engine/script/effects/zones.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
SCHEMA = 'game/engine/script/schema.mjs'

BREAKS = [
    # A token that has left the battlefield stays where it is (CR 111.8): Ghostly Flicker's Treasure.
    ('token stays in exile', ZONES, '  if (object.token === true && object.zone !== "battlefield") return null;\n', ''),
    # An Aura entering beside other permanents enchants none of them (CR 303.4f): Brago's Aura and Bear.
    ('aura not onto what enters with it', ZONES, '.filter((host) => !(notOnto ?? []).includes(host))', ''),
    ('notOnto handed to the move', ZONES, '...(to === "battlefield" && together.length ? {notOnto: together} : {}),', ''),
    ('what this move put there kept', ZONES, '{ arrived.push(moved); together.push(moved); }', 'arrived.push(moved);'),
    ('what a flicker returned kept', ZONES, '    together.push(landed);\n', ''),
    # Exile them all, then return them all (CR 608.2c).
    ('return after every exile', ZONES, '      else { returning.push({id, back}); continue; }',
     '      else { const returned = {...context}; events.push(...moveZone(state, {...back, remember: true}, returned)); landed = returned.remembered?.[0] ?? null; }'),
    ('returned remembered', ZONES, '    became.push(landed);\n    if (leftBy.has(id)) was[landed] = leftBy.get(id);\n  }', '  }'),
    # Eldrazi Confluence: "then return it to the battlefield tapped".
    ('returned tapped', ZONES, '        ...(params.returnTapped === true ? {tapped: true} : {})};', '};'),
    # Tezzeret's -8: "put all artifact cards from among them".
    ('only those that fit', ZONES, 'const moving = params.only ?', 'const moving = false ?'),
    ('read where each now is', ZONES, 'matchesSelector({...params.only, what: "card", zone: state.objects[id].zone}, state, id,', 'matchesSelector({...params.only, what: "card", zone: "exile"}, state, id,'),
    # Nautiloid Ship: "exile target player's graveyard" kept for "a creature card exiled with this Vehicle".
    ('a move of all linked', ZONES, '  if (params.link === true && linkOf(context) !== null) {\n    const exiled = arrivedAll',
     '  if (false) {\n    const exiled = arrivedAll'),
    ('only what reached exile linked', ZONES, 'const exiled = arrivedAll.filter((id) => state.objects[id]?.zone === "exile");', 'const exiled = arrivedAll;'),
    # Armored Skyhunter: "you may attach it to a creature you control".
    ('nothing to attach, nothing asked', ASKING, '    if (params.attach === "remembered" && attaching === undefined) return false;\n', ''),
    ('the Equipment kept for the answer', ASKING, '      ...(attaching !== undefined ? {attaching} : {}),\n', ''),
    ('the Equipment attached', ASKING,
     '        if (awaiting.attaching !== undefined) events.push(...attach(state, {source: awaiting.attaching, targets: [id]}, {controller: player}));\n', ''),
    # Scroll Rack: "then look at the exiled cards" -- named to the one who may look.
    ('a face-down card named to its looker', ASKING,
     'return object?.faceDown === true && (object.lookers ?? []).includes(awaiting.player) ? {...option, label: object.faceDownCard?.card ?? option.label} : option;',
     'return option;'),
    # Animist's Awakening: "put all land cards from among them".
    ('all taken, nobody asked', ASKING, '    if (params.all === true) {\n      const events = [...revealed];', '    if (false) {\n      const events = [...revealed];'),
    ('what all took remembered', ASKING, '      if (params.remember) context.remembered = found;\n', ''),
    ('the rest where it says', ASKING, '      digRest(state, context.controller, looked.filter((id) => !offered.includes(id)), taking, rng, events);\n', ''),
    # Sunforger: "{R}{W}, Unattach this Equipment".
    ('unattach a cost built', ACTIONS, '  || (atom?.atom === "unattach" && atom.self === true);', '  ;'),
    ('unattach payable only attached', ACTIONS, '    if (atom.atom === "unattach" && state.objects[object.attachedTo]?.zone !== "battlefield") return null;\n', ''),
    ('unattach paid', ACTIONS, '        object.attachedTo = null;\n        events.push(event("GameEventCardAttachment", state, {card: cardRef(state, action.objectId), attachedTo: null}));',
     '        events.push(event("GameEventCardAttachment", state, {card: cardRef(state, action.objectId), attachedTo: null}));'),
    ('unattached from its host', ACTIONS, '        if (host) host.attachments = (host.attachments ?? []).filter((a) => a !== action.objectId);\n        object.attachedTo = null;', '        object.attachedTo = null;'),
    # Eldrazi Confluence: "choose three. You may choose the same mode more than once."
    ('the same mode, exactly so many', ACTIONS, 'modal.sameMode ? modal.upTo ?? least :', 'modal.sameMode ? modal.upTo :'),
    ('schema: the same mode beside a choose', SCHEMA, '(effect.chooseUpTo !== undefined || (Number.isInteger(effect.choose) && effect.choose >= 2))', 'effect.chooseUpTo !== undefined'),
    ('schema: not beside choosing one', SCHEMA, '(Number.isInteger(effect.choose) && effect.choose >= 2)', '(Number.isInteger(effect.choose) && effect.choose >= 1)'),
    # Each new word's grammar.
    ('schema: only', SCHEMA, '  if (name === "moveZone" && effect.only !== undefined) checkSelector(effect.only, `${path}.only`, errors);\n', ''),
    ('schema: returnTapped', SCHEMA, '  if (name === "moveZone" && effect.returnTapped !== undefined && !(effect.returnTapped === true && effect.andReturn !== undefined))',
     '  if (false)'),
    ('schema: link', SCHEMA, '  if (name === "moveZoneAll" && effect.link !== undefined && !(effect.link === true && effect.to === "exile"))', '  if (false)'),
    ('schema: attach', SCHEMA, '  if (name === "chooseCard" && effect.attach !== undefined && !(effect.attach === "remembered" && effect.to === "stay" && effect.zone === "battlefield"))',
     '  if (false)'),
    ('schema: all', SCHEMA, '  if (name === "dig" && effect.all !== undefined && !(effect.all === true && effect.selector !== undefined && effect.upTo === undefined && effect.take === undefined))',
     '  if (false)'),
    ('schema: all needs a selector', SCHEMA, 'effect.all === true && effect.selector !== undefined && effect.upTo', 'effect.all === true && effect.upTo'),
    ('schema: all not beside upTo', SCHEMA, 'effect.selector !== undefined && effect.upTo === undefined && effect.take === undefined', 'effect.selector !== undefined && effect.take === undefined'),
]
