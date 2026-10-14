# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python game/tools/batch/breaks.py tools/ai-everyone-breaks.py
# The AI door open to everyone signed in (Rob, 2026-10-14: "I want the AI door open on staging and production for anyone
# that can sign in"): with AI_EVERYONE on, the invite list is the allowlist and the app's own sign-in opens the door;
# with it off, the allowlist and the AI application hold as before; and each release sets it only as its profile says.
SUITES = ['tests/ai-door.mjs', 'tests/agent-seat-table.mjs', 'tests/release-pages.mjs']
WORKER, ROOM, AI, ACCESS, RELEASE = 'cloud/worker.mjs', 'cloud/game-room.mjs', 'cloud/ai.mjs', 'cloud/access.mjs', 'tools/release-pages.mjs'
BREAKS = [
    ("everyone signed in still held to the allowlist", AI, '      if (everyone) return typeof email === "string" && email.includes("@");\n', ''),
    ("a service token let in as everyone", AI, 'typeof email === "string" && email.includes("@")', 'typeof email === "string"'),
    ("everyone let in with the switch off", AI, 'env?.AI_EVERYONE === "on"', 'true'),
    ("the app's sign-in never opens the door", WORKER, 'everyone(env) ? [env.AI_ACCESS_AUD, env.ACCESS_AUD] : env.AI_ACCESS_AUD', 'env.AI_ACCESS_AUD'),
    ("the app's sign-in opens the door with the switch off", WORKER, 'everyone(env) ? [env.AI_ACCESS_AUD, env.ACCESS_AUD] : env.AI_ACCESS_AUD', '[env.AI_ACCESS_AUD, env.ACCESS_AUD]'),
    ("a list of applications read for its first only", ACCESS, 'if (!audiences.some((audience) => named.includes(audience))) throw', 'if (!named.includes(audiences[0])) throw'),
    ("the advisor's offer ignores the switch", WORKER, 'return createAi(env.DB, {everyone: everyone(env)}).allowed(email);', 'return createAi(env.DB).allowed(email);'),
    ("the settings' meter ignores the switch", WORKER, 'createAi(env.DB, {now, everyone: everyone(env)})', 'createAi(env.DB, {now})'),
    ("the AI routes ignore the switch", WORKER, "toISOString(), everyone: everyone(env), ...(deps.newId", "toISOString(), ...(deps.newId"),
    ("the table's AI seat ignores the switch", ROOM, 'createAi(this.env.DB, {everyone: everyone(this.env)}).allowed(email)', 'createAi(this.env.DB).allowed(email)'),
    ("a release never sets the switch", RELEASE, '  ...(profile.ai.everyone ? {AI_EVERYONE: "on"} : {}),\n', ''),
    ("production's door for the allowlist only", RELEASE, 'ai: {aud: PRODUCTION.cloud.access.aud, everyone: true,', 'ai: {aud: PRODUCTION.cloud.access.aud,'),
    ("staging's door for the allowlist only", RELEASE, 'ai: {aud: "d3e7b5812c81536cb707c64cca2196e1ee7854cbca6791f4d7bd2ef4b649f6db", everyone: true,', 'ai: {aud: "d3e7b5812c81536cb707c64cca2196e1ee7854cbca6791f4d7bd2ef4b649f6db",'),
]
