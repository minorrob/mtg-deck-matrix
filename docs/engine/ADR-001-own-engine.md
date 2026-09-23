# ADR-001 — CrankMagic builds its own rules engine

- **Status:** accepted
- **Date:** 2026-09-22
- **Decided by:** Rob Minor
- **Supersedes:** nothing. **Superseded by:** nothing.
- **Plan:** `docs/engine/PLAN.md`. **Comparison that preceded it:** `docs/engine/PIVOT-OR-PERSIST.md`.

---

## Context

CrankMagic plays Commander through Forge, reached by a GPL adapter under `game/engine-adapter/`.
That has carried the product to a playable state and it costs three things that do not go away by
themselves:

1. **A game is a subprocess on one machine.** A JVM, a JDK on the PATH, an adapter recompiled at
   every launch, and a four-minute boot. A whole class of failure exists only because of it — a
   UAT on 2026-09-22 found a failed launch stranding a table permanently and in silence.
2. **Everything outward-facing is a workaround for that.** The local host, the guest gateway, the
   throwaway tunnel and the entire web-to-local track exist because the game runs on Rob's machine
   and the workshop does not.
3. **The adapter is GPL**, and it is the one part of CrankMagic that is not Rob's.

The measured scope of replacing it is smaller than "implement Magic" suggests.
`game/docs/engine-inventory.json` counted it: Rob's seven decks use **477 distinct
cards needing 64 distinct effect APIs**, and **the top 30 of those APIs cover 90% of the 477**. His
whole library is 2,367 cards needing 112 APIs, the top 50 covering 92%.

## Decision

**Build a deterministic, plain-JavaScript Commander rules engine under `game/engine/`**, behind the
bridge, journal and pod contracts that already exist, and remove Forge from the product at go-live.

Rob authorized phases 0 and 1 on 2026-09-22, ahead of the plan's own start condition (decision 3,
"Track V fully live first"), having read the cost comparison. That override is recorded here
because the plan text still carries the original condition.

## The clean-room rule

This is the load-bearing constraint of the whole effort and it is not negotiable.

**What may come in**

- The **Comprehensive Rules**, cited by section number in each rules module's header.
- **Scryfall oracle text**, for card definitions, carried alongside each definition so it can be
  re-checked when the text changes.
- The **Anthropic API**, for compiled card definitions (see provenance below).
- Rob's own writing, and the executing session's, under `LICENSE` §5.

**What may never come in**

- **No Forge script, source, data or asset**, in any form: not copied, not translated, not
  paraphrased, not transcribed from memory of having read it.
- Forge is a **behavioral test oracle only**. It is run to compare outcomes — same pod, same seed,
  decisions replayed, state compared — and from **phase 8 it runs from outside the repository**, at
  `C:\Users\robmi\CrankMagic\forge-oracle\`.
- A divergence from Forge is evidence that one of the two is wrong. It is adjudicated **against the
  Comprehensive Rules**, recorded in `docs/engine/divergences.md`, and Forge is not presumed
  correct. It is not a source to copy from when the engine disagrees with it.

## Provenance of card definitions

Three origins, all recorded per definition:

1. **Hand-authored by Rob**, or by an executing session under `LICENSE` §5. Tier 0 — the seven
   decks — is hand-authored on purpose, because writing it is what shapes the schema.
2. **Compiled through the Claude API**, under the Anthropic commercial terms in force at the time
   of the run. Those terms assign output rights to the customer. **The executing session confirms
   the terms and the credential name with Rob before the first compile run** rather than relying on
   this sentence; the confirmed date is recorded here when it happens.
   - *Confirmed on:* — *(not yet; no compile run has been made)*
3. **Session residue** — definitions written to close a divergence or a fuzz finding, which are
   hand-authored by origin even though a tool found the gap.

Decision 5 of the plan stands: **the compiler is the default and a hand-authored definition wins
wherever one exists.**

## Licensing consequences

- Everything under `game/engine/` is Rob's outright and carries
  `/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */`.
  `tests/engine-headers.mjs` fails the suite on any engine file without it, and on any engine file
  carrying an SPDX identifier for another license. **There is no SPDX identifier for the
  Source-Available License**; the header names it by path.
- `LICENSE` §2(c) now names the rules engine and its card definitions among the parts that may not
  be incorporated elsewhere, so the enumeration matches what exists.
- `LICENSE` §4(a) — the GPL exception for the adapter — is **deleted at go-live (G5)**, when
  `game/engine-adapter/` leaves the repository, and §4's preamble is reworded so nothing in the
  repository is GPL. `THIRD-PARTY-NOTICES.md` then replaces its Forge section with a historical
  note giving the dates Forge was used as an oracle.
- **What ownership does not change:** card names, oracle text and rules text are Wizards of the
  Coast's. `DISCLAIMER.md` §1 keeps its Fan Content statement, and `LICENSE` §4(b) already records
  that the Fan Content Policy prohibits commercializing fan content. Card text therefore stays in
  the card directories **by path convention**, so Wizards' content can be disentangled from Rob's
  IP without a migration if that ever matters.

## Consequences

**Accepted**

- Correctness over a 30,000-card pool is reached asymptotically, not on a date. The answer is a
  support ledger that says how far each card is proven, a fuzz harness that keeps finding the
  residue, and a gate that keeps unproven cards out of measured play rather than hiding them.
- Layers, replacement effects and the priority loop are where rules engines go wrong. Phase 1 ends
  at a gate designed to catch that early: 1,000 seeds of a four-player game with no exception, the
  same hash on replay, and no hidden card in any seat's projection.
- The estimate (24–43 sessions to go-live) is the plan's own and its §6 says phase 6's measurement
  is the first point at which it should be replaced by a better one.

**Gained**

- No JVM, no JDK, no subprocess, no adapter compile, and the failure class that came with them.
- The engine is cloud-ready from the first commit (§3.8), so the local/cloud split — and the whole
  web-to-local track — dissolves rather than being built.
- A card the engine cannot play is named at prepare time, with the construct it needs, instead of
  a dialog admitting the AI plays it badly.
- The product carries no GPL code after G5.

## What this ADR does not decide

- When Forge is deleted from the machine. Decision 4: after G7, and **Rob deletes it**, not an
  agent — agents do not remove directories they did not create.
- The `verified` share required before the default flag flips at G4. Decision 6 leaves that to Rob.
- The pooled commander-damage house option, which is dropped until asked.
