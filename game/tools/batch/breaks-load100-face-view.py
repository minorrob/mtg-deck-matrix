# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Additive checks for the visible back-face field introduced by ROB-207.
SUITES = ['tests/room-view-face.mjs', 'tests/engine-projection.mjs', 'tests/room-playtest-snoop.mjs']
TARGET = 'game/engine/projection.mjs'
BREAKS = [
    ('a played back face is omitted from the public view', TARGET,
     '...(named && object.face === "back" ? {face: "back"} : {}),', ''),
    ('a front-face permanent is mislabeled as its back', TARGET,
     '...(named && object.face === "back" ? {face: "back"} : {}),',
     '...(named ? {face: "back"} : {}),'),
]
