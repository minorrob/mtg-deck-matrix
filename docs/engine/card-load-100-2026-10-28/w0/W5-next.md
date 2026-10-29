# W5 continuation

Branch: `codex/engine-load100-w0-w5-mana`; draft PR #928. No cards added or promoted.
Runtime checkpoints: `d9d00a00` (funding/basic choices/entry), `12a32a40` (delve X/search/source/riders).
Shared source: `2c89a5c3` merged as `d807b03a`; lane JSON records the final proof checkpoint.

1. Investigate the unfinished easy library seed 2801 at exact source `5a004e444d83e3fd8e63873f6b5ef9f6160430d3`.
   `evidence/w5-fuzz-easy-2801-timeout.json` holds the exact command, decks, timing, and CPU/memory samples.
   It consumed CPU for 628.39 seconds without a result. Exhaustive funding is a candidate cause, not a diagnosis.
   Profile a bounded reproduction; preserve every legal payment through a resumable question if enumeration is too costly.
   Do not restore arbitrary caps or count this game clean. G-5 and operational payment completeness remain open.
2. Implement effect-paid X and additional costs. `W5-effect-paid-costs-red.mjs.txt` is a native cast/resolution reproduction:
   an effect currently offers neither payable exiled X nor additional-discard spell, with two untapped Mountains available.
   Run it from the worktree root through stdin as its first comment describes. The recorded result has no options.
   `asking.mjs` play uses `unlessPlans` (rejects X); `actions.mjs` choicesNow excludes additional costs.
   Reuse full cast terms, reductions, increases, and additional-cost choices. Save every stage in rule operations.
   Use `move-one`/`discard-one`/`sacrifice-one` children for cost moves; no old already-paid shortcut for unpaid costs.
   Witness actual cost/cast/resolution, exact resources/IDs/events, JSON reload, and invalid answers leaving state unchanged.
3. Audit alternative/X funding with nonmana tap costs: mana sources and cost tappers must be disjoint.
   Also extend source-funded X admission beyond ordinary hand/command casting without hiding alternative-cost choices.
   Current grouping still takes the first objects with matching outputs. The 56/786 witnesses count source-kind
   multisets; audit identity-dependent source choices before claiming all legal source-ID subsets are available.
4. Coordinate with W1's queued Siege transformed-cast seam before editing choicesNow/play flags.
   W4 owns the mana-ability `then` damage-continuation region; avoid overlapping edits there.

Keep original mutation suite unions. Root owns generated artifacts, ACTIVE/RUN, scope dealing, and consolidated gates.
No whole-suite rerun here; no new final loads until wave 0 closes. Node 22 first on PATH; no provider/LLM API or seat.
