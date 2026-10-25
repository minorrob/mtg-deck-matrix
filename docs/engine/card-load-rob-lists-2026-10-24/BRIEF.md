# The brief for every lane of Rob's priority-list load (2026-10-24)

You are one of three lanes writing the 100 unwritten cards of Rob's four priority deck lists. `README.md` here has the
review and the table of lanes. Your prompt names your lane and its file.

**This brief is wave 4d's brief with the differences below.** Read `docs/engine/card-load-2026-10-23/BRIEF.md` and follow
everything in it (its "Read first", "Rules", "Done means" and "The report") except where this file says otherwise.

## Your card list

`lane-<lane>.json` here: `cards` only, no `review` list (none of the 100 is a candidate). Each card carries the
compiler's verdict and its `gaps`, the sentences no defined card writes. Every card is written by hand, with scenarios.

**Order:** the commanders first (Niko, Light of Hope; Galadriel, Light of Valinor; Frodo, Adventurous Hobbit and Sam, Loyal
Attendant; Yuna, Grand Summoner), then the cards that need no new rule, then the ones that need a rule your lane owns.

## Who builds which rule

The lanes run at once, so a rule must be built once. Before building anything, grep the definitions and the engine: most
of what these cards use exists (`README.md` lists it). A rule the table below does not name is the lane's whose card needs
it; if two lanes' cards need the same unbuilt rule, the lower-numbered lane builds it and the other stops on its card,
naming the rule.

| Lane | Owns |
| --- | --- |
| P1 blink | Airbend, waterbend and transforming a permanent; myriad; harness and the ∞ ability; an additional end step; "leave the battlefield without dying"; suppressing opponents' entering triggers; spells cast from anywhere other than a hand (a trigger, and "can't cast" from there); one target per opponent; the second card drawn and second spell cast each turn; skipping an extra turn |
| P2 Food | Devour; sacrificing X as a cost and the token-plus-Squirrels replacement; descend; a life-gain replacement; damage dealt this game by a named creature; revolt; reducing a Food's activation cost; exiling cards face down and playing them free; the Ring's tempt count |
| P3 counters | Alliance's "choose one that hasn't been chosen this turn"; moving counters between permanents; monstrosity X counted at resolution; a counter put on a creature you don't control; attack taxes until your next turn; "once each turn" counter triggers; mana from removing a counter |

## Rules (in addition to wave 4d's)

- **Branch** `claude/engine-roblists-<lane>` from `claude/card-engine-loading-0584aa` (the integration branch, which
  holds this folder), not from `main`. Do not merge `main` in: the integration does.
- **A new card can shadow a fixture.** A card any other card's scenarios use as a fixture by the same name fails
  `tests/engine-cards.mjs` once defined. Before defining each card, `grep -l '"<Name>": {' game/engine/cards/*/*.scenarios.json`;
  where it hits, rename that fixture `Smoke <name>` in its own file (with its option labels), as the 10-24 load did.
- **Breaks file:** `game/tools/batch/breaks-roblists-<lane>.py`, one break per engine change, `missed: []`.
- **"Fix" means the card plays as at a table** (Rob's glossary). A case you step around is an "ignore", named as one in
  the report, never a fix.
- **Players decide.** Airbend's {2} is a cast permission its owner may use or not; "may" is asked; Alliance's choice is
  asked among the modes not yet chosen; a random choice (Summon: Magus Sisters) is random, not the controller's.
- **Generated files** (`definitions.mjs`, coverage, the data inventory): regenerate them on your branch so your checks run;
  the integration regenerates them once more after merging the three.
- **Do not** edit `docs/ACTIVE.md`, Linear, `README.md` here, or another lane's cards. Do not mark your PR ready.

## Done means

Wave 4d's "Done means", with `--check-lane docs/engine/card-load-rob-lists-2026-10-24/lane-<lane>.json`, and a draft PR
into `claude/card-engine-loading-0584aa` titled `Rob's lists <lane>: <n> of <m> written`, whose body is wave 4d's report.
`bash tools/local-ci.sh HEAD 0` needs `node_modules`: in a new worktree, a junction to the primary checkout's (PowerShell
`New-Item -ItemType Junction -Path <worktree>\node_modules -Target C:\Users\robmi\CrankMagic\repo\node_modules`). Never
delete a worktree through that junction.
