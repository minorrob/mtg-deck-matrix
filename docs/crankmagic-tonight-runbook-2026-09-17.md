# CrankMagic Online — Tonight Runbook (2026-09-16)

Checkout: `commander-phase-c` @ `codex/phase-c-qa`  
**Do not merge/checkout draft PR #246 tonight.**

## Preferred start
1. Double-click Desktop: **CrankMagic Online - Start Game**
   (`…\Magic the Gathering\CrankMagic Online - Start Game.lnk` → `launch-crankmagic-online.ps1 -RemoteGuests`)
2. Wait for green **Ready to play** (local host + guest gateway). Yellow = local OK but no guest link → stop when idle, restart shortcut.
3. **Open Play** if needed → `http://127.0.0.1:8768/app/#game`
4. Game setup → humans/AI → Prepare decks → **Open lobby** → **Email invitation** per seat
5. Friends: HTTPS invite → claim → deck → **Ready** → shared **10s** countdown → Enter game
6. Rematch: everyone **Yes, play another game** → decks → Ready again. **Do not** stop host between games.
7. Done: End game · keep journal (or Close table) → then stop:

```powershell
cd "C:\Users\robmi\OneDrive\Documents\My Games\MtG\work\commander-phase-c"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\stop-crankmagic.ps1"
```

## PowerShell fallback
```powershell
cd "C:\Users\robmi\OneDrive\Documents\My Games\MtG\work\commander-phase-c"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\game\tools\launch-crankmagic-online.ps1" -RemoteGuests
```

Fresh tunnel before friends → re-send invites after any remote restart. Never Task-Manager-kill mid-match.
