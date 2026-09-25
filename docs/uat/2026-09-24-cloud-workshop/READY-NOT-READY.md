# Ready / Not ready — CrankMagic.com workshop · 2026-09-24

**Tip:** `8e9ddfd · 2026-09-24` · **Play meta:** coming-soon · **Accounts meta:** on  
**UAT:** zero-code cloud workshop (not Play board). Deck created: `UAT-CW-2026-09-24-Atraxa`.

## Ready

- **Deck building (desktop):** New deck wizard (Create → commander → Create draft), deck list/detail, Edit card list CTA, Import path from wizard, backup download.
- **Library (desktop + mobile):** Library / To buy / Orders tabs; List / Sheet / Table; Add cards / Add copies (Owned); empty-state honesty.
- **Explore entry (when settled):** Chooser with From a deck gap / commander / card + role chips; catalog claim **31,830 cards**.
- **Accounts optional for workshop create:** Guest/local persistence works without signing in; Cloudflare Access login is available from Menu when cloud account is desired.
- **Play honesty:** `#game` clearly **Coming Soon** (not presented as a live board) — appropriate for this deploy.
- **Cross-cutting:** Deploy meta accurate; hash deep links; history/reload; US English chrome spot-check clean; theme toggle present.

## Not ready

- **Mobile deck-detail action chrome:** Sticky/bottom actions **clip** (e.g. Log a game) at ~390×844 — not workshop-production-ready on phone until overflow is fixed.
- **Explore deep graph under cold load:** Co-play ~20 MB fetch can blank the page; scoped graph inspect not production-reliable until load/empty states are tighter.
- **Play / multiplayer / Forge / lobby gameplay:** Out of scope and correctly Coming Soon — **not ready** (and not claimed ready).
- **Misleading “Import a backup” empty CTA:** Restores backup rather than importing a decklist — fix label or action before calling empty-state CTAs workshop-polished.
- **Lab / Measure / full More-menu / export depth:** Present but not fully proven end-to-end in this pass — treat as **partial**, not certify as done.
- **Account-dependent cloud sync features:** Not validated (no credentials); do not claim multi-device sync ready from this UAT.
