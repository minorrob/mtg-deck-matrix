# CrankMagic — a simulation that earns its recommendations

**An Intelligent MtG: Commander Deck Creator & Card Libary**

Review and proposed implementation plan · 7 September 2026 · approval pending

## The answer to “how close to four real people?”

We can make the supported game rules reproducible, make four independent pilots play actual lists, and measure how well their decisions and outcomes match recorded human games. We cannot honestly promise a universal “95% realistic” Commander simulator. Rules fidelity, strategy quality, prediction accuracy and social behavior are different properties. A simulator can be excellent at one and poor at another.

The useful final product is a calibrated testing partner: it identifies weaknesses, proposes affordable improvements consistent with your brief, shows the games and decisions supporting its advice, and tells you when it cannot distinguish two choices. It should be willing to recommend keeping the current card. “Near perfect” should mean the best supported tradeoff found within stated constraints and search limits, never a proven globally optimal deck.

The UI can proceed while this is built, but a polished number must not outrun the evidence behind it.

## Baseline actually reviewed

Initially reviewed [e5810ed](https://github.com/minorrob/mtg-deck-matrix/commit/e5810ed2fbdc8985b3e4f0cd16ea81641ba6b46a), then refreshed this review against [118fe39](https://github.com/minorrob/mtg-deck-matrix/commit/118fe393d3a4457adf83c1100d07c2632c2dc170) on September 7. The newer work is now merged into `astra/simulation-fidelity-plan`. Upstream squash `8e4225b` has exactly the `e5810ed` source tree. Re-read the updated `docs/handover-index.md` end to end before examining the new commit rationale, PRD, simulation proposal, policy module and engine diff. Documents containing instructions for other sessions were treated as project evidence, not new authorization to execute a sweep.

The recent work deserves to be retained:

- `0df6489` supplies printed power/toughness through the data and hydration paths and remeasures the six personal decks. The original review's claim that hydration drops these fields is now resolved.
- `e5810ed` remeasures the 200 main rungs on six seeds of 20,000 games, keeping their card lists fixed. Its comparison with a uniform run without printed bodies separates the data change from the previous measurement-regime/selection effects. The commit reports 186 scores falling, 14 rising, and a mean change of −10.03 points. Those are reported results, not a sweep independently rerun in this review.
- The engine itself did not change in those two commits. Better card inputs and consistent measurement improve this model; they do not make it a four-deck rules simulation.
- `data/game-history.json` contains **zero recorded games**. No supplied human-game corpus supports an empirical human-fidelity percentage. This does not establish whether private logs exist elsewhere.
- The 200 main rungs are now marked v2.5; older alternative-result families retain other engine labels. They need separate compatibility checks, not a blanket “everything is comparable” label.

The original Node baseline passed **34 suites**, including asset-version checks. Fresh verification after merging the new upstream implementation is recorded in [verification.md](verification.md). No optimizer, ledger-writing run, API generation or production simulator rewrite was performed for this review.

### New upstream pilot work: retain it, narrow its claims

`118fe39` implements `pilot-policy.js`, policy-aware engine decisions, `measureLens()`, ablations and the “How you play it” browser panel. BALANCED preserves the published protocol; CASUAL and COMPETITIVE change mulligans, casting, attack targets, mana reservation and blocker retention. The two lens policies use remaining mana for interaction credit and remove an answer card when it delays an opponent. These are implemented improvements, not future tasks to duplicate.

They also expose specific next priorities:

- **Information leakage:** the `clock` attack policy directly reads each profile seat's internal `winTurn`. That is an oracle for the sampled opponent model, not a threat estimate derived from a player's observation. Its measured advantage cannot establish that people would recognize those threats. Retain it as a labeled oracle benchmark and compare an observation-limited policy before treating the gap as practical coaching.
- **Resource accounting remains incomplete:** the lens removes a cheapest eligible-class instant when delaying a win, but that branch does not debit its mana, verify the selected spell's colored payment or require a legal target/effect. Multiple available answers are counted against the same resources. Spending the card fixes repeated reuse across turns, not the entire interaction model. Legal actions must pay and consume the selected spell exactly once.
- **Published and lens protocols differ:** legacy BALANCED retains the old repeated-answer and counterfactual interaction behavior to reproduce published scores. Preserve that historical protocol for reproducibility; give the corrected engine a new protocol identifier and remeasure comparable lists. Never mix the lens/header values or silently reinterpret old scores.
- **The blocker penalty is model evidence:** upstream's reported negative effect of retaining blockers exposes the capped aggregate-defense model. Do not tune real combat until a retained blocker produces a predetermined positive delta. Verify correct rules first; its tactical value depends on the actual position.
- **A policy gap is not a diagnosis of a person:** same-list ablations identify effects under this model's assumptions. They do not isolate human skill or prove a human loss was caused by poor piloting. Keep per-deck attribution, uncertainty, replay evidence and measured drawbacks, but describe coaching as hypotheses until tested against recorded decisions.

The existing two-policy lens is therefore useful groundwork for the four-seat architecture below. It still has profile opponents, no stack or real blocking, no human-game validation corpus and no information-isolated tactical search. The newly reported upstream ablation magnitudes were inspected in its commit/documentation, not independently reproduced by another sweep in this review.

## What is still wrong enough to affect recommendations

The inventory below was recorded at `e5810ed`; its line references are historical. The pilot update above supersedes the held-answer finding for the lens's card consumption and interaction credit only. These are source-inspection findings, not independently measured estimates of their individual score impact. Several can interact; fixing one may reverse an earlier apparent improvement.

| Finding at the reviewed commit | Why it matters | First verification to add |
|---|---|---|
| Three opponents are sampled profiles with damage curves and scheduled win turns, not hands/libraries/boards: `sim-engine.js:475`, `:488`, `:881` | The app cannot yet say it tested your deck against three specific Archidekt lists or explain the actual opponent combo | Four actual lists, four player states, replayable legal actions |
| Defender permissions and counter doubling are inferred from inclusion anywhere in the list: `:396`, `:551`, `:565` | An undrawn support card can improve the battlefield; Hardened Scales is not equivalent to doubling every counter event | Effect absent in library; activates only in its applicable zone; disappears correctly |
| Repeated counter/proliferate sources fire on a turn cadence and can outlive their source: `:608`, `:769` | Removes costs, trigger conditions and timing; especially distorts the user's counters decks | No landfall without a land event; no cast trigger for a spell copy; removed source stops future triggers |
| Color production treats “add {C}{C}” as every color; castability checks each color independently: `:138`, `:440` | Sol Ring can contribute false fixing; one multicolor source can appear to cover incompatible simultaneous color needs | Typed, exclusive mana payment; Sol Ring cannot pay a colored pip |
| Opening procedure bottoms a card on the first mulligan and skips the first draw for half of seeds: `:504`, `:624` | Mana and opening-hand findings are biased before decisions begin | Commander multiplayer opening fixtures |
| “Held answers” use total capacity after casting and delay opponent clocks without consuming the card: `:779`, `:881` | A tapped-out pilot may receive protection credit; one answer can repeatedly delay a win | Pay costs once, remove the actual card, use remaining resources and valid targets |
| Attack damage uses fixed connection factors; attackers continue contributing defensive toughness: `:791`, `:865` | No actual blocking choices, combat trades, vigilance cost or distinct token blockers | Legal attacks, tapped states, blocks and damage resolution |
| Wipes clear creature arrays without consistently clearing commander/source state: `:747`, `:877` | Ghost engines and incorrect commander access survive removal | Zone transitions invalidate effects and enable correct recasting |
| Turn-capped games are included in the win denominator without a distinct incomplete-outcome report: `:622`, `:979` | Slow strategies can be penalized for a compute cutoff | Report wins, losses, draws and censored/incomplete games separately |
| “Fun” uses chosen board/pace/survivor formulas; cast/win correlations are observational: `:1005`, `:1261` | Neither establishes player enjoyment or the causal value of adding a card | Name the proxy; use paired interventions for swaps and human ratings for enjoyment |

The opening-hand corrections follow rules 103.5c and 103.8c in the [official Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt): ordinary multiplayer Commander gets a free first mulligan and every seat draws on its first turn. That document declares an effective date of August 7, 2026; preserve its bytes, declared date and hash, not just a mutable URL.

The engine header already cautions against reading its output as absolute real-world odds. The redesign must preserve and strengthen that distinction.

## Critical changes to the new combat proposal

`docs/simulation-fidelity.md` has a useful direction: actual bodies, meaningful blocks and attacks that consider retaliation. I would revise its order and acceptance criteria before execution.

1. **Reconcile the document with the new commits.** Its first section still presents printed bodies as an experiment awaiting implementation. The old 30-variant refresh instruction file is historical too. Versioned run manifests must supersede conflicting prose without erasing its history.
2. **Do not postpone actual opponents and priority as “smaller distortions.”** An exact combat resolver against invented opposing boards still cannot evaluate threat removal, combo protection or who should be attacked. Build a four-seat state/action foundation first, with stack windows from the outset.
3. **Remove obsolete damage-order assumptions.** The proposal says damage is assigned “in an order the attacker chooses.” Define the current division rule explicitly and test it. Wizards removed predeclared blocker damage assignment order in 2024; a creature can divide damage among its blockers without first assigning lethal to one, with the separate trample requirement still applying. See the [Foundations update bulletin](https://magic.wizards.com/en/news/announcements/foundations-update-bulletin).
4. **Turn examples into contextual decisions.** A 1/1 deathtouch blocker does not universally kill every attacker. First strike, prevention and indestructibility can change the result. Taking three damage at 40 life to retain a creature may be sensible; commander damage, attack triggers, future turns and other seats can reverse that choice. A fixed “life value” is a pilot approximation, not a rule.
5. **Do not claim an archetype is supported because one counter was added.** Storm needs legal mana and sequencing, casts versus copies, targets, priority and an actual win path. Supporting a named alternate win card needs its condition and response windows, not a threat bonus.
6. **Benchmark the proposed engine before promising throughput.** “5–10× slower” and retaining 120,000 games are hypotheses. Use representative stack, token and combo workloads on desktop and phone. Correct outcomes, validated predictions and useful decision latency are the gates; a score moving in the expected direction is not.

## Target architecture: rules, pilots, evaluation

### 1. One rules authority with a declared support boundary

Keep a pure deterministic UMD rules kernel usable in Node and Web Workers. All four seats use it. It owns zones, object identity, ownership/control, per-turn resources, command zones, legal choices, mana payments, stack/priority, triggers, replacement effects, continuous effects, state-based actions, combat and terminal outcomes. The pilot chooses an offered legal action; it cannot mutate state directly or decide that a spell resolved.

Use typed, versioned card abilities and small reusable primitives, with reviewed special handlers where needed. Preserve faces and dynamic characteristics instead of flattening cards into a printed body plus regex bonuses. Include order-sensitive continuous effects and source lifetimes. Never run code generated at runtime from card text. An AI may help author a proposed handler and fixtures during development; tests and review determine whether it ships.

Start with a narrow vertical slice: four complete decks spanning supported mechanics, rather than claiming partial coverage of every card in Magic. Expand through the user's six decks and a benchmark pool of roughly 12–24 diverse lists. Include counters, tokens, graveyard, sacrifice, combat/commander damage, control, spellslinger and validated combo lines. Arbitrary imported lists remain usable for collection and exploration even when a measurement is unavailable.

Each run carries a **support report for all four lists and reachable generated cards**. Track ability paths and interactions, not just percentage of card names recognized. An unsupported win condition or removal interaction prevents an overall outcome claim; supported mana/composition diagnostics can still be shown separately. Unknown is never silently treated as weak.

Finite combo shortcuts must demonstrate legal prerequisites, resource changes and available interruption windows. Mandatory loops, optional loops, deterministic wins, deck exhaustion, player departures and draws need distinct outcomes. A compute cutoff is not a game loss. Emit compact traces and save full replays for failures and inspected games.

### 2. Four independently informed pilots

Each pilot receives its own hand, public state, remembered revealed information and legal actions. It must not see another player's hidden hand, deck order or future randomness. Explicitly distinguish an open-decklist experiment from a commander-only experiment. Test that permuting inaccessible information leaves action probabilities unchanged when the public observation is identical.

Start with competent, inspectable policies: mulligans, mana sequencing, setup versus holding interaction, tutor targets, attacks and blocks, threat assessment, removal timing, recovery and win attempts. Then add bounded lookahead and sampled hidden states where benchmarks show an improvement. A search that peeks at hidden cards or chooses incompatible plans across sampled worlds can look stronger without being more human; the observation contract and policy tests must catch that.

Vary skill, risk appetite, resource conservation, deck familiarity and table expectations. “Casual” must not mean random mistakes, and “competitive” must not mean always attacking the lowest life total. Test the same list under multiple policies; otherwise the optimizer will select cards the one pilot happens to understand.

Politics starts as explicit scenario assumptions: threat-based temporary cooperation, avoiding premature aggression, honoring a declared deal, willingness to break a deal, and memory of earlier actions. These are sensitivity scenarios. They are not a claim to reproduce friendship, bluffing, grudges or natural conversation. Only observed human data can justify more specific social claims.

### 3. Actual pods and a robust optimization loop

Let the user choose three imported public or local lists, saved pod presets, or a diverse benchmark mix. Archidekt is a list source, not a population of human behaviors. Cache a dated normalized snapshot; provide paste/CSV fallbacks if a static browser cannot fetch the URL. No credentials or private deck data are needed for public imports.

The brief records starting mode, commander constraints, mechanics, pinned cards, legal/bracket snapshot, base bracket and ceiling, budget, ownership/reuse policy, speed, competitiveness, saltiness and optional prohibitions. Select Commander first offers name search or a shortlist browsed by mechanics and EDHREC popularity rank. The user selects the commander before Auto-build 99. Popularity is not strength or simulation evidence. Compare candidates under the chosen commander; changing that commander requires an explicit new choice. Two-command-zone configurations use the legal total of 100, not a hard-coded universal “commander plus 99.”

The UI groups the whole-deck parameters under **Deck Definition**, separately from Commander choice. Search covers legal commanders regardless of ownership, with any commander purchase included in the budget. Production progress is driven by validated input capture, initial list creation, refinement, loop completion, report persistence and final candidate preparation. Static step labels change indicators, not position; cancel/failure/unsupported states cannot advance to a false completion. The preview's timed indicators are design demonstrations only.

Persist the report with immutable deck/input and measurement protocol snapshots in local IndexedDB, include it in backups, and expose it through report history. Comparison requires identifying differences in deck, budget, pod, engine, policy, coverage and seed protocol. A report from a different protocol must not be presented as a clean causal improvement. Completed Deck opens its candidate list for review; only user finalization commits reservations.

Generate legal candidates using metadata, known interactions, graph findings and observed failure traces. Screen cheaply; race promising candidates with progressively larger samples; then confirm a small finalist set with the same authoritative kernel and declared pilot budget. A learned approximation may prioritize candidates, but cannot publish a deck score in place of the engine.

Compare swaps on paired random scenarios with independent chance streams by seat/event. Merely reusing one seed is insufficient when a changed action consumes a different number of random draws. Rotate seats and match pilot assignments. Preserve an untouched final test pool of seeds, opponents and policies; do not retune on the holdout after a disappointing result. Account for repeated candidate selection and repeated significance checks.

Optimize a small Pareto set: closest intent fit, least purchase cost, greatest eligible reuse, and stronger weak-matchup resilience. Report meaningful effect sizes and uncertainty, plus the cheapest option consistent with the evidence. Show multi-card synergy packages as well as single swaps. Recommendations are reversible; acceptance rechecks collection and deck revisions before allocating anything.

Do not call this a solved game-theoretic equilibrium. Four-player incentives, social choices and changing opponents invalidate that shortcut. Use payoff comparisons, counter-strategy tests and worst-cohort sensitivity to reveal brittle builds. A balanced symmetric four-player pod has a 25% winning share when games produce one winner. All four players cannot each sustainably win 30–45% of those same games. The existing band may express one user's desired advantage against a fixed reference pod; it is not a universal “fair pod” definition.

## What recorded live games must establish

Build two distinct evaluations; they answer different questions.

**Replay correctness:** given known state and recorded legal actions, does the engine produce the correct next state? Annotated test positions and complete logs can validate rules. Never use hidden cards learned after the game as information available to the pilot during prediction.

**Human prediction:** before a decision or game result is known, can the model predict action choices and outcomes across held-out people, decks and pods? Human decisions are distributions, not one universally correct move. Ask experienced reviewers for plausible alternatives and reasons when annotation is needed.

Extend the local Game Log with exact list revision, four commanders/lists when available, seat order, pilot experience, mulligans, outcome, turns, eliminated seats, important plays and optional decision snapshots. Distinguish a rules draw from an unfinished game. Keep missing information explicit. A lightweight session entry should remain practical at a table; detailed video annotation is optional work, with consent and manual verification. Video does not automatically become reliable ground truth.

Proposed validation progression:

| Gate | Evidence required before proceeding |
|---|---|
| Rules foundation | All mandatory scenario fixtures and conservation/zone invariants pass; zero known critical rule errors in the declared supported domain; deterministic replay |
| Four-seat plausibility | Equal lists/policies are seat-symmetric within uncertainty after rotation; legal actions only; hidden-information isolation; outcome accounting; actual opposing win paths |
| Human instrumentation pilot | Approximately 40–60 games across several people/pods to expose logging gaps and major model failures; no claim of small win-rate precision |
| Decision validation | A curated, versioned set of roughly 300 varied positions, with multiple independent reviews of disputed decisions; compare policy agreement and illegal/inexplicable choices |
| Prospective outcome validation | Roughly 300–500 diverse recorded games for initial calibration and large biases; split by player/pod/list family, not random near-duplicate rows; preregister acceptance after pilot variance is known and before opening the holdout |
| Recommendation release | Beat predeclared simple baselines on held-out prediction; demonstrate useful, stable recommendations and expose uncertainty; reject unvalidated cohorts or mechanics rather than averaging failures away |

These are proposed collection targets, not promises that the sample will suffice. Repeated games by the same pod are correlated. Small improvements can require far more data.

Report multiclass outcome probability error, calibration curves with intervals, terminal-outcome coverage, turn distributions, mulligans, cast timing, mana failure and interaction use by cohort. Define metrics precisely: the four-class summed Brier score of a uniform predictor is 0.75 on a single-winner game. A prospective target might be a 10% relative improvement over suitable baselines, but it must be justified by pilot data and met on unseen data before making the claim. Draws need an explicit outcome model or a separately labeled conditional analysis.

As an illustration, at a 25% win probability, a simple independent-binomial normal approximation gives 95% margins of about ±8.5 percentage points at 100 games, ±4.9 at 300 and ±2.7 at 1,000. At 120,000 simulated games it is about ±0.25 points **for that simulator**, not its error against humans. Roughly 1,200 independent observations per arm is a planning-scale estimate for distinguishing a five-point change near this rate with 80% power; clustering and multiple comparisons can increase it. Use appropriate intervals/paired analyses in the implementation, not these illustrative approximations as verdict rules.

When predictions disagree with human play, classify the discrepancy: missing/incorrect card facts, rule resolution, pilot policy, unseen pod composition, social context or inadequate sample. Do not “calibrate” a broken rules engine by adjusting score weights until the averages look right. Observed game outcomes must be compared on the same list versions and outcome definitions; the current game-record module excludes draws while the engine's cap handling differs.

## ML and AI with very low token cost

The core loop spends **zero API tokens per simulated game or action**. Workers run locally. Start with explicit policies and reliable evaluation. Once enough labeled decisions/outcomes exist, learn small action-ranking or calibration models offline, validate them prospectively, and ship versioned weights as static assets. Self-play can generate practice data; it cannot certify human realism by itself.

Preserve `guide-agent.js`, its validators, the existing guide-generation tool and the Copilot's graph/simulation lenses. Expose recommendations in the deck overview, Discover and card inspector. A useful finding includes reason, source, affected cards, cost and the action it opens. Structural synergy, measured improvement, personal game evidence and AI prose have different labels. Negative or inconclusive measured upgrades remain useful advice.

Optional AI is for concise strategy/how-to explanations, interpretation of an already computed SWOT, and assisted resolution of otherwise unresolved public card information. Send the smallest relevant facts, not the entire collection or every game trace. Cache by deck hash, intent, facts, rules, engine and prompt version. Batch guidance; cap input/output tokens, retries and total session spend. Default to deterministic templates and existing cached guides. A failed AI call must not prevent building or managing cards.

A static app cannot keep an embedded shared API secret confidential. Any bring-your-own-key route must use provider-supported browser access, session-only key handling by default, explicit opt-in and visible spend limits; if direct browser access is unsupported, use imported advice packs or optional user-run tooling rather than implying a server exists. Choose the provider and current prices only when enabling this optional path. No paid calls are needed to deliver the initial improved app.

Commander lookup is local exact/alias search, then provider-backed public name search, then a link request. Resolve recognized URLs through supported public data endpoints; do not promise arbitrary HTML scraping through CORS. Store verified identities, faces, rules source and timestamp in the user's supplemental catalog. If resolution fails, preserve the supplied name/link as an unverified record and offer pasted authoritative data or manual review. An AI guess never becomes authoritative identity, legality, ownership or simulator support. Include supplemental records in JSON backup and enriched Excel export.

## Delivery that remains a static app

| Increment | Concrete result | Release gate |
|---|---|---|
| A. Baseline and honesty | Current docs, immutable run receipts, support labels, rule regressions, distinct incomplete outcomes, old-generation result quarantine | Reproduce frozen baseline and explain every known incompatibility |
| B. Four-deck vertical slice | Legal mana/turn/stack/zone foundation, one complete supported pod, replay inspector, isolated pilots | End-to-end legal games and mandatory rule fixtures |
| C. Coverage and decisions | Combat, tokens, counters, interaction, recovery and the user's key win paths; archetype policies and bounded search | Supported-pod coverage, human-position checks and measured runtime |
| D. Human calibration | Local logging, curated scenarios, frozen validation sets, calibrated estimates and uncertainty displays | Prospective validation, with claims restricted to supported cohorts |
| E. Optimization and recommendations | Three entry paths, constrained candidate search, paired comparisons, robust shortlist, inspectable SWOT/Copilot findings | Holdout improvement, cost/ownership invariants, no unsupported overall score |
| F. Optional learned pilots/advice | Versioned learned components and tightly budgeted explanations | Beats the established baseline without information leakage or increased rule errors |

Use Web Workers for bounded batches, cancellation and progress. Save checkpoints and manifests locally; resume only with compatible versions. Measure p50/p95 interaction latency, memory and games/second for desktop and phone workloads, including large token boards and long stack chains. Fit the run budget to the device and requested confidence. Keep the interface responsive and allow a shorter, clearly labeled inconclusive run. Static precomputed benchmark packs can supplement local work without pretending to match a changed personal deck.

Persist user records in versioned IndexedDB with transactional updates and JSON backups; treat browser cache as disposable, not the collection authority. Keep existing offline exports and optional file-backed workflows. No server, framework or runtime package installation is required. Development tooling may run under Node without creating a client dependency.

Each implementation increment is a branch and reviewable draft PR. Run `bash runtests.sh -q`, browser journeys, and the relevant rule/benchmark checks before any push. Bump changed asset URLs everywhere, then run `node tests/asset-versions.mjs --update` under the repository's convention. No merging without the user's instruction. Preserve the UMD/test architecture and explain decisions in module headers and commits.

## What I would change first

The first product change remains trustworthy ownership: a generated deck must never create owned cards. For the simulator, the first increment is a reproducible baseline with explicit support limits and failing examples for the defects above, followed by a four-seat legal-action slice. Making combat prettier inside the existing opponent-clock model would not be my foundation.

I would authorize the work in gated increments, with the four-deck slice providing the first credible estimate of remaining coverage and runtime. A full human-equivalent Commander simulator is not a cosmetic follow-up to this app. A demonstrably more useful, honest and increasingly realistic testing system is achievable without promising that impossible universal percentage.

## Verification note

At the historical `e5810ed` baseline, `bash runtests.sh -q` passed 34 suites and `node tests/uat/journeys.mjs` passed 459 browser checks. Fresh checks of the merged branch are in [verification.md](verification.md); future production release gates are in [end-to-end-plan.md](end-to-end-plan.md). Application tests establish implemented behavior; they do not validate human realism. The standalone design study contains temporary sample data, no real simulation, no network card lookup and no durable collection storage. Its narrowly scoped preview-report cache is separate from the proposed production persistence.
