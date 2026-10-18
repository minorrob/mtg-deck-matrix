# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: python game/tools/batch/breaks.py game/tools/batch/breaks-budgets.py
# Budgets as Rob set them on 2026-10-18 (docs/budgets.md): a deck's budget is its own and inherits nothing, the
# account's is set against the decks' budgets or their costs where those are more, and neither refuses anything.
# budgets runs first, in Node, so the model's breaks are caught in seconds; settings-r3 catches the screens'.
SUITES = ['tests/budgets.mjs', 'tests/settings-r3.mjs']
MODEL, DECKS, SETTINGS = 'collection-model.js', 'crankmagic-decks.js', 'crankmagic-settings.js'
BREAKS = [
    ("money refuses a lock again", MODEL,
     "function acceptance(s,d){return legality(s,d);}",
     "function acceptance(s,d){return [...legality(s,d),...definitionIssues(s,d)];}"),
    ("a deck inherits the account's budget", MODEL,
     "budget=Number.isFinite(def.budget)?def.budget:null;let cost=0",
     "budget=Number.isFinite(def.budget)?def.budget:(s.preferences&&s.preferences.accountBudget)||null;let cost=0"),
    ("a deck over its budget counts at its budget, not its cost", MODEL,
     "counted:budget===null?cost:Math.max(budget,cost)",
     "counted:budget===null?cost:budget"),
    ("an archived deck still plans to spend", MODEL,
     "s.decks.filter(d=>!d.archived&&!isLobbyDeck(d)).map(d=>({deckId:d.id",
     "s.decks.filter(d=>!isLobbyDeck(d)).map(d=>({deckId:d.id"),
    ("the deck page holds a deck with no budget to the pod's rule", DECKS,
     "bud=M.deckBudget(C.state,d),cap=bud.budget,",
     "bud=M.deckBudget(C.state,d),cap=bud.budget??225,"),
    ("Settings sums the decks' own budgets and ignores what they cost", SETTINGS,
     "Your decks plan <strong>${n(a.planned)}</strong> together.",
     "Your decks plan <strong>${n(a.budgeted)}</strong> together."),
]
