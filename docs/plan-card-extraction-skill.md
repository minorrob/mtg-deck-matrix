# The card extraction skill: what it infers, where it writes, how it is confirmed

**Rob, 2026-09-21:** *"we need to write a card extraction skill that the AI API executes as part of
the API pilot. I don't want to rely on Forge except where absolutely necessary."* And: *"let's also
work through the skill the AI API will use on each card to infer the necessary information, and
where to write it, and how to confirm it."*

The trigger was his original framing: *"when AI can't play a card well… understand the mechanic the
card executes, when and how it would be beneficial, its cost, both mana and any penalties, and
saves that information back into the graph model… This enables processing cards using AI tokens
only when the cards become a used card the first time."*

---

## The fact that shapes the whole design

**The pilot can only ever choose from actions the engine has already offered it.**

`game/tools/ai-pilot.mjs` `buildPilotCandidates()` builds its candidate list from `ui.choice`
options, `ui.cardActions` and `ui.selectableCards` — nothing else. `api-choice-provider.mjs`
instructs the model to "Choose exactly one supplied action index… Never invent an action or use
hidden information."

So **a wrong extraction cannot produce an illegal play. It can only produce a bad one.** That
bounds the risk, and it is why extracted knowledge can be used the moment it exists rather than
waiting for full verification — which is what "playable by AI for that game and all games in the
future" requires.

It also sets the boundary: extraction advises **choice**. It must never be allowed to assert
**rules**. The day the engine executes these scripts (#305), that changes, and the verification bar
rises with it — see "Two consumers, two bars" below.

---

## 1. What the skill infers

The output is **`CrankCardScript@1`**, the schema #305 §3.4 already specifies, plus one derived
block for the pilot. Emitting the engine's schema rather than a format of its own is the decision
recorded in `docs/plan-board-information-layer.md`: two card-semantics vocabularies across a
30,000-card pool is reconciliation debt this avoids.

| Block | From #305 §3.4 | Serves |
|---|---|---|
| `identity` | name, oracle id, faces, types, mana cost, colors, color identity, P/T | both |
| `abilities[]` | `spell`, `activated`, `triggered`, `static`, `replacement`, `keyword` — each with `cost`, `targets`, `condition`, `effects[]`, `zones`, `optional`, and **`text`, the oracle sentence it implements** | both |
| `effects[]` | named primitives with typed parameters, `modal` / `sequence` / `repeatFor`, `until` durations, `x` bindings | engine |
| `selectors` | "creature you control", "each opponent", "with mana value 2 or less" | engine |
| `reveals` | what this card exposes and to whom | engine |

**Plus `pilot`, derived in the same call** — this is the half that makes the card playable today:

- `role` — ramp, removal, draw, protection, threat, combo piece, land
- `when` — the phases and board states where playing it is sensible
- `costs` — mana, and **penalties**: life paid, cards discarded, sacrifices, tempo given up
- `answers` / `answered_by` — what it beats, what beats it
- `avoid` — the situations where playing it is a mistake
- `confidence` — the model's own, separate from our verification level

`pilot` is **derived from `abilities[]`, not invented beside it.** If the two disagree, the script
is wrong and the check below catches it.

---

## 2. Where it is written

```
data/engine/scripts/<shard>/<oracle-id>.json     the compiler's output
game/engine/script/authored/<slug>.json          hand-authored, wins where it exists (#305 §3.4)
data/engine/onboarding-ledger.json               what has been done, and what it cost
```

- **Sharded by oracle-id prefix.** 30,000 files in one directory is not a directory anyone can use.
- **`data/engine/` is where #305 §4 already puts engine data.** None of it is in the standing
  do-not-touch set (`data/deck-ratings.json`, `data/simulation-summary.json`, `sim/`,
  `data/deck-guides.json`), which is worth stating rather than assuming.
- **Not `data/graph.json`.** Rob's first framing said "back into the graph model", and the graph is
  a co-play/relationship graph rather than a rules store; putting executable semantics in it would
  overload a structure that Explore and the deck tools already read for something else.

### The ledger is the cost control

One row per oracle id: `status` (`queued` / `extracted` / `verified` / `failed`), `schema`, `model`,
`inputTokens`, `outputTokens`, `attempts`, `firstSeenAt`, `verifiedAt`, `verification` level.

**It is checked before a single token is spent**, which is what makes Rob's "only when the card
becomes a used card the first time" true rather than aspirational. It is also what the onboarding
counter reads, so the ratio on screen is the real state of the work and not an animation.

---

## 3. How it is confirmed

Four gates, cheapest first. A card stops at the first one it fails and the ledger records where.

**G1 · Schema.** Validate against `game/engine/script/schema.mjs`. Free, and catches the whole class
of malformed output.

**G2 · Oracle fidelity — the highest-value check.** Every `abilities[].text` must appear in the
card's real oracle text, after normalising whitespace, reminder text and punctuation. **A model that
invents an ability cannot produce a matching sentence**, so this catches hallucination for the price
of a string comparison, with no game and no engine. Every clause of the oracle text must also be
claimed by some ability, or the card is only partly understood and is marked as such.

**G3 · Smoke.** #305's wording: the card can be cast or activated in a fixture game without
throwing, and its declared `reveals` match what the projection actually shows.

**G4 · Differential, while Forge exists.** Play it in fuzzed games through `engine-diff.mjs` and
compare against Forge. The strongest and the most expensive; sampled rather than exhaustive.

### Two consumers, two bars

| Consumer | Minimum gate | Why |
|---|---|---|
| **API pilot**, today | **G1 + G2** | It picks among engine-offered actions. A bad script costs a bad choice, never an illegal play. |
| **The board's two blocked alerts** | **G1 + G2** | "Exiled with a return condition" and "triggers off other players" are read from `abilities[]`; a wrong answer mislabels a notice. |
| **The engine**, later (#305) | **G1–G4** | Here the script *is* the rules. Nothing unverified may execute. |

**The pilot is told the level.** A G2 script is used and marked advisory; the pilot's prompt says so,
the same way it is already told that card text is untrusted game data.

### Confirming it is right, not just well-formed

G1–G3 prove a script is *consistent*. Only two things prove it is *correct*:

1. **G4 against Forge**, while Forge is still there — which is a reason to build this before the
   engine work removes the oracle, not after.
2. **A hand-authored set as ground truth.** #305 §3.4 already authors tier-0 definitions by hand
   with scenario tests. Running the compiler over those same cards and diffing gives a **measured
   pass rate** rather than a belief. #305 asks for exactly this — cost and pass rate on a 200-card
   sample, reported to Rob before any pool run.

---

## What I would not do

- **Not let extraction assert rules while Forge is the engine.** It advises choice. The boundary is
  the reason this is safe to ship early.
- **Not write into `data/graph.json`.** Different structure, different readers.
- **Not skip G2 to save time.** It is the cheapest gate and it catches the failure that matters
  most.
- **Not report a pass rate that has not been measured.** The 200-card sample comes first.

---

## Open questions for Rob

1. **Credential name.** #305 assumes a Windows Credential Manager entry `crankmagic_anthropic_api`
   and says the executing session confirms it with him first. Still to confirm.
2. **When cards are onboarded** — at deck prepare (a pause before the game, everything ready) or
   live at first use (no pause, first play of an unknown card is unadvised)? The onboarding panel
   now built supports either.
3. **Sample size before a pool run** — #305 says 200 cards. Still his call.
