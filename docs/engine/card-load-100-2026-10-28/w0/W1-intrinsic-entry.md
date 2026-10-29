# W1 intrinsic entry counters

Lane: `codex/engine-load100-w0-w1-faces`, continued from published `75e3ff77879f3012215737714ef61d76e4e01b9e`
(draft PR #944). This bounded slice preserves the Battle-entry checkpoint and does not close W1 or wave 0.

## Reproduced failures

The native public cast of a generic creature planeswalker under an existing ability-removal effect received its
printed loyalty despite losing the intrinsic entry ability. It survived instead of going to its owner's graveyard
under the actual zero-loyalty SBA. Both synchronous entry readers reproduced the same incorrect counters.
The original three-case RED fixture is retained in `W1-intrinsic-entry-red.mjs.txt`.

An expanded single run also reproduced native and synchronous entry reducing loyalty for a Compleated keyword
removed before entry. The ordinary and retained-keyword controls passed. All five defect witnesses remain in the
active native suite, with their original expected outcomes. Rules checked locally: CR 306.5b, 310.4b, 614.12,
702.150a. No card definitions, generated data, providers or emblems were changed.
The official [Kamigawa release notes](https://magic.wizards.com/en/news/feature/kamigawa-neon-dynasty-release-notes-2022-02-09)
also describe Compleated's interaction with other replacements. The distinct possible totals below follow from that
interaction and CR 616.1, rather than a fixed-order assumption.

## Bounded change

`entry-characteristics.mjs` holds the existing prospective-entry view and patch helpers; `pre-entry.mjs` keeps their
old exports. Native and synchronous readers use the same intrinsic-counter calculation against the entrant's final
prospective types, printed/copied numbers and ability loss. Compleated uses its prospective keyword. Independent
entry-counter grants and the existing placement-replacement machinery remain separate.

`engine-intrinsic-entry` checks native casts, actual zero-loyalty SBAs, both synchronous readers, prospective type and
ability loss, the entrant's own static effect, read purity, an independent external loyalty grant, actual concessions
and JSON reload before resolution. Actual Doubling Season gives six counters when Compleated alone is removed;
removing every ability supplies no intrinsic counters to double. It does not restore the lost ability.

The twelve new semantic probes are caught against the combined original pre-entry/copy union, including the complete
`engine-cards` baseline. The four moved Battle-defense probes are also caught. The reanchored copied-planeswalker
probe initially went unobserved by its original native scenarios: those scenarios now use native pre-entry rather
than the synchronous `ownEntering` branch. Its original suites and assertions are retained, and the exact legacy-own
reader is added to that probe's suite list. Both the initial miss and the final result are retained as evidence.
Its final full baseline passes and its mutation is caught. Six moved original pre-entry probes also catch their
regressions against the unchanged original reader union. No original suite or assertion was removed. Final static
audit reports the same 33 inherited UI targets and zero engine targets. The unchanged funded face-down/Adventure
readers pass 68/71 checks; integrity and feature-wiring (131) pass with the actual README total of 687 suites.

## Required ordering debt

The separate `W1-compleated-counter-order-red.mjs.txt` witness uses an actual loaded Doubling Season, a generic
printed-loyalty-three Compleated planeswalker, a public cast and two life paid for its Phyrexian symbol. Entry
currently finishes immediately with two loyalty counters and no pending decision. CR 616.1 requires the controller's
order when the replacements yield different outcomes: two or four. This defect predates the bounded change and
remains RED. No fixed order, automatic answer or gate waiver is accepted. The shared intrinsic calculation does not
claim to repair counter-replacement ordering; the entry/counter continuation seam still requires coordinated work.

Battle combat, defense damage, SBAs, protector repair, Siege defeat/free transformed casting and legacy protector
entry remain unfinished. Daretti owner-graveyard delayed identity and Sunset native untap/draw remain required.
Full-directory strict proof, browser/full acceptance, clean games, independent review and the remaining run gates
stay open. No final card or promotion is credited.
