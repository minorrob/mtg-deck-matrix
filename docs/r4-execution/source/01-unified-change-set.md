# CrankMagic r4 execution: unified change set

**Date:** 2026-10-26. **Repo:** minorrob/mtg-deck-matrix. **Read against:** `main` f2e00ba4 (#886); production 9ca99e5 (Satoshi / Young Serif, four old palettes).
**Sources merged here:** (1) the CrankMagic Design System r4 (artifact 9UgQNo8Mgz3GXJJ3jpW8x4: README, tokens.json, components, Reference image "Concept B · Table Companion"; template handoff `claude/crankmagic-design-template-r4-2026-10-25.md`); (2) the UX audit (`crankmagic-ux-walkthrough.html`: findings F-001…F-129, remediations R-01…R-33, proposed frames W01–W18); (3) the Play UX requests RQ-01…RQ-11 (PR #887 intake) with Rob's rulings D1–D21 and C1–C-A8 of 2026-10-26; (4) Rob's new standing rule RQ-12 (a cancel or undo on every screen up to and including the final confirmation).

Every change below carries one ID (`CH-nn`), a tier, its sources, and the session that owns it (`00-task-list.md`). A session builds only the CH rows assigned to it.

## 0. Rules every session inherits (from the Design System r4 and AGENTS.md)

- **Palette:** Sapphire & Obsidian is the system; Bronze & Basalt and Chalk & Coal are color-only skins. Six themes: `dark`, `light`, `bronze-dark`, `bronze-light`, `chalk-dark`, `chalk-light`. Three planes (`color-bg`, `color-panel`, `color-raised`; a control is always lighter than its panel). Five colors, five jobs: sapphire = the one button to press (`color-accent`, one per screen); gold = money and decisions (`color-money`, `color-decision-*`); crimson = missed or remove (`color-required`); emerald = owned (`st-inbox`…); obsidian = ground. Ordered is aether teal, never sapphire. The old palettes (Brass & Slate, Felt & Cream, Moss & Iron, Steel & Cobalt) are removed; the old names survive only as aliases (`surface-page`, `surface-card`, `surface-control`, `border-default`, `action-primary`, `action-primary-text`).
- **Neutral chrome:** no mana color owns the frame or the table; color arrives with the cards and the commander's tints (`mana-*` mixed 22% into `color-panel` on a deck's surfaces only).
- **Type:** Cinzel 600 names things (page `h1` 40px, `hero` 56px, the deck title). Lato does everything else (`h2` 24/700, `h3` 18/700, `section` 14/700 spaced capitals with an icon, `reading` 16, `body` 14, `control` 14/700, `small` 13, `label` 12 uppercase, `figure` 32/700 tabular). Board: `hud-vital` 28, `hud` 18, `hud-caption` 15, each × `--hud-scale` (1, 1.25, 1.5, 2). Barlow Condensed 800 italic is the neon callout only. Nothing under 12px. **The CrankMagic wordmark (Oxanium subset in `color-aether` beside the gear logo) is unchanged; Cinzel never sets the app name.** American English.
- **Play happens on the Study** (`cm-study`: walnut, lamp light, charcoal felt per seat; Rob's mats replace it on choice), with the **drawers**: left = the decision (Actions), right = the stack and history; each folds to a labeled tab with a count; bottom sheet on a phone; **a decision is never hidden** (folded → `DecisionSlot`, top center).
- **Selection is ink** (a white ring and a check on the table; `aria-pressed` inverts to `color-ink` in chrome). The accent is never a selection or a status.
- **Decisions read as a sentence:** the spell, the task sentence, the step (only when there is more than one), the pick, "If it resolves: …", then one primary and one way back.
- **Controls:** `control-height` 40, `control-height-lg` 44 (touch primary), compact 32, fields 42, checks 20; radii control 8 / card 12 / tile 16 / pill; focus = 2px `color-aether` ring 2px out, never removed; motion 160ms `cubic-bezier(.2,.8,.2,1)`, no rotation or bounce, reduced motion turns it off. (RQ-10's 30° tilt of a tapped card is a state, not a transition: it may animate under 160ms and must be instant under reduced motion.)
- **Art wherever a card is named** (hover pop-up via `data-peek-card`); status = glyph + word + hue, never hue alone.
- **AGENTS.md:** red-first test, `docs/ACTIVE.md` note, `tools/local-ci.sh`, one green Actions run; symbols first, words last; the UI reads `CrankRoomView@1` and never edits `game/` or `cloud/` (engine needs go to the Requests table in `docs/ACTIVE.md`; the Engine lane lands them first); hidden information stays hidden; a test that cannot fail is a comment; every board item states its behavior in Full, Table and Focus and on the phone layout.
- **For this program, branches do not merge to `main` themselves.** Each session opens its PR against `integration/r4` and stops; the merge session (M) consolidates (see `00-task-list.md`).

## 1. RQ-12, the new standing rule (Rob, 2026-10-26)

> "We should always have a cancel or undo button in every screen leading up to and including the final confirmation before a card can no longer be undone, or its action can be undone."

Specification (board-side unless noted):

| Screen in the action flow | Way back it must show | Meaning |
|---|---|---|
| Choose an action (priority list, card menu) | none needed (nothing started) | – |
| Ways / modes / "may" prompt (W14-style single action, modal choice) | **Cancel** | abandon the action; nothing sent |
| Targets (W15, grouped by player) | **Cancel** (and **Back** when a prior step exists) | abandon the action; the spell stays in hand / the ability unstarted |
| Costs (sacrifice, X, divide, mana pool, waterbend) | **Back** + **Cancel** | Back returns to targets with the selection kept |
| Final question screen (W01–W04: verb primary) | **Change target** (back) + **Cancel**; for an optional ("may") effect the Cancel reads **Don't [verb]** | declines the effect; the spell still resolves (may) or is abandoned (cast not yet sent) |
| After the binding press, while the engine's window holds (RQ-06.2 / D15) | **↶ Undo** in the hover drawer on the card (W14, W16) and on the stack entry | rewinds the play, untaps its mana; shown as "undone" in every seat's log |
| After the window closes (another player acted, something revealed, a random outcome, the step moved on) | nothing | the action can no longer be undone |

Rules: the way back is always the secondary button beside the one primary (`cm-decide-actions`: primary, then "one way back"; a third quiet button only for Cancel when Back is also present). Escape triggers the way back (C-A7 order: menu/dialog → focus back → Table menu). Blockers: **Don't block** and a second click on a chosen blocker are the way back per attacker (RQ-05.4a/d); **Send blockers** is the binding press. Attackers: **None** / unpick. Keep and mulligan: Mulligan is the way back. The room keeps every draft board-side until the binding press (as today), so Cancel never needs the engine; Undo after the press is the engine's window (CH-57).

## 2. Where the Design System and the earlier decisions disagree, and how it resolves

| # | Between | Resolution |
|---|---|---|
| X1 | DS Drawer decision format (spell · task sentence · step chips · pick · consequence · primary + way back) vs RQ-08 (title removed, affected card large, "[Verb] [Player]'s [Card]?" under it, no second step) and RQ-01.1 (compact source → effect → target row) | W01 is the DS decision block: `cm-pick` for "Your spell" = the compact source row (art, name, type line, controller chip) with the effect verb and the target's controller (RQ-01.1 r2); the `h2` sentence = the RQ-08.3 question once a target is chosen ("Exile Maya's Grizzly Bears?"), the engine's "choose one target …" sentence before one is chosen (W15); step chips only when the decision has more than one step; the target `cm-pick` is the large affected card (RQ-08.1); `cm-consequence` "If it resolves: …" stays (DS principle 7; it is the one line W01 lacked); `cm-decide-actions` = the verb primary + Change target + Cancel (RQ-12). "Confirm target" in the reference becomes the verb. No second Confirm/Clear step (RQ-08.4, C2). |
| X2 | DS "selection is ink" vs RQ-05.3 tile states (gold glow, green ready, red refused) and W08's green chosen tiles | Tile states are status, not selection: hue + border + word stay (W07). Chosen blocker tiles (`aria-pressed`) invert to ink per DS, not green. The selected target on the table is the white ring and check. |
| X3 | DS "one primary per screen" vs the combat desk (per-attacker Confirm) and strip (Send blockers) | Send blockers is the sapphire primary; the per-attacker Confirm (D12, Rob's label) is a secondary with tooltip "this attacker only". |
| X4 | DS Drawer fold (whole drawer → tab) and `cm-disclosure` groups vs RQ-03.5 (click any module header to collapse it) | Both: the Actions drawer folds to its tab (decision moves to DecisionSlot, never a pulse-only cue, which supersedes R-28/R-30's pulse as the primary cue; D8's pulse stays on the tab); Boards, History, Coach are `cm-disclosure` groups whose whole header toggles (RQ-03.5, W13). #886's height grips stay. |
| X5 | DS HudScale (Camera + Settings, follows the account) vs R-26 (Settings › Play, CSS variable, per device) | DS wins: `--hud-scale` on the board root, segmented control in Camera and Settings, stored with the account. |
| X6 | DS Camera menu (view segmented, HUD segmented, sliders with values) vs R-28's slider fixes and RQ-09's Spacing slider | DS layout + the Spacing slider (default flush, D19). |
| X7 | DS Toast (success inverts, Undo stays while it applies; errors never time out) vs F-003 (update toast), F-064 (Share toast) | Apply the DS toast everywhere; Share still needs its feature (R-20). |
| X8 | DS felt `mat-felt #2b3a2c` (greenish, "fixed") vs the Study's charcoal `table-felt #292724` | The Study is the default table; `mat-felt` remains only for the legacy mats. No green on the default table. |
| X9 | Audit design-section Prompts A and B for Claude Design | Superseded by r4; the walkthrough section stays as the record of what was wrong (contrast, h1 contradiction, divider contrast) and r4 fixes all three. |
| X10 | DS Dialog (Escape closes, Enter confirms the primary) vs RQ-12 | Compatible: a decision is not a dialog; in a dialog the close/Cancel is the way back. |
| X11 | DS "no rotation" motion rule vs RQ-10 (tapped copy tilts 30°) | The tilt is a resting state; the transition to it is ≤160ms, none under reduced motion. |

## 3. The unified change register

Tier: **C** critical (the program fails without it), **I** important (the refined play experience depends on it), **M** meaningful (polish the design system makes cheap). Source: DS (Design System r4), F-nnn / R-nn (audit), RQ / D / C (requests and rulings), RQ-12 (new rule). Session codes are in `00-task-list.md`.

### 3.1 Foundation (session S0)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-01 | C | Land r4 on `main`: `pr/apply-r4.mjs` (tokens for six themes, three skins, aliases for old names, type scale, self-hosted Cinzel/Lato/Barlow/Oxanium, service worker, notices); remove the four old palettes and Satoshi/Young Serif; `tests/design-tokens.mjs` (194 checks) and `tests/type-final.mjs` (Cinzel/Lato) green in the repo's browser runner | DS, template | audit design section: on-accent 3.86/3.98:1 → 5.32/8.79:1, divider ≥1.3:1, h1 contradiction (h1 40, hero 56) |
| CH-02 | C | Theme switch exposes the six themes (skin × register) in the Account menu's Skin group with Dark/Light/System segmented control; `data-theme` carries `dark|light|bronze-dark|…` | DS AccountMenu | F-107 (menu grammars), P57 theme list |
| CH-03 | C | Wordmark untouched; gear logo at 28–52px beside it; Cinzel never on the app name (assert in `type-final`) | DS | – |
| CH-04 | C | Create `integration/r4` from `main` after CH-01 merges; every program branch forks from it | program | – |

### 3.2 Play: the decision desk (session A)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-10 | C | DS decision block in the Actions drawer: `cm-pick` spell (art, name, type, controller chip), `h2` sentence, step chips only for multi-step decisions, `cm-pick` target as the large affected card, `cm-consequence`, `cm-decide-actions` | DS Drawer, X1 | F-088, F-117, F-127 |
| CH-11 | C | One target (W01 r2): compact source → verb → target's controller row at ¼–⅓ desk card; large affected card; "[Verb] [Player]'s [Card]?" ("your", "this", 's after s); verb primary carries commitReview's revision guard and sr-only live region; Change target; Cancel / Don't [verb] for "may" | RQ-01.1, RQ-08.1–8.4, D1, D17, D18, C1, C2, RQ-12 | F-127 |
| CH-12 | C | Many targets (W02–W04): quadrants, source top-left for 1–2 groups, centered at 3, pager past 3; stacks with ×N, four visible layers, click/Enter/Space cycles with 250ms slide (crossfade under reduced motion); summary question | RQ-01.2, D2, D3, D4 | F-117 |
| CH-13 | I | Targets grouped by controller, You last, Lands folded inside each player; grouping replaces the "(Keith's)" suffix (sr label keeps it); hover pops the card; same for bounce, tap, gain control; Next / Cancel as compact text-style buttons | RQ-07, D16, W15 r2 | F-126 |
| CH-14 | I | Single-action cards: no option row; the primary is named for the action (Play Card / Cast Spell / Activate); no "Select an option to review it" sentence | RQ-06.1, W14 left | F-088 |
| CH-15 | C | RQ-12 on every desk screen: Cancel on ways/modes/may, Cancel + Back on targets and costs, Change target + Cancel on the question, Don't [verb] for may; Escape = the way back | RQ-12 | – |
| CH-16 | I | Drawer copy rules: sentence case, verbs with counts, no instructional paragraphs; "Actions" appears once (the drawer tab); the top-right toggle is the drawer's chevron | DS content, F-085 | F-085 |
| CH-17 | M | Option buttons at `control` 14/700, 40px; the inspector opens from the card's 🔍 row or right-click, never the primary click (D5: single click = inspect/menu) | DS Button, D5 | F-089 |

### 3.3 Play: combat (session B)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-20 | C | Strip "Combat · blocks": attacker tiles with three rows (Attacking · → · defender name), defender thumbs, state word top-right; states unsettled / ready / refused by border + glow + word; whole-set status line in the strip | RQ-05.2, 05.3, W05 r2, W07 | F-125 |
| CH-21 | C | One row, never wrap: thin arrows the height of a tile scroll the row; "+N more" accent subtext above Send aligned to the tiles' top; left arrow once scrolled | RQ-05.2, W06 r2 | F-125 |
| CH-22 | C | Send blockers at the far right, sapphire primary, disabled until every attacker is settled, tooltip says why; no lock glyph; private until sent | RQ-05.1, D13, X3 | F-125 |
| CH-23 | C | Desk per attacker (W08–W10): attacker already chosen; legal blocker tiles with thumb, name, effective P/T, hover pop-up, `aria-pressed` inverts to ink, second click clears; Don't block + Confirm (secondary, "this attacker only"); several blockers per attacker; a moved blocker unsettles its old attacker; removed text per RQ-05.4b/d/e/f | RQ-05.4, D12, D14, X2 | F-125 |
| CH-24 | I | Twins told apart by a corner mark (a, b, c) on the thumb and hover-light on the table; no visible "#486"; engine ids stay underneath | C4, D6 | F-125 |
| CH-25 | I | Attack declarations: "All at <player>" / None stay; attack-risk hints stay; RQ-12 way back = None / unpick; the declared set is a private draft until Confirm | existing #878 + RQ-12 | – |

### 3.4 Play: board display and input (session C)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-30 | C | Click map (D5): single click = inspect / card menu; double click on a card or stack = activate (tap for mana, tap ability → Actions lists it, cast); double click on the just-tapped card = untap until the mana is spent or the tap is undone; undoing a card untaps the lands it used; double click on empty board area = focus that board (RQ-02); no 300ms single-click wait; the card menu row stays the single-tap path on touch | D5, C3, RQ-02, D21 | F-118 |
| CH-31 | C | Undo hover drawer (W14 right): a 65% black band one 11–12px line tall slides up from the card's bottom edge on hover for a card played this step; "↶ Undo" rewinds and untaps; hidden once locked in; same on a stack entry; "undone" in every seat's log | RQ-06.2, D15, RQ-12 | F-088 |
| CH-32 | C | Identical lands as one stack (W16 r2): `sameKey` identity; count drawer "×N · n untapped" flush to the top card's bottom edge (`hud-caption` × scale); a double click taps the next untapped copy; a tapped copy tilts 30° (≤160ms, none under reduced motion), never 90°; never splits; a differing copy sits beside the stack; whole stack untaps in the untap step | RQ-10, D20, X11 | F-128 |
| CH-33 | I | Lands / battlefield divider (W17): a 1px line with an invisible 8px hit area, a `grip()` call; keys; double-click reset; per device, per view; 3D maps the drag; applies to a focused opponent's board | RQ-11, D9, C6 | F-129 |
| CH-34 | I | Camera menu per DS: View segmented (Table, Focus, 3D), HUD text segmented (100/125/150/200), sliders with values beside labels at 13px, Spacing slider (gaps → flush → overlap, default flush, one value for rows and columns, per device, opponents' boards too) | DS CameraMenu, RQ-09, D19, X6 | F-092 |
| CH-35 | I | Opponent focus affordances: 'View AI's board' link (14px tall) and ⤢ Focus (59×24 at 11px) become 32px+ controls in `hud-caption`; the Boards list row focuses on single click | F-118, RQ-02 Proposed | F-118 |
| CH-36 | M | Play surfaces fixed colors: `mat-scrim`, `mat-ink`, `callout-*`, card face/back tokens; the Study replaces the green `mat-felt` default | DS, X8 | – |

### 3.5 Play: shell, Study, drawers, HUD (session D1, lands before A/B/C/D2)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-40 | C | Study table: `cm-study` on the board root (wood, grain, lamp light, shade), `cm-mat` per seat (charcoal felt, inset edge); a chosen playmat replaces it; selection on the table = white ring + check | DS Study | – |
| CH-41 | C | Drawers: left Actions (decision, then Boards `cm-disclosure`), right Stack + History (+ Coach as a disclosure); 32px spine tab with chevron (`aria-expanded`, `aria-controls`), folded = labeled tab with count at the screen edge; bottom sheet on phone; #886 grips kept; module headers toggle (RQ-03.5, W13 r2: 28px headers, 22px buttons); no six-dot handle | DS Drawer, RQ-03.4, 03.5, D8, D11, X4 | F-087, F-091, F-098, F-119, F-122, F-123 |
| CH-42 | C | DecisionSlot top center in every view: when the Actions drawer is folded the decision renders there (question, help line, choices as secondary, chosen inverts, one accent primary, the way back); phase strip above it; × `--hud-scale` | DS DecisionSlot | F-086, F-091, F-098, F-100 |
| CH-43 | C | SeatHeader shared by 3D, Table, Focus: portrait in brass ring, name, commander, life at `hud-vital`, poison, hand count, state word; turn = aether ring on the portrait, priority = aether dot; low life turns harm red; `cm-seat--stack` for corners; DOM order identical across views | DS SeatHeader | F-084, F-101, F-102 (strip rows) |
| CH-44 | C | HudScale: `--hud-scale` on the board root from Camera and Settings, stored with the account; every HUD size = token × scale; 200% keeps the top bar on one line at 1440 | DS HudScale, X5 | F-084, R-26 |
| CH-45 | C | Table menu (R-25): Concede (two-step), Leave table, End game for everyone (host, two-step, keeps the record), Table rules, Help; Escape order per C-A7 (menu/dialog → focus back → Table menu); app shell inert under the board; no footer link in the tab sequence | R-25, D7 | F-082 (P0), F-083, F-087 |
| CH-46 | I | Opening hand and center decisions through DecisionSlot: Keep primary / Mulligan way back; Pass never rendered disabled in the center | R-26 | F-086 |
| CH-47 | I | Neon callouts (your turn, an attack on you, a big swing) in Barlow Condensed via `callout-*`; one at a time; reduced motion without the glow; lobby countdown: table dims, 72px figure, sound | DS NeonCallout, R-26 | F-081 |
| CH-48 | M | Top bar: turn number and priority at `hud`, phase strip at `hud-caption` with the current step inverted to ink; "Actions · choice pending" label retired (DecisionSlot carries it) | DS, F-084, F-085 | F-084, F-085 |

### 3.6 Play: views and Coach (session D2)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-50 | I | Table view: panel open on a pending choice or DecisionSlot carries it; hand thumbnails ≥110px at 1440; legend labeled once ("castable now / in hand") with tooltips; life dial gains seat labels, active-seat glow and priority text | R-30 | F-098, F-099, F-100 |
| CH-51 | I | Focus view: "Other seats" strip (SeatHeader stack form, counts only, never hands) with Focus buttons and double-click focus; All seats + prev/next in the header; "n mana open · land drop used" into the seat header at `hud-caption` | R-31, RQ-02 | F-102 (P1), F-103, F-104 |
| CH-52 | I | Coach section in the right drawer: one 36px line "CrankMagic Coach" (`cm-section-title` style), no subtext, shrinks on a narrow pane; "Questions to Ask" 22px line opening upward over the conversation, `aria-expanded`; 13px minimum, 30px rows; when the Coach backend is off the section says so and links Help, no textarea | RQ-03.2, 03.3, D10, R-28, W11, W12 r2 | F-093, F-120, F-121 |
| CH-53 | M | Avatar menu becomes the DS AccountMenu on the board too: You / This device / Your data / Skin / Help / Careful / Sign out; 'Play settings' vs 'Account & app settings' resolved to Settings | DS AccountMenu, R-28 | F-090, F-112 |

### 3.7 Engine (session E, lands first; others build against `integration/r4` once it merges)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-55 | C | Prepared: after the creature half resolves prepared, offer the copy as its spell half per Oracle text (timing, cost, how often); the copy is a spell, never a permanent; tests per step + breaks script | RQ-04 | F-124 (P1) |
| CH-56 | C | Per-option fields the desk needs: `effect` verb per target (W01/W02 captions), `controllerId` on every target option (already on counted targets; add to the rest), `affected` card id for the question screen, `optional` flag for "may" effects (Cancel = Don't [verb]) | CH-11, CH-12, CH-15 | – |
| CH-57 | C | Undo window (house rule, key `houseRules.undoLastPlay`, on by default until the house-rules screen arrives): a play this step is undoable while no other player has had priority, nothing else went on the stack (own triggers included), nothing was drawn or revealed, no random outcome; a land restores the land drop; mana tapped for it untaps; the log carries "undone" to every seat; built on `takeBackLand` and `untapMana` (restore from a copy, checked by hash); untap-on-undo of a card untaps the lands it used (D5) | RQ-06.2, D5, D15 | – |
| CH-58 | I | Untap a just-tapped land on a second activation while its mana is unspent (D5), as a room action, with the privacy checks | D5 | – |
| CH-59 | I | Game over files a record under each human seat's deck (date, outcome, finish turn, pod, bracket, opponents' commanders, seat) and exposes it to the results panel | R-29 | F-095 (P1) |
| CH-60 | M | Blocks: `legalBlocks` already carries menace and limits; add `reason` strings for a refused tile (W07) | RQ-05.3 | – |

### 3.8 Workshop, deck journey S0–S8 (session F1)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-70 | I | Landing: one sapphire primary in the hero; "Other ways to start" opens the New deck chooser; doors keep verbs only; labels "Decks" / "Open my decks" everywhere; update toast per DS Toast (dismiss, deferred) | R-01, DS Button/Toast | F-001, F-003, F-004 |
| CH-71 | I | Decks hub: DeckTile (art, eyebrow "D6 · Krenko", stage chip in the family of what the deck needs, bar, Play it compact), StageChips row (ink selection), live grid count; "Next" from Start-from hands off to the Lab with a toast | DS DeckTile/StageChips, R-04, R-08 | F-009, F-020 |
| CH-72 | I | Stage truth: a one-card deck is never "Playable at the table"; stage chip follows the rung counts | R-09, R-10, DS StatusChip | F-021, F-023 |
| CH-73 | C | Define the Deck validation per DS FormControls: errors under the field with the alert glyph, field edge `color-required`, never a dot on a tab; Next band says why it is disabled | R-13, DS | F-030, F-034 (P1) |
| CH-74 | I | Deck page: Cinzel deck title, Tabs (ink bar, counts), one primary per tab; Next band and header agree ("24 cards unplayable" wins over "Lock") | R-15, DS Tabs | F-039 |
| CH-75 | I | Measure report: a door back into refinement ("Fix in Explore" with the weakest axis preselected) | R-16 | F-044 (P1) |
| CH-76 | M | Explore / graph: focus ring, aether for the graph only, no accent as selection | DS | – |

### 3.9 Workshop, acquire → results → settings → admin (session F2)

| ID | Tier | Change | Source | Resolves |
|---|---|---|---|---|
| CH-80 | I | One to-buy number: Acquire, Library To buy and the deck header read the same rung counts; TableRow (48px, price in `color-money`, trailing verb, overflow) | R-19, DS TableRow | F-057 (P1) |
| CH-81 | C | Share Deck: the menu item opens the share dialog (link, visibility, copy) instead of an error toast; DS Dialog shell | R-20, DS Dialog/Toast | F-064 (P0) |
| CH-82 | I | Lock list: immediate busy state + DS toast "Locked · 46 to buy" with Undo | R-21, DS Toast | F-066 (P1) |
| CH-83 | I | Pull sheet: "Do all available (53)" confirms in a DS dialog, stats collapse, box-done moment leads to Play | R-22 | F-068…F-072 |
| CH-84 | I | New table: inline validation at the field, stable layout, one door from Play home | R-23, DS FormControls | F-073…F-077 (F-076 P1) |
| CH-85 | I | Lobby: Ready / Start hierarchy (one primary), AI seat auto-deck, one deck list; countdown callout (CH-47 shares) | R-24 | F-078…F-080 |
| CH-86 | I | Results: in-progress hero with Resume / Leave table; results panel from the engine record (CH-59) with Rematch / Back to lobby / Review this game; Log a game reordered and prefilled; "Mark <card> for replacement" handoff into Explore | R-29 | F-094…F-097 (F-095, F-097 P1) |
| CH-87 | I | Settings page per DS: switches with visible state, Danger zone parity (Clear all data confirms with the danger-fill dialog), history noise filtered, one label "Settings"; Confirmations dialog lists the RQ-12 way-back classes | R-33, DS FormControls/Dialog | F-109…F-115 |
| CH-88 | M | Admin panel v1 (gate, home, People and invites, Feature switches) per the brainstorm; Invite gets a list and a sent state | R-32 | F-105 (P1), F-106, F-108 |
| CH-89 | M | Tours get a door on the Help ? panel and the landing page | R-? (F-116) | F-116 |

## 4. What the Design System changes that no finding asked for (take as given)

- Every page: Cinzel `h1`, Lato elsewhere; the hero at 56px only on the landing page; section titles in drawers as spaced capitals with an icon.
- Every panel and control on the three planes with 1px lines; soft shadows; 12–16px corners; 160ms motion; aether focus ring everywhere.
- Deck surfaces tinted 22% by commander identity; nothing else carries mana color.
- Commander portraits in brass rings on the table and in the Boards list; art for every named card (Scryfall at run time).
- Status everywhere as glyph + word + hue (ten rungs, five glyph shapes); Ordered in aether, never sapphire.
- Selection inverts to ink (chips, tabs, segments, checkboxes, pressed buttons).

## 5. Out of scope here

Mana-payment panel and the Hand / Board / Other grouping (queued 2026-10-25, separate requests; CH-15 applies to them when they land); the house-rules settings screen (CH-57 and CH-34 only reserve keys); S18 post-game analysis beyond the handoff in CH-86; chat, public discovery, leaderboard.
