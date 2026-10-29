# W4 outside-resolution damage continuation

This is open wave-0 debt. Source89bfae71 and recordae9e3daa finish the bounded planeswalker-trample slice only. No outside-resolution ordering fix or gate credit is claimed here.

Native reproduction, from the W4 worktree root with Node22 first on PATH:

```powershell
node docs/engine/card-load-100-2026-10-28/w0/evidence/w4-mana-order-red.mjs
```

Current result: exit1. Actual Shivan Reef red-mana activation taps the land, adds one red mana, then automatically deals5 damage; player0 falls to35 and no question opens. With Fiery Emancipation and the fixture's additive replacement, player0 must choose between5 damage (triple, then add2) and9 (add2, then triple). The diagnostic expects a pending rule-operation question, life40, R1 and a tapped land. Its subsequent assertions already specify both explicit answers, JSON reload, final life35/31, one mana event, one damage event and an empty stack. The original passing `tests/engine-damage-replaced.mjs` is preserved exactly; this deliberately RED diagnostic is not registered as a finished suite, skipped or counted as proof.

## Actual caller and ownership

- `game/engine/rules/actions.mjs`, activate-mana branch near2981: `ability.then` currently runs through synchronous `runEffects` after mana production. Its later self-sacrifice/exile/other-sacrifice cost tail also needs a saved stage if this caller can pause. Coordinate this narrow region with W5; W5 explicitly reserved it for W4 on October29. Do not touch W5's affordability, delve or castTapPlans edits.
- `applyAction` already detects a pending rule operation and withholds priority. `continueRuleOutcome` in `rules/turn.mjs` already supports `after-action`; complete operation events must include the earlier tap/mana prefix so triggers are collected once.
- `tapUnits` in actions.mjs excludes any mana ability with `then`, so the current automatic casting plans cannot invoke this damage-bearing mana ability in their inner tap loop. Preserve this fact while adding the bounded caller; future effect-paid costs still need explicit coordination.
- `script/effects/resources.mjs`: `damageQuestion`, `damageHits`, `damageCalls`, `dealDamage`, and damageAll/fight/damageEach are the shared damage seams. Other outside callers include `runFollowUps`, direct `runEffect`, and synchronous repeat/branch paths. A manual mana fix alone does not close their debt.
- `rules/replacement.mjs`: `applyReplacements` falls back to `leastFirst` when `askable` is false. `ruleReplacementCandidates`/`applyRuleReplacement` currently support only zone-change and enters proposals. Extend a real operation consumer before removing the fallback; throwing or excluding the caller is not completion.
- W1 owns combat.mjs for battles after the pushed trample checkpoint. Coordinate before changing the trample assignment helpers or combat damage replacement caller.

## Required safe design and proof

Use plain saved damage proposals and explicit stages. Ask the affected player before damage, preserve already-applied replacements, recheck live remaining candidates after concessions, and carry only the matching source's last known qualities when it departs. A replay of answer keys alone is insufficient for a chain in which a previously selected holder leaves between replacement questions: it can lose an already-applied modification or leave an invalid leading key.

Shield and next-use consumption must be deferred until the chosen damage event commits; asking must spend nothing. Preserve finite-shield amounts, shield-counter batch behavior, prevention follow-ups and simultaneous multi-hit damage. A saved stage must neither reproduce mana/pay costs again nor repeat a completed earlier effect when later damage asks. Concession of the affected player/controller and stale recipients must not force a player choice or redirect damage to another player.

Promote the diagnostic into actual registered behavior tests when the implementation is green. Add two- and three-replacement chains, both legal5/9 outcomes, prefix/suffix event counts, reload at each question, finite-shield reservation, next-use effects, redirection, earlier-selected-holder departure, source/recipient/actor concessions and other direct callers. Every meaningful mutation must be caught with `missed: []`; rerun the existing damage/prevention/mana readers and preserve their legal outcome assertions. Current least-default assertions describe queued debt and cannot be silently weakened.
