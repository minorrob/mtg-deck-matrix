# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python game/tools/batch/breaks.py tools/ai-clock-breaks.py
# The AI call log reads and writes on the clock it was handed: the request's in the Worker, the table's in the room. On
# the machine's clock the settings' meter read 0 spent once the real date passed the suite's day (advisor, 2026-10-12).
# agent-seat-table runs first so the table's two checks (calls logged at its clock; the day's cap read on it) are the
# ones that catch the room's breaks and the window's.
SUITES = ['tests/agent-seat-table.mjs', 'tests/advisor.mjs', 'tests/ai-door.mjs', 'tests/coach.mjs', 'tests/cloud-worker.mjs']
WORKER, ROOM, AI = 'cloud/worker.mjs', 'cloud/game-room.mjs', 'cloud/ai.mjs'
BREAKS = [
    ("the meter's log on the machine's clock", WORKER, 'createAi(env.DB, {now})', 'createAi(env.DB)'),
    ("the meter route drops the request's clock", WORKER, 'await aiMeter(env, person.email, () => new Date(ms()).toISOString())', 'await aiMeter(env, person.email)'),
    ("the AI routes' log on the machine's clock", WORKER, 'createAi(env.DB, {now: () => new Date(ms()).toISOString(), ', 'createAi(env.DB, {'),
    ("the LLM seat's log on the machine's clock", ROOM, 'createAi(this.env.DB, {now: () => new Date(this.now()).toISOString()})', 'createAi(this.env.DB)'),
    ("the day's window ends at the machine's clock", AI, 'Date.parse(now()) - 24 * 3600 * 1000', 'Date.now() - 24 * 3600 * 1000'),
    ("a call logged at the machine's clock", AI, 'row.outcome, now()).run()', 'row.outcome, new Date().toISOString()).run()'),
]
