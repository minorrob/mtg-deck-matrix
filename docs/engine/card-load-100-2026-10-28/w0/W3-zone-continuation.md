# W3 bounded zone and destruction consumer

This checkpoint routes actual `destroy` and `destroyAll` resolution instructions through saved operation frames. A nested
umbra destruction, competing zone replacements, and the command-zone option wait before the actual move. The stack entry
and following instruction remain pending. Reloading plain JSON resumes the current stage without replaying its prefix.
There are no card-name branches or serialized closures.

The initial nested-armor witness returned done instead of asking and advanced the following life-gain instruction before
the replacement decision. The new suite requires a public question, preserved stack entry and unchanged life before the
answer, then actual selected replacement effects, exact final zones and one life gain afterward.

`zone-operation.mjs` owns `move-one`. Its child `entering` belongs to W2. W2 returns `{entering, objectPatch}` with
`objectPatch: {set, remove}`. The move applies removals and copied characteristics to the NEW object, immediately after
`moveObject` and before entry counters/events. The seam test uses Hardened Scales to require an Artifact copied into a
Creature to receive three counters instead of two, and requires absent spell/loyalty fields to disappear. It starts at the
serialized after-child stage; this is not evidence of a completed W2 entering choice or caller.

`destruction-operation.mjs` owns `destroy-effect` and `destroy-one`. Simultaneous eligibility is determined before removing
a lord that grants indestructible; affected players make independent choices in APNAP order. Each nested Aura can ask its
own shield/regeneration/umbra choice. The existing targeted-destroy death-count and destroyAll move-count contracts are
preserved separately. This checkpoint does not resolve general RememberObjects/RememberChanged debt.

`resolution.mjs` consumes the destruction instruction once and persists its actual outer queue. `turn.mjs` routes public
answers back to that queue or to the declared `after-action`/`after-resolving` owner. Finalizers collect triggers from the
whole completed batch but return only the unreported event suffix. The two nonresolution owner tests are contract tests
for W2's future actual land/token/spell callers. W2 owns those callers and their pending guards.

Public concessions remove the departed player's objects immediately and re-evaluate the saved live stage. A departing
source cannot supply an obsolete replacement. A departing resolving controller or game end cancels the remaining work.
Already-happened prefix triggers for surviving players are collected once. Other state-based actions still wait for the
resolution to finish. This uses current live state; there is no saved start-state replay.

Rules consulted locally: CR 101.4, 603.2, 616.1f, 701.8, 702.12b, 702.89a, 704.4, 800.4a-b and 903.9b. In particular,
903.9b can apply again when a later replacement redirects the same event back to hand or library. No CR text is included.

Validation: 71 focused checks and all 60 mutations caught, with `missed: []`. Commands are `node tests/engine-zone-operations.mjs` and
`python -u game/tools/batch/breaks.py game/tools/batch/breaks-zone-operations.py`. The suite includes actual public JSON
reload/concession paths, selected outcomes, exact payments, event counts and resulting trigger effects. Relevant existing
readers are recorded in lane-W3.json after the source is frozen. No full card sweep or global gate is claimed.

Remaining callers include ordinary moveZone/sacrifice/discard effects, costs, state-based destruction and routes outside
effect resolution. W2's entering registration and actual spell/land/token consumers are still separate work. Commander
hand/library and Liesa debt are proven only for the routed move-one destruction path here; neither entire debt is closed.

## Next shared entry seams, local proof

The next extension supplies `sacrifice-one {id,player?}` and `discard-one {id,player?}` children returning
`{moved,sacrificed}` or `{moved,discarded}`. They wait for the actual move, annotate its exact zone event before reporting,
and record payment counts once even when replaced by exile. Sacrifice obeys control and sacrifice prohibition while
ignoring indestructible, shield and regeneration. A missing, departed or wrong-zone payment returns false.

An entering result's `gainsKeywords` creates a persistent, noncopiable layer-6 grant to the new object. Its `to` redirects
the unchanged source through a new move-one child before allocating any battlefield object. These are shared seams for
W2's Mox Diamond/devour/riot consumers; their actual card entry paths are not proved by W3's standalone wrapper suite.
The 33-check `engine-zone-action-operations` suite proves the public JSON reload/concession paths, actual payment
results/counts, and selected replacement/follow-up outcomes. All 24 mutations in `breaks-zone-action-operations.py` were
caught with `missed: []`. The transformed-face input seam and W2's actual caller integration remain pending.

The follow-on shared bridge now uses W2's root-reviewed local entering/land/token dependencies. Transformed entry passes
only copiable back-face values and explicit removals to the real entering child; its actual pre-entry question and final
chosen type are proved across JSON reload. A completed permanent script that opens a new entry operation transfers its
whole trigger prefix but advances the new journal cursor. Its surviving trigger resolves once after normal entry or
controller concession. An answered effect-play land starts `outcome.operation` only after the old question is withdrawn
and its queue advances. An actual any-number land effect waits through a shock-land choice, then asks its next play,
then runs the original following effects with one seeded die roll and one prefix trigger. Normal token effects dispatch
through W2's token-entry factory, so all same-instruction token choices precede allocation and following effects.

An actual literal-target `moveZone {sacrifice:true}` resolution consumer now uses the same saved frames. A borrowed
permanent owned by the surviving spell controller stays on the battlefield when its sacrificer concedes during the
replacement question: the move child rechecks the saved payer's live control/zone/prohibition before moving. The surviving
outer instruction completes once without a sacrifice event or count. Multi-target selected outcomes retain remembered
new IDs/controllers and the existing graveyard-only movedWas contract. Other moveZone modifiers retain their existing
implementation; no broad moveZone closure is claimed.

The current extension has 64 checks in `engine-zone-action-operations` and 48 caught mutations, `missed: []`. The merged
W2 suite passes 222 checks and draw-instruction suite passes 33. W2 owns its entry/card/token implementation and
its own mutation closure; these shared bridge results do not certify all W2 code.

Explicit remaining caller seams: replacement `moveOne.runFollowUps` still runs token effects synchronously; converting it
also requires marking sacrifice/discard identity and counts before a token-child prefix can be journaled. Search/fetch
`asking.chooseCard.apply` still uses synchronous moveOne and needs a saved post-entry shuffle stage with the original RNG.
Costs, state-based destruction and complex moveZone routes remain open. No new final cards, promotions or global gate.
