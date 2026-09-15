# Native AI card support: findings and resolution

Pinned Forge: 58bcd59062a3b44019195a3c25d6ab41a7fe2f61. This audit concerns the four saved decks used for the local pod; it is not a certification of all cards or all deck variations.

## Why cards were unused

The scripts exist, but Forge marks some cards AI:RemoveDeck:All. AiController.java:1565–1569 removes abilities hosted by those cards from its proactive action candidates. Consequently an AI API key attached to the existing native pilot would not solve this. Mandatory triggers and card rules can still resolve; this is different from a missing card implementation. RemoveDeck:Random concerns random deck construction, and RemoveDeck:NonCommander does not exclude Commander cards.

| Deck | Cards flagged for native AI |
|---|---|
| Chulane (relevant when AI-piloted) | Freed from the Real; Kiora’s Follower; Simic Signet; Dream Stalker; Kami of Ancient Law |
| Krenko | Faithless Looting; Barrage of Expendables; Goblin Bombardment |
| Atraxa | Plaguemaw Beast; Simic Signet; Tragic Arrogance; Azorius Signet |
| Shadrix | Orzhov Signet; Viscera Seer |

All definitions resolved in these four snapshots. Fourteen seat occurrences represent thirteen unique cards. The retained seed-42 journal has zero cast/activation events for these occurrences; zero alone would not prove an available missed play. The source filter explains the proactive exclusion.

## Required fixes, in order

1. **Paid mana sources:** exercise Signets with one available mana, mixed colored costs, restricted mana, and alternative sources. Add a dependency-aware mana plan before selectively allowing their native actions. Preserve basic lands when they are needed for a later color, rather than enforcing a universal basics-first rule.
2. **Sacrifice outlets and proliferate:** evaluate the sacrificed permanent, death triggers, token replacements, poison, and remaining future value. Cover Bombardment, Barrage, Viscera Seer, Plaguemaw Beast, and Kami of Ancient Law with useful and harmful activations.
3. **Looting and modal selections:** test discard choices/flashback for Faithless Looting; return targets for Dream Stalker; simultaneous permanent-type preservation for Tragic Arrogance.
4. **Untap engines:** model Freed from the Real and Kiora’s Follower as multi-action plans. Retain the native recursion guard until a bounded planner proves positive net resources and can stop. Never remove all AI flags globally.
5. **Proliferate rating:** CountersProliferateAi.java:99 performs integer division before multiplication in value / manaCost * 100. For value 3 and cost 4 it scores 0 instead of 75; its zero-cost branch can also score useful effects below the normal play threshold. Add numeric edge cases and real board scenarios before changing the formula and enabling affected decisions.
6. **API pilot:** enumerate engine-legal actions independently of native AI exclusions. Re-plan after draws, resolved effects, revealed information and priority changes using only that seat’s permitted information. Difficulty controls search budget/strategic depth, never rules legality or hidden-information access.

## Telemetry needed to validate improvement

Record candidate action ID, card identity, legality, exclusion reason, available mana plan, target set, pilot score, chosen action and rejection reason at each decision. Connect activation → cost payment → trigger → stack item → resolution with causal IDs, recording productive loop iterations, stopping conditions, and resource deltas. The current private raw event journal and browser offered/answered/submitted events are useful evidence but do not yet provide this complete causal report.

The setup now surfaces native AI warnings before launch and retains the user’s exact deck. No engine scripts or native AI exclusions were changed by this audit. See ai-compatibility.json for per-card script paths, abilities, hints, and seed-42 event counts.
