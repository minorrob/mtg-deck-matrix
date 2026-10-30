# October 29 live card reports

Rob added these reports while wave 0 remained active. The native triage below uses published `0130f853`, actual saved
card definitions and explicit choices. It does not reproduce the deployed game or give G-3/G-5/G-6 acceptance credit.
No saved definition was changed. Rob subsequently approved the narrow Snoop UI fix and its required asset updates;
its isolated production regression is recorded below. The screenshot stays in the user's attachment storage.

| Report | Measured native result | Remaining work |
| --- | --- | --- |
| Valakut Exploration cannot play its exiled card | A real land play and resolved landfall exile Lightning Bolt; the paid Bolt resolves for 3. Rob clarified Purphoros, God of the Forge and the next exiled card. Two real landfall triggers exile Purphoros and Raging Goblin; both cast from Exile, resolve, and Purphoros's actual entry trigger deals 2. | [ROB-226](https://linear.app/robs-build/issue/ROB-226/valakut-exploration-cannot-play-its-exiled-card-in-the-live-game): compare current main's Exile funding with the wave-zero branch and verify the deployed version. Preserve normal mana, timing and land-play limits. |
| Conspicuous Snoop does not show or allow successive library cards | Actor, opponent and spectator receive the revealed Fanatical Firebrand, then Raging Goblin, then Mountain. Both Goblins cast from Library; Mountain gets no illegal Snoop land-play offer. | [ROB-227](https://linear.app/robs-build/issue/ROB-227/conspicuous-snoop-reveal-and-offer-the-playable-top-library-card-on): the board's `mat()` passed null as the Library pile's top card, discarding authoritative revealed `Library.cards`. Rob explicitly approved the verified two-line renderer fix with required asset versions. Isolated branch `codex/engine-load100-w0-snoop-ui` applies that scope, with production-only browser proof; preserve held draw and unseen libraries. |
| Patchwork Banner appears not to add +1/+1 | Actual cast, explicit Goblin choice: Fanatical Firebrand 1/1→2/2, Krenko 3/3→4/4, Goblin Instigator 1/1→2/2; the opponent's Instigator remains 1/1. Native projection matches and counters stay empty. The screenshot shows those boosted stats. | Explain the continuous bonus; do not add counters or invent a rule fix. A live discrepancy would require fresh evidence. |

Snoop reveals every top card but permits only Goblin spells, with normal costs and timing. Valakut's permission lasts
while that exact card remains exiled; its end-step trigger removes remaining linked cards when it resolves. Neither
permission moves a card into Hand. UI actions must use the actual authoritative offer and card ID.

Reproducible local diagnostic: `load100/scratch/root-live-card-triage.mjs` and `.log`. The first draft of the diagnostic
named unloaded Goblin Arsonist; it was corrected to already-loaded Raging Goblin before these results were recorded.
No card was added to make the test pass. The dedicated P0 intake follows its current clean native-refresh dependency.

The reported Purphoros funding difference is reproduced on clean current main `7f6e76ae`: after real landfall,
no floating mana and four untapped Mountains give zero Exile cast offers. Explicitly tapping those Mountains gives
one offer and Purphoros resolves. The wave-zero branch after native refresh integration `02aafba4` gives one offer
before manual taps; the actual cast taps all four sources, pays four mana and resolves. Existing W5 permitted-zone
funding supplies this fix. This comparison does not establish which source revision the deployed game used.

Registered `tests/engine-valakut-exploration.mjs` passes29 checks, covering actual Purphoros and the successive Goblin,
real payment and2 damage, instant response before end-step removal, unused-card removal/damage, sorcery timing and
the spent land play. Its causal Exile-funding removal is caught by the direct reported-card assertion, with original
source restored exactly. The new mutation spec retains all four original W3 permission readers; all five baseline
suites pass, one mutation caught, `missed: []`. Existing mutation specs and their unions are unchanged.

The UI ownership boundary remains `AGENTS.md`'s lane table. Rob's explicit narrow override covers this Snoop fix,
required asset versions and its regression proof. Other UI work stays with its owner. The isolated branch excludes
the unpublished controller/room/refinement/epoch prototype. Original candidate proof passed98 across Table, Focus
and real Babylon WebGL3D; a held-draw reversion failed its direct action assertion. Actual production source passed98
again on isolated clean branch `42e22351` in draft #949. Independent hidden-top and held-draw controls are caught;
twelve whole-screen screenshots were inspected. Existing footer/3D camera limits remain outside this two-line fix.
Root merged #949 with native refresh #947 and bounded Battle/SBA #950. The actual combined source `9195f0fc` passes
the registered browser98 again, with fresh screenshots under `load100/scratch/snoop-root-integration-shots` inspected
in Table, Focus and WebGL3D. Source/hash remain exact and all browser/server resources close. The scoped reveal,
cast and held-draw behavior is verified; no deployment, full-layout or wave-zero gate completion is claimed.

## Saved scenario evidence

Clean selected baseline `ef1d2ba4` runs eight original scenarios, fails Banner's ambiguous three-Wastes tap and reaches
two of eight abilities. Source `be1a2b89` changes only those three taps to explicit physical indices and adds one Snoop
non-Goblin reveal/privacy scenario. Every original fixture, step, choice, expected creature-type list and final assertion
is preserved. All nine now pass; four of eight abilities are reached. Two are runtime-only omission proofs with direct
behavior failures: Snoop's actual public Library projection disappears, and Banner's Elf becomes1/1 instead of2/2.

Snoop's cast permission/granted-ability static and Banner's entry replacement/mana ability remain unproved by these
saved scenarios. Lost offers/question presence receive no execution credit; the selected checker correctly exits1.
The full legacy card reader passes55 checks over all6,430 definitions/current scenarios; it does not establish strict
G-3. Source/input hashes, full compressed diagnostic ledgers and the exact remaining four abilities are archived in
`evidence/live-report-three-proof.json`. No saved card definition/rule module changes or new-card credit.

## Separate pool baseline finding

One new pool seed on the same source finished in 35 turns with 73 person decisions, identical replay, zero AI
refusals and zero leaks across 74 checks. It is **not clean**: the simulated person supplied one illegal block against
Gallia's menace and retried it. Strict mode rejects that game and credits zero exercised cards/abilities. This is a
verifier/pilot joint-block legality finding; no refusal is ignored or replaced for acceptance.

Raw bounded diagnostic files are `load100/scratch/pool-0130-seed1{.json,.log,-run.json,-exercised.json}`. The required
200 pool, 50 library and two 25-seed staging runs remain unmet. No unchanged retry was run.
