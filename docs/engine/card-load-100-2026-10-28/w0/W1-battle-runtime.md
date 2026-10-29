# W1 Battle runtime continuation (unfinished)

Base: published `1553f7b10e641e3aa8751b14100c99002213ea05`, draft PR #944. This continuation is not published or
accepted. No Battle final definition, card promotion or run gate is credited.

Current local nominal damage/SBA reader passes 32 checks after reproducing nine RED families. Native damage uses the
existing W4 proposal/replacement/prevention continuation; no direct damage bypass or changed W4 order is introduced.
Battle, Battle/creature, Battle/planeswalker and all three types apply their proper separate results. Excess uses
the greatest applicable current threshold. Zero non-Sieges go to their owner's graveyard; the Siege exception uses
actual pending/stacked triggered-source identity. Saved mandatory protector repair rechecks live opponents after
JSON and concessions, while a missing non-Siege protector is forced by rule. Current live protection can survive
copying to a non-Siege (CR 310.9g); new-choice eligibility is distinct from current protector validity.

Additional native REDs prevent publication of that nominal implementation:

- The old synchronous SBA grave mover asks a hand-versus-exile replacement question but has already moved the
  original Battle to a new graveyard object. The old ID must remain pending until the explicit answer.
- Existing sequential `move-one` children cannot represent an atomic mixed cohort. After actual damage to two
  Battle-creatures plus an ordinary Bear/planeswalker, the second Battle's zone event has toughness 2 instead of its
  pre-move 4, and misses a dying Lord's exile replacement. There is no simultaneous/death-batching claim.

Root approved native prepare-only zone children and internal result receipts bound to operation, cohort, object and
source zone. Plan every member before moving any; freeze surviving LKI together after outside concessions and before
the first commit; consume each completed move once. Preserve already-applied prefixes and recheck only unanswered
live modifiers. The deferred departure queue must run control cleanup, exiled-until returns and follow-ups only
after all base moves; no callback may change a sibling before its base move. No client/card skip flag may authorize
commit. Native wrong/early/reused receipt, JSON/concession, actual mixed-cohort and callback controls remain required.

W5 owns payment eligibility/discard-sacrifice wrappers and Siege effect-paid/free transformed casting. P0 room and
controller stages remain untouched. Combat/filter/projection and intrinsic Siege defeat production are reserved
but require the next separate checkpoint; the original five-gap runtime witness remains preserved. No new generic
dispatcher/signature outside the approved internal prepared-move/cohort and state-based resume is authorized.

Local CR references read narrowly: 120.3h, 120.10, 310.5–.12, 506.2/.4, 508.1b/.5, 704.5v–y. No rulebook prose is
copied into this package. Root owns RUN/ACTIVE/Linear, integration and all acceptance gates.
