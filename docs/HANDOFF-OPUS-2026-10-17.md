# Codex to Opus 5.5: temporary delivery ownership

Prepared October 17, 2026 for Claude Desktop, at Rob's request because Codex usage is nearly exhausted. This is a continuation, not a redesign from a blank slate. Rob authorizes Opus to continue access/invitations, Play, the Babylon renderer and the UX feedback loop, keeping work in GitHub and Linear. Opus may coordinate bounded work with Grok Bots. When Codex returns, explicitly restore the split: Codex owns UX/UI, Play presentation and access/user management; Claude owns rules engine, simulation, card loads and AI enablement. Confirm the live ownership before any overlapping edit.

## Start here

1. Read `AGENTS.md`, `docs/ACTIVE.md`, this handoff, and `docs/play-overhaul/LINEAR-BACKLOG.md`. Fetch current GitHub refs; this document is a snapshot, not a guarantee that another agent has not advanced them.
2. Read Linear ROB-11 (coordination), ROB-10 (invitation release), ROB-72 (runtime fix), ROB-14 (Codex delivery umbrella), ROB-71 (Fable engine umbrella), and ROB-12/ROB-13 (active engine contracts).
3. Record temporary Opus ownership, branch, exact files and next acceptance check in ROB-11 and the UI/user-management section of ACTIVE. Coordinate with the existing Fable/Claude Code session before touching shared files. Do not replace its status or assume Claude Desktop and Claude Code are the same session.
4. Finish the focused invitation release below first. Then choose the next UI/Play slice from the backlog with Rob's feedback. Do not merge the broad unfinished UI draft to unblock email.

Canonical local repository: `C:/Users/robmi/CrankMagic/repo`. GitHub: https://github.com/minorrob/mtg-deck-matrix . Use canonical checkout for Git commands; inspect worktrees before creating another. Preserve unrelated changes. Never hard-reset, clean, force-push or overwrite another agent's files to obtain a clean tree.

## Linear is the execution record

Project: **CrankMagic — Tabletop Experience**, team **Army of 1**. Project ID `5a1ca7c1-c7b3-4a1d-9842-16861dcdf590`.

- [ROB-14 delivery plan](https://linear.app/robs-build/issue/ROB-14/crankmagic-delivery-plan-complete-feature-backlog-and-acceptance-map): 55 children ROB-15–ROB-69, covering every R01–R37 requirement, P01–P15 plan section, later feedback, tools and infrastructure. Includes the cross-story rules/UX safeguards. Import was verified by readback; no items were marked Done simply because code exists.
- [ROB-71 engine plan](https://linear.app/robs-build/issue/ROB-71/engine-and-simulation-delivery-plan-fable-backlog-contracts-and): Fable's own engine, card loads and simulation backlog. Reuse it; do not duplicate it.
- [ROB-11 coordination](https://linear.app/robs-build/issue/ROB-11/coordinate-fable-engine-and-simulation-handoff-with-codex-ui-and): file ownership, room contracts, migrations and release ownership.
- [ROB-10 release](https://linear.app/robs-build/issue/ROB-10/wire-invitations-and-sharing-to-resend-prove-staging-delivery-and): outstanding real recipient acceptance.
- [ROB-72 runtime blocker](https://linear.app/robs-build/issue/ROB-72/fix-native-workers-redirect-rejection-blocking-invitations-and-resend): root cause, fix, native tests and PR #737.

For each new feedback item: capture Rob's words and the interpreted behavior, clarify only consequential ambiguity, search existing issues, then update or create a scoped issue. Record owner/lane, dependencies, acceptance cases, evidence, branch/PR, release SHA and unresolved limitations. Mark superseded decisions explicitly. Product, design, rules, engineering and QA are useful perspectives; do not pretend separate people reviewed work. Keep private records and recipient details in explicitly authorized private storage, never this public repository.

## Exact release state at handoff

| Item | Verified state |
| --- | --- |
| Main / initial focused release | PR #736 merged; source `2d5772259fa3936543792c1e7ef20d396ee15c6f` |
| Staging release branch | `release/cloud-staging`, commit `45d35eefdc16d0af7160ca756d610b1ac32e3cfb` |
| Live staging | Authenticated `/version.json` confirmed source `2d577225…`; runtime fix below is NOT deployed |
| Production | Unchanged source `c9ad0e65264582a786d02710e0b76774d064a792`; no production release authorized here |
| Runtime fix | Branch `codex/invite-runtime-oct17`, head `fd152c64f5fa7557e8685383ed28e6ad0f69a06a` |
| PR #737 | https://github.com/minorrob/mtg-deck-matrix/pull/737 — OPEN, MERGEABLE against main `2d577225…` at last read |
| Runtime CI | https://github.com/minorrob/mtg-deck-matrix/actions/runs/39044154055 — COMPLETED, failures only `tests/a11y-board.mjs` and `tests/engine-breaks-anchors.mjs` |
| Broad UI draft | PR #735, `codex/ui-playtest-plan-oct15`; unfinished shared shell/commander work; existing merge conflicts with main; do not merge wholesale |
| Backlog index | `codex/linear-backlog-oct17`, commit `894175bfbc2ac8927f1f6ebee097dee1e530edf7`, pushed; documentation only |

Rob explicitly authorized the focused staging update with a one-time exception for those two existing CI failures. ROB-15 and ROB-16 retain repairs. This is not a blanket waiver for unrelated failures or future releases. PR #737 is a corrective follow-up within the same unfinished invitation acceptance; record that context and inspect the final CI log before releasing. Recheck main/head/tree before merge; coordinate if Fable has merged since this snapshot.

## Invitation failure: solved locally, live acceptance still pending

The supplied token was valid. `ACCESS_INVITE_TOKEN` in the Windows **User** environment verified active and could read the exact staging Access application and reusable invitation policy (three HTTP 200 results). Its value was installed privately into staging's existing Worker secret using stdin. The Windows variable and Worker secret are separate. No token was printed or committed; do not retrieve its value through a connector or ask Rob to paste it in chat.

Actual code defect: both `cloud/access-invites.mjs` and `cloud/mail.mjs` used `redirect: 'error'`. Native workerd throws before network access for that option. Mocked Node tests missed it. The fix uses `redirect: 'manual'` and rejects non-2xx responses without following redirects, exposing credentials, or returning provider bodies. Both adapters must be fixed or admission succeeds but email still fails.

Proof on `fd152c64…`:

- `node tests/sharing.mjs`: 68 checks pass.
- `node tests/cloud-worker.mjs`: 126 checks pass.
- `node tests/feature-wiring.mjs`: 124 checks pass; `node tests/data-integrity.mjs`: 50 variants validated.
- `tests/uat/sharing-runtime.mjs`: native workerd success, Access redirect refusal with no email, Resend redirect refusal. All outbound traffic intercepted; synthetic credentials only. Reintroducing the old option makes the intended success assertion fail, then the fix was restored.
- Set `MINIFLARE_MODULE` to an installed Miniflare ESM entry, then `node tests/uat/sharing-runtime.mjs`. Local installation: `C:/Users/robmi/CrankMagic/workbench/cloudflare/node_modules/miniflare/dist/src/index.js` (use a `file:///` URL). Installed workerd supports dates through September 30; that is the local test date. Live staging's compatibility date remains October 17. Do not claim the local binary is identical to the edge runtime.
- Exact candidate built with `node tools/release-pages.mjs --ref fd152c64f5fa7557e8685383ed28e6ad0f69a06a --profile cloud-staging --out work/invite-runtime-release`: 359 files, 63.7 MB. Compared with live release: only the two adapters and release metadata differ.
- `tests/uat/release-acceptance.mjs` against that package: all 22 checks pass, including create, simulator, save/finalize, explore and acquire; no page errors, missing files or CSP failures.
- Privacy/clean-main merge scan passed before push. No engine, UI layout, permission policy or production changes in the runtime fix.

The first live owner invitation attempts failed closed: no admission and no email. Do not claim delivery or recipient acceptance. Token settings need no further user change based on the verified reads; successful live policy update remains to be proven after the runtime fix.

### Next release steps

1. Read final CI failure details (local `work/invite-runtime-ci-failed.log`, or fetch the run). Confirm only the waived failures and exact head. Recheck current main and PR diff. Merge #737 with the repository's normal merge method if still within the authorized focused release scope.
2. Fetch the merge commit. Build from that main commit using `tools/release-pages.mjs --profile cloud-staging`; compare packaged payload to `work/invite-runtime-release`, allowing only merge-version metadata changes. Do not deploy the current working tree.
3. Use the builder's `--commit` path to write `release/cloud-staging`, then push that branch. Cloudflare Workers Builds deploys it. Inspect build result and authenticated `/version.json`; a successful push alone is not deployment proof. Preserve staging's current secrets and D1/DO bindings. Do not advance production.
4. Run the prepared live tests below once. They send real, authorized test messages. If execution partially succeeds, inspect saved results/outbox before retrying to avoid unnecessary duplicate mail.
5. Verify provider delivery, then have Rob authenticate the separate recipient browser. Do not retrieve OTPs, impersonate the recipient or reuse the owner's identity to claim a second-user pass.
6. Record screenshots with IDs, exact checks and release source in ROB-10/ROB-72. Only announce ready when the defined invitation/share/playable-deck journey passes; list any remaining limitations.

### Local test assets and commands

All following `work/` data is ignored, private, and available only on this machine. Ask Rob for the necessary session/access if Claude Desktop runs elsewhere. Never commit authentication files or raw game records.

- `work/staging-owner-auth.json`: authenticated Playwright owner storage. Treat as a credential. `work/staging-owner-check.mjs` checks validity without exposing it.
- `work/staging-current-deck-manifest.json`: verified six-deck source/checksum. Owner library revision 37 was last confirmed. Re-read if the profile has changed.
- `work/staging-sharing-live.mjs`: real owner UI invite, registered-user Share Deck, Email Deck, public Reviewer preservation, owner checksum unchanged; writes `work/staging-live-results.json` and ID screenshots.
- Set `CM_TEST_RECIPIENT` to the previously designated address supplied directly by Rob; set `CM_EXPECT_SOURCE` to the deployed main SHA; run `node work/staging-sharing-live.mjs`.
- `work/staging-invitee-login.mjs`: opens a separate visible Chrome profile, waits for Rob's email-code sign-in, checks the actual account, privately saves `work/staging-invitee-auth.json`. Launch after admission succeeds. Tell Rob to enter the newest code in that browser, not in chat.
- `work/staging-invitee-checks.mjs`: recipient sees six current Shared Decks, correct commanders, Reviewer UI and API write refusal, and a profile with no library import.
- `work/staging-invitee-lobby.mjs`: owner creates a two-human verification lobby; recipient claims the intended seat, sees all six validated decks and chooses the partner deck without importing cards. Writes the test table ID in `work/staging-lobby-results.json`; it leaves an unstarted test lobby. Account for that artifact; do not invent a deletion endpoint.
- `work/verify-live-versions.mjs`: authenticated staging/production version readback.
- `work/verify-access-invite-token.ps1`: safe local token/read verification; prints only status and numeric error codes.
- `work/staging-live-shots/`: screenshots. Prefer the masked images; `failure.png` may contain a recipient address and must not be published as-is.
- `work/compare-invite-runtime.mjs`: candidate comparison to prior release. Adapt only version metadata expectations for the merge build.

Owner/recipient addresses are omitted from this public handoff and were not added to Linear. Ask Rob to supply the designated second address directly in the new session; do not guess it. Browser helpers use Playwright at `C:/Users/robmi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js` and Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Adjust paths only if the next environment differs. The local acceptance server may still serve the candidate on port 4394; the user's Babylon preview is on 4391. Do not kill the user's preview when cleaning up test servers.

### Infrastructure facts

Outbound mail is **Resend**, sender **CrankMagic <invite@crankmagic.com>**. Do not revive the abandoned Cloudflare Email Sending purchase path. The domain is verified. `RESEND_API_KEY` and `ACCESS_INVITE_TOKEN` are staging Worker secrets. The outbox preserves idempotency, bounded retries and a 23-hour cutoff; provider acceptance is distinct from delivery and from recipient sign-in. Query the D1 outbox by the saved test job IDs to find Resend message IDs, then check those messages through Resend. Do not scan unrelated mail.

Migrations 0003–0005 are already applied to staging. Admission updates only the configured reusable invitation policy, preserves rules, requires one attached app, uses a D1 lease and reads back before mail. No per-user policies or broad allowlist bypasses. Resource IDs are in the generated staging configuration; verify rather than copy production values.

Automatic approval review rejected (a) a settings query that could expose a plaintext token, and (b) enabling full tracing that could capture sensitive request data. The safe binding-name/type check succeeded. Full tracing remains disabled. Existing operational logs intentionally omit request headers and private data (`docs/ops.md`). Do not retry the rejected methods through another tool. A prior recurring release automation was also rejected and was never created; continuation is supervised, not an assumed background deployment.

## Six decks and engine boundaries

The correct decks come from the current **staging profile**, not the old bundled six/seven-deck fixture. Last verified D1 Tymna the Weaver + Kraum, Ludevic's Opus; D2 Chulane; D3 Kiora of Salt and Sand; D4 Felothar; D5 Teysa Karlov; D6 Krenko. All are complete 100-card lists. Six owner-backed public Reviewer shares were seeded with a revision/checksum guard. Their presence is proven; actual new-recipient play selection still awaits the release test.

Fable's branch was last fetched as `claude/admiring-franklin-58cxy4` at `98a36aba`; fetch again before relying on it. ROB-12 handles floating/multiple mana options and commander tax; ROB-13 handles conservative auto-pass and explicit Yield turn. Do not port the older broad-UI commander patch over newer engine work. Tax counts each commander's prior casts from the command zone, not deaths; generic +2 per prior cast, partners separate. Yield turn auto-passes priority through the current opponent's turn but preserves required choices. Luke's missed second card effect remains unidentified: obtain the protected game record, do not guess the card.

The UI consumes `CrankRoomView@1` (`docs/ui-lane/gameplay-anchor.md`). Request missing projections through ROB-11 and ACTIVE. Engine decisions remain authoritative for castability, mana payment, targets, blockers, draws, triggers and priority. Preserve old replay behavior through engine versioning. Public rendering events must not expose private hands.

## Play and renderer continuation

Read `docs/play-overhaul/PLAYTEST-PLAN-2026-10-15.md`, `REQUIREMENTS.md`, `LINEAR-BACKLOG.md`, `ui-prototypes/babylon/README.md`, and the earlier `docs/handoff-fable-engine-2026-10-16.md`. Latest direct user decisions override older document/prototype text.

Babylon prototype: `ui-prototypes/babylon/`, introduced at `36bb9446` on the broad UI branch. It reads a projected recording (initial frame 14/42), not a live room. Real meshes support pickup/settle, bounded within-section drag/snap, local tap/untap, inspect/return, keyboard and emulated touch, pinch/pan/zoom, shared card/mat perspective, reduced motion, opponent hand backs and existing silent Volcano background. Source state is unchanged. Prototype taps do not pay mana or send game actions. Physical phones/Safari, battery/performance, live-room wiring and final art quality remain unproven.

Run the prototype and its checks per README. Existing proof: `node ui-prototypes/babylon/interaction-checks.mjs` with UAT_PLAYWRIGHT, UAT_CHROME, GEOMETRY_REQUIRED=1. Screenshots: `docs/play-overhaul/screenshots/babylon-*.png`. The current wood surface remains prototype art; generated backgrounds cannot substitute for interactive table/card meshes.

Latest requirements to preserve:

- Mobile: one fixed **Focused** view, no view switch; usable portrait and landscape. Desktop: Full/Table/Focus share header/profile/drawers/modules; switching belongs in **Camera** in all views, Tilt only in Full. Table/Focus drawers resize. Broad shell implementation exists locally but is not fully accepted or deployed.
- Physical interaction: picking up, looking at, moving and tapping cards should feel direct. Distinguish inspect/select/commit. Mats and cards share perspective; independent card angle can make cards stand up without arbitrary warping. Server acceptance controls game facts; local visual moves do not change rules.
- Camera sliders reach both ends; 0 degrees is flat, tilt up to 60 and default 40. Later zoom feedback requires a comfortably readable middle/upper-middle and an intentionally oversized maximum; do not treat the transcribed “800x800” as a pixel requirement. Keep camera stable through normal updates.
- Hand: no container, bottom edge flush/slightly clipped, overlap board front, fan up to seven with endless carousel arrows. Other viewed seats show their hand backs, never the owner's hand or private faces.
- Battlefield: creatures, then artifacts/enchantments, then lands; remove section headers. Library/graveyard/exile/commander right in 2x2 or 1x1. Support reorder within designated sections, preserving attachments and identities. Opponent name/commander share a bar; life uses a small top-left 80%-transparent black backdrop.
- Drawers: modules selectable Left/Right/None in profile Settings; drag/keyboard order saved per profile. No Add module/Restore default footers. Compact edge-attached handles. Drawers extend through hand area; Camera moves with right drawer. Screen View moved to Camera supersedes earlier module placement. See ROB-19 and sources for all module choices and Actions popup routing.
- Stack: one card pile with edges and animated cycling; clickable ordered name/player list beside it, image same size as Card Preview. Visual cycling never changes resolution order. Required decisions get clear central prompts with inspection and authoritative submit actions.
- Mana: highlight usable sources, manual tapping plus Confirm cast; offer Auto-pay. Never silently spend optional life/sacrifices or double-count flexible sources. Commander casting uses the same legality/payment path and a small tax badge.
- Draw: explicit Draw card acknowledgment, deduplicated; honor untap/no-priority rules and legal upkeep/post-draw actions. Combat: shared attacker/defender images and assignments, eligible blocker highlights, Take damage, confirm; retain response windows and accessible fallback until full parity.
- Host selects independent Background/Table skins; supplied Volcano video has audio stripped. Reduced motion, posters and local quality fallbacks. Chat and later voice chat remain backlog. Authoritative Round/Turn projections are still requested.
- Account/sharing, game logs, modern Play entry, Human/AI seat setup with Easy/Normal/Claude, invitations, profiles and Settings are in ROB-14's children. Public/explicitly shared decks must appear as playable choices with Reviewer/Collaborator permissions enforced server-side.
- Rob canceled the HTML UAT document. Provide behavior evidence and ID screenshots instead; he plans to transcribe playtests.

## The design-feedback-refine loop

1. Pick one small issue with a concrete player outcome. Inspect current live/prototype behavior and the source of truth before proposing a change.
2. Use the appropriate reference/prototype tools below. Provide a working local preview and desktop/mobile screenshots with stable object IDs after visible updates. Maintain prior T/M/D IDs; identify new objects consistently. Do not use private real hands in external design tools or public screenshots.
3. Capture each of Rob's responses in Linear. Apply it to the existing issue or create a linked issue; clearly supersede the previous interpretation. Ask only where a consequential decision cannot be inferred, and continue independent work.
4. Implement the interaction, including loading/error/empty, keyboard/non-drag input, reduced motion and stale/server-rejected decisions. Test meaningful outcomes and negative cases, not only selectors mirroring implementation.
5. Return updated ID screenshots and a usable preview. Record what was tested versus assumed, get feedback, then release a bounded accepted increment. Do not silently bundle unrelated engine changes.

## Tool access to request from Rob if missing

Connections in Codex do not automatically transfer to Claude Desktop. Use existing accounts and projects; ask Rob to connect official integrations or supply access through local credential storage. Never ask for secrets in chat, buy duplicate plans, or assume a paid web plan includes API credits.

| Tool | Appropriate use / current limits |
| --- | --- |
| GitHub + local Git/gh | Source, PRs, CI, review and exact release commits. Existing authenticated gh is at `C:/Program Files/GitHub CLI/gh.exe`. |
| Linear | Canonical feature backlog, ownership, feedback, dependencies and proof. Use ROB-14/ROB-71; keep ROB-11 current. |
| Cloudflare MCP + Wrangler | Inspect/update exact staging resources, D1, Access, builds. Installed Wrangler 4.139.0: `C:/Users/robmi/CrankMagic/workbench/cloudflare/node_modules/wrangler/bin/wrangler.js`. Use schema discovery first. |
| Resend | Transactional mail from invite@crankmagic.com; inspect specific delivery results. Existing connector/credential access may need reconnecting in Claude. Do not recreate keys gratuitously. |
| Supabase | Paid credits and connection available; ROB-68 evaluates Auth/profile/deck storage. No wholesale migration authorized by the mere connection. Retain current authoritative rooms during evaluation. |
| Playwright + Chrome | Browser interaction, API checks through genuine authenticated contexts, screenshots with IDs. Physical mobile acceptance is separate from emulation. |
| Babylon.js | Approved actual 3D interaction prototype. Preserve live rules/room as authority; migrate incrementally with fallback. |
| Mobbin | Curate compact, annotated interaction references for mobile play, drawers/Camera, sharing and profiles; adapt behavior, not branding. |
| Magic Patterns | Prototype surrounding HUD/flows from current tokens and sanitized states; export with HANDOFF.md, integrate deliberately. Generated React does not authorize a framework migration. |
| Runway Pro | Offline environment motion production and approved exports. No callable Runway integration was established here; use its UI/export if needed. Web subscription and API billing are separate. |
| Higgsfield Pro | Connected image/video concept and alternate asset generation. Verify credits; compare small batches, keep masters/provenance outside public repo, ship optimized silent derivatives. |
| Jam | Private reproducible bug reports with build/object IDs and sanitized diagnostics. No raw requests, credentials, private hands or game records in public GitHub. Mobile capture needs verification. |
| PostHog | Explicit staging usability/performance events, US region, anonymous IDs, no sensitive payloads; dashboards and presentation flags. Integration remains backlog, not proven merely by connection. Broad autocapture and live canvas replay off initially. |
| Cursor | Paid optional development/review environment. Not a runtime dependency and no assumption that its context automatically transfers. |
| Grok Bots | Rob says they have project history. Opus may delegate bounded independent tasks after reconciling that history with current GitHub/Linear evidence. |

## Grok delegation without ownership collisions

Opus is the temporary coordinator/release owner. Do not assume a Grok bot can see this chat or another platform's tools. Send the GitHub handoff link, relevant Linear IDs, exact base SHA and a small task with acceptance and exclusions. Record the assignment before work starts. Prefer read-only code/test review, sanitized Mobbin/reference research, device-matrix test design, or a separately owned UI component. A bot may implement only after exclusive file scope and branch are agreed. Do not delegate live credentials, Access policy changes, deployments or overlapping engine files by default.

Require each return to include branch/commit, PR, changed files, checks actually run, negative proof where relevant, screenshots and unresolved risks. Opus reviews and integrates; bots do not merge/release concurrently. Use existing engine ROB-71 work rather than duplicate it. Escalate conflicting interpretations to Rob with a concrete comparison.

## Local checkout caution

At handoff the checked-out branch is `codex/ui-playtest-plan-oct15`, HEAD `ebb1dfd4` (backlog documentation checkpoint). The runtime changes are visible as uncommitted edits here but are already preserved on pushed focused branch `codex/invite-runtime-oct17` at `fd152c64…`. This layout resulted from alternate-index focused commits to avoid mixing unfinished UI into the release. Do not mistake these copies for missing unpublished source or overwrite them blindly.

Unrelated work to preserve: modified `collection-model.js` and untracked `assets/audio/bgm/bgm_combat_main.mp3`, `bgm_game_main_a.mp3`, `bgm_game_main_b.mp3`, `bgm_instant_main.mp3`. Do not stage them into this release. The broad UI branch has existing conflicts in board JS, stage CSS, ACTIVE, the older handoff and asset hashes when merged with main. Resolve deliberately in a future UI integration, not with blanket ours/theirs.

## Handoff back to Codex when usage resets

Create a dated `docs/HANDOFF-TO-CODEX-<date>.md` and update ACTIVE plus ROB-11 before stopping. Push all owned work to named branches and leave unfinished work in draft PRs; preserve unrelated files. Include:

1. Exact main, staging and production source SHAs; PRs/branches, CI runs and any narrowly authorized exceptions. Deployment proof and rollback target, not only commands attempted.
2. What is complete, what is local-only, what is blocked and why; the command/result proving every material claim. Include recipient sign-in and actual delivery separately.
3. Every Rob feedback item received, its latest accepted interpretation and Linear ID; screenshots/preview URLs, design exports, assets and tool workspaces. Explicitly flag rejected/superseded directions.
4. Current engine/room contracts, schema/migration changes, ownership agreements, Grok assignments and still-running sessions. No credential values or raw private records.
5. Working-tree state, unrelated changes, private local artifact paths, environment prerequisites and cleanup still needed. List any account/config changes outside Git so the next deploy cannot silently undo them.
6. Ordered next actions and remaining acceptance tests. Do not mark issues Done without the evidence required by their lane.

Then agree the restored ownership in ROB-11: **Codex = UX/UI, Play presentation, renderer integration and access/user management; Claude = engine, simulation, card loads and AI enablement**. Separate AI Coach UI from AI/engine backend work and agree shared files. Grok continues only in explicitly assigned bounded tasks. Do not silently hand two agents the same files. Give Rob one concise handoff message with the GitHub document, Linear coordination link and any required action.
