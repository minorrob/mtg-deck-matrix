# W4 saved mana damage continuation

This remains open wave-0 debt. Code `20e13e9e` adds a real saved damage consumer for manual mana activation, including moving costs, nested branch/repeat effects, and damage prevention follow-ups. It does not close the other synchronous callers, combat replay, token attacks, or joint blocker requirements. No cards were added or promoted, and no clean game or gate credit is claimed.

## Proven actual caller

`actions.mjs` now saves a moving mana activation before a cost can ask a replacement question. Tap/life/counter payments happen once; mill, exile and sacrifice costs use child move frames; mana is produced after the costs; the suffix uses saved outside-effect frames. The original source ID, matching departure qualities, source reference and mana provenance survive JSON reload. A real Nirkana Revenant recognizes a Swamp whose sacrifice cost has already moved it, and adds its mana once. Only the matching old source snapshot can satisfy that reader. A Revenant sacrificed as a cost is absent when mana is produced, so the negative control adds only the base mana (CR 106.12a, 603.10).

`damage-operation.mjs` retains plain proposals with applied replacement identities and deferred consumption. A selected modifier survives its holder leaving. Remaining effects and recipients are read from live state after concessions. Each affected player receives the real choice; redirection transfers subsequent questions to the new recipient's controller. An abandoned recipient receives no damage, and a departed actor has no remaining suffix.

A shared finite shield permits the affected player to modify either simultaneous source before allocating prevention. The amount choice validates a complete integer vector, per-source bounds and the total before changing state. Both 1-damage sources may be tripled first, then a shield of 3 assigned entirely to the second source: only the first source deals 3. A shield counter prevents the simultaneous batch while consuming one counter. Finite and next-use shields remain unspent while questions are pending.

`resources.mjs` commits settled damage without replaying replacements and retains source infect, deathtouch, lifelink and public attribution. Live damage uses the derived source controller; pending sources refresh immediately before a player removes cards and control effects. A sequential-concession fixture removes a layer-2 holder, reloads, then removes the source's owner, and verifies the final event and damage-trigger outcome use the actual departure controller. The narrow live attribution commit `dfe3f377` is retained separately in history for the playtest lane.

## RED / GREEN and evidence

The original source `aae67e76` native diagnostic failed: actual Shivan Reef activation chose 5 damage automatically, with no question. It must instead preserve life 40, one red mana and a tapped Reef while asking the affected player. Choosing Add Two first deals 9; choosing Fiery Emancipation first deals 5. The original diagnostic is preserved and now passes both answers and reloads:

```powershell
node docs/engine/card-load-100-2026-10-28/w0/evidence/w4-mana-order-red.mjs
node --stack-size=4000 tests/engine-outside-damage.mjs
```

The registered native suite passes 140 checks, including both legal outcomes, three-effect chains, applied-holder departure, source/recipient/actor departures, sequential control changes, finite allocations in four directions, source-specific simultaneous modifier order, shield-counter batching, next-use consumption, redirection, nested branch/repeat prefix/suffix counts, actual moving costs, exact mana provenance and triggered mana. Invalid selections leave the saved question and game unchanged.

Twenty-seven new meaningful mutations are caught with `missed: []`. The original 69 mutations from replacement steps, rule operations and W4d L4 mana retain the union of all original readers and assertions. Four moved anchors were reanchored; the replacement guard still refuses unsupported proposal types, while real damage proposals now have native coverage. The final 22 affected reader suites are green. The anchors inventory has 32 inherited UI problems and no engine problems; none are ignored or newly waived.

Machine-readable record: `evidence/w4-damage-native-20261029.json`. Mutation transcripts: `evidence/w4-damage-mutations.txt` and `evidence/w4-damage-original-mutations.txt`. The README registers the new suite and counts 673 Node suites on this branch. No whole-suite or clean-game completion is asserted.

## Remaining work and seams

- Synchronous `runEffect` and `runFollowUps` callers outside this actual mana consumer retain `leastFirst`. Extend their real public callers into saved frames before removing that fallback; throwing or excluding them is not completion.
- Combat and ordinary resolution damage still replay answer keys. Migrate those callers before claiming applied replacements survive all departures. Combat assignment/Battle changes require coordination with root; Battle runtime is not implemented.
- Other outside zone, token and payment callers and repeated-loop completion need their own staged outcomes. This checkpoint supplies no clean-game proof for them.
- Damage replacement applicability still has raw replacement-holder controller reads. A layer-2 holder change needs a native counterexample and a focused fix; the derived **damage-source** controller work does not close that separate debt.
- Tokens entering attacking and blocker-side joint requirements (ROB-149) remain open.

W5 owns mana offer/funding identity and planner performance. Its published `8e869e91` / record `c3bb1824` fixes actual layer-2 stolen-source mana offers and ordinary funding; root integrates it separately. The moving-cost fixture here uses an actually controlled source owned by another player and does not claim that W5 fix. W5 granted the optional matching `sourceWas` argument in `addProvenance`; its ID reservation and payment logic are unchanged here. The playtest lane owns ordinary action cancellation and modal contracts. Root owns V8, generated artifacts, ACTIVE/RUN, program Linear updates and integration.
