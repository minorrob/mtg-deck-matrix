---
name: start-crankmagic
description: Start or recover the local CrankMagic Online rules host and open its Play screen, including a failed localhost deck handoff. Use when the user wants to launch their Commander game from CrankMagic.
---

# Start CrankMagic

Find the CrankMagic checkout containing `game/tools/start-crankmagic.ps1`. If installed with `references/local-install.md`, read it for the local checkout path.

1. Run `game/tools/start-crankmagic.ps1` from that checkout. It keeps a healthy existing host and starts a hidden persistent process otherwise. Do not replace a running game or kill a process just to free the port.
2. Verify `/api/health` identifies CrankMagic Online protocol 1. Read `/api/live` to distinguish a running game from an empty host. If startup fails, read the specific error log printed by the helper and repair the cause; do not keep opening a broken localhost URL.
3. Open `http://127.0.0.1:8768/app/#game` with browser tools. If the user is transferring a saved deck from the public app, return to that tab and use **Check again → Continue to game** so its fresh, expiring handoff preserves the selected deck. Do not reuse an old `#handoff` URL.
4. Verify setup or the existing live table is visible. The host launches the installed Forge runtime when **Launch game** is pressed; the user does not need to start Forge separately.

The prepared engine and JDK paths are documented in `game/README.md`. This workflow starts existing software, not a cloud service or an API subscription. Never print session tokens, private hands, or AI keys. Keep diagnostics in ignored `game/.local/host/`. If an older host occupies the port, inspect its live status and explain the need to finish or explicitly end that game before restarting it.
