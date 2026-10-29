# W1 bounded Battle entry checkpoint

Base: exact assembled integration `50f47e22c0a086de529bad09d9d14565df19a901`, merged without a rebase.
The preserved `W1-battle-protector-red.mjs.txt` was restored as `tests/engine-battles.mjs` and failed on that base:
the Siege resolved without the required pre-entry protector question. No Battle final definition is loaded or promoted.

## Implemented scope

- Printed defense is validated and preserved through compilation, both faces, native state, zone changes, hidden
  physical-card identity, copy values and departed-source snapshots. A Battle definition cannot omit it.
  Both Oracle identity helpers retain the existing face's integer-string defense as a number, including zero;
  a transforming card uses its actual front face rather than the outer Oracle record.
- `state.objects[id].defense` is printed/copiable defense. `characteristicsOf(...).defense` is current defense in play,
  using defense counters; `printedDefense` distinguishes the printed/copied number. Losing the Battle type removes
  the current characteristic. A protector is a designation, excluded from copy values and reset by zone changes.
- The existing saved `entering` operation determines the final prospective types after entry-copy/replacement
  choices, then asks a Siege's controller to choose an eligible live opponent. Its actual spell/card stays in its old
  zone until the explicit answer. A typeless Battle's protector is its controller by rule, without inventing a choice.
  Saved player IDs are rechecked after departure; an invalidated choice receives a new question ID.
- Native entry adds the printed defense counters through the existing counter modifier path. Prospective ability
  loss suppresses that intrinsic ability. An entry that becomes a non-Battle, or is diverted to another zone, does not
  gain Battle counters or ask for a protector.
- The visible battlefield Battle projection adds `printedDefense`, current `defense` and `protector`. Private cards,
  face-down identities and non-Battles do not gain these fields. No UI/room/decision or funding code is changed.

## Proof

`node tests/engine-battles.mjs` passes 95 checks, preserves all seven original assertions and adds native casting/entry/copy/zone
operations, actual concessions, JSON reload, invalid full-state refusals, three/four-player choices and controller/
owner/protector distinctions. Actual Doubling Season doubles defense counters only for its controller. Copying a
seven-defense Siege with one remaining counter creates seven fresh counters and a separately selected protector;
copying an existing Battle preserves its own protector and current counters. Entry as a creature copy, layer type
loss, ability loss and an actual Mox Diamond-style replacement's declined discard all keep their distinct results.

The first mutation run caught 31 of 33. Two missing-field probes were masked by DFC face restoration. Single-faced
Battle and hidden-identity witnesses were added without changing any original assertion; both probes then failed
their actual native outcome assertions. The two Oracle identity helpers add two more probes. Final full run:
all 35 caught, `missed: []`; receipt in
`evidence/w1-battle-entry-mutations.txt`. Five reported inherited anchors were moved by the defense field additions;
their three distinct original loyalty-copy mutations are reanchored without removing defense and caught against
the full original suite union, including the complete `engine-cards` baseline. Receipt in
`evidence/w1-battle-entry-inherited-mutations.txt`. No original suite or assertion was removed.
The targeted full Oracle-identity drift assertion also matches all 6,430 existing definitions after the helper change,
without generating files or rerunning the unchanged held-out calibration.

The face-down casting reader's empty-pool/no-offer premise is independently red on the assembled base and assigned
to W5 for actual funding/outcome proofs. The transforming-token reader also has an independently confirmed obsolete
token-refusal premise. Its correction passes 46 checks: double-faced token creation and its actual transforms are
distinct from an ordinary single-faced permanent becoming a back-face copy. Exact new IDs preserve the earlier token;
the separate mana-value-zero/refusal controls remain on the applicable single-faced case (CR 707.8a, 202.3b, 712.9).
All three semantic regression probes are caught, `missed: []`; receipt in `evidence/w1-transform-reader-mutations.txt`.
W5's exact reader dependency `1000a25d` is included through root's assembled `310595d2`, merged without rebasing into
this lane at `246fb797`. After synchronization: Battle 95, transform 46, face-down play 68, Adventure 71,
payment 410 and room pooled-payment 14 pass independently. The automatic README merge retained an old suite total;
it is corrected to the actual 686. Data integrity/feature wiring are rechecked after that metadata correction.
W5's original browser union has a separate Table-stage visibility failure, remains explicitly red and receives no
credit from these native reader repairs. Full browser/CI and all other run gates stay open.

## Still required

This is not Battle, W1, G-3 or wave-0 completion. Battle combat target identity, defense damage, Battle SBAs,
protector repair, Siege defeat/free transformed casting and remaining synchronous legacy entry callers are unfinished.
The no-eligible-opponent transient requires the Battle SBA work; this slice makes no invented protector choice.
The adjacent existing planeswalker intrinsic-entry-counter ability-loss case must be reproduced/fixed next in its
entry terms. Daretti's exact owner-graveyard delayed identity and Sunset's native untap/draw remain required audits.
Root owns whole-directory evidence, independent review, required clean games, generated consolidation and gates.
No new card, promotion, provider call, clean-game or full-gate credit is claimed.
