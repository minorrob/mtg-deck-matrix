# CrankMagic evaluations

Review date: September 7, 2026. This is Astra's assessment of the existing application and the proposed improvements, including upstream `118fe39`, now merged into the review branch. Detailed findings and their reasoning remain in the linked plans; this page makes the evaluation distinct from the implementation proposal.

## Overall assessment

The app has valuable foundations: static deployment, shared testable modules, deterministic measurement, score provenance, card resolution, workbook exchange and substantial browser-journey coverage. Preserve these. The weakest boundary is between a plan or model assumption and a verified fact. A generated deck must not imply ownership, and a repeatable simulation result must not imply proven real-game performance.

**First implementation priority:** make inventory truth independent of deck plans. **Largest intelligence priority:** establish legal four-deck simulation and validate its predictions before increasing optimization ambition. The visual redesign improves usability but cannot resolve either issue by itself.

## Simulator and optimization

| Evaluation | Finding and implication | Detailed record |
|---|---|---|
| Current model | Monte Carlo simulation with heuristics and sampled opponent profiles; not a trained ML system or four independently played decklists. It can compare modeled scenarios, but cannot yet claim it played three specific imported opponent lists. | [Model findings](simulation-fidelity-plan.md#what-is-still-wrong-enough-to-affect-recommendations) |
| Recent improvements | Printed power/toughness hydration and uniform fixed-list remeasurement are already delivered. Pilot policies, ablations and the browser lens are also delivered. Retain them; do not present them as work still to build. | [Reviewed baseline](simulation-fidelity-plan.md#baseline-actually-reviewed) |
| Rules fidelity | Mana payment, opening procedure, effect lifetimes, actual combat, priority/stack and complete outcome accounting need correction or implementation. More repetitions cannot remove these systematic errors. | [Finding inventory and first verification for each](simulation-fidelity-plan.md#what-is-still-wrong-enough-to-affect-recommendations) |
| Pilot evidence | The clock policy reads internal opponent `winTurn`; interaction card consumption improved, but full mana/target accounting remains absent. Its apparent skill advantage can exploit model information and approximations. Policy comparisons are coaching hypotheses, not diagnoses of human ability. | [Pilot review](simulation-fidelity-plan.md#new-upstream-pilot-work-retain-it-narrow-its-claims); `TARGETS.clock` in [pilot-policy.js](../../pilot-policy.js), held-answer branch in [sim-engine.js](../../sim-engine.js) |
| Optimization validity | A best score within one simplified model is not a globally optimal Commander deck. Candidate selection can overfit opponents, policies and random samples. Use constrained alternatives, paired interventions, untouched final evaluation and an explicit “keep current / inconclusive” result. | [Simulation architecture and evaluation](simulation-fidelity-plan.md#target-architecture-rules-pilots-evaluation) |
| Human realism | The committed game-history dataset has zero games. There is no basis for a universal realism percentage. Rules correctness, tactical decisions, outcome calibration and social behavior need separate evaluation. | [How close to four people](simulation-fidelity-plan.md#the-answer-to-how-close-to-four-real-people); [game-history.json](../../data/game-history.json) |
| Combat proposal | Actual bodies and blocking are useful, but cannot stand in for actual opposing lists and response windows. Correct rules and contextual decision tests take precedence over tuning a desired score movement. | [Critique of the upstream proposal](simulation-fidelity-plan.md#critical-changes-to-the-new-combat-proposal) |

The recommended direction is a deterministic rules kernel shared by all four seats, observation-limited pilots, explicit support coverage, inspectable replays and versioned reports. Begin with complete supported pods and expand coverage. Unsupported strategies remain usable for collection and exploration; they do not receive a falsely confident outcome recommendation. Recorded human games then test prediction and decision quality on held-out pods and lists. The detailed plan contains the proposed evidence collection, metrics and release gates.

## Collection, architecture, data and experience

| Area | Evaluation and required response |
|---|---|
| Ownership and import | The review reproduced deck-plan quantities becoming Owned / In Hand without an inventory entry. Import logic also normalizes invalid quantities and can merge printing details by name. Passing existing tests does not establish the requested inventory fidelity. See [the concrete findings](improvement-plan.md#the-weakest-part-a-plausible-answer-can-look-like-a-verified-fact). |
| User's collection model | The journey is rational when Source, Purpose, allocation and physical placement remain independent. Finalizing reserves requirements; receiving establishes ownership; In deck confirms placement. Released copies can fulfill compatible needs without pretending they physically moved. See [the collection contract](collection-workflow.md). |
| Choice and protection | Visibility must not equal simulator eligibility. All owned cards remain inspectable; protected donors require explicit choices, and simulation never moves inventory. Sell / Trade membership is distinct from a pending deal or completed disposal. These distinctions prevent double promises while preserving user control. |
| Data authority | My Decks and Matrix have different source/projection paths. Introduce one collection authority and consistent views. Preserve printing identity and unknown values. Keep the corrected [glossary](../../docs/glossary.md) as one editable dataset; generated tooltip subsets are outputs. |
| Static architecture | Keep UMD modules and static hosting. The current browser measurement and tool-driven optimization are different paths; a responsive in-app loop requires cancellable workers, revision checks and bounded local storage. Large reports and transaction history need the planned IndexedDB, backup, migration and recovery design. |
| UX and graph | Preserve the graph and Copilot capabilities. Distinguish a structural connection or co-play pattern from a measured improvement. Shared tables, stable columns, optional facets, contextual actions and deck-to-Collection navigation reduce bookkeeping without hiding important state. The mock demonstrates the direction; it is not proof of production completeness. |
| AI value and cost | Use bounded AI explanations after deterministic work, not a model call per game or optimizer iteration. Validate names and references, cache advice and keep the app functional with AI off. Imported advice packs fit static deployment; live credentials require the explicit user-controlled flow described in the plan. Spending limits are proposals, not verified prices or authorization to spend. See [AI evaluation and controls](improvement-plan.md#6-add-low-cost-ai-explanations-and-earned-calibration). |

## What the evidence establishes

[Verification.md](verification.md) records the actual checks: 35 Node suites, 459 production browser checks and 460 preview checks, plus glossary, asset-version and reproducible-build validation. Those establish tested behavior and artifact integrity. They do not prove human-level simulation, arbitrary-card rules coverage, production migration safety or an optimized final deck.

Source inspection, prior direct reproductions, reported upstream measurements and proposed future acceptance criteria are distinguished in the detailed plans. No new optimizer sweep, human calibration, paid AI evaluation or production implementation was performed to assemble this assessment. The full build remains pending sign-off.
