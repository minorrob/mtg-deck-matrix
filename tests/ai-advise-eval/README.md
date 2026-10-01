# The deck advisor's eval (AI-4)

This is the evidence for which model advises (`AI_MODEL_advise`), per `docs/plan-to-done-2026-09-30.md`, AI-4: *"an
eval before a model is trusted with a job"*. The agent is run on Rob's seven decks and scored against his rubric.

| File | What it is |
| --- | --- |
| `rubric.json` | Per deck, the **sound** swaps and the **refused** ones. Sound pairs are Rob's own intent, from his workbook through the sync: each substitute in a box goes out, and the card whose seat it holds comes in (122 on 2026-09-30). Refused pairs are his to add: *"the rubric is an afternoon of his, before AI-4 is judged."* |
| `make-rubric.mjs` | Rewrites `rubric.json` from `data/live-state.json` and keeps every refusal already written. `tests/advise-brief.mjs` fails when the two differ. |
| `run.mjs` | The run. **It spends,** so it needs `--yes` and `ANTHROPIC_API_KEY`, and it is never part of `runtests.sh`. It writes `results/<stamp>.json`, which is not committed. |

How it scores: the brief is the box reading (`advise-brief.js`): what is physically in each box, the substitutes
holding their seats, and the candidates the code finds. It does not say which candidate a seat is for, so choosing
the intended upgrade is the model's judgment.

Each proposed swap is checked for grounding, then counted as one of:
- **sound:** the rubric's pair;
- **near:** a rubric card coming in, for some other card out;
- **refused:** a pair Rob would not make;
- **ungrounded:** it names a card the brief does not have. It is not shown.

The run also records tokens and cost at list prices.

**Rob adds refused swaps** under each deck's `refuse`, as `{"out": "...", "in": "..."}`, from his own judgment. He can also
add harder cases, such as a deck asked for a goal (*"make it faster"*) with the swaps he would expect.
