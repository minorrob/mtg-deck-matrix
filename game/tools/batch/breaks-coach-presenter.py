# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/crankmagic-coach.mjs', 'tests/ai-door.mjs']
BREAKS = [
 ('closed backend gets composer', 'crankmagic-coach.js', 'if (available !== true)', 'if (false)'),
 ('messages lose escaping', 'crankmagic-coach.js', 'const said = text => esc(text)', 'const said = text => String(text)'),
 ('disclosure binds twice', 'crankmagic-coach.js', 'if (bound.has(panel)) return;', ''),
 ('Escape loses focus', 'crankmagic-coach.js', "details.querySelector('summary')?.focus();", ''),
 ('Coach probe ignores feature switch', 'cloud/worker.mjs', 'aiSeatOpen(env, person.email, "AI_COACH")', 'aiSeatOpen({...env, AI_COACH: "on"}, person.email, "AI_COACH")'),
]
