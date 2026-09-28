# Who can sit at a table (M5)

Rob, 2026-09-26 (`docs/decisions-2026-09-25.md`, M5): **Play is for the accounts' invite list.** A table's link
seats someone only if the address they sign in with is on that list, and **the link never adds anyone to it.**
Someone who is not on it is **refused with instructions**: they are told to ask Rob to add them.

## How it works

- The list is the **Invited** policy of the Cloudflare Access application **"CrankMagic accounts"**
  (`crankmagic.com/api/*`). Adding someone is Rob's: add their email address to that policy
  (`docs/plan-account-cloud.md`).
- A table's link is `https://crankmagic.com/#table/<id>/<code>`. Opening it calls `/api/tables/<id>/join`, which
  Access guards. Someone signed out is asked to sign in; someone whose address is not on the list is stopped by
  Access, which shows its block page.
- **`not-invited.html`** is that block page's words: you're not on the list; ask the person who sent the link to
  ask Rob to add the address you signed in with (or write to admin@crankmagic.com); once added, open the same
  link again; wrong address, sign out. It is published with every release (a root in `tools/release-pages.mjs`).

## Rob's step: send Access's refusals to that page

In the Cloudflare dashboard (dashboard-only; nothing here is a secret):

1. **Zero Trust → Access → Applications → "CrankMagic accounts" → Configure** (Edit).
2. Find the application's **block page** setting (under its experience or appearance settings).
3. Choose **Redirect URL** and enter `https://crankmagic.com/not-invited.html`. Save.
4. Check it: in a private window, open any table link and sign in with an address that is **not** on the Invited
   policy. The page above should appear.

If your plan offers only Cloudflare's own block page, keep it and set its message to:
"You're not on CrankMagic's invite list yet. Ask the person who sent you the link to ask Rob to add the address
you signed in with, or write to admin@crankmagic.com. A table's link never adds anyone to the list."

Nothing about this is deployed until Play's release is, which waits on Rob's go (staging first).
