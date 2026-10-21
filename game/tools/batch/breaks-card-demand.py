# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Card demand (card load step 1; Linear ROB-86): cloud/card-demand.mjs, cloud/tables.mjs, migration 0006 and the
wave ranking (game/tools/card-demand.mjs).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-card-demand.py
"""
SUITES = ['tests/card-demand.mjs']
BREAKS = [
    ('the same deck counted again', 'cloud/card-demand.mjs', 'if (seen.has(d.digest) || counted.has(d.digest)) continue;', 'if (counted.has(d.digest)) continue;'),
    ("a deck's digest depending on case", 'cloud/card-demand.mjs', '.filter(Boolean).map((n) => n.toLowerCase()))].sort();', '.filter(Boolean))].sort();'),
    ("a deck's digest depending on order", 'cloud/card-demand.mjs', '.map((n) => n.toLowerCase()))].sort();', '.map((n) => n.toLowerCase()))];'),
    ('an address kept as a card name', 'cloud/card-demand.mjs', '/@|:\\/\\/|[\\u0000-\\u001f\\u007f]/', '/[\\u0000-\\u001f\\u007f]/'),
    ("a name longer than any card's kept", 'cloud/card-demand.mjs', 'n.length > NAME_LIMIT || ', ''),
    ('a failed record breaking the answer', 'cloud/card-demand.mjs', 'log.warn(`Card demand not recorded: ${error && error.message ? error.message : error}`);', 'throw error;'),
    ('more values bound than D1 allows', 'cloud/card-demand.mjs', 'const CHUNK = 99;', 'const CHUNK = 100;'),
    ('two questions about one new deck counting it twice, or failing', 'cloud/card-demand.mjs', 'if (attempt === 0 && decks.length', 'if (false && decks.length'),
    ('listed said when nothing was recorded', 'cloud/tables.mjs', 'return listed.length ? reply(response.status, {...value, listed}) : response;', 'return reply(response.status, {...value, listed});'),
    ('a refused deck not counted', 'cloud/tables.mjs', 'if (action !== "deck" || answer.status !== 422) return answer;', 'return answer;'),
    ('decks asked together counted as one', 'cloud/tables.mjs', 'return decks.map((deck) => ({deck, unknown: deck.filter((n) => missing.has(key(n)))}));', 'return [{deck: decks.flat(), unknown}];'),
    ('who asked stored', 'cloud/tables.mjs', 'const listed = await recordDemand(env.DB, asks(named));', 'const listed = await recordDemand(env.DB, [...asks(named), {unknown: [who.email.replace("@", " at ")]}]);'),
    ('a name in another case another row', 'cloud/migrations/0006_card_demand.sql', 'name TEXT NOT NULL COLLATE NOCASE PRIMARY KEY', 'name TEXT NOT NULL PRIMARY KEY'),
    ('a column for the person', 'cloud/migrations/0006_card_demand.sql', 'asked INTEGER NOT NULL DEFAULT 0,', 'asked INTEGER NOT NULL DEFAULT 0, owner_email TEXT,'),
    ('the wave list not demand first', 'game/tools/card-demand.mjs', 'return [...first, ...top.filter((r) => !taken.has(r.name.toLowerCase()))];', 'return [...top.filter((r) => !taken.has(r.name.toLowerCase())), ...first];'),
    ('demand ranked by times asked before decks', 'game/tools/card-demand.mjs', 'b.decks - a.decks || b.asked - a.asked', 'b.asked - a.asked || b.decks - a.decks'),
    ('a card the engine plays left in the ranking', 'game/tools/card-demand.mjs', '.filter((r) => !playable(r.name))', '.filter(() => true)'),
]
