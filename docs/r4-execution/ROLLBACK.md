# Pre-merge rollback checkpoint

Created at Rob's explicit request. No rollback was executed and no additional 3D behavior changes were
made in response to that concern. Hand overlap is permitted under EX-28; zoom is not constrained by it.

## Source snapshot

- Main before the r4 merge: b13607b25337c42f04806f35112251e8e07a74bf, including accepted PR #891.
- Remote annotated tag: rollback/pre-r4-2026-10-26-b13607b2.
- Tag object: 4355113f112cb675b1be0302cca52c74a07212b4.
- The tag was pushed and git ls-remote confirmed its peeled commit equals the exact main SHA above.
- The exact-source secret/clean-merge scan passed before the tag push; no full suite was duplicated.
- [Browse the checkpoint](https://github.com/minorrob/mtg-deck-matrix/tree/rollback%2Fpre-r4-2026-10-26-b13607b2).

Recheck main immediately before merging PR #890. If another main commit arrives, reconcile it and create
another immutable checkpoint for the actual pre-merge main; never move/overwrite this tag or force main.

## Staging deployment reference

Read directly from the Cloudflare deployments API before the r4 staging push:

- Worker: crankmagic-staging.
- Cloudflare account: 02e7ae6d703281008f546c63378c6ddb.
- Deployment: 8f81d13c-389f-44e9-ab89-f63945cd4f82.
- Version: 60f19eaf-2eb6-46c1-b9d7-cb77d49b82d6 at100%.
- Deployment creation: 2026-10-26T23:33:38.5318Z (machine timestamp).
- Coordination's authenticated live checker confirmed both staging entries serve main b13607b2 with
  cloud-staging profile. Its reported release/cloud-staging commit is d39e6796b51b8901d09fd984be905f2b459f348b.

The release executor must re-read the deployed version immediately before replacing staging and record
any newer baseline. Source and deployment references are recorded separately; a rollback does not imply
rewinding or deleting library/game/database data. Production has not been replaced by this r4 work.
