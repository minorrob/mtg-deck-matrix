# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-165: pointer-driven choices keep their position only within the same question and match."""
SUITES = ["tests/table-tabletop.mjs"]
T = "crankmagic-board.js"
BREAKS = [
    ("picking loses the scroll position", T,
     "      options.scrollTop = choiceScroll;\n",
     "      options.scrollTop = 0;\n"),
    ("a new question inherits the old scroll", T,
     "choice.dataset.choiceId === view?.decision?.id && choice.dataset.matchId === view?.matchId",
     "choice.dataset.matchId === view?.matchId"),
    ("a new match inherits the old scroll", T,
     "choice.dataset.choiceId === view?.decision?.id && choice.dataset.matchId === view?.matchId",
     "choice.dataset.choiceId === view?.decision?.id"),
]
