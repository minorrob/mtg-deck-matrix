# Instructions for the simulation session — uniform re-measurement of all 30 variants

*Copy everything below the line into the simulation session. It is written to be self-contained: it restates every format and protocol requirement, so the session needs no other context from the web app.*

---

## What I need

I have a Commander deck-planning site that reads your simulation output. Right now only 6 of my 30 deck variants have ever been simulated, and those 6 were measured across **two different engine generations** — so the site has to display a permanent warning that half its numbers can't be compared with the other half.

I want that fixed at the source: **every variant, every build, one engine, one protocol, all numbers mutually comparable.**

## Scope

Re-measure all **30 variants** listed below. These are five competing approaches for each of six deck slots; I pick one variant per slot, so I need to compare across all five fairly.

| Deck | Variants (id · commander) |
|---|---|
| 1 | `1o` Betor, Ancestor's Voice · `1a` Slimefoot, the Stowaway · `1b` Felothar the Steadfast · `1c` Liesa, Shroud of Dusk · `1e` Ghave, Guru of Spores |
| 2 | `2o` The Reaper, King No More · `2a` Xanathar, Guild Kingpin · `2b` Sheoldred, Whispering One · `2c` Atraxa, Praetors' Voice · `2e` Oloro, Ageless Ascetic |
| 3 | `3o` Obuun, Mul Daya Ancestor · `3c` Aesi, Tyrant of Gyre Strait · `3d` Sythis, Harvest's Hand · `3e` The Gitrog Monster · `3f` Omnath, Locus of Rage |
| 4 | `4o` Kangee, Sky Warden · `4a` Brago, King Eternal · `4b` Shorikai, Genesis Engine · `4c` Arcades, the Strategist · `4e` Roon of the Hidden Realm |
| 5 | `5o` Quintorius, History Chaser · `5c` Syr Gwyn, Hero of Ashvale · `5d` Aurelia, the Warleader · `5e` Trostani, Selesnya's Voice · `5f` Aryel, Knight of Windgrace |
| 6 | `6o` Muldrotha, the Gravetide · `6c` Nethroi, Apex of Death · `6d` Kruphix, God of Horizons · `6e` Old Stickfingers · `6f` Yarok, the Desecrated |

**Decide and tell me which scope you are delivering:**

- **Scope A (what I'm asking for): re-measurement only.** Simulate the card lists that already exist. Every variant has Base / Tuned / Enhance / Max; six variants (`1o`, `2c`, `3e`, `4c`, `5o`, `6f`) additionally have optimizer-built ladders. That is roughly **156 build rows**.
- **Scope B (bigger, optional): also generate** Tuned-2 / Enhance-2 / Max-2 / Fun Tuned / Fun Max ladders for the 24 variants that don't have them. This is a full optimization job per variant, not just measurement. Only take this on if you tell me first — it substantially changes the effort.

I currently have the workbook `MTGDeckDecisionMatrix.xlsx` containing the existing lists; use it as your input for the existing card lists and prices.

## Builds to measure

Assemble each build exactly the way my site does, by stacking categories in order:

| Build | Cards it contains |
|---|---|
| Base | the starting shell (100 cards) |
| Tuned | Base, then apply the `required` swaps |
| Enhance | Tuned, then apply the `enhance` swaps (these are ≤ $15 improvements) |
| Max | Enhance, then apply the `max` swaps (strongest legal capability; price is not a criterion) |
| Tuned-2 | Base, then `required`, then `tuned2` |
| Enhance-2 | Base, then `required`, `tuned2`, `enhance2` |
| Max-2 | Base, then `required`, `tuned2`, `enhance2`, `max2` |
| Fun Tuned | Base, then `funTuned` **only** — it does *not* include `required` |
| Fun Max | Base, then `funTuned`, then `funMax` |
| Alt Tuned | Base, then `altTuned` only (includes the alternative commander) |
| Alt Max | Base, then `altTuned`, then `altMax` |

Notes on which of these exist today: `1o` and `6f` have all of Tuned-2/Enhance-2/Max-2; `2c` and `4c` have Tuned-2 and Enhance-2 but no Max-2; `5o` has Tuned-2 and Max-2 but no Enhance-2. All six have Fun Tuned and Fun Max. Only `1o` (Teneb, the Harvester), `3e` (Hazel of the Rootbloom) and `5o` (Iroas, God of Victory) have Alt builds. **Measure every build that exists; don't invent rows for builds that don't.**

**Every build gets simulated this time, including Base, Enhance and Max.** Those three were previously left blank as "published lists" and that gap is exactly what I'm trying to close — I can't compare a Max build against a Max-2 build if only one of them has numbers.

Each assembled build must be exactly 100 cards including the commander. If any assembly doesn't come out at 100, stop and tell me which one rather than measuring it.

## Protocol — identical for every single row

- **Engine v2.1 only.** Nine opponent archetypes, win rate weighted 0.30 of the composite score with 0.10 given to the fun/participation signal, and the three combat-modeling fixes (creatures that assign combat damage by toughness; planeswalker commanders not entering combat as 0-power creatures; dual lands producing both colors). **Do not** measure anything on the older v1 engine, and do not mix generations within the output. This is the whole point of the exercise.
- **Same game counts** for every build (match the existing scale — roughly 20,000 games per build).
- **The same 5,000-seed holdout** that the optimizer never tunes against. Only the holdout comparison sets the verdict.
- **Verdicts** limited to exactly these four strings: `confirmed`, `within-noise`, `not-confirmed`, `no-change`.
- **Re-verify assembled lists end to end.** Assembling a list is not the same as measuring it. This check previously caught a real bug where a card correctly placed by one stage was silently evicted by a same-named candidate targeting a different slot, because Commander is singleton. Run it again from scratch.

## Output format — this part matters most

My importers parse the workbook directly with a stdlib XML reader. **Keep the structure byte-compatible with what you produced before**, or the import breaks. Specifically:

### Summary sheet (named exactly `Summary`)

A header row whose **column A cell is literally `Deck`**, with these columns in this order:

```
Deck | Build | Group | Games | Holdout games | Score | Win % | Fun % | Avg win turn | Cmdr turn | Screw % | Interaction | Verdict | Swaps | What this column is
```

- **Deck** cell format: `"<id> · <Deck name>"` — e.g. `1o · Ancestral Bulwark`. The importer takes the id by splitting on the first space, so the id must come first and contain no spaces.
- **Build** must be one of the exact strings in the build table above (`Base`, `Tuned`, `Enhance`, `Max`, `Tuned-2`, `Enhance-2`, `Max-2`, `Fun Tuned`, `Fun Max`, `Alt Tuned`, `Alt Max`).
- **Win %** and **Fun %** as fractions between 0 and 1 (e.g. `0.4322`), not percentages.
- **Score** on the existing 0–100 scale.
- One row per [variant, build] — no blank metric rows this time.

Below the main table, keep the **alternative-commander comparison sub-table** with its own header row starting with `Deck`:

```
Deck | Current commander | Score | Rank | Alternative | Score | Rank | Candidates measured | Games each | Price | The honest read
```

The **"The honest read"** column is genuinely valuable — my site surfaces that text verbatim next to the alt commander, and it's the only place that explains *why* a measured gain might be misleading (engine blind spots like devotion, or a swap that quietly turns a lands-matter deck into something else). Please write it with the same candor for all three alt commanders.

### Per-variant card sheets

If you deliver Scope B, or if any card lists change, produce **one sheet per variant** named `"<id> <Deck name>"` (e.g. `1o Ancestral Bulwark`). Each needs:

- A header row whose **column A cell is literally `Slot`**, followed by these column headers exactly: `Base`, `Tuned`, `Enhance`, `Max`, `Tuned-2`, `Enhance-2`, `Max-2`, `Fun Tuned`, `Fun Max`, and `Alt Tuned`, `Alt Max` only where an alt commander exists.
- Exactly 100 numbered data rows (one per lineup slot), each cell holding the card occupying that slot in that build. Same name across adjacent columns means the card carried through unchanged.
- A matching `_why_<id>` sheet with the same column layout, row-aligned, holding the reason a card changed at that slot.

Also keep the flat `Prices` sheet (`Card | Price (USD)`) and the `Card Data` sheet.

### Technical constraints

- Write **inline strings**, not a shared-strings table (that's what you did before and my parser expects it).
- **Do not rely on formulas.** The workbook you generate isn't opened in Excel before I parse it, so formula cells arrive with no cached value and read as empty. Any value I need must be written as a literal.

## Optional, and genuinely useful if it's cheap

A `CardImpact` sheet: `Deck | Build | Card | Replaces | ΔScore | ΔWin % | Games | Verdict`.

My site can currently tell someone *whether* a card survives into each tested build, but not *how much* adding one specific card helps or hurts. Per-card marginal numbers — from the optimizer's own candidate evaluations, or leave-one-out ablation on the Tuned builds — would let me answer "is putting this card in my deck actually a good idea?" with a measured number instead of prose. Skip it if it's expensive; it's a bonus, not a requirement.

## What I'm expecting back

The updated `MTGDeckDecisionMatrix.xlsx` (or a clearly versioned successor), plus a short note covering: which scope you delivered, total games run, anything that failed the 100-card assembly check, and any build where the holdout disagreed with the tuning run.

---

*Note to self (not part of the prompt): when this workbook comes back, the repo side needs three deliberate edits — `tools/import_summary_metrics.py` currently hard-fails unless exactly 6 decks are present and pins the v1/v2.1 split in `BUILD_ENGINE`; `tools/import_budget_plan.py`'s `DECK_SHEETS` maps only 6 sheet names; and `tests/data-integrity.mjs` pins 6-deck coverage, the engine split, and Base/Enhance/Max being unsimulated. Keeping the file format identical is what keeps those the only changes needed.*
