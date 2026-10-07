# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python game/tools/batch/breaks.py tools/advice-contract-breaks.py
SUITES=['tests/advice-contract.mjs']
FILE='cloud/advice-contract.mjs'
BREAKS=[
 ('stale response accepted',FILE,"task.cacheKey!==currentTask.cacheKey","false"),
 ('cache shared between owners',FILE,"JSON.stringify({owner,subject,input})","JSON.stringify({subject,input})"),
 ('cache shared between subjects',FILE,"JSON.stringify({owner,subject,input})","JSON.stringify({owner,input})"),
 ('private input fields forwarded',FILE,"const input = {schema:ADVICE_VERSION","const input = {...arguments[0],schema:ADVICE_VERSION"),
 ('invented evidence accepted',FILE,"evidenceIds.some(id=>!evidence.has(id))","false"),
 ('invented card accepted',FILE,"cardIds.some(id=>!cards.has(id))","false"),
 ('unknown output mutation allowed',FILE,"if(!only(response,['summary','findings','suggestedOptionId']))","if(false)"),
 ('invented live option accepted',FILE,"!task.input.options.some(o=>o.id===suggestedOptionId)","false"),
 ('unchanged decks batched again',FILE,"if(!seen.has(task.cacheKey)){","if(true){"),
 ('byte bound removed',FILE,"if(new TextEncoder().encode(payload).length > 32000)","if(false)"),
]
