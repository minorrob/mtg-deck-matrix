# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""GAMES=1: prove the whole-game harness actually requires the engine's combat picture."""
SUITES = ["tests/uat/solo-vs-ai.mjs"]
BREAKS = [
    ("real combat is missing from the board", "crankmagic-board.js",
     'if (!attacks.length) return "";',
     'if (true) return "";'),
]
