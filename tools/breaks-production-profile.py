# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES=['tests/cloud-worker.mjs']
P='cloud/worker.mjs'
BREAKS=[
 ('entry closure missing',P,'if (env.PLAY_TABLES_CLOSED === "on" &&','if (false &&'),
 ('invitations escape closure',P,' || joinLocation(url)))', '))'),
 ('existing table HTTP and sockets escape closure',P,'(path === "/api/tables" || path.startsWith("/api/tables/") || joinLocation(url))','(path === "/api/tables" || joinLocation(url))'),
]
