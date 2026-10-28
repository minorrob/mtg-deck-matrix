# Audit crosswalk

All129 original walkthrough findings, their supplied change mappings, and current bounded evidence. Local verification does not replace combined release acceptance. Workshop detail and limits: [WORKSHOP-AUDIT-EVIDENCE.md](WORKSHOP-AUDIT-EVIDENCE.md). Unmapped findings remain open. Detailed evidence and limits are in findings.json.

| Finding | Status | Changes | Original finding |
| --- | --- | --- | --- |
| F-001 | verified_local | CH-70 | Two competing 'start' doors above the fold plus four more below |
| F-002 | unmapped_open | — | 33 text nodes under 13 px on the landing page |
| F-003 | verified_local | CH-70 | 'A new version of CrankMagic is ready. Reload' appears over the hero within seconds |
| F-004 | verified_local | CH-70 | The signed-in header says 'Open your decks' while the nav says 'Decks' and the door says 'DECKS · I have a commander in mind' |
| F-005 | unmapped_open | — | Sign in is one item in a 17-row menu that also holds Reset All |
| F-006 | unmapped_open | — | Sign-in gives no feedback: the page silently reloaded into Decks |
| F-007 | unmapped_open | — | 'Term definitions on hover: On' is a toggle disguised as a menu row |
| F-008 | unmapped_open | — | Two 'New deck' entry points and a 'Bulk actions' button that is disabled with no explanation |
| F-009 | verified_local | CH-71 | 'Six decks, all playable' was stale after creating a deck: the grid did not refresh until a filter was clicked |
| F-010 | unmapped_open | — | 'New from Wizards' precon rail competes with the deck grid for the first column |
| F-011 | unmapped_open | — | Deck-select checkboxes are 18 px and only visible on hover; favorites star appears on hover only |
| F-012 | unmapped_open | — | Help '?' next to the page title opens prose |
| F-013 | unmapped_open | — | Five equal doors with no default or recommendation |
| F-014 | unmapped_open | — | Choosing a door silently creates a deck shell before anything is chosen |
| F-015 | unmapped_open | — | Four left-rail steps (Pick a commander, Choose colors, play style, mechanics) read as a wizard but are optional and never required |
| F-016 | unmapped_open | — | Next is disabled with no reason shown |
| F-017 | unmapped_open | — | Deck name field pre-fills 'New deck' and is above the commander field, so the name is asked before anything to name |
| F-018 | unmapped_open | — | Search shows one result row with no loading or no-results state |
| F-019 | unmapped_open | — | Selection is shown twice: the highlighted row and a repeated name line below it |
| F-020 | verified_local | CH-71 | 'Next' closes the wizard and drops the player on an unchanged Decks grid |
| F-021 | partially_verified_local | CH-72 | A one-card deck shows 'Playable at the table' and 'B2' |
| F-022 | unmapped_open | — | The action row offers Edit card list, Lock list, Log a game, Measure, More for a deck with one card |
| F-023 | verified_local | CH-72 | 'Playable at the table · all 1 cards known' and a 'Play this deck' button on a one-card deck |
| F-024 | unmapped_open | — | Tabs carry counts as bare numbers ('The hundred 1', 'Acquire 1') |
| F-025 | unmapped_open | — | 'Define the deck / Leave undefined' is a radio pair repeated at the top of all four sections |
| F-026 | unmapped_open | — | Radio and checkbox inputs are 13 to 16 px with a 42 px tall hit area on the label only |
| F-027 | unmapped_open | — | Budget ($) and 'Other restrictions' fields have no placeholder, format hint or default |
| F-028 | unmapped_open | — | The dialog re-centers vertically when a section changes height, so the left-rail items move under the pointer |
| F-029 | unmapped_open | — | Saltiness / Speed / Competitiveness are 1 to 5 selects with no anchor words |
| F-030 | partially_verified_local | CH-73 | Primary composition is required but shows 'Choose…' with no required marker; failure is a dot on the tab |
| F-031 | unmapped_open | — | Sixty-five mechanic chips in an unordered wall, two pre-tagged 'commander' |
| F-032 | unmapped_open | — | Three radios (Auto-create, Merge in a Group, Define later) with no description of what each does |
| F-033 | unmapped_open | — | Weighting radios (Balanced, Offense, Defense, Response, Value, Combo) wrap to two rows with one orphan |
| F-034 | verified_local | CH-73 | Validation failure is a 6 px dot after 'Gameplay' and focus on the wrong field |
| F-035 | unmapped_open | — | 'Remove' is the only action and it is disconnected from what it acts on |
| F-036 | unmapped_open | — | Card buttons carry 11 px labels; status words ('To buy', 'Bench') are 12 px under each tile |
| F-037 | unmapped_open | — | Summary bar mixes units: '63 of 63 seats filled · 36 lands · To buy $57.11 · Bench 17 · To buy 46 · Other decks 0' |
| F-038 | unmapped_open | — | No loading state while the 99 is generated; the dialog appeared after a pause with no spinner |
| F-039 | verified_local | CH-74 | The 'NEXT' band says 'Lock the list when it is settled' while the header says 'The table cannot play these yet: Bruna, Triplicate Titan, …' |
| F-040 | unmapped_open | — | Overview is five stacked panels (Next, Progress, Cost, Mana curve, Card type, Spells, How it plays, Upgrade path, About the commander, Simulation history, Record); the only two actions are at the bottom |
| F-041 | unmapped_open | — | The action-row Measure button's accessible name is 'Compare lists under the browser simulation' while its label is 'Measure' |
| F-042 | unmapped_open | — | 54 text nodes under 13 px (chip row, stat captions, definition buttons at 12 px) |
| F-043 | unmapped_open | — | Progress is a small inline pill 'Measuring… seed 2 of 6 · 73 points so far' at the bottom of the page, and the page auto-navigated to the report when done |
| F-044 | verified_local | CH-75 | The report scores (73 of 100) but offers no path from a weak check to a change |
| F-045 | unmapped_open | — | 'FIDELITY: MEDIUM · 2 cards the engine could not read played as blanks' does not name the cards |
| F-046 | unmapped_open | — | 'Back to deck' is a link styled as a button at the far right, far from the breadcrumb; the first click at a scrolled position hit the fidelity box |
| F-047 | unmapped_open | — | Groups are named 'LOADING 53 · owned, not in the box yet' and 'RESERVED 47 · committed to take a seat' |
| F-048 | unmapped_open | — | Row actions are text pills ('put it in the box', 'To buy · empty seat') that look like status, and the primary per-row action (open the card) is the whole 1,258 px row |
| F-049 | unmapped_open | — | 172 text nodes under 13 px and 79 targets under 24 px on this screen |
| F-050 | unmapped_open | — | Type-count row uses words as buttons ('Land: definition') that open glossary entries |
| F-051 | unmapped_open | — | Empty state is a sentence of instructions with no action |
| F-052 | unmapped_open | — | A tab whose only content is a paragraph and a button to another page |
| F-053 | unmapped_open | — | Three mode buttons (Navigate / Inspect / Select) plus a toolbar of Search catalog / Back / Reset view / Filters · lens, and a right pane with three tabs: the stage's one job (find a swap) is not the first thing on screen |
| F-054 | unmapped_open | — | Four 17 px '?' disclosures ('What is this universe of cards?', 'How the graph works', 'How these work') |
| F-055 | unmapped_open | — | No way back into the deck with a chosen swap: 'Add and/or buy…' adds, it does not replace a seat |
| F-056 | unmapped_open | — | Acquire is three numbers and two buttons that leave the deck page |
| F-057 | partially_verified_local | CH-80 | The deck says 46 to buy / $69.99; the To buy tab says 66; the review said $57.11; the row group says '47 records · 47 copies · $69.99' |
| F-058 | unmapped_open | — | 'Bought' is a green primary button on every row with no confirmation and a '…' menu beside it |
| F-059 | unmapped_open | — | 'Back to Play Space' is a primary-sized button in the filter row and leads to a tabletop sorting view unrelated to buying |
| F-060 | unmapped_open | — | 232 text nodes under 13 px and 96 targets under 24 px |
| F-061 | unmapped_open | — | A 'drawer' and 'sorting space' metaphor on the Library page, labeled 'Play Space' |
| F-062 | unmapped_open | — | More holds 23 items in four groups, including Measure and Share Deck which are stage actions |
| F-063 | unmapped_open | — | 'Delete deck…' and 'Archive' sit in the same group as 'Rename' and 'Share' |
| F-064 | verified_local | CH-81 | Sharing is a dead end: a menu item that produces a red toast |
| F-065 | unmapped_open | — | The toast persists for minutes and overlaps the Progress card |
| F-066 | verified_local | CH-82 | First click on 'Lock list' gave no response for several seconds; the dialog appeared only after a Scryfall check failed |
| F-067 | unmapped_open | — | The dialog states 'Locked the list of Giada deck' in the past tense before Confirm is pressed |
| F-068 | baseline_reconciled_local | CH-83 | The action row changed to six buttons and the Next band reads 'add the 53 cards you already own (Ready to add), then buy 46 cards ($69.99), and 1 more step.' |
| F-069 | baseline_reconciled_local | CH-83 | Four stat cards of 10 numbers each sit above the 100-row sheet; the formula sentence sits between title and cards |
| F-070 | baseline_reconciled_local | CH-83 | 'Do all available (53)' is the primary button and it mutates 53 ownership rows with no confirm |
| F-071 | baseline_reconciled_local | CH-83 | Rows read '— nothing comes out → PUT IN <card> · Bench · on the list, not yet in the box' |
| F-072 | verified_local | CH-83 | No 'box done' moment: after Do all available, nothing marks the deck Boxed or sends the player to Play |
| F-073 | partially_verified_local | CH-84 | Three doors (New table, Choose a deck, Set up an AI game) plus an invitation field; 'Choose a deck' is a link that leaves Play |
| F-074 | open | CH-84 | Three 'not connected yet' notices on one page (lounge chat, public discovery, leaderboard) |
| F-075 | partially_verified_local | CH-84 | Seats are laid out 4-3 / 2-You, deck select and 'Set the table' are below the fold; name is required but unmarked |
| F-076 | verified_local | CH-84 | Validation toast 'Give your name at the table.' appears at the bottom, away from the empty field, with no field marking |
| F-077 | verified_local | CH-84 | Selecting a deck inserts a line 'You bring D6 Krenko to seat 1' above the seats, shifting the layout and moving the button under the pointer |
| F-078 | partially_verified_local | CH-85 | 'Ready' is a small 12 px button among Change deck / Choose mat; the Table rules card with Start sits in the middle of the mats |
| F-079 | verified_local | CH-85 | AI seat says 'Pending · Choosing a deck' with a green 'Choose its deck' button: the host must choose for the AI |
| F-080 | verified_local | CH-85 | The chooser lists 'Shared decks' and 'Your library decks' with the same decks appearing in both under different names (D3 Kiora vs D3 Kasmina, D5 Teysa Karlov vs D5 Shadrix) |
| F-081 | pending_verification | CH-47 | The countdown is a 24 px number inside the rules card; the seats do not change |
| F-082 | pending_verification | CH-45 | There is no way to concede, leave the table, or end the game from the board |
| F-083 | pending_verification | CH-45 | The app sidebar (Decks, Library, Explore, Play, Menu) and the legal footer remain in the DOM under the board, focusable but hidden |
| F-084 | pending_verification | CH-43, CH-44, CH-48 | Vital numbers are 12 px: life '40 ☠0' in the top bar (P41-C03, 60×19 px), turn/priority at 12 px, 'Opening hands' pill |
| F-085 | pending_verification | CH-16, CH-48 | 'Actions' appears three times with three meanings: the left panel title, the top-right 'Actions' button (which toggles that panel), and 'All actions' inside it |
| F-086 | pending_verification | CH-42, CH-46 | 'Pass' is the big center control but disabled during the opening hand; Keep/Mulligan are 12 px rows in the side panel |
| F-087 | pending_verification | CH-41, CH-45 | Two icon-only edge toggles ('Toggle board tools', 'Toggle table panel') render at font-size 0 with no visible label |
| F-088 | pending_verification | CH-10, CH-14, CH-31 | Every action is a two-step (select, then Confirm) with an explanatory sentence each time |
| F-089 | pending_verification | CH-17 | Playable cards in hand get a green outline, but the side-panel option list is the only place the action is named ('Play Mountain ×2') |
| F-090 | pending_verification | CH-53 | 'Settings' and 'Account & app settings' are two rows in the same menu |
| F-091 | pending_verification | CH-41, CH-42 | Collapsing the choices panel hides a pending decision behind a one-line note |
| F-092 | pending_verification | CH-34 | Sliders have 11 px labels and no value readout for Tilt/Zoom/Cards beyond the number; 'Appearance preview · this device' is unexplained |
| F-093 | pending_verification | CH-52 | Coach opens an empty chat with four prompt chips and a send box, but the Coach is a stub per AGENTS.md |
| F-094 | partially_verified_local | CH-86 | 'Game in progress · Rob · AI · Resume your table' is a small line inside the hero; the sidebar shows 'Game on · Turn 1 · Return' |
| F-095 | partially_verified_local | CH-59, CH-86 | 'Your record 0 0 0' and 'Recent games: Your completed games will appear here' are the only results surfaces; the game-over screen was not reachable in this walk |
| F-096 | partially_verified_local | CH-86 | Eleven fields with one required marker (Date); 'Finish', 'Your seat' default to 'Not recorded'; Bracket defaults to 2 regardless of the deck's bracket |
| F-097 | verified_local | CH-86 | Nothing in the form or after saving leads to a change: no 'dead card in hand → consider replacing' handoff |
| F-098 | pending_verification | CH-41, CH-42, CH-50 | Table view opens with the choices panel collapsed; the pending decision survives only as 'Actions · choice pending' in the top bar |
| F-099 | pending_verification | CH-50 | Hand strip legend 'Land 0/2 · Creature 0/2 · Instant 0/0 · Other 0/2' has no key, and the hand cards render at about 60 px |
| F-100 | pending_verification | CH-42, CH-50 | The central life dial (40 \| 40) is the most prominent element but reads as decoration: no labels, no turn or priority indicator attached |
| F-101 | pending_verification | CH-43 | Seat panels say 'AI · 40 ☠0 · Chulane, Teller of Tales · AI's hand · 7' and 'You · Rob · 40 ☠0 · Krenko, Mob Boss · Deciding'; the 3D view's seat headers use a different order and wording |
| F-102 | pending_verification | CH-43, CH-51 | Focus view hides the opponent entirely: no life, no board, no hand count for the AI seat |
| F-103 | pending_verification | CH-51 | No visible way to switch seats or leave Focus; the seat 'Focus' buttons from Table view are gone and the only exit is the Camera menu |
| F-104 | pending_verification | CH-51 | '0 mana open · land drop used' is the most useful status line on the board and it is 11 px in the corner |
| F-105 | partially_verified_local | CH-88 | There is no Admin panel. Production and staging both answer 404 to /api/admin/*, /api/me carries no admin flag, and no route or control named Admin exists; the only owner-gated control is 'Invite to CrankMagic' on staging |
| F-106 | verified_local | CH-88 | 'Profile' opens the Settings page, not a profile |
| F-107 | pending_verification | CH-02 | Two pill buttons above a 17-row menu: the menu now has three visual grammars (pills, grouped rows, theme list) |
| F-108 | partially_verified_local | CH-88 | Invite is a two-field form (Name, Email, Send) with no list of who has been invited, no state after Send, and no statement of what the invitee receives |
| F-109 | open | CH-87 | The Budget card lists 30+ deck rows with Budget / Cost / Counts and dominates the right column above AI Coach, Data and the Danger zone |
| F-110 | verified_local | CH-87 | 'Clear all data' is a one-click button with a caption ('Save a backup first.'); 'Delete account' asks for the typed address |
| F-111 | verified_local | CH-87 | 'Reduce motion' and 'Stop at every step of my turn' are buttons whose on/off state is not visible |
| F-112 | partially_verified_local | CH-53, CH-87 | Settings is reached from three places with three labels: 'Settings' (menu), 'Profile' (pill), 'Account & app settings' (board avatar menu) |
| F-113 | baseline_reconciled_local | CH-87 | The Confirmations dialog has no controls: 'Every step still asks before it acts.' plus a note |
| F-114 | verified_local | CH-87 | The 'Actions' row is disabled with no reason, and the drag handles promised by the caption are not visible in the matrix |
| F-115 | partially_verified_local | CH-87 | 'Saved view preferences' fills the history (11 of the first 13 rows) and 'Undo last change' would undo a view preference rather than a library change |
| F-116 | verified_local | CH-89 | The seven tours are the best onboarding surface in the app and the only door to them is a menu row 17 rows deep |
| F-117 | pending_verification | CH-10, CH-12 | A targets question shows no source → effect → target relationship: the desk draws the acting card and lists the targets as text buttons |
| F-118 | pending_verification | CH-30, CH-35 | Focusing an opponent's board is a 14 px-tall link ('View AI's board, 40 life', 1345×14) in Full view and 59×24 '⤢ Focus' buttons at 11 px in Table view; no pointer gesture on the board itself |
| F-119 | pending_verification | CH-41 | Side-pane modules have fixed heights; the only drag handle is the pane's width ('Actions and boards width: drag, or use the arrow keys', 12×797) |
| F-120 | pending_verification | CH-52 | The Coach header on main is about four times the height it needs ('CrankMagic Coach · Sees your board, hand and the table · turn 1'); production's is one 49 px line |
| F-121 | pending_verification | CH-52 | The four prompt chips are 11 px text in 26 px-tall targets; on main they are hidden altogether |
| F-122 | pending_verification | CH-41 | Module reorder in edit mode relies on a six-dot drag handle that is small and does not work well; the ↑ ↓ buttons already do the job |
| F-123 | pending_verification | CH-41 | Module headers are not toggles: collapsing a side-pane module is a separate 33×40 button at 12 px, and a collapsed module cannot be resized |
| F-124 | verified_local | CH-55 | Prepared: after the creature half resolves prepared, the option to cast the copy as its spell half is not offered (Studious First-Year) |
| F-125 | pending_verification | CH-20, CH-21, CH-22, CH-23, CH-24 | The block draft is blocker-first with text pairs ('Goblin #486 → Dream Stalker #475 · Remove'), a 'Clear this blocker' button, 'All block options' and one Confirm for the whole draft |
| F-126 | pending_verification | CH-13 | Target options name the card and append the controller as a suffix only for permanents that are not yours ('Smuggler's Copter (Keith's)'); nothing groups targets by player |
| F-127 | pending_verification | CH-10, CH-11 | During a targets question the desk's large image is the source card and the title repeats its name ('Reclamation Sage: choose one target …'); the affected card is only a text button, and a second Confirm / Clear step follows |
| F-128 | pending_verification | CH-32 | Identical lands render as separate cards on the battlefield; #878 stacks identical options only inside a question |
| F-129 | pending_verification | CH-33 | The lands / battlefield split within a board is fixed, while three other dimensions already drag (pane width, boards' widths, hand size) |
