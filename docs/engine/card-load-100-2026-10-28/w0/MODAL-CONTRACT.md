# ROB-209 engine modal/spree contract

The room provides an additive, private cast proposal over live native offers. Existing clients can continue sending
their existing direct action answers. No production UI change is included; the shared issue remains In Progress.

## Entry and stage fields

A priority cast option with `castStages.schema: "CrankCastEntry@1"` advertises its physical `sourceId` and stable
`actionId`. Answer that option with the ordinary answer envelope and `staged: true` to begin. The selected old offer
identifies the physical card and action route, not its modes or targets. Routes distinguish face/adventure, effective
ability, flashback, alternative cost, escape, source permission/type and free-cast method. Mode-dependent spree/tiered/
escalate costs stay inside the selected route. A route cannot silently change from Kess's permission to flashback.

Modal activations advertise `actionStages.schema: "CrankActionEntry@1"`, `kind: "activate"`, `sourceId`, `abilityId` and
`actionId`. The same ordinary `staged: true` answer begins their private proposal. Their stage metadata uses
`actionStage.schema: "CrankActionStage@1"` and includes `kind`/`abilityId`; it never presents the activation as a creature
cast. Cast clients retain `castStages`/`castStage` and their existing schemas. Effective abilities, including an actual
Conspicuous Snoop reading Goblin Cratermaker, are read through native offer helpers rather than raw source abilities.

The private choice uses `stage: "modes"`, then `stage: "targets"` for each target group of each selected mode, then
`stage: "payment"`. Existing `mode: "one"`/`"many"` still describes answer cardinality. Do not use it as a stage name.
Every stage carries `castStage.schema: "CrankCastStage@1"`, `transactionId`, `actionId`, `sourceId`, `stage`,
`version` and `canBack`. The transaction identity uses the accepted input tape position, so partial replay reproduces it.

The modes choice exposes printed `modeChoices` with stable mode IDs, labels, additional costs and repeat limits;
`modeCardinality` describes the bounds. Its answer options are the currently legal complete mode sets, carrying
`modeIndices` and `modeIds`. A UI can map checkboxes/counts to those options. A legal zero-mode set remains explicit.
Affordability and the native rule implementation determine which complete sets are offered.

Printed mode IDs include the physical action route and printed index. Repeated selections have distinct
`modeInstanceId` values; each target group has a stable `targetGroupId`, printed/local/global indices and cardinality.
Modes with no targets add no target stage. `selectedModes` and `selectedTargets` support review and reload.

Target options include public target facts and card/player identities. Counted targets expose native
`targetConstraints`, including min/max, caps or budgets for each compatible native variant. The server checks the
whole chosen group against real native constraints; the union of visible options does not make every subset legal.
Separate mode groups may choose the same object where native rules allow it.

## State, payment and cancellation

Selecting modes/targets only changes the private saved proposal. It does not pay mana, move cards, advance priority,
consume RNG, or add engine journal/history facts. Each answer revalidates live native offers. A changed choice signature
rejects old indices; reopening regenerates the question identity. A departed source/actor or invalid route withdraws
the uncommitted proposal. Saved selections and transaction identities survive reload and deterministic replay. New
private routes carry `CrankActionRoute@1`; old unversioned private routes withdraw conservatively, without restoring or
changing engine state. Existing native pending payment questions retain their native compatibility boundary.

Back moves among the proposal's mode and target stages, discarding dependent selections. Cancel abandons the proposal
while preserving the complete engine state, RNG and journal/history. The existing server cancellation contract remains
authoritative after native payment begins. Back cannot cross that boundary: a Back flag with otherwise valid funding
indices is refused atomically. Cancel at an ordinary priority question also refuses atomically rather than casting the
option whose index accompanied it. Committed mandatory choices retain Rob's approved pending-choice guidance.

Payment review exposes the compatible native actions and their printed/additional/X/tax costs, payment/automatic-source
facts and native action details. Cast review also exposes declared `additionalCosts`; actual nonmana escalate tappers
appear as `nonmana` facts copied from the native counted offer. Activation review exposes its effective `activation`
cost atoms, including actual mana/self-sacrifice, and does not substitute the creature's casting cost. The final Pay
answer enters the actual native action/funding path once; later physical
source choices remain real engine decisions. Those choices retain the transaction metadata with `canBack: false`.
Activated native funding retains `actionStage` with `canBack: false`. Native funding questions determine the authoritative
payment; retries never pay or cast/activate twice. Pay's usual Hold modifier
is handled by the existing native room action path.

## Evidence and remaining boundary

`tests/engine-cast-stages.mjs` passes 52 checks. Actual Getaway Glamer chooses both spree modes, pays the real extra
costs, and casts once with independent/shared targets. Actual Lorehold Command maps a targetless mode and a two-group
mode correctly. Additional fixtures cover repeated modes, zero modes/targets, different-controller constraints,
affordability, stale live offers and Back/Cancel state preservation.

`tests/room-cast-stages.mjs` passes 46 checks. Actual room play reaches the physical funding choice, pays four Plains
once, and checks private view isolation, full engine/RNG/journal preservation, reload, partial/funding/final replay,
retry/stale input, departure, Back and Cancel refusals. Mutation evidence is recorded in PLAYTEST-PROGRESS.md.

`tests/engine-action-stages.mjs` adds actual activation/effective-ability, distinct permission and nonmana-cost evidence.
`tests/room-action-stages.mjs` covers actual Cankerbloom, funded-pool choices, source sacrifice, privacy, reload/replay,
Back/Cancel, stale/retry/departure and conservative old private-route withdrawal. Counts are in PLAYTEST-PROGRESS.md.

This contract covers priority modal/spree spell casts and ordinary modal activations. The separate
[COMMITTED-MODAL-CONTRACT.md](COMMITTED-MODAL-CONTRACT.md) now covers bounded refinement of still-live native
trigger/effect-cast questions with authoritative generation refresh and raw replay receipts. Counted native target
steps, unavailable additional-cost routes and other modal cases remain explicit boundaries;
[MODAL-ROUTE-AUDIT.md](MODAL-ROUTE-AUDIT.md) records the actual findings. The UI owner must consume and verify these stages before
ROB-209 can be Done. Root owns integration/main acceptance and the unchanged card-load gates. No cards are added
or promoted by this checkpoint.
