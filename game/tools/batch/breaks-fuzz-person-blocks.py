# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy

SUITES=['tests/fuzz-person-blocks.mjs','tests/room-block-check.mjs']
for spec in ['game/tools/batch/breaks-fuzz-library.py','game/tools/batch/breaks-load100-w0-v8-verify.py']:
    for suite in runpy.run_path(spec)['SUITES']:
        if suite not in SUITES:
            SUITES.append(suite)
TOOL='tools/fuzz-live.mjs'
BREAKS=[
    ('joint block drafting cannot be skipped',TOOL,
     'if (decision.id?.startsWith("declare-blockers:") && typeof checkDraft === "function") {','if (false) {'),
    ('an illegal native draft cannot be submitted',TOOL,
     'if (checked.ok === true) break;','if (true) break;'),
    ('a stale blocker question cannot be retried as current',TOOL,
     'if (checked?.open !== true) throw new Error("The simulated person\'s blocker question expired before submission");',''),
    ('draft exhaustion fails rather than accepting an illegal fallback',TOOL,
     'if (attempt >= PERSON_TRIES) throw new Error(`The simulated person could not draft legal blockers after ${PERSON_TRIES} attempts: ${(checked.reasons ?? []).join("; ")}`);',
     'if (attempt >= PERSON_TRIES) break;'),
    ('actual default room producer supplies native preflight',TOOL,
     ', {checkDraft: draft => room.check(who, draft)})',')'),
    ('room preflight preserves the submitted question identity',TOOL,
     'draft => room.check(who, draft)','draft => room.check(who, {...draft, choiceId: room.view(who).decision.id})'),
    ('room preflight uses the actual waiting actor',TOOL,
     'draft => room.check(who, draft)','draft => room.check("s1", draft)'),
    ('strict verdict still counts actual submitted refusals',TOOL,
     'if (game.strictRefusals && game.personRefused?.length) problems.push','if (false) problems.push'),
]
