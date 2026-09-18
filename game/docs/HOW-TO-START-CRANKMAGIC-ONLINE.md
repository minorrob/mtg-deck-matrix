# How to start CrankMagic Online

This is the tested Windows startup path. Codex is not required.

The release proof covers a four-seat table with two humans and two GPT-5 Mini players: remote HTTPS invitation redemption, independent guest deck selection and validation, the shared countdown, automatic Forge launch, separately scoped seven-card hands, matching public table state, and clean journal-preserving shutdown.

## First-time checks

### Host URLs

When you start the host, these URLs become available **for the host only**:

- **Host root** `http://127.0.0.1:8768/` — automatically redirects to the live game setup
- **Live game setup** `http://127.0.0.1:8768/app/#game` — the primary entry point for hosting and playing
- **Recorded review** `http://127.0.0.1:8768/review` — view a saved match recording (only when available)

**CRITICAL: Guest invitations are different.** Do not share these local `127.0.0.1` URLs with guests. Guests use **only** the private HTTPS invitation links created from your lobby. Each invitation has the format:

```
{guestOrigin}/#table={tableId}&invite={token}
```

The guest tunnel origin (e.g., `https://xyz.trycloudflare.com`) serves **only** invitation links with the `#table=…&invite=…` format. Paths like `/app/#game` on the guest origin correctly return 404 and must not be used by guests.

CrankMagic Online is already prepared in:

```text
C:\Users\robmi\CrankMagic\repo
```

The Forge rules engine and Java runtime are installed beside the project, at `C:\Users\robmi\CrankMagic\forge` and `C:\Users\robmi\CrankMagic\runtime\jdk-17.0.20.1+1`, and are found through the user-level environment variables `CRANKMAGIC_FORGE_ROOT` and `CRANKMAGIC_JDK_ROOT`. You do **not** need to start Forge yourself; CrankMagic launches it when you launch a table.

For API-powered opponents, Windows Credential Manager must contain a **Generic credential** named:

```text
crankmagic_openai_api
```

The password/value is the OpenAI API key. The username is only a label. The key stays in Windows Credential Manager and is never placed in the page, URL, game log, or deck export. GPT-5 Mini is the default model; GPT-5 is the optional stronger model.

## One-time setup on the host computer only

Your friends do **not** install Cloudflare, CrankMagic, Forge, Java, or any browser extension. They only open their private HTTPS invitation in a normal browser.

Install Cloudflare's tunnel client once from Windows PowerShell:

```powershell
winget install --id Cloudflare.cloudflared
```

The tunnel exposes only the restricted guest gateway. CrankMagic's admin/setup service, API key, private host controls, and local game files remain bound to this computer.

## Start after turning on the computer

1. Open **Windows PowerShell** from the Start menu.
2. Run these two commands:

   ```powershell
   cd "C:\Users\robmi\CrankMagic\repo"
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\start-crankmagic.ps1" -RemoteGuests
   ```

3. Wait for this message:

   ```text
   Ready: http://127.0.0.1:8768/app/#game
   ```

4. The command also prints a temporary HTTPS **Remote guest invitations** address. Open [CrankMagic Online](http://127.0.0.1:8768/app/#game) in Chrome or Edge. You can close PowerShell after both addresses appear; the host and guest tunnel keep running in the background.

Running the startup command again is safe. It retains a healthy host and any active table instead of starting a duplicate or discarding a game.

## Start a game

1. Open **Play** and then **Game setup**.
2. Set the bracket, deck-price cap, human-player count, and AI-player count.
3. Choose your deck. Each AI seat can use a saved CrankMagic deck, a preloaded variation, a Deck Lab build, or a supported public Archidekt deck.
4. For API-powered seats, select **OpenAI** and keep **GPT-5 Mini** unless you specifically want GPT-5. Native Forge AI remains available without an API key.
5. Select each AI commander's deck or choose random commander selection.
6. Select **Prepare decks**. Resolve any legality, budget, or unsupported-card warnings shown by setup.
7. Select **Launch game**. CrankMagic starts Forge automatically, shuffles each 99-card library from a fresh seed, and opens the table.
8. Keep or mulligan your opening hand. During play:
   - Double-click **Library** for a pending draw-step draw.
   - Drag a land, spell, or commander onto the appropriate area of your mat.
   - Legal mana sources are chosen and tapped automatically when casting.
   - Use the phase control to move through your turn.
   - Use **Tracker**, **History**, and **Combat** for mana, triggers, actions, blockers, and damage details.

If CrankMagic opens an existing table, choose **Return to game** to resume it. To deliberately replace it, use **Game setup → End current game**, then configure the new table. Ending a game is final and should only be used when you no longer need that position.

## Play alone against three AI players

Solo play is ready to use. It does not need the remote-guest tunnel, so you can start the local host with:

```powershell
cd "C:\Users\robmi\CrankMagic\repo"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\start-crankmagic.ps1"
```

Then open [CrankMagic Online](http://127.0.0.1:8768/app/#game) and:

1. Open **Game setup**.
2. Set **Human players** to **1** and **AI players** to **3**.
3. Choose your deck, bracket, and maximum deck cost.
4. For each AI seat, choose its commander/deck or select the random commander option. Set its play style and difficulty independently.
5. Select **OpenAI** and **GPT-5 Mini** for API-powered opponents. The app reads `crankmagic_openai_api` from Windows Credential Manager; the key is not sent to the browser. Use GPT-5 only when you want stronger reasoning at higher cost. You can instead select native Forge AI for seats that should not use the API.
6. Select **Prepare decks**. Review any budget, legality, or native-AI compatibility messages and resolve blocking issues.
7. Select **Launch game**. CrankMagic starts Forge, applies a fresh random seed to every 99-card library, seats all three AI players, and opens your board.
8. Keep or mulligan your opening hand, then play from the browser. The AI seats take their turns automatically at the selected difficulty; required human choices and response windows appear in the game UI.

When the game ends, save the match feedback and deck report if prompted. For an early stop, use **Game setup → End current game → End game · keep journal**, then run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\stop-crankmagic.ps1"` from the repository folder.

## Set up a four-player game and email the invitations

1. In **Game setup**, choose the total mix you want. For two people and two bots, select **2 human players** and **2 AI players**. You can instead use three or four human seats.
2. Choose the decks, AI controller, model, and difficulty, then select **Prepare decks** and **Open lobby**.
3. Each unclaimed human seat shows a QR code, private invitation link, and email-address field. Enter that friend's address and select **Email invitation**.
4. Your default email app opens a prepared message containing that seat's private link. Review it and press **Send**.
5. Your friend clicks the link in Chrome, Edge, Safari, or another current browser. No installation or Cloudflare account is required. The single-use link claims only that reserved seat, then disappears from the browser address. It expires after about four hours and should not be forwarded.
6. Each friend chooses or uploads their own deck and presses **Ready**. When every occupied human seat is ready, the shared five-second countdown begins and Forge launches the game.

The invitation screen clearly identifies local-only links. If an email button is disabled or a link starts with `127.0.0.1`, shut down cleanly and restart with `-RemoteGuests` before sending it. A new quick-tunnel address is created on each remote startup, so use invitations from the current lobby only.

## Quick troubleshooting

### The page says it cannot connect

Run the startup command again. If it reports that port 8768 or 8769 is occupied, do not kill the process blindly; another CrankMagic table may already be running. Open the Play URL first and inspect the existing table.

### OpenAI is unavailable in setup

Open **Credential Manager → Windows Credentials → Generic Credentials** and confirm the exact name `crankmagic_openai_api`. Update its password with the API key, then restart the local host. Native Forge AI can still be used while the API credential is unavailable.

### A saved-deck handoff expired

Return to the public CrankMagic tab, select the deck again, and use **Check again → Continue to game**. Handoff links are intentionally short-lived and should not be reused.

### Where diagnostics are stored

Startup logs are kept locally in:

```text
game\.local\host\
```

These files are ignored by Git. They can contain local runtime details and should not be shared publicly without review.

## Shut down cleanly

1. If a game is active, open **Game setup**, select **End current game**, then select the confirmation button **End game · keep journal**. This stops Forge, closes the table, revokes its seat invitations, and retains the local journal.
2. If players are still choosing decks or the table is waiting for a rematch, use **Close table** instead.
3. Close the game browser tabs.
4. In Windows PowerShell, run:

   ```powershell
   cd "C:\Users\robmi\CrankMagic\repo"
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\stop-crankmagic.ps1"
   ```

5. Wait for `CrankMagic Online and its guest tunnel are stopped.`

The stop helper refuses to terminate a live Forge match. If it reports an active game, return to the Play screen and use **End current game** first. Do not kill Node, Forge, Java, or cloudflared in Task Manager during a match; that leaves an interrupted position instead of a completed game record.

Closing only the browser intentionally leaves the host running so players can reconnect. Use the sequence above when the table is finished for the day.

The `-ExecutionPolicy Bypass` option applies only to the single startup or shutdown process. It does not permanently change the Windows execution policy.
