# SCREEN-INDEX — CrankMagic full wireframes 2026-09-24 · tip `8e9ddfd`

**Total screens:** 59

| ID | Title | Category | Group | Route / hash | Tags | Notes |
|---|---|---|---|---|---|---|
| `shell-dark` | App shell — dark theme | page | Shell | `#decks` | shipped, live | Brass & Slate default. Rail + job nav. |
| `shell-light` | App shell — light theme | page | Shell | `#decks` | shipped, live | Felt & Cream. Theme toggle in Menu. |
| `global-menu` | Global Menu | menu | Shell | `Menu` | shipped, live | Account, theme, backup, help, sign in. |
| `help-panel` | Help ? panel (page-scoped) | popup | Shell | `?` | shipped, live | Page-relevant help; closable. |
| `loading` | Loading / Opening your library | view | Shell | `settle` | shipped, live | Wait past this before judging empty (CW-XC-17). |
| `mobile-decks` | Mobile shell — Decks hub (~390) | page | Shell | `#decks` | shipped, live | Phone rail collapses to top row. |
| `mobile-library` | Mobile shell — Library (~390) | page | Shell | `#cards` | shipped, live | Tabs + sticky primary. |
| `mobile-explore` | Mobile shell — Explore chooser (~390) | page | Shell | `#discover` | shipped, live | Doors stack; roles wrap. |
| `mobile-deck-detail` | Mobile shell — Deck detail FIXED (~390) | page | Shell | `#decks?deck=` | planned | Sticky actions ROW fixed; UAT CW-MOB-02 clip annotated. |
| `decks-hub-empty` | Decks hub — empty | page | Decks | `#decks` | shipped, live | Honest empty; do not label restore as Import a backup. |
| `decks-hub` | Decks hub — with decks | page | Decks | `#decks` | shipped, live | Tiles grid; New deck primary. |
| `new-deck-chooser` | New deck — path chooser | view | Decks | `New deck` | shipped, live | Create / Import / Lab — Lab wizard-only. |
| `new-deck-create` | New deck — Create (commander) | view | Decks | `Create` | shipped, live | Commander search then Create draft. |
| `new-deck-import` | New deck — Import | view | Decks | `Import` | shipped, live | Paste/upload list; do not infer Owned. |
| `new-deck-lab` | New deck — Lab / Build from Commander | view | Decks | `Lab` | planned | Guided generation; wizard-only. |
| `deck-overview` | Deck detail — Overview | page | Decks | `#decks?deck=&tab=overview` | shipped, live | Commander art large, type bars, NEXT, action row + More. |
| `deck-hundred` | Deck · The hundred | view | Decks | `#decks?deck=&tab=hundred` | shipped, live | List/table of 100 slots. |
| `deck-upgrades` | Deck · Upgrades | view | Decks | `#decks?deck=&tab=upgrades` | shipped, live | Promote / decline swaps. |
| `deck-explore` | Deck · Explore (deck-scoped) | view | Decks | `#decks?deck=&tab=explore` | shipped, live | Deck-scoped loops / open Discover. |
| `deck-acquire` | Deck · Acquire | view | Decks | `#decks?deck=&tab=acquire` | shipped, live | Wanted / To buy for this deck. |
| `ready-to-add` | Ready to add | page | Decks | `#pull?deck=` | shipped, live | Owned copies ready to put in the box. |
| `make-the-change` | Make the change | page | Decks | `#change?deck=` | shipped, live | Commit adds/removes with receipt. |
| `edit-card-list` | Edit card list | view | Decks | `Edit card list` | shipped, live | Tune / add / swap from The hundred. |
| `deck-more-menu` | Deck options / More menu | menu | Decks | `More` | shipped, live | Measure, export, archive, delete, help. |
| `measure-report` | Measure report chrome | page | Decks | `Measure` | planned | Fidelity notice ABOVE score. |
| `log-a-game` | Log a game | popup | Decks | `Log a game` | shipped, live | Dialog: result, opponents, notes. |
| `export-print` | Export / print / backup-from-deck | popup | Decks | `Export` | shipped, planned | List export, print, deck-scoped backup. |
| `library-empty` | Library — empty | page | Library | `#cards` | shipped, live | Clear empty + Add cards path. |
| `library-list` | Library — List view | page | Library | `#cards?view=list` | shipped, live | Default ownership list. |
| `library-sheet` | Library — Sheet view | page | Library | `#cards?view=sheet` | shipped, live | Spreadsheet; numeric cells editable. |
| `library-table` | Library — Table view | page | Library | `#cards?view=table` | shipped, live | Dense table of same records. |
| `library-to-buy` | Library — To buy | page | Library | `#cards?tab=buy` | shipped, live | Shopping queue (not Wanted). |
| `library-orders` | Library — Orders | page | Library | `#cards?tab=orders` | shipped, live | In-flight orders. |
| `filters-dialog` | Filters dialog | popup | Library | `Filters` | shipped, live | Apply / clear filters. |
| `columns-dialog` | Columns dialog | popup | Library | `Columns` | shipped, live | Show/hide columns. |
| `add-cards` | Add cards / Add copies | popup | Library | `Add cards` | shipped, live | Search + qty + Owned status. |
| `card-popup` | Card popup | popup | Library | `Card` | shipped, live | Large readable art + text + actions. |
| `backup-dialog` | Backup dialog | popup | Library | `Back up now` | shipped, live | Download library backup. |
| `restore-dialog` | Restore dialog | popup | Library | `Restore` | shipped, live | Honest label: Restore backup — NOT Import a backup. |
| `explore-chooser` | Explore entry chooser | page | Explore | `#discover` | shipped, live | Deck gap / commander / card + roles. |
| `explore-graph` | Explore scoped graph | page | Explore | `#discover?deck=` | shipped, live | Canvas + inspect panel. |
| `explore-filters` | Explore filters / lens / roles | popup | Explore | `Filters` | shipped, live | Lens, roles, facets. |
| `explore-add-wanted` | Add / Wanted from Explore | popup | Explore | `Add and/or buy` | shipped, live | Functional or honestly gated. |
| `play-coming-soon` | Play — Coming Soon (live) | page | Play | `#game` | shipped, live | Honest Coming Soon shell. |
| `play-lobby` | Play setup / lobby (planned) | page | Play | `#game lobby` | planned | Seats, decks, prepare, invite. |
| `play-countdown` | Play countdown / readiness (planned) | view | Play | `countdown` | planned | Auto-launch when all ready. |
| `play-table` | Table / board chrome (planned) | page | Play | `table` | planned | High-level 2x2 mats, center counter. |
| `game-history` | Game history | page | Play | `History` | planned | Past games / log list. |
| `account-signin` | Account / sign-in entry | page | Accounts | `Account` | shipped, live | CF Access; guest local still works. |
| `settings` | Settings | page | Accounts | `Settings` | shipped, live | Theme, prefs if distinct from Menu. |
| `confirm-receipt` | Receipt / confirm dialog | popup | Dialogs | `Review` | shipped, live | Before destructive commits. |
| `toast-error` | Toast / error banner pattern | popup | Dialogs | `toast` | shipped, live | Transient success / error. |
| `empty-cta-honesty` | Empty CTA honesty patterns | view | Dialogs | `empty` | shipped, planned | No dead stubs; label restore honestly. |
| `library-more-menu` | Library More menu | menu | Dialogs | `More` | shipped, live | Import list, backup, columns, help. |
| `status-change-menu` | Status change menu | menu | Dialogs | `Status` | shipped, live | Owned / Reserved / To buy / Ordered / Bench. |
| `confirm-delete` | Confirm delete / clear | popup | Dialogs | `Delete` | shipped, live | Destructive confirm. |
| `commander-zoom` | Commander card zoom | popup | Dialogs | `zoom` | shipped, live | Full card art readable. |
| `invite-share` | Invite / share | popup | Dialogs | `Invite` | planned | Email / QR for Play seat. |
| `glossary` | Glossary | popup | Dialogs | `Glossary` | shipped, live | Wanted != To buy != Orders. |

## Counts

### By category

- **menu**: 4
- **page**: 26
- **popup**: 17
- **view**: 12

### By group

- **Accounts**: 2
- **Decks**: 18
- **Dialogs**: 9
- **Explore**: 4
- **Library**: 12
- **Play**: 5
- **Shell**: 9

## Required coverage checklist

All mandated categories from the brief are present: Shell/chrome (incl. mobile FIXED sticky row),
Decks (hub empty/with, wizard Create/Import/Lab, Overview + five tabs, Ready to add, Make the change,
Edit, More, Measure, Log a game, Export), Library (empty, List/Sheet/Table, To buy, Orders, Filters,
Columns, Add cards, Card popup, Backup, Restore honesty), Explore (chooser, graph, filters, Add/Wanted),
Play (Coming Soon live + planned lobby/countdown/table + history), Accounts/system (sign-in, Settings,
receipt, toast/error, empty CTA honesty), and explicit menus/popups (More, status, delete, commander zoom,
invite/share, glossary).
