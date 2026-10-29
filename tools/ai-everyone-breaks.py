# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python game/tools/batch/breaks.py tools/ai-everyone-breaks.py
# AI_EVERYONE widens the accepted sign-in audience (Rob, 2026-10-14). Rob's later 2026-10-26 rule restricts paid
# features to the owner and insider roster: General Access never spends, even with the switch on. The same service
# identity refusal and owner access now live in the shared group gate. These probes preserve both current boundaries.
SUITES = ['tests/ai-door.mjs', 'tests/agent-seat-table.mjs', 'tests/release-pages.mjs']
WORKER, ROOM, AI, ACCESS, RELEASE = 'cloud/worker.mjs', 'cloud/game-room.mjs', 'cloud/ai.mjs', 'cloud/access.mjs', 'tools/release-pages.mjs'
BREAKS = [
    ("the owner incorrectly held to the insider roster", AI, 'return (await groupOf(email, {OWNER_EMAIL: owner}, db)) !== "general";', 'return (await groupOf(email, {OWNER_EMAIL: owner}, db)) === "insider";'),
    ("a service token let in as everyone", AI, 'return (await groupOf(email, {OWNER_EMAIL: owner}, db)) !== "general";', 'return typeof email === "string" && (!email.includes("@") || (await groupOf(email, {OWNER_EMAIL: owner}, db)) !== "general");'),
    ("everyone let in with the switch off", AI, 'env?.AI_EVERYONE === "on"', 'true'),
    ("the app's sign-in never opens the door", WORKER, 'everyone(env) ? [env.AI_ACCESS_AUD, env.ACCESS_AUD] : env.AI_ACCESS_AUD', 'env.AI_ACCESS_AUD'),
    ("the app's sign-in opens the door with the switch off", WORKER, 'everyone(env) ? [env.AI_ACCESS_AUD, env.ACCESS_AUD] : env.AI_ACCESS_AUD', '[env.AI_ACCESS_AUD, env.ACCESS_AUD]'),
    ("a list of applications read for its first only", ACCESS, 'if (!audiences.some((audience) => named.includes(audience))) throw', 'if (!named.includes(audiences[0])) throw'),
    ("the advisor's offer loses the owner group", WORKER, 'return createAi(env.DB, {owner: env.OWNER_EMAIL}).allowed(email);', 'return createAi(env.DB).allowed(email);'),
    ("the settings' meter loses the owner group", WORKER, 'createAi(env.DB, {now, owner: env.OWNER_EMAIL})', 'createAi(env.DB, {now})'),
    ("the AI routes lose the owner group", WORKER, "toISOString(), owner: env.OWNER_EMAIL, ...(deps.newId", "toISOString(), ...(deps.newId"),
    ("the table's AI seat loses the owner group", ROOM, 'createAi(this.env.DB, {owner: this.env.OWNER_EMAIL}).allowed(email)', 'createAi(this.env.DB).allowed(email)'),
    ("a release never sets the switch", RELEASE, '  ...(profile.ai.everyone ? {AI_EVERYONE: "on"} : {}),\n', ''),
    ("production's door for the allowlist only", RELEASE, 'ai: {aud: PRODUCTION.cloud.access.aud, everyone: true,', 'ai: {aud: PRODUCTION.cloud.access.aud,'),
    ("staging's door for the allowlist only", RELEASE, 'ai: {aud: "d3e7b5812c81536cb707c64cca2196e1ee7854cbca6791f4d7bd2ef4b649f6db", everyone: true,', 'ai: {aud: "d3e7b5812c81536cb707c64cca2196e1ee7854cbca6791f4d7bd2ef4b649f6db",'),
]
