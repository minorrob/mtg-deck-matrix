# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python game/tools/batch/breaks.py tools/agents-access-breaks.py
# The agents' access (M8, G-C): each service token staging admits is an identity of its own, and the check says so.
SUITES = ['tests/cloud-worker.mjs', 'tests/staging-check.mjs']
ACCESS, CHECK = 'cloud/access.mjs', 'tools/staging-check.mjs'
BREAKS = [
    ('every token one identity', ACCESS,
     'crypto.subtle.digest("SHA-256", enc.encode(clientId))', 'crypto.subtle.digest("SHA-256", enc.encode("service"))'),
    ('a token named by its client id', ACCESS,
     'return "service:" + [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("");',
     'return "service:" + clientId;'),
    ('a token named as a person', ACCESS,
     'return "service:" + [...digest', 'return "agent@" + [...digest'),
    ('any answer counts as seated', CHECK,
     'const SEATED = /^service:[0-9a-f]{12}$/;', 'const SEATED = /./;'),
    ('production admitting a token unseen', CHECK,
     'if (prod.me.status === 200) problems.push', 'if (false) problems.push'),
    ('two agents as one identity unseen', CHECK,
     'if (ns.length > 1) problems.push', 'if (ns.length > 2) problems.push'),
    ('an agent staging refuses unseen', CHECK,
     'if (!seated) problems.push(`agent ${n}: staging', 'if (false) problems.push(`agent ${n}: staging'),
    ('a missing agent unnamed', CHECK,
     'missing: tokens.flatMap((t, i) => (t.id && t.secret ? [] : [i + 1]))', 'missing: []'),
]
