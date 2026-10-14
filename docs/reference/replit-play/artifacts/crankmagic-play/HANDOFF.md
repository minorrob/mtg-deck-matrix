# CrankMagic Play — frontend prototype handoff

Frontend only. Every frame is synthetic or recorded (`src/data/sample-views.json`). It makes no calls to a CrankMagic server and fetches no card images.

## Design
- **Look:** airy modern fantasy. Theme "Moss & Iron" (the default): pale lichen air, iron ink, verdigris primary, chartreuse lichen accent, brass highlights.
- **Other themes:** Brass & Slate, Felt & Cream, Steel & Cobalt. Each is a `[data-theme]` block in `src/index.css`.
- **Fonts:** Fraunces for display, Outfit for body, Barlow Condensed for callouts, JetBrains Mono for numbers.
- **Seat colors:** teal, coral, iris, saffron.

## Routes
- `/` Play home: Resume/Demo, New table, Rematch, 12 open tables in 4 access states with a detail card, chat, Standing (stub), game history.
- `/lobby`: quadrants laid out 2·3 over 4·1, with you at bottom right. Also: color fan, deck/mat/invite/AI pickers, host rules Edit, and a 10 s auto countdown the host can cancel. There is no Launch button, the host seat starts, and the die is decorative.
- `/game`: the demo script by default.
- `/spectate/:id`: the spectator projection.

## Architecture
- **The seam:** `src/game/adapter.ts` `RoomAdapter { subscribe, send }`. `MockRoomAdapter` adds the prototype controls: loadFixture, loadScenario, tableAction, simulateDisconnect/Away/Stale/EngineFailure, and a frame log.
- **Validation (mock):**
  - 409 for a stale revision, with the text "The board changed. Review the refreshed choice and try again."
  - 409 for the wrong decision.
  - 400 for malformed answers (bad index, wrong count for one/order, amounts length).
  - 422 for many min/max, exclusiveBy, damage/amount totals, minEach, and lethal-before-trample.
- **Ordering:** history is normalized to newest-first (the sample is oldest-first). Views with a lower revision are ignored unless the source was swapped (`adapter.epoch`).
- **Playback:** a recorded fixture advances to the next recorded view on any accepted answer, labeled "Playback · recorded view n of N".
- **Demo script:** `src/game/demo-script.ts`, flagged `__synthetic` and shown with a banner.
- **Synthetic scenarios:** `src/game/synthetic.ts`. The Tools › Scenarios & callouts picker can fire every callout kind.

## Fields consumed
- `seat`, `seatId`, `revision`, `status`, `result{winner,reason,endedBy}`, `departures`, `seats[]{seatId,name,pilot}`, `waitingOn`, `continuing`, `stepByStep`, `yourTurn`, `history[]{turn,text,mark}`
- `decision{id,title,mode,min,max,kind,cost,options[],exclusiveBy,requires,capped,budget,total,minEach}`
- options: `index,label,cardId,act,detail,defenderId,endsTurn,hostile,lean,count,lethal,defender,targets`
- `state{turn,turnPlayerId,priorityPlayerId,phase,players[],combat,stack[],gameOver}`
- players: `playerId,name,health{life,poison,status,lossReason,commanderDamageMax,commanderDamage},counters,mana[],landsPlayed,zones{count,hiddenCount,cards[]}`
- cards: `cardId,name,faceDown,faceDownName,tapped,damage,counters,types,power,toughness,keywords,commander,commanderKey`

## Stubs and their data shapes
- **Open tables and history:** `src/data/home.ts`. `OpenTable{id,host,name,access:'open'|'friends'|'invite'|'full',seats[],bracket,pace,started,turn?,spectators,note}` and `PastGame{id,when,result,turns,deck,seats[]}`.
- **Chat:** `src/state/chat.tsx`, in memory. `ChatMessage{id,at,from,seat,spectator?,text,emote?}`. Lobby and game share it.
- **Coach:** canned tips derived from the view. "Show me" lights the cards it names.
- **Standing:** static numbers.
- **Draw odds:** a stub because the view has no library composition.
- **Sound:** synthesized with WebAudio and silent until the first user gesture.
- **Away and reconnect:** an `away` InMessage `{seatId, until}`. Reconnect backs off 1 s, 2 s, 4 s (doubling, capped at 10 s), then sends `{type:'view'}`.
- **Table actions:** `POST /table/concede` and `/table/end-for-everyone` are assumed endpoints. The mock produces a finished view with `result.endedBy`.
- **Spectator:** `spectatorProjection()` sets `__spectator` and empties Hand, Library, Graveyard and Exile, keeping counts only. A spectator never acts.

## Discrepancies with the anchor/brief
- The sample history is oldest-first, so it is normalized (the anchor says newest-first).
- The sample has no damage, amount or ack decisions. Those are synthetic shapes.
- Draw is not a protocol option. Drawing shows up only as a view change and plays a flight.
- The anchor says no spectators. The spectator view is a synthetic stub because the brief asks for it.
- Tokens, attachments, summoning sickness and card colors are not in the view and are not shown. The lobby color fan is cosmetic.
- The camera walk runs about 360 ms, over the brief's 250 ms cap, because a shorter walk read as a cut on a large board. Deliberate.

## Animation durations (each with its reduced-motion fallback)
Reduced motion comes from the setting OR the OS preference. Under reduced motion, CSS durations become 0, framer runs with `reducedMotion="always"`, and flights are disabled.

| Motion | Duration | Reduced motion |
|---|---|---|
| Seat board swap (shared `layoutId`) | 360 ms | Instant |
| Hand → mat flight | 180 ms | No flight |
| Draw / scry / other zone moves | 220–240 ms | No flight |
| Moves to graveyard | Same, plus an 18° tilt | No flight |
| Reveal flip | 60% of the flight | No flip |
| Callout entrance | Spring, about 320 ms | Appears instantly |
| Callout exit | 150 ms | Instant |
| Callout hold | 0.9–1.9 s, scales with the intensity slider | Unchanged |
| Active-light crossfade | 600 ms | Instant |
| Tapped tilt | CSS transition | Instant |

Callouts never stack more than 3 deep.

## Keyboard
| Key | Action |
|---|---|
| N / Space | The one button |
| H | Show/hide hand |
| 1–4 | Look at that seat's board |
| C | Coach |
| L | Cycle layout |
| ? | Keyboard help |
| Esc | Back to your own board |
| Z on a card | Zoom |
| Arrows on a divider | Resize; Enter resets |

Shortcuts are ignored while typing.

## Licenses
- **Card images:** the four supplied placeholders, shown uncropped (object-contain, 5:7). Any other card name hashes to one of them and shows a "placeholder art" nameplate.
- **Mats:** generated for this project.
- **Icons and fonts:** Lucide icons (ISC). Fonts from Google Fonts (OFL).
- **Footer:** the Wizards Fan Content Policy notice.

## Unimplemented
- A real WebSocket adapter.
- Real Scryfall images.
- Drag-to-play: play is click/keyboard via options.
- Persistent chat.
- Real matchmaking and invites.
- Music.
- Coach AI.
- Card text: the view has no oracle text.
