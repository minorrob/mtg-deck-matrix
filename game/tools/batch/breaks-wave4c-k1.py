# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4c, lane k1: lands -- what the lane's cards needed of the engine: "you may play the exiled card" playing a land card
as an effect resolves (CR 305.2a; Windbrisk Heights, Mosswort Bridge), never on another player's turn (305.3) nor with no
land play left (305.2b), a modal double-faced card's land face among it (712.12), and a card exiled face down weighed as
it is face up (406.3a). One break for each guard and each branch, and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4c-k1.py
"""
SUITES = [
    'tests/engine-cards.mjs',
]

ACTIONS = 'game/engine/rules/actions.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'

BREAKS = [
    # ---- rules/actions.mjs, landChoicesNow: a land card played as an effect resolves ----
    ("land play by an effect: never on another player's turn (CR 305.3)", ACTIONS,
     '  if (!object || player !== state.activePlayer || landDropsLeft(state, player) <= 0) return [];\n',
     '  if (!object || landDropsLeft(state, player) <= 0) return [];\n'),
    ('land play by an effect: never with no land play left (CR 305.2b)', ACTIONS,
     '  if (!object || player !== state.activePlayer || landDropsLeft(state, player) <= 0) return [];\n',
     '  if (!object || player !== state.activePlayer) return [];\n'),
    ('land play by an effect: a land card is offered as a land play', ACTIONS,
     '  return [...(isLand(object) ? [{kind: "play-land", objectId: id, label: object.card, from: object.zone}] : []),\n',
     '  return [\n'),
    ("land play by an effect: a modal double-faced card's land face (CR 712.12)", ACTIONS,
     '    ...(backLand(object) ? [{kind: "play-land", objectId: id, label: object.mdfc.back.card, face: "back", from: object.zone}] : [])];\n',
     '    ];\n'),
    # ---- effects/asking.mjs, play: `lands`, and a face-down card ----
    ('play: a land card among them offered when the effect plays (`lands`)', ASKING,
     'withFaceUp(state, id, () => [...(lands ? landChoicesNow(state, player, id) : []),\n',
     'withFaceUp(state, id, () => [...([]),\n'),
    ('play: the effect\'s `lands` read', ASKING,
     'payMana: params.payMana === true, lands: params.lands === true};',
     'payMana: params.payMana === true, lands: false};'),
    ('play: a card exiled face down weighed face up (CR 406.3a)', ASKING,
     '  return pool.filter((id) => state.objects[id]).flatMap((id) => withFaceUp(state, id, () => [',
     '  return pool.filter((id) => state.objects[id]).flatMap((id) => ((fn) => fn())(() => ['),
    ('play: the question says "play" when the effect plays', ASKING,
     '      ...(terms.lands ? {lands: true} : {})};',
     '      };'),
]
