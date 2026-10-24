# The prompts for the library card load (2026-10-21)

**How to run it.** Open eight new Claude Code cloud sessions on `minorrob/mtg-deck-matrix` and paste one prompt into each.
Sessions 1–7 run in parallel, on separate files. Session 8 waits for them and then merges all seven. You may start it now or
after the others. Attaching a lane file to a session is optional: each prompt names the same file in the repository.

The order of value, if you start fewer at once:
- Sessions 1, 2 and 6 unblock D1 and D7: D7's commander is in 6.
- Then 3, the candidates (7), 5 and 4.

---

## Session 1 · L1 Planeswalkers, loyalty and two-faced cards (17 cards, 14 in D1/D4/D7)

Card list: `docs/engine/library-load-2026-10-21/lane-L1-walkers.json`

```text
You are lane L1 (planeswalkers, loyalty and two-faced cards) of Rob's library card load of 2026-10-21, one of seven parallel sessions. Your cards are in docs/engine/library-load-2026-10-21/lane-L1-walkers.json: 17 cards, most-wanted first. 14 are in decks Rob plays from boxes. 13 are D1's: Oath of Teferi, both Ajanis, Carth, Garruk Relentless, Interplanar Beacon, Mordenkainen, Teferi Hero of Dominaria, The Wandering Emperor, Way of the Mentor, Grist and Vraska Relic Seeker. Teferi, Time Raveler is D7's and Nethroi is D4's. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Library card load, 2026-10-21"), then docs/engine/library-load-2026-10-21/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-libload-l1-walkers from origin/main. Your lane owns: loyalty abilities and costs, loyalty counters, planeswalker triggers, activating loyalty abilities twice, emblems (CR 114; three of your walkers make one), the sorcery-timing restriction on opponents (Teferi, Time Raveler), two-faced cards, and mutate. A card that needs another lane's rule: stop on it and name the rule.
3. Define every card you can make faithful, most-wanted first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-libload-l1-walkers.py, missed: []). Stop on any card that needs a large construct and say exactly what it needs.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-L1-walkers.json`. Push, then open a draft PR "Library load L1-walkers: <n> of 17 cards". Do not mark it ready, merge it, release, or edit docs/ACTIVE.md: the integration session does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 2 · L2 The stack and control (19 cards, 9 in D3/D7)

Card list: `docs/engine/library-load-2026-10-21/lane-L2-stack.json`

```text
You are lane L2 (the stack and control) of Rob's library card load of 2026-10-21, one of seven parallel sessions. Your cards are in docs/engine/library-load-2026-10-21/lane-L2-stack.json: 19 cards, most-wanted first. 9 are in decks Rob plays from boxes. Eight are D7's: Silence, Clever Concealment, Boromir Warden of the Tower, Grim Haruspex, Rebuff the Wicked, Bilbo's Gambit, Overwhelming Denial and Render Silent. Refute is D3's. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Library card load, 2026-10-21"), then docs/engine/library-load-2026-10-21/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-libload-l2-stack from origin/main. Your lane owns: counterspells and conditional counters, "can't cast spells this turn", spells cast with no mana spent, phasing (CR 702.26), morph (CR 702.37), surge, spree, flash grants, and gaining control until end of turn. Cunning Wish and Extrapolate the Impossible need cards from outside the game (CR 400.11), which is not built: stop on them unless the construct is small and fits the engine's terms. A card that needs another lane's rule: stop on it and name the rule.
3. Define every card you can make faithful, most-wanted first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-libload-l2-stack.py, missed: []). Stop on any card that needs a large construct and say exactly what it needs.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-L2-stack.json`. Push, then open a draft PR "Library load L2-stack: <n> of 19 cards". Do not mark it ready, merge it, release, or edit docs/ACTIVE.md: the integration session does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 3 · L3 The graveyard (14 cards, 8 in D1/D2/D3/D5/D6/D7)

Card list: `docs/engine/library-load-2026-10-21/lane-L3-graveyard.json`

```text
You are lane L3 (the graveyard) of Rob's library card load of 2026-10-21, one of seven parallel sessions. Your cards are in docs/engine/library-load-2026-10-21/lane-L3-graveyard.json: 14 cards, most-wanted first. 8 are in decks Rob plays from boxes: Reveillark (D5, D7), Luminous Broodmoth (D7), Hostage Taker (D7), Happily Ever After (D1), Goblin Engineer (D6), Amphin Mutineer (D3), Boggart Shenanigans (D6) and Regrowth (D2). If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Library card load, 2026-10-21"), then docs/engine/library-load-2026-10-21/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-libload-l3-graveyard from origin/main. Your lane owns: returning cards from graveyards, dies and leaves-the-battlefield triggers, returning a creature that died, exiling until it leaves (including Hostage Taker's casting of the exiled card), manifest dread, and shuffling a card into its owner's library. A card that needs another lane's rule: stop on it and name the rule.
3. Define every card you can make faithful, most-wanted first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-libload-l3-graveyard.py, missed: []). Stop on any card that needs a large construct and say exactly what it needs.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-L3-graveyard.json`. Push, then open a draft PR "Library load L3-graveyard: <n> of 14 cards". Do not mark it ready, merge it, release, or edit docs/ACTIVE.md: the integration session does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 4 · L4 Combat and equipment (21 cards, 4 in D3/D4/D5/D7)

Card list: `docs/engine/library-load-2026-10-21/lane-L4-combat.json`

```text
You are lane L4 (combat and equipment) of Rob's library card load of 2026-10-21, one of seven parallel sessions. Your cards are in docs/engine/library-load-2026-10-21/lane-L4-combat.json: 21 cards, most-wanted first. 4 are in decks Rob plays from boxes: Teysa Envoy of Ghosts (D7), Leyline Axe (D3), Umbral Mantle (D4) and Cartel Aristocrat (D5). Kaalia of the Vast is a design deck's commander (G0-D2). If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Library card load, 2026-10-21"), then docs/engine/library-load-2026-10-21/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-libload-l4-combat from origin/main. Your lane owns: attack and block triggers and requirements ("must be blocked if able", "can't be blocked by more than one creature"), granted double strike, protection from creatures and from colors (Black Knight is vetoed on "protection from COLOR"; find out why the calibration failed it), bushido (CR 702.45), saddle, Equipment and auto-attach, and permanents that begin the game on the battlefield (Leyline Axe). A card that needs another lane's rule: stop on it and name the rule.
3. Define every card you can make faithful, most-wanted first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-libload-l4-combat.py, missed: []). Stop on any card that needs a large construct and say exactly what it needs.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-L4-combat.json`. Push, then open a draft PR "Library load L4-combat: <n> of 21 cards". Do not mark it ready, merge it, release, or edit docs/ACTIVE.md: the integration session does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 5 · L5 Tokens, counters and sacrifice (16 cards, 4 in D4/D5/D6)

Card list: `docs/engine/library-load-2026-10-21/lane-L5-tokens.json`

```text
You are lane L5 (tokens, counters and sacrifice) of Rob's library card load of 2026-10-21, one of seven parallel sessions. Your cards are in docs/engine/library-load-2026-10-21/lane-L5-tokens.json: 16 cards, most-wanted first. 4 are in decks Rob plays from boxes: Plumb the Forbidden (D5), Dark-Dweller Oracle (D6), Ruthless Lawbringer (D5) and Wall of Shards (D4). If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Library card load, 2026-10-21"), then docs/engine/library-load-2026-10-21/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-libload-l5-tokens from origin/main. Your lane owns: token creation, +1/+1 and other counters (fuse), sacrifice outlets and sacrifice as a cost (Plumb the Forbidden copies for each one sacrificed), lifegain payoffs, cumulative upkeep (CR 702.24; Wall of Shards), survival, and blight. A card that needs another lane's rule: stop on it and name the rule.
3. Define every card you can make faithful, most-wanted first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-libload-l5-tokens.py, missed: []). Stop on any card that needs a large construct and say exactly what it needs.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-L5-tokens.json`. Push, then open a draft PR "Library load L5-tokens: <n> of 16 cards". Do not mark it ready, merge it, release, or edit docs/ACTIVE.md: the integration session does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 6 · L6 Spells, draws and discards (23 cards, 5 in D1/D2/D7, including D7's commander)

Card list: `docs/engine/library-load-2026-10-21/lane-L6-spells.json`

```text
You are lane L6 (spells, draws and discards) of Rob's library card load of 2026-10-21, one of seven parallel sessions. Your cards are in docs/engine/library-load-2026-10-21/lane-L6-spells.json: 23 cards, most-wanted first. 5 are in decks Rob plays from boxes. Queza, Augur of Agonies comes first: it is D7's commander, so D7 cannot be seated until it is defined. The other four are Liliana's Standard Bearer (D7), Veil of Summer (D1), and Eerie Interlude and Flickering Hound (D2). Kynaios and Tiro of Meletis is a design deck's commander (G0-D4). If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Library card load, 2026-10-21"), then docs/engine/library-load-2026-10-21/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-libload-l6-spells from origin/main. Your lane owns: draw and discard triggers, triggers on a spell's mana value, landcycling, "if you cast it", tutors, and everything else in your list that no other lane's theme claims. A card that needs another lane's rule: stop on it and name the rule.
3. Define every card you can make faithful, most-wanted first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-libload-l6-spells.py, missed: []). Stop on any card that needs a large construct and say exactly what it needs.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-L6-spells.json`. Push, then open a draft PR "Library load L6-spells: <n> of 23 cards". Do not mark it ready, merge it, release, or edit docs/ACTIVE.md: the integration session does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 7 · Candidates: review and promote (8 cards, 3 in D3/D6/D7)

Card list: `docs/engine/library-load-2026-10-21/lane-candidate-review.json`

```text
You are the candidate review of Rob's library card load of 2026-10-21, one of seven parallel sessions. Eight of Rob's cards already play at playtest tables as card-compiler candidates. Promote the ones that are right to final cards, so every table plays them. The list is docs/engine/library-load-2026-10-21/lane-candidate-review.json: Absorb (D7), Blossoming Defense (D3), Goblin Sledder (D6), Ankle Biter, Hydroblast, Pyroclasm, Scarblade Scout and Voracious Varmint. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Library card load, 2026-10-21"), docs/engine/library-load-2026-10-21/BRIEF.md (its rules hold for you too), and docs/engine/plan-card-load-program.md, "Waves, built (step 6)". If the load's directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-libload-candidates from origin/main. Run `node --stack-size=4000 game/tools/card-waves.mjs --review --cards "Absorb,Blossoming Defense,Goblin Sledder,Ankle Biter,Hydroblast,Pyroclasm,Scarblade Scout,Voracious Varmint" --out docs/engine/waves/2026-10-21-library.md`. Read the sheet: check each ability against its oracle sentence and against what the game showed. Approve only what is exactly right. Write a wrong one by hand per game/tools/batch/README.md, or leave it with the reason.
3. Run `node --stack-size=4000 game/tools/card-waves.mjs --promote "<the approved names>"` and regenerate what it names. Then BRIEF.md's "Done means": check-cards reports 0 failed, the engine suites pass, and `node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-candidate-review.json` reports them final.
4. Push, then open a draft PR "Library load: review and promote <n> of 8 candidates". Do not mark it ready, merge it, release, or edit docs/ACTIVE.md: the integration session does those.
5. Read narrowly. End with a report of 30 lines or fewer: each card promoted, rewritten or left (and why), the suites and their results, the branch, the SHAs and the PR URL.
```

## Session 8 · Integration (start any time; it waits for the seven)

```text
You are the integration session of Rob's library card load of 2026-10-21. Seven parallel sessions each push a branch claude/engine-libload-* with a draft PR: six card lanes (l1-walkers, l2-stack, l3-graveyard, l4-combat, l5-tokens, l6-spells) and the candidate review (candidates). Merge them into one PR, verify the whole, merge it, and record the outcome.

1. Read AGENTS.md, docs/ACTIVE.md, docs/engine/library-load-2026-10-21/README.md and BRIEF.md, and docs/handoff-2026-10-12.md section 5 (how a wave is integrated). In docs/ACTIVE.md, under "Library card load, 2026-10-21", record that you are integrating, on claude/engine-libload-integrate.
2. Wait until all seven branches exist and each PR body carries its session's report. Check with `git ls-remote origin 'refs/heads/claude/engine-libload-*'` and the GitHub tools, using a Monitor until-loop rather than sleep. If a session has stopped without pushing, say so to Rob and integrate the rest.
3. Branch claude/engine-libload-integrate from origin/main. Merge the lanes in order with merge commits (l1 through l6, then candidates). Generated files conflict every time: run `docs/handoff-2026-10-12/regen.sh <checkout>`, and fix the README with `docs/handoff-2026-10-12/resolve-readme.py README.md`. In a code conflict keep both sides; where two lanes built the same rule, keep one and retarget the other lane's breaks to it. Then run `python3 -I game/tools/batch/anchors.py`, re-anchor every moved break on the code it was written for, and prove each one with docs/handoff-2026-10-12/break-one.py.
4. Verify the integrated head as section 5.3 says:
   - check-cards reports 0 failed;
   - the suite list passes, four at a time;
   - the seeded games are clean (`node --stack-size=4000 tools/fuzz-live.mjs --library --humans 0 --seeds 1-10 --replay --leaks`, then `--humans 0,1 --seeds 11-20`);
   - `node tools/library-engine-index.mjs` with one `--check-lane` per lane file in docs/engine/library-load-2026-10-21/ lists exactly the cards the lanes stopped on;
   - `bash tools/local-ci.sh HEAD 0` reports SCAN PASS.
5. Open one PR, "Library load: <n> of 118 cards from Rob's library", whose body lists, per live deck (D1 to D7), what still cannot be seated and why. Mark it ready and merge it on a green `suites` run with a merge commit. Close the seven lane PRs as superseded by it, naming it.
6. Release staging only if docs/ACTIVE.md shows the Claude · Engine lane (the one release owner) is free or yours. Otherwise record the merge for its holder (Linear ROB-11). Record the outcome in docs/ACTIVE.md. End with a report of 30 lines or fewer.
```
