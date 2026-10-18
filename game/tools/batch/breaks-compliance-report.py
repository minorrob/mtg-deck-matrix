# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The compliance report (2026-10-18, Linear ROB-111): tests/compliance-report.mjs holds compliance-report.js on
Krenko's hundred at every bracket. These breaks prove the checks can fail: the Game Changer cap not applied, mass land
denial ignored, a returning extra-turn spell read as one shot, the known combo pairs ignored, the report enforcing
silently (taking the cards out of the deck it was handed), the bracket date dropped, and tutors uncounted. From the
repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-compliance-report.py
"""
SUITES = ['tests/compliance-report.mjs']
BREAKS = [
    ('the Game Changer cap not applied', 'compliance-report.js',
     '      let status = !checked ? "not-checked" : limit === null ? "info" : count > limit ? "over" : "met";',
     '      let status = !checked ? "not-checked" : limit === null ? "info" : "met";'),
    ('mass land denial ignored', 'compliance-report.js',
     '      c.massLandDenial = tags.some((t) => /mass land|land destruction/.test(t));',
     '      c.massLandDenial = false;'),
    ('a returning extra turn read as one shot', 'compliance-report.js',
     '      c.extraTurnLoop = tags.some((t) => /extra turn loop|turn loop/.test(t));',
     '      c.extraTurnLoop = false;'),
    ('the known combo pairs ignored', 'compliance-report.js',
     '      const pairs = (deps.compliance && deps.compliance.TIER3_EARLY_COMBO_PAIRS || []).filter((pair) => pair.every((x) => names.has(fold(x))));',
     '      const pairs = [];'),
    ('the report enforces silently', 'compliance-report.js',
     '    const cards = ((deck && deck.cards) || []).map(normalize).filter((c) => c.name);',
     '    const cards = ((deck && deck.cards) || []).map(normalize).filter((c) => c.name);\n    if (deck && Array.isArray(deck.cards)) for (let i = deck.cards.length - 1; i >= 0; i--) if (deck.cards[i] && (deck.cards[i].gameChanger || /Armageddon|Nexus of Fate/.test(deck.cards[i].name))) deck.cards.splice(i, 1);'),
    ('the bracket date dropped', 'compliance-report.js',
     '      bracket: {n, name: bracket.name, says: bracket.says}, asOf: table.asOf,',
     '      bracket: {n, name: bracket.name, says: bracket.says}, asOf: null,'),
    ('tutors uncounted', 'compliance-report.js',
     '      c.tutor = c.roles.includes("tutor") || (!isLand(c) && TUTOR.test(c.text.replace(/\\([^)]*\\)/g, "")));',
     '      c.tutor = false;'),
]
