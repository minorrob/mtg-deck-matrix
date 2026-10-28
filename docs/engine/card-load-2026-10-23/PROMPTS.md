# The prompts for the card load of 2026-10-23 (wave 4d)

**How to run it.** Open six new Claude Code cloud sessions on `minorrob/mtg-deck-matrix` and paste one prompt into each.
They run in parallel, on separate files and branches. None of them merges: when all six have pushed and opened a draft PR,
come back to the session that built this one, which merges the six as one (`README.md`, "The merge"). Attaching a lane
file to a session is optional: each prompt names the same file in the repository.

The order of value, if you start fewer at once:
- Sessions 1, 5 and 6 first: each reviews a card in a live deck (Absorb in D7, Goblin Sledder in D6, Blossoming Defense in
  D3), and session 1 writes the library's last three.
- Then 3 (the library's Bludgeon Brawl and Ragavan), 2 and 4.

---

## Session 1 · L1 The stack, walkers and two-faced cards (24 to write, 31 to review)

Card list: `docs/engine/card-load-2026-10-23/lane-L1-stack.json`

```text
You are lane L1 (the stack, walkers and two-faced cards) of the card load of 2026-10-23 (wave 4d), one of six parallel sessions. Your cards are in docs/engine/card-load-2026-10-23/lane-L1-stack.json, two lists, most-wanted first. "review" holds 31 candidates to review and promote, Absorb (in Rob's live deck D7) and Hydroblast (his library) among them. "cards" holds 24 to write by hand: the library's last three (Cunning Wish, Extrapolate the Impossible, Teferi, Mage of Zhalfir), then the most-played cards, among them Birgi, Tibalt's Trickery, Etali, Strionic Resonator and Valakut Awakening. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Card load, 2026-10-23"), then docs/engine/card-load-2026-10-23/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-w4d-l1-stack from origin/main. Your lane owns: counterspells and conditional counters; copies of spells and abilities; timing and casting restrictions; flash; loyalty abilities and emblems beyond what exists; modal double-faced cards and transforming permanents; boast; and cards from outside the game (CR 400.11; stop on Cunning Wish and Extrapolate the Impossible unless that construct is small). A card that needs another lane's rule: stop on it and name the rule.
3. Review and promote first: card-waves.mjs --review on the "review" list, approve only what is exactly right, --promote, then the three regenerations BRIEF.md names. Then write the "cards" list, most-played first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-w4d-l1-stack.py, missed: []). If you run long, stop at a clean point and say where.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-L1-stack.json`. Push, then open a draft PR "Card load w4d L1-stack: <n> written, <m> promoted" whose body is BRIEF.md's report. Do not mark it ready, merge it, merge main more than once, or edit docs/ACTIVE.md or Linear: the integration does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 2 · L2 The graveyard (33 to write, 22 to review)

Card list: `docs/engine/card-load-2026-10-23/lane-L2-graveyard.json`

```text
You are lane L2 (the graveyard) of the card load of 2026-10-23 (wave 4d), one of six parallel sessions. Your cards are in docs/engine/card-load-2026-10-23/lane-L2-graveyard.json, two lists, most-wanted first. "review" holds 22 candidates to review and promote, Scarblade Scout (Rob's library) among them. "cards" holds 33 most-played cards to write by hand, among them Dauthi Voidwalker, Emry, Lurker of the Loch, Six, Mox Diamond, Green Sun's Zenith and Splendid Reclamation. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Card load, 2026-10-23"), then docs/engine/card-load-2026-10-23/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-w4d-l2-graveyard from origin/main. Your lane owns: returning cards from graveyards; dies and leaves triggers; mill; retrace (Six); affinity (Emry); a replacement on every route to a graveyard (Dauthi Voidwalker); skipping the draw step and exiling discards (Necropotence); a discard as an entering cost (Mox Diamond); and recursive creatures. A card that needs another lane's rule: stop on it and name the rule.
3. Review and promote first: card-waves.mjs --review on the "review" list, approve only what is exactly right, --promote, then the three regenerations BRIEF.md names. Then write the "cards" list, most-played first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-w4d-l2-graveyard.py, missed: []). If you run long, stop at a clean point and say where.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-L2-graveyard.json`. Push, then open a draft PR "Card load w4d L2-graveyard: <n> written, <m> promoted" whose body is BRIEF.md's report. Do not mark it ready, merge it, merge main more than once, or edit docs/ACTIVE.md or Linear: the integration does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 3 · L3 Combat and equipment (29 to write, 26 to review)

Card list: `docs/engine/card-load-2026-10-23/lane-L3-combat.json`

```text
You are lane L3 (combat and equipment) of the card load of 2026-10-23 (wave 4d), one of six parallel sessions. Your cards are in docs/engine/card-load-2026-10-23/lane-L3-combat.json, two lists, most-wanted first. "review" holds 26 candidates to review and promote, among them Noble Hierarch, Stonecoil Serpent and Koma, World-Eater. "cards" holds 29 to write by hand: the library's Bludgeon Brawl, then the most-played cards, among them Ragavan, Nimble Pilferer, Shizo, Kappa Cannoneer, Hammer of Nazahn and Colossus Hammer. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Card load, 2026-10-23"), then docs/engine/card-load-2026-10-23/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-w4d-l3-combat from origin/main. Your lane owns: attack and block triggers and requirements; evasion and protection; Equipment, auto-attach and equip costs; totem armor; dash (Ragavan); damage doubling and redirection; fog; forced attacks; and Bludgeon Brawl's noncreature artifacts as Equipment. A card that needs another lane's rule: stop on it and name the rule.
3. Review and promote first: card-waves.mjs --review on the "review" list, approve only what is exactly right, --promote, then the three regenerations BRIEF.md names. Then write the "cards" list, most-played first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-w4d-l3-combat.py, missed: []). If you run long, stop at a clean point and say where.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-L3-combat.json`. Push, then open a draft PR "Card load w4d L3-combat: <n> written, <m> promoted" whose body is BRIEF.md's report. Do not mark it ready, merge it, merge main more than once, or edit docs/ACTIVE.md or Linear: the integration does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 4 · L4 Lands and mana (30 to write, 26 to review)

Card list: `docs/engine/card-load-2026-10-23/lane-L4-mana.json`

```text
You are lane L4 (lands and mana) of the card load of 2026-10-23 (wave 4d), one of six parallel sessions. Your cards are in docs/engine/card-load-2026-10-23/lane-L4-mana.json, two lists, most-wanted first. "review" holds 26 candidates to review and promote, among them Palladium Myr, Cryptolith Rite, Springleaf Drum and the Diamonds and Bridges. "cards" holds 30 most-played cards to write by hand, among them Arena of Glory, Simian Spirit Guide, Urza's Tower, Mine and Power Plant, Pyretic Ritual and Gyre Sage. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Card load, 2026-10-23"), then docs/engine/card-load-2026-10-23/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-w4d-l4-mana from origin/main. Your lane owns: land types and land abilities; mana abilities, rituals and mana doubling; Urza's lands; Food; exert (Arena of Glory); hideaway; landcycling; land creatures; and searching another player's library. A card that needs another lane's rule: stop on it and name the rule.
3. Review and promote first: card-waves.mjs --review on the "review" list, approve only what is exactly right, --promote, then the three regenerations BRIEF.md names. Then write the "cards" list, most-played first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-w4d-l4-mana.py, missed: []). If you run long, stop at a clean point and say where.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-L4-mana.json`. Push, then open a draft PR "Card load w4d L4-mana: <n> written, <m> promoted" whose body is BRIEF.md's report. Do not mark it ready, merge it, merge main more than once, or edit docs/ACTIVE.md or Linear: the integration does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 5 · L5 Tokens, counters and sacrifice (33 to write, 23 to review)

Card list: `docs/engine/card-load-2026-10-23/lane-L5-tokens.json`

```text
You are lane L5 (tokens, counters and sacrifice) of the card load of 2026-10-23 (wave 4d), one of six parallel sessions. Your cards are in docs/engine/card-load-2026-10-23/lane-L5-tokens.json, two lists, most-wanted first. "review" holds 23 candidates to review and promote, Goblin Sledder (in Rob's live deck D6) and Voracious Varmint (his library) first. "cards" holds 33 most-played cards to write by hand, among them The Earth Crystal, Torment of Hailfire, Greater Good, Zuran Orb, Ayara and Springheart Nantuko. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Card load, 2026-10-23"), then docs/engine/card-load-2026-10-23/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-w4d-l5-tokens from origin/main. Your lane owns: token creation; +1/+1 and other counters, including counters divided at activation (The Earth Crystal, CR 601.2d); sacrifice outlets and costs; punisher choices each player makes (Torment of Hailfire); anthems and -X/-X statics; and lifegain payoffs. A card that needs another lane's rule: stop on it and name the rule.
3. Review and promote first: card-waves.mjs --review on the "review" list, approve only what is exactly right, --promote, then the three regenerations BRIEF.md names. Then write the "cards" list, most-played first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-w4d-l5-tokens.py, missed: []). If you run long, stop at a clean point and say where.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-L5-tokens.json`. Push, then open a draft PR "Card load w4d L5-tokens: <n> written, <m> promoted" whose body is BRIEF.md's report. Do not mark it ready, merge it, merge main more than once, or edit docs/ACTIVE.md or Linear: the integration does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```

## Session 6 · L6 Spells, draws and discards (40 to write, 16 to review)

Card list: `docs/engine/card-load-2026-10-23/lane-L6-spells.json`

```text
You are lane L6 (spells, draws and discards) of the card load of 2026-10-23 (wave 4d), one of six parallel sessions. Your cards are in docs/engine/card-load-2026-10-23/lane-L6-spells.json, two lists, most-wanted first. "review" holds 16 candidates to review and promote, Blossoming Defense (in Rob's live deck D3), Ankle Biter and Pyroclasm (his library) first. "cards" holds 40 most-played cards to write by hand, Sylvan Library first, then among them Temur Ascendancy, High Tide, Expressive Iteration, Dramatic Reversal and Chord of Calling. If the file is attached, it is the same list.

1. Read AGENTS.md, docs/ACTIVE.md (the top, the lanes table, and "Card load, 2026-10-23"), then docs/engine/card-load-2026-10-23/BRIEF.md, and follow it exactly. If that directory is not on main yet, read it with `git show origin/claude/focused-feynman-tt20o3:<path>` and do not commit a copy.
2. Branch claude/engine-w4d-l6-spells from origin/main. Your lane owns: draw and discard, and wheels; "cards drawn this turn" (Sylvan Library); cost changes; tutors and searches; convoke with X (Chord of Calling); kicker; untapping permanents (Dramatic Reversal, High Tide); imprint copies cast without paying (Isochron Scepter; stop if copying a card is not built); and everything else in your list. A card that needs another lane's rule: stop on it and name the rule.
3. Review and promote first: card-waves.mjs --review on the "review" list, approve only what is exactly right, --promote, then the three regenerations BRIEF.md names. Then write the "cards" list, most-played first, per game/tools/batch/README.md, with scenarios and one breaks file (game/tools/batch/breaks-w4d-l6-spells.py, missed: []). If you run long, stop at a clean point and say where.
4. Prove it with BRIEF.md's "Done means", including `node tools/library-engine-index.mjs --check-lane docs/engine/card-load-2026-10-23/lane-L6-spells.json`. Push, then open a draft PR "Card load w4d L6-spells: <n> written, <m> promoted" whose body is BRIEF.md's report. Do not mark it ready, merge it, merge main more than once, or edit docs/ACTIVE.md or Linear: the integration does those.
5. Read narrowly (grep, line ranges, cut output). End with the report BRIEF.md describes, 30 lines or fewer.
```
