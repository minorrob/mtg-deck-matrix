# W1 native entry counter ordering

Lane: `codex/engine-load100-w0-w1-faces`, continuing published intrinsic checkpoint
`85a3a89fec6311d27d827de0960c5e0830bafdce` / draft PR #944. No final card, promotion, gate or clean-game credit.

## Native RED and change

The archived actual-cast witness in `W1-compleated-counter-order-red.mjs.txt` reproduces immediate entry with two
loyalty counters under an actual loaded Doubling Season. It must wait for the controller's explicit replacement
order: a generic printed-loyalty-three Compleated planeswalker paid with two life can enter with two or four.
The new active reader initially failed its required pending-decision assertion on the published intrinsic base.
Local rules checked: CR 306.5b, 614.5, 614.12, 616.1, 702.150a. The official
[Kamigawa release notes](https://magic.wizards.com/en/news/feature/kamigawa-neon-dynasty-release-notes-2022-02-09)
confirm that Compleated interacts with other replacements; the distinct totals follow from CR 616.1.

Native entry now delegates its counters to a saved `entry-counters` rule operation. Compleated remains a distinct
subtraction candidate beside the existing counter modifiers. The affected controller chooses whenever remaining
orders give different outcomes. Each applied prefix updates the saved count and applied keys once; a later source
departure changes only the unanswered candidates. No committed replacement is replayed or undone.

The internal operation issues a counter-result receipt bound to its source entry, controller and returned counters.
Completion validates and consumes that actual child result once, including a completed empty result. It cannot trust
a card-supplied skip flag, use another entry's result, or reapply counter modifiers to the finished count. A failed
Aura entry applies no counters and emits no arrival. The old public synchronous APIs retain their original shapes;
applied-prefix tracking is opt-in for the native operation.

Native movement includes the instruction's independent counters before ordering. Native token batches finish all
sibling entry choices and costs before beginning counter plans, and finish every counter plan before creating any
simultaneous entrant. Printed loyalty is proven through actual copies of a compiled planeswalker, alongside the
token instruction's additional counters. A raw `createToken` specification does not support a printed loyalty field;
no schema or token-characteristic production expansion was made for that unsupported fixture.

## Native controls

`node tests/engine-entry-counter-order.mjs` passes 87 checks. The active reader preserves its original explicit-order
assertions and checks:

- Actual loaded Doubling Season, both legal outcomes, exact spell/arrival identities, JSON reload, invalid selection,
  mandatory Cancel, expired transport choice identity, counters/entry/spell completion once, and actual ETB resolution.
- A chosen plus-two prefix survives its source owner's actual concession; an unchosen departed doubler is absent.
  The caster's own departure cannot revive the abandoned spell or place its counters.
- Actual zero prevention produces neither a positive placement nor a counter event, and the native SBA handles the
  resulting zero-loyalty permanent. Independent counters survive intrinsic ability loss and are doubled once.
- Native no-host Aura movement never enters or receives its planned counters. Bare skip flags have no effect.
- Simultaneous copied planeswalkers independently choose ten and twelve counters from a combined intrinsic/extra
  total. No token or suffix exists after the first answer; a saved child cannot be changed to 999 counters.
- A later sibling's actual devour cost or source-owner concession removes the modifier before all sibling counter
  plans begin. The independent devour counter, token counts, journals and following instruction remain exact.
- Wrong-entry, wrong-controller, forged, changed and reused receipts are refused; zero remains distinct from absent.
- A Siege's protector leaves during counter ordering. The completed twelve-counter result stays saved while a fresh
  eligible protector is selected after JSON reload; the earlier protector patch cannot overwrite that new answer.

The original `engine-counters-replaced` reader caught an initial public-result shape change; prefix reporting became
explicitly opt-in, preserving all 45 original checks. The original `engine-tokens-counters-4a` reader then reproduced
a native Self Hydra entry with two counters instead of its original three. Candidate enumeration now includes the
prospective entrant as a holder for its own self-only replacement while leaving it outside the actual/countable
battlefield list. The ordinary effect over a set of permanents remains excluded. All 208 original checks pass.
The actual original RED is retained in `evidence/w1-counter-original-self-red.txt`.

The selected-prefix controls separately keep the modifier present across reload and concede its owner. This prevents
source departure from masking a missing applied-key guard. All thirty main semantic probes are caught, including
the seven moved original probes, with every original suite retained. The complete unbroken baseline includes
`engine-cards`, the original h4/pre-entry readers and `generators`. Two further probes catch a stale protector patch
after a counter child and an accidental public counter-result shape change. Both runs report `missed: []`.

The original generator union exposed stale inventory metadata and a missing checkable-tool registration. Root
approved refreshing only `docs/data-inventory.md`: five reader rows change, while all 60 artifacts and 80.9 MB remain
unchanged. `tests/generators.mjs` additively runs `tools/card-load-scope.mjs --check` for the frozen 95% sources; every
old check and assertion remains. Its existing public Scryfall lookup ran read-only with authorized network access;
no check was dropped, stubbed or replaced with cached answers, and no card/data file was generated.
Final touched readers pass: face-down play 68, Adventure 71, transform 46, MDFC 22, enter-transformed 7, integrity and
feature-wiring 131. README records the actual 688 suites. Final static audit: 33 inherited UI targets, zero engine
targets. No full-run or browser acceptance is inferred from these results.

## Still required

The explicitly synchronous legacy paths still cannot suspend for entry counter order: direct `moveOne`, legacy token
creation in `permanents.mjs`, and post-entry `ownEntering`/devour/riot/read-ahead/chosen-counter handling in
`entering.mjs`. Their old placement paths are not credited as askable by this slice. The legacy Compleated reduction
also remains separate conversion debt. Native stack impending time counters are still placed in their existing
separate path; full entry/type/keyword/copy and ordering controls are required before including those in the shared
native plan. No implicit legacy or impending order is accepted as gate evidence.

Finite shared modifiers or additional simultaneous-batch ordering cases require their own native witnesses if
encountered; this slice creates no hidden per-token default. Battle combat/damage/SBAs/protector repair/Siege defeat,
legacy protector entry, Daretti and Sunset emblem audits, browser/full acceptance, independent review, clean games
and all run gates stay open. Root owns consolidation and gate acceptance.
