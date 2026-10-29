# ROB-209 engine modal/spree contract

The room provides an additive, private cast proposal over live native offers. Existing clients can continue sending
their existing direct action answers. No production UI change is included; the shared issue remains In Progress.

## Entry and stage fields

A priority cast option with `castStages.schema: "CrankCastEntry@1"` advertises its physical `sourceId` and stable
`actionId`. Answer that option with the ordinary answer envelope and `staged: true` to begin. The selected old offer
identifies the physical card and action route (including face/adventure), not its modes, targets or payment variant.

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
the uncommitted proposal. Saved selections and transaction identities survive reload and deterministic replay.

Back moves among the proposal's mode and target stages, discarding dependent selections. Cancel abandons the proposal
while preserving the complete engine state, RNG and journal/history. The existing server cancellation contract remains
authoritative after native payment begins. Back cannot cross that boundary: a Back flag with otherwise valid funding
indices is refused atomically. Cancel at an ordinary priority question also refuses atomically rather than casting the
option whose index accompanied it. Committed mandatory choices retain Rob's approved pending-choice guidance.

Payment review exposes the compatible native actions and their printed/additional/X/tax costs, payment/automatic-source
facts and native action details. The final Pay answer enters the actual native action/funding path once; later physical
source choices remain real engine decisions. Those choices retain the transaction metadata with `canBack: false`.
Native funding questions determine the authoritative payment; retries never pay or cast twice. Pay's usual Hold modifier
is handled by the existing native room action path.

## Evidence and remaining boundary

`tests/engine-cast-stages.mjs` passes 52 checks. Actual Getaway Glamer chooses both spree modes, pays the real extra
costs, and casts once with independent/shared targets. Actual Lorehold Command maps a targetless mode and a two-group
mode correctly. Additional fixtures cover repeated modes, zero modes/targets, different-controller constraints,
affordability, stale live offers and Back/Cancel state preservation.

`tests/room-cast-stages.mjs` passes 46 checks. Actual room play reaches the physical funding choice, pays four Plains
once, and checks private view isolation, full engine/RNG/journal preservation, reload, partial/funding/final replay,
retry/stale input, departure, Back and Cancel refusals. Mutation evidence is recorded in PLAYTEST-PROGRESS.md.

This contract covers priority modal/spree spell casts. Activated abilities, effect-paid casts and other modal routes
need a separate audit before claiming universal coverage. The UI owner must consume and verify these stages before
ROB-209 can be Done. Root owns integration/main acceptance and the unchanged card-load gates. No cards are added
or promoted by this checkpoint.
