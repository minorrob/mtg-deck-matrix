# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The table's events in the view (`events.v1`; Linear ROB-77): game/room/events.mjs (what each engine event is to the
table, and what a seat is told of it), the room's ring, change mark, floor and decision ids (game/room/room.mjs), and the
id a drawn card has in the hand (rules/turn.mjs, script/effects/zones.mjs, `drewAs`).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-table-events.py
"""
SUITES = ['tests/room-events.mjs']
E = 'game/room/events.mjs'
R = 'game/room/room.mjs'
BREAKS = [
    # What a seat is told
    ('a drawn card told to every seat', E,
     'return secret.seat === seat && knows(secret.card?.cardId) ? {...open, card: secret.card} : open;',
     'return knows(secret.card?.cardId) ? {...open, card: secret.card} : open;'),
    ('a drawn card named after it was put back', E,
     'return secret.seat === seat && knows(secret.card?.cardId) ? {...open, card: secret.card} : open;',
     'return secret.seat === seat ? {...open, card: secret.card} : open;'),
    ('a card moved between two hidden zones made an event', E,
     '      if (HIDDEN.has(from) && HIDDEN.has(to)) return null;\n',
     ''),
    ('a face-down card named', E,
     'const card = (c) => (c ? {cardId: c.cardId ?? null, name: c.faceDown ? null : c.name ?? null} : null);',
     'const card = (c) => (c ? {cardId: c.cardId ?? null, name: c.name ?? null} : null);'),
    ('a countered spell taken for one resolved', E,
     '      if (f.countered) return at("countered", {player: f.playerId ?? null, stackId: f.stackId ?? null});\n',
     ''),
    ('a token taken for a card moved', E,
     '      if (f.createdAsToken) return at("token", {player: f.to?.player?.playerId ?? owner, card: card(f.card)});\n',
     ''),
    ('a spell cast taken for an ability', E,
     '      return f.sa && f.sa.isSpell\n',
     '      return false\n'),
    ('a draw named by its card in the library', E,
     "card: {...card(f.card), ...(f.drewAs !== undefined ? {cardId: f.drewAs} : {})}",
     'card: card(f.card)'),
    ('the draw step\'s draw not saying what it became', 'game/engine/rules/turn.mjs',
     '    drewAs: moved,\n',
     ''),
    ('an effect\'s draw not saying what it became', 'game/engine/script/effects/zones.mjs',
     '    fields.drewAs = moved;\n',
     ''),
    # The room
    ('an event not naming the answer that made it', R,
     '      if (said) tableEvents.push(answering ? {...said, decisionId: answering} : said);',
     '      if (said) tableEvents.push(said);'),
    ('the answer named by what the room did after it', R,
     '    } finally {\n      answering = null;\n    }\n',
     '    }\n'),
    ('a replay not naming the answers it applies', R,
     '      answerWith(seat, entry.answer, decisionId);',
     '      answerWith(seat, entry.answer);'),
    ('a view carrying the change before it too', R,
     '      const answer = controller.take();\n      begin();\n',
     '      const answer = controller.take();\n'),
    ('a reconnect never told to start over', R,
     "{after, floor: eventsFloor} : {from: `event:${eventsMark}`}),\n            /* A card drawn,",
     "{after} : {from: `event:${eventsMark}`}),\n            /* A card drawn,"),
    ('the events not saved', R,
     '...(tableEvents.length ? {events: tableEvents, eventsMark, eventsFloor} : {})',
     '...{}'),
    ('the events forgotten on reopening', R,
     'tableEvents = record.events || [];',
     'tableEvents = [];'),
]
