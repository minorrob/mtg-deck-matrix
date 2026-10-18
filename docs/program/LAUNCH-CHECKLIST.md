# The launch checklist: what "100% done with the initial launch" means (draft for Rob's approval, ROB-137)

*Rob holds Oathbreaker and Standard "until we are 100% done with initial launch of CrankMagic." This is the finish
line, one line per outcome, in his words first and the evidence second. Rob approves or edits the words; after
that a line changes only with his word. The readout (`docs/readout/index.html`) shows these ten lines with each
one's progress; the same text is `launch_line` in `docs/readout/north-star.json`.*

| # | Outcome, in Rob's words | Done when (the evidence) | Owner |
| --- | --- | --- | --- |
| 1 | Play any deck legal in Commander in the Play screen | A legal list pasted from anywhere seats at a table with every card playable, or the lobby names the exact cards that cannot and why (ROB-103, ROB-104); the six live decks have per-card regression coverage green on every engine PR (ROB-94); the card load program's steps 1 to 5 are live on staging (ROB-86 to ROB-91). | Claude · Engine |
| 2 | The game in Play is an exceptional Commander play experience | Four humans play a full game from invitation to result on desktop and phone, proven by the journeys and a live playtest Rob attends: one header and Camera (ROB-99), clear priority and stack (ROB-23), Draw card (ROB-24), source-selection payment (ROB-25), shared combat (ROB-26), Yield turn (ROB-28), the 3D cards and the chosen table design on the live board (ROB-52, ROB-100), music (ROB-45); the game has its name (ROB-139). | Codex · Play; Claude · Engine |
| 3 | Managing my library is seamless, easy to follow, and fast | Add cards by paste, photo or scan in seconds (ROB-105); one search finds any card, box or deck (ROB-106); every row says where the card is in plain words (ROB-107); measured fast on a phone at 10,000 lots and held by a suite (ROB-108). | Codex · Workshop |
| 4 | Creating Commander decks is fast and reasonable from my criteria | Playstyle, budget, bracket, optional commander and colors in; a legal, on-budget, compliant hundred out in under three seconds with a reason per slot (ROB-109, ROB-110, ROB-111); the reasonableness report published and within tolerance (ROB-112). | Claude · Deck intelligence; Codex · Workshop |
| 5 | Tuning is comprehensive and ordered: solid simulations, composition, synergies and chains | The Tune tab walks measure, composition, synergies, swaps, re-measure (ROB-113); composition against targets (ROB-114); synergies and one-card completions (ROB-115); every swap with evidence and measured gain (ROB-117); the simulator and the rules engine agree within the published tolerance, variance on every score (ROB-116). | Claude · Deck intelligence; Codex · Workshop |
| 6 | Buying balances speed, print and cost by my priorities | The priority dial reorders the buy list and the Order export (ROB-118, ROB-119); one order across decks with arrivals to the right box (ROB-120); prices dated, refreshed on a schedule, stale marked (ROB-121). | Codex · Workshop; Claude · Deck intelligence |
| 7 | CrankMagic tailored to me | Deck preferences saved once and honored by the builder and the advisor (ROB-122, ROB-123); play preferences honored by the table (ROB-124); the information dial on every screen (ROB-125); the look chosen by its look (ROB-126, ROB-100); preferences travel with the account (ROB-127); profile and sign-in polish (ROB-38 to ROB-41). | Codex · Workshop; Codex · Play |
| 8 | AI in action | Every signed-in player can ask for a deck's strategy and SWOT (ROB-128), coaching at the table (ROB-56, ROB-129), upgrades with evidence (ROB-130) and card resolution (ROB-131); every answer labeled, sourced and under Rob's caps (ROB-132); the door open on staging and production (ROB-95). | Claude · Deck intelligence; Claude · Engine |
| 9 | Easily share deck builds | One Share action on every deck: link, email, text, QR (ROB-133); the public deck page and import from a link (ROB-134); Share Library proven live (ROB-37); mail delivery observable (ROB-69). | Codex · Workshop |
| 10 | A joyful experience end to end | A first-time player goes from an empty library to a first game in under ten minutes (ROB-135); test cases for every journey (ROB-27) and budgets held by suites (ROB-136, ROB-67); instrumentation and the tools record in place (ROB-64, ROB-65, ROB-58); this checklist ticked with evidence and Rob's go. | Grok; every workstream; Rob |

**Not in the initial launch:** Oathbreaker and Standard (P-ROB-11); voice chat (ROB-55); the Supabase migration
(ROB-68 is an evaluation only).

**How a line gets ticked:** the owner posts the evidence on the issues the line names, marks them Done in Linear,
and updates its feed; the readout turns the line's bar full. Rob's go on the whole list is the launch.
