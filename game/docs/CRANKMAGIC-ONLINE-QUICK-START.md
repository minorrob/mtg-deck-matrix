# CrankMagic Online — step-by-step walkthrough

Use this checklist to start a game without Codex.

## 1. Start CrankMagic Online

### Desktop shortcut

Run this once to add **CrankMagic Online - Start Game** to your Desktop:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\install-crankmagic-desktop-launcher.ps1"
```

Double-clicking the shortcut starts the local host with remote guests enabled, opens Play in your default browser, and shows a green, yellow, or red connectivity result.

1. Open **Windows PowerShell** from the Start menu.
2. Run:

   ```powershell
   cd "C:\Users\robmi\CrankMagic\repo"
   ```

3. Choose one startup command:

   **Playing alone against three AI players:**

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\start-crankmagic.ps1"
   ```

   **Inviting friends over the internet:**

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\start-crankmagic.ps1" -RemoteGuests
   ```

4. Wait until PowerShell displays:

   ```text
   Ready: http://127.0.0.1:8768/app/#game
   ```

5. Open [CrankMagic Online](http://127.0.0.1:8768/app/#game) in Chrome or Edge.

   Opening the host root `http://127.0.0.1:8768/` automatically redirects to the live game setup. Recorded match reviews are available at `/review` when a saved match exists.

   **Note:** These `127.0.0.1` URLs are for the host only. Guest invitations use a different HTTPS origin with `#table={tableId}&invite={token}` format.

Forge starts automatically when the table launches. Do not start Forge separately.

## 2A. Start a solo game against three AI players

1. Select **Game setup**.
2. Set **Human players** to **1**.
3. Set **AI players** to **3**.
4. Set the bracket and maximum deck cost.
5. Choose your CrankMagic deck.
6. Configure each AI seat:
   - Choose its commander/deck or select random commander.
   - Choose its play style and difficulty.
   - Select **OpenAI** and **GPT-5 Mini** for the normal API-powered opponent, or native Forge AI for a seat that should not use the API.
7. Select **Prepare decks**.
8. Resolve any blocking legality, budget, or deck warnings.
9. Select **Launch game**.
10. Wait for Forge and the browser table to finish loading.
11. Choose **Keep** or **Mulligan** for your opening hand.
12. Play from the browser. The three AI players take their turns automatically.

The OpenAI key is read from the Windows Credential Manager entry `crankmagic_openai_api`; you do not paste it into the browser.

## 2B. Start a game with friends

Friends need only a current web browser. They do **not** install Cloudflare, CrankMagic, Forge, Java, or an extension.

1. Confirm you used the `-RemoteGuests` startup command.
2. Select **Game setup**.
3. Set the number of human and AI seats. Example: **2 humans** and **2 AI players**.
4. Set the bracket and maximum deck cost.
5. Choose your deck and configure every AI seat.
6. Select **Prepare decks**, then **Open lobby**.
7. For each friend:
   - Enter their email address beside the reserved human seat.
   - Select **Email invitation**.
   - Review the prepared message in your default email app and press **Send**.
8. Each friend clicks their private HTTPS link, claims the seat in their browser, chooses or uploads a deck, validates it, and selects **Ready**.
9. Mark yourself ready if the lobby asks you to do so.
10. When every human is ready, wait for the shared five-second countdown.
11. Forge launches automatically. Each person selects **Enter the game** and keeps or mulligans their private opening hand.

Keep the host computer on and connected for the whole match. Each invitation is private, single-use, and expires after about four hours.

**Guest URLs:** Guest invitation links have the format `{guestOrigin}/#table={tableId}&invite={token}` where `{guestOrigin}` is the temporary HTTPS tunnel address (e.g., `https://xyz.trycloudflare.com`). Guests use **only** these complete invitation links. Bare paths like `/app/#game` on the guest origin correctly return 404.

## 3. Basic play controls

1. Double-click **Library** when the draw phase asks you to draw.
2. Drag a land, spell, or commander onto your mat to play it.
3. CrankMagic selects and taps legal mana sources automatically when casting.
4. Use the phase control to advance through your turn.
5. Use **Tracker**, **History**, and **Combat** to inspect mana, triggers, actions, blockers, and damage.

## 4. Shut down cleanly

1. If a game is active, select **Game setup**.
2. Select **End current game**.
3. Select **End game · keep journal** to confirm.
4. If the lobby is still choosing decks, use **Close table** instead.
5. Close the game browser tabs.
6. Open Windows PowerShell and run:

   ```powershell
   cd "C:\Users\robmi\CrankMagic\repo"
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\stop-crankmagic.ps1"
   ```

7. Wait for:

   ```text
   CrankMagic Online and its guest tunnel are stopped.
   ```

Do not terminate Node, Java, Forge, or cloudflared in Task Manager during a match. Closing only the browser leaves the table running so players can reconnect.

The `-ExecutionPolicy Bypass` option applies only to that one PowerShell process. It does not weaken or permanently change the computer's execution policy.
