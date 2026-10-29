# October 29 live card reports

Rob added these reports while wave 0 remained active. The native triage below uses published `0130f853`, actual saved
card definitions and explicit choices. It does not reproduce the deployed game or give G-3/G-5/G-6 acceptance credit.
No saved definition or UI production code was changed. The screenshot stays in the user's attachment storage.

| Report | Measured native result | Remaining work |
| --- | --- | --- |
| Valakut Exploration cannot play its exiled card | A real land play and resolved landfall exile Lightning Bolt; native Exile cast offers exist and the actual paid Bolt resolves for 3 damage. | [ROB-226](https://linear.app/robs-build/issue/ROB-226/valakut-exploration-cannot-play-its-exiled-card-in-the-live-game): reproduce the current room/UI/version and the reported card; preserve normal mana, timing and land-play limits. Rob was asked which card and whether the land play was used. |
| Conspicuous Snoop does not show or allow successive library cards | Actor, opponent and spectator receive the revealed Fanatical Firebrand, then Raging Goblin, then Mountain. Both Goblins cast from Library; Mountain gets no illegal Snoop land-play offer. | [ROB-227](https://linear.app/robs-build/issue/ROB-227/conspicuous-snoop-reveal-and-offer-the-playable-top-library-card-on): the board's `mat()` passes null as the Library pile's top card, discarding authoritative revealed `Library.cards`. P0 prepares an unapplied patch and real-room browser evidence for the UI owner. Preserve held draw and unseen libraries. |
| Patchwork Banner appears not to add +1/+1 | Actual cast, explicit Goblin choice: Fanatical Firebrand 1/1→2/2, Krenko 3/3→4/4, Goblin Instigator 1/1→2/2; the opponent's Instigator remains 1/1. Native projection matches and counters stay empty. The screenshot shows those boosted stats. | Explain the continuous bonus; do not add counters or invent a rule fix. A live discrepancy would require fresh evidence. |

Snoop reveals every top card but permits only Goblin spells, with normal costs and timing. Valakut's permission lasts
while that exact card remains exiled; its end-step trigger removes remaining linked cards when it resolves. Neither
permission moves a card into Hand. UI actions must use the actual authoritative offer and card ID.

Reproducible local diagnostic: `load100/scratch/root-live-card-triage.mjs` and `.log`. The first draft of the diagnostic
named unloaded Goblin Arsonist; it was corrected to already-loaded Raging Goblin before these results were recorded.
No card was added to make the test pass. The dedicated P0 intake follows its current clean native-refresh dependency.

The UI ownership boundary remains `AGENTS.md`'s lane table. A board change requires the UI owner's coordination or
Rob's explicit narrow override after the native/browser proof and proposed patch are concrete.

## Separate pool baseline finding

One new pool seed on the same source finished in 35 turns with 73 person decisions, identical replay, zero AI
refusals and zero leaks across 74 checks. It is **not clean**: the simulated person supplied one illegal block against
Gallia's menace and retried it. Strict mode rejects that game and credits zero exercised cards/abilities. This is a
verifier/pilot joint-block legality finding; no refusal is ignored or replaced for acceptance.

Raw bounded diagnostic files are `load100/scratch/pool-0130-seed1{.json,.log,-run.json,-exercised.json}`. The required
200 pool, 50 library and two 25-seed staging runs remain unmet. No unchanged retry was run.
